<?php
/** Admin: Summer School — cohorts, QR minting, enrollment, roster, check-in. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'overview');
    if ($view === 'students')     $res = gs_call('admin.summer.students.list', ['requesterId' => $mid, 'q' => $_GET['q'] ?? '', 'cohortId' => $_GET['cohortId'] ?? '']);
    elseif ($view === 'qr')       $res = gs_call('admin.summer.qr.list', ['requesterId' => $mid, 'status' => $_GET['status'] ?? '', 'batch' => $_GET['batch'] ?? '']);
    elseif ($view === 'attendance') $res = gs_call('admin.summer.attendance', ['requesterId' => $mid, 'cohortId' => $_GET['cohortId'] ?? '']);
    elseif ($view === 'insights')   $res = gs_call('admin.summer.insights', ['requesterId' => $mid, 'cohortId' => $_GET['cohortId'] ?? '']);
    else                          $res = gs_call('admin.summer.overview', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $map = [
        'mint'         => 'admin.summer.qr.mint',
        'qr_void'      => 'admin.summer.qr.void',
        'qr_reassign'  => 'admin.summer.qr.reassign',
        'enroll'       => 'admin.summer.enroll',
        'cohort'       => 'admin.summer.cohort.upsert',
        'studentStatus'=> 'admin.summer.student.status',
        'studentUpdate'=> 'admin.summer.student.update',
        'studentDelete'=> 'admin.summer.student.delete',
        'checkin'      => 'admin.summer.checkin',
        'archive'      => 'admin.summer.cohort.archive',
        'issueCerts'   => 'admin.summer.certs.issue',
        'revokeCert'   => 'admin.cert.revoke',
        'checkout'     => 'admin.summer.checkout',
        'absenceAlert' => 'admin.summer.absence.alert',
        'import'       => 'admin.summer.import',
    ];
    if (!isset($map[$action])) json_error('unknown_action', 400);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
