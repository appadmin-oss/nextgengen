<?php
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
// Each accepted apply sends an acknowledgement email to a client-supplied
// address plus an admin alert, and the dedup guard is per-email — so a tight
// per-minute AND per-hour cap is needed to stop this becoming a spam relay.
rate_limit_check('apply');
rate_limit_check('apply.hour');

$body = read_json_body();
// Standardised intake: structured name, required phone, required DOB.
v_require($body, ['kind', 'firstName', 'lastName', 'email', 'phone', 'dob']);

$kind  = v_in($body['kind'], ['teen', 'mentor', 'volunteer']);
$first = v_safe_text(v_min(v_max(trim((string)$body['firstName']), 60), 1), 60);
$last  = v_safe_text(v_min(v_max(trim((string)$body['lastName']), 60), 1), 60);
$other = v_safe_text(v_max(trim((string)($body['otherName'] ?? '')), 60), 60);
$name  = trim($first . ($other !== '' ? ' ' . $other : '') . ' ' . $last);
$email = v_email($body['email']);
$phone = v_safe_text(v_max(trim((string)$body['phone']), 32), 32);
// Sex is standardised (male/female) and required on every intake; the domain
// layer validates/normalises it — forward the raw choice so it isn't dropped.
$sex   = v_safe_text(v_max(trim((string)($body['sex'] ?? '')), 16), 16);
// Teens are 10–17; mentors/volunteers are adults (16+ minimum).
// 18 and over on the teen form is the domain's call: it answers age_ngv (register for NGV instead).
$dob   = v_dob($body['dob'], $kind === 'teen' ? 10 : 16, $kind === 'teen' ? 40 : 100);
$why   = v_safe_text($body['why'] ?? '', 2000);

$payload = [
    'kind'      => $kind,
    'firstName' => $first,
    'lastName'  => $last,
    'otherName' => $other,
    'name'      => $name,
    'email'     => $email,
    'phone'     => $phone,
    'sex'       => $sex,
    'dob'       => $dob,
    'why'       => $why,
    'ip'        => client_ip(),
];

if ($kind === 'teen') {
    $payload['centre']  = v_safe_text($body['centre'] ?? '', 60);
    $payload['track']   = v_safe_text($body['track'] ?? '', 60);
    $payload['program'] = v_safe_text($body['program'] ?? '', 16);
    /* A hosted URL when the browser had a cloud to upload to, the image itself
       when it did not. v_safe_text used to truncate an inline data: URL at 512
       characters, storing a fragment of base64 that could never render — a
       broken photo on every application on a deployment with no Cloudinary. */
    $payload['photoUrl'] = photo_intake_url((string)($body['photoUrl'] ?? ''));
} elseif ($kind === 'volunteer') {
    v_require($body, ['role']);
    $payload['role']    = v_safe_text($body['role'] ?? '', 24);
    /* A hosted URL when the browser had a cloud to upload to, the image itself
       when it did not. v_safe_text used to truncate an inline data: URL at 512
       characters, storing a fragment of base64 that could never render — a
       broken photo on every application on a deployment with no Cloudinary. */
    $payload['photoUrl'] = photo_intake_url((string)($body['photoUrl'] ?? ''));
    // Home centre is required; mentors/instructors also pick a faculty. Forward
    // both (plus the optional public-visibility opt-in) so the domain can
    // validate against the live centre/faculty catalogues.
    $payload['centre']  = v_safe_text($body['centre'] ?? '', 80);
    $payload['faculty'] = v_safe_text($body['faculty'] ?? '', 80);
    $payload['visibilityConsent'] = !empty($body['visibilityConsent']) ? 1 : 0;
    $payload['courses'] = is_array($body['courses'] ?? null)
        ? array_slice(array_map(fn($c) => v_safe_text((string)$c, 60), $body['courses']), 0, 8)
        : [];
} else {
    $payload['role'] = v_safe_text($body['role'] ?? '', 60);
}

// Forward the sanitized allow-list as the authoritative payload, but layer it
// over the raw body so a field the domain requires (e.g. sex) can never be
// silently dropped by an incomplete allow-list — the sanitized values win, the
// raw body only backfills anything the list forgot. The domain re-validates
// every field it reads, so untrusted extras in $body are harmless.
$res = gs_call('public.apply', array_merge($body, $payload));
if (empty($res['ok'])) {
    $code = $res['error'] ?? 'apply_failed';
    // Which field, which agreements, what age: the form points at the answer to fix.
    json_send(['ok' => false, 'error' => $code, 'detail' => $res['detail'] ?? null, 'field' => $res['field'] ?? null,
               'missing' => $res['missing'] ?? null, 'age' => $res['age'] ?? null], $code === 'rate_limited' ? 429 : 400);
}
unset($res['ok']);
json_ok($res);
