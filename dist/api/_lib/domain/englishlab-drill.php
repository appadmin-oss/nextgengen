<?php
declare(strict_types=1);

/**
 * English Lab — the exam-trap drills (owner, 7 Nov 2026: "Improve the grammar rules. Follow the
 * concept of the lab. Becoming Gods", with a concord / lexis / oral English training pack to adapt).
 *
 * The concept is the Maths Lab's Gods of Maths brief — "make things tough, but easy": the questions
 * are the traps the senior exam really sets (concord with "one of those who", "neither she nor I",
 * "the jury … their"; synonyms offered as opposites; "ea" with four sounds; -ity pulling the stress;
 * rhymes that the spelling hides), and no question is left bare — every wrong option names the slip
 * behind it, and the rule is taught first (englishlab-teach.php).
 *
 * The pack was ADAPTED, not copied, and corrected where it was wrong: a collective noun is plural
 * when its members act separately (the jury ARE divided in THEIR opinion), so "collective nouns are
 * singular" is not taught as a rule; British English SAYS the h in "herb" and the l in "salt"; the
 * stress of "nation" and "university" is NA-tion and u-ni-VER-si-ty; "content" (satisfied) is
 * con-TENT and the noun is CON-tent; "politics" is the classic exception to the -ics rule; and an
 * item whose sentence did not decide its answer ("met with widespread ___") was given the clause
 * that does. No exam body is named anywhere a learner reads.
 *
 * APPEND ONLY, like everything in this Lab: these forms go AFTER each topic's own forms (and after
 * the articulation forms), so no form a stored session points at changes its number.
 */
function eng_drill_forms(): array {
    $forms = [
    'EN-011' => [
        eng_choose([
            ['The quality of the mangoes ___ not good.', 'is', [['are', 'Matched to the nearest noun, “mangoes”. Cross out “of the mangoes”: the quality is.'], ['were', 'Plural, and the subject (the quality) is one.'], ['have been', 'Plural helper; the subject is singular.']], 'The subject is “the quality”; “of the mangoes” only describes it.'],
            ['Each of the students ___ expected to bring a pen.', 'is', [['are', '“Each” is singular whatever follows “of”.'], ['were', 'Plural; “each” takes a singular verb.'], ['have been', 'Plural; “each” takes a singular verb.']], 'Each … is.'],
            ['The news ___ shocking to everyone present.', 'was', [['were', '“News” ends in -s but is one uncountable thing: singular.'], ['are', 'Plural, and “news” is singular.'], ['have been', 'Plural helper.']], 'News is singular despite its -s.'],
            ['Mathematics ___ my favourite subject.', 'is', [['are', 'Subjects ending in -ics (mathematics, physics, economics) name ONE subject: singular.'], ['were', 'Plural and past.'], ['have been', 'Plural helper.']], 'One subject, one verb: is.'],
            ['Two hours ___ not enough time to finish the exam.', 'is', [['are', 'Here “two hours” is one AMOUNT of time, not two separate hours.'], ['were', 'Plural; an amount taken as a total is singular.'], ['have been', 'Plural helper.']], 'Amounts of time, money and distance taken as one total are singular.'],
            ['The teacher, together with his students, ___ going on a trip.', 'is', [['are', '“Together with his students” is extra information between commas; only “and” makes a subject plural.'], ['were', 'Plural; the subject is still “the teacher”.'], ['have been', 'Plural helper.']], 'Together with, along with, as well as: the subject does not change.'],
            ['Politics ___ a dirty game in many countries.', 'is', [['are', '“Politics” here is one activity: singular, like mathematics.'], ['were', 'Plural and past.'], ['have been', 'Plural helper.']], 'Politics, as an activity, is singular.'],
            ['One of the windows ___ broken during the storm.', 'was', [['were', 'The subject is “one”, not “windows”.'], ['are', 'Plural, and the storm is past.'], ['have been', 'Plural helper.']], '“One of …” is singular: one was broken.'],
            ['The scissors ___ on the table.', 'are', [['is', '“Scissors” (like trousers, spectacles, pliers) is always plural.'], ['was', 'Singular; scissors is a plural noun.'], ['has been', 'Singular helper.']], 'Scissors are; “a pair of scissors is”.'],
            ['The bag, along with the books, ___ missing.', 'is', [['are', '“Along with the books” does not join a second subject; the subject is “the bag”.'], ['were', 'Plural.'], ['have been', 'Plural helper.']], 'The bag is missing.'],
        ], 'Choose the verb that agrees: {q}', 'Cross out everything between the subject and the verb, then match.'),
    ],
    'EN-038' => [
        eng_choose([
            ['The jury ___ divided in their opinion.', 'are', [['is', '“Divided” and “their” show the members acting separately, so the verb is plural.'], ['was', 'Singular; the jury here is a set of people who disagree.'], ['has', '“Has divided” would need an object; and the members act separately: plural.']], 'A collective noun is plural when its members act as individuals (their).'],
            ['Neither James nor his friends ___ attending the party.', 'are', [['is', 'The verb agrees with the NEARER subject: friends.'], ['was', 'The nearer subject, friends, is plural.'], ['has been', 'Singular helper for a plural nearer subject.']], 'Neither … nor: agree with the nearer subject.'],
            ['She is one of those teachers who ___ always late.', 'are', [['is', 'The favourite trap: “who” stands for “those teachers”, not for “she”.'], ['was', 'Singular, and “who” stands for a plural noun.'], ['has been', 'Singular helper.']], 'One of those … who → plural verb.'],
            ['She is the only one of the girls who ___ always on time.', 'is', [['are', '“The only one” narrows it to one person; “who” stands for “one”.'], ['were', 'Plural.'], ['have been', 'Plural helper.']], 'The only one of … who → singular (compare: one of those who → plural).'],
            ['Everyone in the two buses ___ injured in the accident.', 'was', [['were', '“Everyone” is singular; “in the two buses” does not change it.'], ['are', 'Plural and present.'], ['have been', 'Plural helper.']], 'Everyone, nobody, someone, each: singular.'],
            ['The committee ___ yet to submit its report.', 'is', [['are', '“Its report” shows the committee acting as one body: singular.'], ['have', '“Have” is plural; “its” shows one body.'], ['were', 'Plural and past.']], 'Acting as one body (its): singular.'],
            ['Neither the principal nor the teachers ___ happy with the result.', 'are', [['is', 'The nearer subject, teachers, is plural.'], ['was', 'Singular verb for a plural nearer subject.'], ['has been', 'Singular helper.']], 'The nearer subject decides: teachers are.'],
            ['The group of soldiers ___ marching toward the town.', 'is', [['are', 'The subject is “the group” (one); “of soldiers” describes it.'], ['were', 'Plural.'], ['have been', 'Plural helper.']], 'The group is.'],
            ['Neither she nor I ___ responsible for the mistake.', 'am', [['is', 'Agree with the nearer subject, “I”: I am.'], ['are', '“Are” fits neither “she” nor “I”.'], ['were', '“Were” does not go with “I” in a statement.']], 'Nearer subject “I” → am.'],
            ['The family ___ quarrelling among themselves.', 'are', [['is', '“Among themselves” shows the members acting separately: plural.'], ['has been', 'Singular helper.'], ['was', 'Singular.']], 'Members acting separately (themselves): plural.'],
            ['Each boy and each girl ___ given a prize.', 'was', [['were', 'With “each … and each”, every subject is taken one at a time: singular.'], ['are', 'Plural and present.'], ['have been', 'Plural helper.']], 'Each … and each → singular.'],
            ['Neither of the two answers ___ correct.', 'is', [['are', '“Neither of” is singular: not this one, not that one.'], ['were', 'Plural.'], ['have been', 'Plural helper.']], 'Neither of … is.'],
        ], 'Choose the verb that agrees: {q}', 'Ask what the subject really is — and what “who”, “its” or “their” points to.'),
        eng_spot([
            [['She is', 'one of those girls', 'who is', 'always late.'], 2, 'who are', '“Who” stands for “those girls”: who are.'],
            [['Neither she', 'nor I', 'is', 'to blame.'], 2, 'am', 'The nearer subject is “I”: I am.'],
            [['The committee', 'have', 'submitted', 'its report.'], 1, 'has', '“Its” shows one body: has.'],
            [['Everyone', 'in the two buses', 'were', 'injured.'], 2, 'was', '“Everyone” is singular.'],
        ], 'Find the verb, then ask what its subject really is.'),
    ],
    'EN-043' => [
        eng_choose([
            ['The soldier was commended for his ___ in battle.', 'valour', [['cowardice', 'A soldier is not commended (praised) for cowardice: it is the opposite.'], ['laziness', 'Nobody is praised for laziness.'], ['retreat', 'Retreat is an action, and not one that earns praise in battle.']], '“Commended” (praised) needs a good quality: valour, courage.'],
            ['The lecturer spoke in a very ___ manner; nobody understood him.', 'abstruse', [['lucid', 'Lucid means clear — the opposite of what “nobody understood him” needs.'], ['simple', 'A simple manner would be understood.'], ['direct', 'Directness does not stop understanding.']], 'Abstruse = hard to understand. The clause after the semicolon decides.'],
            ['His ___ behaviour at the ceremony embarrassed his family.', 'boorish', [['decorous', 'Decorous means proper and polite: it would not embarrass anyone.'], ['dignified', 'Dignified behaviour makes a family proud.'], ['respectful', 'Respect does not embarrass.']], 'Boorish = rude and rough. “Embarrassed” decides.'],
            ['The doctor advised him to ___ from alcohol completely.', 'abstain', [['indulge', 'The opposite; and we say “indulge IN”, not “from”.'], ['consume', 'A doctor’s advice, “completely”, and “from” all point the other way.'], ['request', 'You request something, not “request from alcohol”.']], 'Abstain from = keep away from. The preposition “from” helps.'],
            ['The new tax was met with widespread ___; traders shut their shops in protest.', 'opposition', [['approval', 'Traders protesting is not approval.'], ['acceptance', 'Shutting shops in protest is not acceptance.'], ['celebration', 'A protest is not a celebration.']], 'The clause after the semicolon decides: opposition.'],
            ['The accused was found guilty and sentenced to ___ imprisonment; he will never be released.', 'perpetual', [['temporary', '“Never be released” rules out temporary.'], ['partial', 'There is no partial imprisonment.'], ['occasional', 'Imprisonment is not occasional.']], 'Perpetual = lasting for ever.'],
            ['Despite being the youngest, she showed remarkable ___ in handling the crisis.', 'composure', [['immaturity', '“Despite … the youngest” sets up a contrast: something to her credit.'], ['confusion', 'Not “remarkable” in a good sense.'], ['panic', 'The opposite of what the contrast needs.']], 'Composure = calm control. “Despite” signals the contrast.'],
        ], 'Choose the option that best fills the gap: {q}', 'Find the word in the sentence that decides the meaning — a contrast, a cause or a result.'),
    ],
    'EN-050' => [
        eng_choose([
            ['“AMBIGUOUS”', 'uncertain', [['clear', 'The opposite: ambiguous means open to more than one meaning.'], ['precise', 'Also close to the opposite.'], ['angry', 'Not related to the meaning.']], 'Ambiguous = with more than one possible meaning; unclear, uncertain.'],
            ['“GARRULOUS”', 'talkative', [['silent', 'The opposite.'], ['aggressive', 'Not the meaning.'], ['timid', 'Not the meaning.']], 'Garrulous = talking too much.'],
            ['“OBSOLETE”', 'outdated', [['modern', 'The opposite.'], ['useful', 'Not the meaning.'], ['relevant', 'Close to the opposite.']], 'Obsolete = no longer in use.'],
            ['“TRANSIENT”', 'temporary', [['permanent', 'The opposite.'], ['strong', 'Not the meaning.'], ['distant', 'Not the meaning.']], 'Transient = lasting a short time.'],
            ['“PENSIVE”', 'thoughtful', [['happy', 'Not the meaning.'], ['angry', 'Not the meaning.'], ['confused', 'A pensive person is deep in thought, not muddled.']], 'Pensive = deep in serious thought.'],
            ['“CAPRICIOUS”', 'unpredictable', [['predictable', 'The opposite.'], ['stable', 'Close to the opposite.'], ['calm', 'Not the meaning.']], 'Capricious = changing suddenly, without reason (from “caprice”, a whim).'],
            ['“VINDICTIVE”', 'revengeful', [['forgiving', 'The opposite.'], ['generous', 'Not the meaning.'], ['calm', 'Not the meaning.']], 'Vindictive = wanting revenge.'],
        ], 'Choose the word NEAREST in meaning to {q}', 'Say your own meaning before you look; the opposite is always offered as a trap.'),
        eng_choose([
            ['“BENEVOLENT”', 'malevolent', [['kind', 'A synonym, not the opposite.'], ['generous', 'A synonym, not the opposite.'], ['peaceful', 'Not the opposite.']], 'bene- (good) ↔ male- (bad): benevolent ↔ malevolent.'],
            ['“FRUGAL”', 'wasteful', [['careful', 'Close to a synonym.'], ['economical', 'A synonym of frugal.'], ['thrifty', 'A synonym of frugal.']], 'Frugal = careful with money; the opposite is wasteful.'],
            ['“VERBOSE”', 'concise', [['talkative', 'Close to a synonym.'], ['lengthy', 'A synonym of verbose.'], ['wordy', 'A synonym of verbose.']], 'Verbose = using too many words; the opposite is concise.'],
            ['“TRANSPARENT”', 'opaque', [['clear', 'A synonym.'], ['obvious', 'A synonym in another sense.'], ['bright', 'Not the opposite.']], 'Transparent ↔ opaque.'],
            ['“DILIGENT”', 'lazy', [['hardworking', 'A synonym.'], ['careful', 'Close to a synonym.'], ['focused', 'Close to a synonym.']], 'Diligent = hardworking; the opposite is lazy.'],
            ['“ELOQUENT”', 'inarticulate', [['fluent', 'A synonym.'], ['articulate', 'A synonym.'], ['expressive', 'A synonym.']], 'Eloquent ↔ inarticulate.'],
        ], 'Choose the word OPPOSITE in meaning to {q}', 'Three of the options are usually synonyms: do not fall for them.'),
    ],
    'EN-021' => [
        eng_choose([
            ['beat', 'meet', [['bread', '“ea” in bread is /e/.'], ['bear', '“ea” in bear is the glide /eə/.'], ['heart', '“ea” in heart is /ɑː/.']], '“ea” makes four sounds: beat /iː/, bread /e/, bear /eə/, heart /ɑː/.'],
            ['bread', 'said', [['bead', '/iː/, the long sound.'], ['braid', '/eɪ/, a glide.'], ['bride', '/aɪ/, a glide.']], 'bread /bred/ and said /sed/ share the short /e/.'],
            ['book', 'put', [['food', '“oo” in food is the long /uː/.'], ['blood', '“oo” in blood is /ʌ/.'], ['boot', '/uː/, long.']], '“oo” makes three sounds: book /ʊ/, food /uː/, blood /ʌ/.'],
            ['blood', 'love', [['food', '/uː/.'], ['good', '/ʊ/.'], ['mood', '/uː/.']], 'blood /blʌd/ and love /lʌv/ share /ʌ/, as in cup.'],
            ['bird', 'heard', [['beard', '“ear” in beard is /ɪə/.'], ['bared', '/eə/.'], ['bad', '/æ/.']], 'bird, heard, word, turn and journey all share /ɜː/.'],
            ['come', 'sum', [['home', '/əʊ/.'], ['comb', '/əʊ/; the b is silent.'], ['calm', '/ɑː/; the l is silent.']], 'come /kʌm/ and sum /sʌm/ share /ʌ/.'],
            ['heart', 'calm', [['hurt', '/ɜː/.'], ['hear', '/ɪə/.'], ['hat', '/æ/, short.']], 'heart /hɑːt/ and calm /kɑːm/ share the long /ɑː/.'],
        ], 'Which word has the same vowel sound as “{q}”? Say it — do not trust the spelling.', 'Same letters can make different sounds; different letters can make the same one.'),
    ],
    'EN-022' => [
        eng_choose([
            ['know', 'show', [['now', '“ow” in now is /aʊ/.'], ['cow', '/aʊ/.'], ['how', '/aʊ/.']], '“ow” is /əʊ/ in know, show, low — and /aʊ/ in now, cow, how. Learn each word.'],
            ['now', 'cow', [['know', '/əʊ/.'], ['show', '/əʊ/.'], ['low', '/əʊ/.']], 'now /naʊ/ and cow /kaʊ/ share /aʊ/.'],
            ['near', 'here', [['bear', '“ear” in bear is /eə/.'], ['heart', '/ɑː/.'], ['learn', '/ɜː/.']], '“ear” has four sounds: near /ɪə/, bear /eə/, heart /ɑː/, learn /ɜː/.'],
            ['bear', 'there', [['beer', '/ɪə/: it starts on a different vowel.'], ['bar', '/ɑː/.'], ['burn', '/ɜː/.']], 'bear /beə/ and there /ðeə/ share /eə/.'],
            ['out', 'house', [['could', '“ou” in could is /ʊ/.'], ['soup', '/uː/.'], ['though', '/əʊ/.']], '“ou” has six sounds: out /aʊ/, could /ʊ/, enough /ʌ/, through /uː/, though /əʊ/, bought /ɔː/.'],
            ['eight', 'great', [['height', '“eigh” in height is /aɪ/.'], ['heat', '/iː/.'], ['bet', '/e/, short.']], 'eight /eɪt/ and great /greɪt/ share /eɪ/.'],
        ], 'Which word has the same vowel sound as “{q}”?', 'Say the whole word: the glide is what matters.'),
    ],
    'EN-024' => [
        eng_choose([
            ['In which word is “ch” said /k/, as in “kite”?', 'chemistry', [['church', '/tʃ/, the usual English ch.'], ['chef', '/ʃ/: a French word.'], ['cheese', '/tʃ/.']], 'Greek-origin words: ch = /k/ (chemistry, character, chorus, stomach).'],
            ['In which word is “ch” said /k/, as in “kite”?', 'character', [['chair', '/tʃ/.'], ['machine', '/ʃ/: French.'], ['child', '/tʃ/.']], 'character /ˈkærəktə/: Greek ch.'],
            ['In which word is “ch” said /k/, as in “kite”?', 'chorus', [['choose', '/tʃ/.'], ['chance', '/tʃ/.'], ['champagne', '/ʃ/: French.']], 'chorus /ˈkɔːrəs/: Greek ch.'],
            ['In which word is “ch” said /ʃ/, as in “shoe”?', 'machine', [['chemist', '/k/: Greek.'], ['church', '/tʃ/.'], ['chin', '/tʃ/.']], 'machine /məˈʃiːn/: French ch.'],
            ['In which word is “ch” said /ʃ/, as in “shoe”?', 'brochure', [['chord', '/k/: Greek.'], ['chip', '/tʃ/.'], ['stomach', '/k/.']], 'brochure /ˈbrəʊʃə/: French ch.'],
            ['In which word is “ch” said /tʃ/, as in “church”?', 'teacher', [['stomach', '/k/.'], ['echo', '/k/.'], ['parachute', '/ʃ/: French.']], 'teacher /ˈtiːtʃə/: the usual ch.'],
        ], '', 'Science and music words: /k/. French words: /ʃ/. Everyday words: /tʃ/.'),
    ],
    'EN-025' => [
        eng_choose([
            ['psychology', 'p', [['s', 'Spoken.'], ['y', 'Spoken as /aɪ/.'], ['g', 'Spoken as /dʒ/.']], 'ps- at the start of a Greek word: silent p.'],
            ['pneumonia', 'p', [['n', 'Spoken.'], ['m', 'Spoken.'], ['o', 'Spoken.']], 'pn- at the start: silent p.'],
            ['receipt', 'p', [['c', 'Spoken as /s/.'], ['t', 'Spoken.'], ['r', 'Spoken.']], 'receipt /rɪˈsiːt/: silent p.'],
            ['column', 'n', [['l', 'Spoken.'], ['m', 'Spoken.'], ['c', 'Spoken as /k/.']], '-mn at the end: silent n (autumn, column, solemn, hymn).'],
            ['wrist', 'w', [['r', 'Spoken.'], ['s', 'Spoken.'], ['t', 'Spoken.']], 'wr- at the start: silent w.'],
            ['sword', 'w', [['s', 'Spoken.'], ['r', 'Part of the vowel /ɔː/ in British speech, but the w is the letter never sounded.'], ['d', 'Spoken.']], 'sword /sɔːd/: silent w.'],
            ['salmon', 'l', [['s', 'Spoken.'], ['m', 'Spoken.'], ['n', 'Spoken.']], 'salmon /ˈsæmən/: silent l.'],
            ['muscle', 'c', [['m', 'Spoken.'], ['s', 'Spoken.'], ['l', 'Spoken.']], 'muscle /ˈmʌsl/: silent c.'],
            ['subtle', 'b', [['s', 'Spoken.'], ['t', 'Spoken.'], ['l', 'Spoken.']], 'subtle /ˈsʌtl/: silent b, as in debt and doubt.'],
            ['castle', 't', [['c', 'Spoken.'], ['s', 'Spoken.'], ['l', 'Spoken.']], '-stle: silent t (castle, whistle, bustle).'],
        ], 'Which letter is silent in “{q}”?', 'ps-, pn-, wr-, -mn, -mb, -stle: the pattern tells you.'),
        eng_choose([
            ['Which word has NO silent letter?', 'wolf', [['walk', 'Silent l.'], ['half', 'Silent l.'], ['calm', 'Silent l.']], 'In wolf the l is spoken.'],
            ['Which word has NO silent letter?', 'hotel', [['hour', 'Silent h.'], ['honest', 'Silent h.'], ['heir', 'Silent h.']], 'In hotel the h is spoken.'],
            ['Which word has NO silent letter?', 'signature', [['sign', 'Silent g.'], ['design', 'Silent g.'], ['foreign', 'Silent g.']], 'In signature the g is spoken: add a vowel suffix and it returns.'],
            ['Which word has NO silent letter?', 'autumnal', [['autumn', 'Silent n.'], ['column', 'Silent n.'], ['solemn', 'Silent n.']], 'autumn → au-TUM-nal: the n comes back before a vowel suffix.'],
            ['Which word has NO silent letter?', 'salt', [['talk', 'Silent l.'], ['chalk', 'Silent l.'], ['palm', 'Silent l.']], 'In salt the l is spoken.'],
            ['Which word has NO silent letter?', 'herb', [['honour', 'Silent h.'], ['hour', 'Silent h.'], ['honest', 'Silent h.']], 'British English says the h in herb: /hɜːb/.'],
        ], '', 'Watch for the exceptions to the patterns.'),
    ],
    'EN-026' => [
        eng_choose([
            ['competition', 'compeTItion', [['COMpetition', 'Words in -tion stress the syllable just before it.'], ['comPEtition', 'That is the stress of “compete”, not of “competition”.'], ['competiTION', '-tion itself is never stressed.']], 'com-pe-TI-tion.'],
            ['university', 'uniVERsity', [['UNiversity', 'Words in -ity stress the syllable just before it.'], ['uNIversity', 'The syllable before -ity is “ver”, not “ni”.'], ['universiTY', 'The ending is never stressed.']], 'u-ni-VER-si-ty.'],
            ['musician', 'muSIcian', [['MUsician', 'That is the stress of “music”.'], ['musiCIAN', '-cian itself is never stressed.'], ['MU-SI-CIAN', 'Only one main stress.']], 'mu-SI-cian: just before -cian.'],
            ['photographic', 'photoGRAphic', [['PHOtographic', 'That is the stress of “photograph”.'], ['phoTOgraphic', 'That is the stress of “photography”.'], ['photograPHIC', '-ic itself is not stressed.']], 'pho-to-GRA-phic: just before -ic.'],
            ['politics', 'POlitics', [['poLItics', 'The -ics rule would say “li”, but politics is the classic exception. Political follows the rule: po-LI-ti-cal.'], ['poliTICS', 'The ending is not stressed.'], ['PO-LI-TICS', 'Only one main stress.']], 'PO-li-tics: an exception, with Arabic and lunatic.'],
            ['Arabic', 'ARabic', [['aRAbic', 'The -ic rule would say “ra”, but Arabic is an exception.'], ['araBIC', 'The ending is not stressed.'], ['A-RA-BIC', 'Only one main stress.']], 'A-ra-bic: an exception to the -ic rule.'],
            ['curiosity', 'curiOSity', [['CUriosity', 'That is the stress of “curious”; -ity moves it.'], ['cuRIosity', 'The syllable before -ity is “os”.'], ['curiosiTY', 'The ending is never stressed.']], 'cu-ri-OS-i-ty: just before -ity.'],
        ], 'Which shows the right stress (capitals mark the stressed syllable) for “{q}”?', 'Find the ending first: -tion, -sion, -cian, -ic, -ity stress the syllable just before it.'),
    ],
    'EN-027' => [
        eng_choose([
            ['I am content with my result. (content: satisfied)', 'conTENT', [['CONtent', 'That is the noun: the contents of a box or a book.'], ['CON-TENT', 'Only one main stress.'], ['con-tent (no stress)', 'Every word has one main stress.']], 'The adjective is con-TENT; the noun is CON-tent.'],
            ['Camels cross the desert. (desert: dry land)', 'DEsert', [['deSERT', 'That is the verb: to abandon.'], ['DE-SERT', 'Only one main stress.'], ['de-sert (no stress)', 'Every word has one main stress.']], 'Noun: DE-sert.'],
            ['A soldier must never desert his post. (desert: abandon)', 'deSERT', [['DEsert', 'That is the noun: dry land.'], ['DE-SERT', 'Only one main stress.'], ['de-sert (no stress)', 'Every word has one main stress.']], 'Verb: de-SERT.'],
            ['The convict escaped from prison. (convict: a prisoner)', 'CONvict', [['conVICT', 'That is the verb: to find guilty.'], ['CON-VICT', 'Only one main stress.'], ['con-vict (no stress)', 'Every word has one main stress.']], 'Noun: CON-vict.'],
            ['Do not insult your elders. (insult: verb)', 'inSULT', [['INsult', 'That is the noun.'], ['IN-SULT', 'Only one main stress.'], ['in-sult (no stress)', 'Every word has one main stress.']], 'Verb: in-SULT.'],
            ['The conflict between the villages lasted years. (conflict: noun)', 'CONflict', [['conFLICT', 'That is the verb: to clash.'], ['CON-FLICT', 'Only one main stress.'], ['con-flict (no stress)', 'Every word has one main stress.']], 'Noun: CON-flict.'],
        ], 'How is the word stressed in this sentence? {q}', 'Naming a thing: first syllable. Doing something: second.'),
    ],
    'EN-028' => [
        eng_choose([
            ['love', 'glove', [['move', '/uː/: same letters, different sound.'], ['stove', '/əʊ/.'], ['grove', '/əʊ/.']], 'love /lʌv/ and glove /glʌv/.'],
            ['word', 'bird', [['cord', '/ɔː/.'], ['sword', '/ɔː/; the w is silent.'], ['ward', '/ɔː/.']], 'word /wɜːd/ and bird /bɜːd/.'],
            ['hour', 'power', [['pour', '/ɔː/.'], ['four', '/ɔː/.'], ['tour', '/ʊə/.']], 'hour /aʊə/ (silent h) and power /paʊə/.'],
            ['buy', 'high', [['boy', '/ɔɪ/.'], ['bay', '/eɪ/.'], ['bee', '/iː/.']], 'buy /baɪ/ and high /haɪ/.'],
            ['done', 'sun', [['gone', '/ɒ/ in British English.'], ['bone', '/əʊ/.'], ['dune', '/uː/.']], 'done /dʌn/ and sun /sʌn/.'],
            ['key', 'free', [['they', '/eɪ/.'], ['eye', '/aɪ/.'], ['kit', '/ɪ/, short.']], 'key /kiː/ and free /friː/.'],
        ], 'Which word rhymes with “{q}”?', 'Say it aloud: rhyme is the sound of the stressed vowel and what follows.'),
        eng_choose([
            ['Which pair does NOT rhyme?', 'pint / mint', [['blood / mud', 'They rhyme: /ʌd/.'], ['said / bed', 'They rhyme: /ed/.'], ['shoe / blue', 'They rhyme: /uː/.']], 'pint /paɪnt/, mint /mɪnt/.'],
            ['Which pair does NOT rhyme?', 'wind (moving air) / mind', [['heart / cart', 'They rhyme: /ɑːt/.'], ['eight / late', 'They rhyme: /eɪt/.'], ['word / bird', 'They rhyme: /ɜːd/.']], 'The noun wind is /wɪnd/; only the verb (to wind a clock) rhymes with mind.'],
            ['Which pair does NOT rhyme?', 'cough / though', [['through / flew', 'They rhyme: /uː/.'], ['bear / there', 'They rhyme: /eə/.'], ['come / sum', 'They rhyme: /ʌm/.']], 'cough /kɒf/, though /ðəʊ/.'],
        ], '', 'Spelling is irrelevant to rhyme.'),
    ],
    ];
    foreach (eng_gods_practice_forms() as $id => $extra) {
        $forms[$id] = array_merge($forms[$id] ?? [], $extra);
    }
    foreach (eng_gods_reasoning_forms() as $id => $extra) {
        $forms[$id] = array_merge($forms[$id] ?? [], $extra);
    }
    return $forms;
}

/** Bounded production practice, appended after all historical drill forms. */
function eng_gods_practice_forms(): array {
    return [
    'EN-001' => [eng_type([
        ['Copy the proper noun: “The pupils travelled to Ibadan.”', 'Ibadan', [], 'Ibadan names a particular city; pupils is a common noun.'],
        ['Copy the collective noun: “A flock of birds crossed the field.”', 'flock', [], 'Flock names a group; birds names its individual members.'],
    ], '{q}', 'Ask whether the noun names a particular place or a group.', 'reasoning')],
    'EN-002' => [eng_type([
        ['One shelf, three ___. Use the plural of shelf.', 'shelves', [], 'Shelf changes f to v before -es: shelves.'],
        ['One child, four ___. Use the plural of child.', 'children', [], 'Children is an irregular plural; adding -s does not form it.'],
        ['One story, two ___. Use the plural of story.', 'stories', [], 'Consonant + y changes to -ies.'],
    ], '{q}', 'Check whether this noun follows a regular pattern or changes form.')],
    'EN-003' => [eng_type([
        ['Use I or me: “The librarian handed the book to Sade and ___.”', 'me', [], 'After to, use the object form. Removing Sade and leaves to me.'],
        ['Use he or him: “Musa and ___ organised the shelves.”', 'he', [], 'The coordinated phrase is the subject. Removing Musa and leaves he organised.'],
    ], '{q}', 'Remove the other person and check the pronoun’s job.', 'reasoning')],
    'EN-004' => [eng_type([
        ['Use the simple past of carry: “Yesterday, Ada ___ the books home.”', 'carried', [], 'For carry, consonant + y changes to i before -ed.'],
        ['Use the simple present of wash: “Every Saturday, Musa ___ his uniform.”', 'washes', [], 'The singular subject takes washes in a simple-present habit.'],
        ['Use the base form of leave: “We will ___ at noon.”', 'leave', [], 'Will takes the base verb, not left or leaves.'],
    ], '{q}', 'Use the requested tense and match the subject.')],
    'EN-005' => [eng_type([
        ['Use the comparative of careful: “Ada is ___ than she was yesterday.”', 'more careful', [], 'Careful uses more in its comparative, not carefuler.'],
        ['Use the superlative of small: “This is the ___ box of the five.”', 'smallest', [], 'A superlative identifies the highest degree within the group.'],
    ], '{q}', 'Comparative compares; superlative selects within a group.')],
    'EN-006' => [eng_type([
        ['Change careful into the adverb: “She checked the figures ___.”', 'carefully', [], 'The word modifies checked, so use the adverb carefully.'],
        ['Change happy into the adverb: “The children waved ___.”', 'happily', [], 'Happy becomes happily: y changes to i before -ly.'],
    ], '{q}', 'Describe how the action happens, using the adverb.')],
    'EN-007' => [eng_type([
        ['Rewrite with correct capitals and a final full stop: “sade lives in kano”', 'Sade lives in Kano.', [], 'Capitalise the sentence beginning and both proper names, then add a full stop.'],
        ['Rewrite with correct capitals and a final full stop: “i read on mondays”', 'I read on Mondays.', [], 'I and the name of the day need capitals.'],
    ], '{q}', 'Check the sentence start, names, I and the final mark.', 'procedure', 45, ['case'=>true, 'punct'=>true])],
    'EN-008' => [eng_type([
        ['Add just the missing direct-address comma: “Musa please wait.”', 'Musa, please wait.', [], 'Musa is the person addressed; separate the name from the request.'],
        ['Replace just the incorrect final mark: “Where is the bus.”', 'Where is the bus?', [], 'A direct question ends with a question mark.'],
    ], '{q}', 'Keep every word; correct only the requested punctuation.', 'procedure', 40, ['punct'=>true])],
    'EN-009' => [eng_type([
        ['Correct this spelling: “seperate”.', 'separate', [], 'Separate has a after the p.'],
        ['Correct this spelling: “neccessary”.', 'necessary', [], 'Necessary has one c and two s letters.'],
        ['Correct this spelling: “commitee”.', 'committee', [], 'Committee has double m, double t and double e.'],
    ], '{q}', 'Check the vowel and doubled-letter pattern.')],
    'EN-010' => [eng_type([
        ['“The room was silent; not a sound could be heard.” Give one word that means the same as silent here.', 'quiet', ['still', 'hushed', 'soundless', 'noiseless'], 'The absence of sound fixes the meaning as quiet.'],
        ['“The gate was shut; we could not enter.” Give the word that means the opposite of shut here.', 'open', ['opened', 'unlocked'], 'Shut means closed here; open reverses that state.'],
    ], '{q}', 'Use the sentence to decide the meaning, then follow the starting letters.')],
    'EN-011' => [eng_type([
        ['Use is or are: “The key to the two cupboards ___ missing.”', 'is', [], 'Key is the singular head; cupboards is inside a modifying phrase.'],
        ['Use has or have: “The pupils near the window ___ their books.”', 'have', [], 'Pupils is plural; the singular window does not control the verb.'],
        ['Use was or were: “Each of the ten players ___ ready.”', 'was', [], 'Each is singular even when followed by a plural of-phrase.'],
    ], '{q}', 'Find the subject’s head before choosing the verb.', 'reasoning')],
    'EN-012' => [eng_type([
        ['Use since or for: “We have waited here ___ two hours.”', 'for', [], 'Two hours is a duration, so use for.'],
        ['Use since or for: “We have waited here ___ noon.”', 'since', [], 'Noon is a starting point, so use since.'],
    ], '{q}', 'Distinguish a length of time from a starting point.')],
    'EN-013' => [eng_type([
        ['Use because or although to show the stated cause: “We stayed indoors ___ the rain made the path unsafe.”', 'because', [], 'The unsafe path is given as the reason for staying indoors.'],
        ['Use because or although to show the stated contrast: “___ the path was wet, we completed the walk.”', 'although', [], 'The walk was completed despite the wet path, so the link is concession.'],
    ], '{q}', 'Identify cause or concession before choosing the joining word.', 'reasoning')],
    'EN-014' => [eng_type([
        ['Complete an opposite-polarity tag: “Sade has finished, ___?”', 'hasn’t she', ["hasn't she"], 'Repeat has and replace Sade with she; a positive statement takes a negative tag here.'],
        ['Complete an opposite-polarity tag: “The pupils were not late, ___?”', 'were they', [], 'Repeat were and use they for pupils; the negative statement takes a positive tag.'],
    ], '{q}', 'Repeat the auxiliary, use a pronoun and reverse the polarity.')],
    'EN-015' => [eng_type([
        ['Use the past perfect of leave: “By the time I arrived yesterday, Ada ___.”', 'had left', [], 'Had + past participle places leaving before the past arrival.'],
        ['Use the present continuous of read: “Look! The children ___ together.”', 'are reading', [], 'The plural subject takes are; reading describes the activity in progress.'],
        ['Use the present perfect of finish: “I ___ the task, so I can help you now.”', 'have finished', [], 'Have + past participle links the completed task with its present result.'],
    ], '{q}', 'Follow the requested tense and form the auxiliary plus main verb.')],
    'EN-016' => [eng_type([
        ['Correct only the verb after has: “She has wrote three letters.”', 'written', [], 'Has requires the past participle written, not the simple past wrote.'],
        ['Correct only the verb after had: “They had chose a captain.”', 'chosen', [], 'Had requires the past participle chosen.'],
        ['Correct only the verb after have: “We have saw the notice.”', 'seen', [], 'Have requires the past participle seen.'],
    ], '{q}', 'After have, has or had, use the past participle.', 'reasoning')],
    'EN-017' => [eng_type([
        ['Write the possessive form of girls for several owners: “The ___ bags were collected.”', 'girls’', ["girls'"], 'Girls is already plural and ends in s, so place the apostrophe after s.'],
        ['Write the possessive form of child for one owner: “The ___ bag was collected.”', 'child’s', ["child's"], 'One child takes apostrophe + s.'],
    ], '{q}', 'Count the owners before placing the apostrophe.', 'procedure', 35, ['punct'=>true])],
    'EN-018' => [eng_type([
        ['Use their, there or they’re: “___ bringing their own chairs.”', 'they’re', ["they're"], 'The sentence needs they are; the contraction is they’re.'],
        ['Use their, there or they’re: “Please leave the chairs over ___.”', 'there', [], 'There refers to a place; no possession or contraction is intended.'],
    ], '{q}', 'Expand a contraction and test whether ownership or place is meant.')],
    'EN-019' => [eng_type([
        ['Add a prefix to legal to mean not legal.', 'illegal', [], 'The negative form is illegal, using il-.'],
        ['Add a suffix to kind to form the noun meaning the quality of being kind.', 'kindness', [], 'The suffix -ness makes the noun kindness.'],
    ], '{q}', 'Decide whether the task needs a prefix or a suffix.')],
    'EN-020' => [eng_type([
        ['Use a or an: “She planted ___ herb in the pot.” Use the British pronunciation with the h spoken.', 'a', [], 'The stated pronunciation begins with a consonant sound, so use a.'],
        ['Use a or an: “We waited for ___ hour.” The h in hour is silent.', 'an', [], 'The first spoken sound is a vowel, so use an.'],
    ], '{q}', 'Choose by the first sound, not the first written letter.')],
    'EN-021' => [eng_type([
        ['Copy the word whose vowel is the same as the vowel in sheep: seat, sit.', 'seat', [], 'Seat and sheep share the vowel; sit belongs with ship.'],
        ['Copy the word whose vowel is the same as the vowel in ship: seat, sit.', 'sit', [], 'Sit and ship share the vowel; seat belongs with sheep.'],
    ], '{q}', 'Compare the vowel using the topic’s recorded words, not their spelling.', 'reasoning')],
    'EN-022' => [eng_type([
        ['Name the vowel category: a single vowel sound that glides from one quality to another within a syllable.', 'diphthong', [], 'A diphthong changes quality within one syllable; it is not two separate syllables.'],
        ['Name the vowel category: a vowel with a relatively steady quality rather than a glide.', 'monophthong', ['pure vowel'], 'A monophthong has a relatively steady quality.'],
    ], '{q}', 'Contrast a glide with a relatively steady vowel.')],
    'EN-023' => [eng_type([
        ['Type voiced or voiceless for the initial th sound in thin.', 'voiceless', [], 'The initial consonant in thin is made without vocal-fold vibration.'],
        ['Type voiced or voiceless for the initial th sound in they.', 'voiced', [], 'The initial consonant in they includes vocal-fold vibration.'],
    ], '{q}', 'Compare the topic’s recordings and feel for vibration in your throat.', 'reasoning')],
    'EN-024' => [eng_type([
        ['Type fricative or affricate: a consonant made with continuous friction through a narrow opening.', 'fricative', [], 'Continuous friction defines a fricative.'],
        ['Type fricative or affricate: a consonant beginning with complete closure and releasing into friction as one sound.', 'affricate', [], 'Closure followed by friction as one consonant defines an affricate.'],
    ], '{q}', 'Ask whether the airflow is first blocked completely.')],
    'EN-025' => [eng_type([
        ['In knife, which written letter is silent? Type the letter only.', 'k', [], 'The initial k is written but not pronounced.'],
        ['In write, which written letter before r is silent? Type the letter only.', 'w', [], 'The initial w is not pronounced; the word begins with the r sound.'],
    ], '{q}', 'Compare the written beginning with the spoken beginning.')],
    'EN-026' => [eng_type([
        ['In the teaching notation TA-ble, capitals mark the stressed syllable. Type first or second.', 'first', [], 'TA is the first syllable; the capitalised syllable is prominent.'],
        ['In the teaching notation be-GIN, capitals mark the stressed syllable. Type first or second.', 'second', [], 'GIN is the second syllable; the capitalised syllable is prominent.'],
    ], '{q}', 'Read the stress notation rather than counting letters.')],
    'EN-027' => [eng_type([
        ['In “They will present the prize”, type noun or verb for present.', 'verb', [], 'Present follows will and names the action. Its role guides the pronunciation.'],
        ['In “The present was wrapped”, type noun or verb for present.', 'noun', [], 'Present is the head of the subject phrase the present and names the gift.'],
    ], '{q}', 'Identify the word’s grammatical role before choosing its pronunciation.', 'reasoning')],
    'EN-028' => [eng_type([
        ['Type sound or spelling: the decisive basis for judging a rhyme.', 'sound', [], 'Rhyming words share the relevant spoken vowel and following sounds.'],
        ['Type before or after: rhyme compares the stressed vowel and the sounds that come ___ it.', 'after', [], 'The comparison begins with the stressed vowel and continues to the end.'],
    ], '{q}', 'Locate the stressed vowel and compare what follows it.')],
    'EN-029' => [eng_type([
        ['“Ada sent the letter, not Bola.” Copy the word to stress when correcting who sent it.', 'Ada', [], 'The contrast is Ada versus Bola, so prominence belongs on Ada.'],
        ['“Ada sent the letter, not the parcel.” Copy the word to stress when correcting what was sent.', 'letter', [], 'The contrast is letter versus parcel, so prominence belongs on letter.'],
        ['“Ada sent it yesterday, not today.” Copy the word to stress when correcting when it was sent.', 'yesterday', [], 'The contrast concerns time, so prominence belongs on yesterday.'],
    ], '{q}', 'Find the piece of information that replaces the proposed alternative.', 'reasoning')],
    'EN-030' => [eng_type([
        ['A pitch line ends higher than it began. Type rising or falling for that final movement.', 'rising', [], 'The final pitch moves upwards; that movement is a rise.'],
        ['A pitch line ends lower than it began. Type rising or falling for that final movement.', 'falling', [], 'The final pitch moves downwards; that movement is a fall.'],
    ], '{q}', 'Describe pitch movement, not loudness or the punctuation mark.')],
    'EN-031' => [eng_type([
        ['Keep the simple past: “The pupils repaired the chairs.” → “The chairs ___ by the pupils.”', 'were repaired', [], 'The plural subject takes were, followed by the past participle repaired.'],
        ['Keep the future with will: “Ada will open the gate.” → “The gate ___ by Ada.”', 'will be opened', [], 'The future passive is will + be + past participle.'],
    ], '{q}', 'Preserve the tense while changing the object into the passive subject.')],
    'EN-032' => [eng_type([
        ['Complete a backshifted report: “I will return,” Ada said. → “Ada said that she ___ return.”', 'would', [], 'The task explicitly requests backshift, so will becomes would.'],
        ['Report the instruction: “Close the gate,” Ada told us. → “Ada told us ___ the gate.”', 'to close', [], 'A reported positive instruction uses told + object + to + base verb.'],
    ], '{q}', 'Use the requested reporting pattern, not a mechanical change to every word.')],
    'EN-033' => [eng_type([
        ['Use the third-conditional form of arrive: “If we had left earlier, we ___ on time.”', 'would have arrived', [], 'The unreal past result uses would have + past participle.'],
        ['Use the second-conditional form of buy: “If I had enough money now, I ___ a bicycle.”', 'would buy', [], 'The imagined present result uses would + base verb.'],
    ], '{q}', 'Identify whether the imagined result belongs to the present or the past.')],
    'EN-034' => [eng_type([
        ['Complete the stated phrasal verb: “They called ___ the match”; the match was cancelled.', 'off', [], 'Call off means cancel in this context.'],
        ['Complete the stated phrasal verb: “Please look ___ the word”; use a dictionary to find it.', 'up', [], 'Look up means search for information in a reference source.'],
    ], '{q}', 'Read the supplied meaning and complete the whole expression.')],
    'EN-035' => [eng_type([
        ['Complete the idiom: “The puzzle was a piece of ___”; it was very easy.', 'cake', [], 'A piece of cake is the idiom meaning something very easy.'],
        ['Complete the idiom: “We are in the same ___”; we share the same difficulty.', 'boat', [], 'In the same boat means in the same situation, especially a difficulty.'],
    ], '{q}', 'Use the conventional wording of the idiom.')],
    'EN-036' => [eng_type([
        ['Copy the complete main clause: “Although it was late, we continued reading.”', 'we continued reading', [], 'Although it was late is subordinate; we continued reading can stand alone.'],
        ['Copy the complete subordinate clause: “We waited until the rain stopped.”', 'until the rain stopped', [], 'Until introduces the time clause, including its subordinator.'],
    ], '{q}', 'Include the joining word when copying a subordinate clause.', 'reasoning')],
    'EN-037' => [eng_type([
        ['Complete the formal relative clause: “The person to ___ I spoke was helpful.”', 'whom', [], 'The human object immediately after the preposition to takes whom in this formal pattern.'],
        ['Complete the relative clause: “The pupil ___ bag was missing asked for help.”', 'whose', [], 'The gap expresses possession: the pupil’s bag.'],
    ], '{q}', 'Distinguish a formal prepositional object from possession.')],
    'EN-038' => [eng_type([
        ['Use is or are: “The number of late arrivals ___ falling.”', 'is', [], 'The subject is the number, singular, not the plural arrivals.'],
        ['Use is or are: “A number of pupils ___ waiting outside.”', 'are', [], 'A number of means several here and takes a plural verb.'],
        ['Use has or have: “The committee ___ published its unanimous decision.”', 'has', [], 'Its unanimous decision presents the committee as one body.'],
    ], '{q}', 'Distinguish the number from a number of, and check a group’s intended reference.', 'reasoning')],
    'EN-039' => [eng_type([
        ['Use must not or need not: “Entry is forbidden. You ___ enter.”', 'must not', [], 'Must not expresses prohibition, matching forbidden.'],
        ['Use must not or need not: “Bringing food is optional. You ___ bring any.”', 'need not', [], 'Need not removes obligation; it does not forbid bringing food.'],
    ], '{q}', 'Not necessary and not permitted are different meanings.', 'reasoning')],
    'EN-040' => [eng_type([
        ['Use the correct form of read: “She enjoys ___.”', 'reading', [], 'Enjoy takes the -ing form.'],
        ['Use the correct form of leave: “They decided ___ early.”', 'to leave', [], 'Decide takes to + base verb.'],
    ], '{q}', 'Choose the pattern required by the preceding verb.')],
    'EN-041' => [eng_type([
        ['“Pupils planted trees, watered seedlings and protected young shoots.” Complete the main idea with one word from the text: The pupils cared for ___.', 'trees', [], 'All three actions concern growing trees; seedlings and shoots are supporting details.'],
        ['“The library repaired shelves, bought books and extended opening hours.” Complete with one word from the text: The passage describes improvements to the ___.', 'library', [], 'Library covers all three improvements rather than selecting just one detail.'],
    ], '{q}', 'Find the idea broad enough to include every detail.', 'reasoning')],
    'EN-042' => [eng_type([
        ['“Ada put on a raincoat when drops began striking the window.” Complete the supported inference using the verb rain: It had probably started ___.', 'raining', ['to rain'], 'The drops and raincoat support rain; they do not establish a storm or flood.'],
        ['“Musa yawned repeatedly and struggled to keep his eyes open.” Complete the cautious inference with one word: Musa was probably ___.', 'sleepy', ['tired', 'drowsy', 'exhausted', 'weary'], 'Yawning and closing eyes support sleepiness; a cause such as illness is not established.'],
    ], '{q}', 'Combine the clues, but do not invent a cause.', 'reasoning')],
    'EN-043' => [eng_type([
        ['“The path was narrow: only one person could pass at a time.” Give the word that means the opposite of narrow here.', 'wide', ['broad'], 'The restricted space fixes the width sense; wide reverses it.'],
        ['“Her reply was brief: it contained only three words.” Give one word that means the same as brief here.', 'short', ['concise', 'terse'], 'The word count establishes shortness, not delay or rudeness.'],
    ], '{q}', 'Use the explanatory phrase to pin down the word’s meaning.', 'reasoning')],
    'EN-044' => [eng_type([
        ['Type fact or opinion for the claim type: “The library has twelve tables.” Do not decide whether the claim is true.', 'fact', ['factual', 'factual claim'], 'The number can be checked by counting; factual claims still require verification.'],
        ['Type fact or opinion for the claim type: “This is the most beautiful library.”', 'opinion', [], 'Most beautiful expresses a judgement rather than a countable measurement.'],
    ], '{q}', 'Ask whether evidence can check the claim or whether it expresses a preference.')],
    'EN-045' => [eng_type([
        ['Name the device: “The lamp shone like a small sun.”', 'simile', [], 'Like explicitly compares the lamp with a sun.'],
        ['Name the device: “The exhausted gate groaned and begged for rest.”', 'personification', [], 'Begging and exhaustion give the gate human qualities.'],
    ], '{q}', 'Check whether the comparison is explicit or gives something human qualities.')],
    'EN-046' => [eng_type([
        ['Name the device in this deliberate exaggeration: “My schoolbag weighs a thousand tonnes.”', 'hyperbole', [], 'The stated weight is deliberate exaggeration, not a literal measurement.'],
        ['Name the device when “passed away” is used to soften “died”.', 'euphemism', [], 'The softer expression substitutes for a difficult direct term.'],
    ], '{q}', 'Distinguish exaggerating a claim from softening an expression.')],
    'EN-047' => [eng_type([
        ['“I am deeply grateful for your generous help.” Which word in the sentence names the writer’s feeling? That is the tone.', 'grateful', ['deeply grateful'], 'The explicit thanks and generous help support gratitude.'],
        ['“I am furious that our books were deliberately damaged.” Which word in the sentence names the writer’s feeling? That is the tone.', 'furious', [], 'The stated emotion and deliberate damage support anger.'],
    ], '{q}', 'Anchor the tone label in the writer’s own words.', 'reasoning')],
    'EN-048' => [eng_type([
        ['“The school repaired leaking taps, so less water was wasted.” Complete the summary: Repairing taps reduced water ___. Use one noun.', 'waste', ['wastage', 'loss', 'use'], 'The summary retains the action and its result without inventing a new benefit.'],
        ['“The school opened another gate, so the queue became shorter.” Complete the summary: An additional gate shortened the ___.', 'queue', [], 'The summary keeps the stated effect, not an imagined change to lesson times.'],
    ], '{q}', 'Keep the main action and the stated result.', 'reasoning')],
    'EN-049' => [eng_type([
        ['Replace the informal verb in “Please chuck away the damaged sheet” with a formal verb. Type only the replacement for chuck away.', 'discard', ['dispose of', 'remove'], 'Discard preserves the meaning of throwing away in a formal register.'],
        ['Replace “get” with a more formal verb: “Please get permission before entering.”', 'obtain', ['seek', 'secure', 'request', 'acquire'], 'Obtain permission keeps the meaning and fits the formal request.'],
    ], '{q}', 'Keep the original meaning while changing register.')],
    'EN-050' => [eng_type([
        ['“The instructions were clear; everyone understood them immediately.” Give the word that means the opposite of clear here.', 'unclear', ['confusing', 'vague', 'ambiguous', 'obscure'], 'Immediate understanding fixes the understandable sense of clear, not transparent.'],
        ['“The room was vacant; nobody occupied it.” Give one word that means the same as vacant here.', 'empty', ['unoccupied', 'free'], 'Nobody occupied it fixes the empty sense.'],
        ['“Bola was reluctant to sign; she said she did not want to agree.” Give one word that means the same as reluctant here.', 'unwilling', ['hesitant', 'unenthusiastic', 'disinclined', 'loath'], 'Her refusal fixes unwillingness, not slowness or inability.'],
    ], '{q}', 'Check whether a synonym or an antonym is requested, then use the context.', 'reasoning')],
    'EN-051' => [eng_type([
        ['Join with because, keeping the result first and all other words unchanged: “We waited indoors. The rain was heavy.”', 'We waited indoors because the rain was heavy.', [], 'Because introduces the given reason after the result.'],
        ['Join with although, putting the although-clause first and keeping all other words: “The road was wet. We continued walking.”', 'Although the road was wet, we continued walking.', ['Although the road was wet we continued walking.'], 'Although introduces the condition that makes the continued walk unexpected.'],
    ], '{q}', 'Follow the specified clause order; choose the link that expresses the relationship.', 'procedure', 60)],
    'EN-052' => [eng_type([
        ['Complete the conventional British formal closing after “Dear Sir or Madam”: “Yours ___”.', 'faithfully', [], 'Faithfully conventionally accompanies a salutation without a named recipient.'],
        ['Complete the conventional British formal closing after “Dear Ms Bello”: “Yours ___”.', 'sincerely', [], 'Sincerely conventionally accompanies a named recipient.'],
    ], '{q}', 'Check whether the salutation names the recipient.')],
    'EN-053' => [eng_type([
        ['Change I am to its contraction in this friendly sentence: “___ glad you can visit.”', 'I’m', ["I'm"], 'I’m contracts I am and suits a friendly tone.'],
        ['Change we will to its contraction in this friendly sentence: “___ meet you at the gate.”', 'we’ll', ["we'll"], 'We’ll contracts we will without changing the plan.'],
    ], '{q}', 'Keep the meaning and mark the omitted letters with an apostrophe.')],
    'EN-054' => [eng_type([
        ['“We painted the shelves and repaired the chairs.” Complete a topic sentence using one word from the passage: We improved the ___ and the chairs.', 'shelves', [], 'Shelves is a relevant subject developed by the following detail.'],
        ['“We borrowed novels and read poems.” Complete a topic sentence using one word from the passage: We enjoyed novels and ___.', 'poems', [], 'Both details belong under the paragraph’s reading focus.'],
    ], '{q}', 'Keep the topic sentence aligned with the details that develop it.', 'reasoning')],
    'EN-055' => [eng_type([
        ['Use however or therefore for the stated result: “The bridge was closed. ___, we took another route.”', 'therefore', [], 'Taking another route is presented as a consequence of the closure.'],
        ['Use however or therefore for the stated contrast: “The first route was closed. ___, the second was open.”', 'however', [], 'The two routes are contrasted; the second being open is not caused by the first being closed.'],
    ], '{q}', 'Choose a linker for the relationship stated in the task.', 'reasoning')],
    'EN-056' => [eng_type([
        ['Replace “at this point in time” with one word.', 'now', ['currently', 'presently'], 'Now preserves the time reference with fewer words.'],
        ['Remove only the redundant word: “Please repeat the instruction again.” Type the whole revised sentence.', 'Please repeat the instruction.', [], 'Repeat already means do or say again, so again is unnecessary here.'],
    ], '{q}', 'Remove redundancy without deleting essential information.')],
    'EN-058' => [eng_type([
        ['Replace only the comma with a semicolon: “The hall was full, we waited outside.”', 'The hall was full; we waited outside.', [], 'The semicolon joins two closely related independent clauses.'],
        ['Replace only the full stop after things with a colon: “We need two things. books and pens.”', 'We need two things: books and pens.', [], 'The complete introductory clause leads into its list.'],
    ], '{q}', 'Keep every word; make only the requested punctuation change.', 'procedure', 45, ['punct'=>true])],
    'EN-057' => [eng_type([
        ['Correct only borrowed: “Ada borrowed me her ruler.” Ada gave me the ruler temporarily.', 'lent', [], 'The giver lends; the receiver borrows. The specified giver is Ada.'],
        ['Correct only the verb phrase: “I am having two brothers.” This describes a family relationship.', 'have', [], 'Possessive have describing this relationship uses the simple form.'],
    ], '{q}', 'Use the meaning of the sentence to choose the standard verb pattern.', 'reasoning')],
    'EN-059' => [eng_type([
        ['“Reading-club meeting: Saturday, 10 a.m.” Which missing practical detail answers where? Type time or venue.', 'venue', ['location', 'place'], 'The day and time are present; the meeting place is missing.'],
        ['“Reading-club meeting: Saturday, library.” Which missing practical detail answers when on Saturday? Type time or venue.', 'time', [], 'Saturday gives the day and library the venue; the starting time is missing.'],
    ], '{q}', 'Check whether the reader knows when and where to attend.', 'reasoning')],
    'EN-060' => [eng_type([
        ['Type claim or evidence: “The library should stay open later.”', 'claim', [], 'Should proposes a position; it does not supply support for that position.'],
        ['Type claim or evidence: “The attendance log records twenty pupils waiting at closing time each day.” Treat the log as the stated source.', 'evidence', [], 'The recorded observations can support an argument about demand.'],
    ], '{q}', 'Separate what is proposed from the information offered to support it.', 'reasoning')],
    'EN-061' => [eng_type([
        ['Complete the root meaning with one word: bio- in biology relates to ___.', 'life', [], 'Biology studies living things; the root bio- relates to life.'],
        ['Complete the root meaning with one word: geo- in geology relates to the ___.', 'earth', [], 'Geology concerns the Earth and its materials.'],
    ], '{q}', 'Use the root in the named word, not merely a similar sequence of letters.')],
    'EN-062' => [eng_type([
        ['Use the noun from explain: “Her ___ was clear.”', 'explanation', [], 'Her introduces a noun; explanation names what was explained.'],
        ['Use the verb related to decision: “We must ___ today.”', 'decide', [], 'Must takes a base verb, so the family member needed is decide.'],
    ], '{q}', 'Identify the grammatical job before choosing a word-family member.')],
    'EN-063' => [eng_type([
        ['Complete with make or do: “Please ___ your homework before supper.”', 'do', [], 'Do homework is the conventional combination.'],
        ['Complete with make or do: “We must ___ a decision today.”', 'make', [], 'Make a decision is the conventional combination.'],
    ], '{q}', 'Recall the complete collocation rather than translating word by word.')],
    'EN-064' => [eng_type([
        ['Use advice or advise: “Please ___ me about the course.”', 'advise', [], 'The request needs a verb after please: advise.'],
        ['Use advice or advise: “Your ___ was helpful.”', 'advice', [], 'Your introduces a noun, and advice is the noun form.'],
    ], '{q}', 'Distinguish the action word from the noun.')],
    'EN-065' => [eng_type([
        ['Give one word for a person who writes a book.', 'author', ['writer', 'novelist'], 'Author identifies the writer, not the company that publishes the book.'],
        ['Give one word for the story of a person’s life written by that person.', 'autobiography', [], 'Auto- marks self-authorship, distinguishing it from a biography written by another person.'],
    ], '{q}', 'Preserve the distinguishing detail in the description.')],
    'EN-066' => [eng_type([
        ['Name the medical term for identifying an illness from its symptoms and tests.', 'diagnosis', [], 'Diagnosis identifies the condition; it is distinct from treatment.'],
        ['Name the medical term for something a patient feels and reports, such as pain.', 'symptom', ['symptoms'], 'A symptom is experienced by the patient; it is not a prescribed medicine.'],
    ], '{q}', 'Distinguish what is experienced from identifying the condition.')],
    'EN-067' => [eng_type([
        ['Name the person in a court case who gives testimony about what they saw.', 'witness', ['eyewitness', 'a witness'], 'A witness supplies testimony; the role does not automatically decide guilt.'],
        ['Name the legal term for a jury’s decision on the issues put to it.', 'verdict', [], 'A verdict is the decision, not the original accusation.'],
    ], '{q}', 'Keep the source of evidence separate from the decision.')],
    'EN-068' => [eng_type([
        ['Name the farming term for supplying water to crops through channels, pipes or sprinklers.', 'irrigation', ['irrigating'], 'Irrigation supplies water; harvesting gathers a mature crop.'],
        ['Use revenue or profit: sales income before deducting costs.', 'revenue', [], 'Revenue is income from sales; profit accounts for relevant costs.'],
    ], '{q}', 'Use the defining feature, not a merely related term.')],
    'EN-069' => [eng_type([
        ['Name the term for the title of a news report, printed in large letters above it.', 'headline', ['headlines'], 'The headline is the report’s title, not its author’s name.'],
        ['Use upload or download: send a file from your phone to the school’s server.', 'upload', [], 'The stated direction is from the local device to the server.'],
    ], '{q}', 'Check the role or direction described by the sentence.')],
    'EN-070' => [eng_type([
        ['“The library opens only on Fridays.” Copy the day on which it may open.', 'Fridays', ['Friday'], 'Only restricts opening to Fridays; it does not permit other days.'],
        ['Complete the equivalent condition with one word: “Unless it rains, we will walk” means “If it does ___ rain, we will walk”.', 'not', [], 'Unless introduces the negative condition: if not.'],
    ], '{q}', 'Preserve restrictions and conditions instead of dropping small words.', 'reasoning')],
    'EN-071' => [eng_type([
        ['In “The tall girl smiled”, give the function of “the tall girl”: subject or object.', 'subject', [], 'The noun phrase identifies who smiled.'],
        ['In “We greeted the tall girl”, give the function of “the tall girl”: subject or object.', 'object', [], 'We is the subject; the tall girl receives the greeting.'],
    ], '{q}', 'The same phrase can have a different job in a different sentence.', 'reasoning')],
    'EN-072' => [eng_type([
        ['Copy the complete relative clause: “The book that Ada borrowed is missing.”', 'that Ada borrowed', [], 'The clause starts with that and modifies book.'],
        ['Copy the complete clause of reason: “We waited because the gate was locked.”', 'because the gate was locked', [], 'The because-clause explains the waiting.'],
    ], '{q}', 'Include the clause’s joining word and stop at its boundary.', 'reasoning')],
    'EN-073' => [eng_type([
        ['“Ada reluctantly agreed.” Restate reluctantly with an adjective: Ada agreed although she was ___.', 'unwilling', ['hesitant', 'reluctant', 'unsure', 'doubtful'], 'Reluctantly preserves both agreement and lack of willingness.'],
        ['“The path was impassable.” Complete an own-words restatement: Nobody could get ___ along the path. Use one word.', 'through', ['past', 'by'], 'Impassable means that passage is not possible, rather than merely slow.'],
    ], '{q}', 'Keep the strength of the original meaning, following the supplied wording.', 'reasoning')],
    'EN-074' => [eng_type([
        ['“The access road flooded. As a result, lessons began late.” Complete one summary sentence with a past-tense verb: Flooding ___ lessons.', 'delayed', ['postponed', 'held up'], 'Delayed captures the stated result without changing it to cancellation.'],
        ['“The school repaired leaking taps. Water use fell.” Complete one summary sentence with a past-tense verb: Repairing taps ___ water use.', 'reduced', ['cut', 'lowered', 'decreased'], 'Reduced states the decrease without adding an unmentioned result.'],
    ], '{q}', 'Write one relevant point and preserve cause and effect.', 'reasoning')],
    'EN-075' => [eng_type([
        ['For this counting exercise, ship is represented by three sound units: sh + i + p. How many sounds are represented? Type a number.', '3', ['three'], 'Count the supplied sound units, not the four written letters.'],
        ['For this counting exercise, see is represented by two sound units: s + ee. How many sounds are represented? Type a number.', '2', ['two'], 'The doubled vowel letters represent one unit here; the total is two.'],
    ], '{q}', 'Count the supplied spoken units, not the letters.')],
    'EN-076' => [eng_type([
        ['The opening of street has the consonant sequence s + t + r. How many consonant sounds are in that initial cluster?', '3', ['three'], 'There are three adjacent consonants before the vowel.'],
        ['The opening of stop has the consonant sequence s + t. How many consonant sounds are in that initial cluster?', '2', ['two'], 'There are two adjacent consonants before the vowel.'],
    ], '{q}', 'Count each consonant sound; do not insert an extra vowel.')],
    'EN-077' => [eng_type([
        ['Complete a polite request to a familiar club organiser with could or must: “___ you please confirm the meeting time?”', 'could', [], 'Could you please is a conventional polite request, not a statement of obligation.'],
        ['Complete a courteous acknowledgement with would or am: “I ___ grateful for your help.”', 'am', [], 'Am links I with the adjective grateful; would would need be.'],
    ], '{q}', 'Keep the tone respectful and the grammatical structure complete.')],
    'EN-078' => [eng_type([
        ['Type narrative or description for the dominant focus: “Ada reached the gate, found it locked, and returned for the key.”', 'narrative', [], 'The sequence of actions moves events forward.'],
        ['Type narrative or description for the dominant focus: “The gate was tall, rusty and rough beneath her hand.”', 'description', [], 'The sentence selects appearance and texture rather than advancing events.'],
    ], '{q}', 'Distinguish a sequence of events from a selected impression.')],
    'EN-079' => [eng_type([
        ['Type expository or argumentative for the stated purpose: explain how a water filter works.', 'expository', [], 'The purpose is to explain a process.'],
        ['Type expository or argumentative for the stated purpose: persuade the council to install water filters, using evidence and reasons.', 'argumentative', [], 'The purpose is to justify a position and persuade the audience.'],
    ], '{q}', 'Identify the central purpose, even when both kinds of writing use facts.')],
    'EN-080' => [eng_type([
        ['Use might have + the past participle of miss: “I am unsure, but she ___ the bus.”', 'might have missed', [], 'Might have + past participle expresses a possibility about the past.'],
        ['Use would + be for a present result: “If I had saved the address yesterday, I ___ able to visit now.”', 'would be', [], 'The unreal condition is past, but now makes the result present.'],
    ], '{q}', 'Check the time of the condition separately from the time of the result.')],
    ];
}

/** Additional examiner-style reasoning; each wrong choice names its particular slip. */
function eng_gods_reasoning_forms(): array {
    return [
    'EN-011' => [eng_choose([
        ['Why does “The box of pencils is missing” use is?', 'The subject’s head is the singular noun box.', [['The verb must agree with the plural noun pencils.', 'Nearest-noun agreement: pencils belongs to the modifying of-phrase, not the subject’s head.'], ['Any sentence containing of must use a singular verb.', 'Overgeneralised trigger: of does not determine agreement; compare the boxes of chalk are missing.']], 'Remove of pencils: the box is missing. The head controls agreement.'],
        ['Why does “The pupils near the window are ready” use are?', 'The subject’s head is the plural noun pupils.', [['The nearest noun window controls the verb.', 'Nearest-noun agreement: window is inside the modifying phrase.'], ['The word ready requires a plural subject.', 'Adjective-as-trigger: ready can describe one person or several.']], 'Remove near the window: the pupils are ready.'],
    ], '{q}', 'Find the head of the subject and test it without the modifier.', 'reasoning', 50)],
    'EN-015' => [eng_spot([
        [['Ada', 'has wrote', 'three letters', 'this morning.'], 1, 'has written', 'Has takes a past participle: written, not the simple past wrote.', [0=>'Subject confusion: Ada is a valid singular subject for has.', 2=>'Object confusion: three letters is a valid object of write.', 3=>'Time-word overcorrection: this morning can accompany a present perfect while the morning is still current.']],
        [['The pupils', 'did not saw', 'the notice', 'yesterday.'], 1, 'did not see', 'Did already marks past time, so its main verb is the base form see.', [0=>'Number confusion: did works with a plural subject.', 2=>'Object confusion: the notice is a valid object of see.', 3=>'Time-word confusion: yesterday fits the past auxiliary did.']],
    ], 'Check which verb form the auxiliary requires.')],
    'EN-043' => [eng_choose([
        ['“The instructions were explicit: every step was stated clearly.” Which meaning of explicit fits?', 'clearly expressed', [['partly concealed', 'Opposite-meaning trap: clearly stated steps are not hidden.'], ['needlessly repeated', 'Associated-detail trap: stating each step does not mean repeating it.']], 'The explanation after the colon fixes explicit as clearly expressed.'],
        ['“The plan was feasible: the team had the tools, time and funds to carry it out.” Which meaning of feasible fits?', 'possible to carry out', [['certain to succeed', 'Overstated certainty: having the means makes the plan possible, not guaranteed.'], ['expensive to attempt', 'Cost association: funds are mentioned as available, not as proof that the plan is expensive.']], 'Tools, time and funds support possibility; they do not guarantee success.'],
    ], '{q}', 'Use the explanation in the sentence; reject a stronger or merely associated meaning.', 'reasoning', 50)],
    'EN-042' => [eng_choose([
        ['“The first bus was full. Ada remained at the stop and checked the next arrival time.” What is best supported?', 'Ada probably intends to catch a later bus.', [['Ada has decided never to use buses again.', 'Unsupported generalisation: checking the next arrival supports another journey, not a permanent refusal.'], ['Ada knows that the next bus will be empty.', 'Unsupported certainty: an arrival time reveals nothing about the next bus’s occupancy.']], 'Remaining at the stop and checking the next arrival together support waiting for a later bus.'],
        ['“Musa reread the unclear sentence, then reached for a dictionary.” What is best supported?', 'Musa probably wants to check a word’s meaning.', [['Musa has finished understanding the entire passage.', 'Completion assumption: rereading and consulting a dictionary suggest an unresolved question.'], ['Musa is certain that the author made a mistake.', 'Invented motive: seeking a definition does not establish a judgement about the author.']], 'The unclear sentence and the dictionary support checking meaning, not certainty about an error.'],
    ], '{q}', 'Choose a cautious conclusion supported by both clues.', 'reasoning', 60)],
    'EN-048' => [eng_choose([
        ['“The club replaced leaking taps and repaired broken pipes. Water waste fell.” Which summary preserves the main points?', 'Repairs reduced water waste.', [['New rules stopped all water use.', 'Invented action and overstatement: the text describes repairs and reduced waste, not rules or zero use.'], ['The club bought a new water supply.', 'Invented solution: repairing existing equipment does not establish a new supply.']], 'The repairs are the action; reduced waste is the stated result.'],
        ['“The librarian opened a second desk. Queues shortened, but staff costs rose.” Which summary preserves both outcomes?', 'Another desk shortened queues but increased staff costs.', [['Another desk reduced both queues and staff costs.', 'Reversed outcome: costs rose rather than fell.'], ['Another desk increased both queues and staff costs.', 'Reversed outcome: queues shortened rather than grew.']], 'Keep both the benefit and the cost instead of silently dropping the contrast.'],
    ], '{q}', 'Preserve the stated action, result and any important contrast.', 'reasoning', 55)],
    'EN-054' => [eng_order([
        [['The reading club improved access to books.', 'First, it added a shelf of novels.', 'Then it extended borrowing to weekends.'], 'The topic sentence states the general improvement; first and then fix the order of its supporting details.'],
        [['The class prepared the room for visitors.', 'First, it moved the desks into rows.', 'Then it placed a name card on each desk.'], 'The topic sentence introduces the preparation; the sequencing words order the details.'],
    ], 'Build the paragraph: start with its general topic sentence, then follow the explicit sequence words.', 'General idea first; follow first and then.', 'reasoning', 60)],
    'EN-075' => [eng_derive([
        ['ship', ['sh', 'i', 'p'], 4], ['see', ['s', 'ee'], 3],
    ], static function (MlbRng $r, array $row): array {
        [$word, $units, $letters] = $row; $n = count($units);
        return mlb_mcq($r, 'For this exercise, “' . $word . '” has the sound units ' . implode(' + ', $units) . '. How many sounds are represented?', (string)$n,
            [[(string)$letters, 'Letter-counting slip: you counted the written letters instead of the supplied sound units.'], [(string)($n - 1), 'Omitted-sound slip: the initial consonant counts too; include every supplied unit.']],
            ['Count each supplied sound unit once: ' . implode(', ', $units) . '.', 'There are ' . $n . ' sounds, although the written word has ' . $letters . ' letters.'],
            'Count spoken units rather than written letters.', 'reasoning', 35);
    })],
    ];
}
