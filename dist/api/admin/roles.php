<?php
/** Admin: the staff role registry (ADMIN_ROLES) and what each capability means — read by any staff. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
require_method('GET');
$res = gs_call('admin.roles', ['requesterId' => $s['mid']]);
if (empty($res['ok'])) json_send($res + ['ok' => false], ($res['error'] ?? '') === 'forbidden' ? 403 : 400);
unset($res['ok']); json_ok($res);
