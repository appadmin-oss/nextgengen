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
 * Is this row an NGG MEMBER, as opposed to a Summer School account?
 *
 * The `members` table holds both populations: `type` is 'NGG' or 'Summer',
 * and a Summer account even carries a SUM- prefixed memberId. They are not
 * the same people in the same programme, and they must not be issued the same
 * kind of credential — a participant's printed id is the centre-prefixed
 * CODE-YY-NNN minted by card_display_id() against their summer_students row,
 * and giving them a year-prefixed member id as well would put two different
 * printed identities on one person.
 *
 * So everything in this file refuses anyone who is not an NGG member. Summer
 * School is a phase with its own numbering; this is the programme's.
 */
function member_is_ngg(array $m): bool {
    $type = strtolower(trim((string)($m['type'] ?? 'NGG')));
    return $type !== 'summer';
}

/**
 * A member's date — joined, or born — as YYYY-MM-DD.
 *
 * Returns '' for a blank, the ISO date when the value can be read, and null
 * when it cannot. Null is not blank: a caller that writes it would store a
 * date nobody can sort, count or show (the roster drew "—" for a join date
 * that was on file as "15/03/2023"), so the importer reports it instead.
 *
 * What the roster workbook actually holds, in the order it is tried:
 *  · ISO, with or without a time (2023-03-15, 2023-03-15T09:00:00Z)
 *  · an Excel/Sheets serial (45000, 45000.375) — a date cell read raw
 *  · day first, as Nigerian sheets write it (15/03/2023, 15-3-23, 15.03.2023)
 *  · words (15 March 2023, March 15, 2023, 15-Mar-2023, Mar 2023)
 * A month and year with no day is the first of that month; a bare year, its
 * first of January. Month-first (03/15/2023) is not guessed at: 04/05 is
 * ambiguous, and a sheet that is day-first everywhere else means 4 May.
 */
function member_date(string $raw): ?string {
    $s = trim(preg_replace('/\s+/', ' ', $raw) ?? '');
    if ($s === '') return '';
    $ok = static function (int $y, int $mo, int $d): ?string {
        if ($y < 1900 || $y > (int)gmdate('Y') + 1 || !checkdate($mo, $d, $y)) return null;
        return sprintf('%04d-%02d-%02d', $y, $mo, $d);
    };
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/', $s, $m)) return $ok((int)$m[1], (int)$m[2], (int)$m[3]);
    /* A bare year. As a serial, 2023 is a day in 1905 — not a date anybody
       joined or was born on here — so it is the year, from its first day. */
    if (preg_match('/^(19|20)\d{2}$/', $s)) return $ok((int)$s, 1, 1);
    if (preg_match('/^\d{1,5}(?:\.\d+)?$/', $s)) {
        $n = (int)floor((float)$s);
        if ($n < 1 || $n > 80000) return null;
        // Day 1 is 1900-01-01 with the 1900 leap-year bug, so the epoch is 1899-12-30.
        $ts = gmmktime(0, 0, 0, 12, 30, 1899) + $n * 86400;
        return $ok((int)gmdate('Y', $ts), (int)gmdate('n', $ts), (int)gmdate('j', $ts));
    }
    if (preg_match('#^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$#', $s, $m)) {
        $y = (int)$m[3];
        if (strlen($m[3]) === 2) $y += $y > ((int)gmdate('Y') % 100) + 1 ? 1900 : 2000;
        return $ok($y, (int)$m[2], (int)$m[1]);
    }
    $months = ['jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6,
               'jul' => 7, 'aug' => 8, 'sep' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12];
    $t = strtolower(str_replace([',', '.'], ' ', $s));
    $t = trim(preg_replace('/(\d)(st|nd|rd|th)\b/', '$1', $t) ?? '');
    $mon = '([a-z]{3,9})';
    $sep = '[ \\-\\/]+';
    $month = static fn(string $w): int => $months[substr($w, 0, 3)] ?? 0;
    if (preg_match('/^(\\d{1,2})' . $sep . $mon . $sep . '(\\d{4})$/', $t, $m) && ($mo = $month($m[2]))) return $ok((int)$m[3], $mo, (int)$m[1]);
    if (preg_match('/^' . $mon . $sep . '(\\d{1,2})' . $sep . '(\\d{4})$/', $t, $m) && ($mo = $month($m[1]))) return $ok((int)$m[3], $mo, (int)$m[2]);
    if (preg_match('/^' . $mon . $sep . '(\\d{4})$/', $t, $m) && ($mo = $month($m[1]))) return $ok((int)$m[2], $mo, 1);
    return null;
}

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
    // Their printed id, if it says — today's YYY-NNN, or an older declared shape with a year in it.
    $fromId = trim((string)($m['displayId'] ?? '')) !== '' ? member_id_year((string)$m['displayId']) : 0;
    if ($fromId) return $fromId;
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
function member_mint_display_id(array $m, array $reserved = []): string {
    $prefix = member_id_prefix(member_intake_year($m));
    /* $reserved: ids that are spoken for but not yet in the table — every id
       in the file being imported, and every id this run has already minted.
       Without it, a row with no id could be minted 024-018 when a later row of
       the same sheet carries 024-018, and that later row would then MATCH the
       newly minted member and be written on top of them: two children, one
       record. They count towards the highest serial and are never handed out. */
    $taken = [];
    foreach ($reserved as $r) $taken[strtoupper((string)$r)] = true;
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
    $known = array_column(db_all('SELECT displayId FROM members WHERE displayId LIKE ?', [$like]), 'displayId');
    /* Claimed ids count too: a retired or merged record's id stays claimed
       because it is printed on somebody's card, and must never be handed out. */
    if (member_id_claims_ready()) foreach (db_all('SELECT displayId FROM member_display_ids WHERE displayKey LIKE ?', [$like]) as $r) $known[] = (string)$r['displayId'];
    foreach (array_merge($known, array_keys($taken)) as $d) {
        if (strpos((string)$d, $prefix . '-') !== 0) continue;
        $tail = substr((string)$d, strlen($prefix) + 1);
        if (ctype_digit($tail)) $n = max($n, (int)$tail);
    }
    $n++;
    $id = $prefix . '-' . str_pad((string)$n, 3, '0', STR_PAD_LEFT);
    for ($i = 0; $i < MEMBER_ID_MAX_BUMP && (isset($taken[$id]) || db_row('SELECT id FROM members WHERE displayId = ?', [$id]) || member_id_claimed_by($id) !== null); $i++) {
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
    // A Summer School account is numbered by Summer School. See member_is_ngg.
    if (!member_is_ngg($m)) return '';
    $memberId = trim((string)($m['memberId'] ?? ''));
    if ($memberId === '') return '';
    $id = member_mint_and_claim($m, $memberId);
    if ($id === '') return '';
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
    /* A scoped admin issues IDs to their own centres' members only — this
       writes to every row it reaches, and a sweep that reached past the scope
       would number somebody else's intake. */
    $scopeNames = admin_centre_names_in_scope($g['requester']);
    $scopeSql = ''; $scopeArgs = [];
    if ($scopeNames !== null) {
        if (!$scopeNames) return ['ok' => true, 'issued' => [], 'count' => 0, 'remaining' => 0];
        $scopeSql = ' AND centre IN (' . implode(',', array_fill(0, count($scopeNames), '?')) . ')';
        $scopeArgs = $scopeNames;
    }
    /* NGG members only — a Summer School account is numbered by Summer
       School, and sweeping them in here would print two different identities
       for one person. */
    $rows = db_all("SELECT * FROM members WHERE COALESCE(displayId,'') = ''
                    AND COALESCE(type,'NGG') <> 'Summer'" . $scopeSql . " ORDER BY createdAt ASC LIMIT ?", array_merge($scopeArgs, [$limit]));
    $issued = [];
    foreach ($rows as $m) {
        $id = member_ensure_display_id($m);
        if ($id !== '') $issued[] = ['memberId' => (string)$m['memberId'], 'displayId' => $id,
                                     'fullName' => (string)($m['fullName'] ?? '')];
    }
    $remaining = (int)(db_row("SELECT COUNT(*) c FROM members WHERE COALESCE(displayId,'') = ''
                               AND COALESCE(type,'NGG') <> 'Summer'" . $scopeSql, $scopeArgs)['c'] ?? 0);
    if ($issued) {
        audit('admin.members.issueIds', (string)($g['requester']['memberId'] ?? ''), '',
            ['count' => count($issued), 'remaining' => $remaining], (string)($p['ip'] ?? ''));
    }
    return ['ok' => true, 'issued' => $issued, 'count' => count($issued), 'remaining' => $remaining];
}


/* ── The SHAPES a printed ID may take ─────────────────────────────────────────
 *
 * Today's shape is YYY-NNN. It was not always: cards printed before the
 * workbook settled carry other ones, and an import that refused them — or
 * quietly dropped the members carrying them — lost exactly the people whose
 * cards are oldest. So the shapes are DECLARED: each is a card format whose
 * template is the bare id and whose field is the printed number (the gate
 * reads the QR, which encodes the id, by that format), defined from one
 * example. The built-in "member-number" is today's.
 */

/**
 * An id as the sheet spells it, tidied without changing what it says: trimmed,
 * inner spaces gone, upper case — and a YYY-NNN whose year lost its leading
 * zero to a spreadsheet ("23-001", "23/001") given it back. The serial is
 * kept as typed: "024-16" and "024-016" are left distinct, because an import
 * that silently renumbered one would stop matching the card it was printed on.
 */
function member_id_canonical(string $raw): string {
    $s = strtoupper(preg_replace('/\s+/', '', trim($raw)) ?? '');
    if (preg_match('~^(\d{2,3})[-/.](\d{1,4})$~', $s, $m)) return str_pad($m[1], 3, '0', STR_PAD_LEFT) . '-' . $m[2];
    return $s;
}

/** The shape of an id: digits 9, letters A, the rest as printed. "NGG/23/042" → "AAA/99/999". */
function member_id_shape(string $id): string {
    return preg_replace(['/\d/', '/[A-Z]/i'], ['9', 'A'], $id) ?? '';
}

/** The declared id shapes: every format that reads the bare printed number. */
function member_id_formats(): array {
    return array_values(array_filter(member_card_formats(), static fn($f) =>
        (string)($f['field'] ?? '') === 'displayId' && trim((string)($f['template'] ?? '')) === '{id}'));
}

/** Which declared shape an id fits, or null. A 1–4 digit serial counts as today's shape, as the workbook writes it. */
function member_id_format_of(string $id): ?string {
    if (preg_match('/^\d{3}-\d{1,4}$/', $id)) return 'member-number';
    foreach (member_id_formats() as $f) {
        if (member_card_format_decode($f, $id) === strtoupper($id)) return (string)$f['id'];
    }
    return null;
}

/**
 * Declare an id shape from one example, the way an importer knows it: "our
 * old cards say NGG/23/042". Digits vary; letters may be told to vary too
 * (`lettersVary`) for shapes like AB-042 where the letters are initials.
 * Super admin, like any card format: a format decides what the gate opens to.
 */
function admin_member_id_format_declare(array $p): array {
    $g = admin_cap_gate($p, 'rbac'); if (!$g['ok']) return $g;
    $example = member_id_canonical((string)($p['example'] ?? ''));
    if ($example === '' || strlen($example) > 24) return ['ok' => false, 'error' => 'bad_example', 'detail' => 'Give one member ID exactly as it is printed, up to 24 characters.'];
    if (!preg_match('/\d/', $example)) return ['ok' => false, 'error' => 'bad_example', 'detail' => 'A member ID has a number in it.'];
    $mask = strtoupper(trim((string)($p['mask'] ?? '')));
    if ($mask === '') $mask = !empty($p['lettersVary']) ? member_id_shape($example) : preg_replace('/\d/', '9', $example);
    $label = trim((string)($p['label'] ?? '')) ?: 'Member IDs like ' . $example;
    $id = substr('id-' . trim((string)preg_replace('/[^a-z0-9]+/', '-', strtolower($mask)), '-'), 0, 40);
    $f = ['id' => $id, 'label' => mb_substr($label, 0, 80), 'template' => '{id}', 'mask' => $mask, 'field' => 'displayId', 'example' => $example];
    /* Where the intake year is in it, if the importer says which year the
       example belongs to: "NGG/23/042" was 2023, so the year is the "23". */
    $year = (int)($p['year'] ?? 0);
    if ($year >= 2000 && $year <= (int)gmdate('Y') + 1) {
        foreach ([(string)$year, substr((string)$year, 2)] as $needle) {
            $at = strpos($example, $needle);
            // The year must sit on digits that vary (9s in the shape), not on literal text.
            if ($at !== false && preg_match('/^9+$/', substr($mask, $at, strlen($needle)))) {
                $f['yearAt'] = [$at, strlen($needle)];
                break;
            }
        }
        if (!isset($f['yearAt'])) return ['ok' => false, 'error' => 'bad_year', 'detail' => 'The year ' . $year . ' is not in ' . $example . ' as digits that vary. Leave the year out, or check the example.'];
    }
    $c = member_card_format_compile($f);
    if (!$c['ok']) return ['ok' => false, 'error' => 'bad_format', 'detail' => $c['error']];
    if (member_card_format_decode($f, $example) === null) return ['ok' => false, 'error' => 'bad_format', 'detail' => 'The example does not fit that shape.'];
    $custom = setting_get('gate.cardFormats');
    $list = array_values(array_filter(is_array($custom) ? $custom : [], static fn($x) => is_array($x) && ($x['id'] ?? '') !== $id));
    if (count($list) >= 12) return ['ok' => false, 'error' => 'too_many', 'detail' => 'Twelve formats is the most the gate will try.'];
    $list[] = $f;
    setting_set('gate.cardFormats', $list, (string)($g['requester']['memberId'] ?? ''));
    audit('admin.members.idFormat', (string)($g['requester']['memberId'] ?? ''), $id, ['mask' => $mask, 'example' => $example], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'format' => $f, 'formats' => member_id_formats()];
}


/* ── Claims: one printed id, one record — enforced by the database ────────────
 *
 * member_display_ids has the id as its primary key. Every writer claims an id
 * BEFORE it is written to a member, so two writers racing for the same id — two
 * imports, an import and the desk — cannot both win: the second INSERT fails on
 * the key and that writer mints again (or, for an id somebody typed, refuses).
 * Claims are never released: an id that was printed stays somebody's.
 */

function member_id_claims_ready(): bool {
    static $ok = null;
    if ($ok !== null) return $ok;
    try { db_row('SELECT 1 FROM member_display_ids LIMIT 1'); return $ok = true; } catch (Throwable $e) { return $ok = false; }
}

/** Who holds an id, or null. */
function member_id_claimed_by(string $id): ?string {
    if (!member_id_claims_ready() || trim($id) === '') return null;
    $r = db_row('SELECT memberId FROM member_display_ids WHERE displayKey = ?', [strtoupper(trim($id))]);
    return $r ? (string)$r['memberId'] : null;
}

/** Claim an id for a member. True if it is now theirs (or already was); false if somebody else holds it. */
function member_id_claim(string $memberId, string $id): bool {
    $id = trim($id);
    if ($id === '' || $memberId === '') return false;
    if (!member_id_claims_ready()) return true;   // pre-122 database: the members table is the only check
    try {
        db_insert('member_display_ids', ['displayKey' => strtoupper($id), 'displayId' => $id, 'memberId' => $memberId, 'claimedAt' => now_iso()]);
        return true;
    } catch (Throwable $e) {
        return member_id_claimed_by($id) === $memberId;
    }
}

/** Mint an id and claim it for $memberId, minting again if a racing writer took it first. '' if none could be claimed. */
function member_mint_and_claim(array $m, string $memberId, array $reserved = []): string {
    for ($try = 0; $try < 20; $try++) {
        $id = member_mint_display_id($m, $reserved);
        if (member_id_claim($memberId, $id)) return $id;
        $reserved[] = $id;
    }
    return '';
}

/**
 * Printed ids held by more than one record, and records whose id another
 * record has claimed. The backfill gave each id to its earliest holder; these
 * are the rest, for somebody to resolve — usually one person entered twice
 * (merge them), sometimes two children given one number (renumber the later).
 */
function admin_members_id_duplicates(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $groups = [];
    foreach (db_all("SELECT UPPER(TRIM(displayId)) k, COUNT(*) c FROM members WHERE TRIM(COALESCE(displayId,'')) <> ''
                       AND COALESCE(type,'NGG') <> 'Summer' AND COALESCE(status,'') <> 'merged' GROUP BY k HAVING c > 1") as $r) {
        $rows = db_all("SELECT memberId, fullName, dob, email, centre, status, createdAt FROM members WHERE UPPER(TRIM(displayId)) = ? AND COALESCE(status,'') <> 'merged' ORDER BY id", [$r['k']]);
        $holder = member_id_claimed_by((string)$r['k']);
        $groups[] = ['displayId' => (string)$r['k'], 'claimedBy' => $holder, 'members' => $rows,
                     'samePerson' => count($rows) === 2 && members_import_same_person($rows[0], $rows[1])];
    }
    /* One person, two ids: the same name (in any word order) and the same date
       of birth, on two records that each carry a different printed id. */
    $byKey = [];
    foreach (db_all("SELECT memberId, fullName, dob, email, displayId, centre, status FROM members
                      WHERE TRIM(COALESCE(displayId,'')) <> '' AND COALESCE(type,'NGG') <> 'Summer' AND COALESCE(status,'') <> 'merged'") as $m) {
        $t = preg_split('/\s+/', mb_strtolower(trim(preg_replace('/[^\p{L}\s]/u', ' ', (string)$m['fullName']) ?? ''))) ?: [];
        $t = array_values(array_filter($t)); sort($t);
        if (!$t) continue;
        $byKey[implode(' ', $t) . '|' . trim((string)$m['dob'])][] = $m;
    }
    $twoIds = [];
    foreach ($byKey as $k => $rows) {
        if (count($rows) < 2) continue;
        $ids = array_unique(array_map(fn($x) => strtoupper((string)$x['displayId']), $rows));
        if (count($ids) > 1) $twoIds[] = ['members' => $rows, 'dobKnown' => trim(explode('|', $k, 2)[1]) !== ''];
    }
    return ['ok' => true, 'shared' => $groups, 'twoIds' => $twoIds, 'claims' => member_id_claims_ready()];
}

/* ── The intake year an older id carries ──────────────────────────────────────
 * A declared format may say where the year is ("NGG/23/042" — the 23). The
 * importer reads it for a row with no intake year, so a member numbered in an
 * older scheme still lands in the right intake. */

/** The intake year a printed id encodes under a declared format, or 0. */
function member_id_year(string $id): int {
    $id = strtoupper(trim($id));
    if (preg_match('/^(\d{3})-\d{1,4}$/', $id, $m)) {
        $y = 2000 + (int)$m[1];
        return $y <= (int)gmdate('Y') + 1 ? $y : 0;   // 999-001 is a typo, not the year 2999
    }
    foreach (member_id_formats() as $f) {
        $at = $f['yearAt'] ?? null;
        if (!is_array($at) || count($at) !== 2) continue;
        if (member_card_format_decode($f, $id) !== $id) continue;
        $digits = substr($id, (int)$at[0], (int)$at[1]);
        if (!ctype_digit($digits)) continue;
        $y = strlen($digits) === 2 ? 2000 + (int)$digits : (int)$digits;
        if ($y >= 2000 && $y <= (int)gmdate('Y') + 1) return $y;
    }
    return 0;
}

/* ── Near misses ──────────────────────────────────────────────────────────────
 * An id that fits no shape is usually a typo. The common ones are letters that
 * look like digits — O for 0, I or l for 1, S for 5, B for 8 — and a missing or
 * different separator. Offered as a suggestion, never applied: the person who
 * reads the sheet decides. */
function member_id_suggest(string $id): ?array {
    $raw = strtoupper(trim($id));
    $fixed = strtr($raw, ['O' => '0', 'I' => '1', 'L' => '1', 'S' => '5', 'B' => '8', 'Z' => '2']);
    $cands = [];
    if (preg_match('/^(\d{2,3})\D?(\d{3,4})$/', $fixed, $m)) $cands[] = str_pad($m[1], 3, '0', STR_PAD_LEFT) . '-' . $m[2];
    if (preg_match('/^\d{3}-\d{1,4}$/', $fixed)) $cands[] = $fixed;
    foreach (array_unique($cands) as $c) {
        if ($c === $raw) continue;
        $holder = db_row('SELECT memberId, fullName FROM members WHERE UPPER(displayId) = ? LIMIT 1', [$c]);
        return ['id' => $c, 'holder' => $holder ? (string)$holder['fullName'] : null];
    }
    return null;
}
