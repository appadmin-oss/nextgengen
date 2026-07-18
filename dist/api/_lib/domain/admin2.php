<?php
declare(strict_types=1);

/**
 * Admin domain, part 2 — the "complete management" surface:
 * analytics overview, 360° member detail, mentor assignment, applications
 * review + convert, newsletter, and site settings. Every handler re-checks
 * admin role via admin_gate() (defined in admin.php).
 */

// ── General dashboard (Summer School board) — attendance + analytics/centre ──
// Read-only live aggregation. Gated on the M&E `audit` cap (finally giving that
// long-orphaned role a home) and also open to `rbac`/super_admin. Grouped by
// centre; centre-scope filtering is layered in with scoped admins (B2).
function admin_dashboard_overview(array $p): array {
    // Read-only board — any admin tier (incl. the M&E `audit` role) may view it.
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $today = gmdate('Y-m-d');
    $since = gmdate('Y-m-d', time() - 13 * 86400); // 14-day window

    // Scoped admins see only their centres; unscoped (super_admin/admin) see all.
    $scopeNames = admin_centre_names_in_scope($g['requester']);
    $centreWhere = "status = 'active'";
    $centreArgs = [];
    if ($scopeNames !== null) {
        if (!$scopeNames) return ['ok' => true, 'dashboard' => ['today' => $today, 'kpis' => ['centres' => 0, 'enrolled' => 0, 'presentToday' => 0, 'attendanceRate' => 0, 'lateToday' => 0, 'activeVolunteers' => 0, 'presentVolToday' => 0], 'byCentre' => [], 'trend' => []]];
        $centreWhere .= ' AND name IN (' . implode(',', array_fill(0, count($scopeNames), '?')) . ')';
        $centreArgs = $scopeNames;
    }
    $centres = db_all("SELECT centreId, name, code, color FROM centres WHERE $centreWhere ORDER BY name", $centreArgs);
    $byCentre = [];
    foreach ($centres as $c) {
        $name = (string)$c['name'];
        $enrolled = $one("SELECT COUNT(*) c FROM summer_students WHERE centre = ? AND status = 'active'", [$name]);
        $present  = $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE s.centre = ? AND a.date = ?", [$name, $today]);
        $late     = $one("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE s.centre = ? AND a.date = ? AND a.status = 'late'", [$name, $today]);
        $byCentre[] = [
            'centreId' => $c['centreId'], 'name' => $name, 'code' => $c['code'], 'color' => $c['color'],
            'enrolled' => $enrolled, 'present' => $present, 'late' => $late,
            'rate' => $enrolled ? (int)round($present / $enrolled * 100) : 0,
        ];
    }
    // KPI + trend queries respect the same scope (join students → centre).
    $inClause = ''; $inArgs = [];
    if ($scopeNames !== null) { $inClause = ' AND s.centre IN (' . implode(',', array_fill(0, count($scopeNames), '?')) . ')'; $inArgs = $scopeNames; }
    $trend = db_all("SELECT a.date date, COUNT(DISTINCT a.studentId) present, SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) late FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date >= ?$inClause GROUP BY a.date ORDER BY a.date", array_merge([$since], $inArgs));
    $enrolledTotal = $scopeNames !== null
        ? $one("SELECT COUNT(*) c FROM summer_students s WHERE s.status = 'active'$inClause", $inArgs)
        : $one("SELECT COUNT(*) c FROM summer_students WHERE status = 'active'");
    $presentToday  = $scopeNames !== null
        ? $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ?$inClause", array_merge([$today], $inArgs))
        : $one("SELECT COUNT(DISTINCT studentId) c FROM attendance WHERE date = ?", [$today]);
    $lateToday = $scopeNames !== null
        ? $one("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ? AND a.status = 'late'$inClause", array_merge([$today], $inArgs))
        : $one("SELECT COUNT(*) c FROM attendance WHERE date = ? AND status = 'late'", [$today]);

    return ['ok' => true, 'dashboard' => [
        'today' => $today,
        'kpis' => [
            'centres'          => count($centres),
            'enrolled'         => $enrolledTotal,
            'presentToday'     => $presentToday,
            'attendanceRate'   => $enrolledTotal ? (int)round($presentToday / $enrolledTotal * 100) : 0,
            'lateToday'        => $lateToday,
            'activeVolunteers' => $one("SELECT COUNT(*) c FROM volunteers WHERE status = 'active'"),
            'presentVolToday'  => $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId WHERE a.date = ?", [$today]),
        ],
        'byCentre' => $byCentre,
        'trend'    => $trend,
    ]];
}

// ── Status-page management ───────────────────────────────────────────────────
// Both public boards (/s-status attendance, /v-status volunteer) carry an admin-
// editable editorial layer + a publish toggle, stored as one `status_pages`
// setting. The public ops read this to render copy and to hide a board that's
// been unpublished.
function status_pages_defaults(): array {
    return [
        'attendance' => [
            'published' => true,
            'title' => 'Summer School',
            'tagline' => 'A live, public view of attendance and participation across every centre.',
            'transparencyTitle' => 'Numbers, not names.',
            'transparencyBody' => "This board updates live and shows only aggregate figures — how many students attended, at which centres, and how participation is trending. A child's name, photo, or record never appears here. It's how we stay accountable to parents, partners and the community without compromising a single child's privacy.",
            'ctaLabel' => 'Apply for a place →',
            'ctaPage' => 'join',
        ],
        'volunteer' => [
            'published' => true,
            'title' => 'Build the team.',
            'tagline' => 'A live, public view of volunteer needs across every centre.',
            'transparencyTitle' => 'Roles, not people.',
            'transparencyBody' => "This board shows only how many volunteers each centre needs and how many have stepped up — by role, faculty and course. A volunteer's name, photo or contact detail never appears here.",
            'ctaLabel' => 'Volunteer with us →',
            'ctaPage' => 'volunteer',
        ],
    ];
}

/** Merge the stored config over the defaults (per board, per key). */
function status_pages_config(): array {
    $def = status_pages_defaults();
    $stored = safe_json((string)(setting_raw('status_pages') ?? '')) ?: [];
    foreach ($def as $board => $fields) {
        if (!is_array($stored[$board] ?? null)) continue;
        foreach ($fields as $k => $v) {
            if (!array_key_exists($k, $stored[$board])) continue;
            $def[$board][$k] = $k === 'published' ? (bool)$stored[$board][$k] : (string)$stored[$board][$k];
        }
    }
    return $def;
}

function admin_status_pages_get(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    return ['ok' => true, 'statusPages' => status_pages_config()];
}

function admin_status_pages_set(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $in = is_array($p['data'] ?? null) ? $p['data'] : [];
    $def = status_pages_defaults();
    $out = status_pages_config(); // start from current (so a partial save is safe)
    foreach ($def as $board => $fields) {
        if (!is_array($in[$board] ?? null)) continue;
        foreach ($fields as $k => $v) {
            if (!array_key_exists($k, $in[$board])) continue;
            if ($k === 'published') { $out[$board][$k] = !empty($in[$board][$k]); }
            elseif ($k === 'ctaPage') { $out[$board][$k] = preg_replace('/[^a-z0-9-]/', '', strtolower((string)$in[$board][$k])) ?: $v; }
            else { $out[$board][$k] = substr(trim((string)$in[$board][$k]), 0, 600); }
        }
    }
    setting_set('status_pages', $out, (string)($g['requester']['memberId'] ?? ''));
    audit('status.pages.set', (string)($g['requester']['memberId'] ?? ''), 'status_pages', ['attendance' => $out['attendance']['published'], 'volunteer' => $out['volunteer']['published']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'statusPages' => $out];
}

// ── Public status board (no auth, PII-free aggregates only) ──────────────────
// Powers the public /s-status transparency page. Deliberately exposes ONLY
// centre-level aggregate counts — never a child's name, photo or record.
function public_status(array $p): array {
    $page = status_pages_config()['attendance'];
    if (empty($page['published'])) return ['ok' => true, 'status' => ['page' => $page, 'generatedAt' => now_iso()]];
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $today = gmdate('Y-m-d');
    $since = gmdate('Y-m-d', time() - 13 * 86400);
    $weekAgo = gmdate('Y-m-d', time() - 6 * 86400);

    $centres = db_all("SELECT name, code, color FROM centres WHERE status = 'active' ORDER BY name");
    $byCentre = [];
    foreach ($centres as $c) {
        $name = (string)$c['name'];
        $enrolled = $one("SELECT COUNT(*) c FROM summer_students WHERE centre = ? AND status = 'active'", [$name]);
        $present  = $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE s.centre = ? AND a.date = ?", [$name, $today]);
        $byCentre[] = ['name' => $name, 'code' => $c['code'], 'color' => $c['color'], 'present' => $present, 'rate' => $enrolled ? (int)round($present / $enrolled * 100) : 0];
    }
    $enrolledTotal = $one("SELECT COUNT(*) c FROM summer_students WHERE status = 'active'");
    $presentToday  = $one("SELECT COUNT(DISTINCT studentId) c FROM attendance WHERE date = ?", [$today]);
    $trend = db_all("SELECT date, COUNT(DISTINCT studentId) present FROM attendance WHERE date >= ? GROUP BY date ORDER BY date", [$since]);
    // Session week number (best-effort from the active session start).
    $sess = db_row("SELECT startDate FROM sessions WHERE isActive = 1 ORDER BY id DESC LIMIT 1");
    $week = 0;
    if ($sess && !empty($sess['startDate'])) { $d = (int)floor((time() - strtotime((string)$sess['startDate'])) / 86400); if ($d >= 0) $week = (int)floor($d / 7) + 1; }

    return ['ok' => true, 'status' => [
        'today' => $today,
        'generatedAt' => now_iso(),
        'page' => $page,
        'program' => ['name' => $page['title'] ?: 'Summer School', 'year' => (int)gmdate('Y'), 'week' => $week],
        'kpis' => [
            'centres'          => count($centres),
            'enrolled'         => $enrolledTotal,
            'presentToday'     => $presentToday,
            'attendanceRate'   => $enrolledTotal ? (int)round($presentToday / $enrolledTotal * 100) : 0,
            'activeVolunteers' => $one("SELECT COUNT(*) c FROM volunteers WHERE status = 'active'"),
            'starsThisWeek'    => $one("SELECT COUNT(*) c FROM member_stars WHERE date >= ?", [$weekAgo]),
        ],
        'byCentre' => $byCentre,
        'trend'    => $trend,
    ]];
}

// ── Analytics overview ──────────────────────────────────────────────────────
function admin_overview(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $since30 = gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400);

    $byCentre = db_all("SELECT centre, COUNT(*) c FROM members WHERE status='active' AND centre != '' GROUP BY centre");
    $byTrack  = db_all("SELECT track, COUNT(*) c FROM members WHERE status='active' AND track != '' AND track IS NOT NULL GROUP BY track ORDER BY c DESC");

    return ['ok' => true, 'overview' => [
        'members' => [
            'active'   => $one("SELECT COUNT(*) c FROM members WHERE status='active'"),
            'ngg'      => $one("SELECT COUNT(*) c FROM members WHERE status='active' AND type='NGG'"),
            'summer'   => $one("SELECT COUNT(*) c FROM members WHERE status='active' AND type='Summer'"),
            'graduates'=> $one("SELECT COUNT(*) c FROM members WHERE status IN ('graduated-ngg','graduated-vanguard')"),
            'suspended'=> $one("SELECT COUNT(*) c FROM members WHERE status='suspended'"),
            'new30'    => $one("SELECT COUNT(*) c FROM members WHERE createdAt >= ?", [$since30]),
        ],
        'mentors' => ['active' => $one("SELECT COUNT(*) c FROM mentors WHERE status='active'"), 'total' => $one("SELECT COUNT(*) c FROM mentors")],
        'applications' => [
            'new'     => $one("SELECT COUNT(*) c FROM applications WHERE status='new'"),
            'total'   => $one("SELECT COUNT(*) c FROM applications"),
        ],
        'volunteers' => [
            'pending' => $one("SELECT COUNT(*) c FROM applications WHERE kind='volunteer' AND status IN ('new','reviewing')"),
            'active'  => $one("SELECT COUNT(*) c FROM volunteers WHERE status='active'"),
            'unscreened' => $one("SELECT COUNT(*) c FROM volunteers WHERE status='active' AND safeguarding != 'cleared'"),
        ],
        'anchor' => [
            'journals'  => $one("SELECT COUNT(*) c FROM journal"),
            'verified'  => $one("SELECT COUNT(*) c FROM member_progress WHERE status='verified'"),
            'submitted' => $one("SELECT COUNT(*) c FROM member_progress WHERE status='submitted'"),
        ],
        'assignments' => [
            'published' => $one("SELECT COUNT(*) c FROM assignments WHERE status='published'"),
            'submitted' => $one("SELECT COUNT(*) c FROM assignment_submissions"),
            'toGrade'   => $one("SELECT COUNT(*) c FROM assignment_submissions WHERE status='submitted'"),
        ],
        'events'     => ['upcoming' => $one("SELECT COUNT(*) c FROM events WHERE status='published' AND startAt >= ?", [gmdate('Y-m-d\TH:i:s\Z')])],
        'newsletter' => ['subscribers' => $one("SELECT COUNT(*) c FROM newsletter WHERE status='subscribed'")],
        'messages'   => ['unread' => $one("SELECT COUNT(*) c FROM contact_messages WHERE status='new'"), 'total' => $one("SELECT COUNT(*) c FROM contact_messages")],
        'byCentre'   => $byCentre,
        'byTrack'    => $byTrack,
        'recent'     => db_all("SELECT at, actorId, event, subject FROM audit_log ORDER BY id DESC LIMIT 12"),
    ]];
}

// ── 360° member detail ──────────────────────────────────────────────────────
function admin_member_detail(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    unset($m['totpSecret']);
    $m['socials'] = safe_json($m['socials'] ?? null);

    $stats = db_row('SELECT * FROM member_stats WHERE memberId = ? LIMIT 1', [$id]) ?: [];
    $journal = array_map(fn($r) => ['week' => (int)$r['week'], 'mood' => $r['mood'], 'body' => $r['body'], 'createdAt' => $r['createdAt']],
        db_all('SELECT week, mood, body, createdAt FROM journal WHERE memberId = ? ORDER BY createdAt DESC LIMIT 20', [$id]));

    $prog = db_row("SELECT COUNT(*) total, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) submitted FROM member_progress WHERE memberId = ?", [$id]) ?: [];

    $subs = db_all("SELECT s.assignmentId, s.status, s.grade, s.submittedAt, a.title, a.points FROM assignment_submissions s LEFT JOIN assignments a ON a.assignmentId = s.assignmentId WHERE s.memberId = ? ORDER BY s.submittedAt DESC LIMIT 25", [$id]);

    $mentorLink = db_row("SELECT ma.mentorId, ma.sessionId, m.fullName FROM mentor_assignments ma LEFT JOIN mentors m ON m.mentorId = ma.mentorId WHERE ma.memberId = ? AND ma.status='active' ORDER BY ma.startedAt DESC LIMIT 1", [$id]);

    $state = [];
    foreach (db_all('SELECT stateKey, stateValue FROM member_state WHERE memberId = ?', [$id]) as $r) $state[$r['stateKey']] = safe_json($r['stateValue']);

    return ['ok' => true, 'detail' => [
        'member' => $m,
        'stats' => ['xp' => (int)($stats['xpTotal'] ?? 0), 'level' => (int)($stats['level'] ?? 1), 'streak' => (int)($stats['streak'] ?? 0), 'badges' => safe_json($stats['badges'] ?? null) ?: []],
        'journal' => $journal,
        'progress' => ['total' => (int)($prog['total'] ?? 0), 'verified' => (int)($prog['verified'] ?? 0), 'submitted' => (int)($prog['submitted'] ?? 0)],
        'submissions' => array_map(fn($s) => ['assignmentId' => $s['assignmentId'], 'title' => $s['title'] ?: $s['assignmentId'], 'points' => (int)($s['points'] ?? 0), 'status' => $s['status'], 'grade' => $s['grade'] === null ? null : (int)$s['grade'], 'submittedAt' => $s['submittedAt']], $subs),
        'mentor' => $mentorLink ? ['mentorId' => $mentorLink['mentorId'], 'fullName' => $mentorLink['fullName'], 'sessionId' => $mentorLink['sessionId']] : null,
        'state' => $state,
    ]];
}

// ── Mentor assignment ───────────────────────────────────────────────────────
function admin_assign_mentor(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $memberId = (string)($p['memberId'] ?? '');
    $mentorId = (string)($p['mentorId'] ?? '');
    $sc = session_current();
    $sessionId = (string)($p['sessionId'] ?? ($sc['current']['sessionId'] ?? ''));
    if (!$memberId) return ['ok' => false, 'error' => 'no_member'];
    // End any current active links for this member+session.
    db_exec("UPDATE mentor_assignments SET status='ended', endedAt=? WHERE memberId=? AND sessionId=? AND status='active'", [now_iso(), $memberId, $sessionId]);
    if ($mentorId) {
        $mentor = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mentorId]);
        $track = $mentor && $mentor['tracks'] ? explode(',', (string)$mentor['tracks'])[0] : '';
        db_insert('mentor_assignments', ['memberId' => $memberId, 'mentorId' => $mentorId, 'track' => trim($track), 'sessionId' => $sessionId, 'status' => 'active', 'startedAt' => now_iso(), 'endedAt' => '']);
        push_notification($memberId, ['kind' => 'mentor', 'title' => 'You have a mentor', 'body' => ($mentor['fullName'] ?? 'A mentor') . ' is now guiding your Anchor journey.', 'linkPage' => 'dashboard']);
    }
    audit('admin.mentor.assign', $g['requester']['memberId'], $memberId, ['mentorId' => $mentorId, 'sessionId' => $sessionId], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Applications review ─────────────────────────────────────────────────────
function admin_applications_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['kind'])) { $where[] = 'kind = ?'; $params[] = $p['kind']; }
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = $p['status']; }
    $sql = 'SELECT * FROM applications' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    $rows = db_all($sql, $params);
    // Enrich each row so the admin detail view has everything structured:
    // a human reference, decoded courses, and a derived age from DOB.
    foreach ($rows as &$r) {
        $r['ref'] = function_exists('intake_reference') ? intake_reference((string)($r['kind'] ?? 'teen'), (int)($r['id'] ?? 0)) : '';
        $r['courses'] = $r['courses'] ? (json_decode((string)$r['courses'], true) ?: []) : [];
        $r['dobAge'] = !empty($r['dob']) && function_exists('dob_age') ? dob_age((string)$r['dob']) : null;
    }
    unset($r);
    return ['ok' => true, 'applications' => $rows];
}

function admin_applications_set_status(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['new', 'reviewing', 'accepted', 'rejected', 'waitlist'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('applications', ['status' => $status], ['id' => $id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('admin.application.status', $g['requester']['memberId'], (string)$id, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_application_convert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row('SELECT * FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if ($a['kind'] !== 'teen') return ['ok' => false, 'error' => 'only_teen_apps'];   // mentor apps → mentors, handled separately
    // Don't double-provision.
    $existing = db_row('SELECT memberId FROM members WHERE lower(email) = ? LIMIT 1', [strtolower((string)$a['email'])]);
    if ($existing) { db_update('applications', ['status' => 'accepted'], ['id' => $id]); return ['ok' => true, 'memberId' => $existing['memberId'], 'existed' => true]; }
    // Summer applicants become Summer Students; Anchor/NGG applicants become
    // full NGG members. Falls back to Summer for legacy rows with no program.
    $type = ((string)($a['program'] ?? '') === 'anchor') ? 'NGG' : 'Summer';
    $newId = new_id($type === 'Summer' ? 'SUM' : 'NGG');
    db_insert('members', ['memberId' => $newId, 'fullName' => $a['name'], 'email' => $a['email'], 'type' => $type, 'status' => 'active', 'role' => 'member', 'centre' => $a['centre'] ?: 'Egbeda', 'track' => $a['track'] ?: '', 'photoUrl' => (string)($a['photoUrl'] ?? ''), 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);
    // Welcome the new member so conversion is a visible action, not a silent DB write.
    @send_mail((string)$a['email'], 'Welcome to Next Generation Genius',
        email_template([
            'title' => 'You\'re in, ' . explode(' ', (string)$a['name'])[0] . '.',
            'intro' => $type === 'Summer' ? 'Your place in Summer Students is confirmed.' : 'Your place in the NGG cohort is confirmed.',
            'bodyHtml' => 'We\'ll be in touch shortly with your start details. Your member ID is <b>' . esc_html($newId) . '</b>.',
            'ctaLabel' => 'Open the member portal', 'ctaUrl' => ($GLOBALS['CONFIG']['app_origin'] ?? '') . '/#dashboard',
            'footNote' => 'Welcome to the movement.',
        ]));
    audit('admin.application.convert', $g['requester']['memberId'], $newId, ['applicationId' => $id, 'type' => $type], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'memberId' => $newId];
}

// ── Newsletter ──────────────────────────────────────────────────────────────
function admin_newsletter_list(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT email, source, status, createdAt FROM newsletter ORDER BY id DESC LIMIT 5000');
    $active = count(array_filter($rows, fn($r) => (string)$r['status'] === 'subscribed'));
    return ['ok' => true, 'total' => count($rows), 'active' => $active, 'subscribers' => $rows];
}

/** A signed, per-email unsubscribe token (no DB column needed). */
function newsletter_unsub_token(string $email): string {
    $secret = (string)($GLOBALS['CONFIG']['cookie_secret'] ?? 'ngg');
    return substr(hash_hmac('sha256', 'unsub:' . strtolower(trim($email)), $secret), 0, 32);
}

/** Compose + send a newsletter to all current subscribers (bounded), each with
 *  a one-click unsubscribe link. Gated on 'inbox'. */
function admin_newsletter_send(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $subject = trim((string)($p['subject'] ?? ''));
    $body = trim((string)($p['body'] ?? ''));
    if (strlen($subject) < 3) return ['ok' => false, 'error' => 'subject_too_short'];
    if (strlen($body) < 10) return ['ok' => false, 'error' => 'body_too_short'];
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $subs = db_all("SELECT email FROM newsletter WHERE status = 'subscribed' LIMIT 2000");
    $sent = 0; $skipped = 0;
    foreach ($subs as $s) {
        $to = trim((string)$s['email']);
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL) || $sent >= 2000) { $skipped++; continue; }
        $unsub = $origin . '/api/public/unsubscribe.php?e=' . rawurlencode($to) . '&t=' . newsletter_unsub_token($to);
        $html = email_template([
            'title' => $subject,
            'bodyHtml' => '<div style="font-size:15px;line-height:1.65">' . nl2br(esc_html($body)) . '</div>',
            'footNote' => 'You are receiving this because you subscribed to Next Generation Genius updates.',
        ]) . '<div style="text-align:center;margin:-18px 0 24px;font-family:Arial,sans-serif"><a href="' . esc_html($unsub) . '" style="color:#8A93A6;font-size:12px">Unsubscribe</a></div>';
        if (send_mail($to, $subject, $html)) $sent++; else $skipped++;
    }
    audit('newsletter.send', $g['requester']['memberId'], '', ['sent' => $sent, 'skipped' => $skipped], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sent' => $sent, 'skipped' => $skipped, 'total' => count($subs)];
}

// ── Contact messages ─────────────────────────────────────────────────────────
function admin_contact_list(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = $p['status']; }
    if (!empty($p['purpose'])) { $where[] = 'purpose = ?'; $params[] = $p['purpose']; }
    $sql = 'SELECT * FROM contact_messages' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    $unread = (int)(db_row("SELECT COUNT(*) c FROM contact_messages WHERE status='new'")['c'] ?? 0);
    return ['ok' => true, 'messages' => db_all($sql, $params), 'unread' => $unread];
}

function admin_contact_status(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['new', 'read', 'replied', 'archived'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('contact_messages', ['status' => $status], ['id' => $id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('admin.contact.status', $g['requester']['memberId'], (string)$id, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Site settings ───────────────────────────────────────────────────────────
function admin_settings_get(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    return ['ok' => true, 'settings' => [
        'applications_open'         => (setting_raw('applications_open') ?? '1') !== '0',
        'mentor_applications_open'  => (setting_raw('mentor_applications_open') ?? '1') !== '0',
        'volunteer_applications_open' => (setting_raw('volunteer_applications_open') ?? '1') !== '0',
        'volunteer_sms_notify'      => (setting_raw('volunteer_sms_notify') ?? '1') !== '0',
        'checkin_state_emails'      => (setting_raw('checkin_state_emails') ?? '1') !== '0',
        'volunteer_session_hours'   => (int)(setting_raw('volunteer_session_hours') ?: 4),
        'featured_session_id'       => setting_raw('featured_session_id') ?? '',
        'geofence_enabled'          => setting_raw('geofence_enabled') === '1',
        'photo_gate_issuance'       => setting_raw('photo_gate_issuance') === '1',
        'site_content'              => site_content(),
        'idcard'                    => idcard_program(),
        'attendance'                => attendance_settings(),
    ]];
}

function admin_settings_set(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    foreach (['applications_open', 'mentor_applications_open', 'volunteer_applications_open', 'volunteer_sms_notify', 'checkin_state_emails', 'geofence_enabled', 'photo_gate_issuance'] as $k) {
        if (array_key_exists($k, $data)) setting_set($k, !empty($data[$k]) ? '1' : '0', $g['requester']['memberId']);
    }
    if (array_key_exists('volunteer_session_hours', $data)) setting_set('volunteer_session_hours', (string)max(1, min(12, (int)$data['volunteer_session_hours'])), $g['requester']['memberId']);
    if (array_key_exists('featured_session_id', $data)) setting_set('featured_session_id', (string)$data['featured_session_id'], $g['requester']['memberId']);
    // Homepage / site copy — validated + length-capped, stored as one JSON blob.
    if (array_key_exists('site_content', $data) && is_array($data['site_content'])) {
        setting_set('site_content', site_content_clean($data['site_content']), $g['requester']['memberId']);
    }
    // ID-card branding block (program/year/motto/website/phone/logos).
    if (array_key_exists('idcard', $data) && is_array($data['idcard'])) {
        idcard_program_save($data['idcard'], $g['requester']['memberId']);
    }
    // Attendance punctuality (resumption time per member type + grace).
    if (array_key_exists('attendance', $data) && is_array($data['attendance'])) {
        attendance_settings_save($data['attendance'], $g['requester']['memberId']);
    }
    audit('admin.settings.set', $g['requester']['memberId'], '', ['keys' => array_keys((array)$data)], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// Diagnose email delivery: send a real message and report exactly what happened
// (mode = smtp|php_mail, delivered, and the captured error) so "emails don't
// deliver" is debuggable instead of silent.
function admin_mail_test(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $to = trim((string)($p['to'] ?? ''));
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) $to = (string)($g['requester']['email'] ?? '');
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'no_valid_recipient'];
    $mode = function_exists('mail_mode')
        ? mail_mode()
        : (!empty($GLOBALS['CONFIG']['mail']['smtp']['host'] ?? '') ? 'smtp' : 'php_mail');
    $GLOBALS['__mail_last_error'] = '';
    $delivered = send_mail($to, 'NGG email delivery test', email_template([
        'title' => 'Delivery test',
        'intro' => 'If you can read this, outbound email is working.',
        'bodyHtml' => '<p style="margin:0">Sent from the Control Room email diagnostic (' . esc_html($mode) . ' mode).</p>',
        'footNote' => 'Automated delivery test — no action needed.',
    ]));
    audit('admin.mail.test', $g['requester']['memberId'], $to, ['mode' => $mode, 'delivered' => $delivered], (string)($p['ip'] ?? ''));

    // Surface the resolved sender config so SPF/DKIM alignment problems (the
    // usual "it sends but lands in spam / gets rejected" cause) are visible.
    $from = mail_from();
    $smtp = (array)($GLOBALS['CONFIG']['mail']['smtp'] ?? []);
    $fromDomain = function_exists('mail_domain_of') ? mail_domain_of((string)$from['email']) : '';
    $hints = [];
    if ($mode === 'php_mail') {
        $hints[] = 'No SMTP, Apps Script or Resend configured — using PHP mail(), which most shared hosts silently drop. Easiest reliable fix: deploy apps-script/Code.gs and set apps_script_url (Google relays the mail), or set mail.resend_key, in api/config.php.';
    } elseif ($mode === 'apps_script') {
        $hints[] = 'Sending via the Google Apps Script Web App (MailApp). Make sure the script was deployed with the Mail scope accepted and its SHARED_SECRET matches api/config.php. Google sends from the account that owns the script.';
    } elseif ($mode === 'resend') {
        $hints[] = 'Using the Resend HTTPS API. Make sure mail.from_email is on a domain you have verified in the Resend dashboard, or delivery will be rejected.';
    }
    $isGmail = $mode === 'smtp' && preg_match('/gmail|googlemail|google\.com|smtp\.google/i', (string)($smtp['host'] ?? ''));
    $authUser = strtolower(trim((string)($smtp['user'] ?? '')));
    $fromEmail = strtolower((string)$from['email']);
    if ($isGmail) {
        // Gmail-specific: it rewrites the From to the authenticated account
        // unless it's a verified alias, and requires an App Password.
        if ($authUser !== '' && $fromEmail !== $authUser) {
            $hints[] = "Gmail rewrites the From to the signed-in account unless it's a verified alias. Recipients will see {$authUser}, not {$fromEmail}. Either set mail.from_email to {$authUser}, or add {$fromEmail} under Gmail → Settings → Accounts → \"Send mail as\" (Workspace) first.";
        }
        $hints[] = "Gmail SMTP needs an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password. Use smtp.gmail.com with port 587/secure 'tls' or 465/'ssl'. Consumer Gmail caps at ~500 messages/day.";
    } else {
        // Envelope/From must be a domain you're authorized to send for, or SPF fails.
        if ($fromDomain && $fromDomain !== 'localhost' && !preg_match('/afrovanguard\./i', $fromDomain)) {
            $hints[] = "From domain is {$fromDomain}. Make sure its DNS has SPF (and ideally DKIM/DMARC) authorizing this relay, or mail will be spam-filtered.";
        }
        if ($mode === 'smtp' && $authUser !== '' && $fromDomain && stripos($authUser, (string)$fromDomain) === false) {
            $hints[] = "SMTP auth user doesn't match the From domain ({$fromDomain}) — many relays reject or spam-flag a mismatched From. Align mail.from_email with the authenticated mailbox.";
        }
        // A deploy that missed api/_lib/phpmailer/ silently falls back to the
        // hand-rolled SMTP client, which fails on Gmail. Flag it explicitly.
        if ($mode === 'smtp' && !(function_exists('ngg_load_phpmailer') && ngg_load_phpmailer())) {
            $hints[] = 'PHPMailer is NOT present on the server (api/_lib/phpmailer/ missing from this deploy) — SMTP is using the fallback client, which fails against Gmail. Re-upload api/_lib/phpmailer/.';
        }
    }
    $phpmailer = function_exists('ngg_load_phpmailer') && ngg_load_phpmailer();
    // ok:true = the diagnostic ran; `delivered` says whether the send succeeded.
    return [
        'ok' => true, 'delivered' => $delivered, 'to' => $to, 'mode' => $mode,
        'phpmailer' => $phpmailer,
        'error' => (string)($GLOBALS['__mail_last_error'] ?? ''),
        'from' => (string)$from['email'], 'fromName' => (string)$from['name'],
        'replyTo' => (string)$from['replyTo'], 'fromDomain' => $fromDomain,
        'smtp' => $mode === 'smtp' ? [
            'host' => (string)($smtp['host'] ?? ''), 'port' => (int)($smtp['port'] ?? 587),
            'secure' => (string)($smtp['secure'] ?? 'tls'), 'authUser' => (string)($smtp['user'] ?? ''),
        ] : null,
        'hints' => $hints,
    ];
}

/** Editable site copy, merged over defaults so the homepage never breaks. */
function site_content_defaults(): array {
    return [
        'heroEyebrowLive'  => 'Live now',
        'heroTitle1'       => "Africa's next geniuses",
        'heroTitle2'       => 'are',
        'heroEmphasis'     => 'not waiting',
        'heroSubhead'      => 'A twelve-week growth journey for teenagers, 10–17. From summer student to vanguard leader — by mission, mentorship and the discipline of public work.',
        'heroCtaPrimary'   => 'Join the Summer Program',
        'heroCtaSecondary' => 'Explore Anchor 12',
        'movementTagline'  => 'Not a school. Not a club. The structured runway from teenage potential to African leadership — built mission by mission, week by week.',
    ];
}
function site_content(): array {
    $stored = setting_get('site_content');
    return array_merge(site_content_defaults(), is_array($stored) ? $stored : []);
}
function site_content_clean(array $in): array {
    $out = [];
    foreach (site_content_defaults() as $k => $def) {
        if (!array_key_exists($k, $in)) continue;
        $v = trim((string)$in[$k]);
        if ($v !== '') $out[$k] = substr($v, 0, $k === 'heroSubhead' || $k === 'movementTagline' ? 400 : 120);
    }
    return $out;
}

function public_site_content(array $p = []): array {
    // Homepage promo banner — served only while active (unexpired).
    $promo = setting_get('homepage_promo');
    $activePromo = null;
    if (is_array($promo) && !empty($promo['text'])) {
        $exp = (string)($promo['expires'] ?? '');
        if ($exp === '' || strtotime($exp) >= time()) {
            $activePromo = ['text' => (string)$promo['text'], 'ctaLabel' => (string)($promo['ctaLabel'] ?? ''), 'ctaUrl' => (string)($promo['ctaUrl'] ?? ''), 'expires' => $exp];
        }
    }
    return ['ok' => true, 'site' => site_content(), 'promo' => $activePromo];
}
