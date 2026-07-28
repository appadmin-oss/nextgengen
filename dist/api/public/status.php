<?php
/** Public status board — PII-free programme aggregates for /status.
 *
 * Memoised HERE rather than in the domain layer, because polling is an HTTP
 * concern: a screen at every centre refreshes this, so at a hundred centres
 * the same figures get recomputed a hundred times a minute from the same rows.
 * Internal callers and the admin console still read the domain function
 * directly and always see the truth as it is now.
 *
 * Stamped with the consent ledger's high-water mark. `consents` is append-only,
 * so a grant OR a withdrawal always moves MAX(id), and any change to who may be
 * named or pictured invalidates the memo on the very next request. A cache that
 * held a withdrawn child's name and face on a public page for twenty seconds
 * would not be worth the CPU it saved; everything else here — counts, trends,
 * activities — can lag that much without harm.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$stamp = 'c' . (string)(db_row("SELECT COALESCE(MAX(id),0) v FROM consents")['v'] ?? '0');
$res = cache_remember('public_status', 20, fn() => gs_call('public.status', [], true), $stamp);
if (empty($res['ok'])) json_error($res['error'] ?? 'unavailable', 503);
unset($res['ok']);
json_ok($res);
