<?php
declare(strict_types=1);

/**
 * NGG — shared domain helpers used by every handler in _lib/domain/*.
 * Ports the Apps Script Util/Sessions/Auth helpers to PHP + the local DB.
 */

// ── Time / ids / strings ───────────────────────────────────────────────────

function now_iso(): string { return gmdate('Y-m-d\TH:i:s\Z'); }

function rand_hex(int $bytes): string { return bin2hex(random_bytes($bytes)); }

function new_id(string $prefix): string {
    return $prefix . '-' . gmdate('Y') . '-' . str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
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
        case 'super_admin':  return ['content', 'people', 'inbox', 'settings', 'rbac', 'summer', 'club'];
        case 'admin':        return ['content', 'people', 'inbox'];
        case 'summer_admin': return ['summer'];   // Summer School portal only
        case 'club_admin':   return ['club'];      // NGG Club portal only
        case 'editor':       return ['content'];
        default:             return [];
    }
}

/** Does this role hold a given admin capability? */
function role_has_cap($role, string $cap): bool {
    return in_array($cap, admin_role_caps($role), true);
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
        'caps' => admin_role_caps($m['role'] ?? ''),
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
