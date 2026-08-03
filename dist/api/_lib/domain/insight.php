<?php
declare(strict_types=1);

/**
 * Level 7 — a panel of analysts, not a summariser.
 *
 * Levels 1–6 compute. They say what happened, to whom, how big the difference
 * is and whether it survives a test. What they cannot do is the thing a good
 * analyst does with the same table: notice that two panels disagree, name the
 * mechanism that would explain both, say what to do on Monday, and say what
 * would prove them wrong.
 *
 * WHY A PANEL AND NOT ONE CALL. One model given one prompt produces one
 * confident story, and a confident story about children's attendance is exactly
 * the output that should not be trusted. So several analysts read the SAME
 * evidence through deliberately different lenses, on deliberately different
 * providers where the deployment has more than one key, and a separate pass
 * keeps only what at least two of them independently reached. A claim that one
 * model made and the others did not is reported as contested, not as insight.
 * The disagreement is the product.
 *
 * ── THE PRIVACY BOUNDARY ─────────────────────────────────────────────────────
 * Nothing about an identifiable child ever leaves this server. Not a name, not
 * an id, not a handle, not a guardian's contact, not a free-text note. The
 * analysts receive `insight_evidence()` — counts, rates, confidence intervals
 * and coded reasons — and that function is the ONLY thing that builds their
 * input. `insight_scrub()` is a second, independent pass over the encoded
 * payload that fails the whole run rather than send something that looks like a
 * name or an id, because a privacy control that depends on every future caller
 * remembering it is not a control.
 *
 * This matters more here than anywhere else in the codebase: these requests
 * leave the building, go to a third party, and may be retained by them. A child
 * cannot consent to that and their guardian was never asked.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────
 * A panel run is several completions. It is therefore NOT computed per page
 * view: it runs on demand or from the web-cron, is cached against a fingerprint
 * of the evidence, and returns the cached answer unchanged until the underlying
 * numbers move. An admin can force a re-run.
 */

/* The lenses. Each is a genuinely different question, not a rephrasing — a
 * panel of near-identical prompts is one analyst with extra steps and extra
 * cost. The `profile` is what routes each to its own provider/key when the
 * deployment has more than one, so "independent" means independent. */
const INSIGHT_ANALYSTS = [
    [
        'key' => 'mechanism', 'label' => 'What is causing this',
        'profile' => 'insight_mechanism',
        'brief' => 'You are looking for MECHANISM. For the largest differences in the evidence, name the '
                 . 'concrete operational cause that would produce exactly that pattern — a timetable, a '
                 . 'transport route, a term date, a class that is too full, a teacher absent. Prefer a '
                 . 'mundane logistical explanation to a motivational one. If two panels disagree, the '
                 . 'explanation that reconciles both is worth more than one that fits either alone.',
    ],
    [
        'key' => 'action', 'label' => 'What to do on Monday',
        'profile' => 'insight_action',
        'brief' => 'You are looking for ACTION. Propose changes a centre coordinator could make within a '
                 . 'week, with no new budget and no new staff. Each must name who does it, what changes, '
                 . 'and the number in this evidence that would move if it worked. Reject anything that '
                 . 'amounts to "increase engagement" or "improve communication".',
    ],
    [
        'key' => 'risk', 'label' => 'What this is missing',
        'profile' => 'insight_risk',
        'brief' => 'You are the SCEPTIC. Find where this evidence would mislead someone acting on it: '
                 . 'a rate resting on very few children, a comparison against a period that is not '
                 . 'comparable, a segment whose total hides two opposite groups, survivorship in a '
                 . 'retention curve. Say which specific number should not be acted on, and why.',
    ],
    [
        'key' => 'equity', 'label' => 'Who is being left behind',
        'profile' => 'insight_equity',
        'brief' => 'You are looking for EQUITY. Compare the segments against each other and against the '
                 . 'whole: which age band, sex or centre is doing materially worse, and is the gap big '
                 . 'enough to be real given the group sizes shown? A gap you cannot distinguish from '
                 . 'noise must be reported as such, not as a finding.',
    ],
];

/* The synthesis pass. Deliberately a separate call with a separate brief: its
 * job is to CUT, not to add. */
const INSIGHT_SYNTH_PROFILE = 'insight_synth';

const INSIGHT_MAX_CLAIMS   = 6;     // per analyst — a long list is a thinking-less list
const INSIGHT_CACHE_TTL    = 21600; // 6h; the fingerprint below invalidates sooner when numbers move

/* ── The privacy boundary ─────────────────────────────────────────────────── */

/**
 * Refuse to send anything that looks like it identifies a person.
 *
 * A belt to insight_evidence()'s braces, and deliberately paranoid: it runs on
 * the ENCODED payload, so it catches a field somebody adds later without
 * thinking about this file. Returns the list of reasons it would refuse —
 * empty means safe to send.
 */
/* Fields that may legitimately hold a calendar date: the reporting window and
 * the cohort/period labels. A date ANYWHERE ELSE is treated as a birthday,
 * because in a cohort of ten children a birthday identifies one of them as
 * surely as a name does. Allow-list rather than deny-list: a field added later
 * is refused by default, which is the direction this has to fail in. */
const INSIGHT_DATE_FIELDS = ['from', 'to', 'label', 'generatedAt', 'intake', 'cohort', 'week', 'day', 'range'];

/* Keys that carry a person, whatever the value happens to be today. */
const INSIGHT_PERSON_FIELDS = ['fullName', 'firstName', 'lastName', 'otherName', 'guardianName',
    'parentEmail', 'guardianPhone', 'email', 'phone', 'handle', 'studentId', 'volunteerId',
    'memberId', 'displayId', 'photoUrl', 'notes', 'reviewNote', 'dob'];

function insight_scrub(string $payload): array {
    $bad = [];
    /* Textual pass — identifiers and contacts, which are unambiguous wherever
     * they appear. */
    if (preg_match('/\b(SUM|NGG|VOL|PH|GL|PT|SUMQR)-[A-Za-z0-9-]{3,}/', $payload, $m)) $bad[] = 'a record id (' . $m[0] . ')';
    if (preg_match('/\bC\d+-\d{4}\b/', $payload, $m)) $bad[] = 'a student id (' . $m[0] . ')';
    if (preg_match('/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/', $payload)) $bad[] = 'an email address';
    if (preg_match('/(\+?234|\b0)[789]\d{9}\b/', $payload)) $bad[] = 'a phone number';

    /* Structural pass — walk the decoded payload so a date is judged by the
     * field it sits in. A flat regex for dates flagged the programme's own
     * reporting window, which is not a fact about any child; being merely
     * strict is not the same as being right, and a gate that cries wolf is one
     * somebody eventually loosens. */
    $walk = function ($node, string $key) use (&$walk, &$bad) {
        if (is_array($node)) {
            foreach ($node as $k => $v) $walk($v, is_string($k) ? $k : $key);
            return;
        }
        if (in_array($key, INSIGHT_PERSON_FIELDS, true)) { $bad[] = 'a ' . $key . ' field'; return; }
        if (is_string($node) && preg_match('/\b(19|20)\d{2}-\d{2}-\d{2}\b/', $node, $m)
            && !in_array($key, INSIGHT_DATE_FIELDS, true)) {
            $bad[] = 'a date in "' . $key . '" (' . $m[0] . '), which reads as a birthday';
        }
    };
    $decoded = json_decode($payload, true);
    if (!is_array($decoded)) {
        // Undecodable means unauditable. Refuse rather than send bytes nothing
        // has been able to inspect.
        $bad[] = 'a payload that could not be parsed for review';
    } else {
        $walk($decoded, '');
        // Keys are checked structurally above, but a person-field nested in a
        // string blob would slip past — so the flat check stays as a backstop.
        foreach (INSIGHT_PERSON_FIELDS as $k) {
            if (strpos($payload, '"' . $k . '"') !== false) $bad[] = 'a ' . $k . ' field';
        }
    }
    return array_values(array_unique($bad));
}

/**
 * Everything the analysts see, and nothing else.
 *
 * Built from the already-computed Level 6 depth output plus the centre-level
 * growth readiness — both of which are aggregates by construction. The
 * student-level growth index is deliberately NOT included: it is a score
 * attached to a named child, and no third party is getting that.
 */
/**
 * Average grade and attendance by sex, and the gap between them.
 *
 * One query, aggregated in PHP because the mean-of-means has to be a mean over
 * STUDENTS rather than over submissions — a child who submitted twelve pieces
 * would otherwise count twelve times, and the sex with more diligent submitters
 * would appear to be the sex that learns more.
 */
function insight_learning_by_sex(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return [];
    $centres = function_exists('analytics_centres') ? analytics_centres($g['requester'], trim((string)($p['centre'] ?? ''))) : [];
    $cNames = array_map(fn($c) => (string)$c['name'], $centres);
    if (!$cNames) return [];
    $in = '(' . implode(',', array_fill(0, count($cNames), '?')) . ')';
    $rows = db_all("SELECT s.studentId, s.sex, s.gender, AVG(sub.grade) g, COUNT(sub.id) n
                    FROM summer_students s
                    JOIN assignment_submissions sub ON sub.memberId = s.studentId
                    WHERE s.status = 'active' AND s.centre IN $in AND sub.grade IS NOT NULL
                    GROUP BY s.studentId, s.sex, s.gender", $cNames);
    $by = [];
    foreach ($rows as $r) {
        $k = sex_label($r);
        $by[$k] ??= ['sex' => $k, 'graded' => 0, 'submissions' => 0, '_g' => []];
        $by[$k]['graded']++;
        $by[$k]['submissions'] += (int)$r['n'];
        $by[$k]['_g'][] = (float)$r['g'];
    }
    // How many children of each sex exist at all, so "graded" can be read
    // against "enrolled" — 12 girls graded out of 130 is a coverage problem,
    // not a finding about girls.
    $enrolled = [];
    foreach (db_all("SELECT sex, gender FROM summer_students WHERE status = 'active' AND centre IN $in", $cNames) as $r) {
        $k = sex_label($r);
        $enrolled[$k] = ($enrolled[$k] ?? 0) + 1;
    }
    $out = [];
    foreach ($by as $k => $v) {
        $n = count($v['_g']);
        $out[] = ['sex' => $k, 'enrolled' => (int)($enrolled[$k] ?? 0), 'graded' => $n,
                  'submissions' => $v['submissions'],
                  'avgGrade' => $n ? round(array_sum($v['_g']) / $n, 1) : null,
                  // Marked, never merged away. A group this small cannot carry a
                  // claim, and saying so is itself the finding.
                  'tooThin' => $n < 5];
    }
    foreach ($enrolled as $k => $cnt) {
        if (!isset($by[$k])) $out[] = ['sex' => $k, 'enrolled' => $cnt, 'graded' => 0, 'submissions' => 0,
                                       'avgGrade' => null, 'tooThin' => true];
    }
    usort($out, fn($a, $b) => strcmp($a['sex'], $b['sex']));
    /* The gap, stated once rather than left for a reader to subtract — and only
       where both sides are thick enough to mean anything. */
    $m = null; $f = null;
    foreach ($out as $r) { if ($r['sex'] === 'Male') $m = $r; if ($r['sex'] === 'Female') $f = $r; }
    $gap = null;
    if ($m && $f && $m['avgGrade'] !== null && $f['avgGrade'] !== null && !$m['tooThin'] && !$f['tooThin']) {
        $gap = ['points' => round($f['avgGrade'] - $m['avgGrade'], 1), 'favours' => $f['avgGrade'] >= $m['avgGrade'] ? 'Female' : 'Male'];
    }
    return ['bySex' => $out, 'gap' => $gap,
            'note' => 'Mean of each student\'s own average, so a child who submitted twelve pieces counts once.'];
}

/**
 * The per-centre detail the evidence was missing: enrolment, the sex split,
 * how many are graded and their average, and how much activity was logged.
 *
 * Aggregate per SITE, never per child. Five or six centres, four small
 * aggregates each — cheap enough to build on every evidence read, and the
 * difference between "Ayobo is at 47%" and being able to say anything about
 * why.
 */
function insight_centre_detail(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return [];
    $centres = function_exists('analytics_centres') ? analytics_centres($g['requester'], trim((string)($p['centre'] ?? ''))) : [];
    $names = array_map(fn($c) => (string)$c['name'], $centres);
    if (!$names) return [];
    $in = '(' . implode(',', array_fill(0, count($names), '?')) . ')';

    $out = [];
    foreach ($names as $n) $out[$n] = ['enrolled' => 0, 'bySex' => ['Male' => 0, 'Female' => 0, 'Not recorded' => 0],
                                       'graded' => 0, 'avgGrade' => null, 'activities' => 0, 'evidenceItems' => 0];

    foreach (db_all("SELECT centre, sex, gender FROM summer_students WHERE status = 'active' AND centre IN $in", $names) as $r) {
        $c = (string)$r['centre'];
        if (!isset($out[$c])) continue;
        $out[$c]['enrolled']++;
        $out[$c]['bySex'][sex_label($r)]++;
    }

    // Mean over STUDENTS, not over submissions — otherwise a centre whose
    // children submit more looks like a centre whose children learn more.
    $g2 = [];
    foreach (db_all("SELECT s.centre, s.studentId, AVG(sub.grade) g
                     FROM summer_students s
                     JOIN assignment_submissions sub ON sub.memberId = s.studentId
                     WHERE s.status = 'active' AND s.centre IN $in AND sub.grade IS NOT NULL
                     GROUP BY s.centre, s.studentId", $names) as $r) {
        $g2[(string)$r['centre']][] = (float)$r['g'];
    }
    foreach ($g2 as $c => $vals) {
        if (!isset($out[$c])) continue;
        $out[$c]['graded'] = count($vals);
        $out[$c]['avgGrade'] = round(array_sum($vals) / max(1, count($vals)), 1);
    }

    /* Activity and evidence per site. A centre with no artefacts cannot be
       cited in a report, and that is a fact about the SITE — exactly the kind
       of thing somebody asks the analyst about. */
    $from = (string)($p['from'] ?? ''); $to = (string)($p['to'] ?? '');
    $hasRange = $from !== '' && $to !== '';
    $args = $names; if ($hasRange) { $args[] = $from; $args[] = $to; }
    foreach (db_all("SELECT centre, evidence FROM activities WHERE centre IN $in"
                    . ($hasRange ? ' AND date BETWEEN ? AND ?' : ''), $args) as $r) {
        $c = (string)$r['centre'];
        if (!isset($out[$c])) continue;
        $out[$c]['activities']++;
        $e = safe_json((string)($r['evidence'] ?? '[]'));
        $out[$c]['evidenceItems'] += is_array($e) ? count($e) : 0;
    }
    return $out;
}

/**
 * Children at the transition point, split by sex and class band.
 *
 * Grades 4–6 (lower to upper primary) and 7–9 (upper primary to secondary) are
 * where gender gaps in schooling widen, which is why the funds this programme
 * applies to scope eligibility to them. Coverage is reported alongside, because
 * "62% are in the window" computed over the quarter of children who have a
 * class on file is a number that would go into an application and be wrong.
 */
function insight_transition_window(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return [];
    $centres = function_exists('analytics_centres') ? analytics_centres($g['requester'], trim((string)($p['centre'] ?? ''))) : [];
    $names = array_map(fn($c) => (string)$c['name'], $centres);
    if (!$names) return [];
    $in = '(' . implode(',', array_fill(0, count($names), '?')) . ')';

    $bands = [];
    foreach (GRADE_BANDS as $b) $bands[$b['key']] = ['band' => $b['label'], 'transition' => $b['transition'],
                                                    'total' => 0, 'female' => 0, 'male' => 0, 'notRecorded' => 0];
    $recorded = 0; $inWindow = 0; $enrolled = 0;
    foreach (db_all("SELECT sex, gender, gradeLevel FROM summer_students WHERE status = 'active' AND centre IN $in", $names) as $r) {
        $enrolled++;
        $lvl = (int)($r['gradeLevel'] ?? 0);
        if ($lvl <= 0) continue;
        $recorded++;
        if (grade_in_transition($lvl)) $inWindow++;
        $k = grade_band($lvl)['key'];
        if (!isset($bands[$k])) continue;
        $bands[$k]['total']++;
        $sx = sex_label($r);
        if ($sx === 'Female') $bands[$k]['female']++;
        elseif ($sx === 'Male') $bands[$k]['male']++;
        else $bands[$k]['notRecorded']++;
    }
    return [
        'bands' => array_values(array_filter($bands, fn($b) => $b['total'] > 0)),
        'inWindow' => $inWindow,
        'classRecorded' => $recorded,
        'enrolled' => $enrolled,
        /* Coverage first, because it decides whether the number above it can be
           quoted at all. */
        'coveragePct' => $enrolled ? (int)round($recorded / $enrolled * 100) : 0,
        'note' => 'Transition windows are grades 4–6 and 7–9. Percentages are of children with a class on file, not of the roster.',
    ];
}

function insight_evidence(array $p): array {
    $depth = function_exists('analytics_depth') ? analytics_depth($p) : ['ok' => false];
    $ev = ['generatedAt' => now_iso(), 'range' => [], 'overall' => null,
           'centres' => [], 'segments' => [], 'weekday' => [], 'retention' => [],
           'learning' => [], 'transition' => [], 'computed' => []];
    if (empty($depth['ok']) || !empty($depth['depth']['empty'])) return $ev + ['empty' => true];
    $d = $depth['depth'];

    $ev['range'] = ['from' => (string)($d['range']['from'] ?? ''), 'to' => (string)($d['range']['to'] ?? ''),
                    'label' => (string)($d['range']['label'] ?? '')];
    $ev['overall'] = $d['period'] ?? null;
    /* Per centre: attendance AND learning AND the sex split, in one row.
     *
     * This block held attendance only, so a question about one site had a rate,
     * an interval and nothing to explain it with — and the router, reading a
     * hand-written sentence that called all of this "centre readiness",
     * repeatedly decided a centre question could not be answered at all. The
     * refusal was not wrong about the evidence it was shown; the evidence was
     * thin. */
    /* THE BUG BEHIND "the evidence does not hold centre-specific data".
     *
     * This read $d['centres']. Level 6 emits $d['perCentre'], and has since it
     * was written — so the loop iterated nothing and $ev['centres'] was ALWAYS
     * an empty array. The analyst's refusal was accurate; the payload really
     * did not have a single centre in it, which is also why every centre
     * question came back as unanswerable while the page above showed a table of
     * five sites.
     *
     * Nothing caught it because both sides looked right in isolation: depth
     * produced per-centre rows, insight consumed a per-centre key, and no test
     * asserted that the key on one side was the key on the other. The
     * assertions added with this fix check the contents, not the shape.
     *
     * The nested `ci` and `test` structures are flattened here rather than
     * passed through: a model reading {"ci":{"rate":47,"lo":31,"hi":63}} does
     * arithmetic on the wrapper as often as on the number. */
    $perCentreExtra = insight_centre_detail($p);
    foreach (($d['perCentre'] ?? []) as $c) {
        $name = (string)($c['centre'] ?? '');
        if ($name === '') continue;
        $ci = (array)($c['ci'] ?? []);
        $ev['centres'][] = ['centre' => $name,
                            'rate' => $ci['rate'] ?? null,
                            'ci' => [$ci['lo'] ?? null, $ci['hi'] ?? null],
                            'childDays' => $ci['opp'] ?? 0,
                            'children' => $c['students'] ?? 0,
                            'vsProgramme' => $c['vsProgramme'] ?? null,
                            'verdict' => (string)(($c['test']['verdict'] ?? '') ?: '')]
                          + ($perCentreExtra[$name] ?? []);
    }
    foreach (($d['crosstab']['rows'] ?? []) as $r) {
        $cells = [];
        foreach ((array)($r['cells'] ?? []) as $i => $c) {
            if (!$c) continue;
            $cells[] = ['column' => (string)(($d['crosstab']['columns'][$i] ?? '')), 'rate' => $c['rate'],
                        'childDays' => $c['opp'] ?? 0, 'children' => $c['children'] ?? 0,
                        'tooThin' => !empty($c['thin'])];
        }
        $ev['segments'][] = ['row' => (string)($r['label'] ?? ''), 'cells' => $cells];
    }
    foreach (($d['weekday']['centres'] ?? []) as $r) {
        $days = [];
        foreach ((array)($r['cells'] ?? []) as $i => $c) {
            if (!$c) continue;
            $days[] = ['day' => (string)($d['weekday']['days'][$i] ?? ''), 'rate' => $c['rate'], 'n' => $c['opp'] ?? 0];
        }
        $ev['weekday'][] = ['centre' => (string)($r['centre'] ?? ''), 'days' => $days];
    }
    foreach (($d['retention']['cohorts'] ?? []) as $c) {
        $ev['retention'][] = ['intake' => (string)($c['cohort'] ?? ''), 'size' => $c['size'] ?? 0,
                              'curve' => array_map(fn($x) => ['week' => $x['week'] ?? null, 'rate' => $x['rate'] ?? null, 'n' => $x['n'] ?? null],
                                                   (array)($c['curve'] ?? []))];
    }
    /* ── Learning, by sex ────────────────────────────────────────────────────
     * The evidence held attendance broken down every way and learning broken
     * down no way at all — so the analyst could say who turns up and never
     * whether they are learning the same amount once they do.
     *
     * That is the question serious education funding now turns on. A gender
     * programme that never measures learning and a learning programme that
     * never checks whether girls and boys get the same out of it are the two
     * halves of the gap; this block is the one figure that closes it for us.
     *
     * Aggregate by construction — counts and means per group, no child — so it
     * passes the same scrub as everything else here. Groups under five are kept
     * but MARKED, never silently merged: "we do not have enough girls graded to
     * say" is a real finding and hiding it would be the dishonest tidy-up. */
    $ev['learning'] = insight_learning_by_sex($p);

    /* The transition window, by sex. The single table an evidence fund's
       eligibility section is written against — grades 4–6 and 7–9 — and the
       one the analysts could not see at all. */
    $ev['transition'] = insight_transition_window($p);

    $ev['computed'] = array_map(fn($f) => ['severity' => (string)$f['severity'], 'title' => (string)$f['title']],
                                (array)($d['findings'] ?? []));

    /* Centre-level readiness only. growth_workspace also returns a per-CHILD
     * index with names attached; that is the single most sensitive thing this
     * codebase computes and it does not leave the server. */
    if (function_exists('growth_workspace')) {
        $g = growth_workspace($p);
        foreach (($g['growth']['centres'] ?? []) as $c) {
            $ev['centreReadiness'][] = ['centre' => (string)($c['centre'] ?? ''), 'score' => $c['score'] ?? null,
                                        'constraint' => (string)($c['constraint'] ?? ''), 'children' => $c['children'] ?? 0];
        }
    }

    /* WHO IS SLIPPING AWAY, as opposed to who attends badly.
     *
     * The evidence held rates and nothing else, so the analyst could describe
     * how much attendance there was and never that children were LEAVING. Those
     * are different questions with opposite answers: a cohort where everyone
     * comes three days a week and one where a third have stopped entirely can
     * report the same 62%, and only one of them is an emergency. Asked "is
     * anyone slipping away", the panel had no figure to reach for and said the
     * evidence could not tell.
     *
     * Counts only, per centre — never a child. `insight_attrition_counts` is
     * shaped to the same rule as everything else in this payload: it is about
     * groups, and no name, id or contact is in it. */
    $ev['attrition'] = insight_attrition_counts();
    return $ev;
}

/**
 * How many children came and then stopped, per centre, over the open days the
 * register measures.
 *
 * `stoppedRun` is the same threshold the register uses, so a coordinator reading
 * "9 have stopped" on one screen and the analyst quoting nine on the other are
 * talking about the same nine children. Two figures for one idea is how a board
 * paper ends up contradicting the dashboard it was written from.
 */
function insight_attrition_counts(): array {
    if (!function_exists('programme_days_elapsed')) return [];
    $days = programme_days_elapsed();
    if (!$days) return [];
    $run = defined('ATT_STOPPED_RUN') ? ATT_STOPPED_RUN : 3;
    $tail = array_slice($days, -$run);
    if (count($tail) < $run) return [];                 // too early in the term to say
    /* Scoped to ACTIVE STUDENTS, with no cohort filter — because that is how
     * every other figure in this payload is scoped (see analytics_depth, which
     * reads `summer_students WHERE status = 'active'`). Filtering by the current
     * cohort here would have made this one block describe a different
     * population from the rates it sits beside, and returned nothing at all
     * whenever no cohort was marked active — two numbers for one idea, which is
     * how a report ends up contradicting the screen it came from. */
    $from = $days[0]; $to = $days[count($days) - 1];

    // Ever present in the window, and present in the closing run.
    $ever = []; $recent = [];
    foreach (db_all("SELECT DISTINCT a.studentId sid FROM attendance a JOIN summer_students s ON s.studentId = a.studentId
                     WHERE s.status = 'active' AND a.date >= ? AND a.date <= ?", [$from, $to]) as $r) {
        $ever[(string)$r['sid']] = true;
    }
    foreach (db_all("SELECT DISTINCT a.studentId sid FROM attendance a JOIN summer_students s ON s.studentId = a.studentId
                     WHERE s.status = 'active' AND a.date >= ?", [$tail[0]]) as $r) {
        $recent[(string)$r['sid']] = true;
    }
    $byCentre = []; $stopped = 0; $never = 0; $active = 0;
    foreach (db_all("SELECT studentId, centre FROM summer_students WHERE status = 'active'") as $s) {
        $id = (string)$s['studentId']; $cn = (string)($s['centre'] ?? '') ?: '(no centre)';
        $byCentre[$cn] = $byCentre[$cn] ?? ['centre' => $cn, 'children' => 0, 'stopped' => 0, 'neverCame' => 0];
        $byCentre[$cn]['children']++; $active++;
        if (!isset($ever[$id])) { $byCentre[$cn]['neverCame']++; $never++; continue; }
        if (!isset($recent[$id])) { $byCentre[$cn]['stopped']++; $stopped++; }
    }
    foreach ($byCentre as &$row) {
        $row['stoppedPct'] = $row['children'] > 0 ? round($row['stopped'] / $row['children'] * 100, 1) : 0.0;
    }
    unset($row);
    usort($byCentre, fn($x, $y) => $y['stoppedPct'] <=> $x['stoppedPct']);
    return [
        'stoppedRun' => $run, 'openDays' => count($days), 'from' => $from, 'to' => $to,
        'children' => $active, 'stopped' => $stopped, 'neverCame' => $never,
        'stoppedPct' => $active > 0 ? round($stopped / $active * 100, 1) : 0.0,
        'byCentre' => array_values($byCentre),
    ];
}

/* ── The panel ────────────────────────────────────────────────────────────── */

/** The rules every analyst is held to, whatever their lens. */
function insight_system(array $a): string {
    return "You are one of several independent analysts reading the SAME evidence from a Nigerian youth "
         . "education programme. Your specific brief: " . $a['brief'] . "\n\n"
         . "RULES, all of them binding:\n"
         . "- Every claim must cite a number that is present in the evidence. If it is not there, you do not know it.\n"
         . "- Group sizes are given. A difference resting on a handful of children is not a finding; say so instead of reporting it.\n"
         . "- 'child-days' are attendance opportunities, not distinct children. Repeat visits by the same few people are not independent evidence.\n"
         . "- You are reading aggregates. You will see no names and must not speculate about individuals.\n"
         . "- Write for a centre coordinator, not a data scientist. Short sentences. No jargon, no hedging padding.\n"
         . "- Returning fewer claims is better than padding. An empty list is a valid and useful answer.\n\n"
         . "Reply with JSON only: {\"claims\":[{\"headline\":\"under 90 chars\",\"reasoning\":\"2-3 sentences\","
         . "\"evidence\":\"the numbers you used\",\"confidence\":\"high|medium|low\","
         . "\"action\":\"what to do, or empty\"}]}. At most " . INSIGHT_MAX_CLAIMS . " claims.";
}

/** Run one analyst. Never throws; a provider that is down loses one lens. */
function insight_run_analyst(array $a, string $evidenceJson): array {
    $r = ai_classify(insight_system($a), $evidenceJson, 1600, $a['profile']);
    if (empty($r['ok']) || !is_array($r['data']['claims'] ?? null)) {
        return ['key' => $a['key'], 'label' => $a['label'], 'ok' => false,
                'error' => (string)($r['error'] ?? 'no_claims'), 'claims' => []];
    }
    $claims = [];
    foreach (array_slice($r['data']['claims'], 0, INSIGHT_MAX_CLAIMS) as $c) {
        $head = trim((string)($c['headline'] ?? ''));
        if ($head === '') continue;
        $claims[] = [
            'headline' => mb_substr($head, 0, 140),
            'reasoning' => mb_substr(trim((string)($c['reasoning'] ?? '')), 0, 600),
            'evidence' => mb_substr(trim((string)($c['evidence'] ?? '')), 0, 300),
            'confidence' => in_array(($c['confidence'] ?? ''), ['high', 'medium', 'low'], true) ? (string)$c['confidence'] : 'low',
            'action' => mb_substr(trim((string)($c['action'] ?? '')), 0, 400),
        ];
    }
    return ['key' => $a['key'], 'label' => $a['label'], 'ok' => true,
            'provider' => (string)($r['provider'] ?? ''), 'claims' => $claims];
}

/**
 * The synthesis pass — which claims survive more than one analyst.
 *
 * Separate call, separate brief, and it may only CUT and MERGE. Letting the
 * synthesiser add its own claims would put an unreviewed fifth analyst at the
 * top of the page wearing the authority of a summary.
 */
function insight_synthesise(array $panel, string $evidenceJson): array {
    $input = [];
    foreach ($panel as $a) {
        if (empty($a['ok'])) continue;
        foreach ($a['claims'] as $i => $c) {
            $input[] = ['id' => $a['key'] . '.' . $i, 'lens' => $a['label']] + $c;
        }
    }
    if (count($input) < 2) return ['agreed' => [], 'contested' => $input, 'ok' => false, 'error' => 'too_few_claims'];

    $sys = "Several independent analysts read the same evidence. You are merging their claims. You may ONLY "
         . "group, cut and rank what they wrote — never add a claim of your own, and never strengthen one.\n\n"
         . "- AGREED: a substantive point at least two different lenses reached independently. Merge those into one entry "
         . "and list which lenses. This is the important output.\n"
         . "- CONTESTED: a point only one lens made, or where two lenses conflict. Say what the disagreement is.\n"
         . "- Drop anything vague, unactionable, or not grounded in a number.\n\n"
         . "Reply with JSON only: {\"agreed\":[{\"headline\":\"\",\"why\":\"2-3 sentences\",\"lenses\":[\"\"],"
         . "\"action\":\"\",\"confidence\":\"high|medium|low\"}],\"contested\":[{\"headline\":\"\",\"lens\":\"\",\"note\":\"\"}],"
         . "\"headline\":\"one sentence: the single most important thing here\"}";

    $r = ai_classify($sys, json_encode(['evidence' => json_decode($evidenceJson, true), 'claims' => $input], JSON_UNESCAPED_SLASHES), 1800, INSIGHT_SYNTH_PROFILE);
    if (empty($r['ok']) || !is_array($r['data'] ?? null)) {
        // The panel still ran. Hand back its claims unsynthesised rather than
        // nothing — one failed call must not discard four that worked.
        return ['agreed' => [], 'contested' => $input, 'ok' => false, 'error' => (string)($r['error'] ?? 'synth_failed')];
    }
    $d = $r['data'];
    $agreed = [];
    foreach ((array)($d['agreed'] ?? []) as $c) {
        $h = trim((string)($c['headline'] ?? ''));
        if ($h === '') continue;
        $agreed[] = ['headline' => mb_substr($h, 0, 160),
                     'why' => mb_substr(trim((string)($c['why'] ?? '')), 0, 700),
                     'lenses' => array_slice(array_map(fn($x) => mb_substr((string)$x, 0, 40), (array)($c['lenses'] ?? [])), 0, 4),
                     'action' => mb_substr(trim((string)($c['action'] ?? '')), 0, 400),
                     'confidence' => in_array(($c['confidence'] ?? ''), ['high', 'medium', 'low'], true) ? (string)$c['confidence'] : 'low'];
    }
    $contested = [];
    foreach ((array)($d['contested'] ?? []) as $c) {
        $h = trim((string)($c['headline'] ?? ''));
        if ($h === '') continue;
        $contested[] = ['headline' => mb_substr($h, 0, 160), 'lens' => mb_substr((string)($c['lens'] ?? ''), 0, 40),
                        'note' => mb_substr(trim((string)($c['note'] ?? '')), 0, 400)];
    }
    return ['ok' => true, 'agreed' => $agreed, 'contested' => $contested,
            'headline' => mb_substr(trim((string)($d['headline'] ?? '')), 0, 240),
            'provider' => (string)($r['provider'] ?? '')];
}

/** A stable fingerprint of the evidence, so the cache turns over when — and
 *  only when — the numbers a reader would act on have moved. */
function insight_fingerprint(array $ev): string {
    $copy = $ev; unset($copy['generatedAt']);
    return substr(sha1(json_encode($copy, JSON_UNESCAPED_SLASHES) ?: ''), 0, 16);
}

/* ── The op ───────────────────────────────────────────────────────────────── */

/**
 * The background worker: keep the programme-wide panel warm.
 *
 * Called from maintenance, so a coordinator opening Analytics on Monday reads
 * an answer rather than watching four model calls. Bounded hard, because unlike
 * every other cron job here this one spends money:
 *
 *  - Programme-wide only. Per-centre panels stay on demand; pre-computing one
 *    per centre would multiply the bill by the number of centres to answer
 *    questions nobody has asked.
 *  - The fingerprint does the real limiting. Identical numbers mean the cached
 *    panel is still current and nothing is called at all, so a quiet week costs
 *    nothing however often this runs.
 *  - Off entirely unless an admin turns it on. Spending a programme's API
 *    budget is not something to start doing because a version shipped.
 */
function insight_prewarm(): void {
    if (setting_raw('insight_prewarm') !== '1') return;
    if (!ai_enabled(INSIGHT_ANALYSTS[0]['profile']) && !ai_enabled('default')) return;
    try {
        // A synthetic requester with the analytics capability; the op gates on
        // it, and there is no signed-in admin on a cron tick.
        $r = insight_panel(['requesterId' => setting_raw('insight_prewarm_as') ?: '', 'centre' => '']);
        if (empty($r['ok'])) ops_record('warn', 'insight.prewarm', 'Panel pre-warm did not run.', (string)($r['error'] ?? ''));
    } catch (Throwable $e) {
        ops_record('warn', 'insight.prewarm', 'Panel pre-warm threw.', $e->getMessage());
    }
}

/**
 * Level 7. Returns the cached panel unless the evidence has changed or the
 * caller forces a re-run.
 */
function insight_panel(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;

    $ev = insight_evidence($p);
    if (!empty($ev['empty'])) {
        return ['ok' => true, 'insight' => ['empty' => true,
            'note' => 'There is nothing to analyse in this range yet.']];
    }
    /* Cached against a FINGERPRINT of the evidence, not just a clock: several
     * model calls per run is not something to repeat because a coordinator
     * refreshed the page, and equally not something to keep serving after the
     * numbers underneath have moved. The key is per centre+range; the stamp is
     * the evidence itself. */
    $fp = insight_fingerprint($ev);
    $key = 'insight_panel_' . substr(sha1((string)($p['centre'] ?? '') . '|' . (string)($p['range'] ?? '')), 0, 12);

    if (empty($p['force'])) {
        $hit = cache_get($key, INSIGHT_CACHE_TTL, $fp);
        if (is_array($hit)) return ['ok' => true, 'insight' => $hit + ['cached' => true]];
    }

    if (!ai_enabled(INSIGHT_ANALYSTS[0]['profile']) && !ai_enabled('default')) {
        return ['ok' => true, 'insight' => ['disabled' => true,
            'note' => 'No AI provider is configured. Levels 1–6 are unaffected — they are computed, not generated.']];
    }

    /* THE GATE. Encode once, check that encoding, and send exactly the bytes
     * that were checked. Encoding twice would leave room for the two to differ. */
    $evidenceJson = json_encode($ev, JSON_UNESCAPED_SLASHES) ?: '{}';
    $leak = insight_scrub($evidenceJson);
    if ($leak) {
        ops_record('error', 'insight.privacy', 'Refused to send analytics to an AI provider — the payload contained identifying data.', implode('; ', $leak));
        return ['ok' => false, 'error' => 'privacy_refused', 'reasons' => $leak];
    }

    $panel = [];
    foreach (INSIGHT_ANALYSTS as $a) $panel[] = insight_run_analyst($a, $evidenceJson);
    $ran = array_values(array_filter($panel, fn($x) => !empty($x['ok'])));
    if (!$ran) {
        return ['ok' => true, 'insight' => ['failed' => true,
            'note' => 'Every analyst call failed. The computed levels above are unaffected.',
            'panel' => $panel]];
    }
    $synth = insight_synthesise($panel, $evidenceJson);

    $out = [
        'fingerprint' => $fp,
        'generatedAt' => now_iso(),
        'range' => $ev['range'],
        'headline' => (string)($synth['headline'] ?? ''),
        'agreed' => $synth['agreed'] ?? [],
        'contested' => $synth['contested'] ?? [],
        'synthesised' => !empty($synth['ok']),
        'panel' => array_map(fn($a) => [
            'key' => $a['key'], 'label' => $a['label'], 'ok' => !empty($a['ok']),
            'provider' => (string)($a['provider'] ?? ''), 'error' => (string)($a['error'] ?? ''),
            'claims' => $a['claims'],
        ], $panel),
        // Named so a reader can weigh it: four lenses on one provider is one
        // opinion four times, and the screen should not imply otherwise.
        'providers' => array_values(array_unique(array_filter(array_map(fn($a) => (string)($a['provider'] ?? ''), $ran)))),
        'lensesRan' => count($ran), 'lensesTotal' => count(INSIGHT_ANALYSTS),
    ];
    cache_put($key, $out, $fp);
    audit('insight.panel', (string)($g['requester']['memberId'] ?? ''), '', ['fp' => $fp, 'lenses' => count($ran)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'insight' => $out];
}
