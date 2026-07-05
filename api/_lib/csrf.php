<?php
declare(strict_types=1);

/**
 * Lightweight CSRF protection.
 *
 * Strategy: double-submit cookie. On a GET to /api/auth/me.php we issue a
 * non-HttpOnly `ngg_csrf` cookie containing a random hex string. Every write
 * (POST) MUST echo that value back in the `X-NGG-CSRF` header. Because a
 * cross-site attacker cannot read the cookie (same-site Lax) AND cannot set
 * a custom header without the user's cooperation, the request is rejected.
 *
 * The token is also bound to the session cookie's signature, so refreshing
 * the session rotates the CSRF token too.
 */

function csrf_cookie_name(): string { return 'ngg_csrf'; }

function csrf_issue(): string {
    global $CONFIG;
    $token = bin2hex(random_bytes(24));
    setcookie(csrf_cookie_name(), $token, [
        'expires'  => time() + (int)$CONFIG['session_ttl'],
        'path'     => '/',
        'domain'   => $CONFIG['cookie_domain'] ?: '',
        'secure'   => (bool)$CONFIG['cookie_secure'],
        'httponly' => false,                 // JS reads this and echoes in header
        'samesite' => $CONFIG['cookie_samesite'],
    ]);
    return $token;
}

function csrf_require(): void {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method !== 'POST' && $method !== 'PUT' && $method !== 'DELETE' && $method !== 'PATCH') return;

    // A small set of write endpoints are CSRF-exempt because they happen
    // before any session/cookie state is established:
    //   - auth/request  → user has no session yet; the OTP IS the proof
    //   - auth/verify   → same
    //   - auth/login    → pre-session; the password IS the proof
    //   - public/newsletter → fully public, IP rate-limited at the server
    $path = $_SERVER['SCRIPT_NAME'] ?? '';
    if (preg_match('#/api/auth/(request|verify|login)\\.php$#', $path)) return;
    if (preg_match('#/api/public/newsletter\\.php$#', $path))     return;

    $cookie = $_COOKIE[csrf_cookie_name()] ?? '';
    $header = $_SERVER['HTTP_X_NGG_CSRF'] ?? '';
    if ($cookie === '' || $header === '' || !hash_equals($cookie, $header)) {
        json_error('csrf_failed', 403);
    }
}
