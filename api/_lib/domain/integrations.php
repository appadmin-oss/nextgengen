<?php
declare(strict_types=1);

/**
 * Integrations admin — configure the bus destinations (Google Chat spaces,
 * signed webhooks, the Apps Script Sheets mirror), test-fire them, and read
 * the delivery log. Gated on the 'settings' capability.
 */

const INTEGRATION_KINDS = ['gchat', 'webhook', 'sheets', 'drive'];

function integration_public(array $r): array {
    $cfg = json_decode((string)$r['config'], true) ?: [];
    $secret = (string)($cfg['secret'] ?? '');
    return [
        'integrationId' => $r['integrationId'], 'kind' => $r['kind'], 'name' => (string)$r['name'],
        'url' => (string)($cfg['url'] ?? ''),
        'hasSecret' => $secret !== '', 'secretHint' => $secret !== '' ? '••••' . substr($secret, -4) : '',
        'events' => json_decode((string)$r['events'], true) ?: [],
        'status' => (string)$r['status'], 'createdAt' => (string)$r['createdAt'],
    ];
}

function admin_integrations_list(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT * FROM integrations ORDER BY id DESC');
    $log = db_all("SELECT d.eventId, d.integrationId, d.status, d.attempts, d.lastError, d.deliveredAt, d.nextAttemptAt, o.kind
                   FROM deliveries d LEFT JOIN outbox o ON o.eventId = d.eventId
                   ORDER BY d.id DESC LIMIT 40");
    // Per-destination delivery health, so an admin can see at a glance whether
    // the mirror is actually receiving events (and why not).
    $health = [];
    foreach ($rows as $r) {
        $id = (string)$r['integrationId'];
        $c = db_row("SELECT
              SUM(status='ok') ok,
              SUM(status IN ('pending','failed')) pending,
              SUM(status='dead') dead,
              MAX(deliveredAt) lastOkAt
            FROM deliveries WHERE integrationId = ?", [$id]);
        $lastErr = db_row("SELECT lastError, nextAttemptAt FROM deliveries WHERE integrationId = ? AND status IN ('failed','dead') AND lastError <> '' ORDER BY id DESC LIMIT 1", [$id]);
        $health[$id] = [
            'ok'        => (int)($c['ok'] ?? 0),
            'pending'   => (int)($c['pending'] ?? 0),
            'dead'      => (int)($c['dead'] ?? 0),
            'lastOkAt'  => (string)($c['lastOkAt'] ?? ''),
            'lastError' => (string)($lastErr['lastError'] ?? ''),
        ];
    }
    return ['ok' => true, 'integrations' => array_map('integration_public', $rows), 'log' => $log, 'health' => $health];
}

/** Requeue stalled deliveries (failed + dead) so a fixed URL/secret can re-push
 *  immediately instead of waiting on backoff. Optionally scoped to one dest. */
function admin_integrations_retry(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $id = trim((string)($p['integrationId'] ?? ''));
    $where = "status IN ('failed','dead')";
    $args = [];
    if ($id !== '') { $where .= ' AND integrationId = ?'; $args[] = $id; }
    $n = db_exec("UPDATE deliveries SET status='pending', attempts=0, nextAttemptAt=? WHERE $where", array_merge([now_iso()], $args));
    audit('integration.retry', (string)$p['requesterId'], $id, ['requeued' => $n], (string)($p['ip'] ?? ''));
    // Flush straight away so the admin sees the result without waiting on cron.
    $res = function_exists('deliveries_dispatch') ? deliveries_dispatch(25) : [];
    return ['ok' => true, 'requeued' => $n, 'dispatch' => $res];
}

function admin_integrations_upsert(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $kind = (string)($d['kind'] ?? '');
    if (!in_array($kind, INTEGRATION_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    $url = trim((string)($d['url'] ?? ''));
    if ($kind === 'gchat' && strpos($url, 'https://chat.googleapis.com/') !== 0) return ['ok' => false, 'error' => 'bad_gchat_url'];
    if ($kind === 'sheets' && strpos($url, 'https://script.google.com/') !== 0) return ['ok' => false, 'error' => 'bad_script_url'];
    if ($kind === 'webhook' && strpos($url, 'https://') !== 0) return ['ok' => false, 'error' => 'bad_url'];
    if ($kind === 'drive' && strpos($url, 'https://') !== 0) return ['ok' => false, 'error' => 'bad_url'];

    $events = is_array($d['events'] ?? null) ? array_values(array_filter(array_map('strval', $d['events']))) : ['*'];
    if (!$events) $events = ['*'];

    $id = (string)($d['integrationId'] ?? '');
    $existing = $id !== '' ? db_row('SELECT * FROM integrations WHERE integrationId = ?', [$id]) : null;
    $prevCfg = $existing ? (json_decode((string)$existing['config'], true) ?: []) : [];
    // Secret: keep the stored one unless a new value is supplied; webhooks
    // without any secret get one generated (delivery signing needs it).
    $secret = (string)($d['secret'] ?? '');
    if ($secret === '') $secret = (string)($prevCfg['secret'] ?? '');
    if ($secret === '' && $kind !== 'gchat') $secret = rand_hex(24);

    $row = [
        'kind' => $kind,
        'name' => substr(trim((string)($d['name'] ?? '')), 0, 160) ?: strtoupper($kind),
        'config' => json_encode(['url' => $url, 'secret' => $secret], JSON_UNESCAPED_SLASHES),
        'events' => json_encode($events, JSON_UNESCAPED_SLASHES),
        'status' => in_array((string)($d['status'] ?? 'active'), ['active', 'paused'], true) ? (string)($d['status'] ?? 'active') : 'active',
        'updatedAt' => now_iso(),
    ];
    if ($existing) {
        db_update('integrations', $row, ['integrationId' => $id]);
    } else {
        $id = 'INT-' . strtoupper(rand_hex(5));
        db_insert('integrations', $row + ['integrationId' => $id, 'createdAt' => now_iso()]);
    }
    audit('integration.upsert', (string)$p['requesterId'], $id, ['kind' => $kind], (string)($p['ip'] ?? ''));
    $saved = db_row('SELECT * FROM integrations WHERE integrationId = ?', [$id]);
    return ['ok' => true, 'integration' => integration_public($saved),
        // One-time reveal on create so the admin can configure the receiver.
        'secret' => $existing ? null : ($kind !== 'gchat' ? $secret : null)];
}

function admin_integrations_delete(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $id = (string)($p['integrationId'] ?? '');
    $n = db_exec('DELETE FROM integrations WHERE integrationId = ?', [$id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('integration.delete', (string)$p['requesterId'], $id, [], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_integrations_test(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $row = db_row('SELECT * FROM integrations WHERE integrationId = ?', [(string)($p['integrationId'] ?? '')]);
    if (!$row) return ['ok' => false, 'error' => 'not_found'];
    $r = integration_test_fire($row);
    audit('integration.test', (string)$p['requesterId'], (string)$row['integrationId'], ['ok' => !empty($r['ok'])], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'delivered' => !empty($r['ok']), 'error' => $r['error'] ?? null];
}

/** Manual "run the queue now" from admin (cron remains the steady driver). */
function admin_integrations_dispatch(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    return deliveries_dispatch(50);
}

/**
 * Full member snapshot → the Sheets mirror, on demand ("Sync now"). The DB
 * stays the source of truth; the sheet is a projection. Chunked so Apps
 * Script's payload limits aren't hit.
 */
function admin_sheets_sync_members(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $sheets = db_all("SELECT * FROM integrations WHERE kind = 'sheets' AND status = 'active'");
    if (!$sheets) return ['ok' => false, 'error' => 'no_sheets_integration'];
    $members = db_all('SELECT memberId, fullName, email, phone, type, status, role, centre, track, cohort, joinDate, school, parentName, parentEmail, parentPhone, createdAt FROM members ORDER BY id ASC');
    $chunks = array_chunk($members, 100);
    $sent = 0; $errors = [];
    foreach ($sheets as $dest) {
        foreach ($chunks as $i => $chunk) {
            $event = [
                'eventId' => 'EV-SNAP-' . strtoupper(rand_hex(4)) . '-' . $i,
                'kind' => 'members.snapshot',
                'createdAt' => now_iso(),
                'payload' => json_encode(['page' => $i + 1, 'pages' => count($chunks), 'members' => $chunk], JSON_UNESCAPED_SLASHES),
            ];
            $r = bus_deliver_one($dest, $event);
            if (!empty($r['ok'])) $sent++;
            else $errors[] = ($r['error'] ?? 'failed');
        }
    }
    audit('sheets.sync_members', (string)$p['requesterId'], '', ['chunks' => $sent, 'errors' => count($errors)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'chunksSent' => $sent, 'total' => count($members), 'errors' => array_slice($errors, 0, 3)];
}
