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
/**
 * The content modules, in the order of the road. ONE list: eng_forms() joins it, and the test checks
 * that every module's topics are on the map and every map topic is in exactly one module. A new
 * module is one line here and one in api/_lib/bootstrap.php.
 */
const ENG_MODULES = [
    'eng_words_forms'     => 'Stage 1 · Words and Sentences',
    'eng_grammar_forms'   => 'Stages 2 and 4 · Structure',
    'eng_sounds_forms'    => 'Stage 3 · The Sounds of English',
    'eng_reading_forms'   => 'Stage 5 · Reading and Meaning',
    'eng_writing_forms'   => 'Stage 6 · Writing Well',
    'eng_wordpower_forms' => 'Stage 7 · Word Power',
    'eng_senior_forms'    => 'Stage 8 · The Senior Paper',
];

function eng_forms(): array {
    static $f = null;
    if ($f !== null) return $f;
    $f = [];
    foreach (array_keys(ENG_MODULES) as $fn) $f += $fn();
    // Forms one module adds to another's topic (articulation questions on the sound topics), APPENDED
    // after that topic's own forms, so no existing form changes its number.
    foreach (eng_articulation_forms() as $id => $extra) if (isset($f[$id])) $f[$id] = array_merge($f[$id], $extra);
    // The exam-trap drills (englishlab-drill.php), appended after everything else for the same reason.
    foreach (eng_drill_forms() as $id => $extra) if (isset($f[$id])) $f[$id] = array_merge($f[$id], $extra);
    // More questions for the thinnest topics (englishlab-more.php), appended last for the same reason.
    if (function_exists('eng_more_forms')) foreach (eng_more_forms() as $id => $extra) if (isset($f[$id])) $f[$id] = array_merge($f[$id], $extra);
    ksort($f);
    return $f;
}

/**
 * The passage bank: every reading passage in the Lab, written once and read by any module (the
 * Reading stage, the Senior Paper's comprehension and summary topics). Our own texts, short enough
 * for a phone, set where a Nigerian learner will recognise them. Append-only, like everything here.
 */
function eng_passage(string $id): string {
    static $P = [
        'market' => 'By six in the morning, the market at Oja-Oba is already loud. Traders unload baskets of tomatoes, women balance trays of bread on their heads, and buyers argue cheerfully over prices. By noon the crowd thins, and by dusk only the sweepers remain.',
        'water' => 'Our village once walked two hours each day to fetch water from the stream. Since the borehole was dug last year, girls who used to miss the first lesson now arrive before the bell, and the clinic reports fewer cases of typhoid.',
        'phone' => 'Mobile phones have changed how farmers sell their crops. Instead of accepting whatever price a middleman offers, a farmer in Benue can now call three markets, compare prices, and send her yams to the best one.',
        'reading' => 'Uche did not like books until his uncle gave him a novel about a boy who sailed down the Niger. He finished it in two nights. Now he spends his pocket money at the second-hand bookseller near the motor park.',
        'harmattan' => 'When the harmattan arrives, the sky turns a dusty grey and the mornings are suddenly cold. Lips crack, skin dries, and dust settles on every table no matter how often it is wiped.',
        'solar' => 'Many households now use small solar panels. They cost money at first, but they need no fuel, make no noise and keep a phone and two bulbs going through a power cut. Their weakness is the rainy season, when cloudy days leave the batteries half charged.',
        'traffic' => 'Okada riders say the ban on motorcycles in parts of the city has cost them their living. Commuters, however, report fewer accidents and quieter roads, though many now walk long distances to reach a bus stop. The government says it will add more buses before extending the ban.',
        'library' => 'When the community library opened, only a handful of pupils came. The librarian began a Saturday reading club, invited parents to the first meeting and let children borrow two books at a time. Within a term, the reading room was full every weekend.',
    ];
    return $P[$id] ?? '';
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
 * the correction (empty when the part should simply go), why, optional per-part reasons]. The parts are the options; the corrected sentence is in the steps.
 */
function eng_spot(array $rows, string $hint, string $dim = 'reasoning', int $secs = 40): Closure {
    return static function (MlbRng $r) use ($rows, $hint, $dim, $secs): array {
        $row = eng_row($r, $rows);
        [$parts, $bad, $fix, $why] = $row;
        $partReasons = $row[4] ?? [];
        $wrong = [];
        foreach ($parts as $i => $p) if ($i !== $bad) $wrong[] = [$p, $partReasons[$i] ?? 'That part is correct as it stands.'];
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
