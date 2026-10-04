<?php
/** Admin: one NGG member's whole record — attendance, conduct, money (fees holders), curriculum, companion, family, mentorship, classes (domain/member-record.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
require_method('GET');
$res = gs_call('admin.members.record', ['requesterId' => $s['mid'], 'memberId' => (string)($_GET['memberId'] ?? '')]);
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : (($res['error'] ?? '') === 'not_found' || ($res['error'] ?? '') === 'out_of_scope' ? 404 : 400));
unset($res['ok']); json_ok($res);
