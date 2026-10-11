<?php
/** Admin: the member record drive — settings, how complete the roster is, reminders,
 *  and correcting a join date (domain/profile-drive.php). Gated on `people` there. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.profile.drive', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $ops = ['set' => 'admin.profile.drive.set', 'remind' => 'admin.profile.remind', 'joindate' => 'admin.member.joindate'];
    $op = $ops[(string)($b['action'] ?? '')] ?? null;
    if (!$op) json_error('unknown_action', 400);
    $args = ['requesterId' => $s['mid'], 'ip' => client_ip()];
    foreach (['phase', 'deadline', 'fields', 'types', 'memberIds', 'memberId', 'date', 'reason'] as $f) if (array_key_exists($f, $b)) $args[$f] = $b[$f];
    $res = gs_call($op, $args);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false, 'error' => $res['error'] ?? 'failed', 'detail' => $res['detail'] ?? null], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
