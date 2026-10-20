<?php
declare(strict_types=1);

/* ============================================================================
   The Academies' "Start here": how to use the portal, before the portal.

   Each staff portal has an Academy (mentors: seeds/mentor-academy.json, the
   v15 portal; instructors: seeds/instructor-academy.json, the v6 portal). Its
   first group is "Start here: using the portal" — one short module per area
   of the portal, naming the right tool for every job — and those modules are
   flagged `orientation`. Until a person has passed them, the portal opens on
   the Academy and nothing else, and the server refuses that portal's writes
   with `orientation_required` (academy_intercept, at backend_dispatch's one
   seam). Reading their own data and Report a concern are never blocked: a
   worry about a child does not wait for training.

   Orientation is NOT clearance. Clearance (mentorship-pods.php) is what lets
   a mentor be matched with children — screening, the policy, the required
   safeguarding and practice modules — and orientation modules are not part
   of it, so adding a guide never un-clears anybody.

   Exempt: staff with admin access (they set the Academy's policy), and a
   mentor whose Academy an admin recorded as completed in person
   (academyClearedAt).

   Mentors' passes stay in mentor_academy (their table since migration 137).
   Instructors' are in academy_passes / academy_attempts (migration 164),
   keyed by track and person, so a third portal is a seed file, not a table.
   ========================================================================== */

const ACADEMY_TRACKS = ['instructor'];
const ACADEMY_ATTEMPTS_PER_DAY = 3;

/** The mentor portal's writes that wait for "Start here". Not concern, not the Academy itself, not marking a message read. */
const ACADEMY_GATED_MENTOR_OPS = ['member.mentor.session.save', 'member.mentor.session.delete', 'member.mentor.goal.checkin', 'member.mentor.scorecard.save',
    'member.mentor.rel.save', 'member.mentor.rel.fit', 'member.mentor.family.send', 'member.mentor.family.drafts', 'member.mentor.supervision.prep',
    'member.mentor.supervision.book', 'member.mentor.retreat.book', 'member.mentor.saturday.plan', 'member.mentor.onetoones.add', 'member.mentor.register',
    'member.mentor.week.review', 'member.mentor.week.review.undo', 'member.mentor.message.reply', 'member.mentor.message.lead', 'member.mentor.plan.approve',
    'member.mentor.plan.return', 'member.mentor.goal.save', 'member.mentor.goal.status',
    // The Summer School portal (and the class tools): conversations, reviews, courage, chat, stars, notes.
    'member.mentor.meeting.save', 'member.mentor.meeting.delete', 'member.mentor.review.save', 'member.mentor.summer.review',
    'member.mentor.courage.mark', 'member.mentor.chat.send', 'behaviour.star.give', 'behaviour.bulk.award', 'member.remark.add'];
/** The instructor portal's writes that wait for "Start here". */
const ACADEMY_GATED_INSTRUCTOR_OPS = ['instructor.class.roll', 'instructor.class.plan', 'instructor.class.hinge', 'instructor.class.exit', 'instructor.class.log',
    'instructor.skills.mark', 'instructor.session.save', 'instructor.result.note', 'instructor.result.seen', 'instructor.result.remind'];

/** A track's content: {pass, groups, modules}. Mentors' is ms_academy(). */
function academy_track(string $track): array {
    static $cache = [];
    if ($track === 'mentor') return function_exists('ms_academy') ? ms_academy() : ['pass' => 80, 'groups' => [], 'modules' => []];
    if (!in_array($track, ACADEMY_TRACKS, true)) return ['pass' => 80, 'groups' => [], 'modules' => []];
    if (!isset($cache[$track])) {
        $cache[$track] = json_decode((string)@file_get_contents(__DIR__ . '/../seeds/' . $track . '-academy.json'), true) ?: ['pass' => 80, 'groups' => [], 'modules' => []];
    }
    return $cache[$track];
}
/** A module is for these portals: its `portal` ('ngg' | 'summer'), or every portal when it names none. */
function academy_module_for(array $m, ?array $portals): bool {
    $p = trim((string)($m['portal'] ?? ''));
    return $p === '' || $portals === null || in_array($p, $portals, true);
}
/** The ids of a track's "Start here" modules — for these portals only, when given.
 *  A Summer School mentor learns the Summer School portal, not the NGG one; a
 *  mentor in both programmes takes both. */
function academy_orientation_ids(string $track, ?array $portals = null): array {
    return array_values(array_map(static fn($m) => (string)$m['id'],
        array_filter(academy_track($track)['modules'], static fn($m) => !empty($m['orientation']) && academy_module_for($m, $portals))));
}

/** "Start here" for one person: {required, done, ok, exempt, mins, ids}. */
function academy_orientation_state(string $track, string $personId, bool $exempt = false, ?array $portals = null): array {
    $ids = academy_orientation_ids($track, $portals);
    $mins = 0; foreach (academy_track($track)['modules'] as $m) if (in_array((string)$m['id'], $ids, true)) $mins += (int)($m['mins'] ?? 0);
    if ($exempt || !$ids || $personId === '') return ['required' => count($ids), 'done' => count($ids), 'ok' => true, 'exempt' => $exempt, 'mins' => $mins, 'ids' => $ids];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $done = $track === 'mentor'
        ? (int)(db_row("SELECT COUNT(DISTINCT moduleId) c FROM mentor_academy WHERE mentorId = ? AND passedAt <> '' AND moduleId IN ($ph)", array_merge([$personId], $ids))['c'] ?? 0)
        : (int)(db_row("SELECT COUNT(DISTINCT moduleId) c FROM academy_passes WHERE track = ? AND personId = ? AND passedAt <> '' AND moduleId IN ($ph)", array_merge([$track, $personId], $ids))['c'] ?? 0);
    return ['required' => count($ids), 'done' => $done, 'ok' => $done >= count($ids), 'exempt' => false, 'mins' => $mins, 'ids' => $ids];
}
/** A mentor's "Start here", from their mentor row: staff and by-hand clearance are exempt. */
function academy_mentor_orientation(?array $mentorRow): array {
    if (!$mentorRow) return academy_orientation_state('mentor', '', true);
    $cl = function_exists('ms_clearance') ? ms_clearance($mentorRow) : [];
    $exempt = !empty($cl['staff']) || trim((string)($mentorRow['academyClearedAt'] ?? '')) !== '';
    return academy_orientation_state('mentor', (string)$mentorRow['mentorId'], $exempt, academy_mentor_portals($mentorRow));
}
/** The mentor portals this record works in: its programmes (mentor_programmes). */
function academy_mentor_portals(array $mentorRow): array {
    return function_exists('mentor_programmes') ? mentor_programmes($mentorRow) : ['ngg', 'summer'];
}

function academy_orientation_refusal(array $st, string $portal): array {
    return ['ok' => false, 'error' => 'orientation_required', 'orientation' => $st,
            'detail' => 'Finish “Start here” in the Academy first (' . $st['done'] . ' of ' . $st['required'] . ' done, about ' . $st['mins'] . ' minutes in all). It shows you the right tool for each job in the ' . $portal . '. Report a concern always works.'];
}

/**
 * At backend_dispatch's seam: a portal write by somebody who has not done
 * "Start here" is refused. Returns null to let the op run. A request the op
 * itself would refuse (no mentor record, wrong role) is left to the op.
 */
function academy_intercept(string $op, array $args): ?array {
    /* The PHP suite's fixtures are experienced staff; its Academy block turns
       the gate back on to test it. Never set outside api/tests/run.php. */
    if (!empty($GLOBALS['__academy_gate_off'])) return null;
    if (in_array($op, ACADEMY_GATED_MENTOR_OPS, true)) {
        $g = function_exists('mp_gate') ? mp_gate($args) : ['ok' => false];
        if (empty($g['ok']) || empty($g['mentorRow'])) return null;
        $st = academy_mentor_orientation($g['mentorRow']);
        return $st['ok'] ? null : academy_orientation_refusal($st, 'Mentor Portal');
    }
    if (in_array($op, ACADEMY_GATED_INSTRUCTOR_OPS, true)) {
        $g = function_exists('results_instructor_gate') ? results_instructor_gate($args) : ['ok' => false];
        if (empty($g['ok']) || ($g['role'] ?? '') !== 'instructor') return null;
        $st = academy_orientation_state('instructor', (string)($args['requesterId'] ?? ''));
        return $st['ok'] ? null : academy_orientation_refusal($st, 'Instructor Portal');
    }
    return null;
}

/* ── The Instructor Academy (instructor.academy, instructor.academy.result) ── */

/** The modules with this person's passes; the answer key stays here. */
function academy_view(string $track, string $personId, bool $exempt = false): array {
    $a = academy_track($track);
    $done = [];
    foreach (db_all('SELECT moduleId, score, passedAt FROM academy_passes WHERE track = ? AND personId = ?', [$track, $personId]) as $r) $done[(string)$r['moduleId']] = $r;
    $mods = array_map(static function ($m) use ($done) {
        $d = $done[$m['id']] ?? null;
        $renew = (int)($m['renewDays'] ?? 0);
        $due = $d && $renew ? gmdate('Y-m-d', strtotime((string)$d['passedAt']) + $renew * 86400) : null;
        if (isset($m['quiz'])) $m['quiz'] = array_map(static fn($q) => ['q' => $q['q'], 'options' => $q['options']], (array)$m['quiz']);
        return $m + ['passedAt' => (string)($d['passedAt'] ?? ''), 'score' => $d ? (int)$d['score'] : null, 'renewBy' => $due];
    }, $a['modules']);
    return ['ok' => true, 'pass' => (int)($a['pass'] ?? 80), 'groups' => $a['groups'], 'modules' => $mods,
            'orientation' => academy_orientation_state($track, $personId, $exempt)];
}

/** Re-score a module's answers on the server; store only a pass; at most three tries a day. */
function academy_result(string $track, string $personId, array $p): array {
    $mod = null; foreach (academy_track($track)['modules'] as $m) if ($m['id'] === (string)($p['moduleId'] ?? '')) $mod = $m;
    if (!$mod) return ['ok' => false, 'error' => 'not_found'];
    $ans = array_values((array)($p['answers'] ?? []));
    if (count($ans) !== count($mod['quiz'] ?? [])) return ['ok' => false, 'error' => 'answer_all'];
    $since = gmdate('Y-m-d\TH:i:s', time() - 86400);
    $tries = db_all('SELECT at FROM academy_attempts WHERE track = ? AND personId = ? AND moduleId = ? AND at >= ? ORDER BY at', [$track, $personId, (string)$mod['id'], $since]);
    if (count($tries) >= ACADEMY_ATTEMPTS_PER_DAY) return ['ok' => false, 'error' => 'retry_later', 'max' => ACADEMY_ATTEMPTS_PER_DAY, 'retryAt' => gmdate('c', strtotime((string)$tries[0]['at']) + 86400)];
    $right = 0; foreach ($mod['quiz'] as $i => $q) if ((int)$ans[$i] === (int)$q['answer']) $right++;
    $score = (int)round(100 * $right / max(1, count($mod['quiz'])));
    $pass = $score >= (int)(academy_track($track)['pass'] ?? 80);
    db_insert('academy_attempts', ['track' => $track, 'personId' => $personId, 'moduleId' => (string)$mod['id'], 'score' => $score, 'passed' => $pass ? 1 : 0, 'at' => gmdate('Y-m-d\TH:i:s')]);
    if ($pass) db_upsert('academy_passes', ['track' => $track, 'personId' => $personId, 'moduleId' => (string)$mod['id'], 'score' => $score, 'passedAt' => now_iso()],
        ['track', 'personId', 'moduleId'], ['score' => $score, 'passedAt' => now_iso()]);
    return ['ok' => true, 'score' => $score, 'passed' => $pass, 'orientation' => academy_orientation_state($track, $personId)];
}

/** instructor.academy — the Instructor Academy for the signed-in instructor. Not gated on safeguarding clearance: training runs alongside it. */
function instructor_academy(array $p): array {
    $g = function_exists('results_instructor_gate') ? results_instructor_gate($p) : ['ok' => false, 'error' => 'forbidden_role'];
    if (empty($g['ok'])) return $g;
    return academy_view('instructor', (string)$p['requesterId'], ($g['role'] ?? '') !== 'instructor');
}
/** instructor.academy.result — {moduleId, answers[]}. */
function instructor_academy_result(array $p): array {
    $g = function_exists('results_instructor_gate') ? results_instructor_gate($p) : ['ok' => false, 'error' => 'forbidden_role'];
    if (empty($g['ok'])) return $g;
    $r = academy_result('instructor', (string)$p['requesterId'], $p);
    if (!empty($r['passed'])) audit('instructor.academy.pass', (string)$p['requesterId'], (string)($p['moduleId'] ?? ''), ['score' => $r['score']]);
    return $r;
}
