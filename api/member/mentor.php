<?php
/** Mentor Portal API — session-gated; the domain gate resolves the signed-in
 *  person to a mentor, an instructor or an admin and works out whose children
 *  they may see. GET roster · POST a star. */
require_once __DIR__ . '/../_lib/bootstrap.php';

/** GET ?view= → op. */
const MENTOR_PORTAL_VIEWS = [
    'week' => 'member.mentor.week', 'caseload' => 'member.mentor.caseload', 'goals' => 'member.mentor.goals', 'summer' => 'member.mentor.summer', 'mentee' => 'member.mentor.mentee',
    'scorecard' => 'member.mentor.scorecard', 'index' => 'member.mentor.index', 'sessions' => 'member.mentor.sessions',
    'saturday' => 'member.mentor.saturday', 'messages' => 'member.mentor.messages', 'commitments' => 'member.mentor.commitments',
    'team' => 'member.mentor.team', 'academy' => 'member.mentor.academy',
    'plans' => 'member.mentor.plans', 'plan' => 'member.mentor.plan',
];
/** POST action → [op, body keys carried, rate-limit bucket]. Writes are limited; reads of state are not. */
const MENTOR_PORTAL_ACTIONS = [
    'session'         => ['member.mentor.session.save', ['type', 'subjectId', 'subjectIds', 'date', 'minutes', 'what', 'next', 'goalId', 'progress'], 'mentor.meeting'],
    'sessionDelete'   => ['member.mentor.session.delete', ['id'], ''],
    'goalCheckin'     => ['member.mentor.goal.checkin', ['subjectId', 'goalId', 'progress', 'note'], 'mentor.meeting'],
    'scorecard'       => ['member.mentor.scorecard.save', ['subjectId', 'month', 'scores'], 'mentor.meeting'],
    'relCheck'        => ['member.mentor.rel.save', ['subjectId', 'answers'], 'mentor.meeting'],
    'relFit'          => ['member.mentor.rel.fit', ['subjectId'], 'mentor.meeting'],
    'familySend'      => ['member.mentor.family.send', ['subjectId', 'body', 'draftId'], 'mentor.family'],
    'familyDrafts'    => ['member.mentor.family.drafts', ['subjectIds'], 'mentor.meeting'],
    'concern'         => ['member.mentor.concern.create', ['subjectId', 'category', 'body'], 'mentor.concern'],
    'supervisionPrep' => ['member.mentor.supervision.prep', ['answers'], 'mentor.meeting'],
    'supervisionBook' => ['member.mentor.supervision.book', ['mentorId'], 'mentor.meeting'],
    'retreatBook'     => ['member.mentor.retreat.book', ['retreatId'], ''],
    'academyResult'   => ['member.mentor.academy.result', ['moduleId', 'answers'], 'mentor.meeting'],
    'saturdayPlan'    => ['member.mentor.saturday.plan', ['date', 'agenda', 'oneToOnes', 'share'], ''],
    'oneToOnesAdd'    => ['member.mentor.onetoones.add', ['subjectIds'], ''],
    'register'        => ['member.mentor.register', ['date', 'rows', 'close'], ''],
    'weekReview'      => ['member.mentor.week.review', ['subjectId', 'date', 'effort', 'character', 'wellbeing', 'line', 'eval'], 'mentor.review'],
    'weekReviewUndo'  => ['member.mentor.week.review.undo', ['subjectId', 'period'], ''],
    'messageRead'     => ['member.mentor.message.read', ['threadId'], ''],
    'messageReply'    => ['member.mentor.message.reply', ['threadId', 'subjectId', 'body'], 'mentor.meeting'],
    'messageLead'     => ['member.mentor.message.lead', ['body', 'toId'], 'mentor.meeting'],
    'summerReview'    => ['member.mentor.summer.review', ['subjectId', 'effort', 'character', 'wellbeing', 'line'], 'mentor.review'],
    'nudgeDone'       => ['member.mentor.nudge.done', ['id'], ''],
    'planApprove'     => ['member.mentor.plan.approve', ['planId', 'note'], 'mentor.meeting'],
    'planReturn'      => ['member.mentor.plan.return', ['planId', 'note'], 'mentor.meeting'],
];
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
            'programme'   => (string)($_GET['programme'] ?? ''),
        ]);
    } elseif ($view === 'attention') {
        $res = gs_call('member.mentor.attention', [
            'requesterId' => $s['mid'],
            'centre'      => (string)($_GET['centre'] ?? ''),
        ]);
    } elseif (isset(MENTOR_PORTAL_VIEWS[$view])) {
        // The Mentor Portal's screens (design handoff v14). Every one is gated
        // by mentor_gate in the domain; these lines only carry the query.
        $res = gs_call(MENTOR_PORTAL_VIEWS[$view], ['requesterId' => $s['mid']]
            + array_intersect_key($_GET, array_flip(['centre', 'subjectId', 'month', 'date', 'days', 'scope', 'term'])));
    } else {
        // `centre` narrows an admin (or anyone else covering more than one) to a
        // single class. The gate rejects a centre outside their scope.
        // `scope` picks between the children assigned to this mentor and the
        // whole centre.
        $res = gs_call('member.mentor.roster', [
            'requesterId' => $s['mid'],
            'centre'      => (string)($_GET['centre'] ?? ''),
            'scope'       => (string)($_GET['scope'] ?? ''),
            'programme'   => (string)($_GET['programme'] ?? ''),
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
        ] + array_intersect_key($b, array_flip(['outcome', 'obstacle', 'plan', 'area', 'reviewBy', 'agreed'])));
    } elseif ((string)($b['action'] ?? '') === 'cover') {
        // Open a record I am not paired to, with a reason the child's mentor and lead will see.
        $res = gs_call('member.mentor.record.cover', ['requesterId' => $s['mid'], 'subjectId' => (string)($b['subjectId'] ?? ''),
                                                      'reason' => (string)($b['reason'] ?? ''), 'ip' => client_ip()]);
    } elseif ((string)($b['action'] ?? '') === 'goalStatus') {
        $res = gs_call('member.mentor.goal.status', [
            'requesterId' => $s['mid'],
            'subjectId'   => $b['subjectId'] ?? '',
            'id'          => $b['id'] ?? 0,
            'status'      => $b['status'] ?? '',
            'ip'          => client_ip(),
        ]);
    } elseif (isset(MENTOR_PORTAL_ACTIONS[(string)($b['action'] ?? '')])) {
        [$op, $keys, $bucket] = MENTOR_PORTAL_ACTIONS[(string)$b['action']];
        if ($bucket !== '') rate_limit_check($bucket);
        $res = gs_call($op, ['requesterId' => $s['mid'], 'ip' => client_ip()] + array_intersect_key($b, array_flip(array_merge($keys, ['centre']))));
    } else { json_error('unknown_action', 400); }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
