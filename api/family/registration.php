<?php
/** One ward's registration progress: how much is done, what is left, who is helping (first name). The guardian's own active link only. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$f = require_family();
$res = gs_call('family.regcheck', ['guardianId' => $f['gid'], 'linkId' => (string)($_GET['link'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', ($res['error'] ?? '') === 'not_found' ? 404 : 400);
unset($res['ok']); json_ok($res);
