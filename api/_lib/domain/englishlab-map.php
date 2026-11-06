<?php
declare(strict_types=1);

/**
 * English Lab — the map (owner, 6 Nov 2026: English is the third Lab).
 *
 * Eight stages of ten, EN-001 … EN-080, along the road a Nigerian learner walks in English Studies:
 * the words and sentences of JSS 1, building sentences in JSS 2, the sounds of English (speech
 * work), grammar in use in SS 1, reading and meaning in SS 2, writing well in SS 3, then Word Power
 * (roots, word families, collocations and the vocabulary of fields) and The Senior Paper (the summit).
 *
 * WHY THE LAST TWO STAGES (owner, 6 Nov 2026: "research more and improve the structure"):
 *   · the senior paper has four parts — essay, comprehension and summary, lexis and structure, and
 *     oral English — and asks things the first six stages did not teach: the grammatical name and
 *     function of a word or clause, summary as one point per sentence, consonant clusters and
 *     counting sounds, the semi-formal letter, and the four essay types;
 *   · morphology teaching helps vocabulary and spelling most when it is meaning-focused, and the
 *     syllabus asks for the vocabulary of fields (health, law, farming, the media) — Word Power;
 *   · learner-corpus grammar levels put mixed conditionals and modals of deduction last (B2);
 *   · summarising has one of the largest effects on writing, and grammar drilled in isolation does
 *     not improve it — so the summit is applied: summary, comprehension answers, whole-text types.
 * Stages 7 and 8 were APPENDED (topics keep their ids), so nobody's progress on 1–6 moved. This file is
 * the ONE place an English topic's id, stage, title, strand and prerequisites are declared; the
 * shared engine reads it only through the Lab registry (domain/labs.php). The questions are in the
 * five content modules (englishlab-*.php), built with the kit (englishlab-kit.php).
 *
 * The strands follow the English Studies curriculum's own: vocabulary, structure (grammar), speech
 * work, reading and comprehension, and composition. No exam body is named anywhere in this Lab.
 */

/** Stage number → [stage title, [10 topic titles in order]]. Append-only once learners have state. */
function eng_stage_table(): array {
    return [
        1 => ['Words and Sentences', [
            'Nouns: common, proper and collective',
            'Plurals of nouns',
            'Pronouns',
            'Verbs and the simple tenses',
            'Adjectives and comparison',
            'Adverbs',
            'Capital letters and full stops',
            'Commas and question marks',
            'Words people often misspell',
            'Synonyms and antonyms',
        ]],
        2 => ['Building Sentences', [
            'Subject–verb agreement',
            'Prepositions',
            'Joining sentences with conjunctions',
            'Question tags',
            'Continuous and perfect tenses',
            'Irregular verbs',
            'The apostrophe',
            'Homophones',
            'Prefixes and suffixes',
            'Articles: a, an and the',
        ]],
        3 => ['The Sounds of English', [
            'Short and long vowels',
            'Diphthongs',
            'The “th” sounds',
            'The “sh”, “ch”, “j” and “zh” sounds',
            'Silent letters',
            'Word stress',
            'Stress that changes a word',
            'Rhymes',
            'Emphatic stress',
            'Intonation',
        ]],
        4 => ['Grammar in Use', [
            'Active and passive voice',
            'Reported speech',
            'Conditional sentences',
            'Phrasal verbs',
            'Idioms',
            'Main and subordinate clauses',
            'Who, whom, whose and which',
            'Agreement with tricky subjects',
            'Modal verbs',
            'Gerunds and infinitives',
        ]],
        5 => ['Reading and Meaning', [
            'The main idea',
            'Reading between the lines',
            'Words in context',
            'Fact and opinion',
            'Simile, metaphor and personification',
            'Hyperbole, irony and euphemism',
            'Tone and mood',
            'Summary: the key points',
            'Formal and informal register',
            'Nearest and opposite in meaning',
        ]],
        6 => ['Writing Well', [
            'Combining sentences',
            'The formal letter',
            'The informal letter',
            'Topic sentences and paragraphs',
            'Linking words',
            'Saying it in fewer words',
            'Common errors in usage',
            'Semicolons, colons and dashes',
            'Writing for the occasion',
            'Building an argument',
        ]],
        7 => ['Word Power', [
            'Roots from Latin and Greek',
            'Word families',
            'Collocations: words that go together',
            'Words people confuse',
            'One word for many',
            'Words of health and medicine',
            'Words of law and government',
            'Words of farming, trade and money',
            'Words of the media, sport and technology',
            'What a sentence really means',
        ]],
        8 => ['The Senior Paper', [
            'The grammatical name of a word or phrase',
            'Clauses: their names and their jobs',
            'Comprehension answers in your own words',
            'Summary: one point, one sentence',
            'Counting sounds and syllables',
            'Consonant clusters',
            'The semi-formal letter',
            'Narrative and descriptive essays',
            'Expository and argumentative essays',
            'Mixed conditionals and “must have”',
        ]],
    ];
}

function eng_strands(): array {
    return [1 => 'Words & Sentences', 2 => 'Structure', 3 => 'Speech Work', 4 => 'Grammar in Use', 5 => 'Reading & Comprehension', 6 => 'Writing',
            7 => 'Vocabulary', 8 => 'The Senior Paper'];
}

/** The road in five bands — one table: the map, Progress and the hub read it. */
function eng_bands(): array {
    return [
        ['id' => 'eng-basics', 'name' => 'Foundations', 'level' => 'JSS 1–2 · English Studies', 'from' => 1, 'to' => 2,
         'what' => 'The parts of speech, tenses, punctuation, spelling and the rules that hold a sentence together.'],
        ['id' => 'eng-sounds', 'name' => 'Speech work', 'level' => 'JSS 2–3 · Oral English', 'from' => 3, 'to' => 3,
         'what' => 'Vowels and consonants, silent letters, stress, rhymes and intonation — how English is spoken.'],
        ['id' => 'eng-structure', 'name' => 'Grammar in use', 'level' => 'SS 1 · English Language', 'from' => 4, 'to' => 4,
         'what' => 'Voice, reported speech, conditionals, phrasal verbs, idioms, clauses and the agreement traps.'],
        ['id' => 'eng-reading', 'name' => 'Reading and meaning', 'level' => 'SS 2 · Comprehension and summary', 'from' => 5, 'to' => 5,
         'what' => 'Main ideas, inference, figures of speech, tone, register and choosing the points a summary needs.'],
        ['id' => 'eng-writing', 'name' => 'Writing well', 'level' => 'SS 3 · Composition', 'from' => 6, 'to' => 6,
         'what' => 'Joined sentences, letters, paragraphs, linking words, concise writing, usage errors and argument.'],
        ['id' => 'eng-words', 'name' => 'Word power', 'level' => 'SS 1–3 · Vocabulary development', 'from' => 7, 'to' => 7,
         'what' => 'Roots and word families, collocations, confusables, one-word substitutes and the vocabulary of fields.'],
        ['id' => 'eng-senior', 'name' => 'The senior paper', 'level' => 'SS 3 · The exam year', 'from' => 8, 'to' => 8, 'summit' => true,
         'what' => 'Grammatical names and functions, comprehension in your own words, summary, sounds and clusters, letters and essay types.'],
    ];
}

/** Where a topic needs something other than the topic before it (by topic number). */
function eng_edges(): array {
    return [
        11 => [4], 15 => [4], 16 => [4], 17 => [2], 20 => [1], 21 => [9], 28 => [21, 22],
        31 => [15, 16], 32 => [15, 3], 33 => [15], 37 => [3], 38 => [11], 40 => [16],
        41 => [10], 43 => [10], 48 => [41], 50 => [10, 43],
        51 => [13, 36], 52 => [7, 49], 53 => [52], 55 => [13], 56 => [51], 57 => [11, 12], 58 => [8], 60 => [54, 44],
        // Word Power rests on the topic each deepens; the Senior Paper on what it examines.
        61 => [19], 62 => [19], 63 => [10], 64 => [18], 65 => [10], 70 => [35, 43],
        71 => [1, 6], 72 => [36, 37], 73 => [42, 43], 74 => [48], 75 => [21, 26], 76 => [23, 24], 77 => [52, 53], 78 => [54], 79 => [60], 80 => [33, 39],
    ];
}

function eng_courses(): array {
    return [
        'english-foundations' => ['id' => 'english-foundations', 'title' => 'English Foundations', 'stages' => [1, 2],
            'promise' => 'Nouns, pronouns, verbs and tenses, agreement, prepositions, punctuation, spelling and the small words that trip people up.',
            'for' => 'JSS 1 to JSS 2 English Studies, and anyone filling gaps', 'hours' => 20],
        'english-speech' => ['id' => 'english-speech', 'title' => 'Speech Work', 'stages' => [3],
            'promise' => 'The vowels and consonants of English, silent letters, word and sentence stress, rhymes and intonation.',
            'for' => 'JSS 2 to SS 3 Oral English', 'hours' => 10],
        'english-grammar' => ['id' => 'english-grammar', 'title' => 'Grammar in Use', 'stages' => [4],
            'promise' => 'Active and passive, reported speech, conditionals, phrasal verbs, idioms, clauses, who and whom, and modal verbs.',
            'for' => 'SS 1 English Language', 'hours' => 10],
        'english-reading' => ['id' => 'english-reading', 'title' => 'Reading and Meaning', 'stages' => [5],
            'promise' => 'Comprehension that goes past the words: main ideas, inference, figures of speech, tone, register and summary.',
            'for' => 'SS 2 comprehension and summary', 'hours' => 10],
        'english-writing' => ['id' => 'english-writing', 'title' => 'Writing Well', 'stages' => [6],
            'promise' => 'Sentences joined well, letters laid out properly, paragraphs with a point, the linking words that carry an argument, and the usage errors to stop making.',
            'for' => 'SS 3 composition', 'hours' => 10],
        'english-word-power' => ['id' => 'english-word-power', 'title' => 'Word Power', 'stages' => [7],
            'promise' => 'Latin and Greek roots, word families, collocations, the words people confuse, one-word substitutes and the vocabulary of health, law, farming, money, the media and sport.',
            'for' => 'SS 1 to SS 3, and anyone growing their vocabulary', 'hours' => 10],
        'english-senior-paper' => ['id' => 'english-senior-paper', 'title' => 'The Senior Paper', 'stages' => [8],
            'promise' => 'What the senior English paper asks: grammatical names and functions, comprehension in your own words, summary one point at a time, sounds and clusters, the semi-formal letter and the four essay types.',
            'for' => 'SS 3 and the exam year', 'hours' => 10],
    ];
}

/**
 * The timed English paper: forty four-option questions in forty minutes across the whole road,
 * drawn fresh each time from this Lab's own questions. The score is out of 100, by strand.
 */
function eng_papers(): array {
    return ['eng' => ['id' => 'eng', 'title' => 'Timed English paper', 'exam' => 'eng', 'n' => 40, 'minutes' => 40, 'stages' => [1, 8], 'typed' => 0,
        'what' => '40 questions in 40 minutes: lexis and structure, speech work, comprehension and usage. Every paper is new.']];
}

/** What sits behind the name on an English certificate (documents.php), in the order a learner meets it. */
function eng_formulas(): array {
    return ['Subject + Verb + Object', 'a · an · the', 'I · you · he · she · it · we · they', 'go · went · gone', 'big · bigger · biggest',
            'its ≠ it’s', 'their · there · they’re', '/iː/ · /ɪ/', '/eɪ/ · /aɪ/ · /ɔɪ/', '/θ/ · /ð/', '/ʃ/ · /tʃ/ · /dʒ/ · /ʒ/', 'REcord · reCORD',
            'isn’t it?', 'was written by', 'He said that…', 'If I were…', 'who · whom · whose', 'as brave as a lion', 'Yours faithfully', '; · : · —', 'bio · graph · tele', 'make a decision', 'affect ≠ effect', '/str/ · /spl/', 'Yours sincerely', 'must have gone'];
}
