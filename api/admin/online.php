<?php
/** Admin: NGG Online (domain/online.php) — the overview, the session settings, and mentor pairing.
 *  The domain gates each op: the overview reads with people/club/fees, settings need `settings`,
 *  pairing needs `people`. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'settings')  $res = gs_call('admin.online.settings.save', ['requesterId' => $mid, 'settings' => is_array($b['settings'] ?? null) ? $b['settings'] : []]);
    elseif ($action === 'pair')  $res = gs_call('admin.online.mentor.pair', ['requesterId' => $mid, 'auto' => !empty($b['auto']), 'mentorId' => (string)($b['mentorId'] ?? ''), 'memberIds' => is_array($b['memberIds'] ?? null) ? $b['memberIds'] : []]);
    else json_error('unknown_action', 400);
} else {
    $res = gs_call('admin.online.overview', ['requesterId' => $mid]);
}
if (empty($res['ok'])) {
    http_response_code(in_array(($res['error'] ?? ''), ['forbidden', 'no_requester'], true) ? 403 : 400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']); json_ok($res);
