<?php
/**
 * The review desk — /review?g=…
 *
 * Its own gate link and its own password, unlocked through the same kiosk
 * door as the check-in desk (gate-unlock.php) but bound to a review gate. The
 * separation is the point: a volunteer who can scan cards at the front table
 * should not also be able to wave strangers into the programme.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$b = $method === 'POST' ? read_json_body() : [];
$reqGate = $method === 'GET' ? (string)($_GET['g'] ?? '') : (string)($b['gate'] ?? '');
// Scoped to the gate: two review desks on one office connection are the normal
// case, and neither should be able to spend the other's allowance.
rate_limit_check('selfreg.desk', $reqGate);

/* Two ways in, exactly as the gate has: an admin session, or a kiosk session
 * unlocked with THIS gate's password. A kiosk session for a different gate is
 * not a session for this one. Literally the same decision as the gate's, so it
 * is now literally the same function — two copies of an authorisation check
 * drift, and the one that drifts is the one nobody is looking at. */
if (!gate_operator_ok($s, $reqGate)) json_error('forbidden', 403);

if ($method === 'GET') {
    $res = gs_call('selfreg.queue', [
        'gate' => $reqGate,
        'status' => (string)($_GET['status'] ?? 'self_pending'),
        'q' => (string)($_GET['q'] ?? ''),
        'centre' => (string)($_GET['centre'] ?? ''),
        'course' => (string)($_GET['course'] ?? ''),
        'photo' => (string)($_GET['photo'] ?? ''),
        'page' => (int)($_GET['page'] ?? 1),
        'per' => (int)($_GET['per'] ?? 25),
    ]);
} elseif ($method === 'POST') {
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'approve') {
        $res = gs_call('selfreg.approve', ['gate' => $reqGate, 'studentId' => $b['studentId'] ?? '', 'note' => $b['note'] ?? '', 'ip' => $ip]);
    } elseif ($action === 'approveBulk') {
        $res = gs_call('selfreg.approveBulk', ['gate' => $reqGate, 'studentIds' => $b['studentIds'] ?? [], 'ip' => $ip]);
    } elseif ($action === 'reject') {
        $res = gs_call('selfreg.reject', ['gate' => $reqGate, 'studentId' => $b['studentId'] ?? '', 'note' => $b['note'] ?? '', 'ip' => $ip]);
    } else { json_error('unknown_action', 400); }
} else {
    json_error('method_not_allowed', 405);
}
// Whole refusal, same reason as public/selfreg.php: an approve that fails
// per-record carries the detail in the payload, and reducing it to a bare code
// leaves the reviewer with "failed" and nothing to act on.
if (empty($res['ok'])) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
