<?php
declare(strict_types=1);

/**
 * Client for Apps Script Web App. Signs every request with HMAC-SHA256.
 * Supports filesystem caching for public reads.
 */

function gs_call(string $op, array $args = [], bool $useCache = false): array {
    global $CONFIG;

    if ($useCache) {
        $cached = gs_cache_read($op, $args);
        if ($cached !== null) return $cached;
    }

    $body = json_encode(array_merge(['op' => $op], $args), JSON_UNESCAPED_SLASHES);
    if ($body === false) {
        json_error('encode_failed', 500);
    }
    $sig = hash_hmac('sha256', $body, $CONFIG['shared_secret']);
    $url = $CONFIG['apps_script_url'] . '?sig=' . $sig;

    // Retry strategy: one fast retry on connection failure (Apps Script
    // sometimes drops the first packet during cold-start), then give up.
    $res = null; $err = null; $code = 0;
    for ($attempt = 1; $attempt <= 2; $attempt++) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST            => true,
            CURLOPT_POSTFIELDS      => $body,
            CURLOPT_HTTPHEADER      => [
                'Content-Type: application/json',
                'User-Agent: NGG-PHP/1.0',
            ],
            CURLOPT_RETURNTRANSFER  => true,
            CURLOPT_FOLLOWLOCATION  => true,
            CURLOPT_MAXREDIRS       => 4,
            CURLOPT_CONNECTTIMEOUT  => 8,
            CURLOPT_TIMEOUT         => 25,
            CURLOPT_SSL_VERIFYPEER  => true,
            CURLOPT_SSL_VERIFYHOST  => 2,
            CURLOPT_ENCODING        => '',     // accept gzip
        ]);
        $res = curl_exec($ch);
        $err = curl_error($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // Transient errors only — retry once. Otherwise break and report.
        if ($res !== false && $code >= 200 && $code < 500) break;
        if ($attempt === 1) usleep(250000); // 250ms back-off
    }

    if ($err) {
        error_log(sprintf('[gs_call] curl error op=%s code=%d err=%s', $op, $code, $err));
        json_error('upstream_unreachable', 502, $CONFIG['debug'] ? $err : null);
    }
    if (!is_string($res) || $res === '') {
        error_log(sprintf('[gs_call] empty response op=%s code=%d', $op, $code));
        json_error('upstream_empty', 502);
    }
    $data = json_decode($res, true);
    if (!is_array($data)) {
        error_log(sprintf('[gs_call] non-json op=%s code=%d body=%s', $op, $code, substr($res, 0, 200)));
        json_error('upstream_bad_json', 502);
    }

    if ($useCache && !empty($data['ok'])) {
        gs_cache_write($op, $args, $data);
    }
    return $data;
}

function gs_cache_read(string $op, array $args): ?array {
    global $CONFIG;
    $ttl = $CONFIG['cache_ttl'][$op] ?? $CONFIG['cache_ttl']['default'] ?? 0;
    if ($ttl <= 0) return null;
    $path = gs_cache_path($op, $args);
    if (!file_exists($path)) return null;
    $age = time() - filemtime($path);
    if ($age > $ttl) return null;
    $raw = @file_get_contents($path);
    if (!$raw) return null;
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function gs_cache_write(string $op, array $args, array $data): void {
    global $CONFIG;
    $path = gs_cache_path($op, $args);
    @mkdir(dirname($path), 0755, true);
    @file_put_contents($path, json_encode($data, JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function gs_cache_path(string $op, array $args): string {
    global $CONFIG;
    $hash = substr(hash('sha256', json_encode($args, JSON_UNESCAPED_SLASHES)), 0, 16);
    return $CONFIG['cache_dir'] . '/' . str_replace('.', '_', $op) . '__' . $hash . '.json';
}

function gs_cache_purge(string $op): void {
    global $CONFIG;
    foreach (glob($CONFIG['cache_dir'] . '/' . str_replace('.', '_', $op) . '__*.json') ?: [] as $f) {
        @unlink($f);
    }
}
