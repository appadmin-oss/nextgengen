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
        'pinned' => (int)($c['pinned'] ?? 0) === 1, 'posts' => $posts,
    ];
}

function community_channels(array $p): array {
    community_ensure_channels();
    $rows = db_all("SELECT * FROM community_channels WHERE status = 'active' ORDER BY pinned DESC, sortOrder ASC, name ASC");
    return ['ok' => true, 'channels' => array_map('community_channel_public', $rows)];
}

/* ── Attribution (PII-safe: first name + last initial only) ───────────── */

function community_author(string $memberId): array {
    $m = db_row("SELECT fullName, centre FROM members WHERE memberId = ? LIMIT 1", [$memberId]);
    $full = trim((string)($m['fullName'] ?? '')) ?: 'Member';
    $parts = preg_split('/\s+/', $full) ?: [];
    $first = $parts[0] ?? 'Member';
    $initial = count($parts) > 1 ? strtoupper(substr((string)end($parts), 0, 1)) . '.' : '';
    return ['name' => $first, 'initial' => $initial, 'centre' => (string)($m['centre'] ?? '')];
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

/* ── Posts ────────────────────────────────────────────────────────────── */

/** Build the client shape of a post for a given viewer. */
function community_post_shape(array $row, string $viewerId): array {
    $pid = (string)$row['postId'];
    $reacts = [];
    foreach (db_all("SELECT emoji, COUNT(*) c FROM community_reactions WHERE postId = ? GROUP BY emoji", [$pid]) as $r) {
        $reacts[(string)$r['emoji']] = (int)$r['c'];
    }
    $mine = $viewerId !== '' ? (db_row("SELECT emoji FROM community_reactions WHERE postId = ? AND memberId = ?", [$pid, $viewerId])['emoji'] ?? '') : '';
    $comments = (int)(db_row("SELECT COUNT(*) c FROM community_comments WHERE postId = ? AND status = 'published'", [$pid])['c'] ?? 0);
    $booked = $viewerId !== '' && db_row("SELECT id FROM community_bookmarks WHERE postId = ? AND memberId = ?", [$pid, $viewerId]);
    $isMe = (string)$row['authorId'] === $viewerId;
    $ch = db_row("SELECT slug, name, color, icon FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$row['channelId']]);
    return [
        'postId' => $pid,
        'channel' => ['slug' => (string)($ch['slug'] ?? ''), 'name' => (string)($ch['name'] ?? 'Channel'), 'color' => (string)($ch['color'] ?? '#3b5bdb'), 'icon' => (string)($ch['icon'] ?? '')],
        'author' => ['name' => (string)$row['authorName'], 'initial' => '', 'centre' => (string)$row['authorCentre'], 'isMe' => $isMe],
        'body' => (string)$row['body'],
        'mediaType' => (string)$row['mediaType'], 'mediaUrl' => (string)$row['mediaUrl'], 'mediaPoster' => (string)$row['mediaPoster'], 'altText' => (string)$row['altText'],
        'status' => (string)$row['status'], 'pinned' => (int)$row['pinned'] === 1,
        'reactions' => $reacts, 'myReaction' => (string)$mine, 'commentCount' => $comments,
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

function community_post_create(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    community_ensure_channels();
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $body = trim((string)($d['body'] ?? ''));
    $mediaType = in_array((string)($d['mediaType'] ?? 'none'), ['none', 'image', 'video'], true) ? (string)($d['mediaType'] ?? 'none') : 'none';
    $mediaUrl = trim((string)($d['mediaUrl'] ?? ''));
    if ($mediaUrl !== '' && !preg_match('#^https://#i', $mediaUrl)) return ['ok' => false, 'error' => 'bad_media'];
    if ($mediaUrl === '') $mediaType = 'none';
    $body = mb_substr($body, 0, 2000);
    if ($body === '' && $mediaType === 'none') return ['ok' => false, 'error' => 'empty'];

    $chSlug = (string)($d['channel'] ?? 'commons');
    $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? AND status = 'active' LIMIT 1", [$chSlug]);
    if (!$ch) $ch = db_row("SELECT channelId FROM community_channels WHERE slug = 'commons' LIMIT 1");
    if (!$ch) return ['ok' => false, 'error' => 'no_channel'];

    // Safeguarding screen (text) → status. Video always queues for human review.
    $screen = community_screen($body);
    if ($screen['verdict'] === 'block') {
        return ['ok' => false, 'error' => $screen['crisis'] ? 'crisis' : 'blocked',
            'message' => $screen['crisis'] ? coach_crisis_reply() : 'That post can\'t be shared here — it looks unsafe for this community. A mentor can help if this is a mistake.'];
    }
    $status = $screen['verdict'] === 'review' ? 'pending' : 'published';
    if ($mediaType === 'video') $status = 'pending'; // frames can't be auto-screened

    $author = community_author($viewer);
    $alt = $mediaType === 'image' ? ($body !== '' ? mb_substr($body, 0, 160) : ('Photo shared by ' . $author['name'] . ($author['centre'] ? ' · ' . $author['centre'] : ''))) : '';
    $id = 'CP-' . strtoupper(rand_hex(6));
    $now = now_iso();
    db_insert('community_posts', [
        'postId' => $id, 'channelId' => (string)$ch['channelId'], 'authorId' => $viewer,
        'authorName' => $author['name'] . ($author['initial'] ? ' ' . $author['initial'] : ''), 'authorCentre' => $author['centre'],
        'body' => $body, 'mediaType' => $mediaType, 'mediaUrl' => $mediaUrl, 'mediaPoster' => trim((string)($d['mediaPoster'] ?? '')),
        'altText' => $alt, 'status' => $status, 'moderation' => json_encode(['verdict' => $screen['verdict'], 'reason' => $screen['reason'], 'by' => 'ai', 'at' => $now], JSON_UNESCAPED_SLASHES),
        'viewCount' => 0, 'createdAt' => $now, 'updatedAt' => $now,
    ]);
    audit('community.post', $viewer, $id, ['channel' => $chSlug, 'status' => $status, 'media' => $mediaType], (string)($p['ip'] ?? ''));
    $row = db_row("SELECT * FROM community_posts WHERE postId = ?", [$id]);
    return ['ok' => true, 'post' => community_post_shape($row, $viewer), 'queued' => $status !== 'published'];
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
    return ['ok' => true, 'channels' => $channels, 'pending' => ['posts' => $pendingPosts, 'comments' => $pendingComments]];
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
    $row = [
        'name' => $name, 'slug' => $slug, 'color' => $color,
        'kind' => in_array((string)($d['kind'] ?? 'course'), ['course', 'commons', 'centre', 'topic'], true) ? (string)$d['kind'] : 'course',
        'faculty' => mb_substr(trim((string)($d['faculty'] ?? '')), 0, 120),
        'icon' => mb_substr(trim((string)($d['icon'] ?? '')), 0, 12),
        'description' => mb_substr(trim((string)($d['description'] ?? '')), 0, 400),
        'sortOrder' => (int)($d['sortOrder'] ?? 0), 'pinned' => !empty($d['pinned']) ? 1 : 0,
        'status' => in_array((string)($d['status'] ?? 'active'), ['active', 'archived'], true) ? (string)$d['status'] : 'active',
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
    $st = in_array($filter, ['pending', 'published', 'hidden', 'removed', 'all'], true) ? $filter : 'pending';
    $postWhere = $st === 'all' ? "status <> 'removed'" : "status = ?";
    $postArgs = $st === 'all' ? [] : [$st];
    $posts = array_map(function ($r) {
        $ch = db_row("SELECT name, color FROM community_channels WHERE channelId = ? LIMIT 1", [(string)$r['channelId']]);
        return [
            'postId' => (string)$r['postId'], 'author' => (string)$r['authorName'], 'centre' => (string)$r['authorCentre'],
            'channel' => (string)($ch['name'] ?? ''), 'color' => (string)($ch['color'] ?? '#3b5bdb'),
            'body' => (string)$r['body'], 'mediaType' => (string)$r['mediaType'], 'mediaUrl' => (string)$r['mediaUrl'], 'mediaPoster' => (string)$r['mediaPoster'],
            'status' => (string)$r['status'], 'pinned' => (int)$r['pinned'] === 1, 'createdAt' => (string)$r['createdAt'],
            'moderation' => json_decode((string)($r['moderation'] ?? ''), true) ?: null,
        ];
    }, db_all("SELECT * FROM community_posts WHERE $postWhere ORDER BY createdAt DESC LIMIT 100", $postArgs));
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
    } else {
        $map = ['approve' => 'published', 'hide' => 'hidden', 'remove' => 'removed'];
        if (!isset($map[$act])) return ['ok' => false, 'error' => 'bad_action'];
        db_update('community_posts', ['status' => $map[$act], 'updatedAt' => $now], ['postId' => $pid]);
    }
    audit('community.moderate.post', $by, $pid, ['action' => $act], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
