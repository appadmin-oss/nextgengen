<?php
/* ═══════════════════════════════════════════════════════════════════════════
   DUES AND PAYMENT NOTICES — what a family is told about money, and when

   Before this, the only money message a family ever got was an arrears email,
   to the one address on the child's record, once dues were already late — and
   only if a coordinator had switched reminders on. Nothing told a parent what
   was COMING, nothing landed in the family app, a guardian with an app account
   but no email on the child's record was skipped as "no email", and a parent
   who said "I've paid" heard nothing until the desk decided.

   Now there is one sender, `dues_notice_send()`, and five things it says:

     upcoming       a charge falls due in `noticeDaysBefore` days (default 7):
                    the month's dues on the 1st, a membership renewal on the
                    anniversary of joining. One message per family per due
                    date, naming everything falling due together. A family
                    already paid ahead past it is not told.
     arrears        the balance reminder (fees.php fees_reminder_send), now on
                    every channel and to every linked guardian.
     claim_ack      a parent said they paid: "we have it, the desk checks it".
     claim_decided  the desk confirmed or declined it.
     claim_staff    payment notes waiting past `claimStaffHours`: one nudge a
                    day to the people holding `fees`, with the count and the
                    oldest — the parent is waiting on somebody.

   Channels, from the fees settings: the family app's inbox (guardian_notices,
   to every guardian linked to the child), email (each guardian's address and
   the parent address on the record), Telegram (each phone that has connected
   the programme's bot — free), and SMS (paid, off by default; sms_send tries
   Telegram first, so a text is only bought when Telegram could not reach them).

   Every notice is ONE row in dues_notices (migration 216), claimed before it
   is sent, unique per member, kind and refKey: the cron runs every 15 minutes
   and nothing is ever said twice. The row keeps what actually went, so "the
   family says they were never told" has an answer in Money → Reminders.
   ═══════════════════════════════════════════════════════════════════════════ */

const DUES_NOTICE_KINDS = ['upcoming', 'arrears', 'claim_ack', 'claim_decided', 'claim_staff', 'plan_due', 'plan_late', 'plan_broken', 'plan_ended'];
/** Members looked at per pass for upcoming notices. A pass that fills it does
 *  not mark the day done, so the next tick carries on where it stopped. */
const DUES_UPCOMING_BATCH = 400;
/** Rows the Control Room's preview and history return. */
const DUES_PREVIEW_MAX = 300;
const DUES_HISTORY_MAX = 200;

/** The channels switched on, and whether each can actually deliver here. */
function dues_notice_channels(?array $cfg = null): array {
    $cfg = $cfg ?? fees_settings();
    $tg = function_exists('telegram_on') && telegram_on();
    $sms = function_exists('sms_enabled') && sms_enabled();
    return [
        'app'      => !empty($cfg['noticeApp']),
        'email'    => !empty($cfg['noticeEmail']),
        'telegram' => !empty($cfg['noticeTelegram']) && $tg,
        'sms'      => !empty($cfg['noticeSms']) && $sms,
        'available' => ['telegram' => $tg, 'sms' => $sms],
    ];
}

/** Every way to reach a child's family: the linked guardians' accounts, their emails and phones, and the parent contact on the record. */
function dues_contacts(array $m): array {
    $gids = []; $emails = []; $phones = [];
    $addEmail = static function (string $e) use (&$emails) { $e = strtolower(trim($e)); if ($e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL)) $emails[$e] = true; };
    $addPhone = static function (string $p) use (&$phones) {
        $n = function_exists('sms_normalize') ? sms_normalize($p) : '';
        if ($n === '') { $d = preg_replace('/\D+/', '', $p); $n = strlen((string)$d) >= 10 ? '+' . ltrim((string)$d, '+') : ''; }
        if ($n !== '') $phones[$n] = true;
    };
    foreach (db_all("SELECT g.guardianId, g.email, g.phone FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId
                     WHERE w.memberId = ? AND w.status = 'active' AND COALESCE(g.status, 'active') = 'active'", [(string)$m['memberId']]) as $g) {
        $gids[(string)$g['guardianId']] = true;
        $addEmail((string)$g['email']); $addPhone((string)($g['phone'] ?? ''));
    }
    $addEmail((string)($m['parentEmail'] ?? '')); $addPhone((string)($m['parentPhone'] ?? ''));
    return ['guardianIds' => array_keys($gids), 'emails' => array_keys($emails), 'phones' => array_keys($phones)];
}

/**
 * Tell one child's family one thing, once. `$msg`: title, text (plain, short —
 * the app, Telegram and SMS read it), html (the email body), subject (email),
 * amount, dueOn, member (also push it to the member's own portal).
 * Returns ['sent' => bool, 'already' => bool, 'channels' => [...], 'reached' => n].
 */
function dues_notice_send(array $m, string $kind, string $refKey, array $msg, ?array $cfg = null): array {
    $cfg = $cfg ?? fees_settings();
    $mid = (string)$m['memberId'];
    if (!in_array($kind, DUES_NOTICE_KINDS, true) || $refKey === '') return ['sent' => false, 'error' => 'bad_notice'];
    // Claimed first: a second tick (or a second web request) running alongside finds the row and stops.
    try {
        db_insert('dues_notices', ['memberId' => $mid, 'kind' => $kind, 'refKey' => mb_substr($refKey, 0, 120), 'title' => mb_substr((string)($msg['title'] ?? ''), 0, 200),
            'amount' => (int)($msg['amount'] ?? 0), 'dueOn' => (string)($msg['dueOn'] ?? ''), 'channelsJson' => '{}', 'reached' => 0, 'status' => 'sending', 'createdAt' => now_iso()]);
    } catch (Throwable $e) {
        return ['sent' => false, 'already' => true];
    }
    $ch = dues_notice_channels($cfg);
    $ct = dues_contacts($m);
    $went = ['app' => 0, 'email' => 0, 'telegram' => 0, 'sms' => 0, 'member' => 0];
    $title = (string)($msg['title'] ?? 'Your NGG account');
    $text = (string)($msg['text'] ?? '');
    if ($ch['app'] && function_exists('family_notice_add')) {
        foreach ($ct['guardianIds'] as $gid) {
            if (!family_notice_add($gid, 'dues-' . $kind, $kind . ':' . $refKey . ':' . $mid, $title, $text, 'NGG')) continue;
            $went['app']++;
            // Which child it is about (the family inbox links it to that ward); money owed files with the alerts, beside fines.
            db_exec('UPDATE guardian_notices SET memberId = ?, cat = ? WHERE guardianId = ? AND kind = ? AND refId = ?',
                [$mid, in_array($kind, ['arrears', 'plan_late', 'plan_broken'], true) ? 'alert' : 'centre', $gid, 'dues-' . $kind, $kind . ':' . $refKey . ':' . $mid]);
        }
    }
    /* The member sees it in their own portal too — in words for them (`member` => ['title', 'text']),
       not the note written to their parent: the child is told, never chased. */
    if (!empty($msg['member']) && function_exists('push_notification')) {
        $mt = is_array($msg['member']) ? (string)($msg['member']['title'] ?? $title) : $title;
        $mx = is_array($msg['member']) ? (string)($msg['member']['text'] ?? $text) : $text;
        try { push_notification($mid, ['kind' => 'money', 'title' => mb_substr($mt, 0, 160), 'body' => mb_substr($mx, 0, 600), 'linkPage' => 'money']); $went['member'] = 1; } catch (Throwable $e) {}
    }
    if ($ch['email'] && $ct['emails'] && function_exists('send_mail') && function_exists('email_template')) {
        $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
        $html = email_template(['eyebrow' => 'Next Generation Genius', 'title' => $title, 'intro' => (string)($msg['intro'] ?? ''),
            'bodyHtml' => (string)($msg['html'] ?? ('<p style="margin:0 0 10px">' . nl2br(esc_html($text)) . '</p>')),
            'ctaLabel' => 'Open the family account →', 'ctaUrl' => $origin . '/family',
            'footNote' => (string)($msg['footNote'] ?? 'You get this because you are a guardian of an NGG member. Tell your centre coordinator if you would rather not receive these.')]);
        foreach ($ct['emails'] as $to) if (@send_mail($to, (string)($msg['subject'] ?? $title), $html)) $went['email']++;
    }
    // Telegram: free, to every connected phone. SMS: paid, one text per family, only where Telegram did not reach them.
    $short = $title . ($text !== '' ? ' — ' . $text : '');
    if ($ch['telegram'] && function_exists('telegram_send_to_phone')) {
        foreach ($ct['phones'] as $ph) if (!empty(telegram_send_to_phone($ph, $short)['ok'])) $went['telegram']++;
    }
    if ($ch['sms'] && !$went['telegram'] && $ct['phones'] && function_exists('sms_send')) {
        if (!empty(sms_send($ct['phones'][0], mb_substr($short, 0, 300))['ok'])) $went['sms'] = 1;
    }
    $reached = $went['app'] + $went['email'] + $went['telegram'] + $went['sms'];
    db_exec('UPDATE dues_notices SET channelsJson = ?, reached = ?, status = ? WHERE memberId = ? AND kind = ? AND refKey = ?',
        [json_encode($went), $reached, $reached > 0 ? 'sent' : 'unreachable', $mid, $kind, mb_substr($refKey, 0, 120)]);
    return ['sent' => $reached > 0, 'already' => false, 'channels' => $went, 'reached' => $reached];
}

/* ── Upcoming charges ────────────────────────────────────────────────────── */

/** A coming charge in the family's words — the same words the family app's Fees screen uses. */
function dues_charge_label(array $c): string {
    return $c['kind'] === 'dues' ? 'Commitment fee · ' . gmdate('F Y', strtotime($c['key'] . '-01T12:00:00Z'))
        : 'Membership renewal (year ' . substr((string)$c['key'], 1) . ')';
}

/**
 * The charges still to come within $days, after what the family has paid
 * ahead — spent on the charges in the order they fall. One answer for the
 * notices and the family app's "Next charge", so a family paid to March is
 * never shown a December charge, and a renewal is never left out.
 */
function dues_coming_charges(array $m, array $cfg, string $today, int $days, int $months = 2): array {
    if (!function_exists('membership_upcoming_charges')) return [];
    $until = gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') + $days * 86400);
    $coming = array_values(array_filter(membership_upcoming_charges($m, $cfg, $months, $today),
        static fn($c) => (string)$c['due'] > $today && (string)$c['due'] <= $until));
    if (!$coming) return [];
    $bal = fees_balance($m, $cfg, $today);
    $credit = max(0, (int)$bal['realCredited'] - (int)$bal['realCharged']);
    $out = [];
    foreach ($coming as $c) {
        if ($credit >= (int)$c['amount']) { $credit -= (int)$c['amount']; continue; }
        $out[] = $c + ['label' => dues_charge_label($c)];
    }
    return $out;
}

/** What falls due for one member within the notice window, after any credit they have paid ahead. */
function dues_upcoming_for(array $m, array $cfg, string $today): array {
    return dues_coming_charges($m, $cfg, $today, max(FEES_NOTICE_DAYS_MIN, min(FEES_NOTICE_DAYS_MAX, (int)$cfg['noticeDaysBefore'])));
}

/** The words for an upcoming notice: what, how much, when, and how to pay. */
function dues_upcoming_message(array $m, array $items, array $cfg): array {
    $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
    $money = static fn(int $n) => fees_money_text($n, $cfg);
    $due = (string)$items[0]['due'];
    $when = gmdate('l j F', strtotime($due . 'T12:00:00Z'));
    $total = array_sum(array_map(static fn($i) => (int)$i['amount'], $items));
    $what = implode(' and ', array_map(static fn($i) => $i['label'] . ' (' . $money((int)$i['amount']) . ')', $items));
    $pay = function_exists('membership_pay_settings') ? membership_pay_settings() : [];
    $bank = !empty($pay['accountNumber']) ? ' You can pay by transfer to ' . $pay['accountName'] . ', ' . $pay['bankName'] . ' ' . $pay['accountNumber'] . ', then tell us in the family app.' : ' You can pay from the family app, or tell us there once you have paid.';
    $text = $what . ' for ' . $first . ' falls due on ' . $when . '.' . $bank;
    $rows = implode('', array_map(static fn($i) => '<tr><td style="padding:2px 12px 2px 0">' . esc_html($i['label']) . '</td><td style="padding:2px 0">' . $money((int)$i['amount']) . '</td></tr>', $items));
    $html = '<p style="margin:0 0 10px">Coming up for ' . esc_html($first) . ' on <b>' . esc_html($when) . '</b>:</p>'
          . '<table style="margin:0 0 10px;font-size:14px">' . $rows . '</table>'
          . (count($items) > 1 ? '<p style="margin:0 0 10px">Together: <b>' . $money($total) . '</b>.</p>' : '')
          . '<p style="margin:0 0 10px">' . esc_html(trim($bank)) . '</p>'
          . '<p style="margin:0 0 10px">If now is a difficult time, reply to this message or speak to your centre coordinator — we would rather hear from you than not.</p>';
    return ['title' => $money($total) . ' due ' . gmdate('j M', strtotime($due . 'T12:00:00Z')) . ' for ' . $first, 'intro' => 'A note before it falls due.',
        'subject' => $first . '\'s NGG dues — ' . $money($total) . ' due ' . gmdate('j F', strtotime($due . 'T12:00:00Z')),
        'text' => $text, 'html' => $html, 'amount' => $total, 'dueOn' => $due,
        'member' => ['title' => $money($total) . ' due ' . gmdate('j M', strtotime($due . 'T12:00:00Z')),
            'text' => $what . ' falls due on ' . $when . '. Your parent or guardian has been told.']];
}

/** The families to tell today, with why each of the rest is not on the list. */
function dues_upcoming_candidates(string $today, ?array $cfg = null, int $limit = DUES_UPCOMING_BATCH, ?array $centres = null): array {
    $cfg = $cfg ?? fees_settings();
    $out = ['due' => [], 'skipped' => ['optedOut' => 0, 'paidAhead' => 0, 'nothingDue' => 0, 'alreadyTold' => 0, 'noContact' => 0], 'scanned' => 0, 'more' => false];
    if (empty($cfg['enabled']) || empty($cfg['noticeEnabled'])) { $out['off'] = true; return $out; }
    if ((int)$cfg['monthlyDues'] <= 0 && (int)$cfg['membershipFee'] <= 0) return $out;
    $where = "status = 'active' AND COALESCE(NULLIF(type,''),'NGG') = 'NGG'"; $args = [];
    if ($centres !== null) { if (!$centres) return $out; $where .= ' AND centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')'; $args = $centres; }
    foreach (db_all("SELECT * FROM members WHERE $where ORDER BY id LIMIT " . (FEES_SCAN_MAX), $args) as $m) {
        if (count($out['due']) >= $limit) { $out['more'] = true; break; }
        $out['scanned']++;
        if ((int)($m['duesRemindOff'] ?? 0) === 1) { $out['skipped']['optedOut']++; continue; }
        $items = dues_upcoming_for($m, $cfg, $today);
        if (!$items) {
            // Was something due in the window, but covered by money already paid?
            $any = function_exists('membership_upcoming_charges') ? array_filter(membership_upcoming_charges($m, $cfg, 2, $today), static fn($c) => (string)$c['due'] > $today
                && (string)$c['due'] <= gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') + (int)$cfg['noticeDaysBefore'] * 86400)) : [];
            $out['skipped'][$any ? 'paidAhead' : 'nothingDue']++;
            continue;
        }
        // One notice per due date: the charges falling on the same day go together.
        $byDay = [];
        foreach ($items as $i) $byDay[(string)$i['due']][] = $i;
        foreach ($byDay as $day => $its) {
            $ref = $day . ':' . implode('+', array_map(static fn($i) => $i['kind'] . '-' . $i['key'], $its));
            if (db_row("SELECT 1 FROM dues_notices WHERE memberId = ? AND kind = 'upcoming' AND refKey = ?", [(string)$m['memberId'], $ref])) { $out['skipped']['alreadyTold']++; continue; }
            $ct = dues_contacts($m);
            if (!$ct['guardianIds'] && !$ct['emails'] && !$ct['phones']) { $out['skipped']['noContact']++; continue; }
            $out['due'][] = ['member' => $m, 'items' => $its, 'refKey' => $ref, 'dueOn' => $day, 'contacts' => $ct];
        }
    }
    return $out;
}

/* ── Payment notes ───────────────────────────────────────────────────────── */

/** A parent said they paid: tell the family it arrived and what happens next. Called from member_request_create(). */
function dues_claim_ack(array $req): void {
    try {
        $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$req['memberId']]);
        if (!$m) return;
        $cfg = fees_settings();
        $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
        $amt = fees_money_text((int)$req['amount'], $cfg);
        $hours = max(FEES_CLAIM_HOURS_MIN, (int)$cfg['claimStaffHours']);
        $days = (int)ceil($hours / 24);
        $text = 'We have your note of a ' . $amt . ' payment for ' . $first . ((string)$req['reference'] !== '' ? ' (ref ' . $req['reference'] . ')' : '')
              . '. The fees desk checks it against the bank statement, usually within ' . $days . ' day' . ($days === 1 ? '' : 's') . ', and you will hear when it is confirmed.';
        dues_notice_send($m, 'claim_ack', (string)$req['requestId'], ['title' => 'Payment note received: ' . $amt, 'intro' => 'Thank you — here is what happens next.',
            'subject' => 'We have your payment note for ' . $first . ' — ' . $amt, 'text' => $text, 'amount' => (int)$req['amount']], $cfg);
    } catch (Throwable $e) {}
}

/** The desk confirmed or declined a payment note: every guardian sees the answer in the family app. Called from admin_request_decide(). */
function dues_claim_decided(array $req, bool $approved, int $amount, string $reason): void {
    try {
        $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$req['memberId']]);
        if (!$m) return;
        $cfg = fees_settings();
        $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'your child';
        $amt = fees_money_text($amount > 0 ? $amount : (int)$req['amount'], $cfg);
        $bal = fees_balance($m, $cfg);
        // Nothing owed today still has a next date: name it, so "all paid" is not read as "paid for the year".
        $next = '';
        if ((int)$bal['payable'] <= 0) {
            $up = dues_upcoming_for($m, $cfg, gmdate('Y-m-d'));
            if ($up) $next = ' Next: ' . fees_money_text(array_sum(array_map(static fn($i) => (int)$i['amount'], array_filter($up, static fn($i) => $i['due'] === $up[0]['due']))), $cfg)
                . ' due ' . gmdate('j F', strtotime($up[0]['due'] . 'T12:00:00Z')) . '.';
        }
        $text = $approved
            ? $amt . ' for ' . $first . ' is confirmed and on the account. ' . ((int)$bal['payable'] > 0 ? 'Still to pay: ' . fees_money_text((int)$bal['payable'], $cfg) . '.' : 'Nothing more is owed today.' . $next)
            : 'We could not confirm the ' . $amt . ' payment for ' . $first . '. ' . ($reason !== '' ? 'The desk says: ' . $reason : '') . ' Reply in the family app if you have a receipt or a reference.';
        dues_notice_send($m, 'claim_decided', (string)$req['requestId'], ['title' => $approved ? 'Payment confirmed: ' . $amt : 'Payment not confirmed: ' . $amt,
            'subject' => ($approved ? 'Payment confirmed for ' : 'Please check the payment for ') . $first . ' — ' . $amt, 'text' => trim($text), 'amount' => $amount], $cfg);
    } catch (Throwable $e) {}
}

/** Payment notes waiting past the hours set: once a day, the fees desk is told how many and how old the oldest is. */
function dues_claims_staff_nudge(string $today, ?array $cfg = null): int {
    $cfg = $cfg ?? fees_settings();
    $hours = max(FEES_CLAIM_HOURS_MIN, min(FEES_CLAIM_HOURS_MAX, (int)$cfg['claimStaffHours']));
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - $hours * 3600);
    $old = db_all("SELECT r.requestId, r.createdAt, r.amount, m.centre FROM member_requests r JOIN members m ON m.memberId = r.memberId
                   WHERE r.kind = 'payment' AND r.status = 'open' AND r.createdAt <= ? ORDER BY r.createdAt", [$cut]);
    if (!$old || !function_exists('staff_with_cap')) return 0;
    $told = 0;
    foreach (staff_with_cap('fees') as $s) {
        $names = admin_centre_names_in_scope($s);
        $mine = $names === null ? $old : array_values(array_filter($old, static fn($r) => in_array((string)$r['centre'], $names, true)));
        if (!$mine) continue;
        $n = count($mine);
        $age = (int)floor((time() - strtotime((string)$mine[0]['createdAt'])) / 86400);
        // Claimed first, once a day per person: the same unique key as every other notice.
        try {
            db_insert('dues_notices', ['memberId' => (string)$s['memberId'], 'kind' => 'claim_staff', 'refKey' => $today, 'title' => $n . ' payment notes waiting',
                'amount' => array_sum(array_map(static fn($r) => (int)$r['amount'], $mine)), 'dueOn' => '', 'channelsJson' => '{}', 'reached' => 0, 'status' => 'sending', 'createdAt' => now_iso()]);
        } catch (Throwable $e) { continue; }
        // To the staff member themselves, not a family: their own notifications and email.
        notify_people([$s], ['kind' => 'approval', 'eyebrow' => 'NGG Control Room · Money', 'title' => $n . ' payment note' . ($n === 1 ? '' : 's') . ' waiting to be checked',
            'intro' => 'Parents said they paid, and are waiting to hear.', 'body' => 'The oldest has waited ' . $age . ' day' . ($age === 1 ? '' : 's') . '. Each one is in Inbox → Requests: confirm it against the bank statement, or decline it with the reason.',
            'linkPage' => 'admin', 'ctaPath' => '/control/inbox/requests', 'ctaLabel' => 'Check them →']);
        db_exec("UPDATE dues_notices SET channelsJson = ?, reached = 1, status = 'sent' WHERE memberId = ? AND kind = 'claim_staff' AND refKey = ?",
            [json_encode(['staff' => 1]), (string)$s['memberId'], $today]);
        $told++;
    }
    return $told;
}

/* ── The cron entry point ───────────────────────────────────────────────── */

/**
 * Called every 15 minutes from web_cron_reminders(). The upcoming pass is a
 * scan of the roster, so it runs once a day — until it finishes: a pass that
 * fills its batch leaves the day open and the next tick carries on. Nothing is
 * sent twice either way (dues_notices is unique per member, kind and key).
 */
function dues_notices_run(?string $today = null, bool $force = false): array {
    $cfg = fees_settings();
    $today = $today ?: (function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d'));
    $out = ['upcoming' => 0, 'unreachable' => 0, 'staff' => 0, 'skipped' => null];
    if (empty($cfg['enabled'])) return $out + ['off' => true];
    $state = setting_get('dues_notices_state');
    $state = is_array($state) ? $state : [];
    if ($force || (string)($state['doneOn'] ?? '') !== $today) {
        $c = dues_upcoming_candidates($today, $cfg);
        foreach ($c['due'] as $d) {
            $r = dues_notice_send($d['member'], 'upcoming', $d['refKey'], dues_upcoming_message($d['member'], $d['items'], $cfg), $cfg);
            if (!empty($r['sent'])) $out['upcoming']++; elseif (empty($r['already'])) $out['unreachable']++;
        }
        $out['skipped'] = $c['skipped'];
        if (empty($c['more'])) setting_set('dues_notices_state', ['doneOn' => $today, 'at' => now_iso(), 'told' => $out['upcoming']], 'cron');
    }
    // Instalment plans: reminders before each instalment, when one is late, and when a plan lapses (payment-plans.php).
    if (function_exists('plan_reminders_run')) $out['plans'] = plan_reminders_run($today);
    $out['staff'] = dues_claims_staff_nudge($today, $cfg);
    if ($out['upcoming'] || $out['staff']) audit('dues.notices.run', 'cron', 'fees', $out, '');
    return $out;
}

/* ── Control Room: Money → Reminders ────────────────────────────────────── */

/**
 * admin.fees.notices — what is coming (who will be told, on which day, by
 * which channels), what has been sent, and the payment notes waiting. Read by
 * `fees`, scoped to the requester's centres like every other money read.
 */
function admin_fees_notices(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    $names = admin_centre_names_in_scope($g['requester']);
    $today = trim((string)($p['today'] ?? '')) ?: (function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d'));
    $ch = dues_notice_channels($cfg);
    /* Coming up: who will be told in the next fortnight, on the day they will be told. */
    $coming = [];
    if (!empty($cfg['enabled']) && !empty($cfg['noticeEnabled'])) {
        $look = $cfg; $look['noticeDaysBefore'] = FEES_NOTICE_DAYS_MAX;   // see as far ahead as the setting allows
        $where = "status = 'active' AND COALESCE(NULLIF(type,''),'NGG') = 'NGG' AND COALESCE(duesRemindOff, 0) = 0"; $args = [];
        if ($names !== null) { $where .= $names ? ' AND centre IN (' . implode(',', array_fill(0, count($names), '?')) . ')' : ' AND 0'; $args = $names ?: []; }
        // What was already said, read once: a due date is at most FEES_NOTICE_DAYS_MAX + 14 days out, so 60 days back covers every notice that could match.
        $told = [];
        foreach (db_all("SELECT memberId, refKey, createdAt FROM dues_notices WHERE kind = 'upcoming' AND dueOn >= ?", [gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') - 60 * 86400)]) as $t)
            $told[$t['memberId'] . '|' . $t['refKey']] = (string)$t['createdAt'];
        foreach (db_all("SELECT * FROM members WHERE $where ORDER BY fullName LIMIT " . FEES_SCAN_MAX, $args) as $m) {
            if (count($coming) >= DUES_PREVIEW_MAX) break;
            $items = dues_upcoming_for($m, $look, $today);
            if (!$items) continue;
            $byDay = [];
            foreach ($items as $i) $byDay[(string)$i['due']][] = $i;
            $ct = null;
            foreach ($byDay as $day => $its) {
                $tellOn = gmdate('Y-m-d', strtotime($day . 'T12:00:00Z') - (int)$cfg['noticeDaysBefore'] * 86400);
                if ($tellOn > gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') + 14 * 86400)) continue;
                $ref = $day . ':' . implode('+', array_map(static fn($i) => $i['kind'] . '-' . $i['key'], $its));
                $ct = $ct ?? dues_contacts($m);
                $coming[] = ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'centre' => (string)$m['centre'],
                    'what' => implode(' + ', array_map(static fn($i) => $i['label'], $its)), 'amount' => array_sum(array_map(static fn($i) => (int)$i['amount'], $its)),
                    'dueOn' => $day, 'tellOn' => max($tellOn, $today), 'told' => $told[$m['memberId'] . '|' . $ref] ?? '',
                    'reach' => ['app' => $ch['app'] ? count($ct['guardianIds']) : 0, 'email' => $ch['email'] ? count($ct['emails']) : 0, 'phones' => count($ct['phones'])]];
            }
        }
        usort($coming, static fn($a, $b) => strcmp($a['tellOn'], $b['tellOn']) ?: strcmp($a['fullName'], $b['fullName']));
    }
    /* Sent: the latest notices, newest first. */
    $hw = '1'; $ha = [];
    if ($names !== null) { $hw = $names ? 'm.centre IN (' . implode(',', array_fill(0, count($names), '?')) . ')' : '0'; $ha = $names ?: []; }
    $hist = array_map(static fn($r) => ['kind' => (string)$r['kind'], 'memberId' => (string)$r['memberId'], 'fullName' => (string)($r['fullName'] ?? ''),
        'title' => (string)$r['title'], 'amount' => (int)$r['amount'], 'dueOn' => (string)$r['dueOn'], 'status' => (string)$r['status'],
        'channels' => json_decode((string)$r['channelsJson'], true) ?: [], 'at' => (string)$r['createdAt']],
        db_all("SELECT n.*, m.fullName FROM dues_notices n JOIN members m ON m.memberId = n.memberId WHERE n.kind <> 'claim_staff' AND $hw ORDER BY n.id DESC LIMIT " . DUES_HISTORY_MAX, $ha));
    $claims = db_all("SELECT r.createdAt FROM member_requests r JOIN members m ON m.memberId = r.memberId WHERE r.kind = 'payment' AND r.status = 'open' AND $hw ORDER BY r.createdAt", $ha);
    $state = setting_get('dues_notices_state');
    return ['ok' => true, 'today' => $today,
        'settings' => ['enabled' => !empty($cfg['enabled']), 'noticeEnabled' => !empty($cfg['noticeEnabled']), 'daysBefore' => (int)$cfg['noticeDaysBefore'],
            'channels' => ['app' => $ch['app'], 'email' => $ch['email'], 'telegram' => $ch['telegram'], 'sms' => $ch['sms']], 'available' => $ch['available'],
            'claimStaffHours' => (int)$cfg['claimStaffHours']],
        'coming' => $coming, 'history' => $hist,
        'claims' => ['open' => count($claims), 'oldest' => $claims ? (string)$claims[0]['createdAt'] : ''],
        'lastRun' => is_array($state) ? $state : null];
}

/** admin.fees.notices.run — send today's upcoming notices now rather than at the next tick. Bounded like the cron. */
function admin_fees_notices_run(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    if (empty($cfg['enabled']) || empty($cfg['noticeEnabled'])) return ['ok' => false, 'error' => 'notices_disabled', 'detail' => 'Notices before dues fall due are switched off under Amounts.'];
    // Only the families of the centres in the requester's scope: a scoped desk sends for its own centres.
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    $c = dues_upcoming_candidates($today, $cfg, DUES_UPCOMING_BATCH, admin_centre_names_in_scope($g['requester']));
    $sent = 0; $unreachable = 0;
    foreach ($c['due'] as $d) {
        $r = dues_notice_send($d['member'], 'upcoming', $d['refKey'], dues_upcoming_message($d['member'], $d['items'], $cfg), $cfg);
        if (!empty($r['sent'])) $sent++; elseif (empty($r['already'])) $unreachable++;
    }
    $out = ['upcoming' => $sent, 'unreachable' => $unreachable, 'skipped' => $c['skipped'], 'more' => !empty($c['more'])];
    audit('dues.notices.run', (string)$g['requester']['memberId'], 'fees', $out, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'result' => $out];
}
