<?php
/** The household inbox: reports, alerts, notices from the centre. GET ?cat=&cursor= */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$f = require_family();
$res = gs_call('family.inbox', ['guardianId' => $f['gid'], 'cat' => (string)($_GET['cat'] ?? ''), 'cursor' => (int)($_GET['cursor'] ?? 0)]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 400);
unset($res['ok']); json_ok($res);
