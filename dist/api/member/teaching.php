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
    } elseif ($view === 'today' || $view === 'class') {
        // The instructor's Today, or one class's whole Saturday (roll, plan, hinge, exit ticket, log).
        $res = gs_call($view === 'today' ? 'instructor.today' : 'instructor.class', ['requesterId' => $s['mid']]
            + array_intersect_key($_GET, array_flip(['course', 'centre', 'date', 'term'])));
    } elseif ($view === 'history') {
        $res = gs_call('instructor.class.history', ['requesterId' => $s['mid']] + array_intersect_key($_GET, array_flip(['course', 'centre'])));
    } elseif ($view === 'student') {
        $res = gs_call('instructor.student', ['requesterId' => $s['mid'], 'studentId' => (string)($_GET['studentId'] ?? '')]);
    } elseif ($view === 'results') {
        // The class's school results for a term — filtered and paged on the server.
        $res = gs_call('instructor.results', ['requesterId' => $s['mid']]
            + array_intersect_key($_GET, array_flip(['term', 'filter', 'q', 'cursor', 'centre'])));
    } elseif ($view === 'result') {
        $res = gs_call('instructor.result', ['requesterId' => $s['mid']]
            + array_intersect_key($_GET, array_flip(['studentId', 'term'])));
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
            'marks' => $b['marks'] ?? [], 'evidence' => $b['evidence'] ?? [], 'ip' => $ip,
        ]);
    } elseif (in_array($action, ['classRoll', 'classPlan', 'classHinge', 'classExit', 'classLog'], true)) {
        rate_limit_check('results.write', $s['mid']);
        $op = ['classRoll' => 'instructor.class.roll', 'classPlan' => 'instructor.class.plan', 'classHinge' => 'instructor.class.hinge',
               'classExit' => 'instructor.class.exit', 'classLog' => 'instructor.class.log'][$action];
        $res = gs_call($op, ['requesterId' => $s['mid'], 'ip' => $ip] + array_intersect_key($b, array_flip(['course', 'centre', 'date',
            'marks', 'close', 'awayRest', 'plan', 'question', 'options', 'correct', 'tally', 'trippedUp', 'results', 'misconception', 'feedback', 'done',
            'summary', 'remarks', 'file'])));
    } elseif (in_array($action, ['resultNote', 'resultSeen', 'resultRemind'], true)) {
        rate_limit_check($action === 'resultRemind' ? 'results.remind' : 'results.write', $s['mid']);
        $op = ['resultNote' => 'instructor.result.note', 'resultSeen' => 'instructor.result.seen', 'resultRemind' => 'instructor.result.remind'][$action];
        $res = gs_call($op, ['requesterId' => $s['mid'], 'ip' => $ip] + array_intersect_key($b, array_flip(['studentId', 'term', 'text'])));
    } else { json_error('unknown_action', 400); }
} else {
    json_error('method_not_allowed', 405);
}
// Extra fields (which skills need evidence, when a reminder may go again) are what the screen acts on.
if (empty($res['ok'])) json_send(['ok' => false, 'error' => $res['error'] ?? 'failed'] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
