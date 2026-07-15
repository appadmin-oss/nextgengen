<?php
require_once __DIR__ . '/../_lib/bootstrap.php';

$s = session_read();
if ($s) gs_call('auth.logout', ['memberId' => $s['mid'] ?? '', 'sid' => (string)($s['sid'] ?? ''), 'ip' => client_ip()]);
session_clear();
json_ok([]);
