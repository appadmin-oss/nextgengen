<?php
declare(strict_types=1);

/**
 * English Lab — Stage 7, Word Power (EN-061 … EN-070). Vocabulary taught for MEANING: roots and
 * word families (morphology helps vocabulary and spelling most when it is about meaning), the words
 * that go together, the pairs people confuse, and the vocabulary of fields the syllabus names.
 * Content only, built with the kit (englishlab-kit.php). Append-only.
 */
function eng_wordpower_forms(): array {
    // Field vocabulary: [field, word, meaning, [[wrong meaning, why], …]]. One table per field feeds two forms.
    $field = static fn(array $rows, string $name) => [
        eng_choose(array_map(static fn($r) => ['“' . $r[0] . '”', $r[1], $r[2], 'In ' . $name . ', “' . $r[0] . '” means ' . $r[1] . '.'], $rows),
            'In ' . $name . ', what does {q} mean?', 'Think of where you would hear the word.', 'concept', 30),
        eng_type(array_map(static fn($r) => [$r[1], $r[0], $r[3] ?? [], '“' . $r[0] . '” is the word for ' . $r[1] . '.'], $rows),
            'Type the ' . $name . ' word for: {q}', 'One word.', 'procedure', 30),
    ];
    $health = [
        ['diagnosis', 'identifying an illness from its signs', [['giving medicine to ease the pain', 'That is treatment.'], ['cutting the body open to repair it', 'That is surgery.'], ['the room where patients sleep', 'That is a ward: a place, not an act.']]],
        ['symptom', 'a sign of an illness that the patient notices', [['a medicine that cures the illness quickly', 'That is a cure: the opposite purpose.'], ['a doctor who looks after sick children', 'That is a paediatrician.'], ['the note a doctor writes for the chemist', 'That is a prescription.']]],
        ['epidemic', 'a disease spreading quickly among many people in one area', [['a disease found only in animals and never in people', 'Not the meaning.'], ['one patient’s fever that lasts for many days', 'An epidemic affects many.'], ['a vaccine given to many people in one area', 'A vaccine prevents disease.']]],
        ['outpatient', 'a patient treated without staying overnight', [['a patient who has died in hospital', 'Not the meaning.'], ['a nurse who works on the night shift', 'Not a patient.'], ['a patient admitted to a ward for the night', 'That is an inpatient.']]],
        ['immunisation', 'protecting someone from a disease, usually by vaccine', [['removing a decayed tooth to stop the pain', 'That is extraction.'], ['measuring blood pressure at every visit', 'Not the meaning.'], ['giving medicine to ease pain after an injury', 'That is pain relief, not protection.']], ['immunization', 'vaccination']],
        ['paediatrician', 'a doctor who treats children', [['a doctor who treats teeth', 'That is a dentist.'], ['a doctor who treats eyes', 'That is an ophthalmologist.'], ['a doctor who delivers babies', 'That is an obstetrician.']], ['pediatrician']],
    ];
    $law = [
        ['plaintiff', 'the person who brings a case to court', [['the judge who decides the case', 'The judge decides; the plaintiff brings the case.'], ['the person accused of wrongdoing', 'That is the defendant.'], ['a person who gives evidence in court', 'That is a witness.']], ['claimant']],
        ['verdict', 'the decision reached at the end of a trial', [['the building where a trial is held', 'That is the court.'], ['the fee a lawyer charges for the case', 'Not the meaning.'], ['the charge brought against the accused', 'That is the charge or indictment.']]],
        ['bail', 'release from custody until the trial, on a promise to return', [['a prison sentence handed down at the end of the trial', 'The opposite: bail keeps you out until the trial.'], ['a fine paid to the court instead of going to prison', 'A fine is a punishment; bail comes before any verdict.'], ['asking a higher court to change the verdict', 'That is an appeal.']]],
        ['constituency', 'an area whose voters elect a representative', [['a political party that people vote for', 'Not the meaning.'], ['the written rules of how a country is run', 'That is the constitution: a different word.'], ['the box where voters drop their papers', 'That is a ballot box.']]],
        ['legislature', 'the body that makes laws', [['the courts and judges', 'That is the judiciary.'], ['the police force', 'They enforce laws.'], ['the president alone', 'That is the executive.']]],
        ['adjourn', 'to break off a meeting or hearing until later', [['to end a case for ever with no decision', 'Adjourning means it will continue later.'], ['to begin a trial in a new court', 'The opposite.'], ['to arrest someone and take them to court', 'Not the meaning.']]],
    ];
    $trade = [
        ['harvest', 'gathering in the ripe crops', [['planting seeds in the soil', 'That is sowing.'], ['clearing the bush for farming', 'Not the meaning.'], ['selling at the market', 'Not the meaning.']]],
        ['irrigation', 'supplying water to crops by channels or pipes', [['spraying crops to kill harmful insects', 'That is pest control.'], ['storing grain in a dry barn', 'Not the meaning.'], ['digging up weeds from between the rows', 'That is weeding.']]],
        ['fertiliser', 'a substance added to soil to help crops grow', [['a tool for cutting down grass and weeds', 'Not the meaning.'], ['a disease that makes crops wither', 'Not the meaning.'], ['a type of seed that grows fast', 'Not the meaning.']], ['fertilizer', 'manure']],
        ['interest', 'money paid for the use of borrowed money', [['the building where a bank keeps money', 'Not the meaning.'], ['a free gift from the bank to customers', 'Interest is paid for a reason, not given away.'], ['money you put aside to save', 'That is savings.']]],
        ['debtor', 'a person who owes money', [['a person who is owed money', 'That is a creditor.'], ['a bank manager', 'Not the meaning.'], ['a cashier', 'Not the meaning.']]],
        ['wholesaler', 'a trader who sells goods in large quantities to retailers', [['a trader who sells single items straight to customers', 'That is a retailer.'], ['a factory that makes goods from raw materials', 'That is a manufacturer.'], ['a customer who buys goods for their own home', 'That is a consumer.']]],
    ];
    $media = [
        ['headline', 'the title of a news story in large print', [['the last paragraph of a news story', 'Not the meaning.'], ['an advertisement placed on the front page', 'Not the meaning.'], ['the editor’s name printed on the page', 'Not the meaning.']]],
        ['editorial', 'an article giving the newspaper’s own opinion', [['a news report giving only the facts', 'News reports facts; an editorial gives opinion.'], ['a letter sent in by a reader of the paper', 'A reader’s opinion, not the paper’s own.'], ['a list of the week’s television programmes', 'Not the meaning.']]],
        ['referee', 'the official who controls a football match', [['the player who guards the goal', 'That is the goalkeeper, a player.'], ['the player who leads the team', 'That is the captain, a player.'], ['the person who trains the team’s players', 'That is the coach.']]],
        ['spectators', 'people who watch a match or event', [['players who take part in a match', 'They take part, not watch.'], ['officials who control the game', 'They run the game.'], ['sponsors who pay for the event', 'They pay.']], ['audience', 'fans']],
        ['download', 'to copy data from the internet to your device', [['to send data from your device to the web', 'That is upload.'], ['to delete a file from your phone', 'Not the meaning.'], ['to type a message on your keyboard', 'Not the meaning.']]],
        ['password', 'a secret word used to get into an account', [['an email address used to send messages', 'Not secret.'], ['the address of a website you visit', 'Not the meaning.'], ['a program that harms your computer', 'That is a virus.']]],
    ];
    return [
    'EN-061' => [
        eng_choose([
            ['bio (biology, biography)', 'life', [['earth', 'That is “geo”.'], ['writing', 'That is “graph”.'], ['study', 'That is “-logy”.']], 'bio = life: biology is the study of life.'],
            ['graph (autograph, paragraph)', 'write', [['far', 'That is “tele”.'], ['sound', 'That is “phon”.'], ['see', 'That is “vis/vid”.']], 'graph = write: an autograph is a self-written name.'],
            ['tele (telephone, television)', 'far', [['near', 'The opposite.'], ['sound', 'That is “phon”.'], ['light', 'That is “photo”.']], 'tele = far: a telephone carries sound far.'],
            ['aqua (aquarium, aquatic)', 'water', [['air', 'That is “aero”.'], ['earth', 'That is “geo”.'], ['fire', 'That is “pyro”.']], 'aqua = water.'],
            ['port (transport, portable)', 'carry', [['look', 'That is “spect”.'], ['break', 'That is “rupt”.'], ['write', 'That is “scrib”.']], 'port = carry: portable means able to be carried.'],
            ['spect (inspect, spectator)', 'look', [['speak', 'That is “dict”.'], ['carry', 'That is “port”.'], ['hear', 'That is “aud”.']], 'spect = look: a spectator looks on.'],
            ['dict (dictate, predict)', 'say', [['lead', 'That is “duct”.'], ['write', 'That is “scrib”.'], ['see', 'That is “vis”.']], 'dict = say: to predict is to say before.'],
            ['rupt (erupt, interrupt)', 'break', [['build', 'Not the root’s meaning.'], ['run', 'That is “cur”.'], ['turn', 'That is “vert”.']], 'rupt = break: a volcano erupts (breaks out).'],
        ], 'What does the root mean? {q}', 'Think of two words that share it.'),
        eng_choose([
            ['A “geologist” studies:', 'the earth and its rocks', [['plants and living things', 'That is a biologist.'], ['the stars and planets', 'That is an astronomer.'], ['old writings', 'Not the meaning.']], 'geo = earth; -logist = one who studies.'],
            ['“Audible” means:', 'loud enough to be heard', [['clear enough to be seen', 'That is visible.'], ['able to be carried', 'That is portable.'], ['clear enough to be read', 'That is legible.']], 'aud = hear; -ible = able to be.'],
            ['A “microscope” is used to:', 'see very small things', [['see far-away things', 'That is a telescope.'], ['hear faint sounds', 'Not the meaning.'], ['measure heat', 'That is a thermometer.']], 'micro = small; scope = look at.'],
            ['“Malnutrition” means:', 'bad or poor feeding', [['too much food', 'Not the root meaning; mal = bad.'], ['a feeding bottle', 'Not the meaning.'], ['a healthy diet', 'The opposite.']], 'mal = bad; nutrition = feeding.'],
        ], '', 'Break the word into its parts.', 'reasoning', 35),
        eng_type([
            ['a word with “aud” (hear) for the people who listen to a speech', 'audience', [], 'aud = hear.'],
            ['a word with “tele” (far) for an instrument for seeing far-off things', 'telescope', [], 'tele + scope.'],
            ['a word with “bio” (life) for the story of a person’s life written by someone else', 'biography', [], 'bio + graph(y).'],
            ['a word with “port” (carry) for goods brought into a country', 'imports', ['import'], 'im (in) + port (carry).'],
            ['a word with “vis” (see) for something that can be seen', 'visible', [], 'vis + -ible.'],
        ], 'Type {q}.', 'Build it from the root.', 'procedure', 35),
    ],
    'EN-062' => [
        eng_choose([
            ['The ___ of the judges was final. (decide)', 'decision', [['decide', 'A noun is needed after “the”.'], ['decisive', 'That is the adjective.'], ['decisively', 'That is the adverb.']], 'After “the”, a noun: decision.'],
            ['She is a very ___ speaker. (persuade)', 'persuasive', [['persuasion', 'A noun; an adjective is needed before “speaker”.'], ['persuade', 'A verb.'], ['persuasively', 'An adverb.']], 'Before a noun, an adjective: persuasive.'],
            ['He answered ___. (polite)', 'politely', [['polite', 'An adjective; “answered” needs an adverb.'], ['politeness', 'A noun.'], ['politely-ness', 'Not a word.']], 'Describing a verb: adverb.'],
            ['The ___ of the bridge took two years. (construct)', 'construction', [['construct', 'A verb.'], ['constructive', 'An adjective.'], ['constructor', 'A person, not the process.']], 'The process: construction.'],
            ['We must ___ our efforts. (strong)', 'strengthen', [['strength', 'A noun.'], ['strong', 'An adjective.'], ['strongly', 'An adverb.']], 'After “must”, a verb: strengthen.'],
            ['Her ___ surprised everyone. (generous)', 'generosity', [['generous', 'An adjective.'], ['generously', 'An adverb.'], ['generousness', 'Not the standard noun.']], 'After “her”, a noun: generosity.'],
        ], 'Choose the right form of the word in brackets: {q}', 'What part of speech does the gap need?'),
        eng_type([
            ['noun of “able”', 'ability', [], 'able → ability.'], ['verb of “wide”', 'widen', [], 'wide → widen.'], ['adjective of “care”', 'careful', ['careless'], 'care → careful.'],
            ['noun of “free”', 'freedom', [], 'free → freedom.'], ['adjective of “nation”', 'national', [], 'nation → national.'], ['noun of “explain”', 'explanation', [], 'explain → explanation (the i goes).'],
            ['noun of “fail”', 'failure', [], 'fail → failure.'],
        ], 'Type the {q}.', 'Use the suffix that makes that part of speech.', 'procedure', 30),
        eng_spot([
            [['The importance', 'of education', 'cannot be', 'overemphasis.'], 3, 'overemphasised.', 'After “be”, the past participle (verb), not the noun “overemphasis”.'],
            [['She', 'spoke', 'confident', 'at the debate.'], 2, 'confidently', '“Spoke” needs an adverb.'],
            [['His', 'behave', 'was', 'excellent.'], 1, 'behaviour', 'After “his”, a noun: behaviour.'],
        ], 'Check what part of speech each slot needs.'),
    ],
    'EN-063' => [
        eng_choose([
            ['___ a mistake', 'make', [['do', 'We do homework but make mistakes.'], ['take', 'Not the collocation.'], ['give', 'Not the collocation.']], 'make a mistake.'],
            ['___ your homework', 'do', [['make', 'We do homework and chores.'], ['take', 'Not the collocation.'], ['give', 'Not the collocation.']], 'do your homework.'],
            ['___ a photograph', 'take', [['make', 'Not the usual collocation.'], ['do', 'Not the collocation.'], ['snap off', 'Not standard.']], 'take a photograph.'],
            ['___ rain', 'heavy', [['strong', '“Strong” goes with wind, not rain.'], ['big', 'Not the usual collocation.'], ['hard-rain', 'Not standard.']], 'heavy rain (but strong wind).'],
            ['___ tea', 'strong', [['powerful', '“Powerful” goes with engines, not tea.'], ['heavy', 'Not the collocation.'], ['hard', 'Not the collocation.']], 'strong tea.'],
            ['___ attention', 'pay', [['give out', 'Not the collocation.'], ['make', 'Not the collocation.'], ['do', 'Not the collocation.']], 'pay attention.'],
            ['___ a decision', 'make', [['do', 'We make decisions.'], ['take out', 'Not the collocation.'], ['give', 'Not the collocation.']], 'make a decision (British English also “take a decision”).'],
        ], 'Which word goes with it? {q}', 'Some words simply belong together.'),
        eng_type([
            ['a ___ of bread (one piece)', 'slice', ['loaf'], 'a slice of bread (a whole one is a loaf).'], ['a ___ of advice', 'piece', ['word'], 'a piece of advice.'],
            ['bitterly ___ (very cold)', 'cold', [], 'bitterly cold.'], ['fast ___ (deeply sleeping)', 'asleep', [], 'fast asleep.'],
            ['___ the truth', 'tell', [], 'tell the truth (say a lie is wrong).'], ['commit a ___ (a criminal act)', 'crime', ['murder', 'offence'], 'commit a crime.'],
        ], 'Complete the collocation: {q}', 'Say the phrase aloud.', 'procedure', 25),
        eng_spot([
            [['Please', 'do', 'a decision', 'by Friday.'], 1, 'make', 'We make (or take) a decision.'],
            [['There was', 'strong', 'rain', 'last night.'], 1, 'heavy', 'The collocation is “heavy rain”.'],
            [['He', 'said', 'a lie', 'to his teacher.'], 1, 'told', 'We tell a lie.'],
        ], 'Look for the word that does not belong with its partner.'),
    ],
    'EN-064' => [
        eng_choose([
            ['The noise did not ___ my concentration.', 'affect', [['effect', '“Effect” is usually the noun (the result).'], ['afect', 'Misspelling.'], ['affects', 'After “did not”, the base form.']], 'affect (verb) = to influence; effect (noun) = the result.'],
            ['My father gave me good ___.', 'advice', [['advise', '“Advise” is the verb.'], ['advices', '“Advice” is uncountable.'], ['adviced', 'Not a word.']], 'advice (noun); advise (verb).'],
            ['Don’t ___ your ticket.', 'lose', [['loose', '“Loose” means not tight.'], ['loss', '“Loss” is the noun.'], ['lost', 'After “don’t”, the base form.']], 'lose (verb); loose (not tight).'],
            ['Buy pens and paper at the ___ shop.', 'stationery', [['stationary', '“Stationary” means not moving.'], ['station', 'Not the meaning.'], ['stationed', 'Not the meaning.']], 'stationery (writing materials); stationary (not moving).'],
            ['The ___ of the school spoke at assembly.', 'principal', [['principle', 'A principle is a rule or belief.'], ['principality', 'A state ruled by a prince.'], ['prince', 'Not the meaning.']], 'principal (head); principle (rule).'],
            ['She is taller ___ her brother.', 'than', [['then', '“Then” is about time.'], ['that', 'Not a comparison word.'], ['as', '“As tall as” needs two “as”.']], 'than (comparison); then (time).'],
            ['Every child must ___ the rules. (accept / except)', 'accept', [['except', '“Except” means apart from.'], ['expect', 'A different word.'], ['excepts', 'Not the meaning.']], 'accept (agree to); except (apart from).'],
        ], 'Choose the right word: {q}', 'Say the meaning of each before choosing.'),
        eng_type([
            ['The car was ___ (stationary/stationery) at the junction.', 'stationary', [], 'Not moving: stationary.'],
            ['The new rule had a good ___ (affect/effect).', 'effect', [], 'The result: effect.'],
            ['Please ___ (advice/advise) him to rest.', 'advise', [], 'The verb: advise.'],
            ['My belt is too ___ (lose/loose).', 'loose', [], 'Not tight: loose.'],
            ['Everyone came ___ (accept/except) Bola.', 'except', [], 'Apart from: except.'],
        ], 'Type the right word: {q}', 'Noun or verb? Moving or still?', 'procedure', 25),
        eng_spot([
            [['The', 'medicine', 'had no affect', 'on the fever.'], 2, 'had no effect', 'The noun is “effect”.'],
            [['I need', 'your', 'advise', 'on this matter.'], 2, 'advice', 'The noun is “advice”.'],
            [['Our team', 'is better', 'then', 'theirs.'], 2, 'than', 'Comparison: than.'],
        ], 'Confusable pairs: one is usually a noun, the other a verb.'),
    ],
    'EN-065' => [
        eng_choose([
            ['a person who cannot read or write', 'illiterate', [['ignorant', 'Lacking knowledge in general, not reading.'], ['illegible', 'That describes handwriting.'], ['innocent', 'Not guilty.']], 'illiterate.'],
            ['a person who eats no meat', 'vegetarian', [['herbivore', 'An animal that eats plants.'], ['carnivore', 'An animal that eats meat.'], ['nutritionist', 'A diet expert.']], 'vegetarian.'],
            ['a speech made without preparation', 'impromptu', [['eloquent', 'Well spoken, not unprepared.'], ['monologue', 'A long speech by one person.'], ['eulogy', 'A speech praising someone who died.']], 'impromptu (extempore).'],
            ['a person who believes in God', 'theist', [['atheist', 'One who does not believe in God.'], ['agnostic', 'One who says it cannot be known.'], ['sceptic', 'One who doubts generally.']], 'theist.'],
            ['handwriting that cannot be read', 'illegible', [['illiterate', 'That describes a person who cannot read.'], ['eligible', 'Qualified for something.'], ['legible', 'The opposite.']], 'illegible.'],
            ['a period of ten years', 'decade', [['century', 'A hundred years.'], ['millennium', 'A thousand years.'], ['decimal', 'Not a period of time.']], 'decade.'],
            ['a person who lives in a country but is not a citizen', 'alien', [['emigrant', 'Someone who leaves their country.'], ['native', 'Someone born there.'], ['tourist', 'A visitor for pleasure.']], 'alien (a resident foreigner).'],
        ], 'Which ONE word means {q}?', 'One precise word replaces a phrase.'),
        eng_type([
            ['a place where bread is baked', 'bakery', [], 'bakery.'], ['a doctor who treats teeth', 'dentist', [], 'dentist.'],
            ['a person who writes poems', 'poet', [], 'poet.'], ['a place where aircraft land and take off', 'airport', ['airfield', 'aerodrome'], 'airport.'],
            ['a medicine that kills bacteria', 'antibiotic', [], 'antibiotic.'], ['an animal that eats only plants', 'herbivore', [], 'herbivore.'],
        ], 'Type one word for {q}.', 'Think of the precise word.', 'procedure', 25),
        eng_choose([
            ['Which word could replace “a person who works without pay”?', 'volunteer', [['employee', 'Paid.'], ['servant', 'Usually paid.'], ['contractor', 'Paid by contract.']], 'A volunteer works for free.'],
            ['Which word could replace “able to be eaten”?', 'edible', [['audible', 'Able to be heard.'], ['visible', 'Able to be seen.'], ['credible', 'Able to be believed.']], 'edible.'],
            ['Which word could replace “lasting for ever”?', 'eternal', [['temporary', 'The opposite.'], ['annual', 'Once a year.'], ['ancient', 'Very old.']], 'eternal.'],
        ], '', 'Match the definition exactly.', 'concept', 25),
    ],
    'EN-066' => $field($health, 'health and medicine') + [2 => eng_spot([
            [['The doctor', 'made a', 'diagnose', 'of malaria.'], 2, 'diagnosis', 'The noun is “diagnosis”; “diagnose” is the verb.'],
            [['The patient', 'was treated', 'as an inpatient', 'and went home the same day.'], 2, 'as an outpatient', 'Going home the same day means an outpatient.'],
            [['Children', 'receive', 'immunisation', 'against a cure.'], 3, 'against measles.', 'You are immunised against a disease, not a cure.'],
        ], 'Check the word matches the meaning in context.')],
    'EN-067' => $field($law, 'law and government') + [2 => eng_spot([
            [['The', 'defendant', 'brought the case', 'to court.'], 1, 'plaintiff', 'The plaintiff brings the case; the defendant answers it.'],
            [['The', 'judiciary', 'passed', 'the new law.'], 1, 'legislature', 'The legislature makes laws; the judiciary interprets them.'],
            [['The court', 'was adjourned', 'for ever,', 'so the case ended.'], 2, 'until next week,', 'To adjourn is to break off until later, not for ever.'],
        ], 'Who does what in a court and a government?')],
    'EN-068' => $field($trade, 'farming, trade and money') + [2 => eng_spot([
            [['The', 'creditor', 'could not repay', 'the loan.'], 1, 'debtor', 'The debtor owes; the creditor is owed.'],
            [['Farmers', 'harvest', 'the seeds', 'in April before the rains.'], 1, 'sow', 'You sow seeds; you harvest crops.'],
            [['The', 'retailer', 'sold sacks of rice in bulk', 'to small shops.'], 1, 'wholesaler', 'Selling in bulk to shops is wholesale.'],
        ], 'Which word fits the action?')],
    'EN-069' => $field($media, 'the media, sport and technology') + [2 => eng_spot([
            [['The', 'editorial', 'reported only the facts', 'of the accident.'], 1, 'news report', 'An editorial gives opinion; a news report gives facts.'],
            [['The', 'coach', 'blew the whistle', 'for a penalty.'], 1, 'referee', 'The referee controls the match.'],
            [['I', 'downloaded', 'my photos', 'to the website.'], 1, 'uploaded', 'Sending to the internet is uploading.'],
        ], 'Which word names the right role or action?')],
    'EN-070' => [
        eng_choose([
            ['“The new manager is a square peg in a round hole.” This means the manager:', 'is not suited to the job', [['is too tall for the office', 'Not literal.'], ['is a carpenter by trade', 'Not literal.'], ['fits the job perfectly', 'The opposite.']], 'A square peg in a round hole does not fit.'],
            ['“Bisi took the news with a pinch of salt.” This means Bisi:', 'did not fully believe it', [['was cooking a pot of soup', 'Not literal.'], ['was very sad about it', 'Not the meaning.'], ['believed every word', 'The opposite.']], 'With a pinch of salt = with doubt.'],
            ['“We had to face the music after the broken window.” This means we:', 'accepted the punishment', [['listened to a band', 'Not literal.'], ['danced at the party', 'Not literal.'], ['ran away from the trouble', 'The opposite.']], 'Face the music = accept the consequences.'],
            ['“The plan is still in the pipeline.” This means the plan is:', 'being prepared and not yet ready', [['finished and already in use', 'The opposite.'], ['about laying new water pipes', 'Not literal.'], ['cancelled for good', 'Not the meaning.']], 'In the pipeline = in progress.'],
            ['“He has a chip on his shoulder about his school.” This means he:', 'feels resentful about it', [['is injured on the shoulder', 'Not literal.'], ['is very proud of it', 'The opposite.'], ['carries wood on his back', 'Not literal.']], 'A chip on one’s shoulder = a grudge.'],
            ['“Ada was the black sheep of the family.” This means Ada was:', 'different and disapproved of', [['the youngest child of all', 'Not the meaning.'], ['a farmer who keeps sheep', 'Not literal.'], ['the favourite and much loved', 'The opposite.']], 'The black sheep = the one who brings disapproval.'],
        ], '{q}', 'Read the whole sentence; work out what the speaker means.', 'reasoning', 40),
        eng_choose([
            ['“Had I known, I would have come.” This means:', 'I did not know, so I did not come.', [['I knew about it, and I came.', 'The sentence describes what did not happen.'], ['I will come as soon as I know.', 'The time is past.'], ['I knew but did not come.', 'Then the condition would be met.']], 'An inverted third conditional describes an unreal past.'],
            ['“Hardly had we sat down when the lights went out.” This means:', 'The lights went out just after we sat down.', [['We could not sit down because of the dark.', 'We did sit.'], ['The lights were already out before we sat.', 'The order is the reverse.'], ['We sat down very hard on the seats.', '“Hardly” here means “only just”.']], '“Hardly … when” = immediately after.'],
            ['“Not until the bell rang did the pupils leave.” This means:', 'The pupils left only when the bell rang.', [['The pupils left well before the bell.', 'The opposite.'], ['The pupils never left the room.', 'They left at the bell.'], ['The bell did not ring at all.', 'It rang.']], '“Not until X did Y” = Y happened only at X.'],
            ['“She could not have been more delighted.” This means:', 'She was extremely delighted.', [['She was not delighted.', 'It is a strong positive.'], ['She was a little delighted.', 'Too weak.'], ['She might be delighted later.', 'Not about the future.']], '“Could not have been more” = as much as possible.'],
        ], '', 'Unusual word order often carries a precise meaning.', 'reasoning', 45),
        eng_choose([
            ['“The minister’s speech fell on deaf ears.” Which best explains it?', 'Nobody paid attention to the speech.', [['The audience could not hear him.', 'Not literal.'], ['The speech was too loud for the hall.', 'Not the meaning.'], ['The speech was excellent.', 'Not the point.']], 'Fall on deaf ears = be ignored.'],
            ['“Our team won by a whisker.” Which best explains it?', 'They won by a very small margin.', [['They won easily, by many goals.', 'The opposite.'], ['They lost the match narrowly.', 'They won.'], ['The captain has a beard.', 'Not literal.']], 'By a whisker = only just.'],
            ['“He is an old hand at this work.” Which best explains it?', 'He is very experienced.', [['He is very old.', 'Not the meaning.'], ['He has an injured hand.', 'Not literal.'], ['He is a beginner.', 'The opposite.']], 'An old hand = an expert.'],
        ], '', 'Pick the plain meaning.', 'concept', 35),
    ],
    ];
}
