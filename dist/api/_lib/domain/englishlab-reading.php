<?php
declare(strict_types=1);

/**
 * English Lab — Stage 5, Reading and Meaning (EN-041 … EN-050). Every passage here is our own,
 * short enough to read on a phone, and set somewhere a Nigerian learner will recognise. Content
 * only, built with the kit. Append-only.
 */
function eng_reading_forms(): array {
    // The passages live in the shared bank (eng_passage(), englishlab-kit.php).
    $P = array_combine($k = ['market', 'water', 'phone', 'reading', 'harmattan'], array_map('eng_passage', $k));
    return [
    'EN-041' => [
        eng_choose([
            [$P['market'], 'The market is busy in the morning and empties as the day goes on.', [['Traders unload tomatoes and bread early in the morning.', 'A detail, not the main idea.'], ['Buyers argue cheerfully with traders over prices.', 'A detail.'], ['Sweepers work at night.', 'A detail from the last sentence.']], 'The passage follows the market from busy morning to empty evening.'],
            [$P['water'], 'The new borehole has improved life in the village.', [['The stream is a long two-hour walk from the village.', 'A detail about the past.'], ['The clinic treats typhoid.', 'A detail used as evidence.'], ['Girls now arrive at school before the first bell.', 'Part of the evidence, not the whole point.']], 'Every detail shows what the borehole changed.'],
            [$P['phone'], 'Phones help farmers get better prices for their crops.', [['A farmer in Benue sends her yams to market.', 'A detail of the example.'], ['Middlemen are dishonest.', 'The passage does not say that.'], ['Farmers can call three markets to compare prices.', 'A detail of the example.']], 'The example of the Benue farmer supports the main idea in the first sentence.'],
            [$P['reading'], 'One good book turned Uche into a reader.', [['Uche’s uncle once sailed down the Niger.', 'Not stated: the boy in the novel sailed, not the uncle.'], ['Books are sold near motor parks.', 'A detail.'], ['Uche reads fast.', 'A detail, not the point.']], 'The passage shows Uche changing from not liking books to buying them.'],
        ], 'Read the passage. What is its main idea? “{q}”', 'The main idea is what ALL the sentences are about.', 'concept', 60),
        eng_choose([
            ['Which sentence is the TOPIC sentence? “(1) Exercise keeps the body healthy. (2) It strengthens the heart. (3) It builds muscle. (4) It also helps us sleep.”', 'Sentence 1', [['Sentence 2', 'A supporting detail.'], ['Sentence 3', 'A supporting detail.'], ['Sentence 4', 'A supporting detail.']], 'The first sentence states the idea the others support.'],
            ['Which sentence is the TOPIC sentence? “(1) Many shops close early. (2) Streets are dark. (3) Families stay indoors. (4) Power cuts change how a town lives at night.”', 'Sentence 4', [['Sentence 1', 'An example.'], ['Sentence 2', 'An example.'], ['Sentence 3', 'An example.']], 'Here the topic sentence comes last, summing up the examples.'],
            ['Which sentence is the TOPIC sentence? “(1) Lagos traffic wastes hours each day. (2) Workers leave home before dawn. (3) Many arrive tired. (4) Some sleep in their cars.”', 'Sentence 1', [['Sentence 2', 'A result of the traffic.'], ['Sentence 3', 'A result.'], ['Sentence 4', 'A result.']], 'The first sentence is the claim; the rest show it.'],
        ], '', 'Which sentence could be the title of the paragraph?', 'concept', 45),
        eng_choose([
            [$P['harmattan'], 'The harmattan', [['The sky', 'A detail.'], ['Cold mornings', 'A detail.'], ['Cleaning tables', 'A detail.']], 'Everything in the passage is an effect of the harmattan.'],
            [$P['phone'], 'Phones and farmers', [['Yams', 'A detail.'], ['Middlemen and prices', 'A detail.'], ['Yams in Benue', 'A detail.']], 'The passage is about phones helping farmers.'],
            [$P['market'], 'A day at the market', [['Bread', 'A detail.'], ['Sweepers at dusk', 'A detail.'], ['Bread and tomatoes', 'A detail.']], 'The passage follows the market through a day.'],
        ], 'Which is the best title for this passage? “{q}”', 'A title names the whole passage, not one detail.', 'concept', 50),
    ],
    'EN-042' => [
        eng_choose([
            [$P['water'] . ' — Why do the girls now arrive before the bell?', 'They no longer spend the morning fetching water.', [['The school bell rings later now.', 'Nothing says the bell changed.'], ['They now live much closer to the school.', 'They did not move.'], ['The clinic opens earlier.', 'The clinic is about typhoid, not lateness.']], 'The two-hour walk for water used to make them late; the borehole ended it.'],
            [$P['reading'] . ' — What can we tell about Uche’s uncle?', 'He knew what kind of story Uche might enjoy.', [['He owns a bookshop near the motor park.', 'Not stated.'], ['He sails boats on the Niger.', 'The novel is about sailing, not the uncle.'], ['He does not like Uche.', 'A gift suggests the opposite.']], 'He chose a book that won Uche over.'],
            [$P['harmattan'] . ' — Why is the dust wiped “no matter how often”?', 'The dust keeps returning while the harmattan lasts.', [['The cleaners are lazy.', 'Not suggested.'], ['The tables are old and hard to keep clean.', 'Not stated.'], ['It only rains in the morning.', 'Not stated.']], '“No matter how often” tells us wiping cannot keep up.'],
            [$P['phone'] . ' — Who probably loses out because of the phones?', 'middlemen who paid farmers low prices', [['the farmers who call three markets', 'They gain.'], ['the markets that buy the yams', 'They get more yams.'], ['the yams', 'Not a person.']], 'If farmers no longer accept the middleman’s price, the middleman loses.'],
        ], 'Read and answer: {q}', 'An inference is not written down, but the text supports it.', 'reasoning', 60),
        eng_choose([
            ['“Ada slammed the door, threw her bag on the bed and refused to come down for dinner.” How does Ada feel?', 'upset', [['hungry', 'She refused dinner.'], ['excited', 'Slamming and refusing suggest anger.'], ['sleepy', 'Nothing suggests tiredness.']], 'Her actions show anger or upset.'],
            ['“The streets were wet, people carried umbrellas, and the gutters were overflowing.” What has happened?', 'It has been raining heavily.', [['There was a fire.', 'Nothing suggests fire.'], ['It is the harmattan.', 'The harmattan is dry.'], ['A pipe burst in one house.', 'The whole street is wet.']], 'Wet streets, umbrellas and full gutters all point to rain.'],
            ['“Mr Eze checked his watch for the tenth time and tapped his foot.” How does Mr Eze feel?', 'impatient', [['relaxed', 'Tapping and checking the time suggest the opposite.'], ['proud', 'Nothing suggests pride.'], ['amused', 'Nothing suggests amusement.']], 'Repeated time-checking and tapping show impatience.'],
        ], '', 'Look at what people DO, then ask what it shows.', 'reasoning', 45),
        eng_choose([
            ['A notice reads: “Wet paint. Please use the side door.” What can you infer?', 'The main door has just been painted.', [['The side door has just been painted.', 'You are told to use it, so it must be the dry one.'], ['The building is closed for the day.', 'A door is still open to you.'], ['Painting is forbidden.', 'Painting has been done.']], 'You are directed away from fresh paint.'],
            ['“Take your umbrella,” said Mama, looking at the dark clouds. What does Mama expect?', 'that it will rain', [['that it will be sunny', 'Dark clouds suggest rain.'], ['that you will lose the umbrella', 'Not suggested.'], ['that it will be cold', 'Not stated.']], 'Dark clouds plus the umbrella suggest rain.'],
            ['The shop’s shelves were empty and a sign said “Closing down sale — last day.” What can you infer?', 'The shop is going out of business.', [['The shop is very popular.', 'Possible, but the sign says it is closing.'], ['The shop is opening tomorrow.', 'The opposite.'], ['The shop sells shelves.', 'Not suggested.']], '“Closing down” and “last day” say it is ending.'],
        ], '', 'Combine the clues.', 'reasoning', 40),
    ],
    'EN-043' => [
        eng_choose([
            ['“The new law will curb the sale of fake drugs.” In this sentence, “curb” means:', 'restrict', [['increase', 'The opposite.'], ['the edge of a road', 'A different meaning of the word; it does not fit a law.'], ['announce', 'Not the meaning.']], 'A law curbs (restricts) something.'],
            ['“The teacher’s remarks were brief but pointed.” “Pointed” means:', 'clear and direct', [['sharp at the end', 'The physical meaning does not fit remarks.'], ['rude', 'Not necessarily.'], ['long', 'They were brief.']], '“Pointed” remarks go straight to the point.'],
            ['“After the long drought, the rain was a welcome relief.” “Drought” means:', 'a long period without rain', [['a season of heavy floods', 'The opposite.'], ['a cold and windy season', 'Not the meaning.'], ['a strong wind', 'Not the meaning.']], 'The rain ended the drought, so a drought is a lack of rain.'],
            ['“The witness gave a candid account of what he saw.” “Candid” means:', 'honest', [['secret', 'The opposite.'], ['sweet', '“Candy” is a false friend.'], ['long', 'Not the meaning.']], 'A candid account is frank and honest.'],
            ['“The bridge is so fragile that heavy trucks are banned.” “Fragile” means:', 'easily broken', [['very strong', 'Then trucks would be allowed.'], ['very long', 'Not the meaning.'], ['newly built', 'Not the meaning.']], 'Trucks are banned because it could break.'],
        ], '{q}', 'Use the rest of the sentence to work out the meaning.', 'concept', 40),
        eng_choose([
            ['“The road was so narrow that two cars could not pass.” The clue to “narrow” is:', 'two cars could not pass', [['The road was so narrow', 'That names the road and the word itself; it explains nothing.'], ['so', 'Only an intensifier.'], ['was', 'Only the verb.']], 'Cars unable to pass shows narrowness.'],
            ['“Unlike his talkative brother, Femi was taciturn.” The clue to “taciturn” is:', 'Unlike his talkative brother', [['Femi was taciturn', 'That is the sentence using the word, not the clue.'], ['was', 'Only the verb.'], ['talkative brother, Femi', 'Part of the clue, but without “unlike” you cannot tell the words are opposites.']], '“Unlike talkative” tells us taciturn means quiet.'],
            ['“The medicine alleviated the pain, and she slept soundly.” The clue to “alleviated” is:', 'she slept soundly', [['The medicine', 'Names the cause, not the effect.'], ['alleviated the pain', 'The word itself and what it acted on; it does not show the result.'], ['and', 'Only a joining word.']], 'Sleeping soundly shows the pain was eased.'],
        ], '', 'Look for contrast words (unlike, but) and results.', 'reasoning', 40),
        eng_type([
            ['“Hot water expands; cold water ___.” (the opposite of “expands”)', 'contracts', ['shrinks'], 'Opposite of expand: contract.'],
            ['“He is not lazy; in fact he is very ___.” (hard-working, one word beginning with “i”)', 'industrious', [], '“In fact” signals the opposite of lazy: industrious.'],
            ['“The food was bland — it had no ___.” (taste)', 'flavour', ['flavor', 'taste'], 'Bland food lacks flavour.'],
            ['“She was elated, overjoyed at the result.” Type a one-word synonym of “elated”.', 'happy', ['overjoyed', 'joyful', 'delighted', 'thrilled'], '“Overjoyed” defines elated: very happy.'],
        ], '{q}', 'The sentence explains the word for you.', 'procedure', 40),
    ],
    'EN-044' => [
        eng_choose([
            ['Abuja is the capital of Nigeria.', 'fact', [['opinion', 'It can be checked and is true.'], ['neither', 'It is a statement that can be checked.'], ['both', 'It contains no judgement.']], 'A fact can be checked.'],
            ['Jollof rice is the best food in the world.', 'opinion', [['fact', '“Best” is a judgement; people disagree.'], ['neither', 'It is a judgement.'], ['both', 'It cannot be checked.']], '“Best” is a judgement word: an opinion.'],
            ['The River Niger flows into the Atlantic Ocean.', 'fact', [['opinion', 'It can be checked on any map.'], ['neither', 'It is a checkable statement.'], ['both', 'No judgement.']], 'A checkable statement: fact.'],
            ['Football is more exciting than basketball.', 'opinion', [['fact', '“More exciting” depends on the person.'], ['neither', 'It is a judgement.'], ['both', 'It cannot be proved.']], 'A comparison of taste: opinion.'],
            ['Water freezes at 0 °C.', 'fact', [['opinion', 'It can be measured.'], ['neither', 'It is a checkable statement.'], ['both', 'No judgement.']], 'Measurable: fact.'],
            ['Our school has the friendliest teachers.', 'opinion', [['fact', '“Friendliest” is a judgement.'], ['neither', 'It is a judgement.'], ['both', 'It cannot be checked.']], 'Judgement word: opinion.'],
        ], 'Fact or opinion? “{q}”', 'A fact can be checked; an opinion is someone’s judgement.'),
        eng_choose([
            ['Which word signals an opinion? “I believe the new library is a wonderful addition to the town.”', 'wonderful', [['library', 'A noun naming a thing.'], ['town', 'A noun.'], ['addition', 'A noun.']], '“Wonderful” is a judgement word (and “I believe” signals opinion).'],
            ['Which word signals an opinion? “The match, which ended 2–1, was the most boring game of the season.”', 'boring', [['ended', 'A fact about the result.'], ['season', 'A noun.'], ['2–1', 'A checkable score.']], '“Boring” is a judgement.'],
            ['Which word signals an opinion? “Sadly, the bridge, built in 1975, should be replaced.”', 'should', [['built', 'A checkable fact.'], ['1975', 'A checkable date.'], ['bridge', 'A noun.']], '“Should” (and “sadly”) give the writer’s view.'],
        ], '', 'Judgement words: best, worst, should, beautiful, boring, I think.', 'concept', 40),
        eng_choose([
            ['Which is a FACT?', 'The bridge was opened in 2015.', [['The bridge is ugly.', 'A judgement.'], ['The bridge should be painted.', 'A recommendation.'], ['The bridge is the nicest in the state.', 'A judgement.']], 'A date can be checked.'],
            ['Which is an OPINION?', 'Lagos is too crowded to enjoy.', [['Lagos has a seaport.', 'Checkable.'], ['Lagos is in the south-west.', 'Checkable.'], ['Lagos was once the capital.', 'Checkable.']], '“Too crowded to enjoy” is a judgement.'],
            ['Which is a FACT?', 'The test had forty questions.', [['The test was unfair.', 'A judgement.'], ['The test was too long.', 'A judgement.'], ['The test was the hardest ever.', 'A judgement.']], 'A count can be checked.'],
        ], '', 'Could you prove it? Then it is a fact.', 'concept', 35),
    ],
    'EN-045' => [
        eng_choose([
            ['Her smile was as bright as the morning sun.', 'simile', [['metaphor', 'It uses “as … as”, so it is a simile.'], ['personification', 'Nothing human is given to a thing.'], ['hyperbole', 'The point is a comparison, not exaggeration.']], 'A simile compares using “like” or “as”.'],
            ['The classroom was a zoo when the teacher left.', 'metaphor', [['simile', 'There is no “like” or “as”.'], ['personification', 'Nothing human is given to a thing.'], ['onomatopoeia', 'No sound word.']], 'A metaphor says one thing IS another.'],
            ['The wind whispered through the trees.', 'personification', [['simile', 'No “like” or “as”.'], ['metaphor', 'The wind is given a human action, which is personification.'], ['transferred epithet', 'That moves an adjective to the wrong noun; there is no adjective here.']], 'Whispering is human; giving it to the wind is personification.'],
            ['He runs like a cheetah.', 'simile', [['metaphor', 'It uses “like”.'], ['personification', 'Nothing human is given to a thing.'], ['irony', 'Not saying the opposite.']], '“Like” makes it a simile.'],
            ['The old car coughed and groaned up the hill.', 'personification', [['simile', 'No “like” or “as”.'], ['metaphor', 'The car is given human actions: personification.'], ['alliteration', 'Not repeated first sounds.']], 'Coughing and groaning are human.'],
            ['Time is a thief.', 'metaphor', [['simile', 'No “like” or “as”.'], ['personification', 'Close, but the figure here is saying time IS a thief: a metaphor.'], ['euphemism', 'Not softening anything.']], 'A direct “is” comparison: metaphor.'],
        ], 'Name the figure of speech: “{q}”', 'Like/as → simile; IS → metaphor; human qualities → personification.'),
        eng_type([
            ['as busy as a ___', 'bee', [], 'As busy as a bee.'], ['as white as ___', 'snow', ['milk', 'chalk'], 'As white as snow.'], ['as strong as an ___', 'ox', [], 'As strong as an ox.'],
            ['as cool as a ___', 'cucumber', [], 'As cool as a cucumber.'], ['as quiet as a ___', 'mouse', [], 'As quiet as a mouse.'], ['as old as the ___', 'hills', [], 'As old as the hills.'],
        ], 'Complete the simile: {q}', 'These are fixed comparisons.', 'procedure', 20),
        eng_choose([
            ['What does the metaphor mean? “My brother is a walking dictionary.”', 'He knows the meanings of many words.', [['He carries a dictionary everywhere.', 'A metaphor is not literal.'], ['He walks a long way to school.', 'Not the point: “walking” only means he is a living person.'], ['He writes dictionaries.', 'Not stated.']], 'He knows words as a dictionary does.'],
            ['What does the personification suggest? “The angry sea swallowed the small boat.”', 'The sea was rough and the boat sank.', [['The sea is a living, hungry animal.', 'Personification is not literal.'], ['A sea creature ate the small boat.', 'Not literal: “swallowed” means the boat went under.'], ['The sea was calm.', 'The opposite.']], 'Angry and swallowed suggest violent waves sinking the boat.'],
            ['What does the simile suggest? “He fought like a lion.”', 'He fought bravely and fiercely.', [['He had long hair like a lion.', 'The comparison is about the fighting, not his looks.'], ['He fought against a real lion.', 'Not stated: “like” compares, it does not name an enemy.'], ['He fought slowly.', 'The opposite.']], 'Lions suggest courage and strength.'],
        ], '', 'Ask what quality the comparison carries across.', 'reasoning', 40),
    ],
    'EN-046' => [
        eng_choose([
            ['I have told you a million times to close the door!', 'hyperbole', [['irony', 'It does not mean the opposite; it exaggerates.'], ['euphemism', 'It does not soften anything.'], ['simile', 'There is no “like” or “as”.']], 'Deliberate exaggeration: hyperbole.'],
            ['Grandpa passed away last night.', 'euphemism', [['hyperbole', 'Nothing is exaggerated.'], ['irony', 'It does not mean the opposite.'], ['metaphor', 'Not a comparison.']], '“Passed away” is a gentle way of saying “died”: a euphemism.'],
            ['“What lovely weather!” said Tobi, as the rain soaked him.', 'irony', [['hyperbole', 'Not an exaggeration.'], ['euphemism', 'Not softening an unpleasant fact politely.'], ['simile', 'No comparison.']], 'Saying the opposite of what is meant: irony.'],
            ['My bag weighs a ton.', 'hyperbole', [['metaphor', 'It is an exaggeration, not a comparison.'], ['irony', 'Not the opposite meaning.'], ['euphemism', 'Not softening.']], 'Exaggeration: hyperbole.'],
            ['He is between jobs at the moment.', 'euphemism', [['hyperbole', 'Nothing is exaggerated.'], ['irony', 'Not the opposite meaning.'], ['personification', 'No human qualities given to things.']], '“Between jobs” softens “unemployed”.'],
            ['The fire station burnt down.', 'irony', [['hyperbole', 'It is not exaggerated.'], ['euphemism', 'It is not softened.'], ['metaphor', 'Not a comparison.']], 'Situational irony: the opposite of what you expect.'],
        ], 'Name the figure of speech: “{q}”', 'Exaggeration → hyperbole; opposite → irony; softened → euphemism.'),
        eng_choose([
            ['Which is a euphemism for “old”?', 'senior', [['ancient', 'That exaggerates.'], ['ageing fast', 'That is blunt.'], ['young', 'The opposite.']], '“Senior” softens “old”.'],
            ['Which is a euphemism for “poor”?', 'less privileged', [['broke', 'Blunt slang.'], ['down and out', 'Blunt: it stresses the hardship.'], ['rich', 'The opposite.']], '“Less privileged” softens “poor”.'],
            ['Which is a euphemism for “lied”?', 'was economical with the truth', [['told a big lie', 'Blunt.'], ['was completely honest with us', 'The opposite.'], ['shouted', 'Not related.']], 'A softer way to say someone lied.'],
        ], '', 'A euphemism is the polite way of saying something unpleasant.', 'concept', 30),
        eng_choose([
            ['Which sentence is hyperbole?', 'I could sleep for a hundred years.', [['I slept for eight hours last night.', 'A literal statement.'], ['I slept like a baby.', 'A simile.'], ['Sleep is a gentle friend who visits me.', 'Personification.']], 'An impossible exaggeration.'],
            ['Which sentence is irony?', 'The lifeguard could not swim.', [['The lifeguard swam fast.', 'Expected, not ironic.'], ['The lifeguard swam like a fish.', 'A simile.'], ['The lifeguard is a hero.', 'A metaphor or opinion.']], 'The opposite of what we expect.'],
        ], '', 'Look for exaggeration or a twist on expectation.', 'concept', 30),
    ],
    'EN-047' => [
        eng_choose([
            ['“How dare you speak to me like that! Leave this room at once!”', 'angry', [['joyful', 'The words are harsh.'], ['calm', 'Exclamations and commands are not calm.'], ['sad', 'It is anger, not sorrow.']], 'Exclamations and sharp commands give an angry tone.'],
            ['“We did it! After all those months, we finally won the cup!”', 'excited', [['bitter', 'Nothing is resented.'], ['bored', 'The exclamations say the opposite.'], ['fearful', 'Nothing is feared.']], 'Celebration and exclamations: excited, joyful.'],
            ['“The house stood empty. Dust lay on the chairs where the children once laughed.”', 'sad', [['humorous', 'Nothing is funny.'], ['angry', 'No anger is shown.'], ['excited', 'The opposite.']], 'Emptiness and lost laughter create a sad, nostalgic mood.'],
            ['“Oh, wonderful — another power cut. Just what I needed tonight.”', 'sarcastic', [['grateful', 'The speaker does not mean “wonderful”.'], ['excited', 'Not genuinely.'], ['sincere', 'The words mean the opposite.']], 'Saying “wonderful” about a power cut is sarcasm.'],
            ['“Please, sir, I beg you, give me one more chance.”', 'pleading', [['commanding', 'The speaker asks, not orders.'], ['proud', 'Begging is not proud.'], ['amused', 'Nothing is funny.']], 'Begging words give a pleading tone.'],
        ], 'What is the tone? {q}', 'Tone is the writer’s attitude, shown by word choice.'),
        eng_choose([
            ['Which word gives the sentence a frightening mood? “The ___ forest was silent except for the howl of a dog.”', 'dark', [['green', 'Neutral colour.'], ['tall', 'Neutral.'], ['busy', 'Not fitting.']], '“Dark” and “howl” build fear.'],
            ['Which word makes the tone more positive? “The new principal is ___.”', 'inspiring', [['strict', 'Can sound negative.'], ['new', 'Neutral.'], ['tall', 'Neutral.']], '“Inspiring” is warmly positive.'],
            ['Which word makes the tone more negative? “The government’s plan is ___.”', 'reckless', [['bold', 'Positive or neutral.'], ['careful', 'Positive.'], ['new', 'Neutral.']], '“Reckless” is critical.'],
        ], '', 'Word choice carries attitude.', 'concept', 35),
        eng_choose([
            ['Which word means the writer’s attitude?', 'tone', [['mood', 'Mood is the feeling the reader gets.'], ['plot', 'Plot is what happens.'], ['setting', 'Setting is where and when.']], 'Tone = the writer’s attitude; mood = the atmosphere the reader feels.'],
            ['Which word means the atmosphere a reader feels?', 'mood', [['tone', 'Tone is the writer’s attitude.'], ['theme', 'Theme is the main message.'], ['style', 'Style is how it is written.']], 'Mood = the atmosphere.'],
        ], '', 'Tone belongs to the writer; mood to the reader.', 'concept', 25),
    ],
    'EN-048' => [
        eng_choose([
            ['Which sentence summarises: “Many students fail mathematics not because they are slow, but because they missed the basics in junior classes. Without fractions and simple equations, later topics make no sense. Revising the basics often turns a failing student into a passing one.”', 'Students often fail mathematics because they missed the basics, and revising them helps.', [['Most students fail mathematics because they are too slow to understand it.', 'The passage says the opposite: it is not slowness.'], ['Fractions and simple equations are the hardest topics in mathematics.', 'A detail, and not what it says: they are the basics.'], ['Junior classes teach mathematics badly, so students should change schools.', 'Not stated: the passage blames missed basics, not the classes.']], 'A summary keeps the cause and the remedy, in fewer words.'],
            ['Which sentence summarises: “Plastic bags block gutters. Blocked gutters cause floods. Floods destroy homes and spread disease. Banning plastic bags would therefore protect our towns.”', 'Banning plastic bags would prevent the floods they cause.', [['Floods destroy homes and spread disease in our towns.', 'One link in the chain, not the point.'], ['Gutters must be cleaned often so that they do not block.', 'Not the writer’s argument: the remedy is a ban.'], ['Plastic bags are cheap and useful.', 'Not stated.']], 'The chain leads to one recommendation.'],
        ], '', 'A summary keeps the main points and drops examples and repetition.', 'reasoning', 70),
        eng_choose([
            ['A writer lists the benefits of reading: it builds vocabulary, improves concentration and is a cheap form of entertainment. She adds that her uncle reads a novel a week. Which point would a summary LEAVE OUT?', 'her uncle reads a novel a week', [['it builds vocabulary', 'A main point.'], ['it improves concentration', 'A main point.'], ['it is cheap entertainment', 'A main point.']], 'A personal example is not a main point.'],
            ['A passage gives three causes of road accidents — speeding, bad roads and drunk driving — and describes one crash on the Lagos–Ibadan expressway. Which would a summary leave out?', 'the crash on the expressway', [['speeding', 'A cause.'], ['the bad state of the roads', 'A cause.'], ['drivers who drink and drive', 'A cause.']], 'The story illustrates; the causes are the points.'],
        ], '', 'Examples and stories illustrate; they are not the points.', 'reasoning', 50),
        eng_type([
            ['“The boy was very, very happy and full of joy and delight.” Rewrite it in four words.', 'The boy was delighted.', ['The boy was overjoyed.', 'The boy was joyful.', 'The boy was happy.', 'The boy was ecstatic.'], 'Repetition goes: one strong word replaces many.'],
            ['“At this point in time, we are now ready.” Rewrite it in three words.', 'We are ready.', ['We’re ready now.', 'We are ready now.'], '“At this point in time” and “now” repeat each other.'],
            ['“She made a decision to leave.” Rewrite it in three words.', 'She decided to leave.', [], '“Made a decision” → “decided”.'],
        ], '{q}', 'Cut repetition; use one precise word.', 'procedure', 50),
    ],
    'EN-049' => [
        eng_choose([
            ['Which is most suitable in a letter to a principal?', 'I would be grateful if you could grant me leave.', [['Abeg sir, I dey beg, make you give me leave.', 'Pidgin is informal.'], ['Gimme leave, sir.', 'Slang.'], ['I wanna take some days off next week, sir.', '“Wanna” and “days off” are informal.']], 'Formal register: full words, polite structures.'],
            ['Which is most suitable in a chat with a close friend?', 'See you later!', [['I look forward to our subsequent meeting.', 'Too formal for a friend.'], ['Yours faithfully,', 'A formal letter ending.'], ['I hereby inform you of my departure.', 'Too formal.']], 'Informal register suits a friend.'],
            ['Which is the formal word for “get”?', 'obtain', [['grab', 'Informal.'], ['nab', 'Slang.'], ['snag', 'Informal.']], '“Obtain” is formal.'],
            ['Which is the formal word for “ask for”?', 'request', [['beg', 'A different tone.'], ['ask around', 'Informal and different.'], ['holla', 'Slang.']], '“Request” is formal.'],
            ['Which is the formal phrase for “a lot of”?', 'a great deal of', [['a whole load of', 'Informal.'], ['tons of', 'Informal hyperbole.'], ['heaps of', 'Informal.']], '“A great deal of” is formal.'],
        ], '', 'Formal: full words, no slang, no contractions.'),
        eng_type([
            ['kids', 'children', [], 'Formal: children.'], ['buy', 'purchase', [], 'Formal: purchase.'], ['help', 'assist', ['assistance'], 'Formal: assist.'],
            ['start', 'commence', ['begin'], 'Formal: commence (or begin).'], ['tell', 'inform', [], 'Formal: inform.'], ['enough', 'sufficient', [], 'Formal: sufficient.'],
        ], 'Type a formal word for “{q}”.', 'Think of the word an official letter would use.', 'procedure', 25),
        eng_spot([
            [['Dear Sir,', 'I am writing to complain', 'coz the road is', 'in a bad state.'], 2, 'because the road is', 'A formal letter uses full words: “because”, not “coz”.'],
            [['I would be grateful', 'if you could', 'gimme', 'more time.'], 2, 'give me', 'Slang has no place in a formal request.'],
            [['The meeting', 'was', 'super cool', 'and productive.'], 2, 'very useful', 'Slang in a formal report: use neutral words.'],
        ], 'Formal writing avoids slang and short forms.'),
    ],
    'EN-050' => [
        eng_choose([
            ['“adamant” — The chairman was adamant about his decision.', 'firm', [['unsure', 'The opposite.'], ['angry', 'Not the meaning.'], ['silent', 'Not the meaning.']], 'Adamant = refusing to change one’s mind: firm.'],
            ['“cogent” — The speaker’s argument was cogent.', 'convincing', [['confusing', 'The opposite.'], ['loud', 'Not the meaning.'], ['brief', 'Not the meaning.']], 'Cogent = clear and convincing.'],
            ['“apprehended” — The thief was apprehended near the motor park.', 'arrested', [['released', 'The opposite.'], ['seen', 'Not the meaning.'], ['chased', 'Close, but apprehended means caught.']], 'Apprehended = caught, arrested.'],
            ['“legendary” — Her generosity is legendary.', 'famous', [['false', 'Not the meaning here.'], ['ancient', 'Not the meaning.'], ['small', 'Not the meaning.']], 'Legendary = very famous.'],
            ['“dismal” — The results were dismal.', 'very poor', [['excellent', 'The opposite.'], ['delayed', 'Not the meaning.'], ['average', 'Too mild.']], 'Dismal = gloomy, very bad.'],
        ], 'Choose the word NEAREST in meaning to {q}', 'Replace the word with each option: which keeps the meaning?'),
        eng_choose([
            ['“treacherous” — The road was narrow and treacherous.', 'safe', [['dangerous', 'That is a synonym.'], ['winding', 'Not the opposite.'], ['long', 'Not the opposite.']], 'Treacherous = dangerous; the opposite is safe.'],
            ['“vague” — He gave a vague answer.', 'precise', [['unclear', 'A synonym.'], ['short', 'Not the opposite.'], ['rude', 'Not the opposite.']], 'Vague = unclear; opposite: precise.'],
            ['“humble” — The leader was humble.', 'arrogant', [['modest', 'A synonym.'], ['poor', 'Not the opposite.'], ['quiet', 'Not the opposite.']], 'Humble ↔ arrogant.'],
            ['“scarce” — The supply of water is scarce.', 'plentiful', [['rare', 'A synonym.'], ['expensive', 'Scarce things often cost more, but that is a result, not the opposite.'], ['cheap', 'Not the opposite.']], 'Scarce ↔ plentiful.'],
            ['“reluctant” — The witness was reluctant to speak.', 'eager', [['unwilling', 'A synonym.'], ['afraid', 'Not the opposite.'], ['silent', 'Not the opposite.']], 'Reluctant ↔ eager.'],
        ], 'Choose the word OPPOSITE in meaning to {q}', 'First find the meaning, then its opposite.'),
        eng_type([
            ['optimistic', 'pessimistic', [], 'optimistic ↔ pessimistic.'], ['temporary', 'permanent', [], 'temporary ↔ permanent.'],
            ['ancient', 'modern', ['new'], 'ancient ↔ modern.'], ['voluntary', 'compulsory', ['mandatory', 'involuntary'], 'voluntary ↔ compulsory.'],
            ['transparent', 'opaque', [], 'transparent ↔ opaque.'], ['generous', 'mean', ['stingy', 'selfish'], 'generous ↔ mean (stingy).'],
        ], 'Type a word opposite in meaning to “{q}”.', 'Several answers may be right.', 'procedure', 25),
    ],
    ];
}
