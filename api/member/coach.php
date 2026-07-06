<?php
/** AI Reflection Coach — Socratic, refuses schoolwork; graceful without a key. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$b = read_json_body();
$res = gs_call('member.coach', ['requesterId' => $s['mid'], 'messages' => $b['messages'] ?? []]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
