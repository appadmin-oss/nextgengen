<?php
/** Admin: registration console — form builder, gate links, pending queue. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'registrations');
    if ($view === 'selfreg')         $res = gs_call('admin.selfreg.state', ['requesterId' => $s['mid']]);
    elseif ($view === 'forms')       $res = gs_call('admin.forms.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'form')        $res = gs_call('admin.forms.get', ['requesterId' => $s['mid'], 'formId' => (string)($_GET['formId'] ?? 'summer-reg')]);
    elseif ($view === 'gates')       $res = gs_call('admin.gates.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'registrations') $res = gs_call('admin.registrations.list', [
        'requesterId' => $s['mid'],
        'q' => (string)($_GET['q'] ?? ''), 'status' => (string)($_GET['status'] ?? ''),
        'centre' => (string)($_GET['centre'] ?? ''),
        'page' => (int)($_GET['page'] ?? 1), 'pageSize' => (int)($_GET['pageSize'] ?? 25),
    ]);
    elseif ($view === 'centres')     $res = gs_call('admin.centres.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'catalogue')   $res = gs_call('admin.academy.catalogue.get', ['requesterId' => $s['mid']]);
    elseif ($view === 'cards')       $res = gs_call('admin.cards.data', ['requesterId' => $s['mid'], 'studentId' => (string)($_GET['studentId'] ?? '')]);
    /* The consent ledger for one child — what is already on file, and the
       permission list a desk has to work through before recording anything. */
    elseif ($view === 'consents')    $res = gs_call('admin.registration.consents', ['requesterId' => $s['mid'], 'studentId' => (string)($_GET['studentId'] ?? '')]);
    elseif ($view === 'hierarchy')   $res = gs_call('admin.hierarchy.list', ['requesterId' => $s['mid']]);
    elseif ($view === 'vcards')      $res = gs_call('admin.vcards.data', ['requesterId' => $s['mid'], 'volunteerId' => (string)($_GET['volunteerId'] ?? '')]);
    else json_error('unknown_view', 400);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'publish_form')   $res = gs_call('admin.forms.publish', ['requesterId' => $s['mid'], 'formId' => $b['formId'] ?? 'summer-reg', 'fields' => $b['fields'] ?? [], 'name' => $b['name'] ?? '', 'ip' => $ip]);
    elseif ($action === 'gate_create') $res = gs_call('admin.gates.create', ['requesterId' => $s['mid'], 'name' => $b['name'] ?? '', 'kind' => $b['kind'] ?? 'desk', 'expiresAt' => $b['expiresAt'] ?? '', 'validDays' => $b['validDays'] ?? null, 'password' => $b['password'] ?? '', 'generate' => !empty($b['generate']), 'rotateDays' => $b['rotateDays'] ?? 0, 'expiryDays' => $b['expiryDays'] ?? 0, 'notifyEmail' => $b['notifyEmail'] ?? '', 'centreId' => $b['centreId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'gate_setpass') $res = gs_call('admin.gates.setpass', ['requesterId' => $s['mid'], 'gateId' => $b['gateId'] ?? '', 'password' => $b['password'] ?? '', 'generate' => !empty($b['generate']), 'ip' => $ip]);
    elseif ($action === 'gate_validity') $res = gs_call('admin.gates.validity', ['requesterId' => $s['mid'], 'gateId' => $b['gateId'] ?? '', 'expiresAt' => $b['expiresAt'] ?? '', 'validDays' => $b['validDays'] ?? null, 'ip' => $ip]);
    elseif ($action === 'gate_rotate') $res = gs_call('admin.gates.rotate', ['requesterId' => $s['mid'], 'gateId' => $b['gateId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'gate_rotation') $res = gs_call('admin.gates.rotation', ['requesterId' => $s['mid'], 'gateId' => $b['gateId'] ?? '', 'rotateDays' => $b['rotateDays'] ?? 0, 'expiryDays' => $b['expiryDays'] ?? 0, 'notifyEmail' => $b['notifyEmail'] ?? '', 'ip' => $ip]);
    elseif ($action === 'gate_revoke') $res = gs_call('admin.gates.revoke', ['requesterId' => $s['mid'], 'gateId' => $b['gateId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'gate_delete') $res = gs_call('admin.gates.delete', ['requesterId' => $s['mid'], 'gateId' => $b['gateId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'selfreg_open') $res = gs_call('admin.selfreg.setOpen', ['requesterId' => $s['mid'], 'ip' => $ip,
        'open' => !empty($b['open']), 'note' => $b['note'] ?? '']);
    elseif ($action === 'remind')      $res = gs_call('admin.registrations.remind', ['requesterId' => $s['mid'], 'studentId' => $b['studentId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'remind_bulk') $res = gs_call('admin.registrations.remindBulk', ['requesterId' => $s['mid'],
        'centre' => $b['centre'] ?? '', 'quietDays' => $b['quietDays'] ?? 1, 'limit' => $b['limit'] ?? 100, 'ip' => $ip]);
    elseif ($action === 'consent_record') $res = gs_call('admin.registration.consent.record', ['requesterId' => $s['mid'],
        'studentId' => $b['studentId'] ?? '', 'method' => $b['method'] ?? '', 'guardianName' => $b['guardianName'] ?? '',
        'consents' => $b['consents'] ?? [], 'note' => $b['note'] ?? '', 'ip' => $ip]);
    elseif ($action === 'consent_bulk') $res = gs_call('admin.registration.consent.bulk', ['requesterId' => $s['mid'],
        'studentIds' => $b['studentIds'] ?? [], 'method' => $b['method'] ?? '',
        'scope' => $b['scope'] ?? '', 'centre' => $b['centre'] ?? '',
        'consents' => $b['consents'] ?? [], 'note' => $b['note'] ?? '', 'ip' => $ip]);
    elseif ($action === 'resend_id')   { rate_limit_check('id.resend'); $res = gs_call('admin.id.resend', ['requesterId' => $s['mid'], 'kind' => $b['kind'] ?? 'student', 'id' => $b['id'] ?? '', 'qrPng' => $b['qrPng'] ?? '', 'ip' => $ip]); }
    elseif ($action === 'centre_upsert') $res = gs_call('admin.centres.upsert', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => $ip]);
    elseif ($action === 'centre_delete') $res = gs_call('admin.centres.delete', ['requesterId' => $s['mid'], 'centreId' => $b['centreId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'catalogue_set') $res = gs_call('admin.academy.catalogue.set', ['requesterId' => $s['mid'], 'catalogue' => $b['catalogue'] ?? null, 'reset' => !empty($b['reset']), 'ip' => $ip]);
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
/* Centre edits feed the public centre list and the stats block, and neither was
   purged before — so renaming a centre or adding one left the public site
   showing the old set until the TTL rolled. Enrolling changes the counts. */
if (in_array($action ?? '', ['centre_upsert', 'centre_delete'], true))      cache_invalidate('centres');
/* Recording a consent verifies the child, which changes the verified count, the
   pending queue and the card studio's roster. All three read cached students. */
elseif (in_array($action ?? '', ['gate_create', 'remind_bulk', 'consent_record', 'consent_bulk'], true)) cache_invalidate('students');
unset($res['ok']); json_ok($res);
