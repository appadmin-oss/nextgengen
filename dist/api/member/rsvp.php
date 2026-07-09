<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$s = require_session();
$body = read_json_body();

$res = gs_call('event.rsvp', [
    'memberId' => $s['mid'],
    'eventId'  => $body['eventId'] ?? '',
    'status'   => $body['status']  ?? 'going',
    'ip'       => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
