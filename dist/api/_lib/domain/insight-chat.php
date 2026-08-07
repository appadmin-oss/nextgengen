<?php
declare(strict_types=1);

/**
 * Level 7b — the analyst chat.
 *
 * The panel in insight.php answers four fixed questions well and nothing else.
 * A coordinator's actual question is narrower and stranger than any of them:
 * "why did Ayobo fall off after week two", "is it worth moving Wednesday",
 * "which of these two centres should get the new mentor". A panel cannot be
 * asked that. This can.
 *
 * WHAT MAKES THIS DIFFERENT FROM A CHATBOX OVER THE DATA
 *
 * A single model call with a database attached is a machine for producing
 * confident wrong answers about small numbers, and a youth programme's numbers
 * are all small. Four things here exist to stop that, and they are the whole
 * design:
 *
 *  1. PLAN FIRST, VISIBLY. A router decides which lenses the question actually
 *     needs and says so. "Why" pulls mechanism; "should we" pulls action and
 *     risk; anything comparing groups pulls equity. The plan is returned to the
 *     screen, so the answer arrives with its own method attached rather than as
 *     an oracle. It also stops the cost: three lenses instead of four is a
 *     quarter off every turn, and most questions need two.
 *
 *  2. THE SAME EVIDENCE, SCRUBBED ONCE. Every lens reads the identical
 *     aggregate payload insight_evidence() builds — no lens gets its own query,
 *     so no lens can quietly reach a child. The scrub gate runs on the encoded
 *     bytes that are actually sent.
 *
 *  3. GROUNDING IS CHECKED, NOT TRUSTED. Every number a claim cites is looked
 *     for in the evidence. A figure that is not there is flagged on the answer
 *     itself. This is the part that makes the feature safe to put in front of a
 *     funder: an invented figure is labelled as invented instead of being
 *     indistinguishable from a real one. It is also the part a model cannot do
 *     for itself, so it is done in PHP against the payload.
 *
 *  4. THE QUESTION IS TREATED AS UNTRUSTED INPUT. It is typed by a human who
 *     may well type a child's name, and it is about to leave the building. It
 *     goes through the same privacy gate as the evidence, and it is refused —
 *     not silently stripped — so the person learns not to do it again.
 *
 * Turns are persisted (migration 74). An answer that cost four provider calls
 * should survive a refresh, the same question tends to recur across
 * coordinators, and an answer somebody acted on has to stay auditable next to
 * the evidence fingerprint it was grounded in.
 */

/* Which lens answers which kind of question. The router chooses from these by
 * key; the briefs and profiles are the panel's, so a lens behaves identically
 * whether it was reached from the panel or from a question. One roster, not
 * two that drift. */
const ICHAT_MAX_TURN_CHARS   = 600;   // a question, not an essay
const ICHAT_MAX_LENSES       = 3;     // beyond three the answers repeat and the bill does not
const ICHAT_HISTORY_TURNS    = 4;     // enough for "and the other one?" to resolve
const ICHAT_TURNS_PER_HOUR   = 30;    // per admin; this spends money
const ICHAT_ROUTER_PROFILE   = 'insight_router';
const ICHAT_ANSWER_PROFILE   = 'insight_answer';

/** A number as a reader would write it, for grounding checks. */
function ichat_numbers(string $text): array {
    if (!preg_match_all('/-?\d+(?:\.\d+)?/', $text, $m)) return [];
    $out = [];
    foreach ($m[0] as $n) {
        $f = (float)$n;
        // Years and small counts are not claims about the data; 2026 and "two
        // centres" would match everything and flag nothing.
        if ($f >= 1900 && $f <= 2100 && strpos($n, '.') === false) continue;
        $out[(string)$n] = $f;
    }
    return $out;
}

/**
 * Does every figure in this claim appear in the evidence?
 *
 * Rounded comparison, because a model writing "about 71%" from 71.8 is being
 * helpful rather than wrong, and because the evidence carries one decimal.
 * Tolerance is deliberately generous in the direction of not crying wolf: a
 * check that flags honest rounding is a check somebody switches off.
 *
 * Returns the figures it could NOT find. Empty means grounded.
 */
function ichat_ungrounded(string $text, array $haystack): array {
    $want = ichat_numbers($text);
    if (!$want) return [];
    $miss = [];
    foreach ($want as $raw => $v) {
        /* How close counts as "the same number" depends on how it was WRITTEN.
         * A model that writes "about 71%" from 71.8 has rounded — or truncated,
         * which is just as common — and either is honest reporting, so a figure
         * written without a decimal is matched to within a whole unit. A figure
         * written WITH one is a precise quote and is held to it: "71.2%" when
         * the evidence says 71.8 is a different claim, not a rounding. */
        $loose = strpos((string)$raw, '.') === false ? 1.0 : 0.06;
        $found = false;
        foreach ($haystack as $h) {
            if (abs($h - $v) < $loose) { $found = true; break; }
            /* A difference the model computed itself — "27 points behind" from
               two rates that ARE in the evidence — is grounded even though the
               subtraction is not. Checked against every pair would be O(n²) on
               a few hundred numbers; checked against differences from the same
               value is enough to catch the common case without that. */
            foreach ($haystack as $h2) {
                if (abs(abs($h - $h2) - $v) < $loose) { $found = true; break 2; }
            }
        }
        if (!$found) $miss[] = (string)$raw;
    }
    return array_slice($miss, 0, 8);
}

/** Every number anywhere in the evidence, flattened once per turn. */
function ichat_evidence_numbers($node, array &$out = []): array {
    if (is_array($node)) {
        foreach ($node as $v) ichat_evidence_numbers($v, $out);
    } elseif (is_int($node) || is_float($node)) {
        $out[] = (float)$node;
    } elseif (is_string($node)) {
        foreach (ichat_numbers($node) as $v) $out[] = $v;
    }
    return $out;
}

/* ── The router ───────────────────────────────────────────────────────────── */

/**
 * Which lenses does this question need, and can it be answered at all?
 *
 * A cheap call whose only job is to plan. It is separate from the answer for a
 * reason worth stating: a model asked to plan and answer in one breath does
 * neither, and the plan is the part a reader needs in order to judge the answer.
 *
 * The heuristic fallback is not decoration. If the router call fails the turn
 * still has to run, and running every lens is both the expensive answer and the
 * wrong one.
 */
function ichat_route(string $question, array $ev): array {
    $keys = array_column(INSIGHT_ANALYSTS, 'key');
    $sys = "You are routing one question to a panel of analysts reading aggregate data from a youth "
         . "education programme. You do NOT answer it.\n\n"
         . "The analysts:\n"
         . "- mechanism: names the concrete operational cause of a pattern (timetable, transport, term dates).\n"
         . "- action: proposes changes a coordinator could make in a week with no new budget.\n"
         . "- risk: finds where the evidence would mislead somebody acting on it.\n"
         . "- equity: compares segments — which age band, sex or centre is behind, and is the gap real.\n\n"
         . "Pick the FEWEST lenses that genuinely answer the question — one is often right, three is the "
         . "maximum, and picking a lens that merely might say something is how a panel becomes noise.\n"
         . "Always include `risk` when the question asks for a decision or a comparison, because that is "
         . "where a small-sample answer does damage.\n"
         . "Set answerable=false ONLY when the evidence genuinely cannot address the question — and judge that "
         . "against the list below, which is generated from the payload you are being given rather than "
         . "written down beside it. Refusing a question the evidence CAN answer is the worse error of the two.\n\n"
         . ichat_capabilities(ichat_shape($ev)) . "\n\n"
         . "Reply with JSON only: {\"lenses\":[\"mechanism\"],\"why\":\"one sentence\","
         . "\"answerable\":true,\"unanswerable_because\":\"\",\"restated\":\"the question in one precise sentence\"}";

    $r = ai_classify($sys, json_encode([
        'question' => $question,
        'evidence_shape' => ichat_shape($ev),
    ], JSON_UNESCAPED_SLASHES), 500, ICHAT_ROUTER_PROFILE);

    if (!empty($r['ok']) && is_array($r['data'] ?? null)) {
        $picked = array_values(array_intersect($keys, array_map('strval', (array)($r['data']['lenses'] ?? []))));
        if ($picked) {
            return [
                'lenses' => array_slice($picked, 0, ICHAT_MAX_LENSES),
                'why' => mb_substr(trim((string)($r['data']['why'] ?? '')), 0, 300),
                'restated' => mb_substr(trim((string)($r['data']['restated'] ?? '')), 0, 300),
                'answerable' => ($r['data']['answerable'] ?? true) !== false,
                'unanswerable' => mb_substr(trim((string)($r['data']['unanswerable_because'] ?? '')), 0, 300),
                'by' => 'router', 'provider' => (string)($r['provider'] ?? ''),
            ];
        }
    }
    /* Keyword fallback. Crude on purpose — it only has to be better than "run
       everything", and it is, because a question containing "should" really
       does want action and risk. */
    $q = mb_strtolower($question);
    $has = fn(array $w) => (bool)array_filter($w, fn($x) => mb_strpos($q, $x) !== false);
    $pick = [];
    if ($has(['why', 'cause', 'because', 'reason', 'explain', 'drop', 'fell', 'fall'])) $pick[] = 'mechanism';
    if ($has(['should', 'what do', 'how do', 'fix', 'improve', 'do about', 'next', 'plan'])) $pick[] = 'action';
    if ($has(['gap', 'girls', 'boys', 'age', 'behind', 'worse', 'compare', 'versus', ' vs ', 'between'])) $pick[] = 'equity';
    if ($has(['should', 'compare', 'versus', ' vs ', 'trust', 'real', 'sure', 'confident', 'between'])) $pick[] = 'risk';
    if (!$pick) $pick = ['mechanism', 'risk'];
    return ['lenses' => array_slice(array_values(array_unique($pick)), 0, ICHAT_MAX_LENSES),
            'why' => 'Routed on the wording of the question — the planning call was unavailable.',
            'restated' => '', 'answerable' => true, 'unanswerable' => '',
            'by' => 'fallback', 'provider' => ''];
}

/** What the evidence contains, without the values — enough to route on, and
 *  cheap enough to send on every turn. */
function ichat_shape(array $ev): array {
    $centres = (array)($ev['centres'] ?? []);
    return [
        'range' => $ev['range'] ?? [],
        // The centre rows carry more than a name now, and the router was
        // refusing centre questions partly because all it could see was names.
        'centres' => array_map(fn($c) => [
            'name' => (string)$c['centre'],
            'has' => array_values(array_filter([
                isset($c['rate']) ? 'attendance rate + interval' : '',
                isset($c['avgGrade']) && $c['avgGrade'] !== null ? 'average grade' : '',
                !empty($c['bySex']) ? 'sex split' : '',
                isset($c['activities']) ? 'activities + evidence count' : '',
            ])),
        ], $centres),
        'segmentRows' => array_map(fn($r) => (string)$r['row'], (array)($ev['segments'] ?? [])),
        'hasWeekday' => !empty($ev['weekday']),
        'hasRetention' => !empty($ev['retention']),
        'hasLearningBySex' => !empty($ev['learning']['bySex']),
        'hasAttrition' => !empty($ev['attrition']['openDays']),
        'hasTransitionWindow' => !empty($ev['transition']['bands']),
        'computedFindings' => array_map(fn($f) => (string)$f['title'], (array)($ev['computed'] ?? [])),
    ];
}

/**
 * What this evidence can and cannot answer, IN ENGLISH, derived from the
 * payload rather than written down beside it.
 *
 * The router used to be told, in a hand-written sentence, that the evidence
 * "holds attendance rates, segments by age and sex, weekday patterns, retention
 * by intake, and centre readiness". Two things went wrong with that. It went
 * stale — learning by sex was added and the sentence did not know — and
 * "centre readiness" is vague enough that a model asked "why is Ayobo falling"
 * would conclude there was no centre-specific data and refuse. Users saw a
 * refusal that named capabilities the evidence actually had.
 *
 * A description of a payload that lives anywhere except in the payload will
 * drift. This one is generated, so it cannot.
 */
function ichat_capabilities(array $ev): string {
    $has = [];
    $c = (array)($ev['centres'] ?? []);
    if ($c) {
        $bits = [];
        foreach ($c as $x) foreach ((array)($x['has'] ?? []) as $h) $bits[$h] = true;
        // Named, because "which centre" is the most common question asked here
        // and a model that cannot see the names assumes there are none.
        $has[] = 'per-centre figures for ' . count($c) . ' site(s) — '
               . implode('; ', array_slice(array_map(fn($x) => (string)($x['name'] ?? ''), $c), 0, 12))
               . ' — covering ' . (implode(', ', array_keys($bits)) ?: 'attendance');
    }
    if (!empty($ev['segmentRows'])) $has[] = 'attendance cross-tabulated by ' . implode(' and ', array_slice($ev['segmentRows'], 0, 8));
    if (!empty($ev['hasWeekday'])) $has[] = 'attendance by weekday, per centre';
    if (!empty($ev['hasRetention'])) $has[] = 'retention curves by intake';
    if (!empty($ev['hasLearningBySex'])) $has[] = 'average grade and grading coverage by sex, with the gap';
    if (!empty($ev['hasTransitionWindow'])) $has[] = 'how many children are at the schooling transition point (grades 4-6 and 7-9), by class band and sex';
    if (!empty($ev['hasAttrition'])) $has[] = 'how many children came and then STOPPED coming, and how many never came at '
        . 'all, programme-wide and per centre — which is a different question from the attendance rate and often '
        . 'has the opposite answer';
    if (!empty($ev['computedFindings'])) $has[] = count($ev['computedFindings']) . ' already-computed findings';
    $r = (array)($ev['range'] ?? []);
    $range = trim((string)($r['label'] ?? '')) !== '' ? (string)$r['label'] : (($r['from'] ?? '') . ' to ' . ($r['to'] ?? ''));

    return "THE EVIDENCE HOLDS:\n- " . implode("\n- ", $has ?: ['nothing yet'])
         . "\n\nAll of it covers " . ($range !== ' to ' ? $range : 'the selected period') . " only, and all of it is "
         . "aggregate: counts, rates and intervals. It holds NO money, NO staff or child names, and NOTHING "
         . "outside that period. Answer from what is listed above — if a name appears in the list, that centre "
         . "IS in the evidence and a question about it is answerable.";
}

/* ── The answer ───────────────────────────────────────────────────────────── */

/** One lens, answering THIS question rather than its standing brief. */
function ichat_ask_lens(array $a, string $question, string $evidenceJson, array $history): array {
    $sys = "You are one of several independent analysts reading the SAME aggregate evidence from a Nigerian "
         . "youth education programme, and you are answering a specific question a centre coordinator asked.\n\n"
         . "Your lens: " . $a['brief'] . "\n\n"
         . "RULES, all binding:\n"
         . "- Answer the question that was asked. If your lens has nothing to say about it, return no points. "
         . "An empty answer from the wrong lens is worth more than a padded one.\n"
         . "- Every point must cite a number that is present in the evidence. If it is not there, you do not know it.\n"
         . "- Group sizes are given. A difference resting on a handful of children is not a finding — say so instead.\n"
         . "- 'child-days' are attendance opportunities, not distinct children. Repeat visits by the same few "
         . "people are not independent evidence.\n"
         . "- You are reading aggregates. You will see no names and must not speculate about individuals.\n"
         . "- Write for a coordinator. Short sentences, no jargon, no hedging padding.\n\n"
         . "Reply with JSON only: {\"points\":[{\"point\":\"one or two sentences\",\"evidence\":\"the numbers you used\","
         . "\"confidence\":\"high|medium|low\"}]}. At most 3 points.";

    $payload = ['question' => $question, 'evidence' => json_decode($evidenceJson, true)];
    if ($history) $payload['earlier_in_this_conversation'] = $history;

    $r = ai_classify($sys, json_encode($payload, JSON_UNESCAPED_SLASHES) ?: '{}', 1100, $a['profile']);
    if (empty($r['ok']) || !is_array($r['data']['points'] ?? null)) {
        return ['key' => $a['key'], 'label' => $a['label'], 'ok' => false,
                'error' => (string)($r['error'] ?? 'no_points'), 'points' => []];
    }
    $points = [];
    foreach (array_slice($r['data']['points'], 0, 3) as $c) {
        $t = trim((string)($c['point'] ?? ''));
        if ($t === '') continue;
        $points[] = [
            'point' => mb_substr($t, 0, 700),
            'evidence' => mb_substr(trim((string)($c['evidence'] ?? '')), 0, 300),
            'confidence' => in_array(($c['confidence'] ?? ''), ['high', 'medium', 'low'], true) ? (string)$c['confidence'] : 'low',
        ];
    }
    return ['key' => $a['key'], 'label' => $a['label'], 'ok' => true,
            'provider' => (string)($r['provider'] ?? ''), 'points' => $points];
}

/**
 * Compose one answer from the lenses.
 *
 * May only use what the lenses said. The rule is the panel's and it matters more
 * here: in a chat the composed paragraph is the only thing most people read, so
 * a composer allowed to add would be an unreviewed analyst speaking with the
 * authority of a conclusion.
 */
function ichat_compose(string $question, array $lenses, string $evidenceJson): array {
    $input = [];
    foreach ($lenses as $l) {
        if (empty($l['ok'])) continue;
        foreach ($l['points'] as $i => $p) $input[] = ['id' => $l['key'] . '.' . $i, 'lens' => $l['label']] + $p;
    }
    if (!$input) return ['ok' => false, 'error' => 'no_points', 'answer' => '', 'claims' => []];

    /* The answer is asked for as DATA as well as prose.
     *
     * Not decoration: "attendance fell nine points at Ayobo" as a sentence is a
     * claim a reader has to take on trust, and the same thing as three tiles, a
     * four-point series and a ranked table is a claim they can check at a
     * glance — and paste into a board paper without retyping it.
     *
     * Every figure in every one of these lands in the same grounding check as
     * the prose (see below), so a fabricated tile is caught exactly like a
     * fabricated sentence. That is the whole reason this is safe to add: a
     * chart is more persuasive than a paragraph, so it needs MORE checking,
     * not less.
     *
     * All four blocks are optional and the model is told to omit rather than
     * pad — an empty table is worse than no table. */
    $sys = "Several independent analysts answered one question from the same evidence. Write the answer the "
         . "coordinator reads.\n\n"
         . "- You may ONLY use what the analysts wrote and what is in the evidence. Never add a point of your "
         . "own, never strengthen one, and NEVER invent a number that is not in the evidence.\n"
         . "- Lead with the direct answer to the question in one or two sentences. If the analysts disagree, "
         . "say that plainly — a clean answer that hides a disagreement is the worst outcome here.\n"
         . "- Where two lenses reached the same point independently, say so; that is the strongest thing you have.\n"
         . "- Where a point rests on few children, keep that caveat. Do not tidy it away.\n"
         . "- No preamble, no 'great question', no restating the question back.\n\n"
         . "ALSO return the answer as data where the evidence supports it. Omit any block you cannot fill "
         . "honestly — an empty or padded block is worse than none:\n"
         . "- stats: up to 3 headline figures. `tone` is good|warn|bad|neutral for how it should read.\n"
         . "- table: a small comparison, at most 6 rows and 4 columns. `bar` marks the column to draw as a "
         . "bar (0-100 values only). `delta` marks a change column.\n"
         . "- chart: line|bar, one series over up to 12 labelled points, when the answer is about a trend.\n"
         . "- caveat: one sentence on what would make this answer wrong.\n\n"
         . "Reply with JSON only: {\"answer\":\"2-5 sentences of plain prose\","
         . "\"claims\":[{\"claim\":\"one sentence\",\"lenses\":[\"\"],\"evidence\":\"the numbers\","
         . "\"confidence\":\"high|medium|low\",\"agreed\":true}],"
         . "\"stats\":[{\"label\":\"Attendance\",\"value\":\"78%\",\"note\":\"up 4\",\"tone\":\"good\"}],"
         . "\"table\":{\"title\":\"\",\"columns\":[\"Centre\",\"Att.\",\"Change\"],\"bar\":1,\"delta\":2,"
         . "\"rows\":[[\"Egbeda\",\"91\",\"+3\"]]},"
         . "\"chart\":{\"kind\":\"line\",\"label\":\"Ayobo attendance by week\",\"unit\":\"%\","
         . "\"points\":[{\"x\":\"wk1\",\"y\":68}],\"watch\":55},"
         . "\"caveat\":\"\","
         . "\"followups\":[\"a question this answer suggests asking next\"]}";

    $r = ai_classify($sys, json_encode(['question' => $question, 'analyst_points' => $input,
        'evidence' => json_decode($evidenceJson, true)], JSON_UNESCAPED_SLASHES) ?: '{}', 1600, ICHAT_ANSWER_PROFILE);

    if (empty($r['ok']) || !is_array($r['data'] ?? null)) {
        /* The lenses ran. Hand their points back as the answer rather than
         * nothing — one failed composition must not discard three calls that
         * worked, and an unpolished list of grounded points is still useful. */
        return ['ok' => false, 'error' => (string)($r['error'] ?? 'compose_failed'),
                'answer' => '', 'claims' => array_map(fn($p) => [
                    'claim' => $p['point'], 'lenses' => [$p['lens']], 'evidence' => $p['evidence'],
                    'confidence' => $p['confidence'], 'agreed' => false], $input),
                'followups' => []];
    }
    $d = $r['data'];
    $claims = [];
    foreach ((array)($d['claims'] ?? []) as $c) {
        $t = trim((string)($c['claim'] ?? ''));
        if ($t === '') continue;
        $claims[] = ['claim' => mb_substr($t, 0, 400),
                     'lenses' => array_slice(array_map(fn($x) => mb_substr((string)$x, 0, 40), (array)($c['lenses'] ?? [])), 0, 4),
                     'evidence' => mb_substr(trim((string)($c['evidence'] ?? '')), 0, 300),
                     'confidence' => in_array(($c['confidence'] ?? ''), ['high', 'medium', 'low'], true) ? (string)$c['confidence'] : 'low',
                     'agreed' => !empty($c['agreed'])];
    }
    return ['ok' => true, 'answer' => mb_substr(trim((string)($d['answer'] ?? '')), 0, 1600),
            'claims' => $claims,
            'data' => ichat_clean_data($d),
            'followups' => array_slice(array_map(fn($x) => mb_substr(trim((string)$x), 0, 160), (array)($d['followups'] ?? [])), 0, 3),
            'provider' => (string)($r['provider'] ?? '')];
}

/**
 * The structured blocks, bounded and typed before anything renders them.
 *
 * A model asked for JSON returns approximately JSON: a table with nine columns
 * in one row and three in the next, a chart with two hundred points, a `tone`
 * of "positive". None of that is misbehaviour worth failing a turn over — it is
 * simply why the shape a renderer receives must be built here rather than
 * passed through. Anything unusable is DROPPED rather than repaired into
 * something plausible, because a half-invented table is the one artefact on
 * this screen a reader would never think to doubt.
 */
function ichat_clean_data(array $d): array {
    $out = [];

    $stats = [];
    foreach ((array)($d['stats'] ?? []) as $st) {
        if (!is_array($st)) continue;
        $label = mb_substr(trim((string)($st['label'] ?? '')), 0, 40);
        $value = mb_substr(trim((string)($st['value'] ?? '')), 0, 20);
        if ($label === '' || $value === '') continue;
        $stats[] = ['label' => $label, 'value' => $value,
                    'note' => mb_substr(trim((string)($st['note'] ?? '')), 0, 40),
                    'tone' => in_array(($st['tone'] ?? ''), ['good', 'warn', 'bad', 'neutral'], true) ? (string)$st['tone'] : 'neutral'];
    }
    // Capped AFTER filtering: capping first means one unusable entry costs a
    // usable one, which is how a three-tile answer arrives with two tiles.
    if ($stats) $out['stats'] = array_slice($stats, 0, 3);

    $t = is_array($d['table'] ?? null) ? $d['table'] : null;
    if ($t) {
        $cols = array_slice(array_map(fn($c) => mb_substr(trim((string)$c), 0, 24), (array)($t['columns'] ?? [])), 0, 4);
        $rows = [];
        foreach ((array)($t['rows'] ?? []) as $r0) {
            if (!is_array($r0)) continue;
            // Ragged rows are the common failure. Padded to the header rather
            // than dropped, so one short row does not lose the whole table.
            $cells = array_slice(array_map(fn($c) => mb_substr(trim((string)$c), 0, 40), array_values($r0)), 0, count($cols));
            while (count($cells) < count($cols)) $cells[] = '';
            if (trim(implode('', $cells)) !== '') $rows[] = $cells;
        }
        $rows = array_slice($rows, 0, 6);
        if (count($cols) >= 2 && count($rows) >= 1) {
            $bar = isset($t['bar']) ? (int)$t['bar'] : -1;
            $delta = isset($t['delta']) ? (int)$t['delta'] : -1;
            $out['table'] = [
                'title' => mb_substr(trim((string)($t['title'] ?? '')), 0, 80),
                'columns' => $cols, 'rows' => $rows,
                // Out-of-range indices become "no bar" rather than an exception
                // in a renderer that trusted them.
                'bar' => ($bar >= 0 && $bar < count($cols)) ? $bar : -1,
                'delta' => ($delta >= 0 && $delta < count($cols)) ? $delta : -1,
            ];
        }
    }

    $c = is_array($d['chart'] ?? null) ? $d['chart'] : null;
    if ($c) {
        $pts = [];
        foreach ((array)($c['points'] ?? []) as $p0) {
            if (!is_array($p0) || !isset($p0['y']) || !is_numeric($p0['y'])) continue;
            $pts[] = ['x' => mb_substr(trim((string)($p0['x'] ?? '')), 0, 12), 'y' => round((float)$p0['y'], 2)];
        }
        $pts = array_slice($pts, 0, 12);
        // Two points is not a trend; one is a number that belongs in a tile.
        if (count($pts) >= 3) {
            $out['chart'] = [
                'kind' => ($c['kind'] ?? '') === 'bar' ? 'bar' : 'line',
                'label' => mb_substr(trim((string)($c['label'] ?? '')), 0, 80),
                'unit' => mb_substr(trim((string)($c['unit'] ?? '')), 0, 8),
                'points' => $pts,
                'watch' => is_numeric($c['watch'] ?? null) ? round((float)$c['watch'], 2) : null,
            ];
        }
    }

    $cav = mb_substr(trim((string)($d['caveat'] ?? '')), 0, 300);
    if ($cav !== '') $out['caveat'] = $cav;
    return $out;
}

/** Every figure inside the structured blocks, as one string, so the grounding
 *  check that guards the prose guards the tiles and the table too.
 *
 *  This is the point of the whole exercise. A chart is more persuasive than a
 *  paragraph, so an unchecked chart is more dangerous than an unchecked
 *  paragraph — the structured blocks needed MORE checking to be worth adding,
 *  not permission to skip it. */
function ichat_data_text(array $data): string {
    $bits = [];
    foreach ((array)($data['stats'] ?? []) as $st) { $bits[] = (string)$st['value']; $bits[] = (string)$st['note']; }
    $t = $data['table'] ?? null;
    if (is_array($t)) foreach ($t['rows'] as $r) foreach ($r as $cell) $bits[] = (string)$cell;
    $c = $data['chart'] ?? null;
    if (is_array($c)) foreach ($c['points'] as $p) $bits[] = (string)$p['y'];
    return implode(' ', $bits);
}

/* ── Threads ──────────────────────────────────────────────────────────────── */

function ichat_thread_new(string $ownerId, string $centre, string $rangeLabel, string $title): array {
    $tid = 'IQ-' . strtoupper(bin2hex(random_bytes(6)));
    db_insert('insight_threads', ['threadId' => $tid, 'title' => mb_substr($title, 0, 200),
        'ownerId' => $ownerId, 'centre' => $centre, 'rangeLabel' => $rangeLabel, 'turns' => 0,
        'createdAt' => now_iso(), 'updatedAt' => now_iso(), 'archivedAt' => '']);
    return db_row("SELECT * FROM insight_threads WHERE threadId = ? LIMIT 1", [$tid]) ?: [];
}

/** One turn, shaped for the screen. Stored JSON is decoded here so no caller
 *  has to know it was ever a string. */
function ichat_turn_out(array $r): array {
    $j = fn($k) => json_decode((string)($r[$k] ?? ''), true) ?: [];
    return [
        'seq' => (int)$r['seq'],
        'question' => (string)$r['question'],
        'answer' => (string)($r['answer'] ?? ''),
        'plan' => $j('planJson'),
        'claims' => $j('claimsJson'),
        'data' => $j('dataJson'),
        'checks' => $j('checksJson'),
        'evidenceFp' => (string)($r['evidenceFp'] ?? ''),
        'rangeLabel' => (string)($r['rangeLabel'] ?? ''),
        'status' => (string)($r['status'] ?? 'ok'),
        'error' => (string)($r['error'] ?? ''),
        'providers' => array_values(array_filter(explode(',', (string)($r['providers'] ?? '')))),
        'ms' => (int)($r['ms'] ?? 0),
        'at' => (string)($r['createdAt'] ?? ''),
    ];
}

/** The last few turns, flattened for the model. Answers only — a model does not
 *  need the plan or the grounding checks to resolve "and the other centre?". */
function ichat_history(string $threadId): array {
    $rows = db_all("SELECT question, answer FROM insight_turns WHERE threadId = ? AND status = 'ok'
                    ORDER BY seq DESC LIMIT " . ICHAT_HISTORY_TURNS, [$threadId]);
    $out = [];
    foreach (array_reverse($rows) as $r) {
        $out[] = ['asked' => (string)$r['question'], 'answered' => mb_substr((string)$r['answer'], 0, 600)];
    }
    return $out;
}

/**
 * An hourly per-admin budget, in the cache.
 *
 * Deliberately fail-OPEN on a cache problem. A coordinator locked out of the
 * analyst because a cache directory went read-only is a worse failure than a few
 * extra provider calls, and the cost ceiling that actually matters is the
 * provider's own key limit rather than this.
 */
function ichat_budget_ok(string $memberId): bool {
    $slot = (int)floor(time() / 3600);
    $key = 'ichat_budget_' . substr(sha1($memberId), 0, 12) . '_' . $slot;
    $now = cache_get($key, 7200);
    $used = is_array($now) ? (int)($now['n'] ?? 0) : 0;
    if ($used >= ICHAT_TURNS_PER_HOUR) return false;
    cache_put($key, ['n' => $used + 1]);
    return true;
}

/* ── The ops ──────────────────────────────────────────────────────────────── */

/**
 * List this admin's threads, newest first.
 *
 * `archived` flips the list to the put-away ones, so archiving is no longer a
 * one-way trip with nothing on the other side of it — the pane can offer to show
 * them and restore one. The active list always reports how many are archived, so
 * the affordance only appears when there is something behind it.
 */
function insight_chat_threads(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $wantArchived = !empty($p['archived']);
    $clause = $wantArchived
        ? "archivedAt IS NOT NULL AND archivedAt != ''"
        : "(archivedAt IS NULL OR archivedAt = '')";
    $rows = db_all("SELECT threadId, title, centre, rangeLabel, turns, createdAt, updatedAt
                    FROM insight_threads WHERE ownerId = ? AND $clause
                    ORDER BY updatedAt DESC LIMIT 40", [$me]);
    $out = ['ok' => true, 'archived' => $wantArchived, 'threads' => array_map(fn($r) => [
        'threadId' => (string)$r['threadId'], 'title' => (string)$r['title'],
        'centre' => (string)$r['centre'], 'rangeLabel' => (string)$r['rangeLabel'],
        'turns' => (int)$r['turns'], 'updatedAt' => (string)$r['updatedAt'],
    ], $rows)];
    if (!$wantArchived) {
        $out['archivedCount'] = (int)(db_row("SELECT COUNT(*) n FROM insight_threads
            WHERE ownerId = ? AND archivedAt IS NOT NULL AND archivedAt != ''", [$me])['n'] ?? 0);
    }
    return $out;
}

/** One thread with its turns. */
function insight_chat_thread(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $tid = trim((string)($p['threadId'] ?? ''));
    $t = db_row("SELECT * FROM insight_threads WHERE threadId = ? LIMIT 1", [$tid]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    // A thread belongs to the admin who opened it. Nothing here is a secret from
    // another admin, but a shared inbox of half-finished conversations is noise.
    if ((string)$t['ownerId'] !== (string)($g['requester']['memberId'] ?? '')) return ['ok' => false, 'error' => 'not_yours'];
    $turns = db_all("SELECT * FROM insight_turns WHERE threadId = ? ORDER BY seq ASC", [$tid]);
    return ['ok' => true, 'thread' => [
        'threadId' => (string)$t['threadId'], 'title' => (string)$t['title'],
        'centre' => (string)$t['centre'], 'rangeLabel' => (string)$t['rangeLabel'],
        'turns' => array_map('ichat_turn_out', $turns),
    ]];
}

function insight_chat_archive(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $tid = trim((string)($p['threadId'] ?? ''));
    $t = db_row("SELECT * FROM insight_threads WHERE threadId = ? LIMIT 1", [$tid]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$t['ownerId'] !== (string)($g['requester']['memberId'] ?? '')) return ['ok' => false, 'error' => 'not_yours'];
    // `restore` puts it back — the inverse of archiving, so a thread put away by
    // mistake is one click to recover rather than gone. Archiving stays soft:
    // the turns are never deleted either way.
    $restore = !empty($p['restore']);
    db_update('insight_threads', ['archivedAt' => $restore ? '' : now_iso(), 'updatedAt' => now_iso()], ['threadId' => $tid]);
    return ['ok' => true, 'archived' => !$restore];
}

/**
 * Rename a thread.
 *
 * The title is generated from the first question, which is the right default
 * and a poor label three weeks later — "Which centre should get the next
 * mentor…" reads identically to the other four times somebody asked it. A
 * conversation you cannot name is a conversation you will re-ask instead of
 * re-open, and each re-ask is a fresh round of model calls.
 *
 * Scrubbed like a question, not stored like one: a title is the one field in
 * this whole subsystem a human types freely and nothing else checks, and it is
 * the obvious place for "Tunde's attendance problem" to end up.
 */
function insight_chat_rename(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $tid = trim((string)($p['threadId'] ?? ''));
    $t = db_row("SELECT ownerId FROM insight_threads WHERE threadId = ? LIMIT 1", [$tid]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$t['ownerId'] !== (string)($g['requester']['memberId'] ?? '')) return ['ok' => false, 'error' => 'not_yours'];
    $title = trim(preg_replace('/\s+/', ' ', (string)($p['title'] ?? '')) ?? '');
    if ($title === '') return ['ok' => false, 'error' => 'title_required'];
    $hits = insight_scrub(json_encode(['q' => $title], JSON_UNESCAPED_SLASHES) ?: '');
    if ($hits) return ['ok' => false, 'error' => 'question_identifies_someone', 'reasons' => $hits];
    $title = mb_substr($title, 0, 120);
    db_update('insight_threads', ['title' => $title, 'updatedAt' => now_iso()], ['threadId' => $tid]);
    return ['ok' => true, 'title' => $title];
}

/**
 * Ask one question. The whole pipeline, in the order a reader would want it
 * explained: gate, scrub, plan, ask, compose, check, store.
 */
function insight_chat_ask(array $p): array {
    $t0 = microtime(true);
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');

    $question = trim((string)($p['question'] ?? ''));
    if (mb_strlen($question) < 6) return ['ok' => false, 'error' => 'question_too_short'];
    if (mb_strlen($question) > ICHAT_MAX_TURN_CHARS) return ['ok' => false, 'error' => 'question_too_long'];

    /* THE QUESTION IS UNTRUSTED INPUT, and it is about to leave the building.
     * Refused rather than silently stripped: somebody who types a child's name
     * into an AI box needs to be told, once, that this is not the place. The
     * same gate the evidence goes through, on the same rules. */
    $leak = insight_scrub(json_encode(['q' => $question], JSON_UNESCAPED_SLASHES) ?: '');
    if ($leak) {
        return ['ok' => false, 'error' => 'question_identifies_someone', 'reasons' => $leak];
    }

    /* Rate-limited per ADMIN, not per IP.
     *
     * rate_limit_check() is the wrong tool here twice over: it keys on the client
     * IP, and a centre behind one NAT would share a budget between coordinators;
     * and it terminates the response with a 429, which is right for a route and
     * wrong for something that has already decided to answer. This is a plain
     * hourly bucket in the cache, per member, and it exists because every turn
     * spends real money on somebody else's API key. */
    if (!ichat_budget_ok($me)) {
        // When the bucket resets — the top of the next clock hour, since the
        // budget keys on floor(time()/3600). Given so the UI can say "try again
        // in N minutes" rather than leaving the operator to guess.
        $resetsInMin = (int)max(1, ceil(((floor(time() / 3600) + 1) * 3600 - time()) / 60));
        return ['ok' => false, 'error' => 'rate_limited', 'resetsInMin' => $resetsInMin,
            'note' => 'That is ' . ICHAT_TURNS_PER_HOUR . ' questions in an hour — the budget resets in about '
                . $resetsInMin . ' minute' . ($resetsInMin === 1 ? '' : 's') . '. The panel above is still free to read; it is already paid for.'];
    }

    if (!ai_enabled(ICHAT_ANSWER_PROFILE) && !ai_enabled(INSIGHT_ANALYSTS[0]['profile']) && !ai_enabled('default')) {
        return ['ok' => false, 'error' => 'ai_disabled'];
    }

    $ev = insight_evidence($p);
    if (!empty($ev['empty'])) return ['ok' => false, 'error' => 'no_evidence'];

    /* THE GATE. Encode once, check that encoding, send exactly those bytes. */
    $evidenceJson = json_encode($ev, JSON_UNESCAPED_SLASHES) ?: '{}';
    $evLeak = insight_scrub($evidenceJson);
    if ($evLeak) {
        ops_record('error', 'insight.privacy', 'Refused to send analytics to an AI provider — the payload contained identifying data.', implode('; ', $evLeak));
        return ['ok' => false, 'error' => 'privacy_refused', 'reasons' => $evLeak];
    }
    $fp = insight_fingerprint($ev);

    // Thread: continue one, or open one titled with the question that started it.
    $tid = trim((string)($p['threadId'] ?? ''));
    $thread = $tid !== '' ? db_row("SELECT * FROM insight_threads WHERE threadId = ? LIMIT 1", [$tid]) : null;
    if ($thread && (string)$thread['ownerId'] !== $me) return ['ok' => false, 'error' => 'not_yours'];
    if (!$thread) {
        $thread = ichat_thread_new($me, (string)($p['centre'] ?? ''),
            (string)($ev['range']['label'] ?? ''), $question);
        if (!$thread) return ['ok' => false, 'error' => 'thread_failed'];
    }
    $tid = (string)$thread['threadId'];
    $seq = (int)db_row("SELECT COALESCE(MAX(seq), 0) s FROM insight_turns WHERE threadId = ?", [$tid])['s'] + 1;
    $history = $seq > 1 ? ichat_history($tid) : [];

    /* 1 · Plan.
     *
     * `depth` is the asker's own ceiling on the panel, on top of the router's.
     * A quick "which centre is lowest" does not need three lenses arguing about
     * it, and three lenses is three provider calls — the control exists because
     * the cost is real and the asker is the one who knows which kind of question
     * they just typed. The router still picks FEWER when fewer will do; this can
     * only narrow, never widen. */
    $plan = ichat_route($question, $ev);
    $cap = (string)($p['depth'] ?? '') === 'quick' ? 1 : ICHAT_MAX_LENSES;
    if (count($plan['lenses']) > $cap) {
        $plan['lenses'] = array_slice($plan['lenses'], 0, $cap);
        $plan['cappedBy'] = 'quick';
    }
    if (empty($plan['answerable'])) {
        /* Stored as a turn, not thrown away. "This data cannot answer that" is a
           real answer and the most useful one a coordinator can get before
           building a decision on top of a number that is not there. */
        /* A refusal has to end somewhere useful.
         *
         * "This evidence cannot answer that" with nothing after it sends a
         * coordinator away to guess at a phrasing that might work, and the
         * commonest cause is not the question at all — it is the pane being
         * scoped to one centre while they ask about all of them. Both the scope
         * and the actual contents of the evidence are said here. */
        $why = (string)($plan['unanswerable'] ?: 'This evidence cannot answer that question.');
        $scoped = trim((string)($p['centre'] ?? ''));
        if ($scoped !== '') {
            $why .= "\n\nNote: this was asked against " . $scoped . " only — remove that chip above the box "
                  . "to ask across every centre.";
        }
        $why .= "\n\n" . ichat_capabilities(ichat_shape($ev));
        $store = [
            'threadId' => $tid, 'seq' => $seq, 'askedById' => $me, 'question' => $question,
            'answer' => $why,
            'planJson' => json_encode($plan, JSON_UNESCAPED_SLASHES), 'claimsJson' => '[]', 'checksJson' => '[]',
            'evidenceFp' => $fp, 'rangeLabel' => (string)($ev['range']['label'] ?? ''),
            'status' => 'unanswerable', 'error' => '', 'providers' => (string)($plan['provider'] ?? ''),
            'ms' => (int)round((microtime(true) - $t0) * 1000), 'createdAt' => now_iso(),
        ];
        db_insert('insight_turns', $store);
        db_update('insight_threads', ['turns' => $seq, 'updatedAt' => now_iso()], ['threadId' => $tid]);
        return ['ok' => true, 'threadId' => $tid, 'turn' => ichat_turn_out($store)];
    }

    // 2 · Ask the chosen lenses. A provider that is down loses one lens, not the turn.
    $byKey = [];
    foreach (INSIGHT_ANALYSTS as $a) $byKey[$a['key']] = $a;
    $lenses = [];
    foreach ($plan['lenses'] as $k) {
        if (!isset($byKey[$k])) continue;
        $lenses[] = ichat_ask_lens($byKey[$k], $question, $evidenceJson, $history);
    }
    $ran = array_values(array_filter($lenses, fn($l) => !empty($l['ok'])));

    // 3 · Compose.
    $comp = $ran ? ichat_compose($question, $lenses, $evidenceJson)
                 : ['ok' => false, 'error' => 'all_lenses_failed', 'answer' => '', 'claims' => [], 'followups' => []];

    /* 4 · Check the grounding. Every figure in the answer and in each claim is
     * looked for in the evidence. This is the difference between a chat over
     * data and an analyst: an answer whose numbers cannot be found says so, on
     * itself, rather than looking exactly like one whose numbers can. */
    $haystack = ichat_evidence_numbers($ev);
    $checks = [];
    $ungroundedAnswer = ichat_ungrounded((string)$comp['answer'], $haystack);
    foreach ($comp['claims'] as $i => $c) {
        $miss = ichat_ungrounded($c['claim'] . ' ' . $c['evidence'], $haystack);
        if ($miss) $checks[] = ['claim' => $i, 'unverified' => $miss];
    }
    /* The structured blocks go through the SAME check, and a block with any
       figure that is not in the evidence is DROPPED rather than shown with a
       warning on it.
       Prose with a flagged number is still readable — the flag sits beside the
       sentence. A table with one invented cell is not: the warning is above the
       widget, the widget is what gets screenshotted into a board paper, and no
       reader maps "some figures are unverified" onto the third row. Dropping is
       recorded, so this is not hiding — the turn says a table was produced and
       why it was not shown. */
    $data = is_array($comp['data'] ?? null) ? $comp['data'] : [];
    $dropped = [];
    foreach (['stats', 'table', 'chart'] as $block) {
        if (!isset($data[$block])) continue;
        $miss = ichat_ungrounded(ichat_data_text([$block => $data[$block]]), $haystack);
        if ($miss) { $dropped[] = ['block' => $block, 'unverified' => $miss]; unset($data[$block]); }
    }
    $grounded = !$ungroundedAnswer && !$checks && !$dropped;

    $providers = array_values(array_unique(array_filter(array_merge(
        [(string)($plan['provider'] ?? ''), (string)($comp['provider'] ?? '')],
        array_map(fn($l) => (string)($l['provider'] ?? ''), $ran)))));

    $store = [
        'threadId' => $tid, 'seq' => $seq, 'askedById' => $me, 'question' => $question,
        'answer' => (string)$comp['answer'],
        'planJson' => json_encode($plan + [
            'lensesRan' => array_map(fn($l) => ['key' => $l['key'], 'label' => $l['label'],
                'ok' => !empty($l['ok']), 'points' => count($l['points'] ?? []),
                'error' => (string)($l['error'] ?? '')], $lenses),
            'composed' => !empty($comp['ok']),
            'followups' => $comp['followups'] ?? [],
        ], JSON_UNESCAPED_SLASHES),
        'claimsJson' => json_encode($comp['claims'], JSON_UNESCAPED_SLASHES),
        'dataJson' => json_encode($data, JSON_UNESCAPED_SLASHES),
        'checksJson' => json_encode(['grounded' => $grounded, 'answerUnverified' => $ungroundedAnswer,
            'claims' => $checks, 'dropped' => $dropped, 'evidenceNumbers' => count($haystack)], JSON_UNESCAPED_SLASHES),
        'evidenceFp' => $fp, 'rangeLabel' => (string)($ev['range']['label'] ?? ''),
        'status' => $ran ? 'ok' : 'failed',
        'error' => $ran ? '' : mb_substr((string)($comp['error'] ?? ''), 0, 200),
        'providers' => mb_substr(implode(',', $providers), 0, 200),
        'ms' => (int)round((microtime(true) - $t0) * 1000),
        'createdAt' => now_iso(),
    ];
    db_insert('insight_turns', $store);
    db_update('insight_threads', ['turns' => $seq, 'updatedAt' => now_iso()], ['threadId' => $tid]);
    audit('insight.chat', $me, $tid, ['seq' => $seq, 'lenses' => count($ran), 'grounded' => $grounded], (string)($p['ip'] ?? ''));

    return ['ok' => true, 'threadId' => $tid, 'turn' => ichat_turn_out($store),
            'lenses' => array_map(fn($l) => [
                'key' => $l['key'], 'label' => $l['label'], 'ok' => !empty($l['ok']),
                'points' => $l['points'] ?? [], 'error' => (string)($l['error'] ?? ''),
            ], $lenses)];
}

/* ── The report ──────────────────────────────────────────────────────────────
 *
 * WHAT WAS MISSING. Pinning answers produced a TRANSCRIPT: six numbered
 * questions in the order somebody happened to pin them, each with its own
 * provenance line. Every finding was honest and traceable, and the document was
 * still not a report — because the three things a report does that a transcript
 * cannot were all left to the reader:
 *
 *   1. Say what the findings ADD UP TO. A board paper needs one paragraph. A
 *      reader who has to derive it from six answers derives a different one from
 *      the one the data supports, and nobody ever finds out.
 *
 *   2. Admit that the findings may not be about the same data. Each turn already
 *      stores its evidence fingerprint and its date range. Six questions asked
 *      across a week, with the date filter moved in between, produced a document
 *      that mixed snapshots and looked like one coherent reading of one dataset.
 *      This is the most dangerous thing on the page precisely because it is
 *      invisible: nothing in a transcript is wrong, and the whole is.
 *
 *   3. Collect the limitations. Caveats were scattered one per finding; a funder
 *      reads limitations as a section, and a caveat repeated six times in six
 *      places is a caveat nobody reads once.
 *
 * The checks below are DETERMINISTIC — PHP, not a model. A report-level warning
 * that a model might or might not notice is not a warning. The synthesis is the
 * only part a model writes, and it goes through the same grounding gate as every
 * answer: if a figure in it is not in the findings it summarises, it is dropped
 * rather than shipped with a note, because a summary is the one paragraph
 * everybody reads and the one nobody checks.
 */

/** Below this there is nothing to synthesise — one finding is its own summary. */
const IREP_MIN_FINDINGS = 2;

/** A stat label, reduced so "Attendance rate" and "attendance  rate" collide. */
function irep_label_key(string $s): string {
    $s = strtolower(trim($s));
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s) ?? $s;
    return trim(preg_replace('/\s+/', ' ', $s) ?? $s);
}

/** The numeric part of a stat value, or null when it has none ("—", "n/a"). */
function irep_stat_number(string $v): ?float {
    if (!preg_match('/-?\d+(?:\.\d+)?/', $v, $m)) return null;
    return (float)$m[0];
}

/**
 * Everything the findings say about themselves, without asking a model.
 *
 * Each of these answers a question a reader of the finished document would
 * otherwise have to ask the person who wrote it.
 */
function irep_checks(array $turns): array {
    $fps = []; $ranges = []; $caveats = []; $ungrounded = []; $unanswerable = []; $dropped = 0;
    $stats = [];                                  // labelKey => [[label, value, num, question], …]
    foreach ($turns as $t) {
        $fp = (string)($t['evidenceFp'] ?? '');
        if ($fp !== '') $fps[$fp] = true;
        $rl = (string)($t['rangeLabel'] ?? '');
        if ($rl !== '') $ranges[$rl] = true;
        $c = trim((string)(($t['data']['caveat'] ?? '')));
        if ($c !== '') $caveats[irep_label_key($c)] = $c;      // deduped on meaning, not spacing
        if (($t['checks']['grounded'] ?? true) === false) $ungrounded[] = (string)$t['question'];
        if ((string)($t['status'] ?? '') === 'unanswerable') $unanswerable[] = (string)$t['question'];
        $dropped += count((array)($t['checks']['dropped'] ?? []));
        foreach ((array)($t['data']['stats'] ?? []) as $st) {
            $label = trim((string)($st['label'] ?? ''));
            $value = trim((string)($st['value'] ?? ''));
            if ($label === '' || $value === '') continue;
            $stats[irep_label_key($label)][] = ['label' => $label, 'value' => $value,
                'num' => irep_stat_number($value), 'question' => (string)$t['question']];
        }
    }

    /* THE SAME FIGURE, TWICE, DIFFERENT.
     *
     * Compared on the STRUCTURED stats rather than on the prose, so this is an
     * exact finding and not a guess: two answers both carrying a headline called
     * "Attendance" with different numbers is either a range difference or a
     * mistake, and a document that prints both without noticing is worse than
     * one that prints neither. Reported, never resolved — deciding which is
     * right needs the range, and that is the reader's call. */
    $conflicts = [];
    foreach ($stats as $rows) {
        $seen = [];
        foreach ($rows as $r) {
            if ($r['num'] === null) continue;
            $seen[(string)$r['num']] = $r;
        }
        if (count($seen) < 2) continue;
        $vals = array_values($seen);
        $conflicts[] = [
            'label' => $vals[0]['label'],
            'values' => array_map(fn($v) => ['value' => $v['value'], 'question' => $v['question']], $vals),
        ];
    }

    $fpList = array_keys($fps); $rangeList = array_keys($ranges);
    $notes = [];
    if (count($fpList) > 1) $notes[] = ['level' => 'warn', 'text' =>
        'These ' . count($turns) . ' findings were drawn from ' . count($fpList) . ' different snapshots of the '
        . 'data, taken at different moments. They are not guaranteed to be consistent with one another, and '
        . 'nothing below reconciles them.'];
    if (count($rangeList) > 1) $notes[] = ['level' => 'warn', 'text' =>
        'They also cover ' . count($rangeList) . ' different date ranges (' . implode('; ', array_slice($rangeList, 0, 4))
        . (count($rangeList) > 4 ? '; …' : '') . '). A figure from one range does not compare with a figure from '
        . 'another, so any comparison between findings has to be made deliberately rather than read off.'];
    foreach ($conflicts as $cf) {
        $notes[] = ['level' => 'warn', 'text' =>
            'Two findings report "' . $cf['label'] . '" differently: '
            . implode(' and ', array_map(fn($v) => $v['value'], $cf['values']))
            . '. Check which range each was drawn from before quoting either.'];
    }
    if ($ungrounded) $notes[] = ['level' => 'error', 'text' =>
        count($ungrounded) . ' of these findings contain a figure that was not found in the evidence. Those are '
        . 'the model\'s arithmetic, not data, and must not be quoted as measurements.'];
    if ($dropped > 0) $notes[] = ['level' => 'method', 'text' =>
        $dropped . ' structured block(s) were withheld from these answers for citing a figure that was not in '
        . 'the evidence. The prose you are reading is what survived that check.'];
    if ($unanswerable) $notes[] = ['level' => 'method', 'text' =>
        count($unanswerable) . ' of the questions could not be answered from this evidence at all. They are kept '
        . 'here because what a dataset cannot answer is part of what it shows.'];

    return [
        'findings' => count($turns),
        'snapshots' => count($fpList), 'ranges' => array_values($rangeList),
        'mixedEvidence' => count($fpList) > 1, 'mixedRanges' => count($rangeList) > 1,
        'conflicts' => $conflicts,
        'ungrounded' => $ungrounded, 'unanswerable' => $unanswerable, 'droppedBlocks' => $dropped,
        'limitations' => array_values($caveats),
        'notes' => $notes,
    ];
}

/**
 * The one paragraph a board paper needs, written from the findings and nothing
 * else — then held to the same grounding standard as every answer.
 *
 * The model is given ONLY the pinned findings, never the underlying evidence:
 * the job is to summarise what was already checked, and handing it the raw
 * evidence would let it introduce a figure no lens ever put its name to.
 */
function irep_synthesis(array $turns, array $checks, string $title): array {
    $findings = [];
    foreach ($turns as $t) {
        $findings[] = [
            'question' => (string)$t['question'],
            'answer' => mb_substr((string)($t['answer'] ?? ''), 0, 900),
            'range' => (string)($t['rangeLabel'] ?? ''),
            'grounded' => ($t['checks']['grounded'] ?? true) !== false,
            'headlines' => array_map(fn($s) => trim(($s['value'] ?? '') . ' ' . ($s['label'] ?? '')),
                array_slice((array)($t['data']['stats'] ?? []), 0, 3)),
        ];
    }
    $sys = "You are writing the opening of a report for the people who run a children's education programme, "
         . "from findings that have already been checked against the data.\n\n"
         . "- Use ONLY these findings. Never add a point of your own and NEVER write a number that is not "
         . "already in one of them.\n"
         . "- Say what they add up to. If they point in different directions, that IS the finding — say so "
         . "plainly rather than averaging them into a sentence that is true of nothing.\n"
         . "- If the findings were drawn from different date ranges or different snapshots, do not compare "
         . "figures across them.\n"
         . "- `takeaways` are what a reader should leave with; `decisions` are what somebody could actually do "
         . "next, and only where a finding supports one. Omit decisions entirely rather than inventing them.\n"
         . "- No preamble, no restating the title, no 'this report'.\n\n"
         . "Reply with JSON only: {\"summary\":\"2-4 sentences\","
         . "\"takeaways\":[\"one sentence each, at most 4\"],"
         . "\"decisions\":[{\"do\":\"one concrete next step\",\"because\":\"which finding supports it\"}],"
         . "\"tension\":\"one sentence naming a genuine disagreement between the findings, or empty\"}";

    $r = ai_classify($sys, json_encode(['title' => $title, 'findings' => $findings,
        'mixed_ranges' => !empty($checks['mixedRanges']), 'mixed_snapshots' => !empty($checks['mixedEvidence']),
    ], JSON_UNESCAPED_SLASHES) ?: '{}', 900, ICHAT_ANSWER_PROFILE);
    if (empty($r['ok']) || !is_array($r['data'] ?? null)) {
        return ['ok' => false, 'error' => (string)($r['error'] ?? 'synthesis_failed')];
    }
    $d = $r['data'];
    $str = fn($v, $n) => mb_substr(trim((string)$v), 0, $n);
    $out = [
        'summary' => $str($d['summary'] ?? '', 1200),
        'takeaways' => array_values(array_filter(array_map(fn($x) => $str($x, 240), array_slice((array)($d['takeaways'] ?? []), 0, 4)))),
        'decisions' => [],
        'tension' => $str($d['tension'] ?? '', 300),
        'provider' => (string)($r['provider'] ?? ''),
    ];
    foreach (array_slice((array)($d['decisions'] ?? []), 0, 4) as $dec) {
        $do = $str($dec['do'] ?? '', 240);
        if ($do === '') continue;
        $out['decisions'][] = ['do' => $do, 'because' => $str($dec['because'] ?? '', 240)];
    }

    /* THE SAME GATE AS EVERY ANSWER, applied to the paragraph everybody reads
     * and nobody checks. The haystack is the FINDINGS, not the evidence: a
     * summary may only restate figures that already survived a grounding check
     * of their own. Anything with an unfindable number is DROPPED — a summary
     * carrying a warning would still be read as the summary. */
    $hay = [];
    ichat_evidence_numbers($findings, $hay);
    $bad = [];
    foreach (['summary', 'tension'] as $k) {
        if ($out[$k] === '') continue;
        $miss = ichat_ungrounded($out[$k], $hay);
        if ($miss) { $bad[] = $k . ': ' . implode(', ', $miss); $out[$k] = ''; }
    }
    $keptT = [];
    foreach ($out['takeaways'] as $x) {
        $miss = ichat_ungrounded($x, $hay);
        if ($miss) { $bad[] = 'takeaway: ' . implode(', ', $miss); continue; }
        $keptT[] = $x;
    }
    $out['takeaways'] = $keptT;
    $keptD = [];
    foreach ($out['decisions'] as $x) {
        $miss = array_merge(ichat_ungrounded($x['do'], $hay), ichat_ungrounded($x['because'], $hay));
        if ($miss) { $bad[] = 'decision: ' . implode(', ', $miss); continue; }
        $keptD[] = $x;
    }
    $out['decisions'] = $keptD;
    $out['dropped'] = $bad;
    $out['ok'] = $out['summary'] !== '' || $out['takeaways'] || $out['decisions'];
    if (!$out['ok']) $out['error'] = 'ungrounded';
    return $out;
}

/**
 * Assemble a report from chosen turns of one thread.
 *
 * `seqs` is the pinned selection, in the order the reader put them. Absent, the
 * whole thread is used. The deterministic checks always run; the synthesis is
 * skipped below IREP_MIN_FINDINGS, because one finding summarising itself is a
 * model call spent restating a paragraph.
 */
function insight_chat_report(array $p): array {
    $g = admin_gate($p);
    if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $tid = trim((string)($p['threadId'] ?? ''));
    $t = db_row("SELECT * FROM insight_threads WHERE threadId = ? LIMIT 1", [$tid]);
    if (!$t) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$t['ownerId'] !== $me) return ['ok' => false, 'error' => 'not_yours'];

    $rows = db_all("SELECT * FROM insight_turns WHERE threadId = ? ORDER BY seq ASC", [$tid]);
    $bySeq = [];
    foreach ($rows as $r) $bySeq[(int)$r['seq']] = ichat_turn_out($r);

    $want = array_values(array_filter(array_map('intval', (array)($p['seqs'] ?? []))));
    $turns = [];
    if ($want) {
        // The reader's order, not the thread's. Pin order is an editorial choice.
        foreach ($want as $s) if (isset($bySeq[$s])) $turns[] = $bySeq[$s];
    } else {
        foreach ($bySeq as $tt) if ((string)($tt['status'] ?? '') !== 'failed') $turns[] = $tt;
    }
    if (!$turns) return ['ok' => false, 'error' => 'no_findings'];

    $checks = irep_checks($turns);
    $synth = ['ok' => false, 'error' => 'too_few'];
    if (count($turns) >= IREP_MIN_FINDINGS) {
        if (!ichat_budget_ok($me)) $synth = ['ok' => false, 'error' => 'rate_limited'];
        else $synth = irep_synthesis($turns, $checks, (string)$t['title']);
    }
    audit('insight.report', $me, $tid, ['findings' => count($turns), 'synth' => !empty($synth['ok']),
        'mixed' => !empty($checks['mixedEvidence'])], (string)($p['ip'] ?? ''));

    return ['ok' => true, 'report' => [
        'threadId' => $tid, 'title' => (string)$t['title'], 'centre' => (string)$t['centre'],
        'seqs' => array_map(fn($x) => (int)$x['seq'], $turns),
        'checks' => $checks,
        'synthesis' => $synth,
        'minFindings' => IREP_MIN_FINDINGS,
    ]];
}
