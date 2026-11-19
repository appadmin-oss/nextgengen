<?php
/**
 * The registration checklist, for the person signed in (domain/registration-checklist.php).
 *   GET  ?view=mine      the members I supervise (a staff, mentor or volunteer sign-in)
 *   GET  ?view=progress  my own registration (a member)
 *   POST {action: 'submit', memberId, itemKey, url?, mime?, bytes?, capturedOn?, note?}
 *   POST {action: 'followup', memberId, channel, outcome, note?, nextOn}
 * Every check — assigned to me, the evidence, the day, the centre — is the domain's.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'mine');
    $res = gs_call($view === 'progress' ? 'member.regcheck.progress' : 'member.regcheck.mine', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $act = (string)($b['action'] ?? '');
    if (!in_array($act, ['submit', 'followup'], true)) json_error('unknown_action', 400);
    rate_limit_check_actor('regcheck.submit', (string)$s['mid']);
    $res = $act === 'followup'
        ? gs_call('member.regcheck.followup', ['requesterId' => $s['mid'], 'ip' => client_ip()] + array_intersect_key($b, array_flip(['memberId', 'channel', 'outcome', 'note', 'nextOn'])))
        : gs_call('member.regcheck.submit', ['requesterId' => $s['mid'], 'ip' => client_ip()]
            + array_intersect_key($b, array_flip(['memberId', 'itemKey', 'url', 'mime', 'bytes', 'capturedOn', 'note'])));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(in_array($res['error'] ?? '', ['forbidden', 'not_assigned'], true) ? 403 : 400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']);
json_ok($res);
