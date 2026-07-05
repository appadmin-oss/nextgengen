<?php
/** Admin: contact message inbox. GET = list, POST = set status. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $body = read_json_body();
    $res = gs_call('admin.contact.status', [
        'requesterId' => $s['mid'],
        'id'          => (int)($body['id'] ?? 0),
        'status'      => (string)($body['status'] ?? ''),
        'ip'          => client_ip(),
    ]);
} else {
    $res = gs_call('admin.contact.list', [
        'requesterId' => $s['mid'],
        'status'      => (string)($_GET['status'] ?? ''),
        'purpose'     => (string)($_GET['purpose'] ?? ''),
    ]);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
