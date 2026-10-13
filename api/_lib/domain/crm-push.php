<?php
declare(strict_types=1);

/* ============================================================================
   NGG's adults, pushed to the CACENTRE CRM's Audience.

   CACENTRE keeps one list of everybody the estate knows. This is NGG's half:
   newsletter subscribers (and their unsubscribes), contact-form enquiries,
   paid donations, adult volunteers and parents/guardians — sent to
   CACENTRE's /api/crm-intake.php in the v1 envelope, signed with NGG's own
   secret (Control Room → Settings → API keys → CACENTRE CRM).

   - NO CHILD LEAVES. Members, applicants and Summer School participants are
     children and are not read here at all. A volunteer goes only when the
     record shows an adult: a date of birth 18 or more years ago, or no date
     of birth and no member record (a member who volunteers is a child of
     the programme until shown otherwise). A guardian's row carries no ward.
   - CURSORS MOVE ONLY ON A 200. Each source keeps how far it has been sent
     (setting `crm_push`), written only once CACENTRE accepted the push, so a
     failed push is resent and CACENTRE's (site, kind, ref) key makes the
     repeat an update.
   - A CHANGE IS SENT AS WELL AS A NEW ROW. The newsletter and guardians are
     read past their updatedAt as well as their id, so an unsubscribe reaches
     the CRM — the failure that matters most, since that is how somebody who
     said stop goes on being written to from another site.
   ========================================================================== */

const CRM_PUSH_APP   = 'ngg';
const CRM_PUSH_BATCH = 500;
const CRM_PUSH_DEFAULT_BASE = 'https://cacentre.afrovanguard.org.ng';

/** For tests: fn(string $url, string $body): array{code:int, body:string}. */
$GLOBALS['__crm_push_transport'] = $GLOBALS['__crm_push_transport'] ?? null;

function crm_push_secret(): string { return trim((string)($GLOBALS['CONFIG']['cacentre']['crm_secret'] ?? '')); }

function crm_push_url(): string {
    $b = rtrim(trim((string)($GLOBALS['CONFIG']['cacentre']['crm_url'] ?? '')), '/');
    $p = $b !== '' ? parse_url($b) : null;
    $ok = is_array($p) && in_array(strtolower((string)($p['scheme'] ?? '')), ['http', 'https'], true) && !empty($p['host'])
        && empty($p['user']) && empty($p['query']);
    return ($ok ? $b : CRM_PUSH_DEFAULT_BASE) . '/api/crm-intake.php';
}

/** A push, signed exactly as CACENTRE's CrmAudience::verifyPush() reads it. */
function crm_push_sign(array $rows, string $secret, ?int $now = null): string {
    $now = $now ?? time();
    $b64 = static fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $payload = $b64((string)json_encode(
        ['app' => CRM_PUSH_APP, 'iat' => $now, 'exp' => $now + 300, 'nonce' => bin2hex(random_bytes(12)), 'rows' => $rows],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    return 'v1.' . $payload . '.' . $b64(hash_hmac('sha256', $payload, $secret, true));
}

/** A ref that always fits CACENTRE's 64 characters, and is the same every time for the same key. */
function crm_push_ref(string $prefix, string $key): string {
    return strlen($prefix . $key) <= 64 ? $prefix . $key : $prefix . sha1($key);
}

function crm_push_cursors(): array { $c = setting_get('crm_push'); return is_array($c) ? $c : []; }

/** A volunteer the CRM may hold: provably an adult, or with nothing suggesting a child. */
function crm_push_volunteer_is_adult(array $v): bool {
    $dob = trim((string)($v['dob'] ?? ''));
    if ($dob !== '') {
        $t = strtotime($dob);
        return $t !== false && $t <= strtotime('-18 years');
    }
    return trim((string)($v['memberId'] ?? '')) === '';
}

/**
 * Up to $limit rows past every source's cursor, and the cursors they move
 * to. Writes nothing.
 *
 * @return array{rows:list<array>, cursors:array<string,string>}
 */
function crm_push_collect(int $limit = CRM_PUSH_BATCH): array {
    $cur = crm_push_cursors();
    $rows = []; $next = [];
    $room = static function () use (&$rows, $limit): int { return $limit - count($rows); };
    $at = static function ($v): string { $t = strtotime((string)$v); return $t ? gmdate('Y-m-d H:i:s', $t) : ''; };

    /* Newsletter: new rows by id, changed rows (an unsubscribe) by updatedAt. */
    $id = (int)($cur['newsletter.id'] ?? 0); $up = (string)($cur['newsletter.at'] ?? '');
    foreach (db_all('SELECT id, email, source, status, createdAt, updatedAt FROM newsletter
                     WHERE id > ? OR COALESCE(updatedAt, \'\') > ? ORDER BY id LIMIT ' . max(0, $room()), [$id, $up]) as $r) {
        $st = in_array((string)$r['status'], ['subscribed', 'unsubscribed', 'bounced', 'complained'], true) ? (string)$r['status'] : 'subscribed';
        $rows[] = ['kind' => 'subscriber', 'ref' => 'news:' . sha1(strtolower(trim((string)$r['email']))), 'email' => (string)$r['email'],
                   'list' => 'NGG newsletter', 'status' => $st, 'at' => $at($r['updatedAt'] ?: $r['createdAt'])];
        $next['newsletter.id'] = (string)max((int)$r['id'], (int)($next['newsletter.id'] ?? $id));
        if ((string)$r['updatedAt'] > (string)($next['newsletter.at'] ?? $up)) $next['newsletter.at'] = (string)$r['updatedAt'];
    }

    /* Contact-form enquiries, by id. The message stays here. */
    if ($room() > 0) {
        $id = (int)($cur['contact.id'] ?? 0);
        foreach (db_all('SELECT id, ref, purpose, name, email, phone, subject, createdAt FROM contact_messages WHERE id > ? ORDER BY id LIMIT ' . $room(), [$id]) as $r) {
            $next['contact.id'] = (string)$r['id'];
            if (trim((string)$r['email']) === '' && trim((string)$r['phone']) === '') continue;
            $rows[] = ['kind' => 'enquiry', 'ref' => crm_push_ref('contact:', (string)$r['ref']), 'email' => (string)$r['email'], 'phone' => (string)$r['phone'],
                       'name' => (string)$r['name'], 'list' => 'NGG contact form', 'status' => 'active',
                       'detail' => trim(ucfirst((string)$r['purpose']) . ': ' . (string)$r['subject'], ': '), 'at' => $at($r['createdAt'])];
        }
    }

    /* Donations, once paid — by when they were paid, since a gift is created pending. */
    if ($room() > 0) {
        $paid = (string)($cur['donations.paid'] ?? '');
        foreach (db_all("SELECT reference, email, name, amount, currency, paidAt FROM donations
                         WHERE status = 'paid' AND paidAt > ? ORDER BY paidAt LIMIT " . $room(), [$paid]) as $r) {
            $next['donations.paid'] = (string)$r['paidAt'];
            if (!filter_var((string)$r['email'], FILTER_VALIDATE_EMAIL)) continue;
            /* Stored in whole naira (events.php donation_start), not kobo. */
            $amt = (string)$r['currency'] === 'NGN' ? '₦' . number_format((int)$r['amount']) : (string)$r['currency'] . ' ' . number_format((int)$r['amount']);
            $rows[] = ['kind' => 'donor', 'ref' => crm_push_ref('gift:', (string)$r['reference']), 'email' => (string)$r['email'], 'name' => (string)$r['name'],
                       'list' => 'NGG donors', 'status' => 'active', 'detail' => 'Gave ' . $amt, 'at' => $at($r['paidAt'])];
        }
    }

    /* Volunteers who are adults, new by id. */
    if ($room() > 0) {
        $id = (int)($cur['volunteers.id'] ?? 0);
        foreach (db_all('SELECT id, volunteerId, memberId, fullName, email, phone, dob, role, status, programme, createdAt FROM volunteers
                         WHERE id > ? ORDER BY id LIMIT ' . $room(), [$id]) as $r) {
            $next['volunteers.id'] = (string)$r['id'];
            if (!crm_push_volunteer_is_adult($r)) continue;
            if (trim((string)$r['email']) === '' && trim((string)$r['phone']) === '') continue;
            $rows[] = ['kind' => 'volunteer', 'ref' => crm_push_ref('vol:', (string)$r['volunteerId']), 'email' => (string)$r['email'], 'phone' => (string)$r['phone'],
                       'name' => (string)$r['fullName'], 'list' => ((string)($r['programme'] ?? '') === 'ngg' ? 'NGG Club volunteers' : 'Summer School volunteers'),
                       'status' => (string)$r['status'] === 'active' ? 'active' : 'closed',
                       'detail' => ucfirst((string)$r['role']), 'at' => $at($r['createdAt'])];
        }
    }

    /* Parents and guardians, new by id and changed by updatedAt. No ward is named. */
    if ($room() > 0) {
        $id = (int)($cur['guardians.id'] ?? 0); $up = (string)($cur['guardians.at'] ?? '');
        foreach (db_all('SELECT id, guardianId, email, fullName, phone, status, createdAt, updatedAt FROM guardians
                         WHERE id > ? OR COALESCE(updatedAt, \'\') > ? ORDER BY id LIMIT ' . $room(), [$id, $up]) as $r) {
            $rows[] = ['kind' => 'account', 'ref' => crm_push_ref('guardian:', (string)$r['guardianId']), 'email' => (string)$r['email'], 'phone' => (string)$r['phone'],
                       'name' => (string)$r['fullName'], 'list' => 'NGG parents & guardians',
                       'status' => (string)$r['status'] === 'active' ? 'active' : 'closed', 'at' => $at($r['updatedAt'] ?: $r['createdAt'])];
            $next['guardians.id'] = (string)max((int)$r['id'], (int)($next['guardians.id'] ?? $id));
            if ((string)$r['updatedAt'] > (string)($next['guardians.at'] ?? $up)) $next['guardians.at'] = (string)$r['updatedAt'];
        }
    }

    return ['rows' => $rows, 'cursors' => $next];
}

/**
 * Send what is waiting, a batch at a time, until it is sent or a push fails.
 * Run by the web-cron; a site with no CRM secret sends nothing.
 */
function crm_push_run(int $maxPushes = 6): array {
    if (crm_push_secret() === '') return ['ok' => true, 'skipped' => true, 'sent' => 0, 'why' => 'no CRM secret set'];
    $sent = 0; $refused = 0;
    for ($i = 0; $i < $maxPushes; $i++) {
        $c = crm_push_collect();
        if (!$c['rows'] && !$c['cursors']) break;
        $r = ['ok' => true, 'refused' => []];
        if ($c['rows']) {
            $r = crm_push_post($c['rows']);
            if (!$r['ok']) {
                crm_push_note('failed: ' . $r['error']);
                return ['ok' => false, 'sent' => $sent, 'error' => $r['error']];
            }
            /* A row CACENTRE refused BY NAME is not resent — it would be refused for ever
               and hold everything behind it — but it is counted and said, never reported
               as sent. */
            $refused += count($r['refused']);
            if ($r['refused']) error_log('[crm-push] refused: ' . json_encode(array_slice($r['refused'], 0, 5)));
        }
        /* Only now: CACENTRE has it (or nothing in the batch was sendable). */
        setting_set('crm_push', array_merge(crm_push_cursors(), $c['cursors']), 'system');
        $sent += count($c['rows']) - count($r['refused']);
        if (count($c['rows']) < CRM_PUSH_BATCH && $c['rows'] !== []) break;
    }
    crm_push_note('sent ' . $sent . ($refused ? ', ' . $refused . ' refused by CACENTRE (see the error log)' : ''));
    return ['ok' => true, 'sent' => $sent, 'refused' => $refused];
}

/** @return array{ok:bool, error?:string, refused?:list<array{ref:string,why:string}>} */
function crm_push_post(array $rows): array {
    $body = (string)json_encode(['token' => crm_push_sign($rows, crm_push_secret())], JSON_UNESCAPED_SLASHES);
    $t = $GLOBALS['__crm_push_transport'] ?? null;
    if (is_callable($t)) {
        $r = $t(crm_push_url(), $body);
    } elseif (function_exists('curl_init')) {
        $ch = curl_init(crm_push_url());
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2]);
        $out = curl_exec($ch);
        $r = ['code' => (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'body' => is_string($out) ? $out : '', 'error' => curl_error($ch)];
        curl_close($ch);
    } else {
        return ['ok' => false, 'error' => 'This server has no curl.'];
    }
    $code = (int)($r['code'] ?? 0);
    $j = json_decode((string)($r['body'] ?? ''), true);
    if ($code === 200 && is_array($j) && !empty($j['ok'])) {
        return ['ok' => true, 'refused' => array_values(array_filter((array)($j['refused'] ?? []), 'is_array'))];
    }
    $err = is_array($j) ? (string)($j['error'] ?? '') : '';
    if ($err === 'bad-signature')  return ['ok' => false, 'error' => 'CACENTRE refused the signature — the secret here differs from the one it generated.'];
    if ($err === 'not-configured') return ['ok' => false, 'error' => 'CACENTRE has no secret for NGG yet — generate one in the CRM under Audience → Sites.'];
    if ($code === 0) return ['ok' => false, 'error' => 'CACENTRE did not answer (' . (string)($r['error'] ?? 'no connection') . ').'];
    return ['ok' => false, 'error' => 'CACENTRE answered ' . $code . ($err !== '' ? ' (' . $err . ')' : '') . '.'];
}

/* Stored as an array: setting_get() decodes JSON, and a bare string reads back as null. */
function crm_push_note(string $what): void {
    try { setting_set('crm_push_last', ['at' => now_iso(), 'text' => mb_substr($what, 0, 200)], 'system'); } catch (Throwable $e) {}
}

/** The last run, in words, for a status screen: "" when it has never run. */
function crm_push_last(): string {
    $v = setting_get('crm_push_last');
    return is_array($v) ? trim((string)($v['at'] ?? '') . ' · ' . (string)($v['text'] ?? ''), ' ·') : '';
}
