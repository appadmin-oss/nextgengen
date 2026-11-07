"""
The core courses' own media: diagrams (SVG) and the worked-example pages that become screenshots.

Every picture here is drawn for NGG, not copied — so it can ship with the code, print on a church-hall
printer, and be read by a screen reader (each SVG carries a <title> and <desc>). Ink is #16233f on white
(15:1) and accents carry dark text, so every label clears 4.5:1 (CLAUDE.md §9: print is not exempt).
"""
from html import escape

INK, INK2, LINE, SOFT, GOLD, TEAL, CORAL, GREEN = "#16233f", "#3d4560", "#c9cedb", "#f3f5fa", "#f5b026", "#20b2c9", "#ef6b4d", "#1d6b30"
FONT = "font-family:'Inter','Segoe UI',Arial,sans-serif"


def svg(w, h, title, desc, body):
    h = h + 22   # a footer strip of its own for the course mark, so it never meets a caption
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t d">'
            f'<title id="t">{escape(title)}</title><desc id="d">{escape(desc)}</desc>'
            f'<defs><filter id="sh" x="-8%" y="-8%" width="116%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#16233f" flood-opacity=".13"/></filter></defs>'
            f'<rect width="{w}" height="{h}" fill="#ffffff"/><rect width="{w}" height="5" fill="{GOLD}"/>'
            f'<g style="{FONT}">{body}<text x="{w - 14}" y="{h - 10}" font-size="11" font-weight="700" fill="#5a6488" text-anchor="end">NGG · Learn</text></g></svg>')


def text(x, y, s, size=16, weight=500, fill=INK, anchor="start"):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>'


def box(x, y, w, h, fill=SOFT, stroke=LINE, r=12):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.25" filter="url(#sh)"/>'


def arrow(x1, y1, x2, y2, c=INK2):
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#a)"/>')


DEFS = f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="{INK2}"/></marker></defs>'


def diagrams():
    D = {}
    # ── Data Appreciation ──
    steps = [("Problem", "What do we want to know?"), ("Plan", "What will we measure, how?"), ("Data", "Collect it, tidy it"),
             ("Analysis", "Summaries and charts"), ("Conclusion", "Answer, and new questions")]
    import math
    cx, cy, R = 360, 250, 165
    b = DEFS
    pts = []
    for i, (h, s) in enumerate(steps):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        x, y = cx + R * math.cos(a), cy + R * math.sin(a)
        pts.append((x, y))
    b += f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="{SOFT}" stroke-width="22"/>'
    for i in range(5):
        a1 = -math.pi / 2 + i * 2 * math.pi / 5 + 0.36
        a2 = -math.pi / 2 + (i + 1) * 2 * math.pi / 5 - 0.36
        x1, y1, x2, y2 = cx + R * math.cos(a1), cy + R * math.sin(a1), cx + R * math.cos(a2), cy + R * math.sin(a2)
        b += f'<path d="M{x1:.1f} {y1:.1f} A{R} {R} 0 0 1 {x2:.1f} {y2:.1f}" fill="none" stroke="{INK2}" stroke-width="2.5" stroke-linecap="round" marker-end="url(#a)"/>'
    for i, ((h, s), (x, y)) in enumerate(zip(steps, pts)):
        b += box(x - 92, y - 34, 184, 68, GOLD if i == 0 else SOFT, INK if i == 0 else LINE)
        b += text(x, y - 6, f"{i + 1}. {h}", 17, 700, INK, "middle") + text(x, y + 16, s, 12.5, 500, INK2, "middle")
    b += text(cx, cy + 6, "PPDAC", 26, 800, INK, "middle")
    D["ppdac.svg"] = svg(720, 500, "The data investigation cycle (PPDAC)", "Five steps in a loop: Problem, Plan, Data, Analysis, Conclusion — and the conclusion raises the next question.", b)

    b = text(360, 40, "What kind of data is it?", 22, 800, INK, "middle")
    b += box(250, 60, 220, 50, GOLD, INK) + text(360, 92, "Data", 18, 700, INK, "middle") + DEFS
    b += arrow(320, 112, 180, 160) + arrow(400, 112, 540, 160)
    b += box(70, 162, 220, 56) + text(180, 188, "Categorical", 17, 700, INK, "middle") + text(180, 208, "names a group", 12.5, 500, INK2, "middle")
    b += box(430, 162, 220, 56) + text(540, 188, "Numerical", 17, 700, INK, "middle") + text(540, 208, "a count or a measurement", 12.5, 500, INK2, "middle")
    b += text(180, 250, "e.g. favourite food, state, yes/no", 13, 500, INK2, "middle")
    b += arrow(500, 220, 440, 270) + arrow(580, 220, 640, 270)
    b += box(340, 272, 190, 52) + text(435, 296, "Discrete", 16, 700, INK, "middle") + text(435, 314, "counted: 3 siblings", 12.5, 500, INK2, "middle")
    b += box(560, 272, 150, 52) + text(635, 296, "Continuous", 16, 700, INK, "middle") + text(635, 314, "measured: 1.62 m", 12.5, 500, INK2, "middle")
    D["data-types.svg"] = svg(720, 350, "Kinds of data", "Data is categorical (it names a group) or numerical; numerical data is discrete (counted) or continuous (measured).", b)

    rows = [("Compare amounts between groups", "Bar chart"), ("Show change over time", "Line chart"), ("Show parts of ONE whole (few parts)", "Pie chart — or a bar chart"),
            ("Show how values are spread", "Histogram / dot plot"), ("Is one thing related to another?", "Scatter plot")]
    b = text(30, 42, "Choose the chart by the QUESTION you are asking", 21, 800)
    for i, (q, c) in enumerate(rows):
        y = 66 + i * 62
        b += box(30, y, 410, 50) + text(46, y + 31, q, 15, 600) + box(470, y, 220, 50, GOLD, INK) + text(580, y + 31, c, 15, 700, INK, "middle")
        b += DEFS + arrow(442, y + 25, 466, y + 25)
    D["chart-chooser.svg"] = svg(720, 390, "Choosing a chart", "Bar for comparing groups, line for change over time, pie only for parts of one whole, histogram or dot plot for spread, scatter for relationships.", b)

    vals = [2, 3, 3, 3, 4, 5, 6, 30]
    b = text(30, 40, "Pocket money a week (₦100s) — eight children", 19, 800)
    b += f'<line x1="40" y1="230" x2="690" y2="230" stroke="{INK2}" stroke-width="2"/>'
    sx = lambda v: 50 + v * 20.5
    seen = {}
    for v in vals:
        k = seen.get(v, 0); seen[v] = k + 1
        b += f'<circle cx="{sx(v)}" cy="{215 - k * 20}" r="8" fill="{TEAL}" stroke="{INK}" stroke-width="1"/>'
    for v in range(0, 32, 5): b += text(sx(v), 252, str(v), 12, 500, INK2, "middle")
    for v, lab, col, dy in [(3, "Mode 3", GREEN, 80), (3.5, "Median 3.5", INK, 105), (7, "Mean 7", CORAL, 130)]:
        b += f'<line x1="{sx(v)}" y1="{dy - 12}" x2="{sx(v)}" y2="225" stroke="{col}" stroke-width="2" stroke-dasharray="5 4"/>' + text(sx(v) + 6, dy, lab, 14, 700, col if col != CORAL else "#a3361f")
    b += text(sx(30), 170, "one outlier", 13, 700, "#a3361f", "middle")
    b += text(30, 290, "One child on ₦3,000 drags the MEAN up to 7; the MEDIAN (3.5) still describes a typical child.", 14.5, 600, INK)
    D["averages.svg"] = svg(720, 310, "Mean, median and mode with an outlier", "Eight values, one very large: the mean is pulled to 7 while the median stays at 3.5 and the mode is 3.", b)

    def bars(x0, base, top, title, note):
        out = text(x0 + 140, 40, title, 17, 800, INK, "middle")
        data = [("Mon", 96), ("Tue", 98), ("Wed", 97)]
        for i, (d, v) in enumerate(data):
            h = (v - base) / (top - base) * 220
            out += f'<rect x="{x0 + 40 + i * 80}" y="{280 - h}" width="56" height="{h}" fill="{TEAL}" stroke="{INK}"/>' + text(x0 + 68 + i * 80, 300, d, 13, 600, INK, "middle")
        out += f'<line x1="{x0 + 30}" y1="280" x2="{x0 + 290}" y2="280" stroke="{INK2}"/><line x1="{x0 + 30}" y1="60" x2="{x0 + 30}" y2="280" stroke="{INK2}"/>'
        out += text(x0 + 24, 284, str(base), 12, 500, INK2, "end") + text(x0 + 24, 66, str(top), 12, 500, INK2, "end") + text(x0 + 140, 330, note, 13, 600, INK2, "middle")
        return out
    b = bars(20, 95, 99, "Axis starts at 95", "Looks like a huge rise") + bars(380, 0, 100, "Axis starts at 0", "Really: almost no change")
    D["misleading-axis.svg"] = svg(720, 350, "A truncated axis exaggerates", "The same three attendance figures (96, 98, 97) drawn twice: from 95 the bars look wildly different; from 0 they are nearly equal.", b)

    b = DEFS + box(255, 40, 210, 60, GOLD, INK) + text(360, 76, "Hot weather", 18, 700, INK, "middle")
    b += arrow(300, 102, 170, 180) + arrow(420, 102, 550, 180)
    b += box(60, 182, 220, 60) + text(170, 217, "More cold drinks sold", 15, 700, INK, "middle")
    b += box(440, 182, 220, 60) + text(550, 217, "More people swimming", 15, 700, INK, "middle")
    b += f'<line x1="282" y1="212" x2="438" y2="212" stroke="{CORAL}" stroke-width="2.5" stroke-dasharray="7 5"/>' + text(360, 202, "related…", 13, 700, "#a3361f", "middle") + text(360, 268, "…but neither causes the other", 13, 700, "#a3361f", "middle")
    b += text(360, 306, "Correlation is not causation: look for a hidden third thing.", 15, 700, INK, "middle")
    D["correlation.svg"] = svg(720, 334, "Correlation is not causation", "Hot weather raises both cold-drink sales and swimming, so the two rise together without one causing the other.", b)

    import random
    random.seed(7)
    b = text(180, 36, "A biased sample", 18, 800, INK, "middle") + text(540, 36, "A random sample", 18, 800, INK, "middle")
    for side, x0 in ((0, 30), (1, 390)):
        b += box(x0, 50, 300, 230, "#ffffff")
        for i in range(60):
            x, y = x0 + 20 + (i % 10) * 28, 70 + (i // 10) * 34
            pick = (side == 0 and i % 10 < 2 and i // 10 < 3) or (side == 1 and random.random() < .1)
            b += f'<circle cx="{x}" cy="{y}" r="9" fill="{GOLD if pick else SOFT}" stroke="{INK if pick else LINE}" stroke-width="{2 if pick else 1}"/>'
    b += text(180, 305, "Only the front row asked", 14, 600, INK2, "middle") + text(540, 305, "Everyone had an equal chance", 14, 600, INK2, "middle")
    D["sampling.svg"] = svg(720, 320, "Biased and random samples", "Two classes of 60. On the left only the front corner is asked; on the right, six people chosen at random from the whole room.", b)

    hdr = ["Name", "Age", "Centre", "Hours"]
    rws = [["Ada", "12", "Egbeda", "3"], ["Tobi", "14", "Ikeja", "5"], ["Zainab", "13", "Egbeda", "4"]]
    b = text(30, 36, "Tidy data: one row per person, one column per thing measured", 17, 800)
    for j, h in enumerate(hdr): b += box(30 + j * 160, 54, 160, 40, GOLD, INK, 0) + text(110 + j * 160, 80, h, 15, 700, INK, "middle")
    for i, r in enumerate(rws):
        for j, c in enumerate(r): b += box(30 + j * 160, 94 + i * 40, 160, 40, "#ffffff", LINE, 0) + text(110 + j * 160, 120 + i * 40, c, 15, 500, INK, "middle")
    b += text(30, 245, "No merged cells, no totals in the middle, one unit per column (hours, not \"3 hrs\").", 14, 600, INK2)
    D["tidy-data.svg"] = svg(700, 265, "Tidy data", "A table with a header row and one row per person: Name, Age, Centre, Hours.", b)

    # ── Desktop Publishing ──
    b = f'<rect x="60" y="40" width="400" height="540" fill="{CORAL}" opacity=".25"/>' + f'<rect x="78" y="58" width="364" height="504" fill="#ffffff" stroke="{INK}" stroke-width="2.5"/>'
    b += f'<rect x="106" y="86" width="308" height="448" fill="none" stroke="{TEAL}" stroke-width="2" stroke-dasharray="8 6"/>'
    b += text(260, 300, "Your design", 20, 700, INK2, "middle")
    for y, lab, sub, col in [(60, "Bleed (3 mm)", "background colour runs into it", "#a3361f"), (200, "Trim line", "where the paper is cut", INK), (340, "Safe area", "keep text and logos inside", "#0b6e80")]:
        b += text(490, y + 20, lab, 17, 800, col) + text(490, y + 42, sub, 13.5, 500, INK2)
    D["page-anatomy.svg"] = svg(760, 620, "Bleed, trim and safe area", "A printed page: the bleed runs 3 mm past the trim line where the paper is cut; text and logos stay inside the safe area.", b)

    b = text(40, 70, "NGG Saturday Showcase", 40, 800) + text(40, 112, "Music, code and art by the Club's members", 22, 600, INK2)
    b += text(40, 170, "Saturday 14 March · 11am · Egbeda Centre", 17, 700, "#0b6e80")
    b += text(40, 215, "Come and see what a term of practice sounds like. Free entry; bring", 15, 400) + text(40, 237, "your family. Refreshments from the catering class.", 15, 400)
    b += text(40, 280, "Photo: the 2026 junior band", 12, 400, INK2)
    b = box(24, 24, 600, 280, "#ffffff", LINE) + b
    for i, (y, lab) in enumerate([(58, "Headline — biggest, boldest"), (104, "Subheading — supports it"), (164, "Key facts — colour or weight"), (222, "Body — 15–16 px, easy to read"), (276, "Caption — smallest")]):
        b += f'<line x1="630" y1="{y}" x2="664" y2="{y}" stroke="{CORAL}" stroke-width="1.5" stroke-dasharray="3 3"/>'
        b += f'<circle cx="680" cy="{y}" r="12" fill="{GOLD}" stroke="{INK}"/>' + text(680, y + 5, str(i + 1), 13, 800, INK, "middle")
        b += text(700, y + 5, lab, 14, 700, INK)
    D["type-hierarchy.svg"] = svg(940, 330, "Typographic hierarchy", "A flyer's text at five levels, from a large bold headline down to a small caption, so the eye reads them in order.", b)

    b = text(30, 36, "A 3-column grid: everything lines up with something", 18, 800)
    b += f'<rect x="30" y="54" width="660" height="400" fill="#ffffff" stroke="{INK}" stroke-width="2"/>'
    for i in range(3): b += f'<rect x="{50 + i * 213}" y="74" width="193" height="360" fill="{TEAL}" opacity=".12"/>'
    b += box(50, 74, 619, 70, GOLD, INK, 4) + text(360, 116, "Headline spans all three columns", 17, 700, INK, "middle")
    b += box(50, 160, 406, 160, SOFT, INK2, 4) + text(253, 245, "Photo spans two", 15, 600, INK, "middle")
    b += box(476, 160, 193, 274, SOFT, INK2, 4) + text(572, 300, "Sidebar", 15, 600, INK, "middle")
    b += box(50, 336, 193, 98, SOFT, INK2, 4) + text(146, 390, "Story A", 15, 600, INK, "middle") + box(263, 336, 193, 98, SOFT, INK2, 4) + text(359, 390, "Story B", 15, 600, INK, "middle")
    D["grid.svg"] = svg(720, 480, "A three-column layout grid", "A page divided into three columns with gutters; the headline spans three, a photo two, a sidebar one, and two stories one each.", b)

    panels = [("Contrast", "make different things\nlook very different"), ("Repetition", "repeat fonts, colours\nand shapes"), ("Alignment", "every item lines up\nwith something"), ("Proximity", "group related things;\nspace unrelated ones")]
    b = ""
    for i, (h, s) in enumerate(panels):
        x, y = 30 + (i % 2) * 345, 30 + (i // 2) * 170
        b += box(x, y, 325, 150) + text(x + 20, y + 42, h, 22, 800)
        for k, line in enumerate(s.split("\n")): b += text(x + 20, y + 80 + k * 24, line, 15.5, 500, INK2)
    D["crap.svg"] = svg(720, 370, "Four principles of layout", "Contrast, repetition, alignment and proximity — the four checks for any page.", b)

    b = text(180, 40, "Screen: RGB (light)", 18, 800, INK, "middle") + text(540, 40, "Print: CMYK (ink)", 18, 800, INK, "middle")
    for (cx, cy, c) in [(150, 120, "#ff3b30"), (210, 120, "#34c759"), (180, 170, "#0a84ff")]:
        b += f'<circle cx="{cx}" cy="{cy}" r="55" fill="{c}" opacity=".55"/>'
    for (cx, cy, c) in [(510, 120, "#00b7eb"), (570, 120, "#ff00a0"), (540, 170, "#ffe600")]:
        b += f'<circle cx="{cx}" cy="{cy}" r="55" fill="{c}" opacity=".55"/>'
    b += text(180, 262, "Red + green + blue light → white", 14, 600, INK2, "middle") + text(540, 262, "Cyan + magenta + yellow (+ black)", 14, 600, INK2, "middle")
    b += text(360, 300, "Design for print in CMYK, or check a proof: bright screen colours print duller.", 15, 700, INK, "middle")
    D["rgb-cmyk.svg"] = svg(720, 320, "RGB for screens, CMYK for print", "Screens mix red, green and blue light; printers mix cyan, magenta, yellow and black ink, so some bright screen colours cannot print.", b)

    b = text(180, 36, "72 ppi: fine on screen", 17, 800, INK, "middle") + text(540, 36, "300 ppi: sharp in print", 17, 800, INK, "middle")
    for i in range(6):
        for j in range(6): b += f'<rect x="{90 + i * 30}" y="{56 + j * 30}" width="30" height="30" fill="{TEAL if (i + j) % 3 else GOLD}" stroke="#ffffff"/>'
    for i in range(18):
        for j in range(18): b += f'<rect x="{450 + i * 10}" y="{56 + j * 10}" width="10" height="10" fill="{TEAL if (i + j) % 3 else GOLD}"/>'
    b += text(360, 270, "Same 1-inch square of a photo. Print needs about four times as many pixels each way.", 14.5, 600, INK, "middle")
    D["resolution.svg"] = svg(720, 290, "Resolution: 72 versus 300 pixels per inch", "A one-inch square drawn with 6 by 6 large pixels and with 18 by 18 small ones: print needs the finer one.", b)

    b = text(360, 34, "A tri-fold brochure: six panels, read in this order", 18, 800, INK, "middle")
    for side, y0, labs in (("Outside", 54, ["5 Inside flap", "6 Back cover", "1 Front cover"]), ("Inside", 214, ["2 Left inside", "3 Middle inside", "4 Right inside"])):
        b += text(30, y0 + 16, side, 15, 700, INK2)
        for i, l in enumerate(labs): b += box(110 + i * 200, y0, 190, 130, GOLD if l.startswith("1") else SOFT, INK if l.startswith("1") else LINE, 4) + text(205 + i * 200, y0 + 72, l, 15, 700, INK, "middle")
    D["trifold.svg"] = svg(720, 360, "Tri-fold brochure panel order", "The outside of the sheet holds the inside flap, back cover and front cover; the inside holds three panels read left to right.", b)
    return D


# Worked examples, rendered to PNG by tools/learn-core/shots.js — screenshots of real worked examples we drew,
# not of anybody's product. Each is a plain page the screenshot script loads at 2x.
SHOT_CSS = """body{margin:0;font:15px/1.4 Inter,'Segoe UI',Arial,sans-serif;color:#16233f;background:#fff}
.bar{display:flex;gap:6px;align-items:center;padding:8px 12px;background:#f3f5fa;border-bottom:1px solid #c9cedb;font-weight:600}
.fx{padding:6px 12px;border-bottom:1px solid #c9cedb;font-family:monospace}
table{border-collapse:collapse;margin:0}td,th{border:1px solid #c9cedb;padding:6px 10px;min-width:70px;text-align:left}
th{background:#eef1f8;font-weight:700}.sel{outline:2px solid #1a73e8;outline-offset:-2px;background:#e8f0fe}.k{color:#3d4560}"""


def shots():
    S = {}
    S["sheets-summary"] = f"""<!doctype html><meta charset=utf-8><style>{SHOT_CSS}</style>
<div class=bar>Pocket money survey — Sheet1</div><div class=fx><span class=k>B11 =</span> MEDIAN(B2:B9)</div>
<table><tr><th></th><th>A</th><th>B</th></tr>
{''.join(f'<tr><th>{i+1}</th><td>{n}</td><td>{v}</td></tr>' for i,(n,v) in enumerate([('Name','₦ per week'),('Ada','200'),('Tobi','300'),('Zainab','300'),('Kunle','300'),('Ngozi','400'),('Musa','500'),('Efe','600'),('Chidi','3000')]))}
<tr><th>10</th><td><b>Mean</b></td><td>=AVERAGE(B2:B9) → 700</td></tr>
<tr><th>11</th><td><b>Median</b></td><td class=sel>350</td></tr>
<tr><th>12</th><td><b>Mode</b></td><td>=MODE(B2:B9) → 300</td></tr></table>"""
    bars = ''.join(f'<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:90px">{d}</span><span style="display:inline-block;height:26px;width:{v*5}px;background:#20b2c9;border:1px solid #16233f"></span><b>{v}</b></div>' for d, v in [('Jollof', 64), ('Amala', 41), ('Suya', 52), ('Fried rice', 37)])
    S["sheets-chart"] = f"""<!doctype html><meta charset=utf-8><style>{SHOT_CSS}</style>
<div class=bar>Favourite food — Chart editor</div><div style="padding:16px"><h3 style="margin:0 0 4px">Favourite Saturday lunch</h3>
<p class=k style="margin:0 0 10px">Votes from 194 members, March 2026 · bar chart, axis from 0</p>{bars}</div>"""
    S["flyer-before-after"] = """<!doctype html><meta charset=utf-8><style>body{margin:0;display:flex;gap:16px;padding:16px;background:#e9ecf3;font-family:Arial,sans-serif}
.p{width:300px;height:420px;background:#fff;padding:18px;box-sizing:border-box;border:1px solid #c9cedb}.lab{font:700 13px Arial;margin:0 0 8px}</style>
<div><p class=lab>Before: everything shouts</p><div class=p style="text-align:center">
<p style="font:italic 26px Georgia;color:#a3361f;margin:0">!!! SHOWCASE !!!</p><p style="font:700 20px 'Comic Sans MS',cursive;color:#2b7a0b">MUSIC CODE ART</p>
<p style="font:15px Impact;color:#5b2a86">SATURDAY 14 MARCH 11AM EGBEDA CENTRE FREE ENTRY BRING YOUR FAMILY REFRESHMENTS FROM THE CATERING CLASS</p></div></div>
<div><p class=lab>After: one font, a clear order, aligned left</p><div class=p>
<p style="font:800 30px Arial;margin:0 0 6px;color:#16233f">Saturday Showcase</p><p style="font:600 16px Arial;margin:0 0 18px;color:#3d4560">Music, code and art by the Club's members</p>
<div style="background:#f5b026;padding:10px;font:700 15px Arial;color:#16233f;margin-bottom:16px">Sat 14 March · 11am<br>Egbeda Centre · Free</div>
<p style="font:15px/1.5 Arial;margin:0;color:#16233f">Come and hear what a term of practice sounds like. Bring your family — refreshments from the catering class.</p></div></div>"""
    S["newsletter-page"] = """<!doctype html><meta charset=utf-8><style>body{margin:0;padding:16px;background:#e9ecf3;font-family:Georgia,serif}
.pg{width:560px;background:#fff;margin:auto;padding:28px;box-sizing:border-box;border:1px solid #c9cedb;color:#16233f}
.mast{display:flex;justify-content:space-between;border-bottom:3px solid #16233f;padding-bottom:8px;font-family:Arial}
.cols{columns:2;column-gap:22px;font-size:13.5px;line-height:1.5;margin-top:14px}h2{font:800 22px Arial;margin:12px 0 4px}.ph{height:110px;background:#c9e9ef;margin:6px 0;display:flex;align-items:center;justify-content:center;font:600 12px Arial}</style>
<div class=pg><div class=mast><b style="font:800 24px Arial">The Club Times</b><span style="font:600 12px Arial">Issue 3 · March 2026</span></div>
<h2>Junior band takes the stage</h2><p style="font:italic 14px Georgia;margin:0;color:#3d4560">Twelve members, eight weeks, one standing ovation.</p>
<div class=cols><div class=ph>Photo: the junior band</div><p>Eight Saturdays ago most of them had never held a drumstick. On the 14th the junior band opened the showcase with two songs and an encore the audience asked for.</p>
<p>"We practised the hard bar until it was boring," said the drummer. Their instructor kept a chart of every rehearsal on the music-room wall.</p><p>Next term the band takes requests: see page 4.</p></div></div>"""
    return S
