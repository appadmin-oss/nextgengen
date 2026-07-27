<?php
declare(strict_types=1);

/* Emit a JSON body and stop.
 *
 * Sends Content-Length. Without it the reply is delimited only by the
 * connection closing, so a client cannot tell a complete body from a
 * truncated one and has to read to EOF — which is how a perfectly good
 * response ends up looking like a request that never finishes. (Seen for
 * real: Chromium reported the 200 and its headers, then held the request
 * open indefinitely because nothing said where the body ended.)
 *
 * Skipped when PHP is compressing the output itself, because the length of
 * the JSON is not the length of what goes on the wire and a wrong
 * Content-Length truncates the response. Apache's mod_deflate is a different
 * case and safe: it strips the header and switches to chunked encoding,
 * which is self-delimiting anyway.
 */
function json_send(array $payload, int $status = 0): void {
    if ($status) http_response_code($status);
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($body === false) {   // non-UTF8 in the payload — never emit a blank 200
        http_response_code(500);
        $body = '{"ok":false,"error":"encode_failed"}';
    }
    $zlib = strtolower((string) ini_get('zlib.output_compression'));
    $compressing = !($zlib === '' || $zlib === '0' || $zlib === 'off');
    if (!$compressing && !headers_sent()) header('Content-Length: ' . strlen($body));
    echo $body;
    exit;
}

function json_ok(array $payload): void {
    $payload['ok'] = true;
    json_send($payload);
}

function json_error(string $code, int $status = 400, ?string $detail = null): void {
    json_send(['ok' => false, 'error' => $code, 'detail' => $detail], $status);
}
