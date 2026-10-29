<?php
/**
 * Public: has this child applied to the Club before? Answers yes or no, and
 * whether that application is still open (so sending again updates it) —
 * never a name, a reference or a status. Both the email AND the date of birth
 * must match, and the lookup is rate limited per minute and per hour, so it
 * cannot be used to walk a list of birthdays.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('apply.check');
rate_limit_check('apply.check.hour');
$b = read_json_body();
$res = gs_call('public.apply.check', ['email' => $b['email'] ?? '', 'dob' => $b['dob'] ?? '', 'program' => $b['program'] ?? 'anchor']);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
