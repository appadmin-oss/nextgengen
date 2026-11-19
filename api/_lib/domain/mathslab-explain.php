<?php
declare(strict_types=1);

/**
 * "Why was mine wrong?" — the Labs' explanation of ONE wrong typed answer (AI audit §1, 13 Nov 2026).
 *
 * A wrong multiple-choice pick already gets its authored misconception (mlb_mark's `whys`); a wrong
 * TYPED answer got only the key and the generic worked steps — so the learner who typed 226 for 236 was
 * told the same thing as the one who typed 9. Explaining this answer is the job rules do worst, and the
 * job language models are tempting for. The evidence says both: LLM feedback helps when learners choose
 * to open it (arXiv 2506.17006), but about a third of GPT-4's error-specific hints were too general,
 * wrong or gave the answer away (Reddig et al., IJAIED 2025), and accuracy falls with more than one slip.
 * So, in this order:
 *
 *   1. CODE diagnoses the slips that can be recognised exactly: the sign, a power of ten, one off, the
 *      digits swapped, stopping at an earlier line of the working, the wrong operation on the
 *      question's own numbers. Exact, instant, free, and right every time it fires.
 *   2. Only if none fits, the AI is asked — given the question, the key, the worked steps and the
 *      learner's answer — for one or two sentences naming the likeliest slip.
 *   3. CODE checks the AI: a reply that brings in a number found nowhere in the question, the working
 *      or the learner's answer is thrown away (the hallucination the research measured), and the
 *      learner is pointed at the first line of the working instead.
 *
 * Practice only, opened by the learner, never during a check, boss, exam, placement or quick check —
 * practice already shows the answer and the working, so nothing is given away. Nothing about the child
 * leaves the server: no name, no id. A call that reaches the AI spends the shared daily tutor allowance.
 */

function mlb_explain_nums(string $s): array {
    preg_match_all('/-?\d+(?:\.\d+)?/', str_replace(',', '', $s), $m);
    return array_map('floatval', $m[0]);
}
function mlb_explain_has(array $pool, float $v): bool {
    foreach ($pool as $x) if (abs($x - $v) < 1e-6 * max(1, abs($v))) return true;
    return false;
}

/** The deterministic diagnosis, or null. $a = the learner's number, $k = the key. */
function mlb_explain_rule(float $a, float $k, array $it): ?string {
    $fmt = static fn(float $x): string => rtrim(rtrim(number_format($x, 6, '.', ''), '0'), '.');
    if ($k != 0.0 && abs($a + $k) < 1e-9) return 'Your answer has the right size but the wrong sign. Check each minus sign — a subtraction or a negative number has slipped.';
    foreach ([10, 100, 1000] as $p) {
        if ($k != 0.0 && (abs($a - $k * $p) < 1e-6 * max(1, abs($k * $p)) || abs($a - $k / $p) < 1e-9 * max(1, abs($k)))) {
            return 'Your digits are right but the size is ' . ($a > $k ? $p . ' times too big' : $p . ' times too small') . '. Check the place value — or the units, if the question changes them.';
        }
    }
    if (abs(abs($a - $k) - 1) < 1e-9 && floor($k) == $k) return 'Just one ' . ($a > $k ? 'too many' : 'too few') . '. That is usually counting the starting number, or missing the last one — check where you began.';
    $sa = $fmt(abs($a)); $sk = $fmt(abs($k));
    if (strlen($sa) === strlen($sk) && strlen($sa) > 1 && $sa !== $sk && count_chars($sa, 1) == count_chars($sk, 1)) return 'You have the right digits in the wrong order. Write the answer slowly, digit by digit, against the working.';
    // Stopped at an earlier line of the working.
    foreach (array_values((array)($it['steps'] ?? [])) as $n => $line) {
        $nums = mlb_explain_nums((string)$line);
        if ($nums && abs(end($nums) - $a) < 1e-6 * max(1, abs($a)) && $n < count((array)$it['steps']) - 1) {
            return 'Your answer is what line ' . ($n + 1) . ' of the working gets to — you stopped one step early. Read the question again: what does it actually ask for?';
        }
    }
    // The wrong operation on the question's own numbers.
    $q = array_values(array_unique(mlb_explain_nums(is_string($it['stem'] ?? null) ? (string)$it['stem'] : '')));
    $q = array_slice($q, 0, 6);
    for ($i = 0; $i < count($q); $i++) for ($j = 0; $j < count($q); $j++) {
        if ($i === $j) continue; $x = $q[$i]; $y = $q[$j];
        foreach (['+' => $x + $y, '−' => $x - $y, '×' => $x * $y, '÷' => $y != 0.0 ? $x / $y : null] as $op => $v) {
            if ($v !== null && abs($v - $a) < 1e-6 * max(1, abs($a)) && abs($v - $k) > 1e-9) {
                return 'Your answer is ' . $fmt($x) . ' ' . $op . ' ' . $fmt($y) . '. The question needs a different operation — say in words what is happening (joining? taking away? sharing? groups of?) before you choose one.';
            }
        }
    }
    return null;
}

/** The fallback that is always true: where to look, not what to think. */
function mlb_explain_fallback(array $it): string {
    $n = count((array)($it['steps'] ?? []));
    return $n ? 'Put your working next to the steps above and find the first line where yours goes a different way — the slip is there, not at the end.'
              : 'Compare your answer with the right one: is it too big, too small, or a different kind of answer? That tells you which step to check.';
}

/** mathslab.explain {sessionId, index} → {ok, text, source: rule|ai|guide} */
function mlb_explain(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId'];
    $s = mlb_session($mid, (string)($p['sessionId'] ?? '')); if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$s['mode'] !== 'practice') return ['ok' => false, 'error' => 'practice_only'];
    $items = json_decode((string)$s['items'], true) ?: []; $resp = json_decode((string)$s['resp'], true) ?: [];
    $i = (int)($p['index'] ?? -1);
    if (!isset($items[$i], $resp[$i])) return ['ok' => false, 'error' => 'not_answered'];
    if (!empty($resp[$i]['ok'])) return ['ok' => false, 'error' => 'was_right'];
    $x = $items[$i]; $it = mlb_item($x['c'], $x['f'], $x['s']);
    if (!$it || in_array($it['kind'], ['mcq', 'error', 'order'], true)) return ['ok' => false, 'error' => 'not_typed'];
    $mine = is_array($resp[$i]['a'] ?? null) ? implode(', ', $resp[$i]['a']) : trim((string)($resp[$i]['a'] ?? ''));
    if ($mine === '') return ['ok' => true, 'text' => 'You left it empty — have a go at the next one, even if you are unsure. A wrong try teaches more than a blank.', 'source' => 'rule'];

    // 1. Code first.
    $a = function_exists('mlb_parse_num') ? mlb_parse_num($mine) : (is_numeric($mine) ? (float)$mine : null);
    if ($a !== null && $it['kind'] === 'num' && is_numeric($it['key'])) {
        $rule = mlb_explain_rule((float)$a, (float)$it['key'], $it);
        if ($rule) return ['ok' => true, 'text' => $rule, 'source' => 'rule'];
    }
    // 2. The AI, if it is switched on and today's allowance has room.
    $text = null;
    if (($used = mlb_tutor_take($mid)) !== null) {   // the shared allowance (mathslab-walk.php)
            $stem = is_string($it['stem'] ?? null) ? (string)$it['stem'] : (string)json_encode($it['stem']);
            $steps = implode("\n", array_map('strval', (array)($it['steps'] ?? [])));
            $sys = 'You explain ONE wrong answer to a 10–17 year old learner in Nigeria. Name the single most likely slip that '
                 . 'produces exactly their answer, in at most two short sentences, plain British English. Do NOT restate the full '
                 . 'solution, do NOT give the right answer again (they can already see it), do NOT praise or scold. If you cannot '
                 . 'tell how their answer arose, say which line of the working to compare with theirs.';
            $r = ai_chat($sys, [['role' => 'me', 'text' => "Question: $stem\nRight answer: " . mlb_answer_text($it) . "\nWorked steps:\n$steps\nTheir answer: $mine"]], 160, 'coach');
            if (!empty($r['ok'])) $text = trim((string)$r['text']);
            else mlb_tutor_refund($mid, $used);   // a failed call is given back
    }
    // 3. Code checks the AI: no number from nowhere, no length to hide one in.
    if ($text !== null) {
        $pool = array_merge(mlb_explain_nums(is_string($it['stem'] ?? null) ? (string)$it['stem'] : ''), mlb_explain_nums(implode(' ', (array)($it['steps'] ?? []))),
                            mlb_explain_nums($mine), mlb_explain_nums(mlb_answer_text($it)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        foreach (mlb_explain_nums($text) as $v) if (!mlb_explain_has($pool, $v)) { $text = null; break; }
        if ($text !== null && (mb_strlen($text) > 400 || $text === '')) $text = null;
        if ($text !== null) return ['ok' => true, 'text' => $text, 'source' => 'ai'];
    }
    return ['ok' => true, 'text' => mlb_explain_fallback($it), 'source' => 'guide'];
}
