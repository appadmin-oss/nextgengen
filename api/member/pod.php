<?php
/** Mentor Portal — Anchor Pods (domain/mentorship-pods.php). Session-gated;
 *  the domain resolves the mentor, their clearance and their pod. A mentee who
 *  is not in the signed-in mentor's pod is a 403, never an empty record.
 *  The mentee's own offer / choice / relationship check ride here too. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

const POD_READS = ['today' => 'member.ms.today', 'case' => 'member.ms.case', 'academy' => 'member.ms.academy',
                   'policy' => 'member.ms.policy', 'offer' => 'member.ms.offer', 'mine' => 'member.mentor.mine'];
const POD_WRITES = ['observe' => 'member.ms.observe', 'onetoone' => 'member.ms.onetoone', 'taskDone' => 'member.ms.task.done',
                    'nudgeDone' => 'member.ms.nudge.done', 'relcheck' => 'member.ms.relcheck', 'relcheckMentee' => 'member.ms.relcheck.mentee',
                    'checkin' => 'member.ms.coord.checkin', 'concern' => 'member.ms.concern', 'academyCheck' => 'member.ms.academy.check',
                    'policyAccept' => 'member.ms.policy.accept', 'choose' => 'member.ms.choose',
                    // The member's own side of the Mentor Portal (domain/mentor-portal.php).
                    'weekCheckin' => 'member.checkin.save', 'selfScore' => 'member.mentor.selfscore', 'relChild' => 'member.mentor.rel.child'];
const POD_FIELDS = ['memberId', 'subjectId', 'subjectName', 'ratings', 'indicator', 'level', 'evidence', 'strength', 'growth', 'nextChallenge',
                    'discussed', 'agreed', 'minutes', 'where', 'seemed', 'metOn', 'concern', 'id', 'note', 'answers', 'feeling', 'wins', 'hard',
                    'needSupport', 'category', 'body', 'moduleId', 'signedName', 'version', 'matchId', 'mentorId',
                    'wellbeing', 'sleep', 'stress', 'energy', 'scores'];

if ($method === 'GET') {
    $op = POD_READS[(string)($_GET['view'] ?? 'today')] ?? null;
    if (!$op) json_error('unknown_view', 400);
    $res = gs_call($op, ['requesterId' => $s['mid'], 'memberId' => (string)($_GET['memberId'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    $op = POD_WRITES[$action] ?? null;
    if (!$op) json_error('unknown_action', 400);
    if ($action === 'concern') rate_limit_check_actor('safeguarding.report', (string)$s['mid']);
    $args = ['requesterId' => $s['mid'], 'ip' => client_ip()];
    foreach (POD_FIELDS as $f) if (array_key_exists($f, $b)) $args[$f] = $b[$f];
    $res = gs_call($op, $args);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    $e = (string)($res['error'] ?? 'failed');
    json_error($e, in_array($e, ['not_in_pod', 'not_cleared', 'forbidden', 'not_a_mentor', 'no_mentor_record'], true) ? 403 : 400,
               isset($res['detail']) ? (string)$res['detail'] : null);
}
unset($res['ok']); json_ok($res);
