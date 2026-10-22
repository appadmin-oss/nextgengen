<?php
/* ============================================================================
   "Mine" — the personal journal (handoff §8a and §8b).

   This is the most private surface in the product, so the rules come first:

     · Everything defaults to private. A child's journal is theirs unless they
       choose otherwise, on every write, with no exception for convenience.
     · A private entry is never readable by a mentor. Not in a list, not in a
       count, not in a search — journal_mine_* only ever reads the caller's own
       rows, and the mentor-facing path is a different function that filters on
       visibility rather than trusting a caller-supplied id.
     · Choosing a wider visibility is a deliberate act with the consequence
       spelled out beside it ("He can reply privately.", "Visible to Egbeda
       members."), and it can always be narrowed again.

   The numbers on the screen — streak, entries, words, the week strip — are all
   derived here rather than on the client, because two surfaces showing a
   different streak is worse than neither showing one.
   ========================================================================== */

const JM_VISIBILITY = ['private', 'mentor', 'programme'];
const JM_MAX_TITLE  = 140;
const JM_MAX_BODY   = 20000;
const JM_MAX_TAGS   = 8;

/** The five prompts the design rotates. Deterministic per day per person, so
 *  a member and their mentor see the same one and a refresh does not reroll. */
function jm_prompts(): array {
    return [
        "What did you try today that you couldn't do last month?",
        "Who helped you this week, and did you tell them?",
        "What is one thing you got wrong, and what did it teach you?",
        "What are you better at than you were twelve weeks ago?",
        "What would you tell someone starting the programme tomorrow?",
    ];
}

/** Today's prompt for this person. Rerolls only when they ask (`skip`). */
function jm_prompt_for(string $memberId, string $day, int $skip = 0): string {
    $ps = jm_prompts();
    $h = crc32($memberId . '|' . $day) + max(0, $skip);
    return $ps[$h % count($ps)];
}

/** Normalise tags: lower-case, no #, no duplicates, capped. */
function jm_clean_tags($in): array {
    $raw = is_array($in) ? $in : preg_split('/[\s,]+/', (string)$in);
    $out = [];
    foreach ($raw as $t) {
        $t = strtolower(trim((string)$t));
        $t = ltrim($t, '#');
        $t = preg_replace('/[^a-z0-9-]/', '', $t);
        if ($t === '' || isset($out[$t])) continue;
        $out[$t] = 1;
        if (count($out) >= JM_MAX_TAGS) break;
    }
    return array_keys($out);
}

/** Words, counted the way the writer's live counter counts them. */
function jm_words(string $body): int {
    $t = trim(preg_replace('/\s+/', ' ', strip_tags($body)));
    return $t === '' ? 0 : count(explode(' ', $t));
}

/** YYYY-MM-DD in UTC. One definition, used by the strip, the streak and saves. */
function jm_day(?string $iso = null): string {
    $t = $iso ? strtotime(str_replace(' ', 'T', $iso)) : time();
    return gmdate('Y-m-d', $t ?: time());
}

/** One row, shaped for the timeline. */
function jm_shape(array $r): array {
    $vis = (string)($r['visibility'] ?? 'private');
    if (!in_array($vis, JM_VISIBILITY, true)) $vis = to_bool($r['isPrivate'] ?? 1) ? 'private' : 'programme';
    $media = [];
    $raw = (string)($r['mediaJson'] ?? '');
    if ($raw !== '') { $d = json_decode($raw, true); if (is_array($d)) $media = $d; }
    $tags = array_values(array_filter(explode(' ', trim((string)($r['tags'] ?? '')))));
    return [
        'entryId'    => (string)$r['entryId'],
        'title'      => (string)($r['title'] ?? ''),
        'body'       => (string)($r['body'] ?? ''),
        'excerpt'    => mb_substr(trim(preg_replace('/\s+/', ' ', (string)($r['body'] ?? ''))), 0, 220),
        'mood'       => (int)($r['mood'] ?? 0) ?: null,
        'visibility' => $vis,
        'tags'       => $tags,
        'words'      => (int)($r['wordCount'] ?? 0),
        'media'      => $media,
        'occurredOn' => (string)($r['occurredOn'] ?? '') ?: jm_day((string)($r['createdAt'] ?? '')),
        'createdAt'  => (string)($r['createdAt'] ?? ''),
        'updatedAt'  => (string)($r['updatedAt'] ?? ''),
        'prompt'     => (string)($r['promptText'] ?? ''),
    ];
}

/** Every entry this member has written. Own rows only — never a parameter. */
function jm_rows(string $memberId): array {
    return db_all("SELECT * FROM journal WHERE memberId = ? ORDER BY
                     CASE WHEN occurredOn IS NULL OR occurredOn = '' THEN createdAt ELSE occurredOn END DESC,
                     createdAt DESC", [$memberId]);
}

/**
 * The whole "Mine" screen in one request: the week strip, today's prompt, the
 * mood already logged for today, the three stats, the tag filters, the
 * timeline, and the year-ago card.
 *
 * One request because it is one screen, and five round trips on a Nigerian
 * mobile connection is the difference between a screen that opens and a screen
 * somebody stops opening.
 */
function journal_mine(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    if ($me === '') return ['ok' => false, 'error' => 'forbidden'];
    $rows = jm_rows($me);
    $entries = array_map('jm_shape', $rows);

    $today = jm_day();
    $byDay = [];
    foreach ($entries as $e) { if (!isset($byDay[$e['occurredOn']])) $byDay[$e['occurredOn']] = $e; }

    /* The week strip: seven days ending today. A day with an entry shows the
       mood that was logged; a day without is a dashed tile. */
    $week = [];
    for ($i = 6; $i >= 0; $i--) {
        $d = gmdate('Y-m-d', strtotime($today . ' -' . $i . ' day'));
        $e = $byDay[$d] ?? null;
        $week[] = [
            'day'     => $d,
            'initial' => substr(gmdate('D', strtotime($d)), 0, 1),
            'date'    => (int)gmdate('j', strtotime($d)),
            'mood'    => $e['mood'] ?? null,
            'written' => (bool)$e,
            'isToday' => $d === $today,
        ];
    }

    /* Streak: consecutive days ending today or yesterday. Yesterday counts —
       a streak that breaks at one minute past midnight, before the day it is
       measuring has finished, is a streak that punishes sleeping. */
    $streak = 0;
    $cursor = isset($byDay[$today]) ? $today : gmdate('Y-m-d', strtotime($today . ' -1 day'));
    while (isset($byDay[$cursor])) {
        $streak++;
        $cursor = gmdate('Y-m-d', strtotime($cursor . ' -1 day'));
    }

    $words = 0; $private = 0; $voice = 0; $tagCount = [];
    foreach ($entries as $e) {
        $words += $e['words'];
        if ($e['visibility'] === 'private') $private++;
        foreach ($e['media'] as $m) { if ((($m['type'] ?? $m['kind'] ?? '')) === 'audio') { $voice++; break; } }
        foreach ($e['tags'] as $t) $tagCount[$t] = ($tagCount[$t] ?? 0) + 1;
    }
    arsort($tagCount);

    /* "A year ago today" — their own words, not a generated reflection. */
    $yearAgo = null;
    $ya = gmdate('Y-m-d', strtotime($today . ' -1 year'));
    foreach ([$ya, gmdate('Y-m-d', strtotime($ya . ' -1 day')), gmdate('Y-m-d', strtotime($ya . ' +1 day'))] as $d) {
        if (isset($byDay[$d])) { $yearAgo = ['day' => $d, 'quote' => mb_substr($byDay[$d]['excerpt'], 0, 160)]; break; }
    }

    return [
        'ok' => true,
        'today'      => $today,
        'prompt'     => jm_prompt_for($me, $today, (int)($p['skip'] ?? 0)),
        'todayEntry' => $byDay[$today] ?? null,
        'week'       => $week,
        'stats'      => ['streak' => $streak, 'entries' => count($entries), 'words' => $words],
        'filters'    => [
            'all'     => count($entries),
            'private' => $private,
            'voice'   => $voice,
            'tags'    => array_slice(array_map(
                fn($t, $n) => ['tag' => $t, 'count' => $n],
                array_keys($tagCount), array_values($tagCount)), 0, 6),
        ],
        'entries'    => $entries,
        'yearAgo'    => $yearAgo,
    ];
}

/**
 * Write or update one entry.
 *
 * Idempotent per day by default: the writer opens on today, and a member who
 * writes twice in one day is editing, not creating a second Tuesday.
 */
function journal_mine_save(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    if ($me === '') return ['ok' => false, 'error' => 'forbidden'];
    $d = (array)($p['data'] ?? []);

    $title = trim((string)($d['title'] ?? ''));
    $body  = (string)($d['body'] ?? '');
    $mood  = (int)($d['mood'] ?? 0);
    $vis   = (string)($d['visibility'] ?? 'private');
    if (!in_array($vis, JM_VISIBILITY, true)) $vis = 'private';
    if (mb_strlen($title) > JM_MAX_TITLE) return ['ok' => false, 'error' => 'That title is too long.'];
    if (mb_strlen($body) > JM_MAX_BODY)  return ['ok' => false, 'error' => 'That entry is too long to save.'];
    if (trim($body) === '' && $title === '' && $mood <= 0) {
        return ['ok' => false, 'error' => 'There is nothing to save yet.'];
    }
    if ($mood && ($mood < 1 || $mood > 5)) $mood = 0;

    $day   = trim((string)($d['occurredOn'] ?? '')) ?: jm_day();
    /* A journal is a record of days that have happened. */
    if ($day > jm_day()) return ['ok' => false, 'error' => 'You cannot write an entry for a day that has not happened.'];

    $tags  = jm_clean_tags($d['tags'] ?? '');
    $media = journal_media_clean($d['media'] ?? []);
    $words = jm_words($body);

    $existingId = trim((string)($d['entryId'] ?? ''));
    /* `new` is a reflection of its own (the Anchor Journal app writes several
       a day): it is never folded into the day's entry, which would overwrite
       the line the member wrote earlier. Without it, one entry per day. */
    $fresh = !empty($d['new']) && $existingId === '';
    $row = $fresh ? null : ($existingId !== ''
        ? db_row("SELECT * FROM journal WHERE entryId = ? AND memberId = ? LIMIT 1", [$existingId, $me])
        : db_row("SELECT * FROM journal WHERE memberId = ? AND occurredOn = ? LIMIT 1", [$me, $day]));
    $wasShared = $row && (string)($row['visibility'] ?? '') === 'mentor';

    $fields = [
        'title' => $title, 'body' => $body, 'mood' => $mood ? (string)$mood : '',
        'visibility' => $vis,
        /* isPrivate is kept in step so the older anchor flow, which reads only
           that column, never sees an entry as shareable that the member marked
           private. One fact, two spellings. */
        'isPrivate' => $vis === 'private' ? 1 : 0,
        'tags' => implode(' ', $tags), 'wordCount' => $words,
        'mediaJson' => $media ? json_encode($media) : '',
        'occurredOn' => $day, 'promptText' => mb_substr((string)($d['prompt'] ?? ''), 0, 300),
        'updatedAt' => now_iso(),
    ];

    if ($row) {
        db_update('journal', $fields, ['entryId' => (string)$row['entryId']]);
        $id = (string)$row['entryId'];
    } else {
        $id = 'JNL-' . gmdate('Y') . '-' . rand_hex(4);
        db_insert('journal', $fields + ['entryId' => $id, 'memberId' => $me, 'sessionId' => '',
                                        'week' => 0, 'createdAt' => now_iso()]);
    }
    audit('journal.save', $me, $me, ['visibility' => $vis], (string)($p['ip'] ?? ''));
    /* Shared with the mentor for the first time: the mentor is told, the way a
       message is, so a shared entry is read within the week it was promised. */
    if ($vis === 'mentor' && !$wasShared && function_exists('mp_chat_mentor')) {
        $a = mp_chat_mentor($me);
        if ($a && (string)$a['mentorMember'] !== '' && function_exists('push_notification')) {
            $who = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [$me]);
            push_notification((string)$a['mentorMember'], ['kind' => 'mentor', 'title' => mp_first((string)($who['fullName'] ?? 'Your mentee')) . ' shared a journal entry with you',
                'body' => mb_substr($title !== '' ? $title : $body, 0, 140), 'linkPage' => 'mentor']);
        }
    }
    return ['ok' => true, 'entryId' => $id, 'words' => $words, 'created' => !$row, 'visibility' => $vis];
}

/** Log today's mood on its own, without opening the writer. */
function journal_mine_mood(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    $mood = (int)($p['mood'] ?? 0);
    if ($me === '' || $mood < 1 || $mood > 5) return ['ok' => false, 'error' => 'forbidden'];
    $day = jm_day();
    $row = db_row("SELECT entryId FROM journal WHERE memberId = ? AND occurredOn = ? LIMIT 1", [$me, $day]);
    if ($row) {
        db_update('journal', ['mood' => (string)$mood, 'updatedAt' => now_iso()], ['entryId' => (string)$row['entryId']]);
    } else {
        /* A mood on its own is still an entry — private, empty, and enough to
           make the day count on the strip. It is the lowest-effort thing this
           screen asks for and the one most likely to be the only thing a
           fourteen-year-old does today. */
        db_insert('journal', ['entryId' => 'JNL-' . gmdate('Y') . '-' . rand_hex(4), 'memberId' => $me,
            'sessionId' => '', 'week' => 0, 'mood' => (string)$mood, 'body' => '', 'title' => '',
            'isPrivate' => 1, 'visibility' => 'private', 'tags' => '', 'wordCount' => 0,
            'mediaJson' => '', 'occurredOn' => $day, 'promptText' => '',
            'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    }
    return ['ok' => true, 'mood' => $mood, 'note' => jm_mood_note($mood)];
}

/** The caption under the mood row. The design's five strings, verbatim. */
function jm_mood_note(int $mood): string {
    $n = [
        1 => 'Rough day logged — nobody sees this but you.',
        2 => 'Logged. Want to write a line about it?',
        3 => 'Steady. Logged for today.',
        4 => 'Logged — 12 good days this month.',
        5 => 'Great day logged. Worth a few words?',
    ];
    return $n[$mood] ?? $n[4];
}

/** Delete one of the caller's own entries. */
function journal_mine_delete(array $p): array {
    $me = (string)($p['memberId'] ?? '');
    $id = trim((string)($p['entryId'] ?? ''));
    if ($me === '' || $id === '') return ['ok' => false, 'error' => 'forbidden'];
    $row = db_row("SELECT entryId FROM journal WHERE entryId = ? AND memberId = ? LIMIT 1", [$id, $me]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    db_exec("DELETE FROM journal WHERE entryId = ?", [$id]);
    audit('journal.delete', $me, $me, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
