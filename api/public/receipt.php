<?php
/**
 * Public: a paid invoice's receipt, by the private token in the family's
 * email. Kept for every link already sent; the page is the receipt document
 * (domain/documents.php), rendered from its frozen copy.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('membership.receipt');
$inv = function_exists('membership_invoice_by') ? membership_invoice_by('receiptToken', (string)($_GET['t'] ?? '')) : null;
$doc = $inv ? doc_for_receipt($inv) : null;
header('X-Robots-Tag: noindex');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');
header('Content-Type: text/html; charset=utf-8');
if (!$doc) {
    http_response_code(404);
    echo '<!doctype html><meta charset="utf-8"><title>Receipt not found</title><p style="font-family:sans-serif;padding:40px">This receipt link is not valid.</p>';
    exit;
}
echo doc_render_receipt($doc);
