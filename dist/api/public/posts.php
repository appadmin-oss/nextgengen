<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$kind = $_GET['kind'] ?? '';
$tag  = $_GET['tag']  ?? '';
$res = gs_call('public.posts', ['kind' => $kind, 'tag' => $tag], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 503);
unset($res['ok']);
json_ok($res);
