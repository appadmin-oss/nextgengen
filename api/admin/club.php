<?php
/** NGG Club coordinator — roster + Summer→Club promotion. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'overview');
    if ($view === 'promotable')  $res = gs_call('admin.club.promotable', ['requesterId' => $mid]);
    elseif ($view === 'members') $res = gs_call('admin.club.members', ['requesterId' => $mid, 'q' => $_GET['q'] ?? '']);
    else                         $res = gs_call('admin.club.overview', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if (($b['action'] ?? '') === 'promote') {
        $res = gs_call('admin.club.promote', ['requesterId' => $mid, 'studentId' => $b['studentId'] ?? '', 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
