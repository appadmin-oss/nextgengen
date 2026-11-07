"""
More English Lab "Remember it" cards — the topics build.py's English section did not reach.

Same rules as build.py's docstring, which is the authority: each frame is a picture of the idea (a letter's
layout, a pitch line, a courtroom, a story mountain), three learner-paced frames, one short caption each, at
most one memory hook and only where the research supports one (here: word parts, for the medical words),
and every card ends in a "cover it" recall prompt. Examples are set in Nigeria.

Coverage (owner, 7 Nov 2026): every EN id build.py does not map is listed on a card below. Ids that share one
idea share a card — synonyms with "nearest and opposite in meaning", the three letters on one layout card,
silent letters with consonant clusters (both are "count the sounds, not the letters").

Called from build.py's main() as  add(B)  with B the build module.  Keys are prefixed "en-" so they cannot
collide with build.py's own keys or with a sibling module's.
"""
from html import escape


def add(B):
    S, T, R, L, C, P, Wd = B.svg, B.t, B.r, B.ln, B.circ, B.poly, B.words
    INK, INK2, LINE, SOFT, GOLD, TEAL, CORAL, GREEN = B.INK, B.INK2, B.LINE, B.SOFT, B.GOLD, B.TEAL, B.CORAL, B.GREEN
    RED_T, TEAL_T = B.RED_T, B.TEAL_T
    BLUE, PINK, MINT, CREAM = "#d9f2f6", "#fde3dc", "#e3f1e6", "#fff9e8"
    card = B.card

    def split(x, y, head, tail, size=40, col=TEAL_T):
        """One word with its ending in colour (the part that rhymes)."""
        return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="800" fill="{INK}" text-anchor="middle">'
                f'{escape(head)}<tspan fill="{col}">{escape(tail)}</tspan></text>')

    def struck(x, y, s, size=17, fill=RED_T, anchor="start"):
        """Text with a line through it — a sentence the summary drops."""
        return (f'<text x="{x}" y="{y}" font-size="{size}" font-weight="700" fill="{fill}" text-anchor="{anchor}" '
                f'style="text-decoration:line-through">{escape(s)}</text>')

    def pitch(x0, x1, y, fall=True, col=TEAL):
        """The tune of a sentence: level, then a fall or a rise on the last stressed word."""
        end = y + 34 if fall else y - 34
        return (f'<path d="M{x0} {y} L{x1 - 90} {y} Q{x1 - 35} {y} {x1} {end}" fill="none" stroke="{col}" '
                f'stroke-width="4" stroke-linecap="round" marker-end="url(#a)"/>')

    def letters(x, y, word, silent=(), hi=()):
        """A word as letter tiles; a silent letter is crossed through (still dark enough to read)."""
        b = ""
        for i, ch in enumerate(word):
            bx = x + i * 56
            if i in silent:
                b += R(bx, y, 48, 60, "#fff", CORAL, 6, 2, False) + T(bx + 24, y + 42, ch, 30, 800, RED_T)
                b += L(bx + 6, y + 54, bx + 42, y + 6, CORAL, 3)
            else:
                b += R(bx, y, 48, 60, BLUE if i in hi else SOFT, TEAL if i in hi else INK, 6, 1.5, False) + T(bx + 24, y + 42, ch, 30, 800)
        return b

    def chip_w(w, size):
        return max(28, int(len(w) * size * 0.56)) + 16      # the same estimate B.words lays chips out with

    def row_w(parts, size):
        return sum(chip_w(w, size) for w, _ in parts) + 8 * (len(parts) - 1)

    def mid(y, parts, size=24):
        """A row of B.words chips, centred on the frame."""
        return Wd(int(320 - row_w(parts, size) / 2), y, parts, size)

    def centres(parts, size):
        x, out = 320 - row_w(parts, size) / 2, []
        for w, _ in parts:
            out.append(int(x + chip_w(w, size) / 2)); x += chip_w(w, size) + 8
        return out

    def lead(x1, y, x2=284):
        return L(x1, y, x2, y, INK2, 1.5, False, "4 4")

    # ── Stage 1 + 5: synonyms, antonyms, nearest and opposite in meaning ────────────────────────────────
    card("en-synonyms", ["EN-010", "EN-050"], "Synonyms and antonyms: same side or opposite ends", [
        (S("Two ends of a line", L(320, 180, 70, 180, INK, 3, True) + L(320, 180, 570, 180, INK, 3, True) + C(320, 180, 7, INK, INK)
           + R(50, 80, 220, 70, BLUE, TEAL) + T(160, 123, "small · little · tiny", 20, 800)
           + R(370, 80, 220, 70, PINK, CORAL) + T(480, 123, "big · large · huge", 20, 800)
           + T(160, 222, "synonyms: same meaning", 16, 700, TEAL_T) + T(480, 222, "synonyms: same meaning", 16, 700, RED_T)
           + T(320, 285, "small and big sit at opposite ends: antonyms", 20, 800)),
         "Synonyms sit together on the same side; antonyms sit at opposite ends."),
        (S("Nearest in meaning, in this sentence", T(320, 80, "The pupils were elated by the result.", 24, 800)
           + R(50, 125, 170, 64, MINT, GREEN) + T(135, 165, "overjoyed ✓", 19, 800, GREEN)
           + R(235, 125, 170, 64, PINK, CORAL) + T(320, 165, "elevated ✗", 19, 800, RED_T)
           + R(420, 125, 170, 64, SOFT) + T(505, 165, "surprised ✗", 19, 800, INK2)
           + T(320, 250, "swap each option into the sentence and read it", 18, 700, TEAL_T)
           + T(320, 285, "only one keeps the meaning", 17, 700, INK2)),
         "'Nearest in meaning' means nearest in THIS sentence: swap each option in and read it aloud."),
        (S("Opposites", T(320, 70, "Opposites made with a prefix", 18, 700, INK2)
           + T(320, 115, "happy → unhappy    legal → illegal", 24, 800) + T(320, 160, "possible → impossible    honest → dishonest", 24, 800)
           + T(320, 235, "keep the word class: generous → mean", 20, 800, TEAL_T) + T(320, 270, "(an adjective for an adjective — not 'generosity')", 17, 700, RED_T)),
         "An antonym must be the same kind of word: an adjective for an adjective."),
    ], "Cover it. Give a synonym and an antonym for 'brave'. What is the opposite of 'regular'?")

    # ── EN-012 prepositions ────────────────────────────────────────────────────────────────────────────
    def scene(x, kind):
        b = R(x + 15, 120, 80, 60, SOFT, INK, 4, 2, False)
        pos = {"in": (x + 55, 152), "on": (x + 55, 105), "under": (x + 55, 200), "beside": (x + 115, 158)}[kind]
        return b + C(pos[0], pos[1], 14, CORAL, INK, 1.5) + T(x + 55, 262, kind, 24, 800)
    card("en-prepositions", ["EN-012"], "Prepositions: where and when", [
        (S("In, on, under, beside", "".join(scene(30 + i * 150, k) for i, k in enumerate(["in", "on", "under", "beside"]))
           + T(320, 60, "Where is the ball?", 22, 800) + T(320, 305, "the ball in relation to the box", 16, 700, INK2)),
         "A preposition shows where one thing is in relation to another."),
        (S("At, on, in for time", R(40, 40, 560, 270, SOFT) + T(320, 75, "IN — months, years, seasons: in June, in 2026", 18, 700)
           + R(90, 95, 460, 195, BLUE, TEAL) + T(320, 130, "ON — days and dates: on Monday, on 1 October", 17, 700)
           + R(160, 155, 320, 110, GOLD, INK) + T(320, 200, "AT — a point in time", 20, 800) + T(320, 238, "at 7 o'clock · at noon · at night", 17, 700)),
         "IN for the biggest stretch of time, ON for a day, AT for a point."),
        (S("Fixed partners", T(60, 80, "We discussed the plan.", 22, 800, INK, "start") + T(590, 80, "not 'discussed about'", 16, 700, RED_T, "end")
           + T(60, 135, "She is good at maths.", 22, 800, INK, "start") + T(590, 135, "not 'good in'", 16, 700, RED_T, "end")
           + T(60, 190, "He entered the hall.", 22, 800, INK, "start") + T(590, 190, "not 'entered into'", 16, 700, RED_T, "end")
           + T(60, 245, "Congratulations on your result!", 22, 800, INK, "start") + T(590, 245, "not 'for'", 16, 700, RED_T, "end")
           + T(320, 300, "some verbs take a fixed preposition — some take none", 16, 700, INK2)),
         "Some words choose their own preposition and some need none: learn them in pairs."),
    ], "Cover it. Fill: 'I was born ___ 2012, ___ a Sunday, ___ dawn.' Correct: 'Let us discuss about it.'")

    # ── EN-014 question tags ───────────────────────────────────────────────────────────────────────────
    QA, QB = [("Ada is coming,", BLUE), ("isn't she?", PINK)], [("You don't eat pork,", PINK), ("do you?", BLUE)]
    card("en-question-tags", ["EN-014"], "Question tags: flip the sentence", [
        (S("Positive, then negative", mid(160, QA, 28)
           + T(centres(QA, 28)[0], 92, "+ positive", 18, 800, TEAL_T) + T(centres(QA, 28)[1], 92, "− negative", 18, 800, RED_T)
           + T(320, 250, "a positive sentence takes a negative tag", 20, 800)),
         "A positive sentence takes a negative tag."),
        (S("Negative, then positive", mid(160, QB, 28)
           + T(centres(QB, 28)[0], 92, "− negative", 18, 800, RED_T) + T(centres(QB, 28)[1], 92, "+ positive", 18, 800, TEAL_T)
           + T(320, 250, "a negative sentence takes a positive tag", 20, 800)),
         "A negative sentence takes a positive tag."),
        (S("Repeat the helper verb", T(320, 70, "She plays football, doesn't she?", 24, 800) + T(320, 115, "They have finished, haven't they?", 24, 800)
           + T(320, 160, "You can swim, can't you?", 24, 800) + T(320, 225, "✗ You are coming, isn't it?", 20, 800, RED_T)
           + T(320, 265, "✓ You are coming, aren't you?", 20, 800, GREEN)),
         "Repeat the helping verb (do, have, can, are) and the pronoun — never a one-size 'isn't it?'."),
    ], "Cover it. Add the tags: 'Chidi was late, ___?' 'They won't come, ___?' 'Bisi sings well, ___?'")

    # ── EN-021, EN-022 vowels ──────────────────────────────────────────────────────────────────────────
    card("en-vowels", ["EN-021", "EN-022"], "Vowel sounds: short, long and gliding", [
        (S("Short and long", T(150, 112, "ship", 32, 800) + R(240, 88, 80, 32, TEAL, INK, 6, 1.5, False) + T(340, 112, "/ɪ/ short", 20, 800, TEAL_T, "start")
           + T(150, 202, "sheep", 32, 800) + R(240, 178, 240, 32, CORAL, INK, 6, 1.5, False) + T(496, 202, "/iː/ long", 20, 800, RED_T, "start")
           + T(320, 280, "the mark ː means: hold the sound longer", 18, 700, INK2)),
         "A long vowel is held longer — and it changes the word: ship, sheep."),
        (S("Pairs", T(200, 70, "short", 20, 800, TEAL_T) + T(440, 70, "long", 20, 800, RED_T)
           + "".join(T(200, 120 + i * 48, a, 26, 800) + L(270, 112 + i * 48, 370, 112 + i * 48, LINE, 2) + T(440, 120 + i * 48, b, 26, 800)
                     for i, (a, b) in enumerate([("ship", "sheep"), ("full", "fool"), ("cot", "caught"), ("sit", "seat")]))
           + T(320, 315, "say each pair aloud: only the vowel changes", 16, 700, INK2)),
         "Say each pair aloud: the only thing that changes is the vowel."),
        (S("Diphthongs glide", "".join(C(x - 44, 150, 11, GOLD) + L(x - 30, 150, x + 28, 150, INK2, 2.5, True) + C(x + 44, 150, 11, TEAL)
                                         + T(x - 44, 122, a, 20, 800) + T(x + 44, 122, b, 20, 800, TEAL_T) + T(x, 210, w, 30, 800) + T(x, 245, ipa, 20, 700, INK2)
                                         for x, w, ipa, a, b in [(120, "day", "/eɪ/", "e", "ɪ"), (320, "go", "/əʊ/", "ə", "ʊ"), (520, "boy", "/ɔɪ/", "ɔ", "ɪ")])
           + T(320, 300, "a diphthong glides from one vowel to another", 18, 700)),
         "A diphthong is two vowels in one syllable: the mouth glides from the first to the second."),
    ], "Cover it. Is the vowel in 'pool' short or long? Which has a diphthong: 'bed', 'bead' or 'bide'?")

    # ── EN-023, EN-024 th, sh, ch, j, zh ──────────────────────────────────────────────────────────────
    teeth = (R(70, 106, 150, 28, "#fff", INK, 4, 2, False) + R(70, 176, 150, 28, "#fff", INK, 4, 2, False)
             + "".join(L(70 + k * 25, 108, 70 + k * 25, 132, LINE, 1.5) + L(70 + k * 25, 178, 70 + k * 25, 202, LINE, 1.5) for k in range(1, 6))
             + f'<ellipse cx="195" cy="155" rx="100" ry="15" fill="{PINK}" stroke="{CORAL}" stroke-width="2"/>'
             + T(145, 92, "teeth", 16, 700, INK2) + T(250, 236, "tongue tip out", 16, 700, RED_T) + L(262, 220, 282, 172, CORAL, 2, True))
    card("en-th-sh", ["EN-023", "EN-024"], "th, sh, ch, j and zh: where the tongue goes", [
        (S("The th sounds", teeth + T(320, 100, "think · three · thank", 22, 800, INK, "start") + T(320, 130, "breath only", 16, 700, INK2, "start")
           + T(320, 185, "this · that · mother", 22, 800, TEAL_T, "start") + T(320, 215, "add your voice", 16, 700, INK2, "start")
           + T(320, 290, "not 'tink' or 'dis': the tongue must show", 18, 700, RED_T)),
         "For th, put the tip of your tongue between your teeth and blow — add your voice for 'this'."),
        (S("Four sounds in two pairs", R(60, 50, 250, 105, BLUE, TEAL) + T(185, 90, "sh  /ʃ/", 24, 800) + T(185, 128, "ship · sugar · nation", 17, 700, INK2)
           + R(330, 50, 250, 105, PINK, CORAL) + T(455, 90, "zh  /ʒ/", 24, 800) + T(455, 128, "measure · television", 17, 700, INK2)
           + R(60, 170, 250, 105, BLUE, TEAL) + T(185, 210, "ch  /tʃ/", 24, 800) + T(185, 248, "chip · watch · picture", 17, 700, INK2)
           + R(330, 170, 250, 105, PINK, CORAL) + T(455, 210, "j  /dʒ/", 24, 800) + T(455, 248, "jam · bridge · giant", 17, 700, INK2)
           + T(185, 308, "breath only", 16, 700, TEAL_T) + T(455, 308, "add your voice", 16, 700, RED_T)),
         "sh and zh are a pair, ch and j are a pair: the same tongue, but the right-hand one adds your voice."),
        (S("Spelling hides the sound", "".join(T(250, 80 + i * 50, w, 26, 800, INK, "end") + L(275, 72 + i * 50, 345, 72 + i * 50, INK2, 2.5, True) + T(370, 80 + i * 50, s, 26, 800, TEAL_T, "start")
                                                  for i, (w, s) in enumerate([("nation", "sh"), ("measure", "zh"), ("soldier", "j"), ("machine", "sh")]))
           + T(320, 290, "the letters do not tell you the sound — listen", 18, 700, INK2)),
         "English letters often hide the sound: -tion says sh, -sure says zh."),
    ], "Cover it. Which sound is in 'thin' and which in 'then'? Sort: shoe, pleasure, cheap, judge.")

    # ── EN-025, EN-076 silent letters and consonant clusters ──────────────────────────────────────────
    card("en-silent-clusters", ["EN-025", "EN-076"], "Count the sounds, not the letters", [
        (S("Silent letters", letters(208, 40, "lamb", {3}) + letters(152, 140, "listen", {3})
           + T(320, 255, "the b in lamb and the t in listen are written, not said", 17, 700, INK2)
           + T(320, 295, "also: knee · write · hour · castle", 18, 800)),
         "Silent letters are written but not said: lamb, listen, knee, write, hour."),
        (S("A consonant cluster", letters(156, 70, "street", (), {0, 1, 2})
           + T(320, 200, "three consonants together — say every one", 19, 800, TEAL_T)
           + T(320, 255, "✗ 'si-treet': never add a vowel to break it up", 18, 700, RED_T)
           + T(320, 295, "also at the end: tests · texts · sixth", 17, 700, INK2)),
         "A cluster is two or three consonants with no vowel between: say them together, adding nothing."),
        (S("Counting sounds", T(100, 100, "fish", 30, 800) + T(215, 100, "4 letters", 17, 700, INK2) + T(395, 100, "/f/ /ɪ/ /ʃ/", 24, 800, TEAL_T) + T(560, 100, "3 sounds", 18, 800, TEAL_T)
           + T(100, 180, "box", 30, 800) + T(215, 180, "3 letters", 17, 700, INK2) + T(395, 180, "/b/ /ɒ/ /k/ /s/", 24, 800, RED_T) + T(560, 180, "4 sounds", 18, 800, RED_T)
           + T(320, 265, "sh, th and ck are one sound · x is two", 19, 800)),
         "Letters and sounds do not match one to one: count what you hear."),
    ], "Cover it. Which letter is silent in 'thumb', 'knot' and 'castle'? How many sounds are in 'ship' and in 'splash'?")

    # ── EN-028 rhymes ──────────────────────────────────────────────────────────────────────────────────
    card("en-rhymes", ["EN-028"], "Rhymes are matched by sound, not spelling", [
        (S("Same ending", split(160, 140, "c", "at") + split(320, 140, "h", "at") + split(480, 140, "m", "at")
           + T(320, 225, "same last vowel sound + what follows", 20, 800, TEAL_T) + T(320, 265, "= a rhyme", 20, 800)),
         "Words rhyme when the last vowel sound and everything after it match."),
        (S("Different spelling, same sound", split(160, 140, "b", "ite") + split(320, 140, "l", "ight") + split(480, 140, "h", "eight")
           + T(320, 230, "different spelling, same sound: they rhyme ✓", 20, 800, TEAL_T)),
         "The spelling can differ: bite, light and height all rhyme, because they sound alike."),
        (S("Same spelling, different sound", "".join(split(220, 80 + i * 65, a, b, 32, RED_T) + T(320, 80 + i * 65, "—", 28, 700, INK2) + split(420, 80 + i * 65, c, d, 32, RED_T)
                                                      for i, (a, b, c, d) in enumerate([("c", "ow", "l", "ow"), ("g", "ood", "f", "ood"), ("s", "aid", "p", "aid")]))
           + T(320, 290, "same spelling, different sound: no rhyme ✗", 20, 800, RED_T)),
         "And the same spelling can hide different sounds: cow and low do not rhyme. Say them aloud."),
    ], "Cover it. Which pair rhymes: 'hair/there', 'bear/fear', 'blood/mood'? Say them aloud first.")

    # ── EN-030 intonation ─────────────────────────────────────────────────────────────────────────────
    card("en-intonation", ["EN-030"], "Intonation: the tune of a sentence", [
        (S("A statement falls", pitch(110, 540, 100, True, TEAL) + T(320, 195, "We are going to Kano.", 30, 800)
           + T(320, 265, "a statement FALLS at the end", 20, 800, TEAL_T)),
         "The voice falls at the end of a statement: it tells."),
        (S("A yes/no question rises", pitch(110, 540, 134, False, CORAL) + T(320, 195, "Are you going to Kano?", 30, 800)
           + T(320, 265, "a yes/no question RISES at the end", 20, 800, RED_T)),
         "The voice rises at the end of a yes/no question: it asks."),
        (S("Wh- questions fall", pitch(130, 510, 60, True, TEAL) + T(320, 128, "Where are you going?", 26, 800)
           + pitch(130, 510, 210, False, CORAL) + T(320, 252, "You're going to Kano?", 26, 800)
           + T(320, 305, "wh- questions fall · a statement said as a question rises", 16, 700, INK2)),
         "A wh- question (who, where, why) falls like a statement; let a statement rise and it becomes a question."),
    ], "Cover it. Rising or falling: 'Is it raining?' 'What is your name?' 'I live in Enugu.'")

    # ── EN-034, EN-035 phrasal verbs and idioms ───────────────────────────────────────────────────────
    card("en-phrasal-idioms", ["EN-034", "EN-035"], "Phrasal verbs and idioms: more than their parts", [
        (S("Give + up", mid(130, [("give", BLUE), ("+", None), ("up", GOLD), ("=", None), ("stop", MINT)], 30)
           + T(320, 215, "He gave up smoking = he stopped smoking.", 21, 800)
           + T(320, 265, "the small word changes what the verb means", 17, 700, INK2)),
         "A phrasal verb is a verb plus a small word, and together they mean something new."),
        (S("One verb, four meanings", "".join(T(250, 80 + i * 50, "give " + p, 24, 800, INK, "end") + L(270, 72 + i * 50, 330, 72 + i * 50, INK2, 2.5, True) + T(350, 80 + i * 50, m, 21, 700, TEAL_T, "start")
                                               for i, (p, m) in enumerate([("up", "stop"), ("in", "surrender"), ("out", "share out"), ("away", "give for free")]))
           + T(320, 290, "change the small word, change the meaning", 17, 700, INK2)),
         "Change the small word and the meaning changes: give up, give in, give out, give away."),
        (S("Idioms", "".join(T(320, 72 + i * 80, a, 22, 800) + T(320, 104 + i * 80, "= " + b, 19, 700, TEAL_T)
                             for i, (a, b) in enumerate([("The test was a piece of cake.", "it was very easy"), ("She let the cat out of the bag.", "she told the secret"), ("The thief took to his heels.", "he ran away")]))),
         "An idiom cannot be worked out word by word: learn it as one unit, with its meaning."),
    ], "Cover it. What does 'look after' mean? And 'to bury the hatchet'?")

    # ── EN-039 modal verbs ────────────────────────────────────────────────────────────────────────────
    sure = [(100, "might", BLUE), (190, "may", BLUE), (280, "could", BLUE), (385, "should", GOLD), (480, "must", PINK), (560, "will", PINK)]
    card("en-modals", ["EN-039"], "Modal verbs: how sure, how necessary", [
        (S("A line of certainty", L(60, 160, 600, 160, INK, 3, True) + "".join(C(x, 160, 10, c, INK) + T(x, 128, w, 20, 800) for x, w, c in sure)
           + T(70, 205, "less sure", 17, 700, INK2, "start") + T(580, 205, "certain", 17, 700, INK2, "end")
           + T(320, 270, "It might rain.  ·  It will rain.", 24, 800)),
         "Modals show how sure the speaker is: 'might' is a maybe, 'must' and 'will' are near certain."),
        (S("Ability, permission, duty, advice", "".join(R(40 + (i % 2) * 290, 50 + (i // 2) * 130, 270, 110, f, s) + T(175 + (i % 2) * 290, 92 + (i // 2) * 130, w, 26, 800)
                                                        + T(175 + (i % 2) * 290, 130 + (i // 2) * 130, e, 17, 700, INK2)
                                                        for i, (w, e, f, s) in enumerate([("can", "ability: She can swim.", BLUE, TEAL), ("may", "permission: May I go out?", MINT, GREEN),
                                                                                          ("must", "duty: You must obey.", PINK, CORAL), ("should", "advice: You should rest.", GOLD, INK)]))),
         "They also show ability (can), permission (may), duty (must) and advice (should)."),
        (S("Modal + bare verb", T(320, 80, "She can swim. ✓", 30, 800, GREEN) + T(320, 135, "✗ She can swims.    ✗ She can to swim.", 22, 800, RED_T)
           + T(320, 195, "modal + the bare verb: no -s, no 'to'", 21, 800)
           + T(320, 265, "a guess about the past: She must have left early.", 18, 700, TEAL_T)),
         "After a modal comes the bare verb. 'Must have done' is a confident guess about the past."),
    ], "Cover it. Correct: 'He should goes home.' Which is surer: 'It may be Ada' or 'It must be Ada'?")

    # ── EN-040 gerunds and infinitives ────────────────────────────────────────────────────────────────
    card("en-gerunds", ["EN-040"], "-ing or to? The verb in front decides", [
        (S("Two families of verbs", R(50, 50, 250, 215, BLUE, TEAL) + T(175, 88, "verb + -ing", 22, 800, TEAL_T)
           + "".join(T(175, 130 + i * 35, s, 19, 700) for i, s in enumerate(["enjoy swimming", "finish eating", "avoid shouting", "keep trying"]))
           + R(340, 50, 250, 215, PINK, CORAL) + T(465, 88, "verb + to", 22, 800, RED_T)
           + "".join(T(465, 130 + i * 35, s, 19, 700) for i, s in enumerate(["want to swim", "hope to win", "decide to go", "refuse to pay"]))
           + T(320, 302, "learn each verb with its partner", 17, 700, INK2)),
         "Some verbs take -ing (I enjoy swimming); others take to (I want to swim)."),
        (S("The gerund is a noun", mid(130, [(" Swimming ", GOLD), ("is good exercise.", None)], 28)
           + T(320, 215, "an -ing word used as a noun: the gerund", 20, 800)
           + T(320, 265, "after a preposition, always -ing:", 17, 700, INK2) + T(320, 295, "good at drawing · tired of waiting", 17, 700, TEAL_T)),
         "A gerund is an -ing word used as a noun. After a preposition, use -ing: 'interested in reading'."),
        (S("Stop smoking, stop to smoke", T(320, 80, "He stopped smoking.", 26, 800, TEAL_T) + T(320, 115, "he does not smoke any more", 17, 700, INK2)
           + T(320, 185, "He stopped to smoke.", 26, 800, RED_T) + T(320, 220, "he paused so that he could smoke", 17, 700, INK2)
           + T(320, 285, "the same with remember, forget and try", 17, 700)),
         "With stop, remember and forget, choosing -ing or to changes the meaning."),
    ], "Cover it. Choose: 'I enjoy (to read / reading).' 'She refused (paying / to pay).' What is 'remember to lock' versus 'remember locking'?")

    # ── EN-041, EN-048, EN-074 main idea and summary ──────────────────────────────────────────────────
    details = [(40, "wells are", "drying up"), (245, "women walk", "far for it"), (450, "farms need", "it for crops")]
    card("en-main-idea", ["EN-041", "EN-048", "EN-074"], "The main idea holds up the details", [
        (S("A table top on legs", R(100, 50, 440, 56, GOLD, INK) + T(320, 85, "Main idea: water is precious in Kano.", 19, 800)
           + "".join(R(x + 65, 106, 20, 82, SOFT, INK, 2, 1.5, False) + R(x, 188, 150, 76, BLUE, TEAL) + T(x + 75, 220, a, 17, 700) + T(x + 75, 246, b, 17, 700) for x, a, b in details)
           + T(320, 305, "every detail holds up the one main point", 16, 700, INK2)),
         "The main idea is the one point every other sentence supports — a table top on its legs."),
        (S("Keep the points, drop the rest", T(40, 80, "✓", 20, 800, GREEN, "start") + T(70, 80, "Exercise keeps the heart strong.", 17, 700, INK, "start")
           + T(40, 125, "✗", 20, 800, RED_T, "start") + struck(70, 125, "For example, my uncle jogs every morning in Ibadan.")
           + T(40, 170, "✓", 20, 800, GREEN, "start") + T(70, 170, "It also lowers stress.", 17, 700, INK, "start")
           + T(40, 215, "✗", 20, 800, RED_T, "start") + struck(70, 215, "As I said, the heart grows stronger.")
           + T(320, 285, "keep the points · drop examples and repeats", 18, 800, TEAL_T)),
         "To summarise, keep the points and drop the examples, the repeats and the decoration."),
        (S("One point, one sentence", "".join(R(60, 45 + i * 70, 520, 54, MINT if i % 2 == 0 else SOFT, LINE, 8) + T(90, 80 + i * 70, str(i + 1), 22, 800, TEAL_T)
                                              + T(120, 80 + i * 70, s, 20, 700, INK, "start") for i, s in enumerate(["Exercise strengthens the heart.", "It reduces stress.", "It helps you sleep well."]))
           + T(320, 300, "one point · one short sentence · your own words", 17, 700, INK2)),
         "Write each point as one short sentence of your own — numbered, if the question asks for points."),
    ], "Cover it. What three things does a summary leave out? Summarise a paragraph you read today in two sentences.")

    # ── EN-042, EN-043, EN-070, EN-073 inference, words in context, own words ─────────────────────────
    def box3(x, head, l1, l2, fill, stroke, col):
        return R(x, 80, 180, 140, fill, stroke) + T(x + 90, 115, head, 17, 800, col) + T(x + 90, 160, l1, 17, 700) + T(x + 90, 188, l2, 17, 700)
    card("en-inference", ["EN-042", "EN-043", "EN-070", "EN-073"], "Reading between the lines", [
        (S("Clue + what you know = inference", box3(20, "clue in the text", "Emeka shook", "a wet umbrella.", BLUE, TEAL, TEAL_T)
           + T(215, 160, "+", 30, 800) + box3(230, "what you know", "umbrellas are", "used in rain", SOFT, LINE, INK2)
           + T(425, 160, "=", 30, 800) + box3(440, "inference", "It is raining", "outside.", GOLD, INK, INK)
           + T(320, 280, "the text never says it — you work it out", 18, 700, INK2)),
         "The text does not say it is raining: you infer it from a clue plus what you already know."),
        (S("The clue is nearby", mid(110, [("The market was", None), (" teeming; ", GOLD)], 26) + mid(180, [("we could hardly move.", BLUE)], 26)
           + T(320, 255, "the nearby clue tells you: teeming = very crowded", 19, 800, TEAL_T)),
         "When a word is new, the words around it are the clue: 'we could hardly move' means teeming is very crowded."),
        (S("In your own words", T(320, 70, "Text: 'The pupils were jubilant.'", 20, 700, INK2)
           + R(40, 105, 270, 120, PINK, CORAL) + T(175, 155, "They were jubilant.", 20, 800) + T(175, 195, "✗ copied from the text", 16, 700, RED_T)
           + R(330, 105, 270, 120, MINT, GREEN) + T(465, 155, "They were very happy.", 20, 800) + T(465, 195, "✓ your own words", 16, 700, GREEN)
           + T(320, 280, "change the key word · answer in a full sentence", 17, 700, INK2)),
         "When asked for your own words, change the key word — copying it from the text earns nothing."),
    ], "Cover it. 'Ngozi stared at her plate and said nothing.' What can you infer, and which clue told you?")

    # ── EN-044 fact and opinion ───────────────────────────────────────────────────────────────────────
    card("en-fact-opinion", ["EN-044"], "Fact or opinion? Can it be checked?", [
        (S("Fact and opinion", R(40, 40, 560, 115, BLUE, TEAL) + T(320, 85, "Lagos is in south-west Nigeria.", 24, 800) + T(320, 128, "FACT — it can be checked", 19, 800, TEAL_T)
           + R(40, 175, 560, 115, PINK, CORAL) + T(320, 220, "Lagos is the best city in Nigeria.", 24, 800) + T(320, 263, "OPINION — people can disagree", 19, 800, RED_T)),
         "A fact can be checked and proved; an opinion is someone's judgement."),
        (S("Signal words", mid(110, [("best", PINK), ("worst", PINK), ("beautiful", PINK), ("should", PINK)], 26)
           + mid(185, [("I think", PINK), ("in my view", PINK), ("terrible", PINK)], 26)
           + T(320, 270, "words that JUDGE signal an opinion", 20, 800, RED_T)),
         "Words that judge — best, beautiful, should, I think — signal an opinion."),
        (S("Both in one sentence", mid(90, [("Our team won 3–1,", BLUE)], 26) + T(320, 142, "FACT — it can be checked", 18, 800, TEAL_T)
           + mid(205, [("and it was the greatest match ever.", PINK)], 24) + T(320, 255, "OPINION — a judgement", 18, 800, RED_T)
           + T(320, 305, "one sentence can hold both — split it and test each part", 16, 700, INK2)),
         "One sentence can mix the two: split it and test each part."),
    ], "Cover it. Fact or opinion: 'Rice is grown in Kebbi.' 'Jollof rice is the tastiest food.' Which word told you?")

    # ── EN-049, EN-059 register and writing for the occasion ──────────────────────────────────────────
    card("en-register", ["EN-049", "EN-059"], "Register: dress your words for the occasion", [
        (S("From informal to formal", L(80, 170, 570, 170, INK, 3, True) + C(120, 170, 11, BLUE) + C(320, 170, 11, GOLD) + C(520, 170, 11, PINK)
           + T(120, 130, "informal", 19, 800, TEAL_T) + T(320, 130, "semi-formal", 19, 800) + T(520, 130, "formal", 19, 800, RED_T)
           + T(120, 215, "to a friend", 16, 700, INK2) + T(320, 215, "to a neighbour", 16, 700, INK2) + T(520, 215, "to the principal", 16, 700, INK2)
           + T(120, 265, "Hey, what's up?", 18, 800) + T(320, 265, "Good morning, Mr Bello.", 18, 800) + T(525, 265, "Dear Sir,", 18, 800)),
         "Register is how formal your language is — chosen by who you are speaking or writing to."),
        (S("The same words, dressed up", T(200, 70, "informal", 20, 800, TEAL_T) + T(440, 70, "formal", 20, 800, RED_T)
           + "".join(T(200, 120 + i * 48, a, 24, 800) + L(270, 112 + i * 48, 360, 112 + i * 48, INK2, 2.5, True) + T(440, 120 + i * 48, b, 24, 800)
                     for i, (a, b) in enumerate([("kids", "children"), ("gonna", "going to"), ("a lot of", "many"), ("Thanks!", "Thank you.")]))
           + T(320, 315, "formal writing avoids slang and short forms", 16, 700, INK2)),
         "Formal writing avoids slang and contractions: 'gonna' becomes 'going to', 'kids' becomes 'children'."),
        (S("Audience and purpose decide", R(30, 60, 260, 95, SOFT) + T(160, 98, "Who will read it?", 20, 800) + T(160, 132, "a friend, the principal, the PTA", 16, 700, INK2)
           + R(30, 185, 260, 95, SOFT) + T(160, 223, "Why am I writing?", 20, 800) + T(160, 257, "to inform, persuade, thank", 16, 700, INK2)
           + L(298, 110, 372, 160, INK2, 2.5, True) + L(298, 230, 372, 185, INK2, 2.5, True)
           + R(380, 120, 230, 105, GOLD, INK) + T(495, 162, "the right register", 19, 800) + T(495, 194, "and layout", 19, 800)),
         "Before writing a speech, report or article, ask who will read it and why: that decides the register."),
    ], "Cover it. Make formal: 'The kids were gonna wreck the place.' Who is the audience of a PTA speech?")

    # ── EN-052, EN-053, EN-077 letters ────────────────────────────────────────────────────────────────
    def body_lines(y0, n):
        return "".join(L(56, y0 + i * 12, 238 if i % 3 != 2 else 190, y0 + i * 12, LINE, 3) for i in range(n))
    page = R(40, 15, 220, 300, "#fff", INK, 4, 1.5, False)
    formal = (page + R(170, 28, 76, 42, BLUE, TEAL, 3, 1.5, False) + R(54, 80, 76, 36, MINT, GREEN, 3, 1.5, False)
              + R(54, 124, 56, 12, GOLD, INK, 2, 1, False) + R(80, 144, 140, 12, PINK, CORAL, 2, 1, False) + body_lines(170, 6)
              + R(54, 248, 86, 12, GOLD, INK, 2, 1, False) + R(54, 268, 70, 26, SOFT, INK2, 2, 1, False))
    labels = lambda rows: "".join(lead(x1, y - 6) + T(294, y, s, 17, 700, c, "start") for x1, y, s, c in rows)
    informal = (page + R(170, 28, 76, 42, BLUE, TEAL, 3, 1.5, False) + R(54, 92, 56, 12, GOLD, INK, 2, 1, False) + body_lines(118, 10)
                + R(54, 248, 86, 12, GOLD, INK, 2, 1, False) + R(54, 268, 46, 16, SOFT, INK2, 2, 1, False))
    card("en-letters", ["EN-052", "EN-053", "EN-077"], "Three letters, three layouts", [
        (S("The formal letter", formal + labels([(250, 54, "your address and the date", INK), (134, 103, "the receiver's address", GREEN),
                                                 (114, 136, "Dear Sir, / Dear Madam,", INK), (224, 163, "a TITLE: what it is about", RED_T),
                                                 (242, 205, "the body, in paragraphs", INK2), (144, 260, "Yours faithfully,", INK), (128, 290, "signature and full name", INK2)])),
         "A formal letter has two addresses, a title, 'Dear Sir/Madam' and 'Yours faithfully'."),
        (S("The informal letter", informal + labels([(250, 54, "your address and the date", INK), (114, 104, "Dear Bola,", INK),
                                                     (242, 160, "no receiver's address, no title", RED_T), (242, 200, "a chatty body: news, questions", INK2),
                                                     (144, 260, "Your friend,", INK), (104, 288, "your first name", INK2)])),
         "An informal letter, to a friend or relative, has one address, no title, and ends with your first name."),
        (S("Begin and end", T(330, 60, "begins", 18, 800, INK2) + T(505, 60, "ends", 18, 800, INK2)
           + "".join(R(30, 80 + i * 66, 580, 56, f, s, 8, 1.5, False) + T(110, 115 + i * 66, k, 19, 800, c) + T(330, 115 + i * 66, a, 19, 700) + T(505, 115 + i * 66, b, 19, 700)
                     for i, (k, a, b, f, s, c) in enumerate([("formal", "Dear Sir,", "Yours faithfully,", PINK, CORAL, RED_T),
                                                             ("semi-formal", "Dear Mr Okafor,", "Yours sincerely,", GOLD, INK, INK),
                                                             ("informal", "Dear Bola,", "Your friend,", BLUE, TEAL, TEAL_T)]))
           + T(320, 300, "semi-formal: someone you know and respect — a teacher, a pastor", 16, 700, INK2)),
         "Match the ending to the greeting: 'Sir' → faithfully; a name → sincerely; a friend → your first name."),
    ], "Cover it. Draw the formal layout from memory. How do you end a letter that begins 'Dear Mrs Adeyemi'?")

    # ── EN-051, EN-056 combining sentences and saying it in fewer words ───────────────────────────────
    card("en-concise", ["EN-051", "EN-056"], "Join and trim: say it in fewer words", [
        (S("Join with a linking word", T(320, 70, "Musa was tired.  He kept on working.", 23, 800, INK2) + L(320, 92, 320, 132, INK2, 2.5, True)
           + T(320, 170, "Although Musa was tired, he kept on working.", 23, 800, TEAL_T)
           + T(320, 250, "although · because · when · so · but", 20, 800)),
         "Join two short sentences with a word that shows how they relate: although, because, when."),
        (S("Fold one inside the other", T(320, 70, "The girl won the prize.  She is my sister.", 22, 800, INK2) + L(320, 92, 320, 132, INK2, 2.5, True)
           + T(320, 170, "The girl who won the prize is my sister.", 23, 800, TEAL_T)
           + T(320, 250, "who for people · which for things", 20, 800)),
         "A 'who' or 'which' clause folds one sentence inside another."),
        (S("Cut what adds nothing", "".join(T(290, 80 + i * 50, a, 20, 700, RED_T, "end") + L(305, 72 + i * 50, 355, 72 + i * 50, INK2, 2.5, True) + T(370, 80 + i * 50, b, 22, 800, TEAL_T, "start")
                                            for i, (a, b) in enumerate([("at this point in time", "now"), ("in spite of the fact that", "although"), ("due to the fact that", "because"), ("return back", "return")]))
           + T(320, 295, "cut every word that adds no meaning", 17, 700, INK2)),
         "Cut the words that add nothing: 'due to the fact that' is just 'because'."),
    ], "Cover it. Join: 'It rained. The match went on.' Shorten: 'He is a man who is very kind.'")

    # ── EN-057 common errors in usage ─────────────────────────────────────────────────────────────────
    def fix(rows, y0=70, gap=78):
        return "".join(T(300, y0 + i * gap, "✗ " + a, 20, 800, RED_T, "end") + L(312, y0 - 7 + i * gap, 348, y0 - 7 + i * gap, INK2, 2.5, True)
                       + T(360, y0 + i * gap, "✓ " + b, 20, 800, GREEN, "start") + T(320, y0 + 30 + i * gap, n, 16, 700, INK2) for i, (a, b, n) in enumerate(rows))
    card("en-usage", ["EN-057"], "Common errors: say it the standard way", [
        (S("Everyday errors", fix([("Borrow me your pen.", "Lend me your pen.", "lend = give for a while · borrow = take"),
                                   ("Off the light.", "Switch off the light.", "'off' is not a verb"),
                                   ("I am having two brothers.", "I have two brothers.", "'have' meaning own takes no -ing")])),
         "Each of these is common in speech but marked wrong in the exam."),
        (S("Nouns with no plural", T(320, 65, "These nouns have no plural:", 20, 800)
           + T(320, 110, "furniture · luggage · advice", 24, 800, TEAL_T) + T(320, 150, "information · equipment · news", 24, 800, TEAL_T)
           + T(320, 220, "✗ two furnitures → ✓ two pieces of furniture", 19, 800) + T(320, 265, "✗ an advice → ✓ a piece of advice", 19, 800)),
         "Some nouns are uncountable: no -s and no 'a'. Count them with 'a piece of'."),
        (S("Doubled words", fix([("It is more better.", "It is better.", "better already means 'more good'"),
                                 ("The both of them came.", "Both of them came.", "'both' needs no 'the'"),
                                 ("Myself and Tunde went.", "Tunde and I went.", "the doer is 'I', not 'myself'")])),
         "Watch the doubled words — 'more better', 'the both' — and 'myself' where 'I' belongs."),
    ], "Cover it. Correct: 'Borrow me your book.' 'She gave me many advices.' 'Myself and Ada will go.'")

    # ── EN-063 collocations ───────────────────────────────────────────────────────────────────────────
    card("en-collocations", ["EN-063"], "Collocations: words that go together", [
        (S("Make or do", R(50, 45, 250, 240, GOLD, INK) + T(175, 85, "MAKE", 26, 800)
           + "".join(T(175, 130 + i * 38, s, 20, 700) for i, s in enumerate(["a mistake", "a decision", "a noise", "a promise"]))
           + R(340, 45, 250, 240, BLUE, TEAL) + T(465, 85, "DO", 26, 800)
           + "".join(T(465, 130 + i * 38, s, 20, 700) for i, s in enumerate(["homework", "a favour", "business", "your best"]))),
         "Some words simply go together: we MAKE a mistake but DO our homework."),
        (S("Adjective and noun", T(200, 70, "say", 20, 800, GREEN) + T(440, 70, "not", 20, 800, RED_T)
           + "".join(T(200, 120 + i * 50, "✓ " + a, 23, 800, GREEN) + T(440, 120 + i * 50, "✗ " + b, 23, 800, RED_T)
                     for i, (a, b) in enumerate([("heavy rain", "big rain"), ("strong tea", "powerful tea"), ("a high fever", "a tall fever"), ("fast asleep", "quick asleep")]))),
         "Adjectives choose their nouns too: heavy rain, strong tea, a high fever."),
        (S("Learn the chunk", T(320, 70, "Learn the chunk, not the single word:", 20, 800)
           + mid(140, [("pay attention", MINT), ("take a photo", MINT)], 24) + mid(210, [("catch a cold", MINT), ("keep a secret", MINT)], 24)
           + T(320, 290, "write new words down with the words they travel with", 17, 700, TEAL_T)),
         "Note new words in chunks, the way they are used: pay attention, catch a cold, keep a secret."),
    ], "Cover it. Make or do: ___ an effort, ___ the dishes, ___ friends. Which is right: 'strong rain' or 'heavy rain'?")

    # ── EN-066, EN-067 health, law and government ─────────────────────────────────────────────────────
    card("en-field-health-law", ["EN-066", "EN-067"], "Words of health, law and government", [
        (S("Medical words in parts", "".join(Wd(40, 85 + i * 65, [(a, GOLD), (b, BLUE)], 22) + T(330, 85 + i * 65, m, 19, 700, INK, "start")
                                             for i, (a, b, m) in enumerate([("cardi", "-ologist", "a heart doctor"), ("paediatr", "-ician", "a children's doctor"), ("tonsill", "-itis", "swollen tonsils")]))
           + T(320, 280, "cardi = heart · -itis = swelling · -ologist = expert", 17, 700, TEAL_T)),
         "Medical words are built from parts: cardi (heart) + -ologist (expert) = a heart doctor."),
        (S("Who is who in court", R(240, 40, 160, 66, GOLD, INK) + T(320, 70, "judge", 21, 800) + T(320, 95, "decides the case", 16, 700, INK2)
           + R(30, 145, 190, 66, BLUE, TEAL) + T(125, 175, "plaintiff", 21, 800) + T(125, 200, "brings the case", 16, 700, INK2)
           + R(230, 145, 180, 66, MINT, GREEN) + T(320, 175, "witness", 21, 800) + T(320, 200, "says what they saw", 16, 700, INK2)
           + R(420, 145, 190, 66, PINK, CORAL) + T(515, 175, "defendant", 21, 800) + T(515, 200, "answers the case", 16, 700, INK2)
           + T(320, 270, "the judge's decision is the verdict", 20, 800, TEAL_T)),
         "In court the plaintiff brings the case, the defendant answers it, and the judge gives the verdict."),
        (S("Three arms of government", P([(40, 95), (600, 95), (320, 30)], CREAM, INK, 2) + T(320, 82, "government", 18, 800)
           + "".join(R(55 + i * 185, 110, 160, 180, f, s) + T(135 + i * 185, 145, a, 19, 800) + T(135 + i * 185, 185, b, 16, 700, c) + T(135 + i * 185, 225, d, 16, 700, INK2) + T(135 + i * 185, 250, e, 16, 700, INK2)
                     for i, (a, b, d, e, f, s, c) in enumerate([("Legislature", "makes laws", "National", "Assembly", BLUE, TEAL, TEAL_T),
                                                                ("Executive", "carries them out", "the President", "and ministers", GOLD, INK, INK),
                                                                ("Judiciary", "interprets them", "the courts", "and judges", PINK, CORAL, RED_T)]))),
         "Government has three arms: the legislature makes laws, the executive carries them out, the judiciary interprets them."),
    ], "Cover it. What does a dermatologist treat? Who brings a case to court? Which arm of government makes laws?",
         hook="Word parts: cardi = heart, -itis = swelling, -ologist = expert")

    # ── EN-068, EN-069 farming, trade, money, media and technology ────────────────────────────────────
    chain = [("farmer", "grows the crop", MINT, GREEN), ("wholesaler", "buys in bulk", GOLD, INK), ("retailer", "sells to you", BLUE, TEAL), ("consumer", "uses it", PINK, CORAL)]
    card("en-field-trade-media", ["EN-068", "EN-069"], "Words of farming, trade, money and the media", [
        (S("From farm to market", T(320, 60, "from farm to market", 20, 800)
           + "".join(R(15 + i * 160, 100, 130, 70, f, s) + T(80 + i * 160, 142, a, 19, 800) + T(80 + i * 160, 205, b, 16, 700, INK2) for i, (a, b, f, s) in enumerate(chain))
           + "".join(L(148 + i * 160, 135, 172 + i * 160, 135, INK2, 2.5, True) for i in range(3))
           + T(320, 280, "yam from Benue reaches a Lagos kitchen this way", 17, 700, INK2)),
         "Trade words follow the goods: the farmer harvests, the wholesaler buys in bulk, the retailer sells to the consumer."),
        (S("Profit", R(100, 60, 400, 44, GOLD, INK, 6) + T(300, 89, "income ₦50,000", 19, 800)
           + R(100, 120, 280, 44, PINK, CORAL, 6) + T(240, 149, "costs ₦35,000", 19, 800) + R(380, 120, 120, 44, MINT, GREEN, 6) + T(440, 149, "profit", 19, 800, GREEN)
           + T(320, 220, "profit = income − costs", 24, 800) + T(320, 280, "interest: the price of a loan · inflation: prices rising", 16, 700, INK2)),
         "Profit is what is left of the income after the costs; if the costs are bigger, it is a loss."),
        (S("News and data", R(20, 30, 170, 70, GOLD, INK) + T(105, 62, "reporter", 19, 800) + T(105, 86, "gathers news", 16, 700, INK2)
           + R(235, 30, 170, 70, SOFT) + T(320, 62, "editor", 19, 800) + T(320, 86, "checks and cuts", 16, 700, INK2)
           + R(450, 30, 170, 70, MINT, GREEN) + T(535, 62, "broadcast", 19, 800) + T(535, 86, "on radio or TV", 16, 700, INK2)
           + L(193, 65, 231, 65, INK2, 2.5, True) + L(408, 65, 446, 65, INK2, 2.5, True)
           + R(60, 180, 130, 110, SOFT) + T(125, 242, "phone", 19, 800) + R(450, 180, 130, 110, BLUE, TEAL, 30) + T(515, 242, "internet", 19, 800)
           + L(200, 210, 440, 210, TEAL, 3, True) + T(320, 198, "upload: send up", 16, 700, TEAL_T)
           + L(440, 260, 200, 260, CORAL, 3, True) + T(320, 288, "download: bring down", 16, 700, RED_T)),
         "Media words follow the news from reporter to editor to broadcast; upload sends data, download receives it."),
    ], "Cover it. Who buys in bulk, the wholesaler or the retailer? Income ₦20,000, costs ₦26,000 — profit or loss? What does an editor do?")

    # ── EN-078 narrative and descriptive essays ───────────────────────────────────────────────────────
    mtn = [(80, 255), (210, 175), (330, 75), (460, 175), (580, 255)]
    senses = [(140, 62, "see: bright ankara"), (500, 62, "hear: traders calling"), (125, 232, "smell: frying akara"), (515, 232, "touch: rough sacks"), (320, 300, "taste: dust in the air")]
    card("en-essays", ["EN-078"], "Narrative and descriptive essays", [
        (S("The story mountain", f'<polyline points="{" ".join(f"{a},{b}" for a, b in mtn)}" fill="none" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
           + "".join(C(a, b, 8, c) for (a, b), c in zip(mtn, [BLUE, GOLD, CORAL, GOLD, BLUE]))
           + T(80, 290, "opening", 18, 800) + T(195, 160, "problem builds", 17, 700, INK, "end") + T(330, 50, "climax", 19, 800, RED_T)
           + T(470, 160, "it settles", 17, 700, INK, "start") + T(580, 290, "ending", 18, 800)),
         "A narrative tells a story: an opening, a problem that builds to a climax, then a resolution and an ending."),
        (S("Five senses", "".join(L(320, 160, x, y - 6, INK2, 2) for x, y, _ in senses)
           + R(230, 130, 180, 60, GOLD, INK) + T(320, 168, "the market", 21, 800)
           + "".join(R(x - 108, y - 24, 216, 34, "#fff", LINE, 6, 1.2, False) + T(x, y, s, 17, 700) for x, y, s in senses)),
         "A descriptive essay paints a picture: use all five senses, not just sight."),
        (S("Moving or looking", R(30, 40, 280, 190, BLUE, TEAL) + T(170, 78, "Narrative", 22, 800, TEAL_T)
           + "".join(T(170, 120 + i * 34, s, 17, 700) for i, s in enumerate(["tells what HAPPENED", "past tense, in time order", "then · later · at last"]))
           + R(330, 40, 280, 190, PINK, CORAL) + T(470, 78, "Descriptive", 22, 800, RED_T)
           + "".join(T(470, 120 + i * 34, s, 17, 700) for i, s in enumerate(["shows what it is LIKE", "the five senses", "precise adjectives"]))
           + T(320, 280, "show, don't tell: 'her hands shook', not 'she was scared'", 17, 700, INK2)),
         "A narrative moves through time; a description stays in one place and looks closely."),
    ], "Cover it. Draw the story mountain and label it. Write one sentence about your street for each of the five senses.")
