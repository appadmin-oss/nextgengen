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
    $events = json_encode([NGV_PORTAL_EVENT]);
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

/**
 * Everybody already promoted, announced again — for the vanguards promoted
 * before this existed. Afrovanguard is idempotent by NGG member id, so a
 * second run creates nothing twice. Scoped admins reach their own centres.
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
    $n = 0; $ok = 0;
    foreach (db_all($sql . ' ORDER BY m.ngvAt ASC LIMIT 500', $args) as $m) {
        $r = ngv_portal_announce($m, (string)$m['vid']);
        $n++; if ($r['sent']) $ok++;
    }
    audit('member.ngv.portalSync', (string)($g['requester']['memberId'] ?? ''), '', ['announced' => $n, 'delivered' => $ok], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'announced' => $n, 'delivered' => $ok];
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
    return volunteer_programme($v) === 'ngg';
}

function av_volunteer_row(array $v): array {
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $photo = (string)($v['photoUrl'] ?? '');
    if ($photo !== '' && !preg_match('#^https?://#i', $photo)) $photo = $origin . '/' . ltrim($photo, '/');
    $tier = vol_tier_for((string)($v['role'] ?? ''));
    $ledger = volunteer_ledger((string)$v['volunteerId']);
    $game = (array)($ledger['game'] ?? []);
    return [
        'volunteerId' => (string)$v['volunteerId'], 'memberId' => (string)($v['memberId'] ?? ''),
        'name' => (string)($v['fullName'] ?? ''), 'email' => strtolower(trim((string)($v['email'] ?? ''))), 'phone' => (string)($v['phone'] ?? ''),
        'role' => (string)($v['role'] ?? ''), 'roleLabel' => (string)($tier['name'] ?? ''), 'centre' => (string)($v['centre'] ?? ''),
        'programme' => 'ngg', 'status' => (string)($v['status'] ?? 'active'), 'safeguardingCleared' => (string)($v['safeguarding'] ?? 'pending') === 'cleared',
        'photoUrl' => $photo, 'joinedAt' => (string)($v['createdAt'] ?? ''), 'updatedAt' => (string)($v['updatedAt'] ?? ''),
        'sessions' => (int)($ledger['sessions'] ?? 0), 'hours' => (int)($ledger['hours'] ?? 0),
        'certificates' => count((array)($ledger['certificates'] ?? [])),
        'points' => (int)($game['points'] ?? 0), 'level' => (string)($game['levelName'] ?? ($game['level']['name'] ?? '')),
    ];
}

/**
 * One page of NGG volunteers, oldest first by row: {volunteers, next, done}.
 * `after` is the cursor from the previous page; `limit` at most 200.
 */
function av_volunteer_feed(array $in): array {
    $after = max(0, (int)($in['after'] ?? 0));
    $limit = max(1, min(200, (int)($in['limit'] ?? 100)));
    $rows = db_all('SELECT * FROM volunteers WHERE id > ? ORDER BY id LIMIT ' . $limit, [$after]);
    $out = [];
    $last = $after;
    foreach ($rows as $v) {
        $last = (int)$v['id'];
        if (!av_volunteer_is_ngg($v)) continue;
        $out[] = av_volunteer_row($v);
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
    $rows = db_all("SELECT a.*, v.email AS vEmail, v.centre AS vCentre, v.role AS vRole, v.programme AS vProgramme
                      FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId
                     WHERE a.id > ? AND v.programme = 'ngg' ORDER BY a.id LIMIT " . $limit, [$after]);
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
        $out[] = $s;
    }
    return ['ok' => true, 'sessions' => $out, 'next' => count($rows) === $limit ? $last : null, 'done' => count($rows) < $limit];
}

/** The signature Afrovanguard sends: sha256=HMAC(secret, "volunteers." + ts + "." + body). */
function av_volunteer_signature_ok(string $secret, string $ts, string $raw, string $sig): bool {
    if ($secret === '' || !ctype_digit($ts) || abs(time() - (int)$ts) > 300) return false;
    return hash_equals('sha256=' . hash_hmac('sha256', 'volunteers.' . $ts . '.' . $raw, $secret), $sig);
}
