<?php
declare(strict_types=1);

/**
 * "Work through one with Guide": the Labs' guided question for a learner who is STUCK (AI audit item 2,
 * 13 Nov 2026). Offered from the stuck card (mlb_stuck: no three right in a row in the last ten), never
 * unasked.
 *
 * The evidence decides the shape. In a field experiment with nearly a thousand high-school maths students,
 * an unguarded GPT-4 raised practice grades and then left them about 17% WORSE on the exam taken without
 * it; most of them had simply asked it for answers. A tutor prompted to give hints and not answers did no
 * such harm (Bastani et al., PNAS 2025). In a randomised trial of human tutors, an AI that suggested what
 * to say raised mastery 4 points (9 for the weakest tutors' students) by giving FEWER answers away and
 * asking MORE probing questions (Tutor CoPilot, Wang et al. 2024). So:
 *
 *   · Guide works on a FRESH question of the same topic. The question just missed already shows its
 *     answer and working (it is practice), so coaching towards it would coach towards something on
 *     screen. A new one, with the key held back, means the learner does the work.
 *   · CODE holds the ladder, one rung per turn: the authored hint; then the working one line at a time,
 *     stopping before any line that carries the answer; then the whole working, and "now try one on
 *     your own". The learner climbs only as far as they need.
 *   · The AI only PHRASES the rung it is handed, answering what the learner said in one sentence. It is
 *     never given the key. Code checks every reply: one that states the answer, or a number the
 *     question and the lines revealed so far do not contain, is thrown away for the rung's own words.
 *   · The guided question is NEVER marked. It does not move the topic's mastery or count towards
 *     "three in a row" — help must not read as knowing. The one that counts is the next, unaided one.
 *   · At most four AI turns per guided question, spending the shared daily tutor allowance; a failed
 *     call is given back. What the learner types is checked for a disclosure first (safeguard_check).
 *     Nothing about the child is sent: no name, no id.
 *
 * State lives in member_state (`mlb.walk.<sessionId>`), so there is no new table.
 */

const MLB_WALK_AI_TURNS = 4;

/** The daily tutor allowance shared by Explain, Guide and the Learn tutor: take one, or null if spent. */
function mlb_tutor_take(string $mid): ?int {
    if (!function_exists('ai_enabled') || !ai_enabled('coach')) return null;
    $key = 'ai.tutor.' . gmdate('Y-m-d');
    $used = (int)(db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [$mid, $key])['stateValue'] ?? 0);
    if ($used >= (defined('CURR_TUTOR_PER_DAY') ? CURR_TUTOR_PER_DAY : 20)) return null;
    db_upsert('member_state', ['memberId' => $mid, 'stateKey' => $key, 'stateValue' => (string)($used + 1), 'updatedAt' => now_iso()], ['memberId', 'stateKey'], ['stateValue' => (string)($used + 1), 'updatedAt' => now_iso()]);
    return $used;
}
function mlb_tutor_refund(string $mid, int $used): void {
    db_exec('UPDATE member_state SET stateValue = ? WHERE memberId = ? AND stateKey = ?', [(string)$used, $mid, 'ai.tutor.' . gmdate('Y-m-d')]);
}

/** The lines of the working that do not give the answer away, in order. */
function mlb_walk_safe_steps(array $it): array {
    $ans = mb_strtolower(trim(mlb_answer_text($it)));
    $keyNums = in_array($it['kind'], ['num', 'pair'], true) ? array_map('floatval', (array)$it['key']) : mlb_explain_nums($ans);
    $out = [];
    foreach ((array)($it['steps'] ?? []) as $line) {
        $line = (string)$line; $low = mb_strtolower($line);
        if ($ans !== '' && mb_strlen($ans) >= 2 && str_contains($low, $ans)) break;
        $leak = false; foreach (mlb_explain_nums($line) as $v) if ($keyNums && mlb_explain_has($keyNums, $v)) { $leak = true; break; }
        if ($leak) break;          // from here on the working reaches the answer
        $out[] = $line;
    }
    return $out;
}

/** The rung's own words: what the learner sees when the AI is off, spent, or not trusted. */
function mlb_walk_rung(array $it, int $rung): array {
    $safe = mlb_walk_safe_steps($it);
    if ($rung === 0) return ['say' => 'Start here: ' . (string)$it['hint'] . ' Have a go, then check it.', 'reveal' => false];
    if ($rung <= count($safe)) {
        $lead = $rung === 1 ? 'The first line of the working is' : 'The next line is';
        return ['say' => $lead . ': ' . $safe[$rung - 1] . ' What comes after that?', 'reveal' => false];
    }
    return ['say' => 'Here is the whole working. Read it line by line — then try one like it on your own; that is the one that counts.', 'reveal' => true];
}

/** True when an AI reply is safe to show: no answer, no number from nowhere, short. */
function mlb_walk_reply_ok(string $text, array $it, int $rung, string $said): bool {
    if ($text === '' || mb_strlen($text) > 360) return false;
    $ans = mb_strtolower(trim(mlb_answer_text($it)));
    if ($ans !== '' && mb_strlen($ans) >= 2 && str_contains(mb_strtolower($text), $ans)) return false;
    $keyNums = in_array($it['kind'], ['num', 'pair'], true) ? array_map('floatval', (array)$it['key']) : mlb_explain_nums($ans);
    $stem = is_string($it['stem'] ?? null) ? (string)$it['stem'] : (string)json_encode($it['stem'] ?? '');
    $shown = array_slice(mlb_walk_safe_steps($it), 0, max(0, $rung));
    $seen = array_merge(mlb_explain_nums($stem), mlb_explain_nums(implode(' ', $shown)), mlb_explain_nums($said));
    $pool = array_merge($seen, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    /* A number found only in a line not yet revealed is that line leaking — small numbers included, or
       "9 take away 3 gives 6" walks the learner through the units column the ladder was holding back. */
    $hidden = array_values(array_filter(mlb_explain_nums(implode(' ', array_slice((array)($it['steps'] ?? []), max(0, $rung)))), static fn($v) => !mlb_explain_has($seen, $v)));
    foreach (mlb_explain_nums($text) as $v) {
        if ($hidden && mlb_explain_has($hidden, $v)) return false;
        if ($keyNums && mlb_explain_has($keyNums, $v) && !mlb_explain_has(mlb_explain_nums($stem), $v)) return false;   // the answer itself
        if (!mlb_explain_has($pool, $v)) return false;                                                                   // a later line, or invented
    }
    return true;
}

function mlb_walk_state_key(string $sid): string { return 'mlb.walk.' . $sid; }

/**
 * mathslab.walk {sessionId, step: 'start'}                → {ok, item, say, rung, rungs}
 * mathslab.walk {sessionId, step: 'turn', answer?|message?} → {ok, say, rung, rungs, done, right?, answer?, steps?, source}
 */
function mlb_walk(array $p): array {
    $m = mlb_member($p); if (!$m) return ['ok' => false, 'error' => 'members_only'];
    $mid = (string)$m['memberId'];
    $s = mlb_session($mid, (string)($p['sessionId'] ?? '')); if (!$s) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$s['mode'] !== 'practice') return ['ok' => false, 'error' => 'practice_only'];
    $comp = (string)$s['ref']; $sk = mlb_walk_state_key((string)$s['sessionId']);
    $action = (string)($p['step'] ?? 'turn');   // 'action' is the route's own key

    if ($action === 'start') {
        $picked = mlb_pick_fresh(mlb_recent_seen($mid), [$comp], 1, true);
        if (!$picked) return ['ok' => false, 'error' => 'nothing_fresh'];
        $x = $picked[0]; $it = mlb_item($x['c'], $x['f'], $x['s']);
        $g = ['c' => $x['c'], 'f' => $x['f'], 's' => $x['s'], 'rung' => 0, 'ai' => 0, 'done' => false];
        db_upsert('member_state', ['memberId' => $mid, 'stateKey' => $sk, 'stateValue' => json_encode($g), 'updatedAt' => now_iso()], ['memberId', 'stateKey'], ['stateValue' => json_encode($g), 'updatedAt' => now_iso()]);
        $r = mlb_walk_rung($it, 0);
        return ['ok' => true, 'item' => mlb_public($it), 'say' => $r['say'], 'rung' => 0, 'rungs' => count(mlb_walk_safe_steps($it)) + 2, 'source' => 'guide'];
    }

    $g = json_decode((string)(db_row('SELECT stateValue FROM member_state WHERE memberId = ? AND stateKey = ?', [$mid, $sk])['stateValue'] ?? ''), true);
    if (!is_array($g) || !isset($g['c'])) return ['ok' => false, 'error' => 'no_guide'];
    if (!empty($g['done'])) return ['ok' => false, 'error' => 'guide_done'];
    $it = mlb_item((string)$g['c'], (int)$g['f'], (int)$g['s']); if (!$it) return ['ok' => false, 'error' => 'no_guide'];
    $rungs = count(mlb_walk_safe_steps($it)) + 2;
    $save = static function (array $g) use ($mid, $sk): void { db_update('member_state', ['stateValue' => json_encode($g), 'updatedAt' => now_iso()], ['memberId' => $mid, 'stateKey' => $sk]); };
    $finish = static fn(array $extra) => $extra + ['ok' => true, 'done' => true, 'rungs' => $rungs, 'answer' => mlb_answer_text($it), 'steps' => $it['steps']];

    $said = mb_substr(trim((string)($p['message'] ?? '')), 0, 400);
    if ($said !== '' && function_exists('safeguard_check')) {
        $sg = safeguard_check($said, $m, 'the Labs Guide');
        if ($sg) { $g['done'] = true; $save($g); return ['ok' => true, 'done' => true, 'say' => $sg['reply'], 'safeguarding' => true, 'rung' => (int)$g['rung'], 'rungs' => $rungs, 'source' => 'safeguarding']; }
    }
    $hasAnswer = array_key_exists('answer', $p) && !(is_string($p['answer']) && trim($p['answer']) === '');
    if ($hasAnswer) {
        $mk = mlb_mark($it, $p['answer']);
        if ($mk['ok']) {
            $g['done'] = true; $save($g);
            $say = (int)$g['rung'] <= 1 ? 'That’s it — and you needed only the first nudge. Now one on your own.' : 'That’s it — you worked it through. Now try one like it on your own: that is the one that counts.';
            return $finish(['say' => $say, 'right' => true, 'rung' => (int)$g['rung'], 'source' => 'guide']);
        }
        if (!empty($mk['why'])) $said = trim($said . ' (I chose an answer that was wrong.)');
    }

    // Up one rung.
    $g['rung'] = (int)$g['rung'] + 1;
    $rung = mlb_walk_rung($it, $g['rung']);
    if ($rung['reveal']) { $g['done'] = true; $save($g); return $finish(['say' => $rung['say'], 'right' => false, 'rung' => $g['rung'], 'source' => 'guide']); }

    // The AI may put the rung in its own words, answering what the learner said. Code checks it.
    $text = null; $source = 'guide';
    if ((int)$g['ai'] < MLB_WALK_AI_TURNS && ($used = mlb_tutor_take($mid)) !== null) {
        $g['ai'] = (int)$g['ai'] + 1;
        $stem = is_string($it['stem'] ?? null) ? (string)$it['stem'] : (string)json_encode($it['stem']);
        $mine = $hasAnswer ? (is_array($p['answer']) ? implode(', ', $p['answer']) : (string)$p['answer']) : '';
        $sys = 'You are Guide, helping a 10–17 year old learner in Nigeria work through ONE question themselves. You are given the '
             . 'NEXT HINT. Reply in at most two short sentences of plain British English: one to acknowledge what they said or tried '
             . '(without praise or blame), then the hint, ending with a question that makes them do the next step. Never give the '
             . 'answer, never work beyond the hint, never add numbers that are not in the question or the hint.';
        $msg = "Question: $stem\nNext hint: " . $rung['say'] . ($mine !== '' ? "\nThey tried: $mine" : '') . ($said !== '' ? "\nThey said: $said" : "\nThey asked for the next hint.");
        $r = ai_chat($sys, [['role' => 'me', 'text' => $msg]], 140, 'coach');
        if (!empty($r['ok'])) {
            $t = trim((string)$r['text']);
            $echo = $said . ' ' . $mine;
            if (mlb_walk_reply_ok($t, $it, (int)$g['rung'], $echo)) { $text = $t; $source = 'ai'; }
        } else mlb_tutor_refund($mid, $used);
    }
    $save($g);
    $lead = $hasAnswer ? 'Not yet. ' : '';
    return ['ok' => true, 'done' => false, 'say' => $text ?? ($lead . $rung['say']), 'rung' => $g['rung'], 'rungs' => $rungs, 'right' => $hasAnswer ? false : null, 'source' => $source];
}
