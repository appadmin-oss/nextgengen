<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // Full list of all events (any status/visibility/date) for management.
    $res = gs_call('admin.events.list', ['requesterId' => $s['mid']]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    if (($body['action'] ?? '') === 'attendance') {
        $res = gs_call('admin.event.attendance', ['requesterId' => $s['mid'], 'eventId' => $body['eventId'] ?? '', 'memberId' => $body['memberId'] ?? '', 'clear' => !empty($body['clear']), 'ip' => client_ip()]);
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
        unset($res['ok']);
        json_ok($res);
    }
    $res = gs_call('admin.events.upsert', [
        'requesterId' => $s['mid'],
        'data'        => $body,
        'ip'          => client_ip(),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    cache_invalidate('events');
    json_ok($res);
}

json_error('method_not_allowed', 405);
