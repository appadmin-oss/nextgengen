<?php
/* How children address this staff member: GET reads it, POST {honorific} sets it. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();   // an instructor may sign in with their ID card (mid = volunteerId)
$args = ['memberId' => $s['mid'], 'ip' => client_ip()];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $body = read_json_body();
    $args['honorific'] = (string)($body['honorific'] ?? '');
}
$res = gs_call('member.staff.title', $args);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
