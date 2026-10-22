<?php
declare(strict_types=1);

/**
 * Media storage — watching, protecting and slimming what Cloudinary holds.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The Cloudinary plan ran towards its limit and the site never said so: the
 * owner found out from Cloudinary's own dashboard. The usage check that existed
 * (cloudinary_refresh_usage) was called by nothing but the test suite, and the
 * Control Room's "Image service" line read "Operational" at 99% because it only
 * asked whether Cloudinary answered. Meanwhile every headshot, avatar, cover,
 * proof and submission was stored as the phone's full-size original.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 *   Watch    media_usage_refresh() reads Cloudinary's /usage (credits, storage,
 *            bandwidth, transformations) every few hours from the web-cron and
 *            on demand, keeps the breakdown, and decides a LEVEL.
 *   Tell     Crossing a level upwards alerts the people who can act — the
 *            intake inbox and every staff member with `settings` — once per
 *            level, and the Control Room shows the level and the numbers.
 *   Protect  At `critical` no new upload is signed (media_uploads_allowed), so
 *            the plan is not tipped over; photos fall back to the site's own
 *            store (photos.php) and other uploads say plainly why they cannot
 *            go. From `high`, the paid AI photo transforms stop.
 *   Slim     media_incoming_transformation() is signed into every image
 *            upload, so Cloudinary stores a capped, compressed image instead of
 *            the raw original. media_purge_derived() deletes derived copies —
 *            regenerated on demand — to win storage back now.
 */

/* Percent of the plan used at which each level starts. Credits are the plan's
 * real ceiling on Cloudinary's free and Plus tiers (storage, bandwidth and
 * transformations all draw on them); on a plan that reports parts separately,
 * the worst part decides. */
const MEDIA_LEVELS = ['warn' => 70, 'high' => 85, 'critical' => 95];
const MEDIA_LEVEL_ORDER = ['ok' => 0, 'warn' => 1, 'high' => 2, 'critical' => 3];
const MEDIA_REFRESH_SECONDS = 21600;          // web-cron cadence (6h); an admin can refresh at once
const MEDIA_PURGE_ROUNDS = 10;                // derived-purge calls per press (Cloudinary deletes ≤1000 a call)

function media_cfg(): array { return (array)($GLOBALS['CONFIG']['cloudinary'] ?? []); }
function media_configured(): bool {
    $c = media_cfg();
    return !empty($c['cloud_name']) && !empty($c['api_key']) && !empty($c['api_secret']);
}

/* ── Two accounts: failover to a backup when the main one runs low ──────────
   The main account's keys stay in $CONFIG['cloudinary']; the backup's sit in
   $CONFIG['cloudinary']['backup'] (Settings → API keys). Which one is live is
   one setting, `cloudinary_active`. While the backup is live its three keys
   are laid over the main ones, so every caller — uploads, edits, the usage
   monitor — reaches it with no change of its own. Photos already on the main
   account keep their URLs and keep showing. */

/** The backup account's keys, or [] when any of the three is missing. */
function cloudinary_backup_cfg(): array {
    $b = (array)((($GLOBALS['CLOUDINARY_PRIMARY'] ?? $GLOBALS['CONFIG']['cloudinary'] ?? [])['backup']) ?? []);
    return !empty($b['cloud_name']) && !empty($b['api_key']) && !empty($b['api_secret']) ? $b : [];
}
/** 'primary' or 'backup': which account new work goes to. */
function cloudinary_active(): string {
    return function_exists('setting_raw') && setting_raw('cloudinary_active') === 'backup' && cloudinary_backup_cfg() ? 'backup' : 'primary';
}
/** Lay the live account's keys into $CONFIG['cloudinary']. Idempotent; runs after the API keys are applied. */
function cloudinary_account_apply(): void {
    if (!isset($GLOBALS['CLOUDINARY_PRIMARY'])) $GLOBALS['CLOUDINARY_PRIMARY'] = (array)($GLOBALS['CONFIG']['cloudinary'] ?? []);
    $p = $GLOBALS['CLOUDINARY_PRIMARY'];
    $GLOBALS['CONFIG']['cloudinary'] = cloudinary_active() === 'backup'
        ? array_merge($p, array_intersect_key(cloudinary_backup_cfg(), ['cloud_name' => 1, 'api_key' => 1, 'api_secret' => 1])) : $p;
}
/** Run $fn with one account's keys live, whichever is active; restores after. */
function cloudinary_with_account(string $which, callable $fn) {
    $saved = $GLOBALS['CONFIG']['cloudinary'] ?? [];
    if (!isset($GLOBALS['CLOUDINARY_PRIMARY'])) cloudinary_account_apply();
    $p = $GLOBALS['CLOUDINARY_PRIMARY'];
    $GLOBALS['CONFIG']['cloudinary'] = $which === 'backup' ? array_merge($p, array_intersect_key(cloudinary_backup_cfg(), ['cloud_name' => 1, 'api_key' => 1, 'api_secret' => 1])) : $p;
    try { return $fn(); } finally { $GLOBALS['CONFIG']['cloudinary'] = $saved; }
}
/** Switch the live account, tell the people who run it, and record it. */
function cloudinary_switch(string $to, string $why): bool {
    if ($to === 'backup' && !cloudinary_backup_cfg()) return false;
    if (cloudinary_active() === $to) return false;
    setting_set('cloudinary_active', $to, 'system');
    cloudinary_account_apply();
    $title = $to === 'backup' ? 'Cloudinary: switched to the backup account' : 'Cloudinary: back on the main account';
    $body = $to === 'backup' ? 'The main account ' . $why . '. New photos and edits now go to the backup account; photos already on the main one keep showing.'
                             : 'The main account ' . $why . ', so new work goes there again.';
    if (function_exists('ops_record')) ops_record('warn', 'media.storage', $title, $body);
    if (function_exists('intake_admin_alert')) intake_admin_alert('[NGG] ' . $title, ['title' => $title, 'intro' => $body, 'bodyHtml' => '<p>' . esc_html($body) . '</p>', 'footNote' => 'Automatic alert from the media storage monitor.']);
    audit('media.storage.switch', null, $to, ['why' => $why], '');
    return true;
}
/** The main account refused work (credits spent): move to the backup now rather than at the next check. */
function cloudinary_failover(string $why): bool {
    return cloudinary_active() === 'primary' && cloudinary_switch('backup', $why);
}
/** The cloud name a res.cloudinary.com URL lives on ('' for anything else). */
function cloudinary_cloud_of(string $url): string {
    return preg_match('#^https://res\.cloudinary\.com/([^/]+)/#', $url, $m) ? $m[1] : '';
}

/** Cloudinary Admin API call. Test seam: $GLOBALS['__media_api_mock'] = fn($method, $path, $query) => ['code'=>…, 'body'=>array]. */
function media_api(string $method, string $path, array $query = []): array {
    if (isset($GLOBALS['__media_api_mock']) && is_callable($GLOBALS['__media_api_mock'])) return ($GLOBALS['__media_api_mock'])($method, $path, $query);
    if (!media_configured() || !function_exists('curl_init')) return ['code' => 0, 'body' => null, 'error' => 'not_configured'];
    $c = media_cfg();
    $url = 'https://api.cloudinary.com/v1_1/' . rawurlencode((string)$c['cloud_name']) . $path . ($query ? '?' . http_build_query($query) : '');
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CUSTOMREQUEST => $method,
                            CURLOPT_USERPWD => $c['api_key'] . ':' . $c['api_secret']]);
    $out = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    return ['code' => $code, 'body' => is_string($out) ? json_decode($out, true) : null, 'error' => $err];
}

/** The level a percentage falls in. */
function media_level_for(?float $pct): string {
    if ($pct === null) return 'ok';
    foreach (['critical', 'high', 'warn'] as $l) if ($pct >= MEDIA_LEVELS[$l]) return $l;
    return 'ok';
}

/** One part of the /usage answer as {usage, limit, pct}; null when Cloudinary does not report it. */
function media_part(array $j, string $k): ?array {
    if (!isset($j[$k]) || !is_array($j[$k])) return null;
    $u = (float)($j[$k]['usage'] ?? 0); $l = (float)($j[$k]['limit'] ?? 0);
    $pct = isset($j[$k]['used_percent']) ? (float)$j[$k]['used_percent'] : ($l > 0 ? $u / $l * 100 : null);
    return ['usage' => $u, 'limit' => $l, 'pct' => $pct === null ? null : round($pct, 1)];
}

/** The cached state, as the Control Room reads it. Never calls out. */
function media_usage_state(): array {
    $s = function_exists('setting_get') ? setting_get('media.usage') : null;
    $base = ['configured' => media_configured(), 'level' => 'ok', 'pct' => null, 'parts' => [], 'checkedAt' => '', 'error' => ''];
    return is_array($s) ? $s + $base : $base;
}

/** May a new upload go to Cloudinary right now? */
function media_uploads_allowed(): bool {
    return media_usage_state()['level'] !== 'critical';
}

/** Read /usage, keep the breakdown, alert on a rise. $force skips the cadence. */
function media_usage_refresh(bool $force = false): array {
    if (!media_configured()) return media_usage_state();
    $prev = media_usage_state();
    if (!$force && $prev['checkedAt'] !== '' && time() - strtotime((string)$prev['checkedAt']) < MEDIA_REFRESH_SECONDS - 60) return $prev;
    $r = media_api('GET', '/usage');
    $code = (int)($r['code'] ?? 0);
    $state = ['configured' => true, 'checkedAt' => gmdate('c'), 'error' => '', 'parts' => [], 'pct' => null, 'level' => 'ok', 'plan' => ''];
    if ($code === 420 || $code === 429) {
        // Cloudinary is refusing work: the plan is spent. That is critical whatever the last reading said.
        $state['pct'] = 100.0; $state['level'] = 'critical'; $state['error'] = 'Cloudinary refused the request (HTTP ' . $code . '): the plan limit has been reached.';
    } elseif ($code >= 200 && $code < 300 && is_array($r['body'])) {
        $j = $r['body'];
        foreach (['credits', 'storage', 'bandwidth', 'transformations'] as $k) if ($p = media_part($j, $k)) $state['parts'][$k] = $p;
        $state['plan'] = (string)($j['plan'] ?? '');
        $state['objects'] = (int)($j['resources'] ?? ($j['objects']['usage'] ?? 0));
        // The worst part decides: credits on a credit plan, else storage, bandwidth or transformations.
        $pcts = array_values(array_filter(array_map(static fn($p) => $p['pct'], $state['parts']), static fn($v) => $v !== null));
        $state['pct'] = $pcts ? max($pcts) : null;
        $state['level'] = media_level_for($state['pct']);
    } else {
        // Unreachable or refused credentials: keep the last known level, say what happened.
        $state = ['checkedAt' => gmdate('c'), 'error' => 'Could not read Cloudinary usage (HTTP ' . $code . ').'] + $prev;
    }
    setting_set('media.usage', $state, 'system');
    // The older flags the photo pipeline reads: from `high`, the paid AI transforms stop.
    setting_set('cloudinary_credits', MEDIA_LEVEL_ORDER[$state['level']] >= MEDIA_LEVEL_ORDER['high'] ? 'exhausted' : 'ok', 'system');
    if ($state['pct'] !== null) setting_set('cloudinary_credits_pct', (string)(int)round((float)$state['pct']), 'system');
    if (MEDIA_LEVEL_ORDER[$state['level']] > MEDIA_LEVEL_ORDER[$prev['level'] ?? 'ok']) media_alert($state);
    // Two accounts: from `high` on the main one, the backup takes over; when the main one renews, it comes back.
    if (cloudinary_backup_cfg()) {
        if (cloudinary_active() === 'primary' && MEDIA_LEVEL_ORDER[$state['level']] >= MEDIA_LEVEL_ORDER['high']) {
            if (cloudinary_switch('backup', 'is ' . ($state['pct'] === null ? 'out of' : round((float)$state['pct']) . '% through its') . ' credits')) return media_usage_refresh(true);
        } elseif (cloudinary_active() === 'backup' && empty($GLOBALS['__media_probe'])) {
            $GLOBALS['__media_probe'] = true;
            try {
                $r = cloudinary_with_account('primary', fn() => media_api('GET', '/usage'));
                $code = (int)($r['code'] ?? 0);
                if ($code >= 200 && $code < 300 && is_array($r['body'])) {
                    $pc = array_values(array_filter(array_map(static fn($k) => ($p = media_part($r['body'], $k)) ? $p['pct'] : null, ['credits', 'storage', 'bandwidth', 'transformations']), static fn($v) => $v !== null));
                    if (MEDIA_LEVEL_ORDER[media_level_for($pc ? max($pc) : null)] < MEDIA_LEVEL_ORDER['high'] && cloudinary_switch('primary', 'has credits again')) return media_usage_refresh(true);
                }
            } finally { unset($GLOBALS['__media_probe']); }
        }
    }
    $state['account'] = cloudinary_active();
    setting_set('media.usage', $state, 'system');
    return $state;
}

/** Who is told, once per level reached: the intake inbox and every staff member who holds `settings`. */
function media_alert(array $state): void {
    $pct = $state['pct'] === null ? '?' : (string)round((float)$state['pct']);
    $what = ['warn' => 'is over ' . MEDIA_LEVELS['warn'] . '% used', 'high' => 'is over ' . MEDIA_LEVELS['high'] . '% used — AI photo edits have stopped',
             'critical' => 'is full — new uploads are paused and photos are being stored on the site instead'][$state['level']] ?? 'needs attention';
    $title = 'Cloudinary storage ' . $what . ' (' . $pct . '%)';
    $lines = [];
    foreach ($state['parts'] as $k => $p) $lines[] = ucfirst($k) . ': ' . ($p['pct'] === null ? 'n/a' : $p['pct'] . '%');
    $html = '<p>' . esc_html($title) . '.</p>' . ($lines ? '<p>' . esc_html(implode(' · ', $lines)) . '</p>' : '')
          . '<p>Open the Control Room → Settings → Diagnostics → Image storage to see the breakdown and free space.</p>';
    if (function_exists('ops_record')) ops_record($state['level'] === 'warn' ? 'warn' : 'error', 'media.storage', 'Cloudinary ' . $state['level'], $title);
    if (function_exists('intake_admin_alert')) intake_admin_alert('[NGG] ' . $title, ['title' => $title, 'intro' => 'Your image storage needs attention.', 'bodyHtml' => $html, 'footNote' => 'Automatic alert from the media storage monitor.']);
    foreach (db_all("SELECT * FROM members WHERE status = 'active' AND COALESCE(role,'') NOT IN ('', 'member')") as $m) {
        if (!in_array('settings', member_effective_caps($m), true)) continue;
        if (function_exists('push_notification')) push_notification((string)$m['memberId'], ['kind' => 'system', 'title' => $title, 'body' => 'Open Diagnostics → Image storage.', 'linkPage' => 'admin']);
        if (filter_var((string)($m['email'] ?? ''), FILTER_VALIDATE_EMAIL) && function_exists('send_mail')) { try { send_mail((string)$m['email'], '[NGG] ' . $title, $html); } catch (\Throwable $e) {} }
    }
    audit('media.storage.alert', null, $state['level'], ['pct' => $state['pct']], '');
}

/**
 * The incoming transformation signed into an image upload: Cloudinary applies
 * it BEFORE storing, so what is kept is the capped, compressed image and the
 * raw phone original is never stored. Sized per kind for what it is used for —
 * a headshot prints on a 54mm card, so 1200px is well past 300 DPI. No format
 * change: the card printer and PDF export read JPEG and PNG.
 */
function media_incoming_transformation(string $kind): string {
    $max = ['headshot' => 1200, 'avatar' => 800, 'cover' => 2000][$kind] ?? 1600;
    return 'c_limit,w_' . $max . ',h_' . $max . ',q_auto:good';
}

/** The refusal an upload signer returns when storage is full. */
function media_full_refusal(): array {
    return ['ok' => false, 'error' => 'media_storage_full',
            'detail' => 'Image storage is full, so new uploads are paused. Photos are kept on the site instead; for other files, ask an administrator to free space.'];
}

/* ── Ops ──────────────────────────────────────────────────────────────────── */

/** admin.media.usage — the breakdown; `refresh` reads Cloudinary now. */
function admin_media_usage(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $s = !empty($p['refresh']) ? media_usage_refresh(true) : media_usage_state();
    /* Where a NEW upload goes: the bucket when one is set (object-store.php) — then
       Cloudinary's plan no longer decides whether uploads may go. */
    $store = store_configured() ? ['bucket' => store_bucket(), 'host' => store_public_host(), 'endpointHost' => strtolower((string)parse_url(store_endpoint(), PHP_URL_HOST))] : null;
    return ['ok' => true, 'usage' => $s, 'levels' => MEDIA_LEVELS, 'store' => $store, 'uploadsTo' => $store ? 'bucket' : (media_configured() ? 'cloudinary' : 'server'),
            'uploadsAllowed' => $store ? true : $s['level'] !== 'critical'];
}

/**
 * admin.media.purgeDerived — delete every derived copy (resized, cropped,
 * reformatted versions Cloudinary made on request), keeping every original.
 * They are regenerated the next time a page asks for one, so this costs some
 * transformations later and frees their storage now. Needs `settings` and a
 * typed confirmation; one audit event with the count.
 */
function admin_media_purge_derived(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    if (trim((string)($p['confirm'] ?? '')) !== 'FREE SPACE') return ['ok' => false, 'error' => 'confirm_required', 'detail' => 'Type FREE SPACE to confirm.'];
    if (!media_configured()) return ['ok' => false, 'error' => 'not_configured'];
    /* A photo still on a record as a background-removal chain would be cut out
       again — 75 transformations each — the next time any page shows it, so
       freeing space would spend more than it saves. Store those photos as plain
       images first (System → Photos → Store edited photos). */
    if (function_exists('admin_photos_materialise') && empty($p['force'])) {
        $n = 0;
        foreach ([['members'], ['volunteers'], ['summer_students']] as [$tbl]) {
            $n += (int)(db_row("SELECT COUNT(*) c FROM {$tbl} WHERE photoUrl LIKE '%res.cloudinary.com/%e_background_removal%'")['c'] ?? 0);
        }
        if ($n > 0) return ['ok' => false, 'error' => 'chained_photos', 'count' => $n,
            'detail' => $n . ' photo' . ($n === 1 ? ' is' : 's are') . ' still an edit with the background removed. Freeing space now would make Cloudinary remove each background again (75 credits’ worth of work each). Store them as plain images first.'];
    }
    $deleted = 0; $partial = false; $errors = [];
    foreach (['image', 'video'] as $rt) {
        for ($i = 0; $i < MEDIA_PURGE_ROUNDS; $i++) {
            $r = media_api('DELETE', '/resources/' . $rt . '/upload', ['all' => 'true', 'keep_original' => 'true']);
            if ((int)$r['code'] < 200 || (int)$r['code'] >= 300) { $errors[] = $rt . ': HTTP ' . (int)$r['code']; break; }
            $deleted += is_array($r['body']['deleted'] ?? null) ? count($r['body']['deleted']) : 0;
            $partial = !empty($r['body']['partial']);
            if (!$partial) break;
        }
    }
    audit('media.purge_derived', (string)$g['requester']['memberId'], '', ['deleted' => $deleted, 'partial' => $partial, 'errors' => $errors], (string)($p['ip'] ?? ''));
    $after = media_usage_refresh(true);
    return ['ok' => $errors === [], 'deleted' => $deleted, 'more' => $partial, 'errors' => $errors, 'usage' => $after];
}
