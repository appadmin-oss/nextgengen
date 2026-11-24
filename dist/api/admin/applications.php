<?php
/** Admin: review teen/mentor applications; convert to members. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.applications.list', ['requesterId' => $s['mid'], 'kind' => $_GET['kind'] ?? '', 'status' => $_GET['status'] ?? '', 'unfinished' => !empty($_GET['unfinished'])]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $act = (string)($b['action'] ?? '');
    if ($act === 'convert') {
        $res = gs_call('admin.application.convert', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'startDate' => (string)($b['startDate'] ?? ''), 'centre' => (string)($b['centre'] ?? ''), 'ip' => client_ip()]);
    } elseif ($act === 'centreOptions') {
        $res = gs_call('admin.application.centre_options', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0]);
    } elseif ($act === 'offerCentre') {
        $res = gs_call('admin.application.offer_centre', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'centre' => (string)($b['centre'] ?? ''), 'note' => (string)($b['note'] ?? ''), 'ip' => client_ip()]);
    } elseif ($act === 'update') {
        $res = gs_call('admin.application.update', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'data' => $b['data'] ?? [], 'ip' => client_ip()]);
    } elseif ($act === 'message') {
        $res = gs_call('admin.applications.message', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'message' => (string)($b['message'] ?? ''), 'ip' => client_ip()]);
    } elseif ($act === 'delete') {
        $res = gs_call('admin.application.delete', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'ip' => client_ip()]);
    } else {
        $res = gs_call('admin.applications.status', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'status' => $b['status'] ?? '',
            'message' => (string)($b['message'] ?? ''), 'reason' => (string)($b['reason'] ?? ''), 'notify' => ($b['notify'] ?? true) !== false, 'ip' => client_ip()]);
    }
} else { json_error('method_not_allowed', 405); }
// The refusal's own words reach the screen (crErr reads `message` first).
if (empty($res['ok'])) json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]) + ['error' => 'failed'], 400);
unset($res['ok']); json_ok($res);
