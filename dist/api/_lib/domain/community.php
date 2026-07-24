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
function student_community_login(array $p): array {
    $token = trim((string)($p['token'] ?? ''));
    $idIn = trim((string)($p['displayId'] ?? ''));
    $phone = preg_replace('/\D/', '', (string)($p['guardianPhone'] ?? ''));
    $stu = null;
    if ($token !== '') {
        $q = db_row("SELECT studentId FROM qr_codes WHERE token = ? LIMIT 1", [$token]);
        $sid = (string)($q['studentId'] ?? '');
        if ($sid !== '') $stu = db_row("SELECT * FROM summer_students WHERE studentId = ? AND status = 'active' LIMIT 1", [$sid]);
        if (!$stu) $stu = db_row("SELECT * FROM summer_students WHERE token = ? AND status = 'active' LIMIT 1", [$token]);
    } elseif ($idIn !== '' && strlen($phone) >= 7) {
        $cand = db_row("SELECT * FROM summer_students WHERE (displayId = ? OR studentId = ?) AND status = 'active' LIMIT 1", [$idIn, $idIn]);
        if ($cand) {
            $g = preg_replace('/\D/', '', (string)($cand['guardianPhone'] ?? ''));
            $tail = fn($a, $b) => strlen($a) >= 7 && strlen($b) >= 7 && (substr($a, -7) === substr($b, -7));
            if ($g !== '' && $tail($g, $phone)) $stu = $cand;
        }
    }
    if (!$stu) return ['ok' => false, 'error' => 'bad_credentials'];
    return ['ok' => true, 'student' => $stu];
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
    foreach (academy_catalogue() as $faculty => $courses) {
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

/** Channel row → public shape with a live post count. */
function community_channel_public(array $c): array {
    $posts = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE channelId = ? AND status = 'published'", [(string)$c['channelId']])['c'] ?? 0);
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

function community_channels(array $p): array {
    community_ensure_channels();
    $viewer = (string)($p['memberId'] ?? '');
    $rows = db_all("SELECT * FROM community_channels WHERE status = 'active' ORDER BY pinned DESC, sortOrder ASC, name ASC");
    $channels = array_map(function ($c) use ($viewer) {
        $base = community_channel_public($c);
        $base['unread'] = community_channel_unread((string)$c['channelId'], $viewer);
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
    $members = [];
    foreach ($rows as $r) {
        // Tag staff (mentors/admins) so the rail can group them.
        $mm = db_row("SELECT role FROM members WHERE memberId = ? LIMIT 1", [(string)$r['authorId']]);
        $role = strtolower((string)($mm['role'] ?? ''));
        $staff = $mm && ($role === 'mentor' || $role === 'staff' || $role === 'coordinator' || is_admin_role($role));
        $members[] = ['name' => (string)$r['authorName'], 'centre' => (string)$r['authorCentre'], 'posts' => (int)$r['posts'], 'staff' => $staff, 'photo' => community_photo_for((string)$r['authorId'])];
    }
    return ['ok' => true, 'members' => $members, 'count' => count($members)];
}

/** Search published posts by text (whole community or one channel). */
function community_search(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $q = trim((string)($p['q'] ?? ''));
    if (mb_strlen($q) < 2) return ['ok' => true, 'posts' => []];
    $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
    $args = [$like]; $where = "status = 'published' AND body LIKE ?";
    $chSlug = (string)($p['channel'] ?? 'all');
    if ($chSlug !== 'all' && $chSlug !== '' && $chSlug !== 'bookmarks') {
        $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$chSlug]);
        if ($ch) { $where .= " AND channelId = ?"; $args[] = (string)$ch['channelId']; }
    }
    $rows = db_all("SELECT * FROM community_posts WHERE $where ORDER BY createdAt DESC LIMIT 30", $args);
    return ['ok' => true, 'posts' => array_map(fn($r) => community_post_shape($r, $viewer), $rows)];
}

/* ── Attribution (PII-safe: first name + last initial only) ───────────── */

function community_author(string $memberId): array {
    $m = db_row("SELECT fullName, centre FROM members WHERE memberId = ? LIMIT 1", [$memberId]);
    if (!$m) $m = db_row("SELECT fullName, centre FROM summer_students WHERE studentId = ? LIMIT 1", [$memberId]); // student sessions
    $full = trim((string)($m['fullName'] ?? '')) ?: 'Member';
    $parts = preg_split('/\s+/', $full) ?: [];
    $first = $parts[0] ?? 'Member';
    $initial = count($parts) > 1 ? strtoupper(substr((string)end($parts), 0, 1)) . '.' : '';
    return ['name' => $first, 'initial' => $initial, 'centre' => (string)($m['centre'] ?? '')];
}

/** A member's / student's profile photo URL (empty if none). */
function community_photo_for(string $id): string {
    if ($id === '') return '';
    $r = db_row("SELECT photoUrl FROM members WHERE memberId = ? LIMIT 1", [$id]);
    if (!$r) $r = db_row("SELECT photoUrl FROM summer_students WHERE studentId = ? LIMIT 1", [$id]);
    return (string)($r['photoUrl'] ?? '');
}

/* ── Safeguarding screen ──────────────────────────────────────────────── */

/**
 * Screen a piece of UGC text. Returns ['verdict'=>'ok'|'review'|'block',
 * 'reason'=>string, 'crisis'=>bool]. Crisis (self-harm/abuse) always blocks
 * with a safeguarding signal, regardless of whether AI is configured.
 */
function community_screen(string $text): array {
    $text = trim($text);
    if ($text === '') return ['verdict' => 'ok', 'reason' => '', 'crisis' => false];
    if (function_exists('coach_is_crisis') && coach_is_crisis($text)) {
        return ['verdict' => 'block', 'reason' => 'safeguarding', 'crisis' => true];
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
function community_notify(string $memberId, string $actorId, string $kind, string $title, string $body, bool $email = true): void {
    if ($memberId === '' || $memberId === $actorId) return;
    // Recipients may be full members OR summer students (the community serves both).
    $member = db_row("SELECT memberId, fullName, email FROM members WHERE memberId = ? LIMIT 1", [$memberId]);
    if (!$member && !db_row("SELECT studentId FROM summer_students WHERE studentId = ? LIMIT 1", [$memberId])) return;
    db_insert('notifications', ['notifId' => 'NT-' . strtoupper(rand_hex(6)), 'memberId' => $memberId, 'kind' => $kind,
        'title' => mb_substr($title, 0, 160), 'body' => mb_substr($body, 0, 400), 'linkPage' => 'community', 'createdAt' => now_iso()]);
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
    $m = db_row("SELECT role FROM members WHERE memberId = ? LIMIT 1", [$actorId]);
    if (!$m) return false;
    $role = strtolower((string)$m['role']);
    return $role !== 'member' && ($role === 'mentor' || $role === 'staff' || $role === 'coordinator' || is_admin_role($role));
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

/* ── Posts ────────────────────────────────────────────────────────────── */

/** Build the client shape of a post for a given viewer. */
function community_post_shape(array $row, string $viewerId): array {
    $pid = (string)$row['postId'];
    $reacts = [];
    foreach (db_all("SELECT emoji, COUNT(*) c FROM community_reactions WHERE postId = ? GROUP BY emoji", [$pid]) as $r) {
        $reacts[(string)$r['emoji']] = (int)$r['c'];
    }
    $mine = $viewerId !== '' ? (db_row("SELECT emoji FROM community_reactions WHERE postId = ? AND memberId = ?", [$pid, $viewerId])['emoji'] ?? '') : '';
    $cAgg = db_row("SELECT COUNT(*) c, MAX(createdAt) last FROM community_comments WHERE postId = ? AND status = 'published'", [$pid]);
    $comments = (int)($cAgg['c'] ?? 0);
    $lastComment = (string)($cAgg['last'] ?? '');
    $booked = $viewerId !== '' && db_row("SELECT id FROM community_bookmarks WHERE postId = ? AND memberId = ?", [$pid, $viewerId]);
    $stars = (int)(db_row("SELECT COUNT(*) c FROM community_stars WHERE postId = ?", [$pid])['c'] ?? 0);
    $starred = $viewerId !== '' && db_row("SELECT id FROM community_stars WHERE postId = ? AND memberId = ?", [$pid, $viewerId]);
    $isMe = (string)$row['authorId'] === $viewerId;
    $ch = db_row("SELECT slug, name, color, icon FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$row['channelId']]);
    $kind = (string)($row['kind'] ?? 'post');
    $poll = null;
    if ($kind === 'poll') { $opts = json_decode((string)($row['pollOptions'] ?? ''), true) ?: []; $poll = community_poll_shape($pid, $opts, $viewerId); }
    return [
        'postId' => $pid, 'kind' => $kind, 'poll' => $poll,
        'channel' => ['slug' => (string)($ch['slug'] ?? ''), 'name' => (string)($ch['name'] ?? 'Channel'), 'color' => (string)($ch['color'] ?? '#3b5bdb'), 'icon' => (string)($ch['icon'] ?? '')],
        'author' => ['name' => (string)$row['authorName'], 'initial' => '', 'centre' => (string)$row['authorCentre'], 'isMe' => $isMe, 'photo' => community_photo_for((string)$row['authorId'])],
        'body' => (string)$row['body'],
        'mediaType' => (string)$row['mediaType'], 'mediaUrl' => (string)$row['mediaUrl'], 'mediaPoster' => (string)$row['mediaPoster'], 'altText' => (string)$row['altText'],
        'linkPreview' => (($lp = json_decode((string)($row['linkPreview'] ?? ''), true)) && is_array($lp) && !empty($lp['title'])) ? $lp : null,
        'status' => (string)$row['status'], 'pinned' => (int)$row['pinned'] === 1, 'featured' => (int)($row['featured'] ?? 0) === 1,
        'reactions' => $reacts, 'myReaction' => (string)$mine, 'commentCount' => $comments, 'lastCommentAt' => $lastComment,
        'stars' => $stars, 'starred' => (bool)$starred, 'canStar' => community_actor_is_staff($viewerId),
        'bookmarked' => (bool)$booked, 'viewCount' => (int)$row['viewCount'],
        'createdAt' => (string)$row['createdAt'],
        'moderationNote' => ((string)$row['status'] !== 'published' && $isMe) ? community_status_note((string)$row['status']) : '',
    ];
}

function community_status_note(string $status): string {
    if ($status === 'pending') return 'In review — a mentor will approve this shortly.';
    if ($status === 'hidden') return 'Hidden by a mentor.';
    if ($status === 'removed') return 'Removed by a mentor.';
    return '';
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
    if ($channel === 'bookmarks') {
        $where[] = "cp.postId IN (SELECT postId FROM community_bookmarks WHERE memberId = ?)";
        $args[] = $viewer;
    } elseif ($channel !== 'all' && $channel !== '') {
        $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$channel]);
        if (!$ch) return ['ok' => true, 'posts' => [], 'hasMore' => false];
        $where[] = "cp.channelId = ?";
        $args[] = (string)$ch['channelId'];
    }
    $whereSql = implode(' AND ', $where);

    // 'trending' ranks by a light engagement score over the last fortnight;
    // 'latest' is pinned-first then newest. Fetch a window and finish in PHP.
    if ($sort === 'trending') {
        $rows = db_all("SELECT cp.*, (SELECT COUNT(*) FROM community_reactions r WHERE r.postId = cp.postId) rc,
                        (SELECT COUNT(*) FROM community_comments c WHERE c.postId = cp.postId AND c.status='published') cc
                        FROM community_posts cp WHERE $whereSql ORDER BY cp.createdAt DESC LIMIT 200", $args);
        usort($rows, fn($a, $b) => (((int)$b['rc'] + (int)$b['cc'] * 2)) <=> (((int)$a['rc'] + (int)$a['cc'] * 2)));
        $slice = array_slice($rows, $page * $limit, $limit + 1);
    } else {
        $slice = db_all("SELECT cp.* FROM community_posts cp WHERE $whereSql ORDER BY cp.pinned DESC, cp.createdAt DESC LIMIT ? OFFSET ?",
            array_merge($args, [$limit + 1, $page * $limit]));
    }
    $hasMore = count($slice) > $limit;
    $slice = array_slice($slice, 0, $limit);
    $posts = array_map(fn($r) => community_post_shape($r, $viewer), $slice);
    return ['ok' => true, 'posts' => $posts, 'hasMore' => $hasMore, 'reactionSet' => COMMUNITY_REACTIONS];
}

/* ── Link previews (server-side unfurl, SSRF-guarded + cached) ─────────── */

function community_extract_url(string $body): string {
    if (preg_match('#\bhttps://[^\s<>"\'\]]+#i', $body, $m)) return rtrim($m[0], '.,;:)]}\'"');
    return '';
}
/** Block private / loopback / link-local hosts so the unfurl can't be pointed
 *  at internal services (SSRF). */
function community_host_is_private(string $host): bool {
    $host = strtolower(trim($host, '.'));
    if ($host === '' || $host === 'localhost') return true;
    if (preg_match('/\.(local|internal|localhost|lan|home|corp|test|invalid|example)$/', $host)) return true;
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        if (!filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return true;
    }
    return false;
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
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
        CURLOPT_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
        CURLOPT_REDIR_PROTOCOLS => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 2,
        CURLOPT_USERAGENT => 'NGG-LinkPreview/1.0 (+https://next.afrovanguard.org.ng)',
        CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml'],
        CURLOPT_WRITEFUNCTION => function ($c, $data) use (&$buf) { $buf .= $data; return strlen($buf) > 524288 ? -1 : strlen($data); },
    ]);
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
    $kind = (string)($d['kind'] ?? 'post') === 'poll' ? 'poll' : 'post';
    $mediaType = in_array((string)($d['mediaType'] ?? 'none'), ['none', 'image', 'video', 'doc'], true) ? (string)($d['mediaType'] ?? 'none') : 'none';
    $mediaUrl = trim((string)($d['mediaUrl'] ?? ''));
    if ($mediaUrl !== '' && !preg_match('#^https://#i', $mediaUrl)) return ['ok' => false, 'error' => 'bad_media'];
    if ($mediaUrl === '') $mediaType = 'none';
    $docName = mb_substr(trim((string)($d['mediaName'] ?? '')), 0, 160);

    // Poll: a question (body) + 2-4 short options; no media.
    $pollOptions = [];
    if ($kind === 'poll') {
        $mediaType = 'none'; $mediaUrl = '';
        foreach ((array)($d['pollOptions'] ?? []) as $o) { $o = mb_substr(trim((string)$o), 0, 80); if ($o !== '') $pollOptions[] = $o; if (count($pollOptions) >= 4) break; }
        if ($body === '') return ['ok' => false, 'error' => 'empty', 'message' => 'A poll needs a question.'];
        if (count($pollOptions) < 2) return ['ok' => false, 'error' => 'poll_options', 'message' => 'A poll needs at least two options.'];
    }
    if ($body === '' && $mediaType === 'none' && $kind !== 'poll') return ['ok' => false, 'error' => 'empty'];

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

    // Safeguarding screen — text (question + poll options), then image/video.
    $screenText = trim($body . ' ' . implode(' ', $pollOptions));
    $screen = community_screen($screenText);
    if ($screen['verdict'] === 'block') {
        return ['ok' => false, 'error' => $screen['crisis'] ? 'crisis' : 'blocked',
            'message' => $screen['crisis'] ? coach_crisis_reply() : 'That post can\'t be shared here — it looks unsafe for this community. A mentor can help if this is a mistake.'];
    }
    $status = $screen['verdict'] === 'review' ? 'pending' : 'published';
    if ($mediaType === 'video') {
        // Best-effort free-tier AI frame check; a bad frame blocks, otherwise it
        // still waits for a mentor (frames aren't the whole clip).
        if (community_screen_video($mediaUrl) === 'block') return ['ok' => false, 'error' => 'blocked', 'message' => 'That video can\'t be shared here.'];
        $status = 'pending';
    }

    $author = community_author($viewer);
    $alt = $mediaType === 'doc' ? ($docName ?: 'Document')
        : ($mediaType === 'image' ? ($body !== '' ? mb_substr($body, 0, 160) : ('Photo shared by ' . $author['name'] . ($author['centre'] ? ' · ' . $author['centre'] : ''))) : '');
    // Link preview — only when there's no other attachment and the post is live.
    $preview = ($mediaType === 'none' && $kind === 'post' && $status === 'published') ? community_unfurl(community_extract_url($body)) : [];
    $id = 'CP-' . strtoupper(rand_hex(6));
    $now = now_iso();
    db_insert('community_posts', [
        'postId' => $id, 'channelId' => (string)$ch['channelId'], 'authorId' => $viewer,
        'authorName' => $author['name'] . ($author['initial'] ? ' ' . $author['initial'] : ''), 'authorCentre' => $author['centre'],
        'body' => $body, 'kind' => $kind, 'pollOptions' => $kind === 'poll' ? json_encode($pollOptions, JSON_UNESCAPED_SLASHES) : '',
        'mediaType' => $mediaType, 'mediaUrl' => $mediaUrl, 'mediaPoster' => trim((string)($d['mediaPoster'] ?? '')),
        'altText' => $alt, 'status' => $status, 'moderation' => json_encode(['verdict' => $screen['verdict'], 'reason' => $screen['reason'], 'by' => 'ai', 'at' => $now], JSON_UNESCAPED_SLASHES),
        'linkPreview' => $preview ? json_encode($preview, JSON_UNESCAPED_SLASHES) : '',
        'viewCount' => 0, 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    audit('community.post', $viewer, $id, ['channel' => $chSlug, 'status' => $status, 'media' => $mediaType, 'kind' => $kind], (string)($p['ip'] ?? ''));
    if ($status === 'published') community_notify_mentions($body, $viewer, $author['name'], $id, (string)$ch['channelId']);
    // Mirror shared documents to a configured Drive integration (any drive:
    // Google Drive, Dropbox, OneDrive… via its webhook). Best-effort.
    if ($status === 'published' && $mediaType === 'doc' && function_exists('event_emit')) {
        event_emit('community.document', ['postId' => $id, 'name' => $alt, 'url' => $mediaUrl, 'channel' => $chSlug, 'author' => $author['name'], 'bytes' => (int)($d['mediaBytes'] ?? 0)]);
    }
    $row = db_row("SELECT * FROM community_posts WHERE postId = ?", [$id]);
    return ['ok' => true, 'post' => community_post_shape($row, $viewer), 'queued' => $status !== 'published'];
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
            community_notify($r['id'], $actorId, 'community.mention', $actorName . ' mentioned you', mb_substr($body, 0, 160));
        }
    }
    // @all / @channel — mentors & admins only, and only within a real channel.
    if ($tagAll && $channelId !== '' && community_actor_is_staff($actorId)) {
        community_notify_channel($channelId, $actorId, $actorName, mb_substr($body, 0, 160), $done);
    }
}

/** Tag-all: notify everyone who has posted in a channel (excluding the actor
 *  and anyone already individually notified). Members with email also get an
 *  email; capped so a single post can't fan out without bound. */
function community_notify_channel(string $channelId, string $actorId, string $actorName, string $body, array $skip = []): void {
    $rows = db_all("SELECT DISTINCT authorId FROM community_posts WHERE channelId = ? AND status = 'published' AND authorId <> ? LIMIT 500", [$channelId, $actorId]);
    $n = 0;
    foreach ($rows as $r) {
        $id = (string)$r['authorId'];
        if ($id === '' || isset($skip[$id])) continue;
        community_notify($id, $actorId, 'community.tagall', $actorName . ' tagged the channel', $body);
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
function community_poll_shape(string $postId, array $opts, string $viewer): array {
    $counts = array_fill(0, count($opts), 0);
    foreach (db_all("SELECT choice, COUNT(*) c FROM community_poll_votes WHERE postId = ? GROUP BY choice", [$postId]) as $r) {
        $i = (int)$r['choice']; if ($i >= 0 && $i < count($counts)) $counts[$i] = (int)$r['c'];
    }
    $total = array_sum($counts);
    $my = $viewer !== '' ? db_row("SELECT choice FROM community_poll_votes WHERE postId = ? AND memberId = ?", [$postId, $viewer]) : null;
    $options = [];
    foreach ($opts as $i => $t) $options[] = ['text' => (string)$t, 'votes' => $counts[$i], 'pct' => $total ? (int)round($counts[$i] / $total * 100) : 0];
    return ['options' => $options, 'totalVotes' => $total, 'myVote' => $my ? (int)$my['choice'] : -1];
}

function community_react(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $pid = (string)($p['postId'] ?? '');
    $emoji = (string)($p['emoji'] ?? '');
    if (!in_array($emoji, COMMUNITY_REACTIONS, true)) return ['ok' => false, 'error' => 'bad_emoji'];
    if (!db_row("SELECT id FROM community_posts WHERE postId = ?", [$pid])) return ['ok' => false, 'error' => 'not_found'];
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
function community_star(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    if (!community_actor_is_staff($viewer)) return ['ok' => false, 'error' => 'forbidden', 'message' => 'Only mentors can give a Genius Star.'];
    $pid = (string)($p['postId'] ?? '');
    $post = db_row("SELECT authorId FROM community_posts WHERE postId = ? LIMIT 1", [$pid]);
    if (!$post) return ['ok' => false, 'error' => 'not_found'];
    $ex = db_row("SELECT id FROM community_stars WHERE postId = ? AND memberId = ?", [$pid, $viewer]);
    if ($ex) { db_exec("DELETE FROM community_stars WHERE postId = ? AND memberId = ?", [$pid, $viewer]); $starred = false; }
    else {
        db_insert('community_stars', ['postId' => $pid, 'memberId' => $viewer, 'createdAt' => now_iso()]);
        $starred = true;
        $actor = community_author($viewer);
        community_notify((string)$post['authorId'], $viewer, 'community.star', '⭐ ' . $actor['name'] . ' gave your post a Genius Star', 'A mentor recognised your work in the community.');
        audit('community.star', $viewer, $pid, [], (string)($p['ip'] ?? ''));
    }
    $stars = (int)(db_row("SELECT COUNT(*) c FROM community_stars WHERE postId = ?", [$pid])['c'] ?? 0);
    return ['ok' => true, 'stars' => $stars, 'starred' => $starred];
}

function community_comments(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $pid = (string)($p['postId'] ?? '');
    $rows = db_all("SELECT commentId, memberId, memberName, body, status, createdAt FROM community_comments
                    WHERE postId = ? AND (status = 'published'" . ($viewer !== '' ? " OR memberId = ?" : "") . ") ORDER BY createdAt ASC",
        $viewer !== '' ? [$pid, $viewer] : [$pid]);
    $out = array_map(fn($r) => [
        'commentId' => (string)$r['commentId'], 'name' => (string)$r['memberName'], 'body' => (string)$r['body'],
        'status' => (string)$r['status'], 'createdAt' => (string)$r['createdAt'], 'isMe' => (string)$r['memberId'] === $viewer,
        'note' => ((string)$r['status'] !== 'published' && (string)$r['memberId'] === $viewer) ? community_status_note((string)$r['status']) : '',
    ], $rows);
    return ['ok' => true, 'comments' => $out];
}

function community_comment_create(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $pid = (string)($p['postId'] ?? '');
    if (!db_row("SELECT id FROM community_posts WHERE postId = ?", [$pid])) return ['ok' => false, 'error' => 'not_found'];
    $body = mb_substr(trim((string)($p['body'] ?? '')), 0, 1000);
    if ($body === '') return ['ok' => false, 'error' => 'empty'];
    $screen = community_screen($body);
    if ($screen['verdict'] === 'block') {
        return ['ok' => false, 'error' => $screen['crisis'] ? 'crisis' : 'blocked',
            'message' => $screen['crisis'] ? coach_crisis_reply() : 'That comment can\'t be posted — it looks unsafe for this community.'];
    }
    $status = $screen['verdict'] === 'review' ? 'pending' : 'published';
    $author = community_author($viewer);
    $id = 'CC-' . strtoupper(rand_hex(6));
    $now = now_iso();
    db_insert('community_comments', [
        'commentId' => $id, 'postId' => $pid, 'memberId' => $viewer, 'memberName' => $author['name'] . ($author['initial'] ? ' ' . $author['initial'] : ''),
        'body' => $body, 'status' => $status, 'moderation' => json_encode(['verdict' => $screen['verdict'], 'reason' => $screen['reason']], JSON_UNESCAPED_SLASHES), 'createdAt' => $now,
    ]);
    audit('community.comment', $viewer, $id, ['postId' => $pid, 'status' => $status], (string)($p['ip'] ?? ''));
    if ($status === 'published') {
        $post = db_row("SELECT authorId, channelId FROM community_posts WHERE postId = ? LIMIT 1", [$pid]);
        if ($post) community_notify((string)$post['authorId'], $viewer, 'community.reply', $author['name'] . ' replied to your post', mb_substr($body, 0, 120));
        // @mentions inside a reply notify (and email) too.
        community_notify_mentions($body, $viewer, $author['name'], $pid, $post ? (string)$post['channelId'] : '');
    }
    return ['ok' => true, 'queued' => $status !== 'published', 'comment' => [
        'commentId' => $id, 'name' => $author['name'] . ($author['initial'] ? ' ' . $author['initial'] : ''), 'body' => $body,
        'status' => $status, 'createdAt' => $now, 'isMe' => true, 'note' => $status !== 'published' ? community_status_note($status) : '',
    ]];
}

function community_bookmark(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $pid = (string)($p['postId'] ?? '');
    $existing = db_row("SELECT id FROM community_bookmarks WHERE postId = ? AND memberId = ?", [$pid, $viewer]);
    if ($existing) { db_exec("DELETE FROM community_bookmarks WHERE postId = ? AND memberId = ?", [$pid, $viewer]); return ['ok' => true, 'bookmarked' => false]; }
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
    db_insert('community_reports', ['targetType' => $type, 'targetId' => $id, 'memberId' => $viewer, 'reason' => mb_substr(trim((string)($p['reason'] ?? '')), 0, 400), 'createdAt' => now_iso()]);
    if ($type === 'post') db_exec("UPDATE community_posts SET reportCount = reportCount + 1 WHERE postId = ?", [$id]);
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
    } else {
        $pr = db_row("SELECT authorId FROM community_posts WHERE postId = ?", [$id]);
        if (!$pr || (string)$pr['authorId'] !== $viewer) return ['ok' => false, 'error' => 'forbidden'];
        db_exec("DELETE FROM community_posts WHERE postId = ?", [$id]);
        db_exec("DELETE FROM community_reactions WHERE postId = ?", [$id]);
        db_exec("DELETE FROM community_comments WHERE postId = ?", [$id]);
        db_exec("DELETE FROM community_bookmarks WHERE postId = ?", [$id]);
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
        $ch = db_row("SELECT name, color, icon FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$r['channelId']]);
        $first = explode(' ', trim((string)$r['authorName']))[0] ?? 'A member';
        $out[] = [
            'postId' => (string)$r['postId'],
            'channel' => ['name' => (string)($ch['name'] ?? ''), 'color' => (string)($ch['color'] ?? '#3b5bdb'), 'icon' => (string)($ch['icon'] ?? '')],
            'author' => $first, 'body' => (string)$r['body'],
            'mediaType' => (string)$r['mediaType'], 'mediaUrl' => (string)$r['mediaUrl'], 'mediaPoster' => (string)$r['mediaPoster'], 'altText' => (string)$r['altText'],
        ];
    }
    return ['ok' => true, 'showcase' => $out];
}

/** AI "Catch me up" — a short digest of a channel's recent activity. */
function community_digest(array $p): array {
    community_ensure_channels();
    $chSlug = (string)($p['channel'] ?? 'all');
    $chName = 'the community';
    if ($chSlug !== 'all' && $chSlug !== '') {
        $c = db_row("SELECT channelId, name FROM community_channels WHERE slug = ? LIMIT 1", [$chSlug]);
        if (!$c) return ['ok' => false, 'error' => 'not_found'];
        $chName = (string)$c['name'];
        $rows = db_all("SELECT authorName, body FROM community_posts WHERE channelId = ? AND status = 'published' AND body <> '' ORDER BY createdAt DESC LIMIT 25", [(string)$c['channelId']]);
    } else {
        $rows = db_all("SELECT authorName, body FROM community_posts WHERE status = 'published' AND body <> '' ORDER BY createdAt DESC LIMIT 25");
    }
    if (!$rows) return ['ok' => true, 'digest' => 'It\'s quiet in ' . $chName . ' right now — be the first to post something today.', 'ai' => false];
    if (!function_exists('ai_enabled') || !ai_enabled('analysis')) {
        return ['ok' => true, 'digest' => count($rows) . ' recent posts in ' . $chName . '. Scroll the feed to catch up.', 'ai' => false];
    }
    $feed = '';
    foreach ($rows as $r) $feed .= '- ' . trim((string)$r['authorName']) . ': ' . mb_substr(trim((string)$r['body']), 0, 200) . "\n";
    $sys = "You summarise a youth community feed for a teenager who's been away. In 2-3 warm, upbeat sentences (max 60 words), say what people have been posting and sharing in " . $chName . ". No names beyond first names. No markdown. If nothing notable, say it's been quiet.";
    $out = ai_complete($sys, $feed, 160, 'analysis');
    $out = trim((string)$out);
    if ($out === '') $out = count($rows) . ' recent posts in ' . $chName . '. Scroll the feed to catch up.';
    return ['ok' => true, 'digest' => $out, 'ai' => true];
}

/* ── Admin ────────────────────────────────────────────────────────────── */

function admin_community_overview(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    community_ensure_channels();
    $rows = db_all("SELECT * FROM community_channels ORDER BY pinned DESC, sortOrder ASC, name ASC");
    $channels = array_map(function ($c) {
        $base = community_channel_public($c);
        $base['status'] = (string)$c['status'];
        $base['sortOrder'] = (int)$c['sortOrder'];
        $base['total'] = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE channelId = ?", [(string)$c['channelId']])['c'] ?? 0);
        return $base;
    }, $rows);
    $pendingPosts = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE status = 'pending'")['c'] ?? 0);
    $pendingComments = (int)(db_row("SELECT COUNT(*) c FROM community_comments WHERE status = 'pending'")['c'] ?? 0);
    $reported = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE reportCount > 0 AND status <> 'removed'")['c'] ?? 0);
    return ['ok' => true, 'channels' => $channels, 'pending' => ['posts' => $pendingPosts, 'comments' => $pendingComments, 'reported' => $reported]];
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
    $st = in_array($filter, ['pending', 'published', 'hidden', 'removed', 'reported', 'all'], true) ? $filter : 'pending';
    if ($st === 'reported') { $postWhere = "reportCount > 0 AND status <> 'removed'"; $postArgs = []; }
    elseif ($st === 'all') { $postWhere = "status <> 'removed'"; $postArgs = []; }
    else { $postWhere = "status = ?"; $postArgs = [$st]; }
    $posts = array_map(function ($r) {
        $ch = db_row("SELECT name, color FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$r['channelId']]);
        return [
            'postId' => (string)$r['postId'], 'author' => (string)$r['authorName'], 'centre' => (string)$r['authorCentre'],
            'channel' => (string)($ch['name'] ?? ''), 'color' => (string)($ch['color'] ?? '#3b5bdb'),
            'body' => (string)$r['body'], 'mediaType' => (string)$r['mediaType'], 'mediaUrl' => (string)$r['mediaUrl'], 'mediaPoster' => (string)$r['mediaPoster'],
            'status' => (string)$r['status'], 'pinned' => (int)$r['pinned'] === 1, 'featured' => (int)($r['featured'] ?? 0) === 1,
            'reportCount' => (int)($r['reportCount'] ?? 0), 'createdAt' => (string)$r['createdAt'],
            'moderation' => json_decode((string)($r['moderation'] ?? ''), true) ?: null,
        ];
    }, db_all("SELECT * FROM community_posts WHERE $postWhere ORDER BY reportCount DESC, createdAt DESC LIMIT 100", $postArgs));
    $comments = array_map(fn($r) => [
        'commentId' => (string)$r['commentId'], 'postId' => (string)$r['postId'], 'name' => (string)$r['memberName'],
        'body' => (string)$r['body'], 'status' => (string)$r['status'], 'createdAt' => (string)$r['createdAt'],
    ], db_all("SELECT * FROM community_comments WHERE " . ($st === 'all' ? "status <> 'removed'" : "status = ?") . " ORDER BY createdAt DESC LIMIT 100", $st === 'all' ? [] : [$st]));
    return ['ok' => true, 'posts' => $posts, 'comments' => $comments];
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
        db_update('community_comments', ['status' => $map[$act], 'moderatedBy' => $by, 'moderatedAt' => $now], ['commentId' => $cid]);
        audit('community.moderate.comment', $by, $cid, ['action' => $act], (string)($p['ip'] ?? ''));
        return ['ok' => true];
    }
    $pid = (string)($p['id'] ?? '');
    if ($act === 'pin' || $act === 'unpin') {
        db_update('community_posts', ['pinned' => $act === 'pin' ? 1 : 0, 'updatedAt' => $now], ['postId' => $pid]);
    } elseif ($act === 'feature' || $act === 'unfeature') {
        db_update('community_posts', ['featured' => $act === 'feature' ? 1 : 0, 'updatedAt' => $now], ['postId' => $pid]);
        if ($act === 'feature') { $o = db_row("SELECT authorId FROM community_posts WHERE postId = ?", [$pid]); if ($o) community_notify((string)$o['authorId'], $by, 'community.featured', 'Your post is on the public Showcase ✨', 'A mentor featured your post — it now shines on the public NGG Showcase.'); }
    } else {
        $map = ['approve' => 'published', 'hide' => 'hidden', 'remove' => 'removed'];
        if (!isset($map[$act])) return ['ok' => false, 'error' => 'bad_action'];
        db_update('community_posts', ['status' => $map[$act], 'updatedAt' => $now], ['postId' => $pid]);
    }
    audit('community.moderate.post', $by, $pid, ['action' => $act], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
