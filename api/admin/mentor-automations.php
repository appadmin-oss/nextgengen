<?php
/** Admin: Mentorship automations — the Mentor Portal's background jobs, their
 *  thresholds and times, the run log, retreats and the scorecard unlock
 *  (domain/mentor-automations.php). Gated on `people` and centre scope there. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

const MPA_READS = ['list' => 'admin.mentor.automations.list', 'log' => 'admin.mentor.automations.log', 'retreats' => 'admin.mentor.retreats'];
const MPA_WRITES = ['update' => 'admin.mentor.automations.update', 'run' => 'admin.mentor.automations.run',
                    'retreat' => 'admin.mentor.retreat.save', 'unlock' => 'admin.mentor.scorecard.unlock'];
const MPA_FIELDS = ['job', 'on', 'hour', 'centresOff', 'thresholds', 'retreatId', 'title', 'onDate', 'place', 'subjectId', 'month'];

if ($method === 'GET') {
    $op = MPA_READS[(string)($_GET['view'] ?? 'list')] ?? null;
    if (!$op) json_error('unknown_view', 400);
    $res = gs_call($op, ['requesterId' => $s['mid'], 'days' => (int)($_GET['days'] ?? 30), 'job' => (string)($_GET['job'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $op = MPA_WRITES[(string)($b['action'] ?? '')] ?? null;
    if (!$op) json_error('unknown_action', 400);
    $args = ['requesterId' => $s['mid'], 'ip' => client_ip()];
    foreach (MPA_FIELDS as $f) if (array_key_exists($f, $b)) $args[$f] = $b[$f];
    $res = gs_call($op, $args);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
