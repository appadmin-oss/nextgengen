"""Piano diagrams, and the theory diagrams the piano and guitar courses share (circle of fifths, staff, rhythm)."""
import math
from music_draw import *  # noqa: F401,F403


def kb_row(items, y, ww=24, wh=96, lo="C4", hi="B4", gap=28, x0=None, name_y=None, fingers=None):
    """Several small keyboards side by side, each with its name above and its notes marked.
    items: list of (heading, [notes], fill, sub)."""
    out = []
    n = len(items)
    m_lo, m_hi = midi(lo), midi(hi)
    whites = sum(1 for m in range(m_lo, m_hi + 1) if not is_black(m))
    ww = min(ww, (600 - (n - 1) * gap) / (n * whites))
    kw = whites * ww
    total = n * kw + (n - 1) * gap
    x = (W - total) / 2 if x0 is None else x0
    for i, it in enumerate(items):
        head, notes, fill = it[0], it[1], it[2]
        sub = it[3] if len(it) > 3 else None
        kx = x + i * (kw + gap)
        out.append(text(kx + kw / 2, y - 46, head, 18, 800, INK, "middle"))
        fg = (fingers[i] if fingers else None)
        k, _, pos = keyboard(kx, y, lo, hi, {nn: fill for nn in notes}, ww, wh, names=False, fingers=fg)
        out.append(k)
        out.append(text(kx + kw / 2, y + wh + 26, " ".join(pretty(nn) for nn in notes), 18, 800, INK, "middle"))
        if sub:
            out.append(text(kx + kw / 2, y + wh + 50, sub, 16, 600, INK2, "middle"))
    return "".join(out)


def figs():
    D = {}

    # ── Piano Y1 w1: the map of the keyboard ──
    b = title("Find C and F from the black keys")
    k, kw, pos = keyboard(40, 104, "C3", "B4", {"C3": GOLD, "F3": GOLD_SOFT, "C4": GOLD, "F4": GOLD_SOFT}, 40, 150)
    b += k
    b += text(pos[midi("C4")], 286, "middle C", 16, 800, INK, "middle")
    b += line(pos[midi("C4")], 260, pos[midi("C4")], 270, INK, 2)
    for grp, n0, n1 in [("2", "C#3", "D#3"), ("3", "F#3", "A#3"), ("2", "C#4", "D#4"), ("3", "F#4", "A#4")]:
        x0, x1 = pos[midi(n0)], pos[midi(n1)]
        b += f'<path d="M{x0 - 10:.1f} 96 L{x0 - 10:.1f} 88 L{x1 + 10:.1f} 88 L{x1 + 10:.1f} 96" fill="none" stroke="{INK2}" stroke-width="2"/>'
        b += text((x0 + x1) / 2, 80, f"group of {grp}", 16, 700, INK2, "middle")
    b += text(40, 320, "C is just left of each group of two black keys;", 16, 600)
    b += text(40, 344, "F is just left of each group of three.", 16, 600)
    b += text(40, 368, "The white keys run C D E F G A B, then start again.", 16, 600)
    D["piano/keyboard-map.svg"] = svg(378, "Finding C and F on the keyboard",
        "Two octaves of keyboard from C3. Each C is the white key just left of a group of two black keys and each F just left of a group of three. Middle C is marked.", b)

    # finger numbers: two hands, palms down, thumbs towards each other
    b = title("Finger numbers — the same on both hands")
    def hand(cx, right):
        sg = 1 if right else -1                     # right hand: thumb on the LEFT, fingers 2..5 to the right
        o, nums = [], []
        for num, dx, top in [(2, -38, 74), (3, -5, 58), (4, 28, 70), (5, 58, 102)]:
            fx = cx + sg * dx - 15
            o.append(f'<rect x="{fx:.1f}" y="{top}" width="30" height="{230 - top}" rx="15" fill="#ffffff" stroke="{INK}" stroke-width="2"/>')
            nums.append((fx + 15, top + 22, num))
        tx = cx - sg * 78
        o.append(f'<rect x="{tx - 16:.1f}" y="196" width="32" height="80" rx="16" fill="#ffffff" stroke="{INK}" stroke-width="2" transform="rotate({sg * 28} {tx:.1f} 236)"/>')
        o.append(rect(cx - 70, 190, 140, 110, "#ffffff", INK, 36, 2))
        nums.append((tx - sg * 6, 226, 1))
        for x, y, num in nums:
            o.append(circle(x, y, 13, GOLD, INK, 1.4) + text(x, y + 6, str(num), 16, 800, INK, "middle"))
        return "".join(o)
    b += hand(170, False) + hand(470, True)
    b += text(170, 330, "Left hand", 18, 800, INK, "middle") + text(470, 330, "Right hand", 18, 800, INK, "middle")
    b += text(320, 360, "Thumb = 1, index = 2, middle = 3, ring = 4, little finger = 5.", 16, 600, INK, "middle")
    D["piano/finger-numbers.svg"] = svg(370, "Piano finger numbers",
        "Both hands seen from above, palms down: on each hand the thumb is 1, index finger 2, middle 3, ring 4 and little finger 5.", b)

    # ── w2: C major scale with fingering and the T T S pattern ──
    b = title("C major: the pattern and the fingering")
    notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]
    k, kw, pos = keyboard(60, 110, "C4", "C5", {n: GOLD_SOFT for n in notes}, 64, 150,
                          fingers=dict(zip(notes, [1, 2, 3, 1, 2, 3, 4, 5])), finger_y=88)
    b += k
    b += text(20, 94, "RH", 16, 800, INK)
    lh = dict(zip(notes, [5, 4, 3, 2, 1, 3, 2, 1]))
    for n, f in lh.items():
        b += circle(pos[midi(n)], 290, 13, TEAL_SOFT, INK, 1.4) + text(pos[midi(n)], 296, str(f), 16, 800, INK, "middle")
    b += text(20, 296, "LH", 16, 800, INK)
    for i, s in enumerate("TTSTTTS"):
        x0, x1 = pos[midi(notes[i])], pos[midi(notes[i + 1])]
        fill = CORAL_INK if s == "S" else INK2
        b += text((x0 + x1) / 2, 338, "tone" if s == "T" else "semi", 16, 800, fill, "middle")
    b += text(60, 372, "Right hand: thumb passes UNDER after E (3 → 1 on F).", 16, 600)
    b += text(60, 396, "Left hand: finger 3 crosses OVER the thumb onto A.", 16, 600)
    D["piano/c-major-fingering.svg"] = svg(406, "C major scale: notes, steps and fingering",
        "C major scale from C to C on the keyboard. Right-hand fingering 1 2 3 1 2 3 4 5 above the keys, left-hand fingering 5 4 3 2 1 3 2 1 below. The steps between notes are tone, tone, semitone, tone, tone, tone, semitone.", b)

    # ── w3: I IV V in C ──
    b = title("The three chords of C major: I, IV and V")
    b += kb_row([("I — C major", ["C4", "E4", "G4"], GOLD, "fingers 1 3 5"),
                 ("IV — F major", ["F4", "A4", "C5"], GOLD, "fingers 1 3 5"),
                 ("V — G major", ["G4", "B4", "D5"], GOLD, "fingers 1 3 5")], 110, ww=22, lo="C4", hi="E5", gap=16)
    b += text(320, 290, "Each is a root, the note a third above it and the note a fifth above it.", 16, 600, INK, "middle")
    D["piano/c-chords-I-IV-V.svg"] = svg(300, "Chords I, IV and V in C major",
        "Three keyboards: C major chord C-E-G, F major chord F-A-C, G major chord G-B-D, each played with fingers 1, 3 and 5.", b)

    # ── w4: legato and staccato in notation ──
    b = title("Legato and staccato, written")
    st = Staff(20, 90, 600).lines().clef_glyph()
    xs = [100, 150, 200, 250, 300]
    ns = ["C4", "D4", "E4", "F4", "G4"]
    for x, n in zip(xs, ns):
        st.note(x, n, "q")
    st.out.append(st.curve(100, 300, st.ypos("C4") + 22, up=False, h=-26))
    st.barline(340)
    for x, n in zip([390, 440, 490, 540, 590], ns):
        st.note(x, n, "q")
        st.out.append(circle(x, st.ypos(n) + 16 if st.stem_dir(n) == "up" else st.ypos(n) - 16, 3.6, INK))
    b += st.svg()
    b += text(200, 216, "Legato: the slur", 17, 800, INK, "middle") + text(200, 240, "hold each key until the next sounds", 16, 600, INK2, "middle")
    b += text(490, 216, "Staccato: the dots", 17, 800, INK, "middle") + text(490, 240, "short and lifted", 16, 600, INK2, "middle")
    D["piano/legato-staccato.svg"] = svg(250, "Legato and staccato in notation",
        "The notes C D E F G twice: first under one curved slur, meaning smooth and connected (legato); then each with a dot, meaning short and detached (staccato).", b)

    # ── w5: blocked chord and Alberti bass ──
    b = title("One chord, two ways: blocked, then Alberti bass")
    st = Staff(20, 90, 600, "bass").lines().clef_glyph()
    st.time(92, 4, 4)
    st.chord(150, ["C3", "E3", "G3"], "w")
    st.barline(250)
    pts = []
    alb = ["C3", "G3", "E3", "G3", "C3", "G3", "E3", "G3"]
    for i, n in enumerate(alb):
        pts.append(st.note(290 + i * 38, n, "8", stem="up", flag=False))
    st.beam(pts[:4], "up")
    st.beam(pts[4:], "up")
    st.barline(605, final=True)
    b += st.svg()
    for i, n in enumerate(alb):
        b += text(290 + i * 38, 192, pretty(n), 16, 700, INK2, "middle")
    b += text(150, 192, "C E G together", 16, 700, INK2, "middle")
    b += text(440, 222, "low – high – middle – high", 16, 800, INK, "middle")
    D["piano/alberti-bass.svg"] = svg(234, "Blocked chord and Alberti bass in C, bass clef",
        "Bass clef, 4/4. Bar 1: a blocked C major chord, C E G together as a whole note. Bar 2: the same chord as Alberti bass in quavers: C G E G C G E G — low, high, middle, high.", b)

    # ── w6 / w15: I–IV–V–I with voice leading ──
    b = title("I – IV – V – I in C, with the hand barely moving")
    b += kb_row([("C", ["C4", "E4", "G4"], GOLD, "root position"), ("F", ["C4", "F4", "A4"], GOLD, "C stays"),
                 ("G", ["B3", "D4", "G4"], GOLD, "G stays"), ("C", ["C4", "E4", "G4"], GOLD, "home")], 110, ww=20, lo="A3", hi="B4", gap=14)
    b += text(320, 290, "Move each finger to the nearest note; a shared note stays put.", 16, 600, INK, "middle")
    D["piano/voice-leading-I-IV-V-I.svg"] = svg(300, "I-IV-V-I in C with smooth voice leading",
        "Four keyboards: C as C-E-G; F as C-F-A, keeping C; G as B-D-G; and back to C-E-G. Each finger moves to the nearest note of the next chord.", b)

    # ── w8: two-octave fingering + reggae skank ──
    b = title("C major over two octaves — right hand")
    notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"]
    fing = [1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5]
    k, kw, pos = keyboard(30, 100, "C4", "C6", {n: GOLD_SOFT for n in notes}, 38.6, 130, fingers=dict(zip(notes, fing)), finger_y=78)
    b += k
    for n in ("F4", "C5", "F5"):
        b += text(pos[midi(n)], 258, "thumb", 16, 800, CORAL_INK, "middle")
    b += text(30, 296, "The thumb passes under onto F and C; finger 4 plays B", 16, 600)
    b += text(30, 320, "in the first octave so the thumb can carry on to C.", 16, 600)
    D["piano/c-major-two-octaves.svg"] = svg(330, "Two-octave C major fingering, right hand",
        "C major from C4 to C6 with right-hand fingering 1 2 3 1 2 3 4, 1 2 3 1 2 3 4 5. The thumb passes under onto F and C; finger 4 plays B in the first octave.", b)

    b = title("The reggae skank: chords off the beat")
    g, gx, cw = count_grid(20, 60, ["1", "&", "2", "&", "3", "&", "4", "&"],
                           [("Keys", {1: "x", 3: "x", 5: "x", 7: "x"}), ("Kick", {0: "x", 4: "x"})], width=600)
    b += g
    b += text(20, 214, "Short, staccato chord stabs on every \"and\"; the bass and drums take the beats.", 16, 600)
    b += text(20, 238, "The silence between the chops is part of the groove.", 16, 600)
    D["piano/reggae-skank.svg"] = svg(248, "Reggae skank rhythm",
        "A bar counted 1 and 2 and 3 and 4 and. The keyboard plays short chords on every 'and'; the kick drum plays on beats 1 and 3.", b)

    # ── note values (piano w11, violin w5) ──
    def values(uk=True):
        b = title("Note values in 4/4 — and their rests")
        rows = [("semibreve" if uk else "whole note", "4 beats", "w", 1), ("minim" if uk else "half note", "2 beats", "h", 2),
                ("crotchet" if uk else "quarter note", "1 beat", "q", 4), ("quaver" if uk else "eighth note", "½ beat", "8", 8)]
        y = 70
        for name, beats, d, n in rows:
            st = Staff(220, y, 400, "treble", s=10)
            st.lines()
            span = 360 / n
            pts = []
            for i in range(n):
                x = 240 + i * span + (span / 2 - 14 if n > 1 else 0) + (160 if n == 1 else 0)
                r = st.note(x, "B4" if d != "8" else "C5", d, stem="down" if d != "8" else "up", flag=False)
                pts.append(r)
            if d == "8":
                for j in range(0, 8, 2):
                    st.beam(pts[j:j + 2], "up")
            b += st.svg()
            # the rest, at the left
            rs = Staff(160, y, 46, "treble", s=10)
            rs.lines()
            rs.rest(183, d)
            b += rs.svg()
            b += text(20, y + 22, name, 17, 800) + text(20, y + 44, beats, 16, 600, INK2)
            y += 88
        b += text(160, y - 6, "rest", 16, 700, INK2, "middle") if False else ""
        b += text(183, 58, "rest", 16, 700, INK2, "middle")
        b += text(420, 58, "fills one bar of 4/4", 16, 700, INK2, "middle")
        return b, y
    b, y = values(True)
    b += text(20, y + 4, "A dot adds half the value again: dotted minim = 3 beats, dotted crotchet = 1½.", 16, 600)
    D["common/note-values.svg"] = svg(y + 14, "Note values and rests in 4/4",
        "One bar of 4/4 filled four ways: one semibreve (4 beats), two minims (2 beats each), four crotchets (1 beat each), eight quavers beamed in pairs (half a beat each). Each row shows its matching rest.", b)

    # ── circle of fifths ──
    b = title("The circle of fifths")
    cx, cy, R1, R2 = 320, 290, 205, 132
    maj = ["C", "G", "D", "A", "E", "B", "F♯/G♭", "D♭", "A♭", "E♭", "B♭", "F"]
    mnr = ["Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m/E♭m", "B♭m", "Fm", "Cm", "Gm", "Dm"]
    sig = ["0", "1♯", "2♯", "3♯", "4♯", "5♯", "6♯/6♭", "5♭", "4♭", "3♭", "2♭", "1♭"]
    b += circle(cx, cy, R1 + 34, SOFT, LINE, 1.5) + circle(cx, cy, R2 - 30, "#ffffff", LINE, 1.5)
    for i in range(12):
        a = -math.pi / 2 + i * math.pi / 6
        x1, y1 = cx + (R1 + 34) * math.cos(a + math.pi / 12), cy + (R1 + 34) * math.sin(a + math.pi / 12)
        x2, y2 = cx + (R2 - 30) * math.cos(a + math.pi / 12), cy + (R2 - 30) * math.sin(a + math.pi / 12)
        b += line(x2, y2, x1, y1, LINE, 1.2)
        mx, my = cx + R1 * math.cos(a), cy + R1 * math.sin(a)
        b += text(mx, my + 2, maj[i], 20 if len(maj[i]) < 3 else 16, 800, INK, "middle")
        b += text(mx, my + 22, sig[i], 16, 600, INK2, "middle")
        nx, ny = cx + R2 * math.cos(a), cy + R2 * math.sin(a)
        b += text(nx, ny + 6, mnr[i], 16 if len(mnr[i]) < 5 else 13.5, 700, BLUE, "middle") if len(mnr[i]) < 5 else text(nx, ny + 6, "D♯m", 16, 700, BLUE, "middle")
    b += text(cx, cy - 8, "major keys outside", 16, 700, INK, "middle")
    b += text(cx, cy + 16, "relative minors inside", 16, 700, BLUE, "middle")
    b += text(cx, 560, "Clockwise: up a fifth, one more sharp. Anticlockwise: down a fifth, one more flat.", 16, 600, INK, "middle")
    D["common/circle-of-fifths.svg"] = svg(570, "The circle of fifths",
        "Twelve major keys in a circle with their key signatures: C (none), G 1 sharp, D 2, A 3, E 4, B 5, F sharp or G flat 6, D flat 5 flats, A flat 4, E flat 3, B flat 2, F 1 flat. Inside each is its relative minor: Am, Em, Bm, F sharp m, C sharp m, G sharp m, D sharp m, B flat m, Fm, Cm, Gm, Dm.", b)

    # ── A minor: three forms ──
    b = title("A minor in three forms")
    rows = [("Natural", ["A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4"], [], "A B C D E F G A"),
            ("Harmonic", ["A3", "B3", "C4", "D4", "E4", "F4", "G#4", "A4"], ["G#4"], "raise the 7th: G♯"),
            ("Melodic (going up)", ["A3", "B3", "C4", "D4", "E4", "F#4", "G#4", "A4"], ["F#4", "G#4"], "raise 6th and 7th: F♯ G♯")]
    y = 70
    for name, notes, raised, sub in rows:
        mk = {n: (CORAL if n in raised else GOLD_SOFT) for n in notes}
        k, kw, pos = keyboard(230, y, "A3", "A4", mk, 40, 100, names="marked")
        b += k + text(20, y + 40, name, 18, 800) + text(20, y + 66, sub, 16, 600, CORAL_INK if raised else INK2)
        for r in raised:
            b += text(pos[midi(r)], y - 8, pretty(r), 16, 800, CORAL_INK, "middle")
        y += 140
    b += text(20, y - 8, "Coming down, the melodic minor returns to the natural form (G, F).", 16, 600)
    D["common/a-minor-three-forms.svg"] = svg(y, "Three forms of A minor",
        "Keyboards from A to A. Natural minor: A B C D E F G A. Harmonic minor raises the 7th to G sharp. Melodic minor going up raises the 6th and 7th to F sharp and G sharp.", b)

    # ── inversions ──
    b = title("C major in root position and two inversions")
    b += kb_row([("Root position", ["C4", "E4", "G4"], GOLD, "C at the bottom"),
                 ("1st inversion  C/E", ["E4", "G4", "C5"], GOLD, "E at the bottom"),
                 ("2nd inversion  C/G", ["G4", "C5", "E5"], GOLD, "G at the bottom")], 110, ww=22, lo="C4", hi="F5", gap=12)
    D["piano/c-inversions.svg"] = svg(280, "Inversions of C major",
        "Three keyboards: root position C-E-G; first inversion E-G-C, written C/E; second inversion G-C-E, written C/G.", b)

    # ── pop progression ──
    b = title("The pop progression I – V – vi – IV in C")
    b += kb_row([("I  C", ["C4", "E4", "G4"], GOLD), ("V  G", ["B3", "D4", "G4"], GOLD),
                 ("vi  Am", ["C4", "E4", "A4"], TEAL), ("IV  F", ["C4", "F4", "A4"], GOLD)], 110, ww=20, lo="A3", hi="B4", gap=14)
    b += text(320, 270, "Right-hand voicings that keep the hand still. Left hand: the roots C, G, A, F.", 16, 600, INK, "middle")
    D["piano/pop-progression.svg"] = svg(280, "The pop progression in C",
        "Four keyboards: C as C-E-G, G as B-D-G, A minor as C-E-A, F as C-F-A, with the left hand playing the roots C, G, A and F.", b)

    # ── band registers ──
    b = title("Who plays where in a band (typical ranges)")
    k, kw, pos = keyboard(20, 250, "C1", "C7", {}, 600 / 43, 70, names=False)
    b += k
    for c in ["C2", "C3", "C4", "C5", "C6"]:
        b += text(pos[midi(c)], 342, pretty(c, True), 16, 700, INK2, "middle")
    def band(lo, hi, y, lab, fill):
        x0, x1 = pos[midi(lo)], pos[midi(hi)]
        return rect(x0, y, x1 - x0, 30, fill, INK, 6, 1.2) + text(x0 + 8, y + 21, lab, 16, 800, INK)
    b += band("E1", "G3", 60, "Bass guitar", TEAL_SOFT)
    b += band("E2", "E5", 100, "Guitar chords", GOLD_SOFT)
    b += band("C3", "C6", 140, "Singers' melodies", "#e6defa")
    b += band("C3", "C6", 180, "Keys in a band: middle, no low bass", GOLD)
    D["piano/band-registers.svg"] = svg(352, "Typical ranges in a band",
        "A keyboard strip from C1 to C7 with typical ranges above it: bass guitar about E1 to G3, guitar chords E2 to E5, singers' melodies about C3 to C6, and the band keyboard player in the middle, C3 to C6, leaving the low notes to the bass.", b)

    # ── intervals (piano w18 and vocal w3) ──
    def intervals(rows, key):
        b = title("Intervals from C, and a song that starts with each")
        y = 70
        for name, top, song in rows:
            k, kw, pos = keyboard(20, y, "C4", "C5", {"C4": GOLD, top: GOLD}, 22, 62, names=False)
            b += k + text(210, y + 26, name, 18, 800) + text(210, y + 50, f"C up to {pretty(top)} — {song}", 16, 600, INK2)
            y += 78
        return b, y
    piano_rows = [("Major 2nd", "D4", "\"Happy Birth-day\""), ("Major 3rd", "E4", "\"Oh when the saints\""),
                  ("Perfect 4th", "F4", "\"Here comes the bride\""), ("Perfect 5th", "G4", "\"Twinkle, twinkle\""),
                  ("Octave", "C5", "\"Some-where over the rainbow\"")]
    b, y = intervals(piano_rows, "p")
    D["common/intervals-from-c.svg"] = svg(y, "Intervals with reference songs",
        "Keyboards showing intervals up from C: major 2nd to D (Happy Birthday), major 3rd to E (Oh When the Saints), perfect 4th to F (Here Comes the Bride), perfect 5th to G (Twinkle Twinkle), octave to the next C (Somewhere Over the Rainbow).", b)
    b, y = intervals(piano_rows[1:], "v")
    D["vocal/intervals.svg"] = svg(y, "Intervals with reference songs",
        "Keyboards showing intervals up from C: major 3rd to E (Oh When the Saints), perfect 4th to F (Here Comes the Bride), perfect 5th to G (Twinkle Twinkle), octave to the next C (Somewhere Over the Rainbow).", b)

    # ── chord symbols ──
    b = title("Reading chord symbols — all on C")
    rows = [("C", ["C4", "E4", "G4"], "major triad"), ("Cm", ["C4", "Eb4", "G4"], "minor: the 3rd drops"),
            ("C7", ["C4", "E4", "G4", "Bb4"], "add the flattened 7th"), ("Cmaj7", ["C4", "E4", "G4", "B4"], "add the major 7th"),
            ("Csus4", ["C4", "F4", "G4"], "4th replaces the 3rd"), ("C/E", ["E3", "C4", "E4", "G4"], "E in the bass")]
    y = 64
    for i, (sym, notes, sub) in enumerate(rows):
        col, row = i % 2, i // 2
        x0, yy = 20 + col * 310, y + row * 150
        k, kw, pos = keyboard(x0 + 92, yy + 6, "E3" if sym == "C/E" else "C4", "C5", {n: GOLD for n in notes}, 15 if sym == "C/E" else 24, 80, names=False)
        b += text(x0, yy + 40, sym, 22, 900) + k
        b += text(x0, yy + 112, " ".join(pretty(n) for n in notes), 17, 800, INK)
        b += text(x0, yy + 134, sub, 16, 600, INK2)
    D["piano/chord-symbols.svg"] = svg(y + 450 - 6, "Chord symbols on C",
        "Six chord symbols spelled on the keyboard: C is C E G; Cm is C E-flat G; C7 is C E G B-flat; Cmaj7 is C E G B; Csus4 is C F G; C/E is a C chord with E as the lowest note.", b)

    # ── Y2: F major fingering ──
    b = title("F major, right hand: finger 4 on B♭")
    notes = ["F4", "G4", "A4", "Bb4", "C5", "D5", "E5", "F5"]
    k, kw, pos = keyboard(70, 110, "F4", "F5", {n: GOLD_SOFT for n in notes}, 62, 150, fingers=dict(zip(notes, [1, 2, 3, 4, 1, 2, 3, 4])), finger_y=88)
    b += k + pill(pos[midi("Bb4")], 290, "B♭", GOLD)
    b += text(70, 330, "The thumb never plays a black key in standard scale fingering, so", 16, 600)
    b += text(70, 354, "the thumb turns under onto C, after B♭.", 16, 600)
    D["piano/f-major-fingering.svg"] = svg(364, "F major scale fingering, right hand",
        "F major from F to F: F G A B-flat C D E F with right-hand fingering 1 2 3 4 1 2 3 4; finger 4 plays B-flat and the thumb turns under onto C.", b)

    # ── arpeggio ──
    b = title("C major arpeggio, two octaves")
    notes = ["C4", "E4", "G4", "C5", "E5", "G5", "C6"]
    k, kw, pos = keyboard(30, 110, "C4", "C6", {n: GOLD for n in notes}, 38.6, 130, names="marked", fingers=dict(zip(notes, [1, 2, 3, 1, 2, 3, 5])), finger_y=88)
    b += k + text(10, 94, "RH", 16, 800)
    for n, f in zip(notes, [5, 4, 2, 1, 4, 2, 1]):
        b += circle(pos[midi(n)], 270, 13, TEAL_SOFT, INK, 1.4) + text(pos[midi(n)], 276, str(f), 16, 800, INK, "middle")
    b += text(10, 276, "LH", 16, 800)
    b += text(30, 314, "RH 1 2 3 – 1 2 3 – 5; LH 5 4 2 – 1 4 2 – 1. The arm travels with them.", 16, 600)
    D["piano/c-arpeggio.svg"] = svg(324, "Two-octave C major arpeggio fingering",
        "C E G C E G C over two octaves. Right hand fingering 1 2 3, 1 2 3, 5 above; left hand 5 4 2, 1 4 2, 1 below.", b)

    # ── grand staff ──
    b = title("The grand staff: treble and bass together")
    tr = Staff(70, 70, 550).lines().clef_glyph()
    bs = Staff(70, 210, 550, "bass").lines().clef_glyph()
    b += f'<path d="M58 70 C40 90 56 140 40 155 C56 170 40 220 58 266" fill="none" stroke="{INK}" stroke-width="4"/>'
    b += line(70, 70, 70, 266, INK, 1.5)
    tl = ["E4", "G4", "B4", "D5", "F5"]; tsp = ["F4", "A4", "C5", "E5"]
    bl = ["G2", "B2", "D3", "F3", "A3"]; bsp = ["A2", "C3", "E3", "G3"]
    for i, n in enumerate(tl):
        tr.note(150 + i * 34, n, "w")
    for i, n in enumerate(tsp):
        tr.note(350 + i * 34, n, "w")
    for i, n in enumerate(bl):
        bs.note(150 + i * 34, n, "w")
    for i, n in enumerate(bsp):
        bs.note(350 + i * 34, n, "w")
    tr.note(550, "C4", "w", fill=GOLD)
    bs.note(550, "C4", "w")
    b += tr.svg() + bs.svg()
    b += text(218, 160, "lines E G B D F", 16, 700, INK2, "middle") + text(401, 160, "spaces F A C E", 16, 700, INK2, "middle")
    b += text(218, 296, "lines G B D F A", 16, 700, INK2, "middle") + text(401, 296, "spaces A C E G", 16, 700, INK2, "middle")
    b += text(560, 176, "middle C", 16, 800, INK, "middle")
    b += text(20, 330, "Middle C sits on one ledger line, below the treble staff or above the bass staff.", 16, 600)
    D["common/grand-staff.svg"] = svg(340, "The grand staff",
        "Treble staff above bass staff, joined by a brace. Treble lines E G B D F, spaces F A C E. Bass lines G B D F A, spaces A C E G. Middle C on a ledger line between them, written either below the treble or above the bass staff.", b)

    # ── chord family (C and G) on the staff ──
    def family(key):
        if key == "C":
            roots = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"]
            scale = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5"]
            names = ["C", "Dm", "Em", "F", "G", "Am", "B°"]
        else:
            roots = ["G4", "A4", "B4", "C5", "D5", "E5", "F#5"]
            scale = ["G4", "A4", "B4", "C5", "D5", "E5", "F#5", "G5", "A5", "B5", "C6"]
            names = ["G", "Am", "Bm", "C", "D", "Em", "F♯°"]
        nums = ["I", "ii", "iii", "IV", "V", "vi", "vii°"]
        b = title(f"The chord family of {key} major")
        st = Staff(20, 110, 600).lines().clef_glyph()
        x0 = 100
        if key == "G":
            st.keysig(70, ["F5"])
            x0 = 115
        for i in range(7):
            ch = [scale[i], scale[i + 2], scale[i + 4]]
            x = x0 + i * 72
            for n in ch:
                st.head(x, n, "whole")
            b += text(x, 236, nums[i], 18, 800, INK, "middle") + text(x, 262, names[i], 18, 800, BLUE if i in (1, 2, 5) else (CORAL_INK if i == 6 else INK), "middle")
        b += st.svg()
        b += text(20, 300, "major – minor – minor – major – major – minor – diminished, in every major key.", 16, 600)
        return b
    b = family("C")
    D["piano/chord-family-c.svg"] = svg(310, "Chords of C major",
        "Triads on every note of C major on the treble staff: I C, ii D minor, iii E minor, IV F, V G, vi A minor, vii diminished B.", b)
    b = family("G")
    D["guitar/chord-family-g.svg"] = svg(310, "Chords of G major",
        "Triads on every note of G major, key signature one sharp: I G, ii A minor, iii B minor, IV C, V D, vi E minor, vii diminished F sharp.", b)

    # ── compound time & swing (piano w7, guitar w7) ──
    b = title("Simple time, compound time, and swing")
    def bar(y, lab, counts, groups, sub):
        o = text(20, y + 24, lab, 18, 800) + text(20, y + 48, sub, 16, 600, INK2)
        n = len(counts)
        cw = 440 / n
        for i, c in enumerate(counts):
            big = i in groups
            cx = 180 + i * cw
            o += rect(cx + 1, y, cw - 2, 52, GOLD if big else SOFT, LINE, 4) + text(cx + cw / 2, y + 33, c, 18 if big else 16, 800 if big else 600, INK, "middle")
        return o
    b += bar(60, "4/4", ["1", "&", "2", "&", "3", "&", "4", "&"], {0, 2, 4, 6}, "each beat in 2")
    b += bar(140, "6/8", ["1", "2", "3", "4", "5", "6"], {0, 3}, "2 beats, each in 3")
    b += bar(220, "12/8", ["1", "2", "3", "2", "2", "3", "3", "2", "3", "4", "2", "3"], {0, 3, 6, 9}, "4 beats, each in 3")
    # swing: one beat split into triplet thirds, long-short
    y = 310
    b += text(20, y + 24, "Swing", 18, 800) + text(20, y + 48, "long – short", 16, 600, INK2)
    for k in range(4):
        cx = 180 + k * 110
        b += rect(cx + 1, y, 72, 52, GOLD_SOFT, LINE, 4) + rect(cx + 75, y, 34, 52, SOFT, LINE, 4)
        b += text(cx + 37, y + 33, str(k + 1), 18, 800, INK, "middle") + text(cx + 92, y + 33, "a", 16, 600, INK, "middle")
    b += text(20, 400, "Swing: a beat split like a triplet — long (two thirds), short (one third).", 16, 600)
    D["common/compound-time-swing.svg"] = svg(410, "Simple time, compound time and swing",
        "4/4 counted 1 and 2 and 3 and 4 and; 6/8 counted 1 2 3 4 5 6 with big beats on 1 and 4; 12/8 with four big beats each split into three; and swing, where each beat is a long note two-thirds of the beat and a short note one-third.", b)

    # ── 12-bar blues ──
    def twelve(key):
        I, IV, V = {"C": ("C", "F", "G"), "A": ("A", "D", "E")}[key]
        ch = [I, I, I, I, IV, IV, I, I, V, IV, I, V]
        nm = ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"]
        b = title(f"The 12-bar blues in {key}")
        for i in range(12):
            r, c = i // 4, i % 4
            x, y = 20 + c * 150, 60 + r * 86
            fill = GOLD_SOFT if nm[i] == "I" else (TEAL_SOFT if nm[i] == "IV" else "#fcd9cf")
            b += rect(x, y, 142, 76, fill, INK, 8, 1.2)
            b += text(x + 12, y + 26, f"bar {i + 1}", 16, 600, INK2) + text(x + 71, y + 58, f"{ch[i]}  ({nm[i]})", 20, 800, INK, "middle")
        b += text(20, 340, f"Bar 12 is the turnaround: {V} ({'V'}) pulls back to bar 1. Often played as {I}7, {IV}7, {V}7.", 16, 600)
        return b
    D["piano/twelve-bar-c.svg"] = svg(350, "12-bar blues in C",
        "Twelve bars in three rows of four: C C C C, F F C C, G F C G — I I I I, IV IV I I, V IV I V. The last bar's G is the turnaround.", twelve("C"))
    D["guitar/twelve-bar-a.svg"] = svg(350, "12-bar blues in A",
        "Twelve bars in three rows of four: A A A A, D D A A, E D A E — I I I I, IV IV I I, V IV I V. The last bar's E is the turnaround.", twelve("A"))

    # ── seventh chords ──
    b = title("Four kinds of seventh chord on C")
    b += kb_row([("Cmaj7", ["C4", "E4", "G4", "B4"], GOLD, "dreamy"), ("C7", ["C4", "E4", "G4", "Bb4"], GOLD, "bluesy, wants F")], 110, ww=24, lo="C4", hi="C5", gap=40)
    b += kb_row([("Cm7", ["C4", "Eb4", "G4", "Bb4"], TEAL, "smooth"), ("Cm7♭5 (Cø)", ["C4", "Eb4", "Gb4", "Bb4"], TEAL, "the minor-key ii")], 370, ww=24, lo="C4", hi="C5", gap=40)
    D["piano/seventh-chords.svg"] = svg(540, "Seventh chords on C",
        "Cmaj7 is C E G B; C7 is C E G B-flat; Cm7 is C E-flat G B-flat; C half-diminished is C E-flat G-flat B-flat.", b)

    # ── pedalling ──
    b = title("Legato pedalling: change just AFTER the new chord")
    chords = [("C", 110), ("F", 270), ("G", 430), ("C", 560)]
    b += line(80, 110, 620, 110, LINE, 1.2)
    for nm, x in chords:
        b += rect(x - 26, 86, 52, 40, GOLD, INK, 6, 1.2) + text(x, 113, nm, 18, 800, INK, "middle")
    b += text(20, 112, "Hands", 16, 800)
    # pedal line: down from just after chord, up-down V just after each new chord
    pts = [(80, 200)]
    pts += [(120, 200), (126, 160)]
    for nm, x in chords[1:]:
        pts += [(x + 4, 160), (x + 12, 200), (x + 20, 160)]
    pts += [(610, 160)]
    d = "M" + " L".join(f"{a} {c}" for a, c in pts)
    b += f'<path d="{d}" fill="none" stroke="{BLUE}" stroke-width="3" stroke-linejoin="round"/>'
    b += text(20, 166, "Pedal", 16, 800) + text(626, 150, "down", 16, 700, BLUE, "end") + text(626, 222, "up", 16, 700, BLUE, "end")
    for nm, x in chords[1:]:
        b += arrow(x + 12, 250, x + 12, 206, INK2, 2)
    b += text(320, 272, "lift and press again as the new chord sounds — no gap, no blur", 16, 700, INK, "middle")
    D["piano/legato-pedal.svg"] = svg(282, "Legato pedalling",
        "A timeline of chords C, F, G, C. The pedal goes down after the first chord; at each new chord it comes up and goes straight back down just after the new chord is played, so the old harmony clears without a gap.", b)

    # ── minor ii–V–i ──
    b = title("The minor ii – V – i in A minor")
    b += kb_row([("ii  Bm7♭5", ["B3", "D4", "F4", "A4"], TEAL), ("V  E7", ["E4", "G#4", "B4", "D5"], GOLD), ("i  Am7", ["A3", "C4", "E4", "G4"], TEAL)],
                110, ww=19, lo="A3", hi="E5", gap=14)
    b += text(320, 270, "G♯ in E7 is the leading note: a semitone below A, pulling home.", 16, 600, INK, "middle")
    D["piano/minor-ii-v-i.svg"] = svg(280, "Minor ii-V-i in A minor",
        "Three keyboards: B half-diminished seventh B D F A, E7 E G-sharp B D, A minor seventh A C E G.", b)

    # ── gospel: walk-up and F/G ──
    b = title("Two gospel moves in C")
    b += kb_row([("Walk-up into IV", ["C3", "D3", "E3", "F3"], GOLD, "C, D, E … land on F")], 110, ww=24, lo="C3", hi="B3", x0=30)
    b += kb_row([("F/G", ["G3", "F4", "A4", "C5"], TEAL, "F triad over G bass"), ("→ C", ["C4", "E4", "G4"], GOLD, "resolves home")], 110, ww=13.5, lo="G3", hi="E5", gap=14, x0=250)
    D["piano/gospel-moves.svg"] = svg(270, "Gospel walk-up and the F over G chord",
        "Left: the bass walks up C, D, E and lands on F on beat 1 of the IV chord. Right: an F major triad over G in the bass, F/G, resolving to C major.", b)

    # ── 3-3-2 ──
    b = title("The 3-3-2 feel of Afrobeats")
    g, gx, cw = count_grid(20, 60, ["1", "&", "2", "&", "3", "&", "4", "&"], [("Accents", {0: "X", 3: "X", 6: "X"})], width=600)
    b += g
    b += text(gx + 1.5 * cw, 170, "3", 20, 900, INK, "middle") + text(gx + 4.5 * cw, 170, "3", 20, 900, INK, "middle") + text(gx + 7 * cw, 170, "2", 20, 900, INK, "middle")
    b += line(gx + 4, 150, gx + 3 * cw - 4, 150, INK2, 2) + line(gx + 3 * cw + 4, 150, gx + 6 * cw - 4, 150, INK2, 2) + line(gx + 6 * cw + 4, 150, gx + 8 * cw - 4, 150, INK2, 2)
    b += text(20, 206, "Eight quavers grouped 3 + 3 + 2: accents on the 1st, 4th and 7th.", 16, 600)
    D["common/three-three-two.svg"] = svg(216, "The 3-3-2 rhythm",
        "A bar of eight quavers counted 1 and 2 and 3 and 4 and, grouped 3 + 3 + 2, with accents on the first, fourth and seventh quavers: beat 1, the 'and' of 2, and beat 4.", b)

    # ── SATB score ──
    b = title("Four parts on two staves (SATB)")
    tr = Staff(150, 80, 470).lines().clef_glyph()
    bs = Staff(150, 200, 470, "bass").lines().clef_glyph()
    b += f'<path d="M140 80 C122 100 138 140 122 150 C138 160 122 210 140 256" fill="none" stroke="{INK}" stroke-width="4"/>'
    b += line(150, 80, 150, 256, INK, 1.5)
    for i, (s, a, t, bb) in enumerate([("E5", "C5", "G3", "C3"), ("F5", "C5", "A3", "F2"), ("D5", "B4", "G3", "G2"), ("E5", "C5", "G3", "C3")]):
        x = 260 + i * 95
        tr.note(x, s, "q", stem="up"); tr.note(x, a, "q", stem="down")
        bs.note(x, t, "q", stem="up"); bs.note(x, bb, "q", stem="down")
    b += tr.svg() + bs.svg()
    b += text(20, 104, "Soprano ↑", 16, 800) + text(20, 132, "Alto ↓", 16, 800)
    b += text(20, 224, "Tenor ↑", 16, 800) + text(20, 252, "Bass ↓", 16, 800)
    b += text(20, 324, "On each staff the higher part has stems up, the lower part stems down.", 16, 600)
    D["piano/satb-score.svg"] = svg(334, "Reading an SATB short score",
        "A treble staff with soprano (stems up) and alto (stems down), a bass staff with tenor (stems up) and bass (stems down). Four chords: C, F, G, C.", b)

    # ── modes: Dorian and Mixolydian ──
    b = title("Two modes for improvising — white keys only")
    for i, (name, lo, hi, char, sub) in enumerate([("D Dorian", "D4", "D5", "B4", "minor, with a major 6th (B) — over Dm7"),
                                                   ("G Mixolydian", "G4", "G5", "F5", "major, with a flat 7th (F) — over G7")]):
        y = 70 + i * 150
        notes = []
        m = midi(lo)
        while m <= midi(hi):
            if not is_black(m):
                notes.append(m)
            m += 1
        k, kw, pos = keyboard(260, y, lo, hi, {char: GOLD}, 42, 100, names=True)
        b += k
        for nm in notes:
            pass
        b += text(pos[midi(char)], y + 90, char[0], 16, 800, INK, "middle") if False else ""
        b += text(20, y + 40, name, 20, 800) + text(20, y + 66, "the note that gives", 16, 600, INK2) + text(20, y + 88, "it its colour: gold", 16, 600, INK2)
        b += text(260, y + 124, sub, 16, 600)
    D["piano/dorian-mixolydian.svg"] = svg(360, "Dorian and Mixolydian modes",
        "D Dorian: D E F G A B C D on the white keys, a minor scale whose B (a major 6th) gives its colour; use it over Dm7. G Mixolydian: G A B C D E F G, a major scale whose F (a flat 7th) gives its colour; use it over G7.", b)

    # ── MIDI vs audio ──
    b = title("MIDI stores what you played; audio stores the sound")
    b += rect(20, 60, 290, 210, SOFT, LINE, 10) + text(165, 90, "MIDI", 20, 800, INK, "middle")
    for i, (n, x0, x1) in enumerate([("C4", 40, 120), ("E4", 120, 170), ("G4", 170, 280)]):
        y = 190 - i * 34
        b += rect(x0, y, x1 - x0 - 4, 24, GOLD, INK, 4, 1)
        b += text(x0 + 8, y + 18, n, 16, 800)
    b += text(165, 250, "note, velocity, start, length", 16, 600, INK2, "middle")
    b += rect(330, 60, 290, 210, SOFT, LINE, 10) + text(475, 90, "Audio", 20, 800, INK, "middle")
    pts = []
    for i in range(0, 260, 3):
        amp = 50 * math.exp(-((i % 90) / 60)) * math.sin(i * 0.5)
        pts.append(f"{345 + i} {165 + amp:.1f}")
    b += f'<path d="M{" L".join(pts)}" fill="none" stroke="{BLUE}" stroke-width="2"/>'
    b += text(475, 250, "the sound wave itself", 16, 600, INK2, "middle")
    b += text(20, 300, "With MIDI you can change the instrument, fix a wrong note or the timing later;", 16, 600)
    b += text(20, 324, "with audio you cannot change the instrument.", 16, 600)
    D["piano/midi-vs-audio.svg"] = svg(334, "MIDI versus audio",
        "Left: a MIDI recording as note bars (C, E, G) holding note, velocity, start and length. Right: an audio recording as a sound wave. MIDI can be re-voiced and edited note by note; audio cannot change instrument.", b)

    # ── ternary form with modulation ──
    b = title("Ternary form: A – B – A, with a trip to a related key")
    secs = [("A", "home key: C major", GOLD, 20, 180), ("B", "contrast: G or A minor", TEAL_SOFT, 210, 220), ("A", "C again + coda", GOLD, 440, 180)]
    for lab, sub, fill, x, w in secs:
        b += rect(x, 70, w, 110, fill, INK, 10, 1.4) + text(x + w / 2, 120, lab, 32, 900, INK, "middle") + text(x + w / 2, 160, sub, 16, 700, INK, "middle")
    b += arrow(150, 200, 260, 200) + text(205, 226, "D7 → G (or E7 → Am)", 16, 700, INK, "middle")
    b += arrow(380, 200, 490, 200) + text(435, 226, "G7 → C", 16, 700, INK, "middle")
    b += text(20, 270, "The new key's V makes it sound like home; the old key's V brings you back.", 16, 600)
    D["piano/ternary-form.svg"] = svg(280, "Ternary form with modulation",
        "Three blocks: A in the home key C major; B in a related key, reached with D7 to G or E7 to A minor; A again in C, reached with G7 to C, with a coda.", b)

    # ── extended ii–V–I ──
    b = title("ii – V – I with extended chords in C")
    b += kb_row([("Dm9", ["D3", "F4", "A4", "C5", "E5"], TEAL, "D | F A C E"), ("G13", ["G2", "F4", "B4", "E5"], GOLD, "G | F B E"),
                 ("Cmaj9", ["C3", "E4", "G4", "B4", "D5"], GOLD, "C | E G B D")], 110, ww=10.5, lo="G2", hi="F5", gap=16)
    b += text(320, 280, "Left hand: the root. Right hand: the 3rd and 7th, plus the colour note.", 16, 600, INK, "middle")
    D["piano/extended-ii-v-i.svg"] = svg(290, "Dm9, G13, Cmaj9",
        "Dm9: D in the left hand, F A C E in the right. G13: G in the left hand, F B E in the right — 7th, 3rd and 13th. Cmaj9: C in the left hand, E G B D in the right.", b)

    # ── numbers / transposition ──
    b = title("Think in numbers: one song, three keys")
    hdr = ["", "1", "5", "6m", "4"]
    rows = [("in C", ["C", "G", "Am", "F"]), ("in D", ["D", "A", "Bm", "G"]), ("in B♭", ["B♭", "F", "Gm", "E♭"])]
    for j, h in enumerate(hdr):
        if h:
            b += rect(120 + (j - 1) * 125, 60, 117, 44, GOLD, INK, 8, 1.2) + text(178 + (j - 1) * 125, 90, h, 22, 900, INK, "middle")
    for i, (k, chs) in enumerate(rows):
        y = 116 + i * 54
        b += text(20, y + 30, k, 18, 800)
        for j, c in enumerate(chs):
            b += rect(120 + j * 125, y, 117, 44, SOFT, LINE, 8) + text(178 + j * 125, y + 30, c, 20, 800, INK, "middle")
    b += text(20, 302, "To modulate up a tone for the last chorus (C to D): play A7, the V of D, then D.", 16, 600)
    D["common/numbers-transpose.svg"] = svg(312, "Transposing with chord numbers",
        "The progression 1-5-6m-4 is C G Am F in C, D A Bm G in D, and B-flat F Gm E-flat in B-flat. To move from C to D, play A7, the V of D.", b)

    # ── Autumn Leaves ii–V ──
    b = title("\"Autumn Leaves\": chains of ii – V – I")
    chs = ["Cm7", "F7", "B♭maj7", "E♭maj7", "Am7♭5", "D7", "Gm"]
    for i, c in enumerate(chs):
        x = 20 + i * 86
        b += rect(x, 90, 80, 50, GOLD_SOFT if i < 4 else TEAL_SOFT, INK, 8, 1.2) + text(x + 40, 122, c, 17, 800, INK, "middle")
    b += f'<path d="M24 160 L24 172 L274 172 L274 160" fill="none" stroke="{INK}" stroke-width="2"/>' + text(149, 198, "ii – V – I in B♭ major", 16, 800, INK, "middle")
    b += f'<path d="M368 160 L368 172 L618 172 L618 160" fill="none" stroke="{INK}" stroke-width="2"/>' + text(493, 198, "ii – V – i in G minor", 16, 800, INK, "middle")
    b += text(20, 240, "The major ii–V–I and its relative minor ii–V–i, one after the other.", 16, 600)
    D["common/autumn-leaves.svg"] = svg(250, "Autumn Leaves chord sequence",
        "Cm7, F7, B-flat maj7 form a ii-V-I in B-flat major; then E-flat maj7; then Am7 flat 5, D7, G minor form a ii-V-i in G minor.", b)

    # ── reharm: descending bass ──
    b = title("Changing the bass: a line that walks down")
    chs = ["C", "C/B", "Am", "Am/G"]
    bass = ["C3", "B2", "A2", "G2"]
    st = Staff(20, 130, 600, "bass").lines().clef_glyph()
    for i, (c, n) in enumerate(zip(chs, bass)):
        x = 140 + i * 120
        st.note(x, n, "h")
        b += text(x, 100, c, 20, 800, INK, "middle")
    b += st.svg()
    b += text(20, 270, "The chords barely change; the bass steps C – B – A – G and moves it.", 16, 600)
    D["common/descending-bass.svg"] = svg(280, "Descending bass line under C and Am",
        "Chord symbols C, C/B, Am, Am/G above a bass staff whose notes walk down C, B, A, G as minims.", b)

    return D
