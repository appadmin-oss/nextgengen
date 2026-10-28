<?php
/**
 * Support cases from My NGG and its community (domain/support.php).
 * GET  ?view=meta | suggest&q=&category= | mine | case&caseNo= | file&caseNo=&f=
 * POST {action: open | reply | solve | rate, …}
 * The member is the session's; nothing in the body says who is asking.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$who = support_who_member((string)$s['mid']);
if (!$who) json_error('unauthorized', 401);
require __DIR__ . '/../_lib/support-route.php';
