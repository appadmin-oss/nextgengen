<?php
/** Paystack webhook: verifies the signature, then confirms a donation or a joining invoice by asking Paystack. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$raw = file_get_contents('php://input') ?: '';
$secret = trim((string)($GLOBALS['CONFIG']['paystack']['secret'] ?? ''));
$sig = (string)($_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '');
if ($secret === '' || $sig === '' || !hash_equals(hash_hmac('sha512', $raw, $secret), $sig)) { http_response_code(401); echo 'bad_signature'; exit; }
$evt = json_decode($raw, true);
$ref = (string)($evt['data']['reference'] ?? '');
// A membership payment is settled from Paystack's own verify answer, never from this body.
if (($evt['event'] ?? '') === 'charge.success' && $ref !== '') {
    if (strncmp($ref, 'NGGM-', 5) === 0) membership_paystack_verify($ref); else donation_verify($ref);
}
http_response_code(200); echo 'ok';
