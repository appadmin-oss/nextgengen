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
    return [
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
}
