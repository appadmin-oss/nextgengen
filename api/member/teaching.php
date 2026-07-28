<?php
/**
 * The teaching record — session log, per-child remarks, skill marks.
 *
 * Session-gated only; the domain gate (mentor_gate) decides whether the
 * signed-in person is a mentor, an instructor or an admin and which children
 * they may touch. Deliberately NOT require_admin: an instructor holds a
 * volunteer card, not a member account, and the whole point of this surface
 * is that they can reach it.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'session');
    if ($view === 'session') {
        $res = gs_call('instructor.session.get', [
            'requesterId' => $s['mid'],
            'course' => (string)($_GET['course'] ?? ''),
            'centre' => (string)($_GET['centre'] ?? ''),
            'date'   => (string)($_GET['date'] ?? ''),
        ]);
    } elseif ($view === 'skills') {
        $res = gs_call('instructor.skills.board', [
            'requesterId' => $s['mid'],
            'course' => (string)($_GET['course'] ?? ''),
            'centre' => (string)($_GET['centre'] ?? ''),
        ]);
    } elseif ($view === 'remarks') {
        $res = gs_call('member.remark.list', [
            'requesterId' => $s['mid'],
            'subjectId' => (string)($_GET['subjectId'] ?? ''),
        ]);
    } else { json_error('unknown_view', 400); }
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'session') {
        $res = gs_call('instructor.session.save', [
            'requesterId' => $s['mid'],
            'course' => $b['course'] ?? '', 'centre' => $b['centre'] ?? '', 'date' => $b['date'] ?? '',
            'covered' => $b['covered'] ?? '', 'roomScore' => $b['roomScore'] ?? 0,
            'markedPresent' => $b['markedPresent'] ?? [], 'markedAbsent' => $b['markedAbsent'] ?? [],
            'ip' => $ip,
        ]);
    } elseif ($action === 'remark') {
        $res = gs_call('member.remark.add', [
            'requesterId' => $s['mid'],
            'subjectId' => $b['subjectId'] ?? '', 'kind' => $b['kind'] ?? '', 'body' => $b['body'] ?? '',
            'ip' => $ip,
        ]);
    } elseif ($action === 'skills') {
        $res = gs_call('instructor.skills.mark', [
            'requesterId' => $s['mid'],
            'subjectId' => $b['subjectId'] ?? '', 'course' => $b['course'] ?? '',
            'marks' => $b['marks'] ?? [], 'ip' => $ip,
        ]);
    } else { json_error('unknown_action', 400); }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
