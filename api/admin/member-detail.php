<?php
/** Admin: full 360° member record. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.member.detail', ['requesterId' => $s['mid'], 'memberId' => $_GET['memberId'] ?? '']);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
