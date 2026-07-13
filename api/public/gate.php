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
$isKiosk = strtolower((string)($s['role'] ?? '')) === 'kiosk'
    && ($s['gate'] ?? '') !== '' && $reqGate !== '' && hash_equals((string)$s['gate'], $reqGate);
if (!$isAdmin && !$isKiosk) json_error('forbidden', 403);

if ($method === 'GET') {
    $res = gs_call('gate.context', ['gate' => (string)($_GET['g'] ?? '')]);
} elseif ($method === 'POST') {
    $action = (string)($b['action'] ?? '');
    $ip = client_ip();
    if ($action === 'register') {
        $res = gs_call('gate.register', [
            'gate' => $b['gate'] ?? '', 'data' => $b['data'] ?? [], 'photoUrl' => $b['photoUrl'] ?? '',
            'force' => !empty($b['force']), 'byId' => $s['mid'], 'ip' => $ip,
            // Geo capture from the device; only a full admin may override.
            'lat' => $b['lat'] ?? null, 'lng' => $b['lng'] ?? null,
            'isAdmin' => $isAdmin, 'geoOverride' => $isAdmin && !empty($b['geoOverride']),
        ]);
    } elseif ($action === 'checkin') {
        // Reuse the summer check-in op (QR token or explicit studentId).
        if (!gate_resolve((string)($b['gate'] ?? ''))) json_error('gate_invalid', 403);
        $res = gs_call('admin.summer.checkin', ['requesterId' => $s['mid'], 'token' => $b['token'] ?? '', 'method' => 'gate', 'device' => 'gate:' . substr((string)($b['gate'] ?? ''), 0, 12), 'ip' => $ip]);
        if (!empty($res['ok']) && empty($res['already'])) {
            event_emit('attendance.marked', ['memberId' => $res['student']['studentId'] ?? '', 'name' => $res['student']['fullName'] ?? '', 'date' => gmdate('Y-m-d'), 'source' => 'gate', 'by' => $s['mid']]);
        }
    } elseif ($action === 'duty_close') {
        // Close today's roll for this gate's centre — credits the on-duty
        // volunteer (points/level/awards) and returns the value-driven response.
        if (!gate_resolve((string)($b['gate'] ?? ''))) json_error('gate_invalid', 403);
        $ctx = gs_call('gate.context', ['gate' => (string)($b['gate'] ?? '')]);
        $centre = (string)($ctx['centre'] ?? '');
        $volId = (string)(($ctx['duty']['volunteerId'] ?? '') ?: '');
        if ($centre === '' || $volId === '') json_error('no_duty', 400);
        $res = gs_call('attendance.duty.complete', ['date' => gmdate('Y-m-d'), 'centre' => $centre, 'volunteerId' => $volId, 'ip' => $ip]);
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
