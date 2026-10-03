<?php
/**
 * A curriculum material stored on this server (domain/curriculum.php). Any
 * signed-in person may read one; the store itself is not web-reachable.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_session();
$path = curriculum_file_path((string)($_GET['f'] ?? ''));
if ($path === '') { http_response_code(404); exit; }
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$type = CURR_FILE_TYPES[$ext][0] ?? 'application/octet-stream';
// Documents download; media and PDFs open in the browser.
$inline = in_array($ext, ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'mp3', 'm4a', 'mp4', 'txt'], true);
header('Content-Type: ' . $type);
header('Content-Length: ' . filesize($path));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=86400');
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="material.' . $ext . '"');
readfile($path);
