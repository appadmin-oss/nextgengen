"""
More Maths Lab "Remember it" cards — the topics build.py's own set left without one (Stages 1, 2, 4, 5, 6 and 7).

Imported by build.py's main(), which calls add(B) with the build module itself, so every card here is drawn with
the same helpers, colours and frame as the rest and obeys the same rules (see build.py's docstring): a picture of
the idea and nothing else, three learner-paced frames with one short caption each, no motion, and a recall prompt
at the end. None of these ideas is an ordered rule or a word made of parts, so none carries a memory hook — each
is better understood than memorised.

Where two topics are the same idea seen twice (counting on and counting back; rounding and the bounds a rounded
number hides; substitution and elimination), they share one card and its `comps` lists both.
"""


def add(B):
    S, T, R, L, C, P = B.svg, B.t, B.r, B.ln, B.circ, B.poly
    INK, INK2, LINE, SOFT, GOLD, TEAL, CORAL, GREEN = B.INK, B.INK2, B.LINE, B.SOFT, B.GOLD, B.TEAL, B.CORAL, B.GREEN
    RED_T, TEAL_T = B.RED_T, B.TEAL_T
    PALE_T, PALE_C, PALE_G = "#d9f2f6", "#fde3dc", "#e3f1e6"

    def card(key, *a, **k):
        if key in B.CARDS:   # a silent overwrite would replace somebody else's card with this one
            raise SystemExit(f"maths_more: card key '{key}' already exists")
        B.card(key, *a, **k)

    def star(cx, cy, ro=24, ri=10, fill=GOLD):
        import math
        pts = [(round(cx + (ro if i % 2 == 0 else ri) * math.sin(i * math.pi / 5), 1), round(cy - (ro if i % 2 == 0 else ri) * math.cos(i * math.pi / 5), 1)) for i in range(10)]
        return P(pts, fill, INK, 1.5)

    def frac(x, y, top, bot, size=26, fill=INK):
        """A built-up fraction centred on x, its bar at y."""
        w = max(len(str(top)), len(str(bot))) * size * 0.6 + 12
        return T(x, y - 9, top, size, 800, fill) + L(x - w / 2, y, x + w / 2, y, fill, 2.5) + T(x, y + size + 3, bot, size, 800, fill)

    def hop(x1, x2, y, peak, c=CORAL):
        return f'<path d="M{x1} {y - 10} Q {(x1 + x2) / 2} {peak} {x2} {y - 10}" fill="none" stroke="{c}" stroke-width="3" marker-end="url(#a)"/>'

    def row(x0, y, n, c=GOLD, gap=40, rad=13):
        return "".join(C(x0 + i * gap, y, rad, c, INK, 1.5) for i in range(n))

    # ── Stage 1 ─────────────────────────────────────────────────────────────────
    b, sx = B.numline(185, 10, 20)
    card("counting", ["MC-001", "MC-005"], "Counting: one number for each thing", [
        (S("Seven stars, each touched once", "".join(star(80 + i * 80, 120) + T(80 + i * 80, 185, i + 1, 22, 800) for i in range(7))
           + T(320, 265, "one star, one number — none skipped, none counted twice", 18, 700, INK2)),
         "Touch each star once and say one number for it."),
        (S("Counted in another order", "".join(star(80 + i * 80, 120) + T(80 + i * 80, 185, n, 22, 800, RED_T if n == 7 else INK) for i, n in enumerate([4, 1, 6, 2, 7, 3, 5]))
           + f'<circle cx="400" cy="178" r="20" fill="none" stroke="{CORAL}" stroke-width="3"/>'
           + T(320, 265, "start anywhere — the last number said is still 7", 18, 700)),
         "The last number you say is how many there are, whatever order you count in."),
        (S("Counting back 4 from 17", T(320, 60, "17 − 4: count back 4", 26, 800) + b + C(sx(17), 185, 9) + C(sx(13), 185, 9, CORAL)
           + "".join(hop(sx(17 - k), sx(16 - k), 185, 115) for k in range(4))
           + T(320, 280, "16, 15, 14, 13 — counting back undoes counting on", 18, 700, INK2)),
         "Counting back 4 is taking away 4: from 17 you land on 13."),
    ], "Cover it. Count back 5 from 32 — where do you land? Why does the last number you say tell you how many?")

    def basket(x, y, w, n, per=4):
        out = R(x, y, w, 100, SOFT)
        rows = (n + per - 1) // per
        for i in range(n):
            rr, cc = divmod(i, per)
            in_row = min(per, n - rr * per)
            out += C(x + w / 2 + (cc - (in_row - 1) / 2) * 34, y + 50 + (rr - (rows - 1) / 2) * 34, 13, GOLD, INK, 1.5)
        return out
    card("adding", ["MC-002", "MC-011"], "Adding: put the groups together", [
        (S("3 mangoes and 4 mangoes", basket(30, 80, 150, 3) + T(205, 140, "+", 34, 800) + basket(230, 80, 150, 4, 2) + T(405, 140, "=", 34, 800) + basket(430, 80, 180, 7)
           + T(105, 215, "3", 26, 800) + T(305, 215, "4", 26, 800) + T(520, 215, "7", 26, 800, TEAL_T)
           + T(320, 285, "put the two groups together and count the whole", 18, 700, INK2)),
         "Adding puts two groups together and counts the whole: 3 + 4 = 7."),
        (S("Turned round, the total stays", T(100, 115, "3 + 4", 24, 800, INK, "end") + row(140, 105, 3) + row(260, 105, 4, TEAL)
           + T(100, 205, "4 + 3", 24, 800, INK, "end") + row(140, 195, 4, TEAL) + row(300, 195, 3)
           + T(500, 160, "= 7", 34, 800, TEAL_T) + T(320, 285, "a + b = b + a — add in any order", 20, 800)),
         "The order you add in does not change the total."),
        (S("Column addition with carrying", "".join(T(220 + i * 60, 60, h, 16, 700, INK2) for i, h in enumerate("HTO"))
           + T(220, 88, "1", 16, 800, RED_T) + T(280, 88, "1", 16, 800, RED_T)
           + "".join(T(220 + i * 60, 125, d, 30, 800) for i, d in enumerate("158")) + T(170, 170, "+", 30, 800)
           + "".join(T(220 + i * 60, 170, d, 30, 800) for i, d in enumerate("147")) + L(180, 186, 370, 186, INK, 2.5)
           + "".join(T(220 + i * 60, 225, d, 30, 800, TEAL_T) for i, d in enumerate("305"))
           + T(410, 115, "ones: 8 + 7 = 15", 17, 700, INK, "start") + T(410, 150, "tens: 1 + 5 + 4 = 10", 17, 700, INK, "start") + T(410, 185, "hundreds: 1 + 1 + 1 = 3", 17, 700, INK, "start")
           + T(320, 290, "line up the places; carry 1 when a column reaches 10", 17, 700, INK2)),
         "Add each column from the ones; ten in a column carries 1 to the next column."),
    ], "Cover it. Why is 25 + 38 the same as 38 + 25? Work out 476 + 258 and say each carry.")

    card("zero", ["MC-003"], "Zero: the number that changes nothing when you add it", [
        (S("Adding an empty basket", basket(30, 80, 150, 5, 3) + T(205, 140, "+", 34, 800) + R(230, 80, 150, 100, "#fff") + T(405, 140, "=", 34, 800) + basket(430, 80, 180, 5, 3)
           + T(105, 215, "5", 26, 800) + T(305, 215, "0", 26, 800, RED_T) + T(520, 215, "5", 26, 800)
           + T(320, 285, "an empty basket holds 0 — adding it changes nothing", 18, 700, INK2)),
         "Zero is how many are in an empty basket, so 5 + 0 = 5."),
        (S("Taking them all away", basket(60, 80, 180, 5, 3) + L(270, 130, 360, 130, INK2, 2.5, True) + R(390, 80, 180, 100, "#fff")
           + T(150, 215, "5", 26, 800) + T(480, 215, "0", 26, 800, RED_T)
           + T(320, 280, "5 − 5 = 0   but   5 − 0 = 5", 24, 800)),
         "Take every mango away and none are left: a number minus itself is 0."),
        (S("Four facts about zero", T(190, 80, "n + 0 = n", 28, 800, TEAL_T) + T(450, 80, "n − 0 = n", 28, 800, TEAL_T)
           + T(190, 160, "n − n = 0", 28, 800, RED_T) + T(450, 160, "n × 0 = 0", 28, 800, RED_T)
           + T(320, 245, "adding or taking away 0: the number stays", 18, 700) + T(320, 285, "taking all of it, or 0 lots of it: nothing is left", 18, 700, INK2)),
         "Adding or taking away 0 leaves a number as it is; a number minus itself, or times 0, is 0."),
    ], "Cover it. Which of these equal 47: 47 + 0, 47 × 0, 47 − 0, 0 + 47? Why?")

    card("subtracting", ["MC-012"], "Subtraction: how many are left, and how far apart", [
        (S("8 take away 3", "".join(C(110 + i * 60, 130, 18, GOLD if i < 5 else "#fff", INK, 1.5) for i in range(8))
           + "".join(L(110 + i * 60 - 14, 116, 110 + i * 60 + 14, 144, CORAL, 3.5) + L(110 + i * 60 + 14, 116, 110 + i * 60 - 14, 144, CORAL, 3.5) for i in range(5, 8))
           + T(320, 220, "8 − 3 = 5 left", 30, 800) + T(320, 275, "take away: cross out 3, count what is left", 18, 700, INK2)),
         "Subtraction as taking away: 8 − 3 leaves 5."),
        (S("How much more has Ada?", T(110, 103, "Ada", 18, 800, INK, "end") + R(130, 75, 400, 44, GOLD, INK, 4, 1.5, False) + T(520, 103, "₦500", 18, 800, INK, "end")
           + T(110, 168, "Tobi", 18, 800, INK, "end") + R(130, 140, 256, 44, TEAL, INK, 4, 1.5, False) + T(376, 168, "₦320", 18, 800, INK, "end")
           + R(386, 140, 144, 44, "#fff", CORAL, 4, 2, False) + T(458, 168, "?", 22, 800, RED_T)
           + T(320, 240, "500 − 320 = 180", 28, 800) + T(320, 285, "the difference is the gap: Ada has ₦180 more", 18, 700, INK2)),
         "“How much more” is the gap between the two amounts: also a subtraction."),
        (S("Count up to check", L(80, 190, 580, 190, INK, 2.5) + "".join(L(x, 180, x, 200, INK, 2) + T(x, 228, v, 18, 700) for x, v in [(120, "320"), (290, "400"), (520, "500")])
           + hop(120, 290, 190, 110, TEAL) + hop(290, 520, 190, 110, TEAL) + T(205, 125, "+80", 20, 800, TEAL_T) + T(405, 125, "+100", 20, 800, TEAL_T)
           + T(320, 62, "from 320 up to 500: 80 + 100 = 180", 22, 800) + T(320, 285, "a − b is what you add to b to make a", 18, 700, INK2)),
         "Count up from the smaller amount to the bigger: what you add is the difference."),
    ], "Cover it. Kemi has ₦750 and Sola has ₦480. How much more has Kemi? Check by counting up.")

    card("comparing", ["MC-006", "MC-007"], "Comparing numbers: more, less or equal", [
        (S("Pair them up", T(60, 108, "5", 24, 800) + row(110, 100, 5) + T(60, 198, "7", 24, 800) + row(110, 190, 7, TEAL)
           + "".join(L(110 + i * 40, 116, 110 + i * 40, 174, INK2, 2) for i in range(5))
           + f'<rect x="{110 + 5 * 40 - 20}" y="166" width="80" height="48" rx="10" fill="none" stroke="{CORAL}" stroke-width="2.5" stroke-dasharray="6 4"/>'
           + T(320, 265, "5 < 7: the row with some left over has more", 20, 800)),
         "Pair the things off one to one: whichever row has some left over has more."),
        (S("The sign points to the smaller", T(320, 105, "47 < 74", 48, 800) + T(320, 150, "4 tens is less than 7 tens", 18, 700, TEAL_T)
           + T(320, 220, "74 > 47", 34, 800) + T(320, 275, "the open side of the sign faces the bigger number", 18, 700, INK2)),
         "Compare the tens first; the open side of < or > faces the bigger number."),
        (S("Compare from the left", "".join(T(230 + i * 60, 60, h, 16, 700, INK2) for i, h in enumerate(["Th", "H", "T", "O"]))
           + R(325, 72, 50, 112, PALE_C, CORAL, 6, 2, False)
           + "".join(T(230 + i * 60, 115, d, 30, 800) for i, d in enumerate("4710")) + "".join(T(230 + i * 60, 165, d, 30, 800) for i, d in enumerate("4701"))
           + T(320, 235, "same thousands, same hundreds — the tens decide", 18, 700, RED_T) + T(320, 280, "4,710 > 4,701", 26, 800)),
         "Line the numbers up by place value; the first column that differs decides. More digits always means bigger."),
    ], "Cover it. Which sign goes in 63 ☐ 36? Put 3,091, 3,190 and 3,109 in order, smallest first.")

    # ── Stage 2 ─────────────────────────────────────────────────────────────────
    def arr(x, y, rows, cols, c=GOLD, s=20):
        return "".join(f'<rect x="{x + j * s}" y="{y + i * s}" width="{s - 3}" height="{s - 3}" fill="{c}" stroke="{INK}" stroke-width="1"/>' for i in range(rows) for j in range(cols))
    b2, sx2 = B.numline(170, 0, 15)
    card("factors", ["MC-019"], "Factors come in pairs; multiples go on for ever", [
        (S("Every rectangle of 12", arr(60, 50, 1, 12) + T(320, 66, "1 × 12", 20, 800, INK, "start")
           + arr(60, 105, 2, 6, TEAL) + T(200, 130, "2 × 6", 20, 800, INK, "start") + arr(340, 100, 3, 4, CORAL) + T(440, 130, "3 × 4", 20, 800, INK, "start")
           + T(320, 225, "factors of 12: 1, 2, 3, 4, 6, 12", 24, 800) + T(320, 275, "each rectangle gives a pair that multiplies to 12", 18, 700, INK2)),
         "Every way to make 12 into a rectangle gives a pair of factors."),
        (S("Multiples of 3", b2 + "".join(C(sx2(v), 170, 10, GOLD) for v in (3, 6, 9, 12, 15))
           + T(320, 80, "multiples of 3: 3, 6, 9, 12, 15, …", 24, 800, TEAL_T)
           + T(320, 265, "a factor goes INTO a number; a multiple is in its times table", 18, 700, INK2)),
         "The multiples of 3 are its times table, and they never stop."),
        (S("The digit-sum test", T(320, 70, "2,145 → 2 + 1 + 4 + 5 = 12", 28, 800) + T(320, 120, "12 is in the 3 times table, so 3 divides 2,145", 18, 700, TEAL_T)
           + T(320, 175, "÷ 9: the digit sum is in the 9 times table", 18, 700)
           + T(320, 235, "÷ 2: last digit even   ÷ 5: ends in 0 or 5", 18, 700, INK2) + T(320, 270, "÷ 10: ends in 0", 18, 700, INK2)),
         "A number divides by 3 (or 9) exactly when the sum of its digits does."),
    ], "Cover it. List the factors of 18 in pairs. Is 4,512 divisible by 3? By 9?")

    def node(x, y, v, prime=False):
        return (C(x, y - 7, 22, GOLD, INK, 1.5) if prime else "") + T(x, y, v, 22, 800)
    card("hcf-lcm", ["MC-020"], "Primes, HCF and LCM: share out the prime factors", [
        (S("Seven makes one row only", arr(60, 80, 1, 7, GOLD, 30) + T(320, 102, "7 = 1 × 7 only", 20, 800, INK, "start")
           + arr(60, 150, 2, 3, TEAL, 30) + T(320, 187, "6 = 1 × 6 = 2 × 3", 20, 800, INK, "start")
           + T(320, 270, "a prime has exactly two factors: 1 and itself", 20, 800, RED_T)),
         "A prime number can only be laid out as one row: its only factors are 1 and itself."),
        (S("Factor trees", node(170, 60, "12") + L(160, 70, 125, 110, INK2, 2) + L(180, 70, 215, 110, INK2, 2) + node(120, 135, "2", True) + node(220, 135, "6")
           + L(210, 145, 185, 185, INK2, 2) + L(230, 145, 255, 185, INK2, 2) + node(180, 210, "2", True) + node(260, 210, "3", True)
           + node(470, 60, "18") + L(460, 70, 425, 110, INK2, 2) + L(480, 70, 515, 110, INK2, 2) + node(420, 135, "2", True) + node(520, 135, "9")
           + L(510, 145, 485, 185, INK2, 2) + L(530, 145, 555, 185, INK2, 2) + node(480, 210, "3", True) + node(560, 210, "3", True)
           + T(180, 285, "12 = 2 × 2 × 3", 22, 800) + T(480, 285, "18 = 2 × 3 × 3", 22, 800)),
         "Split each number until every branch ends in a prime."),
        (S("Shared and not shared", f'<circle cx="255" cy="135" r="95" fill="{PALE_C}" fill-opacity=".7" stroke="{CORAL}" stroke-width="2"/>'
           + f'<circle cx="385" cy="135" r="95" fill="{PALE_T}" fill-opacity=".7" stroke="{TEAL}" stroke-width="2"/>'
           + T(130, 60, "12", 22, 800, RED_T) + T(510, 60, "18", 22, 800, TEAL_T)
           + T(205, 145, "2", 26, 800) + T(320, 125, "2", 26, 800) + T(320, 165, "3", 26, 800) + T(435, 145, "3", 26, 800)
           + T(320, 268, "HCF = the shared primes: 2 × 3 = 6", 20, 800, TEAL_T) + T(320, 305, "LCM = all of them: 2 × 2 × 3 × 3 = 36", 20, 800, RED_T)),
         "The HCF multiplies the primes both share; the LCM multiplies every prime either needs."),
    ], "Cover it. Find the HCF and LCM of 8 and 12 from their prime factors.")

    # ── Stage 4 ─────────────────────────────────────────────────────────────────
    card("unit-conversion", ["MC-034"], "Converting units: same amount, different-sized pieces", [
        (S("One kilometre is a thousand metres", R(70, 70, 500, 50, GOLD, INK, 4, 1.5, False) + T(320, 103, "1 km", 22, 800)
           + "".join(f'<rect x="{70 + i * 50}" y="150" width="50" height="50" fill="{TEAL if i % 2 == 0 else PALE_T}" stroke="{INK}" stroke-width="1.2"/>' for i in range(10))
           + T(320, 235, "10 pieces of 100 m = 1,000 m", 20, 800, TEAL_T) + T(320, 280, "smaller pieces → more of them; bigger pieces → fewer", 18, 700, INK2)),
         "1 km and 1,000 m are the same length, cut into pieces of a different size."),
        (S("Multiply or divide", T(160, 80, "km", 30, 800) + T(480, 80, "m", 30, 800) + L(210, 70, 430, 70, TEAL, 3, True) + T(320, 55, "× 1,000", 18, 800, TEAL_T)
           + T(320, 125, "2.5 km = 2.5 × 1,000 = 2,500 m", 22, 800)
           + T(160, 195, "g", 30, 800) + T(480, 195, "kg", 30, 800) + L(210, 185, 430, 185, CORAL, 3, True) + T(320, 170, "÷ 1,000", 18, 800, RED_T)
           + T(320, 240, "750 g = 750 ÷ 1,000 = 0.75 kg", 22, 800) + T(320, 290, "to a smaller unit the number grows; to a bigger unit it shrinks", 16, 700, INK2)),
         "Going to a smaller unit, multiply; going to a bigger unit, divide."),
        (S("Time is not decimal", T(320, 80, "1 hour = 60 minutes, not 100", 28, 800, RED_T)
           + T(320, 150, "2 h 15 min = 2 × 60 + 15 = 135 min", 22, 800) + T(320, 210, "1.5 h = 1 h 30 min   ·   0.75 h = 45 min", 22, 800, TEAL_T)
           + T(320, 275, "always ask: how many small units make one big one?", 18, 700, INK2)),
         "Hours and minutes go in sixties, so 1.5 hours is 1 hour 30 minutes."),
    ], "Cover it. Change 3.2 km to metres and 1,500 g to kilograms. How many minutes are in 1 h 45 min?")

    card("rounding", ["MC-035", "MC-036"], "Rounding: the nearest value, and the range it hides", [
        (S("2,374 to the nearest hundred", T(320, 60, "2,374 to the nearest 100", 26, 800) + L(90, 170, 550, 170, INK, 2.5)
           + "".join(L(x, 158, x, 182, INK, 2) + T(x, 212, v, 18, 700, c) for x, v, c in [(100, "2,300", INK), (320, "2,350", INK2), (540, "2,400", INK)])
           + C(426, 170, 9, CORAL) + T(426, 140, "2,374", 18, 800, RED_T) + L(436, 170, 528, 170, CORAL, 3.5, True)
           + T(320, 275, "past halfway (74 is 50 or more) → round up to 2,400", 18, 700, INK2)),
         "Find the two hundreds it sits between; it rounds to the nearer one. Halfway or more rounds up."),
        (S("Significant figures", "".join(R(95 + i * 64, 80, 54, 64, c, INK if c != "#fff" else LINE, 6, 1.5, False) + T(122 + i * 64, 124, d, 30, 800, INK if c != "#fff" else INK2)
                                           for i, (d, c) in enumerate([("0", "#fff"), (".", "#fff"), ("0", "#fff"), ("0", "#fff"), ("4", GOLD), ("7", GOLD), ("2", PALE_C)]))
           + T(320, 195, "0.00472 = 0.0047 to 2 significant figures", 22, 800)
           + T(320, 250, "start at the first digit that is not 0", 18, 700, TEAL_T) + T(320, 285, "zeros in front only hold the places", 18, 700, INK2)),
         "Significant figures start at the first non-zero digit; the zeros in front only hold places."),
        (S("Bounds of 7 cm", T(320, 60, "7 cm, to the nearest cm", 26, 800) + L(80, 170, 560, 170, INK, 2.5)
           + "".join(L(x, 160, x, 180, INK, 2) + T(x, 212, v, 18, 700) for x, v in [(100, "6"), (320, "7"), (540, "8")])
           + L(210, 170, 430, 170, TEAL, 8) + C(210, 170, 9, TEAL, INK) + C(430, 170, 9, "#fff", INK, 2.5)
           + T(210, 140, "6.5", 18, 800, TEAL_T) + T(430, 140, "7.5", 18, 800, TEAL_T)
           + T(320, 270, "6.5 ≤ length < 7.5", 28, 800) + T(320, 305, "half a unit either side", 17, 700, INK2)),
         "A rounded measurement could be up to half a unit either side: those ends are its bounds."),
    ], "Cover it. Round 5,649 to the nearest 100 and 0.03081 to 2 s.f. A bag is 40 kg to the nearest kg: what are its bounds?")

    card("speed-dst", ["MC-039"], "Speed: the distance gone in each hour", [
        (S("A danfo at 60 km/h", L(70, 170, 590, 170, INK, 2.5, True) + "".join(L(90 + i * 150, 160, 90 + i * 150, 180, INK, 2) + T(90 + i * 150, 210, f"{60 * i} km", 18, 800) + T(90 + i * 150, 140, f"{i} h", 18, 700, TEAL_T) for i in range(4))
           + "".join(hop(90 + i * 150, 240 + i * 150, 112, 62, TEAL) for i in range(3))
           + T(320, 275, "every hour, another 60 km: speed is 60 km per hour", 18, 700, INK2)),
         "A danfo at 60 km/h covers another 60 km in every hour."),
        (S("Speed, distance, time", T(320, 75, "speed = distance ÷ time", 30, 800) + T(320, 130, "distance = speed × time", 22, 800, TEAL_T) + T(320, 170, "time = distance ÷ speed", 22, 800, TEAL_T)
           + T(320, 235, "for km/h, the time must be in hours:", 18, 700) + T(320, 270, "45 min = 0.75 h, so 54 km in 45 min = 54 ÷ 0.75 = 72 km/h", 16, 700, RED_T)),
         "Speed is distance divided by time — with the time in the unit the speed uses."),
        (S("Average speed", T(320, 70, "60 km at 60 km/h → 1 h", 22, 800) + T(320, 115, "60 km at 30 km/h → 2 h", 22, 800)
           + T(320, 185, "average = 120 km ÷ 3 h = 40 km/h", 26, 800, TEAL_T) + T(320, 250, "not (60 + 30) ÷ 2 = 45", 22, 800, RED_T)
           + T(320, 290, "total distance ÷ total time", 18, 700, INK2)),
         "Average speed is total distance ÷ total time — not the average of the speeds."),
    ], "Cover it. A bus goes 90 km in 1 h 30 min. What is its speed? Why is average speed not the average of the speeds?")

    card("bar-model", ["MC-040", "MC-050"], "Word problems: draw it, then write it", [
        (S("Draw the story", T(320, 50, "Ade has ₦500 more than Bola. Together: ₦2,300.", 19, 800)
           + T(110, 118, "Bola", 18, 800, INK, "end") + R(130, 90, 220, 44, TEAL, INK, 4, 1.5, False) + T(240, 118, "?", 20, 800)
           + T(110, 188, "Ade", 18, 800, INK, "end") + R(130, 160, 220, 44, TEAL, INK, 4, 1.5, False) + T(240, 188, "?", 20, 800) + R(350, 160, 110, 44, PALE_C, CORAL, 4, 2, False) + T(405, 188, "₦500", 18, 800, RED_T)
           + L(490, 90, 490, 204, INK2, 2.5) + L(482, 90, 490, 90, INK2, 2.5) + L(482, 204, 490, 204, INK2, 2.5) + T(505, 153, "₦2,300", 20, 800, INK, "start")
           + T(320, 275, "Ade's bar is Bola's bar and ₦500 more", 18, 700, INK2)),
         "Draw a bar for each amount: Ade's is Bola's bar plus ₦500."),
        (S("Take the extra away", R(130, 80, 220, 44, TEAL, INK, 4, 1.5, False) + R(130, 140, 220, 44, TEAL, INK, 4, 1.5, False) + T(240, 108, "₦900", 20, 800) + T(240, 168, "₦900", 20, 800)
           + T(380, 140, "₦2,300 − ₦500", 20, 800, INK, "start") + T(380, 175, "= ₦1,800", 20, 800, INK, "start")
           + T(320, 240, "two equal bars = ₦1,800, so one bar = ₦900", 20, 800, TEAL_T) + T(320, 285, "Bola has ₦900 and Ade has ₦1,400", 20, 800)),
         "Take away the extra and what is left is equal bars: share it out."),
        (S("The same, in algebra", T(320, 60, "let Bola have b", 22, 800, INK2) + T(320, 110, "b + (b + 500) = 2,300", 28, 800)
           + T(320, 160, "2b + 500 = 2,300", 24, 800, TEAL_T) + T(320, 205, "2b = 1,800 → b = 900", 24, 800, TEAL_T)
           + T(320, 270, "check: 900 + 1,400 = 2,300 ✓", 20, 800, GREEN)),
         "The bars are the equation: name the unknown, write what the story says, solve, then check."),
    ], "Cover it. Two numbers add to 50 and one is 8 more than the other. Draw the bars, then write the equation.")

    # ── Stages 5 and 7 ──────────────────────────────────────────────────────────
    def tower(x, n, first=2, s=17, base=232):
        return "".join(f'<rect x="{x}" y="{base - (k + 1) * s}" width="{s * 2}" height="{s - 2}" fill="{GOLD if k < first else TEAL}" stroke="{INK}" stroke-width="1"/>' for k in range(n))
    card("sequences", ["MC-041", "MC-070"], "Sequences: a start plus equal steps", [
        (S("2, 5, 8, 11", "".join(tower(110 + i * 120, v) + T(127 + i * 120, 262, v, 22, 800) for i, v in enumerate([2, 5, 8, 11]))
           + "".join(T(205 + i * 120, 70, "+3", 20, 800, TEAL_T) for i in range(3))
           + T(320, 305, "start at 2, add the same 3 every time", 18, 700, INK2)),
         "An arithmetic sequence starts somewhere and adds the same step each time."),
        (S("The nth term", T(320, 80, "nth term = a + (n − 1)d", 32, 800) + T(320, 125, "a = first term   d = the step", 18, 700, INK2)
           + T(320, 190, "10th term: the start, then 9 steps", 22, 800, TEAL_T) + T(320, 235, "2 + 9 × 3 = 29", 28, 800)
           + T(320, 290, "to reach term n you take n − 1 steps", 18, 700, RED_T)),
         "To reach the nth term you take one step fewer than n: a + (n − 1)d."),
        (S("Add or multiply", T(60, 90, "AP", 26, 800, TEAL_T, "start") + T(130, 90, "3, 5, 7, 9, …", 26, 800, INK, "start") + T(370, 90, "add 2 each time", 18, 700, INK2, "start")
           + T(60, 170, "GP", 26, 800, RED_T, "start") + T(130, 170, "3, 6, 12, 24, …", 26, 800, INK, "start") + T(370, 170, "× 2 each time", 18, 700, INK2, "start")
           + T(320, 250, "AP: a + (n − 1)d      GP: a × rⁿ⁻¹", 22, 800)),
         "An arithmetic progression adds the same step; a geometric progression multiplies by the same ratio."),
    ], "Cover it. Find the 20th term of 4, 7, 10, … Is 5, 10, 20, 40 an AP or a GP? Say how you know.")

    # ── Stage 6 ─────────────────────────────────────────────────────────────────
    ia, sa = B.numline(115, -5, 5)
    ib, sb = B.numline(235, -5, 5)
    ic, sc = B.numline(180, -6, 6)
    card("inequalities", ["MC-052"], "Inequalities: a whole range of answers", [
        (S("On the number line", ia + L(sa(2), 115, 584, 115, TEAL, 6) + P([(582, 106), (599, 115), (582, 124)], TEAL, TEAL, 1) + C(sa(2), 115, 9, "#fff", TEAL, 3) + T(320, 75, "x > 2: open circle, 2 is not in", 17, 800, TEAL_T)
           + ib + L(sb(-1), 235, 56, 235, CORAL, 6) + P([(58, 226), (41, 235), (58, 244)], CORAL, CORAL, 1) + C(sb(-1), 235, 9, CORAL, CORAL, 3) + T(320, 195, "x ≤ −1: filled circle, −1 is in", 17, 800, RED_T)),
         "An inequality is a range: open circle when the end is not included, filled when it is."),
        (S("Solve it like an equation", T(320, 75, "2x + 1 < 7", 32, 800) + T(320, 130, "take 1 from both sides:   2x < 6", 22, 800, TEAL_T)
           + T(320, 180, "divide both sides by 2:   x < 3", 22, 800, TEAL_T) + T(320, 255, "do the same to both sides, as with an equation", 18, 700, INK2)),
         "Do the same to both sides, just as you would to an equation."),
        (S("A negative turns it round", ic + C(sc(2), 180, 9, GOLD) + C(sc(5), 180, 9, GOLD) + C(sc(-2), 180, 9, CORAL) + C(sc(-5), 180, 9, CORAL)
           + T(sc(3.5), 140, "2 < 5", 22, 800) + T(sc(-3.5), 140, "−2 > −5", 22, 800, RED_T)
           + T(320, 75, "× (−1) flips the line round 0", 22, 800) + T(320, 280, "× or ÷ by a negative: turn the sign round", 20, 800, RED_T)),
         "Multiplying or dividing both sides by a negative number reverses the inequality sign."),
    ], "Cover it. Solve 3 − 2x ≥ 9 and draw it on a number line. Is the circle open or filled?")

    gx = lambda v: 80 + v * 50
    gy = lambda v: 270 - v * 26
    card("simultaneous", ["MC-053", "MC-054"], "Simultaneous equations: the one pair that fits both", [
        (S("Two lines cross once", B.axes(80, 270, 480, 230) + L(gx(0), gy(7), gx(7), gy(0), TEAL, 3.5) + L(gx(0), gy(1), gx(7), gy(8), CORAL, 3.5)
           + C(gx(3), gy(4), 9, GOLD) + T(gx(3) + 18, gy(4) + 6, "(3, 4)", 20, 800, INK, "start")
           + T(gx(6.2), gy(0.8) - 4, "x + y = 7", 18, 800, TEAL_T, "start") + T(gx(4.8), gy(7.6), "y = x + 1", 18, 800, RED_T, "end")),
         "Each equation is a line of points; the solution is the one point on both lines."),
        (S("Substitution", T(320, 65, "y = x + 1   and   x + y = 7", 24, 800) + T(320, 115, "put x + 1 where y is:", 18, 700, INK2)
           + T(320, 160, "x + (x + 1) = 7", 26, 800, TEAL_T) + T(320, 205, "2x + 1 = 7 → x = 3", 24, 800) + T(320, 250, "then y = 3 + 1 = 4", 24, 800)
           + T(320, 295, "one equation tells you a letter: swap it into the other", 17, 700, INK2)),
         "Substitution: when one equation says what a letter is, put that into the other."),
        (S("Elimination", T(260, 75, "x + y = 7", 28, 800, INK, "end") + T(260, 120, "−x + y = 1", 28, 800, INK, "end") + T(98, 120, "+", 28, 800, INK2, "end")
           + L(90, 138, 270, 138, INK, 2.5) + T(260, 180, "2y = 8", 28, 800, TEAL_T, "end")
           + T(320, 75, "add them: the x's cancel", 18, 700, INK2, "start") + T(320, 180, "so y = 4, then x = 3", 20, 800, INK, "start")
           + T(320, 255, "add or subtract whole equations to make a letter vanish", 18, 700, RED_T) + T(320, 292, "check in BOTH: 3 + 4 = 7 ✓  4 − 3 = 1 ✓", 18, 700, GREEN)),
         "Elimination: add or subtract the equations so one letter cancels — the same answer, (3, 4)."),
    ], "Cover it. Solve x + y = 10 and x − y = 4 by elimination, then check it by substitution.")

    def bar2(x, y, w, parts):
        """One bar cut into len(parts) equal pieces, each painted its own colour."""
        n = len(parts)
        return "".join(f'<rect x="{x + i * w / n}" y="{y}" width="{w / n}" height="44" fill="{c}" stroke="{INK}" stroke-width="1.5"/>' for i, c in enumerate(parts))
    card("algebraic-fractions", ["MC-059"], "Adding fractions needs same-sized parts — letters too", [
        (S("Halves and thirds", B.bar(40, 80, 240, 2, 1) + T(320, 112, "+", 30, 800) + B.bar(360, 80, 240, 3, 1, TEAL)
           + frac(160, 180, 1, 2) + frac(480, 180, 1, 3)
           + T(320, 275, "different-sized parts cannot be counted together", 18, 700) + T(320, 308, "1/2 + 1/3 is NOT 2/5", 18, 800, RED_T)),
         "A half and a third are pieces of different sizes, so they cannot be added yet."),
        (S("Cut both into sixths", bar2(40, 60, 240, [GOLD] * 3 + ["#fff"] * 3) + T(320, 92, "+", 30, 800) + bar2(360, 60, 240, [TEAL] * 2 + ["#fff"] * 4)
           + bar2(160, 150, 320, [GOLD] * 3 + [TEAL] * 2 + ["#fff"])
           + T(320, 250, "3/6 + 2/6 = 5/6", 30, 800) + T(320, 292, "same-sized parts: now just count them", 18, 700, INK2)),
         "Cut both into sixths: 3/6 + 2/6 = 5/6."),
        (S("The same with x", frac(110, 120, "x", 2) + T(165, 130, "+", 28, 800) + frac(220, 120, "x", 3) + T(280, 130, "=", 28, 800)
           + frac(345, 120, "3x", 6) + T(405, 130, "+", 28, 800) + frac(465, 120, "2x", 6) + T(525, 130, "=", 28, 800) + frac(580, 120, "5x", 6, 26, TEAL_T)
           + T(320, 240, "same denominator first, then add the tops", 20, 800, TEAL_T) + T(320, 285, "the bottoms are never added", 18, 700, RED_T)),
         "With letters it is the same: a common denominator first, then add the numerators."),
    ], "Cover it. Write x/4 + x/6 as a single fraction. Why is 1/2 + 1/3 not 2/5?")

    card("surds", ["MC-066", "MC-067"], "Surds: take out the square, add only like surds", [
        (S("Find a square factor", T(320, 60, "squares: 4, 9, 16, 25, 36, …", 20, 700, INK2) + T(320, 120, "√12 = √(4 × 3)", 32, 800)
           + T(320, 175, "= √4 × √3 = 2√3", 32, 800, TEAL_T) + T(320, 250, "the square factor comes out as its root; the rest stays inside", 16, 700, INK2)),
         "Split the number into a square times what is left: the square comes out as its root."),
        (S("Like surds", T(320, 80, "2√3 + 5√3 = 7√3", 32, 800, TEAL_T) + T(320, 125, "just like 2a + 5a = 7a", 18, 700, INK2)
           + T(320, 200, "√2 + √3 ≠ √5", 32, 800, RED_T) + T(320, 245, "unlike surds stay apart, like a + b", 18, 700, INK2)),
         "Like surds add like like terms; different surds stay apart."),
        (S("Rationalise", frac(110, 130, 1, "√2") + T(170, 140, "×", 28, 800) + frac(230, 130, "√2", "√2", 26, TEAL_T) + T(290, 140, "=", 28, 800) + frac(350, 130, "√2", 2)
           + T(450, 120, "√2 × √2 = 2", 18, 800, INK, "start") + T(450, 150, "clears the root", 18, 700, INK2, "start")
           + T(320, 250, "√2/√2 is 1, so the value does not change", 20, 800, TEAL_T)),
         "To clear a root from the bottom, multiply by a fraction that equals 1."),
    ], "Cover it. Simplify √50 and √8 + √18. Rationalise 3/√3.")
