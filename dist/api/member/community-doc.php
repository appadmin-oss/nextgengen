<?php
/**
 * A Community document post's file, served from this origin (domain/community-v3.php,
 * community.doc). The document viewer's pdf.js and the Download button both read
 * it here, because the stored URL itself is not readable from the browser.
 *   GET ?postId=CP-…        inline (a PDF opens in the viewer)
 *   GET ?postId=CP-…&dl=1   as a download
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$res = gs_call('community.doc', ['memberId' => $s['mid'], 'postId' => (string)($_GET['postId'] ?? '')]);
if (empty($res['ok'])) {
    $e = (string)($res['error'] ?? '');
    http_response_code($e === 'not_found' || $e === 'not_a_document' ? 404 : ($e === 'not_ours' ? 409 : 502));
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $e === 'not_found' || $e === 'not_a_document' ? 'That document isn’t available any more.' : 'That document couldn’t be fetched. Try again in a moment.';
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
