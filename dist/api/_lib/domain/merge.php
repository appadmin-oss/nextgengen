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

/** A run of six hundred is already an hour on a laser printer. Beyond this the
 *  browser is the wrong tool and the answer is two runs. */
const MERGE_MAX_ROWS = 600;
const MERGE_AUDIENCES = ['students', 'volunteers'];

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
    $limit = (int)($p['limit'] ?? MERGE_MAX_ROWS);
    if ($limit < 1 || $limit > MERGE_MAX_ROWS) $limit = MERGE_MAX_ROWS;

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
        'facets' => $facets,
    ];
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
                    ORDER BY id ASC LIMIT " . (MERGE_MAX_ROWS * 2), [$cohortId]);
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
    $rows = db_all("SELECT * FROM volunteers WHERE status = 'active' ORDER BY id ASC LIMIT " . (MERGE_MAX_ROWS * 2));
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
