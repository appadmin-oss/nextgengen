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

function session_issue(array $member, bool $adminOk = false): string {
    global $CONFIG;
    $now = time();
    $sid = rand_hex(20);
    $payload = [
        'mid'     => $member['memberId'] ?? '',
        'role'    => $member['role'] ?? 'member',
        'type'    => $member['type'] ?? '',
        'status'  => $member['status'] ?? '',
        'iat'     => $now,
        'exp'     => $now + (int)$CONFIG['session_ttl'],
        'adminOk' => $adminOk,
        'sid'     => $sid,
    ];
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

function require_session(): array {
    $s = session_read();
    if (!$s) json_error('unauthorized', 401);
    if (($s['status'] ?? '') === 'suspended') json_error('suspended', 403);
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
            $idleCfg = $GLOBALS['CONFIG']['session_idle'] ?? [];
            $isStaff = !empty($s['adminOk']) || is_admin_role((string)($s['role'] ?? ''));
            $idleMax = (int)($isStaff ? ($idleCfg['admin'] ?? 1800) : ($idleCfg['member'] ?? 43200));
            if ($idleMax > 0 && $last > 0 && (time() - $last) > $idleMax) {
                try { db_update('device_sessions', ['revokedAt' => now_iso()], ['id' => $row['id']]); } catch (Throwable $e) {}
                session_clear();
                json_error('session_expired', 401);
            }
            if (time() - $last > 300) {
                try { db_update('device_sessions', ['lastSeenAt' => now_iso()], ['id' => $row['id']]); } catch (Throwable $e) {}
            }
        }
    }
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
