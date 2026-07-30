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
    rate_limit_check('selfreg.read', (string)($_GET['g'] ?? ''));
    $res = gs_call('selfreg.context', ['gate' => (string)($_GET['g'] ?? '')]);
} elseif ($method === 'POST') {
    // Tighter than the read: one submission is a few minutes of typing, and
    // the only reason to send many is to fill the review queue. Scoped to the
    // gate so one busy centre cannot ration every other centre's link.
    $b = read_json_body();
    rate_limit_check('selfreg.submit', (string)($b['gate'] ?? ''));
    $res = gs_call('selfreg.submit', [
        'gate'  => $b['gate'] ?? '',
        'data'  => $b['data'] ?? [],
        'photo' => $b['photo'] ?? '',
        'lat'   => $b['lat'] ?? null,
        'lng'   => $b['lng'] ?? null,
        'ip'    => client_ip(),
        // Retry key: minted once when the form opened, carried on every attempt,
        // so a re-send after a timeout replays rather than re-registers.
        'submissionId' => $b['submissionId'] ?? '',
    ]);
} else {
    json_error('method_not_allowed', 405);
}
/* Forward the WHOLE refusal, not just its code.
 *
 * A field-level rejection from gate_register arrives as ['ok' => false,
 * 'errors' => [field => message]] — with no 'error' key at all. Keeping only
 * $res['error'] therefore sent the family `{"error":"failed"}`: the per-field
 * map was dropped, the form had nothing to highlight, and "failed" matches no
 * case in its handler, so it fell through to "check your connection" — for a
 * request that arrived perfectly and was refused for a nameable, fixable
 * reason. The public sign-up form could not be submitted at all, and said the
 * one thing guaranteed to make a family retry instead of correct the answer.
 *
 * The photo verdict rides along the same way (it used to need its own branch),
 * as does the duplicate hint. This is what the staff desk (public/gate.php)
 * and the guardian reshoot have always done; the public form was the odd one.
 */
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'rate_limited' ? 429 : 400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false] + array_diff_key($res, ['ok' => 1]), JSON_UNESCAPED_SLASHES);
    exit;
}
unset($res['ok']); json_ok($res);
