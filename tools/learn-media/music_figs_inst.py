"""Drums, Violin, Saxophone, Vocal Training and Music Production diagrams."""
from music_draw import *  # noqa: F401,F403

COUNTS8 = ["1", "&", "2", "&", "3", "&", "4", "&"]
COUNTS16 = ["1", "e", "&", "a", "2", "e", "&", "a", "3", "e", "&", "a", "4", "e", "&", "a"]


def figs():
    D = {}

    # ═══ DRUMS ═══
    b = title("Set-up: seat height, and where to hold the stick")
    # side view: stool, thigh sloping down to knee, shin to pedal
    b += rect(40, 210, 90, 14, INK2, INK, 3) + line(85, 224, 85, 300, INK2, 6) + line(55, 300, 115, 300, INK2, 6)
    b += line(85, 120, 85, 205, INK, 10, cap="round")                       # torso
    b += circle(85, 102, 18, "#ffffff", INK, 3)                              # head
    b += line(90, 205, 190, 228, INK, 10, cap="round")                       # thigh sloping down
    b += line(190, 228, 196, 300, INK, 10, cap="round")                      # shin
    b += line(180, 300, 222, 296, INK, 7, cap="round")                       # foot on pedal
    b += f'<path d="M100 196 L190 196" stroke="{GOLD}" stroke-width="3" stroke-dasharray="6 5"/>'
    b += text(200, 190, "level", 16, 700, INK2)
    b += text(212, 252, "thigh slopes", 16, 800, CORAL_INK) + text(212, 272, "slightly down", 16, 800, CORAL_INK)
    # stick with fulcrum
    sx0, sx1, sy = 340, 615, 150
    b += f'<path d="M{sx0} {sy - 7} L{sx1 - 20} {sy - 4} Q{sx1} {sy} {sx1 - 20} {sy + 4} L{sx0} {sy + 7} Z" fill="{GOLD_SOFT}" stroke="{INK}" stroke-width="2"/>'
    fx = sx0 + (sx1 - sx0) / 3
    b += line(fx, sy - 30, fx, sy + 30, CORAL_INK, 3) + text(fx, sy - 40, "fulcrum", 17, 800, CORAL_INK, "middle")
    b += text(sx0, sy + 50, "butt", 16, 700, INK2) + text(sx1, sy + 50, "tip", 16, 700, INK2, "end")
    b += f'<path d="M{sx0} {sy + 62} L{sx0} {sy + 70} L{fx} {sy + 70} L{fx} {sy + 62}" fill="none" stroke="{INK2}" stroke-width="2"/>'
    b += text((sx0 + fx) / 2, sy + 94, "about a third", 16, 700, INK2, "middle")
    b += text(340, 300, "Pinch at the fulcrum with thumb", 16, 600) + text(340, 324, "and first finger; others loose.", 16, 600)
    D["drums/setup-and-grip.svg"] = svg(334, "Drum stool height and the stick's fulcrum",
        "Left: a drummer seen from the side with the thigh sloping slightly down from hip to knee, foot on the pedal. Right: a drumstick with its fulcrum, the balance point, about a third of the way from the butt end.", b)

    b = title("Tempo: beats per minute")
    for i, (bpm, n) in enumerate([(60, 4), (120, 8)]):
        y = 70 + i * 100
        b += text(20, y + 30, f"{bpm} bpm", 18, 800) + text(20, y + 54, f"{bpm // 60} beat{'s' if bpm > 60 else ''} a second", 16, 600, INK2)
        b += line(190, y + 30, 620, y + 30, LINE, 2)
        for k in range(5):
            b += line(190 + k * 105, y + 14, 190 + k * 105, y + 46, MUTE, 1.5)
            b += text(190 + k * 105, y + 66, f"{k} s", 16, 600, MUTE, "middle")
        for k in range(n):
            b += circle(190 + k * 420 / n + (0 if n == 4 else 0), y + 30, 11, GOLD if k % (n // 4) == 0 else INK)
    b += text(20, 290, "Count 1 2 3 4 in 4/4. Start at 60 bpm; go up 4–5 bpm only when it is perfect.", 16, 600)
    D["drums/tempo-bpm.svg"] = svg(300, "60 and 120 beats per minute",
        "Two timelines four seconds long. At 60 bpm there is one beat every second; at 120 bpm two beats every second.", b)

    def groove(name, rows, foot, counts=COUNTS8, desc=""):
        b = title(name)
        g, gx, cw = count_grid(20, 60, counts, rows, width=600)
        b += g
        h = 60 + 34 + 44 * len(rows) + 30
        for i, ln in enumerate(foot):
            b += text(20, h + i * 24, ln, 16, 600)
        return b, h + 24 * len(foot) - 10
    b, h = groove("The backbeat: kick on 1 and 3, snare on 2 and 4",
                  [("Snare", {2: "x", 6: "x"}), ("Kick", {0: "x", 4: "x"})],
                  ["Count aloud: 1 (kick) 2 (snare) 3 (kick) 4 (snare). Start at 60 bpm."])
    D["drums/backbeat.svg"] = svg(h, "The backbeat",
        "A bar counted 1 and 2 and 3 and 4 and. Kick drum on beats 1 and 3, snare on beats 2 and 4.", b)
    b, h = groove("The eighth-note groove",
                  [("Hi-hat", {i: "x" for i in range(8)}), ("Snare", {2: "x", 6: "x"}), ("Kick", {0: "x", 4: "x"})],
                  ["Eight even hi-hats: 1 & 2 & 3 & 4 &. Every snare and kick lands", "exactly with a hi-hat stroke."])
    D["drums/eighth-note-groove.svg"] = svg(h, "Eighth-note rock groove",
        "Hi-hat on all eight counts, 1 and 2 and 3 and 4 and; snare on 2 and 4; kick on 1 and 3.", b)

    b = title("Three bars of groove, one bar of fill")
    for i, lab in enumerate(["groove", "groove", "groove", "FILL"]):
        b += rect(20 + i * 120, 60, 112, 48, GOLD if lab == "FILL" else SOFT, INK, 6, 1.2) + text(76 + i * 120, 90, lab, 17, 800, INK, "middle")
    b += rect(500, 60, 112, 48, SOFT, INK, 6, 1.2) + text(556, 90, "groove…", 17, 800, INK, "middle")
    g, gx, cw = count_grid(20, 140, COUNTS8 + ["1"], [("Snare", {0: "x", 1: "x", 2: "x", 3: "x"}), ("High tom", {4: "x", 5: "x"}),
                                                     ("Floor tom", {6: "x", 7: "x"}), ("Crash + kick", {8: "c"})], width=600, label_w=120)
    b += g
    b += text(20, 380, "The fill bar: four snare strokes, then toms high to low, in eighths.", 16, 600)
    b += text(20, 404, "The crash and kick land together on beat 1 of the next bar.", 16, 700)
    D["drums/fill.svg"] = svg(414, "A one-bar fill",
        "A four-bar phrase: three bars of groove and one bar of fill. The fill: snare on 1 and 2 and, high tom on 3 and, floor tom on 4 and, then crash cymbal and kick together on beat 1 of the next bar.", b)

    b, h = groove("Accents and ghost notes: an example to practise",
                  [("Hi-hat", {i: "x" for i in range(16)}), ("Snare", {4: "X", 12: "X", 2: "g", 7: "g", 10: "g", 15: "g"}), ("Kick", {0: "x", 6: "x", 11: "x"})],
                  ["Gold = backbeat at full height. Small open circles = ghost notes, the stick", "only a few centimetres above the head. The kick moves off 1 and 3."], counts=COUNTS16)
    D["drums/ghost-notes.svg"] = svg(h, "Accents and ghost notes",
        "A sixteenth-note grid. Hi-hat on every sixteenth; the snare's backbeat on 2 and 4 at full volume with quiet ghost notes between; the kick on 1, the 'and' of 2 and the 'e' of 3 rather than only on 1 and 3. One example pattern for practising ghost notes.", b)

    # dùndún
    b = title("The dùndún: squeeze the cords, raise the pitch")
    for i, (lab, waist, note) in enumerate([("Relaxed", 46, "lower note"), ("Squeezed", 30, "higher note")]):
        x0 = 120 + i * 280
        top, bot = 80, 300
        d = (f"M{x0 - 70} {top} C{x0 - 50} {top + 80} {x0 - waist} {top + 100} {x0 - waist} {(top + bot) / 2} "
             f"C{x0 - waist} {bot - 100} {x0 - 50} {bot - 80} {x0 - 70} {bot} L{x0 + 70} {bot} "
             f"C{x0 + 50} {bot - 80} {x0 + waist} {bot - 100} {x0 + waist} {(top + bot) / 2} "
             f"C{x0 + waist} {top + 100} {x0 + 50} {top + 80} {x0 + 70} {top} Z")
        b += f'<path d="{d}" fill="{GOLD_SOFT}" stroke="{INK}" stroke-width="2.5"/>'
        b += f'<ellipse cx="{x0}" cy="{top}" rx="70" ry="12" fill="#ffffff" stroke="{INK}" stroke-width="2.5"/>'
        for k in range(-3, 4):
            xt, xb = x0 + k * 20, x0 + k * 20
            b += f'<path d="M{xt} {top + 8} Q{x0 + k * waist / 3.5:.1f} {(top + bot) / 2} {xb} {bot}" fill="none" stroke="{INK2}" stroke-width="1.5"/>'
        if i == 1:
            b += arrow(x0 + 100, 190, x0 + waist + 8, 190, CORAL_INK) + arrow(x0 - 100, 190, x0 - waist - 8, 190, CORAL_INK)
        b += text(x0, 336, lab, 18, 800, INK, "middle") + text(x0, 360, note, 16, 700, INK2, "middle")
    b += text(20, 396, "Tighter cords stretch the heads: the note rises. Strike, then squeeze.", 16, 600)
    D["drums/dundun.svg"] = svg(406, "How the talking drum changes pitch",
        "Two hourglass-shaped dùndún drums with leather cords running between the heads. Relaxed cords give a lower note; squeezing the cords under the arm stretches the heads and raises the note.", b)

    b = title("Volume comes from stick height")
    lv = [("pp", 2), ("p", 4), ("mf", 9), ("f", 16), ("ff", 22)]
    for i, (d, hgt) in enumerate(lv):
        x = 80 + i * 115
        b += rect(x - 30, 280, 60, 10, INK2, INK, 3)
        top = 280 - hgt * 9
        b += f'<path d="M{x} {top} L{x + 6} {top + 4} L{x + 6} 270 L{x - 6} 270 L{x - 6} {top + 4} Z" fill="{GOLD_SOFT}" stroke="{INK}" stroke-width="1.5"/>' if False else ""
        b += line(x, 274, x, top, GOLD, 8, cap="round") + circle(x, 274, 5, INK)
        b += text(x, top - 12, d, 20, 900, INK, "middle", italic=True)
    b += text(20, 320, "Low stick (a few cm): soft. High stick (20 cm and more, from the wrist): loud.", 16, 600)
    b += text(20, 344, "Same relaxed stroke and rebound every time — only the height changes.", 16, 600)
    D["drums/stick-heights.svg"] = svg(354, "Stick height and dynamics",
        "Five sticks rising from the drum head at increasing heights, labelled pp, p, mf, f, ff: the higher the stick starts, the louder the note.", b)

    # drum chart key + groove
    b = title("Reading a drum chart")
    st = Staff(20, 90, 600, "perc").lines().clef_glyph()
    key = [("Crash", "A5", "x"), ("Hi-hat", "G5", "x"), ("Ride", "F5", "x"), ("High tom", "E5", "f"), ("Snare", "C5", "f"),
           ("Floor tom", "A4", "f"), ("Kick", "F4", "f"), ("Hi-hat foot", "D4", "x")]
    for i, (nm, pos, hd) in enumerate(key):
        x = 80 + i * 70
        st.head(x, pos, "x" if hd == "x" else "filled")
    b += st.svg()
    for i, (nm, pos, hd) in enumerate(key):
        x = 80 + i * 70
        for k, w in enumerate(nm.split()):
            b += text(x, 214 + k * 20, w, 16, 700, INK2, "middle")
    st2 = Staff(20, 350, 600, "perc").lines().clef_glyph()
    st2.time(78, 4, 4)
    hh = []
    for i in range(8):
        x = 120 + i * 58
        hh.append(st2.note(x, "G5", "8", stem="up", flag=False, head="x"))
        if i in (2, 6):
            st2.head(x, "C5", "filled")
            st2.out.append(line(x + 0.58 * S, st2.ypos("C5"), x + 0.58 * S, st2.ypos("G5"), INK, 1.6))
        if i in (0, 4):
            st2.note(x, "F4", "q", stem="down")
    st2.beam(hh[:4], "up")
    st2.beam(hh[4:], "up")
    st2.barline(600, final=True)
    b += st2.svg()
    b += text(20, 276, "The week 4 groove: hi-hat eighths, snare on 2 and 4, kick on 1 and 3.", 16, 700)
    D["drums/drum-chart.svg"] = svg(450, "Drum notation key and a written groove",
        "Top: a percussion stave key — crash above the stave, hi-hat just above the top line, ride on the top line (all x noteheads), high tom in the top space, snare in the third space from the bottom, floor tom in the second space, kick in the bottom space, hi-hat foot below the stave. Bottom: the eighth-note groove written out: hi-hat x noteheads in beamed eighths, snare on beats 2 and 4, kick on beats 1 and 3.", b)

    # ═══ VIOLIN ═══
    b = title("The parts of the violin")
    cx = 200
    b += '<g transform="translate(0,34)">'
    body = (f"M{cx} 110 C{cx - 60} 110 {cx - 80} 130 {cx - 76} 170 C{cx - 74} 190 {cx - 52} 196 {cx - 52} 212 "
            f"C{cx - 52} 228 {cx - 82} 236 {cx - 84} 270 C{cx - 86} 320 {cx - 50} 340 {cx} 340 "
            f"C{cx + 50} 340 {cx + 86} 320 {cx + 84} 270 C{cx + 82} 236 {cx + 52} 228 {cx + 52} 212 "
            f"C{cx + 52} 196 {cx + 74} 190 {cx + 76} 170 C{cx + 80} 130 {cx + 60} 110 {cx} 110 Z")
    b += f'<path d="{body}" fill="{GOLD_SOFT}" stroke="{INK}" stroke-width="2.5"/>'
    b += rect(cx - 10, 40, 20, 200, INK2, INK, 4)                                        # neck + fingerboard
    b += circle(cx, 34, 14, GOLD_SOFT, INK, 2.5)                                         # scroll
    for k in (-1, 1):
        b += line(cx + k * 10, 46, cx + k * 22, 46, INK, 4) + line(cx + k * 10, 60, cx + k * 22, 60, INK, 4)   # pegs
    b += rect(cx - 30, 262, 60, 7, "#ffffff", INK, 2)                                    # bridge
    b += f'<path d="M{cx - 38} 228 q-8 18 0 40 M{cx + 38} 228 q8 18 0 40" fill="none" stroke="{INK}" stroke-width="2.5"/>'  # f-holes
    b += rect(cx - 12, 300, 24, 26, INK2, INK, 3)                                        # tailpiece
    b += f'<ellipse cx="{cx + 34}" cy="326" rx="24" ry="12" fill="{INK2}" stroke="{INK}" stroke-width="1.5"/>'   # chinrest
    for k in range(4):
        b += line(cx - 6 + k * 4, 50, cx - 6 + k * 4, 300, "#ffffff", 1)
    b += "</g>"
    labels = [("Scroll", cx + 16, 34), ("Pegs", cx + 24, 54), ("Fingerboard", cx + 12, 150), ("f-hole", cx + 44, 248),
              ("Bridge", cx + 32, 266), ("Tailpiece and fine tuners", cx + 14, 306), ("Chinrest", cx + 58, 330)]
    for i, (lab, px, py) in enumerate(labels):
        ty = 70 + i * 44
        b += line(px, py + 34, 360, ty - 6, MUTE, 1.2) + text(366, ty, lab, 17, 700)
    b += text(366, 70 + 7 * 44, "Strings, low to high: G D A E", 17, 800)
    D["violin/parts.svg"] = svg(400, "Parts of the violin",
        "A violin seen from the front with labels: scroll, pegs, fingerboard, f-holes, bridge, tailpiece with fine tuners, chinrest. The four strings are G, D, A, E from lowest to highest.", b)

    b = title("A straight bow: parallel to the bridge")
    b += rect(200, 60, 240, 70, INK2, INK, 4)
    b += rect(190, 262, 260, 12, "#ffffff", INK, 3) + text(462, 274, "bridge", 16, 800)
    for k in range(4):
        b += line(250 + k * 46, 60, 250 + k * 46, 300, INK, 1.5)
    b += pill(320, 102, "end of fingerboard", INK2, "#ffffff")
    b += rect(60, 190, 520, 12, GOLD, INK, 6)
    b += text(60, 182, "bow: parallel to the bridge", 16, 800)
    b += f'<path d="M80 236 L560 160" stroke="{CORAL_INK}" stroke-width="3" stroke-dasharray="8 6"/>'
    b += text(462, 236, "contact point", 16, 800, INK2) + line(455, 231, 425, 200, MUTE, 1.2)
    b += text(20, 336, "Contact point: about halfway from the bridge to the fingerboard.", 16, 600)
    b += text(20, 360, "Dashed red: a slanted bow drifts — toward the fingerboard the sound", 16, 600)
    b += text(20, 384, "goes thin and airy; toward the bridge, glassy and squeaky.", 16, 600)
    D["violin/straight-bow.svg"] = svg(394, "Keeping the bow straight",
        "Seen from above: four strings, the end of the fingerboard and the bridge. The bow crosses the strings parallel to the bridge, about halfway between bridge and fingerboard. A slanted bow drifts towards the fingerboard (thin, airy sound) or the bridge (glassy, squeaky).", b)

    def fingering(ttl, strings, desc, fname):
        """Two strings of a violin fingerboard, seen with the scroll on the left. Fingers 1, 2, 3 with the 2–3
        semitone drawn close together and the tone gaps drawn wider."""
        b = title(ttl)
        tone, semi = 120, 60
        for si, (sname, notes) in enumerate(strings):
            y = 100 + si * 110
            b += text(20, y + 6, f"{sname} string", 17, 800)
            b += line(150, y, 620, y, INK, 2.5)
            b += circle(170, y, 16, "#ffffff", INK, 2) + text(170, y + 6, notes[0], 16, 800, INK, "middle")
            b += text(170, y + 40, "open", 16, 600, INK2, "middle")
            xs = [170 + tone, 170 + 2 * tone, 170 + 2 * tone + semi]
            for k, (x, n) in enumerate(zip(xs, notes[1:])):
                b += circle(x, y, 18, GOLD, INK, 1.4) + text(x, y + 6, n, 16, 800, INK, "middle")
                b += text(x, y + 42, str(k + 1), 17, 800, BLUE, "middle")
            for (a, c, lab) in [(170, xs[0], "tone"), (xs[0], xs[1], "tone"), (xs[1], xs[2], "semi")]:
                b += text((a + c) / 2, y - 22, lab, 16, 800, CORAL_INK if lab == "semi" else INK2, "middle")
        b += text(20, 100 + 2 * 110 - 10, "Blue = finger number. \"High 2\": fingers 2 and 3 touch; other gaps are wider.", 16, 600)
        D[fname] = svg(100 + 2 * 110, ttl, desc, b)
    fingering("A major on the A and E strings", [("A", ["A", "B", "C♯", "D"]), ("E", ["E", "F♯", "G♯", "A"])],
              "On the A string: open A, finger 1 B, finger 2 C sharp, finger 3 D. On the E string: open E, finger 1 F sharp, finger 2 G sharp, finger 3 A. Fingers 2 and 3 sit close together (a semitone); the other gaps are tones.",
              "violin/a-major-fingers.svg")
    fingering("D major on the D and A strings", [("D", ["D", "E", "F♯", "G"]), ("A", ["A", "B", "C♯", "D"])],
              "On the D string: open D, finger 1 E, finger 2 F sharp, finger 3 G. On the A string: open A, finger 1 B, finger 2 C sharp, finger 3 D. The same high-2 pattern as A major, one string lower.",
              "violin/d-major-fingers.svg")

    b = title("Where the violin's notes sit on the stave")
    st = Staff(20, 110, 600).lines().clef_glyph()
    opens = [("G3", "open G"), ("D4", "open D"), ("A4", "open A"), ("E5", "open E")]
    for i, (n, lab) in enumerate(opens):
        st.note(110 + i * 62, n, "w")
        st.barline(360)
    a_str = [("A4", "0"), ("B4", "1"), ("C#5", "2"), ("D5", "3")]
    for i, (n, f) in enumerate(a_str):
        st.note(410 + i * 60, n, "w")
    b += st.svg()
    for i, (n, lab) in enumerate(opens):
        b += text(110 + i * 62, 82, pretty(n), 18, 800, INK, "middle")
    for i, (n, f) in enumerate(a_str):
        b += text(410 + i * 60, 82, pretty(n), 18, 800, INK, "middle") + text(410 + i * 60, 248, f, 18, 800, BLUE, "middle")
    b += text(110 + 1.5 * 62, 248, "the four open strings", 16, 700, INK2, "middle")
    b += text(500, 278, "fingers on the A string", 16, 700, BLUE, "middle")
    b += text(20, 316, "Open G hangs below two ledger lines; open D sits just under the stave.", 16, 600)
    D["violin/notes-on-stave.svg"] = svg(326, "Open strings and first-position notes on the treble stave",
        "Treble stave. The open strings: G below two ledger lines, D in the space below the stave, A in the second space, E in the top space. Then on the A string: A open (0), B on the middle line with finger 1, C sharp in the third space with finger 2, D on the fourth line with finger 3.", b)

    b = title("Slur, tie and bow marks")
    st = Staff(20, 100, 600).lines().clef_glyph()
    xs = [100, 150, 200, 250]
    for x, n in zip(xs, ["A4", "B4", "C#5", "D5"]):
        st.note(x, n, "q", stem="up")
    st.out.append(st.curve(96, 254, 160, up=False, h=-24))
    st.barline(300)
    st.note(350, "E5", "h", stem="down")
    st.note(470, "E5", "h", stem="down")
    st.out.append(st.curve(356, 466, 102, up=True, h=-22) if False else st.curve(356, 466, 95, up=True, h=18))
    st.barline(560)
    b += st.svg()
    b += text(100, 84, "⊓", 22, 900, INK, "middle") + text(350, 70, "V", 20, 900, INK, "middle")
    b += text(175, 228, "slur: different notes, one bow", 16, 800, INK, "middle")
    b += text(410, 228, "tie: same note, held on", 16, 800, INK, "middle")
    b += text(20, 270, "⊓ = down-bow (frog to tip)    V = up-bow (tip to frog)", 16, 700)
    D["violin/slur-tie-bowing.svg"] = svg(280, "Slur, tie and bowing marks",
        "Four notes A B C sharp D under one slur with a down-bow mark: all in one bow. Then two Es joined by a tie with an up-bow mark: one note held across the bar line.", b)

    b = title("Contact point: from bridge to fingerboard")
    b += rect(20, 70, 600, 70, SOFT, LINE, 8)
    for i, (lab, fill) in enumerate([("near the bridge", "#fcd9cf"), ("middle", GOLD_SOFT), ("near the fingerboard", TEAL_SOFT)]):
        b += rect(20 + i * 200, 70, 200, 70, fill, LINE, 0) + text(120 + i * 200, 112, lab, 16, 800, INK, "middle")
    rows = [("Sound", ["loud, brilliant", "full", "soft, sweet, airy"]), ("Weight", ["more", "medium", "less"]), ("Bow speed", ["slower", "medium", "faster"])]
    for j, (h, vals) in enumerate(rows):
        y = 170 + j * 40
        b += text(20, y, h, 16, 800, INK2)
        for i, v in enumerate(vals):
            b += text(120 + i * 200 + 40, y, v, 16, 700, INK, "middle")
    b += text(20, 300, "Louder: more weight, more speed and nearer the bridge, together.", 16, 600)
    b += text(20, 324, "Messa di voce: one bow, soft → loud → soft, without a crunch or a whistle.", 16, 600)
    D["violin/contact-point.svg"] = svg(334, "Bow contact point and tone",
        "Three lanes between bridge and fingerboard. Near the bridge: loud and brilliant, needing more weight and a slower bow. Middle: full. Near the fingerboard: soft and airy, needing less weight and a faster bow.", b)

    b = title("Tuning in fifths: G – D – A – E")
    strs = ["G", "D", "A", "E"]
    for i, s_ in enumerate(strs):
        x = 120 + i * 130
        b += circle(x, 140, 32, GOLD if s_ == "A" else GOLD_SOFT, INK, 2) + text(x, 148, s_, 24, 900, INK, "middle")
        if i < 3:
            b += f'<path d="M{x + 34} 120 Q{x + 65} 84 {x + 96} 120" fill="none" stroke="{INK2}" stroke-width="2" marker-end="url(#a)"/>'
            b += text(x + 65, 84, "5th", 16, 800, INK2, "middle")
    b += text(380, 200, "A = 440 Hz, from the oboe or piano", 16, 800, INK, "middle")
    b += text(20, 250, "Tune A first. Then play two open strings together (A–D, D–G, A–E)", 16, 600)
    b += text(20, 274, "and turn until the wobble (the \"beats\") stops and the fifth locks.", 16, 600)
    D["violin/tuning-fifths.svg"] = svg(284, "Tuning the violin in fifths",
        "The four strings G, D, A, E, each a perfect fifth apart. Tune A to 440 hertz first, then each neighbouring pair together until the fifth sounds steady.", b)

    # ═══ SAXOPHONE ═══
    def sax_chart(cols, ttl, fname, desc, foot):
        """Fingering chart: per note, the left-hand keys 1 2 3, the right-hand keys 1 2 3, and extras."""
        b = title(ttl)
        n = len(cols)
        cw = min(80, 480 / n)
        x0 = 140 + (480 - n * cw) / 2
        rows = ["oct", "L1", "L2", "L3", "R1", "R2", "R3", "lowC"]
        ry = {"oct": 80, "L1": 120, "L2": 156, "L3": 192, "R1": 244, "R2": 280, "R3": 316, "lowC": 356}
        b += text(20, 84, "octave key", 16, 700, INK2) + text(20, 160, "left hand", 16, 700, INK2) + text(20, 284, "right hand", 16, 700, INK2) + text(20, 360, "low C key", 16, 700, INK2)
        b += line(110, 218, 630, 218, LINE, 1.5)
        for i, (nm, down) in enumerate(cols):
            x = x0 + i * cw + cw / 2
            b += text(x, 400, nm, 20, 900, INK, "middle")
            for r in rows:
                y = ry[r]
                on = r in down
                if r == "oct":
                    b += rect(x - 12, y - 8, 24, 16, INK if on else "#ffffff", INK, 8, 1.6)
                elif r == "lowC":
                    b += rect(x - 14, y - 9, 28, 18, INK if on else "#ffffff", INK, 4, 1.6)
                else:
                    b += circle(x, y, 13, INK if on else "#ffffff", INK, 1.8)
        for i, ln in enumerate(foot):
            b += text(20, 436 + i * 24, ln, 16, 600)
        D[fname] = svg(436 + 24 * len(foot) - 10, ttl, desc, b)
    sax_chart([("B", {"L1"}), ("A", {"L1", "L2"}), ("G", {"L1", "L2", "L3"})], "Your first three notes: B, A, G",
              "sax/b-a-g.svg", "Fingering chart: B is left-hand finger 1; A is left-hand fingers 1 and 2; G is left-hand fingers 1, 2 and 3. Filled circles are keys pressed.",
              ["Filled = pressed. Left hand only: the right hand rests at the bottom."])
    LH, RH = {"L1", "L2", "L3"}, {"R1", "R2", "R3"}
    sax_chart([("C", LH | RH | {"lowC"}), ("D", LH | RH), ("E", LH | {"R1", "R2"}), ("F", LH | {"R1"}), ("G", set(LH)),
               ("A", {"L1", "L2"}), ("B", {"L1"}), ("C", {"L2"})], "C major, written, from low C",
              "sax/c-major-fingerings.svg", "Fingering chart for written C major: low C all six main keys plus the low C key; D all six; E left three plus right 1 and 2; F left three plus right 1; G left three; A left 1 and 2; B left 1; middle C left-hand finger 2 only.",
              ["Middle C is the odd one: left-hand finger 2 alone."])
    sax_chart([("low G", set(LH)), ("high G", set(LH) | {"oct"}), ("low D", LH | RH), ("middle D", LH | RH | {"oct"})],
              "The octave key: same fingers, one octave up", "sax/octave-key.svg",
              "Low G is left-hand fingers 1 2 3; the G an octave higher adds the octave key under the left thumb. Low D is all six main keys; middle D adds the octave key.",
              ["Roll the left thumb onto the octave key; keep the air fast and do not bite."])

    b = title("Embouchure: how the mouth meets the mouthpiece")
    # side section: mouthpiece wedge pointing left into mouth
    b += f'<path d="M120 150 L420 130 L420 210 L120 178 Z" fill="{INK2}" stroke="{INK}" stroke-width="2"/>'
    b += f'<path d="M120 182 L420 214 L420 222 L150 190 Z" fill="{GOLD}" stroke="{INK}" stroke-width="1.5"/>'
    b += text(430, 222, "reed", 16, 800) + text(430, 136, "mouthpiece", 16, 800)
    b += rect(150, 108, 34, 34, "#ffffff", INK, 6, 2) + text(167, 100, "top teeth", 16, 800, INK, "middle") if False else ""
    b += f'<path d="M150 112 L185 112 L185 142 L150 146 Z" fill="#ffffff" stroke="{INK}" stroke-width="2"/>'
    b += f'<path d="M150 236 L188 236 L188 218 L150 208 Z" fill="#ffffff" stroke="{INK}" stroke-width="2"/>'
    b += f'<path d="M140 196 C170 196 196 196 204 202 C200 218 160 224 136 222 Z" fill="#fcd9cf" stroke="{INK}" stroke-width="2"/>'
    b += text(20, 112, "top teeth rest", 16, 700) + text(20, 132, "on top", 16, 700)
    b += text(20, 270, "bottom lip over the lower", 16, 700) + text(20, 290, "teeth, cushioning the reed", 16, 700)
    b += line(150, 262, 165, 218, MUTE, 1.2) + line(110, 130, 152, 128, MUTE, 1.2)
    b += text(300, 290, "Top teeth about 1–1.5 cm from the tip.", 16, 600) + text(300, 314, "Corners firm, like a drawstring.", 16, 600)
    D["sax/embouchure.svg"] = svg(324, "Saxophone embouchure",
        "Side view: the top teeth rest on top of the mouthpiece about 1 to 1.5 cm from the tip; the bottom lip is rolled slightly over the lower teeth and cushions the reed underneath.", b)

    b = title("Slurred and tongued")
    st = Staff(20, 90, 600).lines().clef_glyph()
    ns = ["G4", "A4", "B4", "C5"]
    for i, n in enumerate(ns):
        st.note(110 + i * 50, n, "q", stem="up")
    st.out.append(st.curve(106, 264, 160, up=False, h=-22))
    st.barline(320)
    for i, n in enumerate(ns):
        st.note(370 + i * 60, n, "q", stem="down")
    b += st.svg()
    for i in range(4):
        b += text(370 + i * 60, 84, "too", 16, 800, BLUE, "middle")
    b += text(110, 84, "too", 16, 800, BLUE, "middle")
    b += text(185, 214, "slurred: tongue the first,", 16, 700, INK, "middle") + text(185, 236, "fingers change the rest", 16, 700, INK, "middle")
    b += text(460, 214, "tongued: every note", 16, 700, INK, "middle") + text(460, 236, "starts with \"too\"", 16, 700, INK, "middle")
    D["sax/slur-tongue.svg"] = svg(246, "Slurred and tongued notes",
        "G A B C under a slur, tongued only on the first note; then G A B C again with every note tongued.", b)

    b = title("Alto saxophone in E♭: written and concert pitch")
    rows = [("Concert (piano) plays", ["E♭", "B♭", "A"]), ("Alto sax reads", ["C", "G", "F♯"])]
    for i, (lab, ns) in enumerate(rows):
        y = 70 + i * 90
        b += text(20, y + 34, lab, 17, 800)
        for j, n in enumerate(ns):
            b += rect(250 + j * 120, y, 100, 52, GOLD_SOFT if i == 1 else SOFT, INK, 8, 1.2) + text(300 + j * 120, y + 34, n, 22, 900, INK, "middle")
    for j in range(3):
        b += arrow(300 + j * 120, 126, 300 + j * 120, 156)
    b += text(20, 280, "Written C sounds E♭. To find your written note, go UP a major sixth", 16, 600)
    b += text(20, 304, "from the concert note (or down a minor third).", 16, 600)
    D["sax/alto-transposition.svg"] = svg(314, "Alto saxophone transposition",
        "Concert E-flat is written C for alto saxophone; concert B-flat is written G; concert A is written F sharp. The written note is a major sixth above the concert note.", b)

    # breathing (sax w3)
    def breath_fig():
        b = title("Breathing low: the diaphragm drops, the belly moves out")
        for i, (lab, inh) in enumerate([("Breathing in", True), ("Breathing out", False)]):
            cx = 170 + i * 300
            b += f'<path d="M{cx - 70} 100 C{cx - 90} 160 {cx - 90} 300 {cx - 60} 330 L{cx + 60} 330 C{cx + 90} 300 {cx + 90} 160 {cx + 70} 100 Z" fill="#ffffff" stroke="{INK}" stroke-width="2.5"/>'
            lung = 62 if inh else 46
            dy = 228 if inh else 200
            b += f'<ellipse cx="{cx - 30}" cy="{dy - 60}" rx="26" ry="{lung}" fill="#fcd9cf" stroke="{INK}" stroke-width="1.5"/>'
            b += f'<ellipse cx="{cx + 30}" cy="{dy - 60}" rx="26" ry="{lung}" fill="#fcd9cf" stroke="{INK}" stroke-width="1.5"/>'
            b += f'<path d="M{cx - 75} {dy + 10} Q{cx} {dy - (10 if inh else 50)} {cx + 75} {dy + 10}" fill="none" stroke="{BLUE}" stroke-width="5"/>'
            if inh:
                b += arrow(cx, dy - 30, cx, dy + 10, BLUE) + arrow(cx + 92, 280, cx + 118, 280, CORAL_INK) + arrow(cx - 92, 280, cx - 118, 280, CORAL_INK)
            else:
                b += arrow(cx, dy - 10, cx, dy - 46, BLUE) + arrow(cx + 118, 280, cx + 96, 280, CORAL_INK) + arrow(cx - 118, 280, cx - 96, 280, CORAL_INK)
            b += text(cx, 362, lab, 18, 800, INK, "middle")
        b += text(20, 398, "Blue: the diaphragm. In, it flattens down and the belly and lower ribs move out;", 16, 600)
        b += text(20, 422, "the shoulders stay still. Out, the muscles push the air out steadily.", 16, 600)
        return b
    D["common/breathing.svg"] = svg(432, "Breathing with the diaphragm",
        "Two torso outlines. Breathing in: the lungs fill, the dome-shaped diaphragm flattens downwards and the belly and lower ribs move outwards, shoulders still. Breathing out: the diaphragm rises and the belly comes in as the air is pushed out steadily.", breath_fig())

    # ═══ VOCAL ═══
    b = title("Your voice: power, vibrator, resonators")
    # side-ish head and torso
    b += f'<path d="M170 70 C110 70 100 130 112 160 C118 176 130 188 150 194 L150 230 L120 240 C80 250 70 300 70 400 L270 400 C270 300 260 250 220 240 L190 230 L190 200 C226 196 236 160 230 120 C224 86 204 70 170 70 Z" fill="#ffffff" stroke="{INK}" stroke-width="2.5"/>'
    b += f'<ellipse cx="170" cy="140" rx="34" ry="22" fill="{GOLD_SOFT}" stroke="{INK}" stroke-width="1.5"/>'    # resonators: mouth & nose
    b += circle(170, 214, 10, TEAL, INK, 1.5)                                                                    # larynx
    b += f'<ellipse cx="135" cy="320" rx="30" ry="56" fill="#fcd9cf" stroke="{INK}" stroke-width="1.5"/><ellipse cx="205" cy="320" rx="30" ry="56" fill="#fcd9cf" stroke="{INK}" stroke-width="1.5"/>'
    b += f'<path d="M95 386 Q170 350 245 386" fill="none" stroke="{BLUE}" stroke-width="5"/>'
    rows = [(140, "3. Resonators", "throat, mouth, nose: amplify and colour", 204), (214, "2. Vibrator", "vocal folds in the larynx", 180),
            (330, "1. Power: breath", "lungs, driven by the diaphragm (blue)", 236)]
    for y, h, s, px in rows:
        b += line(px, y, 300, y, MUTE, 1.2) + text(310, y, h, 18, 800) + text(310, y + 24, s, 16, 600, INK2)
    b += text(20, 440, "Stand: feet hip-width, knees soft, head level, shoulders down.", 16, 600)
    D["vocal/voice-system.svg"] = svg(450, "How the voice works",
        "A figure from head to chest with three labelled parts: the power source, breath from the lungs controlled by the diaphragm; the vibrator, the vocal folds in the larynx; and the resonators, the throat, mouth and nose.", b)

    b = title("Chest, mix and head — and the passaggio between")
    b += f'<defs><linearGradient id="vg" x1="0" x2="1"><stop offset="0" stop-color="#fcd9cf"/><stop offset="1" stop-color="{TEAL_SOFT}"/></linearGradient></defs>'
    b += rect(40, 80, 560, 70, "url(#vg)", INK, 10, 1.4)
    b += rect(300, 80, 110, 70, GOLD, INK, 0, 1.4)
    b += text(150, 122, "chest voice", 18, 800, INK, "middle") + text(355, 122, "passaggio", 16, 800, INK, "middle") + text(510, 122, "head voice", 18, 800, INK, "middle")
    b += arrow(40, 180, 600, 180) + text(40, 206, "lower notes", 16, 700, INK2) + text(600, 206, "higher notes", 16, 700, INK2, "end")
    b += text(355, 64, "mix carries power across here", 16, 800, INK, "middle")
    b += text(20, 250, "Cross gently: sirens on \"ng\" or \"oo\", light volume, narrow vowels, relaxed jaw.", 16, 600)
    b += text(20, 274, "The exact notes differ from voice to voice; find yours with a keyboard.", 16, 600)
    D["vocal/registers.svg"] = svg(284, "Vocal registers and the passaggio",
        "A band from low to high notes: chest voice at the bottom, head voice at the top, and the passaggio — where the voice changes gear — between them, where the mixed voice carries power across.", b)

    b = title("Typical choir ranges (SATB)")
    k, kw, pos = keyboard(20, 280, "C2", "C6", {}, 600 / 29, 70, names=False)
    b += k
    for c in ["C2", "C3", "C4", "C5", "C6"]:
        b += text(pos[midi(c)], 372, pretty(c, True), 16, 700, INK2, "middle")
    for i, (nm, lo, hi, fill) in enumerate([("Soprano", "C4", "A5", "#e6defa"), ("Alto", "F3", "D5", GOLD_SOFT),
                                             ("Tenor", "C3", "A4", TEAL_SOFT), ("Bass", "E2", "E4", "#fcd9cf")]):
        y = 70 + i * 48
        x0, x1 = pos[midi(lo)], pos[midi(hi)]
        b += rect(x0, y, x1 - x0, 36, fill, INK, 6, 1.2) + text(x0 + 8, y + 24, f"{nm}  {pretty(lo, True)}–{pretty(hi, True)}", 16, 800)
    D["vocal/satb-ranges.svg"] = svg(382, "Typical SATB ranges",
        "A keyboard from C2 to C6 with typical choir ranges above it: soprano C4 to A5, alto F3 to D5, tenor C3 to A4, bass E2 to E4.", b)

    b = title("Working the microphone")
    for i, (lab, d, sub) in enumerate([("Normal singing", 60, "a hand's width, 5–10 cm"), ("Soft, close", 28, "come in: you are heard"), ("Loud or high", 110, "back off: no distortion")]):
        y = 80 + i * 80
        b += circle(80, y + 20, 22, "#ffffff", INK, 2.5) + f'<path d="M100 {y + 22} l10 2 l-10 6" fill="none" stroke="{INK}" stroke-width="2"/>'
        mx = 112 + d
        b += rect(mx, y + 10, 26, 22, INK2, INK, 10) + rect(mx + 26, y + 16, 80, 10, INK, INK, 3)
        b += f'<path d="M112 {y + 46} L{mx} {y + 46}" stroke="{GOLD}" stroke-width="3"/>'
        b += text(370, y + 18, lab, 17, 800) + text(370, y + 42, sub, 16, 600, INK2)
    b += text(20, 336, "Hold the body, never the grille. Point it at your mouth, never at a speaker.", 16, 600)
    D["vocal/mic-distance.svg"] = svg(346, "Microphone distance",
        "A singer's head and a microphone at three distances: about a hand's width (5 to 10 cm) for normal singing, closer for soft passages, further back for loud or high notes.", b)

    # ═══ MUSIC PRODUCTION ═══
    b = title("Inside every DAW")
    b += rect(20, 60, 600, 36, SOFT, LINE, 6) + text(36, 84, "▶ play   ■ stop   ● record   ⟲ loop", 16, 700) + text(600, 84, "transport", 16, 800, INK2, "end")
    for k in range(4):
        b += text(196 + k * 106, 118, f"bar {k + 1}", 16, 700, INK2)
        b += line(190 + k * 106, 104, 190 + k * 106, 300, LINE, 1.2)
    tracks = [("Kick", [(0, 4)], GOLD), ("Snare", [(0, 4)], GOLD), ("Keys (MIDI)", [(1, 3)], TEAL_SOFT), ("Lead vox (audio)", [(2, 4)], "#fcd9cf")]
    for i, (nm, clips, fill) in enumerate(tracks):
        y = 130 + i * 42
        b += rect(20, y, 165, 36, SOFT, LINE, 4) + text(30, y + 24, nm, 16, 700)
        for a, c in clips:
            b += rect(190 + a * 106 + 2, y + 2, (c - a) * 106 - 4, 32, fill, INK, 4, 1)
    b += arrow(190, 318, 610, 318) + text(400, 342, "time flows left to right, in bars and beats", 16, 700, INK2, "middle")
    b += text(20, 372, "Tracks stack top to bottom; the mixer sets volume, pan and effects.", 16, 600)
    D["production/daw-anatomy.svg"] = svg(382, "The parts of a DAW",
        "A DAW window: the transport (play, stop, record, loop) at the top; tracks named Kick, Snare, Keys (MIDI) and Lead vox (audio) stacked vertically; clips laid on a timeline divided into bars, with time flowing left to right.", b)

    def steps(ttl, rows, foot, fname, desc, vel=None):
        b = title(ttl)
        cw = 30
        x0 = 140
        for i in range(16):
            cx = x0 + i * cw
            b += text(cx + cw / 2, 80, str(i + 1), 16 if i < 9 else 14.5, 700 if i % 4 == 0 else 500, INK if i % 4 == 0 else MUTE, "middle") if False else ""
        for i, c in enumerate(["1", "2", "3", "4"]):
            b += text(x0 + i * 4 * cw + 2, 80, f"beat {c}", 16, 800, INK)
        for r, (nm, on) in enumerate(rows):
            y = 94 + r * 44
            b += text(20, y + 26, nm, 16, 800)
            for i in range(16):
                fill = (GOLD if i in on else ("#ffffff" if (i // 4) % 2 == 0 else SOFT))
                b += rect(x0 + i * cw + 2, y + 4, cw - 4, 32, fill, INK if i in on else LINE, 4, 1.2)
        y = 94 + len(rows) * 44
        if vel:
            b += text(20, y + 50, "Velocity", 16, 800)
            for i, v in enumerate(vel):
                h = v / 127 * 70
                b += rect(x0 + i * cw + 6, y + 80 - h, cw - 12, h, TEAL, INK, 2, 1)
            y += 96
        for i, ln in enumerate(foot):
            b += text(20, y + 30 + i * 24, ln, 16, 600)
        D[fname] = svg(y + 30 + 24 * len(foot) - 14, ttl, desc, b)
    steps("A step sequencer: 16 steps, one bar of 4/4", [("Kick", {0, 8}), ("Snare", {4, 12})],
          ["Four steps to a beat. Kick on beats 1 and 3, snare on 2 and 4."],
          "production/step-backbeat.svg",
          "A 16-step grid for one bar of 4/4, four steps per beat. Kick on steps 1 and 9 (beats 1 and 3); snare on steps 5 and 13 (beats 2 and 4).")
    steps("Hi-hats with velocity", [("Hi-hat", set(range(0, 16, 2))), ("Snare", {4, 12}), ("Kick", {0, 8})],
          ["Same eighth-note hi-hats; louder on the beat, softer between, never all equal."],
          "production/velocity.svg",
          "Eighth-note hi-hats on every other step with velocity bars below: higher on the beats, lower on the off-beats, each slightly different. Snare on beats 2 and 4, kick on 1 and 3.",
          vel=[112, 0, 70, 0, 104, 0, 64, 0, 116, 0, 74, 0, 100, 0, 60, 0])

    b = title("Am – F – C – G in the piano roll")
    notes_all = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5"]
    chords = [("Am", ["A4", "C5", "E4"]), ("F", ["F4", "A4", "C5"]), ("C", ["C4", "E4", "G4"]), ("G", ["G4", "B4", "D5"])]
    rh = 26
    for i, n in enumerate(reversed(notes_all)):
        y = 80 + i * rh
        b += rect(20, y, 70, rh, "#ffffff", LINE, 0) + text(55, y + 19, pretty(n), 16, 700, INK, "middle")
        b += rect(90, y, 530, rh, SOFT if i % 2 else "#ffffff", LINE, 0, 0.8)
    for j, (nm, ns) in enumerate(chords):
        x = 92 + j * 132
        b += text(x + 64, 70, nm, 18, 800, INK, "middle")
        for n in ns:
            i = list(reversed(notes_all)).index(n)
            b += rect(x + 2, 80 + i * rh + 3, 124, rh - 6, GOLD, INK, 4, 1)
    y = 80 + len(notes_all) * rh
    b += text(20, y + 30, "One bar each: Am = A C E, F = F A C, C = C E G, G = G B D.", 16, 600)
    D["production/piano-roll-chords.svg"] = svg(y + 40, "Am F C G in a piano roll",
        "A piano roll from C4 to D5 with four one-bar chords: A minor (A, C, E), F (F, A, C), C (C, E, G) and G (G, B, D).", b)

    b = title("Gain staging: aim for peaks at −12 to −6 dBFS")
    X = lambda db: 20 + (db + 48) * 540 / 48
    scale = [(d, X(d)) for d in (-48, -36, -24, -12, -6, 0)]
    b += rect(20, 90, 540, 40, SOFT, INK, 4, 1.2)
    b += rect(X(-12), 90, X(-6) - X(-12), 40, "#bfe5c6", INK, 0, 1.2) + rect(X(0) - 8, 90, 8, 40, CORAL, INK, 0, 1.2)
    for db, x in scale:
        b += line(x, 130, x, 140, INK, 1.5) + text(x, 160, f"{db}", 16, 700, INK, "middle")
    b += text((X(-12) + X(-6)) / 2, 80, "target", 16, 800, GREEN, "middle") + text(560, 80, "clip", 16, 800, CORAL_INK, "middle")
    b += text(20, 200, "0 dBFS is the ceiling: anything that hits it clips into distortion that cannot be", 16, 600)
    b += text(20, 224, "removed. Set the gain while the singer performs their LOUDEST part.", 16, 600)
    b += text(20, 248, "Too quiet can be turned up later; clipped is ruined.", 16, 700)
    D["production/gain-meter.svg"] = svg(258, "Recording level meter",
        "A level meter in dBFS from −48 to 0. The target zone for peaks is −12 to −6 dBFS; 0 dBFS is the ceiling where the signal clips.", b)

    b = title("Contrast by subtraction: what plays in each section")
    secs = ["Intro", "Verse", "Chorus", "Verse", "Chorus", "Bridge", "Chorus"]
    parts = [("Drums", [0, 1, 1, 1, 1, 0, 1]), ("Bass", [0, 0, 1, 1, 1, 1, 1]), ("Keys", [1, 1, 1, 1, 1, 1, 1]),
             ("Vocal", [0, 1, 1, 1, 1, 1, 1]), ("Extras", [0, 0, 1, 0, 1, 0, 1])]
    cw = 70
    for j, s_ in enumerate(secs):
        b += text(130 + j * cw + cw / 2, 80, s_, 16, 800 if s_ == "Chorus" else 600, INK, "middle")
    for i, (p, on) in enumerate(parts):
        y = 92 + i * 36
        b += text(20, y + 22, p, 16, 800)
        for j, v in enumerate(on):
            b += rect(130 + j * cw + 3, y + 3, cw - 6, 28, (GOLD if secs[j] == "Chorus" else TEAL_SOFT) if v else "#ffffff", INK if v else LINE, 4, 1)
    b += text(20, 300, "An example plan: the verses leave parts out, so the chorus hits when", 16, 600)
    b += text(20, 324, "everything comes in.", 16, 600)
    D["production/arrangement-layers.svg"] = svg(334, "Arrangement by subtraction",
        "A grid of sections (Intro, Verse, Chorus, Verse, Chorus, Bridge, Chorus) against parts (Drums, Bass, Keys, Vocal, Extras). Verses leave out bass or extras; every part plays in the choruses.", b)

    b = title("Pan: where each part sits from left to right")
    b += rect(20, 100, 600, 140, SOFT, LINE, 10) + line(320, 92, 320, 248, INK2, 2, "5 5")
    b += text(30, 88, "L", 18, 900) + text(610, 88, "R", 18, 900, INK, "end") + text(320, 80, "centre", 16, 800, INK, "middle")
    for nm, x, y in [("Lead vocal", 320, 128), ("Kick", 320, 160), ("Snare", 320, 192), ("Bass", 320, 224),
                     ("Hi-hat", 430, 140), ("Shekere", 160, 140), ("Guitar", 520, 180), ("Keys", 120, 180), ("BVs", 90, 220), ("BVs", 550, 220)]:
        b += pill(x, y + 6, nm, GOLD if x == 320 else TEAL_SOFT, INK, 16, 6)
    b += text(20, 280, "Centre: kick, snare, bass, lead vocal. Spread the rest, balancing", 16, 600)
    b += text(20, 304, "left against right. Check that the mix still works in mono.", 16, 600)
    D["production/pan-field.svg"] = svg(314, "Panning in the stereo field",
        "A stereo field from left to right. Lead vocal, kick, snare and bass in the centre; hi-hat slightly right, shekere left, keys left and guitar right, backing vocals spread wide on both sides.", b)

    b = title("EQ: the frequency spectrum, low to high")
    bands = [("Lows 20–250 Hz", 20, 200, "#fcd9cf", "kick, bass: weight"), ("Mids 250 Hz–4 kHz", 200, 450, GOLD_SOFT, "instruments, the voice"),
             ("Highs 4–20 kHz", 450, 620, TEAL_SOFT, "air, cymbals, \"s\"")]
    for nm, a, c, fill, sub in bands:
        b += rect(a, 70, c - a, 80, fill, INK, 0, 1.2) + text((a + c) / 2, 104, nm, 16, 800, INK, "middle") + text((a + c) / 2, 130, sub, 16, 600, INK2, "middle")
    b += f'<path d="M20 260 C90 260 120 190 170 190 L620 190" fill="none" stroke="{BLUE}" stroke-width="4"/>'
    b += line(20, 190, 620, 190, LINE, 1, "4 4")
    b += text(240, 236, "high-pass filter: cuts the low rumble", 16, 800, BLUE)
    b += text(20, 300, "Cut before you boost; small moves (2–4 dB) usually beat big ones.", 16, 600)
    D["production/eq-spectrum.svg"] = svg(310, "The EQ frequency spectrum and a high-pass filter",
        "The audible spectrum in three bands: lows 20 to 250 Hz (kick, bass), mids 250 Hz to 4 kHz (instruments and voice), highs 4 to 20 kHz (air, cymbals, sibilance). A high-pass filter curve rolls off the low end.", b)

    b = title("Compression: turning down what goes over the threshold")
    ox, oy, sz = 80, 330, 250
    b += line(ox, oy, ox + sz, oy, INK, 2) + line(ox, oy, ox, oy - sz, INK, 2)
    b += text(ox + sz / 2, oy + 30, "level in", 16, 700, INK2, "middle") + f'<text x="{ox - 16}" y="{oy - sz / 2}" font-size="16" font-weight="700" fill="{INK2}" text-anchor="middle" transform="rotate(-90 {ox - 16} {oy - sz / 2})">level out</text>'
    th = 150
    b += line(ox, oy, ox + sz, oy - sz, LINE, 1.5, "5 5")
    b += f'<path d="M{ox} {oy} L{ox + th} {oy - th} L{ox + sz} {oy - th - (sz - th) / 4}" fill="none" stroke="{BLUE}" stroke-width="4"/>'
    b += circle(ox + th, oy - th, 6, CORAL_INK)
    b += text(ox + th - 10, oy - th - 14, "threshold", 16, 800, CORAL_INK, "end")
    b += text(ox + sz - 4, oy - sz + 14, "no compression", 16, 600, MUTE, "end")
    b += text(ox + sz + 4, oy - th - (sz - th) / 4 + 6, "4:1", 18, 900, BLUE)
    b += text(380, 120, "Below the threshold: unchanged.", 16, 600) + text(380, 150, "Above it, at 4:1: every 4 dB", 16, 600)
    b += text(380, 174, "over comes out as 1 dB over.", 16, 600) + text(380, 214, "Aim for 3–6 dB of gain", 16, 600) + text(380, 238, "reduction on vocal peaks.", 16, 600)
    D["production/compression.svg"] = svg(370, "How a compressor works",
        "A graph of output level against input level. Below the threshold the line rises one-to-one; above it, at a 4:1 ratio, every 4 dB of extra input gives only 1 dB more output.", b)

    return D
