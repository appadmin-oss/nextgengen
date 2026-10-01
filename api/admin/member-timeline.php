<?php
/** Admin: what has happened to one member, in order. Read-only. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.member.timeline', [
    'requesterId' => $s['mid'],
    'memberId' => $_GET['memberId'] ?? '',
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
