<?php
declare(strict_types=1);

/**
 * Anchor Circle — the consent-based, READ-ONLY link between a member (student)
 * and their parent / teacher / mentor.
 *
 *  - The student reads out a 6-digit invite code (members.anchorCode).
 *  - A guardian enters it in the Anchor Circle portal → we mint a signed,
 *    revocable portal token scoping {linkId, memberId, role}. No guardian
 *    account required (mentors may also just use a code per student).
 *  - Guardians can: see streak/systems/progress, confirm conduct days, leave a
 *    weekly remark, download a report. They can NEVER read reflections, notes,
 *    goals or coach chats — those ops simply don't exist on this surface.
 *
 * Member-side ops are session-gated by the route; portal ops are public and
 * authenticate purely via the signed token they pass in.
 */

// ── Signed portal token (HMAC, same key as sessions, distinct purpose tag) ──
function circle_token_sign(array $p): string {
    global $CONFIG;
    $now = time();
    $payload = ['k' => 'circle', 'lid' => $p['linkId'], 'mid' => $p['memberId'], 'role' => $p['role'], 'iat' => $now, 'exp' => $now + 180 * 24 * 3600];
    $body = b64url(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig = b64url(hash_hmac('sha256', $body, $CONFIG['cookie_secret'], true));
    return $body . '.' . $sig;
}
function circle_token_verify(string $token): ?array {
    global $CONFIG;
    $dot = strpos($token, '.');
    if ($dot === false) return null;
    $body = substr($token, 0, $dot); $sig = substr($token, $dot + 1);
    $expected = b64url(hash_hmac('sha256', $body, $CONFIG['cookie_secret'], true));
    if (!hash_equals($expected, $sig)) return null;
    $p = json_decode(b64url_decode($body), true);
    if (!is_array($p) || ($p['k'] ?? '') !== 'circle') return null;
    if (($p['exp'] ?? 0) < time()) return null;
    // The link must still be active.
    $link = db_row('SELECT * FROM circle_links WHERE linkId = ? LIMIT 1', [(string)($p['lid'] ?? '')]);
    if (!$link || $link['status'] !== 'active') return null;
    $p['link'] = $link;
    return $p;
}

function circle_monday(): string {
    $t = time();
    $dow = (int)gmdate('N', $t); // 1=Mon..7=Sun
    return gmdate('Y-m-d', $t - ($dow - 1) * 86400);
}

/** Ensure the member has a unique 6-digit invite code; return it. */
function circle_ensure_code(string $memberId): string {
    $m = db_row('SELECT anchorCode FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if ($m && !empty($m['anchorCode'])) return (string)$m['anchorCode'];
    for ($i = 0; $i < 30; $i++) {
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        if (!db_row('SELECT id FROM members WHERE anchorCode = ?', [$code])) {
            db_update('members', ['anchorCode' => $code], ['memberId' => $memberId]);
            return $code;
        }
    }
    return '';
}

// ── Student stat helpers (read-only aggregates; never expose private text) ──
function circle_week_stats(string $memberId): array {
    $mon = circle_monday();
    $end = gmdate('Y-m-d', strtotime($mon) + 7 * 86400);
    // Systems held per day this week (from member_state systems:DATE JSON).
    $rows = db_all("SELECT stateKey, stateValue FROM member_state WHERE memberId = ? AND stateKey LIKE 'systems:%'", [$memberId]);
    $byDay = [];
    foreach ($rows as $r) {
        $date = substr((string)$r['stateKey'], 8);
        if ($date < $mon || $date >= $end) continue;
        $v = json_decode((string)$r['stateValue'], true);
        $held = 0;
        if (is_array($v)) foreach ($v as $k => $val) { if ($k !== 'mood' && $val === true) $held++; }
        $byDay[$date] = $held;
    }
    $bars = []; $sum = 0; $cnt = 0;
    for ($i = 0; $i < 7; $i++) {
        $d = gmdate('Y-m-d', strtotime($mon) + $i * 86400);
        $held = $byDay[$d] ?? 0;
        $bars[] = ['date' => $d, 'held' => $held, 'pct' => (int)round(min(1, $held / 6) * 100)];
        if (isset($byDay[$d])) { $sum += $held; $cnt++; }
    }
    $avg = $cnt ? round($sum / $cnt, 1) : 0;
    return ['bars' => $bars, 'avgSystems' => $avg];
}

function circle_streak(string $memberId): int {
    $rows = db_all('SELECT DISTINCT substr(createdAt,1,10) d FROM journal WHERE memberId = ? ORDER BY d DESC LIMIT 400', [$memberId]);
    $days = [];
    foreach ($rows as $r) $days[(string)$r['d']] = true;
    $n = 0; $t = time();
    if (!isset($days[gmdate('Y-m-d', $t)])) { $t -= 86400; if (!isset($days[gmdate('Y-m-d', $t)])) return 0; }
    while (isset($days[gmdate('Y-m-d', $t)])) { $n++; $t -= 86400; }
    return $n;
}

function circle_student_stats(string $memberId): array {
    $mon = circle_monday();
    $end = gmdate('Y-m-d', strtotime($mon) + 7 * 86400);
    $ws = circle_week_stats($memberId);
    $reflections = (int)(db_row("SELECT COUNT(DISTINCT substr(createdAt,1,10)) c FROM journal WHERE memberId = ? AND substr(createdAt,1,10) >= ? AND substr(createdAt,1,10) < ?", [$memberId, $mon, $end])['c'] ?? 0);
    // Conduct = share of the 7-day week confirmed by ANY guardian.
    $confirmed = (int)(db_row("SELECT COUNT(DISTINCT date) c FROM circle_confirmations WHERE memberId = ? AND date >= ? AND date < ?", [$memberId, $mon, $end])['c'] ?? 0);
    return [
        'avgSystems' => $ws['avgSystems'], 'weekBars' => $ws['bars'],
        'reflections' => $reflections, 'streak' => circle_streak($memberId),
        'conduct' => (int)round($confirmed / 7 * 100),
    ];
}

// ── Member (student) side ────────────────────────────────────────────────────
function member_circle(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    if (!db_row('SELECT id FROM members WHERE memberId = ?', [$mid])) return ['ok' => false, 'error' => 'member_gone'];
    $code = circle_ensure_code($mid);
    $links = db_all("SELECT linkId, role, guardianName, status, lastSeenAt, createdAt FROM circle_links WHERE memberId = ? AND status = 'active' ORDER BY id DESC", [$mid]);
    $remarks = db_all("SELECT role, text, weekStart, createdAt FROM circle_remarks WHERE memberId = ? ORDER BY id DESC LIMIT 20", [$mid]);
    // Circle summary for the "Your Circle" rows (home/school/mentor linked?).
    $has = fn($role) => (bool)db_row("SELECT id FROM circle_links WHERE memberId = ? AND role = ? AND status = 'active' LIMIT 1", [$mid, $role]);
    return ['ok' => true, 'code' => $code, 'links' => $links, 'remarks' => $remarks,
        'circle' => ['parent' => $has('parent'), 'teacher' => $has('teacher'), 'mentor' => $has('mentor')]];
}

function member_circle_rotate(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    db_update('members', ['anchorCode' => null], ['memberId' => $mid]);
    $code = circle_ensure_code($mid);
    audit('circle.rotate', $mid, $mid, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'code' => $code];
}

function member_circle_revoke(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    $linkId = (string)($p['linkId'] ?? '');
    $n = db_update('circle_links', ['status' => 'revoked', 'revokedAt' => now_iso()], ['linkId' => $linkId, 'memberId' => $mid]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('circle.revoke', $mid, $linkId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Portal (guardian) side — code-based, no account ─────────────────────────
function circle_lookup(array $p): array {
    $code = preg_replace('/\D/', '', (string)($p['code'] ?? ''));
    if (strlen($code) !== 6) return ['ok' => false, 'error' => 'bad_code'];
    $m = db_row('SELECT memberId, fullName, dob, type FROM members WHERE anchorCode = ? LIMIT 1', [$code]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'student' => ['name' => $m['fullName'], 'memberId' => $m['memberId']]];
}

function circle_connect(array $p): array {
    $code = preg_replace('/\D/', '', (string)($p['code'] ?? ''));
    $role = (string)($p['role'] ?? '');
    if (!in_array($role, ['parent', 'teacher', 'mentor'], true)) return ['ok' => false, 'error' => 'bad_role'];
    if (empty($p['consent'])) return ['ok' => false, 'error' => 'consent_required'];
    $m = db_row('SELECT memberId, fullName FROM members WHERE anchorCode = ? LIMIT 1', [$code]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $linkId = 'CL-' . strtoupper(rand_hex(6));
    db_insert('circle_links', [
        'linkId' => $linkId, 'memberId' => $m['memberId'], 'role' => $role,
        'guardianName' => substr((string)($p['guardianName'] ?? ''), 0, 120),
        'status' => 'active', 'createdAt' => now_iso(), 'lastSeenAt' => now_iso(),
    ]);
    audit('circle.connect', $m['memberId'], $linkId, ['role' => $role], (string)($p['ip'] ?? ''));
    $token = circle_token_sign(['linkId' => $linkId, 'memberId' => $m['memberId'], 'role' => $role]);
    return ['ok' => true, 'token' => $token, 'student' => ['name' => $m['fullName'], 'memberId' => $m['memberId']], 'role' => $role];
}

/** Resolve + touch a portal token, or return an error array. */
function circle_portal_ctx(array $p) {
    $ctx = circle_token_verify((string)($p['token'] ?? ''));
    if (!$ctx) return ['ok' => false, 'error' => 'link_invalid'];
    db_update('circle_links', ['lastSeenAt' => now_iso()], ['linkId' => $ctx['lid']]);
    return $ctx;
}

function circle_dashboard(array $p): array {
    $ctx = circle_portal_ctx($p);
    if (isset($ctx['ok']) && $ctx['ok'] === false) return $ctx;
    $mid = $ctx['mid']; $lid = $ctx['lid'];
    $m = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $stats = circle_student_stats($mid);
    $mine = db_all("SELECT date FROM circle_confirmations WHERE linkId = ? ORDER BY date DESC LIMIT 60", [$lid]);
    return ['ok' => true, 'role' => $ctx['role'], 'student' => ['name' => $m['fullName']],
        'stats' => $stats, 'confirmed' => array_map(fn($r) => $r['date'], $mine),
        'weekStart' => circle_monday()];
}

function circle_confirm(array $p): array {
    $ctx = circle_portal_ctx($p);
    if (isset($ctx['ok']) && $ctx['ok'] === false) return $ctx;
    $date = (string)($p['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    $on = !empty($p['on']);
    $exists = db_row('SELECT id FROM circle_confirmations WHERE linkId = ? AND date = ?', [$ctx['lid'], $date]);
    if ($on && !$exists) {
        db_insert('circle_confirmations', ['linkId' => $ctx['lid'], 'memberId' => $ctx['mid'], 'role' => $ctx['role'], 'date' => $date, 'createdAt' => now_iso()]);
    } elseif (!$on && $exists) {
        db_exec('DELETE FROM circle_confirmations WHERE linkId = ? AND date = ?', [$ctx['lid'], $date]);
    }
    return ['ok' => true, 'date' => $date, 'on' => $on];
}

function circle_remark(array $p): array {
    $ctx = circle_portal_ctx($p);
    if (isset($ctx['ok']) && $ctx['ok'] === false) return $ctx;
    $text = trim((string)($p['text'] ?? ''));
    if (strlen($text) < 2) return ['ok' => false, 'error' => 'empty'];
    db_insert('circle_remarks', ['linkId' => $ctx['lid'], 'memberId' => $ctx['mid'], 'role' => $ctx['role'], 'weekStart' => circle_monday(), 'text' => substr($text, 0, 1000), 'createdAt' => now_iso()]);
    audit('circle.remark', $ctx['mid'], $ctx['lid'], ['role' => $ctx['role']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function circle_report(array $p): array {
    $ctx = circle_portal_ctx($p);
    if (isset($ctx['ok']) && $ctx['ok'] === false) return $ctx;
    $m = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$ctx['mid']]);
    $stats = circle_student_stats($ctx['mid']);
    $remarks = db_all("SELECT role, text, createdAt FROM circle_remarks WHERE memberId = ? ORDER BY id DESC LIMIT 10", [$ctx['mid']]);
    return ['ok' => true, 'report' => ['student' => $m['fullName'] ?? '', 'weekStart' => circle_monday(), 'stats' => $stats, 'remarks' => $remarks, 'role' => $ctx['role']]];
}
