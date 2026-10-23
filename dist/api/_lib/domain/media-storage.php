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

/** The account uploads go to now (media_activate() puts it in the config). */
function media_cfg(): array { return (array)($GLOBALS['CONFIG']['cloudinary'] ?? []); }
function media_configured(): bool {
    $c = media_cfg();
    return !empty($c['cloud_name']) && !empty($c['api_key']) && !empty($c['api_secret']);
}

/** Cloudinary Admin API call, on one account (default: the one uploads go to).
 *  Test seam: $GLOBALS['__media_api_mock'] = fn($method, $path, $query, $accountId) => ['code'=>…, 'body'=>array]. */
function media_api(string $method, string $path, array $query = [], ?array $acc = null): array {
    if (isset($GLOBALS['__media_api_mock']) && is_callable($GLOBALS['__media_api_mock'])) {
        // The account's keys are live while the mock answers, as they would be for the real call.
        return $acc ? cloudinary_with_account((string)$acc['id'], fn() => ($GLOBALS['__media_api_mock'])($method, $path, $query, (string)$acc['id']))
                    : ($GLOBALS['__media_api_mock'])($method, $path, $query, media_active_id());
    }
    $c = $acc ?? media_cfg();
    if (empty($c['cloud_name']) || empty($c['api_key']) || empty($c['api_secret']) || !function_exists('curl_init')) return ['code' => 0, 'body' => null, 'error' => 'not_configured'];
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

/** The cached state of one account (default: the one uploads go to). Never calls out. */
function media_usage_state(?string $accountId = null): array {
    $id = $accountId ?? media_active_id();
    $s = media_state_raw($id);
    $base = ['configured' => media_configured(), 'level' => 'ok', 'pct' => null, 'parts' => [], 'checkedAt' => '', 'error' => ''];
    $out = is_array($s) ? $s + $base : $base;
    if ($accountId === null && count(media_accounts()) > 1) {
        $acc = media_account($id);
        $out['account'] = $id;
        $out['accountLabel'] = $acc ? $acc['label'] : '';
        $out['accounts'] = count(media_accounts());
    }
    return $out;
}
function media_state_raw(string $id): ?array {
    if (!function_exists('setting_get')) return null;
    if ($id === 'primary') { $s = setting_get('media.usage'); $s = is_array($s) ? $s : null; }
    else { $all = setting_get('media.usage.accounts'); $s = is_array($all) && is_array($all[$id] ?? null) ? $all[$id] : null; }
    // The reading taken in this request, as it was taken (a stored float can come back an int) — while it is still the stored one.
    $mem = $GLOBALS['__media_states'][$id] ?? null;
    return $s !== null && $mem !== null && ($mem['checkedAt'] ?? '') === ($s['checkedAt'] ?? '') ? $mem : $s;
}
function media_state_put(string $id, array $state): void {
    $GLOBALS['__media_states'][$id] = $state;
    if ($id === 'primary') { setting_set('media.usage', $state, 'system'); return; }
    $all = setting_get('media.usage.accounts'); $all = is_array($all) ? $all : [];
    $all[$id] = $state;
    setting_set('media.usage.accounts', $all, 'system');
}

/** May a new upload go to Cloudinary right now? Yes while any account has room. */
function media_uploads_allowed(): bool {
    $accs = media_accounts();
    if (!$accs) return media_usage_state('primary')['level'] !== 'critical';
    foreach ($accs as $a) if ((media_state_raw($a['id'])['level'] ?? 'ok') !== 'critical') return true;
    return false;
}

/** Read /usage on every account, keep each breakdown, alert on a rise, and
 *  move uploads to the next account with room. $force skips the cadence.
 *  Returns the state of the account uploads now go to. */
function media_usage_refresh(bool $force = false): array {
    $accs = media_accounts();
    if (!$accs) return media_usage_state();
    foreach ($accs as $a) media_usage_refresh_one($a, $force);
    $was = media_active_id();
    media_activate();
    $now = media_active_id();
    if ($now !== $was) {
        $st = media_state_raw($was) ?? [];
        media_switch_notice($was, $now, $now === 'primary' ? 'has credits again'
            : 'is ' . (($st['pct'] ?? null) === null ? 'out of' : round((float)$st['pct']) . '% through its') . ' credits');
    }
    return media_usage_state();
}

/** One account's /usage read. */
function media_usage_refresh_one(array $acc, bool $force): array {
    $id = (string)$acc['id'];
    $prev = media_usage_state($id);
    if (!$force && $prev['checkedAt'] !== '' && time() - strtotime((string)$prev['checkedAt']) < MEDIA_REFRESH_SECONDS - 60) return $prev;
    $r = media_api('GET', '/usage', [], $acc);
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
    media_state_put($id, $state);
    if (MEDIA_LEVEL_ORDER[$state['level']] > MEDIA_LEVEL_ORDER[$prev['level'] ?? 'ok']) media_alert($state, $acc);
    media_credit_flags();
    return $state;
}

/* The older flags the photo pipeline reads: from `high`, the paid AI
   transforms stop. With several accounts they follow the one uploads go to:
   an edit is made where the photo is uploaded. */
function media_credit_flags(): void {
    $s = media_state_raw(media_pick_id() ?? 'primary') ?? [];
    $level = (string)($s['level'] ?? 'ok');
    setting_set('cloudinary_credits', MEDIA_LEVEL_ORDER[$level] >= MEDIA_LEVEL_ORDER['high'] ? 'exhausted' : 'ok', 'system');
    if (($s['pct'] ?? null) !== null) setting_set('cloudinary_credits_pct', (string)(int)round((float)$s['pct']), 'system');
}

/** Who is told, once per level reached: the intake inbox and every staff member who holds `settings`. */
function media_alert(array $state, ?array $acc = null): void {
    $pct = $state['pct'] === null ? '?' : (string)round((float)$state['pct']);
    $multi = count(media_accounts()) > 1;
    // With another account to move to, a full one is not a pause: say where uploads go now.
    $next = null;
    if ($multi && MEDIA_LEVEL_ORDER[$state['level']] >= MEDIA_LEVEL_ORDER['high']) {
        foreach (media_accounts() as $a) if ($acc && $a['id'] !== $acc['id'] && MEDIA_LEVEL_ORDER[(string)(media_state_raw($a['id'])['level'] ?? 'ok')] < MEDIA_LEVEL_ORDER['high']) { $next = $a; break; }
    }
    $what = ['warn' => 'is over ' . MEDIA_LEVELS['warn'] . '% used',
             'high' => 'is over ' . MEDIA_LEVELS['high'] . '% used — ' . ($next ? 'new uploads now go to ' . $next['label'] : 'AI photo edits have stopped'),
             'critical' => 'is full — ' . ($next ? 'new uploads now go to ' . $next['label'] : 'new uploads are paused and photos are being stored on the site instead')][$state['level']] ?? 'needs attention';
    $title = 'Cloudinary ' . ($multi && $acc ? '(' . $acc['label'] . ') ' : 'storage ') . $what . ' (' . $pct . '%)';
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
    audit('media.storage.alert', null, $state['level'], ['pct' => $state['pct'], 'account' => $acc ? $acc['id'] : 'primary'], '');
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
    // Every account: a derived copy costs storage wherever it is.
    $multi = count(media_accounts()) > 1;
    foreach (media_accounts() as $acc) foreach (['image', 'video'] as $rt) {
        for ($i = 0; $i < MEDIA_PURGE_ROUNDS; $i++) {
            $r = media_api('DELETE', '/resources/' . $rt . '/upload', ['all' => 'true', 'keep_original' => 'true'], $acc);
            if ((int)$r['code'] < 200 || (int)$r['code'] >= 300) { $errors[] = ($multi ? $acc['label'] . ' · ' : '') . $rt . ': HTTP ' . (int)$r['code']; break; }
            $deleted += is_array($r['body']['deleted'] ?? null) ? count($r['body']['deleted']) : 0;
            $partial = !empty($r['body']['partial']);
            if (!$partial) break;
        }
    }
    audit('media.purge_derived', (string)$g['requester']['memberId'], '', ['deleted' => $deleted, 'partial' => $partial, 'errors' => $errors], (string)($p['ip'] ?? ''));
    $after = media_usage_refresh(true);
    return ['ok' => $errors === [], 'deleted' => $deleted, 'more' => $partial, 'errors' => $errors, 'usage' => $after];
}

/* ── Several Cloudinary accounts ───────────────────────────────────────────
 * One free Cloudinary plan holds about fifty people's photos a month. More
 * accounts mean more room: the account in config.php (or Settings → API keys)
 * is the main one, and others are added in Control Room → System → Image
 * storage. Uploads go to the FIRST account, in the order shown, that still has
 * room (under `high`; failing that, under `critical`), so a full plan moves new
 * uploads to the next account by itself, on the next usage reading — and an
 * account that a reset or an upgrade empties takes them back.
 *
 * Images already uploaded stay where they are and keep working: a delivery
 * URL names its own cloud, and needs no key to be shown. Keys are needed only
 * to upload, to read usage and to delete, and those three pick the account by
 * the cloud an image is on (media_account_for_cloud).
 *
 * The extra accounts' secrets are sealed (ai_ui_seal) and never sent back to a
 * browser; a key is checked against Cloudinary before it is kept.
 */
const MEDIA_ACCOUNTS_MAX = 8;

/** The main account's keys: config.php with Settings → API keys laid over it.
 *  While another account takes uploads, the main one's own config is kept in
 *  $GLOBALS['CLOUDINARY_PRIMARY'] (service_keys_apply restores from it). */
function media_primary_cfg(): array {
    return (array)($GLOBALS['CLOUDINARY_PRIMARY'] ?? $GLOBALS['CONFIG']['cloudinary'] ?? []);
}
/** The backup account set in Settings → API keys (cloudinary.backup.*), or [] when any of its three keys is missing. */
function cloudinary_backup_cfg(): array {
    $b = (array)(media_primary_cfg()['backup'] ?? []);
    return !empty($b['cloud_name']) && !empty($b['api_key']) && !empty($b['api_secret']) ? $b : [];
}
function media_extra_rows(): array {
    $rows = function_exists('setting_get') ? setting_get('media.accounts') : null;
    return is_array($rows) ? array_values(array_filter($rows, 'is_array')) : [];
}

/** Every usable account, in the order uploads try them. */
function media_accounts(): array {
    $out = [];
    $p = media_primary_cfg();
    if (!empty($p['cloud_name']) && !empty($p['api_key']) && !empty($p['api_secret']))
        $out[] = ['id' => 'primary', 'label' => 'Main account', 'cloud_name' => (string)$p['cloud_name'], 'api_key' => (string)$p['api_key'], 'api_secret' => (string)$p['api_secret'],
                  'unsigned_preset' => (string)($p['unsigned_preset'] ?? ''), 'primary' => true, 'enabled' => true];
    // The backup from Settings → API keys is the second in line: one list of accounts, wherever its keys were typed.
    if ($b = cloudinary_backup_cfg())
        $out[] = ['id' => 'backup', 'label' => 'Backup account', 'cloud_name' => (string)$b['cloud_name'], 'api_key' => (string)$b['api_key'], 'api_secret' => (string)$b['api_secret'],
                  'unsigned_preset' => (string)($b['unsigned_preset'] ?? ''), 'primary' => false, 'settings' => true, 'enabled' => true];
    foreach (media_extra_rows() as $r) {
        if (empty($r['enabled']) || empty($r['cloudName'])) continue;
        $sec = function_exists('ai_ui_open') ? ai_ui_open((string)($r['secret'] ?? '')) : '';
        if ($sec === '') continue;
        $out[] = ['id' => (string)$r['id'], 'label' => (string)($r['label'] ?: $r['cloudName']), 'cloud_name' => (string)$r['cloudName'], 'api_key' => (string)$r['apiKey'], 'api_secret' => $sec,
                  'unsigned_preset' => '', 'primary' => false, 'enabled' => true];
    }
    return $out;
}
function media_account(string $id): ?array {
    foreach (media_accounts() as $a) if ($a['id'] === $id) return $a;
    return null;
}
/** The account an image on `$cloud` belongs to, or null when it is not ours. */
function media_account_for_cloud(string $cloud): ?array {
    if ($cloud === '') return null;
    foreach (media_accounts() as $a) if (strcasecmp($a['cloud_name'], $cloud) === 0) return $a;
    return null;
}
function media_cloud_of(string $url): string {
    return preg_match('#^https://res\.cloudinary\.com/([^/]+)/#', $url, $m) ? $m[1] : '';
}

/** The account uploads should go to: the first with room. Null when every one is full. */
function media_pick_id(): ?string {
    $accs = media_accounts();
    // An operator's choice comes first, while that account is not full (Diagnostics → Image storage).
    $pin = media_pin();
    if ($pin !== '') foreach ($accs as $a) if ($a['id'] === $pin && MEDIA_LEVEL_ORDER[(string)(media_state_raw($a['id'])['level'] ?? 'ok')] < MEDIA_LEVEL_ORDER['critical']) return $a['id'];
    /* From 70% (`warn`) the next account takes over: the others are there to spare
       the main account's credits, not to rescue it once spent. Then below `high`,
       then anything not full. */
    foreach (['warn', 'high', 'critical'] as $below)
        foreach ($accs as $a) if (MEDIA_LEVEL_ORDER[(string)(media_state_raw($a['id'])['level'] ?? 'ok')] < MEDIA_LEVEL_ORDER[$below]) return $a['id'];
    return null;
}
function media_active_id(): string {
    return (string)($GLOBALS['__media_active'] ?? (media_pick_id() ?? 'primary'));
}

/**
 * Put the chosen account's keys where every uploader reads them
 * ($CONFIG['cloudinary']), keeping the main account's own under `__primary`.
 * Run once a request from bootstrap, after the on-screen keys are applied, and
 * again after a usage reading. With one account it changes nothing.
 */
function media_activate(): void {
    if (!isset($GLOBALS['CLOUDINARY_PRIMARY'])) $GLOBALS['CLOUDINARY_PRIMARY'] = (array)($GLOBALS['CONFIG']['cloudinary'] ?? []);
    $primary = $GLOBALS['CLOUDINARY_PRIMARY'];
    $id = media_pick_id() ?? 'primary';
    $acc = $id === 'primary' ? null : media_account($id);
    if (!$acc) $id = 'primary';
    $GLOBALS['__media_active'] = $id;
    $GLOBALS['CONFIG']['cloudinary'] = media_cfg_for($acc);
}
/** The config with one account's keys live: the main one's folder and settings, that account's keys and its own
 *  upload preset (a preset belongs to one account; the main one's never carries across). */
function media_cfg_for(?array $acc): array {
    $primary = media_primary_cfg();
    if (!$acc || $acc['id'] === 'primary') return $primary;
    return array_merge($primary, ['cloud_name' => $acc['cloud_name'], 'api_key' => $acc['api_key'], 'api_secret' => $acc['api_secret'], 'unsigned_preset' => (string)($acc['unsigned_preset'] ?? '')]);
}
/** The account an operator chose for new uploads ('' = automatic). Ignored once that account is removed or paused. */
function media_pin(): string {
    $v = function_exists('setting_raw') ? (string)setting_raw('cloudinary_pin') : '';
    return $v !== '' && media_account($v) ? $v : '';
}
/**
 * admin.media.account — send new uploads to one account now (`use` = its id),
 * held until changed, or back to automatic (`use` = 'auto'). A full account is
 * still skipped, so a choice can never stop uploads.
 */
function admin_media_account(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $use = (string)($p['use'] ?? '');
    if ($use !== 'auto' && !media_account($use)) return ['ok' => false, 'error' => 'not_found', 'detail' => 'That account is not set up, or is paused.'];
    $was = media_active_id();
    setting_set('cloudinary_pin', $use === 'auto' ? '' : $use, (string)$g['requester']['memberId']);
    media_activate(); media_credit_flags();
    $now = media_active_id();
    audit('admin.media.account', (string)$g['requester']['memberId'], $use, ['from' => $was, 'to' => $now], (string)($p['ip'] ?? ''));
    if ($now !== $was) media_switch_notice($was, $now, $use === 'auto' ? 'is back on automatic' : 'was chosen for new uploads');
    return ['ok' => true, 'uploadsTo' => $now, 'pin' => media_pin()] + admin_media_accounts($p);
}

/* Names the photo pipeline and the API-keys screen use. */
function cloudinary_account_apply(): void { media_activate(); }
function cloudinary_active(): string { return media_active_id(); }
function cloudinary_cloud_of(string $url): string { return media_cloud_of($url); }
/** Run $fn with one account's keys live; the account uploads go to is restored after. */
function cloudinary_with_account(string $id, callable $fn) {
    $saved = $GLOBALS['CONFIG']['cloudinary'] ?? [];
    if (!isset($GLOBALS['CLOUDINARY_PRIMARY'])) $GLOBALS['CLOUDINARY_PRIMARY'] = $saved;
    $GLOBALS['CONFIG']['cloudinary'] = media_cfg_for($id === 'primary' ? null : media_account($id));
    try { return $fn(); } finally { $GLOBALS['CONFIG']['cloudinary'] = $saved; }
}
/** The account uploads go to refused work (credits spent): mark it full now rather than at the next reading, and move on. */
function cloudinary_failover(string $why): bool {
    $from = media_active_id();
    $st = media_usage_state($from);
    media_state_put($from, ['level' => 'critical', 'pct' => 100.0, 'checkedAt' => gmdate('c'), 'error' => 'Cloudinary ' . $why . '.'] + $st);
    media_activate(); media_credit_flags();
    $to = media_active_id();
    if ($to === $from) return false;
    media_switch_notice($from, $to, $why);
    return true;
}
/* ── A refusal the browser saw ──────────────────────────────────────────
   Most uploads go from the browser straight to Cloudinary with a signature
   from upload-sign.php, so when the account uploads go to is spent the server
   never sees the refusal, and the backup sat unused until the next 6-hourly
   reading (never, on a host whose web-cron does not fire). The uploader now
   reports the refusal when it asks for a fresh signature, and this decides.
   A browser's word alone never moves the site's storage: the account is read
   at once, and if the reading does not settle it, a one-pixel signed upload is
   tried with the server's own keys. Checked at most once per account per
   MEDIA_REFUSAL_GAP seconds, so a stream of reports costs one check. */
const MEDIA_REFUSAL_GAP = 120;
const MEDIA_PROBE_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Does what the browser saw read as a spent plan (rather than a bad file)? */
function media_refusal_is_quota(int $status, string $msg): bool {
    return $status === 420 || $status === 429 || (bool)preg_match('/limit|quota|credit|exceed|disabled|suspend|plan/i', $msg);
}

/** $r = ['cloud' => the cloud that refused, 'status' => HTTP status, 'message' => Cloudinary's words].
 *  Returns ['switched' => bool, 'active' => account id, 'checked' => what was done]. */
function media_upload_refused(array $r): array {
    $cloud = (string)($r['cloud'] ?? ''); $status = (int)($r['status'] ?? 0); $msg = mb_substr((string)($r['message'] ?? ''), 0, 300);
    $active = media_active_id(); $acc = media_account($active);
    $out = ['switched' => false, 'active' => $active, 'checked' => 'none'];
    // Already moved on (another upload reported first): the fresh signature is for the next account.
    if (!$acc || $cloud === '' || strcasecmp($cloud, (string)$acc['cloud_name']) !== 0) { $out['switched'] = $acc && $cloud !== '' && media_account_for_cloud($cloud) !== null; return $out; }
    if (!media_refusal_is_quota($status, $msg)) return $out;
    $last = (array)(setting_get('media.refusal.checked') ?: []);
    if (time() - (int)($last[$active] ?? 0) < MEDIA_REFUSAL_GAP) { $out['checked'] = 'recent'; return $out; }
    $last[$active] = time();
    setting_set('media.refusal.checked', $last, 'system');

    $st = media_usage_refresh_one($acc, true);
    $out['checked'] = 'usage';
    $why = 'refused an upload (' . ($msg !== '' ? $msg : 'HTTP ' . $status) . ')';
    if ($st['level'] === 'critical') {
        media_activate(); media_credit_flags();
        if (media_active_id() !== $active) { media_switch_notice($active, media_active_id(), $why); $out['switched'] = true; }
    } else {
        $p = media_probe_upload($acc);
        $out['checked'] = 'probe';
        if (!$p['ok'] && media_refusal_is_quota((int)$p['code'], (string)$p['message'])) $out['switched'] = cloudinary_failover($why);
    }
    $out['active'] = media_active_id();
    return $out;
}

/** A one-pixel signed upload with one account's keys, deleted again when it lands. Test seam: $GLOBALS['__media_probe_mock']. */
function media_probe_upload(array $acc): array {
    if (isset($GLOBALS['__media_probe_mock']) && is_callable($GLOBALS['__media_probe_mock'])) return ($GLOBALS['__media_probe_mock'])((string)$acc['id']);
    if (!function_exists('curl_init')) return ['ok' => true, 'code' => 0, 'message' => ''];
    $ts = time(); $folder = trim((string)(media_primary_cfg()['folder'] ?? 'ngg'), '/') . '/_probe';
    $sig = sha1('folder=' . $folder . '&timestamp=' . $ts . $acc['api_secret']);
    $ch = curl_init('https://api.cloudinary.com/v1_1/' . rawurlencode((string)$acc['cloud_name']) . '/image/upload');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['file' => MEDIA_PROBE_GIF, 'folder' => $folder, 'timestamp' => $ts, 'api_key' => $acc['api_key'], 'signature' => $sig]]);
    $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $j = json_decode((string)$raw, true);
    if ($code >= 200 && $code < 300 && !empty($j['public_id'])) {
        if (function_exists('cloudinary_destroy')) cloudinary_destroy((string)$j['public_id'], (string)$acc['cloud_name']);
        return ['ok' => true, 'code' => $code, 'message' => ''];
    }
    return ['ok' => false, 'code' => $code, 'message' => (string)($j['error']['message'] ?? '')];
}

/** Before signing: a fresh signature carries the browser's report of a
 *  refusal, if any; and a reading older than the cadence is taken now, for a
 *  host whose web-cron does not fire. Returns the refusal verdict, or null. */
function media_before_sign(?array $refused): ?array {
    if (!media_accounts()) return null;
    $verdict = $refused ? media_upload_refused($refused) : null;
    try { media_usage_refresh(false); } catch (Throwable $e) { error_log('[media_before_sign] ' . $e->getMessage()); }
    return $verdict;
}

/** Each switch is told to the people who run it, and recorded. */
function media_switch_notice(string $from, string $to, string $why): void {
    $fa = media_account($from); $ta = media_account($to);
    $title = $to === 'primary' ? 'Cloudinary: back on the main account' : ($to === 'backup' ? 'Cloudinary: switched to the backup account' : 'Cloudinary: new uploads now go to ' . ($ta ? $ta['label'] : $to));
    $body = $to === 'primary' ? 'The main account ' . $why . ', so new photos and edits go there again.'
        : ($fa ? $fa['label'] : 'The account in use') . ' ' . $why . '. New photos and edits now go to ' . ($ta ? $ta['label'] : $to) . '; photos already uploaded keep showing.';
    if (function_exists('ops_record')) ops_record('warn', 'media.storage', $title, $body);
    if (function_exists('intake_admin_alert')) intake_admin_alert('[NGG] ' . $title, ['title' => $title, 'intro' => $body, 'bodyHtml' => '<p>' . esc_html($body) . '</p>', 'footNote' => 'Automatic alert from the media storage monitor.']);
    audit('media.storage.switch', null, $to, ['from' => $from, 'why' => $why], '');
}

/** The keys to act on an image with: the account its URL names, else the one uploads go to. */
function media_account_for_url(string $url): ?array {
    $cloud = media_cloud_of($url);
    return $cloud !== '' ? media_account_for_cloud($cloud) : media_account(media_active_id());
}

/* ── Ops ── */

/** How one account reads on screen: never its secret. */
function media_account_view(array $a, array $row = []): array {
    $st = media_usage_state((string)$a['id']);
    return ['id' => $a['id'], 'label' => $a['label'], 'cloudName' => $a['cloud_name'], 'keyEnds' => substr((string)$a['api_key'], -4), 'primary' => !empty($a['primary']), 'settings' => !empty($a['primary']) || !empty($a['settings']),
            'enabled' => $row ? !empty($row['enabled']) : true, 'active' => media_active_id() === $a['id'],
            'level' => $st['level'], 'pct' => $st['pct'], 'parts' => $st['parts'], 'plan' => $st['plan'] ?? '', 'checkedAt' => $st['checkedAt'], 'error' => $st['error'],
            'addedAt' => (string)($row['addedAt'] ?? ''), 'addedBy' => (string)($row['addedBy'] ?? '')];
}

/** admin.media.accounts — every account, in upload order, with its usage. */
function admin_media_accounts(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $rows = []; foreach (media_extra_rows() as $r) $rows[(string)$r['id']] = $r;
    $out = [];
    foreach (media_accounts() as $a) $out[] = media_account_view($a, $rows[$a['id']] ?? []);
    // A paused extra account is listed too, so it can be resumed.
    foreach ($rows as $id => $r) if (empty($r['enabled'])) $out[] = ['id' => $id, 'label' => (string)($r['label'] ?: $r['cloudName']), 'cloudName' => (string)$r['cloudName'],
        'keyEnds' => substr((string)$r['apiKey'], -4), 'primary' => false, 'enabled' => false, 'active' => false, 'level' => 'ok', 'pct' => null, 'parts' => [], 'plan' => '',
        'checkedAt' => '', 'error' => '', 'addedAt' => (string)($r['addedAt'] ?? ''), 'addedBy' => (string)($r['addedBy'] ?? '')];
    $pick = media_pick_id();
    return ['ok' => true, 'accounts' => $out, 'uploadsTo' => $pick, 'pin' => media_pin(), 'max' => MEDIA_ACCOUNTS_MAX, 'primaryConfigured' => (bool)media_account('primary')];
}

/** Ask Cloudinary whether a set of keys works, before keeping them. */
function media_account_check(array $acc): array {
    $r = media_api('GET', '/usage', [], $acc);
    $code = (int)($r['code'] ?? 0);
    if ($code >= 200 && $code < 300) return ['ok' => true];
    if ($code === 401 || $code === 403) return ['ok' => false, 'error' => 'bad_credentials', 'detail' => 'Cloudinary refused these keys. Copy the cloud name, API key and API secret again from the Cloudinary console → Settings → API Keys.'];
    if ($code === 404) return ['ok' => false, 'error' => 'bad_cloud', 'detail' => 'There is no Cloudinary cloud by that name.'];
    if ($code === 420 || $code === 429) return ['ok' => true, 'full' => true];
    return ['ok' => false, 'error' => 'unreachable', 'detail' => 'Could not reach Cloudinary to check the keys (HTTP ' . $code . '). Try again in a minute.'];
}

/** admin.media.accountSave — add an account, or change one's label, keys or pause. */
function admin_media_account_save(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $rows = media_extra_rows();
    $id = trim((string)($p['id'] ?? ''));
    $i = null;
    foreach ($rows as $k => $r) if ((string)$r['id'] === $id) $i = $k;
    if ($id !== '' && $i === null) return ['ok' => false, 'error' => 'not_found'];
    if ($id === 'primary' || $id === 'backup') return ['ok' => false, 'error' => 'primary_is_settings', 'detail' => 'That account is set in Settings → API keys → Cloudinary.'];
    $cur = $i !== null ? $rows[$i] : [];
    // On a change, a field left empty keeps what is saved.
    $keep = static fn($k, $ck) => trim((string)($p[$k] ?? '')) !== '' ? trim((string)$p[$k]) : (string)($cur[$ck] ?? '');
    $label = trim(preg_replace('/\s+/', ' ', $keep('label', 'label')));
    $cloud = strtolower($keep('cloudName', 'cloudName'));
    $key = $keep('apiKey', 'apiKey');
    $secret = trim((string)($p['apiSecret'] ?? ''));
    $enabled = array_key_exists('enabled', $p) ? !empty($p['enabled']) : ($cur ? !empty($cur['enabled']) : true);
    if (mb_strlen($label) > 60) return ['ok' => false, 'error' => 'label_too_long', 'detail' => 'Keep the name under 60 characters.'];
    if (!preg_match('/^[a-z0-9][a-z0-9_-]{1,63}$/', $cloud)) return ['ok' => false, 'error' => 'bad_cloud_name', 'detail' => 'The cloud name is the short name on the Cloudinary console, letters, numbers and dashes.'];
    if (!preg_match('/^\d{6,20}$/', $key)) return ['ok' => false, 'error' => 'bad_api_key', 'detail' => 'The API key is a number, 6 to 20 digits.'];
    if ($secret === '' && $i === null) return ['ok' => false, 'error' => 'secret_required', 'detail' => 'Paste the API secret.'];
    if ($secret !== '' && !preg_match('/^[A-Za-z0-9_-]{10,64}$/', $secret)) return ['ok' => false, 'error' => 'bad_api_secret', 'detail' => 'That does not look like a Cloudinary API secret.'];
    foreach (media_accounts() as $a) if (strcasecmp($a['cloud_name'], $cloud) === 0 && $a['id'] !== $id) return ['ok' => false, 'error' => 'duplicate_cloud', 'detail' => 'That cloud is already on the list (' . $a['label'] . ').'];
    foreach ($rows as $r) if (strcasecmp((string)$r['cloudName'], $cloud) === 0 && (string)$r['id'] !== $id) return ['ok' => false, 'error' => 'duplicate_cloud', 'detail' => 'That cloud is already on the list.'];
    if ($i === null && count($rows) >= MEDIA_ACCOUNTS_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . MEDIA_ACCOUNTS_MAX . ' extra accounts.'];
    $sealed = $secret !== '' ? ai_ui_seal($secret) : (string)($cur['secret'] ?? '');
    if ($sealed === '') return ['ok' => false, 'error' => 'cannot_seal', 'detail' => 'This server cannot encrypt the secret (OpenSSL is missing), so it will not be stored.'];
    // Keys that changed are checked against Cloudinary before they are kept.
    $changed = $i === null || $secret !== '' || $cloud !== (string)($cur['cloudName'] ?? '') || $key !== (string)($cur['apiKey'] ?? '');
    if ($changed && $enabled) {
        $chk = media_account_check(['id' => $id !== '' ? $id : 'new', 'label' => $label, 'cloud_name' => $cloud, 'api_key' => $key, 'api_secret' => $secret !== '' ? $secret : ai_ui_open($sealed)]);
        if (empty($chk['ok'])) return $chk;
    }
    $row = ['id' => $id !== '' ? $id : 'acc_' . bin2hex(random_bytes(5)), 'label' => $label !== '' ? $label : $cloud, 'cloudName' => $cloud, 'apiKey' => $key, 'secret' => $sealed, 'enabled' => $enabled,
            'addedAt' => (string)($cur['addedAt'] ?? now_iso()), 'addedBy' => (string)($cur['addedBy'] ?? $by), 'updatedAt' => now_iso(), 'updatedBy' => $by];
    if ($i === null) $rows[] = $row; else $rows[$i] = $row;
    setting_set('media.accounts', $rows, $by);
    audit($i === null ? 'media.account.add' : 'media.account.update', $by, $row['id'], ['cloud' => $cloud, 'label' => $row['label'], 'enabled' => $enabled, 'keysChanged' => $changed], (string)($p['ip'] ?? ''));
    if ($changed) media_usage_refresh_one(media_account($row['id']) ?? ['id' => $row['id'], 'label' => $row['label'], 'cloud_name' => $cloud, 'api_key' => $key, 'api_secret' => ai_ui_open($sealed)], true);
    media_activate(); media_credit_flags();
    return ['ok' => true, 'id' => $row['id']] + admin_media_accounts($p);
}

/** admin.media.accountRemove — off the list. Its images keep showing; only uploading to, reading and deleting from it stop. */
function admin_media_account_remove(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $id = (string)($p['id'] ?? '');
    if ($id === 'primary' || $id === 'backup') return ['ok' => false, 'error' => 'primary_is_settings', 'detail' => 'That account is removed in Settings → API keys → Cloudinary.'];
    $rows = media_extra_rows(); $gone = null;
    $rows = array_values(array_filter($rows, static function ($r) use ($id, &$gone) { if ((string)$r['id'] === $id) { $gone = $r; return false; } return true; }));
    if (!$gone) return ['ok' => false, 'error' => 'not_found'];
    // How many records still show an image from this cloud, so the screen can say they keep working.
    $n = 0; $like = '%res.cloudinary.com/' . (string)$gone['cloudName'] . '/%';
    foreach (['members', 'volunteers', 'summer_students'] as $t) { try { $n += (int)(db_row("SELECT COUNT(*) c FROM {$t} WHERE photoUrl LIKE ?", [$like])['c'] ?? 0); } catch (Throwable $e) {} }
    setting_set('media.accounts', $rows, (string)$g['requester']['memberId']);
    $all = setting_get('media.usage.accounts'); if (is_array($all)) { unset($all[$id]); setting_set('media.usage.accounts', $all, 'system'); }
    audit('media.account.remove', (string)$g['requester']['memberId'], $id, ['cloud' => (string)$gone['cloudName'], 'photosStillThere' => $n], (string)($p['ip'] ?? ''));
    media_activate(); media_credit_flags();
    return ['ok' => true, 'photosStillThere' => $n] + admin_media_accounts($p);
}

/** admin.media.accountMove — change the order uploads try the extra accounts in (the main one is always first). */
function admin_media_account_move(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $id = (string)($p['id'] ?? ''); $dir = (string)($p['dir'] ?? '');
    if (!in_array($dir, ['up', 'down'], true)) return ['ok' => false, 'error' => 'bad_direction'];
    $rows = media_extra_rows(); $i = null;
    foreach ($rows as $k => $r) if ((string)$r['id'] === $id) $i = $k;
    if ($i === null) return ['ok' => false, 'error' => 'not_found'];
    $j = $dir === 'up' ? $i - 1 : $i + 1;
    if ($j < 0 || $j >= count($rows)) return ['ok' => true, 'unchanged' => true] + admin_media_accounts($p);
    [$rows[$i], $rows[$j]] = [$rows[$j], $rows[$i]];
    setting_set('media.accounts', $rows, (string)$g['requester']['memberId']);
    audit('media.account.move', (string)$g['requester']['memberId'], $id, ['dir' => $dir], (string)($p['ip'] ?? ''));
    media_activate(); media_credit_flags();
    return ['ok' => true] + admin_media_accounts($p);
}

/** admin.media.accountCheck — read one account's usage now. */
function admin_media_account_check(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $acc = media_account((string)($p['id'] ?? ''));
    if (!$acc) return ['ok' => false, 'error' => 'not_found'];
    media_usage_refresh_one($acc, true);
    media_activate(); media_credit_flags();
    return ['ok' => true] + admin_media_accounts($p);
}

