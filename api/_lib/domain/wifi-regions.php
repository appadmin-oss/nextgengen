<?php
declare(strict_types=1);

/**
 * Wi-Fi at scale — regions, the paged lists and the analytics
 * (domain/wifi.php has the feed, the access table and the gateways).
 *
 * NGG plans about 2,000 centres. A Wi-Fi REGION is a grouping of centres for
 * their Wi-Fi only: who leads it, its speeds, its health at a glance. It is
 * not a change to centres (NGG-wide regions are planned separately —
 * docs/HANDOFF.md); when those exist, these should become them.
 *
 * Every read and act here is limited to the requester's Wi-Fi scope
 * (wifi_scope): a super admin sees every centre, a region lead their regions,
 * anybody else holding `network` their own centres. Lists are filtered and
 * paged on the server with a true total; nothing is filtered on the drawn page.
 * Shaping regions — making, renaming, removing, choosing their centres and
 * leads — is for somebody who sees every centre.
 */

const WIFI_PAGE_MAX = 100;
const WIFI_ASSIGN_MAX = 500;          // centres put into a region in one press
const WIFI_LEADS_MAX = 20;

/* ── Regions ─────────────────────────────────────────────────────────────── */

/* Regions are the `wifi_regions` capability: super admins, and anybody it is
   granted to by name. An NGG admin holding `network` looks after their own
   centre's Wi-Fi and never sees, shapes or sets a region. */
function wifi_regions_allowed(array $requester): bool { return in_array('wifi_regions', member_effective_caps($requester), true); }
function wifi_network_gate(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    if (!wifi_regions_allowed($g['requester'])) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:wifi_regions'];
    if ($g['scope'] !== null) return ['ok' => false, 'error' => 'network_wide_only', 'message' => 'Regions are shaped by somebody who looks after every centre.'];
    return $g;
}

/** The regions the requester may see, each with its roll-up. One read per table, grouped. */
function admin_wifi_regions(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    if (!wifi_regions_allowed($g['requester'])) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:wifi_regions'];
    $scope = $g['scope'];
    $regions = db_all("SELECT * FROM wifi_regions WHERE removedAt = '' OR removedAt IS NULL ORDER BY name");
    $centresBy = [];
    foreach (db_all('SELECT centre, regionId FROM wifi_region_centres') as $r) $centresBy[(string)$r['regionId']][] = (string)$r['centre'];
    $leads = [];
    foreach (db_all('SELECT l.regionId, l.memberId, m.fullName FROM wifi_region_leads l LEFT JOIN members m ON m.memberId = l.memberId') as $r)
        $leads[(string)$r['regionId']][] = ['memberId' => (string)$r['memberId'], 'name' => (string)($r['fullName'] ?? $r['memberId'])];
    $gw = wifi_gateway_rollup();
    $out = [];
    foreach ($regions as $r) {
        $rid = (string)$r['regionId'];
        $cs = array_values(array_filter($centresBy[$rid] ?? [], fn($c) => wifi_scope_has($scope, $c)));
        if ($scope !== null && !$cs) continue;
        $out[] = ['regionId' => $rid, 'name' => (string)$r['name'], 'code' => (string)$r['code'], 'note' => (string)$r['note'],
                  'centres' => count($cs), 'leads' => $leads[$rid] ?? []] + wifi_rollup_sum($gw, $cs);
    }
    $all = array_map(fn($c) => (string)$c['name'], db_all("SELECT name FROM centres WHERE status IS NULL OR status <> 'retired'"));
    $assigned = array_flip(array_merge([], ...array_values($centresBy ?: [[]])));
    $unassigned = array_values(array_filter($all, fn($c) => !isset($assigned[$c]) && wifi_scope_has($scope, $c)));
    return ['ok' => true, 'regions' => $out, 'unassigned' => ['centres' => count($unassigned)] + wifi_rollup_sum($gw, $unassigned),
            'canShape' => $scope === null];
}

/** Per centre: gateways, how many are working / need a look / not working / never connected, people on them. */
function wifi_gateway_rollup(): array {
    $rows = db_all("SELECT * FROM wifi_gateways WHERE removedAt = '' OR removedAt IS NULL");
    $bad = wifi_bad_key_counts();
    $hc = wifi_health_context($rows) + ['profiles' => wifi_settings()['profiles']];
    $out = [];
    foreach ($rows as $r) {
        $c = (string)$r['centre'];
        $o = wifi_gateway_out($r, $bad, $hc);
        $x = $out[$c] ?? ['gateways' => 0, 'working' => 0, 'warn' => 0, 'bad' => 0, 'never' => 0, 'people' => 0, 'online' => 0];
        $x['gateways']++;
        if (!$o['lastSeenAt']) $x['never']++; elseif ($o['health'] === 'ok') $x['working']++; elseif ($o['health'] === 'warn') $x['warn']++; else $x['bad']++;
        $x['people'] += (int)$o['users'];
        $x['online'] += (int)($o['stats']['active'] ?? 0);
        $out[$c] = $x;
    }
    return $out;
}
function wifi_rollup_sum(array $gw, array $centres): array {
    $s = ['gateways' => 0, 'working' => 0, 'warn' => 0, 'bad' => 0, 'never' => 0, 'people' => 0, 'online' => 0, 'withWifi' => 0];
    foreach ($centres as $c) {
        if (!isset($gw[$c])) continue;
        $s['withWifi']++;
        foreach ($gw[$c] as $k => $v) $s[$k] += $v;
    }
    return $s;
}

function admin_wifi_region_save(array $p): array {
    $g = wifi_network_gate($p); if (!$g['ok']) return $g;
    $name = trim(mb_substr((string)($p['name'] ?? ''), 0, 120));
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($p['code'] ?? '')));
    $code = substr($code, 0, 8);
    $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 255));
    if ($name === '') return ['ok' => false, 'error' => 'name_required'];
    $rid = (string)($p['regionId'] ?? '');
    $dupe = db_row("SELECT regionId FROM wifi_regions WHERE LOWER(name) = LOWER(?) AND (removedAt = '' OR removedAt IS NULL) AND regionId <> ? LIMIT 1", [$name, $rid]);
    if ($dupe) return ['ok' => false, 'error' => 'name_taken'];
    $me = (string)$g['requester']['memberId'];
    if ($rid === '') {
        do { $rid = 'WR' . bin2hex(random_bytes(3)); } while (db_row('SELECT id FROM wifi_regions WHERE regionId = ?', [$rid]));
        db_insert('wifi_regions', ['regionId' => $rid, 'name' => $name, 'code' => $code, 'note' => $note, 'createdAt' => now_iso(), 'createdBy' => $me]);
        audit('wifi.region.add', $me, $rid, ['name' => $name], (string)($p['ip'] ?? ''));
    } else {
        if (!db_row("SELECT id FROM wifi_regions WHERE regionId = ? AND (removedAt = '' OR removedAt IS NULL)", [$rid])) return ['ok' => false, 'error' => 'not_found'];
        db_update('wifi_regions', ['name' => $name, 'code' => $code, 'note' => $note], ['regionId' => $rid]);
        audit('wifi.region.save', $me, $rid, ['name' => $name], (string)($p['ip'] ?? ''));
    }
    wifi_settings_forget();
    return ['ok' => true, 'regionId' => $rid];
}

/** Remove a region: its centres become unassigned and its own speeds go; nothing else changes. */
function admin_wifi_region_remove(array $p): array {
    $g = wifi_network_gate($p); if (!$g['ok']) return $g;
    $rid = (string)($p['regionId'] ?? '');
    if (!db_row("SELECT id FROM wifi_regions WHERE regionId = ? AND (removedAt = '' OR removedAt IS NULL)", [$rid])) return ['ok' => false, 'error' => 'not_found'];
    $n = (int)(db_row('SELECT COUNT(*) c FROM wifi_region_centres WHERE regionId = ?', [$rid])['c'] ?? 0);
    db_exec('DELETE FROM wifi_region_centres WHERE regionId = ?', [$rid]);
    db_exec('DELETE FROM wifi_region_leads WHERE regionId = ?', [$rid]);
    db_exec("DELETE FROM wifi_profile_overrides WHERE regionId = ? AND centre = ''", [$rid]);
    db_update('wifi_regions', ['removedAt' => now_iso()], ['regionId' => $rid]);
    audit('wifi.region.remove', (string)$g['requester']['memberId'], $rid, ['centres' => $n], (string)($p['ip'] ?? ''));
    wifi_settings_forget();
    return ['ok' => true, 'unassigned' => $n];
}

/**
 * Put centres into a region (or take them out: regionId ''). Capped, the whole
 * list checked before any write, a verdict per centre, one audit event.
 */
function admin_wifi_region_assign(array $p): array {
    $g = wifi_network_gate($p); if (!$g['ok']) return $g;
    $rid = (string)($p['regionId'] ?? '');
    $centres = array_values(array_unique(array_map('strval', (array)($p['centres'] ?? []))));
    if (!$centres) return ['ok' => false, 'error' => 'nothing_chosen'];
    if (count($centres) > WIFI_ASSIGN_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => WIFI_ASSIGN_MAX];
    if ($rid !== '' && !db_row("SELECT id FROM wifi_regions WHERE regionId = ? AND (removedAt = '' OR removedAt IS NULL)", [$rid])) return ['ok' => false, 'error' => 'not_found'];
    $known = [];
    foreach (array_chunk($centres, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT name, centreId FROM centres WHERE name IN ($ph)", $chunk) as $c) $known[(string)$c['name']] = (string)$c['centreId'];
    }
    $now = now_iso(); $me = (string)$g['requester']['memberId'];
    $results = []; $applied = 0; $unchanged = 0; $refused = 0;
    foreach ($centres as $c) {
        if (!isset($known[$c])) { $results[] = ['centre' => $c, 'error' => 'bad_centre']; $refused++; continue; }
        $cur = db_row('SELECT regionId FROM wifi_region_centres WHERE centre = ?', [$c]);
        if (($cur ? (string)$cur['regionId'] : '') === $rid) { $results[] = ['centre' => $c, 'unchanged' => true]; $unchanged++; continue; }
        if ($rid === '') db_exec('DELETE FROM wifi_region_centres WHERE centre = ?', [$c]);
        elseif ($cur) db_update('wifi_region_centres', ['regionId' => $rid, 'assignedAt' => $now, 'assignedBy' => $me], ['centre' => $c]);
        else db_insert('wifi_region_centres', ['centre' => $c, 'centreId' => $known[$c], 'regionId' => $rid, 'assignedAt' => $now, 'assignedBy' => $me]);
        $results[] = ['centre' => $c, 'ok' => true]; $applied++;
    }
    audit('wifi.region.assign', $me, $rid ?: '(none)', ['applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused], (string)($p['ip'] ?? ''));
    wifi_settings_forget();
    return ['ok' => true, 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'results' => $results];
}

/** Set a region's leads: staff who hold `network`; they then see that region's centres. */
function admin_wifi_region_leads(array $p): array {
    $g = wifi_network_gate($p); if (!$g['ok']) return $g;
    $rid = (string)($p['regionId'] ?? '');
    if (!db_row("SELECT id FROM wifi_regions WHERE regionId = ? AND (removedAt = '' OR removedAt IS NULL)", [$rid])) return ['ok' => false, 'error' => 'not_found'];
    $ids = array_values(array_unique(array_filter(array_map('strval', (array)($p['memberIds'] ?? [])))));
    if (count($ids) > WIFI_LEADS_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => WIFI_LEADS_MAX];
    foreach ($ids as $id) {
        $m = db_row('SELECT * FROM members WHERE memberId = ?', [$id]);
        if (!$m) return ['ok' => false, 'error' => 'not_found', 'memberId' => $id];
        if (!in_array('network', member_effective_caps($m), true)) return ['ok' => false, 'error' => 'not_network', 'memberId' => $id, 'message' => (string)$m['fullName'] . ' does not hold the network capability. Give it under Access & roles first.'];
    }
    db_exec('DELETE FROM wifi_region_leads WHERE regionId = ?', [$rid]);
    foreach ($ids as $id) db_insert('wifi_region_leads', ['regionId' => $rid, 'memberId' => $id, 'addedAt' => now_iso(), 'addedBy' => (string)$g['requester']['memberId']]);
    audit('wifi.region.leads', (string)$g['requester']['memberId'], $rid, ['leads' => $ids], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'leads' => count($ids)];
}

/** Staff who could lead a region: they hold `network`. For the picker. */
function admin_wifi_lead_options(array $p): array {
    $g = wifi_network_gate($p); if (!$g['ok']) return $g;
    $out = [];
    foreach (db_all("SELECT * FROM members WHERE role IN ('" . implode("','", staff_role_names()) . "') ORDER BY fullName") as $m) {
        if (in_array('network', member_effective_caps($m), true)) $out[] = ['memberId' => (string)$m['memberId'], 'name' => (string)$m['fullName'], 'role' => admin_role_label((string)$m['role'])];
    }
    return ['ok' => true, 'staff' => $out];
}

/* ── Speeds for a region or a centre ─────────────────────────────────────── */

/** Read one level's speeds: what it sets itself, what it inherits, and from where. */
function admin_wifi_profiles_get(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $t = wifi_override_target($g, $p); if (!$t['ok']) return $t;
    $row = db_row('SELECT * FROM wifi_profile_overrides WHERE regionId = ? AND centre = ? LIMIT 1', [$t['regionId'], $t['centre']]);
    $own = $row ? (json_decode((string)$row['profilesJson'], true) ?: []) : [];
    $eff = $t['centre'] !== '' ? wifi_settings($t['centre']) : wifi_settings_for_region($t['regionId']);
    return ['ok' => true, 'level' => $t['centre'] !== '' ? 'centre' : 'region', 'own' => (object)$own, 'effective' => $eff['profiles'],
            'from' => $eff['profilesFrom'] ?? [], 'updatedAt' => $row ? (string)$row['updatedAt'] : ''];
}

/** Save one level's own speeds; a profile set to null goes back to inheriting. */
function admin_wifi_profiles_set(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $t = wifi_override_target($g, $p); if (!$t['ok']) return $t;
    $in = (array)($p['profiles'] ?? []);
    $row = db_row('SELECT * FROM wifi_profile_overrides WHERE regionId = ? AND centre = ? LIMIT 1', [$t['regionId'], $t['centre']]);
    $own = $row ? (json_decode((string)$row['profilesJson'], true) ?: []) : [];
    $base = $t['centre'] !== '' ? wifi_settings($t['centre'])['profiles'] : wifi_settings_for_region($t['regionId'])['profiles'];
    foreach ($in as $k => $v) {
        if (!isset(WIFI_PROFILE_DEFAULTS[$k])) return ['ok' => false, 'error' => 'bad_profile', 'profile' => (string)$k];
        if ($v === null) continue;
        if (!is_array($v)) return ['ok' => false, 'error' => 'bad_profile', 'profile' => (string)$k];
        $why = wifi_profile_check($v + ($own[$k] ?? []) + $base[$k]);
        if ($why !== '') return ['ok' => false, 'error' => 'bad_profile', 'profile' => (string)$k, 'message' => $why];
    }
    foreach ($in as $k => $v) {
        if ($v === null) { unset($own[$k]); continue; }
        $own[$k] = array_intersect_key($v + ($own[$k] ?? []), WIFI_PROFILE_DEFAULTS['ngg-member']);
    }
    $me = (string)$g['requester']['memberId'];
    if (!$own) db_exec('DELETE FROM wifi_profile_overrides WHERE regionId = ? AND centre = ?', [$t['regionId'], $t['centre']]);
    elseif ($row) db_update('wifi_profile_overrides', ['profilesJson' => json_encode($own), 'updatedAt' => now_iso(), 'updatedBy' => $me], ['id' => (int)$row['id']]);
    else db_insert('wifi_profile_overrides', ['regionId' => $t['regionId'], 'centre' => $t['centre'], 'profilesJson' => json_encode($own), 'updatedAt' => now_iso(), 'updatedBy' => $me]);
    audit('wifi.profiles.set', $me, $t['centre'] !== '' ? 'centre:' . $t['centre'] : 'region:' . $t['regionId'], ['profiles' => array_keys($in)], (string)($p['ip'] ?? ''));
    wifi_settings_forget();
    return admin_wifi_profiles_get($p);
}

/** Which level an override is for, and whether the requester may set it. */
function wifi_override_target(array $g, array $p): array {
    $centre = trim((string)($p['centre'] ?? ''));
    $rid = trim((string)($p['regionId'] ?? ''));
    if ($centre !== '') {
        if (!db_row('SELECT id FROM centres WHERE name = ? LIMIT 1', [$centre])) return ['ok' => false, 'error' => 'bad_centre'];
        if (!wifi_scope_has($g['scope'], $centre)) return ['ok' => false, 'error' => 'out_of_scope'];
        return ['ok' => true, 'centre' => $centre, 'regionId' => ''];
    }
    // A region's speeds are a region's: the wifi_regions capability only.
    if (!wifi_regions_allowed($g['requester'])) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:wifi_regions'];
    if ($rid === '' || !db_row("SELECT id FROM wifi_regions WHERE regionId = ? AND (removedAt = '' OR removedAt IS NULL)", [$rid])) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'centre' => '', 'regionId' => $rid];
}

/** A region's effective speeds: the network's, with the region's own laid over. */
function wifi_settings_for_region(string $rid): array {
    $base = wifi_settings();
    $from = array_fill_keys(array_keys($base['profiles']), 'network');
    $row = db_row("SELECT profilesJson FROM wifi_profile_overrides WHERE regionId = ? AND centre = '' LIMIT 1", [$rid]);
    foreach ($row ? (json_decode((string)$row['profilesJson'], true) ?: []) : [] as $k => $v) {
        if (!isset($base['profiles'][$k]) || !is_array($v)) continue;
        $m = $v + $base['profiles'][$k];
        if (wifi_profile_check($m) === '') { $base['profiles'][$k] = wifi_profile_norm($m); $from[$k] = 'region'; }
    }
    $base['profilesFrom'] = $from;
    return $base;
}

/* ── The lists, paged on the server ──────────────────────────────────────── */

const WIFI_GW_SORTS = ['health' => 'health', 'centre' => 'centre', 'label' => 'label', 'lastSeen' => 'lastSeenAt', 'people' => 'users', 'online' => 'online', 'line' => 'line'];

/**
 * The gateways in scope: search (name, centre, id), facets (region, platform,
 * health), sort and paging, with the true total and the facet counts for the
 * whole filter. Health is worked out per gateway (it is derived), so the
 * filter runs over every gateway in scope before the page is cut.
 */
function admin_wifi_gateways(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $scope = $g['scope'];
    $rows = array_values(array_filter(db_all("SELECT * FROM wifi_gateways WHERE removedAt = '' OR removedAt IS NULL"), fn($r) => wifi_scope_has($scope, (string)$r['centre'])));
    $region = [];
    foreach (db_all('SELECT rc.centre, rc.regionId, g.name FROM wifi_region_centres rc JOIN wifi_regions g ON g.regionId = rc.regionId AND (g.removedAt = \'\' OR g.removedAt IS NULL)') as $x) $region[(string)$x['centre']] = [(string)$x['regionId'], (string)$x['name']];
    $bad = wifi_bad_key_counts();
    $hc = wifi_health_context($rows) + ['profiles' => wifi_settings()['profiles']];
    $seesRegions = wifi_regions_allowed($g['requester']);
    if (!$seesRegions) { $region = []; $p['region'] = ''; }
    $all = array_map(function ($r) use ($bad, $hc, $region) {
        $o = wifi_gateway_out($r, $bad, $hc);
        $o['regionId'] = $region[$o['centre']][0] ?? ''; $o['region'] = $region[$o['centre']][1] ?? '';
        $o['state'] = !$o['lastSeenAt'] ? 'never' : $o['health'];
        return $o;
    }, $rows);
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $fr = (string)($p['region'] ?? ''); $fp = (string)($p['platform'] ?? ''); $fh = (string)($p['health'] ?? '');
    $match = fn($o, $skip = '') => ($q === '' || strpos(mb_strtolower($o['label'] . ' ' . $o['centre'] . ' ' . $o['gatewayId'] . ' ' . $o['region']), $q) !== false)
        && ($skip === 'region' || $fr === '' || ($fr === '_none' ? $o['regionId'] === '' : $o['regionId'] === $fr))
        && ($skip === 'platform' || $fp === '' || $o['platform'] === $fp)
        && ($skip === 'health' || $fh === '' || $o['state'] === $fh);
    // Facet counts for each facet are over the other filters, so picking one never hides the others' choices.
    $facets = ['region' => [], 'platform' => [], 'health' => []];
    foreach ($all as $o) {
        if ($match($o, 'region')) { $k = $o['regionId'] ?: '_none'; $facets['region'][$k] = ($facets['region'][$k] ?? 0) + 1; }
        if ($match($o, 'platform')) $facets['platform'][$o['platform']] = ($facets['platform'][$o['platform']] ?? 0) + 1;
        if ($match($o, 'health')) $facets['health'][$o['state']] = ($facets['health'][$o['state']] ?? 0) + 1;
    }
    $list = array_values(array_filter($all, fn($o) => $match($o)));
    // Unknown sort falls back to the default, never an error (a stale bookmark shows the list).
    $sort = WIFI_GW_SORTS[(string)($p['sort'] ?? '')] ?? 'health';
    $dir = (string)($p['dir'] ?? '') === 'desc' ? -1 : 1;
    $rank = ['bad' => 0, 'warn' => 1, 'never' => 2, 'ok' => 3];
    usort($list, function ($a, $b) use ($sort, $dir, $rank) {
        $va = $sort === 'health' ? $rank[$a['state']] : ($sort === 'online' ? (int)($a['stats']['active'] ?? 0) : ($sort === 'line' ? (float)($a['speed']['downMbps'] ?? 0) : $a[$sort]));
        $vb = $sort === 'health' ? $rank[$b['state']] : ($sort === 'online' ? (int)($b['stats']['active'] ?? 0) : ($sort === 'line' ? (float)($b['speed']['downMbps'] ?? 0) : $b[$sort]));
        return ($va <=> $vb) * $dir ?: strcmp($a['centre'] . $a['label'], $b['centre'] . $b['label']);
    });
    // "Select all N matching": the ids under the same filter, in one request (admin.wifi.gateways.ids).
    if (!empty($p['idsOnly'])) return ['ok' => true, 'ids' => array_column($list, 'gatewayId'), 'total' => count($list)];
    $size = max(1, min(WIFI_PAGE_MAX, (int)($p['pageSize'] ?? 25)));
    $page = max(1, (int)($p['page'] ?? 1));
    if (!$seesRegions) unset($facets['region']);
    return ['ok' => true, 'total' => count($list), 'page' => $page, 'pageSize' => $size, 'facets' => $facets, 'regions' => $seesRegions,
            'gateways' => array_slice($list, ($page - 1) * $size, $size)];
}

/**
 * The centres in scope, with their region and their Wi-Fi at a glance: for
 * putting centres into regions and seeing which have none. Paged, searched,
 * faceted by region and by whether Wi-Fi is set up.
 */
function admin_wifi_centres(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $scope = $g['scope'];
    $region = [];
    foreach (db_all('SELECT rc.centre, rc.regionId, g.name FROM wifi_region_centres rc JOIN wifi_regions g ON g.regionId = rc.regionId AND (g.removedAt = \'\' OR g.removedAt IS NULL)') as $x) $region[(string)$x['centre']] = [(string)$x['regionId'], (string)$x['name']];
    if (!wifi_regions_allowed($g['requester'])) { $region = []; $p['region'] = ''; }
    $gw = wifi_gateway_rollup();
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $fr = (string)($p['region'] ?? ''); $fs = (string)($p['setup'] ?? '');
    $all = [];
    foreach (db_all("SELECT name, code FROM centres WHERE status IS NULL OR status <> 'retired' ORDER BY name") as $c) {
        $n = (string)$c['name'];
        if (!wifi_scope_has($scope, $n)) continue;
        $x = $gw[$n] ?? null;
        $all[] = ['centre' => $n, 'code' => (string)$c['code'], 'regionId' => $region[$n][0] ?? '', 'region' => $region[$n][1] ?? '',
                  'setup' => $x ? 'yes' : 'no'] + ($x ?? ['gateways' => 0, 'working' => 0, 'warn' => 0, 'bad' => 0, 'never' => 0, 'people' => 0, 'online' => 0]);
    }
    $match = fn($o, $skip = '') => ($q === '' || strpos(mb_strtolower($o['centre'] . ' ' . $o['code'] . ' ' . $o['region']), $q) !== false)
        && ($skip === 'region' || $fr === '' || ($fr === '_none' ? $o['regionId'] === '' : $o['regionId'] === $fr))
        && ($skip === 'setup' || $fs === '' || $o['setup'] === $fs);
    $facets = ['region' => [], 'setup' => []];
    foreach ($all as $o) {
        if ($match($o, 'region')) { $k = $o['regionId'] ?: '_none'; $facets['region'][$k] = ($facets['region'][$k] ?? 0) + 1; }
        if ($match($o, 'setup')) $facets['setup'][$o['setup']] = ($facets['setup'][$o['setup']] ?? 0) + 1;
    }
    $list = array_values(array_filter($all, fn($o) => $match($o)));
    $size = max(1, min(WIFI_PAGE_MAX, (int)($p['pageSize'] ?? 25)));
    $page = max(1, (int)($p['page'] ?? 1));
    $out = ['ok' => true, 'total' => count($list), 'page' => $page, 'pageSize' => $size, 'facets' => $facets, 'centres' => array_slice($list, ($page - 1) * $size, $size)];
    // "Select all N matching" is one request, not paging.
    if (!empty($p['idsOnly'])) $out['all'] = array_column($list, 'centre');
    return $out;
}

/* ── Analytics ──────────────────────────────────────────────────────────── */

/**
 * Wi-Fi analytics for the requester's scope, optionally one region or one
 * centre, over 7, 30 or 90 days: people online per day (peak and average),
 * how much of the day gateways were there, line speed over time, the busy
 * hours of the week, the busiest and slowest centres, the least available
 * gateways, and the health of each region now. All from the hourly and daily
 * summaries and the speed tests — no record of who was online or what they
 * visited exists to draw on.
 */
function admin_wifi_analytics(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $scope = $g['scope'];
    $days = in_array((int)($p['days'] ?? 30), [7, 30, 90], true) ? (int)$p['days'] : 30;
    $seesRegions = wifi_regions_allowed($g['requester']);
    $fr = $seesRegions ? (string)($p['region'] ?? '') : ''; $fc = (string)($p['centre'] ?? '');
    $regionOf = [];
    foreach (db_all('SELECT centre, regionId FROM wifi_region_centres') as $x) $regionOf[(string)$x['centre']] = (string)$x['regionId'];
    $inView = fn($c) => wifi_scope_has($scope, $c) && ($fc === '' || $c === $fc) && ($fr === '' || ($regionOf[$c] ?? '') === $fr);
    $all = array_values(array_filter(db_all("SELECT gatewayId, centre, label, platform, createdAt, lastSeenAt FROM wifi_gateways WHERE removedAt = '' OR removedAt IS NULL"), fn($r) => $inView((string)$r['centre'])));
    // A gateway never set up has no hours to count; it is named apart (gatewaysNever), not counted as down.
    $gws = array_values(array_filter($all, fn($r) => (string)$r['lastSeenAt'] !== ''));
    $never = count($all) - count($gws);
    $ids = array_column($gws, 'gatewayId');
    $byId = array_column($gws, null, 'gatewayId');
    $from = gmdate('Y-m-d', time() - ($days - 1) * 86400);
    $dates = [];
    for ($i = $days - 1; $i >= 0; $i--) $dates[] = gmdate('Y-m-d', time() - $i * 86400);

    $daily = [];       // date => {peak, avgSum, avgN, hoursUp, gateways}
    $perGw = [];       // gatewayId => {hoursUp, days, peak}
    foreach ($ids ? array_chunk($ids, 400) : [] as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT * FROM wifi_gateway_daily WHERE gatewayId IN ($ph) AND date >= ?", array_merge($chunk, [$from])) as $d) {
            $dt = (string)$d['date']; $gid = (string)$d['gatewayId'];
            $x = $daily[$dt] ?? ['peak' => 0, 'avgSum' => 0.0, 'gateways' => 0, 'hoursUp' => 0];
            $x['peak'] += (int)$d['activePeak'];
            $x['avgSum'] += (int)$d['activeSamples'] ? (int)$d['activeSum'] / (int)$d['activeSamples'] : 0;
            $x['gateways']++; $x['hoursUp'] += (int)$d['hoursUp'];
            $daily[$dt] = $x;
            $y = $perGw[$gid] ?? ['hoursUp' => 0, 'peak' => 0];
            $y['hoursUp'] += (int)$d['hoursUp']; $y['peak'] = max($y['peak'], (int)$d['activePeak']);
            $perGw[$gid] = $y;
        }
    }
    $nGw = count($gws);
    $series = array_map(function ($dt) use ($daily, $nGw) {
        $x = $daily[$dt] ?? null;
        // A day not over yet counts only the hours so far.
        $hours = $dt === gmdate('Y-m-d') ? (int)gmdate('G') + 1 : 24;
        return ['date' => $dt, 'peakOnline' => $x ? $x['peak'] : 0, 'avgOnline' => $x ? round($x['avgSum'], 1) : 0,
                'availability' => $nGw ? round(min(100, 100 * ($x ? $x['hoursUp'] : 0) / ($nGw * $hours)), 1) : null, 'gatewaysSeen' => $x ? $x['gateways'] : 0];
    }, $dates);

    // The week's shape: average people online by weekday and hour (centre time), from the last 14 days of hourly rows.
    $off = (int)(function_exists('attendance_settings') ? (attendance_settings()['tzOffset'] ?? 60) : 60);
    $heat = array_fill(0, 7, array_fill(0, 24, ['s' => 0, 'n' => 0]));
    foreach ($ids ? array_chunk($ids, 400) : [] as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT hour, SUM(activeMax) a FROM wifi_gateway_stats WHERE gatewayId IN ($ph) AND hour >= ? GROUP BY hour", array_merge($chunk, [gmdate('Y-m-d\TH', time() - 14 * 86400)])) as $h) {
            $t = (int)strtotime((string)$h['hour'] . ':00:00Z') + $off * 60;
            $dow = ((int)gmdate('N', $t)) - 1; $hr = (int)gmdate('G', $t);
            $heat[$dow][$hr]['s'] += (int)$h['a']; $heat[$dow][$hr]['n']++;
        }
    }
    $heatmap = array_map(fn($row) => array_map(fn($c) => $c['n'] ? round($c['s'] / $c['n'], 1) : 0, $row), $heat);

    // Line speed over time and per centre: the speed tests in view.
    $tests = array_values(array_filter(db_all('SELECT centre, source, downMbps, upMbps, rttMs, at FROM wifi_speed_tests WHERE at >= ? ORDER BY at', [$from . 'T00:00:00Z']), fn($t) => $inView((string)$t['centre'])));
    $speedByDay = [];
    foreach ($tests as $t) { $d = substr((string)$t['at'], 0, 10); $speedByDay[$d][] = (float)$t['downMbps']; }
    $speedSeries = array_map(fn($dt) => ['date' => $dt, 'medianDown' => isset($speedByDay[$dt]) ? wifi_median($speedByDay[$dt]) : null, 'tests' => count($speedByDay[$dt] ?? [])], $dates);
    $latest = [];
    foreach ($tests as $t) $latest[(string)$t['centre']] = $t;

    // Rankings.
    $centrePeak = [];
    foreach ($perGw as $gid => $y) { $c = (string)$byId[$gid]['centre']; $centrePeak[$c] = ($centrePeak[$c] ?? 0) + $y['peak']; }
    arsort($centrePeak);
    $busiest = array_map(fn($c) => ['centre' => $c, 'peak' => $centrePeak[$c], 'line' => isset($latest[$c]) ? (float)$latest[$c]['downMbps'] : null], array_slice(array_keys($centrePeak), 0, 10));
    $slow = array_values($latest); usort($slow, fn($a, $b) => (float)$a['downMbps'] <=> (float)$b['downMbps']);
    $slowest = array_map(fn($t) => ['centre' => (string)$t['centre'], 'downMbps' => (float)$t['downMbps'], 'rttMs' => (int)$t['rttMs'], 'at' => (string)$t['at']], array_slice($slow, 0, 10));
    $avail = [];
    foreach ($gws as $r) {
        $gid = (string)$r['gatewayId'];
        // Only the days since the gateway was added count against it.
        $since = max(strtotime($from . 'T00:00:00Z'), (int)strtotime((string)$r['createdAt']));
        $hoursPossible = max(1, (int)floor((time() - $since) / 3600) + 1);
        $avail[] = ['gatewayId' => $gid, 'label' => (string)$r['label'], 'centre' => (string)$r['centre'],
                    'availability' => round(min(100, 100 * (($perGw[$gid]['hoursUp'] ?? 0) / $hoursPossible)), 1)];
    }
    usort($avail, fn($a, $b) => $a['availability'] <=> $b['availability']);

    // Health by region, now.
    $roll = wifi_gateway_rollup();
    $regions = [];
    foreach (db_all("SELECT regionId, name FROM wifi_regions WHERE removedAt = '' OR removedAt IS NULL ORDER BY name") as $rg) {
        $cs = array_keys(array_filter($regionOf, fn($rid, $c) => $rid === (string)$rg['regionId'] && $inView($c), ARRAY_FILTER_USE_BOTH));
        if (!$cs) continue;
        $regions[] = ['regionId' => (string)$rg['regionId'], 'name' => (string)$rg['name'], 'centres' => count($cs)] + wifi_rollup_sum($roll, $cs);
    }
    $none = array_values(array_filter(array_keys($roll), fn($c) => !isset($regionOf[$c]) && $inView($c)));
    if ($none) $regions[] = ['regionId' => '', 'name' => 'Not in a region', 'centres' => count($none)] + wifi_rollup_sum($roll, $none);
    if (!$seesRegions) $regions = [];

    $peakVals = array_column($series, 'peakOnline');
    $availVals = array_filter(array_column($series, 'availability'), fn($v) => $v !== null);
    return ['ok' => true, 'days' => $days, 'scope' => ['all' => $scope === null], 'gateways' => count($all), 'gatewaysNever' => $never,
        'summary' => [
            'peakOnline' => $peakVals ? max($peakVals) : 0,
            'avgAvailability' => $availVals ? round(array_sum($availVals) / count($availVals), 1) : null,
            'medianLine' => $latest ? wifi_median(array_map(fn($t) => (float)$t['downMbps'], $latest)) : null,
            'slowCentres' => count(array_filter($latest, fn($t) => (float)$t['downMbps'] < WIFI_SLOW_MBPS)),
            'tests' => count($tests),
        ],
        'series' => $series, 'speedSeries' => $speedSeries, 'heatmap' => $heatmap,
        'busiest' => $busiest, 'slowest' => $slowest, 'leastAvailable' => array_slice($avail, 0, 10), 'regions' => $regions];
}

function wifi_median(array $xs): float {
    sort($xs); $n = count($xs);
    if (!$n) return 0.0;
    return round($n % 2 ? $xs[intdiv($n, 2)] : ($xs[$n / 2 - 1] + $xs[$n / 2]) / 2, 1);
}


/** admin.wifi.gateways.ids — every gateway id matching the list's filters, in scope. */
function admin_wifi_gateways_ids(array $p): array { return admin_wifi_gateways(['idsOnly' => true] + $p); }

/* ── Bulk acts on gateways ───────────────────────────────────────────────────
 * One op, two declared actions (CLAUDE.md §6): `test` asks each gateway to
 * measure its line at its next fetch; `rotate` gives each a new key, shown
 * once, for the router's setup. Over a selection of gateway ids, or over a
 * whole region (`regionId`: the Wi-Fi regions capability, or a lead of that
 * region). The whole payload is checked before any write; capped and named;
 * scope refused per row; `unchanged` reported apart (a test already asked);
 * `expect` — the count the operator confirmed — must still be the count, so
 * a list that grew underneath cannot change what was agreed; one audit event.
 */
const WIFI_BULK_MAX = 500;
const WIFI_BULK_ACTIONS = ['test', 'rotate'];

function admin_wifi_gateways_bulk(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $action = (string)($p['action'] ?? '');
    if (!in_array($action, WIFI_BULK_ACTIONS, true)) return ['ok' => false, 'error' => 'unknown_action'];
    $by = (string)$g['requester']['memberId'];
    $regionId = trim((string)($p['regionId'] ?? ''));
    if ($regionId !== '') {
        $reg = db_row("SELECT * FROM wifi_regions WHERE regionId = ? AND (removedAt = '' OR removedAt IS NULL) LIMIT 1", [$regionId]);
        if (!$reg) return ['ok' => false, 'error' => 'not_found'];
        $lead = (bool)db_row('SELECT 1 FROM wifi_region_leads WHERE regionId = ? AND memberId = ? LIMIT 1', [$regionId, $by]);
        if (!$lead && !wifi_regions_allowed($g['requester'])) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:wifi_regions'];
        $ids = array_column(db_all("SELECT w.gatewayId FROM wifi_gateways w JOIN wifi_region_centres rc ON rc.centre = w.centre
                                    WHERE rc.regionId = ? AND (w.removedAt = '' OR w.removedAt IS NULL) ORDER BY w.centre, w.label", [$regionId]), 'gatewayId');
    } else {
        $ids = is_array($p['gatewayIds'] ?? null) ? array_values(array_unique(array_map('strval', $p['gatewayIds']))) : [];
    }
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > WIFI_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => WIFI_BULK_MAX, 'detail' => 'At most ' . WIFI_BULK_MAX . ' gateways at a time.'];
    if (isset($p['expect']) && (int)$p['expect'] !== count($ids)) return ['ok' => false, 'error' => 'count_changed', 'count' => count($ids), 'detail' => 'The list changed: it is now ' . count($ids) . '. Check and confirm again.'];
    // Validate every row before writing any.
    $rows = []; $results = [];
    foreach ($ids as $id) {
        $f = wifi_gateway_for($g, $id);
        if (!$f['ok']) { $results[$id] = ['gatewayId' => $id, 'ok' => false, 'error' => $f['error']]; continue; }
        $rows[$id] = $f['row'];
    }
    $applied = 0; $unchanged = 0;
    foreach ($rows as $id => $r) {
        if ($action === 'test') {
            if ((int)($r['testAsked'] ?? 0) === 1) { $results[$id] = ['gatewayId' => $id, 'ok' => true, 'unchanged' => true]; $unchanged++; continue; }
            db_update('wifi_gateways', ['testAsked' => 1], ['id' => (int)$r['id']]);
            $results[$id] = ['gatewayId' => $id, 'ok' => true];
        } else {
            $key = wifi_key_new();
            db_update('wifi_gateways', ['keyHash' => hash('sha256', $key), 'keyTail' => substr($key, -4), 'keySetAt' => now_iso()], ['id' => (int)$r['id']]);
            $results[$id] = ['gatewayId' => $id, 'ok' => true, 'key' => $key, 'label' => (string)$r['label'], 'centre' => (string)$r['centre']];
        }
        $applied++;
    }
    $refused = count($ids) - count($rows);
    audit('wifi.gateway.bulk', $by, $regionId !== '' ? 'region:' . $regionId : 'selection', ['action' => $action, 'count' => count($ids), 'applied' => $applied,
        'unchanged' => $unchanged, 'refused' => $refused, 'refusals' => array_values(array_filter($results, fn($x) => !$x['ok']))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'action' => $action, 'ran' => count($ids), 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused,
            'results' => array_map(fn($id) => $results[$id], $ids)];
}

/* ── A silent gateway is told to a person ────────────────────────────────────
 * A gateway that has fetched before and has not for an hour is "silent": the
 * centre's people may be locked out of the Wi-Fi, or kept on it after their
 * access ended. Every fifteen minutes (web cron `wifi_silent`), each newly
 * silent gateway goes into ONE digest per person — never one email per
 * gateway — and is marked so the same silence is not told twice; its next
 * fetch clears the mark (wifi_feed), so a second silence is told again.
 *
 * Who: the leads of the gateway's Wi-Fi region (who hold `network`). A centre
 * with no region, or a region with no lead, goes to the network staff whose
 * Wi-Fi scope names the centre; failing those, the network staff who see every
 * centre. Somebody always hears.
 */
const WIFI_SILENT_AFTER = 3600;     // seconds without a fetch
const WIFI_DIGEST_LINES = 40;       // gateways listed in one digest; the rest are counted

function wifi_silent_digest(?int $now = null): array {
    $now = $now ?? time();
    $cut = gmdate('Y-m-d\TH:i:s\Z', $now - WIFI_SILENT_AFTER);
    $rows = db_all("SELECT * FROM wifi_gateways WHERE (removedAt = '' OR removedAt IS NULL) AND lastSeenAt <> '' AND lastSeenAt < ? AND silentAlertAt = '' ORDER BY centre, label", [$cut]);
    if (!$rows) return ['ok' => true, 'silent' => 0, 'people' => 0];
    $staff = staff_with_cap('network');
    $byId = []; foreach ($staff as $m) $byId[(string)$m['memberId']] = $m;
    $regionOf = []; foreach (db_all("SELECT rc.centre, rc.regionId FROM wifi_region_centres rc JOIN wifi_regions g ON g.regionId = rc.regionId AND (g.removedAt = '' OR g.removedAt IS NULL)") as $x) $regionOf[(string)$x['centre']] = (string)$x['regionId'];
    $leads = []; foreach (db_all('SELECT regionId, memberId FROM wifi_region_leads') as $x) if (isset($byId[(string)$x['memberId']])) $leads[(string)$x['regionId']][] = (string)$x['memberId'];
    $scopes = []; foreach ($staff as $m) $scopes[(string)$m['memberId']] = wifi_scope($m);
    $to = [];
    foreach ($rows as $r) {
        $c = (string)$r['centre'];
        $who = $leads[$regionOf[$c] ?? ''] ?? [];
        if (!$who) foreach ($scopes as $mid => $sc) if ($sc !== null && in_array($c, $sc, true)) $who[] = $mid;
        if (!$who) foreach ($scopes as $mid => $sc) if ($sc === null) $who[] = $mid;
        foreach (array_unique($who) as $mid) $to[$mid][] = $r;
    }
    $people = 0;
    foreach ($to as $mid => $list) {
        $n = count($list);
        $lines = array_map(fn($r) => '· ' . ((string)$r['label'] !== '' ? (string)$r['label'] : (string)$r['gatewayId']) . ' at ' . (string)$r['centre']
            . ' — last heard ' . gmdate('j M, H:i', (int)strtotime((string)$r['lastSeenAt'])) . ' UTC', array_slice($list, 0, WIFI_DIGEST_LINES));
        if ($n > WIFI_DIGEST_LINES) $lines[] = '…and ' . ($n - WIFI_DIGEST_LINES) . ' more.';
        notify_people([$byId[$mid]], ['kind' => 'wifi', 'eyebrow' => 'NGG · Wi-Fi',
            'title' => $n === 1 ? 'A Wi-Fi gateway has gone silent' : $n . ' Wi-Fi gateways have gone silent',
            'intro' => ($n === 1 ? 'It has' : 'They have') . ' not fetched the list for over an hour. People may not be able to get on, or may stay on after their access ends.',
            'body' => implode("\n", $lines) . "\n\nCheck the router has power and internet, then open it in Wi-Fi → Gateways: its diagnosis says what it last reported.",
            'linkPage' => 'wifi', 'ctaPath' => '/club/wifi-gateways', 'ctaLabel' => 'Open Wi-Fi gateways →']);
        $people++;
    }
    $stamp = gmdate('Y-m-d\TH:i:s\Z', $now);
    foreach ($rows as $r) db_update('wifi_gateways', ['silentAlertAt' => $stamp], ['id' => (int)$r['id']]);
    audit('wifi.silent.digest', 'system', 'wifi', ['gateways' => count($rows), 'people' => $people]);
    return ['ok' => true, 'silent' => count($rows), 'people' => $people];
}

/* ── What the feed costs this host ───────────────────────────────────────────
 * Measured, not guessed, before more than one pilot region goes live: every
 * fetch adds its wall time (from the request's start, so bootstrap is in it),
 * its bytes and its peak memory to the hour (wifi_feed_load, kept 30 days),
 * with time buckets so a slow tail shows. admin.wifi.load turns that into
 * requests a second today and, at the gateway count planned, a projection
 * against a budget for shared hosting.
 */
const WIFI_LOAD_BUCKETS = [25 => 'b25', 50 => 'b50', 100 => 'b100', 250 => 'b250', 500 => 'b500'];
const WIFI_LOAD_BUDGET = 0.25;      // busy-seconds per second the feed may use (a quarter of one worker)
const WIFI_LOAD_PLAN_DEFAULT = 2000;
const WIFI_LOAD_MIN_SAMPLE = 100;   // fetches before a verdict

function wifi_load_record(float $ms, int $bytes, bool $ok, ?string $hour = null): void {
    $hour = $hour ?? gmdate('Y-m-d\TH');
    $ms = (int)round(max(0, $ms)); $kb = (int)ceil(memory_get_peak_usage() / 1024);
    $col = 'bOver'; foreach (WIFI_LOAD_BUCKETS as $lim => $c) if ($ms < $lim) { $col = $c; break; }
    $set = "fetches = fetches + 1, failed = failed + ?, msTotal = msTotal + ?, bytesTotal = bytesTotal + ?, $col = $col + 1,
            msMax = CASE WHEN msMax < ? THEN ? ELSE msMax END, memMaxKb = CASE WHEN memMaxKb < ? THEN ? ELSE memMaxKb END";
    $args = [$ok ? 0 : 1, $ms, $bytes, $ms, $ms, $kb, $kb, $hour];
    try {
        if (db_exec("UPDATE wifi_feed_load SET $set WHERE hour = ?", $args) > 0) return;
        try { db_insert('wifi_feed_load', ['hour' => $hour, 'fetches' => 1, 'failed' => $ok ? 0 : 1, 'msTotal' => $ms, 'msMax' => $ms, 'bytesTotal' => $bytes, 'memMaxKb' => $kb, $col => 1]); }
        catch (Throwable $e) { db_exec("UPDATE wifi_feed_load SET $set WHERE hour = ?", $args); /* a concurrent fetch made the hour first */ }
        if (random_int(1, 200) === 1) db_exec('DELETE FROM wifi_feed_load WHERE hour < ?', [gmdate('Y-m-d\TH', time() - 30 * 86400)]);
    } catch (Throwable $e) { /* measuring never breaks a fetch */ }
}

/** admin.wifi.load — the feed's measured cost, and what it would be at the planned size. Network-wide: the Wi-Fi regions capability. */
function admin_wifi_load(array $p): array {
    $g = wifi_network_gate($p); if (!$g['ok']) return $g;
    $hours = db_all('SELECT * FROM wifi_feed_load WHERE hour >= ? ORDER BY hour', [gmdate('Y-m-d\TH', time() - 24 * 3600)]);
    $t = ['fetches' => 0, 'failed' => 0, 'msTotal' => 0, 'msMax' => 0, 'bytesTotal' => 0, 'memMaxKb' => 0];
    $b = array_fill_keys(array_merge(array_values(WIFI_LOAD_BUCKETS), ['bOver']), 0);
    foreach ($hours as $h) {
        foreach (['fetches', 'failed', 'msTotal', 'bytesTotal'] as $k) $t[$k] += (int)$h[$k];
        $t['msMax'] = max($t['msMax'], (int)$h['msMax']); $t['memMaxKb'] = max($t['memMaxKb'], (int)$h['memMaxKb']);
        foreach ($b as $k => $_) $b[$k] += (int)$h[$k];
    }
    $avg = $t['fetches'] ? $t['msTotal'] / $t['fetches'] : 0.0;
    // p95 from the buckets: the upper edge of the bucket the 95th-percentile fetch falls in.
    $p95 = 0; $acc = 0; $edges = array_flip(WIFI_LOAD_BUCKETS) + ['bOver' => max(500, $t['msMax'])];
    foreach ($b as $k => $n) { $acc += $n; if ($t['fetches'] && $acc >= 0.95 * $t['fetches']) { $p95 = (int)$edges[$k]; break; } }
    $gw = (int)(db_row("SELECT COUNT(*) c FROM wifi_gateways WHERE removedAt = '' OR removedAt IS NULL")['c'] ?? 0);
    $span = max(1, count($hours)) * 3600;
    $plan = max(1, min(100000, (int)($p['plan'] ?? WIFI_LOAD_PLAN_DEFAULT)));
    $poll = in_array((int)($p['poll'] ?? 0), array_values(WIFI_POLL), true) ? (int)$p['poll'] : WIFI_POLL['idle'];
    $planRps = $plan / $poll;
    $busy = $planRps * $avg / 1000;
    $verdict = $t['fetches'] < WIFI_LOAD_MIN_SAMPLE ? 'unmeasured' : ($busy <= WIFI_LOAD_BUDGET ? 'fine' : ($busy <= 2 * WIFI_LOAD_BUDGET ? 'watch' : 'too_much'));
    $regionsLive = (int)(db_row("SELECT COUNT(DISTINCT rc.regionId) c FROM wifi_gateways w JOIN wifi_region_centres rc ON rc.centre = w.centre WHERE (w.removedAt = '' OR w.removedAt IS NULL) AND w.lastSeenAt <> ''")['c'] ?? 0);
    return ['ok' => true,
        'hours' => array_map(fn($h) => ['hour' => (string)$h['hour'], 'fetches' => (int)$h['fetches'], 'avgMs' => (int)$h['fetches'] ? round((int)$h['msTotal'] / (int)$h['fetches'], 1) : 0, 'maxMs' => (int)$h['msMax']], $hours),
        'measured' => ['fetches' => $t['fetches'], 'failed' => $t['failed'], 'avgMs' => round($avg, 1), 'p95Ms' => $p95, 'maxMs' => $t['msMax'],
            'avgBytes' => $t['fetches'] ? (int)round($t['bytesTotal'] / $t['fetches']) : 0, 'memMaxKb' => $t['memMaxKb'], 'rps' => round($t['fetches'] / $span, 3), 'buckets' => $b],
        'gateways' => $gw, 'regionsLive' => $regionsLive,
        'plan' => ['gateways' => $plan, 'poll' => $poll, 'rps' => round($planRps, 2), 'busy' => round($busy, 3), 'budget' => WIFI_LOAD_BUDGET, 'verdict' => $verdict,
            'advice' => ['unmeasured' => 'Not enough fetches yet to say. Let the pilot region run for a day first.',
                'fine' => 'Within budget for shared hosting at this size. More regions can go live.',
                'watch' => 'Close to the budget. Go live a region at a time and look again, or move the idle poll to five minutes.',
                'too_much' => 'Over budget. Serve the feed from a small separate host, or lengthen the poll, before more regions go live.'][$verdict]]];
}
