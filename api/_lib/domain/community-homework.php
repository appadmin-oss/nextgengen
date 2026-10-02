<?php
/* ============================================================================
   Homework — the task, who was asked, and who has been chased.

   Handoff §11 (the desktop widget) and §12 (the phone screen). The design says
   "14 of 24 submitted", "Reviewed 9 / Waiting 5 / Missing 10", an outstanding
   list, and one rule stated on the screen itself:

       "Nudges arrive as one notification, never a public message."

   That sentence is the specification for this file, not a caption. Three
   things follow from it and all three are enforced here rather than in the UI:

     · A nudge is a notification row addressed to one child. It never becomes a
       post, a comment, or a mention, so it cannot be read by the room.
     · It is mentor-only, checked server-side. The button is also absent for a
       member, but a hidden button is a courtesy and this is the rule.
     · It is once per child per day, per task. A tracker that can be used to
       send a child six messages in an afternoon is not a tracker.

   The cohort is snapshot when the task is set. "of 24" is then a fact about
   who was ASKED, and a child who joins the channel next week does not
   retroactively become late.
   ========================================================================== */

const HW_MAX_TITLE  = 200;
const HW_MAX_DETAIL = 2000;
/* One nudge per child per task per day. The design says "rate-limited daily";
   this is the number that phrase means. */
const HW_NUDGE_PER_DAY = 1;

/** UTC date stamp — the unit the daily limit is counted in. */
function hw_day(?string $iso = null): string {
    $t = $iso ? strtotime(str_replace(' ', 'T', $iso)) : time();
    return gmdate('Y-m-d', $t ?: time());
}

/** The one place that decides whether an actor may set or chase homework. */
function hw_is_mentor(string $actorId): bool {
    return $actorId !== '' && community_actor_is_staff($actorId);
}

/**
 * Everyone a task should be set for: the distinct people who have posted in
 * this channel, plus every active member of the centres those people come from.
 *
 * Derived rather than configured, because a hand-kept class list is a list
 * somebody forgets to update, and the failure mode of a stale cohort is a
 * child marked "missing" for work nobody asked them to do.
 */
function hw_cohort(string $channelId): array {
    $out = [];
    $centres = [];
    foreach (db_all("SELECT DISTINCT authorId, authorName, authorCentre FROM community_posts
                      WHERE channelId = ? AND status = 'published'", [$channelId]) as $r) {
        $id = (string)$r['authorId'];
        if ($id === '' || community_actor_is_staff($id)) continue;   // mentors are not set homework
        $out[$id] = ['memberId' => $id, 'memberName' => (string)$r['authorName'], 'centre' => (string)$r['authorCentre']];
        $c = trim((string)$r['authorCentre']);
        if ($c !== '') $centres[$c] = 1;
    }
    if ($centres) {
        $in = implode(',', array_fill(0, count($centres), '?'));
        foreach (db_all("SELECT memberId, fullName, centre FROM members
                          WHERE centre IN ($in) AND status = 'active'", array_keys($centres)) as $m) {
            $id = (string)$m['memberId'];
            if ($id === '' || isset($out[$id]) || community_actor_is_staff($id)) continue;
            $out[$id] = ['memberId' => $id, 'memberName' => (string)$m['fullName'], 'centre' => (string)$m['centre']];
        }
    }
    return array_values($out);
}

/** Set a task. Mentor-only; snapshots the cohort. */
function community_homework_set(array $p): array {
    $actor = (string)($p['memberId'] ?? '');
    if (!hw_is_mentor($actor)) return ['ok' => false, 'error' => 'forbidden'];

    $d      = (array)($p['data'] ?? []);
    $slug   = trim((string)($d['channel'] ?? ''));
    $title  = trim((string)($d['title'] ?? ''));
    $detail = trim((string)($d['detail'] ?? ''));
    $dueAt  = trim((string)($d['dueAt'] ?? ''));
    if ($title === '') return ['ok' => false, 'error' => 'A task needs a title.'];
    if (mb_strlen($title) > HW_MAX_TITLE) return ['ok' => false, 'error' => 'That title is too long.'];
    if (mb_strlen($detail) > HW_MAX_DETAIL) return ['ok' => false, 'error' => 'That description is too long.'];

    $ch = db_row("SELECT channelId, name FROM community_channels WHERE slug = ? LIMIT 1", [$slug]);
    if (!$ch) return ['ok' => false, 'error' => 'No such channel.'];
    $cid = (string)$ch['channelId'];

    /* A due date in the past cannot be met, and a tracker that counts children
       late against one is measuring the mentor's typing, not their work. */
    if ($dueAt !== '' && strtotime(str_replace(' ', 'T', $dueAt)) < time() - 300) {
        return ['ok' => false, 'error' => 'That due date has already passed.'];
    }

    $cohort = hw_cohort($cid);
    if (!$cohort) return ['ok' => false, 'error' => 'Nobody has posted in this channel yet, so there is no one to set it for.'];

    $hid = 'HW-' . strtoupper(rand_hex(6));
    $me  = db_row("SELECT fullName FROM members WHERE memberId = ? LIMIT 1", [$actor]);
    db_insert('community_homework', [
        'homeworkId' => $hid, 'channelId' => $cid, 'title' => $title, 'detail' => $detail,
        'dueAt' => $dueAt, 'createdBy' => $actor, 'createdByName' => (string)($me['fullName'] ?? ''),
        'createdAt' => now_iso(), 'status' => 'active',
    ]);
    foreach ($cohort as $c) {
        db_insert('community_homework_state', [
            'homeworkId' => $hid, 'memberId' => $c['memberId'],
            'memberName' => $c['memberName'], 'centre' => $c['centre'],
        ]);
    }
    return ['ok' => true, 'homeworkId' => $hid, 'asked' => count($cohort)];
}

/** The counts the design puts on both the widget and the screen. */
function hw_counts(string $homeworkId): array {
    $rows = db_all("SELECT submittedAt, reviewedAt FROM community_homework_state WHERE homeworkId = ?", [$homeworkId]);
    $asked = count($rows); $submitted = 0; $reviewed = 0;
    foreach ($rows as $r) {
        if (trim((string)$r['submittedAt']) === '') continue;
        $submitted++;
        if (trim((string)$r['reviewedAt']) !== '') $reviewed++;
    }
    return [
        'asked'     => $asked,
        'submitted' => $submitted,
        'reviewed'  => $reviewed,
        'waiting'   => $submitted - $reviewed,      // in, not yet looked at
        'missing'   => $asked - $submitted,
        /* Integer percent of the bar the design draws. 0 when nobody was asked,
           rather than a division by zero that renders as NaN%. */
        'percent'   => $asked > 0 ? (int)round($submitted * 100 / $asked) : 0,
    ];
}

/**
 * The line under a name on the outstanding list: "Nudged Tue", "Not seen since
 * Sun", "Read the task 1h ago".
 *
 * Ordered by what a mentor should do about it. "Already nudged today" outranks
 * everything, because the honest thing to show someone about to press Nudge
 * again is that they already did.
 */
function hw_row_context(array $st, ?array $lastNudge, string $lastActive = ''): string {
    if ($lastNudge) {
        $ts = strtotime(str_replace(' ', 'T', (string)$lastNudge['nudgedAt']));
        if ($ts) {
            return hw_day((string)$lastNudge['nudgedAt']) === hw_day()
                ? 'Nudged today'
                : 'Nudged ' . gmdate('D', $ts);
        }
    }
    $seen = trim((string)($st['seenAt'] ?? ''));
    if ($seen !== '') {
        $ago = time() - (int)strtotime(str_replace(' ', 'T', $seen));
        if ($ago < 3600)  return 'Read the task ' . max(1, (int)round($ago / 60)) . 'm ago';
        if ($ago < 86400) return 'Read the task ' . (int)round($ago / 3600) . 'h ago';
        return 'Read the task ' . (int)round($ago / 86400) . 'd ago';
    }
    /* "Not seen since Sun" — the design's third form, and the one that changes
       a mentor's mind. A child who has not opened the app since Sunday has not
       ignored the homework; they have not been here. Chasing that with a
       notification is chasing the wrong thing. */
    if ($lastActive !== '') {
        $ts = strtotime(str_replace(' ', 'T', $lastActive));
        if ($ts) {
            $ago = time() - $ts;
            if ($ago < 86400) return 'Here today, has not opened it';
            return 'Not seen since ' . ($ago < 6 * 86400 ? gmdate('D', $ts) : gmdate('j M', $ts));
        }
    }
    /* Short, and parallel to "Not seen since Sun" above it: the row gives this
       line about twenty characters before it ellipsises, and a truncated
       explanation is worse than a blunt one. */
    return 'Not seen at all';
}

/**
 * When each of these people was last actually here — a post or a read, whichever
 * is later. One query for the whole roster rather than two per child, because a
 * class of 24 was 48 round trips to render one list.
 */
function hw_last_active(array $memberIds): array {
    if (!$memberIds) return [];
    $in = implode(',', array_fill(0, count($memberIds), '?'));
    $out = [];
    foreach (db_all("SELECT authorId id, MAX(createdAt) t FROM community_posts
                      WHERE authorId IN ($in) GROUP BY authorId", $memberIds) as $r) {
        $out[(string)$r['id']] = (string)$r['t'];
    }
    foreach (db_all("SELECT memberId id, MAX(lastReadAt) t FROM community_reads
                      WHERE memberId IN ($in) GROUP BY memberId", $memberIds) as $r) {
        $id = (string)$r['id']; $t = (string)$r['t'];
        if (!isset($out[$id]) || strcmp($t, $out[$id]) > 0) $out[$id] = $t;
    }
    return $out;
}

/** One task, shaped for the widget and the screen. */
function community_homework_view(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $staff  = hw_is_mentor($viewer);
    $hid    = trim((string)($p['homeworkId'] ?? ''));

    if ($hid === '') {
        // No id: the newest active task in this channel, which is what the
        // pinned banner and the desktop widget both point at.
        $slug = trim((string)($p['channel'] ?? ''));
        $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$slug]);
        if (!$ch) return ['ok' => true, 'homework' => null];
        $hw = db_row("SELECT * FROM community_homework WHERE channelId = ? AND status = 'active'
                       ORDER BY createdAt DESC LIMIT 1", [(string)$ch['channelId']]);
    } else {
        $hw = db_row("SELECT * FROM community_homework WHERE homeworkId = ? LIMIT 1", [$hid]);
    }
    if (!$hw) return ['ok' => true, 'homework' => null];
    $hid = (string)$hw['homeworkId'];

    $chName = (string)(db_row("SELECT name, slug FROM community_channels WHERE channelId = ? LIMIT 1",
                              [(string)$hw['channelId']])['name'] ?? '');
    $chSlug = (string)(db_row("SELECT slug FROM community_channels WHERE channelId = ? LIMIT 1",
                              [(string)$hw['channelId']])['slug'] ?? '');

    $counts = hw_counts($hid);
    $mine   = db_row("SELECT * FROM community_homework_state WHERE homeworkId = ? AND memberId = ? LIMIT 1",
                     [$hid, $viewer]);

    $out = [
        'homeworkId' => $hid,
        'title'      => (string)$hw['title'],
        'detail'     => (string)$hw['detail'],
        'dueAt'      => (string)$hw['dueAt'],
        'channel'    => ['slug' => $chSlug, 'name' => $chName],
        'setBy'      => (string)$hw['createdByName'],
        'counts'     => $counts,
        /* Permissions are visible UI, not just a server rule. The client is
           told what it may do so it can render the truth rather than guess. */
        'canNudge'   => $staff,
        'canReview'  => $staff,
        'mine'       => $mine ? [
            'asked'       => true,
            'seenAt'      => (string)$mine['seenAt'],
            'submittedAt' => (string)$mine['submittedAt'],
            'reviewedAt'  => (string)$mine['reviewedAt'],
            'note'        => (string)$mine['note'],
        ] : ['asked' => false],
    ];

    /* The per-child list is MENTOR-ONLY. Who has not handed in their homework
       is not a fact the rest of the class is entitled to, and a roster that
       leaks it turns a tracker into a naming board. */
    if ($staff) {
        $nudges = [];
        foreach (db_all("SELECT memberId, nudgedAt FROM community_homework_nudge
                          WHERE homeworkId = ? ORDER BY nudgedAt ASC", [$hid]) as $n) {
            $nudges[(string)$n['memberId']] = $n;           // last one wins
        }
        $states = db_all("SELECT * FROM community_homework_state WHERE homeworkId = ?
                           ORDER BY memberName ASC", [$hid]);
        $active = hw_last_active(array_map(fn($r) => (string)$r['memberId'], $states));
        $outstanding = []; $submitted = [];
        foreach ($states as $st) {
            $mid = (string)$st['memberId'];
            $row = [
                'memberId'    => $mid,
                'name'        => (string)$st['memberName'],
                'centre'      => (string)$st['centre'],
                'photo'       => community_photo_for($mid),
                'submittedAt' => (string)$st['submittedAt'],
                'reviewedAt'  => (string)$st['reviewedAt'],
                'context'     => hw_row_context($st, $nudges[$mid] ?? null, $active[$mid] ?? ''),
                /* Whether Nudge will actually do anything, decided here so the
                   button can be disabled instead of failing on press. */
                'nudgeable'   => !isset($nudges[$mid])
                                 || hw_day((string)$nudges[$mid]['nudgedAt']) !== hw_day(),
            ];
            if (trim((string)$st['submittedAt']) === '') $outstanding[] = $row; else $submitted[] = $row;
        }
        $out['outstanding'] = $outstanding;
        $out['submitted']   = $submitted;
        $out['nudgeableNow'] = count(array_filter($outstanding, fn($r) => $r['nudgeable']));
    }
    return ['ok' => true, 'homework' => $out];
}

/** Every active task in a channel — the list behind the pinned banner. */
function community_homework_list(array $p): array {
    $slug = trim((string)($p['channel'] ?? ''));
    $ch = db_row("SELECT channelId FROM community_channels WHERE slug = ? LIMIT 1", [$slug]);
    if (!$ch) return ['ok' => true, 'homework' => []];
    $out = [];
    foreach (db_all("SELECT * FROM community_homework WHERE channelId = ? AND status = 'active'
                      ORDER BY createdAt DESC LIMIT 20", [(string)$ch['channelId']]) as $hw) {
        $out[] = [
            'homeworkId' => (string)$hw['homeworkId'],
            'title'      => (string)$hw['title'],
            'dueAt'      => (string)$hw['dueAt'],
            'counts'     => hw_counts((string)$hw['homeworkId']),
        ];
    }
    return ['ok' => true, 'homework' => $out];
}

/** A child opening the task. Records "knows about it", which nudging depends on. */
function community_homework_seen(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $hid = trim((string)($p['homeworkId'] ?? ''));
    if ($viewer === '' || $hid === '') return ['ok' => false, 'error' => 'forbidden'];
    $st = db_row("SELECT id, seenAt FROM community_homework_state WHERE homeworkId = ? AND memberId = ?", [$hid, $viewer]);
    if (!$st) return ['ok' => true];                                  // not asked; nothing to record
    if (trim((string)$st['seenAt']) !== '') return ['ok' => true];    // first open only
    db_update('community_homework_state', ['seenAt' => now_iso()], ['homeworkId' => $hid, 'memberId' => $viewer]);
    return ['ok' => true];
}

/** A child handing work in. */
function community_homework_submit(array $p): array {
    $viewer = (string)($p['memberId'] ?? '');
    $hid  = trim((string)($p['homeworkId'] ?? ''));
    $note = trim((string)($p['note'] ?? ''));
    $ref  = trim((string)($p['postId'] ?? ''));
    if ($viewer === '' || $hid === '') return ['ok' => false, 'error' => 'forbidden'];
    $st = db_row("SELECT id, submittedAt FROM community_homework_state WHERE homeworkId = ? AND memberId = ?", [$hid, $viewer]);
    if (!$st) return ['ok' => false, 'error' => 'This task was not set for you.'];
    if (trim((string)$st['submittedAt']) !== '') return ['ok' => true, 'already' => true];
    db_update('community_homework_state', [
        'submittedAt' => now_iso(), 'submittedRef' => $ref, 'note' => mb_substr($note, 0, 400),
    ], ['homeworkId' => $hid, 'memberId' => $viewer]);
    return ['ok' => true, 'counts' => hw_counts($hid)];
}

/** A mentor marking a submission looked at. */
function community_homework_review(array $p): array {
    $actor = (string)($p['memberId'] ?? '');
    if (!hw_is_mentor($actor)) return ['ok' => false, 'error' => 'forbidden'];
    $hid = trim((string)($p['homeworkId'] ?? ''));
    $who = trim((string)($p['who'] ?? ''));
    $st = db_row("SELECT id, submittedAt FROM community_homework_state WHERE homeworkId = ? AND memberId = ?", [$hid, $who]);
    if (!$st) return ['ok' => false, 'error' => 'Not found.'];
    if (trim((string)$st['submittedAt']) === '') return ['ok' => false, 'error' => 'Nothing has been handed in yet.'];
    db_update('community_homework_state', ['reviewedAt' => now_iso(), 'reviewedBy' => $actor],
              ['homeworkId' => $hid, 'memberId' => $who]);
    return ['ok' => true, 'counts' => hw_counts($hid)];
}

/**
 * Nudge one child, or everyone outstanding.
 *
 * Returns what actually happened rather than "ok": with a daily limit, "I
 * pressed Nudge all and it sent 6 of 10" is the honest answer and the one the
 * screen has to be able to say.
 */
function community_homework_nudge(array $p): array {
    $actor = (string)($p['memberId'] ?? '');
    if (!hw_is_mentor($actor)) return ['ok' => false, 'error' => 'forbidden'];
    $hid = trim((string)($p['homeworkId'] ?? ''));
    $who = trim((string)($p['who'] ?? ''));
    $all = !empty($p['all']);

    $hw = db_row("SELECT * FROM community_homework WHERE homeworkId = ? LIMIT 1", [$hid]);
    if (!$hw) return ['ok' => false, 'error' => 'Not found.'];

    $targets = [];
    if ($all) {
        foreach (db_all("SELECT memberId, memberName FROM community_homework_state
                          WHERE homeworkId = ? AND (submittedAt IS NULL OR submittedAt = '')", [$hid]) as $r) {
            $targets[] = $r;
        }
    } else {
        $r = db_row("SELECT memberId, memberName FROM community_homework_state
                      WHERE homeworkId = ? AND memberId = ? AND (submittedAt IS NULL OR submittedAt = '')", [$hid, $who]);
        if (!$r) return ['ok' => false, 'error' => 'They have already handed it in.'];
        $targets[] = $r;
    }

    $me = (string)(db_row("SELECT fullName FROM members WHERE memberId = ? LIMIT 1", [$actor])['fullName'] ?? 'A mentor');
    $day = hw_day();
    $sent = 0; $skipped = 0;
    foreach ($targets as $t) {
        $mid = (string)$t['memberId'];
        // The daily limit, read from the record rather than trusted from a counter.
        if (db_row("SELECT id FROM community_homework_nudge WHERE homeworkId = ? AND memberId = ? AND nudgedDay = ?",
                   [$hid, $mid, $day])) { $skipped++; continue; }
        db_insert('community_homework_nudge', [
            'homeworkId' => $hid, 'memberId' => $mid, 'nudgedBy' => $actor,
            'nudgedAt' => now_iso(), 'nudgedDay' => $day,
        ]);
        /* A NOTIFICATION, addressed to one child. Never a post, never a
           comment, never an @mention — the design's rule, and the reason this
           feature is safe to give a mentor at all. No email either: a chase
           about homework does not belong in a parent's inbox. */
        community_notify($mid, $actor, 'community.homework',
            $me . ' nudged you about homework',
            (string)$hw['title'] . ((string)$hw['dueAt'] !== '' ? ' — due ' . hw_due_words((string)$hw['dueAt']) : ''),
            false, $hid);
        $sent++;
    }
    return ['ok' => true, 'sent' => $sent, 'skipped' => $skipped,
            'counts' => hw_counts($hid),
            'why' => $skipped > 0 ? 'Already nudged today' : ''];
}

/** A due date as a person says it: "Thu 4pm", "tomorrow 9am", "today 4pm". */
function hw_due_words(string $dueAt, ?int $nowTs = null): string {
    $t = strtotime(str_replace(' ', 'T', $dueAt));
    if (!$t) return '';
    $now = $nowTs ?? time();
    $time = gmdate('ga', $t);
    $dDay = hw_day(gmdate('c', $t));
    if ($dDay === hw_day(gmdate('c', $now)))              return 'today ' . $time;
    if ($dDay === hw_day(gmdate('c', $now + 86400)))      return 'tomorrow ' . $time;
    if ($t < $now)                                        return 'was ' . gmdate('D j M', $t);
    if ($t - $now < 6 * 86400)                            return gmdate('D', $t) . ' ' . $time;
    return gmdate('D j M', $t) . ' ' . $time;
}
