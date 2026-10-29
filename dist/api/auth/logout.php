<?php
/* Sign out. POST only, so it passes the CSRF check: a GET sign-out could be
   fired by any <img src> on any page (a hand-in image, a forum post) and sign
   the viewer out without them doing anything. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('POST');

$s = session_read();
if ($s) gs_call('auth.logout', ['memberId' => $s['mid'] ?? '', 'sid' => (string)($s['sid'] ?? ''), 'ip' => client_ip()]);
session_clear();
json_ok([]);
