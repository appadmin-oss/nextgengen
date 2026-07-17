<?php
/** Admin: general dashboard (attendance + per-centre analytics). Read-only. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.dashboard.overview', ['requesterId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
