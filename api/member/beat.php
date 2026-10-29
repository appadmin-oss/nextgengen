<?php
/** Member: time on the portal. The page posts {portal, seconds} once a minute
 *  while it is visible and in use (domain/engagement.php portal_time_beat). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') json_error('method_not_allowed', 405);
$b = read_json_body();
$res = gs_call('member.portal.beat', ['memberId' => $s['mid'], 'portal' => $b['portal'] ?? '', 'seconds' => $b['seconds'] ?? 0]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']);
json_ok($res);
