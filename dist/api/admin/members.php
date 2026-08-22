<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.members.list', [
        'requesterId' => $s['mid'],
        'q'      => $_GET['q']      ?? '',
        'centre' => $_GET['centre'] ?? '',
        'status' => $_GET['status'] ?? '',
        'type'   => $_GET['type']   ?? '',
        // Forward pagination + scope the domain layer (and the UI) rely on.
        // Dropping these silently broke the pager, truncated "export all" to
        // the first page, and turned the staff roster into "first 50 members".
        'page'     => $_GET['page']     ?? null,
        'pageSize' => $_GET['pageSize'] ?? null,
        'all'      => $_GET['all']      ?? null,
        'staff'    => $_GET['staff']    ?? null,
        // Which column the roster is ordered by, and which way. Validated
        // against an allow-list in admin_members_list — the value ends up in
        // SQL text, so it is never interpolated as given.
        'sort'     => $_GET['sort']     ?? '',
        'dir'      => $_GET['dir']      ?? '',
        'ip'     => client_ip(),
    ]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $action = (string)($body['action'] ?? '');
    if ($action === 'reset2fa') {
        $res = gs_call('admin.members.reset2fa', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'delete') {
        $res = gs_call('admin.members.delete', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'setCaps') {
        $args = ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'caps' => $body['caps'] ?? [], 'ip' => client_ip()];
        if (array_key_exists('centreScope', $body)) $args['centreScope'] = $body['centreScope']; // only when explicitly set — avoids clobbering
        $res = gs_call('admin.members.caps', $args);
    } elseif ($action === 'consent') {
        // Recording a guardian's publication decision for a child. Append-only;
        // `method` says how it was obtained and is required by the domain layer.
        $res = gs_call('admin.members.consent', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '',
            'type' => $body['type'] ?? '', 'status' => $body['status'] ?? '', 'method' => $body['method'] ?? '',
            'ip' => client_ip()]);
    } elseif ($action === 'resetPassword') {
        $res = gs_call('admin.members.resetPassword', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'promoteNgv') {
        $args = ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'role' => $body['role'] ?? '', 'ip' => client_ip()];
        if (array_key_exists('sendId', $body)) $args['sendId'] = $body['sendId']; // only forward when the client set it (domain defaults to send on create)
        $res = gs_call('admin.members.promoteNgv', $args);
    } elseif ($action === 'demoteNgv') {
        $res = gs_call('admin.members.demoteNgv', ['requesterId' => $s['mid'], 'memberId' => $body['memberId'] ?? '', 'ip' => client_ip()]);
    } else {
        $res = gs_call('admin.members.upsert', ['requesterId' => $s['mid'], 'data' => $body, 'ip' => client_ip()]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
