<?php
declare(strict_types=1);

/**
 * English Lab — Stage 3, The Sounds of English (EN-021 … EN-030): speech work, as written
 * questions. Symbols are the IPA of the British model taught in Nigerian schools (/iː/, /ɪ/, /θ/…);
 * stress is shown by capital letters (reCORD) because a stress mark is easy to miss on a phone.
 * Content only, built with the kit. Append-only.
 *
 * A listening version (hear the word, choose the sound) needs recorded or synthesised audio for
 * every item; the questions here are written so that audio can be added to the same items later.
 */
function eng_sounds_forms(): array {
    return [
    'EN-021' => [
        eng_choose([
            ['seat', 'feet', [['sit', '/ɪ/ is short; “seat” has the long /iː/.'], ['set', '/e/ is a different vowel.'], ['sat', '/æ/ is a different vowel.']], '“seat” and “feet” share the long vowel /iː/.'],
            ['ship', 'lip', [['sheep', '“sheep” has the long /iː/; “ship” has short /ɪ/.'], ['shape', '“shape” has /eɪ/.'], ['shop', '“shop” has /ɒ/.']], '“ship” and “lip” share the short vowel /ɪ/.'],
            ['pool', 'food', [['pull', '“pull” has the short /ʊ/.'], ['pole', '“pole” has /əʊ/.'], ['pal', '“pal” has /æ/.']], '“pool” and “food” share the long /uː/.'],
            ['full', 'book', [['fool', '“fool” has the long /uː/.'], ['fall', '“fall” has /ɔː/.'], ['fill', '“fill” has /ɪ/.']], '“full” and “book” share the short /ʊ/.'],
            ['cart', 'heart', [['cat', '“cat” has the short /æ/.'], ['cut', '“cut” has /ʌ/.'], ['curt', '“curt” has /ɜː/.']], '“cart” and “heart” share the long /ɑː/.'],
            ['bird', 'word', [['bed', '“bed” has /e/.'], ['bud', '“bud” has /ʌ/.'], ['board', '“board” has /ɔː/.']], '“bird” and “word” share the long /ɜː/.'],
        ], 'Which word has the same vowel sound as “{q}”?', 'Say both words slowly and listen to the vowel, not the spelling.'),
        eng_choose([
            ['Which word contains the long vowel /iː/?', 'peace', [['pick', 'Short /ɪ/.'], ['pet', '/e/.'], ['pit', 'Short /ɪ/.']], '“peace” has /iː/: the ea spelling here is long.'],
            ['Which word contains the short vowel /ɪ/?', 'women', [['week', 'Long /iː/.'], ['key', 'Long /iː/.'], ['meat', 'Long /iː/.']], 'The first vowel of “women” is /ɪ/, despite the o.'],
            ['Which word contains the short vowel /ʌ/?', 'blood', [['blue', 'Long /uː/.'], ['boot', 'Long /uː/.'], ['bird', '/ɜː/.']], '“blood” has /ʌ/, like “cut”.'],
            ['Which word contains the long vowel /ɔː/?', 'caught', [['cot', 'Short /ɒ/.'], ['coat', '/əʊ/.'], ['cut', '/ʌ/.']], '“caught” has /ɔː/.'],
        ], '', 'Spelling misleads; listen to the sound.'),
        eng_choose([
            ['/sɪt/', 'sit', [['seat', 'That would be /siːt/.'], ['set', 'That would be /set/.'], ['sight', 'That would be /saɪt/.']], '/ɪ/ is the short i: sit.'],
            ['/fuːl/', 'fool', [['full', 'That would be /fʊl/.'], ['fall', 'That would be /fɔːl/.'], ['fail', 'That would be /feɪl/.']], '/uː/ is the long u: fool.'],
            ['/kʌt/', 'cut', [['cat', 'That would be /kæt/.'], ['cart', 'That would be /kɑːt/.'], ['cot', 'That would be /kɒt/.']], '/ʌ/: cut.'],
            ['/bɜːd/', 'bird', [['bed', 'That would be /bed/.'], ['bud', 'That would be /bʌd/.'], ['bard', 'That would be /bɑːd/.']], '/ɜː/: bird.'],
        ], 'Which word is written in sound symbols as {q}?', 'Each symbol stands for one sound.'),
    ],
    'EN-022' => [
        eng_choose([
            ['day', 'rain', [['den', '/e/ is a single vowel.'], ['die', '/aɪ/ is a different diphthong.'], ['dear', '/ɪə/ is a different diphthong.']], '“day” and “rain” share /eɪ/.'],
            ['my', 'buy', [['may', '/eɪ/.'], ['me', '/iː/.'], ['boy', '/ɔɪ/.']], '“my” and “buy” share /aɪ/.'],
            ['boy', 'noise', [['buy', '/aɪ/.'], ['bow (and arrow)', '/əʊ/.'], ['bore', '/ɔː/.']], '“boy” and “noise” share /ɔɪ/.'],
            ['go', 'show', [['now', '“now” has /aʊ/.'], ['got', 'Short /ɒ/.'], ['gone', 'Short /ɒ/.']], '“go” and “show” share /əʊ/.'],
            ['now', 'loud', [['know', '“know” has /əʊ/.'], ['nor', '/ɔː/.'], ['new', '/juː/.']], '“now” and “loud” share /aʊ/.'],
            ['here', 'fear', [['hair', '/eə/.'], ['her', '/ɜː/.'], ['hire', '/aɪə/.']], '“here” and “fear” share /ɪə/.'],
            ['chair', 'there', [['cheer', '/ɪə/.'], ['chore', '/ɔː/.'], ['char', '/ɑː/.']], '“chair” and “there” share /eə/.'],
        ], 'Which word has the same diphthong (gliding vowel) as “{q}”?', 'A diphthong glides from one vowel to another.'),
        eng_choose([
            ['Which word contains a diphthong?', 'coat', [['cot', 'A single short vowel /ɒ/.'], ['caught', 'A single long vowel /ɔː/.'], ['cut', 'A single vowel /ʌ/.']], '“coat” has /əʊ/, a glide.'],
            ['Which word contains a diphthong?', 'height', [['hit', 'A single vowel /ɪ/.'], ['heat', 'A single long vowel /iː/.'], ['hat', 'A single vowel /æ/.']], '“height” has /aɪ/.'],
            ['Which word contains a diphthong?', 'toy', [['ten', 'A single short vowel /e/.'], ['tore', 'A single long vowel /ɔː/.'], ['too', 'A single long vowel /uː/.']], '“toy” has /ɔɪ/.'],
        ], '', 'Does the vowel move as you say it?'),
        eng_choose([
            ['/eɪ/', 'late', [['let', '/e/.'], ['light', '/aɪ/.'], ['lot', '/ɒ/.']], '/eɪ/ as in “late”.'],
            ['/aɪ/', 'time', [['team', '/iː/.'], ['tame', '/eɪ/.'], ['tom', '/ɒ/.']], '/aɪ/ as in “time”.'],
            ['/aʊ/', 'house', [['hose', '/əʊ/.'], ['hiss', '/ɪ/.'], ['horse', '/ɔː/.']], '/aʊ/ as in “house”.'],
            ['/əʊ/', 'phone', [['fun', '/ʌ/.'], ['fan', '/æ/.'], ['fine', '/aɪ/.']], '/əʊ/ as in “phone”.'],
        ], 'Which word contains the sound {q}?', 'Say each word and feel your mouth move.'),
    ],
    'EN-023' => [
        eng_choose([
            ['think', 'thank', [['this', '“this” has the voiced /ð/.'], ['tank', '/t/, not /θ/.'], ['sink', '/s/, not /θ/.']], '“think” and “thank” begin with the voiceless /θ/.'],
            ['this', 'those', [['thin', '“thin” has the voiceless /θ/.'], ['dose', '/d/, not /ð/.'], ['zoos', '/z/, not /ð/.']], '“this” and “those” begin with the voiced /ð/.'],
            ['bath', 'path', [['bathe', '“bathe” ends in /ð/.'], ['bat', '/t/.'], ['bass', '/s/.']], '“bath” and “path” end in /θ/.'],
            ['breathe', 'smooth', [['breath', '“breath” (the noun) ends in /θ/.'], ['bread', '/d/.'], ['breeze', '/z/.']], '“breathe” (the verb) and “smooth” end in /ð/.'],
        ], 'Which word has the same “th” sound as “{q}”?', 'Put a hand on your throat: /ð/ buzzes (voiced), /θ/ does not.'),
        eng_choose([
            ['Which word begins with /θ/?', 'thought', [['tought', 'Not a word.'], ['taught', 'Begins with /t/.'], ['those', 'Begins with /ð/.']], '“thought” begins with /θ/.'],
            ['Which word begins with /t/ although it is spelt with “th”?', 'Thomas', [['thumb', '/θ/.'], ['three', '/θ/.'], ['then', '/ð/.']], 'In “Thomas” (and “Thames”) the th is said /t/.'],
            ['Which word begins with /ð/?', 'they', [['day', '/d/.'], ['thick', '/θ/.'], ['tie', '/t/.']], '“they” begins with the voiced /ð/.'],
            ['Which word has /d/, not /ð/?', 'dare', [['there', '/ð/.'], ['their', '/ð/.'], ['then', '/ð/.']], '“dare” begins with /d/.'],
        ], '', 'Th is /θ/ or /ð/ — say it with the tongue between the teeth.'),
        eng_choose([
            ['thin', 'tin', [['thing', 'That keeps /θ/.'], ['then', 'That changes the vowel and voicing.'], ['thick', 'That keeps /θ/.']], 'thin /θɪn/ and tin /tɪn/ differ only in /θ/ and /t/.'],
            ['three', 'tree', [['free', 'That swaps /θ/ for /f/, not /t/.'], ['thee', 'That changes more.'], ['through', 'That keeps /θ/.']], 'three /θriː/ and tree /triː/ differ only in /θ/ and /t/.'],
            ['they', 'day', [['say', 'That swaps /ð/ for /s/.'], ['the', 'That keeps /ð/.'], ['thy', 'That keeps /ð/.']], 'they /ðeɪ/ and day /deɪ/ differ only in /ð/ and /d/.'],
        ], 'Which word differs from “{q}” ONLY in its first sound (th → t or d)?', 'These are minimal pairs: one sound changes the word.'),
    ],
    'EN-024' => [
        eng_choose([
            ['ship', 'sure', [['chip', '“chip” begins with /tʃ/.'], ['sip', '/s/.'], ['jump', '/dʒ/.']], '“ship” and “sure” begin with /ʃ/.'],
            ['church', 'catch', [['shirt', '/ʃ/.'], ['judge', '/dʒ/.'], ['kick', '/k/.']], '“church” and “catch” both have /tʃ/.'],
            ['judge', 'gentle', [['church', '/tʃ/.'], ['shop', '/ʃ/.'], ['gate', 'Hard /g/.']], '“judge” and “gentle” both have /dʒ/.'],
            ['measure', 'vision', [['mission', '“mission” has /ʃ/.'], ['major', '/dʒ/.'], ['mention', '/ʃ/.']], '“measure” and “vision” both have /ʒ/.'],
            ['nation', 'machine', [['nature', '“nature” has /tʃ/.'], ['magic', '/dʒ/.'], ['native', 'The t in “native” is /t/.']], '“nation” and “machine” both have /ʃ/.'],
        ], 'Which word has the same sound as the marked part of “{q}”? (sh, ch, j or zh)', 'Spelling misleads: “ti”, “ch” and “s” can all say /ʃ/.'),
        eng_choose([
            ['Which word contains /ʒ/?', 'treasure', [['tension', '/ʃ/.'], ['teacher', '/tʃ/.'], ['jury', '/dʒ/.']], '“treasure” has /ʒ/, as in “measure”.'],
            ['Which word contains /tʃ/?', 'question', [['station', '/ʃ/.'], ['vision', '/ʒ/.'], ['guest', 'Hard /g/, no /tʃ/.']], 'In “question” the ti says /tʃ/.'],
            ['Which word contains /ʃ/?', 'sugar', [['sun', '/s/.'], ['soldier', '/dʒ/.'], ['usual', '/ʒ/.']], 'The s in “sugar” says /ʃ/.'],
            ['Which word contains /dʒ/?', 'soldier', [['shoulder', '/ʃ/.'], ['sold', 'No /dʒ/.'], ['solid', 'No /dʒ/: the d is /d/.']], 'The di in “soldier” says /dʒ/.'],
        ], '', 'Listen, do not read the letters.'),
        eng_choose([
            ['chair', 'share', [['cheer', 'Keeps /tʃ/.'], ['chain', 'Keeps /tʃ/.'], ['hair', 'Drops the sound.']], 'chair /tʃ/ and share /ʃ/ are a minimal pair.'],
            ['chin', 'shin', [['chip', 'Keeps /tʃ/.'], ['gin', '/dʒ/, not /ʃ/.'], ['thin', '/θ/.']], 'chin /tʃ/ and shin /ʃ/.'],
            ['cheap', 'sheep', [['chip', 'Changes the vowel, keeps /tʃ/.'], ['jeep', '/dʒ/.'], ['keep', '/k/.']], 'cheap /tʃ/ and sheep /ʃ/.'],
        ], 'Which word differs from “{q}” only in /tʃ/ → /ʃ/?', 'Minimal pairs train the ear.'),
    ],
    'EN-025' => [
        eng_choose([
            ['knife', 'k', [['n', 'The n is spoken.'], ['f', 'The f is spoken.'], ['i', 'The i is spoken as /aɪ/.']], 'kn at the start: the k is silent.'],
            ['island', 's', [['l', 'The l is spoken.'], ['d', 'The d is spoken.'], ['n', 'The n is spoken.']], '“island” is said /ˈaɪlənd/: silent s.'],
            ['comb', 'b', [['m', 'The m is spoken.'], ['c', 'The c is spoken as /k/.'], ['o', 'The o is spoken.']], 'mb at the end: the b is silent (comb, thumb, climb).'],
            ['hour', 'h', [['r', 'The r is part of the vowel sound /aʊə/; the letter never sounded at all is the h.'], ['u', 'Part of the vowel.'], ['o', 'Part of the vowel.']], '“hour” begins with a vowel sound: silent h.'],
            ['listen', 't', [['l', 'Spoken.'], ['n', 'Spoken.'], ['s', 'Spoken.']], '“listen” is /ˈlɪsn/: silent t.'],
            ['write', 'w', [['r', 'Spoken.'], ['t', 'Spoken.'], ['i', 'Spoken as /aɪ/.']], 'wr at the start: silent w.'],
            ['debt', 'b', [['d', 'Spoken.'], ['t', 'Spoken.'], ['e', 'Spoken.']], '“debt” is /det/: silent b.'],
        ], 'Which letter is silent in “{q}”?', 'Say the word naturally and notice which letter you never sound.'),
        eng_choose([
            ['Which word has a silent letter?', 'psalm', [['plan', 'Every letter is spoken.'], ['spark', 'Every letter is spoken.'], ['past', 'Every letter is spoken.']], '“psalm”: silent p (and l).'],
            ['Which word has a silent letter?', 'answer', [['ant', 'Every letter is spoken.'], ['enter', 'Every letter is spoken.'], ['ask', 'Every letter is spoken.']], '“answer”: silent w.'],
            ['Which word has a silent letter?', 'honest', [['hot', 'The h is spoken.'], ['nest', 'Every letter is spoken.'], ['hint', 'The h is spoken.']], '“honest”: silent h.'],
            ['Which word has a silent letter?', 'gnaw', [['grow', 'The g is spoken.'], ['now', 'Every letter is spoken (ow is one sound).'], ['gas', 'The g is spoken.']], '“gnaw”: silent g.'],
        ], '', 'Look for kn, wr, mb, gn, ps and silent h.'),
        eng_type([
            ['k_ee (the joint in your leg)', 'knee', [], 'kn: silent k.'], ['whis_le (the sound you blow)', 'whistle', [], 'In “whistle” the t is silent, as in “castle” and “listen”.'],
            ['thum_', 'thumb', [], 'mb: silent b.'], ['_rong (not right)', 'wrong', [], 'wr: silent w.'], ['autum_', 'autumn', [], 'mn at the end: silent n.'],
            ['g_ost', 'ghost', [], 'gh: silent h.'],
        ], 'Type the whole word, with its silent letter: {q}', 'The missing letter is silent.', 'procedure', 25),
    ],
    'EN-026' => [
        eng_choose([
            ['table', 'TAble', [['taBLE', 'Most two-syllable nouns stress the first syllable.'], ['TA-BLE', 'Only one syllable carries the main stress.'], ['ta-ble (no stress)', 'Every word has one main stress.']], 'TA-ble: first-syllable stress, like most two-syllable nouns.'],
            ['begin', 'beGIN', [['BEgin', 'Most two-syllable verbs stress the second syllable.'], ['BE-GIN', 'Only one syllable carries the main stress.'], ['be-gin (no stress)', 'Every word has one main stress.']], 'be-GIN: second-syllable stress, like most two-syllable verbs.'],
            ['hotel', 'hoTEL', [['HOtel', 'This noun is an exception: ho-TEL.'], ['HO-TEL', 'Only one main stress.'], ['ho-tel (no stress)', 'Every word has one main stress.']], 'ho-TEL is an exception to the noun pattern.'],
            ['mother', 'MOther', [['moTHER', 'First-syllable stress.'], ['MO-THER', 'Only one main stress.'], ['mo-ther (no stress)', 'Every word has one main stress.']], 'MO-ther.'],
            ['explain', 'exPLAIN', [['EXplain', 'Verb: second syllable.'], ['EX-PLAIN', 'Only one main stress.'], ['ex-plain (no stress)', 'Every word has one main stress.']], 'ex-PLAIN.'],
            ['photograph', 'PHOtograph', [['phoTOgraph', 'That is the stress of “photographer”.'], ['photoGRAPH', 'Not the stressed syllable.'], ['PHO-TO-GRAPH', 'Only one main stress.']], 'PHO-to-graph; but pho-TO-gra-pher.'],
        ], 'Which shows the right stress (capitals mark the stressed syllable) for “{q}”?', 'Two-syllable nouns usually stress the first syllable; verbs, the second.'),
        eng_choose([
            ['Which word is stressed on the FIRST syllable?', 'picture', [['correct', 'cor-RECT.'], ['arrive', 'ar-RIVE.'], ['decide', 'de-CIDE.']], 'PIC-ture.'],
            ['Which word is stressed on the SECOND syllable?', 'agree', [['happy', 'HAP-py.'], ['water', 'WA-ter.'], ['sister', 'SIS-ter.']], 'a-GREE.'],
            ['Which word is stressed on the SECOND syllable?', 'computer', [['camera', 'CAM-e-ra.'], ['animal', 'AN-i-mal.'], ['hospital', 'HOS-pi-tal.']], 'com-PU-ter.'],
            ['Which word is stressed on the THIRD syllable?', 'education', [['important', 'im-POR-tant.'], ['beautiful', 'BEAU-ti-ful.'], ['family', 'FAM-i-ly.']], 'ed-u-CA-tion: words in -tion stress the syllable just before it.'],
        ], '', 'Clap the syllables and listen for the strong one.'),
        eng_choose([
            ['information', 'ma', [['in', 'Words ending in -tion stress the syllable before it.'], ['for', 'Not the syllable before -tion.'], ['tion', '-tion itself is never stressed.']], 'in-for-MA-tion.'],
            ['electricity', 'tri', [['e', 'Words in -ity stress the syllable before it.'], ['lec', 'Not the syllable before -ity.'], ['ty', 'Not stressed.']], 'e-lec-TRI-ci-ty.'],
            ['photography', 'to', [['pho', 'That is the stress of “photograph”.'], ['gra', 'Words in -graphy stress the syllable before it.'], ['phy', 'Not stressed.']], 'pho-TO-gra-phy.'],
            ['economic', 'no', [['e', 'Words in -ic stress the syllable before it.'], ['co', 'Not the syllable before -ic.'], ['mic', 'Not stressed.']], 'e-co-NO-mic.'],
        ], 'Which syllable of “{q}” is stressed?', 'Endings like -tion, -ity, -ic, -graphy put the stress just before them.'),
    ],
    'EN-027' => [
        eng_choose([
            ['I will REcord the song tomorrow.', 'reCORD', [['REcord', 'As a noun it is RE-cord; as a verb, re-CORD.'], ['RE-CORD', 'Only one main stress.'], ['re-cord (no stress)', 'Every word has one main stress.']], 'Verb: re-CORD. (Noun: a RE-cord.)'],
            ['Nigeria exports oil; oil is our biggest ___ (export).', 'EXport', [['exPORT', 'That is the verb.'], ['EX-PORT', 'Only one main stress.'], ['ex-port (no stress)', 'Every word has one main stress.']], 'Noun: EX-port.'],
            ['The students will proTEST the decision. (protest, verb)', 'proTEST', [['PROtest', 'That is the noun.'], ['PRO-TEST', 'Only one main stress.'], ['pro-test (no stress)', 'Every word has one main stress.']], 'Verb: pro-TEST.'],
            ['We bought fresh ___ (produce) at the market.', 'PROduce', [['proDUCE', 'That is the verb.'], ['PRO-DUCE', 'Only one main stress.'], ['pro-duce (no stress)', 'Every word has one main stress.']], 'Noun: PRO-duce (farm goods).'],
            ['Please ___ (present) your work to the class.', 'preSENT', [['PREsent', 'That is the noun or adjective.'], ['PRE-SENT', 'Only one main stress.'], ['pre-sent (no stress)', 'Every word has one main stress.']], 'Verb: pre-SENT.'],
        ], 'How is the word stressed in this sentence? {q}', 'Noun → first syllable; verb → second syllable.'),
        eng_choose([
            ['In which sentence is “object” a VERB (stressed obJECT)?', 'I object to that remark.', [['That object is heavy.', 'Here it is a noun: OB-ject.'], ['The object of the game is to win.', 'Noun: OB-ject.'], ['He held a strange object.', 'Noun: OB-ject.']], 'Verb: ob-JECT.'],
            ['In which sentence is “permit” a NOUN (stressed PERmit)?', 'You need a permit to park here.', [['They will not permit noise.', 'Verb: per-MIT.'], ['Please permit me to speak.', 'Verb: per-MIT.'], ['We permit visitors on Sundays.', 'Verb: per-MIT.']], 'Noun: PER-mit.'],
            ['In which sentence is “contest” a VERB (stressed conTEST)?', 'She will contest the election.', [['The contest was fair to all.', 'Noun: CON-test.'], ['He won the contest.', 'Noun: CON-test.'], ['It was a very close contest.', 'Noun: CON-test.']], 'Verb: con-TEST.'],
        ], '', 'Work out whether the word is naming something or doing something.'),
        eng_type([
            ['the noun “record” (a written account)', 'RE', ['re'], 'Noun: RE-cord.'], ['the verb “increase”', 'CREASE', ['crease'], 'Verb: in-CREASE.'],
            ['the noun “import”', 'IM', ['im'], 'Noun: IM-port.'], ['the verb “conduct”', 'DUCT', ['duct'], 'Verb: con-DUCT.'],
            ['the noun “rebel”', 'RE', ['re'], 'Noun: RE-bel; verb: re-BEL.'],
        ], 'Type the STRESSED syllable of {q}.', 'Noun: first syllable; verb: second.', 'procedure', 25),
    ],
    'EN-028' => [
        eng_choose([
            ['great', 'late', [['greet', '/iː/, not /eɪ/.'], ['grit', '/ɪ/.'], ['great-ly', 'Not a separate word.']], '“great” /greɪt/ rhymes with “late” /leɪt/.'],
            ['blood', 'mud', [['food', '/uː/.'], ['good', '/ʊ/.'], ['bloom', 'Different ending.']], '“blood” /blʌd/ rhymes with “mud”.'],
            ['said', 'red', [['raid', '/eɪ/.'], ['sad', '/æ/.'], ['seed', '/iː/.']], '“said” /sed/ rhymes with “red”.'],
            ['come', 'drum', [['home', '/əʊ/.'], ['comb', '/əʊ/.'], ['calm', '/ɑː/.']], '“come” /kʌm/ rhymes with “drum”.'],
            ['through', 'blue', [['though', '/əʊ/.'], ['rough', '/ʌf/.'], ['cough', '/ɒf/.']], '“through” /θruː/ rhymes with “blue”.'],
            ['height', 'kite', [['weight', '/eɪ/.'], ['eight', '/eɪ/.'], ['hit', '/ɪ/.']], '“height” /haɪt/ rhymes with “kite”.'],
        ], 'Which word rhymes with “{q}”?', 'Rhyme is about the SOUND of the ending, not the spelling.'),
        eng_choose([
            ['Which pair rhymes?', 'bear / care', [['bear / beer', '/eə/ and /ɪə/ differ.'], ['bear / bore', '/eə/ and /ɔː/ differ.'], ['bear / bar', '/eə/ and /ɑː/ differ.']], 'bear /beə/ and care /keə/.'],
            ['Which pair rhymes?', 'phone / loan', [['phone / fun', 'Different vowels.'], ['phone / fan', 'Different vowels.'], ['phone / fine', 'Different vowels.']], 'phone and loan share /əʊn/.'],
            ['Which pair rhymes?', 'knew / shoe', [['knew / know', 'Different vowels.'], ['knew / now', 'Different vowels.'], ['knew / knee', 'Different vowels.']], 'knew and shoe share /uː/.'],
        ], '', 'Ignore the spelling; say both aloud.'),
        eng_choose([
            ['Which word does NOT rhyme with the others: “cough, off, rough, scoff”?', 'rough', [['cough', '/ɒf/, like off.'], ['off', '/ɒf/.'], ['scoff', '/ɒf/.']], '“rough” is /rʌf/; the others end /ɒf/.'],
            ['Which word does NOT rhyme with the others: “now, cow, low, how”?', 'low', [['now', '/aʊ/.'], ['cow', '/aʊ/.'], ['how', '/aʊ/.']], '“low” is /ləʊ/.'],
            ['Which word does NOT rhyme with the others: “wood, good, food, stood”?', 'food', [['wood', '/ʊd/.'], ['good', '/ʊd/.'], ['stood', '/ʊd/.']], '“food” is /fuːd/.'],
        ], '', 'Same spelling, different sound: listen.'),
    ],
    'EN-029' => [
        eng_choose([
            ['TUNDE bought the car. (stress shown in capitals)', 'Did Musa buy the car?', [['Did Tunde rent the car?', 'That would stress “bought”.'], ['Did Tunde buy the bus?', 'That would stress “car”.'], ['Did Tunde buy it last year?', 'No stressed time word.']], 'Stressing TUNDE answers “who?” — it corrects the person.'],
            ['Tunde BOUGHT the car.', 'Did Tunde rent the car?', [['Did Musa buy the car?', 'That would stress “Tunde”.'], ['Did Tunde buy the bus?', 'That would stress “car”.'], ['Did Tunde sell the bus?', 'Two things changed.']], 'Stressing BOUGHT corrects the action.'],
            ['Tunde bought the CAR.', 'Did Tunde buy the bus?', [['Did Musa buy the car?', 'That would stress “Tunde”.'], ['Did Tunde rent the car?', 'That would stress “bought”.'], ['When did Tunde buy it?', 'No stressed time word.']], 'Stressing CAR corrects the thing.'],
            ['I want the RED dress.', 'Do you want the blue dress?', [['Do you want the red shoes?', 'That would stress “dress”.'], ['Does she want the red dress?', 'That would stress “I”.'], ['Do you need the red dress?', 'That would stress “want”.']], 'Stressing RED corrects the colour.'],
        ], 'Which question does this answer? “{q}”', 'The stressed word is the one that corrects or contrasts.', 'concept', 40),
        eng_choose([
            ['Did Ada break the plate? — No, ___ broke it.', 'BISI', [['broke', 'The correction is the person.'], ['plate', 'The correction is the person.'], ['it', 'The correction is the person.']], 'The new or corrected information carries the emphatic stress.'],
            ['Is the meeting on Monday? — No, it is on ___.', 'TUESDAY', [['meeting', 'The correction is the day.'], ['is', 'The correction is the day.'], ['on', 'The correction is the day.']], 'Stress the corrected word: TUESDAY.'],
            ['Did you walk to school? — No, I ___ to school.', 'RAN', [['school', 'The correction is the action.'], ['I', 'The correction is the action.'], ['to', 'The correction is the action.']], 'Stress the corrected action: RAN.'],
        ], 'Which word takes the emphatic stress? {q}', 'Stress the word that answers or corrects.', 'concept', 35),
        eng_choose([
            ['Which word carries the emphatic stress if the sentence answers “Who wrote this letter?”: “My sister wrote this letter.”', 'sister', [['wrote', 'The question asks who, not what was done.'], ['letter', 'The letter is already known.'], ['this', 'Not the new information.']], 'The answer to “who” is the stressed word.'],
            ['Which word carries the emphatic stress if the sentence answers “What did your sister write?”: “My sister wrote a letter.”', 'letter', [['sister', 'Already known.'], ['wrote', 'Already known.'], ['My', 'Not the new information.']], 'The answer to “what” is the stressed word.'],
            ['Which word carries the emphatic stress if the sentence answers “When will you travel?”: “I will travel on Friday.”', 'Friday', [['travel', 'Already known.'], ['will', 'Not the new information.'], ['I', 'Not the new information.']], 'The answer to “when” is the stressed word.'],
        ], '', 'The new information is stressed.'),
    ],
    'EN-030' => [
        eng_choose([
            ['Where are you going?', 'falling', [['rising', 'Wh- questions usually fall at the end.'], ['level', 'English questions are not usually level.'], ['rising-falling on every word', 'Intonation is about the final glide.']], 'Wh- questions (where, what, who…) usually have a falling tune.'],
            ['Are you coming?', 'rising', [['falling', 'Yes/no questions usually rise.'], ['level', 'Not usual in English.'], ['falling then silent', 'Not a tune.']], 'Yes/no questions usually rise at the end.'],
            ['I live in Kaduna.', 'falling', [['rising', 'A plain statement falls.'], ['level', 'Not usual.'], ['rising on “I”', 'Not the tune of a statement.']], 'Statements usually fall.'],
            ['Sit down.', 'falling', [['rising', 'A command falls.'], ['level', 'Not usual.'], ['rising on “sit”', 'Not the tune of a command.']], 'Commands usually fall.'],
            ['You passed? (surprised)', 'rising', [['falling', 'A statement said as a question rises.'], ['level', 'Not usual.'], ['falling on “you”', 'Not the tune.']], 'A statement used as a question rises.'],
        ], 'Which tune (intonation) usually ends this? “{q}”', 'Wh- questions, statements and commands fall; yes/no questions rise.'),
        eng_choose([
            ['It’s a lovely day, isn’t it? (you are sure and expect agreement)', 'falling on the tag', [['rising on the tag', 'A rising tag asks a real question.'], ['level', 'Not usual.'], ['rising on “lovely”', 'The tune of a tag is on the tag.']], 'A falling tag expects agreement.'],
            ['You’re the new teacher, aren’t you? (you are not sure)', 'rising on the tag', [['falling on the tag', 'A falling tag expects agreement.'], ['level', 'Not usual.'], ['falling on “teacher”', 'The tune of a tag is on the tag.']], 'A rising tag asks a genuine question.'],
            ['Would you like tea or coffee? (a choice between two)', 'rising on “tea”, falling on “coffee”', [['rising on both “tea” and “coffee”', 'That asks “do you want a drink?”.'], ['falling on “tea”, rising on “coffee”', 'Back to front: a closed choice falls on the last item.'], ['level', 'Not usual.']], 'A closed choice rises on the first and falls on the last.'],
        ], 'Which intonation fits? {q}', 'A falling tag expects agreement; a rising tag is a real question.', 'concept', 35),
        eng_choose([
            ['Which sentence usually ends with a RISING tune?', 'Have you eaten?', [['What have you eaten?', 'A wh- question falls.'], ['I have eaten.', 'A statement falls.'], ['Eat your food.', 'A command falls.']], 'Yes/no question → rise.'],
            ['Which sentence usually ends with a FALLING tune?', 'Who broke the window?', [['Did you break the window?', 'Yes/no → rise.'], ['Is it broken?', 'Yes/no → rise.'], ['Was it you?', 'Yes/no → rise.']], 'Wh- question → fall.'],
            ['Which sentence usually ends with a RISING tune?', 'Can I help you?', [['How can I help you?', 'Wh- → fall.'], ['I can help you.', 'Statement → fall.'], ['Help me.', 'Command → fall.']], 'Yes/no question → rise.'],
        ], '', 'Can it be answered “yes” or “no”? Then it usually rises.'),
    ],
    ];
}
