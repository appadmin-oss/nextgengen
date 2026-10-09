<?php
/** Public: the stored framing for photographs a page shows (domain/photo-framing.php). A read — it never asks the model. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('photo.framing');
$u = json_decode((string)($_GET['u'] ?? '[]'), true);
$res = gs_call('public.photos.framing', ['urls' => is_array($u) ? $u : []]);
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), 400);
unset($res['ok']); json_ok($res);
