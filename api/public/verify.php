<?php
/**
 * Parent verification — the no-account page a parent reaches from the
 * SMS/email link. The verify token IS the authentication (pre-session →
 * CSRF-exempt, rate-limited). GET ?t=… for context; POST to consent.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('auth.request');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $t = (string)($_GET['t'] ?? '');
    if (!preg_match('/^VR[a-f0-9]{16,64}$/i', $t)) json_error('link_invalid', 400);
    $res = gs_call('parent.verify.context', ['t' => $t]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $t = (string)($b['t'] ?? '');
    if (!preg_match('/^VR[a-f0-9]{16,64}$/i', $t)) json_error('link_invalid', 400);
    $res = gs_call('parent.verify.submit', [
        't' => $t,
        'consents' => is_array($b['consents'] ?? null) ? $b['consents'] : [],
        'actorName' => (string)($b['actorName'] ?? ''),
        'feedback' => (string)($b['feedback'] ?? ''),
    ]);
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
