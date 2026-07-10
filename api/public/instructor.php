<?php
/** Public: an instructor's course roster — token + registered email required.
 *  First names and attendance only; this view exists for the room. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('default');
$b = read_json_body();
$res = gs_call('public.instructorRoster', ['token' => (string)($b['token'] ?? ''), 'email' => (string)($b['email'] ?? '')]);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_authorised', 403);
unset($res['ok']);
json_ok($res);
