<?php
/** Member: react to / comment on a post (comments go to moderation). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
require_method('POST');
$b = read_json_body();
$action = (string)($b['action'] ?? '');
if ($action === 'react')        $res = gs_call('post.react', ['memberId' => $s['mid'], 'post' => $b['post'] ?? '', 'emoji' => $b['emoji'] ?? '', 'ip' => client_ip()]);
elseif ($action === 'comment')  $res = gs_call('post.comment', ['memberId' => $s['mid'], 'post' => $b['post'] ?? '', 'body' => $b['body'] ?? '', 'ip' => client_ip()]);
else json_error('unknown_action', 400);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
