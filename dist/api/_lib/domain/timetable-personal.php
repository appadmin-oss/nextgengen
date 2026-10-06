<?php
/* ══ Personal timetables — the public Timetable Maker (/timetable, v5) ════════
 *
 * A personal timetable is somebody's own week: school lessons, study, chores
 * and whichever NGG sessions they copied in. It is never the Club's
 * timetable_slots, which belong to the centre and are edited in the Control
 * Room; writing a personal entry there would put a child's maths lesson on a
 * centre's published week.
 *
 * Two ways to keep one:
 *   - a member keeps it in member_timetables, behind their session;
 *   - anybody else keeps it behind an emailed link (timetable_links). The
 *     link's token is a bearer secret, so only its sha256 is stored and a
 *     link lapses after TTP_LINK_DAYS.
 *
 * Everything is validated here and nothing is trusted from the browser: the
 * maker also keeps its own copy in localStorage, which anybody can edit.
 */

const TTP_MAX_ENTRIES = 120;
const TTP_MAX_WEEKS = 52;
const TTP_MAX_ONEOFFS = 40;
const TTP_KINDS = ['class', 'study', 'activity', 'break'];
const TTP_LINK_DAYS = 30;
const TTP_LINKS_PER_EMAIL_DAY = 3;

/** One entry, checked field by field. A bad entry refuses the save; it is never repaired into something else. */
function ttp_entry($x, bool $once): array {
    if (!is_array($x)) return ['ok' => false, 'error' => 'bad_entry'];
    $title = trim((string)($x['title'] ?? ''));
    $place = trim((string)($x['place'] ?? ''));
    $start = (string)($x['start'] ?? '');
    $end = (string)($x['end'] ?? '');
    $days = array_values(array_unique(array_map('intval', is_array($x['days'] ?? null) ? $x['days'] : [])));
    sort($days);
    $hm = static fn(string $t) => preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', $t, $m) ? (int)$m[1] * 60 + (int)$m[2] : null;
    $a = $hm($start); $b = $hm($end);
    if ($title === '' || mb_strlen($title) > 60) return ['ok' => false, 'error' => 'bad_title'];
    if (mb_strlen($place) > 60) return ['ok' => false, 'error' => 'bad_place'];
    if ($a === null || $b === null || $b <= $a) return ['ok' => false, 'error' => 'bad_time'];
    if (!$days || array_filter($days, static fn($d) => $d < 1 || $d > 7)) return ['ok' => false, 'error' => 'bad_days'];
    if ($once && count($days) !== 1) return ['ok' => false, 'error' => 'bad_days'];
    $kind = (string)($x['kind'] ?? 'class');
    if (!in_array($kind, TTP_KINDS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    $e = ['id' => substr(preg_replace('/[^\w-]/', '', (string)($x['id'] ?? '')), 0, 16), 'title' => $title, 'days' => $days,
          'start' => $start, 'end' => $end, 'place' => $place, 'color' => max(0, min(7, (int)($x['color'] ?? 0))), 'kind' => $kind];
    if (!empty($x['official'])) { $e['official'] = true; $e['source'] = mb_substr(trim((string)($x['source'] ?? '')), 0, 40); $e['mine'] = !empty($x['mine']); }
    if ($once) $e['once'] = true;
    return ['ok' => true, 'entry' => $e];
}

/** The whole document: { settings, entries, exceptions } → a clean copy, or the first reason it is refused. */
function ttp_clean(array $p): array {
    $set = $p['settings'] ?? null;
    $entries = $p['entries'] ?? null;
    $ex = $p['exceptions'] ?? [];
    if (!is_array($set) || !is_array($entries)) return ['ok' => false, 'error' => 'bad_timetable'];
    if (count($entries) > TTP_MAX_ENTRIES) return ['ok' => false, 'error' => 'too_many_entries'];
    $clean = [];
    foreach ($entries as $x) { $r = ttp_entry($x, false); if (!$r['ok']) return $r; $clean[] = $r['entry']; }
    if (!is_array($ex) || count($ex) > TTP_MAX_WEEKS) return ['ok' => false, 'error' => 'too_many_weeks'];
    $weeks = [];
    foreach ($ex as $k => $w) {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$k) || !is_array($w)) return ['ok' => false, 'error' => 'bad_exceptions'];
        $skip = [];
        foreach ((array)($w['skip'] ?? []) as $sk => $on) {
            if ($on === true && preg_match('/^[\w-]{1,16}:[1-7]$/', (string)$sk)) $skip[(string)$sk] = true;
        }
        $once = [];
        $list = is_array($w['once'] ?? null) ? $w['once'] : [];
        if (count($list) > TTP_MAX_ONEOFFS) return ['ok' => false, 'error' => 'bad_exceptions'];
        foreach ($list as $x) { $r = ttp_entry($x, true); if (!$r['ok']) return $r; $once[] = $r['entry']; }
        if ($skip || $once) $weeks[(string)$k] = ['skip' => (object)$skip, 'once' => $once];
    }
    // Settings are the maker's own; kept as given, but bounded so a document cannot grow without limit.
    $s = [];
    foreach ($set as $k => $v) {
        if (!is_string($k) || strlen($k) > 24 || !(is_scalar($v) || $v === null)) continue;
        $s[$k] = is_string($v) ? mb_substr($v, 0, 120) : $v;
    }
    if (count($s) > 40) return ['ok' => false, 'error' => 'bad_settings'];
    return ['ok' => true, 'doc' => ['settings' => (object)$s, 'entries' => $clean, 'exceptions' => (object)$weeks]];
}

/** A stored row as the browser reads it: { settings, entries, exceptions, updatedAt }, or null. */
function ttp_out(?array $row): ?array {
    if (!$row) return null;
    $d = json_decode((string)$row['doc'], true);
    if (!is_array($d)) return null;
    return ['settings' => $d['settings'] ?? [], 'entries' => $d['entries'] ?? [], 'exceptions' => $d['exceptions'] ?? [], 'updatedAt' => (string)$row['updatedAt']];
}

/** member.myTimetable — the signed-in member's own week, or null. */
function member_my_timetable(array $p): array {
    $id = (string)($p['memberId'] ?? '');
    return ['ok' => true, 'timetable' => ttp_out(db_row('SELECT doc, updatedAt FROM member_timetables WHERE memberId = ?', [$id]))];
}

/**
 * member.myTimetable.save — replace it, but only when nobody saved since the
 * copy the browser started from (baseUpdatedAt). A second tab or the family
 * app saving in between is a conflict for the person to see, never something
 * to overwrite on their behalf.
 */
function member_my_timetable_save(array $p): array {
    $id = (string)($p['memberId'] ?? '');
    if ($id === '' || !db_row('SELECT memberId FROM members WHERE memberId = ?', [$id])) return ['ok' => false, 'error' => 'not_found'];
    $c = ttp_clean($p);
    if (!$c['ok']) return $c;
    $cur = db_row('SELECT doc, updatedAt FROM member_timetables WHERE memberId = ?', [$id]);
    if ($cur && (string)($p['baseUpdatedAt'] ?? '') !== (string)$cur['updatedAt']) {
        return ['ok' => false, 'error' => 'conflict', 'server' => ttp_out($cur)];
    }
    $now = now_iso();
    // Two saves in one second must still differ, or the second would match a stale base.
    if ($cur && $now <= (string)$cur['updatedAt']) $now = gmdate('Y-m-d\TH:i:s\Z', strtotime((string)$cur['updatedAt']) + 1);
    $json = json_encode($c['doc'], JSON_UNESCAPED_UNICODE);
    if ($cur) db_exec('UPDATE member_timetables SET doc = ?, updatedAt = ? WHERE memberId = ?', [$json, $now, $id]);
    else db_insert('member_timetables', ['memberId' => $id, 'doc' => $json, 'updatedAt' => $now]);
    return ['ok' => true, 'updatedAt' => $now];
}

/** A live link's row from its token, or null when it is malformed, unknown, revoked or lapsed. */
function ttp_link_row(string $k): ?array {
    if (!preg_match('/^[a-f0-9]{64}$/', $k)) return null;
    $row = db_row('SELECT * FROM timetable_links WHERE tokenHash = ?', [hash('sha256', $k)]);
    if (!$row || (string)$row['revokedAt'] !== '' || (string)$row['expiresAt'] < now_iso()) return null;
    return $row;
}

/**
 * public.timetableSave — keep a timetable without an account.
 *   with `k`:     save through a live link;
 *   with `email`: mint a link, store only its hash, and email it. At most
 *                 TTP_LINKS_PER_EMAIL_DAY a day per address, so the form cannot
 *                 be used to send mail to somebody else's inbox at will.
 * The token goes back to the browser that made it, so that browser can keep
 * saving through it; nobody else ever sees it but the inbox.
 */
function public_timetable_save(array $p): array {
    $c = ttp_clean($p);
    if (!$c['ok']) return $c;
    $json = json_encode($c['doc'], JSON_UNESCAPED_UNICODE);
    $now = now_iso();
    $k = (string)($p['k'] ?? '');
    if ($k !== '') {
        if (!ttp_link_row($k)) return ['ok' => false, 'error' => 'link_expired'];
        db_exec('UPDATE timetable_links SET doc = ?, updatedAt = ? WHERE tokenHash = ?', [$json, $now, hash('sha256', $k)]);
        return ['ok' => true, 'updatedAt' => $now];
    }
    $email = strtolower(trim((string)($p['email'] ?? '')));
    if (strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
    $since = gmdate('Y-m-d\TH:i:s\Z', time() - 86400);
    if ((int)(db_row('SELECT COUNT(*) c FROM timetable_links WHERE email = ? AND createdAt > ?', [$email, $since])['c'] ?? 0) >= TTP_LINKS_PER_EMAIL_DAY) {
        return ['ok' => false, 'error' => 'too_many_links'];
    }
    $token = bin2hex(random_bytes(32));
    db_insert('timetable_links', ['tokenHash' => hash('sha256', $token), 'email' => $email, 'doc' => $json, 'createdAt' => $now, 'updatedAt' => $now,
        'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', time() + TTP_LINK_DAYS * 86400), 'revokedAt' => '']);
    $url = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/') . '/timetable?k=' . $token;
    $title = (string)($c['doc']['settings']->title ?? 'My week');
    $html = email_template([
        'eyebrow' => 'Timetable Maker', 'title' => 'Your timetable: ' . esc_html($title),
        'intro' => 'Open this link on any phone or computer to keep editing. It works for ' . TTP_LINK_DAYS . ' days; saving again gives you a fresh one.',
        'ctaLabel' => 'Open my timetable', 'ctaUrl' => $url,
        'footNote' => 'Somebody saved a timetable from nextgengenius.ng with this address. If it was not you, ignore this email and the link will lapse.',
    ]);
    $sent = send_mail($email, 'Your timetable', $html);
    return ['ok' => true, 'k' => $token, 'sent' => $sent, 'updatedAt' => $now, 'masked' => mask_email($email)];
}

/** public.timetableLoad — the timetable behind a live link, or link_expired. */
function public_timetable_load(array $p): array {
    $row = ttp_link_row((string)($p['k'] ?? ''));
    if (!$row) return ['ok' => false, 'error' => 'link_expired'];
    return ['ok' => true, 'timetable' => ttp_out($row), 'email' => mask_email((string)$row['email'])];
}

/**
 * public.timetableTerm — this term's first and last day, for the calendar
 * file's defaults. Read from the programme calendar, never typed into the
 * page; ['', ''] when no calendar is set.
 */
function public_timetable_term(array $p): array {
    $term = ['', ''];
    $cal = member_programme_settings();
    if (!empty($cal['enabled'])) $term = programme_term_bounds(gmdate('Y-m-d'), $cal);
    return ['ok' => true, 'start' => (string)$term[0], 'end' => (string)$term[1]];
}
