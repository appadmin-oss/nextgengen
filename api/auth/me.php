<?php
require_once __DIR__ . '/../_lib/bootstrap.php';

$s = session_read();
if (!$s) json_ok(['member' => null]);

$res = gs_call('auth.me', ['memberId' => $s['mid'] ?? '']);
if (empty($res['ok'])) json_ok(['member' => null]);

json_ok([
    'member'  => $res['member'],
    'adminOk' => (bool)($s['adminOk'] ?? false),
]);
