<?php
/**
 * The public self-registration link — the page lives at /apply?g=…
 *
 * Deliberately unauthenticated: it is a link a family opens on their own
 * phone, and any session requirement would defeat the point. What stands in
 * for authentication is that a submission is NOT a registration. It lands as
 * `self_pending`, nothing is emailed to anybody, and a human at the review
 * desk has to look at it first.
 *
 * Rate-limited on its own buckets rather than the gate's, so families filling
 * in the form cannot lock out the check-in desk they are queueing for.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    rate_limit_check('selfreg.read');
    $res = gs_call('selfreg.context', ['gate' => (string)($_GET['g'] ?? '')]);
} elseif ($method === 'POST') {
    // Tighter than the read: one submission is a few minutes of typing, and
    // the only reason to send many is to fill the review queue.
    rate_limit_check('selfreg.submit');
    $b = read_json_body();
    $res = gs_call('selfreg.submit', [
        'gate'  => $b['gate'] ?? '',
        'data'  => $b['data'] ?? [],
        'photo' => $b['photo'] ?? '',
        'lat'   => $b['lat'] ?? null,
        'lng'   => $b['lng'] ?? null,
        'ip'    => client_ip(),
    ]);
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) {
    // The photo verdict travels with the refusal: "try another photo" without
    // saying what was wrong with this one is how a family gives up.
    if (($res['error'] ?? '') === 'photo_rejected') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'photo_rejected', 'photo' => $res['photo'] ?? []], JSON_UNESCAPED_SLASHES);
        exit;
    }
    json_error($res['error'] ?? 'failed', 400);
}
unset($res['ok']); json_ok($res);
