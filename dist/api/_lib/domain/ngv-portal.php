<?php
declare(strict_types=1);

/**
 * A member promoted to NGV gets their NGV account on the Afrovanguard site.
 *
 * NextGen Vanguard runs on afrovanguard.org.ng. Promoting somebody here made
 * them a volunteer here and nothing there, so a new vanguard reached the NGV
 * portal to find no account. Now every promotion is announced to Afrovanguard
 * (integrations/ngg.php there, lib/NgvIntake.php), which finds or creates the
 * account by email, enrols them in NGV and gives them an NGV ID.
 *
 * It goes over this site's integration bus — signed, recorded, retried with
 * backoff — as `private.ngv.account`. The details travel to Afrovanguard and
 * nowhere else: a `private.` event is delivered only to a destination that
 * names it, never to a '*' subscriber such as a Google Chat room.
 *
 * Configured by two settings (config.php → 'afrovanguard'):
 *   ngv_webhook_secret  the same value as NGG_WEBHOOK_SECRET on Afrovanguard;
 *                       empty ⇒ nothing is sent
 *   ngv_webhook_url     default {org_url}/integrations/ngg.php
 * The destination is created from them on first use, so nothing has to be
 * set up by hand in Integrations.
 */

const NGV_PORTAL_EVENT = 'private.ngv.account';
/* The reverse: a demoted vanguard stops being one on Afrovanguard too. Without
   it a demotion here left them an active participant there — fees accruing,
   their NGV card still opening the gate. */
const NGV_PORTAL_REVOKE_EVENT = 'private.ngv.revoked';
const NGV_PORTAL_INTEGRATION = 'INT-AV-NGV';

/** The Afrovanguard destination, created or brought up to date from config. '' when not configured. */
function ngv_portal_integration(): string {
    global $CONFIG;
    $av = (array)($CONFIG['afrovanguard'] ?? []);
    $secret = trim((string)($av['ngv_webhook_secret'] ?? ''));
    if ($secret === '') return '';
    $url = trim((string)($av['ngv_webhook_url'] ?? ''))
        ?: rtrim((string)($av['org_url'] ?? 'https://afrovanguard.org.ng'), '/') . '/integrations/ngg.php';
    $config = json_encode(['url' => $url, 'secret' => $secret], JSON_UNESCAPED_SLASHES);
    $events = json_encode([NGV_PORTAL_EVENT, NGV_PORTAL_REVOKE_EVENT]);
    $row = db_row('SELECT * FROM integrations WHERE integrationId = ? LIMIT 1', [NGV_PORTAL_INTEGRATION]);
    if (!$row) {
        db_insert('integrations', ['integrationId' => NGV_PORTAL_INTEGRATION, 'kind' => 'webhook', 'name' => 'Afrovanguard — NGV accounts',
            'config' => $config, 'events' => $events, 'status' => 'active', 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    } elseif ((string)$row['config'] !== $config || (string)$row['events'] !== $events || (string)$row['status'] !== 'active') {
        db_update('integrations', ['config' => $config, 'events' => $events, 'status' => 'active', 'updatedAt' => now_iso()], ['integrationId' => NGV_PORTAL_INTEGRATION]);
    }
    return NGV_PORTAL_INTEGRATION;
}

/** What Afrovanguard needs to open the account — no guardian, no school, no notes. */
function ngv_portal_payload(array $m, string $volunteerId): array {
    return [
        'nggMemberId' => (string)$m['memberId'], 'name' => (string)($m['fullName'] ?? ''),
        'email' => strtolower(trim((string)($m['email'] ?? ''))), 'phone' => (string)($m['phone'] ?? ''),
        'centre' => (string)($m['centre'] ?? ''), 'dob' => (string)($m['dob'] ?? ''),
        'track' => (string)($m['track'] ?? ''), 'displayId' => (string)($m['displayId'] ?? ''),
        'volunteerId' => $volunteerId,
    ];
}

/**
 * Tell Afrovanguard. Tried at once, so the account is usually there by the time
 * the new vanguard reads their welcome email; if Afrovanguard is down the bus
 * keeps the delivery and the dispatcher retries it.
 *
 * @return array{sent:bool, status:string}
 */
function ngv_portal_announce(array $m, string $volunteerId): array {
    $int = ngv_portal_integration();
    if ($int === '') return ['sent' => false, 'status' => 'not_configured'];
    $eventId = event_emit(NGV_PORTAL_EVENT, ngv_portal_payload($m, $volunteerId));
    if ($eventId === '') return ['sent' => false, 'status' => 'not_queued'];
    $d = db_row('SELECT * FROM deliveries WHERE eventId = ? AND integrationId = ? LIMIT 1', [$eventId, $int]);
    if (!$d) return ['sent' => false, 'status' => 'not_queued'];
    $r = bus_attempt($d);
    return ['sent' => !empty($r['ok']), 'status' => !empty($r['ok']) ? 'delivered' : 'queued'];
}

/** Tell Afrovanguard a vanguard was demoted here. Same path as an announcement. */
function ngv_portal_revoke(string $memberId): array {
    $int = ngv_portal_integration();
    if ($int === '') return ['sent' => false, 'status' => 'not_configured'];
    $eventId = event_emit(NGV_PORTAL_REVOKE_EVENT, ['nggMemberId' => $memberId]);
    if ($eventId === '') return ['sent' => false, 'status' => 'not_queued'];
    $d = db_row('SELECT * FROM deliveries WHERE eventId = ? AND integrationId = ? LIMIT 1', [$eventId, $int]);
    if (!$d) return ['sent' => false, 'status' => 'not_queued'];
    $r = bus_attempt($d);
    return ['sent' => !empty($r['ok']), 'status' => !empty($r['ok']) ? 'delivered' : 'queued'];
}

/**
 * Everybody already promoted, announced again — for the vanguards promoted
 * before this existed. Afrovanguard is idempotent by NGG member id, so a
 * second run creates nothing twice. Scoped admins reach their own centres.
 *
 * Queued, then delivered within a time budget. It used to deliver inline, one
 * signed request after another for up to 500 members, which on shared hosting
 * is killed at ~30s mid-loop (no audit row, an error on screen), and the 500
 * cap meant anybody past it was never sent. Everybody is queued now; what does
 * not fit in the budget goes with the dispatcher's next run.
 */
function admin_members_ngv_portal_sync(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    if (ngv_portal_integration() === '') return ['ok' => false, 'error' => 'not_configured',
        'detail' => 'Set afrovanguard.ngv_webhook_secret in config.php (the same value as NGG_WEBHOOK_SECRET on Afrovanguard).'];
    $scope = admin_centre_names_in_scope($g['requester']);
    $sql = "SELECT m.*, v.volunteerId AS vid FROM members m JOIN volunteers v ON v.memberId = m.memberId AND v.status = 'active' WHERE COALESCE(m.ngvVolunteerId,'') <> ''";
    $args = [];
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'announced' => 0, 'delivered' => 0];
        $sql .= ' AND m.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')';
        $args = $scope;
    }
    $int = ngv_portal_integration();
    $queued = [];
    foreach (db_all($sql . ' ORDER BY m.ngvAt ASC', $args) as $m) {
        $eventId = event_emit(NGV_PORTAL_EVENT, ngv_portal_payload($m, (string)$m['vid']));
        if ($eventId !== '') $queued[] = $eventId;
    }
    $budget = microtime(true) + 15.0;
    $ok = 0;
    foreach ($queued as $eventId) {
        if (microtime(true) >= $budget) break;
        $d = db_row('SELECT * FROM deliveries WHERE eventId = ? AND integrationId = ? LIMIT 1', [$eventId, $int]);
        if ($d && !empty(bus_attempt($d)['ok'])) $ok++;
    }
    $n = count($queued);
    audit('member.ngv.portalSync', (string)($g['requester']['memberId'] ?? ''), '', ['announced' => $n, 'delivered' => $ok], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'announced' => $n, 'delivered' => $ok, 'queued' => $n - $ok];
}

/* ── Afrovanguard member cards, printed in the ID Card Studio ─────────────

   Afrovanguard's member cards are printed here, in the ID Card Studio, with
   its sheets, print log and reprint queue (owner, 2026-10-09). The card stays
   ONE renderer — Afrovanguard's own partial. Afrovanguard hands it over
   (integrations/ngg-cards.php there): who has a card, the card's stylesheet
   with every asset inlined, and each card's markup. The studio lays that out
   alone in a same-origin iframe at the design's 10px/mm and rasterises it with
   snapDOM (src/modules/idcards/ids-av.jsx); it is never drawn a second time.

   Server to server, signed with the shared secret the NGV integration already
   uses (afrovanguard.ngv_webhook_secret = NGG_WEBHOOK_SECRET there):
   X-NGG-Signature: sha256=hex(HMAC_SHA256(secret, "cards." + ts + "." + body)). */

const AV_CARDS_FACES_MAX = 24;
const AV_CARDS_STYLE_TTL = 7 * 86400;

/** One signed request to Afrovanguard. ['ok' => true, …] or ['ok' => false, 'error']. */
function av_cards_call(string $op, array $payload = [], int $timeout = 25): array {
    if (isset($GLOBALS['__av_cards_mock']) && is_callable($GLOBALS['__av_cards_mock'])) return ($GLOBALS['__av_cards_mock'])($op, $payload);
    global $CONFIG;
    $av = (array)($CONFIG['afrovanguard'] ?? []);
    $secret = trim((string)($av['ngv_webhook_secret'] ?? ''));
    if ($secret === '') return ['ok' => false, 'error' => 'not_configured',
        'detail' => 'Set afrovanguard.ngv_webhook_secret in config.php (the same value as NGG_WEBHOOK_SECRET on Afrovanguard).'];
    $url = rtrim((string)($av['org_url'] ?? 'https://afrovanguard.org.ng'), '/') . '/integrations/ngg-cards.php';
    $body = (string)json_encode(['op' => $op] + $payload, JSON_UNESCAPED_SLASHES);
    $ts = (string)time();
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
        CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-NGG-Timestamp: ' . $ts,
            'X-NGG-Signature: sha256=' . hash_hmac('sha256', 'cards.' . $ts . '.' . $body, $secret)],
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $d = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($d)) return ['ok' => false, 'error' => 'av_unreachable', 'detail' => 'Afrovanguard did not answer (HTTP ' . $code . ').'];
    if (empty($d['ok'])) return ['ok' => false, 'error' => (string)($d['error'] ?? 'av_refused'),
        'detail' => $code === 401 ? 'Afrovanguard refused the signature — the two secrets differ.' : 'Afrovanguard refused the request.'];
    return $d;
}

/**
 * Everybody on Afrovanguard with a card, as studio rows (the shape idsRecord
 * reads for kind "afrovanguard").
 */
function admin_ids_av_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $r = av_cards_call('list', ['q' => mb_substr((string)($p['q'] ?? ''), 0, 80)]);
    if (empty($r['ok'])) return $r;
    $rows = [];
    foreach ((array)($r['cards'] ?? []) as $c) {
        if (!is_array($c) || (string)($c['id'] ?? '') === '') continue;
        $rows[] = [
            'avId' => (string)$c['id'], 'fullName' => (string)($c['name'] ?? ''),
            'displayId' => (string)($c['printedId'] ?? ''), 'number' => (string)($c['number'] ?? ''),
            'level' => (string)($c['level'] ?? ''), 'avKind' => (string)($c['kind'] ?? ''),
            // What the printed QR must decode to contain: the card's code (its /q/ address).
            'token' => (string)($c['cardCode'] ?? ''), 'scanUrl' => (string)($c['scanUrl'] ?? ''),
            'hasPhoto' => !empty($c['photo']), 'status' => (string)($c['status'] ?? ''),
            'version' => (string)($c['version'] ?? ''), 'design' => (string)($r['design'] ?? ''),
        ];
    }
    return ['ok' => true, 'cards' => $rows, 'design' => (string)($r['design'] ?? ''),
            'program' => ['name' => 'Afrovanguard', 'widthMm' => 54, 'heightMm' => 85.6]];
}

/** The card's stylesheet, fonts and seal inlined. Kept a week per design version. */
function admin_ids_av_style(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    global $CONFIG;
    $design = preg_replace('/[^a-z0-9-]/i', '', (string)($p['design'] ?? ''));
    $file = $design !== '' ? ($CONFIG['cache_dir'] ?? sys_get_temp_dir()) . '/av_card_style__' . $design . '.json' : '';
    if ($file !== '' && is_file($file) && time() - (int)filemtime($file) < AV_CARDS_STYLE_TTL) {
        $hit = json_decode((string)file_get_contents($file), true);
        if (is_array($hit) && !empty($hit['css'])) return ['ok' => true] + $hit;
    }
    $r = av_cards_call('style', [], 40);
    if (empty($r['ok'])) return $r;
    $out = ['version' => (string)($r['version'] ?? ''), 'css' => (string)($r['css'] ?? ''), 'seal' => (string)($r['seal'] ?? ''),
            'mm' => $r['mm'] ?? ['w' => 54, 'h' => 85.6], 'pxPerMm' => (int)($r['pxPerMm'] ?? 10)];
    if ($file !== '' && $out['version'] === $design) @file_put_contents($file, json_encode($out, JSON_UNESCAPED_SLASHES));
    return ['ok' => true] + $out;
}

/** Front and back markup for up to 24 cards. */
function admin_ids_av_faces(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_filter(array_map(static fn($x) => preg_replace('/\D/', '', (string)$x), (array)($p['ids'] ?? [])))));
    if (!$ids) return ['ok' => false, 'error' => 'no_items'];
    if (count($ids) > AV_CARDS_FACES_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => AV_CARDS_FACES_MAX];
    $r = av_cards_call('faces', ['ids' => $ids], 40);
    if (empty($r['ok'])) return $r;
    return ['ok' => true, 'faces' => (object)($r['faces'] ?? []), 'design' => (string)($r['design'] ?? '')];
}
