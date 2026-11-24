<?php
/**
 * Public: a family answers a centre offered to their child (domain/admin2.php,
 * "A nearer centre, offered").
 *   GET  ?t=…                    the offer, with its two buttons. Following the
 *                                link answers nothing, so a mail scanner cannot.
 *   POST t=…&answer=yes|wait     the answer, once. CSRF-exempt: the emailed token
 *                                is the proof (api/_lib/csrf.php).
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
rate_limit_check('centre_offer');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$t = (string)($_POST['t'] ?? $_GET['t'] ?? '');
$answered = null;
if ($method === 'POST') {
    $answered = gs_call('public.centre_offer.answer', ['t' => $t, 'answer' => (string)($_POST['answer'] ?? ''), 'ip' => client_ip()]);
} elseif ($method !== 'GET') {
    json_error('method_not_allowed', 405);
}
$page = gs_call('public.centre_offer.page', ['t' => $t, 'answered' => $answered]);
http_response_code((int)($page['http'] ?? 200));
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Robots-Tag: noindex');
header('Referrer-Policy: no-referrer');
echo (string)($page['html'] ?? '');
