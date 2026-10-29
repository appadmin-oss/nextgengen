<?php
declare(strict_types=1);

/**
 * Make.com — the processes that wait on a person.
 *
 * NGG already speaks outward (the bus: Google Chat, signed webhooks, the Sheets
 * mirror). What it could not do is hear an answer, keep time on a quiet
 * weekend, or wait three days for somebody to reply. Make does those three
 * things; NGG keeps every rule. So this file is deliberately thin:
 *
 *   OUT  events Make subscribes to (signed, through the existing bus)
 *        private.attendance.absences   one per centre per day — who to ask
 *        private.registration.stalled  the guardian and the consent link
 *        safeguarding.flag             a reference and a severity, no child
 *        edition.milestone             a Summer School date has arrived
 *        absence.reason / safeguarding.acknowledged — what came back
 *
 *   IN   api/hooks/make.php, signed with hooks.make_secret, one `action` each:
 *        absence.reason       a guardian's answer to "why were they away?"
 *        safeguarding.ack     somebody has taken a flag
 *        safeguarding.status  has anybody? (the escalation ladder asks this)
 *        registration.status  has the guardian consented yet?
 *        editions             the season's dates, read live — never copied
 *        impact               a month's numbers, aggregates only
 *        jobs                 how long since each background job last ran
 *
 * What never comes in through here: consent itself (several explicit answers
 * on NGG's own form, not a chat button), a sanction, a fee, a card. A reason
 * is recorded beside the absence; whether it excuses the absence stays a
 * person's call on the conduct screen.
 */

const MAKE_ABSENCE_REASONS = ['sick', 'travelled', 'family', 'other'];
/** How far back an absence is still worth asking about. */
const MAKE_ABSENCE_ASK_DAYS = 3;
/** How long a guardian's answer is accepted after the question went out. */
const MAKE_ABSENCE_ANSWER_DAYS = 14;
/** At most this many asks a run — one centre-day is rarely more than a class. */
const MAKE_ABSENCE_MAX = 500;
/** The background jobs and the interval each should keep (seconds). */
const MAKE_JOBS = ['deliver' => 60, 'reminders' => 900, 'maint' => 3600, 'editions' => 21600, 'accrue' => 86400];

/** True when an active integration names $kind exactly — the only way a
 *  `private.` event is delivered, so with none there is nothing to build. */
function make_has_subscriber(string $kind): bool {
    foreach (db_all("SELECT events FROM integrations WHERE status = 'active'") as $i) {
        if (in_array($kind, json_decode((string)$i['events'], true) ?: [], true)) return true;
    }
    return false;
}

function make_first_name(string $full): string {
    return explode(' ', trim($full))[0] ?? '';
}

/* ── Out: absences, one event per centre per day ─────────────────────────── */

/**
 * Turn the absences the nightly sweep logged into questions for guardians.
 *
 * Each absence is asked about once (absence_asks.infractionId is unique), only
 * while it is recent, and only for a child — a volunteer is an adult and is not
 * asked through a guardian. An absence with no usable guardian number is
 * recorded as `no_contact` so it is not reconsidered every hour.
 */
function make_absences_run(): array {
    if (!make_has_subscriber('private.attendance.absences')) return ['ok' => true, 'skipped' => 'no_subscriber'];
    $since = gmdate('Y-m-d', (int)strtotime(attendance_today() . ' 00:00:00 UTC') - MAKE_ABSENCE_ASK_DAYS * 86400);
    $rows = db_all("SELECT i.id, i.personId, i.personType, i.date FROM infractions i
                    LEFT JOIN absence_asks a ON a.infractionId = i.id
                    WHERE i.kind = 'absence' AND COALESCE(i.voidedAt, '') = '' AND i.date >= ?
                      AND i.personType IN ('student', 'member') AND a.id IS NULL
                    ORDER BY i.date, i.id LIMIT " . MAKE_ABSENCE_MAX, [$since]);
    if (!$rows) return ['ok' => true, 'asked' => 0, 'events' => 0];

    $byType = ['student' => [], 'member' => []];
    foreach ($rows as $r) $byType[(string)$r['personType']][] = (string)$r['personId'];
    $people = [];
    foreach (array_chunk(array_unique($byType['student']), 400) as $ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT studentId id, fullName, centre, guardianName gName, guardianPhone gPhone FROM summer_students WHERE studentId IN ($in)", $ids) as $p) $people['student:' . $p['id']] = $p;
    }
    foreach (array_chunk(array_unique($byType['member']), 400) as $ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT memberId id, fullName, centre, parentName gName, parentPhone gPhone FROM members WHERE memberId IN ($in)", $ids) as $p) $people['member:' . $p['id']] = $p;
    }

    $groups = []; $asked = 0; $noContact = 0; $now = now_iso();
    foreach ($rows as $r) {
        $p = $people[$r['personType'] . ':' . $r['personId']] ?? null;
        $phone = $p ? sms_normalize((string)$p['gPhone']) : '';
        $ref = 'AB-' . strtoupper(rand_hex(6));
        db_insert('absence_asks', [
            'ref' => $ref, 'infractionId' => (int)$r['id'], 'personId' => (string)$r['personId'],
            'personType' => (string)$r['personType'], 'date' => (string)$r['date'],
            'centre' => (string)($p['centre'] ?? ''), 'status' => $phone === '' ? 'no_contact' : 'asked',
            'askedAt' => $now,
        ]);
        if ($phone === '') { $noContact++; continue; }
        $key = ($p['centre'] ?? '') . '|' . $r['date'];
        $groups[$key][] = [
            'ref' => $ref, 'personType' => (string)$r['personType'],
            'firstName' => make_first_name((string)$p['fullName']),
            'guardianName' => (string)($p['gName'] ?? ''), 'guardianPhone' => $phone,
        ];
        $asked++;
    }
    foreach ($groups as $key => $items) {
        [$centre, $date] = explode('|', $key, 2);
        event_emit('private.attendance.absences', ['centre' => $centre, 'date' => $date, 'count' => count($items),
            'reasons' => MAKE_ABSENCE_REASONS, 'items' => $items]);
    }
    return ['ok' => true, 'asked' => $asked, 'noContact' => $noContact, 'events' => count($groups)];
}

/** Attach the guardian's answer to absence rows for the conduct screens. */
function absence_reasons_attach(array $infractions): array {
    $ids = array_values(array_filter(array_map(fn($r) => ($r['kind'] ?? '') === 'absence' ? (int)$r['id'] : 0, $infractions)));
    if (!$ids) return $infractions;
    $in = implode(',', array_fill(0, count($ids), '?'));
    $by = [];
    foreach (db_all("SELECT infractionId, reason, note, channel, answeredAt FROM absence_asks WHERE status = 'answered' AND infractionId IN ($in)", $ids) as $a) $by[(int)$a['infractionId']] = $a;
    foreach ($infractions as &$r) {
        $a = $by[(int)($r['id'] ?? 0)] ?? null;
        $r['guardianReason'] = $a ? [
            'reason' => (string)$a['reason'], 'note' => (string)$a['note'],
            'channel' => (string)$a['channel'], 'at' => (string)$a['answeredAt'],
        ] : null;
    }
    unset($r);
    return $infractions;
}

/* ── Out: the stalled consent, with what is needed to chase it ───────────── */

/** The guardian's number and their consent link, to the one destination that
 *  names this event. The public `registration.stalled` stays as it was. */
function make_registration_stalled_emit(array $s, int $hoursPending): void {
    if (empty($s['verifyToken']) || !make_has_subscriber('private.registration.stalled')) return;
    $phone = sms_normalize((string)($s['guardianPhone'] ?? ''));
    if ($phone === '') return;
    event_emit('private.registration.stalled', [
        'ref' => (string)$s['studentId'], 'firstName' => make_first_name((string)$s['fullName']),
        'centre' => (string)($s['centre'] ?? ''), 'guardianName' => (string)($s['guardianName'] ?? ''),
        'guardianPhone' => $phone, 'hoursPending' => $hoursPending,
        'verifyUrl' => rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/verify?t=' . $s['verifyToken'],
    ]);
}

/* ── Out: Summer School dates as they arrive ─────────────────────────────── */

/**
 * Fire each milestone once per edition, from the edition's own dates.
 *
 *   starts_in_42  re-enrolment invitations       ends_in_7  certificates, feedback
 *   starts_in_14  rota confirmations, photos     ended      the season report
 *   started
 *
 * A milestone already overtaken when the dates were set is skipped, not fired
 * late: an edition created ten days out does not send "six weeks to go".
 */
function make_edition_milestones_run(): array {
    $today = attendance_today();
    $t = (int)strtotime($today . ' 00:00:00 UTC');
    $fired = 0;
    foreach (db_all("SELECT * FROM summer_cohorts WHERE status IN ('planning', 'active', 'closed') AND COALESCE(startDate, '') <> '' AND COALESCE(endDate, '') <> ''") as $e) {
        $toStart = (int)floor(((int)strtotime($e['startDate'] . ' 00:00:00 UTC') - $t) / 86400);
        $toEnd = (int)floor(((int)strtotime($e['endDate'] . ' 00:00:00 UTC') - $t) / 86400);
        $due = null;
        if ($toStart > 14 && $toStart <= 42) $due = 'starts_in_42';
        elseif ($toStart > 0 && $toStart <= 14) $due = 'starts_in_14';
        elseif ($toStart <= 0 && $toEnd > 7) $due = 'started';
        elseif ($toEnd >= 0 && $toEnd <= 7) $due = 'ends_in_7';
        elseif ($toEnd < 0 && $toEnd >= -30) $due = 'ended';
        if ($due === null) continue;
        $id = (string)$e['cohortId'];
        if (db_row('SELECT cohortId FROM edition_milestones WHERE cohortId = ? AND milestone = ? LIMIT 1', [$id, $due])) continue;
        db_insert('edition_milestones', ['cohortId' => $id, 'milestone' => $due, 'firedAt' => now_iso()]);
        event_emit('edition.milestone', ['editionId' => $id, 'name' => (string)($e['name'] ?? ''), 'milestone' => $due,
            'startDate' => (string)$e['startDate'], 'endDate' => (string)$e['endDate'],
            'daysToStart' => $toStart, 'daysToEnd' => $toEnd]);
        $fired++;
    }
    return ['ok' => true, 'fired' => $fired];
}

/** The hourly ride on maintenance — each half guarded so one cannot cost the other. */
function make_run(): void {
    foreach (['make_absences_run', 'make_edition_milestones_run'] as $fn) {
        try { $fn(); }
        catch (Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'make:' . $fn, $e->getMessage()); }
    }
}

/* ── In: one signed door, named actions ──────────────────────────────────── */

function hooks_make(array $p): array {
    $action = (string)($p['action'] ?? '');
    $map = [
        'absence.reason'      => 'make_absence_reason',
        'safeguarding.ack'    => 'make_safeguarding_ack',
        'safeguarding.status' => 'make_safeguarding_status',
        'registration.status' => 'make_registration_status',
        'editions'            => 'make_editions',
        'impact'              => 'make_impact',
        'jobs'                => 'make_jobs',
    ];
    if (!isset($map[$action])) return ['ok' => false, 'error' => 'unknown_action', 'actions' => array_keys($map)];
    return ($map[$action])($p);
}

function make_clip(array $p, string $k, int $n): string {
    return mb_substr(trim((string)($p[$k] ?? '')), 0, $n);
}

/** A guardian's answer. A later answer replaces an earlier one (they may
 *  correct a mis-tap); an answer to an absence since voided is still kept. */
function make_absence_reason(array $p): array {
    $ref = make_clip($p, 'ref', 24);
    $reason = strtolower(make_clip($p, 'reason', 16));
    if (!in_array($reason, MAKE_ABSENCE_REASONS, true)) return ['ok' => false, 'error' => 'bad_reason', 'reasons' => MAKE_ABSENCE_REASONS];
    $a = db_row('SELECT * FROM absence_asks WHERE ref = ? LIMIT 1', [$ref]);
    if (!$a || $a['status'] === 'no_contact') return ['ok' => false, 'error' => 'not_found'];
    if (time() - (int)strtotime((string)$a['askedAt']) > MAKE_ABSENCE_ANSWER_DAYS * 86400) return ['ok' => false, 'error' => 'too_late'];
    $channel = make_clip($p, 'channel', 24) ?: 'make';
    db_update('absence_asks', ['status' => 'answered', 'reason' => $reason, 'note' => make_clip($p, 'note', 300),
        'channel' => $channel, 'messageId' => make_clip($p, 'messageId', 120), 'answeredAt' => now_iso()], ['ref' => $ref]);
    audit('absence.reason', null, (string)$a['personId'], ['ref' => $ref, 'date' => $a['date'], 'reason' => $reason, 'channel' => $channel], (string)($p['ip'] ?? ''));
    event_emit('absence.reason', ['ref' => $ref, 'centre' => (string)$a['centre'], 'date' => (string)$a['date'], 'reason' => $reason]);
    return ['ok' => true, 'ref' => $ref, 'reason' => $reason, 'replaced' => $a['status'] === 'answered'];
}

/** Somebody has the flag. The first acknowledgement stands; a second says so. */
function make_safeguarding_ack(array $p): array {
    $ref = make_clip($p, 'ref', 64);
    $by = make_clip($p, 'by', 80);
    if ($by === '') return ['ok' => false, 'error' => 'by_required'];
    $f = db_row('SELECT * FROM safeguarding_flags WHERE ref = ? LIMIT 1', [$ref]);
    if (!$f) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$f['ackAt'] !== '') return ['ok' => true, 'ref' => $ref, 'already' => true, 'ackBy' => (string)$f['ackBy'], 'ackAt' => (string)$f['ackAt']];
    $channel = make_clip($p, 'channel', 24) ?: 'make';
    $at = now_iso();
    db_update('safeguarding_flags', ['ackAt' => $at, 'ackBy' => $by, 'ackChannel' => $channel, 'ackMessageId' => make_clip($p, 'messageId', 120)], ['ref' => $ref]);
    audit('safeguarding.ack', null, $ref, ['by' => $by, 'channel' => $channel], (string)($p['ip'] ?? ''));
    event_emit('safeguarding.acknowledged', ['ref' => $ref, 'severity' => (string)$f['severity'], 'centre' => (string)$f['centre'], 'by' => $by, 'channel' => $channel]);
    return ['ok' => true, 'ref' => $ref, 'already' => false, 'ackBy' => $by, 'ackAt' => $at];
}

/** Acknowledged through Make, or reviewed on the Behaviour screen — either
 *  means a person has it, and the ladder must stop. */
function make_safeguarding_status(array $p): array {
    $ref = make_clip($p, 'ref', 64);
    $f = db_row('SELECT * FROM safeguarding_flags WHERE ref = ? LIMIT 1', [$ref]);
    if (!$f) return ['ok' => false, 'error' => 'not_found'];
    $rev = db_row("SELECT reviewedAt FROM behaviour_logs WHERE logId = ? AND status = 'reviewed' LIMIT 1", [$ref]);
    $reviewedAt = (string)($rev['reviewedAt'] ?? '');
    return ['ok' => true, 'ref' => $ref, 'severity' => (string)$f['severity'], 'flaggedAt' => (string)$f['flaggedAt'],
        'acknowledged' => (string)$f['ackAt'] !== '' || $reviewedAt !== '',
        'ackBy' => (string)$f['ackBy'], 'ackAt' => (string)$f['ackAt'], 'reviewedAt' => $reviewedAt];
}

function make_registration_status(array $p): array {
    $s = db_row('SELECT regStatus, enrolledAt FROM summer_students WHERE studentId = ? LIMIT 1', [make_clip($p, 'ref', 64)]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    $status = (string)($s['regStatus'] ?? '');
    return ['ok' => true, 'status' => $status, 'verified' => $status === 'verified',
        'hoursPending' => $status === 'parent_pending' ? (int)((time() - ((int)strtotime((string)$s['enrolledAt']) ?: time())) / 3600) : 0];
}

/** The season's dates, read from NGG every time — a calendar typed into Make
 *  would be a second calendar, and the two would disagree within a season. */
function make_editions(array $p): array {
    $rows = db_all("SELECT * FROM summer_cohorts WHERE status <> 'archived' ORDER BY COALESCE(startDate, '') DESC LIMIT 12");
    $out = [];
    foreach ($rows as $e) {
        $r = summer_edition_row($e);
        unset($r['notes']);
        $out[] = $r;
    }
    return ['ok' => true, 'today' => attendance_today(), 'editions' => $out];
}

/**
 * A month in numbers, per centre and in total. Counts only — no name, no id,
 * no contact — so a report built from it can go to a funder as it is.
 *
 * attendanceRate = check-ins / (check-ins + absences logged), over the people
 * the programme expected: the nightly sweep logs an absence only for somebody
 * who was due that day, so the two together are the days that should have
 * been attended. Voided absences are excluded.
 */
function make_impact(array $p): array {
    $month = make_clip($p, 'month', 7);
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) $month = gmdate('Y-m', (int)strtotime('first day of last month'));
    $from = $month . '-01';
    $to = gmdate('Y-m-t', (int)strtotime($from . ' 00:00:00 UTC'));

    $centreOf = "COALESCE(NULLIF(a.centre, ''), m.centre, s.centre, v.centre, '')";
    $att = db_all("SELECT $centreOf centre, COUNT(*) checkIns, COUNT(DISTINCT a.studentId) people
                   FROM attendance a
                   LEFT JOIN members m ON m.memberId = a.studentId
                   LEFT JOIN summer_students s ON s.studentId = a.studentId
                   LEFT JOIN volunteers v ON v.volunteerId = a.studentId
                   WHERE a.date >= ? AND a.date <= ? GROUP BY $centreOf", [$from, $to]);
    $abs = db_all("SELECT COALESCE(m.centre, s.centre, v.centre, '') centre, COUNT(*) n
                   FROM infractions i
                   LEFT JOIN members m ON m.memberId = i.personId
                   LEFT JOIN summer_students s ON s.studentId = i.personId
                   LEFT JOIN volunteers v ON v.volunteerId = i.personId
                   WHERE i.kind = 'absence' AND COALESCE(i.voidedAt, '') = '' AND i.date >= ? AND i.date <= ?
                   GROUP BY COALESCE(m.centre, s.centre, v.centre, '')", [$from, $to]);
    $reasons = db_all("SELECT reason, COUNT(*) n FROM absence_asks WHERE status = 'answered' AND date >= ? AND date <= ? GROUP BY reason", [$from, $to]);

    $centres = [];
    foreach ($att as $r) $centres[(string)$r['centre']] = ['centre' => (string)$r['centre'], 'checkIns' => (int)$r['checkIns'], 'people' => (int)$r['people'], 'absences' => 0];
    foreach ($abs as $r) {
        $c = (string)$r['centre'];
        $centres[$c] = ($centres[$c] ?? ['centre' => $c, 'checkIns' => 0, 'people' => 0, 'absences' => 0]);
        $centres[$c]['absences'] = (int)$r['n'];
    }
    $rate = fn(int $in, int $out) => ($in + $out) > 0 ? round(100 * $in / ($in + $out), 1) : null;
    foreach ($centres as &$c) $c['attendanceRate'] = $rate($c['checkIns'], $c['absences']);
    unset($c);
    ksort($centres);
    $checkIns = array_sum(array_column($centres, 'checkIns'));
    $absences = array_sum(array_column($centres, 'absences'));
    $count = fn(string $sql, array $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);

    return ['ok' => true, 'month' => $month, 'from' => $from, 'to' => $to, 'totals' => [
        'activeMembers'      => $count("SELECT COUNT(*) c FROM members WHERE type = 'NGG' AND status = 'active'"),
        'newMembers'         => $count("SELECT COUNT(*) c FROM members WHERE type = 'NGG' AND COALESCE(NULLIF(joinDate, ''), substr(createdAt, 1, 10)) BETWEEN ? AND ?", [$from, $to]),
        'participants'       => $count("SELECT COUNT(*) c FROM summer_students s JOIN summer_cohorts e ON e.cohortId = s.cohortId
                                         WHERE s.status = 'active' AND COALESCE(e.startDate, '') <= ? AND COALESCE(e.endDate, '9999') >= ?", [$to, $from]),
        'activeVolunteers'   => $count("SELECT COUNT(*) c FROM volunteers WHERE status = 'active'"),
        'activeCentres'      => $count("SELECT COUNT(*) c FROM centres WHERE status = 'active'"),
        'peopleAttended'     => $count("SELECT COUNT(DISTINCT studentId) c FROM attendance WHERE date >= ? AND date <= ?", [$from, $to]),
        'checkIns'           => $checkIns,
        'absences'           => $absences,
        'attendanceRate'     => $rate($checkIns, $absences),
        'completions'        => $count("SELECT COUNT(*) c FROM student_certs WHERE COALESCE(revokedAt, '') = '' AND substr(issuedAt, 1, 10) BETWEEN ? AND ?", [$from, $to]),
        'absenceReasons'     => array_column(array_map(fn($r) => [(string)$r['reason'], (int)$r['n']], $reasons), 1, 0),
    ], 'centres' => array_values($centres)];
}

/** How long since each background job ran, against how often it should. A
 *  job three intervals late is `stale` — the thing a watchdog alerts on. */
function make_jobs(array $p): array {
    $out = [];
    $stale = 0;
    foreach (MAKE_JOBS as $job => $default) {
        $every = web_cron_cfg($job, $default);
        $at = (int)(@filemtime(web_cron_marker($job)) ?: 0);
        $age = $at ? time() - $at : null;
        $isStale = $age === null || $age > max(3 * $every, 300);
        if ($isStale) $stale++;
        $out[] = ['job' => $job, 'everySeconds' => $every, 'lastRunAt' => $at ? gmdate('Y-m-d\TH:i:s\Z', $at) : '', 'ageSeconds' => $age, 'stale' => $isStale];
    }
    return ['ok' => true, 'healthy' => $stale === 0, 'stale' => $stale, 'jobs' => $out];
}
