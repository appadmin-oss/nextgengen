<?php
/** Public: the Saturday Formation Schedule for one audience (member, mentor, instructor, admin, parent). Read from saturday_formation; cached; purged by the `formation` topic. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$a = preg_replace('/[^a-z]/', '', strtolower((string)($_GET['audience'] ?? 'member')));
$res = gs_call('public.formation', ['audience' => $a], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']);
json_ok($res);
