<?php
/** Public: active mentors directory (connected to Afrovanguard STS). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.mentors', []);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
