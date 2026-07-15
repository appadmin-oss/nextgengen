<?php
/** One-click newsletter unsubscribe (linked from email footers). Renders a
 *  tiny HTML confirmation — no SPA needed, works from any mail client. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.newsletter.unsubscribe', [
    'email' => (string)($_GET['e'] ?? ''),
    'token' => (string)($_GET['t'] ?? ''),
    'ip'    => client_ip(),
]);
$ok = !empty($res['ok']);
header('Content-Type: text/html; charset=utf-8');
$origin = htmlspecialchars(rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/'), ENT_QUOTES);
$msg = $ok ? "You've been unsubscribed. You won't receive further newsletters." : "We couldn't process that unsubscribe link.";
echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe · NGG</title>'
    . '<style>body{font-family:Arial,Helvetica,sans-serif;background:#eef1f5;margin:0;padding:60px 20px;color:#333A4D}'
    . '.card{max-width:440px;margin:0 auto;background:#fff;border:1px solid #e6e8ee;border-radius:16px;padding:32px;text-align:center}'
    . 'h1{color:#00225F;font-size:20px;margin:0 0 10px}a{color:#00225F}</style></head><body>'
    . '<div class="card"><div style="font-size:11px;letter-spacing:2.5px;color:#00225F;font-weight:700;text-transform:uppercase">Next Generation Genius</div>'
    . '<h1 style="margin-top:16px">' . ($ok ? 'Unsubscribed' : 'Hmm') . '</h1>'
    . '<p>' . htmlspecialchars($msg, ENT_QUOTES) . '</p>'
    . ($origin ? '<p><a href="' . $origin . '">Back to the site →</a></p>' : '')
    . '</div></body></html>';
