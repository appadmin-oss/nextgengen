<?php
/** Admin: manage a member's public projects + mentor notes (student|volunteer). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.profile.extras.get', [
        'requesterId' => $s['mid'],
        'subjectType' => (string)($_GET['subjectType'] ?? ''),
        'subjectId'   => (string)($_GET['subjectId'] ?? ''),
    ]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $base = array_merge($b, ['requesterId' => $s['mid'], 'ip' => client_ip()]);
    if ($action === 'project_upsert')    $res = gs_call('admin.profile.project.upsert', $base);
    elseif ($action === 'project_delete') $res = gs_call('admin.profile.project.delete', $base);
    elseif ($action === 'note_upsert')    $res = gs_call('admin.profile.note.upsert', $base);
    elseif ($action === 'note_delete')    $res = gs_call('admin.profile.note.delete', $base);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
