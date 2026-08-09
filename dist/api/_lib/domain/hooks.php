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
        if ($date === '') $date = $hasScanTime ? attendance_today($scanTs) : gmdate('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { $results[] = ['ref' => $ref, 'status' => 'bad_date']; continue; }

        // Resolve who this is: QR token → summer student → member → handle.
        $student = null; $cohortId = ''; $name = ''; $sid = ''; $isMember = false;
        if ($token !== '') {
            $qr = db_row("SELECT studentId FROM qr_codes WHERE token = ? AND studentId != '' LIMIT 1", [$token]);
            if ($qr) $student = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$qr['studentId']]);
        } elseif ($ref !== '') {
            $student = db_row('SELECT * FROM summer_students WHERE studentId = ? OR handle = ? LIMIT 1', [$ref, strtolower($ref)]);
            if (!$student) {
                $m = db_row('SELECT memberId, fullName, type FROM members WHERE memberId = ? LIMIT 1', [$ref]);
                if ($m) { $sid = (string)$m['memberId']; $name = (string)$m['fullName']; $isMember = ((string)$m['type'] === 'NGG'); }
            }
        }
        if ($student) { $sid = (string)$student['studentId']; $cohortId = (string)$student['cohortId']; $name = (string)$student['fullName']; }
        if ($sid === '') { $results[] = ['ref' => $ref ?: $token, 'status' => 'unknown']; $unknown++; continue; }

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
            && policy_is_day($date, 'member')
            && ($hasScanTime || $date === gmdate('Y-m-d'));
        $punc = $applyMember ? policy_punctuality('member', $hasScanTime ? $scanTs : null) : null;
        try {
            $row = [
                'cohortId' => $cohortId, 'studentId' => $sid, 'token' => $token,
                'date' => $date, 'checkInAt' => $scanIso, 'method' => 'webhook',
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
        $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'marked'];
        $marked++;
    }
    audit('hook.attendance', null, $source, ['marked' => $marked, 'already' => $already, 'unknown' => $unknown], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'marked' => $marked, 'already' => $already, 'unknown' => $unknown, 'results' => $results];
}
