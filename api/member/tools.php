<?php
/** Study tools (/study): flashcards, focus and typing logs, a deck from a lesson (domain/study-tools.php). The member's own, always. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$mid = (string)($s['mid'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
const TOOLS_READ = ['decks' => 'member.tools.decks', 'deck' => 'member.tools.deck', 'due' => 'member.tools.due', 'stats' => 'member.tools.stats', 'lessons' => 'member.tools.lessons'];
const TOOLS_WRITE = ['save' => 'member.tools.deck.save', 'delete' => 'member.tools.deck.delete', 'review' => 'member.tools.review', 'log' => 'member.tools.log', 'ai' => 'member.tools.cards.ai'];
if ($method === 'GET') {
    $op = TOOLS_READ[(string)($_GET['view'] ?? '')] ?? null;
    if (!$op) json_error('unknown_view', 400);
    $res = gs_call($op, ['memberId' => $mid, 'deckId' => (string)($_GET['deckId'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $op = TOOLS_WRITE[(string)($b['action'] ?? '')] ?? null;
    if (!$op) json_error('unknown_action', 400);
    if ($op === 'member.tools.cards.ai') rate_limit_check_actor('member.curriculum.ask', $mid);
    $res = gs_call($op, ['memberId' => $mid] + array_diff_key($b, ['memberId' => 1, 'action' => 1]));
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false, 'error' => (string)($res['error'] ?? 'failed')] + array_diff_key($res, ['ok' => 1]), ($res['error'] ?? '') === 'not_found' ? 404 : 400);
unset($res['ok']); json_ok($res);
