<?php
/* One route body for both doors (admin/assignments.php, member/assign-desk.php):
 * the caller has set $s. Reads input, calls one op, prints the result. */
$base = ['requesterId' => (string)$s['mid'], 'ip' => client_ip(), 'viaAdmin' => !empty($viaAdmin)];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    if (!empty($_GET['assignmentId'])) $res = gs_call('staff.assignments.submissions', $base + ['assignmentId' => (string)$_GET['assignmentId']]);
    elseif (!empty($_GET['audience'])) $res = gs_call('staff.assignments.audience', $base + array_intersect_key($_GET, array_flip(['track', 'centre', 'sessionId'])));
    else $res = gs_call('staff.assignments.list', $base + ['status' => (string)($_GET['status'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $action = (string)($b['action'] ?? '');
    // The older Control Room client posts a grade without an action, or the assignment fields bare.
    if ($action === '' && !empty($b['submissionId'])) $action = 'grade';
    if ($action === '' ) $action = 'save';
    switch ($action) {
        case 'save':    $res = gs_call('staff.assignments.save', $base + ['data' => is_array($b['data'] ?? null) ? $b['data'] : $b, 'email' => !empty($b['notify'])]); break;
        case 'status':  $res = gs_call('staff.assignments.status', $base + ['action' => (string)($b['to'] ?? ''), 'ids' => (array)($b['ids'] ?? [])]); break;
        case 'remind':  $res = gs_call('staff.assignments.remind', $base + ['assignmentId' => (string)($b['assignmentId'] ?? ''), 'force' => !empty($b['force'])]); break;
        case 'grade':   $res = gs_call('staff.assignment.grade', $base + ['submissionId' => (string)($b['submissionId'] ?? ''), 'grade' => $b['grade'] ?? '', 'feedback' => (string)($b['feedback'] ?? ''), 'email' => !empty($b['email'])]); break;
        case 'return':  $res = gs_call('staff.assignment.return', $base + ['submissionId' => (string)($b['submissionId'] ?? ''), 'feedback' => (string)($b['feedback'] ?? ''), 'resubmitBy' => (string)($b['resubmitBy'] ?? '')]); break;
        case 'draft':   $res = gs_call('staff.assignments.draft', $base + ['unitId' => (string)($b['unitId'] ?? ''), 'ai' => !empty($b['ai'])]); break;
        case 'auto':    $res = gs_call('staff.assignments.auto', $base + ['on' => !empty($b['on'])]); break;
        case 'suggest': $res = gs_call('staff.assignment.suggest', $base + ['submissionId' => (string)($b['submissionId'] ?? '')]); break;
        default: json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_send(['ok' => false] + array_diff_key($res, ['ok' => 1]), 400);
unset($res['ok']); json_ok($res);
