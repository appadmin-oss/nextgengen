<?php
declare(strict_types=1);

/**
 * Baseline and endline — measuring learning rather than inferring it.
 *
 * WHY THIS EXISTS. This system could already report an average coursework
 * grade, and a trend across coursework grades is not a learning gain. The tasks
 * differ, the markers differ, the difficulty drifts week to week, and the
 * children who submit in week eight are not the children who submitted in week
 * one. "Grades went up nine points" is a sentence that survives exactly one
 * question from anybody who reads evidence for a living.
 *
 * What a funder means by "we measured learning" is narrow and specific: the
 * SAME instrument, administered TWICE to the SAME children, with the difference
 * computed per child. That is what this file does, and the four decisions below
 * are the reason it can be defended rather than merely produced.
 *
 * ── 1. THE PAIR IS THE UNIT, NOT THE MEAN ────────────────────────────────────
 * Comparing the baseline mean of everyone to the endline mean of everyone is a
 * different and much weaker claim, because the endline group is the survivors.
 * If the children who left were the strugglers, that comparison shows a gain
 * created entirely by their absence. So the headline is the mean of
 * (endline − baseline) over children who sat BOTH, and everything else is
 * reported around it.
 *
 * ── 2. ATTRITION IS REPORTED, NOT NETTED OUT ─────────────────────────────────
 * The first question a reviewer asks is "who dropped out, and were they
 * different?". So the analysis compares the BASELINE scores of the children who
 * came back against the baseline scores of the children who did not. If the
 * leavers were weaker, the gain is inflated and the report says so in those
 * words. A pre/post figure without this is not evidence, it is a hope.
 *
 * ── 3. ABSENT IS NOT ZERO ────────────────────────────────────────────────────
 * A child who did not sit the test did not score nothing; they have no score.
 * Recording absence as 0 drags the mean down and converts an attendance problem
 * into a learning finding. `absent` is its own column.
 *
 * ── 4. AN INSTRUMENT LOCKS ───────────────────────────────────────────────────
 * Revising a test after baseline makes every existing pair incomparable, and
 * the revision is invisible in the numbers. The instrument locks the moment its
 * first result is recorded; a change after that is a NEW instrument with its
 * own version, which forces the incomparability into the open where somebody
 * has to decide about it.
 */

const ASSESS_DOMAINS = ['literacy', 'numeracy', 'sel', 'gender_attitudes', 'other'];
const ASSESS_PHASES  = ['baseline', 'midline', 'endline'];
/** Below this a mean is a rumour. Same discipline as everywhere else here. */
const ASSESS_MIN_N   = 5;

/** Whoever runs the programme records the scores; whoever reads the analysis
 *  needs the roster capability either way. */
function assess_gate(array $p) { return admin_cap_gate($p, 'summer'); }

function assess_domain_label(string $d): string {
    return ['literacy' => 'Literacy', 'numeracy' => 'Numeracy', 'sel' => 'Social & emotional',
            'gender_attitudes' => 'Gender attitudes', 'other' => 'Other'][$d] ?? 'Other';
}

/* ── Instruments ─────────────────────────────────────────────────────────── */

function assess_instrument_public(array $r): array {
    return [
        'instrumentId' => (string)$r['instrumentId'], 'name' => (string)$r['name'],
        'domain' => (string)$r['domain'], 'domainLabel' => assess_domain_label((string)$r['domain']),
        'maxScore' => (int)$r['maxScore'], 'items' => (int)$r['items'], 'version' => (int)$r['version'],
        'notes' => (string)$r['notes'], 'status' => (string)$r['status'],
        'gradeFrom' => (int)$r['gradeFrom'], 'gradeTo' => (int)$r['gradeTo'],
        'locked' => (string)($r['lockedAt'] ?? '') !== '',
        'lockedAt' => (string)($r['lockedAt'] ?? ''),
        'createdAt' => (string)($r['createdAt'] ?? ''),
    ];
}

function admin_assessment_instruments(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM assessment_instruments WHERE archivedAt = '' ORDER BY domain, name");
    $out = [];
    foreach ($rows as $r) {
        $i = assess_instrument_public($r);
        // How many results exist is what makes "locked" mean something on screen.
        $i['results'] = (int)(db_row('SELECT COUNT(*) n FROM assessment_results WHERE instrumentId = ?', [$i['instrumentId']])['n'] ?? 0);
        $i['windows'] = (int)(db_row('SELECT COUNT(*) n FROM assessment_windows WHERE instrumentId = ?', [$i['instrumentId']])['n'] ?? 0);
        $out[] = $i;
    }
    return ['ok' => true, 'instruments' => $out, 'domains' => ASSESS_DOMAINS, 'phases' => ASSESS_PHASES];
}

function admin_assessment_instrument_save(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $id = trim((string)($p['instrumentId'] ?? ''));

    $name = mb_substr(trim((string)($d['name'] ?? '')), 0, 160);
    if ($name === '') return ['ok' => false, 'error' => 'name_required'];
    $domain = in_array(($d['domain'] ?? ''), ASSESS_DOMAINS, true) ? (string)$d['domain'] : 'other';
    $max = (int)($d['maxScore'] ?? 0);
    if ($max < 1 || $max > 1000) return ['ok' => false, 'error' => 'bad_max'];
    $from = grade_normalise($d['gradeFrom'] ?? '');
    $to = grade_normalise($d['gradeTo'] ?? '');
    if ($from && $to && $to < $from) return ['ok' => false, 'error' => 'bad_grade_range'];

    $row = ['name' => $name, 'domain' => $domain, 'maxScore' => $max,
            'items' => max(0, (int)($d['items'] ?? 0)),
            'notes' => mb_substr(trim((string)($d['notes'] ?? '')), 0, 2000),
            'gradeFrom' => $from, 'gradeTo' => $to,
            'status' => in_array(($d['status'] ?? ''), ['draft', 'active', 'archived'], true) ? (string)$d['status'] : 'active'];

    if ($id !== '') {
        $cur = db_row('SELECT * FROM assessment_instruments WHERE instrumentId = ? LIMIT 1', [$id]);
        if (!$cur) return ['ok' => false, 'error' => 'not_found'];
        /* THE LOCK. Once a single child has been measured with this instrument,
         * changing what it measures or what it is out of makes every pair built
         * on it incomparable — and the change leaves no trace in the numbers.
         * The name and the notes stay editable, because fixing a typo in a
         * label does not alter a score. */
        if ((string)$cur['lockedAt'] !== '') {
            foreach (['domain', 'maxScore', 'items', 'gradeFrom', 'gradeTo'] as $f) {
                if ((string)$row[$f] !== (string)$cur[$f]) {
                    return ['ok' => false, 'error' => 'locked',
                            'note' => 'This instrument has results recorded against it. Changing what it measures '
                                    . 'or what it is out of would make every existing baseline/endline pair '
                                    . 'incomparable, with nothing in the numbers to show it. Create a new version instead.'];
                }
            }
        }
        db_update('assessment_instruments', $row, ['instrumentId' => $id]);
        audit('assessment.instrument.save', $me, $id, ['fields' => array_keys($row)], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'instrumentId' => $id];
    }

    $id = 'AI-' . strtoupper(rand_hex(5));
    db_insert('assessment_instruments', $row + ['instrumentId' => $id, 'version' => 1, 'lockedAt' => '',
        'createdById' => $me, 'createdAt' => now_iso(), 'archivedAt' => '']);
    audit('assessment.instrument.create', $me, $id, ['name' => $name, 'domain' => $domain], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'instrumentId' => $id];
}

/**
 * A new VERSION of a locked instrument, rather than an edit to it.
 *
 * The honest path when a test genuinely has to change: the old one keeps its
 * results and its comparability, the new one starts clean, and nothing silently
 * pairs a score from one with a score from the other.
 */
function admin_assessment_instrument_revise(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $cur = db_row('SELECT * FROM assessment_instruments WHERE instrumentId = ? LIMIT 1', [(string)($p['instrumentId'] ?? '')]);
    if (!$cur) return ['ok' => false, 'error' => 'not_found'];
    $id = 'AI-' . strtoupper(rand_hex(5));
    db_insert('assessment_instruments', [
        'instrumentId' => $id, 'name' => (string)$cur['name'], 'domain' => (string)$cur['domain'],
        'maxScore' => (int)$cur['maxScore'], 'items' => (int)$cur['items'],
        'version' => (int)$cur['version'] + 1, 'notes' => (string)$cur['notes'],
        'gradeFrom' => (int)$cur['gradeFrom'], 'gradeTo' => (int)$cur['gradeTo'],
        'status' => 'draft', 'lockedAt' => '', 'createdById' => $me, 'createdAt' => now_iso(), 'archivedAt' => '',
    ]);
    audit('assessment.instrument.revise', $me, $id, ['from' => (string)$cur['instrumentId']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'instrumentId' => $id, 'version' => (int)$cur['version'] + 1];
}

/* ── Windows ─────────────────────────────────────────────────────────────── */

function admin_assessment_windows(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $rows = db_all('SELECT * FROM assessment_windows WHERE cohortId = ? ORDER BY instrumentId, phase', [(string)$c['cohortId']]);
    $out = [];
    foreach ($rows as $r) {
        $wid = (string)$r['windowId'];
        $sat = (int)(db_row('SELECT COUNT(*) n FROM assessment_results WHERE windowId = ? AND absent = 0', [$wid])['n'] ?? 0);
        $abs = (int)(db_row('SELECT COUNT(*) n FROM assessment_results WHERE windowId = ? AND absent = 1', [$wid])['n'] ?? 0);
        $out[] = ['windowId' => $wid, 'instrumentId' => (string)$r['instrumentId'],
                  'phase' => (string)$r['phase'], 'label' => (string)$r['label'],
                  'opensAt' => (string)$r['opensAt'], 'closesAt' => (string)$r['closesAt'],
                  'status' => (string)$r['status'], 'sat' => $sat, 'absent' => $abs];
    }
    return ['ok' => true, 'windows' => $out, 'cohortId' => (string)$c['cohortId']];
}

function admin_assessment_window_save(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $c = summer_ensure_cohort();
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $instrumentId = trim((string)($d['instrumentId'] ?? ''));
    if (!db_row('SELECT id FROM assessment_instruments WHERE instrumentId = ?', [$instrumentId])) {
        return ['ok' => false, 'error' => 'unknown_instrument'];
    }
    $phase = in_array(($d['phase'] ?? ''), ASSESS_PHASES, true) ? (string)$d['phase'] : 'baseline';
    $opens = substr(trim((string)($d['opensAt'] ?? '')), 0, 10);
    $closes = substr(trim((string)($d['closesAt'] ?? '')), 0, 10);
    if ($opens !== '' && $closes !== '' && $closes < $opens) return ['ok' => false, 'error' => 'bad_dates'];

    $row = ['instrumentId' => $instrumentId, 'phase' => $phase,
            'label' => mb_substr(trim((string)($d['label'] ?? '')), 0, 120),
            'opensAt' => $opens, 'closesAt' => $closes,
            'status' => in_array(($d['status'] ?? ''), ['open', 'closed'], true) ? (string)$d['status'] : 'open'];

    $id = trim((string)($p['windowId'] ?? ''));
    if ($id !== '') {
        if (!db_row('SELECT id FROM assessment_windows WHERE windowId = ?', [$id])) return ['ok' => false, 'error' => 'not_found'];
        db_update('assessment_windows', $row, ['windowId' => $id]);
        return ['ok' => true, 'windowId' => $id];
    }
    /* One window per instrument per phase per cohort. Two "baselines" for the
     * same test is not a richer dataset, it is an ambiguity about which score
     * pairs with the endline, and it would be resolved silently by whichever
     * row a query happened to read first. */
    $dupe = db_row('SELECT windowId FROM assessment_windows WHERE cohortId = ? AND instrumentId = ? AND phase = ? LIMIT 1',
        [(string)$c['cohortId'], $instrumentId, $phase]);
    if ($dupe) return ['ok' => false, 'error' => 'phase_exists', 'windowId' => (string)$dupe['windowId']];

    $id = 'AW-' . strtoupper(rand_hex(5));
    db_insert('assessment_windows', $row + ['windowId' => $id, 'cohortId' => (string)$c['cohortId'],
        'createdById' => $me, 'createdAt' => now_iso()]);
    audit('assessment.window.create', $me, $id, ['instrument' => $instrumentId, 'phase' => $phase], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'windowId' => $id];
}

/* ── Recording scores ────────────────────────────────────────────────────── */

/** The sheet a coordinator fills in: every eligible child, with whatever has
 *  already been recorded for them in this window. */
function admin_assessment_sheet(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $w = db_row('SELECT * FROM assessment_windows WHERE windowId = ? LIMIT 1', [(string)($p['windowId'] ?? '')]);
    if (!$w) return ['ok' => false, 'error' => 'not_found'];
    $inst = db_row('SELECT * FROM assessment_instruments WHERE instrumentId = ? LIMIT 1', [(string)$w['instrumentId']]);
    if (!$inst) return ['ok' => false, 'error' => 'unknown_instrument'];

    $where = "cohortId = ? AND status = 'active' AND regStatus = 'verified'";
    $args = [(string)$w['cohortId']];
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '') { $where .= ' AND centre = ?'; $args[] = $centre; }
    /* An instrument written for grades 4–6 should not be handed to a child in
     * Primary 1. Children with no class on file are still LISTED — excluding
     * them would quietly shrink the sample and nobody would see it happen —
     * but they are flagged. */
    $rows = db_all("SELECT studentId, fullName, firstName, lastName, centre, sex, gender, gradeLevel
                    FROM summer_students WHERE $where ORDER BY centre, fullName LIMIT 600", $args);

    $have = [];
    foreach (db_all('SELECT studentId, score, absent, note FROM assessment_results WHERE windowId = ?', [(string)$w['windowId']]) as $r) {
        $have[(string)$r['studentId']] = ['score' => (int)$r['score'], 'absent' => (int)$r['absent'] === 1, 'note' => (string)$r['note']];
    }
    $gf = (int)$inst['gradeFrom']; $gt = (int)$inst['gradeTo'];
    $out = [];
    foreach ($rows as $s) {
        $lvl = (int)($s['gradeLevel'] ?? 0);
        $out[] = [
            'studentId' => (string)$s['studentId'],
            'name' => trim(($s['firstName'] ?? '') . ' ' . ($s['lastName'] ?? '')) ?: (string)$s['fullName'],
            'centre' => (string)$s['centre'], 'sex' => person_sex($s),
            'grade' => grade_label($lvl), 'gradeLevel' => $lvl,
            'outOfRange' => ($gf > 0 && $lvl > 0 && $lvl < $gf) || ($gt > 0 && $lvl > 0 && $lvl > $gt),
            'noGrade' => $lvl === 0,
            'result' => $have[(string)$s['studentId']] ?? null,
        ];
    }
    return ['ok' => true, 'window' => ['windowId' => (string)$w['windowId'], 'phase' => (string)$w['phase'],
              'label' => (string)$w['label'], 'status' => (string)$w['status']],
            'instrument' => assess_instrument_public($inst), 'students' => $out];
}

/**
 * Record scores. Bulk, because a coordinator has a paper register of forty
 * children and one save is the difference between this being used and not.
 */
function admin_assessment_record(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $w = db_row('SELECT * FROM assessment_windows WHERE windowId = ? LIMIT 1', [(string)($p['windowId'] ?? '')]);
    if (!$w) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$w['status'] === 'closed') return ['ok' => false, 'error' => 'window_closed'];
    $inst = db_row('SELECT * FROM assessment_instruments WHERE instrumentId = ? LIMIT 1', [(string)$w['instrumentId']]);
    if (!$inst) return ['ok' => false, 'error' => 'unknown_instrument'];
    $max = (int)$inst['maxScore'];

    $items = is_array($p['results'] ?? null) ? $p['results'] : [];
    if (!$items) return ['ok' => false, 'error' => 'nothing_to_record'];
    if (count($items) > 600) return ['ok' => false, 'error' => 'too_many'];

    $saved = 0; $cleared = 0; $bad = [];
    foreach ($items as $it) {
        $sid = trim((string)($it['studentId'] ?? ''));
        if ($sid === '') continue;
        if (!db_row('SELECT id FROM summer_students WHERE studentId = ? LIMIT 1', [$sid])) { $bad[] = $sid; continue; }

        $absent = !empty($it['absent']);
        $hasScore = array_key_exists('score', $it) && $it['score'] !== '' && $it['score'] !== null;

        // Neither a score nor an absence mark = no answer yet. Clears any prior
        // entry rather than leaving a half-corrected row behind.
        if (!$absent && !$hasScore) {
            $cleared += db_exec('DELETE FROM assessment_results WHERE windowId = ? AND studentId = ?', [(string)$w['windowId'], $sid]);
            continue;
        }
        $score = $absent ? 0 : (int)$it['score'];
        /* Out of range is refused, not clamped. A 55 on a paper marked out of
         * 50 is a transcription error, and clamping it to 50 buries the error
         * inside a number somebody will later average. */
        if (!$absent && ($score < 0 || $score > $max)) { $bad[] = $sid; continue; }

        $existing = db_row('SELECT resultId FROM assessment_results WHERE windowId = ? AND studentId = ? LIMIT 1',
            [(string)$w['windowId'], $sid]);
        $row = ['score' => $score, 'absent' => $absent ? 1 : 0,
                'note' => mb_substr(trim((string)($it['note'] ?? '')), 0, 255),
                'recordedById' => $me, 'recordedAt' => now_iso()];
        if ($existing) {
            db_update('assessment_results', $row, ['resultId' => (string)$existing['resultId']]);
        } else {
            db_insert('assessment_results', $row + ['resultId' => 'AR-' . strtoupper(rand_hex(6)),
                'windowId' => (string)$w['windowId'], 'instrumentId' => (string)$w['instrumentId'], 'studentId' => $sid]);
        }
        $saved++;
    }

    /* THE LOCK, applied here rather than on save: the instrument becomes
     * un-editable the moment it has measured a child, because from that instant
     * a change to it would silently invalidate a comparison. */
    if ($saved > 0 && (string)$inst['lockedAt'] === '') {
        db_update('assessment_instruments', ['lockedAt' => now_iso(), 'status' => 'active'],
            ['instrumentId' => (string)$inst['instrumentId']]);
    }
    audit('assessment.record', $me, (string)$w['windowId'], ['saved' => $saved, 'cleared' => $cleared, 'rejected' => count($bad)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'saved' => $saved, 'cleared' => $cleared, 'rejected' => $bad,
            'locked' => $saved > 0 || (string)$inst['lockedAt'] !== ''];
}

/* ── The analysis ────────────────────────────────────────────────────────── */

/**
 * Mean, SD and a t-based 95% interval for a set of paired differences.
 *
 * The interval is on the DIFFERENCE, which is the whole point of pairing: each
 * child is their own control, so the between-child variance that swamps a
 * two-sample comparison drops out. Normal approximation for the critical value
 * — with n under 30 that is slightly optimistic, which is why anything under
 * ASSESS_MIN_N is refused outright rather than reported with a wide interval
 * nobody reads.
 */
function assess_paired_stats(array $diffs): array {
    $n = count($diffs);
    if ($n === 0) return ['n' => 0, 'mean' => null, 'sd' => null, 'lo' => null, 'hi' => null,
                          'd' => null, 'significant' => false, 'tooThin' => true];
    $mean = array_sum($diffs) / $n;
    $var = 0.0;
    foreach ($diffs as $x) $var += ($x - $mean) ** 2;
    $sd = $n > 1 ? sqrt($var / ($n - 1)) : 0.0;
    $se = $n > 0 ? $sd / sqrt($n) : 0.0;
    /* t rather than z for small samples. A short table beats pulling in a
       distribution library for four numbers, and the values are the standard
       two-tailed 0.05 criticals. */
    $t = $n <= 5 ? 2.776 : ($n <= 10 ? 2.262 : ($n <= 20 ? 2.093 : ($n <= 30 ? 2.045 : 1.96)));
    return [
        'n' => $n,
        'mean' => round($mean, 2),
        'sd' => round($sd, 2),
        'lo' => round($mean - $t * $se, 2),
        'hi' => round($mean + $t * $se, 2),
        // Cohen's d for a paired design, on the SD of the differences.
        'd' => $sd > 0 ? round($mean / $sd, 2) : null,
        /* "Significant" here means only that the interval excludes zero. It is
           not a claim that the programme caused the change — there is no
           control group, and this file must never imply there is. */
        'significant' => $n >= ASSESS_MIN_N && (($mean - $t * $se) > 0 || ($mean + $t * $se) < 0),
        'tooThin' => $n < ASSESS_MIN_N,
    ];
}

/** Percent of the instrument's maximum. One place, so a re-based paper changes
 *  one line rather than five callers.
 *
 *  Takes a float, and that is not a detail: the callers pass MEANS. Rounding a
 *  mean of 24.545 to 25 before dividing turns 40.9% into 41.7%, and the number
 *  that reaches a funder should not carry an error introduced by a cast. */
function assess_pct(float $score, int $max): float { return $max > 0 ? round($score / $max * 100, 1) : 0.0; }

/**
 * Baseline → endline for one instrument: the gain, who it is for, and every
 * reason a reader should doubt it.
 */
function admin_assessment_gains(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $instrumentId = trim((string)($p['instrumentId'] ?? ''));
    $instruments = $instrumentId !== ''
        ? db_all('SELECT * FROM assessment_instruments WHERE instrumentId = ?', [$instrumentId])
        : db_all("SELECT * FROM assessment_instruments WHERE archivedAt = '' ORDER BY domain, name");

    $out = [];
    foreach ($instruments as $inst) {
        $iid = (string)$inst['instrumentId'];
        $max = (int)$inst['maxScore'];
        $base = db_row("SELECT windowId FROM assessment_windows WHERE cohortId = ? AND instrumentId = ? AND phase = 'baseline' LIMIT 1",
            [(string)$c['cohortId'], $iid]);
        $end = db_row("SELECT windowId FROM assessment_windows WHERE cohortId = ? AND instrumentId = ? AND phase = 'endline' LIMIT 1",
            [(string)$c['cohortId'], $iid]);
        if (!$base || !$end) continue;

        $b = []; $e = [];
        foreach (db_all('SELECT studentId, score FROM assessment_results WHERE windowId = ? AND absent = 0', [(string)$base['windowId']]) as $r) {
            $b[(string)$r['studentId']] = (int)$r['score'];
        }
        foreach (db_all('SELECT studentId, score FROM assessment_results WHERE windowId = ? AND absent = 0', [(string)$end['windowId']]) as $r) {
            $e[(string)$r['studentId']] = (int)$r['score'];
        }
        if (!$b && !$e) continue;

        $ids = array_keys($b + $e);
        $meta = [];
        if ($ids) {
            $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
            foreach (db_all("SELECT studentId, sex, gender, gradeLevel, centre FROM summer_students WHERE studentId IN $in", $ids) as $r) {
                $meta[(string)$r['studentId']] = $r;
            }
        }

        /* The paired set. Everything else on this page is context for it. */
        $paired = [];
        foreach ($b as $sid => $bs) if (isset($e[$sid])) $paired[$sid] = $e[$sid] - $bs;

        $bySex = []; $byBand = []; $byCentre = [];
        foreach ($paired as $sid => $diff) {
            $m = $meta[$sid] ?? [];
            $bySex[sex_label($m)][] = $diff;
            $byBand[grade_band((int)($m['gradeLevel'] ?? 0))['label']][] = $diff;
            $cn = (string)($m['centre'] ?? ''); if ($cn !== '') $byCentre[$cn][] = $diff;
        }
        $group = function (array $sets) use ($max) {
            $rows = [];
            foreach ($sets as $k => $diffs) {
                $st = assess_paired_stats($diffs);
                $rows[] = ['group' => (string)$k, 'n' => $st['n'],
                           'meanGain' => $st['mean'], 'gainPct' => $st['mean'] === null ? null : assess_pct((float)$st['mean'], $max),
                           'lo' => $st['lo'], 'hi' => $st['hi'], 'd' => $st['d'],
                           'significant' => $st['significant'], 'tooThin' => $st['tooThin']];
            }
            usort($rows, fn($x, $y) => strcmp($x['group'], $y['group']));
            return $rows;
        };

        /* ── Attrition, which is the first thing a reviewer asks about ───────
         * Children who sat baseline and did not come back. If they were the
         * weaker ones, the paired gain is inflated by their absence and the
         * report has to say so in those words rather than leave it to be
         * noticed. */
        $leftBaselines = []; $stayedBaselines = [];
        foreach ($b as $sid => $bs) {
            if (isset($e[$sid])) $stayedBaselines[] = $bs; else $leftBaselines[] = $bs;
        }
        $meanOf = fn(array $a) => $a ? round(array_sum($a) / count($a), 2) : null;
        $leftMean = $meanOf($leftBaselines);
        $stayedMean = $meanOf($stayedBaselines);
        $attritionBias = null;
        if ($leftMean !== null && $stayedMean !== null && count($leftBaselines) >= ASSESS_MIN_N) {
            $delta = round($stayedMean - $leftMean, 2);
            $attritionBias = [
                'leftMean' => assess_pct((float)$leftMean, $max),
                'stayedMean' => assess_pct((float)$stayedMean, $max),
                'deltaPoints' => $delta,
                /* Named plainly, because the direction is the whole finding: if
                   the leavers were weaker, the gain LOOKS bigger than it is. */
                'direction' => abs($delta) < 1 ? 'balanced' : ($delta > 0 ? 'leavers_were_weaker' : 'leavers_were_stronger'),
            ];
        }

        $overall = assess_paired_stats(array_values($paired));
        $out[] = [
            'instrument' => assess_instrument_public($inst),
            'baselineWindow' => (string)$base['windowId'],
            'endlineWindow' => (string)$end['windowId'],
            'satBaseline' => count($b), 'satEndline' => count($e), 'paired' => count($paired),
            'baselineMeanPct' => $b ? assess_pct(array_sum($b) / count($b), $max) : null,
            'endlineMeanPct' => $e ? assess_pct(array_sum($e) / count($e), $max) : null,
            /* The paired means, over the SAME children — not the two cohort
               means above, which include people the other window never saw. */
            'pairedBaselinePct' => $stayedBaselines ? assess_pct(array_sum($stayedBaselines) / count($stayedBaselines), $max) : null,
            'gain' => $overall,
            'gainPct' => $overall['mean'] === null ? null : round($overall['mean'] / max(1, $max) * 100, 1),
            'bySex' => $group($bySex), 'byBand' => $group($byBand), 'byCentre' => $group($byCentre),
            'attrition' => ['baselineOnly' => count($leftBaselines), 'endlineOnly' => max(0, count($e) - count($paired)),
                            'bias' => $attritionBias],
            'caveats' => assess_caveats($overall, count($b), count($paired), $attritionBias),
        ];
    }
    return ['ok' => true, 'gains' => $out, 'minN' => ASSESS_MIN_N];
}

/**
 * What a reader should doubt, said by us before they have to work it out.
 *
 * This is not a disclaimer block. Each line here is a specific, checkable
 * limitation of THIS result, and the first one is the one that matters most:
 * there is no control group, so nothing in this file may be phrased as the
 * programme having caused anything.
 */
function assess_caveats(array $stat, int $satBaseline, int $paired, ?array $bias): array {
    $out = [];
    $out[] = ['level' => 'method', 'text' =>
        'Pre/post with no comparison group. This measures how much these children changed, not how much of '
        . 'the change the programme caused — children also get older, and school continues around us.'];
    if ($stat['tooThin']) {
        $out[] = ['level' => 'error', 'text' =>
            'Only ' . $paired . ' child(ren) sat both papers. Under ' . ASSESS_MIN_N . ' pairs there is no mean worth quoting.'];
    }
    if ($satBaseline > 0 && $paired > 0 && $paired / $satBaseline < 0.7) {
        $out[] = ['level' => 'warn', 'text' =>
            round($paired / $satBaseline * 100) . '% of the children who sat the baseline came back for the endline. '
            . 'Below about 70% the paired group stops representing the cohort.'];
    }
    if ($bias && $bias['direction'] === 'leavers_were_weaker') {
        $out[] = ['level' => 'warn', 'text' =>
            'The children who did not return scored ' . abs($bias['deltaPoints']) . ' points lower at baseline than those who did. '
            . 'The gain below is therefore larger than the cohort as a whole achieved.'];
    }
    if ($bias && $bias['direction'] === 'leavers_were_stronger') {
        $out[] = ['level' => 'warn', 'text' =>
            'The children who did not return scored higher at baseline than those who did, so the gain below is '
            . 'if anything an understatement.'];
    }
    if (!$stat['tooThin'] && !$stat['significant']) {
        $out[] = ['level' => 'warn', 'text' =>
            'The interval on the change includes zero — on this sample the movement cannot be distinguished from noise.'];
    }
    return $out;
}
