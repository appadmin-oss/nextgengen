<?php
/** Admin: quote of the week — sayings, rotation order and voice-overs.
 *  Gated on `content` (published copy). See _lib/domain/wisdom.php. */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $res = gs_call('admin.wisdom.list', ['requesterId' => $s['mid']]);
} elseif ($method === 'POST') {
    $b = read_json_body();
    $base = ['requesterId' => $s['mid'], 'wisdomId' => (string)($b['wisdomId'] ?? ''), 'ip' => client_ip()];
    switch ((string)($b['action'] ?? '')) {
        case 'save':      $res = gs_call('admin.wisdom.upsert', $base + ['data' => $b['data'] ?? []]); break;
        case 'delete':    $res = gs_call('admin.wisdom.delete', $base); break;
        case 'move':      $res = gs_call('admin.wisdom.move', $base + ['dir' => (string)($b['dir'] ?? '')]); break;
        case 'generate':  $res = gs_call('admin.wisdom.voice.generate', $base + ['voice' => (string)($b['voice'] ?? ''),
                              'voiceEn' => (string)($b['voiceEn'] ?? ''), 'which' => (string)($b['which'] ?? 'both'), 'replace' => !empty($b['replace'])]); break;
        case 'upload':    $res = gs_call('admin.wisdom.voice.upload', $base + ['audio' => (string)($b['audio'] ?? '')]); break;
        case 'clearVoice':$res = gs_call('admin.wisdom.voice.clear', $base + ['which' => (string)($b['which'] ?? 'both')]); break;
        case 'voiceAll':  $res = gs_call('admin.wisdom.voice.all', $base); break;
        case 'voiceDefaults': $res = gs_call('admin.wisdom.voice.defaults', $base + ['defaults' => $b['defaults'] ?? []]); break;
        case 'cloneVoice': $res = gs_call('admin.wisdom.voice.clone', $base + ['audio' => (string)($b['audio'] ?? ''),
                              'name' => (string)($b['name'] ?? ''), 'transcript' => (string)($b['transcript'] ?? ''),
                              'language' => (string)($b['language'] ?? ''), 'consent' => !empty($b['consent'])]); break;
        case 'deleteVoice': $res = gs_call('admin.wisdom.voice.clone.delete', $base + ['voiceId' => (string)($b['voiceId'] ?? '')]); break;
        default: json_error('unknown_action', 400);
    }
} else {
    json_error('method_not_allowed', 405);
}
if (empty($res['ok'])) json_error($res['error'] ?? 'failed', 400, $res['message'] ?? null);
unset($res['ok']);
json_ok($res);
