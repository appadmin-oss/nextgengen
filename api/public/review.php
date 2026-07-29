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
rate_limit_check('selfreg.desk');
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$b = $method === 'POST' ? read_json_body() : [];
$reqGate = $method === 'GET' ? (string)($_GET['g'] ?? '') : (string)($b['gate'] ?? '');

/* Two ways in, exactly as the gate has: an admin session, or a kiosk session
 * unlocked with THIS gate's password. A kiosk session for a different gate is
 * not a session for this one. */
$isAdmin = is_admin_role($s['role'] ?? '');
$isKiosk = strtolower((string)($s['role'] ?? '')) === 'kiosk'
    && ($s['gate'] ?? '') !== '' && $reqGate !== '' && hash_equals((string)$s['gate'], $reqGate);
if (!$isAdmin && !$isKiosk) json_error('forbidden', 403);

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
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
unset($res['ok']); json_ok($res);
