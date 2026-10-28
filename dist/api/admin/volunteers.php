<?php
/** Admin: volunteer review desk — pending queue, roster, approve/decline.
 *  Approval mints the ID + QR, creates the profile, and delivers the
 *  digital ID by email/SMS. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (($_GET['view'] ?? '') === 'nggOptions') $res = gs_call('admin.volunteers.ngg.options', ['requesterId' => $s['mid'], 'volunteerId' => (string)($_GET['volunteerId'] ?? '')]);
    elseif (($_GET['view'] ?? '') === 'needs') $res = gs_call('admin.volunteers.needs.list', ['requesterId' => $s['mid']]);
    else $res = gs_call('admin.volunteers.list', ['requesterId' => $s['mid'], 'programme' => (string)($_GET['programme'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'approve')      $res = gs_call('admin.volunteers.approve', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'ip' => $ip]);
    elseif ($action === 'decline')  $res = gs_call('admin.volunteers.decline', ['requesterId' => $s['mid'], 'id' => $b['id'] ?? 0, 'reason' => $b['reason'] ?? '', 'ip' => $ip]);
    elseif ($action === 'safeguard') $res = gs_call('admin.volunteers.safeguard', ['requesterId' => $s['mid'], 'volunteerId' => $b['volunteerId'] ?? '', 'status' => $b['status'] ?? '', 'ip' => $ip]);
    elseif ($action === 'caps')      $res = gs_call('admin.volunteers.caps', ['requesterId' => $s['mid'], 'volunteerId' => $b['volunteerId'] ?? '', 'caps' => $b['caps'] ?? [], 'ip' => $ip]);
    elseif ($action === 'academy')  $res = gs_call('admin.volunteers.academy', ['requesterId' => $s['mid'], 'volunteerId' => $b['volunteerId'] ?? '', 'on' => !empty($b['on']), 'ip' => $ip]);
    elseif ($action === 'update')   $res = gs_call('admin.volunteers.update', ['requesterId' => $s['mid'], 'volunteerId' => $b['volunteerId'] ?? '', 'data' => $b['data'] ?? [], 'ip' => $ip]);
    elseif ($action === 'promoteNgg') $res = gs_call('admin.volunteers.promote.ngg', ['requesterId' => $s['mid'], 'volunteerId' => $b['volunteerId'] ?? '', 'centre' => $b['centre'] ?? '', 'keepSummer' => !empty($b['keepSummer']), 'newCard' => !empty($b['newCard']), 'ip' => $ip]);
    elseif ($action === 'delete')   $res = gs_call('admin.volunteers.delete', ['requesterId' => $s['mid'], 'volunteerId' => $b['volunteerId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'need_upsert') $res = gs_call('admin.volunteers.needs.upsert', ['requesterId' => $s['mid'], 'centreId' => $b['centreId'] ?? '', 'role' => $b['role'] ?? '', 'faculty' => $b['faculty'] ?? '', 'needCount' => $b['needCount'] ?? 0, 'ip' => $ip]);
    elseif ($action === 'need_delete') $res = gs_call('admin.volunteers.needs.delete', ['requesterId' => $s['mid'], 'centreId' => $b['centreId'] ?? '', 'role' => $b['role'] ?? '', 'faculty' => $b['faculty'] ?? '', 'ip' => $ip]);
    elseif ($action === 'item_upsert') $res = gs_call('admin.items.needs.upsert', ['requesterId' => $s['mid'], 'centreId' => $b['centreId'] ?? '', 'item' => $b['item'] ?? '', 'needCount' => $b['needCount'] ?? 0, 'filledCount' => $b['filledCount'] ?? 0, 'unit' => $b['unit'] ?? '', 'note' => $b['note'] ?? '', 'ip' => $ip]);
    elseif ($action === 'item_delete') $res = gs_call('admin.items.needs.delete', ['requesterId' => $s['mid'], 'centreId' => $b['centreId'] ?? '', 'item' => $b['item'] ?? '', 'ip' => $ip]);
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
