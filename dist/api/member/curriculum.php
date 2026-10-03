<?php
/**
 * The NGG Club curriculum for the signed-in person (domain/curriculum.php).
 *   GET               their lessons, with progress
 *   GET ?unit=ID      one lesson (starts it)
 *   GET ?view=staff   an instructor's or mentor's view; &memberId= one member's
 *   POST action=submit | mark
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (($_GET['view'] ?? '') === 'staff') {
        $res = isset($_GET['memberId'])
            ? gs_call('staff.curriculum.member', ['requesterId' => $mid, 'memberId' => (string)$_GET['memberId']])
            : gs_call('staff.curriculum', ['requesterId' => $mid]);
    } elseif (isset($_GET['unit'])) {
        $res = gs_call('member.curriculum.unit', ['memberId' => $mid, 'unitId' => (string)$_GET['unit']]);
    } else {
        $res = gs_call('member.curriculum.list', ['memberId' => $mid]);
    }
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'submit') {
        $res = gs_call('member.curriculum.submit', ['memberId' => $mid, 'unitId' => (string)($b['unitId'] ?? ''),
            'answers' => is_array($b['answers'] ?? null) ? $b['answers'] : []]);
    } elseif ($action === 'mark') {
        $res = gs_call('staff.curriculum.mark', ['requesterId' => $mid, 'progressId' => (int)($b['progressId'] ?? 0),
            'marks' => is_array($b['marks'] ?? null) ? $b['marks'] : [], 'ip' => client_ip()]);
    } else {
        $res = ['ok' => false, 'error' => 'unknown_action'];
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send($res + ['ok' => false], in_array($res['error'] ?? '', ['forbidden', 'not_ngg_staff', 'out_of_scope'], true) ? 403 : 400);
unset($res['ok']); json_ok($res);
