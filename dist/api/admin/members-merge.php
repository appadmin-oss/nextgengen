<?php
/**
 * Admin: two records, one person.
 *
 * The preview is the default. A merge is irreversible, so the call without
 * `confirm` reports exactly what would move, what would be discarded and
 * what would block it — and the UI sends the same call again with confirm
 * once somebody has read it.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') json_error('method_not_allowed', 405);

$body = read_json_body();
$res = gs_call('admin.members.merge', [
    'requesterId' => $s['mid'],
    'keepId' => $body['keepId'] ?? '',
    'mergeId' => $body['mergeId'] ?? '',
    'confirm' => !empty($body['confirm']),
    'ip' => client_ip(),
]);
/* A blocked merge carries the preview that explains WHY, so the error path
   has to pass the body through rather than reduce it to a code. */
if (empty($res['ok'])) {
    /* json_send rather than json_error: a refusal here carries more than a
       code. A blocked merge returns the preview that says WHICH ledger
       periods clash, and a partial bulk returns which ids were skipped and
       why. Flattening either to a string is what makes somebody open the
       database to find out. */
    json_send($res + ['ok' => false], 400);
}
unset($res['ok']); json_ok($res);
