<?php
/**
 * A MikroTik gateway fetches its own setup file here and /imports it
 * (domain/wifi-setup.php wifi_setup_script). The guide's one-line command:
 *
 *   /tool fetch url=".../api/hooks/wifi-setup.php" http-header-field="X-NGG-Gateway: G…,X-NGG-Key: …"
 *     check-certificate=yes dst-path=ngg-wifi.rsc; /import file-name=ngg-wifi.rsc
 *
 * The key travels in a header, never in the address.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('wifi.feed');
$res = gs_call('wifi.setup.script', [
    'gatewayId' => (string)($_SERVER['HTTP_X_NGG_GATEWAY'] ?? ''),
    'key'       => (string)($_SERVER['HTTP_X_NGG_KEY'] ?? ''),
    'ip'        => client_ip(),
]);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'bad_key' ? 401 : 400);
    // A file /import can run: it stops with the reason, in the router's own log.
    $why = ($res['error'] ?? '') === 'bad_key' ? 'the key is wrong or was rotated. Rotate it in NGG and use the new command.' : 'this gateway is not a MikroTik one in NGG.';
    echo ':error "NGG Wi-Fi: ' . $why . '"' . "\n";
    exit;
}
echo $res['script'];
