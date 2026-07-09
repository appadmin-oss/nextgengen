<?php
/** Anchor Journal content (weeks, quotes, daily systems) — admin-managed. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$res = gs_call('public.anchorContent', [], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 500);
unset($res['ok']);
json_ok($res);
