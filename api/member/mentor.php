<?php
/** Mentor Portal API — session-gated; the domain gate resolves the signed-in
 *  person to a mentor, an instructor or an admin and works out whose children
 *  they may see. GET roster · POST a star. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'roster');
    if ($view === 'child') {
        // One child's whole record — history, meetings, goals. Gated on the
        // subject, not merely on the requester.
        $res = gs_call('member.mentor.child', [
            'requesterId' => $s['mid'],
            'subjectId'   => (string)($_GET['subjectId'] ?? ''),
        ]);
    } elseif ($view === 'due') {
        // §18's actual question: who has nobody looked at this week.
        $res = gs_call('member.mentor.reviews.due', [
            'requesterId' => $s['mid'],
            'centre'      => (string)($_GET['centre'] ?? ''),
            'scope'       => (string)($_GET['scope'] ?? ''),
            'period'      => (string)($_GET['period'] ?? ''),
        ]);
    } elseif ($view === 'attention') {
        $res = gs_call('member.mentor.attention', [
            'requesterId' => $s['mid'],
            'centre'      => (string)($_GET['centre'] ?? ''),
        ]);
    } else {
        // `centre` narrows an admin (or anyone else covering more than one) to a
        // single class. The gate rejects a centre outside their scope.
        // `scope` picks between the children assigned to this mentor and the
        // whole centre.
        $res = gs_call('member.mentor.roster', [
            'requesterId' => $s['mid'],
            'centre'      => (string)($_GET['centre'] ?? ''),
            'scope'       => (string)($_GET['scope'] ?? ''),
        ]);
    }
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
    } elseif ((string)($b['action'] ?? '') === 'review') {
        // The twelve questions for one child for one week. Amends in place.
        rate_limit_check('mentor.review');
        $res = gs_call('member.mentor.review.save', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'period'      => $b['period'] ?? '',
            'answers'     => $b['answers'] ?? [],
            'concern'     => !empty($b['concern']),
            'trend'       => (string)($b['trend'] ?? ''),
            'ip'          => client_ip(),
        ]);
    } elseif ((string)($b['action'] ?? '') === 'courage') {
        // One observed instance on the 1-5 courage ladder (brief §14). The
        // domain requires the evidence; this only carries it.
        rate_limit_check('mentor.courage');
        $res = gs_call('member.mentor.courage.mark', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'score'       => $b['score'] ?? 0,
            'prompt'      => $b['prompt'] ?? '',
            'evidence'    => $b['evidence'] ?? '',
            'observedOn'  => $b['observedOn'] ?? '',
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
    } elseif ((string)($b['action'] ?? '') === 'meeting') {
        rate_limit_check('mentor.meeting');
        $res = gs_call('member.mentor.meeting.save', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'id'          => $b['id'] ?? 0,
            'metOn'       => $b['metOn'] ?? '',
            'kind'        => $b['kind'] ?? '',
            'discussed'   => $b['discussed'] ?? '',
            'agreed'      => $b['agreed'] ?? '',
            'concern'     => !empty($b['concern']),
            'ip'          => client_ip(),
        ]);
    } elseif ((string)($b['action'] ?? '') === 'meetingDelete') {
        $res = gs_call('member.mentor.meeting.delete', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'id'          => $b['id'] ?? 0,
            'ip'          => client_ip(),
        ]);
    } elseif ((string)($b['action'] ?? '') === 'goal') {
        $res = gs_call('member.mentor.goal.save', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'id'          => $b['id'] ?? 0,
            'goal'        => $b['goal'] ?? '',
            'dueOn'       => $b['dueOn'] ?? '',
            'ip'          => client_ip(),
        ]);
    } elseif ((string)($b['action'] ?? '') === 'goalStatus') {
        $res = gs_call('member.mentor.goal.status', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'id'          => $b['id'] ?? 0,
            'status'      => $b['status'] ?? '',
            'ip'          => client_ip(),
        ]);
    } else { json_error('unknown_action', 400); }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
