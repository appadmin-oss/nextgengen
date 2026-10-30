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
    $limit = max(1, min(FEES_ARREARS_PAGE_MAX, (int)($p['limit'] ?? FEES_ARREARS_PAGE)));
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
        $comp = [];
        $today = attendance_today();
        // The same reading as fees_compliance_cutoff(): a suspension past its end date no longer pauses anything.
        foreach (db_all("SELECT personId, kind, issuedAt, startsAt, endsAt FROM sanctions WHERE personId IN ($ph) AND status = 'active' AND kind IN ('eviction','suspension') ORDER BY issuedAt", $ids) as $sx) {
            $pid = (string)$sx['personId'];
            if ($sx['kind'] === 'suspension' && (string)$sx['endsAt'] !== '' && substr((string)$sx['endsAt'], 0, 10) < $today) continue;
            if ($sx['kind'] === 'eviction') $comp[$pid] = ['cutoff' => substr((string)$sx['issuedAt'], 0, 10), 'state' => 'evicted', 'final' => true];
            elseif (($comp[$pid]['state'] ?? '') !== 'evicted') $comp[$pid] = ['cutoff' => substr((string)$sx['startsAt'], 0, 10), 'state' => 'suspended', 'final' => false];
        }
        /* The status history and every suspension, for the serving-days count —
           one query each for the chunk, as above. */
        $hist = []; $susp = [];
        foreach (db_all("SELECT memberId, status, since FROM member_status_log WHERE memberId IN ($ph) ORDER BY since, id", $ids) as $h) $hist[(string)$h['memberId']][] = $h;
        foreach (db_all("SELECT personId, status, startsAt, endsAt, clearedAt FROM sanctions WHERE personId IN ($ph) AND kind = 'suspension'", $ids) as $sx) $susp[(string)$sx['personId']][] = $sx;
        foreach ($chunk as $m) {
            $mid = (string)$m['memberId'];
            $b = fees_balance($m, $cfg, null, $ledger[$mid] ?? [],
                              ($comp[$mid] ?? ['cutoff' => '', 'state' => 'clear', 'final' => false]) + ['history' => $hist[$mid] ?? [], 'suspensions' => $susp[$mid] ?? []]);
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
    /* The terms this member's training place runs on, fixed the first time
       their account accrues: later edits are for later members. */
    $member = fees_freeze_terms($member, $cfg);
    $terms = fees_member_terms($member, $cfg);
    $ten = fees_tenure($member, $cfg, $asOf);
    if ($ten['start'] === '') { $out['skipped'] = 'no_join_date'; return $out; }
    $bal = fees_balance($member, $cfg, $asOf);
    if (!empty($bal['atCap'])) { $out['skipped'] = 'at_cap'; return $out; }

    /* Membership renews on the anniversary of joining. The 'once' key from the
       one-off era is still what a 0-month cycle posts, so a deployment that
       never wanted a subscription keeps exactly the row it already has. */
    // Settled up to a date (recorded before that tool was retired): nothing on or before it is charged again.
    $settled = substr(trim((string)($member['feesSettledThrough'] ?? '')), 0, 10);
    if ((int)$cfg['membershipFee'] > 0) {
        foreach (fees_membership_periods($ten['start'], $asOf ?? gmdate('Y-m-d'), (int)$cfg['membershipEveryMonths']) as $per) {
            if ($settled !== '' && (string)$per['due'] <= $settled) continue;
            $label = $per['key'] === 'once' ? 'Membership fee'
                : 'Membership fee — year ' . substr($per['key'], 1) . ' from ' . $per['due'];
            if (fees_post($memberId, 'membership', (int)$cfg['membershipFee'],
                          ['periodKey' => $per['key'], 'note' => $label, 'by' => 'accrual'])) {
                $out['membership']++;
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
            $amt = (int)$cfg['monthlyDues'];
            if ($mk === $firstMonth && function_exists('membership_prorate')) $amt = membership_prorate($amt, $ten['start'], $member)['amount'];
            if ($amt > 0 && fees_post($memberId, 'dues', $amt,
                          ['periodKey' => $mk, 'note' => ($mk === $firstMonth && $amt < (int)$cfg['monthlyDues'] ? 'Commitment fee ' . $mk . ' (from ' . $ten['start'] . ')' : 'Monthly dues ' . $mk), 'by' => 'accrual'])) {
                $out['dues']++;
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
        'remindOff' => (int)($m['duesRemindOff'] ?? 0) === 1,
        'settings' => $cfg,
    ]];
}

/** Record a payment received. Admin-entered: this is the reconciliation step,
 *  not a gateway callback. */
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
    if ($by === $id) return ['ok' => false, 'error' => 'own_account'];
    if (function_exists('membership_invoice_by') && db_row("SELECT invoiceId FROM membership_invoices WHERE memberId = ? AND status = 'open' LIMIT 1", [$id])) {
        return ['ok' => false, 'error' => 'use_invoice', 'detail' => 'This member has an unpaid joining invoice. Record the payment against it (Membership payments), where it is checked by a second person.'];
    }
    /* A bank reference is money that arrived once: it is accepted once,
       across manual payments and offline claims alike. */
    $method = (string)($p['method'] ?? 'cash');
    $refKey = function_exists('membership_ref_key') ? membership_ref_key((string)($p['reference'] ?? '')) : '';
    if ($method !== 'cash' && strlen($refKey) < 4) return ['ok' => false, 'error' => 'reference_required', 'detail' => 'The transaction reference on the slip or alert.'];
    if ($refKey !== '') {
        $seen = db_row("SELECT invoiceId FROM offline_payments WHERE referenceKey = ? AND status <> 'rejected' LIMIT 1", [$refKey]);
        if (!$seen) foreach (db_all("SELECT reference FROM member_ledger WHERE kind = 'payment' AND reference <> '' AND (voidedAt IS NULL OR voidedAt = '')") as $lr) if (membership_ref_key((string)$lr['reference']) === $refKey) { $seen = true; break; }
        if ($seen) { audit('fees.payment.reused_reference', $by, $id, ['reference' => (string)$p['reference']], (string)($p['ip'] ?? '')); return ['ok' => false, 'error' => 'reference_reused', 'detail' => 'That reference is already recorded.']; }
    }
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
function fees_unpaid_of(array $member, array $kinds, ?string $through = null, ?array $cfg = null, ?array $entries = null): int {
    $cfg = $cfg ?? fees_settings();
    $ten = fees_tenure($member, $cfg);
    $memberDues = [];
    if ($ten['start'] !== '') foreach (fees_membership_periods($ten['start'], gmdate('Y-m-d'), (int)$cfg['membershipEveryMonths']) as $per) $memberDues[(string)$per['key']] = (string)$per['due'];
    $charges = []; $credit = 0;
    foreach ($entries ?? fees_entries((string)$member['memberId']) as $e) {
        if (trim((string)($e['voidedAt'] ?? '')) !== '') continue;
        $kind = (string)$e['kind'];
        if ((string)$e['direction'] === 'charge') { if ($kind !== 'training') $charges[] = ['kind' => $kind, 'amount' => (int)$e['amount'], 'day' => fees_charge_day($e, $memberDues), 'id' => (int)($e['id'] ?? 0)]; }
        elseif ($kind !== 'writeoff') $credit += (int)$e['amount'];
    }
    usort($charges, static fn($a, $b) => [$a['day'], $a['id']] <=> [$b['day'], $b['id']]);
    $unpaid = 0;
    foreach ($charges as $c) {
        $take = min($credit, $c['amount']); $credit -= $take;
        $left = $c['amount'] - $take;
        if ($left > 0 && in_array($c['kind'], $kinds, true) && ($through === null || ($c['day'] !== '' && $c['day'] <= $through))) $unpaid += $left;
    }
    return $unpaid;
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
 *  · WHAT. Every member who is NGG and `active`, the fines still unpaid on
 *    their account (payments applied oldest first, so a fine already paid is
 *    not "cleared" a second time). Dues, membership and the training fee are
 *    not touched. One waiver per member, keyed `fines-cleared:once`.
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
const FEES_FINES_CLEAR_PHRASE = 'CLEAR ALL FINES';
function fees_fines_clear_lock(): ?array {
    try { $r = db_row('SELECT * FROM fees_once_locks WHERE lockKey = ? LIMIT 1', [FEES_FINES_CLEAR_LOCK]); }
    catch (Throwable $e) { return null; }
    if (!$r) return null;
    $who = db_row('SELECT fullName FROM members WHERE memberId = ? LIMIT 1', [(string)$r['usedBy']]);
    return ['usedAt' => (string)$r['usedAt'], 'usedBy' => (string)$r['usedBy'], 'usedByName' => (string)($who['fullName'] ?? ''),
            'members' => (int)$r['members'], 'total' => (int)$r['total'], 'reason' => (string)$r['reason']];
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
        $amt = fees_unpaid_of($m, ['fine'], null, $cfg, $byId[$id] ?? []);
        if ($amt <= 0) continue;
        $rows[] = ['memberId' => $id, 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''), 'centre' => (string)($m['centre'] ?? ''), 'amount' => $amt];
        $total += $amt;
    }
    $digest = substr(hash('sha256', json_encode(array_map(static fn($r) => [$r['memberId'], $r['amount']], $rows))), 0, 32);
    return ['rows' => $rows, 'members' => count($rows), 'total' => $total, 'digest' => $digest];
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
    if ($mode === 'preview') return ['ok' => true, 'members' => $plan['members'], 'total' => $plan['total'], 'digest' => $plan['digest'], 'rows' => array_slice($plan['rows'], 0, 1000), 'phrase' => FEES_FINES_CLEAR_PHRASE];
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
            $e = fees_post($r['memberId'], 'waiver', $r['amount'], ['periodKey' => 'fines-cleared:once', 'by' => $by,
                'note' => mb_substr('Fines cleared for every active member (' . substr($now, 0, 10) . '): ' . $reason, 0, 240)]);
            if (!$e) throw new RuntimeException('post_failed:' . $r['memberId']);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if (fees_fines_clear_lock() !== null) return ['ok' => false, 'error' => 'already_used', 'lock' => fees_fines_clear_lock()];
        return ['ok' => false, 'error' => 'post_failed', 'detail' => 'Nothing was written.'];
    }
    audit('fees.fines.clear_once', $by, '', ['members' => $plan['members'], 'total' => $plan['total'], 'reason' => $reason, 'digest' => $plan['digest']], (string)($p['ip'] ?? ''));
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
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($ids) {
        foreach (array_chunk($ids, 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            foreach (db_all("SELECT * FROM members WHERE memberId IN ($ph)", $chunk) as $m) {
                if ($scope !== null && !in_array((string)($m['centre'] ?? ''), $scope, true)) continue;
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
    if (function_exists('cp_rules_seed')) cp_rules_seed();
    [$from, $to] = function_exists('cp_term_bounds') ? cp_term_bounds('') : [gmdate('Y-01-01'), gmdate('Y-12-31')];
    // One pass over this term's fines, not one per rule (the Club portal's reader looped).
    $by = []; $all = ['n' => 0, 'total' => 0];
    foreach (db_all("SELECT amount, method, note FROM member_ledger WHERE kind = 'fine' AND COALESCE(voidedAt,'') = '' AND substr(createdAt,1,10) BETWEEN ? AND ?", [$from, $to]) as $e) {
        $k = function_exists('conduct_rule_key') ? conduct_rule_key(['method' => $e['method'], 'note' => $e['note']]) : '';
        $by[$k]['n'] = ($by[$k]['n'] ?? 0) + 1; $by[$k]['total'] = ($by[$k]['total'] ?? 0) + (int)$e['amount'];
        $all['n']++; $all['total'] += (int)$e['amount'];
    }
    $rules = [];
    foreach (db_all('SELECT * FROM conduct_rules ORDER BY id') as $r) {
        $k = (string)$r['reason'];
        $rules[] = ['ruleId' => (string)$r['ruleId'], 'reason' => $k, 'reasonLabel' => $k !== '' ? (FEES_FINE_REASONS[$k] ?? $k) : '',
            'name' => (string)$r['name'], 'whenText' => (string)$r['whenText'], 'amount' => (int)$r['amount'], 'capTerm' => (int)$r['capTerm'],
            'active' => (bool)(int)$r['active'], 'updatedAt' => (string)($r['updatedAt'] ?? ''),
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
    ];
    // The whole payload is checked before anything is written.
    if (mb_strlen($next['name']) < 3 || mb_strlen($next['name']) > 160) return ['ok' => false, 'error' => 'bad_name'];
    if (mb_strlen($next['whenText']) > 200) return ['ok' => false, 'error' => 'bad_when'];
    if ($next['reason'] !== '' && !in_array($next['reason'], FEES_RULE_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    if ($next['amount'] < 0 || $next['amount'] > FEES_AMOUNT_MAX) return ['ok' => false, 'error' => 'bad_amount', 'max' => FEES_AMOUNT_MAX];
    if ($next['capTerm'] < 0 || $next['capTerm'] > FEES_AMOUNT_MAX) return ['ok' => false, 'error' => 'bad_cap', 'max' => FEES_AMOUNT_MAX];
    if ($next['capTerm'] > 0 && $next['amount'] > $next['capTerm']) return ['ok' => false, 'error' => 'cap_below_fine'];
    // conduct_rule_allow() reads the FIRST rule of a kind, so a second one would govern nothing while looking live.
    if ($next['reason'] !== '') {
        $other = db_row('SELECT ruleId FROM conduct_rules WHERE reason = ? AND ruleId <> ? LIMIT 1', [$next['reason'], $id]);
        if ($other) return ['ok' => false, 'error' => 'kind_taken', 'ruleId' => (string)$other['ruleId']];
    }
    if ($cur) {
        $was = ['name' => (string)$cur['name'], 'whenText' => (string)$cur['whenText'], 'reason' => (string)$cur['reason'],
                'amount' => (int)$cur['amount'], 'capTerm' => (int)$cur['capTerm'], 'active' => (int)$cur['active']];
        $diff = array_keys(array_filter($next, static fn($v, $k) => $was[$k] !== $v, ARRAY_FILTER_USE_BOTH));
        if (!$diff) return ['ok' => true, 'unchanged' => true, 'ruleId' => $id];
        db_update('conduct_rules', $next + ['updatedAt' => now_iso()], ['ruleId' => $id]);
        audit('fees.rule.save', $by, $id, ['changed' => $diff, 'from' => array_intersect_key($was, array_flip($diff)), 'to' => array_intersect_key($next, array_flip($diff))], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'ruleId' => $id, 'changed' => $diff];
    }
    $id = 'RULE-' . strtoupper(rand_hex(4));
    db_insert('conduct_rules', $next + ['ruleId' => $id, 'createdBy' => $by, 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
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
        $plan[] = $v + ['amount' => $amount, 'reason' => $reason,
                        'reasonLabel' => FEES_FINE_REASONS[$reason], 'note' => $note, 'date' => $date, '_key' => $key]
                     + ($capped ? ['capped' => true, 'asked' => $asked] : [])
                     + ($standard ? ['standard' => $standard, 'each' => intdiv($asked, $standard)] : []);
    }
    $tally = ['fine' => 0, 'already' => 0, 'skipped' => 0, 'failed' => 0, 'total' => 0];
    foreach ($plan as $x) { $tally[$x['verdict']]++; if ($x['verdict'] === 'fine') $tally['total'] += $x['amount']; }
    $digest = members_import_digest(array_map(static fn($x) => array_diff_key($x, ['_key' => 1]), $plan), ['kind' => 'fines']);
    $public = static fn($list) => array_map(static fn($x) => array_diff_key($x, ['_key' => 1]), $list);
    if ($dry) return ['ok' => true, 'dryRun' => true, 'digest' => $digest, 'tally' => $tally, 'rows' => $public($plan), 'max' => FEES_FINE_IMPORT_MAX];
    if ((string)($p['digest'] ?? '') !== $digest) return ['ok' => false, 'error' => 'import_changed'];

    $posted = 0;
    foreach ($plan as &$x) {
        if ($x['verdict'] !== 'fine') continue;
        $label = $x['reasonLabel'] . ($x['date'] !== '' ? ' (' . $x['date'] . ')' : '');
        $e = fees_post($x['memberId'], 'fine', $x['amount'], ['periodKey' => $x['_key'], 'method' => $x['reason'], 'by' => $by,
            'note' => $x['note'] !== '' ? $label . ' — ' . $x['note'] : $label]);
        if ($e) { $x['entryId'] = (string)$e['entryId']; $posted++; }
        else { $x['verdict'] = 'failed'; $x['error'] = 'post_failed'; $tally['fine']--; $tally['failed']++; $tally['total'] -= $x['amount']; }
    }
    unset($x);
    // One event for the run, with what was refused — not one per row.
    audit('fees.fine.import', $by, '', ['posted' => $posted, 'already' => $tally['already'], 'skipped' => $tally['skipped'], 'failed' => $tally['failed'],
        'total' => $tally['total'], 'rows' => count($rows), 'digest' => $digest], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'dryRun' => false, 'digest' => $digest, 'tally' => $tally, 'rows' => $public($plan)];
}
