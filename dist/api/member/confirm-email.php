<?php
/** Confirm a member's new email via the signed link (from the new inbox). */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('member.email.confirm', ['memberId' => (string)($_GET['m'] ?? ''), 'token' => (string)($_GET['t'] ?? ''), 'ip' => client_ip()]);
$ok = !empty($res['ok']);
header('Content-Type: text/html; charset=utf-8');
$origin = htmlspecialchars(rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/'), ENT_QUOTES);
$msg = $ok ? 'Your email has been updated. Use it to sign in from now on.' : 'That confirmation link is invalid or has expired.';
echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirm email · NGG</title>'
    . '<style>body{font-family:Arial,Helvetica,sans-serif;background:#eef1f5;margin:0;padding:60px 20px;color:#333A4D}'
    . '.card{max-width:440px;margin:0 auto;background:#fff;border:1px solid #e6e8ee;border-radius:16px;padding:32px;text-align:center}'
    . 'h1{color:#00225F;font-size:20px;margin:16px 0 10px}a{color:#00225F}</style></head><body>'
    . '<div class="card"><div style="font-size:11px;letter-spacing:2.5px;color:#00225F;font-weight:700;text-transform:uppercase">Next Generation Genius</div>'
    . '<h1>' . ($ok ? 'Email confirmed' : 'Hmm') . '</h1><p>' . htmlspecialchars($msg, ENT_QUOTES) . '</p>'
    . ($origin ? '<p><a href="' . $origin . '/login">Sign in →</a></p>' : '') . '</div></body></html>';
