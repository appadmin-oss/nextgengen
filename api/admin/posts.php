<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
require_method('POST');
$body = read_json_body();
$res = gs_call('admin.posts.upsert', [
    'requesterId' => $s['mid'],
    'data'        => $body,
    'ip'          => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
gs_cache_purge('public.posts');
json_ok($res);
