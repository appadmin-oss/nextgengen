<?php
/** Member: the Arcade — server-graded mini games in the Community.
 *
 *  Signed in with a member account or an ID card (summer student / volunteer);
 *  the player id is whatever the session carries, and the domain layer works
 *  out which programme that belongs to. Answers are graded on the server, so
 *  nothing here trusts a score, a duration, or an answer key from the client. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'home');
    if ($view === 'board') {
        $res = gs_call('arcade.board', [
            'memberId' => $s['mid'],
            'game'     => (string)($_GET['game'] ?? ''),
            'scope'    => (string)($_GET['scope'] ?? 'week'),
        ]);
    } elseif ($view === 'mathlab') {
        $res = gs_call('mathlab.board', ['playerId' => $s['mid']]);
    } else {
        $res = gs_call('arcade.home', ['memberId' => $s['mid']]);
    }
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    if ($action === 'start') {
        rate_limit_check('arcade.start');
        $res = gs_call('arcade.start', ['memberId' => $s['mid'], 'game' => (string)($b['game'] ?? '')]);
    } elseif ($action === 'submit') {
        $res = gs_call('arcade.submit', [
            'memberId' => $s['mid'],
            'roundId'  => (string)($b['roundId'] ?? ''),
            'answers'  => is_array($b['answers'] ?? null) ? $b['answers'] : [],
        ]);
    } elseif ($action === 'mathStart') {
        rate_limit_check('arcade.start');
        $res = gs_call('mathlab.start', ['playerId' => $s['mid'], 'level' => (int)($b['level'] ?? 0)]);
    } elseif ($action === 'mathSubmit') {
        $res = gs_call('mathlab.submit', ['playerId' => $s['mid'], 'roundId' => (string)($b['roundId'] ?? ''),
                                          'answers' => is_array($b['answers'] ?? null) ? $b['answers'] : []]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['message'] ?? null);
unset($res['ok']);
json_ok($res);
