<?php
/**
 * The NGG Club curriculum for the signed-in person (domain/curriculum.php).
 *   GET               their lessons, with progress
 *   GET ?unit=ID      one lesson (starts it)
 *   GET ?view=staff   an instructor's or mentor's view; &memberId= one member's
 *   POST action=submit | ask | mark | year | material | lesson | note | save   (multipart `file` → an instructor's upload)
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$mid = $s['mid'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (($_GET['view'] ?? '') === 'staff') {
        $res = isset($_GET['memberId'])
            ? gs_call('staff.curriculum.member', ['requesterId' => $mid, 'memberId' => (string)$_GET['memberId']])
            : gs_call('staff.curriculum', ['requesterId' => $mid]);
    } elseif (($_GET['view'] ?? '') === 'study') {
        $res = gs_call('member.study.plan', ['memberId' => $mid]);
    } elseif (($_GET['view'] ?? '') === 'testimonial') {
        /* Whether the term question is open at all, which session it is
           about, and what they already said (domain/testimonials.php). */
        $res = gs_call('member.testimonial.mine', ['memberId' => $mid]);
    } elseif (($_GET['view'] ?? '') === 'placement') {
        $res = gs_call('staff.curriculum.placement', ['requesterId' => $mid, 'course' => (string)($_GET['course'] ?? '')]);
    } elseif (($_GET['view'] ?? '') === 'sources') {
        // Go deeper: a fetched read on the lesson's topic and vetted free sources (domain/learn.php).
        $res = gs_call('member.learn.sources', ['memberId' => $mid, 'unitId' => (string)($_GET['unit'] ?? '')]);
    } elseif (isset($_GET['unit'])) {
        $res = gs_call('member.curriculum.unit', ['memberId' => $mid, 'unitId' => (string)$_GET['unit']]);
    } else {
        $res = gs_call('member.curriculum.list', ['memberId' => $mid]);
    }
} elseif ($method === 'POST' && !empty($_FILES['file'])) {
    // An instructor's material file (multipart); the submission follows as JSON.
    $f = $_FILES['file'];
    if ((int)($f['error'] ?? 1) !== UPLOAD_ERR_OK) json_send(['ok' => false, 'error' => (int)($f['error'] ?? 1) === UPLOAD_ERR_INI_SIZE ? 'too_large' : 'upload_failed'], 400);
    $res = gs_call('staff.curriculum.file', ['requesterId' => $mid, 'tmp' => (string)$f['tmp_name'], 'name' => (string)$f['name'], 'ip' => client_ip()]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'note') {
        // A private note on one of their own lessons (domain/learn.php); empty clears it.
        $res = gs_call('member.learn.note', ['memberId' => $mid, 'unitId' => (string)($b['unitId'] ?? ''), 'note' => (string)($b['note'] ?? '')]);
    } elseif ($action === 'save') {
        $res = gs_call('member.learn.save', ['memberId' => $mid, 'unitId' => (string)($b['unitId'] ?? ''), 'saved' => !empty($b['saved'])]);
    } elseif ($action === 'submit') {
        $res = gs_call('member.curriculum.submit', ['memberId' => $mid, 'unitId' => (string)($b['unitId'] ?? ''),
            'answers' => is_array($b['answers'] ?? null) ? $b['answers'] : []]);
    } elseif ($action === 'mark') {
        $res = gs_call('staff.curriculum.mark', ['requesterId' => $mid, 'progressId' => (int)($b['progressId'] ?? 0),
            'marks' => is_array($b['marks'] ?? null) ? $b['marks'] : [], 'ip' => client_ip()]);
    } elseif ($action === 'testimonial') {
        /* What they thought of the session, in their own words. Private
           until somebody with `content` decides otherwise — the rules are
           in domain/testimonials.php, not here. */
        $res = gs_call('member.testimonial.give', ['memberId' => $mid, 'sessionId' => (string)($b['sessionId'] ?? ''),
            'course' => (string)($b['course'] ?? ''), 'body' => (string)($b['body'] ?? ''), 'showAs' => (string)($b['showAs'] ?? 'initials')]);
    } elseif ($action === 'drill') {
        /* One session of their growth plan: start it, or hand the answers
           back to be marked. The answers never travel to the browser. */
        $res = (string)($b['drillId'] ?? '') !== ''
            ? gs_call('member.study.drill.mark', ['memberId' => $mid, 'drillId' => (string)$b['drillId'],
                'answers' => is_array($b['answers'] ?? null) ? $b['answers'] : []])
            : gs_call('member.study.drill.start', ['memberId' => $mid, 'itemId' => (string)($b['itemId'] ?? ''),
                'topic' => (string)($b['topic'] ?? ''), 'exam' => (string)($b['exam'] ?? '')]);
    } elseif ($action === 'feedback') {
        /* How today's lesson went: one tap, optionally a line. Never leaves
           the staff who teach them (domain/lesson-feedback.php). */
        $res = gs_call('member.lesson.feedback', ['memberId' => $mid, 'unitId' => (string)($b['unitId'] ?? ''),
            'signal' => (string)($b['signal'] ?? ''), 'body' => (string)($b['body'] ?? '')]);
    } elseif ($action === 'ask') {
        rate_limit_check_actor('member.curriculum.ask', (string)$mid);
        $res = gs_call('member.curriculum.ask', ['memberId' => $mid, 'unitId' => (string)($b['unitId'] ?? ''),
            'question' => (string)($b['question'] ?? ''), 'history' => is_array($b['history'] ?? null) ? $b['history'] : []]);
    } elseif ($action === 'year') {
        $res = gs_call('staff.curriculum.year', ['requesterId' => $mid, 'memberId' => (string)($b['memberId'] ?? ''), 'year' => $b['year'] ?? null, 'ip' => client_ip()]);
    } elseif ($action === 'confirm') {
        $res = gs_call('staff.curriculum.confirm', ['requesterId' => $mid, 'memberId' => (string)($b['memberId'] ?? ''), 'unitIds' => is_array($b['unitIds'] ?? null) ? $b['unitIds'] : [], 'done' => !isset($b['done']) || !empty($b['done']), 'ip' => client_ip()]);
    } elseif ($action === 'lesson') {
        /* The instructor's editor is the Control Room's editor, so the route
           forwards the whole lesson. What an instructor may DO with it is
           decided in the domain (own courses, draft unless they hold the
           curriculum capability), never by which fields a route happens to
           pass on — a guard made of omission is one nobody can read. */
        $res = gs_call('staff.curriculum.lesson', ['requesterId' => $mid,
            'unitId' => (string)($b['unitId'] ?? ''), 'course' => (string)($b['course'] ?? ''),
            'week' => $b['week'] ?? 1, 'position' => $b['position'] ?? 0, 'level' => (string)($b['level'] ?? ''),
            'title' => (string)($b['title'] ?? ''), 'summary' => (string)($b['summary'] ?? ''), 'body' => (string)($b['body'] ?? ''),
            'objectives' => $b['objectives'] ?? [], 'materials' => is_array($b['materials'] ?? null) ? $b['materials'] : [],
            'checks' => is_array($b['checks'] ?? null) ? $b['checks'] : [],
            'durationMins' => $b['durationMins'] ?? 0, 'passMark' => $b['passMark'] ?? 60,
            'status' => (string)($b['status'] ?? ''), 'ip' => client_ip()]);
    } elseif ($action === 'place') {
        $res = gs_call('staff.curriculum.place', ['requesterId' => $mid, 'placements' => is_array($b['placements'] ?? null) ? $b['placements'] : [], 'ip' => client_ip()]);
    } elseif ($action === 'material') {
        $res = gs_call('staff.curriculum.material', ['requesterId' => $mid, 'unitId' => (string)($b['unitId'] ?? ''), 'title' => (string)($b['title'] ?? ''),
            'url' => (string)($b['url'] ?? ''), 'kind' => (string)($b['kind'] ?? ''), 'note' => (string)($b['note'] ?? ''), 'ip' => client_ip()]);
    } else {
        $res = ['ok' => false, 'error' => 'unknown_action'];
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send($res + ['ok' => false], in_array($res['error'] ?? '', ['forbidden', 'not_ngg_staff', 'out_of_scope'], true) ? 403 : 400);
unset($res['ok']); json_ok($res);
