<?php
declare(strict_types=1);

/**
 * Roster import — the desk's spreadsheet becomes rows in `members`.
 *
 * NGG's roster lived in a Google Sheet for three intakes before it lived here,
 * and the sheet is still where a centre lead adds a child on a Saturday. This
 * is the one-way door between the two: `tools/ngg-import/extract.js` flattens
 * the workbook into a roster file, and these functions put it in the database.
 *
 * Three properties matter more than speed, because this runs against real
 * children's records on a live site:
 *
 *  - **Idempotent.** Matching is by printed member ID first, so a second run
 *    updates the same people rather than issuing them second memberIds. Re-running
 *    after fixing four rows in the sheet costs four updates, not 136 duplicates.
 *  - **Additive by default.** An existing value is never overwritten unless the
 *    caller asks for it. Whatever the desk has corrected in the Control Room
 *    outranks a spreadsheet that has been copied between four tabs.
 *  - **Answerable.** Every row reports what it would do before anything is
 *    written, and the notes it leaves behind name the sheet each fact came from.
 *
 * @see api/tools/seed-members.php — the CLI wrapper
 * @see tools/ngg-import/extract.js — the workbook reader that feeds it
 */

/** Statuses the member counts in `admin_overview` recognise. */
const MEMBER_IMPORT_STATUSES = ['active', 'inactive', 'suspended', 'graduated-ngg', 'graduated-vanguard'];

/**
 * Columns the importer may write, with their width in db/schema-mysql.sql.
 *
 * The widths are here because db_conn() puts MySQL into STRICT_ALL_TABLES: a
 * school name one character past VARCHAR(255) is a silent trim on SQLite and a
 * failed insert in production. Truncating here — and saying so — keeps a long
 * address from taking a whole import down.
 */
const MEMBER_IMPORT_WIDTHS = [
    'fullName' => 255, 'email' => 200, 'phone' => 40, 'type' => 32, 'status' => 32,
    'centre' => 32, 'track' => 64, 'cohort' => 64, 'joinDate' => 40, 'dob' => 40, 'division' => 24,
    'parentName' => 255, 'parentPhone' => 40, 'school' => 255,
    'displayId' => 24, 'disciplines' => 120, 'level' => 16,
];

/* The imported block inside `notes` is fenced so a re-run can replace it
   without touching a line the desk typed above or below it. */
const MEMBER_IMPORT_NOTE_OPEN  = '[roster-import]';
const MEMBER_IMPORT_NOTE_CLOSE = '[/roster-import]';

/** Read a roster file produced by tools/ngg-import/extract.js. */
function members_import_parse(string $json): array
{
    $data = json_decode($json, true);
    if (!is_array($data)) return ['ok' => false, 'error' => 'not_json'];
    $rows = $data['members'] ?? (array_is_list($data) ? $data : null);
    if (!is_array($rows)) return ['ok' => false, 'error' => 'no_members_array'];
    foreach ($rows as $r) if (!is_array($r)) return ['ok' => false, 'error' => 'member_not_an_object'];
    /* Registrations with no roster row (extract.js files them, not as members).
       Absent in an older file, and in a hand-made array of members. */
    $applicants = is_array($data['applicants'] ?? null) && !array_is_list($data) ? array_values(array_filter($data['applicants'], 'is_array')) : [];
    return ['ok' => true, 'members' => array_values($rows), 'applicants' => $applicants,
            'source' => (string)($data['source'] ?? ''),
            'extractedAt' => (string)($data['extractedAt'] ?? '')];
}

/* ── The roster travels as ONE value, not as 136 objects ─────────────────────
 *
 * The import was refused with 406 Not Acceptable and nothing in this
 * application sends a 406 — the request was being rejected in front of PHP, by
 * the host's mod_security. What it objects to was measured against the live
 * host rather than guessed, with unauthenticated posts that PHP answers at the
 * CSRF gate, so a reply of `csrf_failed` means the request got through:
 *
 *     6.5KB of roster JSON     (  ~90 values)   →  reached PHP
 *      55KB of roster JSON     ( 3201 values)   →  406
 *     322KB in 161 values                       →  reached PHP
 *     131KB in 2 values                         →  reached PHP
 *     multipart, any file part, even ~200 bytes  →  406
 *     multipart, form fields only                →  reached PHP
 *     whole roster as ONE string value, 736KB    →  reached PHP
 *     the same, 2.45MB                           →  413 (a real body limit)
 *
 * So it is the NUMBER OF VALUES in the body, not its size: the rule set parses
 * a JSON body into arguments and refuses a request with too many of them. A
 * 136-member roster is around 3000 values and was always going to hit it; it
 * broke as the roster grew, with nothing here changing. File uploads are
 * refused outright on this host, so posting the roster as an upload — the
 * obvious fix, and the first one tried — does not work either.
 *
 * What does work is sending the roster as a single string: `rosterJson`, the
 * text of the file exactly as the extractor wrote it, one value however many
 * members are in it. It is also the honest shape, and it hands the server the
 * file rather than the browser's summary of it:
 *
 *  - `fileSha` is hashed from the text received rather than taken on trust. For
 *    the UTF-8 the extractor writes that is the file's own sha256 — the number
 *    extract.js prints — and it used to be absent altogether on plain http,
 *    where crypto.subtle does not exist.
 *  - `source` is read from inside the file, so a run is recorded against
 *    NGG_Members.xlsx rather than against `download (3).json`.
 *  - The digest still binds the apply to its dry run: it is computed over the
 *    parsed rows, and both posts send the same text.
 *
 * The old shape — `members` as an array of objects — is still accepted, for a
 * browser running a cached bundle and for a host with nothing in the way.
 */

/**
 * A flag that may arrive as text.
 *
 * A JSON body carries real booleans, but `!empty('false')` is true and this
 * value decides whether 136 records are written — so a client that ever spells
 * its dry run `apply=false` must not write the roster.
 */
function members_import_flag($value): bool
{
    if (is_bool($value)) return $value;
    $s = strtolower(trim((string)$value));
    return $s !== '' && $s !== '0' && $s !== 'false' && $s !== 'off' && $s !== 'no';
}

/**
 * A roster file's text + the fields beside it → the arguments
 * admin_members_import() takes.
 *
 * Pure on purpose: the endpoint reads the request and hands the text in, so the
 * transport can be tested without a web server in front of it.
 */
function members_import_args(array $fields, string $raw): array
{
    $parsed = members_import_parse($raw);
    if (empty($parsed['ok'])) return ['ok' => false, 'error' => (string)$parsed['error']];

    $source = trim((string)$parsed['source']);
    return ['ok' => true, 'args' => [
        'members'      => $parsed['members'],
        'applicants'   => $parsed['applicants'],
        'apply'        => members_import_flag($fields['apply'] ?? null),
        'overwrite'    => members_import_flag($fields['overwrite'] ?? null),
        // The file names the workbook it came from; the posted value is only the
        // filename the browser had, which is the fallback for a hand-made file.
        'source'       => $source !== '' ? $source : trim((string)($fields['source'] ?? '')),
        'expectDigest' => trim((string)($fields['expectDigest'] ?? '')),
        'fileSha'      => hash('sha256', $raw),
        // How the cards these members already hold read; '' records none.
        'cardFormat'   => array_key_exists('cardFormat', $fields) ? trim((string)$fields['cardFormat']) : 'member-number',
        'idStrict'     => members_import_flag($fields['idStrict'] ?? null),
    ]];
}

/**
 * The facts `members` has no column for.
 *
 * A child's sex, class, local government, home address and second guardian are
 * all things the desk needs and the schema does not carry. They go into `notes`
 * as one fenced block rather than being dropped — losing them on import would
 * mean going back to the spreadsheet for every one of them.
 *
 * Level used to be in here too. It has had its own column since schema 109, so
 * the line stays in the block only for the rows migration 109 backfilled from:
 * removing it would make a re-import look like it had lost something.
 */
function members_import_note(array $row, string $stampedOn): string
{
    $lines = [];
    $facts = array_values(array_filter([
        ($row['level'] ?? '') !== '' ? 'Level ' . $row['level'] : '',
        (string)($row['sex'] ?? ''),
        (string)($row['grade'] ?? ''),
        ($row['lga'] ?? '') !== '' ? $row['lga'] . ' LGA' : '',
    ], fn($v) => $v !== ''));
    if ($facts) $lines[] = implode(' · ', $facts);
    if (($row['address'] ?? '') !== '') $lines[] = 'Home: ' . $row['address'];

    $guardians = [];
    foreach ((array)($row['guardians'] ?? []) as $g) {
        if (!is_array($g)) continue;
        $part = trim(((string)($g['relation'] ?? '')) . ' ' . ((string)($g['name'] ?? '')));
        if (($g['phone'] ?? '') !== '') $part .= ' ' . $g['phone'];
        if (trim($part) !== '') $guardians[] = trim($part);
    }
    if ($guardians) $lines[] = 'Guardians: ' . implode('; ', $guardians);
    if (($row['stateNote'] ?? '') !== '') $lines[] = 'Recorded state: ' . $row['stateNote'];
    if (!empty($row['sources']) && is_array($row['sources'])) $lines[] = 'From sheets: ' . implode(', ', $row['sources']);
    if (!$lines) return '';

    return MEMBER_IMPORT_NOTE_OPEN . "\n"
        . 'Imported from the members workbook on ' . $stampedOn . ".\n"
        . implode("\n", $lines) . "\n" . MEMBER_IMPORT_NOTE_CLOSE;
}

/** Replace this importer's block in an existing note, keeping the rest. */
function members_import_merge_note(string $existing, string $block): string
{
    $open = preg_quote(MEMBER_IMPORT_NOTE_OPEN, '/');
    $close = preg_quote(MEMBER_IMPORT_NOTE_CLOSE, '/');
    $kept = trim((string)preg_replace("/{$open}.*?{$close}/s", '', $existing));
    if ($block === '') return $kept;
    return $kept === '' ? $block : $kept . "\n\n" . $block;
}

/**
 * One roster row → the column patch to write, plus what was wrong with it.
 *
 * @return array{patch: array, errors: string[], notes: string[]}
 */
function members_import_row(array $row, string $stampedOn): array
{
    $errors = [];
    $notes = [];
    $ref = member_id_canonical((string)($row['displayId'] ?? ''));
    $name = trim((string)($row['fullName'] ?? ''));

    /* A missing member ID USED TO REJECT THE ROW. The workbook is filled in
       by hand at a centre, and the ID column is the one most often left for
       later — so the rows most needing to be in the system were the ones the
       importer refused, and the fix was to type an ID into a spreadsheet.
       The app issues IDs now (domain/member-id.php): the row imports, and the
       ID is minted on the way in. A missing NAME is still fatal, because
       nothing can mint that. */
    if ($name === '') $errors[] = 'no name';
    if ($errors) return ['patch' => [], 'errors' => $errors, 'notes' => $notes];

    $status = strtolower(trim((string)($row['status'] ?? '')));
    if ($status === '') {
        $status = 'inactive';
    } elseif (!in_array($status, MEMBER_IMPORT_STATUSES, true)) {
        $notes[] = "status \"{$status}\" is not one the app counts — imported as inactive";
        $status = 'inactive';
    }

    $email = strtolower(trim((string)($row['email'] ?? '')));
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $notes[] = "dropped the unusable email \"{$email}\"";
        $email = '';
    }

    $patch = [
        // '' here means "mint one on insert" — see members_import_apply.
        'displayId'   => $ref,
        'fullName'    => $name,
        'type'        => trim((string)($row['type'] ?? 'NGG')) ?: 'NGG',
        'status'      => $status,
        'centre'      => trim((string)($row['centre'] ?? '')),
        /* THE INTAKE YEAR, not a Summer School edition. `cohort` on a member
           row is where the printed ID's prefix comes from (023- ⇒ 2023);
           `cohortId` on every summer table means an edition. One word, two
           meanings — see domain/member-id.php, which pins the member's. */
        'cohort'      => trim((string)($row['cohort'] ?? '')),
        'track'       => strtoupper(trim((string)($row['track'] ?? ''))),
        'disciplines' => strtoupper(trim((string)($row['disciplines'] ?? ''))),
        'level'       => strtoupper(trim((string)($row['level'] ?? ''))),
        /* The division (brief §5). A workbook may name it directly, and where
           it does not, the member's track decides — the same mapping the 115
           backfill uses, so an import and a migration cannot disagree about
           where a child sits. An unrecognised value becomes blank rather than
           a guess: unplaced is a question a lead will ask, misplaced is a
           wrong answer nobody thinks to check. */
        'division'    => (function () use ($row) {
            $named = nggc_division((string)($row['division'] ?? ''));
            if ($named) return $named['id'];
            return nggc_division_for_track((string)($row['track'] ?? ''));
        })(),
        'joinDate'    => trim((string)($row['joinDate'] ?? '')),
        'dob'         => trim((string)($row['dob'] ?? '')),
        'email'       => $email,
        'phone'       => trim((string)($row['phone'] ?? '')),
        'school'      => trim((string)($row['school'] ?? '')),
        'parentName'  => trim((string)($row['parentName'] ?? '')),
        'parentPhone' => trim((string)($row['parentPhone'] ?? '')),
    ];

    /* Dates as the app reads them. The column used to take whatever the sheet
       held, so "15/03/2023" was stored as written and the roster showed "—"
       for it: no screen, sort or count can read a day-first string. A date
       that cannot be read at all is left out and named, not stored. */
    foreach (['joinDate' => 'join date', 'dob' => 'date of birth'] as $col => $what) {
        $iso = member_date($patch[$col]);
        if ($iso === null) {
            $notes[] = "the {$what} \"{$patch[$col]}\" could not be read as a date — left blank";
            $patch[$col] = '';
        } else {
            $patch[$col] = $iso;
        }
    }

    foreach (MEMBER_IMPORT_WIDTHS as $col => $max) {
        if (isset($patch[$col]) && mb_strlen($patch[$col]) > $max) {
            $patch[$col] = mb_substr($patch[$col], 0, $max);
            $notes[] = "{$col} was longer than the column and has been cut to {$max} characters";
        }
    }

    $patch['notes'] = members_import_note($row, $stampedOn);
    return ['patch' => $patch, 'errors' => [], 'notes' => $notes];
}

/**
 * Find the member a roster row already refers to.
 *
 * The printed ID is the only identifier both sides genuinely share, so it
 * decides first. The fallbacks exist for members the Control Room created
 * before the sheet was imported, and both need two facts to agree: siblings on
 * these forms share one parent's email address, and matching on an email alone
 * would file a younger child's record on top of an older one's.
 */
function members_import_match(array $patch, ?string &$by = null): ?array
{
    $by = null;
    if ($patch['displayId'] !== '') {
        /* The claim first: after a merge the retired record still carries the
           number on paper, but the claim — and the person — moved to the
           survivor, which is the record this row is about. */
        $holder = member_id_claimed_by($patch['displayId']);
        $hit = $holder !== null ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$holder]) : null;
        $hit = $hit ?: db_row("SELECT * FROM members WHERE UPPER(displayId) = ? ORDER BY (COALESCE(status,'') = 'merged'), id LIMIT 1", [strtoupper($patch['displayId'])]);
        if ($hit) { $by = 'id'; return $hit; }
    }
    $by = 'person';
    if ($patch['dob'] !== '') {
        $hit = db_row('SELECT * FROM members WHERE lower(fullName) = ? AND dob = ? LIMIT 1',
            [mb_strtolower($patch['fullName']), $patch['dob']]);
        if ($hit) return $hit;
    }
    if ($patch['email'] !== '') {
        $hit = db_row('SELECT * FROM members WHERE lower(email) = ? AND lower(fullName) = ? LIMIT 1',
            [$patch['email'], mb_strtolower($patch['fullName'])]);
        if ($hit) return $hit;
    }
    return null;
}

/**
 * A digest of what a roster file would DO, independent of how it is written.
 *
 * Three jobs, and the first is the one that closes a real hole:
 *
 *  1. The drawer's whole safety property is "read the dry run, THEN apply".
 *     But preview and apply are two separate posts, each carrying its own copy
 *     of the payload from the browser — so nothing stopped an apply writing a
 *     different file from the one whose numbers the operator just read and
 *     confirmed. The preview returns this digest; the apply sends it back; the
 *     server recomputes it from the payload actually received and refuses on a
 *     mismatch. Re-picking a file mid-flow, two admins working at once, a stale
 *     tab — all of them now fail closed instead of silently writing.
 *  2. It says, afterwards, WHICH roster was loaded. `source` is a filename a
 *     person can rename; this is not.
 *  3. It recognises a file that has already been applied, so the second run of
 *     the same roster can say so before it repeats the work.
 *
 * ── What it covers, and why ──────────────────────────────────────────────────
 * The OUTCOME, not the bytes. The browser re-serialises the file before posting
 * it, so byte equality is not available server-side and would not be the right
 * question anyway: two files that differ only in key order, row order or
 * whitespace produce exactly the same import.
 *
 *   · rows are sorted, because the importer matches on displayId — the order
 *     the extractor happened to emit sheets in does not change the result
 *   · keys within a row are sorted, because JSON object order is not meaningful
 *   · blank values are dropped, so `"phone": ""` and an absent `phone` agree —
 *     which is what fill-blanks does with them anyway
 *   · non-scalars are flattened to comma-joined scalars (`sources`), the one
 *     shape the extractor emits
 *
 * Unit separators (\x1f between fields, \x1e between key and value) rather than
 * a printable delimiter: they cannot occur in a value read out of a workbook,
 * so no combination of names and addresses can forge a collision by containing
 * the separator.
 *
 * NOT a hash of the file on disk. That one is raw SHA-256 over the bytes, is
 * printed by tools/ngg-import/extract.js, and is shown in the drawer for the
 * file it just read — see members_import_file_sha_note() below. The two answer
 * different questions: "is this the file the extractor made" versus "is this
 * the import I previewed".
 */
function members_import_digest(array $rows, array $extra = []): string
{
    $canon = [];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $fields = [];
        foreach ($row as $k => $v) {
            if (is_array($v)) {
                $flat = [];
                foreach ($v as $x) { if (is_scalar($x)) $flat[] = (string)$x; }
                $v = implode(',', $flat);
            } elseif (is_bool($v)) {
                $v = $v ? '1' : '0';
            } elseif ($v === null) {
                $v = '';
            } elseif (!is_scalar($v)) {
                continue;
            }
            $v = trim((string)$v);
            if ($v === '') continue;
            $fields[] = (string)$k . "\x1e" . $v;
        }
        sort($fields, SORT_STRING);
        $canon[] = implode("\x1f", $fields);
    }
    sort($canon, SORT_STRING);
    /* $extra: what else decides the outcome — the declared id shapes and
       whether undeclared ones are refused. Declaring a shape after reading a
       dry run changes what the apply would do, so it changes the digest too. */
    if ($extra) { ksort($extra); $canon[] = "\x1d" . json_encode($extra); }
    return hash('sha256', implode("\n", $canon));
}

/** The parts of the outcome that are not in the file: declared id shapes, and strictness. */
function members_import_digest_extra(bool $strict, array $applicants = []): array
{
    $masks = array_map(static fn($f) => (string)$f['mask'], member_id_formats());
    sort($masks, SORT_STRING);
    $extra = ['idShapes' => $masks, 'idStrict' => $strict];
    /* Applicants are filed on apply, so they are part of what is confirmed —
       but only named when present, so a file without any keeps its digest. */
    if ($applicants) $extra['applicants'] = members_import_digest($applicants);
    return $extra;
}

/** Two rows, or a row and a record, that are plausibly one person. */
function members_import_same_person(array $a, array $b): bool
{
    $key = static function (string $n): string {
        $t = preg_split('/\s+/', mb_strtolower(trim(preg_replace('/[^\p{L}\s]/u', ' ', $n) ?? ''))) ?: [];
        $t = array_values(array_filter($t)); sort($t); return implode(' ', $t);
    };
    if ($key((string)($a['fullName'] ?? '')) !== '' && $key((string)($a['fullName'] ?? '')) === $key((string)($b['fullName'] ?? ''))) return true;
    $dob = trim((string)($a['dob'] ?? ''));
    if ($dob !== '' && $dob === trim((string)($b['dob'] ?? ''))) return true;
    $em = strtolower(trim((string)($a['email'] ?? '')));
    return $em !== '' && $em === strtolower(trim((string)($b['email'] ?? '')));
}

/**
 * Has this exact roster been applied before, and when?
 *
 * Returns the most recent applied run for the digest, or null. The drawer shows
 * it BEFORE the apply button, because "you already loaded this file on the 3rd"
 * is the thing that stops somebody re-running an import they half-remember.
 */
function members_import_previous(string $digest): ?array
{
    if ($digest === '') return null;
    $r = db_row("SELECT * FROM member_import_runs WHERE digest = ? ORDER BY id DESC LIMIT 1", [$digest]);
    return $r ?: null;
}

/**
 * Import a roster.
 *
 * @param array $rows  roster rows, as `members` in the extract file
 * @param array $opts  apply: actually write (default false — the caller has to
 *                       ask, because the point of the dry run is that it is the
 *                       default); overwrite: replace values the record already
 *                       has (default false, fill blanks only); actor: audit
 *                       actor id; emitEvents: fan out member.created/updated to
 *                       the outbox (default false — a backfill of a whole
 *                       roster should not page every integration).
 * @return array{ok: bool, applied: bool, created: int, updated: int, unchanged: int,
 *                failed: int, rows: array}
 */
function members_import_run(array $rows, array $opts = []): array
{
    $apply      = !empty($opts['apply']);
    $overwrite  = !empty($opts['overwrite']);
    $emitEvents = !empty($opts['emitEvents']);
    $actor      = (string)($opts['actor'] ?? 'cli:seed-members');
    $stampedOn  = gmdate('Y-m-d');

    /* Computed over the rows AS GIVEN, before any parsing or truncation — the
       digest has to identify the file the operator is holding, not what this
       function made of it. */
    $strict = !empty($opts['idStrict']);
    $applicants = is_array($opts['applicants'] ?? null) ? array_values(array_filter($opts['applicants'], 'is_array')) : [];
    $digest = members_import_digest($rows, members_import_digest_extra($strict, $applicants));
    $report = ['ok' => true, 'applied' => $apply, 'created' => 0, 'updated' => 0,
               'unchanged' => 0, 'failed' => 0, 'rows' => [],
               'digest' => $digest, 'rowCount' => count($rows),
               /* The last time this exact roster was applied, if ever. Read on
                  a dry run too — especially on a dry run: "you already loaded
                  this on the 3rd" is what stops a half-remembered re-import. */
               'previous' => members_import_previous($digest)];

    /* Cards. An imported member used to arrive with no card the gate could
       read. Every NGG member the import touches — created, updated or left
       unchanged — gets a secure card if they have none, and the card they
       already hold is recorded by the format the importer names (by default
       the member number printed on it). A row's own `cardCode` is the code on
       an old card that matches no field. On a dry run this is counted, not
       done. */
    $cardFormat = array_key_exists('cardFormat', $opts) ? (string)$opts['cardFormat'] : 'member-number';
    if ($cardFormat !== '' && !member_card_format($cardFormat)) {
        return ['ok' => false, 'error' => 'unknown_card_format', 'detail' => 'No card format "' . $cardFormat . '". Add it first, or pick one of the formats listed.'];
    }
    $report['cards'] = ['format' => $cardFormat, 'issued' => 0, 'printed' => 0, 'taken' => 0, 'wouldIssue' => 0];
    $card = static function (array $member, array $row) use (&$report, $apply, $cardFormat, $actor): void {
        if (!member_is_ngg($member)) return;
        if (!$apply) {
            if (empty($member['memberId']) || member_card_secure((string)$member['memberId']) === null) $report['cards']['wouldIssue']++;
            return;
        }
        $r = member_cards_ensure($member, $actor, 'import', $cardFormat !== '' ? [$cardFormat, (string)($row['cardCode'] ?? '')] : null);
        if ($r['issued']) $report['cards']['issued']++;
        if ($r['printed'] === 'recorded') $report['cards']['printed']++;
        if ($r['printed'] === 'taken') $report['cards']['taken']++;
    };

    /* ── IDs, before any row is written ─────────────────────────────────────
     * Every id in the file is read first, so that:
     *   · an id on two rows of the file is caught before either is written
     *     (it used to match the first one's new record and overwrite it);
     *   · minting for rows with no id skips every id the file carries;
     *   · an id in no declared shape is reported with its shape, so the
     *     importer can declare it (or, strict, it is refused rather than
     *     filed as a typo nobody notices).
     * A dry run projects the very ids the apply will mint: same rows, same
     * order, same reservations, nothing written. */
    $report['ids'] = ['kept' => 0, 'issued' => 0, 'normalized' => 0, 'refused' => 0, 'undeclared' => [], 'strict' => $strict];
    /* What to write back into the workbook: every row whose printed ID was
       issued here or read differently from how the sheet spells it. The
       drawer offers it as a CSV, so the sheet stops being the place an ID is
       missing — the next import then matches on the ID, not on the name. */
    $report['idList'] = [];
    $listId = static function (array $row, string $name, string $id, string $action, string $memberId) use (&$report): void {
        $report['idList'][] = ['name' => $name, 'sheet' => trim((string)($row['displayId'] ?? '')), 'displayId' => $id,
                               'action' => $action, 'memberId' => $memberId];
    };
    $byId = []; $reserved = [];
    foreach ($rows as $i => $row) {
        $c = member_id_canonical((string)(is_array($row) ? ($row['displayId'] ?? '') : ''));
        if ($c === '') continue;
        $byId[$c][] = $i;
        $reserved[$c] = true;
    }
    $dupeOf = [];
    foreach ($byId as $c => $idx) {
        if (count($idx) < 2) continue;
        foreach (array_slice($idx, 1) as $j) $dupeOf[$j] = $idx[0];
    }
    $minted = [];
    /* A dry run projects; an apply mints AND claims, so a desk write racing
       the import cannot be handed the same number (member_display_ids). */
    $mint = static function (array $m, string $memberId) use (&$reserved, &$minted, $apply): string {
        $id = $apply ? member_mint_and_claim($m, $memberId, array_keys($reserved))
                     : member_mint_display_id($m, array_keys($reserved));
        if ($id === '') return '';
        $reserved[$id] = true; $minted[] = $id;
        return $id;
    };
    /* Somebody else's claim on the number this row carries: memberId of the
       record it would be written to ('' for a new one). */
    $claimedElsewhere = static function (string $id, string $memberId): ?array {
        if ($id === '') return null;
        $holder = member_id_claimed_by($id);
        if ($holder === null || $holder === $memberId) return null;
        $r = db_row('SELECT memberId, fullName FROM members WHERE memberId = ? LIMIT 1', [$holder]);
        return ['memberId' => $holder, 'fullName' => (string)($r['fullName'] ?? $holder)];
    };

    foreach ($rows as $i => $row) {
        $label = trim((string)($row['displayId'] ?? '')) ?: ('row ' . ($i + 1));
        $parsed = members_import_row(is_array($row) ? $row : [], $stampedOn);
        if (!$parsed['errors'] && $parsed['patch']['displayId'] !== '') {
            $c = $parsed['patch']['displayId'];
            /* No intake year on the row, but the ID says one — 019-004, or an
               older shape whose declared format names where the year sits. */
            if ($parsed['patch']['cohort'] === '' && ($y = member_id_year($c)) > 0) {
                $parsed['patch']['cohort'] = (string)$y;
                $parsed['notes'][] = 'intake year ' . $y . ' read from member ID ' . $c;
            }
            if (strtoupper(preg_replace('/\s+/', '', trim((string)$row['displayId'])) ?? '') !== $c) {
                $parsed['notes'][] = 'member ID "' . trim((string)$row['displayId']) . '" read as ' . $c;
                $report['ids']['normalized']++;
            }
            if (isset($dupeOf[$i])) {
                $first = $rows[$dupeOf[$i]];
                $parsed['errors'][] = 'member ID ' . $c . ' is also on row ' . ($dupeOf[$i] + 1)
                    . (members_import_same_person($parsed['patch'], is_array($first) ? $first : []) ? ' (the same person twice — merge the rows in the sheet)' : ' ("' . (string)($first['fullName'] ?? '') . '") — one ID, one person');
            } elseif (member_is_ngg($parsed['patch']) && member_id_format_of($c) === null) {
                $shape = member_id_shape($c);
                $u = &$report['ids']['undeclared'][$shape];
                $u = $u ?? ['shape' => $shape, 'count' => 0, 'examples' => []];
                $u['count']++; if (count($u['examples']) < 3) $u['examples'][] = $c;
                unset($u);
                /* A near miss of the house shape is usually a typo — O for 0,
                   a dropped dash. Say what it probably is, and whose that is. */
                $sug = member_id_suggest($c);
                $hint = $sug ? ' — did you mean ' . $sug['id'] . ($sug['holder'] !== null ? ' (' . $sug['holder'] . ')' : '') . '?' : '';
                if ($sug && count($report['ids']['undeclared'][$shape]['suggest'] ?? []) < 3) $report['ids']['undeclared'][$shape]['suggest'][] = ['from' => $c] + $sug;
                if ($strict) $parsed['errors'][] = 'member ID ' . $c . ' fits no declared ID format (' . $shape . ')' . ($hint !== '' ? $hint : ' — declare it, or correct the sheet');
                else $parsed['notes'][] = 'member ID ' . $c . ' fits no declared ID format (' . $shape . ')' . ($hint !== '' ? $hint : ' — declare it so the gate reads these cards');
            }
            if ($parsed['errors']) $report['ids']['refused']++;
        }

        if ($parsed['errors']) {
            $report['failed']++;
            $report['rows'][] = ['ref' => $label, 'action' => 'failed',
                                 'name' => (string)($row['fullName'] ?? ''),
                                 'detail' => implode('; ', $parsed['errors']),
                                 'reasons' => $parsed['errors']];
            continue;
        }

        $patch = $parsed['patch'];
        $notes = $parsed['notes'];
        $existing = members_import_match($patch, $matchedBy);

        /* Matched ON THE ID to a record that is somebody else: the ID clash
           that used to overwrite them. Same person means the name, the date of
           birth or the email agree; otherwise the row is refused, naming who
           the ID belongs to here. */
        if ($existing && $matchedBy === 'id' && !members_import_same_person($patch, $existing)) {
            $report['failed']++; $report['ids']['refused']++;
            $why = 'member ID ' . $patch['displayId'] . ' belongs to ' . (string)$existing['fullName'] . ' here, not ' . $patch['fullName'];
            $report['rows'][] = ['ref' => $label, 'action' => 'failed', 'name' => $patch['fullName'], 'detail' => $why, 'reasons' => [$why]];
            continue;
        }
        /* Matched on the PERSON, and the sheet names an id. If the record has
           a different one, the record's stands — a printed ID is never
           reissued by an import. If the record has none and the sheet's is
           already somebody else's, it is refused rather than given twice. */
        if ($existing && $matchedBy === 'person' && $patch['displayId'] !== '') {
            $have = strtoupper(trim((string)($existing['displayId'] ?? '')));
            if ($have !== '' && $have !== strtoupper($patch['displayId'])) {
                $notes[] = 'the sheet says ' . $patch['displayId'] . ' but this member already carries ' . $have . ' — kept ' . $have . ' (a printed ID is never changed by an import)';
                $patch['displayId'] = '';
            } elseif ($have === '' && ($holder = db_row('SELECT memberId, fullName FROM members WHERE UPPER(displayId) = ? AND id <> ? LIMIT 1', [strtoupper($patch['displayId']), (int)$existing['id']])
                                         ?: $claimedElsewhere($patch['displayId'], (string)$existing['memberId']))) {
                $report['failed']++; $report['ids']['refused']++;
                $why = 'member ID ' . $patch['displayId'] . ' already belongs to ' . (string)$holder['fullName'];
                $report['rows'][] = ['ref' => $label, 'action' => 'failed', 'name' => $patch['fullName'], 'detail' => $why, 'reasons' => [$why]];
                continue;
            }
        }

        if (!$existing && ($taken = $claimedElsewhere($patch['displayId'], ''))) {
            /* Nobody here carries it, yet it is claimed — a record that has
               since been renumbered or merged away. Still not free. */
            $report['failed']++; $report['ids']['refused']++;
            $why = 'member ID ' . $patch['displayId'] . ' already belongs to ' . $taken['fullName'];
            $report['rows'][] = ['ref' => $label, 'action' => 'failed', 'name' => $patch['fullName'], 'detail' => $why, 'reasons' => [$why]];
            continue;
        }

        if (!$existing) {
            $insert = array_filter($patch, fn($v) => $v !== '');
            $insert['memberId']  = new_id('NGG', 'members', 'memberId');
            $insert['role']      = 'member';
            $insert['createdAt'] = now_iso();
            $insert['updatedAt'] = now_iso();
            /* No printed ID in the sheet ⇒ issue one, in the workbook's own
               YYY-NNN shape, from the intake year the row carries. Minted only
               on APPLY: a dry run must not consume serials, or previewing an
               import twice would leave gaps in the roster's numbering. */
            if (trim((string)($insert['displayId'] ?? '')) === '' && member_is_ngg($insert)) {
                $insert['displayId'] = $mint($insert, $insert['memberId']);
                if ($insert['displayId'] === '') {
                    unset($insert['displayId']);
                    $notes[] = 'no member ID could be issued (every candidate was taken) — issue one from the roster';
                } else {
                    $notes[] = ($apply ? 'issued member ID ' : 'will be issued member ID ') . $insert['displayId'];
                    $report['ids']['issued']++;
                    $listId(is_array($row) ? $row : [], $patch['fullName'], $insert['displayId'], 'issued', $apply ? $insert['memberId'] : '');
                }
            } elseif (trim((string)($insert['displayId'] ?? '')) !== '') {
                /* The sheet's own number, claimed before the row is written:
                   a desk edit that took it a moment ago wins, and this row is
                   refused rather than written as the second holder. */
                if ($apply && member_is_ngg($insert) && !member_id_claim($insert['memberId'], $insert['displayId'])) {
                    $report['failed']++; $report['ids']['refused']++;
                    $why = 'member ID ' . $insert['displayId'] . ' was taken while this import ran';
                    $report['rows'][] = ['ref' => $label, 'action' => 'failed', 'name' => $patch['fullName'], 'detail' => $why, 'reasons' => [$why]];
                    continue;
                }
                $report['ids']['kept']++;
                if (in_array('member ID "' . trim((string)($row['displayId'] ?? '')) . '" read as ' . $insert['displayId'], $notes, true)) {
                    $listId(is_array($row) ? $row : [], $patch['fullName'], $insert['displayId'], 'normalized', $apply ? $insert['memberId'] : '');
                }
            }
            if (!$apply) $card($insert + ['memberId' => ''], is_array($row) ? $row : []);
            if ($apply) {
                db_insert('members', $insert);
                $card($insert, is_array($row) ? $row : []);
                audit('member.import.create', $actor, $insert['memberId'], ['displayId' => $patch['displayId']], '');
                if ($emitEvents) event_emit('member.created', [
                    'memberId' => $insert['memberId'], 'fullName' => $patch['fullName'],
                    'type' => $patch['type'], 'centre' => $patch['centre']]);
            }
            $report['created']++;
            $report['rows'][] = ['ref' => $label, 'action' => 'create', 'name' => $patch['fullName'],
                                 'memberId' => $apply ? $insert['memberId'] : '(assigned on apply)',
                                 'displayId' => (string)($insert['displayId'] ?? ''),
                                 'detail' => trim($patch['status'] . ' · ' . $patch['centre'], ' ·'),
                                 'fields' => array_keys($insert), 'warnings' => $notes];
            continue;
        }

        /* A member who has been given staff access is not a spreadsheet row any
           more. Their profile can still be filled in, but the sheet must not
           decide whether an admin is suspended, or silently rename them. */
        $isStaff = function_exists('is_admin_role') && is_admin_role((string)($existing['role'] ?? ''));
        $locked = $isStaff ? ['status', 'fullName', 'email'] : [];
        /* The printed ID is never changed by an import, overwrite or not. */
        if (trim((string)($existing['displayId'] ?? '')) !== '') $locked[] = 'displayId';
        /* A member already here with NO printed ID — created on the desk, or
           imported before the minter existed — is given one now. Matching an
           existing record used to skip minting entirely, so these members
           never got an ID however many times the roster was imported. */
        if (trim((string)($existing['displayId'] ?? '')) === '' && $patch['displayId'] === '' && member_is_ngg($existing + $patch)) {
            $patch['displayId'] = $mint(array_merge($existing, array_filter($patch, fn($v) => $v !== '')), (string)$existing['memberId']);
            if ($patch['displayId'] === '') {
                $notes[] = 'no member ID could be issued (every candidate was taken) — issue one from the roster';
            } else {
                $notes[] = ($apply ? 'issued member ID ' : 'will be issued member ID ') . $patch['displayId'];
                $report['ids']['issued']++;
                $listId(is_array($row) ? $row : [], $patch['fullName'], $patch['displayId'], 'issued', (string)$existing['memberId']);
            }
        } elseif (trim((string)($existing['displayId'] ?? '')) === '' && $patch['displayId'] !== '') {
            /* The record has none and the sheet names one: claimed for them
               now, or refused if a desk write got there first. */
            if ($apply && member_is_ngg($existing + $patch) && !member_id_claim((string)$existing['memberId'], $patch['displayId'])) {
                $report['failed']++; $report['ids']['refused']++;
                $why = 'member ID ' . $patch['displayId'] . ' was taken while this import ran';
                $report['rows'][] = ['ref' => $label, 'action' => 'failed', 'name' => $patch['fullName'], 'detail' => $why, 'reasons' => [$why]];
                continue;
            }
            $report['ids']['kept']++;
        } elseif (trim((string)($existing['displayId'] ?? '')) !== '') {
            $report['ids']['kept']++;
            /* The sheet spells the record's number differently (o24-016 for
               024-016), or not at all: the workbook should carry the real one. */
            $sheetId = trim((string)($row['displayId'] ?? ''));
            if ($sheetId !== (string)$existing['displayId']) {
                $listId(is_array($row) ? $row : [], $patch['fullName'], (string)$existing['displayId'], $sheetId === '' ? 'matched' : 'normalized', (string)$existing['memberId']);
            }
        }
        if ($isStaff) $notes[] = 'holds the ' . $existing['role'] . ' role — status, name and email left as they are';

        $changes = [];
        foreach ($patch as $col => $value) {
            if ($value === '' || in_array($col, $locked, true)) continue;
            $current = (string)($existing[$col] ?? '');
            if ($col === 'notes') {
                $value = members_import_merge_note($current, $value);
            } elseif ($current !== '' && !$overwrite) {
                continue;
            }
            if ($current === $value) continue;
            $changes[$col] = $value;
        }

        $card($existing, is_array($row) ? $row : []);
        if (!$changes) {
            $report['unchanged']++;
            $report['rows'][] = ['ref' => $label, 'action' => 'unchanged', 'name' => $patch['fullName'],
                                 'memberId' => (string)$existing['memberId'], 'displayId' => (string)($existing['displayId'] ?? ''), 'detail' => '', 'warnings' => $notes];
            continue;
        }

        if ($apply) {
            $changes['updatedAt'] = now_iso();
            db_update('members', $changes, ['id' => $existing['id']]);
            audit('member.import.update', $actor, (string)$existing['memberId'],
                  ['displayId' => $patch['displayId'], 'fields' => array_keys($changes)], '');
            if ($emitEvents) event_emit('member.updated', ['memberId' => (string)$existing['memberId']] + $changes);
        }
        $report['updated']++;
        $report['rows'][] = ['ref' => $label, 'action' => 'update', 'name' => $patch['fullName'],
                             'memberId' => (string)$existing['memberId'],
                             'displayId' => (string)($changes['displayId'] ?? $existing['displayId'] ?? ''),
                             'fields' => array_keys(array_diff_key($changes, ['updatedAt' => 1])),
                             'detail' => implode(', ', array_keys(array_diff_key($changes, ['updatedAt' => 1]))),
                             'warnings' => $notes];
    }

    /* ── Applicants ───────────────────────────────────────────────────────────
     * A child on the registration form with no roster row is not a member, and
     * the import does not make them one. They are filed as an application —
     * the desk's ordinary queue — so somebody decides; confirming one is the
     * application convert, which creates the member and issues the printed ID.
     * `importKey` makes it idempotent: the same file applied twice files each
     * child once, and a child the desk already rejected is not filed again. */
    $report['applicants'] = ['filed' => 0, 'already' => 0, 'onRoster' => 0, 'invalid' => 0, 'rows' => []];
    foreach ($applicants as $a) {
        $name = trim(preg_replace('/\s+/', ' ', (string)($a['fullName'] ?? '')) ?? '');
        $key = substr(trim((string)($a['importKey'] ?? '')), 0, 80);
        if ($key === '' && $name !== '') $key = 'intake:' . mb_strtolower($name);
        if (mb_strlen($name) < 2 || $key === '') { $report['applicants']['invalid']++; continue; }
        $dob = trim((string)($a['dob'] ?? ''));
        if ($dob !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob)) $dob = '';
        $em = strtolower(trim((string)($a['email'] ?? '')));
        if ($em !== '' && !filter_var($em, FILTER_VALIDATE_EMAIL)) $em = '';
        $line = ['name' => $name, 'dob' => $dob, 'action' => 'file'];
        if (db_row('SELECT id FROM applications WHERE importKey = ? LIMIT 1', [$key])) {
            $line['action'] = 'already'; $report['applicants']['already']++;
        } elseif (($m = db_row('SELECT memberId, fullName, displayId FROM members WHERE lower(fullName) = ?' . ($dob !== '' ? ' AND (dob = ? OR COALESCE(dob,\'\') = \'\')' : '') . ' LIMIT 1',
                                 $dob !== '' ? [mb_strtolower($name), $dob] : [mb_strtolower($name)]))) {
            /* Already a member here — added on the desk, say — with no row in
               this sheet. Nothing to file; the sheet is the thing missing them. */
            $line['action'] = 'onRoster'; $line['memberId'] = (string)$m['memberId']; $line['displayId'] = (string)($m['displayId'] ?? '');
            $report['applicants']['onRoster']++;
        } else {
            $report['applicants']['filed']++;
            if ($apply) {
                $parent = trim((string)($a['parentName'] ?? ''));
                db_insert('applications', [
                    'kind' => 'teen', 'program' => 'anchor', 'status' => 'new',
                    'name' => substr($name, 0, 120), 'dob' => $dob, 'email' => substr($em, 0, 160),
                    // The teen intake's phone is the guardian's; convert files it as parentPhone.
                    'phone' => substr(trim((string)($a['parentPhone'] ?? '')) ?: trim((string)($a['phone'] ?? '')), 0, 48),
                    'sex' => substr(trim((string)($a['sex'] ?? '')), 0, 16),
                    'centre' => '', 'track' => '',
                    'why' => 'Registered on the intake form but has no row on the roster (imported from '
                        . ((string)($opts['source'] ?? '') ?: 'the roster workbook') . ').'
                        . ($parent !== '' ? ' Guardian: ' . $parent . '.' : '')
                        . (trim((string)($a['school'] ?? '')) !== '' ? ' School: ' . trim((string)$a['school']) . '.' : ''),
                    'importKey' => $key, 'createdAt' => now_iso(), 'ip' => '',
                ]);
            }
        }
        $report['applicants']['rows'][] = $line;
    }

    if ($apply) {
        audit('member.import.run', $actor, '', [
            'digest' => $digest,
            'created' => $report['created'], 'updated' => $report['updated'],
            'unchanged' => $report['unchanged'], 'failed' => $report['failed'],
            'applicantsFiled' => $report['applicants']['filed']], '');
        /* The durable record, next to the audit row rather than instead of it:
           audit logs get pruned, and "which roster is this site running" is a
           question somebody asks about a site that has been live for years. */
        db_insert('member_import_runs', [
            'digest' => $digest,
            'fileSha' => substr((string)($opts['fileSha'] ?? ''), 0, 64),
            'source' => substr((string)($opts['source'] ?? ''), 0, 255),
            'actorId' => substr($actor, 0, 64),
            'overwrite' => $overwrite ? 1 : 0,
            'created' => $report['created'], 'updated' => $report['updated'],
            'unchanged' => $report['unchanged'], 'failed' => $report['failed'],
            'rowCount' => count($rows), 'at' => now_iso(),
        ]);
        if (function_exists('cache_invalidate')) cache_invalidate('students');
    }
    return $report;
}

/**
 * The Control Room's way in — a roster import for a host with no shell.
 *
 * Most of NGG runs on shared hosting where there is no SSH and no cron, so a
 * CLI-only importer is an importer the person who actually keeps the roster
 * cannot run. This is the same import behind an admin session: the browser
 * reads the roster file, posts it, and gets back the identical dry run the
 * command line prints.
 *
 * Reading what an import WOULD do needs the 'people' capability. Applying it
 * needs 'rbac' — the super-admin tier — because a roster file rewrites the
 * membership table in one action, and that is a different kind of decision from
 * editing one child's record.
 */
function admin_members_import(array $p): array
{
    $g = admin_cap_gate($p, 'people');
    if (!$g['ok']) return $g;

    $apply = !empty($p['apply']);
    if ($apply && !in_array('rbac', member_effective_caps($g['requester']), true)) {
        return ['ok' => false, 'error' => 'forbidden',
                'detail' => 'Applying a roster import needs super-admin access. The preview does not.'];
    }

    $rows = is_array($p['members'] ?? null) ? $p['members'] : null;
    if ($rows === null) return ['ok' => false, 'error' => 'no_members_array'];
    if (!$rows) return ['ok' => false, 'error' => 'roster_empty'];
    /* A ceiling, not a capacity limit: NGG has had 136 members in three years,
       so a file with thousands of rows in it is the wrong file. */
    if (count($rows) > 2000) return ['ok' => false, 'error' => 'too_many_rows',
                                     'detail' => count($rows) . ' rows — that is not this roster.'];

    /* ── The apply must apply the file that was previewed ────────────────────
     *
     * The drawer's safety property is "read the dry run, THEN apply", and the
     * confirm dialog quotes the dry run's numbers back at the operator. But the
     * two are separate posts, each carrying its own copy of the payload from
     * the browser, so nothing tied the second to the first: re-pick a file
     * after reading the preview and the confirmation describes one roster while
     * the write performs another. It fails closed now.
     *
     * The client cannot forge its way past this by echoing whatever it likes —
     * the digest is recomputed here, from the payload actually received, and
     * the echo only has to MATCH. A wrong or absent echo is refused. */
    $strict = !empty($p['idStrict']);
    $applicants = is_array($p['applicants'] ?? null) ? array_values(array_filter($p['applicants'], 'is_array')) : [];
    if (count($applicants) > 2000) return ['ok' => false, 'error' => 'too_many_rows', 'detail' => count($applicants) . ' applicants — that is not this roster.'];
    $digest = members_import_digest($rows, members_import_digest_extra($strict, $applicants));
    if ($apply) {
        $expect = trim((string)($p['expectDigest'] ?? ''));
        if ($expect === '') {
            return ['ok' => false, 'error' => 'preview_required',
                    'detail' => 'Read the dry run first — an apply has to name the import it is applying.'];
        }
        if (!hash_equals($digest, $expect)) {
            return ['ok' => false, 'error' => 'roster_changed',
                    'detail' => 'This is not the file you previewed. Read the dry run again before applying.',
                    'digest' => $digest];
        }
    }

    $report = members_import_run($rows, [
        'apply' => $apply,
        'overwrite' => !empty($p['overwrite']),
        'emitEvents' => false,
        'actor' => (string)($g['requester']['memberId'] ?? 'admin'),
        'source' => (string)($p['source'] ?? ''),
        // Raw sha256 of the bytes the browser read, so the row can be matched
        // against what extract.js printed. Never trusted for anything.
        'fileSha' => (string)($p['fileSha'] ?? ''),
        // The format the cards these members already hold are read by.
        'cardFormat' => array_key_exists('cardFormat', $p) ? (string)$p['cardFormat'] : 'member-number',
        // Refuse ids that fit no declared shape, rather than import them with a warning.
        'idStrict' => $strict,
        'applicants' => $applicants,
    ]);
    if (empty($report['ok'])) return $report;

    audit($apply ? 'member.import.web.apply' : 'member.import.web.preview',
          (string)($g['requester']['memberId'] ?? ''), '',
          ['source' => (string)($p['source'] ?? ''), 'digest' => $report['digest'],
           'fileSha' => substr((string)($p['fileSha'] ?? ''), 0, 64),
           'created' => $report['created'],
           'updated' => $report['updated'], 'failed' => $report['failed']],
          (string)($p['ip'] ?? ''));

    /* The full row list for 136 members is a lot of JSON to render and most of
       it says "nothing to do". Send back what the operator has to read. */
    $report['rows'] = array_values(array_filter($report['rows'],
        fn($r) => $r['action'] !== 'unchanged' || !empty($r['warnings'])));
    return $report;
}
