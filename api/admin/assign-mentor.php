<?php
/** Admin: assign (or clear) a member's mentor for a session. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
require_method('POST');
$b = read_json_body();
$res = gs_call('admin.mentor.assign', ['requesterId' => $s['mid'], 'memberId' => $b['memberId'] ?? '', 'mentorId' => $b['mentorId'] ?? '', 'sessionId' => $b['sessionId'] ?? '', 'ip' => client_ip()]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
