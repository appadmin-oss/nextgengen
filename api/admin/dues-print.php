<?php
/** Dues as a printable page (domain/dues-print.php): ?kind=register[&centre=] or ?kind=statement&memberId=. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$kind = (string)($_GET['kind'] ?? 'register');
$res = $kind === 'statement'
    ? gs_call('admin.fees.statement.doc', ['requesterId' => $s['mid'], 'memberId' => (string)($_GET['memberId'] ?? ''), 'ip' => client_ip()])
    : gs_call('admin.fees.register.doc', ['requesterId' => $s['mid'], 'centre' => (string)($_GET['centre'] ?? ''), 'ip' => client_ip()]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
echo $res['html'];
