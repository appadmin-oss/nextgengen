<?php
declare(strict_types=1);

/**
 * Filesystem-backed sliding-window rate limiter. Adequate for shared hosting
 * without Redis. One file per (key, window).
 */

/**
 * Code-level safety floors for security-critical buckets. Config.php values
 * always win; these guarantee a sane throttle exists even on a deployment whose
 * config predates a new bucket — without them a missing key silently falls back
 * to the loose 'default' (60/min), which for mail-sending or minor-PII lookups
 * is a spam-relay / enumeration hazard.
 */
function rate_limit_default(string $op): ?array {
    static $d = [
        'apply'              => ['max' => 6,  'window' => 60],    // sends an acknowledgement email to a client-supplied address
        'apply.hour'         => ['max' => 30, 'window' => 3600],  // mail-amplification ceiling per IP
        'contact'            => ['max' => 5,  'window' => 60],    // notifies admins on every send
        'donate'             => ['max' => 10, 'window' => 60],    // inserts a row + outbound Paystack call
        'application.status' => ['max' => 20, 'window' => 300],   // (ref,email) brute-force lookup
        'summer.profile'     => ['max' => 12, 'window' => 300],   // a minor's name + photo + attendance, by guessable handle
        'student.login'      => ['max' => 8,  'window' => 300],   // ID-card credential check — brute-force ceiling
        'community.post'     => ['max' => 12, 'window' => 60],    // feed post/comment write rate
        // Starting a round writes a row and generates a question set. The limit
        // is keyed on IP, and a whole centre shares one connection — a class of
        // thirty children opening the arcade together is the NORMAL case, not
        // an attack, so this has to clear that comfortably. It is a ceiling on
        // a runaway script, nothing finer; the real gate is the session, and an
        // abandoned round is pruned within the week.
        'arcade.start'       => ['max' => 120, 'window' => 60],
    ];
    return $d[$op] ?? null;
}

function rate_limit_check(string $op): void {
    global $CONFIG;
    // Config wins; then a hardcoded safety floor; then the loose default; then a
    // last-resort literal so a missing 'rate_limits' block can never fatal.
    $cfg = $CONFIG['rate_limits'][$op]
        ?? rate_limit_default($op)
        ?? $CONFIG['rate_limits']['default']
        ?? ['max' => 60, 'window' => 60];
    $max = (int)$cfg['max'];
    $window = (int)$cfg['window'];
    $ip = client_ip();
    $key = sha1($op . '|' . $ip);
    $dir = $CONFIG['cache_dir'] . '/_rl';
    @mkdir($dir, 0755, true);
    $path = $dir . '/' . $key;

    $now = time();
    $cutoff = $now - $window;

    // Hold an exclusive lock across the WHOLE read-modify-write so two concurrent
    // requests can't both read a sub-limit count and both append — the previous
    // unlocked read + LOCK_EX write let bursts slip past the cap, defeating the
    // brute-force throttles this exists to enforce.
    $fh = @fopen($path, 'c+');
    if ($fh === false) return; // fail-open rather than 500 on a cache-dir hiccup
    if (!flock($fh, LOCK_EX)) { fclose($fh); return; }

    $hits = [];
    $raw = stream_get_contents($fh);
    if ($raw) {
        foreach (explode("\n", trim($raw)) as $ts) {
            if (is_numeric($ts) && (int)$ts >= $cutoff) $hits[] = (int)$ts;
        }
    }
    if (count($hits) >= $max) {
        flock($fh, LOCK_UN); fclose($fh);
        json_error('rate_limited', 429);
    }
    $hits[] = $now;
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, implode("\n", $hits));
    fflush($fh);
    flock($fh, LOCK_UN); fclose($fh);

    // Opportunistic GC: the _rl dir otherwise grows one file per (op,IP) forever.
    // ~0.5% of calls sweep files untouched for 2× the longest window.
    if (function_exists('random_int') && random_int(0, 199) === 0) rate_limit_gc($dir);
}

/** Remove stale rate-limit files (older than a generous multiple of any window). */
function rate_limit_gc(string $dir): void {
    $stale = time() - 2 * 3600; // 2h: comfortably past every configured window
    foreach (@glob($dir . '/*') ?: [] as $f) {
        if (@filemtime($f) < $stale) @unlink($f);
    }
}
