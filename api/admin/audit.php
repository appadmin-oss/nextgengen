<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.audit.tail', [
    'requesterId' => $s['mid'],
    'limit'       => (int)($_GET['limit'] ?? 100),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
