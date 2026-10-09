<?php
/**
 * Loaded by every endpoint. Sets headers, loads config, defines helpers.
 */

declare(strict_types=1);

// Fail-loud in dev, fail-quiet in prod (config can override).
ini_set('display_errors', '0');
error_reporting(E_ALL);
// DB timestamps are written in UTC (gmdate). Keep the whole request in UTC so
// strtotime() on due/expiry values isn't skewed by the host's php.ini tz.
date_default_timezone_set('UTC');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header('Cross-Origin-Opener-Policy: same-origin');
header('Permissions-Policy: camera=(self), microphone=(), geolocation=()');
if ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') {
    header('Strict-Transport-Security: max-age=31536000');
}
header('Content-Type: application/json; charset=utf-8');
/* NEVER let an API response be cached.
 *
 * This is the fix for "I saved it and the site still shows the old value".
 * Apache's mod_expires block in .htaccess ends with
 * `ExpiresDefault "access plus 1 hour"`, and application/json is not one of
 * the types it names — so every JSON reply picked up a one-hour freshness
 * window. The API client sends reads as plain GETs (no body ⇒ GET), so the
 * browser served an hour-old copy straight from its HTTP cache without ever
 * asking the server. A write went through fine and the next read showed the
 * stale value, which looks exactly like the save silently failing.
 *
 * Setting it here rather than only in .htaccess is deliberate: this is the
 * one place every endpoint passes through, so it holds whatever the host's
 * Apache config is doing, whether .htaccess is honoured at all, and whether
 * a reverse proxy sits in front.
 *
 * `no-store` rather than `no-cache`: these payloads carry children's names,
 * photos and guardian contacts, and no-store keeps them out of the browser's
 * on-disk cache as well as off the back button on a shared kiosk machine. */
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

if (!file_exists(__DIR__ . '/../config.php')) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'config_missing']);
    exit;
}

$CONFIG = require __DIR__ . '/../config.php';

/* A deployment's config.php is almost never as new as the code above it.
 *
 * Code is redeployed; config.php is gitignored and stays where it was, often
 * for years, on a host with no shell. So a key added upstream this month is
 * simply absent down here — and every one of these was read WITHOUT `??`:
 *
 *     'secure'   => (bool)$CONFIG['cookie_secure']     → (bool)null = FALSE
 *     'samesite' => $CONFIG['cookie_samesite']         → null
 *     hash_hmac('sha256', $body, $CONFIG['cookie_secret'])  → empty key
 *
 * PHP 8 emits a warning nobody reads and carries on, so the failure is silent
 * and it is in the unsafe direction every time: the Secure flag off, SameSite
 * unset, session cookies signed with an empty key — i.e. forgeable. The
 * warning was visible in the test suite output the whole time.
 *
 * Two fixes, in order. First, the example file IS the schema: merge it
 * underneath so a missing key falls back to a sane documented default rather
 * than to null. Second, the handful of values that cannot have a default —
 * secrets — are asserted below, loudly, because a weak one is worse than a
 * missing one and neither should reach a request.
 *
 * Shallow merge on purpose. Nested blocks (rate_limits, cloudinary, org) are
 * replaced wholesale by whatever the deployment set, so a partial override
 * cannot be quietly widened by defaults the operator did not choose; the
 * per-bucket floors in rate-limit.php cover that case properly.
 */
$__defaults = @include __DIR__ . '/../config.example.php';
if (is_array($__defaults)) $CONFIG += $__defaults;

/* Secrets have no safe default. A missing cookie_secret means every session
 * token in the product is signed with an empty HMAC key and can be minted by
 * anyone who reads this file on GitHub — so this refuses to serve rather than
 * serving something that looks fine and is not. */
$__secret = (string)($CONFIG['cookie_secret'] ?? '');
if (strlen($__secret) < 32 || $__secret === 'change-me' || preg_match('/^(change|replace|todo|xxx)/i', $__secret)) {
    error_log('[config] cookie_secret is missing, too short (<32 chars) or still the placeholder — refusing to serve.');
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'config_invalid']);
    exit;
}

// Cross-origin access for the PUBLIC api only — lets sister sites (the STS
// site embeds the volunteer form headlessly) call it from the browser.
// Origins are allow-listed; no credentials cross the boundary.
$__origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($__origin !== '' && preg_match('#/api/public/[a-z0-9-]+\.php$#', (string)($_SERVER['SCRIPT_NAME'] ?? ''))) {
    $__allowed = $CONFIG['cors_origins'] ?? [
        'https://sts.afrovanguard.org.ng',
        'https://afrovanguard.org.ng',
        'https://www.afrovanguard.org.ng',
    ];
    // Local development of sister sites (debug configs only).
    if (!empty($CONFIG['debug']) && preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#', $__origin)) $__allowed[] = $__origin;
    if (in_array($__origin, $__allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $__origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 86400');
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
    }
}

if ($CONFIG['debug']) {
    ini_set('display_errors', '1');
}

// Route PHP warnings/errors and every error_log() call to the app's own logs/
// folder when it exists and is writable (else the host's default log). Override
// the location with $CONFIG['log_dir']. The folder ships with a deny-all
// .htaccess so logs are never web-readable.
$__logDir = rtrim((string)($CONFIG['log_dir'] ?? (__DIR__ . '/../logs')), '/');
if ($__logDir !== '' && is_dir($__logDir) && is_writable($__logDir)) {
    ini_set('error_log', $__logDir . '/php-error.log');
}

require_once __DIR__ . '/response.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/qr-encode.php';
require_once __DIR__ . '/util.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/anchor-content.php';
require_once __DIR__ . '/ai.php';
require_once __DIR__ . '/bus.php';
require_once __DIR__ . '/sms.php';
foreach (['formation', 'auth', 'members', 'members-admin', 'anchor', 'assignments', 'events', 'admin', 'admin2', 'mentorship', 'mentoring', 'summer', 'summer-editions', 'policy', 'club', 'circle', 'momentum', 'integrations', 'registration', 'selfreg', 'hooks', 'behaviour', 'volunteers', 'photos', 'mentor', 'instructor', 'ops', 'analytics', 'analytics-depth', 'growth', 'insight', 'insight-chat', 'journal', 'profiles', 'community', 'arcade', 'chess', 'chess-variants', 'chess-clock', 'matches', 'match-review', 'chess-social', 'tournament-pairing', 'tournaments', 'tournaments2', 'promos', 'mathlab', 'card-templates', 'card-runs', 'design-assets', 'merge', 'assessment', 'fees', 'engagement', 'community-engagement', 'community-homework', 'journal-mine', 'members-import', 'members-bulk', 'member-id', 'member-cards', 'checkin', 'approvals', 'curriculum', 'ngv-portal', 'member-self', 'wisdom', 'companion', 'family', 'timetable', 'timetable-personal', 'id-studio', 'status', 'member-record', 'membership-pay', 'photo-framing', 'service-keys', 'centres-ngg', 'summer-history', 'mentorship-pods'] as $__d) {
    require_once __DIR__ . '/domain/' . $__d . '.php';
}
require_once __DIR__ . '/backend.php';
require_once __DIR__ . '/sheets.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/superadmin.php';
require_once __DIR__ . '/rate-limit.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/validate.php';
require_once __DIR__ . '/nudges.php';
require_once __DIR__ . '/webcron.php';

// Keys entered in Control Room → Settings → API keys, laid over config.php
// (domain/service-keys.php). Never fatal: config.php alone still works.
try { service_keys_apply(); } catch (Throwable $e) { error_log('[service_keys_apply] ' . $e->getMessage()); }

// CSRF check happens once per request, for every write method. The
// individual endpoint then validates further (session, role, input).
csrf_require();

// Opportunistic maintenance for no-cron hosts: drains the integration bus,
// sends due reminders, and runs daily GC — throttled, after the response.
web_cron_schedule();

/**
 * Who is calling, as well as this server can honestly tell.
 *
 * A forwarded header is a CLAIM, and it is only worth anything when it reaches
 * us through something that would have overwritten a forged one. This used to
 * take `CF-Connecting-IP` or `X-Forwarded-For` from anybody who sent them,
 * which meant the caller chose their own identity — and every IP-keyed control
 * in the product is keyed on the answer:
 *
 *   · every rate-limit bucket (rate_limit_check keys on this), so a header that
 *     changes per request means no throttle at all — including the ones
 *     guarding admin TOTP, the kiosk password, and the guardian invite-code
 *     lookup that turns a six-digit code into a child's name;
 *   · the audit trail, which then records an address the attacker picked.
 *
 * So: trust the proxy, not the header. `trusted_proxies` is a list of CIDRs
 * (Cloudflare's ranges, a load balancer, 127.0.0.1 for a local reverse proxy).
 * Only when REMOTE_ADDR is inside one of them is a forwarded header believed.
 * Everybody else is their REMOTE_ADDR, whatever they claim.
 *
 * With no `trusted_proxies` configured we use REMOTE_ADDR alone. That is the
 * safe default: on a direct-to-Apache shared host it is exactly right, and
 * behind an unconfigured CDN it over-groups (everyone shares the edge address)
 * rather than under-grouping, which fails towards throttling too much instead
 * of not at all.
 */
function client_ip(): string {
    global $CONFIG;
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');

    if (ip_is_trusted_proxy($remote, (array)($CONFIG['trusted_proxies'] ?? []))) {
        foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR'] as $h) {
            if (empty($_SERVER[$h])) continue;
            $v = (string)$_SERVER[$h];
            // Left-most entry is the original client; the rest are hops.
            if (strpos($v, ',') !== false) $v = trim(explode(',', $v)[0]);
            if (filter_var($v, FILTER_VALIDATE_IP)) return $v;
        }
    }
    return filter_var($remote, FILTER_VALIDATE_IP) ? $remote : '0.0.0.0';
}

function client_ua(): string {
    return substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 256);
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) return [];
    return $data;
}

function require_method(string $method): void {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        json_error('method_not_allowed', 405);
    }
}
