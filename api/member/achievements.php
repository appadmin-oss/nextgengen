<?php
/** A member's achievements, worked out from their records (domain/achievements.php). Read-only. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$res = gs_call('member.achievements', ['memberId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
