<?php
/** Paystack webhook: verifies signature, confirms the donation. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$raw = file_get_contents('php://input') ?: '';
$secret = trim((string)($GLOBALS['CONFIG']['paystack']['secret'] ?? ''));
$sig = (string)($_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '');
if ($secret === '' || $sig === '' || !hash_equals(hash_hmac('sha512', $raw, $secret), $sig)) { http_response_code(401); echo 'bad_signature'; exit; }
$evt = json_decode($raw, true);
$ref = (string)($evt['data']['reference'] ?? '');
if (($evt['event'] ?? '') === 'charge.success' && $ref !== '') donation_verify($ref);
http_response_code(200); echo 'ok';
