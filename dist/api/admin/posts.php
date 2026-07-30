<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // ?postId=… → single full record (any status, incl. body) for editing.
    // Otherwise → full list of all posts regardless of status.
    if (!empty($_GET['postId'])) {
        $res = gs_call('admin.posts.get', [
            'requesterId' => $s['mid'],
            'postId'      => $_GET['postId'],
        ]);
    } else {
        $res = gs_call('admin.posts.list', ['requesterId' => $s['mid']]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $res = gs_call('admin.posts.upsert', [
        'requesterId' => $s['mid'],
        'data'        => $body,
        'ip'          => client_ip(),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    // A post edit also changes the single-post read (post.get by slug).
    cache_invalidate('posts');
    json_ok($res);
}

json_error('method_not_allowed', 405);
