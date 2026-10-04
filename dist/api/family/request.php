<?php
/** Family account sign-in, step 1: email a code + link. Pre-session (CSRF-exempt, see csrf.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('family.request');
$b = read_json_body();
$res = gs_call('family.request', ['email' => (string)($b['email'] ?? ''), 'ip' => client_ip(), 'userAgent' => client_ua()]);
if (empty($res['ok'])) json_error($res['error'] ?? 'request_failed', 422);
json_ok(['masked' => $res['masked'] ?? '', 'delivery' => $res['delivery'] ?? true]);
