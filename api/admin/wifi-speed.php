<?php
/**
 * The speed test a staff member runs from their own device at a centre
 * (Control Room → Wi-Fi → Speed & health). GET ?bytes=N downloads N bytes of
 * test data; POST uploads test data and says how much arrived. The browser
 * times both and saves the result through admin.wifi.speed.save. Any staff
 * session may run it; nothing here reads or changes a record.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
rate_limit_check_actor('wifi.speed', (string)$s['mid']);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    wifi_speed_stream((int)($_GET['bytes'] ?? 1000000));
    exit;
}
if ($method !== 'POST') json_error('method_not_allowed', 405);
$n = 0;
$in = fopen('php://input', 'rb');
while ($in && !feof($in)) { $chunk = fread($in, 65536); if ($chunk === false) break; $n += strlen($chunk); if ($n > WIFI_SPEED_BYTES_MAX) break; }
json_ok(['received' => $n]);
