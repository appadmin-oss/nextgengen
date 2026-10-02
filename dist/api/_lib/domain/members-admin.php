<?php
/**
 * Member management: the operations that turn the dashboard into work.
 *
 * The dashboard reports "214 members with no email" and "7 possible
 * duplicates". Without these, both are posters: there is no way to get the
 * list, no way to act on more than one person at a time, and no way to
 * resolve a duplicate once you have found it.
 *
 *   SEGMENTS  the roster can be filtered to exactly what the dashboard
 *             counted, so a finding leads to the records behind it
 *   BULK      one action across a reviewed selection, never across a
 *             filter the server re-expands
 *   MERGE     two records for one person, resolved with an explicit policy
 *             per table rather than a hopeful UPDATE
 *   TIMELINE  what has happened to this member, readable without SQL
 */

/* ── Segments ─────────────────────────────────────────────────────────────
 *
 * Each returns an SQL fragment over `members`, matching one figure on the
 * dashboard. They live beside the figures they mirror so the two cannot
 * drift: a segment that selects something different from what the
 * dashboard counted is worse than no segment, because the count becomes
 * evidence that the list is wrong.
 */
function member_segment_sql(string $segment): ?array {
    $minorCut = gmdate('Y-m-d', strtotime('-18 years'));
    $dormantCut = gmdate('Y-m-d', strtotime('-60 days'));

    switch ($segment) {
        case 'no_email':   return ["COALESCE(NULLIF(email, ''), NULL) IS NULL", []];
        case 'no_phone':   return ["COALESCE(NULLIF(phone, ''), NULL) IS NULL", []];
        case 'no_centre':  return ["COALESCE(NULLIF(centre, ''), NULL) IS NULL", []];
        case 'no_dob':     return ["COALESCE(NULLIF(dob, ''), NULL) IS NULL", []];
        case 'minor_no_guardian':
            return ["dob <> '' AND dob > ? AND COALESCE(NULLIF(parentPhone, ''), NULLIF(parentEmail, '')) IS NULL",
                    [$minorCut]];
        case 'unknown_centre':
            /* A centre name matching no row in `centres`. Not refused on
               save — renaming a centre would otherwise make every orphaned
               member uneditable — so this is how they get found. */
            return ["centre <> '' AND centre NOT IN (SELECT name FROM centres)", []];
        case 'dormant':
            return ["status = 'active' AND memberId NOT IN (
                       SELECT memberId FROM member_stats WHERE lastActiveAt >= ?)", [$dormantCut]];
        case 'no_consent':
            return ["role = 'member' AND memberId NOT IN (
                       SELECT studentId FROM consents WHERE type = 'site_visibility' AND status = 'granted')", []];
        default: return null;
    }
}

function member_segments(): array {
    return [
        'no_email'          => 'No email address',
        'no_phone'          => 'No phone number',
        'no_centre'         => 'Not in any centre',
        'unknown_centre'    => 'Centre no longer exists',
        'no_dob'            => 'No date of birth',
        'minor_no_guardian' => 'Under 18 with no guardian contact',
        'dormant'           => 'Active but nothing recorded for 60 days',
        'no_consent'        => 'No publication consent recorded',
    ];
}

/**
 * The segments with a live count each, scoped to what the caller may see.
 *
 * Counted here rather than on the client from a fetched roster: the point
 * of a segment is the records an admin has NOT looked at, and a count
 * derived from the page they are on is a count of the page.
 *
 * A zero is returned, not omitted. "No members are missing an email" and
 * "nobody checked" are different facts, and only one of them is good news.
 */
function admin_members_segments(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;

    $scope = admin_centre_names_in_scope($g['requester']);
    $scopeSql = ''; $scopeParams = [];
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'segments' => [], 'scoped' => true];
        $scopeSql = ' AND centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')';
        $scopeParams = $scope;
    }

    $out = [];
    foreach (member_segments() as $key => $label) {
        [$sql, $params] = member_segment_sql($key);
        $row = db_row("SELECT COUNT(*) c FROM members WHERE ($sql)$scopeSql",
                      array_merge($params, $scopeParams));
        $out[] = ['key' => $key, 'label' => $label, 'count' => (int)($row['c'] ?? 0)];
    }

    return ['ok' => true, 'segments' => $out, 'scoped' => $scope !== null];
}


/**
 * One line of a member's history.
 *
 * Status, centre, type and role are columns that get overwritten, so
 * "why is this person inactive, and since when" was unanswerable without
 * reading the audit log as JSON. This writes the change in a form the
 * timeline can show.
 */
function member_lifecycle_note(string $memberId, string $field, string $from, string $to, ?string $by): void {
    audit('member.' . $field . '.changed', $by, $memberId, ['from' => $from, 'to' => $to]);
}

/* ── Timeline ─────────────────────────────────────────────────────────── */

/**
 * What has happened to this member, in order, readable.
 *
 * Derived from the audit log rather than a second history table, so it
 * cannot disagree with the record of who did what — and so it covers
 * everything that was ever audited, including changes made before this
 * screen existed.
 */
function admin_member_timeline(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $mid = (string)($p['memberId'] ?? '');
    $sg = admin_member_scope_gate($g['requester'], $mid);
    if (!$sg['ok']) return $sg;
    $m = $sg['member'];

    $rows = db_all("SELECT at, actorId, event, meta FROM audit_log
                    WHERE subject = ? ORDER BY at DESC, id DESC LIMIT 200", [$mid]);

    /* Actor ids are opaque. One lookup for the lot rather than one per
       row — this list is routinely a couple of hundred long. */
    $actorIds = array_values(array_unique(array_filter(array_column($rows, 'actorId'),
        fn($a) => $a && $a !== 'system')));
    $names = [];
    if ($actorIds) {
        $ph = implode(',', array_fill(0, count($actorIds), '?'));
        foreach (db_all("SELECT memberId, fullName FROM members WHERE memberId IN ($ph)", $actorIds) as $r) {
            $names[(string)$r['memberId']] = (string)$r['fullName'];
        }
    }

    $out = [];
    foreach ($rows as $r) {
        $meta = safe_json($r['meta'] ?? '') ?: [];
        $out[] = [
            'at' => (string)$r['at'],
            'event' => (string)$r['event'],
            'by' => $r['actorId'] === 'system' || !$r['actorId']
                ? 'System'
                : ($names[(string)$r['actorId']] ?? (string)$r['actorId']),
            'what' => member_event_sentence((string)$r['event'], $meta),
            'meta' => $meta,
        ];
    }

    return ['ok' => true, 'member' => ['memberId' => $mid, 'fullName' => (string)$m['fullName']],
            'joinedAt' => (string)($m['createdAt'] ?? ''), 'events' => $out];
}

/** An audit row as a sentence, because `member.status.changed` is not one. */
function member_event_sentence(string $event, array $meta): string {
    $from = (string)($meta['from'] ?? '');
    $to = (string)($meta['to'] ?? '');
    $move = fn(string $noun) => $from !== ''
        ? ucfirst($noun) . ' changed from ' . $from . ' to ' . $to
        : ucfirst($noun) . ' set to ' . $to;

    switch ($event) {
        case 'member.status.changed': return $move('status');
        case 'member.centre.changed': return $move('centre');
        case 'member.type.changed':   return $move('type');
        case 'member.role.changed':   return $move('role');
        /* The rest of what a bulk run can change. Without these the line is
           still there, but reads as a slug rather than a sentence. */
        case 'member.level.changed':  return $move('level');
        case 'member.track.changed':  return $move('track');
        case 'member.duesRemindOff.changed':
            return ((string)($meta['to'] ?? '') === '1' || ($meta['to'] ?? null) === true)
                ? 'Fee reminders switched off' : 'Fee reminders switched back on';
        case 'admin.member.create':   return 'Record created';
        case 'admin.member.update':
            $keys = array_values(array_filter((array)($meta['keys'] ?? []), fn($k) => $k !== 'updatedAt'));
            return $keys ? 'Edited: ' . implode(', ', $keys) : 'Edited';
        case 'admin.member.consent':
            return 'Consent recorded — ' . (string)($meta['type'] ?? '') . ' ' . (string)($meta['status'] ?? '')
                 . (!empty($meta['method']) ? ' (' . $meta['method'] . ')' : '');
        case 'admin.members.merged':
            return 'Merged with ' . (string)($meta['absorbed'] ?? 'another record');
        case 'admin.members.merged_into':
            return 'Merged into ' . (string)($meta['survivor'] ?? 'another record');
        case 'admin.totp.reset':      return 'Two-factor authentication reset';
        case 'admin.password.reset':  return 'Password reset';
        case 'staff.invite':          return 'Staff invite sent (' . (string)($meta['role'] ?? '') . ')';
        case 'member.erase':          return 'Record erased at request';
        default: return ucfirst(str_replace(['admin.', 'member.', '.', '_'], ['', '', ' ', ' '], $event));
    }
}

/* ── Merge ────────────────────────────────────────────────────────────────
 *
 * Two records, one person. Twenty-seven tables carry a memberId, and five
 * of them have a unique key that includes it — so the obvious
 * `UPDATE ... SET memberId = survivor` fails halfway through on a
 * duplicate key, having already moved some of it.
 *
 * So the policy is declared per table rather than hoped for:
 *
 *   MOVE          re-point every row (history, comments, submissions)
 *   MOVE_UNIQUE   re-point only rows that would not collide; the
 *                 survivor's own row wins, the loser's is dropped. Only
 *                 for state where two rows mean the same fact twice —
 *                 "has read this post", a UI preference.
 *   KEEP_SURVIVOR the survivor's row stands and the loser's is discarded;
 *                 the figures are recorded in the audit entry so nothing
 *                 is lost silently.
 *   BLOCK         a collision here refuses the whole merge.
 *
 * MONEY BLOCKS. member_ledger is unique on (memberId, kind, periodKey), so
 * a collision means both records were charged the same dues period.
 * Combining that automatically is inventing an account. The merge refuses
 * and says which periods clash, and somebody voids or transfers them
 * first. Non-colliding ledger rows move normally, so the common case — a
 * duplicate created last week with no money on it — is still one click.
 */
function member_merge_policy(): array {
    return [
        'member_ledger'          => 'BLOCK',          // money: never combined silently
        'member_stats'           => 'KEEP_SURVIVOR',  // xp/streak are not additive
        'member_progress'        => 'MOVE_UNIQUE',
        'member_state'           => 'MOVE_UNIQUE',
        'community_reads'        => 'MOVE_UNIQUE',
        'community_poll_votes'   => 'MOVE_UNIQUE',    // one person, one vote
        'community_reactions'    => 'MOVE_UNIQUE',
        'post_reactions'         => 'MOVE_UNIQUE',
        'community_bookmarks'    => 'MOVE_UNIQUE',
        'community_stars'        => 'MOVE_UNIQUE',
        'event_rsvps'            => 'MOVE_UNIQUE',
        'engagement_snapshots'   => 'MOVE_UNIQUE',
        'auth_sessions'          => 'DROP',           // sign-in state, not history
        'device_sessions'        => 'DROP',
        'notifications'          => 'MOVE',
        'journal'                => 'MOVE',
        'assignment_submissions' => 'MOVE',
        'mentor_assignments'     => 'MOVE',
        'circle_links'           => 'MOVE',
        'circle_confirmations'   => 'MOVE',
        'circle_remarks'         => 'MOVE',
        'post_comments'          => 'MOVE',
        'community_comments'     => 'MOVE',
        'community_reports'      => 'MOVE',
        'volunteers'             => 'MOVE',
        'ops_events'             => 'MOVE',
    ];
}

/**
 * Preview or perform a merge.
 *
 * `dryRun` is the default on purpose: a merge is irreversible and the
 * person doing it should see what moves before it moves. The UI shows the
 * preview, then sends the same call with confirm.
 */
function admin_members_merge(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;

    $keepId  = trim((string)($p['keepId'] ?? ''));
    $mergeId = trim((string)($p['mergeId'] ?? ''));
    $confirm = !empty($p['confirm']);

    if ($keepId === '' || $mergeId === '') return ['ok' => false, 'error' => 'two_members_required'];
    if (strtolower($keepId) === strtolower($mergeId)) {
        return ['ok' => false, 'error' => 'same_member'];
    }

    foreach ([$keepId, $mergeId] as $id) {
        $sg = admin_member_scope_gate($g['requester'], $id);
        if (!$sg['ok']) return $sg;
    }
    $keep  = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$keepId]);
    $merge = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mergeId]);
    if (!$keep || !$merge) return ['ok' => false, 'error' => 'not_found'];

    /* Staff access is not something a merge should quietly confer or
       destroy. Either record holding a role is a decision for a person. */
    foreach ([[$keep, 'keep'], [$merge, 'merge']] as [$m, $which]) {
        if (is_admin_role((string)$m['role'])) {
            return ['ok' => false, 'error' => 'staff_record',
                    'detail' => (string)$m['fullName'] . ' holds the ' . (string)$m['role']
                        . ' role. Remove it before merging — a merge must not move staff access.'];
        }
    }

    $moves = []; $blocked = []; $dropped = [];

    foreach (member_merge_policy() as $table => $policy) {
        if (!member_table_exists($table)) continue;
        $n = (int)(db_row("SELECT COUNT(*) c FROM $table WHERE memberId = ?", [$mergeId])['c'] ?? 0);
        if ($n === 0) continue;

        if ($policy === 'DROP')          { $dropped[$table] = $n; continue; }
        if ($policy === 'KEEP_SURVIVOR') { $dropped[$table] = $n; continue; }

        if ($policy === 'MOVE') { $moves[$table] = ['move' => $n, 'collide' => 0]; continue; }

        /* MOVE_UNIQUE and BLOCK both need to know what would collide. The
           unique key differs per table, so rather than parse the schema we
           ask the database: a row collides when the survivor already has
           one the loser's row would duplicate. */
        $collide = member_merge_collisions($table, $keepId, $mergeId);
        if ($policy === 'BLOCK' && $collide['rows']) {
            $blocked[$table] = $collide;
            continue;
        }
        $moves[$table] = ['move' => $n - count($collide['rows']), 'collide' => count($collide['rows'])];
    }

    /* The record itself: the survivor keeps everything it has, and takes
       only the fields it is MISSING. A merge must never overwrite data
       somebody entered on the record they chose to keep. */
    $fill = [];
    foreach (['email','phone','dob','parentName','parentEmail','parentPhone','school','photoUrl',
              'track','cohort','centre','joinDate','bio'] as $f) {
        if (trim((string)($keep[$f] ?? '')) === '' && trim((string)($merge[$f] ?? '')) !== '') {
            $fill[$f] = (string)$merge[$f];
        }
    }
    /* Notes are appended, never replaced — both may say something. */
    $mergeNotes = trim((string)($merge['notes'] ?? ''));

    $preview = [
        'keep'  => ['memberId' => $keepId,  'fullName' => (string)$keep['fullName'],  'centre' => (string)$keep['centre'],  'createdAt' => (string)$keep['createdAt']],
        'merge' => ['memberId' => $mergeId, 'fullName' => (string)$merge['fullName'], 'centre' => (string)$merge['centre'], 'createdAt' => (string)$merge['createdAt']],
        'moves' => $moves,
        'fieldsFilled' => $fill,
        'notesAppended' => $mergeNotes !== '',
        'discarded' => $dropped,
        'blocked' => $blocked,
    ];

    if ($blocked) {
        return ['ok' => false, 'error' => 'merge_blocked', 'preview' => $preview,
                'detail' => 'Both records have ledger entries for the same period. Combining them '
                    . 'automatically would be inventing an account — void or transfer the '
                    . 'overlapping entries first.'];
    }

    if (!$confirm) return ['ok' => true, 'dryRun' => true, 'preview' => $preview];

    $me = (string)$g['requester']['memberId'];
    db_exec('BEGIN');
    try {
        foreach (member_merge_policy() as $table => $policy) {
            if (!member_table_exists($table)) continue;
            if ($policy === 'DROP' || $policy === 'KEEP_SURVIVOR') {
                db_exec("DELETE FROM $table WHERE memberId = ?", [$mergeId]);
                continue;
            }
            if ($policy === 'MOVE') {
                db_exec("UPDATE $table SET memberId = ? WHERE memberId = ?", [$keepId, $mergeId]);
                continue;
            }
            // MOVE_UNIQUE / BLOCK (no collisions by now): move what fits,
            // delete what would duplicate the survivor's own row.
            $c = member_merge_collisions($table, $keepId, $mergeId);
            if ($c['rows']) {
                $ph = implode(',', array_fill(0, count($c['rows']), '?'));
                db_exec("DELETE FROM $table WHERE id IN ($ph)", $c['rows']);
            }
            db_exec("UPDATE $table SET memberId = ? WHERE memberId = ?", [$keepId, $mergeId]);
        }

        if ($fill) {
            $fill['updatedAt'] = now_iso();
            db_update('members', $fill, ['id' => (int)$keep['id']]);
        }
        if ($mergeNotes !== '') {
            $existing = trim((string)($keep['notes'] ?? ''));
            db_update('members', [
                'notes' => ($existing !== '' ? $existing . "\n\n" : '')
                    . '[merged from ' . $mergeId . '] ' . $mergeNotes,
                'updatedAt' => now_iso(),
            ], ['id' => (int)$keep['id']]);
        }

        /* The absorbed record is RETIRED, not deleted. Its id has been
           printed on cards, quoted in emails and typed into spreadsheets,
           and somebody looking it up a year from now should find out where
           it went rather than nothing at all. */
        db_update('members', [
            'status' => 'merged',
            'email' => '', 'phone' => '',
            'notes' => trim('[merged into ' . $keepId . '] ' . (string)($merge['notes'] ?? '')),
            'updatedAt' => now_iso(),
        ], ['id' => (int)$merge['id']]);

        db_exec('COMMIT');
    } catch (Throwable $e) {
        db_exec('ROLLBACK');
        return ['ok' => false, 'error' => 'merge_failed', 'detail' => $e->getMessage()];
    }

    audit('admin.members.merged', $me, $keepId,
          ['absorbed' => $mergeId, 'moves' => $moves, 'filled' => array_keys($fill), 'discarded' => $dropped],
          (string)($p['ip'] ?? ''));
    audit('admin.members.merged_into', $me, $mergeId, ['survivor' => $keepId], (string)($p['ip'] ?? ''));

    return ['ok' => true, 'merged' => true, 'keepId' => $keepId, 'mergeId' => $mergeId, 'preview' => $preview];
}

/**
 * Which of the loser's rows would duplicate one the survivor already has.
 *
 * Asked of the database rather than parsed out of the schema, so it stays
 * right when a unique key changes. The shape of "the same row for a
 * different member" differs per table, so the key columns are named here.
 */
function member_merge_collisions(string $table, string $keepId, string $mergeId): array {
    $keys = [
        'member_progress'      => ['missionId'],
        'member_state'         => ['stateKey'],
        'community_reads'      => ['postId'],
        'community_poll_votes' => ['postId'],
        'community_reactions'  => ['postId', 'emoji'],
        'post_reactions'       => ['postId', 'emoji'],
        'community_bookmarks'  => ['postId'],
        'community_stars'      => ['postId'],
        'event_rsvps'          => ['eventId'],
        'engagement_snapshots' => ['weekStart'],
        'member_ledger'        => ['kind', 'periodKey'],
    ][$table] ?? null;

    if (!$keys) return ['rows' => [], 'on' => []];
    $keys = array_values(array_filter($keys, fn($k) => member_column_exists($table, $k)));
    if (!$keys) return ['rows' => [], 'on' => []];

    $on = implode(' AND ', array_map(fn($k) => "a.$k = b.$k", $keys));
    $rows = db_all("SELECT a.id, " . implode(',', array_map(fn($k) => "a.$k", $keys)) . "
                    FROM $table a JOIN $table b ON $on AND b.memberId = ?
                    WHERE a.memberId = ?", [$keepId, $mergeId]);

    return ['rows' => array_map(fn($r) => (int)$r['id'], $rows),
            'on' => $keys,
            'examples' => array_slice(array_map(fn($r) => implode('/', array_values(array_diff_key((array)$r, ['id' => 1]))), $rows), 0, 5)];
}

/**
 * Can this table actually be merged on?
 *
 * The schema grows; a policy naming a table that does not exist yet, or
 * any more, must not take the whole merge down with it.
 *
 * It must also carry a `memberId`. `volunteers` is keyed by volunteerId
 * and `ops_events` by its own actor column, and both were in the policy —
 * so "the table exists" passed and the very next query, `WHERE memberId =
 * ?`, threw. A merge that crashes partway is the worst available outcome,
 * because the transaction may already have moved several tables.
 *
 * Caught by running a real merge, not by reading the policy: the list
 * looks entirely reasonable written down.
 */
function member_table_exists(string $table): bool {
    static $cache = [];
    if (array_key_exists($table, $cache)) return $cache[$table];

    try { db_row("SELECT 1 FROM $table LIMIT 1"); }
    catch (Throwable $e) { return $cache[$table] = false; }

    return $cache[$table] = member_column_exists($table, 'memberId');
}

function member_column_exists(string $table, string $col): bool {
    static $cache = [];
    $k = $table . '.' . $col;
    if (array_key_exists($k, $cache)) return $cache[$k];
    try { db_row("SELECT $col FROM $table LIMIT 1"); return $cache[$k] = true; }
    catch (Throwable $e) { return $cache[$k] = false; }
}
