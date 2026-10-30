<?php
/** The desk's queue of member requests — payments claimed, appeals, leave, IDs. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.requests.list', ['requesterId' => $s['mid'],
        'status' => $_GET['status'] ?? 'open', 'kind' => $_GET['kind'] ?? '',
        'q' => $_GET['q'] ?? '', 'memberId' => $_GET['memberId'] ?? '', 'sort' => $_GET['sort'] ?? '',
        'offset' => $_GET['offset'] ?? 0, 'pageSize' => $_GET['pageSize'] ?? 0]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if (($b['action'] ?? '') === 'comment') $res = gs_call('admin.requests.comment', ['requesterId' => $s['mid'], 'requestId' => $b['requestId'] ?? '',
        'text' => (string)($b['text'] ?? ''), 'ip' => client_ip()]);
    elseif (($b['action'] ?? '') === 'applyDetails') $res = gs_call('admin.requests.applyDetails', ['requesterId' => $s['mid'], 'requestId' => $b['requestId'] ?? '',
        'changes' => is_array($b['changes'] ?? null) ? $b['changes'] : [], 'reply' => (string)($b['reply'] ?? ''), 'ip' => client_ip()]);
    else $res = gs_call('admin.requests.decide', ['requesterId' => $s['mid'],
        'requestId' => $b['requestId'] ?? '', 'approve' => !empty($b['approve']), 'answer' => (string)($b['answer'] ?? ''),
        'decision' => $b['decision'] ?? '', 'amount' => $b['amount'] ?? null,
        'parts' => is_array($b['parts'] ?? null) ? $b['parts'] : null, 'ip' => client_ip()]);
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
