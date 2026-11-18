<?php
declare(strict_types=1);

/* ============================================================================
   NGG's centres follow CACENTRE's locations.

   CACENTRE owns the buildings: Egbeda, Ayobo, and whatever it opens next. Its
   locations list (Attendance → Desks and settings → Locations) is the one list
   of places, and NGG's centre directory follows it instead of being typed in
   by hand. CACENTRE's gate passes the list here, signed with the hook secret
   NGG already shares with it (hooks/gate.php, {op:"locations"}), whenever it
   changes and until NGG has it.

   Each location carries an id that does not change when its name does. A
   centre is linked to its location by that id (centres.cacLocationId), so:

     - a location NGG has never seen becomes a new centre, with a code made
       from its name (the printed-card prefix — CENTRE_FALLBACK_CODE and
       all-digit codes are never made);
     - a location NGG already has under the same name, or a name it had
       before, is LINKED to it, keeping the centre's code, colour, page and
       every record pointing at it;
     - a renamed location renames its centre, and every record that names the
       centre (members, participants, volunteers, mentors and the rest — see
       CAC_CENTRE_NAMED_BY) follows, in one transaction;
     - a location CACENTRE took off its list retires its centre. Never deletes
       it: a retired centre keeps every record resolving (§5, invariant 6).

   Once a centre is linked, its name and whether it is open are CACENTRE's:
   admin_centres_upsert and admin_centres_delete refuse to change them here
   (managed_by_cacentre), and no centre is added here by hand once CACENTRE's
   list has arrived. Everything that is NGG's own — the code, the colour, the
   address and map point, the lead, the public page, which programmes run
   there — is still edited in the directory.

   The location's calendar is kept on the centre (cacCalendar) for reading.
   NGG's own policy still decides lateness and NGG's days: that was the
   choice made, and the gate is told NGG's rule at every scan
   (gate_person_punctuality).
   ========================================================================== */

const CAC_LOCATION_ID = '/^L[0-9a-f]{10}$/';

/** Every table that names a centre by its name, and must follow a rename. */
const CAC_CENTRE_NAMED_BY = [
    'members', 'mentors', 'events', 'assignments', 'applications', 'summer_students', 'attendance_duty',
    'member_stars', 'v3_scores', 'awards', 'activities', 'volunteers', 'arcade_scores', 'course_sessions',
    'student_remarks', 'skill_marks', 'insight_threads', 'engagement_snapshots', 'match_games',
    'tournament_entrants', 'mentor_meetings', 'mentor_goals', 'tournament_pairings', 'tournament_invites',
    'community_homework_state', 'courage_marks', 'mentor_reviews', 'attendance', 'shop_orders', 'shop_cash_sessions',
];

/** Is CACENTRE's list in charge of NGG's centres yet? True once it has arrived. */
function cac_locations_active(): bool {
    return (string)(setting_get('cacLocations')['version'] ?? '') !== '';
}

/** A centre linked to a CACENTRE location, by id or row. */
function centre_is_cac_managed(?array $c): bool {
    return $c !== null && (string)($c['cacLocationId'] ?? '') !== '';
}

/** A printed-card prefix for a new centre: letters of its name, unique, never reserved. */
function cac_centre_code(string $name): string {
    $letters = strtoupper(preg_replace('/[^A-Za-z]/', '', $name));
    if ($letters === '') $letters = 'CTR';
    $tries = [substr($letters, 0, 3), substr($letters, 0, 2), substr($letters, 0, 1) . substr($letters, -1) . substr($letters, 1, 1), substr($letters, 0, 4)];
    for ($i = 2; $i <= 9; $i++) $tries[] = substr($letters, 0, 2) . $i;
    foreach ($tries as $t) {
        if ($t === '' || $t === CENTRE_FALLBACK_CODE || strlen($t) > 4) continue;
        if (!db_row('SELECT centreId FROM centres WHERE code = ? LIMIT 1', [$t])) return $t;
    }
    do { $t = 'C' . strtoupper(rand_hex(1)) . random_int(0, 9); } while (db_row('SELECT centreId FROM centres WHERE code = ? LIMIT 1', [$t]));
    return $t;
}

/**
 * Rename a centre and every record that names it. Inside the caller's transaction.
 *
 * Some tables allow one row per centre per something (attendance_duty: one
 * rota per centre per day). Where the new name already has that row — NGG
 * knew the place under both names — the old one is left under its old name
 * rather than the whole rename failing, and counted in `kept`.
 */
function cac_centre_rename(string $from, string $to): array {
    $moved = []; $kept = 0;
    $db = db_conn();
    foreach (CAC_CENTRE_NAMED_BY as $t) {
        if (!db_column_exists($db, $t, 'centre')) continue;
        try {
            $n = db_exec("UPDATE $t SET centre = ? WHERE centre = ?", [$to, $from]);
        } catch (Throwable $e) {
            if (stripos($e->getMessage(), 'unique') === false && stripos($e->getMessage(), 'duplicate') === false) throw $e;
            $n = 0;
            foreach (db_all("SELECT id FROM $t WHERE centre = ?", [$from]) as $r) {
                try { $n += db_exec("UPDATE $t SET centre = ? WHERE id = ?", [$to, $r['id']]); }
                catch (Throwable $e2) { $kept++; }
            }
        }
        if ($n) $moved[$t] = $n;
    }
    if ($kept) $moved['kept'] = $kept;
    return $moved;
}

/**
 * Apply CACENTRE's list. Validated whole before anything is written; then
 * one transaction, one audit event.
 *
 * @param array{version?:string,tz?:string,locations?:array} $p
 */
function cac_locations_sync(array $p): array {
    $version = substr(trim((string)($p['version'] ?? '')), 0, 64);
    $list = is_array($p['locations'] ?? null) ? array_slice($p['locations'], 0, 200) : null;
    if ($version === '' || $list === null) return ['ok' => false, 'code' => 'bad_request', 'error' => 'A version and a list of locations are needed.'];
    $clean = []; $seen = [];
    foreach ($list as $l) {
        $id = (string)($l['id'] ?? ''); $name = trim(mb_substr((string)($l['name'] ?? ''), 0, 80));
        $status = (string)($l['status'] ?? '') === 'retired' ? 'retired' : 'active';
        if (!preg_match(CAC_LOCATION_ID, $id) || mb_strlen($name) < 2) return ['ok' => false, 'code' => 'bad_location', 'error' => 'A location with no id or name: nothing was changed.'];
        if (isset($seen[$id])) return ['ok' => false, 'code' => 'bad_location', 'error' => 'Location ' . $id . ' is listed twice: nothing was changed.'];
        $seen[$id] = true;
        $aliases = array_values(array_filter(array_map(static fn($a) => trim(mb_substr((string)$a, 0, 80)), (array)($l['aliases'] ?? []))));
        $clean[] = ['id' => $id, 'name' => $name, 'status' => $status, 'aliases' => $aliases,
                    'calendar' => is_array($l['calendar'] ?? null) ? $l['calendar'] : null];
    }
    $activeNames = [];
    foreach ($clean as $l) if ($l['status'] === 'active') {
        $k = mb_strtolower($l['name']);
        if (isset($activeNames[$k])) return ['ok' => false, 'code' => 'bad_location', 'error' => 'Two locations are called ' . $l['name'] . ': nothing was changed.'];
        $activeNames[$k] = true;
    }

    $report = ['created' => [], 'linked' => [], 'renamed' => [], 'retired' => [], 'reopened' => [], 'records' => 0];
    $db = db_conn();
    $db->beginTransaction();
    try {
        foreach ($clean as $l) {
            $c = db_row('SELECT * FROM centres WHERE cacLocationId = ? LIMIT 1', [$l['id']]);
            if (!$c) {
                /* Not linked yet: the centre NGG already has under this name or a former one. Active ones first. */
                foreach (array_merge([$l['name']], $l['aliases']) as $n) {
                    $c = db_row("SELECT * FROM centres WHERE cacLocationId = '' AND lower(name) = lower(?) ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END LIMIT 1", [$n]);
                    if ($c) break;
                }
                if ($c) { db_update('centres', ['cacLocationId' => $l['id']], ['centreId' => $c['centreId']]); $report['linked'][] = $l['name']; }
            }
            if (!$c && $l['status'] === 'retired') continue;   // never had it: nothing to retire
            $cal = $l['calendar'] ? json_encode($l['calendar'], JSON_UNESCAPED_SLASHES) : (string)($c['cacCalendar'] ?? '');
            if (!$c) {
                $cid = 'CTR-' . strtoupper(rand_hex(4));
                $slug = centre_slugify($l['name']) ?: 'centre'; $s = $slug; $i = 2;
                while (db_row('SELECT centreId FROM centres WHERE slug = ? LIMIT 1', [$s])) $s = $slug . '-' . $i++;
                db_insert('centres', ['centreId' => $cid, 'name' => $l['name'], 'code' => cac_centre_code($l['name']),
                    'color' => '#76B043', 'status' => 'active', 'slug' => $s, 'cacLocationId' => $l['id'], 'cacCalendar' => $cal,
                    'cacSyncedAt' => now_iso(), 'createdAt' => now_iso(), 'updatedAt' => now_iso()]);
                $report['created'][] = $l['name'];
                continue;
            }
            $set = ['cacCalendar' => $cal, 'cacSyncedAt' => now_iso()];
            if ((string)$c['name'] !== $l['name'] && $l['status'] === 'active') {
                $clash = db_row('SELECT centreId FROM centres WHERE lower(name) = lower(?) AND centreId <> ? LIMIT 1', [$l['name'], $c['centreId']]);
                if ($clash) throw new RuntimeException('NGG already has another centre called ' . $l['name'] . '. Rename or retire it in the directory, then the list is taken on the next try.');
                $moved = cac_centre_rename((string)$c['name'], $l['name']);
                $report['records'] += array_sum($moved) - ($moved['kept'] ?? 0);
                $report['renamed'][] = $c['name'] . ' → ' . $l['name'];
                $set['name'] = $l['name'];
            }
            $want = $l['status'] === 'retired' ? 'retired' : 'active';
            if ((string)$c['status'] !== $want) {
                $set['status'] = $want;
                $report[$want === 'retired' ? 'retired' : 'reopened'][] = $l['name'];
            }
            if (count($set) > 2) $set['updatedAt'] = now_iso();
            db_update('centres', $set, ['centreId' => $c['centreId']]);
        }
        setting_set('cacLocations', ['version' => $version, 'tz' => (string)($p['tz'] ?? ''), 'at' => now_iso()], 'cacentre');
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        return ['ok' => false, 'code' => 'not_applied', 'error' => $e->getMessage()];
    }
    if (function_exists('cache_invalidate')) cache_invalidate('centres');
    $changed = $report['created'] || $report['renamed'] || $report['retired'] || $report['reopened'] || $report['linked'];
    if ($changed) audit('centre.cacentre_sync', 'cacentre', $version, $report, '');
    return ['ok' => true, 'version' => $version] + $report;
}
