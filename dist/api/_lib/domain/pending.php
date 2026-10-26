<?php
declare(strict_types=1);

/**
 * Deferred commits — the server half of an undo window.
 *
 * A bulk act that reaches people (moving children into NGG, emailing joining
 * invoices, alerting every absent child's guardian) cannot be undone once it
 * has happened: the welcome email is in an inbox. So the op does not happen
 * when it is pressed. It is validated and gated as usual, then parked here
 * with a commit time a few seconds ahead, and the screen shows an undo toast
 * against the returned `pendingId`. Cancelling inside the window deletes
 * nothing because nothing was done; letting it expire commits it.
 *
 * What commits it, on a host with no worker process:
 *   · the client, when its countdown ends (`admin.pending.flush`) — the usual path;
 *   · any later Summer portal read (`pending_commit_due`, a handful at a time);
 *   · the webcron tick, as the backstop for a closed tab.
 * Each claims its row with a conditional UPDATE, so two of them racing commit
 * it once. The commit re-runs the op AS THE REQUESTER through backend_dispatch,
 * so the gate, the scope and the approval queue are all asked again at commit
 * time — a capability removed inside the window is a refusal, not a bypass.
 *
 * The client must never fake this: an undo that only hides a toast while the
 * request has already gone is a lie about what was sent.
 */

/** The longest a caller may hold an act open. The undo toast asks for 8. */
const PENDING_MAX_SECONDS = 30;

/** Only these ops may be deferred — each re-checks its own gate on commit. */
const PENDING_OPS = [
    'admin.club.promote',
    'admin.club.promote.bulk',
    'admin.summer.absence.alert',
    'admin.summer.graduates.invoice',
];

/**
 * Park the call when the caller asked for a window; null to run it now.
 * Call AFTER the op's gate and validation, so a refusal is immediate rather
 * than discovered eight seconds later when nobody is looking.
 */
function pending_defer(string $op, array $p, string $label, int $n = 0): ?array {
    $sec = (int)($p['defer'] ?? 0);
    if ($sec <= 0 || !empty($p['__commit'])) return null;
    if (!in_array($op, PENDING_OPS, true)) return null;
    $sec = min(PENDING_MAX_SECONDS, $sec);
    $args = $p;
    unset($args['defer'], $args['requesterId'], $args['__commit']);
    $id = 'PA-' . strtoupper(rand_hex(6));
    $at = gmdate('Y-m-d\TH:i:s\Z', time() + $sec);
    db_insert('pending_actions', [
        'pendingId' => $id, 'op' => $op, 'args' => json_encode($args, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'requesterId' => (string)($p['requesterId'] ?? ''), 'label' => mb_substr($label, 0, 160), 'n' => max(0, $n),
        'status' => 'pending', 'commitAt' => $at, 'result' => '', 'createdAt' => now_iso(), 'doneAt' => '',
    ]);
    return ['ok' => true, 'deferred' => true, 'pendingId' => $id, 'commitAt' => $at, 'seconds' => $sec, 'n' => $n];
}

/** Run one parked act. Claimed first, so it commits once however many callers race. */
function pending_commit(array $row): array {
    $claimed = db_exec("UPDATE pending_actions SET status = 'running' WHERE pendingId = ? AND status = 'pending'", [(string)$row['pendingId']]);
    if ($claimed !== 1) {
        $now = db_row('SELECT * FROM pending_actions WHERE pendingId = ?', [(string)$row['pendingId']]);
        return pending_result($now ?: $row);
    }
    $args = json_decode((string)$row['args'], true);
    $args = is_array($args) ? $args : [];
    $args['requesterId'] = (string)$row['requesterId'];
    $args['__commit'] = true;
    try {
        $res = backend_dispatch((string)$row['op'], $args);
    } catch (Throwable $e) {
        $res = ['ok' => false, 'error' => 'commit_failed', 'detail' => mb_substr($e->getMessage(), 0, 200)];
    }
    db_update('pending_actions', ['status' => !empty($res['ok']) ? 'committed' : 'failed',
        'result' => json_encode($res, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 'doneAt' => now_iso()],
        ['pendingId' => (string)$row['pendingId']]);
    return ['ok' => true, 'status' => !empty($res['ok']) ? 'committed' : 'failed', 'result' => $res];
}

function pending_result(array $row): array {
    $r = json_decode((string)($row['result'] ?? ''), true);
    return ['ok' => true, 'status' => (string)$row['status'], 'commitAt' => (string)$row['commitAt'], 'result' => is_array($r) ? $r : null];
}

/** Commit what is due. Bounded, so a read that sweeps never becomes slow. */
function pending_commit_due(int $limit = 20): int {
    $rows = db_all("SELECT * FROM pending_actions WHERE status = 'pending' AND commitAt <= ? ORDER BY id LIMIT " . max(1, min(200, $limit)), [now_iso()]);
    foreach ($rows as $r) pending_commit($r);
    return count($rows);
}

/** The requester's own row, or a refusal. Nobody cancels another person's act. */
function pending_own(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM pending_actions WHERE pendingId = ? LIMIT 1', [trim((string)($p['pendingId'] ?? ''))]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$row['requesterId'] !== (string)$g['requester']['memberId']) return ['ok' => false, 'error' => 'not_yours'];
    return ['ok' => true, 'row' => $row, 'requester' => $g['requester']];
}

/** admin.pending.cancel — undo inside the window. Nothing was done, so nothing is reversed. */
function admin_pending_cancel(array $p): array {
    $o = pending_own($p); if (!$o['ok']) return $o;
    $n = db_exec("UPDATE pending_actions SET status = 'cancelled', doneAt = ? WHERE pendingId = ? AND status = 'pending'", [now_iso(), (string)$o['row']['pendingId']]);
    if ($n !== 1) {
        $now = db_row('SELECT status FROM pending_actions WHERE pendingId = ?', [(string)$o['row']['pendingId']]);
        $st = (string)($now['status'] ?? '');
        if ($st === 'cancelled') return ['ok' => true, 'cancelled' => true];
        return ['ok' => false, 'error' => 'too_late', 'status' => $st, 'detail' => 'That has already been done, so it cannot be undone from here.'];
    }
    audit('pending.cancel', (string)$o['requester']['memberId'], (string)$o['row']['pendingId'], ['op' => (string)$o['row']['op'], 'n' => (int)$o['row']['n']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'cancelled' => true];
}

/** admin.pending.flush — the toast ran out: commit now and say what happened. */
function admin_pending_flush(array $p): array {
    $o = pending_own($p); if (!$o['ok']) return $o;
    $row = $o['row'];
    if ((string)$row['status'] !== 'pending') return pending_result($row);
    // A second of slack for the client's clock running ahead of ours.
    if (strtotime((string)$row['commitAt']) > time() + 1) return ['ok' => false, 'error' => 'not_due', 'commitAt' => (string)$row['commitAt']];
    return pending_commit($row);
}
