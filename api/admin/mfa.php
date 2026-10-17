<?php
/**
 * Admin: Sign-in & security (domain/mfa.php).
 * GET  ?kind=member|team|guardian&state=none|enrolled|all&q=&limit=&offset=   — capability: people
 * POST action=policy {policy:{member,team,guardian}, methods:{kind:[...]}}                        — capability: settings
 * POST action=bypass|reset|require|unrequire|remind {people:[{id,who}], minutes?, force?} — capability: people
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $res = gs_call('admin.mfa.overview', ['requesterId' => $s['mid']]
        + array_intersect_key($_GET, array_flip(['kind', 'state', 'q', 'limit', 'offset'])));
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'policy') {
        $res = gs_call('admin.mfa.policy', ['requesterId' => $s['mid'], 'ip' => client_ip(), 'policy' => $b['policy'] ?? null, 'methods' => $b['methods'] ?? null]);
    } else {
        $res = gs_call('admin.mfa.act', ['requesterId' => $s['mid'], 'ip' => client_ip(), 'action' => $action]
            + array_intersect_key($b, array_flip(['people', 'minutes', 'force'])));
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
