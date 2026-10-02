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

    /* And whether the images the records point at are still THERE.
     *
     * Nothing in the product could see this. The self-test above answers "can
     * this host keep a photograph", the count before it answers "did one
     * arrive", and between them sits the case that was actually happening: a
     * URL on a row whose file is no longer on disk. The card renders an empty
     * frame, the browser console fills with 404s from photo.php, and nobody can
     * get from one to the other. It had a cause in this file's neighbour — the
     * sweep deleted files it could not see a reference to — and it needs naming
     * even now that is fixed, because the files it already deleted are gone and
     * those children need a retake. */
    if (function_exists('photo_store_broken_refs')) {
        try {
            /* Cached for ten minutes. The scan reads every text column in the
               schema, which is right for a daily sweep and wrong to re-run each
               time somebody opens this page — and the answer does not change
               minute to minute. Refresh reflects it within the window. */
            $br = cache_get('ops.photoLinks', 600);
            if (!is_array($br)) { $br = photo_store_broken_refs(400); cache_put('ops.photoLinks', $br); }
            /* Only when the scan actually ran. A scan that could not enumerate
               the schema knows nothing, and reporting that as "0 of 0 broken"
               would be a red light about nothing — the sweep logs the real
               reason, and it fails closed by deleting nothing. */
            if (!empty($br['scanned'])) {
                $checks['photoLinks'] = ['ok' => !empty($br['ok']), 'checked' => (int)$br['checked'],
                                         'missing' => (int)$br['missing'], 'where' => (array)$br['where']];
            }
        } catch (Throwable $e) { /* a diagnostic must never be the outage */ }
    }

    /* Is the media cloud actually connected?
     *
     * Nothing checked this, and the client is built to survive it being gone:
     * uploadOrInline() catches every upload failure and quietly stores the image
     * in the database instead. That is the right behaviour — a family must be
     * able to register at 9pm whatever Cloudinary is doing — but it means a
     * disconnected cloud looks exactly like a working one from every screen in
     * the product. It was reported as "uploads do not save to Cloudinary
     * anymore", which is the only way anybody could have noticed.
     *
     * So this asks Cloudinary, with the configured credentials, rather than
     * checking that three strings are non-empty. The distinction matters: wrong
     * keys and no keys are different problems with different fixes, and until
     * now both presented as silence. */
    $checks['cloudinary'] = ops_cloudinary_health();

    /* …and whether the fallback is actually firing. The check above can pass at
     * this instant while every upload for a fortnight went to the database —
     * a credit ceiling that has since reset, a key rotated back. Counted from
     * what was STORED, which cannot be argued with. */
    try {
        $r = db_row("SELECT COUNT(*) n, SUM(CASE WHEN photoUrl LIKE 'data:%' OR photoUrl LIKE '/api/public/photo%' THEN 1 ELSE 0 END) local
                     FROM (SELECT photoUrl FROM summer_students WHERE photoUrl != '' ORDER BY id DESC LIMIT 50) t");
        $n = (int)($r['n'] ?? 0); $local = (int)($r['local'] ?? 0);
        if ($n > 0) {
            $checks['photoStorage'] = [
                // Not an error when there is no cloud configured — that is a
                // supported way to run this, and saying "fail" would train
                // people to ignore the panel.
                'ok' => $local === 0 || empty($checks['cloudinary']['configured']),
                'checked' => $n, 'local' => $local,
                'note' => $local > 0 && !empty($checks['cloudinary']['configured'])
                    ? $local . ' of the last ' . $n . ' photographs were kept on this server, not in the cloud'
                    : '',
            ];
        }
    } catch (Throwable $e) { /* not worth a failed health check */ }

    $ok = true;
    foreach ($checks as $c) if (empty($c['ok'])) $ok = false;
    // The cron being quiet is worth showing and not worth paging about at 3am;
    // a read-only database or a schema behind the code is neither.
    $serving = !empty($checks['db']['ok']) && !empty($checks['schema']['ok']);
    return ['ok' => $ok, 'serving' => $serving, 'schema' => $schema, 'checks' => $checks, 'cron' => $cron];
}

/**
 * Ask Cloudinary whether it will actually accept our credentials.
 *
 * Four distinguishable states, because they have four different fixes and until
 * now they all looked the same from the outside:
 *
 *   not_configured  no keys on this host — a supported way to run, photos are
 *                   kept locally on purpose. Reported ok.
 *   unreachable     the network or the proxy, not us.
 *   bad_credentials Cloudinary answered 401 — the keys are wrong or rotated.
 *                   This is the state that reads as "it just stopped working".
 *   exhausted       the credit ceiling. Uploads fail; nothing is misconfigured.
 *   ok              connected, with the usage figure so the next exhaustion is
 *                   visible before it happens rather than after.
 *
 * Cached for five minutes: this runs on every diagnostics load and on the health
 * probe, and an outbound HTTP call on a shared host is not free.
 */
function ops_cloudinary_health(): array {
    $cfg = $GLOBALS['CONFIG']['cloudinary'] ?? [];
    $configured = !empty($cfg['cloud_name']) && !empty($cfg['api_key']) && !empty($cfg['api_secret']);
    if (!$configured) {
        return ['ok' => true, 'configured' => false, 'state' => 'not_configured',
                'detail' => 'No Cloudinary keys on this host — photographs are stored locally.'];
    }
    $cached = cache_get('ops.cloudinary', 300);
    if (is_array($cached)) return $cached;

    $out = ['ok' => false, 'configured' => true, 'state' => 'unknown', 'cloud' => (string)$cfg['cloud_name']];
    // Test seam, so the states above can be exercised without a network.
    if (isset($GLOBALS['__cloudinary_ping_mock']) && is_callable($GLOBALS['__cloudinary_ping_mock'])) {
        $res = ($GLOBALS['__cloudinary_ping_mock'])();
    } elseif (function_exists('curl_init')) {
        $ch = curl_init('https://api.cloudinary.com/v1_1/' . $cfg['cloud_name'] . '/usage');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8,
                                CURLOPT_USERPWD => $cfg['api_key'] . ':' . $cfg['api_secret']]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $res = ['code' => $code, 'body' => is_string($body) ? $body : '', 'error' => $err];
    } else {
        $res = ['code' => 0, 'body' => '', 'error' => 'curl unavailable'];
    }

    $code = (int)($res['code'] ?? 0);
    if ($code === 401 || $code === 403) {
        $out['state'] = 'bad_credentials';
        $out['detail'] = 'Cloudinary refused these keys (HTTP ' . $code . '). Uploads are silently falling back to local storage.';
    } elseif ($code === 420 || $code === 429) {
        $out['state'] = 'exhausted';
        $out['detail'] = 'Cloudinary is rate-limiting or the plan is exhausted (HTTP ' . $code . ').';
    } elseif ($code >= 200 && $code < 300) {
        $d = json_decode((string)($res['body'] ?? ''), true);
        $pct = null;
        if (is_array($d)) {
            foreach (['credits', 'storage', 'bandwidth'] as $k) {
                if (isset($d[$k]['used_percent'])) { $pct = (float)$d[$k]['used_percent']; break; }
            }
        }
        $out['ok'] = true;
        $out['state'] = 'ok';
        $out['usedPercent'] = $pct;
        $out['detail'] = $pct === null ? 'Connected.' : 'Connected — ' . round($pct) . '% of the plan used.';
    } else {
        $out['state'] = 'unreachable';
        $out['detail'] = 'Could not reach Cloudinary' . ($res['error'] ? ': ' . substr((string)$res['error'], 0, 120) : ' (HTTP ' . $code . ').');
    }
    cache_put('ops.cloudinary', $out);
    return $out;
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
