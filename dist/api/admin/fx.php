<?php
/** Admin: exchange rates for showing prices abroad (domain/fx.php). GET: the rates and their sources.
 *  POST {action:'save', mode?, pinned:{CODE: naira|null}} · POST {action:'refresh'}. Writes need `fees`. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'save')        $res = gs_call('admin.fx.save', ['requesterId' => $mid, 'mode' => $b['mode'] ?? null, 'pinned' => is_array($b['pinned'] ?? null) ? $b['pinned'] : []]);
    elseif ($action === 'refresh') $res = gs_call('admin.fx.refresh', ['requesterId' => $mid]);
    else json_error('unknown_action', 400);
} else {
    $res = gs_call('admin.fx', ['requesterId' => $mid]);
}
if (empty($res['ok'])) {
    http_response_code(in_array(($res['error'] ?? ''), ['forbidden', 'no_requester'], true) ? 403 : 400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']); json_ok($res);
