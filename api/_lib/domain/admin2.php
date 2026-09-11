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
            'activeVolunteers' => $one("SELECT COUNT(*) c FROM volunteers WHERE status = 'active'"),
            'presentVolToday'  => $one("SELECT COUNT(DISTINCT a.studentId) c FROM attendance a JOIN volunteers v ON v.volunteerId = a.studentId WHERE a.date = ?", [$today]),
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
    return ['ok' => true, 'ai' => ai_status($probe), 'anyEnabled' => ai_enabled()];
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
            'new30'    => $one("SELECT COUNT(*) c FROM members WHERE createdAt >= ?", [$since30]),
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
        'recent'     => db_all("SELECT at, actorId, event, subject FROM audit_log ORDER BY id DESC LIMIT 12"),
    ]];
}

// ── 360° member detail ──────────────────────────────────────────────────────
function admin_member_detail(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (string)($p['memberId'] ?? '');
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    unset($m['totpSecret']);
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
    // End any current active links for this member+session.
    db_exec("UPDATE mentor_assignments SET status='ended', endedAt=? WHERE memberId=? AND sessionId=? AND status='active'", [now_iso(), $memberId, $sessionId]);
    if ($mentorId) {
        $mentor = db_row('SELECT * FROM mentors WHERE mentorId = ? LIMIT 1', [$mentorId]);
        $track = $mentor && $mentor['tracks'] ? explode(',', (string)$mentor['tracks'])[0] : '';
        db_insert('mentor_assignments', ['memberId' => $memberId, 'mentorId' => $mentorId, 'track' => trim($track), 'sessionId' => $sessionId, 'status' => 'active', 'startedAt' => now_iso(), 'endedAt' => '']);
        push_notification($memberId, ['kind' => 'mentor', 'title' => 'You have a mentor', 'body' => ($mentor['fullName'] ?? 'A mentor') . ' is now guiding your Anchor journey.', 'linkPage' => 'dashboard']);
    }
    audit('admin.mentor.assign', $g['requester']['memberId'], $memberId, ['mentorId' => $mentorId, 'sessionId' => $sessionId], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

// ── Applications review ─────────────────────────────────────────────────────
function admin_applications_list(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['kind'])) { $where[] = 'kind = ?'; $params[] = $p['kind']; }
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = $p['status']; }
    $sql = 'SELECT * FROM applications' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    $rows = db_all($sql, $params);
    // Enrich each row so the admin detail view has everything structured:
    // a human reference, decoded courses, and a derived age from DOB.
    foreach ($rows as &$r) {
        $r['ref'] = function_exists('intake_reference') ? intake_reference((string)($r['kind'] ?? 'teen'), (int)($r['id'] ?? 0)) : '';
        $r['courses'] = $r['courses'] ? (json_decode((string)$r['courses'], true) ?: []) : [];
        $r['dobAge'] = !empty($r['dob']) && function_exists('dob_age') ? dob_age((string)$r['dob']) : null;
    }
    unset($r);
    return ['ok' => true, 'applications' => $rows];
}

function admin_applications_set_status(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $status = (string)($p['status'] ?? '');
    if (!in_array($status, ['new', 'reviewing', 'accepted', 'rejected', 'waitlist'], true)) return ['ok' => false, 'error' => 'bad_status'];
    $n = db_update('applications', ['status' => $status], ['id' => $id]);
    if (!$n) return ['ok' => false, 'error' => 'not_found'];
    audit('admin.application.status', $g['requester']['memberId'], (string)$id, ['status' => $status], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

function admin_application_convert(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row('SELECT * FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    if ($a['kind'] !== 'teen') return ['ok' => false, 'error' => 'only_teen_apps'];   // mentor apps → mentors, handled separately
    // Don't double-provision.
    $existing = db_row('SELECT memberId FROM members WHERE lower(email) = ? LIMIT 1', [strtolower((string)$a['email'])]);
    if ($existing) { db_update('applications', ['status' => 'accepted'], ['id' => $id]); return ['ok' => true, 'memberId' => $existing['memberId'], 'existed' => true]; }
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
    /* An approved applicant becomes a MEMBER, so they are issued a member's
       printed ID at the same moment — see domain/member-id.php. */
    $__m = [
        'memberId' => $newId, 'fullName' => $a['name'], 'email' => $intakeEmail,
        'type' => $type, 'status' => 'active', 'role' => 'member',
        'centre' => $a['centre'] ?: 'Egbeda', 'track' => $a['track'] ?: '',
        'photoUrl' => (string)($a['photoUrl'] ?? ''),
        'dob' => (string)($a['dob'] ?? ''),
        'parentEmail' => $intakeEmail,
        'parentPhone' => $intakePhone,
        // When they joined, which public_member() publishes and the ID card
        // prints. It was left empty on every member who arrived this way.
        'joinDate' => gmdate('Y-m-d'),
        'createdAt' => now_iso(), 'updatedAt' => now_iso(),
    ];
    if (trim((string)($__m['displayId'] ?? '')) === '') $__m['displayId'] = member_mint_display_id($__m);
    db_insert('members', $__m);
    db_update('applications', ['status' => 'accepted'], ['id' => $id]);

    /* A way in that the member owns.
     *
     * The welcome email pointed at the portal and gave no means of opening it:
     * the new member has no password, so signing in means a code emailed to
     * the address on file — their guardian's — every time. A set-password link
     * turns that into one handoff instead of a standing dependency. */
    $welcome = function_exists('auth_welcome_link') ? auth_welcome_link($newId) : '';
    @send_mail($intakeEmail, 'Welcome to Next Generation Genius',
        email_template([
            'title' => 'You\'re in, ' . explode(' ', (string)$a['name'])[0] . '.',
            'intro' => $type === 'Summer' ? 'Your place in Summer Students is confirmed.' : 'Your place in the NGG cohort is confirmed.',
            'bodyHtml' => 'We\'ll be in touch shortly with your start details. The member ID is <b>' . esc_html($newId) . '</b>.'
                . ($welcome !== ''
                    ? '<p style="margin:14px 0 0">Set a password using the button below — after that they can sign in with the member ID alone, without waiting on this inbox. The link is good for seven days.</p>'
                    : ''),
            'ctaLabel' => $welcome !== '' ? 'Set a password' : 'Open the member portal',
            'ctaUrl' => $welcome !== '' ? $welcome : (($GLOBALS['CONFIG']['app_origin'] ?? '') . '/#dashboard'),
            'footNote' => 'Welcome to the movement.',
        ]));
    audit('admin.application.convert', $g['requester']['memberId'], $newId, ['applicationId' => $id, 'type' => $type], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'memberId' => $newId];
}

/** Correct a pending application's data before converting/approving it. Only
 *  supplied fields change. */
function admin_application_update(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $id = (int)($p['id'] ?? 0);
    $a = db_row('SELECT id FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $row = [];
    if (array_key_exists('name', $d)) { $name = trim((string)$d['name']); if (strlen($name) < 2) return ['ok' => false, 'error' => 'bad_name']; $row['name'] = substr($name, 0, 120); }
    if (array_key_exists('email', $d)) {
        $em = trim((string)$d['email']);
        if ($em !== '' && !filter_var($em, FILTER_VALIDATE_EMAIL)) return ['ok' => false, 'error' => 'bad_email'];
        $row['email'] = substr($em, 0, 160);
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
    $a = db_row('SELECT id, name FROM applications WHERE id = ? LIMIT 1', [$id]);
    if (!$a) return ['ok' => false, 'error' => 'not_found'];
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
function admin_contact_list(array $p): array {
    $g = admin_cap_gate($p, 'inbox'); if (!$g['ok']) return $g;
    $where = []; $params = [];
    if (!empty($p['status'])) { $where[] = 'status = ?'; $params[] = $p['status']; }
    if (!empty($p['purpose'])) { $where[] = 'purpose = ?'; $params[] = $p['purpose']; }
    $sql = 'SELECT * FROM contact_messages' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY id DESC LIMIT 500';
    $unread = (int)(db_row("SELECT COUNT(*) c FROM contact_messages WHERE status='new'")['c'] ?? 0);
    return ['ok' => true, 'messages' => db_all($sql, $params), 'unread' => $unread];
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

// ── Site settings ───────────────────────────────────────────────────────────
function admin_settings_get(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    return ['ok' => true, 'settings' => [
        'applications_open'         => (setting_raw('applications_open') ?? '1') !== '0',
        'mentor_applications_open'  => (setting_raw('mentor_applications_open') ?? '1') !== '0',
        'volunteer_applications_open' => (setting_raw('volunteer_applications_open') ?? '1') !== '0',
        'volunteer_sms_notify'      => (setting_raw('volunteer_sms_notify') ?? '1') !== '0',
        'checkin_state_emails'      => (setting_raw('checkin_state_emails') ?? '1') !== '0',
        'volunteer_session_hours'   => (int)(setting_raw('volunteer_session_hours') ?: 4),
        'session_idle_admin'        => session_idle_max(true),
        'featured_session_id'       => setting_raw('featured_session_id') ?? '',
        'geofence_enabled'          => setting_raw('geofence_enabled') === '1',
        'photo_gate_issuance'       => setting_raw('photo_gate_issuance') === '1',
        'intake_photo_required'     => (setting_raw('intake_photo_required') ?? '1') !== '0',
        'site_content'              => site_content(),
        'idcard'                    => idcard_program(),
        'attendance'                => attendance_settings(),
    ]];
}

function admin_settings_set(array $p): array {
    $g = admin_cap_gate($p, 'settings'); if (!$g['ok']) return $g;
    $data = $p['data'] ?? [];
    foreach (['applications_open', 'mentor_applications_open', 'volunteer_applications_open', 'volunteer_sms_notify', 'checkin_state_emails', 'geofence_enabled', 'photo_gate_issuance', 'intake_photo_required'] as $k) {
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
        $hints[] = 'Sending via the Google Apps Script Web App (MailApp). Make sure the script was deployed with the Mail scope accepted and its SHARED_SECRET matches api/config.php. Google sends from the account that owns the script.';
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
    $phpmailer = function_exists('ngg_load_phpmailer') && ngg_load_phpmailer();
    // ok:true = the diagnostic ran; `delivered` says whether the send succeeded.
    return [
        'ok' => true, 'delivered' => $delivered, 'to' => $to, 'mode' => $mode,
        'phpmailer' => $phpmailer,
        'error' => (string)($GLOBALS['__mail_last_error'] ?? ''),
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
