<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // ?assignmentId=… → submissions for that assignment; otherwise the list.
    $assignmentId = $_GET['assignmentId'] ?? '';
    if ($assignmentId !== '') {
        $res = gs_call('admin.assignments.submissions', ['requesterId' => $s['mid'], 'assignmentId' => $assignmentId]);
    } else {
        $res = gs_call('admin.assignments.list', ['requesterId' => $s['mid']]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    // A grade payload carries submissionId; an upsert carries the assignment fields.
    if (!empty($body['submissionId']) && ($body['action'] ?? '') === 'return') {
        $res = gs_call('admin.assignment.return', [
            'requesterId'  => $s['mid'],
            'submissionId' => $body['submissionId'],
            'feedback'     => $body['feedback'] ?? '',
            'ip'           => client_ip(),
        ]);
    } elseif (!empty($body['submissionId'])) {
        $res = gs_call('admin.assignment.grade', [
            'requesterId'  => $s['mid'],
            'submissionId' => $body['submissionId'],
            'grade'        => $body['grade']    ?? 0,
            'feedback'     => $body['feedback'] ?? '',
            'email'        => !empty($body['email']),
            'ip'           => client_ip(),
        ]);
    } else {
        $res = gs_call('admin.assignments.upsert', [
            'requesterId' => $s['mid'],
            'data'        => $body,
            'email'       => !empty($body['notify']),
            'ip'          => client_ip(),
        ]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
