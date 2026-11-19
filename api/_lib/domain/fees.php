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
 *   training     the cost of the training place: a fixed total by default
 *
 * All three amounts are ADMIN-DEFINED. The defaults below are starting points,
 * not policy — ₦300,000 for the three years is the training figure the
 * programme uses today (it was once quoted as ₦75,000 a session), and it lives in
 * a setting precisely so it is not this file's opinion.
 *
 * Each member's training terms — the basis, the rate, the two half lengths —
 * are FROZEN when their account first accrues (fees_freeze_terms). A settings
 * edit, an uprate or a basis switch changes what the next member signs up to
 * and nothing about anybody already on the programme.
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
    /* How often the membership fee comes round, in months. 12 = yearly, on the
       anniversary of joining, which is what the programme charges. Admin-set,
       because a programme that switches to a calendar year or a two-year
       membership should not need a deploy. 0 would mean "once, ever" — the old
       behaviour — and is still reachable by setting it there. */
    'membershipEveryMonths' => 12,
    'monthlyDues'   => 0,
    /* The training figure. What it is PER depends on `trainingBasis`: on the
       default 'total' basis it is the whole fee for the place, charged once. */
    'trainingFee'   => 300000,
    /* What the training fee is charged per.
     *
     *   'total'    ONE charge, for the whole training place, the day the
     *              member starts. The default (29 Oct 2026). The per-session
     *              default it replaced came to ₦450,000 or ₦375,000 by join
     *              date for a fee the programme quotes as ₦300,000.
     *   'session'  one charge per programme session the member is enrolled
     *              through — TONI, MEDI and DOMI. Summer School is not a
     *              training session and is never charged as one.
     *   'day'      one charge per day the programme actually meets, off the
     *              admin's own calendar: the weekdays it runs, its holidays and
     *              its extra days, inside each session's start/end window.
     *
     *   'week'     one charge per week in which the programme meets at least
     *              once — the same calendar as 'day', counted by the week
     *              (Monday to Sunday). For a centre that meets on Saturdays a
     *              week rate and a day rate bill the same days; where the
     *              programme meets several days a week, 'week' charges once.
     *
     * On 'day' the amount is a DAY RATE, on 'week' a WEEK RATE, not a session total. Changing the
     * basis does not touch charges already posted, and a session that already
     * carries a session-level charge is never also charged by the day — see
     * fees_training_days(). */
    'trainingBasis' => 'total',
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
    /* Notices BEFORE a charge falls due (domain/dues-notices.php): the month's
       dues and a membership renewal, `noticeDaysBefore` days ahead, to every
       guardian linked to the child. On by default wherever dues are on — a
       family should hear what is coming before it is owed, not only once it is
       late. The channels are the family's: the family app's inbox, email,
       Telegram (free, where the guardian has connected it) and SMS (paid, off
       by default; tried only when Telegram did not reach them). The same
       channels carry the arrears reminders and the payment-note replies. */
    'noticeEnabled' => true,
    'noticeDaysBefore' => 7,
    'noticeApp' => true,
    'noticeEmail' => true,
    'noticeTelegram' => true,
    'noticeSms' => false,
    /* A payment a parent says they made waits for the fees desk to check it.
       Past this many hours unchecked, the desk is nudged once a day. */
    'claimStaffHours' => 48,
    /* ── Paying online: who bears Paystack's charge ─────────────────────────
     * On by default: a family paying online pays Paystack's charge on top, so
     * NGG receives the whole fee. The charge is grossed up — worked out on the
     * amount Paystack will actually take it from — so what reaches NGG is never
     * short. Paystack's local card terms: 1.5% + ₦100, the ₦100 waived on a
     * transaction under ₦2,500, capped at ₦2,000. Paystack changes these, so
     * they are settings, not constants. A bank transfer to NGG carries none. */
    'payFeeOn' => true,
    'payFeeBps' => 150,          // 1.5% in basis points
    'payFeeFlat' => 100,
    'payFeeFlatUnder' => 2500,
    'payFeeCap' => 2000,
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
/** How far ahead a notice of an upcoming charge may go: a day at the least,
 *  a month at the most — further out, it is news nobody acts on. */
const FEES_NOTICE_DAYS_MIN = 1;
const FEES_NOTICE_DAYS_MAX = 30;
/** When the desk is nudged about payment notes nobody has checked: from half a
 *  day to a week. */
const FEES_CLAIM_HOURS_MIN = 12;
const FEES_CLAIM_HOURS_MAX = 168;
/* Ceilings on the Paystack charge settings: a typo (1500 for 1.5%) must not put 15% on a family's bill. */
const FEES_PAYFEE_BPS_MAX = 500;      // 5%
const FEES_PAYFEE_FLAT_MAX = 1000;
const FEES_PAYFEE_CAP_MAX = 10000;
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
/** The ledger's periodKey column holds this many characters on both databases (migration 220). */
const FEES_PERIODKEY_MAX = 96;
/** A unique-key collision, on SQLite or MySQL — and nothing else. */
function fees_is_duplicate(\Throwable $e): bool {
    $m = strtolower($e->getMessage());
    if (str_contains($m, 'unique constraint') || str_contains($m, 'duplicate entry')) return true;
    $info = $e instanceof \PDOException ? ($e->errorInfo ?? null) : null;
    return is_array($info) && (int)($info[1] ?? 0) === 1062;
}
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
        'noticeDaysMin'  => FEES_NOTICE_DAYS_MIN,
        'noticeDaysMax'  => FEES_NOTICE_DAYS_MAX,
        'claimHoursMin'  => FEES_CLAIM_HOURS_MIN,
        'claimHoursMax'  => FEES_CLAIM_HOURS_MAX,
        'payFeeBpsMax'   => FEES_PAYFEE_BPS_MAX,
        'payFeeFlatMax'  => FEES_PAYFEE_FLAT_MAX,
        'payFeeCapMax'   => FEES_PAYFEE_CAP_MAX,
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

/** What the training fee may be charged per. See FEES_DEFAULTS['trainingBasis']. */
const FEES_TRAINING_BASES = ['total', 'session', 'day', 'week'];
/** The session codes that are not training: Summer School runs in its own
 *  season, and billing it as a fourth training session was one of the ways the
 *  per-session total came to more than the fee. */
const FEES_NON_TRAINING_SESSIONS = ['SUMMER'];

/** A ceiling on how many day-charges one member can pick up in a single accrual
 *  run. Three years of a five-day week is about 780, so this is generous — it
 *  exists so a mistyped session window cannot post ten thousand rows. */
const FEES_TRAINING_DAYS_MAX = 1200;

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
    $cfg = (is_array($cfg) ? $cfg : []) + FEES_DEFAULTS;
    /* The shipped default was ₦75,000 PER SESSION, which nobody chose: it is
       what a deployment that switched fees on without touching the training
       fields still holds. The fee is ₦300,000 for the place, so that exact
       pair reads as the fixed total. Anything an admin actually set — another
       rate, another basis — is theirs and is left alone. */
    if ((string)$cfg['trainingBasis'] === 'session' && (int)$cfg['trainingFee'] === 75000) {
        $cfg['trainingBasis'] = 'total'; $cfg['trainingFee'] = 300000;
    }
    return $cfg;
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
    /* A basis switch carries its own rate, or it is refused. The rate means a
       different thing on each basis — the whole fee, a session, a day, a week —
       and switching ₦75,000 a session to "per day" without touching the figure
       made it ₦75,000 a day: ₦5.25 million, with nothing on the screen to say so. */
    $newBasis = in_array($in['trainingBasis'] ?? null, FEES_TRAINING_BASES, true) ? (string)$in['trainingBasis'] : (string)$cur['trainingBasis'];
    if ($newBasis !== (string)$cur['trainingBasis']
        && fees_money($in['trainingFee'] ?? null, (int)$cur['trainingFee']) === (int)$cur['trainingFee']) {
        return ['ok' => false, 'error' => 'training_rate_required',
                'detail' => 'Changing what the training fee is charged per needs a new amount for it: the old figure was per ' . (string)$cur['trainingBasis'] . '.'];
    }
    $bool = fn(string $k) => array_key_exists($k, $in) ? !empty($in[$k]) : !empty($cur[$k]);
    $phase = fn($v, int $fb) => max(FEES_PHASE_MIN, min(FEES_PHASE_MAX, (int)($v ?? $fb) ?: $fb));
    /* The membership cycle allows 0 — "once, ever" — which $phase's floor would
       silently turn into 1 month, i.e. a monthly membership fee. */
    $cycle = fn($v, int $fb) => $v === null ? $fb : max(0, min(FEES_PHASE_MAX, (int)$v));
    $clean = [
        'enabled'        => $bool('enabled'),
        'currency'       => 'NGN',
        'membershipFee'  => fees_money($in['membershipFee'] ?? null, (int)$cur['membershipFee']),
        'membershipEveryMonths' => $cycle($in['membershipEveryMonths'] ?? null, (int)$cur['membershipEveryMonths']),
        'monthlyDues'    => fees_money($in['monthlyDues'] ?? null, (int)$cur['monthlyDues']),
        'trainingFee'    => fees_money($in['trainingFee'] ?? null, (int)$cur['trainingFee']),
        'trainingBasis'  => in_array($in['trainingBasis'] ?? null, FEES_TRAINING_BASES, true)
            ? (string)$in['trainingBasis'] : (string)$cur['trainingBasis'],
        'trainingMonths' => $phase($in['trainingMonths'] ?? null, (int)$cur['trainingMonths']),
        'serviceMonths'  => $phase($in['serviceMonths'] ?? null, (int)$cur['serviceMonths']),
        'balanceCap'     => fees_money($in['balanceCap'] ?? null, (int)$cur['balanceCap']),
        'remindEnabled'  => $bool('remindEnabled'),
        /* Floored, not just validated. An admin who types 1 gets the floor and is
           told, rather than getting a daily chase that nobody asked to defend. */
        'remindEveryDays' => max(FEES_REMIND_MIN_DAYS, min(FEES_REMIND_MAX_DAYS, (int)($in['remindEveryDays'] ?? $cur['remindEveryDays']) ?: (int)$cur['remindEveryDays'])),
        'remindMinBalance' => fees_money($in['remindMinBalance'] ?? null, (int)$cur['remindMinBalance']),
        'noticeEnabled'  => $bool('noticeEnabled'),
        'noticeDaysBefore' => max(FEES_NOTICE_DAYS_MIN, min(FEES_NOTICE_DAYS_MAX, (int)($in['noticeDaysBefore'] ?? $cur['noticeDaysBefore']) ?: (int)$cur['noticeDaysBefore'])),
        'noticeApp'      => $bool('noticeApp'),
        'noticeEmail'    => $bool('noticeEmail'),
        'noticeTelegram' => $bool('noticeTelegram'),
        'noticeSms'      => $bool('noticeSms'),
        'claimStaffHours' => max(FEES_CLAIM_HOURS_MIN, min(FEES_CLAIM_HOURS_MAX, (int)($in['claimStaffHours'] ?? $cur['claimStaffHours']) ?: (int)$cur['claimStaffHours'])),
        'payFeeOn'        => $bool('payFeeOn'),
        'payFeeBps'       => max(0, min(FEES_PAYFEE_BPS_MAX, (int)($in['payFeeBps'] ?? $cur['payFeeBps']))),
        'payFeeFlat'      => max(0, min(FEES_PAYFEE_FLAT_MAX, (int)($in['payFeeFlat'] ?? $cur['payFeeFlat']))),
        'payFeeFlatUnder' => max(0, min(FEES_PAYFEE_CAP_MAX * 100, (int)($in['payFeeFlatUnder'] ?? $cur['payFeeFlatUnder']))),
        'payFeeCap'       => max(0, min(FEES_PAYFEE_CAP_MAX, (int)($in['payFeeCap'] ?? $cur['payFeeCap']))),
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
    $clean['ok'] = true;
    audit('fees.settings.save', $by, 'fees', [
        'enabled' => $clean['enabled'], 'monthlyDues' => $clean['monthlyDues'],
        'trainingFee' => $clean['trainingFee'], 'membershipFee' => $clean['membershipFee'],
        'trainingBasis' => $clean['trainingBasis'],
        'membershipEveryMonths' => $clean['membershipEveryMonths'],
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

/* ── When a member's status changed ──────────────────────────────────────
 *
 * The write-down is earned by SERVING, and serving needs a date range. Before
 * 29 Oct 2026 nothing recorded when a member's status changed, so a member made
 * inactive at month twenty — who never came back — had the whole fee "covered"
 * by month thirty-six on the calendar alone. member_status_log is that record,
 * written by db_insert()/db_update() whenever a member row's status is written,
 * so no screen that sets a status can forget to.
 *
 * A member with no rows yet (everybody from before it existed) is read as
 * active from their start, then — if they are not active now — in their
 * current status since the row was last updated. That is the best evidence
 * there is, and it is never later than the truth.
 */
const MEMBER_STATUS_LEFT = ['inactive'];
const MEMBER_STATUS_DONE = ['graduated-ngg', 'graduated-vanguard'];

function member_status_start(array $m): string {
    foreach (['joinDate', 'createdAt'] as $k) {
        $d = substr((string)($m[$k] ?? ''), 0, 10);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return $d;
    }
    return gmdate('Y-m-d');
}

function member_status_record(string $memberId, string $status, string $since, string $source): void {
    if ($memberId === '' || $status === '') return;
    try {
        db_insert('member_status_log', ['memberId' => $memberId, 'status' => $status, 'since' => substr($since, 0, 10),
                                        'source' => substr($source, 0, 32), 'recordedAt' => now_iso()]);
    } catch (\Throwable $e) { error_log('[fees] status log: ' . $e->getMessage()); }
}

/** db_insert('members', …) */
function member_status_created(array $row): void {
    $id = (string)($row['memberId'] ?? '');
    if ($id === '') return;
    member_status_record($id, (string)($row['status'] ?? 'active') ?: 'active', member_status_start($row), 'created');
}

/** db_update('members', ['status' => …]) — $before is each row as it was. */
function member_status_changed(array $before, string $status): void {
    $today = gmdate('Y-m-d');
    foreach ($before as $r) {
        $id = (string)($r['memberId'] ?? '');
        $was = (string)($r['status'] ?? '');
        if ($id === '' || $was === $status) continue;
        try { $have = db_row('SELECT id FROM member_status_log WHERE memberId = ? LIMIT 1', [$id]); }
        catch (\Throwable $e) { continue; }
        if (!$have) member_status_record($id, $was !== '' ? $was : 'active', member_status_start($r), 'seed');
        member_status_record($id, $status, $today, 'write');
    }
}

/**
 * A member's statuses as [['status' => …, 'since' => YYYY-MM-DD], …], oldest
 * first. $rows lets a list pass the log it fetched in one query.
 */
function member_status_history(array $member, ?array $rows = null): array {
    if ($rows === null) {
        try { $rows = db_all('SELECT status, since FROM member_status_log WHERE memberId = ? ORDER BY since, id', [(string)($member['memberId'] ?? '')]); }
        catch (\Throwable $e) { $rows = []; }
    }
    if ($rows) return array_map(static fn($r) => ['status' => (string)$r['status'], 'since' => substr((string)$r['since'], 0, 10)], $rows);
    $out = [['status' => 'active', 'since' => member_status_start($member)]];
    $now = (string)($member['status'] ?? 'active');
    if ($now !== '' && $now !== 'active') {
        $at = substr((string)($member['updatedAt'] ?? ''), 0, 10);
        $out[] = ['status' => $now, 'since' => preg_match('/^\d{4}-\d{2}-\d{2}$/', $at) ? $at : gmdate('Y-m-d')];
    }
    return $out;
}

/** The suspensions that were ever in force, as [from, to) day ranges. A
 *  lifted or cleared one ends the day it was lifted; a pending or void one was
 *  never in force. */
function fees_suspension_ranges(array $rows, string $asOf): array {
    $out = [];
    foreach ($rows as $r) {
        if (!in_array((string)($r['status'] ?? ''), ['active', 'cleared', 'lifted'], true)) continue;
        $from = substr((string)($r['startsAt'] ?? ''), 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) continue;
        $to = $asOf;
        $end = substr((string)($r['endsAt'] ?? ''), 0, 10);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $end)) $end = fees_add_days($end, 1);   // endsAt is the last day suspended
        else $end = '';
        $cleared = substr((string)($r['clearedAt'] ?? ''), 0, 10);
        foreach ([$end, (string)($r['status'] ?? '') !== 'active' ? $cleared : ''] as $c) {
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $c) && $c < $to) $to = $c;
        }
        if ($from < $to) $out[] = [$from, $to];
    }
    return $out;
}

function fees_add_days(string $d, int $n): string {
    return gmdate('Y-m-d', (int)strtotime($d . ' 00:00:00 UTC ' . ($n >= 0 ? '+' : '') . $n . ' days'));
}

/**
 * Days from $from to $to (exclusive) the member was SERVING: their status was
 * `active`, no suspension was in force, and they had not been evicted.
 *
 * A suspension is a pause: its days are never counted, during it OR after it
 * is lifted. (Before, the pause only held while the suspension was live — once
 * lifted, the months it covered were counted back in.)
 */
function fees_serving_days(array $history, array $suspensions, string $evictedAt, string $from, string $to): int {
    if ($evictedAt !== '' && $evictedAt < $to) $to = $evictedAt;
    if ($from >= $to) return 0;
    $ranges = [];
    $n = count($history);
    for ($i = 0; $i < $n; $i++) {
        if ($history[$i]['status'] !== 'active') continue;
        $a = max($history[$i]['since'], $from);
        $b = $i + 1 < $n ? min($history[$i + 1]['since'], $to) : $to;
        if ($a < $b) $ranges[] = [$a, $b];
    }
    $days = 0;
    foreach ($ranges as [$a, $b]) {
        $cut = [[$a, $b]];
        foreach ($suspensions as [$sa, $sb]) {
            $next = [];
            foreach ($cut as [$x, $y]) {
                if ($sb <= $x || $sa >= $y) { $next[] = [$x, $y]; continue; }
                if ($sa > $x) $next[] = [$x, $sa];
                if ($sb < $y) $next[] = [$sb, $y];
            }
            $cut = $next;
        }
        foreach ($cut as [$x, $y]) $days += (int)round((strtotime($y . ' UTC') - strtotime($x . ' UTC')) / 86400);
    }
    return $days;
}

/* ── A member's training terms, frozen ─────────────────────────────────── */

/**
 * The basis, rate and half lengths this member's training fee runs on. Frozen
 * terms win; a member not yet frozen reads today's settings (and is frozen at
 * their next accrual, fees_freeze_terms).
 */
function fees_member_terms(array $member, ?array $cfg = null): array {
    $t = json_decode((string)($member['feeTerms'] ?? ''), true);
    if (is_array($t) && in_array($t['basis'] ?? '', FEES_TRAINING_BASES, true)) {
        return ['basis' => (string)$t['basis'], 'rate' => max(0, (int)($t['rate'] ?? 0)),
                'trainingMonths' => max(FEES_PHASE_MIN, (int)($t['trainingMonths'] ?? 18)),
                'serviceMonths' => max(FEES_PHASE_MIN, (int)($t['serviceMonths'] ?? 18)),
                'frozenAt' => (string)($t['frozenAt'] ?? ''), 'frozen' => true];
    }
    $cfg = $cfg ?? fees_settings();
    return ['basis' => in_array((string)$cfg['trainingBasis'], FEES_TRAINING_BASES, true) ? (string)$cfg['trainingBasis'] : 'total',
            'rate' => (int)$cfg['trainingFee'], 'trainingMonths' => (int)$cfg['trainingMonths'],
            'serviceMonths' => (int)$cfg['serviceMonths'], 'frozenAt' => '', 'frozen' => false];
}

/** Freeze today's settings onto a member who has no terms yet. Returns the
 *  member row with them on. Never changes terms already frozen. */
function fees_freeze_terms(array $member, ?array $cfg = null): array {
    $t = fees_member_terms($member, $cfg);
    if ($t['frozen'] || (string)($member['memberId'] ?? '') === '') return $member;
    $json = json_encode(['basis' => $t['basis'], 'rate' => $t['rate'], 'trainingMonths' => $t['trainingMonths'],
                         'serviceMonths' => $t['serviceMonths'], 'frozenAt' => now_iso()], JSON_UNESCAPED_SLASHES);
    db_exec("UPDATE members SET feeTerms = ? WHERE memberId = ? AND COALESCE(feeTerms, '') = ''", [$json, (string)$member['memberId']]);
    $member['feeTerms'] = (string)(db_row('SELECT feeTerms FROM members WHERE memberId = ? LIMIT 1', [(string)$member['memberId']])['feeTerms'] ?? $json);
    return $member;
}

function fees_tenure(array $member, ?array $cfg = null, ?string $asOf = null, ?array $comp = null): array {
    $cfg = $cfg ?? fees_settings();
    /* The half lengths are the MEMBER's, frozen with their terms: changing the
       setting from 18 to 6 months used to move every member's worked-off
       figure overnight. */
    $terms = fees_member_terms($member, $cfg);
    $start = substr((string)($member['joinDate'] ?? ''), 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) $start = substr((string)($member['createdAt'] ?? ''), 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) {
        return ['start' => '', 'months' => 0, 'phase' => 'unknown', 'trainingMonths' => $terms['trainingMonths'],
                'serviceMonths' => $terms['serviceMonths'], 'servedMonths' => 0, 'servedDays' => 0, 'serviceDays' => 0, 'complete' => false,
                'standing' => 'clear', 'creditPausedAt' => '', 'creditStopped' => false, 'terms' => $terms];
    }
    $today = $asOf ?? gmdate('Y-m-d');
    $months = fees_months_between($start, $today);
    $tm = $terms['trainingMonths']; $sm = $terms['serviceMonths'];

    /* Service months are counted to the day the member stopped serving, not to
     * today. A suspension pauses the clock; an eviction stops it. The phase and
     * the elapsed month count are still reported against the real calendar,
     * because "how far through are they" and "how much have they earned" are
     * different questions and a screen showing one as the other is a screen
     * nobody can reconcile. */
    $comp = $comp ?? fees_compliance_cutoff($member);

    /* The training half also ENDS. Kept here so the accrual and the dashboard
     * agree on the last date a session may be charged: without it, training
     * charges carried on for as long as the member stayed enrolled, which is
     * not eighteen months of training, it is forever. */
    $trainingEndsAt = gmdate('Y-m-d', (int)strtotime($start . ' 00:00:00 UTC +' . $tm . ' months'));
    $serviceEndsAt = gmdate('Y-m-d', (int)strtotime($start . ' 00:00:00 UTC +' . ($tm + $sm) . ' months'));

    /* Served = the DAYS of the service half the member was actually serving:
       active, not suspended (ever — a lifted suspension is not credited back),
       not evicted. A member who left stops earning the day they left. */
    $history = isset($comp['history']) ? member_status_history($member, $comp['history']) : member_status_history($member);
    if (isset($comp['suspensions'])) $susp = $comp['suspensions'];
    else {
        try { $susp = db_all("SELECT status, startsAt, endsAt, clearedAt FROM sanctions WHERE personId = ? AND kind = 'suspension'", [(string)($member['memberId'] ?? '')]); }
        catch (\Throwable $e) { $susp = []; }
    }
    $evictedAt = !empty($comp['final']) ? (string)$comp['cutoff'] : '';
    $windowDays = max(1, (int)round((strtotime($serviceEndsAt . ' UTC') - strtotime($trainingEndsAt . ' UTC')) / 86400));
    $servedDays = $today > $trainingEndsAt
        ? fees_serving_days($history, fees_suspension_ranges($susp, $today), $evictedAt, $trainingEndsAt, min($today, $serviceEndsAt))
        : 0;
    $served = min($sm, (int)floor($sm * $servedDays / $windowDays));
    $nowStatus = (string)($member['status'] ?? 'active');

    return [
        'start' => $start, 'months' => $months,
        'phase' => $months < $tm ? 'training' : ($months < $tm + $sm ? 'service' : 'complete'),
        'trainingMonths' => $tm, 'serviceMonths' => $sm,
        'trainingEndsAt' => $trainingEndsAt, 'serviceEndsAt' => $serviceEndsAt,
        'servedMonths' => $served, 'servedDays' => $servedDays, 'serviceDays' => $windowDays,
        'complete' => $months >= $tm + $sm,
        /* Left the programme, as opposed to paused: an inactive member, or one
           evicted. What is not yet earned off becomes theirs to pay. */
        'left' => in_array($nowStatus, MEMBER_STATUS_LEFT, true) || $evictedAt !== '',
        'graduated' => in_array($nowStatus, MEMBER_STATUS_DONE, true),
        'terms' => $terms,
        // Why the write-down is paused or stopped, so a screen can say it.
        'standing' => (string)$comp['state'],
        'creditPausedAt' => ($comp['cutoff'] !== '' && $comp['cutoff'] < $today) ? $comp['cutoff'] : ($nowStatus === 'suspended' ? $today : ''),
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
 * The membership periods a member has reached, as ['key' => …, 'due' => …].
 *
 * Membership renews on the ANNIVERSARY of joining, not on 1 January: a child
 * who joins in November has paid for a year in November, and billing them again
 * six weeks later because the calendar rolled is the kind of thing that ends a
 * family's patience with a programme.
 *
 * `everyMonths` of 0 means the old behaviour — one charge, ever — and is kept
 * reachable because a programme with a joining fee rather than a subscription
 * is a legitimate shape.
 *
 * The key is the period ORDINAL ("y1", "y2"), not the year, so that a change to
 * the cycle length cannot make a period a member has already been charged for
 * look like one they have not.
 */
function fees_membership_periods(string $start, string $upto, int $everyMonths): array {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) return [];
    if ($everyMonths <= 0) return [['key' => 'once', 'due' => $start]];
    $out = [];
    for ($n = 0; $n < FEES_DUE_MONTHS_MAX; $n++) {
        $due = gmdate('Y-m-d', (int)strtotime($start . ' 00:00:00 UTC +' . ($n * $everyMonths) . ' months'));
        if ($due > $upto) break;
        $out[] = ['key' => 'y' . ($n + 1), 'due' => $due];
    }
    return $out;
}

/**
 * The weeks a member is charged the training fee for, when the basis is 'week':
 * every Monday-to-Sunday week holding at least one programme day, inside the
 * same bounds as fees_training_days(). Keyed `<sessionId>:W<monday>`.
 *
 * A week already carrying a DAY charge (the basis was 'day' before) is not
 * charged again by the week — switching basis must never bill one week twice.
 *
 * @return array<string,string> periodKey => that week's Monday
 */
function fees_training_weeks(string $memberId, array $ten, ?string $asOf = null): array {
    $out = [];
    foreach (fees_training_days($memberId, $ten, $asOf) as $key => $day) {
        $sid = explode(':', $key)[0];
        $t = strtotime($day . ' 00:00:00 UTC');
        $monday = gmdate('Y-m-d', $t - ((int)gmdate('N', $t) - 1) * 86400);
        $wk = $sid . ':W' . $monday;
        if (isset($out[$wk])) continue;
        $sunday = gmdate('Y-m-d', strtotime($monday . ' UTC') + 6 * 86400);
        $dayCharged = db_row("SELECT id FROM member_ledger WHERE memberId = ? AND kind = 'training' AND periodKey >= ? AND periodKey <= ? LIMIT 1",
                             [$memberId, $sid . ':' . $monday, $sid . ':' . $sunday]);
        if ($dayCharged) continue;
        $out[$wk] = $monday;
    }
    return $out;
}

/**
 * The days a member is charged the training fee for, when the basis is 'day'.
 *
 * "Each day they come" is the admin's calendar, not the attendance register:
 * `memberProgramme` holds the weekdays the programme meets, its holidays and
 * its extra days, and each session holds the window. Charging off attendance
 * instead would make missing a day cheaper than turning up, which is not what
 * a training fee is for.
 *
 * Bounded on three sides — the member joined, the training half ends, and the
 * day has actually happened — so nothing is charged for a session on next
 * year's calendar or for a member who left in the middle of one.
 *
 * @return array<string,string> periodKey => the date, for fees_post
 */
function fees_training_days(string $memberId, array $ten, ?string $asOf = null): array {
    if (!function_exists('programme_days_between')) return [];
    $today = $asOf ?? gmdate('Y-m-d');
    // The member's own centre's days, on the shared calendar's holidays.
    $cal = function_exists('member_calendar_for') ? member_calendar_for(db_row('SELECT centre FROM members WHERE memberId = ? LIMIT 1', [$memberId])) : null;
    /* An unconfigured calendar answers TRUE for every date, which would charge
       for Sundays and public holidays alike. A day rate needs a real calendar,
       so with none set nothing is charged and the accrual says why. */
    if (!$cal || empty($cal['enabled'])) return [];

    $trainingEnds = (string)($ten['trainingEndsAt'] ?? '');
    $out = [];
    foreach (db_all('SELECT sessionId, startDate, endDate FROM sessions ORDER BY startDate') as $sess) {
        $sid = (string)$sess['sessionId'];
        $from = substr((string)($sess['startDate'] ?? ''), 0, 10);
        $to   = substr((string)($sess['endDate'] ?? ''), 0, 10);
        if ($from === '') continue;
        if ($to === '' || $to > $today) $to = $today;                       // not yet happened
        if ($trainingEnds !== '' && $to >= $trainingEnds) $to = gmdate('Y-m-d', (int)strtotime($trainingEnds . ' -1 day'));
        if ($from < $ten['start']) $from = $ten['start'];                    // before they joined
        if ($from > $to) continue;

        /* A session already charged as a whole is never also charged by the
           day. Switching the basis mid-programme must not re-bill a family for
           a session they have already been invoiced for. */
        if (db_row("SELECT id FROM member_ledger WHERE memberId = ? AND kind = 'training' AND periodKey = ? LIMIT 1", [$memberId, $sid])) continue;

        // The SESSION gives the window; the calendar gives weekdays and holidays.
        // Restricting to the calendar's own window as well charged nothing for
        // every term but the one the calendar happened to hold.
        foreach (programme_days_between($from, $to, array_merge($cal, ['startDate' => $from, 'endDate' => $to, 'sessionWindows' => null])) as $day) {
            $out[$sid . ':' . $day] = $day;
            if (count($out) >= FEES_TRAINING_DAYS_MAX) return $out;
        }
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
    /* A fine falls under a Club conduct rule (domain/club-portal.php): a rule
       that is off posts nothing, and a capped rule never goes over its cap per
       term — whichever desk, import or policy run the fine came from. */
    if ($kind === 'fine' && function_exists('conduct_rule_allow')) {
        $amount = conduct_rule_allow($memberId, $amount, $opts);
        if ($amount <= 0) return null;
    }
    $periodKey = (string)($opts['periodKey'] ?? '');
    /* A credit with no period key would collide with the next one under the
       unique index — two payments in the same month are two real events. Give
       each its own key unless the caller pinned one deliberately. */
    if ($periodKey === '') $periodKey = $kind . ':' . bin2hex(random_bytes(6));
    /* A key longer than the column is shortened HERE, the same way on both
       databases: kept readable and made unique by a hash of the whole key.
       MySQL's column was VARCHAR(32) while keys of 38–52 characters were
       written (the fresh-start waiver, the membership import): strict MySQL
       refused them and non-strict truncated them into one another. */
    if (strlen($periodKey) > FEES_PERIODKEY_MAX) $periodKey = substr($periodKey, 0, FEES_PERIODKEY_MAX - 13) . '#' . substr(md5($periodKey), 0, 12);
    $row = [
        'entryId' => 'FEE-' . strtoupper(bin2hex(random_bytes(6))),
        'memberId' => $memberId, 'kind' => $kind,
        'direction' => $isCharge ? 'charge' : 'credit',
        'amount' => min(FEES_AMOUNT_MAX, $amount),
        'periodKey' => $periodKey,
        'sessionId' => (string)($opts['sessionId'] ?? ''),
        /* By characters, never bytes: a byte cut through "—", "₦" or a Yoruba
           diacritic leaves invalid UTF-8, which strict MySQL refuses (1366) —
           the fine or payment was then never posted. SQLite took it. */
        'note' => mb_strcut((string)($opts['note'] ?? ''), 0, 240, 'UTF-8'),
        'method' => mb_strcut((string)($opts['method'] ?? ''), 0, 32, 'UTF-8'),
        'reference' => mb_strcut((string)($opts['reference'] ?? ''), 0, FEES_REF_MAX, 'UTF-8'),
        'createdAt' => now_iso(), 'createdBy' => (string)($opts['by'] ?? ''),
    ];
    /* A credit may name the charges it pays (fees_allocate). Only this member's live charges are kept, so a
       name that does not exist, or someone else's, simply falls to the oldest-first pool. */
    if ($isCredit && !empty($opts['appliesTo']) && is_array($opts['appliesTo'])) {
        $want = array_values(array_unique(array_filter(array_map(static fn($x) => trim((string)$x), $opts['appliesTo']))));
        if ($want) {
            $ph = implode(',', array_fill(0, count($want), '?'));
            $ok = array_column(db_all("SELECT entryId FROM member_ledger WHERE memberId = ? AND direction = 'charge' AND COALESCE(voidedAt, '') = '' AND entryId IN ($ph)", array_merge([$memberId], $want)), 'entryId');
            $keep = array_values(array_filter($want, static fn($x) => in_array($x, $ok, true)));   // in the order asked
            if ($keep) $row['appliesTo'] = json_encode(array_slice($keep, 0, 50));
        }
    }
    try {
        db_insert('member_ledger', $row);
    } catch (Throwable $e) {
        /* Only a DUPLICATE KEY means "already posted for this period" — the
           desired state. Anything else (a lock timeout, a value the column
           refused) is a failure and is said to be one: it used to be read as
           "already posted", so an entry that never landed was reported as done. */
        if (!fees_is_duplicate($e)) {
            error_log('[fees_post] ' . $memberId . ' ' . $kind . ' ' . $periodKey . ': ' . $e->getMessage());
            return null;
        }
        $have = db_row('SELECT * FROM member_ledger WHERE memberId = ? AND kind = ? AND periodKey = ? LIMIT 1',
            [$memberId, $kind, $periodKey]);
        /* A VOIDED row under the key is not "already posted". For most kinds it
           stays void on purpose — a dues month voided by the desk must not be
           re-charged by the next accrual. But a sanction that is lifted and
           later issued again (an overturned suspension, the same tier crossed
           again) must owe again: returning the void row reported the fine as
           posted while the account charged ₦0, and a re-entry fee then held a
           child at the door with nothing to pay. The caller asks for that with
           `reissue`; the row is reinstated (the key is how four readers find a
           sanction's charge) and the void it replaces is kept in the audit log. */
        if ($have && !empty($opts['reissue']) && trim((string)($have['voidedAt'] ?? '')) !== '') {
            $n = db_exec("UPDATE member_ledger SET voidedAt = '', voidedBy = '', voidReason = '', amount = ?, note = ?, createdAt = ?, createdBy = ?
                           WHERE id = ? AND COALESCE(voidedAt, '') <> ''", [$row['amount'], $row['note'], $row['createdAt'], $row['createdBy'], $have['id']]);
            if ($n) {
                audit('fees.reissue', $row['createdBy'], $memberId, ['entryId' => $have['entryId'], 'periodKey' => $periodKey, 'amount' => $row['amount'],
                    'was' => ['amount' => (int)$have['amount'], 'voidedAt' => (string)$have['voidedAt'], 'voidedBy' => (string)($have['voidedBy'] ?? ''), 'voidReason' => (string)($have['voidReason'] ?? '')]], '');
                return db_row('SELECT * FROM member_ledger WHERE id = ?', [$have['id']]);
            }
        }
        return $have ?: null;
    }
    /* Money in may settle policy fines — a settled re-entry fee is what lets a
       suspended child back through the door — asked here, where every
       payment and waiver passes, so no desk can forget to. */
    if ($isCredit && function_exists('policy_fines_sync')) {
        try { policy_fines_sync($memberId); } catch (Throwable $e) { error_log('[fees_post] fines sync: ' . $e->getMessage()); }
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
function fees_balance(array $member, ?array $cfg = null, ?string $asOf = null, ?array $entries = null, ?array $comp = null): array {
    $cfg = $cfg ?? fees_settings();
    $memberId = (string)($member['memberId'] ?? '');
    $charged = 0; $credited = 0; $byKind = [];
    $trainingCharged = 0; $trainingWritten = 0; $trainingCapped = 0;
    /* `$entries` and `$comp` let a list pass what it already fetched in one
       query, so a roster of three hundred is not three hundred ledger reads. */
    $entries = $entries ?? fees_entries($memberId);
    foreach ($entries as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $amt = (int)$e['amount']; $kind = (string)$e['kind'];
        $byKind[$kind] = ($byKind[$kind] ?? 0) + $amt;
        if ((string)$e['direction'] === 'charge') {
            $charged += $amt;
            if ($kind === 'training') $trainingCharged += $amt;
        } else {
            $credited += $amt;
            /* The cap on a fixed total (fees_accrue_member) is not a write-off
               anybody earned: it takes back what was charged above the fee. */
            if ($kind === 'writeoff' && str_starts_with((string)($e['periodKey'] ?? ''), 'cap:training')) $trainingCapped += $amt;
            elseif ($kind === 'writeoff') $trainingWritten += $amt;
        }
    }
    $trainingCharged -= min($trainingCharged, $trainingCapped);
    $ten = fees_tenure($member, $cfg, $asOf, $comp);
    /* "Deducts as they come": the share of the training fee that service has
       earned off so far. Straight-line across the service half — the simplest
       rule that is also explainable to a family, which matters more here than
       precision. A completed MOU earns the whole of it. */
    /* By DAYS served, not calendar months: a member who stopped serving
       stopped earning (fees_tenure). Graduating is completing. */
    $mou = trim((string)($member['mouAt'] ?? '')) !== '' || !empty($ten['graduated']);
    $earnedPct = $mou ? 1.0
        : ((int)($ten['serviceDays'] ?? 0) > 0 ? min(1.0, (int)$ten['servedDays'] / (int)$ten['serviceDays']) : 0.0);
    $earned = (int)floor(max(0, $trainingCharged - $trainingWritten) * $earnedPct);
    $covered = min($trainingCharged, $earned + $trainingWritten);
    /* "A family who leaves before the MOU is complete will owe the balance."
       That was the rule in this file's own header, and nothing ever made it
       payable. Left (inactive, or evicted) and not completed: what service had
       not yet earned off is real money now. A pause (suspended) owes nothing. */
    $trainingOwed = (!$mou && !empty($ten['left'])) ? max(0, $trainingCharged - $covered) : 0;
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
    foreach ($entries as $e) {
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
    $payable = max(0, $realCharged - $realCredited) + $trainingOwed;

    /* The ceiling is on REAL money. The training fee is notional while they
       serve, and counting it stopped real dues being charged once it alone
       (₦450,000 on the old default) filled most of a ₦500,000 ceiling. */
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
        'programmeCovered' => $covered,
        'trainingCharged' => $trainingCharged, 'trainingWrittenOff' => $trainingWritten,
        'trainingEarned' => $earned, 'trainingOwed' => $trainingOwed, 'trainingCapped' => $trainingCapped,
        'byKind' => $byKind,
        'cap' => $cap, 'atCap' => $cap > 0 && max(0, $realCharged - $realCredited) >= $cap,
        'tenure' => $ten, 'mouAt' => (string)($member['mouAt'] ?? ''),
    ];
}

/* ── The training-fee watch ──────────────────────────────────────────────
 *
 * One answer to "where is this member's training fee", read by the member's
 * own account panel, by the account drawer in the Control Room and by the
 * programme-wide watch. It used to be built inline in member_fees_account()
 * from the `sessions` table alone, so on a day or week basis the member saw a
 * session list that bore no relation to what was being charged, and staff saw
 * no schedule at all. Now there is one builder, it knows all three bases, and
 * every screen draws the same rows.
 *
 * Rows are the charges ALREADY on the account (from the ledger, so a voided
 * charge is gone and a renamed session keeps the name it was charged under),
 * then what has happened but not been charged yet (`due` — the next accrual
 * run picks it up), then what is still to come before the training half ends
 * (`upcoming`). For a day or week rate "still to come" is only as far as the
 * meeting calendar is set; the count says so rather than guessing.
 */
const FEES_WATCH_UPCOMING_MAX = 24;
const FEES_WATCH_ROWS_MAX = 400;
const FEES_TRAINING_UNIT = ['total' => 'programme', 'session' => 'session', 'day' => 'day', 'week' => 'week'];

function fees_training_watch(array $member, ?array $cfg = null, ?array $bal = null, ?string $asOf = null): array {
    $cfg = $cfg ?? fees_settings();
    $bal = $bal ?? fees_balance($member, $cfg, $asOf);
    $ten = $bal['tenure'];
    /* The member's own terms, not today's settings: what they signed up to. */
    $terms = $ten['terms'] ?? fees_member_terms($member, $cfg);
    $basis = $terms['basis'];
    $fee = (int)$terms['rate'];
    $today = $asOf ?? gmdate('Y-m-d');
    $mid = (string)$member['memberId'];
    $rows = []; $chargedKeys = [];
    // A session charge is dated by its session, not by the night the accrual ran.
    $sessStart = array_column(db_all('SELECT sessionId, startDate FROM sessions'), 'startDate', 'sessionId');
    foreach (db_all("SELECT periodKey, sessionId, note, amount, createdAt FROM member_ledger
                      WHERE memberId = ? AND kind = 'training' AND direction = 'charge' AND (voidedAt IS NULL OR voidedAt = '') ORDER BY id", [$mid]) as $e) {
        $key = (string)$e['periodKey'];
        $chargedKeys[$key] = true;
        $date = preg_match('/:(?:W)?(\d{4}-\d{2}-\d{2})$/', $key, $mm) ? $mm[1]
              : (isset($sessStart[$key]) && (string)$sessStart[$key] !== '' ? substr((string)$sessStart[$key], 0, 10) : substr((string)$e['createdAt'], 0, 10));
        $rows[] = ['key' => $key, 'label' => (string)$e['note'] !== '' ? (string)$e['note'] : 'Training', 'date' => $date, 'amount' => (int)$e['amount'], 'state' => 'charged'];
    }
    $due = []; $upcoming = []; $upcomingCount = 0;
    if ($fee > 0 && $basis === 'total' && $ten['start'] !== '') {
        // One charge for the place; until the accrual posts it, it is due.
        $left = $fee - (int)$bal['trainingCharged'];
        if ($left > 0) $due[] = ['key' => 'total', 'label' => 'Training fee — the place, for the whole programme',
                                 'date' => (string)$ten['start'], 'amount' => $left, 'state' => 'due'];
    } elseif ($fee > 0 && $ten['start'] !== '' && $ten['phase'] === 'training') {
        $ends = (string)($ten['trainingEndsAt'] ?? '');
        if ($basis === 'session') {
            foreach (db_all('SELECT sessionId, code, name, startDate FROM sessions ORDER BY startDate') as $sx) {
                if (in_array(strtoupper((string)($sx['code'] ?? '')), FEES_NON_TRAINING_SESSIONS, true)) continue;
                $sd = substr((string)($sx['startDate'] ?? ''), 0, 10);
                $sid = (string)$sx['sessionId'];
                if ($sd === '' || $sd < $ten['start'] || ($ends !== '' && $sd >= $ends) || isset($chargedKeys[$sid])) continue;
                $r = ['key' => $sid, 'label' => (string)($sx['name'] ?: $sid), 'date' => $sd, 'amount' => $fee];
                if ($sd <= $today) $due[] = $r + ['state' => 'due'];
                else { $upcomingCount++; if (count($upcoming) < FEES_WATCH_UPCOMING_MAX) $upcoming[] = $r + ['state' => 'upcoming']; }
            }
        } else {
            $happened = $basis === 'week' ? fees_training_weeks($mid, $ten, $today) : fees_training_days($mid, $ten, $today);
            foreach ($happened as $key => $d) if (!isset($chargedKeys[$key])) {
                $due[] = ['key' => $key, 'label' => $basis === 'week' ? 'Week of ' . $d : 'Training day', 'date' => $d, 'amount' => $fee, 'state' => 'due'];
            }
            // Still to come: the member's own meeting days from tomorrow to the
            // end of the training half, as far as the calendar is set.
            $cal = function_exists('member_calendar_for') ? member_calendar_for($member) : ['enabled' => false];
            if (!empty($cal['enabled']) && function_exists('programme_days_between')) {
                $from = gmdate('Y-m-d', (int)strtotime($today . ' 00:00:00 UTC +1 day'));
                $to = $ends !== '' ? gmdate('Y-m-d', (int)strtotime($ends . ' 00:00:00 UTC -1 day')) : '';
                $calEnd = (string)($cal['endDate'] ?? '');
                if ($calEnd !== '' && ($to === '' || $calEnd < $to)) $to = $calEnd;
                $seen = [];
                if ($to !== '' && $from <= $to) foreach (programme_days_between($from, $to, $cal) as $d) {
                    if ($basis === 'week') {
                        $t = strtotime($d . ' 00:00:00 UTC');
                        $d = gmdate('Y-m-d', $t - ((int)gmdate('N', $t) - 1) * 86400);
                        if (isset($seen[$d])) continue;
                        $seen[$d] = true;
                    }
                    $upcomingCount++;
                    if (count($upcoming) < FEES_WATCH_UPCOMING_MAX) $upcoming[] = ['key' => 'next:' . $d, 'label' => $basis === 'week' ? 'Week of ' . $d : 'Training day', 'date' => $d, 'amount' => $fee, 'state' => 'upcoming'];
                }
            }
        }
    }
    $chargedCount = count($rows);
    $dueAmount = array_sum(array_column($due, 'amount'));
    $all = array_merge($rows, $due, $upcoming);
    if (count($all) > FEES_WATCH_ROWS_MAX) $all = array_slice($all, -FEES_WATCH_ROWS_MAX);
    return [
        'basis' => $basis, 'unit' => FEES_TRAINING_UNIT[$basis], 'perUnit' => $fee,
        'termsFrozen' => !empty($terms['frozen']), 'termsFrozenAt' => (string)($terms['frozenAt'] ?? ''),
        'charged' => $chargedCount, 'due' => count($due), 'upcoming' => $upcomingCount,
        'chargedAmount' => (int)$bal['trainingCharged'],
        'dueAmount' => $dueAmount, 'upcomingAmount' => $upcomingCount * $fee,
        /* The whole cost of the place, as far as it can be known: the fixed
           total, or what is charged, due and still to come on a per-unit basis.
           This — never the per-unit rate — is the "training fee" a member sees. */
        'total' => $basis === 'total' ? max($fee, (int)$bal['trainingCharged']) : (int)$bal['trainingCharged'] + $dueAmount + $upcomingCount * $fee,
        'owed' => (int)($bal['trainingOwed'] ?? 0), 'left' => !empty($ten['left']),
        'earnedOff' => (int)$bal['trainingEarned'], 'writtenOff' => (int)$bal['trainingWrittenOff'],
        'covered' => (int)$bal['programmeCovered'],
        'coveredPct' => (int)$bal['trainingCharged'] > 0 ? (int)floor(100 * (int)$bal['programmeCovered'] / (int)$bal['trainingCharged']) : 0,
        'calendarKnown' => $basis === 'session' || $upcomingCount > 0 || $ten['phase'] !== 'training',
        'phase' => (string)$ten['phase'], 'months' => (int)$ten['months'],
        'trainingMonths' => (int)$ten['trainingMonths'], 'serviceMonths' => (int)$ten['serviceMonths'],
        'servedMonths' => (int)$ten['servedMonths'], 'trainingEndsAt' => (string)($ten['trainingEndsAt'] ?? ''),
        'creditStopped' => !empty($ten['creditStopped']), 'creditPausedAt' => (string)($ten['creditPausedAt'] ?? ''),
        'mouAt' => (string)$bal['mouAt'],
        'rows' => $all,
    ];
}

/**
 * admin.fees.training — the training fee across the whole programme, one row
 * per NGG member who has one: how much has been charged, how much service has
 * earned off, what is waiting to be charged, and whether the credit is paused
 * or stopped. Built from three queries however long the roster is (members,
 * their ledger rows, their live suspension/eviction sanctions) — the per-row
 * fees_balance() the account drawer uses would be a read per member.
 *
 * Filtered and sorted by allow-listed names; an unknown value falls back to
 * the default rather than erroring, so a stale bookmark still shows the list.
 */
const FEES_TRAINING_FILTERS = ['all', 'training', 'service', 'complete', 'stopped', 'paused', 'owed', 'nojoin'];
const FEES_TRAINING_SORTS = ['charged', 'earned', 'remaining', 'name', 'month'];
function admin_fees_training(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    $filter = in_array($p['filter'] ?? '', FEES_TRAINING_FILTERS, true) ? (string)$p['filter'] : 'all';
    $sort = in_array($p['sort'] ?? '', FEES_TRAINING_SORTS, true) ? (string)$p['sort'] : 'charged';
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $limit = (int)($p['limit'] ?? 0) > 0 ? min(FEES_ARREARS_PAGE_MAX, (int)$p['limit']) : FEES_ARREARS_PAGE;   // '' from the route is the default, not one row
    $scope = admin_centre_names_in_scope($g['requester']);
    /* Inactive members too: a leaver who owes the rest of the fee is exactly
       who this list has to show. */
    $members = array_values(array_filter(db_all("SELECT * FROM members WHERE status IN ('active','suspended','inactive') AND COALESCE(type,'NGG') <> 'Summer'"),
        static fn($m) => member_is_ngg($m) && ($scope === null || in_array((string)($m['centre'] ?? ''), $scope, true))));
    $out = []; $totals = ['charged' => 0, 'earned' => 0, 'writtenOff' => 0, 'remaining' => 0, 'members' => 0];
    $counts = array_fill_keys(FEES_TRAINING_FILTERS, 0);
    foreach (array_chunk($members, 400) as $chunk) {
        $ids = array_map(static fn($m) => (string)$m['memberId'], $chunk);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $ledger = [];
        foreach (db_all("SELECT * FROM member_ledger WHERE memberId IN ($ph) ORDER BY id", $ids) as $e) $ledger[(string)$e['memberId']][] = $e;
        $compOf = fees_comp_batch($ids);
        foreach ($chunk as $m) {
            $mid = (string)$m['memberId'];
            $b = fees_balance($m, $cfg, null, $ledger[$mid] ?? [], $compOf[$mid]);
            $t = $b['tenure'];
            $units = 0;
            foreach ($ledger[$mid] ?? [] as $e) if ((string)$e['kind'] === 'training' && (string)$e['direction'] === 'charge' && trim((string)($e['voidedAt'] ?? '')) === '') $units++;
            /* Listed: anybody carrying a training charge, and a member in their
               training months who will be. A staff account with no charge is
               not on a training programme. */
            if ($units === 0 && ($t['phase'] !== 'training' || is_admin_role((string)($m['role'] ?? '')))) continue;
            $remaining = max(0, (int)$b['trainingCharged'] - (int)$b['programmeCovered']);
            $tags = [$t['phase'] === 'unknown' ? 'nojoin' : $t['phase']];
            if ((int)$b['trainingOwed'] > 0) $tags[] = 'owed';
            if ($units === 0 && (string)$m['status'] !== 'active') continue;
            if (!empty($t['creditStopped'])) $tags[] = 'stopped';
            elseif ((string)($t['creditPausedAt'] ?? '') !== '') $tags[] = 'paused';
            $counts['all']++; foreach ($tags as $tg) if (isset($counts[$tg])) $counts[$tg]++;
            if ($filter !== 'all' && !in_array($filter, $tags, true)) continue;
            if ($q !== '' && !str_contains(mb_strtolower($m['fullName'] . ' ' . ($m['displayId'] ?? '') . ' ' . $mid . ' ' . ($m['centre'] ?? '')), $q)) continue;
            $totals['charged'] += (int)$b['trainingCharged']; $totals['earned'] += (int)$b['trainingEarned'];
            $totals['writtenOff'] += (int)$b['trainingWrittenOff']; $totals['remaining'] += $remaining; $totals['members']++;
            $out[] = ['memberId' => $mid, 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? ''),
                      'units' => $units, 'charged' => (int)$b['trainingCharged'], 'earned' => (int)$b['trainingEarned'],
                      'writtenOff' => (int)$b['trainingWrittenOff'], 'covered' => (int)$b['programmeCovered'], 'remaining' => $remaining,
                      'owed' => (int)$b['trainingOwed'], 'status' => (string)$m['status'], 'basis' => (string)$t['terms']['basis'],
                      'coveredPct' => (int)$b['trainingCharged'] > 0 ? (int)floor(100 * (int)$b['programmeCovered'] / (int)$b['trainingCharged']) : 0,
                      'phase' => (string)$t['phase'], 'months' => (int)$t['months'], 'servedMonths' => (int)$t['servedMonths'],
                      'trainingEndsAt' => (string)($t['trainingEndsAt'] ?? ''), 'mouAt' => (string)$b['mouAt'],
                      'creditStopped' => !empty($t['creditStopped']), 'creditPausedAt' => (string)($t['creditPausedAt'] ?? '')];
        }
    }
    $by = ['charged' => static fn($a, $b) => $b['charged'] <=> $a['charged'], 'earned' => static fn($a, $b) => $b['earned'] <=> $a['earned'],
           'remaining' => static fn($a, $b) => $b['remaining'] <=> $a['remaining'], 'name' => static fn($a, $b) => strcasecmp($a['fullName'], $b['fullName']),
           'month' => static fn($a, $b) => $b['months'] <=> $a['months']];
    usort($out, $by[$sort]);
    $matched = count($out);
    return ['ok' => true, 'rows' => array_slice($out, 0, $limit), 'matched' => $matched, 'truncated' => $matched > $limit,
            'totals' => $totals, 'counts' => $counts, 'filter' => $filter, 'sort' => $sort, 'scoped' => $scope !== null,
            'basis' => (string)$cfg['trainingBasis'], 'perUnit' => (int)$cfg['trainingFee'],
            'trainingMonths' => (int)$cfg['trainingMonths'], 'serviceMonths' => (int)$cfg['serviceMonths']];
}

/** Was the member ACTIVE on any day in [from, to)? From their status history (member_status_history), oldest first. */
function fees_active_between(array $hist, string $from, string $to): bool {
    $n = count($hist);
    for ($i = 0; $i < $n; $i++) {
        if ((string)$hist[$i]['status'] !== 'active') continue;
        $a = (string)$hist[$i]['since'];
        $b = $hist[$i + 1]['since'] ?? '9999-12-31';
        if ($a < $to && $b > $from) return true;
    }
    return false;
}

/**
 * The next batch of NGG members to bring up to date, from where the last run
 * stopped, wrapping round at the end. Both doors (the nightly tick and the
 * button) used `ORDER BY id LIMIT N` with no cursor, so a programme with more
 * members than one batch never reached the rest — its docblock said they were
 * "caught up over successive ticks", and they were not.
 */
function fees_accrue_batch(int $limit, array $cfg): array {
    $after = (int)(setting_raw('fees_accrue_cursor') ?? 0);
    $rows = db_all("SELECT * FROM members WHERE status = 'active' AND (type IS NULL OR type <> 'Summer') AND id > ? ORDER BY id LIMIT " . $limit, [$after]);
    $tot = ['members' => 0, 'membership' => 0, 'dues' => 0, 'training' => 0, 'atCap' => 0, 'noJoinDate' => 0, 'wrapped' => count($rows) < $limit];
    foreach ($rows as $m) {
        $r = fees_accrue_member($m, $cfg);
        $tot['members']++;
        $tot['membership'] += $r['membership']; $tot['dues'] += $r['dues']; $tot['training'] += $r['training'];
        if ($r['skipped'] === 'at_cap') $tot['atCap']++;
        if ($r['skipped'] === 'no_join_date') $tot['noJoinDate']++;
    }
    // Past the end: the next run starts from the beginning again.
    setting_set('fees_accrue_cursor', $tot['wrapped'] ? 0 : (int)end($rows)['id'], 'accrual');
    return $tot;
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
    /* NGG members only. A Summer School participant converted to an account is an
       `active` member row with a join date (admin2.php), and the nightly run used to
       charge them membership, dues and a training place they never took. */
    if (function_exists('member_is_ngg') && !member_is_ngg($member)) { $out['skipped'] = 'not_ngg'; return $out; }
    if ((string)($member['status'] ?? 'active') !== 'active') { $out['skipped'] = 'not_active'; return $out; }
    $memberId = (string)$member['memberId'];
    /* The terms this member's training place runs on, fixed the first time
       their account accrues: later edits are for later members. */
    $member = fees_freeze_terms($member, $cfg);
    $terms = fees_member_terms($member, $cfg);
    $ten = fees_tenure($member, $cfg, $asOf);
    if ($ten['start'] === '') { $out['skipped'] = 'no_join_date'; return $out; }
    $bal = fees_balance($member, $cfg, $asOf);
    if (!empty($bal['atCap'])) { $out['skipped'] = 'at_cap'; return $out; }
    /* The ceiling is checked before EVERY posting, not once before the run: a member
       just under it with a backlog used to have every month posted past it. */
    $owed = max(0, (int)$bal['realCharged'] - (int)$bal['realCredited']);
    $cap = (int)($bal['cap'] ?? 0);
    $room = static function (int $amt) use (&$owed, $cap): bool { return $cap <= 0 || $owed + $amt <= $cap; };
    /* Only periods the member was ACTIVE in. The loops walk from the start date to
       today and the run used to check only today's status, so a member away for six
       months was charged all six on return. member_status_log is the record. */
    $hist = member_status_history($member);
    $activeIn = static fn(string $from, string $to): bool => fees_active_between($hist, $from, $to);

    /* Membership renews on the anniversary of joining. The 'once' key from the
       one-off era is still what a 0-month cycle posts, so a deployment that
       never wanted a subscription keeps exactly the row it already has. */
    // Settled up to a date (recorded before that tool was retired): nothing on or before it is charged again.
    $settled = substr(trim((string)($member['feesSettledThrough'] ?? '')), 0, 10);
    if ((int)$cfg['membershipFee'] > 0) {
        foreach (fees_membership_periods($ten['start'], $asOf ?? gmdate('Y-m-d'), (int)$cfg['membershipEveryMonths']) as $per) {
            if ($settled !== '' && (string)$per['due'] <= $settled) continue;
            $every = max(1, (int)$cfg['membershipEveryMonths']);
            $end = $per['key'] === 'once' ? fees_add_days((string)$per['due'], 1) : gmdate('Y-m-d', (int)strtotime($per['due'] . ' 00:00:00 UTC +' . $every . ' months'));
            if (!$activeIn((string)$per['due'], $end)) continue;
            if (!$room((int)$cfg['membershipFee'])) { $out['skipped'] = 'at_cap'; break; }
            $label = $per['key'] === 'once' ? 'Membership fee'
                : 'Membership fee — year ' . substr($per['key'], 1) . ' from ' . $per['due'];
            if (fees_post($memberId, 'membership', (int)$cfg['membershipFee'],
                          ['periodKey' => $per['key'], 'note' => $label, 'by' => 'accrual'])) {
                $out['membership']++; $owed += (int)$cfg['membershipFee'];
            }
        }
    }
    if ((int)$cfg['monthlyDues'] > 0) {
        $firstMonth = substr($ten['start'], 0, 7);
        foreach (fees_due_months($ten['start'], $asOf ?? gmdate('Y-m-d')) as $mk) {
            if ($settled !== '' && $mk <= substr($settled, 0, 7)) continue;
            /* The month a member starts is charged only for the meeting days
               left in it — the same figure their joining invoice quoted
               (membership_prorate), so the two cannot disagree. A charge
               already on the ledger is never re-priced. */
            if (!$activeIn($mk . '-01', gmdate('Y-m-d', (int)strtotime($mk . '-01 00:00:00 UTC +1 month')))) continue;
            $amt = (int)$cfg['monthlyDues'];
            if ($mk === $firstMonth && function_exists('membership_prorate')) $amt = membership_prorate($amt, $ten['start'], $member)['amount'];
            if ($amt > 0 && !$room($amt)) { $out['skipped'] = 'at_cap'; break; }
            if ($amt > 0 && fees_post($memberId, 'dues', $amt,
                          ['periodKey' => $mk, 'note' => 'Monthly dues ' . $mk . ($mk === $firstMonth && $amt < (int)$cfg['monthlyDues'] ? ' (part month, from ' . $ten['start'] . ')' : ''), 'by' => 'accrual'])) {
                $out['dues']++; $owed += $amt;
            }
        }
    }
    /* Training, on the member's own frozen terms. */
    $rate = (int)$terms['rate'];
    if ($rate > 0 && $terms['basis'] === 'total' && $ten['start'] <= ($asOf ?? gmdate('Y-m-d'))) {
        /* ONE charge for the place. A member charged per session before the
           switch keeps those rows (a charge is never re-priced) and is topped
           up to the total, or — if the sessions came to MORE than the total, as
           the old default did (₦450,000 against ₦300,000) — the excess is
           taken back by a cap write-off, so nobody's place costs more than the
           fee. Both are keyed, so a re-run posts nothing twice. */
        $have = 0; $capped = 0;
        foreach (fees_entries($memberId) as $e) {
            if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
            if ((string)$e['kind'] === 'training') $have += (int)$e['amount'];
            if ((string)$e['kind'] === 'writeoff' && str_starts_with((string)$e['periodKey'], 'cap:training')) $capped += (int)$e['amount'];
        }
        if ($have < $rate) {
            if (fees_post($memberId, 'training', $rate - $have,
                          ['periodKey' => $have > 0 ? 'total:' . $have : 'total',
                           'note' => $have > 0 ? 'Training fee — the rest of the fixed ' . fees_money_text($rate, $cfg) : 'Training fee — the place, for the whole programme',
                           'by' => 'accrual'])) {
                $out['training']++;
            }
        } elseif ($have - $capped > $rate) {
            fees_post($memberId, 'writeoff', $have - $capped - $rate,
                      ['periodKey' => 'cap:training:' . $have,
                       'note' => 'Training fee held to the fixed ' . fees_money_text($rate, $cfg) . ' — charged per session above it', 'by' => 'accrual']);
        }
    } elseif ($rate > 0 && $terms['basis'] === 'week') {
        /* A week rate, off the same meeting calendar, one charge per week met. */
        $weeks = fees_training_weeks($memberId, $ten, $asOf);
        if (!$weeks && empty(member_programme_settings()['enabled'])) $out['skipped'] = 'no_calendar';
        foreach ($weeks as $key => $monday) {
            if (fees_post($memberId, 'training', $rate,
                          ['periodKey' => $key, 'sessionId' => explode(':', $key)[0],
                           'note' => 'Training — week of ' . $monday, 'by' => 'accrual'])) {
                $out['training']++;
            }
        }
    } elseif ($rate > 0 && $terms['basis'] === 'day') {
        /* A day rate, off the admin's own meeting calendar. */
        $days = fees_training_days($memberId, $ten, $asOf);
        if (!$days && empty(member_programme_settings()['enabled'])) $out['skipped'] = 'no_calendar';
        foreach ($days as $key => $day) {
            if (fees_post($memberId, 'training', $rate,
                          ['periodKey' => $key, 'sessionId' => explode(':', $key)[0],
                           'note' => 'Training — ' . $day, 'by' => 'accrual'])) {
                $out['training']++;
            }
        }
    } elseif ($rate > 0) {
        $today = $asOf ?? gmdate('Y-m-d');
        foreach (db_all('SELECT sessionId, code, name, startDate FROM sessions ORDER BY startDate') as $s) {
            if (in_array(strtoupper((string)($s['code'] ?? '')), FEES_NON_TRAINING_SESSIONS, true)) continue;
            $sd = substr((string)($s['startDate'] ?? ''), 0, 10);
            if ($sd === '' || $sd > $today) continue;
            if ($sd < $ten['start']) continue;                 // before they joined
            /* …and after the training half is over, nothing more is charged.
             * This was missing: a member kept picking up a training fee for
             * every session for as long as they stayed enrolled, so the balance
             * grew through the very period it was supposed to be shrinking. The
             * eighteen months are a training PERIOD, not a rate. */
            if ((string)($ten['trainingEndsAt'] ?? '') !== '' && $sd >= (string)$ten['trainingEndsAt']) continue;
            if (fees_post($memberId, 'training', $rate,
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
 *   no way to reach the family    no linked guardian account, no email and
 *                                 no phone (dues_contacts — a guardian with
 *                                 only a family-app account IS reachable)
 *
 * PAYABLE, not outstanding. A member halfway through their service carries a
 * large training charge that is being written off as they go; chasing them for
 * it would be demanding money the programme has already decided they will not
 * owe. This distinction is the whole reason `payable` exists.
 */
function fees_reminder_candidates(?array $cfg = null, int $limit = FEES_CANDIDATE_MAX): array {
    $cfg = $cfg ?? fees_settings();
    $out = ['due' => [], 'skipped' => ['off' => 0, 'optedOut' => 0, 'nothingPayable' => 0,
                                       'underMinimum' => 0, 'tooSoon' => 0, 'paidRecently' => 0, 'onPlan' => 0, 'noContact' => 0]];
    if (empty($cfg['enabled']) || empty($cfg['remindEnabled'])) { $out['skipped']['off'] = 1; return $out; }
    $everyDays = max(FEES_REMIND_MIN_DAYS, (int)$cfg['remindEveryDays']);
    $minBal = max(1, (int)$cfg['remindMinBalance']);
    $now = time();
    /* A family that paid an instalment (membership_part_invoice) is not reminded until a full interval
       after it: the follow-up for what is left runs from their payment, not from the last reminder.
       One grouped read, not one per member. */
    $installed = [];
    if (function_exists('membership_part_min')) {
        foreach (db_all("SELECT memberId, MAX(paidAt) at FROM membership_invoices WHERE purpose = 'part' AND status = 'paid' AND paidAt >= ? GROUP BY memberId",
            [gmdate('Y-m-d\TH:i:s\Z', $now - $everyDays * 86400)]) as $r) $installed[(string)$r['memberId']] = (string)$r['at'];
    }
    // A family keeping an instalment plan gets the plan's reminders instead (payment-plans.php); a lapsed plan does not protect them.
    $onPlan = function_exists('plan_protected_members') ? plan_protected_members() : [];
    foreach (db_all("SELECT * FROM members WHERE status = 'active' ORDER BY id LIMIT " . max(1, min(FEES_SCAN_MAX, $limit * 5))) as $m) {
        if (count($out['due']) >= $limit) break;
        if ((int)($m['duesRemindOff'] ?? 0) === 1) { $out['skipped']['optedOut']++; continue; }
        $bal = fees_balance($m, $cfg);
        if ((int)$bal['payable'] <= 0) { $out['skipped']['nothingPayable']++; continue; }
        if ((int)$bal['payable'] < $minBal) { $out['skipped']['underMinimum']++; continue; }
        $last = strtotime((string)($m['duesRemindedAt'] ?? '')) ?: 0;
        if ($last > 0 && ($now - $last) < $everyDays * 86400) { $out['skipped']['tooSoon']++; continue; }
        if (isset($installed[(string)$m['memberId']])) { $out['skipped']['paidRecently']++; continue; }
        if (isset($onPlan[(string)$m['memberId']])) { $out['skipped']['onPlan']++; continue; }
        $ct = function_exists('dues_contacts') ? dues_contacts($m) : ['guardianIds' => [], 'emails' => array_filter([trim((string)($m['parentEmail'] ?? ''))]), 'phones' => []];
        if (!$ct['guardianIds'] && !$ct['emails'] && !$ct['phones']) { $out['skipped']['noContact']++; continue; }
        $out['due'][] = ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'],
                         'to' => (string)($ct['emails'][0] ?? ''), 'reach' => ['app' => count($ct['guardianIds']), 'email' => count($ct['emails']), 'phones' => count($ct['phones'])],
                         'payable' => (int)$bal['payable'],
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
    /* The instalment route, said where the money is asked for: a family that cannot clear it at once
       pays what it can from the family app (membership_part_invoice), and is not chased the next day. */
    $partMin = function_exists('membership_part_min') && function_exists('paystack_secret') && paystack_secret() !== '' ? membership_part_min((int)$bal['payable']) : 0;
    if ($partMin > 0) {
        $body .= '<p style="margin:0 0 10px">You don’t have to pay it all at once. In the NGG Family app, open Fees, press Pay and choose '
              . '<b>Part of it</b> to pay any amount from ' . $money($partMin) . '. What is left stays on the account for later.</p>';
    }
    $body .= '<p style="margin:0 0 10px">If any of this looks wrong, or if now is a difficult time, please reply to this '
          . 'message or speak to your centre coordinator — we would rather hear from you than not.</p>';
    /* Every channel the family has, to every linked guardian — the family app,
       email, Telegram, SMS if switched on (dues-notices.php) — not one email to
       the address on the child's record. One per family per day at most. */
    $parts = [];
    foreach (['membership' => 'membership', 'dues' => 'dues', 'fine' => 'fines'] as $k => $label) {
        $v = (int)($bal['byKind'][$k] ?? 0);
        if ($v > 0) $parts[] = $label . ' ' . $money($v);
    }
    $plain = $first . '\'s account has ' . $money((int)$bal['payable']) . ' to pay' . ($parts ? ' (' . implode(', ', $parts) . ')' : '')
           . '. Pay from the family app, or tell us there if you already have. If now is a difficult time, speak to your centre coordinator.';
    $res = function_exists('dues_notice_send')
        ? dues_notice_send($m, 'arrears', gmdate('Y-m-d'), ['title' => $first . '\'s account: ' . $money((int)$bal['payable']) . ' to pay', 'intro' => $first . '\'s account has an amount to pay.',
            'subject' => $first . '\'s account — ' . $money((int)$bal['payable']) . ' to pay', 'text' => $plain, 'html' => $body, 'amount' => (int)$bal['payable'],
            'footNote' => 'You are receiving this because you are ' . $first . '\'s guardian at Next Generation Genius. Tell your centre coordinator if you would prefer not to receive these.',
            // In the member's own portal, in words for them: what is owed, and that home has been told.
            'member' => ['title' => 'Your account: ' . $money((int)$bal['payable']) . ' to pay',
                'text' => 'Your parent or guardian has been sent a reminder. If it has been paid, they can tell us in the family app.']], $cfg)
        : ['sent' => false];
    $ok = !empty($res['sent']);
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
    $r = fees_settings_save($in, (string)($g['requester']['memberId'] ?? ''));
    if (empty($r['ok'])) return $r;
    unset($r['ok']);
    return ['ok' => true, 'fees' => $r];
}

/** One member's account: the balance, the tenure, and every entry behind it. */
/**
 * The money desk follows the centre scope like every other desk: a scoped
 * fees officer sees and changes only their centres' members' accounts. The
 * refusal is the same for an unknown id as for one outside scope.
 */
function fees_scope_gate(array $requester, string $memberId): array {
    if (admin_centre_names_in_scope($requester) === null) return ['ok' => true];
    $sg = admin_member_scope_gate($requester, $memberId);
    return $sg['ok'] ? ['ok' => true] : $sg;
}

function admin_fees_member(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
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
        'balance' => $bal = fees_balance($m, $cfg),
        'training' => fees_training_watch($m, $cfg, $bal),
        'entries' => array_reverse($entries),          // newest first for reading
        'account' => fees_account_statement($m, $bal, $cfg),
        'remindOff' => (int)($m['duesRemindOff'] ?? 0) === 1,
        'settings' => $cfg,
    ]];
}

/** Record a payment received. Admin-entered: this is the reconciliation step,
 *  not a gateway callback. */
/**
 * The rules every payment recorded by a person passes, whichever door it comes
 * through — the desk (admin_fees_payment) and a family's claim approved from the
 * inbox (member_request_decide). The claim path used to post with none of them,
 * so the same transfer slip could be credited once at the desk and again as a
 * claim, and an operator could approve a claim on their own account.
 *
 *   · nobody credits their own account;
 *   · an open joining invoice is paid through Membership payments, where a
 *     second person checks it, never around it;
 *   · a bank reference is money that arrived once: accepted once, across desk
 *     payments, offline claims and approved family claims — and a transfer
 *     needs one.
 *
 * @param list<array{method:string,reference:string}> $parts
 * @return array|null a refusal, or null when it may be posted
 */
function fees_payment_guard(string $memberId, string $by, array $parts, string $ip = ''): ?array {
    if ($by === $memberId) return ['ok' => false, 'error' => 'own_account'];
    if (db_row("SELECT invoiceId FROM membership_invoices WHERE memberId = ? AND status = 'open' AND purpose = 'joining' LIMIT 1", [$memberId])) {
        return ['ok' => false, 'error' => 'use_invoice', 'detail' => 'This member has an unpaid joining invoice. Record the payment against it (Membership payments), where it is checked by a second person.'];
    }
    $keys = [];
    foreach ($parts as $x) {
        $refKey = function_exists('membership_ref_key') ? membership_ref_key((string)($x['reference'] ?? '')) : '';
        if (!in_array((string)($x['method'] ?? 'cash'), ['cash', 'claim'], true) && strlen($refKey) < 4)
            return ['ok' => false, 'error' => 'reference_required', 'detail' => 'The transaction reference on the slip or alert.'];
        if ($refKey === '') continue;
        if (isset($keys[$refKey])) return ['ok' => false, 'error' => 'reference_reused', 'detail' => 'The same reference is given twice.'];
        $keys[$refKey] = (string)$x['reference'];
    }
    if ($keys) {
        $seen = false;
        foreach (array_keys($keys) as $k) if (db_row("SELECT invoiceId FROM offline_payments WHERE referenceKey = ? AND status <> 'rejected' LIMIT 1", [$k])) { $seen = true; break; }
        if (!$seen) foreach (db_all("SELECT reference FROM member_ledger WHERE kind = 'payment' AND reference <> '' AND (voidedAt IS NULL OR voidedAt = '')") as $lr)
            if (isset($keys[membership_ref_key((string)$lr['reference'])])) { $seen = true; break; }
        if ($seen) {
            audit('fees.payment.reused_reference', $by, $memberId, ['reference' => implode(', ', $keys)], $ip);
            return ['ok' => false, 'error' => 'reference_reused', 'detail' => 'That reference is already recorded.'];
        }
    }
    return null;
}

function admin_fees_payment(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $id = trim((string)($p['memberId'] ?? ''));
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $amount = fees_money($p['amount'] ?? null, 0);
    if ($amount <= 0) return ['ok' => false, 'error' => 'bad_amount'];
    $by = (string)($g['requester']['memberId'] ?? '');
    /* Nobody credits their own account, and the joining invoice is not paid
       around: crediting it here and then voiding the invoice skipped the
       evidence and the second person (domain/membership-pay.php). */
    $method = (string)($p['method'] ?? 'cash');
    $no = fees_payment_guard($id, $by, [['method' => $method, 'reference' => (string)($p['reference'] ?? '')]], (string)($p['ip'] ?? ''));
    if ($no) return $no;
    /* What the family said the money is for (fees_allocate): those charges are covered first. */
    $applies = is_array($p['appliesTo'] ?? null) ? array_slice(array_map('strval', $p['appliesTo']), 0, 50) : [];
    $e = fees_post($id, 'payment', $amount, [
        'note' => (string)($p['note'] ?? ''), 'method' => (string)($p['method'] ?? 'cash'),
        'reference' => (string)($p['reference'] ?? ''), 'by' => $by, 'appliesTo' => $applies,
    ]);
    if (!$e) return ['ok' => false, 'error' => 'post_failed'];
    audit('fees.payment', $by, $id, ['amount' => $amount, 'method' => (string)($p['method'] ?? 'cash')] + (!empty($e['appliesTo']) ? ['appliesTo' => json_decode((string)$e['appliesTo'], true)] : []), (string)($p['ip'] ?? ''));
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
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
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
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $reason = trim((string)($p['reason'] ?? ''));
    // No vocabulary here: a waiver is a judgement about one family's month, and
    // a dropdown would flatten the only part of it worth reading later.
    if ($reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $before = fees_balance($m);
    $asked = fees_money($p['amount'] ?? null, 0);
    if ($asked <= 0) return ['ok' => false, 'error' => 'bad_amount'];
    /* Capped at what the family is ASKED for. It was capped at `outstanding`,
       which also holds the training place (covered, never billed): a ₦50,000
       waiver on a ₦24,870 balance went through, and the ₦25,130 over stood as
       credit that quietly paid the coming months. The place is written off by
       the MOU, not waived here. */
    $amount = min($asked, (int)$before['payable']);
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

/* ── Settled up to a date: RETIRED (2026-10-30) ─────────────────────────────
 *
 * "Clear dues they don't owe" let anybody holding `fees` write off a member's
 * membership and dues up to a date — one at a time from the account, or five
 * hundred at a time from the roster — with nothing but a typed sentence as the
 * reason. The owner's reading: "This should not be available to anybody. It
 * would cause fraud." An instrument that turns a debt into nothing on one
 * person's say-so is the shape a fraud takes, whoever is holding it.
 *
 * So both doors are shut on the server, not hidden on the screen: the bulk
 * action is gone from members_bulk_actions(), and admin.fees.settle answers
 * `retired` to everybody, the super admin included. What already happened
 * stands: `members.feesSettledThrough` dates recorded before the retirement
 * are still honoured by the accrual (fees_accrue_member), and their waivers
 * stay on the ledger, because rewriting history is not the fix for a tool
 * that could rewrite history.
 *
 * The one sanctioned clearance is fines, once, for every active member:
 * admin.fees.finesClearOnce below.
 */
/** The calendar day each real charge belongs to, for oldest-first allocation. */
function fees_charge_day(array $e, array $memberDues): string {
    $k = (string)$e['kind']; $pk = (string)($e['periodKey'] ?? '');
    if ($k === 'dues' && preg_match('/^\d{4}-\d{2}$/', $pk)) return $pk . '-01';
    if ($k === 'membership' && isset($memberDues[$pk])) return $memberDues[$pk];
    return substr((string)($e['createdAt'] ?? ''), 0, 10);
}
/**
 * What is still unpaid on charges of the given kinds, payments and waivers
 * applied to the oldest real charges first (the order every screen uses).
 * $through limits it to charges on or before a day; null is all of them.
 */
/**
 * THE allocator: how credits meet charges. Every reader that asks "which charge
 * is still owed" goes through here, so they cannot disagree.
 *
 * A credit may NAME the charges it pays (member_ledger.appliesTo, a JSON list of
 * entryIds — a family paying a fine to lift a suspension, a desk taking money
 * for this month's dues). It covers those first, up to what each still owes;
 * whatever is left of it, and every credit that names nothing, goes to the
 * oldest charges first, as it always has. The same money meets the same
 * charges, so payable, outstanding and every total are exactly what they were;
 * only WHICH charge is still owed can change.
 *
 * $charges: in the order they fall due, each ['ref' => entryId, 'amount' => n].
 * $credits: in ledger order, each ['amount' => n, 'applies' => [entryId, …]].
 * Returns ref => amount covered.
 */
function fees_allocate(array $charges, array $credits): array {
    $left = []; $taken = [];
    foreach ($charges as $c) { $r = (string)$c['ref']; $left[$r] = ($left[$r] ?? 0) + (int)$c['amount']; $taken[$r] = 0; }
    $pool = 0;
    foreach ($credits as $cr) {
        $amt = (int)$cr['amount'];
        foreach ((array)($cr['applies'] ?? []) as $r) {
            if ($amt <= 0) break;
            $r = (string)$r;
            if (($left[$r] ?? 0) <= 0) continue;
            $t = min($amt, $left[$r]); $left[$r] -= $t; $taken[$r] += $t; $amt -= $t;
        }
        $pool += $amt;
    }
    foreach ($charges as $c) {
        if ($pool <= 0) break;
        $r = (string)$c['ref']; $t = min($pool, $left[$r]); $left[$r] -= $t; $taken[$r] += $t; $pool -= $t;
    }
    return $taken;
}

/** A live credit row as fees_allocate reads it (a write-off is the training place, never a payment). */
function fees_credit_of(array $e): ?array {
    if ((string)$e['direction'] !== 'credit' || (string)$e['kind'] === 'writeoff') return null;
    $ap = json_decode((string)($e['appliesTo'] ?? ''), true);
    return ['amount' => (int)$e['amount'], 'applies' => is_array($ap) ? array_values(array_map('strval', $ap)) : []];
}

function fees_unpaid_of(array $member, array $kinds, ?string $through = null, ?array $cfg = null, ?array $entries = null): int {
    $cfg = $cfg ?? fees_settings();
    $ten = fees_tenure($member, $cfg);
    $memberDues = [];
    if ($ten['start'] !== '') foreach (fees_membership_periods($ten['start'], gmdate('Y-m-d'), (int)$cfg['membershipEveryMonths']) as $per) $memberDues[(string)$per['key']] = (string)$per['due'];
    $charges = []; $credits = [];
    foreach ($entries ?? fees_entries((string)$member['memberId']) as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $kind = (string)$e['kind'];
        if ((string)$e['direction'] === 'charge') { if ($kind !== 'training') $charges[] = ['ref' => (string)$e['entryId'], 'kind' => $kind, 'amount' => (int)$e['amount'], 'day' => fees_charge_day($e, $memberDues), 'id' => (int)($e['id'] ?? 0)]; }
        elseif ($cr = fees_credit_of($e)) $credits[] = $cr;
    }
    usort($charges, static fn($a, $b) => [$a['day'], $a['id']] <=> [$b['day'], $b['id']]);
    $taken = fees_allocate($charges, $credits);
    $unpaid = 0;
    foreach ($charges as $c) {
        $left = $c['amount'] - ($taken[$c['ref']] ?? 0);
        if ($left > 0 && in_array($c['kind'], $kinds, true) && ($through === null || ($c['day'] !== '' && $c['day'] <= $through))) $unpaid += $left;
    }
    return $unpaid;
}
/**
 * What is left on EACH live charge (training excluded), keyed by entryId —
 * payments and waivers applied to the oldest real charges first, the one
 * reading fees_unpaid_of() and fees_entry_left() use. A screen that says what
 * an amount owed is made of must ask this, not walk the list in its own
 * order: the family's Fees page walked the charges newest-first until they
 * added up, so a fine posted today for last month's absence took the
 * "part paid" remainder that really belonged to an older charge.
 *
 * @return array<string, array{left:int, amount:int}>
 */
function fees_charges_left(array $member, ?array $cfg = null, ?array $entries = null, ?array $ten = null): array {
    $cfg = $cfg ?? fees_settings();
    $ten = $ten ?? fees_tenure($member, $cfg);
    $memberDues = [];
    if ($ten['start'] !== '') foreach (fees_membership_periods($ten['start'], gmdate('Y-m-d'), (int)$cfg['membershipEveryMonths']) as $per) $memberDues[(string)$per['key']] = (string)$per['due'];
    $charges = []; $credits = [];
    foreach ($entries ?? fees_entries((string)$member['memberId']) as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $kind = (string)$e['kind'];
        if ((string)$e['direction'] === 'charge') { if ($kind !== 'training') $charges[] = ['ref' => (string)$e['entryId'], 'entryId' => (string)$e['entryId'], 'amount' => (int)$e['amount'], 'day' => fees_charge_day($e, $memberDues), 'id' => (int)($e['id'] ?? 0)]; }
        elseif ($cr = fees_credit_of($e)) $credits[] = $cr;
    }
    usort($charges, static fn($a, $b) => [$a['day'], $a['id']] <=> [$b['day'], $b['id']]);
    $taken = fees_allocate($charges, $credits);
    $out = [];
    foreach ($charges as $c) {
        $take = $taken[$c['ref']] ?? 0;
        $out[$c['entryId']] = ['left' => $c['amount'] - $take, 'amount' => $c['amount'], 'due' => (string)$c['day']];
    }
    return $out;
}

/**
 * Compliance state, status history and suspensions for many members, three
 * queries for the whole list — what fees_balance() otherwise reads per member
 * (policy state, the status log, suspensions: four or more queries each). A
 * list that called fees_balance() without it ran those for every row.
 *
 * @return array<string, array> memberId => the $comp argument fees_balance() takes
 */
function fees_comp_batch(array $ids): array {
    $out = [];
    if (!$ids) return $out;
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $comp = []; $hist = []; $susp = [];
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    // The same reading as fees_compliance_cutoff(): a suspension past its end date no longer pauses anything.
    foreach (db_all("SELECT personId, kind, issuedAt, startsAt, endsAt FROM sanctions WHERE personId IN ($ph) AND status = 'active' AND kind IN ('eviction','suspension') ORDER BY issuedAt", $ids) as $sx) {
        $pid = (string)$sx['personId'];
        if ($sx['kind'] === 'suspension' && (string)$sx['endsAt'] !== '' && substr((string)$sx['endsAt'], 0, 10) < $today) continue;
        if ($sx['kind'] === 'eviction') $comp[$pid] = ['cutoff' => substr((string)$sx['issuedAt'], 0, 10), 'state' => 'evicted', 'final' => true];
        elseif (($comp[$pid]['state'] ?? '') !== 'evicted') $comp[$pid] = ['cutoff' => substr((string)$sx['startsAt'], 0, 10), 'state' => 'suspended', 'final' => false];
    }
    foreach (db_all("SELECT memberId, status, since FROM member_status_log WHERE memberId IN ($ph) ORDER BY since, id", $ids) as $h) $hist[(string)$h['memberId']][] = $h;
    foreach (db_all("SELECT personId, status, startsAt, endsAt, clearedAt FROM sanctions WHERE personId IN ($ph) AND kind = 'suspension'", $ids) as $sx) $susp[(string)$sx['personId']][] = $sx;
    foreach ($ids as $id) $out[$id] = ($comp[$id] ?? ['cutoff' => '', 'state' => 'clear', 'final' => false]) + ['history' => $hist[$id] ?? [], 'suspensions' => $susp[$id] ?? []];
    return $out;
}

/**
 * What a member's payable is MADE OF, in lines a family reads at a glance —
 * the one answer every screen gives (family Fees, the member's Money screen,
 * Who owes). The lines add up to `payable`, always, and the sum is checked
 * here rather than trusted to each screen:
 *
 *   - each open charge's LEFT, read the way payments are applied (oldest
 *     first, fees_charges_left), so a part-paid charge says what it was;
 *   - monthly dues grouped into one line with the months named — and a gap
 *     said, not papered over ("February – April, June 2026");
 *   - the training place when it became owed on leaving before the MOU. It
 *     is in the payable but on no ledger charge, so every breakdown built
 *     from charges alone came up short by exactly that, for exactly the
 *     families most likely to dispute it.
 *
 * Grouping moved here from the family app (fp3Lines), which did the sum in
 * the browser and could only ever see ledger charges.
 *
 * @return array{payable:int, lines:list<array>, ok:bool}
 */
function fees_owed_made(array $m, ?array $cfg = null, ?array $entries = null, ?array $bal = null): array {
    $cfg = $cfg ?? fees_settings();
    $entries = $entries ?? fees_entries((string)$m['memberId']);
    $bal = $bal ?? fees_balance($m, $cfg, null, $entries);
    $byId = []; foreach ($entries as $e) $byId[(string)$e['entryId']] = $e;
    $groups = []; $order = [];
    foreach (fees_charges_left($m, $cfg, $entries, $bal['tenure'] ?? null) as $eid => $l) {
        if ($l['left'] <= 0 || !isset($byId[$eid])) continue;
        $e = $byId[$eid]; $kind = (string)$e['kind']; $per = (string)($e['periodKey'] ?? '');
        $note = trim((string)$e['note']);
        $key = $kind === 'dues' ? 'dues' : $kind . ':' . $eid;
        if (!isset($groups[$key])) {
            $order[] = $key;
            $groups[$key] = ['key' => $key, 'kind' => $kind, 'label' => fees_made_label($kind, $note), 'detail' => '', 'amount' => 0, 'n' => 0,
                             'paid' => 0, 'of' => 0, 'periods' => [], 'due' => (string)$l['due']];
        }
        $g = &$groups[$key];
        $g['amount'] += $l['left']; $g['n']++;
        if ($l['left'] < $l['amount']) { $g['paid'] += $l['amount'] - $l['left']; $g['of'] += $l['amount']; }
        if (preg_match('/^\d{4}-\d{2}$/', $per)) $g['periods'][] = $per;
        if ($kind !== 'dues') $g['detail'] = fees_made_detail($kind, $note, $per);
        unset($g);
    }
    $lines = [];
    foreach ($order as $k) {
        $g = $groups[$k];
        if ($g['kind'] === 'dues') {
            if ($g['n'] > 1) $g['label'] .= ' × ' . $g['n'] . ' months';
            $g['detail'] = fees_month_spans($g['periods']);
        }
        if ($g['paid'] > 0) $g['detail'] = trim($g['detail'] . ($g['detail'] !== '' ? ' · ' : '') . fees_money_text($g['paid'], $cfg) . ' already paid' . ($g['n'] === 1 ? ' of ' . fees_money_text($g['of'], $cfg) : ''));
        $lines[] = $g;
    }
    $owed = (int)($bal['trainingOwed'] ?? 0);
    if ($owed > 0) $lines[] = ['key' => 'training_owed', 'kind' => 'training_owed', 'label' => 'Training place',
        'detail' => 'Left before the MOU was complete — the part service had not yet earned off', 'amount' => $owed, 'n' => 1, 'paid' => 0, 'of' => 0, 'periods' => [], 'due' => ''];
    /* Biggest first is not the order a family pays in; the oldest is. Dues sit
       where their oldest month falls; the training balance closes the list. */
    $payable = (int)$bal['payable'];
    $sum = array_sum(array_column($lines, 'amount'));
    return ['payable' => $payable, 'lines' => $lines, 'ok' => $sum === $payable];
}
/** "Membership fee", "Fine", "Adjustment" — the line's name; its particulars go in the detail. */
function fees_made_label(string $kind, string $note): string {
    if ($kind === 'dues') return 'Commitment fee';
    if ($kind === 'membership') return 'Membership fee';
    if ($kind === 'fine') return 'Fine';
    if ($note !== '') { $cut = preg_split('/\s+—\s+/u', $note, 2); return (string)$cut[0]; }
    return ucfirst($kind);
}
function fees_made_detail(string $kind, string $note, string $per): string {
    $d = fn($iso) => ($t = strtotime($iso . 'T12:00:00Z')) ? gmdate('j M Y', $t) : $iso;
    if ($kind === 'membership') {
        if (preg_match('/year (\d+) from (\d{4}-\d{2}-\d{2})/', $note, $x)) return 'Year ' . $x[1] . ', from ' . $d($x[2]);
        return $note !== 'Membership fee' ? preg_replace('/^Membership fee\s*—\s*/u', '', $note) : '';
    }
    $rest = preg_split('/\s+—\s+/u', $note, 2)[1] ?? '';
    // "Absent on Sat 17 Oct 2026 with no absence request — ₦1,000 absence fine." → the reason, not the amount again
    $rest = preg_replace('/\s*—\s*₦[\d,]+(?: [a-z]+)? fine\.?$/u', '', $rest);
    return preg_replace_callback('/\b(\d{4}-\d{2}-\d{2})\b/', fn($x) => $d($x[1]), $rest);
}
/** ['2026-02','2026-03','2026-05'] → "February – March, May 2026". Gaps are said. */
function fees_month_spans(array $periods): string {
    $ps = array_values(array_unique($periods)); sort($ps);
    if (!$ps) return '';
    $idx = fn($p) => (int)substr($p, 0, 4) * 12 + (int)substr($p, 5, 2) - 1;
    $runs = []; $start = $prev = $ps[0];
    foreach (array_slice($ps, 1) as $p) { if ($idx($p) === $idx($prev) + 1) { $prev = $p; continue; } $runs[] = [$start, $prev]; $start = $prev = $p; }
    $runs[] = [$start, $prev];
    $name = fn($p) => gmdate('F', strtotime($p . '-01T12:00:00Z')); $yr = fn($p) => substr($p, 0, 4);
    $oneYear = $yr($ps[0]) === $yr(end($ps));
    $parts = array_map(function ($r) use ($name, $yr, $oneYear) {
        $a = $name($r[0]) . ($oneYear ? '' : ' ' . $yr($r[0])); $b = $name($r[1]) . ($oneYear ? '' : ' ' . $yr($r[1]));
        return $r[0] === $r[1] ? $a : $a . ' – ' . $b;
    }, $runs);
    return implode(', ', $parts) . ($oneYear ? ' ' . $yr($ps[0]) : '');
}

/**
 * One member's account as an accountant reads it, built on the server so the
 * screen adds nothing up:
 *
 *   summary    charged by kind − received by kind = payable now (a sum that
 *              reconciles, on the page)
 *   open       each charge with something left on it, oldest first, what is
 *              left and what was paid of it (fees_charges_left)
 *   statement  every entry in the order it was posted, with charge / credit
 *              columns and the running balance; a voided entry is listed and
 *              moves nothing. The training place is not money anybody is
 *              asked for, so it is not in the statement — it has its own
 *              section — unless it became owed on leaving, which is a line.
 *
 * Before 3 Nov 2026 the account showed four tiles that did not reconcile and a
 * list of amounts with no balance, so nobody could trace how the payable was
 * reached.
 */
function fees_account_statement(array $m, array $bal, ?array $cfg = null, ?array $entries = null): array {
    $cfg = $cfg ?? fees_settings();
    $entries = $entries ?? fees_entries((string)$m['memberId']);
    $leftBy = fees_charges_left($m, $cfg, $entries);
    $charged = []; $received = []; $rows = []; $run = 0;
    foreach ($entries as $e) {
        $kind = (string)$e['kind']; $amt = (int)$e['amount']; $void = trim((string)($e['voidedAt'] ?? '')) !== '';
        if ($kind === 'training' || $kind === 'writeoff') continue;   // the place: its own section
        $isCharge = (string)$e['direction'] === 'charge';
        if (!$void) {
            $run += $isCharge ? $amt : -$amt;
            $k = $kind === 'adjustment' ? ($isCharge ? 'adjustment' : 'credit_adjustment') : $kind;
            if ($isCharge) $charged[$k] = ($charged[$k] ?? 0) + $amt; else $received[$k] = ($received[$k] ?? 0) + $amt;
        }
        $rows[] = ['entryId' => (string)$e['entryId'], 'date' => substr((string)$e['createdAt'], 0, 10), 'kind' => $kind,
            'periodKey' => (string)($e['periodKey'] ?? ''), 'note' => (string)$e['note'], 'void' => $void, 'voidReason' => (string)($e['voidReason'] ?? ''),
            'charge' => $isCharge ? $amt : 0, 'credit' => $isCharge ? 0 : $amt, 'balance' => $run,
            'left' => $isCharge && !$void ? (int)($leftBy[(string)$e['entryId']]['left'] ?? 0) : null];
    }
    $trainingOwed = (int)($bal['trainingOwed'] ?? 0);
    if ($trainingOwed > 0) {
        $run += $trainingOwed; $charged['training_owed'] = $trainingOwed;
        $rows[] = ['entryId' => '', 'date' => '', 'kind' => 'training_owed', 'periodKey' => '', 'note' => 'Left before the MOU was complete: what service had not yet earned off the training place',
            'void' => false, 'voidReason' => '', 'charge' => $trainingOwed, 'credit' => 0, 'balance' => $run, 'left' => $trainingOwed];
    }
    /* In the allocator's own order — by the day each charge fell due — which is
       the order payments settle them, so the top line is what the next payment pays. */
    $rowBy = []; foreach ($rows as $r) if ($r['entryId'] !== '') $rowBy[$r['entryId']] = $r;
    $open = [];
    foreach ($leftBy as $id => $l) {
        if ($l['left'] <= 0 || !isset($rowBy[$id])) continue;
        $r = $rowBy[$id];
        $open[] = ['entryId' => $id, 'date' => $r['date'], 'due' => substr((string)$l['due'], 0, 10), 'kind' => $r['kind'], 'periodKey' => $r['periodKey'], 'note' => $r['note'],
                   'amount' => $l['amount'], 'left' => $l['left'], 'paid' => $l['amount'] - $l['left']];
    }
    return ['summary' => ['charged' => $charged, 'received' => $received, 'chargedTotal' => array_sum($charged), 'receivedTotal' => array_sum($received),
                          'payable' => (int)$bal['payable'], 'credit' => max(0, -$run)],
            'open' => $open, 'statement' => array_reverse($rows)];   // newest first on screen; the balance on each line is as at that line
}

/**
 * What is still owed on ONE charge, identified by its period key — payments
 * and waivers applied to the oldest real charges first, exactly as
 * fees_unpaid_of() reads the account. Null when there is no live charge with
 * that key. The re-entry fee asks this before a suspended child may return.
 */
function fees_entry_left(array $member, string $periodKey, ?array $cfg = null): ?int {
    $cfg = $cfg ?? fees_settings();
    $ten = fees_tenure($member, $cfg);
    $memberDues = [];
    if ($ten['start'] !== '') foreach (fees_membership_periods($ten['start'], gmdate('Y-m-d'), (int)$cfg['membershipEveryMonths']) as $per) $memberDues[(string)$per['key']] = (string)$per['due'];
    $charges = []; $credits = []; $found = false;
    foreach (fees_entries((string)$member['memberId']) as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $kind = (string)$e['kind'];
        if ((string)$e['direction'] === 'charge') {
            if ($kind === 'training') continue;
            $charges[] = ['ref' => (string)$e['entryId'], 'key' => (string)$e['periodKey'], 'amount' => (int)$e['amount'], 'day' => fees_charge_day($e, $memberDues), 'id' => (int)($e['id'] ?? 0)];
            if ((string)$e['periodKey'] === $periodKey) $found = true;
        } elseif ($cr = fees_credit_of($e)) $credits[] = $cr;
    }
    if (!$found) return null;
    usort($charges, static fn($a, $b) => [$a['day'], $a['id']] <=> [$b['day'], $b['id']]);
    $taken = fees_allocate($charges, $credits);
    foreach ($charges as $c) {
        if ($c['key'] === $periodKey) return $c['amount'] - ($taken[$c['ref']] ?? 0);
    }
    return null;
}

/** admin.fees.settle — retired. Kept as an op so an old screen gets a reason, not unknown_op. */
function admin_fees_settle(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    audit('fees.settle.refused', (string)$g['requester']['memberId'], trim((string)($p['memberId'] ?? '')), ['why' => 'retired'], (string)($p['ip'] ?? ''));
    return ['ok' => false, 'error' => 'retired',
            'detail' => 'Clearing dues up to a date has been withdrawn: it let one person wipe a debt on their own say-so. Record a payment, or a waiver with its reason.'];
}

/* ══ Clear every active member's fines — ONCE, then never again ══════════════
 *
 * The owner wants the fines carried over from before this system cleared for
 * every active member, and then the power gone. Everything below is about the
 * second half, because a clearance that can be run twice is a standing
 * write-off button with a nicer name.
 *
 *  · WHO. A super admin (by role — a granted `fees` cap is not enough), with
 *    no centre scope, typing a CURRENT code from their own authenticator app
 *    with the request: a stolen session cookie alone cannot run it.
 *  · WHAT (owner, 30 Oct 2026: "the clearance is the whole account"). Every
 *    member who is NGG and `active`: the fines, dues and membership still
 *    unpaid that THIS SYSTEM charged — never anything that arrived by import
 *    (fees_entry_imported), which stays owed in full; payments are counted
 *    against the system's own charges first, so an import is never what was
 *    "paid". The training fee is not touched (service earns it off). One
 *    waiver per member, keyed `fines-cleared:once` (the key predates the
 *    widening and is kept so the lock and the waivers stay one record).
 *  · CHECK, THEN APPLY WHAT WAS CHECKED. The preview returns the members, the
 *    total and a digest; the run recomputes and refuses on any difference,
 *    and needs the typed phrase and a reason.
 *  · ONCE. The run first INSERTs the single row `fines_clear` into
 *    `fees_once_locks` (migration 200), whose key is the primary key, inside
 *    the same transaction as the waivers. A second run — a double press, two
 *    tabs, a replayed request — fails on that insert and writes nothing. No op
 *    deletes from that table; there is no "unlock".
 *  · SEEN. One audit event with the count and the total, and the lock row
 *    itself is shown to every `fees` holder afterwards: who, when, how many,
 *    how much, and why.
 *
 * Fines posted AFTER the run are ordinary fines and stay owed; the ledger
 * keeps every cleared fine (a waiver beside it), so re-uploading an old sheet
 * still reports "already posted" rather than fining the family again.
 */
const FEES_FINES_CLEAR_LOCK = 'fines_clear';
const FEES_FINES_CLEAR_PHRASE = 'CLEAR ALL ACCOUNTS';
function fees_fines_clear_lock(): ?array {
    try { $r = db_row('SELECT * FROM fees_once_locks WHERE lockKey = ? LIMIT 1', [FEES_FINES_CLEAR_LOCK]); }
    catch (Throwable $e) { return null; }
    if (!$r) return null;
    $who = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [(string)$r['usedBy']]);
    return ['usedAt' => (string)$r['usedAt'], 'usedBy' => (string)$r['usedBy'], 'usedByName' => (string)($who['fullName'] ?? ''),
            'members' => (int)$r['members'], 'total' => (int)$r['total'], 'reason' => (string)$r['reason']];
}
/**
 * A charge that arrived by IMPORT — a register of fines uploaded (bulkfine:),
 * or any row an import marks as its own. The clearance never touches these:
 * the owner's rule is that what was imported stays owed, whatever is cleared.
 */
function fees_entry_imported(array $e): bool {
    /* `createdBy` is the ledger's column. This read `byId`/`by` only — neither
       exists on a member_ledger row — so a row marked imported by its author
       alone was treated as the system's own and could be cleared or waived. */
    $pk = (string)($e['periodKey'] ?? ''); $by = (string)($e['createdBy'] ?? $e['byId'] ?? $e['by'] ?? ''); $m = (string)($e['method'] ?? '');
    return str_starts_with($pk, 'bulkfine:') || str_starts_with($pk, 'import:') || $m === 'import' || str_starts_with($by, 'import');
}
/**
 * What the clearance would waive on one account: the unpaid fines, dues and
 * membership THIS SYSTEM charged. Payments and waivers are counted against
 * those first, so an imported charge is never what a payment is said to have
 * covered — after the run the account owes exactly its imported charges, as
 * it did before. The training fee is not a debt in this sense (service earns
 * it off, MOU writes it off) and is left alone.
 * ['amount', 'byKind' => [fine, dues, membership], 'imported' => still owed].
 */
const FEES_CLEAR_KINDS = ['fine', 'dues', 'membership'];
function fees_clear_unpaid_of(array $member, array $cfg, array $entries): array {
    $ten = fees_tenure($member, $cfg);
    $memberDues = [];
    if ($ten['start'] !== '') foreach (fees_membership_periods($ten['start'], gmdate('Y-m-d'), (int)$cfg['membershipEveryMonths']) as $per) $memberDues[(string)$per['key']] = (string)$per['due'];
    $own = []; $imp = []; $credits = [];
    foreach ($entries as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $kind = (string)$e['kind'];
        if ((string)$e['direction'] === 'charge') {
            if ($kind === 'training') continue;
            $c = ['ref' => (string)$e['entryId'], 'kind' => $kind, 'amount' => (int)$e['amount'], 'day' => fees_charge_day($e, $memberDues), 'id' => (int)($e['id'] ?? 0)];
            if (fees_entry_imported($e)) $imp[] = $c; else $own[] = $c;
        } elseif ($cr = fees_credit_of($e)) $credits[] = $cr;
    }
    $order = static fn($a, $b) => [$a['day'], $a['id']] <=> [$b['day'], $b['id']];
    usort($own, $order); usort($imp, $order);
    // NGG's own charges first, then imported ones: the order this clearance has always used.
    $taken = fees_allocate(array_merge($own, $imp), $credits);
    $byKind = array_fill_keys(FEES_CLEAR_KINDS, 0); $other = 0;
    foreach ($own as $c) {
        $left = $c['amount'] - ($taken[$c['ref']] ?? 0);
        if ($left <= 0) continue;
        if (isset($byKind[$c['kind']])) $byKind[$c['kind']] += $left; else $other += $left;   // an adjustment stays owed
    }
    $imported = 0;
    foreach ($imp as $c) $imported += $c['amount'] - ($taken[$c['ref']] ?? 0);
    return ['amount' => array_sum($byKind), 'byKind' => $byKind, 'imported' => $imported, 'otherOwed' => $other];
}
/** Who would be cleared, and of how much. One ledger read for everybody. */
function fees_fines_clear_plan(): array {
    $cfg = fees_settings();
    $ms = array_values(array_filter(db_all("SELECT * FROM members WHERE status = 'active' ORDER BY fullName"), 'member_is_ngg'));
    $byId = [];
    if ($ms) {
        foreach (array_chunk(array_column($ms, 'memberId'), 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            foreach (db_all("SELECT * FROM member_ledger WHERE memberId IN ($ph) ORDER BY id", $chunk) as $e) $byId[(string)$e['memberId']][] = $e;
        }
    }
    $rows = []; $total = 0;
    foreach ($ms as $m) {
        $id = (string)$m['memberId'];
        $u = fees_clear_unpaid_of($m, $cfg, $byId[$id] ?? []);
        if ($u['amount'] <= 0) continue;
        $rows[] = ['memberId' => $id, 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? ''),
                   'amount' => $u['amount'], 'fines' => $u['byKind']['fine'], 'dues' => $u['byKind']['dues'], 'membership' => $u['byKind']['membership'], 'importedLeft' => $u['imported']];
        $total += $u['amount'];
    }
    $digest = substr(hash('sha256', json_encode(array_map(static fn($r) => [$r['memberId'], $r['amount']], $rows))), 0, 32);
    $sum = static fn($k) => array_sum(array_column($rows, $k));
    return ['rows' => $rows, 'members' => count($rows), 'total' => $total, 'digest' => $digest,
            'byKind' => ['fine' => $sum('fines'), 'dues' => $sum('dues'), 'membership' => $sum('membership')], 'importedLeft' => $sum('importedLeft')];
}
/** Gate: super admin by role, unscoped, with a current authenticator code when acting. */
function fees_fines_clear_gate(array $p, bool $acting): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $me = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$g['requester']['memberId']]) ?: $g['requester'];
    if (strtolower((string)($me['role'] ?? '')) !== 'super_admin') return ['ok' => false, 'error' => 'forbidden', 'detail' => 'super_admin_only'];
    if (admin_centre_names_in_scope($me) !== null) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'scoped'];
    if ($acting) {
        if (trim((string)($me['totpSecret'] ?? '')) === '') return ['ok' => false, 'error' => 'totp_required', 'detail' => 'Set up an authenticator app on your account first.'];
        /* Five wrong codes in fifteen minutes and it stops answering for the
           rest of them: a stolen session must not be able to walk the code
           space. Each miss is on the audit log, which is also the counter. */
        $since = gmdate('Y-m-d\TH:i:s\Z', time() - 900);
        $misses = (int)(db_row("SELECT COUNT(*) c FROM audit_log WHERE event = 'fees.fines.clear_badcode' AND actorId = ? AND at >= ?", [(string)$me['memberId'], $since])['c'] ?? 0);
        if ($misses >= 5) return ['ok' => false, 'error' => 'too_many_attempts', 'detail' => 'Too many wrong codes. Wait fifteen minutes.'];
        $code = preg_replace('/\D+/', '', (string)($p['code'] ?? ''));
        if (strlen($code) !== 6 || !totp_verify((string)$me['totpSecret'], $code, 1)) {
            audit('fees.fines.clear_badcode', (string)$me['memberId'], '', [], (string)($p['ip'] ?? ''));
            return ['ok' => false, 'error' => 'bad_code', 'detail' => 'That code is not the current one from your authenticator app.'];
        }
    }
    return ['ok' => true, 'requester' => $me];
}
/** admin.fees.finesClearOnce — {mode: status|preview|run}. */
function admin_fees_fines_clear_once(array $p): array {
    $mode = (string)($p['mode'] ?? 'status');
    if ($mode === 'status') {
        $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
        $lock = fees_fines_clear_lock();
        $me = db_row('SELECT role, centreScope FROM members WHERE memberId = ? LIMIT 1', [(string)$g['requester']['memberId']]) ?: [];
        return ['ok' => true, 'used' => $lock !== null, 'lock' => $lock,
                'canRun' => $lock === null && strtolower((string)($me['role'] ?? '')) === 'super_admin', 'phrase' => FEES_FINES_CLEAR_PHRASE];
    }
    $acting = $mode === 'run';
    $g = fees_fines_clear_gate($p, $acting); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    if (($lock = fees_fines_clear_lock()) !== null) return ['ok' => false, 'error' => 'already_used', 'lock' => $lock];
    $plan = fees_fines_clear_plan();
    if ($mode === 'preview') return ['ok' => true, 'members' => $plan['members'], 'total' => $plan['total'], 'digest' => $plan['digest'], 'rows' => array_slice($plan['rows'], 0, 1000),
        'byKind' => $plan['byKind'], 'importedLeft' => $plan['importedLeft'], 'phrase' => FEES_FINES_CLEAR_PHRASE];
    if ($mode !== 'run') return ['ok' => false, 'error' => 'bad_mode'];
    if (trim((string)($p['phrase'] ?? '')) !== FEES_FINES_CLEAR_PHRASE) return ['ok' => false, 'error' => 'phrase_mismatch', 'detail' => 'Type ' . FEES_FINES_CLEAR_PHRASE . ' exactly.'];
    $reason = trim((string)preg_replace('/\s+/u', ' ', (string)($p['reason'] ?? '')));
    if (mb_strlen($reason) < 10) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why, in a sentence. It is kept with the record of this run.'];
    if ((string)($p['digest'] ?? '') !== $plan['digest']) return ['ok' => false, 'error' => 'import_changed', 'detail' => 'The fines changed since the preview. Preview again.'];
    $pdo = db_conn(); $now = now_iso();
    try {
        $pdo->beginTransaction();
        // The lock FIRST: its primary key is what makes this run the only one.
        db_insert('fees_once_locks', ['lockKey' => FEES_FINES_CLEAR_LOCK, 'usedAt' => $now, 'usedBy' => $by,
            'members' => $plan['members'], 'total' => $plan['total'], 'reason' => mb_substr($reason, 0, 240), 'digest' => $plan['digest']]);
        foreach ($plan['rows'] as $r) {
            $what = implode(', ', array_filter([$r['fines'] ? 'fines ' . fees_money_text($r['fines']) : '', $r['dues'] ? 'dues ' . fees_money_text($r['dues']) : '',
                $r['membership'] ? 'membership ' . fees_money_text($r['membership']) : '']));
            $e = fees_post($r['memberId'], 'waiver', $r['amount'], ['periodKey' => 'fines-cleared:once', 'by' => $by,
                'note' => mb_substr('Account cleared for every active member (' . substr($now, 0, 10) . ') — ' . $what . '; imported charges not cleared: ' . $reason, 0, 240)]);
            if (!$e) throw new RuntimeException('post_failed:' . $r['memberId']);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if (fees_fines_clear_lock() !== null) return ['ok' => false, 'error' => 'already_used', 'lock' => fees_fines_clear_lock()];
        return ['ok' => false, 'error' => 'post_failed', 'detail' => 'Nothing was written.'];
    }
    audit('fees.fines.clear_once', $by, '', ['members' => $plan['members'], 'total' => $plan['total'], 'byKind' => $plan['byKind'], 'importedLeft' => $plan['importedLeft'],
        'reason' => $reason, 'digest' => $plan['digest']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'members' => $plan['members'], 'total' => $plan['total'], 'lock' => fees_fines_clear_lock()];
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
    /* The centre scope is part of the query, not a filter over its first
       rows: filtering the capped page meant a centre lead searching "Ade"
       could be told nobody matched when the first twenty-one Ades were all
       at somebody else's centre. And the printed ID is searched, since that
       is the number on the card the parent is holding. (The old escaped '%'
       and '_' had no ESCAPE clause, so an email with an underscore missed.) */
    [$qSql, $qArgs] = sql_text_search($q, ['fullName', 'displayId', 'memberId', 'email'], ['phone', 'parentPhone']);
    $scope = admin_centre_names_in_scope($g['requester']);
    $scopeSql = '';
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'members' => [], 'q' => $q, 'truncated' => false, 'max' => FEES_LOOKUP_MAX];
        $scopeSql = ' AND centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')';
        foreach ($scope as $nm) $qArgs[] = $nm;
    }
    $rows = db_all("SELECT * FROM members WHERE status <> 'deleted' AND $qSql$scopeSql
                    ORDER BY fullName LIMIT " . (FEES_LOOKUP_MAX + 1), $qArgs);
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
                  'credited' => (int)$b['credited'], 'phase' => (string)$b['tenure']['phase'],
                  /* The real money, so Charged − Received = Payable on screen; `charged`
                     also holds the training place, which nobody is asked to pay. */
                  'realCharged' => (int)$b['realCharged'], 'realCredited' => (int)$b['realCredited']];
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
            // The month a dues charge is FOR ("2026-10"), not the day it was posted: "this month's fee" is decided by it.
            'period' => preg_match('/^\d{4}-\d{2}$/', (string)($e['periodKey'] ?? '')) ? (string)$e['periodKey'] : '',
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
    /* The schedule is the training-fee watch's rows — the same builder the
       Control Room reads, so the member and the desk see one list. `schedule`
       keeps its old shape for the panel; `training` is the whole watch. */
    $watch = fees_training_watch($m, $cfg, $bal);
    $schedule = array_map(static fn($r) => ['sessionId' => $r['key'], 'name' => $r['label'], 'startDate' => $r['date'],
                                           'amount' => $r['amount'], 'state' => $r['state']], $watch['rows']);

    return ['ok' => true, 'enabled' => true, 'account' => [
        'memberId' => (string)$m['memberId'],
        /* The per-unit RATE, kept for older clients — never shown as "the
           training fee": ₦75,000 a session was being shown as the whole fee.
           `trainingTotal` is the place's cost, `trainingOwed` what becomes
           payable only if they leave before completing. */
        'trainingFeePerSession' => (int)$watch['perUnit'],
        'trainingTotal' => (int)$watch['total'],
        'trainingBasis' => (string)$watch['basis'],
        'trainingOwed' => (int)$bal['trainingOwed'],
        'schedule' => $schedule,
        'training' => $watch,
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
        // Paystack is configured: the account can offer "Pay online" (membership_balance_invoice).
        'payOnline' => function_exists('paystack_secret') && paystack_secret() !== '',
        // Paystack's charge on paying today's balance online, when the family bears it (paystack_family_charge).
        'payFee' => function_exists('paystack_secret') && paystack_secret() !== '' && function_exists('paystack_family_charge') ? paystack_family_charge((int)$bal['payable'], $cfg) : 0,
        'currency' => (string)$cfg['currency'],
    ]];
}

function admin_fees_void(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $entryId = trim((string)($p['entryId'] ?? ''));
    $reason = trim((string)($p['reason'] ?? ''));
    if ($reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $e = db_row('SELECT * FROM member_ledger WHERE entryId = ? LIMIT 1', [$entryId]);
    if ($e) { $sg = fees_scope_gate($g['requester'], (string)$e['memberId']); if (!$sg['ok']) return $sg; }
    if (!$e) return ['ok' => false, 'error' => 'not_found'];
    if (trim((string)($e['voidedAt'] ?? '')) !== '') return ['ok' => false, 'error' => 'already_void'];
    /* An entry another record stands behind is reversed THERE, not voided here:
       voiding an invoice's payment left the invoice paid, with its numbered
       receipt, while the account said unpaid; voiding a volunteer-pay deduction
       left the payout recorded as having taken it. */
    $pk = (string)($e['periodKey'] ?? ''); $cb = (string)($e['createdBy'] ?? '');
    if (str_starts_with($pk, 'minv:') || str_starts_with($cb, 'invoice:')) {
        return ['ok' => false, 'error' => 'void_at_source', 'detail' => 'This came from a membership invoice. Void the invoice in Membership payments, so the invoice, its receipt and the account agree.'];
    }
    if (str_starts_with($pk, 'volpay:')) {
        return ['ok' => false, 'error' => 'void_at_source', 'detail' => 'This was taken from volunteer pay. Correct it in Volunteer pay, so the payout and the account agree.'];
    }
    $by = (string)($g['requester']['memberId'] ?? '');
    db_update('member_ledger', ['voidedAt' => now_iso(), 'voidedBy' => $by,
                                'voidReason' => substr($reason, 0, 240)], ['entryId' => $entryId]);
    audit('fees.void', $by, (string)$e['memberId'], ['entryId' => $entryId, 'amount' => (int)$e['amount'], 'reason' => $reason], (string)($p['ip'] ?? ''));
    /* A voided payment can leave a fine the ledger had settled owed again; a
       voided charge can settle the next one. The conduct board reads the same. */
    if (function_exists('policy_fines_sync')) { try { policy_fines_sync((string)$e['memberId']); } catch (Throwable $ex) { error_log('[fees_void] fines sync: ' . $ex->getMessage()); } }
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
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
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
    $sg = fees_scope_gate($g['requester'], $id); if (!$sg['ok']) return $sg;
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
    $tot = fees_accrue_batch($limit, $cfg);
    audit('fees.accrue', (string)($g['requester']['memberId'] ?? ''), 'fees', $tot, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'accrued' => $tot, 'scanned' => $tot['members'], 'limit' => $limit, 'more' => !$tot['wrapped']];
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
const FEES_JOURNAL_PAGE = 100;
const FEES_JOURNAL_MAX = 500;
const FEES_JOURNAL_KINDS = ['membership', 'dues', 'fine', 'adjustment', 'payment', 'waiver', 'writeoff', 'training'];

/**
 * admin.fees.journal — every money movement across the accounts in scope, for
 * a period: who it was for, what it was, how it came, the reference, WHO
 * POSTED IT, and a void with who voided it and why. The question it exists to
 * answer is "what came in this month, by what means, and who keyed it" — the
 * one an auditor asks first, and one no screen here could answer: each
 * account showed its own lines and nothing showed them together.
 *
 * Filters are allow-listed by name (kind, direction, method, state); an
 * unknown value falls back to everything rather than erroring. The totals
 * are for the whole filter, not the drawn page. Scope is applied in the
 * query, per row.
 */
function admin_fees_journal(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $day = static fn($v) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$v) ? (string)$v : '';
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    $from = $day($p['from'] ?? '') ?: substr($today, 0, 8) . '01';
    $to = $day($p['to'] ?? '') ?: $today;
    if ($to < $from) [$from, $to] = [$to, $from];
    $toNext = gmdate('Y-m-d', strtotime($to . ' 00:00:00 UTC') + 86400);
    $where = ['l.createdAt >= ?', 'l.createdAt < ?']; $args = [$from, $toNext];
    $kind = (string)($p['kind'] ?? '');
    if (in_array($kind, FEES_JOURNAL_KINDS, true)) { $where[] = 'l.kind = ?'; $args[] = $kind; }
    $dir = (string)($p['direction'] ?? '');
    if (in_array($dir, ['charge', 'credit'], true)) { $where[] = 'l.direction = ?'; $args[] = $dir; }
    $state = (string)($p['state'] ?? '');
    if ($state === 'void') $where[] = "(l.voidedAt IS NOT NULL AND l.voidedAt <> '')";
    elseif ($state === 'live') $where[] = "(l.voidedAt IS NULL OR l.voidedAt = '')";
    $q = trim(mb_substr((string)($p['q'] ?? ''), 0, 80));
    if ($q !== '') { $where[] = '(LOWER(m.fullName) LIKE ? OR LOWER(l.memberId) LIKE ? OR LOWER(l.reference) LIKE ?)'; $like = '%' . mb_strtolower($q) . '%'; array_push($args, $like, $like, $like); }
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'rows' => [], 'total' => 0, 'from' => $from, 'to' => $to, 'totals' => ['received' => 0, 'byMethod' => [], 'charged' => 0, 'byKind' => [], 'waived' => 0, 'voided' => 0]];
        $where[] = 'm.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; array_push($args, ...$scope);
    }
    $sqlWhere = implode(' AND ', $where);
    $base = "FROM member_ledger l LEFT JOIN members m ON m.memberId = l.memberId WHERE $sqlWhere";
    // Totals for the whole filter, live rows only — a voided entry is counted as voided, not as money.
    $totals = ['received' => 0, 'byMethod' => [], 'charged' => 0, 'byKind' => [], 'waived' => 0, 'voided' => 0];
    foreach (db_all("SELECT l.kind, l.direction, l.method, l.voidedAt, l.amount $base", $args) as $r) {
        if (trim((string)($r['voidedAt'] ?? '')) !== '') { $totals['voided']++; continue; }
        $k = (string)$r['kind']; $a = (int)$r['amount'];
        if ($k === 'training' || $k === 'writeoff') continue;   // the place: never money anybody is asked for
        if ((string)$r['direction'] === 'charge') { $totals['charged'] += $a; $totals['byKind'][$k] = ($totals['byKind'][$k] ?? 0) + $a; }
        elseif ($k === 'payment') { $totals['received'] += $a; $m = (string)$r['method'] !== '' ? (string)$r['method'] : 'other'; $totals['byMethod'][$m] = ($totals['byMethod'][$m] ?? 0) + $a; }
        elseif ($k === 'waiver') $totals['waived'] += $a;
    }
    $roll = fees_journal_roll($from, $toNext, $scope, $q);
    $total = (int)(db_row("SELECT COUNT(*) c $base", $args)['c'] ?? 0);
    /* The route passes every query field through, so "not given" arrives as ''
       and (int)'' is 0 — which the floor turned into ONE row a page. A missing
       or nonsense limit is the default, never the minimum. */
    $limit = (int)($p['limit'] ?? 0) > 0 ? min(FEES_JOURNAL_MAX, (int)$p['limit']) : FEES_JOURNAL_PAGE;
    $offset = max(0, (int)($p['offset'] ?? 0));
    $rows = db_all("SELECT l.*, m.fullName, m.centre $base ORDER BY l.createdAt DESC, l.id DESC LIMIT $limit OFFSET $offset", $args);
    // Who posted and who voided, by name: one query for every id on the page.
    $people = array_values(array_unique(array_filter(array_merge(array_column($rows, 'createdBy'), array_column($rows, 'voidedBy')),
        static fn($x) => $x !== '' && $x !== null)));
    $names = [];
    if ($people) {
        $ph = implode(',', array_fill(0, count($people), '?'));
        foreach (db_all("SELECT memberId, fullName FROM members WHERE memberId IN ($ph)", $people) as $r) $names[(string)$r['memberId']] = (string)$r['fullName'];
    }
    $who = static fn($id) => $id === '' ? '' : ($names[$id] ?? (in_array($id, ['accrual', 'policy', 'system', 'paystack', 'ledger'], true) ? ['accrual' => 'Automatic (dues)', 'policy' => 'Automatic (conduct)', 'system' => 'Automatic', 'paystack' => 'Paystack', 'ledger' => 'Automatic'][$id] : $id));
    return ['ok' => true, 'from' => $from, 'to' => $to, 'total' => $total, 'limit' => $limit, 'offset' => $offset, 'totals' => $totals, 'roll' => $roll,
        'rows' => array_map(static fn($r) => [
            'entryId' => (string)$r['entryId'], 'memberId' => (string)$r['memberId'], 'fullName' => (string)($r['fullName'] ?? ''), 'centre' => (string)($r['centre'] ?? ''),
            'kind' => (string)$r['kind'], 'direction' => (string)$r['direction'], 'amount' => (int)$r['amount'], 'periodKey' => (string)$r['periodKey'],
            'note' => (string)$r['note'], 'method' => (string)$r['method'], 'reference' => (string)$r['reference'],
            'at' => (string)$r['createdAt'], 'by' => $who((string)($r['createdBy'] ?? '')),
            'void' => trim((string)($r['voidedAt'] ?? '')) !== '', 'voidedAt' => (string)($r['voidedAt'] ?? ''),
            'voidedBy' => $who((string)($r['voidedBy'] ?? '')), 'voidReason' => (string)($r['voidReason'] ?? ''),
        ], $rows)];
}

/**
 * The period as a statement of account for the whole book: what was owed when
 * it opened, what was charged, what came in, what was waived or credited, and
 * what was owed when it closed — a sum that must reconcile, month by month.
 *
 * Real money only (the training place and its write-offs are never owed), live
 * entries only, and deliberately NOT narrowed by the journal's kind, direction
 * or state filters: "fines only" has no opening balance. Centre scope and a
 * member search do narrow it, so one family's year reads the same way.
 *
 * "Owed" here is the net of every account — money paid ahead offsets a debt
 * elsewhere in the sum — and is labelled so on screen; Who owes is the gross.
 */
const FEES_ROLL_MONTHS_MAX = 24;
function fees_journal_roll(string $from, string $toNext, ?array $scope, string $q): array {
    $where = ["(l.voidedAt IS NULL OR l.voidedAt = '')", "l.kind NOT IN ('training','writeoff')", 'l.createdAt < ?']; $args = [$toNext];
    if ($q !== '') { $where[] = '(LOWER(m.fullName) LIKE ? OR LOWER(l.memberId) LIKE ?)'; $like = '%' . mb_strtolower($q) . '%'; array_push($args, $like, $like); }
    if ($scope !== null) {
        if (!$scope) return ['opening' => 0, 'charged' => 0, 'received' => 0, 'waived' => 0, 'otherCredit' => 0, 'closing' => 0, 'months' => [], 'monthsCut' => false];
        $where[] = 'm.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; array_push($args, ...$scope);
    }
    $sql = "SELECT CASE WHEN l.createdAt < ? THEN '' ELSE SUBSTR(l.createdAt, 1, 7) END mon, l.direction, l.kind, SUM(l.amount) s
            FROM member_ledger l LEFT JOIN members m ON m.memberId = l.memberId
            WHERE " . implode(' AND ', $where) . " GROUP BY mon, l.direction, l.kind";
    $opening = 0; $byMonth = [];
    foreach (db_all($sql, array_merge([$from], $args)) as $r) {
        $a = (int)$r['s']; $charge = (string)$r['direction'] === 'charge';
        if ((string)$r['mon'] === '') { $opening += $charge ? $a : -$a; continue; }
        $mm = &$byMonth[(string)$r['mon']];
        $mm = ($mm ?? ['charged' => 0, 'received' => 0, 'waived' => 0, 'otherCredit' => 0]);
        if ($charge) $mm['charged'] += $a;
        elseif ($r['kind'] === 'payment') $mm['received'] += $a;
        elseif ($r['kind'] === 'waiver') $mm['waived'] += $a;
        else $mm['otherCredit'] += $a;
        unset($mm);
    }
    ksort($byMonth);
    $run = $opening; $sum = ['charged' => 0, 'received' => 0, 'waived' => 0, 'otherCredit' => 0]; $months = [];
    foreach ($byMonth as $mon => $x) {
        $open = $run;
        $run += $x['charged'] - $x['received'] - $x['waived'] - $x['otherCredit'];
        foreach ($sum as $k => $_) $sum[$k] += $x[$k];
        $months[] = ['month' => $mon, 'opening' => $open] + $x + ['closing' => $run];
    }
    $cut = count($months) > FEES_ROLL_MONTHS_MAX;
    return ['opening' => $opening] + $sum + ['closing' => $run,
            'months' => $cut ? array_slice($months, -FEES_ROLL_MONTHS_MAX) : $months, 'monthsCut' => $cut];
}

/** The ageing bands a collector reads debt by: how long the oldest unpaid naira has been due. */
const FEES_AGE_BANDS = [['current', 'Up to 30 days overdue', 0], ['d31', '31–60 days', 31], ['d61', '61–90 days', 61], ['d90', 'Over 90 days', 91]];
function fees_age_band(int $days): string {
    $k = 'current'; foreach (FEES_AGE_BANDS as [$key, , $from]) if ($days >= $from) $k = $key; return $k;
}

/**
 * Who owes, as a collector reads it: what each family owes, how long the oldest
 * unpaid charge has been due, when they last paid, and what the debt is made of
 * — and the whole book aged into bands that add up to the total.
 *
 * ONE ledger read for the list. It used to read every member's ledger again
 * inside the loop (fees_balance → fees_entries), a query per row; now the rows
 * are read once, grouped, and handed to fees_balance / fees_charges_left.
 */
function admin_fees_arrears(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $cfg = fees_settings();
    $limit = (int)($p['limit'] ?? 0) > 0 ? min(FEES_ARREARS_PAGE_MAX, (int)$p['limit']) : FEES_ARREARS_PAGE;   // '' from the route is the default, not one row
    $byMember = []; $owedBy = [];
    foreach (db_all("SELECT * FROM member_ledger ORDER BY id") as $e) {
        $id = (string)$e['memberId'];
        $byMember[$id][] = $e;
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $owedBy[$id] = ($owedBy[$id] ?? 0) + ((string)$e['direction'] === 'charge' ? 1 : -1) * (int)$e['amount'];
    }
    $ids = array_keys(array_filter($owedBy, fn($v) => $v > 0));
    $out = []; $totalPayable = 0; $bands = array_fill_keys(array_column(FEES_AGE_BANDS, 0), 0);
    $scope = admin_centre_names_in_scope($g['requester']);
    $today = function_exists('attendance_today') ? attendance_today() : gmdate('Y-m-d');
    if ($ids) {
        foreach (array_chunk($ids, 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            $compOf = fees_comp_batch($chunk);
            foreach (db_all("SELECT * FROM members WHERE memberId IN ($ph)", $chunk) as $m) {
                if ($scope !== null && !in_array((string)($m['centre'] ?? ''), $scope, true)) continue;
                $entries = $byMember[(string)$m['memberId']] ?? [];
                // Every family's compliance and history from three queries for the chunk, never per row.
                $b = fees_balance($m, $cfg, null, $entries, $compOf[(string)$m['memberId']] ?? null);
                if ((int)$b['payable'] <= 0) continue;
                $totalPayable += (int)$b['payable'];
                // What is left on each charge, and so how old the debt is and what it is made of.
                $kindOf = []; foreach ($entries as $e) $kindOf[(string)$e['entryId']] = (string)$e['kind'];
                $made = ['dues' => 0, 'membership' => 0, 'fine' => 0, 'training' => (int)$b['trainingOwed'], 'other' => 0]; $oldest = ''; $ageOf = [];
                foreach (fees_charges_left($m, $cfg, $entries, $b['tenure']) as $eid => $l) {
                    if ($l['left'] <= 0) continue;
                    $k = $kindOf[$eid] ?? 'other'; $made[isset($made[$k]) ? $k : 'other'] += $l['left'];
                    $due = substr((string)$l['due'], 0, 10);
                    if ($due !== '' && ($oldest === '' || $due < $oldest)) $oldest = $due;
                    $days = $due !== '' ? max(0, (int)floor((strtotime($today . ' UTC') - strtotime($due . ' UTC')) / 86400)) : 0;
                    $bands[fees_age_band($days)] += $l['left'];
                }
                // Training owed on leaving has no charge row of its own: it is as old as the leaving, counted current.
                $made['other'] += max(0, (int)$b['payable'] - array_sum($made));
                $days = $oldest !== '' ? max(0, (int)floor((strtotime($today . ' UTC') - strtotime($oldest . ' UTC')) / 86400)) : 0;
                $last = null;
                foreach (array_reverse($entries) as $e) if ((string)$e['kind'] === 'payment' && trim((string)($e['voidedAt'] ?? '')) === '') { $last = $e; break; }
                $out[] = ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
                          'centre' => (string)($m['centre'] ?? ''),
                          'payable' => (int)$b['payable'], 'outstanding' => (int)$b['outstanding'],
                          'trainingEarned' => (int)$b['trainingEarned'],
                          'atCap' => !empty($b['atCap']),
                          'phase' => (string)$b['tenure']['phase'],
                          'remindOff' => (int)($m['duesRemindOff'] ?? 0) === 1,
                          'guardianPhone' => (string)($m['parentPhone'] ?? ''),
                          'oldestDue' => $oldest, 'daysOverdue' => $days, 'band' => fees_age_band($days),
                          'made' => $made,
                          'lastPaid' => $last ? ['date' => substr((string)$last['createdAt'], 0, 10), 'amount' => (int)$last['amount'], 'method' => (string)$last['method']] : null];
            }
        }
    }
    usort($out, fn($a, $b) => $b['payable'] <=> $a['payable']);
    $matched = count($out);
    $bandRows = array_map(fn($x) => ['key' => $x[0], 'label' => $x[1], 'amount' => (int)$bands[$x[0]]], FEES_AGE_BANDS);
    // Training owed on leaving is in the payable but on no charge: counted current, so the bands add up to the total.
    $gap = $totalPayable - array_sum($bands); if ($gap > 0) $bandRows[0]['amount'] += $gap;
    return ['ok' => true, 'arrears' => array_slice($out, 0, $limit),
            'matched' => $matched, 'truncated' => $matched > $limit,
            'totalPayable' => $totalPayable, 'aging' => $bandRows, 'settings' => $cfg];
}

/* ══ Bulk fines: a sheet of fines, matched to members, checked before written ══
 *
 * One fine is admin_fees_charge(); this is the same charge for a sheet of
 * them — the register a coordinator kept on paper, typed up. What makes it
 * safe is the same three rules as every other import here:
 *
 *  · MATCHING IS SHOWN, NEVER GUESSED. A row names its member by whatever the
 *    sheet had — the printed ID, the member number, an email, a name — and the
 *    verdict says how it matched and who it found, so the operator reads
 *    "Ada Okafor (026-014), matched by name" before anybody is charged. An
 *    email that two siblings share, or a name two members carry, is refused as
 *    ambiguous with the candidates named; it is never resolved to the first.
 *  · CHECK, THEN APPLY WHAT WAS CHECKED. The dry run returns a digest; the
 *    apply recomputes it from what it received and refuses on a mismatch.
 *  · A SHEET UPLOADED TWICE FINES ONCE. Each row's ledger key is derived from
 *    the member, reason, amount, date and note, so the second upload reports
 *    `already` rather than charging the family again. Two genuinely separate
 *    fines on one day for one reason differ in their note.
 */
const FEES_FINE_IMPORT_MAX = 500;

/** Reason words a sheet actually contains, mapped onto the fixed vocabulary.
 *  An exact word first, then a word INSIDE the cell ("came late to class",
 *  "broke the projector"), because a register is written in sentences. */
function fees_fine_reason_code(string $raw): ?string {
    $r = strtolower(trim(preg_replace('/\s+/', ' ', $raw)));
    if ($r === '') return null;
    if (isset(FEES_FINE_REASONS[$r])) return $r;
    foreach (FEES_FINE_REASONS as $code => $label) if (strtolower($label) === $r) return $code;
    $syn = ['lateness' => 'late', 'latecoming' => 'late', 'late coming' => 'late', 'tardy' => 'late', 'late arrival' => 'late',
            'absence' => 'absent', 'absent without notice' => 'absent', 'missed' => 'absent', 'missed session' => 'absent',
            'damage' => 'equipment', 'damaged' => 'equipment', 'lost' => 'equipment', 'lost equipment' => 'equipment',
            'misconduct' => 'conduct', 'behaviour' => 'conduct', 'behavior' => 'conduct', 'indiscipline' => 'conduct'];
    if (isset($syn[$r])) return $syn[$r];
    $words = [
        'late'      => ['/\blate\b/', '/\blateness\b/', '/\btard/', '/\bcame in at\b/', '/\bafter (the )?bell\b/'],
        'absent'    => ['/\babsen/', '/\bmissed\b/', '/\btruan/', '/\bdid not (come|attend|show)/', '/\bdidn.?t (come|attend|show)/', '/\bno.?show\b/', '/\bskipped\b/'],
        /* Only the things the programme lends: "broke a window" is damage, but
           not to equipment, and stays a written reason for a person to read. */
        'equipment' => ['/\bequipment\b/', '/\blaptop/', '/\bprojector/', '/\btablet/', '/\bcharger/', '/\bheadphone/', '/\bkeyboard/', '/\bmouse\b/', '/\bcamera/', '/\bcomputer/', '/\bchess (set|board|clock)/'],
        'conduct'   => ['/\bconduct\b/', '/\bbehavio/', '/\bfight/', '/\brude\b/', '/\bdisrespect/', '/\bbully/', '/\bindisciplin/', '/\bnoise/', '/\bphone\b/', '/\buniform\b/', '/\bdisobe/'],
    ];
    $hits = [];
    foreach ($words as $code => $res) foreach ($res as $re) if (preg_match($re, $r)) { $hits[$code] = true; break; }
    // Exactly one kind named: that is the reason. Two ("late and rude") is a person's call, so it stays written.
    return count($hits) === 1 ? array_key_first($hits) : null;
}

/** "₦5,000", "5000", "5k", "N5,000.00", "#2,000", "2000 naira", "2,000/-" → whole naira, or 0 when unreadable.
 *  "#" is how a Nigerian keyboard writes the naira sign. */
function fees_fine_amount(string $raw): int {
    $s = strtolower(str_replace([',', ' ', "\u{00a0}", '₦', '#'], '', trim($raw)));
    $s = preg_replace('#(/-|=)$#', '', $s);
    $s = preg_replace('/(naira|ngn)$/', '', $s);
    $s = preg_replace('/^(ngn|n)/', '', $s);
    if (preg_match('/^(\d+(?:\.\d+)?)k$/', $s, $m)) return (int)round((float)$m[1] * 1000);
    return preg_match('/^\d+(?:\.\d{1,2})?$/', $s) ? (int)round((float)$s) : 0;
}

/** A sheet's date as YYYY-MM-DD — ISO, the day-first form Nigerian sheets use
 *  (04/10/2026, 4.10.26), the written forms ("4 Oct 2026", "4th October, 2026",
 *  "Oct 4, 2026", "Saturday 4 October 2026") and an Excel day number. */
function fees_fine_date(string $raw): ?string {
    $s = trim(preg_replace('/\s+/', ' ', $raw));
    if ($s === '') return '';
    $mon = ['jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6, 'jul' => 7, 'aug' => 8, 'sep' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12];
    $yy = static fn($y) => $y < 100 ? 2000 + $y : $y;
    $l = strtolower(preg_replace('/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i', '', $s));
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t].*)?$/', $l, $m)) [$y, $mo, $d] = [(int)$m[1], (int)$m[2], (int)$m[3]];
    elseif (preg_match('#^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$#', $l, $m)) [$d, $mo, $y] = [(int)$m[1], (int)$m[2], $yy((int)$m[3])];
    elseif (preg_match('/^(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z]{3})[a-z]*\.?,? (\d{2}|\d{4})$/', $l, $m) && isset($mon[$m[2]])) [$d, $mo, $y] = [(int)$m[1], $mon[$m[2]], $yy((int)$m[3])];
    elseif (preg_match('/^([a-z]{3})[a-z]*\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{2}|\d{4})$/', $l, $m) && isset($mon[$m[1]])) [$d, $mo, $y] = [(int)$m[2], $mon[$m[1]], $yy((int)$m[3])];
    elseif (preg_match('/^\d{5}(?:\.\d+)?$/', $l)) return gmdate('Y-m-d', (int)round(((float)$l - 25569) * 86400));
    else return null;
    return checkdate($mo, $d, $y) ? sprintf('%04d-%02d-%02d', $y, $mo, $d) : null;
}

/**
 * Who a sheet row means. Returns ['member' => row, 'by' => how] or
 * ['error' => code, 'candidates' => [...]] — never a guess.
 *
 * $centre, when the sheet has a centre column (or the operator named one for
 * the whole file), is a TIE-BREAKER only: two Ada Okafors at different centres
 * become one at Egbeda. It never turns a non-match into a match.
 */
function fees_fine_match(string $ref, string $name, string $email, string $centre = ''): array {
    $ref = trim($ref); $name = trim(preg_replace('/\s+/', ' ', $name)); $email = strtolower(trim($email));
    $shape = static fn($m) => ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? '')];
    $live = "COALESCE(status,'') NOT IN ('merged','deleted')";
    /* A Summer account sharing a parent's email or a name is not a reason to
       call an NGG member ambiguous; but when only a Summer account matches, it
       is returned, so the verdict can say why it cannot be fined here. */
    $prefer = static function (array $rows): array {
        $ngg = array_values(array_filter($rows, 'member_is_ngg'));
        return $ngg ?: $rows;
    };
    $cen = mb_strtolower(trim($centre));
    // Narrow by centre only when it leaves exactly the people at that centre.
    $atCentre = static function (array $rows) use ($cen): array {
        if ($cen === '' || count($rows) < 2) return $rows;
        $here = array_values(array_filter($rows, static fn($m) => mb_strtolower(trim((string)($m['centre'] ?? ''))) === $cen));
        return $here ?: $rows;
    };
    $one = static function (array $rows, string $by) use ($atCentre, $shape, $cen): ?array {
        if (count($rows) === 1) return ['member' => $rows[0], 'by' => $by];
        if (count($rows) > 1) {
            $n = $atCentre($rows);
            if (count($n) === 1) return ['member' => $n[0], 'by' => $by . '+centre'];
            return ['error' => 'ambiguous', 'candidates' => array_map($shape, array_slice($n, 0, 5))];
        }
        return null;
    };
    /* A register often writes the number inside the name: "Ada Okafor (026-014)",
       "026-014 Ada Okafor". The number is the identifier; the rest is the name. */
    if ($ref === '' && $name !== '' && preg_match('/\b(\d{3}-\d{3}|NGG-[A-Z0-9-]+)\b/i', $name, $m)) {
        $ref = $m[1];
        $name = trim(preg_replace('/\s*[\(\[]?\s*' . preg_quote($m[1], '/') . '\s*[\)\]]?\s*/i', ' ', $name));
    }
    if ($ref !== '') {
        // An identifier — member number, printed ID or a card's own format.
        $hit = function_exists('checkin_member_resolve') ? checkin_member_resolve($ref) : null;
        if ($hit && !empty($hit['member'])) return ['member' => $hit['member'], 'by' => 'id'];
        if (strpos($ref, '@') !== false && $email === '') $email = strtolower($ref);
        elseif ($name === '') $name = $ref;
    }
    if ($email !== '') {
        $rows = $prefer(db_all("SELECT * FROM members WHERE lower(email) = ? AND $live", [$email]));
        if ($name !== '') {
            $rows2 = array_values(array_filter($rows, static fn($m) => fees_fine_name_key((string)$m['fullName']) === fees_fine_name_key($name)));
            if (count($rows2) === 1) return ['member' => $rows2[0], 'by' => 'email+name'];
        }
        // Siblings share a parent's email: more than one means ask, not pick.
        if (($r = $one($rows, 'email')) !== null) return $r;
    }
    if ($name !== '') {
        $rows = $prefer(db_all("SELECT * FROM members WHERE lower(trim(fullName)) = ? AND $live LIMIT 12", [mb_strtolower($name)]));
        if (($r = $one($rows, 'name')) !== null) return $r;
        /* Sheets typed by hand write "Mobolaji Daniel" for Daniel Mobolaji, and
           mark rows with "*". The same words in any order still has to point at
           exactly one person. */
        $key = fees_fine_name_key($name);
        if ($key !== '') {
            $idx = fees_fine_name_index();
            if (($r = $one($prefer($idx['byKey'][$key] ?? []), 'name_any')) !== null) return $r;
            /* "Ada Okafor" for Ada Chioma Okafor: every word the sheet wrote is
               one of the member's, at least two of them, and only one member
               fits. A one-word name ("Ada") is never enough. */
            $want = explode(' ', $key);
            if (count($want) >= 2) {
                $fit = [];
                foreach ($idx['byKey'] as $k => $list) {
                    $have = explode(' ', $k);
                    if (count($have) > count($want) && !array_diff($want, $have)) foreach ($list as $m) $fit[] = $m;
                }
                if (($r = $one($prefer($fit), 'name_part')) !== null) return $r;
            }
            /* A near miss ("Ounfayo" for Ogunfayo) is offered as a candidate
               and never charged. */
            $near = [];
            foreach ($idx['byKey'] as $k => $list) {
                if (abs(strlen($k) - strlen($key)) > 3) continue;
                $d = levenshtein($key, $k);
                if ($d <= max(2, intdiv(strlen($key), 8))) foreach ($list as $m) $near[] = [$d, $m];
            }
            usort($near, static fn($a, $b) => $a[0] <=> $b[0]);
            if ($near) return ['error' => 'no_match', 'candidates' => array_map(static fn($x) => $shape($x[1]), array_slice($near, 0, 3))];
        }
    }
    return ['error' => ($ref === '' && $name === '' && $email === '') ? 'member_required' : 'no_match', 'candidates' => []];
}

/** A name as a bag of words: lower case, letters only, sorted. */
function fees_fine_name_key(string $name): string {
    $w = preg_split('/\s+/u', trim(mb_strtolower(preg_replace('/[^\p{L}\s\-\']+/u', ' ', $name) ?? ''))) ?: [];
    $w = array_values(array_filter(array_map(static fn($x) => trim($x, "-'"), $w), static fn($x) => $x !== ''));
    sort($w);
    return implode(' ', $w);
}

/** Every live member by name key, built once per request — one query for the
 *  whole sheet rather than one per row. */
function fees_fine_name_index(bool $reset = false): array {
    static $idx = null;
    if ($reset) { $idx = null; return []; }
    if ($idx !== null) return $idx;
    $idx = ['byKey' => []];
    foreach (db_all("SELECT * FROM members WHERE COALESCE(status,'') NOT IN ('merged','deleted') AND COALESCE(fullName,'') <> ''") as $m) {
        $k = fees_fine_name_key((string)$m['fullName']);
        if ($k !== '') $idx['byKey'][$k][] = $m;
    }
    return $idx;
}

/**
 * Room under a Club conduct rule for one more fine — the same reading
 * conduct_rule_allow() makes when the fine is posted, plus what earlier rows
 * of the same file have already used. ['off' => bool, 'left' => int|null
 * (null: no cap), 'rule' => key].
 */
function fees_fine_rule_room(string $memberId, string $reason, string $note, array $usedInFile): array {
    $none = ['off' => false, 'left' => null, 'rule' => ''];
    if (!function_exists('conduct_rule_key')) return $none;
    $k = conduct_rule_key(['method' => $reason, 'note' => $note]); if ($k === '') return $none;
    try { $r = db_row('SELECT * FROM conduct_rules WHERE reason = ? ORDER BY id LIMIT 1', [$k]); } catch (Throwable $e) { return $none; }
    if (!$r) return $none;
    if (!(int)$r['active']) return ['off' => true, 'left' => 0, 'rule' => $k];
    if ((int)$r['capTerm'] <= 0) return ['off' => false, 'left' => null, 'rule' => $k];
    $big = FEES_AMOUNT_MAX * 100;
    $left = conduct_rule_allow($memberId, $big, ['method' => $reason, 'note' => $note]);
    return ['off' => false, 'left' => max(0, $left - ($usedInFile[$memberId . '|' . $k] ?? 0)), 'rule' => $k];
}

/* ── The Club's conduct rules, from the money side ─────────────────────────
   One rule per kind of fine (late, absent, equipment, conduct): an amount a
   fine of that kind is "normally", a cap per term, and a switch. They used to
   be editable only from the Club portal, while the fines they govern were
   uploaded from Dues & arrears — so an operator looking at "capped" on an
   upload had no way to see or change the cap from the screen that showed it.
   These two ops are the Control Room's door to the SAME rows; the Club
   portal's own toggle still works and reads the same table. A rule that has
   governed fines is never deleted, only switched off: posted fines point at
   its kind, and "why was this capped in March" must still have an answer. */
const FEES_RULE_KINDS = ['late', 'absent', 'equipment', 'conduct'];
/** The most fines one register cell may stand for ("Late: 3" is three lates). */
const FEES_FINE_COUNT_MAX = 20;
/** What a register may bring over besides fines, and how each is written on the account. */
const FEES_IMPORT_KINDS = ['fine', 'dues', 'membership'];
const FEES_IMPORT_KIND_LABELS = ['fine' => 'Fine', 'dues' => 'Dues brought over', 'membership' => 'Membership brought over'];

/** The standard amount a rule sets for ONE fine of this kind; 0 when there is none. */
function fees_fine_rule_amount(string $reason): int {
    if (!in_array($reason, FEES_RULE_KINDS, true)) return 0;
    if (function_exists('cp_rules_seed')) cp_rules_seed();
    try { $r = db_row('SELECT amount FROM conduct_rules WHERE reason = ? ORDER BY id LIMIT 1', [$reason]); } catch (Throwable $e) { return 0; }
    return $r ? max(0, (int)$r['amount']) : 0;
}

/** admin.fees.fineRules — every rule, with what it has governed this term. */
function admin_fees_fine_rules(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    return fees_fine_rules_data();
}
/** The written rules and this term's use of them — the read behind both the fees desk and the Rules page (admin.policy.rules). */
function fees_fine_rules_data(): array {
    if (function_exists('cp_rules_seed')) cp_rules_seed();
    [$from, $to] = function_exists('cp_term_bounds') ? cp_term_bounds('') : [gmdate('Y-01-01'), gmdate('Y-12-31')];
    // One pass over this term's fines, not one per rule (the Club portal's reader looped).
    $by = []; $all = ['n' => 0, 'total' => 0];
    foreach (db_all("SELECT amount, method, note FROM member_ledger WHERE kind = 'fine' AND COALESCE(voidedAt,'') = '' AND substr(createdAt,1,10) BETWEEN ? AND ?", [$from, $to]) as $e) {
        $k = function_exists('conduct_rule_key') ? conduct_rule_key(['method' => $e['method'], 'note' => $e['note']]) : '';
        $by[$k]['n'] = ($by[$k]['n'] ?? 0) + 1; $by[$k]['total'] = ($by[$k]['total'] ?? 0) + (int)$e['amount'];
        $all['n']++; $all['total'] += (int)$e['amount'];
    }
    // Breaches recorded against each written rule this term — one grouped query.
    $breaches = [];
    foreach (db_all("SELECT kind, COUNT(*) c FROM infractions WHERE kind LIKE 'rule:%' AND (voidedAt IS NULL OR voidedAt = '') AND date BETWEEN ? AND ? GROUP BY kind", [$from, $to]) as $b) $breaches[substr((string)$b['kind'], 5)] = (int)$b['c'];
    $rules = [];
    foreach (db_all('SELECT * FROM conduct_rules ORDER BY id') as $r) {
        $k = (string)$r['reason'];
        $rules[] = ['ruleId' => (string)$r['ruleId'], 'reason' => $k, 'reasonLabel' => $k !== '' ? (FEES_FINE_REASONS[$k] ?? $k) : '',
            'name' => (string)$r['name'], 'whenText' => (string)$r['whenText'], 'amount' => (int)$r['amount'], 'capTerm' => (int)$r['capTerm'],
            'active' => (bool)(int)$r['active'], 'updatedAt' => (string)($r['updatedAt'] ?? ''),
            // What a breach costs besides money, and what its Nth breach in a session escalates to (policy_apply_rules).
            'jumps' => (int)($r['jumps'] ?? 0), 'escalateAfter' => (int)($r['escalateAfter'] ?? 0), 'escalateTo' => (string)($r['escalateTo'] ?? ''),
            'suspendDays' => (int)($r['suspendDays'] ?? 7), 'reentryFee' => (int)($r['reentryFee'] ?? 0),
            'breaches' => (int)($breaches[(string)$r['ruleId']] ?? 0),
            'thisTerm' => $k !== '' ? ['n' => $by[$k]['n'] ?? 0, 'total' => $by[$k]['total'] ?? 0] : ['n' => 0, 'total' => 0]];
    }
    $taken = array_values(array_filter(array_map(static fn($r) => $r['reason'], $rules)));
    return ['ok' => true, 'rules' => $rules, 'term' => ['from' => $from, 'to' => $to], 'thisTerm' => $all,
            'kinds' => array_map(static fn($k) => [$k, FEES_FINE_REASONS[$k], in_array($k, $taken, true)], FEES_RULE_KINDS),
            'amountMax' => FEES_AMOUNT_MAX, 'countMax' => FEES_FINE_COUNT_MAX];
}

/**
 * admin.fees.fineRuleSave — create a rule, or change one. Only fines posted
 * from now on are affected; a fine already on an account keeps its amount.
 */
function admin_fees_fine_rule_save(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $by = (string)($g['requester']['memberId'] ?? '');
    if (function_exists('cp_rules_seed')) cp_rules_seed();
    $id = is_scalar($p['ruleId'] ?? null) ? trim((string)$p['ruleId']) : '';
    $cur = $id !== '' ? db_row('SELECT * FROM conduct_rules WHERE ruleId = ?', [$id]) : null;
    if ($id !== '' && !$cur) return ['ok' => false, 'error' => 'not_found'];
    $str = static fn($k, $d) => array_key_exists($k, $p) && is_scalar($p[$k]) ? trim((string)$p[$k]) : $d;
    $int = static function ($k, $d) use ($p) {
        if (!array_key_exists($k, $p) || $p[$k] === '' || $p[$k] === null) return $d;
        return is_numeric($p[$k]) && (float)$p[$k] === floor((float)$p[$k]) ? (int)$p[$k] : -1;
    };
    $next = [
        'name' => $str('name', $cur ? (string)$cur['name'] : ''),
        'whenText' => $str('whenText', $cur ? (string)$cur['whenText'] : ''),
        'reason' => $str('reason', $cur ? (string)$cur['reason'] : ''),
        'amount' => $int('amount', $cur ? (int)$cur['amount'] : 0),
        'capTerm' => $int('capTerm', $cur ? (int)$cur['capTerm'] : 0),
        'active' => array_key_exists('active', $p) ? (!empty($p['active']) && $p['active'] !== 'false' ? 1 : 0) : ($cur ? (int)$cur['active'] : 1),
        'jumps' => $int('jumps', $cur ? (int)($cur['jumps'] ?? 0) : 0),
        'escalateAfter' => $int('escalateAfter', $cur ? (int)($cur['escalateAfter'] ?? 0) : 0),
        'escalateTo' => $str('escalateTo', $cur ? (string)($cur['escalateTo'] ?? '') : ''),
        'suspendDays' => $int('suspendDays', $cur ? (int)($cur['suspendDays'] ?? 7) : 7),
        'reentryFee' => $int('reentryFee', $cur ? (int)($cur['reentryFee'] ?? 0) : 0),
    ];
    // The whole payload is checked before anything is written.
    if (mb_strlen($next['name']) < 3 || mb_strlen($next['name']) > 160) return ['ok' => false, 'error' => 'bad_name'];
    if (mb_strlen($next['whenText']) > 200) return ['ok' => false, 'error' => 'bad_when'];
    if ($next['reason'] !== '' && !in_array($next['reason'], FEES_RULE_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    if ($next['amount'] < 0 || $next['amount'] > FEES_AMOUNT_MAX) return ['ok' => false, 'error' => 'bad_amount', 'max' => FEES_AMOUNT_MAX];
    if ($next['capTerm'] < 0 || $next['capTerm'] > FEES_AMOUNT_MAX) return ['ok' => false, 'error' => 'bad_cap', 'max' => FEES_AMOUNT_MAX];
    if ($next['capTerm'] > 0 && $next['amount'] > $next['capTerm']) return ['ok' => false, 'error' => 'cap_below_fine'];
    if ($next['jumps'] < 0 || $next['jumps'] > 200) return ['ok' => false, 'error' => 'bad_jumps', 'max' => 200];
    if (!in_array($next['escalateTo'], ['', 'suspension', 'review'], true)) return ['ok' => false, 'error' => 'bad_escalate'];
    if ($next['escalateAfter'] < 0 || $next['escalateAfter'] > 60) return ['ok' => false, 'error' => 'bad_escalate_after', 'max' => 60];
    // An escalation needs both halves: how many breaches, and to what. Half of one would govern nothing while looking set.
    if (($next['escalateTo'] === '') !== ($next['escalateAfter'] === 0)) return ['ok' => false, 'error' => 'escalate_incomplete'];
    if ($next['suspendDays'] < 1 || $next['suspendDays'] > 365) return ['ok' => false, 'error' => 'bad_suspend_days', 'max' => 365];
    if ($next['reentryFee'] < 0 || $next['reentryFee'] > FEES_AMOUNT_MAX) return ['ok' => false, 'error' => 'bad_reentry', 'max' => FEES_AMOUNT_MAX];
    // conduct_rule_allow() reads the FIRST rule of a kind, so a second one would govern nothing while looking live.
    if ($next['reason'] !== '') {
        $other = db_row('SELECT ruleId FROM conduct_rules WHERE reason = ? AND ruleId <> ? LIMIT 1', [$next['reason'], $id]);
        if ($other) return ['ok' => false, 'error' => 'kind_taken', 'ruleId' => (string)$other['ruleId']];
    }
    if ($cur) {
        $was = ['name' => (string)$cur['name'], 'whenText' => (string)$cur['whenText'], 'reason' => (string)$cur['reason'],
                'amount' => (int)$cur['amount'], 'capTerm' => (int)$cur['capTerm'], 'active' => (int)$cur['active'],
                'jumps' => (int)($cur['jumps'] ?? 0), 'escalateAfter' => (int)($cur['escalateAfter'] ?? 0), 'escalateTo' => (string)($cur['escalateTo'] ?? ''),
                'suspendDays' => (int)($cur['suspendDays'] ?? 7), 'reentryFee' => (int)($cur['reentryFee'] ?? 0)];
        $diff = array_keys(array_filter($next, static fn($v, $k) => $was[$k] !== $v, ARRAY_FILTER_USE_BOTH));
        if (!$diff) return ['ok' => true, 'unchanged' => true, 'ruleId' => $id];
        db_update('conduct_rules', $next + ['updatedAt' => now_iso()], ['ruleId' => $id]);
        if (function_exists('policy_rules_index')) policy_rules_index(true);
        audit('fees.rule.save', $by, $id, ['changed' => $diff, 'from' => array_intersect_key($was, array_flip($diff)), 'to' => array_intersect_key($next, array_flip($diff))], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'ruleId' => $id, 'changed' => $diff];
    }
    $id = 'RULE-' . strtoupper(rand_hex(4));
    db_insert('conduct_rules', $next + ['ruleId' => $id, 'createdBy' => $by, 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
    if (function_exists('policy_rules_index')) policy_rules_index(true);
    audit('fees.rule.create', $by, $id, $next, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ruleId' => $id, 'created' => true];
}

/**
 * admin.fees.fineImport — rows: [{member, name, email, amount, reason, note, date}].
 * dryRun: true returns per-row verdicts and a digest and writes nothing; the
 * apply must carry that digest back.
 */
function admin_fees_fine_import(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $rows = is_array($p['rows'] ?? null) ? array_values($p['rows']) : [];
    if (!$rows) return ['ok' => false, 'error' => 'no_rows'];
    if (count($rows) > FEES_FINE_IMPORT_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => FEES_FINE_IMPORT_MAX];
    $dry = !empty($p['dryRun']);
    $req = $g['requester'];
    $by = (string)($req['memberId'] ?? '');
    $str = static fn($r, $k) => is_scalar($r[$k] ?? null) ? trim((string)$r[$k]) : '';

    // A centre named for the whole file breaks ties between members of the same name.
    $defCentre = is_scalar($p['centre'] ?? null) ? trim((string)$p['centre']) : '';
    $today = gmdate('Y-m-d');
    // Validate and match every row before anything is written.
    fees_fine_name_index(true);
    $plan = []; $seen = []; $ruleUsed = [];
    foreach ($rows as $i => $r) {
        $r = is_array($r) ? $r : [];
        $v = ['row' => $i + 1, 'verdict' => 'failed'];
        /* A sheet's "Null", "-" or empty cell means no fine, not a bad one —
           unless the row says WHAT the fine is for: "Late" ticked, or "Late: 3"
           in a register, is three late fines at the rule's standard amount. */
        $blank = in_array(strtolower($str($r, 'amount')), ['', 'null', 'nil', 'none', '-', '—', 'n/a', 'na'], true);
        $count = (int)($r['count'] ?? 0);
        // A written 0 is somebody saying "no fine" — never a cue for the standard amount.
        if (preg_match('/^[₦#]?\s*0+(\.0+)?$/u', $str($r, 'amount'))) { $v['verdict'] = 'skipped'; $plan[] = $v + ['error' => 'no_amount', 'fullName' => $str($r, 'name')]; continue; }
        if ($count < 0 || $count > FEES_FINE_COUNT_MAX) { $plan[] = $v + ['error' => 'bad_count', 'fullName' => $str($r, 'name'), 'max' => FEES_FINE_COUNT_MAX]; continue; }
        if ($blank && $count === 0 && $str($r, 'reason') === '') {
            $v['verdict'] = 'skipped'; $plan[] = $v + ['error' => 'no_amount', 'fullName' => $str($r, 'name')]; continue;
        }
        $match = fees_fine_match($str($r, 'member'), $str($r, 'name'), $str($r, 'email'), $str($r, 'centre') !== '' ? $str($r, 'centre') : $defCentre);
        if (isset($match['error'])) { $plan[] = $v + ['error' => $match['error'], 'candidates' => $match['candidates']]; continue; }
        $m = $match['member'];
        $v += ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
               'matchedBy' => $match['by']];
        if (!member_is_ngg($m)) { $plan[] = $v + ['error' => 'not_ngg_member']; continue; }
        if (!admin_centre_allowed($req, (string)($m['centre'] ?? ''))) { $plan[] = $v + ['error' => 'out_of_scope']; continue; }
        $note = mb_substr($str($r, 'note'), 0, 200);
        /* Dues and membership brought over in the same register. A "Dues"
           column used to be read as the fine's amount, so arrears were posted
           as FINES — and where a sheet had a Fines column too, one of the two
           was silently dropped. They are their own kind of charge: no conduct
           reason, no conduct rule, and keyed `import:` so every guard that
           leaves imported money alone (fees_entry_imported) knows them. */
        $kind = in_array($str($r, 'kind'), FEES_IMPORT_KINDS, true) ? $str($r, 'kind') : 'fine';
        if ($kind !== 'fine') {
            $amount = fees_fine_amount($str($r, 'amount'));
            if ($blank || $amount <= 0 || $amount > FEES_AMOUNT_MAX) { $plan[] = $v + ['kind' => $kind] + ($blank ? ['verdict' => 'skipped', 'error' => 'no_amount'] : ['error' => 'bad_amount']); continue; }
            $date = fees_fine_date($str($r, 'date'));
            if ($date === null) { $plan[] = $v + ['kind' => $kind, 'error' => 'bad_date']; continue; }
            if ($date !== '' && $date > $today) { $plan[] = $v + ['kind' => $kind, 'error' => 'date_in_future', 'date' => $date]; continue; }
            $key = 'import:' . $kind . ':' . substr(hash('sha256', implode("\x1f", [$m['memberId'], $kind, $amount, $date, mb_strtolower($note)])), 0, 20);
            if (isset($seen[$key])) { $plan[] = $v + ['kind' => $kind, 'error' => 'duplicate_in_file', 'detail' => 'same as row ' . $seen[$key]]; continue; }
            $seen[$key] = $i + 1;
            $exists = db_row("SELECT entryId FROM member_ledger WHERE memberId = ? AND kind = ? AND periodKey = ? AND COALESCE(voidedAt,'') = '' LIMIT 1",
                             [(string)$m['memberId'], $kind, $key]);
            $v['verdict'] = $exists ? 'already' : 'fine';
            $plan[] = $v + ['kind' => $kind, 'amount' => $amount, 'reason' => $kind, 'reasonLabel' => FEES_IMPORT_KIND_LABELS[$kind],
                            'note' => $note, 'date' => $date, '_key' => $key];
            continue;
        }
        $reason = fees_fine_reason_code($str($r, 'reason'));
        /* No reason column, but a note that says it ("came 40 minutes late"):
           the note names the reason and stays as the note. */
        if ($reason === null && $str($r, 'reason') === '' && $note !== '') $reason = fees_fine_reason_code($note);
        if ($reason === null) {
            // An unknown word is kept as the written reason rather than lost.
            if ($str($r, 'reason') === '' && $note === '') { $plan[] = $v + ['error' => 'reason_required']; continue; }
            $note = trim($str($r, 'reason') . ($note !== '' ? ' — ' . $note : ''));
            $reason = 'other';
        }
        if ($reason === 'other' && $note === '') { $plan[] = $v + ['error' => 'note_required']; continue; }
        $standard = 0;
        if ($blank) {
            // No figure: the rule's standard amount, once per fine the cell stands for.
            $each = fees_fine_rule_amount($reason);
            if ($each <= 0) { $plan[] = $v + ['error' => 'no_standard_amount', 'detail' => $reason]; continue; }
            $standard = max(1, $count);
            $amount = $each * $standard;
        } else {
            $amount = fees_fine_amount($str($r, 'amount'));
        }
        if ($amount <= 0 || $amount > FEES_AMOUNT_MAX) { $plan[] = $v + ['error' => 'bad_amount']; continue; }
        $date = fees_fine_date($str($r, 'date'));
        if ($date === null) { $plan[] = $v + ['error' => 'bad_date']; continue; }
        // A fine for a day that has not come is a typing slip (04/10 for 10/04), not a fine.
        if ($date !== '' && $date > $today) { $plan[] = $v + ['error' => 'date_in_future', 'date' => $date]; continue; }
        $key = 'bulkfine:' . substr(hash('sha256', implode("\x1f", [$m['memberId'], $reason, $amount, $date, mb_strtolower($note)])), 0, 20);
        if (isset($seen[$key])) { $plan[] = $v + ['error' => 'duplicate_in_file', 'detail' => 'same as row ' . $seen[$key]]; continue; }
        $seen[$key] = $i + 1;
        $exists = db_row("SELECT entryId FROM member_ledger WHERE memberId = ? AND kind = 'fine' AND periodKey = ? AND COALESCE(voidedAt,'') = '' LIMIT 1",
                         [(string)$m['memberId'], $key]);
        /* The Club's conduct rules apply to every fine at the moment it is
           posted (fees_post → conduct_rule_allow): a rule switched off posts
           nothing, a capped rule posts what is left of its cap this term. The
           check used to promise the sheet's figure and the post then reported
           "could not be posted" with no reason, or posted less than shown. So
           the rule is asked here, with the earlier rows of this same file
           counted against the cap, and the verdict says what will really post. */
        $asked = $amount; $capped = false;
        if (!$exists) {
            $room = fees_fine_rule_room((string)$m['memberId'], $reason, $note, $ruleUsed);
            if ($room['off']) { $plan[] = $v + ['error' => 'rule_off', 'detail' => $room['rule']]; continue; }
            if ($room['left'] !== null) {
                if ($room['left'] <= 0) { $plan[] = $v + ['error' => 'cap_reached', 'detail' => $room['rule']]; continue; }
                if ($room['left'] < $amount) { $amount = $room['left']; $capped = true; }
                $ruleUsed[(string)$m['memberId'] . '|' . $room['rule']] = ($ruleUsed[(string)$m['memberId'] . '|' . $room['rule']] ?? 0) + $amount;
            }
        }
        $v['verdict'] = $exists ? 'already' : 'fine';
        $plan[] = $v + ['kind' => 'fine', 'amount' => $amount, 'reason' => $reason,
                        'reasonLabel' => FEES_FINE_REASONS[$reason], 'note' => $note, 'date' => $date, '_key' => $key]
                     + ($capped ? ['capped' => true, 'asked' => $asked] : [])
                     + ($standard ? ['standard' => $standard, 'each' => intdiv($asked, $standard)] : []);
    }
    $tally = ['fine' => 0, 'already' => 0, 'skipped' => 0, 'failed' => 0, 'total' => 0, 'byKind' => []];
    foreach ($plan as $x) {
        $tally[$x['verdict']]++;
        if ($x['verdict'] !== 'fine') continue;
        $tally['total'] += $x['amount'];
        $k = (string)($x['kind'] ?? 'fine');
        $tally['byKind'][$k] = ['n' => ($tally['byKind'][$k]['n'] ?? 0) + 1, 'total' => ($tally['byKind'][$k]['total'] ?? 0) + $x['amount']];
    }
    $digest = members_import_digest(array_map(static fn($x) => array_diff_key($x, ['_key' => 1]), $plan), ['kind' => 'fines']);
    $public = static fn($list) => array_map(static fn($x) => array_diff_key($x, ['_key' => 1]), $list);
    if ($dry) return ['ok' => true, 'dryRun' => true, 'digest' => $digest, 'tally' => $tally, 'rows' => $public($plan), 'max' => FEES_FINE_IMPORT_MAX];
    if ((string)($p['digest'] ?? '') !== $digest) return ['ok' => false, 'error' => 'import_changed'];

    $posted = 0;
    foreach ($plan as &$x) {
        if ($x['verdict'] !== 'fine') continue;
        $label = $x['reasonLabel'] . ($x['date'] !== '' ? ' (' . $x['date'] . ')' : '');
        $kind = (string)($x['kind'] ?? 'fine');
        $e = fees_post($x['memberId'], $kind, $x['amount'], ['periodKey' => $x['_key'], 'method' => $kind === 'fine' ? $x['reason'] : 'import', 'by' => $by,
            'note' => $x['note'] !== '' ? $label . ' — ' . $x['note'] : $label]);
        if ($e) { $x['entryId'] = (string)$e['entryId']; $posted++; }
        else {
            $x['verdict'] = 'failed'; $x['error'] = 'post_failed'; $tally['fine']--; $tally['failed']++; $tally['total'] -= $x['amount'];
            $tally['byKind'][$kind]['n']--; $tally['byKind'][$kind]['total'] -= $x['amount'];
        }
    }
    unset($x);
    // One event for the run, with what was refused — not one per row.
    audit('fees.fine.import', $by, '', ['posted' => $posted, 'already' => $tally['already'], 'skipped' => $tally['skipped'], 'failed' => $tally['failed'],
        'total' => $tally['total'], 'rows' => count($rows), 'digest' => $digest], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'dryRun' => false, 'digest' => $digest, 'tally' => $tally, 'rows' => $public($plan)];
}

/* ══ Money brought over by upload, and correcting what it was ══════════════
   A register uploaded before 30 Oct 2026 read a "Dues" column as the fine's
   amount, so arrears sit on accounts as FINES — counted against the conduct
   rules' caps, named "fine" on every statement and reminder, and in the
   policy's "fines owed". Nothing can tell those rows apart from real fines
   but a person who knows the register, so this lists everything brought over
   by upload and lets the fees desk say what each one was. The correction is
   a void with its reason and a new charge of the right kind for the same
   amount on the same day — the account's total never moves, and both rows
   stay on the record. */
const FEES_RECLASS_MAX = 500;
/** SQL that picks the rows fees_entry_imported() calls imported — kept beside it so the two cannot drift. */
function fees_imported_sql(string $a = ''): string {
    $c = $a !== '' ? $a . '.' : '';
    return "({$c}periodKey LIKE 'bulkfine:%' OR {$c}periodKey LIKE 'import:%' OR {$c}method = 'import' OR {$c}createdBy LIKE 'import%')";
}
/** A fine whose own words say it was dues — offered first, never decided for the desk. */
function fees_import_looks_like_dues(array $e): bool {
    return (string)$e['kind'] === 'fine' && (bool)preg_match('/\b(dues?|monthly|subscriptions?|levy|levies|arrears?)\b/i', (string)$e['note'] . ' ' . (string)$e['method']);
}

/** admin.fees.imported — every charge brought over by upload, newest first. */
function admin_fees_imported(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $rows = db_all("SELECT l.entryId, l.memberId, l.kind, l.amount, l.periodKey, l.note, l.method, l.createdAt, l.createdBy, l.voidedAt, l.voidReason,
                           m.fullName, m.displayId, COALESCE(m.centre,'') centre
                    FROM member_ledger l JOIN members m ON m.memberId = l.memberId
                    WHERE l.direction = 'charge' AND l.kind IN ('fine','dues','membership') AND " . fees_imported_sql('l') . "
                    ORDER BY l.id DESC LIMIT 3000");
    $out = []; $tot = ['fine' => ['n' => 0, 'total' => 0], 'dues' => ['n' => 0, 'total' => 0], 'membership' => ['n' => 0, 'total' => 0]]; $looks = 0; $outOfScope = 0;
    foreach ($rows as $r) {
        if (!admin_centre_allowed($g['requester'], (string)$r['centre'])) { $outOfScope++; continue; }
        $live = trim((string)$r['voidedAt']) === '';
        if ($live) { $tot[(string)$r['kind']]['n']++; $tot[(string)$r['kind']]['total'] += (int)$r['amount']; }
        $l = $live && fees_import_looks_like_dues($r); if ($l) $looks++;
        $out[] = ['entryId' => (string)$r['entryId'], 'memberId' => (string)$r['memberId'], 'fullName' => (string)$r['fullName'], 'displayId' => (string)$r['displayId'],
                  'centre' => (string)$r['centre'], 'kind' => (string)$r['kind'], 'amount' => (int)$r['amount'], 'note' => (string)$r['note'],
                  'createdAt' => (string)$r['createdAt'], 'live' => $live, 'voidReason' => (string)$r['voidReason'],
                  'reclassified' => str_starts_with((string)$r['periodKey'], 'import:reclass:'), 'looksLikeDues' => $l];
    }
    return ['ok' => true, 'rows' => $out, 'totals' => $tot, 'looksLikeDues' => $looks, 'outOfScope' => $outOfScope, 'max' => FEES_RECLASS_MAX];
}

/**
 * admin.fees.importReclass — {entryIds, to: fine|dues|membership, reason}.
 * Every row is checked before anything is written; each is answered on its
 * own (reclassified, unchanged, or refused with why); one audit event.
 */
function admin_fees_import_reclass(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_filter(array_map(static fn($x) => is_scalar($x) ? trim((string)$x) : '', (array)($p['entryIds'] ?? [])))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > FEES_RECLASS_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => FEES_RECLASS_MAX, 'detail' => 'At most ' . FEES_RECLASS_MAX . ' at a time.'];
    $to = (string)($p['to'] ?? '');
    if (!in_array($to, FEES_IMPORT_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    $why = trim(mb_substr((string)($p['reason'] ?? ''), 0, 200));
    if (mb_strlen($why) < 5) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why — it is written on both rows.'];
    $by = (string)$g['requester']['memberId'];
    $results = []; $go = [];
    foreach ($ids as $id) {
        $e = db_row('SELECT l.*, COALESCE(m.centre,\'\') centre FROM member_ledger l JOIN members m ON m.memberId = l.memberId WHERE l.entryId = ? LIMIT 1', [$id]);
        if (!$e) { $results[] = ['entryId' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)$e['centre'])) { $results[] = ['entryId' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        if (trim((string)$e['voidedAt']) !== '') { $results[] = ['entryId' => $id, 'ok' => false, 'error' => 'voided']; continue; }
        if ((string)$e['direction'] !== 'charge' || !in_array((string)$e['kind'], FEES_IMPORT_KINDS, true) || !fees_entry_imported($e)) { $results[] = ['entryId' => $id, 'ok' => false, 'error' => 'not_imported']; continue; }
        if ((string)$e['kind'] === $to) { $results[] = ['entryId' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        $go[] = $e;
    }
    $done = 0; $moved = 0;
    foreach ($go as $e) {
        $id = (string)$e['entryId'];
        try { $r = db_tx(function () use ($e, $to, $why, $by, $id) {
            db_update('member_ledger', ['voidedAt' => now_iso(), 'voidedBy' => $by, 'voidReason' => mb_substr('Reclassified as ' . $to . ': ' . $why, 0, 240)], ['entryId' => $id]);
            $new = fees_post((string)$e['memberId'], $to, (int)$e['amount'], ['periodKey' => 'import:reclass:' . $id, 'method' => 'import', 'by' => $by,
                'note' => mb_substr(FEES_IMPORT_KIND_LABELS[$to] . ' (was recorded as ' . $e['kind'] . ') — ' . (string)$e['note'], 0, 240)]);
            // A fine is still governed by its rule; if the rule would post less, the correction is refused whole.
            if (!$new || (int)$new['amount'] !== (int)$e['amount']) throw new RuntimeException('rule_capped');
            // Same day as the original, so what payments are counted against does not move.
            db_update('member_ledger', ['createdAt' => (string)$e['createdAt']], ['entryId' => (string)$new['entryId']]);
            return (string)$new['entryId'];
        }); } catch (Throwable $ex) { $r = null; }
        if (is_string($r)) { $results[] = ['entryId' => $id, 'ok' => true, 'newEntryId' => $r]; $done++; $moved += (int)$e['amount']; }
    }
    // A correction that threw was rolled back whole: answer those rows rather than lose them.
    $answered = array_column($results, 'entryId');
    foreach ($go as $e) if (!in_array((string)$e['entryId'], $answered, true)) $results[] = ['entryId' => (string)$e['entryId'], 'ok' => false, 'error' => 'rule_capped'];
    $refused = count(array_filter($results, static fn($x) => empty($x['ok'])));
    audit('fees.import.reclass', $by, '', ['to' => $to, 'reclassified' => $done, 'amount' => $moved, 'refused' => $refused, 'asked' => count($ids), 'reason' => $why], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'reclassified' => $done, 'amount' => $moved, 'refused' => $refused, 'results' => $results];
}

