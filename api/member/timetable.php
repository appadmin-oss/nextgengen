<?php
/** Member: their centre's timetable, their course marked. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$s = require_session();
$res = gs_call('member.timetable', ['memberId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
