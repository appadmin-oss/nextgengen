<?php
/**
 * A gateway measures its line by downloading from here (domain/wifi.php):
 * GET with the same X-NGG-Gateway / X-NGG-Key headers as the feed, ?bytes=
 * up to 25 MB (default 4 MB). It then sends what it measured with its next
 * fetch (dl, ul, rtt). Rate-limited: a test is daily, or when asked.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('wifi.speed');
$g = wifi_gateway_by_key((string)($_SERVER['HTTP_X_NGG_GATEWAY'] ?? ''), (string)($_SERVER['HTTP_X_NGG_KEY'] ?? ''));
if (!$g) {
    http_response_code(401);
    header('Content-Type: text/plain; charset=utf-8');
    echo "#error;bad_key\n";
    exit;
}
wifi_speed_stream((int)($_GET['bytes'] ?? 4000000));
