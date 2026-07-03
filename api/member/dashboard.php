<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$res = gs_call('member.dashboard', ['memberId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 500);
unset($res['ok']);
json_ok($res);
