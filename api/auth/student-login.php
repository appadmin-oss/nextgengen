<?php
/** Summer student sign-in with an ID card (QR token, or Display ID + guardian
 *  phone) → a scoped 'student' session that unlocks the Community only. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('student.login');
$b = read_json_body();
$res = gs_call('student.communityLogin', [
    'token'        => (string)($b['token'] ?? ''),
    'displayId'    => (string)($b['displayId'] ?? ''),
    'guardianPhone'=> (string)($b['guardianPhone'] ?? ''),
]);
if (empty($res['ok'])) json_error($res['error'] ?? 'bad_credentials', 401);
$stu = $res['student'];
session_issue_student($stu, !empty($b['remember']));
$csrf = csrf_issue();
audit('student.login', (string)$stu['studentId'], (string)$stu['studentId'], [], client_ip());
json_ok(['member' => [
    'memberId' => (string)$stu['studentId'], 'fullName' => (string)$stu['fullName'], 'type' => 'SUMMER', 'role' => 'student',
    'caps' => [], 'centre' => (string)($stu['centre'] ?? ''), 'photoUrl' => (string)($stu['photoUrl'] ?? ''),
], 'csrf' => $csrf]);
