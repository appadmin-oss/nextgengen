<?php
/** Public: applicant self-service status lookup (ref + email). */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('application.status');  // throttle (ref,email) brute-force lookups
$b = read_json_body();
$res = gs_call('public.application.status', ['ref' => $b['ref'] ?? '', 'email' => $b['email'] ?? '', 'ip' => client_ip()]);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
