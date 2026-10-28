<?php
/**
 * Admin: one course of the curriculum as a document (domain/curriculum.php
 * admin_curriculum_document).
 *   GET ?course=Piano[&level=Year 1 · Foundation][&edition=staff|member][&format=doc]
 * A print-ready page: the browser's "Save as PDF" makes the PDF (this host has
 * no headless renderer). The member edition has no answers and no assignments.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
$s = require_admin();
$res = gs_call('admin.curriculum.document', ['requesterId' => $s['mid'], 'course' => (string)($_GET['course'] ?? ''),
    'level' => (string)($_GET['level'] ?? ''), 'edition' => (string)($_GET['edition'] ?? 'staff')]);
if (empty($res['ok'])) {
    http_response_code(($res['error'] ?? '') === 'forbidden' ? 403 : 404);
    header('Content-Type: text/plain; charset=utf-8');
    echo ($res['error'] ?? '') === 'forbidden' ? 'You do not have access to the curriculum.' : ((string)($res['detail'] ?? '') ?: 'That curriculum could not be prepared.');
    exit;
}
$doc = $res['document'];
$format = ($_GET['format'] ?? '') === 'doc' ? 'doc' : 'html';
$name = trim(preg_replace('/[^A-Za-z0-9]+/', '-', $doc['title'] . ' ' . $doc['member']['fullName']), '-');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, no-store');
if ($format === 'doc') {
    header('Content-Type: application/msword; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $name . '.doc"');
} else {
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'unsafe-inline'");
}
echo curriculum_document_html($doc, $format);
