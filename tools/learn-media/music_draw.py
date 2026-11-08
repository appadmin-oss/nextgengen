"""
Drawing primitives for the music courses' diagrams (Piano, Guitar, Drums, Violin, Saxophone, Vocal Training,
Music Production). Everything is hand-built SVG, in the house style of tools/learn-core/media.py: ink #16233f on
white, one gold accent, every label at least 16px at a 640-wide viewBox and at least 4.5:1 on its ground.

Nothing here guesses a pitch. Notes are named ("C4", "F#4", "Bb3"), turned into a MIDI number or a staff step by
the same two functions, and every keyboard, staff, fretboard and chord box is drawn from those numbers — so a
diagram cannot show a key or a line that disagrees with the name printed under it.

No font is trusted for music symbols: clefs, sharps, flats, rests and flags are paths, because a 𝄞 in a <text>
is a missing-glyph box on half the phones a member owns.
"""
from html import escape

INK, INK2, MUTE, LINE, SOFT = "#16233f", "#3d4560", "#5a6488", "#c9cedb", "#f3f5fa"
GOLD, GOLD_SOFT, TEAL, TEAL_SOFT = "#f5b026", "#fde7b8", "#20b2c9", "#d3f1f6"
CORAL, CORAL_INK, GREEN, BLUE = "#ef6b4d", "#a3361f", "#1d6b30", "#1a4fb4"
FONT = "font-family:'Inter','Segoe UI',Arial,sans-serif"
W = 640

# ── frame ─────────────────────────────────────────────────────────────────────

def svg(h, title, desc, body, w=W):
    """One diagram. A gold rule on top and the course mark in a strip of its own at the foot."""
    h = h + 26
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t d">'
            f'<title id="t">{escape(title)}</title><desc id="d">{escape(desc)}</desc>'
            f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
            f'<path d="M0 0L10 5L0 10z" fill="{INK2}"/></marker></defs>'
            f'<rect width="{w}" height="{h}" fill="#ffffff"/><rect width="{w}" height="5" fill="{GOLD}"/>'
            f'<g style="{FONT}">{body}<text x="{w - 14}" y="{h - 9}" font-size="16" font-weight="700" fill="{MUTE}" text-anchor="end">NGG · Learn</text></g></svg>')


def text(x, y, s, size=16, weight=500, fill=INK, anchor="start", italic=False):
    st = ' font-style="italic"' if italic else ""
    return f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{st}>{escape(s)}</text>'


def title(s, y=36, x=20):
    return text(x, y, s, 20, 800)


def rect(x, y, w, h, fill=SOFT, stroke=LINE, r=8, sw=1.25):
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def line(x1, y1, x2, y2, c=INK, w=1.5, dash=None, cap="butt"):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{c}" stroke-width="{w}" stroke-linecap="{cap}"{d}/>'


def arrow(x1, y1, x2, y2, c=INK2, w=2.5):
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{c}" stroke-width="{w}" stroke-linecap="round" marker-end="url(#a)"/>'


def circle(x, y, r, fill=INK, stroke="none", sw=1.5):
    return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def pill(x, y, s, fill=GOLD, ink=INK, size=16, pad=8, anchor="middle"):
    """A label on a coloured chip. Width is estimated from the text, generously."""
    w = max(26, len(s) * size * 0.58 + pad * 2)
    x0 = x - w / 2 if anchor == "middle" else x
    return rect(x0, y - size - 2, w, size + 10, fill, fill, 6) + text(x0 + w / 2, y + 2, s, size, 700, ink, "middle")


# ── pitch ─────────────────────────────────────────────────────────────────────

PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
LETTERS = "CDEFGAB"


def parse(n):
    """'F#4' -> (letter, accidental, octave). Accidental: 1 sharp, -1 flat, 0 natural."""
    letter, rest = n[0], n[1:]
    acc = 0
    while rest and rest[0] in "#b":
        acc += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return letter, acc, int(rest)


def midi(n):
    l, a, o = parse(n)
    return 12 * (o + 1) + PC[l] + a


def pretty(n, octave=False):
    """'F#4' -> 'F♯' (the octave is for the computer, not for the reader)."""
    l, a, o = parse(n)
    s = l + ("♯" * a if a > 0 else "♭" * -a)
    return s + (str(o) if octave else "")


def step(n):
    """Diatonic position: C0 = 0, D0 = 1 ... used for staff placement."""
    l, a, o = parse(n)
    return o * 7 + LETTERS.index(l)


def is_black(m):
    return m % 12 in (1, 3, 6, 8, 10)


# ── keyboard ──────────────────────────────────────────────────────────────────

def keyboard(x, y, lo, hi, marks=None, ww=34, wh=120, names=True, fingers=None, finger_y=None, hand_fill=GOLD,
             label_black=True):
    """A keyboard from white key `lo` to white key `hi` (both names, e.g. 'C4', 'C5').
    marks:   {note-name: fill}  keys pressed, coloured.
    fingers: {note-name: number or text}  a numbered circle above the key.
    names:   True -> letter under every white key; 'marked' -> only pressed keys.
    Black-key names, when marked, sit in a chip above the keyboard so they never sit on black.
    Returns (svg, width)."""
    marks = {midi(k): v for k, v in (marks or {}).items()}
    fingers = {midi(k): v for k, v in (fingers or {}).items()}
    out, whites = [], []
    m = midi(lo)
    while m <= midi(hi):
        if not is_black(m):
            whites.append(m)
        m += 1
    bw, bh = ww * 0.6, wh * 0.62
    pos = {}
    for i, wm in enumerate(whites):
        kx = x + i * ww
        pos[wm] = kx + ww / 2
        fill = marks.get(wm, "#ffffff")
        out.append(f'<rect x="{kx:.1f}" y="{y}" width="{ww}" height="{wh}" rx="3" fill="{fill}" stroke="{INK}" stroke-width="1.4"/>')
        nm = LETTERS[[0, 2, 4, 5, 7, 9, 11].index(wm % 12)]
        if names is True or (names == "marked" and wm in marks):
            out.append(text(kx + ww / 2, y + wh - 10, nm, 16, 700 if wm in marks else 500, INK, "middle"))
    for i, wm in enumerate(whites[:-1]):
        b = wm + 1
        if is_black(b):
            bx = x + (i + 1) * ww - bw / 2
            pos[b] = bx + bw / 2
            fill = marks.get(b, INK)
            out.append(f'<rect x="{bx:.1f}" y="{y}" width="{bw:.1f}" height="{bh:.1f}" rx="2" fill="{fill}" stroke="{INK}" stroke-width="1.4"/>')
    fy = finger_y if finger_y is not None else y - 20
    for km, f in fingers.items():
        if km in pos:
            yy = fy - (26 if is_black(km) else 0)
            out.append(circle(pos[km], yy, 13, "#ffffff", INK, 1.6) + text(pos[km], yy + 6, str(f), 16, 800, INK, "middle"))
    if label_black:
        for km in marks:
            if is_black(km) and km in pos:
                pass  # black-key names are drawn by the caller where it knows the spelling (F♯ or G♭)
    return "".join(out), len(whites) * ww, pos


def key_label_above(pos, name, y, fill=GOLD_SOFT):
    """A note name in a chip above its key (for black keys, whose own surface is too dark to write on)."""
    return pill(pos[midi(name)], y, pretty(name), fill, INK)


# ── staff notation ────────────────────────────────────────────────────────────

S = 14  # distance between staff lines


class Staff:
    """One five-line staff. y is the TOP line. Notes are placed by name; ledger lines, stems, flats and sharps
    follow from the pitch, never from a hand-typed offset."""

    def __init__(self, x, y, w, clef="treble", s=S):
        self.x, self.y, self.w, self.clef, self.s = x, y, w, clef, s
        self.out = []
        self.ref = {"treble": step("E4"), "bass": step("G2"), "perc": step("E4")}[clef]  # bottom line

    def ypos(self, n):
        st = step(n) if isinstance(n, str) else n
        return self.y + 4 * self.s - (st - self.ref) * self.s / 2

    def rel(self, n):
        return (step(n) if isinstance(n, str) else n) - self.ref

    def lines(self):
        for i in range(5):
            self.out.append(line(self.x, self.y + i * self.s, self.x + self.w, self.y + i * self.s, INK, 1.3))
        return self

    def barline(self, x, double=False, final=False):
        y0, y1 = self.y, self.y + 4 * self.s
        if final:
            self.out.append(line(x - 6, y0, x - 6, y1, INK, 1.3) + line(x, y0, x, y1, INK, 4))
        elif double:
            self.out.append(line(x - 4, y0, x - 4, y1, INK, 1.3) + line(x, y0, x, y1, INK, 1.3))
        else:
            self.out.append(line(x, y0, x, y1, INK, 1.3))
        return self

    def clef_glyph(self, x=None):
        x = self.x + 6 if x is None else x
        s, y = self.s, self.y
        if self.clef == "treble":
            p = lambda a, b: f"{x + a * s:.1f} {y + b * s:.1f}"
            d = (f"M{p(1.55, 5.15)} C{p(1.6, 5.9)} {p(0.55, 6.0)} {p(0.5, 5.35)} "
                 f"M{p(1.55, 5.15)} L{p(1.15, -0.9)} C{p(1.05, -2.1)} {p(2.25, -1.9)} {p(1.85, -0.55)} "
                 f"C{p(1.5, 0.6)} {p(0.05, 1.5)} {p(0.05, 3.0)} C{p(0.05, 4.35)} {p(2.3, 4.4)} {p(2.3, 3.05)} "
                 f"C{p(2.3, 2.0)} {p(0.95, 1.95)} {p(0.9, 2.9)} C{p(0.88, 3.35)} {p(1.2, 3.55)} {p(1.45, 3.5)}")
            self.out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{s * 0.2:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
            self.out.append(circle(x + 0.62 * s, y + 5.3 * s, s * 0.28, INK))
        elif self.clef == "bass":
            p = lambda a, b: f"{x + a * s:.1f} {y + b * s:.1f}"
            d = f"M{p(0.35, 1.0)} C{p(0.25, -0.15)} {p(2.2, -0.35)} {p(2.2, 1.15)} C{p(2.2, 2.5)} {p(1.1, 3.4)} {p(0.15, 3.9)}"
            self.out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{s * 0.24:.1f}" stroke-linecap="round"/>')
            self.out.append(circle(x + 0.42 * s, y + 1.0 * s, s * 0.32, INK))
            self.out.append(circle(x + 2.75 * s, y + 0.5 * s, s * 0.17, INK) + circle(x + 2.75 * s, y + 1.5 * s, s * 0.17, INK))
        elif self.clef == "perc":
            self.out.append(f'<rect x="{x + 6}" y="{y + self.s}" width="5" height="{2 * self.s}" fill="{INK}"/>'
                            f'<rect x="{x + 15}" y="{y + self.s}" width="5" height="{2 * self.s}" fill="{INK}"/>')
        return self

    def time(self, x, top, bottom):
        s = self.s
        self.out.append(text(x, self.y + 1.85 * s, str(top), int(2.0 * s), 900, INK, "middle"))
        self.out.append(text(x, self.y + 3.85 * s, str(bottom), int(2.0 * s), 900, INK, "middle"))
        return self

    def sharp(self, x, y):
        s = self.s
        return (line(x - 0.22 * s, y - 1.15 * s, x - 0.22 * s, y + 1.25 * s, INK, 1.4)
                + line(x + 0.22 * s, y - 1.3 * s, x + 0.22 * s, y + 1.1 * s, INK, 1.4)
                + line(x - 0.5 * s, y - 0.25 * s, x + 0.5 * s, y - 0.55 * s, INK, s * 0.22)
                + line(x - 0.5 * s, y + 0.55 * s, x + 0.5 * s, y + 0.25 * s, INK, s * 0.22))

    def flat(self, x, y):
        s = self.s
        d = (f"M{x - 0.3 * s:.1f} {y - 1.7 * s:.1f} L{x - 0.3 * s:.1f} {y + 0.5 * s:.1f} "
             f"C{x + 0.55 * s:.1f} {y + 0.05 * s:.1f} {x + 0.6 * s:.1f} {y - 0.65 * s:.1f} {x - 0.3 * s:.1f} {y - 0.25 * s:.1f}")
        return f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'

    def natural(self, x, y):
        s = self.s
        return (line(x - 0.25 * s, y - 1.2 * s, x - 0.25 * s, y + 0.5 * s, INK, 1.4)
                + line(x + 0.25 * s, y - 0.5 * s, x + 0.25 * s, y + 1.2 * s, INK, 1.4)
                + line(x - 0.25 * s, y - 0.2 * s, x + 0.25 * s, y - 0.4 * s, INK, s * 0.2)
                + line(x - 0.25 * s, y + 0.4 * s, x + 0.25 * s, y + 0.2 * s, INK, s * 0.2))

    def keysig(self, x, notes, kind="sharp"):
        """notes: the staff positions in order, e.g. ['F5'] for G major on the treble staff."""
        for i, n in enumerate(notes):
            yy = self.ypos(n)
            self.out.append(self.sharp(x + i * 11, yy) if kind == "sharp" else self.flat(x + i * 11, yy))
        return self

    def ledgers(self, x, n):
        r = self.rel(n)
        hw = self.s * 1.15
        st = -2
        while st >= r:
            yy = self.y + 4 * self.s - st * self.s / 2
            self.out.append(line(x - hw, yy, x + hw, yy, INK, 1.7))
            st -= 2
        st = 10
        while st <= r:
            yy = self.y + 4 * self.s - st * self.s / 2
            self.out.append(line(x - hw, yy, x + hw, yy, INK, 1.7))
            st += 2

    def head(self, x, n, kind="filled", fill=None):
        yy = self.ypos(n)
        self.ledgers(x, n)
        rx, ry = self.s * 0.62, self.s * 0.44
        if kind == "x":
            h = self.s * 0.45
            self.out.append(line(x - h, yy - h, x + h, yy + h, INK, 2.2) + line(x - h, yy + h, x + h, yy - h, INK, 2.2))
        elif kind == "open":
            self.out.append(f'<ellipse cx="{x:.1f}" cy="{yy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="#ffffff" stroke="{INK}" stroke-width="2.2" transform="rotate(-20 {x:.1f} {yy:.1f})"/>')
        elif kind == "whole":
            self.out.append(f'<ellipse cx="{x:.1f}" cy="{yy:.1f}" rx="{rx * 1.15:.1f}" ry="{ry:.1f}" fill="#ffffff" stroke="{INK}" stroke-width="2.6"/>')
        else:
            self.out.append(f'<ellipse cx="{x:.1f}" cy="{yy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill or INK}" stroke="{INK}" stroke-width="1" transform="rotate(-20 {x:.1f} {yy:.1f})"/>')
        return yy

    def acc(self, x, n):
        l, a, o = parse(n)
        yy = self.ypos(n)
        if a > 0:
            self.out.append(self.sharp(x - self.s * 1.35, yy))
        elif a < 0:
            self.out.append(self.flat(x - self.s * 1.3, yy))

    def stem_dir(self, n):
        return "up" if self.rel(n) < 4 else "down"

    def note(self, x, n, dur="q", stem=None, acc=True, flag=True, fill=None, head=None, ghost=False):
        """dur: w h q 8 16 (a beamed note is drawn with flag=False and beamed by the caller).
        Returns (stem x, stem tip y)."""
        if acc:
            self.acc(x, n)
        kind = head or {"w": "whole", "h": "open"}.get(dur, "filled")
        yy = self.head(x, n, kind, fill)
        if ghost:
            self.out.append(text(x - self.s * 1.15, yy + 6, "(", 18, 500, INK, "middle") + text(x + self.s * 1.15, yy + 6, ")", 18, 500, INK, "middle"))
        if dur == "w":
            return x, yy
        d = stem or self.stem_dir(n)
        rx = self.s * 0.58
        sl = self.s * 3.4
        if d == "up":
            sx, tip = x + rx, yy - sl
        else:
            sx, tip = x - rx, yy + sl
        self.out.append(line(sx, yy, sx, tip, INK, 1.6))
        if flag and dur in ("8", "16"):
            for k in range(1 if dur == "8" else 2):
                o = k * self.s * 0.7
                if d == "up":
                    self.out.append(f'<path d="M{sx:.1f} {tip + o:.1f} C{sx + 2:.1f} {tip + o + 10:.1f} {sx + 14:.1f} {tip + o + 14:.1f} {sx + 9:.1f} {tip + o + 30:.1f}" fill="none" stroke="{INK}" stroke-width="2.4"/>')
                else:
                    self.out.append(f'<path d="M{sx:.1f} {tip - o:.1f} C{sx + 2:.1f} {tip - o - 10:.1f} {sx + 14:.1f} {tip - o - 14:.1f} {sx + 9:.1f} {tip - o - 30:.1f}" fill="none" stroke="{INK}" stroke-width="2.4"/>')
        return sx, tip

    def beam(self, pts, d="up", n=1):
        """pts: list of (stem x, stem tip y). Draws one beam level (or two for semiquavers) and evens the stems."""
        x0, y0 = pts[0]
        x1, y1 = pts[-1]
        ty = min(y0, y1) if d == "up" else max(y0, y1)
        for sx, tip in pts:
            self.out.append(line(sx, tip, sx, ty, INK, 1.6))
        for k in range(n):
            o = k * 7 * (1 if d == "up" else -1)
            self.out.append(f'<rect x="{x0 - 0.8:.1f}" y="{ty + o - (0 if d == "up" else 5):.1f}" width="{x1 - x0 + 1.6:.1f}" height="5" fill="{INK}"/>')

    def chord(self, x, notes, dur="w", fill=None):
        """A stack of noteheads on one stem (seconds are not needed in these lessons)."""
        ys = []
        for n in notes:
            self.acc(x, n)
            ys.append(self.head(x, n, {"w": "whole", "h": "open"}.get(dur, "filled"), fill))
        if dur != "w":
            hi, lo = min(ys), max(ys)
            sx = x + self.s * 0.58
            self.out.append(line(sx, lo, sx, hi - self.s * 3.2, INK, 1.6))

    def rest(self, x, dur):
        s, y = self.s, self.y
        if dur == "w":
            self.out.append(f'<rect x="{x - 0.6 * s:.1f}" y="{y + s:.1f}" width="{1.2 * s:.1f}" height="{0.5 * s:.1f}" fill="{INK}"/>')
        elif dur == "h":
            self.out.append(f'<rect x="{x - 0.6 * s:.1f}" y="{y + 1.5 * s:.1f}" width="{1.2 * s:.1f}" height="{0.5 * s:.1f}" fill="{INK}"/>')
        elif dur == "q":
            p = lambda a, b: f"{x + a * s:.1f} {y + b * s:.1f}"
            d = f"M{p(-0.3, 0.6)} L{p(0.35, 1.45)} L{p(-0.25, 2.2)} L{p(0.35, 2.95)} C{p(-0.35, 2.65)} {p(-0.55, 3.25)} {p(0.05, 3.6)}"
            self.out.append(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{0.26 * s:.1f}" stroke-linejoin="round" stroke-linecap="round"/>')
        elif dur in ("8", "16"):
            self.out.append(circle(x - 0.25 * s, y + 1.6 * s, 0.24 * s, INK) + line(x + 0.35 * s, y + 1.55 * s, x - 0.1 * s, y + 3.2 * s, INK, 1.8)
                            + f'<path d="M{x - 0.25 * s:.1f} {y + 1.75 * s:.1f} Q{x + 0.1 * s:.1f} {y + 1.95 * s:.1f} {x + 0.35 * s:.1f} {y + 1.55 * s:.1f}" fill="none" stroke="{INK}" stroke-width="1.8"/>')
            if dur == "16":
                self.out.append(circle(x - 0.45 * s, y + 2.3 * s, 0.24 * s, INK))

    def curve(self, x1, x2, y, up=True, h=12, dash=None):
        """A slur or tie: an arc from x1 to x2 at height y."""
        c = y - h if up else y + h
        d = f' stroke-dasharray="{dash}"' if dash else ""
        return f'<path d="M{x1:.1f} {y:.1f} Q{(x1 + x2) / 2:.1f} {c:.1f} {x2:.1f} {y:.1f}" fill="none" stroke="{INK}" stroke-width="2"{d}/>'

    def svg(self):
        return "".join(self.out)


# ── guitar: chord boxes, fretboards, tab ──────────────────────────────────────

STRING_NAMES = ["E", "A", "D", "G", "B", "E"]   # low to high, as a chord box reads left to right
OPEN_MIDI = [40, 45, 50, 55, 59, 64]


def chord_box(x, y, name, frets, fingers=None, base=1, barre=None, cw=22, fh=28, nfrets=4, sub=None, hi=None):
    """A chord box: strings vertical (low E on the left), nut at the top.
    frets: six values low→high, -1 muted, 0 open, else the fret number (absolute).
    base:  the fret shown in the first row (1 draws a thick nut; otherwise '3fr' at the side).
    barre: (fret, from_string_index, to_string_index) drawn as one bar.
    hi:    set of string indexes whose dot is coloured differently (a finger that moves)."""
    fingers = fingers or [0] * 6
    out = []
    w = cw * 5
    out.append(text(x + w / 2, y - 44, name, 20, 800, INK, "middle"))
    if sub:
        out.append(text(x + w / 2, y + nfrets * fh + 26, sub, 16, 600, INK2, "middle"))
    for i in range(6):
        out.append(line(x + i * cw, y, x + i * cw, y + nfrets * fh, INK, 1.4))
    for r in range(nfrets + 1):
        out.append(line(x, y + r * fh, x + w, y + r * fh, INK, 5 if (r == 0 and base == 1) else 1.4))
    if base != 1:
        out.append(text(x + w + 8, y + fh * 0.5 + 6, f"{base}fr", 16, 700, INK2))
    if barre:
        bf, a, b = barre
        yy = y + (bf - base) * fh + fh / 2
        out.append(f'<rect x="{x + a * cw - 9:.1f}" y="{yy - 9:.1f}" width="{(b - a) * cw + 18:.1f}" height="18" rx="9" fill="{INK}"/>')
    for i, f in enumerate(frets):
        sx = x + i * cw
        if f < 0:
            out.append(text(sx, y - 10, "×", 20, 700, INK, "middle"))
        elif f == 0:
            out.append(circle(sx, y - 15, 7, "#ffffff", INK, 1.8))
        else:
            if barre and f == barre[0] and barre[1] <= i <= barre[2] and fingers[i] == 1:
                if i == barre[1]:
                    out.append(text(sx, y + (f - base) * fh + fh / 2 + 6, "1", 16, 800, "#ffffff", "middle"))
                continue
            yy = y + (f - base) * fh + fh / 2
            fill = GOLD if (hi and i in hi) else INK
            ink = INK if fill == GOLD else "#ffffff"
            out.append(circle(sx, yy, 10.5, fill, INK, 1.2))
            if fingers[i]:
                out.append(text(sx, yy + 6, str(fingers[i]), 16, 800, ink, "middle"))
    for i in range(6):
        out.append(text(x + i * cw, y + nfrets * fh + (48 if sub else 22), STRING_NAMES[i], 16, 500, INK2, "middle")) if not sub else None
    return "".join(o for o in out if o)


def chord_notes(frets):
    """The sounding notes of a chord-box fingering, low to high — used to self-check every shape drawn."""
    names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
    return [names[(OPEN_MIDI[i] + f) % 12] for i, f in enumerate(frets) if f >= 0]


def fretboard(x, y, lo, hi, marks, fw=None, sh=26, width=560, show_names=True, inlays=True, open_col=True, fret_nums=True):
    """A horizontal fretboard: high E on TOP, low E at the bottom (the same way up as tab).
    lo..hi: the frets shown (lo=0 draws the nut and an open-string column).
    marks: list of (string 1..6 where 1 = high E, fret, label, fill)."""
    out = []
    nf = hi - lo + (0 if lo == 0 else 1)
    left = x + (60 if lo == 0 else 34)
    fw = fw or (width - (left - x)) / max(1, nf)
    names = ["E", "B", "G", "D", "A", "E"]
    for s in range(6):
        yy = y + s * sh
        out.append(line(left, yy, left + nf * fw, yy, INK2, 1 + s * 0.35))
        if show_names:
            out.append(text(x + 2, yy + 6, names[s], 16, 700, INK2, "start"))
    first = 1 if lo == 0 else lo
    for k in range(nf + 1):
        fx = left + k * fw
        is_nut = (lo == 0 and k == 0)
        out.append(line(fx, y, fx, y + 5 * sh, INK, 6 if is_nut else 1.6))
    for k in range(nf):
        fnum = first + k
        cx = left + k * fw + fw / 2
        if fret_nums:
            out.append(text(cx, y + 5 * sh + 26, str(fnum), 16, 600, MUTE, "middle"))
        if inlays and fnum in (3, 5, 7, 9, 15, 17):
            out.append(circle(cx, y + 2.5 * sh, 5, LINE))
        if inlays and fnum == 12:
            out.append(circle(cx, y + 1.5 * sh, 5, LINE) + circle(cx, y + 3.5 * sh, 5, LINE))
    for s, f, lab, fill in marks:
        yy = y + (s - 1) * sh
        if f == 0:
            cx = left - 22
        else:
            cx = left + (f - first) * fw + fw / 2
        ink = "#ffffff" if fill in (INK, GREEN, BLUE, CORAL_INK) else INK
        r = 12.5 if len(lab) <= 1 else 15
        out.append(circle(cx, yy, r, fill, INK, 1.2) + text(cx, yy + 5.5, lab, 16, 800, ink, "middle"))
    return "".join(out)


def fret_note(string, fret, sharps=True):
    """string 1..6 (1 = high E) + fret -> pitch class name."""
    base = {1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40}[string]
    names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] if sharps else \
            ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"]
    return names[(base + fret) % 12]


def tab(x, y, w, events, sh=20, label=True):
    """Tablature. events: list of (x offset, string 1..6, text). Top line = high E."""
    out = []
    for s in range(6):
        out.append(line(x, y + s * sh, x + w, y + s * sh, INK2, 1.2))
    if label:
        out.append(f'<rect x="{x + 2}" y="{y + 6}" width="24" height="{5 * sh - 12}" fill="#ffffff"/>')
        for i, ch in enumerate("TAB"):
            out.append(text(x + 14, y + 6 + (5 * sh - 12) / 2 - 22 + i * 22 + 6, ch, 18, 900, INK, "middle"))
    for dx, s, t in events:
        yy = y + (s - 1) * sh
        bw = 10 * len(t) + 8
        out.append(f'<rect x="{x + dx - bw / 2:.1f}" y="{yy - 10:.1f}" width="{bw}" height="20" fill="#ffffff"/>')
        out.append(text(x + dx, yy + 6, t, 17, 800, INK, "middle"))
    return "".join(out)


# ── rhythm grids (drums, strumming, step sequencers) ──────────────────────────

def count_grid(x, y, counts, rows, cw=None, rh=44, width=600, label_w=110, accents=None):
    """A grid with one column per count ('1', '&', '2' ...) and one row per sound.
    rows: list of (label, {column index: mark}), mark one of 'x' (hit), 'X' (accent), 'g' (ghost), 'o' (open hi-hat).
    Beat columns are shaded so the numbers read as the pulse."""
    n = len(counts)
    cw = cw or (width - label_w) / n
    gx = x + label_w
    out = []
    for i, c in enumerate(counts):
        cx = gx + i * cw
        beat = c.isdigit()
        out.append(rect(cx + 1, y, cw - 2, rh * len(rows) + 34, GOLD_SOFT if beat else SOFT, "none", 4))
        out.append(text(cx + cw / 2, y + 24, c, 18 if beat else 16, 800 if beat else 600, INK if beat else INK2, "middle"))
    for r, (lab, hits) in enumerate(rows):
        ry = y + 34 + r * rh
        out.append(text(x, ry + rh / 2 + 6, lab, 16, 700, INK))
        out.append(line(gx, ry + rh / 2, gx + n * cw, ry + rh / 2, LINE, 1.2))
        for i, mk in hits.items():
            cx = gx + i * cw + cw / 2
            cy = ry + rh / 2
            if mk == "x":
                out.append(circle(cx, cy, 11, INK))
            elif mk == "X":
                out.append(circle(cx, cy, 15, GOLD, INK, 2.5))
            elif mk == "g":
                out.append(circle(cx, cy, 7, "#ffffff", INK, 2) )
            elif mk == "o":
                out.append(circle(cx, cy, 11, "#ffffff", INK, 2.5) + text(cx, cy + 5, "o", 14, 800, INK, "middle"))
            elif mk == "c":   # crash
                out.append(f'<path d="M{cx - 12:.1f} {cy + 4:.1f} L{cx:.1f} {cy - 10:.1f} L{cx + 12:.1f} {cy + 4:.1f} Z" fill="{GOLD}" stroke="{INK}" stroke-width="1.6"/>')
            else:
                out.append(circle(cx, cy, 11, GOLD, INK, 1.4) + text(cx, cy + 5.5, mk, 14, 800, INK, "middle"))
    return "".join(out), gx, cw


def strum_arrow(cx, cy, down=True, hit=True, size=26):
    c = INK if hit else LINE
    if down:
        d = f"M{cx:.1f} {cy - size / 2:.1f} L{cx:.1f} {cy + size / 2 - 8:.1f}"
        head = f"M{cx - 8:.1f} {cy + size / 2 - 10:.1f} L{cx:.1f} {cy + size / 2:.1f} L{cx + 8:.1f} {cy + size / 2 - 10:.1f}"
    else:
        d = f"M{cx:.1f} {cy + size / 2:.1f} L{cx:.1f} {cy - size / 2 + 8:.1f}"
        head = f"M{cx - 8:.1f} {cy - size / 2 + 10:.1f} L{cx:.1f} {cy - size / 2:.1f} L{cx + 8:.1f} {cy - size / 2 + 10:.1f}"
    dash = ' stroke-dasharray="4 4"' if not hit else ""
    return (f'<path d="{d}" stroke="{c}" stroke-width="3.2" fill="none" stroke-linecap="round"{dash}/>'
            f'<path d="{head}" stroke="{c}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
