"""Guitar diagrams: fretboards (high E on top, as in tab), chord boxes (low E on the left) and tab.
Every fretted note's name is computed from its string and fret by fret_note(), and every chord box is checked
against the notes the chord should contain (see CHORDS and check_chords) before anything is written."""
from music_draw import *  # noqa: F401,F403

# name: (frets low→high, fingers, expected pitch classes)
CHORDS = {
    "F (easy)": ([-1, -1, 3, 2, 1, 1], [0, 0, 3, 2, 1, 1], {"F", "A", "C"}),
    "F (barre)": ([1, 3, 3, 2, 1, 1], [1, 3, 4, 2, 1, 1], {"F", "A", "C"}),
    "D": ([-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2], {"D", "F#", "A"}),
    "Dsus4": ([-1, -1, 0, 2, 3, 3], [0, 0, 0, 1, 3, 4], {"D", "G", "A"}),
    "Dsus2": ([-1, -1, 0, 2, 3, 0], [0, 0, 0, 1, 3, 0], {"D", "E", "A"}),
    "Cmaj7": ([-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0], {"C", "E", "G", "B"}),
    "Am7": ([-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0], {"A", "C", "E", "G"}),
    "Em7": ([0, 2, 2, 0, 3, 0], [0, 1, 2, 0, 4, 0], {"E", "G", "B", "D"}),
    "G7": ([3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1], {"G", "B", "D", "F"}),
    "D7": ([-1, -1, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3], {"D", "F#", "A", "C"}),
    "E7": ([0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0], {"E", "G#", "B", "D"}),
    "Bm7♭5": ([-1, 2, 3, 2, 3, -1], [0, 1, 3, 2, 4, 0], {"B", "D", "F", "A"}),
    "Dm9": ([-1, 5, 3, 5, 5, -1], [0, 2, 1, 3, 4, 0], {"D", "F", "C", "E"}),
    "G13": ([3, -1, 3, 4, 5, -1], [1, 0, 2, 3, 4, 0], {"G", "F", "B", "E"}),
    "Cmaj9": ([-1, 3, 2, 4, 3, -1], [0, 2, 1, 4, 3, 0], {"C", "E", "B", "D"}),
}


def check_chords():
    for name, (frets, _, want) in CHORDS.items():
        got = set(chord_notes(frets))
        norm = {"Eb": "D#", "Ab": "G#", "Bb": "A#"}
        got = {norm.get(n, n) for n in got}
        want = {norm.get(n, n) for n in want}
        assert got == want, f"chord {name}: shape gives {sorted(got)}, expected {sorted(want)}"


def boxes(items, y, cw=22, gap=None, sub=None):
    """A row of chord boxes, centred. items: list of (label, chord key, base fret, highlight set, sub)."""
    n = len(items)
    bw = cw * 5
    gap = gap if gap is not None else min(90, (600 - n * bw) / max(1, n - 1))
    total = n * bw + (n - 1) * gap
    x = (W - total) / 2
    out = []
    for i, it in enumerate(items):
        label, key, base = it[0], it[1], it[2]
        hi = it[3] if len(it) > 3 else None
        sb = it[4] if len(it) > 4 else None
        frets, fingers, _ = CHORDS[key]
        barre = None
        if key == "F (barre)":
            barre = (1, 0, 5)
        out.append(chord_box(x + i * (bw + gap), y, label, frets, fingers, base=base, barre=barre, cw=cw, hi=hi, sub=sb))
    return "".join(out)


def figs():
    check_chords()
    D = {}

    # ── Y1 w1: C major and A minor in open position ──
    b = title("C major and A minor in open position")
    cmaj = [(5, 3, "C"), (4, 0, "D"), (4, 2, "E"), (4, 3, "F"), (3, 0, "G"), (3, 2, "A"), (2, 0, "B"), (2, 1, "C")]
    amin = [(5, 0, "A"), (5, 2, "B"), (5, 3, "C"), (4, 0, "D"), (4, 2, "E"), (4, 3, "F"), (3, 0, "G"), (3, 2, "A")]
    for (s, f, l) in cmaj + amin:
        assert fret_note(s, f) == l, (s, f, l)
    b += text(20, 70, "C major: C D E F G A B C", 17, 800)
    b += fretboard(20, 90, 0, 4, [(s, f, l, GOLD if l == "C" else GOLD_SOFT) for s, f, l in cmaj], width=600)
    b += text(20, 290, "A natural minor: the same notes from A", 17, 800)
    b += fretboard(20, 310, 0, 4, [(s, f, l, TEAL if l == "A" else TEAL_SOFT) for s, f, l in amin], width=600)
    b += text(20, 500, "A dot left of the nut = open string. Darker dots are the home note.", 16, 600)
    D["guitar/c-major-a-minor-open.svg"] = svg(510, "C major and A minor scales in open position",
        "Two fretboards, high E on top. C major: C on the A string fret 3, D open D string, E D-string fret 2, F D-string fret 3, G open G string, A G-string fret 2, B open B string, C B-string fret 1. A natural minor: A open A string, B fret 2, C fret 3, D open D, E fret 2, F fret 3, G open G, A G-string fret 2.", b)

    # ── w3: easy F, and the strum ──
    b = title("The easy F: four strings, a mini-barre")
    frets, fingers, _ = CHORDS["F (easy)"]
    b += chord_box(80, 110, "F", frets, fingers, cw=26, fh=32)
    b += f'<rect x="{80 + 4 * 26 - 9}" y="{110 + 16 - 9}" width="{26 + 18}" height="18" rx="9" fill="{INK}"/>'
    b += text(80 + 4 * 26 + 13, 110 + 16 + 6, "1", 16, 800, "#ffffff", "middle")
    b += text(300, 120, "Index (1) flat across B and high E, fret 1", 16, 600)
    b += text(300, 150, "Middle (2) on G, fret 2", 16, 600)
    b += text(300, 180, "Ring (3) on D, fret 3", 16, 600)
    b += text(300, 210, "Strum the top four strings only", 16, 700)
    b += text(300, 240, "Notes: F A C F", 16, 600, INK2)
    D["guitar/easy-f.svg"] = svg(290, "Easy F chord",
        "Chord box for the easy F: low E and A strings not played; ring finger D string fret 3, middle finger G string fret 2, index finger across B and high E at fret 1. Notes F, A, C, F.", b)

    def strum(heading, pattern, note, extra=None):
        b = title(heading)
        counts = ["1", "&", "2", "&", "3", "&", "4", "&"]
        cw = 70
        x0 = 40
        for i, c in enumerate(counts):
            cx = x0 + i * cw + cw / 2
            beat = c.isdigit()
            b += rect(x0 + i * cw + 2, 60, cw - 4, 160, GOLD_SOFT if beat else SOFT, "none", 6)
            b += text(cx, 90, c, 20 if beat else 18, 800 if beat else 600, INK, "middle")
            hit = pattern[i]
            b += strum_arrow(cx, 140, down=(i % 2 == 0), hit=hit, size=56)
            b += text(cx, 200, ("D" if i % 2 == 0 else "U") if hit else "miss", 16 if hit else 16, 800 if hit else 600, INK if hit else MUTE, "middle")
        b += text(40, 256, note, 16, 600)
        if extra:
            b += text(40, 280, extra, 16, 600)
        return b
    pat = [True, False, True, True, False, True, True, True]
    D["guitar/strum-d-du-udu.svg"] = svg(296, "Strum pattern D - DU - UDU",
        "Eight counts, 1 and 2 and 3 and 4 and. The hand moves down on every number and up on every 'and'. It hits: down on 1, down on 2, up on 'and', misses the down on 3, then up on 'and', down on 4, up on 'and'.",
        strum("D – DU – UDU: the hand never stops", pat, "Down on the numbers, up on the \"and\"s. On beat 3 the down-strum",
              "misses the strings, so the hand stays in time."))
    D["guitar/strum-pendulum.svg"] = svg(296, "The strumming pendulum",
        "Eight counts. The strumming hand swings down on every beat and up on every 'and' all the time; for D-DU-UDU it misses the strings on the down-strum of beat 3 and hits every other stroke.",
        strum("The pendulum: keep moving, miss on purpose", pat, "D – DU – UDU. Dashed arrows are strokes in the air: the hand",
              "still moves. Accent beats 2 and 4 for a backbeat."))

    # ── w4: G major and E minor ──
    b = title("G major and E minor in open position")
    gmaj = [(6, 3, "G"), (5, 0, "A"), (5, 2, "B"), (5, 3, "C"), (4, 0, "D"), (4, 2, "E"), (4, 4, "F♯"), (3, 0, "G")]
    emin = [(6, 0, "E"), (6, 2, "F♯"), (6, 3, "G"), (5, 0, "A"), (5, 2, "B"), (5, 3, "C"), (4, 0, "D"), (4, 2, "E")]
    for (s, f, l) in gmaj + emin:
        assert fret_note(s, f) == l, (s, f, l)
    b += text(20, 70, "G major: G A B C D E F♯ G", 17, 800)
    b += fretboard(20, 90, 0, 4, [(s, f, l, GOLD if l == "G" else (CORAL if l == "F♯" else GOLD_SOFT)) for s, f, l in gmaj], width=600)
    b += text(20, 290, "E minor: the same seven notes from E", 17, 800)
    b += fretboard(20, 310, 0, 4, [(s, f, l, TEAL if l == "E" else (CORAL if l == "F♯" else TEAL_SOFT)) for s, f, l in emin], width=600)
    b += text(20, 500, "F♯ (coral) is the one sharp in the key.", 16, 600)
    D["guitar/g-major-e-minor-open.svg"] = svg(510, "G major and E minor scales in open position",
        "G major: G low E fret 3, A open A string, B A-string fret 2, C fret 3, D open D, E D-string fret 2, F sharp D-string fret 4, G open G. E minor: E open low E, F sharp fret 2, G fret 3, A open A, B fret 2, C fret 3, D open D, E D-string fret 2.", b)

    # ── w6: A minor pentatonic box 1 ──
    b = title("A minor pentatonic, shape 1 at the 5th fret")
    pent = [(6, 5), (6, 8), (5, 5), (5, 7), (4, 5), (4, 7), (3, 5), (3, 7), (2, 5), (2, 8), (1, 5), (1, 8)]
    mk = []
    for s, f in pent:
        n = fret_note(s, f)
        assert n in ("A", "C", "D", "E", "G"), (s, f, n)
        mk.append((s, f, n, GOLD if n == "A" else GOLD_SOFT))
    b += fretboard(20, 80, 4, 9, mk, width=600)
    b += text(20, 270, "Finger 1 on fret 5, finger 3 on fret 7, finger 4 on fret 8.", 16, 600)
    b += text(20, 294, "Gold = A, the root: low E fret 5, D string fret 7, high E fret 5.", 16, 600)
    D["guitar/a-minor-pentatonic.svg"] = svg(304, "A minor pentatonic shape 1",
        "Fretboard frets 4 to 9, high E on top. Notes: low E string frets 5 (A) and 8 (C); A string 5 (D) and 7 (E); D string 5 (G) and 7 (A); G string 5 (C) and 7 (D); B string 5 (E) and 8 (G); high E 5 (A) and 8 (C). Roots A on low E fret 5, D string fret 7, high E fret 5.", b)

    # ── w7: lead-sheet road map ──
    b = title("Reading the road map of a lead sheet")
    y = 90
    bars = [("G", 20), ("C", 160), ("D", 300), ("G", 440)]
    for nm, x in bars:
        b += rect(x, y, 130, 60, SOFT, INK, 4, 1.2) + text(x + 65, y + 38, nm, 20, 800, INK, "middle")
    b += line(30, y, 30, y + 60, INK, 4) + circle(40, y + 22, 3.5) + circle(40, y + 38, 3.5)          # start repeat
    b += line(438, y, 438, y + 60, INK, 4) + circle(428, y + 22, 3.5) + circle(428, y + 38, 3.5)      # end repeat before bar 4
    b += f'<path d="M300 {y - 6} L300 {y - 24} L430 {y - 24}" fill="none" stroke="{INK}" stroke-width="2"/>' + text(310, y - 30, "1.", 18, 800)
    b += f'<path d="M440 {y - 6} L440 {y - 24} L570 {y - 24}" fill="none" stroke="{INK}" stroke-width="2"/>' + text(450, y - 30, "2.", 18, 800)
    order = ["G", "C", "D (1st ending)", "↺ back", "G", "C", "G (2nd ending)"]
    b += text(20, y + 100, "Play:", 17, 800)
    xx = 80
    for o in order:
        b += pill(xx, y + 104, o, GOLD_SOFT if "↺" not in o else TEAL_SOFT, INK, 16, 8, "start")
        xx += max(26, len(o) * 16 * 0.58 + 16) + 8
    b += text(20, y + 160, "‖: :‖ repeat signs · D.C. back to the start · D.S. back to the sign", 16, 600)
    b += text(20, y + 184, "Coda: jump to the ending · G/B: G chord, B in the bass (A string fret 2)", 16, 600)
    D["guitar/lead-sheet-roadmap.svg"] = svg(y + 194, "Repeat signs and first and second endings",
        "Four bars G, C, D, G between repeat signs with a first ending over bar 3 and a second ending over bar 4. The order played is G, C, D (first ending), back to the start, G, C, then the second-ending G.", b)

    # ── w8: three forms of A minor on the guitar ──
    b = title("A minor three ways — change one or two notes")
    base = [(5, 0, "A"), (5, 2, "B"), (5, 3, "C"), (4, 0, "D"), (4, 2, "E"), (4, 3, "F"), (3, 0, "G"), (3, 2, "A")]
    forms = [("Natural", base, set()),
             ("Harmonic", [(3, 1, "G♯") if l == "G" else (s, f, l) for s, f, l in base], {"G♯"}),
             ("Melodic, going up", [(3, 1, "G♯") if l == "G" else ((4, 4, "F♯") if l == "F" else (s, f, l)) for s, f, l in base], {"G♯", "F♯"})]
    y = 70
    for name, notes, ch in forms:
        for s, f, l in notes:
            assert fret_note(s, f) == l, (s, f, l)
        b += text(20, y, name, 17, 800)
        b += fretboard(20, y + 18, 0, 4, [(s, f, l, CORAL if l in ch else TEAL_SOFT) for s, f, l in notes], width=600, sh=22, fret_nums=False)
        y += 170
    b += text(20, y - 14, "Harmonic: G → G♯ (G string, fret 1). Melodic up: also F → F♯ (D string, fret 4).", 16, 600)
    D["guitar/a-minor-three-forms.svg"] = svg(y, "Natural, harmonic and melodic A minor on the guitar",
        "Three open-position fretboards. Natural A minor: A B C D E F G A. Harmonic: G is raised to G sharp on the G string fret 1. Melodic going up: also F raised to F sharp on the D string fret 4.", b)

    # ── w13: E-shape barre ──
    b = title("The E-shape barre: one shape, every major chord")
    frets, fingers, _ = CHORDS["F (barre)"]
    b += chord_box(70, 110, "F (barre at fret 1)", frets, fingers, barre=(1, 0, 5), cw=26, fh=32)
    rows = [("fret 1", "F"), ("fret 3", "G"), ("fret 5", "A"), ("fret 6", "B♭"), ("fret 8", "C")]
    for i, (fr, nm) in enumerate(rows):
        n = int(fr.split()[1])
        assert fret_note(6, n, sharps=False) == nm, (fr, nm)
        y = 100 + i * 40
        b += rect(330, y, 270, 32, GOLD_SOFT if nm == "B♭" or nm == "F" else SOFT, LINE, 6) + text(346, y + 23, f"barre at {fr}", 16, 600) + text(584, y + 23, nm, 18, 800, INK, "end")
    b += text(330, 320, "Named after the low-E note", 16, 600)
    b += text(330, 344, "under the index finger. Lift the", 16, 600) + text(330, 368, "middle finger for the minor.", 16, 600)
    D["guitar/barre-e-shape.svg"] = svg(378, "E-shape barre chord",
        "Chord box for F as an E-shape barre at fret 1: index across all six strings, middle finger G string fret 2, ring finger A string fret 3, little finger D string fret 3. The same shape at fret 3 is G, fret 5 A, fret 6 B-flat, fret 8 C.", b)

    # ── w14: p-i-m-a-m-i ──
    b = title("p – i – m – a – m – i over a C chord")
    ev = [(80, 5, "3"), (160, 3, "0"), (240, 2, "1"), (320, 1, "0"), (400, 2, "1"), (480, 3, "0")]
    b += tab(40, 80, 560, ev)
    for (dx, s, t), f in zip(ev, "pimami"):
        b += circle(40 + dx, 222, 15, GOLD, INK, 1.2) + text(40 + dx, 228, f, 18, 800, INK, "middle")
        b += text(40 + dx, 260, fret_note(s, int(t)), 16, 700, INK2, "middle")
    b += text(20, 296, "p thumb on the A string (C); i on G, m on B, a on high E — six even notes.", 16, 600)
    D["guitar/pima-pattern.svg"] = svg(306, "Finger-picking pattern p-i-m-a-m-i on C",
        "Tab of six notes over a C chord: A string fret 3 with the thumb (p), open G with the index (i), B string fret 1 with the middle (m), open high E with the ring finger (a), then B fret 1 (m) and open G (i). Notes C, G, C, E, C, G.", b)

    # ── w15: double stops for Afrobeats ──
    b = title("Two-note shapes for Afrobeats riffs (B and high E strings)")
    shapes = [("G", 0, 3), ("D", 3, 2), ("Em", 0, 0), ("C", 1, 0)]
    for i, (nm, bf, ef) in enumerate(shapes):
        x = 30 + i * 150
        b += text(x + 50, 80, nm, 20, 800, INK, "middle")
        # two strings, frets 0-4
        for s in range(2):
            b += line(x + 30 + s * 40, 100, x + 30 + s * 40, 220, INK, 1.6)
        for r in range(5):
            b += line(x + 30, 100 + r * 30, x + 70, 100 + r * 30, INK, 5 if r == 0 else 1.4)
        for s, fr in enumerate((bf, ef)):
            cx = x + 30 + s * 40
            if fr == 0:
                b += circle(cx, 86, 7, "#ffffff", INK, 1.8)
            else:
                b += circle(cx, 100 + fr * 30 - 15, 11, GOLD, INK, 1.2)
        n1, n2 = fret_note(2, bf), fret_note(1, ef)
        b += text(x + 30, 244, "B", 16, 600, INK2, "middle") + text(x + 70, 244, "E", 16, 600, INK2, "middle")
        b += text(x + 50, 274, f"{n1} + {n2}", 17, 800, INK, "middle")
    b += text(20, 316, "Top two notes of each chord: short, muted, off the beat.", 16, 600)
    D["guitar/afrobeats-double-stops.svg"] = svg(326, "Two-note shapes for the pop progression",
        "Top two strings of each chord: G is open B plus high E fret 3 (B and G); D is B fret 3 plus high E fret 2 (D and F sharp); Em is both open (B and E); C is B fret 1 plus open E (C and E).", b)

    # ── w16: thirds on G and B ──
    b = title("Highlife sweetness: thirds on the G and B strings")
    pairs = [(0, 0), (2, 1), (4, 3), (5, 5)]
    mk = []
    for g, bb in pairs:
        mk += [(3, g, fret_note(3, g), GOLD_SOFT), (2, bb, fret_note(2, bb), GOLD_SOFT)]
    b += fretboard(20, 80, 0, 6, mk, width=600)
    b += text(20, 270, "G + B,  A + C,  B + D,  C + E — two notes a third apart, moving together.", 16, 600)
    b += text(20, 294, "Thumb: alternate the bass, C–G for C, F–C for F, G–D for G.", 16, 600)
    D["guitar/highlife-thirds.svg"] = svg(304, "Parallel thirds on the G and B strings",
        "Pairs of notes a third apart in C major: open G with open B; G string fret 2 (A) with B fret 1 (C); G fret 4 (B) with B fret 3 (D); G fret 5 (C) with B fret 5 (E).", b)

    # ── w17: capo + sus ──
    b = title("A capo moves familiar shapes to a new key")
    b += rect(20, 60, 600, 54, SOFT, LINE, 8)
    for i in range(7):
        b += line(60 + i * 80, 60, 60 + i * 80, 114, INK2, 2 if i else 6)
    b += f'<rect x="{60 + 80 + 20}" y="52" width="16" height="70" rx="6" fill="{CORAL}" stroke="{INK}" stroke-width="1.5"/>'
    b += arrow(440, 87, 186, 87, CORAL_INK, 2) + text(450, 93, "capo at fret 2", 16, 800, INK)
    rows = [("Capo 2, G shapes", "G C D Em", "A D E F♯m"), ("Capo 3, G shapes", "G C D Em", "B♭ E♭ F Gm"), ("Capo 2, C shapes", "C F G Am", "D G A Bm")]
    b += text(20, 160, "You play", 16, 800, INK2) + text(240, 160, "shapes", 16, 800, INK2) + text(430, 160, "it sounds", 16, 800, INK2)
    for i, (a, s, t) in enumerate(rows):
        y = 176 + i * 46
        b += rect(20, y, 600, 38, GOLD_SOFT if i == 0 else SOFT, LINE, 6) + text(32, y + 26, a, 16, 700) + text(240, y + 26, s, 16, 700) + text(430, y + 26, t, 17, 800)
    b += text(20, 336, "Semitones from the shape's key to the song's key = the capo fret.", 16, 600)
    D["guitar/capo.svg"] = svg(346, "Capo positions and the keys they give",
        "A capo clamped at fret 2. Capo 2 with G-shape chords G C D Em sounds A D E F-sharp minor. Capo 3 with G shapes sounds B-flat E-flat F G minor. Capo 2 with C shapes C F G Am sounds D G A B minor.", b)

    b = title("D, Dsus4, Dsus2 — the classic worship move")
    b += boxes([("D", "D", 1, None, "D F♯ A"), ("Dsus4", "Dsus4", 1, {5}, "D G A"), ("Dsus2", "Dsus2", 1, None, "D E A")], 120, cw=24)
    b += text(320, 300, "Add the little finger on high E fret 3 for sus4; lift the high-E finger for sus2.", 16, 600, INK, "middle")
    D["guitar/d-sus-chords.svg"] = svg(310, "D, Dsus4 and Dsus2 chord boxes",
        "D: open D string, G fret 2, B fret 3, high E fret 2. Dsus4: the same with the little finger on high E fret 3 (G). Dsus2: the same with high E open (E).", b)

    # ── w19: lead techniques in tab ──
    b = title("Four ways to join notes, in the A minor pentatonic")
    ev = [(80, 3, "5h7"), (200, 2, "8p5"), (320, 4, "5/7"), (440, 3, "7b9"), (540, 1, "5~")]
    b += tab(40, 80, 560, ev)
    labs = [("hammer-on", "C → D"), ("pull-off", "G → E"), ("slide", "G → A"), ("bend", "D up to E"), ("vibrato", "on A")]
    for (dx, s, t), (a, c) in zip(ev, labs):
        b += text(40 + dx, 222, a, 16, 800, INK, "middle") + text(40 + dx, 246, c, 16, 600, INK2, "middle")
    b += text(20, 288, "A whole-step bend must reach the pitch two frets higher (fret 9).", 16, 600)
    D["guitar/lead-techniques-tab.svg"] = svg(298, "Hammer-on, pull-off, slide, bend and vibrato in tab",
        "Tab: G string 5 hammer-on 7 (C to D); B string 8 pull-off 5 (G to E); D string slide 5 to 7 (G to A); G string fret 7 bent a whole step to sound like fret 9 (D up to E); high E fret 5 with vibrato (A).", b)

    # ── song form ──
    def form(blocks, ttl, note):
        b = title(ttl)
        x = 20
        total = sum(w for _, w, _ in blocks)
        scale = 600 / total
        for lab, w, fill in blocks:
            ww = w * scale
            b += rect(x + 2, 70, ww - 4, 80, fill, INK, 8, 1.2) + text(x + ww / 2, 116, lab, 16 if len(lab) > 7 else 18, 800, INK, "middle")
            x += ww
        b += text(20, 186, note, 16, 600)
        return b
    V, C, Br, P = SOFT, GOLD, TEAL_SOFT, GOLD_SOFT
    D["guitar/song-form.svg"] = svg(196, "Verse-chorus song form",
        "Verse, Chorus, Verse, Chorus, Bridge, Chorus, with the choruses highlighted.",
        form([("Verse", 2, V), ("Chorus", 2, C), ("Verse", 2, V), ("Chorus", 2, C), ("Bridge", 2, Br), ("Chorus", 2, C)],
             "Verse – Chorus – Verse – Chorus – Bridge – Chorus", "Verses change their words; the chorus repeats them and carries the hook."))
    D["guitar/song-form-ii.svg"] = svg(196, "Song form with pre-chorus, bridge and a key change",
        "Verse, Pre-chorus, Chorus, Verse, Pre-chorus, Chorus, Bridge, then a final chorus a tone higher.",
        form([("Verse", 2, V), ("Pre", 1, P), ("Chorus", 2, C), ("Verse", 2, V), ("Pre", 1, P), ("Chorus", 2, C), ("Bridge", 2, Br), ("Chorus ↑", 2.4, CORAL)],
             "Adding a pre-chorus, a bridge — and a lift", "Pre-chorus builds; bridge brings new chords; last chorus goes up a tone."))

    # ── Y2: notes on 6th and 5th strings ──
    b = title("The natural notes on the 6th and 5th strings")
    mk = []
    for s in (6, 5):
        for f in range(0, 13):
            n = fret_note(s, f)
            if len(n) == 1:
                mk.append((s, f, n, GOLD if n in ("C", "G", "A", "E") and False else GOLD_SOFT))
    b += fretboard(20, 80, 0, 12, mk, width=600, sh=26)
    b += text(20, 270, "6th string: E F G A B C D E      5th string: A B C D E F G A", 16, 700)
    b += text(20, 294, "E–F and B–C are one fret apart; other pairs two. Fret 12 = octave.", 16, 600)
    D["guitar/notes-6th-5th.svg"] = svg(304, "Notes on the low E and A strings",
        "Fretboard frets 0 to 12 with the natural notes on the 6th string (E 0, F 1, G 3, A 5, B 7, C 8, D 10, E 12) and the 5th string (A 0, B 2, C 3, D 5, E 7, F 8, G 10, A 12).", b)

    # ── movable major scale ──
    b = title("A movable major-scale shape: G major at fret 3")
    pos = [(6, 2), (6, 3), (6, 5), (5, 2), (5, 3), (5, 5), (4, 2), (4, 4), (4, 5), (3, 2), (3, 4), (3, 5), (2, 3), (2, 5), (1, 2), (1, 3), (1, 5)]
    mk = []
    for s, f in pos:
        n = fret_note(s, f)
        assert n in ("G", "A", "B", "C", "D", "E", "F♯"), (s, f, n)
        mk.append((s, f, n, GOLD if n == "G" else GOLD_SOFT))
    b += fretboard(20, 80, 1, 6, mk, width=600)
    b += text(20, 270, "One finger per fret, frets 2–5. Root (gold) under finger 2 on the 6th string.", 16, 600)
    b += text(20, 294, "Slide the whole shape: root at fret 5 = A major, fret 8 = C major.", 16, 600)
    D["guitar/major-scale-shape.svg"] = svg(304, "Movable major scale shape, G major",
        "G major, frets 2 to 5. 6th string F sharp 2, G 3, A 5; 5th string B 2, C 3, D 5; 4th string E 2, F sharp 4, G 5; 3rd string A 2, B 4, C 5; 2nd string D 3, E 5; 1st string F sharp 2, G 3, A 5. Roots G on the 6th string fret 3, 4th string fret 5 and 1st string fret 3.", b)

    # ── notation and tab ──
    b = title("The same notes in notation (when) and tab (where)")
    st = Staff(20, 70, 600).lines().clef_glyph()
    notes = [("C4", 5, 3), ("D4", 4, 0), ("E4", 4, 2), ("F4", 4, 3), ("G4", 3, 0)]
    st.time(92, 4, 4)
    for i, (n, s, f) in enumerate(notes):
        st.note(150 + i * 80, n, "q" if i < 4 else "q")
    st.barline(462)
    st.note(530, "G4", "h", stem="up") if False else None
    b += st.svg()
    ev = [(150 + i * 80 - 40, s, str(f)) for i, (n, s, f) in enumerate(notes)]
    b += tab(40, 190, 580, ev)
    for i, (n, s, f) in enumerate(notes):
        assert fret_note(s, f) == n[0], (n, s, f)
        b += text(150 + i * 80, 175, n[0], 16, 800, INK2, "middle")
    b += text(20, 336, "Tab: top line = high E. Guitar music sounds an octave lower than written.", 16, 600)
    D["guitar/notation-and-tab.svg"] = svg(346, "Standard notation above tablature",
        "Five crotchets C D E F G on a treble staff in 4/4, and below them the tab: A string fret 3, open D string, D string fret 2, D string fret 3, open G string.", b)

    # ── chuck pattern ──
    b = title("Accents and the chuck on beats 2 and 4")
    counts = ["1", "&", "2", "&", "3", "&", "4", "&"]
    for i, c in enumerate(counts):
        cx = 40 + i * 70 + 35
        beat = c.isdigit()
        b += rect(40 + i * 70 + 2, 60, 66, 160, GOLD_SOFT if beat else SOFT, "none", 6) + text(cx, 90, c, 20 if beat else 18, 800, INK, "middle")
        if c in ("2", "4"):
            b += text(cx, 160, "✕", 34, 900, CORAL_INK, "middle") + text(cx, 200, "chuck", 16, 800, CORAL_INK, "middle")
        else:
            b += strum_arrow(cx, 140, down=(i % 2 == 0), hit=True, size=56) + text(cx, 200, "D" if i % 2 == 0 else "U", 16, 800, INK, "middle")
    b += text(40, 256, "On 2 and 4 the strum lands and is muted at once — a snare-like click.", 16, 600)
    D["guitar/chuck-pattern.svg"] = svg(266, "Strumming with chucks on 2 and 4",
        "Eight counts: down on 1, up, a muted chuck on 2, up, down on 3, up, chuck on 4, up.", b)

    # ── shuffle tab ──
    b = title("The blues shuffle over A: 5th and 6th")
    ev = []
    for i in range(8):
        dx = 70 + i * 62
        ev += [(dx, 5, "0"), (dx, 4, "2" if i % 2 == 0 else "4")]
    b += tab(40, 80, 560, ev)
    for i in range(8):
        b += text(40 + 70 + i * 62, 222, ["A5", "A6"][i % 2], 16, 700, INK2, "middle")
    b += text(20, 260, "Open A with D-string fret 2 (E), then fret 4 (F♯): A5 – A6. Swing it, palm-muted.", 16, 600)
    b += text(20, 284, "Same shape on the D and G strings for D; A and D strings for E.", 16, 600)
    D["guitar/blues-shuffle.svg"] = svg(294, "Blues shuffle pattern in A",
        "Tab: open A string with the D string at fret 2 (A and E, A5), then the D string at fret 4 (A and F sharp, A6), alternating for a bar of eight.", b)

    # ── seventh chord boxes ──
    b = title("Open seventh chords")
    b += boxes([("Cmaj7", "Cmaj7", 1, None, "C E G B"), ("Am7", "Am7", 1, None, "A C E G"), ("Em7", "Em7", 1, None, "E G B D")], 110, cw=22)
    b += boxes([("G7", "G7", 1, None, "G B D F"), ("D7", "D7", 1, None, "D F♯ A C"), ("E7", "E7", 1, None, "E G♯ B D")], 360, cw=22)
    D["guitar/seventh-chords.svg"] = svg(530, "Open seventh chord shapes",
        "Cmaj7 x32000; Am7 x02010; Em7 022030; G7 320001; D7 xx0212; E7 020100.", b)

    # ── minor ii–V–i boxes ──
    b = title("The minor ii – V – i in A minor")
    b += boxes([("Bm7♭5", "Bm7♭5", 1, None, "B D F A"), ("E7", "E7", 1, {3}, "E G♯ B D"), ("Am7", "Am7", 1, None, "A C E G")], 120, cw=24)
    b += text(320, 300, "G♯ (gold, G string fret 1) in E7 pulls up to A.", 16, 600, INK, "middle")
    D["guitar/minor-ii-v-i.svg"] = svg(310, "Minor ii-V-i chord boxes",
        "B minor seven flat five x2323x; E7 020100 with G sharp on the G string fret 1; A minor seven x02010.", b)

    # ── volume swell ──
    b = title("A picked note against a volume swell")
    for i, (lab, swell) in enumerate([("Picked", False), ("Swell", True)]):
        x0 = 30 + i * 310
        b += rect(x0, 60, 280, 170, SOFT, LINE, 8) + text(x0 + 14, 86, lab, 18, 800)
        b += line(x0 + 20, 210, x0 + 265, 210, INK2, 1.5)
        if swell:
            d = f"M{x0 + 20} 210 C{x0 + 90} 210 {x0 + 110} 110 {x0 + 160} 108 C{x0 + 210} 106 {x0 + 230} 150 {x0 + 265} 180"
        else:
            d = f"M{x0 + 20} 210 L{x0 + 30} 100 C{x0 + 70} 120 {x0 + 150} 170 {x0 + 265} 200"
        b += f'<path d="{d}" fill="none" stroke="{BLUE}" stroke-width="3"/>'
    b += text(30, 260, "Start with the volume at zero and roll it up after picking: the attack vanishes,", 16, 600)
    b += text(30, 284, "and the note blooms like a bowed string or a pad.", 16, 600)
    D["guitar/volume-swell.svg"] = svg(294, "Volume swell",
        "Two loudness-over-time curves. A picked note jumps to full volume at once and fades. A swell starts silent and rises smoothly, so the pick's attack cannot be heard.", b)

    # ── interlocking ──
    b = title("Interlocking guitar parts: each fills the other's gaps")
    cnt = ["1", "e", "&", "a", "2", "e", "&", "a", "3", "e", "&", "a", "4", "e", "&", "a"]
    g, gx, cw = count_grid(20, 60, cnt, [("Guitar 1", {0: "x", 3: "x", 6: "x", 8: "x", 11: "x", 14: "x"}),
                                         ("Guitar 2", {2: "x", 4: "x", 10: "x", 12: "x"}),
                                         ("Rhythm", {2: "x", 6: "x", 10: "x", 14: "x"})], width=600, label_w=100)
    b += g
    b += text(20, 260, "An example to copy: riff, answering thirds, muted off-beat chords.", 16, 600)
    b += text(20, 284, "Each part is simple; the shimmer comes from how they fit.", 16, 600)
    D["guitar/interlocking.svg"] = svg(294, "Interlocking guitar parts",
        "A sixteen-step grid counted 1 e and a. Guitar 1 plays a riff, guitar 2 plays in the gaps it leaves, and the rhythm guitar plays muted chords on the 'and' of each beat.", b)

    # ── bends ──
    b = title("A bend in tune: match the fret you are aiming for")
    b += fretboard(20, 80, 5, 10, [(3, 7, "D", GOLD), (3, 9, "E", TEAL_SOFT), (3, 8, "D♯", SOFT)], width=600, show_names=True)
    fw = (600 - 34) / 6
    xa, xb = 54 + 2.5 * fw, 54 + 4.5 * fw
    b += f'<path d="M{xa:.0f} 104 C{xa:.0f} 62 {xb:.0f} 62 {xb:.0f} 100" fill="none" stroke="{CORAL_INK}" stroke-width="2.5" marker-end="url(#a)"/>'
    b += text(20, 270, "G string fret 7 (D): a whole-step bend must sound like fret 9 (E);", 16, 600)
    b += text(20, 294, "a half-step bend like fret 8 (D♯). Play the target first, then bend to it.", 16, 600)
    D["guitar/bend-targets.svg"] = svg(304, "Bend targets",
        "On the G string, fret 7 is D. A whole-step bend from it must reach the pitch of fret 9, E; a half-step bend the pitch of fret 8, D sharp.", b)

    # ── rest and free stroke ──
    b = title("Rest stroke and free stroke (seen from the side)")
    for i, (lab, rest) in enumerate([("Rest stroke (apoyando)", True), ("Free stroke (tirando)", False)]):
        x0 = 30 + i * 310
        b += rect(x0, 60, 280, 200, SOFT, LINE, 8) + text(x0 + 140, 88, lab, 17, 800, INK, "middle")
        for k in range(3):
            b += circle(x0 + 80 + k * 50, 200, 9, "#ffffff", INK, 2)
        b += text(x0 + 80, 235, "played", 16, 600, INK2, "middle") + text(x0 + 130, 235, "next", 16, 600, INK2, "middle")
        if rest:
            d = f"M{x0 + 66} 168 C{x0 + 76} 222 {x0 + 112} 222 {x0 + 122} 196"
            b += f'<path d="{d}" fill="none" stroke="{BLUE}" stroke-width="3" marker-end="url(#a)"/>' + text(x0 + 200, 150, "lands on the", 16, 600) + text(x0 + 200, 172, "next string", 16, 600)
        else:
            d = f"M{x0 + 60} 170 C{x0 + 80} 210 {x0 + 100} 180 {x0 + 100} 120"
            b += f'<path d="{d}" fill="none" stroke="{BLUE}" stroke-width="3" marker-end="url(#a)"/>' + text(x0 + 200, 150, "lifts into", 16, 600) + text(x0 + 200, 172, "the hand", 16, 600)
    b += text(30, 290, "Rest stroke: full tone, for melody. Free stroke: for arpeggios, chords.", 16, 600)
    D["guitar/rest-free-stroke.svg"] = svg(300, "Rest stroke and free stroke",
        "Two side views of the plucking finger. In a rest stroke it plays through the string and comes to rest on the next string. In a free stroke it plucks and lifts up into the hand, clear of the next string.", b)

    # ── modes on A ──
    b = title("Dorian and Mixolydian on A: one note changes")
    rows = [("A natural minor", ["A", "B", "C", "D", "E", "F", "G"], None), ("A Dorian", ["A", "B", "C", "D", "E", "F♯", "G"], 5),
            ("A major", ["A", "B", "C♯", "D", "E", "F♯", "G♯"], None), ("A Mixolydian", ["A", "B", "C♯", "D", "E", "F♯", "G"], 6)]
    for i, (nm, ns, hi) in enumerate(rows):
        y = 64 + i * 58 + (14 if i >= 2 else 0)
        b += text(20, y + 30, nm, 17, 800)
        for j, n in enumerate(ns):
            x = 210 + j * 58
            b += rect(x, y, 52, 44, CORAL if j == hi else (SOFT), INK if j == hi else LINE, 6) + text(x + 26, y + 29, n, 18, 800, INK, "middle")
    b += text(20, 330, "Dorian: minor with a raised 6th (the notes of G major).", 16, 600)
    b += text(20, 354, "Mixolydian: major with a flat 7th (the notes of D major).", 16, 600)
    D["guitar/dorian-mixolydian-a.svg"] = svg(364, "A Dorian and A Mixolydian",
        "A natural minor A B C D E F G; A Dorian raises F to F sharp. A major A B C sharp D E F sharp G sharp; A Mixolydian lowers G sharp to G.", b)

    # ── capo 5 for guitar 2 ──
    b = title("Guitar 2 at capo 5: same chords, higher voicings")
    rows = [("Song chord", "G", "C", "D", "Em"), ("Guitar 1 plays (open)", "G", "C", "D", "Em"), ("Guitar 2 plays (capo 5)", "D", "G", "A", "Bm")]
    for i, r in enumerate(rows):
        y = 64 + i * 56
        b += text(20, y + 30, r[0], 16, 800)
        for j, c in enumerate(r[1:]):
            b += rect(250 + j * 92, y, 84, 44, GOLD_SOFT if i == 2 else SOFT, LINE, 6) + text(292 + j * 92, y + 30, c, 18, 800, INK, "middle")
    b += text(20, 260, "Capo 5 raises each shape five semitones: D sounds G, Bm sounds Em.", 16, 600)
    D["guitar/two-guitars-capo5.svg"] = svg(270, "Two-guitar arrangement with capo 5",
        "For a song with the chords G C D Em, guitar 1 plays those open shapes; guitar 2 with a capo at fret 5 plays D G A Bm shapes, which sound as G C D Em.", b)

    # ── signal chain ──
    b = title("The signal chain: guitar to speaker")
    chain = ["Guitar", "Tuner", "Drive", "Modulation", "Delay", "Reverb", "Amp"]
    for i, c in enumerate(chain):
        r, k = divmod(i, 4)
        x = 20 + k * 155
        y = 70 + r * 110
        if r == 1:
            x = 20 + (3 - k) * 155
        b += rect(x, y, 130, 56, GOLD if c in ("Guitar", "Amp") else SOFT, INK, 8, 1.2) + text(x + 65, y + 35, c, 17, 800, INK, "middle")
    b += arrow(150, 98, 173, 98) + arrow(305, 98, 328, 98) + arrow(460, 98, 483, 98) + arrow(548, 128, 548, 178)
    b += arrow(483, 208, 460, 208) + arrow(328, 208, 305, 208)
    b += text(20, 300, "Drive before delay and reverb keeps the echoes clean.", 16, 600)
    D["guitar/signal-chain.svg"] = svg(310, "Guitar pedal order",
        "Guitar, then tuner, drive or distortion, modulation (chorus, phaser), delay, reverb, and finally the amp.", b)

    # ── extended chords Y3 ──
    b = title("ii – V – I with extended chords in C")
    b += boxes([("Dm9", "Dm9", 3, None, "D F C E"), ("G13", "G13", 3, None, "G F B E"), ("Cmaj9", "Cmaj9", 2, None, "C E B D")], 120, cw=24)
    b += text(320, 300, "The 3rd and 7th define each chord; the 9th or 13th adds colour.", 16, 600, INK, "middle")
    D["guitar/extended-ii-v-i.svg"] = svg(310, "Dm9 G13 Cmaj9 chord shapes",
        "Dm9: A string fret 5 (D), D string 3 (F), G string 5 (C), B string 5 (E). G13: low E fret 3 (G), D string 3 (F), G string 4 (B), B string 5 (E). Cmaj9: A string 3 (C), D string 2 (E), G string 4 (B), B string 3 (D).", b)

    # ── sweep ──
    b = title("A three-string sweep: A minor triad")
    ev = [(90, 3, "14"), (170, 2, "13"), (250, 1, "12"), (330, 2, "13"), (410, 3, "14")]
    for dx, s, t in ev:
        pass
    assert [fret_note(s, int(t)) for _, s, t in ev] == ["A", "C", "E", "C", "A"]
    b += tab(40, 90, 560, ev)
    for i, (dx, s, t) in enumerate(ev):
        down = i < 3
        b += text(40 + dx, 74, "⊓" if down else "V", 20, 900, INK, "middle")
        b += text(40 + dx, 232, fret_note(s, int(t)), 16, 800, INK2, "middle")
    b += text(20, 270, "⊓ = down-stroke, V = up-stroke: one motion down through G–B–E, then back up.", 16, 600)
    b += text(20, 294, "Lift each finger as the next note sounds, so the notes never ring together.", 16, 600)
    D["guitar/sweep-am.svg"] = svg(304, "Sweep picking an A minor triad",
        "Tab: G string fret 14 (A), B string 13 (C), high E 12 (E) with one down-stroke motion, then B 13 (C) and G 14 (A) with one up-stroke motion.", b)

    return D
