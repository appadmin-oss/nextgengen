<?php
/** Admin: manage the two public status boards (/s-status, /v-status) —
 *  publish toggle + editorial copy. Read + save. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    $res = gs_call('admin.status.pages.set', ['requesterId' => $s['mid'], 'data' => $b['data'] ?? [], 'ip' => client_ip()]);
} else {
    $res = gs_call('admin.status.pages.get', ['requesterId' => $s['mid']]);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
