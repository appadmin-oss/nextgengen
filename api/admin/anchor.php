<?php
/** Admin: manage Anchor Journal content (weeks, quotes, daily systems). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $op = (($_GET['defaults'] ?? '') === '1') ? 'admin.anchor.defaults' : 'admin.anchor.get';
    $res = gs_call($op, ['requesterId' => $s['mid']]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $res = gs_call('admin.anchor.set', ['requesterId' => $s['mid'], 'data' => $body['data'] ?? $body, 'ip' => client_ip()]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    gs_cache_purge('public.anchorContent');
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
