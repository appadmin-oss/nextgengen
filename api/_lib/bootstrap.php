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
header('Content-Type: application/json; charset=utf-8');

if (!file_exists(__DIR__ . '/../config.php')) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'config_missing']);
    exit;
}

$CONFIG = require __DIR__ . '/../config.php';

if ($CONFIG['debug']) {
    ini_set('display_errors', '1');
}

require_once __DIR__ . '/response.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/util.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/anchor-content.php';
foreach (['auth', 'members', 'anchor', 'assignments', 'events', 'admin', 'admin2'] as $__d) {
    require_once __DIR__ . '/domain/' . $__d . '.php';
}
require_once __DIR__ . '/backend.php';
require_once __DIR__ . '/sheets.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/rate-limit.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/validate.php';

// CSRF check happens once per request, for every write method. The
// individual endpoint then validates further (session, role, input).
csrf_require();

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
