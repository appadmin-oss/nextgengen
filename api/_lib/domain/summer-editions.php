<?php
declare(strict_types=1);

/**
 * Summer School — EDITIONS and GROUPS.
 *
 * THE VOCABULARY, because it was the problem. Three different things were all
 * called a "cohort" somewhere in this product, and the admin portal put a
 * fourth (the centre directory) behind the Summer School capability:
 *
 *   EDITION  one season of Summer School — "Summer School 2026". Stored in
 *            `summer_cohorts`; its id is the `cohortId` that summer_students,
 *            attendance and qr_codes already carry. That column means EDITION
 *            everywhere, with no exceptions.
 *   GROUP    a class WITHIN an edition — "Egbeda · Music · Morning". Its own
 *            table (`summer_groups`) and its own id. When a coordinator says
 *            "cohort" out loud, this is what they mean, so the product says
 *            GROUP and never says cohort at them.
 *   CENTRE   a PLACE. `centres`. It belongs to NGG the organisation, not to
 *            Summer School: NGG members are posted to one all year round and
 *            its code is the printed ID prefix on their cards. Summer School
 *            RUNS AT centres. It does not own them, and it must not be able to
 *            rename or delete one — see admin_centres_upsert / _delete, which
 *            now gate on `people` for exactly that reason.
 *
 * WHY A GROUP EXISTS AT ALL. An edition's participants were one flat list,
 * filtered by centre and track. That cannot express two Music classes at one
 * centre, cannot be handed to a named lead, cannot carry its own dates, and
 * cannot be reported on — so "how is the Egbeda morning class doing" had no
 * answer and attendance was only ever a centre-wide number.
 *
 * INVARIANTS enforced here (each has a test in api/tests/run.php):
 *   1. At most ONE edition is `active`. Activating another demotes it to
 *      `closed` — never to `archived`, which in this system means "rolled up
 *      and possibly compressed" (see admin_summer_cohort_archive).
 *   2. A group's `code` is unique WITHIN its edition, never globally: last
 *      year's "EG-MUS-AM" is free to mean this year's class.
 *   3. A participant belongs to at most one group, and only to a group in
 *      their OWN edition. Assignment across editions is refused, not coerced.
 *   4. Capacity is a refusal, not a warning: an assignment that would take a
 *      group past its cap fails for the rows that do not fit and says which.
 *   5. Deleting a group with participants is refused unless the caller says
 *      where they go (`reassignTo`, or an explicit unassign).
 */

/** Lifecycle states, in order. `active` is the one edition being run. */
const SUMMER_EDITION_STATES = ['planning', 'active', 'closed', 'archived'];
/** Summer School is a season. Six months is already generous; past that it is
 *  not a summer, it is a typo in a year. */
const SUMMER_EDITION_MAX_DAYS = 183;

/**
 * Invariant 7 — a live edition has a duration.
 *
 * An edition with no dates ran for ever: cards never knew when the season
 * ended, the desk took check-ins in November, and nothing closed it. So
 * activating one needs a start and an end, within SUMMER_EDITION_MAX_DAYS.
 * Planning editions may stay undated while the season is being decided.
 */
function summer_edition_duration_check(string $status, string $start, string $end): ?array {
    if ($status !== 'active') return null;
    if ($start === '' || $end === '') return ['ok' => false, 'error' => 'dates_required',
        'message' => 'Set the season’s start and end dates before making it the active edition.'];
    $days = (int)round((strtotime($end . ' 00:00:00 UTC') - strtotime($start . ' 00:00:00 UTC')) / 86400) + 1;
    if ($days > SUMMER_EDITION_MAX_DAYS) return ['ok' => false, 'error' => 'season_too_long', 'days' => $days, 'max' => SUMMER_EDITION_MAX_DAYS];
    return null;
}

/**
 * Is $date inside the participant's edition? Null when it is (or when the
 * edition is undated — a planning edition, or data from before dates were
 * required), otherwise the refusal the desk shows.
 */
function summer_edition_season_refusal(string $cohortId, string $date): ?array {
    if ($cohortId === '') return null;
    $e = db_row('SELECT name, startDate, endDate FROM summer_cohorts WHERE cohortId = ? LIMIT 1', [$cohortId]);
    if (!$e) return null;
    $start = (string)($e['startDate'] ?? ''); $end = (string)($e['endDate'] ?? '');
    if ($start !== '' && $date < $start) return ['ok' => false, 'error' => 'edition_not_started', 'startDate' => $start, 'edition' => (string)$e['name']];
    if ($end !== '' && $date > $end) return ['ok' => false, 'error' => 'edition_ended', 'endDate' => $end, 'edition' => (string)$e['name']];
    return null;
}

/** When a card issued for this edition stops opening the door: the season's
 *  end if it has one, otherwise the programme's validity clock. */
function summer_edition_card_expiry(string $cohortId): string {
    $end = $cohortId !== '' ? (string)(db_row('SELECT endDate FROM summer_cohorts WHERE cohortId = ? LIMIT 1', [$cohortId])['endDate'] ?? '') : '';
    return $end !== '' ? $end : idcard_expiry_for();
}

/** Close every active edition whose season has ended. Run nightly
 *  (api/tools/run-jobs.php). Closed, never archived — archiving is a roll-up
 *  with its own op (invariant 1). */
function summer_editions_close_elapsed(?string $today = null): array {
    $today = $today ?: attendance_today();
    $rows = db_all("SELECT cohortId, endDate FROM summer_cohorts WHERE status = 'active' AND endDate IS NOT NULL AND endDate <> '' AND endDate < ?", [$today]);
    $closed = [];
    foreach ($rows as $r) {
        db_update('summer_cohorts', ['status' => 'closed', 'updatedAt' => now_iso()], ['cohortId' => (string)$r['cohortId']]);
        audit('summer.edition.status', 'system', (string)$r['cohortId'], ['from' => 'active', 'to' => 'closed', 'why' => 'season ended ' . $r['endDate']], '');
        $closed[] = (string)$r['cohortId'];
    }
    $retired = $closed ? summer_centres_retire_unused() : [];
    return ['closed' => $closed, 'centresRetired' => $retired];
}

/**
 * When a season ends, its centres end with it. A centre that runs ONLY Summer
 * School is retired once no live edition still uses it — no active edition's
 * participant is there and no active edition's group meets there. A centre NGG
 * also runs is never touched: the Club goes on all year. Retiring keeps every
 * record resolving (CLAUDE.md §5 invariant 6); a coordinator brings a venue
 * back for next season from Members → Centres. Returns the names retired.
 */
function summer_centres_retire_unused(): array {
    $live = array_column(db_all("SELECT cohortId FROM summer_cohorts WHERE status = 'active'"), 'cohortId');
    $usedNames = []; $usedIds = [];
    if ($live) {
        $ph = implode(',', array_fill(0, count($live), '?'));
        foreach (db_all("SELECT DISTINCT centre FROM summer_students WHERE cohortId IN ($ph) AND status IN ('active','waitlisted')", $live) as $r) $usedNames[strtolower(trim((string)$r['centre']))] = true;
        foreach (db_all("SELECT DISTINCT centreId FROM summer_groups WHERE cohortId IN ($ph) AND status IN ('planning','active')", $live) as $r) $usedIds[(string)$r['centreId']] = true;
    }
    $out = [];
    foreach (db_all("SELECT centreId, name, programmes FROM centres WHERE status = 'active'") as $c) {
        if (!centre_serves($c, 'summer') || centre_serves($c, 'ngg')) continue;
        if (isset($usedIds[(string)$c['centreId']]) || isset($usedNames[strtolower(trim((string)$c['name']))])) continue;
        db_update('centres', ['status' => 'retired', 'updatedAt' => now_iso()], ['centreId' => (string)$c['centreId']]);
        $out[] = (string)$c['name'];
    }
    if ($out) {
        audit('centre.retire', 'system', '', ['why' => 'Summer School edition ended', 'centres' => $out], '');
        if (function_exists('cache_invalidate')) { try { cache_invalidate('centres'); } catch (\Throwable $e) {} }
    }
    return $out;
}
/** A group's lifecycle mirrors the edition's, minus the singleton rule. */
const SUMMER_GROUP_STATES = ['planning', 'active', 'closed', 'archived'];

/** How many participants one group may hold, whatever an admin types. */
const SUMMER_GROUP_CAPACITY_MAX = 2000;
/** How many participants one bulk assignment may move. */
const SUMMER_ASSIGN_MAX = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Serialisers
// ─────────────────────────────────────────────────────────────────────────────

/** One edition, with the counts a coordinator needs to see it at a glance. */
function summer_edition_row(array $e): array {
    $id = (string)$e['cohortId'];
    $count = fn(string $sql, array $a) => (int)(db_row($sql, $a)['c'] ?? 0);
    return [
        'editionId'     => $id,
        // `cohortId` stays in the payload: it is the column every other summer
        // table joins on, and dropping it would force every caller to rename a
        // field that has not changed meaning.
        'cohortId'      => $id,
        'name'          => (string)($e['name'] ?? ''),
        'code'          => (string)($e['code'] ?? ''),
        'year'          => (int)($e['year'] ?? 0),
        'status'        => (string)($e['status'] ?? 'planning'),
        'startDate'     => (string)($e['startDate'] ?? ''),
        'endDate'       => (string)($e['endDate'] ?? ''),
        'applyOpensAt'  => (string)($e['applyOpensAt'] ?? ''),
        'applyClosesAt' => (string)($e['applyClosesAt'] ?? ''),
        'notes'         => (string)($e['notes'] ?? ''),
        'createdAt'     => (string)($e['createdAt'] ?? ''),
        'updatedAt'     => (string)($e['updatedAt'] ?? ''),
        'groups'        => $count("SELECT COUNT(*) c FROM summer_groups WHERE cohortId = ?", [$id]),
        'participants'  => $count("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND status = 'active'", [$id]),
        'waitlisted'    => $count("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND status = 'waitlisted'", [$id]),
        /* The number that says whether the grouping work has actually been
           done. An edition with 300 participants and 280 grouped is fine; one
           with 300 and 0 means nobody has been placed in a class yet, and no
           per-group report will mean anything. */
        'ungrouped'     => $count("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND status = 'active' AND (groupId IS NULL OR groupId = '')", [$id]),
    ];
}

/** One group, with its fill and its lead resolved for display. */
function summer_group_row(array $r, array $centreById = [], array $leadById = []): array {
    $gid = (string)$r['groupId'];
    $enrolled = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId = ? AND status = 'active'", [$gid])['c'] ?? 0);
    $cap = (int)($r['capacity'] ?? 0);
    $centreId = (string)($r['centreId'] ?? '');
    $centre = $centreById[$centreId] ?? null;
    if ($centreId !== '' && !$centre) $centre = db_row('SELECT centreId, name, code, color FROM centres WHERE centreId = ?', [$centreId]) ?: null;
    return [
        'groupId'   => $gid,
        'editionId' => (string)$r['cohortId'],
        'cohortId'  => (string)$r['cohortId'],
        'name'      => (string)($r['name'] ?? ''),
        'code'      => (string)($r['code'] ?? ''),
        'centreId'  => $centreId,
        'centreName' => $centre ? (string)$centre['name'] : '',
        'centreCode' => $centre ? (string)$centre['code'] : '',
        'centreColor' => $centre ? (string)($centre['color'] ?? '') : '',
        'faculty'   => (string)($r['faculty'] ?? ''),
        'track'     => (string)($r['track'] ?? ''),
        'leadId'    => (string)($r['leadId'] ?? ''),
        'leadName'  => (string)($leadById[(string)($r['leadId'] ?? '')] ?? ''),
        'capacity'  => $cap,
        'meetDays'  => (string)($r['meetDays'] ?? ''),
        'meetTime'  => (string)($r['meetTime'] ?? ''),
        'startDate' => (string)($r['startDate'] ?? ''),
        'endDate'   => (string)($r['endDate'] ?? ''),
        'status'    => (string)($r['status'] ?? 'active'),
        'notes'     => (string)($r['notes'] ?? ''),
        'enrolled'  => $enrolled,
        'seatsLeft' => $cap > 0 ? max(0, $cap - $enrolled) : null,
        'full'      => $cap > 0 && $enrolled >= $cap,
        'fill'      => $cap > 0 ? (int)round($enrolled / $cap * 100) : 0,
        'createdAt' => (string)($r['createdAt'] ?? ''),
        'updatedAt' => (string)($r['updatedAt'] ?? ''),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Editions
// ─────────────────────────────────────────────────────────────────────────────

/** Every edition, newest first, plus which one is current. */
function admin_summer_editions(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    // Guarantees there is always at least one edition to look at.
    $current = summer_ensure_cohort();
    $rows = db_all("SELECT * FROM summer_cohorts ORDER BY year DESC, id DESC");
    return ['ok' => true,
        'editions'  => array_map('summer_edition_row', $rows),
        'currentId' => (string)$current['cohortId'],
        'states'    => SUMMER_EDITION_STATES,
    ];
}

/**
 * Create or update one edition.
 *
 * Supersedes admin_summer_cohort_upsert(), which is kept as a thin delegate so
 * an older client bundle keeps working. Two things this adds beyond a rename:
 * the status is validated against the lifecycle rather than stored as whatever
 * arrived, and demoting the previous active edition writes `closed`, not
 * `archived` — archiving is a data operation with a rollup behind it, and
 * saying a season is archived when nothing was rolled up is a lie the
 * archive op then has to work around.
 */
function admin_summer_edition_save(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $id = trim((string)($d['editionId'] ?? $d['cohortId'] ?? ''));
    $existing = $id !== '' ? db_row('SELECT * FROM summer_cohorts WHERE cohortId = ?', [$id]) : null;

    $year = (int)($d['year'] ?? ($existing['year'] ?? gmdate('Y')));
    if ($year < 2000 || $year > 2200) return ['ok' => false, 'error' => 'bad_year'];
    $name = trim((string)($d['name'] ?? ($existing['name'] ?? '')));
    if ($name === '') $name = 'Summer School ' . $year;
    if (mb_strlen($name) > 120) return ['ok' => false, 'error' => 'name_too_long'];

    $status = (string)($d['status'] ?? ($existing['status'] ?? 'planning'));
    if (!in_array($status, SUMMER_EDITION_STATES, true)) return ['ok' => false, 'error' => 'bad_status'];

    $start = summer_edition_date($d['startDate'] ?? ($existing['startDate'] ?? ''));
    $end   = summer_edition_date($d['endDate'] ?? ($existing['endDate'] ?? ''));
    if ($start === null || $end === null) return ['ok' => false, 'error' => 'bad_date'];
    if ($start !== '' && $end !== '' && $end < $start) return ['ok' => false, 'error' => 'end_before_start'];
    $aOpen  = summer_edition_date($d['applyOpensAt'] ?? ($existing['applyOpensAt'] ?? ''));
    $aClose = summer_edition_date($d['applyClosesAt'] ?? ($existing['applyClosesAt'] ?? ''));
    if ($aOpen === null || $aClose === null) return ['ok' => false, 'error' => 'bad_date'];
    if ($aOpen !== '' && $aClose !== '' && $aClose < $aOpen) return ['ok' => false, 'error' => 'apply_window_inverted'];
    if ($bad = summer_edition_duration_check($status, $start, $end)) return $bad;

    $code = strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', (string)($d['code'] ?? ($existing['code'] ?? ''))) ?? '');
    if ($code === '') $code = 'SS' . substr((string)$year, -2);
    if (strlen($code) > 24) return ['ok' => false, 'error' => 'bad_code' ];
    $notes = mb_substr((string)($d['notes'] ?? ($existing['notes'] ?? '')), 0, 4000);

    $now = now_iso();
    $fields = ['name' => $name, 'code' => $code, 'year' => $year, 'status' => $status,
               'startDate' => $start, 'endDate' => $end,
               'applyOpensAt' => $aOpen, 'applyClosesAt' => $aClose,
               'notes' => $notes, 'updatedAt' => $now];

    if ($existing) {
        db_update('summer_cohorts', $fields, ['cohortId' => $id]);
    } else {
        /* The id is derived from the year, because every other summer table
           already carries it as `cohortId` and a human reading a roster export
           should be able to tell which season a row belongs to. A second
           edition in one year gets a suffix rather than colliding. */
        $id = 'SUM-' . $year;
        if (db_row('SELECT id FROM summer_cohorts WHERE cohortId = ?', [$id])) {
            for ($n = 2; $n < 40; $n++) {
                $try = 'SUM-' . $year . '-' . $n;
                if (!db_row('SELECT id FROM summer_cohorts WHERE cohortId = ?', [$try])) { $id = $try; break; }
            }
        }
        db_insert('summer_cohorts', array_merge($fields, ['cohortId' => $id, 'createdAt' => $now]));
    }

    // Invariant 1 — exactly one active edition.
    $demoted = 0;
    if ($status === 'active') {
        $demoted = db_exec("UPDATE summer_cohorts SET status = 'closed', updatedAt = ? WHERE cohortId != ? AND status = 'active'", [$now, $id]);
    }
    audit('summer.edition.save', $g['requester']['memberId'], $id,
        ['status' => $status, 'demoted' => $demoted], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'editionId' => $id, 'cohortId' => $id, 'demoted' => (int)$demoted];
}

/** Accept '' or YYYY-MM-DD. Returns null for anything else, so a typo is a
 *  refusal rather than a date that silently sorts wrong forever. */
function summer_edition_date($v): ?string {
    $s = trim((string)($v ?? ''));
    if ($s === '') return '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null;
    [$y, $m, $dd] = array_map('intval', explode('-', $s));
    return checkdate($m, $dd, $y) ? $s : null;
}

/** Move one edition along its lifecycle. A separate op from the editor so the
 *  audit trail records "somebody activated the 2026 season" as its own event
 *  rather than as a field change buried in a save. */
function admin_summer_edition_status(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $id = trim((string)($p['editionId'] ?? $p['cohortId'] ?? ''));
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, SUMMER_EDITION_STATES, true)) return ['ok' => false, 'error' => 'bad_status'];
    $e = db_row('SELECT * FROM summer_cohorts WHERE cohortId = ?', [$id]);
    if (!$e) return ['ok' => false, 'error' => 'not_found'];
    /* Archiving is a DATA operation — it rolls each participant's attendance up
       onto their row and can then purge the granular check-ins. Letting a
       status dropdown write 'archived' would leave an edition labelled archived
       with nothing rolled up, which is what the old upsert did. */
    if ($status === 'archived') return ['ok' => false, 'error' => 'use_archive_op'];
    if ($bad = summer_edition_duration_check($status, (string)($e['startDate'] ?? ''), (string)($e['endDate'] ?? ''))) return $bad;
    $now = now_iso();
    db_update('summer_cohorts', ['status' => $status, 'updatedAt' => $now], ['cohortId' => $id]);
    $demoted = 0;
    if ($status === 'active') {
        $demoted = db_exec("UPDATE summer_cohorts SET status = 'closed', updatedAt = ? WHERE cohortId != ? AND status = 'active'", [$now, $id]);
    }
    // An edition closed by hand ends its centres the same way the nightly close does.
    $retired = $status === 'closed' && (string)$e['status'] === 'active' ? summer_centres_retire_unused() : [];
    // And going live brings back the Summer-only venues its groups meet at.
    $revived = [];
    if ($status === 'active') {
        foreach (db_all("SELECT DISTINCT c.centreId, c.name, c.programmes FROM summer_groups g JOIN centres c ON c.centreId = g.centreId WHERE g.cohortId = ? AND c.status = 'retired'", [$id]) as $c) {
            if (!centre_serves($c, 'summer') || centre_serves($c, 'ngg')) continue;
            db_update('centres', ['status' => 'active', 'updatedAt' => $now], ['centreId' => (string)$c['centreId']]);
            $revived[] = (string)$c['name'];
        }
    }
    audit('summer.edition.status', $g['requester']['memberId'], $id,
        ['from' => (string)$e['status'], 'to' => $status, 'demoted' => $demoted, 'centresRetired' => $retired, 'centresRevived' => $revived], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'editionId' => $id, 'status' => $status, 'demoted' => (int)$demoted, 'centresRetired' => $retired, 'centresRevived' => $revived];
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────

/** Every group in one edition (default: the active one), plus what the editor
 *  needs to offer — centres, leads and the course catalogue. */
function admin_summer_groups(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $editionId = trim((string)($p['editionId'] ?? $p['cohortId'] ?? ''));
    if ($editionId === '') $editionId = (string)summer_ensure_cohort()['cohortId'];

    $centreById = [];
    foreach (db_all("SELECT centreId, name, code, color FROM centres ORDER BY name") as $c) {
        $centreById[(string)$c['centreId']] = $c;
    }
    $leadById = [];
    $leadOptions = [];
    foreach (db_all("SELECT volunteerId, fullName, firstName, role FROM volunteers WHERE status = 'active' ORDER BY fullName") as $v) {
        $nm = trim((string)$v['fullName']) !== '' ? (string)$v['fullName'] : trim((string)$v['firstName']);
        $leadById[(string)$v['volunteerId']] = $nm;
        $leadOptions[] = ['volunteerId' => (string)$v['volunteerId'], 'name' => $nm, 'role' => (string)$v['role']];
    }

    $rows = db_all("SELECT * FROM summer_groups WHERE cohortId = ? ORDER BY name", [$editionId]);
    $groups = array_map(fn($r) => summer_group_row($r, $centreById, $leadById), $rows);
    $ungrouped = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND status = 'active' AND (groupId IS NULL OR groupId = '')", [$editionId])['c'] ?? 0);

    return ['ok' => true,
        'editionId'   => $editionId,
        'groups'      => $groups,
        'ungrouped'   => $ungrouped,
        'centres'     => array_values(array_map(fn($c) => ['centreId' => (string)$c['centreId'], 'name' => (string)$c['name'], 'code' => (string)$c['code'], 'color' => (string)($c['color'] ?? '')], $centreById)),
        'leadOptions' => $leadOptions,
        'catalogue'   => function_exists('academy_catalogue') ? academy_catalogue() : [],
        'states'      => SUMMER_GROUP_STATES,
    ];
}

/** A stable, human-readable code for a group, unique within its edition. */
function summer_group_code(string $editionId, string $wanted, string $centreCode, string $track, string $selfGroupId = ''): string {
    $base = strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', $wanted) ?? '');
    if ($base === '') {
        $t = strtoupper(preg_replace('/[^A-Za-z]/', '', $track) ?? '');
        $base = trim(($centreCode !== '' ? $centreCode . '-' : '') . substr($t, 0, 3), '-');
    }
    if ($base === '') $base = 'GRP';
    $base = substr($base, 0, 28);
    $try = $base;
    for ($n = 2; $n < 100; $n++) {
        $clash = db_row('SELECT groupId FROM summer_groups WHERE cohortId = ? AND code = ? LIMIT 1', [$editionId, $try]);
        if (!$clash || (string)$clash['groupId'] === $selfGroupId) return $try;
        $try = substr($base, 0, 28) . '-' . $n;
    }
    return $base . '-' . strtoupper(rand_hex(2));
}

/** Create or update one group. */
function admin_summer_group_save(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $gid = trim((string)($d['groupId'] ?? ''));
    $existing = $gid !== '' ? db_row('SELECT * FROM summer_groups WHERE groupId = ?', [$gid]) : null;
    if ($gid !== '' && !$existing) return ['ok' => false, 'error' => 'not_found'];

    $editionId = trim((string)($d['editionId'] ?? $d['cohortId'] ?? ($existing['cohortId'] ?? '')));
    if ($editionId === '') $editionId = (string)summer_ensure_cohort()['cohortId'];
    if (!db_row('SELECT id FROM summer_cohorts WHERE cohortId = ?', [$editionId])) return ['ok' => false, 'error' => 'edition_not_found'];
    /* An existing group cannot be moved to another edition. Its participants,
       its attendance and its QR tokens are all keyed to the edition it was
       created in; "moving" it would silently orphan every one of them. */
    if ($existing && $editionId !== (string)$existing['cohortId']) return ['ok' => false, 'error' => 'edition_immutable'];

    $name = trim((string)($d['name'] ?? ($existing['name'] ?? '')));
    if (mb_strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name'];
    if (mb_strlen($name) > 160) return ['ok' => false, 'error' => 'name_too_long'];

    $centreId = trim((string)($d['centreId'] ?? ($existing['centreId'] ?? '')));
    $centre = null;
    if ($centreId !== '') {
        $centre = db_row('SELECT centreId, name, code FROM centres WHERE centreId = ?', [$centreId]);
        if (!$centre) return ['ok' => false, 'error' => 'centre_not_found'];
    }
    $leadId = trim((string)($d['leadId'] ?? ($existing['leadId'] ?? '')));
    if ($leadId !== '' && !db_row('SELECT id FROM volunteers WHERE volunteerId = ?', [$leadId])) return ['ok' => false, 'error' => 'lead_not_found'];

    $capacity = (int)($d['capacity'] ?? ($existing['capacity'] ?? 0));
    if ($capacity < 0 || $capacity > SUMMER_GROUP_CAPACITY_MAX) return ['ok' => false, 'error' => 'bad_capacity'];
    $status = (string)($d['status'] ?? ($existing['status'] ?? 'active'));
    if (!in_array($status, SUMMER_GROUP_STATES, true)) return ['ok' => false, 'error' => 'bad_status'];

    $start = summer_edition_date($d['startDate'] ?? ($existing['startDate'] ?? ''));
    $end   = summer_edition_date($d['endDate'] ?? ($existing['endDate'] ?? ''));
    if ($start === null || $end === null) return ['ok' => false, 'error' => 'bad_date'];
    if ($start !== '' && $end !== '' && $end < $start) return ['ok' => false, 'error' => 'end_before_start'];

    /* Meeting days are operational, never public — the centre pages
       deliberately do not publish when children are in a building. Stored as
       ISO weekday numbers so a report can group by them. */
    $days = [];
    foreach (preg_split('/[^0-9]+/', (string)($d['meetDays'] ?? ($existing['meetDays'] ?? ''))) ?: [] as $tok) {
        $n = (int)$tok;
        if ($n >= 1 && $n <= 7 && !in_array((string)$n, $days, true)) $days[] = (string)$n;
    }
    sort($days);
    $meetTime = mb_substr(trim((string)($d['meetTime'] ?? ($existing['meetTime'] ?? ''))), 0, 32);

    $track = mb_substr(trim((string)($d['track'] ?? ($existing['track'] ?? ''))), 0, 80);
    $faculty = mb_substr(trim((string)($d['faculty'] ?? ($existing['faculty'] ?? ''))), 0, 80);
    $notes = mb_substr((string)($d['notes'] ?? ($existing['notes'] ?? '')), 0, 4000);
    $code = summer_group_code($editionId, (string)($d['code'] ?? ($existing['code'] ?? '')),
        $centre ? (string)$centre['code'] : '', $track, $gid);

    $now = now_iso();
    $actor = (string)$g['requester']['memberId'];
    $fields = ['name' => $name, 'code' => $code, 'centreId' => $centreId, 'faculty' => $faculty,
               'track' => $track, 'leadId' => $leadId, 'capacity' => $capacity,
               'meetDays' => implode(',', $days), 'meetTime' => $meetTime,
               'startDate' => $start, 'endDate' => $end, 'status' => $status,
               'notes' => $notes, 'updatedAt' => $now, 'updatedBy' => $actor];

    if ($existing) {
        /* Shrinking a capacity below what is already in the room is refused,
           not silently allowed. The alternative is a group that reports itself
           at 130% and refuses every future assignment for reasons nobody set
           out to create. */
        if ($capacity > 0) {
            $enrolled = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId = ? AND status = 'active'", [$gid])['c'] ?? 0);
            if ($capacity < $enrolled) return ['ok' => false, 'error' => 'capacity_below_enrolled', 'enrolled' => $enrolled];
        }
        db_update('summer_groups', $fields, ['groupId' => $gid]);
    } else {
        $gid = 'SG-' . strtoupper(rand_hex(4));
        while (db_row('SELECT id FROM summer_groups WHERE groupId = ?', [$gid])) $gid = 'SG-' . strtoupper(rand_hex(4));
        db_insert('summer_groups', array_merge($fields,
            ['groupId' => $gid, 'cohortId' => $editionId, 'createdAt' => $now, 'createdBy' => $actor]));
    }
    audit('summer.group.save', $actor, $gid, ['edition' => $editionId, 'code' => $code], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'groupId' => $gid, 'code' => $code, 'editionId' => $editionId];
}

/**
 * Delete one group.
 *
 * Refused while anybody is in it, unless the caller says where they go:
 * `reassignTo` moves them to another group in the same edition, and
 * `unassign: true` returns them to the edition's ungrouped pool. Deleting a
 * group must never be a way to lose track of a child.
 */
function admin_summer_group_delete(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $gid = trim((string)($p['groupId'] ?? ''));
    $row = $gid !== '' ? db_row('SELECT * FROM summer_groups WHERE groupId = ?', [$gid]) : null;
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $members = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId = ?", [$gid])['c'] ?? 0);
    $to = trim((string)($p['reassignTo'] ?? ''));
    $unassign = !empty($p['unassign']);
    $moved = 0;

    if ($members > 0) {
        if ($to !== '') {
            $dest = db_row('SELECT * FROM summer_groups WHERE groupId = ?', [$to]);
            if (!$dest) return ['ok' => false, 'error' => 'destination_not_found'];
            if ((string)$dest['cohortId'] !== (string)$row['cohortId']) return ['ok' => false, 'error' => 'cross_edition'];
            $cap = (int)($dest['capacity'] ?? 0);
            if ($cap > 0) {
                $have = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId = ? AND status = 'active'", [$to])['c'] ?? 0);
                $incoming = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId = ? AND status = 'active'", [$gid])['c'] ?? 0);
                if ($have + $incoming > $cap) return ['ok' => false, 'error' => 'destination_full', 'seatsLeft' => max(0, $cap - $have), 'incoming' => $incoming];
            }
            $moved = db_exec("UPDATE summer_students SET groupId = ?, updatedAt = ? WHERE groupId = ?", [$to, now_iso(), $gid]);
        } elseif ($unassign) {
            $moved = db_exec("UPDATE summer_students SET groupId = '', updatedAt = ? WHERE groupId = ?", [now_iso(), $gid]);
        } else {
            return ['ok' => false, 'error' => 'group_not_empty', 'participants' => $members];
        }
    }
    db_exec('DELETE FROM summer_groups WHERE groupId = ?', [$gid]);
    audit('summer.group.delete', $g['requester']['memberId'], $gid,
        ['edition' => (string)$row['cohortId'], 'moved' => $moved, 'to' => $to ?: ($unassign ? '(ungrouped)' : '')], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'groupId' => $gid, 'moved' => (int)$moved];
}

/**
 * Assign participants to a group — or, with an empty groupId, back to the
 * ungrouped pool.
 *
 * Bulk by design, and PARTIAL by design: a coordinator selecting forty children
 * where the group has twelve seats needs the twelve placed and the twenty-eight
 * named, not the whole action refused and not forty crammed in. So every row
 * gets its own verdict and the caller is handed the list.
 */
function admin_summer_group_assign(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $gid = trim((string)($p['groupId'] ?? ''));
    $ids = is_array($p['studentIds'] ?? null) ? $p['studentIds'] : [];
    $ids = array_values(array_unique(array_filter(array_map(fn($v) => trim((string)$v), $ids))));
    if (!count($ids)) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > SUMMER_ASSIGN_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => SUMMER_ASSIGN_MAX];

    $group = null;
    if ($gid !== '') {
        $group = db_row('SELECT * FROM summer_groups WHERE groupId = ?', [$gid]);
        if (!$group) return ['ok' => false, 'error' => 'not_found'];
        if (in_array((string)$group['status'], ['closed', 'archived'], true)) return ['ok' => false, 'error' => 'group_closed'];
    }
    $cap = $group ? (int)($group['capacity'] ?? 0) : 0;
    $seats = $cap > 0
        ? max(0, $cap - (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId = ? AND status = 'active'", [$gid])['c'] ?? 0))
        : PHP_INT_MAX;

    $now = now_iso();
    $results = [];
    $assigned = 0; $skipped = 0;
    foreach ($ids as $sid) {
        $s = db_row('SELECT studentId, fullName, cohortId, groupId, status FROM summer_students WHERE studentId = ?', [$sid]);
        if (!$s) { $results[] = ['studentId' => $sid, 'ok' => false, 'error' => 'not_found']; $skipped++; continue; }
        $name = (string)($s['fullName'] ?? '');
        if ($group && (string)$s['cohortId'] !== (string)$group['cohortId']) {
            $results[] = ['studentId' => $sid, 'name' => $name, 'ok' => false, 'error' => 'other_edition']; $skipped++; continue;
        }
        if ((string)($s['groupId'] ?? '') === $gid) {
            $results[] = ['studentId' => $sid, 'name' => $name, 'ok' => true, 'unchanged' => true]; continue;
        }
        if ($gid !== '' && (string)$s['status'] === 'active' && $seats <= 0) {
            $results[] = ['studentId' => $sid, 'name' => $name, 'ok' => false, 'error' => 'group_full']; $skipped++; continue;
        }
        db_update('summer_students', ['groupId' => $gid, 'updatedAt' => $now], ['studentId' => $sid]);
        if ($gid !== '' && (string)$s['status'] === 'active' && $seats !== PHP_INT_MAX) $seats--;
        $results[] = ['studentId' => $sid, 'name' => $name, 'ok' => true];
        $assigned++;
    }
    audit($gid === '' ? 'summer.group.unassign' : 'summer.group.assign', $g['requester']['memberId'], $gid ?: '(ungrouped)',
        ['assigned' => $assigned, 'skipped' => $skipped, 'requested' => count($ids)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'groupId' => $gid, 'assigned' => $assigned, 'skipped' => $skipped, 'results' => $results];
}

/** Is this group at or over capacity? capacity 0 = uncapped. */
function summer_group_is_full(string $groupId): bool {
    if ($groupId === '') return false;
    $cap = (int)(db_row('SELECT capacity FROM summer_groups WHERE groupId = ? LIMIT 1', [$groupId])['capacity'] ?? 0);
    if ($cap <= 0) return false;
    $have = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId = ? AND status = 'active'", [$groupId])['c'] ?? 0);
    return $have >= $cap;
}

/**
 * Per-group report for one edition: who is in it, how full it is, and how the
 * room is actually attending. The number a lead is accountable for.
 *
 * Attendance is measured over the group's own dates when it has them and the
 * edition's otherwise, because a group that ran for two of six weeks must not
 * be scored against six.
 */
function admin_summer_group_report(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $editionId = trim((string)($p['editionId'] ?? $p['cohortId'] ?? ''));
    if ($editionId === '') $editionId = (string)summer_ensure_cohort()['cohortId'];
    $edition = db_row('SELECT * FROM summer_cohorts WHERE cohortId = ?', [$editionId]);
    if (!$edition) return ['ok' => false, 'error' => 'edition_not_found'];

    $rows = db_all("SELECT * FROM summer_groups WHERE cohortId = ? ORDER BY name", [$editionId]);
    $out = [];
    foreach ($rows as $r) {
        $gid = (string)$r['groupId'];
        $from = (string)($r['startDate'] ?? '') ?: (string)($edition['startDate'] ?? '');
        $to   = (string)($r['endDate'] ?? '') ?: (string)($edition['endDate'] ?? '');
        $where = "s.groupId = ?"; $args = [$gid];
        if ($from !== '') { $where .= " AND a.date >= ?"; $args[] = $from; }
        if ($to !== '')   { $where .= " AND a.date <= ?"; $args[] = $to; }
        $sessions = (int)(db_row("SELECT COUNT(DISTINCT a.date) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE $where", $args)['c'] ?? 0);
        $present  = (int)(db_row("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE $where", $args)['c'] ?? 0);
        $active   = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE groupId = ? AND status = 'active'", [$gid])['c'] ?? 0);
        $expected = $sessions * $active;
        $row = summer_group_row($r);
        $row['sessions'] = $sessions;
        $row['present'] = $present;
        $row['expected'] = $expected;
        /* Null, not zero, when nothing has been measured. A group that has not
           met yet reported 0% attendance, which reads as failure. */
        $row['attendanceRate'] = $expected > 0 ? (int)round($present / $expected * 100) : null;
        $row['from'] = $from; $row['to'] = $to;
        $out[] = $row;
    }
    $ungrouped = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE cohortId = ? AND status = 'active' AND (groupId IS NULL OR groupId = '')", [$editionId])['c'] ?? 0);
    return ['ok' => true, 'editionId' => $editionId, 'edition' => summer_edition_row($edition),
            'groups' => $out, 'ungrouped' => $ungrouped];
}

// ─────────────────────────────────────────────────────────────────────────────
// The public Summer School page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything /summer needs to let somebody FIND their way in, in one read.
 *
 * The promotion page had no discovery at all. It showed a hard-coded six-week
 * schedule, a filterable gallery of this year's children, and one Apply
 * button — while the three questions a parent actually arrives with went
 * unanswered on it:
 *
 *   · WHERE is my nearest centre? (the centre directory was on another page)
 *   · WHAT does it teach? (the academy catalogue was admin-only, so the
 *     courses this programme runs were nowhere on the public site)
 *   · IS IT OPEN, and when does it start? (the edition's dates and its
 *     application window existed and were never published)
 *
 * One request rather than three, because it is one page and three sequential
 * fetches is three chances to half-render. Cacheable: every field here is
 * either configuration or an aggregate, and none of it is a child's data.
 *
 * PII: none. The centre payload is the same PII-safe projection
 * public_centres_list() serves, and the counts are aggregates. Meeting DAYS
 * are deliberately not included — the centre pages do not publish when
 * children are in a building, and this page must not become the way round
 * that.
 */
/**
 * public.summer.signup — where a family registers for Summer School: the live
 * public sign-up link (a `self` gate, /apply?g=…) for the current edition.
 * That centre's own link when one is asked for and exists, else a link for
 * every centre, else any live one. {url, centre} — url '' when no link is
 * open, which the site says in words rather than showing an old form.
 */
function public_summer_signup(array $p): array {
    $ed = summer_current_cohort();
    $now = now_iso();
    $rows = db_all("SELECT gateId, centreId, cohortId FROM gate_links WHERE kind = 'self' AND status = 'active'
                    AND (expiresAt IS NULL OR expiresAt = '' OR expiresAt > ?) ORDER BY id DESC", [$now]);
    $rows = array_values(array_filter($rows, fn($r) => !$ed || (string)$r['cohortId'] === '' || (string)$r['cohortId'] === (string)$ed['cohortId']));
    if (!$rows) return ['ok' => true, 'url' => '', 'centre' => ''];
    $want = trim((string)($p['centre'] ?? ''));
    $ids = $want !== '' ? [strtolower($want)] : [];
    if ($want !== '') {
        $c = db_row("SELECT centreId, name, code FROM centres WHERE lower(name) = lower(?) OR lower(code) = lower(?) LIMIT 1", [$want, $want]);
        if ($c) $ids = array_merge($ids, array_map('strtolower', array_filter([(string)$c['centreId'], (string)$c['name'], (string)$c['code']])));
    }
    $pick = null;
    if ($ids) foreach ($rows as $r) if (in_array(strtolower((string)$r['centreId']), $ids, true)) { $pick = $r; break; }
    if (!$pick) foreach ($rows as $r) if ((string)$r['centreId'] === '') { $pick = $r; break; }
    $pick ??= $rows[0];
    $centre = '';
    if ((string)$pick['centreId'] !== '') {
        $c = db_row("SELECT name FROM centres WHERE centreId = ? OR name = ? OR code = ? LIMIT 1", [$pick['centreId'], $pick['centreId'], $pick['centreId']]);
        $centre = $c ? (string)$c['name'] : (string)$pick['centreId'];
    }
    return ['ok' => true, 'url' => gate_kind_path('self') . rawurlencode((string)$pick['gateId']), 'centre' => $centre];
}

function public_summer_page(): array {
    $e = summer_ensure_cohort();
    $today = gmdate('Y-m-d');
    $opensAt  = (string)($e['applyOpensAt'] ?? '');
    $closesAt = (string)($e['applyClosesAt'] ?? '');
    /* Whether applications are open is a THREE-state answer, not a boolean.
       "Not set" is the honest answer for an edition whose window nobody has
       filled in, and it must not read as "closed" — a page that says closed
       when nobody decided is a page that turns families away by accident. */
    $applyState = 'unset';
    if ($opensAt !== '' || $closesAt !== '') {
        if ($opensAt !== '' && $today < $opensAt)       $applyState = 'not_yet';
        elseif ($closesAt !== '' && $today > $closesAt) $applyState = 'closed';
        else                                            $applyState = 'open';
    }

    $centres = [];
    $rows = db_all("SELECT centreId, name, code, color, slug, tagline, area, summerArea, capacity, programmes
                      FROM centres
                     WHERE status = 'active' AND pageStatus = 'published' AND slug <> ''
                     ORDER BY name");
    // Summer School's page lists only the centres Summer School runs at.
    $rows = array_values(array_filter($rows, static fn($r) => centre_serves($r, 'summer')));
    /* Two grouped reads for the whole list (enrolments, and which courses run
       where), not two queries per centre. Which courses actually run HERE this
       edition comes from the groups — the difference between "the programme
       teaches Piano" and "you can learn Piano at Ijaiye". Only running groups:
       a planning group is not a promise. */
    $enrolledBy = [];
    foreach (db_all("SELECT centre, COUNT(*) c FROM summer_students WHERE cohortId = ? AND status = 'active' GROUP BY centre", [$e['cohortId']]) as $x) $enrolledBy[(string)$x['centre']] = (int)$x['c'];
    $coursesBy = [];
    foreach (db_all("SELECT DISTINCT centreId, track FROM summer_groups WHERE cohortId = ? AND status = 'active' AND track <> '' ORDER BY track", [$e['cohortId']]) as $g) $coursesBy[(string)$g['centreId']][] = (string)$g['track'];
    foreach ($rows as $r) {
        $enrolled = $enrolledBy[(string)$r['name']] ?? 0;
        $cap = (int)($r['capacity'] ?? 0);
        $courses = $coursesBy[(string)$r['centreId']] ?? [];
        $centres[] = [
            'slug'    => (string)$r['slug'],
            'name'    => (string)$r['name'],
            'code'    => (string)$r['code'],
            'color'   => (string)$r['color'],
            'tagline' => (string)$r['tagline'],
            // Where Summer School meets, when that is not the Club's building.
            'area'    => trim((string)($r['summerArea'] ?? '')) !== '' ? (string)$r['summerArea'] : (string)($r['area'] ?? ''),
            'courses' => $courses,
            /* Aggregates only, and `full` rather than a headcount when there
               is a cap: "3 places left" is useful; "37 children attend here"
               is a number about children. */
            'capacity' => $cap,
            'seatsLeft' => $cap > 0 ? max(0, $cap - $enrolled) : null,
            'full'      => $cap > 0 && $enrolled >= $cap,
        ];
    }

    $academies = [];
    foreach (academy_catalogue() as $faculty => $courses) {
        $academies[] = ['name' => (string)$faculty, 'courses' => array_values(array_map('strval', $courses))];
    }

    return ['ok' => true,
        'edition' => [
            'name'      => (string)($e['name'] ?? ''),
            'year'      => (int)($e['year'] ?? 0),
            'startDate' => (string)($e['startDate'] ?? ''),
            'endDate'   => (string)($e['endDate'] ?? ''),
            'applyOpensAt'  => $opensAt,
            'applyClosesAt' => $closesAt,
            'applyState'    => $applyState,
        ],
        'centres'   => $centres,
        'academies' => $academies,
    ];
}
