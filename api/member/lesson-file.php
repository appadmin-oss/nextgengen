<?php
/**
 * A lesson's file, served from this origin (domain/curriculum.php,
 * curriculum.material). The lesson reader's pdf.js and its Download button
 * both read it here, because a PDF on the image cloud is not delivered to a
 * browser directly.
 *   GET ?id=CM-…        inline (a PDF opens in the reader)
 *   GET ?id=CM-…&dl=1   as a download
 * A link that is not ours answers 409 with its address, for the page to open.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$res = gs_call('curriculum.material', ['memberId' => $s['mid'], 'materialId' => (string)($_GET['id'] ?? '')]);
if (empty($res['ok'])) {
    $e = (string)($res['error'] ?? '');
    http_response_code($e === 'not_found' ? 404 : ($e === 'external' ? 409 : 502));
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $e === 'not_found' ? 'That lesson file isn’t available.' : ($e === 'external' ? 'Open it at its own address.' : 'That file couldn’t be fetched. Try again in a moment.');
    exit;
}
$dl = ($_GET['dl'] ?? '') === '1' || $res['ext'] !== 'pdf';
header('Content-Type: ' . $res['mime']);
header('Content-Length: ' . strlen($res['body']));
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: sandbox; default-src 'none'");
header('Cache-Control: private, max-age=3600');
header('Content-Disposition: ' . ($dl ? 'attachment' : 'inline') . '; filename="' . str_replace('"', '', $res['name']) . '"; filename*=UTF-8\'\'' . rawurlencode($res['name']));
echo $res['body'];
