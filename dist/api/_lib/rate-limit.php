<?php
declare(strict_types=1);

/**
 * Filesystem-backed sliding-window rate limiter. Adequate for shared hosting
 * without Redis. One file per (key, window).
 */

function rate_limit_check(string $op): void {
    global $CONFIG;
    $cfg = $CONFIG['rate_limits'][$op] ?? $CONFIG['rate_limits']['default'];
    $max = (int)$cfg['max'];
    $window = (int)$cfg['window'];
    $ip = client_ip();
    $key = sha1($op . '|' . $ip);
    $dir = $CONFIG['cache_dir'] . '/_rl';
    @mkdir($dir, 0755, true);
    $path = $dir . '/' . $key;

    $now = time();
    $cutoff = $now - $window;

    $hits = [];
    if (file_exists($path)) {
        $raw = @file_get_contents($path);
        if ($raw) {
            foreach (explode("\n", trim($raw)) as $ts) {
                if (is_numeric($ts) && (int)$ts >= $cutoff) $hits[] = (int)$ts;
            }
        }
    }
    if (count($hits) >= $max) {
        json_error('rate_limited', 429);
    }
    $hits[] = $now;
    @file_put_contents($path, implode("\n", $hits), LOCK_EX);
}
