<?php
declare(strict_types=1);

/**
 * community-engagement.php — whether the community is actually a community.
 *
 * WHAT THIS DELIBERATELY DOES NOT MEASURE.
 *
 * Post count, reaction count and member count are the three numbers every
 * community dashboard leads with, and all three can rise while the thing dies.
 * A channel where one enthusiastic child posts forty times to silence scores
 * beautifully on all of them. So none of them is a headline here; they appear
 * only as denominators.
 *
 * WHAT IT MEASURES INSTEAD. Six signals, each chosen because it can only move
 * if something real happened between two people:
 *
 *   Reply rate     — the share of posts that got at least one comment. A
 *                    channel where nobody replies is a noticeboard.
 *   Contributors   — DISTINCT people who posted, commented, reacted or voted,
 *                    as a share of the people who could have. One child
 *                    posting forty times is not a community of forty.
 *   Reach          — the share of the audience that actually opened the
 *                    channel in the window (community_reads). Posting into a
 *                    room nobody walks into is not engagement.
 *   Return rate    — of the people who took part in the PREVIOUS window, the
 *                    share who took part in this one. The single best health
 *                    signal there is, and nothing here computed it before.
 *   Answer speed   — median hours to a post's first reply. For a programme
 *                    serving 10–17 year olds this is the one that matters
 *                    most: a child who posts and waits two days for an answer
 *                    has learnt something about whether anybody is listening.
 *   Unanswered     — posts with no reply at all, NAMED, so somebody can go and
 *                    answer them. A metric a mentor cannot act on is a metric
 *                    that changes nothing.
 *
 * PER PERSON, there is a participation ladder rather than a score, because
 * "engaged" is not one thing:
 *
 *   silent   — has not opened the community in the window
 *   reader   — opened it, said nothing
 *   reactor  — reacted or voted, but wrote nothing
 *   replier  — wrote comments
 *   poster   — started conversations of their own
 *
 * A reader is NOT a failure. Most healthy communities are mostly readers, and
 * a tool that treats reading as nothing will push mentors to badger quiet
 * children into performing. The band that matters is `quiet` — took part
 * before, has stopped now — because that one is actionable and nothing else
 * in the product surfaces it.
 *
 * Read-only; gated by the `audit` (M&E) capability, like the staff-side
 * engagement it sits beside. Ops: admin.community.engagement.
 */

const CENG_DEFAULT_DAYS = 30;
/* A post younger than this has not had a fair chance to be answered, so it is
 * excluded from both the reply rate and the unanswered list. Otherwise every
 * report run in the morning would show the previous evening as a failure. */
const CENG_GRACE_HOURS  = 24;
/* Bands for the channel health headline. Reply rate is the anchor, because it
 * is the one signal that cannot be produced by a single person. */
const CENG_BAND_HEALTHY = 60;
const CENG_BAND_QUIET   = 30;

function _ceng_iso(int $ts): string { return gmdate('Y-m-d\TH:i:s\Z', $ts); }

function _ceng_pct(int $part, int $whole): int {
    return $whole > 0 ? (int)round($part * 100 / $whole) : 0;
}

/** Hours between two ISO-ish timestamps, or null if either is unusable. */
function _ceng_hours(string $from, string $to): ?float {
    $a = strtotime(trim($from)); $b = strtotime(trim($to));
    if ($a === false || $b === false || $b < $a) return null;
    return ($b - $a) / 3600;
}

/** The middle value. Median, not mean: one post answered a fortnight late
 *  drags a mean far enough to hide a channel that is otherwise responsive. */
function _ceng_median(array $xs): ?float {
    $xs = array_values(array_filter($xs, fn($x) => $x !== null));
    if (!$xs) return null;
    sort($xs);
    $n = count($xs); $m = intdiv($n, 2);
    return $n % 2 ? (float)$xs[$m] : (($xs[$m - 1] + $xs[$m]) / 2);
}

function _ceng_band(int $replyPct): string {
    if ($replyPct >= CENG_BAND_HEALTHY) return 'healthy';
    if ($replyPct >= CENG_BAND_QUIET) return 'quiet';
    return 'noticeboard';
}

/**
 * Everyone who did something in the community between two instants.
 *
 * Returns [memberId => ['post'=>n,'comment'=>n,'react'=>n,'vote'=>n]]. Reads
 * are NOT in here: opening a channel is not taking part, and folding it in
 * would make the return rate impossible to fail. Reading is scored separately,
 * where it belongs.
 */
function ceng_actors(string $from, string $to, string $channelId = ''): array {
    $out = [];
    $bump = function (string $id, string $k) use (&$out) {
        $id = trim($id);
        if ($id === '') return;
        if (!isset($out[$id])) $out[$id] = ['post' => 0, 'comment' => 0, 'react' => 0, 'vote' => 0];
        $out[$id][$k]++;
    };

    $chP = $channelId !== '' ? ' AND channelId = ?' : '';
    $argP = $channelId !== '' ? [$from, $to, $channelId] : [$from, $to];
    foreach (db_all("SELECT authorId FROM community_posts
                      WHERE status = 'published' AND createdAt >= ? AND createdAt < ?$chP", $argP) as $r) {
        $bump((string)$r['authorId'], 'post');
    }

    /* Comments, reactions and votes hang off a POST, so scoping them to a
       channel means joining back to it — done in SQL rather than by pulling
       every post id into PHP, which on a busy month is thousands of ids in an
       IN() clause. */
    $join = $channelId !== ''
        ? ' JOIN community_posts p ON p.postId = x.postId AND p.channelId = ?' : '';
    $args = $channelId !== '' ? [$channelId, $from, $to] : [$from, $to];

    foreach (db_all("SELECT x.memberId FROM community_comments x$join
                      WHERE x.status = 'published' AND x.createdAt >= ? AND x.createdAt < ?", $args) as $r) {
        $bump((string)$r['memberId'], 'comment');
    }
    foreach (db_all("SELECT x.memberId FROM community_reactions x$join
                      WHERE x.createdAt >= ? AND x.createdAt < ?", $args) as $r) {
        $bump((string)$r['memberId'], 'react');
    }
    foreach (db_all("SELECT x.memberId FROM community_poll_votes x$join
                      WHERE x.createdAt >= ? AND x.createdAt < ?", $args) as $r) {
        $bump((string)$r['memberId'], 'vote');
    }
    return $out;
}

/** Members who opened any channel (or one channel) inside the window. */
function ceng_readers(string $from, string $to, string $channelId = ''): array {
    $ch = $channelId !== '' ? ' AND channelId = ?' : '';
    $args = $channelId !== '' ? [$from, $to, $channelId] : [$from, $to];
    $out = [];
    foreach (db_all("SELECT DISTINCT memberId FROM community_reads
                      WHERE lastReadAt >= ? AND lastReadAt < ?$ch", $args) as $r) {
        $id = trim((string)$r['memberId']);
        if ($id !== '') $out[$id] = true;
    }
    return $out;
}

/**
 * Posts in the window that are old enough to have been answered, with the time
 * to their first reply.
 *
 * Returns [['postId','channelId','authorId','authorName','createdAt',
 *           'replies','firstReplyHours'|null], …]
 */
function ceng_posts_with_replies(string $from, string $to, string $channelId = ''): array {
    $ch = $channelId !== '' ? ' AND p.channelId = ?' : '';
    $args = $channelId !== '' ? [$from, $to, $channelId] : [$from, $to];
    $posts = db_all(
        "SELECT p.postId, p.channelId, p.authorId, p.authorName, p.authorCentre, p.body, p.createdAt
           FROM community_posts p
          WHERE p.status = 'published' AND p.createdAt >= ? AND p.createdAt < ?$ch
          ORDER BY p.createdAt ASC", $args);
    if (!$posts) return [];

    /* One pass over the comments rather than a query per post: a busy month is
       hundreds of posts, and a query each would be the slowest screen in the
       admin by an order of magnitude. */
    $firstBy = []; $countBy = [];
    foreach (db_all("SELECT postId, memberId, createdAt FROM community_comments
                      WHERE status = 'published' AND createdAt >= ?", [$from]) as $c) {
        $pid = (string)$c['postId'];
        $countBy[$pid] = ($countBy[$pid] ?? 0) + 1;
        $at = (string)$c['createdAt'];
        if (!isset($firstBy[$pid]) || $at < $firstBy[$pid]) $firstBy[$pid] = $at;
    }

    $out = [];
    foreach ($posts as $p) {
        $pid = (string)$p['postId'];
        $out[] = [
            'postId' => $pid,
            'channelId' => (string)$p['channelId'],
            'authorId' => (string)$p['authorId'],
            'authorName' => (string)$p['authorName'],
            'centre' => (string)$p['authorCentre'],
            'excerpt' => mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$p['body'])), 0, 90),
            'createdAt' => (string)$p['createdAt'],
            'replies' => (int)($countBy[$pid] ?? 0),
            'firstReplyHours' => isset($firstBy[$pid])
                ? _ceng_hours((string)$p['createdAt'], $firstBy[$pid]) : null,
        ];
    }
    return $out;
}

/**
 * The whole picture for one window, optionally for one channel.
 *
 * Everything is computed against TWO windows — the one asked for and the one
 * immediately before it — because a single window cannot tell you whether a
 * community is growing or emptying, and that is the only question worth
 * asking of it.
 */
function ceng_compute(int $days = CENG_DEFAULT_DAYS, string $channelSlug = ''): array {
    $days = max(1, min(365, $days));
    $now = time();
    $to     = _ceng_iso($now);
    $from   = _ceng_iso($now - $days * 86400);
    $prevTo = $from;
    $prev   = _ceng_iso($now - 2 * $days * 86400);
    /* The reply-rate cutoff. A post from an hour ago has not been ignored, it
       has simply not been answered yet. */
    $fair   = _ceng_iso($now - (int)(CENG_GRACE_HOURS * 3600));

    $channelId = ''; $channelName = '';
    if (trim($channelSlug) !== '') {
        $ch = db_row("SELECT channelId, name FROM community_channels WHERE slug = ? LIMIT 1", [$channelSlug]);
        if (!$ch) return ['ok' => false, 'error' => 'no_such_channel'];
        $channelId = (string)$ch['channelId']; $channelName = (string)$ch['name'];
    }

    $actors     = ceng_actors($from, $to, $channelId);
    $actorsPrev = ceng_actors($prev, $prevTo, $channelId);
    $readers    = ceng_readers($from, $to, $channelId);
    $posts      = ceng_posts_with_replies($from, $to, $channelId);

    /* Only posts old enough to have been answered count towards the reply
       rate, in either direction. */
    $judged = array_values(array_filter($posts, fn($p) => $p['createdAt'] < $fair));
    $answered = array_values(array_filter($judged, fn($p) => $p['replies'] > 0));
    $replyPct = _ceng_pct(count($answered), count($judged));
    $medianHours = _ceng_median(array_map(fn($p) => $p['firstReplyHours'], $answered));

    /* The denominator for reach and participation: members who have ever found
       the community at all. Measuring reach against the whole roster would
       mean a child who has never once opened it drags the number down for ever
       with nothing anybody can do about it inside the window — so the roster
       gap is reported separately, as its own number, which is the one growth
       actually needs. */
    $everIn = [];
    foreach (db_all("SELECT DISTINCT memberId FROM community_reads") as $r) $everIn[trim((string)$r['memberId'])] = true;
    foreach (db_all("SELECT DISTINCT authorId FROM community_posts WHERE status = 'published'") as $r) $everIn[trim((string)$r['authorId'])] = true;
    foreach (db_all("SELECT DISTINCT memberId FROM community_comments WHERE status = 'published'") as $r) $everIn[trim((string)$r['memberId'])] = true;
    unset($everIn['']);
    $audience = count($everIn);

    /* And how many on the active roster have never once turned up. Counted
       against the roster itself rather than by subtraction, because $everIn
       also holds staff and volunteers, who are not on it — subtracting would
       quietly report a negative gap as zero. */
    $roster = 0; $neverIn = 0;
    foreach (db_all("SELECT memberId FROM members WHERE status = 'active'") as $m) {
        $roster++;
        if (!isset($everIn[trim((string)$m['memberId'])])) $neverIn++;
    }

    /* Return rate: of the people who took part LAST window, how many took part
       in this one. Computed over people, not over events — a single person
       tripling their output must not look like the community holding on to
       three people it in fact lost. */
    $returned = count(array_intersect_key($actorsPrev, $actors));
    $returnPct = _ceng_pct($returned, count($actorsPrev));
    $newcomers = count(array_diff_key($actors, $actorsPrev));

    return [
        'window' => ['days' => $days, 'from' => $from, 'to' => $to,
                     'previousFrom' => $prev, 'graceHours' => CENG_GRACE_HOURS],
        'channel' => ['slug' => $channelSlug, 'name' => $channelName],
        'headline' => [
            /* Reply rate leads, because it is the only figure here that one
               determined person cannot manufacture on their own. */
            'replyRate' => $replyPct,
            'band' => _ceng_band($replyPct),
            'contributors' => count($actors),
            'contributorRate' => _ceng_pct(count($actors), $audience),
            'reach' => count($readers),
            'reachRate' => _ceng_pct(count($readers), $audience),
            'returnRate' => $returnPct,
            'returnedOf' => count($actorsPrev),
            'newcomers' => $newcomers,
            'medianFirstReplyHours' => $medianHours === null ? null : round($medianHours, 1),
            'posts' => count($posts),
            'postsJudged' => count($judged),
            'unanswered' => count($judged) - count($answered),
            'audience' => $audience,
            'roster' => $roster,
            'neverJoinedIn' => $neverIn,
        ],
        '_actors' => $actors, '_actorsPrev' => $actorsPrev, '_readers' => $readers,
        '_posts' => $posts, '_judged' => $judged,
    ];
}

/**
 * Where each person sits on the participation ladder.
 *
 * A reader is NOT a failure. Most healthy communities are mostly readers, and
 * a tool that scores reading as nothing pushes mentors into badgering quiet
 * children to perform. So this is a LADDER, not a score, and the only band
 * that asks for action is `quiet`: took part last window, has stopped this
 * one. That is the band nothing else in the product surfaces.
 */
function ceng_ladder(array $actors, array $actorsPrev, array $readers): array {
    $rung = function (array $a): string {
        if ($a['post'] > 0) return 'poster';
        if ($a['comment'] > 0) return 'replier';
        if ($a['react'] > 0 || $a['vote'] > 0) return 'reactor';
        return 'reader';
    };
    $rows = [];
    foreach ($actors as $id => $a) {
        $rows[$id] = ['id' => $id, 'rung' => $rung($a), 'quiet' => false] + $a;
    }
    foreach (array_keys($readers) as $id) {
        if (!isset($rows[$id])) {
            $rows[$id] = ['id' => $id, 'rung' => 'reader', 'quiet' => false,
                          'post' => 0, 'comment' => 0, 'react' => 0, 'vote' => 0];
        }
    }
    /* Took part before and has done nothing at all since — not even opened it.
       Somebody who has dropped from posting to reading is still here, and
       flagging them would bury the ones who are actually gone. */
    foreach ($actorsPrev as $id => $a) {
        if (isset($actors[$id]) || isset($readers[$id])) continue;
        $rows[$id] = ['id' => $id, 'rung' => 'silent', 'quiet' => true,
                      'post' => 0, 'comment' => 0, 'react' => 0, 'vote' => 0,
                      'was' => $rung($a)];
    }
    return $rows;
}

/** Names and centres for a set of actor ids, in one pass. */
function ceng_name_actors(array $ids): array {
    $ids = array_values(array_filter(array_map('strval', $ids), fn($x) => $x !== ''));
    if (!$ids) return [];
    $out = [];
    /* community_posts already carries the author's name and centre denormalised,
       and it is the only place a volunteer, a staff member and a child all
       appear under one id — which is exactly the mix that posts here. Falling
       back to the members table catches anyone who has only ever read. */
    $marks = implode(',', array_fill(0, count($ids), '?'));
    foreach (db_all("SELECT authorId id, MAX(authorName) name, MAX(authorCentre) centre
                       FROM community_posts WHERE authorId IN ($marks) GROUP BY authorId", $ids) as $r) {
        if (trim((string)$r['name']) !== '') $out[(string)$r['id']] = ['name' => (string)$r['name'], 'centre' => (string)$r['centre']];
    }
    $left = array_values(array_diff($ids, array_keys($out)));
    if ($left) {
        $m2 = implode(',', array_fill(0, count($left), '?'));
        foreach (db_all("SELECT memberId id, fullName name, centre FROM members WHERE memberId IN ($m2)", $left) as $r) {
            $out[(string)$r['id']] = ['name' => (string)$r['name'], 'centre' => (string)$r['centre']];
        }
    }
    return $out;
}

/**
 * admin.community.engagement — whether the community is a community.
 *
 * Params (all optional): days (1..365, default 30), channel (slug, '' = all),
 * limit (how many rows in each actionable list, 1..100, default 20).
 */
function admin_community_engagement(array $p): array {
    $g = admin_cap_gate($p, 'audit'); if (!$g['ok']) return $g;

    $c = ceng_compute((int)($p['days'] ?? CENG_DEFAULT_DAYS), (string)($p['channel'] ?? ''));
    if (empty($c['window'])) return $c;                     // no_such_channel
    $limit = max(1, min(100, (int)($p['limit'] ?? 20)));

    $ladder = ceng_ladder($c['_actors'], $c['_actorsPrev'], $c['_readers']);
    $bands = ['poster' => 0, 'replier' => 0, 'reactor' => 0, 'reader' => 0, 'silent' => 0];
    foreach ($ladder as $r) $bands[$r['rung']] = ($bands[$r['rung']] ?? 0) + 1;

    /* The two lists a mentor can act on this afternoon. Everything above is
       context for these. */
    $unanswered = array_values(array_filter($c['_judged'], fn($x) => $x['replies'] === 0));
    usort($unanswered, fn($a, $b) => strcmp($a['createdAt'], $b['createdAt']));   // longest ignored first

    $quiet = array_values(array_filter($ladder, fn($r) => !empty($r['quiet'])));
    $names = ceng_name_actors(array_merge(
        array_column($quiet, 'id'),
        array_map(fn($x) => $x['authorId'], array_slice($unanswered, 0, $limit))));
    foreach ($quiet as $i => $q) {
        $quiet[$i]['name'] = $names[$q['id']]['name'] ?? $q['id'];
        $quiet[$i]['centre'] = $names[$q['id']]['centre'] ?? '';
    }
    usort($quiet, fn($a, $b) => strcmp((string)$a['name'], (string)$b['name']));

    /* Per channel, so "the community is quiet" can be answered with WHICH
       part of it. Only channels with something in the window appear. */
    $channels = [];
    if ((string)($p['channel'] ?? '') === '') {
        foreach (db_all("SELECT channelId, slug, name FROM community_channels
                          WHERE status = 'active' ORDER BY sortOrder, name") as $ch) {
            $cid = (string)$ch['channelId'];
            $ps = array_values(array_filter($c['_posts'], fn($x) => $x['channelId'] === $cid));
            $jd = array_values(array_filter($c['_judged'], fn($x) => $x['channelId'] === $cid));
            $an = array_values(array_filter($jd, fn($x) => $x['replies'] > 0));
            if (!$ps) continue;
            $rate = _ceng_pct(count($an), count($jd));
            $channels[] = [
                'slug' => (string)$ch['slug'], 'name' => (string)$ch['name'],
                'posts' => count($ps), 'judged' => count($jd),
                'answered' => count($an), 'unanswered' => count($jd) - count($an),
                'replyRate' => $rate, 'band' => _ceng_band($rate),
                'voices' => count(array_unique(array_column($ps, 'authorId'))),
                'medianFirstReplyHours' => (function () use ($an) {
                    $m = _ceng_median(array_map(fn($x) => $x['firstReplyHours'], $an));
                    return $m === null ? null : round($m, 1);
                })(),
            ];
        }
        /* Worst first: this list exists to be acted on from the top. */
        usort($channels, fn($a, $b) => [$a['replyRate'], -$a['unanswered']] <=> [$b['replyRate'], -$b['unanswered']]);
    }

    return ['ok' => true,
            'window' => $c['window'], 'channel' => $c['channel'],
            'headline' => $c['headline'],
            'ladder' => $bands,
            'channels' => $channels,
            'unanswered' => array_slice($unanswered, 0, $limit),
            'unansweredTotal' => count($unanswered),
            'quiet' => array_slice($quiet, 0, $limit),
            'quietTotal' => count($quiet)];
}
