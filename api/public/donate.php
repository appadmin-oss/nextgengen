<?php
/** Public: start a donation (returns the Paystack checkout URL). */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('donate');
$b = read_json_body();
// Allow-list is authoritative; layered over the raw body so no required field
// can be silently dropped (the domain re-validates email + amount bounds).
$res = gs_call('public.donate.init', array_merge($b, ['email' => $b['email'] ?? '', 'name' => $b['name'] ?? '', 'amount' => $b['amount'] ?? 0, 'message' => $b['message'] ?? '', 'ip' => client_ip()]));
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
