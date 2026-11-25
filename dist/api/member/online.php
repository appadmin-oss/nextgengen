<?php
/** An online member's live side (domain/online.php, online-live.php).
 *  GET: the next Saturday session and whether Join is open. GET ?view=classes: the coming week of live classes,
 *  recordings, and whether live classes are paused. GET ?view=instructor: an instructor's own live classes.
 *  POST {action:'join'}: the session. POST {action:'classJoin', classId}: a live class — joining through here IS
 *  the attendance record, and the only way to the link. POST {action:'recording', classId, date, recordingUrl,
 *  note?}: an instructor adds a class's recording. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$mid = (string)$s['mid'];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'join') {
        rate_limit_check_actor('online.join', $mid);
        $res = gs_call('member.online.session.join', ['memberId' => $mid]);
    } elseif ($action === 'classJoin') {
        rate_limit_check_actor('online.join', $mid);
        $res = gs_call('member.online.class.join', ['memberId' => $mid, 'classId' => (string)($b['classId'] ?? '')]);
    } elseif ($action === 'recording') {
        $res = gs_call('admin.online.class.session', ['requesterId' => $mid, 'classId' => (string)($b['classId'] ?? ''), 'date' => (string)($b['date'] ?? ''),
            'recordingUrl' => (string)($b['recordingUrl'] ?? ''), 'note' => (string)($b['note'] ?? '')]);
    } else json_error('unknown_action', 400);
} else {
    $view = (string)($_GET['view'] ?? '');
    if ($view === 'classes') $res = gs_call('member.online.classes', ['memberId' => $mid]);
    elseif ($view === 'instructor') $res = gs_call('member.online.instructor', ['requesterId' => $mid]);
    else $res = gs_call('member.online.session', ['memberId' => $mid]);
}
if (empty($res['ok'])) {
    http_response_code(in_array(($res['error'] ?? ''), ['not_online', 'not_instructor', 'forbidden', 'paused'], true) ? 403 : 400);
    echo json_encode(array_merge(['ok' => false, 'error' => 'failed'], $res), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']); json_ok($res);
