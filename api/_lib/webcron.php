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
 *   accrue    every 86400s — bring fee charges up to date (no-op when fees are
 *                             switched off)
 *
 * Disable entirely with $CONFIG['webcron']['enabled'] = false (e.g. when a real
 * cron drives api/tools/*). CLI SAPI never schedules it.
 *
 * A host that HAS a scheduler can drive the same jobs from outside instead —
 * api/public/cron.php, with $CONFIG['cron_key'] set. Same jobs, same lock, same
 * heartbeats; see that file. Opportunistic web-cron and an external scheduler
 * are safe to run together, which matters during a migration from one to the
 * other.
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
/**
 * Hand the finished response back to the client, then keep working.
 *
 * FPM can genuinely detach. Everywhere else — Apache mod_php, CGI, the built-in
 * server, which is to say the no-SSH shared hosting this whole file exists to
 * serve — the best available move is to push the bytes out and let
 * Content-Length (see _lib/response.php) tell the browser the body is complete.
 *
 * The loop matters. A single ob_end_flush() pops ONE buffer level, and there is
 * routinely more than one: the `output_buffering` ini default, mod_deflate, and
 * anything a handler opened. Popping one of three leaves the response exactly
 * where it was — sitting in a buffer while the caller waits.
 *
 * One helper rather than two copies, because the two copies drifted: this was
 * inlined in after_response() and simply missing from web_cron_run().
 */
function response_detach(): void {
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); return; }
    while (ob_get_level() > 0) { @ob_end_flush(); }
    @flush();
}

function after_response(string $label, callable $fn): void {
    if (PHP_SAPI === 'cli') {
        try { $fn(); } catch (\Throwable $e) { error_log('[after:' . $label . '] ' . $e->getMessage()); }
        return;
    }
    register_shutdown_function(function () use ($label, $fn) {
        response_detach();
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

/**
 * The shutdown worker. Flushes the response first, then does throttled work.
 *
 * The flush is not a nicety, it is the whole contract. This is registered from
 * bootstrap, which makes it the FIRST shutdown function on every request — it
 * runs before any after_response() a handler registered. It used to detach only
 * under FPM, so on every other SAPI the finished response sat in the output
 * buffer through up to 45s of deliveries, reminders and maintenance, and
 * after_response added its own SMS/SMTP time on top. The browser saw nothing,
 * api-client aborted the write at 60s, and a registration that had already
 * committed was reported to the user as "check your connection".
 */
function web_cron_run(): void {
    response_detach();
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
                /* Fee accrual. Its own slot rather than a ride on maintenance,
                   because it is the one job an operator will want to reason
                   about on its own — "has anybody been charged today" — and a
                   shared heartbeat cannot answer that. Daily by default: dues
                   are monthly and the day rate is per meeting day, so nothing
                   here is more urgent than that, and every charge it posts is
                   idempotent so a missed tick costs nothing. */
                if (web_cron_due('accrue', web_cron_cfg('accrue', 86400)))       web_cron_guard('fees_accrue', 'web_cron_accrue');
                // An edition whose season has ended closes, and its Summer-only centres retire with it.
                if (web_cron_due('editions', web_cron_cfg('editions', 21600)) && function_exists('summer_editions_close_elapsed')) web_cron_guard('editions_close', fn() => summer_editions_close_elapsed());
                // Mentorship's adaptive rules (R1–R8): nudges for a mentor or a lead, never a child.
                if (web_cron_due('mentorship', web_cron_cfg('mentorship', 21600)) && function_exists('ms_rules_run')) web_cron_guard('mentorship_rules', fn() => ms_rules_run());
                // Mentor Portal jobs (AUTOMATIONS.md): each runs at its own Lagos time;
                // this tick only asks whether a slot has come. Family messages held
                // for quiet hours go out here too.
                if (web_cron_due('mentor_jobs', web_cron_cfg('mentor_jobs', 600)) && function_exists('mpa_tick')) web_cron_guard('mentor_jobs', fn() => mpa_tick());
                /* Flag anybody whose clock ran out while nobody was watching.
                 * The board poll catches this the instant somebody looks; two
                 * players who both closed the tab leave a game open forever,
                 * holding up a tournament round that cannot then close. */
                if (web_cron_due('clocks', web_cron_cfg('clocks', 60)))          web_cron_guard('chess_clocks', fn() => chess_clock_sweep(40));
                // Weekly engagement snapshot — captured opportunistically at most
                // once every 7 days even with no external cron. Idempotent per
                // week, so a slightly-early or -late firing just refreshes the row.
                if (web_cron_due('eng_snapshot', web_cron_cfg('eng_snapshot', 604800))) web_cron_guard('engagement_snapshot', fn() => engagement_snapshot_week());
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
    /* Dues reminders ride the existing reminders job rather than getting a
     * schedule of their own. The cron cadence is NOT the reminder cadence: this
     * fires every 15 minutes and `fees_reminder_candidates()` decides per family
     * against `remindEveryDays` (floored at a week), so running it often costs
     * nothing and cannot chase anybody faster than the setting allows.
     *
     * Guarded so a fault here cannot take the registration reminders below with
     * it — those are time-critical in a way an account balance is not: a stalled
     * parent verification blocks a child from attending. */
    if (function_exists('fees_reminders_run')) {
        try { fees_reminders_run(FEES_REMIND_CRON_BATCH); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'fees.reminders', $e->getMessage()); }
    }

    /* And note — never apply — an overdue amounts review. An uprate that is only
     * visible on the tab where it is set is an uprate nobody performs, because
     * nothing tells you to look. This journals it as a `warn` so the ops screen
     * surfaces it, bounded to once a month; raising the amounts stays a human
     * press. Guarded separately: a nudge must not cost the sends above. */
    if (function_exists('fees_uprate_note')) {
        try { fees_uprate_note(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'fees.uprate', $e->getMessage()); }
    }

    /* Seasonal nudges — the dated encouragement/appreciation/reminder emails to
     * volunteers, students and parents. Same-day only and logged once per
     * recipient (see api/_lib/nudges.php), so firing every 15 minutes just
     * drains the day's message in bounded batches and then no-ops. Guarded so a
     * send fault can't take the reminders above down with it. */
    /* The companion's weekly assessment of each member, and its mail. Few per
     * tick when the AI writes them (each is a call); done once per week. */
    if (function_exists('companion_weekly_run')) {
        try { companion_weekly_run(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'companion', $e->getMessage()); }
    }

    /* The family week — one mail per guardian per week, claimed before it is sent. */
    if (function_exists('family_weekly_run')) {
        try { family_weekly_run(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'family.weekly', $e->getMessage()); }
    }

    /* The Monday quote mail — once per member per week, drained in batches. */
    if (function_exists('qotw_mail_run')) {
        try { qotw_mail_run(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'qotw.mail', $e->getMessage()); }
    }

    /* Curriculum: reminders while assessments are outstanding, and the fine
     * for one left undone past its week. Idempotent per lesson and per
     * reminder period (domain/curriculum.php), so 15 minutes is harmless. */
    if (function_exists('curriculum_due_run')) {
        try { curriculum_due_run(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'curriculum.due', $e->getMessage()); }
    }

    /* School results: the Sunday "tick your week", the Monday stalled-plan
     * note to the mentor, and the Saturday due reminder. Each send is keyed in
     * results_log per week, so a 15-minute tick sends it once. */
    if (function_exists('results_job_run')) {
        try { results_job_run(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'results.job', $e->getMessage()); }
    }

    if (function_exists('nudges_run')) {
        try { nudges_run(attendance_today(), NUDGE_CRON_BATCH); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'nudges', $e->getMessage()); }
    }

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
/**
 * Bring fee charges up to date across the active membership.
 *
 * Bounded per tick. A roster of 136 clears in one pass; a much larger one
 * catches up over successive ticks rather than walking the whole table inside
 * somebody's page load. Every charge is idempotent (see fees_post), so a member
 * missed this tick is simply charged on the next.
 */
function web_cron_accrue(): void {
    if (!function_exists('fees_settings') || !function_exists('fees_accrue_member')) return;
    $cfg = fees_settings();
    if (empty($cfg['enabled'])) return;
    $limit = max(1, min(FEES_SCAN_MAX, (int)web_cron_cfg('accrueBatch', FEES_ACCRUE_BATCH)));
    $n = 0;
    foreach (db_all("SELECT * FROM members WHERE status = 'active' ORDER BY id LIMIT " . $limit) as $m) {
        fees_accrue_member($m, $cfg);
        $n++;
    }
    if ($n && function_exists('ops_record')) ops_record('cron', 'fees_accrue', $n . ' member(s) brought up to date');
}

function web_cron_maintenance(): void {
    $now = now_iso();
    if (function_exists('volunteer_cards_ngg_clock_fix')) volunteer_cards_ngg_clock_fix();
    if (function_exists('schools_seed_once')) schools_seed_once();
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
    // Expired brute-force locks. Left alone the table grows one row per code or
    // gate ever guessed at, and a lock nobody is serving is just a stale row.
    if (function_exists('attempt_guard_gc')) attempt_guard_gc();
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
    if (function_exists('policy_sweep_member_absences')) policy_sweep_member_absences();
    /* Locally-held images nothing references any more — a rejected application,
     * a duplicate registration, an original replaced by a retake. The store is
     * write-on-intake and an intake can be refused after the bytes have landed,
     * so without this a shared host's disk quota fills over a season. Bounded,
     * conservative (a week old before it is even a candidate) and it does
     * nothing at all if it cannot read what is referenced. */
    if (function_exists('photo_store_sweep')) photo_store_sweep(7, 200);
    /* Keep the analyst panel warm, so Monday morning reads an answer instead of
     * watching four model calls. Off unless an admin turns it on — this is the
     * one background job that spends money — and a no-op when the numbers have
     * not moved, because the panel is cached against a fingerprint of them. */
    if (function_exists('insight_prewarm')) insight_prewarm();
}
