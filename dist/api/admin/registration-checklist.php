<?php
/**
 * Admin: the registration checklist (domain/registration-checklist.php). Capability: people.
 *   GET  ?view=list&filter=&q=&centre=&sort=&page=&pageSize=   (ids=1 → every matching memberId)
 *   GET  ?view=member&memberId=  · ?view=suggest&memberIds=a,b  · ?view=items
 *   POST {action: assign|start|reject|item.save|item.move|item.retire, …}
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
const REGCHECK_ACTIONS = [
    'assign'      => ['admin.regcheck.assign', ['memberIds', 'supervisorId', 'reason']],
    'start'       => ['admin.regcheck.start', ['memberIds', 'missing']],
    'reject'      => ['admin.regcheck.reject', ['memberId', 'itemKey', 'reason']],
    'followup'    => ['admin.regcheck.followup', ['memberId', 'channel', 'outcome', 'note', 'nextOn']],
    'item.save'   => ['admin.regcheck.item.save', ['itemId', 'title', 'help', 'evidence', 'presence', 'maxAgeDays', 'step']],
    'item.move'   => ['admin.regcheck.item.move', ['itemId', 'dir']],
    'item.retire' => ['admin.regcheck.item.retire', ['itemId', 'retire']],
];
if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'list');
    $base = ['requesterId' => $s['mid']];
    $res = match ($view) {
        'member'  => gs_call('admin.regcheck.member', $base + ['memberId' => (string)($_GET['memberId'] ?? '')]),
        'suggest' => gs_call('admin.regcheck.suggest', $base + ['memberIds' => array_values(array_filter(explode(',', (string)($_GET['memberIds'] ?? ''))))]),
        'items'   => gs_call('admin.regcheck.items', $base),
        default   => gs_call('admin.regcheck.list', $base + ['filter' => $_GET['filter'] ?? '', 'q' => $_GET['q'] ?? '', 'centre' => $_GET['centre'] ?? '',
                                                             'sort' => $_GET['sort'] ?? '', 'page' => $_GET['page'] ?? 0, 'pageSize' => $_GET['pageSize'] ?? 0, 'ids' => !empty($_GET['ids'])]),
    };
} elseif ($method === 'POST') {
    $b = read_json_body();
    $a = REGCHECK_ACTIONS[(string)($b['action'] ?? '')] ?? null;
    if (!$a) json_error('unknown_action', 400);
    $res = gs_call($a[0], ['requesterId' => $s['mid'], 'ip' => client_ip()] + array_intersect_key($b, array_flip($a[1])));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'forbidden' ? 403 : 400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']);
json_ok($res);
