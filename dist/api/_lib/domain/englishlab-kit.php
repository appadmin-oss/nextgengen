<?php
declare(strict_types=1);

/**
 * English Lab — the kit (owner, 6 Nov 2026: "build the engine. Make it modular").
 *
 * The Lab engine (domain/mathslab.php) is shared by every Lab and is NOT copied here. What English
 * adds is a small set of question BUILDERS, so a topic is declared as data — rows of real English —
 * and the kit turns each table into a form the engine already knows how to run, mark and record:
 *
 *   eng_choose()  a multiple choice: each wrong option a named slip, as every Lab's MCQ is;
 *   eng_type()    a typed word or sentence, marked by the shared `text` kind (mlb_mark);
 *   eng_spot()    "which part of this sentence is wrong?" — the reasoning format for language;
 *   eng_order()   "put these words in order" — the engine's move-button ordering, never a drag;
 *   eng_derive()  a form whose options are DERIVED from a rule (a plural, a past tense), so a
 *                 wrong option is the regular-rule slip a learner actually makes.
 *
 * Content never contains a dollar sign: the Lab's screen reads $…$ as mathematics.
 *
 * The content lives in five modules, one per strand of the road (englishlab-words, -grammar,
 * -sounds, -reading, -writing). Each returns topic id → forms; eng_forms() joins them. Adding a
 * topic is one entry in the map and one in a module; adding a module is one line here and one in
 * api/_lib/bootstrap.php. Rules every form follows (tested in api/tests/run.php):
 *   · the key marks itself right, a typed form has at least two different answers across seeds,
 *     a choice offers at least three distinct options, and the key never reaches the browser;
 *   · every question teaches: a hint, and steps that say WHY the answer is right;
 *   · APPEND ONLY: a session stores (topic, form, seed), so a form keeps its number for ever and a
 *     row keeps its place in its table — new rows and new forms go at the END;
 *   · no exam body is named anywhere a learner reads.
 *
 * Free writing (an essay, a whole letter) is NOT marked here: it needs judgement, and the instant
 * marker gives none. The Writing module teaches it in parts that can be marked — a letter's layout,
 * a topic sentence, a joined sentence — and docs/LABS.md says where a judged essay would go.
 */

/** The English Lab's forms: topic id → forms. The engine reads them only through lab_call('forms'). */
function eng_forms(): array {
    static $f = null;
    if ($f !== null) return $f;
    return $f = eng_words_forms() + eng_grammar_forms() + eng_sounds_forms() + eng_reading_forms() + eng_writing_forms();
}

/** A row picked by the seed. Rows are data; their order is append-only (a session replays by seed). */
function eng_row(MlbRng $r, array $rows): array { return $rows[$r->int(0, count($rows) - 1)]; }

/**
 * A multiple choice from rows of [question, right answer, [[wrong, why it is tempting], …], why the
 * right one is right]. $stem may carry {q}; empty means the row's question IS the stem.
 */
function eng_choose(array $rows, string $stem, string $hint, string $dim = 'concept', int $secs = 30): Closure {
    return static function (MlbRng $r) use ($rows, $stem, $hint, $dim, $secs): array {
        [$q, $right, $wrong, $why] = eng_row($r, $rows);
        $st = $stem === '' ? $q : str_replace('{q}', $q, $stem);
        return mlb_mcq($r, $st, $right, $wrong, [$why, 'Answer: ' . $right . '.'], $hint, $dim, $secs);
    };
}

/**
 * A typed answer from rows of [question, answer, [other accepted answers], why]. $opt: 'case' and
 * 'punct' make capitals or the final punctuation part of the skill; 'unit' is not used here.
 */
function eng_type(array $rows, string $stem, string $hint, string $dim = 'procedure', int $secs = 40, array $opt = []): Closure {
    return static function (MlbRng $r) use ($rows, $stem, $hint, $dim, $secs, $opt): array {
        [$q, $key, $accept, $why] = eng_row($r, $rows);
        $st = $stem === '' ? $q : str_replace('{q}', $q, $stem);
        return mlb_typed('text', $st, $key, [$why, 'Answer: ' . $key], $hint, $dim, $secs,
            ['accept' => $accept] + array_intersect_key($opt, ['case' => 1, 'punct' => 1]));
    };
}

/**
 * Spot the error in a sentence from rows of [[the sentence in parts], index of the wrong part,
 * the correction (empty when the part should simply go), why]. The parts are the options; the corrected sentence is in the steps.
 */
function eng_spot(array $rows, string $hint, string $dim = 'reasoning', int $secs = 40): Closure {
    return static function (MlbRng $r) use ($rows, $hint, $dim, $secs): array {
        [$parts, $bad, $fix, $why] = eng_row($r, $rows);
        $wrong = [];
        foreach ($parts as $i => $p) if ($i !== $bad) $wrong[] = [$p, 'That part is correct as it stands.'];
        $fixed = $parts; $fixed[$bad] = $fix;
        return mlb_mcq($r, 'One part of this sentence has a mistake. Which part? “' . implode(' ', $parts) . '”', $parts[$bad], $wrong,
            [$why, 'Corrected: “' . implode(' ', array_filter($fixed, static fn($x) => $x !== '')) . '”'], $hint, $dim, $secs);
    };
}

/** Put the pieces in order, from rows of [[the pieces, in the right order], why]. Never a drag. */
function eng_order(array $rows, string $stem, string $hint, string $dim = 'procedure', int $secs = 50): Closure {
    return static function (MlbRng $r) use ($rows, $stem, $hint, $dim, $secs): array {
        [$pieces, $why] = eng_row($r, $rows);
        $n = count($pieces); $perm = range(0, $n - 1);
        do { $perm = $r->shuffle($perm); } while ($perm === range(0, $n - 1));
        $options = array_map(static fn($i) => $pieces[$i], $perm);
        $key = array_map(static fn($i) => array_search($i, $perm, true), range(0, $n - 1));
        return ['kind' => 'order', 'stem' => $stem, 'options' => $options, 'key' => $key,
            'steps' => [$why, 'In order: ' . implode(' ', $pieces)], 'hint' => $hint, 'dim' => $dim, 'secs' => $secs, 'typed' => false];
    };
}

/**
 * A form built by a function of the row and the seed, for answers DERIVED from a rule — a plural, a
 * past tense, a comparative — where the wrong options are the rule misapplied. $make(MlbRng, row).
 */
function eng_derive(array $rows, Closure $make): Closure {
    return static function (MlbRng $r) use ($rows, $make): array { return $make($r, eng_row($r, $rows)); };
}

/* ── Rules the derived forms use: written once, so a slip offered as a wrong option is the slip
      a learner makes by applying the regular rule where English breaks it. ── */

/** The regular plural a learner reaches for: -es after s/x/z/ch/sh, -ies after a consonant + y, else -s. */
function eng_regular_plural(string $w): string {
    if (preg_match('/(s|x|z|ch|sh)$/', $w)) return $w . 'es';
    if (preg_match('/[^aeiou]y$/', $w)) return substr($w, 0, -1) . 'ies';
    return $w . 's';
}

/** The regular past a learner reaches for: -d after e, double a short final consonant, -ied after consonant + y, else -ed. */
function eng_regular_past(string $v): string {
    if (str_ends_with($v, 'e')) return $v . 'd';
    if (preg_match('/[^aeiou]y$/', $v)) return substr($v, 0, -1) . 'ied';
    return $v . 'ed';
}
