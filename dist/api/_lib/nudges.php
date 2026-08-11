<?php
declare(strict_types=1);
/**
 * Seasonal nudges — periodic, calendar-dated encouragement / appreciation /
 * reminder EMAILS to volunteers, students and parents across a season.
 *
 * Why a schedule, not ad-hoc broadcasts: the cadence (reward on Sundays,
 * appreciation on Mondays, a reminder on Thursdays, a weekly parent check-in) is
 * the point — it's the drum-beat that turns showing up into an identity. The
 * copy lives here as data; the web-cron drains it.
 *
 * Delivery contract (all enforced by nudges_run):
 *   • SAME-DAY ONLY — a message fires only on its exact date, never backfilled,
 *     so switching the campaign on mid-season can't blast weeks of past notes.
 *   • ONCE PER RECIPIENT — every send is logged in `nudge_log` under a unique
 *     (messageKey, recipient) index, so a web-cron tick every 15 minutes (or two
 *     racing ticks) can never double-send.
 *   • BOUNDED — each tick drains at most NUDGE_CRON_BATCH new recipients per
 *     message, so a large roster spreads across ticks instead of one huge burst.
 *   • TOGGLEABLE — the `nudges_enabled` setting pauses the whole campaign.
 *
 * Audiences resolve to real inboxes:
 *   volunteers → active volunteers' own email
 *   students   → active NGG members' own email (summer students are minors with
 *                no address of their own, so their encouragement rides the parent
 *                channel, whose copy is written to be read WITH the child)
 *   parents    → guardian email of active NGG members + verified summer students
 */

const NUDGE_CRON_BATCH = 60;

/** Campaign on/off. On by default; set `nudges_enabled` = '0' to pause. */
function nudges_enabled(): bool {
    if (!function_exists('setting_raw')) return true;
    return setting_raw('nudges_enabled') !== '0';
}

/** First name for a warm greeting, or '' when we only have a blank/placeholder. */
function nudge_first_name(string $full): string {
    $full = trim(preg_replace('/\s+/', ' ', $full));
    if ($full === '') return '';
    $first = explode(' ', $full)[0];
    return (mb_strlen($first) >= 2 && !preg_match('/@|^-+$/', $first)) ? $first : '';
}

/**
 * The dated schedule. Each entry:
 *   key      unique, stable — the dedup handle (never reuse across sends)
 *   date     'YYYY-MM-DD' (matched against the programme day)
 *   audience 'volunteers' | 'students' | 'parents'
 *   tone     'reward' | 'appreciation' | 'remind' | 'welcome'
 *   subject  inbox subject line
 *   title    in-email headline
 *   intro    lead line (a "Hi <name> —" is prepended for volunteers/students)
 *   body     HTML body (2–3 short paragraphs)
 */
function nudge_schedule(): array {
    // Shorthand for a two-paragraph body.
    $b = fn(string ...$ps) => implode('', array_map(fn($p) => '<p style="margin:0 0 12px">' . $p . '</p>', $ps));
    return [
        // ── Volunteers · August: reward (Sun) · appreciation (Mon) · remind (Thu)
        ['key' => 'vol-20260809', 'date' => '2026-08-09', 'audience' => 'volunteers', 'tone' => 'reward',
         'subject' => 'You helped rebuild something', 'title' => 'You helped rebuild something last week.',
         'intro' => 'You didn’t just show up last week — you helped rebuild something.',
         'body' => $b('Every session you run is one more brick in an identity being formed in public. The young people at your centre are learning what consistency looks like by watching you carry it, Saturday after Saturday.',
                      'Keep going. What you’re building rarely shows on the day — but it lasts.')],
        ['key' => 'vol-20260810', 'date' => '2026-08-10', 'audience' => 'volunteers', 'tone' => 'appreciation',
         'subject' => 'Thank you for standing in the gap', 'title' => 'Thank you for standing where it matters most.',
         'intro' => 'Thank you for standing where it matters most — in the gap between who a young person is and who they’re becoming.',
         'body' => $b('That gap is the real work, and it doesn’t get done by programmes or posters. It gets done by a person who keeps turning up. That person is you.',
                      'We see it, and we’re grateful for it.')],
        ['key' => 'vol-20260813', 'date' => '2026-08-13', 'audience' => 'volunteers', 'tone' => 'remind',
         'subject' => 'Your next shift is coming up', 'title' => 'A quick reminder about your next shift.',
         'intro' => 'Quick reminder: your next shift is coming up.',
         'body' => $b('Same standard as always — turn up early, carry your ID, and be the consistency they’re learning to build in themselves.',
                      'See you soon.')],
        ['key' => 'vol-20260816', 'date' => '2026-08-16', 'audience' => 'volunteers', 'tone' => 'reward',
         'subject' => 'Halfway through — and the pattern is holding', 'title' => 'The pattern is holding — because you’re holding it.',
         'intro' => 'Halfway through the month, and the pattern is holding — because you’re holding it.',
         'body' => $b('Values aren’t taught in a day; they’re rebuilt one Saturday at a time.',
                      'Thank you for showing up again.')],
        ['key' => 'vol-20260817', 'date' => '2026-08-17', 'audience' => 'volunteers', 'tone' => 'appreciation',
         'subject' => 'Integrity, watched or not', 'title' => 'You show up whether it’s watched or not.',
         'intro' => 'Integrity is doing right when no one’s watching — but you show up whether it’s watched or not.',
         'body' => $b('That doesn’t go unnoticed here. It’s the exact thing we’re asking the young people to grow, and you’re modelling it without being asked.',
                      'Thank you.')],
        ['key' => 'vol-20260820', 'date' => '2026-08-20', 'audience' => 'volunteers', 'tone' => 'remind',
         'subject' => 'Please confirm your next slot', 'title' => 'Your next volunteer slot is almost here.',
         'intro' => 'Heads up — your next volunteer slot is almost here. Please confirm your availability.',
         'body' => $b('The standard doesn’t pause, and neither do you.',
                      'Thanks for staying the course.')],
        ['key' => 'vol-20260823', 'date' => '2026-08-23', 'audience' => 'volunteers', 'tone' => 'reward',
         'subject' => 'Look at what’s been built', 'title' => 'Not just skills — character.',
         'intro' => 'Look at what’s been built this month — not just skills, but character.',
         'body' => $b('You’ve been part of every stop, start, and automate along the way — every small correction that becomes a habit.',
                      'Keep shining.')],
        ['key' => 'vol-20260824', 'date' => '2026-08-24', 'audience' => 'volunteers', 'tone' => 'appreciation',
         'subject' => 'Today, simply: thank you', 'title' => 'Today, simply: thank you.',
         'intro' => 'Today, simply: thank you — for modelling the values you ask them to practice.',
         'body' => $b('Respect, self-control, responsibility — you live them in front of the young people every week.',
                      'This community stands taller because of you.')],
        ['key' => 'vol-20260827', 'date' => '2026-08-27', 'audience' => 'volunteers', 'tone' => 'remind',
         'subject' => 'One last stretch — check your final shift', 'title' => 'Almost the end of August — one last stretch.',
         'intro' => 'Almost the end of August — one last stretch. Please check your final shift details.',
         'body' => $b('The last weeks are where the habit becomes identity.',
                      'Let’s finish it well together.')],
        ['key' => 'vol-20260830', 'date' => '2026-08-30', 'audience' => 'volunteers', 'tone' => 'reward',
         'subject' => 'What a month of rebuilding', 'title' => 'What a month of rebuilding.',
         'intro' => 'What a month of rebuilding.',
         'body' => $b('Real change doesn’t happen in a moment — it happens in the version of yourself you choose every day you show up. That’s what you gave this month.',
                      'Let’s finish strong tomorrow!')],
        ['key' => 'vol-20260831', 'date' => '2026-08-31', 'audience' => 'volunteers', 'tone' => 'appreciation',
         'subject' => 'August is wrapping up — thank you', 'title' => 'What you built won’t wrap up.',
         'intro' => 'August is wrapping up, but what you helped build in these young people won’t.',
         'body' => $b('Thank you for every hour, every value modelled, every moment of leadership.',
                      'Here’s to rebuilding again in September.')],

        // ── Parents · weekly Thursday check-in
        ['key' => 'par-20260813', 'date' => '2026-08-13', 'audience' => 'parents', 'tone' => 'remind',
         'subject' => 'A quick nudge: check in on your child this week', 'title' => 'A few minutes of interest goes a long way.',
         'intro' => 'Good day — a quick nudge this week.',
         'body' => $b('Check in on your child’s week — their Anchor Journal entries, the missions they’ve completed, and what they’ve shared on the community page.',
                      'A few minutes of genuine interest from you goes a long way.')],
        ['key' => 'par-20260820', 'date' => '2026-08-20', 'audience' => 'parents', 'tone' => 'remind',
         'subject' => 'We’re halfway through the season', 'title' => 'Celebrate what you see with them.',
         'intro' => 'Good day — we’re halfway through the season!',
         'body' => $b('Take a look at your child’s progress this week — journal reflections, community posts, mission completions, even their spot on the centre leaderboard.',
                      'Celebrate what you see, with them.')],
        ['key' => 'par-20260827', 'date' => '2026-08-27', 'audience' => 'parents', 'tone' => 'remind',
         'subject' => 'As the month winds down, ask about the journey', 'title' => 'Your engagement makes it stick.',
         'intro' => 'Good day — as the month winds down, ask your child about their journey.',
         'body' => $b('What they’ve written, who they’ve connected with in the community, which missions they’ve completed, and how they’ve grown.',
                      'Your engagement is what makes it stick.')],

        // ── Students · weekly Sunday reflection (added). NGG members with an
        //    account read these directly; summer families get the parent notes.
        ['key' => 'stu-20260809', 'date' => '2026-08-09', 'audience' => 'students', 'tone' => 'reward',
         'subject' => 'The version of you that shows up', 'title' => 'You’re becoming someone this season.',
         'intro' => 'One week in — and you’re already building something.',
         'body' => $b('Open your Anchor Journal and write one honest line about your week: one thing you’ll <b>stop</b>, one you’ll <b>start</b>, one you’ll <b>automate</b>.',
                      'Growth isn’t a grade. It’s the version of you that keeps showing up.')],
        ['key' => 'stu-20260816', 'date' => '2026-08-16', 'audience' => 'students', 'tone' => 'reward',
         'subject' => 'Halfway — keep your streak alive', 'title' => 'Halfway. Keep the streak.',
         'intro' => 'You’re halfway through the season — and it’s counting.',
         'body' => $b('Log this week’s missions and drop a reflection in your journal. Small, steady moves are what move your level, your streak, and you.',
                      'Proud of how you’re showing up.')],
        ['key' => 'stu-20260823', 'date' => '2026-08-23', 'audience' => 'students', 'tone' => 'reward',
         'subject' => 'Character is the real leaderboard', 'title' => 'Skills grow. So does character.',
         'intro' => 'Look back at your last three weeks.',
         'body' => $b('You’ve learned things — but you’ve also <i>become</i> things: more consistent, more honest, more you.',
                      'Finish the missions you’ve started this week, and tell someone in the community one thing you’re proud of.')],
        ['key' => 'stu-20260830', 'date' => '2026-08-30', 'audience' => 'students', 'tone' => 'reward',
         'subject' => 'Finish August strong', 'title' => 'Finish the month like it’s yours.',
         'intro' => 'One month, almost done — and you didn’t just take part, you grew.',
         'body' => $b('Close out August: complete any open missions, write your end-of-month reflection, and set one goal for September.',
                      'The habit is becoming an identity. Keep it.')],

        // ── September re-entry (added days) — a fresh beat for the new month.
        ['key' => 'vol-20260901', 'date' => '2026-09-01', 'audience' => 'volunteers', 'tone' => 'welcome',
         'subject' => 'September: let’s rebuild again', 'title' => 'A new month to build on.',
         'intro' => 'A new month — and the same quiet work that changes everything.',
         'body' => $b('Thank you for coming back. Everything you poured in through August is the foundation September gets to build on.',
                      'Check your first shift of the month, and let’s keep going.')],
        ['key' => 'par-20260903', 'date' => '2026-09-03', 'audience' => 'parents', 'tone' => 'welcome',
         'subject' => 'A new month with your child', 'title' => 'September starts — stay in the loop.',
         'intro' => 'Good day — a new month begins with your child this week.',
         'body' => $b('Keep the rhythm going: ask about their journal, their missions, and the friends they’re making in the community.',
                      'Your interest is one of the strongest signals they receive.')],
        ['key' => 'stu-20260906', 'date' => '2026-09-06', 'audience' => 'students', 'tone' => 'welcome',
         'subject' => 'New month, next you', 'title' => 'New month. Next you.',
         'intro' => 'September’s here — a clean page in your journal and a fresh set of missions.',
         'body' => $b('Set one goal you actually care about this month, and take the first small step today.',
                      'You already know how to show up. Do it again.')],
    ];
}

/** Render one nudge to full HTML for a named recipient. */
function nudge_render(array $n, string $firstName): string {
    static $eyebrows = ['reward' => 'Keep going', 'appreciation' => 'Thank you',
                        'remind' => 'A quick reminder', 'welcome' => 'A new month'];
    $intro = (string)$n['intro'];
    // Parent copy carries its own "Good day" voice; volunteers/students get a name.
    if ($n['audience'] !== 'parents' && $firstName !== '') {
        $intro = 'Hi ' . esc_html($firstName) . ' — ' . $intro;
    }
    return email_template([
        'eyebrow'   => $eyebrows[(string)$n['tone']] ?? 'Next Generation Genius',
        'title'     => (string)$n['title'],
        'intro'     => $intro,
        'bodyHtml'  => (string)$n['body'],
        'preheader' => (string)$n['intro'],
        'footNote'  => 'Next Generation Genius — an Afrovanguard programme. You’re receiving this as part of this season’s programme.',
    ]);
}

/** Recipients for an audience who have NOT yet been sent $messageKey, bounded.
 *  Returns rows [{email, name}]. Aggregates the name so MySQL ONLY_FULL_GROUP_BY
 *  is satisfied and each address appears once. */
function nudge_recipients(string $audience, string $messageKey, int $limit): array {
    $limit = max(1, min(500, $limit));
    $seen = "SELECT recipient FROM nudge_log WHERE messageKey = ?";
    switch ($audience) {
        case 'volunteers':
            return db_all("SELECT email, MAX(fullName) AS name FROM volunteers
                            WHERE status = 'active' AND email IS NOT NULL AND email <> ''
                              AND email NOT IN ($seen)
                            GROUP BY email LIMIT $limit", [$messageKey]);
        case 'students':
            return db_all("SELECT email, MAX(fullName) AS name FROM members
                            WHERE type = 'NGG' AND status = 'active' AND email IS NOT NULL AND email <> ''
                              AND email NOT IN ($seen)
                            GROUP BY email LIMIT $limit", [$messageKey]);
        case 'parents':
            return db_all("SELECT email, MAX(name) AS name FROM (
                              SELECT parentEmail AS email, parentName AS name FROM members
                                WHERE type = 'NGG' AND status = 'active' AND parentEmail IS NOT NULL AND parentEmail <> ''
                              UNION ALL
                              SELECT parentEmail AS email, guardianName AS name FROM summer_students
                                WHERE status = 'active' AND regStatus = 'verified' AND parentEmail IS NOT NULL AND parentEmail <> ''
                            ) p
                            WHERE email NOT IN ($seen)
                            GROUP BY email LIMIT $limit", [$messageKey]);
    }
    return [];
}

/** Idempotent send record — the unique (messageKey, recipient) index means a
 *  concurrent tick that loses the race simply no-ops here. */
function nudge_mark(string $key, string $recipient, string $channel): void {
    try { db_insert('nudge_log', ['messageKey' => $key, 'recipient' => $recipient, 'channel' => $channel, 'sentAt' => now_iso()]); }
    catch (Throwable $e) { /* already logged for this recipient */ }
}

/**
 * Drain the schedule for $today. Sends every not-yet-sent recipient of every
 * message dated exactly $today, up to $limit per message. Safe to call as often
 * as the web-cron fires. Returns a small summary for logging.
 */
function nudges_run(string $today, int $limit = NUDGE_CRON_BATCH): array {
    $out = ['sent' => 0, 'messages' => []];
    if (!nudges_enabled()) { $out['skipped'] = 'disabled'; return $out; }
    if (!function_exists('send_mail') || !function_exists('email_template')) { $out['skipped'] = 'no_mailer'; return $out; }

    foreach (nudge_schedule() as $n) {
        if ((string)$n['date'] !== $today) continue; // same-day only — never backfill
        $count = 0;
        foreach (nudge_recipients((string)$n['audience'], (string)$n['key'], $limit) as $r) {
            $email = trim((string)($r['email'] ?? ''));
            if ($email === '') continue;
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { nudge_mark((string)$n['key'], $email, 'invalid'); continue; }
            $html = nudge_render($n, nudge_first_name((string)($r['name'] ?? '')));
            $ok = send_mail($email, (string)$n['subject'], $html);
            nudge_mark((string)$n['key'], $email, $ok ? 'email' : 'failed');
            if ($ok) { $count++; $out['sent']++; }
        }
        if ($count > 0) $out['messages'][] = ['key' => (string)$n['key'], 'audience' => (string)$n['audience'], 'sent' => $count];
    }
    return $out;
}
