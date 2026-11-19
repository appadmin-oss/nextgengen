"""Stage & Studio Trades — acting, stagecraft, catering, adire, crafts. Every fact drawn here is the lesson's own."""
import math
from ba_kit import *   # noqa: F401,F403

INDIGO = ["#cfe0f3", "#8fb3dd", "#4f79b8", "#274b86", "#16294f"]      # one dip → many dips, palest to near-black


def stage_plan(y, labels=True):
    """Top view: upstage at the top, audience at the bottom. Directions are the ACTOR's, facing the audience,
    so stage left is on the right of the drawing."""
    x0, w_, h_ = 70, 500, 270
    b = rect(x0, y, w_, h_, SOFT, INK, 2, 4)
    cells = [["Upstage right", "Upstage centre", "Upstage left"], ["Centre right", "Centre stage", "Centre left"], ["Downstage right", "Downstage centre", "Downstage left"]]
    for r in range(3):
        for c in range(3):
            cx_, cy_ = x0 + (c + 0.5) * w_ / 3, y + (r + 0.5) * h_ / 3
            if r or c: b += line(x0 + c * w_ / 3, y, x0 + c * w_ / 3, y + h_, LINE, 1.5, "5 4") if c else ""
            f = GOLD_T if (r, c) == (1, 1) else SOFT
            if (r, c) == (1, 1): b += rect(x0 + w_ / 3, y + h_ / 3, w_ / 3, h_ / 3, GOLD_T)
            for k, wd in enumerate(cells[r][c].split()):
                b += t(cx_, cy_ - 4 + k * 22, wd, 16, 700, INK, "middle", f)
    for r in (1, 2): b += line(x0, y + r * h_ / 3, x0 + w_, y + r * h_ / 3, LINE, 1.5, "5 4")
    for c in (1, 2): b += line(x0 + c * w_ / 3, y, x0 + c * w_ / 3, y + h_, LINE, 1.5, "5 4")
    b += rect(x0 - 50, y, 44, h_, PURPLE_T, LINE, 1, 4) + rect(x0 + w_ + 6, y, 44, h_, PURPLE_T, LINE, 1, 4)
    b += f'<text transform="translate({x0 - 22} {y + h_ / 2}) rotate(-90)" font-size="16" font-weight="700" fill="{INK}" text-anchor="middle">wings</text>'
    b += f'<text transform="translate({x0 + w_ + 34} {y + h_ / 2}) rotate(90)" font-size="16" font-weight="700" fill="{INK}" text-anchor="middle">wings</text>'
    b += rect(x0, y + h_ + 8, w_, 34, TEAL_T, LINE, 1, 4) + t(W / 2, y + h_ + 31, "AUDIENCE", 16, 800, INK, "middle", TEAL_T)
    return b, y + h_ + 42


def figures(add):
    # ── Acting ──
    b, y = chain_h("A warm-up wakes all three parts of the instrument", [("Shake out", "release tension"), ("Breathe", "low and slow"), ("Hum", "then vowels"),
                                                                       ("Articulate", "tongue twisters"), ("Focus", "stillness")],
                   note="Body, voice and imagination: from a balanced, neutral stance any character can be built.")
    alt = "A five-step warm-up in order: shake out and stretch, breathe low and slow, hum then open to vowels, articulate with tongue-twisters, then a moment of focused stillness."
    add(0, "instrument", "warm-up", "A warm-up prepares all three", alt, svg(y, "Actor's warm-up", alt, b))

    b, y = compare("High and low status show in the body", ("High status", ["Still, takes up space", "Steady gaze", "Slow, complete movements", "Does not fill silences"]),
                   ("Low status", ["Small or fidgety movements", "Looks away", "Quick, hesitant speech, “um”s", "Touches own face"]), lf=GOLD_T, rf=TEAL_T,
                   note="Status is played, not owned, and it shifts during a scene — the reversal is often the best moment.")
    alt = "High status: stillness, taking up space, a steady gaze, slow complete movements, no rush to fill silence. Low status: fidgeting, looking away, hesitant speech, touching the face."
    add(1, "Status", "status-signals", "**Low status**", alt, svg(y, "High and low status", alt, b))

    b, y = title("Objective, obstacle, tactic: the engine of a scene")
    b += box(24, y + 40, 150, 110, GOLD_T, INK) + t(99, y + 92, "My character", 16, 800, INK, "middle", GOLD_T) + t(99, y + 114, "wants…", 16, 500, INK2, "middle", GOLD_T)
    b += box(W - 174, y + 60, 150, 70, GREEN_T, INK) + t(W - 99, y + 92, "Objective", 16, 800, INK, "middle", GREEN_T) + t(W - 99, y + 114, "“to get the loan”", 16, 500, INK2, "middle", GREEN_T)
    b += rect(W / 2 - 14, y + 30, 28, 130, CORAL, INK, 1.5, 4) + t(W / 2, y + 186, "Obstacle: he refuses", 16, 800, CORAL_D, "middle")
    tacs = [("charm", -38), ("plead", 0), ("guilt-trip", 38)]
    for s, dy in tacs:
        b += arrow(178, y + 95 + dy, W / 2 - 18, y + 95 + dy)
        b += t(248, y + 95 + dy - 7, s, 16, 700, TEAL_D, "middle")
    n, y = notes(y + 226, "Tactics are verbs done to the other person. When one fails, change tactic — those changes keep the scene alive. You cannot play a feeling, only an action.")
    b += n
    alt = "A character wants an objective (to get the loan); an obstacle (he refuses) stands in the way; the character tries tactics — charm, plead, guilt-trip — changing each time one fails."
    add(2, "Objective, obstacle", "objective-obstacle", "**change tactic**", alt, svg(y, "Objective, obstacle, tactic", alt, b))

    b, y = title("“Yes, and” grows a scene; blocking ends it")
    b += box(24, y, W - 48, 50, SOFT) + t(40, y + 32, "Offer: “Doctor, my leg has turned blue!”", 16, 700, INK, bg=SOFT)
    b += arrow(160, y + 52, 120, y + 92) + arrow(480, y + 52, 520, y + 92)
    for k, (h, s, f) in enumerate((("Blocking", "“No it hasn't.” — the scene dies", CORAL_T), ("Yes, and", "“And it's glowing slightly. Eaten anything strange?”", GREEN_T))):
        c, _ = card(24 + k * 312, y + 96, 292, h, s, f, minh=96)
        b += c
    n, y = notes(y + 228, "Wimping — accepting but adding nothing — leaves your partner doing all the work. Scripted scenes work the same way: every line is an offer.")
    b += n
    alt = "An offer (“Doctor, my leg has turned blue!”) can be blocked (“No it hasn't” — the scene dies) or accepted and built on with “yes, and” (“And it's glowing slightly…”), which grows the scene."
    add(3, "yes, and", "yes-and", "**Blocking**", alt, svg(y, "Yes, and", alt, b))

    b, y = title("A script is the tip of an iceberg")
    wl = y + 70
    b += rect(24, wl, W - 48, 260, TEAL_T)
    b += f'<polygon points="250,{wl - 60} 390,{wl - 60} 420,{wl} 220,{wl}" fill="{WHITE}" stroke="{INK}" stroke-width="2"/>'
    b += f'<polygon points="220,{wl} 420,{wl} 540,{wl + 220} 100,{wl + 220}" fill="#eef4fb" stroke="{INK}" stroke-width="2"/>'
    b += t(320, wl - 24, "“I'm fine.”", 18, 800, INK, "middle")
    b += t(320, wl + 50, "Subtext", 18, 800, INK, "middle", "#eef4fb")
    for k, s in enumerate(["I'm furious", "I'm heartbroken", "please ask me again"]):
        b += t(320, wl + 86 + k * 26, s, 16, 600, INK2, "middle", "#eef4fb")
    b += t(W - 40, wl - 20, "the words", 16, 700, INK, "end") + t(W - 40, wl + 30, "what is meant", 16, 700, INK, "end", TEAL_T)
    y = wl + 280
    n, y = notes(y, "Mark beats where the topic, tactic or situation changes, and an action verb for each line, in pencil.")
    b += n
    alt = "An iceberg: above the water the line “I'm fine”; below it the subtext — I'm furious, I'm heartbroken, please ask me again."
    add(4, "Reading a script", "subtext-iceberg", "**subtext**", alt, svg(y, "Subtext", alt, b))

    b, y = title("Build a character in layers")
    lay = [("1 Facts from the script", "age, job, family, situation"), ("2 Questions you answer", "where they grew up, what they fear"), ("3 Physicality", "which part of the body leads"),
           ("4 Voice", "pitch, pace, volume, rhythm"), ("5 One specific detail", "counts her change twice")]
    for i, (h, s) in enumerate(lay):
        x = 24 + i * 24
        c, _ = card(x, y + i * 64, W - 48 - i * 48, h, s, [SOFT, TEAL_T, GOLD_T, PURPLE_T, GOLD][i], minh=56)
        b += c
    n, y = notes(y + 5 * 64 + 24, "Test it by hot-seating: answer classmates' questions instantly, in character. The gaps show where to work.")
    b += n
    alt = "Five layers of a character: facts from the script, questions you answer yourself, physicality, voice, and one specific detail such as a market woman who counts her change twice."
    add(5, "Building a character", "character-layers", "**5. One specific detail**", alt, svg(y, "Character layers", alt, b))

    b, y = chain_h("Four parts of a stage voice", [("Breath support", "low, from the belly"), ("Resonance", "hum: feel the buzz"), ("Projection", "to the back row"), ("Articulation", "clear consonants")],
                   note="Exercise: breathe in for 4, hiss out evenly for 10, then 15, then 20. Slow down, and finish the ends of lines.")
    alt = "A strong stage voice in four parts: breath support from the belly, resonance in chest and face, projection to the back row, and clear articulation — without shouting."
    add(8, "Voice for the stage", "stage-voice", "**Articulation.**", alt, svg(y, "Stage voice", alt, b))

    b, y = title("Nigerian theatre: from the travelling companies to Nollywood")
    ev = [("1940s", "Hubert Ogunde's touring company"), ("1950s–60s", "Kola Ogunmola; Duro Ladipo's Oba Koso"), ("1959", "Soyinka, The Lion and the Jewel"),
          ("1975", "Soyinka, Death and the King's Horseman"), ("Late 1970s", "Osofisan: Morountodun, Once Upon Four Robbers"), ("1986", "Soyinka, Nobel Prize in Literature"),
          ("Later", "companies move into film and TV: a root of Nollywood")]
    lx = 140
    b += line(lx, y, lx, y + len(ev) * 46 - 18, INK2, 3)
    for i, (d, s) in enumerate(ev):
        yy = y + 10 + i * 46
        b += circle(lx, yy, 8, GOLD, INK, 1.5) + t(lx - 16, yy + 6, d, 16, 800, INK, "end")
        p, _ = para(lx + 20, yy + 6, W - lx - 44, s, 16, 600)
        b += p
    n, y = notes(y + len(ev) * 46 + 20, "What it asks of an actor: total performance — speech, song, dance, drumming — weight and stillness, and direct engagement with the audience.")
    b += n
    alt = ("Nigerian theatre: Ogunde's touring company in the 1940s, Ogunmola and Duro Ladipo's Oba Koso, Soyinka's The Lion and the Jewel (1959) and Death and the King's Horseman (1975), "
           "Osofisan in the late 1970s, Soyinka's Nobel Prize in 1986, and the companies' move into film — a root of Nollywood.")
    add(9, "Nigerian theatre", "theatre-timeline", "**Femi Osofisan**", alt, svg(y, "Nigerian theatre timeline", alt, b))

    # ── Stagecraft ──
    b, y = title("The stage manager is the centre of communication")
    cx, cy = W / 2, y + 170
    b += box(cx - 90, cy - 36, 180, 72, GOLD, INK) + t(cx, cy - 6, "Stage manager", 16, 800, INK, "middle", GOLD) + t(cx, cy + 18, "calls every cue", 16, 600, INK, "middle", GOLD)
    roles = ["Director", "Lighting", "Sound", "Set and props", "Costume", "Front of house", "Producer", "Deputy and ASMs"]
    for i, s in enumerate(roles):
        a = -math.pi / 2 + i * 2 * math.pi / len(roles)
        x, yy = cx + 230 * math.cos(a), cy + 140 * math.sin(a)
        b += line(cx + 92 * math.cos(a), cy + 38 * math.sin(a), x - 70 * math.cos(a) * 0.6, yy - 20 * math.sin(a), LINE, 2)
        c, _ = card(x - 74, yy - 20, 148, None, s, SOFT, pad=8, bfill=INK, a="middle", minh=40)
        b += c
    n, y = notes(cy + 186, "Every role is needed because theatre is live: a missed cue or a missing prop changes the show for everyone.")
    b += n
    alt = "Backstage roles around the stage manager, who runs the show and calls every cue: director, lighting, sound, set and props, costume, front of house, producer, deputy and assistant stage managers."
    add(12, "Who does what backstage", "backstage-hub", "**Stage manager (SM)**", alt, svg(y, "Backstage roles", alt, b))

    b, y = title("Stage geography: directions are the actor's, facing the audience")
    sp, y = stage_plan(y)
    b += sp
    n, y = notes(y + 30, "Stage left is the actor's left — the audience's right. Downstage is towards the audience; upstage is away (stages once sloped up).")
    b += n
    alt = ("A stage plan seen from above with the audience at the bottom: upstage at the back, downstage nearest the audience; stage left is the actor's left, "
           "which is on the audience's right; the wings are the hidden sides.")
    add(13, "The stage, and staying safe", "stage-plan", "**The wings**", alt, svg(y, "Stage geography", alt, b), caption="Stage left is the actor's left, which is the audience's right.")

    b, y = title("Direction of light changes what the audience sees")
    dirs = [("Front", "shows faces, flattens them"), ("Side", "gives shape"), ("Back", "separates actor from background"), ("Below", "from the floor: unnatural, spooky")]
    for i, (h, s) in enumerate(dirs):
        x = 24 + (i % 2) * 304
        yy = y + (i // 2) * 170
        b += box(x, yy, 288, 156, SOFT)
        cx_, cy_ = x + 70, yy + 80
        b += circle(cx_, cy_, 26, GOLD, INK, 1.5)
        a = {"Front": (0, 1), "Side": (-1, 0), "Back": (0, -1), "Below": (0, 1.3)}[h]
        if h == "Below":
            b += line(cx_ - 50, cy_ + 64, cx_ + 50, cy_ + 64, INK2, 3) + arrow(cx_ + 40, cy_ + 60, cx_ + 14, cy_ + 28, AMBER_D)
        else:
            sx_, sy_ = cx_ + a[0] * 58, cy_ + a[1] * 58
            b += arrow(sx_ - a[0] * 0, sy_, cx_ + a[0] * 32, cy_ + a[1] * 32, AMBER_D)
        b += t(x + 134, yy + 64, h, 18, 800, INK, bg=SOFT)
        p, _ = para(x + 134, yy + 90, 140, s, 16, 500, INK2, bg=SOFT)
        b += p
    n, y = notes(y + 360, "Lighting's four jobs: visibility first, then mood, focus and time of day — through intensity, colour, direction, distribution and movement.")
    b += n
    alt = "Light from the front shows faces but flattens them, from the side gives shape, from behind separates the actor from the background, and from below looks unnatural and spooky."
    add(14, "Lighting I", "light-directions", "**Direction**", alt, svg(y, "Directions of stage light", alt, b))

    b, y = steps_v("Getting a lantern working: rig, focus, cue", [
        ("Rig", "Clamp it to the bar and always fit a safety bond. Trained people only at height; gloves — lanterns get hot."),
        ("Focus", "Aim at the area with someone standing in it; shape the edge with shutters or barn doors."),
        ("Cue", "A number, the exact moment (“as she sits”) and a fade time — in the desk and the prompt book."),
        ("The call", "“Lighting cue 12 — stand by.” … “Go.”")], hl=[3])
    alt = "Three stages: rig the lantern with a clamp and a safety bond, focus it on the area and shape it with shutters or barn doors, then plot cues with a number, a moment and a fade time, called “stand by… go”."
    add(15, "Lighting II", "rig-focus-cue", "**Cues**", alt, svg(y, "Rig, focus, cue", alt, b))

    b, y = title("The sound chain, and the loop that makes feedback")
    items = [("Mic", 88), ("Mixer", 240), ("Amplifier", 392), ("Speaker", 544)]
    for s, x in items:
        b += box(x - 62, y + 20, 124, 52, GOLD_T if s == "Mixer" else SOFT) + t(x, y + 52, s, 16, 800, INK, "middle", GOLD_T if s == "Mixer" else SOFT)
    for k in range(3): b += arrow(items[k][1] + 64, y + 46, items[k + 1][1] - 64, y + 46)
    b += path(f"M{544} {y + 74} C{544} {y + 150} {88} {y + 150} {88} {y + 80}", CORAL_D, sw=3, dash="8 6", marker=False)
    b += f'<polygon points="88,{y + 74} 81,{y + 88} 95,{y + 88}" fill="{CORAL_D}"/>'
    b += t(W / 2, y + 166, "feedback: the speaker's sound goes back into the mic, louder each time", 16, 700, CORAL_D, "middle")
    y += 196
    tips = ["Mics behind the speakers, never pointed at one", "Mic a hand's width from the mouth", "Turn up slowly; switch off unused mics", "If it squeals: pull the fader down first"]
    for i, s in enumerate(tips):
        b += circle(32, y + 10 + i * 28 - 5, 4, INK2) + t(44, y + 10 + i * 28, s, 16, 600)
    alt = "Sound flows mic → mixer → amplifier → speaker. Feedback is the loop when the speaker's sound returns into the mic; keep mics behind speakers and close to the mouth, and pull the fader down if it squeals."
    add(16, "Sound I", "sound-chain", "**Feedback**", alt, svg(y + 4 * 28 + 4, "Sound chain and feedback", alt, b))

    b, y = title("A cue sheet: the same show every night")
    tb, y2 = table(24, y, ["Cue", "What", "When", "Level", "Fade"],
                   [["Q1", "Pre-show music", "house open", "-10 dB", "snap"], ["Q2", "Music out", "house lights out", "off", "5 s"], ["Q3", "Rain effect", "“It's late…”", "-15 dB", "3 s"],
                    ["Q4", "Lapel mic 1 up", "Ada enters", "set", "—"]], [60, 160, 172, 100, 100])
    b += tb
    n, y = notes(y2 + 30, "Fresh batteries in every radio mic, every show, with a log. Respond to “Sound Q7, stand by… Go.” and write every setting down.")
    b += n
    alt = "A sound cue sheet listing each cue's number, what it is, the moment it happens, its level and its fade — so anyone could run the show the same way."
    add(17, "Sound II", "cue-sheet", "**cue sheet**", alt, svg(y, "Sound cue sheet", alt, b))

    b, y = title("A costume plot shows every change at a glance")
    rows = [["Mama Bisi", "wrapper, headtie", "same", "church dress"], ["Tunde", "school uniform", "agbada", "agbada"], ["Kemi", "jeans, T-shirt", "same", "same"]]
    tb, y2 = table(24, y, ["Character", "Scene 1", "Scene 2", "Scene 3"], rows, [140, 160, 146, 146], fills={(0, 3): CORAL_T, (1, 2): CORAL_T})
    b += tb
    n, y = notes(y2 + 30, "Red = a change. A quick change is planned on paper, pre-set in the wings in order, with fast fastenings, and rehearsed with the dresser.")
    b += n
    alt = "A costume plot grid of characters by scenes, showing what each wears and highlighting the scenes where a change happens."
    add(20, "Costume and quick changes", "costume-plot", "**Make a costume plot**", alt, svg(y, "Costume plot", alt, b))

    b, y = title("A prompt-book page: script, blocking, cues")
    b += rect(24, y, W - 48, 330, WHITE, INK, 1.5, 4)
    b += line(170, y, 170, y + 330, LINE) + line(W - 170, y, W - 170, y + 330, LINE)
    b += t(36, y + 26, "Blocking", 16, 800, TEAL_D) + t(W / 2, y + 26, "Script", 16, 800, INK, "middle") + t(W - 158, y + 26, "Cues", 16, 800, CORAL_D)
    lines_ = [("ADA: Where were you?", "X DSL", ""), ("TUNDE: At the market.", "", "Standby LX 14"), ("ADA: All night?", "sits", "LX 14 GO"), ("(Thunder.)", "", "SQ 6 GO")]
    for i, (s, blk, cue) in enumerate(lines_):
        yy = y + 74 + i * 62
        b += t(184, yy, s, 16, 500)
        if blk: b += t(36, yy, blk, 16, 700, TEAL_D)
        if cue: b += t(W - 158, yy, cue, 16, 800, CORAL_D)
    n, y = notes(y + 360, "Pencil, because blocking changes. A standby before every cue; the word “go” is used only to start cues.")
    b += n
    alt = "A prompt-book page: the script in the middle, the actors' blocking in pencil in the left margin (X DSL = cross downstage left), and each cue with its standby in the right margin."
    add(21, "Stage management", "prompt-book", "**Blocking**", alt, svg(y, "Prompt book page", alt, b))

    b, y = title("Cue to cue: rehearse only the moments around each cue")
    x0, x1 = 24, W - 24
    b += rect(x0, y + 30, x1 - x0, 40, SOFT, LINE, 1, 4) + t(x0, y + 20, "The whole show", 16, 700)
    cues = [0.05, 0.16, 0.25, 0.8, 0.93]
    for c in cues:
        cx_ = x0 + c * (x1 - x0)
        b += rect(cx_ - 28, y + 30, 56, 40, GOLD, INK, 1, 3) + line(cx_, y + 74, cx_, y + 92, INK2, 1.5)
    b += t(x0 + 0.525 * (x1 - x0), y + 56, "long scene: skipped", 16, 600, INK2, "middle", SOFT)
    b += t(x0, y + 114, "Gold: played around each cue, checked, fixed, then on to the next.", 16, 600)
    n, y = notes(y + 150, "At each cue: right moment, right level and speed, can everyone see and hear, is it safe? Then dress rehearsals, at performance speed, without stopping.")
    b += n
    alt = "Across the running time of a show, only the short stretches around each cue are played in a cue-to-cue technical rehearsal; long scenes with no technical change are skipped."
    add(22, "technical rehearsal", "cue-to-cue", "(\"cue to cue\")", alt, svg(y, "Cue-to-cue rehearsal", alt, b))

    # ── Catering ──
    b, y = title("Food temperatures: keep it out of the danger zone")
    x0, top, bot = 150, y + 10, y + 330
    v = lambda c: bot - (c + 10) / 120 * (bot - top)
    b += rect(x0, v(110), 40, v(-10) - v(110), WHITE, INK, 2, 20)
    b += rect(x0 + 4, v(60), 32, v(5) - v(60), CORAL, r=2) + rect(x0 + 4, v(5), 32, v(-10) - v(5) - 4, TEAL, r=2) + rect(x0 + 4, v(110) + 4, 32, v(60) - v(110) - 4, GOLD, r=2)
    for c in (100, 60, 5):
        b += line(x0 - 10, v(c), x0, v(c), INK, 2) + t(x0 - 16, v(c) + 6, f"{c}°C", 16, 800, INK, "end")
    b += t(x0 + 60, v(100) + 6, "boiling", 16, 700)
    b += t(x0 + 60, v(80), "Keep hot food hot:", 16, 800) + t(x0 + 60, v(80) + 22, "above 60°C", 16, 600, INK2)
    b += rect(x0 + 52, v(58), 400, v(7) - v(58), CORAL_T, r=6)
    b += t(x0 + 64, v(40), "DANGER ZONE 5–60°C", 18, 800, CORAL_D, bg=CORAL_T)
    b += t(x0 + 64, v(40) + 24, "germs multiply fastest here; cooked food", 16, 600, INK, bg=CORAL_T)
    b += t(x0 + 64, v(40) + 46, "out no more than 2 hours", 16, 600, INK, bg=CORAL_T)
    b += t(x0 + 60, v(-2), "Keep cold food cold: 5°C or below", 16, 800)
    n, y = notes(bot + 34, "The WHO's Five Keys: keep clean, separate raw and cooked, cook thoroughly, keep food at safe temperatures, use safe water and raw materials.")
    b += n
    alt = "A thermometer: food is kept cold at 5°C or below and hot above 60°C; between 5°C and 60°C is the danger zone where germs multiply fastest, so cooked food stays out no more than two hours."
    add(24, "kitchen that does not hurt", "food-temperatures", "**Keep food at safe temperatures**", alt, svg(y, "Food safety temperatures", alt, b))

    b, y = title("Four basic cuts")
    cuts = [("Slice", "thin, flat"), ("Dice", "even cubes"), ("Chop", "rough pieces"), ("Julienne", "matchsticks")]
    for i, (h, s) in enumerate(cuts):
        x = 24 + i * 152
        b += box(x, y, 140, 150, SOFT)
        gx, gy = x + 30, y + 22
        if i == 0:
            for k in range(5): b += rect(gx + k * 16, gy, 8, 70, GREEN_T, GREEN, 1.5, 3)
        if i == 1:
            for r in range(3):
                for c in range(3): b += rect(gx + c * 26, gy + r * 26, 20, 20, GOLD_T, AMBER_D, 1.5, 2)
        if i == 2:
            for (dx, dy, w_, h_) in ((0, 0, 30, 22), (40, 4, 22, 30), (6, 34, 26, 18), (44, 44, 30, 24), (8, 60, 20, 14)):
                b += rect(gx + dx, gy + dy, w_, h_, CORAL_T, CORAL_D, 1.5, 4)
        if i == 3:
            for k in range(7): b += rect(gx + k * 12, gy, 5, 74, "#ffe0b2", AMBER_D, 1.2, 2)
        b += t(x + 70, y + 118, h, 16, 800, INK, "middle", SOFT) + t(x + 70, y + 140, s, 16, 500, INK2, "middle", SOFT)
    n, y = notes(y + 182, "Same size, same cooking time. Claw grip: fingertips curled under, knuckles guiding the flat of the blade. A sharp knife is safer than a blunt one.")
    b += n
    alt = "Four cuts: slice (thin and flat), dice (even cubes), chop (rough pieces), julienne (matchsticks); even pieces cook in the same time."
    add(25, "Knife skills and mise en place", "basic-cuts", "Basic cuts:", alt, svg(y, "Basic cuts", alt, b))

    b, y = title("Cooking methods by how hot they get")
    x0, top, bot = 120, y + 10, y + 320
    v = lambda c: bot - c / 200 * (bot - top)
    b += line(x0, top, x0, bot, INK2, 2)
    for c in (0, 100, 140, 180):
        b += line(x0 - 8, v(c), x0, v(c), INK, 2) + t(x0 - 14, v(c) + 6, f"{c}°C", 16, 700, INK, "end")
    b += rect(x0 + 16, v(100), 220, v(0) - v(100) - 4, TEAL_T, LINE, 1, 6)
    b += t(x0 + 28, v(100) + 26, "Moist heat: up to 100°C", 16, 800, INK, bg=TEAL_T)
    for k, s in enumerate(["boiling, simmering,", "steaming (moi moi)", "softens, does not brown"]):
        b += t(x0 + 28, v(100) + 52 + k * 22, s, 16, 500, INK2, bg=TEAL_T)
    b += rect(x0 + 252, v(200), W - 24 - x0 - 252, v(100) - v(200) - 4, CORAL_T, LINE, 1, 6)
    b += t(x0 + 264, v(200) + 26, "Dry heat: far hotter", 16, 800, INK, bg=CORAL_T)
    for k, s in enumerate(["frying, roasting,", "baking, grilling (suya)", "the outside browns"]):
        b += t(x0 + 264, v(200) + 52 + k * 22, s, 16, 500, INK2, bg=CORAL_T)
    b += line(x0, v(140), x0 + 244, v(140), CORAL_D, 2, "6 4") + t(x0 + 12, v(140) - 8, "browning above 140°C", 16, 700, CORAL_D)
    b += rect(x0 + 252, v(180) - 2, W - 24 - x0 - 252, v(170) - v(180) + 4, GOLD) + t(W - 30, v(170) - 8, "deep frying 170–180°C", 16, 800, INK, "end", GOLD) if False else ""
    b += line(x0, v(175), x0 + 244, v(175), AMBER_D, 3) + t(x0 + 12, v(175) - 8, "deep frying 170–180°C", 16, 800, AMBER_D)
    n, y = notes(bot + 34, "Water cannot pass 100°C, so boiled meat never browns — which is why a stew whose meat is browned first tastes richer.")
    b += n
    alt = "Moist heat — boiling, simmering, steaming — cannot go above about 100°C, so food softens without browning; dry heat goes far higher; browning starts above about 140°C and deep frying is 170–180°C."
    add(26, "Heat: what each method does", "heat-methods", "**Maillard reaction**", alt, svg(y, "Cooking methods by temperature", alt, b))

    b, y = steps_v("Jollof: the order that decides the pot", [
        ("Fry the base 20–30 minutes", "Tomato, tatashe, scotch bonnet, onion — until the water is gone, the oil rises and the smell turns sweet."),
        ("Measure rice and stock with one cup", "Too much liquid: mushy. Too little: hard."),
        ("Low heat, covered, no stirring", "Foil under the lid traps the steam; stirring breaks grains."),
        ("Rest, then fluff", "Off the heat, covered, a few minutes; fluff with a fork.")], hl=[0],
        note="Fried rice is different: cook, cool quickly and refrigerate, then fry cold rice fast over high heat.")
    alt = "Jollof in order: fry the blended base 20–30 minutes until the oil rises; add rice and stock measured with one cup; cook low, covered and unstirred; rest and fluff."
    add(27, "Rice: jollof", "jollof-order", "**Rest and fluff**", alt, svg(y, "Jollof rice order", alt, b))

    b, y = title("Soups and stews: what goes in when")
    order = [("1 Oil", "warm, not smoking"), ("2 Aromatics", "onion, pepper, iru, crayfish"), ("3 Protein", "pre-boiled, with its stock"), ("4 Stock", ""),
             ("5 Long-cooking", "egusi, ogbono, cocoyam"), ("6 Leaves last", "ugu, bitterleaf, efo: minutes only")]
    for i, (h, s) in enumerate(order):
        yy = y + i * 50
        f = GREEN_T if i == 5 else (GOLD_T if i == 4 else SOFT)
        b += rect(24, yy, W - 48, 42, f, LINE, 1, 6) + t(38, yy + 27, h, 16, 800, INK, bg=f) + (t(220, yy + 27, s, 16, 500, INK2, bg=f) if s else "")
    b += arrow(W - 40, y + 4, W - 40, y + 6 * 50 - 12)
    y += 6 * 50 + 10
    n, y = notes(y + 16, "Long cooking goes in early, delicate things late. Taste at every stage with a clean spoon — you can add salt, never remove it.")
    b += n
    alt = "Soup order: oil warmed, aromatics fried, pre-boiled protein, stock, long-cooking thickeners such as egusi or ogbono, and leaves last for only a few minutes."
    add(28, "Soups and stews", "soup-order", "A typical order:", alt, svg(y, "Soup order", alt, b))

    b, y = chain_h("Eba: texture comes from the method", [("Water", "properly boiling"), ("Sprinkle garri", "let it absorb briefly"), ("Turn firmly", "press out lumps"), ("Serve hot", "wrapped, shaped")],
                   note="Warm water gives a raw, gritty, sticky result. More garri makes it firmer — ask the customer. Turn and serve without stopping: it sets as it cools.")
    alt = "Eba in four steps: properly boiling water, sprinkle the garri and let it absorb, turn firmly with a wooden spatula pressing out lumps, then serve hot, wrapped and shaped."
    add(29, "Swallow and sides", "eba-method", "**Technique**", alt, svg(y, "Making eba", alt, b))

    b, y = title("Dicing an onion, seen from above")
    for k, (h, cuts_) in enumerate((("1 Lengthways, not through the root", "len"), ("2 Across: even dice fall away", "across"))):
        x = 24 + k * 312
        b += box(x, y, 292, 250, SOFT)
        b += t(x + 146, y + 28, h.split(":")[0] if len(h) > 34 else h, 16, 800, INK, "middle", SOFT)
        ox, oy = x + 60, y + 60
        b += f'<path d="M{ox} {oy} H{ox + 140} A50 75 0 0 1 {ox + 140} {oy + 150} H{ox} Z" fill="#fff6e0" stroke="{AMBER_D}" stroke-width="2"/>'
        b += rect(ox - 18, oy + 50, 18, 50, "#e8d3a9", AMBER_D, 2, 4) + t(ox - 10, oy + 180, "root", 16, 700, INK, "middle", SOFT)
        for i in range(1, 6):
            yy = oy + i * 25
            if cuts_ == "len": b += line(ox + 12, yy, ox + 186, yy, INK, 2)
            else:
                b += line(ox + 12, yy, ox + 186, yy, LINE, 1.5)
        if cuts_ == "across":
            for i in range(1, 7): b += line(ox + i * 26, oy + 4, ox + i * 26, oy + 146, INK, 2)
    n, y = notes(y + 282, "Halve through the root and peel, leaving the root on to hold the layers; discard it at the end. Accuracy first: if the claw slips, stop.")
    b += n
    alt = "An onion half from above: first cut lengthways towards the root without cutting through it, then cut across with the claw guiding, so even dice fall away; the root holds the layers until last."
    add(30, "Knife skills again", "onion-dice", "The efficient onion dice:", alt, svg(y, "Dicing an onion", alt, b))

    b, y = title("Oil temperature decides greasy, raw or right")
    zones = [("Too cool", "soaks up oil: greasy, heavy", TEAL_T), ("About right: roughly 170–180°C", "a drop sizzles at once and rises; browns in a minute or two", GOLD), ("Too hot", "outside burns, inside raw", CORAL_T)]
    for i, (h, s, f) in enumerate(zones):
        c, _ = card(24, y + i * 92, W - 48, h, s, f, minh=80)
        b += c
    n, y = notes(y + 290, "Fry in batches: too much at once drops the temperature. Dry hands and tools — water spits violently in hot oil. Never leave the pot.")
    b += n
    alt = "Oil too cool soaks into the food and leaves it greasy; at roughly 170–180°C a test drop sizzles and rises and browns in a minute or two; too hot burns the outside while the inside stays raw."
    add(31, "Baking and small chops", "oil-temperature", "**Oil temperature is everything:**", alt, svg(y, "Frying temperature", alt, b))

    b, y = title("What a plate of jollof really costs (an example)")
    parts = [("Food: ₦15,000 pot ÷ 20 plates", 750, GOLD_T), ("Packaging", 300, TEAL_T), ("Gas", 100, PURPLE_T), ("Transport", 50, SOFT), ("Waste", 75, CORAL_T), ("Your time", 250, GREEN_T)]
    yy = y
    for s, v_, f in parts:
        h = 26 + v_ * 0.06
        b += rect(24, yy, 360, h, f, INK, 1) + t(36, yy + h / 2 + 6, s, 16, 700, INK, bg=f) + t(372, yy + h / 2 + 6, f"₦{v_:,}", 16, 800, INK, "end", f)
        yy += h
    b += path(f"M396 {y} h10 V{yy} h-10", INK2, sw=2)
    b += box(424, (y + yy) / 2 - 60, 192, 120, GOLD, INK)
    b += t(436, (y + yy) / 2 - 30, "Cost ₦1,525", 18, 800, INK, bg=GOLD) + t(436, (y + yy) / 2, "+ margin", 16, 600, INK, bg=GOLD) + t(436, (y + yy) / 2 + 34, "Price ≈ ₦2,000", 18, 800, INK, bg=GOLD)
    n, y = notes(yy + 30, "Never price below cost to compete. Ingredient prices move fast: re-cost the menu regularly.")
    b += n
    alt = "An example plate: food ₦750 (a ₦15,000 pot for 20), packaging ₦300, gas ₦100, transport ₦50, waste ₦75 and your time ₦250 — a cost of ₦1,525 before a margin, so a price of about ₦2,000."
    add(32, "What a dish actually costs", "plate-cost", "**Setting a price:**", alt, svg(y, "Cost of a plate", alt, b))

    b, y = title("Plating: space, height, colour, odd numbers, clean rim")
    cx, cy = 210, y + 170
    b += circle(cx, cy, 150, WHITE, INK, 2) + circle(cx, cy, 118, "none", LINE, 1.5)
    b += circle(cx - 10, cy - 20, 52, "#e2843a", INK, 1.5)
    b += f'<ellipse cx="{cx + 20}" cy="{cy + 50}" rx="44" ry="24" fill="#8d5524" stroke="{INK}"/>'
    for k in range(3): b += f'<ellipse cx="{cx + 60 + k * 0}" cy="{cy - 60 + k * 30}" rx="22" ry="11" fill="{GOLD}" stroke="{INK}" transform="rotate(-30 {cx + 60} {cy - 60 + k * 30})"/>'
    b += circle(cx - 60, cy + 46, 16, "#43a047", INK)
    labs = [(cy - 110, "clean rim, wiped"), (cy - 60, "plantain: three, not two"), (cy - 10, "rice shaped for height"), (cy + 50, "protein at the front: focal point"), (cy + 100, "green for colour contrast")]
    for yy, s in labs:
        b += t(380, yy, s, 16, 700)
    n, y = notes(cy + 180, "Photograph in side daylight, from above for flat dishes or about 45° for height, and at once — food dulls quickly.")
    b += n
    alt = "A plate seen from above: rice shaped for height, the protein at the front as the focal point, three pieces of plantain, a green for colour contrast, empty space, and a clean wiped rim."
    add(33, "Plating and presentation", "plating", "Principles used by professional chefs:", alt, svg(y, "Plating", alt, b))

    b, y = title("Cooking for 40: work backwards from 2 pm")
    ev = [("Day before", "shop; wash; boil the meat", SOFT), ("10:50", "start the base (40 min before rice)", SOFT), ("11:30", "start the jollof (1 hour)", GOLD_T),
          ("12:30", "fry plantain; make salad", SOFT), ("1:30", "start plating", GOLD_T), ("2:00", "serve", GOLD)]
    for i, (tm, s, f) in enumerate(ev):
        yy = y + i * 48
        b += rect(24, yy, 120, 40, f, INK, 1, 6) + t(84, yy + 26, tm, 16, 800, INK, "middle", f)
        b += t(160, yy + 26, s, 16, 600)
    b += arrow(W - 40, y + 6 * 48 - 10, W - 40, y + 6, CORAL_D) + t(W - 52, y + 150, "plan", 16, 700, CORAL_D, "end") + t(W - 52, y + 172, "upwards", 16, 700, CORAL_D, "end")
    n, y = notes(y + 6 * 48 + 24, "Scale by 40 ÷ 4 = 10, but add salt and pepper gradually. Hot holding above 63°C; anything out over 2 hours is thrown away.")
    b += n
    alt = "A backward timeline from 2 pm service: plating starts at 1:30, jollof at 11:30 (an hour), the base at 10:50 (40 minutes before), and shopping and boiling the meat the day before."
    add(34, "Catering an event", "event-timeline", "**The timeline", alt, svg(y, "Event catering timeline", alt, b))

    # ── Adire ──
    b, y = title("Resist dyeing: whatever blocks the dye stays pale")
    b += rect(24, y, W - 48, 80, "#274b86", INK, 1.5, 4)
    for x in (110, 300, 490):
        b += rect(x - 40, y, 80, 80, "#dfe8f5")
    b += t(110, y + 46, "tied", 16, 800, INK, "middle", "#dfe8f5") + t(300, y + 46, "stitched", 16, 800, INK, "middle", "#dfe8f5") + t(490, y + 46, "pasted", 16, 800, INK, "middle", "#dfe8f5")
    y += 104
    tech = [("Oniko", "tied: raffia binds seeds, stones or folds", "circles, rings, lines"), ("Alabere", "stitched: running stitch pulled tight", "fine lines, waves"),
            ("Eleko", "cassava paste (lafun), freehand or stencil", "the most detailed designs")]
    for i, (h, s, r) in enumerate(tech):
        c, _ = card(24 + i * 202, y, 186, h, f"{s} → {r}", SOFT, minh=150)
        b += c
    n, y = notes(y + 182, "Made by Yoruba women, especially in Abeokuta and Ibadan. Name the technique and the tradition when you show or sell your work.")
    b += n
    alt = "Resist dyeing: where cloth is tied (oniko), stitched (alabere) or pasted with cassava starch (eleko), indigo cannot reach, so those areas stay pale against the blue."
    add(36, "What adire is", "resist-principle", "The three main techniques:", alt, svg(y, "Resist dyeing", alt, b))

    b, y = compare("Add chemical to water — never water to chemical", ("Never", ["Water poured onto caustic soda: it can boil and spit"]),
                   ("Always", ["Caustic soda added slowly to the water", "Gloves, apron, goggles on first", "Outdoors or by open windows"]),
                   note="Splash in the eye: rinse with clean running water for at least 15 minutes and get medical help. Label every container; dye pots are never used for food again.")
    alt = "Caustic soda is added slowly to water, never water poured onto it, which can boil and spit; gloves, apron and goggles first, good ventilation, and 15 minutes of running water for a splash in the eye."
    add(37, "Setting up safely", "chemical-to-water", "**Add chemical to water", alt, svg(y, "Mixing chemicals safely", alt, b))

    b, y = title("Oniko: predict what each binding will make")
    kinds = [("Single point", "a circle with a ring"), ("Row of points", "a line of small circles"), ("Spiral", "radiating lines"), ("Fan folds, bound", "stripes")]
    for i, (h, s) in enumerate(kinds):
        x = 24 + i * 152
        b += rect(x, y, 140, 140, "#274b86", INK, 1.5, 4)
        cx_, cy_ = x + 70, y + 70
        if i == 0: b += circle(cx_, cy_, 40, "#dfe8f5") + circle(cx_, cy_, 26, "#274b86") + circle(cx_, cy_, 14, "#dfe8f5")
        if i == 1:
            for k in range(4): b += circle(x + 24 + k * 31, cy_, 10, "#dfe8f5") + circle(x + 24 + k * 31, cy_, 4, "#274b86")
        if i == 2:
            for k in range(8):
                a = k * math.pi / 4
                b += line(cx_, cy_, cx_ + 58 * math.cos(a), cy_ + 58 * math.sin(a), "#dfe8f5", 6)
        if i == 3:
            for k in range(4): b += rect(x + 12 + k * 34, y, 12, 140, "#dfe8f5")
        b += t(x, y + 166, h, 16, 800)
        p, _ = para(x, y + 188, 140, s, 16, 500, INK2)
        b += p
    n, y = notes(y + 240, "Tighter and wider bindings give sharper, paler, wider resists; loose binding lets dye creep in. Draw your prediction before the cloth goes in the vat.")
    b += n
    alt = "Oniko bindings and their results: a single bound point gives a circle with a ring, a row of points a line of small circles, a spiral radiating lines, and fan folds bound at intervals give stripes."
    add(38, "Adire oniko", "oniko-bindings", "**Predict, then dye.**", alt, svg(y, "Oniko bindings", alt, b))

    b, y = title("Alabere: stitch, pull tight, dye, unpick")
    steps = ["Mark the line", "Running stitch", "Pull up hard, knot", "Dye, then unpick"]
    for i, s in enumerate(steps):
        x = 24 + i * 152
        f = "#274b86" if i == 3 else "#f4f1ea"
        b += rect(x, y, 140, 110, f, INK, 1.5, 4)
        cy_ = y + 55
        if i == 0: b += line(x + 14, cy_, x + 126, cy_, INK2, 2, "3 4")
        if i == 1:
            for k in range(6): b += line(x + 14 + k * 19, cy_, x + 24 + k * 19, cy_, INK, 3)
        if i == 2: b += path(f"M{x + 20} {cy_} q 10 -26 20 0 q 10 26 20 0 q 10 -26 20 0 q 10 26 20 0 q 10 -26 20 0", INK, sw=3)
        if i == 3:
            for k in range(14): b += rect(x + 12 + k * 8.4, cy_ - 4, 4, 8, "#dfe8f5")
        b += t(x + 70, y + 134, f"{i + 1}", 16, 800, INK, "middle")
        p, _ = para(x + 70, y + 156, 140, s, 16, 600, INK, "middle")
        b += p
    n, y = notes(y + 210, "Short stitches give fine dotted lines, long stitches bolder marks; fold first and stitch both layers for a mirror image.")
    b += n
    alt = "Alabere in four steps: mark the line, sew a running stitch, pull it up hard into tight gathers and knot it, then dye and unpick, leaving a fine pale line."
    add(39, "Adire alabere", "alabere-steps", "Technique:", alt, svg(y, "Alabere stitching", alt, b))

    b, y = steps_v("Eleko freehand: the paste must be dry before the dye", [
        ("Cook the lafun paste", "Smooth and thick, like toothpaste: flows, but holds a sharp line."),
        ("Paint on stretched cloth", "Feather quill, broom rib or stick; it must reach the fibres."),
        ("Dry completely", "Wet paste dissolves in the vat and smears the design."),
        ("Dip briefly, then scrape and wash off", "Fine blue veins where the paste cracked mark it as hand-made.")], hl=[2])
    alt = "Eleko freehand: cook the cassava paste to a toothpaste thickness, paint it onto stretched cloth, dry it completely, then dip briefly and scrape and wash the paste off to reveal the pale design."
    add(40, "Adire eleko: cassava paste", "eleko-steps", "**Drying is essential:**", alt, svg(y, "Eleko freehand", alt, b))

    b, y = title("Stencils need bridges; repeats need registration marks")
    for k, (h, ok) in enumerate((("No bridge: the middle falls out", False), ("Bridges hold the middle", True))):
        x = 24 + k * 312
        b += box(x, y, 292, 200, CORAL_T if not ok else GREEN_T)
        b += t(x + 146, y + 30, h, 16, 800, INK, "middle", CORAL_T if not ok else GREEN_T)
        cx_, cy_ = x + 146, y + 116
        b += rect(cx_ - 70, cy_ - 60, 140, 120, "#c9b38a", INK, 1.5, 4)
        b += circle(cx_, cy_, 48, WHITE, INK, 1.5) + circle(cx_, cy_, 26, "#c9b38a" if ok else WHITE, INK, 1.5)
        if ok: b += rect(cx_ - 4, cy_ - 50, 8, 26, "#c9b38a") + rect(cx_ - 4, cy_ + 24, 8, 26, "#c9b38a")
    y += 220
    for k in range(3):
        x = 70 + k * 170
        b += rect(x, y, 150, 90, "#f4f1ea", INK2, 1.5, 2)
        for (dx, dy) in ((0, 0), (150, 0), (0, 90), (150, 90)):
            b += line(x + dx - 6, y + dy, x + dx + 6, y + dy, CORAL_D, 2) + line(x + dx, y + dy - 6, x + dx, y + dy + 6, CORAL_D, 2)
    b += t(W / 2, y + 120, "each print lines up with the last one's corner marks", 16, 700, INK, "middle")
    alt = "A stencil letter O cut with no bridges loses its middle; thin bridges hold it. Below, repeats line up edge to edge by matching small registration marks at the corners."
    add(41, "Eleko with stencils", "stencil-bridges", "**Registration**", alt, svg(y + 132, "Stencil bridges and registration", alt, b))

    b, y = title("Each dip adds depth; the resist stays pale")
    labs = ["1 dip", "2 dips", "4 dips", "6 dips", "many dips"]
    for i, (c, s) in enumerate(zip(INDIGO, labs)):
        x = 24 + i * 120
        b += rect(x, y, 108, 120, c, INK, 1.5, 4) + rect(x + 34, y + 40, 40, 40, "#f4f1ea", INK2, 1, 2)
        b += t(x + 54, y + 146, s, 16, 700, INK, "middle")
    b += arrow(40, y + 176, W - 40, y + 176) + t(W / 2, y + 204, "contrast between dyed and resisted areas grows", 16, 700, INK, "middle")
    n, y = notes(y + 244, "A dye log makes it repeatable: date, cloth, resist, number of dips, minutes per dip and in air, the vat's condition, and a cut sample.")
    b += n
    alt = "Five swatches from one dip (pale blue) through two, four and six to many dips (near-black blue), each with a pale resisted square — contrast increases with every dip."
    add(42, "Tying again", "dip-depth", "**Each dip adds depth**", alt, svg(y, "Building depth with dips", alt, b))

    b, y = title("The indigo dip: yellow-green in the vat, blue in the air")
    st = [("In the vat", "#c8c25a", "yellow-green leuco-indigo soaks in"), ("Lifted out", "#4c9a6a", "turns green as air reaches it"), ("A minute or two later", "#274b86", "blue: oxygen locks it in")]
    for i, (h, c, s) in enumerate(st):
        x = 24 + i * 202
        b += rect(x + 30, y, 126, 110, c, INK, 1.5, 6)
        b += t(x + 93, y + 136, h, 16, 800, INK, "middle")
        p, _ = para(x + 93, y + 158, 180, s, 16, 500, INK2, "middle")
        b += p
        if i < 2: b += arrow(x + 160, y + 55, x + 228, y + 55)
    b += path(f"M{24 + 2 * 202 + 93} {y + 216} C{500} {y + 262} {140} {y + 262} {117} {y + 216}", INK2, sw=2.5, dash="7 5", marker=True)
    b += t(W / 2, y + 286, "wait until fully blue, then dip again", 16, 700, INK, "middle")
    n, y = notes(y + 326, "Lower the wet cloth in slowly, with no splashing: oxygen spoils the vat. Many short dips give deeper, more even, more lasting colour than one long one.")
    b += n
    alt = "In a healthy reduced vat the indigo is yellow-green; lifted out, the cloth turns green and then blue within a minute or two as oxygen fixes it; once fully blue, it is dipped again."
    add(43, "The indigo vat", "indigo-dip", "**The magic of the dip:**", alt, svg(y, "The indigo dip", alt, b))

    b, y = title("Dye families and what fixes them")
    tb, y2 = table(24, y, ["Family", "Fixed by", "Wash-fast?"],
                   [["Indigo (vat)", "air, then washing", "very"], ["Natural: camwood", "a mordant, often alum", "fair"], ["Reactive", "alkali, heat, time", "very, if fixed"],
                    ["Direct", "—", "washes out more"]], [190, 230, 172], fills={(3, 2): CORAL_T})
    b += tb
    n, y = notes(y2 + 30, "The wash test: clear water means the dye is fixed; coloured water means loose dye. Rinse until clear before selling anything.")
    b += n
    alt = "Indigo and other vat dyes fix by oxidising in air and are very fast; natural dyes like camwood need a mordant such as alum; reactive dyes fix with alkali, heat and time; direct dyes wash out more."
    add(44, "Colour beyond indigo", "dye-families", "**Fixing**", alt, svg(y, "Dye families", alt, b))

    b, y = title("A motif becomes a pattern by how it repeats")
    kinds = [("In a square", "one motif per square, squares in a grid (as in Olokun)"), ("In a band", "a row of motifs between plain areas"), ("All-over grid", "the motif repeated edge to edge")]
    for i, (h, s) in enumerate(kinds):
        x = 24 + i * 202
        b += rect(x, y, 186, 160, "#274b86", INK, 1.5, 4)
        mot = lambda mx, my, r: circle(mx, my, r, "#dfe8f5") + circle(mx, my, r * 0.45, "#274b86")
        if i == 0:
            for r in range(2):
                for c in range(2):
                    b += rect(x + 12 + c * 84, y + 12 + r * 70, 78, 64, "none", "#dfe8f5", 2) + mot(x + 51 + c * 84, y + 44 + r * 70, 18)
        if i == 1:
            b += rect(x, y + 56, 186, 48, "#16294f")
            for c in range(4): b += mot(x + 26 + c * 45, y + 80, 14)
        if i == 2:
            for r in range(4):
                for c in range(4): b += mot(x + 26 + c * 45, y + 22 + r * 39, 11)
        b += t(x, y + 186, h, 16, 800)
        p, _ = para(x, y + 208, 186, s, 16, 500, INK2)
        b += p
    n, y = notes(y + 290, "Start from something meaningful, simplify it to one-colour shapes, plan the repeat, then name it and write what it means.")
    b += n
    alt = "Three ways a motif repeats: one motif per square in a grid of squares (as in Olokun), a band of motifs between plain areas, and an all-over grid edge to edge."
    add(45, "Pattern and meaning", "motif-repeat", "**Designing your own motif:**", alt, svg(y, "Repeating a motif", alt, b))

    b, y = chain_h("Finishing decides whether it sells", [("Wash out", "until the water runs clear"), ("Dry in shade", "flat, never in strong sun"), ("Press", "on the reverse, slightly damp"),
                                                       ("Label", "technique, pattern, care")],
                   note="Care card: “Wash separately in cool water with mild soap. Dry in shade.” Fold so the best part of the pattern shows.")
    alt = "Finishing adire: wash out until the water runs clear, dry flat in the shade, press on the reverse while slightly damp, and label it with the technique, the pattern's name and care instructions."
    add(46, "Finishing the cloth", "finishing-steps", "**Presentation:**", alt, svg(y, "Finishing the cloth", alt, b))

    b, y = title("Plan the wrapper to scale before you dye")
    x0, w_ = 24, W - 48
    h_ = w_ * 1.15 / 1.8 * 0.55
    b += rect(x0, y, w_, h_ + 40, "#274b86", INK, 2, 4)
    b += rect(x0, y, w_, 26, "#dfe8f5") + rect(x0, y + h_ + 14, w_, 26, "#dfe8f5")
    for k in range(22): b += circle(x0 + 14 + k * 27, y + 13, 6, "#274b86") + circle(x0 + 14 + k * 27, y + h_ + 27, 6, "#274b86")
    b += rect(x0 + w_ * 0.3, y + 40, w_ * 0.4, h_ - 40, "#16294f", "#dfe8f5", 2, 3)
    b += t(x0 + w_ / 2, y + 40 + (h_ - 40) / 2 + 6, "eleko stencil panel", 16, 800, WHITE, "middle", "#16294f")
    y2 = y + h_ + 64
    b += t(x0, y2, "Oniko border, top and bottom · about 1.8 m (2 yards) long", 16, 700)
    n, y = notes(y2 + 34, "Think about how it is worn: which parts show when wrapped? Cost it honestly: materials, every hour of your time, overheads, then a margin.")
    b += n
    alt = "A full-size wrapper about 1.8 m long planned to scale: an oniko border of tied circles along top and bottom and an eleko stencilled panel in the centre — two techniques on one cloth."
    add(47, "Make and show a wrapper", "wrapper-plan", "**Plan before you dye:**", alt, svg(y, "Wrapper layout", alt, b))

    # ── Crafts ──
    b, y = title("Cut away from your body, free hand behind the blade")
    b += rect(24, y, W - 48, 220, GREEN_T, LINE, 1, 8) + t(40, y + 28, "cutting mat", 16, 700, INK, bg=GREEN_T)
    b += rect(80, y + 100, 480, 26, "#b0b8c8", INK, 1.5, 2) + t(320, y + 92, "steel rule", 16, 700, INK, "middle", GREEN_T)
    b += rect(110, y + 140, 120, 60, GOLD_T, INK, 1.5, 20) + t(170, y + 176, "free hand", 16, 800, INK, "middle", GOLD_T)
    b += f'<polygon points="300,{y + 128} 330,{y + 128} 322,{y + 144} 300,{y + 144}" fill="{INK}"/>'
    b += arrow(340, y + 160, 540, y + 160, CORAL_D, 3) + t(440, y + 190, "blade moves this way", 16, 700, CORAL_D, "middle", GREEN_T)
    n, y = notes(y + 250, "Several light passes against a metal rule, not one heavy cut. Retract or cap the blade the moment you put it down.")
    b += n
    alt = "On a cutting mat, the free hand holds the steel rule behind the blade, and the blade travels away from it and away from the body."
    add(48, "Materials, tools", "cutting-safety", "**Cutting tools**", alt, svg(y, "Cutting safely", alt, b))

    b, y = title("Read straight on; mark the waste side")
    b += rect(60, y + 40, 520, 40, "#e8ecf4", INK, 1.5, 3)
    for k in range(27):
        x = 70 + k * 19
        b += line(x, y + 40, x, y + 40 + (16 if k % 5 == 0 else 9), INK, 1.5)
    b += line(260, y - 10, 260, y + 40, GREEN, 3) + t(268, y + 2, "eye directly above: true reading", 16, 700, GREEN)
    b += line(200, y - 10, 236, y + 40, CORAL_D, 2.5, "6 4") + t(192, y + 2, "at an angle: shifted", 16, 700, CORAL_D, "end")
    y += 110
    b += rect(60, y, 520, 90, "#f4ead2", INK, 1.5)
    b += line(360, y, 360, y + 90, INK, 1.5)
    b += t(470, y + 52, "✕ waste", 18, 800, CORAL_D, "middle", "#f4ead2")
    b += t(210, y + 52, "keep", 18, 800, INK, "middle", "#f4ead2")
    b += t(360, y + 116, "cut on the waste side of the line", 16, 700, INK, "middle")
    n, y = notes(y + 150, "Steel rule, sharp hard pencil, set square from a true edge, millimetres. Within 1 mm is good work; within 0.5 mm is excellent.")
    b += n
    alt = "Reading a rule from directly above gives the true measurement; from an angle (parallax) it shifts. Mark the waste side of a line with a cross and cut on that side."
    add(49, "Measuring, marking", "measure-mark", "**Marking:**", alt, svg(y, "Measuring and marking", alt, b))

    b, y = title("Beadwork: plan the repeat, keep the tension even")
    seq = ["#c62828", "#c62828", GOLD, INK] * 4
    for i, c in enumerate(seq):
        b += circle(60 + i * 33, y + 30, 13, c, INK, 1)
    b += t(60, y + 72, "red – red – gold – black, repeated exactly", 16, 700)
    y += 100
    rows = [("Too tight", "stiff, kinks", "M0 0 q10 -16 20 0 q10 16 20 0 q10 -16 20 0 q10 16 20 0"), ("Even", "lies flat and straight", ""), ("Too loose", "gaps, wobble", "gap")]
    for i, (h, s, kind) in enumerate(rows):
        yy = y + i * 64
        b += t(24, yy + 30, h, 16, 800) + t(24, yy + 52, s, 16, 500, INK2)
        x = 210
        for k in range(10):
            dy = (8 if k % 2 else -8) if i == 0 else 0
            b += circle(x + k * (34 if i == 2 else 28), yy + 34 + dy, 12, TEAL_T, INK, 1.2)
        b += line(200, yy + 34, x + 9 * (34 if i == 2 else 28) + 14, yy + 34, INK2, 1)
    n, y = notes(y + 210, "Finish securely: thread back through several beads and knot between them, or use a crimp bead on wire. A piece that comes undone is worthless.")
    b += n
    alt = "A planned repeat (red, red, gold, black) laid out before threading, and three tensions: too tight kinks and stiffens, even lies flat and straight, too loose leaves gaps."
    add(50, "Beadwork", "bead-tension", "**Tension**", alt, svg(y, "Beadwork pattern and tension", alt, b))

    b, y = title("Warp runs lengthways under tension; weft goes over and under")
    def weave(x, yy, twill):
        out = ""
        n_, c = 8, 26
        for r in range(n_):
            for k in range(n_):
                over = ((k + r) % 2 == 0) if not twill else (((k - r) % 4) < 2)
                fx, fy = x + k * c, yy + r * c
                out += rect(fx + 2, fy, c - 4, c, "#c9a24b" if not over else "#1e88e5", INK, 0.8) if over else rect(fx, fy + 2, c, c - 4, GOLD, INK, 0.8)
        return out
    b += weave(40, y, False) + weave(360, y, True)
    b += t(40, y + 236, "Plain (tabby): over one, under one", 16, 800) + t(360, y + 236, "Twill: over two, under two,", 16, 800) + t(360, y + 258, "shifting one each row", 16, 600, INK2)
    b += rect(40, y + 280, 22, 22, "#1e88e5", INK, 1) + t(70, y + 297, "warp on top", 16, 600) + rect(220, y + 280, 22, 22, GOLD, INK, 1) + t(250, y + 297, "weft on top", 16, 600)
    n, y = notes(y + 336, "Beat each row down; leave the weft in a gentle arc before beating, or the edges draw in and the piece narrows in the middle.")
    b += n
    alt = "Two woven squares: plain weave alternates over one, under one, row by row; twill goes over two, under two, shifting one thread each row, which makes diagonal lines."
    add(51, "Weaving", "warp-weft", "**Patterns:**", alt, svg(y, "Warp and weft", alt, b))

    b, y = title("Three-hole pamphlet stitch, seen on the fold")
    fx0, fx1, fy = 60, W - 60, y + 110
    b += rect(fx0, fy - 50, fx1 - fx0, 100, "#f4f1ea", INK, 1.5, 2) + line(fx0, fy, fx1, fy, INK2, 1.5, "6 4")
    holes = [(160, "end"), (320, "centre"), (480, "end")]
    for x, s in holes: b += circle(x, fy, 6, INK) + t(x, fy + 76, s, 16, 700, INK, "middle")
    b += path(f"M320 {fy - 90} L320 {fy - 8}", CORAL_D, sw=3, marker=False)
    b += t(330, fy - 86, "1 in through the centre", 16, 700, CORAL_D)
    b += path(f"M314 {fy + 14} C280 {fy + 40} 200 {fy + 40} 166 {fy + 12}", TEAL_D, sw=3)
    b += t(110, fy - 64, "2 out at one end", 16, 700, TEAL_D)
    b += path(f"M160 {fy - 10} C240 {fy - 40} 400 {fy - 40} 474 {fy - 10}", AMBER_D, sw=3)
    b += t(500, fy - 64, "3 in at the other end", 16, 700, AMBER_D, "middle")
    y = fy + 110
    p, y = para(24, y, W - 48, "4 out through the centre again, then tie the two ends across the long stitch and trim. Grain parallel to the spine; score before folding.", 16, 600)
    b += p
    alt = "The pamphlet stitch on three holes along the fold: in through the centre, out through one end hole, back in through the other end hole along the long stitch, out through the centre, and tie across the long stitch."
    add(52, "simple bookbinding", "pamphlet-stitch", "**Three-hole pamphlet stitch**", alt, svg(y + 12, "Pamphlet stitch", alt, b))

    b, y = chain_h("Upcycling: start from what the material is good at", [("Collect, clean", "wash, dry, labels off"), ("Test it", "bend, cut, glue, stitch?"),
                                                                     ("Design for it", "use its strengths"), ("Prototype", "test, improve")],
                   note="Sachets and bags: waterproof, flexible. Tyres: tough. Can edges are very sharp: gloves, file them smooth. Never burn plastic to shape it — the fumes are toxic.")
    alt = "Upcycling in four steps: collect and clean the waste properly, test what it can do, design something that uses its strengths, then prototype and improve."
    add(53, "Making from what is thrown away", "upcycle-process", "**Process:**", alt, svg(y, "Upcycling process", alt, b))

    b, y = title("Choose the joint for the material")
    tb, y2 = table(24, y, ["Material", "Join with", "Note"],
                   [["Paper, card, wood", "PVA", "clamp while it dries"], ["Leather, rubber", "Contact adhesive", "both sides, tacky"], ["Metal, glass", "Epoxy", "mix exactly"],
                    ["Fabric, leather", "Stitching", "flexible, strong"], ["Something to repair", "Screws, rivets", "can be undone"]], [196, 196, 200])
    b += tb
    n, y = notes(y2 + 30, "Clean, dry, slightly rough surfaces and a thin, even layer. Hot glue is quick but weak under heat or stress. Test sample joints to destruction.")
    b += n
    alt = "PVA for paper, card and wood; contact adhesive for leather and rubber; epoxy for metal and glass; stitching for fabric and leather; screws or rivets where it must come apart."
    add(55, "Joining things", "joint-chooser", "**Gluing well:**", alt, svg(y, "Choosing a joint", alt, b))

    b, y = title("Sand through the grades, one step at a time")
    gr = [("80", "coarse: removes marks", 18), ("120", "", 12), ("180", "", 7), ("240", "fine: smooth to touch", 3)]
    for i, (g, s, sc) in enumerate(gr):
        x = 24 + i * 152
        b += rect(x, y, 140, 90, "#d9c7a3", INK, 1.5, 4)
        for k in range(14):
            b += line(x + 8 + k * 9, y + 14 + (k % 3) * 20, x + 8 + k * 9 + sc, y + 14 + (k % 3) * 20 + sc, "#6b4f2a", 2)
        b += t(x + 70, y + 118, g, 18, 800, INK, "middle")
        if s:
            p, _ = para(x + 70, y + 140, 140, s, 16, 500, INK2, "middle")
            b += p
        if i < 3: b += arrow(x + 142, y + 45, x + 150, y + 45)
    n, y = notes(y + 200, "Each grade removes the scratches of the one before; jumping from 80 to 240 leaves scratches that show under the finish. With the grain; dust off between grades; thin coats.")
    b += n
    alt = "Sandpaper grades 80 → 120 → 180 → 240: each finer grade removes the scratches left by the one before, which is why skipping a grade leaves scratches the finish shows up."
    add(56, "Finish and surface", "grit-steps", "**Sanding through the grades:**", alt, svg(y, "Sanding grades", alt, b))

    b, y = cycle("Design for somebody else: a loop, not a line", [("Research", "ask about past behaviour"), ("Design", "change one thing"), ("Prototype", None), ("Test", "with real buyers"),
                                                                ("Improve", "log what changed")], "The buyer decides")
    alt = "The design loop: research with real buyers, design, prototype, test, improve — changing one thing at a time and logging what changed — then round again."
    add(57, "Designing for somebody else", "design-loop", "a loop, not a straight line", alt, svg(y, "The design loop", alt, b))

    b, y = title("Pricing a hand-made bag (an example)")
    parts = [("Materials", 2500, TEAL_T), ("Labour: 4 hours × ₦1,000", 4000, GOLD_T), ("Overheads", 500, PURPLE_T), ("Margin, 40%", 2800, GREEN_T)]
    yy = y
    for s, v_, f in parts:
        h = 30 + v_ * 0.012
        b += rect(24, yy, 380, h, f, INK, 1) + t(36, yy + h / 2 + 6, s, 16, 700, INK, bg=f) + t(392, yy + h / 2 + 6, f"₦{v_:,}", 16, 800, INK, "end", f)
        yy += h
        if s == "Overheads":
            b += line(24, yy, 404, yy, INK, 3) + t(420, yy + 6, "= cost ₦7,000", 18, 800)
    b += box(420, yy - 46, 196, 46, GOLD, INK) + t(434, yy - 16, "= price ₦9,800", 18, 800, INK, bg=GOLD)
    y = yy - 170
    n, y = notes(y + 200, "A shop usually pays about half its shelf price, so the wholesale price must still cover the ₦7,000 cost. If cost is above the market, change the making or the market — not the price below cost.")
    b += n
    alt = "An example bag: materials ₦2,500, labour 4 hours × ₦1,000 = ₦4,000, overheads ₦500 make a cost of ₦7,000; a 40% margin of ₦2,800 gives a price of ₦9,800."
    add(58, "Pricing and packaging", "craft-pricing", "**The pricing formula:**", alt, svg(y, "Pricing a craft", alt, b))

    b, y = title("A stall, from the front: use height, show prices, group things")
    gy = y + 300
    b += rect(24, y + 70, W - 48, 70, GOLD_T, LINE, 1, 4) + t(40, y + 100, "eye level: the best pieces", 16, 800, INK, bg=GOLD_T) + t(40, y + 124, "on stands and boxes", 16, 500, INK2, bg=GOLD_T)
    b += rect(24, gy - 70, W - 48, 70, "#e9dcc3", INK, 1.5)
    for k, (x, h) in enumerate(((380, 120), (450, 170), (530, 120))):
        b += rect(x, gy - 70 - h, 56, h, SOFT, INK, 1.5, 3) + rect(x + 6, gy - 70 - h + 6, 44, 22, WHITE, INK2, 1, 2) + t(x + 28, gy - 70 - h + 23, "₦", 16, 800, INK, "middle")
    b += t(40, gy - 30, "table: grouped by colour, type or price", 16, 700, INK, bg="#e9dcc3")
    b += line(24, gy, W - 24, gy, INK2, 2)
    n, y = notes(gy + 32, "A price on every piece — many shoppers will not ask. Record what sold, what was picked up and put down, and what people asked for.")
    b += n
    alt = "A market stall from the front: the best pieces at eye level on stands and boxes, everything else grouped on the table, and a price tag on every piece."
    add(59, "The craft market", "market-stall", "**Setting up:**", alt, svg(y, "A market stall", alt, b))
