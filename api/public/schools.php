<?php
/** Public: schools matching what a family typed (the Club application's picker). */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('schools');
$res = gs_call('public.schools', ['q' => (string)($_GET['q'] ?? ''), 'lga' => (string)($_GET['lga'] ?? ''), 'state' => (string)($_GET['state'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
