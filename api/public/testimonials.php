<?php
/** Public: what members said about their own sessions, published only.
 *  Cached; purged by the `testimonials` topic whenever one is published,
 *  withdrawn, or a member's visibility consent changes. */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$res = gs_call('public.testimonials', [], true);
if (empty($res['ok'])) json_error($res['error'] ?? 'not_found', 400);
unset($res['ok']);
json_ok($res);
