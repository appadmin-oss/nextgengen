<?php
/** Admin: the centres' Wi-Fi (domain/wifi.php).
 *
 *  Gateways, their keys, the access table and the profiles are the `network`
 *  capability; one person's Wi-Fi is whoever owns their record (people for a
 *  member, summer for a participant). The domain gates each op. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'overview');
    if ($view === 'member')       $res = gs_call('admin.wifi.member', ['requesterId' => $mid, 'subjectType' => $_GET['subjectType'] ?? 'member', 'subjectId' => $_GET['subjectId'] ?? '']);
    elseif ($view === 'preview')  $res = gs_call('admin.wifi.gateway.preview', ['requesterId' => $mid, 'gatewayId' => $_GET['gatewayId'] ?? '', 'q' => $_GET['q'] ?? '']);
    elseif ($view === 'lookup')   $res = gs_call('admin.wifi.lookup', ['requesterId' => $mid, 'q' => $_GET['q'] ?? '']);
    elseif ($view === 'setup')    $res = gs_call('admin.wifi.gateway.setup', ['requesterId' => $mid, 'gatewayId' => $_GET['gatewayId'] ?? '']);
    else                          $res = gs_call('admin.wifi.overview', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $map = [
        'access'  => 'admin.wifi.access.set',
        'save'    => 'admin.wifi.gateway.save',
        'rotate'  => 'admin.wifi.gateway.rotate',
        'remove'  => 'admin.wifi.gateway.remove',
        'member'  => 'admin.wifi.member.set',
    ];
    $action = (string)($b['action'] ?? '');
    if (!isset($map[$action])) json_error('bad_action', 400);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], is_array($res) ? $res : []), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
