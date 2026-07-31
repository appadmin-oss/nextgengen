<?php
declare(strict_types=1);

/**
 * NGG — shared domain helpers used by every handler in _lib/domain/*.
 * Ports the Apps Script Util/Sessions/Auth helpers to PHP + the local DB.
 */

// ── Time / ids / strings ───────────────────────────────────────────────────

function now_iso(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

/** Whole years elapsed from an ISO date (YYYY-MM-DD) to today (UTC). Returns
 *  -1 if the date is unparseable or in the future. */
function dob_age(string $iso): int {
    $iso = trim($iso);
    $t = strtotime($iso . ' 00:00:00 UTC');
    if ($t === false || $t > time()) return -1;
    $by = (int)gmdate('Y', $t); $bm = (int)gmdate('n', $t); $bd = (int)gmdate('j', $t);
    $age = (int)gmdate('Y') - $by;
    if ((int)gmdate('n') < $bm || ((int)gmdate('n') === $bm && (int)gmdate('j') < $bd)) $age--;
    return $age;
}

function rand_hex(int $bytes): string { return bin2hex(random_bytes($bytes)); }

/**
 * A human-readable record id: PREFIX-YYYY-NNNN.
 *
 * The four-digit tail is a 10,000-value keyspace, and this used to hand one
 * back without ever checking whether it was taken. That is not a remote risk:
 * by the birthday bound a collision is more likely than not at ~118 records,
 * and every insert after a couple of thousand has a percentage chance of
 * failing outright on the UNIQUE constraint. It surfaced here as an
 * intermittently-failing test — "UNIQUE constraint failed: members.memberId" —
 * which in production is a member or mentor that simply could not be created,
 * at a keyboard, with no explanation.
 *
 * `$table`/`$column` make it check. Callers that pass them get a genuinely
 * unique id; the tail widens after a few tries so a crowded year cannot spin,
 * and the last resort is wide enough to be unique on its own rather than
 * returning a value known to be taken.
 */
function new_id(string $prefix, string $table = '', string $column = ''): string {
    $mk = fn(int $digits) => $prefix . '-' . gmdate('Y') . '-'
        . str_pad((string)random_int(0, (int)(10 ** $digits) - 1), $digits, '0', STR_PAD_LEFT);
    if ($table === '' || $column === '') return $mk(4);
    // Identifiers are supplied by this file's own callers, never by input, but
    // they are interpolated into SQL so they are constrained anyway.
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $table) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $column)) return $mk(4);
    for ($i = 0; $i < 12; $i++) {
        $digits = $i < 6 ? 4 : ($i < 10 ? 6 : 8);
        $id = $mk($digits);
        try {
            if (!db_row("SELECT 1 x FROM $table WHERE $column = ? LIMIT 1", [$id])) return $id;
        } catch (\Throwable $e) {
            return $mk(4);   // table not there yet — behave as before
        }
    }
    // Twelve collisions in a row means the space is exhausted, not unlucky.
    return $prefix . '-' . gmdate('Y') . '-' . strtoupper(rand_hex(6));
}

function new_otp(): string { return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT); }

function slugify(string $s): string {
    $s = strtolower($s);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    $s = trim($s, '-');
    return substr($s, 0, 80);
}

function mask_email(string $e): string {
    $at = strpos($e, '@');
    if ($at === false || $at < 1) return '***@***';
    $u = substr($e, 0, $at); $d = substr($e, $at + 1);
    $len = strlen($u);
    $um = $len <= 2 ? $u[0] . '*' : $u[0] . str_repeat('*', max(1, $len - 2)) . $u[$len - 1];
    return $um . '@' . $d;
}

function safe_json($s) {
    if ($s === null || $s === '') return null;
    if (is_array($s)) return $s;
    $d = json_decode((string)$s, true);
    return is_array($d) ? $d : null;
}

function esc_html($s): string {
    return htmlspecialchars((string)($s ?? ''), ENT_QUOTES, 'UTF-8');
}

function to_bool($v): bool {
    if (is_bool($v)) return $v;
    if (is_int($v)) return $v !== 0;
    $s = strtolower(trim((string)$v));
    return $s === '1' || $s === 'true' || $s === 'yes';
}

function normalize_image_url($url): string {
    $u = (string)($url ?? '');
    if ($u === '') return '';
    if (preg_match('#/d/([a-zA-Z0-9_-]+)#', $u, $m)) {
        return 'https://drive.google.com/uc?export=view&id=' . $m[1];
    }
    return $u;
}

// ── Audit + notifications + settings ────────────────────────────────────────

function audit(string $event, ?string $actorId, string $subject = '', array $meta = [], string $ip = ''): void {
    try {
        db_insert('audit_log', [
            'at' => now_iso(),
            'actorId' => $actorId ?: 'system',
            'event' => $event,
            'subject' => $subject,
            'ip' => $ip,
            'meta' => $meta ? json_encode($meta, JSON_UNESCAPED_SLASHES) : '',
        ]);
    } catch (Throwable $e) { /* audit must never break the request */ }
}

function push_notification(string $memberId, array $n): void {
    db_insert('notifications', [
        'notifId' => 'N-' . gmdate('Y') . '-' . rand_hex(4),
        'memberId' => $memberId,
        'kind' => $n['kind'] ?? 'announcement',
        'title' => $n['title'] ?? '',
        'body' => $n['body'] ?? '',
        'linkPage' => $n['linkPage'] ?? '',
        'readAt' => '',
        'createdAt' => now_iso(),
    ]);
}

/**
 * Staff roles. The main console (editor/admin/super_admin) and the two
 * stand-alone coordinator portals are deliberately separate surfaces:
 *   editor       — content only (posts, events, missions, Anchor Journal, …)
 *   admin        — content + people (members/mentors/applications) + inbox
 *   super_admin  — everything: console + site settings, RBAC, AND both
 *                  coordinator portals (the only role that bridges all three)
 *   summer_admin — Summer School staff portal ONLY (locked out of console/club)
 *   club_admin   — NGG Club staff portal ONLY (locked out of console/summer)
 * summer_admin/club_admin hold a single portal cap so they can't cross over;
 * super_admin holds every cap and can enter any portal for oversight.
 */
function admin_role_caps($role): array {
    switch (strtolower((string)($role ?? ''))) {
        case 'super_admin':  return ['content', 'people', 'inbox', 'settings', 'rbac', 'summer', 'club', 'audit', 'journal'];
        case 'admin':        return ['content', 'people', 'inbox'];
        case 'summer_admin': return ['summer'];   // Summer School portal only
        case 'club_admin':   return ['club'];      // NGG Club portal only
        /* Deliberately NOT granted 'journal'. The journalist role is ASSIGNED
         * per person (Access & roles → extra capabilities), not inherited from
         * being an editor — writing the programme's institutional record is a
         * different trust from publishing site content, and bundling them would
         * make every editor a journalist by accident. super_admin holds it
         * because super_admin holds everything. */
        case 'editor':       return ['content'];
        // Monitoring & Evaluation: reads everything the M&E workspace shows,
        // writes nothing operational — the role simply holds no other cap.
        case 'audit':        return ['audit'];
        default:             return [];
    }
}

/** Does this role hold a given admin capability? */
function role_has_cap($role, string $cap): bool {
    return in_array($cap, admin_role_caps($role), true);
}

/**
 * Scoped admins — a staff member's `centreScope` is a JSON array of centreIds
 * they're limited to (empty = unscoped = every centre, today's behaviour).
 * Returns the CENTRE NAMES in scope, or null when unscoped. Names are what the
 * free-text `centre` columns store, so callers filter with a simple IN (names).
 */
function admin_centre_names_in_scope(array $requester): ?array {
    $scope = safe_json((string)($requester['centreScope'] ?? ''));
    if (!is_array($scope) || empty($scope)) return null;
    $scope = array_values(array_filter(array_map('strval', $scope)));
    if (!$scope) return null;
    $ph = implode(',', array_fill(0, count($scope), '?'));
    $rows = db_all("SELECT name FROM centres WHERE centreId IN ($ph)", $scope);
    return array_map(fn($r) => (string)$r['name'], $rows);
}

/** Is a given centre name within a requester's scope? Unscoped ⇒ always true. */
function admin_centre_allowed(array $requester, ?string $centreName): bool {
    $names = admin_centre_names_in_scope($requester);
    if ($names === null) return true;
    return $centreName !== null && $centreName !== '' && in_array($centreName, $names, true);
}

/** ISO-week period tag, e.g. '2026-W29' — the cadence for V3 ratings/champions. */
function iso_week_period(?int $t = null): string {
    $t = $t ?? time();
    return gmdate('o', $t) . '-W' . gmdate('W', $t);
}

/** All capabilities of a member row: role caps + any per-member extras (RBAC
 *  editor). Extras only augment an existing staff member; they never make a
 *  plain member into staff (is_admin_role still gates console access by role). */
function member_effective_caps(array $m): array {
    $caps = admin_role_caps($m['role'] ?? '');
    $extra = isset($m['capsExtra']) ? safe_json((string)$m['capsExtra']) : null;
    if (is_array($extra)) foreach ($extra as $c) { if (is_string($c) && $c !== '' && !in_array($c, $caps, true)) $caps[] = $c; }
    return $caps;
}

/** Any staff role (can reach the admin console; capabilities gate the rest). */
function is_admin_role($role): bool {
    return admin_role_caps($role) !== [];
}

function setting_get(string $key) {
    $row = db_row('SELECT settingValue FROM settings WHERE settingKey = ?', [$key]);
    return $row ? safe_json($row['settingValue']) : null;
}

/** Raw string setting value (for scalar settings that aren't JSON objects). */
/**
 * Memoise an expensive read on disk for a few seconds.
 *
 * For endpoints that are POLLED rather than requested: the public board is
 * refreshed by a screen at every centre, so at a hundred centres the same
 * figures are recomputed a hundred times a minute from the same rows. One
 * computation per window serves all of them.
 *
 * Deliberately crude — a file and an mtime, no daemon to install. Failure at
 * any point falls through to computing it, so a read-only cache directory
 * degrades to today's behaviour instead of an outage.
 *
 * A stale entry is served if the recompute throws, because a board that is
 * thirty seconds out of date is worth more than an error page.
 */
/** The memo file for a key — one definition, so a reader and a writer cannot
 *  disagree about where it lives. */
function cache_path(string $key): string {
    global $CONFIG;
    return ($CONFIG['cache_dir'] ?? sys_get_temp_dir()) . '/_memo/'
         . preg_replace('/[^a-z0-9_.-]/i', '', $key) . '.json';
}

/** Read a memo without computing anything. Null on a miss, an expired entry, or
 *  a stamp that no longer matches. For callers that need to know whether a
 *  cached answer EXISTS — an expensive job that should be offered rather than
 *  silently started, say — which cache_remember cannot express. */
function cache_get(string $key, int $ttl = 0, string $stamp = '') {
    $path = cache_path($key);
    $age = @filemtime($path);
    if (!$age) return null;
    if ($ttl > 0 && (time() - $age) >= $ttl) return null;
    $raw = @file_get_contents($path);
    if ($raw === false) return null;
    $hit = json_decode($raw, true);
    if (!is_array($hit)) return null;
    if (isset($hit['__v'], $hit['__d'])) return (string)$hit['__v'] === $stamp ? $hit['__d'] : null;
    return $stamp === '' ? $hit : null;
}

/** Write a memo directly. Same write-then-rename as cache_remember, so a
 *  concurrent reader never sees half a file. */
function cache_put(string $key, $value, string $stamp = ''): bool {
    if (!is_array($value)) return false;
    $path = cache_path($key);
    @mkdir(dirname($path), 0755, true);
    $tmp = $path . '.' . getmypid() . '.tmp';
    $store = $stamp === '' ? $value : ['__v' => $stamp, '__d' => $value];
    if (@file_put_contents($tmp, json_encode($store, JSON_UNESCAPED_SLASHES)) === false) return false;
    return @rename($tmp, $path);
}

function cache_remember(string $key, int $ttl, callable $fn, string $stamp = '') {
    global $CONFIG;
    $dir = ($CONFIG['cache_dir'] ?? sys_get_temp_dir()) . '/_memo';
    $path = $dir . '/' . preg_replace('/[^a-z0-9_.-]/i', '', $key) . '.json';
    $age = @filemtime($path);
    if ($age && (time() - $age) < $ttl) {
        $raw = @file_get_contents($path);
        if ($raw !== false) {
            $hit = json_decode($raw, true);
            /* `stamp` lets a caller bypass the window when the underlying data
             * has demonstrably changed. Time alone is the wrong rule for
             * anything with a safeguarding property attached: a guardian who
             * withdraws consent must drop off the public board on the next
             * request, not whenever a timer happens to expire. */
            if (is_array($hit) && isset($hit['__v']) && isset($hit['__d'])) {
                if ((string)$hit['__v'] === $stamp) return $hit['__d'];
            } elseif (is_array($hit) && $stamp === '') {
                return $hit;
            }
        }
    }
    try {
        $fresh = $fn();
    } catch (\Throwable $e) {
        /* Serve whatever we last had rather than failing the request — but not
         * forever, and not silently.
         *
         * Unbounded, this degrades from "a board thirty seconds out of date" to
         * "a board from last March": if the builder keeps throwing, the same
         * ancient payload is served indefinitely and the only trace is an
         * error_log line nobody reads. A stale window of 10× the TTL keeps the
         * intended graceful degradation over a transient fault while making a
         * persistent one surface as a real failure.
         *
         * The event is journalled as a warning, so Diagnostics can say "serving
         * stale public_status, 4h old" instead of the site quietly lying. */
        $age = @filemtime($path);
        $staleFor = $age ? time() - $age : PHP_INT_MAX;
        $maxStale = max($ttl * 10, 300);
        $raw = $staleFor <= $maxStale ? @file_get_contents($path) : false;
        $stale = $raw === false ? null : json_decode($raw, true);
        if (is_array($stale) && isset($stale['__d'])) $stale = $stale['__d'];
        if (is_array($stale)) {
            error_log('[cache] serving stale ' . $key . ' (' . $staleFor . 's): ' . $e->getMessage());
            if (function_exists('ops_record')) {
                ops_record('warn', 'cache:' . $key, 'serving stale (' . $staleFor . 's old)', $e->getMessage());
            }
            return $stale;
        }
        if (function_exists('ops_record')) {
            ops_record('error', 'cache:' . $key, 'no usable cache, request failed', $e->getMessage());
        }
        throw $e;
    }
    if (is_array($fresh)) {
        @mkdir($dir, 0755, true);
        // Write-then-rename, so a concurrent reader never sees half a file.
        $tmp = $path . '.' . getmypid() . '.tmp';
        $store = $stamp === '' ? $fresh : ['__v' => $stamp, '__d' => $fresh];
        if (@file_put_contents($tmp, json_encode($store, JSON_UNESCAPED_SLASHES)) !== false) @rename($tmp, $path);
    }
    return $fresh;
}

/* ── Idempotent intake ────────────────────────────────────────────────────────
 *
 * Run $fn at most once for a given client-minted $submissionId, and replay the
 * stored result for every later attempt with the same id.
 *
 * This is what makes retrying an intake form safe, and therefore what makes an
 * offline outbox possible. Without it a retry after a timeout either created a
 * second child or tripped the name+parent-contact duplicate heuristic and
 * reported a failure for a registration that had actually worked.
 *
 * Three cases, in the order they matter:
 *
 *  - No usable id → run $fn exactly as before. An older cached bundle that
 *    knows nothing about submissionId keeps working; this is additive.
 *  - A COMPLETED id → replay the stored result. Retry #2 returns the studentId
 *    that retry #1 created, so the family sees the success that already exists.
 *  - An in-flight id → refuse with 'in_flight'. The claim is inserted BEFORE
 *    the work, and the UNIQUE index makes that atomic, so two concurrent
 *    submissions of the same form cannot both register a child. A claim
 *    abandoned by a died request is reclaimable after IDLE seconds — otherwise
 *    a crash mid-submit would lock that family out permanently.
 *
 * Only success is retained. A refusal releases the key, because a family
 * correcting a validation error resubmits with the SAME id and must not be
 * handed the old refusal for ever.
 */
const INTAKE_CLAIM_IDLE = 120;

function intake_submission_id(string $raw): string {
    $sid = trim($raw);
    return preg_match('/^[A-Za-z0-9_-]{8,64}$/', $sid) ? $sid : '';
}

function intake_once(string $submissionId, string $op, callable $fn): array {
    $sid = intake_submission_id($submissionId);
    if ($sid === '') return $fn();

    $row = db_row('SELECT status, resultJson, createdAt FROM intake_submissions WHERE submissionId = ?', [$sid]);
    if ($row) {
        if ((string)$row['status'] === 'done') {
            $prev = json_decode((string)$row['resultJson'], true);
            // `replayed` lets a caller tell "already done" from "just done" —
            // the form can then say "already sent" rather than claim it sent twice.
            if (is_array($prev) && !empty($prev['ok'])) return ['replayed' => true] + $prev;
            // A 'done' row we cannot decode is not worth blocking a family over.
            db_exec('DELETE FROM intake_submissions WHERE submissionId = ?', [$sid]);
        } else {
            $age = time() - (strtotime((string)$row['createdAt']) ?: 0);
            if ($age < INTAKE_CLAIM_IDLE) return ['ok' => false, 'error' => 'in_flight'];
            // Stale claim from a request that died. Take it over.
            db_update('intake_submissions', ['createdAt' => now_iso()], ['submissionId' => $sid]);
        }
    } else {
        try {
            db_insert('intake_submissions', ['submissionId' => $sid, 'op' => $op,
                'status' => 'pending', 'resultJson' => '', 'createdAt' => now_iso(), 'completedAt' => '']);
        } catch (Throwable $e) {
            // Lost the insert race: the other request owns this submission.
            return ['ok' => false, 'error' => 'in_flight'];
        }
    }

    try {
        $res = $fn();
    } catch (Throwable $e) {
        db_exec('DELETE FROM intake_submissions WHERE submissionId = ?', [$sid]);
        throw $e;
    }

    if (!empty($res['ok'])) {
        db_update('intake_submissions', ['status' => 'done', 'completedAt' => now_iso(),
            'resultJson' => json_encode($res, JSON_UNESCAPED_SLASHES)], ['submissionId' => $sid]);
    } else {
        db_exec('DELETE FROM intake_submissions WHERE submissionId = ?', [$sid]);
    }
    return $res;
}

function setting_raw(string $key): ?string {
    $row = db_row('SELECT settingValue FROM settings WHERE settingKey = ?', [$key]);
    return $row ? (string)$row['settingValue'] : null;
}

function setting_set(string $key, $value, string $by = ''): void {
    db_upsert('settings',
        ['settingKey' => $key, 'settingValue' => $value === null ? '' : (is_array($value) ? json_encode($value, JSON_UNESCAPED_SLASHES) : (string)$value), 'updatedAt' => now_iso(), 'updatedBy' => $by],
        ['settingKey'],
        ['settingValue' => $value === null ? '' : (is_array($value) ? json_encode($value, JSON_UNESCAPED_SLASHES) : (string)$value), 'updatedAt' => now_iso(), 'updatedBy' => $by]
    );
}

// ── Sessions (TONI / MEDI / SUMMER / DOMI) ───────────────────────────────────

const SESSION_DEFAULTS = [
    'TONI'   => ['sm' => 1, 'sd' => 6,  'em' => 3,  'ed' => 29],
    'MEDI'   => ['sm' => 4, 'sd' => 6,  'em' => 6,  'ed' => 28],
    'SUMMER' => ['sm' => 7, 'sd' => 6,  'em' => 8,  'ed' => 30],
    'DOMI'   => ['sm' => 9, 'sd' => 7,  'em' => 12, 'ed' => 13],
];

function iso_date($d): string {
    $s = (string)($d ?? '');
    if ($s === '') return '';
    $ts = strtotime($s);
    if ($ts === false) return $s;
    return gmdate('Y-m-d', $ts);
}

function ensure_year(int $year): int {
    $existing = db_all('SELECT * FROM sessions WHERE year = ?', [$year]);
    $have = [];
    foreach ($existing as $s) $have[strtoupper((string)$s['code'])] = true;

    $created = 0;
    foreach (SESSION_DEFAULTS as $code => $d) {
        if (!empty($have[$code])) continue;
        db_insert('sessions', [
            'sessionId' => $code . '-' . $year,
            'code' => $code, 'year' => $year, 'name' => $code,
            'startDate' => sprintf('%04d-%02d-%02d', $year, $d['sm'], $d['sd']),
            'endDate'   => sprintf('%04d-%02d-%02d', $year, $d['em'], $d['ed']),
            'theme' => '', 'isActive' => 0, 'coverUrl' => '',
            'notes' => 'Auto-seeded with defaults — edit dates and theme as needed.',
            'createdAt' => now_iso(), 'updatedAt' => now_iso(),
        ]);
        $created++;
    }

    // Recompute isActive by today's date.
    $today = gmdate('Y-m-d');
    foreach (db_all('SELECT * FROM sessions WHERE year = ?', [$year]) as $s) {
        $want = ($today >= iso_date($s['startDate']) && $today <= iso_date($s['endDate'])) ? 1 : 0;
        if ((int)$s['isActive'] !== $want) {
            db_update('sessions', ['isActive' => $want, 'updatedAt' => now_iso()], ['id' => $s['id']]);
        }
    }
    return $created;
}

function week_of_session(array $s): int {
    $start = strtotime(iso_date($s['startDate']));
    $today = time();
    if ($start === false || $today < $start) return 0;
    $w = (int)floor(($today - $start) / 86400 / 7) + 1;
    return max(1, $w);
}

function total_weeks(array $s): int {
    $start = strtotime(iso_date($s['startDate']));
    $end = strtotime(iso_date($s['endDate']));
    if ($start === false || $end === false) return 1;
    $days = (int)ceil(($end - $start) / 86400);
    return max(1, (int)ceil($days / 7));
}

function public_session(array $s): array {
    return [
        'sessionId' => $s['sessionId'],
        'code' => $s['code'],
        'year' => (int)$s['year'],
        'name' => $s['name'] ?: $s['code'],
        'startDate' => iso_date($s['startDate']),
        'endDate' => iso_date($s['endDate']),
        'theme' => $s['theme'] ?? '',
        'isActive' => to_bool($s['isActive']),
        'coverUrl' => normalize_image_url($s['coverUrl'] ?? ''),
        'weekOf' => week_of_session($s),
        'totalWeeks' => total_weeks($s),
    ];
}

/** { current, next, all } — mirrors Apps Script Session_current. */
function session_current(): array {
    $year = (int)gmdate('Y');
    ensure_year($year);
    $all = db_all('SELECT * FROM sessions WHERE year = ? ORDER BY startDate', [$year]);
    $today = gmdate('Y-m-d');
    $current = null; $next = null;
    foreach ($all as $s) {
        $start = iso_date($s['startDate']); $end = iso_date($s['endDate']);
        if ($today >= $start && $today <= $end) $current = $s;
        if ($today < $start && ($next === null || $start < iso_date($next['startDate']))) $next = $s;
    }
    return [
        'current' => $current ? public_session($current) : null,
        'next' => $next ? public_session($next) : null,
        'all' => array_map('public_session', $all),
    ];
}

// ── Member stats recompute ───────────────────────────────────────────────────

function recompute_member_stats(string $memberId): void {
    $sc = session_current();
    $sessionId = $sc['current']['sessionId'] ?? '';
    $all = db_all('SELECT * FROM member_progress WHERE memberId = ?', [$memberId]);

    $xp = 0;
    foreach ($all as $r) $xp += (int)$r['xpAwarded'];
    $level = intdiv($xp, 250) + 1;

    $completed = 0;
    foreach ($all as $r) {
        if ((string)$r['sessionId'] === (string)$sessionId && $r['status'] === 'verified') $completed++;
    }

    // Streak — distinct verified days walking back from today.
    $days = [];
    foreach ($all as $r) {
        if ($r['status'] === 'verified' && $r['verifiedAt']) $days[substr((string)$r['verifiedAt'], 0, 10)] = true;
    }
    $streak = 0; $cursor = time();
    for ($i = 0; $i < 365; $i++) {
        $key = gmdate('Y-m-d', $cursor);
        if (isset($days[$key])) { $streak++; $cursor -= 86400; }
        else {
            if ($streak === 0) { // allow today empty
                $cursor -= 86400;
                if (!isset($days[gmdate('Y-m-d', $cursor)])) break;
                $streak++; $cursor -= 86400;
            } else break;
        }
    }

    $badges = [];
    if ($xp >= 100) $badges[] = 'first-mission';
    if ($xp >= 500) $badges[] = 'half-k-club';
    if ($xp >= 1000) $badges[] = 'one-k-club';
    if ($streak >= 7) $badges[] = 'week-streak';
    if ($streak >= 30) $badges[] = 'month-streak';
    if ($completed >= 12) $badges[] = 'week-finisher';

    $week = $sc['current'] ? week_of_session($sc['current']) : 1;
    $row = [
        'memberId' => $memberId,
        'xpTotal' => $xp, 'level' => $level,
        'badgeCount' => count($badges), 'badges' => json_encode($badges),
        'streak' => $streak, 'lastActiveAt' => now_iso(),
        'currentWeek' => min(12, $week), 'completedThisSession' => $completed,
        'updatedAt' => now_iso(),
    ];
    $upd = $row; unset($upd['memberId']);
    db_upsert('member_stats', $row, ['memberId'], $upd);
}

// ── TOTP (RFC 6238, HMAC-SHA1) ───────────────────────────────────────────────

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function rand_base32(int $bytes): string {
    $s = '';
    $n = (int)ceil($bytes * 8 / 5);
    for ($i = 0; $i < $n; $i++) $s .= B32_ALPHABET[random_int(0, 31)];
    return $s;
}

function base32_decode(string $s): string {
    $s = preg_replace('/[^A-Z2-7]/', '', strtoupper($s)) ?? '';
    $bits = ''; $out = '';
    for ($i = 0, $len = strlen($s); $i < $len; $i++) {
        $v = strpos(B32_ALPHABET, $s[$i]);
        if ($v === false) continue;
        $bits .= str_pad(decbin($v), 5, '0', STR_PAD_LEFT);
    }
    for ($i = 0; $i + 8 <= strlen($bits); $i += 8) {
        $out .= chr(bindec(substr($bits, $i, 8)));
    }
    return $out;
}

function totp_code(string $secret, int $counter): string {
    $key = base32_decode($secret);
    $bin = pack('N*', 0) . pack('N*', $counter); // 8-byte big-endian counter
    $hash = hash_hmac('sha1', $bin, $key, true);
    $offset = ord($hash[strlen($hash) - 1]) & 0xf;
    $val = ((ord($hash[$offset]) & 0x7f) << 24) |
           ((ord($hash[$offset + 1]) & 0xff) << 16) |
           ((ord($hash[$offset + 2]) & 0xff) << 8) |
           (ord($hash[$offset + 3]) & 0xff);
    return str_pad((string)($val % 1000000), 6, '0', STR_PAD_LEFT);
}

function totp_verify(string $secret, string $code, int $window = 1): bool {
    $code = preg_replace('/\s+/', '', $code) ?? '';
    if ($code === '') return false;
    $now = intdiv(time(), 30);
    for ($drift = -$window; $drift <= $window; $drift++) {
        if (hash_equals(totp_code($secret, $now + $drift), $code)) return true;
    }
    return false;
}

// ── Serializers (strip sensitive columns, match SPA shape) ───────────────────

function public_member(array $m): array {
    return [
        'memberId' => $m['memberId'],
        'fullName' => $m['fullName'],
        'email' => $m['email'],
        'type' => $m['type'],
        'status' => $m['status'],
        'role' => $m['role'] ?: 'member',
        'centre' => $m['centre'],
        'photoUrl' => normalize_image_url($m['photoUrl'] ?? ''),
        'track' => $m['track'],
        'cohort' => $m['cohort'],
        'bio' => $m['bio'],
        'socials' => safe_json($m['socials'] ?? null),
        'phone' => $m['phone'] ?? '',
        'school' => $m['school'] ?? '',
        'joinDate' => $m['joinDate'] ? (string)$m['joinDate'] : '',
        'parentEmail' => $m['parentEmail'] ?? '',
        'hasPassword' => !empty($m['passwordHash']),
        'caps' => member_effective_caps($m),
        'capsExtra' => is_array(safe_json($m['capsExtra'] ?? null)) ? safe_json($m['capsExtra']) : [],
        'centreScope' => is_array(safe_json($m['centreScope'] ?? null)) ? safe_json($m['centreScope']) : [],
        'needsTotp' => is_admin_role($m['role']) && empty($m['totpSecret']),
    ];
}

function public_mentor(array $m): array {
    return [
        'mentorId' => $m['mentorId'],
        'fullName' => $m['fullName'],
        'tracks' => array_values(array_filter(array_map('trim', explode(',', (string)($m['tracks'] ?? ''))))),
        'centre' => $m['centre'],
        'bio' => $m['bio'],
        'photoUrl' => normalize_image_url($m['photoUrl'] ?? ''),
    ];
}

function public_event(array $e): array {
    return [
        'eventId' => $e['eventId'],
        'title' => $e['title'],
        'kind' => $e['kind'],
        'startAt' => $e['startAt'],
        'endAt' => $e['endAt'],
        'centre' => $e['centre'],
        'location' => $e['location'],
        'coverUrl' => normalize_image_url($e['coverUrl'] ?? ''),
        'body' => $e['body'],
        'capacity' => (int)($e['capacity'] ?? 0),
        'isPublic' => to_bool($e['isPublic'] ?? 0),
    ];
}

function public_notification(array $n): array {
    return [
        'notifId' => $n['notifId'],
        'kind' => $n['kind'],
        'title' => $n['title'],
        'body' => $n['body'],
        'linkPage' => $n['linkPage'],
        'readAt' => $n['readAt'] ?: '',
        'createdAt' => $n['createdAt'],
    ];
}

function public_post(array $p, bool $includeBody = false): array {
    $out = [
        'postId' => $p['postId'],
        'slug' => $p['slug'],
        'kind' => $p['kind'],
        'title' => $p['title'],
        'excerpt' => $p['excerpt'],
        'coverUrl' => normalize_image_url($p['coverUrl'] ?? ''),
        'category' => $p['category'],
        'authorId' => $p['authorId'],
        'tags' => array_values(array_filter(array_map('trim', explode(',', (string)($p['tags'] ?? ''))))),
        'featured' => to_bool($p['featured'] ?? 0),
        'publishAt' => $p['publishAt'] ?: $p['createdAt'],
        'promo' => $p['kind'] === 'promo' ? ['cta' => $p['promoCta'], 'url' => $p['promoUrl'], 'expires' => $p['promoExpires']] : null,
    ];
    if ($includeBody) $out['body'] = $p['body'];
    return $out;
}

function admin_event(array $e): array {
    return [
        'eventId' => $e['eventId'], 'title' => $e['title'], 'kind' => $e['kind'],
        'status' => $e['status'] ?: 'draft', 'startAt' => $e['startAt'], 'endAt' => $e['endAt'],
        'centre' => $e['centre'], 'location' => $e['location'], 'coverUrl' => $e['coverUrl'] ?: '',
        'body' => $e['body'] ?: '', 'capacity' => (int)($e['capacity'] ?? 0), 'isPublic' => to_bool($e['isPublic'] ?? 0),
    ];
}

function admin_post(array $p, bool $includeBody = false): array {
    $out = [
        'postId' => $p['postId'], 'slug' => $p['slug'], 'kind' => $p['kind'],
        'status' => $p['status'] ?: 'draft', 'title' => $p['title'], 'excerpt' => $p['excerpt'] ?: '',
        'coverUrl' => $p['coverUrl'] ?: '', 'category' => $p['category'] ?: '', 'tags' => (string)($p['tags'] ?? ''),
        'featured' => to_bool($p['featured'] ?? 0), 'authorId' => $p['authorId'] ?: '', 'publishAt' => $p['publishAt'] ?: '',
        'createdAt' => $p['createdAt'] ?: '', 'promoCta' => $p['promoCta'] ?: '', 'promoUrl' => $p['promoUrl'] ?: '',
        'promoExpires' => $p['promoExpires'] ?: '',
    ];
    if ($includeBody) $out['body'] = $p['body'] ?: '';
    return $out;
}

/** Flip scheduled draft posts whose publishAt has passed. */
function flip_scheduled_posts(): void {
    db_exec("UPDATE posts SET status='published' WHERE status='draft' AND publishAt != '' AND publishAt IS NOT NULL AND publishAt <= ?", [now_iso()]);
}

// ── base64url (shared by session cookies + Anchor Circle tokens) ────────────
function b64url(string $bin): string {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}
function b64url_decode(string $s): string {
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return (string)base64_decode(strtr($s, '-_', '+/'));
}
