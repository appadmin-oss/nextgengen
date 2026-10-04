<?php
/** Public: one programme's courses (faculty → courses) and the centres it runs at, for the join form. Cached; purged by the `catalogue` and `centres` topics. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$program = strtolower((string)($_GET['program'] ?? '')) === 'summer' ? 'summer' : 'anchor';
$res = gs_call('public.programme', ['program' => $program], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 400);
unset($res['ok']);
json_ok($res);
