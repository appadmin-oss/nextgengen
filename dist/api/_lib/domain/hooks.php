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
 * Each event: { ref | token, date?, kind? } where
 *   ref   = summer studentId (SUM-…), member memberId (NGG-…) or handle
 *   token = an assigned QR token (SUMQR-…)
 *   date  = Y-m-d (defaults to today, UTC)
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
        $date = (string)($e['date'] ?? gmdate('Y-m-d'));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) { $results[] = ['ref' => $ref, 'status' => 'bad_date']; continue; }

        // Resolve who this is: QR token → summer student → member → handle.
        $student = null; $cohortId = ''; $name = ''; $sid = '';
        if ($token !== '') {
            $qr = db_row("SELECT studentId FROM qr_codes WHERE token = ? AND studentId != '' LIMIT 1", [$token]);
            if ($qr) $student = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$qr['studentId']]);
        } elseif ($ref !== '') {
            $student = db_row('SELECT * FROM summer_students WHERE studentId = ? OR handle = ? LIMIT 1', [$ref, strtolower($ref)]);
            if (!$student) {
                $m = db_row('SELECT memberId, fullName FROM members WHERE memberId = ? LIMIT 1', [$ref]);
                if ($m) { $sid = (string)$m['memberId']; $name = (string)$m['fullName']; }
            }
        }
        if ($student) { $sid = (string)$student['studentId']; $cohortId = (string)$student['cohortId']; $name = (string)$student['fullName']; }
        if ($sid === '') { $results[] = ['ref' => $ref ?: $token, 'status' => 'unknown']; $unknown++; continue; }

        $dupe = db_row('SELECT id FROM attendance WHERE studentId = ? AND date = ?', [$sid, $date]);
        if ($dupe) { $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'already']; $already++; continue; }
        db_insert('attendance', [
            'cohortId' => $cohortId, 'studentId' => $sid, 'token' => $token,
            'date' => $date, 'checkInAt' => now_iso(), 'method' => 'webhook',
            'byId' => 'hook:' . $source, 'device' => substr($source, 0, 64), 'createdAt' => now_iso(),
        ]);
        event_emit('attendance.marked', ['memberId' => $sid, 'name' => $name, 'date' => $date, 'source' => 'webhook:' . $source]);
        $results[] = ['ref' => $sid, 'date' => $date, 'status' => 'marked'];
        $marked++;
    }
    audit('hook.attendance', null, $source, ['marked' => $marked, 'already' => $already, 'unknown' => $unknown], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'marked' => $marked, 'already' => $already, 'unknown' => $unknown, 'results' => $results];
}
