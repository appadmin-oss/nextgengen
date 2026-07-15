<?php
/** Public cohort leaderboard (privacy-safe: first name + last initial). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.leaderboard', ['limit' => (int)($_GET['limit'] ?? 12)], true);
unset($res['ok']);
json_ok($res);
