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
    /* Out of however many systems there ARE.
     *
     * This used to divide by a hardcoded six while the journal scored against
     * the live, admin-editable list (SYSTEMS.length || 6). Trim a centre's list
     * to four and a child who held every one of them read 4/4 in their own
     * journal while the report their guardian receives showed 67% — and the
     * number that starts a conversation was the wrong one. The total travels
     * with the bars so nobody has to assume it. */
    $total = 6;
    if (function_exists('anchor_content')) {
        $c = anchor_content();
        if (is_array($c['systems'] ?? null) && count($c['systems']) > 0) $total = count($c['systems']);
    }
    $bars = []; $sum = 0; $cnt = 0;
    for ($i = 0; $i < 7; $i++) {
        $d = gmdate('Y-m-d', strtotime($mon) + $i * 86400);
        $held = $byDay[$d] ?? 0;
        $bars[] = ['date' => $d, 'held' => $held, 'pct' => (int)round(min(1, $held / $total) * 100)];
        if (isset($byDay[$d])) { $sum += $held; $cnt++; }
    }
    $avg = $cnt ? round($sum / $cnt, 1) : 0;
    return ['bars' => $bars, 'avgSystems' => $avg, 'systemsTotal' => $total];
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
    // Behavioural read (from the shared momentum engine) so the guardian sees the
    // same at-risk signal the member does — enabling a timely, gentle intervention.
    $m = momentum_signals($memberId);
    $atRisk = $m['streak'] === 0 || $m['consistency'] < 40 || $m['trend'] === 'dipping';
    return [
        'avgSystems' => $ws['avgSystems'], 'systemsTotal' => $ws['systemsTotal'], 'weekBars' => $ws['bars'],
        'reflections' => $reflections, 'streak' => $m['streak'],
        'conduct' => (int)round($confirmed / 7 * 100),
        'consistency' => $m['consistency'], 'trend' => $m['trend'],
        'longestStreak' => $m['longestStreak'], 'atRisk' => $atRisk,
    ];
}

/** A short, role-aware, non-judgmental action the guardian can take now. */
function circle_suggestion(string $role, array $stats): string {
    if (!($stats['atRisk'] ?? false)) {
        return "They're consistent right now — a specific word of praise reinforces it.";
    }
    switch ($role) {
        case 'teacher': return "Attendance to reflection is slipping. A quiet word of encouragement in class can restart it.";
        case 'mentor':  return "Momentum is dipping — a short check-in call this week can help them begin again.";
        default:        return "Reflection has slowed. Ask warmly about their study time today, without pressure.";
    }
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
        'family' => function_exists('family_links_for_member') ? family_links_for_member($mid) : [],
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
    // Rotate the invite code so a revoked adult who memorised it cannot silently
    // re-pair — this is what "they lose access immediately" actually requires.
    // Existing active links authenticate via their signed linkId token, not the
    // code, so they are unaffected; only fresh pairing needs the new code.
    db_update('members', ['anchorCode' => null], ['memberId' => $mid]);
    $newCode = circle_ensure_code($mid);
    audit('circle.revoke', $mid, $linkId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'code' => $newCode];
}

// ── Portal (guardian) side — code-based, no account ─────────────────────────

/**
 * Resolve a pairing code, but ONLY to someone who can already name the child.
 *
 * The code is six digits, which is a keyspace of 10^6 and typed by hand for
 * good reason — a guardian has to be able to read it off a slip. On its own
 * that is fine. What was not fine is what a correct guess bought: `lookup`
 * answered with the child's full legal name, and `connect` then minted a
 * guardian portal token carrying attendance, streaks, at-risk state and
 * mentor remarks. Rate limiting raises the cost of walking the space from one
 * address; it does nothing about a hundred addresses, and it is the wrong
 * control for an oracle anyway.
 *
 * So the name is no longer something this endpoint TELLS you. It is something
 * you must already know for it to answer at all: supply the child's name
 * alongside the code and the server confirms or denies. A guessed code with no
 * name attached now yields exactly nothing, which is the property that
 * actually closes the hole.
 *
 * Any part of the name counts. Guardians type what they call the child, and
 * families order their names differently — insisting on "the surname" would
 * fail honest people while doing nothing to an attacker, who has to know a
 * name either way.
 *
 * Wrong code and wrong name return the SAME error. Distinguishing them would
 * hand back the oracle in the other direction: "right code, wrong name" tells
 * you a code is live and worth attacking.
 *
 * A happy side effect: a mistyped code that collides with another child's now
 * fails instead of quietly pairing a stranger to that child's dashboard.
 */
function circle_match(string $code, string $name): ?array {
    $code = preg_replace('/\D/', '', $code);
    if (strlen($code) !== 6) return null;
    $given = trim(preg_replace('/\s+/', ' ', $name));
    // Two characters is not a name; without a floor, "a" would match almost
    // any record and the check would be decorative.
    if (mb_strlen($given) < 2) return null;
    $m = db_row('SELECT memberId, fullName FROM members WHERE anchorCode = ? LIMIT 1', [$code]);
    if (!$m) return null;
    $parts = preg_split('/\s+/', mb_strtolower(trim((string)$m['fullName']))) ?: [];
    $want = mb_strtolower($given);
    // The whole name typed out is accepted too, not just one part of it.
    if ($want === mb_strtolower(trim((string)$m['fullName']))) return $m;
    foreach ($parts as $part) if ($part !== '' && $part === $want) return $m;
    return null;
}

/* Guessing a child's invite code, bounded.
 *
 * The code is six digits and it resolves — with a matching name part — to a
 * child's name and member id. config.example.php calls the IP bucket in front
 * of this a "safeguarding throttle", and until client_ip() stopped believing
 * forwarded headers that is all it was: a limit the caller could opt out of by
 * changing a header between requests.
 *
 * Counted against the CODE. That bounds the case this most needs bounding —
 * somebody who knows which child they are after and is working through the
 * codes that could be theirs. Broad enumeration across many codes is bounded by
 * the IP bucket instead, which is now worth something. (The deeper fix for
 * enumeration is more entropy in the code itself; that is a change to something
 * printed on paper and handed to families, so it is not made here.)
 */
function circle_guess_guard(string $code): ?array {
    $key = preg_replace('/\D/', '', $code);
    if ($key !== '' && attempt_locked('circle.code', $key)) {
        return ['ok' => false, 'error' => 'too_many_attempts'];
    }
    return null;
}
function circle_guess_failed(string $code, string $ip = ''): void {
    $key = preg_replace('/\D/', '', $code);
    if ($key === '') return;
    /* Ten, and fifteen minutes — deliberately not tighter.
     *
     * A lock keyed on the code protects that child, and can also be used
     * AGAINST them: anybody who can fail ten times can keep a real guardian
     * from connecting for as long as they keep failing. So the number has to
     * hold two things at once, and the guessing side has enormous headroom to
     * give away. Ten per fifteen minutes is forty an hour against a million
     * codes — some three thousand years to walk the space — while a locked-out
     * family waits a quarter of an hour rather than until tomorrow. */
    if (attempt_fail('circle.code', $key, 10, 900)) {
        audit('circle.code_lockout', 'guardian', substr($key, 0, 2) . '••••', [], $ip);
    }
}

function circle_lookup(array $p): array {
    $code = (string)($p['code'] ?? '');
    if ($blocked = circle_guess_guard($code)) return $blocked;
    $m = circle_match($code, (string)($p['name'] ?? ''));
    if (!$m) { circle_guess_failed($code, (string)($p['ip'] ?? '')); return ['ok' => false, 'error' => 'not_found']; }
    attempt_reset('circle.code', preg_replace('/\D/', '', $code));
    return ['ok' => true, 'student' => ['name' => $m['fullName'], 'memberId' => $m['memberId']]];
}

function circle_connect(array $p): array {
    $role = (string)($p['role'] ?? '');
    if (!in_array($role, ['parent', 'teacher', 'mentor'], true)) return ['ok' => false, 'error' => 'bad_role'];
    if (empty($p['consent'])) return ['ok' => false, 'error' => 'consent_required'];
    // Checked here too, not just on lookup. `connect` is a separate request and
    // nothing stops it being called directly — a gate that only guards the
    // step before it is not a gate. The attempt guard likewise: a ceiling that
    // only covers the read half is a ceiling with a door beside it.
    $code = (string)($p['code'] ?? '');
    if ($blocked = circle_guess_guard($code)) return $blocked;
    $m = circle_match($code, (string)($p['name'] ?? ''));
    if (!$m) { circle_guess_failed($code, (string)($p['ip'] ?? '')); return ['ok' => false, 'error' => 'not_found']; }
    attempt_reset('circle.code', preg_replace('/\D/', '', $code));
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
        'stats' => $stats, 'suggestion' => circle_suggestion($ctx['role'], $stats),
        'confirmed' => array_map(fn($r) => $r['date'], $mine),
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

/**
 * Cohort strip — summarise every student this DEVICE holds a valid portal
 * token for (mentors/teachers pair with several mentees, one code each).
 * The tokens themselves are the authority: no account, no extra scope —
 * each summary is exactly what that token's dashboard already exposes,
 * minus anything private. Invalid/revoked tokens are silently skipped so
 * the client can prune them.
 */
function circle_cohort(array $p): array {
    $tokens = is_array($p['tokens'] ?? null) ? array_slice($p['tokens'], 0, 30) : [];
    $out = []; $seen = [];
    foreach ($tokens as $t) {
        if (!is_string($t) || $t === '') continue;
        $ctx = circle_token_verify($t);
        if (!$ctx) continue;
        $mid = (string)$ctx['mid'];
        if (isset($seen[$mid])) continue;
        $seen[$mid] = true;
        $m = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$mid]);
        if (!$m) continue;
        $s = momentum_signals($mid);
        $atRisk = $s['streak'] === 0 || $s['consistency'] < 40 || $s['trend'] === 'dipping';
        $out[] = [
            'token' => $t, 'name' => (string)$m['fullName'], 'role' => (string)$ctx['role'],
            'streak' => $s['streak'], 'trend' => $s['trend'], 'consistency' => $s['consistency'],
            'reflectedToday' => $s['reflectedToday'], 'atRisk' => $atRisk,
        ];
    }
    return ['ok' => true, 'students' => $out];
}

function circle_report(array $p): array {
    $ctx = circle_portal_ctx($p);
    if (isset($ctx['ok']) && $ctx['ok'] === false) return $ctx;
    $m = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$ctx['mid']]);
    $stats = circle_student_stats($ctx['mid']);
    $remarks = db_all("SELECT role, text, createdAt FROM circle_remarks WHERE memberId = ? ORDER BY id DESC LIMIT 10", [$ctx['mid']]);
    return ['ok' => true, 'report' => ['student' => $m['fullName'] ?? '', 'weekStart' => circle_monday(), 'stats' => $stats, 'suggestion' => circle_suggestion($ctx['role'], $stats), 'remarks' => $remarks, 'role' => $ctx['role']]];
}
