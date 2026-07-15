<?php
/** Admin: comment moderation queue. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.comments.list', ['requesterId' => $s['mid'], 'status' => $_GET['status'] ?? 'pending']);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = gs_call('admin.comments.moderate', ['requesterId' => $s['mid'], 'commentId' => $b['commentId'] ?? '', 'do' => $b['do'] ?? '', 'ip' => client_ip()]);
} else { json_error('method_not_allowed', 405); }
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
