<?php
/** Admin: Summer School — cohorts, QR minting, enrollment, roster, check-in. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'overview');
    if ($view === 'students')     $res = gs_call('admin.summer.students.list', ['requesterId' => $mid, 'q' => $_GET['q'] ?? '', 'cohortId' => $_GET['cohortId'] ?? '', 'schoolType' => $_GET['schoolType'] ?? '', 'limit' => $_GET['limit'] ?? '']);
    elseif ($view === 'qr')       $res = gs_call('admin.summer.qr.list', ['requesterId' => $mid, 'status' => $_GET['status'] ?? '', 'batch' => $_GET['batch'] ?? '']);
    elseif ($view === 'attendance') $res = gs_call('admin.summer.attendance', ['requesterId' => $mid,
        'cohortId' => $_GET['cohortId'] ?? '', 'centre' => $_GET['centre'] ?? '',
        'from' => $_GET['from'] ?? '', 'to' => $_GET['to'] ?? '',
        'q' => $_GET['q'] ?? '', 'scenario' => $_GET['scenario'] ?? '', 'sort' => $_GET['sort'] ?? '']);
    elseif ($view === 'volunteer-attendance') $res = gs_call('admin.volunteer.attendance', ['requesterId' => $mid,
        'centre' => $_GET['centre'] ?? '', 'from' => $_GET['from'] ?? '', 'to' => $_GET['to'] ?? '',
        'q' => $_GET['q'] ?? '', 'scenario' => $_GET['scenario'] ?? '', 'sort' => $_GET['sort'] ?? '']);
    elseif ($view === 'attendance-day') $res = gs_call('admin.summer.attendance.day', ['requesterId' => $mid,
        'cohortId' => $_GET['cohortId'] ?? '', 'date' => $_GET['date'] ?? '', 'centre' => $_GET['centre'] ?? '']);
    elseif ($view === 'insights')   $res = gs_call('admin.summer.insights', ['requesterId' => $mid, 'cohortId' => $_GET['cohortId'] ?? '']);
    elseif ($view === 'consent')    $res = gs_call('admin.summer.consent', ['requesterId' => $mid, 'studentId' => $_GET['studentId'] ?? '']);
    else                          $res = gs_call('admin.summer.overview', ['requesterId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $map = [
        'consentDoc'   => 'admin.summer.consentDoc.save',
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
    // Never let the client set kiosk-only control flags: `gateAuthorized` skips
    // the per-op capability gate and `byId` stamps the roll-taker. Both are set
    // only by trusted server code (the gate route). Stripping them here forces
    // admin-console check-ins through admin_cap_gate() with a server-derived byId.
    unset($b['gateAuthorized'], $b['byId']);
    $res = gs_call($map[$action], array_merge($b, ['requesterId' => $mid, 'ip' => client_ip()]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    // A policy refusal is not a bare error code: it carries who was refused and
    // why, and the kiosk needs both to tell the desk something useful instead
    // of printing "policy_suspended" at them.
    http_response_code(400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], is_array($res) ? $res : []), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
