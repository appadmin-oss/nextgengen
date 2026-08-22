<?php
/** Admin: programme promotions.
 *
 *  House promotions only — NGG telling its own members about its own
 *  programmes. Gated on `content`, because a promo is a piece of published
 *  copy rather than a roster action. See _lib/domain/promos.php for why there
 *  is no field here for a third-party URL. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.promos.list', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'save') {
        $res = gs_call('admin.promo.upsert', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => client_ip()]);
    } elseif ($action === 'delete') {
        $res = gs_call('admin.promo.delete', ['requesterId' => $s['mid'], 'promoId' => (string)($b['promoId'] ?? ''), 'ip' => client_ip()]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['message'] ?? null);
unset($res['ok']);
json_ok($res);
