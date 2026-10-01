<?php
/**
 * Admin: one action across a reviewed selection of members.
 *
 * POST only, and it takes an explicit list of memberIds — never a filter
 * for the server to re-expand. The roster somebody reviewed and the rows a
 * filter would select are two different things the moment anybody else
 * saves a record.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') json_error('method_not_allowed', 405);

$body = read_json_body();
$res = gs_call('admin.members.bulk', [
    'requesterId' => $s['mid'],
    'memberIds' => $body['memberIds'] ?? [],
    'action' => $body['action'] ?? '',
    'value' => $body['value'] ?? null,
    'ip' => client_ip(),
]);
if (empty($res['ok'])) {
    /* json_send rather than json_error: a refusal here carries more than a
       code. A blocked merge returns the preview that says WHICH ledger
       periods clash, and a partial bulk returns which ids were skipped and
       why. Flattening either to a string is what makes somebody open the
       database to find out. */
    json_send($res + ['ok' => false], 400);
}
unset($res['ok']); json_ok($res);
