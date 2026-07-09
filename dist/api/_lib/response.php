<?php
declare(strict_types=1);

function json_ok(array $payload): void {
    $payload['ok'] = true;
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $code, int $status = 400, ?string $detail = null): void {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $code, 'detail' => $detail], JSON_UNESCAPED_SLASHES);
    exit;
}
