"""
Diagrams for the music Learn courses, and the lines in the lesson bodies that show them.

  assets/learn-media/music/{piano,guitar,common,drums,violin,sax,vocal,production}/*.svg
  api/_lib/seeds/curriculum-music-piano-guitar-2026.json   (Piano, Guitar — 144 lessons)
  api/_lib/seeds/curriculum-instruments-2026.json           (Drums, Violin, Saxophone, Vocal Training, Music Production)

Run:  python3 tools/learn-media/music.py

WHY THESE PICTURES AND NOT OTHERS (Mayer's multimedia principles). A diagram goes where the lesson asks the
learner to hold a spatial or symbolic thing in their head — which key, which finger, which fret, which count —
and nowhere else (coherence: no decoration). It sits directly after the paragraph it explains (spatial
contiguity), carries its own labels instead of a legend (signalling), and its alt text states the information,
not the picture. Lessons that already draw the same thing with an interactive ```keys / ```chord / ```staff block
are not given a second copy (redundancy) — the SVG adds what the block cannot: fingering, rhythm, form, a
fretboard shape, a fingering chart.

IDEMPOTENT. Every image line this script owns points at media:music/…; each run first removes those lines (and
the italic caption under each) and then inserts the current plan, so editing PLAN and re-running is safe. Every
other key and the files' formatting (indent 2, UTF-8, trailing newline) are kept byte-for-byte.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import music_figs_keys, music_figs_guitar, music_figs_inst  # noqa: E402

OUT = os.path.join(ROOT, "assets", "learn-media", "music")
PG = os.path.join(ROOT, "api", "_lib", "seeds", "curriculum-music-piano-guitar-2026.json")
INST = os.path.join(ROOT, "api", "_lib", "seeds", "curriculum-instruments-2026.json")

# (course, year, week): [(anchor text in the paragraph the picture follows, svg path, alt text, caption or None)]
PLAN = {
    # ── Piano, Year 1 ──
    ("Piano", 1, 1): [("The black keys come in alternating groups", "piano/keyboard-map.svg",
                       "Keyboard map: C is the white key just left of each group of two black keys, F just left of each group of three; middle C marked", None),
                      ("**Finger numbers** are the same on both hands", "piano/finger-numbers.svg",
                       "Finger numbers on both hands: thumb 1, index 2, middle 3, ring 4, little finger 5", None)],
    ("Piano", 1, 2): [("**Fingering** makes scales smooth", "piano/c-major-fingering.svg",
                       "C major scale: right hand 1 2 3 1 2 3 4 5, left hand 5 4 3 2 1 3 2 1; steps tone tone semitone tone tone tone semitone",
                       "Read the steps under the keys: the two semitones are E–F and B–C.")],
    ("Piano", 1, 3): [("**V** — built on note 5", "piano/c-chords-I-IV-V.svg",
                       "Chords I, IV and V in C: C–E–G, F–A–C and G–B–D, each with fingers 1 3 5", None)],
    ("Piano", 1, 4): [("**Staccato** (\"detached\")", "piano/legato-staccato.svg",
                       "Legato written as a slur over C D E F G; staccato written as a dot on each note", None)],
    ("Piano", 1, 5): [("A popular broken-chord pattern is the **Alberti bass**", "piano/alberti-bass.svg",
                       "Bass clef: a blocked C chord (C E G together), then Alberti bass in quavers C G E G C G E G", None)],
    ("Piano", 1, 6): [("This is called **voice leading**", "piano/voice-leading-I-IV-V-I.svg",
                       "I–IV–V–I in C with smooth voice leading: C–E–G, C–F–A, B–D–G, C–E–G", None)],
    ("Piano", 1, 7): [("**Reading chord symbols:**", "piano/chord-symbols.svg",
                       "Chord symbols on C: C is C E G; Cm C E♭ G; C7 C E G B♭; Cmaj7 C E G B; Csus4 C F G; C/E has E in the bass", None)],
    ("Piano", 1, 8): [("**Two-octave scales** build reach", "piano/c-major-two-octaves.svg",
                       "Two-octave C major, right hand: 1 2 3 1 2 3 4, 1 2 3 1 2 3 4 5; thumb under onto F and C", None),
                      ("**Reggae piano (or organ)**", "piano/reggae-skank.svg",
                       "Reggae skank: chords on every 'and' of 1 and 2 and 3 and 4 and; kick on 1 and 3", None)],
    ("Piano", 1, 11): [("Each has a matching **rest**", "common/note-values.svg",
                        "Note values in 4/4 with their rests: semibreve 4 beats, minim 2, crotchet 1, quaver half a beat", None)],
    ("Piano", 1, 13): [("**The circle of fifths** arranges all 12 keys", "common/circle-of-fifths.svg",
                        "Circle of fifths: C, G, D, A, E, B, F♯/G♭, D♭, A♭, E♭, B♭, F with their sharps or flats and relative minors inside", None)],
    ("Piano", 1, 14): [("**Three forms of the minor scale**", "common/a-minor-three-forms.svg",
                        "A minor three ways: natural A B C D E F G A; harmonic raises G to G♯; melodic going up raises F and G to F♯ and G♯", None)],
    ("Piano", 1, 15): [("**Second inversion**", "piano/c-inversions.svg",
                        "C major in root position C–E–G, first inversion E–G–C (C/E) and second inversion G–C–E (C/G)", None)],
    ("Piano", 1, 16): [("**Why it works:** it moves between major chords", "piano/pop-progression.svg",
                        "Pop progression in C with smooth right-hand voicings: C (C–E–G), G (B–D–G), Am (C–E–A), F (C–F–A)", None)],
    ("Piano", 1, 18): [("Use songs **you** know best", "common/intervals-from-c.svg",
                        "Intervals from C with reference songs: major 2nd D, major 3rd E, perfect 4th F, perfect 5th G, octave C", None)],
    ("Piano", 1, 21): [("**Frequency space:**", "piano/band-registers.svg",
                        "Typical band ranges: bass guitar E1–G3, guitar chords E2–E5, singers C3–C6; band keys stay in the middle, C3–C6", None)],
    # ── Guitar, Year 1 ──
    ("Guitar", 1, 1): [("**C major in open position:**", "guitar/c-major-a-minor-open.svg",
                        "C major and A minor in open position on the fretboard, every note named, open strings left of the nut", None)],
    ("Guitar", 1, 3): [("**The F problem.**", "guitar/easy-f.svg",
                        "Easy F: index across B and high E at fret 1, middle finger G fret 2, ring finger D fret 3; low E and A not played", None),
                       ("**Strum pattern: D – DU – UDU**", "guitar/strum-d-du-udu.svg",
                        "Strum D – DU – UDU over 1 & 2 & 3 & 4 &: down 1, down 2, up, miss on 3, up, down 4, up", None)],
    ("Guitar", 1, 4): [("**One octave of G major in open position:**", "guitar/g-major-e-minor-open.svg",
                        "G major and E minor in open position, every note named; F♯ on the D string fret 4 and low E fret 2", None)],
    ("Guitar", 1, 6): [("**Shape 1 at the 5th fret", "guitar/a-minor-pentatonic.svg",
                        "A minor pentatonic shape 1, frets 5 to 8, with the root A marked on low E fret 5, D fret 7 and high E fret 5", None)],
    ("Guitar", 1, 7): [("**Structure markings:**", "guitar/lead-sheet-roadmap.svg",
                        "Four bars between repeat signs with first and second endings, and the order they are played in", None)],
    ("Guitar", 1, 8): [("**On the guitar:**", "guitar/a-minor-three-forms.svg",
                        "A natural, harmonic and melodic minor in open position: G becomes G♯ on G string fret 1; for melodic, F also becomes F♯ on D string fret 4", None)],
    ("Guitar", 1, 11): [("Pattern **D – DU – UDU** in 4/4", "guitar/strum-pendulum.svg",
                         "Pendulum strumming: the hand moves down on every beat and up on every 'and', missing the strings on beat 3", None)],
    ("Guitar", 1, 13): [("**The E-shape barre:**", "guitar/barre-e-shape.svg",
                         "E-shape barre: F at fret 1 (133211); the same shape at fret 3 is G, 5 A, 6 B♭, 8 C", None)],
    ("Guitar", 1, 14): [("**Pattern p–i–m–a–m–i**", "guitar/pima-pattern.svg",
                         "Tab of p–i–m–a–m–i over C: thumb A string fret 3, then open G, B fret 1, open E, B fret 1, open G", None)],
    ("Guitar", 1, 15): [("**Try it:** play the pop progression using only **two notes**", "guitar/afrobeats-double-stops.svg",
                         "Two-note shapes on the B and high E strings: G (open B + fret 3), D (fret 3 + fret 2), Em (both open), C (fret 1 + open)", None)],
    ("Guitar", 1, 16): [("**Try:** play C – F – G – C", "guitar/highlife-thirds.svg",
                         "Thirds on the G and B strings: G+B open, A+C at frets 2 and 1, B+D at 4 and 3, C+E at 5 and 5", None)],
    ("Guitar", 1, 17): [("**The capo** clamps across", "guitar/capo.svg",
                         "Capo 2 with G shapes sounds in A; capo 3 with G shapes in B♭; capo 2 with C shapes in D", None),
                        ("**Sus chords**", "guitar/d-sus-chords.svg",
                         "D (xx0232), Dsus4 (xx0233, little finger on high E fret 3) and Dsus2 (xx0230, high E open)", None)],
    ("Guitar", 1, 19): [("**Vibrato** — small repeated bends", "guitar/lead-techniques-tab.svg",
                         "Tab in the A minor pentatonic: hammer-on 5h7 on G, pull-off 8p5 on B, slide 5/7 on D, whole-step bend from fret 7 to the pitch of fret 9 on G, vibrato on high E fret 5", None)],
    ("Guitar", 1, 22): [("A common order: **Verse – Chorus", "guitar/song-form.svg",
                         "Song form: Verse, Chorus, Verse, Chorus, Bridge, Chorus", None)],
    # ── Piano, Year 2 ──
    ("Piano", 2, 2): [("**F major** — right hand", "piano/f-major-fingering.svg",
                       "F major right hand: 1 2 3 4 1 2 3 4, finger 4 on B♭, thumb under onto C", None)],
    ("Piano", 2, 3): [("**C major arpeggio, root position, two octaves:**", "piano/c-arpeggio.svg",
                       "Two-octave C major arpeggio: right hand 1 2 3 1 2 3 5, left hand 5 4 2 1 4 2 1", None)],
    ("Piano", 2, 4): [("**Treble clef:** lines", "common/grand-staff.svg",
                       "Grand staff: treble lines E G B D F and spaces F A C E; bass lines G B D F A and spaces A C E G; middle C on a ledger line between", None)],
    ("Piano", 2, 5): [("This pattern — **major, minor, minor", "piano/chord-family-c.svg",
                       "Triads on each note of C major: I C, ii Dm, iii Em, IV F, V G, vi Am, vii° B diminished", None)],
    ("Piano", 2, 7): [("**Swing** is a way of playing", "common/compound-time-swing.svg",
                       "4/4 in twos, 6/8 as two beats of three, 12/8 as four beats of three, and swing as long–short triplet pairs", None)],
    ("Piano", 2, 8): [("(I I I I | IV IV I I | V IV I V)", "piano/twelve-bar-c.svg",
                       "12-bar blues in C: C C C C | F F C C | G F C G", None)],
    ("Piano", 2, 9): [("**Half-diminished (Cm7♭5 / Cø)**", "piano/seventh-chords.svg",
                       "Seventh chords on C: Cmaj7 C E G B; C7 C E G B♭; Cm7 C E♭ G B♭; Cm7♭5 C E♭ G♭ B♭", None)],
    ("Piano", 2, 10): [("The pedal change comes **just after**", "piano/legato-pedal.svg",
                        "Legato pedalling: at each new chord the pedal comes up and goes straight back down just after the chord sounds", None)],
    ("Piano", 2, 13): [("**The minor ii–V–i**", "piano/minor-ii-v-i.svg",
                        "Minor ii–V–i in A minor: Bm7♭5 B D F A, E7 E G♯ B D, Am7 A C E G", None)],
    ("Piano", 2, 14): [("**Three foundational fills:**", "piano/gospel-moves.svg",
                        "Gospel moves in C: bass walk-up C D E into F; F triad over G bass (F/G) resolving to C", None)],
    ("Piano", 2, 15): [("This tresillo-like pattern", "common/three-three-two.svg",
                        "3-3-2: eight quavers grouped 3+3+2, accents on 1, the 'and' of 2, and 4", None)],
    ("Piano", 2, 16): [("**Reading an SATB score:**", "piano/satb-score.svg",
                        "SATB short score: soprano stems up and alto stems down on the treble staff; tenor stems up and bass stems down on the bass staff", None)],
    ("Piano", 2, 18): [("**Mixolydian** — **G A B C D E F G**", "piano/dorian-mixolydian.svg",
                        "D Dorian (D to D on white keys, B is the colour note) over Dm7; G Mixolydian (G to G, F is the colour note) over G7", None)],
    ("Piano", 2, 20): [("**Audio** recording, by contrast", "piano/midi-vs-audio.svg",
                        "MIDI stores notes, velocity, start and length; audio stores the sound wave itself", None)],
    ("Piano", 2, 22): [("To get there smoothly, use the new key's **V chord**", "piano/ternary-form.svg",
                        "Ternary form: A in C major, B in G major or A minor (via D7 or E7), A again in C (via G7) with a coda", None)],
    # ── Guitar, Year 2 ──
    ("Guitar", 2, 2): [("**5th string (A)**", "guitar/notes-6th-5th.svg",
                        "Natural notes on the 6th string (E F G A B C D E at frets 0 1 3 5 7 8 10 12) and 5th string (A B C D E F G A at 0 2 3 5 7 8 10 12)", None)],
    ("Guitar", 2, 3): [("**Two shapes to learn first:**", "guitar/major-scale-shape.svg",
                        "Movable G major scale shape, frets 2–5, root G on the 6th string fret 3 under finger 2", None)],
    ("Guitar", 2, 4): [("**Read both:**", "guitar/notation-and-tab.svg",
                        "C D E F G as crotchets on the stave, and the same notes in tab: A string 3, D 0, D 2, D 3, G 0", None)],
    ("Guitar", 2, 5): [("In **G**: **G – Am – Bm", "guitar/chord-family-g.svg",
                        "Triads of G major on the stave: G, Am, Bm, C, D, Em, F♯°", None)],
    ("Guitar", 2, 6): [("**3. The chuck (percussive mute)**", "guitar/chuck-pattern.svg",
                        "Strum D U chuck U D U chuck U: muted chucks on beats 2 and 4", None)],
    ("Guitar", 2, 7): [("**Swing** plays pairs of quavers", "common/compound-time-swing.svg",
                        "4/4 in twos, 6/8 as two beats of three, 12/8 as four beats of three, and swing as long–short triplet pairs", None)],
    ("Guitar", 2, 8): [("(I I I I | IV IV I I | V IV I V)", "guitar/twelve-bar-a.svg",
                        "12-bar blues in A: A A A A | D D A A | E D A E", None),
                       ("**The shuffle pattern**", "guitar/blues-shuffle.svg",
                        "Shuffle tab: open A with D string fret 2 (A5), then fret 4 (A6), alternating", None)],
    ("Guitar", 2, 9): [("**Open-position sevenths:**", "guitar/seventh-chords.svg",
                        "Open seventh chords: Cmaj7 x32000, Am7 x02010, Em7 022030, G7 320001, D7 xx0212, E7 020100", None)],
    ("Guitar", 2, 13): [("**The minor ii–V–i**", "guitar/minor-ii-v-i.svg",
                         "Minor ii–V–i in A minor: Bm7♭5 x2323x, E7 020100, Am7 x02010", None)],
    ("Guitar", 2, 14): [("**Volume swells**", "guitar/volume-swell.svg",
                         "A picked note starts at full volume and fades; a volume swell starts silent and rises, so the attack disappears", None)],
    ("Guitar", 2, 15): [("**Interlocking parts — how they work:**", "guitar/interlocking.svg",
                         "Interlocking parts on a sixteenth grid: guitar 1 riff, guitar 2 in its gaps, rhythm guitar on the 'and's", None)],
    ("Guitar", 2, 16): [("**Bends in tune:**", "guitar/bend-targets.svg",
                         "G string fret 7 is D: a whole-step bend must sound like fret 9 (E), a half-step bend like fret 8 (D♯)", None)],
    ("Guitar", 2, 17): [("**Two fundamental strokes:**", "guitar/rest-free-stroke.svg",
                         "Rest stroke: the finger plays through and rests on the next string. Free stroke: it lifts clear into the hand", None)],
    ("Guitar", 2, 18): [("**Mixolydian** — the major scale from its **5th** degree", "guitar/dorian-mixolydian-a.svg",
                         "A Dorian is A natural minor with F♯; A Mixolydian is A major with G natural", None)],
    ("Guitar", 2, 19): [("**Divide by register:**", "guitar/two-guitars-capo5.svg",
                         "For a song in G C D Em, guitar 2 at capo 5 plays D G A Bm shapes, which sound as G C D Em", None)],
    ("Guitar", 2, 20): [("**A typical pedalboard order:**", "guitar/signal-chain.svg",
                         "Signal chain: guitar, tuner, drive, modulation, delay, reverb, amp", None)],
    ("Guitar", 2, 22): [("**The bridge** — a contrasting section", "guitar/song-form-ii.svg",
                         "Verse, pre-chorus, chorus, verse, pre-chorus, chorus, bridge, final chorus up a tone", None)],
    # ── Year 3 ──
    ("Piano", 3, 3): [("**Practise:** ii–V–I as **Dm9", "piano/extended-ii-v-i.svg",
                       "Dm9: D | F A C E. G13: G | F B E. Cmaj9: C | E G B D (left hand | right hand)", None)],
    ("Piano", 3, 4): [("**Think in numbers, not letters.**", "common/numbers-transpose.svg",
                       "1 – 5 – 6m – 4 is C G Am F in C, D A Bm G in D, B♭ F Gm E♭ in B♭", None)],
    ("Piano", 3, 7): [("**\"Autumn Leaves\"** is a classic first standard", "common/autumn-leaves.svg",
                       "Cm7 F7 B♭maj7 is a ii–V–I in B♭; Am7♭5 D7 Gm is a ii–V–i in G minor", None)],
    ("Piano", 3, 15): [("**Changing the bass**", "common/descending-bass.svg",
                        "C, C/B, Am, Am/G over a bass line walking down C B A G", None)],
    ("Piano", 3, 21): [("**Keys and the circle of fifths**", "common/circle-of-fifths.svg",
                        "Circle of fifths with key signatures and relative minors", None)],
    ("Guitar", 3, 3): [("**Practise:** ii–V–I as **Dm9", "guitar/extended-ii-v-i.svg",
                        "Guitar shapes: Dm9 x5355x, G13 3x345x, Cmaj9 x3243x", None)],
    ("Guitar", 3, 4): [("**Think in numbers, not letters.**", "common/numbers-transpose.svg",
                        "1 – 5 – 6m – 4 is C G Am F in C, D A Bm G in D, B♭ F Gm E♭ in B♭", None)],
    ("Guitar", 3, 7): [("**\"Autumn Leaves\"** is a classic first standard", "common/autumn-leaves.svg",
                        "Cm7 F7 B♭maj7 is a ii–V–I in B♭; Am7♭5 D7 Gm is a ii–V–i in G minor", None)],
    ("Guitar", 3, 13): [("**Sweep picking**", "guitar/sweep-am.svg",
                         "Sweep tab: G 14, B 13, E 12 in one down-stroke, then B 13, G 14 in one up-stroke — an A minor triad", None)],
    ("Guitar", 3, 15): [("**Changing the bass**", "common/descending-bass.svg",
                         "C, C/B, Am, Am/G over a bass line walking down C B A G", None)],
    ("Guitar", 3, 21): [("**Keys and the circle of fifths**", "common/circle-of-fifths.svg",
                         "Circle of fifths with key signatures and relative minors", None)],
    # ── Drums ──
    ("Drums", 1, 1): [("**The grip (matched grip):**", "drums/setup-and-grip.svg",
                       "Seat so the thigh slopes slightly down from hip to knee; hold the stick at the fulcrum, about a third from the butt", None)],
    ("Drums", 1, 2): [("**Tempo** is how fast the pulse goes", "drums/tempo-bpm.svg",
                       "60 bpm is one beat a second; 120 bpm is two beats a second", None)],
    ("Drums", 1, 3): [("- **Snare** on beats **2 and 4**", "drums/backbeat.svg",
                       "Backbeat grid: kick on 1 and 3, snare on 2 and 4", None)],
    ("Drums", 1, 4): [("**Building the groove in layers:**", "drums/eighth-note-groove.svg",
                       "Eighth-note groove grid: hi-hat on all eight counts, snare on 2 and 4, kick on 1 and 3", None)],
    ("Drums", 1, 5): [("**Your first fill:**", "drums/fill.svg",
                       "Three bars of groove then a fill bar: snare on 1 & 2 &, high tom on 3 &, floor tom on 4 &, then crash and kick together on the next 1", None)],
    ("Drums", 1, 6): [("Practising ghost notes:", "drums/ghost-notes.svg",
                       "Example pattern: sixteenth hi-hats, full-height snare on 2 and 4 with quiet ghost notes between, kick moving off 1 and 3", None)],
    ("Drums", 1, 8): [("Held under the arm and struck with a curved stick", "drums/dundun.svg",
                       "The dùndún is hourglass-shaped with cords between its heads; squeezing the cords tightens the heads and raises the pitch", None)],
    ("Drums", 1, 9): [("**On drums, volume comes from stick height**", "drums/stick-heights.svg",
                       "Stick heights for pp, p, mf, f and ff: the higher the starting height, the louder the note", None)],
    ("Drums", 1, 11): [("The stave begins with a **percussion clef**", "drums/drum-chart.svg",
                        "Drum stave key: crash, hi-hat and ride as x noteheads at the top, high tom top space, snare third space, floor tom second space, kick bottom space, hi-hat foot below; then the week 4 groove written out", None)],
    # ── Violin ──
    ("Violin", 1, 1): [("**The parts:**", "violin/parts.svg",
                        "Violin parts: scroll, pegs, fingerboard, f-holes, bridge, tailpiece with fine tuners, chinrest; strings G D A E", None)],
    ("Violin", 1, 2): [("**Straight bow:**", "violin/straight-bow.svg",
                        "The bow crosses the strings parallel to the bridge, about halfway between bridge and fingerboard; a slanted bow drifts", None)],
    ("Violin", 1, 3): [("Then continue on the **E string**", "violin/a-major-fingers.svg",
                        "A major: A string open A, 1 B, 2 C♯, 3 D; E string open E, 1 F♯, 2 G♯, 3 A; fingers 2 and 3 close together", None)],
    ("Violin", 1, 4): [("**Matching notes to fingers on the A string:**", "violin/notes-on-stave.svg",
                        "Treble stave: open G (under two ledger lines), D, A, E; then A string notes A, B, C♯, D with fingers 0 1 2 3", None)],
    ("Violin", 1, 5): [("Each has a matching **rest**", "common/note-values.svg",
                        "Note values in 4/4 with their rests: semibreve 4 beats, minim 2, crotchet 1, quaver half a beat", None)],
    ("Violin", 1, 8): [("(Do not confuse a slur with a **tie**", "violin/slur-tie-bowing.svg",
                        "A B C♯ D under one slur with a down-bow mark; two Es joined by a tie with an up-bow mark", None)],
    ("Violin", 1, 9): [("**On the D string:**", "violin/d-major-fingers.svg",
                        "D major: D string open D, 1 E, 2 F♯, 3 G; A string open A, 1 B, 2 C♯, 3 D — the same high-2 pattern", None)],
    ("Violin", 1, 10): [("3. **Contact point**", "violin/contact-point.svg",
                         "Near the bridge: loud and brilliant, more weight, slower bow. Near the fingerboard: soft and airy, less weight, faster bow", None)],
    ("Violin", 1, 11): [("**Tune together first.**", "violin/tuning-fifths.svg",
                         "Violin strings G D A E a fifth apart; tune A to 440 Hz, then each pair of open strings together", None)],
    # ── Saxophone ──
    ("Saxophone", 1, 1): [("**Embouchure** (mouth shape):", "sax/embouchure.svg",
                           "Embouchure: top teeth on top of the mouthpiece 1–1.5 cm from the tip; bottom lip over the lower teeth, under the reed", None)],
    ("Saxophone", 1, 2): [("**The first three notes:**", "sax/b-a-g.svg",
                           "Fingering chart: B is left-hand finger 1; A is fingers 1 and 2; G is fingers 1, 2 and 3", None)],
    ("Saxophone", 1, 3): [("**Breathing low:**", "common/breathing.svg",
                           "Breathing in, the diaphragm flattens down and the belly and lower ribs move out; breathing out, it rises as the air is pushed out", None)],
    ("Saxophone", 1, 4): [("**Fingerings, from written low C up:**", "sax/c-major-fingerings.svg",
                           "Fingering chart for written C major: C all six plus the low C key, D all six, E left three plus right 1 2, F left three plus right 1, G left three, A left 1 2, B left 1, middle C left 2 only", None)],
    ("Saxophone", 1, 5): [("**Slurred vs tongued:**", "sax/slur-tongue.svg",
                           "G A B C slurred, tongued on the first note only; then G A B C each tongued", None)],
    ("Saxophone", 1, 8): [("**Exercises:**", "sax/octave-key.svg",
                           "Low G is left-hand 1 2 3; high G adds the octave key. Low D is all six keys; middle D adds the octave key", None)],
    ("Saxophone", 1, 11): [("**Tune first.**", "sax/alto-transposition.svg",
                            "Alto saxophone: concert E♭ is written C, concert B♭ written G, concert A written F♯", None)],
    # ── Vocal Training ──
    ("Vocal Training", 1, 1): [("3. **The resonators", "vocal/voice-system.svg",
                                "The voice: breath from the lungs and diaphragm (power), vocal folds in the larynx (vibrator), throat, mouth and nose (resonators)", None)],
    ("Vocal Training", 1, 3): [("Find your own examples", "vocal/intervals.svg",
                                "Intervals from C with songs: major 3rd E (Oh When the Saints), perfect 4th F (Here Comes the Bride), perfect 5th G (Twinkle Twinkle), octave C (Somewhere Over the Rainbow)", None)],
    ("Vocal Training", 1, 6): [("**The passaggio**", "vocal/registers.svg",
                                "Chest voice below, head voice above, the passaggio between, where mix carries power across", None)],
    ("Vocal Training", 1, 8): [("**Parts in a choir:**", "vocal/satb-ranges.svg",
                                "Typical choir ranges: soprano C4–A5, alto F3–D5, tenor C3–A4, bass E2–E4", None)],
    ("Vocal Training", 1, 9): [("**Working the mic:**", "vocal/mic-distance.svg",
                                "Mic distance: a hand's width (5–10 cm) for normal singing, closer for soft passages, further back for loud or high notes", None)],
    # ── Music Production ──
    ("Music Production", 1, 1): [("**What every DAW has:**", "production/daw-anatomy.svg",
                                  "A DAW: transport at the top, tracks stacked vertically, clips on a timeline in bars, time flowing left to right", None)],
    ("Music Production", 1, 2): [("You can program this in the **piano roll**", "production/step-backbeat.svg",
                                  "16-step grid: kick on steps 1 and 9 (beats 1 and 3), snare on steps 5 and 13 (beats 2 and 4)", None)],
    ("Music Production", 1, 3): [("**Velocity** — how hard", "production/velocity.svg",
                                  "Eighth-note hi-hats with varied velocity bars: louder on the beats, softer between", None)],
    ("Music Production", 1, 4): [("Give each chord **one bar**", "production/piano-roll-chords.svg",
                                  "Piano roll: Am (A C E), F (F A C), C (C E G), G (G B D), one bar each", None)],
    ("Music Production", 1, 5): [("**Gain staging**", "production/gain-meter.svg",
                                  "Level meter: aim for peaks between −12 and −6 dBFS; 0 dBFS clips", None)],
    ("Music Production", 1, 6): [("**The key idea: contrast through subtraction.**", "production/arrangement-layers.svg",
                                  "Example arrangement grid: verses leave out bass or extras, every part plays in the choruses", None)],
    ("Music Production", 1, 8): [("**Pan — use the stereo space:**", "production/pan-field.svg",
                                  "Stereo field: kick, snare, bass and lead vocal centre; hi-hat, shekere, keys, guitar and backing vocals spread left and right", None)],
    ("Music Production", 1, 9): [("Rules of thumb:", "production/eq-spectrum.svg",
                                  "Spectrum: lows 20–250 Hz, mids 250 Hz–4 kHz, highs 4–20 kHz; a high-pass filter cuts the lows", None),
                                 ("The controls:", "production/compression.svg",
                                  "Compressor graph: unchanged below the threshold; above it at 4:1, 4 dB more in gives 1 dB more out", None)],
}

# Prose corrections where a lesson's own text disagreed with the notation it describes.
FIXES = {
    INST: [("**Open G** — below the stave (three ledger lines down).",
            "**Open G** — below the stave, hanging under two ledger lines.")],
}

OWN = re.compile(r"\n\n!\[[^\]\n]*\]\(media:music/[^)\s]+\)(\n\n\*[^*\n][^\n]*\*)?")


def diagrams():
    D = {}
    for m in (music_figs_keys, music_figs_guitar, music_figs_inst):
        for k, v in m.figs().items():
            assert k not in D, f"two figures named {k}"
            D[k] = v
    return D


def year(level):
    m = re.match(r"Year (\d)", level)
    return int(m.group(1)) if m else 0


def insert(body, anchor, block):
    """Put `block` after the paragraph (blank-line-separated) containing `anchor`, searching the
    'Understand it' / 'Learn' sections first so a picture lands next to the explanation, not the homework."""
    start = 0
    for head in ("## Understand it", "## Learn"):
        i = body.find(head)
        if i >= 0 and body.find(anchor, i) >= 0:
            start = i
            break
    i = body.find(anchor, start)
    if i < 0:
        raise KeyError(anchor)
    j = body.find("\n\n", i)
    if j < 0:
        j = len(body)
    return body[:j] + block + body[j:]


def apply(path, D, used):
    raw = open(path, encoding="utf-8").read()
    data = json.loads(raw)
    for a, b in FIXES.get(path, []):
        raw_has = any(a in l["body"] for l in data["lessons"])
        for l in data["lessons"]:
            l["body"] = l["body"].replace(a, b)
        if not raw_has:
            assert any(b in l["body"] for l in data["lessons"]), f"fix target missing: {a}"
    n = 0
    for l in data["lessons"]:
        l["body"] = OWN.sub("", l["body"])
        key = (l["course"], year(l["level"]), l["week"])
        for anchor, f, alt, cap in PLAN.get(key, []):
            assert f in D, f"no figure {f}"
            block = f"\n\n![{alt}](media:music/{f})" + (f"\n\n*{cap}*" if cap else "")
            l["body"] = insert(l["body"], anchor, block)
            used.add(key)
            n += 1
    out = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if out != raw:
        open(path, "w", encoding="utf-8").write(out)
    return n


def main():
    D = diagrams()
    for name, s in D.items():
        p = os.path.join(OUT, name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w", encoding="utf-8").write(s)
    used = set()
    n = apply(PG, D, used) + apply(INST, D, used)
    missing = set(PLAN) - used
    assert not missing, f"plan entries matched no lesson: {sorted(missing)}"
    refs = set(f for v in PLAN.values() for _, f, _, _ in v)
    unused = set(D) - refs
    assert not unused, f"figures drawn but never shown: {sorted(unused)}"
    print(f"{len(D)} diagrams, {n} image lines in {len(PLAN)} lessons")


if __name__ == "__main__":
    main()
