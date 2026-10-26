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
    ],
    'musing' => ['enabled' => true, 'endsAt' => '08:00'],  // §"The Musing Period"
    'idCard' => ['secondOffenceFine' => 1000, 'lostFine' => 2000],
    'reinstatement' => ['coolOffDays' => 365, 'fine' => 10000, 'training' => 'CIMC 1'],
];

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

// ── Infractions ─────────────────────────────────────────────────────────────

const POLICY_INFRACTIONS = ['absence', 'late', 'tardy', 'halfday', 'no_checkout', 'idcard_missing', 'idcard_lost', 'review_missed', 'misconduct'];

/** Record a fact. One row per person per kind per day — a second scan, or a
 *  re-run of the nightly sweep, is a no-op rather than a second strike. */
function policy_log(string $personId, string $type, string $kind, string $date, string $note = '', string $byId = 'system'): bool {
    if ($personId === '' || !in_array($kind, POLICY_INFRACTIONS, true)) return false;
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

const POLICY_SANCTIONS = ['warning', 'dormant', 'suspension', 'fine', 'eviction'];

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
    fees_post($personId, 'fine', $amount, [
        // The sanction id IS the period key: one ledger row per sanction, ever.
        'periodKey' => 'sanction-' . $sanctionId,
        'note' => 'Policy fine' . ($reason !== '' ? ' — ' . $reason : ''),
        'by' => 'policy',
    ]);
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
    $fines = []; $evictedAt = ''; $suspendedFrom = ''; $proposed = [];
    foreach ($sanctions as $s) {
        $kind = (string)$s['kind'];
        $status = (string)$s['status'];
        if ($kind === 'fine' && in_array($status, ['active', 'pending'], true)) $fines[] = $s;
        // Crossed the threshold, waiting on an admin. Visible, not enforced.
        if ($status === 'proposed') { $proposed[] = ['kind' => $kind, 'reason' => (string)$s['reason'], 'sanctionId' => (int)$s['id']]; continue; }
        if ($status !== 'active') continue;
        if ($kind === 'eviction') { $state = 'evicted'; $evictedAt = (string)$s['issuedAt']; $reason = (string)$s['reason']; }
        elseif ($kind === 'suspension') {
            $suspendedFrom = (string)$s['startsAt'];
            $ends = (string)$s['endsAt'];
            if ($state !== 'evicted' && ($ends === '' || substr($ends, 0, 10) >= $today)) {
                $state = 'suspended'; $until = $ends; $reason = (string)$s['reason'];
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
        foreach (db_all("SELECT personId, kind, status, endsAt, amount, reason FROM sanctions WHERE personId IN ($ph) AND status IN ('active','pending','proposed')", $chunk) as $r) {
            $live[(string)$r['personId']][] = $r;
        }
        foreach ($chunk as $id) {
            $c = ($counts[$id] ?? []) + array_fill_keys(POLICY_INFRACTIONS, 0);
            $abs = $c['absence'] + intdiv($c['halfday'], 2);
            $state = 'clear'; $until = ''; $owed = 0; $proposed = [];
            foreach ($live[$id] ?? [] as $s) {
                $kind = (string)$s['kind'];
                if ($kind === 'fine') { $owed += (int)$s['amount']; continue; }
                if ((string)$s['status'] === 'proposed') { $proposed[] = ['kind' => $kind, 'reason' => (string)$s['reason']]; continue; }
                if ($kind === 'eviction') { $state = 'evicted'; }
                elseif ($kind === 'suspension' && $state !== 'evicted') {
                    $ends = (string)$s['endsAt'];
                    if ($ends === '' || substr($ends, 0, 10) >= $today) { $state = 'suspended'; $until = $ends; }
                } elseif ($kind === 'dormant' && !in_array($state, ['evicted', 'suspended'], true)) $state = 'dormant';
                elseif ($kind === 'warning' && $state === 'clear') $state = 'warned';
            }
            $out[$id] = [
                'state' => $state, 'until' => $until,
                'proposed' => $proposed, 'awaitingReview' => count($proposed) > 0,
                'absences' => $abs, 'absenceLimit' => (int)$cfg['absenceLimit'],
                'lates' => $c['late'], 'latenessCap' => (int)$cfg['latenessCap'],
                'halfDays' => $c['halfday'], 'tardies' => $c['tardy'],
                'idCardMisses' => $c['idcard_missing'], 'finesOwed' => $owed,
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

    // §1.1 Attendance — strike 1 warning, strike 2 dormancy, strike 3 eviction.
    $limit = (int)$cfg['absenceLimit'];
    $abs = (int)$counts['absenceEquivalent'];
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
    $lates = (int)$counts['late'];
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
    if ($type === 'member' && (int)($cfg['lateFine'] ?? 0) > 0) {
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
        return ['ok' => false, 'error' => 'policy_suspended', 'state' => $st,
                'message' => 'Suspended' . ($st['until'] ? ' until ' . substr($st['until'], 0, 10) : '') . ' — barred from the premises and digital channels.'];
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
    if (!empty($punc['redline'])) policy_log($personId, $type, 'late', $date, 'Scanned at or after the lateness redline.');
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

    $students = db_all("SELECT studentId FROM summer_students WHERE status = 'active'");
    $vols = db_all("SELECT volunteerId FROM volunteers WHERE status = 'active'");
    $absences = 0; $noCheckout = 0;
    foreach ($days as $d) {
        $present = [];
        foreach (db_all("SELECT studentId, checkOutAt FROM attendance WHERE date = ?", [$d]) as $r) {
            $present[(string)$r['studentId']] = (string)($r['checkOutAt'] ?? '');
        }
        foreach ([['student', $students, 'studentId'], ['volunteer', $vols, 'volunteerId']] as [$type, $rows, $key]) {
            foreach ($rows as $row) {
                $id = (string)$row[$key];
                // Their own calendar: a participant's group may meet on other days.
                if (!programme_is_day($d, $type === 'student' ? participant_calendar_for($id, $cfg, $groupDays) : $cfg)) continue;
                if (!array_key_exists($id, $present)) {
                    if (policy_log($id, $type, 'absence', $d, 'No check-in scan on a programme day.')) $absences++;
                } elseif (!empty($pol['checkoutRequired']) && $present[$id] === '') {
                    // Scanned in, never scanned out. Logged as its own fact so
                    // the ledger says what actually happened, and as an absence
                    // because the blueprint counts a missing scan as one.
                    policy_log($id, $type, 'no_checkout', $d, 'Checked in but never scanned out.');
                    if (policy_log($id, $type, 'absence', $d, 'Incomplete scan — no check-out (§1.3).')) $absences++;
                    $noCheckout++;
                }
            }
        }
        setting_set('policy_swept_through', $d, 'system');
    }
    // Re-evaluate only the people whose ledger actually moved.
    $touched = db_all("SELECT DISTINCT personId, personType FROM infractions WHERE date >= ? AND date <= ?", [$days[0], $days[count($days) - 1]]);
    foreach ($touched as $t) policy_apply((string)$t['personId'], (string)$t['personType']);

    return ['ok' => true, 'days' => count($days), 'absences' => $absences, 'noCheckout' => $noCheckout, 'swept' => $days[count($days) - 1], 'evaluated' => count($touched)];
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
    if ($start === '' || $start > $end) return ['ok' => true, 'days' => 0, 'absences' => 0, 'swept' => $last];

    // A day is swept when any centre meets on it; each member is then judged
    // on their own centre's days.
    $centreDays = centre_meet_days_map();
    $wide = $cal; $wide['weekdays'] = array_values(array_unique(array_merge((array)$cal['weekdays'], ...array_values($centreDays ?: [[]]))));
    $days = array_slice(programme_days_between($start, $end, $wide), 0, 14);
    if (!$days) { setting_set('policy_member_swept_through', $end, 'system'); return ['ok' => true, 'days' => 0, 'absences' => 0, 'swept' => $end]; }

    $members = db_all("SELECT memberId, centre FROM members WHERE type = 'NGG' AND status = 'active'");
    $absences = 0;
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
        foreach ($members as $row) {
            $id = (string)$row['memberId'];
            if (!programme_is_day($d, member_calendar_for($row, $cal, $centreDays))) continue;   // not their centre's day
            // Approved academic leave: the day is not theirs to attend, so it is not an absence.
            if (function_exists('member_absence_cover') && member_absence_cover($id, $d) === 'academic') continue;
            if (!array_key_exists($id, $present)) {
                if (policy_log($id, 'member', 'absence', $d, 'No check-in on a member programme day.')) $absences++;
            } elseif ($since !== '' && $d >= $since && $present[$id] === '') {
                // Signed in, never signed out — left before closing time, or
                // walked past the desk. The day was not completed.
                policy_log($id, 'member', 'no_checkout', $d, 'Signed in but never signed out.');
                if (policy_log($id, 'member', 'absence', $d, 'Incomplete day — no sign-out.')) $absences++;
            }
        }
        setting_set('policy_member_swept_through', $d, 'system');
    }
    $touched = db_all("SELECT DISTINCT personId FROM infractions WHERE personType = 'member' AND date >= ? AND date <= ?", [$days[0], $days[count($days) - 1]]);
    foreach ($touched as $t) policy_apply((string)$t['personId'], 'member');

    return ['ok' => true, 'days' => count($days), 'absences' => $absences, 'swept' => $days[count($days) - 1], 'evaluated' => count($touched)];
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
        'infractions' => db_all('SELECT * FROM infractions WHERE personId = ? ORDER BY date DESC, id DESC LIMIT 200', [$id]),
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
function policy_relift(string $personId, string $type): int {
    $cfg = policy_for($type);
    $counts = policy_counts($personId);
    $lifted = 0;
    foreach (db_all("SELECT * FROM sanctions WHERE personId = ? AND status IN ('active','proposed') AND issuedBy = 'system'", [$personId]) as $s) {
        $tier = (int)$s['tier'];
        $kind = (string)$s['kind'];
        $holds = true;
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

/** Close out a sanction: pay a fine, serve a suspension, clear dormancy, or
 *  overturn any of them on appeal. */
function admin_policy_sanction_update(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;   // either desk may open it; the write is re-gated per person below
    $sid = (int)($p['sanctionId'] ?? 0);
    $status = (string)($p['status'] ?? '');
    // 'active' on a proposed suspension/eviction is the admin confirming it.
    if (!$sid || !in_array($status, ['active', 'proposed', 'paid', 'served', 'cleared', 'waived', 'lifted'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $s = db_row('SELECT * FROM sanctions WHERE id = ?', [$sid]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    $pg = policy_subject_gate($g['requester'], (string)$s['personId']); if (!$pg['ok']) return $pg;
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
    $tally = ['evicted' => 0, 'suspended' => 0, 'dormant' => 0, 'warned' => 0, 'finesOwed' => 0, 'awaitingReview' => 0];
    foreach ($rows as $r) {
        if (isset($tally[$r['state']])) $tally[$r['state']]++;
        $tally['finesOwed'] += (int)$r['finesOwed'];
        if (!empty($r['awaitingReview'])) $tally['awaitingReview']++;
    }
    // Anything waiting on a human sorts to the top of its band — that is the
    // work this board exists to hand over.
    usort($rows, fn($a, $b) => [$rank[$a['state']], $a['awaitingReview'] ? 0 : 1] <=> [$rank[$b['state']], $b['awaitingReview'] ? 0 : 1]);
    $pol = policy_settings();
    return ['ok' => true, 'board' => $rows, 'tally' => $tally,
            'policyEnabled' => !empty($pol['enabled']), 'autoEnforce' => !empty($pol['autoEnforce']),
            'memberPolicyEnabled' => !empty($pol['member']['enabled'])];
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
