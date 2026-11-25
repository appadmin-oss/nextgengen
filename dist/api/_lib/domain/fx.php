<?php
/**
 * Prices in the family's own currency (owner, 25 Nov 2026: "Prices should be displayed in local currencies").
 *
 * The account is kept, invoiced and paid in NAIRA — Paystack charges naira, and every ledger, receipt and
 * report here is naira. What changes is what a family abroad READS: "₦13,000 · about £7" beside the price, so a
 * parent in London or Accra knows what they are agreeing to before they apply.
 *
 * Rates are naira per one unit of a currency. Three sources, most trusted first:
 *   1. a rate staff PIN by hand (Money → Currencies) — for a promise like "$10 a month, that's ₦13,000";
 *   2. the daily refresh (`mode` auto) from a free, keyless public feed (open.er-api.com), stored with its time;
 *   3. for US dollars only, the dollar price staff already set for NGG Online (₦13,000 ÷ $10), so dollars show
 *      before the first refresh has ever run.
 * A currency with none of these is not shown — an invented rate is worse than naira alone. Every figure is
 * labelled "about", and the browser chooses the currency from the device's time zone, which the family can change.
 */

/** The currencies a family may read prices in. symbol · name · digits shown. */
const FX_CURRENCIES = [
    'NGN' => ['₦', 'Nigerian naira', 0], 'USD' => ['$', 'US dollar', 0], 'GBP' => ['£', 'British pound', 0],
    'EUR' => ['€', 'Euro', 0], 'CAD' => ['CA$', 'Canadian dollar', 0], 'GHS' => ['GH₵', 'Ghanaian cedi', 0],
    'KES' => ['KSh', 'Kenyan shilling', 0], 'ZAR' => ['R', 'South African rand', 0], 'XOF' => ['CFA', 'West African CFA franc', 0],
    'AED' => ['AED ', 'UAE dirham', 0], 'SAR' => ['SAR ', 'Saudi riyal', 0], 'AUD' => ['A$', 'Australian dollar', 0],
    'INR' => ['₹', 'Indian rupee', 0], 'CNY' => ['¥', 'Chinese yuan', 0],
];
const FX_SETTING = 'fx';
const FX_FEED = 'https://open.er-api.com/v6/latest/NGN';
/** A fetched rate outside these bounds (naira per unit) is refused as a bad feed, not believed. */
const FX_SANE = ['USD' => [100, 100000], 'GBP' => [100, 150000], 'EUR' => [100, 120000]];
const FX_STALE_DAYS = 7;

function fx_settings(): array {
    $s = setting_get(FX_SETTING);
    $s = is_array($s) ? $s : [];
    return ['mode' => in_array($s['mode'] ?? '', ['auto', 'manual'], true) ? (string)$s['mode'] : 'auto',
        'fetched' => is_array($s['fetched'] ?? null) ? $s['fetched'] : [], 'fetchedAt' => (string)($s['fetchedAt'] ?? ''),
        'pinned' => is_array($s['pinned'] ?? null) ? $s['pinned'] : [], 'error' => (string)($s['error'] ?? '')];
}

/** Effective rates (naira per unit) with where each came from. */
function fx_rates(?array $s = null): array {
    $s = $s ?? fx_settings(); $out = [];
    foreach (array_keys(FX_CURRENCIES) as $c) {
        if ($c === 'NGN') continue;
        if (isset($s['pinned'][$c]) && (float)$s['pinned'][$c] > 0) { $out[$c] = ['rate' => (float)$s['pinned'][$c], 'source' => 'pinned']; continue; }
        if ($s['mode'] === 'auto' && isset($s['fetched'][$c]) && (float)$s['fetched'][$c] > 0) { $out[$c] = ['rate' => (float)$s['fetched'][$c], 'source' => 'feed']; continue; }
        if ($c === 'USD' && function_exists('fees_settings')) {
            $f = fees_settings();
            if ((int)$f['onlineMonthlyUsd'] > 0 && (int)$f['onlineMonthly'] > 0) $out[$c] = ['rate' => (int)$f['onlineMonthly'] / (int)$f['onlineMonthlyUsd'], 'source' => 'price'];
        }
    }
    return $out;
}

/** "$8" — a naira amount in US dollars, rounded, or '' when no dollar rate is known. */
function fx_usd_text(int $naira): string {
    $r = fx_rates()['USD']['rate'] ?? 0;
    return $r > 0 ? '$' . number_format(max(1, round($naira / $r))) : '';
}

/** Ask the feed. Never throws; a bad answer is recorded and the last good rates stay. */
function fx_refresh(): array {
    $s = fx_settings();
    $r = function_exists('sms_http') ? sms_http(FX_FEED, [CURLOPT_HTTPHEADER => ['Accept: application/json']]) : ['ok' => false, 'error' => 'no_http'];
    $j = !empty($r['ok']) ? json_decode((string)$r['body'], true) : null;
    $raw = is_array($j) && ($j['result'] ?? '') === 'success' && is_array($j['rates'] ?? null) ? $j['rates'] : null;
    $stored = setting_get(FX_SETTING); $stored = is_array($stored) ? $stored : [];
    if (!$raw) {
        $stored['error'] = 'The rate feed did not answer (' . (string)($r['error'] ?? 'bad reply') . '). The last rates stay in use.';
        setting_set(FX_SETTING, $stored, 'system');
        return ['ok' => false, 'error' => 'feed_failed'];
    }
    $rates = [];
    foreach (array_keys(FX_CURRENCIES) as $c) {
        if ($c === 'NGN' || !isset($raw[$c]) || (float)$raw[$c] <= 0) continue;
        $perUnit = 1 / (float)$raw[$c];
        if (isset(FX_SANE[$c]) && ($perUnit < FX_SANE[$c][0] || $perUnit > FX_SANE[$c][1])) {
            $stored['error'] = 'The feed gave ' . $c . ' at ₦' . round($perUnit, 2) . ', which is not believable. Nothing was changed.';
            setting_set(FX_SETTING, $stored, 'system');
            return ['ok' => false, 'error' => 'insane_rate'];
        }
        $rates[$c] = round($perUnit, 4);
    }
    $stored['fetched'] = $rates; $stored['fetchedAt'] = now_iso(); $stored['error'] = '';
    setting_set(FX_SETTING, $stored, 'system');
    if (function_exists('cache_invalidate')) cache_invalidate('fx');
    return ['ok' => true, 'rates' => count($rates)];
}

/** The daily refresh (webcron): only in auto mode. */
function fx_tick(): array { return fx_settings()['mode'] === 'auto' ? fx_refresh() : ['skipped' => 'manual']; }

/** public.fx — what the browser needs to show a price in a family's currency. No member data. */
function public_fx(array $p = []): array {
    $s = fx_settings(); $rates = fx_rates($s); $cur = [];
    foreach (FX_CURRENCIES as $c => [$sym, $name, $dp]) if ($c === 'NGN' || isset($rates[$c])) $cur[] = ['code' => $c, 'symbol' => $sym, 'name' => $name];
    $f = function_exists('fees_settings') ? fees_settings() : [];
    return ['ok' => true, 'base' => 'NGN', 'rates' => array_map(static fn($r) => $r['rate'], $rates), 'currencies' => $cur, 'updatedAt' => $s['fetchedAt'],
        // The dollar figures staff promise for NGG Online: shown exactly, never re-converted, for US dollars.
        'stated' => ['USD' => array_filter([(string)($f['onlineMonthly'] ?? '') => (int)($f['onlineMonthlyUsd'] ?? 0), (string)($f['onlineCourseFee'] ?? '') => (int)($f['onlineCourseUsd'] ?? 0)])]];
}

/** admin.fx — the rates, where each came from, and how fresh the feed is. */
function admin_fx(array $p): array {
    $g = admin_cap_gate_any($p, ['fees', 'settings']); if (!$g['ok']) return $g;
    $s = fx_settings(); $rates = fx_rates($s); $rows = [];
    foreach (FX_CURRENCIES as $c => [$sym, $name]) if ($c !== 'NGN')
        $rows[] = ['code' => $c, 'symbol' => $sym, 'name' => $name, 'rate' => $rates[$c]['rate'] ?? null, 'source' => $rates[$c]['source'] ?? '',
            'pinned' => isset($s['pinned'][$c]) ? (float)$s['pinned'][$c] : null, 'fetched' => isset($s['fetched'][$c]) ? (float)$s['fetched'][$c] : null];
    $stale = $s['fetchedAt'] !== '' && strtotime($s['fetchedAt']) < time() - FX_STALE_DAYS * 86400;
    return ['ok' => true, 'mode' => $s['mode'], 'fetchedAt' => $s['fetchedAt'], 'stale' => $stale, 'error' => $s['error'], 'currencies' => $rows, 'feed' => FX_FEED];
}

/** admin.fx.save {mode?, pinned: {CODE: nairaPerUnit|null}} — pin or clear rates; validated whole before writing. */
function admin_fx_save(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $stored = setting_get(FX_SETTING); $stored = is_array($stored) ? $stored : [];
    if (isset($p['mode'])) {
        if (!in_array($p['mode'], ['auto', 'manual'], true)) return ['ok' => false, 'error' => 'bad_mode'];
        $stored['mode'] = (string)$p['mode'];
    }
    $pinned = is_array($stored['pinned'] ?? null) ? $stored['pinned'] : [];
    foreach ((array)($p['pinned'] ?? []) as $c => $v) {
        $c = strtoupper((string)$c);
        if (!isset(FX_CURRENCIES[$c]) || $c === 'NGN') return ['ok' => false, 'error' => 'unknown_currency', 'detail' => $c];
        if ($v === null || $v === '' || (float)$v == 0.0) { unset($pinned[$c]); continue; }
        if (!is_numeric($v) || (float)$v < 0.0001 || (float)$v > 1000000) return ['ok' => false, 'error' => 'bad_rate', 'detail' => 'Give the naira for one ' . FX_CURRENCIES[$c][1] . ', e.g. 1550.'];
        $pinned[$c] = round((float)$v, 4);
    }
    $stored['pinned'] = $pinned;
    setting_set(FX_SETTING, $stored, (string)$g['requester']['memberId']);
    if (function_exists('cache_invalidate')) cache_invalidate('fx');
    audit('fx.save', (string)$g['requester']['memberId'], 'fx', ['mode' => $stored['mode'] ?? 'auto', 'pinned' => $pinned]);
    return admin_fx($p);
}

/** admin.fx.refresh — ask the feed now. */
function admin_fx_refresh(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $r = fx_refresh();
    return ['ok' => true, 'refreshed' => !empty($r['ok'])] + admin_fx($p);
}
