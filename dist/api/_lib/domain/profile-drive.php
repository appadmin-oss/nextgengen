<?php
declare(strict_types=1);

/**
 * The member record drive: from "almost everything optional" (the roster was
 * seeded fast, with gaps and clashes) to "everything required", without a
 * single page failing on the way.
 *
 * ── THREE PHASES, CHOSEN BY STAFF (Control Room → Settings → Member records) ──
 *   off       Nothing asked, nothing locked. The default, so deploying this
 *             changes nothing until somebody sets a deadline.
 *   collect   Active members whose record is missing a required field see a
 *             "complete your record" card with the days left. Nothing is
 *             locked before the deadline. AFTER the deadline the card becomes
 *             the only screen: every member action except completing the
 *             record (and reading it) answers `record_incomplete`, a normal
 *             refusal the app turns into the form — never a server error.
 *   required  When the data is in. The fields are required on every save of
 *             an ACTIVE member (staff edits, imports, the member's own form).
 *             The gate stays for anybody still incomplete.
 *
 * ── WHO IS ASKED ─────────────────────────────────────────────────────────────
 * Active members of the types the drive covers (NGG by default). Suspended,
 * inactive and graduated members are never asked, never gated and never
 * refused on save: their record keeps whatever it has, and a page that shows
 * them shows the gaps as gaps. Making one active again puts them under the
 * drive like everybody else. Staff accounts are never gated.
 *
 * ── THE JOIN DATE ────────────────────────────────────────────────────────────
 * Not a free field. It is written by the paths that know it — acceptance
 * (the start date staff set), promotion from Summer School, the roster import
 * when a member has none — and changed afterwards only through "Correct the
 * join date" (people capability, a reason, not in the future, not before the
 * programme began or before they were 5), audited. A member never sets it.
 */

const PROFILE_DRIVE_PHASES = ['off', 'collect', 'required'];
/* No join date before this. Printed IDs go back to 2023 intakes (023-…), so
   the floor is generous; the intake-year rule below is the precise one. */
const PROFILE_JOIN_EARLIEST = '2018-01-01';

/**
 * Every field the drive can ask for. `col` lives on the members row; `json`
 * in members.profileJson (the Club application's keys). `self` = the member
 * may fill it on their own form; the rest are staff-only (centre, photo
 * review stays with staff because a photo is checked before it prints).
 */
function profile_fields(): array {
    $classes = defined('CLUB_APPLY_CLASSES') ? CLUB_APPLY_CLASSES : [];
    return [
        'fullName'    => ['label' => 'Full name (first and surname)', 'store' => 'col', 'self' => true, 'type' => 'text'],
        'dob'         => ['label' => 'Date of birth', 'store' => 'col', 'self' => true, 'type' => 'date'],
        'sex'         => ['label' => 'Sex', 'store' => 'json', 'self' => true, 'type' => 'choice', 'options' => ['Female', 'Male']],
        'photoUrl'    => ['label' => 'Passport photo', 'store' => 'col', 'self' => true, 'type' => 'photo'],
        'phone'       => ['label' => 'Mobile number', 'store' => 'col', 'self' => true, 'type' => 'tel'],
        'school'      => ['label' => 'School', 'store' => 'col', 'self' => true, 'type' => 'text'],
        'class'       => ['label' => 'Class', 'store' => 'json', 'self' => true, 'type' => 'choice', 'options' => $classes],
        'address'     => ['label' => 'Home address', 'store' => 'json', 'self' => true, 'type' => 'textarea'],
        'resState'    => ['label' => 'State you live in', 'store' => 'json', 'self' => true, 'type' => 'text'],
        'resLga'      => ['label' => 'Local government you live in', 'store' => 'json', 'self' => true, 'type' => 'text'],
        'parentName'  => ['label' => 'Parent or guardian’s full name', 'store' => 'col', 'self' => true, 'type' => 'text'],
        'parentPhone' => ['label' => 'Parent or guardian’s phone', 'store' => 'col', 'self' => true, 'type' => 'tel'],
        'parentEmail' => ['label' => 'Parent or guardian’s email', 'store' => 'col', 'self' => true, 'type' => 'email'],
        'centre'      => ['label' => 'Centre', 'store' => 'col', 'self' => false, 'type' => 'text'],
    ];
}
const PROFILE_DEFAULT_FIELDS = ['fullName', 'dob', 'sex', 'photoUrl', 'school', 'class', 'address', 'resState', 'resLga', 'parentName', 'parentPhone', 'parentEmail', 'centre'];

/** The drive as configured, with the phase it is in TODAY ('collect' after the deadline locks). */
function profile_drive(): array {
    $s = setting_get('profile_drive');
    $s = is_array($s) ? $s : [];
    $phase = in_array($s['phase'] ?? '', PROFILE_DRIVE_PHASES, true) ? (string)$s['phase'] : 'off';
    $deadline = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($s['deadline'] ?? '')) ? (string)$s['deadline'] : '';
    $all = profile_fields();
    $fields = array_values(array_filter(is_array($s['fields'] ?? null) ? $s['fields'] : PROFILE_DEFAULT_FIELDS, fn($k) => isset($all[$k])));
    $types = array_values(array_intersect(is_array($s['types'] ?? null) ? $s['types'] : ['NGG'], ['NGG', 'Summer']));
    $today = function_exists('mp_today') ? mp_today() : gmdate('Y-m-d');
    $locked = $phase === 'required' || ($phase === 'collect' && $deadline !== '' && $today > $deadline);
    $days = $deadline !== '' ? (int)floor((strtotime($deadline . 'T00:00:00Z') - strtotime($today . 'T00:00:00Z')) / 86400) : null;
    return ['phase' => $phase, 'deadline' => $deadline, 'fields' => $fields, 'types' => $types ?: ['NGG'],
            'locked' => $locked, 'daysLeft' => $days, 'today' => $today];
}

/** Does the drive ask this member? Active, of a covered type, and not staff. */
function profile_applies(array $m, ?array $drive = null): bool {
    $drive ??= profile_drive();
    if ($drive['phase'] === 'off') return false;
    if ((string)($m['status'] ?? '') !== 'active') return false;
    if (function_exists('is_admin_role') && is_admin_role((string)($m['role'] ?? ''))) return false;
    return in_array((string)($m['type'] ?? 'NGG'), $drive['types'], true);
}

function profile_json(array $m): array {
    $j = json_decode((string)($m['profileJson'] ?? ''), true);
    return is_array($j) ? $j : [];
}

/** One field's value on a member row ('' when empty). */
function profile_value(array $m, string $key): string {
    $f = profile_fields()[$key] ?? null;
    if (!$f) return '';
    $v = $f['store'] === 'col' ? ($m[$key] ?? '') : (profile_json($m)[$key] ?? '');
    return is_scalar($v) ? trim((string)$v) : '';
}

/** Is a stored value an acceptable answer? (Seeded rows carry placeholders and half-names.) */
function profile_value_ok(string $key, string $v): bool {
    if ($v === '') return false;
    switch ($key) {
        case 'fullName':    return count(preg_split('/\s+/', $v)) >= 2;
        case 'dob':         return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) && ($a = dob_age($v)) >= 5 && $a <= 40;
        case 'parentEmail': return (bool)filter_var($v, FILTER_VALIDATE_EMAIL);
        case 'phone': case 'parentPhone': return function_exists('club_phone') ? club_phone($v) !== '' : strlen(preg_replace('/\D/', '', $v)) >= 10;
        case 'sex':         return in_array($v, ['Female', 'Male'], true);
        case 'class':       return !defined('CLUB_APPLY_CLASSES') || in_array($v, CLUB_APPLY_CLASSES, true);
        case 'address':     return mb_strlen($v) >= 6;
        default:            return mb_strlen($v) >= 2;
    }
}

/** The required fields this member is missing (or has in a form the record can't use). */
function profile_missing(array $m, ?array $drive = null): array {
    $drive ??= profile_drive();
    $out = [];
    foreach ($drive['fields'] as $k) if (!profile_value_ok($k, profile_value($m, $k))) $out[] = $k;
    return $out;
}

/** What the member's app needs: is the drive asking, what is missing, is it locked. Never fails. */
function profile_gate_for(string $memberId): array {
    $drive = profile_drive();
    $m = $memberId !== '' ? db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]) : null;
    if (!$m || !profile_applies($m, $drive)) return ['asked' => false, 'locked' => false, 'missing' => []];
    $missing = profile_missing($m, $drive);
    return ['asked' => (bool)$missing, 'locked' => $drive['locked'] && (bool)$missing, 'missing' => $missing,
            'deadline' => $drive['deadline'], 'daysLeft' => $drive['daysLeft'], 'phase' => $drive['phase']];
}

/* Member ops that stay open while a record is locked: reading and completing
   it, the notification bell, UI preferences. Everything else waits. */
const PROFILE_GATE_OPEN = ['member.profile.status', 'member.profile.complete', 'member.dashboard', 'member.notifications',
    'member.notificationRead', 'member.state.get', 'member.state.set', 'member.update'];

/**
 * Called first in backend_dispatch for member ops. Returns a refusal (an
 * ordinary {ok:false} the client turns into the completion form) or null.
 * Any failure inside it lets the request through: a gate must never become
 * the outage.
 */
function profile_gate_intercept(string $op, array $args): ?array {
    if (strpos($op, 'member.') !== 0 || in_array($op, PROFILE_GATE_OPEN, true)) return null;
    $mid = (string)($args['memberId'] ?? '');
    if ($mid === '') return null;
    try {
        $g = profile_gate_for($mid);
        if (!$g['locked']) return null;
        return ['ok' => false, 'error' => 'record_incomplete', 'missing' => $g['missing'],
                'detail' => 'Complete your record to carry on. ' . count($g['missing']) . ' thing' . (count($g['missing']) === 1 ? ' is' : 's are') . ' missing.'];
    } catch (Throwable $e) {
        error_log('[profile] gate skipped: ' . $e->getMessage());
        return null;
    }
}

/** Describe fields for a form: label, type, options, current value, may the member fill it. */
function profile_field_rows(array $m, array $keys): array {
    $all = profile_fields(); $out = [];
    foreach ($keys as $k) {
        $f = $all[$k];
        $out[] = ['key' => $k, 'label' => $f['label'], 'type' => $f['type'], 'options' => $f['options'] ?? [],
                  'value' => profile_value($m, $k), 'self' => $f['self']];
    }
    return $out;
}

/** member.profile.status — the member's own record drive state. */
function member_profile_status(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $g = profile_gate_for($mid);
    return ['ok' => true] + $g + ['fields' => $g['asked'] ? profile_field_rows($m, $g['missing']) : []];
}

/**
 * Normalise and check one answer. Returns [value, error] — error '' when fine.
 * The same rules the Club application uses, so a record completed here looks
 * like one that came in through the form.
 */
function profile_clean(string $key, $raw): array {
    $v = is_scalar($raw) ? trim(preg_replace('/\s+/', ' ', (string)$raw)) : '';
    if ($key === 'address') $v = mb_substr(trim((string)$raw), 0, 300);
    if (in_array($key, ['fullName', 'parentName', 'school', 'resState', 'resLga'], true) && function_exists('club_title')) $v = club_title($v);
    if ($key === 'dob') $v = function_exists('member_date') ? (string)(member_date($v) ?? '') : $v;
    if (in_array($key, ['phone', 'parentPhone'], true) && function_exists('club_phone')) $v = club_phone($v);
    if ($key === 'parentEmail') $v = strtolower($v);
    $msg = ['fullName' => 'Write the first name and the surname.', 'dob' => 'Enter a real date of birth.',
            'phone' => 'Enter an 11-digit Nigerian mobile number.', 'parentPhone' => 'Enter an 11-digit Nigerian mobile number.',
            'parentEmail' => 'Enter a full email address.', 'sex' => 'Choose one.', 'class' => 'Choose the class.',
            'address' => 'Add the street and area.'][$key] ?? 'This is required.';
    return profile_value_ok($key, $v) ? [$v, ''] : [$v, $msg];
}

/** Write cleaned answers to the row: columns directly, the rest into profileJson. */
function profile_write(array $m, array $clean): void {
    $all = profile_fields(); $patch = []; $json = profile_json($m); $jsonChanged = false;
    foreach ($clean as $k => $v) {
        if (($all[$k]['store'] ?? '') === 'col') $patch[$k] = $v;
        else { $json[$k] = $v; $jsonChanged = true; }
    }
    if ($jsonChanged) $patch['profileJson'] = json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!$patch) return;
    $patch['updatedAt'] = now_iso();
    db_update('members', $patch, ['memberId' => $m['memberId']]);
    if (isset($patch['photoUrl']) && function_exists('photo_supersede')) photo_supersede('member', (string)$m['memberId'], (string)($m['photoUrl'] ?? ''), (string)$patch['photoUrl'], (string)$m['memberId']);
}

/**
 * member.profile.complete — the member fills in what is missing. Only fields
 * a member may fill; every answer checked before anything is written; a
 * refusal names each field and why.
 */
function member_profile_complete(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $all = profile_fields();
    $vals = is_array($p['values'] ?? null) ? $p['values'] : [];
    $clean = []; $errors = [];
    foreach ($vals as $k => $raw) {
        if (!isset($all[$k]) || empty($all[$k]['self'])) continue;   // staff-only or unknown: ignored, never written
        if ($k === 'photoUrl') {
            if (trim((string)$raw) === '') { $errors[$k] = 'Add a passport photo.'; continue; }
            $u = function_exists('photo_intake_url') ? photo_intake_url((string)$raw) : (string)$raw;
            if ($u === '') { $errors[$k] = 'That photo could not be used. Try another.'; continue; }
            if (($q = photo_qa_gate($u)) !== null) { $errors[$k] = $q['message']; continue; }   // NGG does not take low-quality photos
            $clean[$k] = $u; continue;
        }
        [$v, $err] = profile_clean($k, $raw);
        if ($err !== '') $errors[$k] = $err; else $clean[$k] = $v;
    }
    if ($errors) return ['ok' => false, 'error' => 'record_invalid', 'errors' => $errors];
    if ($clean) {
        profile_write($m, $clean);
        audit('member.profile.complete', $mid, $mid, ['keys' => array_keys($clean)], (string)($p['ip'] ?? ''));
    }
    return member_profile_status(['memberId' => $mid]);
}

/* ── Staff ──────────────────────────────────────────────────────────────── */

/** admin.profile.drive — the settings, and how complete the roster is (centre-scoped). */
function admin_profile_drive(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $drive = profile_drive();
    $scope = function_exists('admin_centre_names_in_scope') ? admin_centre_names_in_scope($g['requester']) : null;
    $rows = db_all("SELECT * FROM members WHERE status = 'active'");
    $byField = array_fill_keys($drive['fields'], 0); $total = 0; $complete = 0; $incomplete = [];
    $probe = $drive['phase'] === 'off' ? array_merge($drive, ['phase' => 'collect']) : $drive;   // stats even before it starts
    foreach ($rows as $m) {
        if ($scope !== null && !in_array((string)$m['centre'], $scope, true)) continue;
        if (!profile_applies($m, $probe)) continue;
        $total++;
        $miss = profile_missing($m, $probe);
        if (!$miss) { $complete++; continue; }
        foreach ($miss as $k) $byField[$k]++;
        $incomplete[] = ['memberId' => $m['memberId'], 'fullName' => $m['fullName'], 'centre' => $m['centre'], 'displayId' => $m['displayId'] ?? '', 'missing' => $miss,
                         'contact' => (string)($m['parentEmail'] ?: $m['email']) !== ''];
    }
    usort($incomplete, fn($a, $b) => count($b['missing']) <=> count($a['missing']) ?: strcmp((string)$a['fullName'], (string)$b['fullName']));
    $labels = array_map(fn($f) => $f['label'], profile_fields());
    return ['ok' => true, 'drive' => $drive, 'fieldsAll' => $labels, 'defaults' => PROFILE_DEFAULT_FIELDS,
            'stats' => ['total' => $total, 'complete' => $complete, 'byField' => $byField], 'incomplete' => array_slice($incomplete, 0, 500)];
}

/** admin.profile.drive.set — phase, deadline, fields, types. Moving to `required` needs a reason it is safe. */
function admin_profile_drive_set(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $phase = (string)($p['phase'] ?? '');
    if (!in_array($phase, PROFILE_DRIVE_PHASES, true)) return ['ok' => false, 'error' => 'bad_phase'];
    $deadline = trim((string)($p['deadline'] ?? ''));
    if ($deadline !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) return ['ok' => false, 'error' => 'bad_deadline'];
    if ($phase === 'collect' && $deadline === '') return ['ok' => false, 'error' => 'deadline_required', 'detail' => 'Set the date by which members must complete their record.'];
    $all = profile_fields();
    $fields = array_values(array_filter(is_array($p['fields'] ?? null) ? $p['fields'] : PROFILE_DEFAULT_FIELDS, fn($k) => isset($all[$k])));
    if (!$fields) return ['ok' => false, 'error' => 'fields_required'];
    $types = array_values(array_intersect(is_array($p['types'] ?? null) ? $p['types'] : ['NGG'], ['NGG', 'Summer'])) ?: ['NGG'];
    $before = profile_drive();
    setting_set('profile_drive', ['phase' => $phase, 'deadline' => $deadline, 'fields' => $fields, 'types' => $types], (string)$g['requester']['memberId']);
    audit('admin.profile.drive', $g['requester']['memberId'], '', ['from' => $before['phase'], 'to' => $phase, 'deadline' => $deadline, 'fields' => count($fields)], (string)($p['ip'] ?? ''));
    return admin_profile_drive($p);
}

/**
 * admin.profile.remind — email each chosen incomplete member's family (or
 * the member) what is missing and the deadline. Capped, scoped per row, one
 * audit event for the run; a member already complete is reported unchanged.
 */
function admin_profile_remind(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_map('strval', is_array($p['memberIds'] ?? null) ? $p['memberIds'] : [])));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > 500) return ['ok' => false, 'error' => 'too_many', 'detail' => 'At most 500 at a time.'];
    $drive = profile_drive();
    $all = profile_fields();
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $results = []; $sent = 0;
    foreach ($ids as $id) {
        $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
        if (!$m) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'not_found']; continue; }
        if (function_exists('admin_centre_allowed') && !admin_centre_allowed($g['requester'], (string)$m['centre'])) { $results[] = ['id' => $id, 'ok' => false, 'error' => 'out_of_scope']; continue; }
        $miss = profile_applies($m, array_merge($drive, ['phase' => $drive['phase'] === 'off' ? 'collect' : $drive['phase']])) ? profile_missing($m, $drive) : [];
        if (!$miss) { $results[] = ['id' => $id, 'ok' => true, 'unchanged' => true]; continue; }
        $to = (string)($m['parentEmail'] ?: $m['email']);
        if ($to === '') { $results[] = ['id' => $id, 'ok' => false, 'error' => 'no_email']; continue; }
        $first = explode(' ', trim((string)$m['fullName']))[0] ?: 'there';
        $list = '<ul style="margin:0 0 12px;padding-left:18px">' . implode('', array_map(fn($k) => '<li>' . esc_html($all[$k]['label']) . '</li>', $miss)) . '</ul>';
        $ok = function_exists('intake_acknowledge');
        if ($ok) intake_acknowledge($to, 'Complete ' . $first . '’s NGG record' . ($drive['deadline'] ? ' by ' . date('j F', strtotime($drive['deadline'])) : ''), [
            'title' => 'A few details are missing',
            'intro' => 'Hello. ' . $first . '’s NGG record is missing:',
            'bodyHtml' => $list . '<p style="margin:0">Sign in to the member dashboard to fill them in. It takes about three minutes.'
                . ($drive['deadline'] ? ' After ' . esc_html(date('j F Y', strtotime($drive['deadline']))) . ', the dashboard opens on this form until it is done.' : '') . '</p>',
            'ctaLabel' => 'Complete the record', 'ctaUrl' => $origin . '/dashboard',
            'footNote' => 'You are receiving this because ' . $first . ' is an active NGG member.',
        ]);
        $sent++;
        $results[] = ['id' => $id, 'ok' => true];
    }
    audit('admin.profile.remind', $g['requester']['memberId'], '', ['count' => count($ids), 'sent' => $sent,
        'refused' => count(array_filter($results, fn($r) => empty($r['ok'])))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sent' => $sent, 'results' => $results];
}

/**
 * Staff saving an ACTIVE member while the drive is `required`: the required
 * fields must be present. Never applied to suspended, inactive or graduated
 * members, nor to a save that makes the member one of those — so suspending
 * somebody with a gappy record always works.
 *
 * @return array{ok:bool, error?:string, missing?:list<string>, detail?:string}
 */
function profile_required_check(array $merged): array {
    try {
        $drive = profile_drive();
        if ($drive['phase'] !== 'required' || !profile_applies($merged, $drive)) return ['ok' => true];
        $miss = array_values(array_filter(profile_missing($merged, $drive), fn($k) => $k !== 'photoUrl'));   // a photo is reviewed, not typed
        if (!$miss) return ['ok' => true];
        $all = profile_fields();
        return ['ok' => false, 'error' => 'record_required', 'missing' => $miss,
                'detail' => 'An active member’s record needs: ' . implode(', ', array_map(fn($k) => $all[$k]['label'], $miss)) . '. Fill them in, or change the status first.'];
    } catch (Throwable $e) {
        error_log('[profile] required check skipped: ' . $e->getMessage());
        return ['ok' => true];
    }
}

/**
 * admin.member.joindate — the one way to change a join date after it is set.
 * people capability; a reason; a real date not in the future, not before the
 * programme began, and not before the member was 5; scoped; audited with the
 * old and new date.
 */
function admin_member_joindate(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [(string)($p['memberId'] ?? '')]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (function_exists('admin_centre_allowed') && !admin_centre_allowed($g['requester'], (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $reason = trim((string)($p['reason'] ?? ''));
    if (mb_strlen($reason) < 8) return ['ok' => false, 'error' => 'reason_required', 'detail' => 'Say why the join date is being corrected (at least a few words).'];
    $date = function_exists('member_date') ? member_date((string)($p['date'] ?? '')) : null;
    if (!$date) return ['ok' => false, 'error' => 'joindate_invalid', 'detail' => 'Enter a real date.'];
    $today = gmdate('Y-m-d');
    if ($date > $today) return ['ok' => false, 'error' => 'joindate_future', 'detail' => 'A join date cannot be in the future.'];
    if ($date < PROFILE_JOIN_EARLIEST) return ['ok' => false, 'error' => 'joindate_too_early', 'detail' => 'A join date cannot be before 2018.'];
    /* The printed ID says the intake year (026-014 ⇒ 2026): the join date sits in it. */
    $idYear = trim((string)($m['displayId'] ?? '')) !== '' && function_exists('member_id_year') ? (int)member_id_year((string)$m['displayId']) : 0;
    if ($idYear && (int)substr($date, 0, 4) !== $idYear) {
        return ['ok' => false, 'error' => 'joindate_intake_mismatch',
                'detail' => 'Their printed ID ' . $m['displayId'] . ' is a ' . $idYear . ' intake, so they joined in ' . $idYear . '. If the ID is wrong, correct that first.'];
    }
    $dob = (string)($m['dob'] ?? '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob) && $date < date('Y-m-d', strtotime($dob . ' +5 years'))) return ['ok' => false, 'error' => 'joindate_before_dob', 'detail' => 'That date is before they were five.'];
    $old = (string)($m['joinDate'] ?? '');
    if ($old === $date) return ['ok' => true, 'unchanged' => true, 'joinDate' => $date];
    db_update('members', ['joinDate' => $date, 'updatedAt' => now_iso()], ['memberId' => $m['memberId']]);
    audit('admin.member.joindate', $g['requester']['memberId'], (string)$m['memberId'], ['from' => $old, 'to' => $date, 'reason' => mb_substr($reason, 0, 300)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'joinDate' => $date, 'was' => $old];
}
