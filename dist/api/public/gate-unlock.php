<?php
/**
 * Gate kiosk unlock — the no-account door for field staff.
 *
 * A gate can carry an optional password (set by an admin). Posting the gate
 * token + password here verifies it and mints a short-lived, gate-scoped KIOSK
 * session cookie (see session_issue_kiosk). That session can operate ONLY this
 * gate's desk — register walk-ups and upload headshots — and never reaches the
 * admin console. Revoking the gate link kills it immediately.
 *
 * Request (POST JSON): { "gate": "GL-…", "password": "…" }
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');
rate_limit_check('gate.unlock'); // brute-force throttle

$b = read_json_body();
$res = gs_call('gate.unlock', [
    'gate'     => (string)($b['gate'] ?? ''),
    'password' => (string)($b['password'] ?? ''),
    'ip'       => client_ip(),
]);

if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'bad_password' ? 401 : 400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}

// Verified — hand the operator a gate-scoped kiosk session.
session_issue_kiosk($res['gate']);
json_ok(['gate' => ['gateId' => $res['gate']['gateId'], 'name' => $res['gate']['name']]]);
