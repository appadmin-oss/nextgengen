<?php
declare(strict_types=1);

/**
 * Member desk — BULK ACTIONS, and the guards they need.
 *
 * The two screens where bulk mattered most had none: the member roster and the
 * Club roster. An administrator holding four hundred members could set a status
 * or post somebody to a centre one drawer at a time, four hundred times. So
 * they did not; they edited the database or gave up, and the roster drifted.
 *
 * ONE OP, MANY ACTIONS, on purpose. A bulk endpoint per verb multiplies the
 * places these guards have to be repeated, and the guards are the whole
 * substance of the feature:
 *
 *   SELF-PROTECTION      An operator's own account is refused. A bulk suspend
 *                        over a filter that happens to include you is a
 *                        lockout, and the button that causes it looks like
 *                        every other button.
 *   TIER-PROTECTION      A staff account cannot be suspended, deactivated or
 *                        deleted through the member roster at all: the roster
 *                        is where members are administered, and the roster's
 *                        filters do not distinguish an admin from a child.
 *                        Staff lifecycle belongs to Access & roles, where the
 *                        last-super-admin rule and the role whitelist live.
 *   SCOPE                A centre-scoped admin may only act on members in
 *                        their centres. Enforced per row on the way IN, not by
 *                        trusting the list the client had on screen.
 *   BOUNDS               A batch is capped, so a selection of "all matching"
 *                        cannot become an unbounded write.
 *   PER-ROW VERDICTS     Every row comes back with its own outcome. A bulk that
 *                        half-worked is the normal case, not the exception, and
 *                        a caller that can only read `ok` will report a run
 *                        where 28 of 40 were refused as a success.
 *   ONE AUDIT EVENT      Per run, with the action, the count and the refusals —
 *                        so "who suspended forty people on Tuesday" has an
 *                        answer, rather than forty unrelated rows.
 *
 * Every action declares its own capability. `people` is the member desk;
 * `fees` gates the reminder switch, because that is money-adjacent and was
 * split out of `people` deliberately (see domain/fees.php).
 */

/** How many members one bulk call may touch. */
const MEMBERS_BULK_MAX = 500;

/** Statuses the member desk may set. Mirrors MEMBER_STATUS_OPTS in the client;
 *  a value not on this list is refused rather than stored. */
const MEMBER_BULK_STATUSES = ['active', 'graduated-ngg', 'graduated-vanguard', 'suspended', 'inactive'];

/** Statuses that take an account out of circulation. Refused for staff. */
const MEMBER_BULK_LOCKOUT_STATUSES = ['suspended', 'inactive'];

/**
 * What each bulk action needs and does.
 *
 * `cap`      the capability required
 * `needs`    the parameter it reads, if any
 * `staffSafe` may it be applied to a staff account through the member roster?
 * `label`    used in the audit event and in refusal messages
 */
function members_bulk_actions(): array {
    return [
        'status'      => ['cap' => 'people', 'needs' => 'status',  'staffSafe' => false, 'label' => 'Set status'],
        'centre'      => ['cap' => 'people', 'needs' => 'centre',  'staffSafe' => true,  'label' => 'Post to centre'],
        'type'        => ['cap' => 'people', 'needs' => 'type',    'staffSafe' => true,  'label' => 'Set membership type'],
        'level'       => ['cap' => 'people', 'needs' => 'level',   'staffSafe' => true,  'label' => 'Set level'],
        'track'       => ['cap' => 'people', 'needs' => 'track',   'staffSafe' => true,  'label' => 'Set track'],
        // Courses from the catalogue, replacing theirs or added to them (mode).
        'courses'     => ['cap' => 'people', 'needs' => 'courses', 'staffSafe' => true,  'label' => 'Set courses'],
        'consent'     => ['cap' => 'people', 'needs' => 'consent', 'staffSafe' => true,  'label' => 'Record consent'],
        'remindersOff'=> ['cap' => 'fees',   'needs' => 'onoff',   'staffSafe' => true,  'label' => 'Dues reminders'],
        /* 'feesSettled' (clear dues up to a date, for many members at once) was
           RETIRED on 2026-10-30: anybody holding `fees` could wipe a roster's
           debts with a sentence of reason, which is a fraud path, not a tool.
           It is not in this table, so it is unknown_action. Do not restore it;
           the one sanctioned clearance is admin.fees.finesClearOnce. */
    ];
}

/**
 * Apply one action to many members.
 *
 * Returns per-row verdicts in `results` alongside `applied` / `refused`, and
 * writes exactly one audit event for the run.
 */
function admin_members_bulk(array $p): array {
    $action = (string)($p['action'] ?? '');
    $spec = members_bulk_actions()[$action] ?? null;
    if (!$spec) return ['ok' => false, 'error' => 'unknown_action'];

    $g = admin_cap_gate($p, $spec['cap']); if (!$g['ok']) return $g;
    $me = $g['requester'];

    $ids = is_array($p['memberIds'] ?? null) ? $p['memberIds'] : [];
    $ids = array_values(array_unique(array_filter(array_map(fn($v) => trim((string)$v), $ids))));
    if (!count($ids)) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > MEMBERS_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => MEMBERS_BULK_MAX];

    // ── Validate the action's payload ONCE, before touching a single row.
    $value = null;
    if ($action === 'status') {
        $value = (string)($p['status'] ?? '');
        if (!in_array($value, MEMBER_BULK_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];
    } elseif ($action === 'centre') {
        $value = trim((string)($p['centre'] ?? ''));
        /* '' is legal and means "no centre" — the roster has a filter for
           exactly those members, so clearing has to be possible. Anything else
           must be a centre that exists: the column stores a NAME, and a typo
           here silently files somebody at a centre nobody can select. */
        if ($value !== '' && !db_row('SELECT id FROM centres WHERE name = ? LIMIT 1', [$value])) {
            return ['ok' => false, 'error' => 'centre_not_found'];
        }
        if ($value !== '' && !admin_centre_allowed($me, $value)) return ['ok' => false, 'error' => 'centre_out_of_scope'];
    } elseif ($action === 'type') {
        $value = (string)($p['type'] ?? '');
        if (!in_array($value, ['NGG', 'Summer'], true)) return ['ok' => false, 'error' => 'bad_type'];
    } elseif ($action === 'level') {
        $value = strtoupper(trim((string)($p['level'] ?? '')));
        if ($value !== '' && !preg_match('/^[A-Z]$/', $value)) return ['ok' => false, 'error' => 'bad_level'];
    } elseif ($action === 'track') {
        $value = trim((string)($p['track'] ?? ''));
        if (mb_strlen($value) > 64) return ['ok' => false, 'error' => 'bad_track'];
    } elseif ($action === 'courses') {
        [$picked, $unknown] = member_courses_clean($p['courses'] ?? []);
        if ($unknown) return ['ok' => false, 'error' => 'unknown_course', 'courses' => $unknown,
                              'detail' => 'Not a course in the catalogue: ' . implode(', ', $unknown) . '.'];
        if (count($picked) > MEMBER_COURSES_MAX) return ['ok' => false, 'error' => 'too_many_courses', 'max' => MEMBER_COURSES_MAX];
        $mode = (string)($p['mode'] ?? 'replace');
        if (!in_array($mode, ['replace', 'add', 'remove'], true)) return ['ok' => false, 'error' => 'bad_mode'];
        if (!$picked && $mode !== 'replace') return ['ok' => false, 'error' => 'no_courses', 'detail' => 'Choose at least one course.'];
        $value = ['list' => $picked, 'mode' => $mode];
    } elseif ($action === 'consent') {
        $value = ['type' => (string)($p['consentType'] ?? ''), 'status' => (string)($p['consentStatus'] ?? '')];
        if (!function_exists('consent_record')) return ['ok' => false, 'error' => 'consent_unavailable'];
        /* The same three the ledger accepts. This listed granted and
           withdrawn while consent_record() took granted and declined,
           so a withdrawal passed here and was refused on every single
           row as bad_status — the operator saw forty failures and no
           reason. One list, named once. */
        if ($value['type'] === '' || !in_array($value['status'], CONSENT_STATUSES, true)) {
            return ['ok' => false, 'error' => 'bad_consent'];
        }
        // A guardian's own decision names that guardian; one run cannot.
        if (!empty(MEMBER_CONSENT_TYPES[$value['type']]['guardian'])) return ['ok' => false, 'error' => 'consent_needs_guardian'];
    } elseif ($action === 'remindersOff') {
        $value = !empty($p['off']) ? 1 : 0;
    }

    $scopeNames = admin_centre_names_in_scope($me);
    $now = now_iso();
    $results = []; $applied = 0; $refused = 0; $revoked = 0;

    foreach ($ids as $mid) {
        $m = db_row('SELECT memberId, fullName, role, status, centre, type FROM members WHERE memberId = ? LIMIT 1', [$mid]);
        if (!$m) { $results[] = ['id' => $mid, 'ok' => false, 'error' => 'not_found']; $refused++; continue; }
        $name = (string)($m['fullName'] ?? '');
        $isStaff = function_exists('is_admin_role') && is_admin_role((string)$m['role']);

        // SELF — never through a bulk. There is a single-member editor for that.
        if ((string)$m['memberId'] === (string)$me['memberId']) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'own_account']; $refused++; continue;
        }
        // TIER — a staff account is not administered from the member roster.
        if ($isStaff && $spec['staffSafe'] !== true) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'staff_account']; $refused++; continue;
        }
        if ($isStaff && $action === 'status' && in_array((string)$value, MEMBER_BULK_LOCKOUT_STATUSES, true)) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'staff_account']; $refused++; continue;
        }
        // SCOPE — checked against the member's CURRENT centre, on the way in.
        if ($scopeNames !== null && !in_array((string)($m['centre'] ?? ''), $scopeNames, true)) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'out_of_scope']; $refused++; continue;
        }

        try {
            if ($action === 'courses') {
                $full = db_row('SELECT courses, track FROM members WHERE memberId = ? LIMIT 1', [$mid]) ?: [];
                $cur = member_courses_of($full);
                $next = $value['mode'] === 'replace' ? $value['list']
                      : ($value['mode'] === 'add' ? array_values(array_unique(array_merge($cur, $value['list'])))
                      : array_values(array_filter($cur, fn($c) => !in_array($c, $value['list'], true))));
                if (count($next) > MEMBER_COURSES_MAX) { $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'too_many_courses']; $refused++; continue; }
                if ($next === $cur) { $results[] = ['id' => $mid, 'name' => $name, 'ok' => true, 'unchanged' => true]; continue; }
                db_update('members', ['courses' => $next ? json_encode($next, JSON_UNESCAPED_UNICODE) : '', 'track' => $next[0] ?? '', 'updatedAt' => $now], ['memberId' => $mid]);
                audit('member.courses.changed', (string)$me['memberId'], $mid, ['from' => $cur, 'to' => $next, 'via' => 'bulk'], (string)($p['ip'] ?? ''));
                $results[] = ['id' => $mid, 'name' => $name, 'ok' => true];
                $applied++; continue;
            }
            if ($action === 'consent') {
                $r = consent_record($mid, (string)$value['type'], (string)$value['status'], 'staff',
                                    (string)($me['fullName'] ?? 'Staff'));
                if (empty($r['ok'])) {
                    $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => (string)($r['error'] ?? 'refused')];
                    $refused++; continue;
                }
            } else {
                $col = ['status' => 'status', 'centre' => 'centre', 'type' => 'type',
                        'level' => 'level', 'track' => 'track', 'remindersOff' => 'duesRemindOff'][$action];
                // Already there ⇒ report it, don't count it as a change. An
                // "updated 40" toast for a run that changed nothing is a lie
                // that hides a filter mistake.
                $current = $action === 'remindersOff' ? null : (string)($m[$col] ?? '');
                if ($current !== null && $current === (string)$value) {
                    $results[] = ['id' => $mid, 'name' => $name, 'ok' => true, 'unchanged' => true]; continue;
                }
                db_update('members', [$col => $value, 'updatedAt' => $now], ['memberId' => $mid]);
                /* And a line on THIS member's record, not only on the run.
                   The run-level event below says an admin changed forty
                   members; it cannot answer "why is this person inactive,
                   and since when", which is the question the member
                   timeline exists for — and bulk is now the common way a
                   status changes, so without this the timeline is quietly
                   wrong exactly where it is most used. Same event names and
                   meta as a single edit, so the two cannot read differently. */
                audit('member.' . $col . '.changed', (string)$me['memberId'], $mid,
                      ['from' => (string)$current, 'to' => (string)$value, 'via' => 'bulk'],
                      (string)($p['ip'] ?? ''));
                // Out of circulation means signed out, not "until the cookie expires".
                if ($action === 'status' && in_array((string)$value, MEMBER_BULK_LOCKOUT_STATUSES, true)) {
                    $revoked += member_sessions_revoke_all($mid);
                }
            }
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => true];
            $applied++;
        } catch (Throwable $e) {
            $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => 'write_failed'];
            $refused++;
        }
    }

    audit('admin.members.bulk', (string)$me['memberId'], $action, [
        'requested' => count($ids), 'applied' => $applied, 'refused' => $refused,
        'value' => is_array($value) ? $value : (string)$value,
    ] + ($revoked ? ['sessionsRevoked' => $revoked] : []), (string)($p['ip'] ?? ''));

    return ['ok' => true, 'action' => $action, 'applied' => $applied, 'refused' => $refused,
            'requested' => count($ids), 'results' => $results];
}

/**
 * Every member id matching the current filters — the ids only.
 *
 * The escape hatch a paged table needs. A filter matching 340 members can only
 * ever tick the 50 rows in hand, so "apply to all 340" has to be able to name
 * them; and it has to be the SERVER that names them, from the same filters the
 * page was built with, or the two will disagree about who matched.
 *
 * Ids only, and bounded: this is not a second roster read.
 */
function admin_members_ids(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    // Reuse the list op so there is exactly one place that turns filters into
    // rows. `all` skips paging; the cap inside it bounds the result.
    $r = admin_members_list(array_merge($p, ['all' => 1]));
    if (empty($r['ok'])) return $r;
    $ids = array_map(fn($m) => (string)$m['memberId'], $r['members'] ?? []);
    $capped = count($ids) > MEMBERS_BULK_MAX;
    return ['ok' => true, 'total' => (int)($r['total'] ?? count($ids)),
            'memberIds' => $capped ? array_slice($ids, 0, MEMBERS_BULK_MAX) : $ids,
            // Said plainly rather than silently truncated: the operator asked
            // for "all matching" and needs to know they got the first 500.
            'capped' => $capped, 'max' => MEMBERS_BULK_MAX];
}
