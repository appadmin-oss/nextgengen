"""
Drawing kit for the Business, Division, Media Lab and Stage & Studio Trades diagrams (business_arts.py).

Same house style as tools/learn-core/media.py — ink #16233f on white, soft panels with a light shadow, a gold
strip across the top, the course mark in a footer strip of its own — at the stricter size these lessons need:
every diagram is 640 wide and no word is drawn under 16px at that width, because they are read on phones.

Guards that run while drawing, so a bad picture cannot be written at all:
  - every text is checked for 4.5:1 against the ground it is drawn on (print is not exempt, CLAUDE.md §9);
  - words are measured with the real Inter metrics (Pillow) plus slack for a fallback face, and wrapped to the
    box they belong in; a word that cannot fit raises;
  - tools/learn-media/ba_check.js then proves, in a real browser, that no text leaves the canvas and no two
    pieces of text overlap.
"""
import math, os
from html import escape
from PIL import ImageFont

W = 640
INK, INK2, LINE, SOFT, WHITE = "#16233f", "#3d4560", "#c9cedb", "#f3f5fa", "#ffffff"
GOLD, TEAL, CORAL, GREEN, PURPLE = "#f5b026", "#20b2c9", "#ef6b4d", "#1d6b30", "#5b2a86"
GOLD_T, TEAL_T, CORAL_T, GREEN_T, PURPLE_T = "#fdf0d2", "#dff3f7", "#fde5df", "#e3f1e6", "#eee6f6"
TEAL_D, CORAL_D, AMBER_D = "#0b6274", "#9c3119", "#7a4a00"
MUTED = "#5a6488"
FONT = "font-family:'Inter','Segoe UI',Roboto,Arial,sans-serif"

_FD = "/usr/share/fonts/opentype/inter/"
_FACES = {400: "Inter-Regular.otf", 500: "Inter-Medium.otf", 600: "Inter-SemiBold.otf", 700: "Inter-Bold.otf", 800: "Inter-ExtraBold.otf"}
_cache = {}
SLACK = 1.07          # Segoe UI / Roboto / Arial run a little wider or narrower than Inter; size for the wider


def tw(s, size=16, weight=500):
    k = (size, weight)
    if k not in _cache:
        w = min(_FACES, key=lambda f: abs(f - weight))
        _cache[k] = ImageFont.truetype(os.path.join(_FD, _FACES[w]), size)
    return _cache[k].getlength(s) * SLACK


def _lum(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def t(x, y, s, size=16, w=500, fill=INK, a="start", bg=WHITE, italic=False):
    """One line of text: never under 16px, never under 4.5:1 on its ground."""
    assert size >= 16, f"text under 16px: {s!r}"
    assert contrast(fill, bg) >= 4.5, f"{fill} on {bg} is {contrast(fill, bg):.2f}:1 for {s!r}"
    it = ' font-style="italic"' if italic else ""
    return f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{a}"{it}>{escape(s)}</text>'


def wrap(s, width, size=16, w=500):
    out, cur = [], ""
    for word in s.split():
        trial = (cur + " " + word).strip()
        if tw(trial, size, w) <= width:
            cur = trial
        else:
            assert cur, f"word wider than {width}px: {word!r}"
            out.append(cur); cur = word
            assert tw(cur, size, w) <= width, f"word wider than {width}px: {word!r}"
    if cur: out.append(cur)
    return out


def lh(size):
    return round(size * 1.3)


def para(x, y, width, s, size=16, w=500, fill=INK, a="start", bg=WHITE, italic=False):
    """Wrapped text whose FIRST baseline is y. Returns (svg, y of the last baseline)."""
    lines = wrap(s, width, size, w)
    out = "".join(t(x, y + i * lh(size), ln, size, w, fill, a, bg, italic) for i, ln in enumerate(lines))
    return out, y + (len(lines) - 1) * lh(size)


def nlines(s, width, size=16, w=500):
    return len(wrap(s, width, size, w))


def box(x, y, w, h, fill=SOFT, stroke=LINE, r=10, shadow=True, sw=1.25, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    f = ' filter="url(#sh)"' if shadow else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}{f}/>'


def card(x, y, w, head=None, body=None, fill=SOFT, stroke=LINE, hs=17, bs=16, pad=12, a="start", hw=700, bfill=INK2, r=10, minh=0):
    """A box sized to its own words: a bold head and a wrapped body. Returns (svg, height)."""
    inner = w - 2 * pad
    hl = wrap(head, inner, hs, hw) if head else []
    bl = wrap(body, inner, bs, 500) if body else []
    gap = 4 if hl and bl else 0
    content = len(hl) * lh(hs) + gap + len(bl) * lh(bs)
    h = max(content + 2 * pad - 4, minh)
    tx = x + pad if a == "start" else x + w / 2
    yy = y + (h - content) / 2
    out = box(x, y, w, h, fill, stroke, r)
    for ln in hl:
        out += t(tx, yy + (lh(hs) + hs * 0.7) / 2, ln, hs, hw, INK, a, fill); yy += lh(hs)
    yy += gap
    for ln in bl:
        out += t(tx, yy + (lh(bs) + bs * 0.7) / 2, ln, bs, 500, bfill, a, fill); yy += lh(bs)
    return out, h


def arrow(x1, y1, x2, y2, c=INK2, sw=2.5, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = "ar" if c == CORAL_D else ("ag" if c == GREEN else "a")
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{c}" stroke-width="{sw}" stroke-linecap="round"{d} marker-end="url(#{m})"/>'


def line(x1, y1, x2, y2, c=LINE, sw=1.5, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{c}" stroke-width="{sw}"{d}/>'


def rect(x, y, w, h, fill, stroke="none", sw=1, r=0, op=None):
    o = f' opacity="{op}"' if op is not None else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{o}/>'


def circle(cx, cy, r, fill, stroke="none", sw=1):
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def path(d, stroke=INK2, fill="none", sw=2.5, dash=None, marker=False):
    ds = f' stroke-dasharray="{dash}"' if dash else ""
    m = ' marker-end="url(#a)"' if marker else ""
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"{ds}{m}/>'


def badge(cx, cy, n, fill=GOLD):
    return circle(cx, cy, 14, fill, INK, 1.25) + t(cx, cy + 6, str(n), 16, 800, INK, "middle", fill)


def title(s, y=38, size=20):
    """The diagram's headline, wrapped. Returns (svg, next free y)."""
    out, last = para(24, y, W - 48, s, size, 800)
    return out, last + 22


DEFS = (f'<defs><filter id="sh" x="-8%" y="-8%" width="116%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" '
        f'flood-color="#16233f" flood-opacity=".12"/></filter>'
        f'<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{INK2}"/></marker>'
        f'<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{CORAL_D}"/></marker>'
        f'<marker id="ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{GREEN}"/></marker></defs>')


def svg(h, ttl, desc, body):
    h = int(math.ceil(h)) + 30           # a footer strip of its own for the course mark
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {h}" width="{W}" height="{h}" role="img" aria-labelledby="t d">'
            f'<title id="t">{escape(ttl)}</title><desc id="d">{escape(desc)}</desc>{DEFS}'
            f'<rect width="{W}" height="{h}" fill="#ffffff"/><rect width="{W}" height="5" fill="{GOLD}"/>'
            f'<g style="{FONT}">{body}{t(W - 16, h - 10, "NGG · Learn", 16, 600, MUTED, "end")}</g></svg>')


# ── Templates ────────────────────────────────────────────────────────────────────────────────────────────

def steps_v(ttl, steps, numbered=True, note=None, hl=None, fills=None):
    """A vertical process: numbered cards joined by arrows. steps = [(head, detail)]."""
    b, y = title(ttl)
    x, w = 24, W - 48
    off = 40 if numbered else 0
    for i, (h, d) in enumerate(steps):
        f = (fills[i] if fills else (GOLD_T if hl is not None and i in hl else SOFT))
        c, ch = card(x + off, y, w - off, h, d, f)
        b += c
        if numbered: b += badge(x + 16, y + ch / 2, i + 1)
        y += ch
        if i < len(steps) - 1:
            b += arrow(x + off + (w - off) / 2, y + 2, x + off + (w - off) / 2, y + 20); y += 24
    if note:
        n, last = para(24, y + 30, W - 48, note, 16, 600, INK)
        b += n; y = last + 4
    return b, y + 10


def cycle(ttl, items, centre, r=None, bw=150):
    """A loop: labelled stations round a circle, arrows between them that start and stop clear of the boxes."""
    b, y0 = title(ttl)
    n = len(items)
    r = r or (150 if n <= 4 else 172)
    cards = []
    for i, it in enumerate(items):
        head, sub = it if isinstance(it, tuple) else (it, None)
        cards.append((head, sub, card(0, 0, bw, head, sub, hs=16, a="middle", pad=10)[1]))
    hmax = max(c[2] for c in cards)
    cx, cy = W / 2, y0 + r + hmax / 2 + 6
    pos = []
    for i in range(n):
        a = -math.pi / 2 + i * 2 * math.pi / n
        pos.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    b += circle(cx, cy, r, "none", SOFT, 18)

    def clear(px, py):
        for (x, y), c in zip(pos, cards):
            if abs(px - x) < bw / 2 + 10 and abs(py - y) < c[2] / 2 + 10:
                return False
        return True
    for i in range(n):
        a1 = -math.pi / 2 + i * 2 * math.pi / n
        a2 = a1 + 2 * math.pi / n
        samples = [a1 + (a2 - a1) * k / 200 for k in range(201)]
        ok = [a for a in samples if clear(cx + r * math.cos(a), cy + r * math.sin(a))]
        if len(ok) < 8: continue
        s1, s2 = ok[0], ok[-1]
        p1 = (cx + r * math.cos(s1), cy + r * math.sin(s1)); p2 = (cx + r * math.cos(s2), cy + r * math.sin(s2))
        b += path(f"M{p1[0]:.1f} {p1[1]:.1f} A{r} {r} 0 0 1 {p2[0]:.1f} {p2[1]:.1f}", marker=True)
    for i, ((x, y), (head, sub, hgt)) in enumerate(zip(pos, cards)):
        c, _ = card(x - bw / 2, y - hgt / 2, bw, head, sub, GOLD_T if i == 0 else SOFT, hs=16, a="middle", pad=10)
        b += c
    if centre:
        inner = min(abs(x - cx) - bw / 2 for x, y in pos if abs(y - cy) < r * 0.75) if n > 2 else r
        cl = wrap(centre, max(2 * inner - 24, 120), 17, 800)
        for k, ln in enumerate(cl):
            b += t(cx, cy + 6 - (len(cl) - 1) * 11 + k * 22, ln, 17, 800, INK, "middle")
    return b, cy + r + hmax / 2 + 20


def table(x, y, headers, rows, colw, rowh=34, fills=None, hfill=GOLD_T, bold_rows=(), align=None):
    """A spreadsheet-like grid. fills = {(r, c): colour}. Text must fit its cell or it raises."""
    out = ""
    xs = [x]
    for wv in colw: xs.append(xs[-1] + wv)
    allrows = ([headers] if headers else []) + rows
    for r, row in enumerate(allrows):
        yy = y + r * rowh
        is_h = headers and r == 0
        for c, v in enumerate(row):
            f = hfill if is_h else (fills or {}).get((r - (1 if headers else 0), c), WHITE)
            out += rect(xs[c], yy, colw[c], rowh, f, LINE, 1)
            if v == "" or v is None: continue
            wt = 700 if is_h or (r - (1 if headers else 0)) in bold_rows else 500
            al = (align or ["start"] * len(colw))[c]
            assert tw(str(v), 16, wt) <= colw[c] - 12, f"cell too narrow for {v!r}"
            tx = xs[c] + 8 if al == "start" else (xs[c] + colw[c] / 2 if al == "middle" else xs[c] + colw[c] - 8)
            out += t(tx, yy + rowh / 2 + 6, str(v), 16, wt, INK, al, f)
    return out, y + len(allrows) * rowh


def matrix2(ttl, xlab, ylab, quads, note=None, size=220):
    """A 2×2: quads = [top-left, top-right, bottom-left, bottom-right] as (head, body, fill)."""
    b, y = title(ttl)
    x0 = 92
    cw = (W - x0 - 24) / 2
    ch = size / 2 + 40
    for i, (h, d, f) in enumerate(quads):
        qx, qy = x0 + (i % 2) * cw, y + (i // 2) * ch
        b += rect(qx, qy, cw, ch, f, WHITE, 3)
        cc, _ = para(qx + 14, qy + 30, cw - 28, h, 18, 800, INK, bg=f)
        b += cc
        if d:
            dd, _ = para(qx + 14, qy + 30 + 26 * nlines(h, cw - 28, 18, 800), cw - 28, d, 16, 500, INK2, bg=f)
            b += dd
    gy = y + 2 * ch
    b += arrow(x0, gy + 14, W - 30, gy + 14) + t((x0 + W - 24) / 2, gy + 40, xlab, 16, 700, INK, "middle")
    b += arrow(x0 - 14, gy, x0 - 14, y + 4)
    b += f'<text transform="translate({x0 - 26} {(y + gy) / 2}) rotate(-90)" font-size="16" font-weight="700" fill="{INK}" text-anchor="middle">{escape(ylab)}</text>'
    yy = gy + 52
    if note:
        n, last = para(24, yy + 16, W - 48, note, 16, 600, INK)
        b += n; yy = last + 4
    return b, yy + 10


def compare(ttl, left, right, lf=CORAL_T, rf=GREEN_T, note=None, y=None):
    """Two columns side by side: (head, [lines])."""
    b, y0 = title(ttl)
    y = y or y0
    cw = (W - 48 - 16) / 2
    hmax = 0
    for k, (head, items, f) in enumerate(((left[0], left[1], lf), (right[0], right[1], rf))):
        x = 24 + k * (cw + 16)
        lines = []
        for it in items: lines += [(ln, j == 0) for j, ln in enumerate(wrap(it, cw - 46, 16, 500))]
        hh = 54 + len(lines) * lh(16) + 8 * len(items) + 6
        hmax = max(hmax, hh)
    for k, (head, items, f) in enumerate(((left[0], left[1], lf), (right[0], right[1], rf))):
        x = 24 + k * (cw + 16)
        b += box(x, y, cw, hmax, f, LINE)
        b += t(x + 14, y + 30, head, 18, 800, INK, bg=f)
        yy = y + 58
        for it in items:
            ls = wrap(it, cw - 46, 16, 500)
            b += circle(x + 20, yy - 5, 4, INK2)
            for j, ln in enumerate(ls):
                b += t(x + 32, yy, ln, 16, 500, INK, bg=f); yy += lh(16)
            yy += 8
    y += hmax
    if note:
        n, last = para(24, y + 30, W - 48, note, 16, 600, INK)
        b += n; y = last + 4
    return b, y + 10


def chain_h(ttl, items, y=None, bw=None, note=None, fills=None):
    """A horizontal chain of boxes (2–4) joined by arrows: items = [(head, sub)]."""
    b, y0 = title(ttl)
    y = y or y0
    n = len(items)
    gap = 26 if n < 5 else 16
    bw = bw or (W - 48 - gap * (n - 1)) / n
    hs = [card(0, 0, bw, h, s, hs=16, a="middle", pad=8)[1] for h, s in items]
    hm = max(hs)
    for i, (h, s) in enumerate(items):
        x = 24 + i * (bw + gap)
        c, _ = card(x, y, bw, h, s, (fills[i] if fills else (GOLD_T if i == n - 1 else SOFT)), hs=16, a="middle", pad=8, minh=hm)
        b += c
        if i < n - 1: b += arrow(x + bw + 3, y + hm / 2, x + bw + gap - 3, y + hm / 2)
    y += hm
    if note:
        nn, last = para(24, y + 30, W - 48, note, 16, 600, INK)
        b += nn; y = last + 4
    return b, y + 10


def notes(y, s, size=16, w=600, fill=INK):
    n, last = para(24, y, W - 48, s, size, w, fill)
    return n, last + 10
