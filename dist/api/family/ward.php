<?php
/** One ward's dashboard. The link must be the signed-in guardian's own, and active. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$f = require_family();
$res = gs_call('family.ward', ['guardianId' => $f['gid'], 'linkId' => (string)($_GET['link'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', ($res['error'] ?? '') === 'not_found' ? 404 : 400);
unset($res['ok']); json_ok($res);
