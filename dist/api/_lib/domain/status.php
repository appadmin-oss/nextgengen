<?php
declare(strict_types=1);

/**
 * The status board — one screen answering "how is everything?" for the people
 * who run NGG: members, centres, mentors, instructors, centre leads and staff.
 *
 * ── WHAT EACH STATUS MEANS ───────────────────────────────────────────────────
 * Every status is derived, never stored, and from data the platform already
 * keeps — so it cannot go stale and there is nothing to maintain:
 *
 *   member      blocked (suspended/evicted), at risk (the companion's weekly
 *               rating, or warned/dormant under the conduct policy), owing
 *               (fees holders only), never or long since signed in
 *   centre      issues: no lead, no classes on the timetable, not mapped for
 *               the geofence, meets today but nobody has checked in, over
 *               capacity
 *   mentor /    active ≤ 14 days since their last recorded work, quiet ≤ 30,
 *   instructor  dormant beyond that or never — the same "last active" the
 *               Staff activity screen computes (admin_staff_performance), so
 *               the two screens cannot disagree about a person
 *   centre lead the centre's lead volunteer, lead mentors and Centre lead
 *               accounts — and a centre with none is itself the finding
 *   staff       active/quiet/dormant by last sign-in or last recorded action,
 *               with no-2FA and no-centre (a scoped role with no centre has
 *               no access) flagged
 *
 * ── WHO SEES WHAT ────────────────────────────────────────────────────────────
 * Each part needs the capability that owns its data: members and centres need
 * people or club, mentors/instructors/leads need people, staff needs rbac or
 * audit, money needs fees. A scoped admin sees their centres only — enforced
 * here, per row, not by trusting what the screen asked for.
 *
 * Every part is a handful of grouped queries for the whole roster; nothing
 * here queries per row (CLAUDE.md §6).
 */

const STATUS_ACTIVE_DAYS = 14;
const STATUS_QUIET_DAYS = 30;
const STATUS_DORMANT_LOGIN_DAYS = 60;
const STATUS_ATTENTION_MAX = 80;

/** active | quiet | dormant | never, from a last-activity date and today. */
function status_activity(string $last, string $today): array {
    if ($last === '') return ['state' => 'never', 'days' => null];
    $days = max(0, (int)floor((strtotime(substr($today, 0, 10)) - strtotime(substr($last, 0, 10))) / 86400));
    return ['state' => $days <= STATUS_ACTIVE_DAYS ? 'active' : ($days <= STATUS_QUIET_DAYS ? 'quiet' : 'dormant'), 'days' => $days];
}

function admin_status_board(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'club', 'rbac', 'audit']); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $caps = member_effective_caps($req);
    $has = static fn($c) => in_array($c, $caps, true);
    $scope = admin_centre_names_in_scope($req);
    $inScope = static fn($centre) => $scope === null || in_array((string)$centre, $scope, true);
    $today = attendance_today();
    $out = ['ok' => true, 'today' => $today, 'scoped' => $scope !== null, 'scopeNames' => $scope ?? [], 'parts' => []];

    if ($has('people') || $has('club')) {
        $out['members'] = status_members($inScope, $today, $has('fees'));
        $out['centres'] = status_centres($inScope, $today, $out['members']['_byCentre']);
        unset($out['members']['_byCentre']);
        $out['parts'][] = 'members'; $out['parts'][] = 'centres';
    }
    if ($has('people')) {
        $sp = admin_staff_performance($p + ['days' => 60]);
        $staff = !empty($sp['ok']) ? $sp['staff'] : [];
        $out['mentors'] = status_mentors($staff, $today);
        $out['instructors'] = status_instructors($staff, $today);
        $out['leads'] = status_leads($staff, $today, $inScope);
        array_push($out['parts'], 'mentors', 'instructors', 'leads');
    }
    if ($has('rbac') || $has('audit')) {
        $out['staff'] = status_staff($today);
        $out['parts'][] = 'staff';
    }
    return $out;
}

/** Members: counts, conduct, attendance today, the companion's rating, sign-in, money. */
function status_members(callable $inScope, string $today, bool $withFees): array {
    $rows = array_values(array_filter(
        db_all("SELECT memberId, fullName, centre, status, lastLoginAt, createdAt FROM members
                WHERE type = 'NGG' AND COALESCE(NULLIF(role,''),'member') = 'member' AND COALESCE(status,'') NOT IN ('merged','deleted')"),
        static fn($m) => $inScope($m['centre'])));
    $byStatus = [];
    foreach ($rows as $m) { $k = (string)($m['status'] ?: 'active'); $byStatus[$k] = ($byStatus[$k] ?? 0) + 1; }
    $active = array_values(array_filter($rows, static fn($m) => in_array((string)($m['status'] ?: 'active'), ['active'], true)));
    $ids = array_column($active, 'memberId');

    $conduct = function_exists('policy_states_for') ? policy_states_for($ids, 'member') : [];
    $cCount = ['clear' => 0, 'warned' => 0, 'dormant' => 0, 'suspended' => 0, 'evicted' => 0];
    $finesOwed = 0;
    foreach ($conduct as $st) { $cCount[$st['state']] = ($cCount[$st['state']] ?? 0) + 1; $finesOwed += (int)$st['finesOwed']; }

    $att = [];
    foreach (db_all('SELECT studentId, status FROM attendance WHERE date = ?', [$today]) as $a) $att[(string)$a['studentId']] = (string)$a['status'];
    $period = function_exists('companion_period') ? companion_period($today) : '';
    $rating = [];
    if ($period !== '') foreach (db_all('SELECT memberId, rating FROM member_assessments WHERE period = ?', [$period]) as $r) $rating[(string)$r['memberId']] = (string)$r['rating'];

    $owing = [];
    if ($withFees) {
        // Real money only: the training place is never owed (fees_balance's payable).
        foreach (db_all("SELECT memberId, SUM(CASE WHEN kind IN ('training','writeoff') THEN 0 WHEN direction = 'charge' THEN amount ELSE -amount END) net FROM member_ledger
                         WHERE COALESCE(voidedAt,'') = '' GROUP BY memberId") as $r) if ((int)$r['net'] > 0) $owing[(string)$r['memberId']] = (int)$r['net'];
    }

    $since30 = gmdate('Y-m-d', strtotime($today) - 30 * 86400);
    $loginCut = gmdate('Y-m-d', strtotime($today) - STATUS_DORMANT_LOGIN_DAYS * 86400);
    $tally = ['active' => count($active), 'presentToday' => 0, 'lateToday' => 0, 'newThisMonth' => 0, 'neverSignedIn' => 0, 'notSignedIn60' => 0,
              'onTrack' => 0, 'watch' => 0, 'atRisk' => 0, 'unrated' => 0, 'owing' => 0, 'owingTotal' => 0];
    $byCentre = []; $attention = [];
    foreach ($active as $m) {
        $id = (string)$m['memberId']; $c = (string)$m['centre'];
        $byCentre[$c] = $byCentre[$c] ?? ['members' => 0, 'present' => 0, 'late' => 0, 'atRisk' => 0];
        $byCentre[$c]['members']++;
        if (isset($att[$id])) { $tally['presentToday']++; $byCentre[$c]['present']++; if ($att[$id] === 'late' || $att[$id] === 'tardy') { $tally['lateToday']++; $byCentre[$c]['late']++; } }
        if (substr((string)$m['createdAt'], 0, 10) >= $since30) $tally['newThisMonth']++;
        $last = substr((string)($m['lastLoginAt'] ?? ''), 0, 10);
        if ($last === '') $tally['neverSignedIn']++; elseif ($last < $loginCut) $tally['notSignedIn60']++;
        $r = $rating[$id] ?? '';
        if ($r === 'on_track') $tally['onTrack']++; elseif ($r === 'watch') $tally['watch']++; elseif ($r === 'at_risk') { $tally['atRisk']++; $byCentre[$c]['atRisk']++; } else $tally['unrated']++;
        if (isset($owing[$id])) { $tally['owing']++; $tally['owingTotal'] += $owing[$id]; }

        // Why this member needs somebody's attention, worst first.
        $why = []; $sev = 0;
        $st = $conduct[$id]['state'] ?? 'clear';
        if ($st === 'evicted' || $st === 'suspended') { $why[] = $st; $sev = max($sev, 4); }
        if ($r === 'at_risk') { $why[] = 'at risk (companion)'; $sev = max($sev, 3); }
        if ($st === 'warned' || $st === 'dormant') { $why[] = $st === 'warned' ? 'conduct warning' : 'absence limit reached'; $sev = max($sev, 2); }
        if ($r === 'watch') { $why[] = 'watch (companion)'; $sev = max($sev, 1); }
        if (isset($owing[$id]) && $owing[$id] >= 10000) { $why[] = 'owes ₦' . number_format($owing[$id]); $sev = max($sev, 1); }
        if ($why) $attention[] = ['memberId' => $id, 'fullName' => (string)$m['fullName'], 'centre' => $c, 'reasons' => $why, 'severity' => $sev,
                                  'lastSignIn' => $last];
    }
    usort($attention, static fn($a, $b) => ($b['severity'] <=> $a['severity']) ?: strcmp($a['fullName'], $b['fullName']));
    return ['byStatus' => $byStatus, 'tally' => $tally, 'conduct' => $cCount, 'finesOwed' => $finesOwed, 'withFees' => $withFees,
            'attention' => array_slice($attention, 0, STATUS_ATTENTION_MAX), 'attentionTotal' => count($attention), 'period' => $period, '_byCentre' => $byCentre];
}

/** Centres: what each one has, and what it is missing. */
function status_centres(callable $inScope, string $today, array $byCentre): array {
    $centres = array_values(array_filter(db_all("SELECT centreId, name, code, status, capacity, lat, lng, meetDays, meetTime, leadVolunteerId, programmes, pageStatus, online FROM centres WHERE status = 'active' ORDER BY name"),
        static fn($c) => $inScope($c['name'])));
    $classes = [];
    foreach (db_all("SELECT centreId, COUNT(*) c FROM timetable_slots WHERE status = 'active' GROUP BY centreId") as $r) $classes[(string)$r['centreId']] = (int)$r['c'];
    $vol = [];
    foreach (db_all('SELECT volunteerId, fullName FROM volunteers') as $v) $vol[(string)$v['volunteerId']] = (string)$v['fullName'];
    // Centre lead ACCOUNTS: staff with the centre_lead role scoped to the centre.
    $leadAccounts = [];
    foreach (db_all("SELECT fullName, centreScope FROM members WHERE role = 'centre_lead' AND COALESCE(status,'') NOT IN ('suspended','deleted','merged')") as $m) {
        foreach ((array)(safe_json((string)$m['centreScope']) ?: []) as $cid) $leadAccounts[(string)$cid][] = (string)$m['fullName'];
    }
    $dow = (int)gmdate('N', strtotime($today));
    $rows = []; $issueCount = 0;
    foreach ($centres as $c) {
        $cid = (string)$c['centreId']; $n = (string)$c['name'];
        $b = $byCentre[$n] ?? ['members' => 0, 'present' => 0, 'late' => 0, 'atRisk' => 0];
        $meetDays = function_exists('centre_meet_weekdays') ? centre_meet_weekdays((string)$c['meetDays']) : [];
        $meetsToday = in_array($dow, $meetDays, true);
        $ngg = !function_exists('centre_serves') || centre_serves($c, 'ngg');
        $lead = $vol[(string)$c['leadVolunteerId']] ?? '';
        $issues = [];
        if ($lead === '' && empty($leadAccounts[$cid])) $issues[] = 'no lead';
        /* NGG Online has no building: no map pin, no meeting days, no gate, no capacity — none of those is an
           issue there. A lead and its classes still are. */
        $isOnline = !empty($c['online']);
        if ($ngg && empty($classes[$cid])) $issues[] = 'no classes on the timetable';
        if (!$isOnline && ($c['lat'] === null || $c['lat'] === '')) $issues[] = 'not mapped';
        if (!$isOnline && $ngg && $meetsToday && $b['members'] > 0 && $b['present'] === 0) $issues[] = 'meets today, nobody checked in';
        if (!$isOnline && (int)$c['capacity'] > 0 && $b['members'] > (int)$c['capacity']) $issues[] = 'over capacity';
        if (!$isOnline && !$meetDays) $issues[] = 'meeting days not set';
        if ($issues) $issueCount++;
        $rows[] = ['centreId' => $cid, 'name' => $n, 'code' => (string)$c['code'], 'members' => $b['members'], 'presentToday' => $b['present'],
                   'lateToday' => $b['late'], 'atRisk' => $b['atRisk'], 'classes' => $classes[$cid] ?? 0, 'lead' => $lead,
                   'leadAccounts' => $leadAccounts[$cid] ?? [], 'meetsToday' => $meetsToday, 'meetDays' => (string)$c['meetDays'],
                   'capacity' => (int)$c['capacity'], 'programmes' => function_exists('centre_programmes') ? centre_programmes($c) : ['ngg', 'summer'],
                   'issues' => $issues, 'state' => $issues ? 'attention' : 'ok'];
    }
    return ['rows' => $rows, 'withIssues' => $issueCount, 'total' => count($rows)];
}

function status_mentors(array $staff, string $today): array {
    $rows = []; $t = ['active' => 0, 'quiet' => 0, 'dormant' => 0, 'never' => 0];
    $mentees = [];
    foreach (db_all("SELECT mentorId, COUNT(*) c FROM mentor_assignments WHERE status = 'active' GROUP BY mentorId") as $r) $mentees[(string)$r['mentorId']] = (int)$r['c'];
    foreach ($staff as $s) {
        if (strpos((string)$s['kind'], 'mentor') === false) continue;
        $a = status_activity((string)$s['lastActive'], $today);
        $t[$a['state']]++;
        $rows[] = ['id' => (string)$s['staffId'], 'fullName' => (string)$s['fullName'], 'kind' => (string)$s['kind'], 'centre' => (string)$s['centre'],
                   'focus' => (string)$s['focus'], 'mentees' => $mentees[(string)$s['staffId']] ?? 0, 'lastActive' => (string)$s['lastActive'],
                   'days' => $a['days'], 'state' => $a['state'], 'stars' => (int)$s['stars'], 'remarks' => (int)$s['remarks']];
    }
    return ['rows' => $rows, 'tally' => $t];
}

function status_instructors(array $staff, string $today): array {
    $classes = [];
    foreach (db_all("SELECT instructorId, COUNT(*) c FROM timetable_slots WHERE status = 'active' AND instructorId <> '' GROUP BY instructorId") as $r) $classes[(string)$r['instructorId']] = (int)$r['c'];
    $pending = [];
    foreach (db_all("SELECT submittedBy, COUNT(*) c FROM curriculum_materials WHERE status = 'pending' AND submittedBy <> '' GROUP BY submittedBy") as $r) $pending[(string)$r['submittedBy']] = (int)$r['c'];
    $rows = []; $t = ['active' => 0, 'quiet' => 0, 'dormant' => 0, 'never' => 0];
    foreach ($staff as $s) {
        if ((string)$s['kind'] !== 'instructor') continue;
        $a = status_activity((string)$s['lastActive'], $today);
        $t[$a['state']]++;
        $id = (string)$s['staffId'];
        $rows[] = ['id' => $id, 'fullName' => (string)$s['fullName'], 'centre' => (string)$s['centre'], 'courses' => (string)$s['focus'],
                   'classes' => $classes[$id] ?? 0, 'sessions' => (int)$s['sessions'], 'pendingMaterials' => $pending[$id] ?? 0,
                   'lastActive' => (string)$s['lastActive'], 'days' => $a['days'], 'state' => $a['state']];
    }
    return ['rows' => $rows, 'tally' => $t];
}

/** Centre leads: per centre, who leads it and whether they are active — and
 *  the centres nobody leads. */
function status_leads(array $staff, string $today, callable $inScope): array {
    $byStaffId = []; foreach ($staff as $s) $byStaffId[(string)$s['staffId']] = $s;
    $rows = [];
    $centres = array_values(array_filter(db_all("SELECT centreId, name, leadVolunteerId FROM centres WHERE status = 'active' ORDER BY name"), static fn($c) => $inScope($c['name'])));
    $vol = []; foreach (db_all('SELECT volunteerId, fullName FROM volunteers') as $v) $vol[(string)$v['volunteerId']] = (string)$v['fullName'];
    $accounts = [];
    foreach (db_all("SELECT memberId, fullName, centreScope, lastLoginAt FROM members WHERE role = 'centre_lead' AND COALESCE(status,'') NOT IN ('suspended','deleted','merged')") as $m) {
        foreach ((array)(safe_json((string)$m['centreScope']) ?: []) as $cid) $accounts[(string)$cid][] = $m;
    }
    $lastAction = [];
    $ids = []; foreach ($accounts as $list) foreach ($list as $m) $ids[] = (string)$m['memberId'];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT actorId, MAX(at) at FROM audit_log WHERE actorId IN ($ph) GROUP BY actorId", $ids) as $r) $lastAction[(string)$r['actorId']] = (string)$r['at'];
    }
    $unled = 0;
    foreach ($centres as $c) {
        $cid = (string)$c['centreId']; $people = [];
        $lv = (string)$c['leadVolunteerId'];
        if ($lv !== '') {
            $last = (string)($byStaffId[$lv]['lastActive'] ?? '');
            $people[] = ['name' => $vol[$lv] ?? $lv, 'kind' => 'Lead volunteer'] + status_activity($last, $today) + ['lastActive' => $last];
        }
        foreach ($staff as $s) if ((string)$s['kind'] === 'lead mentor' && (string)$s['centre'] === (string)$c['name']) {
            $people[] = ['name' => (string)$s['fullName'], 'kind' => 'Lead mentor'] + status_activity((string)$s['lastActive'], $today) + ['lastActive' => (string)$s['lastActive']];
        }
        foreach ($accounts[$cid] ?? [] as $m) {
            $last = max(substr((string)($m['lastLoginAt'] ?? ''), 0, 10), substr($lastAction[(string)$m['memberId']] ?? '', 0, 10));
            $people[] = ['name' => (string)$m['fullName'], 'kind' => 'Centre lead account'] + status_activity($last, $today) + ['lastActive' => $last];
        }
        if (!$people) $unled++;
        $rows[] = ['centreId' => $cid, 'centre' => (string)$c['name'], 'leads' => $people,
                   'state' => !$people ? 'unled' : (array_filter($people, static fn($x) => $x['state'] === 'active') ? 'active' : 'quiet')];
    }
    return ['rows' => $rows, 'unled' => $unled];
}

/** Staff accounts: role, 2FA, last sign-in and action, pending approvals, scope. */
function status_staff(string $today): array {
    $roles = staff_role_names();
    $ph = implode(',', array_fill(0, count($roles), '?'));
    $rows = db_all("SELECT memberId, fullName, role, totpSecret, lastLoginAt, centreScope, capsExtra, status FROM members WHERE role IN ($ph) ORDER BY fullName", $roles);
    $ids = array_column($rows, 'memberId');
    $lastAction = []; $pending = [];
    if ($ids) {
        $ph2 = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT actorId, MAX(at) at FROM audit_log WHERE actorId IN ($ph2) GROUP BY actorId", $ids) as $r) $lastAction[(string)$r['actorId']] = (string)$r['at'];
        foreach (db_all("SELECT requesterId, COUNT(*) c FROM admin_approvals WHERE status = 'pending' AND requesterId IN ($ph2) GROUP BY requesterId", $ids) as $r) $pending[(string)$r['requesterId']] = (int)$r['c'];
    }
    $names = []; foreach (db_all('SELECT centreId, name FROM centres') as $c) $names[(string)$c['centreId']] = (string)$c['name'];
    $out = []; $t = ['active' => 0, 'quiet' => 0, 'dormant' => 0, 'never' => 0, 'no2fa' => 0, 'noCentre' => 0];
    foreach ($rows as $m) {
        $id = (string)$m['memberId'];
        $last = max(substr((string)($m['lastLoginAt'] ?? ''), 0, 10), substr($lastAction[$id] ?? '', 0, 10));
        $a = status_activity($last, $today);
        $scope = array_values(array_filter(array_map('strval', (array)(safe_json((string)$m['centreScope']) ?: []))));
        $flags = [];
        if ((string)$m['totpSecret'] === '') { $flags[] = 'no 2FA'; $t['no2fa']++; }
        if (admin_role_scoped((string)$m['role']) && !$scope) { $flags[] = 'no centre — no access'; $t['noCentre']++; }
        if (in_array((string)$m['status'], ['suspended', 'inactive'], true)) $flags[] = (string)$m['status'];
        $t[$a['state']]++;
        $out[] = ['memberId' => $id, 'fullName' => (string)$m['fullName'], 'role' => (string)$m['role'], 'roleLabel' => admin_role_label((string)$m['role']),
                  'twoFactor' => (string)$m['totpSecret'] !== '', 'lastSignIn' => substr((string)($m['lastLoginAt'] ?? ''), 0, 10),
                  'lastAction' => substr($lastAction[$id] ?? '', 0, 10), 'days' => $a['days'], 'state' => $a['state'],
                  'pendingApprovals' => $pending[$id] ?? 0, 'centres' => array_map(static fn($cid) => $names[$cid] ?? $cid, $scope),
                  'extraCaps' => array_values(array_filter((array)(safe_json((string)$m['capsExtra']) ?: []), 'is_string')), 'flags' => $flags];
    }
    return ['rows' => $out, 'tally' => $t];
}
