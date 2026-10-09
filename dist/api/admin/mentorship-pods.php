<?php
/** Admin: the Mentorship workspace — Anchor Pods, matching, cadence, rules,
 *  interventions, impact, the mentor pipeline and the commitment policy. The
 *  domain gates every op on `people` and the requester's centre scope. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

const MSW_READS = ['overview' => 'admin.ms.overview', 'queue' => 'admin.ms.queue', 'relationships' => 'admin.ms.relationships',
                   'match' => 'admin.ms.match.detail', 'checkins' => 'admin.ms.checkins', 'nudges' => 'admin.ms.nudges',
                   'interventions' => 'admin.ms.interventions', 'impact' => 'admin.ms.impact', 'pipeline' => 'admin.ms.pipeline'];
const MSW_WRITES = ['approve' => 'admin.ms.match.approve', 'undo' => 'admin.ms.match.undo', 'choose' => 'admin.ms.match.choose',
                    'status' => 'admin.ms.match.status', 'taskDone' => 'admin.ms.task.done', 'nudgeResolve' => 'admin.ms.nudge.resolve',
                    'intervention' => 'admin.ms.intervention.save', 'relcheck' => 'admin.ms.relcheck.save', 'obligations' => 'admin.ms.obligations.record',
                    'mentorMark' => 'admin.ms.mentor.mark', 'leaving' => 'admin.ms.mentor.leaving', 'profile' => 'admin.ms.profile.save',
                    'rulesRun' => 'admin.ms.rules.run'];
const MSW_FIELDS = ['memberId', 'mentorIds', 'mentorId', 'matchId', 'chosenBy', 'status', 'reason', 'id', 'note', 'plan', 'reviewOn', 'close',
                    'outcome', 'respondent', 'answers', 'kind', 'date', 'what', 'on', 'interests', 'wantsTo', 'supportArea', 'availability', 'style', 'centre'];

if ($method === 'GET') {
    $op = MSW_READS[(string)($_GET['view'] ?? 'overview')] ?? null;
    if (!$op) json_error('unknown_view', 400);
    $res = gs_call($op, ['requesterId' => $s['mid'], 'centre' => (string)($_GET['centre'] ?? ''), 'matchId' => (string)($_GET['matchId'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $op = MSW_WRITES[(string)($b['action'] ?? '')] ?? null;
    if (!$op) json_error('unknown_action', 400);
    $args = ['requesterId' => $s['mid'], 'ip' => client_ip()];
    foreach (MSW_FIELDS as $f) if (array_key_exists($f, $b)) $args[$f] = $b[$f];
    $res = gs_call($op, $args);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'forbidden' ? 403 : 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
