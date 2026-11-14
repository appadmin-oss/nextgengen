<?php
declare(strict_types=1);

/**
 * English Lab — Stage 8, The Senior Paper (EN-071 … EN-080), the summit. The skills the senior
 * English paper examines that the earlier stages lead up to: naming a word, phrase or clause and
 * its job (asked in almost every comprehension passage), answering in your own words, summary one
 * point at a time, counting sounds and clusters, the semi-formal letter, the four essay types, and
 * the last grammar of the road (mixed conditionals, modals of deduction). Applied, not drilled in
 * isolation: grammar drilled apart from writing does not improve writing; summarising does.
 * Content only, built with the kit. Append-only.
 */
function eng_senior_forms(): array {
    return [
    'EN-071' => [
        eng_choose([
            ['“The tall girl in the blue dress won the prize.” — “in the blue dress”', 'an adjectival phrase, describing “girl”', [['an adverbial phrase, modifying “won”', 'It tells us which girl, not how or where she won.'], ['a noun clause, object of “won”', 'It has no verb, so it is not a clause.'], ['a verb phrase', 'It contains no verb.']], 'A phrase that describes a noun is adjectival.'],
            ['“He ran across the field.” — “across the field”', 'an adverbial phrase of place, modifying “ran”', [['an adjectival phrase, describing “he”', 'It tells where he ran.'], ['a noun phrase, subject of “ran”', 'The subject is “he”.'], ['an adverbial clause of place', 'There is no verb in it, so it is a phrase.']], 'It answers “where?” about the verb: adverbial phrase of place.'],
            ['“Swimming is good exercise.” — “Swimming”', 'a gerund (verbal noun), subject of “is”', [['a present participle, describing “exercise”', 'Here it names an activity and is the subject.'], ['an adjective, describing “exercise”', 'It is the subject, not a describer.'], ['a finite verb', 'The finite verb is “is”.']], 'An -ing word used as a noun is a gerund.'],
            ['“The broken window was replaced.” — “broken”', 'a past participle used as an adjective, describing “window”', [['a finite verb in the past tense, telling what happened', 'It has no tense of its own here; the finite verb is “was replaced”.'], ['an adverb of manner, modifying “was replaced”', 'It describes the noun “window”, not how it was replaced.'], ['a gerund (verbal noun), subject of “was replaced”', 'Gerunds end in -ing; the subject is “The broken window”.']], 'A participle before a noun works as an adjective.'],
            ['“We met him yesterday.” — “yesterday”', 'an adverb of time, modifying “met”', [['a noun, object of “met”', 'The object is “him”.'], ['an adjective, describing “him”', 'It tells when.'], ['a preposition', 'It is not followed by an object.']], 'It answers “when?”: adverb of time.'],
            ['“To win this match will not be easy.” — “To win this match”', 'an infinitive phrase, subject of “will be”', [['an adverbial phrase of purpose', 'Here it is the subject.'], ['a prepositional phrase, describing “match”', '“To” here marks an infinitive, not a preposition.'], ['a noun clause, subject of “will be”', 'It has no finite verb, so it is a phrase, not a clause.']], 'An infinitive phrase can be the subject.'],
        ], 'Give the grammatical name and function of the words after the dash: {q}', 'Phrase or clause? Then ask what it does: names, describes, or modifies a verb.', 'concept', 50),
        eng_choose([
            ['In “She sings beautifully”, what is the function of “beautifully”?', 'It modifies the verb “sings”.', [['It describes the subject “She”.', 'Adverbs modify verbs, not nouns.'], ['It is the object of “sings”.', 'An object answers “what?”.'], ['It joins two clauses.', 'That is a conjunction.']], 'An adverb of manner modifies the verb.'],
            ['In “The book on the table is mine”, what is the function of “on the table”?', 'It qualifies the noun “book”.', [['It modifies the verb “is”.', 'It tells which book.'], ['It is the subject.', 'The subject is “The book”.'], ['It is the complement.', 'The complement is “mine”.']], 'It qualifies (describes) the noun.'],
            ['In “They elected Musa captain”, what is the function of “captain”?', 'It is the object complement of “Musa”.', [['It is the subject of “elected”.', 'The subject is “They”.'], ['It is the direct object of “elected”.', 'The direct object is “Musa”; “captain” says what Musa became.'], ['It is an adverb modifying “elected”.', 'It is a noun naming a role, not how they elected him.']], '“Captain” completes the meaning of the object Musa.'],
        ], '', 'Function = the job the word does in this sentence.', 'concept', 45),
        eng_type([
            ['“The old man walked slowly.” What part of speech is “slowly”?', 'adverb', [], 'It tells how he walked.'],
            ['“The old man walked slowly.” What part of speech is “old”?', 'adjective', [], 'It describes the man.'],
            ['“She arrived after the meeting.” What part of speech is “after”?', 'preposition', [], 'It is followed by a noun phrase, “the meeting”.'],
            ['“She arrived after the meeting had ended.” What part of speech is “after”?', 'conjunction', ['subordinating conjunction'], 'It introduces a clause (“the meeting had ended”).'],
            ['“Wow! That was close.” What part of speech is “Wow”?', 'interjection', ['exclamation'], 'A word that expresses feeling on its own.'],
        ], '{q}', 'The same word can be different parts of speech in different sentences.', 'procedure', 30),
    ],
    'EN-072' => [
        eng_choose([
            ['“I know that she will come.” — “that she will come”', 'a noun clause, object of “know”', [['an adjectival clause, qualifying “I”', 'It answers “know what?”.'], ['an adverbial clause of time', 'It does not say when.'], ['a main clause', 'It cannot stand alone after “that”.']], 'It answers “what?” after the verb: noun clause, object.'],
            ['“The man who called you is my uncle.” — “who called you”', 'an adjectival (relative) clause, qualifying “man”', [['a noun clause, subject of “is”', 'The subject is “The man”.'], ['an adverbial clause of manner, modifying “is”', 'It tells which man, not how.'], ['a prepositional phrase, describing “uncle”', 'It has a finite verb (called), so it is a clause, and it follows “man”.']], 'A relative clause qualifies a noun.'],
            ['“We left when the rain stopped.” — “when the rain stopped”', 'an adverbial clause of time, modifying “left”', [['an adjectival clause, qualifying “we”', 'It tells when.'], ['a noun clause, object of “left”', '“Left” has no object here.'], ['an adverbial clause of reason', 'It gives time, not reason.']], 'It answers “when?”: adverbial clause of time.'],
            ['“He failed because he did not study.” — “because he did not study”', 'an adverbial clause of reason, modifying “failed”', [['an adverbial clause of condition, modifying “failed”', 'That would begin with “if” or “unless”.'], ['a noun clause, object of “failed”', 'It gives a reason; “failed” takes no object here.'], ['an adjectival clause, qualifying “he”', 'It does not describe a noun.']], '“Because” introduces reason.'],
            ['“What you said surprised everyone.” — “What you said”', 'a noun clause, subject of “surprised”', [['an adjectival clause, qualifying “everyone”', 'It describes no noun; it is the subject.'], ['an adverbial clause of manner', 'It is the subject.'], ['a main clause, standing on its own', 'It cannot stand alone as a statement here.']], 'A clause doing a noun’s job as subject.'],
            ['“If you work hard, you will pass.” — “If you work hard”', 'an adverbial clause of condition, modifying “will pass”', [['an adverbial clause of time, modifying “will pass”', 'It states a condition, not a time: “if”, not “when”.'], ['a noun clause, subject of “will pass”', 'The subject is “you”; the clause is not subject or object.'], ['an adjectival clause, qualifying “you”', 'It does not describe a noun.']], '“If” introduces condition.'],
            ['“Although he was tired, he finished.” — “Although he was tired”', 'an adverbial clause of concession (contrast), modifying “finished”', [['an adverbial clause of reason (cause), modifying “finished”', 'It is a contrast, not a reason: he finished in spite of being tired.'], ['a noun clause, subject of “finished”', 'The subject is “he”; the clause is not subject or object.'], ['an adjectival clause, qualifying “he”', 'It does not describe a noun.']], '“Although” introduces concession.'],
        ], 'Name the clause and its function: {q}', 'Noun clause: subject/object. Adjectival: qualifies a noun. Adverbial: when, why, if, although.', 'concept', 50),
        eng_choose([
            ['Which sentence contains a NOUN clause?', 'Tell me where you live.', [['The house where you live is big.', '“where you live” here qualifies “house”: adjectival.'], ['I met her where you live.', 'Adverbial of place.'], ['You live in Jos.', 'Only a main clause.']], '“where you live” is the object of “tell”.'],
            ['Which sentence contains an ADJECTIVAL clause?', 'The pen that I lost was red.', [['I hope that you are well.', 'Noun clause, object.'], ['I left so that I could rest.', 'Adverbial of purpose.'], ['That is my pen.', '“That” is a pronoun here; no clause.']], '“that I lost” qualifies “pen”.'],
            ['Which sentence contains an ADVERBIAL clause of PURPOSE?', 'She saved money so that she could buy a bicycle.', [['She saved money because she was careful.', 'Reason.'], ['She saved money when she worked.', 'Time.'], ['She said that she saved money.', 'Noun clause.']], '“so that” introduces purpose.'],
        ], '', 'Find the clause, then ask what job it does.', 'reasoning', 45),
        eng_type([
            ['“I wonder whether he will agree.” Is “whether he will agree” a noun, adjectival or adverbial clause?', 'noun', ['noun clause'], 'It is the object of “wonder”.'],
            ['“The day when we met was hot.” Is “when we met” a noun, adjectival or adverbial clause?', 'adjectival', ['adjectival clause', 'adjective', 'relative'], 'It qualifies “day”.'],
            ['“We will go when you are ready.” Is “when you are ready” a noun, adjectival or adverbial clause?', 'adverbial', ['adverbial clause', 'adverb'], 'It tells when we will go.'],
            ['“That he lied is clear.” Is “That he lied” a noun, adjectival or adverbial clause?', 'noun', ['noun clause'], 'It is the subject of “is”.'],
        ], '{q}', '“When” and “where” can start all three kinds; the job decides.', 'procedure', 35),
    ],
    'EN-073' => [
        eng_choose([
            [eng_passage('solar') . ' — In ONE word, what is the weakness of the panels?', 'cloudiness', [['expense', 'The cost is a drawback at first, but the passage calls the rainy season “their weakness”.'], ['noise', 'They make no noise.'], ['fuel', 'They need none.']], '“Their weakness is the rainy season, when cloudy days leave the batteries half charged.”'],
            [eng_passage('traffic') . ' — Why do the riders oppose the ban?', 'It has taken away their income.', [['It caused more accidents.', 'Commuters report fewer accidents.'], ['The buses are too fast.', 'Not stated.'], ['They prefer to walk.', 'Commuters walk; riders object to lost work.']], '“cost them their living” = lost their income.'],
            [eng_passage('library') . ' — What turned the empty library into a full one?', 'The librarian’s reading club and new borrowing rules.', [['A new library building with more shelves and seats.', 'Not stated: the room stayed the same; the club and the rules changed.'], ['Free books given to every pupil’s parents.', 'Not stated.'], ['The pupils’ teachers.', 'The librarian acted, not teachers.']], 'The club, the parents’ meeting and two-book borrowing filled it.'],
        ], 'Answer in your own words: {q}', 'Use the passage’s idea, not a copied phrase; check your answer against the exact sentence.', 'reasoning', 70),
        eng_choose([
            [eng_passage('traffic') . ' — “however” in the second sentence shows:', 'a contrast between the riders’ view and the commuters’ view', [['a result of the ban, shown by fewer accidents', 'That would be “therefore”.'], ['an example of how the ban has helped commuters', 'That would be “for instance”.'], ['a time sequence, from the ban to the promised buses', 'That would be “then” or “later”.']], '“However” contrasts two views.'],
            [eng_passage('solar') . ' — “keep a phone and two bulbs going” means the panels:', 'supply enough power for a phone and two bulbs', [['make a phone’s battery last longer than before', 'Not the meaning.'], ['are very bright', 'Not the meaning.'], ['are cheap to buy', 'The passage says they cost money.']], '“Keep … going” = keep running.'],
            [eng_passage('library') . ' — “a handful of pupils” means:', 'very few pupils', [['pupils holding books', 'Not literal.'], ['five pupils exactly', 'It means “a small number”.'], ['many pupils', 'The opposite.']], 'A handful = a small number.'],
        ], '{q}', 'Read the words around the phrase.', 'concept', 60),
        eng_choose([
            ['Which is the best answer “in your own words” to: “Why did the clinic report fewer cases of typhoid?” (The village now drinks borehole water instead of stream water.)', 'Because people now drink cleaner water.', [['Since the borehole was dug last year.', 'A phrase lifted from the text; it gives a time, not the reason.'], ['Because the clinic is better.', 'Not supported.'], ['Typhoid.', 'Not an answer.']], 'Explain the cause in your own words, in a full sentence.'],
            ['A question asks: “What does the writer mean by ‘no matter how often it is wiped’?” Which answer is best?', 'The dust keeps coming back however much you clean.', [['The table is wiped very often during the day.', 'Repeats the words without explaining what they mean.'], ['The cleaners do not wipe the table well enough.', 'Blames the cleaners; the point is that the dust returns.'], ['It is the harmattan season.', 'Names the season; does not explain the words.']], 'A meaning question needs an explanation, not a repetition.'],
        ], '', 'Own words, full sentence, the exact point asked.', 'reasoning', 50),
    ],
    'EN-074' => [
        eng_choose([
            [eng_passage('solar') . ' — In ONE sentence, give one ADVANTAGE of the panels.', 'They need no fuel to run.', [['Many households now use them.', 'A fact, not an advantage.'], ['They cost money at first.', 'A disadvantage.'], ['The rainy season is cloudy.', 'Context for the weakness.']], 'One point per sentence: the advantage stated plainly.'],
            [eng_passage('traffic') . ' — In ONE sentence, what has the government promised?', 'It will provide more buses before widening the ban.', [['Okada riders have lost their living.', 'The riders’ complaint, not the promise.'], ['There are fewer accidents.', 'A result reported by commuters.'], ['Many commuters now walk long distances to a bus stop.', 'A problem, not the promise.']], 'Pick only the point the question asks for.'],
            [eng_passage('library') . ' — In ONE sentence, state ONE thing the librarian did.', 'She started a Saturday reading club.', [['Only a handful of pupils came.', 'The problem, not an action.'], ['The reading room was full.', 'The result.'], ['The library opened.', 'Background.']], 'One action, one sentence.'],
        ], '{q}', 'A summary point is a full sentence that answers exactly what was asked.', 'reasoning', 60),
        eng_choose([
            ['Which is the best summary sentence for: “The road is narrow, it has many potholes, it has no street lights, and drivers speed on it at night.”?', 'The road is dangerous, especially at night.', [['The road is narrow.', 'Only one detail.'], ['Drivers speed.', 'Only one detail.'], ['The road is narrow, has potholes, has no lights and drivers speed.', 'A list, not a summary.']], 'A summary generalises the details into the point.'],
            ['Which summary sentence is written correctly?', 'Students should read daily because it builds vocabulary.', [['students should read daily', 'Not a full sentence (no capital, no full stop, no reason).'], ['Reading. Vocabulary. Daily.', 'Fragments.'], ['Firstly, secondly and thirdly reading is good, etc.', '“Etc.” and lists do not belong in a summary.']], 'Full sentences, your own words, no lists or “etc.”.'],
        ], '', 'One point, one complete sentence, no examples.', 'reasoning', 45),
        eng_order([
            [['Read the passage through once.', 'Read the question and note exactly what it asks.', 'Underline the sentences that answer it.', 'Write each point in one sentence, in your own words.', 'Check you have the number of points asked for.'], 'This is the order that keeps a summary to the point.'],
        ], 'Put the steps of writing a summary in order.', 'You cannot pick points before you know the question.', 'procedure', 60),
    ],
    'EN-075' => [
        eng_derive([['cat', 3, '/k/ /æ/ /t/'], ['ship', 3, '/ʃ/ /ɪ/ /p/'], ['thought', 3, '/θ/ /ɔː/ /t/'], ['school', 4, '/s/ /k/ /uː/ /l/'], ['knight', 3, '/n/ /aɪ/ /t/'],
                    ['strength', 6, '/s/ /t/ /r/ /e/ /ŋ/ /θ/'], ['phone', 3, '/f/ /əʊ/ /n/'], ['queen', 4, '/k/ /w/ /iː/ /n/'], ['box', 4, '/b/ /ɒ/ /k/ /s/'], ['laugh', 3, '/l/ /ɑː/ /f/']],
            static function (MlbRng $r, array $w): array {
                [$word, $n, $sounds] = $w;
                $letters = strlen($word);
                $wrong = [[(string)$letters, 'That counts letters, not sounds.'], [(string)($n + 1), 'One sound too many: some letters together make one sound.'], [(string)max(1, $n - 1), 'One sound too few: check every consonant and vowel.']];
                if ($letters === $n) $wrong[0] = [(string)($n + 2), 'Too many: count only what you hear.'];
                return mlb_mcq($r, 'How many speech SOUNDS (not letters) are in “' . $word . '”?', (string)$n, $wrong, [$word . ' = ' . $sounds . ': ' . $n . ' sounds.'], 'Say it slowly; “sh”, “th”, “gh” and “ck” are one sound each, and x is two.', 'concept', 35);
            }),
        eng_choose([
            ['education', '4', [['3', 'ed-u-ca-tion has four beats.'], ['5', 'One too many.'], ['2', 'Too few.']], 'ed-u-CA-tion: 4 syllables.'],
            ['comfortable', '3', [['4', 'In everyday speech it is COMF-ta-ble.'], ['2', 'Too few.'], ['5', 'Too many.']], 'COMF-ta-ble: usually 3 syllables.'],
            ['examination', '5', [['4', 'ex-am-i-na-tion has five.'], ['6', 'Too many.'], ['3', 'Too few.']], 'ex-am-i-NA-tion: 5 syllables.'],
            ['strengths', '1', [['2', 'One vowel sound: one syllable.'], ['3', 'Count vowel sounds, not consonants.'], ['4', 'Too many.']], 'One vowel sound, one syllable.'],
            ['beautiful', '3', [['4', 'BEAU-ti-ful has three.'], ['2', 'Too few.'], ['5', 'Too many.']], 'BEAU-ti-ful: 3 syllables.'],
        ], 'How many syllables are in “{q}”?', 'Count the vowel SOUNDS (beats), not the vowel letters.'),
        eng_choose([
            ['How many vowel sounds (pure vowels and diphthongs) are there in the British model of English taught in schools?', '20', [['5', 'That counts vowel letters.'], ['12', 'That counts only the pure vowels.'], ['24', 'That is the number of consonant sounds.']], '12 pure vowels + 8 diphthongs = 20 vowel sounds.'],
            ['How many consonant sounds are there in that model?', '24', [['21', 'That counts consonant letters.'], ['20', 'That is the number of vowel sounds.'], ['26', 'That counts all the letters of the alphabet.']], '24 consonant sounds.'],
            ['How many diphthongs are there in that model?', '8', [['12', 'That is the number of pure vowels.'], ['5', 'That counts vowel letters.'], ['20', 'That is all the vowel sounds together.']], '8 diphthongs: /eɪ/ /aɪ/ /ɔɪ/ /əʊ/ /aʊ/ /ɪə/ /eə/ /ʊə/.'],
        ], '', 'Sounds are not letters.', 'concept', 25),
    ],
    'EN-076' => [
        eng_choose([
            ['Which word BEGINS with a three-consonant cluster?', 'street', [['seat', 'Only /s/.'], ['tree', '/tr/ is two consonants.'], ['eat', 'Begins with a vowel.']], '“street” begins /str/.'],
            ['Which word ENDS with a consonant cluster?', 'desk', [['day', 'Ends in a vowel sound.'], ['bee', 'Ends in a vowel sound.'], ['see', 'Ends in a vowel sound.']], '“desk” ends /sk/.'],
            ['Which word begins with the cluster /spl/?', 'splash', [['plash', 'Begins /pl/.'], ['slash', 'Begins /sl/.'], ['spark', 'Begins /sp/: only two consonants.']], '“splash” begins /spl/.'],
            ['Which word ends with the cluster /kst/?', 'next', [['neck', 'Ends /k/.'], ['nest', 'Ends /st/.'], ['necks', 'Ends /ks/.']], '“next” ends /kst/: x is /ks/, then t.'],
        ], '', 'A cluster is two or more consonant SOUNDS with no vowel between.'),
        eng_choose([
            ['Many speakers add a vowel and say “sitrit” for “street”. What should they do?', 'say /str/ together with no vowel between', [['add another vowel to make it clearer', 'That is the mistake.'], ['drop the /r/', 'That changes the word.'], ['stress the first syllable', 'There is only one syllable.']], 'Say the cluster without an inserted vowel.'],
            ['Many speakers say “frenship” for “friendship”. Which sounds are dropped?', '/d/ in the cluster /ndʃ/', [['/f/ in the cluster /fr/', 'Still there: “fr” is said.'], ['/n/ in the cluster /ndʃ/', 'Still there: “fren” keeps it.'], ['/r/ after the /f/', 'Still there.']], 'The /d/ in the middle cluster is lost.'],
            ['Many speakers say “tes” for “test”. What is lost?', 'the final /t/ of the cluster /st/', [['the /s/ of the cluster /st/', 'Still there: “tes” keeps it.'], ['the /t/ at the start of the word', 'Still there: “tes” begins with it.'], ['nothing at all', 'The final /t/ is lost.']], 'Pronounce both consonants of the final cluster.'],
        ], '', 'Keep every consonant of a cluster, and add no vowel inside it.', 'concept', 35),
        eng_choose([
            ['asked', '/skt/', [['/kd/', 'The -ed after /k/ is /t/.'], ['/sk/', 'The -ed adds /t/.'], ['/st/', 'The /k/ is there.']], 'asked = /ɑːskt/: the cluster /skt/.'],
            ['texts', '/ksts/', [['/ks/', 'There is more: /t/ and /s/ follow.'], ['/kst/', 'The plural adds /s/.'], ['/sts/', 'The /k/ is there (x = /ks/).']], 'texts = /teksts/: /ksts/.'],
            ['months', '/nθs/', [['/ns/', 'The /θ/ is there.'], ['/nts/', 'It is /θ/, not /t/.'], ['/ms/', 'The /n/ and /θ/ are there.']], 'months = /mʌnθs/: /nθs/.'],
        ], 'Which final cluster is in “{q}”?', 'Say the end of the word slowly.', 'concept', 40),
    ],
    'EN-077' => [
        eng_choose([
            ['Which letter is SEMI-FORMAL?', 'A letter to your friend’s father thanking him for his hospitality', [['A letter to your best friend telling her about your holiday', 'Informal: a friend your own age.'], ['A letter to the Commissioner for Education about bad roads', 'Formal: an official you do not know.'], ['A letter to a company manager applying for a job', 'Formal.']], 'Semi-formal: to someone you know but must respect, such as a friend’s parent or your pastor.'],
            ['How does a semi-formal letter to “Dear Mr Adeyemi” usually end?', 'Yours sincerely,', [['Yours faithfully,', 'Used with “Dear Sir”.'], ['Your loving friend,', 'Too familiar.'], ['Cheers,', 'Slang.']], 'A named, respected reader: Yours sincerely.'],
            ['How many addresses does a semi-formal letter carry?', 'one — the writer’s', [['two — yours and theirs', 'Only formal letters add the receiver’s address.'], ['none at all', 'The writer’s address is needed.'], ['three', 'Not standard.']], 'Like an informal letter: the writer’s address and the date.'],
            ['Which opening suits a semi-formal letter to your uncle’s colleague?', 'I hope this letter finds you well. I am writing to thank you for…', [['How far, how body?', 'Pidgin and too familiar.'], ['Sir, I humbly submit this application for your kind consideration…', 'Too formal: this is a job application, not a thank-you.'], ['Hey! What’s up? Long time no see, I miss you plenty!', 'Too familiar for someone you must respect.']], 'Polite and warm, but not chatty.'],
        ], '', 'Semi-formal: a respected person you know — polite, warm, Yours sincerely.'),
        eng_choose([
            ['Does a semi-formal letter have a heading (title)?', 'no', [['yes, always', 'Headings belong to formal letters.'], ['only if it is long', 'No heading.'], ['yes, underlined', 'No heading.']], 'No heading.'],
            ['Which salutation suits a semi-formal letter to your pastor?', 'Dear Pastor Okon,', [['Dear Sir/Madam,', 'Too formal: that is for someone whose name you do not know.'], ['Hi Okon,', 'Too familiar.'], ['My dear Okon,', 'Too familiar, and it drops his title.']], 'A respectful title and name.'],
        ], '', 'Respect without stiffness.', 'concept', 30),
        eng_spot([
            [['Dear Mrs Bello,', 'Thank you for hosting me last week.', 'Yours faithfully,', 'Ada Eze'], 2, 'Yours sincerely,', 'A named reader takes “Yours sincerely”.'],
            [['Dear Uncle’s friend,', 'I write to thank you', 'for your kind gift.', 'Yours sincerely,'], 0, 'Dear Mr Okoro,', 'Address the reader by title and name.'],
        ], 'Check the salutation and the close.'),
    ],
    'EN-078' => [
        eng_choose([
            ['Which essay type tells a story in time order?', 'narrative', [['descriptive', 'Describes a person, place or thing.'], ['expository', 'Explains facts or a process.'], ['argumentative', 'Takes and defends a side.']], 'Narrative = a story.'],
            ['Which essay type paints a picture of a place with the senses?', 'descriptive', [['narrative', 'A story.'], ['expository', 'Explains.'], ['argumentative', 'Persuades.']], 'Descriptive = sights, sounds, smells.'],
            ['“Write about an unforgettable day in your life.” This topic asks for:', 'a narrative essay', [['an argumentative essay', 'No side to argue.'], ['an expository essay', 'Not an explanation.'], ['a formal letter', 'Not a letter.']], 'A day’s events = a story.'],
            ['“Describe your favourite market.” This topic asks for:', 'a descriptive essay', [['a narrative essay', 'Not a story.'], ['an argumentative essay', 'Not an argument.'], ['a speech', 'Not a speech.']], '“Describe” = descriptive.'],
        ], '', 'Read the instruction word: tell, describe, explain or argue.'),
        eng_choose([
            ['Which sentence is the strongest DESCRIPTIVE writing?', 'The market hummed with voices, and the smell of fried akara hung over the stalls.', [['The market was very nice and there were many people buying things.', 'Vague; it tells instead of showing, and uses no senses.'], ['I went to the market on Monday and then I came back home.', 'Narrative, not description.'], ['Markets are important because they help people buy and sell goods.', 'Expository: it explains, it does not describe.']], 'Concrete sensory detail.'],
            ['Which is the best OPENING for a narrative essay?', 'The moment the lights went out, I heard footsteps on the stairs.', [['In this essay, I am going to tell you a story about a dark night.', 'Announces instead of beginning.'], ['Stories are interesting, and everybody likes a good one.', 'Off the point.'], ['Lagos is a big city with many people and cars.', 'Not a narrative hook: a general fact.']], 'Start in the action.'],
            ['In a narrative, which tense usually carries the story?', 'the simple past', [['the future', 'The events already happened.'], ['the present perfect', 'Not for a sequence of past events.'], ['the conditional', 'Not for a real story.']], 'Stories are told in the past.'],
        ], '', 'Show, don’t tell; begin in the action.', 'concept', 40),
        eng_order([
            [['I woke up late on the day of the exam.', 'I ran to the bus stop, but the bus had gone.', 'A neighbour offered me a ride on his motorcycle.', 'I reached the hall just as the papers were handed out.', 'Since then, I have never set my alarm late.'], 'A narrative moves in time order and ends with a reflection.'],
        ], 'Put the events of the story in order.', 'Follow the clock.', 'procedure', 60),
    ],
    'EN-079' => [
        eng_choose([
            ['“Explain how to prepare for an examination.” This topic asks for:', 'an expository essay', [['a narrative essay', 'Not a story.'], ['a descriptive essay', 'Not a picture.'], ['an argumentative essay', 'No side to take.']], 'Explaining a process = expository.'],
            ['“Should students be allowed to use phones in school?” This topic asks for:', 'an argumentative essay', [['an expository essay', 'There is a side to take.'], ['a narrative essay', 'Not a story.'], ['a descriptive essay', 'Not a picture.']], 'A yes/no question to defend = argumentative.'],
            ['In a debate speech, how do you address the audience at the start?', 'Mr Chairman, panel of judges, co-debaters and fellow students…', [['Dear Sir, I write to inform you of my views…', 'A letter opening.'], ['Once upon a time, in a village far away, there lived…', 'A story opening.'], ['Report on the use of phones in our school', 'A report heading.']], 'A debate opens by recognising everyone present.'],
        ], '', 'Explain → expository; take a side → argumentative.'),
        eng_choose([
            ['Which is the best THESIS for an argumentative essay on school uniforms?', 'School uniforms should stay because they reduce pressure on families and build unity.', [['Uniforms are clothes that students wear to school from Monday to Friday.', 'A description: it takes no position.'], ['Some schools have uniforms and others, such as many private ones, do not.', 'A fact, not a thesis.'], ['I have a blue uniform, and I wear it every day to school.', 'Personal, no argument.']], 'A thesis states the side and the reasons.'],
            ['In an expository essay on “how rain forms”, what should the paragraphs follow?', 'the order of the process, step by step', [['the writer’s opinions about the rainy season', 'Exposition explains, it does not argue.'], ['a story about a rainy day', 'That is narrative.'], ['interesting facts in any order', 'Exposition is organised, not a heap of facts.']], 'Process order.'],
            ['Which sentence ANSWERS a counter-argument?', 'Some say uniforms limit freedom, but students still express themselves in their work and clubs.', [['Uniforms are good because they make every student look neat and smart.', 'A reason for, but no counter-argument is answered.'], ['Many people disagree with uniforms, and they say that uniforms limit freedom.', 'Names the other side without answering it.'], ['Uniforms are expensive, and some parents struggle to buy two sets each year.', 'Raises, does not answer, a point.']], 'Name the other view, then answer it.'],
        ], '', 'Thesis, reasons, evidence, answer the other side.', 'reasoning', 45),
        eng_order([
            [['Introduction with your thesis', 'First reason with evidence', 'Second reason with evidence', 'The other side, answered', 'Conclusion restating your position'], 'The standard shape of an argumentative essay.'],
            [['Introduce the process', 'First step', 'Next step', 'Final step', 'Conclusion: why it matters'], 'The shape of an expository “how” essay.'],
        ], 'Put the parts of the essay in order.', 'Introduction first, conclusion last.', 'procedure', 50),
    ],
    'EN-080' => [
        eng_choose([
            ['The ground is wet. It ___ rained last night.', 'must have', [['must', 'For the past, use “must have” + participle.'], ['can’t have', 'The evidence says it did rain.'], ['should', 'Advice, not deduction.']], '“must have” = almost certain about the past.'],
            ['She ___ seen you; she was in Kano all week.', 'can’t have', [['must have', 'The evidence says she was elsewhere.'], ['should have', 'A missed duty, not a deduction.'], ['may', 'Not a past deduction.']], '“can’t have” = sure it did not happen.'],
            ['He isn’t answering. He ___ asleep.', 'might be', [['might have been', 'He is asleep now, not in the past.'], ['can’t have been', 'Past, and too sure.'], ['must have', 'Needs a participle.']], '“might be” = possible now.'],
            ['You ___ told me earlier! Now it is too late.', 'should have', [['must have', 'That is deduction, not criticism.'], ['might', 'Not past.'], ['will have', 'Not criticism.']], '“should have” = it was the right thing, but it did not happen.'],
        ], 'Choose the modal: {q}', 'must have = sure it did; can’t have = sure it didn’t; might have = possibly.'),
        eng_choose([
            ['If I had studied medicine, I ___ a doctor now.', 'would be', [['would have been', 'The result is NOW: would be.'], ['will be', 'This is unreal.'], ['am', 'This is unreal.']], 'Mixed conditional: unreal past condition → present result.'],
            ['If she were more careful, she ___ the money yesterday.', 'wouldn’t have lost', [['wouldn’t lose', 'The result is in the PAST.'], ['won’t have lost', 'This is unreal, so “would”, not “will”.'], ['wouldn’t had lost', '“Would” is followed by “have”, never “had”.']], 'Mixed: present state → past result.'],
            ['If we hadn’t missed the bus, we ___ here now.', 'would be', [['would have been', 'The result is now.'], ['will be', 'Unreal.'], ['were', 'Not the result form.']], 'Past condition, present result.'],
        ], 'Choose the right form: {q}', 'Check the time of the condition and the time of the result separately.', 'reasoning', 45),
        eng_type([
            ['I am sure he left early. → He ___ left early.', 'must have', [], 'Sure about the past: must have.'],
            ['I am sure she did not take it. → She ___ taken it.', 'can’t have', ["can't have", 'cannot have', 'couldn’t have', "couldn't have"], 'Sure it did not happen: can’t have.'],
            ['Perhaps they missed the train. → They ___ missed the train.', 'might have', ['may have', 'could have'], 'Possible: might have.'],
            ['It was a mistake not to call. → You ___ called.', 'should have', ['ought to have'], 'Criticism of the past: should have.'],
        ], 'Type the modal + have: {q}', 'Modal + have + past participle talks about the past.', 'procedure', 35),
    ],
    ];
}
