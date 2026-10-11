<?php
/**
 * The member's Today page in one read: standing, account, the To do list in
 * the server's order (safeguarding → deadlines → replies → preparation),
 * this week, and where they stand. The client never re-sorts it.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_member_session();
require_method('GET');
$res = gs_call('member.today', ['memberId' => $s['mid']]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
