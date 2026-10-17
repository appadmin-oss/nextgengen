<?php
declare(strict_types=1);
/**
 * The Mentor Portal (design handoff: mentor portal v14).
 *
 * Where a mentor runs their caseload: who needs them, goals, sessions,
 * Saturday, the NGG Leadership Index, messages and family updates, and their
 * own Commitment and Conduct Policy. Everything here goes through
 * mentor_gate(), so the people a mentor may see are the people the rest of the
 * mentor API lets them see — nothing in this file widens that.
 *
 * FIVE ROLES (mp_role): pod (5–8 mentees), peer (an older member, ≤ 3, no
 * family contact, notes shared with the lead), instructor (class-sized), lead
 * (own pod + the mentors they lead) and coord (the whole centre). Staff open
 * the portal as coord.
 *
 * DERIVED FLAGS ARE THE SERVER'S (DATA_MODEL.md). The rules are a port of
 * code/mt-rules.js — urgency, the stalled rule, the one-active-goal rule and
 * the commitment statuses — with thresholds the NGG admin owns
 * (Settings › Mentorship automations), never the mentor.
 *
 * PRIVACY (README §Global behaviour): private journal entries are never read
 * here; a child's own relationship answers reach the mentor only as a score;
 * concerns go to the safeguarding queue and never onto the child's record;
 * guardian phones are masked; family messages wait for 8am–8pm Lagos.
 */

const MP_SKILLS = [
    ['Communication', 'Speaks and listens clearly'],
    ['Confidence', 'Acts without needing permission'],
    ['Critical Thinking', 'Questions, reasons, weighs evidence'],
    ['Initiative', 'Starts things without being asked'],
    ['Team Building', 'Brings others in and helps them work together'],
    ['Execution', 'Finishes what they start'],
    ['Problem Solving', 'Finds a way when stuck'],
    ['Accountability', 'Owns mistakes and keeps their word'],
    ['Service', 'Creates value for others'],
    ['Multiplication', 'Grows other people, not just themselves'],
];
const MP_DEFAULTS = ['overdueDays' => 14, 'stalledDays' => 21, 'familyDays' => 30, 'relGap' => 2, 'relLow' => 2, 'relWeeks' => 6,
                     'minCaseload' => 5, 'minSaturdays' => 2, 'goalCheckDays' => 14, 'scorecardLockDay' => 8, 'peerMax' => 3,
                     'checkinSilenceWeeks' => 3, 'absentSaturdays' => 2, 'mentorQuietDays' => 14, 'unmatchedDays' => 30, 'scoreDrop' => 8,
                     'supervisionDays' => 45, 'concernHours' => 24];
const MP_LEVELS = ['Low', 'Steady', 'Strong', 'Exceptional'];
const MP_VALUES = ['Courage', 'Responsibility', 'Respect', 'Teamwork'];
/* The Saturday Formation Schedule's mentor duties, ticked per child: 8:00 punctuality
 * and assignment completion, and the 1:45 mentor check-out. */
const MP_CHECKS = ['On time', 'Assignment in', 'Checked out'];
const MP_NOTE_MAX = 500;
const MP_SESSION_KINDS = ['One-to-one' => 'one-to-one', 'Pod session' => 'pod', 'Family' => 'family', 'Phone or message' => 'phone', 'Note' => 'note'];
const MP_CONCERN_KINDS = ['Something they told me', 'Injury or harm', 'Neglect', 'Online safety', 'An adult’s behaviour', 'Something else'];
const MP_REL_Q = ['We talk about things that matter to them', 'They can tell me when something is wrong', 'I know what they want from our time', 'Our time helps them move forward'];
const MP_REL_Q_CHILD = ['We talk about things that matter to me', 'I can tell my mentor when something is wrong', 'My mentor knows what I want from our time', 'Our time helps me move forward'];
const MP_QUIET_FROM = 20;   // 8pm Lagos
const MP_QUIET_TO = 8;      // 8am Lagos

/* ── Settings the NGG admin owns ─────────────────────────────────────────── */

function mp_opts(): array {
    $s = function_exists('setting_get') ? setting_get('mentor_automation') : null;
    $th = is_array($s['thresholds'] ?? null) ? $s['thresholds'] : [];
    $o = MP_DEFAULTS;
    foreach ($o as $k => $v) if (isset($th[$k]) && is_numeric($th[$k]) && (int)$th[$k] > 0) $o[$k] = (int)$th[$k];
    return $o;
}
function mp_lagos_now(): int { return time() + 3600; }
function mp_today(array $p = []): string {
    $t = trim((string)($p['today'] ?? ''));
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $t) ? $t : gmdate('Y-m-d', mp_lagos_now());
}
function mp_days(string $from, string $to): int {
    if ($from === '') return PHP_INT_MAX;
    return (int)floor((strtotime(substr($to, 0, 10) . 'T00:00:00Z') - strtotime(substr($from, 0, 10) . 'T00:00:00Z')) / 86400);
}
function mp_first(string $name): string { $p = preg_split('/\s+/', trim($name)); return (string)($p[0] ?? ''); }
function mp_initials(string $name): string {
    $p = array_values(array_filter(preg_split('/\s+/', trim(preg_replace('/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i', '', $name))) ?: []));
    return strtoupper(mb_substr($p[0] ?? '?', 0, 1) . mb_substr($p[count($p) - 1] ?? '', 0, count($p) > 1 ? 1 : 0));
}
function mp_mask_phone(string $ph): string {
    $d = preg_replace('/\D+/', '', $ph);
    return strlen($d) >= 7 ? substr($d, 0, 4) . ' ••• ' . substr($d, -3) : ($d === '' ? '' : '•••');
}
function mp_age(string $dob, string $today): ?int {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}/', $dob)) return null;
    $a = (int)substr($today, 0, 4) - (int)substr($dob, 0, 4);
    if (substr($today, 5, 5) < substr($dob, 5, 5)) $a--;
    return $a >= 0 && $a < 120 ? $a : null;
}
/** The relationship-check cycle a date falls in: 6-week blocks from the first Monday of the year. */
function mp_cycle(string $date, int $weeks = 6): string {
    $t = strtotime(substr($date, 0, 10) . 'T00:00:00Z');
    $w = (int)gmdate('W', $t);
    return gmdate('o', $t) . '-C' . (intdiv(max(1, $w) - 1, max(1, $weeks)) + 1);
}
function mp_in_quiet_hours(?int $t = null): bool {
    $h = (int)gmdate('G', ($t ?? time()) + 3600);
    return $h >= MP_QUIET_FROM || $h < MP_QUIET_TO;
}
function mp_next_send_time(?int $t = null): string {
    $t = $t ?? time();
    if (!mp_in_quiet_hours($t)) return '';
    $lagos = $t + 3600;
    $day = (int)gmdate('G', $lagos) >= MP_QUIET_FROM ? gmdate('Y-m-d', $lagos + 86400) : gmdate('Y-m-d', $lagos);
    return gmdate('Y-m-d\TH:i:s\Z', strtotime($day . 'T0' . MP_QUIET_TO . ':00:00Z') - 3600);
}

/* ── Who is asking: the gate, and the role ───────────────────────────────── */

/**
 * pod | peer | instructor | lead | coord. A mentor record's own `kind` wins;
 * otherwise a lead is a lead, staff are coordinators, and a mentor who is
 * themselves an NGG member under 20 is a peer mentor.
 */
function mp_role(array $g, ?array $mentor = null): string {
    $role = (string)($g['role'] ?? '');
    if ($role === 'instructor') return 'instructor';
    /* Staff reach wins over the mentor record, as it does in mentor_gate: an
     * admin who also mentors a pod has the record's kind ('pod'), and letting
     * it win showed them their six mentees instead of the centre they oversee.
     * Their own mentees are inside that view. */
    if ($role === 'admin') return 'coord';
    $kind = strtolower(trim((string)($mentor['kind'] ?? '')));
    if (in_array($kind, ['pod', 'peer', 'lead', 'coord', 'instructor'], true)) return $kind;
    if ($role === 'admin' && !$mentor) return 'coord';
    if (($g['rank'] ?? '') === 'lead' || strtolower((string)($mentor['rank'] ?? '')) === 'lead') return 'lead';
    if ($role === 'admin') return 'coord';
    if ($mentor && trim((string)($mentor['memberId'] ?? '')) !== '') {
        $m = db_row('SELECT dob, type FROM members WHERE memberId = ? LIMIT 1', [(string)$mentor['memberId']]);
        $age = $m ? mp_age((string)$m['dob'], gmdate('Y-m-d')) : null;
        if ($age !== null && $age < 20) return 'peer';
    }
    return 'pod';
}

/** The role alone, for auth/me (the app chooses the portal's shape from it). */
function mp_role_for(string $memberId): string {
    $g = mp_gate(['requesterId' => $memberId]);
    return !empty($g['ok']) ? (string)$g['mpRole'] : '';
}

/** mentor_gate + the mentor row + the role + the lead they report to. */
function mp_gate(array $p): array {
    $GLOBALS['__mp_case'] = [];
    $g = mentor_gate($p);
    if (empty($g['ok'])) return $g;
    $mid = (string)($g['mentorId'] ?? '');
    $mentor = $mid !== '' ? db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mid]) : null;
    $role = mp_role($g, $mentor);
    $lead = null;
    if ($mentor && trim((string)($mentor['leadId'] ?? '')) !== '') {
        $lead = db_row('SELECT mentorId, fullName, memberId FROM mentors WHERE mentorId = ? LIMIT 1', [(string)$mentor['leadId']]);
    }
    if (!$lead && $mentor && $role !== 'lead') {
        $lead = db_row("SELECT mentorId, fullName, memberId FROM mentors WHERE status = 'active' AND mentors.rank = 'lead' AND centre = ? AND mentorId <> ? ORDER BY id LIMIT 1",
                       [(string)$mentor['centre'], $mid]);
    }
    return $g + ['mentorRow' => $mentor, 'mpRole' => $role, 'lead' => $lead, 'me' => (string)$g['member']['memberId'],
                 'wantCentre' => trim((string)($p['centre'] ?? ''))];
}

/**
 * The caseload's member ids. pod / peer: the members paired with this mentor.
 * lead: their own, plus those of the mentors they lead (or, with nobody
 * named, the mentors at their centre). coord and instructor: the NGG members
 * the roster lets them see. Capped at 400, the roster's own cap.
 */
function mp_caseload_ids(array $g): array {
    // Read once per request: several panels of one view ask for it. The gate
    // clears it, so every op starts from the database.
    $key = $g['me'] . '|' . $g['mpRole'] . '|' . ($g['wantCentre'] ?? '');
    return $GLOBALS['__mp_case'][$key] ??= mp_caseload_ids_read($g);
}
function mp_caseload_ids_read(array $g): array {
    $role = $g['mpRole']; $mid = (string)($g['mentorId'] ?? '');
    // No child's record reaches a mentor whose safeguarding screening is not
    // recorded. The Academy can run alongside the work; the check cannot.
    if (!mp_screened($g)) return [];
    if (in_array($role, ['pod', 'peer'], true) || ($role === 'lead' && $mid !== '')) {
        $ids = $mid !== '' ? array_column(db_all("SELECT memberId FROM mentor_assignments WHERE mentorId = ? AND status = 'active'", [$mid]), 'memberId') : [];
        if ($role === 'lead') {
            $team = array_column(db_all("SELECT mentorId FROM mentors WHERE status = 'active' AND (leadId = ? OR (COALESCE(leadId,'') = '' AND centre = ? AND mentors.rank <> 'lead'))",
                                        [$mid, (string)($g['mentorRow']['centre'] ?? '')]), 'mentorId');
            if ($team) {
                $ph = implode(',', array_fill(0, count($team), '?'));
                $ids = array_merge($ids, array_column(db_all("SELECT memberId FROM mentor_assignments WHERE status = 'active' AND mentorId IN ($ph)", $team), 'memberId'));
            }
        }
        return array_slice(array_values(array_unique(array_map('strval', $ids))), 0, 400);
    }
    // coord / instructor: what the roster lets them see, one centre at a time.
    $args = ['requesterId' => $g['me'], 'scope' => $role === 'instructor' ? 'mine' : 'centre', 'centre' => (string)($g['wantCentre'] ?? ''), 'programme' => 'ngg'];
    $r = mentor_roster($args);
    if (!empty($r['ok']) && !empty($r['needsCentre']) && !empty($r['centres'])) $r = mentor_roster(['centre' => (string)$r['centres'][0]] + $args);
    if (empty($r['ok'])) return [];
    return array_slice(array_values(array_map(static fn($s) => (string)$s['studentId'], array_filter($r['students'] ?? [], static fn($s) => ($s['kind'] ?? '') === 'member'))), 0, 400);
}
/** Screened: staff, or a mentor whose check is recorded (here or on their volunteer record). */
/** Screened is decided once, in mentor_gate, per lane: staff by their role, a
 *  volunteer by a cleared safeguarding record (the gate refuses one that is
 *  not), a mentor by their record. An instructor is no longer screened by
 *  being an instructor. Absent means not screened. */
function mp_screened(array $g): bool {
    return ($g['screened'] ?? false) === true;
}
/** The centres a coordinator may switch between, and the one on screen. */
function mp_centres(array $g): array {
    if (!in_array($g['mpRole'], ['coord', 'instructor'], true)) return ['centre' => (string)($g['mentorRow']['centre'] ?? ''), 'centres' => []];
    $pick = function_exists('mentor_scope_centres') ? mentor_scope_centres($g + ['onlyProgramme' => 'ngg']) : [];  // the NGG portal offers NGG centres only
    $want = (string)($g['wantCentre'] ?? '');
    return ['centre' => in_array($want, $pick, true) ? $want : (string)($pick[0] ?? ''), 'centres' => array_values($pick)];
}

/* ── The rules (a port of code/mt-rules.js) ──────────────────────────────── */

function mp_flags(array $m, ?array $activeGoal, string $role, string $today, array $o): array {
    $contact = $m['lastOneToOneAt'] ? mp_days((string)$m['lastOneToOneAt'], $today) : PHP_INT_MAX;
    $r = $m['rel'];
    return [
        'wellbeing' => ($m['wellbeing'] ?? 'Okay') !== 'Okay',
        'contact' => $contact > $o['overdueDays'],
        'rel' => ($r['child'] !== null && $r['child'] <= $o['relLow']) || ($r['child'] !== null && $r['mentor'] !== null && ($r['mentor'] - $r['child']) >= $o['relGap']) || !empty($r['due']),
        'goal' => !$activeGoal || !empty($activeGoal['stalled']),
        'family' => $role !== 'peer' && ($m['lastFamilyUpdateAt'] ? mp_days((string)$m['lastFamilyUpdateAt'], $today) : PHP_INT_MAX) > $o['familyDays'],
        'contactDays' => $contact === PHP_INT_MAX ? null : $contact,
    ];
}
function mp_urgency(array $f, array $o): float {
    $cd = $f['contactDays'] ?? 999;
    return ($f['wellbeing'] ? 6 : 0) + ($f['contact'] ? 2 + max(0, ($cd - $o['overdueDays'])) / 7 : 0) + ($f['rel'] ? 2 : 0) + ($f['goal'] ? 1 : 0) + ($f['family'] ? 1 : 0);
}
function mp_pills(array $m, array $f): array {
    $p = [];
    if ($f['wellbeing']) $p[] = ['label' => 'Struggling', 'tone' => 'bad'];
    if ($f['contact']) $p[] = ['label' => 'One-to-one overdue', 'tone' => 'warn'];
    if ($f['rel']) $p[] = ['label' => !empty($m['rel']['due']) ? 'Check due' : 'Relationship', 'tone' => 'warn'];
    if ($f['family']) $p[] = ['label' => 'Family update', 'tone' => 'neu'];
    return array_slice($p, 0, 2);
}

/* ── The caseload, in grouped reads ──────────────────────────────────────── */

/**
 * Everything the Mentees list, This week and the pickers need, for a list of
 * member ids, in a fixed number of queries however long the list is.
 */
function mp_mentees(array $ids, string $role, string $today, array $o): array {
    $ids = array_values(array_unique(array_filter(array_map('strval', $ids))));
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $members = [];
    foreach (db_all("SELECT memberId, fullName, dob, school, centre, parentName, parentPhone, photoUrl, joinDate, createdAt FROM members WHERE memberId IN ($ph)", $ids) as $r) $members[$r['memberId']] = $r;
    $pair = [];
    foreach (db_all("SELECT a.memberId, a.mentorId, a.startedAt, t.fullName FROM mentor_assignments a LEFT JOIN mentors t ON t.mentorId = a.mentorId
                     WHERE a.status = 'active' AND a.memberId IN ($ph)", $ids) as $r) $pair[$r['memberId']] = $r;
    $match = [];
    foreach (db_all("SELECT memberId, startedAt FROM mentor_matches WHERE status IN ('active','paused','closing') AND memberId IN ($ph)", $ids) as $r) $match[$r['memberId']] = $r;
    $one = []; $fam = [];
    foreach (db_all("SELECT subjectId, kind, MAX(metOn) d FROM mentor_meetings WHERE subjectId IN ($ph) GROUP BY subjectId, kind", $ids) as $r) {
        if (in_array($r['kind'], ['one-to-one', 'one_to_one'], true)) $one[$r['subjectId']] = max($one[$r['subjectId']] ?? '', substr((string)$r['d'], 0, 10));
        if (in_array($r['kind'], ['family', 'phone'], true)) $fam[$r['subjectId']] = max($fam[$r['subjectId']] ?? '', substr((string)$r['d'], 0, 10));
    }
    foreach (db_all("SELECT subjectId, MAX(createdAt) d FROM mentor_messages WHERE kind = 'Family update' AND subjectId IN ($ph) GROUP BY subjectId", $ids) as $r) {
        $fam[$r['subjectId']] = max($fam[$r['subjectId']] ?? '', substr((string)$r['d'], 0, 10));
    }
    $well = [];
    foreach (db_all("SELECT memberId, wellbeing, createdAt FROM member_checkins WHERE memberId IN ($ph) AND createdAt >= ? ORDER BY createdAt", array_merge($ids, [gmdate('Y-m-d', strtotime($today) - 14 * 86400)])) as $r) $well[$r['memberId']] = $r;
    $rel = [];
    foreach (db_all("SELECT subjectId, side, score, cycle, createdAt FROM mentor_rel_checks WHERE subjectId IN ($ph) ORDER BY createdAt", $ids) as $r) $rel[$r['subjectId']][$r['side']] = $r;
    $goals = [];
    foreach (db_all("SELECT id, subjectId, goal, area, status, reviewBy, dueOn, createdAt, updatedAt FROM mentor_goals WHERE status = 'active' AND subjectId IN ($ph)", $ids) as $r) $goals[$r['subjectId']] = $r;
    $checks = $goals ? mentor_goal_checks_for(array_map(static fn($x) => (int)$x['id'], $goals)) : [];
    $out = [];
    foreach ($ids as $id) {
        $m = $members[$id] ?? null;
        if (!$m) continue;
        $start = (string)($match[$id]['startedAt'] ?? $pair[$id]['startedAt'] ?? '');
        $phase = function_exists('ms_phase_for') && $start !== '' ? ms_phase_for(substr($start, 0, 10), $today) : 'grow';
        $week = function_exists('ms_week_of') && $start !== '' ? ms_week_of(substr($start, 0, 10), $today) : 0;
        $rc = $rel[$id]['child'] ?? null; $rm = $rel[$id]['mentor'] ?? null;
        $lastCycle = max((string)($rc['createdAt'] ?? ''), (string)($rm['createdAt'] ?? ''));
        $relDue = $lastCycle === '' ? ($start !== '' && mp_days($start, $today) >= 21) : mp_days($lastCycle, $today) >= $o['relWeeks'] * 7;
        $ag = null;
        if (isset($goals[$id])) {
            $gr = $goals[$id] + ['checks' => $checks[(int)$goals[$id]['id']] ?? []];
            $last = $gr['checks'] ? end($gr['checks']) : null;
            $ag = ['id' => (int)$gr['id'], 'title' => (string)$gr['goal'], 'area' => (string)$gr['area'], 'progress' => $last ? (int)$last['progress'] : 0,
                   'lastCheckAt' => $last ? (string)$last['at'] : null, 'reviewBy' => (string)($gr['reviewBy'] ?: $gr['dueOn']), 'stalled' => mentor_goal_stalled($gr, $today)];
        }
        $row = [
            'id' => $id, 'name' => (string)$m['fullName'], 'first' => mp_first((string)$m['fullName']), 'initials' => mp_initials((string)$m['fullName']),
            'age' => mp_age((string)$m['dob'], $today), 'school' => (string)($m['school'] ?? ''), 'centre' => (string)$m['centre'], 'photoUrl' => (string)($m['photoUrl'] ?? ''),
            'phase' => ucfirst($phase), 'week' => $week, 'mentorId' => (string)($pair[$id]['mentorId'] ?? ''), 'mentorName' => (string)($pair[$id]['fullName'] ?? ''),
            // A peer mentor is a young person themselves: no family's name or number.
            'guardianName' => $role === 'peer' ? '' : (string)($m['parentName'] ?? ''),
            'guardianPhoneMasked' => $role === 'peer' ? '' : mp_mask_phone((string)($m['parentPhone'] ?? '')),
            'lastOneToOneAt' => $one[$id] ?? null,
            'wellbeing' => isset($well[$id]) ? (string)$well[$id]['wellbeing'] : 'Okay',
            'wellbeingAt' => isset($well[$id]) ? substr((string)$well[$id]['createdAt'], 0, 10) : null,
            'rel' => ['child' => $rc ? (int)$rc['score'] : null, 'mentor' => $rm ? (int)$rm['score'] : null, 'due' => $relDue],
            'lastFamilyUpdateAt' => $fam[$id] ?? null,
            'activeGoal' => $ag,
        ];
        $f = mp_flags($row, $ag, $role, $today, $o);
        $row['flags'] = $f; $row['urgency'] = round(mp_urgency($f, $o), 2); $row['pills'] = mp_pills($row, $f);
        $out[] = $row;
    }
    usort($out, static fn($a, $b) => [$b['urgency'], $a['name']] <=> [$a['urgency'], $b['name']]);
    return $out;
}

/* ── Reads ───────────────────────────────────────────────────────────────── */

/** The shell: who I am, my role, my lead, my badges. */
function mp_me(array $g, array $o): array {
    $m = $g['mentorRow'];
    $acad = function_exists('ms_clearance') && $m ? ms_clearance($m) : null;
    return ['name' => (string)($m['fullName'] ?? $g['member']['fullName'] ?? ''), 'memberId' => $g['me'], 'mentorId' => (string)($g['mentorId'] ?? ''),
        'role' => $g['mpRole'], 'centre' => (string)($m['centre'] ?? $g['mentor']['centre'] ?? ''),
        'lead' => $g['lead'] ? ['mentorId' => (string)$g['lead']['mentorId'], 'name' => (string)$g['lead']['fullName'], 'first' => mp_first((string)$g['lead']['fullName'])] : null,
        'academy' => $acad ? ['done' => (int)$acad['modulesDone'], 'required' => (int)$acad['modulesRequired']] : null,
        'screened' => mp_screened($g), 'ngg' => ($g['role'] ?? '') !== 'mentor' || !$m || !function_exists('ms_mentor_is_ngg') || ms_mentor_is_ngg($m),
        'officer' => (function () use ($m, $g) { $o = function_exists('sg_officer') ? sg_officer((string)($m['centre'] ?? $g['mentor']['centre'] ?? '')) : null; return $o ? ['name' => (string)$o['fullName']] : null; })(),
        'centres' => mp_centres($g)['centres'], 'centreOnScreen' => mp_centres($g)['centre'],
        // Which programmes this person may mentor in: /mentor offers the NGG and Summer School portals from it.
        'programmes' => array_values((array)($g['programmes'] ?? [])), 'gateRole' => (string)($g['role'] ?? ''),
        'policyAcceptedAt' => $m ? (string)(db_row('SELECT acceptedAt FROM mentor_policy WHERE mentorId = ? ORDER BY id DESC LIMIT 1', [(string)$m['mentorId']])['acceptedAt'] ?? '') : '',
        'opts' => $o];
}

/** view=caseload — the Mentees list. */
function member_mp_caseload(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $o = mp_opts(); $today = mp_today($p);
    return ['ok' => true, 'me' => mp_me($g, $o), 'today' => $today, 'mentees' => mp_mentees(mp_caseload_ids($g), $g['mpRole'], $today, $o)];
}

/** Unread messages for me (journal shared with me, check-ins with a note, family replies, my lead). */
function mp_unread_count(array $g, array $ids): int {
    $n = (int)(db_row("SELECT COUNT(*) c FROM mentor_messages WHERE toId = ? AND readAt = '' AND kind <> 'From your lead' AND status = 'sent'", [$g['me']])['c'] ?? 0);
    foreach (mp_shared_entries($ids, gmdate('Y-m-d', time() - 21 * 86400)) as $j) if (empty($j['readBy'][$g['me']]) && empty($j['repliedBy'][$g['me']])) $n++;
    return $n;
}
/**
 * Journal entries members shared with their mentor (visibility = mentor; a
 * private entry is never read here), with who has replied to or read each.
 * Two reads, matched in PHP: SQLite and MySQL do not agree on how to join
 * text, so the thread id is never built inside a query.
 */
function mp_shared_entries(array $ids, string $since): array {
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $rows = db_all("SELECT entryId, memberId, createdAt FROM journal WHERE visibility = 'mentor' AND memberId IN ($ph) AND createdAt >= ? ORDER BY createdAt DESC LIMIT 300", array_merge($ids, [$since]));
    if (!$rows) return [];
    $threads = array_map(static fn($r) => 'journal:' . $r['entryId'], $rows);
    $tp = implode(',', array_fill(0, count($threads), '?'));
    $marks = [];
    foreach (db_all("SELECT threadId, kind, fromId FROM mentor_messages WHERE threadId IN ($tp) AND kind IN ('read','Reply')", $threads) as $m) $marks[$m['threadId']][$m['kind']][$m['fromId']] = true;
    foreach ($rows as &$r) { $t = 'journal:' . $r['entryId']; $r['readBy'] = $marks[$t]['read'] ?? []; $r['repliedBy'] = $marks[$t]['Reply'] ?? []; $r['replied'] = !empty($marks[$t]['Reply']); }
    unset($r);
    return $rows;
}

/**
 * view=week — This week: Due now (built in the handoff's order, then sliced),
 * my commitments this week, and the nav badges.
 */
function member_mp_week(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $o = mp_opts(); $today = mp_today($p);
    $ms = mp_mentees(mp_caseload_ids($g), $g['mpRole'], $today, $o);
    $ids = array_column($ms, 'id');
    $due = [];
    foreach (array_slice(array_values(array_filter($ms, static fn($m) => $m['flags']['wellbeing'])), 0, 2) as $m) {
        $due[] = ['key' => 'well:' . $m['id'], 'icon' => 'hand-heart', 'tone' => 'bad', 'title' => $m['first'] . ($m['wellbeing'] === 'Need help' ? ' asked for help' : ' said they’re struggling'),
                  'sub' => 'This week’s check-in · talk to them before Saturday', 'go' => ['screen' => 'mentee', 'id' => $m['id'], 'tab' => 'overview']];
    }
    $unread = mp_unread_count($g, $ids);
    if ($unread) $due[] = ['key' => 'msgs', 'icon' => 'chat-circle-text', 'tone' => 'warn', 'title' => $unread . ' message' . ($unread === 1 ? '' : 's') . ' waiting for you', 'sub' => 'Journal entries, check-ins and family replies', 'go' => ['screen' => 'messages']];
    $over = count(array_filter($ms, static fn($m) => $m['flags']['contact']));
    if ($over) $due[] = ['key' => 'contact', 'icon' => 'clock-countdown', 'tone' => 'warn', 'title' => $over . ' one-to-one' . ($over === 1 ? '' : 's') . ' overdue', 'sub' => 'Not seen one-to-one in over ' . $o['overdueDays'] . ' days', 'go' => ['screen' => 'mentees', 'filter' => 'contact']];
    /* Last Saturday's week. "Today minus two days" is that week only from
     * Saturday to Tuesday; on Wednesday 14 Oct it named W42, so every child
     * seen on Saturday the 10th (W41) read as unreviewed until Friday. */
    $period = iso_week_period(strtotime(mp_last_saturday($today) . 'T12:00:00Z'));
    $revDone = $ids ? array_column(db_all('SELECT subjectId FROM mentor_reviews WHERE period = ? AND subjectId IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([$period], $ids)), 'subjectId') : [];
    $here = mp_last_register($g, $today);
    $open = count(array_diff($here, $revDone));
    if ($open) $due[] = ['key' => 'reviews', 'icon' => 'clipboard-text', 'tone' => 'neu', 'title' => $open . ' weekly review' . ($open === 1 ? '' : 's') . ' to finish', 'sub' => 'From last Saturday · due Monday', 'go' => ['screen' => 'saturday', 'step' => 'after']];
    $rel = count(array_filter($ms, static fn($m) => $m['flags']['rel']));
    if ($rel) $due[] = ['key' => 'rel', 'icon' => 'handshake', 'tone' => 'neu', 'title' => $rel . ' relationship check' . ($rel === 1 ? '' : 's') . ' to look at', 'sub' => 'Due, low, or you and the child disagree', 'go' => ['screen' => 'mentees', 'filter' => 'rel']];
    $stalled = count(array_filter($ms, static fn($m) => $m['activeGoal'] && $m['activeGoal']['stalled']));
    if ($stalled) $due[] = ['key' => 'stalled', 'icon' => 'target', 'tone' => 'warn', 'title' => $stalled . ($stalled === 1 ? ' goal has stalled' : ' goals have stalled'), 'sub' => 'No check-in for 3 weeks, or no movement', 'go' => ['screen' => 'goals', 'filter' => 'stalled']];
    if ($g['mpRole'] !== 'peer') {
        $fam = count(array_filter($ms, static fn($m) => $m['flags']['family']));
        if ($fam) $due[] = ['key' => 'family', 'icon' => 'house-line', 'tone' => 'neu', 'title' => $fam . ($fam === 1 ? ' family' : ' families') . ' due an update', 'sub' => 'No update in over ' . $o['familyDays'] . ' days', 'go' => ['screen' => 'mentees', 'filter' => 'family']];
    }
    // What the background jobs found for me that the rows above do not already
    // say (AUTOMATIONS.md: Due now is the one place a mentor sees job results),
    // plus — for a lead — what was raised to them about their mentors.
    if (!empty($g['mentorId'])) {
        $rules = defined('MPA_JOBS') ? array_map(static fn($k) => 'J:' . $k, array_keys(array_filter(MPA_JOBS, static fn($j) => !empty($j['due'])))) : [];
        $rp = $rules ? implode(',', array_fill(0, count($rules), '?')) : "''";
        $leadSql = $g['mpRole'] === 'lead' ? " OR (audience = 'lead' AND (rule LIKE 'J:%' OR rule = 'R7'))" : '';
        foreach (db_all("SELECT id, rule, title, body, memberId FROM mentor_nudges WHERE status = 'open' AND mentorId = ? AND ((audience = 'mentor' AND rule IN ($rp))$leadSql) ORDER BY createdAt DESC LIMIT 8",
                        array_merge([$g['mentorId']], $rules)) as $n) {
            $due[] = ['key' => 'job:' . $n['id'], 'icon' => str_contains((string)$n['rule'], 'scorecard') ? 'chart-bar' : (str_contains((string)$n['rule'], 'family') ? 'house-line' : (str_contains((string)$n['rule'], 'goal') ? 'target' : 'bell-simple')),
                      'tone' => 'neu', 'title' => (string)$n['title'], 'sub' => (string)$n['body'], 'nudgeId' => (int)$n['id'],
                      'go' => $n['memberId'] !== '' ? ['screen' => 'mentee', 'id' => (string)$n['memberId'], 'tab' => str_contains((string)$n['rule'], 'scorecard') ? 'scorecard' : (str_contains((string)$n['rule'], 'family') ? 'family' : (str_contains((string)$n['rule'], 'goal') ? 'goals' : 'overview'))]
                              : (str_contains((string)$n['rule'], 'family') ? ['screen' => 'mentees', 'filter' => 'family'] : (str_contains((string)$n['rule'], 'journal') ? ['screen' => 'messages'] : (str_contains((string)$n['rule'], 'retreat') || str_contains((string)$n['rule'], 'supervision') || str_contains((string)$n['rule'], 'twice') ? ['screen' => 'role'] : (str_contains((string)$n['rule'], 'academy') ? ['screen' => 'academy'] : null))))];
        }
    }
    $sat = mp_next_saturday($today);
    // A Saturday follow-up has done its job once that Saturday has passed.
    if (!empty($g['mentorId'])) db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ?, resolvedBy = 'expired' WHERE status = 'open' AND rule = 'J:sessionFollowUp' AND mentorId = ? AND createdAt < ?",
                                        [now_iso(), $g['mentorId'], gmdate('Y-m-d', strtotime($today) - 9 * 86400)]);
    return ['ok' => true, 'me' => mp_me($g, $o), 'today' => $today, 'saturday' => $sat, 'menteeCount' => count($ms), 'due' => $due,
        'week' => mp_commitments_week($g, $today),
        'badges' => ['mentees' => count(array_filter($ms, static fn($m) => $m['urgency'] >= 2)), 'saturday' => $open, 'messages' => $unread,
                     'academy' => $g['mentorRow'] && function_exists('ms_clearance') ? max(0, ms_clearance($g['mentorRow'])['modulesRequired'] - ms_clearance($g['mentorRow'])['modulesDone']) : 0]];
}
function mp_next_saturday(string $today): string {
    $t = strtotime($today . 'T12:00:00Z');
    $w = (int)gmdate('w', $t);
    return gmdate('Y-m-d', $t + ((6 - $w + 7) % 7) * 86400);
}
function mp_last_saturday(string $today): string {
    $t = strtotime($today . 'T12:00:00Z');
    $w = (int)gmdate('w', $t);
    return gmdate('Y-m-d', $t - (($w + 1) % 7) * 86400);
}
/** Members marked Here on the most recent Saturday register (or at the gate that day). */
function mp_last_register(array $g, string $today): array {
    $sat = mp_last_saturday($today);
    $ids = mp_caseload_ids($g);
    if (!$ids) return [];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $here = array_column(db_all("SELECT subjectId FROM mentor_register WHERE onDate = ? AND here = 1 AND subjectId IN ($ph)", array_merge([$sat], $ids)), 'subjectId');
    if (!$here) $here = array_column(db_all("SELECT DISTINCT studentId FROM attendance WHERE date = ? AND studentId IN ($ph)", array_merge([$sat], $ids)), 'studentId');
    return $here;
}

/** One mentee's profile: the caseload row plus goals, sessions, scorecard, relationship, family, timeline, progress. */
function member_mp_mentee(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $o = mp_opts(); $today = mp_today($p);
    $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($id, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    $row = mp_mentees([$id], $g['mpRole'], $today, $o)[0] ?? null;
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $child = mentor_child(['requesterId' => $g['me'], 'subjectId' => $id]);
    $sessions = db_all("SELECT id, metOn, kind, minutes, discussed, agreed, goalId, mentorName, sharedWithLead FROM mentor_meetings WHERE subjectId = ? AND concern = 0 ORDER BY metOn DESC, id DESC LIMIT 80", [$id]);
    /* PEER MENTORS ARE MINORS. What an adult wrote about a family, what was
     * sent to one, and an adult's Saturday note are not theirs to read; they
     * keep the child's goals, sessions with the child, values and courage. */
    $peer = $g['mpRole'] === 'peer';
    if ($peer) $sessions = array_values(array_filter($sessions, static fn($s) => !in_array($s['kind'], ['family', 'phone'], true)));
    $family = array_values(array_filter($sessions, static fn($s) => in_array($s['kind'], ['family', 'phone'], true)));
    if (!$peer) foreach (db_all("SELECT createdAt, body, status, sendAfter FROM mentor_messages WHERE subjectId = ? AND kind = 'Family update' ORDER BY createdAt DESC LIMIT 30", [$id]) as $m) {
        $family[] = ['metOn' => substr((string)$m['createdAt'], 0, 10), 'kind' => 'update', 'discussed' => (string)$m['body'], 'status' => (string)$m['status']];
    }
    usort($family, static fn($a, $b) => strcmp((string)$b['metOn'], (string)$a['metOn']));
    $timeline = [];
    foreach (array_slice($sessions, 0, 20) as $s) $timeline[] = ['at' => (string)$s['metOn'], 'icon' => $s['kind'] === 'pod' ? 'users-three' : ($s['kind'] === 'one-to-one' ? 'chats-circle' : 'house-line'),
        'text' => ($s['kind'] === 'one-to-one' ? 'One-to-one' : ($s['kind'] === 'pod' ? 'Pod session' : 'Family contact')) . ': ' . mb_substr((string)$s['discussed'], 0, 140), 'source' => (string)($s['mentorName'] ?: 'Session')];
    foreach (db_all("SELECT onDate, observed, note FROM mentor_register WHERE subjectId = ? AND (observed NOT IN ('', '[]') OR COALESCE(note, '') <> '') ORDER BY onDate DESC LIMIT 10", [$id]) as $r) {
        $seen = json_decode((string)$r['observed'], true) ?: []; $note = $peer ? '' : trim((string)($r['note'] ?? ''));
        if (!$seen && $note === '') continue;
        $timeline[] = ['at' => (string)$r['onDate'], 'icon' => 'binoculars', 'text' => 'Seen on Saturday: ' . ($seen ? implode(', ', $seen) : 'a note') . ($note !== '' ? '. ' . mb_substr($note, 0, 160) : ''), 'source' => 'Saturday observation'];
    }
    foreach (db_all("SELECT observedOn, score, evidence FROM courage_marks WHERE subjectId = ? ORDER BY observedOn DESC LIMIT 8", [$id]) as $c) {
        $timeline[] = ['at' => (string)$c['observedOn'], 'icon' => 'flame', 'text' => 'Courage ' . (int)$c['score'] . ' of 5: ' . mb_substr((string)$c['evidence'], 0, 120), 'source' => 'Courage ladder'];
    }
    foreach (db_all("SELECT week, wellbeing, note, createdAt FROM member_checkins WHERE memberId = ? ORDER BY createdAt DESC LIMIT 6", [$id]) as $c) {
        $timeline[] = ['at' => substr((string)$c['createdAt'], 0, 10), 'icon' => 'heartbeat', 'text' => 'Weekly check-in: ' . $c['wellbeing'], 'source' => 'Dashboard'];
    }
    usort($timeline, static fn($a, $b) => strcmp($b['at'], $a['at']));
    return ['ok' => true, 'me' => mp_me($g, $o), 'today' => $today, 'mentee' => $row,
        'goals' => $child['goals'] ?? [], 'sessions' => $sessions, 'family' => $family, 'timeline' => array_slice($timeline, 0, 40),
        'scorecard' => mp_scorecard_read($id, substr($today, 0, 7)), 'rel' => mp_rel_read($id, $g),
        'progress' => mp_progress($id, $today), 'familyAllowed' => $g['mpRole'] !== 'peer',
        'familyDraft' => $g['mpRole'] === 'peer' ? null : db_row("SELECT id, body, createdAt FROM mentor_messages WHERE kind = 'Family draft' AND status = 'draft' AND subjectId = ? ORDER BY id DESC LIMIT 1", [$id]),
        'goalsLocked' => function_exists('ms_goals_locked') ? ms_goals_locked($id, $today) : false,
        'skills' => MP_SKILLS, 'relQuestions' => MP_REL_Q];
}

/**
 * view=goals — every goal in the caseload (any status) with how close, the last
 * check-in and stalled; plus the mentees with no active goal. Two grouped reads.
 */
function member_mp_goals(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $o = mp_opts(); $today = mp_today($p);
    $ms = mp_mentees(mp_caseload_ids($g), $g['mpRole'], $today, $o);
    $ids = array_column($ms, 'id');
    $rows = [];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $goals = db_all("SELECT id, subjectId, goal, area, status, agreed, reviewBy, dueOn, closedOn, createdAt, updatedAt FROM mentor_goals WHERE subjectId IN ($ph) ORDER BY id DESC", $ids);
        $checks = mentor_goal_checks_for(array_map(static fn($x) => (int)$x['id'], $goals));
        $by = array_column($ms, null, 'id');
        foreach ($goals as $gl) {
            $st = (string)(MENTOR_GOAL_LEGACY[$gl['status']] ?? $gl['status']);
            $c = $checks[(int)$gl['id']] ?? [];
            $last = $c ? end($c) : null;
            $rows[] = ['id' => (int)$gl['id'], 'subjectId' => (string)$gl['subjectId'], 'name' => (string)($by[$gl['subjectId']]['name'] ?? ''), 'first' => (string)($by[$gl['subjectId']]['first'] ?? ''),
                'initials' => (string)($by[$gl['subjectId']]['initials'] ?? ''), 'title' => (string)$gl['goal'], 'area' => (string)$gl['area'], 'status' => $st, 'agreed' => (int)$gl['agreed'] === 1,
                'progress' => $last ? (int)$last['progress'] : 0, 'lastCheckAt' => $last ? (string)$last['at'] : null, 'reviewBy' => (string)($gl['reviewBy'] ?: $gl['dueOn']),
                'closedOn' => (string)$gl['closedOn'], 'stalled' => $st === 'active' && mentor_goal_stalled($gl + ['checks' => $c, 'status' => $st], $today)];
        }
    }
    $none = array_values(array_map(static fn($m) => ['subjectId' => $m['id'], 'name' => $m['name'], 'first' => $m['first'], 'initials' => $m['initials'], 'phase' => $m['phase'], 'week' => $m['week']],
        array_filter($ms, static fn($m) => !$m['activeGoal'])));
    return ['ok' => true, 'today' => $today, 'goals' => $rows, 'noGoal' => $none, 'mentees' => array_map(static fn($m) => ['id' => $m['id'], 'name' => $m['name'], 'initials' => $m['initials'], 'school' => $m['school']], $ms)];
}

/* ── The NGG Leadership Index ───────────────────────────────────────────── */

function mp_prev_month(string $month): string { return gmdate('Y-m', strtotime($month . '-01T00:00:00Z') - 86400); }
function mp_scorecard_read(string $id, string $month): array {
    $cur = db_row("SELECT * FROM mentor_scorecards WHERE subjectId = ? AND month = ? AND byKind = 'mentor'", [$id, $month]);
    $prev = db_row("SELECT * FROM mentor_scorecards WHERE subjectId = ? AND month < ? AND byKind = 'mentor' ORDER BY month DESC LIMIT 1", [$id, $month]);
    $self = db_row("SELECT * FROM mentor_scorecards WHERE subjectId = ? AND byKind = 'member' ORDER BY month DESC LIMIT 1", [$id]);
    $dec = static fn($r) => $r ? array_map('intval', explode(',', (string)$r['scores'])) : null;
    return ['month' => $month, 'cur' => $dec($cur), 'prev' => $dec($prev), 'prevMonth' => $prev['month'] ?? null, 'self' => $dec($self), 'selfMonth' => $self['month'] ?? null,
            'savedAt' => $cur['updatedAt'] ?? null, 'locked' => mp_scorecard_locked($month, (int)($cur['locked'] ?? 0)), 'lockOn' => mp_scorecard_lock_date($month)];
}
function mp_scorecard_lock_date(string $month): string {
    $o = mp_opts();
    return gmdate('Y-m-d', strtotime($month . '-01T00:00:00Z') + 40 * 86400 - ((int)gmdate('j', strtotime($month . '-01T00:00:00Z') + 40 * 86400) - $o['scorecardLockDay']) * 86400);
}
function mp_scorecard_locked(string $month, int $flag): bool {
    if ($flag === 2) return false;            // unlocked by an NGG admin
    if ($flag === 1) return true;
    return gmdate('Y-m-d', mp_lagos_now()) >= mp_scorecard_lock_date($month);
}

/** view=scorecard — one mentee's month: cur, prev, the member's self-score, savedAt, locked. */
function member_mp_scorecard(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($id, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    $month = preg_match('/^\d{4}-\d{2}$/', (string)($p['month'] ?? '')) ? (string)$p['month'] : substr(mp_today($p), 0, 7);
    return ['ok' => true, 'skills' => MP_SKILLS] + mp_scorecard_read($id, $month);
}
/** scorecard — ten integers 0–10 in SKILLS order, one set per child per calendar month. */
function member_mp_scorecard_save(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($id, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    $month = (string)($p['month'] ?? substr(mp_today($p), 0, 7));
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) return ['ok' => false, 'error' => 'bad_month'];
    if ($month > substr(mp_today($p), 0, 7)) return ['ok' => false, 'error' => 'month_ahead'];
    $sc = array_values((array)($p['scores'] ?? []));
    if (count($sc) !== 10) return ['ok' => false, 'error' => 'ten_scores'];
    foreach ($sc as $v) if (!is_numeric($v) || (int)$v != $v || (int)$v < 0 || (int)$v > 10) return ['ok' => false, 'error' => 'bad_score'];
    $sc = array_map('intval', $sc);
    $have = db_row("SELECT * FROM mentor_scorecards WHERE subjectId = ? AND month = ? AND byKind = 'mentor'", [$id, $month]);
    if (mp_scorecard_locked($month, (int)($have['locked'] ?? 0))) return ['ok' => false, 'error' => 'locked', 'lockOn' => mp_scorecard_lock_date($month)];
    $now = now_iso();
    $centre = (string)(db_row('SELECT centre FROM members WHERE memberId = ?', [$id])['centre'] ?? '');
    db_upsert('mentor_scorecards', ['subjectId' => $id, 'month' => $month, 'scores' => implode(',', $sc), 'total' => array_sum($sc), 'byKind' => 'mentor',
        'mentorId' => (string)($g['mentorId'] ?: $g['me']), 'centre' => $centre, 'locked' => 0, 'createdAt' => $now, 'updatedAt' => $now],
        ['subjectId', 'month', 'byKind'], ['scores' => implode(',', $sc), 'total' => array_sum($sc), 'mentorId' => (string)($g['mentorId'] ?: $g['me']), 'updatedAt' => $now]);
    audit('mentor.scorecard', $g['me'], $id, ['month' => $month, 'total' => array_sum($sc)], (string)($p['ip'] ?? ''));
    db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ? WHERE status = 'open' AND rule = 'J:scorecardDue' AND memberId = ?", [$now, $id]);
    return ['ok' => true, 'total' => array_sum($sc), 'savedAt' => $now, 'lockOn' => mp_scorecard_lock_date($month)];
}

/** The member's own self-scores (member portal), so the gap becomes a conversation. */
function member_mp_selfscore(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    $m = db_row("SELECT memberId, centre FROM members WHERE memberId = ? AND status = 'active'", [$me]);
    if (!$m) return ['ok' => false, 'error' => 'no_member'];
    $sc = array_values((array)($p['scores'] ?? []));
    if (count($sc) !== 10) return ['ok' => false, 'error' => 'ten_scores'];
    foreach ($sc as $v) if (!is_numeric($v) || (int)$v < 0 || (int)$v > 10) return ['ok' => false, 'error' => 'bad_score'];
    $sc = array_map('intval', $sc); $month = gmdate('Y-m', mp_lagos_now()); $now = now_iso();
    db_upsert('mentor_scorecards', ['subjectId' => $me, 'month' => $month, 'scores' => implode(',', $sc), 'total' => array_sum($sc), 'byKind' => 'member',
        'mentorId' => '', 'centre' => (string)$m['centre'], 'locked' => 0, 'createdAt' => $now, 'updatedAt' => $now], ['subjectId', 'month', 'byKind'],
        ['scores' => implode(',', $sc), 'total' => array_sum($sc), 'updatedAt' => $now]);
    return ['ok' => true, 'month' => $month];
}

/** view=index — Pod growth: the Leadership Index averaged across my mentees, and by mentee. */
function member_mp_index(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $today = mp_today($p);
    $month = preg_match('/^\d{4}-\d{2}$/', (string)($p['month'] ?? '')) ? (string)$p['month'] : substr($today, 0, 7);
    $ids = mp_caseload_ids($g);
    return ['ok' => true, 'month' => $month] + mp_index_for($ids, $month) + ['outcomes' => mp_outcomes($ids, $today)];
}
function mp_index_for(array $ids, string $month): array {
    if (!$ids) return ['skills' => array_map(static fn($s) => ['skill' => $s[0], 'avg' => 0, 'prevAvg' => 0, 'change' => null], MP_SKILLS), 'byMentee' => [], 'scored' => 0, 'of' => 0];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $prevMonth = mp_prev_month($month);
    $cur = []; $prev = [];
    foreach (db_all("SELECT subjectId, month, scores, total FROM mentor_scorecards WHERE byKind = 'mentor' AND month IN (?, ?) AND subjectId IN ($ph)", array_merge([$month, $prevMonth], $ids)) as $r) {
        if ($r['month'] === $month) $cur[$r['subjectId']] = array_map('intval', explode(',', (string)$r['scores']));
        else $prev[$r['subjectId']] = array_map('intval', explode(',', (string)$r['scores']));
    }
    $avg = static function (array $cards, int $i): ?float { if (!$cards) return null; return array_sum(array_map(static fn($c) => $c[$i], $cards)) / count($cards); };
    $skills = [];
    foreach (MP_SKILLS as $i => [$name]) {
        $a = $avg($cur, $i); $b = $avg($prev, $i);
        $skills[] = ['skill' => $name, 'avg' => $a === null ? null : round($a, 1), 'prevAvg' => $b === null ? null : round($b, 1), 'change' => ($a !== null && $b !== null) ? round($a - $b, 1) : null];
    }
    usort($skills, static fn($x, $y) => ($y['avg'] ?? -1) <=> ($x['avg'] ?? -1));
    $names = [];
    foreach (db_all("SELECT memberId, fullName FROM members WHERE memberId IN ($ph)", $ids) as $r) $names[$r['memberId']] = (string)$r['fullName'];
    $by = [];
    foreach ($cur as $sid => $sc) {
        $low = array_keys($sc, min($sc))[0];
        $by[] = ['subjectId' => $sid, 'name' => $names[$sid] ?? $sid, 'initials' => mp_initials($names[$sid] ?? '?'), 'total' => array_sum($sc),
                 'prevTotal' => isset($prev[$sid]) ? array_sum($prev[$sid]) : null, 'lowSkill' => MP_SKILLS[$low][0]];
    }
    usort($by, static fn($x, $y) => $x['total'] <=> $y['total']);
    return ['skills' => $skills, 'byMentee' => $by, 'scored' => count($cur), 'of' => count($ids), 'prevMonth' => $prevMonth];
}
/** Four outcomes over the last 8 Saturdays: courage, responsibility (observations), wellbeing, relationship. */
function mp_outcomes(array $ids, string $today): array {
    if (!$ids) return ['saturdays' => [], 'items' => []];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $sats = []; for ($i = 7; $i >= 0; $i--) $sats[] = gmdate('Y-m-d', strtotime(mp_last_saturday($today)) - $i * 7 * 86400);
    $obs = array_fill_keys($sats, ['Courage' => 0, 'Responsibility' => 0, 'n' => 0]);
    foreach (db_all("SELECT onDate, observed FROM mentor_register WHERE here = 1 AND onDate >= ? AND subjectId IN ($ph)", array_merge([$sats[0]], $ids)) as $r) {
        if (!isset($obs[$r['onDate']])) continue;
        $v = json_decode((string)$r['observed'], true) ?: [];
        $obs[$r['onDate']]['n']++;
        foreach (['Courage', 'Responsibility'] as $k) if (in_array($k, $v, true)) $obs[$r['onDate']][$k]++;
    }
    $pct = static fn($a, $n) => $n ? (int)round(100 * $a / $n) : null;
    $well = array_fill_keys($sats, [0, 0]);
    foreach (db_all("SELECT createdAt, wellbeing FROM member_checkins WHERE createdAt >= ? AND memberId IN ($ph)", array_merge([$sats[0]], $ids)) as $r) {
        $d = substr((string)$r['createdAt'], 0, 10); $k = null;
        foreach ($sats as $s) if ($d <= gmdate('Y-m-d', strtotime($s) + 6 * 86400) && $d > gmdate('Y-m-d', strtotime($s) - 86400)) $k = $s;
        if ($k) { $well[$k][1]++; if ($r['wellbeing'] === 'Okay') $well[$k][0]++; }
    }
    $rel = [];
    foreach (db_all("SELECT createdAt, score FROM mentor_rel_checks WHERE side = 'child' AND createdAt >= ? AND subjectId IN ($ph)", array_merge([$sats[0]], $ids)) as $r) $rel[] = $r;
    $relSeries = array_map(static function ($s) use ($rel) { $v = array_values(array_filter($rel, static fn($r) => substr((string)$r['createdAt'], 0, 10) <= gmdate('Y-m-d', strtotime($s) + 6 * 86400)));
        return $v ? round(array_sum(array_column($v, 'score')) / count($v) * 20) : null; }, $sats);
    return ['saturdays' => $sats, 'items' => [
        ['key' => 'courage', 'label' => 'Courage', 'unit' => '%', 'series' => array_map(static fn($s) => $pct($obs[$s]['Courage'], $obs[$s]['n']), $sats), 'source' => 'Saturday observations'],
        ['key' => 'responsibility', 'label' => 'Responsibility', 'unit' => '%', 'series' => array_map(static fn($s) => $pct($obs[$s]['Responsibility'], $obs[$s]['n']), $sats), 'source' => 'Saturday observations'],
        ['key' => 'wellbeing', 'label' => 'Wellbeing', 'unit' => '%', 'series' => array_map(static fn($s) => $pct($well[$s][0], $well[$s][1]), $sats), 'source' => 'Weekly check-ins (Okay)'],
        ['key' => 'relationship', 'label' => 'Relationship', 'unit' => '%', 'series' => $relSeries, 'source' => 'Relationship checks, child side'],
    ]];
}
/** One mentee's four series (Progress tab). */
function mp_progress(string $id, string $today): array {
    return mp_outcomes([$id], $today);
}

/* ── Relationship check ─────────────────────────────────────────────────── */

function mp_rel_read(string $id, array $g): array {
    $rows = db_all('SELECT side, answers, score, cycle, createdAt FROM mentor_rel_checks WHERE subjectId = ? ORDER BY createdAt DESC LIMIT 12', [$id]);
    $mine = null; $child = null;
    foreach ($rows as $r) { if ($r['side'] === 'mentor' && !$mine) $mine = $r; if ($r['side'] === 'child' && !$child) $child = $r; }
    // The child's own answers reach the coordinator only; everyone else sees the score.
    $coord = ($g['mpRole'] ?? '') === 'coord';
    return ['mentor' => $mine ? ['score' => (int)$mine['score'], 'answers' => json_decode((string)$mine['answers'], true), 'at' => substr((string)$mine['createdAt'], 0, 10)] : null,
            'child' => $child ? ['score' => (int)$child['score'], 'at' => substr((string)$child['createdAt'], 0, 10), 'answers' => $coord ? json_decode((string)$child['answers'], true) : null] : null,
            'cycle' => mp_cycle(gmdate('Y-m-d', mp_lagos_now()), mp_opts()['relWeeks'])];
}
function mp_rel_write(string $id, string $side, array $answers, string $byId): array {
    $a = array_values($answers);
    if (count($a) !== 4) return ['ok' => false, 'error' => 'answer_all_four'];
    foreach ($a as $v) if (!is_numeric($v) || (int)$v < 1 || (int)$v > 5) return ['ok' => false, 'error' => 'answer_all_four'];
    $a = array_map('intval', $a);
    $score = (int)round(array_sum($a) / 4);
    $cycle = mp_cycle(gmdate('Y-m-d', mp_lagos_now()), mp_opts()['relWeeks']);
    $now = now_iso();
    db_upsert('mentor_rel_checks', ['subjectId' => $id, 'side' => $side, 'answers' => json_encode($a), 'score' => $score, 'cycle' => $cycle, 'byId' => $byId, 'createdAt' => $now],
        ['subjectId', 'side', 'cycle'], ['answers' => json_encode($a), 'score' => $score, 'byId' => $byId, 'createdAt' => $now]);
    return ['ok' => true, 'score' => $score, 'cycle' => $cycle];
}
/** relCheck — the mentor's side. The child is asked for theirs in the member portal. */
function member_mp_rel_save(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($id, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    $r = mp_rel_write($id, 'mentor', (array)($p['answers'] ?? []), $g['me']);
    if (empty($r['ok'])) return $r;
    if (function_exists('push_notification')) push_notification($id, ['kind' => 'mentor', 'title' => 'How is mentoring going?', 'body' => 'Four quick questions about you and your mentor. Only the coordinator sees your answers.', 'linkPage' => 'dashboard']);
    audit('mentor.rel.check', $g['me'], $id, ['score' => $r['score']], (string)($p['ip'] ?? ''));
    return $r;
}
/** The member's own side. */
function member_mp_rel_child(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    if (!db_row("SELECT 1 FROM mentor_assignments WHERE memberId = ? AND status = 'active'", [$me])) return ['ok' => false, 'error' => 'no_mentor'];
    return mp_rel_write($me, 'child', (array)($p['answers'] ?? []), $me);
}
/** relFit — "Talk to the coordinator about fit". Nothing changes until they have talked. */
function member_mp_rel_fit(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($id, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    $m = db_row('SELECT fullName, centre FROM members WHERE memberId = ?', [$id]);
    if (function_exists('ms_nudge')) ms_nudge('FIT:' . $id . ':' . gmdate('Y-W'), 'R7', ['audience' => 'lead', 'mentorId' => (string)$g['mentorId'], 'memberId' => $id, 'centre' => (string)($m['centre'] ?? ''),
        'title' => (string)($g['mentorRow']['fullName'] ?? 'A mentor') . ' wants to talk about fit with ' . mp_first((string)($m['fullName'] ?? '')),
        'body' => 'Raised from the relationship check. Nothing changes until you have talked.', 'suggestion' => 'Call the mentor this week.']);
    audit('mentor.rel.fit', $g['me'], $id, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Sessions ───────────────────────────────────────────────────────────── */

/**
 * Log a session. One-to-one / Pod session / Family / Phone or message, a date,
 * a length, what happened and the next step; optionally the goal discussed and
 * how close they are (a goal check-in, in the same request). A pod session
 * writes one meeting per child marked here. Peer mentors' notes are shared
 * with their lead automatically. Concerns never come through here.
 */
function member_mp_session_save(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $type = (string)($p['type'] ?? 'One-to-one');
    $kind = MP_SESSION_KINDS[$type] ?? (in_array($type, MP_SESSION_KINDS, true) ? $type : null);
    if (!$kind) return ['ok' => false, 'error' => 'bad_type'];
    if ($kind === 'family' && $g['mpRole'] === 'peer') return ['ok' => false, 'error' => 'peer_no_family'];
    $what = trim((string)($p['what'] ?? $p['discussed'] ?? ''));
    if (mb_strlen($what) <= 3) return ['ok' => false, 'error' => 'say_what_happened'];
    $date = trim((string)($p['date'] ?? $p['metOn'] ?? ''));
    $today = mp_today($p);
    if ($date === '') $date = $today;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date > $today) return ['ok' => false, 'error' => 'bad_date'];
    $minutes = max(0, min(240, (int)($p['minutes'] ?? 0)));
    $case = mp_caseload_ids($g);
    // A pod session is one row per child here; a note may go on several records at once (the Mentees bulk bar).
    if ($kind === 'pod') $ids = array_values(array_intersect(array_map('strval', (array)($p['subjectIds'] ?? mp_last_register($g, $today))), $case));
    elseif ($kind === 'note' && !empty($p['subjectIds'])) $ids = array_slice(array_values(array_intersect(array_map('strval', (array)$p['subjectIds']), $case)), 0, 60);
    else $ids = [trim((string)($p['subjectId'] ?? ''))];
    if (!$ids || ($kind !== 'pod' && !in_array($ids[0], $case, true))) return ['ok' => false, 'error' => $kind === 'pod' ? 'nobody_here' : 'choose_a_mentee'];
    /* A goal check-in that rides on the session is checked before anything is
     * written: a progress of 7 used to save the session and silently drop the
     * check-in, so the mentor believed it was recorded. */
    if ((int)($p['goalId'] ?? 0) > 0 && array_key_exists('progress', $p) && (int)$p['progress'] !== 0 && ((int)$p['progress'] < 1 || (int)$p['progress'] > 5)) {
        return ['ok' => false, 'error' => 'progress_out_of_range'];
    }
    $now = now_iso(); $made = [];
    $mentorName = (string)($g['mentorRow']['fullName'] ?? $g['member']['fullName'] ?? '');
    foreach ($ids as $sid) {
        $centre = (string)(db_row('SELECT centre FROM members WHERE memberId = ?', [$sid])['centre'] ?? '');
        $made[] = db_insert('mentor_meetings', ['subjectId' => $sid, 'subjectType' => 'member', 'mentorId' => $g['me'], 'mentorName' => $mentorName,
            'metOn' => $date, 'kind' => $kind, 'discussed' => mb_substr($what, 0, 4000), 'agreed' => mb_substr(trim((string)($p['next'] ?? $p['agreed'] ?? '')), 0, 1000),
            'concern' => 0, 'centre' => $centre, 'minutes' => $minutes, 'goalId' => (int)($p['goalId'] ?? 0), 'sharedWithLead' => $g['mpRole'] === 'peer' ? 1 : 0,
            'createdAt' => $now, 'updatedAt' => $now]);
    }
    $check = null;
    if (!in_array($kind, ['pod', 'note'], true) && (int)($p['goalId'] ?? 0) > 0 && (int)($p['progress'] ?? 0) > 0) {
        $goal = db_row('SELECT * FROM mentor_goals WHERE id = ? AND subjectId = ?', [(int)$p['goalId'], $ids[0]]);
        if ($goal) $check = mentor_goal_checkin_write($goal, (int)$p['progress'], $what, 'mentor', $g['me'], (int)$made[0], (string)($p['ip'] ?? ''));
    }
    // Logging the one-to-one clears its overdue flag at once (handoff acceptance).
    if ($kind === 'one-to-one' && !empty($g['mentorId'])) {
        db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ?, resolvedBy = 'session' WHERE status = 'open' AND memberId = ? AND (rule = 'R2' OR rule = 'J:overdueOneToOne')", [$now, $ids[0]]);
    }
    // sessionFollowUp: a next step becomes a follow-up for the next Saturday.
    $next = trim((string)($p['next'] ?? $p['agreed'] ?? ''));
    if ($next !== '' && !in_array($kind, ['pod', 'note'], true) && !empty($g['mentorId']) && (!function_exists('mpa_job_on') || mpa_job_on('sessionFollowUp', (string)($g['mentorRow']['centre'] ?? '')))) {
        $first = mp_first((string)(db_row('SELECT fullName FROM members WHERE memberId = ?', [$ids[0]])['fullName'] ?? ''));
        ms_nudge('J:sessionFollowUp:' . (int)$made[0], 'J:sessionFollowUp', ['audience' => 'mentor', 'mentorId' => (string)$g['mentorId'], 'memberId' => $ids[0],
            'title' => 'Follow up with ' . $first . ' on Saturday', 'body' => mb_substr($next, 0, 140)]);
    }
    if ($g['mpRole'] === 'peer' && $g['lead'] && function_exists('mp_message_put')) {
        mp_message_put('lead:' . $g['me'], 'Peer session note', $ids[0], $g['me'], $mentorName, (string)($g['lead']['memberId'] ?? ''), mb_substr($what, 0, 1000));
    }
    audit('mentor.session', $g['me'], $kind === 'pod' ? 'pod' : $ids[0], ['kind' => $kind, 'n' => count($ids), 'minutes' => $minutes], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ids' => $made, 'count' => count($made), 'goal' => $check];
}
/** Delete a session (after the 6.5s Undo window on screen). Only the mentor who logged it. */
function member_mp_session_delete(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $row = db_row('SELECT * FROM mentor_meetings WHERE id = ? LIMIT 1', [(int)($p['id'] ?? 0)]);
    if (!$row || (string)$row['mentorId'] !== $g['me']) return ['ok' => false, 'error' => 'not_found'];
    db_exec('DELETE FROM mentor_meetings WHERE id = ?', [(int)$row['id']]);
    audit('mentor.session.delete', $g['me'], (string)$row['subjectId'], ['id' => (int)$row['id'], 'kind' => (string)$row['kind']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
/** view=sessions — every session I logged, grouped by week, with the stats row. */
function member_mp_sessions(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $today = mp_today($p);
    $ids = mp_caseload_ids($g);
    $rows = db_all("SELECT m.id, m.subjectId, m.metOn, m.kind, m.minutes, m.discussed, m.agreed, m.goalId, mm.fullName, gl.goal goalTitle
                    FROM mentor_meetings m LEFT JOIN members mm ON mm.memberId = m.subjectId LEFT JOIN mentor_goals gl ON gl.id = m.goalId
                    WHERE m.mentorId = ? AND m.concern = 0 ORDER BY m.metOn DESC, m.id DESC LIMIT 400", [$g['me']]);
    $seen = [];
    foreach ($rows as $r) if (in_array($r['kind'], ['one-to-one', 'pod'], true) && mp_days((string)$r['metOn'], $today) <= 14) $seen[$r['subjectId']] = true;
    $seenN = count(array_intersect(array_keys($seen), $ids));
    $count = static fn($k) => count(array_filter($rows, static fn($r) => $r['kind'] === $k));
    return ['ok' => true, 'today' => $today, 'sessions' => $rows,
        'stats' => ['seenPct' => $ids ? (int)round(100 * $seenN / count($ids)) : 0, 'seen' => $seenN, 'of' => count($ids),
                    'oneToOnes' => $count('one-to-one'), 'pod' => count(array_unique(array_map(static fn($r) => $r['metOn'], array_filter($rows, static fn($r) => $r['kind'] === 'pod')))),
                    'family' => $count('family') + $count('phone')]];
}

/* ── Family updates ─────────────────────────────────────────────────────── */

/* Family messages one child's guardians receive in 24 hours, from every
 * mentor together. A family is not a channel to be flooded, and two different
 * mentors each "just checking in" is how it happens. */
const MP_FAMILY_PER_DAY = 2;

/**
 * familySend — a message to the guardian(s) of one mentee: SMS to the phone on
 * the record and email to guardians who take updates. Outside 8am–8pm Lagos it
 * waits (status queued) and the web-cron sends it in the morning. Logged as a
 * Family session so commitment #8 and the Family flag see it. Peer mentors
 * never contact families.
 */
function member_mp_family_send(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if ($g['mpRole'] === 'peer') return ['ok' => false, 'error' => 'peer_no_family'];
    $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($id, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    $body = trim((string)($p['body'] ?? ''));
    if ($body === '') return ['ok' => false, 'error' => 'write_a_message'];
    if (mb_strlen($body) > 1200) return ['ok' => false, 'error' => 'too_long'];
    $m = db_row('SELECT memberId, fullName, parentName, parentPhone, parentEmail, centre FROM members WHERE memberId = ?', [$id]);
    if (trim((string)$m['parentPhone']) === '' && !filter_var((string)$m['parentEmail'], FILTER_VALIDATE_EMAIL) && !(function_exists('family_guardian_emails') && family_guardian_emails($id, 'updates')))
        return ['ok' => false, 'error' => 'no_guardian_contact'];
    // Failed sends do not count: the family never received them.
    $sent = (int)(db_row("SELECT COUNT(*) c FROM mentor_messages WHERE kind = 'Family update' AND subjectId = ? AND status <> 'failed' AND createdAt >= ?",
                         [$id, gmdate('Y-m-d\TH:i:s', time() - 86400)])['c'] ?? 0);
    if ($sent >= MP_FAMILY_PER_DAY) return ['ok' => false, 'error' => 'family_daily_limit', 'max' => MP_FAMILY_PER_DAY];
    if ((int)($p['draftId'] ?? 0) > 0) db_exec("UPDATE mentor_messages SET status = 'used' WHERE id = ? AND kind = 'Family draft' AND subjectId = ?", [(int)$p['draftId'], $id]);
    $later = mp_next_send_time();
    $mid = mp_message_put('family:' . $id, 'Family update', $id, $g['me'], (string)($g['mentorRow']['fullName'] ?? $g['member']['fullName'] ?? ''),
                          'guardian:' . $id, $body, $later !== '' ? 'queued' : 'sent', $later, 'sms+email');
    /* A send that failed is reported as failed, and logged as no contact: it
     * used to return ok and write a Family contact that satisfied the family
     * flag and commitment 8 for a message nobody received. */
    if ($later === '' && !mp_family_deliver((int)$mid)) {
        return ['ok' => false, 'error' => 'not_delivered', 'detail' => mp_family_channels($id, $m)['optedOut'] ? 'opted_out' : 'send_failed'];
    }
    $now = now_iso();
    db_insert('mentor_meetings', ['subjectId' => $id, 'subjectType' => 'member', 'mentorId' => $g['me'], 'mentorName' => (string)($g['mentorRow']['fullName'] ?? ''),
        'metOn' => mp_today($p), 'kind' => 'family', 'discussed' => 'Message: ' . mb_substr($body, 0, 120), 'agreed' => '', 'concern' => 0, 'centre' => (string)$m['centre'],
        'minutes' => 0, 'goalId' => 0, 'sharedWithLead' => 0, 'createdAt' => $now, 'updatedAt' => $now]);
    audit('mentor.family.send', $g['me'], $id, ['queued' => $later !== ''], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'queued' => $later !== '', 'sendAfter' => $later, 'guardian' => (string)($m['parentName'] ?: 'the family')];
}
/** familyDrafts — the Mentees bulk bar: one draft per family, never sent. Returns how many were drafted. */
function member_mp_family_drafts(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if ($g['mpRole'] === 'peer') return ['ok' => false, 'error' => 'peer_no_family'];
    $ids = array_slice(array_values(array_intersect(array_map('strval', (array)($p['subjectIds'] ?? [])), mp_caseload_ids($g))), 0, 60);
    if (!$ids) return ['ok' => false, 'error' => 'choose_a_mentee'];
    $rows = array_column(mp_mentees($ids, $g['mpRole'], mp_today($p), mp_opts()), null, 'id');
    $me = mp_first((string)($g['mentorRow']['fullName'] ?? $g['member']['fullName'] ?? ''));
    $n = 0;
    foreach ($ids as $id) {
        $r = $rows[$id] ?? null; if (!$r) continue;
        if (db_row("SELECT 1 FROM mentor_messages WHERE kind = 'Family draft' AND status = 'draft' AND subjectId = ?", [$id])) { $n++; continue; }
        $body = 'Good afternoon ' . ($r['guardianName'] !== '' ? $r['guardianName'] : 'there') . '. ' . $r['first'] . ' has been working hard this month'
              . ($r['activeGoal'] ? ' on: ' . $r['activeGoal']['title'] : '') . '. What have you noticed at home? – ' . $me;
        mp_message_put('draft:' . substr(mp_today($p), 0, 7) . ':' . $id, 'Family draft', $id, $g['me'], (string)($g['mentorRow']['fullName'] ?? ''), 'guardian:' . $id, $body, 'draft');
        $n++;
    }
    return ['ok' => true, 'drafted' => $n];
}
function mp_message_put(string $thread, string $kind, string $subjectId, string $fromId, string $fromName, string $toId, string $body, string $status = 'sent', string $sendAfter = '', string $channel = 'portal'): int {
    return db_insert('mentor_messages', ['threadId' => $thread, 'kind' => $kind, 'subjectId' => $subjectId, 'fromId' => $fromId, 'fromName' => $fromName,
        'toId' => $toId, 'channel' => $channel, 'body' => mb_substr($body, 0, 4000), 'status' => $status, 'sendAfter' => $sendAfter, 'readAt' => '', 'createdAt' => now_iso()]);
}
/** Send one family message now: SMS to the guardian phone, email to guardians who take updates. */
/**
 * Where a family message may go. A guardian with an account chose what they
 * hear about (guardian_wards.notify): if every linked guardian has turned
 * "updates" off, nothing goes — not the SMS, and not the record's parentEmail
 * as a fallback, which is how an opt-out used to be routed around. The record's
 * own contacts are used only for a child with no guardian account at all.
 */
function mp_family_channels(string $memberId, array $kid): array {
    /* There is no "updates" preference (FAMILY_NOTIFY_KEYS is checkin, weekly,
     * alerts), and asking family_guardian_emails() for one always returned
     * nobody — so a mentor's note never reached a guardian's account and went
     * to the record's parentEmail instead. A mentor's note is not one of the
     * three; a guardian who has switched all three off has said they want
     * nothing, and that is what is honoured. */
    $linked = db_all("SELECT g.email, w.notify FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId
                      WHERE w.memberId = ? AND w.status = 'active' AND g.status = 'active'", [$memberId]);
    $emails = [];
    foreach ($linked as $r) {
        $prefs = function_exists('family_notify_prefs') ? family_notify_prefs($r['notify'] ?? '') : ['any' => true];
        if (in_array(true, $prefs, true) && filter_var((string)$r['email'], FILTER_VALIDATE_EMAIL)) $emails[] = strtolower((string)$r['email']);
    }
    $emails = array_values(array_unique($emails));
    $anyoneWants = false;
    foreach ($linked as $r) if (in_array(true, function_exists('family_notify_prefs') ? family_notify_prefs($r['notify'] ?? '') : [true], true)) $anyoneWants = true;
    if ($linked && !$anyoneWants) return ['optedOut' => true, 'phone' => '', 'emails' => []];
    if (!$emails && filter_var((string)($kid['parentEmail'] ?? ''), FILTER_VALIDATE_EMAIL)) $emails = [(string)$kid['parentEmail']];
    return ['optedOut' => false, 'phone' => trim((string)($kid['parentPhone'] ?? '')), 'emails' => $emails];
}
function mp_family_deliver(int $msgId): bool {
    $m = db_row('SELECT * FROM mentor_messages WHERE id = ?', [$msgId]);
    if (!$m) return false;
    $kid = db_row('SELECT fullName, parentPhone, parentEmail FROM members WHERE memberId = ?', [(string)$m['subjectId']]);
    $ch = mp_family_channels((string)$m['subjectId'], $kid ?: []);
    $sent = false;
    $text = 'NGG · ' . mp_first((string)($kid['fullName'] ?? '')) . "'s mentor: " . (string)$m['body'];
    if ($ch['optedOut']) { /* nothing goes */ }
    elseif (isset($GLOBALS['__mp_sms_sink']) && is_array($GLOBALS['__mp_sms_sink'])) { $GLOBALS['__mp_sms_sink'][] = $text; $sent = true; }
    elseif ($ch['phone'] !== '' && function_exists('sms_send')) { try { $r = sms_send($ch['phone'], mb_substr($text, 0, 480)); $sent = !empty($r['ok']); } catch (\Throwable $e) {} }
    foreach ($ch['emails'] as $to) {
        /* email_template escapes `intro` itself; escaping here too printed a
         * mentor called O'Neil as O&#039;Neil. Replies reach the programme's
         * shared address, not the mentor, and the footer now says so. */
        if (send_mail($to, 'A note from ' . mp_first((string)($kid['fullName'] ?? '')) . '’s mentor', email_template(['title' => 'From the mentor', 'intro' => (string)$m['fromName'] . ' writes:',
            'bodyHtml' => '<p style="margin:0">' . nl2br(esc_html((string)$m['body'])) . '</p>', 'footNote' => 'To answer, reply to this email: it reaches the NGG team, who will pass it to the mentor.']))) $sent = true;
    }
    db_update('mentor_messages', ['status' => $sent ? 'sent' : 'failed', 'sendAfter' => ''], ['id' => $msgId]);
    return $sent;
}
/** The web-cron: send family messages that waited for the morning. */
function mp_family_flush(int $limit = 40): int {
    if (mp_in_quiet_hours()) return 0;
    $n = 0;
    foreach (db_all("SELECT id FROM mentor_messages WHERE status = 'queued' AND sendAfter <> '' AND sendAfter <= ? ORDER BY id LIMIT " . max(1, $limit), [now_iso()]) as $r) {
        if (mp_family_deliver((int)$r['id'])) $n++;
    }
    return $n;
}

/** A mentor clears a Due-now row a job raised for them ("Done"). */
function member_mp_nudge_done(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if (empty($g['mentorId'])) return ['ok' => false, 'error' => 'not_found'];
    $n = db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ?, resolvedBy = ? WHERE id = ? AND mentorId = ? AND status = 'open'", [now_iso(), $g['me'], (int)($p['id'] ?? 0), (string)$g['mentorId']]);
    return $n ? ['ok' => true] : ['ok' => false, 'error' => 'not_found'];
}

/* ── Messages ───────────────────────────────────────────────────────────── */

/**
 * view=messages — journal entries members shared with me (visibility = mentor
 * only; private entries never), weekly check-ins that came with a note,
 * family replies and messages from my lead. Reading one marks it read.
 */
function member_mp_messages(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $ids = mp_caseload_ids($g);
    $out = [];
    // A peer mentor (a minor) gets their mentees' messages to them, never a
    // shared journal, a wellbeing check-in or a family's reply.
    $peer = $g['mpRole'] === 'peer';
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $read = [];
        foreach (db_all("SELECT threadId FROM mentor_messages WHERE fromId = ? AND (kind = 'read' OR kind = 'Reply')", [$g['me']]) as $r) $read[$r['threadId']] = true;
        foreach (db_all("SELECT j.entryId, j.memberId, j.title, j.body, j.createdAt, m.fullName FROM journal j JOIN members m ON m.memberId = j.memberId
                         WHERE j.visibility = 'mentor' AND j.memberId IN ($ph) ORDER BY j.createdAt DESC LIMIT 60", $peer ? [] : $ids) as $j) {
            $t = 'journal:' . $j['entryId'];
            $out[] = ['id' => $t, 'threadId' => $t, 'kind' => 'Journal entry shared with you', 'filter' => 'journal', 'from' => (string)$j['fullName'], 'subjectId' => (string)$j['memberId'],
                      'at' => (string)$j['createdAt'], 'body' => trim(((string)$j['title'] !== '' ? $j['title'] . "\n\n" : '') . (string)$j['body']), 'read' => isset($read[$t])];
        }
        foreach (db_all("SELECT * FROM mentor_messages WHERE kind = 'From your mentee' AND subjectId IN ($ph) ORDER BY createdAt DESC LIMIT 60", $ids) as $mm) {
            $out[] = ['id' => 'm:' . $mm['id'], 'threadId' => (string)$mm['threadId'], 'kind' => 'Message from your mentee', 'filter' => 'chat', 'from' => (string)$mm['fromName'],
                      'subjectId' => (string)$mm['subjectId'], 'at' => (string)$mm['createdAt'], 'body' => (string)$mm['body'], 'read' => (string)$mm['readAt'] !== ''];
        }
        if (!$peer) foreach (db_all("SELECT c.id, c.memberId, c.wellbeing, c.note, c.createdAt, m.fullName FROM member_checkins c JOIN members m ON m.memberId = c.memberId
                         WHERE c.memberId IN ($ph) AND (c.note <> '' OR c.wellbeing <> 'Okay') ORDER BY c.createdAt DESC LIMIT 40", $ids) as $c) {
            $t = 'checkin:' . $c['id'];
            $out[] = ['id' => $t, 'threadId' => $t, 'kind' => 'Check-in', 'filter' => 'checkin', 'from' => (string)$c['fullName'], 'subjectId' => (string)$c['memberId'],
                      'at' => (string)$c['createdAt'], 'body' => $c['wellbeing'] . ($c['note'] !== '' ? ' — “' . $c['note'] . '”' : ''), 'read' => isset($read[$t])];
        }
    }
    $kinds = $peer ? "'From your lead','Peer session note','From your mentor','Supervision prep'" : "'Family reply','From your lead','Peer session note','From your mentor','Supervision prep'";
    foreach (db_all("SELECT * FROM mentor_messages WHERE toId = ? AND kind IN ($kinds) ORDER BY createdAt DESC LIMIT 60", [$g['me']]) as $m) {
        $out[] = ['id' => 'm:' . $m['id'], 'threadId' => (string)$m['threadId'], 'kind' => (string)$m['kind'], 'filter' => $m['kind'] === 'Family reply' ? 'family' : 'lead', 'fromId' => (string)$m['fromId'],
                  'from' => (string)$m['fromName'], 'subjectId' => (string)$m['subjectId'], 'at' => (string)$m['createdAt'], 'body' => (string)$m['body'], 'read' => (string)$m['readAt'] !== ''];
    }
    usort($out, static fn($a, $b) => strcmp($b['at'], $a['at']));
    $replies = [];
    $threads = array_values(array_unique(array_column($out, 'threadId')));
    if ($threads) {
        $tp = implode(',', array_fill(0, count($threads), '?'));
        foreach (db_all("SELECT threadId, body, fromName, createdAt, status FROM mentor_messages WHERE kind = 'Reply' AND threadId IN ($tp) ORDER BY createdAt", $threads) as $r) $replies[$r['threadId']][] = $r;
    }
    foreach ($out as &$o) $o['replies'] = $replies[$o['threadId']] ?? [];
    unset($o);
    return ['ok' => true, 'messages' => $out, 'peer' => $g['mpRole'] === 'peer'];
}
function member_mp_message_read(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $t = (string)($p['threadId'] ?? '');
    if (str_starts_with($t, 'm:')) { db_exec("UPDATE mentor_messages SET readAt = ? WHERE id = ? AND toId = ? AND readAt = ''", [now_iso(), (int)substr($t, 2), $g['me']]); return ['ok' => true]; }
    if (!preg_match('/^(journal|checkin):[A-Za-z0-9_-]+$/', $t)) return ['ok' => false, 'error' => 'bad_thread'];
    if (!db_row("SELECT 1 FROM mentor_messages WHERE threadId = ? AND fromId = ? AND kind = 'read'", [$t, $g['me']])) mp_message_put($t, 'read', '', $g['me'], '', '', '-', 'sent');
    return ['ok' => true];
}
/** messageLead — "Talk to {lead}": a message to the lead mentor, on record. A lead writes back with toId. */
function member_mp_message_lead(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $body = trim((string)($p['body'] ?? ''));
    if ($body === '') return ['ok' => false, 'error' => 'write_a_message'];
    $to = trim((string)($p['toId'] ?? ''));
    $name = (string)($g['mentorRow']['fullName'] ?? $g['member']['fullName'] ?? '');
    if ($to !== '') {
        // A lead or coordinator writing to one of their mentors.
        if (!in_array($g['mpRole'], ['lead', 'coord'], true) || !in_array($to, array_column(mp_team_rows($g), 'memberId'), true)) return ['ok' => false, 'error' => 'forbidden'];
        mp_message_put('lead:' . $to, 'From your lead', '', $g['me'], $name, $to, $body);
        if (function_exists('push_notification')) push_notification($to, ['kind' => 'mentor', 'title' => 'From ' . mp_first($name), 'body' => mb_substr($body, 0, 140), 'linkPage' => 'mentor']);
        return ['ok' => true];
    }
    if (!$g['lead'] || (string)($g['lead']['memberId'] ?? '') === '') return ['ok' => false, 'error' => 'no_lead'];
    mp_message_put('lead:' . $g['me'], 'From your mentor', '', $g['me'], $name, (string)$g['lead']['memberId'], $body);
    if (function_exists('push_notification')) push_notification((string)$g['lead']['memberId'], ['kind' => 'mentor', 'title' => 'From ' . mp_first($name), 'body' => mb_substr($body, 0, 140), 'linkPage' => 'mentor']);
    return ['ok' => true];
}
/** Reply to a message. Between 8am and 8pm it goes now; otherwise it waits. Kept on record. */
function member_mp_message_reply(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $t = (string)($p['threadId'] ?? ''); $body = trim((string)($p['body'] ?? ''));
    if ($body === '') return ['ok' => false, 'error' => 'write_a_reply'];
    if (mb_strlen($body) > MP_CHAT_MAX) return ['ok' => false, 'error' => 'too_long', 'max' => MP_CHAT_MAX];
    $subject = trim((string)($p['subjectId'] ?? ''));
    if ($subject !== '' && !in_array($subject, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    if ($g['mpRole'] === 'peer' && (str_starts_with($t, 'family:') || str_starts_with($t, 'journal:') || str_starts_with($t, 'checkin:'))) return ['ok' => false, 'error' => 'peer_no_family'];
    /* The thread must belong to the child named — the one checked against
     * the caseload above. The thread id was taken as given, so a reply could
     * be written into ANY child's chat by naming their thread and leaving
     * subjectId empty, or naming one of your own mentees beside it. */
    if (!str_starts_with($t, 'lead:')) {
        if ($subject === '') return ['ok' => false, 'error' => 'not_in_caseload'];
        [$kind, $ref] = array_pad(explode(':', $t, 2), 2, '');
        $own = match ($kind) {
            'chat', 'family' => $ref === $subject,
            'journal' => (bool)db_row("SELECT 1 FROM journal WHERE entryId = ? AND memberId = ? AND visibility = 'mentor' LIMIT 1", [$ref, $subject]),
            'checkin' => (bool)db_row('SELECT 1 FROM member_checkins WHERE id = ? AND memberId = ? LIMIT 1', [(int)$ref, $subject]),
            default => false,
        };
        if (!$own) return ['ok' => false, 'error' => 'not_found'];
        // The id written is the server's, built from the checked parts, never
        // the string the client sent (which may carry trailing text).
        $t = $kind . ':' . ($kind === 'checkin' ? (string)(int)$ref : ($kind === 'journal' ? $ref : $subject));
    }
    if (str_starts_with($t, 'lead:')) {
        // Mentor ↔ lead conversations are colleagues, not families: no quiet-hours hold.
        $orig = db_row("SELECT fromId, toId FROM mentor_messages WHERE threadId = ? AND kind <> 'Reply' AND (toId = ? OR fromId = ?) ORDER BY id DESC LIMIT 1", [$t, $g['me'], $g['me']]);
        if (!$orig) return ['ok' => false, 'error' => 'not_found'];
        $other = (string)$orig['fromId'] === $g['me'] ? (string)$orig['toId'] : (string)$orig['fromId'];
        mp_message_put($t, (string)$orig['fromId'] === $g['me'] ? 'From your mentor' : (in_array($g['mpRole'], ['lead', 'coord'], true) ? 'From your lead' : 'From your mentor'), '', $g['me'],
                       (string)($g['mentorRow']['fullName'] ?? $g['member']['fullName'] ?? ''), $other, $body);
        return ['ok' => true, 'queued' => false];
    }
    $later = mp_next_send_time();
    mp_message_put($t, 'Reply', $subject, $g['me'], (string)($g['mentorRow']['fullName'] ?? $g['member']['fullName'] ?? ''), $subject, $body, $later !== '' ? 'queued' : 'sent', $later);
    if ($subject !== '' && $later === '' && function_exists('push_notification') && !str_starts_with($t, 'family:')) {
        push_notification($subject, ['kind' => 'mentor', 'title' => 'Your mentor replied', 'body' => mb_substr($body, 0, 140), 'linkPage' => str_starts_with($t, 'journal:') ? 'journal' : 'dashboard']);
    }
    return ['ok' => true, 'queued' => $later !== ''];
}

/* ── The member's chat with their mentor ─────────────────────────────────
 * One thread per member (`chat:<memberId>`) in mentor_messages, so the mentor
 * reads and answers it in the inbox they already use (filter "Mentees"), and
 * their reply goes through the same quiet-hours rule. The member's view also
 * shows the mentor's replies to their check-ins and shared journal entries:
 * everything their mentor wrote them, in one place.
 *
 * A message matching the crisis phrases (COACH_CRISIS_RE) still goes to the
 * mentor, is flagged, and is sent to the centre's safeguarding officer at once;
 * the member is shown who to call now. It is never held back.
 */
const MP_CHAT_MAX = 1200;

function mp_chat_mentor(string $memberId): ?array {
    $a = db_row("SELECT a.mentorId, t.memberId mentorMember, t.fullName FROM mentor_assignments a LEFT JOIN mentors t ON t.mentorId = a.mentorId
                 WHERE a.memberId = ? AND a.status = 'active' ORDER BY a.id DESC LIMIT 1", [$memberId]);
    return ($a && (string)$a['mentorMember'] !== '') ? $a : null;
}

/** member.mentor.chat — the conversation, oldest first; marks the mentor's messages read. */
function member_mp_chat(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    $m = db_row("SELECT memberId, fullName FROM members WHERE memberId = ? LIMIT 1", [$me]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $a = mp_chat_mentor($me);
    $threads = ['chat:' . $me];
    foreach (db_all("SELECT id FROM member_checkins WHERE memberId = ? ORDER BY id DESC LIMIT 20", [$me]) as $c) $threads[] = 'checkin:' . $c['id'];
    foreach (db_all("SELECT entryId FROM journal WHERE memberId = ? AND visibility = 'mentor' ORDER BY createdAt DESC LIMIT 20", [$me]) as $j) $threads[] = 'journal:' . $j['entryId'];
    $ph = implode(',', array_fill(0, count($threads), '?'));
    $now = now_iso();
    $rows = db_all("SELECT id, threadId, kind, fromId, fromName, body, status, sendAfter, readAt, createdAt FROM mentor_messages
                    WHERE threadId IN ($ph) AND kind IN ('From your mentee', 'Reply') ORDER BY createdAt, id LIMIT 300", $threads);
    $out = [];
    foreach ($rows as $r) {
        $mine = (string)$r['fromId'] === $me;
        // A reply held for quiet hours is not shown until it is due.
        if (!$mine && (string)$r['status'] === 'queued' && (string)$r['sendAfter'] > $now) continue;
        $out[] = ['id' => (int)$r['id'], 'mine' => $mine, 'from' => $mine ? 'You' : (string)$r['fromName'], 'body' => (string)$r['body'], 'at' => (string)$r['createdAt'],
            'about' => str_starts_with((string)$r['threadId'], 'checkin:') ? 'Your check-in' : (str_starts_with((string)$r['threadId'], 'journal:') ? 'Your journal entry' : ''),
            'read' => $mine ? (string)$r['readAt'] !== '' : true];
    }
    db_exec("UPDATE notifications SET readAt = ? WHERE memberId = ? AND kind = 'mentor' AND (readAt = '' OR readAt IS NULL)", [$now, $me]);
    return ['ok' => true, 'mentor' => $a ? ['name' => (string)$a['fullName'], 'first' => mp_first((string)$a['fullName'])] : null,
        'messages' => $out, 'quiet' => mp_in_quiet_hours(), 'max' => MP_CHAT_MAX];
}

/** member.mentor.chat.send — a message to the member's own mentor. */
function member_mp_chat_send(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    $m = db_row("SELECT memberId, fullName, centre, status FROM members WHERE memberId = ? LIMIT 1", [$me]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $body = trim((string)($p['body'] ?? ''));
    if ($body === '') return ['ok' => false, 'error' => 'write_a_message'];
    if (mb_strlen($body) > MP_CHAT_MAX) return ['ok' => false, 'error' => 'too_long', 'max' => MP_CHAT_MAX];
    $a = mp_chat_mentor($me);
    if (!$a) return ['ok' => false, 'error' => 'no_mentor'];
    $crisis = defined('COACH_CRISIS_RE') && preg_match(COACH_CRISIS_RE, $body) === 1;
    $id = mp_message_put('chat:' . $me, 'From your mentee', $me, $me, (string)$m['fullName'], (string)$a['mentorMember'], $body);
    $first = mp_first((string)$m['fullName']);
    push_notification((string)$a['mentorMember'], ['kind' => 'mentor', 'title' => ($crisis ? 'Urgent: ' : '') . $first . ' wrote to you', 'body' => mb_substr($body, 0, 140), 'linkPage' => 'mentor']);
    if ($crisis) {
        $o = function_exists('sg_officer') ? sg_officer((string)$m['centre']) : null;
        if ($o && filter_var((string)($o['email'] ?? ''), FILTER_VALIDATE_EMAIL)) {
            try { send_mail((string)$o['email'], 'Urgent: a member may be at risk', '<p>A message ' . esc_html($first) . ' at ' . esc_html((string)$m['centre']) . ' sent to their mentor matched the safeguarding phrases. Their mentor has it too. Read it in the Control Room → People → Mentorship today.</p>'); } catch (\Throwable $e) {}
        }
        if (function_exists('event_emit')) event_emit('behaviour.flagged', ['ref' => 'chat:' . $id, 'subject' => 'A child', 'category' => 'safeguarding', 'severity' => 'urgent', 'source' => 'member.chat']);
        audit('safeguarding.chat', $me, $me, ['messageId' => $id], (string)($p['ip'] ?? ''));
    }
    return ['ok' => true, 'id' => $id, 'crisis' => $crisis, 'mentor' => mp_first((string)$a['fullName']),
        'help' => $crisis ? 'If you are in danger now, call 112. You can also call NGG safeguarding on +234 903 777 6318. You are not in trouble, and you are not alone.' : ''];
}

/* ── The member's own weekly check-in ───────────────────────────────────── */

/** member.checkin.save — Okay / Struggling / Need help, optional sleep, stress, energy (1–5) and a note. */
function member_checkin_save(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    $m = db_row("SELECT memberId, fullName, centre FROM members WHERE memberId = ? AND status = 'active'", [$me]);
    if (!$m) return ['ok' => false, 'error' => 'no_member'];
    $w = (string)($p['wellbeing'] ?? '');
    if (!in_array($w, ['Okay', 'Struggling', 'Need help'], true)) return ['ok' => false, 'error' => 'bad_wellbeing'];
    $n = static fn($k) => max(0, min(5, (int)($p[$k] ?? 0)));
    $week = iso_week_period(mp_lagos_now()); $now = now_iso();
    db_upsert('member_checkins', ['memberId' => $me, 'week' => $week, 'wellbeing' => $w, 'sleep' => $n('sleep'), 'stress' => $n('stress'), 'energy' => $n('energy'),
        'note' => mb_substr(trim((string)($p['note'] ?? '')), 0, 600), 'createdAt' => $now], ['memberId', 'week'],
        ['wellbeing' => $w, 'sleep' => $n('sleep'), 'stress' => $n('stress'), 'energy' => $n('energy'), 'note' => mb_substr(trim((string)($p['note'] ?? '')), 0, 600), 'createdAt' => $now]);
    if ($w !== 'Okay') mp_job_wellbeing_alert($m, $w);
    return ['ok' => true, 'week' => $week];
}
/**
 * The member's side, for their dashboard: this week's check-in (done or not),
 * whether their mentor asked for their side of the relationship check, their
 * last self-score, their active goal (agreed ones only) and their mentor's name.
 */
function member_mp_mine(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    if (!db_row("SELECT 1 FROM members WHERE memberId = ? AND status = 'active'", [$me])) return ['ok' => false, 'error' => 'no_member'];
    $o = mp_opts();
    $a = db_row("SELECT a.mentorId, t.fullName FROM mentor_assignments a LEFT JOIN mentors t ON t.mentorId = a.mentorId WHERE a.memberId = ? AND a.status = 'active' LIMIT 1", [$me]);
    $week = iso_week_period(mp_lagos_now());
    $chk = db_row('SELECT wellbeing, sleep, stress, energy, note, createdAt FROM member_checkins WHERE memberId = ? AND week = ?', [$me, $week]);
    $cycle = mp_cycle(gmdate('Y-m-d', mp_lagos_now()), $o['relWeeks']);
    $mentorSide = db_row("SELECT createdAt FROM mentor_rel_checks WHERE subjectId = ? AND side = 'mentor' AND cycle = ?", [$me, $cycle]);
    $childSide = db_row("SELECT score, createdAt FROM mentor_rel_checks WHERE subjectId = ? AND side = 'child' AND cycle = ?", [$me, $cycle]);
    $goal = db_row("SELECT id, goal, outcome, obstacle, plan, area, reviewBy FROM mentor_goals WHERE subjectId = ? AND status = 'active' AND agreed = 1 ORDER BY id DESC LIMIT 1", [$me]);
    if ($goal) { $c = mentor_goal_checks_for([(int)$goal['id']])[(int)$goal['id']] ?? []; $goal['progress'] = $c ? (int)end($c)['progress'] : 0; }
    $self = db_row("SELECT month, scores FROM mentor_scorecards WHERE subjectId = ? AND byKind = 'member' ORDER BY month DESC LIMIT 1", [$me]);
    return ['ok' => true, 'week' => $week, 'checkin' => $chk, 'mentor' => $a ? ['name' => (string)$a['fullName'], 'first' => mp_first((string)$a['fullName'])] : null,
            'relAsked' => $a !== null && ($mentorSide !== null || ($childSide === null && db_row("SELECT 1 FROM mentor_nudges WHERE status = 'open' AND rule = 'J:relCheckDue' AND memberId = ?", [$me]) !== null)),
            'relDone' => $childSide !== null, 'relQuestions' => MP_REL_Q_CHILD, 'goal' => $goal,
            'selfScore' => $self ? ['month' => (string)$self['month'], 'scores' => array_map('intval', explode(',', (string)$self['scores']))] : null,
            'selfScoreDue' => !$self || (string)$self['month'] < gmdate('Y-m', mp_lagos_now()), 'skills' => MP_SKILLS,
            /* The member's own Leadership Index as their mentor scored it — theirs
             * to read (a ladder somebody climbs without being told where they are
             * is assessment, not formation). The last three months, for the trend;
             * never a rank against anybody else. */
            'mentorScores' => array_map(static fn($r) => ['month' => (string)$r['month'], 'scores' => array_map('intval', explode(',', (string)$r['scores'])), 'total' => (int)$r['total']],
                db_all("SELECT month, scores, total FROM mentor_scorecards WHERE subjectId = ? AND byKind = 'mentor' ORDER BY month DESC LIMIT 3", [$me])),
            'checkins' => db_all('SELECT week, wellbeing, sleep, stress, energy FROM member_checkins WHERE memberId = ? ORDER BY week DESC LIMIT 8', [$me])];
}

/** wellbeingAlert (event job): tell the mentor now, and the safeguarding lead when they asked for help. */
function mp_job_wellbeing_alert(array $m, string $w): void {
    $a = db_row("SELECT a.mentorId, t.memberId mentorMember, t.fullName mentorName, t.email FROM mentor_assignments a LEFT JOIN mentors t ON t.mentorId = a.mentorId
                 WHERE a.memberId = ? AND a.status = 'active' LIMIT 1", [(string)$m['memberId']]);
    $first = mp_first((string)$m['fullName']);
    if ($a && function_exists('ms_nudge')) {
        ms_nudge('J:wellbeingAlert:' . $m['memberId'] . ':' . iso_week_period(), 'J:wellbeingAlert', ['audience' => 'mentor', 'mentorId' => (string)$a['mentorId'], 'memberId' => (string)$m['memberId'],
            'centre' => (string)$m['centre'], 'title' => $first . ($w === 'Need help' ? ' asked for help' : ' said they’re struggling'), 'body' => 'This week’s check-in · talk to them before Saturday']);
        if ((string)($a['mentorMember'] ?? '') !== '' && function_exists('push_notification')) push_notification((string)$a['mentorMember'], ['kind' => 'mentor', 'title' => $first . ' needs you', 'body' => 'Their check-in this week: ' . $w . '.', 'linkPage' => 'mentor']);
    }
    if ($w === 'Need help' && function_exists('sg_officer')) {
        $o = sg_officer((string)$m['centre']);
        if ($o && filter_var((string)($o['email'] ?? ''), FILTER_VALIDATE_EMAIL)) {
            try { send_mail((string)$o['email'], 'A member asked for help in their check-in', '<p>' . esc_html($first) . ' at ' . esc_html((string)$m['centre']) . ' answered “Need help” in this week’s check-in. Their mentor has been told. Open the Control Room → People → Mentorship.</p>'); } catch (\Throwable $e) {}
        }
    }
}

/* ── Saturday ───────────────────────────────────────────────────────────── */

const MP_AGENDA_DEFAULT = [
    ['title' => 'Pod huddle', 'sub' => 'The register, a review of the previous week, assignments and dues/fines', 'minutes' => 10, 'fixed' => true],
    ['title' => 'Musing', 'sub' => 'Anchor Journal, personal timetable, goals, courage, chess and leadership', 'minutes' => 30, 'fixed' => false],
    ['title' => 'One-to-ones', 'sub' => 'Who are you becoming, and what evidence do we have?', 'minutes' => 45, 'fixed' => true],
    ['title' => 'Close', 'sub' => 'One thing each person will do this week', 'minutes' => 5, 'fixed' => true],
];
const MP_ACTIVITIES = [
    ['title' => 'Hot seat', 'aim' => 'Courage', 'minutes' => 20, 'sub' => 'Each person answers three questions from the pod, standing.'],
    ['title' => 'Fear ladder', 'aim' => 'Courage', 'minutes' => 25, 'sub' => 'Rank five fears, pick the lowest rung to climb this week.'],
    ['title' => 'Two roses and a thorn', 'aim' => 'Reflection', 'minutes' => 15, 'sub' => 'Two wins and one hard thing from the week.'],
    ['title' => 'Journal swap', 'aim' => 'Reflection', 'minutes' => 20, 'sub' => 'Read one line you are willing to share; the pod asks one question.'],
    ['title' => 'Bridge build', 'aim' => 'Teamwork', 'minutes' => 30, 'sub' => 'Paper and tape, ten minutes, one rule: everyone builds.'],
    ['title' => 'Silent line-up', 'aim' => 'Teamwork', 'minutes' => 15, 'sub' => 'Line up by birthday without speaking.'],
    ['title' => 'Teach-back', 'aim' => 'Leadership', 'minutes' => 25, 'sub' => 'One mentee teaches the pod something in five minutes.'],
    ['title' => 'Chair the huddle', 'aim' => 'Leadership', 'minutes' => 15, 'sub' => 'A mentee runs next week’s huddle; the pod gives one piece of feedback.'],
    ['title' => 'Promise check', 'aim' => 'Character', 'minutes' => 15, 'sub' => 'Who kept last week’s promise, and what got in the way.'],
    ['title' => 'Respect map', 'aim' => 'Character', 'minutes' => 20, 'sub' => 'Where respect was tested this week, at home, school and with friends.'],
];

/** view=saturday — Before (agenda + one-to-ones), During (register), After (reviews). */
function member_mp_saturday(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $o = mp_opts(); $today = mp_today($p);
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['date'] ?? '')) ? (string)$p['date'] : (gmdate('w', strtotime($today)) === '6' ? $today : mp_next_saturday($today));
    $mentorKey = (string)($g['mentorId'] ?: $g['me']);
    $row = db_row('SELECT * FROM mentor_saturdays WHERE mentorId = ? AND onDate = ?', [$mentorKey, $date]);
    $ms = mp_mentees(mp_caseload_ids($g), $g['mpRole'], $today, $o);
    $picks = $row && $row['oneToOnesJson'] !== '' ? (json_decode((string)$row['oneToOnesJson'], true) ?: []) : [];
    if (!$picks) {
        // Longest since their last one-to-one first (the Thursday job does the same).
        $by = $ms; usort($by, static fn($a, $b) => ($b['flags']['contactDays'] ?? 9999) <=> ($a['flags']['contactDays'] ?? 9999));
        $picks = array_map(static fn($m) => $m['id'], array_slice($by, 0, 3));
    }
    $reg = [];
    $ids = array_column($ms, 'id');
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT subjectId, here, observed, checks, note FROM mentor_register WHERE onDate = ? AND subjectId IN ($ph)", array_merge([$date], $ids)) as $r) $reg[$r['subjectId']] = ['here' => (int)$r['here'] === 1, 'observed' => json_decode((string)$r['observed'], true) ?: [], 'checks' => json_decode((string)($r['checks'] ?? ''), true) ?: [], 'note' => (string)($r['note'] ?? '')];
        /* The gate's check-in time answers "on time" for a child the mentor has not ticked: before 8:01 Lagos. */
        foreach (db_all("SELECT studentId, MIN(checkInAt) t FROM attendance WHERE date = ? AND studentId IN ($ph) GROUP BY studentId", array_merge([$date], $ids)) as $r) {
            $at = (string)$r['t']; $early = $at !== '' && gmdate('H:i', strtotime($at) + 3600) <= '08:00';
            if (!isset($reg[$r['studentId']])) $reg[$r['studentId']] = ['here' => true, 'observed' => [], 'checks' => $early ? ['On time'] : [], 'gate' => true];
            $reg[$r['studentId']]['arrivedAt'] = $at !== '' ? gmdate('H:i', strtotime($at) + 3600) : '';
        }
    }
    $period = iso_week_period(strtotime($date . 'T12:00:00Z'));
    $reviews = [];
    if ($ids) foreach (db_all('SELECT subjectId, effort, characterLevel, wellbeing, line FROM mentor_reviews WHERE period = ? AND subjectId IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([$period], $ids)) as $r) $reviews[$r['subjectId']] = $r;
    return ['ok' => true, 'date' => $date, 'agenda' => $row && $row['agendaJson'] !== '' ? json_decode((string)$row['agendaJson'], true) : MP_AGENDA_DEFAULT,
        'oneToOnes' => $picks, 'sharedAt' => (string)($row['sharedAt'] ?? ''), 'registerClosedAt' => (string)($row['registerClosedAt'] ?? ''),
        'activities' => MP_ACTIVITIES, 'values' => MP_VALUES, 'checks' => MP_CHECKS, 'levels' => MP_LEVELS,
        'mentees' => array_map(static fn($m) => ['id' => $m['id'], 'name' => $m['name'], 'first' => $m['first'], 'initials' => $m['initials'], 'contactDays' => $m['flags']['contactDays']], $ms),
        'register' => $reg, 'reviews' => $reviews, 'period' => $period];
}
/** saturdayPlan — the agenda and the one-to-ones. Fixed items cannot be removed; total ≤ 90 is advised, not enforced. */
function member_mp_saturday_plan(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $date = (string)($p['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    $items = [];
    foreach ((array)($p['agenda'] ?? []) as $it) {
        $t = mb_substr(trim((string)($it['title'] ?? '')), 0, 80);
        if ($t === '') continue;
        $items[] = ['title' => $t, 'sub' => mb_substr(trim((string)($it['sub'] ?? '')), 0, 160), 'minutes' => max(0, min(120, (int)($it['minutes'] ?? 0))), 'fixed' => !empty($it['fixed'])];
    }
    foreach (['Pod huddle', 'One-to-ones', 'Close'] as $fx) if (!array_filter($items, static fn($i) => $i['title'] === $fx)) return ['ok' => false, 'error' => 'fixed_item_missing', 'item' => $fx];
    $case = mp_caseload_ids($g);
    $picks = array_values(array_intersect(array_map('strval', (array)($p['oneToOnes'] ?? [])), $case));
    $key = (string)($g['mentorId'] ?: $g['me']); $now = now_iso();
    db_upsert('mentor_saturdays', ['mentorId' => $key, 'onDate' => $date, 'agendaJson' => json_encode($items), 'oneToOnesJson' => json_encode($picks),
        'registerClosedAt' => '', 'sharedAt' => !empty($p['share']) ? $now : '', 'updatedAt' => $now], ['mentorId', 'onDate'],
        ['agendaJson' => json_encode($items), 'oneToOnesJson' => json_encode($picks), 'updatedAt' => $now] + (!empty($p['share']) ? ['sharedAt' => $now] : []));
    if (!empty($p['share']) && $g['lead']) mp_message_put('lead:' . $g['me'], 'From your mentor', '', $g['me'], (string)($g['mentorRow']['fullName'] ?? ''), (string)($g['lead']['memberId'] ?? ''),
        'Saturday plan for ' . $date . ': ' . implode(' · ', array_map(static fn($i) => $i['title'] . ' (' . $i['minutes'] . ')', $items)));
    return ['ok' => true, 'total' => array_sum(array_column($items, 'minutes'))];
}
/** oneToOnesAdd — the Mentees bulk bar: add children to the next Saturday's one-to-ones, keeping the agenda. */
function member_mp_one_to_ones_add(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $ids = array_values(array_intersect(array_map('strval', (array)($p['subjectIds'] ?? [])), mp_caseload_ids($g)));
    if (!$ids) return ['ok' => false, 'error' => 'choose_a_mentee'];
    $today = mp_today($p);
    $date = gmdate('w', strtotime($today)) === '6' ? $today : mp_next_saturday($today);
    $key = (string)($g['mentorId'] ?: $g['me']); $now = now_iso();
    $row = db_row('SELECT oneToOnesJson FROM mentor_saturdays WHERE mentorId = ? AND onDate = ?', [$key, $date]);
    $have = $row ? (json_decode((string)$row['oneToOnesJson'], true) ?: []) : [];
    $all = array_values(array_unique(array_merge($have, $ids)));
    db_upsert('mentor_saturdays', ['mentorId' => $key, 'onDate' => $date, 'agendaJson' => '', 'oneToOnesJson' => json_encode($all), 'registerClosedAt' => '', 'sharedAt' => '', 'updatedAt' => $now],
        ['mentorId', 'onDate'], ['oneToOnesJson' => json_encode($all), 'updatedAt' => $now]);
    return ['ok' => true, 'date' => $date, 'added' => count($all) - count($have), 'total' => count($all)];
}
/** register — Here / Away and the four values seen, per child. Saved as tapped (offline queue friendly). */
/**
 * A register or a review is for a Saturday that happened, recently. Unbounded,
 * a crafted request could close a register for any date — and closing one
 * writes centre attendance — so a mentor could fabricate presence for a day
 * years ago or next month. Two weeks back is the write-up window.
 */
function mp_recent_date(string $date, string $today, int $days = 14): bool {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date > $today) return false;
    return mp_days($date, $today) <= $days;
}
/** A Saturday the programme met on, today or within the last fortnight. The
 *  register and the weekly review are about a Saturday: a Wednesday register,
 *  or next Saturday's, is a record of a day nobody was there. */
function mp_saturday_ok(string $date, string $today): bool {
    return mp_recent_date($date, $today) && gmdate('w', strtotime($date . 'T12:00:00Z')) === '6';
}
function member_mp_register(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $date = (string)($p['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    if (!mp_recent_date($date, mp_today($p))) return ['ok' => false, 'error' => 'date_out_of_range'];
    if (!mp_saturday_ok($date, mp_today($p))) return ['ok' => false, 'error' => 'not_a_saturday'];
    $case = mp_caseload_ids($g); $now = now_iso(); $n = 0;
    foreach ((array)($p['rows'] ?? []) as $r) {
        $sid = (string)($r['subjectId'] ?? '');
        if (!in_array($sid, $case, true)) continue;
        $here = !empty($r['here']);
        $obs = $here ? array_values(array_intersect(array_map('strval', (array)($r['observed'] ?? [])), MP_VALUES)) : [];
        // Duties only for a child who is here; anything outside MP_CHECKS is dropped, never stored.
        $chk = $here ? array_values(array_intersect(array_map('strval', (array)($r['checks'] ?? [])), MP_CHECKS)) : [];
        $upd = ['here' => $here ? 1 : 0, 'observed' => json_encode($obs), 'checks' => json_encode($chk), 'mentorId' => (string)($g['mentorId'] ?: $g['me']), 'updatedAt' => $now];
        // The detail line is written only when the row carries one, so a tap on a value never wipes it.
        if (array_key_exists('note', $r)) $upd['note'] = $here ? mb_substr(trim((string)$r['note']), 0, MP_NOTE_MAX) : '';
        db_upsert('mentor_register', ['onDate' => $date, 'subjectId' => $sid] + $upd + ['note' => $upd['note'] ?? ''], ['onDate', 'subjectId'], $upd);
        $n++;
    }
    if (!empty($p['close'])) {
        $key = (string)($g['mentorId'] ?: $g['me']);
        db_upsert('mentor_saturdays', ['mentorId' => $key, 'onDate' => $date, 'agendaJson' => '', 'oneToOnesJson' => '', 'registerClosedAt' => $now, 'sharedAt' => '', 'updatedAt' => $now],
            ['mentorId', 'onDate'], ['registerClosedAt' => $now, 'updatedAt' => $now]);
        // registerSync: a child marked Here is present on the centre record too (the gate may have missed them).
        foreach (db_all("SELECT subjectId FROM mentor_register WHERE onDate = ? AND here = 1", [$date]) as $r) {
            if (!in_array($r['subjectId'], $case, true)) continue;
            if (!db_row('SELECT 1 FROM attendance WHERE studentId = ? AND date = ?', [$r['subjectId'], $date])) {
                try { db_insert('attendance', ['cohortId' => '', 'studentId' => $r['subjectId'], 'token' => '', 'date' => $date, 'checkInAt' => $now, 'method' => 'mentor', 'byId' => $g['me']]); } catch (\Throwable $e) {}
            }
        }
    }
    return ['ok' => true, 'saved' => $n];
}
/**
 * mentor_reviews has two writers for one row (child, week): the legacy twelve-
 * question review and this three-rating one. Replacing the answers with
 * {"learned": …} erased the other's eleven answers, and writing concern = 0
 * cleared a concern it had raised. The line merges into what is there.
 */
function mp_review_answers_merge(?array $existing, string $line): string {
    $a = $existing ? json_decode((string)($existing['answers'] ?? ''), true) : null;
    $a = is_array($a) ? $a : [];
    if ($line !== '') $a['learned'] = $line;
    return json_encode($a ?: ['learned' => $line], JSON_UNESCAPED_UNICODE);
}
/** review — Effort / Character / Wellbeing (Low · Steady · Strong · Exceptional) and one line, per child per week. Logs the pod session. */
function member_mp_review(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $sid = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($sid, mp_caseload_ids($g), true)) return ['ok' => false, 'error' => 'not_in_caseload'];
    foreach (['effort', 'character', 'wellbeing'] as $k) if (!in_array((string)($p[$k] ?? ''), MP_LEVELS, true)) return ['ok' => false, 'error' => 'rate_all_three'];
    $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['date'] ?? '')) ? (string)$p['date'] : mp_last_saturday(mp_today($p));
    if (!mp_recent_date($date, mp_today($p))) return ['ok' => false, 'error' => 'date_out_of_range'];
    if (!mp_saturday_ok($date, mp_today($p))) return ['ok' => false, 'error' => 'not_a_saturday'];
    $period = iso_week_period(strtotime($date . 'T12:00:00Z'));
    $line = mb_substr(trim((string)($p['line'] ?? '')), 0, 600);
    $now = now_iso();
    $centre = (string)(db_row('SELECT centre FROM members WHERE memberId = ?', [$sid])['centre'] ?? '');
    $trend = ['Low' => 'worse', 'Steady' => 'same', 'Strong' => 'better', 'Exceptional' => 'better'][(string)$p['effort']] ?? '';
    $existing = db_row('SELECT * FROM mentor_reviews WHERE subjectId = ? AND period = ?', [$sid, $period]);
    $row = ['effort' => (string)$p['effort'], 'characterLevel' => (string)$p['character'], 'wellbeing' => (string)$p['wellbeing'], 'line' => $line,
            'answers' => mp_review_answers_merge($existing, $line), 'answered' => 1, 'trend' => $trend, 'mentorId' => $g['me'],
            'mentorName' => (string)($g['mentorRow']['fullName'] ?? ''), 'centre' => $centre, 'updatedAt' => $now];
    // A concern flag on the week's review is never cleared by saving a rating.
    if (!$existing) $row['concern'] = 0;
    if ($existing) db_update('mentor_reviews', $row, ['id' => (int)$existing['id']]);
    else db_insert('mentor_reviews', $row + ['subjectId' => $sid, 'subjectType' => 'member', 'period' => $period, 'createdAt' => $now]);
    // Saving a review logs a pod session record for the day (once).
    if (!db_row("SELECT 1 FROM mentor_meetings WHERE subjectId = ? AND metOn = ? AND kind = 'pod'", [$sid, $date])) {
        db_insert('mentor_meetings', ['subjectId' => $sid, 'subjectType' => 'member', 'mentorId' => $g['me'], 'mentorName' => (string)($g['mentorRow']['fullName'] ?? ''),
            'metOn' => $date, 'kind' => 'pod', 'discussed' => 'Saturday pod session' . ($line !== '' ? ': ' . $line : ''), 'agreed' => '', 'concern' => 0, 'centre' => $centre,
            'minutes' => 90, 'goalId' => 0, 'sharedWithLead' => 0, 'createdAt' => $now, 'updatedAt' => $now]);
    }
    return ['ok' => true, 'period' => $period];
}
function member_mp_review_undo(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $sid = trim((string)($p['subjectId'] ?? ''));
    $period = (string)($p['period'] ?? '');
    $n = db_exec("DELETE FROM mentor_reviews WHERE subjectId = ? AND period = ? AND mentorId = ?", [$sid, $period, $g['me']]);
    return $n ? ['ok' => true] : ['ok' => false, 'error' => 'not_found'];
}

/* ── Report a concern (one safeguarding queue) ──────────────────────────── */

/**
 * concern — to the safeguarding officer for the child's centre, into the one
 * queue the Control Room reads (safeguarding_cases: People → Mentorship →
 * Safeguarding, with its statuses and notes).
 * Not added to the child's record, not shown to the family, not editable by
 * the reporter. The officer is told now (email, and SMS when a phone is set).
 */
/**
 * Report a concern from the Mentor Portal's header.
 *
 * The reporter must be someone the portal serves — staff, a mentor (screened
 * or not: the duty to report does not wait for the Academy), an instructor —
 * and the child must be one they could have picked from their own roster.
 * It had no reporter check at all, so any member session could open a case
 * about any child id and learn from the answer whether that id existed. A
 * member who wants to raise a concern has sg_report, which is built for it.
 * Out of scope and unknown are the same answer, on purpose.
 */
function member_mp_concern(array $p): array {
    $g = mentor_gate($p);
    if (empty($g['ok'])) return ['ok' => false, 'error' => 'not_a_mentor'];
    $sid = trim((string)($p['subjectId'] ?? ''));
    if ($sid === '') return ['ok' => false, 'error' => 'choose_the_child'];
    $cat = (string)($p['category'] ?? '');
    if (!in_array($cat, MP_CONCERN_KINDS, true)) return ['ok' => false, 'error' => 'choose_the_kind'];
    $body = trim((string)($p['body'] ?? ''));
    if (mb_strlen($body) <= 10) return ['ok' => false, 'error' => 'say_what_happened'];
    // A member or a Summer School participant: the duty to report covers both.
    $sub = mentoring_subject($sid);
    // Scope for REPORTING is the mentor's own centre even before screening:
    // an unscreened gate reaches nobody, but the duty to report does not wait.
    // null is "everywhere" here, so array_key_exists, never ??.
    $reach = array_key_exists('reportCentres', $g) ? ['centres' => $g['reportCentres'], 'courses' => $g['reportCourses']] : $g;
    if (!$sub || !mentor_scope_ok($reach, $sub)) {
        return ['ok' => false, 'error' => 'not_found'];
    }
    return mp_concern_file($g['member'], $sub, $cat, $body, (string)($p['ip'] ?? ''), 'mentor.concern');
}

/**
 * Open a safeguarding case and tell the centre's officer — the ONE way a
 * concern enters the record. The portal's Report-a-concern sheet and a
 * meeting note marked as a concern both come through here, so both carry the
 * same guarantee: a case in safeguarding_cases (which concernEscalate
 * watches), the officer told by email and SMS, and an ops alarm when the
 * centre has nobody to tell. Two paths with different guarantees is how a
 * flagged concern ended up reaching nobody.
 */
function mp_concern_file(array $reporter, array $sub, string $cat, string $body, string $ip, string $source): array {
    $kid = ['memberId' => (string)$sub['id'], 'fullName' => (string)$sub['fullName'], 'centre' => (string)$sub['centre']];
    if (function_exists('sg_report_capped') && sg_report_capped((string)$reporter['memberId'])) return sg_report_refusal((string)$reporter['memberId'], (string)$kid['centre']);
    $officer = function_exists('sg_officer') ? sg_officer((string)$kid['centre']) : null;
    $ref = '';
    for ($i = 0; $i < 6 && $ref === ''; $i++) { $c = 'SG-' . str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT); if (!db_row('SELECT 1 FROM safeguarding_cases WHERE caseNo = ?', [$c])) $ref = $c; }
    $now = now_iso();
    db_insert('safeguarding_cases', ['caseNo' => $ref, 'reporterId' => (string)$reporter['memberId'], 'reporterName' => (string)($reporter['fullName'] ?? ''),
        'subjectId' => (string)$kid['memberId'], 'subjectName' => (string)$kid['fullName'], 'centre' => (string)$kid['centre'], 'category' => $cat,
        'body' => mb_substr($body, 0, 8000), 'officerId' => (string)($officer['memberId'] ?? ''), 'officerName' => (string)($officer['fullName'] ?? ''),
        'status' => 'received', 'createdAt' => $now, 'updatedAt' => $now]);
    if ($officer) {
        if (filter_var((string)($officer['email'] ?? ''), FILTER_VALIDATE_EMAIL)) {
            try { send_mail((string)$officer['email'], 'Safeguarding concern ' . $ref, '<p>A mentor reported a concern about a child at ' . esc_html((string)$kid['centre']) . '. Reference ' . $ref . '.</p><p>Read it in the Control Room → People → Mentorship → Safeguarding. The details are not sent by email.</p>'); } catch (\Throwable $e) {}
        }
        if (trim((string)($officer['phone'] ?? '')) !== '' && function_exists('sms_send')) { try { sms_send((string)$officer['phone'], 'NGG safeguarding: a concern was reported at ' . (string)$kid['centre'] . ' (' . $ref . '). Please read it today in the Control Room.'); } catch (\Throwable $e) {} }
    } elseif (function_exists('ops_record')) {
        ops_record('error', 'safeguarding.unassigned', 'A concern has no safeguarding officer to go to', $ref . ' at ' . (string)$kid['centre']);
    }
    if (function_exists('event_emit')) event_emit('behaviour.flagged', ['ref' => $ref, 'subject' => 'A child', 'category' => 'safeguarding', 'severity' => 'urgent', 'source' => $source]);
    audit('safeguarding.report', (string)$reporter['memberId'], $ref, ['centre' => (string)$kid['centre'], 'source' => $source], $ip);
    return ['ok' => true, 'ref' => $ref, 'at' => $now, 'officerName' => (string)($officer['fullName'] ?? ''), 'assigned' => (bool)$officer];
}

/* ── My role: the 12 commitments, supervision, the retreat ──────────────── */

/** The 12 tracked commitments for a month (MTRules.commitments), from the registers and records. */
function mp_commitments(array $g, string $month, string $today): array {
    $o = mp_opts(); $m = $g['mentorRow']; $peer = $g['mpRole'] === 'peer';
    $mid = (string)($m['mentorId'] ?? '');
    $first = $month . '-01'; $last = gmdate('Y-m-t', strtotime($first . 'T00:00:00Z'));
    $upto = min($today, $last);
    $count = static function (int $wd) use ($first, $upto) { $n = 0; for ($d = $first; $d <= $upto; $d = gmdate('Y-m-d', strtotime($d . 'T12:00:00Z') + 86400)) if ((int)gmdate('w', strtotime($d . 'T12:00:00Z')) === $wd) $n++; return $n; };
    $weeks = max(1, (int)ceil(max(1, mp_days($first, $upto) + 1) / 7));
    $att = static function (string $kind) use ($mid, $first, $upto) { return $mid === '' ? 0 : (int)(db_row("SELECT COUNT(*) c FROM mentor_obligations WHERE mentorId = ? AND kind = ? AND status = 'present' AND onDate BETWEEN ? AND ?", [$mid, $kind, $first, $upto])['c'] ?? 0); };
    $ids = mp_caseload_ids($g);
    $satsLeft = 0; for ($d = gmdate('Y-m-d', strtotime($upto) + 86400); $d <= $last; $d = gmdate('Y-m-d', strtotime($d . 'T12:00:00Z') + 86400)) if (gmdate('w', strtotime($d . 'T12:00:00Z')) === '6') $satsLeft++;
    $satMentored = $mid === '' ? 0 : max($att('saturday'), (int)(db_row("SELECT COUNT(DISTINCT onDate) c FROM mentor_saturdays WHERE mentorId = ? AND registerClosedAt <> '' AND onDate BETWEEN ? AND ?", [$mid, $first, $upto])['c'] ?? 0));
    /* Last Saturday's week. "Today minus two days" is that week only from
     * Saturday to Tuesday; on Wednesday 14 Oct it named W42, so every child
     * seen on Saturday the 10th (W41) read as unreviewed until Friday. */
    $period = iso_week_period(strtotime(mp_last_saturday($today) . 'T12:00:00Z'));
    $here = mp_last_register($g, $today);
    $revDone = $here ? count(db_all('SELECT 1 FROM mentor_reviews WHERE period = ? AND subjectId IN (' . implode(',', array_fill(0, count($here), '?')) . ')', array_merge([$period], $here))) : 0;
    $prevMonth = mp_prev_month($month);
    $scMissing = 0;
    if ($ids && (int)substr($today, 8, 2) >= 1) {
        $have = array_column(db_all("SELECT subjectId FROM mentor_scorecards WHERE byKind = 'mentor' AND month = ? AND subjectId IN (" . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([$prevMonth], $ids)), 'subjectId');
        $scMissing = count(array_diff($ids, $have));
    }
    $ms = $ids ? mp_mentees($ids, $g['mpRole'], $today, $o) : [];
    $famDue = count(array_filter($ms, static fn($x) => $x['flags']['family']));
    $j = mp_journal_unanswered($g, $ids);
    $retreat = db_row("SELECT r.*, (SELECT 1 FROM mentor_retreat_bookings b WHERE b.retreatId = r.retreatId AND b.mentorId = ?) booked FROM mentor_retreats r WHERE r.onDate >= ? ORDER BY r.onDate LIMIT 1", [$mid, $today]);
    $cimcDone = trim((string)($m['cimcAt'] ?? '')) !== '';
    $cimcHeld = $count(6); $cimcAtt = $att('cimc');
    $lead = $g['lead'] ? mp_first((string)$g['lead']['fullName']) : 'your lead';
    $row = static fn($k, $t, $rule, $st, $txt, $src, $act = null) => ['key' => $k, 'title' => $t, 'rule' => $rule, 'status' => $st, 'statusText' => $txt, 'source' => $src,
        'action' => $act ?? ($st === 'ok' ? null : ['label' => 'Talk to ' . $lead, 'route' => 'message:lead'])];
    return [
        $row('cimc', 'CIMC training', 'Saturdays 7:00am', ($cimcDone || $cimcAtt >= $cimcHeld - 1) ? 'ok' : 'warn', $cimcDone ? 'Complete' : $cimcAtt . ' of ' . $cimcHeld . ' Saturdays', 'Centre register'),
        $row('prep', 'Mentor Preparation Session', 'Weekly, 7:00–8:00pm · come prepared', $att('prep') >= $weeks ? 'ok' : 'warn', $att('prep') . ' of ' . $weeks . ' so far', 'Session register'),
        $row('saturdays', 'Mentor at the 8:30am breakout at least twice a month', $satsLeft . ' Saturday' . ($satsLeft === 1 ? '' : 's') . ' left', $satMentored >= $o['minSaturdays'] ? 'ok' : ($satsLeft + $satMentored < $o['minSaturdays'] ? 'bad' : 'warn'),
             $satMentored . ' of ' . $o['minSaturdays'], 'Saturday register', ['label' => 'Plan Saturday', 'route' => 'saturday:before']),
        $row('caseload', 'At least five children in your care', 'Assessment, scoring, follow-up and mentoring', ($peer || count($ids) >= $o['minCaseload']) ? 'ok' : 'bad', count($ids) . ' children', 'Your caseload'),
        $row('platform', 'Assess, score and monitor on the platform', 'Observations and weekly reviews by Monday', ($revDone >= count($here) && $scMissing === 0) ? 'ok' : 'warn',
             $revDone . ' of ' . count($here) . ' reviewed' . ($scMissing ? ' · ' . $scMissing . ' to score for ' . gmdate('F', strtotime($prevMonth . '-01')) : ''), 'Weekly reviews + scorecards', ['label' => 'Finish reviews', 'route' => 'saturday:after']),
        $row('journal', 'Anchor Journal with families and teachers', 'Reply to shared entries within a week', $j['over7'] ? 'warn' : 'ok', $j['n'] ? $j['n'] . ' waiting' : 'Up to date', 'Messages', ['label' => 'Open messages', 'route' => 'messages']),
        $row('sts', 'Tuesday STS meeting', 'Planning and review', $att('sts') >= $count(2) ? 'ok' : 'warn', $att('sts') . ' of ' . $count(2), 'Meeting register'),
        $row('parents', 'Parent engagements', 'Meetings and conversations about your mentees', ($peer || !$famDue) ? 'ok' : 'warn', $peer ? 'Your lead contacts families' : ($famDue ? $famDue . ($famDue === 1 ? ' family due' : ' families due') : 'Up to date'), 'Family updates', ['label' => 'See families', 'route' => 'mentees:family']),
        $row('projects', 'Support NGGC projects and activities', 'As reasonably assigned', 'ok', 'None assigned', 'Assigned by your lead'),
        $row('retreat', 'Quarterly day retreat', $retreat ? gmdate('j F', strtotime((string)$retreat['onDate'])) . ($retreat['place'] ? ' · ' . $retreat['place'] : '') : 'Date to be announced',
             !$retreat || $retreat['booked'] ? 'ok' : 'warn', !$retreat ? 'Not scheduled yet' : ($retreat['booked'] ? 'Booked' : 'Not booked'), 'Retreat booking',
             $retreat && !$retreat['booked'] ? ['label' => 'Book my place', 'route' => 'action:retreat.book', 'retreatId' => (string)$retreat['retreatId']] : null),
        $row('anthem', 'NGGC Anthem and Pledge', 'Known, upheld and modelled', trim((string)($m['anthemAt'] ?? '')) !== '' ? 'ok' : 'warn', trim((string)($m['anthemAt'] ?? '')) !== '' ? 'Confirmed' : 'Not yet confirmed', 'Confirmed by your lead'),
        $row('feedback', 'Feedback received professionally', 'Concerns raised through the proper channels', 'ok', 'Up to date', 'Noted by your lead'),
    ];
}
function mp_journal_unanswered(array $g, array $ids): array {
    $rows = array_values(array_filter(mp_shared_entries($ids, gmdate('Y-m-d', time() - 30 * 86400)), static fn($r) => !$r['replied']));
    $over = array_filter($rows, static fn($r) => mp_days(substr((string)$r['createdAt'], 0, 10), gmdate('Y-m-d')) >= 7);
    return ['n' => count($rows), 'over7' => count($over) > 0];
}
/** This week's commitments (This week › Your commitments this week). */
function mp_commitments_week(array $g, string $today): array {
    $mid = (string)($g['mentorId'] ?? '');
    $mon = gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') - ((int)gmdate('N', strtotime($today . 'T12:00:00Z')) - 1) * 86400);
    $done = static fn($k) => $mid !== '' && (bool)db_row("SELECT 1 FROM mentor_obligations WHERE mentorId = ? AND kind = ? AND status = 'present' AND onDate BETWEEN ? AND ?", [$mid, $k, $mon, gmdate('Y-m-d', strtotime($mon) + 6 * 86400)]);
    $cimcDone = trim((string)($g['mentorRow']['cimcAt'] ?? '')) !== '';
    $out = [['day' => 'Tuesday', 'time' => 'After school', 'label' => 'STS meeting', 'done' => $done('sts')],
            ['day' => 'Weekly', 'time' => '7:00–8:00pm', 'label' => 'Mentor Preparation Session', 'done' => $done('prep')]];
    if (!$cimcDone) $out[] = ['day' => 'Saturday', 'time' => '7:00am', 'label' => 'CIMC training', 'done' => $done('cimc')];
    $out[] = ['day' => 'Saturday', 'time' => '8:30am', 'label' => 'Musing & mentor breakout', 'done' => $done('saturday')];
    return $out;
}
/** view=role — My role. */
function member_mp_role(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $today = mp_today($p); $month = substr($today, 0, 7);
    $rows = mp_commitments($g, $month, $today);
    $mid = (string)($g['mentorId'] ?? '');
    $sup = $mid !== '' ? db_row("SELECT * FROM mentor_supervision WHERE mentorId = ? AND onDate >= ? ORDER BY onDate LIMIT 1", [$mid, $today]) : null;
    $lastSup = $mid !== '' ? db_row("SELECT * FROM mentor_supervision WHERE mentorId = ? AND onDate < ? ORDER BY onDate DESC LIMIT 1", [$mid, $today]) : null;
    $fb = $mid !== '' ? db_row("SELECT feedback, feedbackAt FROM mentor_supervision WHERE mentorId = ? AND feedback <> '' ORDER BY feedbackAt DESC LIMIT 1", [$mid]) : null;
    $pol = $mid !== '' ? db_row('SELECT acceptedAt, policyVersion FROM mentor_policy WHERE mentorId = ? ORDER BY id DESC LIMIT 1', [$mid]) : null;
    return ['ok' => true, 'me' => mp_me($g, mp_opts()), 'month' => $month, 'daysLeft' => mp_days($today, gmdate('Y-m-t', strtotime($today))),
        'commitments' => $rows, 'met' => count(array_filter($rows, static fn($r) => $r['status'] === 'ok')),
        'supervision' => $sup ? ['id' => (int)$sup['id'], 'date' => (string)$sup['onDate'], 'prep' => json_decode((string)$sup['prepJson'], true) ?: ['', '', '']] : null,
        'agreedLast' => $lastSup ? ['date' => (string)$lastSup['onDate'], 'items' => json_decode((string)$lastSup['agreedJson'], true) ?: []] : null,
        'feedback' => $fb ? ['text' => (string)$fb['feedback'], 'at' => (string)$fb['feedbackAt']] : null,
        'policy' => ['acceptedAt' => (string)($pol['acceptedAt'] ?? ''), 'version' => (string)($pol['policyVersion'] ?? ''),
                     'standard' => 'A mentor observes, models, guides, challenges, encourages, documents, collaborates and follows through.']];
}
/** supervisionPrep — the three answers, sent to the lead. */
function member_mp_supervision_prep(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $mid = (string)($g['mentorId'] ?? '');
    if ($mid === '') return ['ok' => false, 'error' => 'no_mentor_record'];
    $a = array_map(static fn($x) => mb_substr(trim((string)$x), 0, 1500), array_slice(array_values((array)($p['answers'] ?? [])), 0, 3));
    if (!array_filter($a)) return ['ok' => false, 'error' => 'answer_one'];
    $sup = db_row("SELECT * FROM mentor_supervision WHERE mentorId = ? AND onDate >= ? ORDER BY onDate LIMIT 1", [$mid, mp_today($p)]);
    if ($sup) db_update('mentor_supervision', ['prepJson' => json_encode($a)], ['id' => (int)$sup['id']]);
    else db_insert('mentor_supervision', ['mentorId' => $mid, 'leadId' => (string)($g['lead']['mentorId'] ?? ''), 'onDate' => mp_today($p), 'prepJson' => json_encode($a), 'agreedJson' => '', 'feedback' => '', 'feedbackAt' => '', 'status' => 'prep', 'createdAt' => now_iso()]);
    if ($g['lead']) mp_message_put('lead:' . $g['me'], 'Supervision prep', '', $g['me'], (string)($g['mentorRow']['fullName'] ?? ''), (string)($g['lead']['memberId'] ?? ''),
        implode("\n\n", array_map(static fn($q, $x) => $q . "\n" . ($x ?: '—'), ['What went well with a mentee since we last met?', 'Where are you stuck?', 'What do you need from me?'], $a)));
    return ['ok' => true, 'answered' => count(array_filter($a))];
}
/** supervisionBook — a lead books supervision with one of their mentors (Tuesday after STS). */
function member_mp_supervision_book(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if (!in_array($g['mpRole'], ['lead', 'coord'], true)) return ['ok' => false, 'error' => 'forbidden'];
    $t = db_row('SELECT * FROM mentors WHERE mentorId = ? AND status = \'active\'', [(string)($p['mentorId'] ?? '')]);
    if (!$t || !in_array((string)$t['mentorId'], array_column(mp_team_rows($g), 'mentorId'), true)) return ['ok' => false, 'error' => 'not_in_team'];
    $today = mp_today($p);
    $tue = gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') + ((2 - (int)gmdate('w', strtotime($today . 'T12:00:00Z')) + 7) % 7 ?: 7) * 86400);
    if (db_row("SELECT 1 FROM mentor_supervision WHERE mentorId = ? AND onDate = ?", [(string)$t['mentorId'], $tue])) return ['ok' => true, 'date' => $tue, 'already' => true];
    db_insert('mentor_supervision', ['mentorId' => (string)$t['mentorId'], 'leadId' => (string)($g['mentorId'] ?? ''), 'onDate' => $tue, 'prepJson' => '', 'agreedJson' => '', 'feedback' => '', 'feedbackAt' => '', 'status' => 'booked', 'createdAt' => now_iso()]);
    if (trim((string)$t['memberId']) !== '' && function_exists('push_notification')) push_notification((string)$t['memberId'], ['kind' => 'mentor', 'title' => 'Supervision booked', 'body' => 'Tuesday ' . gmdate('j F', strtotime($tue)) . ', after STS.', 'linkPage' => 'mentor']);
    return ['ok' => true, 'date' => $tue];
}
/** retreatBook — book my place at the next quarterly retreat. */
function member_mp_retreat_book(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    $mid = (string)($g['mentorId'] ?? '');
    if ($mid === '') return ['ok' => false, 'error' => 'no_mentor_record'];
    $r = db_row('SELECT * FROM mentor_retreats WHERE retreatId = ? AND onDate >= ?', [(string)($p['retreatId'] ?? ''), mp_today($p)]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    try { db_insert('mentor_retreat_bookings', ['retreatId' => (string)$r['retreatId'], 'mentorId' => $mid, 'createdAt' => now_iso()]); } catch (\Throwable $e) {}
    return ['ok' => true, 'date' => (string)$r['onDate']];
}

/* ── Mentors (lead / coord) ─────────────────────────────────────────────── */

function mp_team_rows(array $g): array {
    $mid = (string)($g['mentorId'] ?? '');
    if ($g['mpRole'] === 'coord') {
        $centres = $g['centres'] ?? null;
        if ($centres === null) return db_all("SELECT * FROM mentors WHERE status = 'active' AND programme IN ('ngg','both') ORDER BY fullName");
        if (!$centres) return [];
        return db_all("SELECT * FROM mentors WHERE status = 'active' AND programme IN ('ngg','both') AND centre IN (" . implode(',', array_fill(0, count($centres), '?')) . ') ORDER BY fullName', $centres);
    }
    return db_all("SELECT * FROM mentors WHERE status = 'active' AND mentorId <> ? AND (leadId = ? OR (COALESCE(leadId,'') = '' AND centre = ? AND mentors.rank <> 'lead')) ORDER BY fullName",
                  [$mid, $mid, (string)($g['mentorRow']['centre'] ?? '')]);
}
/** view=team — every mentor I lead: caseload, seen in two weeks, relationship average, commitments. */
function member_mp_team(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if (!in_array($g['mpRole'], ['lead', 'coord'], true)) return ['ok' => false, 'error' => 'forbidden'];
    $today = mp_today($p);
    $team = mp_team_rows($g);
    if (!$team) return ['ok' => true, 'mentors' => []];
    $mids = array_column($team, 'mentorId');
    $ph = implode(',', array_fill(0, count($mids), '?'));
    $kids = [];
    foreach (db_all("SELECT mentorId, memberId FROM mentor_assignments WHERE status = 'active' AND mentorId IN ($ph)", $mids) as $r) $kids[$r['mentorId']][] = $r['memberId'];
    $all = array_values(array_unique(array_merge([], ...array_values($kids ?: [[]]))));
    $seen = []; $rel = [];
    if ($all) {
        $kp = implode(',', array_fill(0, count($all), '?'));
        foreach (db_all("SELECT DISTINCT subjectId FROM mentor_meetings WHERE kind IN ('one-to-one','pod') AND metOn >= ? AND subjectId IN ($kp)", array_merge([gmdate('Y-m-d', strtotime($today) - 14 * 86400)], $all)) as $r) $seen[$r['subjectId']] = true;
        foreach (db_all("SELECT subjectId, score FROM mentor_rel_checks WHERE side = 'child' AND subjectId IN ($kp) ORDER BY createdAt", $all) as $r) $rel[$r['subjectId']] = (int)$r['score'];
    }
    $booked = [];
    foreach (db_all("SELECT mentorId FROM mentor_supervision WHERE onDate >= ? AND mentorId IN ($ph)", array_merge([$today], $mids)) as $r) $booked[$r['mentorId']] = true;
    $o = mp_opts(); $out = [];
    foreach ($team as $t) {
        $k = $kids[$t['mentorId']] ?? [];
        $s = count(array_filter($k, static fn($x) => isset($seen[$x])));
        $rs = array_values(array_filter(array_map(static fn($x) => $rel[$x] ?? null, $k), static fn($v) => $v !== null));
        $role = mp_role(['role' => 'mentor', 'rank' => (string)$t['rank']], $t);
        $train = function_exists('ms_clearance') ? ms_clearance($t) : ['cleared' => true];
        $commit = (count($k) < $o['minCaseload'] && $role !== 'peer') ? 'Below 5 mentees' : (empty($train['cleared']) ? 'Training due' : 'On track');
        $out[] = ['mentorId' => (string)$t['mentorId'], 'name' => (string)$t['fullName'], 'first' => mp_first((string)$t['fullName']), 'initials' => mp_initials((string)$t['fullName']),
                  'kind' => ['pod' => 'Pod mentor', 'peer' => 'Peer mentor', 'instructor' => 'Instructor mentor', 'lead' => 'Lead mentor', 'coord' => 'Coordinator'][$role] ?? 'Mentor',
                  'mentees' => count($k), 'seenPct' => $k ? (int)round(100 * $s / count($k)) : null, 'relAvg' => $rs ? round(array_sum($rs) / count($rs), 1) : null,
                  'commitments' => $commit, 'needSupport' => ($k && $s * 100 < 80 * count($k)) || $commit !== 'On track', 'booked' => isset($booked[$t['mentorId']])];
    }
    usort($out, static fn($a, $b) => [($a['seenPct'] ?? 101), $a['name']] <=> [($b['seenPct'] ?? 101), $b['name']]);
    return ['ok' => true, 'mentors' => $out];
}

/* ── Academy (the module player reads; the server scores) ──────────────── */

function member_mp_academy(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if (empty($g['mentorId'])) return ['ok' => false, 'error' => 'no_mentor_record'];
    $a = function_exists('ms_academy') ? ms_academy() : ['modules' => [], 'pass' => 80, 'groups' => []];
    $done = [];
    foreach (db_all('SELECT moduleId, score, passedAt FROM mentor_academy WHERE mentorId = ?', [(string)$g['mentorId']]) as $r) $done[$r['moduleId']] = $r;
    $mods = array_map(static function ($m) use ($done) {
        $d = $done[$m['id']] ?? null;
        $renew = (int)($m['renewDays'] ?? 0);
        $due = $d && $renew ? gmdate('Y-m-d', strtotime((string)$d['passedAt']) + $renew * 86400) : null;
        /* The answer key stays on the server, as in member.ms.academy: a key
         * sent to the browser to colour a choice is a key anyone can read, and
         * this quiz is part of what clears a mentor to work with children. */
        if (isset($m['quiz'])) $m['quiz'] = array_map(static fn($q) => ['q' => $q['q'], 'options' => $q['options']], (array)$m['quiz']);
        return $m + ['passedAt' => (string)($d['passedAt'] ?? ''), 'score' => $d ? (int)$d['score'] : null, 'renewBy' => $due];
    }, $a['modules']);
    $cl = function_exists('ms_clearance') && $g['mentorRow'] ? ms_clearance($g['mentorRow']) : [];
    return ['ok' => true, 'pass' => (int)$a['pass'], 'groups' => $a['groups'], 'modules' => $mods, 'byHand' => !empty($cl['academyByHand']), 'staff' => !empty($cl['staff'])];
}
/** academyResult — the server re-scores the answers and stores only a pass. */
function member_mp_academy_result(array $p): array {
    $g = mp_gate($p); if (empty($g['ok'])) return $g;
    if (empty($g['mentorId'])) return ['ok' => false, 'error' => 'no_mentor_record'];
    $mod = null; foreach ((function_exists('ms_academy') ? ms_academy()['modules'] : []) as $m) if ($m['id'] === (string)($p['moduleId'] ?? '')) $mod = $m;
    if (!$mod) return ['ok' => false, 'error' => 'not_found'];
    $ans = array_values((array)($p['answers'] ?? []));
    if (count($ans) !== count($mod['quiz'])) return ['ok' => false, 'error' => 'answer_all'];
    if (function_exists('ms_academy_attempt_gate') && ($stop = ms_academy_attempt_gate((string)$g['mentorId'], (string)$mod['id']))) return $stop;
    $right = 0; foreach ($mod['quiz'] as $i => $q) if ((int)$ans[$i] === (int)$q['answer']) $right++;
    $score = (int)round(100 * $right / max(1, count($mod['quiz'])));
    $pass = $score >= (int)(ms_academy()['pass'] ?? 80);
    if (function_exists('ms_academy_attempt_log')) ms_academy_attempt_log((string)$g['mentorId'], (string)$mod['id'], $score, $pass);
    if ($pass) db_upsert('mentor_academy', ['mentorId' => (string)$g['mentorId'], 'moduleId' => $mod['id'], 'score' => $score, 'passedAt' => now_iso()], ['mentorId', 'moduleId'], ['score' => $score, 'passedAt' => now_iso()]);
    return ['ok' => true, 'score' => $score, 'passed' => $pass];
}


/* ── The Summer School view of the portal ───────────────────────────────── */

/**
 * view=summer — the Summer School mentor's week: their participants (the
 * roster's own reach, so nobody new is let in), each one's last note, stars
 * today and this week's review, and what is due. Fixed number of reads.
 */
function member_mp_summer(array $p): array {
    $g = mentor_gate($p); if (empty($g['ok'])) return $g;
    $r = mentor_roster(['requesterId' => (string)$p['requesterId'], 'centre' => (string)($p['centre'] ?? ''), 'scope' => (string)($p['scope'] ?? '')]);
    if (empty($r['ok'])) return $r;
    $today = mp_today($p);
    $kids = array_values(array_filter($r['students'] ?? [], static fn($s) => ($s['kind'] ?? '') === 'student'));
    $ids = array_map(static fn($s) => (string)$s['studentId'], $kids);
    $period = iso_week_period(strtotime($today . 'T12:00:00Z'));
    $note = []; $rev = []; $here = []; $concern = [];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT subjectId, MAX(metOn) d FROM mentor_meetings WHERE concern = 0 AND subjectId IN ($ph) GROUP BY subjectId", $ids) as $x) $note[$x['subjectId']] = (string)$x['d'];
        foreach (db_all("SELECT subjectId, effort, characterLevel, wellbeing, line FROM mentor_reviews WHERE period = ? AND subjectId IN ($ph)", array_merge([$period], $ids)) as $x) $rev[$x['subjectId']] = $x;
        foreach (db_all("SELECT DISTINCT studentId FROM attendance WHERE date = ? AND studentId IN ($ph)", array_merge([$today], $ids)) as $x) $here[$x['studentId']] = true;
    }
    $rows = [];
    foreach ($kids as $k) {
        $id = (string)$k['studentId'];
        $days = isset($note[$id]) ? mp_days($note[$id], $today) : null;
        $rows[] = ['id' => $id, 'name' => (string)$k['fullName'], 'first' => mp_first((string)$k['fullName']), 'initials' => mp_initials((string)$k['fullName']),
            'group' => (string)($k['track'] ?? ''), 'photoUrl' => (string)($k['photoUrl'] ?? ''), 'starredToday' => (int)$k['starredToday'],
            'hereToday' => isset($here[$id]), 'lastNoteAt' => $note[$id] ?? null, 'noteDays' => $days, 'notSeen' => $days === null || $days > 7,
            'review' => $rev[$id] ?? null];
    }
    usort($rows, static fn($a, $b) => [$b['notSeen'], $a['review'] !== null, $a['name']] <=> [$a['notSeen'], $b['review'] !== null, $b['name']]);
    $open = count(array_filter($rows, static fn($x) => $x['review'] === null));
    $quiet = count(array_filter($rows, static fn($x) => $x['notSeen']));
    $due = [];
    if ($quiet) $due[] = ['key' => 'quiet', 'icon' => 'clock-countdown', 'tone' => 'warn', 'title' => $quiet . ' participant' . ($quiet === 1 ? '' : 's') . ' with no note this week', 'sub' => 'A short note after you talk keeps the picture honest', 'go' => ['screen' => 'participants', 'filter' => 'quiet']];
    if ($open) $due[] = ['key' => 'reviews', 'icon' => 'clipboard-text', 'tone' => 'neu', 'title' => $open . ' weekly review' . ($open === 1 ? '' : 's') . ' to do', 'sub' => 'This week · ' . $period, 'go' => ['screen' => 'reviews']];
    $ed = function_exists('summer_current_cohort') ? summer_current_cohort() : null;
    return ['ok' => true, 'today' => $today, 'period' => $period, 'participants' => $rows, 'due' => $due,
        'centre' => (string)($r['centre'] ?? ''), 'centres' => $r['centres'] ?? [], 'needsCentre' => !empty($r['needsCentre']), 'scope' => (string)($r['scope'] ?? ''),
        'mineCount' => (int)($r['mineCount'] ?? 0), 'edition' => $ed ? ['name' => (string)($ed['name'] ?? ''), 'startDate' => (string)($ed['startDate'] ?? ''), 'endDate' => (string)($ed['endDate'] ?? '')] : null,
        'categories' => $r['categories'] ?? [], 'levels' => MP_LEVELS,
        'me' => ['name' => (string)($g['mentor']['fullName'] ?? $g['member']['fullName'] ?? ''), 'memberId' => (string)$g['member']['memberId'], 'role' => (string)($g['role'] ?? 'mentor'),
                 'centre' => (string)($g['mentor']['centre'] ?? ''), 'officer' => (function () use ($r, $g) { $o = function_exists('sg_officer') ? sg_officer((string)($r['centre'] ?: ($g['mentor']['centre'] ?? ''))) : null; return $o ? ['name' => (string)$o['fullName']] : null; })()]];
}
/** summerReview — Effort / Character / Wellbeing and one line for a participant, this week. Amends in place. */
function member_mp_summer_review(array $p): array {
    $o = mentoring_open($p); if (empty($o['ok'])) return $o;
    if ($o['subject']['kind'] !== 'student') return ['ok' => false, 'error' => 'not_a_participant'];
    foreach (['effort', 'character', 'wellbeing'] as $k) if (!in_array((string)($p[$k] ?? ''), MP_LEVELS, true)) return ['ok' => false, 'error' => 'rate_all_three'];
    $period = iso_week_period();
    $sid = (string)$o['subject']['id']; $now = now_iso(); $me = (string)$o['g']['member']['memberId'];
    $line = mb_substr(trim((string)($p['line'] ?? '')), 0, 600);
    $have = db_row('SELECT * FROM mentor_reviews WHERE subjectId = ? AND period = ?', [$sid, $period]);
    $row = ['effort' => (string)$p['effort'], 'characterLevel' => (string)$p['character'], 'wellbeing' => (string)$p['wellbeing'], 'line' => $line,
            'answers' => mp_review_answers_merge($have, $line), 'answered' => 1, 'trend' => ['Low' => 'worse', 'Steady' => 'same'][(string)$p['effort']] ?? 'better',
            'mentorId' => $me, 'mentorName' => (string)($o['g']['mentor']['fullName'] ?? ''), 'centre' => (string)$o['subject']['centre'], 'updatedAt' => $now];
    if (!$have) $row['concern'] = 0;
    if ($have) db_update('mentor_reviews', $row, ['id' => (int)$have['id']]);
    else db_insert('mentor_reviews', $row + ['subjectId' => $sid, 'subjectType' => 'student', 'period' => $period, 'createdAt' => $now]);
    audit('mentor.summer.review', $me, $sid, ['period' => $period], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'period' => $period];
}
