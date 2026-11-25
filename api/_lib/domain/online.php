<?php
/**
 * NGG Online — the programme for members who never attend a centre (docs/ONLINE-MEMBERS-PLAN.md).
 *
 * Phase 1 (registration.php) gave them a home: the `NGG Online` centres row (`online = 1`), so every desk keyed
 * by centre reaches them, and kept every attendance rule off them. This file is the rest of what makes the
 * membership worth paying for (owner, 17 Nov 2026: "upgrade the value of being an online member so the pay is
 * actually worth it"):
 *
 *   - the offer the join form shows (online_offer): the price in dollars and naira, what it includes;
 *   - the online Saturday session: a link, a day and a time, and attendance recorded by joining it through the
 *     portal (online_session_*) — the one attendance an online member has;
 *   - online mentors: a mentor marked online, paired with online members (online_mentor_*);
 *   - the staff's Online view: who is paid up, active, without a mentor, missing the session (admin_online_overview).
 *
 * Money is in fees.php (fees_member_monthly, fees_online_course_items) so the accrual, invoices, notices and
 * pay-ahead quotes read one answer.
 */

const ONLINE_SETTINGS_KEY = 'online_programme';
const ONLINE_DEFAULTS = [
    'enabled' => true,             // the join form offers "Online" while an online centre exists
    'sessionDay' => 'Saturday',    // the centres meet on Saturday at 8:30; online meets at the same time
    'sessionTime' => '08:30',      // Africa/Lagos
    'sessionMinutes' => 90,
    'sessionUrl' => '',            // the meeting link staff paste (Google Meet, Zoom …); shown only to signed-in online members
    'joinOpensMinutes' => 15,      // the portal's "Join" opens this long before the start
];
const ONLINE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ONLINE_TZ = 'Africa/Lagos';
const ONLINE_OVERVIEW_MAX = 1000;  // members in the staff view; named in the response when reached

function online_settings(): array {
    $s = setting_get(ONLINE_SETTINGS_KEY);
    return (is_array($s) ? $s : []) + ONLINE_DEFAULTS;
}

/** The online centre's name, or '' when none is active (then nobody can join online). */
function online_centre_name(): string {
    try { $r = db_row("SELECT name FROM centres WHERE online = 1 AND status = 'active' ORDER BY id LIMIT 1"); }
    catch (Throwable $e) { return ''; }
    return $r ? (string)$r['name'] : '';
}

/** What the join form, the family app and the Club page say about NGG Online. Public: no member data. */
function online_offer(): array {
    $s = online_settings(); $cfg = fees_settings(); $name = online_centre_name();
    return [
        'available' => !empty($s['enabled']) && $name !== '',
        'centre' => $name,
        'monthly' => (int)$cfg['onlineMonthly'], 'monthlyUsd' => (int)$cfg['onlineMonthlyUsd'],
        'course' => (int)$cfg['onlineCourseFee'], 'courseUsd' => (int)$cfg['onlineCourseUsd'], 'courseBasis' => (string)$cfg['onlineCourseBasis'], 'monthlyBasis' => (string)($cfg['onlineMonthlyBasis'] ?? 'month'),
        'graceHours' => function_exists('online_live_settings') ? online_live_settings()['graceHours'] : 48,
        'session' => ['day' => (string)$s['sessionDay'], 'time' => (string)$s['sessionTime'], 'minutes' => (int)$s['sessionMinutes']],
        // The value case, said plainly (docs/ONLINE-MEMBERS-PLAN.md, "make it worth paying for").
        'includes' => ['A named mentor, with a check-in every month', 'A live online session every ' . (string)$s['sessionDay'] . ', and a live class for each course',
            'An instructor for each course, who gives feedback on your work', 'The Maths, Physics and English Labs, with exams and certificates',
            'Your journal, with replies from your mentor', 'The NGG community', 'A progress report to your family every month', 'A digital member card'],
    ];
}

/* ── The online Saturday session ─────────────────────────────────────────── */

/** The next session's start and end (Lagos time) on or after $now, and the date it belongs to. */
function online_session_window(?int $now = null, ?array $s = null): array {
    $s = $s ?? online_settings(); $now = $now ?? time();
    $tz = new DateTimeZone(ONLINE_TZ);
    $day = in_array((string)$s['sessionDay'], ONLINE_DAYS, true) ? (string)$s['sessionDay'] : 'Saturday';
    [$h, $m] = array_map('intval', explode(':', preg_match('/^\d{1,2}:\d{2}$/', (string)$s['sessionTime']) ? (string)$s['sessionTime'] : '08:30'));
    $mins = max(15, min(360, (int)$s['sessionMinutes']));
    $d = (new DateTimeImmutable('@' . $now))->setTimezone($tz);
    for ($i = 0; $i < 8; $i++) {
        $cand = $d->modify('+' . $i . ' days');
        if ($cand->format('l') !== $day) continue;
        $start = $cand->setTime($h, $m);
        $end = $start->modify('+' . $mins . ' minutes');
        if ($end->getTimestamp() <= $now) continue;   // today's has finished: the next one
        return ['date' => $start->format('Y-m-d'), 'start' => $start->getTimestamp(), 'end' => $end->getTimestamp(),
            'opens' => $start->getTimestamp() - max(0, (int)$s['joinOpensMinutes']) * 60, 'label' => $start->format('l j F, H:i')];
    }
    return ['date' => '', 'start' => 0, 'end' => 0, 'opens' => 0, 'label' => ''];
}

/**
 * member.online.session — what an online member's portal shows: the next session, whether "Join" is open, and
 * whether they have joined this week's. The link is only handed over through online_session_join, so joining is
 * what records attendance and the link never sits in a page anyone can copy round.
 */
function member_online_session(array $p): array {
    $m = online_member_from($p); if (!$m) return ['ok' => false, 'error' => 'not_online'];
    $s = online_settings(); $w = online_session_window(null, $s);
    $now = time();
    $joined = $w['date'] !== '' && db_row("SELECT 1 FROM online_session_joins WHERE memberId = ? AND sessionDate = ? LIMIT 1", [(string)$m['memberId'], $w['date']]);
    return ['ok' => true, 'session' => ['date' => $w['date'], 'label' => $w['label'], 'start' => gmdate('Y-m-d\TH:i:s\Z', $w['start']),
        'open' => $w['start'] > 0 && $now >= $w['opens'] && $now < $w['end'], 'joined' => (bool)$joined, 'hasLink' => trim((string)$s['sessionUrl']) !== '',
        'minutes' => (int)$s['sessionMinutes']]];
}

/**
 * member.online.session.join — records that this member joined today's session (once per session) and returns the
 * link. Refused outside the joining window, so "attended" means they pressed Join while it was on.
 */
function member_online_session_join(array $p): array {
    $m = online_member_from($p); if (!$m) return ['ok' => false, 'error' => 'not_online'];
    if (function_exists('online_live_open') && !online_live_open($m)) return ['ok' => false, 'error' => 'paused', 'detail' => ONLINE_PAUSED_CHILD];
    $s = online_settings(); $url = trim((string)$s['sessionUrl']);
    if ($url === '' || !preg_match('#^https://#i', $url)) return ['ok' => false, 'error' => 'no_link', 'detail' => 'The session link has not been set yet. Your centre team has been told.'];
    $w = online_session_window(null, $s); $now = time();
    if ($w['start'] === 0 || $now < $w['opens'] || $now >= $w['end']) return ['ok' => false, 'error' => 'not_open', 'detail' => 'The next session is ' . $w['label'] . '. Join opens ' . (int)$s['joinOpensMinutes'] . ' minutes before.'];
    try {
        db_insert('online_session_joins', ['memberId' => (string)$m['memberId'], 'sessionDate' => $w['date'], 'joinedAt' => now_iso()]);
    } catch (Throwable $e) { /* already joined this session: UNIQUE(memberId, sessionDate) — the link is still theirs */ }
    return ['ok' => true, 'url' => $url, 'date' => $w['date']];
}

/** The signed-in requester as an online member, or null. */
function online_member_from(array $p): ?array {
    $id = (string)($p['requesterId'] ?? $p['memberId'] ?? '');
    if ($id === '') return null;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    return $m && member_is_online($m) && (string)$m['status'] === 'active' ? $m : null;
}

/* ── Online mentors ──────────────────────────────────────────────────────── */

/**
 * The online members with no mentor, and the online mentors with room. A mentor is "online" when their mentors
 * row is at the online centre — the same place an online member is — so centre-keyed mentoring, scope and pods
 * already work for them without a second notion of "online". Load is read from mentor_assignments, the record
 * every mentoring screen uses, in one grouped query.
 */
function online_mentor_pool(): array {
    $name = online_centre_name(); if ($name === '') return ['mentors' => [], 'unpaired' => []];
    $mentors = db_all("SELECT mentorId, fullName, maxMentees FROM mentors WHERE status = 'active' AND centre = ? ORDER BY fullName LIMIT 200", [$name]);
    $load = [];
    foreach (db_all("SELECT a.mentorId, COUNT(*) c FROM mentor_assignments a JOIN mentors t ON t.mentorId = a.mentorId WHERE a.status = 'active' AND t.centre = ? GROUP BY a.mentorId", [$name]) as $r) $load[(string)$r['mentorId']] = (int)$r['c'];
    $unpaired = db_all("SELECT m.memberId, m.fullName, m.displayId FROM members m WHERE m.status = 'active' AND m.centre = ? AND COALESCE(m.role,'member') = 'member'
                         AND NOT EXISTS (SELECT 1 FROM mentor_assignments a WHERE a.memberId = m.memberId AND a.status = 'active') ORDER BY m.id LIMIT 500", [$name]);
    return ['mentors' => array_map(static fn($r) => ['mentorId' => (string)$r['mentorId'], 'name' => (string)$r['fullName'], 'load' => $load[(string)$r['mentorId']] ?? 0,
        'max' => (int)($r['maxMentees'] ?? 0)], $mentors), 'unpaired' => $unpaired];
}

/**
 * admin.online.mentor.pair — give online members their mentor. With `memberIds` and `mentorId`, those members;
 * with `auto`, every online member without one goes to the online mentor with the fewest (never past a mentor's
 * own maxMentees). Each pairing is admin_assign_mentor — ONE implementation, so the match, its cadence tasks and
 * the member's notification are exactly what a pairing made by hand does. Per-row verdicts, capped, and one
 * audit event for the run (CLAUDE.md §6).
 */
const ONLINE_PAIR_MAX = 500;
function admin_online_mentor_pair(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $pool = online_mentor_pool();
    if (!$pool['mentors']) return ['ok' => false, 'error' => 'no_online_mentors', 'detail' => 'No mentor is at NGG Online yet. Accept an online mentor first.'];
    $byId = []; foreach ($pool['mentors'] as $mt) $byId[$mt['mentorId']] = $mt;
    $auto = !empty($p['auto']);
    $ids = $auto ? array_map(static fn($r) => (string)$r['memberId'], $pool['unpaired']) : array_values(array_unique(array_map('strval', (array)($p['memberIds'] ?? []))));
    if (count($ids) > ONLINE_PAIR_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . ONLINE_PAIR_MAX . ' at a time (ONLINE_PAIR_MAX).'];
    $fixed = (string)($p['mentorId'] ?? '');
    if (!$auto && !isset($byId[$fixed])) return ['ok' => false, 'error' => 'bad_mentor', 'detail' => 'Choose a mentor at NGG Online.'];
    $results = []; $done = 0;
    foreach ($ids as $id) {
        $m = db_row('SELECT memberId, centre, status FROM members WHERE memberId = ? LIMIT 1', [$id]);
        if (!$m || !member_is_online($m)) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_online']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)$m['centre'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        if ($auto) {
            $room = array_filter($byId, static fn($mt) => $mt['max'] <= 0 || $mt['load'] < $mt['max']);
            if (!$room) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'mentors_full']; continue; }
            uasort($room, static fn($a, $b) => $a['load'] <=> $b['load']);
            $mid = (string)array_key_first($room);
        } else $mid = $fixed;
        $cur = db_row("SELECT mentorId FROM mentor_assignments WHERE memberId = ? AND status = 'active' LIMIT 1", [$id]);
        if ($cur && (string)$cur['mentorId'] === $mid) { $results[] = ['id' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        $r = admin_assign_mentor(['requesterId' => (string)$g['requester']['memberId'], 'memberId' => $id, 'mentorId' => $mid]);
        if (empty($r['ok'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => (string)($r['error'] ?? 'failed')]; continue; }
        $byId[$mid]['load']++; $done++;
        $results[] = ['id' => $id, 'ok' => true, 'mentorId' => $mid];
    }
    audit('online.mentor.pair', (string)$g['requester']['memberId'], 'online', ['count' => $done, 'auto' => $auto, 'refused' => count(array_filter($results, static fn($r) => empty($r['ok'])))]);
    return ['ok' => true, 'paired' => $done, 'results' => $results];
}

/* ── The staff's Online view ─────────────────────────────────────────────── */

/**
 * admin.online.overview — every online member with what staff act on: paid up or owing, active this week in the
 * Labs, Learn or the journal, mentor or none, at last week's session or not. Counts are over every row (not the
 * drawn ones); the settings and the mentor pool come with it so one screen runs the programme.
 */
function admin_online_overview(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'club', 'fees']); if (!$g['ok']) return $g;
    $name = online_centre_name();
    $base = ['ok' => true, 'centre' => $name, 'settings' => online_settings() + (function_exists('online_live_settings') ? online_live_settings() : []), 'offer' => online_offer(), 'members' => [], 'counts' => [], 'capped' => false];
    if ($name === '' || !admin_centre_allowed($g['requester'], $name)) return $base + ['scoped' => $name !== ''];
    $rows = db_all("SELECT * FROM members WHERE centre = ? AND status = 'active' AND COALESCE(role,'member') = 'member' ORDER BY fullName LIMIT " . (ONLINE_OVERVIEW_MAX + 1), [$name]);
    $capped = count($rows) > ONLINE_OVERVIEW_MAX; if ($capped) array_pop($rows);
    $ids = array_map(static fn($r) => (string)$r['memberId'], $rows);
    $w = online_session_window(time() - 7 * 86400);   // the session that has just passed
    $last = $w['date'];
    $at = []; $active = []; $mentorOf = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        if ($last !== '') foreach (db_all("SELECT memberId FROM online_session_joins WHERE sessionDate = ? AND memberId IN ($in)", array_merge([$last], $ids)) as $r) $at[(string)$r['memberId']] = true;
        // Active this week: anything in the audit log by them in seven days (Labs, Learn, journal, hand-ins all write it).
        foreach (db_all("SELECT DISTINCT actorId FROM audit_log WHERE at >= ? AND actorId IN ($in)", array_merge([gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400)], $ids)) as $r) $active[(string)$r['actorId']] = true;
        foreach (db_all("SELECT a.memberId, a.mentorId, t.fullName FROM mentor_assignments a LEFT JOIN mentors t ON t.mentorId = a.mentorId WHERE a.status = 'active' AND a.memberId IN ($in)", $ids) as $r)
            $mentorOf[(string)$r['memberId']] = ['id' => (string)$r['mentorId'], 'name' => (string)($r['fullName'] ?? '')];
    }
    $cfg = fees_settings();
    $counts = ['members' => count($rows), 'owing' => 0, 'noMentor' => 0, 'missedSession' => 0, 'inactive' => 0, 'paused' => 0, 'review' => 0];
    $out = [];
    foreach ($rows as $r) {
        $ents = fees_entries((string)$r['memberId']);   // read once, shared by the balance and the access state
        $bal = fees_balance($r, $cfg, null, $ents);
        $owing = (int)($bal['payable'] ?? 0);
        $mid = (string)($mentorOf[(string)$r['memberId']]['id'] ?? '');
        $row = ['memberId' => (string)$r['memberId'], 'name' => (string)$r['fullName'], 'displayId' => (string)($r['displayId'] ?? ''),
            'courses' => fees_online_courses($r), 'owing' => $owing, 'mentorId' => $mid, 'mentor' => (string)($mentorOf[(string)$r['memberId']]['name'] ?? ''),
            'atSession' => isset($at[(string)$r['memberId']]), 'activeWeek' => isset($active[(string)$r['memberId']]), 'joined' => (string)($r['joinDate'] ?? '')];
        if (function_exists('online_access_state')) {
            $acc = online_access_state($r, null, $ents);
            $row['access'] = ['state' => $acc['state'], 'pauseAt' => $acc['pauseAt'], 'hoursLeft' => $acc['hoursLeft'], 'heldUntil' => $acc['heldUntil'],
                'holdReason' => $acc['holdReason'], 'review' => $acc['review'], 'daysUnpaid' => $acc['daysUnpaid']];
            if ($acc['state'] === 'paused') $counts['paused'] = ($counts['paused'] ?? 0) + 1;
            if ($acc['review']) $counts['review'] = ($counts['review'] ?? 0) + 1;
        }
        if ($owing > 0) $counts['owing']++;
        if ($mid === '') $counts['noMentor']++;
        if ($last !== '' && !$row['atSession']) $counts['missedSession']++;
        if (!$row['activeWeek']) $counts['inactive']++;
        $out[] = $row;
    }
    $pool = online_mentor_pool();
    return array_merge($base, ['members' => $out, 'counts' => $counts, 'capped' => $capped, 'cap' => ONLINE_OVERVIEW_MAX, 'lastSession' => $last,
        'mentors' => $pool['mentors']]);
}

/** admin.online.settings.save — the session's day, time, length and link, and whether the form offers Online. */
function admin_online_settings_save(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $cur = online_settings(); $in = is_array($p['settings'] ?? null) ? $p['settings'] : $p;
    $url = trim((string)($in['sessionUrl'] ?? $cur['sessionUrl']));
    if ($url !== '' && !preg_match('#^https://[^\s]+$#i', $url)) return ['ok' => false, 'error' => 'bad_url', 'detail' => 'The session link must start with https://'];
    $time = (string)($in['sessionTime'] ?? $cur['sessionTime']);
    if (!preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $time)) return ['ok' => false, 'error' => 'bad_time', 'detail' => 'Write the time as HH:MM, e.g. 08:30.'];
    $clean = [
        'enabled' => array_key_exists('enabled', $in) ? !empty($in['enabled']) : !empty($cur['enabled']),
        'sessionDay' => in_array($in['sessionDay'] ?? null, ONLINE_DAYS, true) ? (string)$in['sessionDay'] : (string)$cur['sessionDay'],
        'sessionTime' => $time,
        'sessionMinutes' => max(15, min(360, (int)($in['sessionMinutes'] ?? $cur['sessionMinutes']))),
        'sessionUrl' => mb_substr($url, 0, 500),
        'joinOpensMinutes' => max(0, min(60, (int)($in['joinOpensMinutes'] ?? $cur['joinOpensMinutes']))),
    ];
    /* The live side (online-live.php): grace, reminders, the automatic timetable. The grace period is stored in
       hours and may be given in hours or days (`graceValue` + `graceUnit`), as the owner asked. */
    $live = online_live_settings();
    if (isset($in['graceValue'])) {
        $unit = (string)($in['graceUnit'] ?? 'hours');
        if (!in_array($unit, ['hours', 'days'], true)) return ['ok' => false, 'error' => 'bad_grace_unit'];
        $in['graceHours'] = (int)round((float)$in['graceValue'] * ($unit === 'days' ? 24 : 1));
    }
    if (isset($in['graceHours']) && ((int)$in['graceHours'] < 0 || (int)$in['graceHours'] > ONLINE_GRACE_MAX_HOURS))
        return ['ok' => false, 'error' => 'bad_grace', 'detail' => 'A grace period is 0 to ' . (ONLINE_GRACE_MAX_HOURS / 24) . ' days.'];
    foreach (['classFrom', 'classUntil'] as $k) if (isset($in[$k]) && !preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', (string)$in[$k]))
        return ['ok' => false, 'error' => 'bad_time', 'detail' => 'Write class times as HH:MM, e.g. 10:15.'];
    if (isset($in['classDay']) && !in_array($in['classDay'], ONLINE_DAYS, true)) return ['ok' => false, 'error' => 'bad_day'];
    if (isset($in['linkProvider']) && !in_array($in['linkProvider'], ['jitsi', 'manual'], true)) return ['ok' => false, 'error' => 'bad_provider'];
    foreach (array_keys(ONLINE_LIVE_DEFAULTS) as $k) $clean[$k] = array_key_exists($k, $in)
        ? (is_bool(ONLINE_LIVE_DEFAULTS[$k]) ? !empty($in[$k]) : (is_int(ONLINE_LIVE_DEFAULTS[$k]) ? (int)$in[$k] : (string)$in[$k])) : $live[$k];
    if ((string)$clean['classUntil'] <= (string)$clean['classFrom']) return ['ok' => false, 'error' => 'bad_window', 'detail' => 'The last class must end after the first starts.'];
    setting_set(ONLINE_SETTINGS_KEY, $clean, (string)$g['requester']['memberId']);
    audit('online.settings.save', (string)$g['requester']['memberId'], 'online', ['day' => $clean['sessionDay'], 'time' => $clean['sessionTime'], 'enabled' => $clean['enabled'], 'link' => $clean['sessionUrl'] !== '',
        'graceHours' => $clean['graceHours'], 'autoPlan' => $clean['autoPlan']]);
    return ['ok' => true, 'settings' => $clean + ['live' => online_live_settings()]];
}
