<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.session', [], true);
unset($res['ok']);
json_ok($res);
