<?php
/** Superadmin: staff/admin audit trail (filterable). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.audit.tail', [
    'requesterId' => $s['mid'],
    'limit'       => (int)($_GET['limit'] ?? 300),
    'actor'       => (string)($_GET['actor'] ?? ''),
    'event'       => (string)($_GET['event'] ?? ''),
    'staffOnly'   => (($_GET['staffOnly'] ?? '') === '1'),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
