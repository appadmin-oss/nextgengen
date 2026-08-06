<?php
/** Admin: engagement rates for volunteers, instructors & mentors (M&E / audit cap). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

if (($_GET['view'] ?? '') === 'trends') {
    $res = gs_call('admin.engagement.trends', [
        'requesterId' => $s['mid'],
        'weeks'       => $_GET['weeks'] ?? 12,
        'centre'      => $_GET['centre'] ?? '',
        'role'        => $_GET['role'] ?? '',
        'personId'    => $_GET['personId'] ?? '',
    ]);
} else {
    $res = gs_call('admin.engagement', [
        'requesterId' => $s['mid'],
        'days'        => $_GET['days'] ?? 30,
        'role'        => $_GET['role'] ?? '',
    ]);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 403);
unset($res['ok']);
json_ok($res);
