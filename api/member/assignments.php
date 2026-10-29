<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('assignment.list', ['memberId' => $s['mid']]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $res = gs_call('assignment.submit', [
        'memberId'     => $s['mid'],
        'assignmentId' => $body['assignmentId'] ?? '',
        'text'         => $body['text']    ?? '',
        'fileUrl'      => $body['fileUrl'] ?? '',
        'fileName'     => $body['fileName'] ?? '',
        'files'        => is_array($body['files'] ?? null) ? array_slice($body['files'], 0, 20) : [],
        'linkUrl'      => $body['linkUrl'] ?? '',
        'steps'        => is_array($body['steps'] ?? null) ? array_slice($body['steps'], 0, 50) : [],
        'ip'           => client_ip(),
    ]);
    if (empty($res['ok'])) json_send(['ok' => false, 'error' => $res['error'] ?? 'failed'] + array_diff_key($res, ['ok' => 1]), 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
