<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $res = gs_call('admin.promotions.get', ['requesterId' => $s['mid']]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']); json_ok($res); exit;
}
require_method('POST');
$body = read_json_body();
$res = gs_call('admin.promotions.set', [
    'requesterId' => $s['mid'],
    'promo'       => $body['promo'] ?? null,
    'ip'          => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
