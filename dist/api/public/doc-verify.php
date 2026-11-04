<?php
/**
 * Public: /verify/<number>?c=<check code> — is this NGG document real, and
 * does it still stand? The QR on every document opens this page with both.
 *
 * A number is sequential, so it alone shows nothing: without the matching
 * check code the page says only that the two do not match, the same answer
 * for a number that does not exist. With it, the page names the document,
 * the holder by first name and initial, and whether it is current,
 * superseded or cancelled (domain/documents.php).
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('doc.verify');
$no = strtoupper(trim((string)($_GET['no'] ?? '')));
$code = trim((string)($_GET['c'] ?? ''));
$r = $no !== '' ? gs_call('public.document.verify', ['no' => $no, 'code' => $code]) : ['ok' => false, 'error' => 'empty'];
header('X-Robots-Tag: noindex');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
header('Content-Type: text/html; charset=utf-8');

$e = static fn($s) => htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$kind = ['invoice' => 'Invoice', 'receipt' => 'Receipt', 'certificate' => 'Math Lab certificate'][$r['kind'] ?? ''] ?? 'Document';
if (!empty($r['ok'])) {
    $st = (string)$r['status'];
    [$cls, $head] = $st === 'superseded' ? ['warn', 'Genuine, but replaced'] : ($st === 'void' ? ['bad', 'Genuine, but cancelled'] : ['ok', 'Genuine and current']);
    if (($r['kind'] ?? '') === 'invoice' && ($r['state'] ?? '') === 'void') [$cls, $head] = ['bad', 'Genuine, but cancelled'];
    $rows = [['Document', $kind], ['Number', $r['no']], ['Issued', doc_local((string)$r['issuedAt'], 'j F Y')], ['For', $r['holder'] ?? ''], ['What', $r['what'] ?? '']];
    if (isset($r['result'])) $rows[] = ['Result', $r['result']];
    if (isset($r['amount'])) $rows[] = ['Amount', doc_naira((int)$r['amount'])];
    if (($r['kind'] ?? '') === 'invoice') $rows[] = ['Status', ['due' => 'Awaiting payment', 'overdue' => 'Overdue', 'paid' => 'Paid', 'void' => 'Cancelled'][$r['state'] ?? ''] ?? ''];
    if ($st === 'superseded' && $r['supersededBy'] !== '') $rows[] = ['Replaced by', $r['supersededBy']];
    $main = '<p class="st ' . $cls . '">' . $e($head) . '</p><dl>' . implode('', array_map(static fn($x) => $x[1] !== '' ? '<dt>' . $e($x[0]) . '</dt><dd>' . $e($x[1]) . '</dd>' : '', $rows)) . '</dl>';
} else {
    $main = ($no !== '' ? '<p class="st bad">That number and check code do not match an NGG document.</p><p>Type both exactly as printed. The check code is under the QR code.</p>' : '<p>Type the document number and the check code printed on it.</p>')
        . '<form method="get" action="/api/public/doc-verify.php"><label>Document number<input name="no" value="' . $e($no) . '" placeholder="NGG-RCP-2026-00001" autocomplete="off" required></label>'
        . '<label>Check code<input name="c" value="' . $e($code) . '" placeholder="XXXX-XXXX-XXXX" autocomplete="off" required></label><button type="submit">Check</button></form>';
}
echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
    . '<title>Verify a document · Next Generation Genius</title><link rel="stylesheet" href="/assets/fonts/fonts.css"><style>'
    . 'body{margin:0;background:#e9ebf1;font:16px/1.5 "Geist",system-ui,sans-serif;color:#0e1630}main{max-width:560px;margin:0 auto;padding:40px 16px}'
    . '.card{background:#fff;border-radius:16px;padding:28px;box-shadow:0 30px 80px -40px rgba(14,22,48,.35)}.brand{display:flex;gap:12px;align-items:center;margin-bottom:20px}.brand img{width:44px;height:44px}'
    . 'h1{font:800 26px/1.15 "Bricolage Grotesque",sans-serif;letter-spacing:-.02em;margin:0}.st{font-weight:600;padding:12px 14px;border-radius:10px;margin:18px 0}.ok{background:#c8f0d6;color:#0f5a2f}.warn{background:#fdf6e3;color:#6b4700}.bad{background:#ffd6d0;color:#8a1c10}'
    . 'dl{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;margin:0}dt{color:#6a7190}dd{margin:0;font-weight:500;overflow-wrap:anywhere}'
    . 'form{display:grid;gap:14px;margin-top:16px}label{display:grid;gap:6px;font-size:14px;color:#4a5272}input{font:500 16px "Geist Mono",monospace;padding:12px;border:1px solid #c9cfe2;border-radius:10px;min-height:44px;box-sizing:border-box;text-transform:uppercase}'
    . 'button{font:600 15px "Geist",sans-serif;min-height:44px;border:0;border-radius:999px;background:#1f3263;color:#fff;cursor:pointer}'
    . '</style></head><body><main><div class="card"><div class="brand"><img src="/assets/logo.png" alt=""><h1>Verify an NGG document</h1></div>' . $main . '</div></main></body></html>';
