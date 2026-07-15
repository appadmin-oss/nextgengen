<?php
/** Admin: newsletter — subscribers + compose/send. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'POST') {
    $b = read_json_body();
    $res = gs_call('admin.newsletter.send', ['requesterId' => $s['mid'], 'subject' => $b['subject'] ?? '', 'body' => $b['body'] ?? '', 'ip' => client_ip()]);
} else {
    $res = gs_call('admin.newsletter.list', ['requesterId' => $s['mid']]);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
