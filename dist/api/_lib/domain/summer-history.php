<?php
declare(strict_types=1);

/* ============================================================================
   Past Summer School editions, imported.

   The registration import (admin_summer_import) enrols children into the LIVE
   edition and binds a QR card to each — right for this season, wrong for a
   season that already happened. This brings in a past edition's register as
   history: who took part, where, in what course, with whom as guardian, the
   ID they were printed, and how many days they came. Nothing is bound to a
   card; nothing is emailed; no live edition is touched.

   Like every import here it is CHECKED first: the dry run reports, per row,
   new / already there / refused (and why), and which Summer School centres
   it would create; the import itself must present the digest of exactly the
   file that was checked, so a file changed in between imports nothing.

   - The edition is an existing one that is not live, or a new one created
     CLOSED with its dates (a past season cannot end in the future).
   - A row's centre is the place Summer School met. It is matched to a Summer
     School centre — the "(Summer School)" records the NGG split made, or any
     centre that ran Summer School — never to an NGG centre. A place with no
     Summer School record is created, retired, so the history resolves and no
     form offers it.
   - A child already in that edition (same name and the same guardian phone or
     email) is reported, not doubled.
   - Column headers are matched loosely ("Child's name", "Full Name", "NAME"),
     so a register kept in a spreadsheet imports as it is.
   ========================================================================== */

const SUMMER_HISTORY_MAX = 2000;

/** Header → field. Lowercased, letters and digits only, before matching. */
const SUMMER_HISTORY_HEADERS = [
    'fullName' => ['fullname', 'name', 'childname', 'childsname', 'participant', 'participantname', 'studentname', 'student'],
    'firstName' => ['firstname', 'givenname', 'forename'],
    'lastName' => ['lastname', 'surname', 'familyname'],
    'dob' => ['dob', 'dateofbirth', 'birthdate', 'birthday'],
    'age' => ['age', 'ageyears'],
    'sex' => ['sex', 'gender'],
    'centre' => ['centre', 'center', 'venue', 'location', 'summercentre', 'site'],
    'track' => ['track', 'course', 'class', 'programme', 'program', 'faculty', 'skill'],
    'group' => ['group', 'groupcode', 'cohort', 'stream'],
    'guardianName' => ['guardianname', 'guardian', 'parentname', 'parent', 'mother', 'father'],
    'guardianPhone' => ['guardianphone', 'parentphone', 'phone', 'phonenumber', 'guardiannumber', 'parentnumber', 'mobile', 'contact'],
    'parentEmail' => ['parentemail', 'guardianemail', 'email', 'emailaddress'],
    'displayId' => ['displayid', 'id', 'idnumber', 'printedid', 'cardid', 'cardnumber', 'participantid'],
    'daysPresent' => ['dayspresent', 'attendance', 'daysattended', 'present', 'attended'],
    'status' => ['status', 'outcome'],
    'address' => ['address', 'homeaddress', 'residentialaddress', 'area'],
    'notes' => ['notes', 'remarks', 'comment', 'comments'],
];

function summer_history_row(array $raw): array {
    $norm = [];
    foreach ($raw as $k => $v) $norm[preg_replace('/[^a-z0-9]/', '', strtolower((string)$k))] = is_scalar($v) ? trim((string)$v) : '';
    $out = [];
    foreach (SUMMER_HISTORY_HEADERS as $field => $names) {
        $out[$field] = '';
        foreach ($names as $n) if (($norm[$n] ?? '') !== '') { $out[$field] = $norm[$n]; break; }
    }
    if ($out['fullName'] === '' && ($out['firstName'] !== '' || $out['lastName'] !== '')) $out['fullName'] = trim($out['firstName'] . ' ' . $out['lastName']);
    return $out;
}

/** A spreadsheet's date — 2014-03-09, 09/03/2014 (day first, as Nigeria writes it), or an Excel serial — as Y-m-d, or ''. */
function summer_history_date(string $v): string {
    $v = trim($v);
    if ($v === '') return '';
    if (preg_match('/^\d{4,5}$/', $v) && (int)$v > 20000) return gmdate('Y-m-d', ((int)$v - 25569) * 86400);
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $v, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3]);
    if (preg_match('#^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$#', $v, $m)) {
        $y = (int)$m[3]; if ($y < 100) $y += $y > 50 ? 1900 : 2000;
        if (checkdate((int)$m[2], (int)$m[1], $y)) return sprintf('%04d-%02d-%02d', $y, $m[2], $m[1]);
    }
    $t = strtotime($v . ' UTC');
    return $t ? gmdate('Y-m-d', $t) : '';
}

/** The Summer School record for a place name, or null — never an NGG centre. */
function summer_history_centre(string $name, array $centres): ?array {
    $key = centre_name_key($name);
    if ($key === '') return null;
    foreach ($centres as $c) if (centre_serves($c, 'summer') && !centre_serves($c, 'ngg') && centre_name_key((string)$c['name']) === $key) return $c;
    foreach ($centres as $c) if (centre_serves($c, 'summer') && centre_name_key((string)$c['name']) === $key) return $c;
    return null;
}

/** The name and code a new retired Summer School centre would take. */
function summer_history_new_centre(string $name, array $centres, array $planned): array {
    $base = trim(preg_replace('/\s*\(Summer School.*\)$/i', '', $name));
    $clash = false;
    foreach ($centres as $c) if (strcasecmp((string)$c['name'], $base) === 0) { $clash = true; break; }
    $label = $clash ? $base . ' (Summer School)' : $base;
    $letters = strtoupper(preg_replace('/[^A-Za-z]/', '', $base));
    $taken = array_merge(array_map(static fn($c) => strtoupper((string)$c['code']), $centres), array_column($planned, 'code'));
    $code = '';
    foreach ([substr($letters, 0, 2), substr($letters, 0, 3), substr($letters, 0, 1) . substr($letters, -1)] as $try) if (strlen($try) >= 2 && !in_array($try, $taken, true) && $try !== CENTRE_FALLBACK_CODE) { $code = $try; break; }
    for ($n = 2; $code === ''; $n++) { $try = substr($letters ?: 'SS', 0, 2) . $n; if (!in_array($try, $taken, true)) $code = $try; }
    return ['name' => $label, 'code' => $code, 'from' => $base];
}

/**
 * admin.summer.history.import — {editionId | edition{name, year, startDate, endDate}, rows, dryRun, digest}.
 * Dry run: the plan, nothing written. Import: the plan carried out, if the digest matches.
 */
function admin_summer_history_import(array $p): array {
    $g = admin_cap_gate($p, 'summer'); if (!$g['ok']) return $g;
    $rawRows = is_array($p['rows'] ?? null) ? array_values($p['rows']) : [];
    if (!$rawRows) return ['ok' => false, 'error' => 'no_rows'];
    if (count($rawRows) > SUMMER_HISTORY_MAX) return ['ok' => false, 'error' => 'too_many_rows', 'detail' => 'At most ' . SUMMER_HISTORY_MAX . ' rows a file. Split it by centre.'];

    // The edition: an existing one that is not live, or a new one, closed.
    $edId = trim((string)($p['editionId'] ?? ''));
    $newEd = is_array($p['edition'] ?? null) ? $p['edition'] : null;
    if ($edId !== '') {
        $ed = db_row('SELECT * FROM summer_cohorts WHERE cohortId = ? LIMIT 1', [$edId]);
        if (!$ed) return ['ok' => false, 'error' => 'not_found'];
        if ((string)$ed['status'] === 'active') return ['ok' => false, 'error' => 'edition_live', 'detail' => 'That edition is running now. Import its participants with Summer School → Registration instead.'];
    } elseif ($newEd) {
        $name = trim((string)($newEd['name'] ?? '')); $year = (int)($newEd['year'] ?? 0);
        $sd = summer_history_date((string)($newEd['startDate'] ?? '')); $ed2 = summer_history_date((string)($newEd['endDate'] ?? ''));
        if (mb_strlen($name) < 3) return ['ok' => false, 'error' => 'bad_name', 'field' => 'name', 'detail' => 'Name the edition, e.g. Summer School 2024.'];
        if ($year < 2000 || $year > (int)gmdate('Y')) return ['ok' => false, 'error' => 'bad_year', 'field' => 'year', 'detail' => 'A past year.'];
        if ($sd === '' || $ed2 === '' || $ed2 < $sd) return ['ok' => false, 'error' => 'bad_dates', 'field' => 'endDate', 'detail' => 'A start date and an end date after it.'];
        if ($ed2 >= gmdate('Y-m-d')) return ['ok' => false, 'error' => 'not_past', 'field' => 'endDate', 'detail' => 'A past edition ended before today. A season still running is set up under Editions.'];
        $ed = ['cohortId' => 'SUM-' . $year . ($year >= 2000 ? '' : ''), 'name' => $name, 'year' => $year, 'startDate' => $sd, 'endDate' => $ed2, 'status' => 'closed', '_new' => true];
        $base = 'SUM-' . $year; $cid = $base;
        for ($i = 2; db_row('SELECT id FROM summer_cohorts WHERE cohortId = ?', [$cid]); $i++) $cid = $base . '-' . $i;
        $ed['cohortId'] = $cid;
    } else return ['ok' => false, 'error' => 'edition_required', 'detail' => 'Choose the edition, or describe a new one.'];

    $centres = db_all('SELECT * FROM centres');
    $existing = [];
    if (empty($ed['_new'])) foreach (db_all('SELECT fullName, guardianPhone, parentEmail, displayId FROM summer_students WHERE cohortId = ?', [$ed['cohortId']]) as $s) {
        $existing[] = $s;
    }
    $tail = static fn($ph) => substr(preg_replace('/\D/', '', (string)$ph), -7);
    $same = static function (array $a, array $b) use ($tail): bool {
        if (strcasecmp(trim((string)$a['fullName']), trim((string)$b['fullName'])) !== 0) return false;
        $pa = $tail($a['guardianPhone'] ?? ''); $pb = $tail($b['guardianPhone'] ?? '');
        $ea = strtolower(trim((string)($a['parentEmail'] ?? ''))); $eb = strtolower(trim((string)($b['parentEmail'] ?? '')));
        return ($pa !== '' && $pa === $pb) || ($ea !== '' && $ea === $eb) || ($pa === '' && $pb === '' && $ea === '' && $eb === '');
    };
    $usedIds = [];
    foreach (db_all("SELECT displayId FROM summer_students WHERE displayId <> '' AND displayId IS NOT NULL") as $r) $usedIds[strtoupper((string)$r['displayId'])] = true;

    $plan = []; $tally = ['create' => 0, 'duplicate' => 0, 'failed' => 0]; $newCentres = []; $seen = [];
    foreach ($rawRows as $i => $raw) {
        $r = is_array($raw) ? summer_history_row($raw) : [];
        $line = $i + 2;   // the header is line 1
        $fail = function (string $why, string $detail) use (&$plan, &$tally, $line, $r) { $tally['failed']++; $plan[] = ['line' => $line, 'name' => (string)($r['fullName'] ?? ''), 'verdict' => 'failed', 'error' => $why, 'detail' => $detail]; };
        if (!$r || mb_strlen($r['fullName']) < 2) { $fail('name_required', 'No name.'); continue; }
        $dob = summer_history_date($r['dob']);
        if ($r['dob'] !== '' && $dob === '') { $fail('bad_dob', 'The date of birth "' . $r['dob'] . '" could not be read.'); continue; }
        $age = $r['age'] !== '' ? (int)$r['age'] : ($dob !== '' ? (int)floor((strtotime((string)$ed['startDate'] ?: $dob) - strtotime($dob)) / 31557600) : 0);
        if ($age && ($age < 3 || $age > 25)) { $fail('bad_age', 'An age of ' . $age . ' is not a Summer School participant.'); continue; }
        if ($r['parentEmail'] !== '' && !filter_var($r['parentEmail'], FILTER_VALIDATE_EMAIL)) { $fail('bad_email', 'The email "' . $r['parentEmail'] . '" is not an address.'); continue; }
        $days = $r['daysPresent'] === '' ? null : (int)preg_replace('/\D/', '', $r['daysPresent']);
        // Already there is checked before anything else about the row: their own ID is not "another participant's".
        $me = ['fullName' => $r['fullName'], 'guardianPhone' => $r['guardianPhone'], 'parentEmail' => $r['parentEmail']];
        $dupe = false;
        foreach (array_merge($existing, $seen) as $o) if ($same($me, $o)) { $dupe = true; break; }
        if ($dupe) { $tally['duplicate']++; $plan[] = ['line' => $line, 'name' => $r['fullName'], 'verdict' => 'duplicate', 'detail' => 'Already in this edition.']; continue; }
        $did = strtoupper($r['displayId']);
        if ($did !== '' && isset($usedIds[$did])) { $fail('id_taken', 'The ID ' . $did . ' is already another participant’s.'); continue; }
        $seen[] = $me;
        if ($did !== '') $usedIds[$did] = true;
        // Where they met: a Summer School record, or one to create.
        $centreName = '';
        if ($r['centre'] !== '') {
            $c = summer_history_centre($r['centre'], $centres);
            if ($c) $centreName = (string)$c['name'];
            else {
                $k = centre_name_key($r['centre']);
                if (!isset($newCentres[$k])) $newCentres[$k] = summer_history_new_centre($r['centre'], $centres, array_values($newCentres));
                $centreName = $newCentres[$k]['name'];
            }
        }
        $tally['create']++;
        $plan[] = ['line' => $line, 'name' => $r['fullName'], 'verdict' => 'create', 'centre' => $centreName, 'track' => $r['track'],
                   '_row' => $r + ['_dob' => $dob, '_age' => $age, '_days' => $days, '_centre' => $centreName]];
    }
    $digest = substr(hash('sha256', json_encode([$ed['cohortId'] ?? '', $ed['name'] ?? '', $rawRows])), 0, 32);
    $public = static fn(array $pl) => array_map(static function ($x) { unset($x['_row']); return $x; }, $pl);
    $out = ['ok' => true, 'edition' => ['cohortId' => (string)$ed['cohortId'], 'name' => (string)$ed['name'], 'new' => !empty($ed['_new'])],
            'tally' => $tally, 'centresToCreate' => array_values($newCentres), 'digest' => $digest,
            'rows' => array_slice($public(array_values(array_filter($plan, static fn($x) => $x['verdict'] !== 'create'))), 0, 300)];
    if (!empty($p['dryRun'])) return $out + ['dryRun' => true];
    if (!hash_equals($digest, (string)($p['digest'] ?? ''))) return ['ok' => false, 'error' => 'not_checked', 'detail' => 'Check the file first; the file imported must be the one checked.'];
    if (!$tally['create']) return $out + ['written' => 0];

    $written = 0;
    db_tx(static function () use ($ed, $plan, $newCentres, $g, &$written) {
        $now = now_iso();
        if (!empty($ed['_new'])) db_insert('summer_cohorts', ['cohortId' => $ed['cohortId'], 'name' => $ed['name'], 'year' => $ed['year'], 'startDate' => $ed['startDate'], 'endDate' => $ed['endDate'], 'status' => 'closed', 'createdAt' => $now, 'updatedAt' => $now]);
        foreach ($newCentres as $nc) {
            $slug = centre_slugify($nc['name']);
            for ($i = 2; db_row('SELECT id FROM centres WHERE slug = ?', [$slug]); $i++) $slug = centre_slugify($nc['name']) . '-' . $i;
            db_insert('centres', ['centreId' => 'CTR-' . strtoupper(rand_hex(4)), 'name' => $nc['name'], 'code' => $nc['code'], 'color' => '#9AA3B2',
                                  'status' => 'retired', 'programmes' => 'summer', 'slug' => $slug, 'createdAt' => $now, 'updatedAt' => $now]);
        }
        $n = (int)(db_row('SELECT COUNT(*) c FROM summer_students WHERE cohortId = ?', [$ed['cohortId']])['c'] ?? 0);
        foreach ($plan as $x) {
            if ($x['verdict'] !== 'create') continue;
            $r = $x['_row'];
            do { $n++; $sid = $ed['cohortId'] . '-' . str_pad((string)$n, 4, '0', STR_PAD_LEFT); } while (id_taken_anywhere($sid));
            $base = summer_slug($r['fullName']) ?: 'participant';
            $handle = $base . '-' . strtolower(rand_hex(2));
            while (db_row('SELECT id FROM summer_students WHERE handle = ?', [$handle])) $handle = $base . '-' . strtolower(rand_hex(3));
            $status = in_array(strtolower($r['status']), ['withdrawn', 'promoted', 'graduated'], true) ? strtolower($r['status']) : 'active';
            $extra = array_filter(['sex' => $r['sex'], 'group' => $r['group'], 'address' => $r['address'], 'importedFrom' => 'past edition import'], static fn($v) => $v !== '');
            db_insert('summer_students', [
                'studentId' => $sid, 'cohortId' => $ed['cohortId'], 'token' => '', 'handle' => $handle,
                'fullName' => mb_substr($r['fullName'], 0, 160), 'firstName' => mb_substr($r['firstName'], 0, 80), 'lastName' => mb_substr($r['lastName'], 0, 80),
                'age' => $r['_age'] ?: null, 'dob' => $r['_dob'], 'sex' => mb_substr(strtolower($r['sex']), 0, 12), 'centre' => $r['_centre'], 'track' => mb_substr($r['track'], 0, 80),
                'guardianName' => mb_substr($r['guardianName'], 0, 160), 'guardianPhone' => mb_substr($r['guardianPhone'], 0, 40), 'parentEmail' => mb_substr(strtolower($r['parentEmail']), 0, 160),
                'displayId' => mb_substr(strtoupper($r['displayId']), 0, 40), 'daysPresent' => $r['_days'], 'status' => $status, 'regStatus' => 'verified',
                'notes' => mb_substr($r['notes'], 0, 2000), 'formData' => $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : '',
                'enrolledAt' => ($ed['startDate'] ?? '') !== '' ? $ed['startDate'] . 'T09:00:00Z' : $now, 'updatedAt' => $now,
            ]);
            $written++;
        }
    });
    audit('summer.history.import', (string)$g['requester']['memberId'], (string)$ed['cohortId'],
        ['written' => $written, 'duplicates' => $tally['duplicate'], 'refused' => $tally['failed'], 'centresCreated' => array_column($newCentres, 'name'), 'newEdition' => !empty($ed['_new'])], (string)($p['ip'] ?? ''));
    return $out + ['written' => $written];
}
