<?php
/** Admin: NGG Online (domain/online.php, online-live.php) — the overview, settings, mentor pairing, the live
 *  classes and their automatic timetable, and holding an unpaid member's live classes open.
 *  The domain gates each op: reads with people/club/fees/curriculum, settings need `settings`, pairing `people`,
 *  classes and the planner `curriculum`, a hold `fees`. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$mid = $s['mid'];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $arr = static fn($k) => is_array($b[$k] ?? null) ? $b[$k] : [];
    if ($action === 'settings')         $res = gs_call('admin.online.settings.save', ['requesterId' => $mid, 'settings' => $arr('settings')]);
    elseif ($action === 'pair')         $res = gs_call('admin.online.mentor.pair', ['requesterId' => $mid, 'auto' => !empty($b['auto']), 'mentorId' => (string)($b['mentorId'] ?? ''), 'memberIds' => $arr('memberIds')]);
    elseif ($action === 'classSave')    $res = gs_call('admin.online.class.save', ['requesterId' => $mid, 'class' => $arr('class')]);
    elseif ($action === 'classSession') $res = gs_call('admin.online.class.session', array_intersect_key($b, array_flip(['classId', 'date', 'recordingUrl', 'cancelled', 'note'])) + ['requesterId' => $mid]);
    elseif ($action === 'plan')         $res = gs_call('admin.online.plan', ['requesterId' => $mid, 'apply' => !empty($b['apply'])]);
    elseif ($action === 'hold')         $res = gs_call('admin.online.hold', ['requesterId' => $mid, 'memberId' => (string)($b['memberId'] ?? ''), 'hours' => (int)($b['hours'] ?? 0),
                                            'until' => (string)($b['until'] ?? ''), 'reason' => (string)($b['reason'] ?? ''), 'end' => !empty($b['end'])]);
    else json_error('unknown_action', 400);
} else {
    $view = (string)($_GET['view'] ?? '');
    if ($view === 'classes')         $res = gs_call('admin.online.classes', ['requesterId' => $mid]);
    elseif ($view === 'attendance')  $res = gs_call('admin.online.class.attendance', ['requesterId' => $mid, 'classId' => (string)($_GET['classId'] ?? ''), 'date' => (string)($_GET['date'] ?? '')]);
    else                             $res = gs_call('admin.online.overview', ['requesterId' => $mid]);
}
if (empty($res['ok'])) {
    http_response_code(in_array(($res['error'] ?? ''), ['forbidden', 'no_requester'], true) ? 403 : 400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']); json_ok($res);
