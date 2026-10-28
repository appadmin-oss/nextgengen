<?php
/** What I still have to do, across my roles (domain/duties.php). GET ?role= · POST action=snooze {hours}. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('member.duties', ['requesterId' => $s['mid'], 'role' => (string)($_GET['role'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') !== 'snooze') json_error('unknown_action', 400);
    $res = gs_call('member.duties.snooze', ['requesterId' => $s['mid'], 'hours' => (int)($b['hours'] ?? 4)]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
