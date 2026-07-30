<?php
/**
 * A shared Programme Journal entry — /journal-entry?t=…
 *
 * Resolution is checked against the entry's CURRENT visibility, not the
 * visibility it had when the link was minted. That is the whole contract:
 * narrowing an entry back to staff or community revokes every link already
 * handed out, exactly as revoking a gate link closes that door. A share link is
 * a credential, and a credential you cannot withdraw is not one.
 *
 * Rate-limited on its own bucket: the token is the only thing standing between
 * a guess and a programme record, so brute-forcing it should be expensive.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
rate_limit_check('journal.shared');
$res = gs_call('journal.shared', ['t' => (string)($_GET['t'] ?? '')]);
if (empty($res['ok'])) {
    // 'not_shared' and 'not_found' are answered identically on purpose: telling
    // a stranger that a token is real but no longer published confirms the entry
    // exists, which is precisely what narrowing the visibility withdrew.
    json_error('not_found', 404);
}
unset($res['ok']);
json_ok($res);
