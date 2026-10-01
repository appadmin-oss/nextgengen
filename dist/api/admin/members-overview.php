<?php
/** Admin: the member dashboard — who we have, where, growing how fast, and
 *  what is wrong with the records. Read-only. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.members.overview', ['requesterId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
