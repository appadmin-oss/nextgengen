<?php
/**
 * Public: one NGG document (invoice, receipt, acknowledgement, Math Lab
 * certificate) as a printable A4 page, by its private token. The token is the
 * permission: it reaches the family by email or the Family Portal, never by a
 * guessable number (domain/documents.php).
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('membership.receipt');
$t = (string)($_GET['t'] ?? '');
/* ?as=pdf|png: a receipt drawn on the server (domain/receipt-draw.php), as a file to keep or share. */
$as = (string)($_GET['as'] ?? '');
if (in_array($as, ['pdf', 'png'], true) && preg_match('/^[a-f0-9]{32}$/', $t)) {
    $doc = doc_by('token', $t);
    if ($doc && $doc['kind'] === 'receipt') receipt_send($doc, $as);
    http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'This receipt link is not valid.'; exit;
}
[$code, $html] = preg_match('/^[a-f0-9]{32}$/', $t) ? doc_render_token($t) : [404, ''];
header('X-Robots-Tag: noindex');
header('Referrer-Policy: no-referrer');
header('Cache-Control: private, no-store');
header('Content-Type: text/html; charset=utf-8');
http_response_code($code);
echo $code === 200 ? $html : '<!doctype html><meta charset="utf-8"><title>Document not found</title><p style="font-family:sans-serif;padding:40px">This document link is not valid.</p>';
