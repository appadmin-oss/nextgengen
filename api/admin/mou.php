<?php
/**
 * Admin: Membership Agreements (domain/mou.php). Capability: people (scoped to the requester's centres).
 *   GET  ?view=list&status=&q=   · ?view=get&mouId=   · ?view=doc&mouId= (printable page)
 *   POST {action: start|resend|paper|countersign|void, …}
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
const MOU_ACTIONS = [
    'start'       => ['admin.mou.start', ['memberIds']],
    'resend'      => ['admin.mou.resend', ['mouId']],
    'countersign' => ['admin.mou.countersign', ['mouId', 'role', 'signature']],
    'void'        => ['admin.mou.void', ['mouId', 'reason']],
    'paper'       => ['admin.mou.paper', ['mouId', 'url', 'mime', 'bytes', 'width', 'height', 'checks', 'signerName', 'signerRel', 'trips', 'witnessName']],
];
if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    $base = ['requesterId' => $s['mid']];
    if ($view === 'doc') {
        $res = gs_call('admin.mou.doc', $base + ['mouId' => (string)($_GET['mouId'] ?? '')]);
        if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
        header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: private, no-store');
        echo $res['html']; exit;
    }
    $res = $view === 'get'
        ? gs_call('admin.mou.get', $base + ['mouId' => (string)($_GET['mouId'] ?? '')])
        : gs_call('admin.mou.list', $base + ['status' => (string)($_GET['status'] ?? ''), 'q' => (string)($_GET['q'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $a = MOU_ACTIONS[(string)($b['action'] ?? '')] ?? null;
    if (!$a) json_error('unknown_action', 400);
    $res = gs_call($a[0], ['requesterId' => $s['mid'], 'ip' => client_ip()] + array_intersect_key($b, array_flip($a[1])));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'forbidden' ? 403 : 400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']);
json_ok($res);
