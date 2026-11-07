<?php
/** A followed child's account statement, as a printable page (domain/dues-print.php). ?linkId= */
require_once __DIR__ . '/../_lib/bootstrap.php';
$f = require_family();
$res = gs_call('family.statement.doc', ['guardianId' => $f['gid'], 'linkId' => (string)($_GET['linkId'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
echo $res['html'];
