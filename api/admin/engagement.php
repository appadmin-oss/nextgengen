<?php
/** Admin: engagement rates for volunteers, instructors & mentors (M&E / audit cap). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

$res = gs_call('admin.engagement', [
    'requesterId' => $s['mid'],
    'days'        => $_GET['days'] ?? 30,
    'role'        => $_GET['role'] ?? '',
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 403);
unset($res['ok']);
json_ok($res);
