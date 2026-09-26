<?php
/**
 * A quote-of-the-week clip — a staff voice-over or a stored TTS rendering.
 * The name is a hash of the bytes, so it is served immutable. Byte ranges are
 * honoured because Safari will not play an <audio> source that ignores them.
 */
require_once __DIR__ . '/../_lib/bootstrap.php';
require_method('GET');

$path = wisdom_audio_path((string)($_GET['a'] ?? ''));
if ($path === '' || !is_file($path)) { http_response_code(404); exit; }

$types = ['mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'webm' => 'audio/webm'];
$size = filesize($path);
header('Content-Type: ' . ($types[strtolower(pathinfo($path, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
header('Cache-Control: public, max-age=31536000, immutable');
header('Accept-Ranges: bytes');
header('X-Content-Type-Options: nosniff');

$start = 0; $end = $size - 1;
if (preg_match('/^bytes=(\d*)-(\d*)$/', (string)($_SERVER['HTTP_RANGE'] ?? ''), $m) && ($m[1] !== '' || $m[2] !== '')) {
    if ($m[1] === '') { $start = max(0, $size - (int)$m[2]); }
    else { $start = (int)$m[1]; if ($m[2] !== '') $end = min($end, (int)$m[2]); }
    if ($start > $end || $start >= $size) { http_response_code(416); header("Content-Range: bytes */$size"); exit; }
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$size");
}
header('Content-Length: ' . ($end - $start + 1));
$fh = fopen($path, 'rb');
fseek($fh, $start);
$left = $end - $start + 1;
while ($left > 0 && !feof($fh)) { $chunk = fread($fh, min(65536, $left)); echo $chunk; $left -= strlen($chunk); }
fclose($fh);
