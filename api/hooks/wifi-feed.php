<?php
/**
 * A centre's Wi-Fi gateway fetches its list here (domain/wifi.php).
 *
 * GET, from the gateway itself, every one to five minutes:
 *   X-NGG-Gateway: G1a2b3c4d     the gateway's id
 *   X-NGG-Key:     <40 hex>      its key, shown once when it was added or rotated
 *   ?since=<version it last applied>&os=<platform version>&error=<last problem>&full=1&page=<n>
 *
 * The key travels in a header, not the address, so it never lands in an
 * access log. The reply is in the format the gateway's platform reads (text,
 * a FreeRADIUS users file, or JSON) and is never cached.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('wifi.feed');

$res = gs_call('wifi.feed', [
    'gatewayId' => (string)($_SERVER['HTTP_X_NGG_GATEWAY'] ?? ''),
    'key'       => (string)($_SERVER['HTTP_X_NGG_KEY'] ?? ''),
    'since'     => (int)($_GET['since'] ?? 0),
    'os'        => substr((string)($_GET['os'] ?? ''), 0, 64),
    'error'     => substr((string)($_GET['error'] ?? ''), 0, 255),
    'full'      => !empty($_GET['full']),
    'page'      => max(1, (int)($_GET['page'] ?? 1)),
    // What the gateway reports of itself (all optional): people online, CPU %, free MB, uptime s, and a measured line.
    'act' => $_GET['act'] ?? null, 'cpu' => $_GET['cpu'] ?? null, 'mem' => $_GET['mem'] ?? null, 'up' => $_GET['up'] ?? null,
    'dl' => $_GET['dl'] ?? null, 'ul' => $_GET['ul'] ?? null, 'rtt' => $_GET['rtt'] ?? null,
    'ip'        => client_ip(),
]);
if (empty($res['ok'])) {
    // Plain words a router log can show; the gateway keeps the users it has.
    http_response_code(($res['error'] ?? '') === 'bad_key' ? 401 : 400);
    header('Content-Type: text/plain; charset=utf-8');
    echo '#error;' . preg_replace('/[^a-z_]/', '', (string)($res['error'] ?? 'failed')) . "\n";
    exit;
}
$out = wifi_feed_render($res, max(1, (int)($_GET['page'] ?? 1)));
header('Content-Type: ' . $out['type'] . '; charset=utf-8');
echo $out['body'];
