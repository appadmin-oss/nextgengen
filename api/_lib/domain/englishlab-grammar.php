<?php
declare(strict_types=1);

/**
 * English Lab — Structure: Stage 2, Building Sentences (EN-011 … EN-020) and Stage 4, Grammar in
 * Use (EN-031 … EN-040). Content only, built with the kit (englishlab-kit.php). Append-only.
 */
function eng_grammar_forms(): array {
    // Irregular verbs: [base, simple past, past participle]. One table, three forms read it.
    $irr = [['go', 'went', 'gone'], ['write', 'wrote', 'written'], ['eat', 'ate', 'eaten'], ['begin', 'began', 'begun'], ['drink', 'drank', 'drunk'],
            ['take', 'took', 'taken'], ['break', 'broke', 'broken'], ['speak', 'spoke', 'spoken'], ['choose', 'chose', 'chosen'], ['swim', 'swam', 'swum'],
            ['ring', 'rang', 'rung'], ['fly', 'flew', 'flown'], ['know', 'knew', 'known'], ['see', 'saw', 'seen'], ['give', 'gave', 'given'], ['teach', 'taught', 'taught']];
    return [
    'EN-011' => [
        eng_choose([
            ['The boys ___ football every evening.', 'play', [['plays', 'The subject is plural (the boys): no -s on the verb.'], ['playing', '“Playing” needs a helper: “are playing”.'], ['has played', '“Has” goes with a singular subject.']], 'A plural subject takes the plural verb: the boys play.'],
            ['My sister ___ in Port Harcourt.', 'lives', [['live', 'The subject is singular (my sister): add -s.'], ['are living', '“Are” goes with a plural subject.'], ['have lived', '“Have” goes with I/you/we/they.']], 'A singular subject (he/she/it) takes -s: she lives.'],
            ['Neither the teacher nor the pupils ___ ready.', 'were', [['was', 'With “neither … nor”, the verb agrees with the nearer subject: pupils.'], ['is', 'Past or present, the nearer subject is plural.'], ['has been', 'Singular verb for a plural nearer subject.']], 'With neither/nor, agree with the nearer subject: pupils were.'],
            ['The box of oranges ___ on the table.', 'is', [['are', 'The subject is “the box”, not “oranges”.'], ['were', 'Plural; the subject is singular.'], ['have been', 'Plural helper; the subject is singular.']], 'The subject is “the box” (singular); “of oranges” only describes it.'],
            ['Each of the students ___ a textbook.', 'has', [['have', '“Each” is singular, whatever follows “of”.'], ['are having', 'Plural; “each” is singular.'], ['were having', 'Plural; “each” is singular.']], '“Each” is singular: each … has.'],
        ], 'Choose the verb that agrees: {q}', 'Find the real subject first — ignore phrases that start with “of”.'),
        eng_spot([
            [['The list', 'of names', 'are', 'on the notice board.'], 2, 'is', 'The subject is “the list” (one list), so the verb is “is”.'],
            [['My father', 'and my uncle', 'works', 'in Ibadan.'], 2, 'work', 'Two subjects joined by “and” are plural: they work.'],
            [['Everybody', 'in the class', 'have', 'a uniform.'], 2, 'has', '“Everybody” is singular: everybody has.'],
            [['The news', 'about the match', 'were', 'exciting.'], 2, 'was', '“News” is singular (an uncountable noun): the news was.'],
        ], 'Find the verb, then find its true subject.'),
        eng_type([
            ['She (go) to school by bus.', 'goes', [], 'She → goes.'], ['They (be) late yesterday.', 'were', [], 'They (plural, past) → were.'],
            ['The dog (bark) at night.', 'barks', [], 'The dog (it) → barks.'], ['We (have) two exams today.', 'have', [], 'We → have.'],
            ['Mathematics (be) my favourite subject.', 'is', [], '“Mathematics” is one subject: singular.'], ['The players (train) every morning.', 'train', [], 'Plural subject → no -s.'],
        ], 'Type the verb in brackets in the right form: {q}', 'Singular subject in the present: add -s.', 'procedure', 30),
    ],
    'EN-012' => [
        eng_choose([
            ['She is good ___ mathematics.', 'at', [['in', 'We say “good at” a subject or skill.'], ['on', 'Not used with “good”.'], ['with', '“Good with” is for people or tools, not subjects.']], 'Good at something.'],
            ['We arrived ___ Abuja at noon.', 'in', [['to', 'We arrive in or at a place, never “arrive to”.'], ['on', 'Not used with places like cities.'], ['into', '“Into” means movement inside.']], 'Arrive in a city or country; arrive at a building.'],
            ['The book is different ___ the one I bought.', 'from', [['than', '“Different from” is the standard form.'], ['with', 'Not used with “different”.'], ['of', 'Not used with “different”.']], 'Different from.'],
            ['He was born ___ 12 May.', 'on', [['in', '“In” is for months and years; a date takes “on”.'], ['at', '“At” is for clock times.'], ['by', '“By” means “not later than”.']], 'On a date or day; in a month or year; at a time.'],
            ['I have lived here ___ 2019.', 'since', [['for', '“For” goes with a length of time (for six years).'], ['from', '“From” needs “to” or “till”.'], ['in', 'Use “since” with a starting point and the present perfect.']], 'Since + a starting point; for + a length of time.'],
            ['The cat jumped ___ the table.', 'onto', [['into', '“Into” is going inside something.'], ['upon of', 'Not English.'], ['at', '“At” does not show movement onto a surface.']], 'Movement on to a surface: onto.'],
        ], 'Choose the right preposition: {q}', 'Some verbs and adjectives always take the same preposition.'),
        eng_type([
            ['interested ___ music', 'in', [], 'Interested in.'], ['afraid ___ dogs', 'of', [], 'Afraid of.'], ['listen ___ the radio', 'to', [], 'Listen to.'],
            ['depend ___ your parents', 'on', ['upon'], 'Depend on (or upon).'], ['congratulate her ___ her success', 'on', [], 'Congratulate someone on something.'],
            ['married ___ a doctor', 'to', [], 'Married to someone.'], ['angry ___ the noise', 'about', ['at'], 'Angry about (or at) a thing; angry with a person.'],
        ], 'Type the preposition that fills the gap: {q}', 'Say the phrase aloud.', 'procedure', 25),
        eng_spot([
            [['We discussed', 'about', 'the problem', 'at the meeting.'], 1, '', '“Discuss” takes an object directly: we discussed the problem.'],
            [['She is', 'married with', 'a lawyer', 'from Owerri.'], 1, 'married to', 'You are married to someone.'],
            [['He', 'entered into', 'the classroom', 'late.'], 1, 'entered', '“Enter” a room takes no preposition.'],
            [['She', 'complained', 'on', 'the noise.'], 2, 'about', 'You complain about something.'],
        ], 'Some verbs take no preposition at all.'),
    ],
    'EN-013' => [
        eng_choose([
            ['It was raining, ___ we stayed indoors.', 'so', [['but', '“But” shows a contrast; this is a result.'], ['because', '“Because” gives a reason, but the reason comes first here.'], ['or', '“Or” gives a choice.']], '“So” introduces a result.'],
            ['She studied hard, ___ she failed the test.', 'but', [['so', 'A result would be passing; this is a contrast.'], ['and', '“And” adds; it hides the surprise.'], ['because', '“Because” gives a reason.']], '“But” joins two ideas that contrast.'],
            ['We stayed at home ___ it was raining.', 'because', [['so', '“So” would put the result after.'], ['although', '“Although” shows contrast.'], ['or', '“Or” gives a choice.']], '“Because” gives the reason.'],
            ['___ he was tired, he finished the race.', 'Although', [['Because', 'Tiredness is not why he finished.'], ['So', '“So” cannot start this kind of sentence.'], ['Unless', '“Unless” means “if not”.']], '“Although” introduces a contrast: tired, yet finished.'],
            ['You can have tea ___ coffee.', 'or', [['and', '“And” would mean both.'], ['but', 'There is no contrast.'], ['so', 'There is no result.']], '“Or” gives a choice.'],
            ['You will not pass ___ you study.', 'unless', [['if', '“If” would mean the opposite.'], ['because', 'That gives a reason.'], ['although', 'That shows contrast.']], '“Unless” means “if not”: you will not pass if you do not study.'],
        ], 'Choose the joining word: {q}', 'Is the second idea a result, a reason, a contrast or a choice?'),
        eng_order([
            [['Although', 'it', 'was', 'late,', 'we', 'kept', 'reading.'], 'An “although” clause first, then a comma, then the main clause.'],
            [['She', 'smiled', 'because', 'she', 'had', 'passed.'], 'Main clause, then “because” and the reason.'],
            [['We', 'can', 'walk', 'or', 'take', 'a', 'bus.'], '“Or” joins two choices.'],
            [['It', 'was', 'hot,', 'so', 'we', 'opened', 'the', 'windows.'], 'Cause, comma, “so”, result.'],
        ], 'Put the words in order to make one joined sentence.', 'Find the joining word first.'),
        eng_type([
            ['I was hungry. I ate some bread. (join with “so”)', 'I was hungry, so I ate some bread.', ['I was hungry so I ate some bread.'], '“So” joins a cause to its result, usually after a comma.'],
            ['He is poor. He is honest. (join with “but”)', 'He is poor, but he is honest.', ['He is poor but he is honest.', 'He is poor but honest.', 'He is poor, but honest.'], '“But” joins two contrasting ideas.'],
            ['The road was closed. There was a flood. (join with “because”)', 'The road was closed because there was a flood.', [], '“Because” introduces the reason.'],
            ['She is tall. She is strong. (join with “and”)', 'She is tall and strong.', ['She is tall and she is strong.'], '“And” adds one idea to another.'],
        ], 'Join the two sentences into one: {q}', 'Use the joining word given; do not repeat what is not needed.', 'procedure', 60),
    ],
    'EN-014' => [
        eng_choose([
            ['You are coming,', 'aren’t you?', [['isn’t it?', '“Isn’t it” is not a universal tag: it must match “you are”.'], ['are you?', 'A positive statement takes a negative tag.'], ['don’t you?', 'The helper verb is “are”, not “do”.']], 'Positive statement → negative tag, using the same helper verb: you are → aren’t you?'],
            ['She can swim,', 'can’t she?', [['isn’t it?', 'The tag repeats the helper (can) and the subject (she).'], ['can she?', 'A positive statement takes a negative tag.'], ['doesn’t she?', 'The helper is “can”, not “does”.']], 'can → can’t she?'],
            ['They didn’t come,', 'did they?', [['didn’t they?', 'A negative statement takes a positive tag.'], ['isn’t it?', 'The tag must match “they did”.'], ['do they?', 'The statement is in the past.']], 'Negative statement → positive tag: did they?'],
            ['He plays chess,', 'doesn’t he?', [['isn’t it?', 'The tag must match “he does”.'], ['does he?', 'A positive statement takes a negative tag.'], ['don’t he?', '“He” takes “does/doesn’t”.']], 'No helper in the statement: use do/does/did. plays → doesn’t he?'],
            ['I am your friend,', 'aren’t I?', [['amn’t I?', 'Not standard English.'], ['isn’t it?', 'The tag must match “I am”.'], ['am I?', 'A positive statement takes a negative tag.']], 'I am → aren’t I? (the standard form).'],
            ['Let’s go home,', 'shall we?', [['isn’t it?', 'Not used after “Let’s”.'], ['won’t we?', 'After “Let’s” the tag is “shall we?”.'], ['don’t we?', 'Not used after “Let’s”.']], 'After “Let’s…” the tag is “shall we?”.'],
        ], 'Choose the question tag: “{q} ___”', 'Same helper verb, same subject as a pronoun, opposite polarity.'),
        eng_type([
            ['It is hot today, ___', 'isn’t it?', ['isn’t it', "isn't it?"], 'it is → isn’t it?'], ['You have finished, ___', 'haven’t you?', ['haven’t you', "haven't you?"], 'you have → haven’t you?'],
            ['She won’t be late, ___', 'will she?', ['will she'], 'won’t → will she?'], ['They were tired, ___', 'weren’t they?', ['weren’t they', "weren't they?"], 'they were → weren’t they?'],
            ['He likes rice, ___', 'doesn’t he?', ['doesn’t he', "doesn't he?"], 'likes → doesn’t he?'],
        ], 'Type the question tag: {q}', 'Copy the helper verb, flip positive and negative.', 'procedure', 30),
        eng_spot([
            [['You', 'are', 'coming to the party,', 'isn’t it?'], 3, 'aren’t you?', 'The tag must match the subject and verb: you are → aren’t you?'],
            [['She', 'doesn’t', 'eat meat,', 'doesn’t she?'], 3, 'does she?', 'A negative statement takes a positive tag.'],
            [['They', 'have', 'left already,', 'didn’t they?'], 3, 'haven’t they?', 'The helper is “have”: haven’t they?'],
        ], 'The tag must echo the subject and helper verb.'),
    ],
    'EN-015' => [
        eng_choose([
            ['Look! The children ___ in the rain.', 'are playing', [['play', '“Look!” means it is happening now: present continuous.'], ['played', 'That is past.'], ['have played', 'That is a finished action.']], 'Something happening right now: present continuous (am/is/are + -ing).'],
            ['I ___ my homework already.', 'have finished', [['finished already', '“Already” goes with the present perfect.'], ['am finishing', 'That means still in progress.'], ['finish', 'That is a habit.']], 'A finished action that matters now (“already”): present perfect.'],
            ['When you called, I ___ dinner.', 'was eating', [['ate', 'The call interrupted something already in progress.'], ['have eaten', 'That is present perfect.'], ['am eating', 'That is present.']], 'An action in progress in the past: past continuous (was/were + -ing).'],
            ['By the time we arrived, the film ___.', 'had started', [['started', 'It started BEFORE we arrived: past perfect.'], ['has started', 'That is present perfect.'], ['was starting', 'That suggests it began just as we arrived.']], 'The earlier of two past actions: past perfect (had + past participle).'],
            ['She ___ in this school since 2020.', 'has taught', [['teaches', '“Since 2020” reaches up to now: present perfect.'], ['taught', 'That would mean she has stopped.'], ['is teaching since', '“Since” goes with the perfect.']], 'From a past point up to now: present perfect.'],
        ], 'Choose the right tense: {q}', 'Is it happening now, finished, or earlier than another past action?'),
        eng_type([
            ['She (read) a novel right now.', 'is reading', [], 'Right now → present continuous.'], ['They (finish) the project yesterday.', 'finished', [], 'Yesterday → simple past.'],
            ['I (never see) snow.', 'have never seen', [], 'Up to now → present perfect.'], ['We (wait) for the bus when it started to rain.', 'were waiting', [], 'In progress in the past → past continuous.'],
            ['He (already leave) when I got there.', 'had already left', [], 'Earlier past action → past perfect.'],
        ], 'Type the verb in the right tense: {q}', 'Look for now, yesterday, already, since, when.', 'procedure', 35),
        eng_spot([
            [['I', 'am knowing', 'the answer', 'to that question.'], 1, 'know', '“Know” is a state, not an action: it is not used in the continuous.'],
            [['She', 'has went', 'to the market', 'already.'], 1, 'has gone', 'Has + past participle: gone, not went.'],
            [['We', 'did not saw', 'him', 'yesterday.'], 1, 'did not see', 'After “did”, use the base form: see.'],
            [['They', 'are living', 'here for', 'five years.'], 1, 'have been living', 'A period that started in the past and goes on now takes the perfect continuous: they have been living here for five years.'],
        ], 'Check each verb’s helper and form.'),
    ],
    'EN-016' => [
        eng_derive($irr, static function (MlbRng $r, array $v): array {
            [$b, $p, $pp] = $v;
            return mlb_mcq($r, 'What is the simple past of “' . $b . '”?', $p, [[eng_regular_past($b), '“' . $b . '” is irregular; the -ed rule does not apply.'], [$pp === $p ? $b . 'en' : $pp, $pp === $p ? 'Not a form of this verb.' : 'That is the past participle (used after have/had).'], [$b, 'That is the base form.']],
                [$b . ' → ' . $p . ' → ' . $pp . '.'], 'Irregular verbs must be learnt: base, past, past participle.', 'concept', 25);
        }),
        eng_type(array_map(static fn($v) => ['I have ___ (' . $v[0] . ')', $v[2], [], 'After have/has/had, use the past participle: ' . $v[0] . ' → ' . $v[2] . '.'], $irr),
            'Type the past participle: {q}', 'After “have”, use the third form.', 'procedure', 25),
        eng_spot([
            [['The bell', 'has rang', 'for', 'assembly.'], 1, 'has rung', 'Has + past participle: rung.'],
            [['He', 'drunk', 'all the water', 'yesterday.'], 1, 'drank', 'Simple past is “drank”; “drunk” follows have/had.'],
            [['Our team', 'has beginned', 'training for', 'the inter-house sports.'], 1, 'has begun', 'Begin → began → begun.'],
            [['She', 'had wrote', 'the letter', 'before noon.'], 1, 'had written', 'Had + past participle: written.'],
        ], 'Past participles follow have, has and had.'),
    ],
    'EN-017' => [
        eng_choose([
            ['the ___ shoes (one girl)', 'girl’s', [['girls’', 'That is for more than one girl.'], ['girls', 'Without an apostrophe it is just a plural.'], ['girl’s’', 'Only one apostrophe is needed.']], 'One owner: add ’s.'],
            ['the ___ bags (many students)', 'students’', [['student’s', 'That is for one student.'], ['students', 'Without an apostrophe, there is no ownership.'], ['students’s', 'A plural ending in s takes only the apostrophe.']], 'A plural ending in s: add the apostrophe after it.'],
            ['the ___ toys (many children)', 'children’s', [['childrens’', '“Children” does not end in s: add ’s.'], ['childs’', '“Childs” is not a word.'], ['childrens', 'There is no apostrophe.']], 'A plural not ending in s adds ’s: children’s.'],
            ['The dog wagged ___ tail.', 'its', [['it’s', '“It’s” means “it is”.'], ['its’', 'Not a word.'], ['it is', 'That makes no sense here.']], 'Possessive “its” has no apostrophe; “it’s” means “it is”.'],
        ], 'Choose the right form: {q}', 'One owner → ’s; a plural ending in s → s’.'),
        eng_type([
            ['do not', 'don’t', ["don't"], 'The apostrophe stands where the o of “not” was.'], ['it is', 'it’s', ["it's"], 'it is → it’s.'],
            ['we are', 'we’re', ["we're"], 'we are → we’re.'], ['cannot', 'can’t', ["can't"], 'cannot → can’t.'], ['they have', 'they’ve', ["they've"], 'they have → they’ve.'],
            ['will not', 'won’t', ["won't"], 'will not → won’t (irregular).'],
        ], 'Type the short form (contraction) of “{q}”.', 'The apostrophe marks the missing letters.', 'procedure', 25),
        eng_spot([
            [['The', 'teacher’s', 'collected all the', 'notebooks.'], 1, 'teachers', 'A plain plural takes no apostrophe.'],
            [['The company', 'lost', 'it’s', 'licence.'], 2, 'its', 'Possessive “its” has no apostrophe.'],
            [['We', 'sell fresh', 'tomatoe’s', 'every day.'], 2, 'tomatoes', 'Plurals never take an apostrophe.'],
        ], 'Plurals do not take apostrophes; owners do.'),
    ],
    'EN-018' => [
        eng_choose([
            ['___ going to the stadium tomorrow.', 'They’re', [['Their', '“Their” shows ownership.'], ['There', '“There” is a place.'], ['Thier', 'A misspelling.']], 'They’re = they are.'],
            ['Put the books over ___.', 'there', [['their', '“Their” shows ownership.'], ['they’re', '“They’re” means “they are”.'], ['thier', 'A misspelling.']], '“There” is a place.'],
            ['I need to ___ the bus at seven.', 'catch', [['cache', '“Cache” is a store.'], ['cash', '“Cash” is money.'], ['catches', 'After “to”, use the base form.']], 'Catch a bus.'],
            ['Turn ___ the radio, please.', 'off', [['of', '“Of” is a different word.'], ['out', 'You turn off a radio.'], ['under', 'Not used here.']], 'Off and of sound different; “turn off” switches something off.'],
            ['The wind ___ the papers away.', 'blew', [['blue', '“Blue” is a colour.'], ['blow', 'That is present; this is past.'], ['blown', '“Blown” needs has/had.']], 'Blew (past of blow) and blue sound the same.'],
            ['We walked ___ the market.', 'past', [['passed', '“Passed” is a verb (we passed the market).'], ['passt', 'Not a word.'], ['pass', 'That is the base verb.']], '“Past” is the preposition; “passed” is the verb.'],
        ], 'Choose the right word: {q}', 'Words that sound the same can mean different things.'),
        eng_choose([
            ['Which sentence is correct?', 'You’re welcome to join us.', [['Your welcome to join us.', '“Your” shows ownership; you mean “you are”.'], ['Yore welcome to join us.', '“Yore” means long ago.'], ['You welcome to join us.', 'The verb is missing.']], 'You’re = you are.'],
            ['Which sentence is correct?', 'I would like a piece of cake.', [['I would like a peace of cake.', '“Peace” is calm, not a part.'], ['I would like a peice of cake.', 'Misspelling.'], ['I would like a pease of cake.', 'Not a word.']], 'A piece = a part; peace = calm.'],
            ['Which sentence is correct?', 'The principal spoke at the assembly.', [['The principle spoke at the assembly.', 'A principle is a rule; the principal is the head.'], ['The principel spoke at the assembly.', 'Misspelling.'], ['The prinsipal spoke at the assembly.', 'Misspelling.']], 'The principal (head of school); a principle (a rule).'],
        ], '', 'Read the sentence with each meaning in mind.'),
        eng_type([
            ['The plural of “tooth” is “teeth”, and ___ (two/too/to) many sweets damage them.', 'too', [], '“Too” means “more than enough” (or “also”).'],
            ['I ___ (no/know) the answer.', 'know', [], '“Know” is to be aware of.'],
            ['She ___ (won/one) the race.', 'won', [], '“Won” is the past of win.'],
            ['We ___ (hear/here) the bell ringing.', 'hear', [], '“Hear” is with your ears.'],
            ['It is ___ (whether/weather) forecast time.', 'weather', [], '“Weather” is rain and sun; “whether” means “if”.'],
        ], 'Type the right word: {q}', 'Think of the meaning, not the sound.', 'procedure', 25),
    ],
    'EN-019' => [
        eng_choose([
            ['Which prefix makes the opposite of “possible”?', 'im-', [['un-', '“Unpossible” is not a word.'], ['in-', '“Inpossible” is not a word; before p, in- becomes im-.'], ['dis-', '“Dispossible” is not a word.']], 'impossible: in- becomes im- before b, m and p.'],
            ['Which prefix makes the opposite of “agree”?', 'dis-', [['un-', '“Unagree” is not a word.'], ['im-', '“Imagree” is not a word.'], ['in-', '“Inagree” is not a word.']], 'disagree.'],
            ['Which prefix makes the opposite of “legal”?', 'il-', [['un-', '“Unlegal” is not a word.'], ['in-', 'Before l, in- becomes il-.'], ['dis-', '“Dislegal” is not a word.']], 'illegal: in- becomes il- before l.'],
            ['Which prefix makes the opposite of “regular”?', 'ir-', [['un-', '“Unregular” is not a word.'], ['in-', 'Before r, in- becomes ir-.'], ['dis-', '“Disregular” is not a word.']], 'irregular: in- becomes ir- before r.'],
            ['Which prefix makes the opposite of “happy”?', 'un-', [['im-', '“Imhappy” is not a word.'], ['dis-', '“Dishappy” is not a word.'], ['in-', '“Inhappy” is not a word.']], 'unhappy.'],
            ['What does the prefix “pre-” mean in “preview”?', 'before', [['again', 'That is “re-”.'], ['not', 'That is “un-” or “in-”.'], ['after', 'That is “post-”.']], 'pre- means before: to see before.'],
        ], '', 'Before b, m, p use im-; before l, il-; before r, ir-.'),
        eng_type([
            ['the noun from “happy”', 'happiness', [], 'happy → happiness (y becomes i before -ness).'], ['the noun from “kind”', 'kindness', [], 'kind + -ness.'],
            ['the adjective from “danger”', 'dangerous', [], 'danger + -ous.'], ['the adjective from “beauty”', 'beautiful', [], 'beauty → beautiful (y becomes i, -ful has one l).'],
            ['the noun from “educate”', 'education', [], 'educate → education.'], ['the adjective from “comfort”', 'comfortable', [], 'comfort + -able.'],
        ], 'Add a suffix and type {q}.', 'Watch the y → i change.', 'procedure', 30),
        eng_spot([
            [['She was', 'very', 'carefull', 'with the eggs.'], 2, 'careful', 'The suffix -ful has one l.'],
            [['His answer', 'was', 'unpossible', 'to believe.'], 2, 'impossible', 'Before p, the prefix is im-.'],
            [['The', 'happyness of', 'the children', 'filled the room.'], 1, 'happiness of', 'y becomes i before -ness.'],
        ], 'Check the prefix and the spelling where the suffix joins.'),
    ],
    'EN-020' => [
        eng_choose([
            ['She is ___ honest girl.', 'an', [['a', 'The h in “honest” is silent: it begins with a vowel SOUND.'], ['the', '“The” points to one already known; this introduces her.'], ['(no article)', 'A singular countable noun needs an article here.']], '“An” before a vowel sound: an honest girl.'],
            ['He wants to be ___ university lecturer.', 'a', [['an', '“University” begins with a “yoo” sound, a consonant sound.'], ['the', 'Not a particular one already known.'], ['(no article)', 'A singular countable noun needs an article.']], '“A” before a consonant sound: a university.'],
            ['___ sun rises in the east.', 'The', [['A', 'There is only one sun: “the”.'], ['An', 'There is only one sun.'], ['(no article)', 'The sun needs “the”.']], 'Things that are unique take “the”.'],
            ['I bought ___ egg and ___ orange.', 'an … an', [['a … a', 'Both begin with a vowel sound.'], ['an … a', '“Orange” begins with a vowel sound.'], ['a … an', '“Egg” begins with a vowel sound.']], 'An before a vowel sound.'],
            ['He waited for ___ hour.', 'an', [['a', 'The h in “hour” is silent.'], ['the', 'Not a particular hour.'], ['(no article)', 'A singular noun needs an article.']], 'Silent h: an hour.'],
        ], 'Choose the article: {q}', 'It is the first SOUND, not the first letter.'),
        eng_type([
            ['___ umbrella', 'an', [], 'Vowel sound: an.'], ['___ European country', 'a', [], '“European” starts with a “yoo” sound: a.'], ['___ MP', 'an', [], '“MP” is said “em-pee”: a vowel sound, so an.'],
            ['___ one-way street', 'a', [], '“One” starts with a “w” sound: a.'], ['___ apple', 'an', [], 'Vowel sound: an.'], ['___ horse', 'a', [], 'The h is spoken: a horse.'],
        ], 'Type “a” or “an”: {q}', 'Say it aloud: vowel sound → an.', 'procedure', 20),
        eng_spot([
            [['She', 'is', 'a', 'honourable woman.'], 2, 'an', 'The h in “honourable” is silent: an.'],
            [['My father', 'bought', 'an', 'uniform for me.'], 2, 'a', '“Uniform” starts with a “yoo” sound: a.'],
            [['We', 'visited', 'a', 'Atlantic Ocean beach.'], 2, 'an', '“Atlantic” starts with a vowel sound.'],
        ], 'Check the first sound of the next word.'),
    ],

    /* ═══ Stage 4 — Grammar in Use ═══ */
    'EN-031' => [
        eng_choose([
            ['The farmer planted the seeds.', 'The seeds were planted by the farmer.', [['The seeds planted the farmer.', 'That swaps who did what.'], ['The seeds was planted by the farmer.', '“Seeds” is plural: were.'], ['The seeds are planted by the farmer.', 'The original is past: were planted.']], 'Passive: object becomes subject + be (in the same tense) + past participle + by …'],
            ['Chika wrote the letter.', 'The letter was written by Chika.', [['The letter wrote by Chika.', 'The passive needs “was” + past participle.'], ['The letter is written by Chika.', 'The original is past.'], ['The letter was wrote by Chika.', 'The past participle is “written”.']], 'wrote → was written.'],
            ['The police have arrested the thief.', 'The thief has been arrested by the police.', [['The thief was arrested by the police.', 'The tense changed: the original is present perfect.'], ['The thief have been arrested by the police.', '“Thief” is singular: has.'], ['The thief has arrested the police.', 'That swaps who did what.']], 'have arrested → has been arrested.'],
            ['They will announce the results tomorrow.', 'The results will be announced tomorrow.', [['The results will announce tomorrow.', 'The passive needs “be” + past participle.'], ['The results are announced tomorrow.', 'The original is future.'], ['The results will been announced tomorrow.', 'After “will”, use “be”.']], 'will announce → will be announced (“by them” can be dropped).'],
        ], 'Choose the passive form of: “{q}”', 'Same tense; “be” + past participle; the doer after “by”.'),
        eng_choose([
            ['The window was broken by the boys.', 'passive', [['active', 'The subject (the window) did not do the breaking.'], ['neither', 'It has a subject receiving the action and “was” + participle.'], ['both', 'A clause is one or the other.']], 'The subject receives the action: passive.'],
            ['The boys broke the window.', 'active', [['passive', 'The subject (the boys) did the action.'], ['neither', 'It has a doer as subject.'], ['both', 'A clause is one or the other.']], 'The subject does the action: active.'],
            ['English is spoken in many countries.', 'passive', [['active', 'English does not speak; it is spoken.'], ['neither', 'It is a full passive clause.'], ['both', 'A clause is one or the other.']], 'is spoken = passive.'],
            ['Our team won the cup.', 'active', [['passive', 'The team did the winning.'], ['neither', 'It is a full active clause.'], ['both', 'A clause is one or the other.']], 'The subject did it: active.'],
        ], 'Is this sentence active or passive? “{q}”', 'Did the subject DO the action, or RECEIVE it?'),
        eng_type([
            ['The cat chased the rat. → The rat ___ by the cat.', 'was chased', [], 'Past: was + chased.'],
            ['Ade cleans the room. → The room ___ by Ade.', 'is cleaned', [], 'Present: is + cleaned.'],
            ['They are building a bridge. → A bridge ___ by them.', 'is being built', [], 'Present continuous: is being + built.'],
            ['Someone has stolen my pen. → My pen ___.', 'has been stolen', [], 'Present perfect: has been + stolen.'],
            ['The teacher will mark the scripts. → The scripts ___ by the teacher.', 'will be marked', [], 'Future: will be + marked.'],
        ], 'Complete the passive: {q}', 'Keep the tense of the original.', 'procedure', 40),
    ],
    'EN-032' => [
        eng_choose([
            ['He said, “I am tired.”', 'He said that he was tired.', [['He said that I am tired.', 'The pronoun and tense must change.'], ['He said that he is tired.', 'After “said”, am moves back to was.'], ['He said that he were tired.', '“He” takes “was”.']], 'Reported speech: pronoun changes (I → he) and tense moves back (am → was).'],
            ['She said, “I will come tomorrow.”', 'She said that she would come the next day.', [['She said that she will come tomorrow.', 'will → would, tomorrow → the next day.'], ['She said that I would come the next day.', '“I” becomes “she”.'], ['She said that she would come tomorrow.', '“Tomorrow” changes to “the next day”.']], 'will → would; tomorrow → the next day.'],
            ['They said, “We have finished.”', 'They said that they had finished.', [['They said that we had finished.', '“We” becomes “they”.'], ['They said that they have finished.', 'have → had.'], ['They said that they finished.', 'The perfect is kept: had finished.']], 'have finished → had finished.'],
            ['Musa asked, “Where do you live?”', 'Musa asked where I lived.', [['Musa asked where do I live.', 'A reported question takes statement order, no “do”.'], ['Musa asked where did I live?', 'No “did”, and no question mark.'], ['Musa asked where I live.', 'The tense moves back: lived.']], 'Reported question: statement word order, tense back, no question mark.'],
            ['The teacher said, “Close your books.”', 'The teacher told us to close our books.', [['The teacher said close your books.', 'A command is reported with “told … to”.'], ['The teacher told us that close our books.', 'A command takes “to” + verb.'], ['The teacher told us to closed our books.', 'After “to”, use the base form.']], 'A command: told + person + to + verb.'],
        ], 'Choose the reported form of: {q}', 'Change the pronouns, move the tense back, change here/now words.', 'procedure', 45),
        eng_type([
            ['am', 'was', [], 'am → was.'], ['is', 'was', [], 'is → was.'], ['are', 'were', [], 'are → were.'], ['will', 'would', [], 'will → would.'],
            ['can', 'could', [], 'can → could.'], ['have', 'had', [], 'have → had.'], ['today', 'that day', [], 'today → that day.'], ['here', 'there', [], 'here → there.'],
            ['now', 'then', [], 'now → then.'], ['yesterday', 'the day before', ['the previous day'], 'yesterday → the day before.'],
        ], 'In reported speech after “said”, what does “{q}” usually become?', 'Things move one step back in time and away from the speaker.', 'concept', 25),
        eng_spot([
            [['She', 'asked me where', 'was I going', 'that evening.'], 2, 'I was going', 'A reported question uses statement order: subject before verb.'],
            [['He', 'told that', 'he would', 'be late.'], 1, 'said that', '“Told” needs a person after it: told me that… Otherwise use “said”.'],
            [['The man', 'said', 'that he will', 'call back.'], 2, 'that he would', 'After “said”, will → would.'],
        ], 'Reported questions are not questions; “tell” needs a person.'),
    ],
    'EN-033' => [
        eng_choose([
            ['If it rains, we ___ indoors.', 'will stay', [['would stay', '“If + present” (real possibility) takes “will”.'], ['stayed', 'The result is in the future.'], ['would have stayed', 'That is for the unreal past.']], 'First conditional: If + present, will + verb.'],
            ['If I ___ rich, I would build a school.', 'were', [['am', 'An unreal present takes the past: were.'], ['will be', '“Will” never follows “if” here.'], ['had been', 'That is for the past.']], 'Second conditional (imagined now): If + past (were), would + verb.'],
            ['If she had studied, she ___ passed.', 'would have', [['would', 'The unreal past needs “would have”.'], ['will have', '“Will” is for real future.'], ['had', '“Had passed” is not the result form.']], 'Third conditional: If + had + participle, would have + participle.'],
            ['If you heat ice, it ___.', 'melts', [['will melted', 'After “will”, the base form.'], ['would melt', 'A fact that is always true takes the present.'], ['melted', 'A general truth takes the present.']], 'Zero conditional (always true): If + present, present.'],
            ['Unless you hurry, you ___ the bus.', 'will miss', [['would miss', '“Unless” + present is a real possibility.'], ['missed', 'The result is in the future.'], ['will missed', 'After “will”, the base form.']], 'Unless = if not; first conditional.'],
        ], 'Choose the right form: {q}', 'Real future, imagined now, or imagined past?'),
        eng_type([
            ['If I (be) you, I would apologise.', 'were', [], 'Imagined present: If I were you.'],
            ['If we leave now, we (catch) the train.', 'will catch', [], 'First conditional: will + verb.'],
            ['If he had asked, I (help) him.', 'would have helped', [], 'Third conditional: would have + participle.'],
            ['If you mix red and white, you (get) pink.', 'get', [], 'Zero conditional: present.'],
            ['If they (win) the lottery, they would travel.', 'won', [], 'Second conditional: If + past.'],
        ], 'Type the verb in the right form: {q}', 'Match the pattern of the conditional.', 'procedure', 35),
        eng_spot([
            [['If I', 'will see', 'him,', 'I will tell him.'], 1, 'see', '“Will” does not follow “if” in the if-clause: If I see him…'],
            [['If she', 'would have', 'known, she would', 'have come.'], 1, 'had', 'The if-clause of the third conditional takes “had” + participle.'],
            [['If I', 'was', 'the president,', 'I would build more schools.'], 1, 'were', 'In an imagined condition, standard English uses “were” for all persons.'],
        ], 'The if-clause never takes “will” or “would”.'),
    ],
    'EN-034' => [
        eng_choose([
            ['The meeting was called off because of the rain.', 'cancelled', [['started', 'Not the meaning of “call off”.'], ['announced', '“Call off” is not to announce.'], ['moved indoors', 'It did not happen at all.']], 'Call off = cancel.'],
            ['Please look after my bag while I am away.', 'take care of', [['look for', 'That means search.'], ['run after', '“After” here is not chasing: look after means care for.'], ['bring back', 'That means return.']], 'Look after = take care of.'],
            ['She takes after her mother.', 'resembles', [['follows behind', 'Not the meaning here.'], ['looks after', 'That means cares for.'], ['dislikes', 'Not the meaning.']], 'Take after = resemble (an older relative).'],
            ['We ran out of fuel near Ore.', 'used all of', [['ran away from', 'Not the meaning.'], ['bought more', 'The opposite.'], ['spilled', 'Not the meaning.']], 'Run out of = have none left.'],
            ['He gave up smoking last year.', 'stopped', [['started', 'The opposite.'], ['shared', 'Not the meaning.'], ['hid', 'Not the meaning.']], 'Give up = stop doing.'],
            ['I came across an old photograph.', 'found by chance', [['walked across', 'Not the meaning here: nobody walked on the photograph.'], ['tore', 'Not the meaning.'], ['searched for', 'Coming across is not searching; it happens by chance.']], 'Come across = find by chance.'],
        ], 'What does the phrasal verb mean? “{q}”', 'Read the whole sentence; the particle changes the verb’s meaning.'),
        eng_type([
            ['Please ___ the form before you leave. (complete it)', 'fill in', ['fill out'], 'Fill in (or fill out) a form.'],
            ['Can you ___ the music? It is too loud. (reduce it)', 'turn down', [], 'Turn down = reduce volume.'],
            ['They ___ the old building to make a road. (destroyed it)', 'pulled down', ['knocked down', 'tore down'], 'Pull down = demolish.'],
            ['I will ___ the word in the dictionary. (search for it)', 'look up', [], 'Look up a word.'],
            ['The plane will ___ at nine. (leave the ground)', 'take off', [], 'Take off = leave the ground.'],
        ], 'Type the phrasal verb: {q}', 'Verb + a small word like up, down, off, in, out.', 'procedure', 30),
        eng_spot([
            [['We', 'must', 'cope up with', 'the new rules.'], 2, 'cope with', 'The verb is “cope with”; there is no “up”.'],
            [['She', 'voiced out', 'her concerns', 'at the meeting.'], 1, 'voiced', '“Voice” means to express; “out” is not needed.'],
            [['Please', 'off', 'the light', 'when you leave.'], 1, 'switch off', '“Off” is not a verb: switch off (or turn off) the light.'],
        ], 'Some local phrasal verbs are not standard English.'),
    ],
    'EN-035' => [
        eng_choose([
            ['It is raining cats and dogs.', 'raining very heavily', [['animals are falling', 'An idiom is not literal.'], ['raining lightly', 'It means the opposite.'], ['pets are getting wet', 'Not literal.']], 'Raining cats and dogs = raining heavily.'],
            ['The exam was a piece of cake.', 'very easy', [['very hard', 'The opposite.'], ['about food', 'Not literal.'], ['very long', 'Not the meaning.']], 'A piece of cake = very easy.'],
            ['He let the cat out of the bag.', 'told a secret', [['freed an animal', 'Not literal.'], ['made a mistake', 'Close, but the meaning is revealing a secret.'], ['ran away', 'Not the meaning.']], 'Let the cat out of the bag = reveal a secret.'],
            ['She burnt the midnight oil before the exam.', 'studied late into the night', [['caused a fire at night', 'Not literal: nothing was set alight.'], ['used up the lamp’s oil', 'Not literal: no oil was burnt.'], ['went to bed early', 'The opposite.']], 'Burn the midnight oil = work late at night.'],
            ['Don’t beat about the bush; tell me what happened.', 'avoid the main point', [['hit the plants', 'Not literal.'], ['walk in the forest', 'Not literal.'], ['shout', 'Not the meaning.']], 'Beat about the bush = avoid saying something directly.'],
            ['The news of his promotion was music to his ears.', 'pleasing to hear', [['too loud to bear', 'Not the meaning: music here stands for pleasure.'], ['a song he heard', 'Not literal.'], ['confusing', 'The opposite feeling.']], 'Music to one’s ears = very welcome news.'],
        ], 'What does the idiom mean? “{q}”', 'An idiom’s meaning is not the meaning of its words.'),
        eng_choose([
            ['Which idiom means “to be very nervous”?', 'to have butterflies in one’s stomach', [['to have a frog in one’s throat', 'That means to be hoarse.'], ['to break the ice', 'That means to start a conversation.'], ['to hit the nail on the head', 'That means to be exactly right.']], 'Butterflies in one’s stomach = nervous.'],
            ['Which idiom means “to be very happy”?', 'to be over the moon', [['to be under the weather', 'That means unwell.'], ['to be in hot water', 'That means in trouble.'], ['to be at sea', 'That means confused.']], 'Over the moon = delighted.'],
            ['Which idiom means “to be unwell”?', 'to be under the weather', [['to be on cloud nine', 'That means very happy.'], ['to be in the same boat', 'That means sharing a problem.'], ['to be all ears', 'That means listening eagerly.']], 'Under the weather = slightly ill.'],
            ['Which idiom means “to be in trouble”?', 'to be in hot water', [['to be in the pink', 'That means healthy.'], ['to be on cloud nine', 'That means very happy.'], ['to be all ears', 'That means listening eagerly.']], 'In hot water = in trouble.'],
        ], '', 'Picture the idiom, then think what it describes.'),
        eng_type([
            ['Starting the party with a game helped to ___ the ice. (start the conversation)', 'break', [], 'Break the ice.'],
            ['You have hit the ___ on the head: that is exactly the problem.', 'nail', [], 'Hit the nail on the head = exactly right.'],
            ['We are all in the same ___ : nobody has been paid. (sharing the problem)', 'boat', [], 'In the same boat.'],
            ['Tell me everything; I am all ___. (listening eagerly)', 'ears', [], 'All ears.'],
            ['Once in a blue ___, we eat out. (very rarely)', 'moon', [], 'Once in a blue moon = very rarely.'],
        ], 'Complete the idiom: {q}', 'The idiom has a fixed word.', 'procedure', 25),
    ],
    'EN-036' => [
        eng_choose([
            ['When the bell rang, the pupils went home.', 'the pupils went home', [['When the bell rang', 'That is subordinate: it cannot stand alone.'], ['the bell rang', 'Part of the subordinate clause, beginning with “when”.'], ['When', 'That is the joining word.']], 'The main clause makes sense on its own.'],
            ['I will call you after I finish my work.', 'I will call you', [['after I finish my work', 'That is subordinate.'], ['I finish my work', 'Part of the subordinate clause.'], ['after', 'That is the joining word.']], 'The main clause stands alone.'],
            ['Because she was ill, Funke stayed at home.', 'Funke stayed at home', [['Because she was ill', 'That is subordinate.'], ['she was ill', 'Part of the subordinate clause.'], ['Because', 'That is the joining word.']], 'The main clause stands alone.'],
            ['The boy who won the prize is my cousin.', 'The boy is my cousin', [['who won the prize', 'That is a relative (subordinate) clause.'], ['won the prize', 'Part of the subordinate clause.'], ['is my cousin', 'Not complete without its subject.']], 'Remove the relative clause: the main clause remains.'],
        ], 'Which is the MAIN clause? “{q}”', 'The main clause would make sense as a sentence on its own.', 'concept', 40),
        eng_choose([
            ['although it was late', 'subordinate', [['main', '“Although” makes it depend on another clause.'], ['a phrase', 'It has a subject and verb (it was), so it is a clause.'], ['a sentence', 'It cannot stand alone.']], 'A clause starting with although, because, when, if… is subordinate.'],
            ['the market was crowded', 'main', [['subordinate', 'It needs nothing else to make sense.'], ['a phrase', 'It has a subject and a verb.'], ['incomplete', 'It is complete.']], 'It stands alone: a main clause.'],
            ['in the morning', 'a phrase', [['main', 'There is no verb.'], ['subordinate', 'There is no verb, so it is not a clause.'], ['a sentence', 'There is no verb.']], 'No subject and verb: a phrase.'],
            ['if you need help', 'subordinate', [['main', '“If” makes it depend on another clause.'], ['a phrase', 'It has a subject and verb.'], ['a sentence', 'It cannot stand alone.']], '“If” starts a subordinate clause.'],
        ], 'What is “{q}”?', 'Clause = subject + verb; it is subordinate if it cannot stand alone.', 'concept', 30),
        eng_order([
            [['Because', 'the', 'road', 'was', 'flooded,', 'we', 'went', 'home.'], 'Subordinate clause, comma, main clause.'],
            [['The', 'book', 'that', 'I', 'borrowed', 'is', 'missing.'], 'The relative clause sits right after the noun it describes.'],
            [['We', 'will', 'wait', 'until', 'the', 'rain', 'stops.'], 'Main clause, then the subordinate clause.'],
        ], 'Put the words in order to make one sentence.', 'Find the joining word, then the main clause.'),
    ],
    'EN-037' => [
        eng_choose([
            ['The man ___ car was stolen reported to the police.', 'whose', [['who', 'You need possession: the man’s car.'], ['whom', 'Not possession.'], ['which', '“Which” is for things, and this shows ownership.']], 'whose = of whom (possession).'],
            ['The girl ___ won the prize is my sister.', 'who', [['whom', 'She is the subject (she won): who.'], ['which', '“Which” is for things.'], ['whose', 'No possession here.']], 'who = subject (a person).'],
            ['The man ___ we met yesterday is a doctor.', 'whom', [['who', 'He is the object of “met” (we met him): whom.'], ['whose', 'No possession.'], ['which', '“Which” is for things.']], 'whom = object (him/her/them).'],
            ['The book ___ I lent you is mine.', 'which', [['who', '“Who” is for people.'], ['whom', '“Whom” is for people.'], ['whose', 'No possession here.']], 'which = things (that also works).'],
            ['To ___ should I address the letter?', 'whom', [['who', 'After a preposition (to), use whom.'], ['whose', 'Not possession.'], ['which', 'For a person, not which.']], 'After a preposition: whom.'],
        ], 'Choose the relative pronoun: {q}', 'he → who, him → whom, his → whose, a thing → which.'),
        eng_type([
            ['This is the teacher ___ helped me.', 'who', ['that'], 'Subject, a person: who (or that).'],
            ['That is the boy ___ bag was lost.', 'whose', [], 'Possession: whose.'],
            ['The pen ___ you gave me writes well.', 'which', ['that'], 'A thing: which (or that).'],
            ['She is the friend with ___ I travelled.', 'whom', [], 'After a preposition: whom.'],
        ], 'Type the relative pronoun: {q}', 'Person or thing? Subject, object or owner?', 'procedure', 25),
        eng_spot([
            [['The lady', 'who’s car', 'was towed', 'is angry.'], 1, 'whose car', '“Who’s” means “who is”; possession is “whose”.'],
            [['The students', 'which', 'passed', 'were praised.'], 1, 'who', '“Which” is for things; students are people.'],
            [['The man', 'to who', 'I spoke', 'was helpful.'], 1, 'to whom', 'After a preposition: whom.'],
        ], 'Check: person or thing, and after a preposition.'),
    ],
    'EN-038' => [
        eng_choose([
            ['Either the captain or the players ___ to blame.', 'are', [['is', 'Agree with the nearer subject: players.'], ['was', 'The nearer subject is plural.'], ['has been', 'The nearer subject is plural.']], 'Either/or, neither/nor: agree with the nearer subject.'],
            ['The committee ___ its decision today.', 'announces', [['announce', 'Acting as one body (its decision): singular.'], ['are announcing', 'Plural; “its” shows it acts as one.'], ['have announced', 'Plural; “its” shows it acts as one.']], 'A collective noun acting as one unit takes a singular verb.'],
            ['Bread and butter ___ my favourite breakfast.', 'is', [['are', 'Two words naming ONE dish take a singular verb.'], ['were', 'Plural.'], ['have been', 'Plural.']], 'One idea (bread and butter as a dish): singular.'],
            ['One of my friends ___ in Jos.', 'lives', [['live', 'The subject is “one”, not “friends”.'], ['are living', 'Plural.'], ['have lived', 'Plural.']], '“One of …” is singular.'],
            ['The number of students ___ increasing.', 'is', [['are', '“The number” is singular.'], ['were', 'Plural.'], ['have been', 'Plural.']], '“The number of” is singular; “a number of” is plural.'],
            ['A number of students ___ absent.', 'were', [['was', '“A number of” means several: plural.'], ['is', 'Singular.'], ['has been', 'Singular.']], '“A number of” is plural.'],
        ], 'Choose the verb: {q}', 'Find the true subject: one, the number, either/or …'),
        eng_spot([
            [['Neither of', 'the boys', 'were', 'present.'], 2, 'was', '“Neither of” is singular: neither was.'],
            [['The teacher,', 'together with her pupils,', 'are', 'going on the trip.'], 2, 'is', 'Phrases like “together with” do not change the subject: the teacher is.'],
            [['Ten kilometres', 'are', 'a long way', 'to walk.'], 1, 'is', 'An amount treated as one quantity is singular.'],
        ], 'Phrases between subject and verb do not change the subject.'),
        eng_type([
            ['Physics (be) a difficult subject for some.', 'is', [], 'Subjects ending in -ics are singular.'],
            ['Everyone (want) to win.', 'wants', [], '“Everyone” is singular.'],
            ['Neither Ada nor her sisters (know) the answer.', 'know', [], 'Agree with the nearer subject: sisters.'],
            ['The jury (has / have) reached its verdict.', 'has', [], 'Acting as one (its verdict): has.'],
        ], 'Type the verb that agrees: {q}', 'Ask what the subject really is.', 'procedure', 30),
    ],
    'EN-039' => [
        eng_choose([
            ['You ___ wear a seat belt; it is the law.', 'must', [['may', '“May” gives permission, not obligation.'], ['might', '“Might” shows a small possibility.'], ['could', '“Could” is ability or possibility.']], 'Must = it is necessary.'],
            ['___ I borrow your pen, please?', 'May', [['Must', '“Must” is obligation.'], ['Should', '“Should” asks for advice.'], ['Would', 'Possible, but “may” is the polite request for permission.']], 'May = asking permission.'],
            ['You look tired. You ___ rest.', 'should', [['must not', 'That forbids resting.'], ['can’t', 'That says you are unable to.'], ['might', 'Weak; advice takes “should”.']], 'Should = advice.'],
            ['When I was five, I ___ swim.', 'could', [['can', 'Past ability: could.'], ['must', 'Obligation, not ability.'], ['should', 'Advice, not ability.']], 'Could = past ability.'],
            ['You ___ smoke in the hospital.', 'must not', [['need not', '“Need not” means it is not necessary.'], ['might not', 'That is possibility.'], ['would not', 'That is a refusal or condition.']], 'Must not = it is forbidden.'],
            ['You ___ bring food; lunch is provided.', 'need not', [['must not', 'That forbids it.'], ['must', 'The opposite.'], ['should', 'That advises it.']], 'Need not = it is not necessary.'],
        ], 'Choose the modal: {q}', 'Obligation, permission, advice, ability or possibility?'),
        eng_spot([
            [['You', 'should to', 'see', 'a doctor.'], 1, 'should', 'A modal is followed by the base verb without “to”.'],
            [['She', 'can', 'speaks', 'three languages.'], 2, 'speak', 'After a modal, use the base form.'],
            [['They', 'must', 'to finish', 'the work today.'], 2, 'finish', 'No “to” after “must”.'],
        ], 'Modals take the base verb, with no “to”.'),
        eng_type([
            ['It is possible that it will rain. → It ___ rain.', 'may', ['might', 'could'], 'Possibility: may/might/could.'],
            ['It is necessary to sign here. → You ___ sign here.', 'must', ['have to'], 'Necessity: must.'],
            ['I advise you to apologise. → You ___ apologise.', 'should', ['ought to'], 'Advice: should.'],
            ['He was able to run fast. → He ___ run fast.', 'could', [], 'Past ability: could.'],
        ], 'Type the modal: {q}', 'Match the meaning to the modal.', 'procedure', 30),
    ],
    'EN-040' => [
        eng_choose([
            ['I enjoy ___ novels.', 'reading', [['to read', '“Enjoy” is followed by -ing.'], ['read', 'A bare verb cannot follow “enjoy”.'], ['to reading', 'Not English.']], 'enjoy + -ing.'],
            ['She decided ___ medicine.', 'to study', [['studying', '“Decide” takes to + verb.'], ['study', 'A bare verb cannot follow “decided”.'], ['to studying', 'Not English.']], 'decide + to + verb.'],
            ['He is good at ___ problems.', 'solving', [['to solve', 'After a preposition (at), use -ing.'], ['solve', 'After a preposition, use -ing.'], ['solved', 'Not after a preposition.']], 'After a preposition: -ing.'],
            ['We hope ___ you soon.', 'to see', [['seeing', '“Hope” takes to + verb.'], ['see', 'Needs “to”.'], ['to seeing', 'Not English.']], 'hope + to + verb.'],
            ['I look forward to ___ from you.', 'hearing', [['hear', 'Here “to” is a preposition: -ing.'], ['heard', 'Not after “to”.'], ['be hearing', 'Not English here.']], 'look forward to + -ing.'],
            ['Stop ___; I am trying to sleep!', 'talking', [['to talk', '“Stop to talk” means stop in order to talk.'], ['talk', 'Needs -ing here.'], ['talked', 'Not after “stop”.']], 'stop + -ing = no longer do it.'],
        ], 'Choose the right form: {q}', 'Some verbs take -ing, some take to + verb; prepositions take -ing.'),
        eng_type([
            ['I can’t afford (buy) a new phone.', 'to buy', [], 'afford + to + verb.'], ['She avoided (answer) the question.', 'answering', [], 'avoid + -ing.'],
            ['They agreed (help) us.', 'to help', [], 'agree + to + verb.'], ['He finished (paint) the wall.', 'painting', [], 'finish + -ing.'],
            ['We are used to (wake) up early.', 'waking', [], 'be used to + -ing.'],
        ], 'Type the right form of the verb in brackets: {q}', 'Learn which verbs take which pattern.', 'procedure', 30),
        eng_spot([
            [['I', 'am looking forward', 'to meet', 'you.'], 2, 'to meeting', '“Look forward to” takes -ing.'],
            [['She', 'suggested', 'to go', 'to the beach.'], 2, 'going', '“Suggest” takes -ing.'],
            [['He', 'wants', 'going', 'home.'], 2, 'to go', '“Want” takes to + verb.'],
        ], 'Check what the verb before it takes.'),
    ],
    ];
}
