<?php
/** Admin: analytics workspace (4-level M&E). Read + drill-down + activity log. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $in = read_json_body();
    $action = (string)($in['action'] ?? '');
    if ($action === 'drilldown') {
        $res = gs_call('analytics.drilldown', array_merge($in, ['requesterId' => $s['mid']]));
    } elseif ($action === 'activity.add') {
        $res = gs_call('analytics.activity.add', array_merge($in, ['requesterId' => $s['mid']]));
    } else {
        json_error('unknown_action', 400);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']); json_ok($res);
}

$res = gs_call('analytics.workspace', [
    'requesterId' => $s['mid'],
    'week'       => $_GET['week'] ?? '',
    'day'        => $_GET['day'] ?? '',
    'centre'     => $_GET['centre'] ?? '',
    'department' => $_GET['department'] ?? '',
    'category'   => $_GET['category'] ?? '',
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
