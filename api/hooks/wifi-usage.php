<?php
/**
 * A centre's Wi-Fi gateway reports the data each signed-in person has used
 * here (domain/wifi-usage.php), right before it fetches its list.
 *
 * POST, from the gateway itself, with the same two headers as the feed:
 *   X-NGG-Gateway: G1a2b3c4d     X-NGG-Key: <40 hex>
 * Body, as text (MikroTik), one line per live session, the router's counters:
 *   s;<username>;<session id>;<bytes in>;<bytes out>
 * or JSON, from the person's side:
 *   {"sessions":[{"username":"026-014","session":"abc","down":123456,"up":7890}]}
 * Counters are the session's running totals; NGG keeps the difference.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('wifi.usage');
$body = (string)file_get_contents('php://input', false, null, 0, 262144);
$res = gs_call('wifi.usage', [
    'gatewayId' => (string)($_SERVER['HTTP_X_NGG_GATEWAY'] ?? ''),
    'key'       => (string)($_SERVER['HTTP_X_NGG_KEY'] ?? ''),
    'body'      => $body,
    'type'      => (string)($_SERVER['CONTENT_TYPE'] ?? ''),
    'ip'        => client_ip(),
]);
header('Content-Type: text/plain; charset=utf-8');
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'bad_key' ? 401 : 400);
    echo '#error;' . preg_replace('/[^a-z_]/', '', (string)($res['error'] ?? 'failed')) . "\n";
    exit;
}
echo '#ok;sessions=' . (int)$res['sessions'] . ';people=' . (int)$res['people'] . "\n";
