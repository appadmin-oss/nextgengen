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
    $g = crun_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');

    $kind = (string)($p['kind'] ?? 'member');
    if (!in_array($kind, ['member', 'student', 'volunteer', 'afrovanguard', 'graphic'], true)) return ['ok' => false, 'error' => 'bad_kind'];
    $mode = (string)($p['mode'] ?? 'print');
    if (!in_array($mode, CRUN_MODES, true)) return ['ok' => false, 'error' => 'bad_mode'];

    $subjectType = (string)($p['subjectType'] ?? ($kind === 'graphic' ? 'member' : $kind));
    if (!in_array($subjectType, CRUN_SUBJECTS, true)) return ['ok' => false, 'error' => 'bad_subject_type'];

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
            foreach (db_all("SELECT subjectId, COUNT(*) c FROM card_issues WHERE ok = 1 AND subjectType = ? AND subjectId IN ($ph) GROUP BY subjectId", $args) as $r) {
                $priorCount[(string)$r['subjectId']] = (int)$r['c'];
            }
        }
    }

    $issued = 0; $failed = 0; $reprints = 0;
    $rows = [];
    foreach ($items as $it) {
        if (!is_array($it)) $it = ['subjectId' => (string)$it];
        $sid = trim((string)($it['subjectId'] ?? ''));
        if ($sid === '') { $failed++; continue; }
        $rowOk = array_key_exists('ok', $it) ? !empty($it['ok']) : true;
        $isReprint = ($priorCount[$sid] ?? 0) > 0;
        if ($isReprint && $rowOk) $reprints++;
        if ($rowOk) $issued++; else $failed++;
        $rows[] = [
            'runId' => $runId, 'subjectType' => $subjectType, 'subjectId' => $sid,
            'displayId' => mb_substr((string)($it['displayId'] ?? ''), 0, 48),
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

    db_insert('card_runs', [
        'runId' => $runId, 'kind' => $kind, 'mode' => $mode,
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

    audit('card.run.record', $me, $runId, [
        'kind' => $kind, 'mode' => $mode, 'template' => $templateId, 'version' => $tplVersion,
        'issued' => $issued, 'reprints' => $reprints, 'failed' => $failed,
    ], (string)($p['ip'] ?? ''));

    return ['ok' => true, 'runId' => $runId, 'mode' => $mode,
            'issued' => $issued, 'failed' => $failed, 'reprints' => $reprints,
            'templateVersion' => $tplVersion, 'backTemplateVersion' => $backVersion];
}

/** Recent runs, newest first — the print log. */
function admin_card_runs(array $p): array {
    $g = crun_gate($p); if (!$g['ok']) return $g;
    $where = []; $args = [];
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
    $g = crun_gate($p); if (!$g['ok']) return $g;
    $runId = (string)($p['runId'] ?? '');
    $r = db_row('SELECT * FROM card_runs WHERE runId = ? LIMIT 1', [$runId]);
    if (!$r) return ['ok' => false, 'error' => 'not_found'];
    $issues = db_all('SELECT * FROM card_issues WHERE runId = ? ORDER BY id ASC LIMIT ?', [$runId, CRUN_MAX_ISSUES]);
    return ['ok' => true, 'run' => crun_row_public($r),
        'issues' => array_map(fn($i) => [
            'subjectType' => (string)$i['subjectType'], 'subjectId' => (string)$i['subjectId'],
            'displayId' => (string)($i['displayId'] ?? ''),
            'templateVersion' => (int)($i['templateVersion'] ?? 0),
            'reprint' => (int)($i['reprint'] ?? 0) === 1,
            'ok' => (int)($i['ok'] ?? 1) === 1,
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
    $g = crun_gate($p); if (!$g['ok']) return $g;
    $type = (string)($p['subjectType'] ?? 'member');
    if (!in_array($type, CRUN_SUBJECTS, true)) return ['ok' => false, 'error' => 'bad_subject_type'];
    $sid = trim((string)($p['subjectId'] ?? ''));
    if ($sid === '') return ['ok' => false, 'error' => 'missing_subject'];

    $rows = db_all('SELECT * FROM card_issues WHERE subjectType = ? AND subjectId = ? ORDER BY id DESC LIMIT 50', [$type, $sid]);
    $issues = [];
    foreach ($rows as $i) {
        $run = db_row('SELECT mode, templateName, output, actorId, finishedAt FROM card_runs WHERE runId = ? LIMIT 1', [(string)$i['runId']]);
        $issues[] = [
            'runId' => (string)$i['runId'],
            'displayId' => (string)($i['displayId'] ?? ''),
            'templateId' => (string)($i['templateId'] ?? ''),
            'templateName' => (string)($run['templateName'] ?? ''),
            'templateVersion' => (int)($i['templateVersion'] ?? 0),
            'reprint' => (int)($i['reprint'] ?? 0) === 1,
            'ok' => (int)($i['ok'] ?? 1) === 1,
            'mode' => (string)($run['mode'] ?? ''),
            'output' => (string)($run['output'] ?? ''),
            'at' => (string)($i['at'] ?? ''),
        ];
    }
    $latest = $issues[0] ?? null;
    /* Has the design moved on since the card in their hand was printed? Only
       answerable when the card came from a stored template — the built-in
       hand-coded card has no version, and claiming one would be a lie in the
       one place that matters. */
    $stale = null;
    if ($latest && $latest['templateId'] !== '') {
        $cur = db_row('SELECT version FROM card_templates WHERE templateId = ? LIMIT 1', [$latest['templateId']]);
        if ($cur) $stale = (int)$cur['version'] > (int)$latest['templateVersion'];
    }
    return ['ok' => true, 'subjectType' => $type, 'subjectId' => $sid,
            'issues' => $issues, 'count' => count($issues),
            'reprints' => count(array_values(array_filter($issues, fn($x) => $x['reprint'] && $x['ok']))),
            'latest' => $latest, 'designMovedOn' => $stale];
}
