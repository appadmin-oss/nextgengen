<?php
/** Admin: donations ledger. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.donations.list', ['requesterId' => $s['mid'], 'export' => !empty($_GET['export'])]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
