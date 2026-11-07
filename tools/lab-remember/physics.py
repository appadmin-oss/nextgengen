"""
"Remember it" cards for the Physics Lab (PH-001 … PH-090), built by build.py's main() through `add(B)`.

The same rules as the Maths and English cards (read build.py's docstring): a picture of the IDEA and
nothing else; three frames the learner steps through; one short caption each; at most one memory hook,
and only where an ordered or spatial rule is genuinely memorised (Fleming's left hand); a recall prompt
at the end. Several topics that rest on one picture share a card — the first card listing a topic is
its card.

Physics conventions held on every frame: g = 10 m/s² (as the Lab's questions take it), arrows start on
the object the force acts on, conventional current runs + to −, angles of incidence/refraction are
measured from the normal, and every worked number is the true answer to the numbers drawn.
"""
from math import atan2, cos, sin, sqrt, exp, pi, radians


def add(B):
    t, r, ln, circ, poly, svg, card = B.t, B.r, B.ln, B.circ, B.poly, B.svg, B.card
    INK, INK2, LINE, SOFT, GOLD, TEAL, CORAL, GREEN = B.INK, B.INK2, B.LINE, B.SOFT, B.GOLD, B.TEAL, B.CORAL, B.GREEN
    RED_T, TEAL_T = B.RED_T, B.TEAL_T
    T_TEAL, T_CORAL, T_GREEN, T_GOLD, METAL = "#d9f2f6", "#fde3dc", "#e3f1e6", "#fff9e8", "#aab2c5"

    # ── drawing helpers (local to this module) ─────────────────────────────────────────────────────
    def f(v):
        return f"{v:.1f}"

    def arw(x1, y1, x2, y2, c=INK, w=3, hd=13):
        """A straight arrow with a head in its own colour (the shared marker is always dark)."""
        a = atan2(y2 - y1, x2 - x1)
        bx, by = x2 - hd * cos(a), y2 - hd * sin(a)
        p1 = (bx + hd * .5 * sin(a), by - hd * .5 * cos(a))
        p2 = (bx - hd * .5 * sin(a), by + hd * .5 * cos(a))
        return ln(x1, y1, bx, by, c, w) + f'<polygon points="{f(x2)},{f(y2)} {f(p1[0])},{f(p1[1])} {f(p2[0])},{f(p2[1])}" fill="{c}"/>'

    def darw(x1, y1, x2, y2, c=INK2, w=2, hd=10):
        """A dimension line: arrowheads at both ends."""
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        return arw(mx, my, x1, y1, c, w, hd) + arw(mx, my, x2, y2, c, w, hd)

    def pth(d, c=INK, w=2.5, fill="none", dash=""):
        return f'<path d="{d}" fill="{fill}" stroke="{c}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"{" stroke-dasharray=\"" + dash + "\"" if dash else ""}/>'

    def rect(x, y, w, h, fill="#fff", stroke=INK, sw=2, rx=0, dash=""):
        return (f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"'
                f'{" stroke-dasharray=\"" + dash + "\"" if dash else ""}/>')

    def wave(x0, x1, yc, lam, amp, ph=0.0, step=3):
        """A sine curve as path data, y up = positive."""
        pts, x = [], x0
        while x <= x1 + .01:
            pts.append((x, yc - amp * sin(2 * pi * (x - x0) / lam + ph)))
            x += step
        return "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)

    def wiggle(x1, y1, x2, y2, lam=14, amp=6, c=CORAL, w=2.5):
        """A wavy ray (light, infrared) from one point to another, ending in an arrowhead."""
        L = sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        nx, ny = -uy, ux
        pts, s = [], 0.0
        while s <= L - 14:
            o = amp * sin(2 * pi * s / lam)
            pts.append((x1 + ux * s + nx * o, y1 + uy * s + ny * o)); s += 2
        d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)
        return pth(d, c, w) + arw(pts[-1][0], pts[-1][1], x2, y2, c, w, 12)

    def axes2(ox, oy, w, h, xl, yl):
        return (arw(ox, oy, ox + w, oy, INK, 2, 11) + arw(ox, oy, ox, oy - h, INK, 2, 11)
                + t(ox + w, oy + 26, xl, 16, 700, INK2, "end") + t(ox + 10, oy - h + 6, yl, 16, 700, INK2, "start"))

    def spring(x, y1, y2, n=8, wd=14, c=INK):
        seg = (y2 - y1 - 16) / (2 * n)
        d = f"M{x} {y1} L{x} {y1 + 8}"
        for i in range(2 * n):
            d += f" L{f(x + (wd if i % 2 == 0 else -wd))} {f(y1 + 8 + seg * (i + .5))}"
        d += f" L{x} {f(y2 - 8)} L{x} {f(y2)}"
        return pth(d, c, 2)

    def flame(x, y, s=1.0):
        """A small flame whose base sits at (x, y)."""
        return (pth(f"M{x} {y} C{f(x - 16 * s)} {f(y - 10 * s)} {f(x - 8 * s)} {f(y - 28 * s)} {x} {f(y - 40 * s)} C{f(x + 8 * s)} {f(y - 28 * s)} {f(x + 16 * s)} {f(y - 10 * s)} {x} {y} Z", CORAL, 1.5, T_CORAL)
                + pth(f"M{x} {y} C{f(x - 7 * s)} {f(y - 6 * s)} {f(x - 4 * s)} {f(y - 16 * s)} {x} {f(y - 22 * s)} C{f(x + 4 * s)} {f(y - 16 * s)} {f(x + 7 * s)} {f(y - 6 * s)} {x} {y} Z", GOLD, 1, GOLD))

    def cell(x, y, vertical=False):
        """A cell on a horizontal wire at (x, y): long plate (+) on the right, short plate (−) on the left."""
        return (f'<rect x="{x - 14}" y="{y - 24}" width="28" height="48" fill="#fff" stroke="none"/>'
                + ln(x - 7, y - 11, x - 7, y + 11, INK, 4) + ln(x + 7, y - 22, x + 7, y + 22, INK, 2.5))

    def meter(x, y, letter, rad=17):
        return circ(x, y, rad, "#fff", INK, 2) + t(x, y + 6, letter, 17, 800)

    def lamp(x, y, lit=False, rad=15):
        b = circ(x, y, rad, GOLD if lit else "#fff", INK, 2)
        d = rad * .7
        b += ln(x - d, y - d, x + d, y + d, INK, 2) + ln(x - d, y + d, x + d, y - d, INK, 2)
        if lit:
            for k in range(8):
                a = k * pi / 4
                b += ln(x + (rad + 5) * cos(a), y + (rad + 5) * sin(a), x + (rad + 12) * cos(a), y + (rad + 12) * sin(a), GOLD, 3)
        return b

    def resistor(x, y, w=52, h=20, vertical=False):
        if vertical:
            return rect(x - h / 2, y - w / 2, h, w, "#fff", INK, 2)
        return rect(x - w / 2, y - h / 2, w, h, "#fff", INK, 2)

    def man(x, y, s=1.0, arm=None):
        """A stick figure standing with feet at y; `arm` = (dx, dy) of a reaching hand from the shoulder."""
        hy = y - 100 * s
        b = circ(x, hy, 13 * s, "#fff", INK, 2.5) + ln(x, hy + 13 * s, x, y - 40 * s, INK, 3)
        b += ln(x, y - 40 * s, x - 16 * s, y, INK, 3) + ln(x, y - 40 * s, x + 16 * s, y, INK, 3)
        ax, ay = arm if arm else (22 * s, 30 * s)
        b += ln(x, hy + 30 * s, x + ax, hy + 30 * s + (ay - 30 * s), INK, 3) + ln(x, hy + 30 * s, x - 20 * s, hy + 55 * s, INK, 3)
        return b

    def turn(px, py, cx, cy, deg):
        a = radians(deg)
        return cx + px * cos(a) - py * sin(a), cy + px * sin(a) + py * cos(a)

    # ═════════════════════════════════ STAGE 1–2: MEASUREMENT, MATTER, FORCES ══════════════════════

    pre = [("G", "× 10⁹", "giga"), ("M", "× 10⁶", "mega"), ("k", "× 10³", "kilo"), ("1", "the unit", ""), ("m", "× 10⁻³", "milli"), ("µ", "× 10⁻⁶", "micro"), ("n", "× 10⁻⁹", "nano")]
    row = "".join(rect(25 + i * 85, 55, 80, 100, GOLD if L == "1" else SOFT, INK if L == "1" else LINE, 1.5, 8)
                  + t(65 + i * 85, 100, L, 30, 800) + t(65 + i * 85, 135, v, 16, 700, INK if L == "1" else INK2) + (t(65 + i * 85, 180, n, 16, 700, INK2) if n else "")
                  for i, (L, v, n) in enumerate(pre))
    grid10 = "".join(ln(70 + k * 15, 70, 70 + k * 15, 220, LINE, 1) + ln(70, 70 + k * 15, 220, 70 + k * 15, LINE, 1) for k in range(1, 10))
    cube = (poly([(420, 110), (540, 110), (540, 230), (420, 230)], T_TEAL, INK, 2) + poly([(420, 110), (455, 80), (575, 80), (540, 110)], "#eef9fb", INK, 2)
            + poly([(540, 110), (575, 80), (575, 200), (540, 230)], "#c4e9ef", INK, 2))
    card("phy-units", ["PH-001", "PH-002", "PH-003", "PH-006", "PH-010", "PH-081", "PH-082"], "Units: prefixes, squares and cubes, and balance", [
        (svg("Prefixes are powers of ten", row + t(320, 230, "1 km = 1000 m     1 mA = 0.001 A     1 µs = 10⁻⁶ s", 19, 800)
             + t(320, 275, "each step along the row is × 1000", 18, 700, TEAL_T)),
         "A prefix is a power of ten in front of the unit: k means × 1000, m means ÷ 1000, µ means ÷ 1 000 000."),
        (svg("Area and volume convert by the square and the cube", rect(70, 70, 150, 150, "#fff", INK, 2.5) + grid10 + t(145, 58, "1 m = 100 cm", 17, 800)
             + t(145, 255, "1 m² = 100 × 100", 18, 800) + t(145, 282, "= 10 000 cm²", 18, 800, TEAL_T) + cube + t(480, 62, "1 m³", 18, 800)
             + t(480, 255, "1 m³ = 100 × 100 × 100", 18, 800) + t(480, 282, "= 1 000 000 cm³", 18, 800, RED_T)),
         "Convert the length first, then square it for an area or cube it for a volume."),
        (svg("Both sides of a formula must have the same units", t(320, 70, "v  =  u  +  at", 34, 800) + t(320, 112, "m/s  =  m/s  +  (m/s²) × s", 22, 800, TEAL_T)
             + t(320, 146, "every term comes out in m/s ✓", 18, 700, GREEN) + t(320, 205, "s  =  ut  +  ½at²", 28, 800) + t(320, 242, "m  =  (m/s) × s  +  (m/s²) × s²  =  m ✓", 20, 800, TEAL_T)
             + t(320, 298, "SI base units: m · kg · s · A · K · mol · cd", 18, 700, INK2)),
         "Check any formula by its units: every term must come out in the same unit, or the formula is wrong."),
    ], "Cover it. How many mm are in 3.2 m? How many cm² are in 2 m²? Show that s = ut + ½at² gives metres.")

    dots16 = lambda x0, y0, gap, rad, c: "".join(circ(x0 + i * gap, y0 + j * gap, rad, c, INK, 1.2) for i in range(4) for j in range(4))
    cyl = lambda x, level, stone=False: (rect(x, 60, 80, 200, "#fff", INK, 2.5) + rect(x + 2, level, 76, 258 - level, T_TEAL, "none", 0)
                                         + "".join(ln(x, 260 - k * 20, x + (16 if k % 5 else 26), 260 - k * 20, INK2, 1.5) for k in range(1, 10))
                                         + ln(x, level, x + 80, level, TEAL, 3)
                                         + (poly([(x + 22, 258), (x + 18, 236), (x + 34, 222), (x + 56, 228), (x + 62, 252)], METAL, INK, 2) if stone else ""))
    card("phy-density", ["PH-005", "PH-004"], "Mass, weight and density", [
        (svg("Same mass, different weight", r(40, 40, 260, 210, SOFT) + r(340, 40, 260, 210, SOFT) + t(170, 72, "On Earth: g = 10 N/kg", 17, 800) + t(470, 72, "On the Moon: g = 1.6 N/kg", 17, 800)
             + rect(130, 95, 80, 56, GOLD, INK, 2, 6) + t(170, 130, "6 kg", 20, 800) + arw(170, 151, 170, 236, CORAL, 4) + t(186, 205, "W = 60 N", 18, 800, RED_T, "start")
             + rect(430, 95, 80, 56, GOLD, INK, 2, 6) + t(470, 130, "6 kg", 20, 800) + arw(470, 151, 470, 182, CORAL, 4) + t(486, 175, "W = 9.6 N", 18, 800, RED_T, "start")
             + t(320, 295, "mass stays 6 kg everywhere — weight is W = mg", 20, 800)),
         "Mass is the amount of matter, in kg. Weight is gravity's pull on it, in newtons: W = mg — so it changes from place to place."),
        (svg("Same mass packed into less space", t(170, 62, "1 kg of cotton", 18, 800) + rect(70, 75, 200, 165, "#fff", INK, 2) + dots16(107, 100, 42, 9, TEAL)
             + t(440, 104, "1 kg of iron", 18, 800) + rect(392, 117, 96, 96, "#fff", INK, 2) + dots16(410, 135, 20, 9, METAL)
             + t(170, 268, "big volume → low density", 17, 700, INK2) + t(440, 268, "small volume → high density", 17, 700, INK2) + t(320, 312, "density  ρ = mass ÷ volume", 24, 800)),
         "Density is how much mass is packed into each cm³ (or m³): ρ = m ÷ V."),
        (svg("Finding a volume by displacement", cyl(150, 160) + t(245, 166, "50 cm³", 17, 800, TEAL_T, "start") + arw(328, 160, 380, 160, INK2, 3) + t(354, 140, "add", 16, 700, INK2)
             + cyl(400, 120, True) + t(495, 126, "70 cm³", 17, 800, TEAL_T, "start") + t(320, 300, "V = 70 − 50 = 20 cm³   ·   60 g ÷ 20 cm³ = 3 g/cm³", 19, 800)),
         "For an odd shape, sink it in water: the rise in the level is its volume. Then divide its mass by that volume."),
    ], "Cover it. A 40 g stone raises the water from 30 cm³ to 46 cm³. What is its density? What does it weigh on Earth?")

    sol = "".join(circ(55 + i * 26, 110 + j * 26, 11, GOLD, INK, 1.2) for i in range(5) for j in range(4))
    liq_pts = [(52, 152), (75, 160), (99, 151), (124, 158), (150, 152), (177, 159), (63, 177), (88, 182), (113, 176), (138, 183), (163, 177), (186, 172), (55, 128), (86, 132), (140, 129), (170, 134)]
    liq = "".join(circ(x + 205, y, 11, TEAL, INK, 1.2) for x, y in liq_pts)
    gas_pts = [(470, 80), (560, 95), (510, 140), (455, 170), (585, 165), (530, 185)]
    gas = "".join(circ(x, y, 11, CORAL, INK, 1.2) + arw(x + 12, y - 4, x + 34, y - 14 + (i % 3) * 10, INK2, 2, 8) for i, (x, y) in enumerate(gas_pts))
    hc = [(80, 255), (130, 205), (250, 205), (380, 115), (540, 115), (580, 75)]   # water warms more slowly than ice or steam (bigger c); boiling lasts longer than melting (bigger L)
    hcurve = lambda hi: (axes2(80, 255, 530, 220, "time (heating steadily) →", "temperature")
                         + t(72, 210, "0 °C", 16, 700, INK2, "end") + t(72, 120, "100 °C", 16, 700, INK2, "end")
                         + ln(80, 205, 150, 205, LINE, 1.5, dash="4 4") + ln(80, 115, 380, 115, LINE, 1.5, dash="4 4")
                         + "".join(ln(*hc[i], *hc[i + 1], (TEAL if i % 2 else CORAL) if hi else INK, 4 if hi else 3.5) for i in range(5)))
    card("phy-particles", ["PH-007", "PH-008", "PH-043", "PH-044"], "Particles, changes of state and the heating curve", [
        (svg("Solid, liquid and gas", r(30, 80, 180, 125, SOFT, LINE, 8, 1.5, False) + sol + r(235, 80, 180, 125, SOFT, LINE, 8, 1.5, False) + liq
             + r(440, 55, 180, 150, SOFT, LINE, 8, 1.5, False) + gas
             + t(120, 240, "solid", 20, 800) + t(325, 240, "liquid", 20, 800, TEAL_T) + t(530, 240, "gas", 20, 800, RED_T)
             + t(120, 268, "fixed places, vibrate", 16, 700, INK2) + t(325, 268, "close, slide past", 16, 700, INK2) + t(530, 268, "far apart, fast", 16, 700, INK2)),
         "Same particles, different arrangements: packed in place (solid), touching but sliding (liquid), far apart and fast (gas)."),
        (svg("The heating curve", hcurve(False) + t(190, 193, "melting", 17, 800, TEAL_T) + t(460, 103, "boiling", 17, 800, TEAL_T)
             + t(118, 250, "ice", 16, 700, INK2, "start") + t(330, 180, "water", 16, 700, INK2, "start") + t(552, 82, "steam", 16, 700, INK2, "end")),
         "Heat ice steadily: the temperature stops rising while it melts, and again while it boils."),
        (svg("Two kinds of heating", hcurve(True) + t(190, 193, "Q = mL", 18, 800, TEAL_T) + t(460, 103, "Q = mL", 18, 800, TEAL_T)
             + t(330, 180, "Q = mcΔθ", 18, 800, RED_T, "start") + t(320, 310, "slope: temperature rises  ·  flat: the state changes", 17, 700, INK2)),
         "On a slope the heat raises the temperature (Q = mcΔθ). On a flat it frees particles from each other instead (Q = mL), so the thermometer stands still."),
    ], "Cover it. Why is the graph flat while water boils? Which formula melts 2 kg of ice, and which warms the water after?")

    def bend(cx, cy, r1, r2, sweep, fill):
        a0, a1 = radians(90), radians(90 - sweep)
        p = lambda rr, a: (cx + rr * cos(a), cy - rr * sin(a))
        o0, o1, i1, i0 = p(r2, a0), p(r2, a1), p(r1, a1), p(r1, a0)
        return pth(f"M{f(o0[0])} {f(o0[1])} A{r2} {r2} 0 0 1 {f(o1[0])} {f(o1[1])} L{f(i1[0])} {f(i1[1])} A{r1} {r1} 0 0 0 {f(i0[0])} {f(i0[1])} Z", INK, 1.5, fill)
    ky = lambda c: 250 - (c + 273) * 180 / 373
    therm = lambda x: rect(x - 9, 60, 18, 196, "#fff", INK, 2, 9)
    piston = lambda x, top, n, pts: (pth(f"M{x} 70 L{x} 250 L{x + 100} 250 L{x + 100} 70", INK, 2.5) + rect(x + 3, top - 12, 94, 12, METAL, INK, 1.5)
                                     + ln(x + 50, top - 12, x + 50, top - 40, INK, 4) + "".join(circ(a, b, 6, CORAL, INK, 1) for a, b in pts))
    import random
    rnd = random.Random(7)
    pA = [(55 + 14 + rnd.random() * 62, 90 + 10 + rnd.random() * 140) for _ in range(12)]
    pB = [(205 + 14 + rnd.random() * 62, 170 + 10 + rnd.random() * 62) for _ in range(12)]
    card("phy-heat-expand", ["PH-042", "PH-041", "PH-062", "PH-045"], "Heating expands things — and gases follow laws", [
        (svg("A bimetallic strip bends when heated", rect(60, 106, 200, 14, GOLD, INK, 1.5) + rect(60, 120, 200, 14, METAL, INK, 1.5)
             + t(160, 96, "brass", 16, 700) + t(160, 158, "iron", 16, 700, INK2) + t(160, 205, "cold: straight", 18, 800)
             + rect(340, 96, 12, 50, INK, INK, 1) + bend(352, 330, 182, 196, 58, METAL) + bend(352, 330, 196, 210, 58, GOLD)
             + t(480, 74, "brass expands more →", 16, 700, INK) + t(480, 98, "it ends up on the outside", 16, 700, INK2)
             + t(470, 284, "heated: it bends", 18, 800, RED_T) + flame(430, 255, .7) + flame(470, 255, .7)
             + t(320, 316, "heat → particles vibrate more → take more room", 17, 700, INK2)),
         "Heated particles vibrate harder and push further apart, so solids grow. In a bimetallic strip the metal that expands more is on the outside of the bend."),
        (svg("Celsius and kelvin", t(200, 38, "Celsius", 18, 800) + t(440, 38, "Kelvin", 18, 800) + therm(200) + therm(440)
             + "".join(ln(209, ky(c), 431, ky(c), LINE, 1.5, dash="5 4") + ln(186, ky(c), 214, ky(c), INK, 2.5) + ln(426, ky(c), 454, ky(c), INK, 2.5)
                       + t(180, ky(c) + 6, cl, 17, 800, INK, "end") + t(462, ky(c) + 6, kl, 17, 800, TEAL_T, "start") + t(320, ky(c) - 8, w, 16, 700, INK2)
                       for c, cl, kl, w in [(100, "100 °C", "373 K", "water boils"), (0, "0 °C", "273 K", "ice melts"), (-273, "−273 °C", "0 K", "absolute zero")])
             + t(320, 300, "T (in K) = θ (in °C) + 273", 22, 800)),
         "The kelvin scale starts at absolute zero, the coldest anything can be. A step of 1 K is the same size as 1 °C."),
        (svg("The gas laws", piston(50, 90, 12, pA) + piston(200, 170, 12, pB) + arw(250, 112, 250, 150, INK2, 3)
             + t(100, 280, "V, P", 18, 800) + t(250, 280, "V ÷ 2 → 2P", 18, 800, RED_T)
             + t(355, 80, "the gas laws", 18, 800, INK, "start") + t(355, 125, "P × V = constant (T fixed)", 17, 700, RED_T, "start")
             + t(355, 165, "V ÷ T = constant (P fixed)", 17, 700, TEAL_T, "start") + t(355, 205, "P ÷ T = constant (V fixed)", 17, 700, INK, "start")
             + t(355, 255, "T always in kelvin", 17, 800, INK2, "start")),
         "Squeeze a gas into half the space and the particles hit the walls twice as often: twice the pressure (Boyle's law). Always use kelvin."),
    ], "Cover it. Write 27 °C in kelvin. A gas at 100 kPa is squeezed to a third of its volume at the same temperature: its new pressure?")

    def pot():
        b = rect(360, 90, 200, 150, T_TEAL, "none", 0) + pth("M360 70 L360 240 L560 240 L560 70", INK, 3) + flame(460, 285, .9)
        b += arw(460, 225, 460, 115, CORAL, 3.5) + arw(460, 108, 420, 100, CORAL, 3) + arw(500, 100, 540, 108, CORAL, 3)
        b += arw(380, 120, 380, 210, TEAL, 3.5) + arw(540, 120, 540, 210, TEAL, 3.5)
        return b
    lam_px = lambda lam: 80 + (lam - .2) / 2.8 * 480
    def planck(T):
        return [(lam, 1 / (lam ** 5 * (exp(14388 / (lam * T)) - 1))) for lam in [.2 + k * .02 for k in range(141)]]
    hot, cool = planck(5000), planck(4000)
    pk = max(v for _, v in hot)
    curve = lambda pts, c: pth("M" + " L".join(f"{f(lam_px(l))} {f(220 - v / pk * 165)}" for l, v in pts), c, 3.5)
    cpk = max(v for _, v in cool) / pk
    card("phy-heat-transfer", ["PH-061", "PH-078", "PH-087"], "Heat moves three ways: conduction, convection, radiation", [
        (svg("Conduction and convection", rect(50, 140, 230, 26, METAL, INK, 2, 4) + flame(70, 215, .9) + arw(110, 125, 260, 125, CORAL, 3)
             + "".join(circ(95 + k * 40, 153, 7, GOLD, INK, 1) + ln(95 + k * 40 - 12 + k, 153, 95 + k * 40 - 9, 153, INK2, 2) for k in range(5))
             + t(165, 110, "heat →", 17, 800, RED_T) + t(165, 265, "conduction:", 18, 800) + t(165, 290, "vibration passed along", 16, 700, INK2)
             + pot() + t(460, 52, "convection:", 18, 800) + t(460, 312, "warm fluid rises, cool sinks", 16, 700, INK2)),
         "Conduction passes vibration particle to particle (best in metals). Convection carries heat as warm fluid rises and cooler fluid sinks."),
        (svg("Radiation: hotter means brighter and bluer", axes2(80, 220, 500, 195, "wavelength →", "power radiated") + curve(cool, TEAL) + curve(hot, CORAL)
             + ln(lam_px(.58), 220, lam_px(.58), 55, CORAL, 1.5, dash="4 4") + ln(lam_px(.72), 220, lam_px(.72), 220 - cpk * 165, TEAL, 1.5, dash="4 4")
             + t(168, 60, "hotter", 18, 800, RED_T, "start") + t(330, 175, "cooler", 18, 800, TEAL_T, "start")
             + t(320, 280, "the peak moves to shorter λ:  λmax × T = constant", 18, 800) + t(320, 312, "total power radiated ∝ T⁴", 18, 800, RED_T)),
         "Radiation crosses empty space. A hotter body gives out far more (P = σAT⁴) and its peak moves to shorter wavelengths (Wien's law)."),
        (svg("The greenhouse effect", rect(0, 262, 640, 68, T_GREEN, "none", 0) + ln(0, 262, 640, 262, GREEN, 2) + ln(0, 115, 640, 115, TEAL, 2, dash="8 6")
             + circ(60, 55, 30, GOLD, INK, 1.5) + arw(82, 80, 180, 258, GOLD, 5) + t(190, 165, "sunlight: short waves in", 16, 800, INK, "start")
             + wiggle(400, 258, 450, 124, 18, 7) + wiggle(460, 122, 510, 255, 18, 7) + wiggle(560, 258, 610, 30, 18, 7)
             + t(130, 105, "greenhouse gases (CO₂, water vapour)", 16, 700, TEAL_T, "start") + t(260, 300, "warm ground: long infrared out", 16, 800, INK2)
             + t(510, 300, "some sent back down", 16, 800, RED_T)),
         "Sunlight arrives as short waves and warms the ground. The ground sends out long infrared waves, and greenhouse gases send part of them back down."),
    ], "Cover it. Why does a metal spoon in hot tea get hot? Why does a pot heat from the bottom up? How does the Sun's heat cross space?")

    card("phy-vectors", ["PH-009", "PH-011"], "Vectors: size AND direction", [
        (svg("Forces along one line", t(320, 70, "forces along one line: add or subtract", 19, 700, INK2) + rect(270, 120, 100, 70, T_GOLD, INK, 2, 6)
             + arw(370, 155, 520, 155, TEAL, 4) + t(445, 140, "5 N", 18, 800, TEAL_T) + arw(270, 155, 180, 155, CORAL, 4) + t(225, 140, "3 N", 18, 800, RED_T)
             + arw(290, 235, 350, 235, GREEN, 5) + t(365, 241, "2 N", 18, 800, GREEN, "start") + t(320, 290, "resultant = 5 − 3 = 2 N to the right", 22, 800)),
         "Along one line, add the forces pointing the same way and subtract the ones that oppose them."),
        (svg("At right angles: tip to tail", arw(200, 250, 350, 250, TEAL, 4) + arw(350, 250, 350, 50, CORAL, 4) + arw(200, 250, 350, 50, GREEN, 4.5)
             + pth("M240 250 A40 40 0 0 0 224 218", INK2, 2) + t(250, 236, "θ", 18, 800, INK2, "start")
             + t(275, 280, "3 N", 18, 800, TEAL_T) + t(365, 155, "4 N", 18, 800, RED_T, "start") + t(258, 140, "5 N", 18, 800, GREEN, "end")
             + t(430, 120, "tip to tail", 18, 800, INK, "start") + t(430, 160, "R² = 3² + 4²", 18, 700, INK, "start") + t(430, 200, "R = 5 N", 18, 800, GREEN, "start")
             + t(430, 240, "tan θ = 4 ÷ 3, θ = 53°", 17, 700, INK2, "start")),
         "Two forces at right angles: draw one, start the other at its tip. The resultant joins the start to the end — Pythagoras gives its size."),
        (svg("Splitting a vector into parts", arw(140, 250, 400, 250, TEAL, 3, 12) + arw(400, 250, 400, 100, CORAL, 3, 12) + arw(140, 250, 400, 100, INK, 4.5)
             + pth("M200 250 A60 60 0 0 0 192 220", INK2, 2) + t(208, 240, "30°", 16, 800, INK2, "start") + t(255, 158, "F = 10 N", 19, 800, INK, "end")
             + t(270, 282, "F cos 30° = 8.7 N", 18, 800, TEAL_T) + t(415, 180, "F sin 30° = 5 N", 18, 800, RED_T, "start")),
         "Any vector splits into two parts at right angles: F cos θ along the angle's side, F sin θ across."),
    ], "Cover it. 6 N east and 8 N north: the resultant? A 20 N pull at 60° to the ground: how much of it pulls along the ground?")

    floor = ln(50, 222, 590, 222, INK, 3) + "".join(ln(60 + k * 30, 222, 48 + k * 30, 236, INK2, 1.5) for k in range(18))
    crate = rect(260, 142, 120, 80, T_GOLD, INK, 2, 4) + t(320, 190, "2 kg", 20, 800)
    card("phy-newton", ["PH-028", "PH-029", "PH-030", "PH-012"], "Newton's laws: balanced, unbalanced, and pairs", [
        (svg("Balanced forces", floor + crate + arw(140, 172, 258, 172, TEAL, 4) + t(195, 155, "push 20 N", 17, 800, TEAL_T)
             + arw(259, 207, 150, 207, CORAL, 4) + t(205, 262, "friction 20 N", 17, 800, RED_T) + t(320, 80, "balanced: resultant = 0", 22, 800)
             + t(320, 305, "→ stays still, or keeps the same velocity", 18, 700, INK2)),
         "Balanced forces change nothing: still stays still, moving keeps the same velocity (first law). Friction always opposes the motion."),
        (svg("Unbalanced forces", floor + crate + arw(78, 172, 258, 172, TEAL, 4) + t(168, 155, "push 30 N", 17, 800, TEAL_T)
             + arw(259, 207, 150, 207, CORAL, 4) + t(205, 262, "friction 20 N", 17, 800, RED_T) + arw(400, 110, 480, 110, GREEN, 5)
             + t(320, 80, "resultant 10 N →", 22, 800, GREEN) + t(320, 305, "a = F ÷ m = 10 ÷ 2 = 5 m/s²", 24, 800)),
         "An unbalanced (resultant) force accelerates the mass: F = ma (second law)."),
        (svg("Action and reaction", ln(40, 240, 600, 240, INK, 3) + rect(420, 50, 22, 190, METAL, INK, 2) + man(330, 240, 1.0, (88, 30))
             + arw(442, 140, 540, 140, TEAL, 4) + t(491, 120, "on the wall", 16, 800, TEAL_T) + t(491, 168, "50 N", 18, 800, TEAL_T)
             + arw(312, 170, 210, 170, CORAL, 4) + t(260, 150, "on the skater", 16, 800, RED_T) + t(260, 198, "50 N", 18, 800, RED_T)
             + t(320, 288, "equal and opposite — but on DIFFERENT objects", 19, 800)),
         "Forces come in pairs: equal in size, opposite in direction, acting on two different objects — so they never cancel each other."),
    ], "Cover it. A 4 kg box is pushed with 18 N against 6 N of friction: its acceleration? Why don't the two forces of a Newton-3 pair cancel?")

    card("phy-hooke", ["PH-013", "PH-066"], "Springs stretch in proportion — up to a limit", [
        (svg("Double the load, double the stretch", ln(60, 50, 580, 50, INK, 5) + ln(90, 130, 560, 130, LINE, 1.5, dash="5 4")
             + spring(150, 50, 130) + spring(320, 50, 175) + rect(300, 175, 40, 30, METAL, INK, 2) + spring(490, 50, 220) + rect(465, 220, 50, 40, METAL, INK, 2)
             + darw(355, 130, 355, 175, TEAL) + darw(530, 130, 530, 220, TEAL)
             + t(150, 160, "0 N", 18, 800) + t(320, 240, "2 N", 18, 800) + t(375, 160, "3 cm", 16, 800, TEAL_T, "start") + t(490, 285, "4 N", 18, 800) + t(550, 182, "6 cm", 16, 800, TEAL_T, "start")
             + t(320, 314, "double the load → double the extension:  F = ke", 18, 800)),
         "Hang twice the load and the spring stretches twice as far: F = ke, where e is the extension and k the spring constant."),
        (svg("The limit of proportionality", axes2(80, 260, 470, 210, "extension e", "force F") + ln(80, 260, 330, 110, INK, 3.5) + pth("M330 110 Q 420 60 520 72", INK, 3.5)
             + circ(330, 110, 7, CORAL) + t(345, 145, "limit of proportionality", 17, 800, RED_T, "start")
             + ln(150, 218, 250, 218, TEAL, 2.5, dash="6 4") + ln(250, 218, 250, 158, TEAL, 2.5, dash="6 4") + t(262, 200, "gradient = k", 17, 800, TEAL_T, "start")),
         "The graph is a straight line through the origin — until the limit of proportionality. Past it, Hooke's law no longer holds."),
        (svg("Stress, strain and Young's modulus", rect(50, 90, 20, 90, METAL, INK, 2) + ln(70, 135, 470, 135, INK, 3) + ln(420, 120, 420, 150, INK2, 1.5, dash="3 3")
             + arw(470, 135, 570, 135, CORAL, 4) + t(520, 120, "F", 20, 800, RED_T) + darw(70, 165, 420, 165) + t(245, 190, "length L", 17, 800, INK2)
             + darw(420, 165, 470, 165, TEAL) + t(445, 190, "e", 17, 800, TEAL_T) + t(245, 112, "wire, cross-section area A", 16, 700, INK2)
             + t(170, 245, "stress = F ÷ A", 22, 800, RED_T) + t(470, 245, "strain = e ÷ L", 22, 800, TEAL_T)
             + t(320, 298, "Young's modulus  E = stress ÷ strain", 23, 800)),
         "For a wire, compare force per area (stress) with stretch per length (strain). Their ratio, Young's modulus, belongs to the material, not to one wire."),
    ], "Cover it. A spring stretches 4 cm under 2 N. How far under 5 N (inside the limit)? What is k, in N/m?")

    sand = pth("M40 200 L150 200 L150 232 L210 232 L210 200 L390 200 L390 208 L540 208 L540 200 L600 200 L600 252 L40 252 Z", INK2, 1.5, "#f6e7c1")   # the dents ARE the picture
    tank = lambda: rect(60, 60, 140, 210, "#fff", INK, 2.5) + rect(62, 80, 136, 188, T_TEAL, "none", 0) + pth(wave(62, 198, 80, 34, 3), TEAL, 2)
    jets = "".join(pth(f"M200 {y} Q {200 + d / 2} {y} {200 + d} {y + 55}", TEAL, 4) + circ(200, y, 4, INK)
                   for y, d in [(130, 70), (180, 105), (230, 130)])
    card("phy-pressure", ["PH-014", "PH-015", "PH-039", "PH-040"], "Pressure: force spread over an area", [
        (svg("Same weight, different area", rect(150, 82, 60, 150, T_CORAL, CORAL, 2) + rect(390, 148, 150, 60, T_CORAL, CORAL, 2) + sand
             + arw(180, 40, 180, 78, INK2, 3) + arw(465, 104, 465, 144, INK2, 3) + t(195, 62, "W", 17, 800, INK2, "start") + t(480, 130, "W", 17, 800, INK2, "start")
             + t(180, 280, "small area → big pressure", 17, 800, RED_T) + t(465, 280, "big area → small pressure", 17, 800, TEAL_T) + t(320, 318, "P = F ÷ A   (pascals = N/m²)", 20, 800)),
         "The same weight on a smaller area presses harder: P = F ÷ A. That is why the brick on its end sinks deeper."),
        (svg("Deeper water pushes harder", tank() + jets + ln(40, 290, 380, 290, INK, 2)
             + t(380, 100, "deeper → more pressure", 17, 800, INK, "start") + t(380, 150, "P = hρg", 26, 800, TEAL_T, "start")
             + t(380, 190, "h = depth, ρ = density", 17, 700, INK2, "start") + t(380, 230, "the same in every direction", 17, 700, INK2, "start")),
         "Pressure in a liquid grows with depth: P = hρg. The deepest hole spurts out fastest."),
        (svg("Upthrust", rect(50, 70, 260, 215, "#fff", INK, 2.5) + rect(52, 92, 256, 191, T_TEAL, "none", 0) + rect(120, 150, 120, 70, T_GOLD, INK, 2)
             + "".join(arw(x, 122, x, 146, INK2, 2.5, 9) for x in (145, 180, 215)) + "".join(arw(x, 270, x, 224, CORAL, 3.5, 12) for x in (145, 180, 215))
             + t(340, 110, "small push down on top", 17, 700, INK, "start") + t(340, 150, "big push up underneath", 17, 800, RED_T, "start")
             + t(340, 200, "difference = upthrust", 18, 800, INK, "start") + t(340, 235, "= weight of liquid pushed aside", 17, 700, TEAL_T, "start")
             + t(320, 315, "it floats when upthrust = its weight", 19, 800)),
         "The liquid presses harder on the bottom than the top, so it pushes up: upthrust equals the weight of liquid displaced (Archimedes). An object floats when that equals its weight."),
    ], "Cover it. 600 N on 0.2 m²: what pressure? The pressure 5 m down in water (ρ = 1000 kg/m³, g = 10)? Why does a steel ship float?")

    def topple(px, deg):
        corners = [turn(x, y, px, 250, deg) for x, y in [(-80, 0), (0, 0), (0, -160), (-80, -160)]]
        g = turn(-40, -80, px, 250, deg)
        inside = g[0] < px
        b = poly(corners, T_GOLD, INK, 2.5) + circ(g[0], g[1], 7, INK, INK) + arw(g[0], g[1], g[0], 248, GREEN if inside else CORAL, 3, 11)
        return b + circ(px, 250, 5, INK)
    card("phy-moments", ["PH-016", "PH-017"], "Moments: force × distance from the pivot", [
        (svg("The moment of a force", ln(120, 180, 540, 180, INK, 7) + poly([(120, 184), (100, 222), (140, 222)], SOFT, INK, 2) + arw(420, 70, 420, 174, CORAL, 4)
             + t(435, 100, "F = 10 N", 18, 800, RED_T, "start") + darw(120, 240, 420, 240) + ln(120, 226, 120, 252, INK2, 1.5) + t(270, 266, "d = 0.5 m", 18, 800, INK2)
             + t(320, 310, "moment = F × d = 10 × 0.5 = 5 N m", 24, 800)),
         "A force's turning effect is its moment: force × perpendicular distance from the pivot. Further out turns more easily."),
        (svg("A balanced see-saw", ln(80, 180, 560, 180, INK, 7) + poly([(320, 184), (300, 222), (340, 222)], SOFT, INK, 2)
             + rect(80, 120, 60, 54, T_TEAL, INK, 2, 4) + t(110, 153, "400 N", 16, 800) + rect(430, 120, 60, 54, T_CORAL, INK, 2, 4) + t(460, 153, "600 N", 16, 800)
             + darw(110, 240, 318, 240) + t(214, 265, "1.5 m", 17, 800, INK2) + darw(322, 240, 460, 240) + t(391, 265, "1.0 m", 17, 800, INK2)
             + t(320, 310, "400 × 1.5  =  600 × 1.0", 26, 800) + t(320, 70, "anticlockwise moments = clockwise moments", 18, 700, TEAL_T)),
         "In balance, the moments one way equal the moments the other way about the pivot (the principle of moments)."),
        (svg("Stable or toppling", ln(40, 250, 600, 250, INK, 3) + topple(210, 15) + topple(480, 35)
             + t(170, 282, "line inside the base", 17, 800, GREEN) + t(170, 306, "→ falls back", 17, 700, INK2)
             + t(450, 282, "line outside the base", 17, 800, RED_T) + t(450, 306, "→ topples", 17, 700, INK2)),
         "Tip an object on one edge. If the line straight down from its centre of gravity stays inside the base it rocks back; if it passes outside, it topples. Low and wide is stable."),
    ], "Cover it. A 300 N child sits 2 m from the pivot. Where must a 500 N child sit to balance? Why is a low, wide lorry hard to tip over?")

    stairs = pth("M40 260 L40 230 L80 230 L80 200 L120 200 L120 170 L160 170 L160 140 L200 140 L200 110", INK, 3)
    card("phy-work-power", ["PH-019", "PH-020", "PH-018"], "Work, power and machines", [
        (svg("Work is force × distance", rect(200, 210, 80, 50, "none", INK2, 2, 4, "6 5") + rect(200, 80, 80, 50, T_GOLD, INK, 2, 4) + t(240, 112, "50 N", 18, 800)
             + arw(240, 205, 240, 136, CORAL, 4) + t(255, 175, "F = 50 N", 17, 800, RED_T, "start") + darw(170, 255, 170, 105) + t(155, 185, "2 m", 18, 800, INK2, "end")
             + ln(150, 260, 330, 260, INK, 2) + t(370, 120, "work = force × distance", 19, 800, INK, "start")
             + t(370, 165, "W = 50 N × 2 m", 19, 700, INK, "start") + t(370, 210, "= 100 J", 26, 800, TEAL_T, "start") + t(370, 250, "(distance moved along the force)", 16, 700, INK2, "start")),
         "Work is done when a force moves something: work = force × distance moved in the direction of the force, in joules."),
        (svg("Power is how fast work is done", stairs + t(120, 295, "same stairs: 1200 J", 17, 800)
             + t(250, 115, "Ada", 18, 800, INK, "start") + rect(300, 100, 80, 22, TEAL, INK, 1.5) + t(392, 118, "4 s → 300 W", 17, 800, TEAL_T, "start")
             + t(250, 185, "Tobi", 18, 800, INK, "start") + rect(300, 170, 240, 22, CORAL, INK, 1.5) + t(300, 220, "12 s → 100 W", 17, 800, RED_T, "start")
             + t(390, 280, "power = work ÷ time", 22, 800)),
         "Power is how fast the work is done: P = W ÷ t, in watts (joules per second). The same climb done faster takes more power."),
        (svg("A lever trades distance for force", ln(70, 160, 570, 160, INK, 7) + poly([(180, 164), (162, 198), (198, 198)], SOFT, INK, 2)
             + rect(72, 102, 56, 54, METAL, INK, 2, 4) + t(100, 92, "load 400 N", 16, 800, INK) + arw(500, 70, 500, 154, CORAL, 4) + t(515, 98, "effort 125 N", 16, 800, RED_T, "start")
             + darw(100, 214, 178, 214) + t(139, 238, "0.5 m", 16, 800, INK2) + darw(182, 214, 500, 214) + t(341, 238, "2 m", 16, 800, INK2)
             + t(320, 274, "MA = 400 ÷ 125 = 3.2    VR = 2 ÷ 0.5 = 4", 19, 800) + t(320, 310, "efficiency = MA ÷ VR × 100% = 80%", 20, 800, TEAL_T)),
         "A machine lets a small effort lift a big load by moving further. MA = load ÷ effort, VR = effort's distance ÷ load's distance; friction keeps MA below VR."),
    ], "Cover it. Lifting 200 N up 3 m in 6 s: the work and the power? A pulley with VR 4 lifts 300 N with a 100 N effort: its efficiency?")

    # ═════════════════════════════════════ STAGE 3–4: MOTION, ENERGY ════════════════════════════════

    card("phy-motion-graphs", ["PH-021", "PH-022", "PH-025"], "Displacement, velocity and their graphs", [
        (svg("Distance and displacement", circ(150, 250, 7, INK) + arw(150, 250, 300, 250, TEAL, 3, 12) + arw(300, 250, 300, 50, TEAL, 3, 12) + arw(150, 250, 300, 50, GREEN, 4.5)
             + t(225, 280, "3 m east", 17, 800, TEAL_T) + t(290, 205, "4 m north", 17, 800, TEAL_T, "end") + t(212, 132, "5 m", 18, 800, GREEN, "end")
             + t(130, 270, "start", 16, 700, INK2, "end") + t(400, 90, "distance = 3 + 4 = 7 m", 18, 800, TEAL_T, "start")
             + t(400, 140, "displacement = 5 m", 18, 800, GREEN, "start") + t(400, 170, "at 53° north of east", 16, 700, INK2, "start")),
         "Distance is the length of the path (a scalar). Displacement is the straight line from start to finish, with its direction (a vector)."),
        (svg("A distance–time graph", axes2(80, 260, 480, 220, "time", "distance") + ln(80, 260, 230, 170, INK, 3.5) + ln(230, 170, 340, 170, INK, 3.5) + ln(340, 170, 430, 60, INK, 3.5)
             + t(140, 240, "steady", 16, 800, INK2, "start") + t(285, 160, "stopped", 16, 800, RED_T) + t(395, 130, "faster", 16, 800, TEAL_T, "start")
             + t(460, 220, "gradient = speed", 19, 800, INK, "start")),
         "On a distance–time graph the slope is the speed: steeper is faster, flat is stopped."),
        (svg("A velocity–time graph", axes2(80, 260, 300, 220, "time", "velocity") + poly([(80, 260), (200, 100), (320, 100), (320, 260)], T_GOLD, "none", 0)
             + ln(80, 260, 200, 100, INK, 3.5) + ln(200, 100, 320, 100, INK, 3.5) + t(72, 106, "20 m/s", 16, 700, INK2, "end")
             + t(200, 282, "4 s", 16, 700, INK2) + t(320, 282, "8 s", 16, 700, INK2, "end")
             + t(390, 90, "gradient = acceleration", 17, 800, INK, "start") + t(390, 120, "= 20 ÷ 4 = 5 m/s²", 17, 800, TEAL_T, "start")
             + t(390, 185, "area = distance", 17, 800, INK, "start") + t(390, 215, "= 40 m + 80 m = 120 m", 17, 800, RED_T, "start")),
         "On a velocity–time graph the slope is the acceleration and the area underneath is the distance travelled."),
    ], "Cover it. On a velocity–time graph, what does the slope give you? And the area? What does a flat line on a distance–time graph mean?")

    fall = "".join(circ(200, 40 + 4.5 * s, 10, GOLD, INK, 1.5) + (arw(200, 50 + 4.5 * s, 200, 50 + 4.5 * s + v, CORAL, 2.5, 9) if v else "")
                   + ln(150, 40 + 4.5 * s, 160, 40 + 4.5 * s, INK2, 2) + t(142, 46 + 4.5 * s, f"{s} m", 16, 700, INK2, "end")
                   + t(240, 46 + 4.5 * s, f"t = {k} s   v = {v} m/s", 16, 800, INK, "start")
                   for k, s, v in [(0, 0, 0), (1, 5, 10), (2, 20, 20), (3, 45, 30)])
    suv = [("s", "displacement"), ("u", "initial v"), ("v", "final v"), ("a", "acceleration"), ("t", "time")]
    card("phy-suvat", ["PH-023", "PH-024", "PH-026"], "Equations of motion, and free fall", [
        (svg("Free fall, second by second", ln(155, 40, 155, 243, INK2, 2) + fall + t(420, 290, "no air: a = g = 10 m/s²", 19, 800, TEAL_T)
             + t(420, 316, "for heavy and light alike", 16, 700, INK2)),
         "Falling freely, everything gains 10 m/s every second — heavy or light. The gaps grow because it is going faster each second."),
        (svg("Pick the equation that leaves out what you don't need", "".join(rect(25 + i * 120, 40, 110, 70, SOFT, LINE, 1.5, 8)
             + t(80 + i * 120, 74, L, 26, 800) + t(80 + i * 120, 100, w, 16, 700, INK2) for i, (L, w) in enumerate(suv))
             + "".join(t(110, 160 + k * 42, e, 22, 800, INK, "start") + t(440, 160 + k * 42, n, 18, 800, TEAL_T, "start")
                       for k, (e, n) in enumerate([("v = u + at", "no s"), ("s = ut + ½at²", "no v"), ("v² = u² + 2as", "no t"), ("s = ½(u + v)t", "no a")]))),
         "List the three things you know and the one you want. Choose the equation that leaves out the fifth."),
        (svg("A worked example", t(320, 70, "u = 0,  a = 2 m/s²,  t = 5 s,  s = ?", 24, 800) + t(320, 130, "no v in the question → s = ut + ½at²", 20, 800, TEAL_T)
             + t(320, 190, "s = 0 × 5 + ½ × 2 × 5²", 24, 800) + t(320, 250, "s = 25 m", 32, 800, GREEN)),
         "Write the knowns, pick the equation, then put the numbers in."),
    ], "Cover it. A stone is dropped from rest. How fast after 4 s? How far has it fallen? Which equation has no t in it?")

    proj_k = 14.0   # equal time steps: the gaps grow as t²
    proj = "".join(circ(70, 72 + proj_k * k * k, 7, GOLD, INK, 1.5) + circ(120 + 95 * k, 72 + proj_k * k * k, 7, TEAL, INK, 1.5)
                   + (ln(84, 72 + proj_k * k * k, 106 + 95 * k, 72 + proj_k * k * k, LINE, 1.5, dash="4 4") if k else "") for k in range(5))
    traj = pth("M120 72 " + " ".join(f"L{f(120 + 95 * s / 10)} {f(72 + proj_k * (s / 10) ** 2)}" for s in range(1, 41)), TEAL, 2, dash="6 5")
    pp = lambda s: (80 + 100 * s, 60 + 20 * s * s)
    comps = "".join(arw(pp(s)[0], pp(s)[1], pp(s)[0] + 60, pp(s)[1], TEAL, 3, 11) + (arw(pp(s)[0], pp(s)[1], pp(s)[0], pp(s)[1] + 26 * s, CORAL, 3, 11) if s else "") + circ(pp(s)[0], pp(s)[1], 7, INK)
                    for s in (0, 1.5, 3))
    card("phy-projectile", ["PH-027"], "Projectiles: across stays steady, down speeds up", [
        (svg("Dropped and thrown land together", ln(30, 60, 140, 60, INK, 4) + proj + traj + ln(30, 306, 610, 306, INK, 3)
             + t(70, 40, "dropped", 16, 800) + t(250, 40, "thrown sideways", 16, 800, TEAL_T) + t(600, 150, "same height", 17, 800, INK, "end")
             + t(600, 175, "at every instant", 17, 800, INK, "end")),
         "A ball thrown sideways falls exactly as fast as one dropped beside it: they hit the ground together."),
        (svg("Two independent motions", pth("M80 60 " + " ".join(f"L{f(pp(s / 10)[0])} {f(pp(s / 10)[1])}" for s in range(1, 36)), INK2, 2, dash="6 5") + comps
             + t(330, 70, "→ across: never changes", 17, 800, TEAL_T, "start") + t(330, 100, "↓ down: grows 10 m/s each second", 17, 800, RED_T, "start")),
         "Split the motion in two. Across, nothing pushes, so the speed never changes; down, gravity adds 10 m/s every second."),
        (svg("A worked example", t(320, 70, "thrown at 15 m/s from 20 m up", 24, 800) + t(320, 135, "down: 20 = ½ × 10 × t²  →  t = 2 s", 22, 800, RED_T)
             + t(320, 195, "across: 15 m/s × 2 s = 30 m", 22, 800, TEAL_T) + t(320, 262, "the fall sets the time; the time sets the range", 18, 700, INK2)),
         "The vertical fall decides the time in the air; range = horizontal speed × that time."),
    ], "Cover it. A ball rolls off a 5 m high table at 3 m/s. How long does it fall? How far from the table does it land?")

    cart = lambda x, w, lab, fill: rect(x, 0, w, 44, fill, INK, 2, 5) + circ(x + 14, 50, 7, INK2, INK) + circ(x + w - 14, 50, 7, INK2, INK) + t(x + w / 2, 29, lab, 18, 800)
    at = lambda y, s: f'<g transform="translate(0 {y})">{s}</g>'
    card("phy-momentum", ["PH-035", "PH-036"], "Momentum: change it gently; it is never lost", [
        (svg("Same impulse, different force", axes2(60, 230, 240, 170, "time", "force") + axes2(350, 230, 240, 170, "time", "force")
             + pth("M90 230 L110 90 L130 230 Z", INK, 2, GOLD) + pth("M380 230 Q 470 183 560 230 Z", INK, 2, GOLD)   # same area as the spike: ⅔ × 180 × 23.3 ≈ ½ × 40 × 140
             + t(180, 270, "hard floor: big force", 17, 800, RED_T) + t(470, 270, "cushion: small force", 17, 800, TEAL_T)
             + t(320, 310, "same area = same change in momentum (F × t = mv − mu)", 18, 800)),
         "Impulse = force × time = change in momentum. Make the stop last longer (a cushion, an airbag, bent knees) and the force is smaller."),
        (svg("A collision", t(30, 66, "before", 17, 800, INK2, "start") + at(40, cart(110, 100, "2 kg", T_GOLD) + arw(215, 22, 280, 22, TEAL, 4) + t(248, 8, "3 m/s", 16, 800, TEAL_T) + cart(370, 70, "1 kg", T_CORAL))
             + t(405, 30, "at rest", 16, 700, INK2)
             + t(30, 166, "after", 17, 800, INK2, "start") + at(140, cart(250, 100, "2 kg", T_GOLD) + cart(350, 70, "1 kg", T_CORAL) + arw(425, 22, 490, 22, TEAL, 4) + t(458, 8, "v = ?", 16, 800, TEAL_T))
             + t(320, 262, "before: 2 × 3 + 1 × 0 = 6 kg m/s", 20, 800) + t(320, 300, "after: 3 × v = 6, so v = 2 m/s", 20, 800, GREEN)),
         "In a collision the total momentum before equals the total after — here the trolleys stick and share it."),
        (svg("Pushing apart from rest", ln(320, 60, 320, 230, LINE, 2, dash="5 5") + at(120, cart(190, 110, "60 kg", T_TEAL) + arw(185, 22, 110, 22, CORAL, 4) + t(147, 8, "1 m/s", 16, 800, RED_T)
             + cart(340, 80, "40 kg", T_GOLD) + arw(425, 22, 520, 22, TEAL, 4) + t(472, 8, "1.5 m/s", 16, 800, TEAL_T))
             + t(320, 50, "they started together, at rest", 16, 700, INK2)
             + t(320, 250, "before: total momentum = 0", 19, 800) + t(320, 290, "after: −60 × 1 + 40 × 1.5 = 0 ✓", 20, 800, GREEN)),
         "From rest, the total stays zero: the two move off in opposite directions, the lighter one faster (that is recoil)."),
    ], "Cover it. A 1000 kg car at 20 m/s hits a parked 1000 kg car and they lock together: their speed? Why do airbags save lives?")

    ebar = lambda y, pe: (rect(290, y - 16, 2 * pe, 13, TEAL, INK, 1) + rect(290, y + 3, 2 * (100 - pe), 13, CORAL, INK, 1)
                          + t(505, y - 3, f"PE {pe} J", 16, 800, TEAL_T, "start") + t(505, y + 15, f"KE {100 - pe} J", 16, 800, RED_T, "start"))
    card("phy-energy", ["PH-031", "PH-032", "PH-033", "PH-034", "PH-086"], "Energy is never lost — it changes store", [
        (svg("A falling ball trades PE for KE", ln(120, 272, 260, 272, INK, 3) + ln(150, 60, 150, 260, LINE, 1.5, dash="4 4")
             + "".join(circ(150, y, 12, GOLD, INK, 1.5) + t(122, y + 6, h, 16, 700, INK2, "end") + ebar(y, pe) for y, h, pe in [(60, "5 m", 100), (160, "2.5 m", 50), (260, "0 m", 0)])
             + t(175, 40, "2 kg", 16, 800, INK, "start") + t(390, 310, "the total stays 100 J", 19, 800)),
         "As the ball falls, its gravitational potential energy becomes kinetic energy. The total never changes."),
        (svg("Working it out", t(320, 70, "at the top:  PE = mgh = 2 × 10 × 5 = 100 J", 22, 800, TEAL_T) + t(320, 125, "it falls: all of it becomes KE", 18, 700, INK2)
             + t(320, 185, "at the bottom:  ½mv² = 100 J", 22, 800, RED_T) + t(320, 235, "½ × 2 × v² = 100  →  v = 10 m/s", 24, 800)
             + t(320, 290, "so v = √(2gh) — the mass cancels", 18, 700, INK2)),
         "PE = mgh at the top equals ½mv² at the bottom (with no air resistance)."),
        (svg("Efficiency: useful out ÷ total in", t(320, 45, "efficiency = useful out ÷ total in = 30 ÷ 100 = 30%", 19, 800)
             + rect(60, 90, 240, 100, GOLD, "none", 0) + t(180, 148, "100 J in", 22, 800)
             + rect(300, 90, 210, 30, TEAL, "none", 0) + poly([(510, 78), (510, 132), (550, 105)], TEAL, TEAL, 1) + t(430, 75, "useful work 30 J", 17, 800, TEAL_T)
             + pth("M300 120 Q 370 120 370 190 L370 268 L300 268 L300 190 Z", CORAL, 0, CORAL) + rect(299, 120, 3, 70, CORAL, "none", 0)
             + poly([(285, 268), (385, 268), (335, 305)], CORAL, CORAL, 1) + t(400, 240, "wasted (heat) 70 J", 17, 800, RED_T, "start")),
         "No machine turns all its input into useful work; the rest is wasted, mostly as heat. A heat engine must always reject some heat."),
    ], "Cover it. A 0.5 kg ball falls 20 m: how much PE does it lose? Its speed at the bottom? A motor takes 500 J and lifts with 200 J: its efficiency?")

    card("phy-circular", ["PH-037", "PH-084", "PH-067", "PH-083"], "Going round needs a force to the centre", [
        (svg("Velocity along, force inward", circ(250, 170, 110, "none", LINE, 2) + circ(250, 170, 4, INK) + ln(250, 170, 350, 170, INK2, 1.5, dash="4 4")
             + arw(360, 170, 360, 62, TEAL, 4) + arw(348, 170, 275, 170, CORAL, 4) + circ(360, 170, 12, GOLD, INK, 1.5)
             + t(375, 85, "velocity: along the tangent", 17, 800, TEAL_T, "start") + t(300, 200, "force", 17, 800, RED_T)
             + t(320, 310, "F = mv² ÷ r, always towards the centre", 20, 800)),
         "The velocity points along the tangent, but the force — and the acceleration, v² ÷ r — point to the centre. Without that force there is no circle."),
        (svg("Let go, and it goes straight on", circ(220, 190, 110, "none", LINE, 2) + circ(220, 190, 4, INK) + ln(220, 190, 220, 125, INK2, 2) + ln(220, 108, 220, 92, INK2, 2)
             + circ(220, 80, 12, GOLD, INK, 1.5) + arw(234, 80, 480, 80, GREEN, 3.5) + t(360, 64, "flies off along the tangent ✓", 17, 800, GREEN)
             + arw(220, 66, 220, 20, CORAL, 2.5, 10).replace('stroke-linecap="round"', 'stroke-linecap="round" stroke-dasharray="4 4"') + t(236, 34, "✗ not straight outwards", 16, 800, RED_T, "start")
             + t(320, 310, "no force left → no turning: it goes straight on", 18, 700, INK2)),
         "Cut the string and the stone flies off along the tangent, in a straight line — not outwards."),
        (svg("Gravity holds a satellite in orbit", circ(220, 175, 120, "none", LINE, 2) + circ(220, 175, 55, T_TEAL, TEAL, 2) + t(220, 182, "Earth", 17, 800, TEAL_T)
             + rect(330, 165, 20, 20, METAL, INK, 2) + arw(330, 175, 282, 175, CORAL, 3.5) + arw(340, 162, 340, 80, TEAL, 3.5)
             + t(400, 110, "gravity is the", 17, 800, RED_T, "start") + t(400, 135, "centripetal force", 17, 800, RED_T, "start")
             + t(400, 190, "further out: weaker pull,", 17, 700, INK, "start") + t(400, 215, "slower, longer year", 17, 700, INK, "start")
             + t(400, 265, "T² ∝ r³  (Kepler)", 20, 800, INK, "start")),
         "For a satellite or a planet, gravity supplies the centripetal force. The further out the orbit, the weaker the pull and the longer the period: T² ∝ r³."),
    ], "Cover it. Which way does a stone fly when the sling string breaks? What provides the centripetal force that keeps the Moon in orbit?")

    def bob(px, py, L, deg, rad=13, fill=GOLD, dash=""):
        x, y = px + L * sin(radians(deg)), py + L * cos(radians(deg))
        return ln(px, py, x, y, INK2, 2, dash=dash) + circ(x, y, rad, fill, INK, 1.5), (x, y)
    s1, A = bob(320, 40, 200, 25); s2, O = bob(320, 40, 200, 0, fill="#fff", dash="4 4"); s3, Bp = bob(320, 40, 200, -25, fill="#fff", dash="4 4")
    card("phy-pendulum", ["PH-038"], "A pendulum's period depends on its length", [
        (svg("One oscillation", ln(260, 40, 380, 40, INK, 5) + s2 + s3 + s1 + pth(f"M{f(Bp[0])} {f(Bp[1] + 22)} Q 320 {f(O[1] + 40)} {f(A[0])} {f(A[1] + 22)}", TEAL, 2.5, dash="6 4")
             + t(A[0] + 26, A[1] + 6, "A", 18, 800, INK, "start") + t(Bp[0] - 26, Bp[1] + 6, "B", 18, 800, INK, "end") + t(O[0] + 22, O[1] + 6, "O", 18, 800, INK, "start")
             + t(320, 318, "one oscillation: A → O → B → O → A", 19, 800, TEAL_T)),
         "One oscillation is a full swing there and back. Time 20 of them and divide by 20 to get the period T."),
        (svg("Four times the length, twice the period", ln(130, 40, 270, 40, INK, 5) + ln(370, 40, 510, 40, INK, 5) + bob(200, 40, 55, 0)[0] + bob(440, 40, 220, 0)[0]
             + t(200, 135, "L = 0.25 m", 18, 800) + t(200, 162, "T ≈ 1 s", 18, 800, TEAL_T) + t(465, 255, "L = 1 m", 18, 800, INK, "start") + t(465, 282, "T ≈ 2 s", 18, 800, TEAL_T, "start")
             + t(250, 315, "4 × the length → 2 × the period", 19, 800)),
         "A longer pendulum swings more slowly. Four times the length gives twice the period."),
        (svg("Mass does not matter", ln(130, 40, 270, 40, INK, 5) + ln(370, 40, 510, 40, INK, 5) + bob(200, 40, 180, 0, 9)[0] + bob(440, 40, 180, 0, 20, METAL)[0]
             + t(200, 260, "light bob", 17, 800) + t(440, 260, "heavy bob", 17, 800) + t(320, 140, "same T", 22, 800, GREEN)
             + t(320, 305, "T = 2π√(L ÷ g) — there is no mass in it", 20, 800)),
         "Change the mass, or (for small swings) how far it swings, and the period stays the same. Only L and g matter."),
    ], "Cover it. To double a pendulum's period, what must you do to its length? Does a heavier bob swing faster?")

    # ═════════════════════════════════════ STAGE 5: WAVES AND LIGHT ═══════════════════════════════════

    lpos = [60 + i * 10 + 12 * sin(2 * pi * (i * 10) / 200) for i in range(53)]   # squeezed at 160, 360, 560
    card("phy-waves", ["PH-046"], "Waves: wavelength, amplitude, frequency", [
        (svg("A transverse wave", ln(50, 170, 590, 170, LINE, 1.5, dash="5 5") + pth(wave(60, 515, 170, 200, 60), TEAL, 3.5)
             + darw(110, 92, 310, 92) + t(210, 80, "wavelength λ", 17, 800) + darw(510, 170, 510, 110, CORAL, 2.5) + t(522, 150, "amplitude", 16, 800, RED_T, "start")
             + darw(410, 205, 410, 270, INK2, 2.5) + t(400, 300, "the rope moves up and down…", 16, 700, INK2, "end") + arw(440, 300, 560, 300, INK, 3) + t(500, 288, "…the wave goes along", 16, 700, INK2)),
         "In a transverse wave the rope moves up and down while the wave travels along. λ is crest to crest; the amplitude is from the rest line to a crest."),
        (svg("A longitudinal wave", "".join(ln(x, 120, x, 210, INK, 2) for x in lpos)
             + "".join(t(x, 104, "compression", 16, 800, TEAL_T) for x in (160, 360)) + "".join(t(x, 236, "rarefaction", 16, 800, RED_T) for x in (260, 460))
             + darw(160, 262, 360, 262) + t(260, 290, "λ", 18, 800) + t(320, 318, "sound: the air moves back and forth along the wave", 17, 700, INK2)),
         "In a longitudinal wave, like sound, the particles move back and forth along the direction the wave travels: squeezes (compressions) and stretches (rarefactions)."),
        (svg("v = f λ", pth(wave(70, 570, 80, 100, 26), TEAL, 3) + "".join(ln(70 + k * 100, 115, 70 + k * 100, 125, INK, 2) for k in range(6))
             + "".join(t(120 + k * 100, 142, "2 m", 16, 700, INK2) for k in range(5))
             + t(320, 185, "5 waves pass each second:  f = 5 Hz", 20, 800, TEAL_T) + t(320, 220, "each is 2 m long:  λ = 2 m", 20, 800)
             + t(320, 285, "v = f × λ = 5 × 2 = 10 m/s", 28, 800)),
         "Speed = frequency × wavelength: the number of waves each second times the length of each."),
    ], "Cover it. A wave has f = 50 Hz and λ = 4 m: its speed? On a drawing, where is the amplitude measured from?")

    def envelope(x0, x1, yc, amp, kind):
        L = x1 - x0
        if kind[0] == "s":
            n = int(kind[1:]); g = lambda x: amp * sin(n * pi * (x - x0) / L)
        elif kind == "closed": g = lambda x: amp * sin(pi / 2 * (x - x0) / L)
        else: g = lambda x: amp * cos(pi * (x - x0) / L)
        up = "M" + " L".join(f"{f(x)} {f(yc - g(x))}" for x in range(x0, x1 + 1, 4))
        dn = "M" + " L".join(f"{f(x)} {f(yc + g(x))}" for x in range(x0, x1 + 1, 4))
        return pth(up, TEAL, 3) + pth(dn, TEAL, 3, dash="6 4")
    pipe = lambda closed: (ln(120, 125, 520, 125, INK, 3) + ln(120, 195, 520, 195, INK, 3) + (rect(110, 120, 12, 80, INK, INK, 1) if closed else ""))
    # n = 3 on the third string: nodes at L/3 and 2L/3 (x ≈ 247, 393), an antinode in the middle (x = 320).
    card("phy-stationary", ["PH-063", "PH-064"], "Stationary waves: only whole loops fit", [
        (svg("A string fixed at both ends", "".join(rect(88, y - 22, 12, 44, METAL, INK, 1.5) + rect(540, y - 22, 12, 44, METAL, INK, 1.5) + envelope(100, 540, y, 24, f"s{n}")
             + t(560, y + 6, lab, 17, 800, INK, "start") for n, y, lab in [(1, 70, "L = λ/2"), (2, 160, "L = λ"), (3, 250, "L = 3λ/2")])
             + t(247, 218, "N", 16, 800, RED_T) + t(320, 294, "A", 16, 800, TEAL_T) + t(320, 318, "N = node (never moves)  ·  A = antinode (moves most)", 16, 700, INK2)),
         "A string fixed at both ends vibrates only in whole numbers of loops. Each loop is half a wavelength; the fixed ends are nodes."),
        (svg("A pipe closed at one end", pipe(True) + envelope(122, 520, 160, 28, "closed") + t(140, 110, "N", 18, 800, RED_T) + t(505, 110, "A", 18, 800, TEAL_T)
             + t(130, 235, "closed end: node", 16, 700, INK2, "start") + t(520, 235, "open end: antinode", 16, 700, INK2, "end") + t(320, 290, "shortest fit:  L = λ/4", 26, 800)),
         "In a pipe closed at one end the air cannot move at the closed end (a node) and moves most at the open end (an antinode): a quarter wavelength fits."),
        (svg("A pipe open at both ends", pipe(False) + envelope(120, 520, 160, 28, "open") + t(135, 110, "A", 18, 800, TEAL_T) + t(320, 110, "N", 18, 800, RED_T) + t(505, 110, "A", 18, 800, TEAL_T)
             + t(320, 240, "open ends: antinodes", 16, 700, INK2) + t(320, 290, "shortest fit:  L = λ/2", 26, 800)),
         "Open at both ends, both ends are antinodes with a node between: half a wavelength fits. Resonance happens when the pipe's length lets a fit happen."),
    ], "Cover it. Draw the lowest note of a pipe closed at one end. How long is it, in wavelengths? And for a string fixed at both ends?")

    bx = lambda f1, f2: "M" + " L".join(f"{x} {f(220 - 18 * (sin(2 * pi * f1 * (x - 60) / 500) + sin(2 * pi * f2 * (x - 60) / 500)))}" for x in range(60, 561, 2))
    env = "".join(pth("M" + " L".join(f"{x} {f(220 + sg * 36 * abs(cos(pi * 2 * (x - 60) / 500)))}" for x in range(60, 561, 4)), INK2, 1.5, dash="4 4") for sg in (1, -1))
    dop = "".join(circ(300 - 30 * k, 170, 45 * k, "none", TEAL, 2) for k in (1, 2, 3))
    card("phy-sound", ["PH-047", "PH-065", "PH-064"], "Sound: echoes, beats and the Doppler effect", [
        (svg("An echo goes there and back", man(80, 220, .9) + poly([(520, 40), (620, 40), (620, 230), (500, 230)], METAL, INK, 2) + ln(40, 230, 620, 230, INK, 3)
             + arw(120, 110, 500, 110, TEAL, 3.5) + t(310, 96, "there", 16, 800, TEAL_T) + arw(500, 150, 120, 150, CORAL, 3.5) + t(310, 176, "and back", 16, 800, RED_T)
             + t(320, 268, "the sound goes 2 × d in the time t", 18, 700, INK2) + t(320, 305, "d = v × t ÷ 2 = 340 × 1 ÷ 2 = 170 m", 22, 800)),
         "An echo travels to the wall AND back, so the distance to the wall is speed × time ÷ 2."),
        (svg("Beats", pth(wave(60, 560, 60, 50, 16), TEAL, 2.5) + pth(wave(60, 560, 125, 500 / 12, 16), CORAL, 2.5) + env + pth(bx(10, 12), INK, 2.5)
             + t(575, 66, "f₁", 18, 800, TEAL_T, "start") + t(575, 131, "f₂", 18, 800, RED_T, "start") + t(575, 226, "both", 16, 800, INK, "start")
             + t(320, 300, "loud – soft – loud:  beat frequency = f₁ − f₂", 20, 800)),
         "Two notes close in pitch fall in and out of step, so the sound swells and fades: the beat frequency is the difference of the two frequencies."),
        (svg("The Doppler effect", dop + circ(300, 170, 10, CORAL, INK, 1.5) + arw(312, 170, 360, 170, INK, 3)
             + t(385, 120, "ahead: waves squashed", 17, 800, TEAL_T, "start") + t(385, 145, "→ higher pitch", 17, 700, INK, "start")
             + t(385, 205, "behind: waves stretched", 17, 800, RED_T, "start") + t(385, 230, "→ lower pitch", 17, 700, INK, "start")),
         "A moving source crowds its waves together ahead of it and spreads them out behind — the siren drops in pitch as it passes."),
    ], "Cover it. A clap's echo returns from a wall in 0.5 s (v = 340 m/s): how far is the wall? Why does a passing siren change pitch?")

    lens = pth("M320 80 Q 352 180 320 280 Q 288 180 320 80 Z", TEAL, 2, T_TEAL)
    card("phy-light", ["PH-048", "PH-049", "PH-050"], "Light: reflection, refraction and lenses", [
        (svg("Reflection in a plane mirror", ln(150, 250, 490, 250, INK, 4) + "".join(ln(158 + k * 22, 252, 146 + k * 22, 266, INK2, 1.5) for k in range(16))
             + ln(320, 250, 320, 70, INK2, 2, dash="6 5") + t(330, 82, "normal", 16, 700, INK2, "start")
             + arw(180, 100, 320, 250, CORAL, 3) + arw(320, 250, 460, 100, CORAL, 3) + pth("M320 205 A45 45 0 0 0 289 217", INK, 2) + pth("M320 205 A45 45 0 0 1 351 217", INK, 2)
             + t(296, 196, "i", 18, 800, INK, "end") + t(344, 196, "r", 18, 800, INK, "start") + t(320, 40, "angle i = angle r", 22, 800)
             + t(320, 300, "both measured from the normal", 17, 700, INK2)),
         "Light bounces off a mirror at the same angle it arrives: angle of incidence = angle of reflection, both measured from the normal."),
        (svg("Refraction through a glass block", rect(120, 130, 400, 90, T_TEAL, TEAL, 2) + ln(260, 60, 260, 200, INK2, 1.5, dash="5 4") + ln(313.4, 150, 313.4, 290, INK2, 1.5, dash="5 4")
             + arw(141, 30, 260, 130, CORAL, 3) + ln(260, 130, 313.4, 220, CORAL, 3) + arw(313.4, 220, 408.7, 300, CORAL, 3)
             + t(244, 100, "i", 18, 800, INK, "end") + t(270, 208, "r", 18, 800, INK, "start") + t(500, 182, "glass", 17, 800, TEAL_T, "end") + t(500, 110, "air", 17, 800, INK2, "end")
             + t(30, 275, "n = sin i ÷ sin r", 22, 800, INK, "start") + t(610, 60, "slower in glass:", 16, 700, INK2, "end") + t(610, 82, "bends TOWARDS the normal", 16, 800, TEAL_T, "end")),
         "Light slows down in glass and bends towards the normal going in, away from it coming out. n = sin i ÷ sin r."),
        (svg("A converging lens", ln(40, 180, 600, 180, INK2, 1.5) + lens + ln(240, 172, 240, 188, INK, 2) + ln(400, 172, 400, 188, INK, 2) + t(240, 205, "F", 16, 800) + t(394, 205, "F", 16, 800, INK, "end")
             + arw(120, 180, 120, 120, INK, 4) + t(120, 205, "object", 16, 800) + ln(120, 120, 320, 120, CORAL, 2.5) + arw(320, 120, 453.3, 220, CORAL, 2.5)
             + arw(120, 120, 453.3, 220, TEAL, 2.5) + arw(453.3, 180, 453.3, 220, GREEN, 4) + t(453, 250, "image: real, upside down", 16, 800, GREEN)
             + t(40, 50, "1/f = 1/u + 1/v", 22, 800, INK, "start")),
         "A ray parallel to the axis bends through the focus F; a ray through the centre goes straight on. Where they cross is the image."),
    ], "Cover it. A ray meets a mirror at 30° to the normal: the reflected angle? Which way does light bend entering glass? Draw the two rays for a convex lens.")

    # ═════════════════════════════════ STAGE 6: ELECTRICITY, MAGNETISM, THE ATOM ═════════════════════

    loop = lambda x0, y0, x1, y1: pth(f"M{x0} {y0} L{x1} {y0} L{x1} {y1} L{x0} {y1} Z", INK, 2.5)
    card("phy-circuits", ["PH-051", "PH-052", "PH-053"], "Current, voltage and resistance", [
        (svg("Ammeter in the loop, voltmeter across", loop(120, 80, 520, 240) + cell(320, 80) + t(330, 50, "+", 18, 800, INK, "start") + lamp(320, 240)
             + meter(120, 160, "A") + pth("M280 240 L280 290 L303 290 M337 290 L360 290 L360 240", INK, 2.5) + meter(320, 290, "V")
             + arw(520, 130, 520, 175, CORAL, 3, 12) + t(535, 160, "I", 18, 800, RED_T, "start")
             + t(145, 165, "ammeter: in series", 16, 800, INK, "start") + t(375, 296, "voltmeter: across the lamp", 16, 800, INK, "start")),
         "Current is charge flowing per second (I = Q ÷ t), measured by an ammeter in the loop. Voltage is measured by a voltmeter across a component."),
        (svg("Ohm's law", axes2(80, 260, 280, 210, "voltage V", "current I") + ln(80, 260, 340, 80, INK, 3.5) + "".join(circ(80 + k * 65, 260 - k * 45, 5, CORAL) for k in range(1, 5))
             + t(400, 110, "V = I R", 34, 800, INK, "start") + t(400, 165, "6 V across 2 Ω:", 18, 700, INK2, "start") + t(400, 200, "I = 6 ÷ 2 = 3 A", 20, 800, TEAL_T, "start")
             + t(400, 245, "straight line: R stays the same", 16, 700, INK2, "start")),
         "For a resistor at steady temperature, current is proportional to voltage: V = IR."),
        (svg("Series and parallel", ln(60, 90, 300, 90, INK, 2.5) + resistor(125, 90) + resistor(235, 90) + t(125, 70, "6 Ω", 16, 800) + t(235, 70, "6 Ω", 16, 800)
             + pth("M60 210 L100 210 L100 175 L250 175 L250 210 L300 210 M100 210 L100 245 L250 245 L250 210", INK, 2.5) + resistor(175, 175) + resistor(175, 245)
             + t(175, 155, "6 Ω", 16, 800) + t(175, 285, "6 Ω", 16, 800)
             + t(330, 85, "series: R = 6 + 6", 18, 800, INK, "start") + t(330, 115, "= 12 Ω", 20, 800, RED_T, "start")
             + t(330, 200, "parallel: 1/R = 1/6 + 1/6", 18, 800, INK, "start") + t(330, 232, "R = 3 Ω", 20, 800, TEAL_T, "start")),
         "In series the resistances add. In parallel the total is less than the smallest, because the current has more than one path."),
    ], "Cover it. Two 4 Ω resistors: their total in series? In parallel? 12 V across 3 Ω: what current flows?")

    card("phy-emf-power", ["PH-054", "PH-055"], "E.m.f., lost volts and electrical power", [
        (svg("A cell's internal resistance", rect(200, 45, 240, 80, "none", INK2, 2, 6, "6 5") + loop(140, 85, 500, 200) + cell(270, 85) + resistor(370, 85)
             + t(270, 40, "E = 12 V", 16, 800, INK, "end") + t(370, 118, "r = 1 Ω", 16, 800, INK2) + resistor(320, 200) + t(320, 232, "R = 5 Ω", 16, 800)
             + t(320, 268, "I = E ÷ (R + r) = 12 ÷ 6 = 2 A", 20, 800) + t(320, 305, "across R: IR = 10 V   ·   lost inside: Ir = 2 V", 18, 800, RED_T)),
         "A real cell has internal resistance r, so some of its e.m.f. is used up inside it: E = I(R + r), and the terminal p.d. is E − Ir."),
        (svg("Electrical power", lamp(110, 160, True, 30) + t(200, 80, "P = I V = I²R = V² ÷ R", 26, 800, INK, "start")
             + t(200, 140, "a 240 V lamp taking 0.25 A:", 18, 700, INK2, "start") + t(200, 180, "P = 0.25 × 240 = 60 W", 24, 800, TEAL_T, "start")
             + t(200, 240, "60 W = 60 joules every second", 18, 700, INK2, "start")),
         "Power is the energy delivered each second: P = IV (and, using V = IR, also I²R and V² ÷ R)."),
        (svg("Paying for energy", t(320, 60, "energy = power × time", 24, 800) + "".join(rect(110 + k * 72, 95, 60, 60, GOLD, INK, 1.5, 6) + t(140 + k * 72, 131, "1 kWh", 16, 800) for k in range(6))
             + t(320, 185, "2 kW heater for 3 h = 6 kWh (6 units)", 20, 800, TEAL_T) + t(320, 240, "at ₦70 a unit:  6 × ₦70 = ₦420", 24, 800)
             + t(320, 290, "kilowatts × hours — not watts, not seconds", 16, 700, INK2)),
         "Electricity is sold in kilowatt-hours: power in kW × time in hours."),
    ], "Cover it. A 6 V cell with r = 1 Ω drives 1 A: how many volts are lost inside? A 1.5 kW iron runs for 2 h: units used, and the cost at ₦70?")

    tau = 80
    chg = "M" + " L".join(f"{80 + x} {f(260 - 180 * (1 - exp(-x / tau)))}" for x in range(0, 461, 4))
    dis = "M" + " L".join(f"{80 + x} {f(260 - 180 * exp(-x / tau))}" for x in range(0, 461, 4))
    card("phy-capacitor", ["PH-056", "PH-088"], "Capacitors store charge", [
        (svg("Q = CV", ln(200, 70, 200, 230, INK, 5) + ln(260, 70, 260, 230, INK, 5) + "".join(t(184, 100 + k * 40, "−", 20, 800, TEAL_T) + t(276, 100 + k * 40, "+", 20, 800, RED_T) for k in range(4))
             + pth("M200 150 L90 150 L90 280 L215 280 M245 280 L360 280 L360 150 L260 150", INK, 2.5) + cell(230, 280)
             + t(400, 100, "Q = C V", 30, 800, INK, "start") + t(400, 145, "C in farads (F)", 17, 700, INK2, "start")
             + t(400, 190, "double V → double Q", 17, 800, TEAL_T, "start") + t(400, 235, "energy = ½CV²", 18, 800, INK, "start")),
         "A capacitor stores charge on two plates: +Q on one, −Q on the other. The charge is proportional to the voltage: Q = CV."),
        (svg("Charging through a resistor", axes2(80, 260, 480, 200, "time", "voltage") + ln(80, 80, 560, 80, LINE, 1.5, dash="5 4") + pth(chg, TEAL, 3.5)
             + ln(160, 260, 160, 146, INK2, 1.5, dash="4 4") + ln(80, 146, 160, 146, INK2, 1.5, dash="4 4")
             + t(72, 86, "E", 16, 800, INK2, "end") + t(72, 152, "63%", 16, 800, INK2, "end") + t(160, 282, "τ = RC", 16, 800, TEAL_T)
             + t(420, 175, "fast at first, then slower", 18, 800)),
         "Through a resistor it charges quickly at first, then more slowly. After one time constant, τ = RC, it is 63% full."),
        (svg("Discharging", axes2(80, 260, 480, 200, "time", "charge") + pth(dis, CORAL, 3.5)
             + ln(160, 260, 160, 193.8, INK2, 1.5, dash="4 4") + ln(80, 193.8, 160, 193.8, INK2, 1.5, dash="4 4")
             + t(72, 86, "Q₀", 16, 800, INK2, "end") + t(72, 200, "37%", 16, 800, INK2, "end") + t(160, 282, "τ = RC", 16, 800, RED_T)
             + t(400, 110, "Q = Q₀ e^(−t/RC)", 22, 800) + t(400, 150, "each τ leaves 37%", 18, 700, INK2)),
         "Discharging, the charge falls fast and then slowly. After each τ = RC only 37% of it remains."),
    ], "Cover it. A 100 µF capacitor at 12 V: how much charge? With R = 10 kΩ, what is τ? How full is it after one τ?")

    coil = "".join(f'<ellipse cx="{310 + 22 * i}" cy="160" rx="11" ry="42" fill="none" stroke="{INK2}" stroke-width="2.5"/>' for i in range(6))
    core = rect(200, 60, 240, 200, METAL, INK, 2) + rect(250, 110, 140, 100, "#fff", INK, 2)
    turns = lambda x, n: "".join(f'<ellipse cx="{x}" cy="{f(120 + k * (80 / (n - 1)))}" rx="34" ry="6" fill="none" stroke="{CORAL if x < 320 else TEAL}" stroke-width="2.5"/>' for k in range(n))
    card("phy-electromagnetism", ["PH-057", "PH-058", "PH-069", "PH-085"], "Magnets and currents", [
        (svg("The motor effect", rect(60, 70, 100, 180, T_CORAL, INK, 2, 4) + t(110, 172, "N", 34, 800) + rect(480, 70, 100, 180, T_TEAL, INK, 2, 4) + t(530, 172, "S", 34, 800)
             + "".join(arw(165, y, 475, y, INK2, 1.5, 10) for y in (95, 230)) + arw(165, 160, 296, 160, INK2, 1.5, 10) + ln(344, 160, 475, 160, INK2, 1.5)
             + circ(320, 160, 20, "#fff", INK, 2.5) + circ(320, 160, 5, INK) + arw(320, 135, 320, 45, GREEN, 4.5) + t(335, 70, "force  F = BIL", 18, 800, GREEN, "start")
             + t(320, 210, "current out of page", 16, 800, INK) + t(320, 268, "field: N → S", 16, 700, INK2) + t(320, 310, "the force is at right angles to both", 18, 800)),
         "A current across a magnetic field feels a force at right angles to both the current and the field: F = BIL."),
        (svg("Electromagnetic induction", rect(110, 140, 60, 40, T_TEAL, INK, 2) + t(140, 167, "S", 18, 800) + rect(170, 140, 60, 40, T_CORAL, INK, 2) + t(200, 167, "N", 18, 800)
             + arw(240, 160, 290, 160, INK, 3.5) + coil + pth("M310 202 L310 270 L346 270 M394 270 L420 270 L420 202", INK, 2.5)
             + circ(370, 270, 24, "#fff", INK, 2) + ln(370, 282, 384, 254, CORAL, 3)
             + t(320, 60, "a CHANGING field in a coil makes a current", 19, 800) + t(40, 270, "faster → bigger current", 16, 800, TEAL_T, "start")
             + t(40, 300, "it opposes the motion (Lenz)", 16, 800, RED_T, "start")),
         "Move a magnet into a coil and a current flows; stop and it stops. Faster gives more. The induced current always opposes the change — that is magnetic braking."),
        (svg("A transformer", core + turns(225, 6) + turns(415, 3) + t(180, 140, "primary", 17, 800, RED_T, "end") + t(180, 170, "240 V", 17, 800, INK, "end") + t(180, 200, "200 turns", 17, 700, INK2, "end")
             + t(460, 140, "secondary", 17, 800, TEAL_T, "start") + t(460, 170, "24 V", 17, 800, INK, "start") + t(460, 200, "20 turns", 17, 700, INK2, "start")
             + t(320, 300, "Vs ÷ Vp = Ns ÷ Np   (a.c. only)", 22, 800)),
         "A transformer needs a.c.: the changing current in one coil induces a voltage in the other, in the same ratio as the turns."),
    ], "Cover it. Say Fleming's left-hand rule. A transformer has 100 primary and 500 secondary turns on 12 V a.c.: the output voltage?",
        hook="Fleming's left hand: thuMb = Motion (force), First finger = Field, seCond finger = Current")

    fl = (ln(232, 170, 408, 170, INK2, 2) + "".join(pth(f"M{228} {170 + s * 10} Q 320 {170 + s * b} 412 {170 + s * 10}", INK2, 2) for s in (1, -1) for b in (70, 140))
          + arw(305, 170, 335, 170, INK2, 2, 10) + "".join(arw(305, 170 + s * (5 + b / 2), 335, 170 + s * (5 + b / 2), INK2, 2, 10) for s in (1, -1) for b in (70, 140))
          + arw(198, 170, 110, 170, INK2, 2, 10) + arw(530, 170, 442, 170, INK2, 2, 10))
    q2 = lambda y, x2, a, lab, rl: (circ(120, y, 13, T_CORAL, INK, 2) + t(120, y + 6, "+", 18, 800) + circ(x2, y, 13, T_CORAL, INK, 2) + t(x2, y + 6, "+", 18, 800)
                                    + arw(x2 + 15, y, x2 + 15 + a, y, CORAL, 3.5, 11) + t(x2 + 25 + a, y + 6, lab, 18, 800, RED_T, "start")
                                    + darw(120, y + 26, x2, y + 26) + t((120 + x2) / 2, y + 50, rl, 16, 800, INK2))
    card("phy-fields", ["PH-068", "PH-070"], "Electric fields and charges", [
        (svg("Field lines from + to −", fl + circ(215, 170, 16, T_CORAL, INK, 2) + t(215, 177, "+", 22, 800) + circ(425, 170, 16, T_TEAL, INK, 2) + t(425, 177, "−", 22, 800)
             + t(320, 300, "lines run from + to −; unlike charges attract, like repel", 18, 700, INK2)),
         "Field lines leave positive charges and end on negative ones; the arrow is the push on a small positive charge."),
        (svg("The inverse square law", q2(60, 220, 110, "F", "r") + q2(150, 320, 28, "F ÷ 4", "2r") + q2(240, 420, 12, "F ÷ 9", "3r")
             + t(620, 160, "F = k q₁q₂ ÷ r²", 20, 800, INK, "end")),
         "The force between two charges falls with the square of the distance: twice as far, a quarter of the force (Coulomb's law)."),
        (svg("Electrolysis", rect(170, 90, 300, 190, "#fff", INK, 2.5) + rect(172, 120, 296, 158, T_TEAL, "none", 0) + rect(225, 60, 16, 190, METAL, INK, 2) + rect(400, 60, 16, 190, METAL, INK, 2)
             + pth("M233 60 L233 30 L305 30 M335 30 L408 30 L408 60", INK, 2.5) + cell(320, 30)
             + t(160, 175, "cathode −", 17, 800, TEAL_T, "end") + t(480, 175, "anode +", 17, 800, RED_T, "start")
             + "".join(circ(x, y, 12, T_GOLD, INK, 1.5) + t(x, y + 5, "+", 16, 800) + arw(x - 15, y, x - 45, y, TEAL, 2.5, 9) for x, y in [(330, 150), (360, 210)])
             + "".join(circ(x, y, 12, "#fff", INK, 1.5) + t(x, y + 5, "−", 16, 800) + arw(x + 15, y, x + 45, y, CORAL, 2.5, 9) for x, y in [(300, 185), (290, 245)])
             + t(320, 315, "mass deposited ∝ charge passed:  m = zIt", 19, 800)),
         "In electrolysis positive ions drift to the cathode (−) and negative ions to the anode (+). The mass deposited is proportional to the charge, It (Faraday)."),
    ], "Cover it. Which way do field lines point between + and −? Two charges move three times further apart: the force becomes what fraction?")

    hl = [(0, 800), (1, 400), (2, 200), (3, 100)]
    hy = lambda n: 270 - n * 210 / 800
    hcur = "M" + " L".join(f"{f(90 + x)} {f(hy(800 * 2 ** (-x / 100)))}" for x in range(0, 451, 4))
    card("phy-nucleus", ["PH-059", "PH-060", "PH-075", "PH-076"], "The nucleus, decay and half-life", [
        (svg("Nuclear notation and decay", t(140, 115, "238", 24, 800, INK, "end") + t(140, 172, "92", 24, 800, TEAL_T, "end") + t(146, 168, "U", 66, 800, INK, "start")
             + t(40, 225, "238 = nucleons (protons + neutrons)", 16, 700, INK2, "start") + t(40, 252, "92 = protons", 16, 700, TEAL_T, "start")
             + t(360, 75, "in a decay:", 18, 800, INK, "start") + t(360, 120, "α:  A − 4,  Z − 2", 20, 800, RED_T, "start")
             + t(360, 165, "β:  A same,  Z + 1", 20, 800, TEAL_T, "start") + t(360, 210, "γ:  no change (energy)", 20, 800, INK, "start")),
         "The top number counts protons and neutrons; the bottom counts protons. An alpha takes away 4 and 2; a beta turns a neutron into a proton."),
        (svg("Half-life", axes2(90, 270, 470, 220, "time", "count rate") + pth(hcur, CORAL, 3.5)
             + "".join(ln(90, hy(n), 90 + k * 100, hy(n), INK2, 1.5, dash="4 4") + ln(90 + k * 100, hy(n), 90 + k * 100, 270, INK2, 1.5, dash="4 4")
                       + t(82, hy(n) + 6, n, 16, 800, INK2, "end") + (t(90 + k * 100, 292, ["", "T", "2T", "3T"][k], 16, 800, TEAL_T) if k else "") for k, n in hl)
             + t(420, 110, "it halves every half-life", 18, 800)),
         "In each half-life, half of the nuclei left decay: 800 → 400 → 200 → 100. It never quite reaches zero."),
        (svg("Fission and fusion", circ(55, 140, 6, INK2, INK) + arw(65, 140, 90, 140, INK2, 2, 8) + circ(130, 140, 34, T_GOLD, INK, 2) + t(130, 147, "U", 20, 800)
             + arw(170, 140, 205, 140, INK, 3) + circ(240, 100, 22, T_CORAL, INK, 2) + circ(240, 185, 22, T_TEAL, INK, 2) + "".join(circ(285, y, 6, INK2, INK) for y in (125, 145, 165))
             + t(160, 250, "fission: a big nucleus splits", 16, 800) + circ(390, 110, 13, T_TEAL, INK, 2) + circ(390, 170, 13, T_TEAL, INK, 2) + t(390, 116, "H", 16, 800) + t(390, 176, "H", 16, 800)
             + arw(410, 140, 455, 140, INK, 3) + circ(495, 140, 22, T_GOLD, INK, 2) + t(495, 147, "He", 16, 800) + circ(545, 140, 6, INK2, INK)
             + t(470, 250, "fusion: small nuclei join", 16, 800) + t(320, 300, "a little mass is lost and becomes energy:  E = mc²", 19, 800, RED_T)),
         "Splitting a heavy nucleus (fission) or joining light ones (fusion) leaves a tiny bit less mass. That missing mass is released as energy: E = mc²."),
    ], "Cover it. Uranium-238 (Z = 92) gives off an alpha: the new A and Z? A sample's count falls from 640 to 80: how many half-lives?")

    # ═════════════════════════════════ STAGES 7–9: FIELDS, MODERN PHYSICS, OLYMPIAD ═════════════════

    lev = [(1, 270, "−13.6 eV"), (2, 150, "−3.4 eV"), (3, 100, "−1.5 eV"), (4, 75, "−0.85 eV")]
    card("phy-photons", ["PH-071", "PH-072", "PH-079"], "Light comes in photons", [
        (svg("The photoelectric effect", rect(90, 200, 180, 26, METAL, INK, 2) + rect(370, 200, 180, 26, METAL, INK, 2)
             + "".join(wiggle(x, 60, x + 50, 194, 26, 6, CORAL, 3) for x in (90, 140, 190)) + "".join(wiggle(x, 60, x + 30, 194, 9, 5, TEAL, 2.5) for x in (380, 425))
             + "".join(circ(x, y, 6, GOLD, INK) + arw(x + 6, y - 6, x + 28, y - 28, INK2, 2, 8) for x, y in [(490, 182), (535, 176)])
             + t(180, 50, "bright red light", 17, 800, RED_T) + t(460, 50, "dim ultraviolet", 17, 800, TEAL_T)
             + t(180, 255, "no electrons", 17, 800, INK2) + t(460, 255, "electrons fly out", 17, 800, GREEN)
             + t(320, 305, "each photon carries E = hf: only a high enough f frees an electron", 17, 800)),
         "Light arrives in packets, photons, each with energy E = hf. Below a threshold frequency no electron escapes, however bright the light."),
        (svg("Energy levels and spectral lines", "".join(ln(140, y, 360, y, INK, 3) + t(130, y + 6, f"n = {n}", 16, 800, INK2, "end") + t(370, y + 6, e, 16, 800, INK2, "start") for n, y, e in lev)
             + ln(140, 50, 360, 50, LINE, 2, dash="5 4") + t(370, 56, "0 (free)", 16, 700, INK2, "start") + arw(240, 102, 240, 146, CORAL, 3.5, 11)
             + wiggle(252, 125, 610, 125, 22, 6, CORAL, 2.5) + t(440, 190, "photon:  hf = E₃ − E₂", 18, 800, RED_T) + t(440, 218, "= 1.9 eV (a red line)", 16, 700, INK2)),
         "An electron dropping between energy levels gives out one photon whose energy is exactly the gap: hf = E₃ − E₂. Each gap is one line in the spectrum."),
        (svg("Where the photon's energy goes", t(320, 70, "hf  =  φ  +  ½mv²max", 30, 800) + rect(120, 120, 160, 50, T_CORAL, INK, 2) + rect(280, 120, 240, 50, T_TEAL, INK, 2)
             + darw(120, 110, 520, 110) + t(320, 99, "the photon's energy, hf", 16, 700, INK2) + t(200, 152, "φ", 22, 800) + t(400, 152, "KE of the electron", 17, 800)
             + t(200, 200, "work function:", 16, 700, INK2) + t(200, 222, "to get out", 16, 700, INK2) + t(400, 200, "what is left over", 16, 700, INK2)
             + t(320, 290, "X-rays: fast electrons stop in metal → very high-f photons", 17, 800, TEAL_T)),
         "The photon's energy pays the work function to free the electron; whatever is left is the electron's kinetic energy."),
    ], "Cover it. Why does brighter red light still free no electrons? An electron drops from −3.4 eV to −13.6 eV: the photon's energy?")

    rings = "".join(f'<ellipse cx="560" cy="170" rx="{6 + 7 * k}" ry="{28 * k}" fill="none" stroke="{TEAL}" stroke-width="3"/>' for k in (1, 2, 3))
    box = lambda x0, x1, top, bot: pth(f"M{x0} {top} L{x0} {bot} L{x1} {bot} L{x1} {top}", INK, 4)
    card("phy-quantum", ["PH-073", "PH-074", "PH-090"], "Particles behave as waves", [
        (svg("Electrons diffract", rect(50, 150, 70, 40, METAL, INK, 2) + arw(120, 170, 245, 170, CORAL, 3.5) + rect(250, 120, 8, 100, INK2, INK, 1)
             + "".join(ln(258, 170, 560, 170 + d, LINE, 1.5, dash="4 4") for d in (-84, -56, -28, 28, 56, 84)) + ln(560, 60, 560, 280, INK, 2) + rings
             + t(85, 215, "electrons", 16, 800, INK) + t(254, 245, "thin graphite", 16, 800, INK2) + t(560, 305, "rings, like light", 16, 800, TEAL_T)
             + t(320, 50, "λ = h ÷ p  =  h ÷ mv", 24, 800)),
         "A beam of electrons through thin graphite makes rings, just as light would: particles have a wavelength, λ = h ÷ p (de Broglie)."),
        (svg("A particle in a box", box(180, 460, 40, 290) + "".join(pth(wave(180, 460, y, 560 / n, 26), TEAL, 3) + ln(180, y, 460, y, LINE, 1, dash="3 4") + t(170, y + 6, f"n = {n}", 16, 800, INK2, "end")
             for n, y in [(1, 255), (2, 170), (3, 85)]) + t(320, 315, "width L: only whole half-waves fit", 18, 800)),
         "Trapped in a box, an electron's wave must fit whole half-wavelengths, like a string fixed at both ends — so only certain energies are allowed."),
        (svg("Allowed energies", t(320, 45, "E ∝ n² ÷ L²", 24, 800) + box(90, 250, 80, 280) + box(420, 500, 80, 280)
             + "".join(ln(100, y, 240, y, INK, 3) + t(260, y + 6, lab, 17, 800, TEAL_T, "start") for y, lab in [(268, "E₁"), (232, "4E₁"), (172, "9E₁")])
             + "".join(ln(428, y, 492, y, INK, 3) + t(510, y + 6, lab, 17, 800, RED_T, "start") for y, lab in [(232, "4E₁"), (88, "16E₁")])
             + t(170, 310, "width L", 17, 800) + t(460, 310, "width L ÷ 2", 17, 800)),
         "The levels grow as n². Squeeze the box to half the width and every level is four times higher — the idea behind quantum wells."),
    ], "Cover it. What does λ = h ÷ p say about a faster electron? In a box, how do E₂ and E₃ compare with E₁?")

    diode = lambda x, y, up: (poly([(x - 12, y + 10), (x + 12, y + 10), (x, y - 10)] if up else [(x - 12, y - 10), (x + 12, y - 10), (x, y + 10)], INK, INK, 1)
                              + ln(x - 12, y - 10 if up else y + 10, x + 12, y - 10 if up else y + 10, INK, 3))
    tbl = lambda x0, y0, head, rows, hi: (
        "".join(t(x0 + i * 40, y0, h, 17, 800, INK2) for i, h in enumerate(head))
        + "".join((rect(x0 - 20, y0 + 10 + k * 28, 40 * len(head), 26, T_GREEN, "none", 0, 4) if k in hi else "")
                  + "".join(t(x0 + i * 40, y0 + 30 + k * 28, v, 17, 800, GREEN if (k in hi and i == len(head) - 1) else INK) for i, v in enumerate(row)) for k, row in enumerate(rows)))
    ANDp = "M180 110 L230 110 A50 50 0 0 1 230 210 L180 210 Z"
    ORp = lambda x, y: f"M{x} {y} Q {x + 20} {y + 40} {x} {y + 80} Q {x + 60} {y + 80} {x + 90} {y + 40} Q {x + 60} {y} {x} {y} Z"
    card("phy-electronics", ["PH-077", "PH-080"], "Diodes and logic gates", [
        (svg("A diode is a one-way valve", loop(50, 80, 280, 220) + cell(165, 80) + diode(50, 150, True) + lamp(165, 220, True)
             + loop(360, 80, 590, 220) + cell(475, 80) + diode(360, 150, False) + lamp(475, 220, False)
             + arw(280, 130, 280, 170, CORAL, 3, 11) + t(165, 280, "forward: conducts", 17, 800, GREEN) + t(475, 280, "reverse: blocks", 17, 800, RED_T)
             + t(165, 305, "lamp on", 16, 700, INK2) + t(475, 305, "lamp off", 16, 700, INK2)),
         "A diode lets current through only in the direction its arrow points; turned round it blocks it."),
        (svg("The AND gate", pth(ANDp, INK, 2.5, T_GOLD) + ln(120, 135, 180, 135, INK, 2.5) + ln(120, 185, 180, 185, INK, 2.5) + ln(280, 160, 330, 160, INK, 2.5)
             + t(110, 141, "A", 18, 800, INK, "end") + t(110, 191, "B", 18, 800, INK, "end") + t(340, 166, "Q", 18, 800, INK, "start")
             + tbl(440, 90, ["A", "B", "Q"], [["0", "0", "0"], ["0", "1", "0"], ["1", "0", "0"], ["1", "1", "1"]], [3])
             + t(220, 270, "AND: 1 only if A AND B are 1", 18, 800)),
         "An AND gate gives 1 only when both inputs are 1. Read the truth table row by row."),
        (svg("OR and NOT", pth(ORp(60, 70), INK, 2.5, T_TEAL) + ln(30, 92, 66, 92, INK, 2.5) + ln(30, 128, 66, 128, INK, 2.5) + ln(150, 110, 180, 110, INK, 2.5) + t(24, 98, "A", 17, 800, INK, "end") + t(24, 134, "B", 17, 800, INK, "end")
             + tbl(220, 60, ["A", "B", "Q"], [["0", "0", "0"], ["0", "1", "1"], ["1", "0", "1"], ["1", "1", "1"]], [1, 2, 3])
             + poly([(400, 90), (400, 140), (445, 115)], T_CORAL, INK, 2.5) + circ(452, 115, 7, "#fff", INK, 2.5) + ln(370, 115, 400, 115, INK, 2.5) + ln(459, 115, 490, 115, INK, 2.5)
             + tbl(530, 60, ["A", "Q"], [["0", "1"], ["1", "0"]], [0])
             + t(160, 250, "OR: 1 if A OR B (or both) is 1", 17, 800) + t(480, 250, "NOT: flips the input", 17, 800)),
         "An OR gate gives 1 if either input (or both) is 1. A NOT gate turns 1 into 0 and 0 into 1."),
    ], "Cover it. Write the truth table for AND from memory. Which gate gives 1 when either input is 1?")

    mir = lambda x, y: ln(x - 50, y, x + 50, y, INK, 5)
    card("phy-relativity", ["PH-089"], "Moving clocks run slow", [
        (svg("A light clock", mir(320, 70) + mir(320, 250) + arw(312, 245, 312, 78, GOLD, 3, 11) + arw(328, 78, 328, 245, GOLD, 3, 11) + circ(320, 160, 6, CORAL)
             + darw(240, 72, 240, 248) + t(228, 166, "L", 18, 800, INK2, "end") + t(400, 150, "one tick: light goes", 17, 800, INK, "start") + t(400, 175, "up and back", 17, 800, INK, "start")
             + t(320, 300, "tick time  t₀ = 2L ÷ c", 22, 800)),
         "A light clock ticks each time light crosses between two mirrors and back."),
        (svg("A moving light clock", "".join(mir(x, 90) + mir(x, 250) for x in (120, 320, 520)) + arw(120, 245, 320, 95, GOLD, 3, 12) + arw(320, 95, 520, 245, GOLD, 3, 12)
             + ln(120, 250, 120, 90, LINE, 1.5, dash="4 4") + arw(380, 50, 470, 50, INK, 3.5) + t(370, 56, "v", 18, 800, INK, "end")
             + t(320, 300, "a longer path at the same speed c → a slower tick", 19, 800)),
         "Seen moving past you, the light travels a longer slanted path at the same speed c — so each tick takes longer."),
        (svg("Time dilation", t(320, 70, "Δt = γ Δt₀", 34, 800) + t(320, 120, "γ = 1 ÷ √(1 − v²/c²)", 24, 800, TEAL_T)
             + "".join(t(200, 180 + k * 36, v, 20, 800, INK, "start") + t(380, 180 + k * 36, g, 20, 800, RED_T, "start") for k, (v, g) in enumerate([("v = 0.6c", "γ = 1.25"), ("v = 0.8c", "γ ≈ 1.67"), ("v = 0.99c", "γ ≈ 7.1")]))
             + t(320, 310, "γ is never below 1: a moving clock always runs slow", 17, 700, INK2)),
         "The moving clock's time is stretched by γ, which is 1 at rest and grows without limit as v approaches c."),
    ], "Cover it. Why does a moving light clock tick slower? A clock passes at 0.6c: how long do its 10-second ticks take by yours?")
