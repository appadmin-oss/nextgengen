<?php
declare(strict_types=1);

/**
 * Programme promotions.
 *
 * NGG telling its own members about its own programmes: a summer intake
 * opening, a Saturday arena, a showcase, a mentor recruitment drive. They ride
 * in the surfaces members already use rather than in an inbox nobody opens.
 *
 * WHAT THIS DELIBERATELY IS NOT.
 *
 * These are house promotions, first-party only. There is no third-party ad
 * network here and there must not be one. The audience is 10–17 year olds, and
 * behavioural advertising to minors is a different product with a different
 * legal footing — Nigeria's NDPA 2023 treats a child's data as sensitive, and
 * every comparable regime (GDPR Art. 8, the UK Age Appropriate Design Code,
 * COPPA) restricts profiling children for advertising. Building the pipes for
 * it "just in case" is how a platform ends up with them switched on.
 *
 * So the design has three hard edges, and they are enforced in code rather
 * than in policy:
 *
 *   · A promo links to an in-app PAGE, never to an arbitrary URL. There is no
 *     field to put someone else's domain in.
 *   · Targeting is by centre, programme and role — the same facts the roster
 *     already holds. There is no behavioural profile, no interest inference,
 *     and nothing derived from what a child has read or played.
 *   · Every promo is dismissible, and a dismissal is permanent. A member who
 *     says no is not asked again.
 *
 * Counting is per person, not per render, so a member refreshing a screen does
 * not manufacture forty impressions and make a promotion look like it worked.
 */

const PROMO_PLACEMENTS = ['chess', 'community', 'dashboard', 'arcade'];
const PROMO_KINDS = ['programme', 'event', 'tournament', 'notice'];

/* Where a promo may send somebody. An allow-list of in-app destinations, which
 * is what makes "no arbitrary URLs" a property of the code rather than a rule
 * somebody has to remember. */
const PROMO_PAGES = ['community', 'club', 'summer', 'events', 'centres', 'blog',
                     'dashboard', 'anchor', 'contact', 'book', ''];

function promo_shape(array $r, bool $admin = false): array {
    $out = [
        'promoId' => (string)$r['promoId'],
        'title' => (string)$r['title'],
        'body' => (string)($r['body'] ?? ''),
        'kind' => (string)($r['kind'] ?? 'programme'),
        'placement' => (string)($r['placement'] ?? 'chess'),
        'ctaLabel' => (string)($r['ctaLabel'] ?? ''),
        'ctaPage' => (string)($r['ctaPage'] ?? ''),
        'ctaRef' => (string)($r['ctaRef'] ?? ''),
        'imageUrl' => (string)($r['imageUrl'] ?? ''),
        'accent' => (string)($r['accent'] ?? ''),
    ];
    if ($admin) {
        $imp = (int)($r['impressions'] ?? 0);
        $out += [
            'status' => (string)$r['status'], 'priority' => (int)($r['priority'] ?? 0),
            'startsAt' => (string)($r['startsAt'] ?? ''), 'endsAt' => (string)($r['endsAt'] ?? ''),
            'audience' => promo_audience($r),
            'impressions' => $imp, 'clicks' => (int)($r['clicks'] ?? 0),
            'dismissals' => (int)($r['dismissals'] ?? 0),
            /* Click-through as a figure rather than two numbers to divide.
             * Reported as null under 30 impressions: a 1-in-3 rate off three
             * views is noise, and a number that looks like a measurement
             * invites a decision it cannot support. */
            'ctr' => $imp >= 30 ? round(((int)($r['clicks'] ?? 0)) / $imp * 100, 1) : null,
            'createdAt' => (string)($r['createdAt'] ?? ''),
        ];
    }
    return $out;
}

function promo_audience(array $r): array {
    $j = json_decode((string)($r['audience'] ?? ''), true);
    $j = is_array($j) ? $j : [];
    return [
        'kinds' => array_values(array_intersect((array)($j['kinds'] ?? []), DIRECTORY_KINDS)),
        'centres' => array_values(array_map('strval', (array)($j['centres'] ?? []))),
        'programme' => (string)($j['programme'] ?? ''),
    ];
}

/**
 * Does this promo apply to this person?
 *
 * Empty means everybody, deliberately: a promotion nobody configured a target
 * for should reach the club, not nobody.
 */
function promo_matches(array $r, ?array $person): bool {
    $a = promo_audience($r);
    if (!$person) return !$a['kinds'] && !$a['centres'] && $a['programme'] === '';
    if ($a['kinds'] && !in_array((string)$person['kind'], $a['kinds'], true)) return false;
    if ($a['centres'] && !in_array((string)$person['centre'], $a['centres'], true)) return false;
    if ($a['programme'] !== '' && (string)$person['programme'] !== $a['programme']) return false;
    return true;
}

/** Is it live right now? A schedule that is not enforced is a note. */
function promo_in_window(array $r, string $now): bool {
    if ((string)$r['status'] !== 'live') return false;
    $s = trim((string)($r['startsAt'] ?? ''));
    $e = trim((string)($r['endsAt'] ?? ''));
    if ($s !== '' && $now < $s) return false;
    if ($e !== '' && $now > $e) return false;
    return true;
}

/**
 * The promo to show one member in one placement, or none.
 *
 * ONE. Not a list, not a carousel. A placement that can hold three promotions
 * becomes three promotions, and a chess screen with an ad stack on it is a
 * chess screen people stop opening. If the club has three things to say, the
 * priority field is where that gets decided — by a person, once — rather than
 * by the screen showing all of them.
 */
function promo_for(array $p): array {
    $placement = (string)($p['placement'] ?? 'chess');
    if (!in_array($placement, PROMO_PLACEMENTS, true)) return ['ok' => true, 'promo' => null];
    $viewer = (string)($p['memberId'] ?? '');
    $person = $viewer !== '' ? match_person($viewer) : null;
    $now = now_iso();

    $rows = db_all("SELECT * FROM promos WHERE status = 'live' AND placement = ?
                     ORDER BY priority DESC, createdAt DESC LIMIT 20", [$placement]);
    foreach ($rows as $r) {
        if (!promo_in_window($r, $now)) continue;
        if (!promo_matches($r, $person)) continue;
        if ($viewer !== '') {
            $seen = db_row('SELECT * FROM promo_seen WHERE promoId = ? AND memberId = ? LIMIT 1',
                           [(string)$r['promoId'], $viewer]);
            // A dismissal is permanent. Somebody who said no is not asked again.
            if ($seen && trim((string)($seen['dismissedAt'] ?? '')) !== '') continue;
        }
        return ['ok' => true, 'promo' => promo_shape($r)];
    }
    return ['ok' => true, 'promo' => null];
}

/**
 * Record what a member did with it.
 *
 * `seen` is counted once per person, ever — not once per render. A member
 * refreshing the chess screen forty times has seen it once, and any other
 * accounting turns a promotion that reached nine people into one that looks
 * like it reached four hundred.
 */
function promo_track(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $id = (string)($p['promoId'] ?? '');
    $what = (string)($p['event'] ?? '');
    if ($viewer === '' || $id === '') return ['ok' => false, 'error' => 'forbidden'];
    if (!in_array($what, ['seen', 'click', 'dismiss'], true)) return ['ok' => false, 'error' => 'bad_event'];
    if (!db_row('SELECT id FROM promos WHERE promoId = ? LIMIT 1', [$id])) return ['ok' => false, 'error' => 'not_found'];

    $now = now_iso();
    $row = db_row('SELECT * FROM promo_seen WHERE promoId = ? AND memberId = ? LIMIT 1', [$id, $viewer]);
    if (!$row) {
        db_insert('promo_seen', ['promoId' => $id, 'memberId' => $viewer, 'seenAt' => $now]);
        db_exec('UPDATE promos SET impressions = impressions + 1 WHERE promoId = ?', [$id]);
        $row = db_row('SELECT * FROM promo_seen WHERE promoId = ? AND memberId = ? LIMIT 1', [$id, $viewer]);
    }
    if ($what === 'click' && trim((string)($row['clickedAt'] ?? '')) === '') {
        db_update('promo_seen', ['clickedAt' => $now], ['id' => (int)$row['id']]);
        db_exec('UPDATE promos SET clicks = clicks + 1 WHERE promoId = ?', [$id]);
    }
    if ($what === 'dismiss' && trim((string)($row['dismissedAt'] ?? '')) === '') {
        db_update('promo_seen', ['dismissedAt' => $now], ['id' => (int)$row['id']]);
        db_exec('UPDATE promos SET dismissals = dismissals + 1 WHERE promoId = ?', [$id]);
    }
    return ['ok' => true];
}

/* ── Admin ────────────────────────────────────────────────────────────── */

function admin_promos_list(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT * FROM promos ORDER BY
                      CASE status WHEN \'live\' THEN 0 WHEN \'draft\' THEN 1 ELSE 2 END,
                      priority DESC, createdAt DESC LIMIT 100');
    return ['ok' => true,
            'promos' => array_map(fn($r) => promo_shape($r, true), $rows),
            'placements' => PROMO_PLACEMENTS, 'kinds' => PROMO_KINDS,
            'pages' => array_values(array_filter(PROMO_PAGES)),
            'centres' => function_exists('directory_centres') ? directory_centres() : []];
}

function admin_promo_upsert(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $title = mb_substr(trim((string)($d['title'] ?? '')), 0, 120);
    if (mb_strlen($title) < 3) return ['ok' => false, 'error' => 'title_required'];

    $placement = (string)($d['placement'] ?? 'chess');
    if (!in_array($placement, PROMO_PLACEMENTS, true)) return ['ok' => false, 'error' => 'bad_placement'];
    $kind = (string)($d['kind'] ?? 'programme');
    if (!in_array($kind, PROMO_KINDS, true)) $kind = 'programme';
    /* The destination is an in-app page from a fixed list. This is the line
     * that keeps a house promotion from becoming an ad slot: there is nowhere
     * to put somebody else's domain. */
    $page = (string)($d['ctaPage'] ?? '');
    if (!in_array($page, PROMO_PAGES, true)) return ['ok' => false, 'error' => 'bad_destination'];
    $status = (string)($d['status'] ?? 'draft');
    if (!in_array($status, ['draft', 'live', 'ended'], true)) $status = 'draft';
    /* An image has to be https and ours-or-a-cloud, never http — a mixed
     * -content image on a members' page is a broken card at best. */
    $img = trim((string)($d['imageUrl'] ?? ''));
    if ($img !== '' && !preg_match('#^https://#i', $img)) return ['ok' => false, 'error' => 'bad_image'];

    $row = [
        'title' => $title,
        'body' => mb_substr(trim((string)($d['body'] ?? '')), 0, 400),
        'kind' => $kind, 'placement' => $placement,
        'ctaLabel' => mb_substr(trim((string)($d['ctaLabel'] ?? '')), 0, 48),
        'ctaPage' => $page,
        'ctaRef' => mb_substr(trim((string)($d['ctaRef'] ?? '')), 0, 64),
        'imageUrl' => mb_substr($img, 0, 512),
        'accent' => preg_match('/^#[0-9a-fA-F]{6}$/', (string)($d['accent'] ?? '')) ? (string)$d['accent'] : '',
        'priority' => max(0, min(100, (int)($d['priority'] ?? 0))),
        'status' => $status,
        'startsAt' => (string)($d['startsAt'] ?? ''),
        'endsAt' => (string)($d['endsAt'] ?? ''),
        'audience' => json_encode([
            'kinds' => array_values(array_intersect((array)($d['kinds'] ?? []), DIRECTORY_KINDS)),
            'centres' => array_values(array_filter(array_map('strval', (array)($d['centres'] ?? [])))),
            'programme' => in_array((string)($d['programme'] ?? ''), ['ngg', 'summer', ''], true) ? (string)($d['programme'] ?? '') : '',
        ], JSON_UNESCAPED_SLASHES),
        'updatedAt' => now_iso(),
    ];

    $id = (string)($d['promoId'] ?? '');
    if ($id !== '' && db_row('SELECT id FROM promos WHERE promoId = ?', [$id])) {
        db_update('promos', $row, ['promoId' => $id]);
    } else {
        $id = 'PR-' . strtoupper(rand_hex(6));
        db_insert('promos', $row + ['promoId' => $id,
                  'createdBy' => (string)($g['requester']['memberId'] ?? ''), 'createdAt' => now_iso()]);
    }
    audit('promo.upsert', (string)($g['requester']['memberId'] ?? ''), $id,
          ['placement' => $placement, 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'promoId' => $id];
}

function admin_promo_delete(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $id = (string)($p['promoId'] ?? '');
    if (!db_row('SELECT id FROM promos WHERE promoId = ?', [$id])) return ['ok' => false, 'error' => 'not_found'];
    db_exec('DELETE FROM promos WHERE promoId = ?', [$id]);
    db_exec('DELETE FROM promo_seen WHERE promoId = ?', [$id]);
    audit('promo.delete', (string)($g['requester']['memberId'] ?? ''), $id, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
