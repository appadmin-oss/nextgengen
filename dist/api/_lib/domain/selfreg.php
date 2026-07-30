<?php
declare(strict_types=1);

/**
 * Self-registration, and the desk that checks it.
 *
 * Registration happened at a table. One queue, one centre, one morning, staff
 * typing a family's answers back at them — which is why registration day is
 * the bottleneck it is, and why the data is full of names spelled the way a
 * volunteer heard them.
 *
 * A family can now fill it in themselves from a link. Nothing they submit is
 * a registration yet: it lands as `self_pending` and a human at a REVIEW desk
 * has to look at it before the guardian is emailed anything. That ordering is
 * the whole design. An unreviewed submission that could email a family is a
 * way for a stranger with the public link to send mail in the programme's
 * name, and a photo nobody looked at is a photo that ends up printed on a
 * child's ID card.
 *
 * The review desk has its OWN password. Sharing one with the check-in desk
 * would mean every volunteer who can scan a card can also approve strangers
 * into the programme.
 */

/* ── Photo validation ────────────────────────────────────────────────────────
 * Three gates, cheapest first, because the expensive one costs money and a
 * round trip:
 *
 *   1. Shape   — bytes, dimensions, aspect. Catches a screenshot of a form, a
 *                4MB DSLR frame, a 90×90 avatar, a landscape group photo.
 *   2. AI      — ai_photo_review: is there one face, is it a child, is it
 *                usable at print size.
 *   3. Human   — the reviewer, who sees both verdicts and the photo.
 *
 * The first two ADVISE. Only the third decides. A model that mistakes a very
 * dark room for "no face" must not be able to turn a child away, and a
 * heuristic that likes a photo must not be able to put an unusable one on a
 * printed card.
 */

const PHOTO_MIN_PX      = 320;      // below this a printed ID is a blur
const PHOTO_MAX_BYTES   = 8000000;  // 8MB — a phone photo, not a raw file
const PHOTO_MIN_BYTES   = 3000;     // below this it is an icon or a blank
const PHOTO_MAX_ASPECT  = 1.45;     // portrait-ish; a landscape group shot is not a headshot

/** Inspect the bytes we were handed. Deterministic, free, and runs with the
 *  AI switched off — which is the state a deployment is in until somebody
 *  sets a key, and the state it silently falls back to when the key expires. */
function photo_shape_check(string $dataUrl): array {
    $issues = [];
    if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,#i', $dataUrl, $m)) {
        return ['ok' => false, 'fatal' => true, 'issues' => ['not_an_image'], 'width' => 0, 'height' => 0];
    }
    $raw = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1) ?: '', true);
    if ($raw === false || $raw === '') return ['ok' => false, 'fatal' => true, 'issues' => ['unreadable'], 'width' => 0, 'height' => 0];
    $bytes = strlen($raw);
    if ($bytes > PHOTO_MAX_BYTES) return ['ok' => false, 'fatal' => true, 'issues' => ['too_large'], 'width' => 0, 'height' => 0, 'bytes' => $bytes];
    if ($bytes < PHOTO_MIN_BYTES) $issues[] = 'suspiciously_small_file';

    $w = 0; $h = 0;
    // getimagesizefromstring needs no temp file and no GD image handle.
    if (function_exists('getimagesizefromstring')) {
        $info = @getimagesizefromstring($raw);
        if (is_array($info)) { $w = (int)$info[0]; $h = (int)$info[1]; }
    }
    if ($w > 0 && $h > 0) {
        if ($w < PHOTO_MIN_PX || $h < PHOTO_MIN_PX) $issues[] = 'too_small';
        // Wider than tall by much is a group photo or a screenshot, not a face.
        if ($h > 0 && ($w / $h) > PHOTO_MAX_ASPECT) $issues[] = 'not_portrait';
    } else {
        $issues[] = 'dimensions_unknown';
    }
    return ['ok' => !in_array('too_small', $issues, true), 'fatal' => false,
            'issues' => $issues, 'width' => $w, 'height' => $h, 'bytes' => $bytes];
}

/**
 * The full verdict a reviewer sees: shape, then the model if it is on.
 *
 * `verdict` is one of pass | check | fail, and `fail` still does not reject
 * the submission — it puts it in front of a person with the reason attached.
 * Turning a family away on a model's say-so, with no appeal and nobody to
 * ask, is not a thing this should be able to do.
 */
function photo_validate(string $dataUrl, string $hostedUrl = ''): array {
    $shape = photo_shape_check($dataUrl);
    $out = [
        'width' => $shape['width'], 'height' => $shape['height'], 'bytes' => $shape['bytes'] ?? 0,
        'issues' => $shape['issues'], 'source' => 'shape', 'score' => null,
    ];
    if (!empty($shape['fatal'])) return $out + ['verdict' => 'fail'];

    if ($hostedUrl !== '' && function_exists('ai_enabled') && ai_enabled('photo')) {
        $r = ai_photo_review($hostedUrl);
        if (!empty($r['ok']) && is_array($r['data'] ?? null)) {
            $d = $r['data'];
            $flags = array_values(array_filter(array_map('strval', (array)($d['flags'] ?? []))));
            $out['issues'] = array_values(array_unique(array_merge($out['issues'], $flags)));
            $out['score'] = is_numeric($d['score'] ?? null) ? (int)$d['score'] : null;
            $out['notes'] = array_slice(array_map('strval', (array)($d['issues'] ?? [])), 0, 6);
            $out['source'] = 'ai';
        } else {
            // Say so. A verdict that silently came from half the checks reads
            // identically to one that came from all of them.
            $out['source'] = 'shape_ai_unavailable';
        }
    }

    /* Anything in this list means a person genuinely cannot be identified from
     * the photo, or it is not a photo of one child. Everything else — dark,
     * busy background, slightly soft — is a "have a look", because a printed
     * card is still better than no card and the desk can ask for a retake. */
    $hard = ['not_an_image', 'unreadable', 'too_large', 'too_small', 'no_face', 'multiple_faces', 'inappropriate'];
    $soft = ['not_portrait', 'too_dark', 'too_blurry', 'low_resolution', 'busy_background',
             'not_a_child_headshot', 'suspiciously_small_file', 'dimensions_unknown'];
    $has = fn(array $set) => (bool)array_intersect($set, $out['issues']);
    $verdict = $has($hard) ? 'fail' : ($has($soft) ? 'check' : 'pass');
    if ($out['score'] !== null && $out['score'] < 40 && $verdict === 'pass') $verdict = 'check';
    return $out + ['verdict' => $verdict];
}


/* ── The public link ─────────────────────────────────────────────────────── */

/** Resolve a link and confirm it is the kind being asked for. A public link
 *  must never open a staff desk, and a desk link must never be shareable. */
function selfreg_gate(string $gateId, string $kind): ?array {
    $g = gate_resolve($gateId);
    if (!$g) return null;
    if (trim((string)($g['kind'] ?? 'desk')) !== $kind) return null;
    return $g;
}

/** What the public form needs to render: the live form, the centres, and the
 *  consents spelled out — because the family should read what they are
 *  agreeing to on the way in, not for the first time in an email. */
function selfreg_context(array $p): array {
    $gate = selfreg_gate((string)($p['gate'] ?? ''), 'self');
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    $ctx = gate_context(['gate' => (string)($p['gate'] ?? '')]);
    if (empty($ctx['ok'])) return $ctx;
    $ctx['selfServe'] = true;
    $ctx['consents'] = consent_public_copy();
    // Grouped for the one-tick form, and carrying the document link. Kept
    // alongside the flat list rather than replacing it so a cached older
    // client keeps rendering.
    $ctx['consentSelf'] = consent_selfserve_copy();
    // A cap the admin controls, so a link that leaks cannot be used to fill
    // the review queue with thousands of rows overnight.
    $ctx['open'] = selfreg_is_open();
    return $ctx;
}

/** Is the public door open? Closed when the cohort is full or an admin has
 *  turned it off — answered before a family fills in ten fields. */
function selfreg_is_open(): bool {
    $s = setting_raw('selfreg_closed');
    return trim((string)$s) !== '1';
}

/** The consent wording, as the public form shows it. One source, so the form
 *  and the email cannot drift into promising different things. */
function consent_public_copy(): array {
    $out = [];
    foreach (CONSENT_TYPES as $key => $meta) {
        $out[] = [
            'key' => $key, 'label' => (string)$meta['label'],
            'required' => ((int)$meta['p']) === 0,
            'mustAnswer' => !empty($meta['mustAnswer']),
        ];
    }
    return $out;
}

/* ── Consent on the self-serve form ──────────────────────────────────────────
 * The desk flow splits consent from registration for a real reason: a
 * volunteer typing a family's answers cannot consent on their behalf, so the
 * guardian is emailed a link and consents themselves.
 *
 * The self-serve form is the opposite situation. The person filling it in IS
 * the guardian — they are already reading the clauses, already identified by
 * their own contact details, already at a keyboard. Emailing them a second
 * link to re-consent to what they just read adds a day of latency, a
 * deliverability failure mode, and an extra step families were dropping out
 * of; it does not add consent that wasn't there.
 *
 * So this path takes consent inline, in ONE tick, against the full document
 * linked beside it.
 *
 * One exception, and it is not a style choice. Permission to PUBLISH a child's
 * photograph cannot be bundled into a tick the child's place depends on:
 * consent conditioned on losing your place is not freely given, which is
 * exactly what the NDPA means by consent. So publication is asked separately
 * and either answer is accepted — see the note on CONSENT_TYPES.
 */
const CONSENT_PUBLICATION = ['media', 'site_visibility'];

/** The two groups the self-serve form shows: everything the place genuinely
 *  depends on, behind one tick, and publication permission, which is a free
 *  choice. Derived from CONSENT_TYPES so adding a clause there shows up here. */
function consent_selfserve_copy(): array {
    $bundled = []; $publication = [];
    foreach (CONSENT_TYPES as $key => $meta) {
        $row = ['key' => $key, 'label' => (string)$meta['label']];
        if (in_array($key, CONSENT_PUBLICATION, true)) $publication[] = $row;
        else $bundled[] = $row;
    }
    return ['url' => consent_public_url(), 'bundled' => $bundled, 'publication' => $publication];
}

/** Write the ledger for a self-served consent. One row per type, same
 *  append-only table the parent link writes to, with `self_serve` as the
 *  method so an auditor can tell the two apart without guessing. */
function selfreg_record_consents(string $studentId, bool $publication, string $actorName): void {
    $actor = mb_substr(trim($actorName), 0, 160);
    foreach (CONSENT_TYPES as $type => $meta) {
        $granted = in_array($type, CONSENT_PUBLICATION, true) ? $publication : true;
        db_insert('consents', ['studentId' => $studentId, 'type' => $type,
            'status' => $granted ? 'granted' : 'declined',
            'method' => 'self_serve', 'actorName' => $actor,
            'signatureUrl' => '', 'createdAt' => now_iso()]);
    }
}

/**
 * A family submits their own registration.
 *
 * Reuses gate_register for the field validation, the duplicate check and the
 * id minting — a second copy of those rules would drift from the desk's, and
 * the two paths must produce the same record. What changes is the ENDING: the
 * row is parked at `self_pending` and no email goes anywhere.
 */
function selfreg_submit(array $p): array {
    $gateId = (string)($p['gate'] ?? '');
    $gate = selfreg_gate($gateId, 'self');
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    if (!selfreg_is_open()) return ['ok' => false, 'error' => 'closed'];

    /* Consent, before a row exists. Checked here and not merely in the UI: the
     * endpoint is public and a submission with no consent is not a registration
     * to tidy up later, it is data there was never a basis to hold. */
    if (empty($p['consent'])) return ['ok' => false, 'error' => 'consent_required'];
    $publication = !empty($p['publication']);

    $photo = (string)($p['photo'] ?? '');
    if ($photo === '') return ['ok' => false, 'error' => 'photo_required'];
    /* Checked before anything is written: a submission with an unusable photo
     * is not a row to clean up later, it is a retake to ask for now.
     *
     * Uses the same verdict the reviewer will see rather than a second, looser
     * rule — "unusable" has to mean one thing. Shape only at this point: the
     * image is not hosted yet, and a family should not wait on a model round
     * trip to be told their photo is 90 pixels wide. */
    $check = photo_validate($photo);
    if ($check['verdict'] === 'fail') return ['ok' => false, 'error' => 'photo_rejected', 'photo' => $check];

    /* gate_register does the real work. `defer` stops it sending the guardian
     * anything — nothing reaches a family until a human has looked. */
    $res = gate_register($p + ['selfServe' => true, 'photoUrl' => $photo]);
    if (empty($res['ok'])) return $res;
    $studentId = (string)$res['studentId'];

    /* gate_register has already stored the photo and run the pipeline, so read
     * the resulting URL back rather than ingesting a second time — the old
     * second call uploaded every headshot twice.
     *
     * Expanded to an absolute URL before the vision check, because that check
     * makes an outbound request: a relative `/api/public/photo.php?p=…` is
     * exactly the thing a model cannot fetch, and passing one meant the AI half
     * of the verdict was silently skipped on every self-registration while
     * still reporting itself as having run. */
    $stored = (string)(db_row('SELECT photoUrl FROM summer_students WHERE studentId = ?', [$studentId])['photoUrl'] ?? '');
    $hosted = function_exists('photo_store_absolute') ? photo_store_absolute($stored) : $stored;
    $verdict = photo_validate($photo, $hosted);
    /* Did the photo actually survive?
     *
     * A family sent one — this function refuses without one — so an empty
     * photoUrl here means the server could not keep it: an unwritable directory,
     * or a cloud that refused. Recorded ON the submission, because the reviewer
     * is the person who will notice, and an empty frame that cannot say why
     * looks identical to a family who sent nothing. `stored` is what the review
     * desk reads to tell those two apart. */
    $verdict['stored'] = $stored !== '';
    if ($stored === '') {
        $verdict['issues'] = array_values(array_unique(array_merge((array)($verdict['issues'] ?? []), ['not_stored'])));
        if (function_exists('ops_record')) {
            ops_record('error', 'photo.store', 'A self-registration photo could not be saved.', 'student=' . $studentId);
        }
    }
    db_update('summer_students', [
        'regStatus' => 'self_pending',
        'submittedVia' => $gateId,
        'photoCheck' => json_encode($verdict, JSON_UNESCAPED_SLASHES),
        'updatedAt' => now_iso(),
    ], ['studentId' => $studentId]);

    /* The consent ledger, written now, against the person who actually gave it.
     * Recorded after gate_register so there is a studentId to attach it to, and
     * before the audit line so an approved registration can never exist without
     * the record of what was agreed.
     *
     * The name comes off the ROW, not the raw answers: gate_register has
     * already mapped the form's `parentName` onto guardianName and trimmed it,
     * and a consent record attributed to a key that got renamed in the form
     * builder would be attributed to nobody. */
    $actor = (string)(db_row('SELECT guardianName FROM summer_students WHERE studentId = ?', [$studentId])['guardianName'] ?? '');
    selfreg_record_consents($studentId, $publication, $actor);

    audit('selfreg.submit', null, $studentId, ['gate' => $gateId, 'photo' => $verdict['verdict'],
        'consent' => 'self_serve', 'publication' => $publication ? 'granted' : 'declined'], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'ref' => $studentId, 'studentId' => $studentId,
            'regStatus' => 'self_pending', 'photo' => $verdict,
            // Explicitly empty, not absent: "we are sending nothing" is the
            // promise this endpoint makes, and it should be readable as one.
            'verificationSending' => [],
            'consentRecorded' => true,
            'message' => 'Sent for checking. A coordinator confirms it — nothing further is needed from you.'];
}


/* ── The review desk ─────────────────────────────────────────────────────── */

/**
 * The queue, filtered.
 *
 * A coordinator opening this on a Monday has three hundred submissions and
 * fifteen minutes. Everything here is about getting to the ones that need a
 * decision: search across the fields families actually mistype, a photo
 * verdict filter so the questionable ones come first, a centre and course
 * filter, and a duplicate signal — because the same child registered twice by
 * two parents is the single most common thing in this queue.
 */
function selfreg_queue(array $p): array {
    $gate = selfreg_gate((string)($p['gate'] ?? ''), 'review');
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];

    /* `verified` belongs here now: an approved self-registration lands there
     * directly rather than waiting on a consent email, so without it the
     * reviewer's own approvals vanished from every filter they could pick.
     * `parent_pending` stays for the rows approved before that change. */
    $status = (string)($p['status'] ?? 'self_pending');
    if (!in_array($status, ['self_pending', 'parent_pending', 'verified', 'rejected', 'all'], true)) $status = 'self_pending';
    $q = mb_strtolower(trim((string)($p['q'] ?? '')));
    $centre = trim((string)($p['centre'] ?? ''));
    $course = trim((string)($p['course'] ?? ''));
    $photo  = (string)($p['photo'] ?? '');   // pass | check | fail
    $page   = max(1, (int)($p['page'] ?? 1));
    $per    = max(10, min(100, (int)($p['per'] ?? 25)));

    $where = ["submittedVia != ''"]; $args = [];
    if ($status !== 'all') { $where[] = 'regStatus = ?'; $args[] = $status; }
    if ($centre !== '') { $where[] = 'centre = ?'; $args[] = $centre; }
    if ($course !== '') { $where[] = 'track = ?'; $args[] = $course; }
    if ($q !== '') {
        /* The fields a family mistypes and a coordinator searches by.
         *
         * Phones are the awkward one. They are stored normalised to E.164
         * (+2348031112222) and nobody searches that way — a coordinator reads
         * "08031112222" off a form, or the last four digits off a note. So a
         * mostly-numeric term is matched on its TAIL against the stored digits,
         * which is the part that identifies a Nigerian number however it was
         * written. Searching a number and getting nothing back, when the row
         * is plainly there, is the kind of thing that makes people stop
         * trusting the search and start scrolling. */
        $digits = preg_replace('/\D/', '', $q);
        $clauses = ['lower(fullName) LIKE ?', 'lower(studentId) LIKE ?', 'lower(parentEmail) LIKE ?', 'lower(guardianName) LIKE ?'];
        $like = '%' . $q . '%';
        array_push($args, $like, $like, $like, $like);
        if (strlen($digits) >= 4) {
            $clauses[] = "replace(replace(replace(COALESCE(guardianPhone,''), ' ', ''), '-', ''), '+', '') LIKE ?";
            $args[] = '%' . substr($digits, -9) . '%';
        }
        $where[] = '(' . implode(' OR ', $clauses) . ')';
    }
    $sql = implode(' AND ', $where);
    $total = (int)(db_row("SELECT COUNT(*) c FROM summer_students WHERE $sql", $args)['c'] ?? 0);

    /* A QUEUE is served oldest first. It was newest first, which is the right
     * order for a feed and exactly the wrong one for people waiting: on a busy
     * morning the family who submitted on Monday sinks under Tuesday's
     * arrivals and is seen last, or not at all. Nobody chose that; it is the
     * default `ORDER BY id DESC` that gets written without thinking.
     *
     * Decided work keeps newest-first, because there you are looking for what
     * just happened — "did that approval go through" — not for the oldest
     * thing on the pile. Whitelisted, never interpolated from input. */
    $order = $status === 'self_pending' ? 'id ASC' : 'id DESC';

    /* Photo verdict lives in a JSON column, so it cannot be filtered in SQL
     * without a second column that would then need keeping in step. The queue
     * is bounded by the page size either way; the verdict filter is applied
     * after the read and the count is reported separately so the pager cannot
     * claim more than it will show. */
    $rows = db_all("SELECT studentId, displayId, fullName, firstName, lastName, dob, age, sex, centre, track,
                           guardianName, guardianPhone, parentEmail, photoUrl, regStatus, photoCheck,
                           submittedVia, enrolledAt, formVersion, formData,
                           reviewedById, reviewedAt, reviewNote
                    FROM summer_students WHERE $sql ORDER BY $order LIMIT ? OFFSET ?",
                   array_merge($args, [$per, ($page - 1) * $per]));

    /* The questions, so the reviewer can read the answers against them.
     * A reviewer checking a registration needs the WHOLE form — the summary
     * line is what a list shows, not what a decision is made on, and a field
     * the family filled in that nobody looks at may as well not be asked. */
    $live = form_live();
    $labels = [];
    foreach (($live['fields'] ?? []) as $fld) {
        if (in_array(($fld['type'] ?? ''), ['section', 'info'], true)) continue;
        $labels[(string)$fld['key']] = ['label' => (string)($fld['label'] ?? $fld['key']), 'type' => (string)($fld['type'] ?? 'text')];
    }

    /* Duplicate suspicion, computed once for the page rather than per row.
     * Two parents registering the same child is the commonest thing in this
     * queue and the one a reviewer most needs pointed out.
     *
     * It used to report only that a name collided — a chip reading "possible
     * duplicate" and nowhere to go from it. That is a dead end dressed as a
     * warning: the reviewer still has to search the name by hand to find out
     * whether it is the same child twice at one centre or two children who
     * happen to share a very common Nigerian name, and those need opposite
     * decisions. So the OTHER records come back with it — who, where, what
     * state they are in and when — and the answer is usually obvious on
     * sight. */
    $names = array_values(array_unique(array_filter(array_map(fn($r) => mb_strtolower(trim((string)$r['fullName'])), $rows))));
    $dupOf = [];
    if ($names) {
        $in = '(' . implode(',', array_fill(0, count($names), '?')) . ')';
        foreach (db_all("SELECT studentId, displayId, fullName, centre, track, regStatus, enrolledAt
                         FROM summer_students
                         WHERE lower(fullName) IN $in AND status = 'active'
                         ORDER BY id ASC LIMIT 200", $names) as $d) {
            $dupOf[mb_strtolower(trim((string)$d['fullName']))][] = [
                'studentId' => (string)$d['studentId'],
                'displayId' => (string)($d['displayId'] ?? ''),
                'centre'    => (string)($d['centre'] ?? ''),
                'course'    => (string)($d['track'] ?? ''),
                'regStatus' => (string)($d['regStatus'] ?? ''),
                'submittedAt' => (string)($d['enrolledAt'] ?? ''),
            ];
        }
    }

    /* Whether each family agreed to their child's photo being published, read
     * once for the page. The reviewer is looking at a photograph and deciding
     * what happens to it; "may we publish this" is not a detail to go and look
     * up in another screen, and a reviewer who assumes yes is the way an
     * unpublishable photo ends up published. */
    $pub = [];
    if ($rows) {
        $ids = array_map(fn($r) => (string)$r['studentId'], $rows);
        $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $types = '(' . implode(',', array_fill(0, count(CONSENT_PUBLICATION), '?')) . ')';
        // Append-only ledger, so the LAST row for a studentId+type is current.
        foreach (db_all("SELECT studentId, type, status FROM consents
                         WHERE studentId IN $in AND type IN $types ORDER BY id ASC",
                        array_merge($ids, CONSENT_PUBLICATION)) as $c) {
            $pub[(string)$c['studentId']] = (string)$c['status'];
        }
    }

    $out = [];
    foreach ($rows as $r) {
        $chk = safe_json((string)($r['photoCheck'] ?? '')) ?: [];
        $v = (string)($chk['verdict'] ?? 'unchecked');
        if ($photo !== '' && $v !== $photo) continue;
        /* Every answer, in the order the form asks them, labelled. */
        $answers = [];
        $fd = safe_json((string)($r['formData'] ?? '')) ?: [];
        foreach ($labels as $k => $meta) {
            // NOT $v — that already holds the photo verdict a few lines up, and
            // reusing it here quietly rewrote every row's verdict to the last
            // answer on the form.
            $ans = $fd[$k] ?? '';
            if (is_array($ans)) $ans = implode(', ', array_map('strval', $ans));
            $answers[] = ['key' => $k, 'label' => $meta['label'], 'type' => $meta['type'], 'value' => trim((string)$ans)];
        }
        $out[] = [
            'studentId' => (string)$r['studentId'], 'fullName' => (string)$r['fullName'],
            'displayId' => (string)($r['displayId'] ?? ''),
            'firstName' => (string)($r['firstName'] ?? ''), 'lastName' => (string)($r['lastName'] ?? ''),
            'answers' => $answers,
            // Both: the age is what a reviewer checks at a glance, the date is
            // what makes it checkable and what the record has to keep.
            'dob' => (string)($r['dob'] ?? ''), 'age' => (int)$r['age'], 'sex' => (string)($r['sex'] ?? ''),
            'centre' => (string)$r['centre'], 'course' => (string)$r['track'],
            'guardianName' => (string)($r['guardianName'] ?? ''),
            'guardianPhone' => (string)($r['guardianPhone'] ?? ''),
            'parentEmail' => (string)($r['parentEmail'] ?? ''),
            'photoUrl' => normalize_image_url((string)($r['photoUrl'] ?? '')),
            'photo' => ['verdict' => $v, 'score' => $chk['score'] ?? null,
                        'issues' => array_values((array)($chk['issues'] ?? [])),
                        'notes' => array_values((array)($chk['notes'] ?? [])),
                        'source' => (string)($chk['source'] ?? ''),
                        /* Whether the server kept the image. A family cannot
                           submit without one, so "no photo on the row" means the
                           server lost it — and the reviewer needs to know that
                           rather than see a blank frame indistinguishable from a
                           family who sent nothing. Absent on rows written before
                           this was recorded, hence the null rather than false. */
                        'stored' => array_key_exists('stored', $chk) ? (bool)$chk['stored'] : null],
            'regStatus' => (string)$r['regStatus'],
            // granted | declined | '' (no ledger row — a pre-change submission
            // whose consent is still coming through the parent link).
            'publication' => (string)($pub[(string)$r['studentId']] ?? ''),
            'submittedAt' => (string)($r['enrolledAt'] ?? ''),
            'reviewedAt' => (string)($r['reviewedAt'] ?? ''),
            'reviewNote' => (string)($r['reviewNote'] ?? ''),
            'possibleDuplicate' => count($dupOf[mb_strtolower(trim((string)$r['fullName']))] ?? []) > 1,
            // The OTHER records only — a row is not its own duplicate.
            'duplicates' => array_values(array_filter(
                $dupOf[mb_strtolower(trim((string)$r['fullName']))] ?? [],
                fn($d) => $d['studentId'] !== (string)$r['studentId'])),
        ];
    }

    $counts = [];
    foreach (db_all("SELECT regStatus, COUNT(*) c FROM summer_students WHERE submittedVia != '' GROUP BY regStatus") as $c) {
        $counts[(string)$c['regStatus']] = (int)$c['c'];
    }
    $centres = array_column(db_all("SELECT name FROM centres WHERE status = 'active' ORDER BY name"), 'name');
    return ['ok' => true, 'queue' => $out, 'total' => $total, 'page' => $page, 'per' => $per,
            'shown' => count($out), 'counts' => $counts,
            'centres' => $centres, 'courses' => academy_courses(),
            'gate' => ['name' => (string)$gate['name']]];
}

/**
 * Approve — the moment a submission becomes a registration.
 *
 * Consent was given on the form, by the guardian, and is already in the ledger
 * (see selfreg_record_consents). So approval is the LAST step, not the
 * middle one: it goes straight to `verified` and issues the ID.
 *
 * It used to park the row at `parent_pending` and email the guardian a link to
 * consent again. That was the desk flow's ending grafted onto a flow that does
 * not need it — the family had already read the clauses and ticked them — and
 * it cost a day of latency plus everything email deliverability can cost, for
 * a second copy of a consent already held.
 *
 * The reviewer's job is unchanged and still the point: a human looks at the
 * photo and the answers before anything is issued in a child's name.
 */
function selfreg_approve(array $p): array {
    $gate = selfreg_gate((string)($p['gate'] ?? ''), 'review');
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    $id = (string)($p['studentId'] ?? '');
    $s = db_row("SELECT studentId, regStatus, fullName, track, parentEmail, guardianPhone FROM summer_students WHERE studentId = ? AND submittedVia != '' LIMIT 1", [$id]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    // Approving twice must not issue twice, or re-stamp verifiedAt.
    if ((string)$s['regStatus'] !== 'self_pending') return ['ok' => false, 'error' => 'not_pending', 'regStatus' => (string)$s['regStatus']];

    db_update('summer_students', [
        'regStatus' => 'verified',
        'verifiedAt' => now_iso(),
        'reviewedById' => 'gate:' . (string)$gate['gateId'],
        'reviewedAt' => now_iso(),
        'reviewNote' => mb_substr(trim((string)($p['note'] ?? '')), 0, 300),
        'updatedAt' => now_iso(),
    ], ['studentId' => $id]);

    /* Same gate the parent-link flow goes through, so the photo hold and the
     * QR pool behave identically however a registration arrived. */
    $issue = registration_issue_id($id);

    /* One message still goes out, and it is the one the family actually wants:
     * the ID, once there is an ID. Dropping the consent email must not turn
     * into dropping every trace — a family that filled the form and heard
     * nothing again has no way to know the place is confirmed.
     *
     * After the response, because a reviewer clearing a queue of two hundred
     * must not wait on SMTP, and only when issuance actually happened. */
    if (!empty($issue['issued']) || !empty($issue['already'])) {
        after_response('selfreg.sendId', function () use ($id) { student_send_id($id); });
    }

    audit('selfreg.approve', 'gate:' . (string)$gate['gateId'], $id,
        ['idHeld' => !empty($issue['held']), 'reason' => (string)($issue['reason'] ?? '')], (string)($p['ip'] ?? ''));
    event_emit('registration.verified', ['ref' => $id, 'name' => (string)$s['fullName'],
        'course' => (string)($s['track'] ?? ''), 'status' => 'verified', 'feedback' => '']);

    return ['ok' => true, 'studentId' => $id, 'regStatus' => 'verified',
            // Nothing is emailed to ask for consent any more. Kept as an empty
            // list so an older cached client reads "no messages queued"
            // rather than crashing on a missing key.
            'verificationSending' => [],
            'idIssued' => !empty($issue['issued']) || !empty($issue['already']),
            'photoPending' => !empty($issue['held']) && ($issue['reason'] ?? '') === 'photo_pending'];
}

/** Reject, with a reason. The row stays: a rejected submission is evidence
 *  that a family tried, and deleting it loses both the audit trail and the
 *  ability to tell them what to fix. */
function selfreg_reject(array $p): array {
    $gate = selfreg_gate((string)($p['gate'] ?? ''), 'review');
    if (!$gate) return ['ok' => false, 'error' => 'gate_invalid'];
    $id = (string)($p['studentId'] ?? '');
    $reason = mb_substr(trim((string)($p['note'] ?? '')), 0, 300);
    if ($reason === '') return ['ok' => false, 'error' => 'reason_required'];
    $s = db_row("SELECT studentId, regStatus FROM summer_students WHERE studentId = ? AND submittedVia != '' LIMIT 1", [$id]);
    if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$s['regStatus'] !== 'self_pending') return ['ok' => false, 'error' => 'not_pending'];
    db_update('summer_students', [
        'regStatus' => 'rejected', 'status' => 'inactive',
        'reviewedById' => 'gate:' . (string)$gate['gateId'], 'reviewedAt' => now_iso(),
        'reviewNote' => $reason, 'updatedAt' => now_iso(),
    ], ['studentId' => $id]);
    audit('selfreg.reject', 'gate:' . (string)$gate['gateId'], $id, ['reason' => $reason], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}

/** Approve several at once. Bounded, and each one reports its own outcome —
 *  partial success is the normal case when a page mixes clean submissions
 *  with ones somebody else already handled. */
function selfreg_approve_bulk(array $p): array {
    $ids = is_array($p['studentIds'] ?? null) ? $p['studentIds'] : [];
    $ids = array_values(array_unique(array_filter(array_map(fn($x) => trim((string)$x), $ids))));
    if (!$ids) return ['ok' => false, 'error' => 'no_subjects'];
    if (count($ids) > 100) return ['ok' => false, 'error' => 'too_many'];
    $done = 0; $results = [];
    foreach ($ids as $id) {
        $r = selfreg_approve(['gate' => $p['gate'] ?? '', 'studentId' => $id, 'ip' => $p['ip'] ?? '']);
        if (!empty($r['ok'])) { $done++; $results[] = ['studentId' => $id, 'ok' => true]; }
        else $results[] = ['studentId' => $id, 'ok' => false, 'error' => (string)($r['error'] ?? 'failed')];
        // A bad gate fails every row for the same reason; say so once.
        if (($r['error'] ?? '') === 'gate_invalid') return $r;
    }
    return ['ok' => true, 'approved' => $done, 'results' => $results];
}
