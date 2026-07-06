<?php
/** Member behavioral momentum — signals + psychologically-framed nudges. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$res = gs_call('member.momentum', ['requesterId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
