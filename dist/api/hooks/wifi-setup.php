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
    /* 200, not 401: RouterOS's /tool fetch saves nothing on a 401 that has no
       WWW-Authenticate header and prints only "ERROR parsing http: 401 should
       contain www-authenticate header" — the reason below never reached the
       owner's terminal. A file /import can run, that stops with the reason, is
       the answer; the key is still checked and nothing else is served. */
    http_response_code(200);
    $sent = (string)($_SERVER['HTTP_X_NGG_KEY'] ?? '');
    $why = ($res['error'] ?? '') !== 'bad_key' ? 'this gateway is not a MikroTik one in NGG.'
        : (stripos($sent, 'PASTE') !== false || $sent === ''
            ? 'the command still says PASTE-THE-KEY-HERE. In NGG open Wi-Fi, open this gateway, press Rotate the key, and copy the install line it then shows: the key is in it.'
            : 'the key is wrong or was rotated. In NGG open this gateway, press Rotate the key, and use the install line it then shows.');
    echo ':error "NGG Wi-Fi: ' . $why . '"' . "\n";
    exit;
}
echo $res['script'];
