<?php
declare(strict_types=1);

/**
 * English Lab — Stage 6, Writing Well (EN-051 … EN-060), the summit band. Writing is taught here
 * in the parts that can be marked instantly — a joined sentence, a letter's layout, a topic
 * sentence, a linking word, a cut phrase — because sentence-level practice (sentence combining
 * above all) is the best-evidenced way to improve whole compositions. A judged essay is a later,
 * separate design (docs/LABS.md). Content only, built with the kit. Append-only.
 */
function eng_writing_forms(): array {
    return [
    'EN-051' => [
        eng_choose([
            ['The boy is my cousin. The boy won the prize.', 'The boy who won the prize is my cousin.', [['The boy is my cousin and the boy won the prize.', 'Repeats “the boy”; a relative clause is neater.'], ['The boy who is my cousin, won the prize.', 'A comma must not separate subject and verb.'], ['The boy won the prize, he is my cousin.', 'Two sentences joined by a comma (a comma splice).']], 'A relative clause (who …) joins them without repetition.'],
            ['It was raining. We played the match.', 'Although it was raining, we played the match.', [['It was raining, we played the match.', 'A comma splice.'], ['Because it was raining, we played the match.', '“Because” gives the wrong logic.'], ['It was raining and so we played the match.', '“So” suggests the rain caused the match.']], '“Although” shows the contrast.'],
            ['Kemi finished her homework. Kemi went out to play.', 'After finishing her homework, Kemi went out to play.', [['Kemi finished her homework, Kemi went out to play.', 'A comma splice with repetition.'], ['After finishing her homework, the ball was played by Kemi.', 'The opening must describe Kemi, the subject.'], ['Kemi finished her homework, then went out to play, she was happy.', 'Adds a comma splice.']], 'An -ing opening phrase must refer to the subject that follows.'],
            ['Lagos is a large city. Lagos is on the coast. Lagos is busy.', 'Lagos is a large, busy city on the coast.', [['Lagos is a large city and Lagos is on the coast and Lagos is busy.', 'Repetitive.'], ['Lagos is large, it is on the coast, it is busy.', 'Comma splices.'], ['Lagos, a city, is large, on the coast, busy.', 'Clumsy, and it loses the flow.']], 'Fold the describing words into one noun phrase.'],
        ], 'Which is the best single sentence combining: “{q}”?', 'Avoid repetition and comma splices; show the link between ideas.', 'procedure', 60),
        eng_type([
            ['The man is a doctor. His car was stolen. (use “whose”)', 'The man whose car was stolen is a doctor.', [], '“Whose” joins the owner to the thing owned.'],
            ['She was tired. She kept working. (begin with “Although”)', 'Although she was tired, she kept working.', ['Although she was tired she kept working.'], '“Although” clause, comma, main clause.'],
            ['I visited Kano. I saw the dye pits. (use “where”)', 'I visited Kano, where I saw the dye pits.', ['I visited Kano where I saw the dye pits.'], '“Where” joins a place to what happened there.'],
            ['The rain stopped. The children went outside. (begin with “When”)', 'When the rain stopped, the children went outside.', ['When the rain stopped the children went outside.'], '“When” clause, comma, main clause.'],
        ], 'Combine into one sentence: {q}', 'Use the word given, and do not repeat the shared noun.', 'procedure', 70),
        eng_spot([
            [['I was late,', 'the bus', 'broke down', 'on the way.'], 0, 'I was late because', 'Two sentences joined only by a comma (a comma splice): join them with a word.'],
            [['The job needs', 'patience,', 'skill and', 'to be honest.'], 3, 'honesty.', 'Items in a list should match in form: patience, skill and honesty.'],
            [['She likes', 'singing, dancing', 'and to read', 'novels.'], 2, 'and reading', 'Items in a list should match: singing, dancing and reading.'],
        ], 'Check how the parts of the sentence join.'),
    ],
    'EN-052' => [
        eng_choose([
            ['How should a formal letter to “Dear Sir” end?', 'Yours faithfully,', [['Yours sincerely,', 'Used when you name the person (Dear Mrs Adeyemi).'], ['Your loving son,', 'Informal.'], ['Bye for now,', 'Informal.']], '“Dear Sir/Madam” → “Yours faithfully”.'],
            ['How should a formal letter to “Dear Mr Okeke” end?', 'Yours sincerely,', [['Yours faithfully,', 'Used when you do NOT name the person.'], ['Yours truly loving,', 'Not a standard ending.'], ['Cheers,', 'Informal.']], 'A named addressee → “Yours sincerely”.'],
            ['In a formal letter, whose address goes at the top right?', 'the writer’s', [['the receiver’s', 'The receiver’s address goes on the left, below.'], ['nobody’s', 'Formal letters carry both addresses.'], ['the post office’s', 'Not used.']], 'The writer’s address is at the top right.'],
            ['Where does the receiver’s address go in a formal letter?', 'on the left, below the writer’s address and date', [['at the top right', 'That is the writer’s address.'], ['at the bottom', 'Not standard.'], ['it is left out', 'A formal letter includes it.']], 'Receiver’s address: left side, below.'],
            ['What comes right after the salutation in a formal letter?', 'a heading (title) stating the subject', [['the date', 'The date is near the top.'], ['the signature', 'The signature is at the end.'], ['a greeting to the family', 'That belongs in an informal letter.']], 'A formal letter has a heading after “Dear Sir,”.'],
        ], '', 'Formal letters have two addresses, a date, a salutation, a heading and a matching ending.'),
        eng_order([
            [['writer’s address', 'date', 'receiver’s address', 'salutation', 'heading', 'body', 'complimentary close', 'signature and name'], 'This is the standard order of a formal letter.'],
            [['Dear Sir,', 'APPLICATION FOR THE POST OF CLASS PREFECT', 'I wish to apply for the post of class prefect.', 'Yours faithfully,'], 'Salutation, heading, opening line, close.'],
        ], 'Put the parts of the formal letter in order.', 'Start at the top of the page.', 'procedure', 70),
        eng_spot([
            [['Dear Sir,', 'I am writing to request a transfer.', 'Thanks a lot and see you soon,', 'Yours faithfully,'], 2, 'Thank you for considering my request.', 'Chatty phrases do not belong in a formal letter.'],
            [['Dear Mrs Bello,', 'I write to complain about the noise.', 'I hope you will act quickly.', 'Yours faithfully,'], 3, 'Yours sincerely,', 'A named addressee takes “Yours sincerely”.'],
            [['Dear Sir,', 'how are you and your family?', 'I write to request a meeting.', 'Yours faithfully,'], 1, '', 'Greetings to the family belong in an informal letter.'],
        ], 'Which line breaks the rules of a formal letter?'),
    ],
    'EN-053' => [
        eng_choose([
            ['How many addresses does an informal letter to a friend usually carry?', 'one — the writer’s', [['two', 'Only formal letters carry the receiver’s address.'], ['none', 'The writer’s address is included.'], ['three', 'Not standard.']], 'An informal letter carries only the writer’s address and the date.'],
            ['Which salutation suits a letter to your cousin?', 'Dear Ifeoma,', [['Dear Sir,', 'Formal.'], ['To whom it may concern,', 'Formal.'], ['Dear Madam,', 'Formal.']], 'A friendly letter uses the person’s name.'],
            ['Which ending suits a letter to your best friend?', 'Your friend,', [['Yours faithfully,', 'Formal.'], ['Yours sincerely, Principal', 'Formal.'], ['Respectfully submitted,', 'Formal.']], 'Informal endings: Your friend, Yours affectionately, With love.'],
            ['Does an informal letter need a heading (title)?', 'no', [['yes, in capitals', 'Headings are for formal letters.'], ['yes, underlined', 'Headings are for formal letters.'], ['only at the end', 'Not standard.']], 'No heading in an informal letter.'],
        ], '', 'Friendly letters are warmer and simpler in layout.'),
        eng_choose([
            ['Which opening suits a letter to a friend?', 'It has been a while! I hope you and your family are well.', [['I write to inform you of my decision.', 'Formal.'], ['With reference to your letter dated 3rd June…', 'Formal.'], ['Sir, I humbly request…', 'Formal.']], 'Informal letters open warmly.'],
            ['Which closing paragraph suits a letter to a friend?', 'Greet everyone at home for me. Write back soon!', [['I look forward to your favourable reply.', 'Formal.'], ['Thank you for your anticipated cooperation.', 'Formal.'], ['Kindly treat as urgent.', 'Formal.']], 'Informal letters close warmly.'],
        ], '', 'Warm, personal, but still correct English.', 'concept', 35),
        eng_spot([
            [['Dear Tunde,', 'APPLICATION FOR FRIENDSHIP', 'how is school?', 'Your friend, Bayo'], 1, '', 'An informal letter has no heading.'],
            [['Dear Amaka,', 'I miss you so much!', 'Write back soon.', 'Yours faithfully,'], 3, 'Your friend,', 'A friendly letter ends warmly, not formally.'],
        ], 'Informal letters drop the formal parts.'),
    ],
    'EN-054' => [
        eng_choose([
            ['Which is the best topic sentence for a paragraph about why students should learn to cook?', 'Learning to cook gives students skills they will use for life.', [['I made rice yesterday.', 'An anecdote, not a topic sentence.'], ['Cooking.', 'Not a sentence.'], ['Some people cook and some people do not.', 'Says nothing arguable.']], 'A topic sentence states the paragraph’s point.'],
            ['Which is the best topic sentence for a paragraph about the dangers of social media?', 'Social media can harm young people’s sleep, focus and self-esteem.', [['I have three social media accounts.', 'An anecdote.'], ['Social media is a thing on phones.', 'Vague.'], ['Many people use phones.', 'Off the point.']], 'It names the topic and the claim.'],
            ['Which is the best topic sentence for a paragraph about keeping the school clean?', 'A clean school is healthier and pleasanter for everyone.', [['There was paper on the floor today.', 'A detail.'], ['Schools have floors.', 'Off the point.'], ['Cleaning.', 'Not a sentence.']], 'States the paragraph’s main claim.'],
        ], '', 'A topic sentence says what the paragraph will prove.', 'concept', 40),
        eng_choose([
            ['Topic: “Trees help our environment.” Which sentence does NOT belong in this paragraph?', 'My favourite fruit is the mango.', [['Trees give shade on hot days.', 'Supports the topic.'], ['Their roots stop soil erosion.', 'Supports the topic.'], ['They take in carbon dioxide.', 'Supports the topic.']], 'Every sentence must support the topic sentence.'],
            ['Topic: “Breakfast is the most important meal.” Which sentence does NOT belong?', 'My uncle lives in Ilorin.', [['It gives energy for the morning.', 'Supports.'], ['Students who eat breakfast concentrate better.', 'Supports.'], ['Skipping it can cause tiredness.', 'Supports.']], 'Remove anything off the topic.'],
            ['Topic: “Reading improves vocabulary.” Which sentence does NOT belong?', 'Football is popular in Nigeria.', [['Readers meet new words in context.', 'Supports.'], ['They learn how words are used.', 'Supports.'], ['Their spelling also improves.', 'Related support.']], 'Unity: one idea per paragraph.'],
        ], '', 'Unity: every sentence supports one idea.', 'reasoning', 40),
        eng_order([
            [['Exercise is good for young people.', 'It strengthens the heart and muscles.', 'It also reduces stress before exams.', 'For these reasons, every student should exercise.'], 'Topic sentence, supporting points, concluding sentence.'],
            [['Our town needs a library.', 'Students have nowhere quiet to study.', 'Books are too costly for many families.', 'A library would solve both problems.'], 'Claim, reasons, conclusion.'],
        ], 'Put the sentences in order to make a paragraph.', 'Start with the topic sentence; end with the conclusion.', 'reasoning', 70),
    ],
    'EN-055' => [
        eng_choose([
            ['The plan was cheap. ___, it was quick to carry out.', 'Moreover', [['However', '“However” shows contrast; this adds a point.'], ['Therefore', '“Therefore” shows result.'], ['Instead', '“Instead” shows replacement.']], '“Moreover” adds a further point.'],
            ['The road was flooded. ___, the match was postponed.', 'Therefore', [['However', 'This is a result, not a contrast.'], ['Moreover', 'This is a result, not an addition.'], ['For example', 'Not an example.']], '“Therefore” introduces a result.'],
            ['He trained every day. ___, he did not win.', 'However', [['Therefore', 'Not a result.'], ['Furthermore', 'Not an addition.'], ['Similarly', 'Not a comparison.']], '“However” introduces a contrast.'],
            ['Many fruits are rich in vitamins. ___, oranges contain vitamin C.', 'For example', [['However', 'No contrast.'], ['Therefore', 'Not a result.'], ['In conclusion', 'Not a conclusion.']], '“For example” introduces an example.'],
            ['___, the evidence shows that reading improves results.', 'In conclusion', [['For example', 'This sums up.'], ['However', 'No contrast.'], ['Firstly', 'This ends, not begins.']], '“In conclusion” sums up.'],
            ['Cars pollute the air. ___, motorcycles do too.', 'Similarly', [['However', 'No contrast.'], ['Therefore', 'Not a result.'], ['For instance', 'Not an example of the first claim.']], '“Similarly” makes a comparison.'],
        ], 'Choose the linking word: {q}', 'Adding, contrasting, concluding, giving an example or a result?'),
        eng_choose([
            ['Which linking word shows CONTRAST?', 'nevertheless', [['furthermore', 'Adds.'], ['consequently', 'Result.'], ['firstly', 'Sequence.']], 'Nevertheless = however.'],
            ['Which linking word shows RESULT?', 'consequently', [['nevertheless', 'Contrast.'], ['in addition', 'Adds.'], ['for instance', 'Example.']], 'Consequently = as a result.'],
            ['Which linking word ADDS a point?', 'furthermore', [['however', 'Contrast.'], ['thus', 'Result.'], ['finally', 'Sequence/ending.']], 'Furthermore = in addition.'],
        ], '', 'Learn the linking words by job.', 'concept', 25),
        eng_type([
            ['We wanted to go out; ___, it was raining. (contrast)', 'however', ['but', 'nevertheless'], 'Contrast: however.'],
            ['She studied hard; ___, she passed. (result)', 'therefore', ['consequently', 'so', 'thus', 'as a result'], 'Result: therefore.'],
            ['The food was tasty; ___, it was cheap. (addition)', 'moreover', ['furthermore', 'in addition', 'also', 'besides'], 'Addition: moreover.'],
        ], 'Type a linking word: {q}', 'Match the job of the word.', 'procedure', 25),
    ],
    'EN-056' => [
        eng_choose([
            ['Which is the most concise?', 'Please reply soon.', [['Please reply at your earliest convenience as soon as possible.', 'Repeats itself.'], ['Kindly be so good as to reply soon, please.', 'Wordy.'], ['I am writing to ask you to please reply soon if you can.', 'Wordy.']], 'Say it once, plainly.'],
            ['Which is the most concise?', 'They cooperated.', [['They cooperated together.', '“Together” repeats “co-”.'], ['They mutually cooperated together.', 'Doubly repetitive.'], ['They did cooperate with each other together.', 'Wordy.']], '“Cooperate” already means “work together”.'],
            ['Which is the most concise?', 'The meeting is at noon.', [['The meeting is at 12 noon in the afternoon.', '“Noon” already means midday.'], ['The meeting will take place at noon time.', 'Wordy.'], ['At noon is when the meeting is.', 'Awkward.']], 'Cut the repetition.'],
            ['Which is the most concise?', 'We must revert.', [['We must revert back.', '“Revert” already means go back.'], ['We must go back and revert.', 'Repeats.'], ['We must revert back again.', 'Repeats twice.']], 'Revert = go back; “back” is redundant.'],
        ], '', 'Cut words that repeat a meaning already there.'),
        eng_type([
            ['return back', 'return', [], '“Return” already means go back.'], ['repeat again', 'repeat', [], '“Repeat” already means do again.'],
            ['free gift', 'gift', [], 'A gift is free.'], ['past history', 'history', [], 'History is the past.'], ['final end', 'end', [], 'An end is final.'],
            ['each and every', 'each', ['every'], 'One of the two words is enough.'], ['in close proximity', 'near', ['close'], '“Near” says it in one word.'],
        ], 'Cut the repetition — type the shorter form of “{q}”.', 'One word already carries the meaning.', 'procedure', 25),
        eng_spot([
            [['The reason why', 'I was absent', 'is because', 'I was ill.'], 2, 'is that', '“The reason … is because” repeats the idea of cause: say “The reason is that…”.'],
            [['Both of them', 'were', 'equally alike', 'in height.'], 2, 'alike', '“Equally alike” repeats itself.'],
            [['He', 'entered', 'inside', 'the hall.'], 2, '', '“Entered” already means went inside.'],
        ], 'Find the words that repeat a meaning.'),
    ],
    'EN-057' => [
        eng_choose([
            ['Please ___ me your pen.', 'lend', [['borrow', 'You borrow FROM someone; they lend TO you.'], ['give borrow', 'Not English.'], ['loan me out', 'Not standard.']], 'Lend = give for a while; borrow = take for a while.'],
            ['I will ___ you at the gate.', 'meet', [['meet with you', '“Meet you” is enough here.'], ['see you up', 'Not standard.'], ['branch you', 'Pidgin, not standard English.']], 'Meet someone.'],
            ['We ___ the matter at the meeting.', 'discussed', [['discussed about', '“Discuss” takes no “about”.'], ['discussed on', 'No preposition.'], ['made discussion on about', 'Wordy and wrong.']], 'Discuss something (no “about”).'],
            ['She is ___ me in the class.', 'senior to', [['senior than', 'Senior and junior take “to”.'], ['more senior than', 'Use “senior to”.'], ['senior of', 'Not standard.']], 'Senior to, junior to, superior to.'],
            ['The room is very ___ .', 'spacious', [['spacy', 'Not standard for a room.'], ['roomy-roomy', 'Not standard.'], ['spaceful', 'Not a word.']], 'A big room is spacious.'],
            ['I have been here ___ two hours.', 'for', [['since', '“Since” needs a starting point (since 2 o’clock).'], ['from', 'Needs “till”.'], ['during', 'Not with a length of time here.']], 'For + a length of time.'],
        ], 'Choose the standard English: {q}', 'Some expressions common in speech are not standard in writing.'),
        eng_spot([
            [['He', 'borrowed me', 'his bicycle', 'yesterday.'], 1, 'lent me', 'You borrow FROM someone; he LENT you his bicycle.'],
            [['Please', 'on', 'the fan;', 'it is hot.'], 1, 'switch on', '“On” is not a verb.'],
            [['The', 'two', 'of us', 'are same age.'], 3, 'are the same age.', '“Same” needs “the”: the same age.'],
            [['I', 'am', 'having', 'three brothers.'], 2, 'have', '“Have” for possession is not used in the continuous: I have three brothers.'],
        ], 'Watch borrow/lend, on/off as verbs, and “having” for possession.'),
        eng_type([
            ['“I am coming” said when leaving briefly → standard:', 'I will be back soon.', ['I’ll be back soon.', 'I will be right back.', 'I’ll be right back.'], 'In standard English, “I am coming” means you are on your way here.'],
            ['“Off the light.” → standard:', 'Switch off the light.', ['Turn off the light.', 'Put off the light.'], '“Off” is not a verb.'],
            ['“He is my senior brother.” → standard:', 'He is my elder brother.', ['He is my older brother.'], '“Elder” or “older” brother, not “senior” brother.'],
        ], 'Rewrite in standard English: {q}', 'Use the verb, not the particle.', 'procedure', 50),
    ],
    'EN-058' => [
        eng_choose([
            ['Which sentence uses the semicolon correctly?', 'I love reading; my brother prefers football.', [['I love; reading my brother prefers football.', 'A semicolon joins two complete sentences.'], ['I love reading; and my brother prefers football.', 'Do not use “and” after a semicolon.'], ['I love reading my; brother prefers football.', 'Wrong place.']], 'A semicolon joins two closely related complete sentences.'],
            ['Which sentence uses the colon correctly?', 'Bring three things: a pen, a ruler and an eraser.', [['Bring: three things a pen, a ruler and an eraser.', 'The colon comes after the complete clause.'], ['Bring three: things, a pen, a ruler and an eraser.', 'Wrong place.'], ['Bring three things, a pen: a ruler and an eraser.', 'Wrong place.']], 'A colon introduces a list after a complete clause.'],
            ['Which sentence uses the dash correctly?', 'He opened the box — it was empty.', [['He — opened the box it was empty.', 'Wrong place.'], ['He opened — the box it was empty.', 'Wrong place.'], ['He opened the box it — was empty.', 'Wrong place.']], 'A dash marks a sudden turn or added point.'],
        ], '', 'Semicolon: two related sentences. Colon: what follows explains or lists.', 'concept', 40),
        eng_choose([
            ['Some students walk to school ___ others take the bus.', ';', [[':', 'A colon introduces an explanation or a list; these are two balanced statements.'], [',', 'A comma alone cannot join two sentences.'], ['?', 'It is not a question.']], 'Two balanced, related sentences: a semicolon.'],
            ['You need one thing to succeed ___ hard work.', ':', [[';', 'What follows is not a complete sentence.'], [',', 'A colon introduces the explanation more clearly.'], ['?', 'Not a question.']], 'A colon introduces the thing promised.'],
            ['We visited three cities ___ Kano, Jos and Calabar.', ':', [[';', 'A list is introduced by a colon.'], ['—', 'Possible informally, but a colon is standard before a list.'], ['?', 'Not a question.']], 'A colon introduces a list.'],
        ], 'Which mark fills the gap? {q}', 'Semicolon joins; colon introduces.'),
        eng_spot([
            [['I wanted to go,', 'however,', 'it was too late', 'to catch the bus.'], 0, 'I wanted to go;', 'Before “however” joining two sentences, use a semicolon, not a comma.'],
            [['The list', 'included:', 'books, pens', 'and bags.'], 1, 'included', 'No colon directly after a verb that is introducing its own object.'],
        ], 'Commas cannot join two sentences.'),
    ],
    'EN-059' => [
        eng_choose([
            ['A report to your principal on a school trip should be written in:', 'a formal, factual style with a title and clear sections', [['a chatty style with jokes', 'Too informal.'], ['the style of a poem', 'Not suitable.'], ['text-message abbreviations', 'Not suitable.']], 'Reports are formal and factual.'],
            ['A speech to your classmates should:', 'address the audience directly and stay engaging', [['have two addresses at the top', 'That is a letter.'], ['end with “Yours faithfully”', 'That is a letter.'], ['be written in note form', 'A speech is delivered in full sentences.']], 'Speeches address the audience (“Fellow students…”).'],
            ['An article for a school magazine should have:', 'a catchy title and the writer’s name', [['two addresses', 'That is a letter.'], ['a salutation like “Dear Sir”', 'That is a letter.'], ['a date at the top right', 'That is a letter.']], 'Articles have a title and a byline.'],
            ['Which opening suits a speech at a prize-giving day?', 'The Principal, distinguished guests, fellow students: good morning.', [['Dear Sir,', 'A letter opening.'], ['TITLE: A REPORT ON THE PRIZE-GIVING', 'A report heading.'], ['Hi guys, what’s up?', 'Too informal for the occasion.']], 'A speech opens by recognising the audience.'],
        ], '', 'Match the format to the occasion and the reader.'),
        eng_choose([
            ['You are writing to a newspaper editor about bad roads. Which form?', 'a formal letter', [['an informal letter', 'The editor is not a friend.'], ['a diary entry', 'Not sent to anyone.'], ['a poem', 'Not suitable.']], 'Letters to editors are formal.'],
            ['You are telling your aunt about your new school. Which form?', 'an informal letter', [['a formal letter', 'Too stiff for family.'], ['a report', 'Not suitable.'], ['a speech', 'Not suitable.']], 'Family: informal letter.'],
            ['You are telling the class why littering should stop. Which form?', 'a speech', [['a formal letter', 'You are addressing listeners.'], ['an informal letter', 'Not suitable.'], ['a diary entry', 'Private.']], 'Addressing an audience: speech.'],
        ], '', 'Who reads (or hears) it, and why?', 'concept', 30),
        eng_spot([
            [['REPORT ON THE INTER-HOUSE SPORTS', 'The event held on Friday.', 'It was like, super lit!', 'Prizes were presented at noon.'], 2, 'It was very successful.', 'A report is formal and factual: no slang.'],
            [['Fellow students,', 'I stand before you', 'to speak about cleanliness.', 'Yours faithfully,'], 3, 'Thank you for listening.', 'A speech ends by thanking the audience, not with a letter’s close.'],
        ], 'Which line does not suit the occasion?'),
    ],
    'EN-060' => [
        eng_choose([
            ['Which is a CLAIM (the writer’s main point)?', 'Schools should provide free lunch.', [['Many pupils skip breakfast.', 'Evidence.'], ['A study found hungry pupils score lower.', 'Evidence.'], ['For example, in our class, five pupils skipped breakfast today.', 'An example.']], 'A claim is what the writer wants you to accept.'],
            ['Which is EVIDENCE for the claim “Reading daily improves vocabulary”?', 'Students who read for 20 minutes a day learned more new words in a term than those who did not.', [['Reading is fun.', 'An opinion, not evidence.'], ['Everyone should read.', 'Another claim.'], ['Books are sold in shops.', 'Irrelevant.']], 'Evidence is information that supports the claim.'],
            ['Which is a COUNTER-ARGUMENT to “Phones should be banned in school”?', 'Phones can be used for research and emergencies.', [['Phones distract students.', 'Supports the claim.'], ['Phones are expensive.', 'Off the point.'], ['Phones should be banned.', 'The claim itself.']], 'A counter-argument is a reason on the other side.'],
        ], '', 'Claim → reasons → evidence → answer the other side.', 'reasoning', 45),
        eng_choose([
            ['“Everyone I know likes Afrobeats, so it must be the best music.” What is wrong with this argument?', 'It generalises from too few people.', [['It uses evidence from a study.', 'It does not.'], ['It considers the other side.', 'It does not.'], ['Nothing; it is a strong argument.', 'Liking something is not proof it is best.']], 'A hasty generalisation from a small group.'],
            ['“You can’t trust his idea about the school farm — he failed mathematics.” What is wrong?', 'It attacks the person instead of the idea.', [['It uses statistics.', 'It does not.'], ['It gives an example.', 'Not the flaw.'], ['Nothing; it is fair.', 'His maths grade says nothing about the farm idea.']], 'An attack on the person (ad hominem), not the argument.'],
            ['“Either we ban phones completely or students will fail.” What is wrong?', 'It offers only two options when there are others.', [['It is too short.', 'Not the flaw.'], ['It uses a linking word.', 'Not the flaw.'], ['Nothing; it is logical.', 'There are middle options (rules for phone use).']], 'A false choice (false dilemma).'],
        ], '', 'Look for weak reasoning, not just disagreement.', 'reasoning', 50),
        eng_order([
            [['Schools should start later in the morning.', 'Teenagers naturally fall asleep later at night.', 'Studies show that tired students learn less.', 'Some say this will shorten the school day, but the timetable can be adjusted.', 'Therefore, a later start would improve learning.'], 'Claim, reason, evidence, counter-argument answered, conclusion.'],
            [['Our community should plant more trees.', 'Trees cool the air and give shade.', 'Areas with trees record lower temperatures.', 'Some worry about cost, but seedlings are cheap.', 'Planting trees is a small cost for a large benefit.'], 'Claim, reason, evidence, rebuttal, conclusion.'],
        ], 'Put the parts of the argument in order.', 'Claim first, conclusion last; answer the other side before concluding.', 'reasoning', 80),
    ],
    ];
}
