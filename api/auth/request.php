<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('auth.request');

$body = read_json_body();
$identifier = trim((string)($body['identifier'] ?? ''));
if ($identifier === '') json_error('missing_identifier');

$res = gs_call('auth.request', [
    'identifier' => $identifier,
    'ip'         => client_ip(),
    'userAgent'  => client_ua(),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'request_failed', 400);

json_ok([
    'masked' => $res['masked'] ?? '',
]);
