<?php
declare(strict_types=1);

/* ============================================================================
   The staff Academies: the portal's writes wait until it is complete.

   Each staff portal has an Academy (mentors: seeds/mentor-academy.json;
   instructors: seeds/instructor-academy.json). Its first group is "Start
   here: using the portal" — one short guide per area of the portal, naming
   the right tool for every job, flagged `orientation`, per portal — and then
   the required modules (safeguarding, practice).

   Until a person's Academy is complete (every guide and required module for
   their portals passed, renewals in date) they can open every screen of
   their portal and look around, but nothing they do there saves: the server
   refuses that portal's writes with `orientation_required`
   (academy_intercept, at backend_dispatch's one seam) and the portal says
   why on every screen. Report a concern is never held back: a worry about a
   child does not wait for training.

   Clearance (mentorship-pods.php) is a separate question — whether a mentor
   may be matched with children: screening, the policy and the required
   modules. A guide is not part of clearance, so adding one never un-clears
   anybody; it only holds that person's own saves until they take it.

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
    'member.mentor.plan.return', 'member.mentor.plan.cheer', 'member.mentor.goal.save', 'member.mentor.goal.status', 'member.mentor.project.save', 'member.mentor.project.mark',
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

/** The modules that make a person's Academy complete: the "Start here"
 *  guides for their portals and every required module (for their portals). */
function academy_required_ids(string $track, ?array $portals = null): array {
    return array_values(array_map(static fn($m) => (string)$m['id'],
        array_filter(academy_track($track)['modules'], static fn($m) => (!empty($m['orientation']) || !empty($m['required'])) && academy_module_for($m, $portals))));
}

/**
 * The Academy for one person — what the portal's writes wait for. Until it
 * is complete a mentor or instructor can open every screen of their portal
 * and look around, but nothing they do there saves (academy_intercept).
 * Complete means every "Start here" guide and every required module passed,
 * and a module with a renewal period passed within it — a lapsed safeguarding
 * module closes the portal's writes again until it is renewed.
 *
 * {required, done, ok, exempt, mins, ids, missing, startHere: {required, done}}.
 * `mins` is the time still to do.
 */
function academy_orientation_state(string $track, string $personId, bool $exempt = false, ?array $portals = null): array {
    $ids = academy_required_ids($track, $portals);
    $orient = academy_orientation_ids($track, $portals);
    $byId = []; foreach (academy_track($track)['modules'] as $m) $byId[(string)$m['id']] = $m;
    $all = static fn($n) => ['required' => count($ids), 'done' => $n, 'ok' => true, 'exempt' => $exempt, 'mins' => 0, 'ids' => $ids, 'missing' => [],
        'startHere' => ['required' => count($orient), 'done' => count($orient)]];
    if ($exempt || !$ids || $personId === '') return $all(count($ids));
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $rows = $track === 'mentor'
        ? db_all("SELECT moduleId, passedAt FROM mentor_academy WHERE mentorId = ? AND passedAt <> '' AND moduleId IN ($ph)", array_merge([$personId], $ids))
        : db_all("SELECT moduleId, passedAt FROM academy_passes WHERE track = ? AND personId = ? AND passedAt <> '' AND moduleId IN ($ph)", array_merge([$track, $personId], $ids));
    $passed = [];
    foreach ($rows as $r) {
        $id = (string)$r['moduleId']; $renew = (int)($byId[$id]['renewDays'] ?? 0);
        if ($renew > 0 && strtotime((string)$r['passedAt']) + $renew * 86400 < time()) continue;   // lapsed
        $passed[$id] = true;
    }
    $missing = array_values(array_filter($ids, static fn($id) => !isset($passed[$id])));
    $mins = 0; foreach ($missing as $id) $mins += (int)($byId[$id]['mins'] ?? 0);
    return ['required' => count($ids), 'done' => count($ids) - count($missing), 'ok' => !$missing, 'exempt' => false, 'mins' => $mins, 'ids' => $ids, 'missing' => $missing,
            'startHere' => ['required' => count($orient), 'done' => count(array_filter($orient, static fn($id) => isset($passed[$id])))]];
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
            'detail' => 'Nothing in the ' . $portal . ' saves until your Academy is complete (' . $st['done'] . ' of ' . $st['required'] . ' modules done, about ' . $st['mins'] . ' minutes left). You can look around everything meanwhile. Report a concern always works.'];
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

/**
 * member.staff.title — how children address this person, read and set by the
 * person themselves. Offered at the top of their Academy, the first screen a
 * new mentor or instructor opens. Only someone with a staff record (a mentor,
 * a volunteer, a staff role) has one: a child's own name is never retitled.
 */
function member_staff_title(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    if ($me === '') return ['ok' => false, 'error' => 'forbidden'];
    $mentor = db_row("SELECT mentorId, volunteerId, fullName, honorific FROM mentors WHERE memberId = ? ORDER BY id DESC LIMIT 1", [$me]);
    $vol = db_row("SELECT volunteerId, fullName, honorific FROM volunteers WHERE memberId = ? OR volunteerId = ? ORDER BY id DESC LIMIT 1", [$me, $me]);
    $mem = db_row("SELECT fullName, role, honorific FROM members WHERE memberId = ? LIMIT 1", [$me]);
    $staff = $mentor || $vol || ($mem && in_array(strtolower((string)$mem['role']), staff_role_names(), true));
    if (!$staff) return ['ok' => false, 'error' => 'not_staff'];
    $name = (string)($mem['fullName'] ?? $mentor['fullName'] ?? $vol['fullName'] ?? '');
    if (array_key_exists('honorific', $p)) {
        $want = trim((string)$p['honorific']);
        if ($want !== '' && staff_honorific_clean($want) === '') return ['ok' => false, 'error' => 'bad_title'];
        staff_honorific_set($mem ? $me : '', (string)($mentor['mentorId'] ?? ''), (string)($vol['volunteerId'] ?? $mentor['volunteerId'] ?? ''), $want);
        audit('staff.title', $me, $me, ['title' => staff_honorific_clean($want)], (string)($p['ip'] ?? ''));
    }
    $h = (string)(db_row("SELECT honorific FROM members WHERE memberId = ? LIMIT 1", [$me])['honorific'] ?? '')
        ?: (string)(db_row("SELECT honorific FROM mentors WHERE memberId = ? AND honorific <> '' LIMIT 1", [$me])['honorific'] ?? '')
        ?: (string)(db_row("SELECT honorific FROM volunteers WHERE (memberId = ? OR volunteerId = ?) AND honorific <> '' LIMIT 1", [$me, $me])['honorific'] ?? '');
    return ['ok' => true, 'honorific' => $h, 'titles' => STAFF_HONORIFICS, 'titleDefault' => STAFF_HONORIFIC_DEFAULT,
            'surname' => staff_surname($name), 'seenAs' => staff_title_name($name, $h)];
}
