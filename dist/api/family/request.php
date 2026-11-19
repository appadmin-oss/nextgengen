<?php
/** Family account sign-in, step 1: email a code + link. Pre-session (CSRF-exempt, see csrf.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('family.request');
$b = read_json_body();
/* Let in at the desk for 10 minutes: the email alone signs the guardian in, once
   (domain/mfa.php auth_window_signin). Nothing open: a code is emailed as before. */
$win = gs_call('auth.window', ['identifier' => (string)($b['email'] ?? ''), 'family' => true, 'ip' => client_ip()]);
if (!empty($win['letIn']) && !empty($win['guardian'])) {
    session_issue_family($win['guardian'], true, ['mfaP' => '']);
    $csrf = csrf_issue();
    json_ok(['letIn' => true, 'guardian' => family_guardian_public($win['guardian']), 'replaceUntil' => (int)($win['replaceUntil'] ?? 0), 'csrf' => $csrf]);
}
$res = gs_call('family.request', ['email' => (string)($b['email'] ?? ''), 'ip' => client_ip(), 'userAgent' => client_ua()]);
if (empty($res['ok'])) json_error($res['error'] ?? 'request_failed', 422);
json_ok(['masked' => $res['masked'] ?? '', 'delivery' => $res['delivery'] ?? true]);
