<?php
/** Public: the live Summer School sign-up link (a gated /apply?g=… link) for the current edition. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.summer.signup', ['centre' => (string)($_GET['centre'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
