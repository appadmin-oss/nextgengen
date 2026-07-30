<?php
declare(strict_types=1);

/**
 * Web-cron — opportunistic maintenance for hosts with NO SSH/cron.
 *
 * A normal web request, at most once per interval, drains the integration
 * outbox, sends due parent-verification reminders, and (less often) runs the
 * daily maintenance that used to live in api/tools/run-jobs.php. The work runs
 * AFTER the response is flushed to the client (fastcgi_finish_request when
 * available) and is wrapped so it can NEVER disrupt the request. A non-blocking
 * flock stops concurrent requests from stampeding, and per-job marker files
 * throttle each job independently.
 *
 * Cadence (overridable via $CONFIG['webcron']):
 *   deliver   every 60s   — integration bus (Chat/webhook/Sheets, escalations)
 *   reminders every 900s  — parent-verification re-nudge + stalled alerts
 *   maint     every 3600s — publish scheduled posts, expire promo, GC, trim,
 *                             roll due desk passwords
 *
 * Disable entirely with $CONFIG['webcron']['enabled'] = false (e.g. when a real
 * cron drives api/tools/*). CLI SAPI never schedules it.
 */

function web_cron_cfg(string $key, int $default): int {
    $c = $GLOBALS['CONFIG']['webcron'] ?? [];
    return isset($c[$key]) ? max(15, (int)$c[$key]) : $default;
}

function web_cron_dir(): string {
    $dir = (string)($GLOBALS['CONFIG']['cache_dir'] ?? sys_get_temp_dir());
    $wc = rtrim($dir, '/') . '/webcron';
    if (!is_dir($wc)) @mkdir($wc, 0755, true);
    return $wc;
}

/** Absolute path of a job's throttle/heartbeat marker. */
function web_cron_marker(string $job): string {
    return web_cron_dir() . '/' . preg_replace('/[^a-z0-9_]/i', '', $job) . '.at';
}

/** True at most once per $interval seconds for $job — and claims the slot. */
function web_cron_due(string $job, int $interval): bool {
    $marker = web_cron_marker($job);
    $last = @filemtime($marker) ?: 0;
    if (time() - $last < $interval) return false;
    @touch($marker);
    return true;
}

/** Stamp a job as just-run, so its heartbeat/age resets. */
function web_cron_touch(string $job): void {
    @touch(web_cron_marker($job));
}

/**
 * Run named jobs on demand — the admin "run now" path.
 *
 * Guarded by the SAME lock as the background tick, so a manual run and a
 * shutdown-hook tick can never stampede the same work. If the tick holds the
 * lock the job reports 'busy' rather than queueing behind it. Each job is
 * wrapped so one failing does not stop the rest, mirrors the heartbeat the
 * scheduled path stamps, and is journalled either way.
 *
 * $jobs is [name => callable]; returns [name => 'ran'|'error'|'busy'].
 */
function web_cron_run_now(array $jobs): array {
    $out = [];
    $lock = @fopen(web_cron_dir() . '/.lock', 'c');
    if ($lock && @flock($lock, LOCK_EX | LOCK_NB)) {
        try {
            if (function_exists('set_time_limit')) @set_time_limit(60);
            foreach ($jobs as $name => $fn) {
                try {
                    $fn();
                    web_cron_touch($name);
                    if (function_exists('ops_record')) ops_record('cron', $name, 'ran (manual)');
                    $out[$name] = 'ran';
                } catch (Throwable $e) {
                    error_log('[webcron:manual:' . $name . '] ' . $e->getMessage());
                    if (function_exists('ops_record')) ops_record('error', 'webcron:' . $name, $e->getMessage(), basename($e->getFile()) . ':' . $e->getLine());
                    $out[$name] = 'error';
                }
            }
        } finally { @flock($lock, LOCK_UN); }
        @fclose($lock);
    } else {
        if ($lock) @fclose($lock);
        foreach (array_keys($jobs) as $name) $out[$name] = 'busy';
    }
    return $out;
}

/**
 * Run $fn AFTER the response has been sent to the client.
 *
 * For work that a user must not wait on and must not be failed by. The
 * registration desk is the case that forced this: sending the parent's consent
 * link does SMS (15s timeout, two providers tried in turn) and SMTP (15s) —
 * up to ~45s of network I/O, inline, AFTER the child's row was already
 * committed. Past PHP's max_execution_time the request dies, the desk shows a
 * connection error, and the child is registered anyway. Staff then retry and
 * hit a duplicate warning for a registration that actually worked.
 *
 * Under CLI (the test runner) it runs inline, so behaviour stays observable
 * rather than happening after the assertions.
 */
function after_response(string $label, callable $fn): void {
    if (PHP_SAPI === 'cli') {
        try { $fn(); } catch (\Throwable $e) { error_log('[after:' . $label . '] ' . $e->getMessage()); }
        return;
    }
    register_shutdown_function(function () use ($label, $fn) {
        // FPM can hand the response back and keep working. Everywhere else,
        // flush what we have so the browser is not held open by this.
        if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
        else { @ob_end_flush(); @flush(); }
        @ignore_user_abort(true);
        if (function_exists('set_time_limit')) @set_time_limit(60);
        // Never disrupt anything: the response has already gone.
        try { $fn(); } catch (\Throwable $e) { error_log('[after:' . $label . '] ' . $e->getMessage()); }
    });
}

/** Schedule the tick to run after the response is sent. Called from bootstrap. */
function web_cron_schedule(): void {
    if (!empty($GLOBALS['__web_cron_scheduled'])) return;
    $GLOBALS['__web_cron_scheduled'] = true;
    if (PHP_SAPI === 'cli') return;
    $c = $GLOBALS['CONFIG']['webcron'] ?? [];
    if (isset($c['enabled']) && !$c['enabled']) return;
    register_shutdown_function('web_cron_run');
}

/** The shutdown worker. Flushes the response first, then does throttled work. */
function web_cron_run(): void {
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
    try {
        @ignore_user_abort(true);
        if (function_exists('set_time_limit')) @set_time_limit(45);
        $lock = @fopen(web_cron_dir() . '/.lock', 'c');
        if (!$lock) return;
        if (@flock($lock, LOCK_EX | LOCK_NB)) {
            try {
                if (web_cron_due('deliver', web_cron_cfg('deliver', 60)))       web_cron_guard('deliveries_dispatch', fn() => deliveries_dispatch(8));
                if (web_cron_due('reminders', web_cron_cfg('reminders', 900)))  web_cron_guard('reminders', 'web_cron_reminders');
                if (web_cron_due('maint', web_cron_cfg('maint', 3600)))         web_cron_guard('maintenance', 'web_cron_maintenance');
            } finally { @flock($lock, LOCK_UN); }
        }
        @fclose($lock);
    } catch (Throwable $e) { /* a web-cron tick must never disrupt anything */ }
}

/** Run one job, swallowing (but logging) any failure so others still run.
 *
 * Every run is journalled, success included. This hook swallows throwables by
 * design so a background job cannot break a page — which also meant that when
 * reminders and integration deliveries stopped, they stopped silently. The
 * heartbeat is what turns "nothing happened" into something a screen can say.
 */
function web_cron_guard(string $label, callable $fn): void {
    try {
        $fn();
        if (function_exists('ops_record')) ops_record('cron', $label, 'ran');
    } catch (Throwable $e) {
        error_log('[webcron:' . $label . '] ' . $e->getMessage());
        if (function_exists('ops_record')) ops_record('error', 'webcron:' . $label, $e->getMessage(), basename($e->getFile()) . ':' . $e->getLine());
    }
}

/**
 * Parent-verification cadence (ported from api/tools/registration-reminders.php):
 * one re-nudge after 24h, a single registration.stalled escalation after 48h.
 */
function web_cron_reminders(): void {
    $pending = db_all("SELECT * FROM summer_students WHERE regStatus = 'parent_pending' ORDER BY id ASC LIMIT 200");
    foreach ($pending as $s) {
        $ageH = (time() - (strtotime((string)$s['enrolledAt']) ?: time())) / 3600;
        $lastSend = strtotime((string)($s['remindedAt'] ?: $s['enrolledAt'])) ?: time();
        $sinceSendH = (time() - $lastSend) / 3600;
        if ($ageH >= 24 && $sinceSendH >= 24) {
            $initial = strtotime((string)$s['enrolledAt']) ?: 0;
            $remindTs = strtotime((string)($s['remindedAt'] ?: '')) ?: 0;
            if ($remindTs <= $initial + 2 * 3600 && function_exists('registration_send_verification')) {
                registration_send_verification((string)$s['studentId']);
            }
        }
        if ($ageH >= 48) {
            $already = db_row("SELECT id FROM audit_log WHERE event = 'registration.stalled' AND subject = ? LIMIT 1", [(string)$s['studentId']]);
            if (!$already) {
                audit('registration.stalled', null, (string)$s['studentId'], ['hours' => (int)$ageH], '');
                event_emit('registration.stalled', ['ref' => (string)$s['studentId'], 'name' => (string)$s['fullName'], 'hoursPending' => (int)$ageH]);
            }
        }
    }
}

/** Daily maintenance (ported from api/tools/run-jobs.php, minus the heavy Sheets snapshot). */
function web_cron_maintenance(): void {
    $now = now_iso();
    db_exec("UPDATE posts SET status='published', updatedAt=? WHERE status='draft' AND publishAt != '' AND publishAt IS NOT NULL AND publishAt <= ?", [$now, $now]);
    $promo = setting_get('homepage_promo');
    if (is_array($promo) && !empty($promo['expires']) && strtotime((string)$promo['expires']) < time()) {
        setting_set('homepage_promo', '', 'system');
    }
    $cutoff = gmdate('Y-m-d\TH:i:s\Z', time() - 24 * 3600);
    db_exec('DELETE FROM auth_sessions WHERE expiresAt < ?', [$cutoff]);
    if (function_exists('ensure_year')) ensure_year((int)gmdate('Y'));
    $maxId = (int)(db_row('SELECT MAX(id) m FROM audit_log')['m'] ?? 0);
    if ($maxId > 5000) db_exec('DELETE FROM audit_log WHERE id <= ?', [$maxId - 5000]);
    if (function_exists('ops_prune')) ops_prune(30);
    // Prune device sessions revoked more than 30 days ago.
    $cut30 = gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400);
    db_exec("DELETE FROM device_sessions WHERE revokedAt IS NOT NULL AND revokedAt != '' AND revokedAt < ?", [$cut30]);
    // Roll any desk password that has reached its rotation interval. Runs here
    // as well as in api/tools/run-jobs.php so rotation works on a host with no
    // shell and no cron — ordinary traffic drives it. Both paths are safe
    // together: a gate is only rolled once its interval has elapsed, and
    // rotating stamps passSetAt, so whichever runs second finds nothing due.
    if (function_exists('gates_rotate_due')) gates_rotate_due();
    // Log absences for programme days that have closed, then re-evaluate the
    // people whose ledger moved. Idempotent: the sweep records how far it has
    // got, only touches days strictly before today, and the unique index on
    // (person, kind, date) means a double run cannot become a double strike.
    if (function_exists('policy_sweep_absences')) policy_sweep_absences();
}
