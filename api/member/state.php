<?php
/**
 * Per-member key→JSON state (Anchor Journal: daily systems, self-score, peers).
 *   GET  ?keys=systems:2026-07-04,peers   → { state: { key: value, … } }
 *   POST { key, value }                    → upsert
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('member.state.get', ['memberId' => $s['mid'], 'keys' => $_GET['keys'] ?? '']);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

if ($method === 'POST') {
    $body = read_json_body();
    $res = gs_call('member.state.set', ['memberId' => $s['mid'], 'key' => $body['key'] ?? '', 'value' => $body['value'] ?? null]);
    if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400);
    unset($res['ok']);
    json_ok($res);
}

json_error('method_not_allowed', 405);
