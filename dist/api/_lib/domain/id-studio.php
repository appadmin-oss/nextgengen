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
