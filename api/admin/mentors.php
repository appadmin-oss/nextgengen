<?php
/** Admin: the mentor roster — list, edit, and promote somebody already in the
 *  programme onto it. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? '');
    if ($view === 'candidates') {
        $res = gs_call('admin.mentor.candidates', ['requesterId' => $s['mid'], 'q' => (string)($_GET['q'] ?? '')]);
    } elseif ($view === 'duplicates') {
        // Active records sharing an email — everybody in a pair is locked out
        // of the portal until the desk separates them.
        $res = gs_call('admin.mentors.duplicates', ['requesterId' => $s['mid']]);
    } else {
        $res = gs_call('admin.mentors.list', ['requesterId' => $s['mid']]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}
if ($method === 'POST') {
    $body = read_json_body();
    $action = (string)($body['action'] ?? '');
    if ($action === 'promote') {
        $res = gs_call('admin.mentor.promote', [
            'requesterId' => $s['mid'], 'personId' => $body['personId'] ?? '',
            'rank' => $body['rank'] ?? 'mentor', 'centre' => $body['centre'] ?? '',
            'department' => $body['department'] ?? '', 'programme' => $body['programme'] ?? 'summer',
            'ip' => client_ip(),
        ]);
    } elseif ($action === 'demote') {
        $res = gs_call('admin.mentor.demote', ['requesterId' => $s['mid'], 'mentorId' => $body['mentorId'] ?? '', 'ip' => client_ip()]);
    } else {
        // Unchanged: the mentor drawer posts a record straight through.
        $res = gs_call('admin.mentors.upsert', ['requesterId' => $s['mid'], 'data' => $body, 'ip' => client_ip()]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}
json_error('method_not_allowed', 405);
