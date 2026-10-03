<?php
/**
 * The signed-in member's curriculum as a document (domain/curriculum.php).
 *   GET              a print-ready page: the browser's "Save as PDF" makes the PDF
 *   GET ?format=doc  the same document as a Word file
 *
 * There is no headless renderer on this host, so the PDF is the browser's own.
 * The look is api/_lib/templates/curriculum-document.{php,css}.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_session();
$res = gs_call('member.curriculum.document', ['memberId' => $s['mid']]);
if (empty($res['ok'])) {
    http_response_code($res['error'] === 'not_ngg_member' ? 403 : 400);
    header('Content-Type: text/plain; charset=utf-8');
    echo $res['error'] === 'not_ngg_member' ? 'The curriculum belongs to NGG Club members.' : 'The curriculum could not be prepared.';
    exit;
}
$doc = $res['document'];
$format = ($_GET['format'] ?? '') === 'doc' ? 'doc' : 'html';
$name = preg_replace('/[^A-Za-z0-9]+/', '-', $doc['title'] . ' ' . $doc['member']['fullName']);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
if ($format === 'doc') {
    // Word opens an HTML document saved as .doc, styles and all.
    header('Content-Type: application/msword; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . trim($name, '-') . '.doc"');
} else {
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'unsafe-inline'");
}
echo curriculum_document_html($doc, $format);
