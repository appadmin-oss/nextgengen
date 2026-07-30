<?php
/**
 * Guardian photo re-shoot — no-account page reached by the emailed link when an
 * editor asks for a retake. GET returns the child's name + the reason; POST
 * ingests a freshly captured headshot as a new version and reruns the pipeline.
 * The page lives at /reshoot?t=<token>.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('gate');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('reshoot.context', ['t' => (string)($_GET['t'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $res = gs_call('reshoot.submit', ['t' => (string)($b['t'] ?? ''), 'photoUrl' => (string)($b['photoUrl'] ?? ''),
        'submissionId' => (string)($b['submissionId'] ?? ''), 'ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'link_invalid' ? 404 : 400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
