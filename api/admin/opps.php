<?php
/** Admin: Opportunities (domain/opportunities.php). GET the list · POST action=save (add, change, or remove) — capability: content. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.opps.list', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') !== 'save') json_error('unknown_action', 400);
    $res = gs_call('admin.opps.save', ['requesterId' => $s['mid'], 'ip' => client_ip()]
        + array_intersect_key($b, array_flip(['oppId', 'title', 'org', 'type', 'closesOn', 'why', 'url', 'ageMin', 'ageMax', 'status', 'remove'])));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
