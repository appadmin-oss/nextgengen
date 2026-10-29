<?php
/**
 * Duty reminders: what a member, a mentor or an instructor still has to do,
 * gathered from the lists each portal already computes, and pushed at them
 * until it is done.
 *
 *   member      member_today()   — results, assignments, overdue lessons, dues,
 *                                  fines, mentor messages, plan sessions; plus
 *                                  this week's check-in from Thursday
 *   mentor      member_mp_week() — reviews, one-to-ones, messages, wellbeing,
 *                                  goals, families; plus closing the register
 *   instructor  instructor_today() — the log, marking, results, the plan
 *
 * Three ways it reaches them:
 *   · a pop-up when they open their portal (member.duties), snoozable for a
 *     few hours, never for good;
 *   · one email a day while anything urgent or due is open (duties_tick, from
 *     the web cron, after DUTYR_HOUR Lagos time), worded more firmly the longer
 *     a duty stays open (1, 3, 7 days);
 *   · past a week: a member's guardian gets a copy, and a mentor's lead is
 *     nudged to help. Nothing here fines or sanctions anyone.
 *
 * State lives in member_state (no table): `duty.seen` {key: firstSeenDate},
 * `duty.sent` (the last email day), `duty.snooze` (until when the pop-up waits).
 */

const DUTYR_HOUR = 17;          // the daily email, Lagos time
const DUTYR_BATCH = 40;         // people per tick, so one request never does everyone
const DUTYR_LEVELS = ['urgent', 'due', 'info'];

/** A plain string kept in member_state (stored as-is, so it is not JSON). */
function duty_state_str(string $me, string $key): string {
    $v = (string)(db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [$me, $key])['stateValue'] ?? '');
    $j = json_decode($v, true);
    return is_string($j) ? $j : trim($v, '"');
}
function duty_lagos_now(?int $now = null): int { return ($now ?? time()) + 3600; }

/** Normalise one portal row into a duty. */
function duty_row(string $role, string $key, string $level, string $icon, string $title, string $sub, string $cta, string $route): array {
    return ['key' => $role . ':' . $key, 'role' => $role, 'level' => in_array($level, DUTYR_LEVELS, true) ? $level : 'info',
            'icon' => $icon, 'title' => $title, 'sub' => $sub, 'cta' => $cta, 'route' => $route];
}

/** Every open duty for one person, across the roles they hold. */
function duties_for(string $me, ?int $now = null): array {
    $out = [];
    $m = db_row('SELECT * FROM members WHERE memberId = ? AND status = ? LIMIT 1', [$me, 'active']);
    if (!$m) return [];
    $lagos = duty_lagos_now($now); $dow = (int)gmdate('N', $lagos);   // 1 Mon … 7 Sun
    // The member's own.
    if (member_is_ngg($m) && in_array((string)($m['role'] ?? 'member'), ['', 'member'], true)) {
        try {
            $t = member_today(['memberId' => $me]);
            if (!empty($t['ok'])) {
                foreach ((array)$t['todo'] as $x) {
                    $lv = in_array($x['tone'], ['danger'], true) ? 'urgent' : (in_array($x['tone'], ['warning', 'info'], true) ? 'due' : 'info');
                    $out[] = duty_row('member', (string)$x['key'], $lv, (string)$x['icon'], (string)$x['title'], (string)$x['subtitle'], (string)$x['cta'], (string)$x['route']);
                }
                if (empty($t['checkin']['done']) && $dow >= 4)
                    $out[] = duty_row('member', 'checkin', $dow >= 6 ? 'urgent' : 'due', 'heartbeat', 'Answer this week’s check-in', 'How are you doing? It takes ten seconds and your mentor sees it before Saturday.', 'Answer', '/dashboard');
            }
        } catch (\Throwable $e) {}
    }
    // As a mentor.
    if (db_row("SELECT 1 FROM mentors WHERE memberId = ? AND status = 'active'", [$me])) {
        try {
            $w = member_mp_week(['requesterId' => $me]);
            if (!empty($w['ok'])) {
                foreach ((array)$w['due'] as $x) {
                    $lv = $x['tone'] === 'bad' ? 'urgent' : 'due';
                    $out[] = duty_row('mentor', (string)$x['key'], $lv, (string)$x['icon'], (string)$x['title'], (string)($x['sub'] ?? ''), 'Open', '/mentor/ngg');
                }
                $mid = (string)(db_row("SELECT mentorId FROM mentors WHERE memberId = ? AND status = 'active' LIMIT 1", [$me])['mentorId'] ?? '');
                $sat = gmdate('Y-m-d', $lagos - ((($dow % 7) + 1) % 7) * 86400);   // the most recent Saturday (today, if it is one)
                $after = $dow !== 6 || (int)gmdate('G', $lagos) >= 14;
                if ($mid !== '' && $after && (int)($w['menteeCount'] ?? 0) > 0) {
                    $s = db_row('SELECT registerClosedAt FROM mentor_saturdays WHERE mentorId = ? AND onDate = ?', [$mid, $sat]);
                    $any = db_row('SELECT 1 FROM mentor_register WHERE onDate = ? AND mentorId = ? LIMIT 1', [$sat, $mid]);
                    if (!$s || (string)$s['registerClosedAt'] === '')
                        $out[] = duty_row('mentor', 'register:' . $sat, 'urgent', 'list-checks', $any ? 'Close Saturday’s register' : 'Fill in Saturday’s register',
                            'Who was here, what you saw, and the duties · ' . gmdate('j M', strtotime($sat)), 'Open', '/mentor/ngg');
                }
            }
        } catch (\Throwable $e) {}
    }
    // As an instructor.
    if (db_row("SELECT 1 FROM volunteers WHERE memberId = ? AND role = 'instructor' AND COALESCE(status, 'active') = 'active'", [$me])) {
        try {
            $i = instructor_today(['requesterId' => $me]);
            if (!empty($i['ok'])) foreach ((array)$i['todo'] as $x) {
                $lv = $x['tone'] === 'danger' ? 'urgent' : ($x['tone'] === 'warning' ? 'due' : 'info');
                $out[] = duty_row('instructor', (string)$x['key'], $lv, (string)$x['icon'], (string)$x['title'], (string)$x['subtitle'], (string)$x['cta'], '/instructor/ngg');
            }
        } catch (\Throwable $e) {}
    }
    // How long each has been open (first seen), kept so the wording can firm up.
    $seen = safe_json((string)(db_row("SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = 'duty.seen'", [$me])['stateValue'] ?? '{}'));
    $seen = is_array($seen) ? $seen : [];
    $today = gmdate('Y-m-d', $lagos); $next = [];
    foreach ($out as &$d) { $first = (string)($seen[$d['key']] ?? $today); $next[$d['key']] = $first; $d['since'] = $first; $d['days'] = max(0, (int)floor((strtotime($today) - strtotime($first)) / 86400)); }
    unset($d);
    if ($next != $seen) member_state_set(['memberId' => $me, 'key' => 'duty.seen', 'value' => (object)$next]);
    $rank = ['urgent' => 0, 'due' => 1, 'info' => 2];
    usort($out, static fn($a, $b) => [$rank[$a['level']], -$a['days']] <=> [$rank[$b['level']], -$b['days']]);
    return $out;
}

/** member.duties — the signed-in person's open duties, and whether the pop-up is snoozed. */
function member_duties(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    if (!db_row('SELECT 1 FROM members WHERE memberId = ?', [$me])) return ['ok' => false, 'error' => 'no_member'];
    $all = duties_for($me);
    $role = (string)($p['role'] ?? '');
    $list = $role !== '' ? array_values(array_filter($all, static fn($d) => $d['role'] === $role)) : $all;
    $snooze = duty_state_str($me, 'duty.snooze');
    return ['ok' => true, 'duties' => $list, 'counts' => ['urgent' => count(array_filter($list, static fn($d) => $d['level'] === 'urgent')), 'due' => count(array_filter($list, static fn($d) => $d['level'] === 'due'))],
            'snoozedUntil' => $snooze > now_iso() ? $snooze : ''];
}

/** member.duties.snooze — "Remind me later": 1 to 8 hours, never longer, and never for urgent forever. */
function member_duties_snooze(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    $h = max(1, min(8, (int)($p['hours'] ?? 4)));
    $until = gmdate('Y-m-d\TH:i:s\Z', time() + $h * 3600);
    member_state_set(['memberId' => $me, 'key' => 'duty.snooze', 'value' => $until]);
    return ['ok' => true, 'snoozedUntil' => $until];
}

/** The email for one person's open duties, worded by how long the oldest has waited. */
function duty_mail_html(array $m, array $list, string $portalUrl): array {
    $first = function_exists('mp_first') ? mp_first((string)$m['fullName']) : (string)$m['fullName'];
    $oldest = max(array_column($list, 'days'));
    $urgent = count(array_filter($list, static fn($d) => $d['level'] === 'urgent'));
    $n = count($list);
    $subject = ($oldest >= 7 ? 'Overdue for a week: ' : ($oldest >= 3 ? 'Still waiting: ' : ($urgent ? 'Today: ' : 'Reminder: '))) . $n . ($n === 1 ? ' thing' : ' things') . ' to do on NGG';
    $rows = '';
    foreach (array_slice($list, 0, 12) as $d) {
        $col = $d['level'] === 'urgent' ? '#a3331c' : '#7a5600';
        $age = $d['days'] >= 1 ? ' · open ' . $d['days'] . ($d['days'] === 1 ? ' day' : ' days') : '';
        $rows .= '<tr><td style="padding:14px 16px;border-top:1px solid #eceef2"><div style="font-size:17px;font-weight:700;color:#0c1432">' . esc_html($d['title']) . '</div>'
            . '<div style="font-size:14px;color:#5a6488;margin-top:4px">' . esc_html($d['sub']) . '<span style="color:' . $col . ';font-weight:600">' . esc_html($age) . '</span></div></td></tr>';
    }
    $intro = $oldest >= 7 ? 'Some of these have been waiting for over a week. Please do them today, or tell us what is in the way.'
        : ($oldest >= 3 ? 'These are still open. A few minutes now saves a harder week later.' : 'Here is what is waiting for you. Each one takes a few minutes.');
    $html = email_template(['eyebrow' => $urgent ? 'Needs you today' : 'Your to do list', 'eyebrowTone' => $urgent || $oldest >= 3 ? 'coral' : 'gold',
        'title' => 'Hi ' . $first . ', you have ' . $n . ($n === 1 ? ' thing' : ' things') . ' to do', 'intro' => $intro,
        'bodyHtml' => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8eaef;border-radius:14px;border-collapse:separate">' . $rows . '</table>',
        'ctaLabel' => 'Open my portal', 'ctaUrl' => $portalUrl,
        'footNote' => 'You get this once a day while something is open. It stops by itself when you have done them.']);
    return [$subject, $html];
}

/**
 * duties_tick — the daily email, in batches. After DUTYR_HOUR Lagos time, each
 * tick works through the next DUTYR_BATCH people (members, mentors and
 * instructors), sending one email to anyone with an urgent or due duty they
 * have not been emailed about today, plus one in-app notification. Past a
 * week, a member's guardian is copied once per duty, and a mentor's lead is
 * nudged once per duty. Returns what it did.
 */
function duties_tick(?int $now = null): array {
    $now = $now ?? time();
    $cfg = setting_get('duty_reminders');
    if (is_array($cfg) && array_key_exists('enabled', $cfg) && !$cfg['enabled']) return ['skipped' => 'off'];
    $lagos = $now + 3600;
    if ((int)gmdate('G', $lagos) < (int)(is_array($cfg) && isset($cfg['hour']) ? $cfg['hour'] : DUTYR_HOUR)) return ['skipped' => 'early'];
    $day = gmdate('Y-m-d', $lagos);
    $cur = setting_get('duty_cursor');
    $after = is_array($cur) && ($cur['day'] ?? '') === $day ? (string)($cur['after'] ?? '') : '';
    if (is_array($cur) && ($cur['day'] ?? '') === $day && !empty($cur['done'])) return ['skipped' => 'done'];
    $people = db_all("SELECT * FROM members WHERE status = 'active' AND memberId > ? AND (
        (type = 'NGG' AND COALESCE(role, '') IN ('', 'member'))
        OR memberId IN (SELECT memberId FROM mentors WHERE status = 'active' AND COALESCE(memberId, '') <> '')
        OR memberId IN (SELECT memberId FROM volunteers WHERE role = 'instructor' AND COALESCE(memberId, '') <> ''))
        ORDER BY memberId LIMIT " . DUTYR_BATCH, [$after]);
    global $CONFIG; $origin = rtrim((string)($CONFIG['app_origin'] ?? ''), '/');
    $sent = 0; $guardians = 0; $leads = 0; $last = $after;
    foreach ($people as $m) {
        $last = (string)$m['memberId'];
        $sentDay = duty_state_str($last, 'duty.sent');
        if ($sentDay === $day) continue;
        $list = array_values(array_filter(duties_for($last, $now), static fn($d) => $d['level'] !== 'info'));
        if (!$list) continue;
        $roles = array_unique(array_column($list, 'role'));
        $portal = $origin . (in_array('member', $roles, true) ? '/dashboard' : (in_array('mentor', $roles, true) ? '/mentor' : '/instructor'));
        [$subject, $html] = duty_mail_html($m, $list, $portal);
        $to = filter_var((string)$m['email'], FILTER_VALIDATE_EMAIL) ? (string)$m['email'] : (filter_var((string)($m['parentEmail'] ?? ''), FILTER_VALIDATE_EMAIL) ? (string)$m['parentEmail'] : '');
        if ($to !== '') { try { if (send_mail($to, $subject, $html)) $sent++; } catch (\Throwable $e) {} }
        push_notification($last, ['kind' => 'duty', 'title' => count($list) . (count($list) === 1 ? ' thing' : ' things') . ' to do', 'body' => $list[0]['title'], 'linkPage' => in_array('member', $roles, true) ? 'dashboard' : (in_array('mentor', $roles, true) ? 'mentor' : 'instructor')]);
        // Past a week: the people who can help are told, once per duty.
        $esc = safe_json((string)(db_row("SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = 'duty.escalated'", [$last])['stateValue'] ?? '{}'));
        $esc = is_array($esc) ? $esc : []; $changed = false;
        foreach ($list as $d) {
            if ($d['days'] < 7 || !empty($esc[$d['key']])) continue;
            if ($d['role'] === 'member' && filter_var((string)($m['parentEmail'] ?? ''), FILTER_VALIDATE_EMAIL) && (string)$m['parentEmail'] !== $to) {
                try { send_mail((string)$m['parentEmail'], 'Can you help ' . mp_first((string)$m['fullName']) . ' with something on NGG?',
                    email_template(['eyebrow' => 'For the family', 'title' => mp_first((string)$m['fullName']) . ' has had this waiting for a week',
                        'intro' => $d['title'] . '. ' . $d['sub'] . ' A word of encouragement at home usually does it.', 'ctaLabel' => 'Open NGG', 'ctaUrl' => $origin . '/family'])); $guardians++; } catch (\Throwable $e) {}
            }
            if ($d['role'] === 'mentor' && function_exists('ms_nudge')) {
                $lead = db_row("SELECT t.leadId, t.centre, t.mentorId FROM mentors t WHERE t.memberId = ? LIMIT 1", [$last]);
                if ($lead && ms_nudge('J:dutyOverdue:' . $d['key'] . ':' . $last, 'J:dutyOverdue', ['audience' => 'lead', 'mentorId' => (string)($lead['leadId'] ?? ''), 'memberId' => '', 'centre' => (string)$lead['centre'],
                    'title' => mp_first((string)$m['fullName']) . ': “' . $d['title'] . '” has waited a week', 'body' => 'A reminder has gone every day. A call from you may help.', 'suggestion' => 'Ask what is in the way.'])) $leads++;
            }
            $esc[$d['key']] = $day; $changed = true;
        }
        if ($changed) member_state_set(['memberId' => $last, 'key' => 'duty.escalated', 'value' => (object)$esc]);
        member_state_set(['memberId' => $last, 'key' => 'duty.sent', 'value' => $day]);
    }
    setting_set('duty_cursor', ['day' => $day, 'after' => $last, 'done' => count($people) < DUTYR_BATCH]);
    return ['people' => count($people), 'emails' => $sent, 'guardians' => $guardians, 'leads' => $leads];
}
