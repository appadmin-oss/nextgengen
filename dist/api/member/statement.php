<?php
/** The signed-in member's own account statement, as a printable page (domain/dues-print.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
$res = gs_call('member.fees.statement.doc', ['memberId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 404);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
echo $res['html'];
