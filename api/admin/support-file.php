<?php
/** Admin: a file attached to a support case, streamed to staff holding `support` (domain/support.php). */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');
$s = require_admin();
$r = backend_dispatch('support.file', ['staff' => true, 'requesterId' => $s['mid'], 'caseNo' => (int)($_GET['caseNo'] ?? 0), 'fileId' => (string)($_GET['f'] ?? '')]);
if (empty($r['ok'])) json_error($r['error'] ?? 'not_found', 404);
header('Content-Type: ' . $r['type']);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
header('Content-Disposition: ' . ($r['type'] === 'application/pdf' ? 'attachment' : 'inline') . '; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $r['name']) . '"');
readfile($r['path']);
