<?php
/** Paystack redirects here after payment — verify + show a thank-you page. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');  // Paystack redirects here via GET
rate_limit_check('default');  // stop reference enumeration / repeat verify calls
$ref = (string)($_GET['reference'] ?? $_GET['trxref'] ?? '');
$r = $ref !== '' ? donation_verify($ref) : ['status' => ''];
$paid = ($r['status'] ?? '') === 'paid';
header('Content-Type: text/html; charset=utf-8');
$origin = htmlspecialchars(rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/'), ENT_QUOTES);
echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thank you · NGG</title>'
  . '<style>body{font-family:Arial,Helvetica,sans-serif;background:#eef1f5;margin:0;padding:60px 20px;color:#333A4D}.card{max-width:440px;margin:0 auto;background:#fff;border:1px solid #e6e8ee;border-radius:16px;padding:32px;text-align:center}h1{color:#00225F}a{color:#00225F}</style></head><body>'
  . '<div class="card"><div style="font-size:11px;letter-spacing:2.5px;color:#00225F;font-weight:700;text-transform:uppercase">Next Generation Genius</div>'
  . '<h1>' . ($paid ? 'Thank you!' : 'Payment received') . '</h1>'
  . '<p>' . ($paid ? 'Your donation is confirmed — thank you for backing the next generation.' : 'We\'re confirming your payment. If it succeeded, it\'ll reflect shortly.') . '</p>'
  . ($origin ? '<p><a href="' . $origin . '">Back to the site →</a></p>' : '') . '</div></body></html>';
