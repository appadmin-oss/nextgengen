<?php
/** Member account self-service: email change and a copy of everything we hold.
 *
 *  Ending a membership is NOT self-service. It is settled by the MoU between
 *  NGG and the family, which is a document and a conversation, not a button on
 *  a child's dashboard — the one that used to be here called member_erase()
 *  directly and was irreversible by anybody. The `delete` action is kept and
 *  refused rather than removed, so a client that has not been reloaded gets an
 *  answer that says what happened instead of `unknown_action`. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // GDPR data export bundle.
    $res = gs_call('member.export', ['memberId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'change_email') {
        $res = gs_call('member.email.changeRequest', ['memberId' => $mid, 'email' => $b['email'] ?? '', 'ip' => client_ip()]);
    } elseif ($action === 'delete') {
        // Always refuses. See the note above, and member_delete_account().
        $res = gs_call('member.deleteAccount', ['memberId' => $mid, 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    // Whole payload, so a refusal's `detail` reaches the person reading it.
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']);
json_ok($res);
