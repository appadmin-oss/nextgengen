<?php
/** Club portal v3 — one route, the ops in domain/club-portal.php. A route does no work. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') json_error('method_not_allowed', 405);
$b = read_json_body();
$b = is_array($b) ? $b : [];
$ops = ['boot', 'dashboard', 'section', 'decide', 'create', 'checkins', 'checkin', 'consents', 'consent.set', 'consent.link',
        'ann.list', 'ann.reach', 'ann.save', 'ann.shorten', 'brief', 'brief.send', 'search', 'directory', 'register', 'message', 'dir.bulk', 'dir.save'];
$op = (string)($b['op'] ?? '');
if (!in_array($op, $ops, true)) json_error('unknown_action', 400);
unset($b['op']);
$res = gs_call('admin.clubp.' . $op, array_merge($b, ['requesterId' => $s['mid'], 'ip' => client_ip()]));
// The plain-English refusal travels as `detail`, which the client shows.
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, (string)($res['message'] ?? $res['detail'] ?? '') ?: null);
unset($res['ok']); json_ok($res);
