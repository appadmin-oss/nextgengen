<?php
declare(strict_types=1);

/**
 * NGG — programme calendar + Institutional Policy enforcement.
 *
 * Two things live here because they are inseparable: you cannot fairly count
 * an absence without first knowing whether the programme was running that day.
 *
 * ── 1. The programme calendar ───────────────────────────────────────────────
 * Before this, "session days" meant "days somebody happened to scan", and
 * "absent today" meant "active people with no row today" on ANY calendar day.
 * Both are wrong the moment the programme doesn't run seven days a week: a
 * Sunday marked the whole cohort absent, and two people wandering in on a
 * closed day created a session day that dragged everyone else's rate down.
 *
 * The admin now sets a term window, which weekdays run, and named exceptions
 * in both directions (a holiday that cancels a scheduled day, an extra day
 * that adds an unscheduled one). Everything downstream — rates, absences,
 * strikes, guardian alerts — reads that calendar.
 *
 * ── 2. Policy enforcement ───────────────────────────────────────────────────
 * Implements the Afrovanguard Institutional Policy & Operational Blueprint.
 * The shape is deliberately two-layer:
 *
 *   INFRACTIONS are facts. "This person was absent on this date." One row per
 *   person per kind per day, appended by the check-in path and the nightly
 *   sweep, voidable by an admin with a reason (which is the audit trail the
 *   blueprint's "no manual overrides" line still needs in practice — a wrongly
 *   logged fact must be correctable, or the ledger stops being true).
 *
 *   SANCTIONS are consequences. Warning, dormancy, suspension, fine, eviction.
 *   Derived from infraction counts against the thresholds, issued once per
 *   threshold crossing (keyed on person+kind+tier so re-evaluation is
 *   idempotent), and never issued twice for the same crossing.
 *
 * State is always DERIVED from live sanctions, never stored as a status flag,
 * so voiding a wrongly logged absence immediately undoes everything it caused.
 *
 * Enforcement deliberately does NOT rewrite volunteers.status /
 * summer_students.status. Those drive rosters, assignment eligibility and a
 * dozen queries; flipping them from a policy sweep would silently empty
 * unrelated screens. Eviction blocks check-in, freezes awards eligibility and
 * flags the profile everywhere — an admin archives the record separately if
 * they want it gone.
 */

// ── Programme calendar ──────────────────────────────────────────────────────

const PROGRAMME_DEFAULTS = [
    'enabled'   => false,          // off until an admin sets a term window
    'startDate' => '',
    'endDate'   => '',
    'weekdays'  => [1, 2, 3, 4, 5], // ISO-8601: 1 = Monday … 7 = Sunday
    'holidays'  => [],             // scheduled days that do NOT run
    'extraDays' => [],             // unscheduled days that DO run
];

/**
 * The term window the programme actually runs in.
 *
 * Falls back to the ACTIVE SESSION's dates. Sessions already carry the term
 * start and end — an admin sets them when they open the session — so making
 * the calendar demand the same two dates a second time, in a different
 * screen, is how it ended up switched off with nothing in it. And "off" is
 * not neutral: programme_is_day() answers TRUE for every date when the
 * calendar is disabled, so a Sunday, a public holiday and a date three months
 * after the programme ended all counted as school days, while the absence
 * sweep did nothing at all.
 *
 * Returns ['', ''] when there is no active session — there is nothing to
 * infer from, and inventing dates would be worse than leaving it unset.
 */
function programme_window_from_session(): array {
    $s = db_row("SELECT startDate, endDate FROM sessions WHERE isActive = 1 ORDER BY id DESC LIMIT 1");
    if (!$s) return ['', ''];
    $start = programme_clean_dates([$s['startDate'] ?? ''])[0] ?? '';
    $end   = programme_clean_dates([$s['endDate'] ?? ''])[0] ?? '';
    return [$start, $end];
}

/** Every session (term) window, normalised to Y-m-d, oldest first. */
function programme_session_windows(): array {
    $out = [];
    foreach (db_all('SELECT startDate, endDate FROM sessions ORDER BY startDate') as $r) {
        $a = substr((string)$r['startDate'], 0, 10); $b = substr((string)$r['endDate'], 0, 10);
        if (programme_clean_dates([$a]) && programme_clean_dates([$b]) && $a <= $b) $out[] = [$a, $b];
    }
    return $out;
}

/** Was this window copied from a session (term)? A calendar whose window is
 *  exactly one term's dates is the old inferred window, not an admin's choice:
 *  it froze the calendar to one term, so every day after that term ended was
 *  "not a programme day". Such a window is ignored and re-derived. */
function programme_window_is_a_term(string $start, string $end, bool $exceptSummerTerm = false): bool {
    if ($start === '' || $end === '') return false;
    foreach (db_all('SELECT code, startDate, endDate FROM sessions') as $r) {
        if ($exceptSummerTerm && strtoupper((string)$r['code']) === 'SUMMER') continue;
        if (substr((string)$r['startDate'], 0, 10) === $start && substr((string)$r['endDate'], 0, 10) === $end) return true;
    }
    return false;
}

/** The Summer School season: the active edition's dates, else the latest
 *  edition's. Summer School runs in ITS edition — a term of the year (which is
 *  what the calendar used to borrow) had it "running" every autumn weekday. */
function programme_edition_window(): array {
    $e = db_row("SELECT startDate, endDate FROM summer_cohorts WHERE status = 'active' AND COALESCE(startDate,'') <> '' AND COALESCE(endDate,'') <> '' ORDER BY id DESC LIMIT 1")
      ?: db_row("SELECT startDate, endDate FROM summer_cohorts WHERE COALESCE(startDate,'') <> '' AND COALESCE(endDate,'') <> '' ORDER BY endDate DESC LIMIT 1");
    if (!$e) return ['', ''];
    return [programme_clean_dates([substr((string)$e['startDate'], 0, 10)])[0] ?? '', programme_clean_dates([substr((string)$e['endDate'], 0, 10)])[0] ?? ''];
}

function programme_settings(): array {
    $cfg = setting_get('programme');
    $cfg = is_array($cfg) ? $cfg : [];
    /* An admin who has saved these settings always has an 'enabled' key —
     * programme_settings_save() writes one every time. Its absence means the
     * calendar was never configured at all, which is different from being
     * deliberately switched off, and only the first case should be filled in
     * from the session. Turning someone's explicit "off" back on would be
     * changing a decision, not supplying a default. */
    $neverConfigured = !array_key_exists('enabled', $cfg);
    /* The window is the Summer School edition's unless an admin typed one.
       A blank window, or one that is exactly a term's dates (what the old
       code copied in from `sessions`), is re-derived every time from the
       edition, so it moves when a new edition is opened. */
    $start = (string)($cfg['startDate'] ?? ''); $end = (string)($cfg['endDate'] ?? '');
    if (($start === '' && $end === '') || programme_window_is_a_term($start, $end, true)) {
        [$es, $ee] = programme_edition_window();
        if ($es !== '' && $ee !== '') {
            $cfg['startDate'] = $es; $cfg['endDate'] = $ee;
            // The calendar only describes which days run; enforcement is a
            // separate switch (policy.enabled). Turning this on cannot
            // sanction anybody — it stops Sundays counting as school days.
            if ($neverConfigured) $cfg['enabled'] = true;
            $cfg['derivedFromSession'] = true;   // kept name: the UI reads it as "derived"
            $cfg['derivedFrom'] = 'edition';
        } else {
            $cfg['startDate'] = ''; $cfg['endDate'] = '';
        }
    }
    $p = $cfg + PROGRAMME_DEFAULTS;
    $p['weekdays']  = array_values(array_unique(array_filter(array_map('intval', (array)$p['weekdays']), fn($d) => $d >= 1 && $d <= 7)));
    $p['holidays']  = programme_clean_dates($p['holidays']);
    $p['extraDays'] = programme_clean_dates($p['extraDays']);
    sort($p['weekdays']);
    return $p;
}

/** Keep only well-formed, real calendar dates; de-duplicate; sort. */
function programme_clean_dates($in): array {
    $out = [];
    foreach ((array)$in as $d) {
        $d = trim((string)$d);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) continue;
        [$y, $m, $dd] = array_map('intval', explode('-', $d));
        if (!checkdate($m, $dd, $y)) continue;      // 2026-02-30 is not a holiday
        $out[$d] = true;
    }
    $out = array_keys($out);
    sort($out);
    return $out;
}

function programme_settings_save(array $in, string $by): array {
    $cur = programme_settings();
    // Dates handed back unchanged from the derived edition window are not an
    // admin's choice; storing them would freeze the calendar to this edition.
    if (!empty($cur['derivedFromSession']) && ($in['startDate'] ?? null) === $cur['startDate'] && ($in['endDate'] ?? null) === $cur['endDate']) {
        $in['startDate'] = ''; $in['endDate'] = '';
    }
    $clean = [
        'enabled'   => !empty($in['enabled']),
        'startDate' => programme_clean_dates([array_key_exists('startDate', $in) ? $in['startDate'] : ($cur['derivedFromSession'] ?? false ? '' : $cur['startDate'])])[0] ?? '',
        'endDate'   => programme_clean_dates([array_key_exists('endDate', $in) ? $in['endDate'] : ($cur['derivedFromSession'] ?? false ? '' : $cur['endDate'])])[0] ?? '',
        'weekdays'  => array_key_exists('weekdays', $in)
            ? array_values(array_unique(array_filter(array_map('intval', (array)$in['weekdays']), fn($d) => $d >= 1 && $d <= 7)))
            : $cur['weekdays'],
        'holidays'  => array_key_exists('holidays', $in) ? programme_clean_dates($in['holidays']) : $cur['holidays'],
        'extraDays' => array_key_exists('extraDays', $in) ? programme_clean_dates($in['extraDays']) : $cur['extraDays'],
    ];
    // An inverted window would silently make every day a non-programme day and
    // freeze absence logging with no visible cause. Swap rather than accept it.
    if ($clean['startDate'] !== '' && $clean['endDate'] !== '' && $clean['startDate'] > $clean['endDate']) {
        [$clean['startDate'], $clean['endDate']] = [$clean['endDate'], $clean['startDate']];
    }
    // A date cannot be both cancelled and added. Holidays win: an admin adding
    // a date they had already cancelled means "actually, run that day".
    $clean['extraDays'] = array_values(array_diff($clean['extraDays'], $clean['holidays']));
    sort($clean['weekdays']);
    setting_set('programme', $clean, $by);
    return $clean;
}

/**
 * NGG members' weekly attendance calendar — the member-side twin of
 * programme_settings(). Same shape and the same active-session window fallback,
 * but its own setting key and a Saturday default, because members run a weekly
 * cadence rather than the summer daily one. The shared calendar engine
 * (programme_is_day / programme_days_between) already takes a cfg, so this only
 * has to PRODUCE the member cfg — no second copy of the date logic.
 *
 * Unlike the summer calendar, a never-configured member calendar stays OFF:
 * there is no pre-existing member behaviour to preserve, and member enforcement
 * is gated on its own switch regardless.
 */
function member_programme_settings(): array {
    $cfg = setting_get('memberProgramme');
    $cfg = is_array($cfg) ? $cfg : [];
    $defaults = ['enabled' => false, 'startDate' => '', 'endDate' => '',
        'weekdays' => [6], 'holidays' => [], 'extraDays' => []];
    $p = $cfg + $defaults;
    /* Members attend all year, term after term. With no window typed in (or
       the old one-term window copied from `sessions`), a day is in the
       programme when it falls inside ANY term — so the calendar does not stop
       on the day the current term ends, and the breaks between terms are not
       programme days. */
    if (($p['startDate'] === '' && $p['endDate'] === '') || programme_window_is_a_term((string)$p['startDate'], (string)$p['endDate'])) {
        $p['startDate'] = ''; $p['endDate'] = '';
        $p['sessionWindows'] = programme_session_windows();
        $p['derivedFromSession'] = true;
        $p['derivedFrom'] = 'sessions';
    }
    $p['weekdays']  = array_values(array_unique(array_filter(array_map('intval', (array)$p['weekdays']), fn($d) => $d >= 1 && $d <= 7)));
    $p['holidays']  = programme_clean_dates($p['holidays']);
    $p['extraDays'] = programme_clean_dates($p['extraDays']);
    sort($p['weekdays']);
    return $p;
}

function member_programme_settings_save(array $in, string $by): array {
    $cur = member_programme_settings();
    // A term's own dates sent back are the derived window, not a choice.
    if (programme_window_is_a_term((string)($in['startDate'] ?? ''), (string)($in['endDate'] ?? ''))) { $in['startDate'] = ''; $in['endDate'] = ''; }
    $clean = [
        'enabled'   => !empty($in['enabled']),
        'startDate' => programme_clean_dates([$in['startDate'] ?? $cur['startDate']])[0] ?? '',
        'endDate'   => programme_clean_dates([$in['endDate'] ?? $cur['endDate']])[0] ?? '',
        'weekdays'  => array_key_exists('weekdays', $in)
            ? array_values(array_unique(array_filter(array_map('intval', (array)$in['weekdays']), fn($d) => $d >= 1 && $d <= 7)))
            : $cur['weekdays'],
        'holidays'  => array_key_exists('holidays', $in) ? programme_clean_dates($in['holidays']) : $cur['holidays'],
        'extraDays' => array_key_exists('extraDays', $in) ? programme_clean_dates($in['extraDays']) : $cur['extraDays'],
    ];
    if ($clean['startDate'] !== '' && $clean['endDate'] !== '' && $clean['startDate'] > $clean['endDate']) {
        [$clean['startDate'], $clean['endDate']] = [$clean['endDate'], $clean['startDate']];
    }
    $clean['extraDays'] = array_values(array_diff($clean['extraDays'], $clean['holidays']));
    sort($clean['weekdays']);
    setting_set('memberProgramme', $clean, $by);
    return $clean;
}

/** Is `$date` (Y-m-d) a day the programme runs? With the calendar disabled
 *  every day counts, which is the pre-calendar behaviour. */
function programme_is_day(string $date, ?array $cfg = null): bool {
    $cfg = $cfg ?? programme_settings();
    if (empty($cfg['enabled'])) return true;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return false;
    if ($cfg['startDate'] !== '' && $date < $cfg['startDate']) return false;
    if ($cfg['endDate'] !== '' && $date > $cfg['endDate']) return false;
    if (in_array($date, $cfg['holidays'], true)) return false;
    if (in_array($date, $cfg['extraDays'], true)) return true;
    if (isset($cfg['sessionWindows']) && $cfg['startDate'] === '' && $cfg['endDate'] === '') {
        $in = false;
        foreach ((array)$cfg['sessionWindows'] as [$a, $b]) if ($date >= $a && $date <= $b) { $in = true; break; }
        if (!$in) return false;
    }
    $dow = (int)date('N', (int)strtotime($date . ' 00:00:00 UTC'));
    return in_array($dow, $cfg['weekdays'], true);
}

/**
 * Weekdays named in a centre's free-text "meets" field — "Saturdays",
 * "Wed & Sat", "Mon, Wed, Fri", "weekends" — as ISO numbers, or [] when the
 * text names none (then the shared calendar's weekdays apply).
 */
function centre_meet_weekdays(string $text): array {
    $t = strtolower($text);
    $out = [];
    if (preg_match('/\bweekends?\b/', $t)) { $out[] = 6; $out[] = 7; }
    if (preg_match('/\bweekdays\b/', $t)) array_push($out, 1, 2, 3, 4, 5);
    foreach (['mon' => 1, 'tue' => 2, 'wed' => 3, 'thu' => 4, 'fri' => 5, 'sat' => 6, 'sun' => 7] as $k => $n) {
        if (preg_match('/\b' . $k . '/', $t)) $out[] = $n;
    }
    $out = array_values(array_unique($out)); sort($out);
    return $out;
}

/**
 * The calendar for ONE member: the shared member calendar (window, holidays,
 * extra days), with the weekdays of the centre they belong to when that
 * centre says which days it meets. One calendar for every centre marked a
 * Wednesday centre's members absent every Saturday and never graded their
 * real Wednesdays.
 */
function member_calendar_for(?array $member, ?array $base = null, ?array $centreDays = null): array {
    $cfg = $base ?? member_programme_settings();
    $centre = mb_strtolower(trim((string)($member['centre'] ?? '')));
    if ($centre === '') return $cfg;
    /* An online member (docs/ONLINE-MEMBERS-PLAN.md) has no meeting days: the calendar stays ON with no
       weekday and no extra day, so no day is ever theirs to attend — never "off", which would make EVERY
       day a programme day (programme_is_day). The absence sweep, the outage brake, the at-risk rate and
       the registers all read this, so none of them can mark an online member absent. */
    if (centre_is_online($centre)) { $cfg['weekdays'] = []; $cfg['extraDays'] = []; $cfg['weekdaysFrom'] = 'online'; $cfg['online'] = true; return $cfg; }
    if ($centreDays !== null) $days = $centreDays[$centre] ?? [];
    else { $c = db_row('SELECT meetDays FROM centres WHERE lower(name) = ? LIMIT 1', [$centre]); $days = $c ? centre_meet_weekdays((string)$c['meetDays']) : []; }
    if ($days) { $cfg['weekdays'] = $days; $cfg['weekdaysFrom'] = 'centre'; }
    return $cfg;
}

/** Every centre's meeting weekdays, keyed by lower-cased name — one query, for loops. */
function centre_meet_days_map(): array {
    $out = [];
    foreach (db_all('SELECT name, meetDays FROM centres') as $c) {
        $d = centre_meet_weekdays((string)$c['meetDays']);
        if ($d) $out[mb_strtolower(trim((string)$c['name']))] = $d;
    }
    return $out;
}

/** The calendar for ONE Summer participant: the season's, with their group's
 *  meeting days when the group has them (summer_groups.meetDays, ISO numbers). */
function participant_calendar_for(string $studentId, ?array $base = null, ?array $groupDays = null): array {
    $cfg = $base ?? programme_settings();
    if ($groupDays !== null) $days = $groupDays[$studentId] ?? [];
    else {
        $r = db_row("SELECT g.meetDays FROM summer_students s JOIN summer_groups g ON g.groupId = s.groupId WHERE s.studentId = ? LIMIT 1", [$studentId]);
        $days = $r ? array_values(array_filter(array_map('intval', explode(',', (string)$r['meetDays'])), fn($x) => $x >= 1 && $x <= 7)) : [];
    }
    if ($days) { $cfg['weekdays'] = $days; $cfg['weekdaysFrom'] = 'group'; }
    return $cfg;
}

/** Every grouped participant's meeting weekdays — one query, for loops. */
function participant_group_days_map(): array {
    $out = [];
    foreach (db_all("SELECT s.studentId, g.meetDays FROM summer_students s JOIN summer_groups g ON g.groupId = s.groupId WHERE COALESCE(s.groupId,'') <> '' AND COALESCE(g.meetDays,'') <> ''") as $r) {
        $d = array_values(array_filter(array_map('intval', explode(',', (string)$r['meetDays'])), fn($x) => $x >= 1 && $x <= 7));
        if ($d) $out[(string)$r['studentId']] = $d;
    }
    return $out;
}

/** Is `$date` a programme day for THIS person — their centre's or group's days? */
function policy_is_day_for(string $personId, string $date, string $type): bool {
    if ($type === 'member') return programme_is_day($date, member_calendar_for(db_row('SELECT centre FROM members WHERE memberId = ? LIMIT 1', [$personId])));
    if ($type === 'student') return programme_is_day($date, participant_calendar_for($personId));
    return policy_is_day($date, $type);
}

/** Every programme day in [$from, $to] inclusive, as Y-m-d strings.
 *  Bounded so a mistyped year cannot walk a million iterations. */
function programme_days_between(string $from, string $to, ?array $cfg = null): array {
    $cfg = $cfg ?? programme_settings();
    if ($from === '' || $to === '' || $from > $to) return [];
    $out = [];
    $t = (int)strtotime($from . ' 00:00:00 UTC');
    $end = (int)strtotime($to . ' 00:00:00 UTC');
    for ($i = 0; $t <= $end && $i < 1500; $i++, $t += 86400) {
        $d = gmdate('Y-m-d', $t);
        if (programme_is_day($d, $cfg)) $out[] = $d;
    }
    return $out;
}

/** Programme days from the term start up to and including `$upto` (default:
 *  today, local). This is the honest denominator for an attendance rate — days
 *  the programme ran, whether or not anybody scanned. */
function programme_days_elapsed(?string $upto = null, ?array $cfg = null): array {
    $cfg = $cfg ?? programme_settings();
    $today = $upto ?? attendance_today();
    if (empty($cfg['enabled'])) return [];
    [$start, $end0] = programme_term_bounds($today, $cfg);
    if ($start === '') return [];
    $end = $end0 !== '' && $end0 < $today ? $end0 : $today;
    return programme_days_between($start, $end, $cfg);
}

/**
 * The window "this term" means for counting: the typed window, or — for a
 * year-round calendar built from terms — the term holding `$today`, else the
 * most recent one that has started. [start, end], or ['', ''].
 */
function programme_term_bounds(string $today, array $cfg): array {
    if ((string)$cfg['startDate'] !== '' || empty($cfg['sessionWindows'])) return [(string)$cfg['startDate'], (string)$cfg['endDate']];
    $pick = ['', ''];
    foreach ((array)$cfg['sessionWindows'] as [$a, $b]) {
        if ($a <= $today) $pick = [$a, $b];
        if ($a <= $today && $today <= $b) return [$a, $b];
    }
    if ($pick[0] === '') foreach ((array)$cfg['sessionWindows'] as [$a, $b]) if ($a > $today) return [$a, $b];
    return $pick;
}

/** The next programme day strictly after `$date` — what the "closed for today"
 *  message points at. '' when the term has ended. */
function programme_next_day(string $date, ?array $cfg = null): string {
    $cfg = $cfg ?? programme_settings();
    if (empty($cfg['enabled'])) return '';
    $t = (int)strtotime($date . ' 00:00:00 UTC');
    for ($i = 0; $i < 400; $i++) {
        $t += 86400;
        $d = gmdate('Y-m-d', $t);
        if ($cfg['endDate'] !== '' && $d > $cfg['endDate']) return '';
        if (programme_is_day($d, $cfg)) return $d;
    }
    return '';
}

// ── Policy settings ─────────────────────────────────────────────────────────

/**
 * Defaults transcribe the blueprint. Two thresholds per member type, and they
 * are NOT the same thing:
 *
 *   resumption (attendance settings)  the 1-Hour Advance Resumption Protocol.
 *                                     Miss it and you are TARDY — recorded,
 *                                     visible, but not an infraction.
 *   lateRedline (here)                Part VI, "The Absolute Lateness
 *                                     Deadlines". Scan at or after this and
 *                                     you are flagged LATE, which accrues
 *                                     towards suspension.
 *
 * Students: redline 08:30, 3 lates → suspension. Volunteers: 09:00, 4 lates.
 * Note the pre-existing attendance settings had the resumption times the wrong
 * way round (student 09:00, volunteer 08:30) relative to the blueprint's
 * redlines; the redlines here are the enforcing pair.
 */
const POLICY_DEFAULTS = [
    'enabled' => false,          // strict enforcement is opt-in per deployment
    /* The outage brake (policy_outage_hold): a centre-day with nobody checked
     * in, where people were expected, is held rather than counted. ON: a feed
     * that fails must not put a whole centre on the Dormant Track. */
    'outageBrake' => true,
    /* Whether the reversible sanctions — suspension chief among them — take
     * effect the moment the counter crosses, or are raised for an admin to
     * confirm first. ON by the Governing Council's instruction: the blueprint
     * says "the AI system automatically flags the profile", "no manual
     * overrides, no verbal adjustments", and the institution wants the
     * thresholds to bite without a human in the loop.
     *
     * Eviction is governed separately by `confirmEviction` below, not by this
     * flag — expulsion is the one sanction that cannot be walked back, so it
     * gets its own switch. Set this to false to have suspension raised for
     * review too; the counters and the board are identical either way. */
    'autoEnforce' => true,
    /* Whether an NGG member's eviction — total termination of association — must
     * be confirmed by an admin before it takes effect. Applies to members ONLY;
     * summer students and volunteers keep the fully-automatic stance regardless.
     * ON by default: a member's threshold crossing is still auto-flagged, but as
     * a *proposed* eviction that shows on the board as awaiting review and blocks
     * no one until an admin confirms it. This exists because §1.3 counts a
     * failure to scan as a full absence, so a broken scanner or a flat kiosk
     * battery would otherwise expel a member on the third occurrence with no one
     * asked — and there is no undo for an expulsion, only the Part IV
     * reinstatement gauntlet. An admin who wants members held to the same
     * automatic stance can turn this off, and a member's eviction then follows
     * `autoEnforce` like the other sanctions. */
    'confirmEviction' => true,
    'checkoutRequired' => true,  // §1.3 — scan IN and OUT, or the day is absent
    'student' => [
        'lateRedline'            => '08:30',
        'absenceLimit'           => 2,   // 3rd absence = eviction
        'latenessCap'            => 3,   // → suspension
        'postSuspensionLateness' => 2,   // → fine or eviction
        'fine'                   => 5000,
        'suspensionDays'         => 14,
    ],
    'volunteer' => [
        'lateRedline'            => '09:00',
        'absenceLimit'           => 2,
        'latenessCap'            => 4,
        'postSuspensionLateness' => 2,
        'fine'                   => 10000,
        'suspensionDays'         => 14,
        'reviewMissedCap'        => 2,   // §2.3 — missed Review Times → dormancy
    ],
    /* NGG members are enforced on their OWN switch (this block's `enabled`),
     * never the global `policy.enabled` that governs summer students and
     * volunteers — turning on strict summer enforcement must not silently start
     * fining year-round members. The meeting calendar is separate too
     * (`memberProgramme`), because members run a weekly cadence, not the summer
     * daily one. Amounts default to the student band and are admin-editable. */
    'member' => [
        'enabled'                => false,
        'lateRedline'            => '09:00',
        'absenceLimit'           => 2,
        'latenessCap'            => 3,
        'postSuspensionLateness' => 2,
        'fine'                   => 5000,
        'suspensionDays'         => 14,
        /* Where NGG is stricter than Summer School. A Summer participant is a
         * child in a season with no account: warnings, dormancy and suspension
         * are the ladder, and money only after a suspension. A member is in a
         * programme for years and has a ledger, so lateness costs from the
         * FIRST time, there is no "tardy" grey band to sit in, and a day with
         * no sign-out (closing time is the rule) is a day not completed. */
        'lateFine'               => 500,    // ₦ per redline late, from the first
        /* ₦ per absence nobody asked to be excused. An absence covered by a
           leave request waits for the desk's decision; approved academic leave
           is not an absence at all (member_absence_cover). */
        'absenceFine'            => 1000,
        'tardyIsLate'            => true,   // past resumption + grace is late
        'checkoutRequired'       => true,   // no sign-out = absence, as §1.3
        /* ── The member rulebook (Management notice, Oct 2026) ──────────────
         * `session`: what a lateness costs depends on WHEN they arrived, every
         * penalty may carry corrective exercise, and absences without
         * permission are counted per session towards a suspension that ends
         * only when the re-entry fee is settled. `ladder` is the older
         * warning → Dormant → eviction ladder above, kept so a deployment can
         * go back to it and an old record can still be read. */
        'rulebook'               => 'session',
        'resumption'             => '09:00',
        /* From each band's time until the next band's — or until reviewFrom,
           from which a late is management's to decide and carries no
           automatic penalty. */
        'lateBands'              => [['from' => '09:30', 'fine' => 500, 'jumps' => 3], ['from' => '09:45', 'fine' => 0, 'jumps' => 5]],
        'reviewFrom'             => '10:00',
        'absenceJumps'           => 7,
        'suspendAfterAbsences'   => 3,      // without permission, within one session
        'suspendDays'            => 7,
        'reentryFee'             => 5000,   // settled before the child may return
        'permittedAbsences'      => 5,      // with permission, within one session
        'formalAfterDays'        => 21,     // longer than this is a written application, not a request
        'evidenceFine'           => 1000,   // assignment evidence not uploaded by the due date
        'jumpWord'               => 'frog jumps',
    ],
    'musing' => ['enabled' => true, 'endsAt' => '08:00'],  // §"The Musing Period"
    'idCard' => ['secondOffenceFine' => 1000, 'lostFine' => 2000],
    'reinstatement' => ['coolOffDays' => 365, 'fine' => 10000, 'training' => 'CIMC 1'],
];

/** The member rulebook's fields, validated and clamped; anything not sent keeps its current value. */
function policy_rulebook_clean(array $src, array $c): array {
    $int = static fn($k, $lo, $hi) => max($lo, min($hi, (int)($src[$k] ?? $c[$k] ?? POLICY_DEFAULTS['member'][$k])));
    $bands = [];
    foreach ((array)($src['lateBands'] ?? $c['lateBands'] ?? POLICY_DEFAULTS['member']['lateBands']) as $b) {
        if (!is_array($b)) continue;
        $from = policy_hhmm((string)($b['from'] ?? ''), '');
        if ($from === '') continue;
        $bands[$from] = ['from' => $from, 'fine' => max(0, min(10000000, (int)($b['fine'] ?? 0))), 'jumps' => max(0, min(200, (int)($b['jumps'] ?? 0)))];
    }
    ksort($bands);
    $bands = array_slice(array_values($bands), 0, 4) ?: POLICY_DEFAULTS['member']['lateBands'];
    $review = array_key_exists('reviewFrom', $src) ? trim((string)$src['reviewFrom']) : (string)($c['reviewFrom'] ?? '');
    $review = $review === '' ? '' : policy_hhmm($review, '');
    // A review time at or before the first band would make every late a review: it must come after.
    if ($review !== '' && policy_minutes($review) <= policy_minutes($bands[0]['from'])) $review = '';
    $word = trim(mb_substr((string)($src['jumpWord'] ?? $c['jumpWord'] ?? 'frog jumps'), 0, 40));
    return [
        'rulebook'             => in_array((string)($src['rulebook'] ?? $c['rulebook'] ?? 'session'), ['session', 'ladder'], true) ? (string)($src['rulebook'] ?? $c['rulebook'] ?? 'session') : 'session',
        'resumption'           => policy_hhmm((string)($src['resumption'] ?? $c['resumption'] ?? '09:00'), '09:00'),
        'lateBands'            => $bands,
        'reviewFrom'           => $review,
        'absenceJumps'         => $int('absenceJumps', 0, 200),
        'suspendAfterAbsences' => $int('suspendAfterAbsences', 1, 60),
        'suspendDays'          => $int('suspendDays', 1, 365),
        'reentryFee'           => $int('reentryFee', 0, 10000000),
        'permittedAbsences'    => $int('permittedAbsences', 0, 60),
        'formalAfterDays'      => $int('formalAfterDays', 1, 365),
        'evidenceFine'         => $int('evidenceFine', 0, 10000000),
        'jumpWord'             => $word !== '' ? $word : 'frog jumps',
    ];
}

function policy_settings(): array {
    $cfg = setting_get('policy');
    $p = (is_array($cfg) ? $cfg : []) + POLICY_DEFAULTS;
    foreach (['student', 'volunteer', 'member', 'musing', 'idCard', 'reinstatement'] as $k) {
        $p[$k] = (array)($p[$k] ?? []) + POLICY_DEFAULTS[$k];
    }
    return $p;
}

/** Per-member-type block, with 'student' as the fallback for unknown types. */
function policy_for(string $type): array {
    $p = policy_settings();
    if ($type === 'volunteer') return $p['volunteer'];
    if ($type === 'member')    return $p['member'];
    return $p['student'];
}

/** Resolve a person's policy type from an explicit hint, or by looking them up:
 *  an NGG member → 'member', someone on the volunteer roster → 'volunteer',
 *  otherwise 'student'. Members are checked first so a member id is never
 *  mistaken for a summer student. */
/**
 * May this staff member change this person's conduct record? Decided by the
 * person's REAL type, read here — never by a personType the browser sent:
 * an NGG member or a volunteer is the people desk's (and inside the reader's
 * centres), a Summer School participant the summer desk's.
 */
function policy_subject_gate(array $requester, string $id): array {
    $caps = member_effective_caps($requester);
    if ($m = db_row("SELECT centre FROM members WHERE memberId = ? AND type = 'NGG' LIMIT 1", [$id])) {
        if (!in_array('people', $caps, true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:people'];
        return admin_centre_allowed($requester, (string)$m['centre']) ? ['ok' => true, 'type' => 'member'] : ['ok' => false, 'error' => 'out_of_scope'];
    }
    if ($v = db_row('SELECT centre FROM volunteers WHERE volunteerId = ? LIMIT 1', [$id])) {
        if (!in_array('people', $caps, true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:people'];
        return admin_centre_allowed($requester, (string)$v['centre']) ? ['ok' => true, 'type' => 'volunteer'] : ['ok' => false, 'error' => 'out_of_scope'];
    }
    $st = db_row('SELECT centre FROM summer_students WHERE studentId = ? LIMIT 1', [$id]);
    if (!in_array('summer', $caps, true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:summer'];
    if ($st && !admin_centre_allowed($requester, (string)$st['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    return ['ok' => true, 'type' => 'student'];
}

function policy_person_type(string $id, string $given = ''): string {
    if ($given !== '') return $given;
    if (db_row("SELECT 1 x FROM members WHERE memberId = ? AND type = 'NGG'", [$id])) return 'member';
    if (db_row('SELECT 1 x FROM volunteers WHERE volunteerId = ?', [$id])) return 'volunteer';
    return 'student';
}

/**
 * Is enforcement switched on for this person type? NGG members ride their own
 * switch (policy.member.enabled) so member enforcement is opt-in independently
 * of the summer-programme switch; everyone else rides the global policy.enabled.
 */
function policy_enabled_for(string $type): bool {
    $p = policy_settings();
    return $type === 'member'
        ? !empty($p['member']['enabled'])
        : !empty($p['enabled']);
}

/** The attendance calendar that governs this type — members run the weekly
 *  `memberProgramme` calendar, everyone else the summer `programme` one. */
function policy_calendar_for(string $type): array {
    return $type === 'member' ? member_programme_settings() : programme_settings();
}

/** Does the programme run for this type on `$date`? Type-aware wrapper over the
 *  shared calendar engine, which already accepts a cfg. */
function policy_is_day(string $date, string $type): bool {
    return programme_is_day($date, policy_calendar_for($type));
}

function policy_hhmm(string $v, string $fallback): string {
    $v = trim($v);
    return preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $v) ? $v : $fallback;
}

function policy_settings_save(array $in, string $by): array {
    $cur = policy_settings();
    $clean = [
        'enabled'          => array_key_exists('enabled', $in) ? !empty($in['enabled']) : !empty($cur['enabled']),
        'autoEnforce'      => array_key_exists('autoEnforce', $in) ? !empty($in['autoEnforce']) : !empty($cur['autoEnforce']),
        'confirmEviction'  => array_key_exists('confirmEviction', $in) ? !empty($in['confirmEviction']) : !empty($cur['confirmEviction']),
        'checkoutRequired' => array_key_exists('checkoutRequired', $in) ? !empty($in['checkoutRequired']) : !empty($cur['checkoutRequired']),
        'outageBrake'      => array_key_exists('outageBrake', $in) ? !empty($in['outageBrake']) : !empty($cur['outageBrake']),
    ];
    foreach (['student', 'volunteer', 'member'] as $type) {
        $src = is_array($in[$type] ?? null) ? $in[$type] : [];
        $c = $cur[$type];
        $clean[$type] = [
            'lateRedline'            => policy_hhmm((string)($src['lateRedline'] ?? $c['lateRedline']), (string)$c['lateRedline']),
            'absenceLimit'           => max(1, min(60, (int)($src['absenceLimit'] ?? $c['absenceLimit']))),
            'latenessCap'            => max(1, min(60, (int)($src['latenessCap'] ?? $c['latenessCap']))),
            'postSuspensionLateness' => max(1, min(60, (int)($src['postSuspensionLateness'] ?? $c['postSuspensionLateness']))),
            'fine'                   => max(0, min(10000000, (int)($src['fine'] ?? $c['fine']))),
            'suspensionDays'         => max(1, min(365, (int)($src['suspensionDays'] ?? $c['suspensionDays']))),
        ];
        if ($type === 'volunteer') {
            $clean[$type]['reviewMissedCap'] = max(1, min(60, (int)($src['reviewMissedCap'] ?? $c['reviewMissedCap'])));
        }
        // Members carry their own enforcement switch, separate from the global,
        // and the three rules that make NGG stricter than Summer School.
        if ($type === 'member') {
            $clean[$type]['enabled'] = array_key_exists('enabled', $src) ? !empty($src['enabled']) : !empty($c['enabled']);
            $clean[$type]['lateFine'] = max(0, min(10000000, (int)($src['lateFine'] ?? $c['lateFine'])));
            $clean[$type]['absenceFine'] = max(0, min(10000000, (int)($src['absenceFine'] ?? $c['absenceFine'] ?? 1000)));
            $clean[$type]['tardyIsLate'] = array_key_exists('tardyIsLate', $src) ? !empty($src['tardyIsLate']) : !empty($c['tardyIsLate']);
            $clean[$type]['checkoutRequired'] = array_key_exists('checkoutRequired', $src) ? !empty($src['checkoutRequired']) : !empty($c['checkoutRequired']);
            $clean[$type] += policy_rulebook_clean($src, $c);
        }
    }
    $m = is_array($in['musing'] ?? null) ? $in['musing'] : [];
    $clean['musing'] = [
        'enabled' => array_key_exists('enabled', $m) ? !empty($m['enabled']) : !empty($cur['musing']['enabled']),
        'endsAt'  => policy_hhmm((string)($m['endsAt'] ?? $cur['musing']['endsAt']), (string)$cur['musing']['endsAt']),
    ];
    $i = is_array($in['idCard'] ?? null) ? $in['idCard'] : [];
    $clean['idCard'] = [
        'secondOffenceFine' => max(0, min(10000000, (int)($i['secondOffenceFine'] ?? $cur['idCard']['secondOffenceFine']))),
        'lostFine'          => max(0, min(10000000, (int)($i['lostFine'] ?? $cur['idCard']['lostFine']))),
    ];
    $r = is_array($in['reinstatement'] ?? null) ? $in['reinstatement'] : [];
    $clean['reinstatement'] = [
        'coolOffDays' => max(0, min(3650, (int)($r['coolOffDays'] ?? $cur['reinstatement']['coolOffDays']))),
        'fine'        => max(0, min(10000000, (int)($r['fine'] ?? $cur['reinstatement']['fine']))),
        'training'    => substr(trim((string)($r['training'] ?? $cur['reinstatement']['training'])), 0, 80),
    ];
    setting_set('policy', $clean, $by);
    return $clean;
}

// ── Local clock ─────────────────────────────────────────────────────────────

/** Today's date in the programme's local timezone. The check-in path used
 *  gmdate('Y-m-d'), so on a UTC host every scan between local midnight and the
 *  UTC offset was filed under yesterday — and in Lagos (UTC+1, no DST) that is
 *  a real hour of every single day. */
function attendance_today(?int $at = null): string {
    $cfg = attendance_settings();
    return gmdate('Y-m-d', ($at ?? time()) + (int)$cfg['tzOffset'] * 60);
}

function policy_minutes(string $hhmm): int {
    [$h, $m] = array_pad(array_map('intval', explode(':', $hhmm)), 2, 0);
    return $h * 60 + $m;
}

// ── The member rulebook: bands, sessions, corrective exercise ──────────────

/* Tier ranges a member's rulebook sanctions are keyed by, so re-evaluating
   never issues one twice and the relift can tell what each one is for. The
   day is the date's day number (days since 1970-01-01). */
const POLICY_T_LATE_FINE   = 600000;    // + day: the band's fine
const POLICY_T_LATE_JUMPS  = 700000;    // + day: the band's corrective exercise
const POLICY_T_ABS_JUMPS   = 800000;    // + day: an absence's corrective exercise
const POLICY_T_REVIEW      = 900000;    // + day: a late at or after reviewFrom
const POLICY_T_SUSPENSION  = 30000000;  // + session start day × 10 + n: the nth suspension that session
const POLICY_T_REENTRY     = 40000000;  // same suffix: that suspension's re-entry fee

/* Written rules' sanctions (policy_apply_rules): base + the rule's row id × 100000
   + the day number, so each rule, each day, has its own key. Row ids above
   POLICY_RULE_SEQ_MAX would collide with the next base, so such a rule issues
   nothing (999 rules is far past what one programme writes). All under 2^31:
   sanctions.tier is an INT on MySQL. */
const POLICY_T_RULE_FINE    = 100000000;  // + seq×1e5 + day: the breach's fine
const POLICY_T_RULE_JUMPS   = 200000000;  // + seq×1e5 + day: the breach's corrective exercise
const POLICY_T_RULE_ESC     = 300000000;  // + seq×1e5 + the triggering breach's day: a suspension or a review
const POLICY_T_RULE_REENTRY = 400000000;  // same suffix as the escalation: its re-entry fee
const POLICY_T_RULE_END     = 500000000;
const POLICY_RULE_SEQ_MAX   = 999;

/** [base, seq, day] for a written rule's tier, or null. */
function policy_rule_tier_parts(int $tier): ?array {
    if ($tier < POLICY_T_RULE_FINE || $tier >= POLICY_T_RULE_END) return null;
    $base = intdiv($tier, 100000000) * 100000000; $rest = $tier - $base;
    return [$base, intdiv($rest, 100000), $rest % 100000];
}
/** Every written rule by row id and by ruleId, read once per request. */
function policy_rules_index(bool $reset = false): array {
    static $idx = null;
    if ($reset) { $idx = null; return []; }
    if ($idx !== null) return $idx;
    $idx = ['byId' => [], 'bySeq' => []];
    try { foreach (db_all('SELECT * FROM conduct_rules ORDER BY id') as $r) { $idx['byId'][(string)$r['ruleId']] = $r; $idx['bySeq'][(int)$r['id']] = $r; } } catch (\Throwable $e) {}
    return $idx;
}
/** The infraction kind a breach of this rule is logged as. */
function policy_rule_kind(string $ruleId): string { return 'rule:' . $ruleId; }

/** Is this person type on the session rulebook? */
function policy_is_session(string $type): bool {
    return $type === 'member' && (string)(policy_for('member')['rulebook'] ?? 'session') === 'session';
}
function policy_day_number(string $date): int { return intdiv((int)strtotime($date . ' 00:00:00 UTC'), 86400); }
function policy_day_of(int $n): string { return gmdate('Y-m-d', $n * 86400); }
function policy_day_text(string $date): string { return gmdate('D j M Y', (int)strtotime($date . ' 00:00:00 UTC')); }
function policy_naira(int $n): string { return '₦' . number_format((float)$n); }

/**
 * The bands as the engine reads them: sorted, each with its minute and where
 * it ends. A late at minute m falls in the last band whose `from` ≤ m; from
 * reviewFrom on it is management's, not a band's.
 */
function policy_late_bands(array $cfg): array {
    $out = [];
    foreach ((array)($cfg['lateBands'] ?? []) as $b) $out[] = ['from' => (string)$b['from'], 'min' => policy_minutes((string)$b['from']), 'fine' => (int)$b['fine'], 'jumps' => (int)$b['jumps']];
    usort($out, static fn($a, $b) => $a['min'] <=> $b['min']);
    if (!$out) $out[] = ['from' => '09:30', 'min' => 570, 'fine' => 0, 'jumps' => 0];
    $review = (string)($cfg['reviewFrom'] ?? '');
    foreach ($out as $i => &$b) $b['to'] = $out[$i + 1]['from'] ?? $review;
    unset($b);
    return $out;
}
/**
 * What a late at $minute earns: a band, ['review' => true], or — before the
 * first band — ['before' => true], which is not a late at all and costs
 * nothing. It used to answer the FIRST BAND for any minute below it, so a
 * late logged by an older definition (the ladder's "past resumption + grace",
 * before the rulebook of 30 Oct 2026) was re-read by the rulebook and
 * charged under a band its own arrival time contradicts: "Arrived 09:21
 * (09:45 to before 10:00) — 3 frog jumps". Every caller now asks `before`.
 */
function policy_band_for(array $cfg, int $minute): array {
    $bands = policy_late_bands($cfg);
    $review = (string)($cfg['reviewFrom'] ?? '');
    if ($review !== '' && $minute >= policy_minutes($review)) return ['review' => true, 'before' => false, 'from' => $review, 'fine' => 0, 'jumps' => 0, 'to' => ''];
    if ($minute < $bands[0]['min']) return ['review' => false, 'before' => true, 'from' => $bands[0]['from'], 'min' => $bands[0]['min'], 'fine' => 0, 'jumps' => 0, 'to' => ''];
    $pick = $bands[0];
    foreach ($bands as $b) if ($b['min'] <= $minute) $pick = $b;
    return $pick + ['review' => false, 'before' => false];
}
/** "₦500 and 3 frog jumps", "5 frog jumps", or "" — for a RULE (what a band or an absence costs in all). A sanction row names only its own penalty: see policy_session_reason. */
function policy_penalty_text(int $fine, int $jumps, string $word): string {
    return implode(' and ', array_filter([$fine > 0 ? policy_naira($fine) . ' fine' : '', $jumps > 0 ? $jumps . ' ' . $word : '']));
}

/**
 * The words on one rulebook sanction row, built from its kind and tier — so
 * the issue, the repair of an older row and the ledger note say the same
 * thing. ONE PENALTY PER ROW: a fine says money and nothing else (the same
 * words become the fee-ledger note a family pays against), the exercise says
 * the exercise. They used to share one sentence — the fine row read "₦500
 * fine and 3 frog jumps" and the exercise row of an absence "₦1,000 fine and
 * 7 frog jumps" beside a count of 7, so the desk's "How many" column read as
 * if it counted money. Null for a tier this does not word.
 */
function policy_session_reason(string $personId, string $kind, int $tier, int $amount, array $cfg): ?string {
    $word = (string)($cfg['jumpWord'] ?? 'frog jumps');
    $late = static function (string $d) use ($personId, $cfg): string {
        $min = policy_arrival_minute($personId, $d);
        $at = $min !== null ? sprintf('%02d:%02d', intdiv($min, 60), $min % 60) : 'late';
        if ($min === null) return 'Late on ' . policy_day_text($d);
        $b = policy_band_for($cfg, $min);
        $band = $b['review'] ? 'at or after ' . $b['from'] : ($b['before'] ? 'before ' . $b['from'] : $b['from'] . ($b['to'] !== '' ? ' to before ' . $b['to'] : ' or later'));
        return 'Arrived ' . $at . ' on ' . policy_day_text($d) . ' (' . $band . ')';
    };
    if ($kind === 'fine' && $tier >= POLICY_T_LATE_FINE && $tier < POLICY_T_LATE_JUMPS)
        return $late(policy_day_of($tier - POLICY_T_LATE_FINE)) . ' — ' . policy_naira($amount) . ' lateness fine.';
    if ($kind === 'corrective' && $tier >= POLICY_T_LATE_JUMPS && $tier < POLICY_T_ABS_JUMPS)
        return $late(policy_day_of($tier - POLICY_T_LATE_JUMPS)) . ' — ' . $amount . ' ' . $word . '.';
    if ($kind === 'corrective' && $tier >= POLICY_T_ABS_JUMPS && $tier < POLICY_T_REVIEW)
        return 'Absent on ' . policy_day_text(policy_day_of($tier - POLICY_T_ABS_JUMPS)) . ' without permission — ' . $amount . ' ' . $word . '.';
    return null;
}
/** Local minute of the person's arrival that day, from their attendance row; null when there is none. */
function policy_arrival_minute(string $personId, string $date): ?int {
    $r = db_row("SELECT checkInAt FROM attendance WHERE studentId = ? AND date = ? LIMIT 1", [$personId, $date]);
    $t = $r ? strtotime((string)$r['checkInAt']) : false;
    return $t ? attendance_minutes_at((int)$t) : null;
}
/**
 * The session a date falls in for this member: the term window on their
 * centre's calendar that holds it, else the calendar's whole window, else the
 * calendar year. [start, end].
 */
function policy_session_bounds(string $personId, string $date): array {
    static $cache = [];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$personId]);
    $cfg = $m && function_exists('member_calendar_for') ? member_calendar_for($m) : member_programme_settings();
    $k = md5(json_encode([$cfg['startDate'] ?? '', $cfg['endDate'] ?? '', $cfg['sessionWindows'] ?? [], $date]));
    if (isset($cache[$k])) return $cache[$k];
    [$a, $b] = !empty($cfg['enabled']) ? programme_term_bounds($date, $cfg) : ['', ''];
    if ($a === '' || $a > $date || ($b !== '' && $b < $date)) { $y = substr($date, 0, 4); [$a, $b] = [$y . '-01-01', $y . '-12-31']; }
    return $cache[$k] = [$a, $b !== '' ? $b : substr($date, 0, 4) . '-12-31'];
}
/** Absences without permission (not excused, not academic, not waiting on the desk) in [from, to], oldest first. */
function policy_unexcused_absences(string $personId, string $from, string $to): array {
    $out = [];
    foreach (db_all("SELECT date FROM infractions WHERE personId = ? AND kind = 'absence' AND (voidedAt IS NULL OR voidedAt = '') AND date >= ? AND date <= ? ORDER BY date", [$personId, $from, $to]) as $r) {
        $cover = function_exists('member_absence_cover') ? member_absence_cover($personId, (string)$r['date']) : '';
        if (!in_array($cover, ['approved', 'academic', 'open'], true)) $out[] = (string)$r['date'];
    }
    $out = array_merge($out, policy_halfday_pairs($personId, $from, $to));
    sort($out);
    return $out;
}

/**
 * Two half-days make one absence (owner, 31 Oct 2026). A day with a check-in
 * and no sign-out is a HALF-DAY, not an absence: the child came. It carries no
 * absence fine and no exercise of its own; every second one in the window
 * counts once towards the absences that lead to a suspension, dated on that
 * second day. Excused days are not counted, as for absences.
 *
 * @return list<string> the date of every second half-day in [from, to]
 */
function policy_halfday_pairs(string $personId, string $from, string $to): array {
    $days = [];
    foreach (db_all("SELECT date FROM infractions WHERE personId = ? AND kind = 'halfday' AND (voidedAt IS NULL OR voidedAt = '') AND date >= ? AND date <= ? ORDER BY date", [$personId, $from, $to]) as $r) {
        $cover = function_exists('member_absence_cover') ? member_absence_cover($personId, (string)$r['date']) : '';
        if (!in_array($cover, ['approved', 'academic', 'open'], true)) $days[] = (string)$r['date'];
    }
    $out = [];
    foreach ($days as $i => $d) if ($i % 2 === 1) $out[] = $d;
    return $out;
}

/** The note a no-sign-out half-day carries. Starts "Incomplete", so the
 *  repair tools and a late sign-out (policy_checkout_landed) find it. */
const POLICY_NOSIGNOUT_NOTE = 'Incomplete day — signed in, no sign-out: a half-day.';
const POLICY_HALFDAY_REASON = 'A day signed in with no sign-out is a half-day, not an absence (policy change, 31 Oct 2026).';

/**
 * Every live "Incomplete" ABSENCE becomes a half-day. Before 31 Oct 2026 a day
 * with no sign-out was counted as a whole absence and fined as one; the child
 * had come. Per person, in ONE transaction: the absences are voided with that
 * reason, a half-day is logged for each day, and the person's standing is
 * worked out again — so the day's absence fine is lifted (a paid one becomes
 * credit), and a suspension it tipped is lifted with it.
 *
 * Why per person and bounded. The first version converted every row, then
 * re-worked everybody, then set a done-flag: on a shared host the run hit PHP's
 * time limit part-way, the rows already converted were never selected again,
 * and their people were never re-worked — the absences gone from the record,
 * the fines still on the account. Now a person is converted and re-worked
 * together or not at all, a call does at most $max people, and the next call
 * carries on. A second pass re-works anybody an earlier run left half-done
 * (a converted day whose absence fine still stands). Cheap when there is
 * nothing to do: two queries.
 *
 * @return array{converted:int, people:int, reworked:int, more:bool}
 */
function policy_nosignout_to_halfday(int $max = 40): array {
    $out = ['converted' => 0, 'people' => 0, 'reworked' => 0, 'more' => false];
    $ids = db_all("SELECT DISTINCT personId, personType FROM infractions WHERE kind = 'absence' AND note LIKE 'Incomplete%' AND (voidedAt IS NULL OR voidedAt = '') LIMIT " . ($max + 1));
    if (count($ids) > $max) { $out['more'] = true; $ids = array_slice($ids, 0, $max); }
    foreach ($ids as $who) {
        $id = (string)$who['personId']; $t = in_array((string)$who['personType'], ['student', 'volunteer', 'member'], true) ? (string)$who['personType'] : 'student';
        $out['converted'] += (int)db_tx(static function () use ($id, $t) {
            $rows = db_all("SELECT id, date, byId FROM infractions WHERE personId = ? AND kind = 'absence' AND note LIKE 'Incomplete%' AND (voidedAt IS NULL OR voidedAt = '')", [$id]);
            foreach ($rows as $r) {
                db_update('infractions', ['voidedAt' => now_iso(), 'voidedBy' => 'system', 'voidReason' => POLICY_HALFDAY_REASON], ['id' => (int)$r['id']]);
                policy_log($id, $t, 'halfday', (string)$r['date'], POLICY_NOSIGNOUT_NOTE, (string)$r['byId'] ?: 'system');
            }
            policy_relift($id, $t);
            return count($rows);
        });
        $out['people']++;
    }
    /* Left half-done by an earlier run: a day converted, its absence fine still owed. */
    $stuck = db_all("SELECT DISTINCT s.personId, s.personType FROM sanctions s JOIN infractions i ON i.personId = s.personId AND i.kind = 'absence' AND i.voidReason = ?
                     WHERE s.kind = 'fine' AND s.issuedBy = 'system' AND s.status IN ('pending','paid') AND s.tier >= 500000 AND s.tier < ? LIMIT " . ($max + 1),
                    [POLICY_HALFDAY_REASON, POLICY_T_LATE_FINE]);
    if (count($stuck) > $max) { $out['more'] = true; $stuck = array_slice($stuck, 0, $max); }
    foreach ($stuck as $who) {
        $t = in_array((string)$who['personType'], ['student', 'volunteer', 'member'], true) ? (string)$who['personType'] : 'student';
        if (policy_relift((string)$who['personId'], $t) > 0) $out['reworked']++;
    }
    if ($out['converted'] || $out['reworked']) audit('policy.nosignout_halfday', 'system', '', $out);
    return $out;
}

const POLICY_PRELATE_TAG = 'Not late under the rulebook';

/**
 * Lates recorded for arrivals BEFORE lateness begins, undone. Two definitions
 * of "late" ran side by side: the older ladder logged a member late from
 * resumption + grace (09:01, 09:21), the rulebook (30 Oct 2026) only from
 * its first band (09:30). The rulebook then re-read every late on record and,
 * for an arrival before its first band, charged the first band anyway — fines
 * on the account and frog jumps on the desk's list, under a band the arrival
 * time on the same line contradicts.
 *
 * Per person, in ONE transaction (the half-day repair's lesson: a person is
 * corrected and re-worked together or not at all): each such late is voided
 * with the reason, the day is kept as `tardy` (they did come after
 * resumption — seen, costs nothing), and the person is re-worked, so the
 * band's fine is lifted off the account — a paid one stands as credit — and
 * exercise still owed is lifted. Exercise already DONE stays done: that
 * happened, and is not undone by a record. Also rewrites the words of older
 * rulebook rows to one penalty per row (policy_session_reason), and the fee
 * ledger's note with them. Bounded: at most $max people a call, `more` says
 * the next call carries on. Only while the member rulebook is `session`.
 *
 * @return array{voided:int, people:int, refunded:int, reworded:int, more:bool}
 */
function policy_prelate_repair(int $max = 40): array {
    $out = ['voided' => 0, 'people' => 0, 'refunded' => 0, 'reworded' => 0, 'more' => false];
    if (!policy_is_session('member')) return $out;
    $cfg = policy_for('member');
    $first = policy_late_bands($cfg)[0];
    $res = (string)$cfg['resumption'];
    $byPerson = [];
    foreach (db_all("SELECT i.id, i.personId, i.date, a.checkInAt FROM infractions i JOIN attendance a ON a.studentId = i.personId AND a.date = i.date
                     WHERE i.kind = 'late' AND i.personType = 'member' AND (i.voidedAt IS NULL OR i.voidedAt = '') AND a.checkInAt IS NOT NULL AND a.checkInAt <> ''
                     ORDER BY i.personId, i.date") as $r) {
        $t = strtotime((string)$r['checkInAt']); if (!$t) continue;
        $min = attendance_minutes_at((int)$t);
        if ($min < $first['min']) $byPerson[(string)$r['personId']][] = ['id' => (int)$r['id'], 'date' => (string)$r['date'], 'min' => $min];
    }
    if (count($byPerson) > $max) { $out['more'] = true; $byPerson = array_slice($byPerson, 0, $max, true); }
    foreach ($byPerson as $id => $rows) {
        $id = (string)$id;
        [$n, $refunded] = db_tx(static function () use ($id, $rows, $first, $res) {
            $paidBefore = (int)(db_row("SELECT COUNT(*) c FROM sanctions WHERE personId = ? AND kind = 'fine' AND status = 'paid' AND tier >= ? AND tier < ?", [$id, POLICY_T_LATE_FINE, POLICY_T_LATE_JUMPS])['c'] ?? 0);
            foreach ($rows as $r) {
                $at = sprintf('%02d:%02d', intdiv($r['min'], 60), $r['min'] % 60);
                db_update('infractions', ['voidedAt' => now_iso(), 'voidedBy' => 'system',
                    'voidReason' => POLICY_PRELATE_TAG . ': arrived ' . $at . ', and lateness begins at ' . $first['from'] . '.'], ['id' => $r['id']]);
                if ($r['min'] > policy_minutes($res)) policy_log($id, 'member', 'tardy', $r['date'], 'Arrived ' . $at . ' — after ' . $res . ', before lateness begins at ' . $first['from'] . ': seen, costs nothing.');
            }
            policy_relift($id, 'member');
            $paidAfter = (int)(db_row("SELECT COUNT(*) c FROM sanctions WHERE personId = ? AND kind = 'fine' AND status = 'paid' AND tier >= ? AND tier < ?", [$id, POLICY_T_LATE_FINE, POLICY_T_LATE_JUMPS])['c'] ?? 0);
            return [count($rows), $paidBefore - $paidAfter];
        });
        $out['voided'] += $n; $out['refunded'] += $refunded; $out['people']++;
    }
    /* One penalty per row: older rulebook rows said the fine and the exercise in
       one sentence. Reworded from the row's own tier and amount; a fine's ledger
       note moves with it, because that note is what the family reads. */
    $word = (string)$cfg['jumpWord'];
    $old = db_all("SELECT id, personId, kind, tier, amount, reason FROM sanctions WHERE issuedBy = 'system' AND (
                     (kind = 'fine' AND tier >= ? AND tier < ? AND reason LIKE ?) OR (kind = 'corrective' AND tier >= ? AND tier < ? AND reason LIKE ?)) LIMIT 201",
                  [POLICY_T_LATE_FINE, POLICY_T_LATE_JUMPS, '%' . $word . '%', POLICY_T_ABS_JUMPS, POLICY_T_REVIEW, '%₦%']);
    if (count($old) > 200) { $out['more'] = true; $old = array_slice($old, 0, 200); }
    foreach ($old as $s) {
        $why = policy_session_reason((string)$s['personId'], (string)$s['kind'], (int)$s['tier'], (int)$s['amount'], $cfg);
        if ($why === null || $why === (string)$s['reason']) continue;
        db_update('sanctions', ['reason' => substr($why, 0, 240)], ['id' => (int)$s['id']]);
        if ((string)$s['kind'] === 'fine') db_exec("UPDATE member_ledger SET note = ? WHERE memberId = ? AND kind = 'fine' AND periodKey = ?",
            [mb_strcut('Policy fine — ' . $why, 0, 255, 'UTF-8'), (string)$s['personId'], 'sanction-' . (int)$s['id']]);
        $out['reworded']++;
    }
    if ($out['voided'] || $out['reworded']) audit('policy.prelate_repair', 'system', '', $out);
    return $out;
}

/** admin.policy.prelate.run — apply the correction now, and say what changed. */
function admin_policy_prelate_run(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $t0 = microtime(true); $sum = ['voided' => 0, 'people' => 0, 'refunded' => 0, 'reworded' => 0, 'more' => false];
    do {
        $r = policy_prelate_repair(40);
        foreach (['voided', 'people', 'refunded', 'reworded'] as $k) $sum[$k] += $r[$k];
        $sum['more'] = $r['more'];
    } while ($r['more'] && microtime(true) - $t0 < 20);
    audit('policy.prelate.run', (string)$g['requester']['memberId'], '', $sum, (string)($p['ip'] ?? ''));
    return ['ok' => true] + $sum;
}

/** admin.policy.halfday.run — apply the half-day rule to past days now, and say what changed. */
function admin_policy_halfday_run(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $t0 = microtime(true); $sum = ['converted' => 0, 'people' => 0, 'reworked' => 0, 'more' => false];
    do {
        $r = policy_nosignout_to_halfday(40);
        foreach (['converted', 'people', 'reworked'] as $k) $sum[$k] += $r[$k];
        $sum['more'] = $r['more'];
    } while ($r['more'] && microtime(true) - $t0 < 20);
    audit('policy.halfday.run', (string)$g['requester']['memberId'], '', $sum, (string)($p['ip'] ?? ''));
    return ['ok' => true] + $sum;
}

// ── Infractions ─────────────────────────────────────────────────────────────

/** A sanction, as a family reads it in "Appeal: …". */
const POLICY_APPEAL_WORDS = ['warning' => 'a warning', 'dormant' => 'the Dormant Track', 'suspension' => 'a suspension', 'eviction' => 'an eviction',
    'fine' => 'a fine', 'corrective' => 'corrective exercise', 'review' => 'a management review'];

const POLICY_INFRACTIONS = ['absence', 'late', 'tardy', 'halfday', 'no_checkout', 'idcard_missing', 'idcard_lost', 'review_missed', 'misconduct'];

/** Record a fact. One row per person per kind per day — a second scan, or a
 *  re-run of the nightly sweep, is a no-op rather than a second strike. */
function policy_log(string $personId, string $type, string $kind, string $date, string $note = '', string $byId = 'system'): bool {
    // A written rule's breach is 'rule:<ruleId>' (policy_rule_kind); the column holds 32 characters.
    if ($personId === '' || (!in_array($kind, POLICY_INFRACTIONS, true) && !preg_match('/^rule:[A-Za-z0-9_-]{2,26}$/', $kind))) return false;
    try {
        db_insert('infractions', [
            'personId' => $personId, 'personType' => in_array($type, ['student', 'volunteer', 'member'], true) ? $type : 'student',
            'kind' => $kind, 'date' => $date, 'note' => substr($note, 0, 240),
            'byId' => substr($byId, 0, 64), 'createdAt' => now_iso(),
        ]);
        return true;
    } catch (\Throwable $e) {
        if (function_exists('attendance_is_dup') && attendance_is_dup($e)) return false;
        throw $e;
    }
}

/**
 * A sign-out that lands after the nightly sweep. The sweep judged the day
 * incomplete (no_checkout, and an absence for it) because the sign-out had
 * not arrived yet — a CACENTRE gate departure delivered late, a back-fill, a
 * desk that was offline. The day was completed, so both are voided and the
 * person's sanctions re-derived. Only the sweep's incomplete-day entries are
 * touched: an absence for a day they never came is not this function's.
 * Returns how many infractions it voided.
 */
function policy_checkout_landed(string $personId, string $type, string $date, string $byId = 'system'): int {
    if ($personId === '' || $date === '') return 0;
    $n = db_exec("UPDATE infractions SET voidedAt = ?, voidedBy = ?, voidReason = 'Signed out; the sign-out arrived after the nightly check.'
                  WHERE personId = ? AND date = ? AND (voidedAt IS NULL OR voidedAt = '')
                    AND (kind = 'no_checkout' OR (kind IN ('absence','halfday') AND note LIKE 'Incomplete%'))",
                 [now_iso(), substr($byId, 0, 64), $personId, $date]);
    if ($n > 0) {
        audit('policy.checkout_landed', $byId, $personId, ['date' => $date, 'voided' => $n]);
        /* policy_relift, not policy_apply: apply only ever ISSUES, so a voided
           absence left the warning or the Dormant Track it had caused standing. */
        policy_relift($personId, in_array($type, ['student', 'volunteer', 'member'], true) ? $type : 'student');
    }
    return $n;
}

/** The notes the nightly checks write on what they log — how a system-judged
 *  absence is told from one a person logged. */
const POLICY_SWEEP_NOTES = ['No check-in%', 'Incomplete%', 'Checked in but never%', 'Signed in but never%'];
function policy_sweep_note_sql(string $col = 'note'): string {
    return '(' . implode(' OR ', array_map(static fn($n) => "$col LIKE '" . $n . "'", POLICY_SWEEP_NOTES)) . ')';
}

/**
 * An ARRIVAL that lands after the nightly check — the CACENTRE gate
 * re-sending a day, a back-fill, a terminal that was offline, a punch the
 * desk matched by hand. The check logged an absence because the check-in had
 * not arrived yet; it has now, so that absence is voided and the person's
 * standing re-derived (a Dormant Track it caused is lifted). Only the check's
 * own "no check-in" absences — never one a person logged.
 */
function policy_checkin_landed(string $personId, string $type, string $date, string $byId = 'system'): int {
    if ($personId === '' || $date === '') return 0;
    $n = db_exec("UPDATE infractions SET voidedAt = ?, voidedBy = ?, voidReason = 'Checked in; the check-in arrived after the nightly check.'
                  WHERE personId = ? AND date = ? AND kind = 'absence' AND byId = 'system' AND note LIKE 'No check-in%'
                    AND (voidedAt IS NULL OR voidedAt = '')", [now_iso(), substr($byId, 0, 64), $personId, $date]);
    if ($n > 0) {
        audit('policy.checkin_landed', $byId, $personId, ['date' => $date, 'voided' => $n]);
        policy_relift($personId, in_array($type, ['student', 'volunteer', 'member'], true) ? $type : 'student');
    }
    return $n;
}

/* ── The outage brake ─────────────────────────────────────────────────────
 * The nightly check reads "no row in attendance" as "did not come". That is
 * only true while check-ins are reaching NGG. When CACENTRE's gate became
 * the door and its punches named members in a way the hook did not
 * recognise, every member at every centre was "absent" every week, and three
 * weeks of it put the whole programme on the Dormant Track. A centre where
 * NOBODY checked in on a day its members were expected did not stay home:
 * the feed failed. So that centre-day is HELD — logged as held, counted for
 * nobody — until a person says which it was (admin_attendance_held_decide).
 * The same for a day when almost nobody checked in anywhere. */
const POLICY_OUTAGE_CENTRE_MIN = 3;     // a centre with at least this many expected and none present is held
const POLICY_OUTAGE_DAY_MIN = 10;       // a day with at least this many expected…
const POLICY_OUTAGE_DAY_SHARE = 0.1;    // …and fewer than this share present is held everywhere

/**
 * Decide which centres' absences for $date the check may count. $due:
 * centre => [ids expected that day]; $present: id => anything, for those who
 * checked in. Records each held centre-day once. Returns the centres held.
 *
 * $cause 'checkout' asks the same question of DEPARTURES: $due is who signed
 * in, $present who signed out. That is the failure that actually happened —
 * the CACENTRE gate delivered every arrival and, with check-outs to NGG
 * switched off, no departure, so a whole centre "signed in but never signed
 * out" and each of them took an absence. A centre where people came and not
 * one of them left is the feed, not the children.
 */
function policy_outage_hold(string $date, string $type, array $due, array $present, string $cause = 'checkin'): array {
    $out = $cause === 'checkout';
    if (empty(policy_settings()['outageBrake'])) return [];
    $held = []; $totalDue = 0; $totalIn = 0; $byCentre = [];
    foreach ($due as $centre => $ids) {
        $in = 0; foreach ($ids as $id) if (array_key_exists($id, $present)) $in++;
        $byCentre[$centre] = [count($ids), $in]; $totalDue += count($ids); $totalIn += $in;
    }
    $dayWide = $totalDue >= POLICY_OUTAGE_DAY_MIN && $totalIn < $totalDue * POLICY_OUTAGE_DAY_SHARE;
    foreach ($byCentre as $centre => [$n, $in]) {
        $why = '';
        $where = $centre !== '' ? $centre : 'people with no centre';
        if ($dayWide) $why = $out ? 'Almost nobody signed out anywhere: ' . $totalIn . ' of ' . $totalDue . ' who signed in.'
                                  : 'Almost nobody checked in anywhere: ' . $totalIn . ' of ' . $totalDue . ' expected.';
        elseif ($n >= POLICY_OUTAGE_CENTRE_MIN && $in === 0) $why = $out ? 'No sign-outs arrived from ' . $where . ': 0 of ' . $n . ' who signed in.'
                                                                          : 'No check-ins arrived from ' . $where . ': 0 of ' . $n . ' expected.';
        if ($why === '') continue;
        $held[$centre] = true;
        try {
            if (!db_row('SELECT id FROM attendance_held_days WHERE date = ? AND centre = ? AND personType = ? LIMIT 1', [$date, (string)$centre, $type])) {
                db_insert('attendance_held_days', ['date' => $date, 'centre' => (string)$centre, 'personType' => $type, 'expected' => $n, 'present' => $in,
                    'why' => mb_substr($why, 0, 240), 'status' => 'held', 'cause' => $out ? 'checkout' : 'checkin', 'createdAt' => now_iso()]);
            }
        } catch (\Throwable $e) { error_log('[policy_outage_hold] ' . $e->getMessage()); }
    }
    if ($held) audit('policy.day_held', 'system', $date, ['type' => $type, 'cause' => $out ? 'checkout' : 'checkin', 'centres' => array_keys($held), 'dayWide' => $dayWide]);
    return $held;
}

/** The departures half of the brake, for one day: of the centres not already
 *  held for missing arrivals, who signed in (by centre) and who of them signed
 *  out. $present: id => checkOutAt ('' when none). */
function policy_checkout_hold(string $date, string $type, array $due, array $present, array $alreadyHeld): array {
    $in = []; $outP = [];
    foreach ($due as $centre => $ids) {
        if (isset($alreadyHeld[$centre])) continue;
        foreach ($ids as $id) {
            if (!array_key_exists($id, $present)) continue;
            $in[$centre][] = $id;
            if ((string)$present[$id] !== '') $outP[$id] = true;
        }
    }
    return $in ? policy_outage_hold($date, $type, $in, $outP, 'checkout') : [];
}

/** Live (non-voided) infraction counts by kind for one person. */
function policy_counts(string $personId): array {
    $out = array_fill_keys(POLICY_INFRACTIONS, 0);
    foreach (db_all("SELECT kind, COUNT(*) c FROM infractions WHERE personId = ? AND (voidedAt IS NULL OR voidedAt = '') GROUP BY kind", [$personId]) as $r) {
        $out[(string)$r['kind']] = (int)$r['c'];
    }
    // §"The Musing Period" — a half-day is half an attendance, so two of them
    // cost a day. They accelerate the dormancy track rather than sidestepping it.
    $out['absenceEquivalent'] = $out['absence'] + intdiv($out['halfday'], 2);
    return $out;
}

// ── Sanctions ───────────────────────────────────────────────────────────────

/* `corrective` is exercise owed at the centre (the rulebook's frog jumps):
   amount = how many, pending → done. `review` is a late management must look
   at: raised `proposed`, closed `cleared`. */
const POLICY_SANCTIONS = ['warning', 'dormant', 'suspension', 'fine', 'eviction', 'corrective', 'review'];

/** Issue a sanction once per threshold crossing. `tier` is the count that
 *  triggered it, so re-evaluating after a third absence cannot re-issue the
 *  warning the first one earned. */
function policy_issue(string $personId, string $type, string $kind, int $tier, array $extra = []): bool {
    if (!in_array($kind, POLICY_SANCTIONS, true)) return false;
    $now = now_iso();
    try {
        db_insert('sanctions', [
            'personId' => $personId, 'personType' => in_array($type, ['student', 'volunteer', 'member'], true) ? $type : 'student',
            'kind' => $kind, 'tier' => $tier,
            'reason' => substr((string)($extra['reason'] ?? ''), 0, 240),
            'amount' => (int)($extra['amount'] ?? 0),
            'startsAt' => (string)($extra['startsAt'] ?? $now),
            'endsAt' => (string)($extra['endsAt'] ?? ''),
            'status' => (string)($extra['status'] ?? 'active'),
            'issuedBy' => substr((string)($extra['issuedBy'] ?? 'system'), 0, 64),
            'issuedAt' => $now, 'createdAt' => $now,
        ]);
        if ($kind === 'fine') {
            $new = db_row('SELECT id FROM sanctions WHERE personId = ? AND kind = ? AND tier = ?', [$personId, $kind, $tier]);
            policy_fine_to_ledger($personId, $type, (int)($new['id'] ?? 0), (int)($extra['amount'] ?? 0), (string)($extra['reason'] ?? ''));
            if ($type === 'member' && function_exists('family_alert_fine')) {
                try { family_alert_fine($personId, (int)($extra['amount'] ?? 0), (string)($extra['reason'] ?? '')); } catch (\Throwable $e) { /* a mail must not undo a fine */ }
            }
        }
        event_emit('policy.sanction', ['ref' => $personId, 'kind' => $kind, 'tier' => $tier, 'personType' => $type, 'reason' => (string)($extra['reason'] ?? '')]);
        return true;
    } catch (\Throwable $e) {
        if (!function_exists('attendance_is_dup') || !attendance_is_dup($e)) throw $e;
        // The (person, kind, tier) row already exists. If it is still active
        // this is the idempotent no-op we want. If it was LIFTED — a wrongly
        // logged infraction was voided, and the person has since crossed the
        // same threshold again — the unique index would otherwise make that
        // threshold un-re-crossable for the rest of their record. Reactivate.
        $row = db_row('SELECT id, status FROM sanctions WHERE personId = ? AND kind = ? AND tier = ?', [$personId, $kind, $tier]);
        if (!$row || (string)$row['status'] !== 'lifted') return false;
        db_update('sanctions', [
            'status' => (string)($extra['status'] ?? 'active'),
            'reason' => substr((string)($extra['reason'] ?? ''), 0, 240),
            'startsAt' => (string)($extra['startsAt'] ?? $now),
            'endsAt' => (string)($extra['endsAt'] ?? ''),
            'issuedAt' => $now, 'clearedAt' => '', 'clearedBy' => '',
        ], ['id' => (int)$row['id']]);
        if ($kind === 'fine') {
            policy_fine_to_ledger($personId, $type, (int)$row['id'], (int)($extra['amount'] ?? 0), (string)($extra['reason'] ?? ''));
        }
        event_emit('policy.sanction', ['ref' => $personId, 'kind' => $kind, 'tier' => $tier, 'personType' => $type, 'reason' => (string)($extra['reason'] ?? ''), 'reissued' => true]);
        return true;
    }
}


/**
 * A policy fine is money, so it belongs on the ledger.
 *
 * There were two fine systems and they did not know about each other. A fine
 * issued by the policy engine for lateness lived only in `sanctions`, so it was
 * never in `payable`, never chased, and never in the arrears list — while a fine
 * an admin typed in lived only in `member_ledger`, so the compliance record did
 * not know it existed. "What does this member owe" had two different answers
 * depending on which screen a coordinator opened, and a coordinator who noticed
 * and recorded the policy fine by hand billed the family twice.
 *
 * The ledger is now the single answer for money; `sanctions` stays the
 * disciplinary record, with its own due process, appeals and thresholds. This is
 * the one bridge between them.
 *
 * Idempotent on the sanction id, so re-running policy evaluation cannot charge
 * a family twice for the same infraction — which is the failure that matters
 * most here, and the reason this posts through fees_post rather than inserting
 * directly.
 */
function policy_fine_to_ledger(string $personId, string $type, int $sanctionId, int $amount, string $reason): void {
    // Only members carry a fee ledger. Summer students and volunteers are
    // disciplined by the same policy but do not have an account.
    if ($type !== 'member' || $amount <= 0 || $sanctionId <= 0) return;
    if (!function_exists('fees_post')) return;
    if (!db_row('SELECT id FROM members WHERE memberId = ? LIMIT 1', [$personId])) return;
    /* The fine NAMES its conduct rule, from what the sanction is (its tier),
       never from its wording: a late band's fine is a lateness fine, an absence
       fine an absence fine, anything else (a re-entry fee, an ID card) is under
       no conduct cap. */
    $tier = (int)(db_row('SELECT tier FROM sanctions WHERE id = ?', [$sanctionId])['tier'] ?? 0);
    $rule = ($tier >= POLICY_T_LATE_FINE && $tier < POLICY_T_LATE_JUMPS) || ($tier > 0 && $tier < 1000) ? 'late'
          : ($tier >= 500000 && $tier < POLICY_T_LATE_FINE ? 'absent' : '');
    /* A written rule's fine falls under that rule's KIND when it has one, so the
       kind's switch and term cap apply on the ledger; a re-entry fee never does. */
    if (($parts = policy_rule_tier_parts($tier)) && $parts[0] === POLICY_T_RULE_FINE) {
        $rule = (string)(policy_rules_index()['bySeq'][$parts[1]]['reason'] ?? '');
    }
    $row = fees_post($personId, 'fine', $amount, [
        // The sanction id IS the period key: one ledger row per sanction, ever.
        'periodKey' => 'sanction-' . $sanctionId,
        'note' => 'Policy fine' . ($reason !== '' ? ' — ' . $reason : ''),
        'by' => 'policy', 'rule' => $rule,
        // A sanction issued again after it was lifted owes again (fees_post).
        'reissue' => true,
    ]);
    /* A conduct rule switched off, or its term cap reached, posts less than
       the sanction says — or nothing. The sanction says the same, or the
       conduct board goes on asking for money the account never charged. */
    $posted = $row ? (int)$row['amount'] : 0;
    if ($posted <= 0) {
        db_update('sanctions', ['status' => 'lifted', 'clearedAt' => now_iso(), 'clearedBy' => 'rule',
            'reason' => mb_substr(trim($reason . ' Not charged: the ' . ($rule !== '' ? $rule : 'conduct') . ' rule is off or its term cap is reached.'), 0, 240)], ['id' => $sanctionId]);
    } elseif ($posted < $amount) {
        db_update('sanctions', ['amount' => $posted, 'reason' => mb_substr(trim($reason . ' Reduced to ' . policy_naira($posted) . ' by the term cap.'), 0, 240)], ['id' => $sanctionId]);
    }
}

/**
 * A sanction that is lifted, voided or paid must stop being money owed.
 *
 * Without this, clearing a wrongly-logged infraction left the charge sitting on
 * the family's account for ever — the disciplinary record would say "lifted"
 * while the ledger went on asking for the money, which is the worst of both.
 */
function policy_fine_void_ledger(string $personId, int $sanctionId, string $why = 'Sanction lifted'): void {
    if ($sanctionId <= 0) return;
    $row = db_row("SELECT entryId FROM member_ledger WHERE memberId = ? AND kind = 'fine' AND periodKey = ? AND (voidedAt IS NULL OR voidedAt = '') LIMIT 1",
                  [$personId, 'sanction-' . $sanctionId]);
    if (!$row) return;
    db_update('member_ledger', ['voidedAt' => now_iso(), 'voidedBy' => 'policy',
                                'voidReason' => substr($why, 0, 255)], ['entryId' => (string)$row['entryId']]);
}

/** Sanctions still in force. A lifted/cleared/served/paid one is history. */
function policy_live_sanctions(string $personId): array {
    return db_all("SELECT * FROM sanctions WHERE personId = ? AND status = 'active' ORDER BY issuedAt", [$personId]);
}

/**
 * The person's compliance state right now, derived — never stored.
 *
 *   evicted   > suspended > dormant > warned > clear
 *
 * A suspension whose window has elapsed stops blocking but stays on record;
 * lateness accrued after it started is what the post-suspension ultimatum
 * counts, so the row is never deleted.
 */
function policy_state(string $personId, string $type = 'student'): array {
    $counts = policy_counts($personId);
    $sanctions = db_all("SELECT * FROM sanctions WHERE personId = ? ORDER BY issuedAt", [$personId]);
    $today = attendance_today();
    $state = 'clear'; $until = ''; $reason = '';
    $fines = []; $evictedAt = ''; $suspendedFrom = ''; $proposed = []; $jumps = 0; $reentry = 0;
    foreach ($sanctions as $s) {
        $kind = (string)$s['kind'];
        $status = (string)$s['status'];
        if ($kind === 'fine' && in_array($status, ['active', 'pending'], true)) $fines[] = $s;
        if ($kind === 'corrective' && $status === 'pending') { $jumps += (int)$s['amount']; continue; }
        // Crossed the threshold, waiting on an admin. Visible, not enforced.
        if ($status === 'proposed') { $proposed[] = ['kind' => $kind, 'reason' => (string)$s['reason'], 'sanctionId' => (int)$s['id']]; continue; }
        if ($status !== 'active') continue;
        if ($kind === 'eviction') { $state = 'evicted'; $evictedAt = (string)$s['issuedAt']; $reason = (string)$s['reason']; }
        elseif ($kind === 'suspension') {
            $suspendedFrom = (string)$s['startsAt'];
            $ends = (string)$s['endsAt'];
            $owed = policy_reentry_owed($sanctions, $s);
            if ($state !== 'evicted' && ($ends === '' || substr($ends, 0, 10) >= $today)) {
                $state = 'suspended'; $until = $ends; $reason = (string)$s['reason'];
                if ($owed) $reentry = (int)$owed['amount'];
            } elseif ($state !== 'evicted' && $owed) {
                // The week is over; the door stays shut until the re-entry fee is settled.
                $state = 'suspended'; $until = ''; $reentry = (int)$owed['amount'];
                $reason = 'Suspension served — the ' . policy_naira($reentry) . ' re-entry fee must be paid before returning.';
            }
        } elseif ($kind === 'dormant' && !in_array($state, ['evicted', 'suspended'], true)) {
            $state = 'dormant'; $reason = (string)$s['reason'];
        } elseif ($kind === 'warning' && $state === 'clear') {
            $state = 'warned'; $reason = (string)$s['reason'];
        }
    }
    $owed = 0;
    foreach ($fines as $f) $owed += (int)$f['amount'];
    $cfg = policy_for($type);
    return [
        'state' => $state,
        'until' => $until,
        'reason' => $reason,
        'proposed' => $proposed,
        'awaitingReview' => count($proposed) > 0,
        'evictedAt' => $evictedAt,
        'suspendedFrom' => $suspendedFrom,
        'absences' => $counts['absenceEquivalent'],
        'absenceLimit' => (int)$cfg['absenceLimit'],
        'lates' => $counts['late'],
        'latenessCap' => (int)$cfg['latenessCap'],
        'halfDays' => $counts['halfday'],
        'tardies' => $counts['tardy'],
        'idCardMisses' => $counts['idcard_missing'],
        'finesOwed' => $owed,
        'jumpsOwed' => $jumps,
        'reentryOwed' => $reentry,
        'jumpWord' => (string)(policy_for($type)['jumpWord'] ?? 'frog jumps'),
        // §1.1 — dormancy freezes eligibility for the ₦500k awards.
        'awardsEligible' => in_array($state, ['clear', 'warned'], true) && $owed === 0,
        'blocked' => in_array($state, ['evicted', 'suspended'], true),
    ];
}

/**
 * policy_state() for a whole roster in two queries instead of two per person.
 * Drawing a 600-student attendance table one policy_state() at a time is 1,200
 * round trips; this is the same answer, batched.
 */
function policy_states_for(array $personIds, string $type = 'student'): array {
    $ids = array_values(array_unique(array_filter(array_map('strval', $personIds), fn($s) => $s !== '')));
    if (!$ids) return [];
    $cfg = policy_for($type);
    $today = attendance_today();
    $out = [];
    // Chunked so a big roster cannot blow the driver's placeholder limit.
    foreach (array_chunk($ids, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        $counts = [];
        foreach (db_all("SELECT personId, kind, COUNT(*) c FROM infractions WHERE personId IN ($ph) AND (voidedAt IS NULL OR voidedAt = '') GROUP BY personId, kind", $chunk) as $r) {
            $counts[(string)$r['personId']][(string)$r['kind']] = (int)$r['c'];
        }
        $live = [];
        foreach (db_all("SELECT personId, kind, tier, status, endsAt, amount, reason FROM sanctions WHERE personId IN ($ph) AND status IN ('active','pending','proposed')", $chunk) as $r) {
            $live[(string)$r['personId']][] = $r;
        }
        foreach ($chunk as $id) {
            $c = ($counts[$id] ?? []) + array_fill_keys(POLICY_INFRACTIONS, 0);
            $abs = $c['absence'] + intdiv($c['halfday'], 2);
            $state = 'clear'; $until = ''; $owed = 0; $proposed = []; $jumps = 0; $reentry = 0;
            foreach ($live[$id] ?? [] as $s) {
                $kind = (string)$s['kind'];
                // Owed is active or pending, exactly as policy_state() reads it — a proposed fine is not owed yet.
                if ($kind === 'fine') { if (in_array((string)$s['status'], ['active', 'pending'], true)) $owed += (int)$s['amount']; continue; }
                if ($kind === 'corrective') { if ((string)$s['status'] === 'pending') $jumps += (int)$s['amount']; continue; }
                if ((string)$s['status'] === 'proposed') { $proposed[] = ['kind' => $kind, 'reason' => (string)$s['reason']]; continue; }
                if ($kind === 'eviction') { $state = 'evicted'; }
                elseif ($kind === 'suspension' && $state !== 'evicted') {
                    // The same reading as policy_state(): a served suspension with its re-entry fee owed still shuts the door.
                    $ends = (string)$s['endsAt'];
                    $fee = policy_reentry_owed($live[$id], $s);
                    if ($ends === '' || substr($ends, 0, 10) >= $today || $fee) { $state = 'suspended'; $until = $fee && $ends !== '' && substr($ends, 0, 10) < $today ? '' : $ends; }
                    if ($fee) $reentry = (int)$fee['amount'];
                } elseif ($kind === 'dormant' && !in_array($state, ['evicted', 'suspended'], true)) $state = 'dormant';
                elseif ($kind === 'warning' && $state === 'clear') $state = 'warned';
            }
            $out[$id] = [
                'state' => $state, 'until' => $until,
                'proposed' => $proposed, 'awaitingReview' => count($proposed) > 0,
                'absences' => $abs, 'absenceLimit' => (int)$cfg['absenceLimit'],
                'lates' => $c['late'], 'latenessCap' => (int)$cfg['latenessCap'],
                'halfDays' => $c['halfday'], 'tardies' => $c['tardy'],
                'idCardMisses' => $c['idcard_missing'], 'finesOwed' => $owed, 'jumpsOwed' => $jumps, 'reentryOwed' => $reentry,
                'awardsEligible' => in_array($state, ['clear', 'warned'], true) && $owed === 0,
                'blocked' => in_array($state, ['evicted', 'suspended'], true),
            ];
        }
    }
    return $out;
}

/**
 * Re-derive every sanction this person's infractions have earned, and issue
 * whichever are missing. Safe to call as often as you like: each issue is
 * keyed on (person, kind, tier).
 */
function policy_apply(string $personId, string $type): array {
    $cfg = policy_for($type);
    $counts = policy_counts($personId);
    $issued = [];
    // 'proposed' means the threshold is crossed and the outcome is waiting on a
    // human. It appears on the board as needing review, and does NOT block the
    // scanner until an admin confirms it into 'active'.
    $grave = !empty(policy_settings()['autoEnforce']) ? 'active' : 'proposed';
    // Eviction confirmation is scoped to NGG members: ON (default) holds a
    // member's eviction as a proposal for an admin to confirm. Summer students
    // and volunteers are unaffected — their eviction follows $grave (autoEnforce)
    // as before, per the Governing Council's fully-automatic stance for them.
    $evict = ($type === 'member' && !empty(policy_settings()['confirmEviction'])) ? 'proposed' : $grave;

    $session = policy_is_session($type);
    if ($session) $issued = array_merge($issued, policy_apply_session($personId, $type, $cfg, $grave));
    // Written rules apply under either rulebook: a breach is a breach.
    if ($type === 'member') $issued = array_merge($issued, policy_apply_rules($personId, $type, $cfg, $grave));
    // §1.1 Attendance — strike 1 warning, strike 2 dormancy, strike 3 eviction. (The ladder rulebook only.)
    $limit = (int)$cfg['absenceLimit'];
    $abs = $session ? 0 : (int)$counts['absenceEquivalent'];
    for ($n = 1; $n <= min($abs, $limit); $n++) {
        $kind = $n >= $limit ? 'dormant' : 'warning';
        $label = $n >= $limit
            ? "Absence {$n} of {$limit} — Dormant Track: programme privileges, special activities and awards eligibility are frozen."
            : "Absence {$n} of {$limit} — first warning.";
        if (policy_issue($personId, $type, $kind, $n, ['reason' => $label])) $issued[] = $kind;
    }
    if ($abs > $limit) {
        // Eviction — total termination of association — is admin-confirmed by
        // default ($evict = 'proposed'): the threshold crossing is auto-flagged,
        // but the irreversible act waits for an admin to confirm the proposal
        // into 'active'. An admin can turn confirmEviction off, and it then
        // follows $grave (autoEnforce) like the reversible sanctions.
        $reason = "Absence {$abs} — past the {$limit}-absence limit. Eviction under §1.1"
            . ($evict === 'proposed' ? ' (awaiting admin confirmation).' : '.');
        if (policy_issue($personId, $type, 'eviction', $abs, [
            'status' => $evict,
            'reason' => $reason,
        ])) $issued[] = 'eviction';
    }

    // §1.2 / §2.1 Lateness — cap → suspension, then post-suspension lateness →
    // fine or eviction. "Post-suspension" is counted from the suspension's
    // start, which is why the served suspension row is kept.
    $cap = (int)$cfg['latenessCap'];
    $lates = $session ? 0 : (int)$counts['late'];
    if ($lates >= $cap) {
        $days = (int)$cfg['suspensionDays'];
        $start = attendance_today();
        if (policy_issue($personId, $type, 'suspension', $cap, [
            'status' => $grave,
            'reason' => "{$lates} lateness logs (cap {$cap}) — {$days}-day institutional suspension.",
            'startsAt' => $start,
            'endsAt' => gmdate('Y-m-d', (int)strtotime($start . ' 00:00:00 UTC') + $days * 86400),
        ])) $issued[] = 'suspension';

        $susp = db_row("SELECT startsAt FROM sanctions WHERE personId = ? AND kind = 'suspension' ORDER BY issuedAt LIMIT 1", [$personId]);
        $from = substr((string)($susp['startsAt'] ?? ''), 0, 10);
        if ($from !== '') {
            $after = (int)(db_row("SELECT COUNT(*) c FROM infractions WHERE personId = ? AND kind = 'late' AND date > ? AND (voidedAt IS NULL OR voidedAt = '')", [$personId, $from])['c'] ?? 0);
            $post = (int)$cfg['postSuspensionLateness'];
            if ($after >= $post) {
                // The blueprint's ultimatum: a fine OR eviction. The system
                // raises the fine and holds it pending; non-payment is the
                // admin's decision to escalate, not an automatic expulsion.
                if (policy_issue($personId, $type, 'fine', $after, [
                    'amount' => (int)$cfg['fine'], 'status' => 'pending',
                    'reason' => "{$after} lateness logs after suspension — ₦" . number_format((float)$cfg['fine']) . " fine, or eviction if unpaid.",
                ])) $issued[] = 'fine';
            }
        }
    }

    // NGG members: every late costs, from the first — the ledger is theirs.
    // One fine per late (tier 400000 + n), so re-evaluating never charges twice.
    if ($type === 'member' && !$session && (int)($cfg['lateFine'] ?? 0) > 0) {
        $amt = (int)$cfg['lateFine'];
        for ($n = 1; $n <= min($lates, 5000); $n++) {
            if (policy_issue($personId, $type, 'fine', 400000 + $n, [
                'amount' => $amt, 'status' => 'pending',
                'reason' => "Late {$n} — ₦" . number_format((float)$amt) . ' lateness fine (NGG members are fined from the first late).',
            ])) $issued[] = 'fine';
        }
    }

    /* NGG members: an absence nobody asked to be excused is fined. One fine per
       absent DAY (tier 500000 + the day number), so re-evaluating never charges
       twice. A day covered by an OPEN request is held until the desk decides —
       a parent who told us in time is not fined while we have not answered;
       an approved request excuses it; a declined or withdrawn one does not. */
    if ($type === 'member' && (int)($cfg['absenceFine'] ?? 0) > 0 && function_exists('member_absence_cover')) {
        $amt = (int)$cfg['absenceFine'];
        foreach (db_all("SELECT date FROM infractions WHERE personId = ? AND kind = 'absence' AND (voidedAt IS NULL OR voidedAt = '') ORDER BY date", [$personId]) as $a) {
            $d = (string)$a['date'];
            $cover = member_absence_cover($personId, $d);
            if ($cover === 'approved' || $cover === 'academic' || $cover === 'open') continue;
            if (policy_issue($personId, $type, 'fine', 500000 + intdiv((int)strtotime($d . ' 00:00:00 UTC'), 86400), [
                'amount' => $amt, 'status' => 'pending',
                'reason' => 'Absent on ' . gmdate('D j M Y', (int)strtotime($d . ' 00:00:00 UTC')) . ($cover === 'declined' ? ' — the request was not approved' : ' with no absence request')
                    . ' — ₦' . number_format((float)$amt) . ' absence fine.',
            ])) $issued[] = 'fine';
        }
    }

    // §2.3 Volunteer dormancy — a pattern of missed Review Times.
    if ($type === 'volunteer') {
        $rcap = (int)($cfg['reviewMissedCap'] ?? 2);
        if ((int)$counts['review_missed'] >= $rcap) {
            if (policy_issue($personId, $type, 'dormant', 1000 + (int)$counts['review_missed'], [
                'reason' => "{$counts['review_missed']} missed Review Times — un-deployed to the bench pending management clearance (§2.3).",
            ])) $issued[] = 'dormant';
        }
    }

    // §2.2 ID credentials — first miss is a courtesy, the second is a fine.
    $misses = (int)$counts['idcard_missing'];
    if ($misses >= 2) {
        $amount = (int)policy_settings()['idCard']['secondOffenceFine'];
        if (policy_issue($personId, $type, 'fine', 2000 + $misses, [
            'amount' => $amount, 'status' => 'pending',
            'reason' => "ID card not worn — offence {$misses}. ₦" . number_format((float)$amount) . " fine (§2.2).",
        ])) $issued[] = 'fine';
    }
    $lost = (int)$counts['idcard_lost'];
    if ($lost >= 1) {
        $amount = (int)policy_settings()['idCard']['lostFine'];
        if (policy_issue($personId, $type, 'fine', 3000 + $lost, [
            'amount' => $amount, 'status' => 'pending',
            'reason' => "Lost ID card — ₦" . number_format((float)$amount) . " replacement fee before a new credential is minted (§2.2).",
        ])) $issued[] = 'fine';
    }

    return $issued;
}

/**
 * The rulebook's sanctions for one member, derived from the record every time
 * (each keyed by its tier, so nothing is issued twice):
 *
 *   a late       the band its arrival fell in: the band's fine, its corrective
 *                exercise — or, at or after reviewFrom, a review for management
 *   an absence   without permission: corrective exercise (the fine is the
 *                absence fine below, shared with the ladder)
 *   a session    every `suspendAfterAbsences` absences without permission in
 *                it: a suspension of `suspendDays`, and its re-entry fee
 */
function policy_apply_session(string $personId, string $type, array $cfg, string $grave): array {
    $issued = []; $word = (string)$cfg['jumpWord'];
    foreach (db_all("SELECT date FROM infractions WHERE personId = ? AND kind = 'late' AND (voidedAt IS NULL OR voidedAt = '') ORDER BY date", [$personId]) as $l) {
        $d = (string)$l['date']; $n = policy_day_number($d);
        $min = policy_arrival_minute($personId, $d);
        $b = policy_band_for($cfg, $min ?? policy_late_bands($cfg)[0]['min']);
        /* Arrived before lateness begins: not a late under this rulebook, so
           nothing is issued (policy_prelate_repair voids the entry itself). */
        if ($b['before']) continue;
        $at = $min !== null ? sprintf('%02d:%02d', intdiv($min, 60), $min % 60) : 'late';
        $when = 'Arrived ' . $at . ' on ' . policy_day_text($d);
        if ($b['review']) {
            if (policy_issue($personId, $type, 'review', POLICY_T_REVIEW + $n, ['status' => 'proposed',
                'reason' => $when . ' — at or after ' . $b['from'] . ': for management review and appropriate disciplinary action.'])) $issued[] = 'review';
            continue;
        }
        if ($b['fine'] > 0 && policy_issue($personId, $type, 'fine', POLICY_T_LATE_FINE + $n, ['amount' => $b['fine'], 'status' => 'pending',
            'reason' => policy_session_reason($personId, 'fine', POLICY_T_LATE_FINE + $n, $b['fine'], $cfg)])) $issued[] = 'fine';
        if ($b['jumps'] > 0 && policy_issue($personId, $type, 'corrective', POLICY_T_LATE_JUMPS + $n, ['amount' => $b['jumps'], 'status' => 'pending',
            'reason' => policy_session_reason($personId, 'corrective', POLICY_T_LATE_JUMPS + $n, $b['jumps'], $cfg)])) $issued[] = 'corrective';
    }
    $jumps = (int)$cfg['absenceJumps']; $fine = (int)($cfg['absenceFine'] ?? 0);
    $unexcused = [];
    foreach (db_all("SELECT date FROM infractions WHERE personId = ? AND kind = 'absence' AND (voidedAt IS NULL OR voidedAt = '') ORDER BY date", [$personId]) as $a) {
        $d = (string)$a['date'];
        $cover = function_exists('member_absence_cover') ? member_absence_cover($personId, $d) : '';
        if (in_array($cover, ['approved', 'academic', 'open'], true)) continue;
        $unexcused[] = $d;
        if ($jumps > 0 && policy_issue($personId, $type, 'corrective', POLICY_T_ABS_JUMPS + policy_day_number($d), ['amount' => $jumps, 'status' => 'pending',
            'reason' => policy_session_reason($personId, 'corrective', POLICY_T_ABS_JUMPS + policy_day_number($d), $jumps, $cfg)])) $issued[] = 'corrective';
    }
    // Per session: every N absences without permission is a suspension, and its re-entry fee.
    $every = max(1, (int)$cfg['suspendAfterAbsences']);
    $bySession = [];
    foreach ($unexcused as $d) { [$a] = policy_session_bounds($personId, $d); $bySession[$a][] = $d; }
    /* Two half-days (signed in, no sign-out) count as one absence in their
       session — paired within the session, dated on the second. */
    $halves = [];
    foreach (db_all("SELECT date FROM infractions WHERE personId = ? AND kind = 'halfday' AND (voidedAt IS NULL OR voidedAt = '') ORDER BY date", [$personId]) as $h) {
        $d = (string)$h['date'];
        $cover = function_exists('member_absence_cover') ? member_absence_cover($personId, $d) : '';
        if (in_array($cover, ['approved', 'academic', 'open'], true)) continue;
        [$a] = policy_session_bounds($personId, $d); $halves[$a][] = $d;
    }
    foreach ($halves as $a => $ds) { foreach ($ds as $i => $d) if ($i % 2 === 1) $bySession[$a][] = $d; sort($bySession[$a]); }
    foreach ($bySession as $start => $days) {
        $times = min(9, intdiv(count($days), $every));
        for ($j = 1; $j <= $times; $j++) {
            $trigger = $days[$j * $every - 1];
            $from = gmdate('Y-m-d', (int)strtotime($trigger . ' 00:00:00 UTC') + 86400);
            $to = gmdate('Y-m-d', (int)strtotime($from . ' 00:00:00 UTC') + ((int)$cfg['suspendDays'] - 1) * 86400);
            $suffix = policy_day_number($start) * 10 + $j;
            $fee = (int)$cfg['reentryFee'];
            if (policy_issue($personId, $type, 'suspension', POLICY_T_SUSPENSION + $suffix, ['status' => $grave, 'startsAt' => $from, 'endsAt' => $to,
                'reason' => ($j * $every) . ' absences without permission this session (the last on ' . policy_day_text($trigger) . ') — suspended ' . policy_day_text($from) . ' to ' . policy_day_text($to)
                    . ($fee > 0 ? '; may resume after that on payment of the ' . policy_naira($fee) . ' re-entry fee.' : '.')])) $issued[] = 'suspension';
            if ($fee > 0 && policy_issue($personId, $type, 'fine', POLICY_T_REENTRY + $suffix, ['amount' => $fee, 'status' => 'pending',
                'reason' => 'Re-entry fee after the suspension from ' . policy_day_text($from) . ' — ' . policy_naira($fee) . ', paid before resuming.'])) $issued[] = 'fine';
        }
    }
    return $issued;
}

/**
 * A written rule's consequences for one member, derived from their recorded
 * breaches every time (each keyed by its tier, so nothing is issued twice and
 * voiding a breach lifts what it caused — policy_rulebook_holds):
 *
 *   each breach    the rule's fine (within its term cap) and its corrective
 *                  exercise
 *   the Nth breach of the rule in one session (and every Nth after it):
 *                  a suspension of the rule's length, with its re-entry fee —
 *                  or a management review
 *
 * A rule switched off issues nothing new; what it already issued stands until
 * its breach is voided, because the breach happened under the rule as it was.
 */
function policy_apply_rules(string $personId, string $type, array $cfg, string $grave): array {
    $issued = []; $word = (string)($cfg['jumpWord'] ?? 'frog jumps');
    $rows = db_all("SELECT kind, date FROM infractions WHERE personId = ? AND kind LIKE 'rule:%' AND (voidedAt IS NULL OR voidedAt = '') ORDER BY date", [$personId]);
    if (!$rows) return [];
    $R = policy_rules_index();
    $byRule = [];
    foreach ($rows as $b) $byRule[substr((string)$b['kind'], 5)][] = (string)$b['date'];
    foreach ($byRule as $rid => $days) {
        $r = $R['byId'][$rid] ?? null;
        if (!$r || !(int)$r['active']) continue;
        $seq = (int)$r['id']; if ($seq < 1 || $seq > POLICY_RULE_SEQ_MAX) continue;
        $name = (string)$r['name'];
        foreach ($days as $d) {
            $n = policy_day_number($d);
            $amount = (int)$r['amount'];
            /* A rule of no particular kind is capped here (a kind's own cap is
               the ledger's, fees_post): what this rule's fines this term have
               come to already, from the record, before adding another. */
            if ($amount > 0 && (int)$r['capTerm'] > 0 && (string)$r['reason'] === '') {
                [$tf, $tt] = function_exists('cp_term_bounds') ? cp_term_bounds('') : [gmdate('Y-01-01'), gmdate('Y-12-31')];
                $lo = POLICY_T_RULE_FINE + $seq * 100000; $hi = $lo + 100000;
                $have = db_row("SELECT 1 FROM sanctions WHERE personId = ? AND kind = 'fine' AND tier = ?", [$personId, $lo + $n]);
                if (!$have) {
                    $used = (int)(db_row("SELECT COALESCE(SUM(amount),0) s FROM sanctions WHERE personId = ? AND kind = 'fine' AND tier >= ? AND tier < ? AND status IN ('pending','paid','active')", [$personId, $lo, $hi])['s'] ?? 0);
                    if ($d >= $tf && $d <= $tt) $amount = max(0, min($amount, (int)$r['capTerm'] - $used));
                }
            }
            $when = $name . ' on ' . policy_day_text($d);
            if ($amount > 0 && policy_issue($personId, $type, 'fine', POLICY_T_RULE_FINE + $seq * 100000 + $n, ['amount' => $amount, 'status' => 'pending',
                'reason' => $when . ' — ' . policy_naira($amount) . ' fine.'])) $issued[] = 'fine';
            if ((int)$r['jumps'] > 0 && policy_issue($personId, $type, 'corrective', POLICY_T_RULE_JUMPS + $seq * 100000 + $n, ['amount' => (int)$r['jumps'], 'status' => 'pending',
                'reason' => $when . ' — ' . (int)$r['jumps'] . ' ' . $word . '.'])) $issued[] = 'corrective';
        }
        // Repeats: every Nth breach of this rule in one session escalates.
        $every = (int)$r['escalateAfter']; $to = (string)$r['escalateTo'];
        if ($every < 1 || !in_array($to, ['suspension', 'review'], true)) continue;
        foreach (policy_rule_triggers($personId, $days, $every) as [$nth, $trigger]) {
            $sfx = $seq * 100000 + policy_day_number($trigger);
            if ($to === 'review') {
                if (policy_issue($personId, $type, 'review', POLICY_T_RULE_ESC + $sfx, ['status' => 'proposed',
                    'reason' => $nth . ' breaches of “' . $name . '” this session (the last on ' . policy_day_text($trigger) . ') — for management review.'])) $issued[] = 'review';
                continue;
            }
            $from = gmdate('Y-m-d', (int)strtotime($trigger . ' 00:00:00 UTC') + 86400);
            $till = gmdate('Y-m-d', (int)strtotime($from . ' 00:00:00 UTC') + (max(1, (int)$r['suspendDays']) - 1) * 86400);
            $fee = (int)$r['reentryFee'];
            if (policy_issue($personId, $type, 'suspension', POLICY_T_RULE_ESC + $sfx, ['status' => $grave, 'startsAt' => $from, 'endsAt' => $till,
                'reason' => $nth . ' breaches of “' . $name . '” this session (the last on ' . policy_day_text($trigger) . ') — suspended ' . policy_day_text($from) . ' to ' . policy_day_text($till)
                    . ($fee > 0 ? '; may resume after that on payment of the ' . policy_naira($fee) . ' re-entry fee.' : '.')])) $issued[] = 'suspension';
            if ($fee > 0 && policy_issue($personId, $type, 'fine', POLICY_T_RULE_REENTRY + $sfx, ['amount' => $fee, 'status' => 'pending',
                'reason' => 'Re-entry fee after the suspension from ' . policy_day_text($from) . ' (“' . $name . '”) — ' . policy_naira($fee) . ', paid before resuming.'])) $issued[] = 'fine';
        }
    }
    return $issued;
}
/**
 * The breaches that reached N, 2N, … within their session, as [[nth, day], …]
 * (at most nine escalations a session, as the rulebook's own). nth is the
 * running count in that session, for the wording; the tier is keyed on the day.
 */
function policy_rule_triggers(string $personId, array $days, int $every): array {
    $bySession = [];
    foreach ($days as $d) { [$a] = policy_session_bounds($personId, $d); $bySession[$a][] = $d; }
    $out = [];
    foreach ($bySession as $ds) {
        sort($ds);
        for ($j = 1; $j * $every <= count($ds) && $j <= 9; $j++) $out[] = [$j * $every, $ds[$j * $every - 1]];
    }
    return $out;
}

/**
 * The rulebook in sentences a family reads — from the settings, so a screen
 * cannot promise a time or an amount the engine does not use. [[icon, text]].
 */
function policy_member_rule_lines(): array {
    $c = policy_for('member'); $w = (string)$c['jumpWord']; $bands = policy_late_bands($c);
    $out = [['ph ph-clock', 'Activities begin at ' . $c['resumption'] . '. Arriving at or after ' . $bands[0]['from'] . ' is recorded as late.']];
    foreach ($bands as $b) $out[] = ['ph ph-timer', $b['from'] . ($b['to'] !== '' ? ' to before ' . $b['to'] : ' or later') . ': ' . (policy_penalty_text($b['fine'], $b['jumps'], $w) ?: 'recorded') . '.'];
    if ((string)$c['reviewFrom'] !== '') $out[] = ['ph ph-gavel', 'At or after ' . $c['reviewFrom'] . ': management review and appropriate disciplinary action.'];
    $out[] = ['ph ph-calendar-x', 'An absence without permission: ' . (policy_penalty_text((int)($c['absenceFine'] ?? 0), (int)$c['absenceJumps'], $w) ?: 'recorded') . '. '
        . (int)$c['suspendAfterAbsences'] . ' in a session is a ' . (int)$c['suspendDays'] . '-day suspension' . ((int)$c['reentryFee'] > 0 ? ', and ' . policy_naira((int)$c['reentryFee']) . ' to come back' : '') . '.'];
    if ((int)$c['evidenceFine'] > 0) $out[] = ['ph ph-camera', 'Upload a photo or screenshot of each assignment to the dashboard by its due day, or it is a ' . policy_naira((int)$c['evidenceFine']) . ' fine.'];
    // The written rules, from the same rows the desk records breaches against.
    foreach (policy_rules_index()['byId'] as $r) if ((int)$r['active'] && ($line = policy_rule_sentence($r, $w)) !== '') $out[] = ['ph ph-list-checks', $line];
    return $out;
}
/** One written rule as a family reads it: what, what it costs, what repeats lead to. '' for a rule that costs nothing. */
function policy_rule_sentence(array $r, string $word = 'frog jumps'): string {
    $cost = policy_penalty_text((int)$r['amount'], (int)($r['jumps'] ?? 0), $word);
    $every = (int)($r['escalateAfter'] ?? 0); $to = (string)($r['escalateTo'] ?? '');
    $rep = $every > 0 && $to === 'suspension' ? $every . ' in a session is a ' . max(1, (int)($r['suspendDays'] ?? 7)) . '-day suspension'
        . ((int)($r['reentryFee'] ?? 0) > 0 ? ', and ' . policy_naira((int)$r['reentryFee']) . ' to come back' : '')
        : ($every > 0 && $to === 'review' ? $every . ' in a session goes to management for review' : '');
    if ($cost === '' && $rep === '') return '';
    $when = trim((string)($r['whenText'] ?? ''));
    return rtrim((string)$r['name'], '.') . ($when !== '' ? ' (' . rtrim($when, '.') . ')' : '') . ': ' . ($cost !== '' ? $cost : 'recorded') . ($rep !== '' ? '. ' . $rep : '') . '.';
}

/** A session suspension's re-entry fee still owed: the fine row, or null. */
function policy_reentry_owed(array $sanctions, array $suspension): ?array {
    $t = (int)$suspension['tier'];
    // A written rule's suspension has its fee at the same suffix in the rule re-entry range.
    $feeTier = $t >= POLICY_T_RULE_ESC && $t < POLICY_T_RULE_REENTRY ? $t - POLICY_T_RULE_ESC + POLICY_T_RULE_REENTRY
             : ($t >= POLICY_T_SUSPENSION && $t < POLICY_T_REENTRY ? $t - POLICY_T_SUSPENSION + POLICY_T_REENTRY : 0);
    if (!$feeTier) return null;
    foreach ($sanctions as $f) if ((string)$f['kind'] === 'fine' && (int)$f['tier'] === $feeTier && (string)$f['status'] === 'pending') return $f;
    return null;
}

/**
 * A payment, a waiver or a refund landed: the account decides which policy
 * fines are settled. Every member fine is a charge on the fee ledger, and
 * payments go to the oldest charges first — the way every money screen reads
 * the account. A fine the account now covers is marked paid (which is what
 * lets a child back in after a suspension's re-entry fee); one this sync had
 * marked paid that the account no longer covers (a payment voided) is owed
 * again. Only the RE-ENTRY fee used to be read this way, so a family who paid
 * a late or absence fine online saw ₦0 on their account while the conduct
 * board went on saying "Fines owed" and freezing awards — two ledgers
 * disagreeing about the same money. A fine settled by hand (clearedBy is a
 * person) is that person's decision and is left alone.
 */
function policy_fines_sync(string $memberId): int {
    $due = db_all("SELECT id, status, clearedBy FROM sanctions WHERE personId = ? AND kind = 'fine' AND (status = 'pending' OR (status = 'paid' AND clearedBy = 'ledger'))", [$memberId]);
    if (!$due || !function_exists('fees_entry_left')) return 0;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]); if (!$m) return 0;
    $n = 0;
    foreach ($due as $f) {
        $left = fees_entry_left($m, 'sanction-' . (int)$f['id']);
        if ($left === null) continue;   // not on the ledger: nothing to read it by
        if ((string)$f['status'] === 'pending' && $left === 0) { db_update('sanctions', ['status' => 'paid', 'clearedAt' => now_iso(), 'clearedBy' => 'ledger'], ['id' => (int)$f['id']]); $n++; }
        elseif ((string)$f['status'] === 'paid' && $left > 0) { db_update('sanctions', ['status' => 'pending', 'clearedAt' => '', 'clearedBy' => ''], ['id' => (int)$f['id']]); $n++; }
    }
    return $n;
}
/** The older name, kept for any caller still using it. */
function policy_reentry_sync(string $memberId): int { return policy_fines_sync($memberId); }

// ── Check-in enforcement ────────────────────────────────────────────────────

/**
 * May this person check in right now? Called before the attendance row is
 * written, so a blocked scan leaves no trace of presence.
 * Returns ['ok'=>true] or ['ok'=>false,'error'=>…,'state'=>…].
 */
function policy_gate_checkin(string $personId, string $type): array {
    if (!policy_enabled_for($type)) return ['ok' => true];
    $st = policy_state($personId, $type);
    if ($st['state'] === 'evicted') {
        return ['ok' => false, 'error' => 'policy_evicted', 'state' => $st,
                'message' => 'Evicted from the programme. Reinstatement requires the full cool-off period, CIMC 1 and the clearing fine.'];
    }
    if ($st['state'] === 'suspended') {
        if (!empty($st['reentryOwed']) && $st['until'] === '') {
            return ['ok' => false, 'error' => 'policy_reentry_fee', 'state' => $st,
                    'message' => 'Suspension served — the ' . policy_naira((int)$st['reentryOwed']) . ' re-entry fee must be paid before they can return.'];
        }
        return ['ok' => false, 'error' => 'policy_suspended', 'state' => $st,
                'message' => 'Suspended' . ($st['until'] ? ' until ' . substr($st['until'], 0, 10) : '') . ' — barred from the premises and digital channels.'
                    . (!empty($st['reentryOwed']) ? ' The ' . policy_naira((int)$st['reentryOwed']) . ' re-entry fee is due before returning.' : '')];
    }
    return ['ok' => true, 'state' => $st];
}

/**
 * Punctuality for a check-in happening now, as the two-threshold model:
 *
 *   present  before resumption + grace
 *   tardy    after resumption, before the redline — recorded, not an infraction
 *   late     at or after the redline (§ Part VI) — an infraction
 *
 * `halfDay` is set when the scan missed the compulsory Musing Period.
 */
function policy_punctuality(string $type, ?int $at = null): array {
    $soft = attendance_punctuality($type, $at);     // resumption + grace
    $pol = policy_settings();
    $out = ['status' => $soft['status'], 'lateMinutes' => (int)$soft['lateMinutes'], 'redline' => 0, 'halfDay' => 0];
    if (!policy_enabled_for($type)) return $out;
    $cfg = policy_for($type);
    $now = attendance_minutes_at($at);
    if (policy_is_session($type)) {
        /* The rulebook: late from the first band's time; between resumption
           and that, tardy — seen, and costs nothing. */
        $first = policy_late_bands($cfg)[0]['min'];
        if ($now >= $first) { $out['status'] = 'late'; $out['redline'] = 1; $out['lateMinutes'] = $now - policy_minutes((string)$cfg['resumption']); }
        elseif ($now > policy_minutes((string)$cfg['resumption'])) { $out['status'] = 'tardy'; $out['lateMinutes'] = $now - policy_minutes((string)$cfg['resumption']); }
        else { $out['status'] = 'present'; $out['lateMinutes'] = 0; }
        // No Musing Period in the rulebook: with a 09:00 start it would make every member's day a half-day.
        $out['minute'] = $now;
        return $out;
    }
    if ($now >= policy_minutes((string)$cfg['lateRedline'])) {
        $out['status'] = 'late'; $out['redline'] = 1;
    } elseif ($out['status'] === 'late' && $type === 'member' && !empty($cfg['tardyIsLate'])) {
        // NGG has no grey band: past resumption + grace is late, and it counts.
        $out['redline'] = 1;
    } elseif ($out['status'] === 'late') {
        // Past resumption but inside the redline: tardy, not an infraction.
        $out['status'] = 'tardy';
    }
    if (!empty($pol['musing']['enabled']) && $now > policy_minutes((string)$pol['musing']['endsAt'])) {
        $out['halfDay'] = 1;
    }
    return $out;
}

/** Record the infractions a completed check-in earned, then re-evaluate. */
function policy_on_checkin(string $personId, string $type, string $date, array $punc): array {
    if (!policy_enabled_for($type)) return [];
    if (!policy_is_day($date, $type)) return [];    // a scan on a closed day is not late
    if (!empty($punc['redline']) && policy_is_session($type) && isset($punc['minute'])) {
        $b = policy_band_for(policy_for($type), (int)$punc['minute']);
        $at = sprintf('%02d:%02d', intdiv((int)$punc['minute'], 60), (int)$punc['minute'] % 60);
        $cfg = policy_for($type);
        policy_log($personId, $type, 'late', $date, 'Arrived ' . $at . ' — ' . ($b['review'] ? 'at or after ' . $b['from'] . ': management review.'
            : 'late (' . $b['from'] . ($b['to'] !== '' ? '–' . $b['to'] : ' on') . '): ' . (policy_penalty_text($b['fine'], $b['jumps'], (string)$cfg['jumpWord']) ?: 'recorded') . '.'));
    }
    elseif (!empty($punc['redline'])) policy_log($personId, $type, 'late', $date, 'Scanned at or after the lateness redline.');
    elseif (($punc['status'] ?? '') === 'tardy') policy_log($personId, $type, 'tardy', $date, 'Scanned after resumption, inside the redline.');
    if (!empty($punc['halfDay'])) policy_log($personId, $type, 'halfday', $date, 'Missed the compulsory Musing Period — half-day.');
    return policy_apply($personId, $type);
}

// ── Nightly sweep: absences for closed programme days ───────────────────────

/**
 * For every programme day that has finished and not yet been swept, log an
 * absence against each active person with no check-in — and, when check-out is
 * required, against each person who scanned in but never scanned out (§1.3:
 * "If you fail to scan, the AI logs a total absence for that day").
 *
 * Only days strictly before today are swept, so an in-progress day is never
 * marked absent. The last swept date is stored so a re-run is cheap and a
 * gap (host down for a week) is caught up rather than skipped.
 */
function policy_sweep_absences(?string $upto = null): array {
    policy_nosignout_to_halfday();
    policy_prelate_repair();
    $pol = policy_settings();
    if (empty($pol['enabled'])) return ['ok' => true, 'skipped' => 'policy_disabled'];
    $cfg = programme_settings();
    if (empty($cfg['enabled'])) return ['ok' => true, 'skipped' => 'no_programme_calendar'];

    $today = attendance_today();
    $end = $upto ?? gmdate('Y-m-d', (int)strtotime($today . ' 00:00:00 UTC') - 86400);
    $last = (string)(setting_raw('policy_swept_through') ?? '');
    /* The first sweep starts from yesterday, not the start of term: switching
       enforcement on mid-season must not log an absence for every past day
       before anybody was being counted. */
    $start = $last !== ''
        ? gmdate('Y-m-d', (int)strtotime($last . ' 00:00:00 UTC') + 86400)
        : max((string)$cfg['startDate'], $end);
    if ($start === '' || $start > $end) return ['ok' => true, 'days' => 0, 'absences' => 0, 'swept' => $last];

    // Catch up at most a fortnight per run so a long outage cannot turn one
    // cron tick into a multi-thousand-row write. A day is swept when it is a
    // programme day for anybody — a group meeting on its own weekdays counts.
    $groupDays = participant_group_days_map();
    $anyDays = array_values(array_unique(array_merge([], ...array_map(static fn($d) => $d, array_values($groupDays)))));
    $wide = $cfg; $wide['weekdays'] = array_values(array_unique(array_merge((array)$cfg['weekdays'], $anyDays)));
    $days = array_slice(programme_days_between($start, $end, $wide), 0, 14);
    if (!$days) { setting_set('policy_swept_through', $end, 'system'); return ['ok' => true, 'days' => 0, 'absences' => 0, 'swept' => $end]; }

    $students = db_all("SELECT studentId, COALESCE(centre,'') centre FROM summer_students WHERE status = 'active'");
    $vols = db_all("SELECT volunteerId, COALESCE(centre,'') centre FROM volunteers WHERE status = 'active'");
    $absences = 0; $noCheckout = 0; $heldDays = 0;
    foreach ($days as $d) {
        $present = [];
        foreach (db_all("SELECT studentId, checkOutAt FROM attendance WHERE date = ?", [$d]) as $r) {
            $present[(string)$r['studentId']] = (string)($r['checkOutAt'] ?? '');
        }
        foreach ([['student', $students, 'studentId'], ['volunteer', $vols, 'volunteerId']] as [$type, $rows, $key]) {
            // Who was expected, by centre — and which centres the brake holds (policy_outage_hold).
            $due = [];
            foreach ($rows as $row) {
                $id = (string)$row[$key];
                if (programme_is_day($d, $type === 'student' ? participant_calendar_for($id, $cfg, $groupDays) : $cfg)) $due[(string)$row['centre']][] = $id;
            }
            $held = policy_outage_hold($d, $type, $due, $present);
            $outHeld = !empty($pol['checkoutRequired']) ? policy_checkout_hold($d, $type, $due, $present, $held) : [];
            $heldDays += count($held) + count($outHeld);
            foreach ($rows as $row) {
                $id = (string)$row[$key];
                // Their own calendar: a participant's group may meet on other days.
                if (!programme_is_day($d, $type === 'student' ? participant_calendar_for($id, $cfg, $groupDays) : $cfg)) continue;
                if (isset($held[(string)$row['centre']])) continue;
                if (!array_key_exists($id, $present)) {
                    if (policy_log($id, $type, 'absence', $d, 'No check-in scan on a programme day.')) $absences++;
                } elseif (!empty($pol['checkoutRequired']) && $present[$id] === '' && !isset($outHeld[(string)$row['centre']])) {
                    // Scanned in, never scanned out. Logged as its own fact so
                    // the ledger says what actually happened, and as a half-day:
                    // they came, so it is not an absence (two make one).
                    policy_log($id, $type, 'no_checkout', $d, 'Checked in but never scanned out.');
                    policy_log($id, $type, 'halfday', $d, POLICY_NOSIGNOUT_NOTE);
                    $noCheckout++;
                }
            }
        }
        setting_set('policy_swept_through', $d, 'system');
    }
    // Re-evaluate only the people whose ledger actually moved.
    $touched = db_all("SELECT DISTINCT personId, personType FROM infractions WHERE date >= ? AND date <= ?", [$days[0], $days[count($days) - 1]]);
    foreach ($touched as $t) policy_apply((string)$t['personId'], (string)$t['personType']);

    return ['ok' => true, 'days' => count($days), 'absences' => $absences, 'noCheckout' => $noCheckout, 'held' => $heldDays, 'swept' => $days[count($days) - 1], 'evaluated' => count($touched)];
}

/**
 * The member-side twin of policy_sweep_absences(): logs an absence against each
 * active NGG member with no check-in on a member programme day, then re-derives
 * their sanctions. Runs only when member enforcement AND the member calendar
 * are on, on its own cursor (policy_member_swept_through) so it never collides
 * with the summer sweep.
 *
 * Members sign out at the desk, the kiosk or the CACENTRE gate, and with
 * `member.checkoutRequired` a day with no sign-out is incomplete: logged as
 * no_checkout and counted as an absence, as §1.3 does for Summer School —
 * from the day the rule first applied (`policy_member_checkout_since`).
 */
function policy_sweep_member_absences(?string $upto = null): array {
    policy_nosignout_to_halfday();
    policy_prelate_repair();
    if (!policy_enabled_for('member')) return ['ok' => true, 'skipped' => 'member_policy_disabled'];
    $cal = member_programme_settings();
    if (empty($cal['enabled'])) return ['ok' => true, 'skipped' => 'no_member_calendar'];

    $today = attendance_today();
    $end = $upto ?? gmdate('Y-m-d', (int)strtotime($today . ' 00:00:00 UTC') - 86400);
    $last = (string)(setting_raw('policy_member_swept_through') ?? '');
    // First sweep: from yesterday, never back to the start of term (see above).
    $start = $last !== ''
        ? gmdate('Y-m-d', (int)strtotime($last . ' 00:00:00 UTC') + 86400)
        : max((string)$cal['startDate'], $end);
    if ($start === '' || $start > $end) return ['ok' => true, 'days' => 0, 'absences' => 0, 'swept' => $last, 'evidenceFines' => policy_evidence_fines_run()['fined']];

    // A day is swept when any centre meets on it; each member is then judged
    // on their own centre's days.
    $centreDays = centre_meet_days_map();
    $wide = $cal; $wide['weekdays'] = array_values(array_unique(array_merge((array)$cal['weekdays'], ...array_values($centreDays ?: [[]]))));
    $days = array_slice(programme_days_between($start, $end, $wide), 0, 14);
    if (!$days) { setting_set('policy_member_swept_through', $end, 'system'); return ['ok' => true, 'days' => 0, 'absences' => 0, 'swept' => $end]; }

    $members = db_all("SELECT memberId, centre FROM members WHERE type = 'NGG' AND status = 'active'");
    $absences = 0; $heldDays = 0;
    /* A sign-out is required of members only from the day the rule first
       applied: before it, nobody could sign out at all, and counting those
       days would turn every past attendance into an absence. */
    $mcfg = policy_for('member');
    $since = '';
    if (!empty($mcfg['checkoutRequired'])) {
        $since = (string)(setting_raw('policy_member_checkout_since') ?? '');
        if ($since === '') { $since = $today; setting_set('policy_member_checkout_since', $since, 'system'); }
    }
    foreach ($days as $d) {
        $present = [];
        foreach (db_all("SELECT studentId, checkOutAt FROM attendance WHERE date = ?", [$d]) as $r) {
            $present[(string)$r['studentId']] = (string)($r['checkOutAt'] ?? '');   // members share the attendance table, keyed by memberId in studentId
        }
        $due = [];
        foreach ($members as $row) {
            if (!programme_is_day($d, member_calendar_for($row, $cal, $centreDays))) continue;
            if (function_exists('member_absence_cover') && member_absence_cover((string)$row['memberId'], $d) === 'academic') continue;
            $due[(string)($row['centre'] ?? '')][] = (string)$row['memberId'];
        }
        $held = policy_outage_hold($d, 'member', $due, $present);
        $outHeld = $since !== '' && $d >= $since ? policy_checkout_hold($d, 'member', $due, $present, $held) : [];
        $heldDays += count($held) + count($outHeld);
        foreach ($members as $row) {
            $id = (string)$row['memberId'];
            if (!programme_is_day($d, member_calendar_for($row, $cal, $centreDays))) continue;   // not their centre's day
            if (isset($held[(string)($row['centre'] ?? '')])) continue;                           // the feed failed there, not the members
            // Approved academic leave: the day is not theirs to attend, so it is not an absence.
            if (function_exists('member_absence_cover') && member_absence_cover($id, $d) === 'academic') continue;
            if (!array_key_exists($id, $present)) {
                if (policy_log($id, 'member', 'absence', $d, 'No check-in on a member programme day.')) $absences++;
            } elseif ($since !== '' && $d >= $since && $present[$id] === '' && !isset($outHeld[(string)($row['centre'] ?? '')])) {
                // Signed in, never signed out — left before closing time, or
                // walked past the desk. The day was not completed.
                policy_log($id, 'member', 'no_checkout', $d, 'Signed in but never signed out.');
                policy_log($id, 'member', 'halfday', $d, POLICY_NOSIGNOUT_NOTE);
            }
        }
        setting_set('policy_member_swept_through', $d, 'system');
    }
    $touched = db_all("SELECT DISTINCT personId FROM infractions WHERE personType = 'member' AND date >= ? AND date <= ?", [$days[0], $days[count($days) - 1]]);
    foreach ($touched as $t) policy_apply((string)$t['personId'], 'member');

    $ev = policy_evidence_fines_run();
    return ['ok' => true, 'days' => count($days), 'absences' => $absences, 'held' => $heldDays, 'swept' => $days[count($days) - 1], 'evaluated' => count($touched), 'evidenceFines' => $ev['fined'] ?? 0];
}

/**
 * The rulebook's assignment rule: work is shown by uploading evidence to the
 * dashboard, and a member with nothing handed in once the due day has passed
 * owes `evidenceFine`. Once per member per assignment (the period key), and
 * only for assignments due on or after the day this rule first ran — a rule
 * that arrives today does not fine last month's homework.
 */
const POLICY_EVIDENCE_BATCH = 60;   // assignments looked at per run
function policy_evidence_fines_run(?string $today = null): array {
    $out = ['assignments' => 0, 'fined' => 0];
    if (!policy_is_session('member') || !policy_enabled_for('member') || !function_exists('assignment_audience') || !function_exists('fees_post')) return $out;
    $amount = (int)policy_for('member')['evidenceFine'];
    if ($amount <= 0) return $out;
    $today = $today ?? attendance_today();
    $since = (string)(setting_raw('policy_evidence_since') ?? '');
    if ($since === '') { $since = $today; setting_set('policy_evidence_since', $since, 'system'); }
    foreach (db_all("SELECT * FROM assignments WHERE status IN ('published','closed') AND COALESCE(dueAt,'') <> '' ORDER BY dueAt DESC LIMIT 400") as $a) {
        $dueTs = assignment_due_ts($a); if (!$dueTs) continue;
        $dueDay = attendance_today($dueTs);
        if ($dueDay < $since || $dueDay >= $today) continue;
        if (++$out['assignments'] > POLICY_EVIDENCE_BATCH) break;
        $handed = [];
        foreach (db_all("SELECT memberId FROM assignment_submissions WHERE assignmentId = ? AND (COALESCE(answerText,'') <> '' OR COALESCE(fileUrl,'') <> '' OR COALESCE(filesJson,'') NOT IN ('', '[]')
                         OR COALESCE(linkUrl,'') <> '' OR COALESCE(stepsJson,'') NOT IN ('', '[]'))", [(string)$a['assignmentId']]) as $r) $handed[(string)$r['memberId']] = true;
        $key = 'asg-evidence:' . (string)$a['assignmentId'];
        $owed = array_values(array_filter(assignment_audience($a), static fn($m) => strtoupper((string)($m['type'] ?? 'NGG')) === 'NGG' && !isset($handed[(string)$m['memberId']])));
        if (!$owed) continue;
        $fined = array_flip(array_column(db_all("SELECT memberId FROM member_ledger WHERE kind = 'fine' AND periodKey = ?", [$key]), 'memberId'));
        foreach ($owed as $m) {
            if (isset($fined[(string)$m['memberId']])) continue;
            if (fees_post((string)$m['memberId'], 'fine', $amount, ['periodKey' => $key, 'method' => 'evidence', 'rule' => 'evidence', 'by' => 'policy',
                'note' => 'No evidence uploaded for “' . mb_substr((string)$a['title'], 0, 100) . '” by ' . policy_day_text($dueDay) . ' — ' . policy_naira($amount) . ' fine.'])) $out['fined']++;
        }
    }
    return $out;
}

// ── Admin endpoints ─────────────────────────────────────────────────────────

/** Everything the Policy screen needs in one round trip. */
function admin_policy_settings(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $cfg = programme_settings();
    $mcfg = member_programme_settings();
    $today = attendance_today();
    $elapsed = programme_days_elapsed($today, $cfg);
    $calFor = function (array $c, string $cursorKey) use ($today) {
        /* An OFF calendar answers "yes" for every date (programme_is_day), so
           previewing it listed fourteen days in a row, Sundays included. Off
           means no preview, not a calendar of every day. */
        if (empty($c['enabled'])) return ['today' => $today, 'enabled' => false, 'isProgrammeDay' => null, 'nextDay' => '', 'elapsed' => 0, 'total' => 0,
            'sweptThrough' => (string)(setting_raw($cursorKey) ?? ''), 'upcoming' => [], 'term' => ['', '']];
        [$ts, $te] = programme_term_bounds($today, $c);
        return [
            'today' => $today, 'enabled' => true, 'term' => [$ts, $te], 'derivedFrom' => (string)($c['derivedFrom'] ?? ''),
            'isProgrammeDay' => programme_is_day($today, $c),
            'nextDay' => programme_next_day($today, $c),
            'elapsed' => count(programme_days_elapsed($today, $c)),
            'total' => count(programme_days_between($ts, $te, $c)),
            'sweptThrough' => (string)(setting_raw($cursorKey) ?? ''),
            'upcoming' => array_slice(programme_days_between($today, gmdate('Y-m-d', (int)strtotime($today . ' 00:00:00 UTC') + 45 * 86400), $c), 0, 14),
        ];
    };
    return ['ok' => true,
        'programme' => $cfg,
        'memberProgramme' => $mcfg,
        'policy' => policy_settings(),
        'attendance' => attendance_settings(),
        'calendar' => $calFor($cfg, 'policy_swept_through'),
        'memberCalendar' => $calFor($mcfg, 'policy_member_swept_through'),
    ];
}

function admin_policy_save(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $out = [];
    if (is_array($p['programme'] ?? null)) $out['programme'] = programme_settings_save($p['programme'], (string)$g['requester']['memberId']);
    if (is_array($p['memberProgramme'] ?? null)) $out['memberProgramme'] = member_programme_settings_save($p['memberProgramme'], (string)$g['requester']['memberId']);
    if (is_array($p['policy'] ?? null))    $out['policy'] = policy_settings_save($p['policy'], (string)$g['requester']['memberId']);
    audit('policy.settings.set', (string)$g['requester']['memberId'], '', ['keys' => array_keys($out)], (string)($p['ip'] ?? ''));
    return ['ok' => true] + $out + ['calendar' => admin_policy_settings($p)['calendar'] ?? []];
}

/** Flip a single date between "runs" and "doesn't run" — the fast path for a
 *  coordinator cancelling tomorrow, without editing the whole calendar. */
function admin_policy_day_toggle(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $date = programme_clean_dates([$p['date'] ?? ''])[0] ?? '';
    if ($date === '') return ['ok' => false, 'error' => 'bad_date'];
    $cfg = programme_settings();
    $runs = programme_is_day($date, $cfg);
    $want = array_key_exists('runs', $p) ? !empty($p['runs']) : !$runs;
    if ($want === $runs) return ['ok' => true, 'date' => $date, 'runs' => $runs, 'unchanged' => true];
    // Clear the date from both lists first, then add it to the one that makes
    // the answer come out right for THIS date's weekday.
    $holidays = array_values(array_diff($cfg['holidays'], [$date]));
    $extras   = array_values(array_diff($cfg['extraDays'], [$date]));
    $dow = (int)date('N', (int)strtotime($date . ' 00:00:00 UTC'));
    $scheduled = in_array($dow, $cfg['weekdays'], true);
    if ($want && !$scheduled) $extras[] = $date;
    if (!$want && $scheduled) $holidays[] = $date;
    // Toggling a day only makes sense with the calendar on, and every other
    // field is carried through unchanged.
    $saved = programme_settings_save(array_merge($cfg, ['enabled' => true, 'holidays' => $holidays, 'extraDays' => $extras]), (string)$g['requester']['memberId']);
    audit('policy.day.toggle', (string)$g['requester']['memberId'], $date, ['runs' => $want], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'date' => $date, 'runs' => $want, 'programme' => $saved];
}

/** One person's full compliance record — state, ledger, sanctions. */
function admin_policy_person(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;   // either desk may open it; the write is re-gated per person below
    $id = trim((string)($p['personId'] ?? ''));
    $pg = policy_subject_gate($g['requester'], $id); if (!$pg['ok']) return $pg;
    $p['personType'] = $pg['type'];   // the record's real type, never the browser's claim
    if ($id === '') return ['ok' => false, 'error' => 'bad_person'];
    $type = policy_person_type($id, (string)($p['personType'] ?? ''));
    return ['ok' => true,
        'personId' => $id, 'personType' => $type,
        'state' => policy_state($id, $type),
        'infractions' => policy_rule_labels(absence_reasons_attach(db_all('SELECT * FROM infractions WHERE personId = ? ORDER BY date DESC, id DESC LIMIT 200', [$id]))),
        'sanctions' => db_all('SELECT * FROM sanctions WHERE personId = ? ORDER BY issuedAt DESC LIMIT 100', [$id]),
    ];
}

/** Log an infraction by hand — the ID-card offences and Review Time misses
 *  that no scanner can see. Auto-kinds (absence/late) stay off this path so
 *  the scan record and the ledger cannot disagree. */
function admin_policy_infraction(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;   // either desk may open it; the write is re-gated per person below
    $id = trim((string)($p['personId'] ?? ''));
    $pg = policy_subject_gate($g['requester'], $id); if (!$pg['ok']) return $pg;
    $p['personType'] = $pg['type'];   // the record's real type, never the browser's claim
    $kind = trim((string)($p['kind'] ?? ''));
    $manual = ['idcard_missing', 'idcard_lost', 'review_missed', 'misconduct'];
    if ($id === '' || !in_array($kind, $manual, true)) return ['ok' => false, 'error' => 'bad_infraction'];
    $type = policy_person_type($id, (string)($p['personType'] ?? ''));
    $date = programme_clean_dates([$p['date'] ?? ''])[0] ?? attendance_today();
    $logged = policy_log($id, $type, $kind, $date, (string)($p['note'] ?? ''), (string)$g['requester']['memberId']);
    $issued = policy_apply($id, $type);
    audit('policy.infraction', (string)$g['requester']['memberId'], $id, ['kind' => $kind, 'date' => $date, 'logged' => $logged], (string)($p['ip'] ?? ''));
    // §2.2 — a first ID-card oversight buys a temporary card, not a fine.
    $counts = policy_counts($id);
    $temporaryCard = $kind === 'idcard_missing' && (int)$counts['idcard_missing'] === 1;
    return ['ok' => true, 'logged' => $logged, 'alreadyLogged' => !$logged, 'issued' => $issued,
            'temporaryCard' => $temporaryCard, 'state' => policy_state($id, $type)];
}

/** A written rule's breach named by its rule ("Broke a rule: No uniform"), so the record does not read "rule:RULE-3F2A". */
function policy_rule_labels(array $rows): array {
    $R = policy_rules_index()['byId'];
    foreach ($rows as &$i) if (str_starts_with((string)$i['kind'], 'rule:')) {
        $r = $R[substr((string)$i['kind'], 5)] ?? null;
        $i['label'] = 'Broke a rule: ' . ($r ? (string)$r['name'] : 'a rule since removed');
    }
    unset($i);
    return $rows;
}

const POLICY_BREACH_MAX = 100;   // members one "Record a breach" may name — named in the refusal

/**
 * admin.policy.ruleBreach — {ruleId, personIds[], date?, note?}: a written
 * rule broken, recorded for one member or several (a group in the same
 * incident). The whole request is checked before anything is written; each
 * member is answered on their own (recorded, already recorded that day, out of
 * scope, not a member); one audit event for the run. What the breach costs is
 * the engine's (policy_apply_rules), so this records a fact, never a penalty.
 */
function admin_policy_rule_breach(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $rid = trim((string)($p['ruleId'] ?? ''));
    $r = $rid !== '' ? (policy_rules_index(true) ?: policy_rules_index())['byId'][$rid] ?? null : null;
    if (!$r) return ['ok' => false, 'error' => 'no_rule', 'detail' => 'Choose the rule that was broken.'];
    if (!(int)$r['active']) return ['ok' => false, 'error' => 'rule_off', 'detail' => 'That rule is switched off. Switch it on first, or choose another.'];
    if ((int)$r['id'] > POLICY_RULE_SEQ_MAX) return ['ok' => false, 'error' => 'rule_unusable'];
    $ids = array_values(array_unique(array_filter(array_map(static fn($x) => trim((string)$x), (array)($p['personIds'] ?? (isset($p['personId']) ? [$p['personId']] : []))))));
    if (!$ids) return ['ok' => false, 'error' => 'nobody', 'detail' => 'Choose who broke the rule.'];
    if (count($ids) > POLICY_BREACH_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => POLICY_BREACH_MAX, 'detail' => 'At most ' . POLICY_BREACH_MAX . ' members at a time.'];
    $today = attendance_today();
    $date = trim((string)($p['date'] ?? '')) ?: $today;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date > $today || $date < gmdate('Y-m-d', strtotime($today . ' -90 days'))) return ['ok' => false, 'error' => 'bad_date', 'detail' => 'The date must be today or within the last 90 days.'];
    $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 200));
    $kind = policy_rule_kind($rid);
    $results = []; $recorded = 0;
    foreach ($ids as $id) {
        $m = db_row('SELECT memberId, role, status, centre FROM members WHERE memberId = ? LIMIT 1', [$id]);
        if (!$m || (string)$m['status'] !== 'active') { $results[] = ['personId' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (is_admin_role((string)$m['role'])) { $results[] = ['personId' => $id, 'ok' => false, 'error' => 'staff_account']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) { $results[] = ['personId' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        if ($id === $by) { $results[] = ['personId' => $id, 'ok' => false, 'error' => 'own_account']; continue; }
        $logged = policy_log($id, 'member', $kind, $date, $note !== '' ? $note : (string)$r['name'], $by);
        if (!$logged) { $results[] = ['personId' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        $issued = policy_apply($id, 'member');
        $results[] = ['personId' => $id, 'ok' => true, 'issued' => $issued]; $recorded++;
    }
    audit('policy.rule.breach', $by, $rid, ['rule' => (string)$r['name'], 'date' => $date, 'asked' => count($ids), 'recorded' => $recorded,
        'refused' => count(array_filter($results, static fn($x) => empty($x['ok'])))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'recorded' => $recorded, 'results' => $results, 'rule' => (string)$r['name']];
}

/**
 * admin.policy.rules — every rule in one place, for the Rules page: the
 * rulebook's own (applied automatically from check-ins and assignments) and
 * the written ones (recorded by staff), each with what triggers it, what it
 * costs, what repeats lead to, and who may change it. A READ, so any of the
 * desks that live with the rules may open it; each write is gated on its own.
 */
function admin_policy_rules(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'fees', 'summer']); if (!$g['ok']) return $g;
    $caps = member_effective_caps($g['requester']);
    $c = policy_for('member');
    $written = function_exists('fees_fine_rules_data') ? fees_fine_rules_data() : ['rules' => [], 'kinds' => []];
    return ['ok' => true, 'enabled' => policy_enabled_for('member'), 'rulebook' => $c, 'bands' => policy_late_bands($c),
        'lines' => policy_member_rule_lines(), 'written' => $written['rules'] ?? [], 'kinds' => $written['kinds'] ?? [],
        'term' => $written['term'] ?? null, 'amountMax' => $written['amountMax'] ?? 0,
        'can' => ['rules' => in_array('fees', $caps, true), 'rulebook' => in_array('people', $caps, true), 'breach' => in_array('people', $caps, true)],
        'breachMax' => POLICY_BREACH_MAX];
}

/**
 * admin.policy.rulebookSave — {member: {...}}: the NGG member rulebook from the
 * Rules page. The rulebook governs MEMBERS, so it is the people desk's to
 * change (ownership follows the data); the full policy settings — Summer
 * School's calendars and thresholds — stay behind `summer` (admin.policy.save).
 * Only the member block is read; everything else keeps its current value.
 */
function admin_policy_rulebook_save(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $m = is_array($p['member'] ?? null) ? $p['member'] : null;
    if (!$m) return ['ok' => false, 'error' => 'nothing_sent'];
    $keep = array_flip(['resumption', 'lateBands', 'reviewFrom', 'absenceFine', 'absenceJumps', 'suspendAfterAbsences', 'suspendDays', 'reentryFee',
                        'permittedAbsences', 'formalAfterDays', 'evidenceFine', 'jumpWord']);
    $before = policy_for('member');
    $clean = policy_settings_save(['member' => array_intersect_key($m, $keep)], (string)$g['requester']['memberId']);
    $after = $clean['member'];
    $changed = array_values(array_filter(array_keys($keep), static fn($k) => json_encode($before[$k] ?? null) !== json_encode($after[$k] ?? null)));
    audit('policy.rulebook.set', (string)$g['requester']['memberId'], '', ['changed' => $changed], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'member' => $after, 'changed' => $changed, 'unchanged' => !$changed];
}

/** Void a wrongly logged fact. Everything it caused is re-derived, so a bad
 *  absence that triggered dormancy stops causing dormancy the moment it goes. */
function admin_policy_void(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;   // either desk may open it; the write is re-gated per person below
    $iid = (int)($p['infractionId'] ?? 0);
    $reason = trim((string)($p['reason'] ?? ''));
    if (!$iid || $reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $row = db_row('SELECT * FROM infractions WHERE id = ?', [$iid]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $pg = policy_subject_gate($g['requester'], (string)$row['personId']); if (!$pg['ok']) return $pg;
    db_update('infractions', ['voidedAt' => now_iso(), 'voidedBy' => (string)$g['requester']['memberId'], 'voidReason' => substr($reason, 0, 240)], ['id' => $iid]);
    // Sanctions are keyed on the count that triggered them, so any sanction at
    // a tier the ledger no longer reaches is lifted. Rows are kept, not
    // deleted: the record must show it happened and was reversed.
    $id = (string)$row['personId']; $type = (string)$row['personType'];
    policy_relift($id, $type);
    audit('policy.void', (string)$g['requester']['memberId'], $id, ['infractionId' => $iid, 'kind' => $row['kind'], 'reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'state' => policy_state($id, $type)];
}

/** Lift automatic sanctions whose triggering count no longer holds. Manual
 *  sanctions (issuedBy != 'system') are left alone — a human decision needs a
 *  human to reverse it. */
function policy_relift(string $personId, string $type, bool $keepPaid = false): int {
    $cfg = policy_for($type);
    $counts = policy_counts($personId);
    $lifted = 0;
    /* Absence-day fines (tier 500000 + the day) are issued `pending` and may
       have been paid, so they are read in those states too — they used to be
       skipped, and voiding a wrong absence left its ₦1,000 on the account. */
    foreach (db_all("SELECT * FROM sanctions WHERE personId = ? AND issuedBy = 'system'
                     AND (status IN ('active','proposed') OR (kind = 'fine' AND tier >= 500000 AND status IN ('pending','paid')) OR (kind = 'corrective' AND status = 'pending'))", [$personId]) as $s) {
        $tier = (int)$s['tier'];
        $kind = (string)$s['kind'];
        $holds = true;
        /* A fresh start revokes what is still owed, never what was paid:
           revoking a penalty is not a refund. A correction (a wrong entry
           voided) does turn a paid fine into credit — that is $keepPaid off. */
        if ($keepPaid && (string)$s['status'] === 'paid') continue;
        /* The rulebook's own (policy_apply_session). Each holds exactly while
           what issued it still stands; a lifted fine stops being owed. */
        $rb = policy_rulebook_holds($personId, $kind, $tier, $cfg);
        if ($rb !== null) {
            if (!$rb) {
                db_update('sanctions', ['status' => 'lifted', 'clearedAt' => now_iso(), 'clearedBy' => 'system'], ['id' => (int)$s['id']]);
                if ($kind === 'fine') policy_fine_void_ledger($personId, (int)$s['id'], 'The record it was for was corrected — this no longer applies');
                $lifted++;
            }
            continue;
        }
        if ($kind === 'fine' && $tier >= 500000 && $tier < POLICY_T_LATE_FINE) {
            /* One absent day's fine. It holds while that day is still a live
               absence nobody excused — exactly the rule policy_apply issued it
               by. It used to fall into the lost-card rule below and read as
               "no longer holds" whatever the day, then be issued again. */
            $day = gmdate('Y-m-d', ($tier - 500000) * 86400);
            $live = (bool)db_row("SELECT 1 FROM infractions WHERE personId = ? AND kind = 'absence' AND date = ? AND (voidedAt IS NULL OR voidedAt = '')", [$personId, $day]);
            $cover = $live && function_exists('member_absence_cover') ? member_absence_cover($personId, $day) : '';
            if (!$live || in_array($cover, ['approved', 'academic'], true)) {
                db_update('sanctions', ['status' => 'lifted', 'clearedAt' => now_iso(), 'clearedBy' => 'system'], ['id' => (int)$s['id']]);
                // Paid or not, the charge stops being owed; a payment already made then stands as credit.
                policy_fine_void_ledger($personId, (int)$s['id'], 'Absence voided — the fine for that day no longer applies');
                $lifted++;
            }
            continue;
        }
        if ((string)$s['status'] === 'pending' || (string)$s['status'] === 'paid') continue;
        if ($kind === 'warning' || $kind === 'dormant') $holds = $tier <= (int)$counts['absenceEquivalent'] || $tier >= 1000;
        elseif ($kind === 'eviction') $holds = (int)$counts['absenceEquivalent'] >= $tier;
        elseif ($kind === 'suspension') $holds = (int)$counts['late'] >= $tier;
        elseif ($kind === 'fine' && $tier < 1000) $holds = (int)$counts['late'] >= $tier;
        if ($kind === 'dormant' && $tier >= 1000) $holds = (int)$counts['review_missed'] >= ($tier - 1000);
        if ($kind === 'fine' && $tier >= 2000 && $tier < 3000) $holds = (int)$counts['idcard_missing'] >= ($tier - 2000);
        if ($kind === 'fine' && $tier >= 3000) $holds = (int)$counts['idcard_lost'] >= ($tier - 3000);
        if (!$holds) {
            db_update('sanctions', ['status' => 'lifted', 'clearedAt' => now_iso(), 'clearedBy' => 'system'], ['id' => (int)$s['id']]);
            /* A lifted fine must stop being money owed. Without this, clearing a
             * wrongly-logged infraction left the charge on the family's account
             * for ever: the disciplinary record said "lifted" while the ledger
             * went on asking for the money. */
            if ($kind === 'fine') policy_fine_void_ledger($personId, (int)$s['id'], 'Sanction lifted — threshold no longer met');
            $lifted++;
        }
    }
    policy_apply($personId, $type);
    return $lifted;
}

/**
 * Does a rulebook sanction still hold? null when the tier is not one of the
 * rulebook's, so the ladder's own reading applies.
 */
function policy_rulebook_holds(string $personId, string $kind, int $tier, array $cfg): ?bool {
    $live = static function (string $k, string $d) use ($personId): bool {
        return (bool)db_row("SELECT 1 FROM infractions WHERE personId = ? AND kind = ? AND date = ? AND (voidedAt IS NULL OR voidedAt = '')", [$personId, $k, $d]);
    };
    $excused = static fn(string $d): bool => function_exists('member_absence_cover') && in_array(member_absence_cover($personId, $d), ['approved', 'academic'], true);
    /* A written rule's (policy_apply_rules) — read first: its tiers sit above
       every rulebook range, and the re-entry check below would claim them. */
    if ($parts = policy_rule_tier_parts($tier)) {
        [$base, $seq, $day] = $parts;
        $r = policy_rules_index()['bySeq'][$seq] ?? null;
        if (!$r) return false;   // the rule is gone: nothing it caused can still be owed
        $kindOf = policy_rule_kind((string)$r['ruleId']);
        if ($base === POLICY_T_RULE_FINE || $base === POLICY_T_RULE_JUMPS) return $live($kindOf, policy_day_of($day));
        if ($base === POLICY_T_RULE_REENTRY) {
            $sus = db_row("SELECT status FROM sanctions WHERE personId = ? AND kind = 'suspension' AND tier = ?", [$personId, $tier - POLICY_T_RULE_REENTRY + POLICY_T_RULE_ESC]);
            return $sus && !in_array((string)$sus['status'], ['lifted', 'waived'], true);
        }
        // An escalation holds while its day is still the Nth breach of its session.
        $days = array_column(db_all("SELECT date FROM infractions WHERE personId = ? AND kind = ? AND (voidedAt IS NULL OR voidedAt = '')", [$personId, $kindOf]), 'date');
        $every = (int)$r['escalateAfter'];
        if ($every < 1) return false;
        return in_array(policy_day_of($day), array_column(policy_rule_triggers($personId, $days, $every), 1), true);
    }
    if ($kind === 'fine' && $tier >= POLICY_T_REENTRY) {
        // A re-entry fee stands while its suspension does.
        $s = db_row("SELECT status FROM sanctions WHERE personId = ? AND kind = 'suspension' AND tier = ?", [$personId, $tier - POLICY_T_REENTRY + POLICY_T_SUSPENSION]);
        return $s && !in_array((string)$s['status'], ['lifted', 'waived'], true);
    }
    if ($kind === 'suspension' && $tier >= POLICY_T_SUSPENSION && $tier < POLICY_T_REENTRY) {
        $suffix = $tier - POLICY_T_SUSPENSION; $j = $suffix % 10;
        [$a, $b] = policy_session_bounds($personId, policy_day_of(intdiv($suffix, 10)));
        return count(policy_unexcused_absences($personId, $a, $b)) >= $j * max(1, (int)$cfg['suspendAfterAbsences']);
    }
    if ($kind === 'fine' && $tier >= POLICY_T_LATE_FINE && $tier < POLICY_T_LATE_JUMPS) return $live('late', policy_day_of($tier - POLICY_T_LATE_FINE));
    if ($kind === 'corrective' && $tier >= POLICY_T_LATE_JUMPS && $tier < POLICY_T_ABS_JUMPS) return $live('late', policy_day_of($tier - POLICY_T_LATE_JUMPS));
    if ($kind === 'corrective' && $tier >= POLICY_T_ABS_JUMPS && $tier < POLICY_T_REVIEW) { $d = policy_day_of($tier - POLICY_T_ABS_JUMPS); return $live('absence', $d) && !$excused($d); }
    if ($kind === 'review' && $tier >= POLICY_T_REVIEW && $tier < POLICY_T_SUSPENSION) return $live('late', policy_day_of($tier - POLICY_T_REVIEW));
    return null;
}

/** Close out a sanction: pay a fine, serve a suspension, clear dormancy, or
 *  overturn any of them on appeal. */
function admin_policy_sanction_update(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;   // either desk may open it; the write is re-gated per person below
    $sid = (int)($p['sanctionId'] ?? 0);
    $status = (string)($p['status'] ?? '');
    // 'active' on a proposed suspension/eviction is the admin confirming it.
    // 'done' closes corrective exercise owed at the centre.
    if (!$sid || !in_array($status, ['active', 'proposed', 'paid', 'served', 'cleared', 'waived', 'lifted', 'done'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $s = db_row('SELECT * FROM sanctions WHERE id = ?', [$sid]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    $pg = policy_subject_gate($g['requester'], (string)$s['personId']); if (!$pg['ok']) return $pg;
    /* Not while it is under appeal: confirming an eviction (or setting any
       sanction going) before its appeal is heard makes the appeal decoration. */
    if ($status === 'active' && (string)$s['status'] === 'proposed' && function_exists('db_row')
        && db_row("SELECT id FROM member_requests WHERE kind = 'appeal' AND refSanctionId = ? AND status = 'open' LIMIT 1", [$sid]))
        return ['ok' => false, 'error' => 'under_appeal', 'detail' => 'This is under appeal. Decide the appeal first, in Requests.'];
    db_update('sanctions', [
        'status' => $status,
        'clearedAt' => in_array($status, ['active', 'proposed'], true) ? '' : now_iso(),
        'clearedBy' => in_array($status, ['active', 'proposed'], true) ? '' : (string)$g['requester']['memberId'],
        'note' => substr((string)($p['note'] ?? ''), 0, 240),
    ], ['id' => $sid]);
    /* Keep the ledger in step with the disciplinary record.
     *
     * A fine WAIVED or overturned on appeal stops being money owed. A fine
     * marked PAID does not get voided here — a payment is recorded against the
     * ledger as a payment, so voiding the charge as well would erase the fact
     * that anything was ever owed and leave the money unaccounted for. Reissuing
     * a fine set back to `active` re-posts it, idempotently. */
    if ((string)$s['kind'] === 'fine') {
        if (in_array($status, ['waived', 'cleared', 'lifted'], true)) {
            policy_fine_void_ledger((string)$s['personId'], $sid,
                $status === 'waived' ? 'Fine waived' : 'Fine overturned');
        } elseif ($status === 'active') {
            policy_fine_to_ledger((string)$s['personId'], (string)$s['personType'], $sid,
                (int)($s['amount'] ?? 0), (string)($s['reason'] ?? ''));
        }
    }
    /* A session suspension overturned takes its re-entry fee with it: a fee
       for re-entering after a suspension that did not happen is not owed. */
    $st = (int)$s['tier'];
    $feeTier = $st >= POLICY_T_RULE_ESC && $st < POLICY_T_RULE_REENTRY ? $st - POLICY_T_RULE_ESC + POLICY_T_RULE_REENTRY
             : ($st >= POLICY_T_SUSPENSION && $st < POLICY_T_REENTRY ? $st - POLICY_T_SUSPENSION + POLICY_T_REENTRY : 0);
    if ((string)$s['kind'] === 'suspension' && $feeTier && in_array($status, ['waived', 'lifted'], true)) {
        $fee = db_row("SELECT id FROM sanctions WHERE personId = ? AND kind = 'fine' AND tier = ? AND status = 'pending'", [(string)$s['personId'], $feeTier]);
        if ($fee) {
            db_update('sanctions', ['status' => 'lifted', 'clearedAt' => now_iso(), 'clearedBy' => (string)$g['requester']['memberId']], ['id' => (int)$fee['id']]);
            policy_fine_void_ledger((string)$s['personId'], (int)$fee['id'], 'The suspension was overturned — no re-entry fee is owed');
        }
    }
    audit('policy.sanction.update', (string)$g['requester']['memberId'], (string)$s['personId'], ['sanctionId' => $sid, 'kind' => $s['kind'], 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'state' => policy_state((string)$s['personId'], (string)$s['personType'])];
}

/** Issue a sanction by hand — §2.3 dormancy for declining energy, or a
 *  discretionary suspension/eviction that no counter can infer. */
function admin_policy_sanction_issue(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;   // either desk may open it; the write is re-gated per person below
    $id = trim((string)($p['personId'] ?? ''));
    $pg = policy_subject_gate($g['requester'], $id); if (!$pg['ok']) return $pg;
    $p['personType'] = $pg['type'];   // the record's real type, never the browser's claim
    $kind = (string)($p['kind'] ?? '');
    $reason = trim((string)($p['reason'] ?? ''));
    if ($id === '' || !in_array($kind, POLICY_SANCTIONS, true) || $reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $type = policy_person_type($id, (string)($p['personType'] ?? ''));
    $cfg = policy_for($type);
    $today = attendance_today();
    $days = max(1, min(365, (int)($p['days'] ?? $cfg['suspensionDays'])));
    // Manual tiers sit above every automatic band so they can never collide
    // with a threshold crossing, and policy_relift leaves them alone.
    $tier = 900000 + (int)(db_row("SELECT COUNT(*) c FROM sanctions WHERE personId = ? AND kind = ?", [$id, $kind])['c'] ?? 0);
    policy_issue($id, $type, $kind, $tier, [
        'reason' => $reason,
        'amount' => max(0, min(10000000, (int)($p['amount'] ?? 0))),
        'status' => $kind === 'fine' ? 'pending' : 'active',
        'startsAt' => $today,
        'endsAt' => $kind === 'suspension' ? gmdate('Y-m-d', (int)strtotime($today . ' 00:00:00 UTC') + $days * 86400) : '',
        'issuedBy' => (string)$g['requester']['memberId'],
    ]);
    audit('policy.sanction.issue', (string)$g['requester']['memberId'], $id, ['kind' => $kind, 'reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'state' => policy_state($id, $type)];
}

/**
 * Part IV — reinstatement after eviction. Refuses with the specific unmet
 * condition rather than a generic no, because "why can't I come back" is the
 * whole question this screen exists to answer.
 */
function admin_policy_reinstate(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;   // either desk may open it; the write is re-gated per person below
    $id = trim((string)($p['personId'] ?? ''));
    $pg = policy_subject_gate($g['requester'], $id); if (!$pg['ok']) return $pg;
    $p['personType'] = $pg['type'];   // the record's real type, never the browser's claim
    if ($id === '') return ['ok' => false, 'error' => 'bad_person'];
    $type = policy_person_type($id, (string)($p['personType'] ?? ''));
    $r = policy_settings()['reinstatement'];
    $ev = db_row("SELECT * FROM sanctions WHERE personId = ? AND kind = 'eviction' AND status IN ('active','proposed') ORDER BY issuedAt DESC LIMIT 1", [$id]);
    if (!$ev) return ['ok' => false, 'error' => 'not_evicted'];

    $since = (int)floor((time() - (int)strtotime((string)$ev['issuedAt'])) / 86400);
    $need = (int)$r['coolOffDays'];
    $unmet = [];
    if ($since < $need) $unmet[] = ['condition' => 'coolOff', 'detail' => ($need - $since) . ' of ' . $need . ' days of the cool-off period remain (evicted ' . substr((string)$ev['issuedAt'], 0, 10) . ').'];
    if (empty($p['trainingDone'])) $unmet[] = ['condition' => 'training', 'detail' => 'Has not passed ' . $r['training'] . '.'];
    if (empty($p['finePaid'])) $unmet[] = ['condition' => 'fine', 'detail' => 'The ₦' . number_format((float)$r['fine']) . ' clearing fine has not been recorded as paid.'];
    // An override is allowed but must be signed for — the Governing Council can
    // act, an operator mis-clicking cannot.
    $override = !empty($p['councilOverride']) && trim((string)($p['overrideReason'] ?? '')) !== '';
    if ($unmet && !$override) return ['ok' => false, 'error' => 'conditions_unmet', 'unmet' => $unmet, 'daysServed' => $since, 'coolOffDays' => $need];

    db_update('sanctions', ['status' => 'cleared', 'clearedAt' => now_iso(), 'clearedBy' => (string)$g['requester']['memberId'],
                            'note' => substr($override && $unmet ? 'Council override: ' . (string)$p['overrideReason'] : 'Reinstated under Part IV.', 0, 240)], ['id' => (int)$ev['id']]);
    // Reinstatement is a fresh start: the ledger that produced the eviction is
    // archived so it cannot immediately re-evict on the next evaluation.
    db_exec("UPDATE infractions SET voidedAt = ?, voidedBy = ?, voidReason = 'Cleared on reinstatement (Part IV).' WHERE personId = ? AND (voidedAt IS NULL OR voidedAt = '')",
            [now_iso(), (string)$g['requester']['memberId'], $id]);
    foreach (db_all("SELECT id, kind FROM sanctions WHERE personId = ? AND status IN ('active','proposed')", [$id]) as $s) {
        db_update('sanctions', ['status' => 'cleared', 'clearedAt' => now_iso(), 'clearedBy' => (string)$g['requester']['memberId']], ['id' => (int)$s['id']]);
        // Reinstatement is a fresh start, so the fines go with the record.
        if ((string)$s['kind'] === 'fine') policy_fine_void_ledger($id, (int)$s['id'], 'Cleared on reinstatement (Part IV).');
    }
    audit('policy.reinstate', (string)$g['requester']['memberId'], $id, ['daysServed' => $since, 'override' => $override], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'reinstated' => true, 'override' => $override && (bool)$unmet, 'state' => policy_state($id, $type)];
}

/** The compliance board — everyone who is not clear, worst first. */
function admin_policy_board(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $rows = [];
    $names = [];
    /* The board shows only the people this reader may act on: Summer
       participants to the summer desk, members and volunteers to the people
       desk — and, for a scoped admin, only in their centres. */
    $caps = member_effective_caps($g['requester']);
    $mayType = ['student' => in_array('summer', $caps, true), 'member' => in_array('people', $caps, true), 'volunteer' => in_array('people', $caps, true)];
    $scopeNames = admin_centre_names_in_scope($g['requester']);
    $inScope = static fn($centre) => $scopeNames === null || in_array((string)$centre, $scopeNames, true);
    if ($mayType['student']) foreach (db_all("SELECT studentId id, fullName, centre FROM summer_students WHERE status = 'active'") as $r) if ($inScope($r['centre'])) $names[(string)$r['id']] = ['name' => (string)$r['fullName'], 'type' => 'student'];
    if ($mayType['volunteer']) foreach (db_all("SELECT volunteerId id, fullName, centre FROM volunteers WHERE status = 'active'") as $r) if ($inScope($r['centre'])) $names[(string)$r['id']] = ['name' => (string)$r['fullName'], 'type' => 'volunteer'];
    if ($mayType['member']) foreach (db_all("SELECT memberId id, fullName, centre FROM members WHERE type = 'NGG' AND status = 'active'") as $r) if ($inScope($r['centre'])) $names[(string)$r['id']] = ['name' => (string)$r['fullName'], 'type' => 'member'];
    // Only people with something on their ledger — a clean roster costs nothing.
    $ids = db_all("SELECT DISTINCT personId FROM infractions WHERE voidedAt IS NULL OR voidedAt = ''");
    foreach (db_all("SELECT DISTINCT personId FROM sanctions WHERE status IN ('active','proposed','pending')") as $r) $ids[] = $r;
    $seen = [];
    foreach ($ids as $r) {
        $id = (string)$r['personId'];
        if ($id === '' || isset($seen[$id])) continue;
        $seen[$id] = true;
        if (!isset($names[$id])) continue;   // not someone this reader may see
        $meta = $names[$id];
        $st = policy_state($id, $meta['type']);
        if ($st['state'] === 'clear' && !$st['lates'] && !$st['absences'] && !$st['finesOwed'] && empty($st['awaitingReview'])) continue;
        $rows[] = ['personId' => $id, 'fullName' => $meta['name'], 'personType' => $meta['type']] + $st;
    }
    $rank = ['evicted' => 0, 'suspended' => 1, 'dormant' => 2, 'warned' => 3, 'clear' => 4];
    usort($rows, fn($a, $b) => [$rank[$a['state']], -$a['absences'], -$a['lates']] <=> [$rank[$b['state']], -$b['absences'], -$b['lates']]);
    $tally = ['evicted' => 0, 'suspended' => 0, 'dormant' => 0, 'warned' => 0, 'finesOwed' => 0, 'awaitingReview' => 0, 'jumpsOwed' => 0];
    foreach ($rows as $r) {
        if (isset($tally[$r['state']])) $tally[$r['state']]++;
        $tally['finesOwed'] += (int)$r['finesOwed'];
        $tally['jumpsOwed'] += (int)($r['jumpsOwed'] ?? 0);
        if (!empty($r['awaitingReview'])) $tally['awaitingReview']++;
    }
    // Anything waiting on a human sorts to the top of its band — that is the
    // work this board exists to hand over.
    usort($rows, fn($a, $b) => [$rank[$a['state']], $a['awaitingReview'] ? 0 : 1] <=> [$rank[$b['state']], $b['awaitingReview'] ? 0 : 1]);
    $pol = policy_settings();
    return ['ok' => true, 'board' => $rows, 'tally' => $tally,
            'policyEnabled' => !empty($pol['enabled']), 'autoEnforce' => !empty($pol['autoEnforce']),
            'memberPolicyEnabled' => !empty($pol['member']['enabled']),
            'rulebook' => (string)($pol['member']['rulebook'] ?? 'session'), 'jumpWord' => (string)($pol['member']['jumpWord'] ?? 'frog jumps'),
            'freshStart' => setting_get('policy_fresh_start')];
}

/** Run the absence sweep on demand — the "catch up now" button beside the
 *  automatic web-cron run. */
function admin_policy_sweep(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $r = policy_sweep_absences();
    $r['member'] = policy_sweep_member_absences();
    audit('policy.sweep', (string)$g['requester']['memberId'], '', $r, (string)($p['ip'] ?? ''));
    return $r;
}

// ── Attendance integrity: held days, unmatched check-ins, and the repair ─────
//
// Three tools for the day the feed fails, all on Conduct & fines → Compliance.
// The capability follows the person, as the rest of this file does: a member
// is `people`, a participant or volunteer is `summer`; a centre-scoped admin
// sees and acts on their own centres only.

const POLICY_REPAIR_MAX = 20000;   // absences one repair run may void — named in the refusal

/** The capability that acts on a person type. */
function policy_type_cap(string $type): string { return $type === 'member' ? 'people' : 'summer'; }

/** The person-type rows a requester may act on: [type => cap held]. */
function policy_types_for(array $requester): array {
    $caps = member_effective_caps($requester);
    $out = [];
    foreach (['member', 'student', 'volunteer'] as $t) if (in_array(policy_type_cap($t), $caps, true)) $out[] = $t;
    return $out;
}

/** A person's name and centre, by type — one read. */
function policy_person_row(string $type, string $id): ?array {
    if ($type === 'member') $r = db_row("SELECT memberId id, fullName, COALESCE(centre,'') centre, status FROM members WHERE memberId = ? LIMIT 1", [$id]);
    elseif ($type === 'volunteer') $r = db_row("SELECT volunteerId id, fullName, COALESCE(centre,'') centre, status FROM volunteers WHERE volunteerId = ? LIMIT 1", [$id]);
    else $r = db_row("SELECT studentId id, fullName, COALESCE(centre,'') centre, status FROM summer_students WHERE studentId = ? LIMIT 1", [$id]);
    return $r ?: null;
}

/** admin.attendance.integrity — what needs a person: held days, and check-ins that named nobody. */
function admin_attendance_integrity(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $types = policy_types_for($g['requester']);
    $held = [];
    if ($types) {
        $ph = implode(',', array_fill(0, count($types), '?'));
        foreach (db_all("SELECT * FROM attendance_held_days WHERE personType IN ($ph) ORDER BY (status = 'held') DESC, date DESC LIMIT 200", $types) as $h) {
            if ((string)$h['centre'] !== '' && !admin_centre_allowed($g['requester'], (string)$h['centre'])) continue;
            $held[] = ['id' => (int)$h['id'], 'date' => (string)$h['date'], 'centre' => (string)$h['centre'], 'personType' => (string)$h['personType'],
                       'expected' => (int)$h['expected'], 'present' => (int)$h['present'], 'why' => (string)$h['why'], 'status' => (string)$h['status'],
                       'logged' => (int)$h['logged'], 'decidedAt' => (string)$h['decidedAt'], 'cause' => (string)($h['cause'] ?? 'checkin')];
        }
    }
    $unm = [];
    foreach (db_all("SELECT * FROM attendance_unmatched WHERE status = 'open' ORDER BY date DESC, id DESC LIMIT 300") as $u) {
        if ((string)$u['centre'] !== '' && !admin_centre_allowed($g['requester'], (string)$u['centre'])) continue;
        $unm[] = ['id' => (int)$u['id'], 'date' => (string)$u['date'], 'ref' => (string)$u['ref'], 'token' => (string)$u['token'], 'value' => (string)$u['value'],
                  'name' => (string)$u['name'], 'centre' => (string)$u['centre'], 'source' => (string)$u['source'], 'action' => (string)$u['action'], 'scannedAt' => (string)$u['scannedAt']];
    }
    return ['ok' => true, 'held' => $held, 'heldOpen' => count(array_filter($held, static fn($h) => $h['status'] === 'held')), 'unmatched' => $unm, 'types' => $types];
}

/**
 * admin.attendance.held.decide — say what a held day was.
 *   closed  the centre really did not meet (or it is a day the people should
 *           not be judged on): nothing is logged, ever.
 *   count   it met and the feed was fine: the absences are logged now, for
 *           those who still have no check-in — by the person deciding.
 */
function admin_attendance_held_decide(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $h = db_row('SELECT * FROM attendance_held_days WHERE id = ? LIMIT 1', [(int)($p['id'] ?? 0)]);
    if (!$h) return ['ok' => false, 'error' => 'not_found'];
    $type = (string)$h['personType'];
    if (!in_array(policy_type_cap($type), member_effective_caps($g['requester']), true)) return ['ok' => false, 'error' => 'forbidden'];
    if ((string)$h['centre'] !== '' && !admin_centre_allowed($g['requester'], (string)$h['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    if ((string)$h['status'] !== 'held') return ['ok' => false, 'error' => 'already_decided', 'detail' => 'Somebody already decided this day.'];
    $decision = (string)($p['decision'] ?? '');
    if (!in_array($decision, ['closed', 'count'], true)) return ['ok' => false, 'error' => 'bad_decision'];
    $by = (string)$g['requester']['memberId'];
    $date = (string)$h['date']; $centre = (string)$h['centre'];
    $logged = 0;
    if ($decision === 'count') {
        if ($type === 'member') $rows = db_all("SELECT memberId id, centre FROM members WHERE type = 'NGG' AND status = 'active' AND COALESCE(centre,'') = ?", [$centre]);
        elseif ($type === 'volunteer') $rows = db_all("SELECT volunteerId id, centre FROM volunteers WHERE status = 'active' AND COALESCE(centre,'') = ?", [$centre]);
        else $rows = db_all("SELECT studentId id, centre FROM summer_students WHERE status = 'active' AND COALESCE(centre,'') = ?", [$centre]);
        $present = [];
        foreach (db_all('SELECT studentId, checkOutAt FROM attendance WHERE date = ?', [$date]) as $r) $present[(string)$r['studentId']] = (string)($r['checkOutAt'] ?? '');
        $byDepartures = (string)($h['cause'] ?? 'checkin') === 'checkout';
        $cal = $type === 'member' ? member_programme_settings() : programme_settings();
        $centreDays = $type === 'member' ? centre_meet_days_map() : null;
        $groupDays = $type === 'student' ? participant_group_days_map() : null;
        foreach ($rows as $r) {
            $id = (string)$r['id'];
            /* A day held for missing ARRIVALS counts those with no check-in; one
               held for missing DEPARTURES counts those who came and have no
               sign-out — the "Incomplete" note, so a sign-out that arrives
               later still clears it (policy_checkout_landed). */
            if ($byDepartures ? (!array_key_exists($id, $present) || $present[$id] !== '') : array_key_exists($id, $present)) continue;
            $calFor = $type === 'member' ? member_calendar_for(['memberId' => $id, 'centre' => $r['centre']], $cal, $centreDays)
                    : ($type === 'student' ? participant_calendar_for($id, $cal, $groupDays) : $cal);
            if (!programme_is_day($date, $calFor)) continue;
            if ($type === 'member' && function_exists('member_absence_cover') && member_absence_cover($id, $date) === 'academic') continue;
            if ($byDepartures) {
                policy_log($id, $type, 'no_checkout', $date, 'Signed in but never signed out — counted by staff after the day was held.', $by);
                if (policy_log($id, $type, 'halfday', $date, POLICY_NOSIGNOUT_NOTE, $by)) { $logged++; policy_apply($id, $type); }
            } elseif (policy_log($id, $type, 'absence', $date, 'No check-in — counted by staff after the day was held.', $by)) { $logged++; policy_apply($id, $type); }
        }
    }
    db_update('attendance_held_days', ['status' => $decision === 'count' ? 'counted' : 'closed', 'logged' => $logged, 'decidedBy' => $by, 'decidedAt' => now_iso()], ['id' => (int)$h['id']]);
    audit('policy.held_day.' . $decision, $by, $date, ['centre' => $centre, 'type' => $type, 'logged' => $logged], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $decision === 'count' ? 'counted' : 'closed', 'logged' => $logged];
}

/**
 * admin.attendance.unmatched.match — a check-in that named nobody, given its
 * person (or set aside). The check-in is recorded for that day, and if the
 * nightly check had already called them absent, that absence is undone.
 */
function admin_attendance_unmatched_match(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $u = db_row("SELECT * FROM attendance_unmatched WHERE id = ? LIMIT 1", [(int)($p['id'] ?? 0)]);
    if (!$u) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$u['status'] !== 'open') return ['ok' => false, 'error' => 'already_decided', 'detail' => 'Somebody already dealt with this one.'];
    $by = (string)$g['requester']['memberId'];
    if (!empty($p['dismiss'])) {
        db_update('attendance_unmatched', ['status' => 'dismissed', 'decidedBy' => $by, 'decidedAt' => now_iso()], ['id' => (int)$u['id']]);
        audit('attendance.unmatched.dismiss', $by, (string)$u['refKey'], ['date' => $u['date']], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'status' => 'dismissed'];
    }
    $pid = trim((string)($p['personId'] ?? ''));
    $type = in_array((string)($p['personType'] ?? ''), ['member', 'student', 'volunteer'], true) ? (string)$p['personType'] : 'member';
    if (!in_array(policy_type_cap($type), member_effective_caps($g['requester']), true)) return ['ok' => false, 'error' => 'forbidden'];
    $person = $pid !== '' ? policy_person_row($type, $pid) : null;
    if (!$person) return ['ok' => false, 'error' => 'not_found', 'detail' => 'Nobody with that ID.'];
    if (!admin_centre_allowed($g['requester'], (string)$person['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $date = (string)$u['date'];
    $at = (string)$u['scannedAt'] !== '' ? (string)$u['scannedAt'] : $date . 'T08:00:00Z';
    $have = db_row('SELECT id, checkOutAt FROM attendance WHERE studentId = ? AND date = ? LIMIT 1', [$pid, $date]);
    if ((string)$u['action'] === 'out') {
        if ($have && (string)$have['checkOutAt'] === '') { db_update('attendance', ['checkOutAt' => $at], ['id' => (int)$have['id']]); policy_checkout_landed($pid, $type, $date, $by); }
    } elseif (!$have) {
        db_insert('attendance', ['cohortId' => '', 'studentId' => $pid, 'token' => mb_substr((string)$u['token'], 0, 120), 'date' => $date, 'checkInAt' => $at,
            'method' => 'matched', 'centre' => (string)$u['centre'], 'byId' => $by, 'device' => mb_substr('matched:' . (string)$u['source'], 0, 64), 'createdAt' => now_iso()]);
    }
    $undone = (string)$u['action'] === 'out' ? 0 : policy_checkin_landed($pid, $type, $date, $by);
    db_update('attendance_unmatched', ['status' => 'matched', 'matchedId' => $pid, 'decidedBy' => $by, 'decidedAt' => now_iso()], ['id' => (int)$u['id']]);
    audit('attendance.unmatched.match', $by, $pid, ['date' => $date, 'ref' => $u['refKey'], 'absenceUndone' => $undone], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => 'matched', 'personId' => $pid, 'fullName' => (string)$person['fullName'], 'absenceUndone' => $undone];
}

/**
 * admin.policy.absence.repair — undo the absences the nightly check logged
 * when check-ins were not reaching NGG, and everything those absences caused.
 *
 * Only the CHECK's own entries are candidates: kind absence or no_checkout,
 * logged by `system`, with one of the check's notes (POLICY_SWEEP_NOTES).
 * Anything a person logged stays. Voiding re-derives each person's standing
 * (policy_relift), which lifts the warnings, Dormant Track and proposed
 * evictions that no longer hold, and voids only the POLICY fine those
 * sanctions carried. Fines and dues imported from the old records, uploaded
 * fines and every other ledger entry are not touched — the run reports them,
 * so the operator can see they were left alone.
 *
 *   mode  outage  only centre-days where the feed clearly failed: for a
 *                 missing arrival, fewer than a fifth of the expected people
 *                 checked in; for a missing sign-out, fewer than a fifth of
 *                 those who checked in have a sign-out
 *         all     every absence the check logged in the period
 *   apply false → a preview: the centre-days, how many, who, what lifts.
 */
function admin_policy_absence_repair(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $types = array_values(array_intersect(policy_types_for($g['requester']), (array)($p['types'] ?? ['member', 'student', 'volunteer'])));
    if (!$types) return ['ok' => false, 'error' => 'forbidden'];
    $from = (string)($p['from'] ?? ''); $to = (string)($p['to'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) || $from > $to) return ['ok' => false, 'error' => 'bad_dates', 'detail' => 'Choose a start and an end date, the start first.'];
    $mode = (string)($p['mode'] ?? 'outage') === 'all' ? 'all' : 'outage';
    $onlyCentre = trim((string)($p['centre'] ?? ''));
    $ph = implode(',', array_fill(0, count($types), '?'));
    $rows = db_all("SELECT id, personId, personType, kind, date, note FROM infractions
                    WHERE personType IN ($ph) AND kind IN ('absence','no_checkout','halfday') AND byId = 'system' AND " . policy_sweep_note_sql() . "
                      AND (voidedAt IS NULL OR voidedAt = '') AND date >= ? AND date <= ? ORDER BY date",
                   array_merge($types, [$from, $to]));
    // Each person's centre, per type, in one read each — never per row.
    $centreOf = [];
    $ids = [];
    foreach ($rows as $r) $ids[(string)$r['personType']][(string)$r['personId']] = true;
    $tbl = ['member' => ['members', 'memberId'], 'student' => ['summer_students', 'studentId'], 'volunteer' => ['volunteers', 'volunteerId']];
    foreach ($ids as $t => $set) foreach (array_chunk(array_keys($set), 500) as $chunk) {
        [$table, $key] = $tbl[$t];
        foreach (db_all("SELECT $key k, fullName, COALESCE(centre,'') c FROM $table WHERE $key IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk) as $x)
            $centreOf[$t . ':' . $x['k']] = ['centre' => (string)$x['c'], 'name' => (string)$x['fullName']];
    }
    // Who checked in and who signed out, per day — so a centre-day can be read as an outage or not.
    $checkins = [];
    $dates = array_values(array_unique(array_map(static fn($r) => (string)$r['date'], $rows)));
    foreach (array_chunk($dates, 200) as $chunk) {
        foreach (db_all('SELECT studentId, date, checkOutAt FROM attendance WHERE date IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk) as $a) $checkins[(string)$a['date']][(string)$a['studentId']] = (string)($a['checkOutAt'] ?? '') !== '';
    }
    $groups = []; $outOfScope = 0;
    foreach ($rows as $r) {
        $t = (string)$r['personType']; $who = $centreOf[$t . ':' . $r['personId']] ?? ['centre' => '', 'name' => ''];
        if ($onlyCentre !== '' && $who['centre'] !== $onlyCentre) continue;
        if (!admin_centre_allowed($g['requester'], $who['centre'])) { $outOfScope++; continue; }
        /* What the check said was missing: the arrival ("No check-in…") or the
           departure (no_checkout, "Incomplete…"). They fail separately — the
           gate delivered every arrival and no departure — so each is judged
           against its own evidence. */
        $cause = (string)$r['kind'] === 'no_checkout' || str_starts_with((string)$r['note'], 'Incomplete') ? 'checkout' : 'checkin';
        $k = $r['date'] . '|' . $who['centre'] . '|' . $t . '|' . $cause;
        $groups[$k] = $groups[$k] ?? ['date' => (string)$r['date'], 'centre' => $who['centre'], 'personType' => $t, 'cause' => $cause, 'absences' => 0, 'people' => [], 'ids' => [], 'checkins' => 0, 'checkouts' => 0];
        if ((string)$r['kind'] === 'absence') $groups[$k]['absences']++;
        $groups[$k]['people'][(string)$r['personId']] = true;
        $groups[$k]['ids'][] = (int)$r['id'];
    }
    // How many people of that type at that centre DID check in that day.
    $peopleAt = [];
    foreach ($groups as $k => $gr) {
        [$table, $key] = $tbl[$gr['personType']];
        $ck = $gr['personType'] . '|' . $gr['centre'];
        if (!isset($peopleAt[$ck])) $peopleAt[$ck] = array_column(db_all("SELECT $key k FROM $table WHERE COALESCE(centre,'') = ?", [$gr['centre']]), 'k');
        $in = 0; $outN = 0;
        foreach ($peopleAt[$ck] as $pid) {
            if (!isset($checkins[$gr['date']][(string)$pid])) continue;
            $in++; if ($checkins[$gr['date']][(string)$pid]) $outN++;
        }
        $groups[$k]['checkins'] = $in; $groups[$k]['checkouts'] = $outN;
        if ($gr['cause'] === 'checkout') {
            // Of those who came, fewer than one in five has a sign-out: the departures did not arrive.
            $groups[$k]['outage'] = $in > 0 && $outN * 5 < $in;
        } else {
            $expected = $in + count($gr['people']);
            $groups[$k]['outage'] = $expected > 0 && $in * 5 < $expected;
        }
    }
    $chosen = array_filter($groups, static fn($gr) => $mode === 'all' || $gr['outage']);
    $voidIds = []; $people = []; $absenceN = 0;
    foreach ($chosen as $gr) { foreach ($gr['ids'] as $i) $voidIds[] = $i; foreach (array_keys($gr['people']) as $pid) $people[$gr['personType'] . ':' . $pid] = true; $absenceN += $gr['absences']; }
    // What it does NOT touch, said out loud: the money imported from the old records.
    $memberIds = array_values(array_map(static fn($k) => substr($k, 7), array_filter(array_keys($people), static fn($k) => str_starts_with($k, 'member:'))));
    $imported = 0;
    if ($memberIds && function_exists('fees_entry_imported')) {
        foreach (array_chunk($memberIds, 500) as $chunk) {
            foreach (db_all("SELECT * FROM member_ledger WHERE memberId IN (" . implode(',', array_fill(0, count($chunk), '?')) . ") AND kind IN ('fine','dues','membership')", $chunk) as $e) if (fees_entry_imported($e)) $imported++;
        }
    }
    // The absence fines those days carried (₦1,000 a day by default): lifted with them.
    $fines = 0; $fineTotal = 0; $paid = 0;
    foreach ($chosen as $gr) {
        if ($gr['personType'] !== 'member') continue;
        $tier = 500000 + intdiv((int)strtotime($gr['date'] . ' 00:00:00 UTC'), 86400);
        $pids = array_keys($gr['people']);
        foreach (array_chunk($pids, 500) as $chunk) {
            foreach (db_all("SELECT amount, status FROM sanctions WHERE kind = 'fine' AND tier = ? AND issuedBy = 'system' AND status IN ('pending','paid','active')
                             AND personId IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')', array_merge([$tier], $chunk)) as $f) {
                $fines++; $fineTotal += (int)$f['amount']; if ((string)$f['status'] === 'paid') $paid++;
            }
        }
    }
    $sanctioned = 0;
    foreach (array_keys($people) as $k) {
        [$t, $pid] = explode(':', $k, 2);
        if (db_row("SELECT 1 FROM sanctions WHERE personId = ? AND issuedBy = 'system' AND kind IN ('warning','dormant','eviction') AND status IN ('active','proposed') LIMIT 1", [$pid])) $sanctioned++;
    }
    $list = array_values(array_map(static function ($gr) {
        unset($gr['ids']); $gr['people'] = count($gr['people']); return $gr;
    }, $groups));
    usort($list, static fn($a, $b) => strcmp($b['date'], $a['date']) ?: strcmp($a['centre'], $b['centre']) ?: strcmp($a['cause'], $b['cause']));
    $summary = ['mode' => $mode, 'from' => $from, 'to' => $to, 'groups' => array_slice($list, 0, 400), 'groupCount' => count($list),
                'chosenGroups' => count($chosen), 'infractions' => count($voidIds), 'absences' => $absenceN, 'noSignOut' => count($voidIds) - $absenceN, 'people' => count($people), 'sanctionedNow' => $sanctioned,
                'absenceFines' => $fines, 'absenceFineTotal' => $fineTotal, 'absenceFinesPaid' => $paid,
                'importedUntouched' => $imported, 'outOfScope' => $outOfScope, 'max' => POLICY_REPAIR_MAX];
    if (empty($p['apply'])) return ['ok' => true, 'preview' => true] + $summary;

    $reason = trim(mb_substr((string)($p['reason'] ?? ''), 0, 240));
    if (mb_strlen($reason) < 5) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why — it is written on every entry voided.'];
    if (!$voidIds) return ['ok' => false, 'error' => 'nothing_to_do', 'detail' => 'No absences the check logged match this.'];
    if (count($voidIds) > POLICY_REPAIR_MAX) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most ' . POLICY_REPAIR_MAX . ' absences in one run; choose a shorter period.'];
    $by = (string)$g['requester']['memberId'];
    foreach (array_chunk($voidIds, 500) as $chunk) {
        db_exec("UPDATE infractions SET voidedAt = ?, voidedBy = ?, voidReason = ? WHERE id IN (" . implode(',', array_fill(0, count($chunk), '?')) . ") AND (voidedAt IS NULL OR voidedAt = '')",
            array_merge([now_iso(), $by, mb_substr('Repair: ' . $reason, 0, 240)], $chunk));
    }
    $lifted = 0;
    foreach (array_keys($people) as $k) { [$t, $pid] = explode(':', $k, 2); $lifted += policy_relift($pid, $t); }
    $still = 0;
    foreach (array_keys($people) as $k) {
        [$t, $pid] = explode(':', $k, 2);
        if (db_row("SELECT 1 FROM sanctions WHERE personId = ? AND kind = 'dormant' AND status IN ('active','proposed') LIMIT 1", [$pid])) $still++;
    }
    // Held days the repair covered are settled as "closed": nobody is counted for them later.
    db_exec("UPDATE attendance_held_days SET status = 'closed', decidedBy = ?, decidedAt = ? WHERE status = 'held' AND date >= ? AND date <= ? AND personType IN ($ph)",
        array_merge([$by, now_iso(), $from, $to], $types));
    audit('policy.absence_repair', $by, $from . '..' . $to, ['mode' => $mode, 'voided' => count($voidIds), 'people' => count($people), 'lifted' => $lifted,
        'stillDormant' => $still, 'reason' => $reason, 'types' => $types, 'centre' => $onlyCentre], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => true, 'voided' => count($voidIds), 'people' => count($people), 'lifted' => $lifted, 'stillDormant' => $still] + $summary;
}

// ── Fresh start: offences and pending penalties before a date, revoked ──────
/*
 * "All offences and pending disciplinary penalties recorded before this
 * announcement are hereby revoked. Every child starts afresh." One run,
 * previewed first, applied exactly as previewed, for the members this
 * operator may act on:
 *
 *   · every live infraction dated before `asOf` is voided with the reason;
 *   · every warning, Dormant Track, proposed eviction, suspension, review and
 *     corrective exercise still standing from before `asOf` is lifted;
 *   · every POLICY fine still pending from before `asOf` is lifted and taken
 *     off the account. A fine already PAID stays paid — revoking a penalty is
 *     not a refund;
 *   · an ACTIVE eviction is not undone: that is reinstatement, with its own
 *     conditions (Part IV). They are listed so nobody is forgotten;
 *   · fines brought over by upload are left owed unless `includeImported` is
 *     set — and then they are WAIVED (a recorded mercy, the charge stays),
 *     never voided. Dues and membership are never touched.
 *
 * Nothing after `asOf` is touched, and the nightly check cannot re-log a day
 * it already logged (the voided entry keeps its place). One audit event.
 */
/** The members in this operator's reach: [memberId => row]. */
function policy_fresh_start_members(array $requester): array {
    $out = [];
    foreach (db_all("SELECT memberId, fullName, COALESCE(centre,'') centre FROM members WHERE type = 'NGG' AND status = 'active'") as $m)
        if (admin_centre_allowed($requester, (string)$m['centre'])) $out[(string)$m['memberId']] = $m;
    return $out;
}
/**
 * The fresh start itself — every write — returning what it changed, counted
 * from the database before and after rather than predicted. The preview runs
 * this inside a transaction it rolls back, so what the operator is shown is
 * exactly what pressing the button will do.
 */
function policy_fresh_start_run(array $members, string $asOf, bool $imported, string $by, string $why): array {
    $ids = array_keys($members);
    $standing = static function () use ($ids): array {
        $o = [];
        foreach (array_chunk($ids, 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            foreach (db_all("SELECT id, personId, kind, status, amount, tier FROM sanctions WHERE personId IN ($ph) AND status IN ('active','proposed','pending')", $chunk) as $r) $o[(int)$r['id']] = $r;
        }
        return $o;
    };
    $before = $standing();
    $people = []; $voided = 0; $evicted = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT DISTINCT personId FROM infractions WHERE personId IN ($ph) AND date < ? AND (voidedAt IS NULL OR voidedAt = '')", array_merge($chunk, [$asOf])) as $r) $people[(string)$r['personId']] = true;
        $voided += db_exec("UPDATE infractions SET voidedAt = ?, voidedBy = ?, voidReason = ? WHERE personId IN ($ph) AND date < ? AND (voidedAt IS NULL OR voidedAt = '')",
            array_merge([now_iso(), $by, $why], $chunk, [$asOf]));
    }
    // What those offences caused falls away however late it was issued; anything else standing from before the day is lifted with it.
    foreach ($before as $sid => $r) {
        $pid = (string)$r['personId'];
        if ((string)$r['kind'] === 'eviction' && (string)$r['status'] === 'active') continue;   // reinstatement, not a fresh start
        $issued = (string)(db_row('SELECT COALESCE(NULLIF(issuedAt,\'\'), createdAt) d FROM sanctions WHERE id = ?', [$sid])['d'] ?? '');
        if (substr($issued, 0, 10) < $asOf) {
            db_update('sanctions', ['status' => 'lifted', 'clearedAt' => now_iso(), 'clearedBy' => $by, 'note' => $why], ['id' => $sid]);
            if ((string)$r['kind'] === 'fine') policy_fine_void_ledger($pid, $sid, $why);
            $people[$pid] = true;
        }
    }
    foreach (array_keys($people) as $pid) policy_relift($pid, 'member', true);
    $after = $standing();
    $lifted = []; $fines = 0; $fineTotal = 0;
    foreach ($before as $sid => $r) {
        if (isset($after[$sid])) continue;
        $lifted[(string)$r['kind']] = ($lifted[(string)$r['kind']] ?? 0) + 1;
        if ((string)$r['kind'] === 'fine') { $fines++; $fineTotal += (int)$r['amount']; }
        $people[(string)$r['personId']] = true;
    }
    foreach ($after as $r) if ((string)$r['kind'] === 'eviction' && (string)$r['status'] === 'active')
        $evicted[] = ['memberId' => (string)$r['personId'], 'fullName' => (string)($members[(string)$r['personId']]['fullName'] ?? '')];
    // Paid fines of the people it touched: still paid, and said so.
    $paidKept = 0;
    foreach (array_chunk(array_keys($people), 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        $paidKept += (int)(db_row("SELECT COUNT(*) c FROM sanctions WHERE personId IN ($ph) AND kind = 'fine' AND status = 'paid'", $chunk)['c'] ?? 0);
    }
    // Imported fines: waived for what is still unpaid — the charge stays on the record.
    $imp = 0; $impTotal = 0;
    if ($imported && function_exists('fees_entry_left')) {
        foreach (array_chunk($ids, 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            foreach (db_all("SELECT memberId, periodKey FROM member_ledger WHERE memberId IN ($ph) AND kind = 'fine' AND direction = 'charge' AND (voidedAt IS NULL OR voidedAt = '')
                             AND substr(createdAt,1,10) < ? AND " . fees_imported_sql(), array_merge($chunk, [$asOf])) as $e) {
                $mrow = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$e['memberId']]);
                $left = $mrow ? (int)(fees_entry_left($mrow, (string)$e['periodKey']) ?? 0) : 0;
                if ($left <= 0) continue;
                // Counted only when the waiver actually landed: the report used to count waivers that were never posted.
                if (!fees_post((string)$e['memberId'], 'waiver', $left, ['periodKey' => 'fresh-start:' . $asOf . ':' . (string)$e['periodKey'], 'by' => $by, 'note' => mb_substr($why . ' (imported fine)', 0, 240)])) continue;
                $imp++; $impTotal += $left; $people[(string)$e['memberId']] = true;
            }
        }
    }
    return ['people' => count($people), 'infractions' => $voided, 'sanctions' => $lifted, 'fines' => $fines, 'fineTotal' => $fineTotal,
            'paidKept' => $paidKept, 'evicted' => $evicted, 'imported' => $imp, 'importedTotal' => $impTotal];
}

function admin_policy_fresh_start(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $asOf = (string)($p['asOf'] ?? attendance_today());
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $asOf) || $asOf > attendance_today()) return ['ok' => false, 'error' => 'bad_date', 'detail' => 'Choose the day of the announcement — today or earlier.'];
    $imported = !empty($p['includeImported']);
    // Waiving money is the fees desk's trust (CLAUDE.md §4), never bundled into people.
    if ($imported && !in_array('fees', member_effective_caps($req), true)) return ['ok' => false, 'error' => 'forbidden', 'detail' => 'missing_cap:fees',
        'message' => 'Waiving imported fines needs the Fees permission.'];
    $members = policy_fresh_start_members($req);
    $all = (int)(db_row("SELECT COUNT(*) c FROM members WHERE type = 'NGG' AND status = 'active'")['c'] ?? 0);
    $by = (string)$req['memberId'];
    $apply = !empty($p['apply']);
    $reason = trim(mb_substr((string)($p['reason'] ?? ''), 0, 240));
    if ($apply && mb_strlen($reason) < 5) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why — it is written on every entry revoked.'];
    $why = mb_substr('Fresh start: ' . ($reason !== '' ? $reason : 'preview'), 0, 240);
    $db = db_conn();
    if ($db->inTransaction()) return ['ok' => false, 'error' => 'busy'];
    $db->beginTransaction();
    try { $res = policy_fresh_start_run($members, $asOf, $imported, $by, $why); }
    catch (Throwable $e) { $db->rollBack(); throw $e; }
    if (!$apply || !$res['people']) $db->rollBack(); else $db->commit();
    $summary = ['asOf' => $asOf, 'includeImported' => $imported] + $res + ['outOfScope' => $all - count($members), 'last' => setting_get('policy_fresh_start')];
    if (!$apply) return ['ok' => true, 'preview' => true] + $summary;
    if (!$res['people']) return ['ok' => false, 'error' => 'nothing_to_do', 'detail' => 'Nothing recorded before that day is still standing.'];
    setting_set('policy_fresh_start', ['asOf' => $asOf, 'at' => now_iso(), 'by' => $by, 'reason' => $reason, 'people' => $res['people']], $by);
    audit('policy.fresh_start', $by, $asOf, ['people' => $res['people'], 'infractions' => $res['infractions'], 'sanctions' => $res['sanctions'],
        'fineTotal' => $res['fineTotal'], 'imported' => $res['importedTotal'], 'evictedLeft' => count($res['evicted']), 'reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'applied' => true] + $summary;
}

// ── Corrective exercise owed at the centre ──────────────────────────────────

const POLICY_CORRECTIVE_MAX = 500;
/** admin.policy.correctives — who owes corrective exercise, by centre, for the desk to see done. */
function admin_policy_correctives(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rows = [];
    foreach (db_all("SELECT s.id, s.personId, s.tier, s.amount, s.reason, s.issuedAt, m.fullName, m.displayId, COALESCE(m.centre,'') centre
                     FROM sanctions s JOIN members m ON m.memberId = s.personId
                     WHERE s.kind = 'corrective' AND s.status = 'pending' ORDER BY m.centre, m.fullName, s.tier LIMIT 3000") as $r) {
        if (!admin_centre_allowed($g['requester'], (string)$r['centre'])) continue;
        /* The day and what it was for, from the tier: a rulebook row is keyed
           by its day, so the desk can sort and read "Absent · Sat 17 Oct"
           without parsing a sentence. Older or hand-issued rows have neither. */
        $t = (int)$r['tier'];
        [$for, $day] = $t >= POLICY_T_LATE_JUMPS && $t < POLICY_T_ABS_JUMPS ? ['late', policy_day_of($t - POLICY_T_LATE_JUMPS)]
            : ($t >= POLICY_T_ABS_JUMPS && $t < POLICY_T_REVIEW ? ['absence', policy_day_of($t - POLICY_T_ABS_JUMPS)] : ['other', '']);
        $ruleName = '';
        if (($parts = policy_rule_tier_parts($t)) && $parts[0] === POLICY_T_RULE_JUMPS) {
            $for = 'rule'; $day = policy_day_of($parts[2]); $ruleName = (string)(policy_rules_index()['bySeq'][$parts[1]]['name'] ?? '');
        }
        /* The FINE for the same incident, keyed the way policy_apply_* keys it:
           a late band's fine, the absent day's fine, a rule breach's fine. The
           desk used to see the jumps alone under a line saying "not money", and
           read it as the punishment instead of a fine — when it is both. */
        $fineTier = $for === 'late' ? POLICY_T_LATE_FINE + ($t - POLICY_T_LATE_JUMPS)
            : ($for === 'absence' ? 500000 + ($t - POLICY_T_ABS_JUMPS)
            : ($for === 'rule' ? POLICY_T_RULE_FINE + ($t - POLICY_T_RULE_JUMPS) : 0));
        $rows[] = ['id' => (int)$r['id'], 'memberId' => (string)$r['personId'], 'fullName' => (string)$r['fullName'], 'displayId' => (string)$r['displayId'],
                   'centre' => (string)$r['centre'], 'count' => (int)$r['amount'], 'for' => $for, 'rule' => $ruleName, 'date' => $day, 'reason' => (string)$r['reason'], 'issuedAt' => (string)$r['issuedAt'],
                   'fineTier' => $fineTier, 'fine' => null];
    }
    // The fines, in one query per 500 people — never one per row.
    $ids = array_values(array_unique(array_column(array_filter($rows, static fn($x) => $x['fineTier'] > 0), 'memberId')));
    $fines = [];
    foreach (array_chunk($ids, 500) as $chunk) {
        foreach (db_all("SELECT personId, tier, amount, status FROM sanctions WHERE kind = 'fine' AND personId IN (" . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk) as $f)
            $fines[(string)$f['personId'] . '|' . (int)$f['tier']] = ['amount' => (int)$f['amount'], 'status' => (string)$f['status']];
    }
    foreach ($rows as &$x) { $x['fine'] = $x['fineTier'] > 0 ? ($fines[$x['memberId'] . '|' . $x['fineTier']] ?? null) : null; unset($x['fineTier']); }
    unset($x);
    return ['ok' => true, 'rows' => $rows, 'total' => array_sum(array_column($rows, 'count')), 'word' => (string)policy_for('member')['jumpWord'], 'max' => POLICY_CORRECTIVE_MAX];
}
/** admin.policy.correctives.done — {ids}: marked done at the centre, each answered, one audit event. */
function admin_policy_correctives_done(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_map('intval', (array)($p['ids'] ?? []))));
    $ids = array_values(array_filter($ids, static fn($i) => $i > 0));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > POLICY_CORRECTIVE_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => POLICY_CORRECTIVE_MAX, 'detail' => 'At most ' . POLICY_CORRECTIVE_MAX . ' at a time.'];
    $by = (string)$g['requester']['memberId']; $results = []; $done = 0;
    foreach ($ids as $id) {
        $s = db_row("SELECT s.*, COALESCE(m.centre,'') centre FROM sanctions s LEFT JOIN members m ON m.memberId = s.personId WHERE s.id = ? LIMIT 1", [$id]);
        if (!$s || (string)$s['kind'] !== 'corrective') { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)$s['centre'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        if ((string)$s['status'] !== 'pending') { $results[] = ['id' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        db_update('sanctions', ['status' => 'done', 'clearedAt' => now_iso(), 'clearedBy' => $by], ['id' => $id]);
        $results[] = ['id' => $id, 'ok' => true]; $done++;
    }
    audit('policy.corrective.done', $by, '', ['done' => $done, 'asked' => count($ids), 'refused' => count(array_filter($results, static fn($r) => empty($r['ok'])))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'done' => $done, 'results' => $results];
}

