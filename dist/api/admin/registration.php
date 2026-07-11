<?php
/** Admin: registration console — form builder, gate links, pending queue. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'registrations');
    if ($view === 'forms')           $res = gs_call('admin.forms.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'form')        $res = gs_call('admin.forms.get', ['requesterId' => $s['mid'], 'formId' => (string)($_GET['formId'] ?? 'summer-reg')]);
    elseif ($view === 'gates')       $res = gs_call('admin.gates.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'registrations') $res = gs_call('admin.registrations.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'centres')     $res = gs_call('admin.centres.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'cards')       $res = gs_call('admin.cards.data', ['requesterId' => $s['mid'], 'studentId' => (string)($_GET['studentId'] ?? '')]);
    elseif ($view === 'hierarchy')   $res = gs_call('admin.hierarchy.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'vcards')      $res = gs_call('admin.vcards.data', ['requesterId' => $s['mid'], 'volunteerId' => (string)($_GET['volunteerId'] ?? '')]);
    else json_error('unknown_view', 400);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'publish_form')   $res = gs_call('admin.forms.publish', ['requesterId' => $s['mid'], 'formId' => $b['formId'] ?? 'summer-reg', 'fields' => $b['fields'] ?? [], 'name' => $b['name'] ?? '', 'ip' => $ip]);
    elseif ($action === 'gate_create') $res = gs_call('admin.gates.create', ['requesterId' => $s['mid'], 'name' => $b['name'] ?? '', 'expiresAt' => $b['expiresAt'] ?? '', 'password' => $b['password'] ?? '', 'centreId' => $b['centreId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'gate_setpass') $res = gs_call('admin.gates.setpass', ['requesterId' => $s['mid'], 'gateId' => $b['gateId'] ?? '', 'password' => $b['password'] ?? '', 'ip' => $ip]);
    elseif ($action === 'gate_revoke') $res = gs_call('admin.gates.revoke', ['requesterId' => $s['mid'], 'gateId' => $b['gateId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'remind')      $res = gs_call('admin.registrations.remind', ['requesterId' => $s['mid'], 'studentId' => $b['studentId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'centre_upsert') $res = gs_call('admin.centres.upsert', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => $ip]);
    elseif ($action === 'centre_delete') $res = gs_call('admin.centres.delete', ['requesterId' => $s['mid'], 'centreId' => $b['centreId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'hierarchy_upsert') $res = gs_call('admin.hierarchy.upsert', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => $ip]);
    elseif ($action === 'hierarchy_delete') $res = gs_call('admin.hierarchy.delete', ['requesterId' => $s['mid'], 'tierId' => $b['tierId'] ?? '', 'ip' => $ip]);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
