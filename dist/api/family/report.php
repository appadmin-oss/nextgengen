<?php
/** A sealed family report (domain/parent-reports.php), as a printable page — for a guardian who follows that child. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$f = require_family();
$res = gs_call('family.report', ['guardianId' => $f['gid'], 'reportId' => (string)($_GET['id'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
echo $res['html'];
