<?php
/** Public contact / enquiry form. Stores the message + notifies admins. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('contact');  // each send notifies admins — tighter than default

$body = read_json_body();
v_require($body, ['name', 'email', 'message']);

// Sanitized allow-list is authoritative; layered over the raw body so no
// required field can be silently dropped (the domain re-validates every read).
$res = gs_call('public.contact', array_merge($body, [
    'name'    => v_safe_text($body['name'], 120),
    'email'   => v_email($body['email']),
    'message' => v_safe_text($body['message'] ?? '', 4000),
    'purpose' => v_safe_text($body['purpose'] ?? 'general', 24),
    'phone'   => v_safe_text($body['phone'] ?? '', 40),
    'subject' => v_safe_text($body['subject'] ?? '', 200),
    'website' => (string)($body['website'] ?? ''),  // honeypot
    'ip'      => client_ip(),
]));
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'contact_failed';
    json_error($code, $code === 'rate_limited' ? 429 : 400);
}
unset($res['ok']);
json_ok($res);
