<?php
declare(strict_types=1);

/**
 * English Lab — Stage 1, Words and Sentences (EN-001 … EN-010). Content only: every form is a kit
 * builder (englishlab-kit.php) over a table of real English. Append-only: new rows and new forms go
 * at the end of their list, because a session replays a question from (topic, form, seed).
 */
function eng_words_forms(): array {
    $why_s = 'A naive rule applied where English breaks it.';
    return [
    'EN-001' => [
        eng_choose([
            ['Lagos is the busiest city in Nigeria.', 'Lagos', [['city', 'A city is any city: it is a common noun.'], ['busiest', 'That describes the city: it is an adjective.'], ['is', 'That is the verb.']], 'A proper noun names one particular person, place or thing, and it starts with a capital letter.'],
            ['Our teacher, Mrs Okafor, marked the tests.', 'Mrs Okafor', [['teacher', 'Any teacher: a common noun.'], ['tests', 'Any test: a common noun.'], ['marked', 'That is the verb.']], 'A proper noun is the name of one particular person.'],
            ['We sailed down the River Niger in December.', 'River Niger', [['river', 'Lower case and any river: a common noun.'], ['sailed', 'That is the verb.'], ['We', 'That is a pronoun.']], 'A named river is a proper noun, and so is the name of a month.'],
            ['The Super Eagles won their match on Saturday.', 'Super Eagles', [['match', 'Any match: a common noun.'], ['won', 'That is the verb.'], ['their', 'That is a possessive word.']], 'The name of a particular team is a proper noun.'],
        ], 'Which word or phrase is a proper noun? “{q}”', 'A proper noun names one particular one and starts with a capital.'),
        eng_choose([
            ['a ___ of cattle', 'herd', [['flock', 'A flock is of sheep or birds.'], ['swarm', 'A swarm is of bees or insects.'], ['pack', 'A pack is of wolves or dogs.']], 'A group of cattle is a herd.'],
            ['a ___ of bees', 'swarm', [['herd', 'A herd is of cattle.'], ['school', 'A school is of fish.'], ['flock', 'A flock is of sheep or birds.']], 'A group of bees is a swarm.'],
            ['a ___ of fish', 'school', [['pack', 'A pack is of wolves.'], ['swarm', 'A swarm is of insects.'], ['herd', 'A herd is of cattle.']], 'A group of fish is a school (or a shoal).'],
            ['a ___ of sheep', 'flock', [['herd', 'A herd is of cattle.'], ['school', 'A school is of fish.'], ['bunch', 'A bunch is of flowers or keys.']], 'A group of sheep is a flock.'],
            ['a ___ of musicians', 'band', [['flock', 'A flock is of birds.'], ['swarm', 'A swarm is of insects.'], ['herd', 'A herd is of cattle.']], 'A group of musicians playing together is a band.'],
            ['a ___ of keys', 'bunch', [['herd', 'A herd is of animals.'], ['school', 'A school is of fish.'], ['crew', 'A crew is of people working a ship or plane.']], 'Keys held together are a bunch.'],
        ], 'Which collective noun fills the gap? {q}', 'A collective noun names a group as one thing.'),
        eng_type([
            ['the name of a city in Nigeria, written as it should be: abuja', 'Abuja', [], 'The name of a place is a proper noun, so it takes a capital letter.'],
            ['a day of the week, written as it should be: monday', 'Monday', [], 'Days of the week are proper nouns: capital letter.'],
            ['a month, written as it should be: september', 'September', [], 'Months are proper nouns: capital letter.'],
            ['a language, written as it should be: yoruba', 'Yoruba', [], 'The name of a language is a proper noun: capital letter.'],
            ['a country, written as it should be: ghana', 'Ghana', [], 'The name of a country is a proper noun: capital letter.'],
        ], 'Type {q}', 'Proper nouns start with a capital letter.', 'procedure', 25, ['case' => true]),
    ],
    'EN-002' => [
        eng_derive([['child', 'children'], ['man', 'men'], ['tooth', 'teeth'], ['mouse', 'mice'], ['foot', 'feet'], ['woman', 'women'], ['ox', 'oxen'], ['goose', 'geese']],
            static function (MlbRng $r, array $w) use ($why_s): array {
                [$one, $many] = $w;
                return mlb_mcq($r, 'What is the plural of “' . $one . '”?', $many,
                    [[eng_regular_plural($one), 'The regular -s/-es rule — but “' . $one . '” is irregular. ' . $why_s], [$many . 's', 'The plural is already “' . $many . '”: adding -s makes a double plural.'], [$one, 'That is the singular.']],
                    ['“' . $one . '” is an irregular noun: its plural is “' . $many . '”, not formed with -s.'], 'Some nouns change inside the word instead of adding -s.', 'concept', 25);
            }),
        eng_type([
            ['box', 'boxes', [], 'Nouns ending in s, x, z, ch or sh add -es.'], ['church', 'churches', [], 'Nouns ending in ch add -es.'],
            ['baby', 'babies', [], 'A consonant before the final y: change y to i and add -es.'], ['day', 'days', [], 'A vowel before the final y: just add -s.'],
            ['knife', 'knives', [], 'Many nouns ending in -fe change to -ves.'], ['leaf', 'leaves', [], 'Many nouns ending in -f change to -ves.'],
            ['potato', 'potatoes', [], 'Some nouns ending in o add -es: potatoes, tomatoes, heroes.'], ['bus', 'buses', [], 'Nouns ending in s add -es.'],
            ['city', 'cities', [], 'A consonant before the final y: change y to i and add -es.'], ['brush', 'brushes', [], 'Nouns ending in sh add -es.'],
        ], 'Type the plural of “{q}”.', 'Look at the last letter or two of the word.', 'procedure', 25),
        eng_choose([
            ['Which noun has the same form in the singular and the plural?', 'sheep', [['goat', 'One goat, two goats.'], ['cow', 'One cow, two cows.'], ['horse', 'One horse, two horses.']], 'One sheep, two sheep: the word does not change.'],
            ['Which of these is always plural and has no singular?', 'scissors', [['pen', 'One pen, two pens.'], ['table', 'One table, two tables.'], ['shoe', 'One shoe, a pair of shoes.']], 'Scissors, trousers and pliers are always plural: we say “a pair of scissors”.'],
            ['Which noun is uncountable (it has no plural in standard English)?', 'furniture', [['chair', 'One chair, two chairs.'], ['bed', 'One bed, two beds.'], ['table', 'One table, two tables.']], 'Furniture, equipment, luggage and information are uncountable: “pieces of furniture”, never “furnitures”.'],
            ['Which noun is uncountable?', 'information', [['fact', 'One fact, two facts.'], ['report', 'One report, two reports.'], ['idea', 'One idea, two ideas.']], '“Information” is uncountable: say “pieces of information”, never “informations”.'],
        ], '', 'Not every noun takes -s.', 'concept', 30),
    ],
    'EN-003' => [
        eng_choose([
            ['Tunde and ___ went to the market.', 'I', [['me', '“Me” is for the object; here it is part of the subject (… went).'], ['myself', '“Myself” needs “I” earlier in the sentence to point back to.'], ['mine', '“Mine” shows ownership.']], 'Take “Tunde and” away: “I went to the market”, not “me went”.'],
            ['The teacher gave the books to Ada and ___.', 'me', [['I', '“I” is for the subject; after “to” we need the object form.'], ['myself', '“Myself” needs “I” as the subject.'], ['mine', '“Mine” shows ownership.']], 'Take “Ada and” away: “gave the books to me”.'],
            ['Between you and ___, the plan will not work.', 'me', [['I', 'After a preposition such as “between”, use the object form.'], ['myself', '“Myself” is not used for “me” here.'], ['mine', '“Mine” shows ownership.']], 'Prepositions take the object form: between you and me.'],
            ['___ and his brother are in SS 2.', 'He', [['Him', '“Him” is the object form; this is the subject.'], ['His', '“His” shows ownership.'], ['Himself', '“Himself” needs a subject to point back to.']], 'Take “and his brother” away: “He is in SS 2”.'],
            ['This bag is not yours; it is ___.', 'hers', [['her’s', 'Possessive pronouns never take an apostrophe.'], ['her', '“Her” must be followed by a noun: “her bag”.'], ['she', '“She” is the subject form.']], 'Possessive pronouns stand alone and have no apostrophe: hers, ours, yours, theirs.'],
        ], 'Choose the right pronoun: {q}', 'Cover the other person’s name and listen to what is left.'),
        eng_type([
            ['The girls finished the work by ___.', 'themselves', [], 'A reflexive pronoun points back to the subject: the girls → themselves.'],
            ['I taught ___ to swim.', 'myself', [], 'I → myself.'],
            ['We should be proud of ___.', 'ourselves', [], 'We → ourselves.'],
            ['He hurt ___ while playing football.', 'himself', [], 'He → himself. “Hisself” is not a word.'],
            ['The cat cleaned ___.', 'itself', [], 'It → itself.'],
        ], 'Type the reflexive pronoun: {q}', 'It ends in -self or -selves and points back to the subject.', 'procedure', 25),
        eng_spot([
            [['Me and my friend', 'walked', 'to school', 'this morning.'], 0, 'My friend and I', 'This is the subject, so the pronoun is “I”, and polite English puts yourself last.'],
            [['Him and his sister', 'sing', 'in the', 'school choir.'], 0, 'He and his sister', 'This is the subject of “sing”, so it takes the subject form: He.'],
            [['The prize', 'was given', 'to my brother and I', 'yesterday.'], 2, 'to my brother and me', 'After “to”, use the object form: to my brother and me.'],
            [['These books', 'are not', 'your’s;', 'they are mine.'], 2, 'yours;', 'Possessive pronouns never take an apostrophe: yours, hers, ours, theirs.'],
        ], 'Find the pronoun in the wrong form or place.'),
    ],
    'EN-004' => [
        eng_choose([
            ['Every morning, my mother ___ to work by bus.', 'goes', [['go', 'With “my mother” (he/she/it) the simple present takes -s.'], ['went', '“Every morning” is a habit now: simple present.'], ['going', '“Going” needs a helper: “is going”.']], 'A habit in the present uses the simple present; he/she/it adds -s.'],
            ['Yesterday, we ___ rice and stew.', 'ate', [['eat', '“Yesterday” is past time.'], ['eaten', '“Eaten” needs “have” or “had”.'], ['eats', 'That is present, for he/she/it.']], 'A finished action in the past uses the simple past: eat → ate.'],
            ['Next week, the school ___ a sports day.', 'will hold', [['held', 'That is past; “next week” is future.'], ['holds', 'Possible in timetables, but the simple future is the usual choice here.'], ['holding', '“Holding” needs a helper verb.']], 'The simple future is will + base verb.'],
            ['Water ___ at 100 °C.', 'boils', [['boiled', 'A fact that is always true takes the simple present.'], ['boil', 'With “water” (it) the present takes -s.'], ['will boiled', '“Will” is followed by the base form, never the past.']], 'General truths use the simple present.'],
            ['Last year, Chidi ___ the spelling competition.', 'won', [['win', '“Last year” is past.'], ['wins', 'That is present.'], ['winned', '“Win” is irregular: the past is “won”.']], 'Past time: win → won.'],
        ], 'Choose the right verb: {q}', 'Look for the time words: yesterday, every day, next week.'),
        eng_type([
            ['walk', 'walked', [], 'A regular verb adds -ed in the past.'], ['jump', 'jumped', [], 'Regular: add -ed.'],
            ['dance', 'danced', [], 'A verb ending in e adds only -d.'], ['carry', 'carried', [], 'A consonant before y: change y to i and add -ed.'],
            ['stop', 'stopped', [], 'A short verb ending consonant–vowel–consonant doubles the last letter: stop → stopped.'], ['plan', 'planned', [], 'Double the final consonant: plan → planned.'],
            ['study', 'studied', [], 'Consonant + y: studied.'], ['play', 'played', [], 'Vowel + y: just add -ed.'],
        ], 'Type the simple past of “{q}”.', 'Regular verbs add -ed — watch the spelling at the end.', 'procedure', 25),
        eng_spot([
            [['She', 'go', 'to church', 'every Sunday.'], 1, 'goes', 'With she/he/it the simple present takes -s: she goes.'],
            [['They', 'buyed', 'new uniforms', 'last term.'], 1, 'bought', '“Buy” is irregular: the past is “bought”.'],
            [['The sun', 'rise', 'in the east', 'every day.'], 1, 'rises', 'The sun is “it”: it rises.'],
            [['I', 'will went', 'to the farm', 'tomorrow.'], 1, 'will go', 'After “will” use the base form: will go.'],
        ], 'Check that each verb matches its subject and its time.'),
    ],
    'EN-005' => [
        eng_derive([['tall', 'taller', 'tallest'], ['big', 'bigger', 'biggest'], ['happy', 'happier', 'happiest'], ['good', 'better', 'best'], ['bad', 'worse', 'worst'], ['far', 'farther', 'farthest'], ['beautiful', 'more beautiful', 'most beautiful'], ['careful', 'more careful', 'most careful']],
            static function (MlbRng $r, array $w): array {
                [$a, $c, $s] = $w;
                $want = $r->int(0, 1);
                $right = $want ? $s : $c;
                $wrong = $want ? [[$c, 'That is the comparative (two things); “of all” needs the superlative.'], ['most ' . $s, 'A double superlative: “most” and -est together.'], [$a, 'That is the plain adjective.']]
                               : [[$s, 'That is the superlative (three or more); “than” compares two.'], ['more ' . $c, 'A double comparative: “more” and -er together.'], [$a, 'That is the plain adjective.']];
                if (str_starts_with($c, 'more ')) $wrong[1] = [$want ? $a . 'est' : $a . 'er', 'Long adjectives take more/most, not -er/-est.'];
                $stem = $want ? 'She is the ___ (' . $a . ') of all the girls in the class.' : 'This box is ___ (' . $a . ') than that one.';
                return mlb_mcq($r, 'Choose the right form: ' . $stem, $right, $wrong,
                    [$want ? 'Comparing three or more uses the superlative.' : 'Comparing two (“than”) uses the comparative.', $a . ' → ' . $c . ' → ' . $s . '.'], '“Than” means two things; “of all” means three or more.', 'concept', 30);
            }),
        eng_type([
            ['small', 'smaller', [], 'One syllable: add -er.'], ['hot', 'hotter', [], 'Short vowel + one consonant: double it, then -er.'],
            ['easy', 'easier', [], 'Consonant + y: change y to i, then -er.'], ['good', 'better', [], 'Irregular: good → better → best.'],
            ['bad', 'worse', [], 'Irregular: bad → worse → worst.'], ['important', 'more important', [], 'Long adjectives use “more”.'],
            ['wide', 'wider', [], 'Ending in e: add only -r.'],
        ], 'Type the comparative (the form that compares two) of “{q}”.', 'Short words add -er; long words take “more”.', 'procedure', 25),
        eng_choose([
            ['Which word is an adjective? “The tired farmer rested under a mango tree.”', 'tired', [['farmer', 'That is the noun being described.'], ['rested', 'That is the verb.'], ['under', 'That is a preposition.']], 'An adjective describes a noun: tired describes the farmer.'],
            ['Which word is an adjective? “Bisi wore a bright yellow dress to the party.”', 'yellow', [['wore', 'That is the verb.'], ['dress', 'That is the noun being described.'], ['party', 'That is a noun.']], '“Yellow” (and “bright”) describe the dress.'],
            ['Which word is an adjective? “The old radio still works perfectly.”', 'old', [['radio', 'That is the noun.'], ['works', 'That is the verb.'], ['perfectly', 'That is an adverb: it describes how it works.']], '“Old” describes the radio.'],
            ['Which word is an adjective? “Heavy rain fell all night.”', 'Heavy', [['rain', 'That is the noun.'], ['fell', 'That is the verb.'], ['night', 'That is a noun.']], '“Heavy” describes the rain.'],
        ], '', 'An adjective tells you more about a noun: which, what kind, how many.'),
    ],
    'EN-006' => [
        eng_choose([
            ['Which word is an adverb? “Emeka ran quickly to the gate.”', 'quickly', [['ran', 'That is the verb the adverb describes.'], ['gate', 'That is a noun.'], ['Emeka', 'That is a proper noun.']], '“Quickly” tells us how he ran: an adverb of manner.'],
            ['Which word is an adverb? “We will travel tomorrow.”', 'tomorrow', [['travel', 'That is the verb.'], ['will', 'That is a helping verb.'], ['We', 'That is a pronoun.']], '“Tomorrow” tells us when: an adverb of time.'],
            ['Which word is an adverb? “She sings beautifully in the choir.”', 'beautifully', [['sings', 'That is the verb.'], ['choir', 'That is a noun.'], ['in', 'That is a preposition.']], '“Beautifully” tells us how she sings.'],
            ['Which word is an adverb? “The baby is sleeping upstairs.”', 'upstairs', [['baby', 'That is a noun.'], ['sleeping', 'That is the verb.'], ['is', 'That is a helping verb.']], '“Upstairs” tells us where: an adverb of place.'],
        ], '', 'An adverb tells you how, when, where or how often.'),
        eng_type([
            ['quick', 'quickly', [], 'Most adverbs of manner add -ly.'], ['careful', 'carefully', [], 'careful + -ly: both l’s stay.'],
            ['happy', 'happily', [], 'Consonant + y: change y to i, then -ly.'], ['gentle', 'gently', [], 'Ending in -le: change e to y.'],
            ['easy', 'easily', [], 'Consonant + y: change y to i, then -ly.'], ['good', 'well', [], '“Good” is the adjective; its adverb is “well”: she sings well.'],
        ], 'Type the adverb made from “{q}” (the word that says HOW something is done).', 'Most add -ly, but watch the spelling — and one is irregular.', 'procedure', 25),
        eng_spot([
            [['He', 'drives', 'very careful', 'on the highway.'], 2, 'very carefully', 'It describes how he drives (a verb), so it needs the adverb “carefully”.'],
            [['She', 'did', 'good', 'in the examination.'], 2, 'well', '“Did” is a verb, so it needs the adverb “well”, not the adjective “good”.'],
            [['The children', 'spoke', 'quiet', 'in the library.'], 2, 'quietly', '“Spoke” is a verb: spoke quietly.'],
            [['Please', 'write', 'neat', 'in your exercise book.'], 2, 'neatly', '“Write” is a verb: write neatly.'],
        ], 'Does the word describe a noun (adjective) or an action (adverb)?'),
    ],
    'EN-007' => [
        eng_type([
            ['my brother lives in kano.', 'My brother lives in Kano.', [], 'A sentence starts with a capital, and so does the name of a place; it ends with a full stop.'],
            ['we visited the national museum on friday.', 'We visited the National Museum on Friday.', [], 'Capitals for the first word, the museum’s name and the day.'],
            ['i think ngozi will win.', 'I think Ngozi will win.', [], '“I” on its own is always a capital, and so is a name.'],
            ['the harmattan starts in november.', 'The harmattan starts in November.', [], 'First word and month take capitals; “harmattan” is a common noun.'],
            ['our principal is dr bello.', 'Our principal is Dr Bello.', ['Our principal is Dr. Bello.'], 'A title before a name and the name take capitals.'],
        ], 'Rewrite with capital letters and a full stop where they belong: {q}', 'First word, names, days, months, “I” — and a full stop at the end.', 'procedure', 50, ['case' => true, 'punct' => true]),
        eng_choose([
            ['Which sentence is written correctly?', 'We will travel to Enugu in April.', [['we will travel to Enugu in April.', 'A sentence must begin with a capital letter.'], ['We will travel to enugu in april.', 'Place names and months take capitals.'], ['We will travel to Enugu in April', 'A statement ends with a full stop.']], 'Capital first word, capital names and months, full stop at the end.'],
            ['Which sentence is written correctly?', 'My friend and I play chess on Saturdays.', [['My friend and i play chess on Saturdays.', '“I” is always a capital.'], ['My Friend and I play chess on Saturdays.', '“Friend” is a common noun: no capital.'], ['my friend and I play chess on saturdays.', 'The first word and the day need capitals.']], 'Capitals for the first word, “I” and the day only.'],
            ['Which sentence is written correctly?', 'The River Benue joins the Niger at Lokoja.', [['The river benue joins the niger at lokoja.', 'Names of rivers and towns take capitals.'], ['The River Benue Joins The Niger At Lokoja.', 'Ordinary words in a sentence are not capitalised.'], ['the River Benue joins the Niger at Lokoja.', 'The first word needs a capital.']], 'Names take capitals; ordinary words do not.'],
        ], '', 'Capitals for the first word and for names — nowhere else.', 'concept', 35),
        eng_choose([
            ['Which word in this sentence needs a capital letter? “we watched the match at the stadium.”', 'we', [['match', 'A common noun: no capital.'], ['stadium', 'A common noun unless it is a name.'], ['watched', 'A verb: no capital.']], 'The first word of a sentence takes a capital.'],
            ['Which word needs a capital letter? “The meeting is on tuesday morning.”', 'tuesday', [['meeting', 'A common noun.'], ['morning', 'Parts of the day are not capitalised.'], ['is', 'A verb.']], 'Days of the week take capitals.'],
            ['Which word needs a capital letter? “Our guest speaker came from ghana.”', 'ghana', [['guest', 'A common noun.'], ['speaker', 'A common noun.'], ['came', 'A verb.']], 'Countries take capitals.'],
            ['Which word needs a capital letter? “Tell me what i should bring.”', 'i', [['me', 'Only “I” is always capitalised, not “me”.'], ['bring', 'A verb.'], ['what', 'An ordinary word.']], 'The pronoun “I” is always a capital letter.'],
        ], '', 'First words, names, days, months, countries, and “I”.'),
    ],
    'EN-008' => [
        eng_choose([
            ['Which sentence uses commas correctly?', 'We bought yam, beans, rice and oil.', [['We bought yam beans rice and oil.', 'Items in a list are separated by commas.'], ['We bought, yam, beans, rice, and, oil.', 'No comma after the verb, and none before “and” between two words.'], ['We, bought yam beans rice and oil.', 'A comma does not separate the subject from its verb.']], 'Commas separate the items in a list; “and” joins the last two.'],
            ['Which sentence uses the comma correctly?', 'After the rain stopped, we went outside.', [['After the rain stopped we, went outside.', 'The comma goes after the opening part, not inside the main clause.'], ['After, the rain stopped we went outside.', 'The comma comes at the end of the opening clause.'], ['After the rain, stopped we went outside.', 'Do not split “the rain stopped”.']], 'A comma marks the end of an opening clause.'],
            ['Which sentence uses commas correctly?', 'Ada, please close the window.', [['Ada please close the window.', 'When you speak to someone by name, a comma sets the name off.'], ['Ada please, close the window.', 'The comma goes straight after the name.'], ['Ada please close, the window.', 'Do not split a verb from its object.']], 'A comma sets off the name of the person spoken to.'],
        ], '', 'Read it aloud: a comma marks a short pause.', 'concept', 35),
        eng_choose([
            ['Where are you going', '?', [['.', 'It asks something, so it needs a question mark.'], ['!', 'An exclamation mark shows strong feeling, not a question.'], [',', 'A comma never ends a sentence.']], 'A direct question ends with a question mark.'],
            ['I wonder where she is going', '.', [['?', '“I wonder…” is a statement about a question, not a question.'], ['!', 'Nothing here is shouted or exclaimed.'], [',', 'A comma never ends a sentence.']], 'An indirect question is a statement: full stop.'],
            ['What a beautiful day it is', '!', [['?', '“What a…” here exclaims; it does not ask.'], ['.', 'It shows strong feeling.'], [',', 'A comma never ends a sentence.']], 'An exclamation ends with an exclamation mark.'],
            ['Did you finish your homework', '?', [['.', 'It asks something.'], ['!', 'It is a question, not an exclamation.'], [';', 'A semicolon never ends a sentence.']], 'A direct question: question mark.'],
            ['He asked me what time it was', '.', [['?', 'This reports a question; it is not asking one.'], ['!', 'No strong feeling.'], [',', 'A comma never ends a sentence.']], 'Reported questions end with a full stop.'],
        ], 'Which mark ends this sentence? “{q}…”', 'Is it asking, telling, or exclaiming?', 'concept', 25),
        eng_type([
            ['is the library open today', 'Is the library open today?', [], 'A question: capital first, question mark last.'],
            ['can you help me carry this bag', 'Can you help me carry this bag?', [], 'A question: question mark.'],
            ['please shut the door', 'Please shut the door.', [], 'A polite command ends with a full stop.'],
            ['how many states are in nigeria', 'How many states are in Nigeria?', [], 'A question; “Nigeria” is a name.'],
        ], 'Write it with the right capital letters and end mark: {q}', 'Asking → ?, telling → .', 'procedure', 45, ['case' => true, 'punct' => true]),
    ],
    'EN-009' => [
        eng_derive([
            ['necessary', ['neccessary', 'necesary', 'neccesary']], ['accommodation', ['accomodation', 'acommodation', 'accommadation']], ['separate', ['seperate', 'separete', 'seprate']],
            ['definitely', ['definately', 'definitly', 'defenitely']], ['occurred', ['occured', 'ocurred', 'occurrd']], ['embarrass', ['embarass', 'embarras', 'embbarass']],
            ['committee', ['commitee', 'comittee', 'committe']], ['receive', ['recieve', 'receeve', 'receve']], ['government', ['goverment', 'govenment', 'governmant']],
            ['February', ['Febuary', 'Februery', 'Febrary']], ['privilege', ['priviledge', 'privelege', 'privilage']], ['independent', ['independant', 'indipendent', 'independint']],
        ], static function (MlbRng $r, array $w): array {
            [$right, $bad] = $w;
            return mlb_mcq($r, 'Which spelling is correct?', $right, array_map(static fn($b) => [$b, 'A common misspelling — check the doubled letters and the vowels.'], $bad),
                ['The correct spelling is “' . $right . '”.'], 'Say it slowly, syllable by syllable, and picture each letter.', 'concept', 25);
        }),
        eng_type([
            ['acc_mm_dation (a place to stay)', 'accommodation', [], 'Two c’s and two m’s: accommodation.'], ['nec_ssary', 'necessary', [], 'One collar, two sleeves: one c, two s’s.'],
            ['sep_rate', 'separate', [], 'There is “a rat” in separate.'], ['rec__ve (to get)', 'receive', [], '“I before e except after c”: receive.'],
            ['bel__ve', 'believe', [], 'I before e: believe.'], ['tom_rrow', 'tomorrow', [], 'One m, two r’s: tomorrow.'],
            ['beg_nning', 'beginning', [], 'Begin doubles its n before -ing: beginning.'],
        ], 'Type the whole word, spelt correctly: {q}', 'Watch for double letters.', 'procedure', 30),
        eng_spot([
            [['The goverment', 'has opened', 'a new', 'hospital.'], 0, 'The government', '“Government” keeps the n from “govern”.'],
            [['I will', 'definately', 'attend', 'the meeting.'], 1, 'definitely', 'Think of “finite”: defin-ite-ly.'],
            [['The accident', 'occured', 'near our', 'school.'], 1, 'occurred', 'Occur doubles its r: occurred.'],
            [['Please', 'seperate', 'the red beads from', 'the blue ones.'], 1, 'separate', 'There is “a rat” in separate.'],
        ], 'Read each word letter by letter.'),
    ],
    'EN-010' => [
        eng_choose([
            ['brave', 'courageous', [['coward', 'That is the opposite.'], ['brief', 'Sounds similar, means “short”.'], ['angry', 'A different feeling.']], 'Brave and courageous mean the same.'],
            ['big', 'large', [['little', 'That is the opposite.'], ['heavy', 'Related, but it is about weight.'], ['tall', 'That is about height.']], 'Big and large mean the same.'],
            ['begin', 'start', [['finish', 'That is the opposite.'], ['continue', 'That is going on, not starting.'], ['wait', 'A different action.']], 'Begin and start mean the same.'],
            ['rich', 'wealthy', [['poor', 'That is the opposite.'], ['proud', 'A different quality.'], ['busy', 'A different quality.']], 'Rich and wealthy mean the same.'],
            ['quiet', 'silent', [['noisy', 'That is the opposite.'], ['quick', 'Looks similar, means “fast”.'], ['quite', 'Looks similar, means “fairly”.']], 'Quiet and silent are close in meaning.'],
        ], 'Which word means nearly the same as “{q}”?', 'A synonym can replace the word without changing the meaning.'),
        eng_choose([
            ['ancient', 'modern', [['old', 'That is a synonym, not the opposite.'], ['antique', 'That also means old.'], ['historic', 'That is close in meaning.']], 'Ancient is old; modern is new.'],
            ['generous', 'mean', [['kind', 'That is close in meaning.'], ['giving', 'That is close in meaning.'], ['rich', 'Not the opposite of generous.']], 'Generous people give freely; mean people do not.'],
            ['victory', 'defeat', [['win', 'That is close in meaning.'], ['triumph', 'That is a synonym.'], ['match', 'Not an opposite.']], 'The opposite of a victory is a defeat.'],
            ['accept', 'reject', [['receive', 'That is close in meaning.'], ['except', 'Sounds similar, means “apart from”.'], ['agree', 'Close in meaning.']], 'Accept and reject are opposites.'],
            ['expand', 'contract', [['increase', 'That is close in meaning.'], ['grow', 'Close in meaning.'], ['spend', 'Not related.']], 'Expand is to grow bigger; contract is to shrink.'],
        ], 'Which word is OPPOSITE in meaning to “{q}”?', 'An antonym means the opposite.'),
        eng_type([
            ['happy', 'sad', ['unhappy'], 'The opposite of happy is sad (or unhappy).'], ['early', 'late', [], 'The opposite of early is late.'],
            ['strong', 'weak', [], 'The opposite of strong is weak.'], ['give', 'take', ['receive'], 'The opposite of give is take or receive.'],
            ['inside', 'outside', [], 'The opposite of inside is outside.'], ['friend', 'enemy', ['foe'], 'The opposite of friend is enemy (or foe).'],
        ], 'Type a word opposite in meaning to “{q}”.', 'Think of the word that means the reverse.', 'procedure', 25),
    ],
    ];
}
