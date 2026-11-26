<?php
/**
 * Connecting a family account to a child, smarter (owner, 26 Nov 2026).
 *
 * "It is not smart at all" — the parent typed the child's Anchor code, or asked and waited days for the desk. And
 * "the child and parent should still be connected even when the parent logs on another device. There'll just be a
 * notice and a minor layer of verification."
 *
 * So:
 *  1. A FAMILY ACCOUNT IS AN ADULT'S. Date of birth and a declaration (18+) before any child is connected
 *     (family_adult_set). Nothing about a child is shown to an account that has not given both.
 *  2. AUTO-FIND. The records that name the account's VERIFIED email (it signed in with it) or VERIFIED phone (proved
 *     with a code) are offered by first name and centre, and one tap connects — the parent proved the contact the
 *     centre registered for that child, which is a stronger proof than the desk can do by looking.
 *  3. BY PHONE. A parent whose record carries only a phone types it; if any child's record names it, a code goes to
 *     that phone (WhatsApp first, SMS after), and the code connects every child whose record names it. The answer to
 *     "is there a child with this number" is the same either way, so the form cannot be used to look people up.
 *  4. THE ANCHOR CODE, WITH A SECOND LAYER. Knowing a child's code proves you know the child, not that you are their
 *     parent. Unless the account's own email is the one on the record, a confirmation code goes to the parent contact
 *     ON THE RECORD; with none on the record, the request waits for the desk.
 *  5. DEVICES. A link belongs to the account, never to a device. A sign-in on a device the account has not used is
 *     told to the account — by email and in the other devices' inbox — and the sign-in itself is the code by email.
 */

const FAMILY_ADULT_AGE = 18;
const FAMILY_LINK_CODE_MINUTES = 30;
const FAMILY_LINK_CODE_TRIES = 5;
const FAMILY_LINK_CODES_PER_HOUR = 5;     // codes one account may ask for in an hour, across purposes
const FAMILY_PHONE_MATCH_MAX = 8;
/* A phone as typed ("+234 803 555 0202", "0803-555-0202", "(0803) 5550202") with its spacing and punctuation taken out,
   in SQL both SQLite and MySQL read the same, so a record matches however its number was written. */
const FAMILY_PHONE_DIGITS_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(parentPhone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '.', '')";

/** The last ten digits of a phone, the part every way of writing a Nigerian number shares. '' when too short. */
function family_phone_tail(string $phone): string {
    $d = preg_replace('/\D+/', '', $phone);
    return strlen((string)$d) >= 10 ? substr((string)$d, -10) : '';
}

/** Age in whole years on a Lagos calendar day, or null for a date that is not one. */
function family_age(string $dob, ?string $today = null): ?int {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dob)) return null;
    [$y, $m, $d] = array_map('intval', explode('-', $dob));
    if (!checkdate($m, $d, $y)) return null;
    $t = $today ?? (new DateTimeImmutable('now', new DateTimeZone('Africa/Lagos')))->format('Y-m-d');
    if ($dob > $t) return null;
    [$ty, $tm, $td] = array_map('intval', explode('-', $t));
    return $ty - $y - (($tm < $m || ($tm === $m && $td < $d)) ? 1 : 0);
}

function family_is_adult(array $g): bool {
    $age = family_age((string)($g['dob'] ?? ''));
    return (string)($g['adultDeclaredAt'] ?? '') !== '' && $age !== null && $age >= FAMILY_ADULT_AGE;
}

/** family.adult {dob, declare} — the account holder's date of birth and their declaration. Once given, kept. */
function family_adult_set(array $p): array {
    $g = db_row('SELECT * FROM guardians WHERE guardianId = ? LIMIT 1', [(string)($p['guardianId'] ?? '')]);
    if (!$g) return ['ok' => false, 'error' => 'not_found'];
    if (family_is_adult($g)) return ['ok' => true, 'adult' => true, 'unchanged' => true];
    $dob = trim((string)($p['dob'] ?? ''));
    $age = family_age($dob);
    if ($age === null || $age > 110) return ['ok' => false, 'error' => 'bad_dob', 'detail' => 'Give your date of birth.'];
    if (empty($p['declare'])) return ['ok' => false, 'error' => 'declaration_required', 'detail' => 'Tick the box to confirm you are the child’s parent or guardian and 18 or over.'];
    if ($age < FAMILY_ADULT_AGE) {
        audit('family.adult.refused', (string)$g['guardianId'], (string)$g['guardianId'], ['age' => $age], (string)($p['ip'] ?? ''));
        return ['ok' => false, 'error' => 'not_adult', 'detail' => 'A family account is for a parent or guardian aged 18 or over. If you are a member, use your own member account.'];
    }
    db_exec('UPDATE guardians SET dob = ?, adultDeclaredAt = ?, updatedAt = ? WHERE guardianId = ?', [$dob, now_iso(), now_iso(), (string)$g['guardianId']]);
    audit('family.adult', (string)$g['guardianId'], (string)$g['guardianId'], [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'adult' => true];
}

/**
 * The NGG children whose records name this account's verified contact and who are not connected to it: each with
 * how it was found ('email' | 'phone'). First name and centre only — never more about a child the account has not
 * connected.
 */
function family_found_children(array $g): array {
    $linked = [];
    foreach (db_all("SELECT memberId FROM guardian_wards WHERE guardianId = ? AND status IN ('active','pending')", [(string)$g['guardianId']]) as $r) $linked[(string)$r['memberId']] = true;
    $out = [];
    $add = static function (array $m, string $how) use (&$out, $linked) {
        $mid = (string)$m['memberId'];
        if (isset($linked[$mid]) || isset($out[$mid]) || !member_is_ngg($m)) return;
        $out[$mid] = ['memberId' => $mid, 'firstName' => explode(' ', trim((string)$m['fullName']))[0] ?? '', 'centre' => (string)$m['centre'], 'how' => $how];
    };
    foreach (db_all("SELECT memberId, fullName, centre, type FROM members WHERE lower(parentEmail) = ? AND status = 'active' LIMIT 20", [strtolower((string)$g['email'])]) as $m) $add($m, 'email');
    $tail = (string)($g['phoneVerifiedAt'] ?? '') !== '' ? family_phone_tail((string)($g['phone'] ?? '')) : '';
    if ($tail !== '') foreach (db_all("SELECT memberId, fullName, centre, type, parentPhone FROM members WHERE " . FAMILY_PHONE_DIGITS_SQL . " LIKE ? AND status = 'active' LIMIT 40", ['%' . $tail]) as $m)
        if (family_phone_tail((string)$m['parentPhone']) === $tail) $add($m, 'phone');
    return array_values($out);
}

/** Make one active link (shared by every way in). Returns the public link, or an error. */
function family_link_make(array $g, array $m, string $rel, string $via, string $ip = ''): array {
    $gid = (string)$g['guardianId']; $mid = (string)$m['memberId'];
    $held = (int)db_row("SELECT COUNT(*) c FROM guardian_wards WHERE guardianId = ? AND status IN ('active','pending')", [$gid])['c'];
    $existing = db_row("SELECT * FROM guardian_wards WHERE guardianId = ? AND memberId = ? AND status IN ('active','pending') LIMIT 1", [$gid, $mid]);
    if ($existing && (string)$existing['status'] === 'active') return ['ok' => false, 'error' => 'already_linked', 'link' => family_link_public($existing, $m)];
    if (!$existing && $held >= FAMILY_WARDS_MAX) return ['ok' => false, 'error' => 'too_many_wards', 'detail' => 'A family account holds up to ' . FAMILY_WARDS_MAX . ' members.'];
    if (!isset(FAMILY_RELATIONSHIPS[$rel])) $rel = 'parent';
    if ($existing) {   // a request waiting for the desk, now proved: it becomes the link
        db_exec("UPDATE guardian_wards SET status = 'active', via = ?, decidedBy = ?, decidedAt = ?, updatedAt = ? WHERE linkId = ?", [$via, $via, now_iso(), now_iso(), (string)$existing['linkId']]);
        $row = db_row('SELECT * FROM guardian_wards WHERE linkId = ?', [(string)$existing['linkId']]);
    } else {
        $row = ['linkId' => 'GW-' . strtoupper(rand_hex(6)), 'guardianId' => $gid, 'memberId' => $mid, 'relationship' => $rel, 'status' => 'active', 'via' => $via,
                'notify' => json_encode(FAMILY_NOTIFY_DEFAULT), 'decidedBy' => $via, 'decidedAt' => now_iso(), 'createdAt' => now_iso(), 'updatedAt' => now_iso()];
        db_insert('guardian_wards', $row);
    }
    audit('family.ward.link', $gid, (string)$row['linkId'], ['memberId' => $mid, 'via' => $via], $ip);
    $who = trim((string)($g['fullName'] ?? '')) !== '' ? (string)$g['fullName'] : mask_email((string)$g['email']);
    family_tell_ward($m, $who, $rel);
    return ['ok' => true, 'link' => family_link_public($row, $m)];
}

/**
 * family.ward.connect {memberId, relationship} — one tap for a child family_found_children() offered. Re-checked here,
 * never trusted from the screen: the record must still name the account's verified email or phone.
 */
function family_ward_connect(array $p): array {
    $g = db_row('SELECT * FROM guardians WHERE guardianId = ? LIMIT 1', [(string)($p['guardianId'] ?? '')]);
    if (!$g) return ['ok' => false, 'error' => 'not_found'];
    if (!family_is_adult($g)) return ['ok' => false, 'error' => 'adult_required'];
    $mid = (string)($p['memberId'] ?? '');
    $hit = null; foreach (family_found_children($g) as $c) if ($c['memberId'] === $mid) $hit = $c;
    if (!$hit) return ['ok' => false, 'error' => 'not_found'];
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$mid]);
    return family_link_make($g, $m, (string)($p['relationship'] ?? 'parent'), $hit['how'], (string)($p['ip'] ?? ''));
}

/** Codes this account asked for in the last hour (every purpose): the bound on sending texts and emails on its behalf. */
function family_codes_recent(string $gid): int {
    return (int)(db_row('SELECT COUNT(*) n FROM family_link_codes WHERE guardianId = ? AND createdAt >= ?', [$gid, gmdate('Y-m-d\TH:i:s\Z', time() - 3600)])['n'] ?? 0);
}

/** Store a code and send it. $dests: [['email'|'phone', address]]. Returns [codeId, masked destinations]. */
function family_code_send(array $g, string $purpose, array $memberIds, string $rel, array $dests, string $childFirst = ''): array {
    $otp = (string)($GLOBALS['__family_otp'] ?? new_otp()); $codeId = 'FLC-' . strtoupper(rand_hex(8));   // test seam: a known code
    db_insert('family_link_codes', ['codeId' => $codeId, 'guardianId' => (string)$g['guardianId'], 'purpose' => $purpose,
        'memberIds' => json_encode(array_values($memberIds)), 'relationship' => $rel, 'dest' => mb_substr(implode(',', array_map(static fn($d) => $d[1], $dests)), 0, 190),
        'otpHash' => hash('sha256', $codeId . '|' . $otp), 'attempts' => 0, 'createdAt' => now_iso(),
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + FAMILY_LINK_CODE_MINUTES * 60), 'usedAt' => '']);
    $what = $purpose === 'phone' ? 'connect your NGG family account to your child' : 'confirm you are ' . ($childFirst !== '' ? $childFirst . '’s' : 'the child’s') . ' parent or guardian';
    $text = 'NGG: ' . $otp . ' is your code to ' . $what . '. It works for ' . FAMILY_LINK_CODE_MINUTES . ' minutes. If you did not ask, ignore this.';
    $masked = [];
    foreach ($dests as [$kind, $addr]) {
        if ($kind === 'phone' && function_exists('sms_send')) { try { sms_send($addr, $text); } catch (Throwable $e) {} $masked[] = '••• ' . substr(preg_replace('/\D/', '', $addr), -4); }
        if ($kind === 'email' && function_exists('send_mail')) {
            $html = function_exists('email_template') ? email_template(['eyebrow' => 'NGG · Family account', 'title' => 'Your code', 'intro' => 'Use this code to ' . $what . '. It works for ' . FAMILY_LINK_CODE_MINUTES . ' minutes.', 'otp' => $otp,
                'footNote' => 'Somebody asked to connect a family account to a child whose record names this address. If it was not you, ignore this email and tell the centre.']) : $text;
            @send_mail($addr, 'Your NGG family code', $html); $masked[] = mask_email($addr);
        }
    }
    return [$codeId, $masked];
}

/**
 * family.phone.find {phone, relationship} — find the children whose record names this phone, and send a code to it.
 * The reply is the same whether or not any record names it: this must not be a way to look a phone number up.
 */
function family_phone_find(array $p): array {
    $g = db_row('SELECT * FROM guardians WHERE guardianId = ? LIMIT 1', [(string)($p['guardianId'] ?? '')]);
    if (!$g) return ['ok' => false, 'error' => 'not_found'];
    if (!family_is_adult($g)) return ['ok' => false, 'error' => 'adult_required'];
    $tail = family_phone_tail((string)($p['phone'] ?? ''));
    if ($tail === '') return ['ok' => false, 'error' => 'bad_phone', 'detail' => 'Type the phone number the centre has for you, e.g. 0803 123 4567.'];
    if (family_codes_recent((string)$g['guardianId']) >= FAMILY_LINK_CODES_PER_HOUR) return ['ok' => false, 'error' => 'too_many_attempts', 'detail' => 'Too many codes this hour. Try again later.'];
    $ids = [];
    foreach (db_all("SELECT memberId, parentPhone, type FROM members WHERE " . FAMILY_PHONE_DIGITS_SQL . " LIKE ? AND status = 'active' LIMIT 40", ['%' . $tail]) as $m)
        if (family_phone_tail((string)$m['parentPhone']) === $tail && member_is_ngg($m)) $ids[] = (string)$m['memberId'];
    $ids = array_slice(array_values(array_unique($ids)), 0, FAMILY_PHONE_MATCH_MAX);
    $phone = function_exists('sms_normalize') ? (sms_normalize((string)$p['phone']) ?: '+234' . $tail) : '+234' . $tail;
    // Stored either way (so the answer and the timing are the same); sent only where there is somebody to connect.
    [$codeId] = $ids ? family_code_send($g, 'phone', $ids, (string)($p['relationship'] ?? 'parent'), [['phone', $phone]])
                     : [('FLC-' . strtoupper(rand_hex(8)))];
    if (!$ids) db_insert('family_link_codes', ['codeId' => $codeId, 'guardianId' => (string)$g['guardianId'], 'purpose' => 'phone', 'memberIds' => '[]', 'relationship' => 'parent',
        'dest' => $phone, 'otpHash' => hash('sha256', $codeId . '|' . rand_hex(8)), 'attempts' => 0, 'createdAt' => now_iso(), 'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + FAMILY_LINK_CODE_MINUTES * 60), 'usedAt' => '']);
    audit('family.phone.find', (string)$g['guardianId'], (string)$g['guardianId'], ['found' => count($ids)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'codeId' => $codeId, 'sentTo' => '••• ' . substr($tail, -4),
            'detail' => 'If a child’s NGG record has this number, we have sent it a code by WhatsApp or text. It works for ' . FAMILY_LINK_CODE_MINUTES . ' minutes.'];
}

/**
 * family.code.confirm {codeId, code} — the second step of either way: the phone (every child whose record names it is
 * connected, and the phone is saved to the account as verified) or the Anchor code (that child is connected).
 * Five guesses a code, each claimed with a relative increment so concurrent guesses cannot all read "0".
 */
function family_code_confirm(array $p): array {
    $g = db_row('SELECT * FROM guardians WHERE guardianId = ? LIMIT 1', [(string)($p['guardianId'] ?? '')]);
    if (!$g) return ['ok' => false, 'error' => 'not_found'];
    $c = db_row("SELECT * FROM family_link_codes WHERE codeId = ? AND guardianId = ? LIMIT 1", [(string)($p['codeId'] ?? ''), (string)$g['guardianId']]);
    if (!$c) return ['ok' => false, 'error' => 'invalid'];
    if ((string)$c['usedAt'] !== '') return ['ok' => false, 'error' => 'already_used'];
    if (strtotime((string)$c['expiresAt']) < time()) return ['ok' => false, 'error' => 'expired', 'detail' => 'That code has expired. Ask for a new one.'];
    if (db_exec('UPDATE family_link_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ?', [(int)$c['id'], FAMILY_LINK_CODE_TRIES]) < 1)
        return ['ok' => false, 'error' => 'too_many_attempts', 'detail' => 'Too many wrong tries. Ask for a new code.'];
    $otp = preg_replace('/\D/', '', (string)($p['code'] ?? ''));
    if (strlen($otp) !== 6 || !hash_equals((string)$c['otpHash'], hash('sha256', (string)$c['codeId'] . '|' . $otp))) {
        $left = FAMILY_LINK_CODE_TRIES - (int)$c['attempts'] - 1;
        return ['ok' => false, 'error' => 'invalid', 'detail' => 'That code is not right.' . ($left > 0 ? ' ' . $left . ' tr' . ($left === 1 ? 'y' : 'ies') . ' left.' : '')];
    }
    if (db_exec("UPDATE family_link_codes SET usedAt = ? WHERE id = ? AND usedAt = ''", [now_iso(), (int)$c['id']]) < 1) return ['ok' => false, 'error' => 'already_used'];
    $ids = json_decode((string)$c['memberIds'], true) ?: [];
    if ((string)$c['purpose'] === 'phone') {
        db_exec('UPDATE guardians SET phone = ?, phoneVerifiedAt = ?, updatedAt = ? WHERE guardianId = ?', [(string)$c['dest'], now_iso(), now_iso(), (string)$g['guardianId']]);
        $g = db_row('SELECT * FROM guardians WHERE guardianId = ?', [(string)$g['guardianId']]);
    }
    $links = []; $refused = [];
    foreach ($ids as $mid) {
        $m = db_row("SELECT * FROM members WHERE memberId = ? AND status = 'active' LIMIT 1", [(string)$mid]);
        if (!$m) { $refused[] = $mid; continue; }
        $r = family_link_make($g, $m, (string)$c['relationship'], (string)$c['purpose'] === 'phone' ? 'phone' : 'code', (string)($p['ip'] ?? ''));
        if (!empty($r['ok'])) $links[] = $r['link']; elseif (($r['error'] ?? '') !== 'already_linked') $refused[] = $mid;
    }
    return ['ok' => true, 'links' => $links, 'connected' => count($links), 'refused' => count($refused)];
}

/* ── Devices: a link is the account's; a new device is told, never re-linked ─────────────────────────────── */

/** A short, human description of a browser, for the notice ("Chrome on Android"). Never stored in full. */
function family_device_label(string $ua): string {
    $b = preg_match('/Edg\//', $ua) ? 'Edge' : (preg_match('/OPR\/|Opera/', $ua) ? 'Opera' : (preg_match('/Chrome\//', $ua) ? 'Chrome' : (preg_match('/Firefox\//', $ua) ? 'Firefox' : (preg_match('/Safari\//', $ua) ? 'Safari' : 'A browser'))));
    $o = preg_match('/Android/', $ua) ? 'Android' : (preg_match('/iPhone|iPad/', $ua) ? 'iPhone or iPad' : (preg_match('/Windows/', $ua) ? 'Windows' : (preg_match('/Mac OS/', $ua) ? 'a Mac' : (preg_match('/Linux/', $ua) ? 'Linux' : 'a device'))));
    return $b . ' on ' . $o;
}

/**
 * Note that this account signed in on this device. A device it has not used before is TOLD to the account — by email,
 * and as a notice the other devices see — unless it is the account's first device. Returns true when it was new.
 */
function family_device_seen(array $g, string $deviceId, string $ua, string $ip = ''): bool {
    if ($deviceId === '') return false;
    $gid = (string)$g['guardianId']; $hash = hash('sha256', 'family-device|' . $deviceId);
    $label = mb_substr(family_device_label($ua), 0, 120);
    $known = db_row('SELECT id FROM guardian_devices WHERE guardianId = ? AND deviceHash = ?', [$gid, $hash]);
    if ($known) { db_exec('UPDATE guardian_devices SET lastSeenAt = ? WHERE id = ?', [now_iso(), (int)$known['id']]); return false; }
    $others = (int)(db_row('SELECT COUNT(*) n FROM guardian_devices WHERE guardianId = ?', [$gid])['n'] ?? 0);
    try { db_insert('guardian_devices', ['guardianId' => $gid, 'deviceHash' => $hash, 'label' => $label, 'firstSeenAt' => now_iso(), 'lastSeenAt' => now_iso()]); } catch (Throwable $e) { return false; }
    if ($others === 0) return true;   // the first device: nothing to warn about
    $when = (new DateTimeImmutable('now', new DateTimeZone('Africa/Lagos')))->format('l j F, g:ia');
    $body = 'Your NGG family account was signed in on a new device: ' . $label . ', ' . $when . ' (Lagos time). Your children stay connected. '
          . 'If this was not you, open Your account and press “Sign out everywhere”, then tell the centre.';
    family_notice_add($gid, 'device', $hash, 'Signed in on a new device', $body, 'NGG');
    if (function_exists('send_mail') && function_exists('email_template'))
        @send_mail((string)$g['email'], 'New sign-in to your NGG family account', email_template(['eyebrow' => 'NGG · Family account', 'title' => 'Signed in on a new device', 'intro' => $body,
            'footNote' => 'You get this whenever your family account is used on a device for the first time.']));
    audit('family.device.new', $gid, $gid, ['label' => $label], $ip);
    return true;
}
