<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.session', [], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 503);
unset($res['ok']);
json_ok($res);
