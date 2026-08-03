<?php
declare(strict_types=1);

/**
 * Baseline and endline — measuring learning rather than inferring it.
 *
 * WHY THIS EXISTS. This system could already report an average coursework
 * grade, and a trend across coursework grades is not a learning gain. The tasks
 * differ, the markers differ, the difficulty drifts week to week, and the
 * children who submit in week eight are not the children who submitted in week
 * one. "Grades went up nine points" is a sentence that survives exactly one
 * question from anybody who reads evidence for a living.
 *
 * What a funder means by "we measured learning" is narrow and specific: the
 * SAME instrument, administered TWICE to the SAME children, with the difference
 * computed per child. That is what this file does, and the four decisions below
 * are the reason it can be defended rather than merely produced.
 *
 * ── 1. THE PAIR IS THE UNIT, NOT THE MEAN ────────────────────────────────────
 * Comparing the baseline mean of everyone to the endline mean of everyone is a
 * different and much weaker claim, because the endline group is the survivors.
 * If the children who left were the strugglers, that comparison shows a gain
 * created entirely by their absence. So the headline is the mean of
 * (endline − baseline) over children who sat BOTH, and everything else is
 * reported around it.
 *
 * ── 2. ATTRITION IS REPORTED, NOT NETTED OUT ─────────────────────────────────
 * The first question a reviewer asks is "who dropped out, and were they
 * different?". So the analysis compares the BASELINE scores of the children who
 * came back against the baseline scores of the children who did not. If the
 * leavers were weaker, the gain is inflated and the report says so in those
 * words. A pre/post figure without this is not evidence, it is a hope.
 *
 * ── 3. ABSENT IS NOT ZERO ────────────────────────────────────────────────────
 * A child who did not sit the test did not score nothing; they have no score.
 * Recording absence as 0 drags the mean down and converts an attendance problem
 * into a learning finding. `absent` is its own column.
 *
 * ── 4. AN INSTRUMENT LOCKS ───────────────────────────────────────────────────
 * Revising a test after baseline makes every existing pair incomparable, and
 * the revision is invisible in the numbers. The instrument locks the moment its
 * first result is recorded; a change after that is a NEW instrument with its
 * own version, which forces the incomparability into the open where somebody
 * has to decide about it.
 */

const ASSESS_DOMAINS = ['literacy', 'numeracy', 'sel', 'gender_attitudes', 'other'];
const ASSESS_PHASES  = ['baseline', 'midline', 'endline'];
/** Below this a mean is a rumour. Same discipline as everywhere else here. */
const ASSESS_MIN_N   = 5;

/**
 * What KIND of number an instrument produces — and therefore what may be said
 * about it.
 *
 *  points — a mark out of a fixed total. Percent of the maximum is meaningful.
 *  rate   — a speed, typically per minute. There is no maximum, so a percentage
 *           of one is a number with nothing behind it; report the unit.
 *  level  — an ordinal ladder (cannot read → letters → words → paragraph →
 *           story). The steps are ordered but not equally spaced, so the mean
 *           of a ladder is a convenience, not a measurement. Report movement
 *           between levels, and say which it is.
 */
const ASSESS_SCALES = ['points', 'rate', 'level'];

function assess_scale_label(string $s): string {
    return ['points' => 'Marks out of a total', 'rate' => 'Rate per minute', 'level' => 'Ordinal level'][$s] ?? 'Marks out of a total';
}
/** Only a mark out of a total can honestly be shown as a percentage. */
function assess_pct_meaningful(string $scale): bool { return $scale === 'points'; }

/** Whoever runs the programme records the scores; whoever reads the analysis
 *  needs the roster capability either way. */
function assess_gate(array $p) { return admin_cap_gate($p, 'summer'); }

function assess_domain_label(string $d): string {
    return ['literacy' => 'Literacy', 'numeracy' => 'Numeracy', 'sel' => 'Social & emotional',
            'gender_attitudes' => 'Gender attitudes', 'other' => 'Other'][$d] ?? 'Other';
}

/* ── The catalogue of published instruments ──────────────────────────────────
 *
 * "We built our own test" is the weakest sentence in an evidence section. The
 * funds this programme applies to ask for validated methods and tools by name,
 * and the tools that satisfy that already exist, are already free, and are
 * already cited in thousands of evaluations. What was missing here was not the
 * machinery to run one — that shipped with this file — but the shortlist, with
 * its provenance attached, so the choice is made once and travels with every
 * number it produces.
 *
 * THREE THINGS THIS CATALOGUE DELIBERATELY IS NOT.
 *
 * It is not an item bank. There are no words to read and no sums to solve in
 * here, and there should not be: an EGRA word list is language-specific and has
 * to be built and piloted locally, and a generic one imported from another
 * country's toolkit measures the wrong thing while looking rigorous. Every
 * entry carries an `adapt` note saying what has to be produced locally before
 * the instrument is fit to administer.
 *
 * It is not a licence opinion. `licence` records what the publisher says about
 * reuse, and a programme about to publish results should confirm it at the
 * source rather than trust a string in a PHP file.
 *
 * It is not a default. Adopting an instrument is an explicit act with an audit
 * entry, because the choice of measure is a programme decision with
 * consequences for what can be claimed, not a checkbox.
 *
 * ONE INSTRUMENT PER SUBTASK. EGRA's subtasks are not components of a total:
 * oral reading fluency is correct words per minute and reading comprehension is
 * a count out of five. Summing them produces a number in no unit at all, and
 * the standard practice is to report each subtask separately. So each subtask
 * adopts as its own instrument, with its own unit, scale and window.
 */

const ASSESS_CATALOGUE = [
    /* ── EGRA — RTI International for USAID ─────────────────────────────────
     * The most widely used early-grade reading measure in low- and middle-
     * income countries, and the one a reviewer is most likely to recognise. */
    [
        'key' => 'egra.letter_sound', 'family' => 'EGRA', 'name' => 'EGRA · Letter sound identification',
        'domain' => 'literacy', 'unit' => 'correct letter sounds per minute', 'scale' => 'rate',
        'maxScore' => 100, 'items' => 100, 'gradeFrom' => 1, 'gradeTo' => 3,
        'notes' => 'A grid of 100 letters in random order; the child sounds out as many as they can in one minute. '
                 . 'Timed, so the score is a rate and not a mark out of 100.',
        'adapt' => 'Needs a letter grid in the language of instruction, weighted by how often each letter actually '
                 . 'occurs in that language. Do not reuse another country\'s grid.',
    ],
    [
        'key' => 'egra.familiar_word', 'family' => 'EGRA', 'name' => 'EGRA · Familiar word reading',
        'domain' => 'literacy', 'unit' => 'correct words per minute', 'scale' => 'rate',
        'maxScore' => 100, 'items' => 50, 'gradeFrom' => 1, 'gradeTo' => 4,
        'notes' => 'Fifty common words out of context, read aloud against the clock.',
        'adapt' => 'Word list must be drawn from the local curriculum and early readers, and piloted before baseline.',
    ],
    [
        'key' => 'egra.nonword', 'family' => 'EGRA', 'name' => 'EGRA · Invented (non-word) decoding',
        'domain' => 'literacy', 'unit' => 'correct non-words per minute', 'scale' => 'rate',
        'maxScore' => 100, 'items' => 50, 'gradeFrom' => 1, 'gradeTo' => 4,
        'notes' => 'Pronounceable non-words. Separates decoding from memorisation — a child who has learned the '
                 . 'reader by heart cannot pass this one on recall.',
        'adapt' => 'Non-words must follow the spelling patterns of the local language and must not be real words in it.',
    ],
    [
        'key' => 'egra.orf', 'family' => 'EGRA', 'name' => 'EGRA · Oral reading fluency',
        'domain' => 'literacy', 'unit' => 'correct words per minute', 'scale' => 'rate',
        'maxScore' => 200, 'items' => 0, 'gradeFrom' => 2, 'gradeTo' => 6,
        'notes' => 'A short passage read aloud for one minute. The headline early-grade reading measure, and the one '
                 . 'most often quoted in funding reports.',
        'adapt' => 'Passage must be levelled to the local curriculum and kept identical between baseline and endline.',
    ],
    [
        'key' => 'egra.comprehension', 'family' => 'EGRA', 'name' => 'EGRA · Reading comprehension',
        'domain' => 'literacy', 'unit' => 'questions correct', 'scale' => 'points',
        'maxScore' => 5, 'items' => 5, 'gradeFrom' => 2, 'gradeTo' => 6,
        'notes' => 'Five questions on the passage just read. Asked only about the part the child reached, so it is '
                 . 'reported alongside fluency rather than instead of it.',
        'adapt' => 'Questions must match the adapted passage; keep the same five between baseline and endline.',
    ],
    [
        'key' => 'egra.listening', 'family' => 'EGRA', 'name' => 'EGRA · Listening comprehension',
        'domain' => 'literacy', 'unit' => 'questions correct', 'scale' => 'points',
        'maxScore' => 5, 'items' => 5, 'gradeFrom' => 1, 'gradeTo' => 6,
        'notes' => 'The assessor reads a passage aloud and asks about it. Separates understanding the language from '
                 . 'being able to decode it — the difference matters where instruction is not in the home language.',
        'adapt' => 'Passage and questions in the language of instruction, read at a fixed pace by every assessor.',
    ],

    /* ── EGMA — the numeracy counterpart, same publisher ─────────────────── */
    [
        'key' => 'egma.number_id', 'family' => 'EGMA', 'name' => 'EGMA · Number identification',
        'domain' => 'numeracy', 'unit' => 'correct numbers per minute', 'scale' => 'rate',
        'maxScore' => 60, 'items' => 20, 'gradeFrom' => 1, 'gradeTo' => 3,
        'notes' => 'Naming written numerals against the clock.',
        'adapt' => 'Number range should match the local curriculum for the grades being assessed.',
    ],
    [
        'key' => 'egma.quantity_disc', 'family' => 'EGMA', 'name' => 'EGMA · Quantity discrimination',
        'domain' => 'numeracy', 'unit' => 'items correct', 'scale' => 'points',
        'maxScore' => 10, 'items' => 10, 'gradeFrom' => 1, 'gradeTo' => 3,
        'notes' => 'Which of two numbers is larger. Untimed; a mark out of ten.',
        'adapt' => 'Pairs should span the number range taught locally.',
    ],
    [
        'key' => 'egma.missing_number', 'family' => 'EGMA', 'name' => 'EGMA · Missing number',
        'domain' => 'numeracy', 'unit' => 'items correct', 'scale' => 'points',
        'maxScore' => 10, 'items' => 10, 'gradeFrom' => 1, 'gradeTo' => 4,
        'notes' => 'Completing number patterns. Reads number-sense rather than recall.',
        'adapt' => 'Sequences should use the counting patterns taught locally.',
    ],
    [
        'key' => 'egma.addition_1', 'family' => 'EGMA', 'name' => 'EGMA · Addition (level 1)',
        'domain' => 'numeracy', 'unit' => 'correct sums per minute', 'scale' => 'rate',
        'maxScore' => 40, 'items' => 20, 'gradeFrom' => 1, 'gradeTo' => 3,
        'notes' => 'Single-digit addition, timed. Fluency, not method.',
        'adapt' => 'Standard EGMA item set adapts directly; keep the same twenty items across both windows.',
    ],
    [
        'key' => 'egma.subtraction_1', 'family' => 'EGMA', 'name' => 'EGMA · Subtraction (level 1)',
        'domain' => 'numeracy', 'unit' => 'correct answers per minute', 'scale' => 'rate',
        'maxScore' => 40, 'items' => 20, 'gradeFrom' => 1, 'gradeTo' => 3,
        'notes' => 'The subtraction counterpart to addition level 1.',
        'adapt' => 'As addition level 1.',
    ],
    [
        'key' => 'egma.word_problems', 'family' => 'EGMA', 'name' => 'EGMA · Word problems',
        'domain' => 'numeracy', 'unit' => 'problems correct', 'scale' => 'points',
        'maxScore' => 6, 'items' => 6, 'gradeFrom' => 2, 'gradeTo' => 6,
        'notes' => 'Spoken problems with counters available. Tests whether arithmetic transfers to a situation.',
        'adapt' => 'Problems must use locally familiar objects, quantities and currency.',
    ],

    /* ── ASER / Uwezo — the citizen-led ladder ───────────────────────────────
     * A one-page ordinal ladder an assessor can administer in five minutes,
     * designed to be used by volunteers rather than testers. That fits this
     * programme's staffing better than a full EGRA, and the trade-off — an
     * ordinal scale with no interval meaning — is stated on the instrument. */
    [
        'key' => 'aser.reading', 'family' => 'ASER', 'name' => 'ASER · Reading level',
        'domain' => 'literacy', 'unit' => 'level (0 beginner → 4 story)', 'scale' => 'level',
        'maxScore' => 4, 'items' => 4, 'gradeFrom' => 1, 'gradeTo' => 8,
        'notes' => 'The highest of five levels the child can manage: beginner, letter, word, paragraph, story. '
                 . 'The steps are ordered but not equally spaced, so report movement between levels — the mean of a '
                 . 'ladder is a convenience, not a measurement.',
        'adapt' => 'Needs a local-language card with a letter row, a word row, a Standard I paragraph and a '
                 . 'Standard II story, all levelled against the local curriculum.',
    ],
    [
        'key' => 'aser.arithmetic', 'family' => 'ASER', 'name' => 'ASER · Arithmetic level',
        'domain' => 'numeracy', 'unit' => 'level (0 beginner → 4 division)', 'scale' => 'level',
        'maxScore' => 4, 'items' => 4, 'gradeFrom' => 1, 'gradeTo' => 8,
        'notes' => 'Beginner, single-digit recognition, double-digit recognition, subtraction with borrowing, '
                 . 'division. Same ordinal caution as the reading ladder.',
        'adapt' => 'Local-language number card; the arithmetic itself is language-independent.',
    ],

    /* ── Gender attitudes ────────────────────────────────────────────────────
     * The fund this catalogue was assembled for asks about gender outcomes, and
     * a gender claim resting only on enrolment counts is a participation claim
     * wearing the wrong label. These measure what children believe, which is
     * the thing a gender-focused programme sets out to move. */
    [
        'key' => 'gem.short', 'family' => 'GEM Scale', 'name' => 'GEM Scale · Gender-equitable attitudes (short form)',
        'domain' => 'gender_attitudes', 'unit' => 'scale score', 'scale' => 'points',
        'maxScore' => 24, 'items' => 12, 'gradeFrom' => 7, 'gradeTo' => 12,
        'notes' => 'Twelve statements about roles, violence and decision-making, each agreed with on a three-point '
                 . 'scale, reverse-coded so a higher score is a more equitable attitude. Validated for adolescents '
                 . 'and young adults; not suitable below about age twelve.',
        'adapt' => 'Items must be translated and back-translated, and reviewed with local staff — several standard '
                 . 'items do not carry across contexts. Re-check internal consistency on the baseline data before '
                 . 'reporting a total.',
    ],
    [
        'key' => 'geas.norms', 'family' => 'GEAS', 'name' => 'GEAS · Gender norms (early adolescent)',
        'domain' => 'gender_attitudes', 'unit' => 'scale score', 'scale' => 'points',
        'maxScore' => 20, 'items' => 10, 'gradeFrom' => 5, 'gradeTo' => 9,
        'notes' => 'Written for 10–14 year olds, where the GEM Scale is too old. Covers gender stereotypical traits '
                 . 'and roles.',
        'adapt' => 'Cognitive-test the translated items with a handful of children of the target age before baseline.',
    ],

    /* ── Wellbeing ───────────────────────────────────────────────────────── */
    [
        'key' => 'sdq.total', 'family' => 'SDQ', 'name' => 'SDQ · Total difficulties',
        'domain' => 'sel', 'unit' => 'difficulties score (lower is better)', 'scale' => 'points',
        'maxScore' => 40, 'items' => 20, 'gradeFrom' => 4, 'gradeTo' => 12, 'higherIsBetter' => false,
        'notes' => 'Twenty items across four difficulty subscales. HIGHER IS WORSE on this one — a fall between '
                 . 'baseline and endline is the improvement, which is the opposite of every other instrument here '
                 . 'and has to be said out loud wherever the gain is reported.',
        'adapt' => 'Official translations exist for many languages; use one rather than translating afresh.',
    ],
];

/** Publisher, licence and citation, held once per family rather than per
 *  subtask — six EGRA rows should not carry six copies of the same citation
 *  that then drift apart. */
const ASSESS_CAT_SOURCES = [
    'EGRA' => [
        'source' => 'RTI International, for USAID',
        'sourceUrl' => 'https://shared.rti.org/sub-topic/early-grade-reading-assessment-egra',
        'licence' => 'Public good — toolkit and adaptation guidance free to download, adapt and use',
        'citation' => 'RTI International. (2015). Early Grade Reading Assessment (EGRA) Toolkit, Second Edition. '
                    . 'Washington, DC: United States Agency for International Development.',
    ],
    'EGMA' => [
        'source' => 'RTI International, for USAID',
        'sourceUrl' => 'https://shared.rti.org/sub-topic/early-grade-mathematics-assessment-egma',
        'licence' => 'Public good — toolkit and adaptation guidance free to download, adapt and use',
        'citation' => 'RTI International. (2014). Early Grade Mathematics Assessment (EGMA) Toolkit. '
                    . 'Washington, DC: United States Agency for International Development.',
    ],
    'ASER' => [
        'source' => 'ASER Centre (Pratham), India — the model for the PAL Network citizen-led assessments, '
                  . 'including Uwezo in East Africa',
        'sourceUrl' => 'https://asercentre.org/',
        'licence' => 'Freely available for non-commercial use; tools published annually',
        'citation' => 'ASER Centre. Annual Status of Education Report (Rural). New Delhi: ASER Centre / Pratham.',
    ],
    'GEM Scale' => [
        'source' => 'Horizons Program (Population Council) and Promundo',
        'sourceUrl' => 'https://www.promundoglobal.org/',
        'licence' => 'Free for research and programme use, with citation',
        'citation' => 'Pulerwitz, J., & Barker, G. (2008). Measuring attitudes toward gender norms among young men '
                    . 'in Brazil: Development and psychometric evaluation of the GEM Scale. Men and Masculinities, '
                    . '10(3), 322–338.',
    ],
    'GEAS' => [
        'source' => 'Global Early Adolescent Study (Johns Hopkins Bloomberg School of Public Health and WHO)',
        'sourceUrl' => 'https://www.geastudy.org/',
        'licence' => 'Instruments published for use with citation',
        'citation' => 'Moreau, C., Li, M., De Meyer, S., et al. (2019). Measuring gender norms about relationships '
                    . 'in early adolescence: Results from the Global Early Adolescent Study. SSM - Population '
                    . 'Health, 7, 100314.',
    ],
    'SDQ' => [
        'source' => 'Robert Goodman / Youthinmind',
        'sourceUrl' => 'https://www.sdqinfo.org/',
        'licence' => 'Paper versions free to download and use for non-commercial purposes; © Robert Goodman',
        'citation' => 'Goodman, R. (1997). The Strengths and Difficulties Questionnaire: A research note. '
                    . 'Journal of Child Psychology and Psychiatry, 38(5), 581–586.',
    ],
];

/** One catalogue entry with its family's provenance folded in. */
function assess_catalogue_entry(array $e): array {
    $src = ASSESS_CAT_SOURCES[$e['family']] ?? ['source' => '', 'sourceUrl' => '', 'licence' => '', 'citation' => ''];
    return $e + $src + [
        'higherIsBetter' => true,
        'domainLabel' => assess_domain_label($e['domain']),
        'scaleLabel' => assess_scale_label($e['scale']),
        'gradeFromLabel' => grade_label($e['gradeFrom']),
        'gradeToLabel' => grade_label($e['gradeTo']),
    ];
}

/**
 * The shortlist, with whichever entries this programme has already adopted
 * marked as such — so the screen shows a catalogue, not a list of things to
 * accidentally adopt twice.
 */
function admin_assessment_catalogue(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $adopted = [];
    foreach (db_all("SELECT catalogueKey, instrumentId, name FROM assessment_instruments WHERE catalogueKey <> '' AND archivedAt = ''") as $r) {
        $adopted[(string)$r['catalogueKey']] = ['instrumentId' => (string)$r['instrumentId'], 'name' => (string)$r['name']];
    }
    $out = [];
    foreach (ASSESS_CATALOGUE as $e) {
        $row = assess_catalogue_entry($e);
        $row['adopted'] = $adopted[$e['key']] ?? null;
        $out[] = $row;
    }
    return ['ok' => true, 'catalogue' => $out, 'families' => array_keys(ASSESS_CAT_SOURCES),
        'scales' => ASSESS_SCALES,
        /* Said once, at the top of the screen, because both halves of it are
           the sort of thing that gets discovered after the data is collected. */
        'note' => 'These are definitions, not papers. Every one of them still needs the local adaptation described '
                . 'on the entry — a word list, a passage, a translation — before a single child sits it, and the '
                . 'licence line records what the publisher says rather than legal advice. Confirm at the source '
                . 'before you publish results.'];
}

/**
 * Create instruments from catalogue keys.
 *
 * Idempotent by catalogueKey: adopting twice returns the existing instrument
 * rather than minting a second one, because a duplicate instrument silently
 * splits a cohort's results into two half-sized paired sets.
 */
function admin_assessment_adopt(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $keys = array_values(array_filter(array_map('strval', (array)($p['keys'] ?? []))));
    if (!$keys) return ['ok' => false, 'error' => 'no_keys'];
    $byKey = [];
    foreach (ASSESS_CATALOGUE as $e) $byKey[$e['key']] = $e;

    $created = []; $existing = []; $unknown = [];
    foreach ($keys as $k) {
        if (!isset($byKey[$k])) { $unknown[] = $k; continue; }
        $have = db_row("SELECT instrumentId FROM assessment_instruments WHERE catalogueKey = ? AND archivedAt = '' LIMIT 1", [$k]);
        if ($have) { $existing[] = ['key' => $k, 'instrumentId' => (string)$have['instrumentId']]; continue; }
        $e = assess_catalogue_entry($byKey[$k]);
        $id = 'AI-' . strtoupper(rand_hex(5));
        db_insert('assessment_instruments', [
            'instrumentId' => $id, 'name' => $e['name'], 'domain' => $e['domain'],
            'maxScore' => (int)$e['maxScore'], 'items' => (int)$e['items'], 'version' => 1,
            'notes' => $e['notes'], 'gradeFrom' => (int)$e['gradeFrom'], 'gradeTo' => (int)$e['gradeTo'],
            'status' => 'active', 'lockedAt' => '', 'createdById' => $me, 'createdAt' => now_iso(), 'archivedAt' => '',
            'unit' => $e['unit'], 'scale' => $e['scale'], 'source' => $e['source'], 'sourceUrl' => $e['sourceUrl'],
            'licence' => $e['licence'], 'citation' => $e['citation'], 'adaptNote' => $e['adapt'], 'catalogueKey' => $k,
            'higherIsBetter' => $e['higherIsBetter'] ? 1 : 0,
        ]);
        audit('assessment.instrument.adopt', $me, $id, ['key' => $k, 'family' => $e['family']], (string)($p['ip'] ?? ''));
        $created[] = ['key' => $k, 'instrumentId' => $id, 'name' => $e['name']];
    }
    return ['ok' => true, 'created' => $created, 'existing' => $existing, 'unknown' => $unknown];
}

/* ── Instruments ─────────────────────────────────────────────────────────── */

function assess_instrument_public(array $r): array {
    return [
        'instrumentId' => (string)$r['instrumentId'], 'name' => (string)$r['name'],
        'domain' => (string)$r['domain'], 'domainLabel' => assess_domain_label((string)$r['domain']),
        'maxScore' => (int)$r['maxScore'], 'items' => (int)$r['items'], 'version' => (int)$r['version'],
        'notes' => (string)$r['notes'], 'status' => (string)$r['status'],
        'gradeFrom' => (int)$r['gradeFrom'], 'gradeTo' => (int)$r['gradeTo'],
        'locked' => (string)($r['lockedAt'] ?? '') !== '',
        'lockedAt' => (string)($r['lockedAt'] ?? ''),
        'createdAt' => (string)($r['createdAt'] ?? ''),
        // Provenance and unit — what a reader needs to judge the number.
        'unit' => (string)($r['unit'] ?? ''),
        'scale' => (string)($r['scale'] ?? 'points') ?: 'points',
        'scaleLabel' => assess_scale_label((string)($r['scale'] ?? 'points') ?: 'points'),
        'pctMeaningful' => assess_pct_meaningful((string)($r['scale'] ?? 'points') ?: 'points'),
        'higherIsBetter' => (int)($r['higherIsBetter'] ?? 1) === 1,
        'source' => (string)($r['source'] ?? ''), 'sourceUrl' => (string)($r['sourceUrl'] ?? ''),
        'licence' => (string)($r['licence'] ?? ''), 'citation' => (string)($r['citation'] ?? ''),
        'adaptNote' => (string)($r['adaptNote'] ?? ''), 'catalogueKey' => (string)($r['catalogueKey'] ?? ''),
    ];
}

function admin_assessment_instruments(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $rows = db_all("SELECT * FROM assessment_instruments WHERE archivedAt = '' ORDER BY domain, name");
    $out = [];
    foreach ($rows as $r) {
        $i = assess_instrument_public($r);
        // How many results exist is what makes "locked" mean something on screen.
        $i['results'] = (int)(db_row('SELECT COUNT(*) n FROM assessment_results WHERE instrumentId = ?', [$i['instrumentId']])['n'] ?? 0);
        $i['windows'] = (int)(db_row('SELECT COUNT(*) n FROM assessment_windows WHERE instrumentId = ?', [$i['instrumentId']])['n'] ?? 0);
        $out[] = $i;
    }
    return ['ok' => true, 'instruments' => $out, 'domains' => ASSESS_DOMAINS, 'phases' => ASSESS_PHASES];
}

function admin_assessment_instrument_save(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $id = trim((string)($p['instrumentId'] ?? ''));

    $name = mb_substr(trim((string)($d['name'] ?? '')), 0, 160);
    if ($name === '') return ['ok' => false, 'error' => 'name_required'];
    $domain = in_array(($d['domain'] ?? ''), ASSESS_DOMAINS, true) ? (string)$d['domain'] : 'other';
    $max = (int)($d['maxScore'] ?? 0);
    if ($max < 1 || $max > 1000) return ['ok' => false, 'error' => 'bad_max'];
    $from = grade_normalise($d['gradeFrom'] ?? '');
    $to = grade_normalise($d['gradeTo'] ?? '');
    if ($from && $to && $to < $from) return ['ok' => false, 'error' => 'bad_grade_range'];

    $row = ['name' => $name, 'domain' => $domain, 'maxScore' => $max,
            'items' => max(0, (int)($d['items'] ?? 0)),
            'notes' => mb_substr(trim((string)($d['notes'] ?? '')), 0, 2000),
            'gradeFrom' => $from, 'gradeTo' => $to,
            'status' => in_array(($d['status'] ?? ''), ['draft', 'active', 'archived'], true) ? (string)$d['status'] : 'active'];

    /* Provenance and scale are PATCHED, not replaced.
     *
     * The rest of this row is replace-the-lot, which is safe for a form that
     * always posts every field. These nine are different: they arrive on an
     * instrument by being ADOPTED from the catalogue, not by being typed, so a
     * caller that only meant to fix a name — a script, an older client, a
     * partial payload — would silently erase the citation that makes the
     * result quotable, and reset a words-per-minute instrument to a mark out
     * of a total, changing what every future report says about it.
     *
     * So each one is written only when the caller actually sent the key. An
     * empty string still clears it; an ABSENT key leaves it alone. */
    $cur = $id !== '' ? db_row('SELECT * FROM assessment_instruments WHERE instrumentId = ? LIMIT 1', [$id]) : null;
    if ($id !== '' && !$cur) return ['ok' => false, 'error' => 'not_found'];
    $keep = fn(string $k, $fallback) => $cur !== null ? ($cur[$k] ?? $fallback) : $fallback;
    $text = fn(string $k, int $len, $fallback) => array_key_exists($k, $d)
        ? mb_substr(trim((string)$d[$k]), 0, $len) : (string)$keep($k, $fallback);
    $row['unit']     = $text('unit', 64, '');
    $row['source']   = $text('source', 255, '');
    $row['sourceUrl'] = $text('sourceUrl', 255, '');
    $row['licence']  = $text('licence', 255, '');
    $row['citation'] = $text('citation', 1000, '');
    $row['adaptNote'] = $text('adaptNote', 1000, '');
    $row['scale'] = array_key_exists('scale', $d)
        ? (in_array($d['scale'], ASSESS_SCALES, true) ? (string)$d['scale'] : 'points')
        : ((string)$keep('scale', 'points') ?: 'points');
    $row['higherIsBetter'] = array_key_exists('higherIsBetter', $d)
        ? (!empty($d['higherIsBetter']) ? 1 : 0) : (int)$keep('higherIsBetter', 1);

    if ($id !== '') {
        /* THE LOCK. Once a single child has been measured with this instrument,
         * changing what it measures or what it is out of makes every pair built
         * on it incomparable — and the change leaves no trace in the numbers.
         * The name and the notes stay editable, because fixing a typo in a
         * label does not alter a score. */
        if ((string)$cur['lockedAt'] !== '') {
            /* `scale` and `higherIsBetter` join the locked set because both
             * change what the recorded numbers MEAN without changing a single
             * one of them: flip higherIsBetter and last term's decline becomes
             * this term's improvement, with nothing in the data to show it. */
            foreach (['domain', 'maxScore', 'items', 'gradeFrom', 'gradeTo', 'scale', 'higherIsBetter'] as $f) {
                if ((string)$row[$f] !== (string)$cur[$f]) {
                    return ['ok' => false, 'error' => 'locked',
                            'note' => 'This instrument has results recorded against it. Changing what it measures '
                                    . 'or what it is out of would make every existing baseline/endline pair '
                                    . 'incomparable, with nothing in the numbers to show it. Create a new version instead.'];
                }
            }
        }
        db_update('assessment_instruments', $row, ['instrumentId' => $id]);
        audit('assessment.instrument.save', $me, $id, ['fields' => array_keys($row)], (string)($p['ip'] ?? ''));
        return ['ok' => true, 'instrumentId' => $id];
    }

    $id = 'AI-' . strtoupper(rand_hex(5));
    db_insert('assessment_instruments', $row + ['instrumentId' => $id, 'version' => 1, 'lockedAt' => '',
        'createdById' => $me, 'createdAt' => now_iso(), 'archivedAt' => '']);
    audit('assessment.instrument.create', $me, $id, ['name' => $name, 'domain' => $domain], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'instrumentId' => $id];
}

/**
 * A new VERSION of a locked instrument, rather than an edit to it.
 *
 * The honest path when a test genuinely has to change: the old one keeps its
 * results and its comparability, the new one starts clean, and nothing silently
 * pairs a score from one with a score from the other.
 */
function admin_assessment_instrument_revise(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $cur = db_row('SELECT * FROM assessment_instruments WHERE instrumentId = ? LIMIT 1', [(string)($p['instrumentId'] ?? '')]);
    if (!$cur) return ['ok' => false, 'error' => 'not_found'];
    $id = 'AI-' . strtoupper(rand_hex(5));
    db_insert('assessment_instruments', [
        'instrumentId' => $id, 'name' => (string)$cur['name'], 'domain' => (string)$cur['domain'],
        'maxScore' => (int)$cur['maxScore'], 'items' => (int)$cur['items'],
        'version' => (int)$cur['version'] + 1, 'notes' => (string)$cur['notes'],
        'gradeFrom' => (int)$cur['gradeFrom'], 'gradeTo' => (int)$cur['gradeTo'],
        'status' => 'draft', 'lockedAt' => '', 'createdById' => $me, 'createdAt' => now_iso(), 'archivedAt' => '',
        // Provenance follows the revision: a new version of EGRA ORF is still
        // EGRA ORF, and losing the citation here is how a report ends up
        // unable to say what it measured with.
        'unit' => (string)($cur['unit'] ?? ''), 'scale' => (string)($cur['scale'] ?? 'points') ?: 'points',
        'higherIsBetter' => (int)($cur['higherIsBetter'] ?? 1),
        'source' => (string)($cur['source'] ?? ''), 'sourceUrl' => (string)($cur['sourceUrl'] ?? ''),
        'licence' => (string)($cur['licence'] ?? ''), 'citation' => (string)($cur['citation'] ?? ''),
        'adaptNote' => (string)($cur['adaptNote'] ?? ''),
        /* The catalogue key does NOT follow. Adoption is idempotent on that
         * key, so copying it would make the revision look like the adopted
         * instrument and hide the original from the catalogue screen. */
        'catalogueKey' => '',
    ]);
    audit('assessment.instrument.revise', $me, $id, ['from' => (string)$cur['instrumentId']], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'instrumentId' => $id, 'version' => (int)$cur['version'] + 1];
}

/* ── Windows ─────────────────────────────────────────────────────────────── */

function admin_assessment_windows(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $rows = db_all('SELECT * FROM assessment_windows WHERE cohortId = ? ORDER BY instrumentId, phase', [(string)$c['cohortId']]);
    $out = [];
    foreach ($rows as $r) {
        $wid = (string)$r['windowId'];
        $sat = (int)(db_row('SELECT COUNT(*) n FROM assessment_results WHERE windowId = ? AND absent = 0', [$wid])['n'] ?? 0);
        $abs = (int)(db_row('SELECT COUNT(*) n FROM assessment_results WHERE windowId = ? AND absent = 1', [$wid])['n'] ?? 0);
        $out[] = ['windowId' => $wid, 'instrumentId' => (string)$r['instrumentId'],
                  'phase' => (string)$r['phase'], 'label' => (string)$r['label'],
                  'opensAt' => (string)$r['opensAt'], 'closesAt' => (string)$r['closesAt'],
                  'status' => (string)$r['status'], 'sat' => $sat, 'absent' => $abs];
    }
    return ['ok' => true, 'windows' => $out, 'cohortId' => (string)$c['cohortId']];
}

function admin_assessment_window_save(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $c = summer_ensure_cohort();
    $d = is_array($p['data'] ?? null) ? $p['data'] : [];
    $instrumentId = trim((string)($d['instrumentId'] ?? ''));
    if (!db_row('SELECT id FROM assessment_instruments WHERE instrumentId = ?', [$instrumentId])) {
        return ['ok' => false, 'error' => 'unknown_instrument'];
    }
    $phase = in_array(($d['phase'] ?? ''), ASSESS_PHASES, true) ? (string)$d['phase'] : 'baseline';
    $opens = substr(trim((string)($d['opensAt'] ?? '')), 0, 10);
    $closes = substr(trim((string)($d['closesAt'] ?? '')), 0, 10);
    if ($opens !== '' && $closes !== '' && $closes < $opens) return ['ok' => false, 'error' => 'bad_dates'];

    $row = ['instrumentId' => $instrumentId, 'phase' => $phase,
            'label' => mb_substr(trim((string)($d['label'] ?? '')), 0, 120),
            'opensAt' => $opens, 'closesAt' => $closes,
            'status' => in_array(($d['status'] ?? ''), ['open', 'closed'], true) ? (string)$d['status'] : 'open'];

    $id = trim((string)($p['windowId'] ?? ''));
    if ($id !== '') {
        if (!db_row('SELECT id FROM assessment_windows WHERE windowId = ?', [$id])) return ['ok' => false, 'error' => 'not_found'];
        db_update('assessment_windows', $row, ['windowId' => $id]);
        return ['ok' => true, 'windowId' => $id];
    }
    /* One window per instrument per phase per cohort. Two "baselines" for the
     * same test is not a richer dataset, it is an ambiguity about which score
     * pairs with the endline, and it would be resolved silently by whichever
     * row a query happened to read first. */
    $dupe = db_row('SELECT windowId FROM assessment_windows WHERE cohortId = ? AND instrumentId = ? AND phase = ? LIMIT 1',
        [(string)$c['cohortId'], $instrumentId, $phase]);
    if ($dupe) return ['ok' => false, 'error' => 'phase_exists', 'windowId' => (string)$dupe['windowId']];

    $id = 'AW-' . strtoupper(rand_hex(5));
    db_insert('assessment_windows', $row + ['windowId' => $id, 'cohortId' => (string)$c['cohortId'],
        'createdById' => $me, 'createdAt' => now_iso()]);
    audit('assessment.window.create', $me, $id, ['instrument' => $instrumentId, 'phase' => $phase], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'windowId' => $id];
}

/* ── Recording scores ────────────────────────────────────────────────────── */

/** The sheet a coordinator fills in: every eligible child, with whatever has
 *  already been recorded for them in this window. */
function admin_assessment_sheet(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $w = db_row('SELECT * FROM assessment_windows WHERE windowId = ? LIMIT 1', [(string)($p['windowId'] ?? '')]);
    if (!$w) return ['ok' => false, 'error' => 'not_found'];
    $inst = db_row('SELECT * FROM assessment_instruments WHERE instrumentId = ? LIMIT 1', [(string)$w['instrumentId']]);
    if (!$inst) return ['ok' => false, 'error' => 'unknown_instrument'];

    $where = "cohortId = ? AND status = 'active' AND regStatus = 'verified'";
    $args = [(string)$w['cohortId']];
    $centre = trim((string)($p['centre'] ?? ''));
    if ($centre !== '') { $where .= ' AND centre = ?'; $args[] = $centre; }
    /* An instrument written for grades 4–6 should not be handed to a child in
     * Primary 1. Children with no class on file are still LISTED — excluding
     * them would quietly shrink the sample and nobody would see it happen —
     * but they are flagged. */
    $rows = db_all("SELECT studentId, fullName, firstName, lastName, centre, sex, gender, gradeLevel
                    FROM summer_students WHERE $where ORDER BY centre, fullName LIMIT 600", $args);

    $have = [];
    foreach (db_all('SELECT studentId, score, absent, note FROM assessment_results WHERE windowId = ?', [(string)$w['windowId']]) as $r) {
        $have[(string)$r['studentId']] = ['score' => (int)$r['score'], 'absent' => (int)$r['absent'] === 1, 'note' => (string)$r['note']];
    }
    $gf = (int)$inst['gradeFrom']; $gt = (int)$inst['gradeTo'];
    $out = [];
    foreach ($rows as $s) {
        $lvl = (int)($s['gradeLevel'] ?? 0);
        $out[] = [
            'studentId' => (string)$s['studentId'],
            'name' => trim(($s['firstName'] ?? '') . ' ' . ($s['lastName'] ?? '')) ?: (string)$s['fullName'],
            'centre' => (string)$s['centre'], 'sex' => person_sex($s),
            'grade' => grade_label($lvl), 'gradeLevel' => $lvl,
            'outOfRange' => ($gf > 0 && $lvl > 0 && $lvl < $gf) || ($gt > 0 && $lvl > 0 && $lvl > $gt),
            'noGrade' => $lvl === 0,
            'result' => $have[(string)$s['studentId']] ?? null,
        ];
    }
    return ['ok' => true, 'window' => ['windowId' => (string)$w['windowId'], 'phase' => (string)$w['phase'],
              'label' => (string)$w['label'], 'status' => (string)$w['status']],
            'instrument' => assess_instrument_public($inst), 'students' => $out];
}

/**
 * Record scores. Bulk, because a coordinator has a paper register of forty
 * children and one save is the difference between this being used and not.
 */
function admin_assessment_record(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $me = (string)($g['requester']['memberId'] ?? '');
    $w = db_row('SELECT * FROM assessment_windows WHERE windowId = ? LIMIT 1', [(string)($p['windowId'] ?? '')]);
    if (!$w) return ['ok' => false, 'error' => 'not_found'];
    if ((string)$w['status'] === 'closed') return ['ok' => false, 'error' => 'window_closed'];
    $inst = db_row('SELECT * FROM assessment_instruments WHERE instrumentId = ? LIMIT 1', [(string)$w['instrumentId']]);
    if (!$inst) return ['ok' => false, 'error' => 'unknown_instrument'];
    $max = (int)$inst['maxScore'];

    $items = is_array($p['results'] ?? null) ? $p['results'] : [];
    if (!$items) return ['ok' => false, 'error' => 'nothing_to_record'];
    if (count($items) > 600) return ['ok' => false, 'error' => 'too_many'];

    $saved = 0; $cleared = 0; $bad = [];
    foreach ($items as $it) {
        $sid = trim((string)($it['studentId'] ?? ''));
        if ($sid === '') continue;
        if (!db_row('SELECT id FROM summer_students WHERE studentId = ? LIMIT 1', [$sid])) { $bad[] = $sid; continue; }

        $absent = !empty($it['absent']);
        $hasScore = array_key_exists('score', $it) && $it['score'] !== '' && $it['score'] !== null;

        // Neither a score nor an absence mark = no answer yet. Clears any prior
        // entry rather than leaving a half-corrected row behind.
        if (!$absent && !$hasScore) {
            $cleared += db_exec('DELETE FROM assessment_results WHERE windowId = ? AND studentId = ?', [(string)$w['windowId'], $sid]);
            continue;
        }
        $score = $absent ? 0 : (int)$it['score'];
        /* Out of range is refused, not clamped. A 55 on a paper marked out of
         * 50 is a transcription error, and clamping it to 50 buries the error
         * inside a number somebody will later average. */
        if (!$absent && ($score < 0 || $score > $max)) { $bad[] = $sid; continue; }

        $existing = db_row('SELECT resultId FROM assessment_results WHERE windowId = ? AND studentId = ? LIMIT 1',
            [(string)$w['windowId'], $sid]);
        $row = ['score' => $score, 'absent' => $absent ? 1 : 0,
                'note' => mb_substr(trim((string)($it['note'] ?? '')), 0, 255),
                'recordedById' => $me, 'recordedAt' => now_iso()];
        if ($existing) {
            db_update('assessment_results', $row, ['resultId' => (string)$existing['resultId']]);
        } else {
            db_insert('assessment_results', $row + ['resultId' => 'AR-' . strtoupper(rand_hex(6)),
                'windowId' => (string)$w['windowId'], 'instrumentId' => (string)$w['instrumentId'], 'studentId' => $sid]);
        }
        $saved++;
    }

    /* THE LOCK, applied here rather than on save: the instrument becomes
     * un-editable the moment it has measured a child, because from that instant
     * a change to it would silently invalidate a comparison. */
    if ($saved > 0 && (string)$inst['lockedAt'] === '') {
        db_update('assessment_instruments', ['lockedAt' => now_iso(), 'status' => 'active'],
            ['instrumentId' => (string)$inst['instrumentId']]);
    }
    audit('assessment.record', $me, (string)$w['windowId'], ['saved' => $saved, 'cleared' => $cleared, 'rejected' => count($bad)], (string)($p['ip'] ?? ''));
    return ['ok' => true, 'saved' => $saved, 'cleared' => $cleared, 'rejected' => $bad,
            'locked' => $saved > 0 || (string)$inst['lockedAt'] !== ''];
}

/* ── The analysis ────────────────────────────────────────────────────────── */

/**
 * Mean, SD and a t-based 95% interval for a set of paired differences.
 *
 * The interval is on the DIFFERENCE, which is the whole point of pairing: each
 * child is their own control, so the between-child variance that swamps a
 * two-sample comparison drops out. Normal approximation for the critical value
 * — with n under 30 that is slightly optimistic, which is why anything under
 * ASSESS_MIN_N is refused outright rather than reported with a wide interval
 * nobody reads.
 */
function assess_paired_stats(array $diffs): array {
    $n = count($diffs);
    if ($n === 0) return ['n' => 0, 'mean' => null, 'sd' => null, 'lo' => null, 'hi' => null,
                          'd' => null, 'significant' => false, 'tooThin' => true];
    $mean = array_sum($diffs) / $n;
    $var = 0.0;
    foreach ($diffs as $x) $var += ($x - $mean) ** 2;
    $sd = $n > 1 ? sqrt($var / ($n - 1)) : 0.0;
    $se = $n > 0 ? $sd / sqrt($n) : 0.0;
    /* t rather than z for small samples. A short table beats pulling in a
       distribution library for four numbers, and the values are the standard
       two-tailed 0.05 criticals. */
    $t = $n <= 5 ? 2.776 : ($n <= 10 ? 2.262 : ($n <= 20 ? 2.093 : ($n <= 30 ? 2.045 : 1.96)));
    return [
        'n' => $n,
        'mean' => round($mean, 2),
        'sd' => round($sd, 2),
        'lo' => round($mean - $t * $se, 2),
        'hi' => round($mean + $t * $se, 2),
        // Cohen's d for a paired design, on the SD of the differences.
        'd' => $sd > 0 ? round($mean / $sd, 2) : null,
        /* "Significant" here means only that the interval excludes zero. It is
           not a claim that the programme caused the change — there is no
           control group, and this file must never imply there is. */
        'significant' => $n >= ASSESS_MIN_N && (($mean - $t * $se) > 0 || ($mean + $t * $se) < 0),
        'tooThin' => $n < ASSESS_MIN_N,
    ];
}

/** Percent of the instrument's maximum. One place, so a re-based paper changes
 *  one line rather than five callers.
 *
 *  Takes a float, and that is not a detail: the callers pass MEANS. Rounding a
 *  mean of 24.545 to 25 before dividing turns 40.9% into 41.7%, and the number
 *  that reaches a funder should not carry an error introduced by a cast. */
function assess_pct(float $score, int $max): float { return $max > 0 ? round($score / $max * 100, 1) : 0.0; }

/**
 * Baseline → endline for one instrument: the gain, who it is for, and every
 * reason a reader should doubt it.
 */
function admin_assessment_gains(array $p): array {
    $g = assess_gate($p); if (!$g['ok']) return $g;
    $c = summer_ensure_cohort();
    $instrumentId = trim((string)($p['instrumentId'] ?? ''));
    $instruments = $instrumentId !== ''
        ? db_all('SELECT * FROM assessment_instruments WHERE instrumentId = ?', [$instrumentId])
        : db_all("SELECT * FROM assessment_instruments WHERE archivedAt = '' ORDER BY domain, name");

    $out = [];
    foreach ($instruments as $inst) {
        $iid = (string)$inst['instrumentId'];
        $max = (int)$inst['maxScore'];
        $scale = (string)($inst['scale'] ?? 'points') ?: 'points';
        $unit = (string)($inst['unit'] ?? '');
        $higherBetter = (int)($inst['higherIsBetter'] ?? 1) === 1;
        /* Percent-of-maximum is only a number for a mark out of a total. On a
         * rate there is no maximum to be a fraction of, and on an ordinal
         * ladder the steps are not equal, so a percentage of the top rung is
         * arithmetic performed on a label. Both report in their own unit. */
        $pctOk = assess_pct_meaningful($scale);
        $pct = fn(?float $v) => ($v === null || !$pctOk) ? null : assess_pct($v, $max);
        $base = db_row("SELECT windowId FROM assessment_windows WHERE cohortId = ? AND instrumentId = ? AND phase = 'baseline' LIMIT 1",
            [(string)$c['cohortId'], $iid]);
        $end = db_row("SELECT windowId FROM assessment_windows WHERE cohortId = ? AND instrumentId = ? AND phase = 'endline' LIMIT 1",
            [(string)$c['cohortId'], $iid]);
        if (!$base || !$end) continue;

        $b = []; $e = [];
        foreach (db_all('SELECT studentId, score FROM assessment_results WHERE windowId = ? AND absent = 0', [(string)$base['windowId']]) as $r) {
            $b[(string)$r['studentId']] = (int)$r['score'];
        }
        foreach (db_all('SELECT studentId, score FROM assessment_results WHERE windowId = ? AND absent = 0', [(string)$end['windowId']]) as $r) {
            $e[(string)$r['studentId']] = (int)$r['score'];
        }
        if (!$b && !$e) continue;

        $ids = array_keys($b + $e);
        $meta = [];
        if ($ids) {
            $in = '(' . implode(',', array_fill(0, count($ids), '?')) . ')';
            foreach (db_all("SELECT studentId, sex, gender, gradeLevel, centre FROM summer_students WHERE studentId IN $in", $ids) as $r) {
                $meta[(string)$r['studentId']] = $r;
            }
        }

        /* The paired set. Everything else on this page is context for it. */
        $paired = [];
        foreach ($b as $sid => $bs) if (isset($e[$sid])) $paired[$sid] = $e[$sid] - $bs;

        $bySex = []; $byBand = []; $byCentre = [];
        foreach ($paired as $sid => $diff) {
            $m = $meta[$sid] ?? [];
            $bySex[sex_label($m)][] = $diff;
            $byBand[grade_band((int)($m['gradeLevel'] ?? 0))['label']][] = $diff;
            $cn = (string)($m['centre'] ?? ''); if ($cn !== '') $byCentre[$cn][] = $diff;
        }
        $group = function (array $sets) use ($pct, $higherBetter) {
            $rows = [];
            foreach ($sets as $k => $diffs) {
                $st = assess_paired_stats($diffs);
                $rows[] = ['group' => (string)$k, 'n' => $st['n'],
                           'meanGain' => $st['mean'], 'gainPct' => $pct($st['mean'] === null ? null : (float)$st['mean']),
                           'improved' => $st['mean'] === null ? null : ($higherBetter ? $st['mean'] > 0 : $st['mean'] < 0),
                           'lo' => $st['lo'], 'hi' => $st['hi'], 'd' => $st['d'],
                           'significant' => $st['significant'], 'tooThin' => $st['tooThin']];
            }
            usort($rows, fn($x, $y) => strcmp($x['group'], $y['group']));
            return $rows;
        };

        /* ── Attrition, which is the first thing a reviewer asks about ───────
         * Children who sat baseline and did not come back. If they were the
         * weaker ones, the paired gain is inflated by their absence and the
         * report has to say so in those words rather than leave it to be
         * noticed. */
        $leftBaselines = []; $stayedBaselines = [];
        foreach ($b as $sid => $bs) {
            if (isset($e[$sid])) $stayedBaselines[] = $bs; else $leftBaselines[] = $bs;
        }
        $meanOf = fn(array $a) => $a ? round(array_sum($a) / count($a), 2) : null;
        $leftMean = $meanOf($leftBaselines);
        $stayedMean = $meanOf($stayedBaselines);
        $attritionBias = null;
        if ($leftMean !== null && $stayedMean !== null && count($leftBaselines) >= ASSESS_MIN_N) {
            $delta = round($stayedMean - $leftMean, 2);
            $attritionBias = [
                'leftMean' => $pct((float)$leftMean), 'leftMeanRaw' => $leftMean,
                'stayedMean' => $pct((float)$stayedMean), 'stayedMeanRaw' => $stayedMean,
                'deltaPoints' => $delta,
                /* Named plainly, because the direction is the whole finding: if
                   the leavers were weaker, the gain LOOKS bigger than it is.
                   "Weaker" is not "lower" on every instrument — on the SDQ the
                   higher baseline is the child in more difficulty — so the
                   comparison is made in the instrument's own direction. */
                'direction' => abs($delta) < 1 ? 'balanced'
                    : ((($delta > 0) === $higherBetter) ? 'leavers_were_weaker' : 'leavers_were_stronger'),
            ];
        }

        $overall = assess_paired_stats(array_values($paired));
        $out[] = [
            'instrument' => assess_instrument_public($inst),
            'baselineWindow' => (string)$base['windowId'],
            'endlineWindow' => (string)$end['windowId'],
            'satBaseline' => count($b), 'satEndline' => count($e), 'paired' => count($paired),
            'baselineMeanPct' => $b ? $pct(array_sum($b) / count($b)) : null,
            'endlineMeanPct' => $e ? $pct(array_sum($e) / count($e)) : null,
            /* The raw means always travel, whatever the scale — for a rate or a
               ladder they are the ONLY honest headline, and for a mark out of a
               total a reader still wants the number the marker wrote. */
            'baselineMean' => $b ? round(array_sum($b) / count($b), 2) : null,
            'endlineMean' => $e ? round(array_sum($e) / count($e), 2) : null,
            'unit' => $unit, 'scale' => $scale, 'pctMeaningful' => $pctOk, 'higherIsBetter' => $higherBetter,
            /* The paired means, over the SAME children — not the two cohort
               means above, which include people the other window never saw. */
            'pairedBaselinePct' => $stayedBaselines ? $pct(array_sum($stayedBaselines) / count($stayedBaselines)) : null,
            'pairedBaselineMean' => $stayedBaselines ? round(array_sum($stayedBaselines) / count($stayedBaselines), 2) : null,
            'gain' => $overall,
            'gainPct' => $pct($overall['mean'] === null ? null : (float)$overall['mean']),
            /* Whether the movement is GOOD, rather than whether it is upward.
               The two part company on any instrument where a fall is progress. */
            'improved' => $overall['mean'] === null ? null : ($higherBetter ? $overall['mean'] > 0 : $overall['mean'] < 0),
            'bySex' => $group($bySex), 'byBand' => $group($byBand), 'byCentre' => $group($byCentre),
            'attrition' => ['baselineOnly' => count($leftBaselines), 'endlineOnly' => max(0, count($e) - count($paired)),
                            'bias' => $attritionBias],
            'caveats' => assess_caveats($overall, count($b), count($paired), $attritionBias,
                ['scale' => $scale, 'unit' => $unit, 'higherIsBetter' => $higherBetter]),
        ];
    }
    return ['ok' => true, 'gains' => $out, 'minN' => ASSESS_MIN_N];
}

/**
 * What a reader should doubt, said by us before they have to work it out.
 *
 * This is not a disclaimer block. Each line here is a specific, checkable
 * limitation of THIS result, and the first one is the one that matters most:
 * there is no control group, so nothing in this file may be phrased as the
 * programme having caused anything.
 */
function assess_caveats(array $stat, int $satBaseline, int $paired, ?array $bias, array $inst = []): array {
    $out = [];
    $out[] = ['level' => 'method', 'text' =>
        'Pre/post with no comparison group. This measures how much these children changed, not how much of '
        . 'the change the programme caused — children also get older, and school continues around us.'];
    /* What the numbers on this instrument ARE. Both of these have been the
     * cause of a report saying the opposite of what the data showed. */
    $scale = (string)($inst['scale'] ?? 'points');
    $unit = (string)($inst['unit'] ?? '');
    if ($scale === 'rate') {
        $out[] = ['level' => 'method', 'text' =>
            'Scores are ' . ($unit !== '' ? $unit : 'a rate per minute') . '. There is no maximum, so the change is '
            . 'reported in that unit — a percentage of the paper would be a fraction of a number that does not exist.'];
    }
    if ($scale === 'level') {
        $out[] = ['level' => 'method', 'text' =>
            'Scores are positions on an ordinal ladder (' . ($unit !== '' ? $unit : 'levels') . '). The steps are '
            . 'ordered but not equally spaced, so the mean below describes movement rather than measuring an amount.'];
    }
    if (array_key_exists('higherIsBetter', $inst) && !$inst['higherIsBetter']) {
        $out[] = ['level' => 'method', 'text' =>
            'On this instrument a LOWER score is the better result, so a negative change is the improvement. '
            . 'Read every figure below with that in mind.'];
    }
    if ($stat['tooThin']) {
        $out[] = ['level' => 'error', 'text' =>
            'Only ' . $paired . ' child(ren) sat both papers. Under ' . ASSESS_MIN_N . ' pairs there is no mean worth quoting.'];
    }
    if ($satBaseline > 0 && $paired > 0 && $paired / $satBaseline < 0.7) {
        $out[] = ['level' => 'warn', 'text' =>
            round($paired / $satBaseline * 100) . '% of the children who sat the baseline came back for the endline. '
            . 'Below about 70% the paired group stops representing the cohort.'];
    }
    if ($bias && $bias['direction'] === 'leavers_were_weaker') {
        $out[] = ['level' => 'warn', 'text' =>
            'The children who did not return scored ' . abs($bias['deltaPoints']) . ' points lower at baseline than those who did. '
            . 'The gain below is therefore larger than the cohort as a whole achieved.'];
    }
    if ($bias && $bias['direction'] === 'leavers_were_stronger') {
        $out[] = ['level' => 'warn', 'text' =>
            'The children who did not return scored higher at baseline than those who did, so the gain below is '
            . 'if anything an understatement.'];
    }
    if (!$stat['tooThin'] && !$stat['significant']) {
        $out[] = ['level' => 'warn', 'text' =>
            'The interval on the change includes zero — on this sample the movement cannot be distinguished from noise.'];
    }
    return $out;
}
