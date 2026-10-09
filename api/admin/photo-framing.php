<?php
/** Admin: measure headshots with Gemini, work through the backlog, adjust one by hand (domain/photo-framing.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
require_method('POST');
$b = read_json_body();
$map = ['frame' => 'admin.photos.frame', 'backlog' => 'admin.photos.frame.backlog', 'adjust' => 'admin.photos.frame.adjust'];
$action = (string)($b['action'] ?? '');
if (!isset($map[$action])) json_error('bad_action', 400);
$res = gs_call($map[$action], array_merge($b, ['requesterId' => $s['mid'], 'ip' => client_ip()]));
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
