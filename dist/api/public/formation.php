<?php
/**
 * Public: the Saturday Formation Schedule for one audience (member, mentor,
 * instructor, admin, parent), for a Saturday (default the next) at a centre
 * (default the main day). Cached; purged by the `formation` topic.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$a = preg_replace('/[^a-z]/', '', strtolower((string)($_GET['audience'] ?? 'member')));
$d = preg_replace('/[^0-9-]/', '', (string)($_GET['date'] ?? ''));
$c = mb_substr(trim((string)($_GET['centre'] ?? '')), 0, 80);
$res = gs_call('public.formation', ['audience' => $a, 'date' => $d, 'centre' => $c], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
unset($res['ok']);
json_ok($res);
