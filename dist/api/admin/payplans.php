<?php
/** Admin: instalment plans (domain/payment-plans.php). `fees`, centre-scoped.
 *  GET  ?view=list|get|for   POST {action: create|cancel|note}. The route does no work. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    if ($view === 'get')      $res = gs_call('admin.payplans.get', ['requesterId' => $mid, 'planId' => (string)($_GET['planId'] ?? '')]);
    elseif ($view === 'for')  $res = gs_call('admin.payplans.for', ['requesterId' => $mid, 'memberId' => (string)($_GET['memberId'] ?? '')]);
    else                      $res = gs_call('admin.payplans.list', ['requesterId' => $mid, 'health' => (string)($_GET['health'] ?? ''), 'q' => (string)($_GET['q'] ?? ''),
                                  'page' => (int)($_GET['page'] ?? 0), 'pageSize' => (int)($_GET['pageSize'] ?? 50)]);
} elseif ($method === 'POST') {
    $b = read_json_body();   // CSRF is checked for every write in bootstrap (csrf_require)
    $map = ['create' => 'admin.payplans.create', 'cancel' => 'admin.payplans.cancel', 'note' => 'admin.payplans.note', 'decide' => 'admin.payplans.decide'];
    $op = $map[(string)($b['action'] ?? '')] ?? null;
    if (!$op) json_error('unknown_action', 400);
    unset($b['action'], $b['requesterId']);
    $res = gs_call($op, ['requesterId' => $mid, 'ip' => client_ip()] + $b);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', in_array($res['error'] ?? '', ['forbidden', 'out_of_scope'], true) ? 403 : (($res['error'] ?? '') === 'not_found' ? 404 : 400), $res['detail'] ?? null);
unset($res['ok']); json_ok($res);
