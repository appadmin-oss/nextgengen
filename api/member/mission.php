<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
$s = require_session();
$body = read_json_body();

$res = gs_call('anchor.mission.submit', [
    'memberId'  => $s['mid'],
    'missionId' => $body['missionId'] ?? '',
    'proofUrl'  => $body['proofUrl']  ?? '',
    'note'      => $body['note']      ?? '',
    'ip'        => client_ip(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
