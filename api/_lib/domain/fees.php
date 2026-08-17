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
    /* ── Uprating ─────────────────────────────────────────────────────────
     * Naira inflation erodes a fixed figure fast: ₦75,000 set today is worth
     * noticeably less in two years, and a programme that never revisits its
     * amounts is quietly taking a pay cut. This raises the AMOUNTS on a
     * schedule so they hold their real value.
     *
     * It touches the settings and NOTHING ELSE. A charge already posted keeps
     * the figure it was posted at, because a family told ₦1,000 for August owes
     * ₦1,000 for August — reaching back into a balance somebody has already been
     * quoted is how a ledger stops being trustworthy.
     *
     * Off by default, and PROPOSED rather than automatic: see
     * `fees_uprate_apply()`. */
    'upratePct' => 0,
    'uprateEveryMonths' => 12,
    'uprateLastAt' => '',
    /* When the "a review is due" nudge was last journalled. Not a decision and
       not shown as one — it exists so the reminder cron can say it once a month
       instead of every fifteen minutes. Written only by `fees_uprate_note()`. */
    'uprateNotedAt' => '',
];
/** ── Bounds, all of them named ────────────────────────────────────────────
 *
 * Every number this file enforces lives here rather than inline at the place it
 * bites, and the ones a screen has to SAY are handed to the client by
 * `admin.fees.settings.get` instead of being retyped in the UI. Two reasons,
 * both learned here: a floor written as `max(7, …)` in one function and as
 * `|| 7` in a React component drifts the day somebody changes one of them, and
 * a bound the interface cannot read is a bound it has to hardcode a copy of.
 *
 * These are BOUNDS, not policy. The amounts, the cadence and the phase lengths
 * are all admin-set in `FEES_DEFAULTS` above; what follows is only how far a
 * form may move them and how much work one pass may do.
 */
const FEES_REMIND_MIN_DAYS = 7;
/** A year. Past this, "remind them" is not what the setting means any more. */
const FEES_REMIND_MAX_DAYS = 365;
/** How far apart an uprate interval may be set, in months. */
const FEES_UPRATE_EVERY_MIN = 1;
const FEES_UPRATE_EVERY_MAX = 120;
/** While an uprate is overdue, journal it at most this often — the cron ticks
 *  every 15 minutes and a nudge that repeats per tick is noise, not a nudge. */
const FEES_UPRATE_NOTE_DAYS = 30;
/** Batch sizes. Every one of these is a bound on how much a single press or a
 *  single cron tick may do, so a mis-click cannot walk an entire roster. */
const FEES_SCAN_MAX = 2000;          // rows one pass may read, whatever is asked
const FEES_ACCRUE_BATCH = 500;       // default members per accrual press
const FEES_REMIND_BATCH = 50;        // default sends per press
const FEES_REMIND_BATCH_MAX = 200;   // ceiling on one press, however it is asked
const FEES_REMIND_CRON_BATCH = 25;   // per cron tick: small, because it repeats
const FEES_CANDIDATE_MAX = 200;      // reminder candidates gathered in one pass
const FEES_ARREARS_PAGE = 200;       // arrears rows returned by default
const FEES_ARREARS_PAGE_MAX = 1000;  // …and at most
/** Free text stored on a ledger row: a payment reference, not a note field. */
const FEES_REF_MAX = 120;
/** Months one accrual may reach back over. A row imported with a join date of
 *  1970 must not post six hundred charges. */
const FEES_DUE_MONTHS_MAX = 120;
/** A ceiling on one uprate. Anything above this is a repricing decision that
 *  wants a human typing the new figure, not a percentage applied by a cron. */
const FEES_UPRATE_MAX_PCT = 50;
/** Uprated amounts round to the nearest ₦10. A due of ₦1,173.50 is arithmetic,
 *  not a price, and a figure ending in 3 naira reads to a family like an error. */
const FEES_UPRATE_ROUND = 10;
/** Which amounts an uprate moves. Deliberately the three CHARGES and not
 *  `balanceCap`: the cap is a safety limit on how far a family's debt may run,
 *  not a price, and inflating a debt ceiling alongside the prices would quietly
 *  undo the protection it exists to provide. */
const FEES_UPRATE_FIELDS = ['membershipFee', 'monthlyDues', 'trainingFee'];

/**
 * The bounds, in the shape the client reads them.
 *
 * One function so there is exactly one list. The UI takes its input maxima, the
 * numbers it states in microcopy ("the minimum is 7") and the batch sizes it
 * asks for from here — never from a literal of its own.
 */
function fees_bounds(): array {
    return [
        'amountMax'      => FEES_AMOUNT_MAX,
        'phaseMin'       => FEES_PHASE_MIN,
        'phaseMax'       => FEES_PHASE_MAX,
        'remindMinDays'  => FEES_REMIND_MIN_DAYS,
        'remindMaxDays'  => FEES_REMIND_MAX_DAYS,
        'uprateMaxPct'   => FEES_UPRATE_MAX_PCT,
        'uprateEveryMin' => FEES_UPRATE_EVERY_MIN,
        'uprateEveryMax' => FEES_UPRATE_EVERY_MAX,
        'uprateRound'    => FEES_UPRATE_ROUND,
        'uprateFields'   => FEES_UPRATE_FIELDS,
        'accrueBatch'    => FEES_ACCRUE_BATCH,
        'remindBatch'    => FEES_REMIND_BATCH_MAX,
        'arrearsPage'    => FEES_ARREARS_PAGE,
    ];
}

/** The charge and credit kinds. `direction` is stored, but these decide it, so a
 *  caller cannot post a payment that increases what is owed. */
const FEES_CHARGE_KINDS = ['membership', 'dues', 'training', 'fine', 'adjustment'];
const FEES_CREDIT_KINDS = ['payment', 'writeoff', 'waiver'];

/** ── Kinds a human posts, as opposed to kinds the accrual posts ────────────
 *
 * `membership`, `dues` and `training` are the machine's: they come from the
 * settings, on a schedule, idempotently. These three are somebody's decision,
 * and are treated differently for that reason — each needs a REASON on the row,
 * and each is audited under its own event with the reason in it. "Who decided
 * this, and why" is the first question asked about any charge on a child's
 * account, and it has to be answerable from the ledger alone.
 */
const FEES_MANUAL_CHARGE_KINDS = ['fine', 'adjustment'];

/** Why a fine was issued. A fixed vocabulary rather than free text, because a
 *  fine is the one charge a family will dispute, and "late three times in
 *  August" is answerable where "misconduct" is not. `other` exists so nobody
 *  mislabels to fit the list — and it REQUIRES a written reason. */
const FEES_FINE_REASONS = [
    'late'      => 'Late arrival',
    'absent'    => 'Missed a session without notice',
    'equipment' => 'Equipment lost or damaged',
    'conduct'   => 'Conduct',
    'other'     => 'Other (say why)',
];
/** How many members a lookup returns. It is a find-a-person box, not a report. */
const FEES_LOOKUP_MAX = 25;

function fees_settings(): array {
    $cfg = setting_get('fees');
    return (is_array($cfg) ? $cfg : []) + FEES_DEFAULTS;
}

/** Currency symbols by the code the setting stores. One entry, because the
 *  programme bills in naira and `currency` is forced to NGN on save — but a map
 *  rather than a literal, so the symbol lives in exactly one place instead of
 *  being retyped into every email and every column that shows money. */
const FEES_CURRENCY_SYMBOL = ['NGN' => '₦'];

/** Money as a family reads it. Whole units — nothing here deals in kobo. */
function fees_money_text($n, ?array $cfg = null): string {
    $code = (string)(($cfg ?? fees_settings())['currency'] ?? FEES_DEFAULTS['currency']);
    return (FEES_CURRENCY_SYMBOL[$code] ?? ($code . ' ')) . number_format((float)$n);
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
        'remindEveryDays' => max(FEES_REMIND_MIN_DAYS, min(FEES_REMIND_MAX_DAYS, (int)($in['remindEveryDays'] ?? $cur['remindEveryDays']) ?: (int)$cur['remindEveryDays'])),
        'remindMinBalance' => fees_money($in['remindMinBalance'] ?? null, (int)$cur['remindMinBalance']),
        /* Uprating. `upratePct` of 0 switches it off, which is the default —
           raising what families are charged is not something to inherit. */
        'upratePct' => max(0, min(FEES_UPRATE_MAX_PCT, (int)($in['upratePct'] ?? $cur['upratePct']))),
        'uprateEveryMonths' => max(FEES_UPRATE_EVERY_MIN, min(FEES_UPRATE_EVERY_MAX,
            (int)($in['uprateEveryMonths'] ?? $cur['uprateEveryMonths']) ?: (int)FEES_DEFAULTS['uprateEveryMonths'])),
        /* Carried, never settable from the form. It records when an uprate was
           APPLIED, and a field an admin can edit is a field that can be used to
           apply one twice in a year. Only `fees_uprate_apply()` writes it. */
        'uprateLastAt' => (string)($cur['uprateLastAt'] ?? ''),
        /* Carried for the same reason: it is bookkeeping for the nudge, not a
           setting, and clearing it from a form would restart the nagging. */
        'uprateNotedAt' => (string)($cur['uprateNotedAt'] ?? ''),
    ];
    setting_set('fees', $clean, $by);
    audit('fees.settings.save', $by, 'fees', [
        'enabled' => $clean['enabled'], 'monthlyDues' => $clean['monthlyDues'],
        'trainingFee' => $clean['trainingFee'], 'membershipFee' => $clean['membershipFee'],
    ], '');
    return $clean;
}

/**
 * What an uprate WOULD do, and whether one is due.
 *
 * Computed and shown; never applied on its own. Raising what families are
 * charged is a decision somebody should make on purpose — a percentage that
 * fires from a cron would mean the first anyone hears of a price rise is a
 * bigger reminder email, and nobody would be able to say who decided it.
 *
 * `due` is only about the CLOCK. It says the interval has elapsed, not that
 * anything has happened; `apply` is a separate, audited, human act.
 */
function fees_uprate_preview(?array $cfg = null, ?string $asOf = null): array {
    $cfg = $cfg ?? fees_settings();
    $pct = (int)($cfg['upratePct'] ?? 0);
    $every = max(FEES_UPRATE_EVERY_MIN, (int)($cfg['uprateEveryMonths'] ?? FEES_DEFAULTS['uprateEveryMonths']));
    $last = substr((string)($cfg['uprateLastAt'] ?? ''), 0, 10);
    $today = $asOf ?? gmdate('Y-m-d');
    /* Never uprated: due once the interval has passed since it was switched on.
     * With no record of a first application there is nothing to measure from, so
     * the honest answer is "due now" and the admin decides. */
    $monthsSince = $last !== '' ? fees_months_between($last, $today) : null;
    $due = $pct > 0 && ($monthsSince === null || $monthsSince >= $every);
    $changes = [];
    foreach (FEES_UPRATE_FIELDS as $f) {
        $from = (int)($cfg[$f] ?? 0);
        if ($from <= 0) continue;                       // nothing to raise
        $to = min(FEES_AMOUNT_MAX, (int)(round($from * (1 + $pct / 100) / FEES_UPRATE_ROUND) * FEES_UPRATE_ROUND));
        if ($to === $from) continue;
        $changes[$f] = ['from' => $from, 'to' => $to];
    }
    return ['enabled' => $pct > 0, 'pct' => $pct, 'everyMonths' => $every,
            'lastAt' => (string)($cfg['uprateLastAt'] ?? ''),
            'monthsSince' => $monthsSince, 'due' => $due, 'changes' => $changes];
}

/**
 * Apply the uprate. Settings only.
 *
 * The property this function has to keep, and which its test pins: a charge
 * ALREADY POSTED is untouched. The ledger stores the amount on the row, so a
 * family quoted ₦1,000 for August owes ₦1,000 for August however many times the
 * price is revised afterwards. Uprating a balance somebody has already been told
 * is the single thing that would make this ledger untrustworthy.
 *
 * Refused when not due, so a second press inside the interval cannot raise
 * prices twice — the same lesson the accrual's unique index taught.
 */
function fees_uprate_apply(string $by, ?string $asOf = null): array {
    $cfg = fees_settings();
    $pv = fees_uprate_preview($cfg, $asOf);
    if (empty($pv['enabled'])) return ['ok' => false, 'error' => 'uprate_off'];
    if (empty($pv['due']))     return ['ok' => false, 'error' => 'not_due', 'monthsSince' => $pv['monthsSince'],
                                       'everyMonths' => $pv['everyMonths']];
    if (!$pv['changes'])       return ['ok' => false, 'error' => 'nothing_to_change'];
    $next = $cfg;
    foreach ($pv['changes'] as $f => $c) $next[$f] = (int)$c['to'];
    $next['uprateLastAt'] = now_iso();
    setting_set('fees', $next, $by);
    audit('fees.uprate', $by, 'fees',
          ['pct' => $pv['pct'], 'changes' => $pv['changes']], '');
    return ['ok' => true, 'applied' => $pv['changes'], 'pct' => $pv['pct'], 'fees' => fees_settings()];
}

/**
 * Say out loud that a review is due. Journals; never applies.
 *
 * The gap this closes: an uprate that is only visible on the tab where it is set
 * is an uprate nobody performs, because nothing tells you to go and look. So the
 * reminder cron notes it in the ops journal, where the screen that already
 * exists for "things needing a human" will show it.
 *
 * Two properties, and the tests drive both. It CANNOT apply anything — a nudge
 * that could raise prices from a cron would be exactly the automatic uprate this
 * design refuses. And it is bounded to once every `FEES_UPRATE_NOTE_DAYS`: the
 * cron ticks every fifteen minutes, so an unbounded nudge is not a reminder, it
 * is a fault log filling up with a to-do item.
 */
function fees_uprate_note(?string $asOf = null): array {
    $cfg = fees_settings();
    if (empty($cfg['enabled'])) return ['ok' => false, 'error' => 'fees_off'];
    $pv = fees_uprate_preview($cfg, $asOf);
    if (empty($pv['enabled'])) return ['ok' => false, 'error' => 'uprate_off'];
    if (empty($pv['due']))     return ['ok' => false, 'error' => 'not_due'];
    if (!$pv['changes'])       return ['ok' => false, 'error' => 'nothing_to_change'];
    $today = $asOf ?? gmdate('Y-m-d');
    $noted = substr((string)($cfg['uprateNotedAt'] ?? ''), 0, 10);
    if ($noted !== '' && fees_days_between($noted, $today) < FEES_UPRATE_NOTE_DAYS) {
        return ['ok' => false, 'error' => 'noted_recently'];
    }
    /* Kind `warn`, not `error`: nothing is broken. Somebody has a decision to
       make. The message is the SIGNATURE ops_events rolls up on, so it stays
       stable — the changing figures go in the detail, or one drifting month
       count would mint a new row every time it was noted. */
    if (function_exists('ops_record')) {
        ops_record('warn', 'fees.uprate',
            'Fee amounts are due their ' . $pv['pct'] . '% review',
            count($pv['changes']) . ' amount(s) would change · last raised '
            . ($pv['lastAt'] !== '' ? substr($pv['lastAt'], 0, 10) : 'never'));
    }
    $next = $cfg;
    $next['uprateNotedAt'] = now_iso();
    setting_set('fees', $next, 'cron');
    return ['ok' => true, 'noted' => count($pv['changes']), 'pct' => $pv['pct']];
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
/**
 * The date the training write-down stops counting for this member, or '' if it
 * is still running.
 *
 * "These only happen if they consistently follow the MoU." The write-down is
 * not a gift for surviving thirty-six months on the calendar — it is what
 * SERVICE earns off, and a member who has stopped serving has stopped earning.
 *
 * The two states that mean that are already recorded, with the dates they
 * began, so nothing has to be invented or back-filled:
 *
 *   evicted    association is terminated. Earning stops the day it was issued.
 *   suspended  barred from the premises and the digital channels. Earning is
 *              paused from the day the suspension started; it resumes when the
 *              suspension is lifted, because a suspension is a pause, not an end.
 *
 * `warned` and `dormant` do NOT stop it. A warning is the programme telling a
 * child to correct something, and taking their money at the same moment turns a
 * correction into a punishment nobody explained.
 */
function fees_compliance_cutoff(array $member): array {
    if (!function_exists('policy_state')) return ['cutoff' => '', 'state' => 'clear'];
    $id = (string)($member['memberId'] ?? '');
    if ($id === '') return ['cutoff' => '', 'state' => 'clear'];
    try { $st = policy_state($id, 'member'); } catch (\Throwable $e) { return ['cutoff' => '', 'state' => 'clear']; }
    $state = (string)($st['state'] ?? 'clear');
    if ($state === 'evicted') {
        return ['cutoff' => substr((string)($st['evictedAt'] ?? ''), 0, 10), 'state' => $state, 'final' => true];
    }
    if ($state === 'suspended') {
        return ['cutoff' => substr((string)($st['suspendedFrom'] ?? ''), 0, 10), 'state' => $state, 'final' => false];
    }
    return ['cutoff' => '', 'state' => $state, 'final' => false];
}

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

    /* Service months are counted to the day the member stopped serving, not to
     * today. A suspension pauses the clock; an eviction stops it. The phase and
     * the elapsed month count are still reported against the real calendar,
     * because "how far through are they" and "how much have they earned" are
     * different questions and a screen showing one as the other is a screen
     * nobody can reconcile. */
    $comp = fees_compliance_cutoff($member);
    $creditTo = ($comp['cutoff'] !== '' && $comp['cutoff'] < $today) ? $comp['cutoff'] : $today;
    $creditMonths = fees_months_between($start, $creditTo);
    $served = max(0, min($sm, $creditMonths - $tm));

    /* The training half also ENDS. Kept here so the accrual and the dashboard
     * agree on the last date a session may be charged: without it, training
     * charges carried on for as long as the member stayed enrolled, which is
     * not eighteen months of training, it is forever. */
    $trainingEndsAt = gmdate('Y-m-d', (int)strtotime($start . ' 00:00:00 UTC +' . $tm . ' months'));

    return [
        'start' => $start, 'months' => $months,
        'phase' => $months < $tm ? 'training' : ($months < $tm + $sm ? 'service' : 'complete'),
        'trainingMonths' => $tm, 'serviceMonths' => $sm,
        'trainingEndsAt' => $trainingEndsAt,
        'servedMonths' => $served, 'complete' => $months >= $tm + $sm,
        // Why the write-down is paused or stopped, so a screen can say it.
        'standing' => (string)$comp['state'],
        'creditPausedAt' => ($comp['cutoff'] !== '' && $comp['cutoff'] < $today) ? $comp['cutoff'] : '',
        'creditStopped' => !empty($comp['final']),
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

/** Whole days between two dates, floored at zero. Used only to space the uprate
 *  nudge, where months are too coarse and a negative would mean "nudge now". */
function fees_days_between(string $a, string $b): int {
    $x = strtotime($a . ' 00:00:00 UTC'); $y = strtotime($b . ' 00:00:00 UTC');
    if ($x === false || $y === false || $y <= $x) return 0;
    return (int)floor(($y - $x) / 86400);
}

/** The YYYY-MM keys from a member's start month up to and including `$upto`,
 *  bounded so an ancient or malformed join date cannot generate ten thousand
 *  charges in one accrual run. */
function fees_due_months(string $start, string $upto, int $max = FEES_DUE_MONTHS_MAX): array {
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
        'reference' => substr((string)($opts['reference'] ?? ''), 0, FEES_REF_MAX),
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

    /* ── What a family is ASKED FOR, versus what the programme COVERS ──────
     *
     * The training fee is not a debt. It is the cost of a place the child has
     * been given free, carried on the account so the programme can say what it
     * spends and what the member is earning off through service. Nobody is
     * expected to pay it.
     *
     * Membership, dues and fines ARE real money.
     *
     * Keeping those in one number was the most consequential thing wrong here.
     * `payable` fed the reminder cron, so guardians were emailed "the balance
     * outstanding is ₦225,000" about a programme their child attends for
     * nothing. That message is warm and credible, which makes it worse, not
     * better: the likely outcome is a family quietly withdrawing a child from
     * something free rather than a payment.
     *
     * So `payable` is now REAL money only. Every screen that asks a family for
     * a figure, and every reminder, reads it.
     */
    $realCharged = 0; $realCredited = 0;
    foreach (fees_entries($memberId) as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $kind = (string)$e['kind']; $amt = (int)$e['amount'];
        if ((string)$e['direction'] === 'charge') {
            if ($kind !== 'training') $realCharged += $amt;
        } else {
            // A writeoff settles the notional training fee; payments and
            // waivers settle real money.
            if ($kind !== 'writeoff') $realCredited += $amt;
        }
    }
    $payable = max(0, $realCharged - $realCredited);

    $cap = (int)$cfg['balanceCap'];
    return [
        'charged' => $charged, 'credited' => $credited,
        'outstanding' => $outstanding,
        /* Real money a family is asked for. Training is deliberately NOT in
           here — see above. Reported alongside `outstanding` (which is the
           whole account, notional included) so nobody has to guess which of the
           two a figure on a screen is. */
        'payable' => $payable,
        'realCharged' => $realCharged, 'realCredited' => $realCredited,
        /* The notional side, named for what it is so a screen can say it
           without implying a bill. */
        'programmeCost' => $trainingCharged,
        'programmeCovered' => min($trainingCharged, $earned + $trainingWritten),
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
            /* …and after the training half is over, nothing more is charged.
             * This was missing: a member kept picking up a training fee for
             * every session for as long as they stayed enrolled, so the balance
             * grew through the very period it was supposed to be shrinking. The
             * eighteen months are a training PERIOD, not a rate. */
            if ((string)($ten['trainingEndsAt'] ?? '') !== '' && $sd >= (string)$ten['trainingEndsAt']) continue;
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
function fees_reminder_candidates(?array $cfg = null, int $limit = FEES_CANDIDATE_MAX): array {
    $cfg = $cfg ?? fees_settings();
    $out = ['due' => [], 'skipped' => ['off' => 0, 'optedOut' => 0, 'nothingPayable' => 0,
                                       'underMinimum' => 0, 'tooSoon' => 0, 'noEmail' => 0]];
    if (empty($cfg['enabled']) || empty($cfg['remindEnabled'])) { $out['skipped']['off'] = 1; return $out; }
    $everyDays = max(FEES_REMIND_MIN_DAYS, (int)$cfg['remindEveryDays']);
    $minBal = max(1, (int)$cfg['remindMinBalance']);
    $now = time();
    foreach (db_all("SELECT * FROM members WHERE status = 'active' ORDER BY id LIMIT " . max(1, min(FEES_SCAN_MAX, $limit * 5))) as $m) {
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
    $money = fn(int $n) => fees_money_text($n, $cfg);
    /* Real money ONLY. The training fee is the cost of a free place, not a bill,
     * and naming it in an email to a guardian is how a family comes to believe
     * they owe ₦225,000 for something their child attends for nothing. */
    $lines = [];
    foreach (['membership' => 'Membership fee', 'dues' => 'Monthly dues', 'fine' => 'Fines'] as $k => $label) {
        $v = (int)($bal['byKind'][$k] ?? 0);
        if ($v > 0) $lines[] = '<tr><td style="padding:2px 12px 2px 0">' . $label . '</td><td style="padding:2px 0">' . $money($v) . '</td></tr>';
    }
    $body = '<p style="margin:0 0 10px">This is a note about ' . $first . '\'s account at Next Generation Genius. '
          . 'The amount to pay is <b>' . $money((int)$bal['payable']) . '</b>.</p>';
    if ($lines) $body .= '<table style="margin:0 0 10px;font-size:14px">' . implode('', $lines) . '</table>';
    /* Said once, positively, and never as part of the figure: the training is
     * covered, and a guardian seeing the number on the dashboard should be told
     * why it is not being asked for. */
    if ((int)$bal['programmeCost'] > 0) {
        $body .= '<p style="margin:0 0 10px;color:#5a6488;font-size:13px">'
              . $first . '\'s training place costs the programme ' . $money((int)$bal['programmeCost'])
              . '. That is covered by Next Generation Genius and is not something you are asked to pay.</p>';
    }
    $body .= '<p style="margin:0 0 10px">If any of this looks wrong, or if now is a difficult time, please reply to this '
          . 'message or speak to your centre coordinator — we would rather hear from you than not.</p>';
    $html = email_template([
        'title' => 'Account balance', 'intro' => $first . '\'s account has an amount to pay.',
        'bodyHtml' => $body,
        'footNote' => 'You are receiving this because you are ' . $first . '\'s guardian at Next Generation Genius. '
                    . 'Tell your centre coordinator if you would prefer not to receive these.',
    ]);
    $ok = (bool)@send_mail($cand['to'], $first . '\'s account — ' . $money((int)$bal['payable']) . ' to pay', $html);
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
function fees_reminders_run(int $limit = FEES_REMIND_BATCH): array {
    $cfg = fees_settings();
    $c = fees_reminder_candidates($cfg, $limit);
    $sent = 0; $failed = 0;
    foreach ($c['due'] as $cand) { if (fees_reminder_send($cand, $cfg)) $sent++; else $failed++; }
    return ['sent' => $sent, 'failed' => $failed, 'due' => count($c['due']),
            'skipped' => $c['skipped'], 'everyDays' => $c['everyDays'] ?? 0];
}

// ── Admin ops ────────────────────────────────────────────────────────────────

function admin_fees_settings_get(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    /* Every bound the screen has to state or enforce goes with the settings, so
       the interface never carries a second copy of a number this file owns. A
       floor the UI hardcodes is a floor that disagrees with the server the day
       one of them changes, and the disagreement shows up as an admin being told
       one minimum and given another. */
    return ['ok' => true, 'fees' => fees_settings(), 'defaults' => FEES_DEFAULTS,
            'amountMax' => FEES_AMOUNT_MAX, 'remindMinDays' => FEES_REMIND_MIN_DAYS,
            'bounds' => fees_bounds()];
}

function admin_fees_settings_set(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $in = is_array($p['data'] ?? null) ? $p['data'] : [];
    return ['ok' => true, 'fees' => fees_settings_save($in, (string)($g['requester']['memberId'] ?? ''))];
}

/** One member's account: the balance, the tenure, and every entry behind it. */
function admin_fees_member(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
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
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
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
/**
 * Post a fine or an adjustment. Somebody's decision, on the record as one.
 *
 * Three things separate this from the accrual. A REASON is required and stored
 * on the row — a fine is the charge a family disputes, and "late three times in
 * August" is answerable where "misconduct" is not. It is audited under its own
 * event with the reason in it. And it is never idempotent: two fines in one month
 * are two real events, so each gets its own period key.
 *
 * ON THE CEILING. `balanceCap` stops the ACCRUAL — the machine, running monthly,
 * with nobody watching. A human posting a fine can push an account past it, and
 * the response says so rather than silently refusing: the cap exists to stop an
 * unattended process running a family into a number nobody will pay, not to
 * overrule the coordinator standing in front of them. The screen states the new
 * balance and that it is over the ceiling, so the decision is made with the
 * consequence visible.
 */
function admin_fees_charge(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $kind = (string)($p['kind'] ?? 'fine');
    if (!in_array($kind, FEES_MANUAL_CHARGE_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    $amount = fees_money($p['amount'] ?? null, 0);
    if ($amount <= 0) return ['ok' => false, 'error' => 'bad_amount'];
    $note = trim((string)($p['note'] ?? ''));
    /* A fine carries a reason from the vocabulary; an adjustment is by nature
       a one-off, so it carries a written one. Either way something is stored. */
    $reason = (string)($p['reason'] ?? '');
    if ($kind === 'fine') {
        if (!isset(FEES_FINE_REASONS[$reason])) return ['ok' => false, 'error' => 'bad_reason'];
        // `other` is the escape hatch, so it cannot also be the silent one.
        if ($reason === 'other' && $note === '') return ['ok' => false, 'error' => 'note_required'];
        $label = FEES_FINE_REASONS[$reason];
    } else {
        if ($note === '') return ['ok' => false, 'error' => 'note_required'];
        $reason = 'adjustment';
        $label = 'Adjustment';
    }
    $by = (string)($g['requester']['memberId'] ?? '');
    $e = fees_post($id, $kind, $amount, [
        'note' => $note !== '' ? $label . ' — ' . $note : $label,
        'method' => $reason, 'by' => $by,
    ]);
    if (!$e) return ['ok' => false, 'error' => 'post_failed'];
    audit('fees.' . $kind, $by, $id,
          ['amount' => $amount, 'reason' => $reason, 'note' => $note], (string)($p['ip'] ?? ''));
    $bal = fees_balance($m);
    return ['ok' => true, 'entryId' => $e['entryId'], 'balance' => $bal,
            /* Surfaced, not enforced: see the note above. */
            'overCap' => !empty($bal['atCap'])];
}

/**
 * Waive part of what is owed. A recorded mercy, not a deletion.
 *
 * This is what voiding was being used for, wrongly. Voiding says "that charge
 * should never have existed"; a waiver says "it existed and we are not asking
 * for it". A family in a hard month needs the second, and a ledger that can only
 * do the first loses the reason the moment somebody edits history to be kind.
 *
 * Clamped to what is actually outstanding, because waiving more than is owed
 * would mint a credit out of nothing and the next month would look prepaid.
 */
function admin_fees_waive(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $reason = trim((string)($p['reason'] ?? ''));
    // No vocabulary here: a waiver is a judgement about one family's month, and
    // a dropdown would flatten the only part of it worth reading later.
    if ($reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $before = fees_balance($m);
    $asked = fees_money($p['amount'] ?? null, 0);
    if ($asked <= 0) return ['ok' => false, 'error' => 'bad_amount'];
    $amount = min($asked, (int)$before['outstanding']);
    if ($amount <= 0) return ['ok' => false, 'error' => 'nothing_outstanding'];
    $by = (string)($g['requester']['memberId'] ?? '');
    $e = fees_post($id, 'waiver', $amount, ['note' => substr($reason, 0, 240), 'by' => $by]);
    if (!$e) return ['ok' => false, 'error' => 'post_failed'];
    audit('fees.waive', $by, $id,
          ['amount' => $amount, 'asked' => $asked, 'reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'entryId' => $e['entryId'], 'waived' => $amount,
            /* Said out loud when less was waived than was typed, rather than
               leaving somebody to wonder why the balance did not reach zero. */
            'clamped' => $amount < $asked, 'balance' => fees_balance($m)];
}

/**
 * Find a member's account by name or ID.
 *
 * The gap this fills: the arrears list only holds people who OWE, and it was the
 * only way into an account. So "has Ada paid?" was unanswerable for anybody who
 * had — the paid-up, the square and the in-credit were all unreachable from the
 * screen. A ledger you can only enter through the debtors' list is a ledger that
 * cannot be checked.
 */
function admin_fees_lookup(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $q = trim((string)($p['q'] ?? ''));
    if (strlen($q) < 2) return ['ok' => true, 'members' => [], 'q' => $q, 'tooShort' => true];
    $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
    $rows = db_all("SELECT * FROM members WHERE status <> 'deleted' AND (fullName LIKE ? OR memberId LIKE ? OR email LIKE ?)
                    ORDER BY fullName LIMIT " . (FEES_LOOKUP_MAX + 1), [$like, $like, $like]);
    $cfg = fees_settings();
    $out = [];
    foreach (array_slice($rows, 0, FEES_LOOKUP_MAX) as $m) {
        $b = fees_balance($m, $cfg);
        $out[] = ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'],
                  'centre' => (string)($m['centre'] ?? ''), 'type' => (string)($m['type'] ?? ''),
                  'status' => (string)($m['status'] ?? ''),
                  /* Both figures: `payable` is what to ask for, `charged` proves
                     an account exists at all for somebody who owes nothing. */
                  'payable' => (int)$b['payable'], 'charged' => (int)$b['charged'],
                  'credited' => (int)$b['credited'], 'phase' => (string)$b['tenure']['phase']];
    }
    return ['ok' => true, 'members' => $out, 'q' => $q,
            'truncated' => count($rows) > FEES_LOOKUP_MAX, 'max' => FEES_LOOKUP_MAX];
}

/**
 * A member's own account, read-only.
 *
 * THE GAP THIS CLOSES. We charge members and email their guardians a figure
 * every fortnight, and the member could not see any of it. Worse: the training
 * fee is written down as they SERVE — the most encouraging number in the whole
 * subsystem — and the person earning it off had no way to watch it happen.
 *
 * Read-only by construction. There is no member-side op that posts, voids or
 * pays anything, and nothing here can change a balance. And it is NGG-only: a
 * summer student is a child on a short programme whose money is their guardian's
 * business, and putting a debt on a child's own screen is the thing this
 * subsystem has refused from the start.
 */
function member_fees_account(array $p): array {
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $cfg = fees_settings();
    /* Switched off, or not this member's kind of membership: answered plainly
       with `enabled: false` rather than an error, so the dashboard simply shows
       nothing instead of an error card about money. */
    if (empty($cfg['enabled']) || (string)($m['type'] ?? '') !== 'NGG') {
        /* Say WHY there is nothing, without leaking amounts, so the dashboard can
           stop rendering a silent void that reads as "broken": an NGG member
           whose org simply has not switched fees on yet gets a plain note and a
           pointer; anyone the feature does not apply to (Summer, card sessions)
           still gets nothing at all. */
        $applies = ((string)($m['type'] ?? '') === 'NGG');
        return ['ok' => true, 'account' => null, 'enabled' => false,
                'reason' => ($applies && empty($cfg['enabled'])) ? 'disabled' : 'not_applicable'];
    }
    $bal = fees_balance($m, $cfg);
    $entries = [];
    foreach (fees_entries($id) as $e) {
        $entries[] = [
            'kind' => (string)$e['kind'], 'direction' => (string)$e['direction'],
            'amount' => (int)$e['amount'], 'note' => (string)$e['note'],
            'createdAt' => (string)$e['createdAt'],
            'void' => trim((string)($e['voidedAt'] ?? '')) !== '',
            /* Deliberately absent: `createdBy`, `voidedBy`, `method`,
               `reference`. Which member of staff posted a row and which bank
               reference cleared it are operational details, not the member's
               record of what they owe. */
        ];
    }
    /* The per-session schedule, which is the thing a member actually wants to
     * see: what each session cost, which ones have already been charged, and
     * which are still to come before the training half ends. Built from the
     * calendar rather than from the ledger alone, so a member three sessions in
     * can see the whole shape of what they signed up to instead of only the
     * part that has already happened. */
    $schedule = [];
    $ten = $bal['tenure'];
    $chargedBySession = [];
    foreach (fees_entries($id) as $e) {
        if ((string)$e['kind'] !== 'training' || trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $chargedBySession[(string)$e['sessionId']] = (int)$e['amount'];
    }
    if ($ten['start'] !== '') {
        $today = gmdate('Y-m-d');
        foreach (db_all('SELECT sessionId, name, startDate FROM sessions ORDER BY startDate') as $s) {
            $sd = substr((string)($s['startDate'] ?? ''), 0, 10);
            if ($sd === '' || $sd < $ten['start']) continue;
            if ($sd >= (string)$ten['trainingEndsAt']) continue;     // past the training half
            $sid = (string)$s['sessionId'];
            $schedule[] = [
                'sessionId' => $sid, 'name' => (string)($s['name'] ?? $sid), 'startDate' => $sd,
                'amount' => $chargedBySession[$sid] ?? (int)$cfg['trainingFee'],
                // 'charged' = already on the account; 'upcoming' = still to come.
                'state' => isset($chargedBySession[$sid]) ? 'charged' : ($sd > $today ? 'upcoming' : 'due'),
            ];
        }
    }

    return ['ok' => true, 'enabled' => true, 'account' => [
        'memberId' => (string)$m['memberId'],
        'trainingFeePerSession' => (int)$cfg['trainingFee'],
        'schedule' => $schedule,
        'payable' => (int)$bal['payable'],
        'outstanding' => (int)$bal['outstanding'],
        'charged' => (int)$bal['charged'],
        'credited' => (int)$bal['credited'],
        'trainingCharged' => (int)$bal['trainingCharged'],
        'trainingEarned' => (int)$bal['trainingEarned'],
        'trainingWrittenOff' => (int)$bal['trainingWrittenOff'],
        'mouAt' => (string)$bal['mouAt'],
        'tenure' => $bal['tenure'],
        'entries' => array_reverse($entries),      // newest first for reading
        'remindOff' => (int)($m['duesRemindOff'] ?? 0) === 1,
        'currency' => (string)$cfg['currency'],
    ]];
}

function admin_fees_void(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
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
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
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
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
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
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    if (empty($cfg['enabled'])) return ['ok' => false, 'error' => 'fees_disabled'];
    $limit = max(1, min(FEES_SCAN_MAX, (int)($p['limit'] ?? FEES_ACCRUE_BATCH)));
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
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    $c = fees_reminder_candidates($cfg, FEES_CANDIDATE_MAX);
    return ['ok' => true, 'preview' => [
        'due' => array_map(fn($x) => ['memberId' => $x['memberId'], 'fullName' => $x['fullName'],
                                      'payable' => $x['payable'], 'lastRemindedAt' => $x['lastRemindedAt']], $c['due']),
        'count' => count($c['due']), 'skipped' => $c['skipped'],
        'everyDays' => $c['everyDays'] ?? 0,
        'enabled' => !empty($cfg['enabled']) && !empty($cfg['remindEnabled']),
    ]];
}

/** What an uprate would do to each amount, and whether one is due. */
function admin_fees_uprate_preview(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    return ['ok' => true, 'uprate' => fees_uprate_preview(), 'maxPct' => FEES_UPRATE_MAX_PCT,
            /* Named so the screen can say what is NOT included. Fines live in the
               policy settings and are not reachable from here; an admin who
               expects them to move with the dues should be told they do not. */
            'fields' => FEES_UPRATE_FIELDS, 'bounds' => fees_bounds()];
}

/** Apply it. Settings only — never a balance already accrued. */
function admin_fees_uprate_apply(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $r = fees_uprate_apply((string)($g['requester']['memberId'] ?? ''));
    if (empty($r['ok'])) return $r;
    return ['ok' => true, 'applied' => $r['applied'], 'pct' => $r['pct'], 'fees' => $r['fees']];
}

/** Send them. Bounded per press, so a mis-click cannot mail an entire roster. */
function admin_fees_remind_run(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    if (empty($cfg['enabled']) || empty($cfg['remindEnabled'])) return ['ok' => false, 'error' => 'reminders_disabled'];
    $r = fees_reminders_run(max(1, min(FEES_REMIND_BATCH_MAX, (int)($p['limit'] ?? FEES_REMIND_BATCH))));
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
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    $limit = max(1, min(FEES_ARREARS_PAGE_MAX, (int)($p['limit'] ?? FEES_ARREARS_PAGE)));
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
