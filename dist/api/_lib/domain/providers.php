<?php
declare(strict_types=1);

/**
 * WHERE A COURSE LEADS — the awarding bodies outside NGG, what each awards,
 * and which members hold one.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The curriculum has always named its routes out. `curriculum-studio-trades`
 * sends a learner to Trinity Drama and the NBTE National Skills Qualification;
 * practical coding to freeCodeCamp; tech foundations to Cisco NetAcad and
 * Google. All of it lived in lesson prose and material links — which means a
 * child finished twenty-four weeks of work and nothing on any screen told them
 * there was a recognised certificate at the end of it, and the programme could
 * not answer the one question a funder always asks: how many of your members
 * hold an external credential?
 *
 * ── THREE TABLES, BECAUSE THE DOMAIN HAS THREE THINGS ───────────────────────
 *
 *   providers          the organisation that awards (freeCodeCamp, Trinity)
 *   provider_awards    the thing a person can hold (a certificate, Grade 5)
 *   member_credentials a person against one of those
 *
 * Merging any two loses something real: one organisation awards many
 * different things, and "Trinity Grade 1" is not "Trinity".
 *
 * ── THE RULES ───────────────────────────────────────────────────────────────
 *
 * 1. A MEMBER HOLDS AN AWARD ONCE. Unique on (memberId, awardId): recording
 *    it again is a correction, never a second credential. Grade 1 and Grade 2
 *    are different awards, so a ladder still works.
 * 2. `earned` REQUIRES A DATE. A credential with no award date is a claim,
 *    not a record, and it is what every count here is built on.
 * 3. AN AWARD BELONGS TO ITS PROVIDER. A credential naming an award that is
 *    not under that provider is REFUSED, never quietly re-pointed.
 * 4. RETIRING A PROVIDER TAKES NOTHING AWAY. A certificate already earned is
 *    in somebody's hand; retiring the body that issued it must not make their
 *    record stop resolving — same rule as retiring a centre.
 * 5. A PROVIDER IN USE IS NOT DELETED SILENTLY. It reports `uses` and refuses
 *    with `provider_in_use` unless `retire` (checked FIRST — retiring is the
 *    answer to the refusal) or `force`.
 * 6. LAPSED IS DERIVED, NEVER STORED. An expiry is a date, and a date passes
 *    without anybody running a job. Computing it on read cannot go stale;
 *    a nightly writer can, and then the record lies.
 */

const PRV_KINDS      = ['certificate', 'graded_exam', 'badge', 'qualification'];
const PRV_STATES     = ['aiming', 'registered', 'earned', 'missed'];
const PRV_STATUSES   = ['active', 'retired'];
const PRV_NAME_MAX   = 160;
const PRV_NOTE_MAX   = 600;
const PRV_URL_MAX    = 500;
/** A roster screen pulls this many at once; a member cannot aim at more. */
const PRV_LIST_MAX   = 300;
const PRV_AIM_MAX    = 24;

/** What each kind is called on screen. One place, so no two screens differ. */
const PRV_KIND_LABEL = [
    'certificate'   => 'Certificate',
    'graded_exam'   => 'Graded exam',
    'badge'         => 'Badge',
    'qualification' => 'Qualification',
];
const PRV_STATE_LABEL = [
    'aiming'     => 'Working towards it',
    'registered' => 'Entered for it',
    'earned'     => 'Holds it',
    'missed'     => 'Sat it, not yet passed',
];

function prv_clean(string $v, int $max): string {
    $v = trim(preg_replace('/\s+/u', ' ', strip_tags($v)) ?? '');
    return mb_substr($v, 0, $max);
}

/** Only http(s), and only as far as the column goes. An empty string is fine. */
function prv_url(string $u): string {
    $u = trim($u);
    if ($u === '') return '';
    return preg_match('~^https?://~i', $u) ? mb_substr($u, 0, PRV_URL_MAX) : '';
}

/**
 * The status, defaulted once. Reading the default in the test and the raw
 * value in the result is how an omitted status became '' rather than
 * 'active' — and a row with an empty status is invisible to every read here.
 */
function prv_status($v): string {
    $v = (string)($v ?? '');
    return in_array($v, PRV_STATUSES, true) ? $v : 'active';
}

function prv_slug(string $name): string {
    $s = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $name) ?? '');
    return trim($s, '-');
}

/** A YYYY-MM-DD or ''. Anything else is '' rather than a guess. */
function prv_date(string $d): string {
    $d = trim($d);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : '';
}

/**
 * Rule 6: lapsed is DERIVED. A held credential whose expiry has passed reads
 * as lapsed everywhere, without any job having had to run.
 */
function prv_is_lapsed(array $c, ?string $today = null): bool {
    $exp = (string)($c['expiresOn'] ?? '');
    if ($exp === '' || (string)($c['state'] ?? '') !== 'earned') return false;
    return $exp < ($today ?? gmdate('Y-m-d'));
}

/** The state a screen should show, which is the stored one unless it lapsed. */
function prv_shown_state(array $c, ?string $today = null): string {
    return prv_is_lapsed($c, $today) ? 'lapsed' : (string)($c['state'] ?? 'aiming');
}

function prv_award_courses(array $a): array {
    $j = json_decode((string)($a['courses'] ?? '[]'), true);
    return is_array($j) ? array_values(array_filter(array_map('strval', $j), static fn($x) => $x !== '')) : [];
}

/** One provider as any screen reads it. */
function prv_provider_row(array $p): array {
    return [
        'providerId' => (string)$p['providerId'], 'name' => (string)$p['name'], 'slug' => (string)$p['slug'],
        'country' => (string)$p['country'], 'url' => (string)$p['url'], 'free' => (int)$p['free'] === 1,
        'costNote' => (string)$p['costNote'], 'notes' => (string)$p['notes'],
        'status' => (string)$p['status'], 'position' => (int)$p['position'],
    ];
}

function prv_award_row(array $a, ?array $p = null): array {
    return [
        'awardId' => (string)$a['awardId'], 'providerId' => (string)$a['providerId'],
        'provider' => $p ? (string)$p['name'] : '',
        'title' => (string)$a['title'], 'kind' => (string)$a['kind'],
        'kindLabel' => PRV_KIND_LABEL[(string)$a['kind']] ?? (string)$a['kind'],
        'level' => (string)$a['level'], 'courses' => prv_award_courses($a),
        'url' => (string)$a['url'], 'examNote' => (string)$a['examNote'], 'costNote' => (string)$a['costNote'],
        'free' => (int)$a['free'] === 1, 'validMonths' => (int)$a['validMonths'],
        'status' => (string)$a['status'], 'position' => (int)$a['position'],
    ];
}

/* ── The registry: providers ─────────────────────────────────────────────── */

/** admin.providers.list — the registry, with each provider's awards and how many hold them. */
function admin_providers_list(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club']); if (!$g['ok']) return $g;
    $withRetired = !empty($p['withRetired']);
    $rows = db_all('SELECT * FROM providers' . ($withRetired ? '' : " WHERE status = 'active'")
        . ' ORDER BY position ASC, name ASC LIMIT ' . PRV_LIST_MAX);
    if (!$rows) return ['ok' => true, 'providers' => [], 'kinds' => PRV_KIND_LABEL, 'states' => PRV_STATE_LABEL];

    /* One grouped query for the awards and one for the counts — never a query
       per provider. A list that loops queries is the N+1 this codebase has
       had to undo twice (CLAUDE.md §6). */
    $ids = array_map(static fn($r) => (string)$r['providerId'], $rows);
    $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $awards = [];
    foreach (db_all("SELECT * FROM provider_awards WHERE providerId IN $in ORDER BY position ASC, title ASC", $ids) as $a) {
        $awards[(string)$a['providerId']][] = $a;
    }
    $held = [];
    foreach (db_all("SELECT awardId, state, COUNT(*) n FROM member_credentials WHERE providerId IN $in GROUP BY awardId, state", $ids) as $h) {
        $held[(string)$h['awardId']][(string)$h['state']] = (int)$h['n'];
    }

    $out = [];
    foreach ($rows as $r) {
        $pid = (string)$r['providerId'];
        $as = [];
        foreach ($awards[$pid] ?? [] as $a) {
            $t = $held[(string)$a['awardId']] ?? [];
            $as[] = prv_award_row($a, $r) + [
                'earned' => (int)($t['earned'] ?? 0), 'aiming' => (int)($t['aiming'] ?? 0),
                'registered' => (int)($t['registered'] ?? 0), 'missed' => (int)($t['missed'] ?? 0),
            ];
        }
        $out[] = prv_provider_row($r) + ['awards' => $as, 'awardCount' => count($as),
            'earned' => array_sum(array_map(static fn($a) => $a['earned'], $as))];
    }
    return ['ok' => true, 'providers' => $out, 'kinds' => PRV_KIND_LABEL, 'states' => PRV_STATE_LABEL,
            'canEdit' => admin_cap_gate($p, 'curriculum')['ok']];
}

/** admin.providers.save — add or correct one awarding body (`curriculum`). */
function admin_providers_save(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $name = prv_clean((string)($d['name'] ?? ''), PRV_NAME_MAX);
    if ($name === '') return ['ok' => false, 'error' => 'name_required'];
    $status = prv_status($d['status'] ?? null);
    $row = [
        'name' => $name, 'slug' => prv_slug($name),
        'country' => prv_clean((string)($d['country'] ?? ''), 80),
        'url' => prv_url((string)($d['url'] ?? '')),
        'free' => !empty($d['free']) ? 1 : 0,
        'costNote' => prv_clean((string)($d['costNote'] ?? ''), 255),
        'notes' => prv_clean((string)($d['notes'] ?? ''), PRV_NOTE_MAX),
        'status' => $status, 'position' => (int)($d['position'] ?? 0),
        'updatedAt' => now_iso(),
    ];
    $id = (string)($d['providerId'] ?? '');
    $by = (string)$g['requester']['memberId'];
    if ($id !== '') {
        $cur = db_row('SELECT * FROM providers WHERE providerId = ?', [$id]);
        if (!$cur) return ['ok' => false, 'error' => 'not_found'];
        db_update('providers', $row, ['providerId' => $id]);
    } else {
        $id = 'PRV-' . strtoupper(rand_hex(5));
        db_insert('providers', $row + ['providerId' => $id, 'createdAt' => now_iso()]);
    }
    audit('providers.save', $by, $id, ['name' => $name, 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'providerId' => $id,
            'provider' => prv_provider_row(db_row('SELECT * FROM providers WHERE providerId = ?', [$id]))];
}

/**
 * admin.providers.delete — rule 5. Retire is checked FIRST, because retiring
 * is the answer to the refusal rather than a different request.
 */
function admin_providers_delete(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $id = (string)($p['providerId'] ?? '');
    $cur = db_row('SELECT * FROM providers WHERE providerId = ?', [$id]);
    if (!$cur) return ['ok' => false, 'error' => 'not_found'];
    $by = (string)$g['requester']['memberId'];

    if (!empty($p['retire'])) {
        db_update('providers', ['status' => 'retired', 'updatedAt' => now_iso()], ['providerId' => $id]);
        audit('providers.retire', $by, $id, ['name' => (string)$cur['name']], (string)($p['ip'] ?? ''));
        /* Rule 4: what people hold is untouched. Their record keeps resolving. */
        return ['ok' => true, 'retired' => true];
    }

    $uses = [
        'awards' => (int)(db_row('SELECT COUNT(*) c FROM provider_awards WHERE providerId = ?', [$id])['c'] ?? 0),
        'credentials' => (int)(db_row('SELECT COUNT(*) c FROM member_credentials WHERE providerId = ?', [$id])['c'] ?? 0),
    ];
    if (($uses['awards'] + $uses['credentials']) > 0 && empty($p['force'])) {
        return ['ok' => false, 'error' => 'provider_in_use', 'uses' => $uses,
            'message' => 'Members hold or are working towards awards from this body. Retire it instead — every record keeps resolving, and nothing new can be added against it.'];
    }
    db_exec('DELETE FROM provider_awards WHERE providerId = ?', [$id]);
    db_exec('DELETE FROM member_credentials WHERE providerId = ?', [$id]);
    db_exec('DELETE FROM providers WHERE providerId = ?', [$id]);
    audit('providers.delete', $by, $id, ['name' => (string)$cur['name']] + $uses, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'deleted' => true] + ['uses' => $uses];
}

/* ── The registry: what each body awards ─────────────────────────────────── */

/** admin.providers.award.save — one thing a member could hold (`curriculum`). */
function admin_provider_award_save(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $pid = (string)($d['providerId'] ?? '');
    $prov = $pid !== '' ? db_row('SELECT * FROM providers WHERE providerId = ?', [$pid]) : null;
    if (!$prov) return ['ok' => false, 'error' => 'provider_not_found'];
    $title = prv_clean((string)($d['title'] ?? ''), 240);
    if ($title === '') return ['ok' => false, 'error' => 'title_required'];
    $kind = in_array((string)($d['kind'] ?? ''), PRV_KINDS, true) ? (string)$d['kind'] : 'certificate';

    /* The courses a member reaches this from. Deduped and bounded; an unknown
       course name is kept rather than refused, because the catalogue is
       edited elsewhere and a route must not vanish when a course is renamed. */
    $courses = [];
    foreach ((array)($d['courses'] ?? []) as $c) {
        $c = prv_clean((string)$c, 120);
        if ($c !== '' && !in_array($c, $courses, true)) $courses[] = $c;
    }
    $row = [
        'providerId' => $pid, 'title' => $title, 'kind' => $kind,
        'level' => prv_clean((string)($d['level'] ?? ''), 80),
        'courses' => json_encode(array_slice($courses, 0, 40), JSON_UNESCAPED_SLASHES),
        'url' => prv_url((string)($d['url'] ?? '')),
        'examNote' => prv_clean((string)($d['examNote'] ?? ''), PRV_URL_MAX),
        'costNote' => prv_clean((string)($d['costNote'] ?? ''), 255),
        'free' => !empty($d['free']) ? 1 : 0,
        'validMonths' => max(0, min(600, (int)($d['validMonths'] ?? 0))),
        'status' => prv_status($d['status'] ?? null),
        'position' => (int)($d['position'] ?? 0),
        'updatedAt' => now_iso(),
    ];
    $id = (string)($d['awardId'] ?? '');
    if ($id !== '') {
        if (!db_row('SELECT * FROM provider_awards WHERE awardId = ?', [$id])) return ['ok' => false, 'error' => 'not_found'];
        db_update('provider_awards', $row, ['awardId' => $id]);
    } else {
        $id = 'PAW-' . strtoupper(rand_hex(5));
        db_insert('provider_awards', $row + ['awardId' => $id, 'createdAt' => now_iso()]);
    }
    audit('providers.award.save', (string)$g['requester']['memberId'], $id, ['title' => $title, 'provider' => (string)$prov['name']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'awardId' => $id,
            'award' => prv_award_row(db_row('SELECT * FROM provider_awards WHERE awardId = ?', [$id]), $prov)];
}

/** admin.providers.award.delete — refused while anybody holds or aims at it. */
function admin_provider_award_delete(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $id = (string)($p['awardId'] ?? '');
    $cur = db_row('SELECT * FROM provider_awards WHERE awardId = ?', [$id]);
    if (!$cur) return ['ok' => false, 'error' => 'not_found'];
    $held = (int)(db_row('SELECT COUNT(*) c FROM member_credentials WHERE awardId = ?', [$id])['c'] ?? 0);
    if ($held > 0 && empty($p['force'])) {
        if (!empty($p['retire'])) {
            db_update('provider_awards', ['status' => 'retired', 'updatedAt' => now_iso()], ['awardId' => $id]);
            return ['ok' => true, 'retired' => true];
        }
        return ['ok' => false, 'error' => 'award_in_use', 'uses' => ['credentials' => $held],
            'message' => 'Members hold or are working towards this. Retire it instead, so their records keep resolving.'];
    }
    db_exec('DELETE FROM member_credentials WHERE awardId = ?', [$id]);
    db_exec('DELETE FROM provider_awards WHERE awardId = ?', [$id]);
    audit('providers.award.delete', (string)$g['requester']['memberId'], $id, ['title' => (string)$cur['title'], 'held' => $held], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'deleted' => true];
}

/* ── A member against an award ───────────────────────────────────────────── */

/**
 * The shared writer behind both the staff op and the member's own "I'm going
 * for this", so one credential cannot be recorded two different ways
 * (CLAUDE.md §6: a bulk op delegates to the single-row implementation; the
 * same reasoning applies to two callers of one write).
 *
 * `$byStaff` is false for a member acting on their own record, which is why
 * they may only ever set `aiming` — holding a credential is something the
 * programme records, not something a child asserts about themselves.
 */
function prv_credential_write(array $m, array $in, bool $byStaff, string $actor): array {
    $awardId = (string)($in['awardId'] ?? '');
    $award = $awardId !== '' ? db_row('SELECT * FROM provider_awards WHERE awardId = ?', [$awardId]) : null;
    if (!$award) return ['ok' => false, 'error' => 'award_not_found'];
    $prov = db_row('SELECT * FROM providers WHERE providerId = ?', [(string)$award['providerId']]);
    if (!$prov) return ['ok' => false, 'error' => 'provider_not_found'];

    /* Rule 3: an award belongs to its provider. A caller that names both must
       name them consistently, and is refused rather than re-pointed. */
    $claimed = (string)($in['providerId'] ?? '');
    if ($claimed !== '' && $claimed !== (string)$award['providerId']) {
        return ['ok' => false, 'error' => 'award_not_of_provider',
                'message' => 'That award is not awarded by that body.'];
    }

    $state = (string)($in['state'] ?? 'aiming');
    if (!in_array($state, PRV_STATES, true)) return ['ok' => false, 'error' => 'bad_state'];
    if (!$byStaff && $state !== 'aiming') return ['ok' => false, 'error' => 'staff_records_this',
        'message' => 'Your centre records an exam result. You can say you are working towards it.'];

    $awardedOn = prv_date((string)($in['awardedOn'] ?? ''));
    /* Rule 2: `earned` requires a date. Every count on every screen is built
       on it, and a credential with no date is a claim, not a record. */
    if ($state === 'earned' && $awardedOn === '') {
        return ['ok' => false, 'error' => 'awarded_on_required',
                'message' => 'A credential needs the date it was awarded. That date is what every count here is built on.'];
    }

    /* An expiry the caller gave, or one derived from the award's own validity.
       A certificate that does not expire keeps an empty expiry, never a date
       far in the future that would eventually come true. */
    $expires = prv_date((string)($in['expiresOn'] ?? ''));
    $valid = (int)$award['validMonths'];
    if ($expires === '' && $state === 'earned' && $valid > 0 && $awardedOn !== '') {
        $expires = gmdate('Y-m-d', strtotime($awardedOn . ' UTC +' . $valid . ' months'));
    }

    $now = now_iso();
    $row = [
        'providerId' => (string)$award['providerId'], 'awardId' => $awardId, 'state' => $state,
        'grade' => prv_clean((string)($in['grade'] ?? ''), 80),
        'credentialRef' => prv_clean((string)($in['credentialRef'] ?? ''), 190),
        'evidenceUrl' => prv_url((string)($in['evidenceUrl'] ?? '')),
        'awardedOn' => $awardedOn, 'expiresOn' => $expires,
        'centre' => (string)($m['centre'] ?? ''),
        'note' => prv_clean((string)($in['note'] ?? ''), PRV_NOTE_MAX),
        'updatedAt' => $now,
    ];

    /* Rule 1: one row per member per award. */
    $existing = db_row('SELECT * FROM member_credentials WHERE memberId = ? AND awardId = ? LIMIT 1',
        [(string)$m['memberId'], $awardId]);
    if ($existing) {
        /* A member may not overwrite what the programme recorded about them —
           they can only ever have added the aim in the first place. */
        if (!$byStaff && !in_array((string)$existing['state'], ['aiming'], true)) {
            return ['ok' => false, 'error' => 'staff_records_this'];
        }
        db_update('member_credentials', $row + ['recordedBy' => $actor], ['credId' => (string)$existing['credId']]);
        $credId = (string)$existing['credId'];
    } else {
        if (!$byStaff) {
            $aims = (int)(db_row("SELECT COUNT(*) c FROM member_credentials WHERE memberId = ? AND state = 'aiming'",
                [(string)$m['memberId']])['c'] ?? 0);
            if ($aims >= PRV_AIM_MAX) return ['ok' => false, 'error' => 'too_many_aims', 'max' => PRV_AIM_MAX];
        }
        $credId = 'MCR-' . strtoupper(rand_hex(6));
        db_insert('member_credentials', $row + ['credId' => $credId, 'memberId' => (string)$m['memberId'],
            'recordedBy' => $actor, 'createdAt' => $now]);
    }
    return ['ok' => true, 'credId' => $credId, 'state' => $state,
            'award' => prv_award_row($award, $prov)];
}

/** admin.providers.credential.set — the centre records a result (`curriculum`). */
function admin_provider_credential_set(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $mid = (string)($p['memberId'] ?? '');
    $m = $mid !== '' ? db_row('SELECT * FROM members WHERE memberId = ?', [$mid]) : null;
    if (!$m) return ['ok' => false, 'error' => 'member_not_found'];
    /* Scope is refused per row, on the way in — never by trusting the list
       the client had on screen (CLAUDE.md §4). */
    if (function_exists('admin_centre_allowed') && !admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) {
        return ['ok' => false, 'error' => 'out_of_scope'];
    }
    $by = (string)$g['requester']['memberId'];
    $r = prv_credential_write($m, is_array($p['data'] ?? null) ? $p['data'] : [], true, $by);
    if (!empty($r['ok'])) {
        audit('providers.credential.set', $by, $mid,
            ['awardId' => (string)(($p['data'] ?? [])['awardId'] ?? ''), 'state' => (string)$r['state']],
            (string)($p['ip'] ?? ''));
    }
    return $r;
}

/** admin.providers.credential.clear — remove one, for a record entered in error. */
function admin_provider_credential_clear(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $id = (string)($p['credId'] ?? '');
    $c = db_row('SELECT * FROM member_credentials WHERE credId = ?', [$id]);
    if (!$c) return ['ok' => false, 'error' => 'not_found'];
    if (function_exists('admin_centre_allowed') && !admin_centre_allowed($g['requester'], (string)($c['centre'] ?? ''))) {
        return ['ok' => false, 'error' => 'out_of_scope'];
    }
    db_exec('DELETE FROM member_credentials WHERE credId = ?', [$id]);
    audit('providers.credential.clear', (string)$g['requester']['memberId'], (string)$c['memberId'],
        ['awardId' => (string)$c['awardId'], 'was' => (string)$c['state']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'deleted' => true];
}

/** member.providers.aim — the member says they are going for one. */
function member_provider_aim(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $awardId = (string)($p['awardId'] ?? '');

    /* Taking the aim back. Only ever their own aim: once the centre has
       recorded a result, it is the programme's record of them. */
    if (!empty($p['remove'])) {
        $c = db_row('SELECT * FROM member_credentials WHERE memberId = ? AND awardId = ? LIMIT 1',
            [(string)$m['memberId'], $awardId]);
        if (!$c) return ['ok' => false, 'error' => 'not_found'];
        if ((string)$c['state'] !== 'aiming') return ['ok' => false, 'error' => 'staff_records_this'];
        db_exec('DELETE FROM member_credentials WHERE credId = ?', [(string)$c['credId']]);
        return ['ok' => true, 'removed' => true];
    }
    return prv_credential_write($m, ['awardId' => $awardId, 'state' => 'aiming'], false, (string)$m['memberId']);
}

/* ── Reads ───────────────────────────────────────────────────────────────── */

/**
 * Every active award, with its provider attached, as one pass.
 *
 * `courses` is a JSON list in a TEXT column, so the course match is done here
 * rather than in SQL — portably, and the registry is dozens of rows, not
 * thousands. Two queries whatever the size.
 */
function prv_live_awards(): array {
    $awards = db_all("SELECT * FROM provider_awards WHERE status = 'active' ORDER BY position ASC, title ASC LIMIT " . PRV_LIST_MAX);
    if (!$awards) return [];
    $pids = array_values(array_unique(array_map(static fn($a) => (string)$a['providerId'], $awards)));
    $in = '(' . implode(',', array_fill(0, count($pids), '?')) . ')';
    $provs = [];
    foreach (db_all("SELECT * FROM providers WHERE providerId IN $in AND status = 'active'", $pids) as $p) {
        $provs[(string)$p['providerId']] = $p;
    }
    $out = [];
    foreach ($awards as $a) {
        $p = $provs[(string)$a['providerId']] ?? null;
        if (!$p) continue;                       // a retired body offers nothing new
        $out[] = ['raw' => $a, 'row' => prv_award_row($a, $p), 'provider' => prv_provider_row($p)];
    }
    return $out;
}

/**
 * member.providers.mine — WHERE THIS COURSE CAN TAKE YOU.
 *
 * One call, because this is one screen: what their own courses lead to, what
 * they already hold, and what they said they are going for. The whole point
 * of the feature is that a child who has done the work can see there is a
 * recognised certificate at the end of it, so the routes come back even when
 * they hold nothing at all.
 */
function member_providers_mine(array $p): array {
    $m = function_exists('curriculum_member_row') ? curriculum_member_row((string)($p['memberId'] ?? '')) : null;
    if (!$m) return ['ok' => false, 'error' => 'not_ngg_member'];
    $mine = [];
    foreach (db_all('SELECT * FROM member_credentials WHERE memberId = ?', [(string)$m['memberId']]) as $c) {
        $mine[(string)$c['awardId']] = $c;
    }
    $courses = function_exists('curriculum_member_courses') ? curriculum_member_courses($m) : [];
    $lower = array_map('mb_strtolower', $courses);

    $routes = []; $held = []; $today = gmdate('Y-m-d');
    foreach (prv_live_awards() as $a) {
        $on = array_values(array_filter($a['row']['courses'],
            static fn($c) => in_array(mb_strtolower($c), $lower, true)));
        $c = $mine[$a['row']['awardId']] ?? null;
        $entry = $a['row'] + [
            'provider' => $a['provider']['name'], 'providerFree' => $a['provider']['free'],
            'providerUrl' => $a['provider']['url'],
            'fromCourses' => $on,
            'state' => $c ? prv_shown_state($c, $today) : '',
            'stateLabel' => $c ? (PRV_STATE_LABEL[prv_shown_state($c, $today)] ?? 'Expired') : '',
            'grade' => $c ? (string)$c['grade'] : '', 'awardedOn' => $c ? (string)$c['awardedOn'] : '',
            'expiresOn' => $c ? (string)$c['expiresOn'] : '',
            'evidenceUrl' => $c ? (string)$c['evidenceUrl'] : '',
        ];
        /* `held` means they HOLD it, not merely that a row exists. An aim and
           an exam entry are still routes — they are things in progress, and
           putting them in the held bucket took the member's own control away
           from them the moment they pressed it.

           Something they hold shows WHEREVER it came from: a credential does
           not stop being theirs when they move off the course that led to
           it. An aim survives the same way, so it can still be taken back. */
        $holds = in_array($entry['state'], ['earned', 'lapsed'], true);
        if ($holds) $held[] = $entry;
        elseif ($on || $c) $routes[] = $entry;
    }
    /* Free first: a child choosing between two routes should see the one that
       costs nothing before the one that costs a term's fees. */
    usort($routes, static function ($a, $b) {
        if ($a['free'] !== $b['free']) return $a['free'] ? -1 : 1;
        return strcmp($a['title'], $b['title']);
    });
    return ['ok' => true, 'held' => $held, 'routes' => $routes,
            'courses' => $courses, 'states' => PRV_STATE_LABEL, 'kinds' => PRV_KIND_LABEL,
            'earned' => count(array_filter($held, static fn($h) => $h['state'] === 'earned')),
            'aimMax' => PRV_AIM_MAX];
}

/**
 * admin.providers.board — what the programme can actually claim.
 *
 * Worth-it test (the same one `lfb_board` had to pass): it does not hand back
 * rows to read. It answers "what do our members hold", biggest first, within
 * the caller's centre scope, and names the people so a coordinator can act.
 */
function admin_providers_board(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club']); if (!$g['ok']) return $g;
    $centres = function_exists('admin_centre_names_in_scope') ? admin_centre_names_in_scope($g['requester']) : null;
    $where = '1 = 1'; $args = [];
    if ($centres !== null) {
        if (!$centres) return ['ok' => true, 'awards' => [], 'totals' => ['earned' => 0, 'aiming' => 0, 'registered' => 0, 'missed' => 0], 'people' => 0];
        $where .= ' AND c.centre IN (' . implode(',', array_fill(0, count($centres), '?')) . ')';
        $args = array_merge($args, $centres);
    }
    $rows = db_all("SELECT c.awardId, c.state, COUNT(*) n FROM member_credentials c WHERE $where GROUP BY c.awardId, c.state", $args);
    $people = (int)(db_row("SELECT COUNT(DISTINCT c.memberId) n FROM member_credentials c WHERE $where", $args)['n'] ?? 0);
    if (!$rows) return ['ok' => true, 'awards' => [], 'totals' => ['earned' => 0, 'aiming' => 0, 'registered' => 0, 'missed' => 0], 'people' => 0];

    $tally = []; $totals = ['earned' => 0, 'aiming' => 0, 'registered' => 0, 'missed' => 0];
    foreach ($rows as $r) {
        $tally[(string)$r['awardId']][(string)$r['state']] = (int)$r['n'];
        if (isset($totals[(string)$r['state']])) $totals[(string)$r['state']] += (int)$r['n'];
    }
    $ids = array_keys($tally);
    $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $awards = [];
    foreach (db_all("SELECT * FROM provider_awards WHERE awardId IN $in", $ids) as $a) $awards[(string)$a['awardId']] = $a;
    $provs = [];
    foreach (db_all('SELECT providerId, name FROM providers') as $pr) $provs[(string)$pr['providerId']] = (string)$pr['name'];

    /* The names of the people who hold one, in one grouped query — capped per
       award, because this is a board to act on, not an export. */
    $who = [];
    foreach (db_all("SELECT c.awardId, c.memberId, c.grade, c.awardedOn, m.fullName, m.centre
                     FROM member_credentials c LEFT JOIN members m ON m.memberId = c.memberId
                     WHERE $where AND c.state = 'earned' ORDER BY c.awardedOn DESC", $args) as $r) {
        $a = (string)$r['awardId'];
        if (count($who[$a] ?? []) >= 12) continue;
        $who[$a][] = ['memberId' => (string)$r['memberId'], 'name' => (string)($r['fullName'] ?? ''),
                      'centre' => (string)($r['centre'] ?? ''), 'grade' => (string)$r['grade'],
                      'awardedOn' => (string)$r['awardedOn']];
    }

    $out = [];
    foreach ($tally as $awardId => $t) {
        $a = $awards[$awardId] ?? null;
        if (!$a) continue;
        $out[] = [
            'awardId' => (string)$awardId, 'title' => (string)$a['title'],
            'provider' => $provs[(string)$a['providerId']] ?? '', 'providerId' => (string)$a['providerId'],
            'kind' => (string)$a['kind'], 'kindLabel' => PRV_KIND_LABEL[(string)$a['kind']] ?? (string)$a['kind'],
            'level' => (string)$a['level'], 'free' => (int)$a['free'] === 1,
            'earned' => (int)($t['earned'] ?? 0), 'aiming' => (int)($t['aiming'] ?? 0),
            'registered' => (int)($t['registered'] ?? 0), 'missed' => (int)($t['missed'] ?? 0),
            'holders' => $who[$awardId] ?? [],
        ];
    }
    usort($out, static function ($a, $b) {
        if ($a['earned'] !== $b['earned']) return $b['earned'] <=> $a['earned'];
        return ($b['registered'] + $b['aiming']) <=> ($a['registered'] + $a['aiming']);
    });
    return ['ok' => true, 'awards' => $out, 'totals' => $totals, 'people' => $people,
            'states' => PRV_STATE_LABEL, 'kinds' => PRV_KIND_LABEL];
}

/** admin.providers.member — one person's credentials, for their record page. */
function admin_provider_member(array $p): array {
    $g = admin_cap_gate_any($p, ['curriculum', 'club', 'people']); if (!$g['ok']) return $g;
    $mid = (string)($p['memberId'] ?? '');
    $m = $mid !== '' ? db_row('SELECT * FROM members WHERE memberId = ?', [$mid]) : null;
    if (!$m) return ['ok' => false, 'error' => 'member_not_found'];
    if (function_exists('admin_centre_allowed') && !admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) {
        return ['ok' => false, 'error' => 'out_of_scope'];
    }
    $rows = db_all('SELECT * FROM member_credentials WHERE memberId = ? ORDER BY awardedOn DESC, updatedAt DESC', [$mid]);
    if (!$rows) return ['ok' => true, 'credentials' => [], 'states' => PRV_STATE_LABEL];
    $ids = array_values(array_unique(array_map(static fn($r) => (string)$r['awardId'], $rows)));
    $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $awards = [];
    foreach (db_all("SELECT * FROM provider_awards WHERE awardId IN $in", $ids) as $a) $awards[(string)$a['awardId']] = $a;
    $provs = [];
    foreach (db_all('SELECT providerId, name FROM providers') as $pr) $provs[(string)$pr['providerId']] = (string)$pr['name'];
    $today = gmdate('Y-m-d');
    $out = [];
    foreach ($rows as $c) {
        $a = $awards[(string)$c['awardId']] ?? null;
        $out[] = [
            'credId' => (string)$c['credId'], 'awardId' => (string)$c['awardId'],
            'title' => $a ? (string)$a['title'] : '(an award no longer in the registry)',
            'provider' => $provs[(string)$c['providerId']] ?? '',
            'state' => prv_shown_state($c, $today),
            'stateLabel' => PRV_STATE_LABEL[prv_shown_state($c, $today)] ?? 'Expired',
            'grade' => (string)$c['grade'], 'credentialRef' => (string)$c['credentialRef'],
            'evidenceUrl' => (string)$c['evidenceUrl'], 'awardedOn' => (string)$c['awardedOn'],
            'expiresOn' => (string)$c['expiresOn'], 'note' => (string)$c['note'],
        ];
    }
    return ['ok' => true, 'credentials' => $out, 'states' => PRV_STATE_LABEL];
}

/* ── The bodies this programme's own curriculum already points at ────────── */

/**
 * A starting registry, so the screen is not empty on day one.
 *
 * EVERY LINE HERE IS TRACEABLE TO THE CURRICULUM IN THIS REPOSITORY. The
 * bodies, the award names, which of our courses lead to each, and whether it
 * is free are all read from the material links our own lessons already carry
 * (api/_lib/seeds/curriculum-*.json) — nothing is remembered, guessed or
 * looked up. That matters because this data goes in front of children: a
 * certificate we told a child to aim for had better exist.
 *
 * What it deliberately does NOT carry is fees, grade names and exam dates.
 * Those change every year and differ by country, and a stale price in front
 * of a family is worse than no price. The coordinator adds this year's.
 *
 * Seeding is an explicit act (`admin.providers.seed`), never automatic, and
 * it is idempotent: a body or an award that is already there is left exactly
 * as the programme has edited it.
 */
function prv_seed_data(): array {
    return [
        ['name' => 'freeCodeCamp', 'url' => 'https://www.freecodecamp.org/', 'free' => 1, 'country' => '',
         'notes' => 'Free certifications, done online at the learner\'s own pace.',
         'awards' => [
            ['title' => 'Full Stack Developer certification', 'kind' => 'certificate', 'free' => 1,
             'courses' => ['Coding', 'Software Development', 'Technology & Applied Engineering'],
             'examNote' => 'Each certification needs its projects finished before the exam. freeCodeCamp awards several — add the others your courses lead to.'],
         ]],
        ['name' => 'Cisco Networking Academy', 'url' => 'https://www.netacad.com/', 'free' => 1, 'country' => '',
         'notes' => 'Free courses that carry a certificate and a Credly badge.',
         'awards' => [
            ['title' => 'Introduction to Cybersecurity', 'kind' => 'certificate', 'free' => 1,
             'courses' => ['Cybersecurity', 'Technology & Applied Engineering'],
             'examNote' => 'Free, with a certificate and a Credly badge.'],
         ]],
        ['name' => 'Elements of AI', 'url' => 'https://www.elementsofai.com/', 'free' => 1, 'country' => 'Finland',
         'notes' => 'University of Helsinki. Free, with a certificate.',
         'awards' => [
            ['title' => 'Elements of AI', 'kind' => 'certificate', 'free' => 1,
             'courses' => ['Artificial Intelligence', 'Social Media']],
         ]],
        ['name' => 'Google', 'url' => 'https://grow.google/', 'free' => 0, 'country' => '',
         'notes' => 'Digital Garage and Applied Digital Skills are free; the Career Certificates are paid.',
         'awards' => [
            ['title' => 'Digital Garage — Fundamentals of Digital Marketing', 'kind' => 'certificate', 'free' => 1,
             'courses' => ['Media & Content Strategy', 'Business Strategy, Operations & Administration']],
            ['title' => 'Applied Digital Skills', 'kind' => 'certificate', 'free' => 1,
             'courses' => ['Digital Content Creation', 'Social Media', 'Visual Storytelling']],
            ['title' => 'Google UX Design Certificate', 'kind' => 'certificate', 'free' => 0,
             'courses' => ['Tech Product Design'], 'examNote' => 'The professional route after this course.'],
            ['title' => 'Google Project Management Certificate', 'kind' => 'certificate', 'free' => 0,
             'courses' => ['Business Strategy, Operations & Administration', 'Product Management'],
             'examNote' => 'The professional route after this course.'],
         ]],
        ['name' => 'NBTE', 'url' => 'https://nbte.gov.ng/', 'free' => 0, 'country' => 'Nigeria',
         'notes' => 'National Board for Technical Education — the recognised Nigerian route for the making trades.',
         'awards' => [
            ['title' => 'National Skills Qualification', 'kind' => 'qualification', 'free' => 0,
             'courses' => ['Adire', 'Catering', 'Crafts', 'Creative & Performing Arts']],
         ]],
        ['name' => 'Trinity College London', 'url' => 'https://www.trinitycollege.com/', 'free' => 0, 'country' => 'United Kingdom',
         'notes' => 'Graded music and drama exams, with exam centres in Nigeria.',
         'awards' => [
            ['title' => 'Graded Examination in Drama & Speech', 'kind' => 'graded_exam', 'free' => 0,
             'courses' => ['Acting', 'Creative & Performing Arts', 'Stagecraft'],
             'examNote' => 'Exam centres in Lagos, Abuja and Port Harcourt.'],
            ['title' => 'Classical & Jazz graded music exam', 'kind' => 'graded_exam', 'free' => 0,
             'courses' => ['Drums', 'Saxophone', 'Violin', 'Vocal Training'],
             'examNote' => 'Exam centres in Lagos, Abuja and Port Harcourt.'],
         ]],
        ['name' => 'ABRSM', 'url' => 'https://www.abrsm.org/', 'free' => 0, 'country' => 'United Kingdom',
         'notes' => 'The alternative graded music route.',
         'awards' => [
            ['title' => 'Graded Music Exam', 'kind' => 'graded_exam', 'free' => 0,
             'courses' => ['Saxophone', 'Violin', 'Vocal Training']],
         ]],
    ];
}

/**
 * admin.providers.seed — fill the registry from the curriculum's own links.
 *
 * Idempotent by name: a body already in the registry keeps every edit the
 * programme has made to it, and only its MISSING awards are added. Pressing
 * it twice does nothing the first press did not.
 */
function admin_providers_seed(array $p): array {
    $g = admin_cap_gate($p, 'curriculum'); if (!$g['ok']) return $g;
    $by = (string)$g['requester']['memberId'];
    $now = now_iso();
    $added = ['providers' => 0, 'awards' => 0]; $kept = ['providers' => 0, 'awards' => 0];

    foreach (prv_seed_data() as $i => $b) {
        $slug = prv_slug((string)$b['name']);
        $row = db_row('SELECT * FROM providers WHERE slug = ? LIMIT 1', [$slug]);
        if ($row) {
            $kept['providers']++;
            $pid = (string)$row['providerId'];
        } else {
            $pid = 'PRV-' . strtoupper(rand_hex(5));
            db_insert('providers', ['providerId' => $pid, 'name' => (string)$b['name'], 'slug' => $slug,
                'country' => (string)$b['country'], 'url' => prv_url((string)$b['url']),
                'free' => (int)$b['free'], 'costNote' => '', 'notes' => (string)$b['notes'],
                'status' => 'active', 'position' => $i, 'createdAt' => $now, 'updatedAt' => $now]);
            $added['providers']++;
        }
        foreach ((array)$b['awards'] as $j => $a) {
            $have = db_row('SELECT awardId FROM provider_awards WHERE providerId = ? AND lower(title) = ? LIMIT 1',
                [$pid, mb_strtolower((string)$a['title'])]);
            if ($have) { $kept['awards']++; continue; }
            db_insert('provider_awards', ['awardId' => 'PAW-' . strtoupper(rand_hex(5)), 'providerId' => $pid,
                'title' => (string)$a['title'], 'kind' => (string)$a['kind'], 'level' => '',
                'courses' => json_encode(array_values((array)$a['courses']), JSON_UNESCAPED_SLASHES),
                'url' => '', 'examNote' => (string)($a['examNote'] ?? ''), 'costNote' => '',
                'free' => (int)$a['free'], 'validMonths' => 0, 'status' => 'active', 'position' => $j,
                'createdAt' => $now, 'updatedAt' => $now]);
            $added['awards']++;
        }
    }
    audit('providers.seed', $by, '', $added + ['kept' => $kept], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'added' => $added, 'kept' => $kept,
        'message' => $added['providers'] + $added['awards'] === 0
            ? 'Everything in the starter list is already here. Nothing was changed.'
            : 'Added ' . $added['providers'] . ' ' . ($added['providers'] === 1 ? 'body' : 'bodies')
              . ' and ' . $added['awards'] . ' ' . ($added['awards'] === 1 ? 'award' : 'awards')
              . '. Fees, grades and exam dates are not filled in — they change every year, so add this year\'s yourself.'];
}

/**
 * member.learn.boot — everything the Learn app needs to draw its first
 * screen, in ONE request.
 *
 * The shell was asking for three things separately, which is three HTTP round
 * trips, three PHP bootstraps and three session verifications before a child
 * on a phone sees a lesson. On shared hosting over a mobile connection that
 * is the slowest part of opening the app, and none of it is work: it is the
 * same route file, three times.
 *
 * What it must NOT do is couple their failures. School results and the
 * provider registry each had their own silence on purpose — a programme that
 * has set up neither must still get its lessons — so each part is caught
 * here and comes back null rather than taking the whole screen down with it.
 * The lessons are the exception: if those fail, the app has nothing to draw
 * and says so, which is what the caller already handles.
 */
function member_learn_boot(array $p): array {
    $mid = (string)($p['memberId'] ?? '');
    $cur = member_curriculum_list(['memberId' => $mid]);
    if (empty($cur['ok'])) return $cur;                 // no lessons: the app's own error state

    $soft = static function (callable $fn) {
        try { $r = $fn(); return !empty($r['ok']) ? $r : null; }
        catch (\Throwable $e) { return null; }          // never costs anybody their lessons
    };
    return ['ok' => true, 'curriculum' => $cur,
        'plan' => $soft(static fn() => function_exists('member_study_plan') ? member_study_plan(['memberId' => $mid]) : null),
        'awards' => $soft(static fn() => member_providers_mine(['memberId' => $mid]))];
}
