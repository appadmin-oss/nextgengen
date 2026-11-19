<?php
/** A sealed Summer School report (domain/parent-reports.php), by its signed link — the parent has no account. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.report', ['reportId' => (string)($_GET['id'] ?? ''), 'key' => (string)($_GET['k'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Robots-Tag: noindex');
echo $res['html'];
