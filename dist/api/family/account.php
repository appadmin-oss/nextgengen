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
                                                          'refEntryId' => $b['refEntryId'] ?? '', 'proofUrl' => (string)($b['proofUrl'] ?? ''),
                                                          'amount' => $b['amount'] ?? null, 'reference' => (string)($b['reference'] ?? ''), 'paidAt' => (string)($b['paidAt'] ?? ''),
                                                          'parts' => is_array($b['parts'] ?? null) ? $b['parts'] : null]); break;
    // Anchor: the week for a parent's link (domain/circle.php).
    case 'anchor.confirm': $res = gs_call('family.anchor.confirm', $base + ['linkId' => $b['linkId'] ?? '', 'date' => (string)($b['date'] ?? ''), 'on' => !empty($b['on'])]); break;
    case 'anchor.remark': $res = gs_call('family.anchor.remark', $base + ['linkId' => $b['linkId'] ?? '', 'text' => (string)($b['text'] ?? '')]); break;
    case 'fees.advance': $res = gs_call('family.fees.advance', $base + ['linkId' => $b['linkId'] ?? '', 'months' => (int)($b['months'] ?? 0)]); break;
    case 'notices.read': $res = gs_call('family.notices.read', $base + ['noticeId' => (string)($b['noticeId'] ?? '')]); break;
    case 'withdraw':    $res = gs_call('family.request.withdraw', $base + ['requestId' => $b['requestId'] ?? '']); break;
    case 'report.sign': $res = gs_call('family.report.sign', $base + ['id' => (string)($b['id'] ?? '')]); break;
    case 'plan.sign':   $res = gs_call('family.plan.sign', $base + ['linkId' => $b['linkId'] ?? '', 'resultId' => (string)($b['resultId'] ?? '')]); break;
    case 'results.remind': $res = gs_call('family.results.remind', $base + ['linkId' => $b['linkId'] ?? '', 'resultId' => (string)($b['resultId'] ?? '')]); break;
    case 'results.upload': $res = gs_call('family.results.upload', $base + ['linkId' => $b['linkId'] ?? '', 'resultId' => (string)($b['resultId'] ?? ''),
                                                          'fileUrl' => (string)($b['fileUrl'] ?? ''), 'mime' => (string)($b['mime'] ?? ''), 'size' => (int)($b['size'] ?? 0)]); break;
    case 'rsvp':        $res = gs_call('family.rsvp', $base + ['eventId' => (string)($b['eventId'] ?? ''), 'answer' => (string)($b['answer'] ?? '')]); break;
    case 'mentor.book': $res = gs_call('family.mentor.book', $base + ['linkId' => $b['linkId'] ?? '', 'slotId' => (string)($b['slotId'] ?? '')]); break;
    default: json_error('unknown_action', 400);
}
// read_only is a 403: a family route never writes a profile, collectors or consents.
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'too_many_attempts' ? 429 : (($res['error'] ?? '') === 'read_only' ? 403 : 400), $res['detail'] ?? null);
unset($res['ok']); json_ok($res);
