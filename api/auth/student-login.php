<?php
/** Community sign-in with an ID card — for the two groups who hold a card but
 *  have no member account: summer students, and the Volunteer Vanguard
 *  (instructors, mentors, coordinators). QR token, or the ID printed on the
 *  card plus a phone number (a student's guardian, a volunteer's own).
 *  Issues a scoped session that unlocks the Community only. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('student.login');
$b = read_json_body();
$res = gs_call('community.login', [
    'token'        => (string)($b['token'] ?? ''),
    'displayId'    => (string)($b['displayId'] ?? ''),
    'guardianPhone'=> (string)($b['guardianPhone'] ?? ($b['phone'] ?? '')),
]);
if (empty($res['ok'])) {
    // A policy refusal is not a wrong password. Suspension is "a total ban from
    // the premises AND digital channels", so the community door is shut too —
    // but the person needs to be told which it is, not "check your ID card".
    $code = (string)($res['error'] ?? 'bad_credentials');
    if ($code === 'policy_suspended' || $code === 'policy_evicted') {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => $code, 'message' => (string)($res['message'] ?? '')], JSON_UNESCAPED_SLASHES);
        exit;
    }
    json_error($code, 401);
}
$kind = (string)($res['kind'] ?? 'student');
$who = $res['person'];
$personId = (string)($kind === 'volunteer' ? $who['volunteerId'] : $who['studentId']);
session_issue_cardholder($who, $kind, !empty($b['remember']));
$csrf = csrf_issue();
audit('community.login', $personId, $personId, ['kind' => $kind], client_ip());
json_ok(['member' => [
    'memberId' => $personId,
    'fullName' => (string)$who['fullName'],
    'type'     => $kind === 'volunteer' ? 'VOLUNTEER' : 'SUMMER',
    'role'     => $kind,
    'caps'     => [],
    'centre'   => (string)($who['centre'] ?? ''),
    'track'    => (string)($kind === 'volunteer' ? ($who['role'] ?? '') : ($who['track'] ?? '')),
    'photoUrl' => (string)($who['photoUrl'] ?? ''),
    /* Which portal this card opens, answered at sign-in rather than on the
     * next /auth/me. Without it a mentor signing in with a card saw no Mentor
     * Portal link until they happened to reload — the tool they had just
     * signed in to use was invisible on the screen they landed on. */
    'portal'   => function_exists('mentor_portal_role') ? mentor_portal_role($personId) : '',
], 'kind' => $kind, 'csrf' => $csrf]);
