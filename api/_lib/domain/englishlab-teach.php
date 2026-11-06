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
    'EN-003' => ['A pronoun takes the SUBJECT form (I, he, she, we, they) before the verb and the OBJECT form (me, him, her, us, them) after a verb or preposition.', 'Cover the other person and the right form is obvious.', [
        ['✓ Tunde and I went home.', 'Cover “Tunde and”: “I went home”.'],
        ['✗ Me and Tunde went home.', '“Me went” is wrong, so “me and Tunde went” is wrong too; politeness also puts yourself last.'],
        ['✓ She gave the book to Ada and me.', 'Cover “Ada and”: “gave the book to me”.'],
        ['✓ The book is hers. (never her’s)', 'Possessive pronouns stand alone and never take an apostrophe.'],
    ]],
    'EN-004' => ['The simple present is for habits and facts (he/she/it adds -s); the simple past is for finished actions; the future is will + base verb.', 'The time words decide the tense.', [
        ['✓ My mother goes to work every day.', 'A habit, and “my mother” is she: goes.'],
        ['✗ My mother go to work every day.', 'She/he/it in the present always takes -s.'],
        ['✓ We ate rice yesterday.', '“Yesterday” is finished time: simple past.'],
        ['✓ The school will hold a sports day next week.', '“Next week”: will + base verb (never “will held”).'],
    ]],
    'EN-005' => ['Compare TWO with -er or “more … than”; compare THREE OR MORE with -est or “most”. Never both together.', 'Short words take -er/-est; long words take more/most.', [
        ['✓ Kano is bigger than Jos.', 'Two things: comparative, “than”.'],
        ['✗ Kano is more bigger than Jos.', '“More” and -er together is a double comparative.'],
        ['✓ Lagos is the biggest city of all.', 'Three or more: superlative.'],
        ['✓ This is the most beautiful dress.', '“Beautiful” is long: most, not -est.'],
    ]],
    'EN-006' => ['An ADJECTIVE describes a noun; an ADVERB describes a verb (how, when, where). Most adverbs add -ly, and “good” becomes “well”.', 'Ask what the word is describing.', [
        ['✓ She is a careful driver.', '“Careful” describes the driver (a noun): adjective.'],
        ['✓ She drives carefully.', '“Carefully” describes how she drives (a verb): adverb.'],
        ['✗ She drives careful.', 'A verb needs the adverb.'],
        ['✓ He did well in the test. (never “did good”)', '“Did” is a verb: well.'],
    ]],
    'EN-011' => ['The verb agrees with its real SUBJECT: singular subject, singular verb; plural subject, plural verb. Ignore the phrase between them.', 'Find the subject first, then match the verb.', [
        ['✓ The list of names is on the board.', 'The subject is “the list” (one), not “names”.'],
        ['✗ The list of names are on the board.', '“Of names” only describes the list; it is not the subject.'],
        ['✓ Each of the students has a book.', '“Each” is singular whatever follows “of”.'],
        ['✓ My father and my uncle work in Ibadan.', 'Two subjects joined by “and” are plural.'],
    ]],
    'EN-012' => ['Many verbs and adjectives take ONE fixed preposition — and some take none. Learn them as pairs.', 'Interested IN, good AT, different FROM, depend ON.', [
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
    'EN-014' => ['A question tag repeats the HELPER verb and the SUBJECT as a pronoun, with the opposite polarity: positive → negative tag, negative → positive tag.', 'No helper verb in the sentence? Use do, does or did.', [
        ['✓ You are coming, aren’t you?', 'are → aren’t; you → you.'],
        ['✗ You are coming, isn’t it?', '“Isn’t it” does not match “you are”.'],
        ['✓ She didn’t call, did she?', 'Negative statement → positive tag.'],
        ['✓ He plays chess, doesn’t he?', 'No helper: plays → does → doesn’t he?'],
    ]],
    'EN-015' => ['Continuous (be + -ing) = in progress; perfect (have + past participle) = finished but connected to a later time.', 'Now? Already? Earlier than another past action?', [
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
    'EN-017' => ['The apostrophe does two jobs only: ownership (the girl’s bag) and missing letters (don’t). It never makes a plural.', 'If nothing owns anything and no letter is missing, there is no apostrophe.', [
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
    'EN-019' => ['A prefix changes the meaning (un-, dis-, im-); a suffix changes the word class (-ness, -ful, -ly). Spelling rules apply where they join.', 'in- becomes im- before b, m, p; il- before l; ir- before r.', [
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
    'EN-032' => ['Reported speech moves one step back: the tense goes back, pronouns change to the reporter’s view, and here/now words change.', 'am → was, will → would, today → that day.', [
        ['✓ “I am tired,” he said. → He said that he was tired.', 'I → he; am → was.'],
        ['✓ “Where do you live?” she asked. → She asked where I lived.', 'A reported question takes statement order and no question mark.'],
        ['✗ She asked where did I live.', 'No “did”, no question order.'],
        ['✓ “Close your books.” → The teacher told us to close our books.', 'A command: told + person + to + verb.'],
    ]],
    'EN-033' => ['Match the conditional to the meaning: real future (If + present, will), imagined now (If + past, would), imagined past (If + had + participle, would have).', '“Will” and “would” never go in the if-clause.', [
        ['✓ If it rains, we will stay in.', 'A real possibility.'],
        ['✓ If I were rich, I would build a school.', 'Imagined now: past form (were) + would.'],
        ['✓ If she had studied, she would have passed.', 'Imagined past: had + participle, would have + participle.'],
        ['✗ If I will see him, I will tell him.', 'No “will” after “if”: If I see him…'],
    ]],
    'EN-034' => ['A phrasal verb is verb + particle with its OWN meaning (call off = cancel). Use the standard ones; some local forms are not standard English.', 'Learn the meaning as a whole, not word by word.', [
        ['✓ The match was called off.', 'call off = cancel.'],
        ['✗ We must cope up with the rules.', 'The verb is “cope with”.'],
        ['✗ Please off the light.', '“Off” is not a verb: switch off / turn off.'],
        ['✓ Look up the word in a dictionary.', 'look up = search for information.'],
    ]],
    'EN-035' => ['An idiom means something different from its words, and its words are FIXED: “break the ice”, never “break the water”.', 'Learn the idiom with its meaning and a sentence.', [
        ['✓ It is raining cats and dogs.', '= raining heavily.'],
        ['✓ The test was a piece of cake.', '= very easy.'],
        ['✗ It was a piece of bread.', 'The words of an idiom cannot be swapped.'],
        ['✓ She let the cat out of the bag.', '= told a secret.'],
    ]],
    'EN-036' => ['A clause has a subject and a verb. A MAIN clause makes sense alone; a SUBORDINATE clause (when, because, if, although, who…) depends on it.', 'Cover the subordinate clause: the main clause still stands.', [
        ['✓ When the bell rang, the pupils went home.', 'Main clause: “the pupils went home”.'],
        ['✗ When the bell rang.', 'A subordinate clause alone is a fragment.'],
        ['✓ The boy who won the prize is my cousin.', 'The relative clause sits inside the main clause.'],
        ['in the morning', 'No verb: a phrase, not a clause.'],
    ]],
    'EN-037' => ['who = subject (he/she), whom = object (him/her) and after a preposition, whose = owner, which = things.', 'Test with he/him: he → who, him → whom.', [
        ['✓ The girl who won is my sister.', 'She won: who.'],
        ['✓ The man whom we met is a doctor.', 'We met him: whom.'],
        ['✓ The man whose car was stolen called the police.', 'His car: whose.'],
        ['✗ The students which passed were praised.', 'People: who, not which.'],
    ]],
    'EN-038' => ['Tricky subjects: each/every/everyone/neither of = singular; “the number of” = singular, “a number of” = plural; either/or and neither/nor agree with the NEARER subject.', 'Phrases like “together with” do not change the subject.', [
        ['✓ Neither of the boys was present.', '“Neither of” is singular.'],
        ['✓ Either the captain or the players are to blame.', 'Nearer subject: players.'],
        ['✓ The teacher, together with her pupils, is going.', 'The subject is still “the teacher”.'],
        ['✗ The number of students are rising.', '“The number” is singular: is rising.'],
    ]],
    'EN-039' => ['Modals (can, could, may, might, must, should, will, would) take the BASE verb with no “to” and no -s.', 'must = necessary, should = advice, may = permission/possibility, can = ability.', [
        ['✓ You should see a doctor.', 'Advice + base verb.'],
        ['✗ You should to see a doctor.', 'No “to” after a modal.'],
        ['✗ She can speaks three languages.', 'Base verb after a modal: speak.'],
        ['✓ You must not smoke here. / You need not come.', 'Must not = forbidden; need not = not necessary.'],
    ]],
    'EN-040' => ['Some verbs take -ING (enjoy, avoid, finish, suggest); some take TO + verb (want, decide, hope, agree). After a preposition, always -ing.', 'Learn each verb with its pattern.', [
        ['✓ I enjoy reading.', 'enjoy + -ing.'],
        ['✓ She decided to study medicine.', 'decide + to.'],
        ['✗ I look forward to meet you.', 'Here “to” is a preposition: look forward to meeting.'],
        ['✓ Stop talking. (stop doing it)', 'stop + -ing means no longer do it.'],
    ]],
    'EN-051' => ['Combine short sentences by showing how the ideas connect — a joining word, a relative clause, or an opening phrase — and never join two sentences with only a comma.', 'Remove the repetition, keep the link.', [
        ['The boy is my cousin. The boy won. → The boy who won is my cousin.', 'A relative clause removes the repeated noun.'],
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
    'EN-080' => ['Modal + HAVE + past participle talks about the PAST: must have (sure it did), can’t have (sure it didn’t), might have (possibly), should have (it was right but didn’t happen).', 'Mixed conditionals: check the time of the condition and of the result separately.', [
        ['✓ The ground is wet. It must have rained.', 'Evidence now, deduction about the past.'],
        ['✓ She can’t have seen you; she was in Kano.', 'Sure it did not happen.'],
        ['✓ If I had studied medicine, I would be a doctor now.', 'Past condition, present result.'],
        ['✗ It must rained last night.', 'Modal + have + participle: must have rained.'],
    ]],
    ];
}
