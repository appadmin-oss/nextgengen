<?php
declare(strict_types=1);

/**
 * English Lab — teaching before practice (owner, 6 Nov 2026: "I need real effective learning.
 * Grammar … Speaking … Articulation").
 *
 * GRAMMAR — "The rule" (eng_rules), shown in a lesson before practice. Explicit rule teaching is one
 * of the strongest effects in second-language research (explicit beats implicit instruction, with
 * effects around d = 0.8–1.0 across meta-analyses), and works best as CONTRAST: the rule, a right
 * sentence, the slip learners actually make (✗) and why it is wrong, then the rule in use. Practice
 * then gives metalinguistic feedback — every wrong option names its slip — which is the feedback
 * type with the best evidence. Read through the engine's existing lesson step (lab content 'why',
 * mlb_why_of): [the rule in one line, what the examples show, [[example, why], …]].
 *
 * SPEAKING — eng_speak() and eng_articulation(): see englishlab-speech.php.
 */
function eng_rules(): array {
    return [
    'EN-003' => ['Use subject pronouns for the subject of a clause and object pronouns for the object of a verb or preposition.', 'Cover the other person and the right form is obvious.', [
        ['✓ Tunde and I went home.', 'Cover “Tunde and”: “I went home”.'],
        ['✗ Me and Tunde went home.', 'In standard written English, the subject form is I: Tunde and I went home.'],
        ['✓ She gave the book to Ada and me.', 'Cover “Ada and”: “gave the book to me”.'],
        ['✓ The book is hers. (never her’s)', 'Possessive pronouns stand alone and never take an apostrophe.'],
    ]],
    'EN-004' => ['Use the simple present for habits and facts, the simple past for finished past actions, and will + base verb for a prediction or decision about the future.', 'The time words decide the tense.', [
        ['✓ My mother goes to work every day.', 'A habit, and “my mother” is she: goes.'],
        ['✗ My mother go to work every day.', 'In this simple-present statement, the third-person singular form of go is goes.'],
        ['✓ We ate rice yesterday.', '“Yesterday” is finished time: simple past.'],
        ['✓ The school will hold a sports day next week.', '“Next week”: will + base verb (never “will held”).'],
    ]],
    'EN-005' => ['Use a comparative to compare and a superlative to identify the highest degree in a group, without doubling more with -er or most with -est.', 'Short words take -er/-est; long words take more/most.', [
        ['✓ This box is bigger than that one.', 'Two things: comparative, “than”.'],
        ['✗ This box is more bigger than that one.', '“More” and -er together is a double comparative.'],
        ['✓ This is the biggest box of the five.', 'Three or more: superlative.'],
        ['✓ This is the most beautiful dress.', '“Beautiful” is long: most, not -est.'],
    ]],
    'EN-006' => ['An adjective describes a noun or pronoun, while an adverb can modify a verb, adjective or another adverb.', 'Ask what the word is describing.', [
        ['✓ She is a careful driver.', '“Careful” describes the driver (a noun): adjective.'],
        ['✓ She drives carefully.', '“Carefully” describes how she drives (a verb): adverb.'],
        ['✗ She drives careful.', 'A verb needs the adverb.'],
        ['✓ He did well in the test. (never “did good”)', '“Did” is a verb: well.'],
    ]],
    'EN-011' => ['Make a finite verb agree with the number and person of its subject, rather than with a nearby noun in a modifying phrase.', 'Cross out everything between the subject and the verb (“of the mangoes”, “in the two buses”, “together with his students”), then match.', [
        ['✓ The quality of the mangoes is not good.', 'Cross out “of the mangoes”: the quality is.'],
        ['✗ The quality of the mangoes are not good.', 'Matched to the nearest noun, “mangoes” — the commonest concord slip of all.'],
        ['✓ The teacher, together with his students, is going on a trip.', 'The added together-with phrase does not make the singular head teacher plural.'],
        ['✓ My father and my uncle work in Ibadan.', '“And” joins two subjects: plural.'],
        ['✓ The news is shocking. Mathematics is my best subject. Two hours is not enough.', 'News and the subject mathematics are singular; two hours is treated here as a single amount of time.'],
        ['✓ The scissors are on the table.', 'Scissors, trousers and spectacles are always plural (but “a pair of scissors is”).'],
    ]],
    'EN-012' => ['Learn the preposition pattern for the intended meaning of a verb or adjective, including patterns that need no preposition.', 'Interested IN, good AT, different FROM, depend ON.', [
        ['✓ She is good at mathematics.', 'Good at a skill.'],
        ['✓ We discussed the problem.', '“Discuss” takes no preposition.'],
        ['✗ We discussed about the problem.', '“About” is extra: discuss already means “talk about”.'],
        ['✓ I have lived here since 2019 / for five years.', 'Since + a starting point; for + a length of time.'],
    ]],
    'EN-013' => ['A joining word shows HOW two ideas relate: and (adds), but (contrasts), so (result), because (reason), although (unexpected contrast), unless (if not).', 'Choose the word for the relationship, not the first one that comes.', [
        ['✓ It was raining, so we stayed in.', 'Rain caused staying in: result.'],
        ['✓ We stayed in because it was raining.', 'The same relationship from the other side: reason.'],
        ['✓ Although it was raining, we played.', 'Playing in rain is unexpected: although.'],
        ['✗ Although it was raining, but we played.', 'Use one contrast word, not two.'],
    ]],
    'EN-014' => ['In an ordinary opposite-polarity question tag, repeat the auxiliary and subject pronoun while reversing positive and negative.', 'No helper verb in the sentence? Use do, does or did.', [
        ['✓ You are coming, aren’t you?', 'are → aren’t; you → you.'],
        ['✗ You are coming, isn’t it?', '“Isn’t it” does not match “you are”.'],
        ['✓ She didn’t call, did she?', 'Negative statement → positive tag.'],
        ['✓ He plays chess, doesn’t he?', 'No helper: plays → does → doesn’t he?'],
    ]],
    'EN-015' => ['Continuous forms present an activity as in progress, while perfect forms relate a situation to a later reference time.', 'Now? Already? Earlier than another past action?', [
        ['✓ Look! The children are playing.', 'Happening now: present continuous.'],
        ['✓ I have finished my homework.', 'Finished, and it matters now: present perfect.'],
        ['✓ When you called, I was eating.', 'In progress when something else happened: past continuous.'],
        ['✗ I am knowing the answer.', '“Know” is a state, not an action: “I know”.'],
    ]],
    'EN-016' => ['Irregular verbs have their own past and past participle; learn them in threes: go – went – gone. The past participle follows have/has/had.', 'Say the three forms aloud.', [
        ['✓ She went home. / She has gone home.', 'Simple past: went. After has: gone.'],
        ['✗ She has went home.', '“Has” needs the third form: gone.'],
        ['✓ The bell rang. / The bell has rung.', 'ring – rang – rung.'],
        ['✗ He drunk the water yesterday.', 'Simple past is “drank”; “drunk” follows have/had.'],
    ]],
    'EN-017' => ['Use an apostrophe for possession and omitted letters, but not to form an ordinary noun plural.', 'If nothing owns anything and no letter is missing, there is no apostrophe.', [
        ['✓ the girl’s bag / the girls’ bags', 'One owner: ’s. Plural owners ending in s: s’.'],
        ['✓ the children’s toys', 'A plural not ending in s: ’s.'],
        ['✗ fresh tomatoe’s for sale', 'A plain plural: tomatoes.'],
        ['✓ its tail (owner) / it’s raining (it is)', '“Its” owns; “it’s” = it is.'],
    ]],
    'EN-018' => ['Homophones sound alike but differ in meaning and spelling. Choose by MEANING.', 'there (place), their (owner), they’re (they are).', [
        ['✓ They’re putting their bags over there.', 'They are · owner · place — all three in one sentence.'],
        ['✓ You’re welcome.', 'You’re = you are.'],
        ['✗ Your welcome.', '“Your” shows ownership.'],
        ['✓ We walked past the market. / We passed the market.', '“Past” (preposition); “passed” (verb).'],
    ]],
    'EN-019' => ['A prefix attaches before a base and a suffix after it, sometimes changing the meaning, word class or spelling.', 'in- becomes im- before b, m, p; il- before l; ir- before r.', [
        ['✓ impossible, illegal, irregular', 'in- changes to fit the next letter.'],
        ['✗ unpossible', 'The opposite of possible is impossible.'],
        ['✓ happy → happiness', 'Consonant + y: change y to i.'],
        ['✓ careful (one l)', 'The suffix -ful always has one l.'],
    ]],
    'EN-020' => ['Use “an” before a vowel SOUND and “a” before a consonant SOUND — listen, do not look. Use “the” for something already known or unique.', 'It is the first sound that decides.', [
        ['✓ an hour, an honest man', 'Silent h: the first sound is a vowel.'],
        ['✓ a university, a European', '“You-” begins with a consonant sound.'],
        ['✗ an uniform', '“Uniform” begins with a “y” sound: a uniform.'],
        ['✓ The sun rises in the east.', 'Unique things take “the”.'],
    ]],
    'EN-031' => ['Passive = the object becomes the subject + BE (in the same tense) + PAST PARTICIPLE; the doer comes after “by” or is dropped.', 'Use it when the action matters more than the doer.', [
        ['✓ The farmer planted the seeds. → The seeds were planted by the farmer.', 'Past: were + planted.'],
        ['✓ They are building a bridge. → A bridge is being built.', 'Present continuous: is being + built.'],
        ['✗ The letter was wrote by Chika.', 'The passive needs the past participle: written.'],
        ['✓ The thief has been arrested.', 'Present perfect: has been + arrested; the doer is obvious, so it is dropped.'],
    ]],
    'EN-032' => ['When reporting earlier speech, choose pronouns and time words for the reporting situation and use tense backshift where the time relationship calls for it.', 'Common backshifts include am → was and will → would; backshift is not always necessary for something still true.', [
        ['✓ “I am tired,” he said. → He said that he was tired.', 'I → he; am → was.'],
        ['✓ “Where do you live?” she asked. → She asked where I lived.', 'A reported question takes statement order and no question mark.'],
        ['✗ She asked where did I live.', 'No “did”, no question order.'],
        ['✓ “Close your books.” → The teacher told us to close our books.', 'A command: told + person + to + verb.'],
    ]],
    'EN-033' => ['Match the conditional to the meaning: real future (If + present, will), imagined now (If + past, would), imagined past (If + had + participle, would have).', 'In the standard conditional patterns practised here, put will or would in the result clause.', [
        ['✓ If it rains, we will stay in.', 'A real possibility.'],
        ['✓ If I were rich, I would build a school.', 'Imagined now: past form (were) + would.'],
        ['✓ If she had studied, she would have passed.', 'Imagined past: had + participle, would have + participle.'],
        ['✗ If I will see him, I will tell him.', 'For this ordinary future condition, use the present in the if-clause: If I see him…'],
    ]],
    'EN-034' => ['A phrasal verb is verb + particle with its OWN meaning (call off = cancel). Use the standard ones; some local forms are not standard English.', 'Learn the meaning as a whole, not word by word.', [
        ['✓ The match was called off.', 'call off = cancel.'],
        ['✗ We must cope up with the rules.', 'The verb is “cope with”.'],
        ['✗ Please off the light.', '“Off” is not a verb: switch off / turn off.'],
        ['✓ Look up the word in a dictionary.', 'look up = search for information.'],
    ]],
    'EN-035' => ['An idiom has a conventional meaning that cannot reliably be worked out word by word, so learn its usual wording in context.', 'Learn the idiom with its meaning and a sentence.', [
        ['✓ It is raining cats and dogs.', '= raining heavily.'],
        ['✓ The test was a piece of cake.', '= very easy.'],
        ['✗ The idiom “a piece of cake” means “a difficult task”.', 'In this idiom, a piece of cake means something very easy, not difficult.'],
        ['✓ She let the cat out of the bag.', '= told a secret.'],
    ]],
    'EN-036' => ['A main clause can form a complete sentence, while a subordinate clause depends on a larger construction.', 'Cover the subordinate clause: the main clause still stands.', [
        ['✓ When the bell rang, the pupils went home.', 'Main clause: “the pupils went home”.'],
        ['✗ “When the bell rang” is a complete standalone statement in formal prose.', 'When makes this clause subordinate; it needs a main clause.'],
        ['✓ The boy who won the prize is my cousin.', 'The relative clause sits inside the main clause.'],
        ['✓ “In the morning” is a prepositional phrase.', 'It begins with the preposition in and does not contain a clause.'],
    ]],
    'EN-037' => ['Use who for a human subject, whom for a human object in formal usage, whose for possession, and which for things.', 'Who is also common as an object; formal writing uses whom directly after a preposition.', [
        ['✓ The girl who won is my sister.', 'She won: who.'],
        ['✓ The man whom we met is a doctor.', 'We met him: whom.'],
        ['✓ The man whose car was stolen called the police.', 'His car: whose.'],
        ['✗ The students which passed were praised.', 'People: who, not which.'],
    ]],
    'EN-038' => ['For complex agreement, identify the subject’s head, the intended reference of relative pronouns and whether a group is acting as one unit or as individuals.', 'Ask what “who” stands for, and look for “its” or “their”.', [
        ['✓ Neither the boys nor the teacher is here. / Neither the teacher nor the boys are here.', 'Pattern 1: the verb looks only at the nearer subject.'],
        ['✓ Neither she nor I am responsible.', 'Pattern 1 again: the nearer subject is “I”, so “am”.'],
        ['✓ She is one of those girls who are always late.', 'Pattern 2: “who” stands for “those girls” — several girls are late, and she is one of them.'],
        ['✗ She is one of those girls who is always late.', 'The favourite trap: “who” was matched to “she”. (But “the only one of the girls who IS on time” — the only one is one.)'],
        ['✓ The committee has submitted its report. / The jury are divided in their opinion.', 'Pattern 3: “its” = one body, singular; “their” and “divided” = members acting separately, plural.'],
        ['✓ Everyone in the two buses was injured. Each boy and each girl was given a prize.', 'Pattern 4: everyone and each are singular, whatever follows.'],
    ]],
    'EN-039' => ['Modals (can, could, may, might, must, should, will, would) take the BASE verb with no “to” and no -s.', 'must = necessary, should = advice, may = permission/possibility, can = ability.', [
        ['✓ You should see a doctor.', 'Advice + base verb.'],
        ['✗ You should to see a doctor.', 'No “to” after a modal.'],
        ['✗ She can speaks three languages.', 'Base verb after a modal: speak.'],
        ['✓ You must not smoke here. / You need not come.', 'Must not = forbidden; need not = not necessary.'],
    ]],
    'EN-040' => ['Choose the verb pattern required by the preceding word: enjoy takes -ing, decide takes to + verb, and a verb used after a preposition normally takes -ing.', 'Learn each verb with its pattern.', [
        ['✓ I enjoy reading.', 'enjoy + -ing.'],
        ['✓ She decided to study medicine.', 'decide + to.'],
        ['✗ I look forward to meet you.', 'Here “to” is a preposition: look forward to meeting.'],
        ['✓ Stop talking. (stop doing it)', 'stop + -ing means no longer do it.'],
    ]],
    'EN-021' => ['A spelling can represent different vowel sounds, so check the pronunciation of the whole word instead of assuming that identical letters mean identical sounds.', 'Say the word; never read the letters.', [
        ['✓ blood, flood, come, love, money → /ʌ/, as in cup', 'The letters o and oo hide /ʌ/ — the vowel the exam traps most.'],
        ['✓ bird, heard, word, turn, journey → /ɜː/', 'Five spellings, one sound.'],
        ['✓ women /ˈwɪmɪn/, busy /ˈbɪzi/, build /bɪld/', 'Short /ɪ/ hides behind o, u and ui.'],
        ['✗ “blood” rhymes with “food”', 'It rhymes with “mud”: /blʌd/.'],
        ['✓ The schwa /ə/: about, taken, pencil, second, support', 'Any vowel in an unstressed syllable can shrink to /ə/, the commonest sound in English.'],
    ]],
    'EN-022' => ['A diphthong glides from one vowel to another inside one syllable. The traps are spellings shared by two glides: “ow” is /əʊ/ (know, show) or /aʊ/ (now, cow); “ear” is /ɪə/ (near) or /eə/ (bear); “eigh” is /eɪ/ in eight but /aɪ/ in height.', 'No rule decides “ow”: learn each word with its sound.', [
        ['✓ know /nəʊ/ — now /naʊ/', 'Same letters, different glides.'],
        ['✓ near /nɪə/ — bear /beə/ — there /ðeə/', '“Bear” rhymes with “there”, not with “near”.'],
        ['✓ out /aʊ/, could /ʊ/, enough /ʌ/, through /uː/, though /əʊ/, bought /ɔː/', '“ou” has six sounds: say the whole word before you decide.'],
        ['✗ “bear” and “beer” have the same vowel', '/beə/ starts on /e/; /bɪə/ starts on /ɪ/.'],
    ]],
    'EN-024' => ['“ch” has three sounds: /tʃ/ in everyday English words (church, teach), /k/ in words from Greek (chemistry, character, chorus, stomach, school), and /ʃ/ in words from French (chef, machine, brochure).', 'Science and music words with ch are usually /k/.', [
        ['✓ chemistry /ˈkemɪstri/, character /ˈkærəktə/, chorus /ˈkɔːrəs/', 'Greek origin: ch = /k/ — the one examined most.'],
        ['✓ chef /ʃef/, machine /məˈʃiːn/, parachute /ˈpærəʃuːt/', 'French origin: ch = /ʃ/.'],
        ['✗ “chemist” said with the ch of “church”', 'It is /ˈkemɪst/: Greek ch.'],
        ['✓ sugar, sure, pension, mansion → /ʃ/ with no ch at all', 'The /ʃ/ sound also hides behind s and si.'],
    ]],
    'EN-025' => ['Some letters are silent in particular words, but related words can pronounce a letter that was silent in the base word.', 'Use spelling patterns as clues, then check the individual pronunciation.', [
        ['✓ knife, write, lamb, sign, psychology, autumn, castle, scissors', 'One silent letter in each, by its pattern.'],
        ['✓ autumn → autumnal; sign → signature; solemn → solemnity', 'Add a suffix that begins with a vowel and the silent letter comes back.'],
        ['✗ A silent h in “herb”', 'British English says the h: /hɜːb/. Dropping it is American.'],
        ['✗ A silent l in “salt” or “wolf”', 'Both are spoken. The l is silent in walk, talk, half, calm, palm, could and salmon.'],
        ['✓ who, whose, whole: silent w — but “one” is /wʌn/', 'A w sound with no w, beside a w with no sound.'],
    ]],
    'EN-026' => ['Word stress gives one syllable greater prominence, and spelling or suffix patterns are clues rather than exception-free rules.', 'Find the ending first; it often decides.', [
        ['✓ NA-tion, in-for-MA-tion, de-CI-sion, mu-SI-cian', 'Just before -tion, -sion and -cian.'],
        ['✓ e-co-NO-mic, ge-o-GRA-phic, u-ni-VER-si-ty, e-lec-TRI-ci-ty', 'Just before -ic and -ity.'],
        ['✗ na-TION, u-NI-ver-si-ty', 'The ending is never stressed, and -ity pulls the stress to the syllable right before it: VER.'],
        ['✓ PO-li-tics, A-ra-bic, LU-na-tic — but po-LI-ti-cal', 'The -ic exceptions to learn; add -al and the rule returns.'],
        ['✓ HAP-py → HAP-pi-ness; em-PLOY → em-PLOY-ment', '-ness and -ment leave the stress where it was.'],
    ]],
    'EN-027' => ['Many two-syllable words are a NOUN stressed on the first syllable and a VERB stressed on the second: a RE-cord / to re-CORD, a PRO-test / to pro-TEST, an IN-crease / to in-CREASE.', 'Some noun–verb pairs shift stress; check the individual word rather than applying this to every pair.', [
        ['✓ The PRE-sent was lovely. — They will pre-SENT the prize.', 'Noun, then verb.'],
        ['✓ a DE-sert (dry land) — to de-SERT (abandon)', 'The stress changes the meaning.'],
        ['✓ I am con-TENT (satisfied). — the CON-tents of the box', 'The adjective is stressed at the end; the noun at the start.'],
        ['✗ The students will PRO-test.', 'A verb: pro-TEST.'],
    ]],
    'EN-028' => ['Two words rhyme when their stressed vowel and everything after it SOUND the same. Matching spelling alone does not establish a rhyme.', 'Say both words; compare the vowel and the ending.', [
        ['✓ blood / mud, said / bed, word / bird, bear / there, through / flew', 'Different spellings, the same sound.'],
        ['✗ love / move, come / home, pint / mint, cough / though', 'The same spelling, different sounds: /ʌ/–/uː/, /ʌ/–/əʊ/, /aɪ/–/ɪ/, /ɒ/–/əʊ/.'],
        ['✓ hour / power, buy / high, key / free', 'Rhyme survives silent letters and odd spellings.'],
        ['✗ wind (moving air) / mind', 'The noun is /wɪnd/; only the verb “to wind” rhymes with mind.'],
    ]],
    'EN-050' => ['Nearest in meaning: find the meaning, then the option that could REPLACE the word without changing the sentence. Opposite: find the meaning, then its reverse. The trap is the other list — an opposite question offers synonyms, and a synonym question offers the opposite.', 'Cover the options, say your own meaning, then look.', [
        ['✓ garrulous → talkative', 'Meaning first: someone who talks too much.'],
        ['✗ frugal — opposite: economical', 'Economical is a synonym of frugal; the opposite is wasteful.'],
        ['✓ benevolent ↔ malevolent', 'Roots help: bene- is good, male- is bad.'],
        ['✓ transparent ↔ opaque; verbose ↔ concise; diligent ↔ lazy', 'Opposites are worth learning in pairs.'],
    ]],
    'EN-051' => ['Combine short sentences by showing how the ideas connect — a joining word, a relative clause, or an opening phrase — and never join two sentences with only a comma.', 'Remove the repetition, keep the link.', [
        ['✓ The boy is my cousin. The boy won. → The boy who won is my cousin.', 'A relative clause removes the repeated noun.'],
        ['✗ I was late, the bus broke down.', 'Two sentences joined only by a comma (a comma splice).'],
        ['✓ I was late because the bus broke down.', 'A joining word shows the reason.'],
        ['✓ She likes singing, dancing and reading.', 'Items in a list match in form.'],
    ]],
    'EN-057' => ['Some expressions common in speech are not standard written English. Use the standard form in exams and formal writing.', 'Borrow FROM, lend TO; switch off, not “off”.', [
        ['✗ He borrowed me his bicycle.', 'You borrow from someone; he lent you his bicycle.'],
        ['✓ He lent me his bicycle.', 'lend = give for a while.'],
        ['✗ I am having three brothers.', '“Have” for possession is not continuous: I have three brothers.'],
        ['✓ He is my elder brother.', 'Not “senior brother”.'],
    ]],
    'EN-080' => ['Modal + have + past participle can express a deduction, possibility, expectation or criticism about the past.', 'Mixed conditionals: check the time of the condition and of the result separately.', [
        ['✓ The ground is wet. It must have rained.', 'Evidence now, deduction about the past.'],
        ['✓ She can’t have seen you; she was in Kano.', 'The speaker makes a strong negative deduction from the evidence.'],
        ['✓ If I had studied medicine, I would be a doctor now.', 'Past condition, present result.'],
        ['✗ It must rained last night.', 'Modal + have + participle: must have rained.'],
    ]],
    'EN-001' => ['A common noun names a class, a proper noun names a particular person or place, and a collective noun names a group.', 'Class, individual name, or group?', [
        ['✓ In “Ada visited Kano”, Ada and Kano are proper nouns.', 'They name a particular person and place; both begin with capitals.'],
        ['✗ In “The teacher arrived”, teacher is a proper noun.', 'Teacher names a class of people, not an individual name.'],
        ['✓ In “A flock of birds landed”, flock is a collective noun.', 'Flock names the birds as a group.'],
    ]],
    'EN-002' => ['Most countable nouns add -s or -es in the plural, but some change form or stay unchanged.', 'Check the noun, not just its ending.', [
        ['✓ One box, two boxes.', 'A noun ending in x normally adds -es.'],
        ['✗ One child, two childs.', 'Child has the irregular plural children.'],
        ['✓ One baby, two babies; one boy, two boys.', 'Consonant + y changes to -ies; vowel + y keeps y and adds -s.'],
    ]],
    'EN-007' => ['A complete written statement starts with a capital and ends with a full stop, and proper names keep their capitals.', 'Check the beginning, names, and ending.', [
        ['✓ Amina lives in Abuja.', 'The sentence begins with a capital; both proper names are capitalised.'],
        ['✗ amina lives in abuja.', 'The sentence beginning and the proper names need capitals.'],
        ['✓ My brother and I read on Mondays.', 'The pronoun I and the day Monday take capitals.'],
    ]],
    'EN-008' => ['Use commas to separate list items and direct address, and use a question mark to end a direct question.', 'Is this a list, a person being addressed, or a question?', [
        ['✓ Musa, where is your book?', 'The comma marks direct address; the question mark ends a direct question.'],
        ['✗ Where is your book.', 'This is a direct question, so its final mark should be a question mark.'],
        ['✓ We packed pens, books and rulers.', 'Commas separate items in this list; a comma before and is optional here.'],
    ]],
    'EN-009' => ['Check a doubtful spelling against its standard form rather than adding letters just because you hear them.', 'Notice doubled letters and missing vowels.', [
        ['✓ Please separate the clean pages.', 'Separate has a after the p.'],
        ['✗ A ruler is neccessary for this task.', 'Necessary has one c and two s letters.'],
        ['✓ The committee met yesterday.', 'Committee has double m, double t and double e.'],
    ]],
    'EN-010' => ['A synonym keeps the relevant meaning in context, while an antonym reverses it.', 'Read the whole sentence before replacing a word.', [
        ['✓ “The room was silent: nobody spoke.” Here silent means quiet.', 'Nobody spoke fixes the meaning as absence of sound.'],
        ['✗ “The room was silent: nobody spoke.” Here noisy is a synonym of silent.', 'Noisy reverses the meaning; it is an antonym here.'],
        ['✓ “The gate was shut, so we could not enter.” Open is the opposite of shut.', 'The blocked entrance establishes the closed/open contrast.'],
    ]],
    'EN-023' => ['The two th sounds differ in voicing: feel whether your throat vibrates while air passes between your tongue and teeth.', 'Keep the tongue near the teeth and compare voice on with voice off.', [
        ['✓ The th in “thin” is voiceless.', 'The vocal folds do not vibrate for that consonant.'],
        ['✗ The th in “they” is voiceless.', 'That consonant is voiced; compare the vibration with thin.'],
        ['✓ “thin” and “tin” begin with different consonant sounds.', 'The tongue lets air flow in thin but briefly blocks it in tin.'],
    ]],
    'EN-029' => ['Contrastive stress highlights the part of a message that corrects an alternative or supplies the requested information.', 'Find what changed, then stress that word.', [
        ['✓ To correct “Bola bought it”, say “ADA bought it”.', 'Ada replaces Bola: the disputed information is who bought it.'],
        ['✗ To correct only “Ada borrowed it”, stress ADA in “Ada bought it”.', 'The person is unchanged; stress BOUGHT to correct the action.'],
        ['✓ To answer “Did she buy the red bag?”, say “She bought the BLUE bag”.', 'Blue contrasts with the proposed colour red.'],
    ]],
    'EN-030' => ['Intonation is the movement of pitch across speech, and its meaning depends on the speaker’s purpose and context.', 'A question mark alone does not decide the pitch.', [
        ['✓ A rising ending can invite confirmation in a yes–no question.', 'A rise commonly signals that the speaker is checking or inviting a response.'],
        ['✗ Every English question must end with a rise.', 'An ordinary information-seeking wh-question commonly ends with a fall.'],
        ['✓ A falling ending can make a statement sound complete.', 'A fall commonly signals completion; it does not always mean anger.'],
    ]],
    'EN-041' => ['The main idea covers the central point of a passage without adding claims beyond it.', 'Choose the umbrella idea, not a single supporting detail.', [
        ['✓ “The club bought shelves, repaired chairs and added lamps.” Its main idea is improving the reading room.', 'The general idea covers all three improvements.'],
        ['✗ “The club bought shelves, repaired chairs and added lamps.” Its main idea is that all schools need new buildings.', 'The passage says nothing about all schools or new buildings.'],
        ['✓ “Rain delayed training on Monday and Tuesday.” The central point is that rain disrupted training.', 'The statement includes both delays without inventing a permanent cancellation.'],
    ]],
    'EN-042' => ['An inference combines textual clues into a supported conclusion without treating a possibility as a certainty.', 'Point to the clue; keep the conclusion no stronger than it.', [
        ['✓ “Ayo checked the clock twice and hurried to the bus stop.” Ayo may be worried about time.', 'Clock-checking and hurrying support that cautious inference.'],
        ['✗ “Ayo checked the clock twice and hurried to the bus stop.” This proves that the bus had already left.', 'The text gives no evidence that the bus has left.'],
        ['✓ “Sade opened an umbrella as drops struck her bag.” It has probably started raining.', 'The drops and umbrella jointly support the inference.'],
    ]],
    'EN-043' => ['Use nearby clues to identify a word’s meaning in this passage, then test a replacement in the sentence.', 'A familiar word may have a different meaning here.', [
        ['✓ “The queue moved slowly, advancing only one person in ten minutes.” Here advancing means moving forward.', 'The queue and the measured progress establish movement.'],
        ['✗ “The speaker gave a brief reply of only three words.” Here brief means delayed.', 'The number of words establishes length, not waiting time.'],
        ['✓ “The path was narrow: only one person could pass at a time.” Here narrow means not wide.', 'The restriction on people passing fixes the meaning.'],
    ]],
    'EN-044' => ['A factual claim can be checked against evidence, while an opinion expresses a judgement or preference.', 'Checkability is different from whether the claim is already proven.', [
        ['✓ “The library closes at five” is a factual claim.', 'Its accuracy can be checked against the opening hours.'],
        ['✗ “Blue is the nicest colour” is an objective fact.', 'Nicest expresses a personal judgement.'],
        ['✓ “The match lasted ninety minutes” needs evidence even though it is a factual claim.', 'Calling a claim factual does not guarantee that it is true.'],
    ]],
    'EN-045' => ['A simile explicitly compares unlike things, a metaphor presents one as another, and personification gives something non-human a human quality.', 'Identify how the comparison is made.', [
        ['✓ “Her voice was like warm sunlight” is a simile.', 'Like explicitly compares the voice with sunlight.'],
        ['✗ “The wind whispered a warning” is literal human speech.', 'Wind cannot speak a warning; whispered personifies it.'],
        ['✓ “The classroom was a beehive of activity” is a metaphor.', 'The classroom is presented as a beehive, suggesting busy activity.'],
    ]],
    'EN-046' => ['Hyperbole exaggerates, euphemism softens an expression, and verbal irony can contrast the spoken words with the intended meaning.', 'Use the situation to interpret the device.', [
        ['✓ “I have told you a million times” is usually hyperbole.', 'The huge number exaggerates repeated telling.'],
        ['✗ Calling a badly leaking roof “perfect”, while pointing angrily at the holes, is sincere praise.', 'The situation contradicts the praise, supporting an ironic reading.'],
        ['✓ “Passed away”, used instead of “died”, is a euphemism.', 'The expression softens a difficult fact.'],
    ]],
    'EN-047' => ['Tone is the attitude conveyed by the writing, while mood is the atmosphere it creates for the reader.', 'Support each label with a word or detail.', [
        ['✓ “How fortunate we are to have your help!” conveys gratitude in a sincere thank-you note.', 'Fortunate and help support an appreciative tone in that context.'],
        ['✗ “Empty corridors echoed; a door creaked in the darkness” creates a cheerful party mood.', 'Emptiness, creaking and darkness support unease, not celebration.'],
        ['✓ “At last, clean water flowed into every bucket” can suggest relief.', 'At last presents a welcome end to waiting.'],
    ]],
    'EN-048' => ['A summary keeps the relevant main points and removes repeated details, illustrations and personal additions.', 'Preserve the meaning while reducing the words.', [
        ['✓ “The road flooded, so lessons started late.” Summary: Flooding delayed lessons.', 'Both the cause and the main result remain.'],
        ['✗ “The road flooded, so lessons started late.” Summary: Careless teachers cancelled school.', 'This invents blame and changes a delay into a cancellation.'],
        ['✓ If three examples illustrate one cause, a summary can state that cause once.', 'Examples support a point; they need not become three repeated points.'],
    ]],
    'EN-049' => ['Register is the choice of language suited to the audience, purpose and situation.', 'Formal does not mean longer or less clear.', [
        ['✓ “Please send the revised timetable” suits a formal request.', 'It is polite, clear and specific.'],
        ['✗ Slang is required in every letter to a school principal.', 'An official request usually needs a formal register.'],
        ['✓ “See you soon!” can suit a friendly message to a close friend.', 'The relaxed closing matches that relationship.'],
    ]],
    'EN-052' => ['A formal letter identifies its purpose clearly and addresses its recipient politely with relevant supporting details.', 'State the request, explain it, and close appropriately.', [
        ['✓ “Dear Sir or Madam” can close with “Yours faithfully” in a British formal letter.', 'The salutation does not name the recipient.'],
        ['✗ A request for permission should omit what permission is being sought.', 'The reader needs the specific action, date and relevant details.'],
        ['✓ “Dear Ms Bello” can close with “Yours sincerely”.', 'The recipient is addressed by name.'],
    ]],
    'EN-053' => ['An informal letter uses a personal, friendly tone while keeping its message understandable and organised.', 'Be natural, but still give the reader the details they need.', [
        ['✓ “Dear Tola, Thank you for your lovely letter” suits a reply to a friend.', 'The greeting and opening acknowledge the relationship.'],
        ['✗ Every informal letter must contain spelling mistakes.', 'An informal tone permits relaxed language, not compulsory errors.'],
        ['✓ A friendly invitation should say when and where the event takes place.', 'Friendliness does not replace practical information.'],
    ]],
    'EN-054' => ['A focused paragraph develops one controlling idea through relevant supporting details.', 'Every sentence should help the paragraph do its job.', [
        ['✓ A paragraph about saving water can include repairing leaking taps.', 'The detail directly supports water conservation.'],
        ['✗ A sentence about football scores necessarily supports a paragraph about repairing classroom desks.', 'No connection is given; sharing a school setting is not enough.'],
        ['✓ A topic sentence can state the central idea that the next sentences explain.', 'It guides the reader through the supporting details.'],
    ]],
    'EN-055' => ['A linking expression should show the actual relationship between the ideas it connects.', 'Addition, contrast, cause or result?', [
        ['✓ “The hall was full. However, seats were available outside” marks a contrast.', 'However introduces the contrasting availability of seats.'],
        ['✗ Therefore normally introduces a contrast unrelated to a result.', 'Therefore signals a consequence or conclusion.'],
        ['✓ “The pump broke; consequently, the tanks remained empty” marks a result.', 'Consequently connects the broken pump to its effect.'],
    ]],
    'EN-056' => ['Concise writing removes needless words without losing the intended information.', 'Shorter is better only if the meaning survives.', [
        ['✓ “At this point in time” can be shortened to “now”.', 'Now preserves the time reference in ordinary use.'],
        ['✗ “Only three pupils arrived” means the same as “Pupils arrived”.', 'Removing only three loses the limit and the number.'],
        ['✓ “The reason is because the gate is locked” can become “The reason is that the gate is locked”.', 'That avoids the redundant reason/because construction.'],
    ]],
    'EN-058' => ['A semicolon can join closely related independent clauses, while a colon can introduce an explanation or list after a complete clause.', 'Check whether the words before the mark can stand as a sentence.', [
        ['✓ The gates were locked; we waited outside.', 'Both clauses are complete and closely related.'],
        ['✗ We packed; three books and a ruler.', 'The semicolon separates a verb from its object rather than joining two clauses.'],
        ['✓ We needed two things: patience and a plan.', 'A complete clause introduces the list with a colon.'],
    ]],
    'EN-059' => ['Choose a text’s structure and tone to match its audience and its job.', 'Decide whether you are informing, inviting, explaining or persuading.', [
        ['✓ A meeting notice should include its date, time and place.', 'Readers need those details to attend.'],
        ['✗ A notice that asks pupils to attend tomorrow needs no location.', 'Readers cannot reliably attend without knowing where to go.'],
        ['✓ A vote-of-thanks speech should acknowledge the people being thanked.', 'Acknowledgement is the speech’s central purpose.'],
    ]],
    'EN-060' => ['A reasoned argument connects a clear claim to relevant evidence and explains how that evidence supports it.', 'A repeated claim is not a new reason.', [
        ['✓ “Extend library hours: attendance records show pupils queue after closing” gives relevant evidence.', 'The records support unmet demand, although costs must still be considered.'],
        ['✗ “My proposal is right because it is correct” provides independent evidence.', 'The reason merely repeats the claim.'],
        ['✓ Addressing a reasonable objection can strengthen an argument.', 'It tests whether the proposal still works when a difficulty is considered.'],
    ]],
    'EN-061' => ['A familiar root can suggest a word’s meaning, but the whole word and its context must confirm it.', 'Roots are clues, not a substitute for checking meaning.', [
        ['✓ Bio- relates to life in biology.', 'Biology studies living things.'],
        ['✗ Every word starting with the letters tele must mean distance.', 'A matching sequence of letters need not be that root.'],
        ['✓ Geo- relates to earth in geology.', 'Geology studies the Earth and its materials.'],
    ]],
    'EN-062' => ['Words in a family share a base or meaning connection but may do different grammatical jobs.', 'Choose the form that fits the sentence slot.', [
        ['✓ “Her explanation was clear” uses the noun explanation.', 'Her introduces the thing being described: an explanation.'],
        ['✗ “Please explanation the rule” uses the right word class.', 'After please, this request needs the verb explain.'],
        ['✓ “They decided quickly” uses the adverb quickly.', 'Quickly describes how they decided.'],
    ]],
    'EN-063' => ['A collocation is a combination of words that conventionally go together in a particular meaning.', 'Learn the whole phrase in a sentence.', [
        ['✓ We made a decision after the discussion.', 'Make a decision is an established combination.'],
        ['✗ We did a mistake in the calculation.', 'The standard combination is made a mistake.'],
        ['✓ Please pay attention to the instructions.', 'Pay attention is the conventional phrase meaning listen or look carefully.'],
    ]],
    'EN-064' => ['Choose a commonly confused word by its meaning and grammatical job in the sentence.', 'Check what the word needs to do, not how familiar it looks.', [
        ['✓ Please advise me; I need your advice.', 'Advise is the verb; advice is the noun.'],
        ['✗ I need your advise about this course.', 'After your, the intended noun is advice.'],
        ['✓ The new rule may affect attendance; its effect is not yet known.', 'Affect is the verb meaning influence; effect is the resulting change.'],
    ]],
    'EN-065' => ['A precise substitute must preserve the whole relevant meaning of the phrase it replaces.', 'Check the definition against every part of the description.', [
        ['✓ A person who writes a book is its author.', 'Author identifies the creator of the written work.'],
        ['✗ A person who writes a book is necessarily its publisher.', 'Publishing and writing are different roles.'],
        ['✓ A life story written by its own subject is an autobiography.', 'Auto- distinguishes self-written life history from biography.'],
    ]],
    'EN-066' => ['In health vocabulary, distinguish the sign or experience of illness, its identification, and its treatment.', 'Symptom, diagnosis and treatment name different things.', [
        ['✓ A symptom is something a patient experiences, such as pain.', 'It is an experience associated with a condition, not its identification.'],
        ['✗ A prescription is the name for identifying an illness.', 'Identification is diagnosis; a prescription directs treatment.'],
        ['✓ A diagnosis identifies a condition from the available evidence.', 'It is distinct from the treatment selected afterwards.'],
    ]],
    'EN-067' => ['Use legal and civic terms precisely, keeping an allegation, evidence and a decision distinct.', 'A claim is not automatically a proven fact.', [
        ['✓ A witness can give evidence about what they observed.', 'Witness names a person providing relevant testimony.'],
        ['✗ An allegation automatically proves that an accused person is guilty.', 'An allegation is a claim that requires examination.'],
        ['✓ A legislature makes laws.', 'Law-making is distinct from interpreting laws in court.'],
    ]],
    'EN-068' => ['In farming and trade, name the process or quantity precisely rather than treating related terms as interchangeable.', 'Revenue is money received; profit also accounts for costs.', [
        ['✓ Irrigation supplies water to growing crops.', 'It names water provision, not collecting the harvest.'],
        ['✗ Revenue and profit always mean the same amount.', 'Profit deducts relevant costs from revenue.'],
        ['✓ Harvesting means gathering a crop when it is ready.', 'It is a later process than sowing the seeds.'],
    ]],
    'EN-069' => ['Use media, sport and technology terms according to their specific roles in context.', 'Distinguish a tool, a process and its result.', [
        ['✓ A headline is the title of a news report.', 'It introduces the report rather than naming its author.'],
        ['✗ Uploading a file means receiving it from a server onto your device.', 'That describes downloading; uploading sends it to a server or other remote system.'],
        ['✓ A referee applies the rules during a match.', 'That role differs from coaching a team.'],
    ]],
    'EN-070' => ['Interpret a sentence by preserving its logical limits, time relationships and conditions.', 'Words such as only, unless and some change the claim.', [
        ['✓ “Some pupils cycle” does not say that all pupils cycle.', 'Some does not establish a claim about every pupil.'],
        ['✗ “The hall opens only on Fridays” means that it opens every day.', 'Only restricts opening to Fridays.'],
        ['✓ “Unless it rains, we will walk” means “If it does not rain, we will walk”.', 'Unless introduces the exception to the stated plan.'],
    ]],
    'EN-071' => ['A grammatical name identifies what a word or phrase is, while its function identifies the job it does in this sentence.', 'Name the form, then locate its job.', [
        ['✓ In “The tall girl smiled”, “the tall girl” is a noun phrase functioning as subject.', 'It names the person performing the action.'],
        ['✗ In “We greeted the tall girl”, “the tall girl” is the subject.', 'We is the subject; the noun phrase is the object of greeted.'],
        ['✓ In “They arrived after lunch”, “after lunch” is a prepositional phrase giving the time.', 'The name describes its form; the time function describes its use.'],
    ]],
    'EN-072' => ['Identify a subordinate clause by both its structure and the work it does in the larger sentence.', 'Does it describe a noun, supply a noun-like part, or give a circumstance?', [
        ['✓ In “I know that she won”, “that she won” is a content clause completing know.', 'It supplies what is known.'],
        ['✗ In “We waited because it rained”, “because it rained” describes the noun we.', 'It explains why the waiting happened, so it is an adverbial clause of reason.'],
        ['✓ In “The book that I borrowed is here”, “that I borrowed” is a relative clause modifying book.', 'It identifies which book is meant.'],
    ]],
    'EN-073' => ['An own-words answer restates the relevant meaning without copying the passage or adding unsupported information.', 'Keep the claim and its strength; change the wording.', [
        ['✓ “The path was impassable” can mean “Nobody could get through along the path”.', 'The restatement preserves the inability to pass.'],
        ['✗ “The path was impassable” means “The path was slightly inconvenient”.', 'Slight inconvenience weakens inability into difficulty.'],
        ['✓ “She reluctantly agreed” can mean “She agreed despite not wanting to”.', 'The restatement preserves both agreement and unwillingness.'],
    ]],
    'EN-074' => ['When asked for separate summary points, give each requested point once in a complete sentence without adding your own judgement.', 'One relevant point, one clear sentence.', [
        ['✓ For “Why did lessons start late?”, “Flooding blocked the access road” gives one complete reason.', 'It answers the cause question in a sentence.'],
        ['✗ “Blocked roads” is a complete sentence for a summary task requiring sentences.', 'It is a phrase; it lacks a finite verb.'],
        ['✓ Repeating the same reason in different words still gives only one point.', 'A new wording is not a new idea.'],
    ]],
    'EN-075' => ['Count spoken sounds separately from written letters, and count syllables as spoken beats rather than vowel letters.', 'A letter, a sound and a syllable are different units.', [
        ['✓ A pair of letters can represent one consonant sound.', 'For example, sh in ship represents one consonant.'],
        ['✗ Every written letter always represents a separate spoken sound.', 'Some letters are silent and some letter groups represent one sound.'],
        ['✓ A one-syllable word can have several consonant sounds.', 'The consonants do not each create a separate syllable.'],
    ]],
    'EN-076' => ['A consonant cluster contains adjacent consonant sounds within a syllable, without an inserted vowel between them.', 'Count sounds, not adjacent consonant letters.', [
        ['✓ The start of “street” contains three consonant sounds.', 'The initial sequence is s, t and r with no intervening vowel.'],
        ['✗ Any two neighbouring consonant letters must form a two-sound cluster.', 'A spelling such as sh can represent just one sound.'],
        ['✓ Inserting a vowel between the opening consonants changes the pronunciation of a cluster.', 'Keep the consonants together rather than adding an extra syllable.'],
    ]],
    'EN-077' => ['A semi-formal letter balances a respectful tone with a relationship that is more personal than an anonymous official exchange.', 'Match the relationship and purpose together.', [
        ['✓ A letter to a teacher you know can be warm and respectful.', 'Personal acquaintance and a respectful role can coexist.'],
        ['✗ Knowing the recipient means that every topic should be written in slang.', 'An official request may still need polite, clear language.'],
        ['✓ A request to a familiar club organiser should still state what you need.', 'The relationship does not remove the need for a clear purpose.'],
    ]],
    'EN-078' => ['Narrative writing develops events, while descriptive writing selects details to create a clear impression.', 'Events move a story; details build an impression.', [
        ['✓ “The bell rang; Ada ran outside and found the gate locked” develops a sequence of events.', 'The actions move the narrative forward.'],
        ['✗ Description must always include every detail the writer can imagine.', 'Relevant, selected details create a stronger focus than an indiscriminate list.'],
        ['✓ “Rain tapped the rusty roof” adds sound and visual detail.', 'Tapped appeals to hearing and rusty helps the reader picture the roof.'],
    ]],
    'EN-079' => ['Expository writing explains an idea or process, while argumentative writing supports a position with reasons and evidence.', 'Explain how it works, or justify why a view should be accepted.', [
        ['✓ A text explaining how a water filter works has an expository purpose.', 'Its central job is explanation.'],
        ['✗ Repeating “our plan is best” is enough evidence for an argument.', 'Repetition supplies no supporting reason or evidence.'],
        ['✓ An argument for longer library hours should address practical costs.', 'Considering a relevant objection tests the proposal.'],
    ]],
    ];
}
