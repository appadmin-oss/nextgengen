"""
"Remember it" cards for the Maths Lab and English Lab (owner, 7 Nov 2026: "Start with the Math Lab and English Lab
illustrations. Add fun to remember gifs" — then "Ensure they are research-driven and -optimized, if not drop them").

Looping GIFs were dropped on the evidence, and this is what replaced them:

  · A picture of the IDEA, never decoration. Interesting-but-irrelevant images and motion cost learning (the
    seductive-details effect, Rey 2012 meta-analysis; Mayer's coherence principle). Every frame here shows the
    thing being learned — the blocks of 345, the scale that stays balanced — and nothing else.
  · Segmented and learner-paced: three frames the learner steps through themselves, not an animation that runs
    past them (Mayer's segmenting principle; the transient-information effect). Nothing moves on its own, so
    there is nothing to pause (WCAG 2.2.2) and nothing for reduced-motion to switch off.
  · Words beside the picture, short (spatial contiguity; signalling): each frame carries one caption.
  · At most ONE memory hook per card, and only where the research supports one: an ordered rule (BODMAS,
    SOHCAH TOA) or a word's parts (the keyword method for vocabulary, Atkinson & Raugh 1975). No hook is
    invented for an idea that is better understood than memorised.
  · It ends in retrieval: "cover it and say it" — recall beats re-reading (Roediger & Karpicke 2006).
  · Tiny: each frame an SVG of a few KB, fetched only when the card is opened — the Lite mode's phones too.

Run:  python3 tools/lab-remember/build.py
Out:  assets/lab-media/remember/*.svg  and  assets/lab-media/remember/remember.json
"""
import json, os, sys
from html import escape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "assets", "lab-media", "remember")
INK, INK2, LINE, SOFT, GOLD, TEAL, CORAL, GREEN = "#16233f", "#3d4560", "#c9cedb", "#f3f5fa", "#f5b026", "#20b2c9", "#ef6b4d", "#1d6b30"
RED_T, TEAL_T = "#a3361f", "#0b6e80"   # text-safe (≥4.5:1 on white) versions of the accents
FONT = "font-family:'Inter','Segoe UI',Arial,sans-serif"
W, H = 640, 330


def svg(title, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{escape(title)}">'
            f'<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="{INK2}"/></marker>'
            f'<filter id="sh" x="-8%" y="-8%" width="116%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#16233f" flood-opacity=".12"/></filter></defs>'
            f'<rect width="{W}" height="{H}" fill="#fff"/><g style="{FONT}">{body}</g></svg>')


def t(x, y, s, size=18, weight=600, fill=INK, anchor="middle"):
    size = max(size, 16)   # read at phone width the frame is about half size: nothing under ~8px on screen
    return f'<text xml:space="preserve" x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(str(s))}</text>'


def r(x, y, w, h, fill=SOFT, stroke=LINE, rx=8, sw=1.5, shadow=True):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{" filter=\"url(#sh)\"" if shadow else ""}/>'


def ln(x1, y1, x2, y2, c=INK2, w=2.5, arrow=False, dash=""):
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{w}" stroke-linecap="round"'
            f'{" stroke-dasharray=\"" + dash + "\"" if dash else ""}{" marker-end=\"url(#a)\"" if arrow else ""}/>')


def circ(x, y, rad, fill=GOLD, stroke=INK, sw=1.5):
    return f'<circle cx="{x}" cy="{y}" r="{rad}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def poly(pts, fill="none", stroke=INK, sw=2.5):
    return f'<polygon points="{" ".join(f"{a},{b}" for a, b in pts)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>'


def words(x, y, parts, size=24):
    """A sentence as coloured chips: [(word, role-colour or None)], laid left to right from x, centred row at y."""
    out, cx = "", x
    for w, c in parts:
        wd = max(28, int(len(w) * size * 0.56)) + 16
        if c: out += r(cx, y - size - 4, wd, size + 18, c, INK if c == GOLD else c, 6, 1.2, False)
        out += t(cx + wd / 2, y + 2, w, size, 700, INK if (not c or c in (GOLD, SOFT, "#d9f2f6", "#fde3dc", "#e3f1e6")) else "#fff")
        cx += wd + 8
    return out


def numline(y, lo, hi, x0=60, x1=580, marks=None):
    sx = lambda v: x0 + (v - lo) * (x1 - x0) / (hi - lo)
    b = ln(x0 - 10, y, x1 + 10, y, INK, 2.5)
    for v in range(lo, hi + 1):
        b += ln(sx(v), y - 7, sx(v), y + 7, INK, 2) + t(sx(v), y + 28, v, 15, 600, INK2)
    return b, sx


CARDS = {}


def card(key, comps, title, frames, recall, hook=""):
    CARDS[key] = {"comps": comps, "title": title, "hook": hook, "recall": recall, "frames": frames}


# ════════════════════════════════════ MATHS ═════════════════════════════════════════

def blocks(x, y, h, tn, o, label=True):
    b = ""
    for i in range(h):
        b += f'<rect x="{x + i * 64}" y="{y}" width="56" height="56" fill="{GOLD}" stroke="{INK}" stroke-width="1.2"/>'
        for k in range(1, 10): b += f'<line x1="{x + i * 64 + k * 5.6}" y1="{y}" x2="{x + i * 64 + k * 5.6}" y2="{y + 56}" stroke="{INK}" stroke-width=".4" opacity=".5"/>'
    xx = x + h * 64 + 14
    for i in range(tn): b += f'<rect x="{xx + i * 14}" y="{y}" width="9" height="56" fill="{TEAL}" stroke="{INK}" stroke-width="1"/>'
    xx += tn * 14 + 14
    for i in range(o): b += f'<rect x="{xx + (i % 3) * 13}" y="{y + 24 + (i // 3) * 13}" width="9" height="9" fill="{CORAL}" stroke="{INK}" stroke-width="1"/>'
    return b

card("place-value", ["MC-004", "MC-009", "MC-010", "MC-013", "MC-028"], "Place value: where a digit sits is what it is worth", [
    (svg("345 as blocks", t(320, 50, "345", 44, 800) + blocks(120, 110, 3, 4, 5) + t(214, 205, "3 hundreds", 17, 700) + t(400, 205, "4 tens", 17, 700, TEAL_T) + t(486, 205, "5 ones", 17, 700, RED_T)),
     "345 is 3 hundreds, 4 tens and 5 ones — say what each digit is WORTH, not just what it is."),
    (svg("Place-value columns", "".join(r(110 + i * 150, 70, 130, 70, SOFT) + t(175 + i * 150, 100, h, 15, 700, INK2) + t(175 + i * 150, 130, d, 30, 800) for i, (h, d) in enumerate([("Hundreds", "3"), ("Tens", "4"), ("Ones", "5")]))
         + t(320, 200, "300  +  40  +  5  =  345", 28, 800) + t(320, 245, "The same digit 4 is worth 4, 40 or 400 — it depends on its column.", 15, 600, INK2)),
     "Each column is worth ten times the one on its right."),
    (svg("Exchange ten for one", blocks(120, 70, 0, 1, 0) + t(165, 160, "1 ten", 16, 700) + ln(210, 98, 290, 98, INK2, 2.5, True) + blocks(310, 70, 0, 0, 9) + blocks(350, 70, 0, 0, 1)
         + t(390, 160, "10 ones", 16, 700) + t(320, 230, "Borrowing is just this swap: one ten becomes ten ones.", 17, 600)),
     "Ten of one column make one of the next — that is all borrowing and carrying are."),
], "Cover the picture. What is the 7 worth in 2,740? And what does borrowing swap?")

b, sx = numline(170, -5, 5)
card("integers", ["MC-008", "MC-021", "MC-022", "MC-023"], "Negative numbers on the number line", [
    (svg("Adding a positive moves right", b + circ(sx(-2), 140, 9) + f'<path d="M{sx(-2)} 130 Q {sx(0.5)} 70 {sx(3)} 130" fill="none" stroke="{TEAL}" stroke-width="3" marker-end="url(#a)"/>'
         + t(sx(0.5), 80, "+5", 20, 800, TEAL_T) + t(320, 270, "−2 + 5 = 3   (add: move RIGHT)", 22, 800)), "Start at −2. Adding 5 moves you five steps to the right: you land on 3."),
    (svg("Adding a negative moves left", b + circ(sx(3), 140, 9) + f'<path d="M{sx(3)} 130 Q {sx(0)} 70 {sx(-3)} 130" fill="none" stroke="{CORAL}" stroke-width="3" marker-end="url(#a)"/>'
         + t(sx(0), 80, "+(−6)", 20, 800, RED_T) + t(320, 270, "3 + (−6) = −3   (add a negative: move LEFT)", 22, 800)), "Adding a negative number is the same as subtracting: you move left."),
    (svg("Subtracting a negative", b + circ(sx(-1), 140, 9) + f'<path d="M{sx(-1)} 130 Q {sx(1)} 70 {sx(3)} 130" fill="none" stroke="{TEAL}" stroke-width="3" marker-end="url(#a)"/>'
         + t(sx(1), 80, "−(−4)", 20, 800, TEAL_T) + t(320, 270, "−1 − (−4) = −1 + 4 = 3", 22, 800)), "Taking away a negative turns you round: −(−4) is +4."),
], "Cover it. Which way do you move for + (−3)? What is 2 − (−5)?")

dots = lambda x0, y0, rows, cols, c=GOLD: "".join(circ(x0 + j * 34, y0 + i * 34, 11, c, INK, 1.2) for i in range(rows) for j in range(cols))
card("equal-groups", ["MC-014", "MC-015", "MC-016", "MC-017", "MC-018"], "Multiplication is equal groups; division undoes it", [
    (svg("3 groups of 4", "".join(r(60 + g * 180, 90, 150, 110, SOFT) + dots(87 + g * 180, 125, 2, 2) + dots(87 + g * 180 + 68, 125, 2, 0) for g in range(3))
         + "".join(dots(87 + g * 180, 125, 2, 2) for g in range(3)) + t(320, 250, "3 groups of 4 = 12", 26, 800)), "3 × 4 means three equal groups of four."),
    (svg("An array turned", dots(110, 90, 3, 4) + t(160, 210, "3 rows of 4", 17, 700) + ln(270, 140, 350, 140, INK2, 2.5, True) + dots(380, 70, 4, 3, TEAL) + t(415, 230, "4 rows of 3", 17, 700)
         + t(320, 285, "3 × 4 = 4 × 3 = 12 — turn it, the total stays", 20, 800)), "Lay the groups out as an array and turn it: the order of a multiplication does not change the answer."),
    (svg("Sharing 14 into groups of 4", dots(80, 100, 1, 4) + dots(240, 100, 1, 4) + dots(400, 100, 1, 4) + dots(240, 170, 1, 2, CORAL)
         + t(320, 250, "14 ÷ 4 = 3 remainder 2", 26, 800) + t(320, 285, "three full groups, two left over", 16, 600, INK2)), "Division asks how many equal groups fit; what cannot make a whole group is the remainder."),
], "Cover it. Draw 2 × 6 as an array in your head. What is 20 ÷ 6, with its remainder?")

def bar(x, y, w, n, shade, c=GOLD):
    return "".join(f'<rect x="{x + i * w / n}" y="{y}" width="{w / n}" height="44" fill="{c if i < shade else "#fff"}" stroke="{INK}" stroke-width="1.5"/>' for i in range(n))
card("fractions", ["MC-025", "MC-026", "MC-027"], "Equivalent fractions: cut finer, the amount stays", [
    (svg("One half", bar(120, 120, 400, 2, 1) + t(320, 220, "1/2", 34, 800) + t(320, 260, "one of two equal parts", 16, 600, INK2)), "A fraction is a number of equal parts: 1/2 is one of two."),
    (svg("Two quarters", bar(120, 80, 400, 2, 1) + bar(120, 160, 400, 4, 2, TEAL) + t(320, 250, "1/2 = 2/4", 32, 800)), "Cut each half in two: twice as many parts, twice as many shaded — the same amount."),
    (svg("Four eighths", bar(120, 50, 400, 2, 1) + bar(120, 110, 400, 4, 2, TEAL) + bar(120, 170, 400, 8, 4, CORAL) + t(320, 260, "1/2 = 2/4 = 4/8", 30, 800)
         + t(320, 295, "multiply top AND bottom by the same number", 16, 600, INK2)), "Multiply (or divide) the top and the bottom by the same number and the fraction is unchanged."),
], "Cover it. Give two fractions equal to 3/4. Why is 2/6 the same as 1/3?")

grid = lambda x, y, n, c: "".join(f'<rect x="{x + (i % 10) * 18}" y="{y + (i // 10) * 18}" width="18" height="18" fill="{c if i < n else "#fff"}" stroke="{LINE}" stroke-width="1"/>' for i in range(100))
card("fdp", ["MC-028", "MC-029", "MC-030"], "Fractions, decimals and percentages are one number", [
    (svg("A hundred grid", grid(230, 50, 25, GOLD) + t(320, 270, "25 out of 100 squares", 20, 800)), "Percent means 'out of a hundred'. 25 of these 100 squares are shaded."),
    (svg("Three ways to write it", grid(60, 60, 25, GOLD) + t(420, 110, "1/4", 34, 800) + t(420, 170, "0.25", 34, 800, TEAL_T) + t(420, 230, "25%", 34, 800, RED_T)), "The same shaded amount is 1/4, 0.25 and 25%."),
    (svg("Converting", t(320, 70, "fraction → decimal: divide top by bottom", 19, 700) + t(320, 105, "1 ÷ 4 = 0.25", 24, 800, TEAL_T)
         + t(320, 170, "decimal → percent: × 100", 19, 700) + t(320, 205, "0.25 × 100 = 25%", 24, 800, RED_T) + t(320, 275, "Learn by heart: 1/2 = 0.5 = 50%   1/4 = 0.25 = 25%   1/10 = 0.1 = 10%", 15, 700, INK2)),
     "Divide to get the decimal; multiply by 100 to get the percent."),
], "Cover it. Write 3/4 as a decimal and a percent. What is 0.1 as a fraction?")

card("bodmas", ["MC-024"], "Order of operations", [
    (svg("Two answers?", t(320, 90, "3 + 4 × 2 = ?", 40, 800) + r(110, 150, 180, 70, "#fde3dc", CORAL) + t(200, 195, "14 ✗", 26, 800, RED_T) + r(350, 150, 180, 70, "#e3f1e6", GREEN) + t(440, 195, "11 ✓", 26, 800, GREEN)
         + t(320, 270, "Left to right gives 14. The agreed order gives 11.", 17, 600, INK2)), "Everyone must get the same answer, so there is an agreed order."),
    (svg("BODMAS", "".join(r(30 + i * 100, 90, 88, 110, GOLD if i < 2 else SOFT, INK, 8) + t(74 + i * 100, 140, L, 34, 800) + t(74 + i * 100, 180, s, 12.5, 600, INK2) for i, (L, s) in enumerate([("B", "Brackets"), ("O", "Orders ²"), ("D", "Divide"), ("M", "Multiply"), ("A", "Add"), ("S", "Subtract")]))
         + t(320, 250, "D and M are equal partners — left to right. So are A and S.", 17, 700)), "Brackets, Orders (powers), then Division and Multiplication, then Addition and Subtraction."),
    (svg("Worked", t(320, 70, "3 + 4 × 2", 30, 800) + t(320, 125, "= 3 + 8      (multiply first)", 24, 700, TEAL_T) + t(320, 180, "= 11", 30, 800) + t(320, 250, "(3 + 4) × 2 = 14 — brackets change the order", 18, 700, RED_T)),
     "Multiply before you add — unless brackets say otherwise."),
], "Cover it. Say BODMAS from memory. What is 10 − 6 ÷ 2?", hook="BODMAS — Brackets, Orders, Division/Multiplication, Addition/Subtraction")

def scale(tilt, left, right, note=""):
    y1, y2 = 150 - tilt, 150 + tilt
    b = poly([(320, 160), (300, 250), (340, 250)], SOFT) + ln(150, y1, 490, y2, INK, 4)
    b += r(90, y1 - 70, 140, 60, SOFT) + t(160, y1 - 32, left, 22, 800) + r(410, y2 - 70, 140, 60, SOFT) + t(480, y2 - 32, right, 22, 800)
    return b + t(320, 300, note, 17, 700, INK2)
card("balance", ["MC-047", "MC-048", "MC-049", "MC-051"], "An equation is a balance", [
    (svg("Balanced", scale(0, "x + 3", "7", "both sides weigh the same")), "x + 3 = 7: the two sides balance."),
    (svg("Take 3 from both sides", scale(0, "x + 3 − 3", "7 − 3", "do the SAME to both sides — it stays balanced")), "Whatever you do to one side, do to the other, and it stays balanced."),
    (svg("Solved", scale(0, "x", "4", "x = 4 — check: 4 + 3 = 7 ✓")), "Undo the + 3, and x is on its own: x = 4. Put it back in to check."),
], "Cover it. Solve 2x + 1 = 9 by doing the same to both sides. What did you do first, and why?")

card("like-terms", ["MC-042", "MC-043", "MC-044", "MC-046"], "Like terms: only the same kind can be added", [
    (svg("Mixed terms", words(110, 140, [("3a", GOLD), ("+", None), ("2b", "#d9f2f6"), ("+", None), ("a", GOLD), ("+", None), ("4b", "#d9f2f6")], 30)
         + t(320, 240, "a's are one kind, b's another — like apples and bananas", 17, 600, INK2)), "Terms are 'like' when the letters match exactly."),
    (svg("Grouped", words(150, 140, [("3a", GOLD), ("+", None), ("a", GOLD), ("+", None), ("2b", "#d9f2f6"), ("+", None), ("4b", "#d9f2f6")], 30)), "Gather each kind together."),
    (svg("Simplified", t(320, 140, "4a + 6b", 44, 800) + t(320, 220, "a and b do not combine: 4a + 6b is as simple as it gets", 17, 600, INK2)), "Add the numbers in front (coefficients) of each kind. Unlike terms stay apart."),
], "Cover it. Simplify 5x + 2y − x + y. Why can't 3x and 3x² be added?")

card("expand", ["MC-045", "MC-056", "MC-057", "MC-058"], "Expanding brackets is finding an area", [
    (svg("A rectangle 3 by (x + 2)", r(150, 90, 240, 120, GOLD, INK, 0, 2, False) + r(390, 90, 100, 120, "#d9f2f6", INK, 0, 2, False) + t(270, 80, "x", 22, 800) + t(440, 80, "2", 22, 800) + t(130, 155, "3", 22, 800)
         + t(320, 270, "3(x + 2): height 3, width x + 2", 20, 800)), "3(x + 2) is the area of a rectangle 3 tall and x + 2 wide."),
    (svg("Two parts", r(150, 90, 240, 120, GOLD, INK, 0, 2, False) + r(390, 90, 100, 120, "#d9f2f6", INK, 0, 2, False) + t(270, 158, "3x", 30, 800) + t(440, 158, "6", 30, 800)
         + t(320, 270, "3(x + 2) = 3x + 6", 26, 800)), "Find each part: 3 × x and 3 × 2. Add them: 3x + 6."),
    (svg("Factorising goes back", t(320, 110, "3x + 6", 34, 800) + ln(320, 130, 320, 175, INK2, 2.5, True) + t(320, 220, "3(x + 2)", 34, 800, TEAL_T) + t(320, 280, "take out what every term shares", 17, 600, INK2)),
     "Factorising is the same picture backwards: find what both parts share."),
], "Cover it. Expand 4(y − 3). Factorise 5a + 15.")

card("indices", ["MC-061", "MC-062", "MC-063", "MC-064", "MC-065"], "Laws of indices: count the factors", [
    (svg("Multiplying", t(320, 80, "a² × a³", 34, 800) + t(320, 150, "= (a × a) × (a × a × a)", 26, 700, TEAL_T) + t(320, 220, "= a⁵", 34, 800) + t(320, 280, "multiply → ADD the powers", 18, 700, RED_T)),
     "Write the factors out and count them: 2 + 3 = 5."),
    (svg("Dividing", t(320, 80, "a⁵ ÷ a²", 34, 800) + t(320, 150, "(a·a·a·a·a) ÷ (a·a)  — two cancel", 24, 700, TEAL_T) + t(320, 220, "= a³", 34, 800) + t(320, 280, "divide → SUBTRACT the powers", 18, 700, RED_T)),
     "Dividing cancels factors: 5 − 2 = 3."),
    (svg("Why a⁰ = 1", "".join(t(120 + i * 100, 120, v, 28, 800) + t(120 + i * 100, 165, p, 18, 700, INK2) for i, (v, p) in enumerate([("8", "2³"), ("4", "2²"), ("2", "2¹"), ("1", "2⁰"), ("½", "2⁻¹")]))
         + t(320, 240, "each step down: ÷ 2", 18, 700, TEAL_T) + t(320, 280, "so 2⁰ = 1 and 2⁻¹ = ½ — the pattern decides", 17, 700)), "Follow the pattern down: each power is half the last, so anything to the power 0 is 1."),
], "Cover it. Simplify x⁴ × x³ and y⁶ ÷ y². What is 5⁰, and why?")

card("angles", ["MC-071", "MC-072", "MC-073", "MC-074", "MC-075"], "Angles on a line, and in a triangle", [
    (svg("Angles on a straight line", ln(80, 220, 560, 220, INK, 3) + ln(320, 220, 430, 90, INK, 3) + f'<path d="M370 220 A50 50 0 0 0 352 182" fill="none" stroke="{TEAL}" stroke-width="3"/>'
         + f'<path d="M352 182 A50 50 0 0 0 270 220" fill="none" stroke="{CORAL}" stroke-width="3"/>' + t(400, 200, "50°", 18, 800, TEAL_T) + t(280, 190, "130°", 18, 800, RED_T) + t(320, 290, "angles on a straight line add to 180°", 18, 700)),
     "A straight line is a half turn: the angles on it add to 180°."),
    (svg("A triangle", poly([(130, 250), (510, 250), (300, 70)], "#fff9e8") + t(170, 238, "a", 22, 800, RED_T) + t(470, 238, "b", 22, 800, TEAL_T) + t(300, 110, "c", 22, 800, GREEN)), "Take any triangle with angles a, b and c."),
    (svg("Corners on a line", ln(80, 200, 560, 200, INK, 3) + f'<path d="M320 200 L250 200 A70 70 0 0 1 270 150 Z" fill="#fde3dc" stroke="{CORAL}"/>'
         + f'<path d="M320 200 L270 150 A70 70 0 0 1 370 150 Z" fill="#e3f1e6" stroke="{GREEN}"/>' + f'<path d="M320 200 L370 150 A70 70 0 0 1 390 200 Z" fill="#d9f2f6" stroke="{TEAL}"/>'
         + t(270, 185, "a", 18, 800, RED_T) + t(320, 160, "c", 18, 800, GREEN) + t(370, 185, "b", 18, 800, TEAL_T) + t(320, 280, "a + b + c = 180°", 26, 800)),
     "Tear off the three corners and put them side by side: they make a straight line, 180°."),
], "Cover it. Two angles of a triangle are 70° and 45°. What is the third, and why?")

card("pythagoras", ["MC-077", "MC-096", "MC-111"], "Pythagoras: the squares on the sides", [
    (svg("A right triangle 3, 4, 5", poly([(240, 230), (400, 230), (240, 110)], "#fff9e8") + f'<rect x="240" y="214" width="16" height="16" fill="none" stroke="{INK}" stroke-width="1.5"/>'
         + t(320, 260, "4", 20, 800) + t(220, 175, "3", 20, 800) + t(335, 160, "5", 20, 800) + t(320, 305, "the longest side, opposite the right angle, is the hypotenuse", 15, 600, INK2)), "A right-angled triangle with sides 3, 4 and 5."),
    (svg("Squares on each side", "".join(f'<rect x="{30 + i * 34}" y="{40 + j * 34}" width="32" height="32" fill="{GOLD}" stroke="{INK}"/>' for i in range(3) for j in range(3))
         + "".join(f'<rect x="{200 + i * 34}" y="{40 + j * 34}" width="32" height="32" fill="{TEAL}" stroke="{INK}"/>' for i in range(4) for j in range(4))
         + "".join(f'<rect x="{400 + i * 34}" y="{40 + j * 34}" width="32" height="32" fill="{CORAL}" stroke="{INK}"/>' for i in range(5) for j in range(5)) + t(320, 300, "9  +  16  =  25", 28, 800)),
     "Build a square on each side: 9 small squares and 16 small squares exactly fill the 25."),
    (svg("The rule", t(320, 120, "a² + b² = c²", 44, 800) + t(320, 190, "c is the hypotenuse — the side opposite the right angle", 17, 700, INK2) + t(320, 250, "to find c: square, add, square-root", 18, 700, TEAL_T)),
     "Only for right-angled triangles. c is always the longest side."),
], "Cover it. A right triangle has legs 6 and 8. How long is the hypotenuse? Which side is c?")

card("circle", ["MC-078", "MC-083", "MC-141", "MC-147"], "Circles: once round is π diameters", [
    (svg("Circle words", circ(320, 160, 110, "#fff9e8", INK, 2.5) + ln(210, 160, 430, 160, TEAL, 3) + ln(320, 160, 398, 82, CORAL, 3) + circ(320, 160, 4, INK)
         + t(300, 185, "diameter", 16, 800, TEAL_T) + t(395, 120, "radius", 16, 800, RED_T) + t(320, 305, "diameter = 2 × radius", 17, 700)), "The radius goes from the centre to the edge; the diameter goes right across."),
    (svg("Unroll the circle", circ(100, 150, 50, "#fff9e8", INK, 2.5) + ln(160, 210, 160 + 3.1416 * 100 * 1.25, 210, CORAL, 5) + "".join(ln(160 + k * 125, 195, 160 + k * 125, 225, INK, 2) for k in range(4))
         + t(222, 245, "1 d", 15, 700) + t(347, 245, "2 d", 15, 700) + t(472, 245, "3 d", 15, 700) + t(320, 295, "the edge is a little over 3 diameters long: π ≈ 3.14", 17, 700)),
     "Roll the circle out flat: its edge is just over three diameters long. That number is π."),
    (svg("The formulas", t(320, 110, "C = πd = 2πr", 36, 800) + t(320, 190, "A = πr²", 36, 800, TEAL_T) + t(320, 260, "circumference = distance round · area = space inside", 16, 600, INK2)),
     "Circumference is π × diameter. Area is π × radius squared."),
], "Cover it. A wheel has radius 7 cm. How far does it go in one turn (use π ≈ 22/7)?")

def axes(ox=80, oy=270, w=480, h=220):
    return ln(ox, oy, ox + w, oy, INK, 2, True) + ln(ox, oy, ox, oy - h, INK, 2, True) + t(ox + w + 10, oy + 5, "x", 16, 700, INK2, "start") + t(ox, oy - h - 10, "y", 16, 700, INK2)
card("gradient", ["MC-055", "MC-091", "MC-093", "MC-094", "MC-095"], "Gradient: rise over run", [
    (svg("A line and its steps", axes() + ln(100, 250, 500, 70, INK, 3.5) + ln(220, 196, 340, 196, TEAL, 3, dash="6 5") + ln(340, 196, 340, 142, CORAL, 3, dash="6 5")
         + t(280, 220, "run: 2 across", 15, 800, TEAL_T) + t(400, 175, "rise: 1 up", 15, 800, RED_T) + t(320, 305, "gradient = 1 ÷ 2 = ½", 18, 800)), "Pick two points on the line. How far across (run)? How far up (rise)?"),
    (svg("Rise over run", t(320, 110, "gradient = rise ÷ run", 34, 800) + t(320, 175, "up is +, down is −", 20, 700, TEAL_T) + t(320, 235, "steeper line → bigger number", 20, 700, RED_T)),
     "Gradient is how much it goes up for each one across."),
    (svg("y = mx + c", t(320, 110, "y = mx + c", 44, 800) + t(220, 175, "m = gradient", 20, 800, TEAL_T) + t(440, 175, "c = where it crosses the y-axis", 18, 800, RED_T)
         + t(320, 245, "y = 2x + 1: up 2 for every 1 across, starting at 1", 17, 600, INK2)), "In y = mx + c, m is the gradient and c is where the line crosses the y-axis."),
], "Cover it. What is the gradient of y = −3x + 4, and where does it cross the y-axis?")

card("sohcahtoa", ["MC-111", "MC-112", "MC-113", "MC-114", "MC-116"], "Trigonometry: name the sides from the angle", [
    (svg("Label from the angle", poly([(150, 250), (490, 250), (490, 80)], "#fff9e8") + f'<rect x="474" y="234" width="16" height="16" fill="none" stroke="{INK}" stroke-width="1.5"/>'
         + f'<path d="M210 250 A60 60 0 0 0 204 222" fill="none" stroke="{CORAL}" stroke-width="3"/>' + t(225, 240, "θ", 20, 800, RED_T)
         + t(320, 280, "Adjacent (next to θ)", 16, 800, TEAL_T) + t(530, 170, "Opposite", 16, 800, RED_T) + t(290, 150, "Hypotenuse", 16, 800)), "Stand at the angle θ: the side across from you is Opposite, the one beside you is Adjacent, the longest is the Hypotenuse."),
    (svg("SOH CAH TOA", "".join(r(40 + i * 195, 90, 175, 110, GOLD if i == 0 else SOFT, INK, 10) + t(127 + i * 195, 140, w, 32, 800) + t(127 + i * 195, 180, f, 15, 700, INK2) for i, (w, f) in enumerate([("SOH", "sin = O ÷ H"), ("CAH", "cos = A ÷ H"), ("TOA", "tan = O ÷ A")]))
         + t(320, 260, "pick the ratio that uses the two sides you know", 17, 700)), "Sine is Opposite over Hypotenuse, Cosine is Adjacent over Hypotenuse, Tangent is Opposite over Adjacent."),
    (svg("Using it", t(320, 90, "θ = 30°, H = 10, O = ?", 26, 800) + t(320, 150, "O and H → SOH", 22, 700, TEAL_T) + t(320, 205, "O = 10 × sin 30° = 10 × 0.5 = 5", 24, 800) + t(320, 270, "label first, choose second, calculate last", 16, 600, INK2)),
     "Label the sides, choose the ratio from the two you have, then calculate."),
], "Cover it. Say SOH CAH TOA and what each part means. Which ratio links Opposite and Adjacent?", hook="SOH CAH TOA — Sine = Opposite/Hypotenuse, Cosine = Adjacent/Hypotenuse, Tangent = Opposite/Adjacent")

def stacks(vals, x0=110, top=60, col=GOLD):
    return "".join(f'<rect x="{x0 + i * 90}" y="{250 - v * 30}" width="60" height="{v * 30}" fill="{col}" stroke="{INK}" stroke-width="1.5"/>' + t(x0 + i * 90 + 30, 275, v, 18, 800) for i, v in enumerate(vals))
card("mean", ["MC-118", "MC-119", "MC-092", "MC-117"], "The mean is levelling out", [
    (svg("Uneven stacks", stacks([2, 6, 3, 5, 4]) + t(320, 310, "five stacks of cubes: 2, 6, 3, 5, 4", 16, 600, INK2)), "Five stacks of different heights."),
    (svg("Level them", stacks([4, 4, 4, 4, 4], col=TEAL) + ln(90, 130, 560, 130, CORAL, 2.5, dash="8 6") + t(320, 310, "move cubes from tall to short until all are equal", 16, 600, INK2)), "Move cubes from the tall stacks to the short ones until they are all the same height."),
    (svg("The mean", t(320, 110, "(2 + 6 + 3 + 5 + 4) ÷ 5 = 20 ÷ 5 = 4", 26, 800) + t(320, 180, "mean = total ÷ how many", 24, 800, TEAL_T) + t(320, 250, "median = the middle one when sorted · mode = the most common", 16, 600, INK2)),
     "That level height is the mean: share the total out equally."),
], "Cover it. Find the mean of 3, 7, 8 and 10. How is it different from the median?")

card("probability", ["MC-120", "MC-166", "MC-127", "MC-181"], "Probability: count the equally likely outcomes", [
    (svg("All the outcomes", "".join(r(150 + j * 52, 30 + i * 44, 46, 38, "#fde3dc" if i + j == 5 else SOFT, CORAL if i + j == 5 else LINE, 5, 1, False) + t(173 + j * 52, 56 + i * 44, i + j + 2, 15, 700) for i in range(6) for j in range(6))
         + t(320, 315, "two dice: 6 × 6 = 36 equally likely outcomes", 15, 700, INK2)), "List every outcome. Two dice give 36 equally likely totals in this grid."),
    (svg("Count the ones you want", t(320, 110, "total of 7: 6 of the 36 squares", 24, 800, RED_T) + t(320, 180, "P(7) = 6/36 = 1/6", 36, 800) + t(320, 250, "probability = ways it can happen ÷ all equally likely ways", 16, 700, INK2)),
     "Probability = favourable outcomes ÷ all equally likely outcomes."),
    (svg("Between 0 and 1", ln(80, 160, 560, 160, INK, 3) + "".join(ln(x, 150, x, 170, INK, 2) + t(x, 200, l, 16, 700) + t(x, 225, s, 13, 600, INK2) for x, l, s in [(80, "0", "impossible"), (320, "½", "even chance"), (560, "1", "certain")])
         + t(320, 290, "P(not A) = 1 − P(A)", 22, 800, TEAL_T)), "Every probability lies from 0 (impossible) to 1 (certain); the chance something does NOT happen is 1 minus the chance it does."),
], "Cover it. A bag has 3 red and 5 blue. What is P(red)? P(not red)?")

card("ratio", ["MC-031", "MC-032", "MC-033", "MC-060"], "Sharing in a ratio", [
    (svg("2 : 3 as parts", bar(120, 120, 400, 5, 2, GOLD).replace('fill="#fff"', f'fill="{TEAL}"') + t(200, 210, "Ada: 2 parts", 18, 800) + t(440, 210, "Tobi: 3 parts", 18, 800, TEAL_T)), "A ratio 2 : 3 means 5 equal parts: 2 for one, 3 for the other."),
    (svg("One part", t(320, 110, "₦20 shared 2 : 3", 30, 800) + t(320, 175, "5 parts → one part = ₦20 ÷ 5 = ₦4", 24, 700, TEAL_T)), "Add the parts, then find what one part is worth."),
    (svg("Each share", bar(120, 80, 400, 5, 2, GOLD).replace('fill="#fff"', f'fill="{TEAL}"') + t(200, 170, "2 × ₦4 = ₦8", 22, 800) + t(440, 170, "3 × ₦4 = ₦12", 22, 800, TEAL_T) + t(320, 250, "check: ₦8 + ₦12 = ₦20 ✓", 20, 700)),
     "Multiply each person's parts by one part's value — then check they add up."),
], "Cover it. Share ₦36 in the ratio 1 : 3. What is one part worth?")

card("interest", ["MC-037", "MC-038", "MC-063"], "Simple and compound interest", [
    (svg("Simple", "".join(f'<rect x="{110 + i * 90}" y="{250 - 100}" width="60" height="100" fill="{GOLD}" stroke="{INK}"/><rect x="{110 + i * 90}" y="{250 - 100 - 10 * (i + 1)}" width="60" height="{10 * (i + 1)}" fill="{TEAL}" stroke="{INK}"/>' for i in range(5))
         + t(320, 290, "10% of the FIRST amount, every year: +₦10, +₦10, +₦10…", 16, 700)), "Simple interest adds the same amount every year: 10% of what you first put in."),
    (svg("Compound", "".join(f'<rect x="{110 + i * 90}" y="{250 - 100 * 1.1 ** (i + 1)}" width="60" height="{100 * 1.1 ** (i + 1)}" fill="{CORAL}" stroke="{INK}"/>' for i in range(5))
         + t(320, 290, "10% of what you have NOW: +₦10, +₦11, +₦12.10…", 16, 700)), "Compound interest pays interest on the interest, so it grows faster each year."),
    (svg("The formulas", t(320, 110, "Simple: I = P × R × T ÷ 100", 26, 800) + t(320, 180, "Compound: A = P(1 + R/100)ⁿ", 26, 800, RED_T) + t(320, 250, "P = amount at the start, R = rate %, T or n = years", 16, 600, INK2)),
     "Simple interest is a straight line; compound interest curves upward."),
], "Cover it. ₦1,000 at 10% for 2 years: what is the simple interest? The compound amount?")

card("logs", ["MC-068", "MC-069", "MC-155"], "A logarithm asks: what power?", [
    (svg("Powers of 2", "".join(t(100 + i * 110, 140, f"2{s}", 28, 800) + t(100 + i * 110, 190, "= " + v, 20, 700, TEAL_T) for i, (s, v) in enumerate([("¹", "2"), ("²", "4"), ("³", "8"), ("⁴", "16"), ("⁵", "32")]))), "Raising 2 to a power: 2³ = 8."),
    (svg("The question backwards", t(320, 110, "2 to WHAT power gives 8?", 28, 800) + t(320, 185, "log₂ 8 = 3", 40, 800, RED_T)), "A logarithm asks the question backwards: what power of 2 gives 8? Answer: 3."),
    (svg("Same fact, two ways", r(110, 90, 180, 90, SOFT) + t(200, 145, "2³ = 8", 30, 800) + ln(300, 135, 340, 135, INK2, 2.5, True) + ln(340, 145, 300, 145, INK2, 2.5, True) + r(350, 90, 180, 90, SOFT) + t(440, 145, "log₂ 8 = 3", 26, 800)
         + t(320, 250, "base stays the base · the answer of a log is a power", 17, 700, INK2)), "Every log is a power fact turned round: if bⁿ = x then log_b x = n."),
], "Cover it. What is log₂ 32? Write log₁₀ 1000 = 3 as a power.")

# ════════════════════════════════════ ENGLISH ═══════════════════════════════════════

NOUN, VERB, ADJ, ADV = GOLD, "#d9f2f6", "#e3f1e6", "#fde3dc"
card("word-classes", ["EN-001", "EN-003", "EN-004", "EN-005", "EN-006", "EN-071"], "What job does each word do?", [
    (svg("A sentence", words(60, 150, [("The", None), ("tall", ADJ), ("girl", NOUN), ("ran", VERB), ("quickly", ADV), ("home.", None)], 28)
         + t(320, 260, "every word has a job in the sentence", 17, 600, INK2)), "Look at what each word DOES in the sentence."),
    (svg("Naming and doing", words(60, 120, [("girl", NOUN)], 28) + t(220, 120, "noun — names a person, place or thing", 17, 700, INK, "start")
         + words(60, 200, [("ran", VERB)], 28) + t(220, 200, "verb — the action or state", 17, 700, INK, "start")), "A noun names. A verb is the action (or a state, like 'is')."),
    (svg("Describing", words(60, 120, [("tall", ADJ)], 28) + t(220, 120, "adjective — describes a noun (what kind?)", 17, 700, INK, "start")
         + words(60, 200, [("quickly", ADV)], 28) + t(240, 200, "adverb — describes a verb (how? when?)", 17, 700, INK, "start") + t(320, 280, "the same word can change class: 'a fast car' / 'she ran fast'", 15, 600, INK2)),
     "An adjective describes a noun; an adverb describes a verb. Decide by the job, not the word."),
], "Cover it. In 'The old dog barked loudly', name the class of each word.")

card("plurals", ["EN-002"], "Making plurals", [
    (svg("Most words", t(320, 110, "book → books   girl → girls", 30, 800) + t(320, 180, "add -s", 26, 800, TEAL_T)), "Most nouns just add -s."),
    (svg("Hissing endings and -y", t(320, 90, "box → boxes   church → churches", 26, 800) + t(320, 130, "-s, -x, -ch, -sh: add -es", 18, 700, TEAL_T)
         + t(320, 200, "baby → babies   but   boy → boys", 26, 800) + t(320, 240, "consonant + y → -ies; vowel + y → -s", 18, 700, RED_T)), "Add -es after s, x, ch, sh (you hear an extra syllable). A consonant + y becomes -ies."),
    (svg("The rule-breakers", t(320, 110, "child → children   man → men   tooth → teeth", 24, 800) + t(320, 170, "sheep → sheep   furniture (no plural)", 24, 800, RED_T)
         + t(320, 240, "irregular plurals must be learned", 17, 700, INK2)), "Irregular plurals do not follow the rules — learn them as pairs."),
], "Cover it. Give the plurals of fox, lady, key, woman and information.")

card("agreement", ["EN-011", "EN-038"], "Subject–verb agreement", [
    (svg("Singular and plural", words(90, 120, [("The boy", NOUN), ("plays", VERB)], 26) + words(90, 210, [("The boys", NOUN), ("play", VERB)], 26)
         + t(470, 120, "one → verb + s", 17, 700, TEAL_T) + t(470, 210, "many → no s", 17, 700, RED_T)), "One subject takes the -s verb; more than one does not."),
    (svg("Find the real subject", words(40, 140, [("The box", NOUN), ("of pens", None), ("is", VERB), ("heavy.", None)], 26) + t(320, 240, "cross out 'of pens': the box … is", 18, 700, RED_T)),
     "Cross out the phrase in the middle: the verb agrees with the real subject, 'the box'."),
    (svg("Tricky subjects", t(320, 90, "Each of the girls  IS  here.", 24, 800) + t(320, 140, "Neither Ada nor her friends  ARE  late.", 24, 800) + t(320, 190, "Everyone  HAS  a book.", 24, 800)
         + t(320, 250, "each, every-, -one, -body: singular · neither/nor: agree with the nearer", 15, 700, INK2)), "'Each', 'everyone' and 'nobody' are singular. With 'neither … nor', the verb agrees with the nearer subject."),
], "Cover it. Choose: 'The list of names (is/are) long.' 'Everybody (know/knows) the answer.'")

card("apostrophe", ["EN-017"], "The apostrophe: missing letters or belonging", [
    (svg("Missing letters", t(320, 110, "do not → don't     it is → it's", 30, 800) + t(320, 180, "the apostrophe sits where the letters were", 18, 700, TEAL_T)), "In a contraction, the apostrophe marks the missing letters."),
    (svg("Belonging", t(320, 90, "the girl's bag", 30, 800) + t(320, 125, "one girl → 's", 17, 700, TEAL_T) + t(320, 190, "the girls' bags", 30, 800) + t(320, 225, "plural ending in s → s'", 17, 700, RED_T)
         + t(320, 285, "the children's books  (plural not ending in s → 's)", 17, 700)), "Write the owner first, then add the apostrophe: one girl's, two girls', the children's."),
    (svg("its or it's", r(90, 80, 210, 120, "#d9f2f6", TEAL) + t(195, 130, "it's", 30, 800) + t(195, 170, "= it is / it has", 16, 700, TEAL_T)
         + r(340, 80, 210, 120, "#fde3dc", CORAL) + t(445, 130, "its", 30, 800) + t(445, 170, "= belonging (like his)", 16, 700, RED_T) + t(320, 260, "test: can you say 'it is'? then it's", 18, 800)),
     "Test it: if 'it is' fits, write it's. Otherwise it's its — like his and hers, no apostrophe."),
], "Cover it. Correct: 'The dog wagged it's tail.' 'The two boys bags.'")

card("homophones", ["EN-018", "EN-064", "EN-009"], "There, their, they're — and other sound-alikes", [
    (svg("Three words, one sound", "".join(r(30 + i * 200, 80, 180, 130, c, INK, 10) + t(120 + i * 200, 130, w, 28, 800) + t(120 + i * 200, 175, m, 15, 700, INK2) for i, (w, m, c) in enumerate([("there", "a place: here/there", "#d9f2f6"), ("their", "belonging to them", GOLD), ("they're", "they are", "#fde3dc")]))),
     "They sound the same; the meaning decides the spelling."),
    (svg("Hooks inside the words", t(320, 90, "tHERE has HERE in it — a place", 22, 800, TEAL_T) + t(320, 150, "thEIR: 'I' own it — it belongs", 22, 800) + t(320, 210, "they'RE: the apostrophe is the missing 'a' of are", 22, 800, RED_T)),
     "Find the clue inside each word: tHERE, the owner 'I' in thEIR, and the apostrophe in they're."),
    (svg("Other pairs", t(320, 90, "to (towards) · too (also / too much) · two (2)", 20, 800) + t(320, 150, "your (belonging) · you're (you are)", 20, 800) + t(320, 210, "affect (verb) · effect (noun, the result)", 20, 800)
         + t(320, 270, "say the long form out loud: if 'you are' fits, write you're", 15, 700, INK2)), "For any contraction, say the long form; if it fits, use the apostrophe."),
], "Cover it. Fill: '___ going to bring ___ books over ___.'")

def timeline(marks):
    b = ln(60, 170, 590, 170, INK, 3, True) + t(110, 210, "past", 16, 700, INK2) + t(320, 210, "now", 16, 800) + t(540, 210, "future", 16, 700, INK2) + ln(320, 150, 320, 190, CORAL, 3)
    return b + marks
card("tenses", ["EN-004", "EN-015", "EN-016", "EN-080"], "Tenses on a timeline", [
    (svg("Simple tenses", timeline(circ(130, 170, 10) + circ(320, 170, 10) + circ(510, 170, 10) + t(130, 120, "I walked", 18, 800) + t(320, 120, "I walk", 18, 800) + t(510, 120, "I will walk", 18, 800))),
     "Simple past, present and future: one dot each, at a point in time."),
    (svg("Continuous", timeline(f'<rect x="270" y="160" width="100" height="20" rx="10" fill="{TEAL}" stroke="{INK}"/>' + t(320, 120, "I am walking", 20, 800, TEAL_T)
         + t(320, 270, "be + -ing: in progress, a stretch of time", 17, 700))), "The continuous (be + -ing) is a stretch of time, still going on."),
    (svg("Perfect", timeline(circ(170, 170, 10, CORAL) + f'<path d="M180 160 Q 250 100 310 160" fill="none" stroke="{CORAL}" stroke-width="3" marker-end="url(#a)"/>' + t(250, 105, "I have walked", 20, 800, RED_T)
         + t(320, 270, "have + past participle: past action, linked to now", 17, 700))), "The perfect (have + past participle) is a past action joined to now: 'I have eaten' — so I am not hungry."),
], "Cover it. Which tense is 'She has finished'? Draw 'They were playing' on a timeline.")

card("passive", ["EN-031"], "Active and passive voice", [
    (svg("Active", words(90, 150, [("The dog", NOUN), ("chased", VERB), ("the cat.", "#fde3dc")], 28) + t(320, 240, "the doer comes first", 18, 700)), "Active: the doer (the dog) does the action."),
    (svg("Passive", words(40, 150, [("The cat", "#fde3dc"), ("was chased", VERB), ("by the dog.", NOUN)], 28) + t(320, 240, "the receiver comes first; be + past participle", 18, 700)),
     "Passive: the receiver comes first, the verb becomes 'was chased', and the doer moves to 'by …' — or disappears."),
    (svg("When to use it", t(320, 90, "The window was broken.", 26, 800) + t(320, 130, "— we don't know, or don't need to say, who did it", 16, 700, INK2)
         + t(320, 200, "Active is usually clearer: 'The committee approved the plan.'", 18, 700, TEAL_T)), "Use the passive when the doer is unknown or unimportant; otherwise the active is clearer."),
], "Cover it. Make passive: 'The teacher marked the books.' Make active: 'The match was won by our team.'")

card("reported", ["EN-032"], "Reported speech: one step back in time", [
    (svg("Direct speech", t(320, 110, "Ada said, “I am tired.”", 30, 800) + t(320, 180, "her exact words, in quotation marks", 17, 700, INK2)), "Direct speech gives the exact words."),
    (svg("Step back", "".join(t(200, 70 + i * 50, a, 22, 800) + ln(290, 64 + i * 50, 350, 64 + i * 50, INK2, 2.5, True) + t(440, 70 + i * 50, b, 22, 800, TEAL_T) for i, (a, b) in enumerate([("am / is", "was"), ("will", "would"), ("can", "could"), ("did", "had done"), ("today", "that day")]))),
     "Reporting moves each tense one step back into the past — and 'today' becomes 'that day'."),
    (svg("Reported speech", t(320, 110, "Ada said that she was tired.", 30, 800) + t(320, 180, "no quotation marks · I → she · am → was", 18, 700, TEAL_T)), "Change the person, step the tense back, and drop the quotation marks."),
], "Cover it. Report: Tobi said, “I will come tomorrow.”")

card("conditionals", ["EN-033", "EN-080"], "Conditionals: how likely is the 'if'?", [
    (svg("Real and likely", t(320, 90, "Zero: If you heat ice, it melts.", 22, 800) + t(320, 125, "always true: present + present", 15, 700, INK2)
         + t(320, 190, "First: If it rains, I will stay home.", 22, 800, TEAL_T) + t(320, 225, "likely future: present + will", 15, 700, INK2)), "Zero for facts that are always true; first for a real, likely future."),
    (svg("Unlikely and impossible", t(320, 90, "Second: If I won ₦1m, I would buy a farm.", 22, 800, RED_T) + t(320, 125, "unlikely or imagined: past + would", 15, 700, INK2)
         + t(320, 190, "Third: If I had studied, I would have passed.", 22, 800) + t(320, 225, "the past, too late to change: had done + would have done", 15, 700, INK2)), "Second for the imagined; third for a past that cannot be changed."),
    (svg("A ladder of likelihood", "".join(r(80 + i * 125, 230 - i * 45, 110, 45 + i * 45, c, INK, 6) + t(135 + i * 125, 220 - i * 45, n, 16, 800) for i, (n, c) in enumerate([("Zero", "#e3f1e6"), ("First", "#d9f2f6"), ("Second", GOLD), ("Third", "#fde3dc")]))
         + t(320, 300, "more certain ← → more imagined", 16, 700, INK2)), "The further from reality, the further back the tense steps."),
], "Cover it. Finish: 'If I were the principal, I ___.' Which conditional is it?")

card("articles", ["EN-020"], "A or an? Listen, don't look", [
    (svg("By sound", t(320, 90, "a cat   a book   a girl", 28, 800) + t(320, 130, "before a consonant SOUND", 17, 700, TEAL_T) + t(320, 200, "an apple   an egg   an orange", 28, 800, RED_T) + t(320, 240, "before a vowel SOUND", 17, 700)),
     "Choose by the first SOUND, not the first letter."),
    (svg("The tricky ones", t(320, 90, "an hour   an honest man", 26, 800, RED_T) + t(320, 125, "silent h → vowel sound", 16, 700, INK2) + t(320, 190, "a university   a one-way street", 26, 800, TEAL_T) + t(320, 225, "'yoo' and 'wun' are consonant sounds", 16, 700, INK2)),
     "'Hour' starts with a vowel sound; 'university' starts with a 'y' sound."),
    (svg("The", t(320, 110, "a / an: any one, mentioned first", 24, 800) + t(320, 170, "the: a particular one we both know", 24, 800, TEAL_T) + t(320, 240, "I saw a dog. The dog was barking.", 20, 700, INK2)),
     "'A/an' introduces something; 'the' points to one we already know."),
], "Cover it. Choose a or an: ___ umbrella, ___ uniform, ___ hour, ___ MP3.")

card("stress", ["EN-026", "EN-027", "EN-029", "EN-075"], "Word stress can change the word", [
    (svg("Stressed syllables", t(320, 110, "BA-na-na?   ba-NA-na ✓", 30, 800) + t(320, 180, "one syllable is louder, longer and higher", 18, 700, TEAL_T)), "In every word of two or more syllables, one is stressed: louder, longer, higher."),
    (svg("Noun or verb", r(80, 70, 220, 140, GOLD, INK, 10) + t(190, 130, "REcord", 30, 800) + t(190, 170, "noun: a record", 16, 700, INK2) + r(340, 70, 220, 140, "#d9f2f6", TEAL, 10) + t(450, 130, "reCORD", 30, 800) + t(450, 170, "verb: to record", 16, 700, INK2)
         + t(320, 260, "PREsent / preSENT · OBject / obJECT · IMport / imPORT", 16, 700)), "Many two-syllable pairs stress the first syllable as a noun and the second as a verb."),
    (svg("Sentence stress", t(320, 100, "I didn't TAKE your pen.", 26, 800) + t(320, 135, "(I borrowed it)", 16, 700, INK2) + t(320, 200, "I didn't take YOUR pen.", 26, 800, TEAL_T) + t(320, 235, "(I took someone else's)", 16, 700, INK2)),
     "Stressing a different word in a sentence changes what you mean."),
], "Cover it. Mark the stress: 'Please conDUCT / CONduct the tests.' Which is the verb?")

card("roots", ["EN-061", "EN-062", "EN-019", "EN-065"], "Word parts: roots, prefixes and suffixes", [
    (svg("Take a word apart", words(150, 140, [("bio", GOLD), ("logy", "#d9f2f6")], 34) + t(320, 230, "bio = life · logy = study of", 22, 800, TEAL_T)), "Many English words are built from Greek and Latin parts. Biology = the study of life."),
    (svg("One root, many words", t(320, 70, "tele = far", 24, 800, RED_T) + t(320, 130, "telephone (far + sound)  ·  television (far + seeing)", 19, 700) + t(320, 175, "telescope (far + look)", 19, 700)
         + t(320, 240, "know the root → guess the word you've never seen", 17, 700, TEAL_T)), "Learn one root and you can work out a family of words."),
    (svg("Prefixes change meaning", "".join(t(160, 70 + i * 50, p, 22, 800, RED_T) + t(340, 70 + i * 50, m, 20, 700) for i, (p, m) in enumerate([("un-", "not: unhappy"), ("re-", "again: rewrite"), ("pre-", "before: preview"), ("mis-", "wrongly: misread"), ("-less", "without: careless")]))),
     "A prefix at the front, or a suffix at the end, changes the meaning in a predictable way."),
], "Cover it. What do 'geo', 'graph' and 'auto' mean? Use them to explain 'autograph'.", hook="Keyword method: link each root to a word you already know — 'tele' as in television")

card("figurative", ["EN-045", "EN-046", "EN-047"], "Simile, metaphor, personification", [
    (svg("Simile", t(320, 110, "Her smile was LIKE sunshine.", 30, 800) + t(320, 180, "simile: compares using like or as", 20, 700, TEAL_T)), "A simile compares two things using 'like' or 'as'."),
    (svg("Metaphor", t(320, 110, "Her smile WAS sunshine.", 30, 800) + t(320, 180, "metaphor: says one thing IS another", 20, 700, RED_T)), "A metaphor says one thing IS another — no 'like' or 'as'."),
    (svg("Personification", t(320, 110, "The wind WHISPERED through the trees.", 26, 800) + t(320, 180, "personification: a thing does what a person does", 19, 700)
         + t(320, 250, "ask: what does the comparison make you feel?", 16, 700, INK2)), "Personification gives a thing human actions. In an exam, say what effect the comparison has."),
], "Cover it. Name each: 'as brave as a lion', 'the classroom was a zoo', 'the car coughed'.")

card("peel", ["EN-054", "EN-060", "EN-079", "EN-055"], "A strong paragraph: Point, Evidence, Explain, Link", [
    (svg("PEEL", "".join(r(30 + i * 150, 80, 135, 130, GOLD if i == 0 else SOFT, INK, 10) + t(97 + i * 150, 135, L, 36, 800) + t(97 + i * 150, 178, w, 15, 700, INK2) for i, (L, w) in enumerate([("P", "Point"), ("E", "Evidence"), ("E", "Explain"), ("L", "Link")]))),
     "Point, Evidence, Explain, Link — one paragraph, one idea."),
    (svg("An example", t(40, 70, "P  School uniforms save families money.", 17, 700, INK, "start") + t(40, 115, "E  A set costs less than a week of new clothes.", 17, 700, TEAL_T, "start")
         + t(40, 160, "E  So parents spend less on keeping up with fashion.", 17, 700, INK, "start") + t(40, 205, "L  This is one reason uniforms help every family.", 17, 700, RED_T, "start")), "Each sentence does one job."),
    (svg("Linking words", t(320, 90, "add: also, furthermore   contrast: however, although", 18, 700) + t(320, 140, "cause: because, therefore   example: for instance", 18, 700) + t(320, 190, "order: firstly, finally", 18, 700)
         + t(320, 260, "the topic sentence (P) tells the reader what the paragraph proves", 16, 700, INK2)), "Linking words show how one idea leads to the next."),
], "Cover it. Say PEEL from memory, then write a P sentence for 'Phones should be allowed in school'.", hook="PEEL — Point, Evidence, Explain, Link")

card("who-whom", ["EN-037", "EN-036", "EN-072"], "Who or whom? Swap in he or him", [
    (svg("The swap test", r(90, 80, 210, 120, "#d9f2f6", TEAL) + t(195, 130, "who", 32, 800) + t(195, 170, "= he / she", 17, 700, TEAL_T) + r(340, 80, 210, 120, "#fde3dc", CORAL) + t(445, 130, "whom", 32, 800) + t(445, 170, "= him / her", 17, 700, RED_T)),
     "Who does the action (like he); whom receives it (like him). Whom and him both end in m."),
    (svg("Testing", t(320, 90, "___ called you?  → HE called you → WHO", 22, 800, TEAL_T) + t(320, 160, "To ___ did you give it?  → to HIM → WHOM", 22, 800, RED_T)
         + t(320, 240, "answer the question with he or him, then match", 17, 700, INK2)), "Answer the question in your head with he or him, then choose who or whom to match."),
    (svg("Whose and which", t(320, 100, "whose = belonging: the girl whose bag is red", 20, 800) + t(320, 160, "which = for things: the book which I read", 20, 800, TEAL_T)
         + t(320, 220, "who's = who is (not belonging!)", 20, 800, RED_T)), "Whose shows belonging; which is for things; who's means 'who is'."),
], "Cover it. Choose: 'The man (who/whom) I met was kind.' 'The boy (whose/who's) phone rang left.'", hook="whoM = hiM — both end in m")

card("punctuation", ["EN-007", "EN-008", "EN-058", "EN-013"], "Full stops, commas, semicolons and colons", [
    (svg("Sentences and lists", t(320, 90, "I came. I saw. I won.", 26, 800) + t(320, 125, "a full stop ends a complete idea", 16, 700, INK2)
         + t(320, 190, "We need rice, beans, oil and salt.", 26, 800, TEAL_T) + t(320, 225, "commas separate items in a list", 16, 700, INK2)), "A full stop ends a sentence; commas separate the items in a list."),
    (svg("Semicolon", t(320, 110, "It was late; we went home.", 28, 800) + t(320, 180, "joins two full sentences that belong together", 18, 700, TEAL_T)
         + t(320, 240, "test: could each half stand alone? then ; works", 16, 700, INK2)), "A semicolon joins two complete sentences that are closely linked."),
    (svg("Colon", t(320, 110, "Bring three things: a pen, a ruler and a calculator.", 22, 800) + t(320, 180, "a colon introduces what comes next — a list or an explanation", 17, 700, RED_T)),
     "A colon says 'here it is': a list, an example or an explanation follows."),
], "Cover it. Punctuate: 'I was tired I had walked all day' — in two different correct ways.")


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".svg"): os.remove(os.path.join(OUT, f))
    data = {"v": 1, "cards": {}, "map": {}}
    for key, c in CARDS.items():
        frames = []
        for i, (s, cap) in enumerate(c["frames"]):
            name = f"{key}-{i + 1}.svg"
            open(os.path.join(OUT, name), "w").write(s)
            alt = s.split('aria-label="', 1)[1].split('"', 1)[0]
            frames.append({"src": "/assets/lab-media/remember/" + name, "alt": alt, "caption": cap})
        data["cards"][key] = {"title": c["title"], "hook": c["hook"], "recall": c["recall"], "frames": frames}
        for comp in c["comps"]:
            data["map"].setdefault(comp, key)   # the first card listed for a topic is its card
    with open(os.path.join(OUT, "remember.json"), "w") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    m = sum(1 for k in data["map"] if k.startswith("MC")); e = sum(1 for k in data["map"] if k.startswith("EN"))
    print(f"{len(CARDS)} cards, {sum(len(c['frames']) for c in CARDS.values())} frames; topics covered: maths {m}, english {e}")


if __name__ == "__main__":
    main()
