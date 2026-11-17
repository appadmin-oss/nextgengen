<?php
declare(strict_types=1);

/**
 * Admin domain, part 2 — the "complete management" surface:
 * analytics overview, 360° member detail, mentor assignment, applications
 * review + convert, newsletter, and site settings. Every handler re-checks
 * admin role via admin_gate() (defined in admin.php).
 */

// ── General dashboard (Summer School board) — attendance + analytics/centre ──
// Read-only live aggregation. Gated on the M&E `audit` cap (finally giving that
// long-orphaned role a home) and also open to `rbac`/super_admin. Grouped by
// centre; centre-scope filtering is layered in with scoped admins (B2).
function admin_dashboard_overview(array $p): array {
    // Read-only board — any admin tier (incl. the M&E `audit` role) may view it.
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $today = gmdate('Y-m-d');
    $since = gmdate('Y-m-d', time() - 13 * 86400); // 14-day window

    // Scoped admins see only their centres; unscoped (super_admin/admin) see all.
    $scopeNames = admin_centre_names_in_scope($g['requester']);
    $centreWhere = "status = 'active'";
    $centreArgs = [];
    if ($scopeNames !== null) {
        if (!$scopeNames) return ['ok' => true, 'dashboard' => ['today' => $today, 'kpis' => ['centres' => 0, 'enrolled' => 0, 'presentToday' => 0, 'attendanceRate' => 0, 'lateToday' => 0, 'activeVolunteers' => 0, 'presentVolToday' => 0], 'byCentre' => [], 'trend' => []]];
        $centreWhere .= ' AND name IN (' . implode(',', array_fill(0, count($scopeNames), '?')) . ')';
        $centreArgs = $scopeNames;
    }
    $centres = db_all("SELECT centreId, name, code, color FROM centres WHERE $centreWhere ORDER BY name", $centreArgs);
    $byCentre = [];
    foreach ($centres as $c) {
        $name = (string)$c['name'];
        $enrolled = $one("SELECT COUNT(*) c FROM summer_students WHERE centre = ? AND status = 'active'", [$name]);
        $present  = $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE s.centre = ? AND a.date = ?", [$name, $today]);
        $late     = $one("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE s.centre = ? AND a.date = ? AND a.status = 'late'", [$name, $today]);
        $byCentre[] = [
            'centreId' => $c['centreId'], 'name' => $name, 'code' => $c['code'], 'color' => $c['color'],
            'enrolled' => $enrolled, 'present' => $present, 'late' => $late,
            'rate' => $enrolled ? (int)round($present / $enrolled * 100) : 0,
        ];
    }
    // KPI + trend queries respect the same scope (join students → centre).
    $inClause = ''; $inArgs = [];
    if ($scopeNames !== null) { $inClause = ' AND s.centre IN (' . implode(',', array_fill(0, count($scopeNames), '?')) . ')'; $inArgs = $scopeNames; }
    $trend = db_all("SELECT a.date date, COUNT(DISTINCT a.studentId) present, SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) late FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date >= ?$inClause GROUP BY a.date ORDER BY a.date", array_merge([$since], $inArgs));
    $enrolledTotal = $scopeNames !== null
        ? $one("SELECT COUNT(*) c FROM summer_students s WHERE s.status = 'active'$inClause", $inArgs)
        : $one("SELECT COUNT(*) c FROM summer_students WHERE status = 'active'");
    $presentToday  = $scopeNames !== null
        ? $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ?$inClause", array_merge([$today], $inArgs))
        : $one("SELECT COUNT(DISTINCT studentId) c FROM attendance WHERE date = ?", [$today]);
    $lateToday = $scopeNames !== null
        ? $one("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ? AND a.status = 'late'$inClause", array_merge([$today], $inArgs))
        : $one("SELECT COUNT(*) c FROM attendance WHERE date = ? AND status = 'late'", [$today]);

    return ['ok' => true, 'dashboard' => [
        'today' => $today,
        'kpis' => [
            'centres'          => count($centres),
            'enrolled'         => $enrolledTotal,
            'presentToday'     => $presentToday,
            'attendanceRate'   => $enrolledTotal ? (int)round($presentToday / $enrolledTotal * 100) : 0,
            'lateToday'        => $lateToday,
            /* Scoped like everything else on this board. These two were
               not, so a centre-scoped coordinator saw their own centre's
               attendance beside the organisation's whole volunteer count —
               two numbers on one row that do not describe the same thing. */
            'activeVolunteers' => $scopeNames !== null
                ? $one("SELECT COUNT(*) c FROM volunteers WHERE status = 'active' AND centre IN ("
                       . implode(',', array_fill(0, count($scopeNames), '?')) . ')', $scopeNames)
                : $one("SELECT COUNT(*) c FROM volunteers WHERE status = 'active'"),
            'presentVolToday'  => $scopeNames !== null
                ? $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId WHERE a.date = ? AND v.centre IN ("
                       . implode(',', array_fill(0, count($scopeNames), '?')) . ')', array_merge([$today], $scopeNames))
                : $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId WHERE a.date = ?", [$today]),
        ],
        'byCentre' => $byCentre,
        'trend'    => $trend,
    ]];
}

// ── Status-page management ───────────────────────────────────────────────────
// Both public boards (/s-status attendance, /v-status volunteer) carry an admin-
// editable editorial layer + a publish toggle, stored as one `status_pages`
// setting. The public ops read this to render copy and to hide a board that's
// been unpublished.
function status_pages_defaults(): array {
    return [
        'attendance' => [
            'published' => true,
            'title' => 'Summer School',
            'tagline' => 'A public, PII-free view of attendance and participation across every centre.',
            'accent' => '#d0ff3a',
            'banner' => ['text' => '', 'tone' => 'info'],
            'sections' => ['kpis' => true, 'centres' => true, 'trend' => true, 'transparency' => true, 'cta' => true],
            'kpis' => ['centres' => true, 'enrolled' => true, 'presentToday' => true, 'attendanceRate' => true, 'activeVolunteers' => true, 'starsThisWeek' => true],
            'trendDays' => 14,
            'centres' => [],
            'transparencyTitle' => 'Numbers, not names.',
            // Says what the board actually does. It used to promise that "a
            // child's name, photo, or record never appears here" — true until
            // consent-based display shipped, and a false assurance to parents
            // afterwards. The board also renders a fixed consent statement
            // that this copy cannot override, so an admin editing this text
            // cannot reintroduce the old promise.
            'transparencyBody' => "This board updates live and shows aggregate figures — how many students attended, at which centres, and how participation is trending. A child's record never appears here. A name or photograph is shown only where a parent or guardian has consented to it, and is removed as soon as that consent is withdrawn. It's how we stay accountable to parents, partners and the community without compromising a single child's privacy.",
            'ctaLabel' => 'Apply for a place →',
            'ctaPage' => 'join',
        ],
        'volunteer' => [
            'published' => true,
            'title' => 'Build the team.',
            'tagline' => 'A live, public view of volunteer needs across every centre.',
            'accent' => '#d0ff3a',
            'banner' => ['text' => '', 'tone' => 'info'],
            'sections' => ['kpis' => true, 'centres' => true, 'transparency' => true, 'cta' => true],
            'kpis' => ['totalVolunteers' => true, 'activeVolunteers' => true, 'centres' => true, 'totalNeed' => true, 'totalFilled' => true, 'totalGap' => true],
            'centres' => [],
            'transparencyTitle' => 'Roles, not people.',
            'transparencyBody' => "This board shows only how many volunteers each centre needs and how many have stepped up — by role, faculty and course. A volunteer's name, photo or contact detail never appears here.",
            'ctaLabel' => 'Volunteer with us →',
            'ctaPage' => 'volunteer',
        ],
    ];
}

/** Overlay `$over` onto `$base` per the known schema, validating each field by
 *  the shape of its default. Shared by config() (stored over defaults) and
 *  set() (request over current). */
function status_pages_merge(array $base, array $over): array {
    $out = $base;
    foreach ($base as $board => $fields) {
        if (!is_array($over[$board] ?? null)) continue;
        $o = $over[$board];
        foreach ($fields as $k => $dv) {
            if (!array_key_exists($k, $o)) continue;
            $ov = $o[$k];
            if (is_bool($dv)) { $out[$board][$k] = (bool)$ov; }
            elseif (is_int($dv)) { $out[$board][$k] = max(7, min(60, (int)$ov)); }
            elseif ($k === 'centres') { $out[$board][$k] = array_values(array_slice(array_filter(array_map(fn($x) => substr(trim((string)$x), 0, 80), (array)$ov)), 0, 50)); }
            elseif ($k === 'banner') { $out[$board][$k] = ['text' => substr(trim((string)($ov['text'] ?? $dv['text'])), 0, 200), 'tone' => in_array(($ov['tone'] ?? ''), ['info', 'success', 'warn'], true) ? (string)$ov['tone'] : (string)$dv['tone']]; }
            elseif (is_array($dv)) { $m = $dv; foreach ($dv as $sk => $sv) if (array_key_exists($sk, (array)$ov)) $m[$sk] = !empty($ov[$sk]); $out[$board][$k] = $m; }
            elseif ($k === 'accent') { $out[$board][$k] = preg_match('/^#[0-9a-fA-F]{6}$/', (string)$ov) ? (string)$ov : $dv; }
            elseif ($k === 'ctaPage') { $out[$board][$k] = preg_replace('/[^a-z0-9-]/', '', strtolower((string)$ov)) ?: $dv; }
            else { $out[$board][$k] = substr(trim((string)$ov), 0, 600); }
        }
    }
    return $out;
}

/** Full config = stored overlaid on defaults. */
function status_pages_config(): array {
    return status_pages_merge(status_pages_defaults(), safe_json((string)(setting_raw('status_pages') ?? '')) ?: []);
}

function admin_status_pages_get(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $centres = array_map(fn($r) => ['name' => (string)$r['name'], 'code' => (string)$r['code'], 'color' => (string)$r['color']], db_all("SELECT name, code, color FROM centres WHERE status = 'active' ORDER BY name"));
    return ['ok' => true, 'statusPages' => status_pages_config(), 'defaults' => status_pages_defaults(), 'centreOptions' => $centres];
}

function admin_status_pages_set(array $p): array {
    $g = admin_cap_gate($p, 'content'); if (!$g['ok']) return $g;
    $in = is_array($p['data'] ?? null) ? $p['data'] : [];
    $out = status_pages_merge(status_pages_config(), $in); // partial-save safe
    setting_set('status_pages', $out, (string)($g['requester']['memberId'] ?? ''));
    audit('status.pages.set', (string)($g['requester']['memberId'] ?? ''), 'status_pages', ['attendance' => $out['attendance']['published'], 'volunteer' => $out['volunteer']['published']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'statusPages' => $out];
}

// ── Public status board (no auth, PII-free aggregates only) ──────────────────
// Powers the public /s-status transparency page. Deliberately exposes ONLY
// centre-level aggregate counts — never a child's name, photo or record.
/**
 * The public attendance board.
 *
 * Memoised, because this is POLLED — a screen at every centre refreshes it, so
 * without a cache the same figures are recomputed once per centre per refresh
 * from the same rows. Twenty seconds is shorter than any refresh interval the
 * board uses, so nothing on screen is ever visibly behind; what it removes is
 * the hundred-fold duplicate work behind it.
 *
 * `generatedAt` is inside the cached payload on purpose: it says when these
 * numbers were true, which is the honest thing for a screen on a wall.
 */
/**
 * The public attendance board.
 *
 * Deliberately NOT memoised here. This is the domain function: admin screens,
 * tests and internal callers must see the truth as it is now, and a consent
 * withdrawal has to be reflected the instant it is made. Polling is an HTTP
 * concern, so the cache lives in api/public/status.php where the polling
 * happens — see the note there about what it is stamped on.
 */
function public_status(array $p): array {
    $page = status_pages_config()['attendance'];
    if (empty($page['published'])) return ['ok' => true, 'status' => ['page' => $page, 'generatedAt' => now_iso()]];
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $today = gmdate('Y-m-d');
    $trendDays = max(7, min(60, (int)($page['trendDays'] ?? 14)));
    $since = gmdate('Y-m-d', time() - ($trendDays - 1) * 86400);
    $weekAgo = gmdate('Y-m-d', time() - 6 * 86400);

    // Admin can limit which centres appear on the board (empty = all active).
    $only = is_array($page['centres'] ?? null) ? $page['centres'] : [];
    // `capacity` is selected here so the fill loop below does not have to ask
    // for it one centre at a time.
    $centres = db_all("SELECT name, code, color, address, area, leadVolunteerId, meetDays, meetTime, capacity FROM centres WHERE status = 'active' ORDER BY name");
    if ($only) $centres = array_values(array_filter($centres, fn($c) => in_array((string)$c['name'], $only, true)));
    $cNames = array_map(fn($c) => (string)$c['name'], $centres);
    $yesterday = gmdate('Y-m-d', time() - 86400);

    /* Per-centre figures, grouped. Three queries for the whole board instead of
     * three per centre — two of which joined every attendance row. See the note
     * on the weekly loop further down: this is a public endpoint polled from
     * every centre, and O(centres) query counts are what made it unservable. */
    $enrolledBy = []; $presentBy = []; $lateBy = [];
    foreach (db_all("SELECT centre, COUNT(*) c FROM summer_students WHERE status = 'active' GROUP BY centre") as $r)
        $enrolledBy[(string)$r['centre']] = (int)$r['c'];
    foreach (db_all("SELECT s.centre, COUNT(DISTINCT a.studentId) c FROM attendance a
                     JOIN summer_students s ON s.studentId = a.studentId
                     WHERE a.date = ? GROUP BY s.centre", [$today]) as $r)
        $presentBy[(string)$r['centre']] = (int)$r['c'];
    foreach (db_all("SELECT s.centre, COUNT(*) c FROM attendance a
                     JOIN summer_students s ON s.studentId = a.studentId
                     WHERE a.date = ? AND a.status = 'late' GROUP BY s.centre", [$today]) as $r)
        $lateBy[(string)$r['centre']] = (int)$r['c'];

    $byCentre = [];
    foreach ($centres as $c) {
        $name = (string)$c['name'];
        $enrolled = $enrolledBy[$name] ?? 0;
        $present  = $presentBy[$name] ?? 0;
        $late     = $lateBy[$name] ?? 0;
        $byCentre[] = ['name' => $name, 'code' => (string)$c['code'], 'color' => (string)$c['color'], 'enrolled' => $enrolled, 'present' => $present, 'late' => $late, 'onTime' => max(0, $present - $late), 'rate' => $enrolled ? (int)round($present / $enrolled * 100) : 0] + centre_public_meta($c);
    }
    // Student board — scope attendance to summer students (volunteers share the
    // same roll table, so an unscoped count would inflate the student figures).
    $enrolledTotal = $one("SELECT COUNT(*) c FROM summer_students WHERE status = 'active'");
    $presentToday  = $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ?", [$today]);
    $lateTodayS    = $one("SELECT COUNT(*) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ? AND a.status = 'late'", [$today]);
    $presentYest   = $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date = ?", [$yesterday]);
    $trend = db_all("SELECT a.date date, COUNT(DISTINCT a.studentId) present FROM attendance a JOIN summer_students s ON s.studentId = a.studentId WHERE a.date >= ? GROUP BY a.date ORDER BY a.date", [$since]);
    // Session week number (best-effort from the active session start).
    $sess = db_row("SELECT startDate FROM sessions WHERE isActive = 1 ORDER BY id DESC LIMIT 1");
    $week = 0;
    if ($sess && !empty($sess['startDate'])) { $d = (int)floor((time() - strtotime((string)$sess['startDate'])) / 86400); if ($d >= 0) $week = (int)floor($d / 7) + 1; }

    /* ── Registration ─────────────────────────────────────────────────────
     * The board reported attendance only, which says how the programme is
     * running but nothing about how it is filling. These are the intake
     * figures — counts and rates, no names, no contact details, same PII-free
     * contract as the rest of the page.
     *
     * `enrolled` above counts ACTIVE students; registration counts every
     * sign-up regardless of status, because a withdrawal is still a
     * registration that happened. The two are deliberately different numbers. */
    $regTotal    = $one("SELECT COUNT(*) c FROM summer_students");
    $regVerified = $one("SELECT COUNT(*) c FROM summer_students WHERE regStatus = 'verified'");
    $regPending  = $one("SELECT COUNT(*) c FROM summer_students WHERE regStatus = 'parent_pending'");
    $regToday    = $one("SELECT COUNT(*) c FROM summer_students WHERE substr(enrolledAt,1,10) = ?", [$today]);
    $regWeek     = $one("SELECT COUNT(*) c FROM summer_students WHERE substr(enrolledAt,1,10) >= ?", [$weekAgo]);
    $capacity    = (int)(db_row("SELECT COALESCE(SUM(capacity),0) c FROM centres WHERE status = 'active'")['c'] ?? 0);
    $regTrend = db_all("SELECT substr(enrolledAt,1,10) date, COUNT(*) signups FROM summer_students
                        WHERE substr(enrolledAt,1,10) >= ? GROUP BY substr(enrolledAt,1,10) ORDER BY 1", [$since]);
    // Per-centre intake, so a centre that is full and one that is empty are
    // visible side by side rather than averaged away in a single total.
    // Two grouped queries, and the capacity already came back with the centre.
    $regBy = []; $pendBy = []; $capBy = [];
    foreach ($centres as $c) $capBy[(string)$c['name']] = (int)($c['capacity'] ?? 0);
    foreach (db_all("SELECT centre, COUNT(*) c, SUM(CASE WHEN regStatus = 'parent_pending' THEN 1 ELSE 0 END) p
                     FROM summer_students GROUP BY centre") as $r) {
        $regBy[(string)$r['centre']] = (int)$r['c'];
        $pendBy[(string)$r['centre']] = (int)$r['p'];
    }
    foreach ($byCentre as &$__bc) {
        $cap = $capBy[$__bc['name']] ?? 0;
        $__bc['registered'] = $regBy[$__bc['name']] ?? 0;
        $__bc['pending']    = $pendBy[$__bc['name']] ?? 0;
        $__bc['capacity']   = $cap;
        $__bc['fill']       = $cap > 0 ? (int)round($__bc['registered'] / $cap * 100) : 0;
    }
    unset($__bc);

    $activeVol = $one("SELECT COUNT(*) c FROM volunteers WHERE status = 'active'");
    $starsWeek = $one("SELECT COUNT(*) c FROM member_stars WHERE date >= ?", [$weekAgo]);
    $rateToday = $enrolledTotal ? (int)round($presentToday / $enrolledTotal * 100) : 0;
    $rateYest  = $enrolledTotal ? (int)round($presentYest / $enrolledTotal * 100) : 0;
    $deltas = [
        'enrolledNew' => $one("SELECT COUNT(*) c FROM summer_students WHERE status='active' AND substr(enrolledAt,1,10) = ?", [$today]),
        'presentDelta' => $presentToday - $presentYest,
        'rateDelta' => $rateToday - $rateYest,
        'volNew' => $one("SELECT COUNT(*) c FROM volunteers WHERE status='active' AND substr(createdAt,1,10) = ?", [$today]),
        'starsToday' => $one("SELECT COUNT(*) c FROM member_stars WHERE date = ?", [$today]),
    ];

    // PII-free student leaderboard — handle only, never a name or photo.
    $palette = ['#f5b026', '#b07cff', '#2f9e44', '#3b5bdb', '#ff5a3c', '#17a2b8', '#e8a92b', '#6a3fc0'];
    $cIn = $cNames ? ('(' . implode(',', array_fill(0, count($cNames), '?')) . ')') : '';
    $studs = $cNames ? db_all("SELECT studentId, handle, centre, track, fullName, photoUrl, regStatus FROM summer_students WHERE status='active' AND centre IN $cIn", $cNames) : [];

    /* ── Who may be named and pictured in public ──────────────────────────
     * Default is still handle-only. A child's name or face appears here for
     * one reason: a guardian ticked the box that says so.
     *
     *   site_visibility ("Feature on our website")  → the name may be shown
     *   media           ("Photos & media")          → the photograph may be
     *
     * Both are optional (priority 1) — declining changes nothing about the
     * child's place on the programme, and they stay on the board under their
     * handle exactly as before.
     *
     * The photo needs BOTH grants, not just `media`. Permission to take and
     * use photographs internally is not permission to publish a child's
     * picture on a public web page, and treating one as the other is the
     * mistake worth designing against.
     *
     * `consents` is append-only, so the LAST row for a type is the current
     * decision — which is how a withdrawal takes effect. It is read live on
     * every poll, so a guardian who withdraws consent drops off the public
     * board within one refresh rather than at some later rebuild. */
    $consentOf = consent_may_publish_many(array_column($studs, 'studentId'));
    $starAgg = []; foreach (db_all("SELECT subjectId, SUM(stars) s, SUM(CASE WHEN date >= ? THEN stars ELSE 0 END) w FROM member_stars GROUP BY subjectId", [$weekAgo]) as $r) $starAgg[(string)$r['subjectId']] = ['s' => (int)$r['s'], 'w' => (int)$r['w']];
    $attAgg = []; foreach (db_all("SELECT studentId, COUNT(DISTINCT date) c FROM attendance WHERE date >= ? GROUP BY studentId", [$since]) as $r) $attAgg[(string)$r['studentId']] = (int)$r['c'];
    $schoolDays = max(1, (int)(db_row("SELECT COUNT(DISTINCT date) c FROM attendance WHERE date >= ?", [$since])['c'] ?? 1));
    $members = [];
    foreach ($studs as $i => $s) {
        $sid = (string)$s['studentId'];
        $st = $starAgg[$sid] ?? ['s' => 0, 'w' => 0];
        $days = $attAgg[$sid] ?? 0;
        $handle = (string)$s['handle']; if ($handle === '') $handle = 'ngg' . substr($sid, -4);
        // Including the regStatus lock — a registration the guardian never
        // completed cannot have produced a valid grant, whatever the ledger says.
        $mayName   = (bool)($consentOf[$sid]['mayName'] ?? false);
        $mayPhoto  = (bool)($consentOf[$sid]['mayPhoto'] ?? false);
        $photo     = $mayPhoto ? normalize_image_url($s['photoUrl'] ?? '') : '';
        $members[] = [
            'handle' => $handle, 'centre' => (string)$s['centre'], 'faculty' => ((string)$s['track']) ?: 'General',
            'color' => $palette[abs(crc32($handle)) % count($palette)],
            'points' => $st['s'] * 40 + $days * 8, 'weekPoints' => $st['w'] * 40 + min($days, 5) * 8,
            'stars' => $st['s'], 'attendance' => (int)round($days / $schoolDays * 100), 'streak' => min($days, 14), 'move' => 0,
            // Absent, not empty-stringed, when there is no consent: nothing
            // downstream can then render a name it was never given.
            'name'  => $mayName ? (string)$s['fullName'] : null,
            'photo' => $photo !== '' ? $photo : null,
        ];
    }
    /* Cap the board to a leaderboard, not the whole roster.
     *
     * This shipped every active student in the programme on a PUBLIC endpoint
     * that a screen at every centre polls: measured at 100 centres it was
     * 20,000 rows and 3.75 MB per request, which is most of a gigabyte an hour
     * of egress to render a table nobody scrolls. Both consumers filter by
     * centre or faculty and then show at most twenty-five.
     *
     * Capped PER CENTRE rather than overall, so a small centre still has a full
     * leaderboard of its own — an overall top-N would leave the quietest
     * centres with an empty board, which is exactly the wrong place to save
     * bytes. `membersTotal` carries the real figure for anything that wants to
     * say "of N". */
    $MEMBERS_PER_CENTRE = 25;
    $membersTotal = count($members);
    usort($members, fn($a, $b) => $b['points'] <=> $a['points']);
    $seenPerCentre = []; $capped = [];
    foreach ($members as $m) {
        $cn = (string)($m['centre'] ?? '');
        $n = ($seenPerCentre[$cn] ?? 0);
        if ($n >= $MEMBERS_PER_CENTRE) continue;
        $seenPerCentre[$cn] = $n + 1;
        $capped[] = $m;
    }
    $members = $capped;

    // Faculties come from the FULL cohort, not the capped board — a faculty
    // taught only at a quiet centre must still appear in the filter.
    $faculties = array_values(array_unique(array_filter(array_map(fn($m) => $m['faculty'], $capped))));
    foreach ($studs as $s) {
        $fac = ((string)$s['track']) ?: 'General';
        if (!in_array($fac, $faculties, true)) $faculties[] = $fac;
    }

    // Real activities per centre (with a photo from the evidence, if any) +
    // real present-by-weekday (the most recent occurrence of each weekday).
    /* Per-centre activity and weekly attendance, in two queries rather than
     * 7 per centre.
     *
     * This loop used to run one activities query per centre plus one
     * COUNT(DISTINCT) JOIN per centre PER WEEKDAY. At the two centres a dev
     * machine has that is fourteen queries and imperceptible; at a hundred it
     * is seven hundred, six hundred of them a join across every attendance row
     * ever recorded — and this is the PUBLIC board, unauthenticated, polled by
     * a screen at every centre. Measured on a 100-centre, 20k-student,
     * 200k-attendance database: 26.6 seconds. It is the single thing that
     * would take the site down under the load it is meant to carry. */
    $activitiesByCentre = []; $daysByCentre = [];
    $weekKeys = ['Mon' => 1, 'Tue' => 2, 'Wed' => 3, 'Thu' => 4, 'Fri' => 5, 'Sat' => 6];
    $centreNames = array_map(fn($c) => (string)$c['name'], $centres);
    foreach ($centres as $c) { $activitiesByCentre[(string)$c['code']] = []; $daysByCentre[(string)$c['code']] = []; }

    // The six dates this week's columns refer to, resolved once.
    $weekDates = [];
    foreach ($weekKeys as $k => $dow) {
        for ($back = 0; $back <= 20; $back++) {
            $ts = time() - $back * 86400;
            if ((int)gmdate('N', $ts) === $dow) { $weekDates[$k] = gmdate('Y-m-d', $ts); break; }
        }
    }

    if ($centreNames) {
        $cIn2 = '(' . implode(',', array_fill(0, count($centreNames), '?')) . ')';

        /* One grouped query for every centre and every day at once. Bounded by
         * the six dates, so it reads this week rather than the whole history. */
        $presentBy = [];
        if ($weekDates) {
            $dIn = '(' . implode(',', array_fill(0, count($weekDates), '?')) . ')';
            foreach (db_all("SELECT s.centre, a.date, COUNT(DISTINCT a.studentId) c
                             FROM attendance a JOIN summer_students s ON s.studentId = a.studentId
                             WHERE s.centre IN $cIn2 AND a.date IN $dIn
                             GROUP BY s.centre, a.date",
                            array_merge($centreNames, array_values($weekDates))) as $r) {
                $presentBy[(string)$r['centre']][(string)$r['date']] = (int)$r['c'];
            }
        }

        /* One activities query for all centres. Ordered newest-first and capped
         * in PHP at eight per centre — the same eight the per-centre LIMIT gave,
         * without a query each. The outer cap keeps a programme with thousands
         * of logged activities from reading them all. */
        $actBy = [];
        foreach (db_all("SELECT centre, title, category, department, notes, date, evidence
                         FROM activities WHERE centre IN $cIn2
                         ORDER BY date DESC, id DESC LIMIT ?",
                        array_merge($centreNames, [max(200, count($centreNames) * 8)])) as $r) {
            $cn = (string)$r['centre'];
            if (count($actBy[$cn] ?? []) >= 8) continue;
            $ev = safe_json((string)($r['evidence'] ?? '[]')); $photo = '';
            if (is_array($ev)) foreach ($ev as $e) { if (($e['type'] ?? '') === 'photo' && !empty($e['url'])) { $photo = (string)$e['url']; break; } }
            $t = strtotime((string)$r['date']);
            $actBy[$cn][] = ['faculty' => ((string)$r['department']) ?: ((string)$r['category']) ?: 'Activity',
                             'title' => (string)$r['title'], 'cap' => (string)$r['notes'],
                             'day' => $t ? gmdate('D', $t) : '', 'photoUrl' => $photo];
        }

        foreach ($centres as $c) {
            $name = (string)$c['name']; $code = (string)$c['code'];
            $activitiesByCentre[$code] = $actBy[$name] ?? [];
            $days = [];
            foreach ($weekKeys as $k => $dow) {
                $date = $weekDates[$k] ?? '';
                $days[] = ['key' => $k, 'present' => $date ? (int)($presentBy[$name][$date] ?? 0) : 0];
            }
            $daysByCentre[$code] = $days;
        }
    }

    /* ── Retention ────────────────────────────────────────────────────────
     * The board reported today's attendance rate and nothing about whether the
     * children counted in it are still coming at all. Those are different
     * problems with different answers: 80% present of a roster a third of whom
     * quietly left is a worse programme than 65% present of everyone enrolled,
     * and the first reads better on a screen. A public board that can only show
     * the flattering one of the two is not a status board.
     *
     * Same function, same threshold, same window as the admin register and the
     * analyst's evidence — see `attendance_retention()`. Counts only, no child.
     *
     * Scoped to the centres the board actually SHOWS, so a board published for
     * one centre does not display another centre's attrition. `$cNames` rather
     * than `$only`, because an allow-list may name a centre that has since been
     * archived — passing the raw list would count that centre's children in the
     * total with no row beside them to explain where they came from.
     *
     * With no allow-list this is every active student, matching `kpis.enrolled`.
     * With one it is deliberately a narrower population, so `retention.children`
     * is returned rather than left for the reader to assume it is `enrolled`.
     *
     * Empty when there is no programme calendar or the term is younger than the
     * missed-day run: "not yet measurable", which is not the same claim as
     * "nobody has left", and the UI must not render it as a zero. */
    $retention = function_exists('attendance_retention') ? attendance_retention($only ? $cNames : []) : [];
    if ($retention) {
        $retBy = [];
        foreach ($retention['byCentre'] as $__r) $retBy[(string)$__r['centre']] = $__r;
        foreach ($byCentre as &$__rc) {
            $r = $retBy[$__rc['name']] ?? null;
            $__rc['stopped']     = $r ? (int)$r['stopped'] : 0;
            $__rc['neverCame']   = $r ? (int)$r['neverCame'] : 0;
            $__rc['stillComing'] = $r ? (int)$r['stillComing'] : 0;
            $__rc['stoppedPct']  = $r ? (float)$r['stoppedPct'] : 0.0;
        }
        unset($__rc);
    }

    return ['ok' => true, 'status' => [
        'today' => $today,
        'generatedAt' => now_iso(),
        'page' => $page,
        'program' => ['name' => $page['title'] ?: 'Summer School', 'year' => (int)gmdate('Y'), 'week' => $week],
        'kpis' => [
            'centres'          => count($centres),
            'enrolled'         => $enrolledTotal,
            'presentToday'     => $presentToday,
            'lateToday'        => $lateTodayS,
            'onTimeToday'      => max(0, $presentToday - $lateTodayS),
            'attendanceRate'   => $rateToday,
            'activeVolunteers' => $activeVol,
            'starsThisWeek'    => $starsWeek,
            'registered'       => $regTotal,
            'consentVerified'  => $regVerified,
            'consentPending'   => $regPending,
            'capacity'         => $capacity,
            'capacityFill'     => $capacity > 0 ? (int)round($regTotal / $capacity * 100) : 0,
        ],
        'registration' => [
            'total' => $regTotal, 'verified' => $regVerified, 'pending' => $regPending,
            'today' => $regToday, 'thisWeek' => $regWeek,
            'capacity' => $capacity,
            'fill' => $capacity > 0 ? (int)round($regTotal / $capacity * 100) : 0,
            'consentRate' => $regTotal > 0 ? (int)round($regVerified / $regTotal * 100) : 0,
            'trend' => $regTrend,
        ],
        'deltas'   => $deltas,
        'retention' => $retention,
        'byCentre' => $byCentre,
        'trend'    => $trend,
        'members'  => $members,
        'membersTotal' => $membersTotal,
        'membersPerCentreCap' => $MEMBERS_PER_CENTRE,
        'faculties'=> $faculties,
        'activitiesByCentre' => $activitiesByCentre,
        'daysByCentre' => $daysByCentre,
    ]];
}


/** AI status for the console — which profiles are live, optionally probed. */
function admin_ai_status(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $probe = !empty($p['probe']);
    if ($probe) audit('ai.probe', (string)$g['requester']['memberId'], '', [], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ai' => ai_status($probe), 'anyEnabled' => ai_enabled(), 'spend' => ai_spend_summary()];
}

/** The most a month's paid AI may be set to: a typo of an extra zero should not be a bill. */
const AI_LIMIT_MAX_USD = 2000;
/** admin.ai.routing.set — the monthly limit on paid models (USD; 0 = paid models off), whether they may do everyday work
 *  when no free model is set up, and price overrides ("model in out" per line, USD per million tokens). Whole payload checked first. */
function admin_ai_routing_set(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $cur = setting_get('ai_routing'); $cur = is_array($cur) ? $cur : [];
    $next = $cur;
    if (array_key_exists('monthlyLimitUsd', $p)) {
        $v = trim((string)$p['monthlyLimitUsd']);
        if ($v === '') $v = '0';
        if (!is_numeric($v) || (float)$v < 0) return ['ok' => false, 'error' => 'bad_limit', 'detail' => 'The limit is a number of US dollars, 0 or more.'];
        if ((float)$v > AI_LIMIT_MAX_USD) return ['ok' => false, 'error' => 'limit_too_high', 'detail' => 'At most $' . AI_LIMIT_MAX_USD . ' a month.'];
        $next['monthlyLimitUsd'] = round((float)$v, 2);
    }
    if (array_key_exists('paidEveryday', $p)) $next['paidEveryday'] = !empty($p['paidEveryday']);
    if (array_key_exists('prices', $p)) {
        $prices = [];
        foreach (preg_split('/\r?\n/', (string)$p['prices']) as $i => $line) {
            $line = trim($line); if ($line === '' || str_starts_with($line, '#')) continue;
            if (!preg_match('/^([A-Za-z0-9._:\/\-]{2,100})\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)$/', $line, $m))
                return ['ok' => false, 'error' => 'bad_price_line', 'detail' => 'Line ' . ($i + 1) . ': write a model, then its input and output price per million tokens, e.g. “claude-opus-5-5 4 20”.'];
            $prices[strtolower($m[1])] = [(float)$m[2], (float)$m[3]];
        }
        if (count($prices) > 40) return ['ok' => false, 'error' => 'too_many_prices', 'detail' => 'Forty price lines at most.'];
        $next['prices'] = $prices;
    }
    setting_set('ai_routing', $next, (string)$g['requester']['memberId']);
    unset($GLOBALS['__ai_spend']);
    audit('ai.routing.set', (string)$g['requester']['memberId'], '', ['from' => (float)($cur['monthlyLimitUsd'] ?? 0), 'to' => (float)($next['monthlyLimitUsd'] ?? 0),
        'paidEveryday' => !empty($next['paidEveryday']), 'prices' => count((array)($next['prices'] ?? []))], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'spend' => ai_spend_summary()];
}

// ── Analytics overview ──────────────────────────────────────────────────────
function admin_overview(array $p): array {
    $g = admin_gate($p); if (!$g['ok']) return $g;
    $one = fn($sql, $a = []) => (int)(db_row($sql, $a)['c'] ?? 0);
    $since30 = gmdate('Y-m-d\TH:i:s\Z', time() - 30 * 86400);

    $byCentre = db_all("SELECT centre, COUNT(*) c FROM members WHERE status='active' AND centre != '' GROUP BY centre");
    $byTrack  = db_all("SELECT track, COUNT(*) c FROM members WHERE status='active' AND track != '' AND track IS NOT NULL GROUP BY track ORDER BY c DESC");

    return ['ok' => true, 'overview' => [
        'members' => [
            'active'   => $one("SELECT COUNT(*) c FROM members WHERE status='active'"),
            'ngg'      => $one("SELECT COUNT(*) c FROM members WHERE status='active' AND type='NGG'"),
            'summer'   => $one("SELECT COUNT(*) c FROM members WHERE status='active' AND type='Summer'"),
            'graduates'=> $one("SELECT COUNT(*) c FROM members WHERE status IN ('graduated-ngg','graduated-vanguard')"),
            'suspended'=> $one("SELECT COUNT(*) c FROM members WHERE status='suspended'"),
            // Joined, not created: an import makes every record on one day.
            'new30'    => $one("SELECT COUNT(*) c FROM members WHERE COALESCE(NULLIF(joinDate, ''), SUBSTR(createdAt, 1, 10)) >= ?", [substr($since30, 0, 10)]),
        ],
        'mentors' => ['active' => $one("SELECT COUNT(*) c FROM mentors WHERE status='active'"), 'total' => $one("SELECT COUNT(*) c FROM mentors")],
        'applications' => [
            'new'     => $one("SELECT COUNT(*) c FROM applications WHERE status='new'"),
            'total'   => $one("SELECT COUNT(*) c FROM applications"),
        ],
        'volunteers' => [
            'pending' => $one("SELECT COUNT(*) c FROM applications WHERE kind='volunteer' AND status IN ('new','reviewing')"),
            'active'  => $one("SELECT COUNT(*) c FROM volunteers WHERE status='active'"),
            'unscreened' => $one("SELECT COUNT(*) c FROM volunteers WHERE status='active' AND safeguarding != 'cleared'"),
        ],
        'anchor' => [
            'journals'  => $one("SELECT COUNT(*) c FROM journal"),
            'verified'  => $one("SELECT COUNT(*) c FROM member_progress WHERE status='verified'"),
            'submitted' => $one("SELECT COUNT(*) c FROM member_progress WHERE status='submitted'"),
        ],
        'assignments' => [
            'published' => $one("SELECT COUNT(*) c FROM assignments WHERE status='published'"),
            'submitted' => $one("SELECT COUNT(*) c FROM assignment_submissions"),
            'toGrade'   => $one("SELECT COUNT(*) c FROM assignment_submissions WHERE status='submitted'"),
        ],
        'events'     => ['upcoming' => $one("SELECT COUNT(*) c FROM events WHERE status='published' AND startAt >= ?", [gmdate('Y-m-d\TH:i:s\Z')])],
        'newsletter' => ['subscribers' => $one("SELECT COUNT(*) c FROM newsletter WHERE status='subscribed'")],
        'messages'   => ['unread' => $one("SELECT COUNT(*) c FROM contact_messages WHERE status='new'"), 'total' => $one("SELECT COUNT(*) c FROM contact_messages")],
        'byCentre'   => $byCentre,
        'byTrack'    => $byTrack,
        'recent'     => db_all("SELECT a.at, a.actorId, a.event, a.subject, COALESCE(m.fullName, '') actorName
                                FROM audit_log a LEFT JOIN members m ON m.memberId = a.actorId ORDER BY a.id DESC LIMIT 12"),
        /* What the Control Room's Home lists as "Needs you": how many wait in
           each queue and how long the OLDEST has waited, so the list can be
           sorted oldest first (CONTROL_ROOM.md §3 attention). Counts only —
           every list behind them is gated and scoped where it is read. */
        'waiting'    => admin_overview_waiting(),
        /* Check-ins per week for twelve weeks. Grouped by day in SQL (portable
           to MySQL — no date functions) and bucketed into weeks here. A count
           of check-ins, not a rate: nothing records how many were expected. */
        'checkins'   => admin_overview_checkins(),
    ]];
}

function admin_overview_waiting(): array {
    $q = function (string $sql, array $a = []) {
        try { $r = db_row($sql, $a); return ['n' => (int)($r['c'] ?? 0), 'oldest' => (string)($r['o'] ?? '')]; }
        catch (Throwable $e) { return ['n' => 0, 'oldest' => '']; }
    };
    return [
        'applications' => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM applications WHERE status = 'new' AND kind != 'volunteer'"),
        'volunteers'   => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM applications WHERE kind = 'volunteer' AND status IN ('new','reviewing')"),
        'unscreened'   => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM volunteers WHERE status = 'active' AND safeguarding != 'cleared'"),
        'toGrade'      => $q("SELECT COUNT(*) c, MIN(submittedAt) o FROM assignment_submissions WHERE status = 'submitted'"),
        'messages'     => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM contact_messages WHERE status = 'new'"),
        'photos'       => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM photo_assets WHERE status IN ('pending_review','in_review')"),
        'photoChanges' => $q("SELECT COUNT(*) c, MIN(requestedAt) o FROM photo_change_requests WHERE status = 'pending'"),
        'approvals'    => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM admin_approvals WHERE status = 'pending'"),
        'requests'     => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM member_requests WHERE status = 'open'"),
        'comments'     => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM post_comments WHERE status = 'pending'"),
        'testimonials' => $q("SELECT COUNT(*) c, MIN(createdAt) o FROM testimonials WHERE status = 'new'"),
        'missions'     => $q("SELECT COUNT(*) c, MIN(submittedAt) o FROM member_progress WHERE status = 'submitted'"),
    ];
}

function admin_overview_checkins(int $weeks = 12): array {
    $today = new DateTimeImmutable('today', new DateTimeZone('UTC'));
    // Weeks end on the coming Sunday, so this week's Saturday is in the last bar.
    $end = $today->modify('sunday this week');
    $start = $end->modify('-' . ($weeks * 7 - 1) . ' days');
    $byDay = [];
    try {
        foreach (db_all("SELECT date, COUNT(*) c FROM attendance WHERE date >= ? AND date <= ? GROUP BY date",
                        [$start->format('Y-m-d'), $end->format('Y-m-d')]) as $r) $byDay[(string)$r['date']] = (int)$r['c'];
    } catch (Throwable $e) {}
    $out = [];
    for ($w = 0; $w < $weeks; $w++) {
        $ws = $start->modify('+' . ($w * 7) . ' days');
        $n = 0;
        for ($d = 0; $d < 7; $d++) $n += $byDay[$ws->modify("+$d days")->format('Y-m-d')] ?? 0;
        $out[] = ['from' => $ws->format('Y-m-d'), 'n' => $n];
    }
    return $out;
}

// ── 360° member detail ──────────────────────────────────────────────────────
function admin_member_detail(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (string)($p['memberId'] ?? '');
    /* Scope. This returns the whole record — journal entries with mood and
       body, date of birth, parent contacts, school — for a child. The
       roster was filtered and this was not, so every child in the
       organisation was readable by any admin who knew or guessed an id. */
    $sg = admin_member_scope_gate($g['requester'], $id);
    if (!$sg['ok']) return $sg;
    $m = $sg['member'];
    unset($m['totpSecret'], $m['totpBackup'], $m['passwordHash']);
    $m['socials'] = safe_json($m['socials'] ?? null);

    $stats = db_row('SELECT * FROM member_stats WHERE memberId = ? LIMIT 1', [$id]) ?: [];
    $journal = array_map(fn($r) => ['week' => (int)$r['week'], 'mood' => $r['mood'], 'body' => $r['body'], 'createdAt' => $r['createdAt']],
        db_all('SELECT week, mood, body, createdAt FROM journal WHERE memberId = ? ORDER BY createdAt DESC LIMIT 20', [$id]));

    $prog = db_row("SELECT COUNT(*) total, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) verified, SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) submitted FROM member_progress WHERE memberId = ?", [$id]) ?: [];

    $subs = db_all("SELECT s.assignmentId, s.status, s.grade, s.submittedAt, a.title, a.points FROM assignment_submissions s LEFT JOIN assignments a ON a.assignmentId = s.assignmentId WHERE s.memberId = ? ORDER BY s.submittedAt DESC LIMIT 25", [$id]);

    $mentorLink = db_row("SELECT ma.mentorId, ma.sessionId, m.fullName FROM mentor_assignments ma LEFT JOIN mentors m ON m.mentorId = ma.mentorId WHERE ma.memberId = ? AND ma.status='active' ORDER BY ma.startedAt DESC LIMIT 1", [$id]);

    $state = [];
    foreach (db_all('SELECT stateKey, stateValue FROM member_state WHERE memberId = ?', [$id]) as $r) $state[$r['stateKey']] = safe_json($r['stateValue']);

    return ['ok' => true, 'detail' => [
        'member' => $m,
        'stats' => ['xp' => (int)($stats['xpTotal'] ?? 0), 'level' => (int)($stats['level'] ?? 1), 'streak' => (int)($stats['streak'] ?? 0), 'badges' => safe_json($stats['badges'] ?? null) ?: []],
        'journal' => $journal,
        'progress' => ['total' => (int)($prog['total'] ?? 0), 'verified' => (int)($prog['verified'] ?? 0), 'submitted' => (int)($prog['submitted'] ?? 0)],
        'submissions' => array_map(fn($s) => ['assignmentId' => $s['assignmentId'], 'title' => $s['title'] ?: $s['assignmentId'], 'points' => (int)($s['points'] ?? 0), 'status' => $s['status'], 'grade' => $s['grade'] === null ? null : (int)$s['grade'], 'submittedAt' => $s['submittedAt']], $subs),
        'mentor' => $mentorLink ? ['mentorId' => $mentorLink['mentorId'], 'fullName' => $mentorLink['fullName'], 'sessionId' => $mentorLink['sessionId']] : null,
        'supporting' => function_exists('ms_supports_of') ? ms_supports_of($id) : [],
        'state' => $state,
    ]];
}

// ── Mentor assignment ───────────────────────────────────────────────────────
function admin_assign_mentor(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $memberId = (string)($p['memberId'] ?? '');
    $mentorId = (string)($p['mentorId'] ?? '');
    $sc = session_current();
    $sessionId = (string)($p['sessionId'] ?? ($sc['current']['sessionId'] ?? ''));
    if (!$memberId) return ['ok' => false, 'error' => 'no_member'];
    $sg = admin_member_scope_gate($g['requester'], $memberId); if (!$sg['ok']) return $sg;
    $mentor = null;
    if ($mentorId) {
        $mentor = db_row("SELECT * FROM mentors WHERE mentorId = ? AND status = 'active' LIMIT 1", [$mentorId]);
        if (!$mentor) return ['ok' => false, 'error' => 'mentor_not_found'];
    }
    $now = now_iso();
    /* A child has one mentor at a time. Every active link ends, whichever
     * session it was made in — ending only this session's left a pairing
     * from an earlier term active beside the new one, so the child sat in two
     * mentors' caseloads and counted toward both mentors' commitments. */
    db_exec("UPDATE mentor_assignments SET status='ended', endedAt=? WHERE memberId=? AND status='active'", [$now, $memberId]);
    if ($mentor) {
        $track = $mentor['tracks'] ? explode(',', (string)$mentor['tracks'])[0] : '';
        db_insert('mentor_assignments', ['memberId' => $memberId, 'mentorId' => $mentorId, 'track' => trim($track), 'sessionId' => $sessionId, 'status' => 'active', 'startedAt' => $now, 'endedAt' => '']);
        if (function_exists('ms_support_end_for_primary')) ms_support_end_for_primary($memberId, $mentorId);
        push_notification($memberId, ['kind' => 'mentor', 'title' => 'You have a mentor', 'body' => staff_public_name($mentorId, 'A mentor') . ' is now guiding your Anchor journey.', 'linkPage' => 'dashboard']);
    }
    $match = admin_assign_mentor_sync_match($memberId, $mentor, (string)$g['requester']['memberId']);
    audit('admin.mentor.assign', $g['requester']['memberId'], $memberId, ['mentorId' => $mentorId, 'sessionId' => $sessionId, 'match' => $match], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'match' => $match];
}

/**
 * Keep the match — the record the cadence tasks, the week-3 goal lock, pod
 * loads and the relationship phase are all read from — in step with a pairing
 * made by hand. admin_assign_mentor wrote only mentor_assignments, so a child
 * paired here had no tasks, unlocked goals and week 0; and after a
 * reassignment the old mentor kept the match, its tasks and the pod place.
 *
 *   no mentor (unpair)      → the live match closes
 *   an offer is open        → it is resolved in favour of this mentor
 *   a different mentor      → the old match closes (its tasks are cancelled)
 *                             and a new one starts: a new relationship has its
 *                             own Connect phase
 *   no match yet            → one is started, with its cadence
 *   the same mentor         → nothing changes
 *
 * NGG members only: pods are an NGG programme (ms_mentor_is_ngg); a Summer
 * School child keeps the plain assignment. Returns what it did.
 */
function admin_assign_mentor_sync_match(string $memberId, ?array $mentor, string $by): string {
    if (!function_exists('ms_live_match')) return 'none';
    $mem = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$memberId]);
    if (!$mem || !member_is_ngg($mem)) return 'not_ngg';
    $live = ms_live_match($memberId);
    $mentorId = $mentor ? (string)$mentor['mentorId'] : '';
    if ($live && (string)$live['status'] !== 'offered' && (string)$live['mentorId'] === $mentorId) return 'unchanged';
    if ($live) {
        if ((string)$live['status'] === 'offered') {
            db_exec("UPDATE mentor_match_offers SET status = 'declined' WHERE matchId = ? AND status = 'open'", [$live['matchId']]);
            if ($mentorId === '') { db_update('mentor_matches', ['status' => 'closed', 'closedAt' => now_iso(), 'closeReason' => 'Withdrawn by staff', 'updatedAt' => now_iso()], ['matchId' => $live['matchId']]); return 'offer_withdrawn'; }
            $start = gmdate('Y-m-d');
            db_update('mentor_matches', ['mentorId' => $mentorId, 'status' => 'active', 'phase' => 'connect', 'startedAt' => $start,
                'chosenBy' => 'staff', 'updatedAt' => now_iso()], ['matchId' => $live['matchId']]);
            $live['mentorId'] = $mentorId;
            ms_cadence_create($live, $start);
            return 'offer_resolved';
        }
        ms_set_status($live, 'closed', $mentorId === '' ? 'Unpaired by staff' : 'Reassigned by staff', $by);
        if ($mentorId === '') return 'closed';
    } elseif ($mentorId === '') {
        return 'none';
    }
    $start = gmdate('Y-m-d');
    $new = ['matchId' => ms_new_match_id(), 'memberId' => $memberId, 'mentorId' => $mentorId, 'centre' => (string)($mem['centre'] ?? ''),
        'track' => (string)($mem['track'] ?? ''), 'phase' => 'connect', 'status' => 'active', 'offeredAt' => '', 'startedAt' => $start,
        'chosenBy' => 'staff', 'agreementJson' => '', 'closingAt' => '', 'closedAt' => '', 'closeReason' => '', 'createdBy' => $by, 'updatedAt' => now_iso()];
    db_insert('mentor_matches', $new);
    ms_cadence_create($new, $start);
    return $live ? 'reassigned' : 'started';
}

// ── Applications review ─────────────────────────────────────────────────────
function admin_applications_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['kind'])) { $where[] = 'kind = ?'; $params[] = $p['kind']; }
    if (!empty($p['status'])) {
        /* One status or several ("new,reviewing,waitlist"): a waitlisted child
           stays on a screen someone can act from. */
        $sts = array_values(array_intersect(array_map('trim', explode(',', (string)$p['status'])), APP_STATUSES));
        /* `unfinished`: also a mentor application marked accepted with no mentor behind it. The Inbox's
           "Accept" used to set that status and nothing else — no mentor, no email — and the application
           then left every screen anyone could finish it from (owner, 17 Nov 2026: "she registered
           yesterday … we couldn't acknowledge it"). It comes back until somebody finishes it. */
        $stuck = !empty($p['unfinished']) ? " OR (kind = 'mentor' AND status = 'accepted' AND NOT EXISTS (SELECT 1 FROM mentors m WHERE lower(m.email) = lower(applications.email)))" : '';
        if ($sts) { $where[] = '(status IN (' . implode(',', array_fill(0, count($sts), '?')) . ')' . $stuck . ')'; $params = array_merge($params, $sts); }
    }
    /* A centre-scoped admin sees their centres' applicants only, filtered
       here, above the cap, never on the drawn page. */
    $scope = admin_centre_names_in_scope($g['requester']);
    if ($scope !== null) {
        if (!$scope) return ['ok' => true, 'applications' => [], 'scoped' => true];
        $where[] = 'centre IN (' . implode(',', array_fill(0, count($scope), '?')) . ')'; $params = array_merge($params, $scope);
    }
    $sql = 'SELECT * FROM applications' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    $rows = db_all($sql, $params);
    // Enrich each row so the admin detail view has everything structured:
    // a human reference, decoded courses, and a derived age from DOB.
    foreach ($rows as &$r) {
        $r['ref'] = function_exists('intake_reference') ? intake_reference((string)($r['kind'] ?? 'teen'), (int)($r['id'] ?? 0)) : '';
        $r['courses'] = $r['courses'] ? (json_decode((string)$r['courses'], true) ?: []) : [];
        $r['dobAge'] = !empty($r['dob']) && function_exists('dob_age') ? dob_age((string)$r['dob']) : null;
        // The Club application's other answers, and the agreements as given.
        $r['details'] = json_decode((string)($r['details'] ?? ''), true) ?: null;
        if (is_array($r['details'])) unset($r['details']['_edit']);   // a change code's hash is nobody's to read
    }
    unset($r);
    /* Agreements: the latest decision per type for each application, in one read. */
    $refs = array_values(array_filter(array_map(fn($r) => $r['details'] ? 'APP:' . $r['ref'] : '', $rows)));
    if ($refs) {
        $ph = implode(',', array_fill(0, count($refs), '?'));
        $agree = [];
        foreach (db_all("SELECT studentId, type, status, policyVersion FROM consents WHERE studentId IN ($ph) ORDER BY id", $refs) as $c) {
            $agree[(string)$c['studentId']][(string)$c['type']] = ['status' => (string)$c['status'], 'version' => (string)($c['policyVersion'] ?? '')];
        }
        foreach ($rows as &$r) if ($r['details']) $r['agreements'] = $agree['APP:' . $r['ref']] ?? (object)[];
        unset($r);
    }
    /* Already ours? An address already on a member record, and how many
       times it has applied before — both answered for the page in two reads. */
    $emails = array_map(static fn($r) => (string)($r['email'] ?? ''), $rows);
    $known = inbox_known_by_email($emails);
    $lower = array_values(array_unique(array_filter(array_map(static fn($e) => strtolower(trim($e)), $emails))));
    $times = [];
    if ($lower) {
        $ph = implode(',', array_fill(0, count($lower), '?'));
        foreach (db_all("SELECT lower(email) e, COUNT(*) c FROM applications WHERE lower(email) IN ($ph) GROUP BY lower(email)", $lower) as $x) $times[(string)$x['e']] = (int)$x['c'];
    }
    foreach ($rows as &$r) {
        $e = strtolower(trim((string)($r['email'] ?? '')));
        $r['known'] = $known[$e] ?? null;
        $r['earlierApps'] = max(0, ($times[$e] ?? 1) - 1);
        $r['messages'] = json_decode((string)($r['messages'] ?? ''), true) ?: [];
    }
    unset($r);
    return ['ok' => true, 'applications' => $rows, 'scoped' => $scope !== null];
}

const APP_STATUSES = ['new', 'reviewing', 'accepted', 'rejected', 'waitlist'];

/** The application, if this admin may act on it: [row, null] or [null, refusal]. */
function app_for_admin(array $g, int $id): array {
    $a = db_row('SELECT * FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return [null, ['ok' => false, 'error' => 'not_found']];
    if (!admin_centre_allowed($g['requester'], (string)($a['centre'] ?? ''))) return [null, ['ok' => false, 'error' => 'out_of_scope']];
    return [$a, null];
}

function admin_applications_set_status(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, APP_STATUSES, true)) return ['ok' => false, 'error' => 'bad_status'];
    [$a, $no] = app_for_admin($g, $id); if ($no) return $no;
    /* Accepting a child is Convert: it makes the member. Marking "accepted"
       here left an application nobody could convert any more. */
    if ($status === 'accepted' && (string)$a['kind'] === 'teen') return ['ok' => false, 'error' => 'use_convert', 'message' => 'Use Accept & create member: it makes the member record.'];
    /* The same for a mentor: "accepted" alone made no mentor and told nobody — a dead end for the applicant. */
    if ($status === 'accepted' && (string)$a['kind'] === 'mentor') return ['ok' => false, 'error' => 'use_convert', 'message' => 'Use Accept & create mentor: it makes the mentor record and emails them.'];
    if ((string)$a['status'] === $status) return ['ok' => true, 'unchanged' => true, 'told' => []];
    /* A child who is already a member is not waitlisted or declined from here:
       that sent the family a refusal after their welcome, while the member
       record stayed active. Member lifecycle lives on the member. */
    if (trim((string)($a['convertedMemberId'] ?? '')) !== '' && $status !== 'accepted')
        return ['ok' => false, 'error' => 'already_member', 'memberId' => (string)$a['convertedMemberId'], 'message' => 'This applicant is already member ' . $a['convertedMemberId'] . '. Change their membership on the member record.'];
    db_update('applications', ['status' => $status], ['id' => $id]);
    /* A waitlist or a refusal the family never hears about is a family still
       waiting by the phone. They are told in the desk's words when the desk
       wrote some, and in the standard line otherwise. `notify: false` files
       the status quietly; "reviewing" on its own says nothing. */
    $message = trim(mb_substr((string)($p['message'] ?? ''), 0, APPLICATION_MESSAGE_MAX));
    if ($message === '' && ($p['notify'] ?? true) !== false) $message = application_default_line($a, $status, trim(mb_substr((string)($p['reason'] ?? ''), 0, 300)));
    $told = $message !== '' ? application_tell($a, $g['requester'], $status, $message) : [];
    audit('admin.application.status', $g['requester']['memberId'], (string)$id, ['status' => $status, 'from' => (string)$a['status'], 'told' => $told], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'told' => $told];
}

const APPLICATION_MESSAGE_MAX = 2000;
const APPLICATION_MESSAGES_MAX = 20;

/** The standard words for a waitlist or a refusal; '' for a status that says nothing. */
function application_default_line(array $a, string $status, string $reason = ''): string {
    $first = explode(' ', trim((string)$a['name']))[0] ?: 'your child';
    $at = (string)($a['centre'] ?? '') !== '' ? ' at ' . $a['centre'] : '';
    if ($status === 'waitlist') return 'Thank you for applying. ' . $first . '’s place is on our waiting list' . $at . '. We will contact you as soon as a place opens.';
    if ($status === 'rejected') return 'Thank you for applying. We are not able to offer ' . $first . ' a place this time' . ($reason !== '' ? ': ' . rtrim($reason, '.') . '.' : '.') . ' You are welcome to apply again.';
    return '';
}

/**
 * The one way an applicant is told anything: email to the application's
 * address, a text to the main parent's phone (the email may be the child's
 * own), and the words kept on the application. Returns the channels that went.
 */
function application_tell(array $a, array $by, string $what, string $message): array {
    $list = json_decode((string)($a['messages'] ?? ''), true) ?: [];
    if (count($list) >= APPLICATION_MESSAGES_MAX) return [];
    $ref = function_exists('intake_reference') ? intake_reference((string)($a['kind'] ?? 'teen'), (int)$a['id']) : '';
    $sent = [];
    $email = strtolower(trim((string)($a['email'] ?? '')));
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) && function_exists('send_mail') && function_exists('email_template')) {
        $subject = ['waitlist' => 'Your NGG application: on the waiting list', 'rejected' => 'Your NGG application', 'accepted' => 'Your NGG application: accepted',
                    'ask' => 'About your NGG application: one thing we need', 'reviewing' => 'About your NGG application'][$what] ?? 'About your NGG application';
        if (@send_mail($email, $subject, email_template(['eyebrow' => 'Next Generation Genius · Applications', 'title' => $subject,
            'bodyHtml' => '<p>' . nl2br(esc_html($message)) . '</p>',
            'footNote' => ($ref !== '' ? 'Reference ' . $ref . '. ' : '') . 'Reply to this email if you have a question.']))) $sent[] = 'email';
    }
    $det = json_decode((string)($a['details'] ?? ''), true) ?: [];
    $ph = (string)($det['parent1Phone'] ?? '') ?: (string)($a['phone'] ?? '');
    if ($ph !== '' && function_exists('sms_send')) {
        $r = sms_send($ph, 'NGG: ' . mb_substr($message, 0, 300) . ($ref !== '' ? ' Ref ' . $ref . '.' : ''));
        if (!empty($r['ok'])) $sent[] = 'sms';
    }
    $list[] = ['at' => now_iso(), 'by' => (string)($by['memberId'] ?? ''), 'byName' => explode(' ', trim((string)($by['fullName'] ?? '')))[0] ?? '',
               'what' => $what, 'text' => $message, 'sent' => (bool)$sent, 'via' => $sent];
    db_update('applications', ['messages' => json_encode($list, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 'updatedAt' => now_iso()], ['id' => (int)$a['id']]);
    return $sent;
}

/**
 * admin.applications.message — ask the applicant for something (a photo, a
 * date of birth, which centre) without deciding. A new application moves to
 * "reviewing", so it reads as in hand, not untouched.
 */
function admin_applications_message(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    [$a, $no] = app_for_admin($g, (int)($p['id'] ?? 0)); if ($no) return $no;
    $message = trim(mb_substr((string)($p['message'] ?? ''), 0, APPLICATION_MESSAGE_MAX));
    if (mb_strlen($message) < 5) return ['ok' => false, 'error' => 'empty', 'message' => 'Write what you need from them.'];
    if (!filter_var(trim((string)($a['email'] ?? '')), FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'no_email', 'message' => 'This application has no email address to write to. Call the number on it instead.'];
    if (count(json_decode((string)($a['messages'] ?? ''), true) ?: []) >= APPLICATION_MESSAGES_MAX) return ['ok' => false, 'error' => 'too_many', 'message' => 'This application already has ' . APPLICATION_MESSAGES_MAX . ' messages. Decide it, or call them.'];
    $sent = application_tell($a, $g['requester'], 'ask', $message);
    if ((string)$a['status'] === 'new') db_update('applications', ['status' => 'reviewing'], ['id' => (int)$a['id']]);
    audit('admin.application.message', $g['requester']['memberId'], (string)$a['id'], ['sent' => $sent], (string)($p['ip'] ?? ''));
    if (!in_array('email', $sent, true)) return ['ok' => false, 'error' => 'not_sent', 'message' => 'The email did not go. It is kept on the application; try again, or call them.'];
    return ['ok' => true, 'sent' => $sent];
}

function admin_application_convert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    [$a, $no] = app_for_admin($g, $id); if ($no) return $no;
    if ($a['kind'] !== 'teen') return ['ok' => false, 'error' => 'only_teen_apps'];   // mentor apps → mentors, handled separately
    /* Converted already: the member it became, not a second one. Pressing
       again (or a second tab) is answered with the same member. */
    $made = trim((string)($a['convertedMemberId'] ?? ''));
    if ($made !== '' && db_row('SELECT 1 x FROM members WHERE memberId = ? LIMIT 1', [$made])) return ['ok' => true, 'memberId' => $made, 'existed' => true];
    if ((string)$a['status'] === 'rejected') return ['ok' => false, 'error' => 'rejected', 'message' => 'This application was declined. Set it back to reviewing first if that was a mistake.'];
    /* The age is checked again: an application can wait months, and the
       programme is for 10 to 17 year olds on the day they become a member. */
    $ageNow = !empty($a['dob']) && function_exists('dob_age') ? dob_age((string)$a['dob']) : -1;
    if ((string)($a['program'] ?? '') === 'anchor' && ($ageNow < 10 || $ageNow > 17)) return ['ok' => false, 'error' => 'bad_age', 'message' => 'NGG members are 10 to 17. This applicant is ' . ($ageNow < 0 ? 'missing a date of birth' : $ageNow) . '.'];
    $centreIn = trim((string)($p['centre'] ?? '')) ?: trim((string)($a['centre'] ?? ''));
    if ($centreIn === '') return ['ok' => false, 'error' => 'centre_required', 'message' => 'Choose the centre this member will attend.'];
    /* A centre staff type in here must be a real one; the application's own
       centre is kept as the family chose it (the form has always accepted a
       centre name the directory does not list yet). */
    if (trim((string)($p['centre'] ?? '')) !== '') {
        $cRow = db_row("SELECT name FROM centres WHERE lower(name) = ? AND status = 'active' LIMIT 1", [mb_strtolower($centreIn)]);
        if (!$cRow) return ['ok' => false, 'error' => 'bad_centre', 'message' => $centreIn . ' is not an active centre.'];
        $centreIn = (string)$cRow['name'];
    }
    if (!admin_centre_allowed($g['requester'], $centreIn)) return ['ok' => false, 'error' => 'out_of_scope'];
    $a['centre'] = $centreIn;
    // Don't double-provision.
    /* The same CHILD, not the same email: siblings share a parent's email, so
       a member already holding it is this applicant only when their date of
       birth (or, with none on file, their name) matches too. By email only
       when there is one: `lower(email) = ''` matches every member with none. */
    $__em = strtolower(trim((string)$a['email']));
    $existing = null;
    if ($__em !== '') {
        foreach (db_all('SELECT memberId, fullName, dob FROM members WHERE lower(email) = ? OR lower(COALESCE(parentEmail, \'\')) = ?', [$__em, $__em]) as $m) {
            $sameDob = (string)$m['dob'] !== '' && (string)$m['dob'] === (string)$a['dob'];
            $sameName = (string)$m['dob'] === '' && mb_strtolower(trim((string)$m['fullName'])) === mb_strtolower(trim((string)$a['name']));
            if ($sameDob || $sameName) { $existing = $m; break; }
        }
    }
    if ($existing) {
        db_update('applications', ['status' => 'accepted', 'convertedMemberId' => (string)$existing['memberId']], ['id' => $id]);
        return ['ok' => true, 'memberId' => $existing['memberId'], 'existed' => true];
    }
    // Summer applicants become Summer Students; Anchor/NGG applicants become
    // full NGG members. Falls back to Summer for legacy rows with no program.
    $type = ((string)($a['program'] ?? '') === 'anchor') ? 'NGG' : 'Summer';
    $newId = new_id($type === 'Summer' ? 'SUM' : 'NGG', 'members', 'memberId');

    /* Carry the intake across.
     *
     * This used to write eight fields and drop the rest, and the rest is the
     * part intake was standardised to REQUIRE. Two consequences, both silent:
     *
     *  · The guardian's address landed in `email` and nowhere else, while the
     *    fortnightly dues reminder and the guardian nudges both select on
     *    `parentEmail` — so every member admitted this way was counted into a
     *    `skipped.noEmail` bucket and never written to. The same defect was
     *    found and fixed on the Summer enrol path; this is the other half.
     *  · A date of birth is the one fact a programme for ten- to
     *    seventeen-year-olds cannot reconstruct later, and it was discarded at
     *    the exact moment the record became permanent.
     *
     * The teen intake asks for a parent's email and phone and nothing of the
     * young person's own, so those go to parentEmail/parentPhone. `email` keeps
     * the same value it always had — it is what sign-in and every existing
     * lookup use — and members.phone stays empty rather than being filled with
     * somebody else's number.
     */
    $intakeEmail = (string)$a['email'];
    $intakePhone = trim((string)($a['phone'] ?? ''));
    /* The day they start. It prices the first month's commitment fee (only the
       meeting days left are charged), so staff may set it when a child starts
       later than the day they are accepted. */
    $start = trim((string)($p['startDate'] ?? ''));
    if ($start !== '' && function_exists('membership_start_ok') && !membership_start_ok($start)) return ['ok' => false, 'error' => 'bad_start', 'detail' => 'The start date must be within a month before or three months after today.'];
    if ($start === '') $start = gmdate('Y-m-d');
    // An NGG member is filed under their division; the card prints its short label.
    $division = $type === 'NGG' ? (trim((string)($a['faculty'] ?? '')) ?: (function_exists('club_division_of') ? club_division_of((string)$a['track']) : '')) : '';
    /* An approved applicant becomes a MEMBER, so they are issued a member's
       printed ID at the same moment — see domain/member-id.php. */
    /* Claim the application by writing the member it becomes. Two presses at
       once both read "not converted" above; only one of these updates matches,
       so only one member, one printed ID and one invoice are made. The value
       is new and unique, so the claim CHANGES the row on MySQL as on SQLite. */
    $claimed = db_exec("UPDATE applications SET convertedMemberId = ? WHERE id = ? AND COALESCE(convertedMemberId, '') = ?", [$newId, $id, $made]);
    if (!$claimed) {
        $now = (string)(db_row('SELECT convertedMemberId FROM applications WHERE id = ?', [$id])['convertedMemberId'] ?? '');
        return $now !== '' ? ['ok' => true, 'memberId' => $now, 'existed' => true]
                           : ['ok' => false, 'error' => 'busy', 'message' => 'Someone else is converting this application. Refresh and look again.'];
    }
    $__m = [
        'memberId' => $newId, 'fullName' => $a['name'], 'email' => $intakeEmail,
        'type' => $type, 'status' => 'active', 'role' => 'member',
        'centre' => $a['centre'], 'track' => $a['track'] ?: '',
        'photoUrl' => (string)($a['photoUrl'] ?? ''),
        'dob' => (string)($a['dob'] ?? ''),
        'parentEmail' => $intakeEmail,
        'parentPhone' => $intakePhone,
        // When they joined, which public_member() publishes and the ID card
        // prints. It was left empty on every member who arrived this way.
        'joinDate' => $start,
        'disciplines' => $division !== '' && function_exists('club_division_short') ? club_division_short($division) : '',
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ];
    /* The courses the applicant chose become the member's courses, exactly
       (members.courses): their lessons and channels follow them from day one,
       instead of being guessed from the first course's name. */
    if ($type === 'NGG' && function_exists('member_courses_clean')) {
        $chose = json_decode((string)($a['courses'] ?? ''), true);
        [$picked] = member_courses_clean(array_merge(is_array($chose) ? $chose : [], [(string)($a['track'] ?? '')]));
        if ($picked) { $__m['courses'] = json_encode(array_slice($picked, 0, MEMBER_COURSES_MAX), JSON_UNESCAPED_UNICODE); if ($__m['track'] === '') $__m['track'] = $picked[0]; }
    }
    /* The Club application (v2026.10) knows more: the parent by name and
       their own number, the school and class, and the child's own mobile when
       it is not the parent's. The rest stays on the application. */
    $det = json_decode((string)($a['details'] ?? ''), true);
    if (is_array($det) && $det) {
        if (!empty($det['parent1Phone'])) $__m['parentPhone'] = (string)$det['parent1Phone'];
        if (!empty($det['parent1Name'])) $__m['parentName'] = (string)$det['parent1Name'];
        $sch = trim((string)($det['school'] ?? ''));
        if ($sch !== '') $__m['school'] = $sch;   // the class has its own field in the record (profileJson)
        // A school the family typed joins the picker's list once their child is accepted.
        // The answers a member row has no column for go to its record (profile-drive.php).
        $pj = array_filter(['sex' => (string)($a['sex'] ?? ''), 'class' => (string)($det['class'] ?? ''), 'address' => (string)($det['address'] ?? ''),
            'resState' => (string)($det['resState'] ?? ''), 'resLga' => (string)($det['resLga'] ?? ''), 'originState' => (string)($det['originState'] ?? ''),
            'nationality' => (string)($det['nationality'] ?? ''), 'classArm' => (string)($det['classArm'] ?? '')], fn($v) => $v !== '');
        if ($pj) $__m['profileJson'] = json_encode($pj, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($sch !== '' && function_exists('school_learn')) school_learn($sch, (string)($det['resLga'] ?? ''), (string)($det['resState'] ?? ''));
        if ($intakePhone !== '' && function_exists('club_phone') && club_phone($intakePhone) !== '' && club_phone($intakePhone) !== (string)($det['parent1Phone'] ?? '')) $__m['phone'] = $intakePhone;
    }
    try {
        if (trim((string)($__m['displayId'] ?? '')) === '' && member_is_ngg($__m)) $__m['displayId'] = member_mint_and_claim($__m, $newId);
        db_insert('members', $__m);
    } catch (\Throwable $e) {
        // Nothing was made: release the claim so the desk can try again.
        db_exec('UPDATE applications SET convertedMemberId = ? WHERE id = ? AND convertedMemberId = ?', [$made, $id, $newId]);
        throw $e;
    }
    /* The agreements were given on the application; the member inherits them,
       with the policy version and how they were given, never re-asked. */
    $aref = intake_reference('teen', (int)$a['id']);
    foreach (db_all("SELECT type, status, method, actorName, policyVersion, createdAt FROM consents WHERE studentId = ? ORDER BY id", ['APP:' . $aref]) as $c) {
        db_insert('consents', ['studentId' => $newId, 'type' => $c['type'], 'status' => $c['status'], 'method' => $c['method'],
            'actorName' => $c['actorName'], 'policyVersion' => (string)($c['policyVersion'] ?? ''), 'createdAt' => $c['createdAt']]);
    }
    member_cards_ensure($__m, 'intake', 'created');
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);

    /* Payment is asked for only now, after acceptance: one invoice — the
       membership fee and the pro-rated first month — and a private link to it.
       With fees switched off the member is accepted all the same, and the
       screen is told why no invoice went. */
    $invoice = null;
    if ($type === 'NGG' && function_exists('membership_invoice_create')) {
        $ir = membership_invoice_create($__m, (string)$g['requester']['memberId'], $id, $start);
        if (!empty($ir['ok'])) {
            // Sent after the welcome (below), which introduces it: the family reads them in that order.
            $invoice = ['invoiceId' => (string)$ir['invoice']['invoiceId'], 'total' => (int)$ir['invoice']['total'], 'sent' => false, 'to' => ''];
        } else {
            $invoice = ['error' => (string)($ir['error'] ?? 'failed')];
        }
    }
    /* One welcome that says what happens next (audit, 13 Nov 2026). It used to give the internal record
       number (NGG-2026-…) where the card and every later screen show the printed one (026-…), promise
       "start details shortly" that never came as such, and say nothing of the invoice or the family app —
       which then arrived as a second "Welcome to NGG". It goes after the invoice now, so it can name it.
       The set-password link stays: without it the member has no password, and every sign-in is a code
       emailed to the guardian's inbox. */
    $welcome = function_exists('auth_welcome_link') ? auth_welcome_link($newId) : '';
    $first = explode(' ', trim((string)$a['name']))[0] ?: 'your child';
    $num = (string)($__m['displayId'] ?? '') !== '' ? (string)$__m['displayId'] : $newId;
    $origin = (string)($GLOBALS['CONFIG']['app_origin'] ?? '');
    $steps = [];
    if ($welcome !== '') $steps[] = '<b>Set a password</b> with the button below (the link works for seven days). After that, ' . esc_html($first) . ' signs in with the member number <b>' . esc_html($num) . '</b> and the password, without waiting on this inbox.';
    if ($invoice && empty($invoice['error'])) $steps[] = '<b>Pay the joining invoice</b> (' . esc_html(fees_money_text((int)$invoice['total'])) . '). It follows this email, with a private link to pay.';
    if ($type === 'NGG') $steps[] = '<b>Parents and guardians:</b> follow ' . esc_html($first) . '’s attendance and progress on the NGG Family app at ' . esc_html($origin) . '/family. Sign in with this email address; ' . esc_html($first) . ' appears for our team to confirm, or ask ' . esc_html($first) . ' for their Anchor Circle code to link at once.';
    $startTxt = esc_html((string)$a['centre']) . ($start !== '' ? ', from ' . esc_html(gmdate('l j F', (int)strtotime($start . ' UTC'))) : '');
    @send_mail($intakeEmail, 'Welcome to Next Generation Genius',
        email_template([
            'title' => 'You\'re in, ' . $first . '.',
            'intro' => $type === 'Summer' ? 'Your place at Summer School is confirmed.' : $first . '’s place at Next Generation Genius is confirmed: ' . $startTxt . '.',
            'bodyHtml' => '<p style="margin:0 0 12px">' . esc_html($first) . '’s member number is <b>' . esc_html($num) . '</b>. It is printed on the NGG ID card, and it is how ' . esc_html($first) . ' signs in.</p>'
                . ($steps ? '<p style="margin:0 0 6px"><b>What happens next</b></p><ol style="margin:0;padding-left:20px">' . implode('', array_map(static fn($x) => '<li style="margin:0 0 8px">' . $x . '</li>', $steps)) . '</ol>' : ''),
            'ctaLabel' => $welcome !== '' ? 'Set a password' : 'Open the member portal',
            'ctaUrl' => $welcome !== '' ? $welcome : ($origin . '/dashboard'),
            'footNote' => 'Welcome to the movement.',
        ]));
    if ($invoice && empty($invoice['error'])) {
        $sent = membership_invoice_send($ir['invoice'], $__m);
        $invoice['sent'] = !empty($sent['ok']); $invoice['to'] = $sent['to'] ?? '';
    }
    audit('admin.application.convert', $g['requester']['memberId'], $newId, ['applicationId' => $id, 'type' => $type, 'start' => $start], (string)($p['ip'] ?? ''));
    if (function_exists('rcl_start_for_new_member')) rcl_start_for_new_member($newId, (string)$g['requester']['memberId']);   // registration checklist (domain/registration-checklist.php)
    return ['ok' => true, 'memberId' => $newId, 'invoice' => $invoice];
}

/** Correct a pending application's data before converting/approving it. Only
 *  supplied fields change. */
function admin_application_update(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    [$a, $no] = app_for_admin($g, $id); if ($no) return $no;
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    // Moving an applicant to a centre outside this admin's scope is the same as acting on it there.
    if (array_key_exists('centre', $d) && !admin_centre_allowed($g['requester'], trim((string)$d['centre']))) return ['ok' => false, 'error' => 'out_of_scope'];
    $row = [];
    if (array_key_exists('name', $d)) { $name = trim((string)$d['name']); if (strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name']; $row['name'] = substr($name, 0, 120); }
    if (array_key_exists('email', $d)) {
        $em = trim((string)$d['email']);
        if ($em !== '' && !filter_var($em, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
        $row['email'] = substr($em, 0, 160);
    }
    /* The programme decides what a conversion makes (an NGG member or a Summer
       account) and the date of birth is the age check at conversion: neither
       may be filed as free text. */
    if (array_key_exists('program', $d) && !in_array((string)$d['program'], ['anchor', 'summer'], true)) return ['ok' => false, 'error' => 'bad_program'];
    if (array_key_exists('dob', $d) && trim((string)$d['dob']) !== '') {
        $dd = trim((string)$d['dob']);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dd, $dm) || !checkdate((int)$dm[2], (int)$dm[3], (int)$dm[1]) || $dd > gmdate('Y-m-d')) return ['ok' => false, 'error' => 'bad_dob'];
    }
    if (array_key_exists('age', $d)) { $age = (int)$d['age']; if ($age !== 0 && ($age < 5 || $age > 100)) return ['ok' => false, 'error' => 'bad_age']; $row['age'] = $age; }
    foreach (['phone' => 48, 'centre' => 48, 'track' => 64, 'faculty' => 80, 'program' => 32, 'role' => 32, 'why' => 4000, 'firstName' => 80, 'lastName' => 80, 'otherName' => 80, 'sex' => 16, 'dob' => 16, 'photoUrl' => 512] as $f => $max) {
        if (array_key_exists($f, $d)) $row[$f] = substr(trim((string)$d[$f]), 0, $max);
    }
    if (array_key_exists('courses', $d)) {
        $courses = is_array($d['courses']) ? array_values(array_filter(array_map(fn($c) => substr(trim((string)$c), 0, 80), $d['courses']))) : [];
        $row['courses'] = json_encode(array_slice($courses, 0, 20));
    }
    if (!$row) return ['ok' => true, 'id' => $id];
    db_update('applications', $row, ['id' => $id]);
    audit('admin.application.update', $g['requester']['memberId'], (string)$id, ['fields' => array_keys($row)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'id' => $id];
}

/** Delete an application outright (spam, duplicate, test entry). */
function admin_application_delete(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    [$a, $no] = app_for_admin($g, $id); if ($no) return $no;
    db_exec('DELETE FROM applications WHERE id = ?', [$id]);
    audit('admin.application.delete', $g['requester']['memberId'], (string)$id, ['name' => (string)$a['name']], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Newsletter ──────────────────────────────────────────────────────────────
function admin_newsletter_list(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $rows = db_all('SELECT email, source, status, createdAt FROM newsletter ORDER BY id DESC LIMIT 5000');
    $active = count(array_filter($rows, fn($r) => (string)$r['status'] === 'subscribed'));
    return ['ok' => true, 'total' => count($rows), 'active' => $active, 'subscribers' => $rows];
}

/** A signed, per-email unsubscribe token (no DB column needed). */
function newsletter_unsub_token(string $email): string {
    $secret = (string)($GLOBALS['CONFIG']['cookie_secret'] ?? 'ngg');
    return substr(hash_hmac('sha256', 'unsub:' . strtolower(trim($email)), $secret), 0, 32);
}

/** Compose + send a newsletter to all current subscribers (bounded), each with
 *  a one-click unsubscribe link. Gated on 'inbox'. */
function admin_newsletter_send(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $subject = trim((string)($p['subject'] ?? ''));
    $body = trim((string)($p['body'] ?? ''));
    if (strlen($subject) < 3) return ['ok' => false, 'error' => 'subject_too_short'];
    if (strlen($body) < 10) return ['ok' => false, 'error' => 'body_too_short'];
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    $subs = db_all("SELECT email FROM newsletter WHERE status = 'subscribed' LIMIT 2000");
    $sent = 0; $skipped = 0;
    foreach ($subs as $s) {
        $to = trim((string)$s['email']);
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL) || $sent >= 2000) { $skipped++; continue; }
        $unsub = $origin . '/api/public/unsubscribe.php?e=' . rawurlencode($to) . '&t=' . newsletter_unsub_token($to);
        $html = email_template([
            'title' => $subject,
            'bodyHtml' => '<div style="font-size:15px;line-height:1.65">' . nl2br(esc_html($body)) . '</div>',
            'footNote' => 'You are receiving this because you subscribed to Next Generation Genius updates.',
        ]) . '<div style="text-align:center;margin:-18px 0 24px;font-family:Arial,sans-serif"><a href="' . esc_html($unsub) . '" style="color:#8A93A6;font-size:12px">Unsubscribe</a></div>';
        if (send_mail($to, $subject, $html)) $sent++; else $skipped++;
    }
    audit('newsletter.send', $g['requester']['memberId'], '', ['sent' => $sent, 'skipped' => $skipped], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sent' => $sent, 'skipped' => $skipped, 'total' => count($subs)];
}

// ── Contact messages ─────────────────────────────────────────────────────────
/** The longest reply the inbox sends. A reply, not a newsletter. */
const CONTACT_REPLY_MAX = 5000;

/**
 * The contact inbox. Each message carries its conversation — every reply sent
 * from the Control Room, oldest first — and how many OTHER messages the same
 * address has sent, so whoever opens it knows whether this is a first contact
 * or the fourth. Both are one grouped query each, never one per message.
 */
/**
 * Who is this address, to us? For the inbox: a message or an application
 * from somebody already on the books is answered differently — "your son's
 * card" rather than "how to apply" — and the desk should be one press from
 * their record. One query per table for a whole page, never one per row.
 *
 * @return array<string, array{kind:string, memberId:string, name:string, centre:string}>  lower(email) → who
 */
function inbox_known_by_email(array $emails): array {
    $emails = array_values(array_unique(array_filter(array_map(static fn($e) => strtolower(trim((string)$e)), $emails), static fn($e) => $e !== '' && str_contains($e, '@'))));
    if (!$emails) return [];
    $ph = implode(',', array_fill(0, count($emails), '?'));
    $out = [];
    foreach (db_all("SELECT memberId, fullName, centre, type, lower(email) e, lower(COALESCE(parentEmail,'')) pe FROM members
                     WHERE lower(email) IN ($ph) OR lower(COALESCE(parentEmail,'')) IN ($ph) ORDER BY id", array_merge($emails, $emails)) as $m) {
        foreach ([[(string)$m['e'], 'member'], [(string)$m['pe'], 'parent']] as [$e, $kind]) {
            if ($e === '' || !in_array($e, $emails, true) || isset($out[$e])) continue;
            $out[$e] = ['kind' => $kind, 'memberId' => (string)$m['memberId'], 'name' => (string)$m['fullName'], 'centre' => (string)($m['centre'] ?? ''),
                        'programme' => (string)($m['type'] ?? '') === 'Summer' ? 'Summer School' : 'NGG'];
        }
    }
    try {
        foreach (db_all("SELECT guardianId, fullName, lower(email) e FROM guardians WHERE lower(email) IN ($ph) AND status = 'active'", $emails) as $g) {
            if (!isset($out[(string)$g['e']])) $out[(string)$g['e']] = ['kind' => 'guardian', 'memberId' => '', 'name' => (string)$g['fullName'], 'centre' => '', 'programme' => ''];
        }
    } catch (\Throwable $e) {}
    return $out;
}

function admin_contact_list(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = $p['status']; }
    if (!empty($p['purpose'])) { $where[] = 'purpose = ?'; $params[] = $p['purpose']; }
    $sql = 'SELECT * FROM contact_messages' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    $unread = (int)(db_row("SELECT COUNT(*) c FROM contact_messages WHERE status='new'")['c'] ?? 0);
    $rows = db_all($sql, $params);
    if ($rows) {
        $ids = array_map(static fn($r) => (int)$r['id'], $rows);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $replies = [];
        foreach (db_all("SELECT id, messageId, body, sentBy, sentByName, sentAt, channel FROM contact_replies WHERE messageId IN ($ph) ORDER BY id ASC", $ids) as $r) {
            $replies[(int)$r['messageId']][] = $r;
        }
        $emails = array_values(array_unique(array_filter(array_map(static fn($r) => strtolower(trim((string)$r['email'])), $rows))));
        $byEmail = [];
        if ($emails) {
            $eph = implode(',', array_fill(0, count($emails), '?'));
            foreach (db_all("SELECT lower(email) e, COUNT(*) c FROM contact_messages WHERE lower(email) IN ($eph) GROUP BY lower(email)", $emails) as $r) $byEmail[(string)$r['e']] = (int)$r['c'];
        }
        $known = inbox_known_by_email($emails);
        foreach ($rows as &$r) {
            $r['replies'] = $replies[(int)$r['id']] ?? [];
            $r['earlier'] = max(0, ($byEmail[strtolower(trim((string)$r['email']))] ?? 1) - 1);
            $r['known'] = $known[strtolower(trim((string)$r['email']))] ?? null;
        }
        unset($r);
    }
    return ['ok' => true, 'messages' => $rows, 'unread' => $unread];
}

function admin_contact_status(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['new', 'read', 'replied', 'archived'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('contact_messages', ['status' => $status], ['id' => $id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('admin.contact.status', $g['requester']['memberId'], (string)$id, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/**
 * Reply to a contact message from the inbox. The reply is emailed to the
 * sender with their message quoted under it, kept on the record, and the
 * message moves to `replied` — or `archived` when the reply closes it.
 *
 * Nothing is recorded unless the mail actually left: a reply that says it was
 * sent when it was not is worse than one that says "try again".
 */
function admin_contact_reply(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $body = trim(str_replace("\r\n", "\n", (string)($p['body'] ?? '')));
    if ($body === '') return ['ok' => false, 'error' => 'reply_empty', 'message' => 'Write the reply first.'];
    if (mb_strlen($body) > CONTACT_REPLY_MAX) return ['ok' => false, 'error' => 'reply_too_long', 'message' => 'A reply is at most ' . CONTACT_REPLY_MAX . ' characters.'];
    $m = db_row('SELECT * FROM contact_messages WHERE id = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    $me = $g['requester'];
    /* A message that came in on WhatsApp (domain/kapso.php) is answered on WhatsApp: as plain text inside the
       24 hours after they last wrote, otherwise as the approved template. Nothing is recorded unless it went. */
    if ((string)$m['purpose'] === 'whatsapp') {
        if (!function_exists('kapso_on') || !kapso_on()) return ['ok' => false, 'error' => 'whatsapp_off', 'message' => 'WhatsApp (Kapso) is not set up, so this cannot be answered from here.'];
        $phone = (string)$m['phone'];
        $sign = "\n\n— " . (string)($me['fullName'] ?? 'The NGG team') . ', Next Generation Genius';
        $r = kapso_window_open($phone) ? kapso_send_text($phone, $body . $sign) : kapso_send_template($phone, $body . $sign);
        if (empty($r['ok'])) return ['ok' => false, 'error' => 'send_failed', 'message' => 'WhatsApp did not accept the reply, so nothing was recorded. Try again in a moment.'];
        $at = now_iso();
        db_insert('contact_replies', ['messageId' => $id, 'body' => $body, 'sentBy' => (string)$me['memberId'], 'sentByName' => (string)($me['fullName'] ?? ''), 'sentAt' => $at, 'channel' => 'whatsapp']);
        $status = !empty($p['close']) ? 'archived' : 'replied';
        db_update('contact_messages', ['status' => $status], ['id' => $id]);
        audit('admin.contact.reply', $me['memberId'], (string)$id, ['ref' => (string)$m['ref'], 'chars' => mb_strlen($body), 'status' => $status, 'channel' => 'whatsapp'], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'status' => $status, 'reply' => ['body' => $body, 'sentBy' => (string)$me['memberId'], 'sentByName' => (string)($me['fullName'] ?? ''), 'sentAt' => $at, 'channel' => 'whatsapp']];
    }
    $to = trim((string)$m['email']);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'no_email', 'message' => 'This message has no email address to reply to.'];

    $first = explode(' ', trim((string)$m['name']))[0] ?: 'there';
    $subject = 'Re: ' . ((string)$m['subject'] !== '' ? (string)$m['subject'] : 'Your message to Next Generation Genius') . ' (' . (string)$m['ref'] . ')';
    $html = email_template([
        'title' => 'A reply to your message',
        'intro' => 'Hello ' . $first . ',',
        'bodyHtml' => '<div style="font-size:15px;line-height:1.65">' . nl2br(esc_html($body)) . '</div>'
            . '<p style="margin:18px 0 0;font-size:14px">— ' . esc_html((string)($me['fullName'] ?? 'The NGG team')) . ', Next Generation Genius</p>'
            . '<div style="margin-top:22px;padding:12px 14px;border-left:3px solid #d6d6d3;color:#5d5d63;font-size:13px;line-height:1.55">'
            . '<b>You wrote' . ((string)$m['createdAt'] !== '' ? ' on ' . esc_html(substr((string)$m['createdAt'], 0, 10)) : '') . ':</b><br>'
            . nl2br(esc_html((string)$m['message'])) . '</div>',
        'footNote' => 'Reference ' . (string)$m['ref'] . ' — reply to this email to continue the conversation.',
    ]);
    if (!send_mail($to, $subject, $html)) {
        return ['ok' => false, 'error' => 'send_failed', 'message' => 'The email could not be sent, so nothing was recorded. Try again in a moment.'];
    }
    $at = now_iso();
    db_insert('contact_replies', ['messageId' => $id, 'body' => $body, 'sentBy' => (string)$me['memberId'],
        'sentByName' => (string)($me['fullName'] ?? ''), 'sentAt' => $at, 'channel' => 'email']);
    $status = !empty($p['close']) ? 'archived' : 'replied';
    db_update('contact_messages', ['status' => $status], ['id' => $id]);
    audit('admin.contact.reply', $me['memberId'], (string)$id, ['ref' => (string)$m['ref'], 'chars' => mb_strlen($body), 'status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'status' => $status,
            'reply' => ['body' => $body, 'sentBy' => (string)$me['memberId'], 'sentByName' => (string)($me['fullName'] ?? ''), 'sentAt' => $at, 'channel' => 'email']];
}

// ── Site settings ───────────────────────────────────────────────────────────
function admin_settings_get(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    return ['ok' => true, 'settings' => [
        'applications_open'         => (setting_raw('applications_open') ?? '1') !== '0',
        'mentor_applications_open'  => (setting_raw('mentor_applications_open') ?? '1') !== '0',
        'volunteer_applications_open' => (setting_raw('volunteer_applications_open') ?? '1') !== '0',
        'ngg_volunteer_applications_open' => (setting_raw('ngg_volunteer_applications_open') ?? '1') !== '0',
        'volunteer_sms_notify'      => (setting_raw('volunteer_sms_notify') ?? '1') !== '0',
        'checkin_state_emails'      => (setting_raw('checkin_state_emails') ?? '1') !== '0',
        'qotw_mail'                 => (setting_raw('qotw_mail') ?? '1') !== '0',
        'companion_enabled'         => (setting_raw('companion_enabled') ?? '1') !== '0',
        'volunteer_session_hours'   => (int)(setting_raw('volunteer_session_hours') ?: 4),
        'session_idle_admin'        => session_idle_max(true),
        'featured_session_id'       => setting_raw('featured_session_id') ?? '',
        'geofence_enabled'          => setting_raw('geofence_enabled') === '1',
        'face_check_enabled'        => setting_raw('face_check_enabled') === '1',
        'photo_gate_issuance'       => setting_raw('photo_gate_issuance') === '1',
        'intake_photo_required'     => (setting_raw('intake_photo_required') ?? '1') !== '0',
        'site_content'              => site_content(),
        'idcard'                    => idcard_program(),
        'idcardMember'              => idcard_program('member'),
        'attendance'                => attendance_settings(),
    ]];
}

function admin_settings_set(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    foreach (['applications_open', 'mentor_applications_open', 'volunteer_applications_open', 'ngg_volunteer_applications_open', 'volunteer_sms_notify', 'checkin_state_emails', 'qotw_mail', 'companion_enabled', 'geofence_enabled', 'photo_gate_issuance', 'intake_photo_required', 'face_check_enabled'] as $k) {
        if (array_key_exists($k, $data)) setting_set($k, !empty($data[$k]) ? '1' : '0', $g['requester']['memberId']);
    }
    if (array_key_exists('volunteer_session_hours', $data)) setting_set('volunteer_session_hours', (string)max(1, min(12, (int)$data['volunteer_session_hours'])), $g['requester']['memberId']);
    /* How long a staff session may sit idle. This was reachable only by editing
     * config.php, which is not something the people it affects can do — so the
     * answer to "the admin keeps signing out" was a developer, every time.
     * Clamped in session_idle_max(); 0 means no idle limit at all, which is a
     * real choice for a locked office and a terrible one for a shared desk. */
    if (array_key_exists('session_idle_admin', $data)) {
        $v = (int)$data['session_idle_admin'];
        setting_set('session_idle_admin', (string)($v <= 0 ? 0 : max(300, min(86400, $v))), $g['requester']['memberId']);
    }
    if (array_key_exists('featured_session_id', $data)) setting_set('featured_session_id', (string)$data['featured_session_id'], $g['requester']['memberId']);
    // Homepage / site copy — validated + length-capped, stored as one JSON blob.
    if (array_key_exists('site_content', $data) && is_array($data['site_content'])) {
        setting_set('site_content', site_content_clean($data['site_content']), $g['requester']['memberId']);
    }
    // ID-card branding block (program/year/motto/website/phone/logos).
    if (array_key_exists('idcard', $data) && is_array($data['idcard'])) {
        idcard_program_save($data['idcard'], $g['requester']['memberId']);
    }
    // The NGG member card's own fields (its back's email and social handle).
    if (array_key_exists('idcardMember', $data) && is_array($data['idcardMember'])) {
        idcard_program_save(array_intersect_key($data['idcardMember'], array_flip(['email', 'socialHandle'])), $g['requester']['memberId'], 'member');
    }
    // Attendance punctuality (resumption time per member type + grace).
    if (array_key_exists('attendance', $data) && is_array($data['attendance'])) {
        attendance_settings_save($data['attendance'], $g['requester']['memberId']);
    }
    audit('admin.settings.set', $g['requester']['memberId'], '', ['keys' => array_keys((array)$data)], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// Diagnose email delivery: send a real message and report exactly what happened
// (mode = smtp|php_mail, delivered, and the captured error) so "emails don't
// deliver" is debuggable instead of silent.
function admin_mail_test(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $to = trim((string)($p['to'] ?? ''));
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) $to = (string)($g['requester']['email'] ?? '');
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'no_valid_recipient'];
    $mode = function_exists('mail_mode')
        ? mail_mode()
        : (!empty($GLOBALS['CONFIG']['mail']['smtp']['host'] ?? '') ? 'smtp' : 'php_mail');
    $GLOBALS['__mail_last_error'] = '';
    $delivered = send_mail($to, 'NGG email delivery test', email_template([
        'title' => 'Delivery test',
        'intro' => 'If you can read this, outbound email is working.',
        'bodyHtml' => '<p style="margin:0">Sent from the Control Room email diagnostic (' . esc_html($mode) . ' mode).</p>',
        'footNote' => 'Automated delivery test — no action needed.',
    ]));
    audit('admin.mail.test', $g['requester']['memberId'], $to, ['mode' => $mode, 'delivered' => $delivered], (string)($p['ip'] ?? ''));

    // Surface the resolved sender config so SPF/DKIM alignment problems (the
    // usual "it sends but lands in spam / gets rejected" cause) are visible.
    $from = mail_from();
    $smtp = (array)($GLOBALS['CONFIG']['mail']['smtp'] ?? []);
    $fromDomain = function_exists('mail_domain_of') ? mail_domain_of((string)$from['email']) : '';
    $hints = [];
    if ($mode === 'php_mail') {
        $hints[] = 'No SMTP, Apps Script or Resend configured — using PHP mail(), which most shared hosts silently drop. Easiest reliable fix: deploy apps-script/Code.gs and set apps_script_url (Google relays the mail), or set mail.resend_key, in api/config.php.';
    } elseif ($mode === 'apps_script') {
        $last = (string)($GLOBALS['__mail_last_error'] ?? '');
        $hints[] = str_contains($last, 'apps_script: Bad token')
            ? 'The Apps Script refused the secret. In Settings → API keys → Google Apps Script, press Change and paste the exact SHARED_SECRET (or SECRET) from the script’s Project Settings → Script properties, then send the test again.'
            : 'Sending through the Google Apps Script Web App (MailApp), from the Google account that deployed it. It is set in Settings → API keys → Google Apps Script.';
    } elseif ($mode === 'resend') {
        $hints[] = 'Using the Resend HTTPS API. Make sure mail.from_email is on a domain you have verified in the Resend dashboard, or delivery will be rejected.';
    }
    $isGmail = $mode === 'smtp' && preg_match('/gmail|googlemail|google\.com|smtp\.google/i', (string)($smtp['host'] ?? ''));
    $authUser = strtolower(trim((string)($smtp['user'] ?? '')));
    $fromEmail = strtolower((string)$from['email']);
    if ($isGmail) {
        // Gmail-specific: it rewrites the From to the authenticated account
        // unless it's a verified alias, and requires an App Password.
        if ($authUser !== '' && $fromEmail !== $authUser) {
            $hints[] = "Gmail rewrites the From to the signed-in account unless it's a verified alias. Recipients will see {$authUser}, not {$fromEmail}. Either set mail.from_email to {$authUser}, or add {$fromEmail} under Gmail → Settings → Accounts → \"Send mail as\" (Workspace) first.";
        }
        $hints[] = "Gmail SMTP needs an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password. Use smtp.gmail.com with port 587/secure 'tls' or 465/'ssl'. Consumer Gmail caps at ~500 messages/day.";
    } else {
        // Envelope/From must be a domain you're authorized to send for, or SPF fails.
        if ($fromDomain && $fromDomain !== 'localhost' && !preg_match('/afrovanguard\./i', $fromDomain)) {
            $hints[] = "From domain is {$fromDomain}. Make sure its DNS has SPF (and ideally DKIM/DMARC) authorizing this relay, or mail will be spam-filtered.";
        }
        if ($mode === 'smtp' && $authUser !== '' && $fromDomain && stripos($authUser, (string)$fromDomain) === false) {
            $hints[] = "SMTP auth user doesn't match the From domain ({$fromDomain}) — many relays reject or spam-flag a mismatched From. Align mail.from_email with the authenticated mailbox.";
        }
        // A deploy that missed api/_lib/phpmailer/ silently falls back to the
        // hand-rolled SMTP client, which fails on Gmail. Flag it explicitly.
        if ($mode === 'smtp' && !(function_exists('ngg_load_phpmailer') && ngg_load_phpmailer())) {
            $hints[] = 'PHPMailer is NOT present on the server (api/_lib/phpmailer/ missing from this deploy) — SMTP is using the fallback client, which fails against Gmail. Re-upload api/_lib/phpmailer/.';
        }
    }
    // When it did not go: name the likely cause from the error, and where to fix it now.
    $errText = text_utf8((string)($GLOBALS['__mail_last_error'] ?? ''));
    if (!$delivered) {
        if (preg_match('/connect|timed? ?out|network is unreachable|refused|could not connect/i', $errText)) {
            $hints[] = 'This server could not reach the mail server at all — most shared hosts block outbound SMTP ports (25, 465, 587). Use Resend instead (email over HTTPS): Settings → API keys → Resend, and remove the SMTP server there or in api/config.php.';
        } elseif (preg_match('/auth|535|534|username|password|credentials/i', $errText)) {
            $hints[] = 'The mail server refused the sign-in. For Gmail or Workspace use an App Password, not the account password. Change it in Settings → API keys → Email (SMTP).';
        }
        $hints[] = 'SMTP, Resend and the sender address can all be set in Control Room → Settings → API keys, without editing api/config.php.';
    }
    $phpmailer = function_exists('ngg_load_phpmailer') && ngg_load_phpmailer();
    // ok:true = the diagnostic ran; `delivered` says whether the send succeeded.
    return [
        'ok' => true, 'delivered' => $delivered, 'to' => $to, 'mode' => $mode,
        'phpmailer' => $phpmailer,
        'error' => $errText,
        'from' => (string)$from['email'], 'fromName' => (string)$from['name'],
        'replyTo' => (string)$from['replyTo'], 'fromDomain' => $fromDomain,
        'smtp' => $mode === 'smtp' ? [
            'host' => (string)($smtp['host'] ?? ''), 'port' => (int)($smtp['port'] ?? 587),
            'secure' => (string)($smtp['secure'] ?? 'tls'), 'authUser' => (string)($smtp['user'] ?? ''),
        ] : null,
        'hints' => $hints,
    ];
}

/** Editable site copy, merged over defaults so the homepage never breaks. */
function site_content_defaults(): array {
    return [
        'heroEyebrowLive'  => 'Live now',
        'heroTitle1'       => "Africa's next geniuses",
        'heroTitle2'       => 'are',
        'heroEmphasis'     => 'not waiting',
        'heroSubhead'      => 'A twelve-week growth journey for teenagers, 10–17. From summer student to vanguard leader — by mission, mentorship and the discipline of public work.',
        'heroCtaPrimary'   => 'Join the Summer Program',
        'heroCtaSecondary' => 'Explore Anchor 12',
        'movementTagline'  => 'Not a school. Not a club. The structured runway from teenage potential to African leadership — built mission by mission, week by week.',
    ];
}
function site_content(): array {
    $stored = setting_get('site_content');
    return array_merge(site_content_defaults(), is_array($stored) ? $stored : []);
}
function site_content_clean(array $in): array {
    $out = [];
    foreach (site_content_defaults() as $k => $def) {
        if (!array_key_exists($k, $in)) continue;
        $v = trim((string)$in[$k]);
        if ($v !== '') $out[$k] = substr($v, 0, $k === 'heroSubhead' || $k === 'movementTagline' ? 400 : 120);
    }
    return $out;
}

function public_site_content(array $p = []): array {
    // Homepage promo banner — served only while active (unexpired).
    $promo = setting_get('homepage_promo');
    $activePromo = null;
    if (is_array($promo) && !empty($promo['text'])) {
        $exp = (string)($promo['expires'] ?? '');
        if ($exp === '' || strtotime($exp) >= time()) {
            $activePromo = ['text' => (string)$promo['text'], 'ctaLabel' => (string)($promo['ctaLabel'] ?? ''), 'ctaUrl' => (string)($promo['ctaUrl'] ?? ''), 'expires' => $exp];
        }
    }
    return ['ok' => true, 'site' => site_content(), 'promo' => $activePromo];
}
