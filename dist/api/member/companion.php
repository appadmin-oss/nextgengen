<?php
/** The signed-in NGG member's companion: this week's assessment and the last eight (domain/companion.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$res = gs_call('member.companion', ['memberId' => $s['mid']]);
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'not_ngg_member' ? 403 : 400);
unset($res['ok']); json_ok($res);
