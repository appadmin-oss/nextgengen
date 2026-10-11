<?php
/**
 * The Club class's Saturday, for its instructor.
 *
 * One record per course, centre and date, built up in teaching order:
 *
 *   Roll        here / late / away per member. Closing it adds anyone marked
 *               here or late that the gate missed to the centre's attendance
 *               record (method 'instructor'). It never deletes a gate scan and
 *               never writes an absence: an absence is the lack of a check-in,
 *               and the policy sweep reads it that way. A tap cannot fine a child.
 *   Plan        carry-over from last week, today's aim, steps, and the class
 *               split by where each member stands on the course skills
 *               (support / core / stretch), with pairs that put a stronger
 *               member beside one who needs support (R7, R8).
 *   Teach       the hinge question and its live tally.
 *   Exit ticket got it / partly / not yet per member, the misconception, and
 *               whole-class feedback (R6, R7). Its "not yet" list is next
 *               week's carry-over.
 *   Log         a summary and a remark per member; filing it sends each remark
 *               to the child's thread (remark_add), which their mentor reads.
 *
 * The class is the NGG members in the instructor's centres and courses
 * (results_class): never Summer School participants, never adults.
 */

const CLUB_ROLL_MARKS = ['here', 'late', 'away'];
const CLUB_EXIT_MARKS = ['got', 'partly', 'not'];
const CLUB_STEPS = ['roll', 'plan', 'teach', 'exit', 'log'];

function club_class_gate(array $p): array {
    $g = results_instructor_gate($p);
    if (empty($g['ok'])) return $g;
    return $g;
}

/** The courses and centres this instructor may pick between. */
function club_class_reach(array $g): array {
    $courses = $g['courses'] ?? null;
    if ($courses === null) $courses = function_exists('club_courses') ? club_courses() : [];
    $centres = $g['centres'] ?? null;
    if ($centres === null) $centres = mentor_scope_centres($g);
    return ['courses' => array_values($courses), 'centres' => array_values($centres)];
}

/** Resolve course/centre/date from the request against the reach. */
function club_class_slot(array $g, array $p): array {
    $reach = club_class_reach($g);
    $course = trim((string)($p['course'] ?? ''));
    $centre = trim((string)($p['centre'] ?? ''));
    if ($course === '') $course = (string)($reach['courses'][0] ?? '');
    if ($centre === '') $centre = (string)($reach['centres'][0] ?? '');
    if ($course === '' || !in_array($course, $reach['courses'], true)) return ['ok' => false, 'error' => 'not_your_course'];
    if ($centre === '' || !in_array($centre, $reach['centres'], true)) return ['ok' => false, 'error' => 'not_your_centre'];
    $date = trim((string)($p['date'] ?? ''));
    if ($date === '') $date = club_class_next_date(results_today());
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    return ['ok' => true, 'course' => $course, 'centre' => $centre, 'date' => $date, 'reach' => $reach];
}

/** The Club meets on Saturday: today if it is one, otherwise the next. */
function club_class_next_date(string $today): string {
    $ts = strtotime($today . 'T00:00:00Z');
    $dow = (int)gmdate('N', $ts);
    return gmdate('Y-m-d', $ts + ((6 - $dow + 7) % 7) * 86400);
}

/** The members of one class, with what the gate saw on $date. */
function club_class_roster(array $g, string $course, string $centre, string $date): array {
    $gg = $g; $gg['centres'] = [$centre]; $gg['courses'] = [$course];
    $rows = results_class($gg);
    if (!$rows) return [];
    $ids = array_column($rows, 'memberId');
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $scan = [];
    foreach (db_all("SELECT studentId, status, method FROM attendance WHERE date = ? AND studentId IN ($ph)", array_merge([$date], $ids)) as $r)
        $scan[(string)$r['studentId']] = ['status' => (string)($r['status'] ?? ''), 'method' => (string)($r['method'] ?? '')];
    $photos = [];
    foreach (db_all("SELECT memberId, photoUrl FROM members WHERE memberId IN ($ph)", $ids) as $r) $photos[(string)$r['memberId']] = (string)$r['photoUrl'];
    return array_map(static fn($r) => ['memberId' => (string)$r['memberId'], 'fullName' => (string)$r['fullName'], 'displayId' => (string)$r['displayId'],
        'photoUrl' => $photos[(string)$r['memberId']] ?? '', 'scanned' => isset($scan[(string)$r['memberId']]),
        'scanLate' => ($scan[(string)$r['memberId']]['status'] ?? '') === 'late'], $rows);
}

function club_class_row(string $course, string $centre, string $date): ?array {
    return db_row('SELECT * FROM club_class_sessions WHERE course = ? AND centre = ? AND date = ? LIMIT 1', [$course, $centre, $date]);
}

/** Write fields onto the slot's row, creating it on first touch. */
function club_class_put(array $g, array $slot, array $fields): array {
    $now = now_iso();
    $row = club_class_row($slot['course'], $slot['centre'], $slot['date']);
    $who = ['instructorId' => (string)$g['member']['memberId'], 'instructorName' => (string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? '')];
    if ($row) {
        db_update('club_class_sessions', $fields + $who + ['updatedAt' => $now], ['id' => (int)$row['id']]);
    } else {
        db_insert('club_class_sessions', $fields + $who + ['sessionId' => results_id('CCS'), 'course' => $slot['course'], 'centre' => $slot['centre'],
            'date' => $slot['date'], 'createdAt' => $now, 'updatedAt' => $now]);
    }
    return club_class_row($slot['course'], $slot['centre'], $slot['date']);
}

function club_json(?string $s): array { $j = json_decode((string)$s, true); return is_array($j) ? $j : []; }

/** Where each member stands: the share of course skills at "can do it" or above. */
function club_class_levels(array $roster, string $course): array {
    $skills = course_skills($course);
    if (!$skills || !$roster) return ['skills' => $skills, 'by' => []];
    $ids = array_column($roster, 'memberId');
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $sum = []; $n = [];
    foreach (db_all("SELECT subjectId, level FROM skill_marks WHERE course = ? AND subjectId IN ($ph)", array_merge([$course], $ids)) as $r) {
        $sum[(string)$r['subjectId']] = ($sum[(string)$r['subjectId']] ?? 0) + (int)$r['level'];
        $n[(string)$r['subjectId']] = ($n[(string)$r['subjectId']] ?? 0) + 1;
    }
    $by = [];
    foreach ($ids as $id) $by[$id] = isset($n[$id]) ? round($sum[$id] / $n[$id], 2) : null;
    return ['skills' => $skills, 'by' => $by];
}

/**
 * The mixed-level split. Unmarked members sit in "core" rather than being
 * guessed at. Pairs put the strongest beside the one who most needs support.
 */
function club_class_groups(array $roster, array $levels, array $present): array {
    $g = ['support' => [], 'core' => [], 'stretch' => []];
    $scored = [];
    foreach ($roster as $r) {
        $id = $r['memberId'];
        if ($present && !in_array($id, $present, true)) continue;
        $lv = $levels['by'][$id] ?? null;
        $band = $lv === null ? 'core' : ($lv < 2 ? 'support' : ($lv >= 3 ? 'stretch' : 'core'));
        $g[$band][] = ['memberId' => $id, 'fullName' => $r['fullName'], 'level' => $lv];
        if ($lv !== null) $scored[] = ['memberId' => $id, 'fullName' => $r['fullName'], 'level' => $lv];
    }
    usort($scored, static fn($a, $b) => $a['level'] <=> $b['level']);
    $pairs = [];
    while (count($scored) >= 2) {
        $lo = array_shift($scored); $hi = array_pop($scored);
        if ($hi['level'] - $lo['level'] < 0.5) break;     // no point pairing equals
        $pairs[] = [$hi, $lo];
    }
    return ['groups' => $g, 'pairs' => $pairs];
}

/** The last session before $date for this class (carry-over source). */
function club_class_previous(string $course, string $centre, string $date): ?array {
    return db_row('SELECT * FROM club_class_sessions WHERE course = ? AND centre = ? AND date < ? ORDER BY date DESC LIMIT 1', [$course, $centre, $date]);
}

/** The curriculum lesson for this course this week, if the term has a start date. */
function club_class_lesson(string $course, string $date): ?array {
    if (!function_exists('curriculum_load')) return null;
    $cfg = curriculum_schedule();
    if ((string)$cfg['startDate'] === '') return null;
    $week = max(1, (int)floor((strtotime($date . 'T00:00:00Z') - strtotime($cfg['startDate'] . 'T00:00:00Z')) / (7 * 86400)) + 1);
    $u = curriculum_load("status = 'published' AND lower(course) = lower(?) AND week = ?", [$course, $week], 'position');
    if (!$u) return null;
    $b = reset($u);
    return ['unitId' => (string)$b['unit']['unitId'], 'title' => (string)$b['unit']['title'], 'week' => $week,
        'summary' => (string)$b['unit']['summary'], 'durationMins' => (int)$b['unit']['durationMins']];
}

/** The status of each teaching step, the next action, and a warning if one applies. */
function club_class_loop(?array $row, array $roster, string $date, string $today): array {
    $roll = club_json($row['rollJson'] ?? '');
    $plan = club_json($row['planJson'] ?? '');
    $hinge = club_json($row['hingeJson'] ?? '');
    $exit = club_json($row['exitJson'] ?? '');
    $steps = [
        'roll'  => (string)($row['rollClosedAt'] ?? '') !== '' ? 'done' : ($roll ? 'started' : 'todo'),
        'plan'  => (string)($row['planAt'] ?? '') !== '' ? 'done' : 'todo',
        'teach' => !empty($hinge['tally']) && array_sum((array)$hinge['tally']) > 0 ? 'done' : (!empty($hinge['question']) ? 'started' : 'todo'),
        'exit'  => (string)($row['exitAt'] ?? '') !== '' ? 'done' : (!empty($exit['results']) ? 'started' : 'todo'),
        'log'   => (string)($row['filedAt'] ?? '') !== '' ? 'done' : 'todo',
    ];
    $labels = ['roll' => 'Take the roll', 'plan' => 'Plan the lesson', 'teach' => 'Run the hinge question', 'exit' => 'Mark the exit ticket', 'log' => 'File the session log'];
    $next = null;
    foreach (CLUB_STEPS as $s) if ($steps[$s] !== 'done') { $next = ['step' => $s, 'label' => $labels[$s]]; break; }
    $warn = '';
    if ($date < $today && $steps['log'] !== 'done') $warn = 'Last session’s log was never filed.';
    elseif ($date === $today && $steps['plan'] !== 'done') $warn = 'There is no plan for today yet.';
    elseif ($steps['roll'] === 'done' && $roster && count(array_filter($roll, static fn($v) => $v === 'away')) >= max(3, (int)ceil(count($roster) / 3))) $warn = 'A third of the class was away. Worth a word with their mentors.';
    return ['steps' => $steps, 'next' => $next, 'warning' => $warn];
}

function club_class_public(?array $row, array $roster): array {
    $roll = club_json($row['rollJson'] ?? '');
    $here = 0; $late = 0; $away = 0;
    foreach ($roster as $r) {
        $m = $roll[$r['memberId']] ?? ($r['scanned'] ? ($r['scanLate'] ? 'late' : 'here') : '');
        if ($m === 'here') $here++; elseif ($m === 'late') $late++; elseif ($m === 'away') $away++;
    }
    return ['sessionId' => (string)($row['sessionId'] ?? ''), 'roll' => (object)$roll, 'rollClosedAt' => (string)($row['rollClosedAt'] ?? ''),
        'counts' => ['here' => $here, 'late' => $late, 'away' => $away, 'unmarked' => count($roster) - $here - $late - $away, 'class' => count($roster)],
        'plan' => (object)club_json($row['planJson'] ?? ''), 'planAt' => (string)($row['planAt'] ?? ''),
        'hinge' => (object)club_json($row['hingeJson'] ?? ''),
        'exit' => (object)club_json($row['exitJson'] ?? ''), 'exitAt' => (string)($row['exitAt'] ?? ''),
        'log' => (object)club_json($row['logJson'] ?? ''), 'filedAt' => (string)($row['filedAt'] ?? ''),
        'instructorName' => (string)($row['instructorName'] ?? '')];
}

/** instructor.class — the whole Saturday for one class. */
function instructor_class(array $p): array {
    $g = club_class_gate($p); if (empty($g['ok'])) return $g;
    $slot = club_class_slot($g, $p); if (empty($slot['ok'])) return $slot;
    $today = results_today();
    $roster = club_class_roster($g, $slot['course'], $slot['centre'], $slot['date']);
    $row = club_class_row($slot['course'], $slot['centre'], $slot['date']);
    $prev = club_class_previous($slot['course'], $slot['centre'], $slot['date']);
    $levels = club_class_levels($roster, $slot['course']);
    $roll = club_json($row['rollJson'] ?? '');
    $present = array_keys(array_filter($roll, static fn($v) => $v !== 'away'));
    $prevExit = club_json($prev['exitJson'] ?? '');
    $carry = [];
    foreach ((array)($prevExit['results'] ?? []) as $mid => $v) if ($v === 'not') $carry[] = (string)$mid;
    $names = array_column($roster, 'fullName', 'memberId');
    return ['ok' => true, 'course' => $slot['course'], 'centre' => $slot['centre'], 'date' => $slot['date'], 'today' => $today,
        'courses' => $slot['reach']['courses'], 'centres' => $slot['reach']['centres'],
        'roster' => $roster, 'session' => club_class_public($row, $roster),
        'loop' => club_class_loop($row, $roster, $slot['date'], $today),
        'lesson' => club_class_lesson($slot['course'], $slot['date']),
        'skills' => $levels['skills'], 'levels' => (object)$levels['by'],
        'mix' => club_class_groups($roster, $levels, $present),
        'carryOver' => ['from' => (string)($prev['date'] ?? ''), 'misconception' => (string)($prevExit['misconception'] ?? ''),
            'notYet' => array_values(array_map(static fn($id) => ['memberId' => $id, 'fullName' => $names[$id] ?? ''], array_filter($carry, static fn($id) => isset($names[$id]))))]];
}

/** instructor.class.roll — save marks as tapped; close to sync the centre's attendance. */
function instructor_class_roll(array $p): array {
    $g = club_class_gate($p); if (empty($g['ok'])) return $g;
    $slot = club_class_slot($g, $p); if (empty($slot['ok'])) return $slot;
    $roster = club_class_roster($g, $slot['course'], $slot['centre'], $slot['date']);
    $ids = array_column($roster, 'memberId');
    $row = club_class_row($slot['course'], $slot['centre'], $slot['date']);
    $roll = club_json($row['rollJson'] ?? '');
    foreach ((array)($p['marks'] ?? []) as $mid => $mark) {
        $mid = (string)$mid;
        if (!in_array($mid, $ids, true)) continue;                 // never a record about a child not in this class
        if ($mark === '' || $mark === null) { unset($roll[$mid]); continue; }
        if (in_array($mark, CLUB_ROLL_MARKS, true)) $roll[$mid] = $mark;
    }
    $fields = ['rollJson' => json_encode((object)$roll)];
    $added = 0;
    if (!empty($p['close'])) {
        // The gate's scans count as marked: a child scanned at the door is here unless the instructor says otherwise.
        foreach ($roster as $r) if (!isset($roll[$r['memberId']]) && $r['scanned']) $roll[$r['memberId']] = $r['scanLate'] ? 'late' : 'here';
        $unmarked = array_values(array_diff($ids, array_keys($roll)));
        if ($unmarked && empty($p['awayRest'])) return ['ok' => false, 'error' => 'unmarked', 'memberIds' => $unmarked];
        foreach ($unmarked as $u) $roll[$u] = 'away';
        $fields['rollJson'] = json_encode((object)$roll);
        $fields['rollClosedAt'] = now_iso();
        $now = now_iso();
        foreach ($roll as $mid => $mark) {
            if ($mark === 'away' || db_row('SELECT 1 FROM attendance WHERE studentId = ? AND date = ?', [$mid, $slot['date']])) continue;
            try {
                db_insert('attendance', ['cohortId' => '', 'studentId' => $mid, 'token' => '', 'date' => $slot['date'], 'checkInAt' => $now,
                    'method' => 'instructor', 'byId' => (string)$g['member']['memberId'], 'status' => $mark === 'late' ? 'late' : '', 'createdAt' => $now]);
                $added++;
            } catch (\Throwable $e) {}
        }
    }
    $row = club_class_put($g, $slot, $fields);
    if (!empty($p['close'])) audit('instructor.class.roll', (string)$g['member']['memberId'], (string)$row['sessionId'],
        ['course' => $slot['course'], 'centre' => $slot['centre'], 'date' => $slot['date'], 'added' => $added], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'session' => club_class_public($row, $roster), 'attendanceAdded' => $added];
}

/** instructor.class.plan — carry-over, aim, steps, and the groups/pairs as the instructor left them. */
function instructor_class_plan(array $p): array {
    $g = club_class_gate($p); if (empty($g['ok'])) return $g;
    $slot = club_class_slot($g, $p); if (empty($slot['ok'])) return $slot;
    $in = is_array($p['plan'] ?? null) ? $p['plan'] : [];
    $aim = mb_substr(trim((string)($in['aim'] ?? '')), 0, 300);
    if (mb_strlen($aim) < 4) return ['ok' => false, 'error' => 'aim_required'];
    $steps = [];
    foreach (array_slice((array)($in['steps'] ?? []), 0, 8) as $s) {
        $t = mb_substr(trim((string)($s['title'] ?? '')), 0, 120);
        if ($t === '') continue;
        $steps[] = ['title' => $t, 'minutes' => max(0, min(120, (int)($s['minutes'] ?? 0)))];
    }
    $plan = ['aim' => $aim, 'carryOver' => mb_substr(trim((string)($in['carryOver'] ?? '')), 0, 400), 'steps' => $steps,
        'support' => mb_substr(trim((string)($in['support'] ?? '')), 0, 300), 'stretch' => mb_substr(trim((string)($in['stretch'] ?? '')), 0, 300),
        'minutes' => array_sum(array_column($steps, 'minutes'))];
    $row = club_class_put($g, $slot, ['planJson' => json_encode($plan, JSON_UNESCAPED_UNICODE), 'planAt' => now_iso()]);
    return ['ok' => true, 'session' => club_class_public($row, club_class_roster($g, $slot['course'], $slot['centre'], $slot['date']))];
}

/** instructor.class.hinge — the question and its tally (counts per option). */
function instructor_class_hinge(array $p): array {
    $g = club_class_gate($p); if (empty($g['ok'])) return $g;
    $slot = club_class_slot($g, $p); if (empty($slot['ok'])) return $slot;
    $q = mb_substr(trim((string)($p['question'] ?? '')), 0, 300);
    $opts = array_values(array_filter(array_map(static fn($o) => mb_substr(trim((string)$o), 0, 80), array_slice((array)($p['options'] ?? []), 0, 5)), static fn($o) => $o !== ''));
    if ($q === '' || count($opts) < 2) return ['ok' => false, 'error' => 'question_and_two_options'];
    $correct = (int)($p['correct'] ?? -1);
    $tally = [];
    foreach ($opts as $i => $_) $tally[$i] = max(0, min(200, (int)(($p['tally'] ?? [])[$i] ?? 0)));
    $hinge = ['question' => $q, 'options' => $opts, 'correct' => ($correct >= 0 && $correct < count($opts)) ? $correct : null, 'tally' => $tally,
        'trippedUp' => mb_substr(trim((string)($p['trippedUp'] ?? '')), 0, 300)];
    $row = club_class_put($g, $slot, ['hingeJson' => json_encode($hinge, JSON_UNESCAPED_UNICODE)]);
    return ['ok' => true, 'session' => club_class_public($row, club_class_roster($g, $slot['course'], $slot['centre'], $slot['date']))];
}

/** instructor.class.exit — per member got/partly/not, the misconception, the feedback. */
function instructor_class_exit(array $p): array {
    $g = club_class_gate($p); if (empty($g['ok'])) return $g;
    $slot = club_class_slot($g, $p); if (empty($slot['ok'])) return $slot;
    $roster = club_class_roster($g, $slot['course'], $slot['centre'], $slot['date']);
    $ids = array_column($roster, 'memberId');
    $res = [];
    foreach ((array)($p['results'] ?? []) as $mid => $v) if (in_array((string)$mid, $ids, true) && in_array($v, CLUB_EXIT_MARKS, true)) $res[(string)$mid] = $v;
    $exit = ['question' => mb_substr(trim((string)($p['question'] ?? '')), 0, 300), 'results' => (object)$res,
        'misconception' => mb_substr(trim((string)($p['misconception'] ?? '')), 0, 400),
        'feedback' => mb_substr(trim((string)($p['feedback'] ?? '')), 0, 600)];
    $fields = ['exitJson' => json_encode($exit, JSON_UNESCAPED_UNICODE)];
    if (!empty($p['done'])) {
        if (!$res) return ['ok' => false, 'error' => 'no_results'];
        $fields['exitAt'] = now_iso();
    }
    $row = club_class_put($g, $slot, $fields);
    $counts = array_count_values(array_values($res));
    return ['ok' => true, 'session' => club_class_public($row, $roster),
        'summary' => ['got' => $counts['got'] ?? 0, 'partly' => $counts['partly'] ?? 0, 'not' => $counts['not'] ?? 0]];
}

/**
 * instructor.class.log — the summary and remarks. Filing sends each remark to
 * the member's thread (their mentor reads it) once; a refile does not resend.
 */
function instructor_class_log(array $p): array {
    $g = club_class_gate($p); if (empty($g['ok'])) return $g;
    $slot = club_class_slot($g, $p); if (empty($slot['ok'])) return $slot;
    $roster = club_class_roster($g, $slot['course'], $slot['centre'], $slot['date']);
    $ids = array_column($roster, 'memberId');
    $row = club_class_row($slot['course'], $slot['centre'], $slot['date']);
    $old = club_json($row['logJson'] ?? '');
    $remarks = [];
    foreach ((array)($p['remarks'] ?? []) as $mid => $t) {
        $t = mb_substr(trim((string)$t), 0, 600);
        if ($t !== '' && in_array((string)$mid, $ids, true)) $remarks[(string)$mid] = $t;
    }
    $summary = mb_substr(trim((string)($p['summary'] ?? '')), 0, 1000);
    $log = ['summary' => $summary, 'remarks' => (object)$remarks, 'sent' => (object)($old['sent'] ?? [])];
    $fields = [];
    $sent = 0;
    if (!empty($p['file'])) {
        if ($summary === '') return ['ok' => false, 'error' => 'summary_required'];
        if ((string)($row['rollClosedAt'] ?? '') === '') return ['ok' => false, 'error' => 'roll_not_closed'];
        $done = (array)($old['sent'] ?? []);
        foreach ($remarks as $mid => $t) {
            if (($done[$mid] ?? '') === md5($t)) continue;
            $r = remark_add(['requesterId' => (string)$g['member']['memberId'], 'subjectId' => $mid, 'kind' => 'progress', 'body' => $t, 'ip' => (string)($p['ip'] ?? '')]);
            if (!empty($r['ok'])) { $done[$mid] = md5($t); $sent++; }
        }
        $log['sent'] = (object)$done;
        $fields['filedAt'] = now_iso();
    }
    $fields['logJson'] = json_encode($log, JSON_UNESCAPED_UNICODE);
    $row = club_class_put($g, $slot, $fields);
    return ['ok' => true, 'session' => club_class_public($row, $roster), 'remarksSent' => $sent];
}

/**
 * instructor.today — the instructor's Today page: the class picker, the next
 * session with its loop, the To do list in server order, and the class at a
 * glance. Every figure names the screen it comes from.
 */
function instructor_today(array $p): array {
    $c = instructor_class($p);
    if (empty($c['ok'])) return $c;
    $g = club_class_gate($p);
    $today = $c['today'];
    $todo = [];
    // 1. Safeguarding: open flagged remarks about members of this class.
    $ids = array_column($c['roster'], 'memberId');
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT subjectId, subjectName, createdAt FROM student_remarks WHERE safeguarding = 1 AND status = 'open' AND subjectId IN ($ph) ORDER BY id DESC LIMIT 3", $ids) as $r)
            $todo[] = portal_todo('safeguarding', 'lifebuoy', mp_first((string)$r['subjectName']) . ' has an open safeguarding flag', 'Raised ' . substr((string)$r['createdAt'], 0, 10) . ' · a lead is handling it; add what you know', 'Open', '/instructor/students/' . rawurlencode((string)$r['subjectId']), 'danger', 1);
    }
    // 2. Deadlines: an unfiled past log, today's session steps.
    $prev = club_class_previous($c['course'], $c['centre'], $c['date'] > $today ? $today : $c['date']);
    if ($prev && (string)$prev['filedAt'] === '' && $prev['date'] < $today)
        $todo[] = portal_todo('log-' . $prev['date'], 'notebook', 'File the log for ' . gmdate('j M', strtotime($prev['date'])), 'Remarks reach mentors only once it is filed', 'File it', '/instructor/saturday/log?date=' . $prev['date'], 'warning', 2, $prev['date']);
    // Results: members needing attention this term.
    $res = instructor_results($p + ['filter' => 'attn']);
    if (!empty($res['ok']) && $res['counts']['attn'] > 0)
        $todo[] = portal_todo('results-attn', 'chart-line-down', $res['counts']['attn'] . ' school result' . ($res['counts']['attn'] === 1 ? ' needs' : 's need') . ' your eye', $res['termLabel'] . ' · below ' . $res['thresholds']['minAvg'] . ', falling, or a stalled plan', 'Review', '/instructor/progress/results?filter=attn', 'warning', 2, $res['dueOn']);
    // 3. Replies owed: written answers waiting to be marked.
    $marking = function_exists('staff_curriculum') ? staff_curriculum($p) : ['ok' => false];
    $pending = !empty($marking['ok']) ? count($marking['pending'] ?? []) : 0;
    if ($pending) $todo[] = portal_todo('marking', 'check-square', $pending . ' answer' . ($pending === 1 ? '' : 's') . ' to mark', 'Members are waiting for your feedback', 'Mark', '/instructor/progress', 'info', 3);
    // 4. Preparation for the next session.
    $loop = $c['loop'];
    if ($c['date'] >= $today && $loop['steps']['plan'] !== 'done')
        $todo[] = portal_todo('plan', 'clipboard-text', 'Plan ' . ($c['date'] === $today ? 'today' : gmdate('l j M', strtotime($c['date']))), $c['lesson'] ? 'Week ' . $c['lesson']['week'] . ': ' . $c['lesson']['title'] : 'Aim, steps, and who needs support or stretch', 'Plan', '/instructor/saturday/plan', 'neutral', 4, $c['date']);
    if ($c['carryOver']['notYet'])
        $todo[] = portal_todo('carry', 'arrow-bend-down-right', count($c['carryOver']['notYet']) . ' didn’t get last week’s exit ticket', 'Start with them: ' . implode(', ', array_map(static fn($x) => mp_first($x['fullName']), array_slice($c['carryOver']['notYet'], 0, 3))), 'See them', '/instructor/saturday/plan', 'neutral', 4);
    usort($todo, static fn($a, $b) => [$a['rank'], $a['deadline'] === '' ? '9999' : $a['deadline']] <=> [$b['rank'], $b['deadline'] === '' ? '9999' : $b['deadline']]);
    return ['ok' => true, 'course' => $c['course'], 'centre' => $c['centre'], 'date' => $c['date'], 'today' => $today,
        'courses' => $c['courses'], 'centres' => $c['centres'], 'lesson' => $c['lesson'], 'loop' => $loop,
        'counts' => $c['session']['counts'], 'todo' => array_map(static fn($t) => array_diff_key($t, ['rank' => 1]), $todo),
        'glance' => ['class' => count($c['roster']), 'here' => $c['session']['counts']['here'] + $c['session']['counts']['late'],
            'marking' => $pending, 'resultsAttention' => !empty($res['ok']) ? $res['counts']['attn'] : 0,
            'resultsMissing' => !empty($res['ok']) ? $res['counts']['missing'] : 0]];
}

/** One To do row. rank: 1 safeguarding · 2 deadline · 3 reply owed · 4 preparation · 5 other. */
function portal_todo(string $key, string $icon, string $title, string $subtitle, string $cta, string $route, string $tone, int $rank, string $deadline = ''): array {
    return ['key' => $key, 'icon' => $icon, 'title' => $title, 'subtitle' => $subtitle, 'cta' => $cta, 'route' => $route, 'tone' => $tone, 'rank' => $rank, 'deadline' => $deadline];
}

/* ── The member's Today ──────────────────────────────────────────────────── */

/**
 * member.today — what a member checks daily, in the order the IA fixes:
 * standing, account, To do (server-ordered), this week, where you stand.
 * Every block is read from the screen that owns it, so the figure on Today
 * and the figure on its own screen cannot disagree. A block that fails to
 * read is left out, never invented.
 */
function member_today(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg_member'];
    $today = results_today();
    $todo = [];
    $badges = [];

    // 1. Standing.
    $standing = null;
    try {
        $c = member_compliance(['memberId' => $mid]);
        if (!empty($c['ok']) && !empty($c['enabled']) && in_array((string)$c['state'], ['warned', 'dormant', 'suspended', 'evicted'], true))
            $standing = ['state' => (string)$c['state'], 'until' => (string)$c['until'], 'reason' => (string)$c['reason'], 'finesOwed' => (int)$c['finesOwed']];
        $fines = !empty($c['ok']) ? (int)$c['finesOwed'] : 0;
    } catch (\Throwable $e) { $fines = 0; }

    // 2. Account.
    $account = null;
    try {
        $f = member_fees_account(['memberId' => $mid]);
        if (!empty($f['ok']) && !empty($f['enabled']) && $f['account']) {
            $a = $f['account'];
            $paid = 0; $last = null; $year = substr($today, 0, 4);
            foreach ((array)$a['entries'] as $e) {
                if (!empty($e['void']) || ($e['direction'] ?? '') !== 'credit') continue;
                if (substr((string)$e['createdAt'], 0, 4) === $year) $paid += (int)$e['amount'];
                if (!$last) $last = ['amount' => (int)$e['amount'], 'at' => substr((string)$e['createdAt'], 0, 10)];
            }
            $next = null;
            foreach ((array)$a['schedule'] as $r) if (($r['state'] ?? '') !== 'paid' && (string)$r['startDate'] >= $today) { $next = ['label' => (string)$r['name'], 'amount' => (int)$r['amount'], 'on' => (string)$r['startDate']]; break; }
            $account = ['payable' => (int)$a['payable'], 'status' => (int)$a['payable'] > 0 ? 'owing' : 'clear',
                'trainingFee' => (int)$a['trainingFeePerSession'], 'next' => $next, 'paidThisYear' => $paid, 'lastPayment' => $last, 'fines' => $fines];
            if ((int)$a['payable'] > 0) {
                $badges['account/money'] = (int)$a['payable'];
                $todo[] = portal_todo('dues', 'wallet', 'Pay ' . (function_exists('fees_money_text') ? fees_money_text((int)$a['payable']) : (string)$a['payable']), 'Your dues are open · pay, or tell us you already have', 'Pay', '/member/account/money', 'warning', 2, $next['on'] ?? '');
            }
        }
    } catch (\Throwable $e) {}
    if ($fines > 0) $todo[] = portal_todo('fines', 'gavel', 'Fines to settle', 'Under the programme policy · you can appeal from Records', 'See them', '/member/account/money', 'danger', 2, $standing['until'] ?? '');

    // School results.
    $due = results_in_loop($m) ? results_due_for($m, $today) : null;
    if ($due) {
        $badges['grow/results'] = 'due';
        $t = ['upload' => 'Upload your ' . strtolower($due['label']) . ' results', 'check' => 'Check what we read off your report', 'plan' => 'Finish your plan and send it', 'returned' => 'Your mentor sent your plan back'][$due['step']] ?? 'Your results';
        $sub = ($due['overdue'] ? 'Was due ' : 'Due ') . gmdate('l j F', strtotime($due['dueOn'])) . ($due['step'] === 'upload' ? ' · takes about three minutes' : '');
        $todo[] = portal_todo('results', 'exam', $t, $sub, $due['step'] === 'upload' ? 'Upload' : 'Continue', '/member/grow/results', $due['overdue'] ? 'danger' : 'warning', $due['step'] === 'returned' ? 3 : 2, $due['dueOn']);
    }

    // Assignments due in the next week, not yet handed in.
    try {
        $open = 0;
        foreach ((array)(assignment_list_for_member(['memberId' => $mid])['assignments'] ?? []) as $a) {
            if ($a['submission']) continue;
            $open++;
            $dueOn = substr((string)$a['dueAt'], 0, 10);
            if ($dueOn !== '' && $dueOn <= gmdate('Y-m-d', strtotime($today . 'T00:00:00Z') + 7 * 86400))
                $todo[] = portal_todo('asg-' . $a['assignmentId'], 'pencil-simple-line', (string)$a['title'], ($dueOn < $today ? 'Overdue since ' : 'Due ') . gmdate('D j M', strtotime($dueOn)), 'Start', '/member/learn', $dueOn < $today ? 'danger' : 'warning', 2, $dueOn);
        }
        if ($open) $badges['learn/lessons'] = $open;
    } catch (\Throwable $e) {}

    // Curriculum lessons past their week.
    try {
        $cur = curriculum_for_member($m);
        foreach ($cur['units'] as $u) if ($u['overdueDays'] > 0 && count($todo) < 14)
            $todo[] = portal_todo('unit-' . $u['unitId'], 'book-open', (string)$u['title'], 'Week ' . $u['week'] . ' · ' . $u['overdueDays'] . ' day' . ($u['overdueDays'] === 1 ? '' : 's') . ' late' . ($u['fineAfterDays'] > 0 && $u['overdueDays'] < $u['fineAfterDays'] ? ' · a fine after ' . $u['fineAfterDays'] : ''), 'Open', '/member/learn', 'warning', 2, (string)$u['dueDate']);
    } catch (\Throwable $e) {}

    // 3. Replies owed: unread messages from the mentor.
    $unread = (int)(db_row("SELECT COUNT(*) n FROM notifications WHERE memberId = ? AND kind = 'mentor' AND (readAt = '' OR readAt IS NULL)", [$mid])['n'] ?? 0);
    if ($unread) { $badges['mentor/chat'] = $unread; $todo[] = portal_todo('mentor', 'chat-circle-text', $unread === 1 ? 'Your mentor wrote to you' : "{$unread} messages from your mentor", 'Read and reply before Saturday', 'Read', '/member/mentor', 'info', 3); }

    // 4. Preparation: this week's check-in, this week's plan sessions.
    $week = iso_week_period(mp_lagos_now());
    $chk = db_row('SELECT wellbeing FROM member_checkins WHERE memberId = ? AND week = ? LIMIT 1', [$mid, $week]);
    $plan = db_row("SELECT * FROM growth_plans WHERE memberId = ? AND status IN ('sent','live') ORDER BY term DESC LIMIT 1", [$mid]);
    $promises = null;
    if ($plan) {
        $pub = results_plan_public($plan, $today);
        $left = 0;
        foreach ($pub['items'] as $it) $left += max(0, $it['sessionsPerWeek'] - $it['doneThisWeek']);
        $promises = ['planId' => $pub['planId'], 'items' => $pub['items'], 'adherence' => $pub['adherence'], 'status' => $pub['status']];
        if ($left > 0) $todo[] = portal_todo('promises', 'check-circle', "{$left} study session" . ($left === 1 ? '' : 's') . ' left this week', 'Your plan · tick each one when it’s done', 'Tick', '/member/grow/results', 'neutral', 4);
    }
    $sat = club_class_next_date($today);

    usort($todo, static fn($a, $b) => [$a['rank'], $a['deadline'] === '' ? '9999' : $a['deadline']] <=> [$b['rank'], $b['deadline'] === '' ? '9999' : $b['deadline']]);

    // 5. Where you stand.
    $stats = db_row('SELECT level, streak, currentWeek FROM member_stats WHERE memberId = ? LIMIT 1', [$mid]) ?: [];
    $sc = db_all("SELECT month, total FROM mentor_scorecards WHERE subjectId = ? AND byKind = 'mentor' ORDER BY month DESC LIMIT 2", [$mid]);
    $mentor = results_mentor_of($mid);
    return ['ok' => true, 'today' => $today, 'firstName' => mp_first((string)$m['fullName']),
        'standing' => $standing, 'account' => $account,
        'todo' => array_map(static fn($t) => array_diff_key($t, ['rank' => 1]), $todo),
        'checkin' => ['done' => (bool)$chk, 'wellbeing' => (string)($chk['wellbeing'] ?? ''), 'week' => $week],
        'week' => ['saturday' => $sat, 'isToday' => $sat === $today, 'centre' => (string)$m['centre'], 'track' => (string)$m['track'],
            'mentor' => $mentor ? ['name' => (string)$mentor['fullName'], 'first' => mp_first((string)$mentor['fullName'])] : null],
        'promises' => $promises,
        'glance' => ['index' => $sc ? (int)$sc[0]['total'] : null, 'indexChange' => count($sc) === 2 ? (int)$sc[0]['total'] - (int)$sc[1]['total'] : null,
            'indexMonth' => (string)($sc[0]['month'] ?? ''), 'level' => (int)($stats['level'] ?? 1), 'streak' => (int)($stats['streak'] ?? 0), 'week' => (int)($stats['currentWeek'] ?? 0)],
        'badges' => (object)$badges];
}

/* ── Analytics and the student profile ───────────────────────────────────── */

/**
 * instructor.class.history — the last N Saturdays of one class: who was here,
 * how the exit ticket went, whether the log was filed. Feeds Analytics.
 */
function instructor_class_history(array $p): array {
    $g = club_class_gate($p); if (empty($g['ok'])) return $g;
    $slot = club_class_slot($g, $p + ['date' => results_today()]); if (empty($slot['ok'])) return $slot;
    $roster = club_class_roster($g, $slot['course'], $slot['centre'], $slot['date']);
    $ids = array_column($roster, 'memberId');
    $rows = db_all('SELECT * FROM club_class_sessions WHERE course = ? AND centre = ? AND date <= ? ORDER BY date DESC LIMIT 12', [$slot['course'], $slot['centre'], $slot['date']]);
    $weeks = [];
    $per = array_fill_keys($ids, ['here' => 0, 'of' => 0, 'got' => 0, 'exits' => 0]);
    foreach (array_reverse($rows) as $r) {
        $roll = club_json($r['rollJson']); $exit = club_json($r['exitJson']);
        $res = (array)($exit['results'] ?? []);
        $c = array_count_values(array_values($res));
        $here = count(array_filter($roll, static fn($v) => $v !== 'away'));
        $weeks[] = ['date' => (string)$r['date'], 'here' => $here, 'away' => count($roll) - $here, 'closed' => (string)$r['rollClosedAt'] !== '',
            'exit' => ['got' => $c['got'] ?? 0, 'partly' => $c['partly'] ?? 0, 'not' => $c['not'] ?? 0], 'filed' => (string)$r['filedAt'] !== '',
            'aim' => (string)(club_json($r['planJson'])['aim'] ?? '')];
        if ((string)$r['rollClosedAt'] !== '') foreach ($ids as $id) { $per[$id]['of']++; if (isset($roll[$id]) && $roll[$id] !== 'away') $per[$id]['here']++; }
        foreach ($res as $id => $v) if (isset($per[$id])) { $per[$id]['exits']++; if ($v === 'got') $per[$id]['got']++; }
    }
    $students = [];
    $levels = club_class_levels($roster, $slot['course']);
    foreach ($roster as $r) {
        $x = $per[$r['memberId']];
        $students[] = ['memberId' => $r['memberId'], 'fullName' => $r['fullName'],
            'attendance' => $x['of'] ? (int)round($x['here'] / $x['of'] * 100) : null, 'exitGot' => $x['exits'] ? (int)round($x['got'] / $x['exits'] * 100) : null,
            'level' => $levels['by'][$r['memberId']] ?? null];
    }
    // Skill distribution: how many members sit at each level, per skill.
    $dist = [];
    if ($levels['skills'] && $ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach ($levels['skills'] as $sk) $dist[$sk] = [1 => 0, 2 => 0, 3 => 0, 4 => 0];
        foreach (db_all("SELECT skill, level FROM skill_marks WHERE course = ? AND subjectId IN ($ph)", array_merge([$slot['course']], $ids)) as $r)
            if (isset($dist[(string)$r['skill']][(int)$r['level']])) $dist[(string)$r['skill']][(int)$r['level']]++;
    }
    return ['ok' => true, 'course' => $slot['course'], 'centre' => $slot['centre'], 'weeks' => $weeks, 'students' => $students,
        'skills' => $levels['skills'], 'distribution' => (object)$dist, 'levels' => SKILL_LEVELS];
}

/** instructor.student — one member of the class: overview, skills, attendance, remarks, results, history. */
function instructor_student(array $p): array {
    $g = club_class_gate($p); if (empty($g['ok'])) return $g;
    $m = results_staff_member($g, (string)($p['studentId'] ?? ''));
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $id = (string)$m['memberId'];
    $course = (string)$m['track'];
    $skills = course_skills($course);
    $marks = [];
    foreach (db_all('SELECT skill, level, prevLevel, evidence, markedByName, updatedAt FROM skill_marks WHERE subjectId = ? AND course = ?', [$id, $course]) as $r)
        $marks[(string)$r['skill']] = ['level' => (int)$r['level'], 'prev' => $r['prevLevel'] === null ? null : (int)$r['prevLevel'], 'evidence' => (string)$r['evidence'], 'by' => (string)$r['markedByName'], 'at' => (string)$r['updatedAt']];
    $att = array_map(static fn($r) => ['date' => (string)$r['date'], 'status' => (string)($r['status'] ?? ''), 'method' => (string)$r['method']],
        db_all("SELECT date, status, method FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 12", [$id]));
    $sessions = db_all('SELECT date, rollJson, exitJson, logJson FROM club_class_sessions WHERE course = ? AND centre = ? ORDER BY date DESC LIMIT 12', [$course, (string)$m['centre']]);
    $timeline = [];
    foreach ($sessions as $s) {
        $roll = club_json($s['rollJson']); $exit = club_json($s['exitJson']); $log = club_json($s['logJson']);
        $timeline[] = ['date' => (string)$s['date'], 'roll' => (string)($roll[$id] ?? ''), 'exit' => (string)(((array)($exit['results'] ?? []))[$id] ?? ''), 'remark' => (string)(((array)($log['remarks'] ?? []))[$id] ?? '')];
    }
    $rem = remark_list(['requesterId' => (string)$g['member']['memberId'], 'subjectId' => $id]);
    $mentor = results_mentor_of($id);
    $term = (string)(db_row('SELECT term FROM results_uploads WHERE memberId = ? AND status = ? ORDER BY term DESC LIMIT 1', [$id, 'sent'])['term'] ?? '');
    $history = array_merge(
        array_map(static fn($r) => ['at' => (string)$r['at'], 'who' => (string)$r['who'], 'what' => (string)$r['what'], 'type' => 'results'], results_history($id, '', 20)),
        array_map(static fn($r) => ['at' => (string)$r['createdAt'], 'who' => (string)$r['authorName'], 'what' => ucfirst((string)$r['kind']) . ' remark', 'type' => 'remark'], array_slice((array)($rem['remarks'] ?? []), 0, 20)),
        array_map(static fn($k, $v) => ['at' => (string)$v['at'], 'who' => (string)$v['by'], 'what' => $k . ': ' . (SKILL_LEVELS[$v['level']] ?? '') . ($v['evidence'] !== '' ? ' — ' . $v['evidence'] : ''), 'type' => 'skill'], array_keys($marks), $marks));
    usort($history, static fn($a, $b) => strcmp($b['at'], $a['at']));
    return ['ok' => true, 'member' => ['memberId' => $id, 'fullName' => (string)$m['fullName'], 'first' => mp_first((string)$m['fullName']), 'track' => $course, 'centre' => (string)$m['centre'],
            'mentor' => $mentor ? (string)$mentor['fullName'] : ''],
        'skills' => $skills, 'marks' => (object)$marks, 'levels' => SKILL_LEVELS, 'attendance' => $att, 'timeline' => $timeline,
        'remarks' => (array)($rem['remarks'] ?? []), 'remarkKinds' => REMARK_KINDS,
        'results' => $term !== '' ? results_record($m, $term, results_today()) : null, 'history' => array_slice($history, 0, 40)];
}
