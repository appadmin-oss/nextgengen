<?php
/** Admin: volunteer pay — what active volunteers earn for each programme day
 *  they are present and active, the rules that decide it, and the payouts
 *  that settle a pay period (domain/volunteer-pay.php). A record of what is
 *  owed and paid; nothing on this route moves money. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'settings');
    if ($view === 'period')         $res = gs_call('admin.volpay.period', ['requesterId' => $mid, 'period' => $_GET['period'] ?? '']);
    elseif ($view === 'volunteer')  $res = gs_call('admin.volpay.volunteer', ['requesterId' => $mid, 'volunteerId' => $_GET['volunteerId'] ?? '']);
    else                            $res = gs_call('admin.volpay.settings.get', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $map = ['settings' => 'admin.volpay.settings.set', 'accrue' => 'admin.volpay.accrue', 'day' => 'admin.volpay.day.set',
            'pay' => 'admin.volpay.pay', 'void' => 'admin.volpay.payout.void'];
    $action = (string)($b['action'] ?? '');
    if (!isset($map[$action])) json_error('bad_action', 400);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], is_array($res) ? $res : []), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']); json_ok($res);
