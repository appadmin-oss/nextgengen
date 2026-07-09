<?php
/** Admin: integration bus — destinations, test-fire, delivery log, sync. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.integrations.list', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? 'upsert');
    $ip = client_ip();
    if ($action === 'upsert')        $res = gs_call('admin.integrations.upsert', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => $ip]);
    elseif ($action === 'delete')    $res = gs_call('admin.integrations.delete', ['requesterId' => $s['mid'], 'integrationId' => $b['integrationId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'test')      $res = gs_call('admin.integrations.test', ['requesterId' => $s['mid'], 'integrationId' => $b['integrationId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'dispatch')  $res = gs_call('admin.integrations.dispatch', ['requesterId' => $s['mid']]);
    elseif ($action === 'sync_members') $res = gs_call('admin.sheets.syncMembers', ['requesterId' => $s['mid'], 'ip' => $ip]);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
