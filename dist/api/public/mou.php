<?php
/**
 * Public: the Membership Agreement by its private link (domain/mou.php).
 *   GET  ?token=…   the agreement to read, its questions, the details to confirm
 *   GET  ?doc=…     the signed copy, as a printable page ("Print or save as PDF")
 *   POST {token, answers, family, member, trips, clientName, clientRel, clientSignature, agree, witness?}
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('mou');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET' && isset($_GET['doc'])) {
    $res = gs_call('public.mou.doc', ['doc' => (string)$_GET['doc']]);
    if (empty($res['ok'])) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'This copy is not available. Ask NGG for a new link: next@afrovanguard.org.ng'; exit; }
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: private, no-store');
    header('X-Robots-Tag: noindex');
    echo $res['html'];
    exit;
}
if ($method === 'GET') {
    $res = gs_call('public.mou.get', ['token' => (string)($_GET['token'] ?? '')]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $keep = ['token', 'answers', 'attempts', 'family', 'member', 'trips', 'clientName', 'clientRel', 'clientSignature', 'agree', 'witness'];
    $res = gs_call('public.mou.sign', array_intersect_key($b, array_flip($keep)) + ['ip' => client_ip()]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    http_response_code(in_array($res['error'] ?? '', ['not_found', 'expired'], true) ? 404 : 400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
unset($res['ok']);
json_ok($res);
