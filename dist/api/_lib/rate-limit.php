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
        // The public self-registration link. Its own buckets, so a queue of
        // families filling in the form cannot lock out the check-in desk they
        // are standing in front of.
        //
        // Both are keyed on IP + gate (see the $scope argument), and sized for
        // the case that is NORMAL rather than the one that is hostile: a whole
        // centre — or a whole mobile carrier — shares one address, so a queue of
        // families registering from the same WiFi is the expected traffic, not
        // an attack. At 4 per 5 minutes the fifth family was refused, and told
        // to check a connection that was fine. The same reasoning is already
        // written out for 'arcade.start' below; it was never applied here.
        //
        // These stay a runaway-script ceiling, nothing finer. The real control
        // is that a submission is not a registration: it lands as self_pending
        // and a human at the review desk has to approve it before anything
        // reaches a family (see api/public/selfreg.php).
        'selfreg.read'       => ['max' => 120, 'window' => 60],
        'selfreg.submit'     => ['max' => 40,  'window' => 300],
        'selfreg.desk'       => ['max' => 240, 'window' => 60],   // a reviewer works fast; the password is the real control
        // Starting a round writes a row and generates a question set. The limit
        // is keyed on IP, and a whole centre shares one connection — a class of
        // thirty children opening the arcade together is the NORMAL case, not
        // an attack, so this has to clear that comfortably. It is a ceiling on
        // a runaway script, nothing finer; the real gate is the session, and an
        // abandoned round is pruned within the week.
        'arcade.start'       => ['max' => 120, 'window' => 60],
        // A shared journal entry's token is the only thing between a guess and a
        // programme record, so guessing should be expensive. Generous enough for
        // a link legitimately opened by a group from one office connection.
        'journal.shared'     => ['max' => 30, 'window' => 300],
    ];
    return $d[$op] ?? null;
}

/**
 * @param string $op    the bucket name
 * @param string $scope extra key material, so one tenant cannot exhaust another's
 *                      allowance. Everything here is keyed on IP, and on a mobile
 *                      carrier or a centre's WiFi an entire queue of people shares
 *                      one address — so for a per-link surface (a gate's public
 *                      sign-up) the gate id belongs in the key, or the busiest
 *                      centre silently rations every other centre.
 */
function rate_limit_check(string $op, string $scope = ''): void {
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
    $key = sha1($op . '|' . $ip . ($scope === '' ? '' : '|' . $scope));
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
        // Retry-After turns a refusal into something a client can obey. Without
        // it an offline outbox retries on its own schedule and simply keeps
        // hitting the wall; with it, it backs off until the window has actually
        // rolled. The oldest hit in the window is when a slot next frees up.
        $retry = max(1, ($hits ? min($hits) : $now) + $window - $now);
        flock($fh, LOCK_UN); fclose($fh);
        if (!headers_sent()) header('Retry-After: ' . $retry);
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
