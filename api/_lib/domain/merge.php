<?php
declare(strict_types=1);

/**
 * Data merge — one design, many people.
 *
 * WHY: the design studio can draw a certificate. It could not, until this file,
 * draw two hundred and forty of them. The only roster the studio could read was
 * `admin.cards.data`, which exists to feed a card printer and is therefore
 * hard-bound to `regStatus = 'verified' AND token != ''` — the children who have
 * an ID card. That is exactly the wrong population for a certificate: a child
 * who attended all twelve days and whose card was never issued (because a photo
 * was rejected, which happens) is precisely the child a certificate is for, and
 * they were invisible.
 *
 * So this is a separate read with its own rules:
 *
 *   · card issuance is a FILTER here, not a precondition;
 *   · attendance is counted from the `attendance` table rather than read from
 *     `summer_students.daysPresent`, which is a denormalised cache and is stale
 *     the moment a scan is corrected — a certificate that says "attended 11 of
 *     12 days" must be true on the day it prints, not on the day of the last
 *     sweep;
 *   · the rows come back in exactly the shape the card renderers already use,
 *     built by the same two functions (card_row_student / card_row_volunteer),
 *     so a merged certificate and a printed ID cannot disagree about a name.
 *
 * What this deliberately does NOT do: generate anything. Rendering happens in
 * the browser, on the same Fabric canvas that drew the proof, because the host
 * is PHP on shared hosting with no headless browser and no image stack worth
 * the name. This op answers "who is in the run"; the studio answers "what does
 * each one look like".
 */

/* Two different ceilings, because they exist for two different reasons.
 *
 * They used to be one number, MERGE_MAX_ROWS = 600, doing both jobs — and the
 * browser's limit was silently applied to BROWSING. A coordinator with a
 * thousand children could not see the thousand-and-first, could not search for
 * them, and was told "only the first 600 are listed" as though that were a
 * property of the roster rather than of the renderer.
 *
 * · RUN is the real constraint: six hundred cards is already an hour on a
 *   laser printer, and the browser holds every page in memory until the file
 *   is written. That number stays.
 * · LIST is only "how many rows may travel in one response". The picker is
 *   windowed now — it draws the forty rows on screen and not the other 1,960 —
 *   so this can be generous, and the population it counts over must be the
 *   whole population or the totals and the facets are both lies. */
const MERGE_RUN_MAX = 600;
const MERGE_LIST_MAX = 2000;
/* Kept for callers that still name it, and equal to the RUN cap because that
 * is what it always actually meant. */
const MERGE_MAX_ROWS = MERGE_RUN_MAX;
/* How deep the base read goes before anything is filtered. Everything past
 * this is invisible to the count, the facets and the search alike, so it is a
 * ceiling on the PROGRAMME rather than on the run — set where admin.php
 * already sets its export ceiling. */
const MERGE_SCAN_MAX = 5000;
const MERGE_AUDIENCES = ['students', 'volunteers'];

/* How a print run may be ordered.
 *
 * There was no ordering at all: rows came back in `id ASC`, which is the order
 * the rows were inserted, which is nothing anybody printing a stack of
 * certificates wants. A guillotine operator wants them grouped by centre; a
 * coordinator handing them out at assembly wants them alphabetical; somebody
 * chasing the children who nearly qualified wants them by attendance.
 *
 * An allow-list rather than a column name, because these sort SHAPED rows in
 * PHP rather than SQL — the shaping is what produces `attended` and the
 * display name in the first place. */
const MERGE_SORTS = ['name', 'surname', 'displayId', 'centre', 'attended', 'ready'];

/**
 * Gate per audience rather than once for the screen.
 *
 * The design studio is gated on 'people' — deciding what a credential looks
 * like is its own job. But a merge does not just style data, it EXPORTS it: a
 * batch of 240 certificates is 240 children's names and photographs leaving the
 * building as a file. So the capability that guards reading the roster is the
 * one that has to hold here too, exactly as it does for the card studio.
 */
function merge_gate(array $p, string $audience) {
    return admin_cap_gate($p, $audience === 'volunteers' ? 'people' : 'summer');
}

function merge_audience(array $p): string {
    $a = (string)($p['audience'] ?? 'students');
    return in_array($a, MERGE_AUDIENCES, true) ? $a : 'students';
}

/** Days actually attended, per child, for one cohort. Counted, not cached. */
function merge_attendance_counts(string $cohortId): array {
    $out = [];
    foreach (db_all('SELECT studentId, COUNT(*) n FROM attendance WHERE cohortId = ? GROUP BY studentId', [$cohortId]) as $r) {
        $out[(string)$r['studentId']] = (int)$r['n'];
    }
    return $out;
}

/**
 * The people a merge would run over, plus the vocabulary to narrow it.
 *
 * Facets are computed over the WHOLE audience, never over the filtered result:
 * a centre picker that drops every other centre the moment you choose one is a
 * picker you cannot change your mind in.
 */
function admin_merge_rows(array $p): array {
    $audience = merge_audience($p);
    $g = merge_gate($p, $audience); if (!$g['ok']) return $g;

    $rows = $audience === 'volunteers' ? merge_volunteer_rows() : merge_student_rows();

    /* Facets first, from everything, then filter. */
    $facets = ['centres' => [], 'tracks' => [], 'roles' => [], 'maxAttended' => 0];
    $seen = ['centres' => [], 'tracks' => [], 'roles' => []];
    foreach ($rows as $r) {
        $c = (string)(($r['centre']['name'] ?? '') ?: '');
        if ($c !== '' && !isset($seen['centres'][$c])) { $seen['centres'][$c] = 1; $facets['centres'][] = $c; }
        $t = (string)($r['track'] ?? '');
        if ($t !== '' && !isset($seen['tracks'][$t])) { $seen['tracks'][$t] = 1; $facets['tracks'][] = $t; }
        $ro = (string)($r['role'] ?? '');
        if ($ro !== '' && !isset($seen['roles'][$ro])) { $seen['roles'][$ro] = 1; $facets['roles'][] = $ro; }
        if ((int)($r['attended'] ?? 0) > $facets['maxAttended']) $facets['maxAttended'] = (int)$r['attended'];
    }
    sort($facets['centres']); sort($facets['tracks']); sort($facets['roles']);
    $total = count($rows);

    $matched = array_values(array_filter($rows, fn($r) => merge_keep($r, $p)));
    merge_sort($matched, (string)($p['sort'] ?? ''), (string)($p['dir'] ?? ''));

    $limit = (int)($p['limit'] ?? MERGE_LIST_MAX);
    if ($limit < 1 || $limit > MERGE_LIST_MAX) $limit = MERGE_LIST_MAX;

    $sort = in_array((string)($p['sort'] ?? ''), MERGE_SORTS, true) ? (string)$p['sort'] : 'name';
    return [
        'ok' => true,
        'audience' => $audience,
        'rows' => array_slice($matched, 0, $limit),
        'total' => $total,
        'matched' => count($matched),
        // Said out loud rather than left for the operator to notice a short
        // batch: a silently truncated print run is a child without a certificate.
        'truncated' => count($matched) > $limit,
        'limit' => $limit,
        // The browser's ceiling, sent rather than hard-coded on the client, so
        // the two cannot drift into telling an operator different numbers.
        'runMax' => MERGE_RUN_MAX,
        // The order actually applied — not the one requested. A request for a
        // column that does not exist is served by name, and saying otherwise
        // would have the picker draw an arrow beside a column it is not on.
        'sort' => $sort,
        'dir' => strtolower((string)($p['dir'] ?? '')) === 'desc' ? 'desc' : 'asc',
        'facets' => $facets,
    ];
}

/**
 * Order a filtered set of shaped rows, in place.
 *
 * Sorted here rather than in SQL because two of the six keys do not exist in
 * any table: `attended` is counted from the attendance rows at read time, and
 * `ready` is a judgement about a photograph and a token. Sorting the query and
 * then computing those would order the roster by something other than what the
 * screen shows, which is the bug this function exists to not have.
 *
 * Every comparison falls through to the display id, so the order is total: two
 * children with the same name in the same centre come out the same way every
 * time, and a printed stack matches the list that was on screen.
 */
function merge_sort(array &$rows, string $sort, string $dir): void {
    if (!in_array($sort, MERGE_SORTS, true)) $sort = 'name';
    $desc = strtolower($dir) === 'desc';
    $txt = fn($v) => mb_strtolower(trim((string)$v));
    $key = function (array $r) use ($sort, $txt) {
        switch ($sort) {
            // Surname first is how a register is filed and how a stack of
            // certificates gets handed out; "name" is how a person reads it.
            case 'surname':   return [$txt($r['surname'] ?? ''), $txt($r['firstName'] ?? '')];
            case 'displayId': return [$txt($r['displayId'] ?? '')];
            case 'centre':    return [$txt($r['centre']['name'] ?? ''), $txt($r['surname'] ?? '')];
            case 'attended':  return [(int)($r['attended'] ?? 0)];
            /* "Ready" is the one an operator sorts by before a print run: it
               puts everything that will come out wrong at one end of the list
               instead of scattered through a thousand rows. 0 = will print
               with a hole in it, 1 = fine. */
            case 'ready':     return [(trim((string)($r['photoUrl'] ?? '')) !== ''
                                       && trim((string)($r['token'] ?? '')) !== '') ? 1 : 0];
            default:          return [$txt($r['firstName'] ?? ''), $txt($r['surname'] ?? '')];
        }
    };
    usort($rows, function ($a, $b) use ($key, $desc) {
        $ka = $key($a); $kb = $key($b);
        for ($i = 0; $i < count($ka); $i++) {
            $c = is_int($ka[$i]) ? ($ka[$i] <=> $kb[$i]) : strcmp((string)$ka[$i], (string)$kb[$i]);
            if ($c !== 0) return $desc ? -$c : $c;
        }
        // The tiebreak that makes the order total. NOT reversed with the rest:
        // it is there to be stable, not to be meaningful.
        return strcmp((string)($a['displayId'] ?? $a['key'] ?? ''), (string)($b['displayId'] ?? $b['key'] ?? ''));
    });
}

/** One filter predicate, so the count and the rows can never disagree. */
function merge_keep(array $r, array $p): bool {
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '' && mb_strtolower((string)($r['centre']['name'] ?? '')) !== mb_strtolower($centre)) return false;

    $track = trim((string)($p['track'] ?? ''));
    if ($track !== '' && mb_strtolower((string)($r['track'] ?? '')) !== mb_strtolower($track)) return false;

    $role = trim((string)($p['role'] ?? ''));
    if ($role !== '' && mb_strtolower((string)($r['role'] ?? '')) !== mb_strtolower($role)) return false;

    $q = trim((string)($p['q'] ?? ''));
    if ($q !== '') {
        $hay = mb_strtolower(trim(($r['firstName'] ?? '') . ' ' . ($r['surname'] ?? '') . ' ' . ($r['displayId'] ?? '')));
        if (mb_strpos($hay, mb_strtolower($q)) === false) return false;
    }

    /* Dates on the enrolment, which is how a print run is actually cut: "the
       children who registered since the last batch went to the printer". A row
       with no date on file is excluded from any range rather than silently
       included — the card studio says the same thing in its own words. */
    $from = trim((string)($p['from'] ?? ''));
    $to = trim((string)($p['to'] ?? ''));
    if ($from !== '' || $to !== '') {
        $d = substr((string)($r['enrolledAt'] ?? ''), 0, 10);
        if ($d === '') return false;
        if ($from !== '' && $d < $from) return false;
        if ($to !== '' && $d > $to) return false;
    }

    $attMin = (int)($p['attendedMin'] ?? 0);
    if ($attMin > 0 && (int)($r['attended'] ?? 0) < $attMin) return false;

    // 'yes' | 'no' | anything else = don't care.
    $photo = (string)($p['photo'] ?? '');
    if ($photo === 'yes' && trim((string)($r['photoUrl'] ?? '')) === '') return false;
    if ($photo === 'no' && trim((string)($r['photoUrl'] ?? '')) !== '') return false;

    $issued = (string)($p['issued'] ?? '');
    if ($issued === 'yes' && trim((string)($r['token'] ?? '')) === '') return false;
    if ($issued === 'no' && trim((string)($r['token'] ?? '')) !== '') return false;

    return true;
}

/**
 * Every verified child in the current cohort — with or without a card.
 *
 * `regStatus = 'verified'` stays: a registration a guardian never confirmed is
 * not a child NGG can print anything for. Everything else that the card payload
 * treats as a precondition is a filter here instead.
 */
function merge_student_rows(): array {
    $c = summer_ensure_cohort();
    $cohortId = (string)($c['cohortId'] ?? '');
    $rows = db_all("SELECT * FROM summer_students WHERE cohortId = ? AND regStatus = 'verified'
                    ORDER BY id ASC LIMIT " . MERGE_SCAN_MAX, [$cohortId]);
    $expiryOf = [];
    if ($rows) {
        $ids = array_column($rows, 'studentId');
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach (db_all("SELECT studentId, expiresAt FROM qr_codes WHERE status = 'assigned' AND studentId IN $in", $ids) as $q) {
            $expiryOf[(string)$q['studentId']] = (string)($q['expiresAt'] ?? '');
        }
    }
    $centres = centre_index(true);
    $attend = merge_attendance_counts($cohortId);
    $out = [];
    foreach ($rows as $s) {
        $id = (string)$s['studentId'];
        $row = card_row_student($s, $centres[mb_strtolower((string)($s['centre'] ?? ''))] ?? null, $expiryOf[$id] ?? '');
        // Merge-only. `key` is what the studio ticks; the rest is what it filters
        // and labels by, and none of it is a binding a design can print.
        $row['key'] = $id;
        $row['attended'] = (int)($attend[$id] ?? 0);
        $out[] = $row;
    }
    return $out;
}

/** Every active volunteer — again with or without a card. */
function merge_volunteer_rows(): array {
    $rows = db_all("SELECT * FROM volunteers WHERE status = 'active' ORDER BY id ASC LIMIT " . MERGE_SCAN_MAX);
    $expiryOf = [];
    $tokens = array_values(array_filter(array_map(fn($v) => (string)($v['token'] ?? ''), $rows)));
    if ($tokens) {
        $in = '(' . implode(',', array_fill(0, count($tokens), '?')) . ')';
        foreach (db_all("SELECT token, expiresAt FROM qr_codes WHERE token IN $in", $tokens) as $q) {
            $expiryOf[(string)$q['token']] = (string)($q['expiresAt'] ?? '');
        }
    }
    $centres = centre_index();
    $out = [];
    foreach ($rows as $v) {
        $row = card_row_volunteer($v, $centres, (string)($expiryOf[(string)($v['token'] ?? '')] ?? ''));
        $row['key'] = (string)$v['volunteerId'];
        // A volunteer's attendance is duty days, not check-ins, and duty is a
        // different table with a different meaning. Left at zero rather than
        // filled with a number that would read as "days attended" and not be.
        $row['attended'] = 0;
        $out[] = $row;
    }
    return $out;
}
