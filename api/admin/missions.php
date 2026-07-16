<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // ?view=submissions → the proof-review queue; default → the mission list.
    if ((string)($_GET['view'] ?? '') === 'submissions') {
        $res = gs_call('admin.missions.submissions', ['requesterId' => $s['mid']]);
    } else {
        $res = gs_call('admin.missions.list', ['requesterId' => $s['mid']]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}
if ($method === 'POST') {
    $body = read_json_body();
    if ((string)($body['action'] ?? '') === 'verify') {
        // Verify / reject a submitted mission (mentor or admin). verifierId is
        // taken from the session — never trusted from the client.
        $res = gs_call('anchor.mission.verify', [
            'verifierId' => $s['mid'],
            'memberId'   => $body['memberId']  ?? '',
            'missionId'  => $body['missionId'] ?? '',
            'approve'    => !empty($body['approve']),
            'note'       => $body['note'] ?? '',
            'ip'         => client_ip(),
        ]);
    } else {
        $res = gs_call('admin.missions.upsert', [
            'requesterId' => $s['mid'],
            'data'        => $body,
            'ip'          => client_ip(),
        ]);
    }
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}
json_error('method_not_allowed', 405);
