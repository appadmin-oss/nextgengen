<?php
declare(strict_types=1);

/**
 * English Lab: questions the learner must PRODUCE (owner, 13 Nov 2026: "English still feels guessable,
 * mostly multiple choice").
 *
 * Measured that day: English practice was about three quarters recognition; a guesser that never read
 * the question beat chance just by picking the longest option; and 57 of 80 topics had fewer than eight
 * distinct typed questions in their whole bank, so a session ran out of typed questions and fell back to
 * choices whatever the picker preferred. Recognising the right form is not the skill; writing it is.
 *
 * Every row here has ONE defensible answer without options to lean on: a base word in brackets, a gap
 * only one word fits, or a sentence to rewrite. Where English genuinely allows more than one answer,
 * each is accepted (a correct answer marked wrong is worse than a guessable question). Rows follow
 * englishlab-kit.php: [question, answer, [other accepted answers], why]. Our own sentences, set where a
 * Nigerian learner will recognise them; no exam's papers are used.
 *
 * Appended AFTER every other module in eng_forms(), so no existing form changes its number.
 */
function eng_produce_forms(): array {
    return [
    'EN-001' => [eng_type([
        ['“my cousin lives in kaduna.”', 'Kaduna', [], 'Kaduna names one particular city, so it is a proper noun and takes a capital.'],
        ['“we sang for chiamaka at her party.”', 'Chiamaka', [], 'A person’s name is a proper noun.'],
        ['“the school closes in august.”', 'August', [], 'The months are proper nouns in English.'],
        ['“our match is on saturday.”', 'Saturday', [], 'The days of the week are proper nouns.'],
        ['“a parcel came from ghana.”', 'Ghana', [], 'A country’s name is a proper noun.'],
        ['“my brother supports enyimba.”', 'Enyimba', [], 'The name of one particular club is a proper noun.'],
        ['“the plane landed in abuja.”', 'Abuja', [], 'Abuja names one particular city.'],
        ['“the boat crossed the river benue.”', 'River Benue', ['Benue'], 'The name of one particular river is a proper noun; River is part of the name.'],
    ], 'Copy the proper noun from this sentence, with its capital letter: {q}', 'A proper noun names ONE particular person, place, day or thing — and always starts with a capital.', 'procedure', 40, ['case' => 1])],
    'EN-003' => [eng_type([
        ['“(Ada and I) went to the market.”', 'We', [], 'Ada and I together, doing the action, is we.'],
        ['“The teacher praised (Musa and me).”', 'us', [], 'Musa and me, receiving the action, is us.'],
        ['“(The children) are playing football.”', 'They', [], 'Several people doing the action is they.'],
        ['“Please give the ball to (the twins).”', 'them', [], 'Several people after a preposition is them.'],
        ['“(The book) is on the table.”', 'It', [], 'A single thing is it.'],
        ['“This house is (my family’s).”', 'ours', [], 'Something belonging to my family and me is ours — no apostrophe.'],
        ['“These seats belong to you and your brother; they are (you and your brother’s).”', 'yours', [], 'Belonging to you (one or many) is yours — no apostrophe.'],
        ['“(You and Kemi) should sit here.”', 'You', [], 'You and someone else together is still you.'],
    ], 'Give the ONE pronoun that replaces the words in brackets: {q}', 'Ask: is it doing the action, receiving it, or owning something? And is it one or many?', 'procedure', 35)],
    'EN-007' => [eng_type([
        ['we travelled to jos last week', 'We travelled to Jos last week.', [], 'The first word and the name of the city take capitals; the sentence ends with a full stop.'],
        ['my sister’s name is amaka', 'My sister’s name is Amaka.', [], 'The first word and the name take capitals.'],
        ['the market opens on friday', 'The market opens on Friday.', [], 'Days of the week take capitals.'],
        ['ibadan is a big city', 'Ibadan is a big city.', [], 'The city’s name is the first word here, so one capital does both jobs.'],
        ['i read every evening', 'I read every evening.', [], 'I is always a capital letter.'],
        ['we celebrate christmas in december', 'We celebrate Christmas in December.', [], 'Festivals and months take capitals.'],
        ['the river niger is long', 'The River Niger is long.', ['The river Niger is long.'], 'Niger is a proper noun; River is usually capitalised as part of the name.'],
        ['our teacher, mrs bello, is kind', 'Our teacher, Mrs Bello, is kind.', ['Our teacher, Mrs. Bello, is kind.'], 'A title and a surname take capitals.'],
    ], 'Write this sentence correctly, with capital letters and a full stop: “{q}”', 'Capitals: the first word, I, names, days, months. End a statement with a full stop.', 'procedure', 60, ['case' => 1, 'punct' => 1])],
    'EN-008' => [eng_type([
        ['Where are you going', 'Where are you going?', [], 'It asks something, so it ends with a question mark.'],
        ['I bought rice beans and oil.', 'I bought rice, beans and oil.', ['I bought rice, beans, and oil.'], 'Commas separate the items in a list.'],
        ['Ada can you help me?', 'Ada, can you help me?', [], 'A comma separates the name of the person spoken to.'],
        ['Is the shop open', 'Is the shop open?', [], 'A question ends with a question mark.'],
        ['Yes I will come.', 'Yes, I will come.', [], 'A comma follows yes or no at the start of an answer.'],
        ['We need pens pencils and rulers.', 'We need pens, pencils and rulers.', ['We need pens, pencils, and rulers.'], 'Commas separate the items in a list.'],
        ['What time is it', 'What time is it?', [], 'A question ends with a question mark.'],
        ['Tunde did you finish?', 'Tunde, did you finish?', [], 'A comma separates the name of the person spoken to.'],
    ], 'Write this sentence again with the missing punctuation: “{q}”', 'Is it a question? Is there a list, a name being spoken to, or a yes or no at the start?', 'procedure', 50, ['punct' => 1])],
    'EN-012' => [eng_type([
        ['She is good ___ mathematics.', 'at', [], 'We are good AT a subject or skill.'],
        ['He was born ___ 2012.', 'in', [], 'IN a year, a month or a season.'],
        ['The meeting is ___ Monday.', 'on', [], 'ON a day or a date.'],
        ['I am afraid ___ dogs.', 'of', [], 'Afraid OF something.'],
        ['This gift is different ___ that one.', 'from', [], 'Different FROM is the standard form.'],
        ['They are interested ___ football.', 'in', [], 'Interested IN something.'],
        ['We have lived in Owerri ___ 2019.', 'since', [], 'SINCE a point in time; for a length of time.'],
        ['The bus arrives ___ seven o’clock.', 'at', [], 'AT a clock time.'],
    ], 'Type the preposition that fits: “{q}”', 'Some words always take the same preposition (good at, afraid of). Times: at a clock time, on a day, in a year.', 'procedure', 30)],
    'EN-013' => [eng_type([
        ['Do you want rice ___ yam?', 'or', [], 'OR offers a choice.'],
        ['She was tired, ___ she went to bed early.', 'so', ['and so'], 'SO introduces a result.'],
        ['We stayed indoors ___ it was raining.', 'because', ['as', 'since'], 'BECAUSE gives the reason.'],
        ['Wait here ___ I come back.', 'until', ['till'], 'UNTIL marks the point the waiting ends.'],
        ['___ it was late, we kept reading.', 'Although', ['Though', 'Even though'], 'ALTHOUGH sets up a contrast with what follows.'],
        ['You will miss the bus ___ you hurry.', 'unless', [], 'UNLESS means “if … not”: if you do not hurry.'],
        ['I wanted to go out, ___ it was raining.', 'but', ['yet'], 'BUT joins two ideas that pull against each other.'],
        ['Read the question carefully ___ you answer it.', 'before', [], 'BEFORE puts one action ahead of the other in time.'],
    ], 'Type the joining word that fits: “{q}”', 'Ask what the joining word must do: offer a choice, give a reason, show a result, a contrast, or a time.', 'procedure', 35)],
    'EN-014' => [eng_type([
        ['You are coming, ___?', 'aren’t you', ['are not you'], 'A positive statement takes a negative tag with the same helper verb: are → aren’t.'],
        ['She can swim, ___?', 'can’t she', [], 'Positive statement, negative tag: can → can’t.'],
        ['They didn’t call, ___?', 'did they', [], 'A negative statement takes a positive tag: didn’t → did.'],
        ['He has finished, ___?', 'hasn’t he', [], 'The helper verb has gives the tag hasn’t.'],
        ['We should leave now, ___?', 'shouldn’t we', [], 'Positive statement, negative tag: should → shouldn’t.'],
        ['It isn’t raining, ___?', 'is it', [], 'Negative statement, positive tag: isn’t → is.'],
        ['You will help me, ___?', 'won’t you', [], 'Will becomes won’t in a negative tag.'],
        ['Your parents live in Owerri, ___?', 'don’t they', [], 'No helper verb in the statement, so the tag uses do: live → don’t.'],
    ], 'Type the question tag: “{q}”', 'Use the same helper verb as the statement and flip it: positive statement, negative tag; negative statement, positive tag.', 'procedure', 35)],
    'EN-018' => [eng_type([
        ['I can ___ the drums from here. (sounds like “here”)', 'hear', [], 'HEAR is what ears do; here is a place.'],
        ['The wind ___ the door shut. (sounds like “blue”)', 'blew', [], 'BLEW is the past of blow; blue is a colour.'],
        ['We waited for an ___. (sounds like “our”)', 'hour', [], 'An HOUR is sixty minutes; our means belonging to us.'],
        ['She ___ the answer at once. (sounds like “new”)', 'knew', [], 'KNEW is the past of know.'],
        ['Please ___ a letter to Grandma. (sounds like “right”)', 'write', [], 'WRITE is what you do with a pen.'],
        ['I ate the last ___ of cake. (sounds like “peace”)', 'piece', [], 'A PIECE is a part of something; peace is calm.'],
        ['The boys put ___ bags on the bus. (sounds like “there”)', 'their', [], 'THEIR means belonging to them.'],
        ['___ going to be late. (sounds like “there”)', 'They’re', ['They are'], 'THEY’RE is short for they are.'],
    ], 'Write the word that fits, spelt correctly: “{q}”', 'Words that sound alike are spelt by meaning. Say what the word must MEAN here, then spell that word.', 'procedure', 35)],
    'EN-031' => [eng_type([
        ['The cat chased the mouse.', 'The mouse was chased by the cat.', [], 'The object (the mouse) becomes the subject; the verb becomes was + chased.'],
        ['Chidi wrote the letter.', 'The letter was written by Chidi.', [], 'Wrote becomes was written.'],
        ['The storm destroyed the bridge.', 'The bridge was destroyed by the storm.', [], 'Destroyed becomes was destroyed.'],
        ['The teacher marks our books.', 'Our books are marked by the teacher.', [], 'Present tense, plural subject: are marked.'],
        ['The girls cleaned the classroom.', 'The classroom was cleaned by the girls.', [], 'Cleaned becomes was cleaned.'],
        ['The principal will open the hall.', 'The hall will be opened by the principal.', [], 'Will open becomes will be opened.'],
        ['Someone has stolen my pen.', 'My pen has been stolen.', ['My pen has been stolen by someone.'], 'Has stolen becomes has been stolen; “by someone” adds nothing and is usually dropped.'],
        ['Farmers grow yams in Benue.', 'Yams are grown in Benue by farmers.', ['Yams are grown by farmers in Benue.', 'Yams are grown in Benue.'], 'Grow becomes are grown; “by farmers” may stay or go.'],
    ], 'Rewrite in the passive voice: “{q}”', 'Make the object the subject, use the right form of be in the same tense, then the past participle.', 'procedure', 70)],
    'EN-033' => [eng_type([
        ['If it rains, we ___ (stay) indoors.', 'will stay', ['’ll stay', 'shall stay'], 'A likely future condition: if + present, will + verb.'],
        ['If I ___ (be) you, I would apologise.', 'were', [], 'An imagined situation uses were for every person: if I were you.'],
        ['If you heat water, it ___ (boil).', 'boils', [], 'A fact that is always true: present in both halves.'],
        ['If she had studied, she ___ (pass).', 'would have passed', [], 'An imagined past: if + had + participle, would have + participle.'],
        ['If we leave now, we ___ (catch) the bus.', 'will catch', ['’ll catch'], 'A likely future: if + present, will + verb.'],
        ['If I had a bicycle, I ___ (ride) to school.', 'would ride', ['’d ride'], 'An imagined present: if + past, would + verb.'],
        ['If they had called, we ___ (wait).', 'would have waited', [], 'An imagined past: would have + participle.'],
        ['If you press this button, the light ___ (come) on.', 'comes', [], 'A general truth: present in both halves.'],
    ], 'Write the verb in brackets in the right form: “{q}”', 'Decide first: always true, likely in future, imagined now, or imagined in the past? Each has its own pattern.', 'procedure', 50)],
    'EN-034' => [eng_type([
        ['“search for”: look ___', 'for', [], 'To look FOR something is to search for it.'],
        ['“stop trying”: give ___', 'up', [], 'To give UP is to stop trying.'],
        ['“stop a fire burning”: put ___', 'out', [], 'To put OUT a fire is to extinguish it.'],
        ['“refuse an offer”: turn ___', 'down', [], 'To turn DOWN an offer is to refuse it.'],
        ['“take care of”: look ___', 'after', [], 'To look AFTER someone is to take care of them.'],
        ['“continue”: carry ___', 'on', [], 'To carry ON is to continue.'],
        ['“discover a fact”: find ___', 'out', [], 'To find OUT is to discover.'],
        ['“have none left”: run ___ of', 'out', [], 'To run OUT of something is to have none left.'],
    ], 'Complete the phrasal verb with the meaning given — {q}', 'The small word changes the verb’s meaning completely. Say the whole phrase aloud and check it means what is asked.', 'concept', 30)],
    'EN-035' => [eng_type([
        ['“very easy”: a piece of ___', 'cake', [], 'A piece of cake is something very easy.'],
        ['“start a friendly conversation”: break the ___', 'ice', [], 'To break the ice is to end an awkward silence.'],
        ['“feeling unwell”: under the ___', 'weather', [], 'Under the weather means slightly ill.'],
        ['“reveal a secret by mistake”: let the cat out of the ___', 'bag', [], 'Letting the cat out of the bag reveals a secret.'],
        ['“very rarely”: once in a blue ___', 'moon', [], 'Once in a blue moon means very seldom.'],
        ['“it is your decision now”: the ball is in your ___', 'court', [], 'The ball is in your court: it is your turn to act.'],
        ['“very expensive”: cost an arm and a ___', 'leg', [], 'Costing an arm and a leg means very expensive.'],
        ['“tell a secret”: spill the ___', 'beans', [], 'To spill the beans is to tell a secret.'],
    ], 'Complete the idiom with the meaning given — {q}', 'An idiom’s words are fixed; its meaning is not what the words say. Recall the whole phrase.', 'concept', 30)],
    'EN-036' => [eng_type([
        ['We stayed inside because it was raining.', 'because', [], '“because it was raining” cannot stand alone; because begins it.'],
        ['Although she was tired, she finished her homework.', 'Although', [], '“Although she was tired” needs the main clause to finish its thought.'],
        ['Call me when you arrive.', 'when', [], '“when you arrive” tells us the time of the main action.'],
        ['If you hurry, you will catch the bus.', 'If', [], '“If you hurry” is the condition; it cannot stand alone.'],
        ['He waited until the bell rang.', 'until', [], '“until the bell rang” tells us how long he waited.'],
        ['Since it was late, we took a taxi.', 'Since', [], '“Since it was late” gives the reason for the main clause.'],
        ['Unless you study, you will struggle.', 'Unless', [], '“Unless you study” is a condition that cannot stand alone.'],
        ['The boy who won the race is my cousin.', 'who', [], '“who won the race” tells us which boy; who begins it.'],
    ], 'Type the word that begins the subordinate clause: “{q}”', 'The subordinate clause is the part that cannot stand alone as a sentence. Find its first word.', 'concept', 35)],
    'EN-038' => [eng_type([
        ['Mathematics ___ (be) my best subject.', 'is', [], 'Mathematics ends in s but is one subject: singular.'],
        ['Each of the boys ___ (have) a book.', 'has', [], 'The subject is each, which is singular.'],
        ['The news ___ (be) good today.', 'is', [], 'News is singular, though it ends in s.'],
        ['Neither the teacher nor the pupils ___ (be) here.', 'are', [], 'With neither … nor, the verb agrees with the nearer subject: pupils.'],
        ['Everyone ___ (want) a turn.', 'wants', [], 'Everyone is singular.'],
        ['The scissors ___ (be) on the table.', 'are', [], 'Scissors is plural, like trousers.'],
        ['One of my friends ___ (live) in Kano.', 'lives', [], 'The subject is one, not friends.'],
        ['The number of pupils ___ (be) rising.', 'is', [], 'The number is singular; a number of pupils would be plural.'],
    ], 'Write the verb in brackets in the present tense, agreeing with its subject: “{q}”', 'Find the true subject first — not the noun nearest the verb — and decide if it is one or many.', 'procedure', 40)],
    'EN-040' => [eng_type([
        ['I enjoy ___ (read) novels.', 'reading', [], 'Enjoy is followed by the -ing form.'],
        ['She decided ___ (leave) early.', 'to leave', [], 'Decide is followed by to + verb.'],
        ['Please stop ___ (talk); I am trying to sleep.', 'talking', [], 'Stop + -ing means to end the action.'],
        ['They hope ___ (win) the match.', 'to win', [], 'Hope is followed by to + verb.'],
        ['He avoided ___ (answer) the question.', 'answering', [], 'Avoid is followed by the -ing form.'],
        ['We plan ___ (visit) Calabar.', 'to visit', [], 'Plan is followed by to + verb.'],
        ['Do you mind ___ (wait) here?', 'waiting', [], 'Mind is followed by the -ing form.'],
        ['I want ___ (learn) French.', 'to learn', [], 'Want is followed by to + verb.'],
    ], 'Write the verb in brackets correctly: “{q}”', 'Some verbs take -ing after them (enjoy, avoid, mind), others take to + verb (decide, hope, want).', 'procedure', 35)],
    'EN-061' => [eng_type([
        ['bio (as in biology, biography)', 'life', [], 'Bio means life: biology is the study of living things.'],
        ['geo (as in geography, geology)', 'earth', ['the earth', 'land'], 'Geo means earth.'],
        ['tele (as in telephone, television)', 'far', ['distant', 'far away', 'far off'], 'Tele means far: a telephone carries sound far.'],
        ['aqua (as in aquarium)', 'water', [], 'Aqua means water.'],
        ['port (as in transport, porter)', 'carry', ['to carry'], 'Port means carry.'],
        ['chron (as in chronological)', 'time', [], 'Chron means time.'],
        ['micro (as in microscope)', 'small', ['tiny', 'very small'], 'Micro means small.'],
        ['scrib or script (as in scribble, manuscript)', 'write', ['to write', 'writing'], 'Scrib and script mean write.'],
    ], 'What does this root mean? {q} — type one word', 'Think of two words that share the root and ask what they have in common.', 'concept', 30)],
    'EN-063' => [eng_type([
        ['___ a mistake', 'make', [], 'We MAKE a mistake.'],
        ['___ your homework', 'do', [], 'We DO homework, work and chores.'],
        ['___ a photo', 'take', [], 'We TAKE a photo.'],
        ['___ attention to the teacher', 'pay', [], 'We PAY attention.'],
        ['___ the bed every morning', 'make', [], 'We MAKE the bed.'],
        ['___ a risk', 'take', [], 'We TAKE a risk.'],
        ['___ the bus to school', 'catch', ['take'], 'We CATCH or TAKE a bus.'],
        ['___ someone a hand (help them)', 'give', ['lend'], 'We GIVE or LEND someone a hand.'],
    ], 'Type the verb that goes with these words: {q}', 'Collocations are fixed partners; say the phrase aloud and hear which verb English uses.', 'concept', 30)],
    ];
}
