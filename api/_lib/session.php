<?php
declare(strict_types=1);

/**
 * Stateless signed session cookies. Format:
 *   base64url(JSON payload) . "." . base64url(HMAC-SHA256(payload, cookie_secret))
 *
 * Payload includes: memberId, role, type, status, exp, iat, adminOk (2FA pass flag).
 */

function session_issue(array $member, bool $adminOk = false): string {
    global $CONFIG;
    $now = time();
    $payload = [
        'mid'     => $member['memberId'] ?? '',
        'role'    => $member['role'] ?? 'member',
        'type'    => $member['type'] ?? '',
        'status'  => $member['status'] ?? '',
        'iat'     => $now,
        'exp'     => $now + (int)$CONFIG['session_ttl'],
        'adminOk' => $adminOk,
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
    return $token;
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
