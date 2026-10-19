<?php
/**
 * Community v3 — what the redesigned Community needs beyond domain/community.php.
 *
 *   · ONE safety check, written here and sent to the browser as data
 *     (cm3_safety_rules), so the hint a child sees while typing and the rule
 *     the server applies on Send cannot disagree.
 *   · Hold rules apply to students only. Staff are still crisis-screened and
 *     still blocked for unsafe content, but are never made to wait.
 *   · Post kinds: question (with an accepted answer), work, announcement and
 *     homework (staff only; both pin), plus code posts with a live preview.
 *   · Video chapters, captions and summary points, and a member's place in a
 *     video, kept on the server.
 *   · Moderation extras: why an item is in the queue, median review time,
 *     edit & approve, message the author, escalate to safeguarding.
 *   · Safeguarding is gated on the `safeguarding` capability, never `content`:
 *     a content editor is not a trained safeguarding lead.
 */

const CM3_CODE_MAX = 20000;
const CM3_CAPTION_BYTES = 200000;
const CM3_CAPTION_CUES = 800;
const CM3_CHAPTERS_MAX = 40;
const CM3_KINDS = ['post', 'poll', 'question', 'work', 'announce', 'homework'];
const CM3_STAFF_KINDS = ['announce', 'homework'];
const CM3_REPORT_REASONS = ['unkind' => 'It’s unkind or bullying', 'uncomfortable' => 'It makes me feel uncomfortable',
    'private' => 'It shares someone’s private details', 'spam' => 'It’s spam or an advert', 'safety' => 'I’m worried someone is not safe'];

/* ── The safety check ─────────────────────────────────────────────────────── */

/** The rules, as data. The client builds its RegExps from these strings, so
 *  every pattern here must mean the same thing in PCRE and in JavaScript. */
function cm3_safety_rules(): array {
    return [
        'phone' => '(\\+?234|\\b0)[789][01]\\d[\\s-]?\\d{3}[\\s-]?\\d{4}',
        'digitsRun' => 10,
        'unkind' => [['stupid', 'not right'], ['dumb', 'not great'], ['idiot', 'wrong'], ['ugly', 'not my favourite'],
                     ['shut up', 'hold on'], ['hate', 'don\'t like'], ['loser', 'unlucky']],
        'social' => '(instagram|tiktok|snapchat|whatsapp|t\\.me|wa\\.me)',
        'capsMin' => 12,
        'msg' => [
            'phone' => 'That looks like a phone number. Keep contact details private — your mentor can help you connect safely.',
            'unkind' => '“{w}” might hurt someone, even as a joke. Try saying what you mean another way.',
            'social' => 'Links to social apps or private chats aren’t allowed here. Keep the conversation in NGG where mentors can help.',
            'caps' => 'All capitals can read like shouting. Fine if that’s what you mean!',
            'video' => 'Videos are always watched by a mentor before they appear — usually within a few hours.',
            'ok' => 'Looks kind and clear.',
        ],
    ];
}

/**
 * The verdict for one piece of text. `v` is review (a student's post waits or is
 * flagged, by mode), nudge (a hint only), video, ok, or '' for nothing to say.
 */
function cm3_safety_check(string $text, string $media = ''): array {
    $R = cm3_safety_rules();
    $t = trim($text);
    if ($t === '' && $media === '') return ['v' => '', 'code' => '', 'msg' => ''];
    if (preg_match('/' . $R['phone'] . '/u', $t) || preg_match('/\d{' . (int)$R['digitsRun'] . ',}/', preg_replace('/[\s-]/', '', $t)))
        return ['v' => 'review', 'code' => 'phone', 'msg' => $R['msg']['phone']];
    foreach ($R['unkind'] as [$w, $kind]) {
        $re = '/\b' . preg_quote($w, '/') . '\b/iu';
        if (preg_match($re, $t)) return ['v' => 'review', 'code' => 'unkind', 'msg' => str_replace('{w}', $w, $R['msg']['unkind']),
            'fix' => preg_replace($re, $kind, $t)];
    }
    if (preg_match('/' . $R['social'] . '/iu', $t)) return ['v' => 'review', 'code' => 'social', 'msg' => $R['msg']['social']];
    if (mb_strlen($t) > (int)$R['capsMin'] && $t === mb_strtoupper($t) && preg_match('/[A-Z]{4}/', $t))
        return ['v' => 'nudge', 'code' => 'caps', 'msg' => $R['msg']['caps'], 'fix' => mb_substr($t, 0, 1) . mb_strtolower(mb_substr($t, 1))];
    if ($media === 'video') return ['v' => 'video', 'code' => 'video', 'msg' => $R['msg']['video']];
    if (mb_strlen($t) < 2) return ['v' => '', 'code' => '', 'msg' => ''];
    return ['v' => 'ok', 'code' => 'ok', 'msg' => $R['msg']['ok']];
}

/**
 * Whether a post or reply goes live, waits, or goes live flagged.
 *   staff  → always live (crisis and unsafe content are refused earlier).
 *   strict → anything the screen or the rules are unsure about, and any video, waits.
 *   flag   → unsure goes live flagged; videos still wait.
 *   off    → live.
 */
function cm3_hold(bool $staff, bool $unsure, string $mediaType, string $mode): array {
    if ($staff) return ['status' => 'published', 'flagged' => 0];
    if ($mediaType === 'video' && $mode !== 'off') return ['status' => 'pending', 'flagged' => 0];
    if ($unsure) return $mode === 'strict' ? ['status' => 'pending', 'flagged' => 0] : ['status' => 'published', 'flagged' => $mode === 'flag' ? 1 : 0];
    return ['status' => 'published', 'flagged' => 0];
}

/* ── Who is looking ───────────────────────────────────────────────────────── */

/** The viewer's caps when they are a staff member in `members`, else []. */
function cm3_caps(string $viewer): array {
    $m = $viewer !== '' ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$viewer]) : null;
    if (!$m || !is_admin_role((string)($m['role'] ?? ''))) return [];
    return member_effective_caps($m);
}

/** student | instructor | admin — the design's three views of one Community. */
function cm3_role(string $viewer): string {
    if (in_array('content', cm3_caps($viewer), true)) return 'admin';
    return community_actor_is_staff($viewer) ? 'instructor' : 'student';
}

/** The label on a staff author's chip. */
function cm3_role_label(string $authorId): string {
    static $seen = [];   // a feed page is a handful of authors repeated
    if (isset($seen[$authorId])) return $seen[$authorId];
    return $seen[$authorId] = cm3_role_label_read($authorId);
}
function cm3_role_label_read(string $authorId): string {
    if (!community_actor_is_staff($authorId)) return '';
    $m = db_row('SELECT role FROM members WHERE memberId = ? LIMIT 1', [$authorId]);
    if ($m) {
        $r = strtolower((string)$m['role']);
        if ($r === 'mentor') return 'Mentor';
        if (in_array($r, ['super_admin', 'admin', 'editor'], true)) return 'Community lead';
        return 'Staff';
    }
    $v = db_row('SELECT role FROM volunteers WHERE volunteerId = ? LIMIT 1', [$authorId]);
    return stripos((string)($v['role'] ?? ''), 'mentor') !== false ? 'Mentor' : 'Instructor';
}

/** A stable, opaque key for a person: what the client keys profile cards and
 *  mention chips by, without handing children each other's member ids. */
function cm3_key(string $id): string { return $id === '' ? '' : substr(hash_hmac('sha256', $id, (string)($GLOBALS['CONFIG']['cookie_secret'] ?? 'ngg')), 0, 12); }

/** The channels a member follows: staff follow every live channel; a student
 *  follows Commons, the non-course channels, and the course channels of the
 *  courses they take. A student whose courses match no channel follows every
 *  channel, rather than being stranded in an empty Community. */
function cm3_my_channels(string $viewer): array {
    $all = db_all("SELECT slug, name, kind FROM community_channels WHERE status = 'active' ORDER BY pinned DESC, sortOrder, name");
    if (community_actor_is_staff($viewer)) return array_column($all, 'slug');
    $courses = [];
    $m = db_row('SELECT track, profileJson FROM members WHERE memberId = ? LIMIT 1', [$viewer]);
    if ($m) {
        if (trim((string)$m['track']) !== '') $courses[] = strtolower(trim((string)$m['track']));
        $pj = safe_json((string)($m['profileJson'] ?? '')) ?: [];
        foreach ((array)($pj['courses'] ?? []) as $c) if (is_string($c) && trim($c) !== '') $courses[] = strtolower(trim($c));
    } else {
        $s = db_row('SELECT track FROM summer_students WHERE studentId = ? LIMIT 1', [$viewer]);
        if ($s && trim((string)$s['track']) !== '') $courses[] = strtolower(trim((string)$s['track']));
    }
    $mine = []; $courseHit = false;
    foreach ($all as $c) {
        if ((string)$c['kind'] !== 'course') { $mine[] = (string)$c['slug']; continue; }
        if (in_array(strtolower((string)$c['name']), $courses, true)) { $mine[] = (string)$c['slug']; $courseHit = true; }
    }
    return $courseHit ? $mine : array_column($all, 'slug');
}

/* ── Boot ─────────────────────────────────────────────────────────────────── */

/** community.v3boot — everything the screen needs about the viewer, once. */
function community_v3_boot(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    community_ensure_channels();
    $caps = cm3_caps($viewer);
    $role = cm3_role($viewer);
    $a = community_author($viewer);
    $full = db_row('SELECT fullName, centre FROM members WHERE memberId = ? LIMIT 1', [$viewer])
        ?: db_row('SELECT fullName, centre FROM summer_students WHERE studentId = ? LIMIT 1', [$viewer])
        ?: db_row("SELECT fullName, '' centre FROM volunteers WHERE volunteerId = ? LIMIT 1", [$viewer]);
    $today = community_today_counts(['memberId' => $viewer]);
    $chans = community_channels(['memberId' => $viewer])['channels'] ?? [];
    $mine = cm3_my_channels($viewer);
    $members = [];
    foreach (db_all("SELECT channelId, COUNT(DISTINCT authorId) c FROM community_posts WHERE status = 'published' GROUP BY channelId") as $r) $members[(string)$r['channelId']] = (int)$r['c'];
    foreach ($chans as &$c) { $c['mine'] = in_array($c['slug'], $mine, true); $c['people'] = $members[$c['channelId']] ?? 0; }
    unset($c);
    $everyone = (int)(db_row("SELECT COUNT(*) c FROM members WHERE type = 'NGG' AND status = 'active'")['c'] ?? 0);
    $centres = (int)(db_row("SELECT COUNT(*) c FROM centres WHERE status = 'active'")['c'] ?? 0);
    $name = trim((string)($full['fullName'] ?? '')) ?: $a['name'];
    return ['ok' => true,
        'me' => ['key' => cm3_key($viewer), 'name' => $name, 'first' => explode(' ', $name)[0], 'centre' => (string)($full['centre'] ?? ''),
                 'role' => $role, 'roleLabel' => $role === 'admin' ? 'Community lead' : ($role === 'instructor' ? cm3_role_label($viewer) ?: 'Instructor' : 'Student'),
                 'staff' => $role !== 'student', 'handle' => (string)($today['handle'] ?? ''), 'photo' => community_photo_for($viewer),
                 'canModerate' => $role === 'admin', 'canSafeguard' => in_array('safeguarding', $caps, true),
                 'canSetMode' => in_array('rbac', $caps, true) && (bool)db_row("SELECT id FROM members WHERE memberId = ? AND role = 'super_admin'", [$viewer]),
                 'starsLeft' => (int)($today['starsLeft'] ?? 0), 'starsPerDay' => COMMUNITY_STARS_PER_DAY],
        'counts' => ['unread' => (int)($today['unread'] ?? 0), 'mentions' => (int)($today['mentions'] ?? 0), 'saved' => (int)($today['saved'] ?? 0)],
        'channels' => $chans, 'mode' => community_moderation_mode(), 'rules' => cm3_safety_rules(),
        'reactions' => COMMUNITY_REACTIONS, 'reportReasons' => CM3_REPORT_REASONS,
        'everyone' => $everyone, 'centres' => $centres];
}

/** community.home — the "This week at NGG" carousel, from real records only:
 *  the quote of the week, the newest pinned announcements in the viewer's
 *  channels, their next homework, and a featured post. */
function community_v3_home(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $slides = [];
    if (function_exists('weekly_quote')) {
        try {
            $q = weekly_quote();
            if (trim((string)($q['text'] ?? '')) !== '') {
                $wk = (int)gmdate('W', strtotime((string)$q['week']) ?: time());
                $slides[] = ['kind' => 'quote', 'tag' => 'Quote of the week · Week ' . $wk, 'quote' => (string)$q['text'],
                    'by' => (string)($q['translation'] ?: ($q['source'] === 'anchor' ? 'Anchor' : ucfirst((string)$q['language']))),
                    'src' => (string)($q['meaning'] ?? '')];
            }
        } catch (\Throwable $e) { /* a carousel without a quote is still a carousel */ }
    }
    $mine = cm3_my_channels($viewer);
    if ($mine) {
        $ph = implode(',', array_fill(0, count($mine), '?'));
        foreach (db_all("SELECT p.postId, p.body, p.kind FROM community_posts p JOIN community_channels c ON c.channelId = p.channelId
                          WHERE p.status = 'published' AND p.kind = 'announce' AND c.slug IN ($ph) ORDER BY p.createdAt DESC LIMIT 2", $mine) as $r) {
            [$t, $d] = cm3_title_body((string)$r['body']);
            $slides[] = ['kind' => 'news', 'tag' => 'Announcement', 'icon' => 'ph ph-megaphone', 'title' => $t, 'd' => $d, 'cta' => 'Read it', 'post' => (string)$r['postId']];
        }
        $hw = db_row("SELECT h.homeworkId, h.title, h.dueAt, h.detail FROM community_homework h JOIN community_channels c ON c.channelId = h.channelId
                       LEFT JOIN community_homework_state s ON s.homeworkId = h.homeworkId AND s.memberId = ?
                       WHERE h.status = 'active' AND c.slug IN ($ph) AND COALESCE(s.submittedAt,'') = '' AND (h.dueAt = '' OR h.dueAt >= ?)
                       ORDER BY CASE WHEN h.dueAt = '' THEN 1 ELSE 0 END, h.dueAt LIMIT 1", array_merge([$viewer], $mine, [gmdate('Y-m-d')]));
        if ($hw) $slides[] = ['kind' => 'news', 'tag' => 'Homework', 'icon' => 'ph ph-backpack', 'title' => (string)$hw['title'] . ((string)$hw['dueAt'] !== '' ? ' — due ' . cm3_due_words((string)$hw['dueAt']) : ''),
            'd' => mb_substr((string)$hw['detail'], 0, 160), 'cta' => 'Open homework', 'hw' => (string)$hw['homeworkId']];
        $f = db_row("SELECT p.postId, p.body FROM community_posts p JOIN community_channels c ON c.channelId = p.channelId
                      WHERE p.status = 'published' AND p.featured = 1 AND c.slug IN ($ph) ORDER BY p.createdAt DESC LIMIT 1", $mine);
        if ($f) { [$t, $d] = cm3_title_body((string)$f['body']); $slides[] = ['kind' => 'news', 'tag' => 'Featured', 'icon' => 'ph ph-sparkle', 'title' => $t, 'd' => $d, 'cta' => 'See the post', 'post' => (string)$f['postId']]; }
    }
    return ['ok' => true, 'slides' => $slides];
}

function cm3_title_body(string $body): array {
    $body = trim($body);
    $lines = preg_split('/\R/', $body) ?: [$body];
    $first = trim((string)$lines[0]);
    if (mb_strlen($first) <= 70 && count($lines) > 1) return [$first, mb_substr(trim(implode(' ', array_slice($lines, 1))), 0, 160)];
    $cut = preg_split('/(?<=[.!?])\s+/', $body, 2) ?: [$body];
    $t = mb_strlen((string)$cut[0]) <= 80 ? (string)$cut[0] : mb_substr($body, 0, 70) . '…';
    return [$t, mb_substr(trim((string)($cut[1] ?? '')), 0, 160)];
}

function cm3_due_words(string $due): string {
    $t = strtotime(str_replace(' ', 'T', $due));
    if (!$t) return $due;
    return gmdate('D j M', $t) . (strlen($due) > 10 ? ' · ' . ltrim(gmdate('g:i a', $t), '0') : '');
}

/* ── Post kinds, media meta, code ─────────────────────────────────────────── */

/** "0:00 Intro / 1:20 Wiring" → [[0,"Intro"],[80,"Wiring"]], sorted, from 0. */
function cm3_parse_chapters(string $text): array {
    $out = [];
    foreach (preg_split('/\R/', $text) ?: [] as $line) {
        if (!preg_match('/^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–·]?\s*(.+?)\s*$/u', $line, $m)) continue;
        $t = (int)$m[1] * 3600 + (int)$m[2] * 60 + (int)$m[3];
        $out[] = [$t, mb_substr($m[4], 0, 80)];
        if (count($out) >= CM3_CHAPTERS_MAX) break;
    }
    usort($out, fn($a, $b) => $a[0] <=> $b[0]);
    if ($out && $out[0][0] !== 0) array_unshift($out, [0, 'Start']);
    return $out;
}

/** A WebVTT or SRT file's text → [[seconds, text], …]. Styling tags dropped. */
function cm3_parse_captions(string $src): array {
    $src = substr(str_replace("\r", '', $src), 0, CM3_CAPTION_BYTES);
    $out = [];
    foreach (preg_split('/\n{2,}/', $src) ?: [] as $block) {
        if (!preg_match('/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->/', $block, $m)) continue;
        $t = (int)$m[1] * 3600 + (int)$m[2] * 60 + (int)$m[3];
        $lines = explode("\n", $block); $txt = [];
        $after = false;
        foreach ($lines as $l) { if ($after) $txt[] = trim(strip_tags($l)); if (strpos($l, '-->') !== false) $after = true; }
        $text = trim(implode(' ', array_filter($txt, 'strlen')));
        if ($text === '') continue;
        $out[] = [$t, mb_substr($text, 0, 300)];
        if (count($out) >= CM3_CAPTION_CUES) break;
    }
    return $out;
}

/** The media-meta, code and kind fields community_post_create() stores. Refusals
 *  are returned as ['error' => …]; otherwise the columns to merge into the row. */
function cm3_post_extras(string $viewer, string $kind, array $d, string $mediaType): array {
    $staff = community_actor_is_staff($viewer);
    if (in_array($kind, CM3_STAFF_KINDS, true) && !$staff)
        return ['error' => 'forbidden', 'message' => 'Only instructors and the community team can post ' . ($kind === 'announce' ? 'announcements' : 'homework') . '.'];
    $cols = ['answerId' => '', 'homeworkId' => '', 'mediaMeta' => '', 'mediaCode' => ''];
    $meta = [];
    if ($mediaType === 'video') {
        $ch = cm3_parse_chapters((string)($d['chapters'] ?? ''));
        $cap = cm3_parse_captions((string)($d['captions'] ?? ''));
        if ($ch) $meta['chapters'] = $ch;
        if ($cap) $meta['captions'] = $cap;
        $title = mb_substr(trim((string)($d['videoTitle'] ?? '')), 0, 120);
        if ($title !== '') $meta['title'] = $title;
    }
    if ($mediaType === 'code') {
        $code = (string)($d['code'] ?? '');
        if (trim($code) === '') return ['error' => 'empty', 'message' => 'Paste some code to share.'];
        if (strlen($code) > CM3_CODE_MAX) return ['error' => 'code_too_big', 'message' => 'Keep shared code under 20,000 characters.'];
        $cols['mediaCode'] = $code;
        $meta['title'] = mb_substr(trim((string)($d['codeTitle'] ?? '')), 0, 80) ?: 'index.html';
        $hint = mb_substr(trim((string)($d['hint'] ?? '')), 0, 600);
        if ($hint !== '' && $staff) $meta['hint'] = $hint;
    }
    if ($meta) $cols['mediaMeta'] = json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $cols;
}

/** Set the task behind a homework post, before the post is written. */
function cm3_homework_for_post(string $viewer, string $channel, array $d, string $body): array {
    $title = trim((string)($d['hwTitle'] ?? ''));
    if (mb_strlen($title) < 3) return ['ok' => false, 'error' => 'hw_title', 'message' => 'Give the homework a title.'];
    $r = community_homework_set(['memberId' => $viewer, 'data' => ['channel' => $channel, 'title' => $title, 'detail' => $body, 'dueAt' => trim((string)($d['hwDue'] ?? ''))]]);
    if (empty($r['ok'])) return ['ok' => false, 'error' => 'hw_refused', 'message' => (string)($r['error'] ?? 'That homework could not be set.')];
    return $r;
}

/** The v3 fields on a post's shape (merged by community_post_shape). Captions
 *  and code are NOT sent with a feed page — community.media fetches them. */
function cm3_shape_extras(array $row, string $viewer): array {
    $meta = json_decode((string)($row['mediaMeta'] ?? ''), true) ?: [];
    $code = (string)($row['mediaCode'] ?? '');
    $authorId = (string)$row['authorId'];
    return [
        'answerId' => (string)($row['answerId'] ?? ''), 'answered' => (string)($row['answerId'] ?? '') !== '',
        'homeworkId' => (string)($row['homeworkId'] ?? ''),
        'authorKey' => cm3_key($authorId), 'authorRole' => cm3_role_label($authorId),
        'video' => (string)$row['mediaType'] === 'video' ? ['title' => (string)($meta['title'] ?? ''), 'chapters' => count((array)($meta['chapters'] ?? [])),
            'captions' => !empty($meta['captions'])] : null,
        'code' => (string)$row['mediaType'] === 'code' ? ['title' => (string)($meta['title'] ?? 'index.html'),
            'peek' => implode("\n", array_slice(explode("\n", $code), 0, 9)), 'hasHint' => !empty($meta['hint'])] : null,
        'mentionsMe' => $authorId !== $viewer && ($h = cm3_handle($viewer)) !== '' && in_array($h, community_mentions((string)$row['body']), true),
    ];
}

/** The viewer's @handle, once per request. */
function cm3_handle(string $viewer): string {
    static $h = [];
    if ($viewer === '') return '';
    return $h[$viewer] ??= community_handle_for($viewer);
}

/** community.media — a video's chapters, captions, points and the viewer's
 *  place in it; a code post's source and hint. */
function community_v3_media(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $pid = (string)($p['postId'] ?? '');
    $r = db_row('SELECT * FROM community_posts WHERE postId = ? LIMIT 1', [$pid]);
    if (!$r || ((string)$r['status'] !== 'published' && (string)$r['authorId'] !== $viewer && cm3_role($viewer) !== 'admin')) return ['ok' => false, 'error' => 'not_found'];
    $meta = json_decode((string)($r['mediaMeta'] ?? ''), true) ?: [];
    $pos = db_row('SELECT pos, dur FROM community_video_progress WHERE memberId = ? AND postId = ?', [$viewer, $pid]);
    return ['ok' => true, 'postId' => $pid, 'type' => (string)$r['mediaType'], 'url' => (string)$r['mediaUrl'], 'poster' => (string)$r['mediaPoster'],
        'title' => (string)($meta['title'] ?? ''), 'duration' => (int)($r['mediaDuration'] ?? 0),
        'chapters' => (array)($meta['chapters'] ?? []), 'captions' => (array)($meta['captions'] ?? []), 'points' => (array)($meta['points'] ?? []),
        'code' => (string)($r['mediaCode'] ?? ''), 'hint' => (string)($meta['hint'] ?? ''),
        'pos' => (int)($pos['pos'] ?? 0)];
}

/** community.videoPos — remember where this member stopped (0 = start over). */
function community_v3_video_pos(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $pid = (string)($p['postId'] ?? '');
    if ($viewer === '' || !db_row("SELECT id FROM community_posts WHERE postId = ? AND mediaType = 'video'", [$pid])) return ['ok' => false, 'error' => 'not_found'];
    $pos = max(0, min(86400, (int)($p['pos'] ?? 0))); $dur = max(0, min(86400, (int)($p['dur'] ?? 0)));
    if (db_row('SELECT id FROM community_video_progress WHERE memberId = ? AND postId = ?', [$viewer, $pid]))
        db_update('community_video_progress', ['pos' => $pos, 'dur' => $dur, 'updatedAt' => now_iso()], ['memberId' => $viewer, 'postId' => $pid]);
    else db_insert('community_video_progress', ['memberId' => $viewer, 'postId' => $pid, 'pos' => $pos, 'dur' => $dur, 'updatedAt' => now_iso()]);
    return ['ok' => true, 'pos' => $pos];
}

/** community.videoPoints — the Summary tab: key points written from the
 *  captions by the AI, once, then kept. A human can still watch the part. */
function community_v3_video_points(array $p): array {
    $m = community_v3_media($p);
    if (empty($m['ok'])) return $m;
    if ($m['points']) return ['ok' => true, 'points' => $m['points']];
    if (!$m['captions'] || !function_exists('ai_enabled') || !ai_enabled('analysis') || !function_exists('ai_complete')) return ['ok' => true, 'points' => []];
    $lines = implode("\n", array_map(fn($c) => $c[0] . "s: " . $c[1], array_slice($m['captions'], 0, 300)));
    $ai = ai_complete("Summarise this children's video for other children. Return 3 to 6 lines, each `<seconds>|<one short sentence>`, using the time where the point starts. No names beyond first names. Plain British English.", $lines, 400, 'analysis');
    $out = !empty($ai['ok']) ? (string)$ai['text'] : '';
    $pts = [];
    foreach (preg_split('/\R/', $out) ?: [] as $l) if (preg_match('/^\s*(\d{1,5})\s*\|\s*(.{4,200})$/u', $l, $mm)) $pts[] = [(int)$mm[1], trim($mm[2])];
    if ($pts) {
        $r = db_row('SELECT mediaMeta FROM community_posts WHERE postId = ?', [$m['postId']]);
        $meta = json_decode((string)($r['mediaMeta'] ?? ''), true) ?: [];
        $meta['points'] = array_slice($pts, 0, 6);
        db_update('community_posts', ['mediaMeta' => json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)], ['postId' => $m['postId']]);
    }
    return ['ok' => true, 'points' => array_slice($pts, 0, 6)];
}

/** community.answer — mark (or unmark) a reply as the answer to a question.
 *  The asker or any staff member may; the reply must be on that question. */
function community_v3_answer(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $pid = (string)($p['postId'] ?? ''); $cid = (string)($p['commentId'] ?? '');
    $post = db_row('SELECT postId, authorId, kind, answerId FROM community_posts WHERE postId = ? LIMIT 1', [$pid]);
    if (!$post) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$post['kind'] !== 'question') return ['ok' => false, 'error' => 'not_a_question'];
    if ((string)$post['authorId'] !== $viewer && !community_actor_is_staff($viewer)) return ['ok' => false, 'error' => 'forbidden'];
    if ($cid !== '' && !db_row("SELECT id FROM community_comments WHERE commentId = ? AND postId = ? AND status = 'published'", [$cid, $pid])) return ['ok' => false, 'error' => 'not_found'];
    $new = $cid === (string)$post['answerId'] ? '' : $cid;
    db_update('community_posts', ['answerId' => $new, 'updatedAt' => now_iso()], ['postId' => $pid]);
    if ($new !== '') {
        $c = db_row('SELECT memberId FROM community_comments WHERE commentId = ?', [$new]);
        if ($c && (string)$c['memberId'] !== $viewer) community_notify((string)$c['memberId'], $viewer, 'community.answer', 'Your reply was marked as the answer', 'Someone found your reply helpful.', false, $pid);
    }
    audit('community.answer', $viewer, $pid, ['commentId' => $new]);
    return ['ok' => true, 'answerId' => $new];
}

/* ── Homework, in the shape the design draws ─────────────────────────────── */

/** community.hwBoard — every active task in the viewer's channels: theirs, with
 *  status; and, for staff, each child's state, for the tracker. */
function community_v3_hw_board(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $staff = community_actor_is_staff($viewer);
    $mine = cm3_my_channels($viewer);
    if (!$mine) return ['ok' => true, 'homework' => []];
    $ph = implode(',', array_fill(0, count($mine), '?'));
    $tasks = db_all("SELECT h.*, c.slug FROM community_homework h JOIN community_channels c ON c.channelId = h.channelId
                     WHERE h.status = 'active' AND c.slug IN ($ph) ORDER BY h.createdAt DESC LIMIT 40", $mine);
    $out = [];
    $today = time();
    foreach ($tasks as $h) {
        $hid = (string)$h['homeworkId'];
        $state = db_all('SELECT * FROM community_homework_state WHERE homeworkId = ? ORDER BY memberName', [$hid]);
        $nudged = $staff ? array_flip(array_column(db_all('SELECT memberId FROM community_homework_nudge WHERE homeworkId = ? AND nudgedDay = ?', [$hid, gmdate('Y-m-d')]), 'memberId')) : [];
        $me = null; foreach ($state as $s) if ((string)$s['memberId'] === $viewer) $me = $s;
        $due = (string)$h['dueAt']; $dueT = $due !== '' ? strtotime(str_replace(' ', 'T', $due)) : 0;
        $meSt = !$me ? '' : ((string)$me['reviewedAt'] !== '' ? 'reviewed' : ((string)$me['submittedAt'] !== '' ? 'waiting' : ($dueT && $dueT < $today ? 'late' : 'todo')));
        $setBy = (string)$h['createdByName'] ?: (community_author((string)$h['createdBy'])['name'] ?? 'Your instructor');
        $row = ['id' => $hid, 'ch' => (string)$h['slug'], 'by' => cm3_key((string)$h['createdBy']), 'byName' => $setBy, 'title' => (string)$h['title'],
            'due' => $due !== '' ? 'Due ' . cm3_due_words($due) : 'No due date', 'dueShort' => $due !== '' ? 'Due ' . gmdate('D', (int)$dueT) : 'Any time',
            'set' => gmdate('D j M', strtotime((string)$h['createdAt']) ?: time()), 'detail' => (string)$h['detail'],
            'me' => $meSt, 'myNote' => $me ? (string)($me['note'] ?? '') : '', 'reviewedAt' => $me ? (string)$me['reviewedAt'] : ''];
        if ($staff) $row['cohort'] = array_map(fn($s) => ['id' => (string)$s['memberId'], 'name' => (string)$s['memberName'],
            'state' => (string)$s['reviewedAt'] !== '' ? 'reviewed' : ((string)$s['submittedAt'] !== '' ? 'waiting' : 'missing'),
            'what' => (string)$s['submittedAt'] !== '' ? ((string)($s['note'] ?? '') ?: 'Handed in') : ((string)($s['seenAt'] ?? '') !== '' ? 'seen' : ''),
            'nudged' => isset($nudged[(string)$s['memberId']])], $state);
        if ($meSt !== '' || $staff) $out[] = $row;
    }
    return ['ok' => true, 'homework' => $out];
}

/* ── Moderation and safeguarding ──────────────────────────────────────────── */

/** Why an item is in the queue, in the words the design uses, and which filter it sits under. */
function cm3_queue_kind(array $row): array {
    $mod = json_decode((string)($row['moderation'] ?? ''), true) ?: [];
    $reports = (int)($row['reportCount'] ?? 0) - (!empty($mod['autoFlagged']) ? 1 : 0);
    if ((string)($row['mediaType'] ?? '') === 'video' && (string)$row['status'] === 'pending') return ['video', 'Videos always wait for a person.'];
    if ($reports > 0) return ['reported', 'Reported by ' . $reports . ($reports === 1 ? ' member.' : ' members.')];
    $why = (string)($mod['why'] ?? '') ?: ((string)($mod['reason'] ?? '') !== '' ? 'The screen was unsure: ' . (string)$mod['reason'] . '.' : 'The screen was unsure about this.');
    return ['held', $why];
}

/** admin.community.stats — the moderation header: counts by filter and the
 *  median time to a decision this week (only decisions a person made). */
function admin_community_stats(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $since = gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400);
    $mins = [];
    foreach (db_all("SELECT createdAt, reviewedAt FROM community_posts WHERE reviewedAt <> '' AND reviewedAt >= ?", [$since]) as $r) {
        $a = strtotime((string)$r['createdAt']); $b = strtotime((string)$r['reviewedAt']);
        if ($a && $b && $b >= $a) $mins[] = (int)round(($b - $a) / 60);
    }
    sort($mins);
    $n = count($mins);
    $median = $n ? ($n % 2 ? $mins[intdiv($n, 2)] : (int)round(($mins[$n / 2 - 1] + $mins[$n / 2]) / 2)) : null;
    $counts = ['held' => 0, 'video' => 0, 'reported' => 0];
    foreach (db_all("SELECT status, mediaType, reportCount, moderation FROM community_posts WHERE status = 'pending' OR (reportCount > 0 AND status = 'published')") as $r) $counts[cm3_queue_kind($r)[0]]++;
    $counts['reported'] += (int)(db_row("SELECT COUNT(*) c FROM community_comments WHERE reportCount > 0 AND status = 'published'")['c'] ?? 0);
    $counts['held'] += (int)(db_row("SELECT COUNT(*) c FROM community_comments WHERE status = 'pending'")['c'] ?? 0);
    return ['ok' => true, 'medianMinutes' => $median, 'decisions' => $n, 'counts' => $counts, 'mode' => community_moderation_mode()];
}

/** admin.community.health — the Health tab, from real activity. */
function admin_community_health(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $days = [];
    for ($i = 6; $i >= 0; $i--) { $d = gmdate('Y-m-d', time() - $i * 86400); $days[$d] = 0; }
    foreach (db_all("SELECT substr(createdAt,1,10) d, COUNT(*) c FROM community_posts WHERE status = 'published' AND createdAt >= ? GROUP BY d", [array_key_first($days)]) as $r)
        if (isset($days[(string)$r['d']])) $days[(string)$r['d']] = (int)$r['c'];
    $month = gmdate('Y-m-d', time() - 30 * 86400);
    $active = [];
    foreach (db_all("SELECT DISTINCT authorId, authorCentre FROM community_posts WHERE createdAt >= ? AND status = 'published'", [$month]) as $r) $active[(string)$r['authorCentre']][(string)$r['authorId']] = 1;
    foreach (db_all("SELECT DISTINCT c.memberId, m.centre FROM community_comments c JOIN members m ON m.memberId = c.memberId WHERE c.createdAt >= ?", [$month]) as $r) $active[(string)$r['centre']][(string)$r['memberId']] = 1;
    $centres = [];
    foreach (db_all("SELECT centre, COUNT(*) c FROM members WHERE type = 'NGG' AND status = 'active' AND COALESCE(centre,'') <> '' GROUP BY centre") as $r)
        $centres[] = [(string)$r['centre'], (int)$r['c'] ? (int)round(count($active[(string)$r['centre']] ?? []) / (int)$r['c'] * 100) : 0];
    usort($centres, fn($a, $b) => $b[1] <=> $a[1]);
    $week = gmdate('Y-m-d', time() - 7 * 86400);
    $top = [];
    foreach (db_all("SELECT c.name, COUNT(p.id) n, SUM(CASE WHEN p.kind = 'question' AND p.answerId = '' THEN 1 ELSE 0 END) open FROM community_posts p JOIN community_channels c ON c.channelId = p.channelId
                     WHERE p.status = 'published' AND p.createdAt >= ? GROUP BY c.name ORDER BY n DESC LIMIT 5", [$week]) as $r)
        $top[] = [(string)$r['name'], (int)$r['n'], (int)$r['open'] ? (int)$r['open'] . ' unanswered ' . ((int)$r['open'] === 1 ? 'question' : 'questions') : 'All questions answered'];
    $quiet = [];
    foreach (db_all("SELECT c.name, MAX(p.createdAt) last FROM community_channels c LEFT JOIN community_posts p ON p.channelId = c.channelId AND p.status = 'published'
                     WHERE c.status = 'active' GROUP BY c.channelId, c.name") as $r) {
        $last = (string)$r['last'];
        if ($last === '' || $last < gmdate('Y-m-d', time() - 14 * 86400)) $quiet[] = [(string)$r['name'], $last === '' ? 'Nobody has posted yet' : 'Last post ' . gmdate('j M', strtotime($last))];
    }
    $posts7 = array_sum($days);
    $prev = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE status = 'published' AND createdAt >= ? AND createdAt < ?", [gmdate('Y-m-d', time() - 14 * 86400), array_key_first($days)])['c'] ?? 0);
    $askers = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE kind = 'question' AND status = 'published' AND createdAt >= ?", [$week])['c'] ?? 0);
    $answered = (int)(db_row("SELECT COUNT(*) c FROM community_posts WHERE kind = 'question' AND status = 'published' AND createdAt >= ? AND answerId <> ''", [$week])['c'] ?? 0);
    $voices = (int)(db_row("SELECT COUNT(DISTINCT authorId) c FROM community_posts WHERE status = 'published' AND createdAt >= ?", [$week])['c'] ?? 0);
    $delta = $prev ? (int)round(($posts7 - $prev) / $prev * 100) : 0;
    return ['ok' => true,
        'stats' => [['Posts this week', (string)$posts7, 'vs ' . $prev . ' the week before', $prev ? ($delta >= 0 ? '+' . $delta . '%' : $delta . '%') : 'steady'],
                    ['Different voices', (string)$voices, 'people who posted this week', ''],
                    ['Questions answered', $askers ? (int)round($answered / $askers * 100) . '%' : '—', $answered . ' of ' . $askers . ' this week', '']],
        'days' => array_map(fn($d, $n) => [gmdate('D', strtotime($d)), $n], array_keys($days), array_values($days)),
        'centres' => array_slice($centres, 0, 8), 'top' => $top, 'quiet' => array_slice($quiet, 0, 6)];
}

/** Raise a safeguarding case from a person's decision (a report or an
 *  escalation) rather than from the crisis screen. */
function cm3_case_from_post(string $postId, string $byId, string $source, string $severity, string $note = ''): string {
    $p = db_row('SELECT p.*, c.slug FROM community_posts p LEFT JOIN community_channels c ON c.channelId = p.channelId WHERE p.postId = ? LIMIT 1', [$postId]);
    if (!$p) return '';
    $caseId = community_raise_safeguarding((string)$p['authorId'], 'post', (string)$p['body'], (string)($p['slug'] ?? ''));
    db_update('community_safeguarding', ['severity' => in_array($severity, ['high', 'medium', 'low'], true) ? $severity : 'high',
        'postId' => $postId, 'source' => $source, 'note' => mb_substr($note, 0, 600)], ['caseId' => $caseId]);
    audit('community.safeguarding.raise', $byId, $caseId, ['postId' => $postId, 'source' => $source]);
    return $caseId;
}

/** admin.community.safeguarding.update — a lead takes a case, sets its
 *  severity, moves it on. Trained leads only (`safeguarding`). */
function admin_community_safeguarding_update(array $p): array {
    $g = admin_cap_gate($p, 'safeguarding'); if (!$g['ok']) return $g;
    $id = (string)($p['caseId'] ?? '');
    $c = db_row('SELECT * FROM community_safeguarding WHERE caseId = ? LIMIT 1', [$id]);
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    $me = (string)$g['requester']['memberId'];
    $set = [];
    if (isset($p['severity'])) { $sv = (string)$p['severity']; if (!in_array($sv, ['high', 'medium', 'low'], true)) return ['ok' => false, 'error' => 'bad_severity']; $set['severity'] = $sv; }
    if (!empty($p['take'])) { $set['leadId'] = $me; $set['leadName'] = (string)$g['requester']['fullName']; if ((string)$c['status'] === 'open') $set['status'] = 'in_progress'; }
    if (isset($p['status'])) {
        $st = (string)$p['status'];
        if (!in_array($st, ['open', 'in_progress', 'acknowledged', 'closed'], true)) return ['ok' => false, 'error' => 'bad_status'];
        $set['status'] = $st;
        if ($st === 'acknowledged' || $st === 'closed') { $set['acknowledgedBy'] = $me; $set['acknowledgedAt'] = now_iso(); }
    }
    if (isset($p['note'])) $set['note'] = mb_substr(trim((string)$p['note']), 0, 600);
    if (!$set) return ['ok' => false, 'error' => 'nothing_to_change'];
    db_update('community_safeguarding', $set, ['caseId' => $id]);
    audit('community.safeguarding.update', $me, $id, $set);
    return ['ok' => true];
}

/** The extra moderation acts the v3 queue offers, run by admin_community_moderate. */
function cm3_moderate_extra(array $g, string $act, string $pid, array $p): ?array {
    $by = (string)$g['requester']['memberId'];
    $post = db_row('SELECT * FROM community_posts WHERE postId = ? LIMIT 1', [$pid]);
    if (!$post) return ['ok' => false, 'error' => 'not_found'];
    if ($act === 'edit') {
        $body = mb_substr(trim((string)($p['body'] ?? '')), 0, 2000);
        if ($body === '') return ['ok' => false, 'error' => 'empty'];
        $mod = json_decode((string)$post['moderation'], true) ?: [];
        $mod['editedBy'] = $by; $mod['editedAt'] = now_iso(); $mod['original'] = mb_substr((string)$post['body'], 0, 2000);
        db_update('community_posts', ['body' => $body, 'status' => 'published', 'reportCount' => 0, 'moderation' => json_encode($mod, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'reviewedAt' => now_iso(), 'reviewedBy' => $by, 'updatedAt' => now_iso()], ['postId' => $pid]);
        community_post_on_published($pid);
        community_notify((string)$post['authorId'], $by, 'community.edited', 'Your post is live, with a small change', 'A mentor edited your post before it went up, to keep it safe and kind.', false, $pid);
        audit('community.moderate.post', $by, $pid, ['action' => 'edit']);
        return ['ok' => true];
    }
    if ($act === 'message') {
        $note = mb_substr(trim((string)($p['note'] ?? '')), 0, 500);
        if ($note === '') return ['ok' => false, 'error' => 'note_required', 'message' => 'Write what you want to say to them.'];
        community_notify((string)$post['authorId'], $by, 'community.mentor', 'A message from a mentor about your post', $note, false, $pid);
        audit('community.moderate.message', $by, $pid, []);
        return ['ok' => true];
    }
    if ($act === 'escalate') {
        $caseId = cm3_case_from_post($pid, $by, 'escalated', (string)($p['severity'] ?? 'high'), (string)($p['note'] ?? ''));
        // Out of everyone's sight while a lead looks, and out of this queue: it is the lead's now.
        db_update('community_posts', ['status' => 'hidden', 'reviewedAt' => now_iso(), 'reviewedBy' => $by, 'updatedAt' => now_iso()], ['postId' => $pid]);
        audit('community.moderate.post', $by, $pid, ['action' => 'escalate', 'caseId' => $caseId]);
        return ['ok' => true, 'caseId' => $caseId];
    }
    return null;
}

/* ── Files ───────────────────────────────────────────────────────────────── */

function cm3_size(int $bytes, int $pages, int $secs, string $kind): string {
    if ($kind === 'videos' && $secs > 0) return intdiv($secs, 60) . ':' . str_pad((string)($secs % 60), 2, '0', STR_PAD_LEFT);
    if ($kind === 'docs' && $pages > 0) return $pages . ($pages === 1 ? ' page' : ' pages');
    if ($bytes <= 0) return '';
    return $bytes >= 1048576 ? round($bytes / 1048576, 1) . ' MB' : max(1, (int)round($bytes / 1024)) . ' KB';
}

/** community.v3files — every photo, video, document, code post and link shared
 *  in the viewer's channels (or one of them), newest first. */
function community_v3_files(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    if ($viewer === '') return ['ok' => false, 'error' => 'forbidden'];
    $slugs = cm3_my_channels($viewer);
    $one = (string)($p['channel'] ?? '');
    if ($one !== '') $slugs = in_array($one, $slugs, true) || community_actor_is_staff($viewer) ? [$one] : [];
    if (!$slugs) return ['ok' => true, 'files' => []];
    $ph = implode(',', array_fill(0, count($slugs), '?'));
    $rows = db_all("SELECT p.postId, p.authorId, p.authorName, p.body, p.mediaType, p.mediaUrl, p.mediaPoster, p.altText, p.mediaFormat, p.mediaBytes,
                           p.mediaPages, p.mediaDuration, p.mediaMeta, p.mediaCode, p.linkPreview, p.createdAt, c.slug
                      FROM community_posts p JOIN community_channels c ON c.channelId = p.channelId
                     WHERE p.status = 'published' AND c.slug IN ($ph) AND (p.mediaType <> 'none' OR COALESCE(p.linkPreview,'') <> '')
                     ORDER BY p.createdAt DESC LIMIT 300", $slugs);
    $map = ['image' => 'photos', 'video' => 'videos', 'doc' => 'docs', 'code' => 'code'];
    $out = [];
    foreach ($rows as $r) {
        $mt = (string)$r['mediaType'];
        $lp = json_decode((string)($r['linkPreview'] ?? ''), true) ?: [];
        $kind = $map[$mt] ?? ($lp ? 'links' : '');
        if ($kind === '') continue;
        $meta = json_decode((string)($r['mediaMeta'] ?? ''), true) ?: [];
        $fmt = (string)($r['mediaFormat'] ?? '') ?: upload_ext((string)$r['mediaUrl']);
        $name = $kind === 'links' ? ((string)($lp['title'] ?? '') ?: (string)($lp['url'] ?? 'Link'))
              : ($kind === 'code' ? (string)($meta['title'] ?? 'index.html')
              : ($kind === 'videos' ? ((string)($meta['title'] ?? '') ?: (mb_substr(trim((string)$r['body']), 0, 60) ?: 'Video'))
              : ((string)$r['altText'] ?: (mb_substr(trim((string)$r['body']), 0, 60) ?: ($kind === 'docs' ? 'Document' : 'Photo')))));
        $out[] = ['postId' => (string)$r['postId'], 'kind' => $kind, 'ch' => (string)$r['slug'], 'name' => $name,
            'by' => cm3_key((string)$r['authorId']), 'byName' => (string)$r['authorName'], 'createdAt' => (string)$r['createdAt'],
            'size' => $kind === 'links' ? (string)($lp['site'] ?? parse_url((string)($lp['url'] ?? ''), PHP_URL_HOST) ?? '') : ($kind === 'code' ? strlen((string)$r['mediaCode']) . ' characters' : cm3_size((int)$r['mediaBytes'], (int)$r['mediaPages'], (int)$r['mediaDuration'], $kind)),
            'url' => $kind === 'links' ? (string)($lp['url'] ?? '') : (string)$r['mediaUrl'], 'poster' => (string)$r['mediaPoster'] ?: (string)($lp['image'] ?? ''),
            'format' => $fmt, 'peek' => $kind === 'code' ? implode("\n", array_slice(explode("\n", (string)$r['mediaCode']), 0, 6)) : ''];
    }
    return ['ok' => true, 'files' => $out];
}
