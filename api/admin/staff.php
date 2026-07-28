<?php
/** Admin: staff activity board, safeguarding acknowledgements, and the
 *  per-course skill catalogue the instructors mark against. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'performance');
    if ($view === 'performance') {
        $res = gs_call('admin.staff.performance', ['requesterId' => $s['mid'], 'days' => (int)($_GET['days'] ?? 30)]);
    } elseif ($view === 'skills') {
        $res = ['ok' => true, 'skills' => course_skills_all(), 'levels' => SKILL_LEVELS];
    } else { json_error('unknown_view', 400); }
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'ack')          $res = gs_call('admin.remark.ack', ['requesterId' => $s['mid'], 'remarkId' => $b['remarkId'] ?? '', 'ip' => $ip]);
    elseif ($action === 'skills')   $res = gs_call('admin.course.skills', ['requesterId' => $s['mid'], 'skills' => $b['skills'] ?? [], 'ip' => $ip]);
    else json_error('unknown_action', 400);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
