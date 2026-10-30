<?php
declare(strict_types=1);

/* ============================================================================
   NGG centres, separate from Summer School's — and the nearest one, found.

   1. THE SPLIT (centres_split_seed_once). One centres table serves both
      programmes, and the places both used — Egbeda, Ayobo — were one row that
      Summer School participants and NGG members pointed at by the same NAME.
      Summer School is a season; NGG is where a member belongs for years. So,
      once per deployment:

        - a centre Summer School used that carries an NGG default name becomes
          the Summer School's own record, renamed "<Name> (Summer School)",
          keeping its code (the prefix already printed on Summer cards), its
          Summer venue and its groups; the Summer participants and Summer
          applications that named it move with it; and it is retired, because
          the season is over and retiring keeps every record resolving;
        - every other Summer School centre is retired as it is;
        - the NGG defaults, Egbeda and Ayobo, exist as NGG centres under
          exactly those names, taking over the Club's address, map point,
          contacts and meeting times from the row they were split from — so
          every member, mentor and NGG record already saying "Egbeda" or
          "Ayobo" is connected with no change at all;
        - members whose centre is the same place spelled differently
          ("egbeda", "Egbeda Centre", "NGG Ayobo") are put on the exact name.

      A deployment with no centres and no members (a fresh install, a test
      database) records the seed as done and touches nothing.

   2. WHERE A PLACE IS (geo_geocode). Google's Geocoding API when a key is set
      (Settings → API keys → Google Maps), else OpenStreetMap's Nominatim. An
      address is tidied first and searched within Nigeria, Lagos assumed when
      no state is named; if the full line finds nothing, it is retried from
      the part after the house number, then the area. Answers are cached for a
      month, so a list never waits on the network twice for one place.

   3. THE NEAREST NGG CENTRE (centre_ngg_nearest). From the person's home
      address when there is one, else from where their Summer School met, else
      from their Summer centre's area — ranked against active NGG centres by
      their mapped point, or a geocoded one when a centre was never mapped.
      Every suggestion says what it was measured from.
   ========================================================================== */

/* ══ Phase 1 of the centre-key migration: a centre's ID beside its name ═════
 *
 * A centre is stored as a NAME in the tables below — thirty-two of them,
 * including safeguarding_cases and community_safeguarding. The `centres` table
 * has had a proper unique `centreId` all along, and almost nothing uses it.
 *
 * WHAT THAT COSTS TODAY. Renaming a centre rewrites the name in three tables
 * (members, summer_students, applications). The other twenty-nine keep the old
 * string and stop matching from that moment. Nothing errors and nothing is
 * logged: a safeguarding case filed against "Egbeda" is simply not in the list
 * once the centre is called "Egbeda Centre", and the only way anyone finds out
 * is by already knowing it should be there.
 *
 * THIS RELEASE ADDS THE COLUMN AND WRITES BOTH. It changes no reads, so
 * nothing behaves differently: `centre` is still what every query matches on.
 * What it buys is a live deployment in which the two can be compared —
 * admin.centres.idaudit reports, per table, how many rows resolved and which
 * names resolved to nothing. That report is the inventory, and it is worth
 * more than the constraint it leads to.
 *
 * THE NEXT RELEASE switches reads to centreId and makes a rename one row.
 * Deliberately not this one: a name that resolves to nothing must be seen by a
 * person before anything depends on it, and guessing the mapping would move a
 * child's attendance, marks or safeguarding record to the wrong centre with
 * nothing to say it happened.
 *
 * A table joins this list by having BOTH columns; api/tests/run.php fails the
 * build if a table carries `centre` and is not here, so a new one cannot be
 * added without its id.
 */
const CENTRE_NAME_TABLES = [
    'absence_asks',
    'activities',
    'applications',
    'arcade_scores',
    'assignments',
    'attendance',
    'attendance_duty',
    'attendance_held_days',
    'attendance_unmatched',
    'awards',
    'club_announcements',
    'club_class_sessions',
    'community_homework_state',
    'community_safeguarding',
    'courage_marks',
    'course_sessions',
    'engagement_snapshots',
    'events',
    'insight_threads',
    'lesson_feedback',
    'match_games',
    'member_credentials',
    'member_requests',
    'member_stars',
    'members',
    'mentor_goals',
    'mentor_interventions',
    'mentor_matches',
    'mentor_meetings',
    'mentor_nudges',
    'mentor_record_cover',
    'mentor_reviews',
    'mentor_scorecards',
    'mentor_tasks',
    'mentors',
    'photo_change_requests',
    'projects',
    'safeguarding_cases',
    'safeguarding_flags',
    'skill_marks',
    'student_remarks',
    'summer_incidents',
    'summer_students',
    'support_cases',
    'testimonials',
    'tournament_entrants',
    'tournament_invites',
    'tournament_pairings',
    'v3_scores',
    'volunteer_pay',
    'volunteers',
    'wifi_gateways',
    'wifi_profile_overrides',
    'wifi_region_centres',
    'wifi_speed_tests',
    'wifi_usage_daily',
];

/** centreId for a centre NAME, or '' when the name resolves to no centre.
 *  Cached per request: this is called on the insert path. */
function centre_id_for_name(string $name, bool $reset = false): string {
    static $map = null;
    if ($reset) { $map = null; return ''; }
    $k = mb_strtolower(trim($name));
    if ($k === '') return '';
    if ($map === null) {
        $map = [];
        foreach (db_all('SELECT centreId, name FROM centres') as $r) {
            $map[mb_strtolower(trim((string)$r['name']))] = (string)$r['centreId'];
        }
    }
    return $map[$k] ?? '';
}

/** Does this table carry a centre name we mirror an id for? */
function centre_table_tracked(string $table): bool {
    return in_array($table, CENTRE_NAME_TABLES, true);
}

/** Drop the name→id cache. Called whenever `centres` is written, because a
 *  centre created earlier in the same request must be resolvable after it. */
function centre_id_cache_clear(): void { centre_id_for_name('', true); }

/**
 * Backfill centreId from the centre NAME, once per deployment.
 *
 * Runs from db_run_seeds rather than inside migration 178, for two reasons: a
 * long UPDATE does not belong in a DDL transaction on shared hosting, and this
 * must be safely re-runnable. It only ever fills a row whose centreId is still
 * empty, so re-running it cannot overwrite anything that has since been set,
 * and a row whose name resolves to no centre is LEFT empty for the audit.
 */
function centre_ids_backfill_once(): int {
    if ((string)setting_raw('centre_ids_backfilled') === '1') return 0;
    $centres = db_all('SELECT centreId, name FROM centres');
    if (!$centres) return 0;                       // nothing to resolve against; try again next boot
    $filled = 0;
    foreach (CENTRE_NAME_TABLES as $t) {
        if (!db_table_exists(db_conn(), $t)) continue;
        foreach ($centres as $c) {
            try {
                $filled += db_exec(
                    "UPDATE $t SET centreId = ? WHERE centreId = '' AND lower(trim(centre)) = lower(trim(?))",
                    [(string)$c['centreId'], (string)$c['name']]);
            } catch (\Throwable $e) { /* a table without the column yet: the migration will add it */ }
        }
    }
    setting_set('centre_ids_backfilled', '1', 'system');
    if (function_exists('audit')) audit('centres.idbackfill', null, '', ['filled' => $filled], '');
    return $filled;
}

/**
 * admin.centres.idaudit — the inventory this release exists to produce.
 *
 * Per table: how many rows carry a centre name, how many resolved to an id,
 * and the distinct names that resolved to nothing. Those unresolved names are
 * the real answer to "has a centre already been renamed in production", and
 * they must be read by a person before the next release switches reads over.
 */
function admin_centres_idaudit(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $rows = []; $unresolved = []; $totalNamed = 0; $totalResolved = 0;
    foreach (CENTRE_NAME_TABLES as $t) {
        if (!db_table_exists(db_conn(), $t)) continue;
        try {
            $named = (int)(db_row("SELECT COUNT(*) n FROM $t WHERE trim(centre) <> ''")['n'] ?? 0);
            $ok    = (int)(db_row("SELECT COUNT(*) n FROM $t WHERE trim(centre) <> '' AND centreId <> ''")['n'] ?? 0);
        } catch (\Throwable $e) { continue; }
        $bad = $named - $ok;
        $totalNamed += $named; $totalResolved += $ok;
        if ($bad > 0) {
            foreach (db_all("SELECT DISTINCT centre FROM $t WHERE trim(centre) <> '' AND centreId = '' LIMIT 25") as $r) {
                $unresolved[(string)$r['centre']][] = $t;
            }
        }
        if ($named > 0) $rows[] = ['table' => $t, 'named' => $named, 'resolved' => $ok, 'unresolved' => $bad];
    }
    usort($rows, static fn($a, $b) => [$b['unresolved'], $b['named']] <=> [$a['unresolved'], $a['named']]);
    return ['ok' => true, 'tables' => $rows, 'totalNamed' => $totalNamed, 'totalResolved' => $totalResolved,
        'totalUnresolved' => $totalNamed - $totalResolved,
        'names' => array_map(static fn($n, $ts) => ['centre' => $n, 'tables' => array_values(array_unique($ts))],
            array_keys($unresolved), array_values($unresolved))];
}


const NGG_DEFAULT_CENTRES = [
    ['name' => 'Egbeda', 'codes' => ['EGB', 'EGD', 'NEG', 'EG'], 'color' => '#E9A21B'],
    ['name' => 'Ayobo',  'codes' => ['AYO', 'AYB', 'NAY', 'AY'], 'color' => '#76B043'],
];
const GEO_CACHE_DAYS = 30;

/** A place name reduced to what identifies it: "NGG Egbeda Centre" → "egbeda". */
function centre_name_key(string $name): string {
    $s = strtolower($name);
    $s = preg_replace('/\b(ngg|centre|center|club|hub|summer|school|the|branch|campus)\b/', ' ', $s);
    return preg_replace('/[^a-z0-9]+/', '', (string)$s);
}

/** Once per deployment: Summer School's centres apart and retired, the NGG defaults in place, members connected. */
function centres_split_seed_once(): array {
    if ((string)setting_raw('centres_split_seed') === CENTRES_SPLIT_SEED) return ['ok' => true, 'already' => true];
    $hasData = (int)(db_row('SELECT COUNT(*) c FROM centres')['c'] ?? 0) + (int)(db_row("SELECT COUNT(*) c FROM members WHERE centre <> '' AND centre IS NOT NULL")['c'] ?? 0);
    if ($hasData === 0) { setting_set('centres_split_seed', CENTRES_SPLIT_SEED, 'system'); return ['ok' => true, 'empty' => true]; }

    $report = ['split' => [], 'retired' => [], 'created' => [], 'kept' => [], 'membersTidied' => 0, 'participantsMoved' => 0];
    db_tx(static function () use (&$report) {
        $now = now_iso();
        $defaults = [];
        foreach (NGG_DEFAULT_CENTRES as $d) $defaults[centre_name_key($d['name'])] = $d;
        $source = [];   // default key => the row the Club details are taken from
        foreach (db_all('SELECT * FROM centres ORDER BY id') as $c) {
            $key = centre_name_key((string)$c['name']);
            $runsSummer = centre_serves($c, 'summer');
            $runsNgg = centre_serves($c, 'ngg');
            if (isset($defaults[$key]) && $runsSummer) {
                // Shared with Summer School: the row becomes Summer School's, renamed and retired.
                $old = (string)$c['name'];
                $new = $defaults[$key]['name'] . ' (Summer School)';
                for ($i = 2; db_row('SELECT id FROM centres WHERE name = ? AND id <> ?', [$new, (int)$c['id']]); $i++) $new = $defaults[$key]['name'] . ' (Summer School ' . $i . ')';
                $slug = centre_slugify($new);
                for ($i = 2; db_row('SELECT id FROM centres WHERE slug = ? AND id <> ?', [$slug, (int)$c['id']]); $i++) $slug = centre_slugify($new) . '-' . $i;
                db_update('centres', ['name' => $new, 'slug' => $slug, 'programmes' => 'summer', 'status' => 'retired', 'updatedAt' => $now], ['id' => (int)$c['id']]);
                $moved = db_exec('UPDATE summer_students SET centre = ? WHERE lower(trim(centre)) = lower(trim(?))', [$new, $old]);
                try { db_exec("UPDATE applications SET centre = ? WHERE lower(trim(centre)) = lower(trim(?)) AND (program = 'summer' OR programme = 'summer')", [$new, $old]); } catch (\Throwable $e) {}
                $report['participantsMoved'] += $moved;
                $report['split'][] = ['from' => $old, 'summer' => $new, 'participants' => $moved];
                if (!isset($source[$key]) && $runsNgg) $source[$key] = $c;
                elseif (!isset($source[$key])) $source[$key] = $c;
            } elseif ($runsSummer && !$runsNgg) {
                if ((string)$c['status'] !== 'retired') db_update('centres', ['status' => 'retired', 'programmes' => 'summer', 'updatedAt' => $now], ['id' => (int)$c['id']]);
                $report['retired'][] = (string)$c['name'];
            } elseif ($runsSummer) {
                // Runs both, not a default: NGG keeps it; Summer School's use of it ends.
                db_update('centres', ['programmes' => 'ngg', 'updatedAt' => $now], ['id' => (int)$c['id']]);
                $report['kept'][] = (string)$c['name'];
            }
        }
        // The NGG defaults, under their exact names.
        foreach (NGG_DEFAULT_CENTRES as $d) {
            $key = centre_name_key($d['name']);
            $hit = null;
            foreach (db_all("SELECT * FROM centres WHERE status <> 'retired' OR programmes NOT LIKE '%summer%'") as $c) {
                if (centre_name_key((string)$c['name']) === $key && centre_serves($c, 'ngg') && !centre_serves($c, 'summer')) { $hit = $c; break; }
            }
            if ($hit) {
                $patch = ['status' => 'active', 'programmes' => 'ngg', 'updatedAt' => $now];
                if ((string)$hit['name'] !== $d['name'] && !db_row('SELECT id FROM centres WHERE name = ? AND id <> ?', [$d['name'], (int)$hit['id']])) {
                    db_exec('UPDATE members SET centre = ? WHERE centre = ?', [$d['name'], (string)$hit['name']]);
                    $patch['name'] = $d['name'];
                }
                db_update('centres', $patch, ['id' => (int)$hit['id']]);
                $report['kept'][] = $d['name'];
                continue;
            }
            $code = '';
            foreach ($d['codes'] as $try) if (!db_row('SELECT id FROM centres WHERE code = ?', [$try])) { $code = $try; break; }
            if ($code === '') { $n = 2; do { $code = substr($d['codes'][0], 0, 2) . $n++; } while (db_row('SELECT id FROM centres WHERE code = ?', [$code])); }
            $slug = centre_slugify($d['name']);
            for ($i = 2; db_row('SELECT id FROM centres WHERE slug = ?', [$slug]); $i++) $slug = centre_slugify($d['name']) . '-' . $i;
            $row = ['centreId' => 'CTR-' . strtoupper(rand_hex(4)), 'name' => $d['name'], 'code' => $code, 'color' => $d['color'],
                    'status' => 'active', 'programmes' => 'ngg', 'slug' => $slug, 'createdAt' => $now, 'updatedAt' => $now];
            // The Club's own details carry over from the row it was split from: address, map point, contacts, meeting times, page.
            $src = $source[$key] ?? null;
            if ($src) {
                foreach (['color', 'address', 'area', 'phone', 'email', 'meetDays', 'meetTime', 'notes', 'whatsappUrl', 'leadVolunteerId',
                          'lat', 'lng', 'radiusM', 'mapSource', 'mapAccuracyM', 'mappedAt', 'pageStatus', 'tagline', 'headline',
                          'heroImageUrl', 'heroImageMobileUrl', 'heroPosition', 'story', 'gallery', 'pageUpdatedAt'] as $f) {
                    if (array_key_exists($f, $src) && $src[$f] !== null && $src[$f] !== '') $row[$f] = $src[$f];
                }
            }
            db_insert('centres', $row);
            $report['created'][] = ['name' => $d['name'], 'code' => $code, 'from' => $src ? (string)$src['name'] : ''];
        }
        // Members on the same place, spelled differently, onto the exact name.
        foreach (db_all("SELECT DISTINCT centre FROM members WHERE centre <> '' AND centre IS NOT NULL") as $m) {
            $have = (string)$m['centre'];
            $k = centre_name_key($have);
            if (!isset($defaults[$k]) || $have === $defaults[$k]['name']) continue;
            $report['membersTidied'] += db_exec('UPDATE members SET centre = ? WHERE centre = ?', [$defaults[$k]['name'], $have]);
        }
    });
    setting_set('centres_split_seed', CENTRES_SPLIT_SEED, 'system');
    if (function_exists('cache_invalidate')) { try { cache_invalidate('centres'); } catch (\Throwable $e) {} }
    audit('centres.split_seed', null, '', $report);
    return ['ok' => true] + $report;
}

/* ── Where a place is ─────────────────────────────────────────────────── */

/** An address made findable: no phone numbers or "c/o", Lagos assumed when no state is named, always Nigeria. */
function geo_tidy_address(string $a): string {
    $a = preg_replace('/\b(?:\+?234|0)[789]\d{9}\b/', ' ', $a);          // phone numbers typed into the field
    $a = preg_replace('/\b(c\/o|p\.?o\.? box)\b.*$/i', ' ', (string)$a);
    $a = trim(preg_replace('/\s+/', ' ', str_replace(["\n", ';'], ', ', (string)$a)), " ,.");
    if ($a === '') return '';
    /* No state named: Lagos, unless the place is one of the Ogun towns at
       Lagos's edge where families also live — "Sango Ota" with ", Lagos"
       stuck on it was placed in Lagos, or not at all. */
    if (!preg_match('/\b(lagos|ogun|oyo|abuja|fct|rivers|kano|kaduna|edo|delta|anambra|enugu|osun|ondo|ekiti|kwara|plateau|imo|abia|akwa ibom|cross river)\b/i', $a))
        $a .= preg_match('/\b(' . GEO_OGUN_PLACES . ')\b/i', $a) ? ', Ogun' : ', Lagos';
    if (!preg_match('/\bnigeria\b/i', $a)) $a .= ', Nigeria';
    return $a;
}

/**
 * Latitude and longitude for a place, or null. Google when a Maps key is set,
 * OpenStreetMap otherwise; cached a month by the tidied text. $network=false
 * reads the cache only (for lists, which must never wait on many lookups).
 */
function geo_geocode(string $place, bool $network = true): ?array {
    $q = geo_tidy_address($place);
    if ($q === '') return null;
    $ck = 'geo.' . substr(sha1(strtolower($q)), 0, 24);
    // A test that says where places are is not answered from yesterday's cache.
    $mocked = isset($GLOBALS['__geocode_mock']) && is_callable($GLOBALS['__geocode_mock']);
    $hit = $mocked ? null : cache_get($ck, GEO_CACHE_DAYS * 86400);
    // A miss is remembered for a day only: a place nobody could find today may be on the map next week.
    if (is_array($hit)) { if (empty($hit['none'])) return $hit; if (time() - (int)($hit['at'] ?? 0) < 86400) return null; }
    // maps.offline: never ask the network (a server with no outbound HTTPS, a test).
    if (!$network || (!$mocked && !empty($GLOBALS['CONFIG']['maps']['offline']))) return null;
    $lagos = (bool)preg_match('/\blagos\b/i', $q);
    if (isset($GLOBALS['__geocode_mock']) && is_callable($GLOBALS['__geocode_mock'])) $r = ($GLOBALS['__geocode_mock'])($q);
    else {
        $key = trim((string)($GLOBALS['CONFIG']['maps']['google_key'] ?? ''));
        // Google first when there is a key; OpenStreetMap when Google has no answer or no key.
        $r = $key !== '' ? geo_google($q, $key, $lagos) : null;
        if (!$r) $r = geo_nominatim($q, $lagos);
    }
    // An answer outside Nigeria — or outside Lagos when Lagos was the assumption — is a wrong match, not a place.
    if ($r && !geo_in_bounds($r['lat'], $r['lng'], $lagos)) $r = null;
    if (!$mocked) cache_put($ck, $r ?: ['none' => true, 'at' => time()]);
    return $r;
}

/** Nigeria, and Lagos State (with the Ogun towns at its edge, where families also live). */
const GEO_NIGERIA = [4.0, 14.0, 2.6, 14.7];          // minLat, maxLat, minLng, maxLng
const GEO_LAGOS   = [6.25, 6.95, 2.65, 4.40];
/* Ogun towns and LGAs near Lagos, as people write them. */
const GEO_OGUN_PLACES = 'ota|sango|sango-ota|ado-odo|agbara|ifo|akute|ojodu-abiodun|mowe|ibafo|arepo|magboro|warewa|owode|atan|igbesa|abeokuta|sagamu|shagamu|ijebu|ikenne|ilaro|obafemi|ewekoro|itele|onihale|lafenwa|joju|iyana-iyesi';
function geo_in_bounds(float $lat, float $lng, bool $lagos): bool {
    [$a, $b, $c, $d] = $lagos ? GEO_LAGOS : GEO_NIGERIA;
    return $lat >= $a && $lat <= $b && $lng >= $c && $lng <= $d;
}
function geo_google(string $q, string $key, bool $lagos = false): ?array {
    $args = ['address' => $q, 'region' => 'ng', 'components' => 'country:NG', 'key' => $key];
    if ($lagos) $args['bounds'] = GEO_LAGOS[0] . ',' . GEO_LAGOS[2] . '|' . GEO_LAGOS[1] . ',' . GEO_LAGOS[3];
    $url = 'https://maps.googleapis.com/maps/api/geocode/json?' . http_build_query($args);
    $r = ai_http_get($url, []);
    if (empty($r['ok'])) return null;
    $j = json_decode((string)$r['body'], true);
    $g = $j['results'][0] ?? null;
    if (!$g) return null;
    return ['lat' => (float)$g['geometry']['location']['lat'], 'lng' => (float)$g['geometry']['location']['lng'], 'label' => (string)($g['formatted_address'] ?? $q),
            'precise' => in_array((string)($g['geometry']['location_type'] ?? ''), ['ROOFTOP', 'RANGE_INTERPOLATED'], true), 'via' => 'google'];
}
function geo_nominatim(string $q, bool $lagos = false): ?array {
    $origin = (string)($GLOBALS['CONFIG']['app_origin'] ?? 'https://afrovanguard.org.ng');
    $args = ['q' => $q, 'format' => 'jsonv2', 'limit' => 6, 'countrycodes' => 'ng'];
    // Prefer Lagos when Lagos is meant, without refusing a place just over the edge.
    if ($lagos) $args['viewbox'] = GEO_LAGOS[2] . ',' . GEO_LAGOS[1] . ',' . GEO_LAGOS[3] . ',' . GEO_LAGOS[0];
    $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query($args);
    // Nominatim's usage policy: identify the application.
    $r = ai_http_get($url, ['User-Agent: NGG-ControlRoom/1.0 (' . $origin . ')', 'Accept-Language: en']);
    if (empty($r['ok'])) return null;
    $j = json_decode((string)$r['body'], true);
    $g = geo_nominatim_best(is_array($j) ? $j : [], $lagos);
    if (!$g) return null;
    return ['lat' => (float)$g['lat'], 'lng' => (float)$g['lon'], 'label' => (string)($g['display_name'] ?? $q),
            'precise' => in_array((string)($g['addresstype'] ?? $g['type'] ?? ''), GEO_PRECISE_TYPES, true), 'via' => 'openstreetmap'];
}
const GEO_PRECISE_TYPES = ['house', 'building', 'amenity', 'school', 'shop', 'office', 'place_of_worship', 'bus_stop', 'road'];
/**
 * The first of Nominatim's answers that lies inside the area meant (Lagos
 * when Lagos was said), in Nominatim's own relevance order. Taking only its
 * first answer meant a same-named place in another state was found, thrown
 * away by the bounds check, and the address left unplaced. (Re-ranking by
 * "most specific" was tried and is worse: "Sango Ota" became a primary school
 * of that name near Ijebu.)
 */
function geo_nominatim_best(array $hits, bool $lagos): ?array {
    foreach ($hits as $h) if (isset($h['lat'], $h['lon']) && geo_in_bounds((float)$h['lat'], (float)$h['lon'], $lagos)) return $h;
    return null;
}
/**
 * An address the way people in Lagos write one, tried until it lands: as
 * written; without the house number; the landmark it is near ("near Ikotun
 * bus stop", "opposite First Bank", "off Egbeda-Idimu road" — often the most
 * findable thing in it); the street; then the area. Each step is broader, so
 * the first hit is the most precise one available. Returns the point, the
 * text that found it, and how precise that is ('address', 'landmark',
 * 'street' or 'area').
 */
function geo_geocode_smart(string $address, bool $network = true): ?array {
    $a = trim(preg_replace('/\s+/', ' ', $address));
    if ($a === '') return null;
    $tries = [[$a, 'address']];
    $noNum = trim(preg_replace('/^\s*(no\.?|number|plot|house|flat|block|blk|apt)?\s*\d+[a-z]?\s*[,\/-]?\s*/i', '', $a));
    if ($noNum !== '' && $noNum !== $a) $tries[] = [$noNum, 'address'];
    // Landmarks: what follows "near", "opposite", "beside", "behind", "close to", "by", "off".
    if (preg_match_all('/\b(?:near|opposite|opp\.?|beside|behind|close to|after|before|by|off)\s+([^,]+)/i', $a, $m)) {
        foreach ($m[1] as $lm) { $lm = trim($lm, " ."); if (mb_strlen($lm) >= 4) $tries[] = [$lm . (preg_match('/,/', $a) ? ', ' . trim((string)preg_replace('/^.*,\s*/', '', $a)) : ''), 'landmark']; }
    }
    $clean = trim(preg_replace('/\b(?:near|opposite|opp\.?|beside|behind|close to|after|before|by)\s+[^,]+,?/i', '', $noNum ?: $a), " ,");
    $parts = array_values(array_filter(array_map('trim', explode(',', $clean !== '' ? $clean : ($noNum ?: $a)))));
    if (count($parts) > 1) $tries[] = [implode(', ', array_slice($parts, -2)), 'street'];
    if (count($parts) >= 1) $tries[] = [$parts[count($parts) - 1], 'area'];
    $seen = [];
    foreach ($tries as [$t, $kind]) {
        $k = strtolower($t); if (isset($seen[$k])) continue; $seen[$k] = true;
        $g = geo_geocode($t, $network);
        if ($g) return $g + ['query' => $t, 'precision' => $kind];
    }
    return null;
}

/**
 * Driving minutes from one point to several, when a Google key is set
 * (Distance Matrix), cached a month per pair. A crow's-flight kilometre
 * across the Lagos lagoon is not a kilometre of road; for the closest few
 * centres this is what decides. Returns [index => minutes] for those Google
 * answered; [] without a key.
 */
function geo_drive_minutes(array $from, array $tos, bool $network = true): array {
    return array_map(static fn($r) => $r['min'], array_filter(geo_route_table($from, $tos, $network), static fn($r) => $r['min'] !== null));
}

/**
 * Road minutes AND road kilometres from one point to several: Google's
 * Distance Matrix when a key is set, else the free OSRM router on
 * OpenStreetMap's roads (maps.osrm_url; the public demo server by default,
 * light use, cached a month per pair). [index => ['min' => int|null, 'km' => float|null]].
 */
function geo_route_table(array $from, array $tos, bool $network = true): array {
    $key = trim((string)($GLOBALS['CONFIG']['maps']['google_key'] ?? ''));
    $mock = isset($GLOBALS['__drive_mock']) && is_callable($GLOBALS['__drive_mock']);
    if ($key === '' && !$mock) return geo_osrm_table($from, $tos, $network);
    return array_map(static fn($m) => ['min' => $m, 'km' => null], geo_drive_minutes_google($from, $tos, $network));
}

function geo_osrm_table(array $from, array $tos, bool $network = true): array {
    $cfg = $GLOBALS['CONFIG']['maps'] ?? [];
    $mock = isset($GLOBALS['__osrm_mock']) && is_callable($GLOBALS['__osrm_mock']);
    $base = rtrim((string)($cfg['osrm_url'] ?? 'https://router.project-osrm.org'), '/');
    // Off when told, and never from a test that mocks the map (no network in a test).
    if (!$mock && ($base === '' || !empty($cfg['offline']) || isset($GLOBALS['__geocode_mock']))) return [];
    $out = []; $ask = [];
    foreach ($tos as $i => $t) {
        $ck = 'osrm.' . substr(sha1(round($from['lat'], 4) . ',' . round($from['lng'], 4) . '>' . round($t['lat'], 4) . ',' . round($t['lng'], 4)), 0, 24);
        $hit = $mock ? null : cache_get($ck, GEO_CACHE_DAYS * 86400);
        if (is_array($hit) && array_key_exists('min', $hit)) $out[$i] = ['min' => $hit['min'], 'km' => $hit['km']];
        else $ask[$i] = $ck;
    }
    if (!$ask || !$network) return $out;
    /* A few live routing calls per request, then cache only: a bulk promotion
       of two hundred children must not wait on two hundred trips to the
       router. Those beyond the budget fall back to the straight line. */
    static $budget = 3;
    if (!$mock && $budget-- <= 0) return $out;
    $keys = array_keys($ask);
    $res = [];
    if ($mock) $res = ($GLOBALS['__osrm_mock'])($from, array_intersect_key($tos, $ask));
    else {
        $coords = [$from['lng'] . ',' . $from['lat']];
        foreach ($keys as $i) $coords[] = $tos[$i]['lng'] . ',' . $tos[$i]['lat'];
        $origin = (string)($GLOBALS['CONFIG']['app_origin'] ?? 'https://afrovanguard.org.ng');
        $r = ai_http_get($base . '/table/v1/driving/' . implode(';', $coords) . '?sources=0&annotations=duration,distance', ['User-Agent: NGG-ControlRoom/1.0 (' . $origin . ')'], 4);
        $j = !empty($r['ok']) ? json_decode((string)$r['body'], true) : null;
        if (($j['code'] ?? '') === 'Ok') foreach ($keys as $n => $i) {
            $sec = $j['durations'][0][$n + 1] ?? null; $m = $j['distances'][0][$n + 1] ?? null;
            if ($sec !== null) $res[$i] = ['min' => (int)max(1, round($sec / 60)), 'km' => $m !== null ? round($m / 1000, 1) : null];
        }
    }
    foreach ($ask as $i => $ck) if (isset($res[$i])) { $out[$i] = $res[$i]; if (!$mock) cache_put($ck, $res[$i]); }
    return $out;
}

function geo_drive_minutes_google(array $from, array $tos, bool $network = true): array {
    $key = trim((string)($GLOBALS['CONFIG']['maps']['google_key'] ?? ''));
    $mock = isset($GLOBALS['__drive_mock']) && is_callable($GLOBALS['__drive_mock']);
    if ($key === '' && !$mock) return [];
    $out = []; $ask = [];
    foreach ($tos as $i => $t) {
        $ck = 'drive.' . substr(sha1(round($from['lat'], 4) . ',' . round($from['lng'], 4) . '>' . round($t['lat'], 4) . ',' . round($t['lng'], 4)), 0, 24);
        $hit = $mock ? null : cache_get($ck, GEO_CACHE_DAYS * 86400);
        if (is_array($hit) && isset($hit['min'])) $out[$i] = (int)$hit['min'];
        else $ask[$i] = $ck;
    }
    if (!$ask || !$network) return $out;
    if ($mock) $mins = ($GLOBALS['__drive_mock'])($from, array_intersect_key($tos, $ask));
    else {
        $dest = implode('|', array_map(static fn($t) => $t['lat'] . ',' . $t['lng'], array_values(array_intersect_key($tos, $ask))));
        $r = ai_http_get('https://maps.googleapis.com/maps/api/distancematrix/json?' . http_build_query(['origins' => $from['lat'] . ',' . $from['lng'], 'destinations' => $dest, 'mode' => 'driving', 'region' => 'ng', 'key' => $key]), []);
        $mins = [];
        if (!empty($r['ok'])) {
            $els = json_decode((string)$r['body'], true)['rows'][0]['elements'] ?? [];
            foreach (array_keys($ask) as $n => $i) if (($els[$n]['status'] ?? '') === 'OK') $mins[$i] = (int)round(($els[$n]['duration']['value'] ?? 0) / 60);
        }
    }
    foreach ($ask as $i => $ck) if (isset($mins[$i])) { $out[$i] = (int)$mins[$i]; if (!$mock) cache_put($ck, ['min' => (int)$mins[$i]]); }
    return $out;
}

/** A centre's NGG point: its mapped one, else a geocode of its address / area / name. */
function centre_ngg_point(array $c, bool $network = true): ?array {
    $p = centre_point($c, 'ngg');
    if ($p['lat'] !== null) return ['lat' => $p['lat'], 'lng' => $p['lng'], 'approx' => false];
    foreach ([(string)($c['address'] ?? ''), (string)($c['area'] ?? ''), (string)($c['name'] ?? '')] as $t) {
        if (trim($t) === '') continue;
        $g = geo_geocode_smart($t, $network);
        if ($g) return ['lat' => $g['lat'], 'lng' => $g['lng'], 'approx' => true];
    }
    return null;
}

/** The home address a Summer participant gave, from their registration answers, if any. */
function participant_home_address(array $s): string {
    $fd = json_decode((string)($s['formData'] ?? ''), true);
    if (!is_array($fd)) return '';
    $best = '';
    foreach ($fd as $k => $v) {
        if (!is_string($v) || trim($v) === '') continue;
        if (preg_match('/(home.?address|residential|residence|^address$|street|house.?address|where.?(do|does).?(you|they).?live)/i', (string)$k)) return trim($v);
        if ($best === '' && preg_match('/(address|area|lga|locality|neighbou?rhood|town)/i', (string)$k)) $best = trim($v);
    }
    return $best;
}

/**
 * Active NGG centres nearest to a person, nearest first, and what that was
 * measured from: their home address, where their Summer School met, or their
 * Summer centre's area. $network=false uses cached places only.
 *
 * @return array{from:string,fromLabel:string,ranked:list<array{name:string,code:string,km:float,approx:bool}>}
 */
function centre_ngg_nearest(string $homeAddress, string $summerCentre, bool $network = true, ?array $centres = null): array {
    $centres ??= db_all('SELECT * FROM centres');
    $origin = null; $from = ''; $label = '';
    $precision = '';
    if (trim($homeAddress) !== '') {
        $g = geo_geocode_smart($homeAddress, $network);
        if ($g) { $origin = $g; $from = 'home'; $label = $homeAddress; $precision = (string)($g['precision'] ?? ''); }
    }
    if (!$origin && $summerCentre !== '') {
        foreach ($centres as $c) if (strcasecmp((string)$c['name'], $summerCentre) === 0) {
            $pt = centre_point($c, 'summer');
            if ($pt['lat'] !== null) { $origin = ['lat' => $pt['lat'], 'lng' => $pt['lng']]; $from = 'summer_venue'; $label = $summerCentre; }
            else {
                $g = geo_geocode_smart(trim((string)($c['summerAddress'] ?? '')) ?: trim((string)($c['summerArea'] ?? '')) ?: trim((string)($c['address'] ?? '')) ?: trim((string)($c['area'] ?? '')) ?: preg_replace('/\s*\(Summer School.*\)$/', '', (string)$c['name']), $network);
                if ($g) { $origin = $g; $from = 'summer_area'; $label = $summerCentre; }
            }
            break;
        }
    }
    $ranked = []; $pts = [];
    foreach ($centres as $c) {
        if ((string)($c['status'] ?? 'active') !== 'active' || !centre_serves($c, 'ngg')) continue;
        $pt = $origin ? centre_ngg_point($c, $network) : null;
        $ranked[] = ['name' => (string)$c['name'], 'code' => (string)$c['code'],
                     'km' => $pt ? round(geo_distance_m((float)$origin['lat'], (float)$origin['lng'], (float)$pt['lat'], (float)$pt['lng']) / 1000, 1) : null,
                     'minutes' => null, 'roadKm' => null, 'approx' => $pt ? !empty($pt['approx']) : true, '_pt' => $pt];
    }
    usort($ranked, static fn($a, $b) => ($a['km'] === null) <=> ($b['km'] === null) ?: ($a['km'] <=> $b['km']) ?: strcmp($a['name'], $b['name']));
    /* By road, not as the crow flies: every centre that can be placed (a
       programme has a handful, well inside one routing request), re-ordered
       by driving time. Three kilometres across the lagoon can be forty
       minutes by road; the straight line is only the fallback. */
    if ($origin) {
        $top = array_slice(array_keys(array_filter($ranked, static fn($r) => $r['_pt'] !== null)), 0, 25);
        $routes = geo_route_table($origin, array_combine($top, array_map(static fn($i) => $ranked[$i]['_pt'], $top)) ?: [], $network);
        foreach ($routes as $i => $rt) { $ranked[$i]['minutes'] = $rt['min']; $ranked[$i]['roadKm'] = $rt['km']; }
        if (count(array_filter($routes, static fn($rt) => $rt['min'] !== null)) >= 2) {
            $head = array_slice($ranked, 0, count($top)); $tail = array_slice($ranked, count($top));
            usort($head, static fn($a, $b) => ($a['minutes'] === null) <=> ($b['minutes'] === null) ?: ($a['minutes'] <=> $b['minutes']) ?: ($a['km'] <=> $b['km']));
            $ranked = array_merge($head, $tail);
        }
    }
    foreach ($ranked as &$r) unset($r['_pt']);
    unset($r);
    return ['from' => $from, 'fromLabel' => $label, 'precision' => $precision, 'ranked' => $ranked];
}

/** admin.club.promote.options — the NGG centres to offer when promoting one participant, nearest first, with why. */
function admin_club_promote_options(array $p): array {
    $g = admin_cap_gate($p, 'club'); if (!$g['ok']) return $g;
    $s = db_row('SELECT * FROM summer_students WHERE studentId = ? LIMIT 1', [(string)($p['studentId'] ?? '')]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    $home = participant_home_address($s);
    $n = centre_ngg_nearest($home, (string)($s['centre'] ?? ''));
    $prec = ['address' => '', 'landmark' => ' — placed by the landmark in it', 'street' => ' — placed by its street', 'area' => ' — placed by its area only, so distances are rough'][$n['precision'] ?? ''] ?? '';
    $why = ['home' => 'Measured from their home address' . ($home !== '' ? ' (' . mb_substr($home, 0, 80) . ')' : '') . $prec . '.'
                . (array_filter($n['ranked'], static fn($r) => $r['minutes'] !== null) ? ' Ordered by driving time on the roads.' : ''),
            'summer_venue' => 'No usable home address, so measured from where their Summer School met.',
            'summer_area' => 'No usable home address, so measured from the area of their Summer School centre.',
            '' => 'Nothing could be placed on a map, so the centres are in alphabetical order. Add their address, or map the centres, for a suggestion.'][$n['from']];
    return ['ok' => true, 'studentId' => (string)$s['studentId'], 'fullName' => (string)$s['fullName'], 'summerCentre' => (string)($s['centre'] ?? ''),
            'homeAddress' => $home, 'basis' => $n['from'], 'why' => $why, 'centres' => $n['ranked'],
            'suggested' => (string)($n['ranked'][0]['name'] ?? '')];
}
