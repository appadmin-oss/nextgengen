<?php
declare(strict_types=1);

/**
 * Wi-Fi data used — per person, per day, per centre — and the allowances that
 * act on it (owner, 2026-10-28: "Build the Wi-Fi usage tracking, staff and
 * members only, with limits").
 *
 * HOW IT ARRIVES. A gateway that can count (MikroTik, or anything speaking the
 * JSON feed) posts its live sessions to wifi.usage with its own key: who is
 * signed in and the bytes each session has moved so far. Sessions are counted
 * by the router from the moment they start, so NGG keeps each session's last
 * counters (wifi_usage_sessions) and adds only the difference; a counter that
 * goes DOWN is a new session (or a reboot) and counts from zero. What a session
 * moved after its last report and before it ended is lost — at most one poll
 * interval, a few minutes. The figures are a measure, not a bill.
 *
 * WHAT IS KEPT. Bytes down and up, per person, per day, per centre
 * (wifi_usage_daily). Never which sites, never when within the day, never the
 * device. Daily rows are kept 400 days, sessions two days.
 *
 * WHO SEES IT. Staff who may look the person up (people, summer or network,
 * centre-scoped as everywhere) and the person themselves in their own app.
 * Not families, not other members.
 *
 * ALLOWANCES. Each profile may carry a daily and a monthly allowance in MB
 * (dayMb / monthMb, 0 for none), layered network → region → centre like its
 * speeds. Somebody over theirs falls into the access table's "overLimit" case
 * — Limited (the slow profile) by default, or Off, or On (watched, never
 * enforced) — at the gateway's next fetch. Their total counts across every
 * centre. A hand-set override still wins: staff can let somebody finish.
 */

const WIFI_USAGE_MAX_SESSIONS = 2000;           // one report
const WIFI_USAGE_MAX_DELTA = 50 * 1024 ** 3;    // a single jump bigger than this is a broken counter, not a download
const WIFI_USAGE_PAGE = 50;

/** The centre's local date (the clock the hours and attendance use). */
function wifi_local_date(?int $at = null): string {
    $off = function_exists('attendance_settings') ? (int)(attendance_settings()['tzOffset'] ?? 60) : 60;
    return gmdate('Y-m-d', ($at ?? time()) + $off * 60);
}

/**
 * The report a gateway sends: text lines "s;<username>;<session>;<bytes in>;<bytes out>"
 * as the ROUTER counts them (in = what the person sent, out = what they
 * received), or JSON {"sessions":[{"username","session","down","up"}]} from
 * the person's side. Returns [[username, session, down, up], …].
 */
function wifi_usage_parse(string $body, string $type = ''): array {
    $out = [];
    $body = trim($body);
    if ($body === '') return $out;
    if ($body[0] === '{' || stripos($type, 'json') !== false) {
        $d = json_decode($body, true);
        foreach ((array)($d['sessions'] ?? []) as $s) {
            if (!is_array($s)) continue;
            $out[] = [(string)($s['username'] ?? ''), (string)($s['session'] ?? ''), $s['down'] ?? null, $s['up'] ?? null];
        }
    } else {
        foreach (preg_split('/\r?\n/', $body) as $l) {
            $f = explode(';', trim($l));
            if (count($f) < 5 || $f[0] !== 's') continue;
            $out[] = [$f[1], $f[2], $f[4], $f[3]];   // the router's out is the person's down
        }
    }
    $clean = [];
    foreach ($out as [$u, $s, $dn, $up]) {
        if (!preg_match('/^[A-Za-z0-9._-]{1,64}$/', $u) || $s === '' || !is_numeric($dn) || !is_numeric($up)) continue;
        $clean[] = [$u, substr(preg_replace('/[^\w:*.|-]/', '', $s), 0, 80), max(0, (int)$dn), max(0, (int)$up)];
        if (count($clean) >= WIFI_USAGE_MAX_SESSIONS) break;
    }
    return $clean;
}

/** op wifi.usage — a gateway's sessions in; the day's totals out. */
function wifi_usage_ingest(array $p): array {
    $r = wifi_gateway_by_key((string)($p['gatewayId'] ?? ''), (string)($p['key'] ?? ''));
    if (!$r) {
        audit('wifi.usage.bad_key', null, substr(preg_replace('/[^\w]/', '', (string)($p['gatewayId'] ?? '')), 0, 16), [], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'bad_key'];
    }
    $gid = (string)$r['gatewayId']; $centre = (string)$r['centre'];
    $rows = wifi_usage_parse((string)($p['body'] ?? ''), (string)($p['type'] ?? ''));
    $now = now_iso();
    db_update('wifi_gateways', ['usageAt' => $now], ['id' => (int)$r['id']]);
    if (!$rows) return ['ok' => true, 'sessions' => 0, 'people' => 0];

    // Who each sign-in name is — one read.
    $names = array_values(array_unique(array_column($rows, 0)));
    $who = [];
    foreach (array_chunk($names, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT username, subjectType, subjectId FROM wifi_accounts WHERE username IN ($ph)", $chunk) as $a) $who[(string)$a['username']] = [(string)$a['subjectType'], (string)$a['subjectId']];
    }
    // Each session's last word from this gateway — one read.
    $keys = array_map(fn($x) => $x[0] . '|' . $x[1], $rows);
    $prev = [];
    foreach (array_chunk($keys, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT id, sessionKey, bytesIn, bytesOut FROM wifi_usage_sessions WHERE gatewayId = ? AND sessionKey IN ($ph)", array_merge([$gid], $chunk)) as $s) $prev[(string)$s['sessionKey']] = $s;
    }
    $add = [];
    foreach ($rows as [$u, $sess, $down, $up]) {
        $k = $u . '|' . $sess;
        $was = $prev[$k] ?? null;
        // Stored as the person's down (bytesOut, the router's word) and up (bytesIn).
        $dd = $was && $down >= (int)$was['bytesOut'] ? $down - (int)$was['bytesOut'] : $down;
        $du = $was && $up >= (int)$was['bytesIn'] ? $up - (int)$was['bytesIn'] : $up;
        if ($was) db_update('wifi_usage_sessions', ['bytesIn' => $up, 'bytesOut' => $down, 'seenAt' => $now], ['id' => (int)$was['id']]);
        else { try { db_insert('wifi_usage_sessions', ['gatewayId' => $gid, 'sessionKey' => $k, 'username' => $u, 'bytesIn' => $up, 'bytesOut' => $down, 'seenAt' => $now]); } catch (Throwable $e) { continue; } }
        if (!isset($who[$u]) || $dd + $du <= 0 || $dd > WIFI_USAGE_MAX_DELTA || $du > WIFI_USAGE_MAX_DELTA) continue;
        $sk = $who[$u][0] . '|' . $who[$u][1];
        $add[$sk] = [($add[$sk][0] ?? 0) + $dd, ($add[$sk][1] ?? 0) + $du];
    }
    $date = wifi_local_date();
    foreach ($add as $sk => [$dd, $du]) {
        [$t, $id] = explode('|', $sk, 2);
        $row = db_row('SELECT id FROM wifi_usage_daily WHERE subjectType = ? AND subjectId = ? AND date = ? AND centre = ? LIMIT 1', [$t, $id, $date, $centre]);
        if ($row) db_exec('UPDATE wifi_usage_daily SET bytesDown = bytesDown + ?, bytesUp = bytesUp + ?, updatedAt = ? WHERE id = ?', [$dd, $du, $now, (int)$row['id']]);
        else {
            try { db_insert('wifi_usage_daily', ['subjectType' => $t, 'subjectId' => $id, 'centre' => $centre, 'centreId' => (string)($r['centreId'] ?? '') ?: centre_id_for_name($centre), 'date' => $date, 'bytesDown' => $dd, 'bytesUp' => $du, 'updatedAt' => $now]); }
            catch (Throwable $e) { db_exec('UPDATE wifi_usage_daily SET bytesDown = bytesDown + ?, bytesUp = bytesUp + ?, updatedAt = ? WHERE subjectType = ? AND subjectId = ? AND date = ? AND centre = ?', [$dd, $du, $now, $t, $id, $date, $centre]); }
        }
    }
    // Somebody who has just gone over their allowance is moved at the next fetch, not after the list's keep time.
    if ($add && wifi_usage_crossed(array_keys($add), $centre)) wifi_lines_forget($centre);
    if (random_int(1, 40) === 1) {
        db_exec('DELETE FROM wifi_usage_sessions WHERE seenAt < ?', [gmdate('Y-m-d\TH:i:s', time() - 2 * 86400)]);
        db_exec('DELETE FROM wifi_usage_daily WHERE date < ?', [gmdate('Y-m-d', time() - 400 * 86400)]);
    }
    return ['ok' => true, 'sessions' => count($rows), 'people' => count($add)];
}

/**
 * Today's and this month's bytes (down + up) for every person who used any
 * this month: "type|id" => ['day' => n, 'month' => n]. One grouped read over
 * the month, at every centre.
 */
function wifi_usage_totals(?array $only = null): array {
    $today = wifi_local_date(); $month = substr($today, 0, 7) . '-01';
    $out = [];
    $sql = "SELECT subjectType, subjectId, SUM(CASE WHEN date = ? THEN bytesDown + bytesUp ELSE 0 END) day, SUM(bytesDown + bytesUp) month
            FROM wifi_usage_daily WHERE date >= ? AND date <= ?";
    if ($only !== null) $only = array_flip($only);
    $put = function (array $r) use (&$out, $only) {
        $k = $r['subjectType'] . '|' . $r['subjectId'];
        if ($only === null || isset($only[$k])) $out[$k] = ['day' => (int)$r['day'], 'month' => (int)$r['month']];
    };
    if ($only === null) { foreach (db_all($sql . ' GROUP BY subjectType, subjectId', [$today, $month, $today]) as $r) $put($r); return $out; }
    if (!$only) return [];
    // By id, in chunks (an id is unique within its type; the type is checked here).
    $ids = array_values(array_unique(array_map(fn($k) => explode('|', $k, 2)[1], array_keys($only))));
    foreach (array_chunk($ids, 400) as $c) {
        foreach (db_all($sql . ' AND subjectId IN (' . implode(',', array_fill(0, count($c), '?')) . ') GROUP BY subjectType, subjectId', array_merge([$today, $month, $today], $c)) as $r) $put($r);
    }
    return $out;
}

/** Which allowance, if any, this use is over: 'day', 'month' or ''. */
function wifi_usage_over(?array $profile, ?array $use): string {
    if (!$profile || !$use) return '';
    $mb = 1024 * 1024;
    if ((int)($profile['dayMb'] ?? 0) > 0 && (int)$use['day'] >= (int)$profile['dayMb'] * $mb) return 'day';
    if ((int)($profile['monthMb'] ?? 0) > 0 && (int)$use['month'] >= (int)$profile['monthMb'] * $mb) return 'month';
    return '';
}

/** Whether any of these people is now over an allowance at this centre's settings. */
function wifi_usage_crossed(array $subjectKeys, string $centre): bool {
    $cfg = wifi_settings($centre);
    $any = false;
    foreach ($cfg['profiles'] as $pr) if ((int)($pr['dayMb'] ?? 0) > 0 || (int)($pr['monthMb'] ?? 0) > 0) $any = true;
    if (!$any) return false;
    foreach (wifi_usage_totals($subjectKeys) as $use) foreach ($cfg['profiles'] as $pr) if (wifi_usage_over($pr, $use) !== '') return true;
    return false;
}

/** The figures one person sees about themselves (or staff see about them): today, this month, the allowance, the last 30 days. */
function wifi_usage_for(string $type, string $id, ?array $profile): array {
    $u = wifi_usage_totals([$type . '|' . $id])[$type . '|' . $id] ?? ['day' => 0, 'month' => 0];
    $since = gmdate('Y-m-d', strtotime(wifi_local_date() . 'T12:00:00Z') - 29 * 86400);
    $days = array_map(fn($r) => ['date' => (string)$r['date'], 'bytes' => (int)$r['b']],
        db_all('SELECT date, SUM(bytesDown + bytesUp) b FROM wifi_usage_daily WHERE subjectType = ? AND subjectId = ? AND date >= ? GROUP BY date ORDER BY date', [$type, $id, $since]));
    return ['today' => $u['day'], 'month' => $u['month'], 'dayMb' => (int)($profile['dayMb'] ?? 0), 'monthMb' => (int)($profile['monthMb'] ?? 0),
            'over' => wifi_usage_over($profile, $u), 'days' => $days];
}

/**
 * admin.wifi.usage — who used how much, at the centres in the requester's Wi-Fi
 * scope (the `network` capability, as the rest of the Wi-Fi pages): the period's
 * totals per centre, and people heaviest first, with their allowance and
 * whether they are over it. Paged on the server; sort and centre allow-listed.
 */
function admin_wifi_usage(array $p): array {
    $g = wifi_gate($p); if (!$g['ok']) return $g;
    $scope = $g['scope'];
    $period = in_array((string)($p['period'] ?? ''), ['day', 'week', 'month'], true) ? (string)$p['period'] : 'month';
    $today = wifi_local_date();
    $from = $period === 'day' ? $today : ($period === 'week' ? gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') - 6 * 86400) : substr($today, 0, 7) . '-01');
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '' && !wifi_scope_has($scope, $centre)) $centre = '';
    $args = [$from, $today]; $cw = '';
    if ($centre !== '') { $cw = ' AND centre = ?'; $args[] = $centre; }
    elseif ($scope !== null) {
        if (!$scope) return ['ok' => true, 'period' => $period, 'from' => $from, 'to' => $today, 'centres' => [], 'people' => [], 'total' => 0, 'bytes' => 0, 'over' => 0];
        $cw = ' AND centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $args = array_merge($args, $scope);
    }
    // Per centre: grouped by centre and person, then counted here (no string concatenation in SQL: `||` is OR on MySQL).
    $byC = [];
    foreach (db_all("SELECT centre, SUM(bytesDown + bytesUp) b FROM wifi_usage_daily WHERE date >= ? AND date <= ?$cw GROUP BY centre, subjectType, subjectId", $args) as $r) {
        $c = (string)$r['centre'];
        $byC[$c] = ['centre' => $c, 'bytes' => ($byC[$c]['bytes'] ?? 0) + (int)$r['b'], 'people' => ($byC[$c]['people'] ?? 0) + 1];
    }
    $centres = array_values($byC);
    usort($centres, fn($a, $b) => $b['bytes'] <=> $a['bytes']);
    $people = db_all("SELECT subjectType, subjectId, SUM(bytesDown) down, SUM(bytesUp) up, SUM(bytesDown + bytesUp) b FROM wifi_usage_daily WHERE date >= ? AND date <= ?$cw GROUP BY subjectType, subjectId", $args);
    // Names and who each is — two reads, never one per person.
    $mIds = $sIds = [];
    foreach ($people as $x) { if ($x['subjectType'] === 'member') $mIds[] = (string)$x['subjectId']; else $sIds[] = (string)$x['subjectId']; }
    $info = [];
    foreach (array_chunk($mIds, 400) as $c) foreach (db_all('SELECT memberId id, fullName, centre, role, displayId FROM members WHERE memberId IN (' . implode(',', array_fill(0, count($c), '?')) . ')', $c) as $m) $info['member|' . $m['id']] = $m;
    foreach (array_chunk($sIds, 400) as $c) foreach (db_all('SELECT studentId id, fullName, centre, displayId FROM summer_students WHERE studentId IN (' . implode(',', array_fill(0, count($c), '?')) . ')', $c) as $m) $info['summer|' . $m['id']] = $m;
    $totals = wifi_usage_totals();
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $cfgByCentre = [];
    $rows = [];
    foreach ($people as $x) {
        $k = $x['subjectType'] . '|' . $x['subjectId'];
        $m = $info[$k] ?? null;
        $name = $m ? (string)$m['fullName'] : (string)$x['subjectId'];
        if ($q !== '' && !str_contains(mb_strtolower($name . ' ' . ($m['displayId'] ?? '') . ' ' . $x['subjectId']), $q)) continue;
        $home = $m ? (string)$m['centre'] : '';
        $cfg = $cfgByCentre[$home] ??= wifi_settings($home);
        $who = $x['subjectType'] === 'summer' ? 'summer' : ($m && wifi_is_staff($m) ? 'staff' : 'member');
        $prof = wifi_profile('on', $who);
        $pr = $cfg['profiles'][$prof] ?? null;
        $use = $totals[$k] ?? ['day' => 0, 'month' => 0];
        $rows[] = ['subjectType' => (string)$x['subjectType'], 'subjectId' => (string)$x['subjectId'], 'name' => $name, 'centre' => $home, 'id' => (string)($m['displayId'] ?? ''),
                   'who' => $who, 'down' => (int)$x['down'], 'up' => (int)$x['up'], 'bytes' => (int)$x['b'], 'today' => $use['day'], 'month' => $use['month'],
                   'dayMb' => (int)($pr['dayMb'] ?? 0), 'monthMb' => (int)($pr['monthMb'] ?? 0), 'over' => wifi_usage_over($pr, $use)];
    }
    $sort = in_array((string)($p['sort'] ?? ''), ['bytes', 'name', 'over'], true) ? (string)$p['sort'] : 'bytes';
    usort($rows, fn($a, $b) => $sort === 'name' ? strcmp($a['name'], $b['name']) : ($sort === 'over' ? (($b['over'] !== '') <=> ($a['over'] !== '')) ?: $b['bytes'] <=> $a['bytes'] : $b['bytes'] <=> $a['bytes']));
    $page = max(1, (int)($p['page'] ?? 1));
    $size = in_array((int)($p['pageSize'] ?? 0), [50, 100, 500], true) ? (int)$p['pageSize'] : WIFI_USAGE_PAGE;
    $over = count(array_filter($rows, fn($r) => $r['over'] !== ''));
    $counting = array_values(array_filter(db_all("SELECT gatewayId, centre, platform, usageAt FROM wifi_gateways WHERE (removedAt = '' OR removedAt IS NULL) AND (movedAt = '' OR movedAt IS NULL)"), fn($r) => wifi_scope_has($scope, (string)$r['centre'])));
    return ['ok' => true, 'period' => $period, 'from' => $from, 'to' => $today, 'centre' => $centre, 'sort' => $sort,
            'centres' => $centres, 'bytes' => array_sum(array_column($centres, 'bytes')), 'over' => $over,
            'total' => count($rows), 'page' => $page, 'pageSize' => $size, 'people' => array_slice($rows, ($page - 1) * $size, $size),
            'gateways' => ['total' => count($counting), 'counting' => count(array_filter($counting, fn($r) => (string)$r['usageAt'] !== '' && time() - (int)strtotime((string)$r['usageAt']) < 86400)),
                           'canCount' => count(array_filter($counting, fn($r) => !empty((WIFI_PLATFORMS[(string)$r['platform']] ?? [])['can']['usage'])))]];
}
