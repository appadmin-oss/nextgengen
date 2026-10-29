<?php
declare(strict_types=1);

/**
 * Inbound webhooks — external systems pushing data IN. Counterpart of the
 * outbound bus. Signature helper is here (route uses it; tests exercise it
 * directly). Everything is batch-shaped and idempotent.
 */

/** Constant-time verification of our standard signed-request scheme. */
function hook_verify_signature(string $secret, string $ts, string $rawBody, string $sigHeader, int $windowSec = 300): bool {
    if ($secret === '' || $ts === '' || !ctype_digit($ts)) return false;
    if (abs(time() - (int)$ts) > $windowSec) return false;
    $expect = 'sha256=' . hash_hmac('sha256', $ts . '.' . $rawBody, $secret);
    return hash_equals($expect, $sigHeader);
}

/**
 * Process a batch of attendance events from an external app.
 * Each event: { ref | token, date?, scannedAt?, kind? } where
 *   ref       = summer studentId (SUM-…), member memberId (NGG-…) or handle
 *   token     = an assigned QR token (SUMQR-…)
 *   scannedAt = the real scan time, ISO-8601. Optional but preferred: it is
 *               what member lateness is judged against and what stamps
 *               checkInAt. Clamped to the last 24h (attendance_scan_time), so a
 *               wrong clock cannot backdate a scan. `at` is accepted as an alias.
 *   date      = Y-m-d. Defaults to the scan's own local day when scannedAt is
 *               given, else today.
 * Returns a per-item result list; duplicates are 'already', not errors.
 */
function hooks_attendance(array $p): array {
    $events = is_array($p['events'] ?? null) ? array_slice($p['events'], 0, 200) : [];
    if (!$events) return ['ok' => false, 'error' => 'no_events'];
    $source = (string)($p['source'] ?? 'external');
    $results = []; $marked = 0; $already = 0; $unknown = 0;

    foreach ($events as $e) {
        if (!is_array($e)) { $results[] = ['status' => 'bad_event']; continue; }
        $ref = trim((string)($e['ref'] ?? ''));
        $token = trim((string)($e['token'] ?? ''));
        // Real scan time, if the caller sends one. attendance_scan_time() parses
        // and clamps it to the last 24h (never future), falling back to now. We
        // separately record whether a genuine, in-window time was supplied —
        // only then do we judge lateness at the scan rather than at delivery.
        $rawScan = $e['scannedAt'] ?? $e['at'] ?? null;
        $hasScanTime = is_string($rawScan) && $rawScan !== ''
            && ($ts0 = strtotime($rawScan)) !== false && $ts0 <= time() && $ts0 >= time() - 86400;
        $scanTs  = attendance_scan_time(is_string($rawScan) ? $rawScan : null);
        $scanIso = gmdate('Y-m-d\TH:i:s\Z', $scanTs);
        $date = trim((string)($e['date'] ?? ''));
        // Local date, not UTC: a punch at 00:30 in Lagos belongs to today.
        if ($date === '') $date = $hasScanTime ? attendance_today($scanTs) : attendance_today();
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { $results[] = ['ref' => $ref, 'status' => 'bad_date']; continue; }

        // Resolve who this is: QR token → summer student → member → handle.
        $student = null; $cohortId = ''; $name = ''; $sid = ''; $isMember = false;
        /* Volunteers too: a volunteer's card and id are in the same key space as
           a student's, and a hook that only looked up students answered
           "unknown" for every volunteer an app or the CACENTRE gate reported. */
        $volunteer = null;
        if ($token !== '') {
            $qr = db_row("SELECT studentId FROM qr_codes WHERE token = ? AND studentId != '' LIMIT 1", [$token]);
            if ($qr) $student = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$qr['studentId']]);
            if ($qr && !$student) $volunteer = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$qr['studentId']]);
        } elseif ($ref !== '') {
            $student = db_row('SELECT * FROM summer_students WHERE studentId = ? OR handle = ? LIMIT 1', [$ref, strtolower($ref)]);
            if (!$student) $volunteer = db_row("SELECT * FROM volunteers WHERE volunteerId = ? AND status = 'active' LIMIT 1", [$ref]);
            if (!$student && !$volunteer) {
                // A merged-away id checks in its survivor, not the retired record.
                $m = member_follow_merge(db_row('SELECT memberId, fullName, type, status FROM members WHERE memberId = ? LIMIT 1', [$ref]));
                if ($m) { $sid = (string)$m['memberId']; $name = (string)$m['fullName']; $isMember = ((string)$m['type'] === 'NGG'); }
            }
        }
        if ($volunteer) { $sid = (string)$volunteer['volunteerId']; $name = (string)$volunteer['fullName']; }
        if ($student) { $sid = (string)$student['studentId']; $cohortId = (string)$student['cohortId']; $name = (string)$student['fullName']; }
        if ($sid === '') { $results[] = ['ref' => $ref ?: $token, 'status' => 'unknown']; $unknown++; continue; }

        /* A check-out, from the CACENTRE gate (or any sender that says so).
         * Stamped on the day's row and nothing else: it never creates one,
         * because a departure is not an arrival. Without these, a policy with
         * checkoutRequired logs everybody who came in through the gate as
         * "checked in but never scanned out" and counts them absent.
         * not_checked_in is answered rather than swallowed: the arrival may
         * still be in flight, and the sender retries. */
        if (strtolower((string)($e['action'] ?? 'in')) === 'out') {
            /* A departure re-sent days later (the gate's back-fill) keeps its
               own time when that time falls on the day it names: clamped to
               "now" like an arrival, it would read as leaving today. Only for
               a day that already has an arrival, and at most 45 days back. */
            if (is_string($rawScan) && ($ts1 = strtotime($rawScan)) !== false && $ts1 <= time() && $ts1 >= time() - 45 * 86400 && attendance_today($ts1) === $date) {
                $scanTs = $ts1; $scanIso = gmdate('Y-m-d\TH:i:s\Z', $scanTs);
            }
            $row = db_row('SELECT id, checkOutAt FROM attendance WHERE studentId = ? AND date = ?', [$sid, $date]);
            if (!$row) { $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'not_checked_in']; continue; }
            /* A LATER departure moves it: at a CACENTRE terminal the check-out
               is the last punch of the day, and the gate re-sends it as it moves. */
            if (!empty($row['checkOutAt']) && strtotime($scanIso) <= strtotime((string)$row['checkOutAt'])) { $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'already']; $already++; continue; }
            /* Before closing time a punch is not a sign-out (see
               attendance_close_time). Answered, not stored — the terminal
               re-sends the day's last punch, so a later one still lands. */
            $outType = $isMember ? 'member' : ($volunteer ? 'volunteer' : 'student');
            if ($no = attendance_checkout_refusal($outType, $scanTs, ['gateAuthorized' => true])) {
                $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'too_early', 'closesAt' => $no['closesAt']]; continue;
            }
            db_update('attendance', ['checkOutAt' => $scanIso], ['id' => $row['id']]);
            if (empty($row['checkOutAt'])) policy_checkout_landed($sid, $outType, $date, 'hook:' . $source);
            if ($isMember && empty($row['checkOutAt']) && $date === attendance_today() && ($mrow = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$sid]))) {
                checkin_member_email($mrow, 'out', $scanTs, ['checkInAt' => (string)(db_row('SELECT checkInAt FROM attendance WHERE id = ?', [$row['id']])['checkInAt'] ?? '')]);
            }
            $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'marked', 'action' => 'out'];
            $marked++;
            continue;
        }

        $dupe = db_row('SELECT id FROM attendance WHERE studentId = ? AND date = ?', [$sid, $date]);
        if ($dupe) { $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'already']; $already++; continue; }
        /* NGG members are enforced on their own switch and their own weekly
         * calendar. On a member programme day, grade punctuality so the row
         * carries the same late/half-day facts a gate scan would and feed the
         * check-in to the sanction engine. With a real scannedAt we judge
         * lateness AT THE SCAN, on the scan's own day; without one we fall back
         * to delivery time, and only for today — a past day whose scan time we
         * do not know is recorded as present but not graded for lateness. */
        $applyMember = $isMember
            && function_exists('policy_enabled_for') && policy_enabled_for('member')
            && policy_is_day_for($sid, $date, 'member')
            && ($hasScanTime || $date === attendance_today());
        $punc = $applyMember ? policy_punctuality('member', $hasScanTime ? $scanTs : null) : null;
        try {
            $row = [
                'cohortId' => $cohortId, 'studentId' => $sid, 'token' => $token,
                'date' => $date, 'checkInAt' => $scanIso, 'method' => 'webhook', 'centre' => hooks_event_centre($e),
                'byId' => 'hook:' . $source, 'device' => substr($source, 0, 64), 'createdAt' => now_iso(),
            ];
            if ($punc) {
                $row['status'] = $punc['status'];
                $row['lateMinutes'] = (int)$punc['lateMinutes'];
                $row['redline'] = (int)$punc['redline'];
                $row['halfDay'] = (int)$punc['halfDay'];
            }
            db_insert('attendance', $row);
        } catch (\Throwable $ex) {
            // Concurrent duplicate delivery raced past the SELECT and hit the
            // UNIQUE(studentId,date) guard — honour the documented idempotency.
            $isDup = (string)$ex->getCode() === '23000' || stripos($ex->getMessage(), 'unique') !== false || stripos($ex->getMessage(), 'duplicate') !== false;
            if (!$isDup) throw $ex;
            $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'already']; $already++; continue;
        }
        if ($applyMember) policy_on_checkin($sid, 'member', $date, $punc);
        event_emit('attendance.marked', ['memberId' => $sid, 'name' => $name, 'date' => $date, 'source' => 'webhook:' . $source]);
        if ($isMember && $date === attendance_today($scanTs) && ($mrow = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$sid]))) {
            checkin_member_email($mrow, 'in', $scanTs, $punc ?: []);
        }
        $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'marked'];
        $marked++;
    }
    audit('hook.attendance', null, $source, ['marked' => $marked, 'already' => $already, 'unknown' => $unknown], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'marked' => $marked, 'already' => $already, 'unknown' => $unknown, 'results' => $results];
}

/* ══ The CACENTRE gate ══════════════════════════════════════════════════════
 *
 * CACENTRE's front door is a gate (a Cloudflare Worker) that checks NGG cards
 * with NGG rather than keeping a copy of NGG's people. These two ops are what
 * it asks, over api/hooks/gate.php, signed exactly like the attendance hook
 * and with the same secret. The check-ins themselves come back through
 * hooks.attendance, by ref.
 *
 * The gate is told the least that lets a desk say who is at the door and
 * whether they may come in: a reference, the name, what they are, and — if
 * they may not — why in words. No guardian, no phone, no photo.
 */

/**
 * NGG's own rule for when this person is late today, for the gate to judge
 * the scan by — so the desk says what NGG will record, not what the
 * location's hours would say. null: NGG marks no lateness for them today
 * (attendance off, NGG's member policy off, or not one of their programme
 * days), and the desk shows them in, on time.
 *
 * @return array{resumption:string,grace_minutes:int}|null
 */
function gate_person_punctuality(string $type, string $personId): ?array {
    $cfg = attendance_settings();
    if (empty($cfg['enabled'])) return null;
    if ($type === 'member' && !policy_enabled_for('member')) return null;
    if (!policy_is_day_for($personId, attendance_today(), $type)) return null;
    $byType = (array)$cfg['resumptionByType'];
    $hhmm = (string)($byType[$type] ?? $byType['default'] ?? '09:00');
    [$h, $m] = array_pad(array_map('intval', explode(':', $hhmm)), 2, 0);
    return ['resumption' => sprintf('%02d:%02d', $h, $m), 'grace_minutes' => (int)$cfg['graceMinutes']];
}

/** CACENTRE's locations, passed on by the gate: NGG's centres follow them (domain/cac-locations.php). */
function hooks_gate_locations(array $p): array {
    return cac_locations_sync($p);
}

/** The NGG centre a gate check-in was at: by the location's id when NGG has it, else the name the gate sent. */
function hooks_event_centre(array $e): string {
    $loc = (string)($e['location'] ?? '');
    if ($loc !== '' && ($c = db_row('SELECT name FROM centres WHERE cacLocationId = ? LIMIT 1', [$loc]))) return (string)$c['name'];
    return mb_substr(trim((string)($e['centre'] ?? '')), 0, 80);
}

/** What the gate is told about a summer student. */
function gate_person_student(array $s, ?array $qr = null): array {
    $status = 'active';
    if ((string)($s['status'] ?? 'active') !== 'active') $status = 'marked ' . (string)$s['status'];
    elseif (function_exists('policy_gate_checkin')) {
        $g = policy_gate_checkin((string)$s['studentId'], 'student');
        if (empty($g['ok'])) $status = $g['error'] === 'policy_evicted' ? 'evicted under the programme policy' : 'suspended under the programme policy';
    }
    $detail = trim(implode(' · ', array_filter([(string)($s['track'] ?? ''), (string)($s['centre'] ?? '')])));
    $exp = $qr ? substr((string)($qr['expiresAt'] ?? ''), 0, 10) : '';
    return ['ref' => (string)$s['studentId'], 'name' => (string)$s['fullName'], 'kind' => 'student',
            'status' => $status, 'detail' => $detail ?: 'Summer School', 'expires_on' => $exp !== '' ? $exp : null,
            'punctuality' => gate_person_punctuality('student', (string)$s['studentId'])];
}

/** What the gate is told about a volunteer. */
function gate_person_volunteer(array $v, ?array $qr = null): array {
    $status = (string)($v['status'] ?? 'active') === 'active' ? 'active' : 'marked ' . (string)$v['status'];
    $detail = 'Volunteer' . ((string)($v['role'] ?? '') !== '' ? ' · ' . $v['role'] : '')
            . ((string)($v['safeguarding'] ?? '') !== 'cleared' ? ' · safeguarding not yet cleared' : '');
    $exp = $qr ? substr((string)($qr['expiresAt'] ?? ''), 0, 10) : '';
    return ['ref' => (string)$v['volunteerId'], 'name' => (string)$v['fullName'], 'kind' => 'volunteer',
            'status' => $status, 'detail' => $detail, 'expires_on' => $exp !== '' ? $exp : null,
            'punctuality' => gate_person_punctuality('volunteer', (string)$v['volunteerId'])];
}

/** What the gate is told about an NGG member. $how: how the card was read. */
function gate_person_member(array $m, string $how = ''): array {
    $s = strtolower((string)($m['status'] ?? 'active'));
    $status = $s === 'active' ? 'active' : 'marked ' . ($s ?: 'inactive');
    if ($status === 'active' && function_exists('policy_gate_checkin')) {
        $g = policy_gate_checkin((string)$m['memberId'], 'member');
        if (empty($g['ok'])) $status = ($g['error'] ?? '') === 'policy_evicted' ? 'evicted under the programme policy' : 'suspended under the programme policy';
    }
    $detail = trim(implode(' · ', array_filter([
        'NGG member' . ((string)($m['displayId'] ?? '') !== '' ? ' ' . $m['displayId'] : ''),
        (string)($m['track'] ?? ''), (string)($m['centre'] ?? ''),
        /* An old printed card is a number anybody could write down; the desk
           says so, so somebody glances at the face. */
        $how === 'printed' ? 'old printed card' : '',
    ])));
    return ['ref' => (string)$m['memberId'], 'name' => (string)$m['fullName'], 'kind' => 'member',
            'status' => $status, 'detail' => $detail, 'expires_on' => null,
            'punctuality' => gate_person_punctuality('member', (string)$m['memberId'])];
}

/** A card token or a reference, to the person the gate may show. */
function hooks_gate_resolve(array $p): array {
    $token = strtoupper(trim((string)($p['token'] ?? '')));
    $ref = trim((string)($p['ref'] ?? ''));
    $format = trim((string)($p['format'] ?? ''));
    /* A member's card: secure (MEMQR-), or an older printed one the gate
       decoded by one of NGG's formats. */
    if (strpos($token, 'MEMQR-') === 0 || $format !== '') {
        $hit = $format !== '' ? member_card_lookup(null, $format, (string)($p['value'] ?? '')) : member_card_lookup($token);
        if (!$hit) return ['ok' => false, 'code' => 'unknown', 'error' => $format !== ''
            ? 'NGG has no member with card ' . strtoupper(trim((string)($p['value'] ?? ''))) . '.' : 'NGG does not know card ' . $token . '.'];
        if ($hit['void']) return ['ok' => false, 'code' => 'void_card', 'error' => 'This NGG card has been replaced. Ask for the new one, or search the name.'];
        return ['ok' => true, 'person' => gate_person_member($hit['member'], $hit['kind'])];
    }
    if ($token !== '') {
        $qr = db_row('SELECT * FROM qr_codes WHERE token = ? LIMIT 1', [$token]);
        if (!$qr) {
            /* A volunteer's card lives on the volunteer row in older data. */
            $v = db_row('SELECT * FROM volunteers WHERE token = ? LIMIT 1', [$token]);
            return $v ? ['ok' => true, 'person' => gate_person_volunteer($v)]
                      : ['ok' => false, 'code' => 'unknown', 'error' => 'NGG does not know card ' . $token . '.'];
        }
        if ((string)$qr['status'] === 'void') return ['ok' => false, 'code' => 'void_card', 'error' => 'This NGG card has been retired. Search the name instead.'];
        if ((string)($qr['studentId'] ?? '') === '') return ['ok' => false, 'code' => 'blank_card', 'error' => 'This NGG card has not been given to anyone yet.'];
        $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$qr['studentId']]);
        if ($s) return ['ok' => true, 'person' => gate_person_student($s, $qr)];
        $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$qr['studentId']]);
        if ($v) return ['ok' => true, 'person' => gate_person_volunteer($v, $qr)];
        return ['ok' => false, 'code' => 'unknown', 'error' => 'This NGG card’s holder has been removed.'];
    }
    if ($ref !== '') {
        $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$ref]);
        if ($s) return ['ok' => true, 'person' => gate_person_student($s, $s['token'] ? db_row('SELECT * FROM qr_codes WHERE token = ?', [$s['token']]) : null)];
        $v = db_row('SELECT * FROM volunteers WHERE volunteerId = ? LIMIT 1', [$ref]);
        if ($v) return ['ok' => true, 'person' => gate_person_volunteer($v)];
        $m = member_follow_merge(db_row("SELECT * FROM members WHERE memberId = ? AND COALESCE(type,'NGG') <> 'Summer' LIMIT 1", [$ref]));
        if ($m) return ['ok' => true, 'person' => gate_person_member($m)];
        return ['ok' => false, 'code' => 'unknown', 'error' => 'NGG does not know ' . $ref . '.'];
    }
    return ['ok' => false, 'code' => 'bad_request', 'error' => 'A token or a ref is needed.'];
}

/** Find by name, for a child at the door without their card. Active people only; eight at most. */
function hooks_gate_search(array $p): array {
    $q = trim((string)($p['q'] ?? ''));
    if (mb_strlen($q) < 2) return ['ok' => true, 'people' => []];
    $like = '%' . $q . '%';
    $centre = trim((string)($p['centre'] ?? ''));
    $args = [$like];
    $sql = "SELECT * FROM summer_students WHERE status = 'active' AND fullName LIKE ?";
    if ($centre !== '') { $sql .= ' AND (centre = ? OR centre = \'\' OR centre IS NULL)'; $args[] = $centre; }
    $out = [];
    foreach (db_all($sql . ' ORDER BY fullName LIMIT 8', $args) as $s) $out[] = gate_person_student($s);
    foreach (db_all("SELECT * FROM volunteers WHERE status = 'active' AND fullName LIKE ? ORDER BY fullName LIMIT 4", [$like]) as $v) $out[] = gate_person_volunteer($v);
    $margs = [$like];
    $msql = "SELECT * FROM members WHERE status = 'active' AND COALESCE(type,'NGG') <> 'Summer' AND COALESCE(role,'member') = 'member' AND fullName LIKE ?";
    if ($centre !== '') { $msql .= " AND (centre = ? OR centre = '' OR centre IS NULL)"; $margs[] = $centre; }
    foreach (db_all($msql . ' ORDER BY fullName LIMIT 6', $margs) as $m) $out[] = gate_person_member($m);
    return ['ok' => true, 'people' => array_slice($out, 0, 10)];
}
