<?php
/**
 * Admin: engagement (M&E / audit cap).
 *
 *   (default)  the three staff roles — volunteers, instructors, mentors
 *   trends     their weekly history
 *   portal     how long members actually use the portal
 *   community  whether the community is a community: reply rate, distinct
 *              voices, reach, return rate, answer speed, and the posts
 *              nobody answered
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

if (($_GET['view'] ?? '') === 'portal') {
    $res = gs_call('admin.engagement.portal', [
        'requesterId' => $s['mid'],
        'days'        => $_GET['days'] ?? 30,
        'centre'      => $_GET['centre'] ?? '',
        'type'        => $_GET['type'] ?? '',
    ]);
} elseif (($_GET['view'] ?? '') === 'community') {
    $res = gs_call('admin.community.engagement', [
        'requesterId' => $s['mid'],
        'days'        => $_GET['days'] ?? 30,
        'channel'     => $_GET['channel'] ?? '',
        'limit'       => $_GET['limit'] ?? 20,
    ]);
} elseif (($_GET['view'] ?? '') === 'trends') {
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
