<?php
declare(strict_types=1);

/**
 * Operations — knowing the system is broken before a centre phones to say so.
 *
 * Everything the programme runs on was already correct-or-not; none of it was
 * OBSERVABLE. Handler exceptions went to api/logs/php-error.log, which nobody
 * is going to SSH in and read. The web-cron runs in a shutdown hook that
 * swallows every throwable by design, so if reminders and integration
 * deliveries stopped, they stopped silently. And there was no endpoint an
 * uptime monitor could ask "are you alive AND is the database writable AND is
 * the schema where the code expects it".
 *
 * Three things here, and they are all the same thing: make failure visible.
 */

/** Kinds of journal entry. 'cron' rows are heartbeats, not faults. */
const OPS_KINDS = ['error', 'cron', 'warn'];

/**
 * Record one operational event, rolled up by signature.
 *
 * The roll-up is the design, not an optimisation. A journal that appends per
 * occurrence turns one broken endpoint into tens of thousands of rows in an
 * afternoon — the outage writes a second outage, and the screen meant to
 * explain the first becomes unusable. One row per (kind, source, message)
 * bounds the table by the number of DISTINCT faults, which stays small even
 * when the fault count does not.
 *
 * Never throws: this is called from a catch block and from a shutdown hook,
 * and a journal that can fail the thing it is journalling is worse than none.
 */
function ops_record(string $kind, string $source, string $message = '', string $detail = ''): void {
    try {
        if (!in_array($kind, OPS_KINDS, true)) $kind = 'error';
        $source  = mb_substr(trim($source), 0, 120);
        $message = mb_substr(trim($message), 0, 255);
        $detail  = mb_substr(trim($detail), 0, 255);
        if ($source === '') return;
        $now = now_iso();
        $row = db_row('SELECT id, hits FROM ops_events WHERE kind = ? AND source = ? AND message = ? LIMIT 1',
                      [$kind, $source, $message]);
        if ($row) {
            // clearedAt is reset: an acknowledged fault that happens again is
            // a live fault, not a handled one.
            db_exec('UPDATE ops_events SET hits = hits + 1, lastAt = ?, detail = ?, clearedAt = ? WHERE id = ?',
                    [$now, $detail, '', (int)$row['id']]);
        } else {
            db_insert('ops_events', ['kind' => $kind, 'source' => $source, 'message' => $message,
                'detail' => $detail, 'hits' => 1, 'firstAt' => $now, 'lastAt' => $now, 'clearedAt' => '']);
        }
    } catch (Throwable $e) { /* journalling must never break the caller */ }
}

/* ── Health ──────────────────────────────────────────────────────────────────
 * What an uptime monitor needs, and only that. "200 OK from the web server"
 * says nothing: the interesting failures are a read-only database after a disk
 * fills, and code deployed ahead of its migrations.
 */

/** Seconds since each background job last ran, or null if it never has. */
function ops_cron_ages(): array {
    $out = [];
    foreach (['deliver' => 60, 'reminders' => 900, 'maint' => 3600] as $job => $interval) {
        $marker = web_cron_dir() . '/' . $job . '.at';
        $at = @filemtime($marker) ?: 0;
        $out[$job] = ['interval' => web_cron_cfg($job, $interval), 'ageSeconds' => $at ? max(0, time() - $at) : null];
    }
    return $out;
}

/**
 * Is the system actually serving?
 *
 * Deliberately writes, not just reads. A full disk or a read-only mount leaves
 * SELECT working perfectly while every registration silently fails — the exact
 * failure a read-only check would miss and report as healthy.
 */
function ops_health(): array {
    $checks = [];
    $schema = null;
    try {
        $schema = (int)(db_row('SELECT MAX(version) v FROM schema_version')['v'] ?? 0);
        $checks['schema'] = $schema === NGG_SCHEMA_TARGET
            ? ['ok' => true, 'at' => $schema]
            : ['ok' => false, 'at' => $schema, 'want' => NGG_SCHEMA_TARGET];
    } catch (Throwable $e) {
        $checks['schema'] = ['ok' => false, 'error' => 'unreadable'];
    }
    try {
        // A no-op write against a table that is pruned anyway, so the probe
        // leaves nothing behind to grow.
        db_exec("UPDATE ops_events SET lastAt = lastAt WHERE id = -1");
        $checks['db'] = ['ok' => true, 'mode' => 'rw'];
    } catch (Throwable $e) {
        $checks['db'] = ['ok' => false, 'mode' => 'ro'];
    }
    $cron = ops_cron_ages();
    /* A job is stale at ten times its own interval — long enough that a quiet
     * hour on a small deployment does not raise a false alarm, short enough to
     * catch a cron that has genuinely stopped. Never-run is not stale: a fresh
     * install has not failed at anything yet. */
    $stale = [];
    foreach ($cron as $job => $c) {
        if ($c['ageSeconds'] !== null && $c['ageSeconds'] > $c['interval'] * 10) $stale[] = $job;
    }
    $checks['cron'] = $stale ? ['ok' => false, 'stale' => $stale] : ['ok' => true];

    /* Can this host actually keep a photograph?
     *
     * Every headshot on a deployment without Cloudinary is written to disk, and
     * "the web user cannot write to a directory you uploaded" is the commonest
     * way a PHP deploy is broken. The symptom is a blank frame on the review
     * desk, which is indistinguishable from a family sending no photo — so it
     * was reported as "photos don't display" with nothing to go on.
     *
     * A real round trip, so the answer is about this host and not about the
     * code. Degraded (writing to the cache fallback) is reported as NOT ok:
     * photos are being kept, but somewhere they should not have to be. */
    if (function_exists('photo_store_selftest')) {
        try {
            $ps = photo_store_selftest();
            $checks['photos'] = [
                'ok' => !empty($ps['ok']) && ($ps['where'] ?? '') === 'storage',
                'writable' => !empty($ps['writable']),
                'where' => (string)($ps['where'] ?? ''),
                'dir' => (string)($ps['dir'] ?? ''),
                'files' => (int)($ps['files'] ?? 0),
                'bytes' => (int)($ps['bytes'] ?? 0),
            ] + (empty($ps['ok']) ? ['stage' => (string)($ps['stage'] ?? ''), 'error' => (string)($ps['error'] ?? '')] : []);
        } catch (Throwable $e) {
            $checks['photos'] = ['ok' => false, 'error' => 'selftest_failed'];
        }
    }
    /* And whether it IS happening — the self-test can pass while real
     * submissions are still arriving without a photo (a cloud that refuses, a
     * body truncated in front of PHP). Counted over recent self-registrations,
     * which are the ones that always send one. */
    try {
        $r = db_row("SELECT COUNT(*) n, SUM(CASE WHEN photoUrl = '' THEN 1 ELSE 0 END) blank
                     FROM (SELECT photoUrl FROM summer_students WHERE submittedVia != '' ORDER BY id DESC LIMIT 50) t");
        $n = (int)($r['n'] ?? 0); $blank = (int)($r['blank'] ?? 0);
        if ($n > 0) $checks['photosOnRecord'] = ['ok' => $blank === 0, 'checked' => $n, 'missing' => $blank];
    } catch (Throwable $e) { /* not worth a failed health check */ }

    $ok = true;
    foreach ($checks as $c) if (empty($c['ok'])) $ok = false;
    // The cron being quiet is worth showing and not worth paging about at 3am;
    // a read-only database or a schema behind the code is neither.
    $serving = !empty($checks['db']['ok']) && !empty($checks['schema']['ok']);
    return ['ok' => $ok, 'serving' => $serving, 'schema' => $schema, 'checks' => $checks, 'cron' => $cron];
}

/** The public probe payload — enough for a monitor, nothing about the people
 *  in the database and nothing an attacker can use to fingerprint a version. */
function ops_health_public(): array {
    $h = ops_health();
    return ['ok' => $h['serving'], 'db' => $h['checks']['db']['ok'] ?? false,
            'schema' => !empty($h['checks']['schema']['ok']), 'cron' => !empty($h['checks']['cron']['ok'])];
}

/* ── The admin view ──────────────────────────────────────────────────────── */

function admin_ops_status(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $h = ops_health();
    $open = db_all("SELECT id, kind, source, message, detail, hits, firstAt, lastAt
                    FROM ops_events WHERE clearedAt = '' ORDER BY lastAt DESC LIMIT 60");
    $cleared = (int)(db_row("SELECT COUNT(*) c FROM ops_events WHERE clearedAt != ''")['c'] ?? 0);
    $day = gmdate('Y-m-d\TH:i:s\Z', time() - 86400);
    $errors24h = (int)(db_row("SELECT COALESCE(SUM(hits),0) c FROM ops_events WHERE kind = 'error' AND lastAt >= ?", [$day])['c'] ?? 0);
    foreach ($open as &$r) { $r['hits'] = (int)$r['hits']; }
    unset($r);
    return ['ok' => true, 'health' => $h, 'events' => $open, 'clearedCount' => $cleared,
        'errors24h' => $errors24h,
        // The build the SERVER is running. A stale bundle in a browser and a
        // stale deploy on the host look identical from a support call.
        'build' => (string)($GLOBALS['CONFIG']['build_id'] ?? ''),
        'schemaTarget' => NGG_SCHEMA_TARGET];
}

/** Acknowledge a fault — "seen, dealt with". Recurrence un-clears it, so this
 *  cannot be used to permanently silence something that is still happening. */
function admin_ops_clear(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    if ($id > 0) {
        if (!db_row('SELECT id FROM ops_events WHERE id = ? LIMIT 1', [$id])) return ['ok' => false, 'error' => 'not_found'];
        db_exec('UPDATE ops_events SET clearedAt = ? WHERE id = ?', [now_iso(), $id]);
        $n = 1;
    } else {
        $n = (int)(db_row("SELECT COUNT(*) c FROM ops_events WHERE clearedAt = ''")['c'] ?? 0);
        db_exec("UPDATE ops_events SET clearedAt = ? WHERE clearedAt = ''", [now_iso()]);
    }
    audit('ops.clear', (string)$g['requester']['memberId'], (string)$id, ['cleared' => $n], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'cleared' => $n];
}

/**
 * Run a background job now, from the browser.
 *
 * The web-cron is driven by ordinary traffic, so on a quiet host — or one where
 * an admin has just changed something and wants it to take effect this minute —
 * a job can sit un-run for its whole interval. This lets an admin kick one (or
 * all) by hand instead of waiting, or refreshing the site to generate traffic.
 * Same lock as the tick, so it can never stampede an in-flight run.
 */
function admin_ops_run_cron(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $map = [
        'deliver'   => fn() => deliveries_dispatch(50),
        'reminders' => fn() => web_cron_reminders(),
        'maint'     => fn() => web_cron_maintenance(),
    ];
    $job = (string)($p['job'] ?? 'all');
    if ($job !== 'all' && !isset($map[$job])) return ['ok' => false, 'error' => 'unknown_job'];
    $sel = $job === 'all' ? $map : [$job => $map[$job]];
    $ran = web_cron_run_now($sel);
    audit('ops.run_cron', (string)$g['requester']['memberId'], $job, $ran, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ran' => $ran, 'cron' => ops_cron_ages()];
}

/** Drop journal rows that have been acknowledged and have not recurred.
 *  Called from maintenance; bounded so the table cannot creep. */
function ops_prune(int $days = 30): int {
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - $days * 86400);
    try {
        $n = (int)(db_row("SELECT COUNT(*) c FROM ops_events WHERE clearedAt != '' AND lastAt < ?", [$cut])['c'] ?? 0);
        db_exec("DELETE FROM ops_events WHERE clearedAt != '' AND lastAt < ?", [$cut]);
        return $n;
    } catch (Throwable $e) { return 0; }
}
