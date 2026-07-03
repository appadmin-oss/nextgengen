<?php
declare(strict_types=1);

/**
 * gs_call — historically a signed HTTP call to Google Apps Script. The backend
 * is now a local PHP + database layer (see _lib/backend.php), so this is a thin
 * shim that dispatches in-process. The name + signature are kept so the ~35
 * route files need no changes. Filesystem caching for public reads is retained.
 *
 * (The old Apps Script deployment now only serves as a read-only Sheets mirror,
 * written to by api/tools/export-sheets.php — it is no longer on the read path.)
 */

function gs_call(string $op, array $args = [], bool $useCache = false): array {
    if ($useCache) {
        $cached = gs_cache_read($op, $args);
        if ($cached !== null) return $cached;
    }

    $data = backend_dispatch($op, $args);

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
    if (time() - filemtime($path) > $ttl) return null;
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
