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

function programme_settings(): array {
    $cfg = setting_get('programme');
    $p = (is_array($cfg) ? $cfg : []) + PROGRAMME_DEFAULTS;
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
    $dow = (int)date('N', (int)strtotime($date . ' 00:00:00 UTC'));
    return in_array($dow, $cfg['weekdays'], true);
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
    $start = $cfg['startDate'];
    if ($start === '') return [];
    $end = $cfg['endDate'] !== '' && $cfg['endDate'] < $today ? $cfg['endDate'] : $today;
    return programme_days_between($start, $end, $cfg);
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
    'musing' => ['enabled' => true, 'endsAt' => '08:00'],  // §"The Musing Period"
    'idCard' => ['secondOffenceFine' => 1000, 'lostFine' => 2000],
    'reinstatement' => ['coolOffDays' => 365, 'fine' => 10000, 'training' => 'CIMC 1'],
];

function policy_settings(): array {
    $cfg = setting_get('policy');
    $p = (is_array($cfg) ? $cfg : []) + POLICY_DEFAULTS;
    foreach (['student', 'volunteer', 'musing', 'idCard', 'reinstatement'] as $k) {
        $p[$k] = (array)($p[$k] ?? []) + POLICY_DEFAULTS[$k];
    }
    return $p;
}

/** Per-member-type block, with 'student' as the fallback for unknown types. */
function policy_for(string $type): array {
    $p = policy_settings();
    return $type === 'volunteer' ? $p['volunteer'] : $p['student'];
}

function policy_hhmm(string $v, string $fallback): string {
    $v = trim($v);
    return preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $v) ? $v : $fallback;
}

function policy_settings_save(array $in, string $by): array {
    $cur = policy_settings();
    $clean = [
        'enabled'          => array_key_exists('enabled', $in) ? !empty($in['enabled']) : !empty($cur['enabled']),
        'checkoutRequired' => array_key_exists('checkoutRequired', $in) ? !empty($in['checkoutRequired']) : !empty($cur['checkoutRequired']),
    ];
    foreach (['student', 'volunteer'] as $type) {
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
function attendance_today(): string {
    $cfg = attendance_settings();
    return gmdate('Y-m-d', time() + (int)$cfg['tzOffset'] * 60);
}

/** Minutes past local midnight, now. */
function attendance_now_minutes(): int {
    $cfg = attendance_settings();
    $t = time() + (int)$cfg['tzOffset'] * 60;
    return (int)gmdate('G', $t) * 60 + (int)gmdate('i', $t);
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
            'personId' => $personId, 'personType' => $type === 'volunteer' ? 'volunteer' : 'student',
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
            'personId' => $personId, 'personType' => $type === 'volunteer' ? 'volunteer' : 'student',
            'kind' => $kind, 'tier' => $tier,
            'reason' => substr((string)($extra['reason'] ?? ''), 0, 240),
            'amount' => (int)($extra['amount'] ?? 0),
            'startsAt' => (string)($extra['startsAt'] ?? $now),
            'endsAt' => (string)($extra['endsAt'] ?? ''),
            'status' => (string)($extra['status'] ?? 'active'),
            'issuedBy' => substr((string)($extra['issuedBy'] ?? 'system'), 0, 64),
            'issuedAt' => $now, 'createdAt' => $now,
        ]);
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
        event_emit('policy.sanction', ['ref' => $personId, 'kind' => $kind, 'tier' => $tier, 'personType' => $type, 'reason' => (string)($extra['reason'] ?? ''), 'reissued' => true]);
        return true;
    }
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
    $fines = []; $evictedAt = ''; $suspendedFrom = '';
    foreach ($sanctions as $s) {
        $kind = (string)$s['kind'];
        $status = (string)$s['status'];
        if ($kind === 'fine' && in_array($status, ['active', 'pending'], true)) $fines[] = $s;
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
        foreach (db_all("SELECT personId, kind, endsAt, amount, reason FROM sanctions WHERE personId IN ($ph) AND status IN ('active','pending')", $chunk) as $r) {
            $live[(string)$r['personId']][] = $r;
        }
        foreach ($chunk as $id) {
            $c = ($counts[$id] ?? []) + array_fill_keys(POLICY_INFRACTIONS, 0);
            $abs = $c['absence'] + intdiv($c['halfday'], 2);
            $state = 'clear'; $until = ''; $owed = 0;
            foreach ($live[$id] ?? [] as $s) {
                $kind = (string)$s['kind'];
                if ($kind === 'fine') { $owed += (int)$s['amount']; continue; }
                if ($kind === 'eviction') { $state = 'evicted'; }
                elseif ($kind === 'suspension' && $state !== 'evicted') {
                    $ends = (string)$s['endsAt'];
                    if ($ends === '' || substr($ends, 0, 10) >= $today) { $state = 'suspended'; $until = $ends; }
                } elseif ($kind === 'dormant' && !in_array($state, ['evicted', 'suspended'], true)) $state = 'dormant';
                elseif ($kind === 'warning' && $state === 'clear') $state = 'warned';
            }
            $out[$id] = [
                'state' => $state, 'until' => $until,
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
        if (policy_issue($personId, $type, 'eviction', $abs, [
            'reason' => "Absence {$abs} — past the {$limit}-absence limit. Automatic eviction under §1.1.",
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
            'reason' => "{$lates} lateness logs (cap {$cap}) — automatic {$days}-day institutional suspension.",
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
    if (empty(policy_settings()['enabled'])) return ['ok' => true];
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
function policy_punctuality(string $type): array {
    $soft = attendance_punctuality($type);          // resumption + grace
    $pol = policy_settings();
    $out = ['status' => $soft['status'], 'lateMinutes' => (int)$soft['lateMinutes'], 'redline' => 0, 'halfDay' => 0];
    if (empty($pol['enabled'])) return $out;
    $cfg = policy_for($type);
    $now = attendance_now_minutes();
    if ($now >= policy_minutes((string)$cfg['lateRedline'])) {
        $out['status'] = 'late'; $out['redline'] = 1;
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
    if (empty(policy_settings()['enabled'])) return [];
    if (!programme_is_day($date)) return [];        // a scan on a closed day is not late
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
    $start = $last !== ''
        ? gmdate('Y-m-d', (int)strtotime($last . ' 00:00:00 UTC') + 86400)
        : (string)$cfg['startDate'];
    if ($start === '' || $start > $end) return ['ok' => true, 'days' => 0, 'absences' => 0, 'swept' => $last];

    // Catch up at most a fortnight per run so a long outage cannot turn one
    // cron tick into a multi-thousand-row write.
    $days = array_slice(programme_days_between($start, $end, $cfg), 0, 14);
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

// ── Admin endpoints ─────────────────────────────────────────────────────────

/** Everything the Policy screen needs in one round trip. */
function admin_policy_settings(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $cfg = programme_settings();
    $today = attendance_today();
    $elapsed = programme_days_elapsed($today, $cfg);
    return ['ok' => true,
        'programme' => $cfg,
        'policy' => policy_settings(),
        'attendance' => attendance_settings(),
        'calendar' => [
            'today' => $today,
            'isProgrammeDay' => programme_is_day($today, $cfg),
            'nextDay' => programme_next_day($today, $cfg),
            'elapsed' => count($elapsed),
            'total' => count(programme_days_between((string)$cfg['startDate'], (string)$cfg['endDate'], $cfg)),
            'sweptThrough' => (string)(setting_raw('policy_swept_through') ?? ''),
            'upcoming' => array_slice(programme_days_between($today, gmdate('Y-m-d', (int)strtotime($today . ' 00:00:00 UTC') + 45 * 86400), $cfg), 0, 14),
        ],
    ];
}

function admin_policy_save(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $out = [];
    if (is_array($p['programme'] ?? null)) $out['programme'] = programme_settings_save($p['programme'], (string)$g['requester']['memberId']);
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
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $id = trim((string)($p['personId'] ?? ''));
    if ($id === '') return ['ok' => false, 'error' => 'bad_person'];
    $type = (string)($p['personType'] ?? '') ?: (db_row('SELECT 1 x FROM volunteers WHERE volunteerId = ?', [$id]) ? 'volunteer' : 'student');
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
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $id = trim((string)($p['personId'] ?? ''));
    $kind = trim((string)($p['kind'] ?? ''));
    $manual = ['idcard_missing', 'idcard_lost', 'review_missed', 'misconduct'];
    if ($id === '' || !in_array($kind, $manual, true)) return ['ok' => false, 'error' => 'bad_infraction'];
    $type = (string)($p['personType'] ?? '') ?: (db_row('SELECT 1 x FROM volunteers WHERE volunteerId = ?', [$id]) ? 'volunteer' : 'student');
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
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $iid = (int)($p['infractionId'] ?? 0);
    $reason = trim((string)($p['reason'] ?? ''));
    if (!$iid || $reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $row = db_row('SELECT * FROM infractions WHERE id = ?', [$iid]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
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
    foreach (db_all("SELECT * FROM sanctions WHERE personId = ? AND status = 'active' AND issuedBy = 'system'", [$personId]) as $s) {
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
            $lifted++;
        }
    }
    policy_apply($personId, $type);
    return $lifted;
}

/** Close out a sanction: pay a fine, serve a suspension, clear dormancy, or
 *  overturn any of them on appeal. */
function admin_policy_sanction_update(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $sid = (int)($p['sanctionId'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!$sid || !in_array($status, ['active', 'paid', 'served', 'cleared', 'waived', 'lifted'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $s = db_row('SELECT * FROM sanctions WHERE id = ?', [$sid]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    db_update('sanctions', [
        'status' => $status,
        'clearedAt' => $status === 'active' ? '' : now_iso(),
        'clearedBy' => $status === 'active' ? '' : (string)$g['requester']['memberId'],
        'note' => substr((string)($p['note'] ?? ''), 0, 240),
    ], ['id' => $sid]);
    audit('policy.sanction.update', (string)$g['requester']['memberId'], (string)$s['personId'], ['sanctionId' => $sid, 'kind' => $s['kind'], 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'state' => policy_state((string)$s['personId'], (string)$s['personType'])];
}

/** Issue a sanction by hand — §2.3 dormancy for declining energy, or a
 *  discretionary suspension/eviction that no counter can infer. */
function admin_policy_sanction_issue(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $id = trim((string)($p['personId'] ?? ''));
    $kind = (string)($p['kind'] ?? '');
    $reason = trim((string)($p['reason'] ?? ''));
    if ($id === '' || !in_array($kind, POLICY_SANCTIONS, true) || $reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $type = (string)($p['personType'] ?? '') ?: (db_row('SELECT 1 x FROM volunteers WHERE volunteerId = ?', [$id]) ? 'volunteer' : 'student');
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
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $id = trim((string)($p['personId'] ?? ''));
    if ($id === '') return ['ok' => false, 'error' => 'bad_person'];
    $type = (string)($p['personType'] ?? '') ?: (db_row('SELECT 1 x FROM volunteers WHERE volunteerId = ?', [$id]) ? 'volunteer' : 'student');
    $r = policy_settings()['reinstatement'];
    $ev = db_row("SELECT * FROM sanctions WHERE personId = ? AND kind = 'eviction' AND status = 'active' ORDER BY issuedAt DESC LIMIT 1", [$id]);
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
    foreach (db_all("SELECT id FROM sanctions WHERE personId = ? AND status = 'active'", [$id]) as $s) {
        db_update('sanctions', ['status' => 'cleared', 'clearedAt' => now_iso(), 'clearedBy' => (string)$g['requester']['memberId']], ['id' => (int)$s['id']]);
    }
    audit('policy.reinstate', (string)$g['requester']['memberId'], $id, ['daysServed' => $since, 'override' => $override], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'reinstated' => true, 'override' => $override && (bool)$unmet, 'state' => policy_state($id, $type)];
}

/** The compliance board — everyone who is not clear, worst first. */
function admin_policy_board(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $rows = [];
    $names = [];
    foreach (db_all("SELECT studentId id, fullName FROM summer_students WHERE status = 'active'") as $r) $names[(string)$r['id']] = ['name' => (string)$r['fullName'], 'type' => 'student'];
    foreach (db_all("SELECT volunteerId id, fullName FROM volunteers WHERE status = 'active'") as $r) $names[(string)$r['id']] = ['name' => (string)$r['fullName'], 'type' => 'volunteer'];
    // Only people with something on their ledger — a clean roster costs nothing.
    $ids = db_all("SELECT DISTINCT personId FROM infractions WHERE voidedAt IS NULL OR voidedAt = ''");
    foreach (db_all("SELECT DISTINCT personId FROM sanctions WHERE status = 'active'") as $r) $ids[] = $r;
    $seen = [];
    foreach ($ids as $r) {
        $id = (string)$r['personId'];
        if ($id === '' || isset($seen[$id])) continue;
        $seen[$id] = true;
        $meta = $names[$id] ?? ['name' => $id, 'type' => 'student'];
        $st = policy_state($id, $meta['type']);
        if ($st['state'] === 'clear' && !$st['lates'] && !$st['absences'] && !$st['finesOwed']) continue;
        $rows[] = ['personId' => $id, 'fullName' => $meta['name'], 'personType' => $meta['type']] + $st;
    }
    $rank = ['evicted' => 0, 'suspended' => 1, 'dormant' => 2, 'warned' => 3, 'clear' => 4];
    usort($rows, fn($a, $b) => [$rank[$a['state']], -$a['absences'], -$a['lates']] <=> [$rank[$b['state']], -$b['absences'], -$b['lates']]);
    $tally = ['evicted' => 0, 'suspended' => 0, 'dormant' => 0, 'warned' => 0, 'finesOwed' => 0];
    foreach ($rows as $r) { if (isset($tally[$r['state']])) $tally[$r['state']]++; $tally['finesOwed'] += (int)$r['finesOwed']; }
    return ['ok' => true, 'board' => $rows, 'tally' => $tally, 'policyEnabled' => !empty(policy_settings()['enabled'])];
}

/** Run the absence sweep on demand — the "catch up now" button beside the
 *  automatic web-cron run. */
function admin_policy_sweep(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $r = policy_sweep_absences();
    audit('policy.sweep', (string)$g['requester']['memberId'], '', $r, (string)($p['ip'] ?? ''));
    return $r;
}
