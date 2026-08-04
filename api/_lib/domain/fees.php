<?php
declare(strict_types=1);

/**
 * Member obligations — membership fee, monthly dues, and the training fee.
 *
 * ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────────
 * A LEDGER, not a payment processor. It records what a member owes and what has
 * been received; an admin marks payments as they arrive by cash or transfer.
 * Nothing here touches a card, a gateway or a webhook, and no code in this file
 * moves money. That is deliberate: the moment this subsystem holds card data it
 * becomes a different piece of software with a different threat model, and the
 * ledger has to exist and be trusted first.
 *
 * ── THE THREE CHARGES ────────────────────────────────────────────────────────
 *   membership   one-off, on joining
 *   dues         monthly, while the member is active
 *   training     per programme session
 *
 * All three amounts are ADMIN-DEFINED. The defaults below are starting points,
 * not policy — ₦75,000 is the training figure the programme uses today and it
 * lives in a setting precisely so it is not this file's opinion.
 *
 * ── THE TRAINING FEE IS NOT REALLY A BILL ────────────────────────────────────
 * This is the part worth reading twice. The training fee is charged, but a
 * member who completes their obligation never pays it: it is written down as
 * they serve, and by the time the MOU is accomplished it has been written down
 * in full. So it functions as an undertaking rather than a debt — visible on the
 * account so nobody is surprised by it, and dissolving as it is earned out.
 *
 * The three-year shape is what drives the write-down: eighteen months of
 * training and eighteen months of service. Service is what discharges the
 * training fee, which is why the write-down tracks tenure rather than payments.
 *
 * A NOTE ON HOW THAT IS SAID OUT LOUD. The microcopy is deliberately quiet —
 * one short line under the figure, no emphasis. Two reasons. It reads as an
 * honest statement of terms rather than a sales pitch; and a family who leaves
 * before the MOU is complete will owe the balance, so a page that shouted
 * "COMPLETELY REFUNDED!" would have promised them something the terms do not.
 *
 * ── WHAT DELIBERATELY DOES NOT HAPPEN ────────────────────────────────────────
 * Nothing compounds. A balance grows because unpaid dues accumulate and because
 * fines are added, and it is capped (see `balanceCap`) so it cannot run away.
 * Interest on a child's account is not implemented and should not be added
 * casually: an unpayable balance drives a family out of the programme, which
 * costs more than the arrears were worth.
 *
 * No financial state gates attendance. Nothing in this file is read by the
 * gate, the scanner or the check-in path, and a member's balance never reaches
 * the public boards — see `fees_member_account()`, which is admin-only, and note
 * that no op here is reachable without `admin_cap_gate`.
 */

/** Whole naira, like the policy fines. A ceiling on every settable amount, so a
 *  slipped keystroke in an admin form cannot post a ₦900,000,000 charge. */
const FEES_AMOUNT_MAX = 10000000;
/** The three-year shape, in months, and the bounds an admin may set it within. */
const FEES_PHASE_MIN = 1;
const FEES_PHASE_MAX = 120;

const FEES_DEFAULTS = [
    'enabled'      => false,
    'currency'     => 'NGN',
    'membershipFee' => 0,
    'monthlyDues'   => 0,
    /* Per programme session. The figure the programme uses today; an admin can
       change it, and changing it does not touch charges already posted. */
    'trainingFee'   => 75000,
    /* Three years, split. Training accrues the fee; service earns it off. */
    'trainingMonths' => 18,
    'serviceMonths'  => 18,
    /* The ceiling on what a single member's account may reach. Reached, it stops
       accruing and says so, rather than growing into a number nobody will ever
       pay. Zero means no ceiling — available, but not the default. */
    'balanceCap'    => 500000,
    /* Reminders. `everyDays` has a floor because "constant" reminders are how a
       programme gets its sender blocked and its guardians to stop reading
       anything it sends. */
    'remindEnabled' => false,
    'remindEveryDays' => 14,
    'remindMinBalance' => 1,
];
const FEES_REMIND_MIN_DAYS = 7;

/** The charge and credit kinds. `direction` is stored, but these decide it, so a
 *  caller cannot post a payment that increases what is owed. */
const FEES_CHARGE_KINDS = ['membership', 'dues', 'training', 'fine', 'adjustment'];
const FEES_CREDIT_KINDS = ['payment', 'writeoff', 'waiver'];

function fees_settings(): array {
    $cfg = setting_get('fees');
    return (is_array($cfg) ? $cfg : []) + FEES_DEFAULTS;
}

function fees_money($v, int $fallback = 0): int {
    if ($v === null || $v === '') return $fallback;
    return max(0, min(FEES_AMOUNT_MAX, (int)$v));
}

function fees_settings_save(array $in, string $by): array {
    $cur = fees_settings();
    $bool = fn(string $k) => array_key_exists($k, $in) ? !empty($in[$k]) : !empty($cur[$k]);
    $phase = fn($v, int $fb) => max(FEES_PHASE_MIN, min(FEES_PHASE_MAX, (int)($v ?? $fb) ?: $fb));
    $clean = [
        'enabled'        => $bool('enabled'),
        'currency'       => 'NGN',
        'membershipFee'  => fees_money($in['membershipFee'] ?? null, (int)$cur['membershipFee']),
        'monthlyDues'    => fees_money($in['monthlyDues'] ?? null, (int)$cur['monthlyDues']),
        'trainingFee'    => fees_money($in['trainingFee'] ?? null, (int)$cur['trainingFee']),
        'trainingMonths' => $phase($in['trainingMonths'] ?? null, (int)$cur['trainingMonths']),
        'serviceMonths'  => $phase($in['serviceMonths'] ?? null, (int)$cur['serviceMonths']),
        'balanceCap'     => fees_money($in['balanceCap'] ?? null, (int)$cur['balanceCap']),
        'remindEnabled'  => $bool('remindEnabled'),
        /* Floored, not just validated. An admin who types 1 gets the floor and is
           told, rather than getting a daily chase that nobody asked to defend. */
        'remindEveryDays' => max(FEES_REMIND_MIN_DAYS, min(365, (int)($in['remindEveryDays'] ?? $cur['remindEveryDays']) ?: (int)$cur['remindEveryDays'])),
        'remindMinBalance' => fees_money($in['remindMinBalance'] ?? null, (int)$cur['remindMinBalance']),
    ];
    setting_set('fees', $clean, $by);
    audit('fees.settings.save', $by, 'fees', [
        'enabled' => $clean['enabled'], 'monthlyDues' => $clean['monthlyDues'],
        'trainingFee' => $clean['trainingFee'], 'membershipFee' => $clean['membershipFee'],
    ], '');
    return $clean;
}

/**
 * Where a member is in the three years.
 *
 * Measured from `joinDate` — falling back to `createdAt`, because a row imported
 * from a spreadsheet may have no join date and treating that as "joined today"
 * would restart somebody's tenure every time the importer ran.
 *
 * Returns `months` elapsed, the phase, and `servedMonths` — the months of the
 * SERVICE half completed, which is what earns the training fee off. Capped at
 * the service length so a member three years past their MOU cannot earn off
 * more than they owed.
 */
function fees_tenure(array $member, ?array $cfg = null, ?string $asOf = null): array {
    $cfg = $cfg ?? fees_settings();
    $start = substr((string)($member['joinDate'] ?? ''), 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) $start = substr((string)($member['createdAt'] ?? ''), 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) {
        return ['start' => '', 'months' => 0, 'phase' => 'unknown', 'trainingMonths' => (int)$cfg['trainingMonths'],
                'serviceMonths' => (int)$cfg['serviceMonths'], 'servedMonths' => 0, 'complete' => false];
    }
    $today = $asOf ?? gmdate('Y-m-d');
    $months = fees_months_between($start, $today);
    $tm = (int)$cfg['trainingMonths']; $sm = (int)$cfg['serviceMonths'];
    $served = max(0, min($sm, $months - $tm));
    return [
        'start' => $start, 'months' => $months,
        'phase' => $months < $tm ? 'training' : ($months < $tm + $sm ? 'service' : 'complete'),
        'trainingMonths' => $tm, 'serviceMonths' => $sm,
        'servedMonths' => $served, 'complete' => $months >= $tm + $sm,
    ];
}

/** Whole months from $a to $b, never negative. Calendar months, not 30-day
 *  blocks — dues are monthly in the sense a family understands. */
function fees_months_between(string $a, string $b): int {
    $x = strtotime($a . ' 00:00:00 UTC'); $y = strtotime($b . ' 00:00:00 UTC');
    if ($x === false || $y === false || $y <= $x) return 0;
    $m = ((int)gmdate('Y', $y) - (int)gmdate('Y', $x)) * 12 + ((int)gmdate('n', $y) - (int)gmdate('n', $x));
    if ((int)gmdate('j', $y) < (int)gmdate('j', $x)) $m--;   // not a full month yet
    return max(0, $m);
}

/** The YYYY-MM keys from a member's start month up to and including `$upto`,
 *  bounded so an ancient or malformed join date cannot generate ten thousand
 *  charges in one accrual run. */
function fees_due_months(string $start, string $upto, int $max = 120): array {
    $out = [];
    $t = strtotime(substr($start, 0, 8) . '01 00:00:00 UTC');
    $end = substr($upto, 0, 7);
    if ($t === false) return $out;
    for ($i = 0; $i < $max; $i++) {
        $k = gmdate('Y-m', $t);
        if ($k > $end) break;
        $out[] = $k;
        $t = strtotime('+1 month', $t);
        if ($t === false) break;
    }
    return $out;
}

/**
 * Post one ledger entry, or return the existing one.
 *
 * Idempotent on (memberId, kind, periodKey) via the unique index, so an accrual
 * run that fires twice — a cron that overlaps, an admin who presses the button
 * again — cannot charge the same month twice. That is the whole reason the index
 * exists, and the reason this function swallows a duplicate rather than throwing:
 * the caller's intent is "make sure this charge exists", and it does.
 */
function fees_post(string $memberId, string $kind, int $amount, array $opts = []): ?array {
    $memberId = trim($memberId);
    if ($memberId === '' || $amount <= 0) return null;
    $isCharge = in_array($kind, FEES_CHARGE_KINDS, true);
    $isCredit = in_array($kind, FEES_CREDIT_KINDS, true);
    if (!$isCharge && !$isCredit) return null;
    $periodKey = (string)($opts['periodKey'] ?? '');
    /* A credit with no period key would collide with the next one under the
       unique index — two payments in the same month are two real events. Give
       each its own key unless the caller pinned one deliberately. */
    if ($periodKey === '') $periodKey = $kind . ':' . bin2hex(random_bytes(6));
    $row = [
        'entryId' => 'FEE-' . strtoupper(bin2hex(random_bytes(6))),
        'memberId' => $memberId, 'kind' => $kind,
        'direction' => $isCharge ? 'charge' : 'credit',
        'amount' => min(FEES_AMOUNT_MAX, $amount),
        'periodKey' => $periodKey,
        'sessionId' => (string)($opts['sessionId'] ?? ''),
        'note' => substr((string)($opts['note'] ?? ''), 0, 240),
        'method' => substr((string)($opts['method'] ?? ''), 0, 32),
        'reference' => substr((string)($opts['reference'] ?? ''), 0, 120),
        'createdAt' => now_iso(), 'createdBy' => (string)($opts['by'] ?? ''),
    ];
    try {
        db_insert('member_ledger', $row);
    } catch (Throwable $e) {
        // Already posted for this period — the desired state, not a failure.
        $have = db_row('SELECT * FROM member_ledger WHERE memberId = ? AND kind = ? AND periodKey = ? LIMIT 1',
            [$memberId, $kind, $periodKey]);
        return $have ?: null;
    }
    return $row;
}

/** Live entries for a member, oldest first. Voided rows are read but flagged —
 *  a corrected mistake stays visible, which is the point of voiding rather than
 *  deleting. */
function fees_entries(string $memberId): array {
    return db_all('SELECT * FROM member_ledger WHERE memberId = ? ORDER BY id', [$memberId]);
}

/**
 * What a member owes, and how it got there.
 *
 * `charged` and `credited` count only live rows. `trainingEarned` is the part of
 * the training fee that service has written down but which has not yet been
 * posted as a write-off — it is shown separately from `credited` so the account
 * distinguishes "we have written this off" from "this is on course to be written
 * off", and a member who leaves early is not told an unearned amount was already
 * forgiven.
 */
function fees_balance(array $member, ?array $cfg = null, ?string $asOf = null): array {
    $cfg = $cfg ?? fees_settings();
    $memberId = (string)($member['memberId'] ?? '');
    $charged = 0; $credited = 0; $byKind = [];
    $trainingCharged = 0; $trainingWritten = 0;
    foreach (fees_entries($memberId) as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $amt = (int)$e['amount']; $kind = (string)$e['kind'];
        $byKind[$kind] = ($byKind[$kind] ?? 0) + $amt;
        if ((string)$e['direction'] === 'charge') {
            $charged += $amt;
            if ($kind === 'training') $trainingCharged += $amt;
        } else {
            $credited += $amt;
            if ($kind === 'writeoff') $trainingWritten += $amt;
        }
    }
    $ten = fees_tenure($member, $cfg, $asOf);
    /* "Deducts as they come": the share of the training fee that service has
       earned off so far. Straight-line across the service half — the simplest
       rule that is also explainable to a family, which matters more here than
       precision. A completed MOU earns the whole of it. */
    $mou = trim((string)($member['mouAt'] ?? '')) !== '';
    $earnedPct = $mou ? 1.0
        : ((int)$ten['serviceMonths'] > 0 ? min(1.0, $ten['servedMonths'] / (int)$ten['serviceMonths']) : 0.0);
    $earned = (int)floor(max(0, $trainingCharged - $trainingWritten) * $earnedPct);
    $outstanding = max(0, $charged - $credited);
    $cap = (int)$cfg['balanceCap'];
    return [
        'charged' => $charged, 'credited' => $credited,
        'outstanding' => $outstanding,
        /* What a family is actually being asked for: what is outstanding, less
           the training the member has already earned off but which has not been
           posted yet. Reported alongside `outstanding` rather than instead of it,
           so nobody has to guess which of the two a figure on a screen is. */
        'payable' => max(0, $outstanding - $earned),
        'trainingCharged' => $trainingCharged, 'trainingWrittenOff' => $trainingWritten,
        'trainingEarned' => $earned,
        'byKind' => $byKind,
        'cap' => $cap, 'atCap' => $cap > 0 && $outstanding >= $cap,
        'tenure' => $ten, 'mouAt' => (string)($member['mouAt'] ?? ''),
    ];
}

/**
 * Bring a member's charges up to date.
 *
 * Idempotent by construction (see `fees_post`), so it is safe to run from a
 * cron, from an admin button, and from both at once.
 *
 * The cap is enforced HERE rather than only being displayed: once a member is at
 * the ceiling, accrual stops. A ledger that keeps charging past the point anyone
 * could pay is generating a number for its own sake, and the arrears it records
 * stop being a fact about the family and become a fact about the software.
 */
function fees_accrue_member(array $member, ?array $cfg = null, ?string $asOf = null): array {
    $cfg = $cfg ?? fees_settings();
    $out = ['membership' => 0, 'dues' => 0, 'training' => 0, 'skipped' => ''];
    if (empty($cfg['enabled'])) { $out['skipped'] = 'disabled'; return $out; }
    if ((string)($member['status'] ?? 'active') !== 'active') { $out['skipped'] = 'not_active'; return $out; }
    $memberId = (string)$member['memberId'];
    $ten = fees_tenure($member, $cfg, $asOf);
    if ($ten['start'] === '') { $out['skipped'] = 'no_join_date'; return $out; }
    $bal = fees_balance($member, $cfg, $asOf);
    if (!empty($bal['atCap'])) { $out['skipped'] = 'at_cap'; return $out; }

    if ((int)$cfg['membershipFee'] > 0
        && fees_post($memberId, 'membership', (int)$cfg['membershipFee'],
                     ['periodKey' => 'once', 'note' => 'Membership fee', 'by' => 'accrual'])) {
        $out['membership'] = 1;
    }
    if ((int)$cfg['monthlyDues'] > 0) {
        foreach (fees_due_months($ten['start'], $asOf ?? gmdate('Y-m-d')) as $mk) {
            if (fees_post($memberId, 'dues', (int)$cfg['monthlyDues'],
                          ['periodKey' => $mk, 'note' => 'Monthly dues ' . $mk, 'by' => 'accrual'])) {
                $out['dues']++;
            }
        }
    }
    /* Training charges attach to a programme SESSION, not to a month — and only
       to sessions that had started, so a session on next year's calendar does
       not appear on an account today. */
    if ((int)$cfg['trainingFee'] > 0) {
        $today = $asOf ?? gmdate('Y-m-d');
        foreach (db_all('SELECT sessionId, name, startDate FROM sessions ORDER BY startDate') as $s) {
            $sd = substr((string)($s['startDate'] ?? ''), 0, 10);
            if ($sd === '' || $sd > $today) continue;
            if ($sd < $ten['start']) continue;                 // before they joined
            if (fees_post($memberId, 'training', (int)$cfg['trainingFee'],
                          ['periodKey' => (string)$s['sessionId'], 'sessionId' => (string)$s['sessionId'],
                           'note' => 'Training fee — ' . ((string)($s['name'] ?? $s['sessionId'])), 'by' => 'accrual'])) {
                $out['training']++;
            }
        }
    }
    return $out;
}

/**
 * Who is due a reminder, and why each of the rest is not.
 *
 * Returns the reasons as well as the list, because "it sent 4 of 60" is not a
 * number anybody can check, and the question a coordinator asks when a family
 * says they were never told is "why not". Every exclusion is named.
 *
 * The bounds are all HERE rather than at the send site, so a caller cannot skip
 * them by calling something else:
 *
 *   fees off / reminders off      nothing at all
 *   duesRemindOff on the member   this family asked not to be chased
 *   nothing PAYABLE               see below — this is the one that matters
 *   under remindMinBalance        not worth a message
 *   reminded within everyDays     the floor, which is 7 days minimum
 *   no guardian email             nothing to send to
 *
 * PAYABLE, not outstanding. A member halfway through their service carries a
 * large training charge that is being written off as they go; chasing them for
 * it would be demanding money the programme has already decided they will not
 * owe. This distinction is the whole reason `payable` exists.
 */
function fees_reminder_candidates(?array $cfg = null, int $limit = 200): array {
    $cfg = $cfg ?? fees_settings();
    $out = ['due' => [], 'skipped' => ['off' => 0, 'optedOut' => 0, 'nothingPayable' => 0,
                                       'underMinimum' => 0, 'tooSoon' => 0, 'noEmail' => 0]];
    if (empty($cfg['enabled']) || empty($cfg['remindEnabled'])) { $out['skipped']['off'] = 1; return $out; }
    $everyDays = max(FEES_REMIND_MIN_DAYS, (int)$cfg['remindEveryDays']);
    $minBal = max(1, (int)$cfg['remindMinBalance']);
    $now = time();
    foreach (db_all("SELECT * FROM members WHERE status = 'active' ORDER BY id LIMIT " . max(1, min(2000, $limit * 5))) as $m) {
        if (count($out['due']) >= $limit) break;
        if ((int)($m['duesRemindOff'] ?? 0) === 1) { $out['skipped']['optedOut']++; continue; }
        $bal = fees_balance($m, $cfg);
        if ((int)$bal['payable'] <= 0) { $out['skipped']['nothingPayable']++; continue; }
        if ((int)$bal['payable'] < $minBal) { $out['skipped']['underMinimum']++; continue; }
        $last = strtotime((string)($m['duesRemindedAt'] ?? '')) ?: 0;
        if ($last > 0 && ($now - $last) < $everyDays * 86400) { $out['skipped']['tooSoon']++; continue; }
        $to = trim((string)($m['parentEmail'] ?? ''));
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) { $out['skipped']['noEmail']++; continue; }
        $out['due'][] = ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'],
                         'to' => $to, 'payable' => (int)$bal['payable'],
                         'lastRemindedAt' => (string)($m['duesRemindedAt'] ?? ''), 'row' => $m];
    }
    $out['everyDays'] = $everyDays;
    return $out;
}

/**
 * One reminder, written for the person who receives it.
 *
 * Deliberately plain: what is owed, what it is for, and how to raise a question.
 * No deadline, no consequence, no capitals. These go to the guardians of
 * children, most of whom are late because money is tight rather than because
 * they forgot — and a threatening note to that family does not produce a payment,
 * it produces a child who stops coming, which costs the programme more than the
 * arrears were worth.
 *
 * The training fee is named as already-discounted where any of it has been earned
 * off, because a guardian who was told ₦75,000 and is now asked for less deserves
 * to know why rather than wondering which figure is real.
 */
function fees_reminder_send(array $cand, ?array $cfg = null): bool {
    $cfg = $cfg ?? fees_settings();
    $m = $cand['row'];
    $first = esc_html(explode(' ', trim((string)($m['fullName'] ?? '')))[0] ?: 'your child');
    $bal = fees_balance($m, $cfg);
    $money = fn(int $n) => '₦' . number_format($n);
    $lines = [];
    foreach (['membership' => 'Membership fee', 'dues' => 'Monthly dues', 'training' => 'Training fee', 'fine' => 'Fines'] as $k => $label) {
        $v = (int)($bal['byKind'][$k] ?? 0);
        if ($v > 0) $lines[] = '<tr><td style="padding:2px 12px 2px 0">' . $label . '</td><td style="padding:2px 0">' . $money($v) . '</td></tr>';
    }
    $earned = (int)$bal['trainingEarned'];
    $body = '<p style="margin:0 0 10px">This is a note about ' . $first . '\'s account at Next Generation Genius. '
          . 'The balance outstanding is <b>' . $money((int)$bal['payable']) . '</b>.</p>';
    if ($lines) $body .= '<table style="margin:0 0 10px;font-size:14px">' . implode('', $lines) . '</table>';
    if ($earned > 0) {
        $body .= '<p style="margin:0 0 10px;color:#5a6488;font-size:13px">' . $money($earned)
              . ' of the training fee has already been written off against ' . $first . '\'s service, and is not included above.</p>';
    }
    $body .= '<p style="margin:0 0 10px">If any of this looks wrong, or if now is a difficult time, please reply to this '
          . 'message or speak to your centre coordinator — we would rather hear from you than not.</p>';
    $html = email_template([
        'title' => 'Account balance', 'intro' => $first . '\'s account has an outstanding balance.',
        'bodyHtml' => $body,
        'footNote' => 'You are receiving this because you are ' . $first . '\'s guardian at Next Generation Genius. '
                    . 'Tell your centre coordinator if you would prefer not to receive these.',
    ]);
    $ok = (bool)@send_mail($cand['to'], $first . '\'s account — ' . $money((int)$bal['payable']) . ' outstanding', $html);
    /* Stamped whether or not the transport succeeded. The alternative is a
     * mailer that is failing quietly and a family reminded on every single cron
     * tick because nothing recorded the attempt. */
    db_update('members', ['duesRemindedAt' => now_iso()], ['memberId' => (string)$m['memberId']]);
    audit('fees.remind.sent', 'cron', (string)$m['memberId'],
          ['payable' => (int)$bal['payable'], 'delivered' => $ok], '');
    return $ok;
}

/**
 * The cron entry point. Bounded per run, and safe to call as often as the cron
 * fires — the per-member `everyDays` gate is what decides, not the schedule.
 */
function fees_reminders_run(int $limit = 50): array {
    $cfg = fees_settings();
    $c = fees_reminder_candidates($cfg, $limit);
    $sent = 0; $failed = 0;
    foreach ($c['due'] as $cand) { if (fees_reminder_send($cand, $cfg)) $sent++; else $failed++; }
    return ['sent' => $sent, 'failed' => $failed, 'due' => count($c['due']),
            'skipped' => $c['skipped'], 'everyDays' => $c['everyDays'] ?? 0];
}

// ── Admin ops ────────────────────────────────────────────────────────────────

function admin_fees_settings_get(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    return ['ok' => true, 'fees' => fees_settings(), 'defaults' => FEES_DEFAULTS,
            'amountMax' => FEES_AMOUNT_MAX, 'remindMinDays' => FEES_REMIND_MIN_DAYS];
}

function admin_fees_settings_set(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $in = is_array($p['data'] ?? null) ? $p['data'] : [];
    return ['ok' => true, 'fees' => fees_settings_save($in, (string)($g['requester']['memberId'] ?? ''))];
}

/** One member's account: the balance, the tenure, and every entry behind it. */
function admin_fees_member(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $cfg = fees_settings();
    $entries = array_map(fn($e) => [
        'entryId' => (string)$e['entryId'], 'kind' => (string)$e['kind'],
        'direction' => (string)$e['direction'], 'amount' => (int)$e['amount'],
        'periodKey' => (string)$e['periodKey'], 'sessionId' => (string)$e['sessionId'],
        'note' => (string)$e['note'], 'method' => (string)$e['method'],
        'reference' => (string)$e['reference'], 'createdAt' => (string)$e['createdAt'],
        'void' => trim((string)($e['voidedAt'] ?? '')) !== '',
        'voidReason' => (string)($e['voidReason'] ?? ''),
    ], fees_entries($id));
    return ['ok' => true, 'account' => [
        'memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'],
        'centre' => (string)($m['centre'] ?? ''), 'status' => (string)($m['status'] ?? ''),
        'guardian' => ['name' => (string)($m['parentName'] ?? ''), 'phone' => (string)($m['parentPhone'] ?? ''),
                       'email' => (string)($m['parentEmail'] ?? '')],
        'balance' => fees_balance($m, $cfg),
        'entries' => array_reverse($entries),          // newest first for reading
        'remindOff' => (int)($m['duesRemindOff'] ?? 0) === 1,
        'settings' => $cfg,
    ]];
}

/** Record a payment received. Admin-entered: this is the reconciliation step,
 *  not a gateway callback. */
function admin_fees_payment(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $amount = fees_money($p['amount'] ?? null, 0);
    if ($amount <= 0) return ['ok' => false, 'error' => 'bad_amount'];
    $by = (string)($g['requester']['memberId'] ?? '');
    $e = fees_post($id, 'payment', $amount, [
        'note' => (string)($p['note'] ?? ''), 'method' => (string)($p['method'] ?? 'cash'),
        'reference' => (string)($p['reference'] ?? ''), 'by' => $by,
    ]);
    if (!$e) return ['ok' => false, 'error' => 'post_failed'];
    audit('fees.payment', $by, $id, ['amount' => $amount, 'method' => (string)($p['method'] ?? 'cash')], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'entryId' => $e['entryId'], 'balance' => fees_balance($m)];
}

/** Void an entry. Corrections do not edit or delete — a mistake somebody fixed
 *  stays on the account with its reason, because "why is this different from
 *  last month" is the question an account has to be able to answer. */
function admin_fees_void(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $entryId = trim((string)($p['entryId'] ?? ''));
    $reason = trim((string)($p['reason'] ?? ''));
    if ($reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $e = db_row('SELECT * FROM member_ledger WHERE entryId = ? LIMIT 1', [$entryId]);
    if (!$e) return ['ok' => false, 'error' => 'not_found'];
    if (trim((string)($e['voidedAt'] ?? '')) !== '') return ['ok' => false, 'error' => 'already_void'];
    $by = (string)($g['requester']['memberId'] ?? '');
    db_update('member_ledger', ['voidedAt' => now_iso(), 'voidedBy' => $by,
                                'voidReason' => substr($reason, 0, 240)], ['entryId' => $entryId]);
    audit('fees.void', $by, (string)$e['memberId'], ['entryId' => $entryId, 'amount' => (int)$e['amount'], 'reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * Mark the MOU accomplished, and write off what the training fee has left.
 *
 * Recorded as a fact on the member AND as a write-off entry, because the two say
 * different things: the date says they completed their service, the entry says
 * the obligation is discharged. Inferring either from the other is how an
 * obligation gets written off on the strength of a payment.
 */
function admin_fees_mou(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (trim((string)($m['mouAt'] ?? '')) !== '') return ['ok' => false, 'error' => 'already_done'];
    $by = (string)($g['requester']['memberId'] ?? '');
    $bal = fees_balance($m);
    $left = max(0, (int)$bal['trainingCharged'] - (int)$bal['trainingWrittenOff']);
    db_update('members', ['mouAt' => now_iso(), 'mouBy' => $by, 'updatedAt' => now_iso()], ['memberId' => $id]);
    if ($left > 0) {
        fees_post($id, 'writeoff', $left, ['periodKey' => 'mou',
            'note' => 'Training fee written off — MOU accomplished', 'by' => $by]);
    }
    audit('fees.mou', $by, $id, ['writtenOff' => $left], (string)($p['ip'] ?? ''));
    $after = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    return ['ok' => true, 'writtenOff' => $left, 'balance' => fees_balance($after)];
}

/** Turn reminders off (or back on) for one family, without touching anybody
 *  else's. A guardian who asks not to be chased has asked for this. */
function admin_fees_remind_off(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    if (!db_row('SELECT 1 x FROM members WHERE memberId = ? LIMIT 1', [$id])) return ['ok' => false, 'error' => 'not_found'];
    $off = !empty($p['off']) ? 1 : 0;
    db_update('members', ['duesRemindOff' => $off, 'updatedAt' => now_iso()], ['memberId' => $id]);
    audit('fees.remind.' . ($off ? 'off' : 'on'), (string)($g['requester']['memberId'] ?? ''), $id, [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'off' => $off === 1];
}

/**
 * Run accrual across the active membership, and report what it did.
 *
 * Returns per-member counts rather than a bare total, because "it charged 412
 * things" is not something anybody can check. Bounded, so one press cannot walk
 * an unbounded roster inside a web request.
 */
function admin_fees_accrue(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    if (empty($cfg['enabled'])) return ['ok' => false, 'error' => 'fees_disabled'];
    $limit = max(1, min(2000, (int)($p['limit'] ?? 500)));
    $rows = db_all("SELECT * FROM members WHERE status = 'active' ORDER BY id LIMIT " . $limit);
    $tot = ['members' => 0, 'membership' => 0, 'dues' => 0, 'training' => 0, 'atCap' => 0, 'noJoinDate' => 0];
    foreach ($rows as $m) {
        $r = fees_accrue_member($m, $cfg);
        $tot['members']++;
        $tot['membership'] += $r['membership']; $tot['dues'] += $r['dues']; $tot['training'] += $r['training'];
        if ($r['skipped'] === 'at_cap') $tot['atCap']++;
        if ($r['skipped'] === 'no_join_date') $tot['noJoinDate']++;
    }
    audit('fees.accrue', (string)($g['requester']['memberId'] ?? ''), 'fees', $tot, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'accrued' => $tot, 'scanned' => count($rows), 'limit' => $limit];
}

/**
 * What a reminder run WOULD do, without sending anything.
 *
 * Offered before the button that sends, because the send is not undoable — a
 * message to sixty guardians cannot be recalled, and "how many and to whom" is
 * the question worth answering first. Names the exclusions too, so a run that
 * would send nothing explains itself rather than looking broken.
 */
function admin_fees_remind_preview(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    $c = fees_reminder_candidates($cfg, 200);
    return ['ok' => true, 'preview' => [
        'due' => array_map(fn($x) => ['memberId' => $x['memberId'], 'fullName' => $x['fullName'],
                                      'payable' => $x['payable'], 'lastRemindedAt' => $x['lastRemindedAt']], $c['due']),
        'count' => count($c['due']), 'skipped' => $c['skipped'],
        'everyDays' => $c['everyDays'] ?? 0,
        'enabled' => !empty($cfg['enabled']) && !empty($cfg['remindEnabled']),
    ]];
}

/** Send them. Bounded per press, so a mis-click cannot mail an entire roster. */
function admin_fees_remind_run(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    if (empty($cfg['enabled']) || empty($cfg['remindEnabled'])) return ['ok' => false, 'error' => 'reminders_disabled'];
    $r = fees_reminders_run(max(1, min(200, (int)($p['limit'] ?? 50))));
    audit('fees.remind.run', (string)($g['requester']['memberId'] ?? ''), 'fees', $r, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'result' => $r];
}

/**
 * Who is in arrears, for the screen a coordinator works from.
 *
 * Sorted by what is PAYABLE, not by what is charged — a member whose balance is
 * large only because their training fee has not been written off yet is not the
 * person to call.
 */
function admin_fees_arrears(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    $limit = max(1, min(1000, (int)($p['limit'] ?? 200)));
    $owedBy = [];
    foreach (db_all("SELECT memberId, direction, amount, kind FROM member_ledger WHERE voidedAt = '' OR voidedAt IS NULL") as $e) {
        $id = (string)$e['memberId'];
        $owedBy[$id] = $owedBy[$id] ?? 0;
        $owedBy[$id] += ((string)$e['direction'] === 'charge' ? 1 : -1) * (int)$e['amount'];
    }
    $ids = array_keys(array_filter($owedBy, fn($v) => $v > 0));
    $out = []; $totalPayable = 0;
    if ($ids) {
        foreach (array_chunk($ids, 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            foreach (db_all("SELECT * FROM members WHERE memberId IN ($ph)", $chunk) as $m) {
                $b = fees_balance($m, $cfg);
                if ((int)$b['payable'] <= 0) continue;
                $totalPayable += (int)$b['payable'];
                $out[] = ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'],
                          'centre' => (string)($m['centre'] ?? ''),
                          'payable' => (int)$b['payable'], 'outstanding' => (int)$b['outstanding'],
                          'trainingEarned' => (int)$b['trainingEarned'],
                          'atCap' => !empty($b['atCap']),
                          'phase' => (string)$b['tenure']['phase'],
                          'remindOff' => (int)($m['duesRemindOff'] ?? 0) === 1,
                          'guardianPhone' => (string)($m['parentPhone'] ?? '')];
            }
        }
    }
    usort($out, fn($a, $b) => $b['payable'] <=> $a['payable']);
    $matched = count($out);
    return ['ok' => true, 'arrears' => array_slice($out, 0, $limit),
            'matched' => $matched, 'truncated' => $matched > $limit,
            'totalPayable' => $totalPayable, 'settings' => $cfg];
}
