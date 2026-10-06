<?php
/**
 * Member: their own personal timetable (the Timetable Maker), never their
 * centre's. GET returns it or null. POST replaces it, and answers 409 with the
 * stored copy when somebody saved since the copy the browser started from.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $res = gs_call('member.myTimetable', ['memberId' => $s['mid']]);
    unset($res['ok']);
    json_ok($res);
}
require_method('POST');
$body = read_json_body();
$res = gs_call('member.myTimetable.save', [
    'memberId' => $s['mid'], 'settings' => $body['settings'] ?? null, 'entries' => $body['entries'] ?? null,
    'exceptions' => $body['exceptions'] ?? [], 'baseUpdatedAt' => (string)($body['baseUpdatedAt'] ?? ''),
]);
if (empty($res['ok'])) {
    if (($res['error'] ?? '') === 'conflict') {
        http_response_code(409);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'conflict', 'server' => $res['server'] ?? null], JSON_UNESCAPED_UNICODE);
        exit;
    }
    json_error($res['error'] ?? 'failed', 400);
}
unset($res['ok']);
json_ok($res);
