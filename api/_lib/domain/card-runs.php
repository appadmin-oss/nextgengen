<?php
declare(strict_types=1);

/**
 * ID card ISSUANCE — what was printed, for whom, from which design version.
 *
 * The template system already did the hard half: a draft is separate from the
 * published copy print runs read, and republishing bumps a recorded version.
 * Its own docblock promised the payoff — "a print run stores the version it
 * used, so 'reprint card 147 exactly as it was in July' is answerable a year
 * later" — and nothing stored it. A print run wrote an audit line and no rows.
 * So:
 *
 *   · a FIRST issue could not be told from a reprint, and neither could be
 *     counted, which is the number that says whether card stock is going on
 *     new members or on replacing lost ones;
 *   · "which design is the card in this member's hand" had no answer, so a
 *     reprint silently used whatever the current published version happened to
 *     be — and a member turned up at a gate with a card that did not match the
 *     one the desk was looking at;
 *   · a batch that half-printed left nothing to resume from, so the operator
 *     re-ran the whole thing and burned the stock twice.
 *
 * TWO RECORDS, because they answer two different questions:
 *
 *   card_runs   one row per BATCH: the design and the frozen version it used,
 *               both faces, the output, who ran it and when. "What did we send
 *               to the printer in July?"
 *   card_issues one row per PERSON per run, carrying the printed id and the
 *               template version again. "What is in this member's hand, and
 *               how many times have we replaced it?"
 *
 * The template version is denormalised onto both on purpose. It is the fact
 * being preserved, and it has to survive the template being republished,
 * renamed or deleted afterwards — a foreign key to a mutable row preserves
 * nothing.
 *
 * WHAT THIS DOES NOT DO: render anything. Rendering is in the browser, on the
 * same canvas that drew the proof, because the host is PHP on shared hosting
 * with no headless browser. This records what the browser produced — which is
 * why `issued` is reported by the client and `requested` is not trusted as the
 * same number.
 */

/** Subject types a card can be issued to. */
const CRUN_SUBJECTS = ['member', 'student', 'volunteer', 'afrovanguard'];
/** Run modes. `proof` is a single card for checking, and is recorded so a
 *  proof cannot be mistaken for an issue in the counts. */
const CRUN_MODES = ['print', 'reprint', 'proof'];
/** How many people one recorded run may cover — matched to the studio's own
 *  render ceiling (MERGE_RUN_MAX), because a run is what the browser produced. */
const CRUN_MAX_ISSUES = 600;
/** Reasons a card is reprinted. Free text is also allowed, but these are the
 *  four that actually happen, and having them as choices is what makes the
 *  reprint counts worth reading. */
const CRUN_REPRINT_REASONS = ['lost', 'damaged', 'details_changed', 'never_received', 'other'];

/** Deciding what a credential looks like, and issuing one, are the same trust
 *  boundary: `people`. Same gate as the template ops (see card-templates.php). */
function crun_gate(array $p) { return admin_cap_gate($p, 'people'); }
/**
 * The run log's gate is the SUBJECT's owner, as everywhere else in the studio:
 * a Summer School coordinator prints participants and must be able to record
 * them, or the run goes unlogged and the same children are offered again.
 * Graphic and Afrovanguard runs stay with `people`.
 */
function crun_gate_for(array $p, string $subjectType) {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $need = in_array($subjectType, ['member', 'student', 'volunteer'], true) && function_exists('ids_can') ? ids_can($g['requester'], $subjectType)
          : in_array('people', member_effective_caps($g['requester']), true);
    return $need ? $g : ['ok' => false, 'error' => 'forbidden'];
}
/** The run kinds a requester may read. */
function crun_kinds_for(array $requester): array {
    $caps = member_effective_caps($requester);
    $k = [];
    if (in_array('people', $caps, true)) $k = ['member', 'volunteer', 'afrovanguard', 'graphic'];
    if (in_array('summer', $caps, true)) $k[] = 'student';
    return $k;
}

function crun_row_public(array $r): array {
    return [
        'runId' => (string)$r['runId'],
        'kind' => (string)$r['kind'],
        'mode' => (string)$r['mode'],
        'templateId' => (string)($r['templateId'] ?? ''),
        'templateName' => (string)($r['templateName'] ?? ''),
        'templateVersion' => (int)($r['templateVersion'] ?? 0),
        'backTemplateId' => (string)($r['backTemplateId'] ?? ''),
        'backTemplateVersion' => (int)($r['backTemplateVersion'] ?? 0),
        'output' => (string)($r['output'] ?? ''),
        'dpi' => (int)($r['dpi'] ?? 0),
        'sheet' => (string)($r['sheet'] ?? ''),
        'requested' => (int)($r['requested'] ?? 0),
        'issued' => (int)($r['issued'] ?? 0),
        'failed' => (int)($r['failed'] ?? 0),
        'reprintOf' => (string)($r['reprintOf'] ?? ''),
        'reason' => (string)($r['reason'] ?? ''),
        'actorId' => (string)($r['actorId'] ?? ''),
        'startedAt' => (string)($r['startedAt'] ?? ''),
        'finishedAt' => (string)($r['finishedAt'] ?? ''),
    ];
}

/**
 * Record a completed batch.
 *
 * Called AFTER the browser has produced the file, with what it actually
 * managed. `mode` is derived, not taken on trust: a subject who has been issued
 * a card before is a reprint whether or not the operator said so, because that
 * is the fact the counts are for.
 */
function admin_card_run_record(array $p): array {
    $kind = (string)($p['kind'] ?? 'member');
    if (!in_array($kind, ['member', 'student', 'volunteer', 'afrovanguard', 'graphic'], true)) return ['ok' => false, 'error' => 'bad_kind'];
    $mode = (string)($p['mode'] ?? 'print');
    if (!in_array($mode, CRUN_MODES, true)) return ['ok' => false, 'error' => 'bad_mode'];

    $subjectType = (string)($p['subjectType'] ?? ($kind === 'graphic' ? 'member' : $kind));
    if (!in_array($subjectType, CRUN_SUBJECTS, true)) return ['ok' => false, 'error' => 'bad_subject_type'];
    $g = crun_gate_for($p, $kind === 'graphic' || $kind === 'afrovanguard' ? $kind : $subjectType); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');

    /* Idempotent per client token: the page logs a run after the file is
       made, and a retried or replayed request must not log the same cards
       twice (the second would read as a run of reprints). */
    $token = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($p['token'] ?? ''));
    if ($token !== '') {
        $have = db_row('SELECT * FROM card_runs WHERE clientToken = ? LIMIT 1', [substr($token, 0, 64)]);
        if ($have) return ['ok' => true, 'runId' => (string)$have['runId'], 'mode' => (string)$have['mode'], 'issued' => (int)$have['issued'],
                           'failed' => (int)$have['failed'], 'reprints' => 0, 'templateVersion' => (int)$have['templateVersion'], 'backTemplateVersion' => (int)$have['backTemplateVersion'], 'replayed' => true];
    }

    $items = is_array($p['items'] ?? null) ? $p['items'] : [];
    if (count($items) > CRUN_MAX_ISSUES) return ['ok' => false, 'error' => 'too_many', 'max' => CRUN_MAX_ISSUES];

    /* The design, and the version FROZEN into this run.
     *
     * Read from the template row rather than taken from the request: the client
     * would be reporting a number about itself, and the whole point of the
     * record is that it is the version the server says was published. An empty
     * templateId is legal and means the built-in hand-coded card — which has no
     * version, and saying 0 is more honest than inventing one. */
    $templateId = trim((string)($p['templateId'] ?? ''));
    $tplName = ''; $tplVersion = 0;
    $backId = trim((string)($p['backTemplateId'] ?? ''));
    $backVersion = 0;
    if ($templateId !== '') {
        $t = db_row('SELECT templateId, name, version, status, pairId FROM card_templates WHERE templateId = ? LIMIT 1', [$templateId]);
        if (!$t) return ['ok' => false, 'error' => 'template_not_found'];
        $tplName = (string)$t['name'];
        $tplVersion = (int)$t['version'];
        // A run's back face defaults to whatever the front NAMES as its pair,
        // so a duplex batch cannot be recorded against a mismatched reverse.
        if ($backId === '') $backId = (string)($t['pairId'] ?? '');
    }
    if ($backId !== '') {
        $b = db_row('SELECT name, version FROM card_templates WHERE templateId = ? LIMIT 1', [$backId]);
        // A system back (sys-…) is not a stored row; recording it by id with
        // version 0 is accurate rather than a refusal.
        $backVersion = $b ? (int)$b['version'] : 0;
    }

    $reason = mb_substr(trim((string)($p['reason'] ?? '')), 0, 200);
    $reprintOf = trim((string)($p['reprintOf'] ?? ''));
    if ($reprintOf !== '' && !db_row('SELECT id FROM card_runs WHERE runId = ? LIMIT 1', [$reprintOf])) {
        return ['ok' => false, 'error' => 'run_not_found'];
    }

    $runId = 'CRUN-' . strtoupper(rand_hex(5));
    while (db_row('SELECT id FROM card_runs WHERE runId = ?', [$runId])) $runId = 'CRUN-' . strtoupper(rand_hex(5));
    $now = now_iso();

    /* Who has had one before. ONE query for the whole batch rather than one per
       person: a run of six hundred on shared hosting is exactly where an N+1
       becomes a timeout half way through recording what was already printed. */
    $priorCount = [];
    $ids = [];
    foreach ($items as $it) {
        $sid = trim((string)(is_array($it) ? ($it['subjectId'] ?? '') : $it));
        if ($sid !== '') $ids[$sid] = 1;
    }
    $ids = array_keys($ids);
    if ($ids) {
        foreach (array_chunk($ids, 200) as $chunk) {
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            $args = array_merge([$subjectType], $chunk);
            // A proof is nobody's card: it never makes the real first card a "reprint".
            foreach (db_all("SELECT ci.subjectId, COUNT(*) c FROM card_issues ci JOIN card_runs cr ON cr.runId = ci.runId
                             WHERE ci.ok = 1 AND cr.mode != 'proof' AND ci.subjectType = ? AND ci.subjectId IN ($ph) GROUP BY ci.subjectId", $args) as $r) {
                $priorCount[(string)$r['subjectId']] = (int)$r['c'];
            }
        }
    }

    /* What each card CARRIED, read from the record (never the request): the
       photo, name, printed ID and — for members — the secure code in its QR.
       That snapshot is what later tells "this card no longer matches the
       record" apart from "this person has a card". Scope is checked per row
       on the same read: a subject outside the operator's centres, or one that
       does not exist, is refused and not logged. */
    $live = ($kind !== 'graphic' && $kind !== 'afrovanguard' && function_exists('ids_subject_rows')) ? ids_subject_rows($subjectType, $ids) : [];
    $codes = [];
    if ($subjectType === 'member' && $ids) foreach (array_chunk($ids, 500) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT memberId, code FROM member_cards WHERE kind = 'secure' AND status = 'active' AND memberId IN ($ph)", $chunk) as $c) $codes[(string)$c['memberId']] = (string)$c['code'];
    }
    $refused = [];
    $issued = 0; $failed = 0; $reprints = 0;
    $rows = [];
    foreach ($items as $it) {
        if (!is_array($it)) $it = ['subjectId' => (string)$it];
        $sid = trim((string)($it['subjectId'] ?? ''));
        if ($sid === '') { $failed++; continue; }
        $l = $live[$sid] ?? null;
        if ($kind !== 'graphic' && $kind !== 'afrovanguard') {
            if (!$l) { $refused[] = ['subjectId' => $sid, 'error' => 'not_found']; continue; }
            if (!admin_centre_allowed($g['requester'], (string)$l['centre'])) { $refused[] = ['subjectId' => $sid, 'error' => 'out_of_scope']; continue; }
        }
        $rowOk = array_key_exists('ok', $it) ? !empty($it['ok']) : true;
        $isReprint = ($priorCount[$sid] ?? 0) > 0;
        if ($isReprint && $rowOk) $reprints++;
        if ($rowOk) $issued++; else $failed++;
        $rows[] = [
            'runId' => $runId, 'subjectType' => $subjectType, 'subjectId' => $sid,
            // The record's number when it has one; a Summer card's computed number otherwise.
            'displayId' => mb_substr((string)($l && (string)$l['displayId'] !== '' ? $l['displayId'] : ($it['displayId'] ?? '')), 0, 48),
            'photoUrl' => $l ? mb_substr(function_exists('photo_store_relativise') ? photo_store_relativise((string)$l['photoUrl']) : (string)$l['photoUrl'], 0, 500) : '',
            'fullName' => $l ? mb_substr((string)$l['fullName'], 0, 160) : '',
            'secureCode' => (string)($codes[$sid] ?? ''),
            'faceSig' => $l && function_exists('ids_face_sig') ? ids_face_sig((string)$l['photoUrl'], (string)$l['fullName'], (string)$l['displayId']) : '',
            'templateId' => $templateId, 'templateVersion' => $tplVersion,
            'reprint' => $isReprint ? 1 : 0,
            'ok' => $rowOk ? 1 : 0,
            'note' => mb_substr((string)($it['note'] ?? ''), 0, 200),
            'at' => $now,
        ];
    }

    /* `mode` is DERIVED when the operator did not say. A batch where every
       person already had a card is a reprint run whichever button was pressed,
       and the counts exist to answer "how much stock went on replacements". */
    if ($mode === 'print' && $issued > 0 && $reprints === $issued) $mode = 'reprint';

    /* One transaction: the run, its cards, and the reprint requests it
       satisfied. They used to be two requests, the second's failure swallowed,
       so a run could be logged while its people stayed queued and printed
       again. A proof satisfies nothing. */
    $pdo = db_conn(); $own = !$pdo->inTransaction();
    if ($own) $pdo->beginTransaction();
    try {
    db_insert('card_runs', [
        'runId' => $runId, 'kind' => $kind, 'mode' => $mode, 'clientToken' => substr($token, 0, 64),
        'templateId' => $templateId, 'templateName' => $tplName, 'templateVersion' => $tplVersion,
        'backTemplateId' => $backId, 'backTemplateVersion' => $backVersion,
        'output' => mb_substr((string)($p['output'] ?? ''), 0, 16),
        'dpi' => max(0, min(2400, (int)($p['dpi'] ?? 0))),
        'sheet' => mb_substr((string)($p['sheet'] ?? ''), 0, 16),
        'requested' => count($items), 'issued' => $issued, 'failed' => $failed,
        'reprintOf' => $reprintOf, 'reason' => $reason, 'actorId' => $me,
        'startedAt' => (string)($p['startedAt'] ?? $now), 'finishedAt' => $now,
    ]);
    foreach ($rows as $r) db_insert('card_issues', $r);
    $closed = 0;
    if ($mode !== 'proof') foreach ($rows as $r) {
        if ((int)$r['ok'] === 1) $closed += db_exec("UPDATE id_reprints SET doneAt = ?, doneRunId = ? WHERE subjectType = ? AND subjectId = ? AND doneAt = ''", [$now, $runId, $r['subjectType'], $r['subjectId']]);
    }
    if ($own) $pdo->commit();
    } catch (Throwable $e) { if ($own && $pdo->inTransaction()) $pdo->rollBack(); throw $e; }

    audit('card.run.record', $me, $runId, [
        'kind' => $kind, 'mode' => $mode, 'template' => $templateId, 'version' => $tplVersion,
        'issued' => $issued, 'reprints' => $reprints, 'failed' => $failed, 'refused' => count($refused), 'closed' => $closed,
    ], (string)($p['ip'] ?? ''));

    return ['ok' => true, 'runId' => $runId, 'mode' => $mode, 'refused' => $refused, 'closed' => $closed,
            'issued' => $issued, 'failed' => $failed, 'reprints' => $reprints,
            'templateVersion' => $tplVersion, 'backTemplateVersion' => $backVersion];
}

/** Recent runs, newest first — the print log. */
function admin_card_runs(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $kinds = crun_kinds_for($g['requester']);
    if (!$kinds) return ['ok' => false, 'error' => 'forbidden'];
    $where = ['kind IN (' . implode(',', array_fill(0, count($kinds), '?')) . ')']; $args = $kinds;
    $kind = (string)($p['kind'] ?? '');
    if ($kind !== '') { $where[] = 'kind = ?'; $args[] = $kind; }
    $mode = (string)($p['mode'] ?? '');
    if ($mode !== '' && in_array($mode, CRUN_MODES, true)) { $where[] = 'mode = ?'; $args[] = $mode; }
    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $total = (int)(db_row('SELECT COUNT(*) c FROM card_runs' . $whereSql, $args)['c'] ?? 0);
    $pageSize = min(100, max(1, (int)($p['pageSize'] ?? 25)));
    $page = max(1, (int)($p['page'] ?? 1));
    $rows = db_all('SELECT * FROM card_runs' . $whereSql . ' ORDER BY id DESC LIMIT ? OFFSET ?',
        array_merge($args, [$pageSize, ($page - 1) * $pageSize]));
    // Actor names, in one query rather than one per row.
    $names = [];
    $actors = array_values(array_unique(array_filter(array_map(fn($r) => (string)$r['actorId'], $rows))));
    if ($actors) {
        $ph = implode(',', array_fill(0, count($actors), '?'));
        foreach (db_all("SELECT memberId, fullName FROM members WHERE memberId IN ($ph)", $actors) as $m) {
            $names[(string)$m['memberId']] = (string)$m['fullName'];
        }
    }
    $out = [];
    foreach ($rows as $r) {
        $row = crun_row_public($r);
        $row['actorName'] = $names[$row['actorId']] ?? '';
        $out[] = $row;
    }
    return ['ok' => true, 'runs' => $out, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize,
            'reasons' => CRUN_REPRINT_REASONS];
}

/** One run, with the people in it. The answer to "what did we print in July". */
function admin_card_run_get(array $p): array {
    $g = admin_cap_gate_any($p, ['people', 'summer']); if (!$g['ok']) return $g;
    $runId = (string)($p['runId'] ?? '');
    $r = db_row('SELECT * FROM card_runs WHERE runId = ? LIMIT 1', [$runId]);
    if (!$r || !in_array((string)$r['kind'], crun_kinds_for($g['requester']), true)) return ['ok' => false, 'error' => 'not_found'];
    $issues = db_all('SELECT * FROM card_issues WHERE runId = ? ORDER BY id ASC LIMIT ?', [$runId, CRUN_MAX_ISSUES]);
    return ['ok' => true, 'run' => crun_row_public($r),
        'issues' => array_map(fn($i) => [
            'subjectType' => (string)$i['subjectType'], 'subjectId' => (string)$i['subjectId'],
            'displayId' => (string)($i['displayId'] ?? ''),
            'templateVersion' => (int)($i['templateVersion'] ?? 0),
            'reprint' => (int)($i['reprint'] ?? 0) === 1,
            'ok' => (int)($i['ok'] ?? 1) === 1,
            // What the card carried: "reprint that batch as it was" is answerable.
            'fullName' => (string)($i['fullName'] ?? ''), 'photoUrl' => (string)($i['photoUrl'] ?? ''),
            'note' => (string)($i['note'] ?? ''), 'at' => (string)($i['at'] ?? ''),
        ], $issues)];
}

/**
 * One person's card history.
 *
 * The question this exists for is asked at a desk, out loud: "is the card in
 * their hand the current design?" So the answer leads with the LATEST issue and
 * the version it used, and says plainly whether the published design has moved
 * on since — which is the difference between "reprint it" and "it's fine".
 */
function admin_card_history(array $p): array {
    $type = (string)($p['subjectType'] ?? 'member');
    if (!in_array($type, CRUN_SUBJECTS, true)) return ['ok' => false, 'error' => 'bad_subject_type'];
    $g = crun_gate_for($p, $type); if (!$g['ok']) return $g;
    $sid = trim((string)($p['subjectId'] ?? ''));
    if ($sid === '') return ['ok' => false, 'error' => 'missing_subject'];
    $live = function_exists('ids_subject_rows') ? (ids_subject_rows($type, [$sid])[$sid] ?? null) : null;
    if ($live && !admin_centre_allowed($g['requester'], (string)$live['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];

    // The run joined in, not read once per issue.
    $rows = db_all('SELECT i.*, r.mode runMode, r.templateName runTemplateName, r.output runOutput FROM card_issues i LEFT JOIN card_runs r ON r.runId = i.runId
                    WHERE i.subjectType = ? AND i.subjectId = ? ORDER BY i.id DESC LIMIT 50', [$type, $sid]);
    $issues = [];
    foreach ($rows as $i) {
        $issues[] = [
            'runId' => (string)$i['runId'],
            'displayId' => (string)($i['displayId'] ?? ''),
            'templateId' => (string)($i['templateId'] ?? ''),
            'templateName' => (string)($i['runTemplateName'] ?? ''),
            'templateVersion' => (int)($i['templateVersion'] ?? 0),
            'reprint' => (int)($i['reprint'] ?? 0) === 1,
            'ok' => (int)($i['ok'] ?? 1) === 1,
            'mode' => (string)($i['runMode'] ?? ''),
            'output' => (string)($i['runOutput'] ?? ''),
            'fullName' => (string)($i['fullName'] ?? ''), 'photoUrl' => (string)($i['photoUrl'] ?? ''),
            'at' => (string)($i['at'] ?? ''),
        ];
    }
    /* The card in their hand is the newest one that printed and was not a
       proof — not merely the newest row, which may be a proof or a failure. */
    $latest = null;
    foreach ($issues as $x) if ($x['ok'] && $x['mode'] !== 'proof') { $latest = $x; break; }
    /* Has the design moved on? Against what the studio would print NOW for this
       card type: another template, or a newer version of the same one. The
       built-in card has no version, so standard-to-standard is "no". */
    $stale = null;
    if ($latest) {
        // A different design ASSIGNED to this card type has replaced it; otherwise
        // the template it was printed with has been republished since.
        $d = function_exists('ids_design_for') ? ids_design_for($type) : null;
        if ($d && (string)$d['templateId'] !== $latest['templateId']) $stale = true;
        elseif ($latest['templateId'] !== '') {
            $cur = db_row('SELECT version FROM card_templates WHERE templateId = ? LIMIT 1', [$latest['templateId']]);
            $stale = $cur ? (int)$cur['version'] > (int)$latest['templateVersion'] : null;
        } else $stale = false;
    }
    $changed = [];
    if ($latest && $live) {
        $raw = db_row('SELECT photoUrl, fullName, faceSig FROM card_issues WHERE runId = ? AND subjectType = ? AND subjectId = ? ORDER BY id DESC LIMIT 1', [$latest['runId'], $type, $sid]);
        $snap = $raw && (string)$raw['faceSig'] !== '';
        if ($snap && photo_store_relativise((string)$raw['photoUrl']) !== photo_store_relativise((string)$live['photoUrl'])) $changed[] = 'photo';
        if ($snap && trim((string)$raw['fullName']) !== trim((string)$live['fullName'])) $changed[] = 'name';
    }
    return ['ok' => true, 'subjectType' => $type, 'subjectId' => $sid, 'changedSincePrint' => $changed,
            'issues' => $issues, 'count' => count($issues),
            'reprints' => count(array_values(array_filter($issues, fn($x) => $x['reprint'] && $x['ok']))),
            'latest' => $latest, 'designMovedOn' => $stale];
}
