<?php
declare(strict_types=1);

/**
 * Signed session cookies + a server-side device register. Format:
 *   base64url(JSON payload) . "." . base64url(HMAC-SHA256(payload, cookie_secret))
 *
 * Payload includes: memberId, role, type, status, exp, iat, adminOk (2FA pass
 * flag) and sid — a row in device_sessions that makes every sign-in listable
 * and remotely revocable (require_session enforces revocation). Sessions
 * predating sid remain valid until natural expiry, just unmanaged.
 */

/** 30 days — the "stay signed in" window offered at sign-in. */
const SESSION_REMEMBER_TTL = 2592000;

function session_issue(array $member, bool $adminOk = false, string $impBy = '', bool $remember = false, array $extra = []): string {
    global $CONFIG;
    $now = time();
    $sid = rand_hex(20);
    $ttl = $remember ? SESSION_REMEMBER_TTL : (int)$CONFIG['session_ttl'];
    $payload = [
        'mid'     => $member['memberId'] ?? '',
        'role'    => $member['role'] ?? 'member',
        'type'    => $member['type'] ?? '',
        'status'  => $member['status'] ?? '',
        'iat'     => $now,
        'exp'     => $now + $ttl,
        'adminOk' => $adminOk,
        'sid'     => $sid,
    ];
    if ($impBy !== '') $payload['imp'] = $impBy; // super-admin impersonation marker
    // mfaP: the second sign-in step this session still owes (mfa.php).
    foreach ($extra as $k => $v) if (in_array($k, ['mfaP'], true) && $v !== '' && $v !== null) $payload[$k] = $v;
    $body = b64url(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig  = b64url(hash_hmac('sha256', $body, $CONFIG['cookie_secret'], true));
    $token = $body . '.' . $sig;

    setcookie($CONFIG['cookie_name'], $token, [
        'expires'  => $payload['exp'],
        'path'     => '/',
        'domain'   => $CONFIG['cookie_domain'] ?: '',
        'secure'   => (bool)$CONFIG['cookie_secure'],
        'httponly' => true,
        'samesite' => $CONFIG['cookie_samesite'],
    ]);

    // A real sign-in (not a super-admin acting as somebody) marks this browser
    // as one that has signed in before — see device_trust_issue().
    if ($impBy === '') device_trust_issue();

    // Device register + new-device alert. Best-effort: sign-in must never
    // fail because bookkeeping did.
    try {
        $ip = function_exists('client_ip') ? client_ip() : '';
        $ua = function_exists('client_ua') ? client_ua() : '';
        $uaHash = substr(sha1($ua), 0, 16);
        $mid = (string)($member['memberId'] ?? '');
        $knownDevice = db_row('SELECT id FROM device_sessions WHERE memberId = ? AND uaHash = ? LIMIT 1', [$mid, $uaHash]);
        $everSignedIn = $knownDevice ?: db_row('SELECT id FROM device_sessions WHERE memberId = ? LIMIT 1', [$mid]);
        db_insert('device_sessions', [
            'sid' => $sid, 'memberId' => $mid, 'ip' => $ip,
            'userAgent' => $ua, 'uaHash' => $uaHash,
            'createdAt' => now_iso(), 'lastSeenAt' => now_iso(),
        ]);
        if (!$knownDevice && $everSignedIn) {
            security_notify_new_device($member, $ip, $ua);
        }
    } catch (Throwable $e) { /* bookkeeping only */ }

    return $token;
}

/**
 * "This browser has signed in here before" — a second, long-lived cookie that
 * outlives sign-out on purpose: it is what lets the sign-in door give a known
 * device a plain "no account with that email" while a stranger's browser gets
 * the neutral answer (auth_find_member()).
 *
 * It names no member — only a random device id, an issue time and an expiry,
 * HMAC-signed with cookie_secret under its own label so it can never be
 * passed off as a session (and a session can never be passed off as it). It
 * grants nothing: no session, no data, only a slightly franker error message
 * on a small daily allowance. A valid id is kept across sign-ins; the expiry
 * slides.
 */
const DEVICE_TRUST_TTL = 180 * 86400;

function device_trust_cookie_name(): string {
    global $CONFIG;
    return (string)($CONFIG['cookie_name'] ?? 'ngg_sess') . '_dev';
}

function device_trust_sign(string $body): string {
    global $CONFIG;
    return b64url(hash_hmac('sha256', 'device-trust|' . $body, (string)$CONFIG['cookie_secret'], true));
}

/** The device id from a valid, unexpired cookie, or '' — never trusts an unsigned value. */
function device_trust_id(?string $token = null): string {
    $token = $token ?? (string)($_COOKIE[device_trust_cookie_name()] ?? '');
    if ($token === '' || strlen($token) > 400 || substr_count($token, '.') !== 1) return '';
    [$body, $sig] = explode('.', $token, 2);
    if (!hash_equals(device_trust_sign($body), $sig)) return '';
    $p = json_decode((string)b64url_decode($body), true);
    if (!is_array($p) || (int)($p['exp'] ?? 0) < time()) return '';
    $d = (string)($p['d'] ?? '');
    return preg_match('/^[0-9a-f]{24}$/', $d) ? $d : '';
}

/** Mint (or refresh) the device cookie; returns the token. */
function device_trust_issue(): string {
    global $CONFIG;
    $d = device_trust_id();
    if ($d === '') $d = rand_hex(12);
    $exp = time() + DEVICE_TRUST_TTL;
    $body = b64url(json_encode(['d' => $d, 'iat' => time(), 'exp' => $exp], JSON_UNESCAPED_SLASHES));
    $token = $body . '.' . device_trust_sign($body);
    if (!headers_sent()) {
        setcookie(device_trust_cookie_name(), $token, [
            'expires'  => $exp, 'path' => '/', 'domain' => $CONFIG['cookie_domain'] ?: '',
            'secure'   => (bool)$CONFIG['cookie_secure'], 'httponly' => true, 'samesite' => $CONFIG['cookie_samesite'],
        ]);
    }
    return $token;
}

/**
 * "New device signed in" alert — the strict-monitoring promise made at
 * member first-run. NGG members and all staff tiers get it; casual Anchor
 * accounts don't (their threat model doesn't warrant the noise).
 */
function security_notify_new_device(array $member, string $ip, string $ua): void {
    $strict = strtoupper((string)($member['type'] ?? '')) === 'NGG' || is_admin_role((string)($member['role'] ?? ''));
    if (!$strict || empty($member['email'])) return;
    audit('login.new_device', $member['memberId'] ?? null, (string)($member['memberId'] ?? ''), ['ip' => $ip, 'ua' => substr($ua, 0, 120)], $ip);
    $first = explode(' ', (string)($member['fullName'] ?? ''))[0] ?? '';
    $html = email_template([
        'title' => 'New sign-in to your NGG account',
        'intro' => 'Hi ' . ($first ?: 'there') . ', your account was just used on a device we haven\'t seen before.',
        'bodyHtml' => '<p style="margin:0 0 8px">Around ' . esc_html(gmdate('H:i')) . ' UTC · IP ' . esc_html($ip ?: 'unknown') . '</p>'
            . '<p style="margin:0 0 8px;color:#8a93b8;font-size:13px">' . esc_html(substr($ua, 0, 140) ?: 'Unknown device') . '</p>'
            . '<p style="margin:12px 0 0">If this was you, no action is needed. If not, sign in and revoke it under <b>Me → Security</b>, then change your password.</p>',
    ]);
    send_mail((string)$member['email'], 'New sign-in to your NGG account', $html);
}

/**
 * Mint a short-lived, gate-scoped KIOSK session — issued only after a gate's
 * password is verified (gate_unlock). It is NEVER an admin session: role
 * 'kiosk', no adminOk, and a 'gate' claim binding it to exactly one gate. The
 * gate route re-checks gate_resolve() on every request, so revoking the gate
 * link instantly disables every kiosk session riding on it. Not registered in
 * device_sessions — its authority is the gate, and it expires with the gate.
 */
function session_issue_kiosk(array $gate): string {
    global $CONFIG;
    $now = time();
    $ttl = (int)($CONFIG['kiosk_ttl'] ?? 43200); // 12h default
    $exp = $now + $ttl;
    if (!empty($gate['expiresAt'])) { $ge = strtotime((string)$gate['expiresAt']); if ($ge && $ge < $exp) $exp = $ge; }
    $payload = [
        'mid'     => 'kiosk:' . ($gate['gateId'] ?? ''),
        'role'    => 'kiosk', 'type' => 'KIOSK', 'status' => 'active',
        'gate'    => (string)($gate['gateId'] ?? ''),
        'iat'     => $now, 'exp' => $exp, 'adminOk' => false, 'kiosk' => true,
    ];
    $body = b64url(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig  = b64url(hash_hmac('sha256', $body, $CONFIG['cookie_secret'], true));
    $token = $body . '.' . $sig;
    setcookie($CONFIG['cookie_name'], $token, [
        'expires'  => $exp, 'path' => '/', 'domain' => $CONFIG['cookie_domain'] ?: '',
        'secure'   => (bool)$CONFIG['cookie_secure'], 'httponly' => true, 'samesite' => $CONFIG['cookie_samesite'],
    ]);
    return $token;
}

/**
 * A scoped session for a summer student signing in with their ID card. Modeled
 * on the kiosk session: a signed cookie, no device_sessions row, short TTL,
 * role 'student' (non-staff → require_session treats it leniently). The `mid`
 * IS the studentId, so community attribution/reactions key off a real id.
 */
function session_issue_student(array $student, bool $remember = false): string {
    return session_issue_cardholder($student, 'student', $remember);
}

/**
 * A session for someone who holds an ID card but has no member account:
 * a summer student, or a volunteer/instructor/mentor. `$kind` becomes the
 * session role, so the community can tell an instructor from a student, and
 * `mid` is their own id in whichever table they live in. Neither kind carries
 * any capability — the app unlocks the Community and nothing else.
 */
function session_issue_cardholder(array $person, string $kind, bool $remember = false, array $extra = []): string {
    global $CONFIG;
    $kind = $kind === 'volunteer' ? 'volunteer' : 'student';
    $student = ['studentId' => (string)($person['studentId'] ?? $person['volunteerId'] ?? '')];
    $now = time();
    // Default is a short, kiosk-like window (shared devices at a centre); a
    // student who opts to "stay signed in" gets the same 30-day window as members.
    $exp = $now + ($remember ? SESSION_REMEMBER_TTL : (int)($CONFIG['kiosk_ttl'] ?? 43200));
    $payload = [
        'mid'    => (string)($student['studentId'] ?? ''),
        'role'   => $kind, 'type' => $kind === 'volunteer' ? 'VOLUNTEER' : 'SUMMER', 'status' => 'active',
        'stu'    => (string)($student['studentId'] ?? ''),
        'iat'    => $now, 'exp' => $exp, 'adminOk' => false,
    ];
    if (!empty($extra['mfaP'])) $payload['mfaP'] = (string)$extra['mfaP'];
    $body = b64url(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig  = b64url(hash_hmac('sha256', $body, $CONFIG['cookie_secret'], true));
    $token = $body . '.' . $sig;
    setcookie($CONFIG['cookie_name'], $token, [
        'expires'  => $exp, 'path' => '/', 'domain' => $CONFIG['cookie_domain'] ?: '',
        'secure'   => (bool)$CONFIG['cookie_secure'], 'httponly' => true, 'samesite' => $CONFIG['cookie_samesite'],
    ]);
    return $token;
}

/* ── Family accounts ──────────────────────────────────────────────────────
 *
 * A parent's or guardian's session. It is a different PRINCIPAL from a member,
 * so it gets a different cookie and a different signing key:
 *
 *   - its own cookie (`<cookie_name>_family`), so a parent who is also a member
 *     or a member of staff can hold both on one browser, and no member route
 *     ever sees a guardian — require_session() never reads this cookie;
 *   - its own key derivation ("family|" + secret), so copying the value into
 *     the member cookie fails the signature instead of arriving as a session
 *     with an empty memberId.
 *
 * The cookie carries the guardian's `sessionEpoch`; require_family() checks it
 * against the row on every request, so "sign out everywhere" and a staff
 * suspension end every copy at once without a device register.
 */
function family_cookie_name(): string { return (string)($GLOBALS['CONFIG']['cookie_name'] ?? 'ngg_sess') . '_family'; }
function family_cookie_key(): string { return 'family|' . (string)($GLOBALS['CONFIG']['cookie_secret'] ?? ''); }

function session_issue_family(array $guardian, bool $remember = false, array $extra = []): string {
    global $CONFIG;
    $now = time();
    $exp = $now + ($remember ? SESSION_REMEMBER_TTL : max(3600, (int)($CONFIG['session_ttl'] ?? 86400)));
    $payload = ['k' => 'family', 'gid' => (string)$guardian['guardianId'], 'ep' => (int)($guardian['sessionEpoch'] ?? 1), 'iat' => $now, 'exp' => $exp];
    if (!empty($extra['mfaP'])) $payload['mfaP'] = (string)$extra['mfaP'];
    return family_cookie_write($payload);
}

/** Sign and set a family payload (issue, and the re-sign when the second step is passed). */
function family_cookie_write(array $payload): string {
    global $CONFIG;
    $exp = (int)$payload['exp'];
    $body = b64url(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $token = $body . '.' . b64url(hash_hmac('sha256', $body, family_cookie_key(), true));
    setcookie(family_cookie_name(), $token, [
        'expires' => $exp, 'path' => '/', 'domain' => $CONFIG['cookie_domain'] ?: '',
        'secure' => (bool)$CONFIG['cookie_secure'], 'httponly' => true, 'samesite' => $CONFIG['cookie_samesite'],
    ]);
    return $token;
}

function family_session_clear(): void {
    global $CONFIG;
    setcookie(family_cookie_name(), '', ['expires' => time() - 3600, 'path' => '/', 'domain' => $CONFIG['cookie_domain'] ?: '',
        'secure' => (bool)$CONFIG['cookie_secure'], 'httponly' => true, 'samesite' => $CONFIG['cookie_samesite']]);
}

/** The signed payload, or null. Signature and expiry only — require_family() asks the database. */
function family_session_read(?string $raw = null): ?array {
    $raw = $raw ?? (string)($_COOKIE[family_cookie_name()] ?? '');
    $dot = strpos($raw, '.');
    if ($raw === '' || $dot === false) return null;
    $body = substr($raw, 0, $dot);
    if (!hash_equals(b64url(hash_hmac('sha256', $body, family_cookie_key(), true)), substr($raw, $dot + 1))) return null;
    $p = json_decode(b64url_decode($body), true);
    if (!is_array($p) || ($p['k'] ?? '') !== 'family' || (int)($p['exp'] ?? 0) < time() || (string)($p['gid'] ?? '') === '') return null;
    return $p;
}

/** A live guardian session, or a 401. Returns ['gid' => …, 'guardian' => row]. */
function require_family(): array {
    $p = family_session_read();
    if (!$p) json_error('unauthorized', 401);
    $g = db_row('SELECT * FROM guardians WHERE guardianId = ? LIMIT 1', [(string)$p['gid']]);
    if (!$g || (string)$g['status'] !== 'active' || (int)$g['sessionEpoch'] !== (int)$p['ep']) {
        family_session_clear();
        json_error('unauthorized', 401);
    }
    if (!empty($p['mfaP']) && empty($GLOBALS['__mfa_pending_ok'])) json_error('mfa_required', 401);
    if (time() - (strtotime((string)($g['lastSeenAt'] ?? '')) ?: 0) > 300) {
        try { db_update('guardians', ['lastSeenAt' => now_iso()], ['id' => (int)$g['id']]); } catch (Throwable $e) {}
    }
    return ['gid' => (string)$g['guardianId'], 'guardian' => $g, 'mfaP' => (string)($p['mfaP'] ?? ''), 'payload' => $p];
}

/**
 * Re-sign the current session with the second step marked as passed: same
 * sid, same expiry, same device row — so passing it is not a second sign-in,
 * and a cookie still owing it can never be copied into one that does not.
 */
function session_mfa_clear(array $s): string {
    global $CONFIG;
    unset($s['mfaP']);
    $s['mfaAt'] = time();
    $body = b64url(json_encode($s, JSON_UNESCAPED_SLASHES));
    $token = $body . '.' . b64url(hash_hmac('sha256', $body, $CONFIG['cookie_secret'], true));
    setcookie($CONFIG['cookie_name'], $token, [
        'expires' => (int)$s['exp'], 'path' => '/', 'domain' => $CONFIG['cookie_domain'] ?: '',
        'secure' => (bool)$CONFIG['cookie_secure'], 'httponly' => true, 'samesite' => $CONFIG['cookie_samesite'],
    ]);
    $_COOKIE[$CONFIG['cookie_name']] = $token;
    return $token;
}

/** The family cookie's equivalent of session_mfa_clear(). */
function family_session_mfa_clear(array $p): string {
    unset($p['mfaP']);
    $p['mfaAt'] = time();
    $t = family_cookie_write($p);
    $_COOKIE[family_cookie_name()] = $t;
    return $t;
}

/** The handful of routes a session still owing its second step may reach:
 *  the step itself, who-am-I, and sign-out. Everything else answers mfa_required. */
function session_allow_mfa_pending(): void { $GLOBALS['__mfa_pending_ok'] = true; }

function session_clear(): void {
    global $CONFIG;
    setcookie($CONFIG['cookie_name'], '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'domain'   => $CONFIG['cookie_domain'] ?: '',
        'secure'   => (bool)$CONFIG['cookie_secure'],
        'httponly' => true,
        'samesite' => $CONFIG['cookie_samesite'],
    ]);
}

function session_read(): ?array {
    global $CONFIG;
    $name = $CONFIG['cookie_name'];
    if (empty($_COOKIE[$name])) return null;
    $raw = $_COOKIE[$name];
    $dot = strpos($raw, '.');
    if ($dot === false) return null;
    $body = substr($raw, 0, $dot);
    $sig  = substr($raw, $dot + 1);
    $expected = b64url(hash_hmac('sha256', $body, $CONFIG['cookie_secret'], true));
    if (!hash_equals($expected, $sig)) return null;
    $payload = json_decode(b64url_decode($body), true);
    if (!is_array($payload)) return null;
    if (!isset($payload['exp']) || $payload['exp'] < time()) return null;
    return $payload;
}

/* Mark a live session as still in use, without asserting anything about it.
 *
 * The staff idle window is deliberately tight (30 minutes), and `lastSeenAt`
 * only advances inside require_session() — i.e. on a call that actually does
 * something. An admin reading a roster, composing a long form or working
 * through a printed list makes no such call, so the clock ran out while they
 * were sitting right there, and the next click threw them to the sign-in
 * screen. That is what "the admin keeps signing out" was.
 *
 * This is the other half of the fix: a heartbeat the client sends only while
 * someone is genuinely interacting with the page. A walked-away laptop still
 * locks at 30 minutes, which is the point of the policy — but a person at the
 * keyboard is no longer treated as absent.
 *
 * Deliberately quiet: no session, revoked, or missing row and it simply does
 * nothing. Enforcement belongs in require_session(); this must never be the
 * thing that logs somebody out. Writes are throttled the same 5 minutes, so
 * a chatty client costs one UPDATE per session per five minutes at most.
 */
/**
 * The staff idle window, in seconds. 0 disables it.
 *
 * Admin-settable, because the right number is an operational decision this
 * programme has to make, not one buried in a config file only a developer can
 * reach. The floor keeps someone from setting it so low the console is
 * unusable; the ceiling keeps "never" from being a slip of the keyboard.
 */
function session_idle_max(bool $isStaff): int {
    $cfg = $GLOBALS['CONFIG']['session_idle'] ?? [];
    if (!$isStaff) return (int)($cfg['member'] ?? 43200);
    /* setting_raw, not setting_get: safe_json() returns null for anything that
     * is not a JSON array, so a plain number read back as nothing and the
     * admin's choice was silently ignored. */
    $set = setting_raw('session_idle_admin');
    if (is_numeric($set)) {
        $v = (int)$set;
        return $v <= 0 ? 0 : max(300, min(86400, $v));
    }
    return (int)($cfg['admin'] ?? 1800);
}

/** When this session's idle clock runs out (unix seconds; 0 = no idle limit). */
function session_idle_deadline(array $s): int {
    if (empty($s['sid'])) return 0;
    $isStaff = !empty($s['adminOk']) || is_admin_role((string)($s['role'] ?? ''));
    $max = session_idle_max($isStaff);
    if ($max <= 0) return 0;
    try {
        $row = db_row('SELECT lastSeenAt FROM device_sessions WHERE sid = ? LIMIT 1', [(string)$s['sid']]);
        $last = $row ? (strtotime((string)($row['lastSeenAt'] ?? '')) ?: 0) : 0;
        return $last > 0 ? $last + $max : 0;
    } catch (\Throwable $e) { return 0; }
}

function session_touch(?array $s = null): void {
    $s = $s ?? session_read();
    if (!$s || empty($s['sid'])) return;
    try {
        $row = db_row('SELECT id, revokedAt, lastSeenAt FROM device_sessions WHERE sid = ? LIMIT 1', [(string)$s['sid']]);
        if (!$row || !empty($row['revokedAt'])) return;
        $last = strtotime((string)($row['lastSeenAt'] ?? '')) ?: 0;
        if (time() - $last > 300) db_update('device_sessions', ['lastSeenAt' => now_iso()], ['id' => $row['id']]);
    } catch (Throwable $e) { /* a heartbeat is never worth failing a request over */ }
}

function require_session(): array {
    $s = session_read();
    if (!$s) json_error('unauthorized', 401);
    if (($s['status'] ?? '') === 'suspended') json_error('suspended', 403);
    if (!empty($s['mfaP']) && empty($GLOBALS['__mfa_pending_ok'])) json_error('mfa_required', 401);
    // Server-side revocation: a remotely revoked device dies here even though
    // its cookie signature is still valid. Missing row (pruned) stays valid —
    // the cookie's HMAC + expiry remain the base authority.
    if (!empty($s['sid'])) {
        $row = db_row('SELECT id, revokedAt, lastSeenAt FROM device_sessions WHERE sid = ? LIMIT 1', [(string)$s['sid']]);
        if ($row) {
            if (!empty($row['revokedAt'])) { session_clear(); json_error('unauthorized', 401); }
            $last = strtotime((string)($row['lastSeenAt'] ?? '')) ?: 0;
            // Idle timeout — a session that has sat untouched past its window is
            // force-expired (revoked + cookie cleared). Staff are held to the
            // tight window the operational policy demands; members get longer.
            $isStaff = !empty($s['adminOk']) || is_admin_role((string)($s['role'] ?? ''));
            $idleMax = session_idle_max($isStaff);
            if ($idleMax > 0 && $last > 0 && (time() - $last) > $idleMax) {
                try { db_update('device_sessions', ['revokedAt' => now_iso()], ['id' => $row['id']]); } catch (Throwable $e) {}
                session_clear();
                json_error('session_expired', 401);
            }
            if (time() - $last > 300) {
                try { db_update('device_sessions', ['lastSeenAt' => now_iso()], ['id' => $row['id']]); } catch (Throwable $e) {}
            }
            // The cookie's role and status are a week old; the account's are now.
            $why = function_exists('session_still_valid') ? session_still_valid($s) : '';
            if ($why !== '') {
                try { db_update('device_sessions', ['revokedAt' => now_iso()], ['id' => $row['id']]); } catch (Throwable $e) {}
                session_clear();
                json_error($why, $why === 'suspended' ? 403 : 401);
            }
        } else {
            // No device row for a sid that should have one. Every session_issue()
            // inserts a row, and GC only removes rows revoked >30d ago, so a
            // missing row means this session was revoked-and-pruned. For STAFF
            // this must fail closed — otherwise the 30-min idle ceiling silently
            // disappears and the cookie lives for the full absolute TTL. Members
            // keep the lenient "cookie HMAC is the base authority" behaviour.
            $isStaff = !empty($s['adminOk']) || is_admin_role((string)($s['role'] ?? ''));
            if ($isStaff) { session_clear(); json_error('session_expired', 401); }
        }
    }
    return $s;
}

/** A signed-in MEMBER account — never a card holder's or a desk's session. */
function require_member_session(): array {
    $s = require_session();
    if (function_exists('session_is_cardholder') && session_is_cardholder($s)) json_error('forbidden', 403);
    return $s;
}

function require_admin(): array {
    $s = require_session();
    // Any staff tier (editor/admin/super_admin) may reach the console; the
    // domain layer's capability gates enforce what each tier can actually do.
    if (!is_admin_role($s['role'] ?? '')) json_error('forbidden', 403);
    if (empty($s['adminOk'])) json_error('admin_2fa_required', 403);
    return $s;
}

function require_super_admin(): array {
    $s = require_admin();
    if (strtolower((string)$s['role']) !== 'super_admin') json_error('forbidden', 403);
    return $s;
}

// b64url() / b64url_decode() moved to util.php so both prod and the test
// harness (which loads util.php but not session.php) share them.
