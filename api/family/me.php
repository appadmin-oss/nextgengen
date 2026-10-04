<?php
/** The signed-in family account (or null), and a fresh CSRF cookie — the family page's bootstrap. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$csrf = csrf_issue();
if (!family_session_read()) json_ok(['guardian' => null, 'csrf' => $csrf]);
$f = require_family();
$res = gs_call('family.me', ['guardianId' => $f['gid']]);
if (empty($res['ok'])) json_ok(['guardian' => null, 'csrf' => $csrf]);
unset($res['ok']);
json_ok($res + ['csrf' => $csrf]);
