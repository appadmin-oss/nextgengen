<?php
/**
 * Admin: printed member IDs that do not mean one person.
 *
 *   GET  → { shared: [...], twoIds: [...] }
 *
 * `shared` is one ID on two or more records (claimedBy names the record the
 * database gave it to); `twoIds` is one person, by name and date of birth,
 * holding two. Both are resolved on the Duplicates tab, usually by a merge.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.members.idDuplicates', ['requesterId' => $s['mid']]);
if (empty($res['ok'])) json_error((string)($res['error'] ?? 'failed'), 400, isset($res['detail']) ? (string)$res['detail'] : null);
unset($res['ok']);
json_ok($res);
