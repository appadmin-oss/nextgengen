<?php
declare(strict_types=1);

/**
 * A member's CARD — what the gate reads at the door.
 *
 * Summer participants and volunteers have had QR cards (SUMQR-/VOLQR-) for
 * years. NGG members had none: their printed card carried a QR of
 * /q/<memberId>, which nothing resolved, and the roster import created members
 * with no card at all. At the CACENTRE gate an NGG member could only be found
 * by name.
 *
 * Two kinds of card, held in member_cards:
 *
 *   SECURE    MEMQR- and sixteen random characters, issued by this system for
 *             every NGG member — on creation, on import, and by the backfill
 *             for everybody already on the roll. Unguessable, and revocable:
 *             reissuing voids the old one at once. New cards are printed with it.
 *
 *   PRINTED   The card already in somebody's wallet, printed before this
 *             system, carrying whatever the old process put on it: the member
 *             number (023-001), a URL with the member id in it, an old code.
 *             It keeps working on day one. The SHAPE of such a card is a
 *             card format — a template and a mask, described by the importer —
 *             which the gate pulls from here and decodes with. A format reads
 *             a field (the printed number, the member id) or, for codes that
 *             match no field, a row recorded per member at import.
 *
 * A printed card is weaker than a secure one — a member number is not a
 * secret — so the desk shows how a card was read, and reprinting a member
 * moves them onto their secure card.
 */

/** The alphabet of a secure card: no I, L, O or U, so it can be typed back. */
const MEMBER_CARD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MEMBER_CARD_PREFIX = 'MEMQR-';

/**
 * The formats NGG cards have been printed in, before any importer adds one.
 * `field` says what the decoded value is matched against.
 */
function member_card_default_formats(): array {
    return [
        ['id' => 'member-number', 'label' => 'The member number printed on the card (023-001)',
         'template' => '{id}', 'mask' => '999-999', 'field' => 'displayId', 'example' => '023-001', 'builtin' => true],
        ['id' => 'app-card', 'label' => 'Cards printed from the Control Room before secure cards',
         'template' => '{any}/q/{id}', 'mask' => 'NGG-*', 'field' => 'memberId', 'example' => 'https://nextgengenius.org/q/NGG-2025-0740', 'builtin' => true],
    ];
}

/** Every format: the built-ins, then what importers have added (which may replace a built-in by id). */
function member_card_formats(): array {
    $custom = setting_get('gate.cardFormats');
    $byId = [];
    foreach (member_card_default_formats() as $f) $byId[$f['id']] = $f;
    foreach (is_array($custom) ? $custom : [] as $f) {
        if (is_array($f) && !empty($f['id'])) $byId[(string)$f['id']] = $f + ['builtin' => false];
    }
    return array_values($byId);
}

function member_card_format(string $id): ?array {
    foreach (member_card_formats() as $f) if ((string)$f['id'] === $id) return $f;
    return null;
}

/**
 * A mask to a regular-expression body, by the gate's rules (gate/src/cards.ts):
 * 9 a digit, A a letter, X either, * up to forty of letters/digits/._-, the
 * rest literal. Kept identical so a format that tests here decodes there.
 */
function member_card_mask_source(string $mask): array {
    if ($mask === '' || strlen($mask) > 40) return ['ok' => false, 'error' => 'A mask is 1 to 40 characters.'];
    if (preg_match('/\s/', $mask)) return ['ok' => false, 'error' => 'A mask has no spaces.'];
    $out = ''; $fixed = 0; $i = 0; $n = strlen($mask);
    while ($i < $n) {
        $ch = $mask[$i]; $run = 1;
        while ($i + $run < $n && $mask[$i + $run] === $ch) $run++;
        $rep = $run > 1 ? '{' . $run . '}' : '';
        if ($ch === '9') { $out .= '\d' . $rep; $fixed += $run; }
        elseif ($ch === 'A') { $out .= '[A-Za-z]' . $rep; $fixed += $run; }
        elseif ($ch === 'X') { $out .= '[A-Za-z0-9]' . $rep; $fixed += $run; }
        elseif ($ch === '*') { if ($run > 1) return ['ok' => false, 'error' => 'One * is enough.']; $out .= '[A-Za-z0-9._-]{1,40}'; }
        else { $out .= preg_quote(str_repeat($ch, $run), '~'); $fixed += $run; }
        $i += $run;
    }
    return ['ok' => true, 'source' => $out, 'fixed' => $fixed];
}

/** A format, checked — and the expression the gate will build from it. */
function member_card_format_compile(array $f): array {
    $id = (string)($f['id'] ?? '');
    if (!preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/', $id)) return ['ok' => false, 'error' => 'A format id is lower-case letters, digits and dashes.'];
    $t = (string)($f['template'] ?? '');
    if (strlen($t) > 200) return ['ok' => false, 'error' => 'A template is at most 200 characters.'];
    if (substr_count($t, '{id}') !== 1) return ['ok' => false, 'error' => 'A template has {id} in it exactly once.'];
    $m = member_card_mask_source((string)($f['mask'] ?? ''));
    if (!$m['ok']) return $m;
    $literal = preg_replace('/\{id\}|\{any\}|\s/', '', $t);
    if (strlen((string)$literal) + $m['fixed'] < 4) {
        return ['ok' => false, 'error' => 'This shape would match almost anything. Give the mask fixed characters (999-999), or put the number in the template’s context.'];
    }
    $parts = preg_split('/(\{id\}|\{any\})/', $t, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);
    $body = '';
    foreach ($parts as $p) $body .= $p === '{id}' ? '(' . $m['source'] . ')' : ($p === '{any}' ? '\S{0,120}?' : preg_quote($p, '~'));
    $urlish = (strpos($t, '://') !== false || strpos($t, '{any}') === 0 || strpos($t, '/') !== false) && substr(rtrim($t), -4) === '{id}';
    $tail = $urlish ? '(?:[/?#]\S{0,200})?' : '';
    $field = (string)($f['field'] ?? 'code');
    if (!in_array($field, ['displayId', 'memberId', 'code'], true)) return ['ok' => false, 'error' => 'A format reads the printed number, the member id, or a code recorded at import.'];
    return ['ok' => true, 'regex' => '~^\s*' . $body . $tail . '\s*$~i', 'field' => $field];
}

/** What a scanned text decodes to under one format, or null. */
function member_card_format_decode(array $f, string $text): ?string {
    $c = member_card_format_compile($f);
    if (!$c['ok'] || strlen($text) > 2000) return null;
    return preg_match($c['regex'], $text, $hit) ? strtoupper($hit[1]) : null;
}

/**
 * Describe a format from what an old card SCANS AS and which part of it is
 * the number, the way an importer knows it: "https://old.example/m/023-001",
 * "023-001". Digits in the number vary; everything else is taken as printed.
 */
function member_card_format_from_example(string $scan, string $number): array {
    $scan = trim($scan); $number = trim($number);
    if ($scan === '' || $number === '') return ['ok' => false, 'error' => 'Paste what an old card scans as, and the number in it.'];
    $at = stripos($scan, $number);
    if ($at === false) return ['ok' => false, 'error' => 'That number is not in what the card scans as.'];
    $before = substr($scan, 0, $at); $after = substr($scan, $at + strlen($number));
    /* A host in front of a path is likely to have moved since the card was
       printed: keep the path, let the host vary. */
    if (preg_match('#^https?://[^/]+(/.*)?$#i', $before, $hm)) $before = '{any}' . ($hm[1] ?? '');
    $mask = preg_replace('/\d/', '9', strtoupper($number));
    return ['ok' => true, 'template' => $before . '{id}' . $after, 'mask' => $mask];
}

/** A fresh secure code: MEMQR- and sixteen characters, eighty bits of randomness. */
function member_card_new_code(): string {
    do {
        $code = MEMBER_CARD_PREFIX;
        $bytes = random_bytes(16);
        for ($i = 0; $i < 16; $i++) $code .= MEMBER_CARD_ALPHABET[ord($bytes[$i]) & 31];
    } while (db_row('SELECT id FROM member_cards WHERE code = ? LIMIT 1', [$code]));
    return $code;
}

function member_card_secure(string $memberId): ?string {
    $r = db_row("SELECT code FROM member_cards WHERE memberId = ? AND kind = 'secure' AND status = 'active' ORDER BY id DESC LIMIT 1", [$memberId]);
    return $r ? (string)$r['code'] : null;
}

/** Every card a member holds, newest first — for the member's record. */
function member_cards_of(string $memberId): array {
    return array_map(static fn($r) => [
        'kind' => (string)$r['kind'], 'code' => (string)$r['code'], 'format' => (string)$r['format'],
        'status' => (string)$r['status'], 'source' => (string)$r['source'],
        'issuedAt' => (string)$r['issuedAt'], 'voidedAt' => (string)$r['voidedAt'],
    ], db_all('SELECT * FROM member_cards WHERE memberId = ? ORDER BY id DESC LIMIT 20', [$memberId]));
}

/** Issue a secure card, voiding any earlier one — the old card stops at the gate at once. */
function member_card_issue(string $memberId, string $by, string $source = 'reissue'): string {
    db_exec("UPDATE member_cards SET status = 'void', voidedAt = ? WHERE memberId = ? AND kind = 'secure' AND status = 'active'", [now_iso(), $memberId]);
    $code = member_card_new_code();
    db_insert('member_cards', ['memberId' => $memberId, 'kind' => 'secure', 'code' => $code, 'format' => '',
        'status' => 'active', 'source' => $source, 'issuedBy' => substr($by, 0, 64), 'issuedAt' => now_iso(), 'voidedAt' => '']);
    return $code;
}

/** Record the code on a card a member already holds, read by a format. Never over another member's. */
function member_card_record_printed(string $memberId, string $format, string $code, string $by, string $source): string {
    $code = strtoupper(trim($code));
    if ($code === '' || strlen($code) > 120) return 'skipped';
    $held = db_row("SELECT memberId, status FROM member_cards WHERE kind = 'printed' AND format = ? AND code = ? LIMIT 1", [$format, $code]);
    if ($held && (string)$held['memberId'] !== $memberId) return 'taken';
    if ($held) {
        if ((string)$held['status'] !== 'active') db_exec("UPDATE member_cards SET status = 'active', voidedAt = '' WHERE kind = 'printed' AND format = ? AND code = ?", [$format, $code]);
        return 'already';
    }
    db_insert('member_cards', ['memberId' => $memberId, 'kind' => 'printed', 'code' => $code, 'format' => $format,
        'status' => 'active', 'source' => $source, 'issuedBy' => substr($by, 0, 64), 'issuedAt' => now_iso(), 'voidedAt' => '']);
    return 'recorded';
}

/**
 * Make sure a member has what the gate needs: a secure card, and — if they
 * came with a printed card — that printed card recorded.
 *
 * $printed: [format id, code]. With no code, the code is the field the format
 * reads (the member number, the member id), so an imported member's existing
 * card is known by the number already on it.
 *
 * @return array{secure:?string,issued:bool,printed:string}
 */
function member_cards_ensure(array $m, string $by, string $source, ?array $printed = null): array {
    $out = ['secure' => null, 'issued' => false, 'printed' => 'none'];
    if (!function_exists('member_is_ngg') || !member_is_ngg($m)) return $out;
    $memberId = (string)($m['memberId'] ?? '');
    if ($memberId === '') return $out;
    $out['secure'] = member_card_secure($memberId);
    if ($out['secure'] === null) { $out['secure'] = member_card_issue($memberId, $by, $source); $out['issued'] = true; }
    if ($printed && !empty($printed[0])) {
        $f = member_card_format((string)$printed[0]);
        if ($f) {
            $field = (string)($f['field'] ?? 'code');
            $code = trim((string)($printed[1] ?? '')) ?: ($field !== 'code' ? (string)($m[$field] ?? '') : '');
            if ($code !== '') $out['printed'] = member_card_record_printed($memberId, (string)$f['id'], $code, $by, $source);
        }
    }
    return $out;
}

/** The member a scanned code belongs to — secure, or printed by format. Null if nobody. */
function member_card_lookup(?string $token, ?string $format = null, ?string $value = null): ?array {
    if ($token !== null && $token !== '') {
        $c = db_row("SELECT memberId, status FROM member_cards WHERE kind = 'secure' AND code = ? LIMIT 1", [strtoupper($token)]);
        if (!$c) return null;
        $m = member_follow_merge(db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$c['memberId']]));
        return $m ? ['member' => $m, 'void' => (string)$c['status'] !== 'active', 'kind' => 'secure'] : null;
    }
    $f = $format !== null ? member_card_format($format) : null;
    if (!$f || $value === null || $value === '') return null;
    $v = strtoupper(trim($value));
    $c = db_row("SELECT memberId, status FROM member_cards WHERE kind = 'printed' AND format = ? AND code = ? LIMIT 1", [(string)$f['id'], $v]);
    if ($c) {
        $m = member_follow_merge(db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$c['memberId']]));
        return $m ? ['member' => $m, 'void' => (string)$c['status'] !== 'active', 'kind' => 'printed'] : null;
    }
    /* No row recorded: a format that reads a field still knows its member —
       which is what makes a card printed before any of this work without a
       backfill having reached them. */
    $field = (string)($f['field'] ?? 'code');
    if ($field === 'code') return null;
    $col = $field === 'displayId' ? 'displayId' : 'memberId';
    $m = member_follow_merge(db_row("SELECT * FROM members WHERE UPPER($col) = ? AND COALESCE(type,'NGG') <> 'Summer' LIMIT 1", [$v]));
    return $m ? ['member' => $m, 'void' => false, 'kind' => 'printed'] : null;
}

/**
 * The page a scanned NGG member card opens (/q/<code>) — the member's own,
 * not a Summer School participant's. `secure`: opened by the member's secure
 * code, the bearer credential printed on their card, so their name, photo and
 * days present are shown. Opened by an older card's guessable number, it shows
 * initials only and no photograph. (A replaced card never reaches here.)
 */
function member_card_public(array $m, bool $secure): array {
    /* Opened by an older card's printed number or member id — both guessable,
       and minted in sequence. It confirms only what the number itself claims:
       that it is a member card, and whether that membership is active. No
       initials, centre, course, division or status detail: a guessable number
       must not become a directory of children. */
    if (!$secure) {
        return ['kind' => 'member', 'secure' => false, 'displayId' => (string)($m['displayId'] ?? ''),
            'active' => (string)($m['status'] ?? 'active') === 'active',
            'fullName' => '', 'initials' => '', 'photoUrl' => '', 'centre' => '', 'track' => '', 'division' => '', 'attendance' => [], 'attendanceCount' => 0];
    }
    /* The division of the member's first course (chosen, else what the track
       names), not of the raw track: "Tech" names no single course. */
    $division = '';
    if (function_exists('club_division_of')) {
        $mc = function_exists('curriculum_member_courses') && array_key_exists('courses', $m) ? curriculum_member_courses($m) : [];
        foreach (array_merge([(string)($m['track'] ?? '')], $mc) as $c) if (!curriculum_is_everyones($c) && ($division = club_division_of($c)) !== '') break;
    }
    $meta = null;
    if ($division !== '' && function_exists('club_divisions')) foreach (club_divisions() as $d) if ($d['name'] === $division) $meta = $d;
    $name = trim((string)($m['fullName'] ?? ''));
    $initials = implode('', array_map(static fn($w) => mb_strtoupper(mb_substr($w, 0, 1)) . '.', array_slice(preg_split('/\s+/', $name) ?: [], 0, 2)));
    $memberId = (string)($m['memberId'] ?? '');
    $days = $secure ? (int)(db_row('SELECT COUNT(*) c FROM attendance WHERE studentId = ?', [$memberId])['c'] ?? 0) : 0;
    $recent = $secure ? array_map(static fn($r) => ['date' => (string)$r['date'], 'checkInAt' => (string)($r['checkInAt'] ?? '')],
        db_all('SELECT date, checkInAt FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 24', [$memberId])) : [];
    $since = substr((string)($m['joinDate'] ?? ''), 0, 4);
    return [
        'kind' => 'member', 'secure' => $secure,
        'studentId' => $secure ? $memberId : '', 'fullName' => $secure ? $name : '', 'initials' => $initials,
        'displayId' => (string)($m['displayId'] ?? ''), 'cohortId' => '',
        'track' => (string)($m['track'] ?? ''), 'centre' => (string)($m['centre'] ?? ''),
        'division' => $division, 'divisionIcon' => $meta['icon'] ?? '', 'divisionShort' => $meta['short'] ?? '',
        'memberSince' => preg_match('/^\d{4}$/', $since) ? $since : '',
        'active' => (string)($m['status'] ?? 'active') === 'active',
        'status' => (string)($m['status'] ?? ''),
        'photoUrl' => $secure ? normalize_image_url((string)($m['photoUrl'] ?? '')) : '',
        'attendanceCount' => $days, 'attendance' => $recent,
    ];
}

/* ── Admin ───────────────────────────────────────────────────────────────── */

/** The formats, and — for an importer — whether a sample decodes under one. */
function admin_member_card_formats(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $out = ['ok' => true, 'formats' => member_card_formats()];
    if (isset($p['example'], $p['number'])) $out['derived'] = member_card_format_from_example((string)$p['example'], (string)$p['number']);
    if (isset($p['test']) && is_array($p['test'])) {
        $c = member_card_format_compile($p['test'] + ['id' => 'test', 'field' => 'code']);
        $out['test'] = $c['ok'] ? ['ok' => true, 'decodes' => member_card_format_decode($p['test'] + ['id' => 'test', 'field' => 'code'], (string)($p['sample'] ?? ''))]
                                : $c;
    }
    return $out;
}

/** Add or replace a format. Super admin: a format decides what opens the door. */
function admin_member_card_format_save(array $p): array {
    $g = admin_cap_gate($p, 'rbac'); if (!$g['ok']) return $g;
    $f = [
        'id' => strtolower(trim((string)($p['id'] ?? ''))),
        'label' => trim((string)($p['label'] ?? '')) ?: 'Printed cards',
        'template' => (string)($p['template'] ?? ''),
        'mask' => strtoupper(trim((string)($p['mask'] ?? ''))),
        'field' => (string)($p['field'] ?? 'code'),
        'example' => substr(trim((string)($p['example'] ?? '')), 0, 200),
    ];
    $c = member_card_format_compile($f);
    if (!$c['ok']) return ['ok' => false, 'error' => 'bad_format', 'detail' => $c['error']];
    if ($f['example'] !== '' && member_card_format_decode($f, $f['example']) === null) {
        return ['ok' => false, 'error' => 'bad_format', 'detail' => 'The example does not read under this format. Check the template and the mask.'];
    }
    $custom = setting_get('gate.cardFormats');
    $custom = is_array($custom) ? array_values(array_filter($custom, static fn($x) => is_array($x) && ($x['id'] ?? '') !== $f['id'])) : [];
    if (count($custom) >= 12) return ['ok' => false, 'error' => 'too_many_formats'];
    $custom[] = $f;
    setting_set('gate.cardFormats', $custom, (string)($g['requester']['memberId'] ?? ''));
    audit('member.card.format', (string)($g['requester']['memberId'] ?? ''), $f['id'], ['template' => $f['template'], 'mask' => $f['mask'], 'field' => $f['field']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'format' => $f, 'formats' => member_card_formats()];
}

/** A member's cards, scoped like every other per-member read. */
function admin_member_cards(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $sg = admin_member_scope_gate($g['requester'], (string)($p['memberId'] ?? ''));
    if (!$sg['ok']) return $sg;
    return ['ok' => true, 'cards' => member_cards_of((string)$sg['member']['memberId']), 'formats' => member_card_formats()];
}

/** A new secure card for a lost or reprinted one. The old one stops at the gate at once. */
function admin_member_card_reissue(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $sg = admin_member_scope_gate($g['requester'], (string)($p['memberId'] ?? ''));
    if (!$sg['ok']) return $sg;
    $m = $sg['member'];
    if (!member_is_ngg($m)) return ['ok' => false, 'error' => 'not_ngg', 'detail' => 'A Summer School account is carded by Summer School.'];
    $code = member_card_issue((string)$m['memberId'], (string)($g['requester']['memberId'] ?? ''), 'reissue');
    if (!empty($p['voidPrinted'])) {
        db_exec("UPDATE member_cards SET status = 'void', voidedAt = ? WHERE memberId = ? AND kind = 'printed' AND status = 'active'", [now_iso(), (string)$m['memberId']]);
    }
    /* The card in their hand stopped opening the gate a moment ago. If they
       hold a printed card, they need a new one: queue it, or the studio goes
       on showing them as carded with a card that no longer works. */
    if (function_exists('ids_reprints_open') && db_row("SELECT 1 FROM card_issues WHERE subjectType = 'member' AND subjectId = ? AND ok = 1 LIMIT 1", [(string)$m['memberId']])) {
        ids_reprints_open([['subjectType' => 'member', 'subjectId' => (string)$m['memberId'], 'why' => 'New QR issued — the old card no longer opens the gate', 'cause' => 'qr']], (string)($g['requester']['memberId'] ?? ''));
    }
    audit('member.card.reissue', (string)($g['requester']['memberId'] ?? ''), (string)$m['memberId'], ['voidPrinted' => !empty($p['voidPrinted'])], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'code' => $code, 'cards' => member_cards_of((string)$m['memberId'])];
}

/**
 * Give every member on the roll what the gate needs — the members who came in
 * before cards existed, imported or not. Bounded per call for shared hosting;
 * the caller repeats until `remaining` is 0. Scoped admins reach their own
 * centres only. Printed cards are recorded by the format named, by default the
 * member number already on them.
 */
function admin_member_cards_backfill(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $limit = max(1, min(500, (int)($p['limit'] ?? 200)));
    $format = (string)($p['format'] ?? 'member-number');
    if ($format !== '' && !member_card_format($format)) return ['ok' => false, 'error' => 'unknown_format'];
    $scope = admin_centre_names_in_scope($g['requester']);
    $sql = "FROM members m WHERE COALESCE(m.type,'NGG') <> 'Summer'
              AND NOT EXISTS (SELECT 1 FROM member_cards c WHERE c.memberId = m.memberId AND c.kind = 'secure' AND c.status = 'active')";
    $args = [];
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'issued' => 0, 'printed' => 0, 'remaining' => 0];
        $sql .= ' AND m.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')';
        $args = $scope;
    }
    $by = (string)($g['requester']['memberId'] ?? '');
    $issued = 0; $printed = 0;
    foreach (db_all('SELECT m.* ' . $sql . ' ORDER BY m.createdAt ASC LIMIT ?', array_merge($args, [$limit])) as $m) {
        $r = member_cards_ensure($m, $by, 'backfill', $format !== '' ? [$format, ''] : null);
        if ($r['issued']) $issued++;
        if ($r['printed'] === 'recorded') $printed++;
    }
    $remaining = (int)(db_row('SELECT COUNT(*) c ' . $sql, $args)['c'] ?? 0);
    if ($issued) audit('member.card.backfill', $by, '', ['issued' => $issued, 'printed' => $printed, 'remaining' => $remaining, 'format' => $format], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'issued' => $issued, 'printed' => $printed, 'remaining' => $remaining];
}

/** Gate-facing formats: what the gate needs to decode, and nothing else. */
function member_card_gate_formats(): array {
    $out = [];
    foreach (member_card_formats() as $f) {
        if (!member_card_format_compile($f)['ok']) continue;
        $out[] = ['id' => (string)$f['id'], 'label' => (string)$f['label'], 'template' => (string)$f['template'],
                  'mask' => (string)$f['mask'], 'example' => (string)($f['example'] ?? '')];
    }
    return $out;
}
