<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$slug = $_GET['slug'] ?? '';
if (!$slug) json_error('missing_slug');
$res = gs_call('post.get', ['slug' => $slug], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']);
json_ok($res);
