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

/**
 * A signed link that opens a vanguard's Afrovanguard member card for printing.
 *
 * The card is Afrovanguard's (its design, its card number, its QR), so it is
 * drawn and printed THERE — card/print.php, where the staff member's browser
 * makes the PDF, the PNGs or an A4 sheet from the very partial the card is.
 * Drawing it a second time here would be a second renderer that drifts.
 *
 * The link is signed with the shared secret this site already holds for the
 * NGV integration (NGG_WEBHOOK_SECRET there): HMAC-SHA256 of
 * "card-print|<memberId>|<ts>", good for ten minutes. Afrovanguard opens it
 * only for an NGG member it has linked to an account.
 */
function admin_members_av_card_link(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    global $CONFIG;
    $av = (array)($CONFIG['afrovanguard'] ?? []);
    $secret = trim((string)($av['ngv_webhook_secret'] ?? ''));
    if ($secret === '') return ['ok' => false, 'error' => 'not_configured',
        'detail' => 'Set afrovanguard.ngv_webhook_secret in config.php (the same value as NGG_WEBHOOK_SECRET on Afrovanguard).'];
    $id = trim((string)($p['memberId'] ?? ''));
    $m = $id !== '' ? db_row('SELECT memberId, fullName, centre, ngvVolunteerId FROM members WHERE memberId = ? LIMIT 1', [$id]) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope !== null && !in_array((string)$m['centre'], $scope, true)) return ['ok' => false, 'error' => 'out_of_scope'];
    if (trim((string)($m['ngvVolunteerId'] ?? '')) === '') return ['ok' => false, 'error' => 'not_ngv',
        'detail' => 'Only a member promoted to NGV has an Afrovanguard card.'];
    $ts = (string)time();
    $sig = hash_hmac('sha256', 'card-print|' . $m['memberId'] . '|' . $ts, $secret);
    $url = rtrim((string)($av['org_url'] ?? 'https://afrovanguard.org.ng'), '/') . '/card/print.php?'
        . http_build_query(['ngg' => (string)$m['memberId'], 'ts' => $ts, 'sig' => $sig]);
    audit('member.ngv.cardPrint', (string)($g['requester']['memberId'] ?? ''), (string)$m['memberId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'url' => $url, 'expiresIn' => 600];
}
