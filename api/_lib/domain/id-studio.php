<?php
/**
 * ID Card Studio (/club/id-cards) — what the studio needs that the print log
 * alone cannot answer. ID_CARD_STUDIO.md.
 *
 * The rows to print come from the existing card ops (admin.mcards.data,
 * admin.cards.data, admin.vcards.data) and runs are recorded by
 * admin.card.run.record. This adds what nothing stored:
 *
 *   - who has ever had a card, as one map, so the queue can say "New" or
 *     "Reprint" without a history call per person (the N+1 CLAUDE.md §6
 *     calls a defect);
 *   - a reprint QUEUE (id_reprints): "Queue a reprint", "Reprint this run" and
 *     the cards that jammed at the cutter all land there; a print closes them;
 *   - the DESIGN IN USE per card type (id_designs). Industry practice for card
 *     printing (CardPresso, Zebra, Entrust): print from one assigned,
 *     published, versioned template, and log the version. Nothing assigned
 *     means the built-in standard card. Publishing a new version of the
 *     assigned template moves every future print to it; the log keeps the
 *     version each run actually used;
 *   - a PHOTO REQUEST that reaches the people who can act on it — the person
 *     (or a child's guardians) and the NGG admins for their centre — with a
 *     quiet period so nobody is asked twice in a week by two coordinators;
 *   - marking cards in an already-recorded run as failed;
 *   - printed IDs minted for exactly the members about to be printed.
 *
 * Capabilities follow the data: a participant is Summer School's (`summer`),
 * a member or volunteer belongs to `people`. Writes are checked per row, so a
 * request that mixes subjects is refused row by row, never widened.
 */

/* `afrovanguard`: an Afrovanguard member card, printed here from Afrovanguard's own
   card (domain/ngv-portal.php, admin_ids_av_*). Its owner is `people`. */
const IDS_SUBJECTS = ['member', 'student', 'volunteer', 'afrovanguard'];
const IDS_BATCH_MAX = 600;      // the same ceiling as a recorded run (CRUN_MAX_ISSUES)
const IDS_ASK_MAX = 200;        // photo asks in one press
const IDS_ASK_QUIET_DAYS = 3;   // nobody is asked again inside this window unless the operator insists
const IDS_ASK_DIGEST_NAMES = 20; // names listed in the admins' notice; the rest are counted
const IDS_WHY_MAX = 80;

/** The capability that owns a subject's card. */
function ids_cap_for(string $subjectType): string { return $subjectType === 'student' ? 'summer' : 'people'; }

function ids_can(array $requester, string $subjectType): bool {
    return in_array($subjectType, IDS_SUBJECTS, true) && in_array(ids_cap_for($subjectType), member_effective_caps($requester), true);
}

/** Reprint causes, as codes. A lost card needs a NEW QR; a damaged one does not. */
const IDS_CAUSES = ['lost', 'damaged', 'never_received', 'photo', 'name', 'design', 'qr', 'failed', 'asked', 'other'];
const IDS_CAUSE_NEW_QR = ['lost', 'never_received'];
/** The cause behind a free-text reason, when the caller did not give one. */
function ids_cause_of(string $why, string $cause = ''): string {
    if (in_array($cause, IDS_CAUSES, true)) return $cause;
    $w = strtolower($why);
    if (preg_match('/\b(lost|stolen|missing)\b/', $w)) return 'lost';
    if (preg_match('/never (got|received|arrived)/', $w)) return 'never_received';
    if (preg_match('/damag|broken|cracked|faded|print(ed)? (badly|properly)|didn.t print/', $w)) return 'damaged';
    if (str_contains($w, 'photo')) return 'photo';
    if (str_contains($w, 'name')) return 'name';
    if (str_contains($w, 'design')) return 'design';
    return 'asked';
}

/**
 * The live rows behind a list of subjects of one type — centre for scope, and
 * the fields a card prints — in one IN query per 500. id => row.
 */
function ids_subject_rows(string $type, array $ids): array {
    $map = ['member' => ['members', 'memberId', 'fullName', 'displayId'], 'student' => ['summer_students', 'studentId', 'fullName', 'displayId'],
            'volunteer' => ['volunteers', 'volunteerId', 'fullName', "''"]];
    if (!isset($map[$type]) || !$ids) return [];
    [$table, $key, $name, $did] = $map[$type];
    $out = [];
    foreach (array_chunk(array_values(array_unique(array_map('strval', $ids))), 500) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT $key id, $name fullName, COALESCE(centre,'') centre, COALESCE(photoUrl,'') photoUrl, COALESCE($did,'') displayId, COALESCE(status,'') status FROM $table WHERE $key IN ($ph)", $chunk) as $r) $out[(string)$r['id']] = $r;
    }
    return $out;
}
/** One signature over what a card carries: the photo, the name, the printed ID. */
function ids_face_sig(string $photoUrl, string $fullName, string $displayId): string {
    $photo = function_exists('photo_store_relativise') ? photo_store_relativise($photoUrl) : $photoUrl;
    return substr(sha1($photo . '|' . trim($fullName) . '|' . trim($displayId)), 0, 24);
}

/** The assigned design for a card type, with its published front (and paired back) — or null for the standard card. */
function ids_design_for(string $kind): ?array {
    $d = db_row('SELECT * FROM id_designs WHERE kind = ? LIMIT 1', [$kind]);
    if (!$d || (string)$d['templateId'] === '') return null;
    $t = db_row('SELECT * FROM card_templates WHERE templateId = ? LIMIT 1', [(string)$d['templateId']]);
    $pub = $t ? json_decode((string)($t['publishedJson'] ?? ''), true) : null;
    if (!$t || !$pub) return null;   // retired or unpublished since: fall back, never print a draft
    $out = ['templateId' => (string)$t['templateId'], 'name' => (string)$t['name'], 'version' => (int)$t['version'],
            'wMm' => (float)($pub['wMm'] ?? 54), 'hMm' => (float)($pub['hMm'] ?? 85), 'published' => $pub, 'back' => null];
    $pairId = (string)($t['pairId'] ?? '');
    if ($pairId !== '') {
        $b = db_row('SELECT * FROM card_templates WHERE templateId = ? LIMIT 1', [$pairId]);
        $bp = $b ? json_decode((string)($b['publishedJson'] ?? ''), true) : null;
        if ($b && $bp) $out['back'] = ['templateId' => (string)$b['templateId'], 'name' => (string)$b['name'], 'version' => (int)$b['version'], 'published' => $bp];
    }
    return $out;
}

/**
 * Everything the queue needs, in grouped queries:
 *   issued   "type:id" => latest issue that counts { at, displayId, runId, version, ok }
 *   reprints "type:id" => { why, at }      open requests
 *   asked    "type:id" => { at, channels } the last photo request
 *   designs  kind => assigned design | null, choices kind => published fronts
 * A PROOF is not a card anybody holds, and neither is one that failed at the
 * cutter, so neither counts as "already has a card" — or a proofed person
 * would silently drop out of the queue they were proofed for.
 * Only subjects the caller may print are included.
 */
function admin_ids_state(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $types = array_values(array_filter(IDS_SUBJECTS, fn($t) => ids_can($g['requester'], $t)));
    $empty = ['ok' => true, 'issued' => (object)[], 'reprints' => (object)[], 'asked' => (object)[], 'designs' => (object)[], 'choices' => (object)[], 'types' => []];
    if (!$types) return $empty;
    $ph = implode(',', array_fill(0, count($types), '?'));

    $issued = [];
    $rows = db_all("SELECT i.subjectType, i.subjectId, i.displayId, i.runId, i.templateId, i.templateVersion, i.ok, i.at, i.photoUrl, i.fullName, i.secureCode, i.faceSig
                    FROM card_issues i
                    JOIN (SELECT ci.subjectType, ci.subjectId, MAX(ci.id) mid FROM card_issues ci
                          JOIN card_runs cr ON cr.runId = ci.runId
                          WHERE ci.subjectType IN ($ph) AND cr.mode != 'proof' AND ci.ok = 1
                          GROUP BY ci.subjectType, ci.subjectId) last
                      ON last.mid = i.id", $types);
    foreach ($rows as $r) {
        $issued[$r['subjectType'] . ':' . $r['subjectId']] = [
            'at' => (string)$r['at'], 'displayId' => (string)$r['displayId'], 'runId' => (string)$r['runId'],
            'version' => (int)$r['templateVersion'], 'ok' => (int)$r['ok'] === 1,
        ];
    }
    $reprints = [];
    foreach (db_all("SELECT subjectType, subjectId, why, cause, requestedAt FROM id_reprints WHERE doneAt = '' AND subjectType IN ($ph)", $types) as $r) {
        $reprints[$r['subjectType'] . ':' . $r['subjectId']] = ['why' => (string)$r['why'], 'cause' => (string)($r['cause'] ?? ''), 'at' => (string)$r['requestedAt']];
    }
    $stale = ids_stale($rows, $types);
    $asked = [];
    foreach (db_all("SELECT a.subjectType, a.subjectId, a.askedAt, a.channels FROM id_photo_asks a
                     JOIN (SELECT subjectType, subjectId, MAX(id) mid FROM id_photo_asks WHERE subjectType IN ($ph) GROUP BY subjectType, subjectId) last
                       ON last.mid = a.id", $types) as $r) {
        $asked[$r['subjectType'] . ':' . $r['subjectId']] = ['at' => (string)$r['askedAt'], 'channels' => json_decode((string)($r['channels'] ?? ''), true) ?: []];
    }
    $designs = []; $choices = [];
    foreach ($types as $t) {
        $designs[$t] = ids_design_for($t);
        $choices[$t] = array_map(fn($r) => ['templateId' => (string)$r['templateId'], 'name' => (string)$r['name'], 'version' => (int)$r['version'], 'paired' => (string)($r['pairId'] ?? '') !== ''],
            db_all("SELECT templateId, name, version, pairId FROM card_templates WHERE kind = ? AND face IN ('single','front') AND publishedJson IS NOT NULL AND publishedJson != '' ORDER BY name LIMIT 100", [$t]));
    }
    return ['ok' => true, 'issued' => (object)$issued, 'reprints' => (object)$reprints, 'stale' => (object)$stale, 'asked' => (object)$asked,
            'designs' => (object)$designs, 'choices' => (object)$choices, 'types' => $types];
}

/**
 * Does the card in somebody's hand still match their record?
 *
 * Compares each person's latest good issue with the live row, in one grouped
 * read per subject type: the photo, the name, the printed ID, the QR (a member
 * whose secure code was reissued holds a card that no longer opens), and the
 * assigned design. "key" => ['photo','name',…]. A card printed before cards
 * were snapshotted (migration 140) has nothing to compare photo or name with,
 * so those are not claimed — "unknown" is not "changed".
 */
function ids_stale(array $issues, array $types): array {
    $by = [];
    foreach ($issues as $r) $by[(string)$r['subjectType']][(string)$r['subjectId']] = $r;
    $out = [];
    foreach ($types as $t) {
        if (empty($by[$t])) continue;
        $live = ids_subject_rows($t, array_keys($by[$t]));
        $design = ids_design_for($t);
        $codes = [];
        if ($t === 'member') {
            foreach (array_chunk(array_keys($by[$t]), 500) as $chunk) {
                $ph = implode(',', array_fill(0, count($chunk), '?'));
                foreach (db_all("SELECT memberId, code FROM member_cards WHERE kind = 'secure' AND status = 'active' AND memberId IN ($ph)", $chunk) as $c) $codes[(string)$c['memberId']] = (string)$c['code'];
            }
        }
        foreach ($by[$t] as $id => $i) {
            $l = $live[$id] ?? null;
            if (!$l) continue;
            $why = [];
            // Snapshotted (faceSig set): even an empty photo was what printed, so a photo added since counts.
            $snap = (string)($i['faceSig'] ?? '') !== '';
            if ($snap && photo_store_relativise((string)$i['photoUrl']) !== photo_store_relativise((string)$l['photoUrl'])) $why[] = 'photo';
            if ($snap && trim((string)$i['fullName']) !== trim((string)$l['fullName'])) $why[] = 'name';
            if ((string)$i['displayId'] !== '' && (string)$l['displayId'] !== '' && (string)$i['displayId'] !== (string)$l['displayId']) $why[] = 'id';
            if ($t === 'member' && (string)$i['secureCode'] !== '' && ($codes[$id] ?? '') !== '' && $codes[$id] !== (string)$i['secureCode']) $why[] = 'qr';
            $dId = $design ? (string)$design['templateId'] : '';
            if ($dId !== (string)$i['templateId'] || ($design && (int)$design['version'] > (int)$i['templateVersion'])) $why[] = 'design';
            if ($why) $out[$t . ':' . $id] = $why;
        }
    }
    return $out;
}

/**
 * Assign the design a card type prints with. '' goes back to the standard
 * card. Only a PUBLISHED front of the same kind may be assigned — a draft is
 * not something anybody may print.
 */
function admin_ids_design_set(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $kind = (string)($p['kind'] ?? '');
    if (!in_array($kind, IDS_SUBJECTS, true)) return ['ok' => false, 'error' => 'bad_kind'];
    if (!ids_can($g['requester'], $kind)) return ['ok' => false, 'error' => 'forbidden'];
    $tid = trim((string)($p['templateId'] ?? ''));
    if ($tid !== '') {
        $t = db_row('SELECT kind, face, publishedJson FROM card_templates WHERE templateId = ? LIMIT 1', [$tid]);
        if (!$t) return ['ok' => false, 'error' => 'template_not_found'];
        if ((string)$t['kind'] !== $kind) return ['ok' => false, 'error' => 'wrong_kind', 'message' => 'That design is for a different kind of card.'];
        if ((string)($t['face'] ?? 'single') === 'back') return ['ok' => false, 'error' => 'is_back', 'message' => 'Assign the front; its paired back comes with it.'];
        if (trim((string)($t['publishedJson'] ?? '')) === '') return ['ok' => false, 'error' => 'not_published', 'message' => 'Publish the design in the Design Studio first.'];
    }
    $by = (string)$g['requester']['memberId'];
    if (db_row('SELECT kind FROM id_designs WHERE kind = ?', [$kind])) db_update('id_designs', ['templateId' => $tid, 'setBy' => $by, 'setAt' => now_iso()], ['kind' => $kind]);
    else db_insert('id_designs', ['kind' => $kind, 'templateId' => $tid, 'setBy' => $by, 'setAt' => now_iso()]);
    audit('ids.design.set', $by, $tid, ['kind' => $kind], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'design' => ids_design_for($kind)];
}

/** Validate a list of {subjectType, subjectId[, why]} BEFORE any write; refuse per row on capability. */
function ids_items(array $g, $raw, bool $needWhy = false): array {
    if (!is_array($raw) || !$raw) return ['ok' => false, 'error' => 'no_items'];
    if (count($raw) > IDS_BATCH_MAX) return ['ok' => false, 'error' => 'too_many', 'message' => 'At most ' . IDS_BATCH_MAX . ' at a time.'];
    $ok = []; $refused = [];
    foreach ($raw as $it) {
        $t = (string)($it['subjectType'] ?? ''); $id = trim((string)($it['subjectId'] ?? ''));
        if (!in_array($t, IDS_SUBJECTS, true) || $id === '' || strlen($id) > 64) { $refused[] = ['subjectId' => $id, 'error' => 'bad_subject']; continue; }
        if (!ids_can($g['requester'], $t)) { $refused[] = ['subjectId' => $id, 'error' => 'forbidden']; continue; }
        $why = trim(preg_replace('/\s+/', ' ', (string)($it['why'] ?? '')));
        if ($needWhy && $why === '') $why = 'Reprint';
        $ok[$t . ':' . $id] = ['subjectType' => $t, 'subjectId' => $id, 'why' => mb_substr($why, 0, IDS_WHY_MAX),
                               'cause' => ids_cause_of($why, (string)($it['cause'] ?? ''))];
    }
    /* Scope is enforced on the way in, per row, against the RECORD — never the
       list the client had on screen. A subject that does not exist is refused
       too, or a stray id would sit in the queue (or close somebody else's). */
    $byType = [];
    foreach ($ok as $k => $it) $byType[$it['subjectType']][] = $it['subjectId'];
    foreach ($byType as $t => $list) {
        $rows = ids_subject_rows($t, $list);
        foreach ($list as $id) {
            if (!isset($rows[$id])) { $refused[] = ['subjectId' => $id, 'error' => 'not_found']; unset($ok[$t . ':' . $id]); continue; }
            if (!admin_centre_allowed($g['requester'], (string)$rows[$id]['centre'])) { $refused[] = ['subjectId' => $id, 'error' => 'out_of_scope']; unset($ok[$t . ':' . $id]); }
        }
    }
    return ['ok' => true, 'items' => array_values($ok), 'refused' => $refused];
}

/** Put people back in the queue as reprints. An open request is updated, not doubled. */
function admin_ids_reprint_request(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $v = ids_items($g, $p['items'] ?? null, true); if (!$v['ok']) return $v;
    $r = ids_reprints_open($v['items'], (string)$g['requester']['memberId']);
    audit('ids.reprint.request', (string)$g['requester']['memberId'], '', ['added' => $r['added'], 'updated' => $r['updated'], 'refused' => count($v['refused'])], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'added' => $r['added'], 'updated' => $r['updated'], 'refused' => $v['refused']];
}
/**
 * Open (or refresh) reprint requests for validated items. An open request is
 * updated, not doubled; the most recent reason wins, except that a LOST card
 * stays lost — a later "damaged" must not quietly cancel its new QR.
 */
function ids_reprints_open(array $items, string $by): array {
    $now = now_iso(); $added = 0; $updated = 0;
    foreach ($items as $it) {
        $cause = (string)($it['cause'] ?? ids_cause_of((string)($it['why'] ?? '')));
        $open = db_row("SELECT id, cause FROM id_reprints WHERE subjectType = ? AND subjectId = ? AND doneAt = '' ORDER BY id LIMIT 1", [$it['subjectType'], $it['subjectId']]);
        if ($open) {
            if (in_array((string)$open['cause'], IDS_CAUSE_NEW_QR, true) && !in_array($cause, IDS_CAUSE_NEW_QR, true)) $cause = (string)$open['cause'];
            db_update('id_reprints', ['why' => $it['why'], 'cause' => $cause, 'requestedAt' => $now, 'requestedBy' => $by], ['id' => $open['id']]); $updated++;
            // A racing writer that doubled the request is folded back into one.
            db_exec("DELETE FROM id_reprints WHERE subjectType = ? AND subjectId = ? AND doneAt = '' AND id <> ?", [$it['subjectType'], $it['subjectId'], (int)$open['id']]);
        } else {
            db_insert('id_reprints', ['subjectType' => $it['subjectType'], 'subjectId' => $it['subjectId'], 'why' => $it['why'], 'cause' => $cause, 'requestedBy' => $by, 'requestedAt' => $now, 'doneRunId' => '', 'doneAt' => '']); $added++;
        }
    }
    return ['added' => $added, 'updated' => $updated];
}

/** Close the open requests a print has satisfied. */
function admin_ids_reprint_done(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $v = ids_items($g, $p['items'] ?? null); if (!$v['ok']) return $v;
    /* Normally a no-op now: recording a run closes the requests it satisfied,
       in the same transaction (admin_card_run_record). Kept for older pages,
       and held to the same rule — a request closes only against a real,
       non-proof run that printed THAT person, never against any string. */
    $runId = substr((string)($p['runId'] ?? ''), 0, 40); $now = now_iso(); $n = 0; $refused = $v['refused'];
    $run = $runId !== '' ? db_row('SELECT runId, mode FROM card_runs WHERE runId = ? LIMIT 1', [$runId]) : null;
    if (!$run || (string)$run['mode'] === 'proof') return ['ok' => false, 'error' => 'run_not_found'];
    foreach ($v['items'] as $it) {
        if (!db_row('SELECT 1 FROM card_issues WHERE runId = ? AND subjectType = ? AND subjectId = ? AND ok = 1 LIMIT 1', [$runId, $it['subjectType'], $it['subjectId']])) { $refused[] = ['subjectId' => $it['subjectId'], 'error' => 'not_in_run']; continue; }
        $n += db_exec("UPDATE id_reprints SET doneAt = ?, doneRunId = ? WHERE subjectType = ? AND subjectId = ? AND doneAt = ''", [$now, $runId, $it['subjectType'], $it['subjectId']]);
    }
    if ($n) audit('ids.reprint.done', (string)$g['requester']['memberId'], $runId, ['closed' => $n, 'refused' => count($refused)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'closed' => $n, 'refused' => $refused];
}

/**
 * The after-print check (§4.3): these cards in this run did not come out
 * usable. Their issue rows are marked failed, the run's count of failures
 * moves, and each goes back in the queue as a reprint — one audit event.
 */
function admin_ids_run_failed(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $runId = (string)($p['runId'] ?? '');
    $run = db_row('SELECT * FROM card_runs WHERE runId = ? LIMIT 1', [$runId]);
    if (!$run) return ['ok' => false, 'error' => 'not_found'];
    $v = ids_items($g, $p['items'] ?? null, true); if (!$v['ok']) return $v;
    $marked = 0; $hit = []; $refused = $v['refused'];
    foreach ($v['items'] as $it) {
        $n = db_exec("UPDATE card_issues SET ok = 0, note = ? WHERE runId = ? AND subjectType = ? AND subjectId = ? AND ok = 1",
            ['Didn’t print properly', $runId, $it['subjectType'], $it['subjectId']]);
        // Only somebody actually in this run goes back in the queue for it.
        if ($n) { $marked += $n; $hit[] = array_merge($it, ['why' => 'Didn’t print properly', 'cause' => 'failed']); }
        else $refused[] = ['subjectId' => $it['subjectId'], 'error' => 'not_in_run'];
    }
    $failed = (int)(db_row('SELECT COUNT(*) c FROM card_issues WHERE runId = ? AND ok = 0', [$runId])['c'] ?? 0);
    $issued = (int)(db_row('SELECT COUNT(*) c FROM card_issues WHERE runId = ? AND ok = 1', [$runId])['c'] ?? 0);
    db_update('card_runs', ['failed' => $failed, 'issued' => $issued], ['runId' => $runId]);
    $re = $hit ? ids_reprints_open($hit, (string)$g['requester']['memberId']) : ['added' => 0, 'updated' => 0];
    // One event for the run: the marks and the requeue together.
    audit('ids.run.failed', (string)$g['requester']['memberId'], $runId, ['marked' => $marked, 'failed' => $failed, 'requeued' => $re['added'] + $re['updated']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'marked' => $marked, 'failed' => $failed, 'requeued' => $re['added'] + $re['updated'], 'refused' => $refused];
}


/* ── Photo requests ───────────────────────────────────────────────────────── */

/** The person behind a subject, for a photo request: name, centre, and who can be told. */
function ids_subject_contact(string $t, string $id): ?array {
    /* Afrovanguard's members are Afrovanguard's to contact: no request from here. */
    if ($t === 'afrovanguard') return null;
    if ($t === 'student') {
        $s = db_row('SELECT studentId, fullName, centre, parentEmail, photoUrl FROM summer_students WHERE studentId = ? LIMIT 1', [$id]);
        return $s ? ['name' => (string)$s['fullName'], 'centre' => (string)($s['centre'] ?? ''), 'email' => '', 'guardian' => (string)($s['parentEmail'] ?? ''), 'photo' => (string)($s['photoUrl'] ?? ''), 'row' => $s] : null;
    }
    if ($t === 'volunteer') {
        $v = db_row('SELECT volunteerId, fullName, centre, email, photoUrl FROM volunteers WHERE volunteerId = ? LIMIT 1', [$id]);
        return $v ? ['name' => (string)$v['fullName'], 'centre' => (string)($v['centre'] ?? ''), 'email' => (string)($v['email'] ?? ''), 'guardian' => '', 'photo' => (string)($v['photoUrl'] ?? ''), 'row' => $v] : null;
    }
    $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
    return $m ? ['name' => (string)$m['fullName'], 'centre' => (string)($m['centre'] ?? ''), 'email' => (string)($m['email'] ?? ''), 'guardian' => '', 'photo' => (string)($m['photoUrl'] ?? ''), 'row' => $m] : null;
}

/** One email in the house template. Never throws: a mail that fails is a channel that did not work, not a failed request. */
function ids_mail(string $to, string $title, string $intro, string $body, string $ctaLabel = '', string $ctaPath = ''): bool {
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL) || !function_exists('send_mail') || !function_exists('email_template')) return false;
    $origin = rtrim((string)($GLOBALS['CONFIG']['app_origin'] ?? ''), '/');
    try {
        $html = email_template(['title' => $title, 'eyebrow' => 'Next Generation Genius', 'intro' => $intro,
            'bodyHtml' => '<p style="margin:0 0 10px">' . nl2br(esc_html($body)) . '</p>',
            'ctaLabel' => $ctaLabel, 'ctaUrl' => $ctaPath !== '' ? $origin . $ctaPath : '']);
        return (bool)@send_mail($to, $title, $html);
    } catch (\Throwable $e) { error_log('[ids.mail] ' . $e->getMessage()); return false; }
}

/**
 * Ask for a photo, for one person or many (§3.1 "Ask for photo"; the
 * blocked filter's "Ask everyone").
 *
 * Who hears, by who can act:
 *   - a member: the member (in-app and email, pointing at the dashboard's
 *     Edit profile, where the photo uploads), and their linked guardians who
 *     take alerts — many members are children;
 *   - a volunteer: the volunteer, by email (there is no self-upload for a
 *     volunteer, so it asks them to send one to their coordinator);
 *   - a Summer School participant: their guardian, with the reshoot link;
 *   - and for every kind: the NGG admins who own that card for that centre
 *     (the capability, centre-scoped), in ONE notice per press listing who is
 *     waiting — never one notice per child.
 * Nobody is asked again within IDS_ASK_QUIET_DAYS unless `force`; that row is
 * reported as asked_recently. The answer says, per person, which channels
 * actually went, so the screen never claims a message nobody sent.
 */
function admin_ids_photo_ask(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $raw = $p['items'] ?? null;
    if ($raw === null && isset($p['subjectType'])) $raw = [['subjectType' => $p['subjectType'], 'subjectId' => $p['subjectId'] ?? '']];
    if (!is_array($raw) || !$raw) return ['ok' => false, 'error' => 'no_items'];
    if (count($raw) > IDS_ASK_MAX) return ['ok' => false, 'error' => 'too_many', 'message' => 'At most ' . IDS_ASK_MAX . ' at a time.'];
    $force = !empty($p['force']);
    $by = (string)$g['requester']['memberId'];
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - IDS_ASK_QUIET_DAYS * 86400);
    $results = []; $waiting = [];   // $waiting[cap] = [[name, centre], …] for the admins' notice

    foreach ($raw as $it) {
        $t = (string)($it['subjectType'] ?? ''); $id = trim((string)($it['subjectId'] ?? ''));
        if (!in_array($t, IDS_SUBJECTS, true) || $id === '') { $results[] = ['subjectId' => $id, 'error' => 'bad_subject']; continue; }
        if (!ids_can($g['requester'], $t)) { $results[] = ['subjectId' => $id, 'error' => 'forbidden']; continue; }
        $c = ids_subject_contact($t, $id);
        if (!$c) { $results[] = ['subjectId' => $id, 'error' => 'not_found']; continue; }
        if ($c['centre'] !== '' && !admin_centre_allowed($g['requester'], $c['centre'])) { $results[] = ['subjectId' => $id, 'error' => 'out_of_scope']; continue; }
        if ($c['photo'] !== '') { $results[] = ['subjectId' => $id, 'error' => 'has_photo']; continue; }
        $last = db_row('SELECT askedAt FROM id_photo_asks WHERE subjectType = ? AND subjectId = ? ORDER BY id DESC LIMIT 1', [$t, $id]);
        if ($last && (string)$last['askedAt'] > $cut && !$force) { $results[] = ['subjectId' => $id, 'error' => 'asked_recently', 'askedAt' => (string)$last['askedAt']]; continue; }

        $first = explode(' ', trim($c['name']))[0] ?: 'there';
        $sent = [];
        if ($t === 'member') {
            notify_people([$c['row']], ['kind' => 'photo', 'title' => 'A photo for your NGG ID card',
                'body' => 'Your NGG ID card is ready to print except for your photo. On your dashboard, tap Edit profile, then Upload, and choose a clear, front-facing photo in good light. It is checked before it goes on your card.',
                'intro' => 'Hello ' . $first . ',', 'eyebrow' => 'Next Generation Genius', 'ctaLabel' => 'Add your photo', 'ctaPath' => '/dashboard', 'linkPage' => 'dashboard']);
            if ($c['email'] !== '') $sent[] = 'member';
            else $sent[] = 'member_app';
            $gs = function_exists('family_guardian_emails') ? family_guardian_emails($id, 'alerts') : [];
            $gOk = 0;
            foreach ($gs as $ge) if (ids_mail($ge, 'A photo for ' . $first . '’s NGG ID card', 'Hello,',
                $c['name'] . '’s NGG ID card is ready to print except for the photo. ' . $first . ' can add it from their dashboard (Edit profile, then Upload), or you can send a clear, front-facing photo to their centre coordinator.')) $gOk++;
            if ($gOk) $sent[] = 'guardians';
        } elseif ($t === 'volunteer') {
            if (ids_mail($c['email'], 'A photo for your NGG volunteer card', 'Hello ' . $first . ',',
                'Your NGG volunteer card is ready to print except for your photo. Reply to this email with a clear, front-facing photo in good light, or hand one to your centre coordinator.')) $sent[] = 'volunteer';
        } else {
            if ($c['guardian'] !== '' && function_exists('reshoot_notify_guardian')) {
                db_update('summer_students', ['photoAskedAt' => now_iso()], ['studentId' => $id]);
                try { reshoot_notify_guardian($id, 'We do not have a photo on file for their ID card.'); $sent[] = 'guardian'; }
                catch (\Throwable $e) { error_log('[ids.photo.ask] ' . $id . ': ' . $e->getMessage()); }
            }
        }
        $waiting[ids_cap_for($t)][] = [$c['name'], $c['centre'], $t];
        db_insert('id_photo_asks', ['subjectType' => $t, 'subjectId' => $id, 'askedBy' => $by, 'askedAt' => now_iso(), 'sent' => $sent ? 1 : 0, 'channels' => json_encode($sent)]);
        $results[] = ['subjectId' => $id, 'subjectType' => $t, 'sent' => $sent];
    }

    // The admins who own these cards, scoped to the centres involved: one notice each, per press.
    $admins = 0;
    foreach ($waiting as $cap => $people) {
        $centres = array_values(array_unique(array_filter(array_map(fn($x) => $x[1], $people))));
        $staff = staff_with_cap($cap, [$by], function ($s) use ($centres) {
            if (!$centres) return true;
            foreach ($centres as $c) if (admin_centre_allowed($s, $c)) return true;
            return false;
        });
        if (!$staff) continue;
        $names = array_map(fn($x) => $x[0] . ($x[1] !== '' ? ' (' . $x[1] . ')' : ''), array_slice($people, 0, IDS_ASK_DIGEST_NAMES));
        $more = count($people) - count($names);
        $admins += notify_people($staff, ['kind' => 'photo', 'title' => count($people) === 1 ? 'A card is waiting on a photo' : count($people) . ' cards are waiting on photos',
            'body' => 'A photo was requested for: ' . implode(', ', $names) . ($more > 0 ? ', and ' . $more . ' more' : '') . '. Their cards print as soon as a photo is approved. If you see them at the centre, a photo taken there works too.',
            'ctaLabel' => 'Open the ID Card Studio', 'ctaPath' => '/club/id-cards', 'linkPage' => 'id-cards']);
    }
    $asked = count(array_filter($results, fn($r) => isset($r['sent'])));
    audit('ids.photo.ask', $by, '', ['asked' => $asked, 'refused' => count($results) - $asked, 'admins' => $admins, 'force' => $force], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'asked' => $asked, 'admins' => $admins, 'results' => $results];
}

/**
 * Printed IDs for exactly these members, minted from the highest serial
 * (member_mint_display_id), before their cards are drawn. Never reissues: a
 * member who already has one keeps it. Centre-scoped per row.
 */
function admin_ids_mint(array $p): array {
    $g = admin_cap_gate($p, 'people'); if (!$g['ok']) return $g;
    $ids = array_values(array_unique(array_filter(array_map(fn($x) => trim((string)$x), (array)($p['memberIds'] ?? [])))));
    if (!$ids) return ['ok' => false, 'error' => 'no_items'];
    if (count($ids) > IDS_BATCH_MAX) return ['ok' => false, 'error' => 'too_many', 'message' => 'At most ' . IDS_BATCH_MAX . ' at a time.'];
    $issued = []; $refused = []; $reserved = []; $codes = []; $newQr = [];
    $codesOnly = !empty($p['codesOnly']);
    foreach ($ids as $id) {
        $m = db_row('SELECT * FROM members WHERE memberId = ? LIMIT 1', [$id]);
        if (!$m) { $refused[] = ['memberId' => $id, 'error' => 'not_found']; continue; }
        if (!member_is_ngg($m)) { $refused[] = ['memberId' => $id, 'error' => 'not_ngg']; continue; }
        if (!admin_centre_allowed($g['requester'], (string)($m['centre'] ?? ''))) { $refused[] = ['memberId' => $id, 'error' => 'out_of_scope']; continue; }
        /* The card about to print carries the member's SECURE code in its QR
           (what /q/ opens in full). Issued here, at print, for this operator's
           own centres — not when somebody merely lists the roster. */
        if ((string)($m['status'] ?? 'active') === 'active' && function_exists('member_cards_ensure')) {
            /* A card reprinted because the old one was LOST gets a new QR: the
               lost card must stop opening the member's page and the gate. Not
               on a proof (codesOnly) — a proof is nobody's card. Every other
               reprint keeps the code the member already carries. */
            $lostReq = $codesOnly ? null : db_row("SELECT requestedAt FROM id_reprints WHERE subjectType = 'member' AND subjectId = ? AND doneAt = '' AND cause IN ('lost','never_received') ORDER BY id DESC LIMIT 1", [$id]);
            // Once per request: a retried print reuses the code this request already issued.
            $cur = $lostReq ? db_row("SELECT issuedAt FROM member_cards WHERE memberId = ? AND kind = 'secure' AND status = 'active' ORDER BY id DESC LIMIT 1", [$id]) : null;
            $lost = $lostReq && (!$cur || (string)$cur['issuedAt'] < (string)$lostReq['requestedAt']);
            $c = $lost && function_exists('member_card_issue') ? member_card_issue($id, (string)$g['requester']['memberId'], 'reprint-lost')
                : member_cards_ensure($m, (string)$g['requester']['memberId'], 'print')['secure'];
            if ($c) $codes[$id] = $c;
            if ($lost) $newQr[] = $id;
        }
        if ($codesOnly) continue;
        if ((string)($m['displayId'] ?? '') !== '') { $refused[] = ['memberId' => $id, 'error' => 'unchanged', 'displayId' => (string)$m['displayId']]; continue; }
        /* Claimed, not just computed: two operators printing at once would
           otherwise mint the same next serial for two members. The write is
           conditional too, so a racing mint never replaces an ID already
           rendered onto somebody's card. */
        $did = member_mint_and_claim($m, $id, $reserved);
        if ($did === '') { $refused[] = ['memberId' => $id, 'error' => 'mint_failed']; continue; }
        $reserved[] = $did;
        $won = db_exec("UPDATE members SET displayId = ?, updatedAt = ? WHERE memberId = ? AND COALESCE(displayId,'') = ''", [$did, now_iso(), $id]);
        if (!$won) { $now = (string)(db_row('SELECT displayId FROM members WHERE memberId = ?', [$id])['displayId'] ?? ''); $refused[] = ['memberId' => $id, 'error' => 'unchanged', 'displayId' => $now]; continue; }
        $issued[$id] = $did;
    }
    audit('ids.mint', (string)$g['requester']['memberId'], '', ['issued' => count($issued), 'refused' => count($refused), 'codes' => count($codes), 'newQr' => count($newQr)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'issued' => (object)$issued, 'refused' => $refused, 'codes' => (object)$codes, 'newQr' => $newQr];
}

/* ── Print from a prompt (admin.ids.plan) ─────────────────────────────────────
 * "New cards for Egbeda members, front and back" becomes a PLAN: which records
 * (kind, centre, new/reprint/all, a date or number range, named IDs or people,
 * people added on top and people left out) and how the sheet is set (sides,
 * crop marks, paper, dpi, order, proof). The plan only ever SELECTS from what
 * the studio already shows the operator and sets its own controls; it prints
 * nothing and writes nothing but an audit line.
 *
 * A follow-up refines the plan on screen ("fronts only", "only Ijaiye", "add
 * 026-010", "not Ada"): the studio sends the current plan with the request,
 * and a request that names a fresh selection starts again.
 *
 * Read by the 'studio' AI profile when a key is set (Groq, Gemini, Anthropic,
 * OpenAI, OpenRouter), and always by the rules below, which also stand alone
 * with no key. Whatever the model returns is cleaned against allow-lists: a
 * field outside them is dropped, never passed on. */
const IDS_PLAN_PROMPT_MAX = 400;
const IDS_PLAN_KINDS = ['member', 'summer', 'volunteer', 'afrovanguard'];   // the studio's kinds
const IDS_PLAN_WHICH = ['new', 'reprint', 'all'];
const IDS_PLAN_BACKS = ['off', 'long', 'short'];
const IDS_PLAN_PAPERS = ['a4', 'letter', 'a3'];
const IDS_PLAN_DPI = [150, 300, 600];
const IDS_PLAN_ORDERS = ['centre', 'kind', 'name'];
const IDS_PLAN_IDS_MAX = 600;
const IDS_PLAN_NAMES_MAX = 50;
const IDS_PLAN_NONE = 'none';            // "people with no centre on their record"
const IDS_PLAN_SCALARS = ['kind', 'centre', 'centres', 'which', 'dateFrom', 'dateTo', 'numFrom', 'numTo', 'numPrefix', 'limit', 'latest', 'hasPhoto', 'backs', 'marks', 'paper', 'dpi', 'order', 'proof',
    'margin', 'gap', 'skip', 'breakBy', 'packing', 'cause', 'notKinds'];
const IDS_PLAN_CENTRES_MAX = 12;
/* A kind said of ONE named person ("Badmus should be NGG, not summer"): which
   of their records is meant, when a name is on more than one list. Never a
   filter on everybody else. */
const IDS_PLAN_KIND_WORDS = ['ngg' => 'member', 'member' => 'member', 'members' => 'member', 'summer' => 'summer', 'summer school' => 'summer',
    'participant' => 'summer', 'participants' => 'summer', 'volunteer' => 'volunteer', 'volunteers' => 'volunteer', 'afrovanguard' => 'afrovanguard'];
/* One-off acts the assistant may ask the studio to do (v4's whitelist). Each
   is carried out in the browser through the studio's own controls, and the
   ones that reach people (asking for photos) still go through the confirm
   that states the count. None of them prints, and none marks anyone printed. */
const IDS_PLAN_DO = ['clear', 'fill', 'askPhotos', 'improvePhotos', 'adjustPhoto'];
/* "Improve the photos, remove their backgrounds" is a Cloudinary edit (the
   studio's Improve photos, admin.photo.edit.bulk); "help position the image"
   opens the photo editor. Both still go through the studio's own dialog,
   with the count, before anything changes. */
const IDS_PLAN_PHOTO_GRAVITY = ['face', 'center', 'north', 'south'];
const IDS_PLAN_ACTS_MAX = 3;
// A request that only names an AI is about the assistant, not about a person called Gemini.
const IDS_PLAN_PROVIDER_WORDS = ['Gemini', 'Groq', 'Claude', 'Anthropic', 'OpenAI', 'ChatGPT', 'GPT', 'OpenRouter', 'AI', 'Llama'];
// The time the planner gives the AI before the rules answer alone (the browser waits 40s).
const IDS_PLAN_AI_BUDGET = 22;
const IDS_PLAN_MARGIN = [3, 30];
const IDS_PLAN_GAP = [0, 20];
const IDS_PLAN_SKIP_MAX = 60;
/* Why a card is being reprinted, when the request says so. It matters: a
   LOST (or never received) card's reprint gets a new QR and the old card
   stops opening the gate; a damaged one keeps its QR. */
const IDS_PLAN_CAUSES = ['lost', 'damaged', 'never_received', 'name'];
const IDS_PLAN_NUMBER_WORDS = ['one' => 1, 'two' => 2, 'three' => 3, 'four' => 4, 'five' => 5, 'six' => 6, 'seven' => 7, 'eight' => 8, 'nine' => 9, 'ten' => 10,
    'eleven' => 11, 'twelve' => 12, 'a dozen' => 12, 'dozen' => 12, 'fifteen' => 15, 'twenty' => 20, 'thirty' => 30, 'forty' => 40, 'fifty' => 50, 'a hundred' => 100, 'hundred' => 100];
const IDS_PLAN_MONTHS = ['jan' => 1, 'feb' => 2, 'mar' => 3, 'apr' => 4, 'may' => 5, 'jun' => 6, 'jul' => 7, 'aug' => 8, 'sep' => 9, 'oct' => 10, 'nov' => 11, 'dec' => 12];
const IDS_PLAN_MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
// Words that start a follow-up rather than a fresh request.
const IDS_PLAN_REFINE_RE = '/^\s*(only|just|make (it|them)|and|also|add|plus|include|remove|drop|without|except|not|but|now|switch|change|instead|use|with|no|leave out|take (off|out))\b/u';
// What introduces people to add, and people to leave out.
const IDS_PLAN_ADD_RE = '/\b(?:add|also|plus|include|and also)\b(.*)$/iu';
const IDS_PLAN_EXCLUDE_RE = '/\b(?:except(?: for)?|excluding|apart from|other than|but not|leave out|take (?:off|out)|remove|drop|minus|not)\b(.*)$/iu';

/** The studio kinds this operator may print (a kind maps to the subject's owning capability). */
function ids_plan_kinds(array $requester): array {
    $map = ['member' => 'member', 'summer' => 'student', 'volunteer' => 'volunteer', 'afrovanguard' => 'afrovanguard'];
    return array_values(array_filter(IDS_PLAN_KINDS, fn($k) => ids_can($requester, $map[$k])));
}

/** Centre names (and codes) the operator could mean: their scope when scoped, every centre otherwise. */
function ids_plan_centres(array $requester): array {
    $scope = admin_centre_names_in_scope($requester);
    $out = [];
    foreach (db_all("SELECT name, code FROM centres WHERE name <> '' ORDER BY name") as $c) {
        if ($scope !== null && !in_array((string)$c['name'], $scope, true)) continue;
        $out[] = ['name' => (string)$c['name'], 'code' => (string)$c['code']];
    }
    return $out;
}

function ids_plan_today(): string {
    try { return (new DateTime('now', new DateTimeZone('Africa/Lagos')))->format('Y-m-d'); } catch (\Throwable $e) { return gmdate('Y-m-d'); }
}

/** How far a typed word may be from a name and still mean it: none under 5 letters, one under 8, two above. */
function ids_plan_typo_room(string $s): int { $n = mb_strlen($s); return $n < 5 ? 0 : ($n < 8 ? 1 : 2); }

/** A centre named in words: its exact name, its code, the one centre whose name contains it, or a near spelling. */
function ids_plan_centre_match(string $said, array $centres): ?string {
    $s = mb_strtolower(trim($said));
    if ($s === '') return null;
    if (in_array($s, ['none', 'no centre', 'no center', 'without a centre', 'without a center'], true)) return IDS_PLAN_NONE;
    foreach ($centres as $c) if (mb_strtolower($c['name']) === $s || ($c['code'] !== '' && mb_strtolower($c['code']) === $s)) return $c['name'];
    $hits = array_values(array_filter($centres, fn($c) => str_contains(mb_strtolower($c['name']), $s)));
    if (count($hits) === 1) return $hits[0]['name'];
    $best = null; $bestD = PHP_INT_MAX; $tie = false;
    foreach ($centres as $c) {
        $d = levenshtein($s, mb_strtolower($c['name']));
        if ($d > ids_plan_typo_room($c['name'])) continue;
        if ($d < $bestD) { $best = $c['name']; $bestD = $d; $tie = false; } elseif ($d === $bestD) $tie = true;
    }
    return $best !== null && !$tie ? $best : null;
}

function ids_plan_date($v): ?string {
    $v = trim((string)$v);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return null;
    [$y, $m, $d] = array_map('intval', explode('-', $v));
    return checkdate($m, $d, $y) ? $v : null;
}

/** IDs and names, checked: the shape of a printed ID or record id, and of a person's name. */
function ids_plan_clean_people($in): array {
    $in = is_array($in) ? $in : [];
    $ids = []; $names = [];
    foreach ((array)($in['ids'] ?? []) as $x) {
        $x = strtoupper(trim((string)$x));
        if ($x !== '' && strlen($x) <= 40 && preg_match('/^[A-Z0-9][A-Z0-9 \-_.\/]*$/', $x) && !in_array($x, $ids, true)) $ids[] = $x;
        if (count($ids) >= IDS_PLAN_IDS_MAX) break;
    }
    foreach ((array)($in['names'] ?? []) as $x) {
        $x = trim(preg_replace('/\s+/u', ' ', (string)$x));
        if ($x !== '' && mb_strlen($x) <= 60 && preg_match('/^[\p{L}][\p{L}\p{M}\'’\- .]*$/u', $x) && !in_array($x, $names, true)) $names[] = $x;
        if (count($names) >= IDS_PLAN_NAMES_MAX) break;
    }
    return array_filter(['ids' => $ids, 'names' => $names]);
}

/** Everything the plan may say, checked. Unknown or out-of-range values are dropped. */
function ids_plan_clean(array $in, array $kinds, array $centres): array {
    $out = [];
    $notes = [];
    if (isset($in['notKinds'])) {
        $nk = array_values(array_unique(array_filter(array_map(static fn($k) => IDS_PLAN_KIND_WORDS[strtolower(trim((string)$k))] ?? strtolower(trim((string)$k)), (array)$in['notKinds']),
            static fn($k) => in_array($k, IDS_PLAN_KINDS, true))));
        if ($nk) $out['notKinds'] = $nk;
    }
    $kind = strtolower(trim((string)($in['kind'] ?? '')));
    if (in_array($kind, ['student', 'participant', 'participants'], true)) $kind = 'summer';
    if (in_array($kind, ['members', 'ngg'], true)) $kind = 'member';
    if (in_array($kind, ['volunteers'], true)) $kind = 'volunteer';
    if ($kind !== '') {
        if (in_array($kind, $kinds, true)) $out['kind'] = $kind;
        elseif (in_array($kind, IDS_PLAN_KINDS, true)) $notes[] = 'You can’t print ' . $kind . ' cards here, so that part was left out.';
    }
    if (isset($in['centre']) && trim((string)$in['centre']) !== '') {
        $c = ids_plan_centre_match((string)$in['centre'], $centres);
        if ($c !== null) $out['centre'] = $c;
        else $notes[] = 'No centre called “' . mb_substr(trim((string)$in['centre']), 0, 40) . '”, so every centre is included.';
    }
    /* Several centres ("Ijaiye and Ikorodu"): each must be a real one; one
       left is just `centre`. A centre nobody has is said, never guessed. */
    if (is_array($in['centres'] ?? null)) {
        $cs = [];
        foreach (array_slice($in['centres'], 0, IDS_PLAN_CENTRES_MAX) as $said) {
            if (!is_scalar($said) || trim((string)$said) === '') continue;
            $c = ids_plan_centre_match((string)$said, $centres);
            if ($c === null) { $notes[] = 'No centre called “' . mb_substr(trim((string)$said), 0, 40) . '”, so it was left out.'; continue; }
            if (!in_array($c, $cs, true)) $cs[] = $c;
        }
        if (isset($out['centre']) && !in_array($out['centre'], $cs, true) && $cs) array_unshift($cs, $out['centre']);
        if (count($cs) > 1) { $out['centres'] = $cs; unset($out['centre']); }
        elseif ($cs) $out['centre'] = $cs[0];
    }
    if (isset($in['hasPhoto']) && is_bool($in['hasPhoto'])) $out['hasPhoto'] = $in['hasPhoto'];
    if (!empty($in['latest']) && $in['latest'] === true) $out['latest'] = true;
    $which = strtolower((string)($in['which'] ?? ''));
    if (in_array($which, IDS_PLAN_WHICH, true)) $out['which'] = $which;
    $out += ids_plan_clean_people(['ids' => $in['ids'] ?? [], 'names' => $in['names'] ?? []]);
    foreach (['also', 'exclude'] as $k) { $pp = ids_plan_clean_people($in[$k] ?? []); if ($pp) $out[$k] = $pp; }
    foreach (['dateFrom', 'dateTo'] as $k) if (($d = ids_plan_date($in[$k] ?? '')) !== null) $out[$k] = $d;
    if (isset($out['dateFrom'], $out['dateTo']) && $out['dateFrom'] > $out['dateTo']) [$out['dateFrom'], $out['dateTo']] = [$out['dateTo'], $out['dateFrom']];
    foreach (['numFrom', 'numTo'] as $k) {
        if (isset($in[$k]) && is_numeric($in[$k]) && (int)$in[$k] >= 0 && (int)$in[$k] <= 999999) $out[$k] = (int)$in[$k];
    }
    if (isset($out['numFrom'], $out['numTo']) && $out['numFrom'] > $out['numTo']) [$out['numFrom'], $out['numTo']] = [$out['numTo'], $out['numFrom']];
    // The printed ID's own prefix for a range said as two IDs ("026-001 to 026-040"): 2026's, not every year's.
    $np = strtoupper(trim((string)($in['numPrefix'] ?? '')));
    if ($np !== '' && (isset($out['numFrom']) || isset($out['numTo'])) && preg_match('/^(?:\d{3}|[A-Z]{2,4}-\d{2})$/', $np)) $out['numPrefix'] = $np;
    if (isset($in['limit']) && is_numeric($in['limit']) && (int)$in['limit'] >= 1) $out['limit'] = min(IDS_BATCH_MAX, (int)$in['limit']);
    $backs = strtolower((string)($in['backs'] ?? ''));
    if (in_array($backs, IDS_PLAN_BACKS, true)) $out['backs'] = $backs;
    if (isset($in['marks']) && is_bool($in['marks'])) $out['marks'] = $in['marks'];
    $paper = strtolower((string)($in['paper'] ?? ''));
    if (in_array($paper, IDS_PLAN_PAPERS, true)) $out['paper'] = $paper;
    if (isset($in['dpi']) && in_array((int)$in['dpi'], IDS_PLAN_DPI, true)) $out['dpi'] = (int)$in['dpi'];
    $order = strtolower((string)($in['order'] ?? ''));
    if (in_array($order, IDS_PLAN_ORDERS, true)) $out['order'] = $order;
    if (isset($in['proof']) && is_bool($in['proof'])) $out['proof'] = $in['proof'];
    if (isset($in['margin']) && is_numeric($in['margin'])) $out['margin'] = max(IDS_PLAN_MARGIN[0], min(IDS_PLAN_MARGIN[1], (int)round((float)$in['margin'])));
    if (isset($in['gap']) && is_numeric($in['gap'])) $out['gap'] = max(IDS_PLAN_GAP[0], min(IDS_PLAN_GAP[1], (int)round((float)$in['gap'])));
    if (isset($in['skip']) && is_numeric($in['skip']) && (int)$in['skip'] >= 0) $out['skip'] = min(IDS_PLAN_SKIP_MAX, (int)$in['skip']);
    foreach (['breakBy', 'packing'] as $k) if (isset($in[$k]) && is_bool($in[$k])) $out[$k] = $in[$k];
    $cause = (string)($in['cause'] ?? '');
    if (in_array($cause, IDS_PLAN_CAUSES, true)) $out['cause'] = $cause;
    // One act or several, in the order asked ("improve the photos, then ask the rest for one").
    $acts = [];
    foreach ((array)($in['acts'] ?? []) as $a) if (in_array((string)$a, IDS_PLAN_DO, true) && !in_array((string)$a, $acts, true)) $acts[] = (string)$a;
    foreach ((array)($in['do'] ?? []) as $a) if (in_array((string)$a, IDS_PLAN_DO, true) && !in_array((string)$a, $acts, true)) $acts[] = (string)$a;
    $acts = array_slice($acts, 0, IDS_PLAN_ACTS_MAX);
    if ($acts) { $out['do'] = $acts[0]; if (count($acts) > 1) $out['acts'] = $acts; }
    if (is_array($in['photo'] ?? null)) {
        $ph = [];
        foreach (['removeBg', 'brighten', 'sharpen'] as $k) if (isset($in['photo'][$k]) && is_bool($in['photo'][$k])) $ph[$k] = $in['photo'][$k];
        if (in_array((string)($in['photo']['gravity'] ?? ''), IDS_PLAN_PHOTO_GRAVITY, true)) $ph['gravity'] = (string)$in['photo']['gravity'];
        if (isset($in['photo']['zoom']) && is_numeric($in['photo']['zoom'])) $ph['zoom'] = round(max(1, min(2.5, (float)$in['photo']['zoom'])), 2);
        if ($ph) $out['photo'] = $ph;
    }
    if (is_array($in['kindOf'] ?? null)) {
        $ko = [];
        foreach ($in['kindOf'] as $name => $k) {
            $name = trim(preg_replace('/\s+/u', ' ', (string)$name)); $k = IDS_PLAN_KIND_WORDS[strtolower(trim((string)$k))] ?? strtolower(trim((string)$k));
            if ($name === '' || mb_strlen($name) > 60 || !preg_match('/^[\p{L}][\p{L}\p{M}\'’\- .]*$/u', $name) || !in_array($k, $kinds, true)) continue;
            $ko[$name] = $k;
            if (count($ko) >= IDS_PLAN_NAMES_MAX) break;
        }
        if ($ko) $out['kindOf'] = $ko;
    }
    return ['plan' => $out, 'notes' => $notes];
}

/** Printed IDs as they are written: 026-014, EG-26-001, and record ids (NGG-…, SUM-…, VOL-…). */
function ids_plan_find_ids(string $t): array {
    preg_match_all('/\b(?:[a-z]{2,4}-\d{2}-\d{3,4}|\d{3}-\d{3,4}|(?:ngg|sum|vol|av)-[a-z0-9]+(?:-[a-z0-9]+)*)\b/iu', $t, $m);
    return array_values(array_unique(array_map('strtoupper', $m[0])));
}

/** People's names in a clause: runs of capitalised words that are not a centre, a kind, a month or a command. */
function ids_plan_find_names(string $clause, array $centres): array {
    $skip = array_merge(['Add', 'Also', 'Plus', 'Include', 'Except', 'Not', 'But', 'And', 'Remove', 'Drop', 'Without', 'Leave', 'Take', 'Out', 'Off', 'Only', 'Just', 'The', 'For', 'At', 'In',
        'Members', 'Member', 'Summer', 'School', 'Participants', 'Volunteers', 'Afrovanguard', 'NGG', 'Reprint', 'Reprints', 'New', 'Cards', 'Card', 'Print', 'Proof', 'Monday', 'Tuesday',
        'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'A4', 'A3', 'Letter', 'Improve', 'Fix', 'Ask', 'Remove', 'Can', 'Please', 'Help', 'Photos', 'Photo',
        'Front', 'Fronts', 'Back', 'Backs', 'Double', 'Single', 'Sided', 'Make', 'It', 'I', 'We', 'Need', 'Following', 'These', 'Them', 'They', 'Should', 'Use', 'Fill', 'Clear', 'Then',
        'Crop', 'Marks', 'Long', 'Short', 'Edge', 'Sheet', 'Sheets', 'Name', 'Names', 'Is', 'Are', 'Who', 'What', 'Why', 'How', 'Where', 'When', 'Ok', 'OK', 'Yes', 'No', 'Club'],
        IDS_PLAN_PROVIDER_WORDS, array_map(fn($c) => $c['name'], $centres));
    // A centre's name is not a person's, however many words it has ("Yaba Hub").
    foreach ($centres as $c) $clause = (string)preg_replace('/(?<![\p{L}])' . preg_quote((string)$c['name'], '/') . '(?![\p{L}])/u', ' ', $clause);
    preg_match_all('/\b\p{Lu}[\p{Ll}\'’\-]+(?:\s+\p{Lu}[\p{Ll}\'’\-]+)*/u', $clause, $m);
    $out = [];
    foreach ($m[0] as $run) {
        // "Ada Okafor's card" is Ada Okafor.
        $run = (string)preg_replace('/[\'’]s?$/u', '', $run);
        $words = array_values(array_filter(preg_split('/\s+/u', $run), fn($w) => !in_array($w, $skip, true) && !preg_match('/^' . IDS_PLAN_MONTH_RE . '$/iu', $w)));
        if ($words) $out[] = implode(' ', $words);
    }
    return array_values(array_unique($out));
}

/** Every centre the text names, in the order written ("Ijaiye and Ikorodu"). The
 *  same tests as ids_plan_find_centre, plus the first word of a longer name
 *  after "at/in/for/from" ("at Yaba" for Yaba Hub) when only one centre has it. */
function ids_plan_find_centres(string $t, array $centres): array {
    if (preg_match('/\b(no|without an?)\s+cent(re|er)\b/u', $t)) return [IDS_PLAN_NONE];
    $words = preg_split('/[^\p{L}]+/u', $t, -1, PREG_SPLIT_NO_EMPTY);
    $found = [];
    foreach ($centres as $c) {
        $n = mb_strtolower($c['name']); $at = -1;
        if (preg_match('/(?<![\p{L}])' . preg_quote($n, '/') . '(?![\p{L}])/u', $t, $m, PREG_OFFSET_CAPTURE)) $at = $m[0][1];
        elseif ($c['code'] !== '' && preg_match('/\b(at|in|for|from)\s+' . preg_quote(mb_strtolower($c['code']), '/') . '\b(?!-)/u', $t, $m, PREG_OFFSET_CAPTURE)) $at = $m[0][1];
        else {
            $first = explode(' ', $n)[0];
            $shared = count(array_filter($centres, static fn($o) => explode(' ', mb_strtolower($o['name']))[0] === $first));
            if ($first !== $n && mb_strlen($first) >= 4 && $shared === 1 && preg_match('/\b(?:at|in|for|from)\s+' . preg_quote($first, '/') . '\b/u', $t, $m, PREG_OFFSET_CAPTURE)) $at = $m[0][1];
            else {
                $k = count(preg_split('/\s+/u', $n)); $room = ids_plan_typo_room($n);
                if ($room > 0) for ($i = 0; $i + $k <= count($words); $i++) {
                    $w = implode(' ', array_slice($words, $i, $k));
                    if (mb_strlen($w) >= 4 && levenshtein($w, $n) <= $room && preg_match('/(?<![\p{L}])' . preg_quote($w, '/') . '/u', $t, $m, PREG_OFFSET_CAPTURE)) { $at = $m[0][1]; break; }
                }
            }
        }
        if ($at >= 0) $found[$c['name']] = $at;
    }
    // A longer name wins over a shorter one inside it ("Yaba Hub" over "Yaba").
    foreach (array_keys($found) as $a) foreach (array_keys($found) as $b)
        if ($a !== $b && isset($found[$a], $found[$b]) && str_contains(mb_strtolower($b), mb_strtolower($a)) && abs($found[$a] - $found[$b]) <= mb_strlen($b)) unset($found[$a]);
    asort($found);
    return array_keys($found);
}

/** A centre in free text: its name (or a near spelling of it), or its code after "at/in/for/from". */
function ids_plan_find_centre(string $t, array $centres): ?string {
    if (preg_match('/\b(no|without an?)\s+cent(re|er)\b/u', $t)) return IDS_PLAN_NONE;
    $words = preg_split('/[^\p{L}]+/u', $t, -1, PREG_SPLIT_NO_EMPTY);
    $best = null; $bestD = PHP_INT_MAX; $bestLen = 0;
    foreach ($centres as $c) {
        $n = mb_strtolower($c['name']);
        if (preg_match('/(?<![\p{L}])' . preg_quote($n, '/') . '(?![\p{L}])/u', $t)
            || ($c['code'] !== '' && preg_match('/\b(at|in|for|from)\s+' . preg_quote(mb_strtolower($c['code']), '/') . '\b(?!-)/u', $t))) {
            $d = 0;
        } else {
            // A near spelling ("Egbda"), compared word for word with the name's own length.
            $k = count(preg_split('/\s+/u', $n)); $room = ids_plan_typo_room($n); $d = PHP_INT_MAX;
            if ($room > 0) for ($i = 0; $i + $k <= count($words); $i++) {
                $w = implode(' ', array_slice($words, $i, $k));
                if (mb_strlen($w) >= 4) $d = min($d, levenshtein($w, $n));
            }
            if ($d > $room) continue;
        }
        if ($d < $bestD || ($d === $bestD && mb_strlen($c['name']) > $bestLen)) { $best = $c['name']; $bestD = $d; $bestLen = mb_strlen($c['name']); }
    }
    return $best;
}

/** The rules: what the words plainly say. They always run; the model's reading wins where it says more. */
function ids_plan_rules(string $prompt, array $kinds, array $centres, string $today): array {
    $t = mb_strtolower($prompt);
    $p = [];
    /* People to leave out, and people to add, are read from their own clause,
       so "except 026-002" never puts 026-002 on the sheet. "without a card",
       "without crop marks" and "no centre" are not exclusions. */
    /* "Except those already printed" is not a person to leave out: it is the
       people still waiting for a card. Read before the exclusion clause. */
    $waitRe = '/\b(?:except|but not|excluding|other than|apart from|not)\s+(?:for\s+)?(?:those|the ones|people|anyone|anybody|everyone|ones)?\s*(?:who|that)?\s*(?:are|is|have|has|\'ve)?\s*(?:already|been)?\s*(?:been\s+)?(?:printed|carded|with (?:a\s+)?cards?|got (?:a\s+)?cards?|have (?:a\s+)?cards?)\b/iu';
    $waiting = (bool)preg_match($waitRe, $prompt);
    if ($waiting) $prompt = trim((string)preg_replace($waitRe, ' ', $prompt));
    $main = $prompt;
    $exClause = '';
    if (preg_match(IDS_PLAN_EXCLUDE_RE, $prompt, $m, PREG_OFFSET_CAPTURE) && !preg_match('/^\s*(?:the\s+|a\s+|any\s+)?(cards?|crop|cut|trim|backs?|cent(re|er)s?|marks?|proofs?|draft|limit|dates?|filter)\b/iu', $m[1][0])) {
        $exClause = $m[1][0];
        $main = substr($prompt, 0, $m[0][1]);
    }
    $addClause = '';
    if (preg_match(IDS_PLAN_ADD_RE, $main, $m, PREG_OFFSET_CAPTURE) && (ids_plan_find_ids($m[1][0]) || ids_plan_find_names($m[1][0], $centres))) {
        $addClause = $m[1][0];
        $main = substr($main, 0, $m[0][1]);
    }
    /* "Badmus should be NGG, not summer": a kind said of one named person
       picks which of their records is meant. The clause is taken out before
       the kind is read, so it never becomes a filter on everyone. */
    $kindRe = '/(\p{Lu}[\p{L}\'’\-]+(?:\s+\p{Lu}[\p{L}\'’\-]+)*)\s+(?:should be|must be|needs to be|is an?|is|are|as an?|as)\s+(?:an?\s+|the\s+)?((?i:ngg|members?|summer(?: school)?|participants?|volunteers?|afrovanguard))\b(?:[^.;!?]*?\b(?i:not)\s+(?:an?\s+|the\s+)?(?i:ngg|members?|summer(?: school)?|participants?|volunteers?)\b)?/u';
    if (preg_match_all($kindRe, $main, $km, PREG_SET_ORDER)) {
        foreach ($km as $k) {
            $who = trim(preg_replace('/^(?:The|A|An|Make|Put|Print)\s+/u', '', $k[1]));
            if ($who !== '' && !in_array($who, IDS_PLAN_PROVIDER_WORDS, true)) $p['kindOf'][$who] = IDS_PLAN_KIND_WORDS[mb_strtolower($k[2])] ?? 'member';
            $main = str_replace($k[0], ' ', $main);
        }
    }
    $mt = mb_strtolower($main);
    /* "It should exclude summer", "no volunteers": a kind left out, read before
       the kind itself so "summer" here never means "Summer School only". */
    $kindAlt = 'summer(?: school)?|participants?|campers?|volunteers?|members?|ngg|afrovanguard';
    if (preg_match_all('/\b(?:exclud\w*|without|no|not|except|minus|leave out|drop|remove|skip)\s+(?:the\s+|any\s+)?(' . $kindAlt . ')\b(?:\s+(?:ones|people|records|cards))?/u', $mt, $nk, PREG_SET_ORDER)) {
        foreach ($nk as $x) { $p['notKinds'][] = IDS_PLAN_KIND_WORDS[$x[1]] ?? (str_starts_with($x[1], 'camper') ? 'summer' : 'member'); $mt = str_replace($x[0], ' ', $mt); }
        $p['notKinds'] = array_values(array_unique($p['notKinds']));
    }
    if ($exClause !== '') { $ex = array_filter(['ids' => ids_plan_find_ids($exClause), 'names' => ids_plan_find_names($exClause, $centres)]); if ($ex) $p['exclude'] = $ex; }
    if ($addClause !== '') { $ad = array_filter(['ids' => ids_plan_find_ids($addClause), 'names' => ids_plan_find_names($addClause, $centres)]); if ($ad) $p['also'] = $ad; }

    /* Two kinds or more ("volunteers and members"): the kinds not named are
       the ones left out, so both lists come. */
    $named = [];
    foreach (['summer' => '/\b(summer|participants?|campers?)\b/u', 'volunteer' => '/\b(volunteers?|mentors?|instructors?)\b/u',
              'afrovanguard' => '/\b(afrovanguard|vanguard|ngv)\b/u', 'member' => '/\b(members?|ngg)\b/u'] as $k => $re)
        if (preg_match($re, $mt, $km2, PREG_OFFSET_CAPTURE)) $named[$k] = $km2[0][1];
    if (count($named) >= 2 && empty($p['notKinds']) && preg_match('/\b(?:and|&|plus|together|both)\b/u', $mt) && !preg_match('/\bsummer\s+(?:school\s+)?members?\b|\bngg\s+members?\b/u', $mt)) {
        $p['notKinds'] = array_values(array_diff(IDS_PLAN_KINDS, array_keys($named)));
    }
    if (count($named) >= 2 && isset($p['notKinds']) && count($p['notKinds']) === count(IDS_PLAN_KINDS) - count($named)) { /* both lists: no single kind */ }
    elseif (preg_match('/\b(summer|participants?|campers?)\b/u', $mt)) $p['kind'] = 'summer';
    elseif (preg_match('/\b(volunteers?|mentors?|instructors?|staff)\b/u', $mt)) $p['kind'] = 'volunteer';
    elseif (preg_match('/\b(afrovanguard|vanguard|ngv)\b/u', $mt)) $p['kind'] = 'afrovanguard';
    elseif (preg_match('/\b(members?|ngg|kids|children|students?)\b/u', $mt)) $p['kind'] = 'member';
    $cs = ids_plan_find_centres($mt, $centres);
    if (count($cs) > 1 && !in_array(IDS_PLAN_NONE, $cs, true)) $p['centres'] = $cs;
    elseif ($cs) $p['centre'] = $cs[0];
    $stillNeeds = '/\b(?:still\s+)?needs?\s+(?:a\s+|their\s+)?cards?\b|\b(?:don.?t|do not|doesn.?t|does not)\s+have\s+(?:a\s+)?cards?\b|\bwaiting (?:for|on) (?:a\s+|their\s+)?cards?\b|\bno cards? yet\b|\bnot (?:yet\s+)?(?:been\s+)?printed\b|\bhaven.?t been printed\b|\bnot carded\b/u';
    if (preg_match('/\b(reprints?|re-?print|replace(ment)?s?|lost|damaged|stolen)\b/u', $mt)) $p['which'] = 'reprint';
    elseif ($waiting || preg_match($stillNeeds, $mt) || preg_match('/\b(new|first time|never had|haven.?t had|without a card)\b/u', $mt)) $p['which'] = 'new';
    elseif (preg_match('/\b(everyone|everybody|all of them|whole (list|queue)|all waiting)\b/u', $mt)) $p['which'] = 'all';
    $ids = ids_plan_find_ids($main);
    /* "026-001 to 026-040" is the forty between, not two people: a range on
       the printed number, kept to that prefix (2026's, not every year's). */
    if (preg_match('/\b(\d{3}|[a-z]{2,4}-\d{2})-(\d{3,4})\s*(?:-|–|—|to|through|thru|until|till)\s*(?:\1-)?(\d{3,4})\b/iu', $main, $rg)) {
        $p['numFrom'] = (int)$rg[2]; $p['numTo'] = (int)$rg[3]; $p['numPrefix'] = strtoupper($rg[1]);
        $ids = array_values(array_diff($ids, [strtoupper($rg[1] . '-' . $rg[2]), strtoupper($rg[1] . '-' . $rg[3])]));
        if (preg_match('/^\d{3}$/', $rg[1]) && !isset($p['kind']) && empty($p['notKinds'])) $p['kind'] = 'member';
    }
    if ($ids) $p['ids'] = $ids;
    /* Photos on file, as a filter: "without a photo", "only the ones with photos". */
    $picW = '(?:photos?|pictures?|pics?|headshots?|passport(?:s| photos?)?)';
    if (preg_match('/\b(?:without|no|missing|lacking|need(?:s|ing)?)\s+(?:a\s+|any\s+|their\s+)?' . $picW . '\b|\b' . $picW . '\s+(?:missing|not uploaded|not in)\b|\b(?:haven.?t|hasn.?t|don.?t|doesn.?t)\s+(?:got\s+|have\s+)?(?:a\s+|any\s+)?' . $picW . '\b/u', $mt)) $p['hasPhoto'] = false;
    elseif (preg_match('/\b(?:with|has|have|having|got)\s+(?:a\s+|their\s+)?' . $picW . '\b(?!\s+(?:edit|fix|improv))/u', $mt) && !preg_match('/\b(?:improve|fix|brighten|sharpen|remove|background)\b/u', $mt)) $p['hasPhoto'] = true;
    /* People named in the request itself ("print these: 1. Agbalaya Habeebat
       2. Idi Oluwadarasimi"). Two words at least: a capital at the start of a
       sentence ("Front and back") is not a person. */
    $people = array_values(array_filter(ids_plan_find_names($main, $centres), static fn($n) => count(preg_split('/\s+/u', $n)) >= 2));
    if ($people) $p['names'] = $people;
    if (preg_match('/\b(?:cards?|numbers?|ids?|nos?\.?)\s*#?(\d{1,6})\s*(?:-|–|to|through|until)\s*#?(\d{1,6})\b/u', $mt, $r)) { $p['numFrom'] = (int)$r[1]; $p['numTo'] = (int)$r[2]; }

    $d = new DateTime($today);
    $ymd = fn(DateTime $x) => $x->format('Y-m-d');
    $monthStart = function (int $mon) use ($d): DateTime {
        $y = (int)$d->format('Y') - ($mon > (int)$d->format('n') ? 1 : 0);   // "in November" in October is last year's
        return new DateTime(sprintf('%04d-%02d-01', $y, $mon));
    };
    $mon = fn(string $w) => IDS_PLAN_MONTHS[substr($w, 0, 3)] ?? 0;
    if (preg_match('/\btoday\b/u', $mt)) { $p['dateFrom'] = $p['dateTo'] = $today; }
    elseif (preg_match('/\byesterday\b/u', $mt)) { $p['dateFrom'] = $p['dateTo'] = $ymd((clone $d)->modify('-1 day')); }
    elseif (preg_match('/\bthis week\b/u', $mt)) { $p['dateFrom'] = $ymd((clone $d)->modify('monday this week')); $p['dateTo'] = $today; }
    elseif (preg_match('/\blast week\b/u', $mt)) { $p['dateFrom'] = $ymd((clone $d)->modify('monday last week')); $p['dateTo'] = $ymd((clone $d)->modify('sunday last week')); }
    elseif (preg_match('/\bthis month\b/u', $mt)) { $p['dateFrom'] = $d->format('Y-m-01'); $p['dateTo'] = $today; }
    elseif (preg_match('/\blast month\b/u', $mt)) { $l = (clone $d)->modify('first day of last month'); $p['dateFrom'] = $l->format('Y-m-01'); $p['dateTo'] = $l->format('Y-m-t'); }
    elseif (preg_match('/\b(?:last|past)\s+(\d{1,3})\s+days?\b/u', $mt, $r)) { $p['dateFrom'] = $ymd((clone $d)->modify('-' . max(0, (int)$r[1] - 1) . ' days')); $p['dateTo'] = $today; }
    elseif (preg_match('/\b(?:since|from)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/u', $mt, $r)) {
        $x = (clone $d); if (strtolower($x->format('l')) !== $r[1]) $x->modify('last ' . $r[1]);
        $p['dateFrom'] = $ymd($x); $p['dateTo'] = $today;
    }
    elseif (preg_match('/\b(?:since|from|after)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?' . IDS_PLAN_MONTH_RE . '\b/u', $mt, $ra)
        || preg_match('/\b(?:since|from|after)\s+' . IDS_PLAN_MONTH_RE . '\s+(\d{1,2})(?:st|nd|rd|th)?\b/u', $mt, $rb)) {
        [$day, $mm] = !empty($ra) ? [(int)$ra[1], $mon($ra[2])] : [(int)$rb[2], $mon($rb[1])];
        $s = $monthStart($mm);
        if ($day >= 1 && $day <= (int)$s->format('t')) { $p['dateFrom'] = $s->format('Y-m-') . sprintf('%02d', $day); $p['dateTo'] = $today; }
    }
    elseif (preg_match('/\b(?:in|during|for|joined|registered)\s+' . IDS_PLAN_MONTH_RE . '\b/u', $mt, $r)) {
        $s = $monthStart($mon($r[1])); $p['dateFrom'] = $s->format('Y-m-01'); $p['dateTo'] = min($today, $s->format('Y-m-t'));
    }
    if (preg_match('/\b(?:since|from)\s+(\d{4}-\d{2}-\d{2})\b/u', $mt, $r)) $p['dateFrom'] = $r[1];
    if (preg_match('/\b(?:to|until|till)\s+(\d{4}-\d{2}-\d{2})\b/u', $mt, $r)) $p['dateTo'] = $r[1];

    if (preg_match('/\bshort[- ]edge\b/u', $t)) $p['backs'] = 'short';
    elseif (preg_match('/\b(double[- ]sided|two[- ]sided|both sides|front and back|fronts and backs|duplex|with (the )?backs?|long[- ]edge|backs? (too|as well)|and (the )?backs?|print (the )?backs?|include (the )?backs?)\b/u', $t)) $p['backs'] = 'long';
    elseif (preg_match('/\b(fronts? only|only (the )?fronts?|single[- ]sided|one[- ]sided|no backs?|without (the )?backs?)\b/u', $t)) $p['backs'] = 'off';
    if (preg_match('/\b(no|without)\s+(crop|cut|trim)\s+marks?\b/u', $t)) $p['marks'] = false;
    elseif (preg_match('/\b(crop|cut|trim)\s+marks?\b/u', $t)) $p['marks'] = true;
    if (preg_match('/\ba3\b/u', $t)) $p['paper'] = 'a3';
    elseif (preg_match('/\b(us )?letter( paper| size)?\b/u', $t) && !preg_match('/\bletters?\s+(to|for)\b/u', $t)) $p['paper'] = 'letter';
    elseif (preg_match('/\ba4\b/u', $t)) $p['paper'] = 'a4';
    if (preg_match('/\bproofs?\b|\bdraft\b|\btest (print|sheet)\b/u', $t)) { $p['proof'] = true; $p['dpi'] = 150; }
    elseif (preg_match('/\b(not a proof|for real|real print|final)\b/u', $t)) $p['proof'] = false;
    if (preg_match('/\b600\s*dpi\b|\bhighest quality\b|\bfine\b/u', $t)) $p['dpi'] = 600;
    elseif (preg_match('/\b300\s*dpi\b/u', $t)) $p['dpi'] = 300;
    elseif (preg_match('/\b150\s*dpi\b/u', $t)) $p['dpi'] = 150;
    if (preg_match('/\b(by name|alphabetical(ly)?|a to z|a-z)\b/u', $t)) $p['order'] = 'name';
    elseif (preg_match('/\bby (centre|center)\b/u', $t)) $p['order'] = 'centre';
    elseif (preg_match('/\bby (kind|type)\b/u', $t)) $p['order'] = 'kind';
    // Layout, said in millimetres or slots.
    // "margin 5mm" and "a 5mm margin" both.
    if (preg_match('/\bmargins?\s*(?:of|to|at|=)?\s*(\d{1,2}(?:\.\d)?)\s*(?:mm|millimet(?:re|er)s?)?\b/u', $t, $r)
        || preg_match('/\b(\d{1,2}(?:\.\d)?)\s*(?:mm|millimet(?:re|er)s?)\s+margins?\b/u', $t, $r)) $p['margin'] = (float)$r[1];
    if (preg_match('/\b(?:gaps?|gutters?|spacing)\s*(?:of|to|at|=|between cards)?\s*(\d{1,2}(?:\.\d)?)\s*(?:mm|millimet(?:re|er)s?)?\b/u', $t, $r)
        || preg_match('/\b(\d{1,2}(?:\.\d)?)\s*(?:mm|millimet(?:re|er)s?)\s+(?:gaps?|gutters?|spacing)\b/u', $t, $r)) $p['gap'] = (float)$r[1];
    if (preg_match('/\bskip\s+(?:the\s+)?(?:first\s+)?(\d{1,2})\b/u', $t, $r) || preg_match('/\b(\d{1,2})\s+(?:slots?|spaces?|cards?)\s+(?:are\s+)?(?:already\s+)?used\b/u', $t, $r)) $p['skip'] = (int)$r[1];
    elseif (preg_match('/\b(?:fresh|new|full|unused)\s+sheet of (?:card )?stock\b|\bdon.?t skip\b|\bno skipp?ing\b/u', $t)) $p['skip'] = 0;
    if (preg_match('/\b(?:don.?t|do not|no need to)\s+(?:split|separate|break)\b|\b(?:share|mix)\s+(?:the\s+)?sheets?\b|\bone pile\b/u', $t)) $p['breakBy'] = false;
    elseif (preg_match('/\b(?:new|own|separate|fresh|one|a)\s+sheets?\s+(?:for|per)\s+(?:each\s+|every\s+)?(?:centre|center|kind|group)\b|\bkeep (?:the )?(?:centres|piles) apart\b|\bsheets? (?:per|by) (?:centre|center)\b/u', $t)) $p['breakBy'] = true;
    if (preg_match('/\b(?:no|without(?: a)?)\s+packing list\b/u', $t)) $p['packing'] = false;
    elseif (preg_match('/\bpacking list\b/u', $t)) $p['packing'] = true;
    // Why a reprint, in so many words. Never inferred from "new".
    if (preg_match('/\b(lost|stolen|missing|misplaced)\b/u', $t)) $p['cause'] = 'lost';
    elseif (preg_match('/\bnever (got|received|arrived|reached)\b|\bdidn.?t (get|receive)\b/u', $t)) $p['cause'] = 'never_received';
    elseif (preg_match('/\b(damaged|broken|cracked|faded|torn|bent|smudged)\b/u', $t)) $p['cause'] = 'damaged';
    elseif (preg_match('/\b(name|details?|spelling)\b.*\b(changed|wrong|corrected|misspelt|misspelled|fixed)\b|\b(wrong|misspelt|misspelled) name\b/u', $t)) $p['cause'] = 'name';
    if (isset($p['cause']) && !isset($p['which']) && empty($p['ids']) && !ids_plan_find_names($prompt, $centres)) $p['which'] = 'reprint';
    // Acts. Asked for in so many words, never inferred; several in one request run in the order written.
    $acts = [];
    $at = static function (string $re) use ($t): int { return preg_match($re, $t, $m, PREG_OFFSET_CAPTURE) ? (int)$m[0][1] : -1; };
    $pic = '(?:photos?|pictures?|pics?|images?|headshots?|faces?)';
    $bgRe = '/\b(?:remove|take (?:off|out)|cut (?:out)?|clear|change|replace|plain|grey|gray|white|clean)\b[^.?!;]*\b(?:bg|bgs|backgrounds?|backdrops?)\b|\b(?:bg|backgrounds?)\b[^.?!;]*\b(?:remov\w*|off|plain|grey|gray|white)\b/u';
    $impRe = '/\b(?:improve|enhance|clean(?:\s|-)?up|fix|touch(?:\s|-)?up|retouch|brighten|sharpen|better)\b[^.?!;]*\b' . $pic . '\b/u';
    $posRe = '/\b(?:position|reposition|move|centre|center|align|frame|reframe|crop|zoom|straighten|fit|adjust)\w*\b[^.?!;]*\b' . $pic . '\b|\b' . $pic . '\b[^.?!;]*\b(?:position|centred|centered|too (?:small|big|low|high)|off[- ]centre|off[- ]center)\b/u';
    $askRe = '/\b(?:ask|chase|request|remind|nudge)\b[^.?!;]*\b' . $pic . '\b|\b(?:the ones|people|those|anyone|everyone) (?:with(?:out)?|who (?:have|has)n.?t (?:got )?)\s*(?:no |a |any )?' . $pic . '\b[^.?!;]*\bask\b|\b(?:without|no|missing)\s+(?:a\s+|any\s+)?' . $pic . '\b[^.?!]*\b(?:ask|chase|remind|nudge)\s+(?:them|those|the parents|their parents|for one)\b/u';
    $cand = ['clear' => $at('/\b(?:clear|empty|reset|wipe)\b.*\bsheets?\b|\bstart (?:over|again)\b|\btake (?:everyone|everybody|them all|all the cards) off\b/u'),
             'improvePhotos' => max($at($impRe), $at($bgRe)) >= 0 ? min(array_filter([$at($impRe), $at($bgRe)], static fn($x) => $x >= 0)) : -1,
             'adjustPhoto' => $at($posRe),
             'askPhotos' => $at($askRe),
             'fill' => $at('/\bfill\b.*\b(?:gaps?|slots?|sheet|spaces?|blanks?)\b/u')];
    // Positioning many photos at once is the bulk edit's reframe; one photo is the editor.
    if ($cand['adjustPhoto'] >= 0 && $cand['improvePhotos'] >= 0) $cand['adjustPhoto'] = -1;
    asort($cand);
    foreach ($cand as $a => $pos) if ($pos >= 0) $acts[] = $a;
    if ($acts) { $p['do'] = $acts; }
    $photo = [];
    if ($at($bgRe) >= 0) $photo['removeBg'] = true;
    if (preg_match('/\b(?:brighten|brighter|too dark|lighter|light(?:en)? (?:them|it) up)\b/u', $t)) $photo['brighten'] = true;
    if (preg_match('/\b(?:sharpen|sharper|blurr?y|blurred|soft|clearer)\b/u', $t)) $photo['sharpen'] = true;
    if (preg_match('/\bzoom(?:ed)? in\b|\bcloser\b|\btoo small\b|\bbigger face\b/u', $t)) $photo['zoom'] = 1.3;
    elseif (preg_match('/\bzoom(?:ed)? out\b|\btoo (?:big|close)\b|\bwhole (?:head|photo)\b/u', $t)) $photo['zoom'] = 1;
    if (preg_match('/\b(?:on|to|around) (?:the|their) faces?\b|\bcentre (?:the|their) faces?\b|\bcenter (?:the|their) faces?\b/u', $t)) $photo['gravity'] = 'face';
    elseif (preg_match('/\b(?:move|shift) (?:it|them|the (?:photo|image|picture)s?) (?:up|higher)\b|\btoo low\b/u', $t)) $photo['gravity'] = 'south';
    elseif (preg_match('/\b(?:move|shift) (?:it|them|the (?:photo|image|picture)s?) (?:down|lower)\b|\btoo high\b/u', $t)) $photo['gravity'] = 'north';
    if ($photo && $acts) $p['photo'] = $photo;
    $nw = implode('|', array_map(fn($w) => preg_quote($w, '/'), array_keys(IDS_PLAN_NUMBER_WORDS)));
    if (!preg_match('/\bskip\b/u', $mt) && preg_match('/\b(?:first|only|just|up to|at most|no more than)\s+(\d{1,3}|' . $nw . ')\b/u', $mt, $r)) $p['limit'] = is_numeric($r[1]) ? (int)$r[1] : IDS_PLAN_NUMBER_WORDS[$r[1]];
    // "The last 20 who joined", "the 10 newest": the most recent first, then the limit.
    elseif (preg_match('/\b(?:last|latest|newest|most recent)\s+(\d{1,3}|' . $nw . ')\b(?!\s*(?:days?|weeks?|months?|years?)\b)|\b(\d{1,3}|' . $nw . ')\s+(?:newest|latest|most recent(?:ly)?(?:\s+joined)?)\b/u', $mt, $r)) {
        $n = $r[1] !== '' ? $r[1] : $r[2];
        $p['limit'] = is_numeric($n) ? (int)$n : IDS_PLAN_NUMBER_WORDS[$n]; $p['latest'] = true;
    }
    return ids_plan_clean($p, $kinds, $centres)['plan'];
}

/** Two people lists as one, without repeats. */
function ids_plan_union(array $a, array $b): array {
    $out = [];
    foreach (['ids', 'names'] as $k) { $v = array_values(array_unique(array_merge($a[$k] ?? [], $b[$k] ?? []))); if ($v) $out[$k] = $v; }
    return $out;
}

/** Is this a follow-up to the plan on screen, or a fresh request? */
function ids_plan_is_refinement(string $prompt, array $current, array $read): bool {
    if (!$current) return false;
    if (preg_match(IDS_PLAN_REFINE_RE, mb_strtolower($prompt))) return true;
    if (isset($read['do'])) return false;   // an act stands on its own; the browser applies it to what is on screen
    if (!empty($read['kindOf'])) return true;
    // A fresh request names who: a kind, new/reprint, or a whole list of IDs. Anything else adjusts the plan on screen.
    return !isset($read['kind']) && !isset($read['which']) && empty($read['ids']);
}

/** A follow-up applied to the plan on screen: what it says replaces, people it names are added or left out. */
function ids_plan_refine(array $current, array $read): array {
    $plan = $current;
    foreach (IDS_PLAN_SCALARS as $k) if (array_key_exists($k, $read)) $plan[$k] = $read[$k];
    // One centre said now replaces several said before, and the other way round.
    if (array_key_exists('centre', $read)) unset($plan['centres']);
    if (array_key_exists('centres', $read)) unset($plan['centre']);
    if (!empty($read['kindOf'])) $plan['kindOf'] = array_merge($plan['kindOf'] ?? [], $read['kindOf']);
    // An act belongs to this request only; it is never carried into the plan on screen.
    unset($plan['do'], $plan['acts'], $plan['photo']);
    foreach (['do', 'acts', 'photo'] as $k) if (isset($read[$k])) $plan[$k] = $read[$k];
    $named = ids_plan_union(['ids' => $read['ids'] ?? [], 'names' => $read['names'] ?? []], $read['also'] ?? []);
    if ($named) {
        // Named people join a named list; on a filtered selection they go on top of it.
        if (!empty($current['ids']) || !empty($current['names'])) {
            $u = ids_plan_union(['ids' => $current['ids'] ?? [], 'names' => $current['names'] ?? []], $named);
            unset($plan['ids'], $plan['names']); $plan += $u;
        } else $plan['also'] = ids_plan_union($plan['also'] ?? [], $named);
    }
    if (!empty($read['exclude'])) {
        $plan['exclude'] = ids_plan_union($plan['exclude'] ?? [], $read['exclude']);
        // Leaving somebody out wins over an earlier "add".
        foreach (['ids', 'names'] as $k) if (!empty($plan['also'][$k])) $plan['also'][$k] = array_values(array_diff($plan['also'][$k], $plan['exclude'][$k] ?? []));
        if (isset($plan['also'])) { $plan['also'] = array_filter($plan['also']); if (!$plan['also']) unset($plan['also']); }
    }
    return $plan;
}

function ids_plan_instructions(array $kinds, array $centres, string $today, array $current): string {
    $cn = implode('; ', array_map(fn($c) => $c['name'] . ($c['code'] !== '' ? ' (code ' . $c['code'] . ')' : ''), $centres)) ?: '(none)';
    return "You turn an ID-card print request from a programme coordinator into a JSON plan for the NGG ID Card Studio.\n"
        . "Today is {$today} (Africa/Lagos). Weeks start on Monday.\n"
        . "Kinds this person may print: " . implode(', ', $kinds) . " (member = NGG member; summer = Summer School participant; volunteer; afrovanguard).\n"
        . "Centres: {$cn}. Requests may misspell a centre or a name; use the centre's exact name from the list.\n"
        . ($current ? "The plan on screen now is: " . json_encode($current, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n"
            . "If the request adjusts it (\"fronts only\", \"only Ijaiye\", \"add 026-010\", \"not Ada\"), return the WHOLE updated plan with \"refine\": true. If it is a new request, return a new plan with \"refine\": false.\n" : '')
        . "Fields (include ONLY what the request says or clearly implies; omit everything else):\n"
        . "kind: one of the kinds above.\n"
        . "centre: a centre name from the list, or \"none\" for people with no centre.\n"
        . "centres: a list of centre names, when the request names two or more (\"Ijaiye and Ikorodu\"); then leave centre out.\n"
        . "hasPhoto: false for people with no photo on file (\"without a photo\"), true for only those with one; leave out otherwise.\n"
        . "which: \"new\" (never had a card), \"reprint\" (replacing a card they have), or \"all\".\n"
        . "ids: printed card numbers or record ids to print, e.g. \"026-014\", \"EG-26-001\".\n"
        . "names: people's names to print (only names, as written).\n"
        . "also: {ids, names} people to add on top of the selection.\n"
        . "exclude: {ids, names} people to leave out (\"except…\", \"not…\").\n"
        . "dateFrom, dateTo: YYYY-MM-DD, for when they registered or joined (\"last week\", \"since Monday\", \"in October\").\n"
        . "numFrom, numTo: integers, for a block of card numbers (\"cards 40 to 80\"). numPrefix: when the block is written as two printed IDs (\"026-001 to 026-040\"), their shared prefix (\"026\"), with numFrom 1 and numTo 40.\n"
        . "limit: integer, at most this many cards (\"the first ten\"). latest: true when they want the most recent ones (\"the last 20 who joined\", \"the 10 newest\").\n"
        . "backs: \"off\" (fronts only), \"long\" (double-sided, long edge, the usual), \"short\" (short edge).\n"
        . "marks: true/false for crop marks.\n"
        . "paper: \"a4\", \"letter\" or \"a3\".\n"
        . "dpi: 150, 300 or 600.\n"
        . "order: \"centre\", \"kind\" or \"name\".\n"
        . "proof: true for a proof or test print, false to undo one.\n"
        . "margin: millimetres round the sheet (3-30). gap: millimetres between cards (0-20). skip: slots already used on the first sheet (0-60).\n"
        . "breakBy: true for a new sheet for each centre (or kind), false to let them share sheets. packing: true/false for a packing list.\n"
        . "do: the acts asked for in so many words, as a list in the order written: \"clear\" (take every card off the sheet), \"fill\" (fill the empty slots on the last sheet), \"askPhotos\" (ask the people with no photo for one), \"improvePhotos\" (improve, fix, brighten, sharpen or remove the background of the photos already on file), \"adjustPhoto\" (help position, move, crop or zoom ONE person's photo). You can never print and never mark anyone printed; if asked to, leave do out.\n"
        . "photo: with improvePhotos or adjustPhoto, what to do: {\"removeBg\": true for a plain background, \"brighten\": true, \"sharpen\": true, \"gravity\": \"face\"|\"center\"|\"north\"|\"south\", \"zoom\": 1 to 2.5}.\n"
        . "notKinds: kinds to leave out (\"exclude summer\", \"no volunteers\") — a list; never set kind for that.\n"
        . "kindOf: {\"<name as written>\": kind} when the request says which kind ONE named person is (\"Badmus should be NGG, not summer\"); do not set kind for that.\n"
        . "cause: why a card is reprinted, only when said: \"lost\" (lost or stolen; the reprint gets a new QR), \"never_received\", \"damaged\", \"name\" (details changed).\n"
        . "A request that only changes settings (\"make it A3\", \"margin 5mm\") holds only those fields.\n"
        . "A question about which AI is answering, or a request to use a different AI, is not a person's name: return {}.\n"
        . "Never invent people, ids, centres or dates that the request does not support.";
}

/** admin.ids.plan — read a print request (and, for a follow-up, the plan on screen). Selects nothing itself. */
function admin_ids_plan(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $prompt = trim(preg_replace('/\s+/u', ' ', (string)($p['prompt'] ?? '')));
    if ($prompt === '') return ['ok' => false, 'error' => 'empty_prompt'];
    if (mb_strlen($prompt) > IDS_PLAN_PROMPT_MAX) return ['ok' => false, 'error' => 'prompt_too_long', 'message' => 'Keep it under ' . IDS_PLAN_PROMPT_MAX . ' characters.'];
    $kinds = ids_plan_kinds($g['requester']);
    $centres = ids_plan_centres($g['requester']);
    $today = ids_plan_today();
    // The plan on screen comes from the browser: it is cleaned like anything else before it is used.
    $current = is_array($p['current'] ?? null) ? ids_plan_clean($p['current'], $kinds, $centres)['plan'] : [];
    $rules = ids_plan_rules($prompt, $kinds, $centres, $today);
    // Nothing read is nothing to do: an unreadable request never re-applies the plan on screen.
    $refine = $rules && ids_plan_is_refinement($prompt, $current, $rules);
    $plan = $refine ? ids_plan_refine($current, $rules) : $rules;
    $notes = []; $by = 'rules'; $provider = ''; $aiError = '';
    $providers = ai_providers_for('studio');
    $want = strtolower(trim((string)($p['provider'] ?? '')));
    // "Use the rules": the operator asked for no AI at all.
    $rulesOnly = $want === 'rules';
    if (!in_array($want, AI_PROVIDERS, true)) $want = '';
    if ($want !== '' && !in_array($want, $providers, true) && !isset($GLOBALS['__ai_mock'])) {
        $notes[] = ucfirst($want === 'anthropic' ? 'Claude' : $want) . ' isn’t set up for the studio here' . ($providers ? ', so ' . ucfirst($providers[0] === 'anthropic' ? 'Claude' : $providers[0]) . ' read it.' : '.');
        $want = '';
    }
    if (!$rulesOnly && (ai_enabled('studio') || isset($GLOBALS['__ai_mock']))) {
        $r = ai_classify(ids_plan_instructions($kinds, $centres, $today, $current), $prompt, 500, 'studio', $want, IDS_PLAN_AI_BUDGET);
        if (!empty($r['ok']) && is_array($r['data'])) {
            $c = ids_plan_clean($r['data'], $kinds, $centres);
            $aiRefine = $current && array_key_exists('refine', $r['data']) ? !empty($r['data']['refine']) : $refine;
            /* The IDs the rules saw in each clause are kept (a pattern match
               does not miss "026-014"). */
            // A follow-up comes back whole (a field it dropped was meant to go); a fresh plan is filled out by the rules.
            $plan = $aiRefine ? $c['plan'] : $c['plan'] + $rules;
            foreach (['also', 'exclude'] as $k) if (!empty($rules[$k])) $plan[$k] = ids_plan_union($plan[$k] ?? [], $rules[$k]);
            if (!$aiRefine && !empty($rules['ids'])) $plan['ids'] = array_values(array_unique(array_merge($c['plan']['ids'] ?? [], $rules['ids'])));
            $refine = $aiRefine;
            $notes = array_merge($notes, $c['notes']); $by = 'ai'; $provider = (string)($r['provider'] ?? '');
            // The rules see a kind said of one person, and the acts, word for word; the model's reading keeps them.
            if (!empty($rules['kindOf'])) $plan['kindOf'] = array_merge($rules['kindOf'], $plan['kindOf'] ?? []);
            if (!empty($rules['do']) && empty($plan['do'])) { $plan['do'] = $rules['do']; if (!empty($rules['acts'])) $plan['acts'] = $rules['acts']; if (!empty($rules['photo'])) $plan['photo'] = $rules['photo']; }
        } else {
            $aiError = (string)($r['error'] ?? 'ai_failed');
        }
    }
    audit('ids.plan', (string)$g['requester']['memberId'], '', ['by' => $by, 'provider' => $provider, 'refine' => $refine, 'fields' => array_keys($plan)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'plan' => (object)$plan, 'notes' => $notes, 'by' => $by, 'provider' => $provider, 'aiError' => $aiError,
            'refined' => $refine, 'kinds' => $kinds, 'understood' => count($plan) > 0, 'providers' => $providers];
}
