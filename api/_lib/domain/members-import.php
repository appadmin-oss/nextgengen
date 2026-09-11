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
    'centre' => 32, 'track' => 64, 'cohort' => 64, 'joinDate' => 40, 'dob' => 40,
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
    return ['ok' => true, 'members' => array_values($rows), 'source' => (string)($data['source'] ?? ''),
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
        'apply'        => members_import_flag($fields['apply'] ?? null),
        'overwrite'    => members_import_flag($fields['overwrite'] ?? null),
        // The file names the workbook it came from; the posted value is only the
        // filename the browser had, which is the fallback for a hand-made file.
        'source'       => $source !== '' ? $source : trim((string)($fields['source'] ?? '')),
        'expectDigest' => trim((string)($fields['expectDigest'] ?? '')),
        'fileSha'      => hash('sha256', $raw),
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
    $ref = trim((string)($row['displayId'] ?? ''));
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
        'cohort'      => trim((string)($row['cohort'] ?? '')),
        'track'       => strtoupper(trim((string)($row['track'] ?? ''))),
        'disciplines' => strtoupper(trim((string)($row['disciplines'] ?? ''))),
        'level'       => strtoupper(trim((string)($row['level'] ?? ''))),
        'joinDate'    => trim((string)($row['joinDate'] ?? '')),
        'dob'         => trim((string)($row['dob'] ?? '')),
        'email'       => $email,
        'phone'       => trim((string)($row['phone'] ?? '')),
        'school'      => trim((string)($row['school'] ?? '')),
        'parentName'  => trim((string)($row['parentName'] ?? '')),
        'parentPhone' => trim((string)($row['parentPhone'] ?? '')),
    ];

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
function members_import_match(array $patch): ?array
{
    if ($patch['displayId'] !== '') {
        $hit = db_row('SELECT * FROM members WHERE displayId = ? LIMIT 1', [$patch['displayId']]);
        if ($hit) return $hit;
    }
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
function members_import_digest(array $rows): string
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
    return hash('sha256', implode("\n", $canon));
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
    $digest = members_import_digest($rows);
    $report = ['ok' => true, 'applied' => $apply, 'created' => 0, 'updated' => 0,
               'unchanged' => 0, 'failed' => 0, 'rows' => [],
               'digest' => $digest, 'rowCount' => count($rows),
               /* The last time this exact roster was applied, if ever. Read on
                  a dry run too — especially on a dry run: "you already loaded
                  this on the 3rd" is what stops a half-remembered re-import. */
               'previous' => members_import_previous($digest)];

    foreach ($rows as $i => $row) {
        $label = trim((string)($row['displayId'] ?? '')) ?: ('row ' . ($i + 1));
        $parsed = members_import_row(is_array($row) ? $row : [], $stampedOn);

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
        $existing = members_import_match($patch);

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
            if (trim((string)($insert['displayId'] ?? '')) === '' && $apply) {
                $insert['displayId'] = member_mint_display_id($insert);
                $notes[] = 'issued member ID ' . $insert['displayId'];
            }
            if ($apply) {
                db_insert('members', $insert);
                audit('member.import.create', $actor, $insert['memberId'], ['displayId' => $patch['displayId']], '');
                if ($emitEvents) event_emit('member.created', [
                    'memberId' => $insert['memberId'], 'fullName' => $patch['fullName'],
                    'type' => $patch['type'], 'centre' => $patch['centre']]);
            }
            $report['created']++;
            $report['rows'][] = ['ref' => $label, 'action' => 'create', 'name' => $patch['fullName'],
                                 'memberId' => $apply ? $insert['memberId'] : '(assigned on apply)',
                                 'detail' => trim($patch['status'] . ' · ' . $patch['centre'], ' ·'),
                                 'fields' => array_keys($insert), 'warnings' => $notes];
            continue;
        }

        /* A member who has been given staff access is not a spreadsheet row any
           more. Their profile can still be filled in, but the sheet must not
           decide whether an admin is suspended, or silently rename them. */
        $isStaff = function_exists('is_admin_role') && is_admin_role((string)($existing['role'] ?? ''));
        $locked = $isStaff ? ['status', 'fullName', 'email'] : [];
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

        if (!$changes) {
            $report['unchanged']++;
            $report['rows'][] = ['ref' => $label, 'action' => 'unchanged', 'name' => $patch['fullName'],
                                 'memberId' => (string)$existing['memberId'], 'detail' => '', 'warnings' => $notes];
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
                             'fields' => array_keys(array_diff_key($changes, ['updatedAt' => 1])),
                             'detail' => implode(', ', array_keys(array_diff_key($changes, ['updatedAt' => 1]))),
                             'warnings' => $notes];
    }

    if ($apply) {
        audit('member.import.run', $actor, '', [
            'digest' => $digest,
            'created' => $report['created'], 'updated' => $report['updated'],
            'unchanged' => $report['unchanged'], 'failed' => $report['failed']], '');
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
    if ($apply && !role_has_cap((string)($g['requester']['role'] ?? ''), 'rbac')) {
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
    $digest = members_import_digest($rows);
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
    ]);

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
