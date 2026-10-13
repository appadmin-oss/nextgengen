<?php
/** Public: verify a volunteer service certificate by its id. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('cert');
$res = gs_call('public.cert', ['id' => (string)($_GET['id'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']);
json_ok($res);
