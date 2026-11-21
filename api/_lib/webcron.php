<?php
declare(strict_types=1);

/**
 * Web-cron — background work for hosts with NO SSH/cron.
 *
 * Two doors, one scheduler (see "THE SCHEDULER" below):
 *   · an outside scheduler fetching api/public/cron.php every minute or few —
 *     the gate's Cloudflare Worker, a cPanel cron, an uptime pinger. The fast
 *     path: while it runs, visitors' pages do no background work.
 *   · otherwise, after a visitor's response has been handed back, one short
 *     budgeted tick (WEB_CRON_BUDGET seconds, one network job at most).
 * Every job, its interval and whether it talks to another server is in
 * web_cron_jobs(); an interval can be overridden in $CONFIG['webcron'][job].
 * Disable the visitor tick entirely with $CONFIG['webcron']['enabled'] = false.
 * CLI never schedules it.
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

/* ══════════════════════════════════════════════════════════════════════════
   THE SCHEDULER (rebuilt 31 Oct 2026)

   Why it was rebuilt. On this class of host a PHP worker stays busy for the
   whole tick even after the page has gone, and the host allows only a handful
   (CloudLinux "entry processes"; past them, 508 and timeouts). The old tick
   ran ~25 jobs in a fixed order, several of them network calls of up to 20 s
   each, for up to 45 s — and on LiteSpeed it never detached at all
   (response_detach), so the VISITOR waited for it. That is "the site times
   out, it is slow" with nothing in any log.

   What it does now:
   · One registry of jobs (web_cron_jobs): interval, the work, and whether it
     talks to another server ('net').
   · A visitor's tick does at most WEB_CRON_BUDGET seconds and at most ONE
     network job. Due jobs go most-overdue first, and a job whose last run
     will not fit in what is left of the budget waits for a fresh tick rather
     than overrunning it. Nothing is lost: an unrun job is still due.
   · When an outside scheduler drives the jobs (api/public/cron.php — the
     gate's Cloudflare Worker, a cPanel cron, an uptime pinger), visitors' pages
     do no background work at all. That is the fast path, and the one to use.
   · Every run that took any time is logged (PHP error log), a slow one is on
     the ops screen with what took the time, and the heartbeat row is written
     at most every ten minutes per job rather than on every tick.
   ══════════════════════════════════════════════════════════════════════════ */

const WEB_CRON_BUDGET = 8;            // seconds a visitor's request may spend
const WEB_CRON_EXT_BUDGET = 50;       // the outside scheduler's run, under Cloudflare's 100 s
const WEB_CRON_SLOW = 5;              // a job or run this long is on the ops screen
const WEB_CRON_EXTERNAL_FRESH = 300;  // an outside run this recent means visitors do nothing

/**
 * Every background job: name => [interval seconds, work, net]. `net` is true
 * for a job that talks to another server (mail, SMS, push, webhooks, CACENTRE,
 * Cloudinary) — the ones whose time is not ours to control.
 */
function web_cron_jobs(): array {
    $J = [];
    $add = static function (string $name, int $every, ?callable $fn, bool $net) use (&$J) { if ($fn) $J[$name] = [web_cron_cfg($name, $every), $fn, $net]; };
    $has = static fn(string $f) => function_exists($f) ? $f : null;
    $add('deliver',      60,     fn() => deliveries_dispatch(8), true);                          // the integration bus: Chat, webhooks, Sheets
    $add('reminders',    900,    'web_cron_reminders', true);                                    // parent verification, dues reminders
    $add('photo_asks',   60,     $has('ids_photo_drain'), true);                                 // id-studio.php: a batch a minute
    $add('maint',        3600,   'web_cron_maintenance', false);
    $add('accrue',       86400,  'web_cron_accrue', false);                                      // fees: idempotent, daily
    $add('editions',     21600,  $has('summer_editions_close_elapsed'), false);
    $add('vol_thanks',   60,     $has('summer_thanks_drain'), true);
    $add('notice_sched', 60,     $has('notice_schedule_run'), false);                            // before notice_mail: most-overdue order keeps it first
    $add('notice_mail',  60,     $has('notice_mail_drain'), true);
    $add('push',         60,     $has('push_flush'), true);
    $add('push_gc',      86400,  $has('push_gc'), false);
    $add('mentorship',   21600,  $has('ms_rules_run'), false);
    $add('mentor_jobs',  600,    $has('mpa_tick'), true);
    $add('assign_auto',  21600,  $has('assignment_auto_issue'), false);
    $add('assign_due',   86400,  $has('assignment_due_reminders'), false);                    // due tomorrow / overdue: once per member per kind
    $add('wifi_silent',  900,    $has('wifi_silent_digest'), true);
    $add('club_ann',     600,    $has('cp_ann_due_tick'), true);
    $add('media_sweep',  86400,  $has('media_obj_sweep'), true);
    if (defined('MEDIA_REFRESH_SECONDS')) $add('media_usage', MEDIA_REFRESH_SECONDS, $has('media_usage_refresh'), true);
    $add('clocks',       60,     fn() => chess_clock_sweep(40), false);
    $add('crm_push',     900,    $has('crm_push_run'), true);
    $add('eng_snapshot', 604800, $has('engagement_snapshot_week'), false);
    if (defined('WIFI_CAC_EVERY')) $add('wifi_cac', WIFI_CAC_EVERY, $has('wifi_cac_tick'), true);
    $add('paystack',     600,    $has('paystack_sweep'), true);               // membership-pay.php: re-ask Paystack about checkouts nobody came back for
    $add('volpay',       3600,   $has('volpay_tick'), false);
    $add('dirpush',      3600,   $has('dirpush_tick'), true);
    $add('photos_bucket', 3600,  $has('photo_store_to_bucket_tick'), true);   // held photos into the bucket, a batch an hour until none are left
    $add('regcheck',     3600,   $has('rcl_tick'), true);                     // registration checklist: recount, remind supervisors and families weekly
    $add('photo_sizes',  600,    $has('photo_variants_tick'), true);          // each bucket photo's sizes, made once by Cloudinary, stored beside it
    // Once: tracks that name courses exactly become chosen courses (curriculum.php).
    if (function_exists('member_courses_backfill_once') && defined('MEMBER_COURSES_BACKFILL') && (string)setting_raw(MEMBER_COURSES_BACKFILL) === '')
        $add('courses_backfill', 60, 'member_courses_backfill_once', false);
    return $J;
}

/** True at most once per $interval seconds for $job — and claims the slot. */
function web_cron_due(string $job, int $interval): bool {
    $marker = web_cron_marker($job);
    if (time() - (@filemtime($marker) ?: 0) < $interval) return false;
    @touch($marker);
    return true;
}

/** Stamp a job as just-run, so its heartbeat/age resets. */
function web_cron_touch(string $job): void {
    @touch(web_cron_marker($job));
}

/** How long a job took last time, in seconds (0 when never measured). */
function web_cron_est(string $job): float {
    $v = @file_get_contents(web_cron_marker('dur_' . $job));
    return $v === false ? 0.0 : (float)$v;
}

/**
 * Does a job expected to take $est seconds fit, with $spent of $budget gone?
 * The start of a run (under half a second spent) always fits, so a job longer
 * than the whole budget still runs — first, on its own — and nothing starves.
 */
function web_cron_fits(float $spent, float $est, float $budget): bool {
    return $spent < 0.5 || ($spent < $budget && $spent + $est <= $budget);
}

/**
 * Run what is due, within a budget. Most overdue first; at most $netMax jobs
 * that talk to another server; a job whose last run will not fit in what is
 * left waits for a fresh run (the first job of a run always fits, so nothing
 * starves). Returns [job => 'ran'|'error'|'waits'] for what was due, or
 * ['busy' => true] when another run holds the lock.
 */
function web_cron_tick(float $budget, int $netMax): array {
    $t0 = microtime(true);
    $GLOBALS['__web_cron_took'] = [];
    $lock = @fopen(web_cron_dir() . '/.lock', 'c');
    if (!$lock) return [];
    if (!@flock($lock, LOCK_EX | LOCK_NB)) { @fclose($lock); return ['busy' => true]; }
    $out = [];
    try {
        $now = time(); $due = [];
        foreach (web_cron_jobs() as $name => [$every, $fn, $net]) {
            $age = $now - (@filemtime(web_cron_marker($name)) ?: 0);
            if ($age >= $every) $due[$name] = [$age / max(1, $every), $fn, $net];
        }
        uasort($due, static fn($x, $y) => $y[0] <=> $x[0]);
        $nets = 0;
        foreach ($due as $name => [, $fn, $net]) {
            $spent = microtime(true) - $t0;
            if (($net && $nets >= $netMax) || !web_cron_fits($spent, web_cron_est($name), $budget)) { $out[$name] = 'waits'; continue; }
            web_cron_touch($name);                        // claimed before it runs: a second run never doubles it
            if ($net) $nets++;
            $t = microtime(true);
            $ok = web_cron_guard($name, $fn);
            @file_put_contents(web_cron_marker('dur_' . $name), (string)round(microtime(true) - $t, 2));
            $out[$name] = $ok ? 'ran' : 'error';
        }
    } finally { @flock($lock, LOCK_UN); @fclose($lock); }
    web_cron_log_tick($t0, $out);
    return $out;
}

/**
 * Run named jobs now, ignoring their intervals — the admin "run now" path and
 * a scheduler asking for one job. Same lock as the tick, so the two never
 * stampede; 'busy' when a tick holds it. Does NOT detach: the caller waits.
 *
 * $jobs is [name => callable]; returns [name => 'ran'|'error'|'busy'].
 */
function web_cron_run_now(array $jobs): array {
    $out = [];
    $lock = @fopen(web_cron_dir() . '/.lock', 'c');
    if (!$lock || !@flock($lock, LOCK_EX | LOCK_NB)) {
        if ($lock) @fclose($lock);
        return array_fill_keys(array_keys($jobs), 'busy');
    }
    try {
        if (function_exists('set_time_limit')) @set_time_limit(60);
        foreach ($jobs as $name => $fn) {
            web_cron_touch($name);
            $out[$name] = web_cron_guard($name, $fn) ? 'ran' : 'error';
        }
    } finally { @flock($lock, LOCK_UN); @fclose($lock); }
    return $out;
}

/**
 * Hand the finished response back to the client, then keep working.
 *
 * FPM detaches with fastcgi_finish_request, LiteSpeed (most cPanel hosts) with
 * litespeed_finish_request — its fastcgi alias was removed from PHP, and
 * missing it meant the visitor waited for the whole tick (WordPress hit the
 * same with wp-cron, core ticket 54668). Anywhere else — Apache mod_php, CGI,
 * the built-in server — push the bytes out and let Content-Length (see
 * _lib/response.php) tell the browser the body is complete. Every buffer
 * level, not one: output_buffering, mod_deflate and a handler's own can all be
 * open, and popping one of three leaves the response where it was.
 */
function response_detach(): void {
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); return; }
    if (function_exists('litespeed_finish_request')) { @litespeed_finish_request(); return; }
    while (ob_get_level() > 0) { @ob_end_flush(); }
    @flush();
}

/**
 * Run $fn AFTER the response has been sent — for work a user must not wait on
 * and must not be failed by (the registration desk's consent SMS and email,
 * ~45 s of network I/O when both providers are tried). Under CLI (the tests)
 * it runs inline, so it stays observable.
 */
function after_response(string $label, callable $fn): void {
    if (PHP_SAPI === 'cli') {
        try { $fn(); } catch (\Throwable $e) { error_log('[after:' . $label . '] ' . $e->getMessage()); }
        return;
    }
    register_shutdown_function(function () use ($label, $fn) {
        response_detach();
        @ignore_user_abort(true);
        if (function_exists('set_time_limit')) @set_time_limit(60);
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

/** Has the outside scheduler run recently? Then visitors' pages do no background work. */
function web_cron_external_fresh(): bool {
    return time() - (@filemtime(web_cron_marker('external')) ?: 0) < WEB_CRON_EXTERNAL_FRESH;
}

/**
 * The shutdown worker: the FIRST shutdown function on every request (it is
 * registered from bootstrap, ahead of any after_response). It detaches before
 * anything else — that is the whole contract — and then, unless an outside
 * scheduler is doing the work, runs one budgeted tick.
 */
function web_cron_run(): void {
    response_detach();
    try {
        if (web_cron_external_fresh()) return;
        @ignore_user_abort(true);
        if (function_exists('set_time_limit')) @set_time_limit(30);
        web_cron_tick((float)web_cron_cfg('budget', WEB_CRON_BUDGET), 1);
    } catch (Throwable $e) { /* a web-cron tick must never disrupt anything */ }
}

/**
 * A run's log line: every run that took a second or more to the PHP error log,
 * a slow one to the ops screen with what took the time — the evidence for
 * "the site is slow" on a host with no shell.
 */
function web_cron_log_tick(float $t0, array $out): void {
    $took = round(microtime(true) - $t0, 1);
    $jobs = (array)($GLOBALS['__web_cron_took'] ?? []);
    if (!$jobs) return;
    arsort($jobs);
    $waits = count(array_filter($out, static fn($v) => $v === 'waits'));
    $what = implode(', ', array_map(static fn($k, $v) => $k . ' ' . $v . 's', array_keys($jobs), $jobs)) . ($waits ? '; ' . $waits . ' left for the next run' : '');
    if ($took >= 1) error_log('[webcron] run ' . $took . 's: ' . $what);
    if ($took >= WEB_CRON_SLOW && function_exists('ops_record')) ops_record('warn', 'webcron:tick', 'Slow background run', mb_substr($took . 's — ' . $what, 0, 255));
}

/**
 * Run one job, swallowing (and journalling) any failure so the rest still run.
 * The heartbeat row is what turns "nothing happened" into something a screen
 * can say; it is two queries, so it is written at most every ten minutes per
 * job (the marker files answer "has it run" for the health check). A slow job
 * is named on the ops screen. Returns whether it succeeded.
 */
function web_cron_guard(string $label, callable $fn): bool {
    try {
        $t = microtime(true);
        $fn();
        $took = microtime(true) - $t;
        $GLOBALS['__web_cron_took'][$label] = round($took, 1);
        $hb = web_cron_marker('hb_' . $label);
        if (function_exists('ops_record') && time() - (@filemtime($hb) ?: 0) >= 600) { ops_record('cron', $label, 'ran'); @touch($hb); }
        if ($took >= WEB_CRON_SLOW && function_exists('ops_record')) ops_record('warn', 'webcron:' . $label, 'Slow background job', 'took ' . round($took, 1) . 's');
        return true;
    } catch (Throwable $e) {
        error_log('[webcron:' . $label . '] ' . $e->getMessage());
        if (function_exists('ops_record')) ops_record('error', 'webcron:' . $label, $e->getMessage(), basename($e->getFile()) . ':' . $e->getLine());
        return false;
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
    /* Notices BEFORE a charge falls due, the payment-note nudge to the fees
       desk (domain/dues-notices.php). Once a day for the roster scan; nothing
       is ever said twice, whatever the cadence. Guarded on its own. */
    if (function_exists('dues_notices_run')) {
        try { dues_notices_run(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'dues.notices', $e->getMessage()); }
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

    /* Family Portal v3: the monthly report (inbox, to sign) on the first days
     * of a month, and the event and mentor-meeting reminders. Both are keyed
     * so a 15-minute tick sends each one once (domain/family-portal.php). */
    if (function_exists('family_reports_run')) {
        try { family_reports_run(); family_reminders_run(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'family.v3', $e->getMessage()); }
    }

    /* Formal family reports at the end of a session (term) and a Summer School edition, and the day's attendance
       to the staff who run each programme (domain/parent-reports.php). Each send is claimed per recipient, so a
       15-minute tick sends each one once. The monthly report rides family_reports_run above. */
    if (function_exists('preport_session_run')) {
        try { preport_session_run(); preport_edition_run(); attendance_daily_run(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'reports', $e->getMessage()); }
    }

    /* Support cases: solved ones nobody reopened close, and ones waiting on a
     * person who never wrote back are solved with a note (domain/support.php). */
    if (function_exists('support_housekeeping')) {
        try { support_housekeeping(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'support.tidy', $e->getMessage()); }
    }

    /* Bulk acts parked for their undo window (domain/pending.php) whose tab
     * closed before the window ended: commit them here so nothing waits. */
    if (function_exists('pending_commit_due')) {
        try { pending_commit_due(100); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'pending.commit', $e->getMessage()); }
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
                if (function_exists('make_registration_stalled_emit')) make_registration_stalled_emit($s, (int)$ageH);
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
    $n = function_exists('fees_accrue_batch') ? (int)fees_accrue_batch($limit, $cfg)['members'] : 0;
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
    audit_prune();   // sign-in noise past its age only — see AUDIT_NOISE_EVENTS
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
    // Then ask guardians about the absences just logged, and announce any
    // Summer School date that has arrived (domain/make.php). No-ops unless an
    // integration subscribes; guarded inside so a fault costs nothing else.
    if (function_exists('make_run')) make_run();
    /* Locally-held images nothing references any more — a rejected application,
     * a duplicate registration, an original replaced by a retake. The store is
     * write-on-intake and an intake can be refused after the bytes have landed,
     * so without this a shared host's disk quota fills over a season. Bounded,
     * conservative (a week old before it is even a candidate) and it does
     * nothing at all if it cannot read what is referenced. */
    // Copy stored photos out of the folder an update replaces BEFORE sweeping anything.
    if (function_exists('photo_store_secure')) photo_store_secure(500);
    if (function_exists('photo_store_sweep')) photo_store_sweep(7, 200);
    /* Keep the analyst panel warm, so Monday morning reads an answer instead of
     * watching four model calls. Off unless an admin turns it on — this is the
     * one background job that spends money — and a no-op when the numbers have
     * not moved, because the panel is cached against a fingerprint of them. */
    if (function_exists('insight_prewarm')) insight_prewarm();
}
