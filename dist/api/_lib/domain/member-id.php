<?php
declare(strict_types=1);

/**
 * The NGG member's PRINTED ID — issuing it, which nothing did.
 *
 * Summer School has had an ID minter since the beginning (card_display_id, in
 * domain/registration.php): a participant is enrolled and a printed ID exists
 * a moment later. NGG members had none. Every path that creates a member —
 * the roster import, the admin desk, the intake flow, promotion out of the
 * Club — left `displayId` empty, and the card renderer on both sides quietly
 * fell back to the INTERNAL memberId. So a member's card printed
 * "NGG-2025-0740" where "026-014" belonged: plausible, wrong, and laminated.
 *
 * That is the wrong way round. Summer School is a phase; NGG is the programme
 * somebody belongs to for years, and it is the one whose credential has to be
 * right.
 *
 * THE FORMAT IS NOT INVENTED HERE. It is the one already printed on the cards
 * in people's wallets and recorded in the members workbook: `YYY-NNN`, the
 * intake year's last three digits and a serial within that year — 023-001,
 * 024-000, 026-014. docs/ROSTER-IMPORT.md maps the workbook's "Members ID"
 * column to `displayId` and its prefix to `cohort`, the INTAKE YEAR. Minting
 * in any other shape would split the roster into cards that look like they
 * belong to two different organisations.
 *
 * NOT the Summer School shape. A participant's id is `CODE-YY-NNN`
 * ("EG-26-001") — centre-prefixed, because a participant belongs to a centre
 * for one season. A member's is year-prefixed, because a member belongs to an
 * intake. The two can never be confused at a glance, which is the point.
 */

/** How many times a serial may be bumped looking for a free one. */
const MEMBER_ID_MAX_BUMP = 500;

/**
 * The intake year a member's printed ID belongs to.
 *
 * `cohort` on a MEMBER row is the intake year — not a Summer School edition,
 * which is what `cohortId` means on every summer table. Same word, two
 * meanings, one database; this function is where the member's meaning is
 * pinned so no caller has to remember which is which.
 */
function member_intake_year(array $m): int {
    $now = (int)gmdate('Y');
    // The workbook's own answer, when it has one: "2024", or a "024-" prefix.
    $cohort = trim((string)($m['cohort'] ?? ''));
    if ($cohort !== '' && preg_match('/(\d{4})/', $cohort, $hit)) {
        $y = (int)$hit[1];
        if ($y >= 2000 && $y <= $now + 1) return $y;
    }
    if ($cohort !== '' && preg_match('/^0?(\d{2,3})\b/', $cohort, $hit)) {
        $y = 2000 + ((int)$hit[1] % 100);
        if ($y >= 2000 && $y <= $now + 1) return $y;
    }
    // Otherwise the year they joined, which is the same fact by another route.
    $joined = trim((string)($m['joinDate'] ?? '')) ?: trim((string)($m['createdAt'] ?? ''));
    if ($joined !== '' && preg_match('/(\d{4})/', $joined, $hit)) {
        $y = (int)$hit[1];
        if ($y >= 2000 && $y <= $now + 1) return $y;
    }
    return $now;
}

/** The `YYY` prefix for an intake year: 2026 → "026". */
function member_id_prefix(int $year): string {
    return str_pad((string)($year % 1000), 3, '0', STR_PAD_LEFT);
}

/**
 * Mint a printed ID for a member, WITHOUT writing it.
 *
 * Serial-race safety on shared hosting is the same bounded bump the summer
 * minter uses: count what exists, then step forward until the id is free.
 * There is no sequence table and no transaction to lean on here.
 */
function member_mint_display_id(array $m): string {
    $prefix = member_id_prefix(member_intake_year($m));
    $like = $prefix . '-%';
    /* HIGHEST SERIAL + 1, not COUNT + 1.
     *
     * Counting rows reuses gaps, and the gaps are exactly where the danger is:
     * a card printed in 2024 as 024-017 whose workbook row never reached this
     * database leaves 017 "free" by a count, and minting it hands a second
     * person an id that is already laminated onto somebody's card. Taking the
     * maximum means a minted id is always beyond every id the roster knows
     * about, so it can only collide with a card that is both unknown here AND
     * numbered above the whole known roster.
     *
     * MAX() on the text suffix would sort "9" after "10", so the serial is cast
     * to an integer first — done in PHP rather than in SQL because SQLite and
     * MySQL disagree about how to cast a substring. */
    $n = 0;
    foreach (db_all('SELECT displayId FROM members WHERE displayId LIKE ?', [$like]) as $r) {
        $tail = substr((string)$r['displayId'], strlen($prefix) + 1);
        if (ctype_digit($tail)) $n = max($n, (int)$tail);
    }
    $n++;
    $id = $prefix . '-' . str_pad((string)$n, 3, '0', STR_PAD_LEFT);
    for ($i = 0; $i < MEMBER_ID_MAX_BUMP && db_row('SELECT id FROM members WHERE displayId = ?', [$id]); $i++) {
        $n++;
        $id = $prefix . '-' . str_pad((string)$n, 3, '0', STR_PAD_LEFT);
    }
    return $id;
}

/**
 * The printed ID a member should carry, minting and storing one if they have
 * none. Returns what is now on the row.
 *
 * Idempotent: a member who already has an id keeps it. An id, once printed,
 * is in somebody's wallet — reissuing it because a record was edited would
 * invalidate a card that is physically correct.
 */
function member_ensure_display_id(array $m): string {
    $have = trim((string)($m['displayId'] ?? ''));
    if ($have !== '') return $have;
    $memberId = trim((string)($m['memberId'] ?? ''));
    if ($memberId === '') return '';
    $id = member_mint_display_id($m);
    db_update('members', ['displayId' => $id, 'updatedAt' => now_iso()], ['memberId' => $memberId]);
    return $id;
}

/**
 * Give printed IDs to every member who has none.
 *
 * The roster predates the minter, so most of it arrived without one — that is
 * the state this was written for. Bounded per call so a shared-hosting request
 * cannot run away with it; the caller repeats until `remaining` is 0.
 */
function admin_members_issue_ids(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $limit = max(1, min(500, (int)($p['limit'] ?? 200)));
    $rows = db_all("SELECT * FROM members WHERE COALESCE(displayId,'') = '' ORDER BY createdAt ASC LIMIT ?", [$limit]);
    $issued = [];
    foreach ($rows as $m) {
        $id = member_ensure_display_id($m);
        if ($id !== '') $issued[] = ['memberId' => (string)$m['memberId'], 'displayId' => $id,
                                     'fullName' => (string)($m['fullName'] ?? '')];
    }
    $remaining = (int)(db_row("SELECT COUNT(*) c FROM members WHERE COALESCE(displayId,'') = ''")['c'] ?? 0);
    if ($issued) {
        audit('admin.members.issueIds', (string)($g['requester']['memberId'] ?? ''), '',
            ['count' => count($issued), 'remaining' => $remaining], (string)($p['ip'] ?? ''));
    }
    return ['ok' => true, 'issued' => $issued, 'count' => count($issued), 'remaining' => $remaining];
}
