<?php
declare(strict_types=1);

/**
 * Learn — the standardised exam (owner, 7 Nov 2026: "turn on the per session exam by default. Upgrade
 * the exam and make it standard with standardized features", and "It is to really test and assess them
 * strong. AI-spoof it … create Gods").
 *
 * ONE ENGINE, TWO SITTINGS.
 *   · session — opens every session: the previous session's questions FROM MEMORY, plus up to
 *     LX_SPACED questions from two or more weeks back (spaced retrieval: what was got wrong before
 *     comes back first). This is the opening review, made a standard exam.
 *   · trial — the summit of a course: questions drawn across everything the learner has completed.
 *     Passing it at LX_TRIAL_PASS is what makes a Master a God of the course (learn-mastery.php).
 *
 * WHAT MAKES IT STANDARD — the same for every learner, stated before they start:
 *   · a blueprint (which questions, from where), a time limit computed from the question kinds, the
 *     pass mark and the grade bands (Outstanding 95+, Distinction 85+, Merit 70+, Pass, Not yet);
 *   · questions and options in an order of its own per sitting, so two learners cannot share
 *     "the third answer is B";
 *   · one official sitting, saved as it goes and resumed after a dropped connection, its deadline
 *     kept by the SERVER (the browser's timer is a courtesy), with LX_GRACE seconds for the network;
 *   · an HONOUR PLEDGE before the clock starts — from memory, on their own, no notes, people or AI —
 *     recorded on the sitting and shown to instructors (owner: "A standard honourable exam");
 *   · results with the slip behind every wrong choice, and how sure they were — a learner who was
 *     SURE and wrong has a misconception to fix, which is worth more than the score.
 *
 * WHAT MAKES IT HARD TO HAND TO AN AI — and what it deliberately does NOT do:
 *   · no "AI detector". They are unreliable and flag non-native writers: across seven detectors,
 *     over 61% of TOEFL essays by real students were called machine-written (Liang et al., 2023,
 *     Patterns). A Club of Nigerian children would be the people it wrongs;
 *   · instead a FOLLOW-UP, the viva: after a written answer is marked, a question about a specific
 *     choice in THAT answer, answered in LX_VIVA_SECS. Somebody who wrote it can say why; somebody
 *     who pasted it often cannot. Standardised: the same number for everybody (the LX_VIVA_MAX
 *     strongest written answers), because orals are only fair with agreed prompts;
 *   · an answer that does not hold up is never failed by the machine: it is HELD for an instructor,
 *     with the follow-up beside it;
 *   · process signals (pasting, leaving the page), shown to instructors as things to ask about,
 *     never as proof and never as marks.
 */

const LX_SECS = ['mcq' => 75, 'order' => 120, 'short' => 240, 'code' => 420, 'task' => 300, 'essay' => 600,
                 'reflection' => 300, 'project' => 360, 'watch' => 300, 'evidence' => 360];
const LX_MIN_SECS = 300;          // never less than five minutes, however short the paper
const LX_MAX_SECS = 3600;
const LX_GRACE = 90;              // seconds after the deadline a save or submit still counts (the network)
const LX_SPACED = 3;              // spaced-retrieval questions added to a session exam
const LX_SPACED_WEEKS = 2;        // …from lessons at least this many weeks before last session's
const LX_VIVA_MAX = 2;            // follow-up questions per sitting — the same for everybody
const LX_VIVA_SECS = 240;
const LX_TRIAL_AUTO = 10;         // a trial: this many machine-marked questions…
const LX_TRIAL_WRITTEN = 2;       // …and this many written ones, across the whole course
const LX_TRIAL_PASS = 85;
const LX_TRIAL_COOLDOWN_DAYS = 7;
const LX_BAND_OUTSTANDING = 95;   // owner, 7 Nov 2026: "Add a category for 95+"
const LX_BAND_DISTINCTION = 85;
const LX_BAND_MERIT = 70;

/** The grade band for a percentage: one rule, printed on the instructions and on the result. */
function lx_band(int $pct, int $passMark): string {
    if ($pct >= LX_BAND_OUTSTANDING) return 'Outstanding';
    if ($pct >= LX_BAND_DISTINCTION) return 'Distinction';
    if ($pct >= LX_BAND_MERIT) return 'Merit';
    return $pct >= $passMark ? 'Pass' : 'Not yet';
}

function lx_time_limit(array $kinds): int {
    $t = 0; foreach ($kinds as $k) $t += LX_SECS[$k] ?? 240;
    return max(LX_MIN_SECS, min(LX_MAX_SECS, (int)(ceil($t / 60) * 60)));
}

/** A stable order for a sitting: the same sitting always shows the same order; another sitting, another. */
function lx_shuffle(array $xs, string $seed): array {
    $k = []; foreach (array_values($xs) as $i => $x) $k[] = [crc32($seed . '#' . $i), $x];
    usort($k, static fn($a, $b) => $a[0] <=> $b[0]);
    return array_column($k, 1);
}

/** Every check a member can be examined on, by id, with the unit it belongs to. */
function lx_checks_of(array $units): array {
    $out = [];
    foreach ($units as $uid => $b) foreach ($b['checks'] as $c) $out[(string)$c['checkId']] = $c + ['_unit' => (string)$uid];
    return $out;
}

/**
 * The session exam's blueprint: last session's questions, then up to LX_SPACED machine-marked ones from
 * at least LX_SPACED_WEEKS earlier in the same course — the ones they got WRONG first, then the ones never
 * recalled. Returns [prev unit id, [[checkId, role], …]] or null when there is nothing to sit.
 */
function lx_session_blueprint(array $m, array $units, string $unitId): ?array {
    $rev = curriculum_opening_review($units, $unitId, (string)$m['memberId']);
    if (!$rev) return null;
    $prevId = (string)$rev['unitId'];
    $items = array_map(static fn($c) => [(string)$c['checkId'], 'recall'], $units[$prevId]['checks']);
    $course = mb_strtolower((string)$units[$prevId]['unit']['course']);
    $week = (int)$units[$prevId]['unit']['week'];
    $older = [];
    foreach ($units as $uid => $b) {
        if (mb_strtolower((string)$b['unit']['course']) !== $course || (int)$b['unit']['week'] > $week - LX_SPACED_WEEKS) continue;
        foreach ($b['checks'] as $c) if (in_array((string)$c['kind'], CURR_AUTO_KINDS, true)) $older[(string)$c['checkId']] = (string)$uid;
    }
    if ($older) {
        $ids = array_values(array_unique($older));
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $prog = [];
        foreach (db_all("SELECT unitId, marks, reviewedAt FROM curriculum_progress WHERE memberId = ? AND unitId IN ($ph)", array_merge([(string)$m['memberId']], $ids)) as $r) $prog[(string)$r['unitId']] = $r;
        $rank = [];
        foreach ($older as $cid => $uid) {
            $mk = json_decode((string)($prog[$uid]['marks'] ?? ''), true)[$cid] ?? null;
            $wrong = is_array($mk) && isset($mk['points']) && (float)$mk['points'] <= 0;
            $recalled = (string)($prog[$uid]['reviewedAt'] ?? '') !== '';
            $rank[$cid] = ($wrong ? 0 : ($recalled ? 2 : 1)) . sprintf('%010u', crc32((string)$m['memberId'] . $cid . $unitId));
        }
        asort($rank);
        foreach (array_slice(array_keys($rank), 0, LX_SPACED) as $cid) $items[] = [(string)$cid, 'spaced'];
    }
    return [$prevId, $items];
}

/** Last session's lesson in this course — the same search the opening review makes, without its recall rules. */
function lx_prev_unit(array $units, string $unitId): ?string {
    if (!isset($units[$unitId])) return null;
    $course = mb_strtolower((string)$units[$unitId]['unit']['course']); $prev = null;
    foreach ($units as $id => $b) { if ((string)$id === $unitId) break; if (mb_strtolower((string)$b['unit']['course']) === $course) $prev = (string)$id; }
    return $prev;
}

/** A trial's blueprint: across every lesson of the course the learner has COMPLETED. */
function lx_trial_blueprint(array $m, array $units, string $course): ?array {
    $done = [];
    foreach (db_all("SELECT unitId FROM curriculum_progress WHERE memberId = ? AND status = 'completed'", [(string)$m['memberId']]) as $r) $done[(string)$r['unitId']] = true;
    $auto = []; $written = [];
    foreach ($units as $uid => $b) {
        if (!isset($done[(string)$uid]) || mb_strtolower((string)$b['unit']['course']) !== mb_strtolower($course)) continue;
        foreach ($b['checks'] as $c) {
            if (in_array((string)$c['kind'], CURR_AUTO_KINDS, true)) $auto[] = (string)$c['checkId'];
            elseif (in_array((string)$c['kind'], ['short', 'code', 'essay', 'evidence', 'project'], true)) $written[] = (string)$c['checkId'];
        }
    }
    if (count($auto) < 4) return null;   // too little of the course done to examine it fairly
    $seed = (string)$m['memberId'] . '|' . $course . '|' . gmdate('Y-W');
    $pick = array_merge(array_slice(lx_shuffle($auto, $seed), 0, LX_TRIAL_AUTO), array_slice(lx_shuffle($written, $seed . 'w'), 0, LX_TRIAL_WRITTEN));
    return array_map(static fn($cid) => [$cid, 'trial'], $pick);
}

/** Create a sitting from a blueprint. Options of every choice question get their own order here. */
function lx_create(array $m, string $kind, string $unitId, string $course, array $blueprint, array $checks): array {
    $sid = 'SIT-' . strtoupper(rand_hex(6));
    $items = [];
    foreach (lx_shuffle($blueprint, $sid) as [$cid, $role]) {
        $c = $checks[$cid] ?? null; if (!$c) continue;
        $it = ['checkId' => $cid, 'unitId' => (string)$c['_unit'], 'role' => $role];
        if ((string)$c['kind'] === 'mcq') $it['perm'] = lx_shuffle(array_keys(json_decode((string)$c['options'], true) ?: []), $sid . $cid);
        $items[] = $it;
    }
    $limit = lx_time_limit(array_map(static fn($it) => (string)$checks[$it['checkId']]['kind'], $items));
    $now = time();
    db_insert('curriculum_sittings', ['sittingId' => $sid, 'memberId' => (string)$m['memberId'], 'kind' => $kind, 'unitId' => $unitId,
        'course' => $course, 'items' => json_encode($items), 'status' => 'open', 'timeLimitSec' => $limit,
        'startedAt' => gmdate('Y-m-d\TH:i:s\Z', $now), 'deadline' => gmdate('Y-m-d\TH:i:s\Z', $now + $limit), 'updatedAt' => now_iso()]);
    return db_row('SELECT * FROM curriculum_sittings WHERE sittingId = ?', [$sid]);
}

/** A sitting as the learner sees it: the questions in their order, never an answer before it is earned. */
function lx_view(array $s, array $checks, array $units): array {
    $items = json_decode((string)$s['items'], true) ?: [];
    $qs = [];
    foreach ($items as $n => $it) {
        $c = $checks[$it['checkId']] ?? null; if (!$c) continue;
        $u = $units[$it['unitId']]['unit'] ?? [];
        $pub = curriculum_unit_public($u + ['unitId' => $it['unitId']], [], [$c], false)['checks'][0];
        if (isset($it['perm'])) $pub['options'] = array_map(static fn($i) => $pub['options'][$i] ?? '', $it['perm']);
        $qs[] = $pub + ['n' => $n + 1, 'role' => $it['role'], 'week' => (int)($u['week'] ?? 0), 'from' => (string)($u['title'] ?? '')];
    }
    $out = ['sittingId' => (string)$s['sittingId'], 'kind' => (string)$s['kind'], 'course' => (string)$s['course'], 'unitId' => (string)$s['unitId'],
        'status' => (string)$s['status'], 'timeLimitSec' => (int)$s['timeLimitSec'], 'startedAt' => (string)$s['startedAt'],
        'deadline' => (string)$s['deadline'], 'serverNow' => now_iso(), 'graceSec' => LX_GRACE, 'questions' => $qs,
        'answers' => json_decode((string)$s['answers'], true) ?: (object)[], 'confidence' => json_decode((string)$s['confidence'], true) ?: (object)[],
        'bands' => ['outstanding' => LX_BAND_OUTSTANDING, 'distinction' => LX_BAND_DISTINCTION, 'merit' => LX_BAND_MERIT], 'vivaSecs' => LX_VIVA_SECS];
    $u = $units[(string)$s['unitId']]['unit'] ?? null;
    $out['passMark'] = (string)$s['kind'] === 'trial' ? LX_TRIAL_PASS : (int)($u['passMark'] ?? 60);
    /* The candidate slip (a standard exam's header): who sat it, the exam number, and the times. The name is
       also what the player watermarks across the questions, so a photographed paper names its owner. */
    $who = db_row('SELECT fullName, displayId FROM members WHERE memberId = ?', [(string)$s['memberId']]);
    $out['candidate'] = ['name' => (string)($who['fullName'] ?? ''), 'memberNo' => (string)($who['displayId'] ?? '')];
    $out['appeal'] = json_decode((string)$s['integrity'], true)['appeal'] ?? null;
    $out['title'] = (string)$s['kind'] === 'trial' ? 'The ' . (string)$s['course'] . ' Trial' : 'Session exam — week ' . (int)($u['week'] ?? 0) . ': ' . (string)($u['title'] ?? '');
    $viva = json_decode((string)$s['viva'], true) ?: [];
    $out['viva'] = array_map(static fn($v) => ['checkId' => $v['checkId'], 'question' => $v['question'], 'askedAt' => $v['askedAt'], 'answered' => ($v['answeredAt'] ?? '') !== ''], $viva);
    if (in_array((string)$s['status'], ['marked', 'submitted'], true)) $out['result'] = lx_result($s, $checks);
    return $out;
}

/** The result: totals, band, and per question what they need — the slip, how sure they were. */
function lx_result(array $s, array $checks): array {
    $items = json_decode((string)$s['items'], true) ?: [];
    $marks = json_decode((string)$s['marks'], true) ?: [];
    $conf = json_decode((string)$s['confidence'], true) ?: [];
    $passMark = (int)(json_decode((string)$s['integrity'], true)['passMark'] ?? 60);
    $passed = (string)$s['status'] === 'marked' && (int)$s['pct'] >= $passMark;
    $per = []; $sureWrong = 0;
    foreach ($items as $it) {
        $c = $checks[$it['checkId']] ?? null; if (!$c) continue;
        $mk = $marks[$it['checkId']] ?? [];
        $max = (int)$c['points']; $got = isset($mk['points']) ? (float)$mk['points'] : null;
        $right = $got !== null && $got >= $max;
        $sure = ($conf[$it['checkId']] ?? '') === 'sure';
        if ($got !== null && !$right && $sure) $sureWrong++;
        $o = ['checkId' => $it['checkId'], 'kind' => (string)$c['kind'], 'role' => $it['role'], 'points' => $got, 'max' => $max,
              'right' => $right, 'pending' => $got === null, 'confidence' => (string)($conf[$it['checkId']] ?? ''),
              'held' => (string)($mk['flag'] ?? '')];
        if ((string)($mk['slip'] ?? '') !== '') $o['slip'] = (string)$mk['slip'];
        if ((string)($mk['feedback'] ?? '') !== '') $o['feedback'] = (string)$mk['feedback'];
        /* The right answer arrives once they have passed — the lesson's own rule (CURR_REVEAL_AFTER):
           before that a learner is told WHICH were wrong and why, and has to think again. */
        if ($passed) {
            if ((string)$c['kind'] === 'mcq') { $opts = json_decode((string)$c['options'], true) ?: []; $o['answer'] = (string)($opts[(int)$c['answer']] ?? ''); }
            elseif ((string)$c['kind'] === 'order') $o['answer'] = implode(' → ', json_decode((string)$c['options'], true) ?: []);
            elseif (trim((string)$c['answer']) !== '') $o['answer'] = (string)$c['answer'];
        }
        $per[] = $o;
    }
    /* Sections, as a standard paper reports them: this week's lesson, the earlier weeks, or the Trial. */
    $sec = [];
    foreach ($per as $q) { $k = $q['role'] === 'spaced' ? 'Earlier weeks' : ($q['role'] === 'trial' ? 'The whole course' : 'Last session'); $sec[$k]['got'] = ($sec[$k]['got'] ?? 0) + (float)($q['points'] ?? 0); $sec[$k]['max'] = ($sec[$k]['max'] ?? 0) + $q['max']; }
    $sections = []; foreach ($sec as $k => $v) $sections[] = ['name' => $k, 'got' => $v['got'], 'max' => $v['max'], 'pct' => $v['max'] ? (int)round($v['got'] / $v['max'] * 100) : 0];
    return ['sections' => $sections, 'pledged' => (string)(json_decode((string)$s['integrity'], true)['pledgedAt'] ?? '') !== '',
            'score' => (float)$s['score'], 'max' => (float)$s['maxScore'], 'pct' => (int)$s['pct'], 'band' => (string)$s['band'],
            'passMark' => $passMark, 'passed' => $passed, 'pending' => (string)$s['status'] === 'submitted', 'questions' => $per,
            'sureButWrong' => $sureWrong, 'submittedAt' => (string)$s['submittedAt'],
            'minutes' => max(1, (int)round((strtotime((string)$s['submittedAt']) - strtotime((string)$s['startedAt'])) / 60))];
}

function lx_own(array $p): array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $s = db_row('SELECT * FROM curriculum_sittings WHERE sittingId = ? AND memberId = ?', [(string)($p['sittingId'] ?? ''), (string)$m['memberId']]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'm' => $m, 's' => $s];
}

/**
 * member.exam.start — the session exam for the lesson they are opening ({unitId}), or a course trial
 * ({kind: trial, course}). Resumes an open sitting; an expired one is marked from what was saved.
 */
function member_exam_start(array $p): array {
    $m = curriculum_member_row((string)($p['memberId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $units = curriculum_member_units($m);
    $checks = lx_checks_of($units);
    $kind = (string)($p['kind'] ?? 'session') === 'trial' ? 'trial' : 'session';
    if ($kind === 'session') {
        $unitId = (string)($p['unitId'] ?? '');
        if (!isset($units[$unitId])) return ['ok' => false, 'error' => 'not_found'];
        /* A sitting already made for last session's lesson is THE sitting: open, it resumes; done, its result
           shows — a reload after handing in must not lose the result, and one exam is never sat twice. */
        $prevId = lx_prev_unit($units, $unitId);
        $s = $prevId !== null ? db_row("SELECT * FROM curriculum_sittings WHERE memberId = ? AND kind = 'session' AND unitId = ? ORDER BY id DESC LIMIT 1", [(string)$m['memberId'], $prevId]) : null;
        if (!$s) {
            $bp = lx_session_blueprint($m, $units, $unitId);
            if (!$bp) return ['ok' => true, 'exam' => null];
            [$prevId, $blue] = $bp;
            $s = lx_create($m, 'session', $prevId, (string)$units[$prevId]['unit']['course'], $blue, $checks);
            lx_integrity_set($s, ['passMark' => (int)$units[$prevId]['unit']['passMark']]);
        }
    } else {
        $course = curriculum_clean_text($p['course'] ?? '', 120);
        $mst = function_exists('lx_mastery') ? lx_mastery($m, $units, $course) : null;
        if (!$mst || $mst['tier'] < 5) return ['ok' => false, 'error' => 'trial_locked', 'detail' => 'The Trial opens at Master: every lesson of the course completed, and its session exams passed.'];
        $s = db_row("SELECT * FROM curriculum_sittings WHERE memberId = ? AND kind = 'trial' AND course = ? ORDER BY id DESC LIMIT 1", [(string)$m['memberId'], $course]);
        $cool = $s && (string)$s['status'] !== 'open' && strtotime((string)$s['submittedAt']) > time() - LX_TRIAL_COOLDOWN_DAYS * 86400;
        if ($s && (string)$s['status'] !== 'open' && !$cool && empty($p['view'])) $s = null;   // a new attempt after the cooldown
        if (!$s) {
            if (!empty($p['view'])) return ['ok' => true, 'exam' => null];
            $blue = lx_trial_blueprint($m, $units, $course);
            if (!$blue) return ['ok' => false, 'error' => 'trial_too_early'];
            $s = lx_create($m, 'trial', '', $course, $blue, $checks);
            lx_integrity_set($s, ['passMark' => LX_TRIAL_PASS]);
        }
    }
    if ((string)$s['status'] === 'open' && time() > strtotime((string)$s['deadline']) + LX_GRACE) {
        $s = lx_mark_sitting($s, $checks, $units, $m, true);
    }
    $s = db_row('SELECT * FROM curriculum_sittings WHERE id = ?', [(int)$s['id']]);
    return ['ok' => true, 'exam' => lx_view($s, $checks, $units)];
}

function lx_integrity_set(array $s, array $set): void {
    $cur = json_decode((string)db_row('SELECT integrity FROM curriculum_sittings WHERE id = ?', [(int)$s['id']])['integrity'], true) ?: [];
    db_update('curriculum_sittings', ['integrity' => json_encode($set + $cur), 'updatedAt' => now_iso()], ['id' => (int)$s['id']]);
}

/** Clean answers, confidence and process signals sent by the player, for the questions of this sitting only. */
function lx_merge_input(array $s, array $p): array {
    $items = json_decode((string)$s['items'], true) ?: [];
    $ids = array_column($items, 'checkId');
    $ans = json_decode((string)$s['answers'], true) ?: [];
    foreach ((is_array($p['answers'] ?? null) ? $p['answers'] : []) as $cid => $a) {
        if (!in_array((string)$cid, $ids, true)) continue;
        $ans[(string)$cid] = is_array($a) ? array_slice(array_map(static fn($x) => curriculum_clean_text($x, 300), $a), 0, 12)
            : (is_numeric($a) ? (int)$a : curriculum_clean_text($a, 4000));
    }
    $conf = json_decode((string)$s['confidence'], true) ?: [];
    foreach ((is_array($p['confidence'] ?? null) ? $p['confidence'] : []) as $cid => $v)
        if (in_array((string)$cid, $ids, true) && in_array($v, ['sure', 'think', 'guess'], true)) $conf[(string)$cid] = $v;
    /* Process signals: counters only ever go UP, so a replayed or edited save cannot lower them. */
    $int = json_decode((string)$s['integrity'], true) ?: [];
    $sig = is_array($p['signals'] ?? null) ? $p['signals'] : [];
    foreach (['pastes', 'pastedChars', 'typedChars', 'leaves', 'awaySecs', 'pasteBlocked', 'copyTries', 'fsExits'] as $k) if (isset($sig[$k])) $int[$k] = max((int)($int[$k] ?? 0), min(1000000, (int)$sig[$k]));
    /* The device: a HASH of the browser's identity, never the string itself, kept per sitting. A sitting
       answered from two devices at once is the shape of somebody else answering — a thing to ask about. */
    if (($ua = (string)($p['ua'] ?? '')) !== '') { $h = substr(sha1($ua), 0, 10); $dev = (array)($int['devices'] ?? []); if (!in_array($h, $dev, true) && count($dev) < 6) $dev[] = $h; $int['devices'] = $dev; }
    /* THE HONOUR PLEDGE (owner, 7 Nov 2026: "A standard honourable exam"): made once, before the clock,
       in the learner's own words of agreement — and never unmade by a later save. */
    if (!empty($sig['pledge']) && empty($int['pledgedAt'])) $int['pledgedAt'] = now_iso();
    return ['answers' => json_encode($ans, JSON_UNESCAPED_UNICODE), 'confidence' => json_encode($conf), 'integrity' => json_encode($int)];
}

/** member.exam.save — the autosave. Accepted until the deadline plus the grace. */
function member_exam_save(array $p): array {
    $o = lx_own($p); if (!$o['ok']) return $o;
    $s = $o['s'];
    if ((string)$s['status'] !== 'open') return ['ok' => false, 'error' => 'exam_closed'];
    if (time() > strtotime((string)$s['deadline']) + LX_GRACE) return ['ok' => false, 'error' => 'time_up'];
    db_update('curriculum_sittings', lx_merge_input($s, $p) + ['updatedAt' => now_iso()], ['id' => (int)$s['id']]);
    return ['ok' => true, 'savedAt' => now_iso()];
}

/** member.exam.submit — hand it in. Late answers (after deadline + grace) are not taken; what was saved is marked. */
function member_exam_submit(array $p): array {
    $o = lx_own($p); if (!$o['ok']) return $o;
    $s = $o['s'];
    $units = curriculum_member_units($o['m']); $checks = lx_checks_of($units);
    if ((string)$s['status'] === 'open') {
        $late = time() > strtotime((string)$s['deadline']) + LX_GRACE;
        if (!$late) { db_update('curriculum_sittings', lx_merge_input($s, $p), ['id' => (int)$s['id']]); $s = db_row('SELECT * FROM curriculum_sittings WHERE id = ?', [(int)$s['id']]); }
        $s = lx_mark_sitting($s, $checks, $units, $o['m'], $late);
    }
    return ['ok' => true, 'exam' => lx_view(db_row('SELECT * FROM curriculum_sittings WHERE id = ?', [(int)$s['id']]), $checks, $units)];
}

/** Mark every question, then either ask the follow-ups or finish. */
function lx_mark_sitting(array $s, array $checks, array $units, array $m, bool $late): array {
    $items = json_decode((string)$s['items'], true) ?: [];
    $ans = json_decode((string)$s['answers'], true) ?: [];
    $marks = [];
    foreach ($items as $it) {
        $c = $checks[$it['checkId']] ?? null; if (!$c) continue;
        $a = $ans[$it['checkId']] ?? null;
        if (isset($it['perm']) && is_numeric($a)) $a = $it['perm'][(int)$a] ?? -1;   // the shown option → the stored one
        [, $mk] = curriculum_mark_answer($c, $a);
        if (isset($mk['flag'])) audit('curriculum.safeguarding', (string)$m['memberId'], (string)$it['unitId'], ['checkId' => $it['checkId'], 'sitting' => $s['sittingId']]);
        $marks[$it['checkId']] = $mk;
    }
    /* The follow-ups: the LX_VIVA_MAX written answers the AI marked highest — the ones whose authorship
       matters most to the result. The same rule for everybody. */
    $cands = [];
    foreach ($items as $it) {
        $mk = $marks[$it['checkId']] ?? [];
        if (($mk['by'] ?? '') === 'ai' && (float)($mk['points'] ?? 0) > 0) $cands[$it['checkId']] = (float)$mk['points'];
    }
    arsort($cands);
    $viva = [];
    foreach (array_slice(array_keys($cands), 0, LX_VIVA_MAX) as $cid) {
        $q = lx_viva_question($checks[$cid], (string)($ans[$cid] ?? ''));
        if ($q !== '') $viva[] = ['checkId' => $cid, 'question' => $q, 'askedAt' => now_iso(), 'answer' => '', 'answeredAt' => '', 'verdict' => ''];
    }
    $int = json_decode((string)$s['integrity'], true) ?: [];
    if ($late) $int['late'] = true;
    db_update('curriculum_sittings', ['marks' => json_encode($marks, JSON_UNESCAPED_UNICODE), 'viva' => json_encode($viva, JSON_UNESCAPED_UNICODE),
        'integrity' => json_encode($int), 'submittedAt' => now_iso(), 'status' => $viva ? 'viva' : 'open', 'updatedAt' => now_iso()], ['id' => (int)$s['id']]);
    $s = db_row('SELECT * FROM curriculum_sittings WHERE id = ?', [(int)$s['id']]);
    return $viva ? $s : lx_finish($s, $checks, $units, $m);
}

/** One short question about a specific choice in the learner's own answer. '' when no AI can ask it. */
function lx_viva_question(array $c, string $answer): string {
    if (!function_exists('ai_classify') || trim($answer) === '') return '';
    $r = ai_classify('You are an examiner holding a short, friendly oral follow-up with a 10–17 year old. Read the question and THEIR answer. '
        . 'Ask ONE question (max 25 words) about a specific choice, step, example or claim in THEIR answer — something the person who wrote it '
        . 'could answer in one or two sentences from memory, and that cannot be answered by re-reading the question. Never ask them to repeat the answer. '
        . 'Return JSON {question:string}.',
        "Question: {$c['prompt']}\n\nTheir answer:\n" . mb_substr($answer, 0, 3000), 120, 'marking');
    return !empty($r['ok']) ? curriculum_clean_text($r['data']['question'] ?? '', 300) : '';
}

/**
 * member.exam.viva — the answer to one follow-up. A follow-up answered late, skipped, or that does not
 * hold up never loses marks by machine: the written answer it follows is HELD for an instructor, who
 * sees both. One that holds up confirms the mark.
 */
function member_exam_viva(array $p): array {
    $o = lx_own($p); if (!$o['ok']) return $o;
    $s = $o['s'];
    if ((string)$s['status'] !== 'viva') return ['ok' => false, 'error' => 'no_followup'];
    $units = curriculum_member_units($o['m']); $checks = lx_checks_of($units);
    $viva = json_decode((string)$s['viva'], true) ?: [];
    $marks = json_decode((string)$s['marks'], true) ?: [];
    $ans = json_decode((string)$s['answers'], true) ?: [];
    $cid = (string)($p['checkId'] ?? '');
    $said = curriculum_clean_text($p['answer'] ?? '', 1200);
    foreach ($viva as &$v) {
        if ($v['checkId'] !== $cid || $v['answeredAt'] !== '') continue;
        $v['answer'] = $said; $v['answeredAt'] = now_iso();
        $over = time() - strtotime((string)$v['askedAt']) > LX_VIVA_SECS + LX_GRACE;
        $verdict = $said === '' ? 'skipped' : ($over ? 'late' : lx_viva_verdict($checks[$cid] ?? [], (string)($ans[$cid] ?? ''), (string)$v['question'], $said));
        $v['verdict'] = $verdict;
        if ($verdict !== 'holds') $marks[$cid] = ['flag' => 'followup', 'was' => $marks[$cid] ?? null, 'verdict' => $verdict];
    }
    unset($v);
    $open = array_filter($viva, static fn($v) => $v['answeredAt'] === '');
    db_update('curriculum_sittings', ['viva' => json_encode($viva, JSON_UNESCAPED_UNICODE), 'marks' => json_encode($marks, JSON_UNESCAPED_UNICODE), 'updatedAt' => now_iso()], ['id' => (int)$s['id']]);
    $s = db_row('SELECT * FROM curriculum_sittings WHERE id = ?', [(int)$s['id']]);
    if (!$open) $s = lx_finish($s, $checks, $units, $o['m']);
    return ['ok' => true, 'exam' => lx_view(db_row('SELECT * FROM curriculum_sittings WHERE id = ?', [(int)$s['id']]), $checks, $units)];
}

/** Does the follow-up answer hold up? 'holds' | 'unclear'. Never 'cheated': that is not the AI's call. */
function lx_viva_verdict(array $c, string $answer, string $question, string $said): string {
    if (!function_exists('ai_classify')) return 'unclear';
    $r = ai_classify('You check a short oral follow-up. A learner wrote an answer; they were then asked a follow-up about it and replied. '
        . 'Decide only whether the reply shows the understanding behind their own answer (it can be rough, short, or in imperfect English — '
        . 'never judge the English). Return JSON {holds:boolean}.',
        "Original question: " . ($c['prompt'] ?? '') . "\nTheir answer: " . mb_substr($answer, 0, 2000) . "\nFollow-up: $question\nTheir reply: $said", 60, 'marking');
    return !empty($r['ok']) && !empty($r['data']['holds']) ? 'holds' : 'unclear';
}

/** Totals, band, status; the session's lesson progress updated; certificates and tiers looked at. */
function lx_finish(array $s, array $checks, array $units, array $m): array {
    $items = json_decode((string)$s['items'], true) ?: [];
    $marks = json_decode((string)$s['marks'], true) ?: [];
    $int = json_decode((string)$s['integrity'], true) ?: [];
    $score = 0.0; $max = 0.0; $pending = 0;
    foreach ($items as $it) {
        $c = $checks[$it['checkId']] ?? null; if (!$c) continue;
        $max += (int)$c['points'];
        $mk = $marks[$it['checkId']] ?? [];
        if (!isset($mk['points'])) { $pending++; continue; }
        $score += (float)$mk['points'];
    }
    $pct = $max > 0 ? (int)round($score / $max * 100) : 0;
    $pass = (int)($int['passMark'] ?? 60);
    db_update('curriculum_sittings', ['score' => $score, 'maxScore' => $max, 'pct' => $pct, 'band' => $pending ? '' : lx_band($pct, $pass),
        'status' => $pending ? 'submitted' : 'marked', 'updatedAt' => now_iso()], ['id' => (int)$s['id']]);
    $s = db_row('SELECT * FROM curriculum_sittings WHERE id = ?', [(int)$s['id']]);
    if ((string)$s['kind'] === 'session') lx_sync_progress($s, $checks, $units, $m);
    audit('learn.exam', (string)$m['memberId'], (string)$s['sittingId'], ['kind' => (string)$s['kind'], 'pct' => $pct, 'band' => (string)$s['band'], 'pending' => $pending]);
    if (function_exists('lx_award')) lx_award($m, (string)$s['course']);
    return $s;
}

/**
 * A session exam IS the review of last session's lesson, so its marks land on that lesson: the progress
 * row takes them (the better of what it had and what the exam found, per question) and is stamped as
 * recalled when the sitting came on a later day than the lesson was opened.
 */
function lx_sync_progress(array $s, array $checks, array $units, array $m): void {
    $uid = (string)$s['unitId'];
    if (!isset($units[$uid])) return;
    $b = $units[$uid];
    $marks = json_decode((string)$s['marks'], true) ?: [];
    $ans = json_decode((string)$s['answers'], true) ?: [];
    $pr = db_row('SELECT * FROM curriculum_progress WHERE unitId = ? AND memberId = ?', [$uid, (string)$m['memberId']]);
    $have = $pr ? (json_decode((string)$pr['marks'], true) ?: []) : [];
    $haveA = $pr ? (json_decode((string)$pr['answers'], true) ?: []) : [];
    foreach ($b['checks'] as $c) {
        $cid = (string)$c['checkId'];
        if (!array_key_exists($cid, $marks)) continue;
        $new = $marks[$cid]; $old = $have[$cid] ?? null;
        if (!isset($old['points']) || (isset($new['points']) && (float)$new['points'] >= (float)$old['points'])) { $have[$cid] = $new; if (isset($ans[$cid])) $haveA[$cid] = $ans[$cid]; }
    }
    $t = curriculum_progress_total($b['checks'], $have, (int)$b['unit']['passMark']);
    $now = now_iso();
    $completedBefore = $pr && (string)$pr['status'] === 'completed';
    $row = ['marks' => json_encode($have, JSON_UNESCAPED_UNICODE), 'answers' => json_encode($haveA, JSON_UNESCAPED_UNICODE), 'score' => $t['score'], 'maxScore' => $t['max'],
            'bestPct' => max($pr ? (int)$pr['bestPct'] : 0, $t['pending'] === 0 ? $t['pct'] : 0), 'pending' => $t['pending'] > 0 ? 1 : 0,
            'status' => $t['passed'] || $completedBefore ? 'completed' : ($t['pending'] > 0 ? 'submitted' : 'attempted'), 'updatedAt' => $now,
            'unitVersion' => (int)$b['unit']['version']];
    if ($t['passed'] && !$completedBefore) $row['completedAt'] = $now;
    $opened = $pr ? strtotime((string)$pr['startedAt']) : false;
    if (!$pr || ($opened && time() - $opened >= CURR_RECALL_GAP_DAYS * 86400)) $row['reviewedAt'] = $now;
    if ($pr) db_update('curriculum_progress', $row, ['id' => (int)$pr['id']]);
    else db_insert('curriculum_progress', $row + ['unitId' => $uid, 'memberId' => (string)$m['memberId'], 'startedAt' => $now, 'attempts' => 1]);
}

/**
 * member.exam.appeal — ask for a re-mark: once per sitting, within LX_APPEAL_DAYS of handing in, with a
 * reason. It does not change a mark; it puts the sitting in front of an instructor with the reason, which
 * is what a standard exam owes a candidate who thinks a mark is wrong.
 */
const LX_APPEAL_DAYS = 7;
function member_exam_appeal(array $p): array {
    $o = lx_own($p); if (!$o['ok']) return $o;
    $s = $o['s'];
    if (!in_array((string)$s['status'], ['marked', 'submitted'], true)) return ['ok' => false, 'error' => 'not_marked_yet'];
    if (time() - strtotime((string)$s['submittedAt']) > LX_APPEAL_DAYS * 86400) return ['ok' => false, 'error' => 'appeal_closed', 'days' => LX_APPEAL_DAYS];
    $int = json_decode((string)$s['integrity'], true) ?: [];
    if (!empty($int['appeal'])) return ['ok' => false, 'error' => 'already_requested'];
    $why = curriculum_clean_text($p['reason'] ?? '', 600);
    if (mb_strlen($why) < 10) return ['ok' => false, 'error' => 'reason_required'];
    $int['appeal'] = ['reason' => $why, 'checkId' => (string)($p['checkId'] ?? ''), 'at' => now_iso(), 'resolved' => ''];
    db_update('curriculum_sittings', ['integrity' => json_encode($int, JSON_UNESCAPED_UNICODE), 'updatedAt' => now_iso()], ['id' => (int)$s['id']]);
    audit('learn.exam.appeal', (string)$o['m']['memberId'], (string)$s['sittingId'], ['checkId' => (string)($p['checkId'] ?? '')]);
    return ['ok' => true, 'appeal' => $int['appeal']];
}

/* ══ Instructors ═══════════════════════════════════════════════════════════ */

/**
 * The signals an instructor reads beside a sitting — each a thing to ASK about, never a verdict:
 * most of the writing arrived by paste; they left the page often; they handed in late; a follow-up did
 * not hold up. Every one has an innocent explanation (a phone that pastes from notes, a shared device),
 * which is why none of them touches a mark.
 */
function lx_signals(array $s): array {
    $int = json_decode((string)$s['integrity'], true) ?: [];
    $out = [];
    if ((int)($int['pastedChars'] ?? 0) > 80 && (int)($int['pastedChars'] ?? 0) > (int)($int['typedChars'] ?? 0)) $out[] = 'mostly pasted';
    if ((int)($int['leaves'] ?? 0) >= 3) $out[] = 'left the page ' . (int)$int['leaves'] . ' times';
    if (!empty($int['late'])) $out[] = 'handed in after time';
    if ((int)($int['pasteBlocked'] ?? 0) >= 1) $out[] = 'tried to paste ' . (int)$int['pasteBlocked'] . ' time' . ((int)$int['pasteBlocked'] === 1 ? '' : 's');
    if ((int)($int['copyTries'] ?? 0) >= 1) $out[] = 'tried to copy a question';
    if ((int)($int['fsExits'] ?? 0) >= 2) $out[] = 'left full screen ' . (int)$int['fsExits'] . ' times';
    if (count((array)($int['devices'] ?? [])) > 1) $out[] = 'opened on ' . count((array)$int['devices']) . ' devices';
    if (!empty($int['appeal'])) $out[] = 're-mark requested';
    foreach (json_decode((string)$s['viva'], true) ?: [] as $v) if (in_array($v['verdict'] ?? '', ['unclear', 'late', 'skipped'], true)) { $out[] = 'a follow-up ' . ($v['verdict'] === 'unclear' ? 'did not hold up' : 'was ' . $v['verdict']); break; }
    return $out;
}

/**
 * staff.exam.sittings — the exams of the learners an instructor or mentor can see, newest first, with
 * the result, the band, the signals and the held answers; and an ITEM ANALYSIS per question: how many got
 * it right, and the wrong option chosen most — the class's misconception, by name.
 */
function staff_exam_sittings(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $ids = array_column(curriculum_staff_members($g), 'memberId');
    if (!$ids) return ['ok' => true, 'sittings' => [], 'items' => []];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $course = curriculum_clean_text($p['course'] ?? '', 120);
    $rows = db_all("SELECT s.*, m.fullName FROM curriculum_sittings s JOIN members m ON m.memberId = s.memberId WHERE s.memberId IN ($ph)"
        . ($course !== '' ? ' AND s.course = ?' : '') . " ORDER BY s.id DESC LIMIT 300", $course !== '' ? array_merge($ids, [$course]) : $ids);
    $cids = [];
    foreach ($rows as $r) foreach (json_decode((string)$r['items'], true) ?: [] as $it) $cids[$it['checkId']] = true;
    $checks = [];
    if ($cids) { $k = array_keys($cids); foreach (db_all('SELECT * FROM curriculum_checks WHERE checkId IN (' . implode(',', array_fill(0, count($k), '?')) . ')', $k) as $c) $checks[(string)$c['checkId']] = $c; }
    $an = [];
    $list = array_map(static function ($r) use ($checks, &$an) {
        $marks = json_decode((string)$r['marks'], true) ?: []; $ansr = json_decode((string)$r['answers'], true) ?: [];
        $held = [];
        foreach (json_decode((string)$r['items'], true) ?: [] as $it) {
            $c = $checks[$it['checkId']] ?? null; if (!$c) continue;
            $mk = $marks[$it['checkId']] ?? [];
            if (isset($mk['flag'])) $held[] = ['checkId' => $it['checkId'], 'prompt' => (string)$c['prompt'], 'answer' => is_array($ansr[$it['checkId']] ?? null) ? implode(' → ', $ansr[$it['checkId']]) : (string)($ansr[$it['checkId']] ?? ''), 'why' => (string)$mk['flag']];
            if (!in_array((string)$r['status'], ['marked', 'submitted'], true) || !isset($mk['points'])) continue;
            $a = &$an[$it['checkId']];
            $a = $a ?? ['checkId' => $it['checkId'], 'prompt' => (string)$c['prompt'], 'kind' => (string)$c['kind'], 'sat' => 0, 'right' => 0, 'wrong' => []];
            $a['sat']++; if ((float)$mk['points'] >= (int)$c['points']) $a['right']++;
            elseif ((string)$c['kind'] === 'mcq' && isset($it['perm'], $ansr[$it['checkId']]) && is_numeric($ansr[$it['checkId']])) {
                $orig = $it['perm'][(int)$ansr[$it['checkId']]] ?? null; $opts = json_decode((string)$c['options'], true) ?: [];
                if ($orig !== null && isset($opts[$orig])) $a['wrong'][$opts[$orig]] = ($a['wrong'][$opts[$orig]] ?? 0) + 1;
            }
            unset($a);
        }
        return ['sittingId' => (string)$r['sittingId'], 'memberId' => (string)$r['memberId'], 'name' => (string)$r['fullName'], 'kind' => (string)$r['kind'],
                'course' => (string)$r['course'], 'unitId' => (string)$r['unitId'], 'status' => (string)$r['status'], 'pct' => (int)$r['pct'], 'band' => (string)$r['band'],
                'startedAt' => (string)$r['startedAt'], 'submittedAt' => (string)$r['submittedAt'], 'signals' => lx_signals($r), 'held' => $held,
                'pledged' => (string)(json_decode((string)$r['integrity'], true)['pledgedAt'] ?? '') !== '',
                'appeal' => json_decode((string)$r['integrity'], true)['appeal'] ?? null,
                'viva' => array_map(static fn($v) => ['question' => $v['question'], 'answer' => $v['answer'], 'verdict' => $v['verdict']], json_decode((string)$r['viva'], true) ?: [])];
    }, $rows);
    $items = array_values(array_map(static function ($a) {
        arsort($a['wrong']);
        return ['checkId' => $a['checkId'], 'prompt' => $a['prompt'], 'kind' => $a['kind'], 'sat' => $a['sat'], 'right' => $a['right'],
                'facility' => $a['sat'] ? (int)round($a['right'] / $a['sat'] * 100) : 0, 'commonWrong' => (string)(array_key_first($a['wrong']) ?? ''),
                'commonWrongN' => (int)(reset($a['wrong']) ?: 0)];
    }, $an));
    usort($items, static fn($x, $y) => $x['facility'] <=> $y['facility']);
    return ['ok' => true, 'sittings' => $list, 'items' => array_slice($items, 0, 60)];
}

/**
 * staff.exam.mark — an instructor decides a held or unmarked answer in a sitting: points and a note.
 * The sitting is re-totalled, and a session exam's lesson progress follows.
 */
function staff_exam_mark(array $p): array {
    $g = curriculum_staff_gate($p); if (!$g['ok']) return $g;
    $s = db_row('SELECT * FROM curriculum_sittings WHERE sittingId = ?', [(string)($p['sittingId'] ?? '')]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if (!in_array((string)$s['memberId'], array_column(curriculum_staff_members($g), 'memberId'), true)) return ['ok' => false, 'error' => 'out_of_scope'];
    $m = curriculum_member_row((string)$s['memberId']);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $units = curriculum_member_units($m); $checks = lx_checks_of($units);
    $cid = (string)($p['checkId'] ?? '');
    $c = $checks[$cid] ?? null;
    if (!$c || !in_array($cid, array_column(json_decode((string)$s['items'], true) ?: [], 'checkId'), true)) return ['ok' => false, 'error' => 'not_found'];
    $pts = max(0, min((int)$c['points'], (int)($p['points'] ?? 0)));
    $marks = json_decode((string)$s['marks'], true) ?: [];
    $marks[$cid] = ['points' => $pts, 'by' => 'staff:' . (string)$g['requester']['memberId'], 'feedback' => curriculum_clean_text($p['note'] ?? '', 600)];
    $int = json_decode((string)$s['integrity'], true) ?: [];
    // A re-mark asked for is answered by an instructor deciding a mark on that sitting.
    if (!empty($int['appeal']) && (string)($int['appeal']['resolved'] ?? '') === '') $int['appeal']['resolved'] = now_iso();
    db_update('curriculum_sittings', ['marks' => json_encode($marks, JSON_UNESCAPED_UNICODE), 'integrity' => json_encode($int, JSON_UNESCAPED_UNICODE), 'updatedAt' => now_iso()], ['id' => (int)$s['id']]);
    $s = db_row('SELECT * FROM curriculum_sittings WHERE id = ?', [(int)$s['id']]);
    if ((string)$s['status'] !== 'viva') $s = lx_finish($s, $checks, $units, $m);
    audit('learn.exam.mark', (string)$g['requester']['memberId'], (string)$s['sittingId'], ['checkId' => $cid, 'points' => $pts], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => (string)$s['status'], 'pct' => (int)$s['pct'], 'band' => (string)$s['band']];
}
