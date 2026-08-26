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
    'displayId' => 24, 'disciplines' => 120,
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

/**
 * The facts `members` has no column for.
 *
 * A child's level, sex, class, local government, home address and second
 * guardian are all things the desk needs and the schema does not carry. They go
 * into `notes` as one fenced block rather than being dropped — losing them on
 * import would mean going back to the spreadsheet for every one of them.
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

    if ($ref === '') $errors[] = 'no member ID';
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
        'displayId'   => $ref,
        'fullName'    => $name,
        'type'        => trim((string)($row['type'] ?? 'NGG')) ?: 'NGG',
        'status'      => $status,
        'centre'      => trim((string)($row['centre'] ?? '')),
        'cohort'      => trim((string)($row['cohort'] ?? '')),
        'track'       => strtoupper(trim((string)($row['track'] ?? ''))),
        'disciplines' => strtoupper(trim((string)($row['disciplines'] ?? ''))),
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

    $report = ['ok' => true, 'applied' => $apply, 'created' => 0, 'updated' => 0,
               'unchanged' => 0, 'failed' => 0, 'rows' => []];

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
            'created' => $report['created'], 'updated' => $report['updated'],
            'unchanged' => $report['unchanged'], 'failed' => $report['failed']], '');
        if (function_exists('cache_invalidate')) cache_invalidate('students');
    }
    return $report;
}
