<?php
/**
 * NGG Online, live (owner, 25 Nov 2026) — what an online membership is paid FOR, and what happens when it is not.
 *
 *   1. Courses by the month they were taken (online_course_enrolments). A course is opened the first time the
 *      accrual sees it on a member and closed the day it leaves them, so a course dropped in March is not charged
 *      in April, and nobody is charged for months before the record existed.
 *
 *   2. Access when unpaid: a GRACE PERIOD, in hours (48 by default), counted from the moment the oldest unpaid
 *      charge fell due (00:00 Lagos on its day). Inside it, nothing changes and the family is reminded on a
 *      schedule that fits the window. After it, the LIVE parts pause — the Saturday session and the live classes,
 *      which cost NGG an instructor's time — and nothing else: the portal, the Labs, Learn, the journal, the
 *      mentor and the child's own work stay open, because losing a month of progress over a missed payment helps
 *      nobody. Paying reopens them the moment Paystack confirms (the state is computed from the ledger, never
 *      stored). Staff can hold access open until a time, with a reason. A member unpaid past `reviewAfterDays`
 *      is flagged for a person to look at — never removed, never deleted.
 *      The child is told their class is paused and to ask a parent; the amount goes to the parent only.
 *
 *   3. Live classes (online_classes): a weekly class for a course, or for everyone, with a link, an instructor,
 *      a day and a time in Lagos, an optional term (startsOn–endsOn). Each occurrence can carry a recording link,
 *      a cancellation or a note (online_class_sessions). Pressing Join records attendance (online_class_joins)
 *      and is the only way to the link. Families are reminded before each class; a cancelled class tells them.
 *      Times go to the browser as UTC so each family sees their own clock beside Lagos time.
 */

const ONLINE_LIVE_DEFAULTS = [
    'graceHours' => 48,            // owner, 25 Nov 2026: "a 2-day grace period by default (grace periods could be in hours)"
    'reviewAfterDays' => 90,       // unpaid this long: flagged for staff to review (never automatic removal)
    'pauseLive' => true,           // false: reminders only, nothing pauses
    'classRemindMinutes' => 60,    // families reminded this long before a live class; 0 switches the reminder off
    /* The automatic timetable (online_plan_classes). Owner, 25 Nov 2026: "Smarter. Automated." */
    'autoPlan' => true,            // plan the live classes from who takes what; staff only lock or adjust
    'classDay' => 'Saturday',
    'classFrom' => '10:15',        // after the Saturday session (08:30, 90 minutes)
    'classUntil' => '16:00',       // the last class ends by then
    'classMinutes' => 60,
    'classGapMinutes' => 15,       // between back-to-back classes, so a child moving from one to the next is never late
    'classMaxSize' => 25,          // a course with more online members is split into groups
    'linkProvider' => 'jitsi',     // 'jitsi': a private Jitsi Meet room is made for each class; 'manual': staff paste a link
    'missedFollowUp' => 2,         // classes missed in a row before the family and the mentor hear
];
const ONLINE_GRACE_MAX_HOURS = 24 * 60;   // 60 days
const ONLINE_CLASS_MAX = 60;               // live classes running at once
const ONLINE_CLASS_DAYS_AHEAD = 7;         // the portal shows the coming week
const ONLINE_RECORDINGS_DAYS = 42;         // recordings stay listed for six weeks
const ONLINE_NOTIFY_BATCH = 400;           // members looked at per access tick; the next tick carries on
const ONLINE_CLASS_NOTIFY_MAX = 500;       // members told about one class occurrence
const ONLINE_QUIET_FROM = 21;              // no payment reminders 21:00–07:00 Lagos; they wait for the morning
const ONLINE_QUIET_TO = 7;

function online_live_settings(): array {
    $s = online_settings();
    $out = [];
    foreach (ONLINE_LIVE_DEFAULTS as $k => $v) $out[$k] = array_key_exists($k, $s) ? $s[$k] : $v;
    $out['graceHours'] = max(0, min(ONLINE_GRACE_MAX_HOURS, (int)$out['graceHours']));
    $out['reviewAfterDays'] = max(7, min(365, (int)$out['reviewAfterDays']));
    $out['classRemindMinutes'] = max(0, min(24 * 60, (int)$out['classRemindMinutes']));
    $out['pauseLive'] = (bool)$out['pauseLive'];
    $out['autoPlan'] = (bool)$out['autoPlan'];
    if (!in_array((string)$out['classDay'], ONLINE_DAYS, true)) $out['classDay'] = 'Saturday';
    foreach (['classFrom' => '10:15', 'classUntil' => '16:00'] as $k => $d) if (!preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', (string)$out[$k])) $out[$k] = $d;
    $out['classMinutes'] = max(30, min(180, (int)$out['classMinutes']));
    $out['classGapMinutes'] = max(0, min(60, (int)$out['classGapMinutes']));
    $out['classMaxSize'] = max(5, min(200, (int)$out['classMaxSize']));
    if (!in_array((string)$out['linkProvider'], ['jitsi', 'manual'], true)) $out['linkProvider'] = 'jitsi';
    $out['missedFollowUp'] = max(0, min(10, (int)$out['missedFollowUp']));
    return $out;
}

/** "48 hours", "2 days", "36 hours" — a grace period in the words a family reads. */
function online_hours_text(int $h): string {
    if ($h <= 0) return 'no grace period';
    if ($h % 24 === 0) return ($h / 24) . ' day' . ($h === 24 ? '' : 's');
    return $h . ' hour' . ($h === 1 ? '' : 's');
}

function online_lagos(int $ts): DateTimeImmutable { return (new DateTimeImmutable('@' . $ts))->setTimezone(new DateTimeZone(ONLINE_TZ)); }
function online_lagos_today(?int $now = null): string { return online_lagos($now ?? time())->format('Y-m-d'); }
/** 00:00 Lagos on a calendar day, as a timestamp. */
function online_lagos_midnight(string $day): int {
    return (new DateTimeImmutable($day . ' 00:00:00', new DateTimeZone(ONLINE_TZ)))->getTimestamp();
}

/* ── 1. Courses by the month ─────────────────────────────────────────────── */

/**
 * Bring a member's course record up to date with the courses they take now: a new course opens today, a course
 * they no longer take closes today. Cheap and idempotent — it runs from the daily accrual.
 */
function online_enrolments_sync(array $m, ?string $today = null): array {
    if (!(function_exists('member_is_online') && member_is_online($m))) return ['opened' => 0, 'closed' => 0];
    $today = substr($today ?? online_lagos_today(), 0, 10);
    $mid = (string)$m['memberId'];
    $now = array_values(array_unique(array_map('strval', fees_online_courses($m))));
    $open = [];
    try { foreach (db_all("SELECT id, course FROM online_course_enrolments WHERE memberId = ? AND endedOn = ''", [$mid]) as $r) $open[mb_strtolower((string)$r['course'])] = (int)$r['id']; }
    catch (Throwable $e) { return ['opened' => 0, 'closed' => 0]; }   // table not migrated yet
    $want = []; foreach ($now as $c) $want[mb_strtolower($c)] = $c;
    $opened = 0; $closed = 0;
    foreach ($want as $lc => $c) if (!isset($open[$lc])) {
        db_insert('online_course_enrolments', ['memberId' => $mid, 'course' => mb_substr($c, 0, 160), 'startedOn' => $today, 'endedOn' => '', 'createdAt' => now_iso()]);
        $opened++;
    }
    foreach ($open as $lc => $id) if (!isset($want[$lc])) { db_exec('UPDATE online_course_enrolments SET endedOn = ? WHERE id = ?', [$today, $id]); $closed++; }
    return ['opened' => $opened, 'closed' => $closed];
}

/** The courses an online member took in month $mk (YYYY-MM), or null when nothing is recorded yet. */
function online_courses_in_month(array $m, string $mk): ?array {
    if (!preg_match('/^\d{4}-\d{2}$/', $mk)) return null;
    try { $rows = db_all('SELECT course, startedOn, endedOn FROM online_course_enrolments WHERE memberId = ? ORDER BY id', [(string)$m['memberId']]); }
    catch (Throwable $e) { return null; }
    if (!$rows) return null;
    $first = $mk . '-01'; $last = gmdate('Y-m-t', (int)strtotime($first . ' 00:00:00 UTC'));
    $current = $mk >= substr(online_lagos_today(), 0, 7);
    $out = [];
    foreach ($rows as $r) {
        $ended = (string)$r['endedOn'];
        // A coming month: what they take now. A past or current month: what overlapped it.
        $in = $current && $mk > substr(online_lagos_today(), 0, 7) ? $ended === ''
            : ((string)$r['startedOn'] <= $last && ($ended === '' || $ended >= $first));
        if ($in) $out[mb_strtolower((string)$r['course'])] = (string)$r['course'];
    }
    return array_values($out);
}

/** The first month any course was recorded for this member ('9999-12' when none). */
function online_first_enrolment_month(array $m): string {
    try { $r = db_row('SELECT MIN(startedOn) d FROM online_course_enrolments WHERE memberId = ?', [(string)$m['memberId']]); }
    catch (Throwable $e) { return '9999-12'; }
    return $r && (string)$r['d'] !== '' ? substr((string)$r['d'], 0, 7) : '9999-12';
}

/* ── 2. Access when unpaid ───────────────────────────────────────────────── */

/**
 * The day the oldest still-unpaid charge fell due, every kind included (an online member's courses are kind
 * `training`), payments applied oldest-first through fees_allocate — the one allocator. '' when nothing is owed.
 */
function online_unpaid_since(array $m, ?array $entries = null): string {
    $cfg = fees_settings(); $ten = fees_tenure($m, $cfg);
    $memberDues = [];
    if ($ten['start'] !== '') foreach (fees_membership_periods($ten['start'], gmdate('Y-m-d'), (int)$cfg['membershipEveryMonths']) as $per) $memberDues[(string)$per['key']] = (string)$per['due'];
    $charges = []; $credits = [];
    foreach ($entries ?? fees_entries((string)$m['memberId']) as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        if ((string)$e['direction'] === 'charge') {
            $day = fees_charge_day($e, $memberDues);
            if ((string)$e['kind'] === 'training' && preg_match('/:(\d{4}-\d{2})$/', (string)($e['periodKey'] ?? ''), $mm)) $day = $mm[1] . '-01';
            $charges[] = ['ref' => (string)$e['entryId'], 'amount' => (int)$e['amount'], 'day' => $day, 'id' => (int)($e['id'] ?? 0)];
        } elseif ($cr = fees_credit_of($e)) $credits[] = $cr;
    }
    usort($charges, static fn($a, $b) => [$a['day'], $a['id']] <=> [$b['day'], $b['id']]);
    $taken = fees_allocate($charges, $credits);
    foreach ($charges as $c) if ($c['amount'] - ($taken[$c['ref']] ?? 0) > 0 && $c['day'] !== '' && $c['day'] <= online_lagos_today()) return $c['day'];
    return '';
}

/** The hold keeping this member's live classes open, if one is running. */
function online_access_hold(string $memberId, ?int $now = null): ?array {
    try { $r = db_row('SELECT holdUntil, reason, createdBy, createdAt FROM online_access_holds WHERE memberId = ? AND holdUntil > ? ORDER BY holdUntil DESC LIMIT 1',
                      [$memberId, gmdate('Y-m-d\TH:i:s\Z', $now ?? time())]); }
    catch (Throwable $e) { return null; }
    return $r ?: null;
}

/**
 * Where an online member stands: ok · grace (owing, inside the grace period) · paused (live classes paused) ·
 * held (owing past the grace period, but staff are keeping access open). Computed, never stored, so a payment
 * reopens everything the moment it is on the ledger.
 */
function online_access_state(array $m, ?int $now = null, ?array $entries = null): array {
    $now = $now ?? time(); $L = online_live_settings();
    $out = ['state' => 'ok', 'owing' => 0, 'dueSince' => '', 'pauseAt' => '', 'hoursLeft' => 0, 'heldUntil' => '', 'holdReason' => '',
            'review' => false, 'daysUnpaid' => 0, 'graceHours' => $L['graceHours']];
    if (!(function_exists('member_is_online') && member_is_online($m))) return $out;
    $bal = fees_balance($m, null, null, $entries);
    $owing = (int)($bal['payable'] ?? 0);
    if ($owing <= 0) return $out;
    $since = online_unpaid_since($m, $entries);
    if ($since === '') return $out + ['owing' => $owing];   // owed, but nothing has fallen due yet
    $dueAt = online_lagos_midnight($since);
    $pauseAt = $dueAt + $L['graceHours'] * 3600;
    $out['owing'] = $owing; $out['dueSince'] = $since;
    $out['pauseAt'] = gmdate('Y-m-d\TH:i:s\Z', $pauseAt);
    $out['daysUnpaid'] = max(0, intdiv($now - $dueAt, 86400));
    $out['review'] = $out['daysUnpaid'] >= $L['reviewAfterDays'];
    if ($now < $pauseAt || !$L['pauseLive']) {
        $out['state'] = $now < $pauseAt ? 'grace' : 'ok';
        $out['hoursLeft'] = max(0, (int)ceil(($pauseAt - $now) / 3600));
        if ($out['state'] === 'ok') $out['state'] = 'owing';   // past grace, but pausing is switched off
        return $out;
    }
    if ($h = online_access_hold((string)$m['memberId'], $now)) {
        $out['state'] = 'held'; $out['heldUntil'] = (string)$h['holdUntil']; $out['holdReason'] = (string)$h['reason'];
        return $out;
    }
    $out['state'] = 'paused';
    return $out;
}

/** May this member join a live class or the session now? */
function online_live_open(array $m): bool { return online_access_state($m)['state'] !== 'paused'; }

/** What the CHILD reads when their live classes are paused: no amount, no "owing" — ask a grown-up. */
const ONLINE_PAUSED_CHILD = 'Your live classes are paused for now. Ask your parent or guardian to check the family account — they open again the moment it is sorted. Everything else in your portal is still yours.';

/**
 * admin.online.hold — keep a member's live classes open until a time, with a reason (a family that has
 * promised to pay on Friday; a scholarship being arranged). `hours` (1–720) or `until` (ISO). `end` lifts it.
 */
function admin_online_hold(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $mid = (string)($p['memberId'] ?? '');
    $m = $mid !== '' ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]) : null;
    if (!$m || !member_is_online($m)) return ['ok' => false, 'error' => 'not_online'];
    if (!admin_centre_allowed($g['requester'], (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $by = (string)$g['requester']['memberId'];
    if (!empty($p['end'])) {
        db_exec('UPDATE online_access_holds SET holdUntil = ? WHERE memberId = ? AND holdUntil > ?', [now_iso(), $mid, now_iso()]);
        audit('online.hold.end', $by, $mid, []);
        return ['ok' => true, 'access' => online_access_state($m)];
    }
    $reason = trim((string)($p['reason'] ?? ''));
    if (mb_strlen($reason) < 3) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why, in a few words — it is shown to the next person who looks.'];
    $until = (string)($p['until'] ?? '');
    $ts = $until !== '' ? strtotime($until) : time() + max(1, min(720, (int)($p['hours'] ?? 48))) * 3600;
    if (!$ts || $ts <= time()) return ['ok' => false, 'error' => 'bad_until', 'detail' => 'Choose a time in the future.'];
    if ($ts > time() + 90 * 86400) return ['ok' => false, 'error' => 'too_long', 'detail' => 'At most 90 days. For longer, waive or plan the payments under Money.'];
    db_insert('online_access_holds', ['memberId' => $mid, 'holdUntil' => gmdate('Y-m-d\TH:i:s\Z', $ts), 'reason' => mb_substr($reason, 0, 500), 'createdBy' => $by, 'createdAt' => now_iso()]);
    audit('online.hold', $by, $mid, ['until' => gmdate('Y-m-d\TH:i:s\Z', $ts), 'reason' => mb_substr($reason, 0, 200)]);
    return ['ok' => true, 'access' => online_access_state($m)];
}

/** One amount in naira with the family's dollar figure beside it where the fee setting gives one. */
function online_money_text(int $naira): string {
    $t = fees_money_text($naira);
    $usd = function_exists('fx_usd_text') ? fx_usd_text($naira) : '';
    return $usd !== '' ? $t . ' (about ' . $usd . ')' : $t;
}

/**
 * The reminder ladder, fitted to the grace window. A 48-hour window reminds at the start, at the half and
 * twelve hours before; a 6-hour window only at the start; with no grace, only when it pauses. Each stage is
 * [name, seconds after the charge fell due]. Only the LATEST stage that has arrived is ever sent, so a member
 * who first comes into view late gets one message, not a burst of the ones they "missed".
 */
function online_remind_stages(int $graceHours): array {
    $g = $graceHours * 3600;
    $st = [];
    if ($g > 0) $st[] = ['due', 0];
    if ($graceHours >= 24) $st[] = ['half', intdiv($g, 2)];
    if ($graceHours >= 8) { $lead = max(1, min(12, intdiv($graceHours, 4))) * 3600; $st[] = ['last', $g - $lead]; }
    $st[] = ['paused', $g];
    usort($st, static fn($a, $b) => $a[1] <=> $b[1]);
    return $st;
}

/** The messages for one stage: to the family (with the amount), and to the child (without it). */
function online_remind_message(array $m, array $a, string $stage): array {
    $first = trim(explode(' ', (string)($m['fullName'] ?? ''))[0] ?? '') ?: 'Your child';
    $amt = online_money_text((int)$a['owing']);
    $when = $a['pauseAt'] !== '' ? online_lagos((int)strtotime($a['pauseAt']))->format('l j F, g:ia') . ' Lagos time' : '';
    $L = online_live_settings();
    $keep = 'Their portal, Labs, lessons, journal and mentor are not affected.';
    switch ($stage) {
        case 'paused':
            return ['title' => $first . '’s live classes are paused', 'subject' => 'NGG Online: live classes paused',
                'text' => $first . '’s NGG Online balance of ' . $amt . ' is unpaid, so their live classes and Saturday session are paused. They open again the moment payment arrives. ' . $keep,
                'member' => ['title' => 'Your live classes are paused', 'text' => ONLINE_PAUSED_CHILD]];
        case 'restored':
            return ['title' => $first . '’s live classes are open again', 'subject' => 'NGG Online: live classes open again',
                'text' => 'Thank you — payment has arrived and ' . $first . '’s live classes and Saturday session are open again.',
                'member' => ['title' => 'Your live classes are open again', 'text' => 'You can join your live classes again. See you on Saturday!']];
        default:
            $lead = $stage === 'last' ? 'A last reminder: ' : ($stage === 'half' ? 'A reminder: ' : '');
            return ['title' => 'NGG Online: ' . fees_money_text((int)$a['owing']) . ' due for ' . $first, 'subject' => 'NGG Online: payment due',
                'text' => $lead . $first . '’s NGG Online fee of ' . $amt . ' is due. '
                    . ($L['pauseLive'] && $when !== '' ? 'Please pay by ' . $when . ' to keep their live classes open. ' : '') . $keep . ' Pay in the family account.'];
    }
}

/**
 * The access tick (webcron, every 30 minutes): for each online member, send the latest reminder stage that has
 * arrived and not been sent; when a paused member is paid, say so. Quiet hours hold payment messages (never the
 * "open again" one) until 07:00. Claimed per (member, unpaid-since, stage) through dues_notices, so two ticks
 * never send one message twice.
 */
function online_access_tick(?int $now = null): array {
    $now = $now ?? time(); $L = online_live_settings();
    $name = online_centre_name(); if ($name === '') return ['looked' => 0, 'sent' => 0];
    $hour = (int)online_lagos($now)->format('G');
    $quiet = $hour >= ONLINE_QUIET_FROM || $hour < ONLINE_QUIET_TO;
    $rows = db_all("SELECT * FROM members WHERE centre = ? AND status = 'active' AND COALESCE(role,'member') = 'member' ORDER BY id LIMIT " . ONLINE_NOTIFY_BATCH, [$name]);
    $sent = 0; $stages = online_remind_stages($L['graceHours']);
    foreach ($rows as $m) {
        $a = online_access_state($m, $now);
        $mid = (string)$m['memberId'];
        if ($a['state'] === 'ok' || $a['state'] === 'owing' && !$a['dueSince']) {
            // Paid after a pause: say the classes are open again, once per pause.
            $p = db_row("SELECT refKey FROM dues_notices WHERE memberId = ? AND kind = 'online_paused' ORDER BY id DESC LIMIT 1", [$mid]);
            if ($p && $a['owing'] <= 0) {
                $ref = 'restored:' . (string)$p['refKey'];
                $r = dues_notice_send($m, 'online_restored', $ref, online_remind_message($m, $a, 'restored'));
                if (!empty($r['sent'])) $sent++;
            }
            continue;
        }
        if ($a['dueSince'] === '' || $a['state'] === 'held' || $quiet) continue;
        $elapsed = $now - online_lagos_midnight($a['dueSince']);
        $latest = null;
        foreach ($stages as $st) if ($elapsed >= $st[1]) $latest = $st[0];
        if ($latest === null || ($latest === 'paused' && !$L['pauseLive'])) continue;
        $kind = $latest === 'paused' ? 'online_paused' : 'online_due';
        $r = dues_notice_send($m, $kind, 'online:' . $a['dueSince'] . ':' . $latest, online_remind_message($m, $a, $latest) + ['amount' => (int)$a['owing'], 'dueOn' => $a['dueSince']]);
        if (!empty($r['sent'])) $sent++;
    }
    return ['looked' => count($rows), 'sent' => $sent];
}

/* ── 3. Live classes ─────────────────────────────────────────────────────── */

/** A class row as the screens read it. */
function online_class_public(array $r): array {
    return ['classId' => (string)$r['classId'], 'title' => (string)$r['title'], 'course' => (string)$r['course'],
        'instructor' => (string)$r['instructorName'], 'instructorId' => (string)$r['instructorId'],
        'day' => (string)$r['day'], 'time' => (string)$r['startTime'], 'minutes' => (int)$r['minutes'],
        'startsOn' => (string)$r['startsOn'], 'endsOn' => (string)$r['endsOn'], 'notes' => (string)$r['notes'], 'status' => (string)$r['status'],
        'hasLink' => trim((string)$r['url']) !== ''];
}

function online_classes_active(): array {
    try { return db_all("SELECT * FROM online_classes WHERE status = 'active' ORDER BY day, startTime, title LIMIT " . ONLINE_CLASS_MAX); }
    catch (Throwable $e) { return []; }
}

/**
 * Every occurrence of a class between two moments: [date, start, end] in Lagos time, inside its term. A class
 * is weekly on its day; the term bounds are inclusive dates.
 */
function online_class_occurrences(array $c, int $from, int $to): array {
    $day = in_array((string)$c['day'], ONLINE_DAYS, true) ? (string)$c['day'] : 'Saturday';
    [$h, $mi] = array_map('intval', explode(':', preg_match('/^\d{1,2}:\d{2}$/', (string)$c['startTime']) ? (string)$c['startTime'] : '10:00'));
    $mins = max(15, min(360, (int)$c['minutes']));
    $out = [];
    $d = online_lagos($from)->setTime(0, 0);
    for ($i = 0; $i < 400 && $d->getTimestamp() <= $to; $i++, $d = $d->modify('+1 day')) {
        if ($d->format('l') !== $day) continue;
        $date = $d->format('Y-m-d');
        if ((string)$c['startsOn'] !== '' && $date < (string)$c['startsOn']) continue;
        if ((string)$c['endsOn'] !== '' && $date > (string)$c['endsOn']) continue;
        $start = $d->setTime($h, $mi)->getTimestamp(); $end = $start + $mins * 60;
        if ($end <= $from || $start > $to) continue;
        $out[] = ['date' => $date, 'start' => $start, 'end' => $end];
    }
    return $out;
}

/**
 * Is this class for this member? A planned class (autoKey) is for the members placed in it; a hand-made class
 * with no course is for every online member; otherwise it is for everyone taking its course.
 */
function online_class_for(array $c, array $courses, string $memberId = ''): bool {
    if (trim((string)($c['autoKey'] ?? '')) !== '') {
        static $members = [];
        $cid = (string)$c['classId'];
        if (!isset($members[$cid]) || !empty($GLOBALS['__online_class_members_fresh'])) {
            $members[$cid] = [];
            try { foreach (db_all('SELECT memberId FROM online_class_members WHERE classId = ?', [$cid]) as $r) $members[$cid][(string)$r['memberId']] = true; } catch (Throwable $e) {}
        }
        return isset($members[$cid][$memberId]);
    }
    if (trim((string)$c['course']) === '') return true;
    foreach ($courses as $x) if (strcasecmp((string)$x, (string)$c['course']) === 0) return true;
    return false;
}

/** The per-occurrence rows (recording, cancelled, note) for some classes over some dates, in one query. */
function online_class_session_rows(array $classIds, string $fromDate): array {
    if (!$classIds) return [];
    $in = implode(',', array_fill(0, count($classIds), '?'));
    $out = [];
    try { foreach (db_all("SELECT * FROM online_class_sessions WHERE classId IN ($in) AND sessionDate >= ?", array_merge($classIds, [$fromDate])) as $r) $out[(string)$r['classId'] . '|' . (string)$r['sessionDate']] = $r; }
    catch (Throwable $e) {}
    return $out;
}

/** One occurrence as the portal shows it. Times are UTC ISO; the browser shows them in the family's own zone. */
function online_occurrence_view(array $c, array $o, ?array $sess, array $joined, int $now): array {
    $opens = $o['start'] - max(0, (int)online_settings()['joinOpensMinutes']) * 60;
    return ['classId' => (string)$c['classId'], 'title' => (string)$c['title'], 'course' => (string)$c['course'], 'instructor' => (string)$c['instructorName'],
        'date' => $o['date'], 'start' => gmdate('Y-m-d\TH:i:s\Z', $o['start']), 'end' => gmdate('Y-m-d\TH:i:s\Z', $o['end']),
        'lagos' => online_lagos($o['start'])->format('l j F, g:ia'), 'minutes' => (int)(($o['end'] - $o['start']) / 60),
        'open' => $now >= $opens && $now < $o['end'] && empty($sess['cancelled']), 'live' => $now >= $o['start'] && $now < $o['end'],
        'cancelled' => !empty($sess['cancelled']), 'note' => (string)($sess['note'] ?? ''), 'joined' => isset($joined[(string)$c['classId'] . '|' . $o['date']]),
        'hasLink' => trim((string)$c['url']) !== '', 'lesson' => online_class_lesson($c)];
}

/**
 * member.online.classes — an online member's coming week of live classes (their courses' classes and the
 * classes for everyone), the Saturday session, recordings from the last six weeks, and whether live classes
 * are open to them. The child's view never carries an amount.
 */
function member_online_classes(array $p): array {
    $m = online_member_from($p); if (!$m) return ['ok' => false, 'error' => 'not_online'];
    $now = time(); $mid = (string)$m['memberId'];
    $courses = fees_online_courses($m);
    $mine = array_values(array_filter(online_classes_active(), static fn($c) => online_class_for($c, $courses, $mid)));
    $ids = array_map(static fn($c) => (string)$c['classId'], $mine);
    $sess = online_class_session_rows($ids, online_lagos($now - ONLINE_RECORDINGS_DAYS * 86400)->format('Y-m-d'));
    $joined = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT classId, sessionDate FROM online_class_joins WHERE memberId = ? AND classId IN ($in) AND sessionDate >= ?",
                        array_merge([$mid], $ids, [online_lagos($now - ONLINE_RECORDINGS_DAYS * 86400)->format('Y-m-d')])) as $r) $joined[(string)$r['classId'] . '|' . (string)$r['sessionDate']] = true;
    }
    $upcoming = []; $recordings = [];
    foreach ($mine as $c) {
        foreach (online_class_occurrences($c, $now, $now + ONLINE_CLASS_DAYS_AHEAD * 86400) as $o)
            $upcoming[] = online_occurrence_view($c, $o, $sess[(string)$c['classId'] . '|' . $o['date']] ?? null, $joined, $now);
        foreach (online_class_occurrences($c, $now - ONLINE_RECORDINGS_DAYS * 86400, $now) as $o) {
            $s = $sess[(string)$c['classId'] . '|' . $o['date']] ?? null;
            if ($o['end'] > $now || !$s || trim((string)$s['recordingUrl']) === '') continue;
            $recordings[] = ['classId' => (string)$c['classId'], 'title' => (string)$c['title'], 'date' => $o['date'], 'url' => (string)$s['recordingUrl'],
                'attended' => isset($joined[(string)$c['classId'] . '|' . $o['date']])];
        }
    }
    usort($upcoming, static fn($a, $b) => strcmp($a['start'], $b['start']));
    usort($recordings, static fn($a, $b) => strcmp($b['date'], $a['date']));
    $a = online_access_state($m, $now);
    $session = member_online_session(['memberId' => $mid]);
    return ['ok' => true, 'classes' => $upcoming, 'recordings' => array_slice($recordings, 0, 30), 'session' => $session['session'] ?? null,
        'paused' => $a['state'] === 'paused', 'pausedText' => $a['state'] === 'paused' ? ONLINE_PAUSED_CHILD : '', 'tz' => ONLINE_TZ];
}

/** member.online.class.join {classId} — records attendance for the class on now and returns its link. */
function member_online_class_join(array $p): array {
    $m = online_member_from($p); if (!$m) return ['ok' => false, 'error' => 'not_online'];
    if (!online_live_open($m)) return ['ok' => false, 'error' => 'paused', 'detail' => ONLINE_PAUSED_CHILD];
    $cid = (string)($p['classId'] ?? '');
    $c = $cid !== '' ? db_row("SELECT * FROM online_classes WHERE classId = ? AND status = 'active' LIMIT 1", [$cid]) : null;
    if (!$c || !online_class_for($c, fees_online_courses($m), (string)$m['memberId'])) return ['ok' => false, 'error' => 'not_your_class'];
    $url = trim((string)$c['url']);
    if ($url === '' || !preg_match('#^https://#i', $url)) return ['ok' => false, 'error' => 'no_link', 'detail' => 'The link for this class has not been set yet. Your centre team has been told.'];
    $now = time(); $openMins = max(0, (int)online_settings()['joinOpensMinutes']);
    $occ = null;
    foreach (online_class_occurrences($c, $now - 6 * 3600, $now + $openMins * 60 + 60) as $o) if ($now >= $o['start'] - $openMins * 60 && $now < $o['end']) $occ = $o;
    if (!$occ) {
        $next = online_class_occurrences($c, $now, $now + 14 * 86400)[0] ?? null;
        return ['ok' => false, 'error' => 'not_open', 'detail' => $next ? 'The next class is ' . online_lagos($next['start'])->format('l j F, g:ia') . ' (Lagos time). Join opens ' . $openMins . ' minutes before.' : 'This class has no coming dates.'];
    }
    $s = online_class_session_rows([$cid], $occ['date'])[$cid . '|' . $occ['date']] ?? null;
    if ($s && !empty($s['cancelled'])) return ['ok' => false, 'error' => 'cancelled', 'detail' => 'Today’s class is cancelled.' . (trim((string)$s['note']) !== '' ? ' ' . (string)$s['note'] : '')];
    try { db_insert('online_class_joins', ['classId' => $cid, 'memberId' => (string)$m['memberId'], 'sessionDate' => $occ['date'], 'joinedAt' => now_iso()]); }
    catch (Throwable $e) { /* joined already: UNIQUE(classId, memberId, sessionDate) — the link is still theirs */ }
    return ['ok' => true, 'url' => $url, 'date' => $occ['date']];
}

/** The online members a class is for (active, at the online centre), capped. */
function online_class_audience(array $c, int $cap = ONLINE_CLASS_NOTIFY_MAX): array {
    $name = online_centre_name(); if ($name === '') return [];
    $rows = db_all("SELECT * FROM members WHERE centre = ? AND status = 'active' AND COALESCE(role,'member') = 'member' ORDER BY id LIMIT " . (int)$cap, [$name]);
    return array_values(array_filter($rows, static fn($m) => online_class_for($c, fees_online_courses($m), (string)$m['memberId'])));
}

/** admin.online.classes — every class with its next date, and last time's attendance against who it is for. */
function admin_online_classes(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'people', 'club']); if (!$g['ok']) return $g;
    $now = time();
    try { $all = db_all("SELECT * FROM online_classes WHERE status IN ('active','paused') ORDER BY status, day, startTime, title LIMIT " . ONLINE_CLASS_MAX); }
    catch (Throwable $e) { $all = []; }
    $out = [];
    $audience = online_centre_name() !== '' ? db_all("SELECT * FROM members WHERE centre = ? AND status = 'active' AND COALESCE(role,'member') = 'member' LIMIT 2000", [online_centre_name()]) : [];
    $coursesOf = []; foreach ($audience as $m) $coursesOf[(string)$m['memberId']] = fees_online_courses($m);
    foreach ($all as $c) {
        $next = online_class_occurrences($c, $now, $now + 21 * 86400)[0] ?? null;
        $past = online_class_occurrences($c, $now - 21 * 86400, $now);
        $last = null; foreach ($past as $o) if ($o['end'] <= $now) $last = $o;
        $for = 0; foreach ($coursesOf as $id => $cs) if (online_class_for($c, $cs, (string)$id)) $for++;
        $came = $last ? (int)(db_row('SELECT COUNT(*) n FROM online_class_joins WHERE classId = ? AND sessionDate = ?', [(string)$c['classId'], $last['date']])['n'] ?? 0) : 0;
        $sess = $last ? db_row('SELECT recordingUrl, cancelled FROM online_class_sessions WHERE classId = ? AND sessionDate = ?', [(string)$c['classId'], $last['date']]) : null;
        $out[] = online_class_public($c) + ['url' => (string)$c['url'], 'auto' => (string)($c['autoKey'] ?? '') !== '', 'locked' => !empty($c['locked']), 'lesson' => online_class_lesson($c),
            'next' => $next ? ['date' => $next['date'], 'start' => gmdate('Y-m-d\TH:i:s\Z', $next['start']), 'lagos' => online_lagos($next['start'])->format('l j F, g:ia')] : null,
            'last' => $last ? ['date' => $last['date'], 'came' => $came, 'for' => $for, 'recording' => (string)($sess['recordingUrl'] ?? ''), 'cancelled' => !empty($sess['cancelled'])] : null,
            'members' => $for];
    }
    return ['ok' => true, 'classes' => $out, 'courses' => function_exists('member_course_names') ? member_course_names() : [], 'max' => ONLINE_CLASS_MAX, 'tz' => ONLINE_TZ,
        'settings' => online_live_settings(), 'plan' => setting_get('online_plan_last') ?: null];
}

/** admin.online.class.save — create (no classId) or update a live class. Validated whole before any write. */
function admin_online_class_save(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $in = is_array($p['class'] ?? null) ? $p['class'] : $p;
    $cid = (string)($in['classId'] ?? '');
    $cur = $cid !== '' ? db_row('SELECT * FROM online_classes WHERE classId = ? LIMIT 1', [$cid]) : null;
    if ($cid !== '' && !$cur) return ['ok' => false, 'error' => 'not_found'];
    $title = trim((string)($in['title'] ?? ($cur['title'] ?? '')));
    if (mb_strlen($title) < 3) return ['ok' => false, 'error' => 'title_required', 'detail' => 'Give the class a name families will recognise, e.g. “Coding — live class”.'];
    $course = trim((string)($in['course'] ?? ($cur['course'] ?? '')));
    if ($course !== '') {
        $match = ''; foreach (member_course_names() as $c) if (strcasecmp($c, $course) === 0) $match = $c;
        if ($match === '') return ['ok' => false, 'error' => 'unknown_course', 'detail' => 'Choose a course from the catalogue, or leave it empty for everyone.'];
        $course = $match;
    }
    $day = (string)($in['day'] ?? ($cur['day'] ?? 'Saturday'));
    if (!in_array($day, ONLINE_DAYS, true)) return ['ok' => false, 'error' => 'bad_day'];
    $time = (string)($in['time'] ?? ($cur['startTime'] ?? '10:00'));
    if (!preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $time)) return ['ok' => false, 'error' => 'bad_time', 'detail' => 'Write the time as HH:MM in Lagos time, e.g. 10:00.'];
    $mins = (int)($in['minutes'] ?? ($cur['minutes'] ?? 60));
    if ($mins < 15 || $mins > 360) return ['ok' => false, 'error' => 'bad_minutes', 'detail' => 'A class runs 15 to 360 minutes.'];
    $url = trim((string)($in['url'] ?? ($cur['url'] ?? '')));
    if ($url !== '' && !preg_match('#^https://[^\s]+$#i', $url)) return ['ok' => false, 'error' => 'bad_url', 'detail' => 'The class link must start with https://'];
    $from = trim((string)($in['startsOn'] ?? ($cur['startsOn'] ?? ''))); $to = trim((string)($in['endsOn'] ?? ($cur['endsOn'] ?? '')));
    foreach ([$from, $to] as $d) if ($d !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return ['ok' => false, 'error' => 'bad_date'];
    if ($from !== '' && $to !== '' && $to < $from) return ['ok' => false, 'error' => 'ends_before_start'];
    $status = (string)($in['status'] ?? ($cur['status'] ?? 'active'));
    if (!in_array($status, ['active', 'paused', 'archived'], true)) return ['ok' => false, 'error' => 'bad_status'];
    if (!$cur && $status === 'active' && (int)(db_row("SELECT COUNT(*) n FROM online_classes WHERE status = 'active'")['n'] ?? 0) >= ONLINE_CLASS_MAX)
        return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . ONLINE_CLASS_MAX . ' live classes at once (ONLINE_CLASS_MAX). Archive one first.'];
    $row = ['title' => mb_substr($title, 0, 160), 'course' => $course, 'instructorId' => mb_substr((string)($in['instructorId'] ?? ($cur['instructorId'] ?? '')), 0, 64),
        'instructorName' => mb_substr(trim((string)($in['instructor'] ?? ($cur['instructorName'] ?? ''))), 0, 160), 'day' => $day, 'startTime' => $time, 'minutes' => $mins,
        'url' => mb_substr($url, 0, 500), 'startsOn' => $from, 'endsOn' => $to, 'notes' => mb_substr(trim((string)($in['notes'] ?? ($cur['notes'] ?? ''))), 0, 1000),
        'status' => $status, 'updatedAt' => now_iso()];
    /* A person changing a planned class LOCKS it: the planner keeps its time, instructor and link from then on,
       and plans everything else around it. Unlocking hands it back. */
    if ($cur && (string)($cur['autoKey'] ?? '') !== '') $row['locked'] = array_key_exists('locked', $in) ? (!empty($in['locked']) ? 1 : 0) : 1;
    if ($row['url'] === '' && online_live_settings()['linkProvider'] === 'jitsi') $row['url'] = online_jitsi_link($course !== '' ? $course : $title);
    $by = (string)$g['requester']['memberId'];
    if ($cur) db_update('online_classes', $row, ['classId' => $cid]);
    else { $cid = 'OC-' . strtoupper(bin2hex(random_bytes(4))); db_insert('online_classes', $row + ['classId' => $cid, 'createdBy' => $by, 'createdAt' => now_iso()]); }
    audit($cur ? 'online.class.update' : 'online.class.create', $by, $cid, ['title' => $row['title'], 'course' => $course, 'day' => $day, 'time' => $time, 'status' => $status]);
    return ['ok' => true, 'class' => online_class_public(db_row('SELECT * FROM online_classes WHERE classId = ?', [$cid]))];
}

/**
 * admin.online.class.session {classId, date, recordingUrl?, cancelled?, note?} — one occurrence: its recording,
 * a cancellation (the families are told, once), or a note. The date must be one the class actually meets on.
 */
function admin_online_class_session(array $p): array {
    $cid = (string)($p['classId'] ?? ''); $date = (string)($p['date'] ?? '');
    $c = $cid !== '' ? db_row('SELECT * FROM online_classes WHERE classId = ? LIMIT 1', [$cid]) : null;
    $g = admin_cap_gate($p, 'curriculum');
    /* The class's own instructor may add the recording or a note (never cancel — that tells every family). */
    if (!$g['ok'] && $c && online_is_class_instructor($c, (string)($p['requesterId'] ?? ''))) {
        if (!empty($p['cancelled'])) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'Ask the centre team to cancel a class.'];
        $g = ['ok' => true, 'requester' => ['memberId' => (string)$p['requesterId']]];
    }
    if (!$g['ok']) return $g;
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    $t = online_lagos_midnight($date);
    if (!online_class_occurrences($c, $t, $t + 86399)) return ['ok' => false, 'error' => 'not_a_class_day', 'detail' => 'The class does not meet on that date.'];
    $rec = trim((string)($p['recordingUrl'] ?? ''));
    if ($rec !== '' && !preg_match('#^https://[^\s]+$#i', $rec)) return ['ok' => false, 'error' => 'bad_url', 'detail' => 'The recording link must start with https://'];
    $cur = db_row('SELECT * FROM online_class_sessions WHERE classId = ? AND sessionDate = ?', [$cid, $date]);
    $by = (string)$g['requester']['memberId'];
    $row = ['recordingUrl' => array_key_exists('recordingUrl', $p) ? mb_substr($rec, 0, 500) : (string)($cur['recordingUrl'] ?? ''),
            'cancelled' => array_key_exists('cancelled', $p) ? (!empty($p['cancelled']) ? 1 : 0) : (int)($cur['cancelled'] ?? 0),
            'note' => array_key_exists('note', $p) ? mb_substr(trim((string)$p['note']), 0, 500) : (string)($cur['note'] ?? ''),
            'updatedBy' => $by, 'updatedAt' => now_iso()];
    if ($cur) db_update('online_class_sessions', $row, ['classId' => $cid, 'sessionDate' => $date]);
    else db_insert('online_class_sessions', $row + ['classId' => $cid, 'sessionDate' => $date, 'remindedAt' => '']);
    $told = 0;
    if ($row['cancelled'] && empty($cur['cancelled']) && $date >= online_lagos_today()) {
        $when = online_lagos(online_class_occurrences($c, $t, $t + 86399)[0]['start'])->format('l j F, g:ia');
        foreach (online_class_audience($c) as $m) {
            $first = trim(explode(' ', (string)$m['fullName'])[0] ?? '') ?: 'Your child';
            $r = dues_notice_send($m, 'online_class', 'cancel:' . $cid . ':' . $date, ['title' => (string)$c['title'] . ' is cancelled on ' . $when,
                'text' => $first . '’s live class “' . (string)$c['title'] . '” on ' . $when . ' (Lagos time) is cancelled.' . ($row['note'] !== '' ? ' ' . $row['note'] : ''),
                'member' => ['title' => 'Class cancelled', 'text' => '“' . (string)$c['title'] . '” on ' . $when . ' is cancelled.' . ($row['note'] !== '' ? ' ' . $row['note'] : '')]]);
            if (!empty($r['sent'])) $told++;
        }
    }
    // A recording newly added: the members who missed that class are told it is there.
    if ($row['recordingUrl'] !== '' && trim((string)($cur['recordingUrl'] ?? '')) === '' && $date <= online_lagos_today()) {
        $came = []; foreach (db_all('SELECT memberId FROM online_class_joins WHERE classId = ? AND sessionDate = ?', [$cid, $date]) as $r) $came[(string)$r['memberId']] = true;
        foreach (online_class_audience($c) as $m) if (!isset($came[(string)$m['memberId']]) && function_exists('push_notification')) {
            try { push_notification((string)$m['memberId'], ['kind' => 'online', 'title' => 'Missed “' . (string)$c['title'] . '”? The recording is ready', 'body' => 'Watch it in your portal under Live classes.', 'linkPage' => 'online']); $told++; } catch (Throwable $e) {}
        }
    }
    audit('online.class.session', $by, $cid, ['date' => $date, 'cancelled' => (bool)$row['cancelled'], 'recording' => $row['recordingUrl'] !== '', 'told' => $told]);
    return ['ok' => true, 'told' => $told];
}

/** admin.online.class.attendance {classId, date} — who it is for, and who joined. */
function admin_online_class_attendance(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'people', 'club']); if (!$g['ok']) return $g;
    $cid = (string)($p['classId'] ?? ''); $date = (string)($p['date'] ?? '');
    $c = $cid !== '' ? db_row('SELECT * FROM online_classes WHERE classId = ? LIMIT 1', [$cid]) : null;
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return ['ok' => false, 'error' => 'bad_date'];
    $joined = [];
    foreach (db_all('SELECT memberId, joinedAt FROM online_class_joins WHERE classId = ? AND sessionDate = ?', [$cid, $date]) as $r) $joined[(string)$r['memberId']] = (string)$r['joinedAt'];
    $rows = array_map(static fn($m) => ['memberId' => (string)$m['memberId'], 'name' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
        'joinedAt' => $joined[(string)$m['memberId']] ?? ''], online_class_audience($c, 2000));
    return ['ok' => true, 'class' => online_class_public($c), 'date' => $date, 'members' => $rows, 'came' => count($joined)];
}

/**
 * The class reminder tick (webcron, every 10 minutes): an occurrence starting within `classRemindMinutes` that
 * has not been reminded is claimed (remindedAt) and each member it is for — and their family — is told, once.
 * A paused member is not invited to a class they cannot join.
 */
function online_class_remind_tick(?int $now = null): array {
    $now = $now ?? time(); $L = online_live_settings();
    if ($L['classRemindMinutes'] <= 0) return ['classes' => 0, 'told' => 0];
    $lead = $L['classRemindMinutes'] * 60; $done = 0; $told = 0;
    foreach (online_classes_active() as $c) {
        if (trim((string)$c['url']) === '') continue;   // nothing to join yet: the reminder would be a broken promise
        foreach (online_class_occurrences($c, $now, $now + $lead) as $o) {
            if ($o['start'] <= $now) continue;
            $cid = (string)$c['classId'];
            $s = db_row('SELECT * FROM online_class_sessions WHERE classId = ? AND sessionDate = ?', [$cid, $o['date']]);
            if ($s && (!empty($s['cancelled']) || (string)$s['remindedAt'] !== '')) continue;
            // Claim it first, so a second tick finds remindedAt set and stops.
            if ($s) { if (db_exec("UPDATE online_class_sessions SET remindedAt = ? WHERE classId = ? AND sessionDate = ? AND remindedAt = ''", [now_iso(), $cid, $o['date']]) < 1) continue; }
            else { try { db_insert('online_class_sessions', ['classId' => $cid, 'sessionDate' => $o['date'], 'remindedAt' => now_iso(), 'updatedAt' => now_iso()]); } catch (Throwable $e) { continue; } }
            $done++;
            $when = online_lagos($o['start'])->format('g:ia');
            $lesson = online_class_lesson($c);
            $prep = $lesson ? ' This week: “' . $lesson['title'] . '” — a look at it before class helps.' : '';
            foreach (online_class_audience($c) as $m) {
                if (online_access_state($m, $now)['state'] === 'paused') continue;
                $first = trim(explode(' ', (string)$m['fullName'])[0] ?? '') ?: 'Your child';
                $r = dues_notice_send($m, 'online_class', 'remind:' . $cid . ':' . $o['date'], [
                    'title' => (string)$c['title'] . ' starts at ' . $when . ' (Lagos time)',
                    'text' => $first . '’s live class “' . (string)$c['title'] . '” starts at ' . $when . ' Lagos time. They join from their NGG portal — Join opens a few minutes before.' . $prep,
                    'member' => ['title' => 'Live class soon: ' . (string)$c['title'], 'text' => 'Starts at ' . $when . ' (Lagos time). Open your portal and press Join.' . $prep]]);
                if (!empty($r['sent'])) $told++;
            }
        }
    }
    return ['classes' => $done, 'told' => $told];
}


/* ── The automatic timetable ─────────────────────────────────────────────── */

/** A private, unguessable Jitsi Meet room. The link is only ever handed out through Join, which is the register. */
function online_jitsi_link(string $name): string {
    $slug = trim(preg_replace('/[^A-Za-z0-9]+/', '', ucwords(strtolower($name))), '');
    return 'https://meet.jit.si/NGG-' . mb_substr($slug !== '' ? $slug : 'Class', 0, 30) . '-' . bin2hex(random_bytes(6));
}

/**
 * Where a class's members are in the course: the first published lesson (by level, week, position) that fewer
 * than half of them have completed — so the instructor teaches where the group actually is, not where a
 * calendar says it should be. One grouped query for the completions. Null when the course has no lessons.
 */
function online_class_lesson(array $c): ?array {
    static $memo = [];
    $cid = (string)$c['classId'];
    if (array_key_exists($cid, $memo)) return $memo[$cid];
    $course = trim((string)$c['course']);
    if ($course === '') return $memo[$cid] = null;
    try { $units = db_all("SELECT unitId, title, week FROM curriculum_units WHERE course = ? AND status = 'published' ORDER BY level, week, position LIMIT 300", [$course]); }
    catch (Throwable $e) { return $memo[$cid] = null; }
    if (!$units) return $memo[$cid] = null;
    $ids = array_map(static fn($m) => (string)$m['memberId'], online_class_audience($c, 300));
    $done = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT unitId, COUNT(DISTINCT memberId) n FROM curriculum_progress WHERE status = 'completed' AND memberId IN ($in) GROUP BY unitId", $ids) as $r) $done[(string)$r['unitId']] = (int)$r['n'];
    }
    $half = max(1, (int)ceil(count($ids) / 2));
    foreach ($units as $u) if (($done[(string)$u['unitId']] ?? 0) < $half)
        return $memo[$cid] = ['unitId' => (string)$u['unitId'], 'title' => (string)$u['title'], 'week' => (int)$u['week'], 'done' => $done[(string)$u['unitId']] ?? 0, 'of' => count($ids)];
    return $memo[$cid] = ['unitId' => '', 'title' => 'Every lesson finished — a project class', 'week' => 0, 'done' => count($ids), 'of' => count($ids)];
}

/** Is this member account the class's instructor? (volunteers.memberId of the assigned volunteer) */
function online_is_class_instructor(array $c, string $memberId): bool {
    if ($memberId === '' || (string)$c['instructorId'] === '') return false;
    $v = db_row('SELECT memberId FROM volunteers WHERE volunteerId = ? LIMIT 1', [(string)$c['instructorId']]);
    return $v && (string)$v['memberId'] === $memberId;
}

/** Instructors who may teach a course online: active, cleared, the course on their record. Online-centre ones first. */
function online_instructor_pool(): array {
    try { $vs = db_all("SELECT volunteerId, memberId, fullName, centre, courses FROM volunteers WHERE role = 'instructor' AND status = 'active' AND safeguarding = 'cleared' ORDER BY id LIMIT 500"); }
    catch (Throwable $e) { return []; }
    $online = online_centre_name(); $out = [];
    foreach ($vs as $v) {
        $cs = array_values(array_filter(array_map('strval', json_decode((string)($v['courses'] ?? ''), true) ?: [])));
        if (!$cs) continue;
        $out[] = ['id' => (string)$v['volunteerId'], 'memberId' => (string)$v['memberId'], 'name' => (string)$v['fullName'],
            'online' => $online !== '' && strcasecmp((string)$v['centre'], $online) === 0, 'courses' => array_map('mb_strtolower', $cs)];
    }
    usort($out, static fn($a, $b) => [$b['online'], $a['name']] <=> [$a['online'], $b['name']]);
    return $out;
}

/** The day's class slots: start minutes after midnight, clear of the Saturday session when it is the same day. */
function online_plan_slots(array $L): array {
    [$fh, $fm] = array_map('intval', explode(':', $L['classFrom'])); [$uh, $um] = array_map('intval', explode(':', $L['classUntil']));
    $from = $fh * 60 + $fm; $until = $uh * 60 + $um; $len = $L['classMinutes']; $step = $len + $L['classGapMinutes'];
    $s = online_settings(); $sess = null;
    if ((string)$s['sessionDay'] === $L['classDay'] && preg_match('/^(\d{1,2}):(\d{2})$/', (string)$s['sessionTime'], $mm))
        $sess = [(int)$mm[1] * 60 + (int)$mm[2], (int)$mm[1] * 60 + (int)$mm[2] + (int)$s['sessionMinutes'] + $L['classGapMinutes']];
    $out = [];
    for ($t = $from; $t + $len <= $until; $t += $step) {
        if ($sess && $t < $sess[1] && $t + $len > $sess[0]) { $t = $sess[1] - $step; continue; }
        $out[] = $t;
    }
    return $out;
}
function online_hhmm(int $mins): string { return sprintf('%02d:%02d', intdiv($mins, 60), $mins % 60); }

/**
 * THE PLANNER. From who takes what, the live classes that should exist, when, and who teaches them:
 *
 *   · one class per course with online members, split into groups of at most `classMaxSize` — a member
 *     stays in their group while they take the course, newcomers fill the smallest group;
 *   · a slot each on `classDay` between `classFrom` and `classUntil`, so that NO member and NO instructor is
 *     in two classes at once (graph colouring, largest class first). A class keeps its current slot whenever
 *     that is still clash-free, so families are not reshuffled every week; when it must move, they are told;
 *   · an instructor: the one already teaching it if still free and eligible, else the eligible instructor with
 *     the fewest classes who is free then (online-centre instructors first); none eligible is reported, not
 *     guessed;
 *   · a private meeting room (Jitsi) unless the provider is 'manual' or a link is already set.
 *
 * Locked classes (any a person edited) are planned AROUND, never moved. Classes no longer needed are archived,
 * which keeps their attendance and recordings. Returns a report; with $dry nothing is written.
 */
function online_plan_classes(string $by = 'system', bool $dry = false): array {
    $L = online_live_settings();
    $name = online_centre_name();
    if ($name === '') return ['ok' => false, 'error' => 'no_online_centre'];
    $members = db_all("SELECT * FROM members WHERE centre = ? AND status = 'active' AND COALESCE(role,'member') = 'member' ORDER BY id LIMIT 3000", [$name]);
    $demand = [];   // course => [memberId...]
    foreach ($members as $m) foreach (fees_online_courses($m) as $c) $demand[$c][] = (string)$m['memberId'];
    ksort($demand);
    try { $existing = db_all("SELECT * FROM online_classes WHERE status IN ('active','paused') ORDER BY id"); } catch (Throwable $e) { return ['ok' => false, 'error' => 'not_migrated']; }
    $roster = [];
    foreach (db_all('SELECT classId, memberId FROM online_class_members') as $r) $roster[(string)$r['classId']][] = (string)$r['memberId'];
    $autoByKey = []; $locked = []; $manualBusy = [];
    foreach ($existing as $c) {
        if ((string)$c['autoKey'] !== '') $autoByKey[(string)$c['autoKey']] = $c;
        elseif ((string)$c['status'] === 'active') $manualBusy[] = $c;
    }
    // 1. Groups.
    $want = [];   // autoKey => [course, groupNo, members[], current row|null]
    foreach ($demand as $course => $ids) {
        $ids = array_values(array_unique($ids));
        $groups = max(1, (int)ceil(count($ids) / $L['classMaxSize']));
        $slots = [];
        for ($gN = 1; $gN <= $groups; $gN++) {
            $key = 'course:' . mb_strtolower($course) . ':' . $gN;
            $cur = $autoByKey[$key] ?? null;
            $keep = $cur ? array_values(array_intersect($roster[(string)$cur['classId']] ?? [], $ids)) : [];
            $slots[$gN] = ['course' => $course, 'groupNo' => $gN, 'groups' => $groups, 'members' => $keep, 'cur' => $cur];
        }
        $placed = []; foreach ($slots as $sl) foreach ($sl['members'] as $id) $placed[$id] = true;
        foreach ($ids as $id) {
            if (isset($placed[$id])) continue;
            uasort($slots, static fn($a, $b) => count($a['members']) <=> count($b['members']));
            $first = array_key_first($slots); $slots[$first]['members'][] = $id;
        }
        ksort($slots);
        // A group grown past the size (a newcomer joined a full one) gives its newest members to the smallest.
        foreach ($slots as $sl) $want['course:' . mb_strtolower($course) . ':' . $sl['groupNo']] = $sl;
    }
    // 2. Slots and instructors — locked classes first, then current ones, then new, largest first.
    $slotList = online_plan_slots($L);
    if (!$slotList) return ['ok' => false, 'error' => 'no_slots', 'detail' => 'No class fits between ' . $L['classFrom'] . ' and ' . $L['classUntil'] . '. Widen the day or shorten the classes.'];
    $pool = online_instructor_pool(); $load = [];
    $memberAt = []; $instAt = [];   // slot => [id => true]
    $toMin = static fn(string $t) => (int)substr($t, 0, 2) * 60 + (int)substr($t, 3, 2);
    $occupy = static function (array $ids, string $inst, int $slot) use (&$memberAt, &$instAt, &$load) {
        foreach ($ids as $id) $memberAt[$slot][$id] = true;
        if ($inst !== '') { $instAt[$slot][$inst] = true; $load[$inst] = ($load[$inst] ?? 0) + 1; }
    };
    // Hand-made classes and locked planned ones hold their time.
    foreach ($manualBusy as $c) if ((string)$c['day'] === $L['classDay']) {
        $ids = array_map(static fn($m) => (string)$m['memberId'], array_filter($members, static fn($m) => online_class_for($c, fees_online_courses($m), (string)$m['memberId'])));
        $occupy($ids, (string)$c['instructorId'], $toMin((string)$c['startTime']));
    }
    $order = $want;
    uasort($order, static function ($a, $b) {
        $la = !empty($a['cur']['locked']); $lb = !empty($b['cur']['locked']);
        if ($la !== $lb) return $lb <=> $la;
        if ((bool)$a['cur'] !== (bool)$b['cur']) return (bool)$b['cur'] <=> (bool)$a['cur'];
        return count($b['members']) <=> count($a['members']);
    });
    $plan = []; $clashes = 0; $noInstructor = [];
    foreach ($order as $key => $w) {
        $cur = $w['cur'];
        $eligible = array_values(array_filter($pool, static fn($i) => in_array(mb_strtolower($w['course']), $i['courses'], true)));
        $free = static function (int $slot) use ($w, &$memberAt): int { $n = 0; foreach ($w['members'] as $id) if (isset($memberAt[$slot][$id])) $n++; return $n; };
        $pickInst = static function (int $slot) use ($eligible, &$instAt, &$load, $cur): string {
            $curId = (string)($cur['instructorId'] ?? '');
            foreach ($eligible as $i) if ($i['id'] === $curId && !isset($instAt[$slot][$i['id']])) return $i['id'];
            $best = ''; $bl = PHP_INT_MAX;
            foreach ($eligible as $i) if (!isset($instAt[$slot][$i['id']]) && ($load[$i['id']] ?? 0) < $bl) { $best = $i['id']; $bl = $load[$i['id']] ?? 0; }
            return $best;
        };
        if ($cur && !empty($cur['locked'])) {
            $slot = $toMin((string)$cur['startTime']); $inst = (string)$cur['instructorId'];
        } else {
            $slot = null; $inst = '';
            $curSlot = $cur && (string)$cur['day'] === $L['classDay'] ? $toMin((string)$cur['startTime']) : null;
            $tries = $curSlot !== null && in_array($curSlot, $slotList, true) ? array_merge([$curSlot], array_diff($slotList, [$curSlot])) : $slotList;
            // Clash-free with an instructor, then clash-free without one, then the fewest clashes.
            foreach ($tries as $t) if ($free($t) === 0 && (!$eligible || $pickInst($t) !== '')) { $slot = $t; break; }
            if ($slot === null) foreach ($tries as $t) if ($free($t) === 0) { $slot = $t; break; }
            if ($slot === null) { $bestN = PHP_INT_MAX; foreach ($tries as $t) if ($free($t) < $bestN) { $bestN = $free($t); $slot = $t; } $clashes += $bestN; }
            $inst = $pickInst($slot);
        }
        if ($inst === '' && !$eligible) $noInstructor[] = $w['course'];
        $occupy($w['members'], $inst, $slot);
        $plan[$key] = $w + ['slot' => $slot, 'instructorId' => $inst];
    }
    // 3. Write.
    $names = []; foreach ($pool as $i) $names[$i['id']] = $i['name'];
    $report = ['ok' => true, 'dryRun' => $dry, 'classes' => [], 'created' => 0, 'moved' => 0, 'archived' => 0, 'clashes' => $clashes,
               'noInstructor' => array_values(array_unique($noInstructor)), 'members' => count($members), 'at' => now_iso()];
    foreach ($plan as $key => $w) {
        $time = online_hhmm($w['slot']); $cur = $w['cur'];
        $title = $w['course'] . ' — live class' . ($w['groups'] > 1 ? ' · Group ' . chr(64 + $w['groupNo']) : '');
        $moved = $cur && ((string)$cur['startTime'] !== $time || (string)$cur['day'] !== $L['classDay']) && empty($cur['locked']);
        $report['classes'][] = ['key' => $key, 'title' => $title, 'course' => $w['course'], 'time' => $time, 'day' => $L['classDay'], 'size' => count($w['members']),
            'instructor' => $names[$w['instructorId']] ?? '', 'new' => !$cur, 'moved' => $moved, 'locked' => !empty($cur['locked'])];
        if (!$cur) $report['created']++; elseif ($moved) $report['moved']++;
        if ($dry) continue;
        $row = ['title' => $title, 'course' => $w['course'], 'groupNo' => $w['groupNo'], 'updatedAt' => now_iso(), 'status' => 'active'];
        if (!$cur || empty($cur['locked'])) $row += ['day' => $L['classDay'], 'startTime' => $time, 'minutes' => $L['classMinutes'],
            'instructorId' => $w['instructorId'], 'instructorName' => $names[$w['instructorId']] ?? ''];
        if ((!$cur || trim((string)$cur['url']) === '') && $L['linkProvider'] === 'jitsi') $row['url'] = online_jitsi_link($w['course']);
        if ($cur) { $cid = (string)$cur['classId']; db_update('online_classes', $row, ['classId' => $cid]); }
        else { $cid = 'OC-' . strtoupper(bin2hex(random_bytes(4))); db_insert('online_classes', $row + ['classId' => $cid, 'autoKey' => $key, 'createdBy' => $by, 'createdAt' => now_iso()]); }
        // The roster: exactly the planned members.
        $have = array_flip($roster[$cid] ?? []);
        foreach ($w['members'] as $id) if (!isset($have[$id])) { try { db_insert('online_class_members', ['classId' => $cid, 'memberId' => $id, 'addedAt' => now_iso()]); } catch (Throwable $e) {} }
        foreach (array_diff(array_keys($have), $w['members']) as $id) db_exec('DELETE FROM online_class_members WHERE classId = ? AND memberId = ?', [$cid, $id]);
        $GLOBALS['__online_class_members_fresh'] = true;
        /* The family hears once: a new class, a class that moved, or a child newly placed in a class. */
        $ampm = date('g:ia', mktime(intdiv($w['slot'], 60), $w['slot'] % 60));
        foreach ($members as $m) {
            $id = (string)$m['memberId'];
            if (!in_array($id, $w['members'], true)) continue;
            $isMove = $cur && $moved && isset($have[$id]);
            if ($cur && !$isMove && isset($have[$id])) continue;   // same class, same time: nothing to say
            $first = trim(explode(' ', (string)$m['fullName'])[0] ?? '') ?: 'Your child';
            dues_notice_send($m, 'online_class', ($isMove ? 'moved:' : 'new:') . $cid . ':' . $L['classDay'] . $time, [
                'title' => ($isMove ? 'New time: ' : 'New live class: ') . $title,
                'text' => $first . '’s live class “' . $title . '” is ' . ($isMove ? 'now ' : '') . 'every ' . $L['classDay'] . ' at ' . $ampm . ' Lagos time. They join from their portal.',
                'member' => ['title' => ($isMove ? 'New time: ' : 'New class: ') . $title, 'text' => 'Every ' . $L['classDay'] . ' at ' . $ampm . ' (Lagos time). Press Join in your portal.']]);
        }
    }
    foreach ($autoByKey as $key => $c) if (!isset($plan[$key]) && empty($c['locked'])) {
        $report['archived']++;
        if (!$dry) { db_update('online_classes', ['status' => 'archived', 'updatedAt' => now_iso()], ['classId' => (string)$c['classId']]); }
    }
    unset($GLOBALS['__online_class_members_fresh']);
    if (!$dry) {
        setting_set('online_plan_last', ['at' => $report['at'], 'by' => $by, 'classes' => count($report['classes']), 'created' => $report['created'], 'moved' => $report['moved'],
            'archived' => $report['archived'], 'clashes' => $clashes, 'noInstructor' => $report['noInstructor']], $by);
        audit('online.plan', $by === 'system' ? null : $by, 'online', ['classes' => count($report['classes']), 'created' => $report['created'], 'moved' => $report['moved'], 'archived' => $report['archived'], 'clashes' => $clashes]);
    }
    return $report;
}

/** The planner on its schedule (webcron): only when switched on. */
function online_plan_tick(): array {
    $L = online_live_settings();
    return $L['autoPlan'] ? online_plan_classes('system') : ['skipped' => 'off'];
}

/** admin.online.plan {apply?} — preview the timetable the planner would make, or make it now. */
function admin_online_plan(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    return online_plan_classes((string)$g['requester']['memberId'], empty($p['apply']));
}

/**
 * After a class (webcron, with the reminders): each occurrence that ended in the last day is followed up once —
 *   · no recording yet: the instructor is asked for it (it reaches the members who missed it when added);
 *   · a member who has now missed `missedFollowUp` classes in a row (and is not paused): their family is told
 *     kindly, and their mentor is nudged, so a child drifting away is noticed in week two, not month two.
 */
function online_class_followup_tick(?int $now = null): array {
    $now = $now ?? time(); $L = online_live_settings(); $done = 0; $told = 0;
    foreach (online_classes_active() as $c) {
        $cid = (string)$c['classId'];
        foreach (online_class_occurrences($c, $now - 86400, $now) as $o) {
            if ($o['end'] > $now) continue;
            $s = db_row('SELECT * FROM online_class_sessions WHERE classId = ? AND sessionDate = ?', [$cid, $o['date']]);
            if ($s && (!empty($s['cancelled']) || (string)($s['followedUpAt'] ?? '') !== '')) continue;
            if ($s) { if (db_exec("UPDATE online_class_sessions SET followedUpAt = ? WHERE classId = ? AND sessionDate = ? AND followedUpAt = ''", [now_iso(), $cid, $o['date']]) < 1) continue; }
            else { try { db_insert('online_class_sessions', ['classId' => $cid, 'sessionDate' => $o['date'], 'followedUpAt' => now_iso(), 'updatedAt' => now_iso()]); } catch (Throwable $e) { continue; } }
            $done++;
            if (trim((string)($s['recordingUrl'] ?? '')) === '' && (string)$c['instructorId'] !== '' && function_exists('push_notification')) {
                $v = db_row('SELECT memberId FROM volunteers WHERE volunteerId = ? LIMIT 1', [(string)$c['instructorId']]);
                if ($v && (string)$v['memberId'] !== '') { try { push_notification((string)$v['memberId'], ['kind' => 'online', 'title' => 'Add the recording of “' . (string)$c['title'] . '”',
                    'body' => 'Paste the link in your portal under Live classes. The members who missed it are told when it is there.', 'linkPage' => 'online']); } catch (Throwable $e) {} }
            }
            $n = $L['missedFollowUp']; if ($n <= 0) continue;
            $recent = array_slice(online_class_occurrences($c, $now - ($n + 2) * 7 * 86400, $now), -$n);
            if (count($recent) < $n) continue;
            $dates = array_map(static fn($x) => $x['date'], $recent);
            $in = implode(',', array_fill(0, count($dates), '?'));
            $came = []; foreach (db_all("SELECT DISTINCT memberId FROM online_class_joins WHERE classId = ? AND sessionDate IN ($in)", array_merge([$cid], $dates)) as $r) $came[(string)$r['memberId']] = true;
            foreach (online_class_audience($c) as $m) {
                $mid = (string)$m['memberId'];
                if (isset($came[$mid]) || online_access_state($m, $now)['state'] === 'paused') continue;
                $first = trim(explode(' ', (string)$m['fullName'])[0] ?? '') ?: 'Your child';
                $r = dues_notice_send($m, 'online_class', 'missed:' . $cid . ':' . $o['date'], ['title' => 'We missed ' . $first . ' at “' . (string)$c['title'] . '”',
                    'text' => $first . ' has missed the last ' . $n . ' live classes of “' . (string)$c['title'] . '”. Is everything all right? The recordings are in their portal, and their mentor will check in.',
                    'member' => ['title' => 'We missed you in class', 'text' => 'You have missed the last ' . $n . ' “' . (string)$c['title'] . '” classes. Catch up with the recordings, and see you on ' . (string)$c['day'] . '!']]);
                if (!empty($r['sent'])) $told++;
                $mt = db_row("SELECT t.memberId FROM mentor_assignments a JOIN mentors t ON t.mentorId = a.mentorId WHERE a.memberId = ? AND a.status = 'active' LIMIT 1", [$mid]);
                if ($mt && (string)$mt['memberId'] !== '' && function_exists('push_notification') && !empty($r['sent'])) {
                    try { push_notification((string)$mt['memberId'], ['kind' => 'mentor', 'title' => (string)$m['fullName'] . ' has missed ' . $n . ' live classes',
                        'body' => '“' . (string)$c['title'] . '”. A quick check-in this week?', 'linkPage' => 'mentees']); } catch (Throwable $e) {}
                }
            }
        }
    }
    return ['followed' => $done, 'told' => $told];
}

/**
 * member.online.instructor.classes — an instructor's own live classes: the next date, who it is for, where the
 * group is in the course, and the last occurrences to add a recording to (admin.online.class.session).
 */
function member_online_instructor_classes(array $p): array {
    $mid = (string)($p['requesterId'] ?? $p['memberId'] ?? '');
    $v = $mid !== '' ? db_row("SELECT volunteerId FROM volunteers WHERE memberId = ? AND role = 'instructor' AND status = 'active' LIMIT 1", [$mid]) : null;
    if (!$v) return ['ok' => false, 'error' => 'not_instructor'];
    $now = time(); $out = [];
    foreach (online_classes_active() as $c) {
        if ((string)$c['instructorId'] !== (string)$v['volunteerId']) continue;
        $next = online_class_occurrences($c, $now, $now + 14 * 86400)[0] ?? null;
        $past = array_slice(online_class_occurrences($c, $now - 28 * 86400, $now), -4);
        $sess = online_class_session_rows([(string)$c['classId']], $past ? $past[0]['date'] : online_lagos_today());
        $out[] = online_class_public($c) + ['url' => (string)$c['url'], 'members' => count(online_class_audience($c)), 'lesson' => online_class_lesson($c),
            'next' => $next ? ['date' => $next['date'], 'start' => gmdate('Y-m-d\TH:i:s\Z', $next['start']), 'lagos' => online_lagos($next['start'])->format('l j F, g:ia')] : null,
            'past' => array_map(static fn($o) => ['date' => $o['date'], 'recording' => (string)($sess[(string)$c['classId'] . '|' . $o['date']]['recordingUrl'] ?? ''),
                'came' => (int)(db_row('SELECT COUNT(*) n FROM online_class_joins WHERE classId = ? AND sessionDate = ?', [(string)$c['classId'], $o['date']])['n'] ?? 0)], array_reverse(array_filter($past, static fn($o) => $o['end'] <= $now)))];
    }
    return ['ok' => true, 'classes' => $out];
}
