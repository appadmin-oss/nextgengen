<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // Scope strictly to the caller's own journal. A client-supplied ?memberId
    // let any authenticated member read another member's non-private entries
    // (IDOR). Admin/mentor review runs through the admin routes, not here.
    $res = gs_call('anchor.journal.list', [
        'memberId'    => $s['mid'],
        'requesterId' => $s['mid'],
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $res = gs_call('anchor.journal.create', [
        'memberId' => $s['mid'],
        'mood'     => $body['mood']     ?? '',
        'body'     => $body['body']     ?? '',
        'private'  => $body['private']  ?? true,
        'ip'       => client_ip(),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
