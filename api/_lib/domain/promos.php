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

const PROMO_PLACEMENTS = ['chess', 'community', 'dashboard', 'arcade', 'game'];
const PROMO_KINDS = ['programme', 'event', 'tournament', 'notice'];

/* Two shapes, and the difference between them is a rule rather than a style.
 *
 *   card  — the strip that sits in a screen. Shown until it is dismissed.
 *   popup — the small card that appears once, beside a game that has just
 *           finished or is about to start. Shown ONCE PER PERSON, ever.
 *
 * That second rule is the whole reason the shape exists as a separate thing.
 * A popup that returns after every game is the most annoying surface a product
 * has, and the audience here is children who cannot leave the club to escape
 * it. Seeing it is what spends it — not dismissing it — so a member who
 * scrolled past without reading is not shown it again either. If the club has
 * something important enough to say twice, that is a second promotion, written
 * on purpose, by a person. */
const PROMO_SHAPES = ['card', 'popup'];

/* An inline picture is allowed, and capped hard.
 *
 * The upload path falls back to a data URI when no cloud is configured, which
 * is a supported way to run this product. But a promo's image ships inside
 * every promo.for response, to every member, on a mobile connection somebody
 * is paying for by the megabyte. A cloud URL costs a hundred bytes here and is
 * cached by the browser; an inline image costs its whole size on every fetch.
 * So inline is permitted and small, and the admin screen says which one it
 * got. */
const PROMO_INLINE_MAX = 60000;

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
        'shape' => (string)($r['shape'] ?? 'card'),
        'tournamentId' => (string)($r['tournamentId'] ?? ''),
    ];
    if ($admin) {
        $imp = (int)($r['impressions'] ?? 0);
        $out += [
            'status' => (string)$r['status'], 'priority' => (int)($r['priority'] ?? 0),
            'startsAt' => (string)($r['startsAt'] ?? ''), 'endsAt' => (string)($r['endsAt'] ?? ''),
            'audience' => promo_audience($r),
            'inlineImage' => strncmp((string)($r['imageUrl'] ?? ''), 'data:', 5) === 0,
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
    if (!$person) return !$a['kinds'] && !$a['centres'] && $a['programme'] === ''
                       && (string)($r['tournamentId'] ?? '') === '';
    if ($a['kinds'] && !in_array((string)$person['kind'], $a['kinds'], true)) return false;
    if ($a['centres'] && !in_array((string)$person['centre'], $a['centres'], true)) return false;
    if ($a['programme'] !== '' && (string)$person['programme'] !== $a['programme']) return false;
    /* Tied to one event: only the people in it. "Round three is drawn" is
     * news to an entrant and noise to everybody else, and a promotion that
     * reaches the wrong ninety members is how members learn to ignore them. */
    $tid = (string)($r['tournamentId'] ?? '');
    if ($tid !== '') {
        return (bool)db_row('SELECT id FROM tournament_entrants WHERE tournamentId = ? AND playerId = ? LIMIT 1',
                            [$tid, (string)$person['id']]);
    }
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
    $shape = (string)($p['shape'] ?? 'card');
    if (!in_array($shape, PROMO_SHAPES, true)) return ['ok' => true, 'promo' => null];
    $viewer = (string)($p['memberId'] ?? '');
    $person = $viewer !== '' ? match_person($viewer) : null;
    $now = now_iso();

    $rows = db_all("SELECT * FROM promos WHERE status = 'live' AND placement = ? AND shape = ?
                     ORDER BY priority DESC, createdAt DESC LIMIT 20", [$placement, $shape]);
    foreach ($rows as $r) {
        if (!promo_in_window($r, $now)) continue;
        if (!promo_matches($r, $person)) continue;
        if ($viewer !== '') {
            $seen = db_row('SELECT * FROM promo_seen WHERE promoId = ? AND memberId = ? LIMIT 1',
                           [(string)$r['promoId'], $viewer]);
            // A dismissal is permanent. Somebody who said no is not asked again.
            if ($seen && trim((string)($seen['dismissedAt'] ?? '')) !== '') continue;
            /* And a popup is spent by being SEEN, not by being dismissed. See
             * PROMO_SHAPES: this is the rule that keeps "a little popup after
             * a game" from becoming a popup after every game. */
            if ($shape === 'popup' && $seen) continue;
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
            'shapes' => PROMO_SHAPES,
            'inlineMax' => PROMO_INLINE_MAX,
            /* The events a promotion can be tied to. Only ones somebody could
             * still be in: a finished tournament has no audience left. */
            'tournaments' => array_map(
                fn($t) => ['tournamentId' => (string)$t['tournamentId'], 'name' => (string)$t['name'],
                           'status' => (string)$t['status']],
                db_all("SELECT tournamentId, name, status FROM tournaments
                         WHERE status IN ('open','running') ORDER BY updatedAt DESC LIMIT 40")),
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
    /* An image is either an https URL — never http, because a mixed-content
     * image on a members' page is a broken card at best — or a small inline
     * one from the upload path's no-cloud fallback. See PROMO_INLINE_MAX for
     * why inline is capped rather than refused. */
    $img = trim((string)($d['imageUrl'] ?? ''));
    if ($img !== '') {
        $https = (bool)preg_match('#^https://#i', $img);
        $inline = (bool)preg_match('#^data:image/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$#', $img);
        if (!$https && !$inline) return ['ok' => false, 'error' => 'bad_image'];
        if ($inline && strlen($img) > PROMO_INLINE_MAX) return ['ok' => false, 'error' => 'image_too_big'];
    }

    $shape = (string)($d['shape'] ?? 'card');
    if (!in_array($shape, PROMO_SHAPES, true)) $shape = 'card';
    /* Tied to one event, or to none. Checked rather than trusted: a promo
     * pointed at a tournament that does not exist reaches nobody and looks
     * like the feature is broken. */
    $tid = trim((string)($d['tournamentId'] ?? ''));
    if ($tid !== '' && !db_row('SELECT tournamentId FROM tournaments WHERE tournamentId = ? LIMIT 1', [$tid])) {
        return ['ok' => false, 'error' => 'bad_tournament'];
    }

    $row = [
        'title' => $title,
        'body' => mb_substr(trim((string)($d['body'] ?? '')), 0, 400),
        'kind' => $kind, 'placement' => $placement,
        'ctaLabel' => mb_substr(trim((string)($d['ctaLabel'] ?? '')), 0, 48),
        'ctaPage' => $page,
        'ctaRef' => mb_substr(trim((string)($d['ctaRef'] ?? '')), 0, 64),
        // An https URL is short; an inline one is capped above, so this holds
        // both without truncating an image into something unrenderable.
        'imageUrl' => $img,
        'shape' => $shape,
        'tournamentId' => $tid,
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
