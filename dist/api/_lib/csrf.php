<?php
declare(strict_types=1);

/**
 * CSRF protection: a double-submit cookie.
 *
 * csrf_issue() sets a non-HttpOnly `ngg_csrf` cookie holding 24 random bytes.
 * It is minted by the endpoints that establish or describe a session
 * (auth/me, auth/login, auth/verify, auth/student-login, auth/reset-confirm,
 * family/me, family/verify). Every write (POST/PUT/PATCH/DELETE) must echo
 * the cookie's value in the `X-NGG-CSRF` header, compared in constant time.
 *
 * Why that stops a forged request: a page on another origin can make the
 * browser SEND our cookies, but the same-origin policy stops it READING the
 * `ngg_csrf` value, so it cannot put the matching header on the request — and
 * a custom header on a cross-origin request needs a CORS preflight this API
 * does not grant. SameSite on the cookies is a second layer, not the first.
 *
 * What it is NOT: the token is independent random data, not derived from or
 * bound to the session cookie. Re-minting it (each of the endpoints above)
 * rotates it; signing in again does not by itself invalidate an old one. That
 * is the standard double-submit trade-off on a host with no server-side
 * session store (CLAUDE.md §3). Do not describe it as session-bound.
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
    // Family sign-in: pre-session, the emailed code or link IS the proof (same basis as auth/request + verify).
    if (preg_match('#/api/family/(request|verify)\\.php$#', $path)) return;
    if (preg_match('#/api/hooks/[a-z-]+\\.php$#', $path)) return;  // inbound hooks: the HMAC IS the proof
    if (preg_match('#/api/public/newsletter\\.php$#', $path))     return;
    // Anonymous intake — no session privileges to ride; IP rate-limited,
    // validated server-side, and reachable cross-origin from sister sites.
    if (preg_match('#/api/public/apply\\.php$#', $path))          return;
    /* The public self-registration link is the same class of door as apply: a
     * family opens it on their own phone with no session, and there is no
     * privilege for a forged request to ride — a submission is not a
     * registration until a reviewer approves it (see public/selfreg.php).
     *
     * It is exempt for a practical reason as well as a principled one. The
     * ngg_csrf cookie is only minted by GET /api/auth/me.php, so the form's
     * ability to submit depended on an unrelated auth bootstrap having already
     * succeeded on a page that has nothing to do with auth. When that call was
     * slow, blocked or failed, the POST came back 403 csrf_failed and the
     * family was told to check a connection that was fine.
     * The GET (context) side is untouched — reads were never CSRF-checked. */
    if (preg_match('#/api/public/selfreg\\.php$#', $path))        return;
    // Public headshot signer — used on those SAME anonymous intake surfaces
    // (apply, gate registration, guardian reshoot), including cross-origin
    // embeds where no ngg_csrf cookie exists. It only returns a short-lived
    // Cloudinary signature for the fixed `headshot` folder and is IP
    // rate-limited, so it carries no privilege to protect against CSRF.
    if (preg_match('#/api/public/upload-headshot-sign\\.php$#', $path)) return;
    /* Telemetry beacon: "a configured media cloud refused an upload, so the
     * image was kept locally". Exempt for the same reason as the signer above —
     * it is fired from the anonymous intake surfaces — and for one of its own:
     * navigator.sendBeacon cannot set a header, so an X-NGG-CSRF check makes the
     * report undeliverable from exactly the pages that most need to send it.
     *
     * There is no privilege to ride. It writes one clamped ops_events row about
     * a failure that has ALREADY been handled, has no read side, is IP
     * rate-limited, and collapses repeats into a hit count — the worst a forger
     * achieves is telling us something is broken. */
    if (preg_match('#/api/public/upload-fallback\\.php$#', $path))  return;

    $cookie = $_COOKIE[csrf_cookie_name()] ?? '';
    $header = $_SERVER['HTTP_X_NGG_CSRF'] ?? '';
    if ($cookie === '' || $header === '' || !hash_equals($cookie, $header)) {
        json_error('csrf_failed', 403);
    }
}
