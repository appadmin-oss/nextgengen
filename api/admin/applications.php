<?php
/** Admin: review teen/mentor applications; convert to members. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.applications.list', ['requesterId' => $s['mid'], 'kind' => $_GET['kind'] ?? '', 'status' => $_GET['status'] ?? '']);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if (($b['action'] ?? '') === 'convert') {
        $res = gs_call('admin.application.convert', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'ip' => client_ip()]);
    } else {
        $res = gs_call('admin.applications.status', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'status' => $b['status'] ?? '', 'ip' => client_ip()]);
    }
} else { json_error('method_not_allowed', 405); }
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
