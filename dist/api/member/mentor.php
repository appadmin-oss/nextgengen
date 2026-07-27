<?php
/** Mentor Portal API — session-gated; the domain gate confirms the signed-in
 *  member is an active mentor. GET roster · POST a star. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('member.mentor.roster', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    if ((string)($b['action'] ?? '') === 'star') {
        $res = gs_call('behaviour.star.give', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'stars'       => $b['stars'] ?? 0,
            'category'    => $b['category'] ?? '',
            'note'        => $b['note'] ?? '',
            'ip'          => client_ip(),
        ]);
    } elseif ((string)($b['action'] ?? '') === 'v3') {
        $res = gs_call('member.mentor.v3.rate', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'verbal'      => $b['verbal'] ?? 0,
            'vocal'       => $b['vocal'] ?? 0,
            'visual'      => $b['visual'] ?? 0,
            'note'        => $b['note'] ?? '',
            'ip'          => client_ip(),
        ]);
    } elseif ((string)($b['action'] ?? '') === 'bulk') {
        $res = gs_call('behaviour.bulk.award', [
            'requesterId' => $s['mid'],
            'subjectIds'  => $b['subjectIds'] ?? [],
            'presetId'    => $b['presetId'] ?? '',
            // Only forward what was actually sent — a missing key means "take
            // it from the preset", and a null would override the preset with
            // nothing.
        ] + array_intersect_key($b, array_flip(['stars', 'category', 'severity', 'note']))
          + ['ip' => client_ip()]);
    } else { json_error('unknown_action', 400); }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
