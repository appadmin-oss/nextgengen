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

if (!file_exists(__DIR__ . '/../config.php')) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'config_missing']);
    exit;
}

$CONFIG = require __DIR__ . '/../config.php';

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
require_once __DIR__ . '/util.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/anchor-content.php';
require_once __DIR__ . '/ai.php';
require_once __DIR__ . '/bus.php';
require_once __DIR__ . '/sms.php';
foreach (['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2', 'mentorship', 'summer', 'club', 'circle', 'momentum', 'integrations', 'registration', 'hooks', 'behaviour', 'volunteers', 'photos'] as $__d) {
    require_once __DIR__ . '/domain/' . $__d . '.php';
}
require_once __DIR__ . '/backend.php';
require_once __DIR__ . '/sheets.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/superadmin.php';
require_once __DIR__ . '/rate-limit.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/validate.php';
require_once __DIR__ . '/webcron.php';

// CSRF check happens once per request, for every write method. The
// individual endpoint then validates further (session, role, input).
csrf_require();

// Opportunistic maintenance for no-cron hosts: drains the integration bus,
// sends due reminders, and runs daily GC — throttled, after the response.
web_cron_schedule();

function client_ip(): string {
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $h) {
        if (!empty($_SERVER[$h])) {
            $v = $_SERVER[$h];
            if (strpos($v, ',') !== false) $v = trim(explode(',', $v)[0]);
            // Basic sanity — reject if not an IP.
            if (filter_var($v, FILTER_VALIDATE_IP)) return $v;
        }
    }
    return '0.0.0.0';
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
