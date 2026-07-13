<?php
/** Admin: site settings. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.settings.get', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if (($b['action'] ?? '') === 'testMail') {
        $res = gs_call('admin.mail.test', ['requesterId' => $s['mid'], 'to' => (string)($b['to'] ?? ''), 'ip' => client_ip()]);
    } else {
        $res = gs_call('admin.settings.set', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? $b, 'ip' => client_ip()]);
    }
} else { json_error('method_not_allowed', 405); }
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
