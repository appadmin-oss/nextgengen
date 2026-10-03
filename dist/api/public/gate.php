<?php
/**
 * The gate — registration desk + attendance check-in behind a shareable,
 * revocable gate link. Two controls, both required: a valid gate token
 * (scopes/revokes the LINK) and a signed-in staff session (authenticates
 * the HUMAN). The page itself lives at /gate?g=…
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('gate');
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$b = $method === 'POST' ? read_json_body() : [];

// Two ways to operate a gate: a signed-in staff/admin session, OR a gate-scoped
// kiosk session (password-unlocked) bound to exactly THIS gate token.
$reqGate = $method === 'GET' ? (string)($_GET['g'] ?? '') : (string)($b['gate'] ?? '');
$isAdmin = is_admin_role($s['role'] ?? '');
/* The refusal below is recoverable and the desk page treats it that way: a
 * `forbidden` here means "unlock this desk", not "this link is broken". A
 * parent, mentor, volunteer or student signed in on a shared desk phone lands
 * on it, and the desk password is their way through. */
if (!gate_operator_ok($s, $reqGate)) json_error('forbidden', 403);

if ($method === 'GET') {
    $res = gs_call('gate.context', ['gate' => (string)($_GET['g'] ?? '')]);
} elseif ($method === 'POST') {
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'register') {
        $res = gs_call('gate.register', [
            'gate' => $b['gate'] ?? '', 'data' => $b['data'] ?? [], 'photoUrl' => $b['photoUrl'] ?? '',
            'force' => !empty($b['force']), 'byId' => $s['mid'], 'ip' => $ip,
            // Retry key: a desk that re-sends after a timeout replays the
            // original result instead of registering the child twice.
            'submissionId' => $b['submissionId'] ?? '',
            // Geo capture from the device; only a full admin may override.
            'lat' => $b['lat'] ?? null, 'lng' => $b['lng'] ?? null,
            'isAdmin' => $isAdmin, 'geoOverride' => $isAdmin && !empty($b['geoOverride']),
        ]);
    } elseif ($action === 'checkin') {
        // Reuse the summer check-in op (QR token or explicit studentId).
        if (!gate_resolve((string)($b['gate'] ?? ''))) json_error('gate_invalid', 403);
        // The gate token + session (admin or gate-bound kiosk) are already
        // verified above, so authorize the check-in by the gate rather than by
        // a staff capability (a desk-password kiosk has no member/cap).
        $res = gs_call('admin.summer.checkin', ['gateAuthorized' => true, 'byId' => ($s['mid'] ?: ('gate:' . substr((string)($b['gate'] ?? ''), 0, 24))), 'token' => $b['token'] ?? '', 'scannedAt' => $b['scannedAt'] ?? null, 'method' => 'gate', 'device' => 'gate:' . substr((string)($b['gate'] ?? ''), 0, 12), 'ip' => $ip]);
        /* A member's check-in emits its own event in the domain (checkin.php). */
        if (!empty($res['ok']) && empty($res['already']) && (($res['student']['kind'] ?? '') !== 'member')) {
            event_emit('attendance.marked', ['memberId' => $res['student']['studentId'] ?? '', 'name' => $res['student']['fullName'] ?? '', 'date' => attendance_today(), 'source' => 'gate', 'by' => $s['mid']]);
        }
    } elseif ($action === 'checkout') {
        if (!gate_resolve((string)($b['gate'] ?? ''))) json_error('gate_invalid', 403);
        $res = gs_call('admin.summer.checkout', ['gateAuthorized' => true, 'byId' => ($s['mid'] ?: ('gate:' . substr((string)($b['gate'] ?? ''), 0, 24))), 'token' => $b['token'] ?? '', 'ip' => $ip]);
    } elseif ($action === 'duty_close') {
        // Close today's roll for this gate's centre — credits the on-duty
        // volunteer (points/level/awards) and returns the value-driven response.
        if (!gate_resolve((string)($b['gate'] ?? ''))) json_error('gate_invalid', 403);
        $ctx = gs_call('gate.context', ['gate' => (string)($b['gate'] ?? '')]);
        $centre = (string)($ctx['centre'] ?? '');
        $volId = (string)(($ctx['duty']['volunteerId'] ?? '') ?: '');
        if ($centre === '' || $volId === '') json_error('no_duty', 400);
        $res = gs_call('attendance.duty.complete', ['gateAuthorized' => true, 'date' => attendance_today(), 'centre' => $centre, 'volunteerId' => $volId, 'ip' => $ip]);
    } else {
        json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
