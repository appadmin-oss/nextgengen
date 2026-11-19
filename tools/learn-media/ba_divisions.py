"""Division Curriculum — the spine each division shares: arts, media, technology, business."""
from ba_kit import *   # noqa: F401,F403


def figures(add):
    # 1 · Deliberate practice: the zone just beyond
    b, y = title("Practise just beyond what you can already do")
    cx, cy = W / 2, y + 170
    for r, f, s in ((165, CORAL_T, "Too hard: you cannot do it at all"), (110, GOLD_T, "Practice zone: you fail sometimes"), (55, GREEN_T, "Comfort: what you can already do")):
        b += circle(cx, cy, r, f, LINE, 1.5)
    b += t(cx, cy + 6, "Comfort", 18, 800, INK, "middle", GREEN_T)
    b += t(cx, cy - 76, "Practice zone", 18, 800, INK, "middle", GOLD_T)
    b += t(cx, cy - 134, "Too hard", 18, 800, INK, "middle", CORAL_T)
    y = cy + 190
    p, y = para(24, y, W - 48, "Deliberate practice works in the middle ring: one specific weakness, slow and correct, immediate feedback, short and fully focused, repeated over days.", 16, 600)
    b += p
    alt = ("Three rings: comfort (what you can already do) in the centre, the practice zone just beyond it where you fail sometimes, and too hard outside. "
           "Deliberate practice works in the practice zone.")
    add(1, "How skill is actually built", "practice-zone", "**Just beyond your current ability**", alt, svg(y + 12, "The practice zone", alt, b))

    # 2 · Critique shape
    b, y = chain_h("A critique in three moves", [("What I saw or heard", "describe, no judging"), ("What it did to me", "the effect, honestly"),
                                              ("One thing to try", "specific, the maker may take it or leave it")],
                   note="Observation the maker cannot argue with, response that is your honest experience, a suggestion they are free to use. Receive it in silence and write it down.")
    alt = "A critique in three moves: describe what you saw or heard without judging, say what it did to you, then offer one specific thing to try."
    add(2, "Looking and listening", "critique-shape", "**A shape that works:**", alt, svg(y, "The shape of a critique", alt, b))

    # 3 · Heritage timeline
    b, y = title("Where you are making from: Nigerian creative traditions")
    ev = [("Over 2,000 years ago", "Nok terracottas"), ("From about 1100", "Ife bronze and terracotta heads"), ("From about 1300", "Benin bronzes and ivories"),
          ("1940s", "Hubert Ogunde's travelling theatre"), ("1970s", "Afrobeat: Fela Kuti and Tony Allen"), ("1986", "Wole Soyinka, Nobel Prize"),
          ("1990s onward", "Nollywood")]
    lx = 196
    b += line(lx, y, lx, y + len(ev) * 50 - 20, INK2, 3)
    for i, (d, s) in enumerate(ev):
        yy = y + 10 + i * 50
        b += circle(lx, yy, 8, GOLD, INK, 1.5)
        b += t(lx - 18, yy + 6, d, 16, 800, INK, "end")
        b += t(lx + 22, yy + 6, s, 16, 600, INK)
    y += len(ev) * 50 + 10
    n, y = notes(y, "Not a complete list: add the traditions of your own place — textiles, music, festivals, stories — and name them when you draw on them.")
    b += n
    alt = ("A timeline of Nigerian creative traditions: Nok terracottas over 2,000 years old, Ife heads from about 1100, Benin bronzes from about 1300, "
           "Ogunde's travelling theatre in the 1940s, Afrobeat in the 1970s, Soyinka's Nobel Prize in 1986, and Nollywood from the 1990s.")
    add(3, "Where you are making from", "heritage-timeline", "**Film**", alt, svg(y, "Nigerian creative traditions", alt, b))

    # 4 · Constraints funnel
    b, y = title("A tight brief removes thousands of decisions")
    rows = ["Purpose", "Audience", "Length or size", "Deadline", "Budget and materials", "Must-haves, must-nots"]
    for i, s in enumerate(rows):
        w_ = W - 48 - i * 56
        x = (W - w_) / 2
        f = GOLD_T if i % 2 == 0 else SOFT
        b += rect(x, y + i * 40, w_, 36, f, LINE, 1, 6) + t(W / 2, y + i * 40 + 24, s, 16, 700, INK, "middle", f)
    y += 6 * 40 + 6
    b += arrow(W / 2, y, W / 2, y + 26)
    b += box(W / 2 - 120, y + 30, 240, 44, GREEN_T, INK) + t(W / 2, y + 58, "a few strong ideas", 16, 800, INK, "middle", GREEN_T)
    n, y = notes(y + 110, "List every constraint before you begin, ask about anything unclear before, not after, then check your ideas against the brief.")
    b += n
    alt = "A brief's constraints — purpose, audience, length, deadline, budget, must-haves and must-nots — narrow the choices down to a few strong ideas."
    add(4, "Working to a brief", "brief-constraints", "**Constraints are useful", alt, svg(y, "Working to a brief", alt, b))

    # 5 · Two kinds of rehearsal
    b, y = title("Two kinds of rehearsal, both needed")
    secs = [("A", 90, False), ("B", 60, True), ("C", 110, False), ("D", 50, True), ("E", 90, False)]
    for row, (h, sub) in enumerate((("Work session", "isolate the hard parts, slowly, many times"), ("Run-through", "start to finish without stopping"))):
        yy = y + row * 120
        b += t(24, yy + 20, h, 18, 800) + t(24, yy + 44, sub, 16, 500, INK2)
        x = 24
        for name, wv, hard in secs:
            f = CORAL_T if hard else SOFT
            b += rect(x, yy + 58, wv, 34, f, INK if (row == 0 and hard) or row == 1 else LINE, 1.5 if row == 0 and hard else 1, 4)
            x += wv + 4
        if row == 1:
            b += arrow(24, yy + 104, x - 8, yy + 104)
    n, y = notes(y + 260, "Hard sections (red) first while you are fresh, then put them back in context. Run-throughs build stamina and teach you to keep going after a mistake.")
    b += n
    alt = "A work session repeats only the hard sections of a piece, slowly; a run-through plays the whole piece start to finish without stopping, even after a mistake."
    add(5, "Rehearsal", "rehearsal-kinds", "**Run-throughs**", alt, svg(y, "Two kinds of rehearsal", alt, b))

    # 7 · Breathing and ritual
    b, y = title("Breathe in for 4, out for 6 to 8 — then a ritual you can rely on")
    x0, w_ = 24, W - 48
    b += rect(x0, y, w_ * 4 / 11, 44, TEAL_T, INK, 1, 6) + t(x0 + 12, y + 28, "in · 4 counts", 16, 800, INK, bg=TEAL_T)
    b += rect(x0 + w_ * 4 / 11 + 4, y, w_ * 7 / 11 - 4, 44, GOLD_T, INK, 1, 6) + t(x0 + w_ * 4 / 11 + 16, y + 28, "out · 6 to 8 counts: slows the heart", 16, 800, INK, bg=GOLD_T)
    y += 66
    rit = ["Walk on", "Settle", "Breathe", "Begin", "Finish", "Acknowledge", "Leave"]
    for i, s in enumerate(rit):
        x = 24 + (i % 4) * 152
        yy = y + (i // 4) * 62
        b += badge(x + 14, yy + 22, i + 1) + box(x + 32, yy + 4, 114, 36, SOFT, LINE, 6, False) + t(x + 89, yy + 28, s, 16, 600, INK, "middle", SOFT)
    n, y = notes(y + 150, "Repeat the breath four or five times, feet on the floor. Do not rush the start, hold the last moment, and accept the applause.")
    b += n
    alt = "Breathe in for 4 counts and out for 6 to 8, four or five times; then the same seven-step ritual every time: walk on, settle, breathe, begin, finish, acknowledge, leave."
    add(7, "In front of people", "breath-ritual", "**The shape of a performance", alt, svg(y, "Breathing and the performance ritual", alt, b))

    # 9 · Photograph flat work square-on
    b, y = title("Photograph flat work square-on, in soft light")
    for k, (h, ok) in enumerate((("Square-on: true shape", True), ("At an angle: distorted", False))):
        x = 24 + k * 312
        f = GREEN_T if ok else CORAL_T
        b += box(x, y, 292, 240, f, LINE)
        b += t(x + 146, y + 30, h, 16, 800, INK, "middle", f)
        if ok:
            b += rect(x + 86, y + 50, 120, 120, WHITE, INK, 2)
            b += arrow(x + 146, y + 228, x + 146, y + 176, INK2)
            b += rect(x + 128, y + 196, 36, 22, INK, r=3)
        else:
            b += f'<polygon points="{x + 70},{y + 60} {x + 222},{y + 76} {x + 222},{y + 154} {x + 70},{y + 170}" fill="{WHITE}" stroke="{INK}" stroke-width="2"/>'
            b += arrow(x + 40, y + 222, x + 80, y + 178, INK2)
            b += rect(x + 20, y + 196, 36, 22, INK, r=3)
    n, y = notes(y + 270, "Camera centred and parallel to the work. Window daylight, not direct sun, no flash glare. Three-dimensional work: several angles and a detail.")
    b += n
    alt = "A camera pointed straight at the centre of a flat artwork records its true rectangle; from an angle the rectangle becomes a distorted trapezium."
    add(9, "Your portfolio", "square-on", "Photograph flat work square-on", alt, svg(y, "Photographing flat work", alt, b))

    # 10 · Costing stack
    b, y = title("What a fee has to cover")
    parts = [("Materials", 15, TEAL_T), ("Time: planning, making, rehearsing, travel, admin", 50, GOLD_T), ("Travel and equipment", 12, PURPLE_T), ("Agreed revisions", 13, CORAL_T)]
    tot = sum(p_[1] for p_ in parts)
    yy = y
    for s, v, f in parts:
        h = v * 4.2
        b += rect(24, yy, 330, h, f, INK, 1)
        p, _ = para(36, yy + h / 2 + 6 - (nlines(s, 300, 16, 700) - 1) * 10, 300, s, 16, 700, INK, bg=f)
        b += p
        yy += h
    b += path(f"M366 {y} h10 V{yy} h-10", INK2, sw=2)
    b += box(394, (y + yy) / 2 - 44, 222, 88, GOLD, INK)
    b += t(408, (y + yy) / 2 - 10, "The fee is ₦80,000.", 18, 800, INK, bg=GOLD) + t(408, (y + yy) / 2 + 20, "Said plainly.", 16, 600, INK, bg=GOLD)
    n, y = notes(yy + 30, "Time is usually the biggest part and the one people forget. If a client cannot afford it, offer a smaller version, not a discount on the same work.")
    b += n
    alt = "A fee built from materials, all of the time (planning, making, rehearsing, travel, admin), travel and equipment, and the agreed number of revisions — then said plainly: “The fee is ₦80,000.”"
    add(10, "Making a living", "fee-stack", "**Costing a piece:**", alt, svg(y, "Costing creative work", alt, b))

    # 13 · Story spine
    b, y = title("The story spine, and the turn inside it")
    x0, x1, base = 40, W - 40, y + 230
    pts = [(0, 30), (0.25, 50), (0.5, 120), (0.72, 190), (1, 90)]
    m = lambda f: x0 + f * (x1 - x0)
    b += path("M" + " ".join(f"{'L' if i else ''}{m(fx):.1f} {base - h:.1f}" for i, (fx, h) in enumerate(pts)), TEAL_D, sw=3)
    labs = [(0, "Who", "a character", "start"), (0.25, "Wants", "a goal", "middle"), (0.5, "Blocked", "an obstacle", "middle"), (0.72, "The turn", "either way", "middle"), (1, "What changes", "the result", "end")]
    for fx, h, s, an in labs:
        hy = dict(pts)[fx]
        b += circle(m(fx), base - hy, 7, GOLD if h == "The turn" else WHITE, INK, 2)
        b += t(m(fx), base + 24, h, 16, 800, INK, an)
        if s: b += t(m(fx), base + 46, s, 16, 500, INK2, an)
    b += t(m(0.72), base - 190 - 18, "tension highest", 16, 700, CORAL_D, "middle")
    b += line(x0, base, x1, base, LINE, 1.5)
    n, y = notes(base + 84, "Once upon a time… Every day… One day… Because of that… Because of that… Until finally…")
    b += n
    alt = "Tension rises through the story spine — a character, what they want, what blocks them, what they do — peaks at the turn, where it could go either way, then resolves in what changes."
    add(13, "The story spine", "story-spine", "Inside it is **the turn**", alt, svg(y, "The story spine", alt, b))

    # 14 · Rule of thirds
    b, y = title("The rule of thirds: subject on a line or a crossing")
    fx, fy, fw, fh = 70, y, 500, 282
    b += rect(fx, fy, fw, fh, TEAL_T, INK, 2)
    b += rect(fx, fy + fh * 2 / 3, fw, fh / 3, GREEN_T)
    for k in (1, 2):
        b += line(fx + fw * k / 3, fy, fx + fw * k / 3, fy + fh, INK2, 1.5, "6 5") + line(fx, fy + fh * k / 3, fx + fw, fy + fh * k / 3, INK2, 1.5, "6 5")
    sx, sy = fx + fw * 2 / 3, fy + fh / 3
    b += circle(sx, sy + 30, 26, GOLD, INK, 2) + rect(sx - 30, sy + 56, 60, 70, GOLD, INK, 2, 10)
    for k1 in (1, 2):
        for k2 in (1, 2):
            b += circle(fx + fw * k1 / 3, fy + fh * k2 / 3, 6, CORAL_D)
    y = fy + fh + 30
    p, y = para(24, y, W - 48, "Horizon on the lower third gives sky; on the upper third, ground. Leave looking room in front of a face. Then break it on purpose: centred framing gives power and formality.", 16, 600)
    b += p
    alt = "A frame divided into thirds: the subject stands on the right-hand vertical line at an upper crossing point, and the horizon sits on the lower third line."
    add(14, "Composition", "rule-of-thirds", "**The rule of thirds:**", alt, svg(y + 12, "The rule of thirds", alt, b))

    # 15 · Hard vs soft light
    b, y = title("Hard light from a small source, soft light from a big one")
    for k, (h, r_, sub) in enumerate((("Hard: bare sun, bare bulb", 10, "sharp shadow edge"), ("Soft: window, cloud, bounce", 70, "gentle, graded shadow"))):
        x = 24 + k * 312
        b += box(x, y, 292, 250, SOFT)
        b += t(x + 146, y + 28, h, 16, 800, INK, "middle", SOFT)
        b += rect(x + 146 - r_, y + 46, 2 * r_, 14, GOLD, INK, 1, 3)
        b += circle(x + 146, y + 150, 34, WHITE, INK, 2)
        if k == 0:
            b += f'<path d="M{x + 152} {y + 184} L{x + 190} {y + 226} L{x + 120} {y + 226} L{x + 140} {y + 184} Z" fill="{INK2}"/>'
        else:
            b += f'<defs><radialGradient id="sg"><stop offset="0" stop-color="{INK2}" stop-opacity=".7"/><stop offset="1" stop-color="{INK2}" stop-opacity="0"/></radialGradient></defs>'
            b += f'<ellipse cx="{x + 152}" cy="{y + 210}" rx="62" ry="22" fill="url(#sg)"/>'
        b += t(x + 146, y + 244, sub, 16, 600, INK, "middle", SOFT)
    n, y = notes(y + 280, "Face the subject towards the window, never with it behind them. Midday sun is hard: move into open shade. A white sheet bounces light into the shadow side.")
    b += n
    alt = "A small light source such as bare sun gives a hard, sharp-edged shadow; a large source such as a window or cloudy sky gives a soft, graded shadow that flatters a face."
    add(15, "Light", "hard-soft-light", "**Quality of light:**", alt, svg(y, "Hard and soft light", alt, b))

    # 16 · Mic distance
    b, y = title("Get the mic close: the voice weakens with distance, the room does not")
    for k, (h, voice, note_) in enumerate((("Phone 20 cm away", 200, "voice well above the room"), ("Camera mic 3 m away", 70, "voice barely above the room"))):
        yy = y + k * 110
        b += t(24, yy + 20, h, 18, 800)
        b += rect(24, yy + 34, voice * 2.4, 26, TEAL, INK, 1) + t(24 + voice * 2.4 + 10, yy + 54, "voice", 16, 700)
        b += rect(24, yy + 66, 50 * 2.4, 26, CORAL_T, INK, 1) + t(24 + 120 + 10, yy + 86, "room noise and echo", 16, 600, INK2)
    n, y = notes(y + 240, "Record in small, soft rooms (curtains, cushions, a car), turn fans off, and listen back on headphones before you leave.")
    b += n
    alt = "With the phone 20 cm from the speaker the voice is far louder than the room noise; with a camera mic 3 metres away the voice is barely above the noise and echo."
    add(16, "Sound", "mic-distance", "**Get the mic close.**", alt, svg(y, "Microphone distance", alt, b))

    # 17 · Inverted pyramid
    b = pyramid("The inverted pyramid: most important first", [("The key message", "the one line most people will read"), ("Key details", "who, what, when, where"),
                                                              ("Background", None), ("Extras", None)],
                "Cut ruthlessly, be concrete — “Last term, 40 children built their first website” — and read it aloud.")
    alt = "An upside-down pyramid: the key message at the wide top, then key details, then background, then extras at the narrow bottom, so a reader who stops early still has the point."
    add(17, "Words that carry", "inverted-pyramid", "**inverted pyramid**", alt, svg(b[1], "The inverted pyramid", alt, b[0]))

    # 19 · Consent flow
    b, y = steps_v("May I publish this person?", [
        ("Can they be identified?", "If not, consent rules still apply to what you say about them."),
        ("Did they agree, knowing where it will appear?", "Record it: a signed release, or a recorded “yes” with name, date and use."),
        ("Under 18?", "A parent or guardian consents, and the child agrees too."),
        ("Never publish", "A child's full name with school or location; addresses, phone numbers, medical or ID details.")], fills=[SOFT, SOFT, GOLD_T, CORAL_T])
    alt = "Before publishing a person: are they identifiable; did they agree knowing where it will appear, recorded; if under 18, a guardian's consent and the child's agreement; and never a child's name with school or location, or private details."
    add(19, "Consent, truth", "consent-check", "**Consent:**", alt, svg(y, "Consent before publishing", alt, b))

    # 20 · 9:16 vs 16:9
    b = frames("One story, two frames", [("9:16 vertical", 9, 16, "Phones, often muted: hook in 1–3 s, captions, subject centred"),
                                         ("16:9 landscape", 16, 9, "Watched with intent: room for context and interviews")])
    alt = "A 9:16 vertical frame for phone feeds (often muted: hook in the first seconds, captions, subject centred away from the buttons) beside a 16:9 landscape frame for YouTube and screens."
    add(20, "Platforms and formats", "frames-916", "**Vertical short**", alt, svg(b[1], "Vertical and landscape formats", alt, b[0]))

    # 21 · Vanity vs action
    b, y = title("Measure the action you asked for, not the biggest number")
    rows = [("Views", 4200, SOFT, "a scroll-past counts"), ("Likes", 380, SOFT, "easy to give"), ("Link clicks", 95, TEAL_T, "closer"), ("Sign-ups", 31, GOLD, "the goal")]
    for i, (s, v, f, note_) in enumerate(rows):
        yy = y + i * 56
        wv = max(30, (v ** 0.5) * 3.4)
        b += t(24, yy + 28, s, 16, 700)
        b += rect(150, yy + 8, wv, 32, f, INK, 1)
        b += t(150 + wv + 10, yy + 30, f"{v:,} · {note_}", 16, 600 if i == 3 else 500, INK if i == 3 else INK2)
    n, y = notes(y + 4 * 56 + 22, "Decide the measure before you publish. Here the goal was sign-ups: 31 is the answer to “did it work?”, however large the views look.")
    b += n
    alt = "For a sign-up goal, 4,200 views, 380 likes and 95 clicks flatter; the 31 sign-ups are the number that says whether it worked. (Bars drawn on a compressed scale.)"
    add(21, "Did it work?", "vanity-metrics", "**Vanity metrics**", alt, svg(y, "Vanity and action metrics", alt, b))

    # 22 · Client brief flow
    b, y = steps_v("Working to a client brief without disputes", [
        ("Write back what you understood", "Audience, action, format, length, deadline, budget, what they supply."),
        ("Client confirms", "Misunderstandings surface now, not after the work."),
        ("Draft, then two agreed rounds of revisions", "Changes to what was agreed."),
        ("A new concept or format is a new job", "Quoted and charged separately.")], hl=[0])
    alt = "Write back the brief in your own words, get the client to confirm it, deliver a draft with an agreed two rounds of revisions, and treat a new concept or format as a new, separately charged job."
    add(22, "client brief", "client-brief", "**Write back what you understood.**", alt, svg(y, "Working to a client brief", alt, b))

    # 23 · Strategy cycle
    b, y = cycle("How media professionals work, as a loop", ["Audience", "Action", "Story", "Craft", "Ethics", "Format", "Measure", "Improve"], None, r=176, bw=124)
    alt = "A loop of eight steps: audience, action, story, craft, ethics, format, measure, improve — and back to the audience."
    add(23, "Publish a piece", "media-cycle", "audience → action", alt, svg(y, "The media strategy cycle", alt, b))

    # 24 · Computational thinking
    b, y = title("Computational thinking, on a registration desk")
    parts = [("Decomposition", "greet · find name · check payment · badge · record"), ("Pattern recognition", "same steps for every person: a loop"),
             ("Abstraction", "name and status matter; shirt colour does not"), ("Algorithm", "precise steps anyone can follow and get the same result")]
    for i, (h, s) in enumerate(parts):
        x, yy = 24 + (i % 2) * 304, y + (i // 2) * 120
        c, _ = card(x, yy, 288, h, s, GOLD_T if i == 3 else SOFT, minh=104)
        b += c
    y += 240
    alt = "Four parts of computational thinking on a registration desk: decompose it into steps, spot the pattern that repeats for every person, abstract away irrelevant details, and write a precise algorithm."
    add(24, "Computational thinking", "comp-thinking", "**Algorithms**", alt, svg(y, "Computational thinking", alt, b))

    # 25 · Messy vs structured
    b, y = title("Messy text versus one fact per field")
    for i, s in enumerate(["Tobi, 14, Surulere", "ADEBAYO Tunde - 13yrs", "Chidinma (12) Yaba", "tobi 14 surulere"]):
        b += box(24, y + i * 44, 270, 36, CORAL_T, LINE, 6, False) + t(36, y + i * 44 + 24, s, 16, 500, INK, bg=CORAL_T)
    b += arrow(302, y + 84, 328, y + 84)
    tb, _ = table(336, y, ["firstName", "surname", "age"], [["Tobi", "", "14"], ["Tunde", "Adebayo", "13"], ["Chidinma", "", "12"]], [100, 100, 80])
    b += tb
    n, y = notes(y + 200, "Now a filter can count, sort and find the duplicate “Tobi” / “tobi”. Give each field a clear name, a type, allowed values, and whether it is required.")
    b += n
    alt = "Four free-text entries in different styles become a table with one fact per column — firstName, surname, age — so a computer can count, sort and spot the duplicate."
    add(25, "Data", "structured-data", "**Structured data**", alt, svg(y, "Structured data", alt, b))

    # 26 · System with feedback and bottleneck
    b, y = chain_h("Input, process, output — and feedback", [("Input", "people arrive"), ("Register", "3 a minute"), ("Print badge", "1 a minute: the bottleneck"), ("Output", "people with badges")],
                   fills=[SOFT, SOFT, CORAL_T, GOLD_T])
    b += path(f"M{W - 70} {y + 4} V{y + 46} H70 V{y + 8}", INK2, sw=2.5, dash="7 5", marker=True)
    b += t(W / 2, y + 72, "feedback: a growing queue tells the manager to add a second printer", 16, 600, INK, "middle")
    alt = "A check-in system: people arrive, registration handles 3 a minute but the badge printer only 1, so the printer is the bottleneck; feedback from the growing queue tells the manager to add capacity there."
    add(26, "Systems", "system-feedback", "**Bottlenecks**", alt, svg(y + 90, "A system with feedback", alt, b))

    # 27 · Binary search
    b, y = title("Halve the possibilities: 100 steps, about 7 checks")
    rng = [(1, 100), (51, 100), (51, 75), (63, 75), (63, 69), (66, 69), (67, 68)]
    x0, w_ = 24, W - 48
    for i, (a, c) in enumerate(rng):
        yy = y + i * 40
        b += rect(x0, yy, w_, 28, SOFT, LINE, 1, 4)
        xa, xc = x0 + (a - 1) / 100 * w_, x0 + c / 100 * w_
        b += rect(xa, yy, xc - xa, 28, GOLD_T if i < 6 else CORAL, INK, 1, 4)
        lab = f"check {i + 1}: steps {a}–{c}" if i < 6 else "found: step 67"
        b += t(x0 + 8 if xa - x0 > 210 else xc + 8 if W - 24 - xc > 200 else x0 + 8, yy + 20, lab, 16, 700, INK, bg=SOFT) if (xa - x0 > 210 or W - 24 - xc > 200) else t(xa + 8, yy + 20, lab, 16, 700, INK, bg=GOLD_T)
    n, y = notes(y + 7 * 40 + 20, "Is the value right at the middle step? Yes: the fault is after it. No: before it. Each check throws away half — the same on code, circuits and long processes.")
    b += n
    alt = "Searching 100 steps for a fault by checking the middle each time: 1–100, 51–100, 51–75, 63–75, 63–69, 66–69, then step 67 found in about seven checks."
    add(27, "Debugging anything", "binary-search", "This is **binary search**", alt, svg(y, "Binary search", alt, b))

    # 28 · Boundaries
    b, y = title("If ages 5 to 25 are allowed, test 4, 5, 25 and 26")
    x0, x1, ly = 40, W - 40, y + 76
    m = lambda v: x0 + (v - 2) / 27 * (x1 - x0)
    b += line(x0, ly, x1, ly, INK2, 2) + rect(m(5), ly - 14, m(25) - m(5), 28, GREEN_T, LINE, 1, 4)
    b += t((m(5) + m(25)) / 2, ly + 6, "allowed", 16, 700, INK, "middle", GREEN_T)
    for v, ok, an, dx in ((4, False, "end", -4), (5, True, "start", 4), (25, True, "end", -4), (26, False, "start", 4)):
        b += circle(m(v), ly, 9, GREEN if ok else CORAL_D)
        yy = ly - 52 if ok else ly + 36
        b += t(m(v) + dx, yy, str(v), 16, 800, INK, an)
        b += t(m(v) + dx, yy + 22, "accept" if ok else "refuse", 16, 600, GREEN if ok else CORAL_D, an)
    n, y = notes(ly + 104, "Faults hide at the edges. Also test empty, zero, very large, missing, duplicated and the wrong type — and make sure the test can fail.")
    b += n
    alt = "On a number line where 5 to 25 is allowed, the four boundary tests are 4 (refuse), 5 (accept), 25 (accept) and 26 (refuse)."
    add(28, "Evidence", "boundary-tests", "**Boundaries**", alt, svg(y, "Boundary tests", alt, b))

    # 29 · Data minimisation
    b, y = title("Audit every field: keep it, make it less sensitive, or delete it")
    tb, y2 = table(24, y, ["Field", "Used for?", "Decision"],
                   [["Name", "the register", "Keep"], ["Date of birth", "age group only", "Age range"], ["Home address", "nothing yet", "Delete"], ["Phone", "parent contact", "Keep, restricted"]],
                   [170, 200, 222], fills={(0, 2): GREEN_T, (1, 2): GOLD_T, (2, 2): CORAL_T, (3, 2): GREEN_T})
    b += tb
    n, y = notes(y2 + 30, "Data you never collected cannot leak. Decide how long each field is kept and who can see it — the starting setting is private.")
    b += n
    alt = "A field audit: keep the name, replace date of birth with an age range, delete the unused home address, and keep the parent's phone with restricted access."
    add(29, "Safe by default", "data-minimisation", "**Audit your project's data:**", alt, svg(y, "Data minimisation", alt, b))

    # 30 · Torch fault halving
    b, y = steps_v("Debugging a torch that will not light", [
        ("Is power reaching the bulb?", "Measure at the bulb holder with a multimeter. Yes → the bulb. No → the supply side."),
        ("Supply side: do the batteries read full?", "No → swap in known-good batteries. Yes → the contacts or switch."),
        ("Swap one thing at a time", "A known-good part tests one hypothesis; two swaps at once tell you nothing."),
        ("Verify", "The original failure no longer happens.")], hl=[3])
    alt = "Halving a torch fault: check whether power reaches the bulb, then whether the batteries are good, swapping one known-good part at a time, then verifying the fault has gone."
    add(30, "Debugging something that is not software", "torch-debug", "**Halve the possibilities**", alt, svg(y, "Debugging a torch", alt, b))

    # 33 · Git branches
    b, y = title("Branches let people work in parallel, then merge")
    ly1, ly2 = y + 40, y + 130
    b += line(40, ly1, W - 40, ly1, TEAL_D, 4) + t(40, ly1 - 16, "main", 16, 800, TEAL_D)
    b += path(f"M150 {ly1} C190 {ly1} 190 {ly2} 230 {ly2} L430 {ly2} C470 {ly2} 470 {ly1} 510 {ly1}", CORAL_D, sw=4)
    b += t(330, ly2 + 34, "branch: fix-empty-name", 16, 800, CORAL_D, "middle")
    for x in (80, 150, 330, 510, 590): b += circle(x, ly1, 9, WHITE, TEAL_D, 3)
    for x in (260, 330, 400): b += circle(x, ly2, 9, WHITE, CORAL_D, 3)
    b += t(510, ly1 - 18, "merge after review", 16, 700, INK, "middle")
    y = ly2 + 60
    b += box(24, y, W - 48, 60, SOFT) + t(40, y + 26, "Commit message:", 16, 700, INK, bg=SOFT) + t(40, y + 48, "“Fix crash when name is empty”", 16, 500, INK2, bg=SOFT)
    alt = "A branch leaves main, carries three commits for one fix (“Fix crash when name is empty”), and is merged back into main after a teammate reviews it."
    add(33, "Working in a team", "git-branches", "**Branches**", alt, svg(y + 72, "Branches and merging", alt, b))

    # 34 · Who is affected
    b, y = title("Who is affected — including people who never use it")
    cx, cy = W / 2, y + 180
    for r, f in ((175, PURPLE_T), (125, TEAL_T), (72, GOLD_T)):
        b += circle(cx, cy, r, f, LINE, 1.5)
    b += t(cx, cy + 6, "Users", 18, 800, INK, "middle", GOLD_T)
    b += t(cx, cy - 92, "People the data is about", 16, 700, INK, "middle", TEAL_T)
    b += t(cx, cy + 102, "Workers whose jobs change", 16, 700, INK, "middle", TEAL_T)
    b += t(cx, cy - 146, "People nearby", 16, 700, INK, "middle", PURPLE_T)
    b += t(cx, cy + 156, "People left out · the environment", 16, 700, INK, "middle", PURPLE_T)
    n, y = notes(cy + 206, "Name the most likely harm, not the most dramatic — for an attendance app, a child's schedule exposed — and change one design decision to reduce it.")
    b += n
    alt = "Rings of people affected by a technology: users at the centre, then the people the data is about and workers whose jobs change, then people nearby, people left out and the environment."
    add(34, "Who is affected", "affected-rings", "**List everyone affected:**", alt, svg(y, "Who is affected", alt, b))

    # 36 · Revenue is not profit
    b, y = title("Busy is not profitable: ₦500,000 of sales, ₦20,000 lost")
    sc = 0.5
    b += rect(60, y + 20, 500 * sc, 46, TEAL, INK, 1) + t(60 + 250 * sc * 2 + 10, y + 50, "Sales ₦500,000", 16, 800)
    b += rect(60, y + 86, 420 * sc, 46, CORAL_T, INK, 1) + rect(60 + 420 * sc, y + 86, 100 * sc, 46, CORAL, INK, 1)
    b += t(60 + 520 * sc + 10, y + 108, "Costs ₦520,000", 16, 800) + t(60 + 520 * sc + 10, y + 128, "goods ₦420k + running ₦100k", 16, 500, INK2)
    b += line(60 + 500 * sc, y + 10, 60 + 500 * sc, y + 146, CORAL_D, 2, "5 4")
    b += t(60 + 500 * sc, y + 166, "₦20,000 loss", 16, 800, CORAL_D, "middle")
    n, y = notes(y + 206, "Revenue is all the money coming in; profit is what is left after all costs. Watch profit, not turnover.")
    b += n
    alt = "Sales of ₦500,000 against goods costing ₦420,000 plus ₦100,000 of rent, transport and an assistant: costs of ₦520,000 exceed sales, a loss of ₦20,000."
    add(36, "What a business actually is", "revenue-profit", "**lost ₦20,000**", alt, svg(y, "Revenue and profit", alt, b))

    # 37 · Evidence ladder
    b, y = title("From weak to strong evidence that people want it")
    lad = [("They say they would buy it", "polite, imagined, costs nothing"), ("They describe what they did", "past behaviour predicts"), ("You watch them do it", "real transactions"),
           ("They pay or pre-order", "the strongest evidence")]
    for i, (h, s) in enumerate(lad):
        yy = y + (3 - i) * 70
        x = 24 + i * 40
        c, _ = card(x, yy, W - 48 - i * 40, h, s, [CORAL_T, GOLD_T, TEAL_T, GREEN_T][i], minh=58)
        b += c
    b += arrow(W - 34, y + 270, W - 34, y + 12)
    n, y = notes(y + 300, "Ask “When did you last…? What did you buy? How much?” — never “Would you buy this?”. The gap between what people say and what they do is the finding.")
    b += n
    alt = "Evidence from weakest to strongest: people saying they would buy, people describing what they actually did, watching real transactions, and people paying or pre-ordering."
    add(37, "Customers, and evidence", "evidence-ladder", "Past behaviour is the best predictor", alt, svg(y, "Evidence ladder", alt, b))

    # 38 · Zobo margin and break-even
    b, y = title("A cup of zobo: margin, then break-even")
    b += rect(24, y, 500, 44, GOLD_T, INK, 1) + t(36, y + 28, "Price ₦500", 16, 800, INK, bg=GOLD_T)
    b += rect(24, y + 54, 200, 44, CORAL_T, INK, 1) + t(36, y + 82, "Cost ₦200", 16, 700, INK, bg=CORAL_T)
    b += rect(224, y + 54, 300, 44, GREEN_T, INK, 1) + t(236, y + 82, "Margin ₦300 a cup", 16, 800, INK, bg=GREEN_T)
    y += 126
    b += box(24, y, W - 48, 72, SOFT)
    b += t(40, y + 30, "Fixed costs ₦60,000 a month ÷ ₦300 = 200 cups", 18, 800, INK, bg=SOFT)
    b += t(40, y + 56, "about 8 a day: realistic?", 16, 600, INK2, bg=SOFT)
    y += 94
    for i, (n_, res, f) in enumerate(((150, "loss ₦15,000", CORAL_T), (200, "break even", GOLD_T), (300, "profit ₦30,000", GREEN_T))):
        b += box(24 + i * 202, y, 186, 64, f, LINE, 8, False)
        b += t(117 + i * 202, y + 26, f"{n_} cups", 16, 800, INK, "middle", f) + t(117 + i * 202, y + 50, res, 16, 600, INK, "middle", f)
    alt = "Zobo sells for ₦500 and costs ₦200, a margin of ₦300 a cup; ₦60,000 of fixed costs ÷ ₦300 = 200 cups to break even. 150 cups lose ₦15,000; 300 cups make ₦30,000."
    add(38, "Money: revenue, cost, margin", "zobo-break-even", "Sell 150 → loss of ₦15,000", alt, svg(y + 76, "Margin and break-even", alt, b))

    # 40 · Phone order flowchart
    b, y = title("A written process with its decision points: taking a phone order")
    cx = 200
    b += f'<ellipse cx="{cx}" cy="{y + 22}" rx="110" ry="22" fill="{GOLD_T}" stroke="{INK}"/>' + t(cx, y + 28, "Customer calls", 16, 700, INK, "middle", GOLD_T)
    b += arrow(cx, y + 44, cx, y + 64)
    b += box(cx - 130, y + 66, 260, 40, WHITE, INK, 4, False) + t(cx, y + 92, "Take name, write on order sheet", 16, 600, INK, "middle")
    b += arrow(cx, y + 106, cx, y + 126)
    dy = y + 160
    b += f'<polygon points="{cx},{dy - 32} {cx + 90},{dy} {cx},{dy + 32} {cx - 90},{dy}" fill="{WHITE}" stroke="{INK}" stroke-width="1.5"/>' + t(cx, dy + 6, "In stock?", 16, 700, INK, "middle")
    b += arrow(cx, dy + 32, cx, dy + 62) + t(cx + 10, dy + 52, "yes", 16, 600, INK2)
    b += box(cx - 130, dy + 64, 260, 40, WHITE, INK, 4, False) + t(cx, dy + 90, "Confirm price and delivery", 16, 600, INK, "middle")
    b += arrow(cx + 90, dy, 370, dy) + t(326, dy - 10, "no", 16, 600, INK2, "middle")
    b += box(372, dy - 20, 244, 40, WHITE, INK, 4, False) + t(494, dy + 6, "Offer the alternative", 16, 600, INK, "middle")
    b += arrow(494, dy + 20, 494, dy + 62) + t(504, dy + 46, "refuses", 16, 600, INK2)
    b += box(372, dy + 64, 244, 40, WHITE, INK, 4, False) + t(494, dy + 90, "Note it, end politely", 16, 600, INK, "middle")
    y = dy + 130
    n, y = notes(y, "Steps start with a verb; every decision says what decides it; the process has an owner. Test it by handing it to a classmate.")
    b += n
    alt = "A phone-order flowchart: take the name and write the order, decide “In stock?” — yes, confirm price and delivery; no, offer the alternative, and if refused, note it and end politely."
    add(40, "Processes", "phone-order-flow", "**Flowcharts**", alt, svg(y, "Phone order process", alt, b))

    # 41 · BLUF
    b, y = steps_v("Writing that gets a decision: the ask first", [
        ("The ask", "“I need your approval to spend ₦150,000 on a second fridge by Friday.”"),
        ("Options", "A: buy (₦150,000) · B: rent cold room (₦20,000/month) · C: do nothing (lose ~₦25,000/month)."),
        ("Recommendation", "“I recommend A, because it pays for itself in about 6 weeks.”"),
        ("By when", "The date you need the answer.")], hl=[0], note="Under 150 words. Numbers, not adjectives.")
    alt = "A decision message: the ask in the first sentence, then options A, B and C with their numbers, a recommendation with its reason, and the date an answer is needed."
    add(41, "Writing that gets a decision", "ask-first", "**Then give options", alt, svg(y, "Bottom line up front", alt, b))

    # 42 · Estimate vs real
    b, y = title("Re-costing: the estimate against real market prices")
    items = [("Ingredients", 140, 150, TEAL), ("Packaging", 20, 60, CORAL), ("Transport", 0, 25, PURPLE), ("Waste", 0, 15, GOLD)]
    for k, (lab, key) in enumerate((("Week 3 estimate", 1), ("Real prices", 2))):
        yy = y + k * 90
        b += t(24, yy + 20, lab, 16, 800)
        x = 24
        for name, est, real, c in items:
            v = (est, real)[key - 1]
            if v:
                b += rect(x, yy + 30, v * 2, 40, c, INK, 1)
                x += v * 2
        b += t(x + 10, yy + 56, f"₦{sum((i[1], i[2])[key - 1] for i in items)} a cup", 16, 800)
    y += 190
    for i, (name, est, real, c) in enumerate(items):
        b += rect(24 + i * 150, y, 22, 22, c, INK, 1) + t(54 + i * 150, y + 17, name, 16, 600)
    n, y = notes(y + 56, "An example: the estimate missed packaging, transport and waste, so the cost per cup rose from ₦160 to ₦250 and break-even went up. Date every costing.")
    b += n
    alt = "An example re-costing: the estimate of ₦160 a cup counted ingredients and a little packaging; real prices add more packaging, transport and waste, making ₦250 a cup."
    add(42, "Re-costing with real numbers", "recosting", "**Name what you got most wrong.**", alt, svg(y, "Estimate against real costs", alt, b))

    # 43 · Value/effort
    b, y = matrix2("Score tasks by value against effort", "Effort →", "Value →",
                   [("Quick wins", "do these first", GREEN_T), ("Major projects", "plan and schedule", GOLD_T), ("Fill-ins", "only if there is time", SOFT), ("Cut these", "drop deliberately", CORAL_T)],
                   note="Draw the line and cut. A good “no”: acknowledge, give the reason, offer what you can.")
    alt = "A 2×2 of value against effort: high value, low effort are quick wins to do first; high value, high effort are major projects to schedule; low value, low effort are fill-ins; low value, high effort are cut."
    add(43, "Deciding what not to do", "value-effort", "**Score tasks: value against effort.**", alt, svg(y, "Value against effort", alt, b))

    # 45 · Stop rule
    b, y = title("Decide the stop number before you start")
    x0, x1, top, bot = 70, W - 40, y + 10, y + 230
    vals = [0, 6, 13, 19, 24]
    m = lambda k: x0 + k / 4 * (x1 - x0)
    v = lambda val: bot - val / 40 * (bot - top)
    b += line(x0, bot, x1, bot, INK2, 2) + line(x0, top, x0, bot, INK2, 2)
    b += line(x0, v(30), x1, v(30), CORAL_D, 2.5, "7 5") + t(x1, v(30) - 10, "stop line: 30 sign-ups by month end", 16, 700, CORAL_D, "end")
    b += path("M" + " L".join(f"{m(k):.1f} {v(val):.1f}" for k, val in enumerate(vals)), TEAL_D, sw=3)
    b += circle(m(4), v(24), 7, CORAL_D) + t(m(4) - 14, v(24) - 12, "24: stop, try weekends", 16, 800, INK, "end")
    for k in range(5): b += t(m(k), bot + 24, f"week {k}" if k else "start", 16, 600, INK2, "middle" if 0 < k < 4 else ("start" if k == 0 else "end"))
    n, y = notes(bot + 60, "Written in advance, the stop number protects you from the sunk-cost trap: carrying on because you have already invested.")
    b += n
    alt = "Sign-ups for an evening class rise to 24 by the end of the month, below the stop line of 30 set in advance, so the class stops and a weekend one is tried."
    add(45, "The one number", "stop-rule", "**State in advance what number would mean stop.**", alt, svg(y, "A stop rule", alt, b))

    # 46 · Prevent, prepare, accept
    b, y = title("For the top risks: prevent, prepare or accept")
    rows = [("Generator fails", "4 × 4 = 16", "Prevent", "test it weekly"), ("Key person ill", "3 × 4 = 12", "Prepare", "train a second person"),
            ("Customer pays late", "4 × 3 = 12", "Prepare", "keep a cash reserve"), ("Minor theft", "2 × 2 = 4", "Accept", "write it down")]
    tb, y2 = table(24, y, ["Risk", "Score", "Decide", "Action"], [list(r) for r in rows], [176, 120, 104, 192],
                   fills={(0, 2): GREEN_T, (1, 2): GOLD_T, (2, 2): GOLD_T, (3, 2): SOFT})
    b += tb
    n, y = notes(y2 + 30, "Score each risk likely × damaging, 1–5 each; the highest scores get attention first. Prevent lowers the chance; prepare lowers the damage.")
    b += n
    alt = "Risks scored likelihood × damage: generator failure 16, prevent by testing weekly; a key person ill 12, prepare by training a second person; late payment 12, keep a reserve; minor theft 4, accept."
    add(46, "What goes wrong", "prevent-prepare", "**3. For the top three, decide:**", alt, svg(y, "Responding to risks", alt, b))


def pyramid(ttl, rows, note):
    b, y = title(ttl)
    n_ = len(rows)
    for i, (h, s) in enumerate(rows):
        top_w = W - 48 - i * (W - 200) / n_
        bot_w = W - 48 - (i + 1) * (W - 200) / n_
        yy = y + i * 64
        x1, x2 = (W - top_w) / 2, (W + top_w) / 2
        x3, x4 = (W + bot_w) / 2, (W - bot_w) / 2
        f = GOLD if i == 0 else [GOLD_T, SOFT, SOFT][min(i - 1, 2)]
        b += f'<polygon points="{x1:.1f},{yy} {x2:.1f},{yy} {x3:.1f},{yy + 60} {x4:.1f},{yy + 60}" fill="{f}" stroke="{INK}" stroke-width="1"/>'
        b += t(W / 2, yy + (26 if s else 36), h, 16, 800, INK, "middle", f)
        if s: b += t(W / 2, yy + 48, s, 16, 500, INK, "middle", f)
    y += n_ * 64 + 20
    nn, y = notes(y + 10, note)
    return b + nn, y


def frames(ttl, specs):
    b, y = title(ttl)
    x = 24
    for h, fw, fh, s in specs:
        sc = 300 / max(fw, fh) * (1.0 if fw < fh else 1.0)
        w_, hh = fw * sc * (0.75 if fw < fh else 1.0), fh * sc * (0.75 if fw < fh else 1.0)
        b += rect(x, y, w_, hh, TEAL_T, INK, 2, 8)
        if fw < fh:
            b += rect(x, y, w_, 36, CORAL_T, INK, 1, 8) + rect(x, y + hh - 50, w_, 50, CORAL_T, INK, 1, 8)
            b += t(x + w_ / 2, y + hh / 2 + 6, "keep text here", 16, 700, INK, "middle", TEAL_T)
        b += t(x, y + hh + 28, h, 18, 800)
        p, _ = para(x, y + hh + 52, (w_ if fw > fh else 200), s, 16, 500, INK2)
        b += p
        x += w_ + 40
    y += 225 + 150
    return b, y
