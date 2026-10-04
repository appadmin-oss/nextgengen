<?php
/** Writes on a family account. guardianId comes from the cookie, never from the body. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$f = require_family();
rate_limit_check('family.write', $f['gid']);
$b = read_json_body();
$base = ['guardianId' => $f['gid'], 'ip' => client_ip()];
$action = (string)($b['action'] ?? '');
switch ($action) {
    case 'profile':     $res = gs_call('family.profile', $base + ['fullName' => $b['fullName'] ?? '', 'phone' => $b['phone'] ?? '']); break;
    case 'ward.add':    $res = gs_call('family.ward.add', $base + ['method' => $b['method'] ?? 'code', 'code' => $b['code'] ?? '', 'name' => $b['name'] ?? '',
                                                          'memberId' => $b['memberId'] ?? '', 'relationship' => $b['relationship'] ?? 'parent']); break;
    case 'ward.remove': $res = gs_call('family.ward.remove', $base + ['linkId' => $b['linkId'] ?? '']); break;
    case 'ward.notify': $res = gs_call('family.ward.notify', $base + ['linkId' => $b['linkId'] ?? '', 'notify' => is_array($b['notify'] ?? null) ? $b['notify'] : []]); break;
    case 'request':     $res = gs_call('family.request.create', $base + ['linkId' => $b['linkId'] ?? '', 'kind' => $b['kind'] ?? '', 'subject' => $b['subject'] ?? '',
                                                          'body' => $b['body'] ?? '', 'fromDate' => $b['fromDate'] ?? '', 'toDate' => $b['toDate'] ?? '',
                                                          'refEntryId' => $b['refEntryId'] ?? '']); break;
    case 'withdraw':    $res = gs_call('family.request.withdraw', $base + ['requestId' => $b['requestId'] ?? '']); break;
    default: json_error('unknown_action', 400);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'too_many_attempts' ? 429 : 400, $res['detail'] ?? null);
unset($res['ok']); json_ok($res);
