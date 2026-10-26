<?php
declare(strict_types=1);

/**
 * Summer School Portal v3 — the coordinator's whole season on one screen.
 *
 * The older summer ops each answer one question for one panel. The v3 portal
 * opens on Today ("who is in, who is not, and what to do about it"), and every
 * figure on it has to agree with the figure one tap further in: "9 have
 * stopped" on Today, a Participants view of exactly those nine, and the same
 * nine in the register. So the roster is derived ONCE per request
 * (ss3_roster) and every view counts that derivation, rather than each view
 * writing its own SQL for the same idea.
 *
 * Bounded reads, never per-row queries: the edition's roster (capped at
 * ROSTER_SCAN_MAX), its attendance grouped by child, today's marks, the
 * consents for the roster in chunks. Centre scope is applied on the way in
 * (CLAUDE.md §4) — a scoped coordinator's counts, search and lists are all
 * their own centres'.
 *
 * Vocabulary (CLAUDE.md §5): an EDITION is the season (`summer_cohorts`, whose
 * id every summer table carries as `cohortId`); a GROUP is a class within it;
 * a PARTICIPANT is a child in it. Nothing here says "cohort" or "student" to
 * the person reading the screen.
 */

/** Attendance a participant needs to graduate into NGG — and for a certificate. */
const SUMMER_GRADUATE_RATE = 70;
/** Under this rate a child is "at risk": worth a call to the guardian this week. */
const SS3_RISK_RATE = 50;
const SS3_PAGE = 25;
const SS3_SEARCH_MAX = 6;
const SS3_RECENT_MAX = 5;
/** The register lists this many by name; the rest are counted and exportable. */
const SS3_REGISTER_SHOW = 60;
/** Blank cards below this and walk-ins will soon be turned away. */
const SS3_CARD_LOW = 15;
/** At most this many joining invoices in one press. */
const SS3_INVOICE_MAX = 200;
const SS3_VIEWS = ['all', 'in', 'late', 'absent', 'stopped', 'risk', 'nogroup', 'unverified', 'consent'];
const SS3_SORTS = ['name', 'rate', 'centre', 'recent'];
const SS3_GRAD_STAGES = ['ready', 'promoted', 'invoiced', 'paid', 'all'];

/** The edition asked for, else the active one, else the latest. Never creates one on a read. */
function ss3_edition(string $id = ''): ?array {
    if ($id !== '') { $e = db_row('SELECT * FROM summer_cohorts WHERE cohortId = ? LIMIT 1', [$id]); if ($e) return $e; }
    return summer_current_cohort() ?: (db_row('SELECT * FROM summer_cohorts ORDER BY id DESC LIMIT 1') ?: null);
}

/** `AND col IN (…)` for a scoped requester, '' for an unscoped one. */
function ss3_scope_sql(?array $names, string $col, array &$args): string {
    if ($names === null) return '';
    if (!$names) return ' AND 1 = 0';
    foreach ($names as $n) $args[] = $n;
    return " AND $col IN (" . implode(',', array_fill(0, count($names), '?')) . ')';
}

/**
 * The edition's programme days: all of them, and those up to today.
 *
 * With the calendar on, the days the edition runs on it — the honest
 * denominator, whether or not anybody scanned. With it off, every calendar
 * day would count and every rate would read as a collapse, so the days that
 * actually have a register are used instead, and the screen says which.
 */
function ss3_days(array $ed, string $today): array {
    $start = substr((string)($ed['startDate'] ?? ''), 0, 10);
    $end = substr((string)($ed['endDate'] ?? ''), 0, 10);
    $cfg = programme_settings();
    if (!empty($cfg['enabled']) && $start !== '' && $end !== '') {
        $cal = array_merge($cfg, ['startDate' => $start, 'endDate' => $end]);
        $all = programme_days_between($start, $end, $cal);
        $sofar = array_values(array_filter($all, static fn($d) => $d <= $today));
        return ['all' => $all, 'sofar' => $sofar, 'basis' => 'calendar', 'isDay' => in_array($today, $all, true)];
    }
    $seen = array_map(static fn($r) => (string)$r['date'], db_all('SELECT DISTINCT date FROM attendance WHERE cohortId = ? AND date <= ? ORDER BY date', [(string)$ed['cohortId'], $today]));
    return ['all' => $seen, 'sofar' => $seen, 'basis' => 'register', 'isDay' => programme_is_day($today)];
}

/**
 * Every participant in the edition (in scope), each with what the screens need:
 * rate, today's mark, stopped, consent. One pass, a fixed number of queries.
 */
function ss3_roster(array $req, array $ed, string $today, array $days): array {
    $args = [(string)$ed['cohortId']];
    $scope = ss3_scope_sql(admin_centre_names_in_scope($req), 'centre', $args);
    $rows = db_all("SELECT studentId, fullName, displayId, token, centre, track, groupId, status, regStatus, age, dob,
                           guardianName, guardianPhone, parentEmail, photoUrl, enrolledAt
                    FROM summer_students WHERE cohortId = ?$scope ORDER BY fullName LIMIT " . ROSTER_SCAN_MAX, $args);
    $sofar = $days['sofar'];
    $past = array_values(array_filter($sofar, static fn($d) => $d < $today));
    $tail = array_slice($past, -ATT_STOPPED_RUN);

    $present = []; $last = [];
    foreach (db_all('SELECT studentId, COUNT(DISTINCT date) n, MAX(date) d FROM attendance WHERE cohortId = ? AND date <= ? GROUP BY studentId', [(string)$ed['cohortId'], $today]) as $a) {
        $present[(string)$a['studentId']] = (int)$a['n']; $last[(string)$a['studentId']] = (string)$a['d'];
    }
    $recent = [];
    if (count($tail) === ATT_STOPPED_RUN) {
        foreach (db_all('SELECT DISTINCT studentId FROM attendance WHERE cohortId = ? AND date >= ? AND date < ?', [(string)$ed['cohortId'], $tail[0], $today]) as $a) $recent[(string)$a['studentId']] = true;
    }
    $marks = [];
    foreach (db_all('SELECT studentId, status, lateMinutes, checkInAt, checkOutAt FROM attendance WHERE date = ? AND cohortId = ?', [$today, (string)$ed['cohortId']]) as $m) $marks[(string)$m['studentId']] = $m;
    $consent = roster_consent_states(array_column($rows, 'studentId'));
    $denom = count($sofar);

    $out = [];
    foreach ($rows as $r) {
        $id = (string)$r['studentId'];
        $active = (string)$r['status'] === 'active';
        $reg = (string)($r['regStatus'] ?? 'verified') ?: 'verified';
        $n = $present[$id] ?? 0;
        $m = $marks[$id] ?? null;
        $todayMark = 'off';
        if ($active && $reg === 'verified' && $days['isDay']) {
            if ($m) $todayMark = (string)($m['checkOutAt'] ?? '') !== '' ? 'out' : (((string)$m['status'] === 'late') ? 'late' : 'in');
            else $todayMark = 'absent';
        } elseif ($m) {
            $todayMark = (string)($m['checkOutAt'] ?? '') !== '' ? 'out' : (((string)$m['status'] === 'late') ? 'late' : 'in');
        }
        $out[] = [
            'id' => $id, 'name' => (string)$r['fullName'], 'displayId' => (string)($r['displayId'] ?? ''),
            'centre' => (string)($r['centre'] ?? ''), 'track' => (string)($r['track'] ?? ''), 'groupId' => (string)($r['groupId'] ?? ''),
            'status' => (string)$r['status'], 'reg' => $reg, 'age' => ($r['age'] === null || $r['age'] === '') ? null : (int)$r['age'],
            'guardian' => (string)($r['guardianName'] ?? ''), 'phone' => (string)($r['guardianPhone'] ?? ''),
            'email' => (string)($r['parentEmail'] ?? ''), 'photoUrl' => normalize_image_url((string)($r['photoUrl'] ?? '')),
            'token' => (string)($r['token'] ?? ''), 'enrolledAt' => (string)($r['enrolledAt'] ?? ''),
            'days' => $n, 'rate' => $denom > 0 ? (int)round(min($n, $denom) / $denom * 100) : null, 'lastSeen' => $last[$id] ?? '',
            'today' => $todayMark,
            'inAt' => $m ? substr((string)$m['checkInAt'], 11, 5) : '', 'lateMin' => $m ? (int)($m['lateMinutes'] ?? 0) : 0,
            'outAt' => $m ? substr((string)($m['checkOutAt'] ?? ''), 11, 5) : '',
            // Came, then stopped: present at least once, absent for the whole closing run.
            'stopped' => $active && $reg === 'verified' && count($tail) === ATT_STOPPED_RUN && $n > 0 && !isset($recent[$id]) && !$m,
            'consent' => $consent[$id] ?? 'incomplete',
        ];
    }
    return $out;
}

function ss3_is_live(array $r): bool { return $r['status'] === 'active' && $r['reg'] === 'verified'; }

/** Does a roster row belong in a named view? One definition for the tab, its count and Today's link. */
function ss3_in_view(array $r, string $view): bool {
    switch ($view) {
        case 'in':         return ss3_is_live($r) && in_array($r['today'], ['in', 'late', 'out'], true);
        case 'late':       return ss3_is_live($r) && $r['today'] === 'late';
        case 'absent':     return ss3_is_live($r) && $r['today'] === 'absent';
        case 'stopped':    return $r['stopped'];
        case 'risk':       return ss3_is_live($r) && $r['rate'] !== null && $r['rate'] < SS3_RISK_RATE;
        case 'nogroup':    return $r['status'] === 'active' && $r['groupId'] === '';
        case 'unverified': return $r['status'] === 'active' && $r['reg'] !== 'verified';
        case 'consent':    return $r['status'] === 'active' && $r['consent'] !== 'complete';
        default:           return true;
    }
}

function ss3_groups(array $ed, array $req): array {
    $out = [];
    $leads = [];
    foreach (db_all('SELECT volunteerId, fullName FROM volunteers') as $v) $leads[(string)$v['volunteerId']] = (string)$v['fullName'];
    $centres = [];
    foreach (db_all('SELECT centreId, name FROM centres') as $c) $centres[(string)$c['centreId']] = (string)$c['name'];
    $names = admin_centre_names_in_scope($req);
    foreach (db_all("SELECT * FROM summer_groups WHERE cohortId = ? AND status != 'archived' ORDER BY code", [(string)$ed['cohortId']]) as $g) {
        $cn = $centres[(string)$g['centreId']] ?? '';
        if ($names !== null && !in_array($cn, $names, true)) continue;
        $out[(string)$g['groupId']] = ['id' => (string)$g['groupId'], 'code' => (string)$g['code'], 'name' => (string)$g['name'],
            'centre' => $cn, 'track' => (string)($g['track'] ?? ''), 'lead' => $leads[(string)$g['leadId']] ?? '',
            'cap' => (int)($g['capacity'] ?? 0), 'time' => (string)($g['meetTime'] ?? '')];
    }
    return $out;
}

/** The figures every screen's nav badges show — computed from the one roster. */
function ss3_badges(array $roster, array $ed): array {
    $b = ['stopped' => 0, 'regOpen' => 0, 'noGroup' => 0, 'consent' => 0, 'incidents' => 0, 'cardsLow' => 0, 'blank' => 0];
    foreach ($roster as $r) {
        if ($r['stopped']) $b['stopped']++;
        if ($r['status'] === 'active' && in_array($r['reg'], ['parent_pending', 'self_pending'], true)) $b['regOpen']++;
        if (ss3_in_view($r, 'nogroup')) $b['noGroup']++;
        if (ss3_in_view($r, 'consent')) $b['consent']++;
    }
    $b['incidents'] = (int)(db_row("SELECT COUNT(*) c FROM summer_incidents WHERE cohortId = ? AND status = 'open' AND toldAt = ''", [(string)$ed['cohortId']])['c'] ?? 0);
    $b['blank'] = (int)(db_row("SELECT COUNT(*) c FROM qr_codes WHERE status = 'blank'")['c'] ?? 0);
    $b['cardsLow'] = $b['blank'] < SS3_CARD_LOW ? 1 : 0;
    return $b;
}

/**
 * admin.summer.portal — one read per screen of the v3 portal.
 * `view`: boot | today | people | child | register | graduates
 */
function admin_summer_portal(array $p): array {
    $view = (string)($p['view'] ?? 'boot');
    if ($view === 'graduates') return admin_summer_graduates($p);
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $req = $g['requester'];
    // A parked bulk act whose tab was closed still commits (pending.php).
    pending_commit_due(5);
    $ed = ss3_edition(trim((string)($p['editionId'] ?? '')));
    $today = attendance_today();
    $caps = member_effective_caps($req);
    $base = ['today' => $today, 'caps' => array_values(array_intersect($caps, ['summer', 'club', 'fees', 'people', 'checkin'])),
             'graduateRate' => SUMMER_GRADUATE_RATE, 'riskRate' => SS3_RISK_RATE, 'stoppedRun' => ATT_STOPPED_RUN];
    if (!$ed) return ['ok' => true, 'edition' => null] + $base;
    $days = ss3_days($ed, $today);
    $roster = ss3_roster($req, $ed, $today, $days);
    $groups = ss3_groups($ed, $req);
    $edition = [
        'id' => (string)$ed['cohortId'], 'name' => (string)($ed['name'] ?: ('Summer ' . $ed['year'])), 'status' => (string)$ed['status'],
        'startDate' => substr((string)($ed['startDate'] ?? ''), 0, 10), 'endDate' => substr((string)($ed['endDate'] ?? ''), 0, 10),
        'dayN' => count($days['sofar']), 'days' => count($days['all']), 'basis' => $days['basis'], 'isDay' => $days['isDay'],
    ];
    $out = ['ok' => true, 'edition' => $edition] + $base;
    $out['badges'] = ss3_badges($roster, $ed);
    $out['groups'] = array_values($groups);
    $out['centres'] = array_values(array_unique(array_filter(array_column($roster, 'centre'))));
    sort($out['centres']);
    $out['me'] = ['name' => (string)($req['fullName'] ?? ''), 'id' => (string)$req['memberId']];

    if ($view === 'today')    return $out + ss3_view_today($roster, $groups, $days, $ed, $today);
    if ($view === 'people')   return $out + ss3_view_people($p, $roster, $groups);
    if ($view === 'register') return $out + ss3_view_register($p, $roster, $groups, $days, $ed, $today);
    if ($view === 'child')    return $out + ss3_view_child($p, $req, $roster, $groups, $days, $ed);
    return $out;
}

function ss3_view_today(array $roster, array $groups, array $days, array $ed, string $today): array {
    $live = array_values(array_filter($roster, 'ss3_is_live'));
    $c = ['expected' => count($live), 'in' => 0, 'late' => 0, 'out' => 0, 'absent' => 0];
    foreach ($live as $r) { if (isset($c[$r['today']])) $c[$r['today']]++; }
    $byCentre = [];
    foreach ($live as $r) {
        $k = $r['centre'] ?: '(no centre)';
        $byCentre[$k] = $byCentre[$k] ?? ['name' => $k, 'here' => 0, 'of' => 0];
        $byCentre[$k]['of']++;
        if (in_array($r['today'], ['in', 'late', 'out'], true)) $byCentre[$k]['here']++;
    }
    ksort($byCentre);
    // The edition's days so far, each with how many were in. One grouped query.
    $series = [];
    $span = array_slice($days['sofar'], -20);
    if ($span) {
        $per = [];
        foreach (db_all('SELECT date, COUNT(DISTINCT studentId) n FROM attendance WHERE cohortId = ? AND date >= ? AND date <= ? GROUP BY date', [(string)$ed['cohortId'], $span[0], $today]) as $x) $per[(string)$x['date']] = (int)$x['n'];
        foreach ($span as $d) $series[] = ['date' => $d, 'n' => $per[$d] ?? 0];
    }
    // Groups with the lowest attendance first: the ones a lead should hear about.
    $gRate = [];
    foreach ($live as $r) {
        if ($r['groupId'] === '' || !isset($groups[$r['groupId']]) || $r['rate'] === null) continue;
        $gRate[$r['groupId']][] = $r;
    }
    $watch = [];
    foreach ($gRate as $gid => $rs) {
        $here = count(array_filter($rs, static fn($r) => in_array($r['today'], ['in', 'late', 'out'], true)));
        $watch[] = $groups[$gid] + ['rate' => (int)round(array_sum(array_column($rs, 'rate')) / max(1, count($rs))), 'n' => count($rs), 'here' => $here];
    }
    usort($watch, static fn($a, $b) => $a['rate'] <=> $b['rate']);
    $count = static fn($v) => count(array_filter($roster, static fn($r) => ss3_in_view($r, $v)));
    return ['live' => $c, 'byCentre' => array_values($byCentre), 'series' => $series,
            'counts' => ['stopped' => $count('stopped'), 'risk' => $count('risk'), 'nogroup' => $count('nogroup'),
                         'unverified' => $count('unverified'), 'consent' => $count('consent')],
            'stoppedNames' => array_slice(array_map(static fn($r) => $r['name'], array_values(array_filter($roster, static fn($r) => $r['stopped']))), 0, 6),
            'watch' => array_slice($watch, 0, 4)];
}

/** People: a server-filtered, faceted, paged roster. Unknown filters fall back, never error. */
function ss3_view_people(array $p, array $roster, array $groups): array {
    $view = in_array((string)($p['pview'] ?? 'all'), SS3_VIEWS, true) ? (string)$p['pview'] : 'all';
    $q = trim(mb_strtolower((string)($p['q'] ?? '')));
    $want = [];
    foreach (['centre', 'group', 'track', 'today'] as $f) { $v = trim((string)($p['f_' . $f] ?? '')); if ($v !== '') $want[$f] = $v; }
    $val = static function (array $r, string $f): string {
        if ($f === 'group') return $r['groupId'];
        if ($f === 'today') return $r['today'];
        return (string)$r[$f];
    };
    $matchQ = static function (array $r) use ($q): bool {
        if ($q === '') return true;
        foreach (preg_split('/\s+/', $q) as $w) {
            $hay = mb_strtolower($r['name'] . ' ' . $r['displayId'] . ' ' . $r['id'] . ' ' . $r['guardian'] . ' ' . preg_replace('/\D+/', '', $r['phone']));
            if (mb_strpos($hay, $w) === false) return false;
        }
        return true;
    };
    $pass = static function (array $r, ?string $skip = null) use ($want, $val, $matchQ, $view): bool {
        if (!ss3_in_view($r, $view) || !$matchQ($r)) return false;
        foreach ($want as $f => $w) if ($f !== $skip && $val($r, $f) !== $w) return false;
        return true;
    };
    $facets = [];
    foreach (['centre', 'group', 'track', 'today'] as $f) {
        $cn = [];
        foreach ($roster as $r) { if (!$pass($r, $f)) continue; $v = $val($r, $f); if ($v === '') continue; $cn[$v] = ($cn[$v] ?? 0) + 1; }
        ksort($cn);
        $facets[$f] = $cn;
    }
    // Each tab's count with the search and facets applied, so "Stopped (4)" means four of these.
    $views = [];
    foreach (SS3_VIEWS as $v) {
        $views[$v] = 0;
        foreach ($roster as $r) {
            if (!ss3_in_view($r, $v) || !$matchQ($r)) continue;
            $ok = true; foreach ($want as $f => $w) if ($val($r, $f) !== $w) { $ok = false; break; }
            if ($ok) $views[$v]++;
        }
    }
    $kept = array_values(array_filter($roster, static fn($r) => $pass($r)));
    $sort = in_array((string)($p['sort'] ?? ''), SS3_SORTS, true) ? (string)$p['sort'] : 'name';
    usort($kept, static function ($a, $b) use ($sort) {
        if ($sort === 'rate') return ($a['rate'] ?? 101) <=> ($b['rate'] ?? 101) ?: strcasecmp($a['name'], $b['name']);
        if ($sort === 'centre') return strcasecmp($a['centre'], $b['centre']) ?: strcasecmp($a['name'], $b['name']);
        if ($sort === 'recent') return strcmp($b['enrolledAt'], $a['enrolledAt']);
        return strcasecmp($a['name'], $b['name']);
    });
    $total = count($kept);
    if (!empty($p['export'])) {
        $rows = $kept;
        $page = 0;
    } else {
        $pages = max(1, (int)ceil($total / SS3_PAGE));
        $page = max(0, min($pages - 1, (int)($p['page'] ?? 0)));
        $rows = array_slice($kept, $page * SS3_PAGE, SS3_PAGE);
    }
    $rows = array_map(static fn($r) => ss3_public_row($r, $groups), $rows);
    return ['rows' => $rows, 'total' => $total, 'page' => $page, 'pageSize' => SS3_PAGE, 'views' => $views,
            'facets' => $facets, 'applied' => ['pview' => $view, 'sort' => $sort] + $want];
}

/** What leaves the server for a list row: no token, no full email. */
function ss3_public_row(array $r, array $groups): array {
    $g = $groups[$r['groupId']] ?? null;
    $o = $r;
    unset($o['token']);
    $o['group'] = $g ? $g['name'] : '';
    $o['groupCode'] = $g ? $g['code'] : '';
    $o['hasEmail'] = $r['email'] !== '' && filter_var($r['email'], FILTER_VALIDATE_EMAIL) !== false;
    unset($o['email']);
    return $o;
}

function ss3_view_register(array $p, array $roster, array $groups, array $days, array $ed, string $today): array {
    $chips = array_slice($days['sofar'], -10);
    if ($days['isDay'] && !in_array($today, $chips, true)) { $chips[] = $today; $chips = array_slice($chips, -10); }
    $date = (string)($p['date'] ?? '');
    if (!in_array($date, $chips, true)) $date = $chips ? $chips[count($chips) - 1] : $today;
    $rf = in_array((string)($p['rf'] ?? ''), ['in', 'late', 'absent', 'stopped'], true) ? (string)$p['rf'] : 'absent';
    $centre = trim((string)($p['centre'] ?? ''));
    $marks = [];
    foreach (db_all('SELECT studentId, status, lateMinutes, checkInAt, checkOutAt FROM attendance WHERE date = ? AND cohortId = ?', [$date, (string)$ed['cohortId']]) as $m) $marks[(string)$m['studentId']] = $m;
    $k = ['in' => 0, 'late' => 0, 'absent' => 0, 'stopped' => 0];
    $list = [];
    $live = 0;
    foreach ($roster as $r) {
        if (!ss3_is_live($r)) continue;
        if ($centre !== '' && $r['centre'] !== $centre) continue;
        $live++;
        $m = $marks[$r['id']] ?? null;
        $st = $m ? (((string)$m['status'] === 'late') ? 'late' : 'in') : 'absent';
        if ($st === 'late') $k['late']++;
        if ($st !== 'absent') $k['in']++; else $k['absent']++;
        if ($r['stopped'] && $date === $today) $k['stopped']++;
        $hit = $rf === 'stopped' ? ($r['stopped'] && $date === $today) : ($rf === 'in' ? $st !== 'absent' : $st === $rf);
        if ($hit) $list[] = ss3_public_row($r, $groups) + ['mark' => $st, 'markAt' => $m ? substr((string)$m['checkInAt'], 11, 5) : '',
                                                          'markLate' => $m ? (int)($m['lateMinutes'] ?? 0) : 0,
                                                          'markOut' => $m ? substr((string)($m['checkOutAt'] ?? ''), 11, 5) : ''];
    }
    return ['date' => $date, 'dayChips' => $chips, 'isToday' => $date === $today, 'rf' => $rf, 'live' => $live,
            'kpis' => $k, 'list' => array_slice($list, 0, SS3_REGISTER_SHOW), 'listTotal' => count($list),
            'programmeDay' => in_array($date, $days['all'], true) || $days['basis'] === 'register'];
}

/** One child, for the drawer. Opening it is also what "recent" remembers. */
function ss3_view_child(array $p, array $req, array $roster, array $groups, array $days, array $ed): array {
    $id = trim((string)($p['studentId'] ?? ''));
    $r = null;
    foreach ($roster as $x) if ($x['id'] === $id) { $r = $x; break; }
    if (!$r) {
        // Another edition's child, still in scope: the drawer opens from search too.
        $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [$id]);
        if (!$s || !admin_centre_allowed($req, (string)($s['centre'] ?? ''))) return ['child' => null, 'error' => 'not_found'];
        $other = ss3_edition((string)$s['cohortId']);
        $d2 = $other ? ss3_days($other, attendance_today()) : ['all' => [], 'sofar' => [], 'basis' => 'register', 'isDay' => false];
        foreach ($other ? ss3_roster($req, $other, attendance_today(), $d2) : [] as $x) if ($x['id'] === $id) { $r = $x; break; }
        if (!$r) return ['child' => null, 'error' => 'not_found'];
        $groups = $other ? ss3_groups($other, $req) : [];
        $days = $d2;
    }
    $consents = [];
    foreach (db_all('SELECT type, status, createdAt FROM consents WHERE studentId = ? ORDER BY id', [$id]) as $c) $consents[(string)$c['type']] = ['status' => (string)$c['status'], 'at' => (string)$c['createdAt']];
    $cons = [];
    foreach (CONSENT_TYPES as $t => $meta) $cons[] = ['type' => $t, 'label' => (string)$meta['label'], 'required' => $meta['p'] === 0,
        'mustAnswer' => !empty($meta['mustAnswer']), 'status' => $consents[$t]['status'] ?? '', 'at' => $consents[$t]['at'] ?? ''];
    $seen = [];
    foreach (db_all('SELECT date, status FROM attendance WHERE studentId = ? ORDER BY date DESC LIMIT 60', [$id]) as $a) $seen[(string)$a['date']] = (string)($a['status'] ?: 'present');
    $strip = [];
    foreach (array_slice($days['sofar'], -ATT_PATTERN_DAYS) as $d) $strip[] = ['date' => $d, 'mark' => isset($seen[$d]) ? ($seen[$d] === 'late' ? 'late' : 'in') : 'absent'];
    $card = db_row("SELECT token, status, expiresAt, assignedAt FROM qr_codes WHERE studentId = ? AND status = 'assigned' LIMIT 1", [$id]);
    $incidents = db_all('SELECT incidentId, kind, severity, note, status, toldAt, createdAt FROM summer_incidents WHERE studentId = ? ORDER BY id DESC LIMIT 10', [$id]);
    $cert = db_row('SELECT certId, issuedAt, revokedAt FROM student_certs WHERE studentId = ? LIMIT 1', [$id]);
    // Remember it for the palette's "recent" — per staff member, last few only.
    db_exec('DELETE FROM summer_recent WHERE staffId = ? AND studentId = ?', [(string)$req['memberId'], $id]);
    db_insert('summer_recent', ['staffId' => (string)$req['memberId'], 'studentId' => $id, 'at' => now_iso()]);
    $keep = db_all('SELECT id FROM summer_recent WHERE staffId = ? ORDER BY at DESC, id DESC LIMIT ' . SS3_RECENT_MAX, [(string)$req['memberId']]);
    if ($keep) {
        $ids = array_column($keep, 'id');
        db_exec('DELETE FROM summer_recent WHERE staffId = ? AND id NOT IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([(string)$req['memberId']], $ids));
    }
    $row = ss3_public_row($r, $groups);
    $row['email'] = $r['email'];
    return ['child' => $row + ['consents' => $cons, 'strip' => $strip,
        'card' => $card ? ['last4' => substr((string)$card['token'], -4), 'expiresAt' => (string)($card['expiresAt'] ?? ''), 'assignedAt' => (string)($card['assignedAt'] ?? '')] : null,
        'incidents' => $incidents, 'cert' => $cert ?: null]];
}

/**
 * admin.summer.search — the palette's children. Name, printed ID, internal ID,
 * or the last four (or more) digits of a card. Never the whole roster.
 */
function admin_summer_search(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $q = trim(mb_substr((string)($p['q'] ?? ''), 0, 60));
    if ($q === '') return ['ok' => true, 'children' => []];
    $args = [];
    $scope = ss3_scope_sql(admin_centre_names_in_scope($g['requester']), 's.centre', $args);
    [$tSql, $tArgs] = sql_text_search($q, ['s.fullName', 's.displayId', 's.studentId']);
    $where = $tSql !== '' ? '(' . $tSql . ')' : '1 = 0';
    $wArgs = $tArgs;
    $digits = preg_replace('/\D+/', '', $q);
    if (strlen($digits) >= 4 && strlen($digits) === strlen(preg_replace('/\s+/', '', $q))) {
        // The last digits on a card: its token's tail, or the printed number's.
        $where = "($where OR s.studentId IN (SELECT studentId FROM qr_codes WHERE status = 'assigned' AND token LIKE ?) OR s.displayId LIKE ?)";
        $wArgs[] = '%' . $digits; $wArgs[] = '%' . $digits;
    }
    $rows = db_all("SELECT s.studentId, s.fullName, s.displayId, s.centre, s.groupId, s.status, s.regStatus, s.cohortId
                    FROM summer_students s WHERE $where$scope ORDER BY CASE s.status WHEN 'active' THEN 0 ELSE 1 END, s.id DESC LIMIT " . SS3_SEARCH_MAX,
                   array_merge($wArgs, $args));
    return ['ok' => true, 'children' => ss3_light_rows($rows)];
}

/** Name, ID, centre, group and today's mark for a handful of children. */
function ss3_light_rows(array $rows): array {
    if (!$rows) return [];
    $ids = array_column($rows, 'studentId');
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $today = attendance_today();
    $marks = [];
    foreach (db_all("SELECT studentId, status, checkInAt, checkOutAt FROM attendance WHERE date = ? AND studentId IN ($ph)", array_merge([$today], $ids)) as $m) $marks[(string)$m['studentId']] = $m;
    $gids = array_values(array_filter(array_unique(array_column($rows, 'groupId'))));
    $gn = [];
    if ($gids) foreach (db_all('SELECT groupId, name FROM summer_groups WHERE groupId IN (' . implode(',', array_fill(0, count($gids), '?')) . ')', $gids) as $x) $gn[(string)$x['groupId']] = (string)$x['name'];
    $out = [];
    foreach ($rows as $r) {
        $m = $marks[(string)$r['studentId']] ?? null;
        $t = $m ? ((string)($m['checkOutAt'] ?? '') !== '' ? 'out' : ((string)$m['status'] === 'late' ? 'late' : 'in')) : ((string)$r['status'] === 'active' ? 'absent' : 'off');
        $out[] = ['id' => (string)$r['studentId'], 'name' => (string)$r['fullName'], 'displayId' => (string)($r['displayId'] ?? ''),
                  'centre' => (string)($r['centre'] ?? ''), 'group' => $gn[(string)($r['groupId'] ?? '')] ?? '', 'status' => (string)$r['status'],
                  'reg' => (string)($r['regStatus'] ?? 'verified'), 'today' => $t, 'inAt' => $m ? substr((string)$m['checkInAt'], 11, 5) : ''];
    }
    return $out;
}

/** admin.summer.recent — the last children this staff member opened. */
function admin_summer_recent(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $args = [(string)$g['requester']['memberId']];
    $scope = ss3_scope_sql(admin_centre_names_in_scope($g['requester']), 's.centre', $args);
    $rows = db_all("SELECT s.studentId, s.fullName, s.displayId, s.centre, s.groupId, s.status, s.regStatus, s.cohortId
                    FROM summer_recent r JOIN summer_students s ON s.studentId = r.studentId
                    WHERE r.staffId = ?$scope ORDER BY r.at DESC, r.id DESC LIMIT " . SS3_RECENT_MAX, $args);
    return ['ok' => true, 'children' => ss3_light_rows($rows)];
}

/* ── Into NGG ────────────────────────────────────────────────────────────────
 *
 * Graduates of the edition, each at a stage derived from records, never
 * stored: no member row → ready; a member row and no joining invoice →
 * promoted; an open joining invoice → invoiced; a paid one → paid. Moving a
 * child is `admin.club.promote` (gate `club`); the invoice is the Fees desk's
 * (gate `fees`) — this screen only reads both. */

/** Up to three meeting Saturdays after the edition ends, that an invoice may start on. */
function ss3_start_options(array $ed): array {
    $from = max(substr((string)($ed['endDate'] ?? ''), 0, 10), attendance_today());
    $cal = member_programme_settings();
    $out = [];
    $t = (int)strtotime($from . ' 00:00:00 UTC');
    $terms = membership_fee_terms();
    for ($i = 0; $i < 120 && count($out) < 3; $i++) {
        $t += 86400;
        $d = gmdate('Y-m-d', $t);
        if ((int)gmdate('N', $t) !== 6) continue;
        if (!empty($cal['enabled']) && !programme_is_day($d, $cal)) continue;
        if (!membership_start_ok($d)) continue;
        $pr = membership_prorate((int)$terms['monthlyCommitment'], $d);
        $out[] = ['date' => $d, 'month' => gmdate('F', $t), 'remaining' => $pr['remaining'], 'meetings' => $pr['total'],
                  'prorated' => $pr['amount'], 'total' => (int)$terms['membershipFee'] + $pr['amount'], 'basis' => $pr['basis']];
    }
    return $out;
}

function admin_summer_graduates(array $p): array {
    $g = admin_cap_gate_any($p, ['summer', 'club', 'fees']); if (!$g['ok']) return $g;
    $req = $g['requester'];
    $caps = member_effective_caps($req);
    $ed = ss3_edition(trim((string)($p['editionId'] ?? '')));
    $terms = membership_fee_terms();
    $base = ['ok' => true, 'terms' => $terms, 'canMove' => in_array('club', $caps, true), 'canInvoice' => in_array('fees', $caps, true),
             'threshold' => SUMMER_GRADUATE_RATE, 'pageSize' => SS3_PAGE];
    if (!$ed) return $base + ['edition' => null, 'rows' => [], 'counts' => array_fill_keys(SS3_GRAD_STAGES, 0), 'total' => 0, 'page' => 0, 'startOptions' => []];
    $today = attendance_today();
    $days = ss3_days($ed, $today);
    $roster = array_values(array_filter(ss3_roster($req, $ed, $today, $days),
        static fn($r) => in_array($r['status'], ['graduated', 'active', 'promoted'], true) && $r['rate'] !== null && $r['rate'] >= SUMMER_GRADUATE_RATE));
    // Who already has a member row: the column, and for rows promoted before it existed, the note.
    $member = [];
    if ($roster) {
        $ids = array_column($roster, 'id');
        foreach (array_chunk($ids, 400) as $ch) {
            foreach (db_all('SELECT memberId, fromSummerId, centre FROM members WHERE fromSummerId IN (' . implode(',', array_fill(0, count($ch), '?')) . ')', $ch) as $m) $member[(string)$m['fromSummerId']] = $m;
        }
        $need = array_filter($roster, static fn($r) => $r['status'] === 'promoted' && !isset($member[$r['id']]));
        if ($need) {
            foreach (db_all("SELECT memberId, centre, notes FROM members WHERE fromSummerId = '' AND notes LIKE 'Promoted from Summer %'") as $m) {
                if (preg_match('/^Promoted from Summer (\S+)/', (string)$m['notes'], $x)) $member[$x[1]] = $m;
            }
        }
    }
    $inv = [];
    $mids = array_values(array_map(static fn($m) => (string)$m['memberId'], $member));
    foreach (array_chunk($mids, 400) as $ch) {
        if (!$ch) continue;
        foreach (db_all("SELECT invoiceId, memberId, status, total, sentAt FROM membership_invoices WHERE purpose = 'joining' AND status IN ('open','paid') AND memberId IN (" . implode(',', array_fill(0, count($ch), '?')) . ') ORDER BY id', $ch) as $i) $inv[(string)$i['memberId']] = $i;
    }
    $rows = [];
    foreach ($roster as $r) {
        $m = $member[$r['id']] ?? null;
        $i = $m ? ($inv[(string)$m['memberId']] ?? null) : null;
        $stage = !$m ? 'ready' : (!$i ? 'promoted' : ((string)$i['status'] === 'paid' ? 'paid' : 'invoiced'));
        $rows[] = ['r' => $r, 'm' => $m, 'i' => $i, 'stage' => $stage];
    }
    $counts = array_fill_keys(SS3_GRAD_STAGES, 0);
    foreach ($rows as $x) { $counts[$x['stage']]++; $counts['all']++; }
    $stage = in_array((string)($p['stage'] ?? ''), SS3_GRAD_STAGES, true) ? (string)$p['stage'] : 'ready';
    $q = trim(mb_strtolower((string)($p['q'] ?? '')));
    $kept = array_values(array_filter($rows, static function ($x) use ($stage, $q) {
        if ($stage !== 'all' && $x['stage'] !== $stage) return false;
        if ($q === '') return true;
        return mb_strpos(mb_strtolower($x['r']['name'] . ' ' . $x['r']['displayId'] . ' ' . $x['r']['centre']), $q) !== false;
    }));
    usort($kept, static fn($a, $b) => strcasecmp($a['r']['name'], $b['r']['name']));
    $total = count($kept);
    $pages = max(1, (int)ceil($total / SS3_PAGE));
    $page = max(0, min($pages - 1, (int)($p['page'] ?? 0)));
    $slice = array_slice($kept, $page * SS3_PAGE, SS3_PAGE);
    // Nearest NGG centres, from what is already known — no network inside a list.
    $centres = db_all('SELECT * FROM centres');
    $byId = [];
    $sids = array_map(static fn($x) => $x['r']['id'], $slice);
    if ($sids) foreach (db_all('SELECT * FROM summer_students WHERE studentId IN (' . implode(',', array_fill(0, count($sids), '?')) . ')', $sids) as $s) $byId[(string)$s['studentId']] = $s;
    $out = [];
    foreach ($slice as $x) {
        $r = $x['r'];
        $opts = [];
        if ($x['stage'] === 'ready') {
            $n = centre_ngg_nearest(participant_home_address($byId[$r['id']] ?? []), $r['centre'], false, $centres);
            foreach (array_slice($n['ranked'], 0, 8) as $c) $opts[] = ['name' => $c['name'], 'km' => $c['km']];
        }
        $out[] = ['id' => $r['id'], 'name' => $r['name'], 'displayId' => $r['displayId'], 'centre' => $r['centre'], 'track' => $r['track'],
                  'rate' => $r['rate'], 'stage' => $x['stage'], 'hasEmail' => $r['email'] !== '' && filter_var($r['email'], FILTER_VALIDATE_EMAIL) !== false,
                  'emailHint' => $r['email'] !== '' ? preg_replace('/^(.).*(@.*)$/', '$1…$2', $r['email']) : '',
                  'memberId' => $x['m'] ? (string)$x['m']['memberId'] : '', 'nggCentre' => $x['m'] ? (string)$x['m']['centre'] : '',
                  'invoiceId' => $x['i'] ? (string)$x['i']['invoiceId'] : '', 'invoiceTotal' => $x['i'] ? (int)$x['i']['total'] : 0,
                  'options' => $opts];
    }
    return $base + ['edition' => ['id' => (string)$ed['cohortId'], 'name' => (string)$ed['name'], 'endDate' => substr((string)($ed['endDate'] ?? ''), 0, 10)],
        'rows' => $out, 'counts' => $counts, 'total' => $total, 'page' => $page, 'stage' => $stage,
        'startOptions' => $terms['enabled'] ? ss3_start_options($ed) : []];
}

/**
 * admin.summer.graduates.invoice — joining invoices for promoted graduates, as
 * ONE act with one undo window, rather than a client loop of separate ones.
 * Each still goes through admin_membership_invoice_create, so there is one
 * invoice path; refusals are named per child.
 */
function admin_summer_graduates_invoice(array $p): array {
    $g = admin_cap_gate($p, 'fees'); if (!$g['ok']) return $g;
    $ids = is_array($p['memberIds'] ?? null) ? $p['memberIds'] : [];
    $ids = array_values(array_unique(array_filter(array_map(static fn($v) => trim((string)$v), $ids))));
    if (!$ids) return ['ok' => false, 'error' => 'nothing_selected'];
    if (count($ids) > SS3_INVOICE_MAX) return ['ok' => false, 'error' => 'too_many', 'max' => SS3_INVOICE_MAX, 'detail' => 'At most ' . SS3_INVOICE_MAX . ' invoices in one go.'];
    $start = trim((string)($p['startDate'] ?? ''));
    if ($start !== '' && !membership_start_ok($start)) return ['ok' => false, 'error' => 'bad_start', 'detail' => 'The start date must be within a month before or three months after today.'];
    if (!membership_fee_terms()['enabled']) return ['ok' => false, 'error' => 'fees_off', 'detail' => 'Fees are off, so no joining invoice can be sent.'];
    if ($d = pending_defer('admin.summer.graduates.invoice', array_merge($p, ['memberIds' => $ids]), 'Send ' . count($ids) . ' joining invoices', count($ids))) return $d;
    $results = []; $sent = 0; $existed = 0; $refused = 0;
    foreach ($ids as $mid) {
        $name = (string)(db_row('SELECT fullName FROM members WHERE memberId = ?', [$mid])['fullName'] ?? $mid);
        $r = admin_membership_invoice_create(['requesterId' => $p['requesterId'] ?? '', 'memberId' => $mid, 'startDate' => $start, 'send' => true, 'ip' => $p['ip'] ?? '']);
        if (empty($r['ok'])) { $refused++; $results[] = ['id' => $mid, 'name' => $name, 'ok' => false, 'error' => (string)($r['error'] ?? 'refused'), 'detail' => (string)($r['detail'] ?? '')]; continue; }
        if (!empty($r['existed'])) { $existed++; $results[] = ['id' => $mid, 'name' => $name, 'ok' => true, 'existed' => true]; continue; }
        $ok = is_array($r['sent'] ?? null) && !empty($r['sent']['ok']);
        if ($ok) $sent++; else $refused++;
        $results[] = ['id' => $mid, 'name' => $name, 'ok' => $ok, 'invoiceId' => (string)($r['invoiceId'] ?? ''), 'error' => $ok ? '' : 'not_sent', 'detail' => $ok ? '' : 'The invoice was made but the email did not go. Resend it from the Fees desk.'];
    }
    audit('summer.graduates.invoice', (string)$g['requester']['memberId'], '', ['requested' => count($ids), 'sent' => $sent, 'existed' => $existed, 'refused' => $refused], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sent' => $sent, 'existed' => $existed, 'refused' => $refused, 'requested' => count($ids), 'results' => $results];
}
