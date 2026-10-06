<?php
/**
 * ID Card Studio (/club/id-cards) — what the studio needs that the print log
 * alone cannot answer. ID_CARD_STUDIO.md.
 *
 * The rows to print come from the existing card ops (admin.mcards.data,
 * admin.cards.data, admin.vcards.data) and runs are recorded by
 * admin.card.run.record. This adds the four things nothing stored:
 *
 *   - who has ever had a card, as one map, so the queue can say "New" or
 *     "Reprint" without a history call per person (that would be the N+1
 *     CLAUDE.md §6 calls a defect);
 *   - a reprint QUEUE: "Queue a reprint", "Reprint this run" and the cards that
 *     jammed at the cutter all land in id_reprints, and a print closes them;
 *   - a photo request for ONE person, where the only ask was a bulk sweep;
 *   - marking cards in an already-recorded run as failed, because the operator
 *     only knows which jammed once the sheet is out of the printer.
 *
 * Capabilities follow the data: a participant is Summer School's (`summer`),
 * a member or volunteer belongs to `people`. Writes are checked per row, so a
 * request that mixes subjects is refused row by row, never widened.
 */

const IDS_SUBJECTS = ['member', 'student', 'volunteer'];
const IDS_BATCH_MAX = 600;      // the same ceiling as a recorded run (CRUN_MAX_ISSUES)
const IDS_WHY_MAX = 80;

/** The capability that owns a subject's card. */
function ids_cap_for(string $subjectType): string { return $subjectType === 'student' ? 'summer' : 'people'; }

function ids_can(array $requester, string $subjectType): bool {
    return in_array($subjectType, IDS_SUBJECTS, true) && in_array(ids_cap_for($subjectType), member_effective_caps($requester), true);
}

/**
 * Everything the queue needs to sort its rows, in three grouped queries.
 * A PROOF is not a card anybody holds, and neither is one that failed at the
 * cutter, so neither counts as "already has a card" — or a proofed person
 * would silently drop out of the queue they were proofed for.
 *   issued  "type:id" => { at, displayId, runId, version, ok }  (the LATEST issue)
 *   reprints "type:id" => { why, at }                            (open requests)
 *   asked   "type:id" => at                                      (photo asks)
 * Only subjects the caller may print are included.
 */
function admin_ids_state(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $types = array_values(array_filter(IDS_SUBJECTS, fn($t) => ids_can($g['requester'], $t)));
    if (!$types) return ['ok' => true, 'issued' => (object)[], 'reprints' => (object)[], 'asked' => (object)[], 'types' => []];
    $ph = implode(',', array_fill(0, count($types), '?'));

    $issued = [];
    $rows = db_all("SELECT i.subjectType, i.subjectId, i.displayId, i.runId, i.templateVersion, i.ok, i.at
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
    foreach (db_all("SELECT subjectType, subjectId, why, requestedAt FROM id_reprints WHERE doneAt = '' AND subjectType IN ($ph)", $types) as $r) {
        $reprints[$r['subjectType'] . ':' . $r['subjectId']] = ['why' => (string)$r['why'], 'at' => (string)$r['requestedAt']];
    }
    $asked = [];
    foreach (db_all("SELECT subjectType, subjectId, MAX(askedAt) at FROM id_photo_asks WHERE subjectType IN ($ph) GROUP BY subjectType, subjectId", $types) as $r) {
        $asked[$r['subjectType'] . ':' . $r['subjectId']] = (string)$r['at'];
    }
    return ['ok' => true, 'issued' => (object)$issued, 'reprints' => (object)$reprints, 'asked' => (object)$asked, 'types' => $types];
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
        $ok[$t . ':' . $id] = ['subjectType' => $t, 'subjectId' => $id, 'why' => mb_substr($why, 0, IDS_WHY_MAX)];
    }
    return ['ok' => true, 'items' => array_values($ok), 'refused' => $refused];
}

/** Put people back in the queue as reprints. An open request is updated, not doubled. */
function admin_ids_reprint_request(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $v = ids_items($g, $p['items'] ?? null, true); if (!$v['ok']) return $v;
    $now = now_iso(); $by = (string)$g['requester']['memberId']; $added = 0; $updated = 0;
    foreach ($v['items'] as $it) {
        $open = db_row("SELECT id FROM id_reprints WHERE subjectType = ? AND subjectId = ? AND doneAt = '' LIMIT 1", [$it['subjectType'], $it['subjectId']]);
        if ($open) { db_update('id_reprints', ['why' => $it['why'], 'requestedAt' => $now, 'requestedBy' => $by], ['id' => $open['id']]); $updated++; }
        else { db_insert('id_reprints', ['subjectType' => $it['subjectType'], 'subjectId' => $it['subjectId'], 'why' => $it['why'], 'requestedBy' => $by, 'requestedAt' => $now, 'doneRunId' => '', 'doneAt' => '']); $added++; }
    }
    audit('ids.reprint.request', $by, '', ['added' => $added, 'updated' => $updated, 'refused' => count($v['refused'])], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'added' => $added, 'updated' => $updated, 'refused' => $v['refused']];
}

/** Close the open requests a print has satisfied. */
function admin_ids_reprint_done(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $v = ids_items($g, $p['items'] ?? null); if (!$v['ok']) return $v;
    $runId = substr((string)($p['runId'] ?? ''), 0, 40); $now = now_iso(); $n = 0;
    foreach ($v['items'] as $it) {
        $n += db_exec("UPDATE id_reprints SET doneAt = ?, doneRunId = ? WHERE subjectType = ? AND subjectId = ? AND doneAt = ''", [$now, $runId, $it['subjectType'], $it['subjectId']]);
    }
    return ['ok' => true, 'closed' => $n, 'refused' => $v['refused']];
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
    $marked = 0;
    foreach ($v['items'] as $it) {
        $marked += db_exec("UPDATE card_issues SET ok = 0, note = ? WHERE runId = ? AND subjectType = ? AND subjectId = ? AND ok = 1",
            ['Didn’t print properly', $runId, $it['subjectType'], $it['subjectId']]);
    }
    $failed = (int)(db_row('SELECT COUNT(*) c FROM card_issues WHERE runId = ? AND ok = 0', [$runId])['c'] ?? 0);
    db_update('card_runs', ['failed' => $failed], ['runId' => $runId]);
    // The reason is THIS one, whatever the caller sent: array_merge, because + keeps the left-hand key.
    $items = array_map(fn($it) => array_merge($it, ['why' => 'Didn’t print properly']), $v['items']);
    $re = admin_ids_reprint_request(['requesterId' => $p['requesterId'] ?? '', 'items' => $items, 'ip' => $p['ip'] ?? '']);
    audit('ids.run.failed', (string)$g['requester']['memberId'], $runId, ['marked' => $marked, 'failed' => $failed], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'marked' => $marked, 'failed' => $failed, 'requeued' => (int)($re['added'] ?? 0) + (int)($re['updated'] ?? 0), 'refused' => $v['refused']];
}

/**
 * Ask for a photo for ONE person. A participant's guardian is emailed the
 * reshoot link the bulk sweep uses. For a member or volunteer there is no
 * guardian channel here yet, so the ask is recorded and the answer says it
 * was not sent — the screen must not claim a message went out.
 */
function admin_ids_photo_ask(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $t = (string)($p['subjectType'] ?? ''); $id = trim((string)($p['subjectId'] ?? ''));
    if (!in_array($t, IDS_SUBJECTS, true) || $id === '') return ['ok' => false, 'error' => 'bad_subject'];
    if (!ids_can($g['requester'], $t)) return ['ok' => false, 'error' => 'forbidden'];
    $sent = false;
    if ($t === 'student') {
        $s = db_row('SELECT studentId, parentEmail FROM summer_students WHERE studentId = ? LIMIT 1', [$id]);
        if (!$s) return ['ok' => false, 'error' => 'not_found'];
        if ((string)$s['parentEmail'] !== '' && function_exists('reshoot_notify_guardian')) {
            db_update('summer_students', ['photoAskedAt' => now_iso()], ['studentId' => $id]);
            try { reshoot_notify_guardian($id, 'We do not have a photo on file for their ID card.'); $sent = true; }
            catch (Throwable $e) { error_log('[ids.photo.ask] ' . $id . ': ' . $e->getMessage()); }
        }
    }
    db_insert('id_photo_asks', ['subjectType' => $t, 'subjectId' => $id, 'askedBy' => (string)$g['requester']['memberId'], 'askedAt' => now_iso(), 'sent' => $sent ? 1 : 0]);
    audit('ids.photo.ask', (string)$g['requester']['memberId'], $id, ['subjectType' => $t, 'sent' => $sent], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'sent' => $sent];
}
