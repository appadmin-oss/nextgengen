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
    //   - auth/gateway  → pre-session method discovery; reveals nothing
    //   - auth/request  → user has no session yet; the OTP IS the proof
    //   - auth/verify   → same
    //   - auth/login    → pre-session; the password IS the proof
    //   - auth/reset-request / reset-confirm → pre-session; the emailed code
    //     or magic-link token IS the proof (same basis as request/verify)
    //   - public/newsletter → fully public, IP rate-limited at the server
    $path = $_SERVER['SCRIPT_NAME'] ?? '';
    if (preg_match('#/api/auth/(gateway|request|verify|login|reset-request|reset-confirm)\\.php$#', $path)) return;
    if (preg_match('#/api/public/verify\\.php$#', $path)) return; // parent link: the token IS the proof
    if (preg_match('#/api/hooks/[a-z-]+\\.php$#', $path)) return;  // inbound hooks: the HMAC IS the proof
    if (preg_match('#/api/public/newsletter\\.php$#', $path))     return;
    // Anonymous intake — no session privileges to ride; IP rate-limited,
    // validated server-side, and reachable cross-origin from sister sites.
    if (preg_match('#/api/public/apply\\.php$#', $path))          return;
    // Public headshot signer — used on those SAME anonymous intake surfaces
    // (apply, gate registration, guardian reshoot), including cross-origin
    // embeds where no ngg_csrf cookie exists. It only returns a short-lived
    // Cloudinary signature for the fixed `headshot` folder and is IP
    // rate-limited, so it carries no privilege to protect against CSRF.
    if (preg_match('#/api/public/upload-headshot-sign\\.php$#', $path)) return;

    $cookie = $_COOKIE[csrf_cookie_name()] ?? '';
    $header = $_SERVER['HTTP_X_NGG_CSRF'] ?? '';
    if ($cookie === '' || $header === '' || !hash_equals($cookie, $header)) {
        json_error('csrf_failed', 403);
    }
}
