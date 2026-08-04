<?php
/** Admin: member obligations — membership fee, monthly dues, training fee.
 *
 *  A LEDGER, not a payment processor: nothing on this route takes money. It
 *  records what a member owes and what an admin confirms was received, which is
 *  why there is no gateway, no webhook and no card field anywhere in it. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'settings');
    if ($view === 'member')       $res = gs_call('admin.fees.member', ['requesterId' => $mid, 'memberId' => $_GET['memberId'] ?? '']);
    elseif ($view === 'arrears')  $res = gs_call('admin.fees.arrears', ['requesterId' => $mid, 'limit' => $_GET['limit'] ?? '']);
    else                          $res = gs_call('admin.fees.settings.get', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $map = [
        'settings'  => 'admin.fees.settings.set',
        'payment'   => 'admin.fees.payment',
        'void'      => 'admin.fees.void',
        'mou'       => 'admin.fees.mou',
        'remindOff' => 'admin.fees.remindOff',
        'accrue'    => 'admin.fees.accrue',
    ];
    if (!isset($map[$action])) json_error('bad_action', 400);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    /* The reason travels with the refusal. A fees screen that prints
     * "reason_required" or "already_done" at somebody can at least say which
     * entry and which member it meant. */
    http_response_code(400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], is_array($res) ? $res : []), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
