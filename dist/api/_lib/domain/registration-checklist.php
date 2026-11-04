<?php
declare(strict_types=1);

/**
 * The registration checklist — every new NGG member onboarded, and helped to
 * finish registering by a named person who is actually at their centre.
 *
 * ONE LIST PER MEMBER, TWO SOURCES.
 *  · Automatic items (RCL_AUTO, below) are answered by the member's record,
 *    every time it is read. The record is the source of truth: a photo of a
 *    birth certificate does not give a record a date of birth, so evidence
 *    never ticks one of these. The supervisor fixes the record (or asks the
 *    family to) and the item passes when the record does.
 *  · Admin items (reg_checklist_items) are what staff with `people` add for
 *    the programme: a title, help, the evidence it takes (photo, document or a
 *    note), whether the supervisor must be at the member's centre when they
 *    submit it, and how old the evidence may be. Retired, never deleted.
 *
 * WHO HELPS. A registration supervisor is assigned by staff with `people`,
 * from suggestions the server ranks by real presence at the member's centre:
 * check-ins at the gate (the `attendance` table, attributed to a centre by the
 * row's own centre, else the gate link it came through, else the person's home
 * centre), the check-in desk rota (attendance_duty) and the timetable
 * (timetable_slots). Eligible: staff holding `people` whose centre scope covers
 * the centre; an NGG mentor at the centre whose screening is recorded
 * (ms_clearance); an NGG volunteer mentor or instructor at the centre whose
 * safeguarding is cleared. Somebody with no presence there is not suggested;
 * staff may still pick them, with a typed reason that is audited. Nobody holds
 * more than RCL_SUPERVISOR_MAX open checklists. The assignment op re-derives
 * all of this on the server; the list the screen had is never trusted.
 *
 * VERIFIED, NOT DECLARED. An admin item counts only when the evidence is of the
 * declared type (extension and declared type checked here, size bounded), is
 * within the item's age limit, was offered by the member's assigned supervisor,
 * and — for an item that needs presence — the supervisor has checked in at the
 * member's centre that day. Every submission is kept with its verdict and the
 * reason in words. Staff may reject a verified item; it reopens and the
 * supervisor is told.
 *
 * Members and their guardians see progress ("6 of 9 done"), what is left and
 * the supervisor's first name — never evidence, never anyone else's.
 */

const RCL_SUPERVISOR_MAX = 12;          // open checklists one supervisor may hold
const RCL_BULK_MAX = 500;               // members in one assign or start press
const RCL_PAGE = 25;
const RCL_PRESENCE_WEEKS = 6;           // how far back presence at a centre is read
const RCL_SATURDAYS = 5;                // "on N of the last 5 Saturdays"
const RCL_REASON_MIN = 10;              // a typed reason for picking someone not seen at the centre
const RCL_EVIDENCE_MAX_BYTES = 10485760; // 10 MB
const RCL_ITEMS_MAX = 30;               // active admin items
const RCL_TICK_MAX = 60;                // reminders sent per web-cron tick
const RCL_REFRESH_MAX = 200;            // open checklists recounted per tick
const RCL_MINE_MAX = 100;
const RCL_SUGGEST_SHOWN = 8;
const RCL_TITLE_MAX = 160;
const RCL_HELP_MAX = 600;
const RCL_NOTE_MAX = 500;
const RCL_AGE_MAX_DAYS = 3650;

const RCL_EVIDENCE = ['photo' => 'A photo', 'document' => 'A document', 'none' => 'A note, no file'];
/* What each evidence type may be. A document may be a scan or a photo of the page. */
const RCL_EVIDENCE_EXT = [
    'photo'    => ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'],
    'document' => ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
];
/* The types a browser reports for each extension. A file named .jpg that says it is a PDF is refused. */
const RCL_MIME = [
    'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'webp' => ['image/webp'], 'gif' => ['image/gif'],
    'heic' => ['image/heic', 'image/heif'], 'heif' => ['image/heif', 'image/heic'],
    'pdf' => ['application/pdf'], 'doc' => ['application/msword'],
    'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'odt' => ['application/vnd.oasis.opendocument.text'], 'rtf' => ['application/rtf', 'text/rtf'], 'txt' => ['text/plain'],
];
const RCL_EXT_WORDS = ['pdf' => 'a PDF', 'doc' => 'a Word document', 'docx' => 'a Word document', 'odt' => 'a text document', 'rtf' => 'a text document', 'txt' => 'a text file'];

/**
 * THE automatic items — the one registry. Each names the verifier that reads
 * the record (rcl_verify_<key>), what the family can do about it (`family`),
 * and where staff fix it. `when` gates an item that only applies sometimes.
 */
const RCL_AUTO = [
    'guardian'  => ['title' => 'Guardian linked', 'help' => 'A parent or guardian has a family account connected to this member.',
                    'fix' => 'Ask the family to sign in at /family and connect; staff approve the request under Inbox → Approvals.', 'family' => false],
    'consents'  => ['title' => 'Consents recorded', 'help' => 'The five consents of membership are answered: taking part, emergency medical care and records granted; photos and the website answered either way.',
                    'fix' => 'Record the family’s answers on the member’s record (Consents), or ask the guardian to answer them in the family account.', 'family' => true],
    'photo'     => ['title' => 'Photo on file', 'help' => 'A clear photo of the member is on their record, for the ID card.',
                    'fix' => 'Take the photo at the centre and add it to the member’s record.', 'family' => true],
    'dob'       => ['title' => 'Date of birth', 'help' => 'The member’s date of birth is on their record.',
                    'fix' => 'Add it on the member’s record (People → Members).', 'family' => true],
    'school'    => ['title' => 'School', 'help' => 'The school the member attends is on their record.',
                    'fix' => 'Add it on the member’s record (People → Members).', 'family' => true],
    'emergency' => ['title' => 'Emergency contact', 'help' => 'A phone number to call in an emergency: a parent’s phone, or somebody listed to collect them.',
                    'fix' => 'Add the parent’s phone or a collector on the member’s record.', 'family' => true],
    'courses'   => ['title' => 'Courses placed', 'help' => 'The member’s courses are confirmed, so lessons, the timetable and class lists include them.',
                    'fix' => 'Confirm or choose them under People → Members → Courses.', 'family' => false],
    'fee'       => ['title' => 'Membership fee paid', 'help' => 'The joining invoice is paid.', 'when' => 'fees',
                    'fix' => 'The family pays from the invoice link; an offline payment is recorded under Money → Membership payments.', 'family' => true],
    'idcard'    => ['title' => 'ID card printed', 'help' => 'The member has a printed ID number and a card printed in the ID Card Studio.',
                    'fix' => 'Print it from the ID Card Studio (People → Members → ID cards). A proof does not count.', 'family' => false],
];

/* ── The automatic verifiers ─────────────────────────────────────────────
   Each takes the member row and the facts read in bulk for the whole page
   (rcl_facts), so a list of 25 is a handful of grouped queries, not 25×9. */

function rcl_verify_guardian(array $m, array $f): bool { return !empty($f['guardian'][(string)$m['memberId']]); }
function rcl_verify_consents(array $m, array $f): bool {
    $have = $f['consents'][(string)$m['memberId']] ?? [];
    foreach (rcl_consent_rules() as $type => $mustGrant) {
        $st = $have[$type] ?? '';
        if ($st === '' || ($mustGrant && $st !== 'granted') || (!$mustGrant && !in_array($st, ['granted', 'declined'], true))) return false;
    }
    return true;
}
function rcl_verify_photo(array $m, array $f): bool { return trim((string)($m['photoUrl'] ?? '')) !== ''; }
function rcl_verify_dob(array $m, array $f): bool { return (bool)preg_match('/^\d{4}-\d{2}-\d{2}/', (string)($m['dob'] ?? '')); }
function rcl_verify_school(array $m, array $f): bool { return trim((string)($m['school'] ?? '')) !== ''; }
function rcl_verify_emergency(array $m, array $f): bool {
    return preg_match('/\d{6,}/', preg_replace('/\D/', '', (string)($m['parentPhone'] ?? ''))) === 1 || !empty($f['collector'][(string)$m['memberId']]);
}
function rcl_verify_courses(array $m, array $f): bool { return !in_array(trim((string)($m['courses'] ?? '')), ['', '[]'], true); }
function rcl_verify_fee(array $m, array $f): bool {
    return !empty($f['paid'][(string)$m['memberId']]) || trim((string)($m['feesSettledThrough'] ?? '')) !== '';
}
function rcl_verify_idcard(array $m, array $f): bool {
    return trim((string)($m['displayId'] ?? '')) !== '' && !empty($f['card'][(string)$m['memberId']]);
}

/** type => must it be granted (true) or only answered (false). The five consents of membership (FAMILY_CONSENTS). */
function rcl_consent_rules(): array {
    $out = [];
    $keys = defined('FAMILY_CONSENTS') ? array_map(static fn($c) => (string)$c[0], FAMILY_CONSENTS) : ['participation', 'medical', 'data', 'media', 'site_visibility'];
    foreach ($keys as $k) $out[$k] = defined('CONSENT_TYPES') ? (int)(CONSENT_TYPES[$k]['p'] ?? 0) === 0 : in_array($k, ['participation', 'medical', 'data'], true);
    return $out;
}

/** Does this automatic item apply now? (`fee` only while membership fees are switched on.) */
function rcl_auto_applies(string $key): bool {
    $when = RCL_AUTO[$key]['when'] ?? '';
    if ($when === 'fees') return function_exists('membership_fee_terms') && !empty(membership_fee_terms()['enabled']);
    return true;
}

/** Everything the verifiers need for many members, in grouped reads. */
function rcl_facts(array $ids): array {
    $f = ['guardian' => [], 'consents' => [], 'collector' => [], 'paid' => [], 'card' => []];
    $ids = array_values(array_unique(array_filter(array_map('strval', $ids))));
    foreach (array_chunk($ids, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT DISTINCT memberId FROM guardian_wards WHERE status = 'active' AND memberId IN ($ph)", $chunk) as $r) $f['guardian'][(string)$r['memberId']] = true;
        $types = array_keys(rcl_consent_rules());
        $tph = implode(',', array_fill(0, count($types), '?'));
        // The ledger is append-only: the newest row per type is the answer.
        foreach (db_all("SELECT studentId, type, status FROM consents WHERE studentId IN ($ph) AND type IN ($tph) ORDER BY id", array_merge($chunk, $types)) as $r)
            $f['consents'][(string)$r['studentId']][(string)$r['type']] = strtolower((string)$r['status']);
        foreach (db_all("SELECT DISTINCT memberId FROM member_collectors WHERE COALESCE(phone,'') <> '' AND memberId IN ($ph)", $chunk) as $r) $f['collector'][(string)$r['memberId']] = true;
        foreach (db_all("SELECT DISTINCT memberId FROM membership_invoices WHERE status = 'paid' AND purpose = 'joining' AND memberId IN ($ph)", $chunk) as $r) $f['paid'][(string)$r['memberId']] = true;
        // A proof is nobody's card, and neither is one that failed at the cutter (domain/id-studio.php).
        foreach (db_all("SELECT DISTINCT ci.subjectId FROM card_issues ci JOIN card_runs cr ON cr.runId = ci.runId
                         WHERE ci.subjectType = 'member' AND ci.ok = 1 AND cr.mode != 'proof' AND ci.subjectId IN ($ph)", $chunk) as $r) $f['card'][(string)$r['subjectId']] = true;
    }
    return $f;
}

/* ── Admin items ───────────────────────────────────────────────────────── */

function rcl_item_public(array $r): array {
    return ['itemId' => (string)$r['itemId'], 'title' => (string)$r['title'], 'help' => (string)$r['help'],
            'evidence' => (string)$r['evidence'], 'evidenceLabel' => RCL_EVIDENCE[(string)$r['evidence']] ?? '',
            'presence' => (int)$r['presence'] === 1, 'maxAgeDays' => (int)$r['maxAgeDays'], 'sort' => (int)$r['sort'],
            'status' => (string)$r['status'], 'retiredAt' => (string)$r['retiredAt'], 'updatedAt' => (string)$r['updatedAt']];
}
function rcl_items_active(): array {
    return db_all("SELECT * FROM reg_checklist_items WHERE status = 'active' ORDER BY sort, id");
}

/** admin.regcheck.items — every admin item, active first, retired after (history keeps them). */
function admin_regcheck_items(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM reg_checklist_items ORDER BY (status = 'active') DESC, sort, id");
    $use = [];
    foreach (db_all("SELECT itemId, COUNT(*) c FROM reg_checklist_state WHERE status = 'verified' GROUP BY itemId") as $r) $use[(string)$r['itemId']] = (int)$r['c'];
    return ['ok' => true, 'items' => array_map(static fn($r) => rcl_item_public($r) + ['verified' => $use[(string)$r['itemId']] ?? 0], $rows),
            'auto' => rcl_auto_public(), 'evidence' => RCL_EVIDENCE, 'max' => RCL_ITEMS_MAX, 'ageMax' => RCL_AGE_MAX_DAYS];
}
function rcl_auto_public(): array {
    $out = [];
    foreach (RCL_AUTO as $k => $a) $out[] = ['key' => 'auto:' . $k, 'title' => $a['title'], 'help' => $a['help'], 'fix' => $a['fix'], 'applies' => rcl_auto_applies($k)];
    return $out;
}

/** admin.regcheck.item.save — create (no itemId) or edit one item. Everything is checked before the write. */
function admin_regcheck_item_save(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $id = trim((string)($p['itemId'] ?? ''));
    $title = trim(preg_replace('/\s+/', ' ', (string)($p['title'] ?? '')));
    $help = trim((string)($p['help'] ?? ''));
    $ev = (string)($p['evidence'] ?? 'none');
    $age = $p['maxAgeDays'] ?? 0;
    if (mb_strlen($title) < 3) return ['ok' => false, 'error' => 'title_required', 'message' => 'Give the item a title of at least three letters.'];
    if (mb_strlen($title) > RCL_TITLE_MAX) return ['ok' => false, 'error' => 'title_too_long', 'message' => 'Keep the title under ' . RCL_TITLE_MAX . ' characters.'];
    if (mb_strlen($help) > RCL_HELP_MAX) return ['ok' => false, 'error' => 'help_too_long', 'message' => 'Keep the help under ' . RCL_HELP_MAX . ' characters.'];
    if (!isset(RCL_EVIDENCE[$ev])) return ['ok' => false, 'error' => 'bad_evidence', 'message' => 'Evidence is a photo, a document or a note.'];
    if (!is_numeric($age) || (int)$age != $age || (int)$age < 0 || (int)$age > RCL_AGE_MAX_DAYS)
        return ['ok' => false, 'error' => 'bad_age', 'message' => 'The age limit is a whole number of days, 0 for none, at most ' . RCL_AGE_MAX_DAYS . '.'];
    if ((int)$age > 0 && $ev === 'none') return ['ok' => false, 'error' => 'age_needs_file', 'message' => 'An age limit needs a photo or a document to date.'];
    $row = ['title' => $title, 'help' => $help, 'evidence' => $ev, 'presence' => !empty($p['presence']) ? 1 : 0, 'maxAgeDays' => (int)$age,
            'updatedAt' => now_iso(), 'updatedBy' => $by];
    if ($id === '') {
        if ((int)db_row("SELECT COUNT(*) c FROM reg_checklist_items WHERE status = 'active'")['c'] >= RCL_ITEMS_MAX)
            return ['ok' => false, 'error' => 'too_many_items', 'max' => RCL_ITEMS_MAX, 'message' => 'There are already ' . RCL_ITEMS_MAX . ' items. Retire one first.'];
        $id = 'RCI-' . strtoupper(rand_hex(4));
        $sort = (int)(db_row('SELECT COALESCE(MAX(sort), 0) s FROM reg_checklist_items')['s'] ?? 0) + 1;
        db_insert('reg_checklist_items', $row + ['itemId' => $id, 'sort' => $sort, 'status' => 'active', 'createdAt' => now_iso(), 'createdBy' => $by]);
        audit('regcheck.item.create', $by, $id, ['title' => $title, 'evidence' => $ev, 'presence' => $row['presence'], 'maxAgeDays' => $row['maxAgeDays']], (string)($p['ip'] ?? ''));
    } else {
        $cur = db_row('SELECT * FROM reg_checklist_items WHERE itemId = ? LIMIT 1', [$id]);
        if (!$cur) return ['ok' => false, 'error' => 'not_found'];
        db_update('reg_checklist_items', $row, ['itemId' => $id]);
        audit('regcheck.item.update', $by, $id, ['title' => $title, 'evidence' => $ev, 'presence' => $row['presence'], 'maxAgeDays' => $row['maxAgeDays']], (string)($p['ip'] ?? ''));
    }
    return ['ok' => true, 'item' => rcl_item_public(db_row('SELECT * FROM reg_checklist_items WHERE itemId = ? LIMIT 1', [$id]))];
}

/** admin.regcheck.item.move — one place up or down among the active items. */
function admin_regcheck_item_move(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $dir = (string)($p['dir'] ?? '');
    if (!in_array($dir, ['up', 'down'], true)) return ['ok' => false, 'error' => 'bad_dir'];
    $rows = rcl_items_active();
    $i = array_search((string)($p['itemId'] ?? ''), array_map(static fn($r) => (string)$r['itemId'], $rows), true);
    if ($i === false) return ['ok' => false, 'error' => 'not_found'];
    $j = $dir === 'up' ? $i - 1 : $i + 1;
    if ($j < 0 || $j >= count($rows)) return ['ok' => true, 'unchanged' => true];
    [$rows[$i], $rows[$j]] = [$rows[$j], $rows[$i]];
    foreach ($rows as $n => $r) if ((int)$r['sort'] !== $n + 1) db_update('reg_checklist_items', ['sort' => $n + 1], ['itemId' => (string)$r['itemId']]);
    audit('regcheck.item.move', (string)$g['requester']['memberId'], (string)$p['itemId'], ['dir' => $dir], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** admin.regcheck.item.retire — retire (retire=true) or bring back. Verdicts and submissions stay. */
function admin_regcheck_item_retire(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $cur = db_row('SELECT * FROM reg_checklist_items WHERE itemId = ? LIMIT 1', [(string)($p['itemId'] ?? '')]);
    if (!$cur) return ['ok' => false, 'error' => 'not_found'];
    $retire = !array_key_exists('retire', $p) || !empty($p['retire']);
    $want = $retire ? 'retired' : 'active';
    if ((string)$cur['status'] === $want) return ['ok' => true, 'unchanged' => true];
    if (!$retire && (int)db_row("SELECT COUNT(*) c FROM reg_checklist_items WHERE status = 'active'")['c'] >= RCL_ITEMS_MAX)
        return ['ok' => false, 'error' => 'too_many_items', 'max' => RCL_ITEMS_MAX];
    db_update('reg_checklist_items', $retire ? ['status' => 'retired', 'retiredAt' => now_iso(), 'retiredBy' => $by]
                                             : ['status' => 'active', 'retiredAt' => '', 'retiredBy' => '', 'sort' => (int)(db_row('SELECT COALESCE(MAX(sort), 0) s FROM reg_checklist_items')['s'] ?? 0) + 1],
              ['itemId' => (string)$cur['itemId']]);
    audit($retire ? 'regcheck.item.retire' : 'regcheck.item.restore', $by, (string)$cur['itemId'], ['title' => (string)$cur['title']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── A member's checklist ─────────────────────────────────────────────── */

/**
 * The checklist for many members: memberId => {items, done, total, left}.
 * Items: the automatic ones that apply, then the active admin items in order.
 */
function rcl_build(array $members): array {
    $ids = array_map(static fn($m) => (string)$m['memberId'], $members);
    $facts = rcl_facts($ids);
    $admin = rcl_items_active();
    $state = [];
    if ($ids && $admin) {
        foreach (array_chunk($ids, 400) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            foreach (db_all("SELECT * FROM reg_checklist_state WHERE memberId IN ($ph)", $chunk) as $r) $state[(string)$r['memberId']][(string)$r['itemId']] = $r;
        }
    }
    $auto = array_filter(array_keys(RCL_AUTO), 'rcl_auto_applies');
    $out = [];
    foreach ($members as $m) {
        $mid = (string)$m['memberId']; $items = [];
        foreach ($auto as $k) {
            $ok = (bool)call_user_func('rcl_verify_' . $k, $m, $facts);
            $items[] = ['key' => 'auto:' . $k, 'kind' => 'auto', 'title' => RCL_AUTO[$k]['title'], 'help' => RCL_AUTO[$k]['help'], 'fix' => RCL_AUTO[$k]['fix'],
                        'family' => !empty(RCL_AUTO[$k]['family']), 'evidence' => 'record', 'presence' => false, 'maxAgeDays' => 0,
                        'status' => $ok ? 'done' : 'open', 'done' => $ok];
        }
        foreach ($admin as $a) {
            $st = $state[$mid][(string)$a['itemId']] ?? null;
            $ok = $st && (string)$st['status'] === 'verified';
            $items[] = ['key' => (string)$a['itemId'], 'kind' => 'admin', 'title' => (string)$a['title'], 'help' => (string)$a['help'], 'fix' => '', 'family' => false,
                        'evidence' => (string)$a['evidence'], 'presence' => (int)$a['presence'] === 1, 'maxAgeDays' => (int)$a['maxAgeDays'],
                        'status' => $ok ? 'done' : ($st && (string)$st['status'] === 'rejected' ? 'rejected' : 'open'), 'done' => $ok,
                        'verifiedAt' => $ok ? (string)$st['at'] : '', 'rejectReason' => $st && (string)$st['status'] === 'rejected' ? (string)$st['reason'] : ''];
        }
        $done = count(array_filter($items, static fn($i) => $i['done']));
        $out[$mid] = ['items' => $items, 'done' => $done, 'total' => count($items),
                      'left' => array_values(array_map(static fn($i) => $i['title'], array_filter($items, static fn($i) => !$i['done'])))];
    }
    return $out;
}

/** Recount checklists and store the result (status, done, total, completedAt). Returns the builds. */
function rcl_refresh(array $memberIds): array {
    $memberIds = array_values(array_unique(array_filter(array_map('strval', $memberIds))));
    if (!$memberIds) return [];
    $ms = [];
    foreach (array_chunk($memberIds, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT * FROM members WHERE memberId IN ($ph)", $chunk) as $m) $ms[] = $m;
    }
    $built = rcl_build($ms);
    $rows = [];
    foreach (array_chunk($memberIds, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT * FROM reg_checklists WHERE memberId IN ($ph)", $chunk) as $r) $rows[(string)$r['memberId']] = $r;
    }
    foreach ($built as $mid => $b) {
        $r = $rows[$mid] ?? null; if (!$r) continue;
        $status = $b['total'] > 0 && $b['done'] >= $b['total'] ? 'done' : 'open';
        if ((int)$r['done'] === $b['done'] && (int)$r['total'] === $b['total'] && (string)$r['status'] === $status) continue;
        db_update('reg_checklists', ['done' => $b['done'], 'total' => $b['total'], 'status' => $status, 'updatedAt' => now_iso(),
                                     'completedAt' => $status === 'done' ? ((string)$r['completedAt'] ?: now_iso()) : ''], ['memberId' => $mid]);
        if ($status === 'done' && (string)$r['status'] !== 'done') audit('regcheck.complete', 'system', $mid, ['done' => $b['done']]);
    }
    return $built;
}

/** Start a member's checklist. True when it is new. Only active NGG members (members.type), never staff. */
function rcl_start(array $m, string $by): bool {
    if (!member_is_ngg($m) || !in_array((string)($m['role'] ?? 'member'), ['', 'member'], true)) return false;
    if (strtolower((string)($m['status'] ?: 'active')) !== 'active') return false;
    $mid = (string)$m['memberId'];
    if (db_row('SELECT 1 FROM reg_checklists WHERE memberId = ? LIMIT 1', [$mid])) return false;
    try {
        db_insert('reg_checklists', ['memberId' => $mid, 'status' => 'open', 'startedAt' => now_iso(), 'startedBy' => substr($by, 0, 64), 'updatedAt' => now_iso()]);
    } catch (\Throwable $e) { return false; }   // started at the same moment elsewhere
    rcl_refresh([$mid]);
    return true;
}

/** Called once, at the end of admin_application_convert: a new NGG member's checklist starts at once. */
function rcl_start_for_new_member(string $memberId, string $by): void {
    try {
        $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
        if ($m && rcl_start($m, $by)) audit('regcheck.start', $by, '', ['count' => 1, 'started' => 1, 'via' => 'application.convert', 'memberIds' => [$memberId]]);
    } catch (\Throwable $e) { /* a checklist must never fail an acceptance */ }
}

/* ── People: who someone is, and where they have been ─────────────────── */

/**
 * The person behind a sign-in id (a memberId or a volunteerId): their name,
 * every id their check-ins may be filed under, and their home centres.
 */
function rcl_person(string $principal): ?array {
    if ($principal === '') return null;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$principal]);
    $vols = $m ? db_all("SELECT * FROM volunteers WHERE memberId = ? AND status = 'active'", [$principal])
               : db_all("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$principal]);
    if (!$m && !$vols) return null;
    $ids = [$principal]; $homes = [];
    if ($m) $homes[] = (string)$m['centre'];
    foreach ($vols as $v) { $ids[] = (string)$v['volunteerId']; $homes[] = (string)$v['centre']; if (trim((string)($v['memberId'] ?? '')) !== '') $ids[] = (string)$v['memberId']; }
    foreach (db_all("SELECT centre FROM mentors WHERE status = 'active' AND (memberId = ? OR volunteerId = ?)", [$principal, $principal]) as $r) $homes[] = (string)$r['centre'];
    return ['id' => $principal, 'name' => (string)($m['fullName'] ?? ($vols[0]['fullName'] ?? '')), 'member' => $m, 'volunteers' => $vols,
            'ids' => array_values(array_unique(array_filter($ids))), 'homes' => array_values(array_unique(array_filter(array_map('trim', $homes))))];
}

/** A centre by name: [name, centreId]. */
function rcl_centre(string $name): array {
    $name = trim($name);
    if ($name === '') return ['', ''];
    $r = db_row('SELECT centreId, name FROM centres WHERE name = ? LIMIT 1', [$name]);
    return [$name, $r ? (string)$r['centreId'] : ''];
}

/** gateId prefix → centreId, for check-ins that name only the gate they came through ('gate:<first 12 of gateId>'). */
function rcl_gate_centres(): array {
    $map = [];
    foreach (db_all("SELECT gateId, centreId FROM gate_links WHERE COALESCE(centreId,'') <> ''") as $r) $map[substr((string)$r['gateId'], 0, 12)] = (string)$r['centreId'];
    return $map;
}

/**
 * Was this check-in at this centre? The row's own centre first (the gate hook
 * records it), then the gate link it came through, then — when the row says
 * nothing about where it was — the person's home centre.
 */
function rcl_row_at(array $row, string $centre, string $centreId, array $homes): bool {
    $rc = trim((string)($row['centre'] ?? '')); $rid = trim((string)($row['centreId'] ?? ''));
    if ($rid !== '') return $centreId !== '' && $rid === $centreId;
    if ($rc !== '') return strcasecmp($rc, $centre) === 0;
    $dev = (string)($row['device'] ?? '');
    if (strncmp($dev, 'gate:', 5) === 0) {
        $gc = rcl_gate_centres()[substr($dev, 5, 12)] ?? '';
        if ($gc !== '') return $centreId !== '' && $gc === $centreId;
    }
    foreach ($homes as $h) if (strcasecmp($h, $centre) === 0) return true;
    return false;
}

/** The last N Saturdays up to and including today (programme dates), newest first. */
function rcl_saturdays(string $today, int $n = RCL_SATURDAYS): array {
    $t = strtotime($today . 'T12:00:00Z');
    $back = ((int)gmdate('w', $t) + 1) % 7;   // days since the last Saturday (0 when today is one)
    $out = [];
    for ($i = 0; $i < $n; $i++) $out[] = gmdate('Y-m-d', $t - ($back + 7 * $i) * 86400);
    return $out;
}

/** Has this person checked in at this centre on this date? */
function rcl_present_on(array $person, string $centre, string $centreId, string $date): bool {
    if (!$person['ids']) return false;
    $ph = implode(',', array_fill(0, count($person['ids']), '?'));
    foreach (db_all("SELECT * FROM attendance WHERE date = ? AND studentId IN ($ph)", array_merge([$date], $person['ids'])) as $r)
        if (rcl_row_at($r, $centre, $centreId, $person['homes'])) return true;
    return false;
}

/* ── Supervisors: who may, and who is actually there ──────────────────── */

/**
 * Everyone eligible to supervise registrations at a centre, deduplicated by
 * sign-in id, with their presence there and their workload. Uncleared people
 * are never in this list. Grouped reads only.
 *
 * @return array<string, array> principal => candidate
 */
function rcl_candidates(string $centre, string $centreId, ?string $today = null): array {
    $today = $today ?? attendance_today();
    if ($centre === '') return [];
    $c = [];
    $add = static function (string $id, string $name, string $kind, array $extra) use (&$c) {
        if ($id === '') return;
        if (!isset($c[$id])) $c[$id] = ['id' => $id, 'name' => $name, 'kinds' => [], 'ids' => [$id], 'homes' => [], 'mentorIds' => [], 'availability' => []];
        if (!in_array($kind, $c[$id]['kinds'], true)) $c[$id]['kinds'][] = $kind;
        if ($c[$id]['name'] === '') $c[$id]['name'] = $name;
        foreach (['ids', 'homes', 'mentorIds', 'availability'] as $k) $c[$id][$k] = array_values(array_unique(array_filter(array_merge($c[$id][$k], $extra[$k] ?? []))));
    };
    // Staff holding `people`, whose centre scope covers this centre.
    foreach (staff_with_cap('people', [], static fn($r) => admin_centre_allowed($r, $centre)) as $s)
        $add((string)$s['memberId'], (string)$s['fullName'], 'staff', ['homes' => [(string)$s['centre']]]);
    // NGG mentors at the centre whose screening is recorded.
    $mentors = array_values(array_filter(db_all("SELECT * FROM mentors WHERE status = 'active' AND (centre = ? OR (centreId <> '' AND centreId = ?))", [$centre, $centreId ?: '-']),
        static fn($mm) => function_exists('ms_mentor_is_ngg') ? ms_mentor_is_ngg($mm) : true));
    $clear = function_exists('ms_clearance_bulk') ? ms_clearance_bulk($mentors, $today) : [];
    foreach ($mentors as $mm) {
        if (empty($clear[(string)$mm['mentorId']]['screened'])) continue;
        $pid = function_exists('mp_mentor_principal') ? mp_mentor_principal($mm) : (string)($mm['memberId'] ?: $mm['volunteerId']);
        $add($pid, (string)$mm['fullName'], 'mentor', ['ids' => array_filter([(string)$mm['memberId'], (string)$mm['volunteerId']]), 'homes' => [(string)$mm['centre']],
             'mentorIds' => [(string)$mm['mentorId']], 'availability' => [trim((string)($mm['availability'] ?? ''))]]);
    }
    // NGG volunteer mentors and instructors at the centre, safeguarding cleared.
    foreach (db_all("SELECT * FROM volunteers WHERE status = 'active' AND safeguarding = 'cleared' AND role IN ('mentor', 'instructor') AND (centre = ? OR (centreId <> '' AND centreId = ?))", [$centre, $centreId ?: '-']) as $v) {
        if (function_exists('volpay_serves_ngg') && !volpay_serves_ngg($v)) continue;
        // They sign in with their member account when they have one (as mp_mentor_principal does for a mentor).
        $pid = trim((string)($v['memberId'] ?? '')) !== '' ? (string)$v['memberId'] : (string)$v['volunteerId'];
        $add($pid, (string)$v['fullName'], 'volunteer', ['ids' => array_filter([(string)$v['memberId'], (string)$v['volunteerId']]), 'homes' => [(string)$v['centre']]]);
    }
    if (!$c) return [];

    // Presence: check-ins, the desk rota and the timetable, each one grouped read.
    $since = gmdate('Y-m-d', strtotime($today . 'T12:00:00Z') - RCL_PRESENCE_WEEKS * 7 * 86400);
    $owner = [];
    foreach ($c as $pid => $x) foreach ($x['ids'] as $i) $owner[$i] = $pid;
    $all = array_keys($owner);
    $ph = implode(',', array_fill(0, count($all), '?'));
    $sats = rcl_saturdays($today);
    foreach ($c as $pid => $x) $c[$pid] += ['days' => [], 'satDays' => [], 'duty' => 0, 'dutyNext' => '', 'slots' => [], 'load' => 0, 'mentorOf' => false];
    foreach (db_all("SELECT studentId, date, centre, centreId, device FROM attendance WHERE date >= ? AND date <= ? AND studentId IN ($ph)", array_merge([$since, $today], $all)) as $r) {
        $pid = $owner[(string)$r['studentId']] ?? null; if (!$pid) continue;
        if (!rcl_row_at($r, $centre, $centreId, $c[$pid]['homes'])) continue;
        $c[$pid]['days'][(string)$r['date']] = true;
        if (in_array((string)$r['date'], $sats, true)) $c[$pid]['satDays'][(string)$r['date']] = true;
    }
    foreach (db_all("SELECT volunteerId, date FROM attendance_duty WHERE date >= ? AND (centre = ? OR (centreId <> '' AND centreId = ?)) AND volunteerId IN ($ph) ORDER BY date", array_merge([$since, $centre, $centreId ?: '-'], $all)) as $r) {
        $pid = $owner[(string)$r['volunteerId']] ?? null; if (!$pid) continue;
        $c[$pid]['duty']++;
        if ((string)$r['date'] >= $today && $c[$pid]['dutyNext'] === '') $c[$pid]['dutyNext'] = (string)$r['date'];
    }
    if ($centreId !== '') {
        foreach (db_all("SELECT instructorId, weekday FROM timetable_slots WHERE status = 'active' AND centreId = ? AND instructorId IN ($ph)", array_merge([$centreId], $all)) as $r) {
            $pid = $owner[(string)$r['instructorId']] ?? null; if (!$pid) continue;
            $c[$pid]['slots'][] = (string)$r['weekday'];
        }
    }
    $pids = array_keys($c);
    $pph = implode(',', array_fill(0, count($pids), '?'));
    foreach (db_all("SELECT supervisorId, COUNT(*) n FROM reg_checklists WHERE status = 'open' AND supervisorId IN ($pph) GROUP BY supervisorId", $pids) as $r) $c[(string)$r['supervisorId']]['load'] = (int)$r['n'];
    foreach ($c as $pid => $x) {
        $c[$pid]['present'] = $x['days'] || $x['duty'] > 0 || $x['slots'];
        $c[$pid]['full'] = $x['load'] >= RCL_SUPERVISOR_MAX;
    }
    return $c;
}

/** The member's own mentor's sign-in id, when they have one ('' otherwise). */
function rcl_mentor_principal_of(string $memberId): string {
    $r = db_row("SELECT mentorId FROM mentor_matches WHERE memberId = ? AND status IN ('active','paused','closing') ORDER BY id DESC LIMIT 1", [$memberId])
      ?: db_row("SELECT mentorId FROM mentor_assignments WHERE memberId = ? AND status = 'active' ORDER BY id DESC LIMIT 1", [$memberId]);
    if (!$r) return '';
    $mm = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [(string)$r['mentorId']]);
    return $mm && function_exists('mp_mentor_principal') ? mp_mentor_principal($mm) : '';
}

const RCL_WEEKDAYS = ['mon' => 'Mondays', 'tue' => 'Tuesdays', 'wed' => 'Wednesdays', 'thu' => 'Thursdays', 'fri' => 'Fridays', 'sat' => 'Saturdays', 'sun' => 'Sundays',
                      '1' => 'Mondays', '2' => 'Tuesdays', '3' => 'Wednesdays', '4' => 'Thursdays', '5' => 'Fridays', '6' => 'Saturdays', '0' => 'Sundays', '7' => 'Sundays'];

/** A candidate as the screen shows them: a score, and the reasons in words. */
function rcl_candidate_public(array $x, string $centre, string $mentorPid): array {
    $why = [];
    $sat = count($x['satDays']); $days = count($x['days']);
    if ($sat) $why[] = 'Checked in at ' . $centre . ' on ' . $sat . ' of the last ' . RCL_SATURDAYS . ' Saturdays';
    elseif ($days) $why[] = 'Checked in at ' . $centre . ' on ' . $days . ' ' . ($days === 1 ? 'day' : 'days') . ' in the last ' . RCL_PRESENCE_WEEKS . ' weeks';
    else $why[] = 'No check-in at ' . $centre . ' in the last ' . RCL_PRESENCE_WEEKS . ' weeks';
    if ($x['duty']) $why[] = $x['dutyNext'] !== '' ? 'On the check-in desk rota at ' . $centre . ' on ' . gmdate('j M', strtotime($x['dutyNext'] . 'T12:00:00Z'))
                                                    : 'On the check-in desk rota at ' . $centre . ' ' . $x['duty'] . ' ' . ($x['duty'] === 1 ? 'time' : 'times') . ' lately';
    if ($x['slots']) $why[] = 'Teaches at ' . $centre . ' on ' . implode(' and ', array_values(array_unique(array_map(static fn($d) => RCL_WEEKDAYS[strtolower((string)$d)] ?? (string)$d, $x['slots']))));
    $avail = implode('; ', $x['availability']);
    if ($avail !== '') $why[] = 'Says they are free: ' . mb_substr($avail, 0, 80);
    $mine = $mentorPid !== '' && $mentorPid === $x['id'];
    if ($mine) $why[] = 'Already their mentor';
    $why[] = $x['full'] ? 'Supporting ' . $x['load'] . ' members, the most one person may'
           : ($x['load'] ? $x['load'] . ' ' . ($x['load'] === 1 ? 'member' : 'members') . ' to support' : 'No members to support yet');
    $why[] = in_array('staff', $x['kinds'], true) ? 'Staff, holds the people capability' : 'Safeguarding cleared';
    $score = $sat * 4 + $days + min(3, $x['duty']) * 2 + ($x['slots'] ? 3 : 0) + ($mine ? 6 : 0) - $x['load'];
    return ['id' => $x['id'], 'name' => $x['name'], 'first' => rcl_first($x['name']), 'kinds' => $x['kinds'],
            'kindLabel' => in_array('staff', $x['kinds'], true) ? 'Staff' : (in_array('mentor', $x['kinds'], true) ? 'Mentor' : 'Volunteer'),
            'present' => (bool)$x['present'], 'full' => (bool)$x['full'], 'load' => $x['load'], 'cap' => RCL_SUPERVISOR_MAX,
            'saturdays' => $sat, 'days' => $days, 'existingMentor' => $mine, 'score' => $score,
            'reasons' => $why, 'why' => implode(' · ', $why)];
}

function rcl_first(string $name): string {
    $n = trim(preg_replace('/^(Mr|Mrs|Ms|Miss|Dr|Pastor|Engr)\.?\s+/i', '', $name));
    return (string)(preg_split('/\s+/', $n)[0] ?? '');
}

/** The members a requester names, in scope, with their rows. Refusals are per row, never silent. */
function rcl_members_for(array $requester, array $ids): array {
    $rows = [];
    foreach (array_chunk($ids, 400) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT * FROM members WHERE memberId IN ($ph)", $chunk) as $r) $rows[(string)$r['memberId']] = $r;
    }
    return $rows;
}

/**
 * admin.regcheck.suggest — who should help these members register. All of
 * them must be at one centre: presence is a fact about a place.
 * Returns `suggested` (present, room for more, best first), `others`
 * (eligible but not seen there: needs a typed reason) and `full`.
 */
function admin_regcheck_suggest(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['memberIds'] ?? null) ? $p['memberIds'] : [(string)($p['memberId'] ?? '')]))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > RCL_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => RCL_BULK_MAX];
    $rows = rcl_members_for($g['requester'], $ids);
    $centres = [];
    foreach ($ids as $id) {
        $m = $rows[$id] ?? null;
        if (!$m || !admin_centre_allowed($g['requester'], (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope', 'message' => 'That member is not in a centre you administer.'];
        $centres[trim((string)$m['centre'])] = true;
    }
    if (count($centres) > 1) return ['ok' => false, 'error' => 'mixed_centres', 'message' => 'Choose members from one centre at a time: who can help depends on who is there.'];
    $centre = (string)array_key_first($centres);
    if ($centre === '') return ['ok' => false, 'error' => 'no_centre', 'message' => 'This member has no centre on their record, so nobody can be suggested. Set their centre first.'];
    [$centre, $cid] = rcl_centre($centre);
    $mentorPid = count($ids) === 1 ? rcl_mentor_principal_of($ids[0]) : '';
    $all = array_map(static fn($x) => rcl_candidate_public($x, $centre, $mentorPid), array_values(rcl_candidates($centre, $cid)));
    $all = array_values(array_filter($all, static fn($x) => !in_array($x['id'], $ids, true)));
    usort($all, static fn($a, $b) => [$b['score'], $a['name']] <=> [$a['score'], $b['name']]);
    $sug = array_values(array_filter($all, static fn($x) => $x['present'] && !$x['full']));
    return ['ok' => true, 'centre' => $centre, 'count' => count($ids),
            'suggested' => array_slice($sug, 0, RCL_SUGGEST_SHOWN),
            'others' => array_values(array_filter($all, static fn($x) => !$x['present'] && !$x['full'])),
            'full' => array_values(array_filter($all, static fn($x) => $x['full'])),
            'cap' => RCL_SUPERVISOR_MAX, 'reasonMin' => RCL_REASON_MIN, 'weeks' => RCL_PRESENCE_WEEKS];
}

/**
 * admin.regcheck.assign — {memberIds[], supervisorId, reason?}. One op for one
 * member or many. Eligibility, presence and workload are re-derived here per
 * member's centre; scope per row. Per-row verdicts; one audit event per run.
 */
function admin_regcheck_assign(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['memberIds'] ?? null) ? $p['memberIds'] : []))));
    $sup = trim((string)($p['supervisorId'] ?? ''));
    $reason = trim((string)($p['reason'] ?? ''));
    // The whole payload is checked before anything is written.
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > RCL_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => RCL_BULK_MAX, 'message' => 'At most ' . RCL_BULK_MAX . ' members in one go.'];
    if ($sup === '') return ['ok' => false, 'error' => 'supervisor_required', 'message' => 'Choose who will help.'];
    if (mb_strlen($reason) > 300) return ['ok' => false, 'error' => 'reason_too_long'];
    $rows = rcl_members_for($g['requester'], $ids);
    $byCentre = [];
    $results = []; $applied = 0; $unchanged = 0; $refused = 0; $absent = false;
    $load = null; $person = null; $now = now_iso(); $assigned = [];
    foreach ($ids as $id) {
        $m = $rows[$id] ?? null;
        $fail = static function (string $err, string $msg = '') use (&$results, &$refused, $id, $m) {
            $results[] = ['id' => $id, 'name' => (string)($m['fullName'] ?? ''), 'ok' => false, 'error' => $err] + ($msg !== '' ? ['message' => $msg] : []); $refused++;
        };
        if (!$m || !admin_centre_allowed($g['requester'], (string)$m['centre'])) { $fail($m ? 'out_of_scope' : 'not_found'); continue; }
        if ($id === $by) { $fail('own_account'); continue; }
        if ($id === $sup) { $fail('own_account', 'A member cannot supervise their own registration.'); continue; }
        if (!member_is_ngg($m) || !in_array((string)($m['role'] ?? 'member'), ['', 'member'], true)) { $fail('not_a_member', 'Only NGG members have a registration checklist.'); continue; }
        $centre = trim((string)$m['centre']);
        if ($centre === '') { $fail('no_centre', 'Set the member’s centre first.'); continue; }
        if (!isset($byCentre[$centre])) { [$cn, $cid] = rcl_centre($centre); $byCentre[$centre] = rcl_candidates($cn, $cid); }
        $cand = $byCentre[$centre][$sup] ?? null;
        if (!$cand) { $fail('not_eligible', 'They cannot supervise at ' . $centre . ': staff with the people capability, or an NGG mentor or volunteer there whose safeguarding is cleared.'); continue; }
        if (!$cand['present'] && mb_strlen($reason) < RCL_REASON_MIN) { $fail('not_present', 'They have not been at ' . $centre . ' in the last ' . RCL_PRESENCE_WEEKS . ' weeks. Say why they should help anyway.'); continue; }
        $cur = db_row('SELECT * FROM reg_checklists WHERE memberId = ? LIMIT 1', [$id]);
        if ($cur && (string)$cur['supervisorId'] === $sup) { $results[] = ['id' => $id, 'name' => (string)$m['fullName'], 'ok' => true, 'unchanged' => true]; $unchanged++; continue; }
        if ($load === null) $load = (int)$cand['load'];
        if ($load >= RCL_SUPERVISOR_MAX) { $fail('supervisor_full', $cand['name'] . ' already supports ' . RCL_SUPERVISOR_MAX . ' members, the most one person may.'); continue; }
        if (!$cur) { rcl_start($m, $by); $cur = db_row('SELECT * FROM reg_checklists WHERE memberId = ? LIMIT 1', [$id]); }
        if (!$cur) { $fail('not_started'); continue; }
        $person = $person ?? rcl_person($sup);
        db_update('reg_checklists', ['supervisorId' => $sup, 'supervisorKind' => (string)$cand['kinds'][0], 'supervisorName' => mb_substr((string)$cand['name'], 0, 160),
                                     'assignedAt' => $now, 'assignedBy' => $by, 'updatedAt' => $now], ['memberId' => $id]);
        if ((string)$cur['status'] === 'open') $load++;
        if (!$cand['present']) $absent = true;
        $assigned[] = $m;
        $results[] = ['id' => $id, 'name' => (string)$m['fullName'], 'ok' => true]; $applied++;
    }
    audit('regcheck.assign', $by, $sup, ['count' => count($ids), 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused,
          'refusals' => array_count_values(array_map(static fn($r) => (string)$r['error'], array_filter($results, static fn($r) => !$r['ok'])))]
          + ($absent ? ['notPresent' => true, 'reason' => $reason] : ($reason !== '' ? ['reason' => $reason] : [])), (string)($p['ip'] ?? ''));
    if ($assigned) rcl_tell_assigned($sup, $assigned, $now);
    return ['ok' => true, 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'results' => $results];
}

/* ── Reminders ─────────────────────────────────────────────────────────── */

/** Claim a send in the ledger. True when this is the first time — the caller then sends. */
function rcl_claim(string $key, string $channel, string $recipient, string $memberId = ''): bool {
    try {
        if (db_row('SELECT 1 FROM reg_checklist_sends WHERE sendKey = ? LIMIT 1', [$key])) return false;
        db_insert('reg_checklist_sends', ['sendKey' => mb_substr($key, 0, 160), 'channel' => $channel, 'recipient' => mb_substr($recipient, 0, 190), 'memberId' => $memberId, 'sentAt' => now_iso()]);
        return true;
    } catch (\Throwable $e) { return false; }   // claimed at the same moment elsewhere
}

/** A supervisor was given members to help: one notice per press. */
function rcl_tell_assigned(string $sup, array $members, string $at): void {
    if (!rcl_claim('assigned:' . $sup . ':' . $at, 'app', $sup)) return;
    $names = array_map(static fn($m) => rcl_first((string)$m['fullName']), $members);
    $n = count($members);
    push_notification($sup, ['kind' => 'system', 'groupKey' => 'regcheck:' . $sup,
        'title' => $n === 1 ? 'You are helping ' . $names[0] . ' register' : 'You are helping ' . $n . ' members register',
        'body' => 'Open My registrations to see what is left for ' . implode(', ', array_slice($names, 0, 5)) . ($n > 5 ? ' and ' . ($n - 5) . ' more' : '') . '.']);
}

/**
 * The web-cron's part (webcron.php): recount open checklists, then remind —
 * each supervisor once a week while their members have items open, and each
 * guardian once a week when something is needed from the family. Every send
 * is claimed in reg_checklist_sends first, so a tick that runs twice sends
 * nothing twice. At most RCL_TICK_MAX sends a tick; the rest wait.
 */
function rcl_tick(?int $now = null): array {
    $now = $now ?? time();
    $week = gmdate('o', $now) . '-W' . gmdate('W', $now);
    $open = array_column(db_all("SELECT memberId FROM reg_checklists WHERE status = 'open' ORDER BY updatedAt, id LIMIT " . RCL_REFRESH_MAX), 'memberId');
    $built = rcl_refresh($open);
    $sent = 0;
    // Supervisors.
    $bySup = [];
    foreach (db_all("SELECT c.memberId, c.supervisorId, m.fullName FROM reg_checklists c JOIN members m ON m.memberId = c.memberId
                     WHERE c.status = 'open' AND c.supervisorId <> '' ORDER BY c.id") as $r) $bySup[(string)$r['supervisorId']][] = $r;
    foreach ($bySup as $sup => $rows) {
        if ($sent >= RCL_TICK_MAX) break;
        if (!rcl_claim('week:' . $sup . ':' . $week, 'app', $sup)) continue;
        $n = count($rows);
        push_notification($sup, ['kind' => 'system', 'groupKey' => 'regcheck:' . $sup,
            'title' => $n === 1 ? rcl_first((string)$rows[0]['fullName']) . ' has not finished registering' : $n . ' members have not finished registering',
            'body' => 'Open My registrations: ' . implode(', ', array_map(static fn($r) => rcl_first((string)$r['fullName']), array_slice($rows, 0, 5))) . ($n > 5 ? ' and ' . ($n - 5) . ' more' : '') . '.']);
        $sent++;
    }
    // Families: only the items a family can act on.
    foreach (db_all("SELECT c.memberId FROM reg_checklists c WHERE c.status = 'open' ORDER BY c.id LIMIT 400") as $r) {
        if ($sent >= RCL_TICK_MAX) break;
        $mid = (string)$r['memberId'];
        $b = $built[$mid] ?? (rcl_refresh([$mid])[$mid] ?? null);
        if (!$b) continue;
        $need = array_values(array_map(static fn($i) => $i['title'], array_filter($b['items'], static fn($i) => !$i['done'] && $i['family'])));
        if (!$need) continue;
        $sent += rcl_tell_family($mid, $need, $week);
    }
    return ['refreshed' => count($built), 'sent' => $sent];
}

/** Tell a member's guardians what the family can do, once a week. Returns how many were sent. */
function rcl_tell_family(string $memberId, array $need, string $week): int {
    $m = db_row('SELECT memberId, fullName FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$m) return 0;
    $first = rcl_first((string)$m['fullName']) ?: 'your child';
    $c = db_row('SELECT supervisorName FROM reg_checklists WHERE memberId = ? LIMIT 1', [$memberId]);
    $helper = rcl_first((string)($c['supervisorName'] ?? ''));
    $n = 0;
    $title = 'Helping ' . $first . ' finish registering';
    $body = 'To finish ' . $first . '’s registration, we still need: ' . implode(', ', $need) . '.'
          . ($helper !== '' ? ' ' . $helper . ' at the centre is helping and can answer questions.' : '');
    foreach (db_all("SELECT g.guardianId, g.email, w.notify FROM guardian_wards w JOIN guardians g ON g.guardianId = w.guardianId
                     WHERE w.memberId = ? AND w.status = 'active' AND g.status = 'active'", [$memberId]) as $gr) {
        // family_notify_prefs decides (every family alert is on); respected, not assumed.
        $prefs = function_exists('family_notify_prefs') ? family_notify_prefs((string)($gr['notify'] ?? '')) : ['alerts' => true];
        if (empty($prefs['alerts'])) continue;
        if (!rcl_claim('family:' . $memberId . ':' . (string)$gr['guardianId'] . ':' . $week, 'email', (string)$gr['email'], $memberId)) continue;
        if (function_exists('family_notice_add')) family_notice_add((string)$gr['guardianId'], 'registration', $memberId . ':' . $week, $title, $body, 'NGG');
        if (function_exists('family_mail')) family_mail((string)$gr['email'], $title, [
            'title' => $title, 'intro' => $body,
            'bodyHtml' => '<p>You can see what is left, and who is helping, in your family account.</p>',
            'ctaLabel' => 'Open the family account', 'ctaUrl' => (function_exists('family_origin') ? family_origin() : '') . '/family',
            'footNote' => 'You get this because you look after ' . $first . ' in your NGG family account.',
        ]);
        $n++;
    }
    return $n;
}

/* ── Lists and one member's checklist, for staff ─────────────────────── */

const RCL_FILTERS = ['open', 'unassigned', 'mine', 'done', 'all'];
const RCL_SORTS = ['progress' => 'c.done * 1.0 / (CASE WHEN c.total > 0 THEN c.total ELSE 1 END), m.fullName', 'name' => 'm.fullName', 'started' => 'c.startedAt DESC, m.fullName'];

/** The WHERE for a list: active NGG members with a checklist, in the requester's centres. Names only reach SQL text. */
function rcl_list_where(array $g, array $p, string $filter): array {
    $w = ["m.status = 'active'", "lower(COALESCE(m.type,'NGG')) <> 'summer'"]; $a = [];
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope !== null) { if (!$scope) $scope = ['__none__']; $w[] = 'm.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $a = array_merge($a, $scope); }
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '') { $w[] = 'm.centre = ?'; $a[] = $centre; }
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    if ($q !== '') { $w[] = "(lower(m.fullName) LIKE ? OR lower(m.memberId) LIKE ? OR lower(COALESCE(m.displayId,'')) LIKE ? OR lower(c.supervisorName) LIKE ?)"; array_push($a, "%$q%", "%$q%", "%$q%", "%$q%"); }
    $f = match ($filter) {
        'open' => "c.status = 'open'", 'unassigned' => "c.status = 'open' AND c.supervisorId = ''", 'done' => "c.status = 'done'",
        'mine' => 'c.supervisorId = ?', default => '1 = 1',
    };
    $w[] = $f; if ($filter === 'mine') $a[] = (string)$g['requester']['memberId'];
    return [implode(' AND ', $w), $a];
}

function rcl_row_public(array $m, array $c, ?array $b): array {
    return ['memberId' => (string)$m['memberId'], 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
            'centre' => (string)$m['centre'], 'photoUrl' => (string)($m['photoUrl'] ?? ''),
            'status' => (string)$c['status'], 'done' => $b ? $b['done'] : (int)$c['done'], 'total' => $b ? $b['total'] : (int)$c['total'],
            'left' => $b ? $b['left'] : [], 'supervisorId' => (string)$c['supervisorId'], 'supervisorName' => (string)$c['supervisorName'],
            'supervisorKind' => (string)$c['supervisorKind'], 'assignedAt' => (string)$c['assignedAt'], 'startedAt' => (string)$c['startedAt'], 'completedAt' => (string)$c['completedAt']];
}

/**
 * admin.regcheck.list — {filter, q, centre, sort, page, pageSize, ids}. Unknown
 * filter or sort falls back to the default. The page drawn is recounted so a
 * row never shows a stale number. ids=1 → every matching memberId (≤ 2000).
 */
function admin_regcheck_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $filter = in_array((string)($p['filter'] ?? ''), RCL_FILTERS, true) ? (string)$p['filter'] : 'open';
    $sort = RCL_SORTS[(string)($p['sort'] ?? '')] ?? RCL_SORTS['progress'];
    [$w, $a] = rcl_list_where($g, $p, $filter);
    $from = 'FROM reg_checklists c JOIN members m ON m.memberId = c.memberId';
    if (!empty($p['ids'])) return ['ok' => true, 'ids' => array_column(db_all("SELECT c.memberId $from WHERE $w ORDER BY m.fullName LIMIT 2000", $a), 'memberId')];
    $counts = [];
    foreach (RCL_FILTERS as $f) { [$fw, $fa] = rcl_list_where($g, ['centre' => $p['centre'] ?? ''], $f); $counts[$f] = (int)(db_row("SELECT COUNT(*) n $from WHERE $fw", $fa)['n'] ?? 0); }
    $total = (int)(db_row("SELECT COUNT(*) n $from WHERE $w", $a)['n'] ?? 0);
    $page = max(0, (int)($p['page'] ?? 0));
    $per = (int)($p['pageSize'] ?? RCL_PAGE); if ($per < 1 || $per > 100) $per = RCL_PAGE;
    $rows = db_all("SELECT c.*, m.fullName, m.displayId, m.centre, m.photoUrl $from WHERE $w ORDER BY $sort LIMIT " . $per . ' OFFSET ' . ($page * $per), $a);
    $built = rcl_refresh(array_column($rows, 'memberId'));
    $out = [];
    foreach ($rows as $r) $out[] = rcl_row_public($r, $r, $built[(string)$r['memberId']] ?? null);
    // Active NGG members in scope with no checklist yet: the screen offers to start theirs.
    [$nw, $na] = rcl_unstarted_where($g);
    $unstarted = (int)(db_row("SELECT COUNT(*) n FROM members m WHERE $nw", $na)['n'] ?? 0);
    return ['ok' => true, 'rows' => $out, 'total' => $total, 'page' => $page, 'pageSize' => $per, 'filter' => $filter, 'counts' => $counts,
            'unstarted' => $unstarted, 'max' => RCL_BULK_MAX, 'cap' => RCL_SUPERVISOR_MAX, 'me' => (string)$g['requester']['memberId']];
}

function rcl_unstarted_where(array $g): array {
    $w = ["m.status = 'active'", "lower(COALESCE(m.type,'NGG')) <> 'summer'", "COALESCE(m.role,'member') IN ('', 'member')",
          'NOT EXISTS (SELECT 1 FROM reg_checklists c WHERE c.memberId = m.memberId)']; $a = [];
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope !== null) { if (!$scope) $scope = ['__none__']; $w[] = 'm.centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $a = $scope; }
    return [implode(' AND ', $w), $a];
}

/**
 * admin.regcheck.start — start checklists: {memberIds[]}, or {missing: true}
 * for every active NGG member in scope who has none (at most RCL_BULK_MAX a
 * press; the reply says how many are left). One audit event.
 */
function admin_regcheck_start(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    if (!empty($p['missing'])) {
        [$w, $a] = rcl_unstarted_where($g);
        $ids = array_column(db_all("SELECT m.memberId FROM members m WHERE $w ORDER BY m.id LIMIT " . RCL_BULK_MAX, $a), 'memberId');
    } else {
        $ids = array_values(array_unique(array_filter(array_map('strval', is_array($p['memberIds'] ?? null) ? $p['memberIds'] : []))));
        if (count($ids) > RCL_BULK_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => RCL_BULK_MAX];
    }
    if (!$ids) return ['ok' => true, 'applied' => 0, 'unchanged' => 0, 'refused' => 0, 'results' => [], 'left' => 0];
    $rows = rcl_members_for($g['requester'], $ids);
    $results = []; $applied = 0; $unchanged = 0; $refused = 0;
    foreach ($ids as $id) {
        $m = $rows[$id] ?? null;
        if (!$m || !admin_centre_allowed($g['requester'], (string)$m['centre'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => $m ? 'out_of_scope' : 'not_found']; $refused++; continue; }
        if (!member_is_ngg($m) || !in_array((string)($m['role'] ?? 'member'), ['', 'member'], true)) { $results[] = ['id' => $id, 'name' => (string)$m['fullName'], 'ok' => false, 'error' => 'not_a_member']; $refused++; continue; }
        if (rcl_start($m, $by)) { $results[] = ['id' => $id, 'name' => (string)$m['fullName'], 'ok' => true]; $applied++; }
        else { $results[] = ['id' => $id, 'name' => (string)$m['fullName'], 'ok' => true, 'unchanged' => true]; $unchanged++; }
    }
    audit('regcheck.start', $by, '', ['count' => count($ids), 'started' => $applied, 'unchanged' => $unchanged, 'refused' => $refused], (string)($p['ip'] ?? ''));
    [$w, $a] = rcl_unstarted_where($g);
    return ['ok' => true, 'applied' => $applied, 'unchanged' => $unchanged, 'refused' => $refused, 'results' => $results,
            'left' => (int)(db_row("SELECT COUNT(*) n FROM members m WHERE $w", $a)['n'] ?? 0)];
}

/** admin.regcheck.member — one member's checklist, every submission (with its file, for staff) and who supervises. */
function admin_regcheck_member(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $mid = (string)($p['memberId'] ?? '');
    $sg = admin_member_scope_gate($g['requester'], $mid);
    if (!$sg['ok']) return $sg;
    $m = $sg['member'];
    $c = db_row('SELECT * FROM reg_checklists WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$c) return ['ok' => true, 'started' => false, 'member' => ['memberId' => $mid, 'fullName' => (string)$m['fullName'], 'centre' => (string)$m['centre'], 'ngg' => member_is_ngg($m)]];
    $b = rcl_refresh([$mid])[$mid] ?? ['items' => [], 'done' => 0, 'total' => 0, 'left' => []];
    $c = db_row('SELECT * FROM reg_checklists WHERE memberId = ? LIMIT 1', [$mid]);
    $subs = db_all('SELECT * FROM reg_checklist_submissions WHERE memberId = ? ORDER BY id DESC LIMIT 60', [$mid]);
    $sup = (string)$c['supervisorId'];
    $present = false;
    if ($sup !== '' && ($person = rcl_person($sup))) { [$cn, $cid] = rcl_centre((string)$m['centre']); $present = rcl_present_on($person, $cn, $cid, attendance_today()); }
    return ['ok' => true, 'started' => true, 'member' => ['memberId' => $mid, 'fullName' => (string)$m['fullName'], 'displayId' => (string)($m['displayId'] ?? ''),
                'centre' => (string)$m['centre'], 'photoUrl' => (string)($m['photoUrl'] ?? '')],
            'checklist' => rcl_row_public($m, $c, $b) + ['items' => $b['items']], 'supervisorPresentToday' => $present,
            'submissions' => array_map('rcl_submission_public', $subs), 'me' => (string)$g['requester']['memberId']];
}

function rcl_submission_public(array $s): array {
    return ['submissionId' => (string)$s['submissionId'], 'itemKey' => (string)$s['itemKey'], 'supervisorId' => (string)$s['supervisorId'],
            'url' => (string)$s['url'], 'ext' => (string)$s['ext'], 'capturedOn' => (string)$s['capturedOn'], 'note' => (string)$s['note'],
            'verdict' => (string)$s['verdict'], 'reason' => (string)$s['reason'], 'at' => (string)$s['createdAt']];
}

/** admin.regcheck.reject — {memberId, itemKey, reason}. A verified admin item reopens; the supervisor is told. */
function admin_regcheck_reject(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $mid = (string)($p['memberId'] ?? ''); $key = (string)($p['itemKey'] ?? ''); $reason = trim((string)($p['reason'] ?? ''));
    if (mb_strlen($reason) < 5) return ['ok' => false, 'error' => 'reason_required', 'message' => 'Say why, so the supervisor knows what to bring next time.'];
    if (mb_strlen($reason) > 400) return ['ok' => false, 'error' => 'reason_too_long'];
    if (strncmp($key, 'auto:', 5) === 0) return ['ok' => false, 'error' => 'record_decides', 'message' => 'The record decides this item. Correct the record instead.'];
    $sg = admin_member_scope_gate($g['requester'], $mid); if (!$sg['ok']) return $sg;
    $st = db_row('SELECT * FROM reg_checklist_state WHERE memberId = ? AND itemId = ? LIMIT 1', [$mid, $key]);
    if (!$st || (string)$st['status'] !== 'verified') return ['ok' => false, 'error' => 'not_verified', 'message' => 'Only a verified item can be rejected.'];
    $item = db_row('SELECT title FROM reg_checklist_items WHERE itemId = ? LIMIT 1', [$key]);
    db_update('reg_checklist_state', ['status' => 'rejected', 'at' => now_iso(), 'byId' => $by, 'reason' => $reason], ['id' => (int)$st['id']]);
    rcl_refresh([$mid]);
    audit('regcheck.reject', $by, $mid, ['itemId' => $key, 'reason' => $reason, 'submissionId' => (string)$st['submissionId']], (string)($p['ip'] ?? ''));
    $c = db_row('SELECT supervisorId FROM reg_checklists WHERE memberId = ? LIMIT 1', [$mid]);
    $sup = (string)($c['supervisorId'] ?? '');
    if ($sup !== '' && rcl_claim('reject:' . $mid . ':' . $key . ':' . (string)$st['submissionId'], 'app', $sup, $mid)) {
        push_notification($sup, ['kind' => 'system', 'groupKey' => 'regcheck-reject:' . $mid . ':' . $key,
            'title' => '“' . (string)($item['title'] ?? 'An item') . '” was reopened for ' . rcl_first((string)$sg['member']['fullName']),
            'body' => $reason]);
    }
    return ['ok' => true, 'reopened' => true];
}

/* ── The supervisor's own work ─────────────────────────────────────────── */

/** member.regcheck.mine — the members I am helping, with what is left and whether I am at their centre today. */
function member_regcheck_mine(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    $person = rcl_person($me);
    if (!$person) return ['ok' => false, 'error' => 'no_requester'];
    // Any id the person signs in with: a volunteer who is also a member is one supervisor.
    $iph = implode(',', array_fill(0, count($person['ids']), '?'));
    $rows = db_all("SELECT c.memberId, m.fullName, m.displayId, m.centre FROM reg_checklists c JOIN members m ON m.memberId = c.memberId
                    WHERE c.supervisorId IN ($iph) AND m.status = 'active' ORDER BY (c.status = 'open') DESC, m.fullName LIMIT " . RCL_MINE_MAX, $person['ids']);
    $built = rcl_refresh(array_column($rows, 'memberId'));
    $today = attendance_today();
    $present = [];
    $refusals = [];
    if ($rows) {
        $ids = array_column($rows, 'memberId');
        $ph = implode(',', array_fill(0, count($ids), '?'));
        // The latest refusal per item, so the screen says why the last try did not count.
        foreach (db_all("SELECT memberId, itemKey, reason, verdict FROM reg_checklist_submissions WHERE memberId IN ($ph) ORDER BY id", $ids) as $s)
            $refusals[(string)$s['memberId']][(string)$s['itemKey']] = in_array((string)$s['verdict'], ['refused', 'record_fails'], true) ? (string)$s['reason'] : '';
    }
    $out = [];
    foreach ($rows as $r) {
        $mid = (string)$r['memberId']; $b = $built[$mid] ?? null; if (!$b) continue;
        $centre = (string)$r['centre'];
        if (!isset($present[$centre])) { [$cn, $cid] = rcl_centre($centre); $present[$centre] = rcl_present_on($person, $cn, $cid, $today); }
        $items = array_map(static fn($i) => $i + ['lastRefusal' => $refusals[$mid][$i['key']] ?? ''], $b['items']);
        $out[] = ['memberId' => $mid, 'fullName' => (string)$r['fullName'], 'first' => rcl_first((string)$r['fullName']), 'displayId' => (string)($r['displayId'] ?? ''),
                  'centre' => $centre, 'presentToday' => $present[$centre], 'done' => $b['done'], 'total' => $b['total'], 'status' => $b['done'] >= $b['total'] ? 'done' : 'open',
                  'items' => $items];
    }
    return ['ok' => true, 'members' => $out, 'today' => $today, 'maxBytes' => RCL_EVIDENCE_MAX_BYTES, 'evidence' => RCL_EVIDENCE];
}

/** Is this file one of ours: the bucket, Cloudinary, or this site's own photo store? */
function rcl_url_ours(string $url): bool {
    if (function_exists('results_file_ok')) return results_file_ok($url);
    return (bool)preg_match('#^https://res\.cloudinary\.com/#', $url);
}

/**
 * member.regcheck.submit — {memberId, itemKey, url?, mime?, bytes?, capturedOn?, note?}.
 * Only the member's assigned supervisor. An automatic item is checked against
 * the record (evidence never ticks it). An admin item is checked: type, size,
 * age, presence. Every attempt is kept with its verdict and the reason.
 */
function member_regcheck_submit(array $p): array {
    $me = (string)($p['requesterId'] ?? '');
    $person = rcl_person($me);
    if (!$person) return ['ok' => false, 'error' => 'no_requester'];
    $mid = (string)($p['memberId'] ?? ''); $key = (string)($p['itemKey'] ?? '');
    $c = db_row('SELECT * FROM reg_checklists WHERE memberId = ? LIMIT 1', [$mid]);
    $m = $c ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]) : null;
    // Not theirs: the same answer whether or not the member exists.
    if (!$c || !$m || !in_array((string)$c['supervisorId'], $person['ids'], true)) return ['ok' => false, 'error' => 'not_assigned', 'message' => 'You are not the supervisor for this member’s registration.'];
    [$centre, $cid] = rcl_centre((string)$m['centre']);
    $note = mb_substr(trim((string)($p['note'] ?? '')), 0, RCL_NOTE_MAX);
    $url = trim((string)($p['url'] ?? ''));
    $record = static function (string $verdict, string $reason, array $extra = []) use ($mid, $key, $me, $note, $url, $cid, $p): string {
        $sid = 'RCS-' . strtoupper(rand_hex(6));
        db_insert('reg_checklist_submissions', ['submissionId' => $sid, 'memberId' => $mid, 'itemKey' => mb_substr($key, 0, 60), 'supervisorId' => $me,
            'url' => mb_substr($url, 0, 600), 'ext' => (string)($extra['ext'] ?? ''), 'mime' => mb_substr((string)($p['mime'] ?? ''), 0, 120), 'bytes' => (int)($extra['bytes'] ?? 0),
            'capturedOn' => (string)($extra['capturedOn'] ?? ''), 'note' => $note, 'verdict' => $verdict, 'reason' => mb_substr($reason, 0, 400), 'centreId' => $cid, 'createdAt' => now_iso()]);
        audit('regcheck.submit', $me, $mid, ['itemKey' => $key, 'verdict' => $verdict, 'submissionId' => $sid], (string)($p['ip'] ?? ''));
        return $sid;
    };
    // Still allowed to do this at that centre (safeguarding can be withdrawn after assignment).
    $cand = rcl_candidates($centre, $cid)[(string)$c['supervisorId']] ?? null;
    if (!$cand) {
        $why = 'You can no longer supervise registrations at ' . $centre . '. Ask the staff to check your record.';
        $record('refused', $why);
        return ['ok' => true, 'accepted' => false, 'error' => 'not_eligible', 'reason' => $why];
    }

    if (strncmp($key, 'auto:', 5) === 0) {
        $k = substr($key, 5);
        if (!isset(RCL_AUTO[$k]) || !rcl_auto_applies($k)) return ['ok' => false, 'error' => 'not_found'];
        $ok = (bool)call_user_func('rcl_verify_' . $k, $m, rcl_facts([$mid]));
        $why = $ok ? RCL_AUTO[$k]['title'] . ': the record shows it.' : 'The record does not show it yet. ' . RCL_AUTO[$k]['fix'];
        $record($ok ? 'record_passes' : 'record_fails', $why);
        rcl_refresh([$mid]);
        return ['ok' => true, 'accepted' => $ok, 'reason' => $why, 'record' => true];
    }

    $item = db_row("SELECT * FROM reg_checklist_items WHERE itemId = ? AND status = 'active' LIMIT 1", [$key]);
    if (!$item) return ['ok' => false, 'error' => 'not_found', 'message' => 'That item is no longer on the checklist.'];
    $st = db_row('SELECT status FROM reg_checklist_state WHERE memberId = ? AND itemId = ? LIMIT 1', [$mid, $key]);
    if ($st && (string)$st['status'] === 'verified') return ['ok' => true, 'accepted' => true, 'unchanged' => true, 'reason' => 'Already verified.'];

    $v = rcl_check_evidence($item, $p, $person, $centre, $cid, rcl_first((string)$m['fullName']));
    if (!$v['ok']) {
        $record('refused', $v['reason'], $v);
        return ['ok' => true, 'accepted' => false, 'error' => $v['error'], 'reason' => $v['reason']];
    }
    $sid = $record('accepted', 'Verified: ' . $v['reason'], $v);
    $row = ['status' => 'verified', 'submissionId' => $sid, 'at' => now_iso(), 'byId' => $me, 'reason' => ''];
    if ($st) db_update('reg_checklist_state', $row, ['memberId' => $mid, 'itemId' => $key]);
    else db_insert('reg_checklist_state', $row + ['memberId' => $mid, 'itemId' => $key]);
    rcl_refresh([$mid]);
    return ['ok' => true, 'accepted' => true, 'reason' => 'Verified: ' . $v['reason'], 'submissionId' => $sid];
}

/**
 * The checks an admin item's evidence must pass, in the order a person would
 * fix them. ['ok' => bool, 'error', 'reason' (words), 'ext', 'bytes', 'capturedOn'].
 */
function rcl_check_evidence(array $item, array $p, array $person, string $centre, string $cid, string $first): array {
    $ev = (string)$item['evidence'];
    $url = trim((string)($p['url'] ?? ''));
    $note = trim((string)($p['note'] ?? ''));
    $out = ['ext' => '', 'bytes' => 0, 'capturedOn' => ''];
    $no = static fn(string $e, string $r, array $o) => ['ok' => false, 'error' => $e, 'reason' => $r] + $o;
    if ($ev === 'none') {
        if (mb_strlen($note) < 3) return $no('note_missing', 'Write a short note saying what you checked.', $out);
    } else {
        $want = $ev === 'photo' ? 'a photo' : 'a document';
        if ($url === '') return $no('evidence_missing', 'This item needs ' . $want . '. Attach one.', $out);
        if (!rcl_url_ours($url)) return $no('evidence_not_ours', 'Upload the file here: a link to somewhere else cannot be checked.', $out);
        $ext = function_exists('upload_ext') ? upload_ext($url) : strtolower((string)pathinfo((string)parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
        $out['ext'] = $ext;
        if (!in_array($ext, RCL_EVIDENCE_EXT[$ev], true)) {
            $what = RCL_EXT_WORDS[$ext] ?? ($ext !== '' ? 'a .' . $ext . ' file' : 'a file of no known type');
            return $no('wrong_type', 'This item needs ' . $want . ($ev === 'photo' ? ' (JPG, PNG, WebP or HEIC)' : ' (PDF, Word, or a photo of the page)') . '; that is ' . $what . '.', $out);
        }
        $mime = strtolower(trim((string)($p['mime'] ?? '')));
        if ($mime === '' || !in_array($mime, RCL_MIME[$ext] ?? [], true))
            return $no('wrong_type', 'The file is named .' . $ext . ' but says it is ' . ($mime !== '' ? $mime : 'nothing') . '. Upload the original file again.', $out);
        // The size the storage recorded wins over what the browser said.
        $known = db_row('SELECT bytes FROM media_objects WHERE url = ? LIMIT 1', [$url]);
        $bytes = $known && (int)$known['bytes'] > 0 ? (int)$known['bytes'] : (int)($p['bytes'] ?? 0);
        $out['bytes'] = $bytes;
        if ($bytes <= 0) return $no('empty_file', 'The file is empty. Attach it again.', $out);
        if ($bytes > RCL_EVIDENCE_MAX_BYTES) return $no('too_large', 'The file is larger than ' . (int)(RCL_EVIDENCE_MAX_BYTES / 1048576) . ' MB.', $out);
    }
    $max = (int)$item['maxAgeDays'];
    $today = attendance_today();
    if ($max > 0) {
        $on = substr(trim((string)($p['capturedOn'] ?? '')), 0, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $on) || !strtotime($on . 'T12:00:00Z')) return $no('date_missing', 'Say when the ' . ($ev === 'photo' ? 'photo was taken' : 'document is dated') . '.', $out);
        $out['capturedOn'] = $on;
        if ($on > $today) return $no('date_future', 'That date is in the future.', $out);
        $age = (int)round((strtotime($today . 'T12:00:00Z') - strtotime($on . 'T12:00:00Z')) / 86400);
        if ($age > $max) return $no('stale', 'That is ' . $age . ' days old; this item takes evidence from the last ' . $max . ' ' . ($max === 1 ? 'day' : 'days') . '.', $out);
    }
    if ((int)$item['presence'] === 1 && !rcl_present_on($person, $centre, $cid, $today))
        return $no('not_present', 'This item needs you at ' . $centre . ' with ' . $first . '. Check in at the gate there today, then submit it.', $out);
    $what = $ev === 'none' ? 'note recorded' : ($ev === 'photo' ? 'photo' : 'document') . ' checked';
    return ['ok' => true, 'error' => '', 'reason' => $what . ((int)$item['presence'] === 1 ? ', at ' . $centre . ' today' : '') . '.'] + $out;
}

/* ── What a member and their guardians see ────────────────────────────── */

/** Progress in public words: counts, what is left, the helper's first name. No evidence, nobody else. */
function rcl_progress_public(array $m): array {
    $c = db_row('SELECT * FROM reg_checklists WHERE memberId = ? LIMIT 1', [(string)$m['memberId']]);
    if (!$c || !member_is_ngg($m)) return ['started' => false];
    $b = rcl_refresh([(string)$m['memberId']])[(string)$m['memberId']] ?? null;
    if (!$b) return ['started' => false];
    return ['started' => true, 'done' => $b['done'], 'total' => $b['total'], 'complete' => $b['total'] > 0 && $b['done'] >= $b['total'],
            'left' => $b['left'], 'helper' => rcl_first((string)$c['supervisorName'])];
}

/** member.regcheck.progress — the signed-in member's own. */
function member_regcheck_progress(array $p): array {
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['requesterId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'no_requester'];
    return ['ok' => true, 'first' => rcl_first((string)$m['fullName'])] + rcl_progress_public($m);
}

/** family.regcheck — one ward's, through the guardian's own active link. */
function family_regcheck(array $p): array {
    $l = function_exists('family_link') ? family_link((string)($p['guardianId'] ?? ''), (string)($p['linkId'] ?? '')) : null;
    if (!$l) return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)$l['memberId']]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'first' => rcl_first((string)$m['fullName'])] + rcl_progress_public($m);
}
