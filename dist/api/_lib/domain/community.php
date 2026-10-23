<?php
declare(strict_types=1);

/**
 * Community 2.0 — a social feed organised into channels.
 *
 * Channels mirror the summer academy course catalogue (one channel per course)
 * plus a general "Commons". Signed-in members post text with an optional
 * image/video; everyone can react, comment (threaded) and bookmark.
 *
 * Safeguarding (this is a platform for minors): every piece of user-generated
 * text runs through community_screen() BEFORE it is stored — a deterministic
 * crisis gate first (reused from the coach), then the AI 'moderation' profile.
 * Verdicts: ok → published, review → pending (hidden until an admin approves),
 * block → rejected outright. Video can't be frame-screened here, so video posts
 * always land in the moderation queue. Admins can hide/remove/pin anything.
 */

const COMMUNITY_REACTIONS = ['👏', '❤️', '🔥', '💡', '🎉', '🙌'];
const COMMUNITY_PAGE = 15;

/* ── Student sign-in (ID card → scoped session) ───────────────────────── */

/**
 * Verify a summer student's ID-card credentials. Two paths:
 *  - QR token (the card's secret) — strongest; from the /q/<token> profile CTA.
 *  - Display ID + guardian phone — for typing in by hand.
 * Returns the student row for the route to mint a session; never the session.
 */
/**
 * Community sign-in with an ID card, for the two groups who have a card but no
 * member account: summer students and the Volunteer Vanguard (instructors,
 * mentors, coordinators).
 *
 * This used to resolve summer_students only, so an instructor holding the ID
 * card the studio printed for them could not sign in at all — not by QR, not
 * by ID. Both routes now resolve either.
 *
 * Two ways in:
 *   QR token   — the card's own token, or the token bound to it in qr_codes.
 *   ID + phone — the ID printed on the card, checked against a phone number.
 *                For a student that is their guardian's number (they are
 *                minors and may not have a phone). For a volunteer it is their
 *                own: they have no guardian on file, which is exactly why the
 *                guardian-phone check could never match one.
 *
 * The phone check compares the last 7 digits, so it survives +234 / 0
 * prefixing and the spaces people type.
 */
function community_id_login(array $p): array {
    $token = trim((string)($p['token'] ?? ''));
    $idIn  = trim((string)($p['displayId'] ?? ''));
    // The field is named guardianPhone by the student form; a volunteer signs
    // in with their own number through the same input.
    $phone = preg_replace('/\D/', '', (string)($p['guardianPhone'] ?? ($p['phone'] ?? '')));

    $person = null; $kind = '';
    if ($token !== '') {
        $q = db_row("SELECT studentId FROM qr_codes WHERE token = ? LIMIT 1", [$token]);
        $sid = (string)($q['studentId'] ?? '');
        if ($sid !== '') {
            $person = db_row("SELECT * FROM summer_students WHERE studentId = ? AND status = 'active' LIMIT 1", [$sid]);
            if ($person) $kind = 'student';
            if (!$person) {
                $person = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$sid]);
                if ($person) $kind = 'volunteer';
            }
        }
        if (!$person) {
            $person = db_row("SELECT * FROM summer_students WHERE token = ? AND status = 'active' LIMIT 1", [$token]);
            if ($person) $kind = 'student';
        }
        if (!$person) {
            $person = db_row("SELECT * FROM volunteers WHERE token = ? AND status = 'active' LIMIT 1", [$token]);
            if ($person) $kind = 'volunteer';
        }
    } elseif ($idIn !== '' && strlen($phone) >= 7) {
        /* The printed ID is on the card and the phone's last seven digits are
         * the only secret, so guesses are counted per card as well as per
         * address: eight misses lock that card's sign-in for half an hour. */
        if (attempt_locked('card.login', strtoupper($idIn))) return ['ok' => false, 'error' => 'too_many_attempts'];
        $tail = fn($a, $b) => strlen($a) >= 7 && strlen($b) >= 7 && (substr($a, -7) === substr($b, -7));
        // Case-blind: the card prints capitals, a phone keyboard types lower case.
        $cand = db_row("SELECT * FROM summer_students WHERE (upper(displayId) = upper(?) OR upper(studentId) = upper(?)) AND status = 'active' LIMIT 1", [$idIn, $idIn]);
        if ($cand) {
            $g = preg_replace('/\D/', '', (string)($cand['guardianPhone'] ?? ''));
            if ($g !== '' && $tail($g, $phone)) { $person = $cand; $kind = 'student'; }
        }
        if (!$person) {
            // A volunteer's printed ID *is* their volunteerId (VOL-INS-26-001).
            $cand = db_row("SELECT * FROM volunteers WHERE upper(volunteerId) = upper(?) AND status = 'active' LIMIT 1", [$idIn]);
            if ($cand) {
                $vp = preg_replace('/\D/', '', (string)($cand['phone'] ?? ''));
                if ($vp !== '' && $tail($vp, $phone)) { $person = $cand; $kind = 'volunteer'; }
                /* No phone on the record: this card can never pass, whatever is
                 * typed — which is the "instructors cannot sign in" report. The
                 * card is in their hand, so naming the other door leaks nothing:
                 * an emailed code to the address on the record. */
                elseif ($vp === '') {
                    attempt_fail('card.login', strtoupper($idIn), 8, 1800);
                    return ['ok' => false, 'error' => trim((string)($cand['email'] ?? '')) !== '' ? 'no_phone_use_email' : 'no_phone_on_file'];
                }
            }
        }
    }
    if (!$person) {
        if ($token === '' && $idIn !== '') attempt_fail('card.login', strtoupper($idIn), 8, 1800);
        return ['ok' => false, 'error' => 'bad_credentials'];
    }
    if ($token === '' && $idIn !== '') attempt_reset('card.login', strtoupper($idIn));

    // §2.3 — a suspension is "a 14-day total ban from the CACENTRE premises AND
    // digital channels", and eviction is a total termination of association.
    // The community is a digital channel, so the same gate that stops the
    // scanner stops the sign-in.
    $personId = (string)($kind === 'volunteer' ? $person['volunteerId'] : $person['studentId']);
    if (function_exists('policy_gate_checkin')) {
        $gate = policy_gate_checkin($personId, $kind);
        if (!$gate['ok']) return ['ok' => false, 'error' => $gate['error'], 'message' => $gate['message'] ?? ''];
    }

    // First sign-in stamps the person as a community participant, which is what
    // the community's own headcount is counted from — enrolment is not
    // membership, and the board should say how many people actually turned up.
    $table = $kind === 'volunteer' ? 'volunteers' : 'summer_students';
    $key   = $kind === 'volunteer' ? ['volunteerId' => $personId] : ['studentId' => $personId];
    try { db_update($table, ['communityAt' => now_iso()], $key); } catch (\Throwable $e) {}

    return ['ok' => true, 'kind' => $kind, 'person' => $person,
            // Only the team owes a second step at the card door; a participant's card
            // and their guardian's phone already are the two things.
            'mfa' => $kind === 'volunteer' && function_exists('mfa_need') ? mfa_need($personId, 'volunteer', ['card']) : '',
            // Back-compat for the existing route, which reads ['student'].
            'student' => $person];
}

/** What a card or volunteer sign-in hands the app as "the member" — one shape
 *  for the card door and the emailed-code door, so the two cannot drift. */
function community_member_shape(array $who, string $kind): array {
    $vol = $kind === 'volunteer';
    $personId = (string)($vol ? ($who['volunteerId'] ?? '') : ($who['studentId'] ?? ''));
    return [
        'memberId' => $personId,
        'fullName' => (string)($who['fullName'] ?? ''),
        'type'     => $vol ? 'VOLUNTEER' : 'SUMMER',
        'role'     => $vol ? 'volunteer' : 'student',
        'caps'     => [],
        'centre'   => (string)($who['centre'] ?? ''),
        'track'    => (string)($vol ? ($who['role'] ?? '') : ($who['track'] ?? '')),
        'photoUrl' => (string)($who['photoUrl'] ?? ''),
        /* Which portal this person opens, answered at sign-in rather than on
         * the next /auth/me — see auth_me. */
        'portal'   => function_exists('mentor_portal_role') ? mentor_portal_role($personId) : '',
    ];
}

/* ── Channels ─────────────────────────────────────────────────────────── */

/** Seed a Commons channel + one channel per academy course (idempotent). */
function community_ensure_channels(): void {
    $have = (int)(db_row("SELECT COUNT(*) c FROM community_channels")['c'] ?? 0);
    if ($have > 0) return;
    $now = now_iso();
    db_insert('community_channels', [
        'channelId' => 'CH-COMMONS', 'slug' => 'commons', 'name' => 'The Commons', 'kind' => 'commons',
        'icon' => '🏛️', 'color' => '#3b5bdb', 'description' => 'Everyone, every centre, every track — the shared square.',
        'sortOrder' => -100, 'pinned' => 1, 'status' => 'active', 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    $palette = ['#e4032b', '#f5b026', '#2f9e44', '#b07cff', '#3b5bdb', '#ff5a3c', '#17a2b8', '#a8d91a'];
    $icons = ['💻', '🎤', '🚀', '🎬', '🎨', '🎵', '📊', '🧠'];
    $i = 0;
    foreach ((function_exists('club_catalogue') ? club_catalogue() : academy_catalogue()) as $faculty => $courses) {
        foreach ((array)$courses as $course) {
            $slug = centre_slugify((string)$course);
            if ($slug === '') continue;
            if (db_row("SELECT id FROM community_channels WHERE slug = ?", [$slug])) continue;
            db_insert('community_channels', [
                'channelId' => 'CH-' . strtoupper(rand_hex(5)), 'slug' => $slug, 'name' => (string)$course, 'kind' => 'course',
                'faculty' => (string)$faculty, 'icon' => $icons[$i % count($icons)], 'color' => $palette[$i % count($palette)],
                'description' => $faculty . ' · a channel for the ' . $course . ' crew.', 'sortOrder' => $i,
                'status' => 'active', 'createdAt' => $now, 'updatedAt' => $now,
            ]);
            $i++;
        }
    }
}

/** Published post counts for every channel, in one query.
 *  This was a COUNT per channel, and the sidebar renders all of them. */
function community_post_counts(): array {
    static $memo = null;
    if ($memo !== null) return $memo;
    $out = [];
    foreach (db_all("SELECT channelId, COUNT(*) c FROM community_posts WHERE status = 'published' GROUP BY channelId") as $r) {
        $out[(string)$r['channelId']] = (int)$r['c'];
    }
    return $memo = $out;
}

/** Channel row → public shape with a live post count. */
function community_channel_public(array $c): array {
    $posts = community_post_counts()[(string)$c['channelId']] ?? 0;
    return [
        'channelId' => (string)$c['channelId'], 'slug' => (string)$c['slug'], 'name' => (string)$c['name'],
        'kind' => (string)$c['kind'], 'faculty' => (string)($c['faculty'] ?? ''), 'icon' => (string)($c['icon'] ?? ''),
        'color' => (string)($c['color'] ?? '#3b5bdb'), 'description' => (string)($c['description'] ?? ''),
        'rules' => (string)($c['rules'] ?? ''),
        'pinned' => (int)($c['pinned'] ?? 0) === 1, 'posts' => $posts,
    ];
}

/** Unread published posts in a channel for a viewer (excludes their own). */
function community_channel_unread(string $channelId, string $viewer): int {
    if ($viewer === '') return 0;
    $r = db_row("SELECT lastReadAt FROM community_reads WHERE memberId = ? AND channelId = ?", [$viewer, $channelId]);
    $since = (string)($r['lastReadAt'] ?? '');
    if ($since === '') $since = '1970-01-01T00:00:00Z';
    return (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE channelId = ? AND status = 'published' AND authorId <> ? AND createdAt > ?", [$channelId, $viewer, $since])['c'] ?? 0);
}

/** Unread counts for every channel at once, keyed by channelId.
 *  One grouped query instead of two per channel (a read lookup plus a COUNT). */
function community_unread_all(string $viewer): array {
    if ($viewer === '') return [];
    $out = [];
    foreach (db_all(
        "SELECT cp.channelId, COUNT(*) c FROM community_posts cp
          WHERE cp.status = 'published' AND cp.authorId <> ?
            AND cp.createdAt > COALESCE(
                (SELECT r.lastReadAt FROM community_reads r
                  WHERE r.memberId = ? AND r.channelId = cp.channelId), '')
          GROUP BY cp.channelId", [$viewer, $viewer]) as $r) {
        $out[(string)$r['channelId']] = (int)$r['c'];
    }
    return $out;
}

function community_channels(array $p): array {
    community_ensure_channels();
    $viewer = (string)($p['memberId'] ?? '');
    $rows = db_all("SELECT * FROM community_channels WHERE status = 'active' ORDER BY pinned DESC, sortOrder ASC, name ASC");
    $unread = community_unread_all($viewer);
    $channels = array_map(function ($c) use ($unread) {
        $base = community_channel_public($c);
        $base['unread'] = $unread[(string)$c['channelId']] ?? 0;
        return $base;
    }, $rows);
    return ['ok' => true, 'channels' => $channels];
}

/** Mark a channel read up to now (Slack-style). */
function community_mark_read(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [(string)($p['channel'] ?? '')]);
    if (!$ch) return ['ok' => true];
    $cid = (string)$ch['channelId']; $now = now_iso();
    if (db_row("SELECT id FROM community_reads WHERE memberId = ? AND channelId = ?", [$viewer, $cid])) db_update('community_reads', ['lastReadAt' => $now, 'updatedAt' => $now], ['memberId' => $viewer, 'channelId' => $cid]);
    else db_insert('community_reads', ['memberId' => $viewer, 'channelId' => $cid, 'lastReadAt' => $now, 'updatedAt' => $now]);
    return ['ok' => true];
}

/** Who's active in a channel — distinct authors (PII-safe names), most recent
 *  first, with their post count. Powers the channel members rail. */
function community_channel_members(array $p): array {
    $slug = (string)($p['channel'] ?? '');
    $ch = db_row("SELECT channelId, name FROM community_channels WHERE slug = ? LIMIT 1", [$slug]);
    if (!$ch) return ['ok' => true, 'members' => [], 'count' => 0];
    $rows = db_all(
        "SELECT authorId, authorName, authorCentre, COUNT(*) posts, MAX(createdAt) last
         FROM community_posts WHERE channelId = ? AND status = 'published'
         GROUP BY authorId ORDER BY last DESC LIMIT 60", [(string)$ch['channelId']]);
    /* Both lookups now go through the memoised community_actor_is_staff(), which
     * knows about volunteers as well as members. This used to run its own two
     * queries plus up to three more for the photo, per author — sixty authors
     * was three hundred round trips every time somebody opened a channel. */
    $members = [];
    foreach ($rows as $r) {
        $aid = (string)$r['authorId'];
        $members[] = ['name' => community_staff_name($aid) ?? (string)$r['authorName'], 'centre' => (string)$r['authorCentre'], 'posts' => (int)$r['posts'],
                      'key' => function_exists('cm3_key') ? cm3_key($aid) : '', 'last' => (string)$r['last'],
                      'staff' => community_actor_is_staff($aid), 'photo' => community_photo_for($aid)];
    }
    return ['ok' => true, 'members' => $members, 'count' => count($members)];
}

/**
 * Every file shared in a channel, newest first.
 *
 * Derived from the posts, not from a second store: a file in this community IS
 * a message with something attached, and a Files list built from its own table
 * would be a second answer to "what has been shared here" that could disagree
 * with the first. Grouping (pinned / this week / older) is decided here rather
 * than on the client, so the list a member scrolls and the list a mentor
 * curates are the same list.
 *
 * `kind` narrows to doc | image | video. The counts always describe the WHOLE
 * channel, so the filter chips can say "Docs 9" while showing photos.
 */
function community_channel_files(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $slug = (string)($p['channel'] ?? '');
    $kind = (string)($p['kind'] ?? 'all');
    $ch = db_row("SELECT channelId, name, slug FROM community_channels WHERE slug = ? LIMIT 1", [$slug]);
    if (!$ch) return ['ok' => true, 'files' => [], 'counts' => ['all' => 0, 'doc' => 0, 'image' => 0, 'video' => 0]];

    $rows = db_all(
        "SELECT postId, authorId, authorName, authorCentre, body, mediaType, mediaUrl, mediaPoster,
                altText, mediaFormat, mediaBytes, mediaPages, mediaDuration, pinned, createdAt
           FROM community_posts
          WHERE channelId = ? AND status = 'published' AND mediaType <> 'none' AND mediaUrl <> ''
          ORDER BY createdAt DESC LIMIT 300", [(string)$ch['channelId']]);

    $counts = ['all' => 0, 'doc' => 0, 'image' => 0, 'video' => 0];
    $files = [];
    /* gmdate + the ISO shape now_iso() writes. This was date('Y-m-d H:i:s'),
     * compared as a string against '2026-08-15T09:00:00Z' — 'T' sorts above a
     * space, so the whole boundary day fell on the wrong side, and the local
     * clock added a second skew on top of a UTC column. */
    $weekAgo = gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400);
    foreach ($rows as $r) {
        $t = (string)$r['mediaType'];
        if (!isset($counts[$t])) continue;
        $counts['all']++; $counts[$t]++;
        if ($kind !== 'all' && $kind !== $t) continue;
        $fmt = (string)($r['mediaFormat'] ?? '') ?: upload_ext((string)$r['mediaUrl']);
        $files[] = [
            'postId' => (string)$r['postId'],
            'kind' => $t,
            'format' => $fmt,
            'name' => (string)($r['altText'] ?? '') ?: (community_file_fallback_name($t, $fmt)),
            'url' => (string)$r['mediaUrl'],
            'poster' => (string)($r['mediaPoster'] ?? ''),
            'bytes' => (int)($r['mediaBytes'] ?? 0),
            'pages' => (int)($r['mediaPages'] ?? 0),
            'duration' => (int)($r['mediaDuration'] ?? 0),
            'pinned' => (int)$r['pinned'] === 1,
            'author' => ['name' => community_staff_name((string)$r['authorId']) ?? (string)$r['authorName'], 'centre' => (string)$r['authorCentre'],
                         'isMe' => (string)$r['authorId'] === $viewer,
                         'photo' => community_photo_for((string)$r['authorId'])],
            'note' => mb_substr(trim((string)$r['body']), 0, 120),
            'createdAt' => (string)$r['createdAt'],
            // pinned → thisWeek → older. The client renders the groups in that
            // order and never has to re-derive "is this week" from a timezone
            // it does not know.
            'group' => (int)$r['pinned'] === 1 ? 'pinned' : ((string)$r['createdAt'] >= $weekAgo ? 'week' : 'older'),
        ];
    }
    return ['ok' => true, 'files' => $files, 'counts' => $counts,
            'channel' => ['slug' => (string)$ch['slug'], 'name' => (string)$ch['name']]];
}

/** A name for a file whose poster never gave it one. */
function community_file_fallback_name(string $kind, string $format): string {
    $ext = $format !== '' ? '.' . $format : '';
    if ($kind === 'image') return 'Photo' . $ext;
    if ($kind === 'video') return 'Video' . $ext;
    return 'Document' . $ext;
}

/** Search published posts by text (whole community or one channel). */
function community_search(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $q = trim((string)($p['q'] ?? ''));
    $authorKey = preg_replace('/[^a-f0-9]/', '', strtolower((string)($p['author'] ?? '')));
    if (mb_strlen($q) < 2 && $authorKey === '') return ['ok' => true, 'posts' => []];
    $args = []; $where = "status = 'published'";
    if (mb_strlen($q) >= 2) {
        /* The words, or the name on the post: "Ada" finds what Ada wrote as
           well as what mentions her. */
        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
        $where .= " AND (body LIKE ? ESCAPE '\\' OR authorName LIKE ? ESCAPE '\\')"; $args[] = $like; $args[] = $like;
    }
    $chSlug = (string)($p['channel'] ?? 'all');
    if ($chSlug !== 'all' && $chSlug !== '' && $chSlug !== 'bookmarks') {
        $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$chSlug]);
        if (!$ch) return ['ok' => true, 'posts' => []];
        $where .= " AND channelId = ?"; $args[] = (string)$ch['channelId'];
    } elseif (function_exists('cm3_my_channels')) {
        /* Everywhere = the channels this member follows, the same set as the
           home feed, so search never surfaces a channel the feed does not. */
        $mine = cm3_my_channels($viewer);
        if (!$mine) return ['ok' => true, 'posts' => []];
        $where .= " AND channelId IN (SELECT channelId FROM community_channels WHERE slug IN (" . implode(',', array_fill(0, count($mine), '?')) . "))";
        array_push($args, ...$mine);
    }
    if ($authorKey !== '' && function_exists('cm3_key')) {
        /* The client only ever holds the HMAC key, never a member id; resolve
           it against the people who have posted. */
        $ids = [];
        foreach (db_all("SELECT DISTINCT authorId FROM community_posts WHERE status = 'published' LIMIT 5000") as $a) {
            if (cm3_key((string)$a['authorId']) === $authorKey) $ids[] = (string)$a['authorId'];
        }
        if (!$ids) return ['ok' => true, 'posts' => []];
        $where .= " AND authorId IN (" . implode(',', array_fill(0, count($ids), '?')) . ")";
        array_push($args, ...$ids);
    }
    $rows = db_all("SELECT * FROM community_posts WHERE $where ORDER BY createdAt DESC LIMIT 30", $args);
    return ['ok' => true, 'posts' => community_shape_page($rows, $viewer)];
}

/* ── Attribution (PII-safe: first name + last initial only) ───────────── */

/** A staff author's child-facing name ("Coach Bello"), or null for a child. Memoised per request: a feed page repeats its authors. */
function community_staff_name(string $id): ?string {
    static $seen = [];
    if ($id === '') return null;
    if (!array_key_exists($id, $seen)) $seen[$id] = staff_public_names([$id])[$id] ?? null;
    return $seen[$id];
}
function community_author(string $memberId): array {
    // An adult posts as a child addresses them: title and surname, no initial.
    if (($t = community_staff_name($memberId)) !== null) {
        $c = db_row("SELECT centre FROM members WHERE memberId = ? LIMIT 1", [$memberId]);
        return ['name' => $t, 'initial' => '', 'centre' => (string)($c['centre'] ?? '')];
    }
    $m = db_row("SELECT fullName, centre FROM members WHERE memberId = ? LIMIT 1", [$memberId]);
    if (!$m) $m = db_row("SELECT fullName, centre FROM summer_students WHERE studentId = ? LIMIT 1", [$memberId]); // student sessions
    // Volunteers have no `centre` column; they sign in with the same kind of
    // card session, and without this every instructor posted as "Member".
    if (!$m) $m = db_row("SELECT fullName, '' centre FROM volunteers WHERE volunteerId = ? LIMIT 1", [$memberId]);
    $full = trim((string)($m['fullName'] ?? '')) ?: 'Member';
    $parts = preg_split('/\s+/', $full) ?: [];
    $first = $parts[0] ?? 'Member';
    $initial = count($parts) > 1 ? strtoupper(substr((string)end($parts), 0, 1)) . '.' : '';
    return ['name' => $first, 'initial' => $initial, 'centre' => (string)($m['centre'] ?? '')];
}

/** A member's / student's profile photo URL (empty if none).
 *
 *  Memoised per request, like community_actor_is_staff(). This costs up to
 *  three queries — members, then summer_students, then volunteers — and a feed
 *  page is usually a handful of authors repeated, so it was running forty-odd
 *  lookups to answer eight questions. */
function community_photo_for(string $id): string {
    static $seen = [];
    if ($id === '') return '';
    if (isset($seen[$id])) return $seen[$id];
    $r = db_row("SELECT photoUrl FROM members WHERE memberId = ? LIMIT 1", [$id]);
    if (!$r) $r = db_row("SELECT photoUrl FROM summer_students WHERE studentId = ? LIMIT 1", [$id]);
    if (!$r) $r = db_row("SELECT photoUrl FROM volunteers WHERE volunteerId = ? LIMIT 1", [$id]);
    return $seen[$id] = (string)($r['photoUrl'] ?? '');
}

/* ── Safeguarding screen ──────────────────────────────────────────────── */

/**
 * Screen a piece of UGC text. Returns ['verdict'=>'ok'|'review'|'block',
 * 'reason'=>string, 'crisis'=>bool]. Crisis (self-harm/abuse) always blocks
 * with a safeguarding signal, regardless of whether AI is configured.
 */
/**
 * How hard the feed is moderated. Admin-set, three positions.
 *
 *   strict — the default. Borderline posts are HELD for a mentor before anyone
 *            sees them, and every video waits for review.
 *   flag   — nothing is held. Everything publishes immediately; borderline
 *            posts are flagged so staff review them after the fact.
 *   off    — no automatic screening at all.
 *
 * Graded rather than a plain on/off switch because the middle position is
 * usually the one people actually want: "stop holding my members' posts up for
 * hours" is a complaint about LATENCY, not a wish for no oversight, and `flag`
 * fixes the latency without giving up the record.
 *
 * Reporting, deletion and the moderation queue work in every mode — those are
 * how a human deals with something the machine did not catch, and no setting
 * turns them off.
 */
function community_moderation_mode(): string {
    $v = setting_get('community_moderation');
    $v = is_string($v) ? strtolower(trim($v)) : (is_array($v) ? strtolower((string)($v['mode'] ?? '')) : '');
    return in_array($v, ['strict', 'flag', 'off'], true) ? $v : 'strict';
}

/**
 * Record a crisis disclosure and put it in front of an adult.
 *
 * The screen already decides this correctly; what was missing was anywhere for
 * the decision to go. A child wrote about harming themselves, the post was
 * refused, they were shown a helpline, and nothing else happened: no record, no
 * audit row, no signal to a mentor. The refusal is the moment the disclosure
 * becomes something to act on.
 *
 * `behaviour.flagged` is the event admins are already subscribed to for exactly
 * this class of thing (see instructor.php) — a second event name would need
 * every integration reconfigured before anyone saw one.
 *
 * The text is kept. It is the only evidence of what was said, and a safeguarding
 * lead cannot act on "something was blocked at 14:02".
 */
function community_raise_safeguarding(string $authorId, string $surface, string $body, string $channelSlug = '', string $ip = ''): string {
    $caseId = 'CS-' . strtoupper(rand_hex(6));
    $who = community_author($authorId);
    $name = trim($who['name'] . ($who['initial'] ? ' ' . $who['initial'] : '')) ?: 'Member';
    try {
        db_insert('community_safeguarding', [
            'caseId' => $caseId, 'authorId' => $authorId, 'authorName' => $name,
            'surface' => $surface === 'comment' ? 'comment' : 'post',
            'channelSlug' => $channelSlug, 'body' => mb_substr($body, 0, 4000),
            'status' => 'open', 'createdAt' => now_iso(),
        ]);
    } catch (\Throwable $e) { /* never let bookkeeping swallow the alert below */ }
    if (function_exists('event_emit')) {
        event_emit('behaviour.flagged', [
            'ref' => $caseId, 'subject' => $name, 'subjectId' => $authorId,
            'category' => 'wellbeing', 'severity' => 'urgent',
            'source' => 'community.' . ($surface === 'comment' ? 'comment' : 'post'),
            'channel' => $channelSlug,
        ]);
    }
    audit('community.safeguarding', $authorId, $caseId, ['surface' => $surface, 'channel' => $channelSlug], $ip);
    return $caseId;
}

function community_screen(string $text): array {
    $text = trim($text);
    if ($text === '') return ['verdict' => 'ok', 'reason' => '', 'crisis' => false];
    /* The crisis check is NOT content moderation and is deliberately outside
     * the setting. It does not hide a post to keep the feed tidy — it catches a
     * child writing about harming themselves and answers with help. Wiring that
     * to an admin toggle would mean a child in trouble typing into a box and
     * getting nothing back. */
    if (function_exists('coach_is_crisis') && coach_is_crisis($text)) {
        return ['verdict' => 'block', 'reason' => 'safeguarding', 'crisis' => true];
    }
    if (community_moderation_mode() === 'off') {
        return ['verdict' => 'ok', 'reason' => '', 'crisis' => false];
    }
    if (!function_exists('ai_enabled') || !ai_enabled('moderation')) {
        return ['verdict' => 'ok', 'reason' => '', 'crisis' => false]; // admin post-moderation + reporting still apply
    }
    $instr = "You are a safety moderator for a social feed used by CHILDREN aged 10-17 in Nigeria. "
        . "Classify the message. Return JSON {\"verdict\":\"ok|review|block\",\"reason\":\"<=10 words\"}. "
        . "block = sexual content, explicit violence, hate/harassment, bullying, self-harm encouragement, "
        . "sharing personal contact details (phone/address/email), adult solicitation, scams, or anything unsafe for a minor. "
        . "review = borderline, spam, mild profanity, or unclear. ok = friendly and appropriate.";
    $r = ai_classify($instr, $text, 120, 'moderation');
    $v = is_array($r) ? strtolower((string)($r['verdict'] ?? '')) : '';
    if (!in_array($v, ['ok', 'review', 'block'], true)) $v = 'review'; // fail safe: unclear → queue
    return ['verdict' => $v, 'reason' => is_array($r) ? substr((string)($r['reason'] ?? ''), 0, 120) : '', 'crisis' => false];
}

/** Drop a notification for a member (skips self-notifications). Members with an
 *  email on file also get an email (students have none → in-app only). */
function community_notify(string $memberId, string $actorId, string $kind, string $title, string $body, bool $email = true, string $ref = ''): void {
    if ($memberId === '' || $memberId === $actorId) return;
    // Recipients may be full members OR summer students (the community serves both).
    $member = db_row("SELECT memberId, fullName, email FROM members WHERE memberId = ? LIMIT 1", [$memberId]);
    if (!$member && !db_row("SELECT studentId FROM summer_students WHERE studentId = ? LIMIT 1", [$memberId])) return;
    db_insert('notifications', ['notifId' => 'NT-' . strtoupper(rand_hex(6)), 'memberId' => $memberId, 'kind' => $kind,
        'title' => mb_substr($title, 0, 160), 'body' => mb_substr($body, 0, 400), 'linkPage' => 'community',
        // The post this is ABOUT, so the member can be taken to it rather than
        // told that something happened somewhere in the feed.
        'linkRef' => $ref, 'createdAt' => now_iso()]);
    if ($email && $member && !empty($member['email'])) {
        community_send_notify_email((string)$member['email'], (string)($member['fullName'] ?? ''), $title, $body);
    }
}

/** Email a member that they were tagged / replied to. Best-effort. */
function community_send_notify_email(string $to, string $fullName, string $title, string $body): void {
    if ($to === '' || !function_exists('send_mail') || !function_exists('email_template')) return;
    try {
        global $CONFIG;
        $first = explode(' ', trim($fullName))[0] ?? '';
        $link = rtrim((string)($CONFIG['app_origin'] ?? ''), '/') . '/community';
        $html = email_template([
            'title' => $title,
            'intro' => 'Hi ' . ($first ?: 'there') . ', you have activity waiting in the NGG Community.',
            'bodyHtml' => '<p style="margin:0 0 14px;font-size:15px;line-height:1.55">' . esc_html(mb_substr($body, 0, 240)) . '</p>'
                . '<p style="margin:0"><a href="' . esc_html($link) . '" style="display:inline-block;background:#0c1432;color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-weight:700">Open the community →</a></p>',
        ]);
        send_mail($to, $title, $html);
    } catch (Throwable $e) { /* email is best-effort — never break a post */ }
}

/** A community handle for a member: first name + last initial, slugified
 *  (e.g. "Ada Obi" → "ada-o"). Deterministic, so @mentions resolve without a
 *  stored column. Falls back to the first name alone when there's no surname. */
function community_member_handle(string $fullName): string {
    $parts = preg_split('/\s+/', trim($fullName)) ?: [];
    $first = $parts[0] ?? '';
    $li = isset($parts[1]) && $parts[1] !== '' ? mb_substr($parts[1], 0, 1) : '';
    $raw = strtolower($first . ($li ? '-' . $li : ''));
    $h = preg_replace('/[^a-z0-9._-]+/', '', $raw);
    return trim((string)$h, '-._');
}

/** Resolve an @handle to its recipients: a summer student (by stored handle)
 *  and/or members (by derived handle). Returns rows: id, kind, name. */
function community_resolve_handle(string $handle): array {
    $handle = strtolower(trim($handle));
    if ($handle === '') return [];
    $out = [];
    $s = db_row("SELECT studentId, fullName FROM summer_students WHERE handle = ? AND status = 'active' LIMIT 1", [$handle]);
    if ($s) $out[] = ['id' => (string)$s['studentId'], 'kind' => 'student', 'name' => (string)$s['fullName']];
    $first = explode('-', $handle)[0] ?? $handle;
    foreach (db_all("SELECT memberId, fullName FROM members WHERE status = 'active' AND lower(fullName) LIKE ? LIMIT 40", [$first . '%']) as $m) {
        if (community_member_handle((string)$m['fullName']) === $handle) $out[] = ['id' => (string)$m['memberId'], 'kind' => 'member', 'name' => (string)$m['fullName']];
    }
    return $out;
}

/** Is this actor a mentor/admin (allowed to @all / @channel)? Students and
 *  plain members can only mention individuals. */
function community_actor_is_staff(string $actorId): bool {
    // Memoised: post shaping asks this once per row, and a feed page is
    // usually a handful of authors repeated. One query each, not one per post.
    static $seen = [];
    if ($actorId === '') return false;
    if (isset($seen[$actorId])) return $seen[$actorId];
    $m = db_row("SELECT role FROM members WHERE memberId = ? LIMIT 1", [$actorId]);
    if ($m) {
        $role = strtolower((string)$m['role']);
        return $seen[$actorId] = ($role !== 'member' && ($role === 'mentor' || $role === 'staff' || $role === 'coordinator' || is_admin_role($role)));
    }
    /* An instructor or mentor signed in with an ID card is not in `members`, so
     * the lookup above can never see one. The channel members rail already knew
     * this and checked `volunteers` separately; post shaping did not, which is
     * why a signed-in instructor lost the mentor chip on their own messages and
     * could not award a Genius Star. One definition of staff, used everywhere. */
    return $seen[$actorId] = (bool)db_row("SELECT id FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$actorId]);
}

/**
 * Anti-spam: throttle rapid-fire + duplicate posts per author. Returns an
 * error code or null. (rate_limit_check on the route is the coarse guard;
 * this is the per-author behaviour guard.)
 */
function community_spam_check(string $memberId, string $body): ?string {
    $recent = db_all("SELECT createdAt, body FROM community_posts WHERE authorId = ? ORDER BY createdAt DESC LIMIT 20", [$memberId]);
    if (!$recent) return null;
    $now = time();
    $lastTs = strtotime((string)$recent[0]['createdAt']);
    if ($lastTs && $now - $lastTs < 15) return 'too_fast';
    $hour = 0; $b = trim(mb_strtolower($body));
    foreach ($recent as $r) {
        $ts = strtotime((string)$r['createdAt']);
        if ($ts && $now - $ts < 3600) $hour++;
        if ($b !== '' && $ts && $now - $ts < 600 && trim(mb_strtolower((string)$r['body'])) === $b) return 'duplicate';
    }
    if ($hour >= 15) return 'slow_down';
    return null;
}

/** A Cloudinary still frame from a video, for AI screening. */
function community_video_frame(string $url): string {
    if (!preg_match('#res\.cloudinary\.com#', $url) || strpos($url, '/upload/') === false) return '';
    $f = str_replace('/upload/', '/upload/so_1,f_jpg,q_auto,w_640,c_limit/', $url);
    return preg_replace('/\.(mp4|mov|webm|m4v|avi)(\?.*)?$/i', '.jpg', $f);
}

/**
 * Best-effort AI moderation of a video via a sampled frame — uses the FREE
 * Gemini vision profile only (one call), so it degrades gracefully to
 * human review when no free key is set. Only ever escalates to 'block'.
 */
function community_screen_video(string $url): string {
    if (!function_exists('ai_enabled') || !ai_enabled('photo')) return 'ok';
    $frame = community_video_frame($url);
    if ($frame === '' || !function_exists('ai_photo_review')) return 'ok';
    $r = ai_photo_review($frame);
    $flags = is_array($r) && isset($r['flags']) && is_array($r['flags']) ? $r['flags'] : [];
    return in_array('inappropriate', $flags, true) ? 'block' : 'ok';
}

/** Extract @handles from text (unique, lowercased). */
function community_mentions(string $body): array {
    if (!preg_match_all('/@([a-z0-9][a-z0-9._-]{1,30})/i', $body, $m)) return [];
    return array_values(array_unique(array_map('strtolower', $m[1])));
}

/** Keep only the post rows that really mention $handle (see community_feed). */
function community_filter_mentions(array $rows, string $handle): array {
    $handle = strtolower($handle);
    return array_values(array_filter($rows, fn($r) => in_array($handle, community_mentions((string)($r['body'] ?? '')), true)));
}

/** Autocomplete for @mentions — students (by handle) + members (by derived
 *  handle), plus a staff-only "@all" to tag a whole channel. */
function community_mention_search(array $p): array {
    $q = trim((string)($p['q'] ?? ''));
    $viewer = (string)($p['memberId'] ?? '');
    if (mb_strlen($q) < 1) return ['ok' => true, 'people' => []];
    $ql = strtolower($q);
    $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
    $people = [];
    // Staff can tag the whole channel. Surfaced only to mentors/admins.
    if (community_actor_is_staff($viewer)) {
        foreach ([['all', 'Everyone in this channel'], ['channel', 'Notify the channel']] as $opt) {
            if (strpos($opt[0], $ql) === 0) $people[] = ['handle' => $opt[0], 'name' => $opt[1], 'centre' => '', 'kind' => 'all'];
        }
    }
    foreach (db_all("SELECT handle, fullName, centre FROM summer_students WHERE status = 'active' AND handle <> '' AND (handle LIKE ? OR fullName LIKE ?) ORDER BY handle LIMIT 6", [$like, $like]) as $r) {
        $people[] = ['handle' => (string)$r['handle'], 'name' => explode(' ', trim((string)$r['fullName']))[0] ?? '', 'centre' => (string)($r['centre'] ?? ''), 'kind' => 'student'];
    }
    foreach (db_all("SELECT fullName, centre, role FROM members WHERE status = 'active' AND fullName LIKE ? ORDER BY fullName LIMIT 6", [$like]) as $r) {
        $h = community_member_handle((string)$r['fullName']);
        if ($h === '') continue;
        $role = strtolower((string)($r['role'] ?? ''));
        $kind = ($role === 'mentor' || is_admin_role($role)) ? 'mentor' : 'member';
        $people[] = ['handle' => $h, 'name' => explode(' ', trim((string)$r['fullName']))[0] ?? '', 'centre' => (string)($r['centre'] ?? ''), 'kind' => $kind];
    }
    // De-dupe by handle, cap the menu.
    $seen = []; $uniq = [];
    foreach ($people as $pp) { if (isset($seen[$pp['handle']])) continue; $seen[$pp['handle']] = 1; $uniq[] = $pp; }
    return ['ok' => true, 'people' => array_slice($uniq, 0, 10)];
}

/** This member's own @handle — a student's stored one, or the derived member
 *  handle. Used by the mentions filter to find posts that name them. */
function community_handle_for(string $memberId): string {
    if ($memberId === '') return '';
    $s = db_row("SELECT handle FROM summer_students WHERE studentId = ? AND handle <> '' LIMIT 1", [$memberId]);
    if ($s) return strtolower((string)$s['handle']);
    $m = db_row("SELECT fullName FROM members WHERE memberId = ? LIMIT 1", [$memberId]);
    return $m ? strtolower(community_member_handle((string)$m['fullName'])) : '';
}

/**
 * The counts behind the Today screen's filter chips.
 *
 * One request rather than three speculative feed fetches. A chip that says
 * "Unread 4" has to be RIGHT — a number that disagrees with what the filter
 * then shows is worse than no number, because it is the part of the screen a
 * member uses to decide whether to look at all.
 */
function community_today_counts(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    community_ensure_channels();

    $unread = (int)(db_row(
        "SELECT COUNT(*) c FROM community_posts cp
          WHERE cp.status = 'published' AND cp.authorId <> ?
            AND cp.createdAt > COALESCE(
                (SELECT r.lastReadAt FROM community_reads r
                  WHERE r.memberId = ? AND r.channelId = cp.channelId), '')",
        [$viewer, $viewer])['c'] ?? 0);

    $handle = community_handle_for($viewer);
    $mentions = 0;
    if ($handle !== '') {
        /* Counted by the SAME rule community_feed() filters by. A chip that
         * says "Mentions 4" opening a list of 2 is worse than no chip: the
         * LIKE is only the net, community_filter_mentions() is the answer.
         * Capped — the chip is a nudge, not an inbox total. */
        $mentions = count(community_filter_mentions(db_all(
            "SELECT cp.body FROM community_posts cp
              WHERE cp.status = 'published' AND cp.authorId <> ? AND LOWER(cp.body) LIKE ?
              ORDER BY cp.createdAt DESC LIMIT 200",
            [$viewer, '%@' . $handle . '%']), $handle));
    }

    $saved = (int)(db_row("SELECT COUNT(*) c FROM community_bookmarks WHERE memberId = ?", [$viewer])['c'] ?? 0);

    /* `staff` is the VIEWER's capability, sent once with the counts. The
     * client was inferring it from the first post in whatever list happened to
     * be on screen, so a mentor lost their mentor tools on an empty channel. */
    $staff = community_actor_is_staff($viewer);
    return ['ok' => true, 'unread' => $unread, 'mentions' => $mentions, 'saved' => $saved,
            'staff' => $staff, 'handle' => $handle,
            /* Rides along with `staff` for the same reason it does: it is a
               fact about the VIEWER, and the actions sheet was working it out
               from whichever post happened to be under the long press. */
            'starsLeft' => $staff ? community_stars_left($viewer) : 0,
            'starsPerDay' => COMMUNITY_STARS_PER_DAY];
}

/* ── Posts ────────────────────────────────────────────────────────────── */

/**
 * Everything a page of posts needs, in one query per relation.
 *
 * community_post_shape() asks nine to eleven questions per post — reactions,
 * my reaction, comment aggregate, bookmark, star count, my star, the channel,
 * the author's photo. At fifteen posts a page that is around 150 round trips,
 * and CmChannel refetches the same page every twenty seconds for as long as a
 * tab is open. One idle reader cost roughly seven queries a second; a class of
 * thirty, two hundred, before anybody posted anything.
 *
 * So the rows are gathered first and handed to the shaper. Nothing about the
 * output changes — this is the same data, fetched the way a set should be.
 * Returns null when there is nothing to prefetch, and community_post_shape()
 * falls back to its own lookups so a single-post call still works unchanged.
 */
function community_prefetch(array $rows, string $viewerId): ?array {
    $ids = array_values(array_unique(array_map(fn($r) => (string)$r['postId'], $rows)));
    if (!$ids) return null;
    $in = implode(',', array_fill(0, count($ids), '?'));

    $pre = ['reactions' => [], 'mine' => [], 'comments' => [], 'booked' => [],
            'stars' => [], 'starred' => [], 'channels' => [], 'polls' => []];

    foreach (db_all("SELECT postId, emoji, COUNT(*) c FROM community_reactions WHERE postId IN ($in) GROUP BY postId, emoji", $ids) as $r) {
        $pre['reactions'][(string)$r['postId']][(string)$r['emoji']] = (int)$r['c'];
    }
    foreach (db_all("SELECT postId, COUNT(*) c, MAX(createdAt) last FROM community_comments WHERE postId IN ($in) AND status = 'published' GROUP BY postId", $ids) as $r) {
        $pre['comments'][(string)$r['postId']] = ['c' => (int)$r['c'], 'last' => (string)($r['last'] ?? '')];
    }
    foreach (db_all("SELECT postId, COUNT(*) c FROM community_stars WHERE postId IN ($in) GROUP BY postId", $ids) as $r) {
        $pre['stars'][(string)$r['postId']] = (int)$r['c'];
    }
    if ($viewerId !== '') {
        $vArgs = array_merge($ids, [$viewerId]);
        foreach (db_all("SELECT postId, emoji FROM community_reactions WHERE postId IN ($in) AND memberId = ?", $vArgs) as $r) {
            $pre['mine'][(string)$r['postId']] = (string)$r['emoji'];
        }
        foreach (db_all("SELECT postId FROM community_bookmarks WHERE postId IN ($in) AND memberId = ?", $vArgs) as $r) {
            $pre['booked'][(string)$r['postId']] = true;
        }
        foreach (db_all("SELECT postId FROM community_stars WHERE postId IN ($in) AND memberId = ?", $vArgs) as $r) {
            $pre['starred'][(string)$r['postId']] = true;
        }
    }

    $chIds = array_values(array_unique(array_filter(array_map(fn($r) => (string)$r['channelId'], $rows))));
    if ($chIds) {
        $cin = implode(',', array_fill(0, count($chIds), '?'));
        foreach (db_all("SELECT channelId, slug, name, color, icon FROM community_channels WHERE channelId IN ($cin)", $chIds) as $c) {
            $pre['channels'][(string)$c['channelId']] = $c;
        }
    }

    // Poll tallies, for the pages that carry one.
    $pollIds = array_values(array_unique(array_map(fn($r) => (string)$r['postId'],
        array_filter($rows, fn($r) => (string)($r['kind'] ?? 'post') === 'poll'))));
    if ($pollIds) {
        // Seed every poll, so a poll with no votes yet still counts as
        // prefetched and does not silently fall back to its own two queries.
        foreach ($pollIds as $pi) $pre['polls'][$pi] = ['counts' => []];
        $pin = implode(',', array_fill(0, count($pollIds), '?'));
        foreach (db_all("SELECT postId, choice, COUNT(*) c FROM community_poll_votes WHERE postId IN ($pin) GROUP BY postId, choice", $pollIds) as $r) {
            $pre['polls'][(string)$r['postId']]['counts'][(int)$r['choice']] = (int)$r['c'];
        }
        if ($viewerId !== '') {
            foreach (db_all("SELECT postId, choice FROM community_poll_votes WHERE postId IN ($pin) AND memberId = ?", array_merge($pollIds, [$viewerId])) as $r) {
                $pre['polls'][(string)$r['postId']]['mine'] = (int)$r['choice'];
            }
        }
    }

    // Warm the two per-author memos in one pass each, so the shaper's calls hit
    // a filled cache rather than three table lookups per distinct author.
    foreach (array_unique(array_map(fn($r) => (string)$r['authorId'], $rows)) as $a) {
        community_actor_is_staff($a); community_photo_for($a);
    }
    return $pre;
}

/** Shape a whole page at once. The only entry point the feed should use. */
function community_shape_page(array $rows, string $viewerId): array {
    $pre = community_prefetch($rows, $viewerId);
    return array_map(fn($r) => community_post_shape($r, $viewerId, $pre), $rows);
}

/** Build the client shape of a post for a given viewer. */
function community_post_shape(array $row, string $viewerId, ?array $pre = null): array {
    $pid = (string)$row['postId'];
    /* $pre is a page's worth of relations fetched in one query each by
     * community_prefetch(). Without it every field below is its own round trip,
     * which is fine for one post and catastrophic for fifteen on a poll. */
    if ($pre !== null) {
        $reacts      = $pre['reactions'][$pid] ?? [];
        $mine        = (string)($pre['mine'][$pid] ?? '');
        $comments    = (int)($pre['comments'][$pid]['c'] ?? 0);
        $lastComment = (string)($pre['comments'][$pid]['last'] ?? '');
        $booked      = !empty($pre['booked'][$pid]);
        $stars       = (int)($pre['stars'][$pid] ?? 0);
        $starred     = !empty($pre['starred'][$pid]);
        $ch          = $pre['channels'][(string)$row['channelId']] ?? null;
    } else {
        $reacts = [];
        foreach (db_all("SELECT emoji, COUNT(*) c FROM community_reactions WHERE postId = ? GROUP BY emoji", [$pid]) as $r) {
            $reacts[(string)$r['emoji']] = (int)$r['c'];
        }
        $mine = $viewerId !== '' ? (string)(db_row("SELECT emoji FROM community_reactions WHERE postId = ? AND memberId = ?", [$pid, $viewerId])['emoji'] ?? '') : '';
        $cAgg = db_row("SELECT COUNT(*) c, MAX(createdAt) last FROM community_comments WHERE postId = ? AND status = 'published'", [$pid]);
        $comments = (int)($cAgg['c'] ?? 0);
        $lastComment = (string)($cAgg['last'] ?? '');
        $booked = $viewerId !== '' && (bool)db_row("SELECT id FROM community_bookmarks WHERE postId = ? AND memberId = ?", [$pid, $viewerId]);
        $stars = (int)(db_row("SELECT COUNT(*) c FROM community_stars WHERE postId = ?", [$pid])['c'] ?? 0);
        $starred = $viewerId !== '' && (bool)db_row("SELECT id FROM community_stars WHERE postId = ? AND memberId = ?", [$pid, $viewerId]);
        $ch = db_row("SELECT slug, name, color, icon FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$row['channelId']]);
    }
    $isMe = (string)$row['authorId'] === $viewerId;
    $kind = (string)($row['kind'] ?? 'post');
    $poll = null;
    if ($kind === 'poll') { $opts = json_decode((string)($row['pollOptions'] ?? ''), true) ?: []; $poll = community_poll_shape($pid, $opts, $viewerId, $pre['polls'][$pid] ?? null); }
    return [
        'postId' => $pid, 'kind' => $kind, 'poll' => $poll,
        'channel' => ['slug' => (string)($ch['slug'] ?? ''), 'name' => (string)($ch['name'] ?? 'Channel'), 'color' => (string)($ch['color'] ?? '#3b5bdb'), 'icon' => (string)($ch['icon'] ?? '')],
        /* `staff` belongs to the AUTHOR; `canStar` below belongs to the VIEWER.
         * They were being conflated on the client, which turned every message
         * green and gave every one of them a `mentor` chip the moment a mentor
         * was the one reading — inverting the single signal the design leans on
         * hardest ("is a mentor in this thread"), for exactly the people who
         * rely on it. Two different questions, so two different fields. */
        'author' => ['name' => community_staff_name((string)$row['authorId']) ?? (string)$row['authorName'], 'initial' => '', 'centre' => (string)$row['authorCentre'],
                     'isMe' => $isMe, 'staff' => community_actor_is_staff((string)$row['authorId']),
                     'photo' => community_photo_for((string)$row['authorId'])],
        'body' => (string)$row['body'],
        'mediaType' => (string)$row['mediaType'], 'mediaUrl' => (string)$row['mediaUrl'], 'mediaPoster' => (string)$row['mediaPoster'], 'altText' => (string)$row['altText'],
        /* Format is served from the record, falling back to the url only for
         * posts written before v93. The reader must never have to guess. */
        'mediaFormat' => (string)($row['mediaFormat'] ?? '') ?: upload_ext((string)$row['mediaUrl']),
        'mediaBytes' => (int)($row['mediaBytes'] ?? 0), 'mediaPages' => (int)($row['mediaPages'] ?? 0),
        'mediaDuration' => (int)($row['mediaDuration'] ?? 0),
        'linkPreview' =>(($lp = json_decode((string)($row['linkPreview'] ?? ''), true)) && is_array($lp) && !empty($lp['title'])) ? $lp : null,
        'status' => (string)$row['status'], 'pinned' => (int)$row['pinned'] === 1, 'featured' => (int)($row['featured'] ?? 0) === 1,
        'reactions' => $reacts, 'myReaction' => (string)$mine, 'commentCount' => $comments, 'lastCommentAt' => $lastComment,
        'stars' => $stars, 'starred' => (bool)$starred, 'canStar' => community_actor_is_staff($viewerId),
        'bookmarked' => (bool)$booked, 'viewCount' => (int)$row['viewCount'],
        'createdAt' => (string)$row['createdAt'],
        'moderationNote' => ((string)$row['status'] !== 'published' && $isMe) ? community_status_note((string)$row['status']) : '',
    ] + cm3_shape_extras($row, $viewerId);
}

function community_status_note(string $status): string {
    if ($status === 'pending') return 'In review — a mentor will approve this shortly.';
    if ($status === 'hidden') return 'Hidden by a mentor.';
    if ($status === 'removed') return 'Removed by a mentor.';
    return '';
}

/**
 * One post by id.
 *
 * Every deep link into the community — a notification about a mention, the
 * "Copy link" URL a member pastes to a friend — resolves to a single post, and
 * there was no way to ask for one: the client could fetch a feed page and hope
 * the post was on it. Published posts are readable by any signed-in member;
 * anything else only by its author, which is the same rule the feed applies.
 */
function community_post_get(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $pid = (string)($p['postId'] ?? '');
    if ($pid === '') return ['ok' => false, 'error' => 'missing_post'];
    $row = db_row("SELECT * FROM community_posts WHERE postId = ? LIMIT 1", [$pid]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$row['status'] !== 'published' && (string)$row['authorId'] !== $viewer) {
        return ['ok' => false, 'error' => 'not_found'];
    }
    return ['ok' => true, 'post' => community_post_shape($row, $viewer)];
}

/** The feed. channel: slug | 'all' | 'bookmarks'; sort: latest | trending. */
function community_feed(array $p): array {
    community_ensure_channels();
    $viewer = (string)($p['memberId'] ?? '');
    $channel = (string)($p['channel'] ?? 'all');
    $sort = (string)($p['sort'] ?? 'latest') === 'trending' ? 'trending' : 'latest';
    $page = max(0, (int)($p['page'] ?? 0));
    $limit = COMMUNITY_PAGE;

    $where = ["(cp.status = 'published'" . ($viewer !== '' ? " OR cp.authorId = ?" : "") . ")"];
    $args = $viewer !== '' ? [$viewer] : [];
    $mentionFilter = '';   // set by the `mentions` branch; applied after the read
    if ($channel === 'bookmarks') {
        $where[] = "cp.postId IN (SELECT postId FROM community_bookmarks WHERE memberId = ?)";
        $args[] = $viewer;
    } elseif ($channel === 'unread') {
        /* Everything posted since this member last read the channel it is in.
         *
         * A channel they have never opened has no read row, and everything in
         * it is unread — which is the honest answer and the one a new member
         * needs. Their own posts are excluded: nobody has unread news from
         * themselves, and seeing your own message in a catch-up list is how a
         * filter teaches people to stop trusting it. */
        $where[] = "cp.authorId <> ? AND cp.createdAt > COALESCE("
                 . "(SELECT r.lastReadAt FROM community_reads r WHERE r.memberId = ? AND r.channelId = cp.channelId), '')";
        $args[] = $viewer; $args[] = $viewer;
    } elseif ($channel === 'mine') {
        /* Everything this member wrote, including what is still awaiting a
         * mentor. "Your posts & replies" that hides the post you are anxious
         * about is the one view where omitting a row is worse than showing a
         * pending badge. */
        $where[] = "cp.authorId = ?";
        $args[] = $viewer;
    } elseif ($channel === 'mentions') {
        /* Posts that name this member — by the SAME rule the notifier uses.
         *
         * This matched space-delimited LIKE patterns while community_mentions()
         * (which decides who gets notified) matches a regex. So "@ada, can you
         * look at this?" notified Ada and then did not appear in her Mentions:
         * she was told about a message she could not then find. One definition
         * now — SQL narrows the rows, community_mentions() decides, so the two
         * cannot drift again. */
        $handle = community_handle_for($viewer);
        if ($handle === '') return ['ok' => true, 'posts' => [], 'hasMore' => false];
        $where[] = "cp.authorId <> ? AND LOWER(cp.body) LIKE ?";
        $args[] = $viewer;
        $args[] = '%@' . $handle . '%';
        $mentionFilter = $handle;
    } elseif ($channel === 'questions') {
        $where[] = "cp.kind = 'question'";
    } elseif ($channel !== 'all' && $channel !== '') {
        $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$channel]);
        if (!$ch) return ['ok' => true, 'posts' => [], 'hasMore' => false];
        $where[] = "cp.channelId = ?";
        $args[] = (string)$ch['channelId'];
    }
    /* `scope=mine` (Community v3): the cross-channel filters read only the
     * channels this member follows (cm3_my_channels), not every channel. */
    if ((string)($p['scope'] ?? '') === 'mine' && !in_array($channel, ['mine', 'bookmarks'], true) && ($channel === 'all' || in_array($channel, ['unread', 'mentions', 'questions'], true))) {
        $slugs = cm3_my_channels($viewer);
        if (!$slugs) return ['ok' => true, 'posts' => [], 'hasMore' => false];
        $where[] = "cp.channelId IN (SELECT channelId FROM community_channels WHERE slug IN (" . implode(',', array_fill(0, count($slugs), '?')) . "))";
        $args = array_merge($args, $slugs);
    }
    $whereSql = implode(' AND ', $where);

    // 'trending' ranks by a light engagement score over the last fortnight;
    // 'latest' is pinned-first then newest. Fetch a window and finish in PHP.
    if ($sort === 'trending') {
        $rows = db_all("SELECT cp.*, (SELECT COUNT(*) FROM community_reactions r WHERE r.postId = cp.postId) rc,
                        (SELECT COUNT(*) FROM community_comments c WHERE c.postId = cp.postId AND c.status='published') cc
                        FROM community_posts cp WHERE $whereSql ORDER BY cp.createdAt DESC LIMIT 200", $args);
        if ($mentionFilter !== '') $rows = community_filter_mentions($rows, $mentionFilter);
        usort($rows, fn($a, $b) => (((int)$b['rc'] + (int)$b['cc'] * 2)) <=> (((int)$a['rc'] + (int)$a['cc'] * 2)));
        $slice = array_slice($rows, $page * $limit, $limit + 1);
    } elseif ($mentionFilter !== '') {
        /* The LIKE above is a NET, not the answer: it also catches "@adaeze"
         * when the viewer is "@ada". community_mentions() — the same function
         * the notifier uses — decides which of those rows really name this
         * member, so a post can never be notified about and then be missing
         * from Mentions. Because the rejects are only known after the read,
         * pagination has to happen after the filter, over a window. */
        $rows = db_all("SELECT cp.* FROM community_posts cp WHERE $whereSql ORDER BY cp.pinned DESC, cp.createdAt DESC LIMIT 400", $args);
        $slice = array_slice(community_filter_mentions($rows, $mentionFilter), $page * $limit, $limit + 1);
    } else {
        $slice = db_all("SELECT cp.* FROM community_posts cp WHERE $whereSql ORDER BY cp.pinned DESC, cp.createdAt DESC LIMIT ? OFFSET ?",
            array_merge($args, [$limit + 1, $page * $limit]));
    }
    $hasMore = count($slice) > $limit;
    $slice = array_slice($slice, 0, $limit);
    $posts = community_shape_page($slice, $viewer);
    return ['ok' => true, 'posts' => $posts, 'hasMore' => $hasMore, 'reactionSet' => COMMUNITY_REACTIONS];
}

/* ── Link previews (server-side unfurl, SSRF-guarded + cached) ─────────── */

function community_extract_url(string $body): string {
    if (preg_match('#\bhttps://[^\s<>"\'\]]+#i', $body, $m)) return rtrim($m[0], '.,;:)]}\'"');
    return '';
}

/**
 * The YouTube video id in a URL, or ''.
 *
 * Only the shapes people actually paste: a watch link, a share link, /embed/,
 * /shorts/ and /live/. Recognising the ID on the SERVER matters — the client
 * then only ever builds an embed URL from an 11-character id it was handed,
 * so a crafted link cannot turn into an arbitrary iframe src.
 *
 * Any query string is discarded along the way, which also drops the `list=`
 * parameter: a member sharing one video should not hand the reader an autoplay
 * playlist.
 */
function community_youtube_id(string $url): string {
    $url = trim($url);
    if ($url === '' || !preg_match('#^https://#i', $url)) return '';
    $p = parse_url($url);
    $host = strtolower((string)($p['host'] ?? ''));
    $host = preg_replace('/^(www|m|music)\./', '', $host);
    $path = (string)($p['path'] ?? '');
    $id = '';
    if ($host === 'youtu.be') {
        $id = trim($path, '/');
    } elseif ($host === 'youtube.com' || $host === 'youtube-nocookie.com') {
        // `~` delimiter, not `#`: the character class needs a literal # in it,
        // which would otherwise close the pattern early and silently match the
        // wrong thing.
        if (preg_match('~^/(embed|shorts|live|v)/([^/?&#]+)~', $path, $m)) $id = $m[2];
        else {
            parse_str((string)($p['query'] ?? ''), $q);
            $id = (string)($q['v'] ?? '');
        }
    }
    // A YouTube id is exactly 11 characters of [A-Za-z0-9_-]. Anything else is
    // not an id, and must not be echoed into an iframe src.
    return preg_match('/^[A-Za-z0-9_-]{11}$/', $id) ? $id : '';
}
/** Block private / loopback / link-local hosts so the unfurl can't be pointed
 *  at internal services (SSRF). */
function community_host_is_private(string $host): bool {
    $host = strtolower(trim($host, '.'));
    if ($host === '' || $host === 'localhost') return true;
    if (preg_match('/\.(local|internal|localhost|lan|home|corp|test|invalid|example)$/', $host)) return true;
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    }
    /* A NAME can point anywhere. This checked the spelling of the host and then
     * handed the url to curl, so `metrics.internal-corp.example` resolving to
     * 10.0.0.5 passed — and the og:title it scraped off an internal service was
     * then stored on the post and shown to every reader. Resolve first, and
     * judge the address. Every address, because a name can carry several. */
    $addrs = community_resolve_host($host);
    if (!$addrs) return true;   // unresolvable → refuse rather than let curl try
    foreach ($addrs as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return true;
    }
    return false;
}

/** Every A/AAAA record for a host. Memoised per request so the pre-check and
 *  the pin below agree on one answer and cannot be raced between them. */
function community_resolve_host(string $host): array {
    static $memo = [];
    if (isset($memo[$host])) return $memo[$host];
    $out = [];
    if (function_exists('dns_get_record')) {
        $recs = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
        foreach ($recs as $r) {
            if (!empty($r['ip']))   $out[] = (string)$r['ip'];
            if (!empty($r['ipv6'])) $out[] = (string)$r['ipv6'];
        }
    }
    if (!$out) {
        $v4 = @gethostbyname($host);
        if ($v4 !== '' && $v4 !== $host && filter_var($v4, FILTER_VALIDATE_IP)) $out[] = $v4;
    }
    return $memo[$host] = array_values(array_unique($out));
}
/** Fetch a URL and pull Open Graph / title metadata. Best-effort; returns []
 *  on any failure. Cached for 7 days under the cache dir. */
function community_unfurl(string $url): array {
    $url = trim($url);
    if (!preg_match('#^https://#i', $url) || mb_strlen($url) > 2048) return [];
    $parts = parse_url($url);
    $host = (string)($parts['host'] ?? '');
    if ($host === '' || community_host_is_private($host)) return [];
    if (isset($parts['port']) && !in_array((int)$parts['port'], [80, 443], true)) return [];

    global $CONFIG;
    $dir = rtrim((string)($CONFIG['cache_dir'] ?? sys_get_temp_dir()), '/') . '/unfurl';
    @mkdir($dir, 0700, true);
    $cf = $dir . '/' . sha1($url) . '.json';
    if (is_file($cf) && (time() - (int)@filemtime($cf) < 7 * 86400)) {
        $c = json_decode((string)@file_get_contents($cf), true);
        return is_array($c) ? $c : [];
    }
    if (!function_exists('curl_init')) return [];
    $buf = '';
    $ch = curl_init($url);
    /* Pin the host to the address we just validated, so the name cannot resolve
     * to something else between the check and the fetch (DNS rebinding). Only
     * the first hop can be pinned; redirects are re-validated against
     * community_host_is_private() after the fact, below. */
    $pin = [];
    $port = (int)($parts['port'] ?? 443);
    foreach (community_resolve_host(strtolower($host)) as $ip) $pin[] = $host . ':' . $port . ':' . $ip;
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
        CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
        CURLOPT_REDIR_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
        CURLOPT_USERAGENT => 'NGG-LinkPreview/1.0 (+https://next.afrovanguard.org.ng)',
        CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml'],
        CURLOPT_WRITEFUNCTION => function ($c, $data) use (&$buf) { $buf .= $data; return strlen($buf) > 524288 ? -1 : strlen($data); },
    ]);
    if ($pin && defined('CURLOPT_RESOLVE')) @curl_setopt($ch, CURLOPT_RESOLVE, $pin);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $ctype = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $finalUrl = (string)curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);
    // A redirect could land on a private host — discard if so.
    $fh = (string)(parse_url($finalUrl, PHP_URL_HOST) ?: '');
    if ($fh !== '' && community_host_is_private($fh)) return [];
    if ($code < 200 || $code >= 400 || stripos($ctype, 'text/html') === false) { @file_put_contents($cf, '[]'); return []; }
    $og = community_parse_og($buf, $finalUrl ?: $url, $host);
    @file_put_contents($cf, json_encode($og, JSON_UNESCAPED_SLASHES));
    return $og;
}
function community_og_tag(string $html, string $prop): string {
    if (preg_match('#<meta[^>]+(?:property|name)=["\']' . preg_quote($prop, '#') . '["\'][^>]*content=["\']([^"\']*)["\']#i', $html, $m)) return html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (preg_match('#<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' . preg_quote($prop, '#') . '["\']#i', $html, $m)) return html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return '';
}
function community_parse_og(string $html, string $url, string $host): array {
    $title = community_og_tag($html, 'og:title');
    if ($title === '' && preg_match('#<title[^>]*>(.*?)</title>#is', $html, $m)) $title = html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($title === '') return [];
    $desc = community_og_tag($html, 'og:description') ?: community_og_tag($html, 'description');
    $img = community_og_tag($html, 'og:image');
    if ($img !== '' && !preg_match('#^https://#i', $img)) $img = ''; // only serve https images
    $site = community_og_tag($html, 'og:site_name') ?: preg_replace('/^www\./', '', $host);
    return [
        'url' => $url,
        'title' => mb_substr(trim($title), 0, 200),
        'description' => mb_substr(trim($desc), 0, 240),
        'image' => mb_substr($img, 0, 1024),
        'site' => mb_substr(trim($site), 0, 80),
    ];
}

function community_post_create(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    community_ensure_channels();
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $body = mb_substr(trim((string)($d['body'] ?? '')), 0, 2000);
    $kind = (string)($d['kind'] ?? 'post');
    if ($kind === 'announcement') $kind = 'announce';
    if (!in_array($kind, CM3_KINDS, true)) $kind = 'post';
    $mediaType = in_array((string)($d['mediaType'] ?? 'none'), ['none', 'image', 'video', 'doc', 'code'], true) ? (string)($d['mediaType'] ?? 'none') : 'none';
    $mediaUrl = trim((string)($d['mediaUrl'] ?? ''));
    if ($mediaUrl !== '' && !preg_match('#^https://#i', $mediaUrl)) return ['ok' => false, 'error' => 'bad_media'];
    // A code post carries its source, not a file; everything else needs its upload.
    if ($mediaType === 'code') $mediaUrl = '';
    elseif ($mediaUrl === '') $mediaType = 'none';
    /* Kind-specific fields — staff-only kinds, video chapters and captions,
     * code — are checked before anything is written (community-v3.php). */
    $extras = cm3_post_extras($viewer, $kind, $d, $mediaType);
    if (isset($extras['error'])) return ['ok' => false, 'error' => $extras['error'], 'message' => $extras['message'] ?? ''];
    $docName = mb_substr(trim((string)($d['mediaName'] ?? '')), 0, 160);
    /* The stored format, taken from the upload result rather than sniffed off
     * the url. Trusted only as far as it goes: it is checked against the url's
     * own extension below, and a document whose format is not one we accept is
     * refused outright rather than published as an unopenable link. */
    $mediaFormat = strtolower(preg_replace('/[^a-z0-9]/i', '', (string)($d['mediaFormat'] ?? '')));
    $mediaPages = max(0, min(9999, (int)($d['mediaPages'] ?? 0)));
    $mediaBytes = max(0, (int)($d['mediaBytes'] ?? 0));

    if ($mediaType === 'doc') {
        // Fall back to the url when the client sent no format (the local-storage
        // path has no cloud to ask), then insist the answer is one we allow.
        if ($mediaFormat === '') $mediaFormat = upload_ext($mediaUrl);
        if (!upload_is_doc_ext($mediaFormat)) {
            return ['ok' => false, 'error' => 'bad_document',
                'message' => 'That file type can\'t be shared here. Documents can be PDF, Word, Excel, PowerPoint, text or zip.'];
        }
        if ($mediaBytes > 25 * 1024 * 1024) {
            return ['ok' => false, 'error' => 'doc_too_big',
                'message' => 'That file is too large — keep documents under 25MB.'];
        }
        if ($docName === '') $docName = 'Document';
    } elseif ($mediaType !== 'none') {
        // An image or a clip must not arrive claiming to be a document format —
        // that combination is what the old signer produced, and it is the shape
        // of a file that was converted on the way in.
        if (upload_is_doc_ext($mediaFormat)) $mediaFormat = '';
    }

    // Poll: a question (body) + 2-4 short options; no media.
    $pollOptions = [];
    if ($kind === 'poll') {
        $mediaType = 'none'; $mediaUrl = '';
        foreach ((array)($d['pollOptions'] ?? []) as $o) { $o = mb_substr(trim((string)$o), 0, 80); if ($o !== '') $pollOptions[] = $o; if (count($pollOptions) >= 4) break; }
        if ($body === '') return ['ok' => false, 'error' => 'empty', 'message' => 'A poll needs a question.'];
        if (count($pollOptions) < 2) return ['ok' => false, 'error' => 'poll_options', 'message' => 'A poll needs at least two options.'];
    }
    if ($body === '' && $mediaType === 'none' && $kind !== 'poll' && !($kind === 'homework' && trim((string)($d['hwTitle'] ?? '')) !== '')) return ['ok' => false, 'error' => 'empty'];

    // Video guards: size + duration caps (defence-in-depth; the client enforces
    // them too before upload). Cloudinary delivers a web-optimized f_auto/q_auto
    // stream, so the stored original just needs to be within sane bounds.
    if ($mediaType === 'video') {
        $bytes = (int)($d['mediaBytes'] ?? 0);
        $secs = (int)($d['mediaDuration'] ?? 0);
        if ($bytes > 80 * 1024 * 1024) return ['ok' => false, 'error' => 'video_too_big', 'message' => 'That video is too large — keep clips under 80MB.'];
        if ($secs > 180) return ['ok' => false, 'error' => 'video_too_long', 'message' => 'Keep clips under 3 minutes.'];
    }

    // Anti-spam: per-author throttle + duplicate guard.
    $spam = community_spam_check($viewer, $body);
    if ($spam) return ['ok' => false, 'error' => $spam, 'message' => $spam === 'too_fast' ? 'Slow down a moment before posting again.' : ($spam === 'duplicate' ? 'You just posted that.' : 'You\'ve posted a lot recently — take a short break.')];

    $chSlug = (string)($d['channel'] ?? 'commons');
    $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? AND status = 'active' LIMIT 1", [$chSlug]);
    if (!$ch) $ch = db_row("SELECT channelId FROM community_channels WHERE slug = 'commons' LIMIT 1");
    if (!$ch) return ['ok' => false, 'error' => 'no_channel'];

    // Safeguarding screen — text (question + poll options + shared code), then image/video.
    $screenText = trim($body . ' ' . implode(' ', $pollOptions) . ' ' . ($extras['mediaCode'] ?? ''));
    $screen = community_screen($screenText);
    if ($screen['verdict'] === 'block') {
        // A crisis is not a moderation outcome. Record it and raise it before
        // returning, so the child's disclosure reaches somebody who can act.
        if ($screen['crisis']) community_raise_safeguarding($viewer, 'post', $screenText, $chSlug, (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => $screen['crisis'] ? 'crisis' : 'blocked',
            'message' => $screen['crisis'] ? coach_crisis_reply() : 'That post can\'t be shared here — it looks unsafe for this community. A mentor can help if this is a mistake.'];
    }
    /* `strict` HOLDS a borderline post; `flag` and `off` publish it and leave a
     * flag for staff. Held-vs-flagged is the whole difference between the modes:
     * in both cases a human still sees it, but only `strict` makes a child wait. */
    $mode = community_moderation_mode();
    /* The shared rules (phone numbers, unkind words, social links) — the same
     * check the composer showed while the child typed. A clip is the one thing
     * `flag` still holds: frames are not the whole video, so "published and
     * flagged" would mean the unreviewed part is already on screen. Hold rules
     * are for students; staff are refused only for unsafe content (above). */
    $rule = cm3_safety_check(trim($body . ' ' . implode(' ', $pollOptions) . ' ' . ($extras['mediaCode'] ?? '')), $mediaType);
    $staffAuthor = community_actor_is_staff($viewer);
    if ($mediaType === 'video' && community_screen_video($mediaUrl) === 'block') return ['ok' => false, 'error' => 'blocked', 'message' => 'That video can\'t be shared here.'];
    $hold = cm3_hold($staffAuthor, $screen['verdict'] === 'review' || $rule['v'] === 'review', $mediaType, $mode);
    $status = $hold['status']; $flagged = $hold['flagged'];

    $author = community_author($viewer);
    /* Alt text is what the POSTER says is in the picture, when they say it.
     *
     * This used to be derived: the caption for an image post, or "Photo shared
     * by Ada · Ikeja" when there was no caption. Both are wrong for the job. A
     * copy of the caption makes a screen reader read the same sentence twice,
     * and the fallback describes who posted it rather than what it shows. The
     * composer now asks, and an unanswered question means alt="" — announced
     * as decorative, which is honest, where a bad description is not.
     *
     * A document keeps its filename: that IS the description of a file. */
    $altIn = mb_substr(trim((string)($d['altText'] ?? '')), 0, 160);
    $alt = $mediaType === 'doc' ? ($docName ?: 'Document')
        : ($mediaType === 'image' ? $altIn : '');
    /* A YouTube link becomes a player rather than a link card.
     *
     * Held under `strict` on the same reasoning as an uploaded clip: nobody has
     * watched it. It is arguably stricter than the plain link to the same video,
     * which publishes with an unfurl — and that is the intended difference.
     * Embedding plays the video inside our own page to an audience of children,
     * which is closer to showing it than to mentioning it.
     */
    $ytId = ($mediaType === 'none' && $kind === 'post') ? community_youtube_id(community_extract_url($body)) : '';
    if ($ytId !== '' && $mode === 'strict' && !$staffAuthor) $status = 'pending';
    /* Homework is a task as well as a post: set the task first, so a refusal
     * (no due date that can be met, nobody to set it for) writes nothing. */
    if ($kind === 'homework') {
        $hw = cm3_homework_for_post($viewer, $chSlug, $d, $body);
        if (empty($hw['ok'])) return $hw;
        $extras['homeworkId'] = (string)$hw['homeworkId'];
        if ($body === '') $body = trim((string)($d['hwTitle'] ?? ''));
    }

    /* No unfurl here. It costs up to nine seconds of the member's Send and
     * nobody is waiting on a link card — community_post_on_published() fetches
     * it after the response has gone. A YouTube link is different: its preview
     * is built from an 11-character id with no network call at all.
     *
     * Carried in linkPreview rather than as a new mediaType: `mediaType` is
     * read in a dozen places and gates the upload, size and frame-check paths,
     * none of which apply to a link somebody pasted. */
    $preview = [];
    if ($ytId !== '') {
        $preview = ['kind' => 'youtube', 'youtubeId' => $ytId,
                    'url' => 'https://www.youtube.com/watch?v=' . $ytId,
                    'image' => 'https://i.ytimg.com/vi/' . $ytId . '/hqdefault.jpg',
                    'site' => 'YouTube', 'title' => 'YouTube video'];
    }
    $id = 'CP-' . strtoupper(rand_hex(6));
    $now = now_iso();
    db_insert('community_posts', [
        'postId' => $id, 'channelId' => (string)$ch['channelId'], 'authorId' => $viewer,
        'authorName' => $author['name'] . ($author['initial'] ? ' ' . $author['initial'] : ''), 'authorCentre' => $author['centre'],
        'body' => $body, 'kind' => $kind, 'pollOptions' => $kind === 'poll' ? json_encode($pollOptions, JSON_UNESCAPED_SLASHES) : '',
        'mediaType' => $mediaType, 'mediaUrl' => $mediaUrl, 'mediaPoster' => trim((string)($d['mediaPoster'] ?? '')),
        'mediaFormat' => $mediaFormat, 'mediaBytes' => $mediaBytes, 'mediaPages' => $mediaPages,
        // Checked above, and now kept: the Files list needs "4:12", not only "18 MB".
        'mediaDuration' => $mediaType === 'video' ? max(0, (int)($d['mediaDuration'] ?? 0)) : 0,
        'altText' => $alt, 'status' => $status,
        'pinned' => in_array($kind, ['announce', 'homework'], true) ? 1 : 0,
        'answerId' => '', 'homeworkId' => (string)($extras['homeworkId'] ?? ''),
        'mediaMeta' => (string)($extras['mediaMeta'] ?? ''), 'mediaCode' => (string)($extras['mediaCode'] ?? ''),
        'moderation' => json_encode(['verdict' => $screen['verdict'], 'reason' => $screen['reason'],
                                     'by' => 'ai', 'at' => $now, 'mode' => $mode,
                                     'rule' => $rule['code'], 'why' => $rule['v'] === 'review' ? $rule['msg'] : '',
                                     'autoFlagged' => $flagged === 1], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        /* A flagged-but-published post rides the EXISTING reported queue rather
         * than getting a column of its own — reportCount > 0 is already what
         * "somebody should look at this" means here, so the console surfaces it
         * with no new plumbing and no second place for staff to check. */
        'reportCount' => $flagged,
        'linkPreview' => $preview ? json_encode($preview, JSON_UNESCAPED_SLASHES) : '',
        'viewCount' => 0, 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    audit('community.post', $viewer, $id, ['channel' => $chSlug, 'status' => $status, 'media' => $mediaType, 'kind' => $kind], (string)($p['ip'] ?? ''));
    /* Everything that happens BECAUSE a post is live now runs in one place, so
     * the approve path cannot skip it — see community_post_on_published(). */
    if ($status === 'published') community_post_on_published($id);
    $row = db_row("SELECT * FROM community_posts WHERE postId = ?", [$id]);
    return ['ok' => true, 'post' => community_post_shape($row, $viewer), 'queued' => $status !== 'published'];
}

/**
 * Everything that happens because a post became visible.
 *
 * This used to live inline in community_post_create() behind
 * `if ($status === 'published')`, and admin_community_moderate()'s `approve`
 * only flipped the status column. So under `strict` — the DEFAULT mode — every
 * @mention inside a held post was dropped for good: the post appeared in the
 * recipient's Mentions filter and they were never told it existed. Held posts
 * lost their link preview the same way.
 *
 * Idempotent by design: `notifiedAt` is stamped on the row, so approving twice,
 * or a re-approval after a hide, cannot notify the same people again.
 */
function community_post_on_published(string $postId): void {
    $r = db_row("SELECT * FROM community_posts WHERE postId = ? LIMIT 1", [$postId]);
    if (!$r || (string)$r['status'] !== 'published') return;
    if (trim((string)($r['notifiedAt'] ?? '')) !== '') return;
    db_update('community_posts', ['notifiedAt' => now_iso()], ['postId' => $postId]);

    $authorId = (string)$r['authorId'];
    $body     = (string)$r['body'];
    $chSlug   = (string)(db_row("SELECT slug FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$r['channelId']])['slug'] ?? '');
    // The stored authorName is "Ada O."; the notifier wants the first name.
    $name = community_staff_name((string)$r['authorId']) ?? (explode(' ', trim((string)$r['authorName']))[0] ?? 'A member');

    community_notify_mentions($body, $authorId, $name, $postId, (string)$r['channelId']);

    /* Homework: each child it was set for gets ONE private in-app notice that
       opens the task's post. In-app only — a class of thirty is thirty mails
       sent inside the instructor's Send, and the task is on their board. */
    $hid = (string)($r['homeworkId'] ?? '');
    if ($hid !== '') {
        $hw = db_row("SELECT title, dueAt FROM community_homework WHERE homeworkId = ? LIMIT 1", [$hid]);
        if ($hw) {
            $due = trim((string)$hw['dueAt']);
            $line = $due !== '' && function_exists('cm3_due_words') ? 'Due ' . cm3_due_words($due) . '.' : 'No due date — hand it in when you can.';
            foreach (db_all("SELECT memberId FROM community_homework_state WHERE homeworkId = ?", [$hid]) as $st) {
                community_notify((string)$st['memberId'], $authorId, 'community.homework', 'New homework from ' . $name . ': ' . (string)$hw['title'], $line, false, $postId);
            }
        }
    }

    // Mirror shared documents to a configured Drive integration (any drive:
    // Google Drive, Dropbox, OneDrive… via its webhook). Best-effort.
    if ((string)$r['mediaType'] === 'doc' && function_exists('event_emit')) {
        event_emit('community.document', ['postId' => $postId, 'name' => (string)$r['altText'], 'url' => (string)$r['mediaUrl'],
            'channel' => $chSlug, 'author' => $name, 'format' => (string)($r['mediaFormat'] ?? ''), 'bytes' => (int)($r['mediaBytes'] ?? 0)]);
    }

    /* The link preview is fetched AFTER the response has gone.
     *
     * community_unfurl() allows 4s to connect and 5s to transfer, and it ran
     * inside the member's Send — a first-time link could add nine seconds to a
     * request that otherwise returns in tens of milliseconds, with nothing on
     * screen explaining the wait. Nobody is waiting on a link card. The post is
     * already live; the preview appears on the next read.
     *
     * A YouTube post already has its preview (built from an 11-character id, no
     * network involved) and must not be overwritten by an unfurl of the same url.
     */
    if ((string)$r['mediaType'] !== 'none' || (string)($r['kind'] ?? 'post') !== 'post') return;
    if (trim((string)($r['linkPreview'] ?? '')) !== '') return;
    $url = community_extract_url($body);
    if ($url === '') return;
    $fill = function () use ($postId, $url) {
        $og = community_unfurl($url);
        if (!$og) return;
        // Only if nothing else claimed the slot while we were off the request.
        $now = db_row("SELECT linkPreview FROM community_posts WHERE postId = ? LIMIT 1", [$postId]);
        if (!$now || trim((string)($now['linkPreview'] ?? '')) !== '') return;
        db_update('community_posts', ['linkPreview' => json_encode($og, JSON_UNESCAPED_SLASHES)], ['postId' => $postId]);
    };
    if (function_exists('after_response')) after_response('community.unfurl', $fill);
    else $fill();
}

/** Notify mentioned students (@handle) — best-effort, PII-safe. */
function community_notify_mentions(string $body, string $actorId, string $actorName, string $postId, string $channelId = ''): void {
    $handles = community_mentions($body);
    if (!$handles) return;
    $tagAll = (bool)array_intersect($handles, ['all', 'everyone', 'channel', 'here']);
    $done = [];
    foreach ($handles as $h) {
        if (in_array($h, ['all', 'everyone', 'channel', 'here'], true)) continue;
        foreach (community_resolve_handle($h) as $r) {
            if (isset($done[$r['id']])) continue; $done[$r['id']] = 1;
            community_notify($r['id'], $actorId, 'community.mention', $actorName . ' mentioned you', mb_substr($body, 0, 160), true, $postId);
        }
    }
    // @all / @channel — mentors & admins only, and only within a real channel.
    if ($tagAll && $channelId !== '' && community_actor_is_staff($actorId)) {
        community_notify_channel($channelId, $actorId, $actorName, mb_substr($body, 0, 160), $done, $postId);
    }
}

/** Tag-all: notify everyone who has posted in a channel (excluding the actor
 *  and anyone already individually notified). Members with email also get an
 *  email; capped so a single post can't fan out without bound. */
function community_notify_channel(string $channelId, string $actorId, string $actorName, string $body, array $skip = [], string $ref = ''): void {
    $rows = db_all("SELECT DISTINCT authorId FROM community_posts WHERE channelId = ? AND status = 'published' AND authorId <> ? LIMIT 500", [$channelId, $actorId]);
    $n = 0;
    foreach ($rows as $r) {
        $id = (string)$r['authorId'];
        if ($id === '' || isset($skip[$id])) continue;
        community_notify($id, $actorId, 'community.tagall', $actorName . ' tagged the channel', $body, true, $ref);
        if (++$n >= 500) break;
    }
    audit('community.tagall', $actorId, $channelId, ['recipients' => $n], '');
}

/** Vote in a poll (one ballot per member; changing your vote is allowed). */
function community_poll_vote(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $pid = (string)($p['postId'] ?? '');
    $choice = (int)($p['choice'] ?? -1);
    $row = db_row("SELECT pollOptions, kind FROM community_posts WHERE postId = ? AND kind = 'poll'", [$pid]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $opts = json_decode((string)$row['pollOptions'], true) ?: [];
    if ($choice < 0 || $choice >= count($opts)) return ['ok' => false, 'error' => 'bad_choice'];
    if (db_row("SELECT id FROM community_poll_votes WHERE postId = ? AND memberId = ?", [$pid, $viewer])) db_update('community_poll_votes', ['choice' => $choice], ['postId' => $pid, 'memberId' => $viewer]);
    else db_insert('community_poll_votes', ['postId' => $pid, 'memberId' => $viewer, 'choice' => $choice, 'createdAt' => now_iso()]);
    return ['ok' => true, 'poll' => community_poll_shape($pid, $opts, $viewer)];
}

/** Poll tallies + this member's vote. */
function community_poll_shape(string $postId, array $opts, string $viewer, ?array $pre = null): array {
    $counts = array_fill(0, count($opts), 0);
    if ($pre !== null) {
        foreach (($pre['counts'] ?? []) as $i => $c) { if ($i >= 0 && $i < count($counts)) $counts[$i] = (int)$c; }
        $myVote = array_key_exists('mine', $pre) ? (int)$pre['mine'] : -1;
    } else {
        foreach (db_all("SELECT choice, COUNT(*) c FROM community_poll_votes WHERE postId = ? GROUP BY choice", [$postId]) as $r) {
            $i = (int)$r['choice']; if ($i >= 0 && $i < count($counts)) $counts[$i] = (int)$r['c'];
        }
        $my = $viewer !== '' ? db_row("SELECT choice FROM community_poll_votes WHERE postId = ? AND memberId = ?", [$postId, $viewer]) : null;
        $myVote = $my ? (int)$my['choice'] : -1;
    }
    $total = array_sum($counts);
    $options = [];
    foreach ($opts as $i => $t) $options[] = ['text' => (string)$t, 'votes' => $counts[$i], 'pct' => $total ? (int)round($counts[$i] / $total * 100) : 0];
    return ['options' => $options, 'totalVotes' => $total, 'myVote' => $myVote];
}

function community_react(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $pid = (string)($p['postId'] ?? '');
    $emoji = (string)($p['emoji'] ?? '');
    if (!in_array($emoji, COMMUNITY_REACTIONS, true)) return ['ok' => false, 'error' => 'bad_emoji'];
    /* Only a post the viewer can actually see. This accepted any id, so a
     * hidden or still-pending post could be reacted to by anyone who knew it
     * existed — and the author would watch the reaction count climb on a
     * message nobody was supposed to be reading. */
    $target = db_row("SELECT status, authorId FROM community_posts WHERE postId = ? LIMIT 1", [$pid]);
    if (!$target) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$target['status'] !== 'published' && (string)$target['authorId'] !== $viewer) return ['ok' => false, 'error' => 'not_found'];
    $existing = db_row("SELECT emoji FROM community_reactions WHERE postId = ? AND memberId = ?", [$pid, $viewer]);
    if ($existing) {
        if ((string)$existing['emoji'] === $emoji) { db_exec("DELETE FROM community_reactions WHERE postId = ? AND memberId = ?", [$pid, $viewer]); $mine = ''; }
        else { db_update('community_reactions', ['emoji' => $emoji], ['postId' => $pid, 'memberId' => $viewer]); $mine = $emoji; }
    } else {
        db_insert('community_reactions', ['postId' => $pid, 'memberId' => $viewer, 'emoji' => $emoji, 'createdAt' => now_iso()]);
        $mine = $emoji;
    }
    $reacts = [];
    foreach (db_all("SELECT emoji, COUNT(*) c FROM community_reactions WHERE postId = ? GROUP BY emoji", [$pid]) as $r) $reacts[(string)$r['emoji']] = (int)$r['c'];
    return ['ok' => true, 'reactions' => $reacts, 'myReaction' => $mine];
}

/**
 * Genius Star — an NGG-native mentor kudos. Only mentors/admins can award one;
 * it's recognition the whole cohort can see (a gold star on the post), separate
 * from ordinary reactions. Awarding one notifies + emails the author.
 */
/* ── Genius Stars ─────────────────────────────────────────────────────────
 *
 * §4 of the handoff prints "2 left today" beside the action, and that string is
 * the whole design. A mentor with an unlimited supply of stars either gives one
 * to everything, which makes them mean nothing, or gives them to the same two
 * children every week, which is worse. A small daily budget makes the mentor
 * choose, and choosing is what recognition IS.
 *
 * Three a day, per mentor. The handoff shows the count but never the ceiling,
 * so the number is an assumption — it is one constant, and one line to change
 * once somebody running a centre says what it should be.
 *
 * The budget is spent by GIVING and refunded by taking back, and it is counted
 * from the rows rather than stored: a counter and a list of stars are two
 * records of one fact, and they drift.
 */
const COMMUNITY_STARS_PER_DAY = 3;

/** How many Genius Stars this mentor has left today. */
function community_stars_left(string $mentorId): int {
    if ($mentorId === '' || !community_actor_is_staff($mentorId)) return 0;
    $used = (int)(db_row(
        "SELECT COUNT(*) c FROM community_stars WHERE memberId = ? AND createdAt >= ?",
        [$mentorId, gmdate('Y-m-d') . 'T00:00:00Z'])['c'] ?? 0);
    return max(0, COMMUNITY_STARS_PER_DAY - $used);
}

function community_star(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    if (!community_actor_is_staff($viewer)) return ['ok' => false, 'error' => 'forbidden', 'message' => 'Only mentors can give a Genius Star.'];
    $pid = (string)($p['postId'] ?? '');
    $post = db_row("SELECT authorId, status FROM community_posts WHERE postId = ? LIMIT 1", [$pid]);
    if (!$post) return ['ok' => false, 'error' => 'not_found'];
    // Recognition is public by nature — there is nothing to award on a post
    // that is still held or has been hidden.
    if ((string)$post['status'] !== 'published') return ['ok' => false, 'error' => 'not_found'];
    $ex = db_row("SELECT id FROM community_stars WHERE postId = ? AND memberId = ?", [$pid, $viewer]);
    if ($ex) { db_exec("DELETE FROM community_stars WHERE postId = ? AND memberId = ?", [$pid, $viewer]); $starred = false; }
    else {
        /* Out of stars. Refused with the number and with when they come back,
           because "you cannot do that" tells a mentor nothing they can act on
           — and this is the one refusal in the product that is not a mistake
           on their part. */
        if (community_stars_left($viewer) < 1) {
            return ['ok' => false, 'error' => 'no_stars_left',
                    'message' => 'You have given all ' . COMMUNITY_STARS_PER_DAY
                                 . ' Genius Stars today. They come back tomorrow.',
                    'starsLeft' => 0];
        }
        db_insert('community_stars', ['postId' => $pid, 'memberId' => $viewer, 'createdAt' => now_iso()]);
        $starred = true;
        $actor = community_author($viewer);
        community_notify((string)$post['authorId'], $viewer, 'community.star', '⭐ ' . $actor['name'] . ' gave your post a Genius Star', 'A mentor recognised your work in the community.', true, $pid);
        audit('community.star', $viewer, $pid, [], (string)($p['ip'] ?? ''));
    }
    $stars = (int)(db_row("SELECT COUNT(*) c FROM community_stars WHERE postId = ?", [$pid])['c'] ?? 0);
    /* Sent back with every award so the sheet can count down without a second
       request — and so taking one back visibly gives it to them again. */
    return ['ok' => true, 'stars' => $stars, 'starred' => $starred,
            'starsLeft' => community_stars_left($viewer)];
}

function community_comments(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $pid = (string)($p['postId'] ?? '');
    $answerId = (string)(db_row('SELECT answerId FROM community_posts WHERE postId = ?', [$pid])['answerId'] ?? '');
    $rows = db_all("SELECT commentId, memberId, memberName, body, status, reportCount, createdAt FROM community_comments
                    WHERE postId = ? AND (status = 'published'" . ($viewer !== '' ? " OR memberId = ?" : "") . ") ORDER BY createdAt ASC",
        $viewer !== '' ? [$pid, $viewer] : [$pid]);
    $out = array_map(fn($r) => [
        'commentId' => (string)$r['commentId'], 'name' => community_staff_name((string)$r['memberId']) ?? (string)$r['memberName'], 'body' => (string)$r['body'],
        'status' => (string)$r['status'], 'createdAt' => (string)$r['createdAt'], 'isMe' => (string)$r['memberId'] === $viewer,
        'photo' => community_photo_for((string)$r['memberId']),
        'staff' => community_actor_is_staff((string)$r['memberId']),
        'reported' => (int)($r['reportCount'] ?? 0) > 0,
        'note' => ((string)$r['status'] !== 'published' && (string)$r['memberId'] === $viewer) ? community_status_note((string)$r['status']) : '',
        'authorKey' => cm3_key((string)$r['memberId']), 'role' => cm3_role_label((string)$r['memberId']),
        'isAnswer' => $answerId !== '' && (string)$r['commentId'] === $answerId,
    ], $rows);
    return ['ok' => true, 'comments' => $out];
}

function community_comment_create(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $pid = (string)($p['postId'] ?? '');
    $post = db_row("SELECT authorId, status FROM community_posts WHERE postId = ?", [$pid]);
    if (!$post) return ['ok' => false, 'error' => 'not_found'];
    // A post that is not live takes no replies but its author's (and staff's): nobody else can see it.
    if ((string)$post['status'] !== 'published' && (string)$post['authorId'] !== $viewer && (!function_exists('cm3_role') || cm3_role($viewer) !== 'admin')) return ['ok' => false, 'error' => 'not_found'];
    $body = mb_substr(trim((string)($p['body'] ?? '')), 0, 1000);
    if ($body === '') return ['ok' => false, 'error' => 'empty'];
    $screen = community_screen($body);
    if ($screen['verdict'] === 'block') {
        if ($screen['crisis']) {
            $pc = db_row("SELECT channelId FROM community_posts WHERE postId = ? LIMIT 1", [$pid]);
            $cs = $pc ? db_row("SELECT slug FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$pc['channelId']]) : null;
            community_raise_safeguarding($viewer, 'comment', $body, (string)($cs['slug'] ?? ''), (string)($p['ip'] ?? ''));
        }
        return ['ok' => false, 'error' => $screen['crisis'] ? 'crisis' : 'blocked',
            'message' => $screen['crisis'] ? coach_crisis_reply() : 'That comment can\'t be posted — it looks unsafe for this community.'];
    }
    // Same rules as a post (community-v3.php): only `strict` makes a child wait, and staff never wait.
    $mode = community_moderation_mode();
    $rule = cm3_safety_check($body);
    $hold = cm3_hold(community_actor_is_staff($viewer), $screen['verdict'] === 'review' || $rule['v'] === 'review', '', $mode);
    $status = $hold['status'];
    $author = community_author($viewer);
    $id = 'CC-' . strtoupper(rand_hex(6));
    $now = now_iso();
    db_insert('community_comments', [
        'commentId' => $id, 'postId' => $pid, 'memberId' => $viewer, 'memberName' => $author['name'] . ($author['initial'] ? ' ' . $author['initial'] : ''),
        'body' => $body, 'status' => $status,
        'moderation' => json_encode(['verdict' => $screen['verdict'], 'reason' => $screen['reason'], 'mode' => $mode,
                                     'rule' => $rule['code'], 'why' => $rule['v'] === 'review' ? $rule['msg'] : '',
                                     'autoFlagged' => $hold['flagged'] === 1], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'reportCount' => $hold['flagged'],
        'createdAt' => $now,
    ]);
    audit('community.comment', $viewer, $id, ['postId' => $pid, 'status' => $status], (string)($p['ip'] ?? ''));
    if ($status === 'published') community_comment_on_published($id);
    return ['ok' => true, 'queued' => $status !== 'published', 'comment' => [
        'commentId' => $id, 'name' => $author['name'] . ($author['initial'] ? ' ' . $author['initial'] : ''), 'body' => $body,
        'status' => $status, 'createdAt' => $now, 'isMe' => true, 'photo' => community_photo_for($viewer),
        'note' => $status !== 'published' ? community_status_note($status) : '',
    ]];
}

/**
 * The reply notification and any @mentions inside a comment.
 *
 * Split out for the same reason posts were: approving a held comment only
 * flipped its status column, so under `strict` the post's author was never told
 * a reply had arrived. Stamped once via `notifiedAt`.
 */
function community_comment_on_published(string $commentId): void {
    $c = db_row("SELECT * FROM community_comments WHERE commentId = ? LIMIT 1", [$commentId]);
    if (!$c || (string)$c['status'] !== 'published') return;
    if (trim((string)($c['notifiedAt'] ?? '')) !== '') return;
    db_update('community_comments', ['notifiedAt' => now_iso()], ['commentId' => $commentId]);

    $pid    = (string)$c['postId'];
    $viewer = (string)$c['memberId'];
    $body   = (string)$c['body'];
    $name   = explode(' ', trim((string)$c['memberName']))[0] ?? 'A member';
    $post = db_row("SELECT authorId, postId, channelId FROM community_posts WHERE postId = ? LIMIT 1", [$pid]);
    if ($post) community_notify((string)$post['authorId'], $viewer, 'community.reply', $name . ' replied to your post', mb_substr($body, 0, 120), true, (string)$post['postId']);
    // @mentions inside a reply notify (and email) too.
    community_notify_mentions($body, $viewer, $name, $pid, $post ? (string)$post['channelId'] : '');
}

function community_bookmark(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $pid = (string)($p['postId'] ?? '');
    $existing = db_row("SELECT id FROM community_bookmarks WHERE postId = ? AND memberId = ?", [$pid, $viewer]);
    if ($existing) { db_exec("DELETE FROM community_bookmarks WHERE postId = ? AND memberId = ?", [$pid, $viewer]); return ['ok' => true, 'bookmarked' => false]; }
    // Saving something that does not exist wrote a row that could never render.
    if (!db_row("SELECT id FROM community_posts WHERE postId = ? LIMIT 1", [$pid])) return ['ok' => false, 'error' => 'not_found'];
    db_insert('community_bookmarks', ['postId' => $pid, 'memberId' => $viewer, 'createdAt' => now_iso()]);
    return ['ok' => true, 'bookmarked' => true];
}

/** A member reports a post or comment → surfaces in the admin queue. */
function community_report(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $type = (string)($p['targetType'] ?? 'post') === 'comment' ? 'comment' : 'post';
    $id = (string)($p['targetId'] ?? '');
    $table = $type === 'comment' ? 'community_comments' : 'community_posts';
    $col = $type === 'comment' ? 'commentId' : 'postId';
    if (!db_row("SELECT id FROM $table WHERE $col = ?", [$id])) return ['ok' => false, 'error' => 'not_found'];
    if (db_row("SELECT id FROM community_reports WHERE targetType = ? AND targetId = ? AND memberId = ?", [$type, $id, $viewer])) return ['ok' => true, 'already' => true];
    $reason = trim((string)($p['reason'] ?? ''));
    $reasonText = CM3_REPORT_REASONS[$reason] ?? mb_substr($reason, 0, 400);
    db_insert('community_reports', ['targetType' => $type, 'targetId' => $id, 'memberId' => $viewer, 'reason' => $reasonText, 'createdAt' => now_iso()]);
    /* "I'm worried someone is not safe" is not a moderation report. It goes to
     * a trained safeguarding lead, as a case, straight away. */
    if ($reason === 'safety') {
        $pidForCase = $type === 'post' ? $id : (string)(db_row('SELECT postId FROM community_comments WHERE commentId = ?', [$id])['postId'] ?? '');
        if ($pidForCase !== '') cm3_case_from_post($pidForCase, $viewer, 'report', 'high', 'A member said they are worried someone is not safe' . ($type === 'comment' ? ' (about a reply).' : '.'));
    }
    /* Comments count too. They did not, and the queue looked for comments with
     * status 'reported' — a status the moderation map never writes — so a child
     * reporting a bullying reply reached nobody at all. Comments are where
     * bullying lives on a threaded feed; this was the gap that mattered most. */
    if ($type === 'post') db_exec("UPDATE community_posts SET reportCount = reportCount + 1 WHERE postId = ?", [$id]);
    else                  db_exec("UPDATE community_comments SET reportCount = reportCount + 1 WHERE commentId = ?", [$id]);
    audit('community.report', $viewer, $id, ['type' => $type], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Author deletes their own post (and its children) or comment. */
function community_delete(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $type = (string)($p['targetType'] ?? 'post') === 'comment' ? 'comment' : 'post';
    $id = (string)($p['targetId'] ?? '');
    if ($type === 'comment') {
        $c = db_row("SELECT memberId FROM community_comments WHERE commentId = ?", [$id]);
        if (!$c || (string)$c['memberId'] !== $viewer) return ['ok' => false, 'error' => 'forbidden'];
        db_exec("DELETE FROM community_comments WHERE commentId = ?", [$id]);
        db_exec("DELETE FROM community_reports WHERE targetType = 'comment' AND targetId = ?", [$id]);
        // A question answered by this reply is open again, not "answered" by nothing.
        db_exec("UPDATE community_posts SET answerId = '' WHERE answerId = ?", [$id]);
    } else {
        $pr = db_row("SELECT authorId, featured FROM community_posts WHERE postId = ?", [$id]);
        if (!$pr || (string)$pr['authorId'] !== $viewer) return ['ok' => false, 'error' => 'forbidden'];
        $wasFeatured = (int)($pr['featured'] ?? 0) === 1;
        // Every child row, not most of them. Stars, ballots and reports were
        // left behind, so a deleted post kept its Genius Stars and its reports
        // pointed at a row that no longer existed.
        db_exec("DELETE FROM community_posts WHERE postId = ?", [$id]);
        db_exec("DELETE FROM community_reactions WHERE postId = ?", [$id]);
        foreach (db_all("SELECT commentId FROM community_comments WHERE postId = ?", [$id]) as $c) {
            db_exec("DELETE FROM community_reports WHERE targetType = 'comment' AND targetId = ?", [(string)$c['commentId']]);
        }
        db_exec("DELETE FROM community_comments WHERE postId = ?", [$id]);
        db_exec("DELETE FROM community_bookmarks WHERE postId = ?", [$id]);
        db_exec("DELETE FROM community_stars WHERE postId = ?", [$id]);
        db_exec("DELETE FROM community_poll_votes WHERE postId = ?", [$id]);
        db_exec("DELETE FROM community_reports WHERE targetType = 'post' AND targetId = ?", [$id]);
        /* A featured post is on the PUBLIC Showcase, which is a cached read.
         * The admin route invalidates for exactly this reason; the member route
         * never did, so deleting your own featured post left it on the open web
         * for the rest of the TTL. */
        if ($wasFeatured && function_exists('cache_invalidate')) cache_invalidate('community');
    }
    audit('community.delete', $viewer, $id, ['type' => $type], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Public Showcase — mentor-featured, published posts only. Read-only,
 *  PII-safe (first name only), no comments, no interaction. This is the ONLY
 *  community content that ever leaves the members' walled garden. */
function community_showcase(array $p): array {
    community_ensure_channels();
    $rows = db_all("SELECT * FROM community_posts WHERE featured = 1 AND status = 'published' ORDER BY updatedAt DESC LIMIT 12");
    $out = [];
    foreach ($rows as $r) {
        /* Featuring a post is a MENTOR'S editorial decision. It is not a
         * guardian's consent decision, and this endpoint is public — so being
         * featured was, on its own, enough to publish a child's first name and
         * whatever photograph or video they had uploaded to the open web.
         *
         * The summer board withholds exactly that data for exactly that child
         * until a guardian grants it. The same rule applies here now: a mentor
         * can choose what is worth showing, but not who may be named or
         * pictured. */
        $grants = consent_may_publish((string)$r['authorId']);
        $first = $grants['mayName']
            ? (explode(' ', trim((string)$r['authorName']))[0] ?? 'A member')
            : 'A member';
        $mediaUrl = $grants['mayPhoto'] ? (string)$r['mediaUrl'] : '';
        // A media post stripped of its media is an empty card. Drop it rather
        // than publish a caption with a hole where the work used to be.
        if ($mediaUrl === '' && trim((string)$r['body']) === '') continue;
        $ch = db_row("SELECT name, color, icon FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$r['channelId']]);
        $out[] = [
            'postId' => (string)$r['postId'],
            'channel' => ['name' => (string)($ch['name'] ?? ''), 'color' => (string)($ch['color'] ?? '#3b5bdb'), 'icon' => (string)($ch['icon'] ?? '')],
            'author' => $first, 'body' => (string)$r['body'],
            'mediaType' => $mediaUrl === '' ? '' : (string)$r['mediaType'],
            'mediaUrl' => $mediaUrl,
            'mediaPoster' => $mediaUrl === '' ? '' : (string)$r['mediaPoster'],
            'altText' => (string)$r['altText'],
        ];
    }
    return ['ok' => true, 'showcase' => $out];
}

/** AI "Catch me up" — a short digest of a channel's recent activity. */
/**
 * community.digest — "Catch me up": this member's UNREAD posts, by the same
 * rule as the Unread filter (published, not their own, newer than their last
 * read of that channel). One line per post, so each opens its post; when an
 * AI is configured it adds one summary sentence on top (first names only).
 *
 * It used to summarise the last 25 posts of the whole community whoever was
 * asking, and with an AI configured it showed the word "Array": ai_complete
 * returns an array, which was cast to a string.
 */
function community_digest(array $p): array {
    community_ensure_channels();
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $chSlug = (string)($p['channel'] ?? 'all');
    $where = "cp.status = 'published' AND cp.authorId <> ? AND cp.createdAt > COALESCE((SELECT r.lastReadAt FROM community_reads r WHERE r.memberId = ? AND r.channelId = cp.channelId), '')";
    $args = [$viewer, $viewer];
    if ($chSlug !== 'all' && $chSlug !== '') {
        $c = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$chSlug]);
        if (!$c) return ['ok' => false, 'error' => 'not_found'];
        $where .= ' AND cp.channelId = ?'; $args[] = (string)$c['channelId'];
    }
    $total = (int)(db_row("SELECT COUNT(*) c FROM community_posts cp WHERE $where", $args)['c'] ?? 0);
    if (!$total) return ['ok' => true, 'digest' => 'You’re up to date: nothing new since you last looked.', 'items' => [], 'total' => 0, 'ai' => false];
    $rows = db_all("SELECT cp.postId, cp.authorName, cp.body, cp.kind, cp.mediaType, ch.name AS chName FROM community_posts cp
                    LEFT JOIN community_channels ch ON ch.channelId = cp.channelId WHERE $where ORDER BY cp.createdAt DESC LIMIT 25", $args);
    $chans = count(array_unique(array_map(fn($r) => (string)$r['chName'], $rows)));
    $what = static function (array $r): string {
        $b = trim(preg_replace('/\s+/u', ' ', (string)$r['body']));
        if ($b !== '') return mb_strlen($b) > 90 ? rtrim(mb_substr($b, 0, 88)) . '…' : $b;
        return ['photo' => 'shared a photo', 'image' => 'shared a photo', 'video' => 'shared a video', 'doc' => 'shared a document', 'code' => 'shared some code'][(string)$r['mediaType']] ?? 'posted';
    };
    $first = static fn($n) => explode(' ', trim((string)$n))[0] ?: 'Someone';
    $items = array_map(fn($r) => ['postId' => (string)$r['postId'], 'line' => $first($r['authorName']) . ' in ' . ((string)$r['chName'] ?: 'the community') . ': ' . $what($r)], array_slice($rows, 0, 6));
    $intro = $total . ($total === 1 ? ' new post' : ' new posts') . ' since you last looked' . ($chans > 1 ? ', in ' . $chans . ' channels' : '') . '.';
    $ai = false;
    if (function_exists('ai_enabled') && ai_enabled('analysis') && function_exists('ai_complete')) {
        $feed = '';
        foreach ($rows as $r) $feed .= '- ' . $first($r['authorName']) . ' (' . (string)$r['chName'] . '): ' . mb_substr(trim((string)$r['body']), 0, 200) . "\n";
        $r = ai_complete("You catch up a young person on their club's community feed. In ONE warm sentence of at most 30 words, say what people have been sharing. First names only. No markdown, no emojis.", $feed, 90, 'analysis');
        $line = !empty($r['ok']) ? trim(preg_replace('/\s+/u', ' ', (string)($r['text'] ?? ''))) : '';
        if ($line !== '') { $intro = $intro . ' ' . mb_substr($line, 0, 240); $ai = true; }
    }
    return ['ok' => true, 'digest' => $intro, 'items' => $items, 'total' => $total, 'more' => max(0, $total - count($items)), 'ai' => $ai];
}

/* ── Admin ────────────────────────────────────────────────────────────── */

function admin_community_overview(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    community_ensure_channels();
    $rows = db_all("SELECT * FROM community_channels ORDER BY pinned DESC, sortOrder ASC, name ASC");
    $totals = [];
    foreach (db_all("SELECT channelId, COUNT(*) c FROM community_posts GROUP BY channelId") as $t) $totals[(string)$t['channelId']] = (int)$t['c'];
    $channels = array_map(function ($c) use ($totals) {
        $base = community_channel_public($c);
        $base['status'] = (string)$c['status'];
        $base['sortOrder'] = (int)$c['sortOrder'];
        $base['total'] = $totals[(string)$c['channelId']] ?? 0;
        return $base;
    }, $rows);
    $pendingPosts = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE status = 'pending'")['c'] ?? 0);
    $pendingComments = (int)(db_row("SELECT COUNT(*) c FROM community_comments WHERE status = 'pending'")['c'] ?? 0);
    // Reported comments count toward the badge now that they can be seen.
    $reported = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE reportCount > 0 AND status <> 'removed'")['c'] ?? 0)
              + (int)(db_row("SELECT COUNT(*) c FROM community_comments WHERE reportCount > 0 AND status <> 'removed'")['c'] ?? 0);
    /* Open safeguarding cases are counted separately and never folded into the
     * moderation badge. "Four things to review" and "a child said something
     * about hurting themselves" are not the same queue and must not read as
     * one number. */
    $safeguarding = (int)(db_row("SELECT COUNT(*) c FROM community_safeguarding WHERE status = 'open'")['c'] ?? 0);
    return ['ok' => true, 'channels' => $channels,
            'moderation' => community_moderation_mode(),
            'safeguarding' => $safeguarding,
            'pending' => ['posts' => $pendingPosts, 'comments' => $pendingComments, 'reported' => $reported]];
}

/**
 * Set how hard the feed is moderated.
 *
 * Super admin only, and audited, because it changes what children can put in
 * front of each other without an adult seeing it first. That is not a
 * preference like a channel colour, and it should be answerable later — "who
 * turned this off, and when" is the first question after an incident.
 *
 * Releasing the backlog is deliberate. Loosening the setting while leaving
 * yesterday's held posts sitting in the queue is the shape of a bug: staff
 * change the mode, assume it applied, and a child's post stays invisible for
 * days. So going to `flag` or `off` publishes what was waiting, and says how
 * many.
 */
function admin_community_moderation_set(array $p): array {
    if (!admin_is_super($p)) return ['ok' => false, 'error' => 'forbidden'];
    $mode = strtolower(trim((string)($p['mode'] ?? '')));
    if (!in_array($mode, ['strict', 'flag', 'off'], true)) return ['ok' => false, 'error' => 'bad_mode'];
    $was = community_moderation_mode();
    /* Stored as an OBJECT, not the bare string. setting_set writes the value
     * verbatim but setting_get pipes it through safe_json, which returns null
     * for anything that is not an array — so a scalar setting silently reads
     * back as "never set". Wrapping it round-trips through both. */
    setting_set('community_moderation', ['mode' => $mode], (string)($p['requesterId'] ?? ''));

    $released = 0;
    if ($mode !== 'strict') {
        /* Text held only by the screen is released. A held VIDEO is not: frames
         * are not the whole clip, so nobody has actually looked at it yet, and
         * publishing it here would be the one case where relaxing a setting put
         * genuinely unreviewed footage in front of children. Staff clear those
         * from the queue by hand. */
        $rows = db_all("SELECT postId FROM community_posts WHERE status = 'pending' AND mediaType <> 'video'");
        foreach ($rows as $r) {
            /* MAX, not 1. This assigned the literal, so a post six children had
             * already reported was written back as having one — and the queue
             * sorts by reportCount DESC, so releasing the backlog demoted its
             * most-reported item to the bottom of the list. The flag is meant
             * to ADD "somebody should look at this", never to replace it. */
            db_exec("UPDATE community_posts SET status = 'published', reportCount = CASE WHEN reportCount > 1 THEN reportCount ELSE 1 END, updatedAt = ? WHERE postId = ?",
                    [now_iso(), (string)$r['postId']]);
            community_post_on_published((string)$r['postId']);
            $released++;
        }
        foreach (db_all("SELECT commentId FROM community_comments WHERE status = 'pending'") as $c) {
            db_update('community_comments', ['status' => 'published'], ['commentId' => (string)$c['commentId']]);
            community_comment_on_published((string)$c['commentId']);
            $released++;
        }
    }
    audit('community.moderation', (string)($p['requesterId'] ?? ''), 'community',
          ['from' => $was, 'to' => $mode, 'released' => $released], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'mode' => $mode, 'was' => $was, 'released' => $released,
            'videosStillHeld' => (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE status = 'pending' AND mediaType = 'video'")['c'] ?? 0)];
}

/**
 * The open safeguarding cases, newest first.
 *
 * A separate screen from the moderation queue on purpose. Moderation is about
 * whether a message belongs in the feed; this is about a child. Folding them
 * together would let "approve, approve, approve" run straight past a disclosure.
 */
/* Safeguarding cases are for trained leads, the `safeguarding` capability —
 * never `content`. Editing the feed and reading what a child disclosed are
 * different trusts (CLAUDE.md §4: such caps are granted per person). */
function admin_community_safeguarding(array $p): array {
    $g = admin_cap_gate($p, 'safeguarding'); if (!$g['ok']) return $g;
    $st = (string)($p['status'] ?? 'open');
    if (!in_array($st, ['open', 'acknowledged', 'closed', 'all'], true)) $st = 'open';
    // "Open" is every case not yet dealt with, including one a lead has taken.
    $where = $st === 'all' ? '1=1' : ($st === 'open' ? "status IN ('open','in_progress')" : 'status = ?');
    $args  = $st === 'all' || $st === 'open' ? [] : [$st];
    $rows = db_all("SELECT * FROM community_safeguarding WHERE $where ORDER BY createdAt DESC LIMIT 200", $args);
    return ['ok' => true, 'cases' => array_map(fn($r) => [
        'caseId' => (string)$r['caseId'], 'author' => (string)$r['authorName'], 'authorId' => (string)$r['authorId'],
        'surface' => (string)$r['surface'], 'channel' => (string)($r['channelSlug'] ?? ''),
        'body' => (string)$r['body'], 'status' => (string)$r['status'],
        'acknowledgedBy' => (string)($r['acknowledgedBy'] ?? ''), 'acknowledgedAt' => (string)($r['acknowledgedAt'] ?? ''),
        'createdAt' => (string)$r['createdAt'],
        'severity' => (string)($r['severity'] ?? 'high') ?: 'high', 'leadId' => (string)($r['leadId'] ?? ''), 'leadName' => (string)($r['leadName'] ?? ''),
        'postId' => (string)($r['postId'] ?? ''), 'source' => (string)($r['source'] ?? 'screen') ?: 'screen', 'note' => (string)($r['note'] ?? ''),
        'mine' => (string)($r['leadId'] ?? '') === (string)$g['requester']['memberId'],
    ], $rows)];
}

/** Mark a safeguarding case as seen and acted on. Audited — "who saw this, and
 *  when" is the first question after an incident. */
function admin_community_safeguarding_ack(array $p): array {
    $g = admin_cap_gate($p, 'safeguarding'); if (!$g['ok']) return $g;
    $caseId = (string)($p['caseId'] ?? '');
    $by = (string)($g['requester']['memberId'] ?? '');
    if (!db_row("SELECT id FROM community_safeguarding WHERE caseId = ?", [$caseId])) return ['ok' => false, 'error' => 'not_found'];
    db_update('community_safeguarding', ['status' => 'acknowledged', 'acknowledgedBy' => $by, 'acknowledgedAt' => now_iso()], ['caseId' => $caseId]);
    audit('community.safeguarding.ack', $by, $caseId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_community_channel_upsert(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $name = mb_substr(trim((string)($d['name'] ?? '')), 0, 120);
    if (mb_strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name'];
    $id = (string)($d['channelId'] ?? '');
    $existing = $id !== '' ? db_row("SELECT * FROM community_channels WHERE channelId = ?", [$id]) : null;
    $slug = centre_slugify((string)($d['slug'] ?? '') !== '' ? (string)$d['slug'] : $name) ?: 'channel';
    $n = 2; $base = $slug;
    while (db_row("SELECT channelId FROM community_channels WHERE slug = ? AND channelId <> ?", [$slug, $id ?: '—'])) { $slug = $base . '-' . $n; $n++; }
    $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string)($d['color'] ?? '')) ? (string)$d['color'] : '#3b5bdb';
    $kind = (string)($d['kind'] ?? 'course'); if (!in_array($kind, ['course', 'commons', 'centre', 'topic'], true)) $kind = 'course';
    $status = (string)($d['status'] ?? 'active'); if (!in_array($status, ['active', 'archived'], true)) $status = 'active';
    $row = [
        'name' => $name, 'slug' => $slug, 'color' => $color, 'kind' => $kind,
        'faculty' => mb_substr(trim((string)($d['faculty'] ?? '')), 0, 120),
        'icon' => mb_substr(trim((string)($d['icon'] ?? '')), 0, 12),
        'description' => mb_substr(trim((string)($d['description'] ?? '')), 0, 400),
        'rules' => mb_substr(trim((string)($d['rules'] ?? '')), 0, 1200),
        'sortOrder' => (int)($d['sortOrder'] ?? 0), 'pinned' => !empty($d['pinned']) ? 1 : 0,
        'status' => $status,
        'updatedAt' => now_iso(),
    ];
    if ($existing) db_update('community_channels', $row, ['channelId' => $id]);
    else { $id = 'CH-' . strtoupper(rand_hex(5)); db_insert('community_channels', $row + ['channelId' => $id, 'createdAt' => now_iso()]); }
    audit('community.channel.upsert', (string)($g['requester']['memberId'] ?? ''), $id, ['slug' => $slug], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'channelId' => $id];
}

function admin_community_queue(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $filter = (string)($p['status'] ?? 'pending');
    $st = in_array($filter, ['pending', 'published', 'hidden', 'removed', 'reported', 'all', 'queue'], true) ? $filter : 'pending';
    /* `queue` is the v3 moderation queue: everything a person has to decide —
     * held, waiting video, or published and reported. */
    if ($st === 'queue') { $postWhere = "status = 'pending' OR (reportCount > 0 AND status = 'published')"; $postArgs = []; }
    elseif ($st === 'reported') { $postWhere = "reportCount > 0 AND status <> 'removed'"; $postArgs = []; }
    elseif ($st === 'all') { $postWhere = "status <> 'removed'"; $postArgs = []; }
    else { $postWhere = "status = ?"; $postArgs = [$st]; }
    $postRows = db_all("SELECT * FROM community_posts WHERE $postWhere ORDER BY reportCount DESC, createdAt DESC LIMIT 100", $postArgs);

    /* Reported COMMENTS had nowhere to appear: this asked for status='reported',
     * which the moderation map (published|hidden|removed) never writes, so the
     * list was empty by construction on the one filter a moderator opens when a
     * child has told them something is wrong. Comments now carry reportCount
     * exactly as posts do, and the 'reported' filter reads it. */
    if ($st === 'queue')     { $cWhere = "status = 'pending' OR (reportCount > 0 AND status = 'published')"; $cArgs = []; }
    elseif ($st === 'reported')  { $cWhere = "reportCount > 0 AND status <> 'removed'"; $cArgs = []; }
    elseif ($st === 'all')   { $cWhere = "status <> 'removed'"; $cArgs = []; }
    else                     { $cWhere = "status = ?"; $cArgs = [$st]; }
    $commentRows = db_all("SELECT * FROM community_comments WHERE $cWhere ORDER BY reportCount DESC, createdAt DESC LIMIT 100", $cArgs);

    /* And the reasons. community_reports has been collecting the sentence a
     * reporter types since schema v49 and no screen has ever read it — the
     * whole table was write-only apart from its own duplicate check. A count
     * tells a moderator that something is wrong; only the reason tells them
     * what. Fetched in one query for the whole page rather than per row. */
    $reports = community_reports_for(
        array_map(fn($r) => (string)$r['postId'], $postRows),
        array_map(fn($r) => (string)$r['commentId'], $commentRows));

    $chans = [];
    foreach (db_all('SELECT channelId, slug, name, color FROM community_channels') as $c) $chans[(string)$c['channelId']] = $c;
    $posts = array_map(function ($r) use ($reports, $chans) {
        $ch = $chans[(string)$r['channelId']] ?? null;
        [$qk, $why] = cm3_queue_kind($r);
        return [
            'kind' => $qk, 'why' => $why, 'authorKey' => cm3_key((string)$r['authorId']), 'channelSlug' => (string)($ch['slug'] ?? ''),
            'postId' => (string)$r['postId'], 'author' => (string)$r['authorName'], 'centre' => (string)$r['authorCentre'],
            'channel' => (string)($ch['name'] ?? ''), 'color' => (string)($ch['color'] ?? '#3b5bdb'),
            'body' => (string)$r['body'], 'mediaType' => (string)$r['mediaType'], 'mediaUrl' => (string)$r['mediaUrl'], 'mediaPoster' => (string)$r['mediaPoster'],
            'status' => (string)$r['status'], 'pinned' => (int)$r['pinned'] === 1, 'featured' => (int)($r['featured'] ?? 0) === 1,
            'reportCount' => (int)($r['reportCount'] ?? 0), 'createdAt' => (string)$r['createdAt'],
            'reports' => $reports['post'][(string)$r['postId']] ?? [],
            'moderation' => json_decode((string)($r['moderation'] ?? ''), true) ?: null,
        ];
    }, $postRows);
    $comments = array_map(fn($r) => [
        'kind' => (string)$r['status'] === 'pending' ? 'held' : 'reported',
        'why' => (string)$r['status'] === 'pending' ? ((json_decode((string)($r['moderation'] ?? ''), true) ?: [])['why'] ?? '' ?: 'The screen was unsure about this reply.') : 'Reported by ' . (int)$r['reportCount'] . ((int)$r['reportCount'] === 1 ? ' member.' : ' members.'),
        'authorKey' => cm3_key((string)$r['memberId']),
        'commentId' => (string)$r['commentId'], 'postId' => (string)$r['postId'], 'name' => (string)$r['memberName'],
        'body' => (string)$r['body'], 'status' => (string)$r['status'], 'createdAt' => (string)$r['createdAt'],
        'reportCount' => (int)($r['reportCount'] ?? 0),
        'reports' => $reports['comment'][(string)$r['commentId']] ?? [],
    ], $commentRows);
    return ['ok' => true, 'posts' => $posts, 'comments' => $comments];
}

/**
 * The reports behind a page of queue rows, keyed by target.
 *
 * One query per surface for the whole page, not one per row: a moderator
 * opening the queue should not cost 200 round trips to learn that two things
 * were reported. Reporter names go through the same first-name-plus-initial
 * rule as everything else the community shows.
 */
function community_reports_for(array $postIds, array $commentIds): array {
    $out = ['post' => [], 'comment' => []];
    foreach (['post' => $postIds, 'comment' => $commentIds] as $type => $ids) {
        $ids = array_values(array_filter(array_unique($ids), fn($i) => $i !== ''));
        if (!$ids) continue;
        $in = implode(',', array_fill(0, count($ids), '?'));
        $rows = db_all("SELECT targetId, memberId, reason, createdAt FROM community_reports
                         WHERE targetType = ? AND targetId IN ($in) ORDER BY createdAt DESC LIMIT 400",
                       array_merge([$type], $ids));
        foreach ($rows as $r) {
            $who = community_author((string)$r['memberId']);
            $out[$type][(string)$r['targetId']][] = [
                'by' => trim($who['name'] . ($who['initial'] ? ' ' . $who['initial'] : '')) ?: 'A member',
                'reason' => (string)$r['reason'],
                'at' => (string)$r['createdAt'],
            ];
        }
    }
    return $out;
}

/**
 * Tell a member their post or reply was hidden or removed — once, kindly, in
 * the app, with what to do next. "Hide with a kind note" promised this and
 * sent nothing, and the post still looked live to its author. Never says who
 * reported it.
 */
function community_moderation_told(string $memberId, string $by, string $what, string $act, string $note, string $ref): void {
    if ($memberId === '') return;
    $note = trim(mb_substr($note, 0, 300));
    $title = $act === 'hide' ? 'A mentor hid your ' . $what : 'Your ' . $what . ' was taken down';
    $body = $act === 'hide'
        ? ($note !== '' ? $note . ' ' : 'Something in it needs another look before others see it. ') . 'Only you can see it now. You can delete it and post again, or ask your mentor about it.'
        : ($note !== '' ? $note . ' ' : 'It broke one of the community rules. ') . 'If you think this was a mistake, talk to your mentor.';
    community_notify($memberId, $by, 'community.moderated', $title, $body, false, $ref);
}

function admin_community_moderate(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $kind = (string)($p['kind'] ?? 'post');
    $act = (string)($p['action'] ?? '');
    $by = (string)($g['requester']['memberId'] ?? '');
    $now = now_iso();
    if ($kind === 'comment') {
        $cid = (string)($p['id'] ?? '');
        $map = ['approve' => 'published', 'hide' => 'hidden', 'remove' => 'removed'];
        if (!isset($map[$act])) return ['ok' => false, 'error' => 'bad_action'];
        db_update('community_comments', ['status' => $map[$act], 'moderatedBy' => $by, 'moderatedAt' => $now, 'reviewedAt' => $now]
            + ($act === 'approve' ? ['reportCount' => 0] : []), ['commentId' => $cid]);
        // Approving is what makes a reply real, so it owes the post's author
        // the notification the create path would have sent. Stamped once.
        if ($map[$act] === 'published') community_comment_on_published($cid);
        // The author is told, kindly and without the detail; the moderator's toast promised it.
        if ($act === 'hide' || $act === 'remove') { $c = db_row('SELECT memberId FROM community_comments WHERE commentId = ?', [$cid]); if ($c) community_moderation_told((string)$c['memberId'], $by, 'reply', $act, (string)($p['note'] ?? ''), $cid); }
        audit('community.moderate.comment', $by, $cid, ['action' => $act], (string)($p['ip'] ?? ''));
        return ['ok' => true];
    }
    $pid = (string)($p['id'] ?? '');
    $extra = cm3_moderate_extra($g, $act, $pid, $p);
    if ($extra !== null) return $extra;
    if ($act === 'pin' || $act === 'unpin') {
        db_update('community_posts', ['pinned' => $act === 'pin' ? 1 : 0, 'updatedAt' => $now], ['postId' => $pid]);
    } elseif ($act === 'feature' || $act === 'unfeature') {
        db_update('community_posts', ['featured' => $act === 'feature' ? 1 : 0, 'updatedAt' => $now], ['postId' => $pid]);
        if ($act === 'feature') { $o = db_row("SELECT authorId FROM community_posts WHERE postId = ?", [$pid]); if ($o) community_notify((string)$o['authorId'], $by, 'community.featured', 'Your post is on the public Showcase ✨', 'A mentor featured your post — it now shines on the public NGG Showcase.', true, $pid); }
    } else {
        $map = ['approve' => 'published', 'hide' => 'hidden', 'remove' => 'removed'];
        if (!isset($map[$act])) return ['ok' => false, 'error' => 'bad_action'];
        db_update('community_posts', ['status' => $map[$act], 'updatedAt' => $now, 'reviewedAt' => $now, 'reviewedBy' => $by]
            + ($act === 'approve' ? ['reportCount' => 0] : []), ['postId' => $pid]);
        // @mentions, the document mirror and the link preview all belong to
        // "this post is now visible", which is exactly what approve means.
        if ($map[$act] === 'published') community_post_on_published($pid);
        if ($act === 'hide' || $act === 'remove') { $o = db_row('SELECT authorId FROM community_posts WHERE postId = ?', [$pid]); if ($o) community_moderation_told((string)$o['authorId'], $by, 'post', $act, (string)($p['note'] ?? ''), $pid); }
    }
    audit('community.moderate.post', $by, $pid, ['action' => $act], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Typing (handoff §12) ───────────────────────────────────────────────────
 *
 * "Presence & typing in the channel subtitle — 'Coach Bisi is typing…', green,
 *  replacing the static member count only while someone types."
 *
 * The shape of this is decided by where it runs. Shared hosting cannot hold a
 * websocket open, so there is no push; it is a poll, and a poll's whole cost is
 * how often it runs. Hence:
 *
 *   · The client pings only while somebody is ACTUALLY typing — not while the
 *     channel is merely open — and at most once every COMMUNITY_TYPING_PING
 *     seconds, so a fast typist costs one small write every three seconds and a
 *     reader costs none at all.
 *   · A row is live for COMMUNITY_TYPING_TTL seconds. Nothing has to stop
 *     typing; it simply stops being true.
 *   · Reads sweep expired rows as they go, so there is no cron and no table
 *     that grows. A keystroke by a child is never a record.
 */
const COMMUNITY_TYPING_TTL  = 8;    // a row means "typing" for this long
const COMMUNITY_TYPING_PING = 3;    // the client may not write faster than this

/** Say that this member is typing in this channel. Idempotent within the TTL. */
function community_typing_ping(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $slug   = (string)($p['channel'] ?? '');
    if ($viewer === '' || $slug === '') return ['ok' => false, 'error' => 'forbidden'];
    $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? AND status = 'active' LIMIT 1", [$slug]);
    if (!$ch) return ['ok' => true];
    $cid = (string)$ch['channelId'];
    $now = now_iso();

    $name = community_display_name($viewer);
    $row = db_row("SELECT id, atIso FROM community_typing WHERE channelId = ? AND memberId = ?", [$cid, $viewer]);
    if ($row) {
        /* Rewriting the same second over and over is pure write load for no
           information. One update per ping interval is enough to keep a row
           alive, because the TTL is longer than the interval. */
        $age = time() - (int)strtotime(str_replace(' ', 'T', (string)$row['atIso']));
        if ($age < COMMUNITY_TYPING_PING) return ['ok' => true];
        db_update('community_typing', ['atIso' => $now, 'memberName' => $name], ['channelId' => $cid, 'memberId' => $viewer]);
    } else {
        db_insert('community_typing', ['channelId' => $cid, 'memberId' => $viewer, 'memberName' => $name,
                                       'staff' => community_actor_is_staff($viewer) ? 1 : 0, 'atIso' => $now]);
    }
    return ['ok' => true];
}

/** Stop immediately — on send, on blur, on leaving the channel. */
function community_typing_stop(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $slug   = (string)($p['channel'] ?? '');
    if ($viewer === '' || $slug === '') return ['ok' => true];
    $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$slug]);
    if ($ch) db_exec("DELETE FROM community_typing WHERE channelId = ? AND memberId = ?", [(string)$ch['channelId'], $viewer]);
    return ['ok' => true];
}

/**
 * Who is typing in this channel, right now, excluding the reader.
 *
 * Returns the SENTENCE as well as the names, because "Coach Bisi is typing…"
 * and "Bisi and Zara are typing…" and "3 people are typing…" are three
 * different strings and the rule for picking between them belongs in one place
 * rather than in every client that renders it.
 */
function community_typing_who(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $slug   = (string)($p['channel'] ?? '');
    $ch = $slug !== '' ? db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$slug]) : null;
    if (!$ch) return ['ok' => true, 'typing' => [], 'says' => ''];
    $cid = (string)$ch['channelId'];

    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - COMMUNITY_TYPING_TTL);
    // Sweep on the way past: no cron, and the table cannot grow.
    db_exec("DELETE FROM community_typing WHERE channelId = ? AND atIso < ?", [$cid, $cut]);

    $names = [];
    foreach (db_all("SELECT memberId, memberName FROM community_typing
                      WHERE channelId = ? AND atIso >= ? ORDER BY atIso ASC", [$cid, $cut]) as $r) {
        if ((string)$r['memberId'] === $viewer) continue;    // you know that you are typing
        $n = trim((string)$r['memberName']);
        if ($n !== '') $names[] = $n;
    }
    return ['ok' => true, 'typing' => $names, 'says' => community_typing_says($names)];
}

/** The subtitle sentence. Two names, then a count — never a wall of names. */
function community_typing_says(array $names): string {
    $n = count($names);
    if ($n === 0) return '';
    if ($n === 1) return $names[0] . ' is typing…';
    if ($n === 2) return $names[0] . ' and ' . $names[1] . ' are typing…';
    return $n . ' people are typing…';
}

/** A person's name as the community shows it, for members and card-holders alike. */
function community_display_name(string $id): string {
    if (($t = community_staff_name($id)) !== null) return $t;
    /* A child is "Ada N." here as on every post — the typing line is read by
       the whole channel, and a full name is more than the feed ever shows. */
    $short = static function (string $full): string {
        $p = preg_split('/\s+/', trim($full)) ?: [];
        return trim(($p[0] ?? '') . (isset($p[1]) && $p[1] !== '' ? ' ' . mb_strtoupper(mb_substr($p[1], 0, 1)) . '.' : ''));
    };
    $m = db_row("SELECT fullName FROM members WHERE memberId = ? LIMIT 1", [$id]);
    if ($m) return $short((string)$m['fullName']);
    $s = db_row("SELECT fullName FROM summer_students WHERE studentId = ? LIMIT 1", [$id]);
    if ($s) return $short((string)$s['fullName']);
    /* Falls back to whatever they last posted under rather than to an id — a
       subtitle that says "NGG-2025-0007 is typing…" is worse than silence. */
    $p = db_row("SELECT authorName FROM community_posts WHERE authorId = ? ORDER BY createdAt DESC LIMIT 1", [$id]);
    return (string)($p['authorName'] ?? '');
}
