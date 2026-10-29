<?php
/** What is coming up at this family's centres, and the family's own answers. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$f = require_family();
$res = gs_call('family.events', ['guardianId' => $f['gid'], 'from' => (string)($_GET['from'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 400);
unset($res['ok']); json_ok($res);
