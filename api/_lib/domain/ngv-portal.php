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
/* The reverse: no longer a vanguard here (demoted, erased, or the guardian
 * withdrew ngv_transfer) stops them being one on Afrovanguard too. Without it
 * they stayed an active participant there, fees accruing, their NGV card still
 * opening the gate. Afrovanguard's NgvIntake::revoke() withdraws them and voids
 * the card; it needs only nggMemberId. */
const NGV_PORTAL_REVOKE_EVENT = 'private.ngv.revoked';
const NGV_REVOKED_EVENT = NGV_PORTAL_REVOKE_EVENT;
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

/* ── A child's details leave NGG only with their guardian's consent ─────────
 *
 * Afrovanguard holds an intake with minor=true unless guardianConsent.status
 * is 'granted' (docs/afrovanguard-sync.md has the contract). The consent is a
 * row in the ordinary ledger (type ngv_transfer, recorded under Publication
 * consent with the guardian's name); the latest row wins, so a withdrawal
 * takes effect on the next read. */
const NGV_TRANSFER_CONSENT = 'ngv_transfer';
const NGV_ADULT_AGE = 18;

/** Under 18 — or no usable date of birth, which is treated the same way. */
function ngv_is_minor(string $dob): bool {
    $dob = trim($dob);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}/', $dob)) return true;
    $age = dob_age(substr($dob, 0, 10));
    return $age < 0 || $age < NGV_ADULT_AGE;
}

/** The latest ngv_transfer decision for each member (memberId => row). One query. */
function ngv_transfer_consents(array $memberIds): array {
    $ids = array_values(array_unique(array_filter(array_map('strval', $memberIds), fn($x) => $x !== '')));
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $out = [];
    foreach (db_all("SELECT studentId, status, method, actorName, createdAt FROM consents
                     WHERE type = ? AND studentId IN ($in) ORDER BY id", array_merge([NGV_TRANSFER_CONSENT], $ids)) as $c) {
        $out[(string)$c['studentId']] = $c;   // ordered by id: the last one wins
    }
    return $out;
}

/** `minor` and `guardianConsent` exactly as the promotion payload carries them. */
function ngv_guardian_consent(array $m, ?array $latest = null): array {
    if (!ngv_is_minor((string)($m['dob'] ?? ''))) {
        return ['minor' => false, 'guardianConsent' => ['status' => 'n/a', 'method' => '', 'at' => '', 'by' => '']];
    }
    $c = $latest ?? (ngv_transfer_consents([(string)$m['memberId']])[(string)$m['memberId']] ?? null);
    if (!$c || (string)$c['status'] !== 'granted') {
        return ['minor' => true, 'guardianConsent' => ['status' => 'none', 'method' => '', 'at' => '', 'by' => '']];
    }
    return ['minor' => true, 'guardianConsent' => ['status' => 'granted', 'method' => (string)($c['method'] ?? ''),
        'at' => (string)($c['createdAt'] ?? ''), 'by' => (string)($c['actorName'] ?? '')]];
}

/** What Afrovanguard needs to open the account — no guardian, no school, no notes. */
function ngv_portal_payload(array $m, string $volunteerId): array {
    return [
        'nggMemberId' => (string)$m['memberId'], 'name' => (string)($m['fullName'] ?? ''),
        'email' => strtolower(trim((string)($m['email'] ?? ''))), 'phone' => (string)($m['phone'] ?? ''),
        'centre' => (string)($m['centre'] ?? ''), 'dob' => (string)($m['dob'] ?? ''),
        'track' => (string)($m['track'] ?? ''), 'displayId' => (string)($m['displayId'] ?? ''),
        'volunteerId' => $volunteerId,
    ] + ngv_guardian_consent($m);
}

/**
 * Tell Afrovanguard. Tried at once, so the account is usually there by the time
 * the new vanguard reads their welcome email; if Afrovanguard is down the bus
 * keeps the delivery and the dispatcher retries it.
 *
 * @return array{sent:bool, status:string}
 */
function ngv_portal_announce(array $m, string $volunteerId): array {
    if (ngv_portal_integration() === '') return ['sent' => false, 'status' => 'not_configured'];
    $payload = ngv_portal_payload($m, $volunteerId);
    // Never sent to be held: a minor without consent stays home (the sync too).
    if ($payload['minor'] && $payload['guardianConsent']['status'] !== 'granted') return ['sent' => false, 'status' => 'consent_required'];
    return ngv_portal_send(NGV_PORTAL_EVENT, $payload);
}

/** Emit on the bus and try the Afrovanguard delivery at once; the dispatcher retries. */
function ngv_portal_send(string $event, array $payload): array {
    $int = ngv_portal_integration();
    if ($int === '') return ['sent' => false, 'status' => 'not_configured'];
    $eventId = event_emit($event, $payload);
    if ($eventId === '') return ['sent' => false, 'status' => 'not_queued'];
    $d = db_row('SELECT * FROM deliveries WHERE eventId = ? AND integrationId = ? LIMIT 1', [$eventId, $int]);
    if (!$d) return ['sent' => false, 'status' => 'not_queued'];
    $r = bus_attempt($d);
    return ['sent' => !empty($r['ok']), 'status' => !empty($r['ok']) ? 'delivered' : 'queued'];
}

/**
 * Tell Afrovanguard somebody is no longer a vanguard. `reason` is one of
 * demoted | erased | consent_withdrawn — Afrovanguard acts on nggMemberId
 * alone, the rest is for its log. Nothing personal travels with it.
 */
function ngv_portal_revoke(string $memberId, string $volunteerId = '', string $reason = 'demoted'): array {
    return ngv_portal_send(NGV_PORTAL_REVOKE_EVENT, ngv_portal_revoke_payload($memberId, $volunteerId, $reason));
}

function ngv_portal_revoke_payload(string $memberId, string $volunteerId, string $reason): array {
    return ['nggMemberId' => $memberId, 'volunteerId' => $volunteerId, 'reason' => $reason, 'at' => now_iso()];
}

/**
 * Members who were ever put forward for NGV and are not vanguards any more,
 * with why: erased, demoted, or a guardian's ngv_transfer withdrawn (a minor
 * whose latest row is not a grant). Bounded; scoped like the roster.
 *
 * A minor promoted before the consent rule with NO ngv_transfer row at all is
 * not here: nobody withdrew anything, so they are held, never re-sent (see
 * ngv_portal_announce), and whether to revoke them is a decision for staff.
 */
function ngv_portal_revocations(?array $scope): array {
    $sql = "SELECT m.memberId, m.status, m.dob, COALESCE(m.ngvVolunteerId, '') AS nvid,
                   (SELECT v.volunteerId FROM volunteers v WHERE v.memberId = m.memberId ORDER BY v.id DESC LIMIT 1) AS vid
              FROM members m
             WHERE (EXISTS (SELECT 1 FROM volunteers v WHERE v.memberId = m.memberId)
                    OR EXISTS (SELECT 1 FROM member_promotions p WHERE p.memberId = m.memberId))";
    $args = [];
    if ($scope !== null) {
        if (!$scope) return [];
        $sql .= ' AND m.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')';
        $args = $scope;
    }
    $rows = db_all($sql . ' ORDER BY m.id LIMIT 500', $args);
    $consents = ngv_transfer_consents(array_column($rows, 'memberId'));
    $out = [];
    foreach ($rows as $m) {
        $mid = (string)$m['memberId'];
        $vid = (string)($m['nvid'] ?: ($m['vid'] ?? ''));
        if ((string)$m['status'] === 'deleted') $why = 'erased';
        elseif ((string)$m['nvid'] === '') $why = 'demoted';
        elseif (ngv_is_minor((string)($m['dob'] ?? '')) && isset($consents[$mid]) && (string)$consents[$mid]['status'] !== 'granted') $why = 'consent_withdrawn';
        else continue;
        $out[] = ['memberId' => $mid, 'volunteerId' => $vid, 'reason' => $why];
    }
    return $out;
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
 *
 * And the other half: everybody who stopped being a vanguard (demoted,
 * erased, consent withdrawn) is revoked again, which is also the backfill for
 * the ones who stopped before NGG sent revocations at all. Afrovanguard's
 * revoke is idempotent too.
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
    $queued = []; $held = 0;
    foreach (db_all($sql . ' ORDER BY m.ngvAt ASC', $args) as $m) {
        $payload = ngv_portal_payload($m, (string)$m['vid']);
        // A minor without their guardian's consent stays home, as in ngv_portal_announce.
        if ($payload['minor'] && $payload['guardianConsent']['status'] !== 'granted') { $held++; continue; }
        $eventId = event_emit(NGV_PORTAL_EVENT, $payload);
        if ($eventId !== '') $queued[$eventId] = true;
    }
    $revokes = [];
    foreach (ngv_portal_revocations($scope) as $x) {
        $eventId = event_emit(NGV_PORTAL_REVOKE_EVENT, ngv_portal_revoke_payload($x['memberId'], $x['volunteerId'], $x['reason']));
        if ($eventId !== '') $revokes[$eventId] = true;
    }
    $budget = microtime(true) + 15.0;
    $ok = 0;
    foreach (array_keys($queued + $revokes) as $eventId) {
        if (microtime(true) >= $budget) break;
        $d = db_row('SELECT * FROM deliveries WHERE eventId = ? AND integrationId = ? LIMIT 1', [$eventId, $int]);
        if ($d && !empty(bus_attempt($d)['ok']) && isset($queued[$eventId])) $ok++;
    }
    $n = count($queued); $revoked = count($revokes);
    audit('member.ngv.portalSync', (string)($g['requester']['memberId'] ?? ''), '',
          ['announced' => $n, 'delivered' => $ok, 'heldForConsent' => $held, 'revoked' => $revoked], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'announced' => $n, 'delivered' => $ok, 'queued' => $n - $ok, 'heldForConsent' => $held, 'revoked' => $revoked];
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
        'detail' => 'NGG has no Afrovanguard secret. Set afrovanguard.ngv_webhook_secret in api/config.php to the same value as Afrovanguard’s Studio → Settings → NextGen Genius → Shared secret.'];
    $url = rtrim((string)($av['org_url'] ?? 'https://afrovanguard.org.ng'), '/') . '/integrations/ngg-cards.php';
    $body = (string)json_encode(['op' => $op] + $payload, JSON_UNESCAPED_SLASHES);
    $ts = (string)time();
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
        CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
        // afrovanguard.org.ng → www / http → https: follow, and keep it a POST
        // (a plain redirect turns it into a GET, which the endpoint refuses).
        CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
        CURLOPT_POSTREDIR => 7,   // CURL_REDIR_POST_ALL
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json', 'X-NGG-Timestamp: ' . $ts,
            'X-NGG-Signature: sha256=' . hash_hmac('sha256', 'cards.' . $ts . '.' . $body, $secret)],
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = (string)curl_error($ch);
    $final = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);
    $d = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($d)) {
        $why = $cerr !== '' ? 'could not connect (' . $cerr . ')'
             : ($code === 404 ? 'the card endpoint was not found — deploy integrations/ngg-cards.php on Afrovanguard'
             : 'answered HTTP ' . $code . ' without data');
        return ['ok' => false, 'error' => 'av_unreachable', 'detail' => 'Afrovanguard at ' . ($final ?: $url) . ' ' . $why . '.'];
    }
    if (empty($d['ok'])) {
        $e = (string)($d['error'] ?? 'av_refused');
        $detail = match (true) {
            $e === 'bad_signature' => 'Afrovanguard refused the signature: the two secrets differ, or the two servers’ clocks are more than 5 minutes apart.',
            $e === 'not-configured' => 'Afrovanguard has no NGG secret set. Set it in Afrovanguard’s Studio → Settings → NextGen Genius → Shared secret (the same value as here).',
            default => 'Afrovanguard refused the request (' . $e . ', HTTP ' . $code . ').',
        };
        return ['ok' => false, 'error' => $e, 'detail' => $detail];
    }
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

/* ══ NGG volunteers for Afrovanguard (api/hooks/afrovanguard.php) ═══════════
 *
 * Afrovanguard recognises NGG's volunteers when they sign in there and lists
 * them in its Volunteer dashboard, so it asks for them — signed with the same
 * shared secret as the NGV promotions, under its own purpose ("volunteers.")
 * so neither signature can be replayed at the other's endpoint.
 *
 * NGG volunteers only. Summer School volunteers are not Afrovanguard's: a
 * volunteer is NGG's when the application they came through was for the NGG
 * programme ("anchor"), or when they are an NGG member promoted to volunteer.
 * A legacy application with no programme counts as Summer, exactly as intake
 * reads it (admin2.php), so nobody is sent on a guess.
 *
 * What is sent is what recognising somebody needs: who they are, how to match
 * them (email, phone), their role and centre, and what NGG has counted of
 * their service. Not their birthday, sex, faculty or anything about the
 * children they work with.
 */
function av_volunteer_is_ngg(array $v): bool {
    // The volunteer's own programme (migration 122): Summer volunteers stay
    // home, NGG volunteers — applied via /join/volunteer, made one from an NGG
    // member, or promoted from Summer — are Afrovanguard's to see.
    return in_array(volunteer_programme($v), ['ngg', 'both'], true);
}

/**
 * Which promoted volunteers may have their contact details and photograph
 * sent: memberId => bool. A promoted member who is a minor (or has no usable
 * date of birth) without a granted ngv_transfer consent may not. Two queries
 * for the page, never one per row.
 */
function av_volunteer_contact_ok(array $vols): array {
    $mids = array_values(array_unique(array_filter(array_map(fn($v) => (string)($v['memberId'] ?? ''), $vols))));
    if (!$mids) return [];
    $in = implode(',', array_fill(0, count($mids), '?'));
    $consents = ngv_transfer_consents($mids);
    $out = [];
    foreach (db_all("SELECT memberId, dob FROM members WHERE memberId IN ($in)", $mids) as $m) {
        $out[(string)$m['memberId']] = ngv_guardian_consent($m, $consents[(string)$m['memberId']] ?? ['status' => ''])['guardianConsent']['status'] !== 'none';
    }
    return $out;
}

function av_volunteer_row(array $v, bool $contactOk = true): array {
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $photo = (string)($v['photoUrl'] ?? '');
    if ($photo !== '' && !preg_match('#^https?://#i', $photo)) $photo = $origin . '/' . ltrim($photo, '/');
    $tier = vol_tier_for((string)($v['role'] ?? ''));
    $ledger = volunteer_ledger((string)$v['volunteerId']);
    $game = (array)($ledger['game'] ?? []);
    $row = [
        'volunteerId' => (string)$v['volunteerId'], 'memberId' => (string)($v['memberId'] ?? ''),
        'name' => (string)($v['fullName'] ?? ''), 'email' => strtolower(trim((string)($v['email'] ?? ''))), 'phone' => (string)($v['phone'] ?? ''),
        'role' => (string)($v['role'] ?? ''), 'roleLabel' => (string)($tier['name'] ?? ''), 'centre' => (string)($v['centre'] ?? ''),
        'programme' => 'ngg', 'status' => (string)($v['status'] ?? 'active'), 'safeguardingCleared' => (string)($v['safeguarding'] ?? 'pending') === 'cleared',
        'photoUrl' => $photo, 'joinedAt' => (string)($v['createdAt'] ?? ''), 'updatedAt' => (string)($v['updatedAt'] ?? ''),
        'sessions' => (int)($ledger['sessions'] ?? 0), 'hours' => (int)($ledger['hours'] ?? 0),
        'certificates' => count((array)($ledger['certificates'] ?? [])),
        'points' => (int)($game['points'] ?? 0), 'level' => (string)($game['levelName'] ?? ($game['level']['name'] ?? '')),
    ];
    if (!$contactOk) unset($row['email'], $row['phone'], $row['photoUrl']);
    return $row;
}

/**
 * One page of NGG volunteers, oldest first by row: {volunteers, next, done}.
 * `after` is the cursor from the previous page; `limit` at most 200.
 */
function av_volunteer_feed(array $in): array {
    $after = max(0, (int)($in['after'] ?? 0));
    $limit = max(1, min(200, (int)($in['limit'] ?? 100)));
    $rows = db_all('SELECT * FROM volunteers WHERE id > ? ORDER BY id LIMIT ' . $limit, [$after]);
    $contactOk = av_volunteer_contact_ok($rows);
    $out = [];
    $last = $after;
    foreach ($rows as $v) {
        $last = (int)$v['id'];
        if (!av_volunteer_is_ngg($v)) continue;
        $out[] = av_volunteer_row($v, $contactOk[(string)($v['memberId'] ?? '')] ?? true);
    }
    return ['ok' => true, 'volunteers' => $out, 'next' => count($rows) === $limit ? $last : null, 'done' => count($rows) < $limit];
}

/**
 * Every session an NGG volunteer served, one attendance row each, so
 * Afrovanguard can credit them as volunteer hours: {sessions, next, done}.
 *
 * Paged by the attendance row id (`after` = the last id seen, `limit` 1..500,
 * default 200), so it is incremental and stable. Only rows whose studentId is
 * an NGG-programme volunteer's volunteerId are sent; a Summer volunteer's
 * sessions stay home. Minutes are the gate's in→out span when both exist and
 * it is 15 min..12 h ('gate'), otherwise the standard credit per session
 * ('standard', volunteer_session_hours() × 60).
 *
 * The attendance table has no updatedAt (a check-out added later rewrites
 * checkOutAt in place, behind the cursor), so `updatedAt` is only sent if such
 * a column ever appears; until then a correction is not re-announced.
 */
function av_volunteer_sessions(array $in): array {
    $after = max(0, (int)($in['after'] ?? 0));
    $limit = max(1, min(500, (int)($in['limit'] ?? 200)));
    $rows = db_all("SELECT a.*, v.email AS vEmail, v.memberId AS memberId, v.centre AS vCentre, v.role AS vRole, v.programme AS vProgramme
                      FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId
                     WHERE a.id > ? AND v.programme = 'ngg' ORDER BY a.id LIMIT " . $limit, [$after]);
    $contactOk = av_volunteer_contact_ok($rows);   // the same rule as the volunteer feed
    $std = volunteer_session_hours() * 60;
    $out = [];
    $last = $after;
    foreach ($rows as $r) {
        $last = (int)$r['id'];
        if (volunteer_programme(['programme' => $r['vProgramme'] ?? '']) !== 'ngg') continue;
        $checkIn = (string)($r['checkInAt'] ?? '');
        $checkOut = (string)($r['checkOutAt'] ?? '');
        $minutes = $std; $source = 'standard';
        $ti = $checkIn !== '' ? strtotime($checkIn) : false;
        $to = $checkOut !== '' ? strtotime($checkOut) : false;
        if ($ti !== false && $to !== false) {
            $span = intdiv($to - $ti, 60);
            if ($span >= 15 && $span <= 720) { $minutes = $span; $source = 'gate'; }
        }
        $s = [
            'id' => (int)$r['id'], 'volunteerId' => (string)$r['studentId'],
            'email' => strtolower(trim((string)($r['vEmail'] ?? ''))),
            'date' => substr((string)($r['date'] ?? ''), 0, 10),
            'checkInAt' => $checkIn, 'checkOutAt' => $checkOut,
            'minutes' => (int)$minutes, 'minutesSource' => $source,
            'centre' => (string)(($r['centre'] ?? '') !== '' ? $r['centre'] : ($r['vCentre'] ?? '')),
            'role' => (string)($r['vRole'] ?? ''), 'method' => (string)($r['method'] ?? ''),
        ];
        if (array_key_exists('updatedAt', $r)) $s['updatedAt'] = (string)($r['updatedAt'] ?? '');
        if (!($contactOk[(string)($r['memberId'] ?? '')] ?? true)) unset($s['email']);
        $out[] = $s;
    }
    return ['ok' => true, 'sessions' => $out, 'next' => count($rows) === $limit ? $last : null, 'done' => count($rows) < $limit];
}

/** The signature Afrovanguard sends: sha256=HMAC(secret, "volunteers." + ts + "." + body). */
function av_volunteer_signature_ok(string $secret, string $ts, string $raw, string $sig): bool {
    if ($secret === '' || !ctype_digit($ts) || abs(time() - (int)$ts) > 300) return false;
    return hash_equals('sha256=' . hash_hmac('sha256', 'volunteers.' . $ts . '.' . $raw, $secret), $sig);
}
