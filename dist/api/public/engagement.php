<?php
/** Public: post reaction tallies + approved comments (session optional). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = session_read();
$res = gs_call('public.post.engagement', ['post' => (string)($_GET['post'] ?? ''), 'memberId' => $s['mid'] ?? '']);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
