<?php
/** Admin: the accounts desk — sign-in health, and the members behind each
 *  number.
 *
 *  Reads and the one write (lifting a login lock) need `people`. Nothing here
 *  ends an account: whether a membership continues is the MoU's question, not
 *  the app's. Errors pass through whole rather than flattened to a code, so a
 *  refusal's `detail` survives (same shape as requests.php). CSRF is enforced
 *  for every write by bootstrap.php. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.accounts.overview', ['requesterId' => $s['mid'], 'ip' => client_ip()]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'unlock') {
        $res = gs_call('admin.accounts.unlock', ['requesterId' => $s['mid'],
            'memberId' => $b['memberId'] ?? '', 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
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
