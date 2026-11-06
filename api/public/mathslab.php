<?php
/** Public: Maths Lab Lite — practice with marking and worked solutions for anyone, no account and no record. Rate-limited per caller. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    rate_limit_check('mathslab.lite');
    $v = (string)($_GET['view'] ?? 'item');
    $lab = ['lab' => (string)($_GET['lab'] ?? 'maths')];
    $res = $v === 'labs' ? gs_call('labs.list', []) : ($v === 'map' ? gs_call('mathslab.map', $lab) : ($v === 'comp' ? gs_call('mathslab.comp', $lab + ['comp' => (string)($_GET['comp'] ?? '')]) : gs_call('public.mathslab.item', $lab + ['comp' => (string)($_GET['comp'] ?? '')])));
} elseif ($method === 'POST') {
    rate_limit_check('mathslab.lite');
    $b = read_json_body();
    $res = gs_call('public.mathslab.check', ['token' => (string)($b['token'] ?? ''), 'answer' => $b['answer'] ?? '']);
} else json_error('method_not_allowed', 405);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
