<?php
/** Admin: support cases (domain/support.php). GET list | case ; POST reply | bulk | open. Gated on `support`. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    if (isset($_GET['caseNo'])) $res = gs_call('admin.support.case', ['requesterId' => $mid, 'caseNo' => (int)$_GET['caseNo']]);
    else $res = gs_call('admin.support.list', ['requesterId' => $mid] + array_intersect_key($_GET, array_flip(['status', 'priority', 'category', 'assignee', 'q', 'sort', 'page'])));
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $map = ['reply' => 'admin.support.reply', 'bulk' => 'admin.support.bulk', 'open' => 'admin.support.open'];
    if (!isset($map[$action])) json_error('unknown_action', 400);
    $args = $b; unset($args['action']);
    if ($action === 'bulk') $args['action'] = (string)($b['op'] ?? '');
    $res = gs_call($map[$action], array_merge($args, ['requesterId' => $mid, 'ip' => client_ip()]));
} else json_error('method_not_allowed', 405);
if (empty($res['ok'])) { http_response_code(400); echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES); exit; }
unset($res['ok']); json_ok($res);
