<?php
/** Member: Maths Lab (docs/MATH-LAB-PLAN.md). Marking happens in the domain; nothing here trusts an answer key, a score or a time from the client. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$mid = $s['mid'];
if ($method === 'GET') {
    $view = (string)($_GET['view'] ?? 'home');
    $lab = ['lab' => (string)($_GET['lab'] ?? 'maths')];   // which Lab (domain/labs.php); the op refuses an unknown one
    if ($view === 'map') $res = gs_call('mathslab.map', $lab + ['memberId' => $mid]);
    elseif ($view === 'comp') $res = gs_call('mathslab.comp', $lab + ['memberId' => $mid, 'comp' => (string)($_GET['comp'] ?? '')]);
    elseif ($view === 'guide') $res = gs_call('mathslab.guide', $lab + ['memberId' => $mid, 'stage' => (int)($_GET['stage'] ?? 0)]);
    elseif ($view === 'exams') $res = gs_call('mathslab.exams', $lab + ['memberId' => $mid]);
    elseif ($view === 'daily') $res = gs_call('mathslab.daily', $lab + ['memberId' => $mid]);
    elseif ($view === 'progress') $res = gs_call('mathslab.progress', $lab + ['memberId' => $mid]);
    elseif ($view === 'certificate') $res = gs_call('mathslab.certificate', $lab + ['memberId' => $mid, 'courseId' => (string)($_GET['course'] ?? '')]);
    else $res = gs_call('mathslab.home', $lab + ['memberId' => $mid]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $map = ['start' => 'mathslab.start', 'answer' => 'mathslab.answer', 'finish' => 'mathslab.finish', 'enrol' => 'mathslab.enrol', 'studied' => 'mathslab.studied', 'daily' => 'mathslab.dailyAnswer', 'chest' => 'mathslab.chest'];
    $a = (string)($b['action'] ?? '');
    if (!isset($map[$a])) json_error('bad_action', 400);
    rate_limit_check('mathslab.' . $a);
    $res = gs_call($map[$a], array_merge($b, ['memberId' => $mid]));
} else json_error('method_not_allowed', 405);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']); json_ok($res);
