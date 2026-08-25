<?php
declare(strict_types=1);

/**
 * The Programme Journal — the record of the programme's own story.
 *
 * The community (domain/community.php) holds CONVERSATION: channels, posts,
 * reactions, comments. Conversation is fast and it is gone. What there was no
 * way to hold was the durable record — the advice that was given, the
 * contribution somebody made, the issue that was raised and how it actually
 * resolved. Those lived in WhatsApp threads and in people's heads, which means
 * that when a coordinator leaves, the institutional memory leaves with them.
 *
 * Three things make it a record rather than another feed:
 *
 *  - `kind` says what sort of thing this is (advice, contribution, issue,
 *    milestone, decision, note), so the journal can be read by category rather
 *    than only by date.
 *  - `status` tracks an issue to a resolution. A journal of open problems
 *    nobody closed is a list, not a record.
 *  - people are TAGGED, with a role, so "who was involved in this" is a query
 *    rather than a paragraph somebody has to read.
 *
 * VISIBILITY is the part to be careful about, and it is why entries default to
 * staff-only. An entry can name a child. Three levels — staff → community →
 * public — and widening is an explicit, audited act. A share token mints a
 * public URL but is resolved against the entry's CURRENT visibility, so
 * narrowing an entry kills every link already sent; the same
 * revocable-credential model as the gate links, for the same reason.
 *
 * Authoring is gated on the `journal` capability — the journalist role. Reading
 * follows visibility, and being TAGGED in an entry requires nothing at all.
 */

const JOURNAL_KINDS = ['advice', 'contribution', 'issue', 'milestone', 'decision', 'note'];
const JOURNAL_STATUSES = ['open', 'in_progress', 'resolved', 'archived'];
/* Ordered weakest → strongest. An index rather than a set, so "can this viewer
 * see that entry" is a comparison instead of a lookup table nobody maintains. */
const JOURNAL_VISIBILITY = ['staff' => 3, 'community' => 2, 'public' => 1];

/** How much a viewer is allowed to see. Higher sees everything lower does. */
function journal_viewer_level(?array $requester, bool $signedIn = false): int {
    if ($requester && is_admin_role((string)($requester['role'] ?? ''))) return 3;   // staff
    if ($signedIn) return 2;                                                          // community member
    return 1;                                                                          // public
}

/** The visibility values a viewer at this level may read. */
function journal_visible_to(int $level): array {
    $out = [];
    foreach (JOURNAL_VISIBILITY as $vis => $need) if ($level >= $need) $out[] = $vis;
    return $out;
}

function journal_kind_ok(string $k): bool { return in_array($k, JOURNAL_KINDS, true); }

/** Shape one row for the wire. `$level` decides what is safe to include. */

/* ══════════════════════════════════════════════════════════════════════════
   §8c · The Programme record
   ══════════════════════════════════════════════════════════════════════════

   The journal already held WHAT HAPPENED. §8c is about what happened next:
   an issue's updates, who is following it, what a decision followed from,
   what a contribution actually raised. All of that was being narrated in
   prose inside the body, where nothing can count it — and the three summary
   tiles at the top of §8c are counts, so a record that cannot be counted
   makes them decoration.

   Everything countable here is DERIVED. "receipts attached (2)" and "12
   photos" are the media already on the entry; "kept by 14 members" and "3
   updates" are row counts. A stored tally beside the list of things it counts
   is two records of one fact, and they drift — usually in the direction that
   flatters the number.
   ────────────────────────────────────────────────────────────────────────── */

/** A status a viewer may see at all. `proposed` is staff-only by definition:
 *  §8c promises "a mentor reviews it before it appears here". */
function pj_is_published(array $r): bool {
    return trim((string)($r['proposedBy'] ?? '')) === '' || trim((string)($r['publishedAt'] ?? '')) !== '';
}

/** Money, as the design prints it: ₦12,000 in full, ₦48k on a tile. */
function pj_money(int $minor, string $currency = 'NGN', bool $short = false): string {
    $sym = $currency === 'NGN' ? '₦' : ($currency === 'USD' ? '$' : ($currency === 'GBP' ? '£' : ''));
    $major = (int)round($minor / 100);
    if ($short) {
        if ($major >= 1000000) return $sym . rtrim(rtrim(number_format($major / 1000000, 1), '0'), '.') . 'm';
        if ($major >= 1000)    return $sym . rtrim(rtrim(number_format($major / 1000, 1), '0'), '.') . 'k';
        return $sym . number_format($major);
    }
    return $sym . number_format($major);
}

/** "Open · 6 days" — how long an issue has been open, in the design's words. */
function pj_open_for(string $occurredAt, ?int $nowTs = null): string {
    $t = strtotime(str_replace(' ', 'T', $occurredAt));
    if (!$t) return '';
    $days = (int)floor((($nowTs ?? time()) - $t) / 86400);
    if ($days <= 0) return 'today';
    if ($days === 1) return '1 day';
    if ($days < 31) return $days . ' days';
    $months = (int)floor($days / 30);
    return $months === 1 ? '1 month' : $months . ' months';
}

/** The updates on one entry, oldest first. */
function pj_updates(string $entryId): array {
    return array_map(fn($r) => [
        'updateId' => (string)$r['updateId'], 'body' => (string)$r['body'],
        'authorName' => (string)$r['authorName'], 'createdAt' => (string)$r['createdAt'],
    ], db_all('SELECT * FROM program_journal_updates WHERE entryId = ? ORDER BY createdAt ASC, id ASC', [$entryId]));
}

/**
 * Everything §8c prints on a card, added to the shape the rest of the app
 * already reads. Kept as a separate pass rather than folded into
 * journal_shape() so the admin journal, the person view and the share page are
 * untouched by a screen they do not render.
 */
function pj_decorate(array $out, array $r, string $viewerId = ''): array {
    $kind = (string)$r['kind'];
    $media = is_array($out['media'] ?? null) ? $out['media'] : [];

    $out['ownerName'] = (string)($r['ownerName'] ?? '');
    $out['parentEntryId'] = (string)($r['parentEntryId'] ?? '');
    $out['proposed'] = !pj_is_published($r);
    $out['proposedName'] = (string)($r['proposedName'] ?? '');

    /* Who is holding on to this. One number, two words on screen: an issue is
       "followed", a piece of advice is "kept". */
    $out['followers'] = (int)(db_row('SELECT COUNT(*) c FROM program_journal_follows WHERE entryId = ?',
                                     [(string)$r['entryId']])['c'] ?? 0);
    $out['following'] = $viewerId !== '' && db_row(
        'SELECT id FROM program_journal_follows WHERE entryId = ? AND memberId = ? LIMIT 1',
        [(string)$r['entryId'], $viewerId]) !== null;

    /* Attachments, counted by what they ARE. The design says "receipts
       attached (2)" on a contribution and "12 photos" on a milestone — the
       same list, named for what the reader is being told they can check. */
    $out['attachments'] = count($media);

    if ($kind === 'issue') {
        $ups = pj_updates((string)$r['entryId']);
        $out['updates'] = count($ups);
        $out['latestUpdate'] = $ups ? $ups[count($ups) - 1] : null;
        $out['openFor'] = (string)$r['status'] === 'open' ? pj_open_for((string)($r['occurredAt'] ?? '')) : '';
    }
    if ($kind === 'contribution') {
        $out['amountMinor'] = (int)($r['amountMinor'] ?? 0);
        $out['targetMinor'] = (int)($r['targetMinor'] ?? 0);
        $out['currency'] = (string)($r['currency'] ?? 'NGN');
        $out['amount'] = pj_money($out['amountMinor'], $out['currency']);
        $out['contributors'] = (int)($r['contributors'] ?? 0);
        /* No target means the ask was met by definition — the design draws a
           full bar. A bar that reads 0% because nobody set a goal would say
           the opposite of what happened. */
        $out['progress'] = $out['targetMinor'] > 0
            ? min(100, (int)round($out['amountMinor'] * 100 / $out['targetMinor'])) : 100;
    }
    if ($kind === 'milestone') {
        $out['countValue'] = (int)($r['countValue'] ?? 0);
        $out['countTotal'] = (int)($r['countTotal'] ?? 0);
        $out['countUnit'] = (string)($r['countUnit'] ?? '');
    }
    if ($kind === 'decision') {
        $out['agreedWith'] = (int)($r['agreedWith'] ?? 0);
        $out['notified'] = (int)($r['notified'] ?? 0);
    }
    return $out;
}

/**
 * The three tiles at the top of §8c, and the counts on the filter chips.
 *
 * Computed over exactly the rows this viewer may read. A tile that counts
 * entries the reader cannot open is a tile that sends them looking for
 * something that is not there.
 */
function pj_summary(int $level, string $centreId = '', ?int $nowTs = null): array {
    $allowed = journal_visible_to($level);
    $in = '(' . implode(',', array_fill(0, count($allowed), '?')) . ')';
    $where = ["visibility IN $in", "(archivedAt IS NULL OR archivedAt = '')",
              "(proposedBy = '' OR proposedBy IS NULL OR publishedAt <> '')"];
    $args = $allowed;
    if ($centreId !== '') { $where[] = 'centreId = ?'; $args[] = $centreId; }
    $w = implode(' AND ', $where);
    $now = $nowTs ?? time();

    $one = fn(string $extra, array $more) =>
        (int)(db_row("SELECT COUNT(*) c FROM program_journal WHERE $w" . $extra, array_merge($args, $more))['c'] ?? 0);

    $openIssues = $one(" AND kind = 'issue' AND status IN ('open','in_progress')", []);
    $month = $one(' AND occurredAt >= ? AND occurredAt < ?',
                  [gmdate('Y-m-01\T00:00:00\Z', $now), gmdate('Y-m-d\T00:00:00\Z', strtotime('+1 month', strtotime(gmdate('Y-m-01', $now))))]);
    $year = gmdate('Y', $now);
    $raised = (int)(db_row("SELECT COALESCE(SUM(amountMinor), 0) s FROM program_journal
                            WHERE $w AND kind = 'contribution' AND occurredAt >= ? AND occurredAt < ?",
                           array_merge($args, [$year . '-01-01T00:00:00Z', ((int)$year + 1) . '-01-01T00:00:00Z']))['s'] ?? 0);

    return [
        'openIssues' => $openIssues,
        'thisMonth' => $month,
        'raisedMinor' => $raised,
        'raised' => pj_money($raised, 'NGN', true),
        'raisedYear' => (int)$year,
        'everything' => $one('', []),
        /* "Needs attention 2" is the same number as the Open issues tile, on
           purpose: a filter chip that promises a different count from the tile
           above it is the reason people stop reading either. */
        'needsAttention' => $openIssues,
    ];
}

function journal_shape(array $r, int $level): array {
    $out = [
        'entryId'    => (string)$r['entryId'],
        'title'      => (string)$r['title'],
        'body'       => (string)$r['body'],
        'kind'       => (string)$r['kind'],
        'status'     => (string)$r['status'],
        'visibility' => (string)$r['visibility'],
        'authorName' => (string)$r['authorName'],
        'centreId'   => (string)($r['centreId'] ?? ''),
        'occurredAt' => (string)($r['occurredAt'] ?? ''),
        'createdAt'  => (string)($r['createdAt'] ?? ''),
        'updatedAt'  => (string)($r['updatedAt'] ?? ''),
        'pinned'     => (int)($r['pinned'] ?? 0) === 1,
        'media'      => safe_json((string)($r['mediaJson'] ?? '')) ?: [],
        'people'     => journal_tags((string)$r['entryId']),
    ];

    /* How long after the event it was written down.
     *
     * Backdating has to be allowed — the meeting was on Tuesday and the write-up
     * happens on Friday. But an institutional record that presents a write-up as
     * contemporaneous when it was not is quietly misleading, and this is the
     * record a funder or a safeguarding review reads. Both timestamps are
     * already stored, so the gap is derivable; publishing it lets the entry say
     * "recorded 3 days later" out loud instead of hiding it.
     */
    $occ = strtotime((string)($r['occurredAt'] ?? ''));
    $made = strtotime((string)($r['createdAt'] ?? ''));
    $out['recordedAfterDays'] = ($occ && $made && $made > $occ) ? (int)floor(($made - $occ) / 86400) : 0;
    /* The share token is a credential. It goes to staff, who hand it out — never
     * in a public or member-facing payload, or reading an entry would be enough
     * to mint a link to it. */
    if ($level >= 3) {
        $out['authorId'] = (string)($r['authorId'] ?? '');
        $out['shareToken'] = (string)($r['shareToken'] ?? '');
    }
    return $out;
}

function journal_tags(string $entryId): array {
    $rows = db_all('SELECT personId, personKind, personName, role FROM program_journal_tags WHERE entryId = ? ORDER BY id ASC', [$entryId]);
    return array_map(fn($t) => [
        'personId' => (string)$t['personId'], 'personKind' => (string)$t['personKind'],
        'name' => (string)$t['personName'], 'role' => (string)$t['role'],
    ], $rows);
}

/** Replace an entry's tag set. */
function journal_set_tags(string $entryId, array $people): void {
    db_exec('DELETE FROM program_journal_tags WHERE entryId = ?', [$entryId]);
    $seen = [];
    foreach ($people as $p) {
        if (!is_array($p)) continue;
        $pid = trim((string)($p['personId'] ?? ''));
        if ($pid === '' || isset($seen[$pid])) continue;   // the unique index would reject it anyway
        $seen[$pid] = true;
        db_insert('program_journal_tags', [
            'entryId' => $entryId, 'personId' => $pid,
            'personKind' => substr(trim((string)($p['personKind'] ?? 'member')), 0, 16),
            'personName' => substr(trim((string)($p['name'] ?? '')), 0, 120),
            'role' => substr(trim((string)($p['role'] ?? 'involved')), 0, 32),
            'createdAt' => now_iso(),
        ]);
    }
}

/* ── Writes (journalist capability) ──────────────────────────────────────── */

/**
 * Clean an entry's attachments.
 *
 * A journal entry is the programme's institutional record, and the thing people
 * most want to attach to "what happened" is a photograph of it. Each item is
 * {type, url, alt, caption}; anything that is not a plain https URL is dropped
 * rather than stored, on the same rule the Community feed uses for post media.
 *
 * Dropped, not refused: a caption that came back malformed should not lose
 * somebody the paragraph they just wrote. What must not happen is an unchecked
 * URL reaching an <img src>, and that is what this prevents.
 */
function journal_media_clean($in): array {
    if (!is_array($in)) return [];
    $out = [];
    foreach ($in as $item) {
        if (!is_array($item)) continue;
        $url = trim((string)($item['url'] ?? ''));
        if ($url === '' || !preg_match('#^https://#i', $url)) continue;
        $type = strtolower(trim((string)($item['type'] ?? 'image')));
        if (!in_array($type, ['image', 'video'], true)) $type = 'image';
        $out[] = [
            'type' => $type,
            'url' => substr($url, 0, 500),
            // Alt text is an accessibility requirement, not decoration: these
            // entries are read by people using screen readers too.
            'alt' => substr(trim((string)($item['alt'] ?? '')), 0, 240),
            'caption' => substr(trim((string)($item['caption'] ?? '')), 0, 240),
            'poster' => preg_match('#^https://#i', (string)($item['poster'] ?? '')) ? substr((string)$item['poster'], 0, 500) : '',
        ];
        // A dozen photographs on one entry is an album, not a record.
        if (count($out) >= 12) break;
    }
    return $out;
}

/**
 * When the thing being recorded actually happened.
 *
 * Backdating is REQUIRED for this to be usable at all: the meeting was on
 * Tuesday and somebody writes it up on Friday, and a journal that stamps it
 * Friday is wrong about the one fact it exists to preserve. So a date in the
 * past is accepted deliberately.
 *
 * It is also bounded, because `occurredAt` is the feed's sort key. Unvalidated,
 * a mistyped year does not error — it silently buries the entry at the bottom of
 * the journal or pins it to the top forever, which is worse than a refusal.
 *
 *   • a date (YYYY-MM-DD) or a full ISO timestamp is accepted
 *   • the future is refused beyond a day's slack for timezones
 *   • before 2015 is refused as a typo — the programme did not exist
 *
 * Honesty about backdating needs no column: `createdAt` already says when it
 * was written and `occurredAt` when it happened, so the gap between them is
 * derivable, and journal_shape publishes it.
 */
function journal_occurred_at($in, string $fallback = ''): array {
    $raw = trim((string)($in ?? ''));
    if ($raw === '') return ['ok' => true, 'value' => $fallback !== '' ? $fallback : now_iso()];
    // A bare date means midnight UTC on that day.
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) $raw .= 'T00:00:00Z';
    $ts = strtotime($raw);
    if ($ts === false) return ['ok' => false, 'error' => 'bad_date'];
    if ($ts > time() + 86400) return ['ok' => false, 'error' => 'date_in_future'];
    if ($ts < strtotime('2015-01-01')) return ['ok' => false, 'error' => 'date_too_old'];
    return ['ok' => true, 'value' => gmdate('Y-m-d\TH:i:s\Z', $ts)];
}

function journal_entry_save(array $p): array {
    $g = admin_cap_gate($p, 'journal'); if (!$g['ok']) return $g;
    $me = $g['requester'];

    $entryId = trim((string)($p['entryId'] ?? ''));
    $title = trim((string)($p['title'] ?? ''));
    if ($title === '') return ['ok' => false, 'error' => 'title_required'];
    $kind = strtolower(trim((string)($p['kind'] ?? 'note')));
    if (!journal_kind_ok($kind)) return ['ok' => false, 'error' => 'bad_kind'];
    $status = strtolower(trim((string)($p['status'] ?? 'open')));
    if (!in_array($status, JOURNAL_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];

    /* Deliberately NOT read from the payload on create. A new entry is
     * staff-only, full stop; widening is a separate, audited call. This is what
     * stops an entry naming a child becoming world-readable because a form sent
     * a stale default. */
    /* Load the existing row FIRST when editing, so a field the form did not
     * send can keep its stored value instead of being overwritten with a
     * default. That is what turned "edit the title" into "delete the
     * photographs" — mediaJson was rewritten as [] on every save because the
     * editor never sent a media key. */
    $existing = null;
    if ($entryId !== '') {
        $existing = db_row('SELECT * FROM program_journal WHERE entryId = ?', [$entryId]);
        if (!$existing) return ['ok' => false, 'error' => 'not_found'];
    }

    $when = journal_occurred_at($p['occurredAt'] ?? '', (string)($existing['occurredAt'] ?? ''));
    if (!$when['ok']) return ['ok' => false, 'error' => $when['error']];

    $fields = [
        'title' => substr($title, 0, 240),
        'body' => (string)($p['body'] ?? ''),
        'kind' => $kind,
        'status' => $status,
        'centreId' => substr(trim((string)($p['centreId'] ?? '')), 0, 48),
        'occurredAt' => $when['value'],
        'pinned' => !empty($p['pinned']) ? 1 : 0,
        'updatedAt' => now_iso(),
    ];
    /* The §8c fields. Each is only written when the caller says something
       about it, for the same reason mediaJson is: an editor that sends a
       subset of the form must not blank what it did not mention. */
    foreach ([
        'ownerId' => 'str', 'ownerName' => 'str', 'parentEntryId' => 'str',
        'amountMinor' => 'int', 'targetMinor' => 'int', 'currency' => 'str',
        'contributors' => 'int', 'countValue' => 'int', 'countTotal' => 'int',
        'countUnit' => 'str', 'agreedWith' => 'int', 'notified' => 'int',
    ] as $key => $type) {
        if (!array_key_exists($key, $p)) continue;
        $fields[$key] = $type === 'int'
            ? max(0, (int)$p[$key])
            : mb_substr(trim((string)$p[$key]), 0, 120);
    }
    /* An entry cannot follow itself, and a chain of one is a loop nobody can
       read their way out of. */
    if (($fields['parentEntryId'] ?? '') !== '' && $fields['parentEntryId'] === $entryId) {
        return ['ok' => false, 'error' => 'bad_parent'];
    }

    // Only touched when the caller actually says something about attachments.
    if (array_key_exists('media', $p)) {
        $fields['mediaJson'] = json_encode(journal_media_clean($p['media']), JSON_UNESCAPED_SLASHES);
    } elseif ($existing === null) {
        $fields['mediaJson'] = '[]';
    }

    if ($entryId !== '') {
        db_update('program_journal', $fields, ['entryId' => $entryId]);
        audit('journal.update', (string)$me['memberId'], $entryId, ['kind' => $kind, 'status' => $status], (string)($p['ip'] ?? ''));
    } else {
        $entryId = 'PJ-' . gmdate('Y') . '-' . strtoupper(rand_hex(5));
        db_insert('program_journal', $fields + [
            'entryId' => $entryId,
            'visibility' => 'staff',
            'authorId' => (string)$me['memberId'],
            'authorName' => (string)($me['fullName'] ?? ''),
            'shareToken' => '',
            'createdAt' => now_iso(),
            'archivedAt' => '',
        ]);
        audit('journal.create', (string)$me['memberId'], $entryId, ['kind' => $kind], (string)($p['ip'] ?? ''));
    }
    if (array_key_exists('people', $p)) journal_set_tags($entryId, is_array($p['people']) ? $p['people'] : []);

    $row = db_row('SELECT * FROM program_journal WHERE entryId = ?', [$entryId]);
    return ['ok' => true, 'entry' => pj_decorate(journal_shape($row, 3), $row, (string)$me['memberId'])];
}

/**
 * Change who can see an entry. Its own op, and audited, because this is the
 * decision with a safeguarding consequence attached — not a field on a form.
 */
function journal_visibility_set(array $p): array {
    $g = admin_cap_gate($p, 'journal'); if (!$g['ok']) return $g;
    $entryId = trim((string)($p['entryId'] ?? ''));
    $vis = strtolower(trim((string)($p['visibility'] ?? '')));
    if (!isset(JOURNAL_VISIBILITY[$vis])) return ['ok' => false, 'error' => 'bad_visibility'];
    $row = db_row('SELECT entryId, visibility, shareToken FROM program_journal WHERE entryId = ?', [$entryId]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];

    db_update('program_journal', ['visibility' => $vis, 'updatedAt' => now_iso()], ['entryId' => $entryId]);
    audit('journal.visibility', (string)$g['requester']['memberId'], $entryId,
        ['from' => (string)$row['visibility'], 'to' => $vis], (string)($p['ip'] ?? ''));
    /* The token is NOT cleared on narrowing, and does not need to be: resolution
     * checks the current visibility, so every link already sent stops working
     * the moment this returns, and starts working again if an admin deliberately
     * re-publishes. Revocable, not destroyed. */
    return ['ok' => true, 'visibility' => $vis, 'shareLive' => $vis === 'public'];
}

/** Mint (or rotate) the public share token. Only meaningful at public visibility. */
function journal_share(array $p): array {
    $g = admin_cap_gate($p, 'journal'); if (!$g['ok']) return $g;
    $entryId = trim((string)($p['entryId'] ?? ''));
    $row = db_row('SELECT entryId, visibility FROM program_journal WHERE entryId = ?', [$entryId]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if (!empty($p['revoke'])) {
        db_update('program_journal', ['shareToken' => '', 'updatedAt' => now_iso()], ['entryId' => $entryId]);
        audit('journal.share_revoked', (string)$g['requester']['memberId'], $entryId, [], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'shareToken' => '', 'url' => ''];
    }
    $tok = rand_hex(16);
    db_update('program_journal', ['shareToken' => $tok, 'updatedAt' => now_iso()], ['entryId' => $entryId]);
    audit('journal.share', (string)$g['requester']['memberId'], $entryId, ['visibility' => (string)$row['visibility']], (string)($p['ip'] ?? ''));
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    return ['ok' => true, 'shareToken' => $tok, 'url' => $origin . '/journal-entry?t=' . $tok,
        // Say so plainly rather than handing back a link that silently 404s.
        'live' => (string)$row['visibility'] === 'public',
        'note' => (string)$row['visibility'] === 'public' ? '' : 'This entry is not public yet, so the link will not open until you widen it.'];
}

function journal_delete(array $p): array {
    $g = admin_cap_gate($p, 'journal'); if (!$g['ok']) return $g;
    $entryId = trim((string)($p['entryId'] ?? ''));
    if (!db_row('SELECT entryId FROM program_journal WHERE entryId = ?', [$entryId])) return ['ok' => false, 'error' => 'not_found'];
    db_exec('DELETE FROM program_journal_tags WHERE entryId = ?', [$entryId]);
    db_exec('DELETE FROM program_journal WHERE entryId = ?', [$entryId]);
    audit('journal.delete', (string)$g['requester']['memberId'], $entryId, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Reads ───────────────────────────────────────────────────────────────── */

/**
 * The journal feed, filtered to what this viewer may see.
 *
 * The visibility filter is applied in SQL rather than after shaping, so an entry
 * a viewer may not read is never loaded, never shaped and cannot be leaked by a
 * later bug in the presentation layer.
 */
function journal_feed(array $p): array {
    $requester = null;
    $rid = trim((string)($p['requesterId'] ?? ''));
    if ($rid !== '') $requester = db_row('SELECT memberId, fullName, role, capsExtra FROM members WHERE memberId = ? LIMIT 1', [$rid]);
    $level = journal_viewer_level($requester, !empty($p['signedIn']));

    $allowed = journal_visible_to($level);
    $in = '(' . implode(',', array_fill(0, count($allowed), '?')) . ')';
    $args = $allowed;

    $where = ["visibility IN $in", "(archivedAt IS NULL OR archivedAt = '')"];
    /* A proposal is not the record yet. §8c promises "a mentor reviews it
       before it appears here", and that promise is kept HERE — not by a client
       that filters a list it was handed. */
    if ($level < 3) $where[] = "(proposedBy = '' OR proposedBy IS NULL OR publishedAt <> '')";
    /* "Needs attention" is the open issues, asked for as one word rather than
       as two filters the client has to remember to combine. */
    if (strtolower(trim((string)($p['need'] ?? ''))) === 'attention') {
        $where[] = "kind = 'issue'";
        $where[] = "status IN ('open','in_progress')";
    }
    $kind = strtolower(trim((string)($p['kind'] ?? '')));
    if ($kind !== '' && journal_kind_ok($kind)) { $where[] = 'kind = ?'; $args[] = $kind; }
    $status = strtolower(trim((string)($p['status'] ?? '')));
    if ($status !== '' && in_array($status, JOURNAL_STATUSES, true)) { $where[] = 'status = ?'; $args[] = $status; }
    $centre = trim((string)($p['centreId'] ?? ''));
    if ($centre !== '') { $where[] = 'centreId = ?'; $args[] = $centre; }
    $q = trim((string)($p['q'] ?? ''));
    if ($q !== '') { $where[] = '(title LIKE ? OR body LIKE ?)'; $args[] = '%' . $q . '%'; $args[] = '%' . $q . '%'; }

    $per = max(1, min(50, (int)($p['per'] ?? 20)));
    $page = max(1, (int)($p['page'] ?? 1));
    $sql = 'SELECT * FROM program_journal WHERE ' . implode(' AND ', $where)
         . ' ORDER BY pinned DESC, occurredAt DESC, id DESC LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per);
    $rows = db_all($sql, $args);
    $total = (int)(db_row('SELECT COUNT(*) c FROM program_journal WHERE ' . implode(' AND ', $where), $args)['c'] ?? 0);

    $canAuthor = $requester ? in_array('journal', member_effective_caps($requester), true) : false;
    return ['ok' => true,
        'entries' => array_map(fn($r) => pj_decorate(journal_shape($r, $level), $r, $rid), $rows),
        'total' => $total, 'page' => $page, 'per' => $per,
        'viewerLevel' => $level,
        'canAuthor' => $canAuthor,
        /* Anybody signed in may PROPOSE. That is the whole point of the footer
           card: "anyone can propose an entry; mentors publish it." */
        'canPropose' => $rid !== '' && !$canAuthor,
        'summary' => pj_summary($level, trim((string)($p['centreId'] ?? ''))),
        'kinds' => JOURNAL_KINDS, 'statuses' => JOURNAL_STATUSES,
    ];
}


/* ── §8c operations ───────────────────────────────────────────────────────
   Three verbs the record needs that the old admin journal never had: follow
   an entry, add an update to it, and propose one without the capability to
   publish.
   ───────────────────────────────────────────────────────────────────────── */

/** Can this signed-in member read that entry at all? Follow, update and read
 *  all ask the same question, so it is asked in one place. */
function pj_readable(?array $requester, bool $signedIn, array $r): bool {
    $level = journal_viewer_level($requester, $signedIn);
    if (!in_array((string)$r['visibility'], journal_visible_to($level), true)) return false;
    if ($level < 3 && !pj_is_published($r)) return false;
    return true;
}

/**
 * Follow an entry — "Follow this" on an issue, the bookmark on a piece of
 * advice. A toggle, because the only thing worse than not being able to
 * follow something is not being able to stop.
 */
function journal_follow(array $p): array {
    $mid = trim((string)($p['memberId'] ?? ''));
    if ($mid === '') return ['ok' => false, 'error' => 'forbidden'];
    $r = db_row('SELECT * FROM program_journal WHERE entryId = ? LIMIT 1', [(string)($p['entryId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    $requester = db_row('SELECT memberId, fullName, role, capsExtra FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    /* Following an entry you cannot read would tell you it exists, which is
       the one thing the visibility rule is for. */
    if (!pj_readable($requester, true, $r)) return ['ok' => false, 'error' => 'not_found'];

    $eid = (string)$r['entryId'];
    $ex = db_row('SELECT id FROM program_journal_follows WHERE entryId = ? AND memberId = ? LIMIT 1', [$eid, $mid]);
    if ($ex) { db_exec('DELETE FROM program_journal_follows WHERE entryId = ? AND memberId = ?', [$eid, $mid]); $on = false; }
    else { db_insert('program_journal_follows', ['entryId' => $eid, 'memberId' => $mid, 'createdAt' => now_iso()]); $on = true; }

    return ['ok' => true, 'following' => $on,
            'followers' => (int)(db_row('SELECT COUNT(*) c FROM program_journal_follows WHERE entryId = ?', [$eid])['c'] ?? 0)];
}

/** The updates on one entry, for the "3 updates" button. */
function journal_updates(array $p): array {
    $mid = trim((string)($p['memberId'] ?? ''));
    $r = db_row('SELECT * FROM program_journal WHERE entryId = ? LIMIT 1', [(string)($p['entryId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    $requester = $mid !== ''
        ? db_row('SELECT memberId, fullName, role, capsExtra FROM members WHERE memberId = ? LIMIT 1', [$mid]) : null;
    if (!pj_readable($requester, $mid !== '', $r)) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'entryId' => (string)$r['entryId'], 'title' => (string)$r['title'],
            'updates' => pj_updates((string)$r['entryId'])];
}

const PJ_UPDATE_MAX = 1200;

/**
 * Add an update. Staff only, and deliberately append-only: an update is dated
 * evidence of what was known when, and a record whose history can be edited
 * afterwards is not a record.
 */
function journal_update_add(array $p): array {
    $g = admin_cap_gate($p, 'journal'); if (!$g['ok']) return $g;
    $me = $g['requester'];
    $r = db_row('SELECT * FROM program_journal WHERE entryId = ? LIMIT 1', [(string)($p['entryId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    $body = trim((string)($p['body'] ?? ''));
    if ($body === '') return ['ok' => false, 'error' => 'body_required'];

    $uid = 'PJU-' . strtoupper(rand_hex(6));
    db_insert('program_journal_updates', [
        'updateId' => $uid, 'entryId' => (string)$r['entryId'],
        'authorId' => (string)$me['memberId'], 'authorName' => (string)($me['fullName'] ?? ''),
        'body' => mb_substr($body, 0, PJ_UPDATE_MAX), 'createdAt' => now_iso(),
    ]);
    db_update('program_journal', ['updatedAt' => now_iso()], ['entryId' => (string)$r['entryId']]);

    /* Everybody who asked to hear about this. That is what following IS — a
       notification nobody receives makes the button a lie. */
    foreach (db_all('SELECT memberId FROM program_journal_follows WHERE entryId = ? AND memberId <> ?',
                    [(string)$r['entryId'], (string)$me['memberId']]) as $f) {
        if (function_exists('community_notify')) {
            community_notify((string)$f['memberId'], (string)$me['memberId'], 'journal.update',
                'Update on "' . (string)$r['title'] . '"', mb_substr($body, 0, 140), false, '');
        }
    }
    audit('journal.update.add', (string)$me['memberId'], (string)$r['entryId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'updates' => pj_updates((string)$r['entryId'])];
}

/**
 * Propose an entry.
 *
 * §8c prints "a mentor reviews it before it appears here" on the card that
 * makes the promise, so a proposal is stored the way that sentence describes:
 * staff-visible, marked with who proposed it, and invisible on the record
 * until a mentor publishes it. A member cannot set its visibility, its kind's
 * money fields, or its date — the things a reviewer is reviewing.
 */
function journal_propose(array $p): array {
    $mid = trim((string)($p['memberId'] ?? ''));
    if ($mid === '') return ['ok' => false, 'error' => 'forbidden'];
    $me = db_row('SELECT memberId, fullName FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$me) return ['ok' => false, 'error' => 'forbidden'];
    $title = trim((string)($p['title'] ?? ''));
    if ($title === '') return ['ok' => false, 'error' => 'title_required'];
    $kind = strtolower(trim((string)($p['kind'] ?? 'note')));
    if (!journal_kind_ok($kind)) return ['ok' => false, 'error' => 'bad_kind'];

    $eid = 'PJ-' . gmdate('Y') . '-' . strtoupper(rand_hex(5));
    db_insert('program_journal', [
        'entryId' => $eid, 'title' => mb_substr($title, 0, 240),
        'body' => mb_substr((string)($p['body'] ?? ''), 0, 4000),
        'kind' => $kind, 'status' => 'open',
        /* Staff-only, always. A proposal has had no review, and the review is
           the thing that decides whether it can be read more widely. */
        'visibility' => 'staff',
        'authorId' => '', 'authorName' => '',
        'proposedBy' => $mid, 'proposedName' => (string)($me['fullName'] ?? ''),
        'publishedAt' => '',
        'centreId' => substr(trim((string)($p['centreId'] ?? '')), 0, 48),
        'occurredAt' => now_iso(), 'mediaJson' => '[]', 'shareToken' => '',
        'pinned' => 0, 'createdAt' => now_iso(), 'updatedAt' => now_iso(), 'archivedAt' => '',
    ]);
    audit('journal.propose', $mid, $eid, ['kind' => $kind], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'entryId' => $eid,
            'message' => 'Sent to the mentors. It appears here once one of them publishes it.'];
}

/** Publish a proposal — the review §8c promises. Staff only, and it records
 *  who did the reviewing by becoming the entry's author. */
function journal_publish(array $p): array {
    $g = admin_cap_gate($p, 'journal'); if (!$g['ok']) return $g;
    $me = $g['requester'];
    $r = db_row('SELECT * FROM program_journal WHERE entryId = ? LIMIT 1', [(string)($p['entryId'] ?? '')]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    if (trim((string)($r['proposedBy'] ?? '')) === '') return ['ok' => false, 'error' => 'not_a_proposal'];
    if (trim((string)($r['publishedAt'] ?? '')) !== '') return ['ok' => true, 'already' => true];

    db_update('program_journal', [
        'publishedAt' => now_iso(),
        /* The mentor who published it is the entry's author on the record.
           Somebody has to be answerable for what the record says, and it is
           not the child who suggested it. */
        'authorId' => (string)$me['memberId'], 'authorName' => (string)($me['fullName'] ?? ''),
        'updatedAt' => now_iso(),
    ], ['entryId' => (string)$r['entryId']]);

    if (function_exists('community_notify')) {
        community_notify((string)$r['proposedBy'], (string)$me['memberId'], 'journal.published',
            'Your entry is on the record', '"' . (string)$r['title'] . '" was published to the Programme record.', true, '');
    }
    audit('journal.publish', (string)$me['memberId'], (string)$r['entryId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'entryId' => (string)$r['entryId']];
}

/**
 * Resolve a shared entry by token.
 *
 * Checks the CURRENT visibility, not the visibility at the time the link was
 * minted. That is the whole contract: narrowing an entry revokes every link
 * already handed out, in the same way revoking a gate link closes that door.
 */
function journal_shared(array $p): array {
    $tok = trim((string)($p['t'] ?? ''));
    if (strlen($tok) < 16) return ['ok' => false, 'error' => 'not_found'];
    $row = db_row('SELECT * FROM program_journal WHERE shareToken = ? LIMIT 1', [$tok]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$row['visibility'] !== 'public') return ['ok' => false, 'error' => 'not_shared'];
    if (!empty($row['archivedAt'])) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'entry' => journal_shape($row, 1)];
}

/**
 * Memories — the resurfacing rail, in the spirit of a photo app's "on this day".
 *
 * A journal nobody re-reads is an archive. Resurfacing is what turns it into
 * institutional memory: the point is to put last term's decision in front of
 * the person about to make the same one again.
 *
 * Every collection is filtered by the SAME visibility rule as the feed, so a
 * member never gets a staff-only entry through the back door of a memory card.
 */
function journal_memories(array $p): array {
    $requester = null;
    $rid = trim((string)($p['requesterId'] ?? ''));
    if ($rid !== '') $requester = db_row('SELECT memberId, fullName, role, capsExtra FROM members WHERE memberId = ? LIMIT 1', [$rid]);
    $level = journal_viewer_level($requester, !empty($p['signedIn']));
    $allowed = journal_visible_to($level);
    $in = '(' . implode(',', array_fill(0, count($allowed), '?')) . ')';

    $today = gmdate('m-d');
    $collections = [];

    /* On this day — same calendar day, any earlier year. Compared on the
     * MM-DD substring so it works identically on SQLite and MySQL. */
    $onThisDay = db_all(
        "SELECT * FROM program_journal WHERE visibility IN $in AND (archivedAt IS NULL OR archivedAt = '')
         AND substr(occurredAt, 6, 5) = ? AND substr(occurredAt, 1, 4) != ?
         ORDER BY occurredAt DESC LIMIT 12",
        array_merge($allowed, [$today, gmdate('Y')])
    );
    if ($onThisDay) $collections[] = [
        'key' => 'on_this_day', 'title' => 'On this day',
        'subtitle' => 'What the programme was doing on this date in an earlier year.',
        'entries' => array_map(fn($r) => journal_shape($r, $level), $onThisDay),
    ];

    // Milestones, resurfaced oldest-anniversary first.
    $miles = db_all(
        "SELECT * FROM program_journal WHERE visibility IN $in AND (archivedAt IS NULL OR archivedAt = '')
         AND kind = 'milestone' ORDER BY occurredAt DESC LIMIT 12", $allowed);
    if ($miles) $collections[] = [
        'key' => 'milestones', 'title' => 'Milestones',
        'subtitle' => 'The moments worth remembering.',
        'entries' => array_map(fn($r) => journal_shape($r, $level), $miles),
    ];

    /* Issues that were actually closed. Deliberately its own collection: a
     * programme that only ever surfaces its open problems reads as failing, and
     * the resolutions are the part worth learning from. */
    $resolved = db_all(
        "SELECT * FROM program_journal WHERE visibility IN $in AND (archivedAt IS NULL OR archivedAt = '')
         AND kind = 'issue' AND status = 'resolved' ORDER BY updatedAt DESC LIMIT 12", $allowed);
    if ($resolved) $collections[] = [
        'key' => 'resolved', 'title' => 'Issues we resolved',
        'subtitle' => 'Raised, worked, closed — the record of things that got fixed.',
        'entries' => array_map(fn($r) => journal_shape($r, $level), $resolved),
    ];

    // Per-centre collections, so a coordinator sees their own centre's history.
    $centreRows = db_all(
        "SELECT centreId, COUNT(*) n FROM program_journal WHERE visibility IN $in
         AND (archivedAt IS NULL OR archivedAt = '') AND centreId != '' GROUP BY centreId ORDER BY n DESC LIMIT 4", $allowed);
    foreach ($centreRows as $cr) {
        $cid = (string)$cr['centreId'];
        $name = (string)(db_row('SELECT name FROM centres WHERE centreId = ?', [$cid])['name'] ?? $cid);
        $rows = db_all(
            "SELECT * FROM program_journal WHERE visibility IN $in AND (archivedAt IS NULL OR archivedAt = '')
             AND centreId = ? ORDER BY occurredAt DESC LIMIT 12", array_merge($allowed, [$cid]));
        if ($rows) $collections[] = [
            'key' => 'centre_' . $cid, 'title' => $name,
            'subtitle' => $cr['n'] . ' entries from this centre.',
            'entries' => array_map(fn($r) => journal_shape($r, $level), $rows),
        ];
    }

    return ['ok' => true, 'collections' => $collections, 'viewerLevel' => $level];
}

/** Anyone tagged in an entry — "what am I part of". Reading still obeys visibility. */
function journal_for_person(array $p): array {
    $pid = trim((string)($p['personId'] ?? ''));
    if ($pid === '') return ['ok' => false, 'error' => 'missing_person'];
    $requester = null;
    $rid = trim((string)($p['requesterId'] ?? ''));
    if ($rid !== '') $requester = db_row('SELECT memberId, fullName, role, capsExtra FROM members WHERE memberId = ? LIMIT 1', [$rid]);
    $level = journal_viewer_level($requester, !empty($p['signedIn']));
    $allowed = journal_visible_to($level);
    $in = '(' . implode(',', array_fill(0, count($allowed), '?')) . ')';
    $rows = db_all(
        "SELECT j.* FROM program_journal j JOIN program_journal_tags t ON t.entryId = j.entryId
         WHERE t.personId = ? AND j.visibility IN $in AND (j.archivedAt IS NULL OR j.archivedAt = '')
         ORDER BY j.occurredAt DESC LIMIT 50", array_merge([$pid], $allowed));
    return ['ok' => true, 'entries' => array_map(fn($r) => journal_shape($r, $level), $rows)];
}
