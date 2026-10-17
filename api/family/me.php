<?php
/** The signed-in family account (or null), and a fresh CSRF cookie — the family page's bootstrap. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$csrf = csrf_issue();
if (!family_session_read()) json_ok(['guardian' => null, 'csrf' => $csrf]);
// A guardian still owing their PIN is told so, not refused: the page asks for it.
session_allow_mfa_pending();
$f = require_family();
if ($f['mfaP'] !== '') json_ok(['guardian' => null, 'mfaPending' => $f['mfaP'], 'csrf' => $csrf]);
$res = gs_call('family.me', ['guardianId' => $f['gid']]);
if (empty($res['ok'])) json_ok(['guardian' => null, 'csrf' => $csrf]);
unset($res['ok']);
json_ok($res + ['csrf' => $csrf]);
