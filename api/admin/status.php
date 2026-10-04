<?php
/** Admin: the status board — members, centres, mentors, instructors, centre leads and staff (domain/status.php). Each part needs the capability that owns its data; scoped to the reader's centres. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
require_method('GET');
$res = gs_call('admin.status.board', ['requesterId' => $s['mid']]);
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
