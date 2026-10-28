<?php
/** Admin: add, change or end a member's supporting mentor (domain/mentor-supports.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
require_method('POST');
$b = read_json_body();
$res = gs_call('admin.mentor.support', ['requesterId' => $s['mid'], 'memberId' => $b['memberId'] ?? '', 'mentorId' => $b['mentorId'] ?? '',
    'focus' => $b['focus'] ?? '', 'endsOn' => $b['endsOn'] ?? '', 'end' => !empty($b['end']), 'ip' => client_ip()]);
if (empty($res['ok'])) json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
