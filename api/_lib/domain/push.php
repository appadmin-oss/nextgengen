<?php
/**
 * Push notifications — so a message reaches somebody without them opening
 * their portal to look for it.
 *
 * Standard Web Push (RFC 8030), signed with VAPID (RFC 8292) and encrypted
 * aes128gcm (RFC 8291), done here with PHP's own OpenSSL: the host has no
 * shell and no Node, so there is no library to install and no daemon to run.
 * A browser hands us a subscription (an endpoint at its vendor's push service
 * and two keys); we encrypt each message to those keys and POST it there.
 *
 * Three kinds of subscriber, one key each, never a second table per portal:
 *   m:<memberId>   a member — and staff, who are members with a role
 *   g:<guardianId> a family account
 *
 * The two roads every alert already takes are where push is attached, so no
 * caller has to remember it: push_notification() (the in-app bell, 60 call
 * sites) and family_mail() (every email to a parent). Staff inbox alerts go
 * through staff_inbox_alert() below, which uses the first.
 *
 * WHAT MAKES IT BEARABLE — a push nobody wanted is how the permission gets
 * revoked, and then the urgent one does not arrive either:
 *   · Quiet hours (default 21:00–07:00, Lagos). Anything not urgent is held and
 *     arrives as ONE "while you were away" summary when they end.
 *   · Urgent is a short, fixed list (safeguarding, a child checked in or out,
 *     a duty, a security notice) and is never held.
 *   · Already looking: someone active in that portal in the last 90 seconds
 *     sees it live, so the phone does not buzz for it as well.
 *   · Bursts collapse: after three in ten minutes, the rest wait out the window
 *     and arrive as one summary instead of a drum roll.
 *   · Same thing, same notification: a tag replaces the earlier one (the third
 *     reply on one request updates the alert, it does not stack three).
 *   · Topics they can mute, in their own words. Muting never mutes urgent.
 *   · A subscription the push service says is gone (404/410) is deleted; one
 *     that keeps failing is dropped after eight tries.
 *
 * Every push goes through push_queue — sent right after the response for
 * "now", by the web-cron tick for "later" — so the rules above live in one
 * place and a slow push service never holds up the request that caused it.
 */

const PUSH_TOPICS = [
    'messages'   => 'Messages and announcements',
    'requests'   => 'Answers to your requests',
    'money'      => 'Payments, dues and fines',
    'attendance' => 'Check-in, attendance and duties',
    'learning'   => 'Lessons, assignments and results',
    'community'  => 'Community and events',
    'inbox'      => 'New items in the staff inbox',
];
/** Topics a family account is offered (no staff inbox, no community). */
const PUSH_TOPICS_FAMILY = ['messages', 'requests', 'money', 'attendance', 'learning'];
/** Never held for quiet hours, never merged into a summary, never muted. */
const PUSH_URGENT_KINDS = ['safeguarding', 'security', 'checkin', 'checkout', 'duty'];
const PUSH_QUIET_DEFAULT = ['21:00', '07:00'];
const PUSH_ACTIVE_SECONDS = 90;
const PUSH_BURST_N = 3;
const PUSH_BURST_WINDOW = 600;
const PUSH_MAX_DEVICES = 10;
const PUSH_DROP_AFTER_FAILS = 8;
/** Only real push services are ever POSTed to — a subscription is a URL the
 *  CLIENT chose, and without this list it is a way to make this server send
 *  requests anywhere. */
const PUSH_HOSTS = ['/^fcm\.googleapis\.com$/', '/^[a-z0-9.-]+\.googleapis\.com$/', '/^updates\.push\.services\.mozilla\.com$/',
                    '/^[a-z0-9.-]+\.push\.services\.mozilla\.com$/', '/^web\.push\.apple\.com$/', '/^[a-z0-9.-]+\.push\.apple\.com$/',
                    '/^[a-z0-9.-]+\.notify\.windows\.com$/', '/^[a-z0-9.-]+\.wns\.windows\.com$/'];

// ── Encoding ────────────────────────────────────────────────────────────────

function push_b64u(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }
function push_b64u_dec(string $s): string {
    $s = strtr(trim($s), '-_', '+/');
    $d = base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $d === false ? '' : $d;
}

/** A raw uncompressed P-256 point (0x04||X||Y) as a PEM public key. */
function push_pub_pem(string $raw65): string {
    $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw65;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** An EC key's public point as 65 raw bytes. */
function push_key_raw($key): string {
    $d = openssl_pkey_get_details($key);
    if (!$d || empty($d['ec']['x']) || empty($d['ec']['y'])) return '';
    return "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
}

function push_new_ec_key() {
    return openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
}

/** OpenSSL signs ECDSA as DER; JWS wants the two integers back to back, 32 bytes each. */
function push_der_to_jose(string $der): string {
    $o = 0;
    if (ord($der[$o++]) !== 0x30) return '';
    $len = ord($der[$o++]); if ($len & 0x80) $o += $len & 0x7f;
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        if (ord($der[$o++]) !== 0x02) return '';
        $l = ord($der[$o++]);
        $int = ltrim(substr($der, $o, $l), "\0"); $o += $l;
        $out .= str_pad($int, 32, "\0", STR_PAD_LEFT);
    }
    return $out;
}

// ── The server's identity (VAPID) ──────────────────────────────────────────

/**
 * The key pair this server signs with. Made once, on first use, and kept
 * SEALED in settings (the same seal the API keys screen uses) — a private key
 * in plain text in the database is one SQL dump from somebody else's
 * notifications going out under our name. config.php may pin one instead
 * (`push.vapid_public`, `push.vapid_private_pem`), which a multi-server
 * deployment needs, since every server must sign with the same key.
 *
 * @return array{pub:string, pem:string}|null
 */
function push_vapid(): ?array {
    static $memo = null;
    if ($memo !== null) return $memo ?: null;
    $cfg = $GLOBALS['CONFIG']['push'] ?? [];
    if (!empty($cfg['vapid_public']) && !empty($cfg['vapid_private_pem'])) {
        return $memo = ['pub' => (string)$cfg['vapid_public'], 'pem' => (string)$cfg['vapid_private_pem']];
    }
    if (!function_exists('openssl_pkey_new') || !function_exists('ai_ui_seal')) { $memo = false; return null; }
    $s = setting_get('push_vapid');
    if (is_array($s) && !empty($s['pub']) && !empty($s['sealed'])) {
        $pem = ai_ui_open((string)$s['sealed']);
        if ($pem !== '') return $memo = ['pub' => (string)$s['pub'], 'pem' => $pem];
    }
    $k = push_new_ec_key();
    if (!$k || !openssl_pkey_export($k, $pem)) { $memo = false; return null; }
    $pub = push_b64u(push_key_raw($k));
    $sealed = ai_ui_seal($pem);
    if ($pub === '' || $sealed === '') { $memo = false; return null; }
    /* A new key invalidates every existing subscription (they were made for
       the old one), so it is only ever written when none is stored. */
    setting_set('push_vapid', ['pub' => $pub, 'sealed' => $sealed, 'at' => now_iso()], 'system');
    return $memo = ['pub' => $pub, 'pem' => $pem];
}

/** The `sub` claim: who the push service should contact about abuse. */
function push_contact(): string {
    $c = trim((string)($GLOBALS['CONFIG']['push']['contact'] ?? ''));
    if ($c !== '') return $c;
    $from = trim((string)($GLOBALS['CONFIG']['mail']['from'] ?? ($GLOBALS['CONFIG']['mail_from'] ?? '')));
    if (preg_match('/[^\s<>@]+@[^\s<>@]+/', $from, $m)) return 'mailto:' . $m[0];
    $o = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    return $o !== '' ? $o : 'mailto:admin@example.org';
}

/** A signed VAPID token for one push service (its origin is the audience). */
function push_jwt(string $endpoint, string $pem): string {
    $u = parse_url($endpoint);
    $aud = ($u['scheme'] ?? 'https') . '://' . ($u['host'] ?? '') . (isset($u['port']) ? ':' . $u['port'] : '');
    $h = push_b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $c = push_b64u(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => push_contact()], JSON_UNESCAPED_SLASHES));
    $key = openssl_pkey_get_private($pem);
    if (!$key || !openssl_sign($h . '.' . $c, $der, $key, OPENSSL_ALGO_SHA256)) return '';
    $sig = push_der_to_jose($der);
    return $sig === '' ? '' : $h . '.' . $c . '.' . push_b64u($sig);
}

// ── Encryption (RFC 8291, aes128gcm) ───────────────────────────────────────

/**
 * Encrypt one payload to one browser. Only that browser holds the private
 * half of p256dh, so the push service (Google, Mozilla, Apple) carries the
 * message without being able to read it — which matters when the message is
 * about somebody's child.
 *
 * `$ephemeral`/`$salt` exist for the test that checks this against an
 * independent implementation; real calls let both be fresh every time.
 */
function push_encrypt(string $payload, string $p256dhB64, string $authB64, $ephemeral = null, ?string $salt = null): string {
    $uaPub = push_b64u_dec($p256dhB64); $auth = push_b64u_dec($authB64);
    if (strlen($uaPub) !== 65 || $uaPub[0] !== "\x04" || strlen($auth) !== 16) return '';
    $as = $ephemeral ?: push_new_ec_key();
    $asPub = push_key_raw($as);
    $peer = openssl_pkey_get_public(push_pub_pem($uaPub));
    if (!$peer || $asPub === '') return '';
    $ecdh = openssl_pkey_derive($peer, $as, 32);
    if ($ecdh === false || strlen($ecdh) !== 32) return '';
    $ikm = hash_hkdf('sha256', $ecdh, 32, "WebPush: info\0" . $uaPub . $asPub, $auth);
    $salt = $salt ?? random_bytes(16);
    $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
    $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
    $tag = '';
    $ct = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
    if ($ct === false) return '';
    return $salt . pack('N', 4096) . chr(65) . $asPub . $ct . $tag;
}

// ── Subscriptions ──────────────────────────────────────────────────────────

function push_subject_ok(string $s): bool { return (bool)preg_match('/^[mg]:[A-Za-z0-9_.:-]{1,80}$/', $s); }

function push_endpoint_ok(string $endpoint): bool {
    if (strlen($endpoint) > 1000) return false;
    $u = parse_url($endpoint);
    if (!$u || ($u['scheme'] ?? '') !== 'https' || empty($u['host'])) return false;
    $host = strtolower((string)$u['host']);
    foreach (PUSH_HOSTS as $re) if (preg_match($re, $host)) return true;
    return false;
}

/** push.subscribe — keep this device's subscription for a person. */
function push_subscribe(array $p): array {
    $subject = (string)($p['subject'] ?? '');
    if (!push_subject_ok($subject)) return ['ok' => false, 'error' => 'bad_subject'];
    $sub = is_array($p['sub'] ?? null) ? $p['sub'] : [];
    $endpoint = trim((string)($sub['endpoint'] ?? ''));
    $keys = is_array($sub['keys'] ?? null) ? $sub['keys'] : [];
    if (!push_endpoint_ok($endpoint)) return ['ok' => false, 'error' => 'bad_endpoint', 'detail' => 'That is not a push service this site sends to.'];
    $dh = (string)($keys['p256dh'] ?? ''); $au = (string)($keys['auth'] ?? '');
    $rdh = push_b64u_dec($dh);
    if (strlen($rdh) !== 65 || $rdh[0] !== "\x04" || strlen(push_b64u_dec($au)) !== 16) return ['ok' => false, 'error' => 'bad_keys'];
    $surface = in_array((string)($p['surface'] ?? ''), ['member', 'family', 'admin'], true) ? (string)$p['surface'] : 'member';
    $hash = hash('sha256', $endpoint);
    $now = now_iso();
    $have = db_row('SELECT id FROM push_subscriptions WHERE endpointHash = ? LIMIT 1', [$hash]);
    $row = ['subjectKey' => $subject, 'endpoint' => $endpoint, 'p256dh' => $dh, 'auth' => $au, 'surface' => $surface,
            'userAgent' => mb_substr((string)($p['userAgent'] ?? ''), 0, 255), 'failCount' => 0, 'lastError' => '', 'updatedAt' => $now];
    /* One endpoint is one browser profile. If somebody else signed in on it
       before, it is now this person's — a shared family tablet must not keep
       buzzing with the previous account's messages. */
    if ($have) db_update('push_subscriptions', $row, ['id' => (int)$have['id']]);
    else db_insert('push_subscriptions', $row + ['subId' => 'PS-' . rand_hex(8), 'endpointHash' => $hash, 'createdAt' => $now, 'lastOkAt' => '']);
    $all = db_all('SELECT id FROM push_subscriptions WHERE subjectKey = ? ORDER BY updatedAt DESC, id DESC', [$subject]);
    foreach (array_slice($all, PUSH_MAX_DEVICES) as $old) db_exec('DELETE FROM push_subscriptions WHERE id = ?', [(int)$old['id']]);
    audit('push.subscribe', $subject, $surface, ['host' => parse_url($endpoint, PHP_URL_HOST)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'devices' => min(count($all), PUSH_MAX_DEVICES)];
}

/** push.unsubscribe — this device, or every device when `all` is set. */
function push_unsubscribe(array $p): array {
    $subject = (string)($p['subject'] ?? '');
    if (!push_subject_ok($subject)) return ['ok' => false, 'error' => 'bad_subject'];
    if (!empty($p['all'])) $n = db_exec('DELETE FROM push_subscriptions WHERE subjectKey = ?', [$subject]);
    else $n = db_exec('DELETE FROM push_subscriptions WHERE subjectKey = ? AND endpointHash = ?', [$subject, hash('sha256', trim((string)($p['endpoint'] ?? '')))]);
    audit('push.unsubscribe', $subject, !empty($p['all']) ? 'all' : 'device', [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'removed' => $n];
}

// ── Preferences and presence ───────────────────────────────────────────────

function push_prefs_default(): array {
    return ['quiet' => true, 'quietFrom' => PUSH_QUIET_DEFAULT[0], 'quietTo' => PUSH_QUIET_DEFAULT[1], 'muted' => [], 'inboxEmail' => true];
}

/** One person's preferences, with anything missing or malformed set to the default. */
function push_prefs(string $subject): array {
    $row = db_row('SELECT prefs FROM notify_prefs WHERE subjectKey = ? LIMIT 1', [$subject]);
    return push_prefs_clean(is_array($j = json_decode((string)($row['prefs'] ?? ''), true)) ? $j : []);
}

function push_prefs_clean(array $in): array {
    $d = push_prefs_default();
    $t = static fn($v, $dflt) => preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string)$v) ? (string)$v : $dflt;
    return [
        'quiet' => array_key_exists('quiet', $in) ? (bool)$in['quiet'] : $d['quiet'],
        'quietFrom' => $t($in['quietFrom'] ?? '', $d['quietFrom']),
        'quietTo' => $t($in['quietTo'] ?? '', $d['quietTo']),
        'muted' => array_values(array_intersect(array_keys(PUSH_TOPICS), array_map('strval', (array)($in['muted'] ?? [])))),
        'inboxEmail' => array_key_exists('inboxEmail', $in) ? (bool)$in['inboxEmail'] : $d['inboxEmail'],
    ];
}

function push_prefs_row(string $subject): array {
    $row = db_row('SELECT * FROM notify_prefs WHERE subjectKey = ? LIMIT 1', [$subject]);
    if ($row) return $row;
    db_insert('notify_prefs', ['subjectKey' => $subject, 'prefs' => '', 'lastActiveAt' => '', 'lastSurface' => '', 'mailed' => '', 'updatedAt' => now_iso()]);
    return db_row('SELECT * FROM notify_prefs WHERE subjectKey = ? LIMIT 1', [$subject]) ?: [];
}

/** The topics a subject is offered: a family has no staff inbox; a member who
 *  is not staff has none either. */
function push_topics_for(string $subject, string $surface): array {
    if (str_starts_with($subject, 'g:')) $keys = PUSH_TOPICS_FAMILY;
    else {
        $keys = array_values(array_diff(array_keys(PUSH_TOPICS), ['inbox']));
        $m = db_row('SELECT role, capsExtra FROM members WHERE memberId = ? LIMIT 1', [substr($subject, 2)]);
        if ($m && is_admin_role($m['role'] ?? '')) $keys[] = 'inbox';
    }
    $out = [];
    foreach ($keys as $k) $out[] = ['id' => $k, 'label' => PUSH_TOPICS[$k]];
    return $out;
}

/** push.prefs — what this person gets, on how many devices, and when. */
function push_prefs_get(array $p): array {
    $subject = (string)($p['subject'] ?? '');
    if (!push_subject_ok($subject)) return ['ok' => false, 'error' => 'bad_subject'];
    $devs = db_all('SELECT surface, userAgent, createdAt, lastOkAt, failCount, endpointHash FROM push_subscriptions WHERE subjectKey = ? ORDER BY updatedAt DESC', [$subject]);
    $mine = trim((string)($p['endpoint'] ?? ''));
    $mineHash = $mine !== '' ? hash('sha256', $mine) : '';
    $v = push_vapid();
    $q = push_prefs(push_subject_ok($subject) ? $subject : '');
    return ['ok' => true, 'available' => $v !== null, 'publicKey' => $v['pub'] ?? '', 'prefs' => $q,
            'topics' => push_topics_for($subject, (string)($p['surface'] ?? '')), 'urgentKinds' => PUSH_URGENT_KINDS,
            'quietNow' => push_in_quiet($q, time()),
            'thisDevice' => $mineHash !== '' && (bool)array_filter($devs, static fn($d) => $d['endpointHash'] === $mineHash),
            'devices' => array_map(static fn($d) => ['surface' => (string)$d['surface'], 'device' => push_device_name((string)$d['userAgent']),
                'since' => (string)$d['createdAt'], 'lastOk' => (string)$d['lastOkAt'], 'failing' => (int)$d['failCount'] > 0,
                'thisOne' => $d['endpointHash'] === $mineHash], $devs)];
}

/** "Chrome on Android" — enough to recognise a device in a list, nothing more. */
function push_device_name(string $ua): string {
    $b = preg_match('/Edg\//', $ua) ? 'Edge' : (preg_match('/OPR\//', $ua) ? 'Opera' : (preg_match('/Firefox\//', $ua) ? 'Firefox'
       : (preg_match('/Chrome\//', $ua) ? 'Chrome' : (preg_match('/Safari\//', $ua) ? 'Safari' : 'Browser'))));
    $o = preg_match('/Android/', $ua) ? 'Android' : (preg_match('/iPhone|iPad|iPod/', $ua) ? 'iPhone or iPad'
       : (preg_match('/Windows/', $ua) ? 'Windows' : (preg_match('/Mac OS X|Macintosh/', $ua) ? 'Mac' : (preg_match('/Linux/', $ua) ? 'Linux' : 'a device'))));
    return $b . ' on ' . $o;
}

/** push.prefs.save */
function push_prefs_save(array $p): array {
    $subject = (string)($p['subject'] ?? '');
    if (!push_subject_ok($subject)) return ['ok' => false, 'error' => 'bad_subject'];
    $q = push_prefs_clean(is_array($p['prefs'] ?? null) ? $p['prefs'] : []);
    if ($q['quiet'] && $q['quietFrom'] === $q['quietTo']) return ['ok' => false, 'error' => 'quiet_empty', 'detail' => 'Quiet hours start and end at the same time. Pick two different times, or turn quiet hours off.'];
    push_prefs_row($subject);
    db_update('notify_prefs', ['prefs' => json_encode($q), 'updatedAt' => now_iso()], ['subjectKey' => $subject]);
    return ['ok' => true, 'prefs' => $q];
}

/** push.seen — the portal is open and in front of them. Written at most every 30s. */
function push_seen(array $p): array {
    $subject = (string)($p['subject'] ?? '');
    if (!push_subject_ok($subject)) return ['ok' => false, 'error' => 'bad_subject'];
    $surface = in_array((string)($p['surface'] ?? ''), ['member', 'family', 'admin'], true) ? (string)$p['surface'] : 'member';
    $row = push_prefs_row($subject);
    $last = strtotime((string)($row['lastActiveAt'] ?? '')) ?: 0;
    if (time() - $last >= 30 || (string)($row['lastSurface'] ?? '') !== $surface) {
        db_update('notify_prefs', ['lastActiveAt' => now_iso(), 'lastSurface' => $surface], ['subjectKey' => $subject]);
    }
    return ['ok' => true];
}

function push_tz(): DateTimeZone {
    try { return new DateTimeZone((string)($GLOBALS['CONFIG']['timezone'] ?? 'Africa/Lagos')); } catch (\Throwable $e) { return new DateTimeZone('Africa/Lagos'); }
}

/** Is `$ts` inside this person's quiet hours? Handles a window across midnight. */
function push_in_quiet(array $prefs, int $ts): bool {
    if (empty($prefs['quiet'])) return false;
    $t = (new DateTime('@' . $ts))->setTimezone(push_tz())->format('H:i');
    $a = (string)$prefs['quietFrom']; $b = (string)$prefs['quietTo'];
    return $a < $b ? ($t >= $a && $t < $b) : ($t >= $a || $t < $b);
}

/** When this person's current quiet hours end (unix seconds). */
function push_quiet_end(array $prefs, int $ts): int {
    $d = (new DateTime('@' . $ts))->setTimezone(push_tz());
    [$h, $m] = array_map('intval', explode(':', (string)$prefs['quietTo']));
    $end = (clone $d)->setTime($h, $m, 0);
    if ($end->getTimestamp() <= $ts) $end->modify('+1 day');
    return $end->getTimestamp();
}

// ── Classifying a notification ─────────────────────────────────────────────

/** Which mutable topic a notification belongs to, from its kind and the page it opens. */
function push_topic_of(string $kind, string $page = ''): string {
    $k = strtolower($kind); $pg = strtolower($page);
    if (in_array($k, ['approval', 'inbox', 'photo'], true) || $pg === 'admin') return 'inbox';
    if (in_array($k, ['dues', 'fines', 'fine', 'balance', 'membership', 'ngg_membership', 'money', 'payment', 'fee', 'fees', 'training'], true) || in_array($pg, ['money', 'account', 'pay'], true)) return 'money';
    if (in_array($k, ['request', 'account', 'guardian'], true) || $pg === 'records') return 'requests';
    if (in_array($k, ['checkin', 'checkout', 'attendance', 'formation', 'duty', 'volunteer', 'timetable'], true) || in_array($pg, ['saturday', 'timetable'], true)) return 'attendance';
    if (in_array($k, ['curriculum', 'results', 'mission', 'assignment', 'graded_exam', 'certificate', 'progress', 'lesson', 'learn', 'qualification', 'teaching', 'advance'], true)
        || in_array($pg, ['learn', 'curriculum', 'results', 'growth', 'journal'], true)) return 'learning';
    if (in_array($k, ['community', 'event', 'tournament', 'news'], true) || in_array($pg, ['community', 'events', 'opportunities'], true)) return 'community';
    return 'messages';
}

/** The member portal's address for an in-app notification's page (MP9_PATHS in mp9-app.jsx). */
function push_member_url(string $page): string {
    $map = ['dashboard' => '', 'today' => '', 'money' => 'account', 'account' => 'account', 'records' => 'records', 'journal' => 'journal',
            'community' => 'community', 'results' => 'results', 'learn' => 'learn', 'curriculum' => 'learn', 'mentor' => 'mentor',
            'timetable' => 'timetable', 'saturday' => 'saturday', 'growth' => 'growth', 'opportunities' => 'opportunities',
            'support' => 'support', 'me' => 'me', 'companion' => 'companion', 'passport' => 'passport', 'help' => 'help'];
    if ($page === 'admin') return '/control/inbox';
    if ($page === 'club-admin') return '/club-admin';
    $seg = $map[$page] ?? '';
    return '/dashboard' . ($seg !== '' ? '/' . $seg : '');
}

/** Only our own pages: a notification's link is opened by the service worker
 *  without the person seeing it first. */
function push_url_clean(string $url): string {
    $o = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    if ($o !== '' && str_starts_with($url, $o)) $url = substr($url, strlen($o));
    return preg_match('#^/[A-Za-z0-9/_\-?=&.%~+]*$#', $url) && !str_starts_with($url, '//') ? $url : '/';
}

// ── Dispatch: decide, then queue ───────────────────────────────────────────

/**
 * Hand one notification to the push rules. Never throws and never sends here:
 * it decides whether and when, and queues. Returns what it decided, for tests
 * and for the audit of a test push:
 *   none | muted | active | queued | held
 *
 * `$n`: title, body, url, tag, kind, surface (member|family|admin), urgent.
 */
function push_dispatch(string $subject, array $n): string {
    try {
        if (!push_subject_ok($subject)) return 'none';
        if (!db_row('SELECT id FROM push_subscriptions WHERE subjectKey = ? LIMIT 1', [$subject])) return 'none';
        $kind = (string)($n['kind'] ?? '');
        $urgent = !empty($n['urgent']) || in_array($kind, PUSH_URGENT_KINDS, true);
        $topic = (string)($n['topic'] ?? push_topic_of($kind, (string)($n['page'] ?? '')));
        $row = push_prefs_row($subject);
        $prefs = push_prefs_clean(is_array($j = json_decode((string)($row['prefs'] ?? ''), true)) ? $j : []);
        if (!$urgent && in_array($topic, $prefs['muted'], true)) return 'muted';
        $surface = (string)($n['surface'] ?? 'member');
        $now = time();
        $active = (strtotime((string)($row['lastActiveAt'] ?? '')) ?: 0) > $now - PUSH_ACTIVE_SECONDS && (string)($row['lastSurface'] ?? '') === $surface;
        if ($active && !$urgent) return 'active';

        $after = $now; $held = false;
        if (!$urgent && push_in_quiet($prefs, $now)) { $after = push_quiet_end($prefs, $now); $held = true; }
        if (!$urgent && !$held) {
            $since = gmdate('Y-m-d\TH:i:s\Z', $now - PUSH_BURST_WINDOW);
            $recent = db_all("SELECT sentAt FROM push_queue WHERE subjectKey = ? AND status = 'sent' AND sentAt >= ? ORDER BY sentAt ASC", [$subject, $since]);
            if (count($recent) >= PUSH_BURST_N) { $after = (strtotime((string)$recent[0]['sentAt']) ?: $now) + PUSH_BURST_WINDOW; $held = true; }
        }
        $title = mb_substr(trim((string)($n['title'] ?? '')), 0, 120);
        if ($title === '') return 'none';
        $q = ['subjectKey' => $subject, 'title' => $title, 'body' => mb_substr(trim(preg_replace('/\s+/', ' ', (string)($n['body'] ?? ''))), 0, 240),
              'url' => push_url_clean((string)($n['url'] ?? '/')), 'tag' => mb_substr((string)($n['tag'] ?? ''), 0, 64), 'kind' => mb_substr($kind, 0, 32),
              'topic' => $topic, 'surface' => $surface, 'urgent' => $urgent ? 1 : 0, 'held' => $held ? 1 : 0,
              'deliverAfter' => gmdate('Y-m-d\TH:i:s\Z', $after), 'status' => 'queued', 'sentAt' => ''];
        // The same thing again before the first went out: one notification, the latest words.
        $same = $q['tag'] !== '' ? db_row("SELECT id, deliverAfter FROM push_queue WHERE subjectKey = ? AND tag = ? AND status = 'queued' LIMIT 1", [$subject, $q['tag']]) : null;
        if ($same) {
            if ((string)$same['deliverAfter'] < $q['deliverAfter']) $q['deliverAfter'] = (string)$same['deliverAfter'];
            db_update('push_queue', $q, ['id' => (int)$same['id']]);
        } else db_insert('push_queue', $q + ['createdAt' => now_iso()]);
        if (!$held) push_flush_after_response($subject);
        return $held ? 'held' : 'queued';
    } catch (\Throwable $e) {
        error_log('[push_dispatch] ' . $e->getMessage());
        return 'none';
    }
}

/** Send this subject's due items once the response has gone (web only). */
function push_flush_after_response(string $subject): void {
    if (PHP_SAPI === 'cli') return;
    static $subjects = null;
    if ($subjects === null) {
        $subjects = [];
        register_shutdown_function(static function () use (&$subjects) {
            if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
            foreach (array_keys($subjects) as $s) { try { push_flush($s); } catch (\Throwable $e) { error_log('[push_flush] ' . $e->getMessage()); } }
        });
    }
    $subjects[$subject] = true;
}

// ── Sending ────────────────────────────────────────────────────────────────

/**
 * Send whatever is due — for one person, or everybody (the web-cron tick).
 * One item goes as itself. Several due at once for one person — the night's
 * held messages, a burst that waited out its window — go as ONE summary, so
 * nobody wakes up to eleven buzzes.
 *
 * @return array{people:int, sent:int, failed:int}
 */
function push_flush(?string $onlySubject = null, int $limit = 300): array {
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $rows = $onlySubject !== null
        ? db_all("SELECT * FROM push_queue WHERE status = 'queued' AND subjectKey = ? AND deliverAfter <= ? ORDER BY id LIMIT 50", [$onlySubject, $now])
        : db_all("SELECT * FROM push_queue WHERE status = 'queued' AND deliverAfter <= ? ORDER BY id LIMIT " . max(1, (int)$limit), [$now]);
    $by = [];
    foreach ($rows as $r) $by[(string)$r['subjectKey']][] = $r;
    $out = ['people' => 0, 'sent' => 0, 'failed' => 0];
    foreach ($by as $subject => $items) {
        // Claim first, so a tick and a shutdown flush cannot both send it.
        $ids = array_map(static fn($r) => (int)$r['id'], $items);
        $claimed = db_exec("UPDATE push_queue SET status = 'sending' WHERE status = 'queued' AND id IN (" . implode(',', $ids) . ')');
        if ($claimed < 1) continue;
        $items = db_all("SELECT * FROM push_queue WHERE status = 'sending' AND id IN (" . implode(',', $ids) . ') ORDER BY id');
        $msg = push_compose($items);
        $res = push_send_subject((string)$subject, $msg);
        $stamp = gmdate('Y-m-d\TH:i:s\Z');
        db_exec("UPDATE push_queue SET status = ?, sentAt = ? WHERE id IN (" . implode(',', array_map(static fn($r) => (int)$r['id'], $items)) . ')',
            [$res['sent'] > 0 ? 'sent' : 'failed', $stamp]);
        $out['people']++; $out['sent'] += $res['sent']; $out['failed'] += $res['failed'];
    }
    return $out;
}

/** One item as itself, several as one summary. */
function push_compose(array $items): array {
    $n = count($items);
    if ($n === 1) {
        $r = $items[0];
        return ['title' => (string)$r['title'], 'body' => (string)$r['body'], 'url' => (string)$r['url'],
                'tag' => (string)$r['tag'] !== '' ? (string)$r['tag'] : 'ngg-' . (string)$r['id'], 'urgent' => (bool)$r['urgent'], 'count' => 1];
    }
    $wasHeld = (bool)array_filter($items, static fn($r) => (int)$r['held'] === 1);
    $urls = array_values(array_unique(array_map(static fn($r) => (string)$r['url'], $items)));
    $topics = array_values(array_unique(array_map(static fn($r) => (string)$r['topic'], $items)));
    $surface = (string)$items[0]['surface'];
    $home = $surface === 'family' ? '/family' : ($surface === 'admin' ? '/control/inbox' : '/dashboard');
    $titles = array_values(array_unique(array_map(static fn($r) => (string)$r['title'], array_reverse($items))));
    $lead = $wasHeld ? 'While you were away: ' : '';
    $what = count($topics) === 1 && $topics[0] === 'inbox' ? $n . ' new items in the inbox' : $n . ' new updates';
    return ['title' => $lead . $what, 'body' => implode(' · ', array_slice($titles, 0, 3)) . (count($titles) > 3 ? ' · and ' . (count($titles) - 3) . ' more' : ''),
            'url' => count($urls) === 1 ? $urls[0] : $home, 'tag' => 'ngg-summary', 'urgent' => false, 'count' => $n];
}

/** Push one message to every device a person has. */
function push_send_subject(string $subject, array $msg): array {
    $v = push_vapid();
    $subs = db_all('SELECT * FROM push_subscriptions WHERE subjectKey = ?', [$subject]);
    $out = ['sent' => 0, 'failed' => 0, 'removed' => 0];
    if (!$v || !$subs) return $out;
    $payload = json_encode(['title' => $msg['title'], 'body' => $msg['body'], 'url' => $msg['url'], 'tag' => $msg['tag'],
        'urgent' => !empty($msg['urgent']), 'count' => (int)($msg['count'] ?? 1), 'ts' => time() * 1000], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    foreach ($subs as $s) {
        $r = push_send_one($s, $payload, $v, !empty($msg['urgent']), (string)$msg['tag']);
        if ($r === 'ok') $out['sent']++; elseif ($r === 'gone') { $out['removed']++; $out['failed']++; } else $out['failed']++;
    }
    return $out;
}

/** 'ok' | 'gone' (deleted) | 'error' */
function push_send_one(array $s, string $payload, array $v, bool $urgent, string $tag): string {
    $endpoint = (string)$s['endpoint'];
    if (!push_endpoint_ok($endpoint)) { db_exec('DELETE FROM push_subscriptions WHERE id = ?', [(int)$s['id']]); return 'gone'; }
    $body = push_encrypt($payload, (string)$s['p256dh'], (string)$s['auth']);
    $jwt = push_jwt($endpoint, $v['pem']);
    if ($body === '' || $jwt === '') return 'error';
    $headers = ['Authorization: vapid t=' . $jwt . ', k=' . $v['pub'], 'Content-Encoding: aes128gcm', 'Content-Type: application/octet-stream',
                'TTL: ' . ($urgent ? 3600 : 86400), 'Urgency: ' . ($urgent ? 'high' : 'normal')];
    // Topic lets the push service itself replace an undelivered older copy (a phone that was off).
    $topic = preg_replace('/[^A-Za-z0-9_-]/', '', $tag);
    if ($topic !== '') $headers[] = 'Topic: ' . substr($topic, 0, 32);
    $transport = $GLOBALS['__push_transport'] ?? 'push_http';
    $res = $transport($endpoint, $headers, $body);
    $code = (int)($res['status'] ?? 0);
    if ($code >= 200 && $code < 300) {
        db_update('push_subscriptions', ['lastOkAt' => now_iso(), 'failCount' => 0, 'lastError' => ''], ['id' => (int)$s['id']]);
        return 'ok';
    }
    if ($code === 404 || $code === 410) { db_exec('DELETE FROM push_subscriptions WHERE id = ?', [(int)$s['id']]); return 'gone'; }
    $fails = (int)$s['failCount'] + 1;
    if ($fails >= PUSH_DROP_AFTER_FAILS) { db_exec('DELETE FROM push_subscriptions WHERE id = ?', [(int)$s['id']]); return 'gone'; }
    db_update('push_subscriptions', ['failCount' => $fails, 'lastError' => mb_substr($code . ' ' . (string)($res['error'] ?? ''), 0, 200)], ['id' => (int)$s['id']]);
    return 'error';
}

function push_http(string $url, array $headers, string $body): array {
    /* The end-to-end test's sink: with `push.test_sink` set to a file, each
       push is written there (URL, headers, the encrypted body) instead of
       sent, so tests/push-e2e.test.js can decrypt exactly what would have
       gone out. Like the mail sink, it is only ever set in a test config. */
    $sink = (string)($GLOBALS['CONFIG']['push']['test_sink'] ?? '');
    if ($sink !== '') {
        @file_put_contents($sink, json_encode(['url' => $url, 'headers' => $headers, 'body' => base64_encode($body)]) . "\n", FILE_APPEND | LOCK_EX);
        return ['status' => 201, 'error' => ''];
    }
    if (!function_exists('curl_init')) return ['status' => 0, 'error' => 'no_curl'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => array_merge($headers, ['Content-Length: ' . strlen($body)]),
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = $resp === false ? curl_error($ch) : mb_substr((string)$resp, 0, 160);
    curl_close($ch);
    return ['status' => $code, 'error' => $err];
}

/** push.test — one notification to every device now, whatever the hour, and what happened. */
function push_test(array $p): array {
    $subject = (string)($p['subject'] ?? '');
    if (!push_subject_ok($subject)) return ['ok' => false, 'error' => 'bad_subject'];
    if (!push_vapid()) return ['ok' => false, 'error' => 'unavailable', 'detail' => 'This server cannot sign notifications (OpenSSL is missing).'];
    $surface = (string)($p['surface'] ?? 'member');
    $home = $surface === 'family' ? '/family' : ($surface === 'admin' ? '/control/inbox' : '/dashboard');
    $r = push_send_subject($subject, ['title' => 'Notifications are on', 'body' => 'This is how NGG will reach you on this device. You can change what you get at any time.',
        'url' => $home, 'tag' => 'ngg-test', 'urgent' => true, 'count' => 1]);
    $left = (int)(db_row('SELECT COUNT(*) c FROM push_subscriptions WHERE subjectKey = ?', [$subject])['c'] ?? 0);
    return ['ok' => true, 'sent' => $r['sent'], 'failed' => $r['failed'], 'removed' => $r['removed'], 'devices' => $left];
}

// ── Staff: a new item in the inbox ─────────────────────────────────────────

/** Which inbox view each source lands in, and who may see it — the same
 *  capabilities CR_PAGES.inbox gates the tabs on (cr-pages.jsx). */
const STAFF_INBOX_CATS = [
    'messages'     => ['cap' => 'inbox',   'one' => 'message',            'many' => 'messages'],
    'applications' => ['cap' => 'people',  'one' => 'application',        'many' => 'applications'],
    'approvals'    => ['cap' => 'people',  'one' => 'approval',           'many' => 'approvals'],
    'requests'     => ['cap' => 'people',  'one' => 'member request',     'many' => 'member requests'],
    'comments'     => ['cap' => 'content', 'one' => 'comment to moderate', 'many' => 'comments to moderate'],
    'photos'       => ['cap' => 'content', 'one' => 'photo to review',    'many' => 'photos to review'],
    'testimonials' => ['cap' => 'content', 'one' => 'testimonial',        'many' => 'testimonials'],
];
/** One email per person per inbox view in this window; the bell and the push keep counting. */
const STAFF_INBOX_MAIL_GAP = 1800;

/**
 * A new item is waiting in the staff inbox. Everybody who can act on it
 * (capability, and centre scope where the item has a centre) is told:
 *
 *   · the bell — ONE live item per inbox view that counts up ("4 new member
 *     requests") rather than four alerts, reset when they read it;
 *   · a push — which the bell triggers, with the same tag, so a phone shows
 *     one notification that updates;
 *   · an email — the first one, then not again for half an hour per view,
 *     and not at all while they are sitting in the Control Room, or when they
 *     switched inbox email off. The email says how many are waiting.
 *
 * `$o`: who (name), what (one line), body, centre, exclude (memberIds — the
 * person who caused it), urgent, filter (callable on a staff row).
 */
function staff_inbox_alert(string $cat, array $o): int {
    $c = STAFF_INBOX_CATS[$cat] ?? null;
    if (!$c) return 0;
    try {
        $centre = (string)($o['centre'] ?? '');
        $filter = $o['filter'] ?? null;
        $staff = staff_with_cap($c['cap'], (array)($o['exclude'] ?? []), static function ($s) use ($centre, $filter) {
            if ($filter && !$filter($s)) return false;
            if ($centre !== '') return admin_centre_allowed($s, $centre);
            // No centre on the item: only staff whose reach is not limited to named centres.
            return trim((string)($s['centreScope'] ?? '')) === '' || trim((string)($s['centreScope'] ?? '')) === '[]';
        });
    } catch (\Throwable $e) { error_log('[staff_inbox_alert] ' . $e->getMessage()); return 0; }
    $url = '/control/inbox/' . $cat;
    $who = trim((string)($o['who'] ?? ''));
    $what = trim((string)($o['what'] ?? ''));
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $n = 0;
    foreach ($staff as $s) {
        $mid = (string)$s['memberId'];
        try {
            $group = 'inbox:' . $cat;
            $prev = db_row('SELECT notifId, groupCount FROM notifications WHERE memberId = ? AND groupKey = ? ORDER BY id DESC LIMIT 1', [$mid, $group]);
            $read = $prev ? db_row("SELECT 1 FROM notification_state WHERE memberId = ? AND notifId = ? AND (readAt != '' OR dismissedAt != '')", [$mid, (string)$prev['notifId']]) : null;
            $count = $prev && !$read ? max(1, (int)($prev['groupCount'] ?? 1)) + 1 : 1;
            $title = $count === 1 ? 'New ' . $c['one'] . ($who !== '' ? ' · ' . $who : '') : $count . ' new ' . $c['many'];
            $body = $count === 1 ? $what : 'Latest: ' . ($who !== '' ? $who . ' — ' : '') . $what;
            push_notification($mid, ['kind' => 'inbox', 'title' => $title, 'body' => $body, 'linkPage' => 'admin', 'groupKey' => $group,
                'groupCount' => $count, 'actionLabel' => 'Open the inbox', 'url' => $url, 'surface' => 'admin', 'urgent' => !empty($o['urgent']), 'tag' => 'inbox-' . $cat]);
            staff_inbox_mail($s, $cat, $c, $count, $who, $what, (string)($o['body'] ?? ''), $origin . $url);
            $n++;
        } catch (\Throwable $e) { error_log('[staff_inbox_alert] ' . $mid . ': ' . $e->getMessage()); }
    }
    return $n;
}

function staff_inbox_mail(array $s, string $cat, array $c, int $count, string $who, string $what, string $body, string $link): void {
    $email = trim((string)($s['email'] ?? ''));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || !function_exists('send_mail') || !function_exists('email_template')) return;
    $subject = 'm:' . (string)$s['memberId'];
    $row = push_prefs_row($subject);
    $prefs = push_prefs_clean(is_array($j = json_decode((string)($row['prefs'] ?? ''), true)) ? $j : []);
    if (!$prefs['inboxEmail']) return;
    // At their desk in the Control Room: they can see it arrive.
    if ((strtotime((string)($row['lastActiveAt'] ?? '')) ?: 0) > time() - PUSH_ACTIVE_SECONDS && (string)($row['lastSurface'] ?? '') === 'admin') return;
    $mailed = is_array($m = json_decode((string)($row['mailed'] ?? ''), true)) ? $m : [];
    if ((time() - (int)($mailed[$cat] ?? 0)) < STAFF_INBOX_MAIL_GAP) return;
    $mailed[$cat] = time();
    db_update('notify_prefs', ['mailed' => json_encode($mailed)], ['subjectKey' => $subject]);
    $title = $count === 1 ? 'New ' . $c['one'] . ($who !== '' ? ' from ' . $who : '') : $count . ' ' . $c['many'] . ' are waiting';
    $html = email_template(['eyebrow' => 'NGG Control Room · Inbox', 'title' => $title,
        'intro' => $count === 1 ? 'Something new is waiting for you in the inbox.' : 'The latest is below. All ' . $count . ' are in the inbox.',
        'bodyHtml' => '<p style="margin:0 0 6px"><b>' . esc_html($who !== '' ? $who : ucfirst($c['one'])) . '</b></p>'
            . '<p style="margin:0 0 10px">' . nl2br(esc_html(mb_substr($what . ($body !== '' && $body !== $what ? "\n\n" . $body : ''), 0, 700))) . '</p>',
        'ctaLabel' => 'Open the inbox →', 'ctaUrl' => $link,
        'footNote' => 'You get at most one of these every half hour for each part of the inbox, and none while you are in the Control Room. Turn them off under Notifications in the Control Room.']);
    @send_mail($email, $title, $html);
}

// ── Family: mirror each family email as a push ─────────────────────────────

/** Called from family_mail(): the same news, on the parent's phone. */
function push_family_from_mail(string $email, string $subject, array $tpl): void {
    try {
        $g = db_row("SELECT guardianId FROM guardians WHERE email = ? AND status = 'active' LIMIT 1", [strtolower(trim($email))]);
        if (!$g) return;
        $body = trim(strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], ' ', (string)($tpl['intro'] ?? '') . ' ' . (string)($tpl['bodyHtml'] ?? ''))));
        $kind = (string)($tpl['pushKind'] ?? '');
        push_dispatch('g:' . (string)$g['guardianId'], ['title' => (string)($tpl['title'] ?? $subject), 'body' => html_entity_decode($body, ENT_QUOTES, 'UTF-8'),
            'url' => push_url_clean((string)($tpl['ctaUrl'] ?? '/family')), 'kind' => $kind !== '' ? $kind : push_family_kind($subject . ' ' . (string)($tpl['title'] ?? '')),
            'surface' => 'family', 'tag' => (string)($tpl['pushTag'] ?? '')]);
    } catch (\Throwable $e) { error_log('[push_family_from_mail] ' . $e->getMessage()); }
}

/** What a family email is about, from its words — a check-in is urgent, a newsletter is not. */
function push_family_kind(string $s): string {
    $s = strtolower($s);
    if (preg_match('/checked (in|out)|arrived|left the centre|picked up|collected/', $s)) return 'checkin';
    if (preg_match('/safeguard|concern|incident/', $s)) return 'safeguarding';
    if (preg_match('/sign.?in code|sign in to/', $s)) return 'security';
    if (preg_match('/fine|dues|payment|paid|invoice|owed|receipt|fee/', $s)) return 'money';
    if (preg_match('/request|approved|declined|answer/', $s)) return 'request';
    if (preg_match('/result|report|lesson|assignment|certificate/', $s)) return 'results';
    return 'announcement';
}

// ── Housekeeping ───────────────────────────────────────────────────────────

/** Forget the sent log after a week; it only exists for burst counting. */
function push_gc(): void {
    db_exec("DELETE FROM push_queue WHERE status IN ('sent', 'failed') AND createdAt < ?", [gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400)]);
    db_exec("UPDATE push_queue SET status = 'queued' WHERE status = 'sending' AND createdAt < ?", [gmdate('Y-m-d\TH:i:s\Z', time() - 3600)]);
}
