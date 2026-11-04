<?php
/**
 * A member's own record and their requests to the desk.
 *
 * Three reads (statement, records, requests) and two writes (raise, withdraw),
 * on one route because they are one screen's worth of the app and a route per
 * verb would be five near-identical files.
 *
 * The memberId comes from the SESSION on every single call. There is no
 * `?memberId=` here and there must never be: that parameter is the difference
 * between a self-service page and an enumeration endpoint over children.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'requests');
    if ($view === 'statement')     $res = gs_call('member.statement', ['memberId' => $s['mid']]);
    elseif ($view === 'records')   $res = gs_call('member.records', ['memberId' => $s['mid']]);
    elseif ($view === 'requests')  $res = gs_call('member.requests', ['memberId' => $s['mid']]);
    /* The child's own Courage Index (brief §14). Unlike the mentoring
       record, this one is theirs to read — a ladder somebody is climbing
       without being told where they are is assessment, not formation. */
    elseif ($view === 'courage')   $res = gs_call('member.courage', ['memberId' => $s['mid']]);
    else json_error('unknown_view', 400);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'feedback') {
        rate_limit_check('member.request', $s['mid']);
        $res = gs_call('member.request.create', ['memberId' => $s['mid'], 'kind' => 'feedback',
            'topic' => $b['topic'] ?? '', 'body' => $b['body'] ?? '', 'rating' => (int)($b['rating'] ?? 0), 'anonymous' => !empty($b['anonymous'])]);
    } elseif ($action === 'withdraw') {
        $res = gs_call('member.request.withdraw', ['memberId' => $s['mid'],
            'requestId' => $b['requestId'] ?? '', 'ip' => client_ip()]);
    } else {
        /* Raising a request sends the desk an event and can carry an uploaded
           receipt, so it is rate-limited per member like the other member-side
           writes that reach staff. */
        rate_limit_check('member.request', $s['mid']);
        $res = gs_call('member.request.create', ['memberId' => $s['mid'],
            'kind' => $b['kind'] ?? '', 'subject' => $b['subject'] ?? '', 'body' => $b['body'] ?? '',
            'amount' => $b['amount'] ?? null, 'reference' => $b['reference'] ?? '', 'parts' => is_array($b['parts'] ?? null) ? $b['parts'] : null,
            'proofUrl' => $b['proofUrl'] ?? '', 'paidAt' => $b['paidAt'] ?? '',
            'fromDate' => $b['fromDate'] ?? '', 'toDate' => $b['toDate'] ?? '',
            'refEntryId' => $b['refEntryId'] ?? '', 'refSanctionId' => (int)($b['refSanctionId'] ?? 0), 'ip' => client_ip(), 'fromMember' => true]);
    }
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
