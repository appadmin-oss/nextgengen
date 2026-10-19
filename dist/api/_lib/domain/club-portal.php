<?php
/**
 * Club portal v3 — the staff back office of the NGG Club (/club-admin).
 *
 * The screens are the design handoff's (docs/design/portals/club-portal-v3.dc.html);
 * this file is what stands behind them. Nothing here is sample data: every
 * row is a member, a volunteer, a desk or a ledger line that exists.
 *
 * Rules that hold across every op:
 *   · The gate is `club`. A scoped account (a centre lead) is held to its own
 *     centres on the way IN, per row — the lock on the screen is not the
 *     boundary. Everybody else covers every NGG centre.
 *   · Only NGG centres. Summer School venues, their leads and their
 *     participants are another programme and never appear here.
 *   · A decision runs the EXISTING op through backend_dispatch, so that op's
 *     own capability, scope and approval queue still apply. This file adds no
 *     second way to accept an application or pair a mentor.
 */

const CP_CLAUSES = [
    ['k' => 'participation', 'n' => 1, 'short' => 'Taking part', 'title' => 'Participation in the programme', 'req' => true, 'means' => 'Can attend classes, workshops and mentoring.'],
    ['k' => 'medical', 'n' => 2, 'short' => 'Medical', 'title' => 'Emergency medical treatment', 'req' => true, 'means' => 'Staff can get emergency treatment if a guardian can’t be reached.'],
    ['k' => 'data', 'n' => 3, 'short' => 'Data', 'title' => 'Processing of personal data', 'req' => true, 'means' => 'Records can be kept for attendance, safeguarding and reports. Nigeria Data Protection Act 2023.'],
    ['k' => 'media', 'n' => 4, 'short' => 'Photos', 'title' => 'Photography, film and recording', 'must' => true, 'means' => 'Can be photographed or filmed for internal records, reports and print.'],
    ['k' => 'site_visibility', 'n' => 5, 'short' => 'Named publicly', 'title' => 'Being named or pictured publicly', 'must' => true, 'means' => 'Name and photo can appear on the website and social media. A photo is published only with this AND Photos.'],
    ['k' => 'trips', 'n' => 6, 'short' => 'Trips', 'title' => 'Off-site activities and transport', 'means' => 'Can go on excursions, competitions and away tournaments.'],
    ['k' => 'comms', 'n' => 7, 'short' => 'Updates', 'title' => 'Programme updates', 'means' => 'Guardian gets newsletters and programme news.'],
];
const CP_CONSENT_METHODS = ['Paper form', 'Parent portal', 'By phone', 'In person', 'Email/SMS reply'];
const CP_SECTIONS = ['applications', 'approvals', 'requests', 'families', 'idcards', 'mentorship', 'behaviour', 'conduct',
                     'curriculum', 'desks', 'rota', 'volunteers', 'staffact'];
const CP_ROWS_MAX = 500;
/** Staff accounts live in `members` too; they are not Club members. */
const CP_STAFF_ROLES_SQL = "('super_admin','admin','club_admin','summer_admin','centre_lead','editor','audit')";
const CP_ANN_EMAIL_MAX = 400;
const CP_ANN_SMS_MAX = 400;
const CP_ANN_TG_MAX = 400;
/* An announcement's SMS is at most two texts (306 characters, "NGG: " and
 * all). Longer, it needs a short SMS version — written, or AI-shortened and
 * checked for lost facts — or the SMS is dropped and it goes by email and
 * Telegram instead, which carry the whole message. Never truncated. */
const CP_ANN_SMS_CHARS = 306;
const CP_ANN_CHANNELS = ['app', 'email', 'telegram', 'sms'];
const CP_ROTA_WEEKS = 4;

/* ── Context ─────────────────────────────────────────────────────────────── */

/** The gate, the requester, and the NGG centres this person covers. */
function cp_ctx(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $scope = admin_centre_names_in_scope($req);
    $rows = function_exists('centres_for_programme')
        ? centres_for_programme('ngg', 'centreId, name, slug, code, meetDays, meetTime, leadVolunteerId, capacity, status')
        : db_all("SELECT centreId, name, slug, code, meetDays, meetTime, leadVolunteerId, capacity, status FROM centres WHERE status = 'active' ORDER BY name");
    if ($scope !== null) $rows = array_values(array_filter($rows, static fn($c) => in_array((string)$c['name'], $scope, true)));
    $names = array_map(static fn($c) => (string)$c['name'], $rows);
    return ['ok' => true, 'g' => $g, 'req' => $req, 'me' => (string)$req['memberId'], 'scoped' => $scope !== null,
            'centres' => $rows, 'names' => $names];
}
/** "centre IN (…)" over the covered NGG centres; matches nothing when none. */
function cp_in(array $ctx, string $col = 'centre'): array {
    if (!$ctx['names']) return ['1 = 0', []];
    return [$col . ' IN (' . implode(',', array_fill(0, count($ctx['names']), '?')) . ')', $ctx['names']];
}
function cp_covers(array $ctx, ?string $centre): bool { return in_array((string)$centre, $ctx['names'], true); }

function cp_ago(?string $iso): string {
    $iso = (string)$iso; if ($iso === '') return '—';
    $t = strtotime($iso); if (!$t) return '—';
    $d = (int)floor((strtotime(gmdate('Y-m-d')) - strtotime(gmdate('Y-m-d', $t))) / 86400);
    if ($d <= 0) { $h = (int)floor((time() - $t) / 3600); return $h < 1 ? 'Just now' : $h . ' hour' . ($h === 1 ? '' : 's') . ' ago'; }
    if ($d === 1) return 'Yesterday';
    if ($d < 7) return $d . ' days ago';
    if ($d < 28) { $w = intdiv($d, 7); return $w . ' week' . ($w === 1 ? '' : 's') . ' ago'; }
    return gmdate('j M Y', $t);
}
function cp_days_since(?string $iso): ?int { $t = strtotime((string)$iso); return $t ? (int)floor((time() - $t) / 86400) : null; }
function cp_last(?string $iso): string {
    $d = cp_days_since($iso); if ($d === null) return 'Never';
    return $d === 0 ? 'Today' : ($d === 1 ? 'Yesterday' : ($d < 7 ? $d . ' days ago' : gmdate('j M', strtotime((string)$iso))));
}
function cp_first(string $name): string { return explode(' ', trim($name))[0] ?? $name; }

/** A division's key in the design's colour table. */
function cp_div_key(string $course): string {
    if (strcasecmp($course, 'Chess') === 0) return 'chess';
    $div = function_exists('club_division_of') ? club_division_of($course) : '';
    $short = $div !== '' && function_exists('club_division_short') ? strtoupper(club_division_short($div)) : '';
    if (str_contains($short, 'TECH')) return 'tech';
    if (str_contains($short, 'MEDIA')) return 'media';
    if (str_contains($short, 'BUS')) return 'biz';
    if (str_contains($short, 'ART') || str_contains($short, 'CREAT')) return 'arts';
    return 'chess';
}

/** A centre in the shape the screens use: meeting days, hours, rooms, lead. */
function cp_centre_shape(array $c, array $roomsBy, array $leadBy): array {
    $days = function_exists('centre_meet_weekdays') ? centre_meet_weekdays((string)$c['meetDays']) : [];
    $win = function_exists('tt_centre_window') ? tt_centre_window((string)$c['meetTime']) : null;
    $id = (string)$c['centreId'];
    $rooms = $roomsBy[$id] ?? [];
    if (!$rooms) $rooms = ['Main hall'];
    return ['id' => $id, 'name' => (string)$c['name'], 'slug' => (string)($c['slug'] ?: centre_slugify((string)$c['name'])),
            'days' => $days ?: [6], 'daysSet' => (bool)$days,
            'open' => $win ? tt_hhmm($win[0]) : '09:00', 'close' => $win ? tt_hhmm($win[1]) : '14:00', 'hoursSet' => (bool)$win,
            'rooms' => array_values($rooms), 'lead' => $leadBy[$id]['name'] ?? '', 'leadTone' => $leadBy[$id]['tone'] ?? 'bad',
            'leadState' => $leadBy[$id]['state'] ?? 'No lead'];
}

/** Each NGG centre's lead: its lead volunteer, else its centre-lead account. */
function cp_leads(array $centres): array {
    $out = [];
    $acc = [];
    foreach (db_all("SELECT memberId, fullName, centreScope, lastLoginAt FROM members WHERE role = 'centre_lead' AND COALESCE(status,'') NOT IN ('suspended','deleted','merged')") as $m)
        foreach ((array)(safe_json((string)$m['centreScope']) ?: []) as $cid) $acc[(string)$cid][] = $m;
    $vids = array_values(array_filter(array_map(static fn($c) => (string)($c['leadVolunteerId'] ?? ''), $centres)));
    $vols = [];
    if ($vids) foreach (db_all('SELECT volunteerId, fullName, safeguarding, memberId FROM volunteers WHERE volunteerId IN (' . implode(',', array_fill(0, count($vids), '?')) . ')', $vids) as $v) $vols[(string)$v['volunteerId']] = $v;
    foreach ($centres as $c) {
        $cid = (string)$c['centreId'];
        $v = $vols[(string)($c['leadVolunteerId'] ?? '')] ?? null;
        $a = $acc[$cid][0] ?? null;
        $last = $a ? (string)$a['lastLoginAt'] : '';
        if (!$a && $v && (string)$v['memberId'] !== '') $last = (string)(db_row('SELECT lastLoginAt FROM members WHERE memberId = ?', [$v['memberId']])['lastLoginAt'] ?? '');
        $name = $v ? (string)$v['fullName'] : ($a ? (string)$a['fullName'] : '');
        $quiet = cp_days_since($last);
        if ($name === '') { $tone = 'bad'; $state = 'No lead'; }
        elseif ($v && (string)$v['safeguarding'] !== 'cleared') { $tone = 'bad'; $state = 'Not cleared'; }
        elseif ($quiet === null) { $tone = 'warn'; $state = 'Never signed in'; }
        elseif ($quiet > 10) { $tone = 'warn'; $state = 'Quiet since ' . gmdate('j M', strtotime($last)); }
        else { $tone = 'ok'; $state = 'Active'; }
        $out[$cid] = ['name' => $name, 'tone' => $tone, 'state' => $state, 'last' => $last];
    }
    return $out;
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

/** admin.clubp.boot — who is signed in, the centres, the courses, the rules of the screens. */
function admin_clubp_boot(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $req = $x['req'];
    $caps = member_effective_caps($req);
    $role = strtolower((string)$req['role']);
    $roomsBy = [];
    foreach (db_all("SELECT centreId, room FROM timetable_slots WHERE status = 'active' AND COALESCE(room,'') <> '' GROUP BY centreId, room ORDER BY room") as $r)
        $roomsBy[(string)$r['centreId']][] = (string)$r['room'];
    $leads = cp_leads($x['centres']);
    $centres = array_map(static fn($c) => cp_centre_shape($c, $roomsBy, $leads), $x['centres']);
    $courses = [['Chess', 'chess']];
    if (function_exists('club_courses')) foreach (club_courses() as $c) if (strcasecmp($c, 'Chess') !== 0) $courses[] = [$c, cp_div_key($c)];
    $instructors = [];
    foreach (db_all("SELECT volunteerId, fullName, safeguarding FROM volunteers WHERE role = 'instructor' AND status = 'active' AND COALESCE(programme,'') <> 'summer' ORDER BY fullName") as $v)
        $instructors[] = ['id' => (string)$v['volunteerId'], 'name' => (string)$v['fullName'], 'cleared' => (string)$v['safeguarding'] === 'cleared'];
    $isAdm = in_array($role, ['admin', 'super_admin'], true);
    $can = [
        ['Members', 'Roster, promotion, permissions, applications, approvals, requests, families, ID cards'],
        ['Care', 'Companion check-ins, mentorship, behaviour, conduct rules'],
        ['Programme', 'Timetable' . (in_array('curriculum', $caps, true) ? ', curriculum' : '') . ', tournaments'],
        ['Gate', in_array('checkin', $caps, true) ? 'Check-in desks and duty rota' : 'See check-in desks and the duty rota'],
        ['Team & centres', 'See mentors, instructors, centre leads, volunteers, admins and staff activity'],
    ];
    $cannot = [];
    if (!in_array('fees', $caps, true)) $cannot[] = ['Dues & fees', 'an admin who holds fees'];
    if (!in_array('summer', $caps, true)) $cannot[] = ['Summer School', 'a Summer coordinator'];
    if (!in_array('content', $caps, true)) $cannot[] = ['Posts and events', 'an editor'];
    if (!in_array('inbox', $caps, true)) $cannot[] = ['Inbox and messages', 'an admin'];
    if (!in_array('rbac', $caps, true)) $cannot[] = ['Access levels and invites', 'a super admin'];
    if (!in_array('settings', $caps, true)) $cannot[] = ['Audit log and site settings', 'a super admin'];
    if ($x['scoped']) $cannot[] = ['Other centres', 'a club coordinator'];
    return ['ok' => true, 'today' => gmdate('Y-m-d'),
        'me' => ['id' => $x['me'], 'name' => (string)$req['fullName'], 'role' => $role, 'roleLabel' => admin_role_label($role),
                 'caps' => $caps, 'scoped' => $x['scoped'], 'centres' => $x['names'], 'isAdmin' => $isAdm,
                 'canControl' => $isAdm || in_array('rbac', $caps, true), 'canSummer' => in_array('summer', $caps, true),
                 'canCurriculum' => in_array('curriculum', $caps, true), 'canCheckin' => in_array('checkin', $caps, true),
                 'canPeople' => in_array('people', $caps, true), 'canAudit' => in_array('audit', $caps, true) || in_array('rbac', $caps, true)],
        'access' => ['caps' => implode(' · ', array_map(static fn($c) => $c === 'checkin' ? 'check-in' : $c, $caps)), 'can' => $can, 'cannot' => $cannot],
        'centres' => $centres, 'courses' => $courses, 'instructors' => $instructors,
        'clauses' => CP_CLAUSES, 'methods' => CP_CONSENT_METHODS, 'sections' => CP_SECTIONS];
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

/** The latest consent answer per (member, type) for many members, one query. */
function cp_consents_for(array $ids): array {
    $out = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT c.studentId, c.type, c.status, c.method, c.actorName, c.createdAt FROM consents c
                          JOIN (SELECT studentId, type, MAX(id) mid FROM consents WHERE studentId IN ($ph) GROUP BY studentId, type) l ON l.mid = c.id", $chunk) as $r)
            $out[(string)$r['studentId']][(string)$r['type']] = ['v' => (string)$r['status'] === 'granted' ? 'g' : 'd',
                'method' => (string)$r['method'], 'by' => (string)$r['actorName'], 'at' => substr((string)$r['createdAt'], 0, 10)];
    }
    return $out;
}
function cp_required_missing(array $c): array {
    $miss = [];
    foreach (CP_CLAUSES as $k) if (!empty($k['req']) && (($c[$k['k']]['v'] ?? '') !== 'g')) $miss[] = $k['k'];
    return $miss;
}

/** The next meeting date (today or later) for each weekday set. */
function cp_next_dates(array $days, int $n, ?string $from = null): array {
    $out = []; $t = strtotime($from ?? gmdate('Y-m-d'));
    for ($i = 0; $i < 7 * ($n + 1) && count($out) < $n; $i++) {
        $d = $t + $i * 86400;
        if (in_array((int)gmdate('N', $d), $days, true)) $out[] = gmdate('Y-m-d', $d);
    }
    return $out;
}

/** Everything the dashboard counts, computed once (also the brief's facts). */
function cp_dashboard_data(array $x): array {
    [$inSql, $inArgs] = cp_in($x, 'centre');
    // Members by status, per centre.
    $byStatus = ['active' => 0, 'inactive' => 0, 'graduated' => 0]; $activeBy = [];
    foreach (db_all("SELECT centre, status, COUNT(*) c FROM members WHERE type = 'NGG' AND COALESCE(role,'') NOT IN " . CP_STAFF_ROLES_SQL . " AND $inSql GROUP BY centre, status", $inArgs) as $r) {
        $s = (string)$r['status']; $n = (int)$r['c'];
        if ($s === 'active') { $byStatus['active'] += $n; $activeBy[(string)$r['centre']] = ($activeBy[(string)$r['centre']] ?? 0) + $n; }
        elseif ($s === 'inactive') $byStatus['inactive'] += $n;
        elseif (str_starts_with($s, 'graduated')) $byStatus['graduated'] += $n;
    }
    $total = array_sum($byStatus);
    // No mentor: active members with no active assignment.
    $unpairedBy = [];
    foreach (db_all("SELECT m.centre, COUNT(*) c FROM members m WHERE m.type = 'NGG' AND m.status = 'active' AND COALESCE(m.role,'') NOT IN " . CP_STAFF_ROLES_SQL . " AND " . str_replace('centre', 'm.centre', $inSql)
            . " AND NOT EXISTS (SELECT 1 FROM mentor_assignments a WHERE a.memberId = m.memberId AND a.status = 'active') GROUP BY m.centre", $inArgs) as $r)
        $unpairedBy[(string)$r['centre']] = (int)$r['c'];
    // At risk: the latest weekly assessment says so.
    $atRisk = (int)(db_row("SELECT COUNT(*) c FROM member_assessments a JOIN members m ON m.memberId = a.memberId
        WHERE a.rating = 'at_risk' AND m.type = 'NGG' AND m.status = 'active' AND " . str_replace('centre', 'm.centre', $inSql)
        . " AND a.id = (SELECT MAX(id) FROM member_assessments b WHERE b.memberId = a.memberId)", $inArgs)['c'] ?? 0);
    // Attendance: the last four session dates per centre, in the last five weeks.
    $since = gmdate('Y-m-d', time() - 35 * 86400);
    $attBy = [];
    foreach (db_all("SELECT m.centre, a.date, COUNT(*) c FROM attendance a JOIN members m ON m.memberId = a.studentId
                      WHERE a.date >= ? AND m.type = 'NGG' AND " . str_replace('centre', 'm.centre', $inSql) . " GROUP BY m.centre, a.date ORDER BY a.date DESC",
            array_merge([$since], $inArgs)) as $r)
        if (count($attBy[(string)$r['centre']] ?? []) < 4) $attBy[(string)$r['centre']][] = ['date' => (string)$r['date'], 'n' => (int)$r['c']];
    // Desks per centre: an active desk that has not expired.
    $deskBy = [];
    foreach (db_all("SELECT centreId, expiresAt FROM gate_links WHERE kind = 'desk' AND status = 'active'") as $d)
        if ((string)$d['expiresAt'] === '' || strtotime((string)$d['expiresAt']) > time()) $deskBy[(string)$d['centreId']] = true;
    $leads = cp_leads($x['centres']);
    $centreStats = []; $latest = '';
    foreach ($x['centres'] as $c) {
        $n = (string)$c['name']; $cid = (string)$c['centreId'];
        $members = $activeBy[$n] ?? 0;
        $sess = $attBy[$n] ?? [];
        $present = $sess[0]['n'] ?? 0;
        if ($sess && $sess[0]['date'] > $latest) $latest = $sess[0]['date'];
        $rate = $members ? $present / $members * 100 : 0;
        $prev = array_slice($sess, 1);
        $trendPts = $prev && $members ? (int)round($rate - array_sum(array_map(static fn($s) => $s['n'] / $members * 100, $prev)) / count($prev)) : 0;
        $lead = $leads[$cid] ?? ['tone' => 'bad', 'state' => 'No lead', 'name' => ''];
        $tone = 'ok'; $issue = 'Running normally';
        if (!$sess && $members) { $tone = 'warn'; $issue = 'No attendance recorded in five weeks'; }
        if ($trendPts <= -3) { $tone = 'warn'; $issue = 'Attendance down ' . abs($trendPts) . ' pts over ' . count($prev) . ' weeks'; }
        if ($lead['tone'] !== 'ok') { $tone = $lead['tone'] === 'bad' ? 'bad' : ($tone === 'ok' ? 'warn' : $tone);
            $issue = $lead['state'] === 'No lead' ? 'No centre lead' : ($lead['tone'] === 'bad' ? 'Centre lead isn’t cleared' : 'Centre lead hasn’t signed in since ' . ($lead['last'] ? gmdate('j M', strtotime($lead['last'])) : 'joining')); }
        $centreStats[$cid] = ['members' => $members, 'expected' => $members, 'present' => $present, 'date' => $sess[0]['date'] ?? '',
            'trend' => ($trendPts >= 0 ? '+' : '−') . abs($trendPts) . ' pt' . (abs($trendPts) === 1 ? '' : 's'),
            'unpaired' => $unpairedBy[$n] ?? 0, 'desk' => !empty($deskBy[$cid]) ? 'Online' : '—', 'tone' => $tone, 'issue' => $issue];
    }
    // Queues.
    $promo = function_exists('admin_club_promotable') ? admin_club_promotable(['requesterId' => $x['me'], 'pageSize' => 200]) : ['students' => [], 'total' => 0];
    $promoList = (array)($promo['students'] ?? []);
    if ($x['scoped']) $promoList = array_values(array_filter($promoList, static fn($s) => cp_covers($x, (string)(($s['suggestedCentre']['name'] ?? '') ?: $s['centre']))));
    $apps = cp_applications_rows($x);
    $oldest = 0; foreach ($apps as $a) $oldest = max($oldest, (int)(cp_days_since($a['createdAt']) ?? 0));
    $appr = backend_dispatch('admin.approvals.list', ['requesterId' => $x['me']]);
    // Permissions: active members missing a required answer.
    $ids = array_column(db_all("SELECT memberId FROM members WHERE type = 'NGG' AND status = 'active' AND COALESCE(role,'') NOT IN " . CP_STAFF_ROLES_SQL . " AND $inSql", $inArgs), 'memberId');
    $cons = cp_consents_for($ids);
    $missing = 0; foreach ($ids as $id) if (cp_required_missing($cons[$id] ?? [])) $missing++;
    $checkins = cp_checkin_rows($x);
    $low = count(array_filter($checkins, static fn($c) => $c['tone'] === 'bad' && !$c['told']));
    $rota = cp_rota_rows($x);
    $unfilled = array_values(array_filter($rota, static fn($r) => $r['who'] === ''));
    return ['memberStats' => ['total' => $total, 'byStatus' => [['Active', $byStatus['active'], 'ok'], ['Inactive', $byStatus['inactive'], 'warn'], ['Graduated', $byStatus['graduated'], 'neutral']],
                              'atRisk' => $atRisk, 'unpaired' => array_sum($unpairedBy)],
            'centreStats' => $centreStats, 'attFrom' => $latest !== '' ? 'Attendance from ' . gmdate('l j F', strtotime($latest)) : 'No attendance recorded yet',
            'counts' => ['promotable' => count($promoList), 'promotableNoEmail' => count(array_filter($promoList, static fn($s) => !empty($s['noContact']))),
                         'applications' => count($apps), 'applicationsOldestDays' => $oldest, 'approvals' => (int)($appr['pending'] ?? count((array)($appr['approvals'] ?? []))),
                         'approvalKinds' => array_slice(array_values(array_unique(array_map(static fn($a) => (string)$a['summary'], (array)($appr['approvals'] ?? [])))), 0, 3),
                         'permissionsMissing' => $missing, 'companionLow' => $low,
                         'rotaUnfilled' => count($unfilled), 'rotaFirstUnfilled' => $unfilled[0] ?? null]];
}

/** admin.clubp.dashboard — the aggregates and the team, in one call. */
function admin_clubp_dashboard(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $d = cp_dashboard_data($x);
    return ['ok' => true] + $d + ['staff' => cp_staff($x)];
}

/* ── Team ───────────────────────────────────────────────────────────────── */

/** Everyone who runs the Club, by role, with a state that says who needs follow-up. */
function cp_staff(array $x): array {
    $out = [];
    $all = static fn($c) => true;
    $loginOf = [];
    foreach (db_all("SELECT memberId, lastLoginAt FROM members WHERE COALESCE(lastLoginAt,'') <> ''") as $m) $loginOf[(string)$m['memberId']] = (string)$m['lastLoginAt'];
    $sgOf = []; foreach (db_all('SELECT volunteerId, safeguarding FROM volunteers') as $v) $sgOf[(string)$v['volunteerId']] = (string)$v['safeguarding'];
    $load = []; foreach (db_all("SELECT mentorId, COUNT(*) c FROM mentor_assignments WHERE status = 'active' GROUP BY mentorId") as $r) $load[(string)$r['mentorId']] = (int)$r['c'];
    // Mentors (NGG).
    foreach (db_all("SELECT mentorId, fullName, centre, status, maxMentees, memberId, volunteerId FROM mentors WHERE COALESCE(programme,'') <> 'summer' AND COALESCE(status,'') NOT IN ('rejected','archived','removed','left') ORDER BY fullName") as $m) {
        if (!cp_covers($x, (string)$m['centre']) && $x['scoped']) continue;
        $st = strtolower((string)$m['status']); $last = $loginOf[(string)$m['memberId']] ?? '';
        $sg = (string)$m['volunteerId'] !== '' ? ($sgOf[(string)$m['volunteerId']] ?? 'pending') : (str_contains($st, 'pending') ? 'pending' : 'cleared');
        $n = $load[(string)$m['mentorId']] ?? 0; $max = (int)($m['maxMentees'] ?: 12); $quiet = cp_days_since($last);
        if ($sg !== 'cleared') { $tone = 'bad'; $state = 'Not cleared'; $detail = 'Safeguarding check not finished'; }
        elseif (in_array($st, ['paused', 'leaving', 'inactive', 'away'], true)) { $tone = 'neutral'; $state = 'Away'; $detail = ucfirst($st); }
        elseif ($n > $max) { $tone = 'warn'; $state = 'Over capacity'; $detail = $n . ' mentees, takes up to ' . $max; }
        elseif ($quiet === null || $quiet > 14) { $tone = 'warn'; $state = 'Needs follow-up'; $detail = $quiet === null ? 'Has never signed in' : 'Hasn’t signed in for ' . $quiet . ' days'; }
        else { $tone = 'ok'; $state = 'Active'; $detail = $n ? 'Mentoring ' . $n : 'No mentees yet'; }
        $out[] = ['name' => (string)$m['fullName'], 'role' => 'mentor', 'centre' => (string)$m['centre'] ?: 'All centres', 'state' => $state, 'tone' => $tone,
                  'detail' => $detail, 'last' => cp_last($last), 'load' => $n, 'id' => (string)$m['mentorId']];
    }
    // Instructors.
    foreach (db_all("SELECT volunteerId, fullName, centre, safeguarding, memberId FROM volunteers WHERE role = 'instructor' AND status = 'active' AND COALESCE(programme,'') <> 'summer' ORDER BY fullName") as $v) {
        if ($x['scoped'] && !cp_covers($x, (string)$v['centre'])) continue;
        $last = $loginOf[(string)$v['memberId']] ?? '';
        $bad = (string)$v['safeguarding'] !== 'cleared';
        $out[] = ['name' => (string)$v['fullName'], 'role' => 'instructor', 'centre' => (string)$v['centre'] ?: 'All centres',
                  'state' => $bad ? 'Not cleared' : 'Active', 'tone' => $bad ? 'bad' : 'ok', 'detail' => $bad ? 'Safeguarding check not finished' : '',
                  'last' => cp_last($last), 'id' => (string)$v['volunteerId']];
    }
    // Centre leads.
    $leads = cp_leads($x['centres']);
    foreach ($x['centres'] as $c) {
        $l = $leads[(string)$c['centreId']] ?? null; if (!$l || $l['name'] === '') continue;
        $out[] = ['name' => $l['name'], 'role' => 'lead', 'centre' => (string)$c['name'], 'state' => $l['state'], 'tone' => $l['tone'],
                  'detail' => $l['tone'] === 'ok' ? 'Leads ' . $c['name'] : $l['state'], 'last' => cp_last($l['last'])];
    }
    // Admins with portal access.
    foreach (db_all("SELECT memberId, fullName, role, centreScope, lastLoginAt FROM members WHERE role IN ('super_admin','admin','club_admin') AND COALESCE(status,'') NOT IN ('suspended','deleted','merged') ORDER BY fullName") as $m) {
        $scope = (array)(safe_json((string)$m['centreScope']) ?: []);
        $covers = $scope ? implode(', ', array_column(db_all('SELECT name FROM centres WHERE centreId IN (' . implode(',', array_fill(0, count($scope), '?')) . ')', $scope), 'name')) : 'All centres';
        $quiet = cp_days_since((string)$m['lastLoginAt']);
        $out[] = ['name' => (string)$m['fullName'], 'role' => 'admin', 'centre' => $covers, 'access' => admin_role_label((string)$m['role']),
                  'state' => $quiet !== null && $quiet <= 30 ? 'Active' : 'Away or off', 'tone' => $quiet !== null && $quiet <= 30 ? 'ok' : 'neutral',
                  'detail' => (string)$m['memberId'] === $x['me'] ? 'You' : '', 'last' => cp_last((string)$m['lastLoginAt'])];
    }
    return $out;
}

/* ── Companion check-ins ────────────────────────────────────────────────── */

/** Recent check-ins (21 days), the latest per member, not yet marked seen. */
function cp_checkin_rows(array $x): array {
    [$inSql, $inArgs] = cp_in($x, 'm.centre');
    $since = gmdate('Y-m-d', time() - 21 * 86400);
    $rows = db_all("SELECT c.id, c.memberId, c.week, c.wellbeing, c.note, c.createdAt, m.fullName, m.displayId, m.centre FROM member_checkins c
                    JOIN members m ON m.memberId = c.memberId
                    WHERE c.createdAt >= ? AND m.type = 'NGG' AND $inSql
                      AND c.id = (SELECT MAX(id) FROM member_checkins d WHERE d.memberId = c.memberId)
                    ORDER BY c.createdAt DESC LIMIT 300", array_merge([$since], $inArgs));
    $keys = array_map(static fn($r) => $r['memberId'] . '|' . $r['week'], $rows);
    $state = [];
    if ($keys) foreach (db_all('SELECT * FROM club_checkin_state WHERE checkinKey IN (' . implode(',', array_fill(0, count($keys), '?')) . ')', $keys) as $s) $state[(string)$s['checkinKey']] = $s;
    $mentorOf = [];
    foreach (db_all("SELECT a.memberId, t.fullName FROM mentor_assignments a JOIN mentors t ON t.mentorId = a.mentorId WHERE a.status = 'active'") as $r) $mentorOf[(string)$r['memberId']] = (string)$r['fullName'];
    $out = [];
    foreach ($rows as $r) {
        $key = $r['memberId'] . '|' . $r['week']; $s = $state[$key] ?? [];
        if (!empty($s['seenAt'])) continue;
        $w = strtolower((string)$r['wellbeing']);
        [$mood, $tone] = $w === 'okay' ? ['Okay', 'ok'] : ($w === 'struggling' ? ['Low', 'bad'] : ($w === 'need help' ? ['Low', 'bad'] : ['Okay', 'neutral']));
        $note = trim((string)$r['note']);
        $out[] = ['id' => $key, 'name' => (string)$r['fullName'], 'mid' => (string)($r['displayId'] ?: $r['memberId']), 'memberId' => (string)$r['memberId'], 'centre' => (string)$r['centre'],
                  'mood' => $mood, 'tone' => $tone, 'wellbeing' => (string)$r['wellbeing'], 'note' => $note !== '' ? '“' . $note . '”' : '',
                  'when' => cp_ago((string)$r['createdAt']), 'mentor' => $mentorOf[(string)$r['memberId']] ?? 'No mentor yet',
                  'hasMentor' => isset($mentorOf[(string)$r['memberId']]), 'told' => !empty($s['toldAt'])];
    }
    usort($out, static fn($a, $b) => ($a['tone'] === 'bad' ? 0 : 1) <=> ($b['tone'] === 'bad' ? 0 : 1));
    return $out;
}
function admin_clubp_checkins(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    return ['ok' => true, 'checkins' => cp_checkin_rows($x)];
}
/** admin.clubp.checkin — tell the mentor, mark seen, or undo seen. */
function admin_clubp_checkin(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $key = (string)($p['id'] ?? ''); $act = (string)($p['act'] ?? '');
    [$mid, $week] = array_pad(explode('|', $key, 2), 2, '');
    $m = db_row("SELECT memberId, fullName, centre FROM members WHERE memberId = ? AND type = 'NGG'", [$mid]);
    if (!$m || !db_row('SELECT id FROM member_checkins WHERE memberId = ? AND week = ?', [$mid, $week])) return ['ok' => false, 'error' => 'not_found'];
    if (!cp_covers($x, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    if (!db_row('SELECT id FROM club_checkin_state WHERE checkinKey = ?', [$key])) db_insert('club_checkin_state', ['checkinKey' => $key]);
    if ($act === 'tell') {
        $mentor = db_row("SELECT t.fullName, t.email, t.memberId FROM mentor_assignments a JOIN mentors t ON t.mentorId = a.mentorId WHERE a.memberId = ? AND a.status = 'active' LIMIT 1", [$mid]);
        if (!$mentor) return ['ok' => false, 'error' => 'no_mentor', 'message' => $m['fullName'] . ' has no mentor yet. Pair them first, in Mentorship.'];
        $acct = (string)$mentor['memberId'] !== '' ? db_row('SELECT memberId, email FROM members WHERE memberId = ?', [$mentor['memberId']]) : null;
        $target = $acct ?: ['memberId' => '', 'email' => (string)$mentor['email']];
        $n = ['kind' => 'mentor', 'title' => cp_first((string)$m['fullName']) . ' said they’re struggling',
              'body' => cp_first((string)$m['fullName']) . ' checked in this week and isn’t doing well. Please reach out before Saturday.',
              'linkPage' => 'mentor', 'ctaPath' => '/mentor', 'eyebrow' => 'NGG Club'];
        if ($target['memberId'] !== '') notify_people([$target], $n);
        elseif ($target['email'] !== '' && function_exists('send_mail') && function_exists('email_template'))
            @send_mail($target['email'], $n['title'], email_template(['title' => $n['title'], 'eyebrow' => 'NGG Club', 'bodyHtml' => '<p>' . esc_html($n['body']) . '</p>']));
        db_update('club_checkin_state', ['toldAt' => now_iso(), 'toldBy' => $x['me']], ['checkinKey' => $key]);
        audit('club.checkin.tell', $x['me'], $mid, ['week' => $week]);
        return ['ok' => true, 'mentor' => (string)$mentor['fullName']];
    }
    if ($act === 'seen' || $act === 'unseen') {
        db_update('club_checkin_state', $act === 'seen' ? ['seenAt' => now_iso(), 'seenBy' => $x['me']] : ['seenAt' => '', 'seenBy' => ''], ['checkinKey' => $key]);
        return ['ok' => true];
    }
    return ['ok' => false, 'error' => 'bad_act'];
}

/* ── Permissions (consents) ─────────────────────────────────────────────── */

/** admin.clubp.consents — every active or inactive member's seven answers, with the totals. */
function admin_clubp_consents(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    [$inSql, $inArgs] = cp_in($x);
    $mem = db_all("SELECT memberId, displayId, fullName, centre, status, parentName FROM members WHERE type = 'NGG' AND status IN ('active','inactive')
                   AND COALESCE(role,'') NOT IN " . CP_STAFF_ROLES_SQL . " AND $inSql ORDER BY fullName LIMIT 6000", $inArgs);
    $ids = array_column($mem, 'memberId');
    $cons = cp_consents_for($ids);
    $gName = [];
    foreach (array_chunk($ids, 400) as $ch) foreach (db_all("SELECT w.memberId, g.fullName FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId
            WHERE w.status = 'active' AND w.memberId IN (" . implode(',', array_fill(0, count($ch), '?')) . ')', $ch) as $r) $gName[(string)$r['memberId']] ??= (string)$r['fullName'];
    $rows = []; $tot = ['members' => 0, 'complete' => 0, 'missingRequired' => 0, 'noGuardian' => 0, 'photoOk' => 0, 'namedOk' => 0, 'tripsOk' => 0];
    foreach ($mem as $m) {
        $c = $cons[(string)$m['memberId']] ?? [];
        $guardian = $gName[(string)$m['memberId']] ?? trim((string)$m['parentName']);
        $rows[] = ['id' => (string)$m['memberId'], 'displayId' => (string)($m['displayId'] ?: $m['memberId']), 'name' => (string)$m['fullName'],
                   'centre' => (string)$m['centre'], 'status' => (string)$m['status'] === 'active' ? 'Active' : 'Inactive', 'consent' => ['guardian' => $guardian] + $c];
        $tot['members']++;
        $g = static fn($k) => ($c[$k]['v'] ?? '') === 'g';
        if (count($c) >= count(CP_CLAUSES)) $tot['complete']++;
        if ((string)$m['status'] === 'active' && ($guardian === '' || cp_required_missing($c))) $tot['missingRequired']++;
        if ($guardian === '') $tot['noGuardian']++;
        if ($g('media')) $tot['photoOk']++;
        if ($g('media') && $g('site_visibility')) $tot['namedOk']++;
        if ($g('trips')) $tot['tripsOk']++;
    }
    return ['ok' => true, 'rows' => $rows, 'totals' => $tot];
}
/** admin.clubp.consent.set — record one answer, through the member desk's own op. */
function admin_clubp_consent_set(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $m = db_row("SELECT memberId, centre FROM members WHERE memberId = ? AND type = 'NGG'", [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!cp_covers($x, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $v = (string)($p['v'] ?? '');
    return backend_dispatch('admin.members.consent', ['requesterId' => $x['me'], 'memberId' => $m['memberId'], 'type' => (string)($p['type'] ?? ''),
        'status' => $v === 'g' ? 'granted' : 'declined', 'method' => (string)($p['method'] ?? 'Paper form'), 'ip' => (string)($p['ip'] ?? '')]);
}
/** admin.clubp.consent.link — email the guardian a link to answer from the family page. */
function admin_clubp_consent_link(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $m = db_row("SELECT memberId, fullName, centre, parentEmail, parentName FROM members WHERE memberId = ? AND type = 'NGG'", [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!cp_covers($x, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $to = trim((string)$m['parentEmail']);
    if ($to === '') {
        $g = db_row("SELECT g.email, g.fullName FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId WHERE w.memberId = ? AND w.status = 'active' LIMIT 1", [$m['memberId']]);
        $to = trim((string)($g['email'] ?? ''));
    }
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'no_guardian_email', 'message' => 'There is no guardian email on file. Add one in Families first.'];
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $first = cp_first((string)$m['fullName']);
    $title = 'Please answer ' . $first . '’s NGG permissions';
    $ok = function_exists('send_mail') && function_exists('email_template') && @send_mail($to, $title, email_template(['title' => $title, 'eyebrow' => 'NGG Club',
        'intro' => 'Seven short questions decide whether ' . $first . ' can take part, be photographed, be named in public and go on trips.',
        'bodyHtml' => '<p style="margin:0 0 10px">Sign in to your family account to answer them. It takes about two minutes, and you can change an answer at any time.</p>',
        'ctaLabel' => 'Answer the permissions →', 'ctaUrl' => $origin . '/family']));
    audit('club.consent.link', $x['me'], (string)$m['memberId'], ['to' => $to, 'sent' => (bool)$ok]);
    return $ok ? ['ok' => true, 'to' => $to] : ['ok' => false, 'error' => 'mail_failed', 'message' => 'The email could not be sent. Try again, or record the answers by hand.'];
}

/* ── Generic sections ───────────────────────────────────────────────────── */

function cp_applications_rows(array $x): array {
    [$inSql, $inArgs] = cp_in($x);
    return db_all("SELECT id, ref, name, age, dob, centre, track, courses, photoUrl, status, createdAt, details, email FROM applications
                   WHERE kind = 'teen' AND COALESCE(program,'') <> 'summer' AND status IN ('new','reviewing','waitlist') AND $inSql
                   ORDER BY createdAt LIMIT " . CP_ROWS_MAX, $inArgs);
}

/** The duty shifts for the next weeks at the covered centres (no auto-assignment). */
function cp_rota_rows(array $x): array {
    $out = [];
    $vols = []; foreach (db_all('SELECT volunteerId, fullName, safeguarding FROM volunteers') as $v) $vols[(string)$v['volunteerId']] = $v;
    foreach ($x['centres'] as $c) {
        $days = function_exists('centre_meet_weekdays') ? centre_meet_weekdays((string)$c['meetDays']) : [];
        $win = function_exists('tt_centre_window') ? tt_centre_window((string)$c['meetTime']) : null;
        $dates = cp_next_dates($days ?: [6], CP_ROTA_WEEKS * max(1, count($days ?: [6])));
        $have = [];
        foreach (db_all('SELECT * FROM attendance_duty WHERE centre = ? AND date >= ?', [(string)$c['name'], gmdate('Y-m-d')]) as $d) $have[(string)$d['date']] = $d;
        foreach (array_unique(array_merge($dates, array_keys($have))) as $date) {
            $d = $have[$date] ?? null; $v = $d ? ($vols[(string)$d['volunteerId']] ?? null) : null;
            $out[] = ['id' => $date . '|' . $c['name'], 'date' => $date, 'centre' => (string)$c['name'],
                      'start' => $d && $d['startTime'] !== '' ? (string)$d['startTime'] : ($win ? tt_hhmm($win[0]) : '09:00'),
                      'end' => $d && $d['endTime'] !== '' ? (string)$d['endTime'] : ($win ? tt_hhmm($win[1]) : '14:00'),
                      'who' => $v ? (string)$v['fullName'] : '', 'whoId' => $v ? (string)$v['volunteerId'] : '',
                      'cleared' => $v ? (string)$v['safeguarding'] === 'cleared' : false, 'stored' => (bool)$d];
        }
    }
    usort($out, static fn($a, $b) => strcmp($a['date'] . $a['centre'], $b['date'] . $b['centre']));
    return $out;
}

/** Fine rules: seeded once from the fee desk's reasons, amounts from the policy. */
function cp_rules_seed(): void {
    if (db_row('SELECT id FROM conduct_rules LIMIT 1')) return;
    $pol = function_exists('policy_settings') ? (array)policy_settings() : [];
    $mem = (array)($pol['member'] ?? []);
    $seed = [
        ['late', 'Late attendance', 'Arriving after the lateness threshold', (int)($mem['lateFine'] ?? 500)],
        ['absent', 'Missed sessions', 'Over the absence limit without notice', (int)($mem['fine'] ?? 0)],
        ['equipment', 'Equipment lost or damaged', 'Set per case', 0],
        ['conduct', 'Conduct', 'After a warning, set per case', 0],
    ];
    foreach ($seed as [$k, $n, $w, $a]) db_insert('conduct_rules', ['ruleId' => 'RULE-' . strtoupper($k), 'reason' => $k, 'name' => $n, 'whenText' => $w,
        'amount' => $a, 'capTerm' => 0, 'active' => 1, 'createdBy' => 'system', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
}
/** The term a member's fines count against: the programme term, else the school term. */
function cp_term_bounds(string $memberId): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ?', [$memberId]);
    if ($m && function_exists('member_calendar_for') && function_exists('programme_term_bounds')) {
        $cal = member_calendar_for($m);
        if (!empty($cal['enabled'])) { [$a, $b] = programme_term_bounds(gmdate('Y-m-d'), $cal); if ($a !== '') return [$a, $b ?: '9999-12-31']; }
    }
    $y = (int)gmdate('Y'); $mo = (int)gmdate('n');
    return $mo >= 9 ? ["$y-09-01", "$y-12-31"] : ($mo >= 5 ? ["$y-05-01", "$y-08-31"] : ["$y-01-01", "$y-04-30"]);
}
/** The rule a fine falls under: an explicit rule, a fee-desk reason, or the policy's wording. */
function conduct_rule_key(array $opts): string {
    $k = strtolower((string)($opts['rule'] ?? $opts['method'] ?? ''));
    if (in_array($k, ['late', 'absent', 'equipment', 'conduct'], true)) return $k;
    $note = strtolower((string)($opts['note'] ?? ''));
    if (str_contains($note, 'late')) return 'late';
    if (str_contains($note, 'absen') || str_contains($note, 'missed')) return 'absent';
    return '';
}
/**
 * How much of a fine may be posted under its rule. A rule that is off posts
 * nothing; a rule with a cap posts at most what is left of it this term. Called
 * by fees_post for every fine, so the cap holds however the fine arrived.
 */
function conduct_rule_allow(string $memberId, int $amount, array $opts): int {
    $k = conduct_rule_key($opts); if ($k === '') return $amount;
    try { $r = db_row('SELECT * FROM conduct_rules WHERE reason = ? ORDER BY id LIMIT 1', [$k]); } catch (Throwable $e) { return $amount; }
    if (!$r) return $amount;
    if (!(int)$r['active']) return 0;
    $cap = (int)$r['capTerm']; if ($cap <= 0) return $amount;
    [$a, $b] = cp_term_bounds($memberId);
    $sum = 0;
    foreach (db_all("SELECT amount, method, note FROM member_ledger WHERE memberId = ? AND kind = 'fine' AND COALESCE(voidedAt,'') = '' AND substr(createdAt,1,10) BETWEEN ? AND ?", [$memberId, $a, $b]) as $e)
        if (conduct_rule_key(['method' => $e['method'], 'note' => $e['note']]) === $k) $sum += (int)$e['amount'];
    return max(0, min($amount, $cap - $sum));
}

/** admin.clubp.section — one generic section's rows, as the design's cells. */
function admin_clubp_section(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $sec = (string)($p['sec'] ?? '');
    if (!in_array($sec, CP_SECTIONS, true)) return ['ok' => false, 'error' => 'bad_section'];
    $fn = 'cp_sec_' . $sec;
    $r = $fn($x);
    if (!empty($r['error'])) return ['ok' => false] + $r;
    return ['ok' => true, 'sec' => $sec] + $r;
}

function cp_sec_applications(array $x): array {
    $rows = [];
    foreach (cp_applications_rows($x) as $a) {
        $d = safe_json((string)$a['details']) ?: [];
        $age = (int)$a['age'] ?: (($a['dob'] ?? '') !== '' ? (int)floor((time() - strtotime((string)$a['dob'])) / 31557600) : 0);
        $by = !empty($d['parent']['name'] ?? '') || !empty($d['guardianName'] ?? '') ? 'applied by parent' : 'applied online';
        $courses = safe_json((string)$a['courses']) ?: [];
        $st = (string)$a['status'] === 'waitlist' ? ['s', 'Waitlisted', 'neutral'] : ((string)$a['photoUrl'] === '' ? ['s', 'Missing photo', 'bad'] : ['s', (string)$a['status'] === 'reviewing' ? 'Reviewing' : 'To review', 'warn']);
        $rows[] = ['id' => (string)$a['id'], 'cells' => [['p', (string)$a['name'], ($age ? 'Age ' . $age . ' · ' : '') . $by], (string)($a['track'] ?: ($courses[0] ?? '—')),
                   (string)$a['centre'], cp_ago((string)$a['createdAt']), $st], 'ref' => (string)$a['ref']];
    }
    return ['rows' => $rows];
}
function cp_sec_approvals(array $x): array {
    $r = backend_dispatch('admin.approvals.list', ['requesterId' => $x['me']]);
    if (empty($r['ok'])) return ['error' => $r['error'] ?? 'failed'];
    $rows = [];
    foreach ((array)$r['approvals'] as $a) {
        $op = (string)$a['op'];
        $kind = str_contains($op, 'merge') ? 'Merge' : (str_contains($op, 'centres') ? 'Centre change' : (str_contains($op, 'volunteer') ? 'Volunteer change' : (str_contains($op, 'bulk') || str_contains($op, 'upsert') ? 'Member status' : 'Change')));
        $rows[] = ['id' => (string)$a['approvalId'], 'cells' => [['p', $kind, 'Second approval'], (string)$a['requesterName'], (string)$a['summary'], ltrim(str_replace(' ago', '', cp_ago((string)$a['createdAt'])))],
                   'mine' => (string)$a['requesterId'] === $x['me']];
    }
    return ['rows' => $rows, 'canDecide' => !empty($r['canDecide'])];
}
function cp_sec_requests(array $x): array {
    $r = backend_dispatch('admin.requests.list', ['requesterId' => $x['me'], 'status' => 'open']);
    if (empty($r['ok'])) return ['error' => $r['error'] ?? 'failed'];
    $rows = [];
    foreach ((array)$r['requests'] as $q) {
        if (!cp_covers($x, (string)$q['centre'])) continue;
        $rows[] = ['id' => (string)$q['requestId'], 'kind' => (string)$q['kind'], 'cells' => [['p', (string)$q['fullName'], (string)$q['displayId']], (string)$q['kindLabel'],
                   trim((string)($q['subject'] ?: $q['body'])), cp_ago((string)$q['createdAt'])]];
    }
    return ['rows' => $rows];
}
function cp_sec_families(array $x): array {
    [$inSql, $inArgs] = cp_in($x, 'm.centre');
    $rows = [];
    foreach (db_all("SELECT w.linkId, w.status, w.relationship, w.memberId, g.fullName gname, g.email, g.lastSeenAt, m.fullName FROM guardian_wards w
                     JOIN guardians g ON g.guardianId = w.guardianId JOIN members m ON m.memberId = w.memberId
                     WHERE w.status IN ('active','pending') AND m.type = 'NGG' AND $inSql ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, g.fullName LIMIT " . CP_ROWS_MAX, $inArgs) as $w) {
        $st = (string)$w['status'] === 'pending' ? ['s', 'Waiting for approval', 'warn'] : ['s', 'Linked', 'ok'];
        $rows[] = ['id' => (string)$w['linkId'], 'cells' => [['p', (string)$w['gname'], (string)$w['email']], cp_first((string)$w['fullName']),
                   ucfirst((string)$w['relationship'] ?: 'guardian'), cp_last((string)$w['lastSeenAt']), $st], 'pending' => (string)$w['status'] === 'pending'];
    }
    return ['rows' => $rows];
}
function cp_sec_idcards(array $x): array {
    [$inSql, $inArgs] = cp_in($x);
    $state = backend_dispatch('admin.ids.state', ['requesterId' => $x['me']]);
    $issued = (array)($state['issued'] ?? []); $reprints = (array)($state['reprints'] ?? []); $asked = (array)($state['asked'] ?? []);
    $rows = [];
    foreach (db_all("SELECT memberId, displayId, fullName, photoUrl, centre FROM members WHERE type = 'NGG' AND status = 'active'
                     AND COALESCE(role,'') NOT IN " . CP_STAFF_ROLES_SQL . " AND $inSql ORDER BY fullName", $inArgs) as $m) {
        $key = 'member:' . $m['memberId'];
        $has = !empty($issued[$key]['ok']); $rp = $reprints[$key] ?? null;
        if ($has && !$rp) continue;
        $photo = (string)$m['photoUrl'] !== '';
        $reason = $rp ? ucfirst((string)($rp['why'] ?? 'Reprint')) : 'New member';
        $st = !$photo ? (isset($asked[$key]) ? ['s', 'Photo requested', 'warn'] : ['s', 'Needs a photo', 'bad']) : ($rp ? ['s', 'Reprint queued', 'warn'] : ['s', 'Ready to print', 'ok']);
        $rows[] = ['id' => (string)$m['memberId'], 'cells' => [['p', (string)$m['fullName'], (string)($m['displayId'] ?: 'No number yet')],
                   (string)($m['displayId'] ?: '—'), $reason, $photo ? ['s', 'On file', 'ok'] : ['s', 'Missing', 'bad'], $st], 'photo' => $photo];
        if (count($rows) >= CP_ROWS_MAX) break;
    }
    return ['rows' => $rows];
}
function cp_sec_mentorship(array $x): array {
    $r = backend_dispatch('admin.ms.relationships', ['requesterId' => $x['me']]);
    $rows = [];
    $tone = ['At risk' => 'bad', 'Watch' => 'warn', 'Healthy' => 'ok', 'Paused' => 'neutral', 'Closing' => 'neutral'];
    $label = ['Healthy' => 'On track', 'Watch' => 'Overdue'];
    foreach ((array)($r['relationships'] ?? []) as $m) {
        if (!cp_covers($x, (string)$m['centre'])) continue;
        $h = (string)$m['health'];
        $rows[] = ['id' => (string)$m['matchId'], 'memberId' => (string)$m['memberId'], 'cells' => [['p', (string)$m['menteeName'], (string)$m['memberId']], (string)$m['mentorName'],
                   $m['startedAt'] ? gmdate('M Y', strtotime((string)$m['startedAt'])) : '—', cp_ago((string)$m['lastContact']), ['s', $label[$h] ?? $h, $tone[$h] ?? 'neutral']]];
    }
    // Pairs made from a centre's mentor list live in mentor_assignments, not in the
    // pods programme's mentor_matches. Both are real pairings; show each mentee once.
    $seen = array_flip(array_column($rows, 'memberId'));
    [$inSql, $inArgs] = cp_in($x, 'm.centre');
    $pairs = db_all("SELECT a.id, a.memberId, a.startedAt, m.fullName mname, m.displayId, t.fullName tname FROM mentor_assignments a
                     JOIN members m ON m.memberId = a.memberId LEFT JOIN mentors t ON t.mentorId = a.mentorId
                     WHERE a.status = 'active' AND m.type = 'NGG' AND $inSql ORDER BY m.fullName", $inArgs);
    $ids = array_values(array_unique(array_column($pairs, 'memberId'))); $last = [];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT subjectId, MAX(metOn) d FROM mentor_meetings WHERE subjectId IN ($ph) GROUP BY subjectId", $ids) as $r) $last[(string)$r['subjectId']] = (string)$r['d'];
    }
    foreach ($pairs as $a) {
        $mid = (string)$a['memberId'];
        if (isset($seen[$mid]) || count($rows) >= CP_ROWS_MAX) continue;
        $seen[$mid] = 1;
        $lc = $last[$mid] ?? '';
        $fresh = $lc === '' && (string)$a['startedAt'] !== '' && strtotime((string)$a['startedAt']) >= time() - 14 * 86400;
        $stale = !$fresh && ($lc === '' || strtotime($lc) < time() - 30 * 86400);
        $rows[] = ['id' => 'ma:' . $a['id'], 'memberId' => $mid, 'cells' => [['p', (string)$a['mname'], (string)($a['displayId'] ?: $mid)], (string)($a['tname'] ?: 'Unknown mentor'),
                   $a['startedAt'] ? gmdate('M Y', strtotime((string)$a['startedAt'])) : '—', cp_ago($lc), $fresh ? ['s', 'New pair', 'neutral'] : ($stale ? ['s', 'Overdue', 'warn'] : ['s', 'On track', 'ok'])]];
    }
    $un = cp_dashboard_unpaired($x);
    return ['rows' => $rows, 'note' => $un ? $un . ' member' . ($un === 1 ? ' has' : 's have') . ' no mentor. Pair them from each centre’s mentor list; a mentor takes up to 12.' : ''];
}
function cp_dashboard_unpaired(array $x): int {
    [$inSql, $inArgs] = cp_in($x, 'm.centre');
    return (int)(db_row("SELECT COUNT(*) c FROM members m WHERE m.type = 'NGG' AND m.status = 'active' AND COALESCE(m.role,'') NOT IN " . CP_STAFF_ROLES_SQL . " AND $inSql
        AND NOT EXISTS (SELECT 1 FROM mentor_assignments a WHERE a.memberId = m.memberId AND a.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM mentor_matches x WHERE x.memberId = m.memberId AND x.status IN ('active','paused','closing'))", $inArgs)['c'] ?? 0);
}
function cp_sec_behaviour(array $x): array {
    [$inSql, $inArgs] = cp_in($x, 'm.centre');
    $mentorOf = [];
    foreach (db_all("SELECT a.memberId, t.fullName FROM mentor_assignments a JOIN mentors t ON t.mentorId = a.mentorId WHERE a.status = 'active'") as $r) $mentorOf[(string)$r['memberId']] = (string)$r['fullName'];
    $rows = [];
    foreach (db_all("SELECT b.*, m.fullName mname, m.displayId FROM behaviour_logs b JOIN members m ON m.memberId = b.subjectId
                     WHERE m.type = 'NGG' AND $inSql AND (b.status = 'open' OR b.createdAt >= ?) ORDER BY CASE b.status WHEN 'open' THEN 0 ELSE 1 END, b.createdAt DESC LIMIT " . CP_ROWS_MAX,
             array_merge($inArgs, [gmdate('Y-m-d', time() - 14 * 86400)])) as $b) {
        $sev = (string)$b['severity'];
        $st = (string)$b['status'] === 'reviewed' ? ['s', 'Supported', 'ok'] : ($sev === 'urgent' ? ['s', 'Needs a call', 'bad'] : ($sev === 'concern' ? ['s', 'Watching', 'warn'] : ['s', 'Noted', 'ok']));
        $rows[] = ['id' => (string)$b['logId'], 'cells' => [['p', (string)$b['mname'], (string)($b['displayId'] ?: $b['subjectId'])], (string)$b['note'],
                   ucfirst((string)$b['category']), $mentorOf[(string)$b['subjectId']] ?? 'No mentor', $st], 'open' => (string)$b['status'] === 'open'];
    }
    return ['rows' => $rows];
}
function cp_sec_conduct(array $x): array {
    cp_rules_seed();
    $rows = [];
    foreach (db_all('SELECT * FROM conduct_rules ORDER BY id') as $r) {
        $n = 0;
        $y = (int)gmdate('Y'); $mo = (int)gmdate('n');
        $from = $mo >= 9 ? "$y-09-01" : ($mo >= 5 ? "$y-05-01" : "$y-01-01");
        foreach (db_all("SELECT method, note FROM member_ledger WHERE kind = 'fine' AND COALESCE(voidedAt,'') = '' AND substr(createdAt,1,10) >= ?", [$from]) as $e)
            if (conduct_rule_key(['method' => $e['method'], 'note' => $e['note']]) === (string)$r['reason'] && (string)$r['reason'] !== '') $n++;
        $rows[] = ['id' => (string)$r['ruleId'], 'cells' => [['p', (string)$r['name'], (string)$r['whenText']], ['n', (int)$r['amount'] ? '₦' . number_format((int)$r['amount']) : 'Per case'],
                   (int)$r['capTerm'] ? '₦' . number_format((int)$r['capTerm']) : 'No cap', ['n', (string)$n], (int)$r['active'] ? ['s', 'On', 'ok'] : ['s', 'Off', 'neutral']],
                   'active' => (bool)(int)$r['active']];
    }
    return ['rows' => $rows, 'note' => 'Collecting and waiving money is handled in Dues & fees, which needs an admin who holds fees.'];
}
function cp_sec_curriculum(array $x): array {
    $members = [];
    foreach (db_all("SELECT track, COUNT(*) c FROM members WHERE type = 'NGG' AND status = 'active' AND COALESCE(track,'') <> '' GROUP BY track") as $r) $members[(string)$r['track']] = (int)$r['c'];
    $where = [];
    foreach (db_all("SELECT s.course, c.name FROM timetable_slots s JOIN centres c ON c.centreId = s.centreId WHERE s.status = 'active' GROUP BY s.course, c.name") as $r) $where[(string)$r['course']][] = (string)$r['name'];
    $rows = [];
    $divs = function_exists('club_divisions') ? club_divisions() : [];
    array_unshift($divs, ['name' => 'Chess · every division', 'courses' => ['Chess']]);
    foreach ($divs as $d) foreach ($d['courses'] as $c) {
        $rows[] = ['id' => (string)$c, 'cells' => [['p', (string)$c, (string)$d['name']], (string)$d['name'], implode(', ', $where[$c] ?? []) ?: 'Not on the timetable', ['n', number_format($members[$c] ?? 0)]]];
    }
    return ['rows' => $rows];
}
function cp_sec_desks(array $x): array {
    $rows = [];
    $ids = array_map(static fn($c) => (string)$c['centreId'], $x['centres']);
    if (!$ids) return ['rows' => []];
    $cname = []; foreach ($x['centres'] as $c) $cname[(string)$c['centreId']] = (string)$c['name'];
    $rota = []; foreach (cp_rota_rows($x) as $r) if (!isset($rota[$r['centre']])) $rota[$r['centre']] = $r['who'];
    foreach (db_all("SELECT gateId, name, centreId, status, expiresAt, createdAt FROM gate_links WHERE kind = 'desk' AND status = 'active' AND centreId IN (" . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY createdAt DESC', $ids) as $g) {
        $dev = 'gate:' . substr((string)$g['gateId'], 0, 12);
        $s = db_row("SELECT date, COUNT(*) c, MAX(checkInAt) last FROM attendance WHERE (device = ? OR byId = ?) GROUP BY date ORDER BY date DESC LIMIT 1", [$dev, 'gate:' . $g['gateId']]);
        $expired = (string)$g['expiresAt'] !== '' && strtotime((string)$g['expiresAt']) < time();
        $rows[] = ['id' => (string)$g['gateId'], 'cells' => [['p', (string)$g['name'], $cname[(string)$g['centreId']] ?? ''], ($rota[$cname[(string)$g['centreId']] ?? ''] ?? '') ?: 'Nobody on the rota',
                   ['n', (string)(int)($s['c'] ?? 0)], $s ? gmdate('D H:i', strtotime((string)$s['last'])) : '—', $expired ? ['s', 'Expired', 'warn'] : ['s', 'Online', 'ok']]];
    }
    return ['rows' => $rows];
}
function cp_sec_rota(array $x): array {
    $rows = [];
    foreach (cp_rota_rows($x) as $r) {
        $st = $r['who'] === '' ? ['s', 'Unfilled', 'bad'] : ($r['cleared'] ? ['s', 'Confirmed', 'ok'] : ['s', 'Not cleared', 'warn']);
        $rows[] = ['id' => $r['id'], 'cells' => [['p', gmdate('D j M', strtotime($r['date'])), ''], $r['centre'], $r['start'] . '–' . $r['end'], $r['who'] ?: '—', $st], 'stored' => $r['stored']];
    }
    $pool = [];
    foreach (db_all("SELECT volunteerId, fullName, safeguarding, centre FROM volunteers WHERE status = 'active' AND COALESCE(programme,'') <> 'summer' ORDER BY fullName") as $v)
        if (!$x['scoped'] || cp_covers($x, (string)$v['centre'])) $pool[] = ['v' => (string)$v['volunteerId'], 'l' => (string)$v['fullName'] . ((string)$v['safeguarding'] === 'cleared' ? '' : ' · not cleared'), 'bad' => (string)$v['safeguarding'] !== 'cleared'];
    return ['rows' => $rows, 'pool' => $pool];
}
function cp_sec_volunteers(array $x): array {
    $r = backend_dispatch('admin.volunteers.list', ['requesterId' => $x['me'], 'programme' => 'ngg']);
    if (empty($r['ok'])) return ['error' => $r['error'] ?? 'failed'];
    $avail = []; foreach (db_all("SELECT volunteerId, availability FROM mentors WHERE COALESCE(volunteerId,'') <> ''") as $m) $avail[(string)$m['volunteerId']] = (string)$m['availability'];
    $rows = [];
    foreach ((array)($r['pending'] ?? []) as $a) {
        if ($x['scoped'] && !cp_covers($x, (string)$a['centre'])) continue;
        $rows[] = ['id' => 'A:' . $a['id'], 'cells' => [['p', (string)$a['name'], (string)$a['email']], ucfirst((string)$a['role']), '—', ['s', 'Not started', 'bad'], cp_ago((string)$a['createdAt'])], 'app' => true];
    }
    foreach ((array)($r['volunteers'] ?? []) as $v) {
        if ((string)$v['status'] !== 'active') continue;
        if ($x['scoped'] && !cp_covers($x, (string)$v['centre'])) continue;
        $sg = (string)$v['safeguarding'];
        $st = $sg === 'cleared' ? ['s', 'Cleared', 'ok'] : ($sg === 'in_progress' ? ['s', 'In progress', 'warn'] : ['s', 'Not started', 'bad']);
        $rows[] = ['id' => 'V:' . $v['volunteerId'], 'cells' => [['p', (string)$v['fullName'], (string)$v['email']], ucfirst((string)$v['role']), ($avail[(string)$v['volunteerId']] ?? '') ?: '—', $st, cp_ago((string)$v['createdAt'])],
                   'sg' => $sg, 'app' => false];
    }
    usort($rows, static fn($a, $b) => ['bad' => 0, 'warn' => 1, 'ok' => 2][$a['cells'][3][2]] <=> ['bad' => 0, 'warn' => 1, 'ok' => 2][$b['cells'][3][2]]);
    return ['rows' => $rows];
}
/** Counts only — who did how much, where. The audit trail itself stays with `audit`. */
function cp_sec_staffact(array $x): array {
    $area = ['timetable' => 'Timetable', 'gate' => 'Check-in desks', 'checkin' => 'Check-in desks', 'attendance' => 'Duty rota', 'club' => 'Roster', 'member' => 'Roster',
             'members' => 'Roster', 'consent' => 'Permissions', 'volunteer' => 'Volunteers', 'mentor' => 'Mentorship', 'ms' => 'Mentorship', 'behaviour' => 'Behaviour',
             'family' => 'Families', 'families' => 'Families', 'approval' => 'Approvals', 'tournament' => 'Tournaments', 'ids' => 'ID cards', 'card' => 'ID cards',
             'application' => 'Applications', 'curriculum' => 'Curriculum'];
    $staff = db_all("SELECT memberId, fullName, role, centreScope FROM members WHERE role IN ('super_admin','admin','club_admin','centre_lead') AND COALESCE(status,'') NOT IN ('suspended','deleted','merged')");
    $since = gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400);
    $rows = [];
    foreach ($staff as $s) {
        if ($x['scoped']) {
            $theirs = (array)(safe_json((string)$s['centreScope']) ?: []);
            $mine = array_map(static fn($c) => (string)$c['centreId'], $x['centres']);
            if (!array_intersect($theirs, $mine) && (string)$s['memberId'] !== $x['me']) continue;
        }
        $n = 0; $by = []; $last = '';
        foreach (db_all('SELECT event, at FROM audit_log WHERE actorId = ? AND at >= ? ORDER BY at DESC LIMIT 2000', [(string)$s['memberId'], $since]) as $e) {
            $n++; if ($last === '') $last = (string)$e['at'];
            $k = strtolower(explode('.', (string)$e['event'])[0]); $by[$area[$k] ?? 'Elsewhere'] = ($by[$area[$k] ?? 'Elsewhere'] ?? 0) + 1;
        }
        arsort($by);
        $rows[] = ['id' => (string)$s['memberId'], 'n' => $n, 'cells' => [['p', (string)$s['fullName'], (string)$s['memberId'] === $x['me'] ? 'You' : ''], admin_role_label((string)$s['role']),
                   ['n', (string)$n], $n ? (string)array_key_first($by) : '—', $last !== '' ? cp_last($last) : 'Not this week']];
    }
    usort($rows, static fn($a, $b) => $b['n'] <=> $a['n']);
    return ['rows' => $rows];
}

/* ── Decisions ──────────────────────────────────────────────────────────── */

/** admin.clubp.decide — one row action, through the op that owns the record. */
function admin_clubp_decide(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $sec = (string)($p['sec'] ?? ''); $id = (string)($p['id'] ?? ''); $act = (string)($p['act'] ?? '');
    $me = $x['me']; $ip = (string)($p['ip'] ?? '');
    $run = static fn(string $op, array $a) => backend_dispatch($op, array_merge(['requesterId' => $me, 'ip' => $ip], $a));
    switch ($sec) {
        case 'applications': {
            $a = db_row("SELECT id, centre, photoUrl, kind, program FROM applications WHERE id = ?", [(int)$id]);
            if (!$a || (string)$a['kind'] !== 'teen' || (string)$a['program'] === 'summer') return ['ok' => false, 'error' => 'not_found'];
            if (!cp_covers($x, (string)$a['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
            if ($act === 'accept') {
                if ((string)$a['photoUrl'] === '') return ['ok' => false, 'error' => 'needs_photo', 'message' => 'Ask for a photo before accepting. ID cards need one.'];
                return $run('admin.application.convert', ['id' => (int)$id]);
            }
            if ($act === 'photo') {
                $url = trim((string)($p['url'] ?? ''));
                if ($url === '' || strlen($url) > 512 || !preg_match('#^(/|https?://|data:image/)#i', $url)) return ['ok' => false, 'error' => 'bad_photo', 'message' => 'That photo didn’t upload. Try again.'];
                return $run('admin.application.update', ['id' => (int)$id, 'data' => ['photoUrl' => $url]]);
            }
            if ($act === 'waitlist' || $act === 'reject') return $run('admin.applications.status', ['id' => (int)$id, 'status' => $act === 'reject' ? 'rejected' : 'waitlist']);
            break;
        }
        case 'approvals':
            if ($act === 'approve' || $act === 'decline') return $run('admin.approvals.decide', ['approvalId' => $id, 'decision' => $act === 'approve' ? 'approve' : 'reject',
                'reason' => (string)($p['note'] ?? '') ?: ($act === 'approve' ? 'Approved in the Club portal' : 'Declined in the Club portal')]);
            break;
        case 'requests': {
            $q = db_row('SELECT r.requestId, m.centre FROM member_requests r JOIN members m ON m.memberId = r.memberId WHERE r.requestId = ?', [$id]);
            if (!$q) return ['ok' => false, 'error' => 'not_found'];
            if (!cp_covers($x, (string)$q['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
            if ($act === 'approve' || $act === 'decline') {
                $who = (string)$x['req']['fullName'];
                return $run('admin.requests.decide', ['requestId' => $id, 'approve' => $act === 'approve',
                    'decision' => (string)($p['note'] ?? '') ?: ($act === 'approve' ? 'Approved by ' . $who : 'Declined by ' . $who . '. Ask at your centre if you’d like to know more.')]);
            }
            break;
        }
        case 'families':
            if ($act === 'approve' || $act === 'unlink') {
                $w = db_row('SELECT m.centre FROM guardian_wards w JOIN members m ON m.memberId = w.memberId WHERE w.linkId = ?', [$id]);
                if (!$w) return ['ok' => false, 'error' => 'not_found'];
                if (!cp_covers($x, (string)$w['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
                return $run('admin.families.decide', ['action' => $act === 'approve' ? 'approve' : 'revoke', 'linkIds' => [$id],
                    'note' => (string)($p['note'] ?? '') ?: 'Unlinked in the Club portal']);
            }
            break;
        case 'idcards':
            if ($act === 'askphoto') {
                $m = db_row("SELECT centre FROM members WHERE memberId = ? AND type = 'NGG'", [$id]);
                if (!$m || !cp_covers($x, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
                return $run('admin.ids.photo.ask', ['items' => [['subjectType' => 'member', 'subjectId' => $id]], 'force' => !empty($p['force'])]);
            }
            break;
        case 'behaviour':
            if ($act === 'supported') {
                $b = db_row('SELECT m.centre FROM behaviour_logs b JOIN members m ON m.memberId = b.subjectId WHERE b.logId = ?', [$id]);
                if (!$b || !cp_covers($x, (string)$b['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
                return $run('admin.behaviour.review', ['logId' => $id]);
            }
            break;
        case 'conduct':
            if ($act === 'on' || $act === 'off') {
                if (!in_array('fees', member_effective_caps($x['req']), true) && !in_array(strtolower((string)$x['req']['role']), ['admin', 'super_admin', 'club_admin'], true))
                    return ['ok' => false, 'error' => 'forbidden', 'message' => 'A centre lead can’t change the Club’s fine rules.'];
                $n = db_update('conduct_rules', ['active' => $act === 'on' ? 1 : 0, 'updatedAt' => now_iso()], ['ruleId' => $id]);
                if (!$n) return ['ok' => false, 'error' => 'not_found'];
                audit('club.rule.' . $act, $me, $id, []);
                return ['ok' => true];
            }
            break;
        case 'desks':
            if ($act === 'close') {
                $g = db_row("SELECT centreId FROM gate_links WHERE gateId = ? AND kind = 'desk'", [$id]);
                if (!$g || !in_array((string)$g['centreId'], array_map(static fn($c) => (string)$c['centreId'], $x['centres']), true)) return ['ok' => false, 'error' => 'out_of_scope'];
                return $run('admin.gates.revoke', ['gateId' => $id]);
            }
            break;
        case 'rota': {
            [$date, $centre] = array_pad(explode('|', $id, 2), 2, '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !cp_covers($x, $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
            if ($act === 'fill') {
                $r = $run('admin.attendance.duty.set', ['date' => $date, 'centre' => $centre, 'volunteerId' => (string)($p['who'] ?? ''), 'noBoard' => true]);
                if (!empty($r['ok'])) cp_rota_times($date, $centre);
                if (($r['error'] ?? '') === 'not_cleared') $r['message'] = 'They aren’t cleared to work with children yet. Choose someone who is.';
                return $r;
            }
            if ($act === 'remove') {
                if (!admin_cap_gate(['requesterId' => $me], 'checkin')['ok']) return ['ok' => false, 'error' => 'forbidden'];
                db_exec('DELETE FROM attendance_duty WHERE date = ? AND centre = ?', [$date, $centre]);
                audit('attendance.duty.remove', $me, $centre, ['date' => $date]);
                return ['ok' => true];
            }
            break;
        }
        case 'volunteers': {
            [$kind, $vid] = array_pad(explode(':', $id, 2), 2, '');
            if ($kind === 'A') {
                if ($act === 'decline') return $run('admin.volunteers.decline', ['id' => $vid, 'reason' => (string)($p['note'] ?? '') ?: 'Not taken forward from the Club portal']);
                if ($act === 'start' || $act === 'clear') {
                    $r = $run('admin.volunteers.approve', ['id' => $vid]);
                    if (empty($r['ok'])) return $r;
                    $newId = (string)($r['volunteer']['volunteerId'] ?? '');
                    return $newId !== '' ? $run('admin.volunteers.safeguard', ['volunteerId' => $newId, 'status' => $act === 'clear' ? 'cleared' : 'in_progress']) : $r;
                }
            } elseif ($kind === 'V') {
                $v = db_row('SELECT centre FROM volunteers WHERE volunteerId = ?', [$vid]);
                if (!$v || ($x['scoped'] && !cp_covers($x, (string)$v['centre']))) return ['ok' => false, 'error' => 'out_of_scope'];
                if ($act === 'start' || $act === 'clear') return $run('admin.volunteers.safeguard', ['volunteerId' => $vid, 'status' => $act === 'clear' ? 'cleared' : 'in_progress']);
                if ($act === 'decline') return $run('admin.volunteers.safeguard', ['volunteerId' => $vid, 'status' => 'pending']);
            }
            break;
        }
    }
    return ['ok' => false, 'error' => 'bad_act'];
}
/** A filled shift keeps the centre's hours unless it already has its own. */
function cp_rota_times(string $date, string $centre, string $start = '', string $end = ''): void {
    $c = db_row('SELECT meetTime FROM centres WHERE name = ?', [$centre]);
    $win = $c && function_exists('tt_centre_window') ? tt_centre_window((string)$c['meetTime']) : null;
    $have = db_row('SELECT startTime, endTime FROM attendance_duty WHERE date = ? AND centre = ?', [$date, $centre]);
    if (!$have) return;
    $s = $start !== '' ? $start : ((string)$have['startTime'] !== '' ? (string)$have['startTime'] : ($win ? tt_hhmm($win[0]) : '09:00'));
    $e = $end !== '' ? $end : ((string)$have['endTime'] !== '' ? (string)$have['endTime'] : ($win ? tt_hhmm($win[1]) : '14:00'));
    db_update('attendance_duty', ['startTime' => $s, 'endTime' => $e], ['date' => $date, 'centre' => $centre]);
}

/* ── Forms ──────────────────────────────────────────────────────────────── */

/** admin.clubp.create — the "Add …" forms. Validated whole before any write. */
function admin_clubp_create(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $form = (string)($p['form'] ?? ''); $v = is_array($p['vals'] ?? null) ? $p['vals'] : [];
    $me = $x['me']; $ip = (string)($p['ip'] ?? '');
    $run = static fn(string $op, array $a) => backend_dispatch($op, array_merge(['requesterId' => $me, 'ip' => $ip], $a));
    $pick = static fn($s) => (string)(explode('|', (string)$s)[1] ?? '');
    $t = static fn($k) => trim((string)($v[$k] ?? ''));
    switch ($form) {
        case 'member': {
            $name = $t('name'); $centre = $t('centre'); $course = $t('course'); $dob = $t('dob'); $gname = $t('guardian'); $contact = $t('contact');
            if ($name === '' || $centre === '' || $course === '' || $dob === '' || $gname === '' || $contact === '') return ['ok' => false, 'error' => 'missing_fields'];
            if (!cp_covers($x, $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
            $age = (time() - strtotime($dob)) / 31557600;
            if (!strtotime($dob) || $age < 8 || $age > 19) return ['ok' => false, 'error' => 'bad_age', 'message' => 'NGG is for ages 8 to 19.'];
            $isEmail = str_contains($contact, '@');
            if ($isEmail && !filter_var($contact, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_contact'];
            $r = $run('admin.members.upsert', ['data' => ['fullName' => $name, 'type' => 'NGG', 'status' => 'active', 'centre' => $centre, 'track' => $course, 'dob' => $dob,
                'parentName' => $gname, 'parentEmail' => $isEmail ? strtolower($contact) : '', 'parentPhone' => $isEmail ? '' : $contact, 'joinDate' => gmdate('Y-m-d')]]);
            if (empty($r['ok'])) return $r;
            $mid = (string)($r['memberId'] ?? '');
            $sent = $isEmail && $mid !== '' ? !empty(admin_clubp_consent_link(['requesterId' => $me, 'memberId' => $mid])['ok']) : false;
            $disp = (string)(db_row('SELECT displayId FROM members WHERE memberId = ?', [$mid])['displayId'] ?? '');
            return ['ok' => true, 'memberId' => $mid, 'displayId' => $disp ?: $mid, 'consentSent' => $sent];
        }
        case 'families': {
            $mid = $pick($v['child'] ?? ''); $email = strtolower($t('contact')); $gname = $t('guardian');
            $rel = strtolower($t('rel')); $reason = $t('reason');
            $m = db_row("SELECT memberId, centre, fullName FROM members WHERE memberId = ? AND type = 'NGG'", [$mid]);
            if (!$m) return ['ok' => false, 'error' => 'not_found'];
            if (!cp_covers($x, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
            if ($gname === '' || $email === '' || $reason === '') return ['ok' => false, 'error' => 'missing_fields'];
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email', 'message' => 'A guardian links by email, so they can sign in. Use their email address.'];
            $relMap = ['mother' => 'parent', 'father' => 'parent', 'guardian' => 'guardian', 'other' => 'relative'];
            $g = db_row('SELECT guardianId FROM guardians WHERE lower(email) = ?', [$email]);
            $gid = $g ? (string)$g['guardianId'] : 'GDN-' . strtoupper(rand_hex(5));
            if (!$g) db_insert('guardians', ['guardianId' => $gid, 'email' => $email, 'fullName' => $gname, 'phone' => '', 'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
            if (db_row("SELECT id FROM guardian_wards WHERE guardianId = ? AND memberId = ? AND status IN ('active','pending')", [$gid, $mid])) return ['ok' => false, 'error' => 'already_linked'];
            /* A second guardian, or a link confirmed only as "Other", waits for an admin. */
            $already = db_row("SELECT id FROM guardian_wards WHERE memberId = ? AND status = 'active'", [$mid]);
            $pending = $already || $reason === 'Other';
            db_insert('guardian_wards', ['linkId' => 'GW-' . strtoupper(rand_hex(5)), 'guardianId' => $gid, 'memberId' => $mid, 'relationship' => $relMap[$rel] ?? 'guardian',
                'status' => $pending ? 'pending' : 'active', 'via' => 'staff', 'notify' => 1, 'note' => 'Confirmed by staff: ' . $reason,
                'decidedBy' => $pending ? '' : $me, 'decidedAt' => $pending ? '' : now_iso(), 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
            audit('family.link.staff', $me, $mid, ['guardian' => $email, 'pending' => $pending]);
            return ['ok' => true, 'pending' => $pending];
        }
        case 'mentorship': {
            $mid = $pick($v['mentee'] ?? ''); $mentorId = $t('mentor');
            $m = db_row("SELECT centre FROM members WHERE memberId = ? AND type = 'NGG'", [$mid]);
            if (!$m || !cp_covers($x, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
            return $run('admin.mentor.assign', ['memberId' => $mid, 'mentorId' => $mentorId]);
        }
        case 'behaviour': {
            $mid = $pick($v['member'] ?? ''); $signal = $t('signal');
            $m = db_row("SELECT centre FROM members WHERE memberId = ? AND type = 'NGG'", [$mid]);
            if (!$m || !cp_covers($x, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
            $status = $t('status'); $trend = $t('trend');
            $sev = $status === 'Needs a call' ? 'urgent' : ($status === 'Watching' ? 'concern' : 'info');
            return $run('admin.behaviour.log', ['subjectId' => $mid, 'note' => $signal . ($trend !== '' ? ' (' . strtolower($trend) . ')' : ''), 'severity' => $sev, 'category' => 'wellbeing']);
        }
        case 'conduct': {
            $role = strtolower((string)$x['req']['role']);
            if (!in_array($role, ['admin', 'super_admin', 'club_admin'], true) && !in_array('fees', member_effective_caps($x['req']), true)) return ['ok' => false, 'error' => 'forbidden'];
            $name = $t('rule'); $amount = (int)($v['amount'] ?? 0); $cap = (int)($v['cap'] ?? 0);
            if ($name === '' || $amount <= 0 || $cap <= 0) return ['ok' => false, 'error' => 'missing_fields'];
            if ($amount > $cap) return ['ok' => false, 'error' => 'cap_below_fine', 'message' => 'The cap must be at least the fine.'];
            cp_rules_seed();
            $id = 'RULE-' . strtoupper(rand_hex(4));
            db_insert('conduct_rules', ['ruleId' => $id, 'reason' => '', 'name' => mb_substr($name, 0, 160), 'whenText' => mb_substr($t('when'), 0, 200), 'amount' => $amount,
                'capTerm' => $cap, 'active' => !empty($v['on']) ? 1 : 0, 'createdBy' => $me, 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
            audit('club.rule.create', $me, $id, ['name' => $name]);
            return ['ok' => true, 'ruleId' => $id];
        }
        case 'curriculum': {
            $name = $t('name'); $div = $t('div');
            if ($name === '' || $div === '') return ['ok' => false, 'error' => 'missing_fields'];
            $divs = function_exists('club_divisions') ? club_divisions() : [];
            $cat = []; $found = false;
            foreach ($divs as $d) {
                $courses = $d['courses'];
                foreach ($courses as $c) if (strcasecmp($c, $name) === 0) return ['ok' => false, 'error' => 'exists', 'message' => 'A course with that name already exists.'];
                if (stripos($d['name'], $div) !== false || stripos($div, (string)($d['short'] ?? '#')) !== false) { $courses[] = $name; $found = true; }
                $cat[] = ['faculty' => $d['name'], 'courses' => $courses, 'icon' => $d['icon'] ?? '', 'short' => $d['short'] ?? '', 'blurb' => $d['blurb'] ?? ''];
            }
            if (!$found) return ['ok' => false, 'error' => 'bad_division'];
            return $run('admin.club.catalogue.set', ['catalogue' => $cat]);
        }
        case 'rota': {
            $date = $t('date'); $centre = $t('centre'); $start = $t('start'); $end = $t('end'); $who = $t('who');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $centre === '' || $start === '' || $end === '') return ['ok' => false, 'error' => 'missing_fields'];
            if (!cp_covers($x, $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
            if ($end <= $start) return ['ok' => false, 'error' => 'bad_time', 'message' => 'It must end after it starts.'];
            if (!admin_cap_gate(['requesterId' => $me], 'checkin')['ok']) return ['ok' => false, 'error' => 'forbidden'];
            if ($who === '') return ['ok' => false, 'error' => 'missing_fields', 'message' => 'Choose who is on duty. A shift with nobody on it shows as unfilled on its own.'];
            $r = $run('admin.attendance.duty.set', ['date' => $date, 'centre' => $centre, 'volunteerId' => $who, 'noBoard' => true]);
            if (empty($r['ok'])) { if (($r['error'] ?? '') === 'not_cleared') $r['message'] = 'They aren’t cleared to work with children yet. Choose someone who is.'; return $r; }
            cp_rota_times($date, $centre, $start, $end);
            return ['ok' => true];
        }
        case 'desks': {
            $name = $t('name'); $centre = $t('centre');
            $c = null; foreach ($x['centres'] as $cc) if ((string)$cc['name'] === $centre || (string)$cc['centreId'] === $centre) $c = $cc;
            if ($name === '' || !$c) return ['ok' => false, 'error' => 'missing_fields'];
            $dev = $t('device');
            $r = $run('admin.gates.create', ['kind' => 'desk', 'name' => $name . ($dev !== '' ? ' · ' . $dev : ''), 'centreId' => (string)$c['centreId'], 'generate' => true, 'validDays' => 365]);
            return $r;
        }
    }
    return ['ok' => false, 'error' => 'bad_form'];
}

/* ── Announcements ──────────────────────────────────────────────────────── */

function cp_ann_row(array $a): array {
    return ['id' => (string)$a['annId'], 'title' => (string)$a['title'], 'body' => (string)$a['body'], 'aud' => (string)$a['aud'], 'centre' => (string)$a['centre'],
            'ch' => array_values(array_filter((array)(safe_json((string)$a['channels']) ?: ['app']))), 'status' => (string)$a['status'],
            'by' => (string)$a['byName'], 'byId' => (string)$a['byId'], 'approvedBy' => (string)$a['approvedByName'], 'note' => (string)$a['note'],
            'sendAtIso' => (string)$a['sendAt'], 'sendAt' => (string)$a['sendAt'] !== '' && (string)$a['status'] === 'scheduled' ? gmdate('D j M, H:i', strtotime((string)$a['sendAt']) + 3600) : '',
            'at' => cp_ago((string)($a['sentAt'] ?: $a['updatedAt'])), 'stats' => safe_json((string)$a['stats']) ?: null, 'smsBody' => (string)($a['smsBody'] ?? '')];
}
/** The channels a new announcement starts with: the app (members, and
 *  guardians in their family account) and email, plus Telegram when the site
 *  has a bot. SMS costs money per text, so it is a choice, not a default. */
function cp_ann_default_channels(): array {
    return array_merge(['app', 'email'], function_exists('telegram_on') && telegram_on() ? ['telegram'] : []);
}
/** A stored phone (08031234567, 234803…) as the E.164 Telegram links are keyed by. */
function cp_ann_e164(string $ph): string { return function_exists('sms_normalize') ? sms_normalize($ph) : telegram_phone_e164($ph); }
/** The text an SMS of this announcement would carry, without a short version. */
function cp_ann_sms_full(string $title, string $body): string { return 'NGG: ' . trim($title) . '. ' . trim($body); }

/**
 * The facts a shortened text must not lose: every number (dates, times,
 * amounts, phone numbers, ages), every day and month named, every link and
 * email address. Returns [normalised key => as written]. A shortened SMS that
 * is missing any of the original's keys has removed core information.
 */
function cp_ann_facts(string $t): array {
    $out = [];
    $t = preg_replace('/(?<=\d),(?=\d{3}\b)/u', '', $t);                       // 5,000 → 5000
    if (preg_match_all('~\bhttps?://[^\s<>"]+|\bwww\.[^\s<>"]+~iu', $t, $m)) foreach ($m[0] as $u) { $u = rtrim($u, '.,;:)!?'); $out['url:' . strtolower(preg_replace('~^https?://~i', '', $u))] = $u; }
    if (preg_match_all('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu', $t, $m)) foreach ($m[0] as $e) $out['email:' . strtolower($e)] = $e;
    $noLinks = preg_replace(['~\bhttps?://[^\s<>"]+|\bwww\.[^\s<>"]+~iu', '/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu'], ' ', $t);
    if (preg_match_all('/\d+/u', $noLinks, $m)) foreach ($m[0] as $n) { $k = ltrim($n, '0') ?: '0'; $out['n:' . $k] = $n; }
    static $named = null;
    if ($named === null) {
        $named = ['today' => 'today', 'tomorrow' => 'tomorrow', 'tonight' => 'tonight', 'tues' => 'tue', 'thur' => 'thu', 'thurs' => 'thu', 'sept' => 'sep'];
        foreach (['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'june',
                  'july', 'august', 'september', 'october', 'november', 'december'] as $w) { $named[$w] = substr($w, 0, 3); $named[substr($w, 0, 3)] = substr($w, 0, 3); }
    }
    if (preg_match_all('/\b[A-Za-z]+\b/u', $noLinks, $m)) foreach ($m[0] as $w) {
        $lw = strtolower($w);
        if (isset($named[$lw])) $out['d:' . $named[$lw]] = $w;
    }
    // "May" is a month only beside a day number ("3 May", "May 3rd"), not in "you may".
    if (preg_match('/\bmay\s+\d|\d(?:st|nd|rd|th)?\s+may\b/iu', $noLinks, $mm)) $out['d:may'] = 'May';
    return $out;
}
/** The facts of $long that $short has lost, as written in $long. */
function cp_ann_lost_facts(string $long, string $short): array {
    return array_values(array_diff_key(cp_ann_facts($long), cp_ann_facts($short)));
}
function cp_is_approver(array $req): bool { return in_array(strtolower((string)$req['role']), ['admin', 'super_admin'], true); }

/** The people an announcement reaches, de-duplicated by member and by guardian contact. */
function cp_ann_audience(array $x, string $aud, string $centre): array {
    [$inSql, $inArgs] = cp_in($x);
    $where = "type = 'NGG' AND status = 'active' AND COALESCE(role,'') NOT IN " . CP_STAFF_ROLES_SQL . " AND $inSql";
    $args = $inArgs;
    if ($centre !== 'all') { $where .= ' AND centre = ?'; $args[] = $centre; }
    $members = db_all("SELECT memberId, email, phone, parentEmail, parentPhone, fullName FROM members WHERE $where", $args);
    $gEmails = []; $gPhones = []; $gIds = []; $mPhones = [];
    if ($aud !== 'guardians') foreach ($members as $m) { $ph = preg_replace('/\D+/', '', (string)$m['phone']); if (strlen((string)$ph) >= 10) $mPhones[$ph] = true; }
    if ($aud !== 'members') {
        foreach ($members as $m) {
            $e = strtolower(trim((string)$m['parentEmail'])); if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL)) $gEmails[$e] = true;
            $ph = preg_replace('/\D+/', '', (string)$m['parentPhone']); if (strlen((string)$ph) >= 10) $gPhones[$ph] = true;
        }
        $ids = array_column($members, 'memberId');
        foreach (array_chunk($ids, 400) as $ch) foreach (db_all("SELECT g.guardianId, g.email, g.phone FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId WHERE w.status = 'active' AND COALESCE(g.status,'active') = 'active' AND w.memberId IN ("
                . implode(',', array_fill(0, count($ch), '?')) . ')', $ch) as $g) {
            $gIds[(string)$g['guardianId']] = true;
            $e = strtolower(trim((string)$g['email'])); if ($e !== '') $gEmails[$e] = true;
            $ph = preg_replace('/\D+/', '', (string)$g['phone']); if (strlen((string)$ph) >= 10) $gPhones[$ph] = true;
        }
    }
    return ['members' => $aud === 'guardians' ? [] : $members, 'emails' => array_keys($gEmails), 'phones' => array_keys($gPhones),
            'guardianIds' => array_keys($gIds), 'memberPhones' => array_keys(array_diff_key($mPhones, $gPhones)),
            'reach' => ($aud === 'guardians' ? 0 : count($members)) + ($aud === 'members' ? 0 : max(count($gEmails), count($gPhones)))];
}

/** admin.clubp.ann.list — the announcements this person can see, with reach. */
function admin_clubp_ann_list(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $rows = [];
    foreach (db_all('SELECT * FROM club_announcements ORDER BY updatedAt DESC LIMIT 300') as $a) {
        if ((string)$a['centre'] !== 'all' && !cp_covers($x, (string)$a['centre'])) continue;
        if ($x['scoped'] && (string)$a['centre'] === 'all' && (string)$a['byId'] !== $x['me']) continue;
        $r = cp_ann_row($a); $r['reach'] = cp_ann_audience($x, $r['aud'], $r['centre'])['reach'];
        $rows[] = $r;
    }
    return ['ok' => true, 'announcements' => $rows, 'canApprove' => cp_is_approver($x['req']), 'smsOn' => function_exists('sms_enabled') && sms_enabled(),
            'tgOn' => function_exists('telegram_on') && telegram_on(), 'aiOn' => function_exists('ai_enabled') && ai_enabled(), 'defaultCh' => cp_ann_default_channels(), 'smsChars' => CP_ANN_SMS_CHARS];
}
/** admin.clubp.ann.reach — reach and SMS phones for a draft, for the editor. */
function admin_clubp_ann_reach(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $aud = in_array($p['aud'] ?? '', ['guardians', 'members', 'both'], true) ? (string)$p['aud'] : 'guardians';
    $centre = (string)($p['centre'] ?? 'all');
    if ($centre !== 'all' && !cp_covers($x, $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
    $a = cp_ann_audience($x, $aud, $centre);
    $tg = 0;
    if (function_exists('telegram_on') && telegram_on() && function_exists('telegram_link_for'))
        foreach (array_merge($a['phones'], $a['memberPhones']) as $ph) if (telegram_link_for(cp_ann_e164($ph))) $tg++;
    return ['ok' => true, 'reach' => $a['reach'], 'phones' => count($a['phones']), 'emails' => count($a['emails']), 'members' => count($a['members']),
            'familyApp' => count($a['guardianIds']), 'telegram' => $tg];
}

/** Why these channels can reach nobody in this audience, or ''. Every
 *  channel reaches a guardian now — App lands in their family account — and
 *  members get no SMS (a member's own phone is reached by Telegram only). */
function cp_ann_unreachable(string $aud, array $chs): string {
    $toM = $aud !== 'guardians';
    if ($aud !== 'members' && array_intersect(['app', 'email', 'sms', 'telegram'], $chs)) return '';
    if ($toM && array_intersect(['app', 'email', 'telegram'], $chs)) return '';
    return 'Members don’t get SMS. Add App or Email to reach them.';
}
/** How many of this audience the channels actually reach — 0 is refused,
 *  never sent to nobody. Members' email, app and Telegram; guardians' family
 *  accounts, emails, phones and Telegram. */
function cp_ann_reachable(array $aud, array $chs): int {
    $n = 0; $on = static fn($c) => in_array($c, $chs, true);
    if ($on('app')) $n += count($aud['members']) + count($aud['guardianIds']);
    if ($on('email')) { $n += count($aud['emails']); foreach ($aud['members'] as $m) if (filter_var(trim((string)$m['email']), FILTER_VALIDATE_EMAIL)) $n++; }
    if ($on('sms') && function_exists('sms_enabled') && sms_enabled()) $n += count($aud['phones']);
    if ($on('telegram') && function_exists('telegram_on') && telegram_on())
        foreach (array_merge($aud['phones'], $aud['memberPhones']) as $ph) if (telegram_link_for(cp_ann_e164($ph))) $n++;
    return $n;
}
function cp_ann_nobody(array $chs): string {
    $l = array_map(static fn($c) => ['app' => 'the app', 'email' => 'email', 'telegram' => 'Telegram', 'sms' => 'SMS'][$c] ?? $c, $chs);
    return 'Nobody in this audience can be reached by ' . implode(' or ', $l) . ' — no family accounts, addresses or connected phones. Add Email, or check the records.';
}

/**
 * The SMS rule, applied before anything is saved as ready to send. Returns
 * [channels, smsBody, note]. A text that fits goes as it is. One that does
 * not needs a short version that keeps every fact (cp_ann_lost_facts); without
 * one the SMS is dropped and email and Telegram carry the message instead — a
 * text is never cut off mid-sentence. `note` says what happened, or ''.
 */
function cp_ann_sms_rule(string $title, string $body, array $chs, string $smsBody): array {
    if (!in_array('sms', $chs, true)) return [$chs, '', ''];
    if (mb_strlen(cp_ann_sms_full($title, $body)) <= CP_ANN_SMS_CHARS) return [$chs, '', ''];
    $smsBody = trim($smsBody);
    if ($smsBody !== '' && mb_strlen('NGG: ' . $smsBody) <= CP_ANN_SMS_CHARS && !cp_ann_lost_facts($title . ' ' . $body, $smsBody)) return [$chs, $smsBody, ''];
    $alt = array_values(array_unique(array_merge(array_diff($chs, ['sms']), ['email'], function_exists('telegram_on') && telegram_on() ? ['telegram'] : [])));
    $why = $smsBody === '' ? 'too long for a text, with no short version' : (mb_strlen('NGG: ' . $smsBody) > CP_ANN_SMS_CHARS ? 'too long for a text, and the short version is too' : 'too long for a text, and the short version leaves out ' . implode(', ', cp_ann_lost_facts($title . ' ' . $body, $smsBody)));
    return [$alt, '', 'SMS dropped: the message is ' . $why . '. It goes by ' . implode(', ', array_map(static fn($c) => ['app' => 'the app', 'email' => 'email', 'telegram' => 'Telegram', 'sms' => 'SMS'][$c], $alt)) . ' instead.'];
}

/**
 * admin.clubp.ann.shorten — an SMS version of a long announcement, by AI,
 * checked: every number, day, month, link and email in the original must be
 * in it, and it must fit two texts. One retry names what was lost; a second
 * failure is refused (lost_facts), and the editor offers email and Telegram,
 * which carry the whole message. A person approves the short version with the
 * announcement — nothing AI writes is sent unread.
 */
function admin_clubp_ann_shorten(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $title = trim((string)($p['title'] ?? '')); $body = trim((string)($p['body'] ?? ''));
    if ($body === '') return ['ok' => false, 'error' => 'incomplete', 'message' => 'Write the message first.'];
    if (mb_strlen(cp_ann_sms_full($title, $body)) <= CP_ANN_SMS_CHARS) return ['ok' => true, 'text' => '', 'fits' => true];
    $fallback = array_values(array_unique(array_merge(['email'], function_exists('telegram_on') && telegram_on() ? ['telegram'] : [])));
    if (!function_exists('ai_enabled') || !ai_enabled()) return ['ok' => false, 'error' => 'ai_off', 'fallback' => $fallback,
        'message' => 'AI isn’t set up on this site, so it can’t shorten the text. Write a short version yourself, or send by email and Telegram, which carry the whole message.'];
    $limit = CP_ANN_SMS_CHARS - 5 - 6;
    $sys = 'You shorten announcements from a youth club to parents into ONE SMS. At most ' . $limit . ' characters. Keep EVERY date, day, time, place, amount of money, phone number, link and email, and what the family must do. '
         . 'Drop greetings, sign-offs and explanation. Plain text, no emojis, no quotation marks, no "NGG:" prefix. Reply with the SMS only.';
    $facts = cp_ann_facts($title . ' ' . $body); $lost = [];
    for ($try = 0; $try < 2; $try++) {
        $msg = 'Title: ' . $title . "\nMessage: " . $body . ($lost ? "\nYour last version left out: " . implode(', ', $lost) . '. Put them back and keep it under ' . $limit . ' characters.' : '');
        $r = ai_complete($sys, $msg, 220);
        if (empty($r['ok'])) return ['ok' => false, 'error' => 'ai_failed', 'fallback' => $fallback, 'message' => 'The AI didn’t answer. Write a short version yourself, or send by email and Telegram.'];
        $t = trim(preg_replace('/\s+/u', ' ', trim((string)$r['text'], " \t\n\r\"'“”")));
        $t = preg_replace('/^NGG:\s*/i', '', $t);
        $lost = cp_ann_lost_facts($title . ' ' . $body, $t);
        if (!$lost && $t !== '' && mb_strlen('NGG: ' . $t) <= CP_ANN_SMS_CHARS) {
            audit('club.ann.shorten', $x['me'], '', ['from' => mb_strlen($body), 'to' => mb_strlen($t)]);
            return ['ok' => true, 'text' => $t, 'kept' => array_values($facts)];
        }
        if (!$lost) $lost = ['(it was ' . mb_strlen($t) . ' characters)'];
    }
    return ['ok' => false, 'error' => 'lost_facts', 'fallback' => $fallback, 'lost' => $lost,
        'message' => 'The AI couldn’t fit it in a text without leaving out ' . implode(', ', $lost) . '. Write a short version yourself, or send by email and Telegram, which carry the whole message.'];
}

/** Send one announcement now. Reports what actually went. */
function cp_ann_send(array $x, array $a): array {
    $ch = (array)(safe_json((string)$a['channels']) ?: ['app']);
    $aud = cp_ann_audience($x, (string)$a['aud'], (string)$a['centre']);
    $title = (string)$a['title']; $body = (string)$a['body'];
    $stats = ['app' => 0, 'family' => 0, 'email' => 0, 'telegram' => 0, 'sms' => 0, 'emailSkipped' => 0, 'smsSkipped' => 0, 'telegramSkipped' => 0, 'smsDropped' => 0];
    if (in_array('app', $ch, true)) {
        foreach ($aud['members'] as $m) { try { push_notification((string)$m['memberId'], ['kind' => 'announcement', 'title' => $title, 'body' => $body, 'linkPage' => 'dashboard']); $stats['app']++; } catch (Throwable $e) {} }
        // Guardians with a family account: one notice each, however many children.
        foreach ($aud['guardianIds'] as $gid) if (family_notice_add($gid, 'announcement', (string)$a['annId'], $title, $body, (string)($a['approvedByName'] ?: $a['byName']))) $stats['family']++;
    }
    /* Telegram carries the whole message, free. A phone it reaches is not also
       texted, so a guardian with both on gets it once. */
    $tgDone = [];
    if (in_array('telegram', $ch, true) && function_exists('telegram_on') && telegram_on()) {
        $phones = array_merge($aud['phones'], $aud['memberPhones']);
        foreach (array_slice($phones, 0, CP_ANN_TG_MAX) as $ph) {
            $r = telegram_send_to_phone(cp_ann_e164($ph), $title . "\n\n" . $body);
            if (!empty($r['ok'])) { $stats['telegram']++; $tgDone[$ph] = true; }
        }
        $stats['telegramSkipped'] = max(0, count($phones) - CP_ANN_TG_MAX);
    }
    if (in_array('email', $ch, true) && function_exists('send_mail') && function_exists('email_template')) {
        $to = $aud['emails'];
        foreach ($aud['members'] as $m) { $e = strtolower(trim((string)$m['email'])); if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL)) $to[] = $e; }
        $to = array_values(array_unique($to));
        $html = email_template(['title' => $title, 'eyebrow' => 'NGG Club', 'bodyHtml' => '<p style="margin:0 0 10px">' . nl2br(esc_html($body)) . '</p>']);
        foreach (array_slice($to, 0, CP_ANN_EMAIL_MAX) as $e) if (@send_mail($e, $title, $html)) $stats['email']++;
        $stats['emailSkipped'] = max(0, count($to) - CP_ANN_EMAIL_MAX);
    }
    if (in_array('sms', $ch, true) && function_exists('sms_enabled') && sms_enabled() && function_exists('sms_send')) {
        $full = cp_ann_sms_full($title, $body); $short = trim((string)($a['smsBody'] ?? ''));
        $text = mb_strlen($full) <= CP_ANN_SMS_CHARS ? $full : ($short !== '' ? 'NGG: ' . $short : '');
        if ($text === '') $stats['smsDropped'] = count($aud['phones']);   // never truncated; saved rows were checked, this is the belt
        else {
            $to = array_values(array_filter($aud['phones'], static fn($ph) => !isset($tgDone[$ph])));
            foreach (array_slice($to, 0, CP_ANN_SMS_MAX) as $ph) { $r = sms_send($ph, $text); if (!empty($r['ok'])) $stats['sms']++; }
            $stats['smsSkipped'] = max(0, count($to) - CP_ANN_SMS_MAX);
        }
    }
    db_update('club_announcements', ['status' => 'sent', 'sentAt' => now_iso(), 'stats' => json_encode($stats), 'updatedAt' => now_iso()], ['annId' => (string)$a['annId']]);
    return $stats;
}

/**
 * admin.clubp.ann.save — every move an announcement makes.
 * actions: draft · submit · approve · sendback · withdraw · delete. An admin's
 * submit is an approval of their own (send now or schedule); anybody else's
 * waits, and the admins are told.
 */
function admin_clubp_ann_save(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $act = (string)($p['action'] ?? ''); $d = is_array($p['ann'] ?? null) ? $p['ann'] : [];
    $isAdm = cp_is_approver($x['req']); $me = $x['me']; $myName = (string)$x['req']['fullName'];
    $id = (string)($d['id'] ?? '');
    $have = $id !== '' ? db_row('SELECT * FROM club_announcements WHERE annId = ?', [$id]) : null;
    if ($id !== '' && !$have) return ['ok' => false, 'error' => 'not_found'];
    if ($have && (string)$have['centre'] !== 'all' && !cp_covers($x, (string)$have['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $mine = !$have || (string)$have['byId'] === $me;
    if (in_array($act, ['approve', 'sendback'], true)) {
        if (!$isAdm) return ['ok' => false, 'error' => 'forbidden', 'message' => 'Only an admin approves announcements.'];
        if (!$have || (string)$have['status'] !== 'pending') return ['ok' => false, 'error' => 'not_pending'];
        if ($act === 'approve') {
            $hch = (array)(safe_json((string)$have['channels']) ?: ['app']);
            $why = cp_ann_unreachable((string)$have['aud'], $hch);
            if ($why === '' && cp_ann_reachable(cp_ann_audience($x, (string)$have['aud'], (string)$have['centre']), $hch) === 0) $why = cp_ann_nobody($hch);
            if ($why !== '') return ['ok' => false, 'error' => 'unreachable', 'message' => $why . ' Send it back with a note.'];
        }
        if ($act === 'sendback') {
            $note = trim((string)($p['note'] ?? '')); if ($note === '') return ['ok' => false, 'error' => 'note_required'];
            db_update('club_announcements', ['status' => 'changes', 'note' => mb_substr($note, 0, 600), 'updatedAt' => now_iso()], ['annId' => $id]);
            notify_people([db_row('SELECT memberId, email FROM members WHERE memberId = ?', [$have['byId']]) ?: []], ['kind' => 'approval', 'title' => 'Changes asked on “' . $have['title'] . '”',
                'body' => $note, 'linkPage' => 'club-admin', 'ctaPath' => '/club-admin', 'eyebrow' => 'NGG Club']);
            audit('club.ann.sendback', $me, $id, []);
            return ['ok' => true, 'announcement' => cp_ann_row(db_row('SELECT * FROM club_announcements WHERE annId = ?', [$id]))];
        }
        db_update('club_announcements', ['approvedById' => $me, 'approvedByName' => $myName, 'updatedAt' => now_iso(),
            'status' => (string)$have['sendAt'] !== '' && strtotime((string)$have['sendAt']) > time() ? 'scheduled' : 'pending'], ['annId' => $id]);
        $row = db_row('SELECT * FROM club_announcements WHERE annId = ?', [$id]);
        $stats = (string)$row['status'] === 'pending' ? cp_ann_send($x, $row) : null;
        notify_people([db_row('SELECT memberId, email FROM members WHERE memberId = ?', [$have['byId']]) ?: []], ['kind' => 'approval',
            'title' => '“' . $have['title'] . '” was approved', 'body' => $stats ? 'It has gone out.' : 'It goes out at the time you set.', 'linkPage' => 'club-admin', 'ctaPath' => '/club-admin', 'eyebrow' => 'NGG Club']);
        audit('club.ann.approve', $me, $id, ['stats' => $stats]);
        return ['ok' => true, 'stats' => $stats, 'announcement' => cp_ann_row(db_row('SELECT * FROM club_announcements WHERE annId = ?', [$id]))];
    }
    if ($act === 'withdraw') {
        if (!$have || !$mine || (string)$have['status'] !== 'pending') return ['ok' => false, 'error' => 'not_pending'];
        db_update('club_announcements', ['status' => 'draft', 'updatedAt' => now_iso()], ['annId' => $id]);
        return ['ok' => true];
    }
    if ($act === 'delete') {
        if (!$have || !in_array((string)$have['status'], ['draft', 'changes'], true) || (!$mine && !$isAdm)) return ['ok' => false, 'error' => 'not_editable'];
        db_exec('DELETE FROM club_announcements WHERE annId = ?', [$id]);
        audit('club.ann.delete', $me, $id, []);
        return ['ok' => true];
    }
    if (!in_array($act, ['draft', 'submit', 'unsend'], true)) return ['ok' => false, 'error' => 'bad_action'];
    if ($have && !in_array((string)$have['status'], ['draft', 'changes'], true)) return ['ok' => false, 'error' => 'not_editable'];
    if ($have && !$mine && !$isAdm) return ['ok' => false, 'error' => 'not_editable'];
    $centre = (string)($d['centre'] ?? 'all');
    if ($x['scoped'] && ($centre === 'all' || !cp_covers($x, $centre))) $centre = $x['names'][0] ?? '';
    if ($centre !== 'all' && !cp_covers($x, $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
    $chs = array_values(array_intersect(CP_ANN_CHANNELS, (array)($d['ch'] ?? [])));
    $sendAt = '';
    if (($d['when'] ?? 'asap') === 'later') { $t = strtotime((string)($d['sendAt'] ?? '')); if ($t) $sendAt = gmdate('Y-m-d\TH:i:s\Z', $t); }
    $row = ['title' => mb_substr(trim((string)($d['title'] ?? '')), 0, 200), 'body' => mb_substr(trim((string)($d['body'] ?? '')), 0, 4000),
            'aud' => in_array($d['aud'] ?? '', ['guardians', 'members', 'both'], true) ? (string)$d['aud'] : 'guardians', 'centre' => $centre,
            'channels' => json_encode($chs ?: cp_ann_default_channels()), 'sendAt' => $sendAt, 'updatedAt' => now_iso(),
            'smsBody' => mb_substr(trim((string)($d['smsBody'] ?? '')), 0, 600)];
    $smsNote = '';
    if ($act === 'submit') {
        [$chs, $row['smsBody'], $smsNote] = cp_ann_sms_rule($row['title'], $row['body'], $chs, $row['smsBody']);
        $row['channels'] = json_encode($chs);
        $errs = [];
        if ($row['title'] === '') $errs[] = 'title'; if ($row['body'] === '') $errs[] = 'body'; if (!$chs) $errs[] = 'channel';
        if (($d['when'] ?? 'asap') === 'later' && $sendAt === '') $errs[] = 'sendAt';
        if ($errs) return ['ok' => false, 'error' => 'incomplete', 'fields' => $errs];
        $why = cp_ann_unreachable($row['aud'], $chs);
        if ($why === '' && cp_ann_reachable(cp_ann_audience($x, $row['aud'], $centre), $chs) === 0) $why = cp_ann_nobody($chs);
        if ($why !== '') return ['ok' => false, 'error' => 'unreachable', 'message' => $why];
    }
    if ($have) db_update('club_announcements', $row, ['annId' => $id]);
    else { $id = 'ANN-' . strtoupper(rand_hex(5)); db_insert('club_announcements', $row + ['annId' => $id, 'status' => 'draft', 'byId' => $me, 'byName' => $myName, 'createdAt' => now_iso()]); }
    if ($act === 'draft') return ['ok' => true, 'announcement' => cp_ann_row(db_row('SELECT * FROM club_announcements WHERE annId = ?', [$id]))];
    if ($isAdm) {
        db_update('club_announcements', ['approvedById' => $me, 'approvedByName' => $myName, 'note' => '', 'status' => $sendAt !== '' && strtotime($sendAt) > time() ? 'scheduled' : 'pending'], ['annId' => $id]);
        $r = db_row('SELECT * FROM club_announcements WHERE annId = ?', [$id]);
        $stats = (string)$r['status'] === 'pending' ? cp_ann_send($x, $r) : null;
        audit('club.ann.send', $me, $id, ['stats' => $stats]);
        return ['ok' => true, 'stats' => $stats, 'smsNote' => $smsNote, 'announcement' => cp_ann_row(db_row('SELECT * FROM club_announcements WHERE annId = ?', [$id]))];
    }
    db_update('club_announcements', ['status' => 'pending', 'note' => ''], ['annId' => $id]);
    $admins = db_all("SELECT memberId, email FROM members WHERE role IN ('admin','super_admin') AND COALESCE(status,'') NOT IN ('suspended','deleted','merged') AND memberId <> ?", [$me]);
    notify_people($admins, ['kind' => 'approval', 'title' => 'An announcement is waiting for you', 'body' => $myName . ' wrote “' . $row['title'] . '”.',
        'linkPage' => 'club-admin', 'ctaPath' => '/club-admin', 'eyebrow' => 'NGG Club']);
    audit('club.ann.submit', $me, $id, []);
    return ['ok' => true, 'smsNote' => $smsNote, 'announcement' => cp_ann_row(db_row('SELECT * FROM club_announcements WHERE annId = ?', [$id]))];
}
/** Web-cron: send the scheduled announcements that are due. */
function cp_ann_due_tick(): int {
    $n = 0;
    foreach (db_all("SELECT * FROM club_announcements WHERE status = 'scheduled' AND sendAt <> '' AND sendAt <= ?", [gmdate('Y-m-d\TH:i:s\Z')]) as $a) {
        $approver = db_row('SELECT * FROM members WHERE memberId = ?', [$a['approvedById']]);
        if (!$approver) continue;
        $x = cp_ctx(['requesterId' => (string)$approver['memberId']]);
        if (empty($x['ok'])) continue;
        cp_ann_send($x, $a); $n++;
    }
    return $n;
}

/* ── Weekly brief ───────────────────────────────────────────────────────── */

/** The brief's facts, built here from the dashboard's own counts. No child is named. */
function cp_brief_facts(array $x): array {
    $d = cp_dashboard_data($x); $c = $d['counts'];
    $staff = cp_staff($x);
    $needs = [];
    foreach ($staff as $s) if ($s['tone'] === 'bad') $needs[] = ['n' => 1, 'l' => 'A ' . ($s['role'] === 'lead' ? 'centre lead' : $s['role']) . ' isn’t cleared to work with children', 's' => $s['name'] . ' · ' . $s['centre'], 'tone' => 'bad'];
    if ($c['rotaUnfilled']) $needs[] = ['n' => $c['rotaUnfilled'], 'l' => 'Duty shift with nobody on it', 's' => '', 'tone' => 'bad'];
    $tt = function_exists('admin_timetable_list') ? admin_timetable_list(['requesterId' => $x['me']]) : [];
    if ((int)($tt['clashCount'] ?? 0)) $needs[] = ['n' => (int)$tt['clashCount'], 'l' => 'Timetable slots clashing', 's' => '', 'tone' => 'bad'];
    if ($c['companionLow']) $needs[] = ['n' => $c['companionLow'], 'l' => 'Members said they’re struggling', 's' => 'Their mentors haven’t been told yet', 'tone' => 'bad'];
    if ($c['permissionsMissing']) $needs[] = ['n' => $c['permissionsMissing'], 'l' => 'Active members missing a required permission', 's' => '', 'tone' => 'bad'];
    if ($c['approvals']) $needs[] = ['n' => $c['approvals'], 'l' => 'Approvals waiting', 's' => '', 'tone' => 'warn'];
    if ($c['promotable']) $needs[] = ['n' => $c['promotable'], 'l' => 'Summer graduates waiting to join', 's' => '', 'tone' => 'warn'];
    if ($c['applications']) $needs[] = ['n' => $c['applications'], 'l' => 'Applications to review', 's' => '', 'tone' => 'warn'];
    $leads = cp_leads($x['centres']);
    $centres = [];
    foreach ($x['centres'] as $cc) { $s = $d['centreStats'][(string)$cc['centreId']] ?? null; if (!$s) continue;
        $centres[] = ['name' => (string)$cc['name'], 'lead' => $leads[(string)$cc['centreId']]['name'] ?? '', 'attendance' => ($s['members'] ? round($s['present'] / $s['members'] * 100) : 0) . '%',
                      'trend' => $s['trend'], 'tone' => $s['tone'], 'issue' => $s['issue'], 'noMentor' => $s['unpaired']]; }
    return ['needs' => $needs, 'centres' => $centres];
}
function cp_brief_fallback(array $f): string {
    $bad = array_filter($f['needs'], static fn($n) => $n['tone'] === 'bad');
    $warn = array_filter($f['needs'], static fn($n) => $n['tone'] !== 'bad');
    $low = array_filter($f['centres'], static fn($c) => $c['tone'] !== 'ok');
    return 'Before Saturday: ' . ($bad ? implode('; ', array_map(static fn($n) => $n['n'] . ' × ' . mb_strtolower($n['l']), $bad)) . '. These block a child or a class — clear them first.' : 'nothing is blocking a class.')
        . "\n\nSlipping: " . ($low ? implode('; ', array_map(static fn($c) => $c['name'] . ' — ' . mb_strtolower($c['issue']), $low)) . '.' : 'every centre is on track.')
        . "\n\nThis week: " . ($warn ? implode(', ', array_map(static fn($n) => $n['n'] . ' ' . mb_strtolower($n['l']), $warn)) . '.' : 'no routine queues are waiting.');
}
/** admin.clubp.brief — three paragraphs for the centre leads. A person reads it before it goes. */
function admin_clubp_brief(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $f = cp_brief_facts($x);
    $text = ''; $by = 'rules';
    if (function_exists('ai_complete')) {
        $sys = 'You write the Monday brief for the staff who run NGG Club, a Saturday youth programme in Lagos. Write 3 short paragraphs, plain British English, no headings, no bullet symbols, under 110 words total. '
             . 'Paragraph 1 starts "Before Saturday:" and covers anything that blocks a child or a class. Paragraph 2 starts "Slipping:" and covers centres trending down. Paragraph 3 starts "This week:" and lists routine queues. Name owners where given. Use only the facts given.';
        $r = ai_complete($sys, 'Facts as JSON: ' . json_encode($f, JSON_UNESCAPED_UNICODE), 400);
        if (!empty($r['ok']) && str_contains((string)$r['text'], 'Before Saturday')) { $text = trim((string)$r['text']); $by = (string)($r['provider'] ?? 'ai'); }
    }
    if ($text === '') $text = cp_brief_fallback($f);
    return ['ok' => true, 'text' => $text, 'by' => $by, 'leads' => array_values(array_filter(array_column($f['centres'], 'lead')))];
}
/** admin.clubp.brief.send — to the covered centres' NGG leads; logged. */
function admin_clubp_brief_send(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $text = trim((string)($p['text'] ?? ''));
    if ($text === '' || mb_strlen($text) > 3000) return ['ok' => false, 'error' => 'bad_text'];
    $people = []; $names = [];
    $ids = array_map(static fn($c) => (string)$c['centreId'], $x['centres']);
    foreach (db_all("SELECT memberId, email, fullName, centreScope FROM members WHERE role = 'centre_lead' AND COALESCE(status,'') NOT IN ('suspended','deleted','merged')") as $m)
        if (array_intersect((array)(safe_json((string)$m['centreScope']) ?: []), $ids)) { $people[(string)$m['memberId']] = $m; $names[] = (string)$m['fullName']; }
    foreach ($x['centres'] as $c) if ((string)$c['leadVolunteerId'] !== '') {
        $v = db_row('SELECT memberId, email, fullName FROM volunteers WHERE volunteerId = ?', [$c['leadVolunteerId']]);
        if ($v && (string)$v['memberId'] !== '' && !isset($people[(string)$v['memberId']])) { $people[(string)$v['memberId']] = $v; $names[] = (string)$v['fullName']; }
    }
    if (!$people) return ['ok' => false, 'error' => 'no_leads', 'message' => 'None of these centres has a lead with an account to send to.'];
    notify_people(array_values($people), ['kind' => 'brief', 'title' => 'This week’s Club brief', 'body' => $text, 'linkPage' => 'club-admin', 'ctaPath' => '/club-admin', 'eyebrow' => 'NGG Club']);
    audit('club.brief.send', $x['me'], '', ['to' => array_keys($people), 'chars' => mb_strlen($text)]);
    return ['ok' => true, 'sentTo' => array_values(array_unique($names))];
}

/* ── Search ─────────────────────────────────────────────────────────────── */

/** admin.clubp.search — members by name, member ID or printed ID, in scope, six at most. */
function admin_clubp_search(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $q = strtolower(trim((string)($p['q'] ?? '')));
    if (mb_strlen($q) < 2) return ['ok' => true, 'members' => []];
    [$inSql, $inArgs] = cp_in($x);
    $like = '%' . $q . '%';
    $rows = db_all("SELECT memberId, displayId, fullName, centre, track, status FROM members WHERE type = 'NGG' AND $inSql
                    AND (lower(fullName) LIKE ? OR lower(memberId) LIKE ? OR lower(COALESCE(displayId,'')) LIKE ?)
                    ORDER BY CASE WHEN lower(fullName) LIKE ? THEN 0 ELSE 1 END, fullName LIMIT 6", array_merge($inArgs, [$like, $like, $like, $q . '%']));
    return ['ok' => true, 'members' => array_map(static fn($r) => ['id' => (string)$r['memberId'], 'displayId' => (string)($r['displayId'] ?: $r['memberId']), 'name' => (string)$r['fullName'],
        'centre' => (string)$r['centre'], 'course' => (string)$r['track'], 'status' => (string)$r['status']], $rows)];
}

/* ── Student directory (the roster) ─────────────────────────────────────── */

const CP_DIR_WEEKS = 8;
const CP_DIR_MAX = 6000;
const CP_MSG_MAX = 500;

/** The session a register is for at a centre: today if it meets today, else its most recent meeting day this week. */
function cp_register_date(array $centre): string {
    $days = function_exists('centre_meet_weekdays') ? (centre_meet_weekdays((string)$centre['meetDays']) ?: [6]) : [6];
    for ($i = 0; $i < 7; $i++) { $d = time() - $i * 86400; if (in_array((int)gmdate('N', $d), $days, true)) return gmdate('Y-m-d', $d); }
    return gmdate('Y-m-d');
}

/**
 * admin.clubp.directory — every member in scope, compact, for the directory's
 * own search, views and filters: class, division, course, mentor, the last
 * eight sessions, consent, ID card, dues. One grouped query per fact, never
 * one per member.
 */
function admin_clubp_directory(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    [$inSql, $inArgs] = cp_in($x);
    $mem = db_all("SELECT memberId, displayId, fullName, centre, track, status, joinDate, parentName, parentPhone, profileJson, photoUrl, createdAt FROM members
                   WHERE type = 'NGG' AND status IN ('active','inactive') AND COALESCE(role,'') NOT IN " . CP_STAFF_ROLES_SQL . " AND $inSql ORDER BY fullName LIMIT " . CP_DIR_MAX, $inArgs);
    $ids = array_column($mem, 'memberId');
    $in = static function (array $ids, callable $fn) { foreach (array_chunk($ids, 400) as $ch) $fn($ch, implode(',', array_fill(0, count($ch), '?'))); };
    // Session dates: the meeting days that had any attendance, newest eight, per centre.
    $dates = []; $since = gmdate('Y-m-d', time() - 70 * 86400);
    foreach (db_all("SELECT m.centre, a.date FROM attendance a JOIN members m ON m.memberId = a.studentId WHERE a.date >= ? AND m.type = 'NGG' AND " . str_replace('centre', 'm.centre', $inSql) . " GROUP BY m.centre, a.date ORDER BY a.date DESC", array_merge([$since], $inArgs)) as $r)
        if (count($dates[(string)$r['centre']] ?? []) < CP_DIR_WEEKS) $dates[(string)$r['centre']][] = (string)$r['date'];
    $att = [];
    $in($ids, function ($ch, $ph) use (&$att, $since) {
        foreach (db_all("SELECT studentId, date, status FROM attendance WHERE date >= ? AND studentId IN ($ph)", array_merge([$since], $ch)) as $a) $att[(string)$a['studentId']][(string)$a['date']] = (string)$a['status'] === 'late' ? 'L' : 'P';
    });
    $mentor = []; foreach (db_all("SELECT a.memberId, t.fullName FROM mentor_assignments a JOIN mentors t ON t.mentorId = a.mentorId WHERE a.status = 'active'") as $r) $mentor[(string)$r['memberId']] = (string)$r['fullName'];
    $cons = cp_consents_for($ids);
    $issued = [];
    $in($ids, function ($ch, $ph) use (&$issued) {
        // As the ID Card Studio counts it: a proof is not a card anybody holds.
        try { foreach (db_all("SELECT DISTINCT ci.subjectId FROM card_issues ci JOIN card_runs cr ON cr.runId = ci.runId WHERE ci.subjectType = 'member' AND ci.ok = 1 AND cr.mode != 'proof' AND ci.subjectId IN ($ph)", $ch) as $r) $issued[(string)$r['subjectId']] = true; } catch (Throwable $e) {}
    });
    $owing = [];
    $in($ids, function ($ch, $ph) use (&$owing) {
        foreach (db_all("SELECT memberId, SUM(CASE WHEN direction = 'charge' THEN amount ELSE -amount END) bal FROM member_ledger WHERE COALESCE(voidedAt,'') = '' AND memberId IN ($ph) GROUP BY memberId", $ch) as $r)
            if ((int)$r['bal'] > 0) $owing[(string)$r['memberId']] = (int)$r['bal'];
    });
    $guard = [];
    $in($ids, function ($ch, $ph) use (&$guard) {
        foreach (db_all("SELECT w.memberId, g.fullName, g.phone FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId WHERE w.status = 'active' AND w.memberId IN ($ph)", $ch) as $r) $guard[(string)$r['memberId']] ??= $r;
    });
    $termStart = gmdate('Y-m-d', time() - 90 * 86400);
    $rows = [];
    foreach ($mem as $m) {
        $id = (string)$m['memberId']; $centre = (string)$m['centre'];
        $prof = safe_json((string)$m['profileJson']) ?: [];
        $ds = array_reverse($dates[$centre] ?? []);
        $marks = array_map(static fn($d) => $att[$id][$d] ?? 'A', $ds);
        $joined = (string)($m['joinDate'] ?: substr((string)$m['createdAt'], 0, 10));
        // Sessions before they joined are "not enrolled", not absences.
        foreach ($ds as $i => $d) if ($joined !== '' && $d < $joined) $marks[$i] = null;
        $known = array_values(array_filter($marks, static fn($a) => $a !== null));
        $pct = $known ? (int)round(count(array_filter($known, static fn($a) => $a !== 'A')) / count($known) * 100) : null;
        $run = 0; for ($i = count($marks) - 1; $i >= 0 && $marks[$i] === 'A'; $i--) $run++;
        $c = $cons[$id] ?? [];
        $parts = preg_split('/\s+/', trim((string)$m['fullName'])) ?: [''];
        $g = $guard[$id] ?? null;
        $rows[] = ['id' => (string)($m['displayId'] ?: $id), 'memberId' => $id, 'name' => (string)$m['fullName'], 'first' => (string)$parts[0], 'last' => (string)end($parts),
            'centre' => $centre, 'cls' => (string)($prof['class'] ?? ''), 'course' => (string)$m['track'], 'division' => cp_div_label((string)$m['track']),
            'mentor' => $mentor[$id] ?? null, 'status' => (string)$m['status'] === 'inactive' ? 'Paused' : ($joined >= $termStart ? 'New' : 'Active'),
            'att' => $marks, 'pct' => $pct, 'absentRun' => $run, 'consent' => !cp_required_missing($c), 'idCard' => !empty($issued[$id]), 'owing' => isset($owing[$id]),
            'guardian' => $g ? (string)$g['fullName'] : (string)$m['parentName'], 'phone' => $g && (string)$g['phone'] !== '' ? (string)$g['phone'] : (string)$m['parentPhone'],
            'joined' => $joined];
    }
    $mentors = [];
    foreach (db_all("SELECT mentorId, fullName, centre FROM mentors WHERE COALESCE(programme,'') <> 'summer' AND COALESCE(status,'') NOT IN ('rejected','archived','removed','left') ORDER BY fullName") as $mm)
        if (!$x['scoped'] || cp_covers($x, (string)$mm['centre'])) $mentors[(string)($mm['centre'] ?: 'All')][] = ['id' => (string)$mm['mentorId'], 'name' => (string)$mm['fullName']];
    $classes = defined('CLUB_APPLY_CLASSES') ? CLUB_APPLY_CLASSES : ['Pri 4', 'Pri 5', 'Pri 6', 'JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];
    $weeks = []; $next = [];
    foreach ($x['centres'] as $cc) { $weeks[(string)$cc['name']] = array_map(static fn($d) => gmdate('j M', strtotime($d)), array_reverse($dates[(string)$cc['name']] ?? []));
        $next[(string)$cc['name']] = cp_register_date($cc); }
    return ['ok' => true, 'students' => $rows, 'centres' => $x['names'], 'classes' => array_values($classes), 'mentors' => $mentors, 'weeks' => $weeks, 'registerDates' => $next,
            'divisions' => array_values(array_unique(array_merge(['Chess'], array_map(static fn($d) => cp_div_label_of((string)$d['name']), function_exists('club_divisions') ? club_divisions() : []))))];
}
function cp_div_label_of(string $division): string {
    $k = cp_div_key_of($division);
    return ['tech' => 'Technology', 'media' => 'Media', 'arts' => 'Creative Arts', 'biz' => 'Business', 'chess' => 'Chess'][$k];
}
function cp_div_key_of(string $division): string {
    $short = function_exists('club_division_short') ? strtoupper(club_division_short($division)) : strtoupper($division);
    if (str_contains($short, 'TECH')) return 'tech'; if (str_contains($short, 'MEDIA')) return 'media';
    if (str_contains($short, 'BUS')) return 'biz'; if (str_contains($short, 'ART') || str_contains($short, 'CREAT')) return 'arts';
    return 'chess';
}
function cp_div_label(string $course): string { $k = cp_div_key($course); return ['tech' => 'Technology', 'media' => 'Media', 'arts' => 'Creative Arts', 'biz' => 'Business', 'chess' => 'Chess'][$k]; }

/** Members this requester may act on, from a list of member ids; out of scope and unknown ids are named, not skipped. */
function cp_members_in_scope(array $x, array $ids): array {
    $ids = array_values(array_unique(array_filter(array_map('strval', $ids))));
    $ok = []; $refused = [];
    foreach (array_chunk($ids, 400) as $ch) {
        $have = [];
        foreach (db_all("SELECT memberId, centre, fullName, parentPhone, parentEmail FROM members WHERE type = 'NGG' AND memberId IN (" . implode(',', array_fill(0, count($ch), '?')) . ')', $ch) as $m) $have[(string)$m['memberId']] = $m;
        foreach ($ch as $id) { $m = $have[$id] ?? null; if (!$m) $refused[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; elseif (!cp_covers($x, (string)$m['centre'])) $refused[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; else $ok[$id] = $m; }
    }
    return [$ok, $refused];
}

/** admin.clubp.register — a register for the centre's current session: P and L recorded; A leaves no check-in. */
function admin_clubp_register(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $marks = is_array($p['marks'] ?? null) ? $p['marks'] : [];
    if (!$marks) return ['ok' => false, 'error' => 'nothing_marked'];
    if (count($marks) > CP_DIR_MAX) return ['ok' => false, 'error' => 'too_many'];
    [$ok, $refused] = cp_members_in_scope($x, array_keys($marks));
    $byCentre = []; foreach ($x['centres'] as $c) $byCentre[(string)$c['name']] = cp_register_date($c);
    $present = 0; $late = 0; $absent = 0; $already = 0; $now = now_iso();
    foreach ($ok as $id => $m) {
        $mk = strtoupper((string)$marks[$id]); $date = $byCentre[(string)$m['centre']] ?? gmdate('Y-m-d');
        if ($mk === 'A') { $absent++; continue; }
        if (!in_array($mk, ['P', 'L'], true)) { $refused[] = ['id' => $id, 'ok' => false, 'error' => 'bad_mark']; continue; }
        if (db_row('SELECT 1 FROM attendance WHERE studentId = ? AND date = ?', [$id, $date])) { $already++; continue; }
        try { db_insert('attendance', ['cohortId' => '', 'studentId' => $id, 'token' => '', 'date' => $date, 'checkInAt' => $now, 'method' => 'register', 'byId' => $x['me'],
            'status' => $mk === 'L' ? 'late' : 'present', 'createdAt' => $now]); $mk === 'L' ? $late++ : $present++; } catch (Throwable $e) { $already++; }
    }
    audit('club.register', $x['me'], '', ['present' => $present, 'late' => $late, 'absent' => $absent, 'already' => $already, 'refused' => count($refused)]);
    return ['ok' => true, 'present' => $present, 'late' => $late, 'absent' => $absent, 'already' => $already, 'refused' => $refused];
}

/** admin.clubp.message — the selected members' guardians, by SMS (when set up) and in the app. */
function admin_clubp_message(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $text = trim((string)($p['text'] ?? '')); $ch = is_array($p['ch'] ?? null) ? $p['ch'] : [];
    if ($text === '' || mb_strlen($text) > 1000) return ['ok' => false, 'error' => 'bad_text'];
    $ids = (array)($p['memberIds'] ?? []);
    if (count($ids) > CP_MSG_MAX) return ['ok' => false, 'error' => 'too_many', 'message' => 'At most ' . CP_MSG_MAX . ' at a time.'];
    [$ok, $refused] = cp_members_in_scope($x, $ids);
    $app = 0; $sms = 0; $noPhone = 0; $phones = [];
    foreach ($ok as $id => $m) {
        if (!empty($ch['app'])) { try { push_notification($id, ['kind' => 'announcement', 'title' => 'A message from NGG', 'body' => $text, 'linkPage' => 'dashboard']); $app++; } catch (Throwable $e) {} }
        $ph = preg_replace('/\D+/', '', (string)$m['parentPhone']);
        if (strlen((string)$ph) >= 10) $phones[$ph] = true; else $noPhone++;
    }
    if (!empty($ch['sms']) && function_exists('sms_enabled') && sms_enabled()) foreach (array_keys($phones) as $ph) { $r = sms_send($ph, mb_substr('NGG: ' . $text, 0, 480)); if (!empty($r['ok'])) $sms++; }
    audit('club.message', $x['me'], '', ['members' => count($ok), 'app' => $app, 'sms' => $sms]);
    return ['ok' => true, 'app' => $app, 'sms' => $sms, 'noPhone' => $noPhone, 'smsOn' => function_exists('sms_enabled') && sms_enabled(), 'refused' => $refused];
}

/**
 * admin.clubp.dir.bulk — the directory's bulk actions, each through the op that
 * owns it: mentor (admin.mentor.assign), idcard (the ID Card Studio's queue),
 * move (admin.club.members.bulk centre), status (admin.club.members.bulk status).
 */
function admin_clubp_dir_bulk(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $act = (string)($p['act'] ?? ''); $ids = (array)($p['memberIds'] ?? []);
    if (count($ids) > CP_MSG_MAX) return ['ok' => false, 'error' => 'too_many', 'message' => 'At most ' . CP_MSG_MAX . ' at a time.'];
    [$ok, $refused] = cp_members_in_scope($x, $ids);
    $me = $x['me']; $ip = (string)($p['ip'] ?? '');
    if (!$ok) return ['ok' => true, 'applied' => 0, 'results' => $refused];
    if ($act === 'mentor') {
        $mentorId = (string)($p['mentorId'] ?? ''); $res = []; $n = 0;
        foreach (array_keys($ok) as $id) { $r = backend_dispatch('admin.mentor.assign', ['requesterId' => $me, 'memberId' => $id, 'mentorId' => $mentorId, 'ip' => $ip]);
            $res[] = ['id' => $id, 'ok' => !empty($r['ok']), 'error' => $r['error'] ?? null]; if (!empty($r['ok'])) $n++; }
        audit('club.dir.mentor', $me, $mentorId, ['n' => $n]);
        return ['ok' => true, 'applied' => $n, 'results' => array_merge($res, $refused)];
    }
    if ($act === 'idcard') {
        $items = array_map(static fn($id) => ['subjectType' => 'member', 'subjectId' => $id, 'why' => 'New card from the Club roster', 'cause' => 'new'], array_keys($ok));
        $r = backend_dispatch('admin.ids.reprint.request', ['requesterId' => $me, 'items' => $items, 'ip' => $ip]);
        return empty($r['ok']) ? $r : ['ok' => true, 'applied' => (int)($r['added'] ?? 0) + (int)($r['updated'] ?? 0), 'results' => $refused];
    }
    if ($act === 'move' || $act === 'status') {
        $val = (string)($p['value'] ?? '');
        if ($act === 'move' && !cp_covers($x, $val)) return ['ok' => false, 'error' => 'out_of_scope'];
        $map = ['Active' => 'active', 'Paused' => 'inactive', 'New' => 'active'];
        $r = backend_dispatch('admin.club.members.bulk', ['requesterId' => $me, 'action' => $act === 'move' ? 'centre' : 'status', 'memberIds' => array_keys($ok),
            $act === 'move' ? 'centre' : 'status' => $act === 'move' ? $val : ($map[$val] ?? $val), 'ip' => $ip]);
        if (empty($r['ok'])) return $r;
        return ['ok' => true, 'applied' => (int)($r['applied'] ?? 0), 'results' => array_merge((array)($r['results'] ?? []), $refused)];
    }
    return ['ok' => false, 'error' => 'bad_act'];
}

/** admin.clubp.dir.save — one record from the directory's drawer: class, centre, guardian, phone, status, mentor. */
function admin_clubp_dir_save(array $p): array {
    $x = cp_ctx($p); if (!$x['ok']) return $x;
    $id = (string)($p['memberId'] ?? ''); $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    [$ok] = cp_members_in_scope($x, [$id]);
    if (!$ok) return ['ok' => false, 'error' => 'out_of_scope'];
    if (isset($d['centre']) && !cp_covers($x, (string)$d['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $me = $x['me']; $ip = (string)($p['ip'] ?? '');
    if (isset($d['phone']) && $d['phone'] !== '' && !preg_match('/^0\d{10}$/', preg_replace('/\s+/', '', (string)$d['phone']))) return ['ok' => false, 'error' => 'bad_phone', 'message' => 'Phone must be 11 digits starting with 0.'];
    $data = ['memberId' => $id];
    if (array_key_exists('centre', $d)) $data['centre'] = (string)$d['centre'];
    if (array_key_exists('guardian', $d)) $data['parentName'] = mb_substr(trim((string)$d['guardian']), 0, 160);
    if (array_key_exists('phone', $d)) $data['parentPhone'] = preg_replace('/\s+/', '', (string)$d['phone']);
    if (array_key_exists('status', $d)) $data['status'] = ['Active' => 'active', 'New' => 'active', 'Paused' => 'inactive'][(string)$d['status']] ?? 'active';
    if (count($data) > 1) { $r = backend_dispatch('admin.members.upsert', ['requesterId' => $me, 'data' => $data, 'ip' => $ip]); if (empty($r['ok'])) return $r; }
    if (array_key_exists('cls', $d)) {
        $row = db_row('SELECT profileJson FROM members WHERE memberId = ?', [$id]);
        $prof = safe_json((string)($row['profileJson'] ?? '')) ?: [];
        $prof['class'] = mb_substr(trim((string)$d['cls']), 0, 20);
        db_update('members', ['profileJson' => json_encode($prof, JSON_UNESCAPED_UNICODE), 'updatedAt' => now_iso()], ['memberId' => $id]);
    }
    if (array_key_exists('mentorId', $d)) { $r = backend_dispatch('admin.mentor.assign', ['requesterId' => $me, 'memberId' => $id, 'mentorId' => (string)$d['mentorId'], 'ip' => $ip]); if (empty($r['ok'])) return $r; }
    audit('club.dir.save', $me, $id, ['keys' => array_keys($d)]);
    return ['ok' => true];
}
