<?php
/** Public: a paid joining invoice's receipt, as a printable page, by its private token. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('membership.receipt');
$inv = function_exists('membership_invoice_by') ? membership_invoice_by('receiptToken', (string)($_GET['t'] ?? '')) : null;
header('X-Robots-Tag: noindex');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');
if (!$inv || (string)$inv['status'] !== 'paid') {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><title>Receipt not found</title><p style="font-family:sans-serif;padding:40px">This receipt link is not valid.</p>';
    exit;
}
header('Content-Type: text/html; charset=utf-8');
echo membership_receipt_html($inv);
