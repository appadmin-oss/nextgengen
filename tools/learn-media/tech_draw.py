"""
Drawing kit for the Learn diagrams of the Coding and Technology Foundations courses.

The same house style as tools/learn-core/media.py (ink #16233f on white, one gold accent, soft panels with a
shadow, a gold strip across the top) at a stricter size: every diagram is 640 wide and no text is drawn under
16px at that width, because these pictures are read on phones (CLAUDE.md §9).

Two guards run while drawing, so a bad picture cannot be written at all:
  - every text is checked for 4.5:1 against the background it is drawn on (print is not exempt);
  - every text that belongs inside a box is wrapped in <g data-fit="x y w h">, which
    tools/learn-media/tech_check.js reads to prove, in a real browser, that the words fit their box and that no
    two pieces of text overlap.
"""
from html import escape

W = 640
INK, INK2, LINE, SOFT, WHITE = "#16233f", "#3d4560", "#c9cedb", "#f3f5fa", "#ffffff"
GOLD, TEAL, CORAL, GREEN = "#f5b026", "#20b2c9", "#ef6b4d", "#1d6b30"
# Light tints for panels, and the dark versions of each accent that are safe as WORDS on white.
GOLD_T, TEAL_T, CORAL_T, GREEN_T = "#fdf0d2", "#dff3f7", "#fde5df", "#e3f1e6"
TEAL_D, CORAL_D = "#0b6274", "#9c3119"
FONT = "font-family:'Inter','Segoe UI',Roboto,Arial,sans-serif"
MONO = "'JetBrains Mono','DejaVu Sans Mono',Consolas,Menlo,monospace"
# Code is drawn exactly as typed: a programming font's ligatures would show => as an arrow and >= as ≥.
NOLIG = "font-variant-ligatures:none;font-feature-settings:'liga' 0,'calt' 0"


def _lum(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def t(x, y, s, size=16, w=500, fill=INK, a="start", bg=WHITE, mono=False, italic=False):
    """One line of text. Refuses to draw anything under 16px or under 4.5:1 on its ground."""
    assert size >= 16, f"text under 16px: {s!r}"
    assert contrast(fill, bg) >= 4.5, f"{s!r}: {fill} on {bg} is {contrast(fill, bg):.2f}:1"
    fam = f' font-family="{MONO}" style="{NOLIG}"' if mono else ""
    it = ' font-style="italic"' if italic else ""
    return (f'<text x="{x:g}" y="{y:g}" font-size="{size:g}" font-weight="{w}" fill="{fill}" text-anchor="{a}"{fam}{it}'
            f' xml:space="preserve">{escape(s)}</text>')


def rect(x, y, w, h, fill=SOFT, stroke=LINE, r=10, sw=1.25, shadow=True, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    f = ' filter="url(#sh)"' if shadow else ""
    return f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}{f}/>'


def fit(x, y, w, h, inner):
    """Text that must stay inside the box (x, y, w, h) — checked in a browser by check.js."""
    return f'<g data-fit="{x:g} {y:g} {w:g} {h:g}">{inner}</g>'


def tb(x, y, w, h, lines, fill=SOFT, stroke=LINE, size=16, wt=600, color=INK, r=10, a="middle", lh=None, shadow=True, sw=1.25, dash=None):
    """A box with lines of text centred in it. A line is a string, or (text, size, weight, colour)."""
    L = [(l, size, wt, color) if isinstance(l, str) else (l + (size, wt, color)[len(l) - 1:]) for l in lines]
    lh = lh or 1.3
    heights = [s * lh for _, s, _, _ in L]
    total = sum(heights)
    cy = y + (h - total) / 2
    out = ""
    tx = x + w / 2 if a == "middle" else x + 14
    for (s, sz, wg, col), hh in zip(L, heights):
        cy += hh
        out += t(tx, cy - hh * 0.28, s, sz, wg, col, a, bg=fill)
    return rect(x, y, w, h, fill, stroke, r, sw, shadow, dash) + fit(x, y, w, h, out)


def arr(x1, y1, x2, y2, c=INK2, dash=None, sw=2.5):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = "a" if c == INK2 else ("ar" if c == CORAL_D else ("ag" if c == GREEN else "a"))
    return f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" stroke="{c}" stroke-width="{sw}" stroke-linecap="round"{d} marker-end="url(#{m})"/>'


def path(d, c=INK2, dash=None, sw=2.5, head=True):
    ds = f' stroke-dasharray="{dash}"' if dash else ""
    m = "a" if c == INK2 else ("ar" if c == CORAL_D else ("ag" if c == GREEN else "a"))
    mk = f' marker-end="url(#{m})"' if head else ""
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"{ds}{mk}/>'


def line(x1, y1, x2, y2, c=LINE, sw=1.5, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" stroke="{c}" stroke-width="{sw}"{d}/>'


def circle(cx, cy, r, fill=GOLD, stroke=INK, sw=1.5):
    return f'<circle cx="{cx:g}" cy="{cy:g}" r="{r:g}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def badge(cx, cy, n, fill=GOLD):
    """A numbered step marker."""
    return circle(cx, cy, 14, fill) + fit(cx - 14, cy - 14, 28, 28, t(cx, cy + 6, str(n), 16, 800, INK, "middle", bg=fill))


def diamond(cx, cy, w, h, lines, fill=GOLD_T, stroke=INK2, size=16):
    pts = f"{cx:g},{cy - h / 2:g} {cx + w / 2:g},{cy:g} {cx:g},{cy + h / 2:g} {cx - w / 2:g},{cy:g}"
    n = len(lines)
    out = ""
    for i, s in enumerate(lines):
        out += t(cx, cy + 6 + (i - (n - 1) / 2) * 21, s, size, 700, INK, "middle", bg=fill)
    # the text must fit the diamond's inner rectangle (half its width and height)
    return f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>' + fit(cx - w / 4 - 8, cy - h / 4 - 6, w / 2 + 16, h / 2 + 12, out)


def code(x, y, w, lines, size=16, fill=SOFT, stroke=LINE, lh=25, pad=14):
    """A block of code. A line is a string, or a list of (text, colour[, weight]) runs. Returns (svg, height)."""
    h = pad * 2 + lh * len(lines) - (lh - size)
    out = ""
    for i, ln in enumerate(lines):
        yy = y + pad + size * 0.85 + i * lh
        runs = [(ln, INK)] if isinstance(ln, str) else ln
        spans = ""
        for r in runs:
            s, col = r[0], r[1]
            wt = r[2] if len(r) > 2 else 500
            assert contrast(col, fill) >= 4.5, f"code {s!r}: {col} on {fill}"
            spans += f'<tspan fill="{col}" font-weight="{wt}">{escape(s)}</tspan>'
        assert size >= 16
        out += f'<text x="{x + pad:g}" y="{yy:g}" font-size="{size}" font-family="{MONO}" style="{NOLIG}" xml:space="preserve">{spans}</text>'
    return rect(x, y, w, h, fill, stroke, 8) + fit(x, y, w, h, out), h


def svg(h, title, desc, body):
    defs = ('<defs><filter id="sh" x="-8%" y="-8%" width="116%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#16233f" flood-opacity=".13"/></filter>'
            f'<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{INK2}"/></marker>'
            f'<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{CORAL_D}"/></marker>'
            f'<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{GREEN}"/></marker></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {h}" width="{W}" height="{h}" role="img" aria-labelledby="t d">'
            f'<title id="t">{escape(title)}</title><desc id="d">{escape(desc)}</desc>{defs}'
            f'<rect width="{W}" height="{h}" fill="{WHITE}"/><rect width="{W}" height="5" fill="{GOLD}"/>'
            f'<g style="{FONT}">{body}</g></svg>')


def heading(s, y=38, x=20, size=20):
    return t(x, y, s, size, 800)
