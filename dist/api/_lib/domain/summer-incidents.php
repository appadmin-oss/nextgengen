<?php
declare(strict_types=1);

/**
 * Summer School portal v3 — incidents and guardian messages.
 *
 * INCIDENTS. First aid, health, behaviour, pickup, lost items: logged by the
 * coordinator, told to the guardian, closed. Told means a message actually
 * left (email and/or text) and `toldAt` records when, by whom and on what —
 * never a box ticked to say somebody was phoned.
 *
 * A SAFEGUARDING incident is not one of these. It is filed as a case in the
 * safeguarding queue (sg_case_open, mentorship-pods.php) — the one place a
 * trained lead (`safeguarding`) works, with the centre's officer emailed — and
 * the incident row keeps only that it happened and the case number. The child,
 * the details and whether the family is told are the lead's, so the portal
 * never shows them, and Tell guardian is refused (`lead_decides`).
 *
 * MESSAGES. A template, an audience counted from the same roster as every other
 * screen (ss3_roster), a channel. Sending is a bulk act that reaches people:
 * it is parked for its undo window (pending.php), capped at
 * SS3_MSG_MAX recipients with the cap named, and audited once per send.
 *
 * Both are scoped to the requester's centres on the way in (CLAUDE.md §4).
 */

const SS3_INC_KINDS = ['First aid', 'Health', 'Behaviour', 'Pickup', 'Lost item', 'Safeguarding'];
const SS3_INC_SEV = ['low', 'med', 'high'];
const SS3_INC_SAFE = 'Safeguarding';
const SS3_MSG_MAX = 500;
const SS3_MSG_CHANNELS = ['email', 'sms', 'both'];
const SS3_MSG_AUDIENCES = ['absent' => 'Guardians of children not in today', 'stopped' => 'Guardians of children who stopped coming',
                          'risk' => 'Guardians of children under the risk rate', 'all' => 'All guardians this season',
                          'unverified' => 'Guardians who haven’t confirmed yet'];
/* The templates, one list for the screen and the sender. A placeholder the
   sender cannot fill is not offered: {time} is the sign-out time from the
   attendance settings, {details} is what the coordinator types. */
const SS3_MSG_TEMPLATES = [
    'absent'  => ['Not in today', 'Hello {guardian}, {child} has not checked in at {centre} today. If they are unwell or away, reply to this message so we can mark it.'],
    'pickup'  => ['Pickup reminder', 'Hello {guardian}, pickup for {child} is at {time} today. Only authorised collectors can take children home.'],
    'change'  => ['Change to today', 'Hello {guardian}, there is a change at {centre} today: {details}. Thank you for your patience.'],
    'note'    => ['A note from Summer School', 'Hello {guardian}, a note about {child} at {centre}: {details}'],
];

/** The incidents a requester may see: their centres' rows, in the edition. */
function ss3_incident_rows(array $req, array $ed): array {
    $args = [(string)$ed['cohortId']];
    $scope = ss3_scope_sql(admin_centre_names_in_scope($req), 'centre', $args);
    return db_all("SELECT * FROM summer_incidents WHERE cohortId = ?$scope ORDER BY id DESC LIMIT 400", $args);
}

function ss3_incident_public(array $x): array {
    $safe = (string)$x['kind'] === SS3_INC_SAFE;
    return ['id' => (string)$x['incidentId'], 'kind' => (string)$x['kind'], 'sev' => (string)$x['severity'],
            'child' => $safe ? 'Restricted' : (string)$x['childName'], 'studentId' => $safe ? '' : (string)$x['studentId'],
            'centre' => (string)$x['centre'], 'note' => (string)$x['note'], 'by' => (string)$x['byName'],
            'status' => (string)$x['status'], 'restricted' => $safe, 'createdAt' => (string)$x['createdAt'],
            'toldAt' => (string)$x['toldAt'], 'toldBy' => (string)$x['toldBy']];
}

/** part=incidents: the list, the counts per kind, and what the form offers. */
function ss3_view_incidents(array $req, array $ed, array $roster): array {
    $rows = ss3_incident_rows($req, $ed);
    $week = gmdate('Y-m-d', strtotime(attendance_today() . ' -6 days'));
    $k = ['open' => 0, 'untold' => 0, 'week' => 0, 'safeOpen' => 0];
    $byKind = array_fill_keys(SS3_INC_KINDS, 0);
    foreach ($rows as $x) {
        $byKind[(string)$x['kind']] = ($byKind[(string)$x['kind']] ?? 0) + 1;
        if ($x['status'] === 'open') $k['open']++;
        if ($x['status'] === 'open' && $x['toldAt'] === '' && $x['kind'] !== SS3_INC_SAFE) $k['untold']++;
        if (substr((string)$x['createdAt'], 0, 10) >= $week) $k['week']++;
        if ($x['status'] === 'open' && $x['kind'] === SS3_INC_SAFE) $k['safeOpen']++;
    }
    $names = admin_centre_names_in_scope($req);
    $centres = array_values(array_unique(array_filter(array_merge(array_column($roster, 'centre'), $names ?? []))));
    sort($centres);
    return ['incidents' => array_map('ss3_incident_public', $rows), 'incKpis' => $k, 'incKinds' => $byKind,
            'kinds' => SS3_INC_KINDS, 'incCentres' => $centres];
}

/** admin.summer.incident.save — log one. A Safeguarding one becomes a case. */
function admin_summer_incident_save(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $ed = ss3_edition(trim((string)($p['editionId'] ?? '')));
    if (!$ed) return ['ok' => false, 'error' => 'no_edition'];
    $kind = (string)($p['kind'] ?? '');
    if (!in_array($kind, SS3_INC_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind', 'detail' => 'Choose what kind of incident it was.'];
    $sev = in_array((string)($p['sev'] ?? ''), SS3_INC_SEV, true) ? (string)$p['sev'] : 'low';
    $note = trim(mb_substr((string)($p['note'] ?? ''), 0, 4000));
    if (mb_strlen($note) < 5) return ['ok' => false, 'error' => 'note_required', 'detail' => 'Say what happened and what you did.'];
    $who = trim(mb_substr((string)($p['child'] ?? ''), 0, 160));
    if ($who === '') return ['ok' => false, 'error' => 'child_required', 'detail' => 'Add the child’s name.'];
    // The child, from the edition and the requester's centres: by printed ID, or a name that matches one child.
    $args = [(string)$ed['cohortId'], strtoupper($who), mb_strtolower($who)];
    $scope = ss3_scope_sql(admin_centre_names_in_scope($req), 'centre', $args);
    $hits = db_all("SELECT studentId, fullName, centre, displayId FROM summer_students WHERE cohortId = ? AND (UPPER(displayId) = ? OR LOWER(fullName) = ?)$scope LIMIT 3", $args);
    if (count($hits) > 1) return ['ok' => false, 'error' => 'ambiguous', 'detail' => 'More than one child is called that. Use their printed ID: '
        . implode(', ', array_map(static fn($h) => (string)$h['displayId'], $hits)) . '.'];
    $s = $hits[0] ?? null;
    $centre = $s ? (string)$s['centre'] : trim((string)($p['centre'] ?? ''));
    if ($centre === '' || !admin_centre_allowed($req, $centre)) return ['ok' => false, 'error' => 'out_of_scope', 'detail' => 'Choose one of your centres.'];
    $id = 'IN-' . strtoupper(rand_hex(4));
    $base = ['incidentId' => $id, 'cohortId' => (string)$ed['cohortId'], 'centre' => $centre, 'kind' => $kind,
             'byId' => (string)$req['memberId'], 'byName' => (string)($req['fullName'] ?? ''), 'status' => 'open', 'createdAt' => now_iso()];
    if ($kind === SS3_INC_SAFE) {
        $case = sg_case_open($req, null, $s ? (string)$s['fullName'] : $who, $centre, 'Something else',
            'Summer School incident at ' . $centre . ' (' . (string)$ed['name'] . "):\n" . $note, (string)($p['ip'] ?? ''));
        if (empty($case['ok'])) return $case;
        db_insert('summer_incidents', $base + ['severity' => 'high', 'studentId' => '', 'childName' => '',
            'note' => 'Sent to the safeguarding lead as case ' . $case['caseNo'] . '. The details are visible to them only.']);
        audit('summer.incident', (string)$req['memberId'], $id, ['kind' => $kind, 'case' => $case['caseNo']], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'incidentId' => $id, 'caseNo' => $case['caseNo'], 'officerName' => $case['officerName'], 'restricted' => true];
    }
    db_insert('summer_incidents', $base + ['severity' => $sev, 'studentId' => $s ? (string)$s['studentId'] : '',
        'childName' => $s ? (string)$s['fullName'] : $who, 'note' => $note]);
    audit('summer.incident', (string)$req['memberId'], $id, ['kind' => $kind, 'severity' => $sev], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'incidentId' => $id, 'linked' => (bool)$s, 'childName' => $s ? (string)$s['fullName'] : $who];
}

/** One incident the requester may act on, or a refusal. */
function ss3_incident_own(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $x = db_row('SELECT * FROM summer_incidents WHERE incidentId = ? LIMIT 1', [trim((string)($p['incidentId'] ?? ''))]);
    if (!$x || !admin_centre_allowed($g['requester'], (string)$x['centre'])) return ['ok' => false, 'error' => 'not_found'];
    return ['ok' => true, 'x' => $x, 'req' => $g['requester']];
}

/**
 * admin.summer.incident.tell — email and text the guardian that something
 * happened, and record what actually went. The message names the kind and asks
 * them to talk to the coordinator; it never carries the staff note, which may
 * name other children.
 */
function admin_summer_incident_tell(array $p): array {
    $o = ss3_incident_own($p); if (!$o['ok']) return $o;
    $x = $o['x'];
    if ((string)$x['kind'] === SS3_INC_SAFE) return ['ok' => false, 'error' => 'lead_decides', 'detail' => 'The safeguarding lead decides who is told, and when.'];
    if ((string)$x['toldAt'] !== '') return ['ok' => true, 'already' => true, 'toldAt' => (string)$x['toldAt']];
    $s = (string)$x['studentId'] !== '' ? db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [(string)$x['studentId']]) : null;
    if (!$s) return ['ok' => false, 'error' => 'no_child', 'detail' => 'This incident isn’t linked to a child on the roster, so there is no guardian to tell.'];
    $first = explode(' ', trim((string)$s['fullName']))[0] ?: 'your child';
    $what = mb_strtolower((string)$x['kind']);
    $text = 'Hello ' . (trim((string)$s['guardianName']) ?: 'there') . ', this is NGG Summer School at ' . $x['centre'] . '. ' . $first
          . ' had a ' . $what . ' incident today and has been looked after. Please speak to the coordinator at pick-up, or reply to this message.';
    $went = [];
    $email = trim((string)($s['parentEmail'] ?? ''));
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $ok = @send_mail($email, 'About ' . $first . ' at Summer School today', email_template(['title' => 'About ' . $first . ' today', 'intro' => $text]));
        if ($ok) $went[] = 'email';
    }
    $phone = trim((string)($s['guardianPhone'] ?? ''));
    if ($phone !== '' && function_exists('sms_send')) { $r = sms_send($phone, $text); if (!empty($r['ok'])) $went[] = 'sms'; }
    if (!$went) return ['ok' => false, 'error' => 'not_delivered', 'detail' => 'No email or text reached the guardian' . ($phone !== '' ? ' — call them on ' . $phone : '') . '.'];
    db_update('summer_incidents', ['toldAt' => now_iso(), 'toldBy' => (string)($o['req']['fullName'] ?? '') . ' · ' . implode(' + ', $went)], ['incidentId' => (string)$x['incidentId']]);
    audit('summer.incident.told', (string)$o['req']['memberId'], (string)$x['incidentId'], ['channels' => $went], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'channels' => $went];
}

/** admin.summer.incident.close — done with. A safeguarding one is closed by its case, not here. */
function admin_summer_incident_close(array $p): array {
    $o = ss3_incident_own($p); if (!$o['ok']) return $o;
    $x = $o['x'];
    if ((string)$x['kind'] === SS3_INC_SAFE) return ['ok' => false, 'error' => 'lead_decides', 'detail' => 'The safeguarding lead closes this when the case is resolved.'];
    if ((string)$x['status'] === 'closed') return ['ok' => true, 'unchanged' => true];
    db_update('summer_incidents', ['status' => 'closed', 'closedAt' => now_iso()], ['incidentId' => (string)$x['incidentId']]);
    audit('summer.incident.close', (string)$o['req']['memberId'], (string)$x['incidentId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/* ── Messages ─────────────────────────────────────────────────────────────── */

/** Who a template reaches: one row per child with a guardian contact, from the scoped roster. */
function ss3_msg_audience(array $roster, string $aud): array {
    $view = ['absent' => 'absent', 'stopped' => 'stopped', 'risk' => 'risk', 'all' => 'all', 'unverified' => 'unverified'][$aud] ?? 'absent';
    return array_values(array_filter($roster, static function ($r) use ($view) {
        if ($view === 'all') return $r['status'] === 'active';
        return ss3_in_view($r, $view);
    }));
}

function ss3_msg_fill(string $tpl, array $r, string $details): string {
    $rules = ss3_rules();
    return strtr($tpl, ['{guardian}' => trim((string)$r['guardian']) ?: 'there', '{child}' => explode(' ', trim((string)$r['name']))[0] ?: 'your child',
        '{centre}' => (string)$r['centre'] ?: 'Summer School', '{time}' => (string)$rules['closeStudent'], '{details}' => $details]);
}

/** part=messages: templates, audiences with their counts, a preview family, and what was sent. */
function ss3_view_messages(array $roster, array $ed): array {
    $aud = [];
    foreach (SS3_MSG_AUDIENCES as $k => $l) $aud[] = ['id' => $k, 'label' => $k === 'risk' ? 'Guardians of children under ' . SS3_RISK_RATE . '%' : $l, 'n' => count(ss3_msg_audience($roster, $k))];
    $tpl = [];
    $close = (string)ss3_rules()['closeStudent'];
    foreach (SS3_MSG_TEMPLATES as $k => [$t, $b]) {
        if (str_contains($b, '{time}') && $close === '') continue;   // no sign-out time set: nothing true to put there
        $tpl[] = ['id' => $k, 'title' => $t, 'body' => $b, 'needsDetails' => str_contains($b, '{details}')];
    }
    $sent = db_all('SELECT * FROM summer_messages WHERE cohortId = ? ORDER BY id DESC LIMIT 20', [(string)$ed['cohortId']]);
    return ['templates' => $tpl, 'audiences' => $aud, 'smsOn' => function_exists('sms_enabled') && sms_enabled(), 'msgMax' => SS3_MSG_MAX,
            'rules' => ss3_rules(), 'sent' => array_map(static fn($m) => ['id' => (string)$m['messageId'], 'title' => (string)$m['title'], 'audience' => (string)$m['audience'],
                'channel' => (string)$m['channel'], 'recipients' => (int)$m['recipients'], 'delivered' => (int)$m['delivered'], 'failed' => (int)$m['failed'],
                'by' => (string)$m['byName'], 'at' => (string)$m['createdAt']], $sent)];
}

/**
 * admin.summer.message.send — one template to one audience on one channel.
 * Validated whole before anything is parked; parked for its undo window; on
 * commit each family gets its own filled-in message and the run is recorded as
 * one row and one audit event, with what was delivered and what failed.
 */
function admin_summer_message_send(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $ed = ss3_edition(trim((string)($p['editionId'] ?? '')));
    if (!$ed) return ['ok' => false, 'error' => 'no_edition'];
    $tk = (string)($p['template'] ?? '');
    if (!isset(SS3_MSG_TEMPLATES[$tk])) return ['ok' => false, 'error' => 'bad_template'];
    [$title, $body] = SS3_MSG_TEMPLATES[$tk];
    $aud = (string)($p['audience'] ?? '');
    if (!isset(SS3_MSG_AUDIENCES[$aud])) return ['ok' => false, 'error' => 'bad_audience'];
    $ch = in_array((string)($p['channel'] ?? ''), SS3_MSG_CHANNELS, true) ? (string)$p['channel'] : 'email';
    $smsOn = function_exists('sms_enabled') && sms_enabled();
    if ($ch !== 'email' && !$smsOn) return ['ok' => false, 'error' => 'sms_off', 'detail' => 'Text messages aren’t set up. Send by email, or set up SMS in Control Room → Settings.'];
    $details = trim(mb_substr((string)($p['details'] ?? ''), 0, 200));
    if (str_contains($body, '{details}') && mb_strlen($details) < 3) return ['ok' => false, 'error' => 'details_required', 'detail' => 'Say what the change is.'];
    if (str_contains($body, '{time}') && (string)ss3_rules()['closeStudent'] === '') return ['ok' => false, 'error' => 'no_pickup_time', 'detail' => 'No sign-out time is set in Control Room → Settings → Attendance.'];
    $today = attendance_today();
    $roster = ss3_roster($req, $ed, $today, ss3_days($ed, $today));
    $to = ss3_msg_audience($roster, $aud);
    if (!$to) return ['ok' => false, 'error' => 'nobody', 'detail' => 'Nobody is in that group right now.'];
    if (count($to) > SS3_MSG_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => SS3_MSG_MAX, 'detail' => 'At most ' . SS3_MSG_MAX . ' families in one send; narrow the group.'];
    if ($d = pending_defer('admin.summer.message.send', $p + ['editionId' => (string)$ed['cohortId']], 'Message ' . count($to) . ' guardians', count($to))) return $d;
    $delivered = 0; $failed = 0; $skipped = 0;
    foreach ($to as $r) {
        $text = ss3_msg_fill($body, $r, $details);
        $any = false; $tried = false;
        if ($ch !== 'sms' && $r['email'] !== '' && filter_var($r['email'], FILTER_VALIDATE_EMAIL)) {
            $tried = true;
            if (@send_mail($r['email'], $title, email_template(['title' => $title, 'intro' => $text]))) $any = true;
        }
        if ($ch !== 'email' && $r['phone'] !== '') { $tried = true; $x = sms_send($r['phone'], $text); if (!empty($x['ok'])) $any = true; }
        if (!$tried) $skipped++; elseif ($any) $delivered++; else $failed++;
    }
    $id = 'SM-' . strtoupper(rand_hex(5));
    db_insert('summer_messages', ['messageId' => $id, 'cohortId' => (string)$ed['cohortId'], 'template' => $tk, 'title' => $title, 'body' => $body,
        'audience' => $aud, 'channel' => $ch, 'recipients' => count($to), 'delivered' => $delivered, 'failed' => $failed + $skipped,
        'byId' => (string)$req['memberId'], 'byName' => (string)($req['fullName'] ?? ''), 'createdAt' => now_iso()]);
    audit('summer.message.send', (string)$req['memberId'], $id, ['template' => $tk, 'audience' => $aud, 'channel' => $ch,
        'recipients' => count($to), 'delivered' => $delivered, 'failed' => $failed, 'noContact' => $skipped], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'messageId' => $id, 'recipients' => count($to), 'delivered' => $delivered, 'failed' => $failed, 'noContact' => $skipped];
}
