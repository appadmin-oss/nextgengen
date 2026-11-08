"""Business Division — 18-Month Tool-First Curriculum: one diagram where a picture carries the lesson's idea."""
from ba_kit import *   # noqa: F401,F403


def folder_icon(x, y):
    return rect(x, y - 15, 22, 15, GOLD, INK, 1.2, 2)


def file_icon(x, y):
    return rect(x + 3, y - 18, 16, 19, WHITE, INK, 1.2, 1)


def tree(x, y, items, step=32, indent=28):
    """items = [(depth, name, is_folder, note)] → svg, bottom."""
    b = ""
    for i, (d, name, folder, note) in enumerate(items):
        yy = y + i * step
        xx = x + d * indent
        if d: b += path(f"M{xx - 14} {yy - 26} V{yy - 8} H{xx - 3}", LINE, sw=1.5)
        b += folder_icon(xx, yy) if folder else file_icon(xx, yy)
        b += t(xx + 30, yy - 2, name, 16, 700 if folder else 500, INK)
        if note: b += t(W - 24, yy - 2, note, 16, 600, TEAL_D, "end")
    return b, y + (len(items) - 1) * step


def figures(add):
    # 0 · Drive folder system
    b, y = title("A business folder system: numbered, shallow, named to sort")
    tb, y = tree(28, y + 14, [(0, "Ada's Bakery", 1, ""), (1, "01 Admin", 1, "registration, policies"), (1, "02 Finance", 1, "budgets, receipts"),
                              (2, "2026", 1, "subfolder by year"), (3, "2026-03-14_invoice_Adebayo-Stores.pdf", 0, ""),
                              (1, "03 Customers", 1, ""), (1, "04 Marketing", 1, ""), (1, "05 Projects", 1, ""), (1, "99 Archive", 1, "finished work")])
    b += tb
    y += 26
    b += box(24, y, W - 48, 118, SOFT)
    b += t(40, y + 30, "2026-03-14 _ invoice _ Adebayo-Stores .pdf", 18, 700)
    for x, s in [(40, "date first: sorts in time order"), (40, "then what it is, with hyphens, no spaces"), (40, "the extension says the file type")]:
        pass
    b += t(40, y + 60, "Date first (YYYY-MM-DD) so files sort in time order;", 16, 500, INK2, bg=SOFT)
    b += t(40, y + 84, "then what it is; hyphens or underscores, no spaces;", 16, 500, INK2, bg=SOFT)
    b += t(40, y + 108, "versions at the end: _v2, _final.", 16, 500, INK2, bg=SOFT)
    alt = ("Numbered top-level folders (01 Admin, 02 Finance, 03 Customers, 04 Marketing, 05 Projects, 99 Archive), no more than three levels deep, "
           "and a file name that starts with the date: 2026-03-14_invoice_Adebayo-Stores.pdf.")
    add(0, "Google Drive", "folder-system", "three levels deep is plenty", alt, svg(y + 124, "A business folder system", alt, b))

    # 1 · Business introduction formatted with styles
    b, y = title("One page, formatted with styles — not bold-and-bigger")
    px, pw = 60, 300
    b += rect(px, y, pw, 330, WHITE, INK, 2)
    b += f'<rect x="{px + 28}" y="{y + 26}" width="{pw - 56}" height="252" fill="none" stroke="{TEAL}" stroke-width="1.5" stroke-dasharray="6 5"/>'
    rows = [(y + 52, 22, 800, "Ada's Kitchen", "Title"), (y + 92, 18, 700, "What we do", "Heading 1")]
    for yy, sz, wt, s, lab in rows:
        b += t(px + 40, yy, s, sz, wt)
    for k in range(4): b += rect(px + 40, y + 108 + k * 16, pw - 80 - (k == 3) * 60, 7, LINE, r=3)
    b += t(px + 40, y + 196, "Why choose us", 18, 700)
    for k in range(4): b += rect(px + 40, y + 212 + k * 16, pw - 80 - (k == 3) * 90, 7, LINE, r=3)
    b += t(px + 40, y + 316, "Ada's Kitchen · Ikeja", 16, 500, INK2)
    labs = [(y + 46, "Title style"), (y + 86, "Heading 1"), (y + 128, "Normal text, 11–12 pt,"), (y + 150, "line spacing 1.15"),
            (y + 190, "Heading 1 again"), (y + 270, "Margins at least 2 cm"), (y + 312, "Footer: business name")]
    for yy, s in labs:
        b += t(px + pw + 24, yy + 4, s, 16, 600, INK)
    alt = ("A one-page business introduction: the name in the Title style, sections in Heading 1, body in Normal text at 11–12 pt with 1.15 "
           "line spacing, margins of at least 2 cm, and the business name in the footer.")
    add(1, "business introduction", "doc-styles", "Use **styles**", alt, svg(y + 340, "A business introduction formatted with styles", alt, b))

    # 2 · Formal letter, block format
    b, y = title("A formal letter in block format: everything aligned left")
    parts = ["Letterhead: name, address, phone, email", "Date in full: 14 March 2026", "Recipient: name, title, organisation, address",
             "Ref: Venue booking, 28 March (optional)", "Dear Mrs Okafor,", "Subject line in bold", "Body: purpose · details · action and date",
             "Yours sincerely, signature, full name, title"]
    for i, s in enumerate(parts):
        yy = y + i * 46
        b += badge(40, yy + 14, i + 1)
        b += box(66, yy, W - 90, 34, GOLD_T if i in (0, 6) else SOFT, LINE, 6, False)
        b += t(80, yy + 23, s, 16, 700 if i == 5 else 500, INK, bg=GOLD_T if i in (0, 6) else SOFT)
    y += len(parts) * 46
    n, y = notes(y + 18, "“Yours sincerely” when you named the person; “Yours faithfully” after “Dear Sir/Madam”.")
    b += n
    alt = ("The eight parts of a block-format letter from top to bottom: letterhead, date, recipient, reference, salutation, bold subject line, body, "
           "and the close with signature, name and title.")
    add(2, "formal business letter", "letter-block", "Yours faithfully", alt, svg(y, "A formal business letter", alt, b))

    # 3 · Inventory register: formula filled down
    b, y = title("Stock value by formula, filled down — never typed")
    tb, y2 = table(24, y, ["", "A Product", "C Qty", "D Price ₦", "E Value ₦"],
                   [["2", "Rice 50kg", "12", "78,000", "=C2*D2"], ["3", "Beans 50kg", "8", "65,000", "=C3*D3"], ["4", "Oil 25L", "10", "42,000", "=C4*D4"],
                    ["17", "Total", "", "", "=SUM(E2:E16)"]],
                   [44, 170, 90, 128, 160], fills={(0, 4): GOLD_T, (1, 4): GOLD_T, (2, 4): GOLD_T, (3, 4): TEAL_T}, bold_rows=(3,))
    b += tb
    b += arrow(W - 50, y + 54, W - 50, y + 118, CORAL_D)
    n, y = notes(y2 + 30, "Type =C2*D2 once, then drag the fill handle down: each row's formula points at its own row. Freeze row 1 so the headers stay visible.")
    b += n
    alt = "An inventory register: stock value in column E is the formula =C2*D2, filled down so row 3 reads =C3*D3, with =SUM(E2:E16) as the total."
    add(3, "inventory register", "inventory-fill", "**fill handle**", alt, svg(y, "An inventory register with formulas", alt, b))

    # 4 · SUM AVERAGE MIN MAX on a week of sales
    b, y = title("Four functions, four questions about a column of sales")
    vals = [32, 28, 45, 0, 38, 90, 41]
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    x0, base, sc = 70, y + 230, 2.2
    avg = sum(vals) / len(vals)
    b += line(x0 - 10, base, W - 200, base, INK2, 2)
    for i, v in enumerate(vals):
        bx = x0 + i * 52
        b += rect(bx, base - v * sc, 36, v * sc, CORAL if v in (0, 90) else TEAL, INK, 1)
        b += t(bx + 18, base + 22, days[i], 16, 600, INK, "middle")
        b += t(bx + 18, base + 44, f"{v}", 16, 700, INK, "middle")
    b += line(x0 - 10, base - avg * sc, x0 + 7 * 52, base - avg * sc, CORAL_D, 2, "6 4")
    rows = [("=SUM", "₦274k", "the total"), ("=AVERAGE", "₦39k", "a typical day?"), ("=MIN", "₦0", "the worst day"), ("=MAX", "₦90k", "the best day")]
    for i, (f, v, q) in enumerate(rows):
        yy = y + 14 + i * 58
        b += box(W - 186, yy, 162, 50, GOLD_T if i == 1 else SOFT, LINE, 6, False)
        b += t(W - 176, yy + 22, f"{f} {v}", 16, 700, INK, bg=GOLD_T if i == 1 else SOFT)
        b += t(W - 176, yy + 42, q, 16, 500, INK2, bg=GOLD_T if i == 1 else SOFT)
    b += t(x0, y + 4, "Daily sales, ₦ thousands", 16, 700, INK)
    n, y = notes(base + 78, "The dashed line is the average (₦39k). One big Saturday pulls it up; =MEDIAN(...) gives a better “typical day”. A zero is a fact; a blank is a missing record.")
    b += n
    alt = ("A week of sales in ₦ thousands (32, 28, 45, 0, 38, 90, 41): SUM ₦274k, AVERAGE ₦39k, MIN ₦0 on the closed day, MAX ₦90k on Saturday. "
           "One big day pulls the average up, so the median is often a better typical day.")
    add(4, "SUM, AVERAGE", "sum-average-min-max", "**The average can mislead**", alt, svg(y, "SUM, AVERAGE, MIN and MAX", alt, b))

    # 5 · Running balance
    b, y = title("A running balance: each row starts from the row above")
    tb, y2 = table(24, y, ["", "Description", "In ₦", "Out ₦", "Balance ₦"],
                   [["2", "Opening balance", "", "", "20,000"], ["3", "Sold 12 lunch packs", "18,000", "", "38,000"],
                    ["4", "Bought 2 crates of eggs", "", "9,000", "29,000"], ["5", "Transport", "", "2,500", "26,500"]],
                   [40, 244, 96, 90, 122], fills={(1, 4): GOLD_T, (2, 4): GOLD_T, (3, 4): GOLD_T}, align=["middle", "start", "end", "end", "end"])
    b += tb
    n, y = notes(y2 + 30, "In F3: =F2+D3-E3, then fill down. Money in and money out stay in separate columns, never one column of minus signs.")
    b += n
    alt = "A tracker whose balance column uses =F2+D3-E3: opening ₦20,000, plus ₦18,000 sales is ₦38,000, minus ₦9,000 eggs is ₦29,000, minus ₦2,500 transport is ₦26,500."
    add(5, "income and expenditure", "running-balance", "**Running balance**", alt, svg(y, "A running balance", alt, b))

    # 6 · Question types
    b, y = title("Pick the question type from the answer you need")
    rows = [("One answer from a short list", "Multiple choice"), ("Several answers allowed", "Checkboxes"), ("A rating, 1 to 5", "Linear scale"),
            ("One answer from a long list", "Dropdown"), ("Their own words (use sparingly)", "Short answer")]
    for i, (q, c) in enumerate(rows):
        yy = y + i * 54
        b += box(24, yy, 360, 44, SOFT, LINE, 8, False) + t(38, yy + 28, q, 16, 600, INK, bg=SOFT)
        b += arrow(388, yy + 22, 414, yy + 22)
        b += box(420, yy, 196, 44, GOLD_T, INK, 8, False) + t(518, yy + 28, c, 16, 700, INK, "middle", GOLD_T)
    n, y = notes(y + 5 * 54 + 24, "Under 10 questions, under 3 minutes. One thing per question, neutral wording, and an “Other” or “Not sure” option.")
    b += n
    alt = "Multiple choice for one answer from a short list, checkboxes for several, a linear scale for a 1–5 rating, a dropdown for a long list, short answer for open comments."
    add(6, "customer survey", "question-types", "Choose the right question type", alt, svg(y, "Choosing a question type", alt, b))

    # 7 · Filter hides, does not delete
    b, y = title("A filter hides rows; it does not delete them")
    hdr = ["Name", "Area", "Rating", "Visits"]
    rws = [["Bisi", "Yaba", "5", "Weekly"], ["Emeka", "Ikeja", "2", "Monthly"], ["Halima", "Yaba", "4", "Weekly"], ["Tunde", "Surulere", "3", "Rarely"], ["Ify", "Yaba", "1", "Monthly"]]
    fills = {}
    for r, row in enumerate(rws):
        for c in range(4):
            fills[(r, c)] = GOLD_T if row[1] == "Yaba" else SOFT
    tb, y2 = table(24, y, hdr, rws, [150, 150, 130, 162], fills=fills)
    b += tb
    for r, row in enumerate(rws):
        if row[1] != "Yaba":
            yy = y + 34 * (r + 1) + 17
            b += line(30, yy, W - 30, yy, INK2, 1.5)
    b += t(24, y2 + 28, "Filter: Area = Yaba → 3 of 5 rows shown; the others are hidden.", 16, 700)
    n, y = notes(y2 + 60, "Count with =COUNTIF(C:C,\"Weekly\") and report the base: 2 of 3 Yaba customers is not the same as 80 of 120.")
    b += n
    alt = "A response table filtered to Area = Yaba: three of five rows stay visible and the other two are hidden, not deleted. Always report how many people answered."
    add(7, "Sort, filter", "filter-hides", "**Filter**", alt, svg(y, "Filtering survey responses", alt, b))

    # 8 · Five-slide structure
    b, y = title("Five slides, one idea each, headline states the point")
    sl = [("1 Title", "Name, one line, you"), ("2 Problem", "Who has it + one number"), ("3 Solution", "What you offer + photo"),
          ("4 Evidence", "One clear chart"), ("5 The ask", "What you want + contact")]
    for i, (h, s) in enumerate(sl):
        col, row = i % 3, i // 3
        x = 24 + col * 200 + (100 if row else 0)
        yy = y + row * 150
        b += box(x, yy, 184, 118, GOLD_T if i == 4 else SOFT, INK if i == 4 else LINE, 6)
        b += t(x + 12, yy + 30, h, 18, 800, INK, bg=GOLD_T if i == 4 else SOFT)
        p, _ = para(x + 12, yy + 58, 160, s, 16, 500, INK2, bg=GOLD_T if i == 4 else SOFT)
        b += p
    n, y = notes(y + 300, "Text at least 24 pt on the slide, high contrast, real images. The slide supports what you say; it is not your script.")
    b += n
    alt = "Five slides in order: title; the problem with one real number; the solution with a photo; evidence as one clear chart; the ask with contact details."
    add(8, "five-slide", "five-slides", "A five-slide structure that works", alt, svg(y, "A five-slide presentation", alt, b))

    # 9 · Plan backwards from the deadline
    b, y = title("Plan backwards from the event date")
    pts = [(0, "3 Mar", "Budget approved"), (1, "7 Mar", "Venue confirmed"), (2, "14 Mar", "Invitations sent"), (3, "28 Mar", "Event")]
    xs = [60, 220, 380, 560]
    ly = y + 60
    b += line(40, ly, W - 30, ly, INK2, 3)
    for (i, d, s), x in zip(pts, xs):
        b += circle(x, ly, 11, GOLD if i == 3 else WHITE, INK, 2)
        b += t(x, ly - 24, d, 16, 800, INK, "middle")
        p, _ = para(x, ly + 36, 140, s, 16, 600, INK2, "middle")
        b += p
    b += arrow(540, ly + 96, 80, ly + 96, CORAL_D)
    b += t(310, ly + 122, "work out each date from the one after it", 16, 700, CORAL_D, "middle")
    n, y = notes(ly + 164, "Each date becomes a calendar entry with its owner: all-day events for deadlines, reminders a few days before, 30 minutes before meetings.")
    b += n
    alt = "A timeline worked backwards from the 28 March event: invitations by 14 March, venue confirmed by 7 March, budget approved by 3 March."
    add(9, "Google Calendar", "plan-backwards", "**Plan backwards from the deadline.**", alt, svg(y, "Planning backwards from a deadline", alt, b))

    # 10 · Sharing access levels
    b, y = title("Give the least access needed")
    lv = [("Viewer", "reads only", 1), ("Commenter", "reads, comments, suggests", 2), ("Editor", "changes everything, can share further", 3)]
    for i, (h, s, n) in enumerate(lv):
        x = 24 + i * 202
        hh = 70 + n * 34
        b += rect(x, y + 150 - hh + 34, 186, hh, [TEAL_T, GOLD_T, CORAL_T][i], LINE, 1.25, 8)
        b += t(x + 14, y + 150 - hh + 64, h, 18, 800, INK, bg=[TEAL_T, GOLD_T, CORAL_T][i])
        p, _ = para(x + 14, y + 150 - hh + 92, 160, s, 16, 500, INK2, bg=[TEAL_T, GOLD_T, CORAL_T][i])
        b += p
    n, y = notes(y + 220, "Share with named people, not “anyone with the link”, for anything internal. A shared folder passes its permissions to everything inside.")
    b += n
    alt = "Three access levels, each wider than the last: Viewer reads only; Commenter reads, comments and suggests; Editor changes everything and can share further."
    add(10, "Collaborate", "access-levels", "Give the **least access needed**", alt, svg(y, "Sharing access levels", alt, b))

    # 12 · Relative vs absolute references
    b, y = title("Copy a formula down: relative moves, $absolute stays")
    tb, y2 = table(24, y, ["", "B Price", "C Qty", "D Total"],
                   [["2", "500", "4", "=B2*C2"], ["3", "800", "2", "=B3*C3"], ["4", "300", "6", "=B4*C4"]], [40, 100, 90, 120],
                   fills={(1, 3): GOLD_T, (2, 3): GOLD_T}, align=["middle", "end", "end", "start"])
    b += tb
    tb, _ = table(394, y, ["", "E with VAT"], [["2", "=D2*$F$1"], ["3", "=D3*$F$1"], ["4", "=D4*$F$1"]], [40, 182],
                  fills={(1, 1): GOLD_T, (2, 1): GOLD_T}, align=["middle", "start"])
    b += tb
    b += box(394, y2 + 18, 222, 44, TEAL_T, INK, 6, False) + t(406, y2 + 46, "F1 = 1.075 (VAT rate)", 16, 700, INK, bg=TEAL_T)
    p, y3 = para(24, y2 + 34, 350, "Relative: B2 becomes B3, B4 as it is copied down.", 16, 600)
    b += p
    p, y3 = para(24, y3 + 32, 350, "Absolute: $F$1 is locked, so every row uses the one VAT cell. Press F4 to add the $ signs.", 16, 600)
    b += p
    alt = "Copied down, =B2*C2 becomes =B3*C3 and =B4*C4 (relative), while =D2*$F$1 keeps pointing at the VAT rate in F1 (absolute)."
    add(12, "cell references", "absolute-reference", "**Mixed references**", alt, svg(y3 + 12, "Relative and absolute references", alt, b))

    # 13 · Profit waterfall
    b, y = title("From sales to net profit: ₦600,000 becomes ₦60,000")
    steps = [("Sales", 600, 0, TEAL), ("Cost of sales", 360, 240, CORAL), ("Gross profit", 240, 0, GOLD), ("Expenses", 180, 60, CORAL), ("Net profit", 60, 0, GREEN)]
    base, sc, bw = y + 300, 0.45, 92
    for i, (lab, v, off, c) in enumerate(steps):
        x = 40 + i * 116
        b += rect(x, base - (off + v) * sc, bw, v * sc, c, INK, 1)
        b += t(x + bw / 2, base - (off + v) * sc - 10, f"₦{v}k", 16, 800, INK, "middle")
        p, _ = para(x + bw / 2, base + 24, 108, lab, 16, 700, INK, "middle")
        b += p
        if i < 4:
            yy = base - (off + v) * sc if i in (0, 2) else base - off * sc
            b += line(x + bw, yy, x + 116, yy, INK2, 1.2, "4 3")
    b += line(30, base, W - 24, base, INK2, 2)
    b += t(40 + 2 * 116 + bw / 2, base - 240 * sc + 30, "40%", 16, 800, INK, "middle", GOLD)
    n, y = notes(base + 76, "Gross margin = 240 ÷ 600 = 40%: the product makes money. Net margin = 60 ÷ 600 = 10%: what the whole business keeps after overheads.")
    b += n
    alt = "Sales ₦600,000 minus cost of sales ₦360,000 leaves gross profit ₦240,000 (40%); minus expenses ₦180,000 leaves net profit ₦60,000 (10%)."
    add(13, "gross profit and net profit", "profit-waterfall", "sales ₦600,000; cost of sales", alt, svg(y, "Gross and net profit", alt, b))

    # 14 · IF and SUMIF
    b, y = title("IF makes a decision; SUMIF adds only the rows that match")
    b += f'<polygon points="140,{y + 10} 250,{y + 52} 140,{y + 94} 30,{y + 52}" fill="{GOLD_T}" stroke="{INK}" stroke-width="1.5"/>'
    b += t(140, y + 48, "Paid C2", 16, 700, INK, "middle", GOLD_T) + t(140, y + 68, "≥ due D2?", 16, 700, INK, "middle", GOLD_T)
    b += arrow(250, y + 52, 300, y + 30) + arrow(250, y + 52, 300, y + 80)
    b += box(304, y + 10, 120, 36, GREEN_T, LINE, 6, False) + t(364, y + 34, "“Paid”", 16, 700, INK, "middle", GREEN_T)
    b += box(304, y + 62, 120, 36, CORAL_T, LINE, 6, False) + t(364, y + 86, "“Owing”", 16, 700, INK, "middle", CORAL_T)
    b += t(440, y + 34, "yes", 16, 600, INK2) + t(440, y + 86, "no", 16, 600, INK2)
    y += 120
    b += t(24, y + 10, "=IF(C2>=D2, \"Paid\", \"Owing\")", 16, 700, TEAL_D)
    y += 34
    rws = [["Fuel", "Transport", "6,000"], ["Eggs", "Stock", "9,000"], ["Bus fare", "Transport", "1,500"], ["Rent", "Rent", "50,000"], ["Bike hire", "Transport", "2,500"]]
    fl = {(r, c): GOLD_T for r in (0, 2, 4) for c in range(3)}
    tb, y2 = table(24, y, ["A Item", "C Category", "E Amount ₦"], rws, [190, 200, 202], fills=fl, align=["start", "start", "end"])
    b += tb
    n, y = notes(y2 + 30, "=SUMIF(C:C, \"Transport\", E:E) checks column C and adds column E where it matches: 6,000 + 1,500 + 2,500 = ₦10,000.")
    b += n
    alt = "IF tests paid against due and returns Paid or Owing. SUMIF(C:C,\"Transport\",E:E) adds only the three Transport rows: 6,000 + 1,500 + 2,500 = ₦10,000."
    add(14, "IF, COUNTIF", "if-sumif", "`=SUMIF(F:F, \"Owing\", D:D)`", alt, svg(y, "IF and SUMIF", alt, b))

    # 15 · Budget vs actual
    b, y = title("Budget against actual, coloured by % used")
    rows = [("Rent", 50, 50, 100), ("Stock", 120, 102, 85), ("Transport", 20, 27, 135), ("Data", 10, 6, 60)]
    for i, (c, bud, act, pc) in enumerate(rows):
        yy = y + 10 + i * 66
        col = CORAL if pc > 100 else (GOLD if pc >= 80 else GREEN_T)
        b += t(24, yy + 22, c, 16, 700)
        b += rect(130, yy + 4, bud * 2.6, 22, SOFT, INK2, 1)
        b += rect(130, yy + 30, act * 2.6, 22, col, INK, 1)
        b += t(130 + max(bud, act) * 2.6 + 10, yy + 24, f"budget ₦{bud}k", 16, 500, INK2)
        b += t(130 + max(bud, act) * 2.6 + 10, yy + 48, f"actual ₦{act}k · {pc}%", 16, 700, INK)
    y += 10 + 4 * 66
    lg = [(GREEN_T, "under 80%"), (GOLD, "80% or more"), (CORAL, "over 100%")]
    for i, (c, s) in enumerate(lg):
        b += rect(24 + i * 200, y + 6, 22, 22, c, INK, 1) + t(54 + i * 200, y + 23, s, 16, 600)
    n, y = notes(y + 62, "Actual comes from the expense tab with SUMIF by category, so the category names must match exactly. Transport is ₦7k over: say why, and adjust.")
    b += n
    alt = "Rent ₦50k of ₦50k (100%), stock ₦102k of ₦120k (85%), transport ₦27k of ₦20k (135%, overspent, red), data ₦6k of ₦10k (60%)."
    add(15, "monthly budget", "budget-actual", "**% used**", alt, svg(y, "Budget against actual", alt, b))

    # 16 · Reorder level
    b, y = title("When stock falls to the reorder level, order")
    x0, x1, top, bot = 70, W - 30, y + 20, y + 260
    sc = (bot - top) / 100
    b += line(x0, bot, x1, bot, INK2, 2) + line(x0, top, x0, bot, INK2, 2)
    for v in (0, 40, 100): b += t(x0 - 10, bot - v * sc + 6, str(v), 16, 600, INK2, "end")
    xs = lambda dd: x0 + dd * (x1 - x0) / 16
    pts_ = [(0, 100), (9, 10), (9, 100), (16, 30)]
    b += path("M" + " L".join(f"{xs(a):.1f} {bot - v * sc:.1f}" for a, v in pts_), TEAL_D, sw=3)
    b += line(x0, bot - 40 * sc, x1, bot - 40 * sc, CORAL_D, 2, "7 5") + t(xs(13.2), bot - 40 * sc - 8, "reorder level 40", 16, 700, CORAL_D, "end")
    b += rect(x0, bot - 10 * sc, x1 - x0, 10 * sc, GOLD_T) + t(x1 - 6, bot - 14, "safety stock 10", 16, 600, INK, "end", GOLD_T)
    b += line(xs(6), bot - 40 * sc, xs(6), bot + 6, INK2, 1.5, "3 3") + line(xs(9), bot - 100 * sc, xs(9), bot + 6, INK2, 1.5, "3 3")
    b += t(xs(6), bot + 24, "order", 16, 700, INK, "middle") + t(xs(9), bot + 24, "arrives", 16, 700, INK, "middle")
    b += t((xs(6) + xs(9)) / 2, bot + 48, "lead time 3 days", 16, 600, INK2, "middle")
    n, y = notes(bot + 84, "Reorder level = daily usage × lead time + safety stock = 10 × 3 + 10 = 40. Status: =IF(E2<=F2, \"REORDER\", \"OK\").")
    b += n
    alt = ("Stock falls by 10 a day from 100. At the reorder level of 40 an order goes in; it arrives 3 days later as stock reaches the safety stock of 10. "
           "Reorder level = 10 × 3 + 10 = 40.")
    add(16, "stock-reorder", "reorder-level", "When stock falls to 40, order", alt, svg(y, "Reorder level", alt, b))

    # 17 · Bank reconciliation
    b, y = title("Reconciling: tick what is in both, explain what is left")
    cw = 284
    for k, (h, items) in enumerate((("Your cashbook", [("✓", "Sales deposit ₦45,000"), ("✓", "Rent paid ₦50,000"), ("·", "Transfer to supplier ₦12,000")]),
                                     ("Bank statement", [("✓", "Sales deposit ₦45,000"), ("✓", "Rent paid ₦50,000"), ("·", "SMS alerts ₦480"), ("·", "POS fee ₦1,200")]))):
        x = 24 + k * (cw + 24)
        b += box(x, y, cw, 230, SOFT)
        b += t(x + 14, y + 30, h, 18, 800, INK, bg=SOFT)
        for i, (m, s) in enumerate(items):
            f = GREEN_T if m == "✓" else GOLD_T
            b += rect(x + 12, y + 48 + i * 42, cw - 24, 34, f, LINE, 1, 5)
            b += t(x + 24, y + 71 + i * 42, ("✓ " if m == "✓" else "") + s, 16, 600, INK, bg=f)
    y += 248
    p, y = para(24, y + 10, W - 48, "Left in the bank only (SMS alerts, POS fee): add them to your cashbook.", 16, 600)
    b += p
    p, y = para(24, y + 26, W - 48, "Left in your book only (the transfer not yet cleared): a timing difference that should appear soon.", 16, 600)
    b += p
    alt = ("Items in both the cashbook and the bank statement are ticked off. Bank-only items such as SMS alerts and a POS fee are added to the cashbook; "
           "a book-only transfer not yet cleared is a timing difference.")
    add(17, "cashbook", "bank-reconciliation", "**Reconciling with the bank statement:**", alt, svg(y + 12, "Bank reconciliation", alt, b))

    # 18 · Chart by question
    b, y = title("Choose the chart by the question you are asking")
    rows = [("How does it change over time?", "Line"), ("How do categories compare?", "Bar, sorted"), ("Parts of one whole (2–5 parts)?", "Pie"),
            ("Are two numbers related?", "Scatter")]
    for i, (q, c) in enumerate(rows):
        yy = y + i * 70
        b += box(24, yy, 330, 56, SOFT, LINE, 8, False) + t(38, yy + 34, q, 16, 600, INK, bg=SOFT)
        b += arrow(358, yy + 28, 384, yy + 28)
        b += box(390, yy, 226, 56, GOLD_T, INK, 8, False) + t(470, yy + 34, c, 16, 800, INK, bg=GOLD_T)
        gx, gy = 404, yy + 8
        if i == 0: b += path(f"M{gx} {gy + 36} L{gx + 14} {gy + 26} L{gx + 28} {gy + 30} L{gx + 50} {gy + 6}", INK, sw=2.5)
        if i == 1:
            for k, hh in enumerate((36, 26, 16)): b += rect(gx, gy + k * 13, hh + 14, 9, TEAL, INK, 1)
        if i == 2: b += circle(gx + 22, gy + 20, 18, TEAL, INK) + path(f"M{gx + 22} {gy + 20} L{gx + 22} {gy + 2} A18 18 0 0 1 {gx + 39} {gy + 26} Z", INK, GOLD, 1)
        if i == 3:
            for px, py in ((4, 34), (14, 28), (22, 24), (30, 16), (40, 12), (48, 4)): b += circle(gx + px, gy + py, 3.5, INK)
    n, y = notes(y + 4 * 70 + 24, "Title the finding (“Sales doubled after we added delivery”), label axes with units, start bars at zero, highlight one series.")
    b += n
    alt = "Line chart for change over time, bar chart sorted largest first to compare categories, pie only for 2–5 parts of one whole, scatter to see whether two numbers are related."
    add(18, "Create charts", "chart-by-question", "**Match chart to question:**", alt, svg(y, "Choosing a chart", alt, b))

    # 19 · KPI dashboard structure
    b, y = title("Three tabs: data in, formulas in the middle, dashboard out")
    b2, y2 = chain_h("", [("Data tabs", "raw attendance and payments; never edited by the dashboard"), ("Calculation tab", "COUNTIF, SUMIF, percentages"),
                          ("Dashboard tab", "big numbers, charts and status colours")], y=y)
    b += b2
    y = y2 + 14
    tiles = [("Attendance", "78%", "target ≥ 75%", GREEN_T), ("Dues collected", "71%", "target ≥ 80%", GOLD_T), ("New this month", "4", "target ≥ 10", CORAL_T)]
    for i, (h, v, tg, f) in enumerate(tiles):
        x = 24 + i * 202
        b += box(x, y, 186, 120, f, LINE)
        b += t(x + 14, y + 28, h, 16, 700, INK, bg=f) + t(x + 14, y + 72, v, 34, 800, INK, bg=f) + t(x + 14, y + 104, tg, 16, 600, INK2, bg=f)
    n, y = notes(y + 150, "Each KPI has a target, so the number means something: green on target, amber close, red off. Protect the calculation and dashboard tabs.")
    b += n
    alt = ("Data tabs feed a calculation tab, which feeds the dashboard. Tiles show each KPI with its target and a status colour: attendance 78% (on target), "
           "dues 71% (close), new members 4 of 10 (off).")
    add(19, "KPI dashboard", "kpi-dashboard", "**Structure the file:**", alt, svg(y, "A KPI dashboard", alt, b))

    # 20 · Dimension vs metric
    b, y = title("Dimension: what you group by. Metric: what you count or add.")
    tb, y2 = table(24, y, ["Centre", "Month", "Sales ₦"], [["Egbeda", "March", "42,000"], ["Ikeja", "March", "65,000"], ["Egbeda", "April", "51,000"]],
                   [200, 180, 212], fills={(r, c): TEAL_T for r in range(3) for c in (0, 1)} | {(r, 2): GOLD_T for r in range(3)}, align=["start", "start", "end"])
    b += tb
    b += rect(24, y2 + 14, 22, 22, TEAL_T, INK, 1) + t(56, y2 + 31, "Dimensions: categories and dates", 16, 600)
    b += rect(24, y2 + 46, 22, 22, GOLD_T, INK, 1) + t(56, y2 + 63, "Metric: a number that gets summed, counted or averaged", 16, 600)
    n, y = notes(y2 + 108, "“Sum of sales by centre” = metric (sales) grouped by a dimension (centre). Add a date range control and a centre filter so readers explore.")
    b += n
    alt = "In a table of Centre, Month and Sales, Centre and Month are dimensions (what you group by) and Sales is the metric (what is summed or counted)."
    add(20, "Looker Studio", "dimension-metric", "**Dimension vs metric**", alt, svg(y, "Dimension and metric", alt, b))

    # 21 · Invoice to bank
    b, y = steps_v("A sale in accounting software: invoice, then receipt", [
        ("Sales invoice", "Bill to the customer: who, what, price, due date."),
        ("Accounts receivable", "Unpaid invoice = money owed to you."),
        ("Receipt", "Money in, linked to the invoice it pays."),
        ("Bank account", "Balance updates; Aged Receivables shows who still owes.")], hl=[3])
    alt = "A sales invoice creates accounts receivable (money owed to you); a receipt linked to that invoice moves it into the bank account, and Aged Receivables shows who still owes."
    add(21, "Manager.io", "invoice-receipt", "**Core ideas of bookkeeping**", alt, svg(y, "From invoice to bank", alt, b))

    # 22 · Break-even chart
    b, y = title("Break-even is where revenue meets total cost")
    x0, x1, top, bot = 84, W - 36, y + 10, y + 270
    q2x = lambda q: x0 + q / 400 * (x1 - x0)
    v2y = lambda v: bot - v / 200000 * (bot - top)
    b += line(x0, bot, x1, bot, INK2, 2) + line(x0, top, x0, bot, INK2, 2)
    for v in (0, 100000, 200000): b += t(x0 - 8, v2y(v) + 6, f"₦{v // 1000}k" if v else "₦0", 16, 600, INK2, "end")
    for q in (0, 200, 400): b += t(q2x(q), bot + 24, str(q), 16, 600, INK2, "middle")
    b += f'<polygon points="{q2x(0)},{v2y(60000)} {q2x(200)},{v2y(100000)} {q2x(0)},{v2y(0)}" fill="{CORAL_T}"/>'
    b += f'<polygon points="{q2x(200)},{v2y(100000)} {q2x(400)},{v2y(200000)} {q2x(400)},{v2y(140000)}" fill="{GREEN_T}"/>'
    b += line(q2x(0), v2y(0), q2x(400), v2y(200000), TEAL_D, 3) + line(q2x(0), v2y(60000), q2x(400), v2y(140000), CORAL_D, 3)
    b += line(q2x(0), v2y(60000), q2x(400), v2y(60000), INK2, 1.5, "5 4")
    b += circle(q2x(200), v2y(100000), 7, GOLD, INK, 2)
    b += t(q2x(200) + 12, v2y(100000) + 26, "200 units", 16, 800, INK)
    b += t(q2x(300), v2y(150000) - 34, "Revenue", 16, 700, TEAL_D, "middle") + t(q2x(370), v2y(140000) + 34, "Total cost", 16, 700, CORAL_D, "middle")
    b += t(q2x(400), v2y(60000) + 24, "Fixed costs ₦60k", 16, 600, INK2, "end")
    b += t((x0 + x1) / 2, bot + 48, "Units sold a month", 16, 700, INK, "middle")
    n, y = notes(bot + 84, "Price ₦500, variable cost ₦200: contribution ₦300. =ROUNDUP(60000/(500-200),0) = 200 units. Left of it is loss, right of it profit.")
    b += n
    alt = "Revenue (₦500 a unit) and total cost (₦60,000 fixed plus ₦200 a unit) cross at 200 units: below that is loss, above it profit."
    add(22, "break-even", "break-even-chart", "where the lines cross", alt, svg(y, "Break-even chart", alt, b))

    # 24 · Needs assessment form flow
    b, y = steps_v("The shape of a needs-assessment form", [
        ("Introduction", "Who you are, why you ask, how long, how answers are used."),
        ("Screening question", "Confirms they are in your target group; if not, thank them and end."),
        ("Behaviour questions", "“In the last month, how many times did you…?”"),
        ("Rating scales", "How serious is each problem?"),
        ("One or two open questions", "“What is the hardest part of…?”")], note="Under 10 questions, no personal data you do not need — and talk to at least five people in person as well.")
    alt = "A needs-assessment form in order: introduction, a screening question, behaviour questions, rating scales, then one or two open questions."
    add(24, "needs assessment", "needs-form", "**Designing the form (Google Forms):**", alt, svg(y, "Needs-assessment form", alt, b))

    # 25 · Coding qualitative answers
    b, y = title("Coding open answers: read, tag with themes, count")
    ans = ["“Lessons cost too much for us”", "“No one at home can help with maths”", "“The fees and the bus fare”", "“I can't get there after school”"]
    for i, a in enumerate(ans):
        b += box(24, y + i * 52, 340, 42, SOFT, LINE, 6, False) + t(36, y + i * 52 + 27, a, 16, 500, INK, bg=SOFT)
    th = [("cost", [0, 2], GOLD_T), ("no one to ask", [1], TEAL_T), ("transport", [2, 3], CORAL_T)]
    for k, (name, links, f) in enumerate(th):
        yy = y + 10 + k * 66
        b += box(420, yy, 196, 48, f, INK, 8, False) + t(434, yy + 30, f"{name}: {len(links)}", 16, 800, INK, bg=f)
        for li in links: b += line(366, y + li * 52 + 21, 418, yy + 24, INK2, 1.5)
    n, y = notes(y + 4 * 52 + 30, "One answer can carry two themes. Report the count and the base (“cost: 23 of 40, 58%”) and keep a quote that says it in people's own words.")
    b += n
    alt = "Open answers are tagged with themes — cost, no one to ask, transport — and the themes are counted; one answer can carry two themes."
    add(25, "Analyse customer responses", "coding-themes", "code them:", alt, svg(y, "Coding open answers", alt, b))

    # 26 · Hypotheses verified
    b, y = title("An AI can draft hypotheses; only evidence can sort them")
    b2, y2 = chain_h("", [("Hypothesis", "with a number in it"), ("What would prove it wrong?", None), ("Look for that evidence", "your survey, interviews, prices")], y=y)
    b += b2
    y = y2 + 6
    for i, (h, f) in enumerate([("Supported", GREEN_T), ("Contradicted", CORAL_T), ("Untested", GOLD_T)]):
        b += box(24 + i * 202, y, 186, 48, f, LINE, 8, False) + t(117 + i * 202, y + 30, h, 16, 800, INK, "middle", f)
    n, y = notes(y + 80, "Test the riskiest first: the one that would kill the business if it were wrong. Treat every statistic the assistant gives as unverified.")
    b += n
    alt = "Each hypothesis is checked by asking what would prove it wrong and looking for that evidence, then marked Supported, Contradicted or Untested; the riskiest are tested first."
    add(26, "ChatGPT: Generate business hypotheses", "hypothesis-evidence", "**Then verify each hypothesis against evidence", alt, svg(y, "Verifying hypotheses", alt, b))

    # 27 · Positioning map
    b, y = title("A positioning map: where competitors cluster, where the gap is")
    cx, cy, R = W / 2, y + 160, 150
    b += line(cx - 260, cy, cx + 260, cy, INK2, 2) + line(cx, cy - R, cx, cy + R, INK2, 2)
    b += t(cx + 260, cy - 10, "higher price", 16, 600, INK2, "end") + t(cx - 260, cy - 10, "lower price", 16, 600, INK2)
    b += t(cx + 8, cy - R + 14, "higher quality", 16, 600, INK2) + t(cx + 8, cy + R - 4, "lower quality", 16, 600, INK2)
    comp = [(-170, 80, "Free YouTube"), (-90, 112, "Uncle helps"), (140, -96, "Private tutor"), (190, -40, "Big centre")]
    for dx, dy, s in comp:
        b += circle(cx + dx, cy + dy, 9, TEAL, INK)
        b += t(cx + dx + (14 if dx < 150 else -14), cy + dy - 12, s, 16, 600, INK, "start" if dx < 150 else "end")
    b += f'<ellipse cx="{cx - 130}" cy="{cy - 80}" rx="96" ry="46" fill="{GOLD_T}" stroke="{INK}" stroke-dasharray="6 4"/>'
    b += t(cx - 130, cy - 84, "the gap:", 16, 800, INK, "middle", GOLD_T) + t(cx - 130, cy - 62, "good and cheaper", 16, 700, INK, "middle", GOLD_T)
    n, y = notes(cy + R + 32, "Plot each competitor from real data (visit, call, read reviews), then your own offer, honestly. Pick one or two ways to be different.")
    b += n
    alt = "Competitors plotted by price and quality: free videos and family help are cheap and lower quality, a private tutor and a big centre dear and high quality; the empty corner — good and cheaper — is the gap."
    add(27, "Compare competitors", "positioning-map", "A **positioning map**", alt, svg(y, "Positioning map", alt, b))

    # 28 · Brand sheet
    b, y = title("A one-page brand sheet keeps everyone consistent")
    b += box(24, y, W - 48, 300, WHITE, INK)
    b += circle(90, y + 70, 40, "#1b5e20") + t(150, y + 62, "Logo", 18, 800) + t(150, y + 86, "simple; works small, in one colour", 16, 500, INK2)
    sw = [("#1b5e20", "Main #1B5E20"), (GOLD, "Accent #F5B026"), (INK, "Text #16233F"), ("#ffffff", "Ground #FFFFFF")]
    for i, (c, s) in enumerate(sw):
        x = 44 + i * 142
        b += rect(x, y + 128, 120, 44, c, INK, 1, 4) + t(x, y + 196, s, 16, 600, INK)
    b += t(44, y + 236, "Fonts: one for headings, one for body", 16, 700)
    b += t(44, y + 264, "Voice: friendly · clear · local", 16, 700)
    b += t(44, y + 288, "Text on ground at least 4.5:1", 16, 600, INK2)
    alt = "A brand sheet: the logo, a palette with hex codes (main #1B5E20, accent #F5B026, text #16233F, white ground), one heading and one body font, three voice words, and a 4.5:1 contrast rule."
    add(28, "brand identity", "brand-sheet", "**A simple brand sheet**", alt, svg(y + 310, "A brand sheet", alt, b))

    # 29 · Business Model Canvas
    b = bmc_body("The Business Model Canvas: nine blocks on one page", [
        "Key partners", "Key activities", "Key resources", "Value propositions", "Customer relationships", "Channels", "Customer segments", "Cost structure", "Revenue streams"])
    bb, y = b
    alt = ("The nine blocks of the Business Model Canvas: key partners, activities and resources on the left; value propositions in the centre; "
           "relationships, channels and customer segments on the right; cost structure and revenue streams along the bottom.")
    add(29, "Business Model Canvas", "bmc", "**The nine blocks:**", alt, svg(y, "Business Model Canvas", alt, bb))

    # 31 · Scenarios cumulative profit
    b, y = title("Three scenarios: when does cumulative profit turn positive?")
    x0, x1, top, bot = 84, W - 30, y + 10, y + 260
    zero = top + (bot - top) * 0.55
    b += line(x0, top, x0, bot, INK2, 2) + line(x0, zero, x1, zero, INK2, 2)
    b += t(x0 - 8, zero + 6, "₦0", 16, 600, INK2, "end")
    b += t(x0 - 8, bot, "start-up", 16, 600, INK2, "end")
    sc = [("Optimistic", 6, GREEN), ("Expected", 9, TEAL_D), ("Pessimistic", 99, CORAL_D)]
    for name, cross, c in sc:
        m = lambda k: x0 + k / 12 * (x1 - x0)
        start = bot - 10
        slope = (zero - start) / cross if cross < 99 else (zero - start) / 20
        end = start + slope * 12
        b += line(m(0), start, m(12), end, c, 3)
        b += t(m(12) - 4, end - 10, name, 16, 700, c, "end")
        if cross < 99: b += circle(m(cross), zero, 6, GOLD, INK)
    for k, an in ((0, "start"), (6, "middle"), (12, "end")): b += t(x0 + k / 12 * (x1 - x0), bot + 24, f"month {k}", 16, 600, INK2, an)
    n, y = notes(bot + 60, "If the plan only works in the optimistic case, it is risky. And cash is not profit: customers pay late, stock is bought early.")
    b += n
    alt = "Cumulative profit over twelve months for three scenarios: optimistic recovers its start-up costs around month 6, expected around month 9, and pessimistic never does within the year."
    add(31, "Calculate costs, prices", "scenarios", "**Scenarios:**", alt, svg(y, "Scenario projections", alt, b))

    # 32 · Flyer hierarchy
    b, y = title("A flyer is read in this order — so design it in this order")
    fx, fw = 60, 240
    b += box(fx, y, fw, 330, WHITE, INK)
    b += t(fx + 16, y + 44, "Lunch at your", 24, 800) + t(fx + 16, y + 72, "desk by 12:30", 24, 800)
    b += rect(fx + 16, y + 92, fw - 32, 110, TEAL_T, LINE, 1, 4) + t(fx + fw / 2, y + 152, "photo", 16, 600, INK2, "middle", TEAL_T)
    b += t(fx + 16, y + 230, "Mon–Fri · Ikeja offices", 16, 500, INK2)
    b += rect(fx + 16, y + 256, fw - 32, 52, GOLD, INK, 1, 4) + t(fx + fw / 2, y + 288, "WhatsApp to order", 18, 800, INK, "middle", GOLD)
    for i, (yy, s) in enumerate([(y + 58, "Offer or headline — biggest"), (y + 148, "Image"), (y + 226, "Details"), (y + 284, "Call to action")]):
        b += badge(fx + fw + 40, yy, i + 1) + t(fx + fw + 64, yy + 6, s, 16, 700)
    n, y = notes(y + 360, "One message, a benefit not a feature, white space, 4.5:1 contrast. If someone cannot say what it asks in five seconds, simplify.")
    b += n
    alt = "A flyer read in four steps: the offer as the biggest headline, then the image, then the details, then a clear call to action such as “WhatsApp to order”."
    add(32, "marketing materials", "flyer-hierarchy", "**Visual hierarchy**", alt, svg(y, "Flyer hierarchy", alt, b))

    # 33 · Pitch deck sequence
    b, y = title("A ten-slide pitch tells one story")
    sl = ["Title", "Problem", "Solution", "Market", "Business model", "Traction", "Competition", "Financials", "Team", "The ask"]
    for i, s in enumerate(sl):
        col, row = i % 5, i // 5
        x, yy = 24 + col * 120, y + row * 104
        f = GOLD_T if i == 9 else SOFT
        b += box(x, yy, 114, 84, f, INK if i == 9 else LINE, 6)
        b += t(x + 7, yy + 26, str(i + 1), 16, 800, INK, bg=f)
        p, _ = para(x + 7, yy + 50, 102, s, 16, 600, INK, bg=f)
        b += p
    n, y = notes(y + 232, "5–10 minutes. A stakeholder cares most about impact and safety; an investor about return and growth — shift the weight, not the facts.")
    b += n
    alt = "A ten-slide pitch: title, problem, solution, market, business model, traction, competition, financials, team, and the ask."
    add(33, "pitch deck", "pitch-deck", "**A standard sequence:**", alt, svg(y, "Pitch deck sequence", alt, b))

    # 34 · Purchase intent
    b, y = title("Count only “Definitely” as likely buyers")
    ans = [("Definitely", 9), ("Probably", 14), ("Not sure", 8), ("Probably not", 5), ("Definitely not", 4)]
    for i, (s, n_) in enumerate(ans):
        yy = y + i * 46
        f = GOLD if i == 0 else SOFT
        b += t(24, yy + 24, s, 16, 700)
        b += rect(170, yy + 6, n_ * 22, 28, f, INK, 1)
        b += t(170 + n_ * 22 + 10, yy + 26, f"{n_} of 40", 16, 600, INK2)
    n, y = notes(y + 5 * 46 + 24, "23 of 40 said definitely or probably — but people overstate intent. Plan on the 9 (23%), and look for commitment: a number left, a pre-order.")
    b += n
    alt = "Purchase intent from 40 people: 9 definitely, 14 probably, 8 not sure, 5 probably not, 4 definitely not. Only the 9 “definitely” (23%) are counted as likely buyers."
    add(34, "Test a product concept", "purchase-intent", "people overstate intent", alt, svg(y, "Purchase intent", alt, b))

    # 36 · Kanban
    b = kanban("A Kanban board: cards move left to right", [("To do", ["Print 200 flyers", "Buy drinks"]), ("Doing", ["Book the hall · Tunde"]),
                                                            ("Done", ["Set the date", "Make the budget"])],
               "Limit work in progress: too many cards in Doing means nothing finishes. One owner and a due date on every card.")
    alt = "A Trello board with three lists — To do, Doing, Done — and one card per task with its owner; few cards in Doing at once."
    add(36, "Trello: Create a project board", "kanban", "**Kanban principles:**", alt, svg(b[1], "Kanban board", alt, b[0]))

    # 37 · WBS
    b, y = title("Breaking a project down: goal → phases → tasks")
    b += box(220, y, 200, 46, GOLD_T, INK) + t(320, y + 29, "Centre Open Day", 16, 800, INK, "middle", GOLD_T)
    ph = [("Venue", ["Visit two halls", "Pay deposit"]), ("Marketing", ["Design flyer", "Print 200"]), ("Programme", ["Invite speakers", "Order of day"])]
    for i, (p_, ts) in enumerate(ph):
        x = 24 + i * 202
        b += line(320, y + 46, x + 93, y + 76, INK2, 1.5)
        b += box(x, y + 76, 186, 40, SOFT) + t(x + 93, y + 102, p_, 16, 700, INK, "middle", SOFT)
        for k, s in enumerate(ts):
            b += line(x + 20, y + 116, x + 20, y + 148 + k * 44, LINE, 1.5)
            b += box(x + 30, y + 130 + k * 44, 156, 36, WHITE, LINE, 6, False) + t(x + 40, y + 154 + k * 44, s, 16, 500, INK)
    yy = y + 236
    b += f'<polygon points="40,{yy} 52,{yy + 12} 40,{yy + 24} 28,{yy + 12}" fill="{PURPLE}"/>'
    b += t(62, yy + 18, "Milestone: Venue confirmed (7 March) — a point in time, no duration", 16, 600)
    n, y = notes(yy + 56, "A deliverable is something you can hand over and check. Mark dependencies: no flyers before the date is confirmed.")
    b += n
    alt = "A work breakdown: the Open Day goal splits into Venue, Marketing and Programme phases, each into tasks one person can finish; a milestone such as “Venue confirmed, 7 March” marks a point in time."
    add(37, "milestones and deliverables", "wbs", "work breakdown structure", alt, svg(y, "Work breakdown structure", alt, b))

    # 38 · Critical path with buffer
    b, y = title("The critical path has no slack — give it a buffer")
    rows = [("Confirm date", 0, 2, True), ("Design flyer", 2, 3, True), ("Approve design", 5, 1, True), ("Print (3 days)", 6, 3, True),
            ("Buffer", 9, 2, None), ("Book caterer", 2, 4, False)]
    x0, dw = 180, 34
    for i, (s, st, d, crit) in enumerate(rows):
        yy = y + i * 40
        b += t(24, yy + 25, s, 16, 600)
        f = CORAL if crit else (GOLD_T if crit is None else TEAL_T)
        b += rect(x0 + st * dw, yy + 8, d * dw, 24, f, INK, 1, 3)
    b += line(x0 + 11 * dw, y, x0 + 11 * dw, y + 6 * 40, INK, 2) + t(x0 + 11 * dw - 4, y + 6 * 40 + 22, "send by 14 March", 16, 700, INK, "end")
    lg = [(CORAL, "critical path"), (TEAL_T, "has slack"), (GOLD_T, "buffer")]
    for i, (c, s) in enumerate(lg):
        b += rect(24 + i * 190, y + 270, 22, 22, c, INK, 1) + t(54 + i * 190, y + 287, s, 16, 600)
    n, y = notes(y + 330, "Any delay on a red task delays the invitation date. Work backwards from it: printing takes 3 days, so the design is approved by 10 March.")
    b += n
    alt = "A schedule where confirm date, design, approval and three days of printing form the critical path to sending invitations by 14 March, with two days of buffer; booking the caterer has slack."
    add(38, "Schedule project activities", "critical-path", "**critical path**", alt, svg(y, "Critical path and buffer", alt, b))

    # 39 · Meeting cycle
    b, y = cycle("Agenda, meeting, minutes, actions — and back again", [("Agenda", "a day before"), ("Meeting", "purpose first"), ("Minutes", "decisions"),
                                                                      ("Action points", "one owner, one date"), ("Review actions", "start of next meeting")], "Every action has an owner")
    alt = "A loop: send the agenda a day before, hold the meeting, write minutes with decisions, record action points with one owner and a date, and review them at the start of the next meeting."
    add(39, "meeting agendas", "meeting-cycle", "**reviewing the action points**", alt, svg(y, "The meeting cycle", alt, b))

    # 40 · Access by role
    b, y = title("Access by role: who can see and change each folder")
    rows = [["01 Admin", "Edit", "View", "—"], ["02 Finance", "Edit", "—", "View"], ["HR (restricted)", "Edit", "—", "—"], ["05 Projects", "Edit", "Edit", "View"]]
    fl = {}
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            if c: fl[(r, c)] = {"Edit": CORAL_T, "View": TEAL_T, "—": SOFT}[v]
    tb, y2 = table(24, y, ["Folder", "Owner", "Team", "Sponsor"], rows, [200, 130, 130, 132], fills=fl, align=["start", "middle", "middle", "middle"])
    b += tb
    n, y = notes(y2 + 30, "Share folders, not single files. Viewer by default; untick “Editors can change permissions”. Use a shared drive so files stay when a person leaves.")
    b += n
    alt = "A role-by-folder grid: the owner edits everything, the team edits projects and views admin, the sponsor views finance and projects, and the HR folder is restricted to its owner."
    add(40, "controlled digital filing", "access-by-role", "**Access by role**", alt, svg(y, "Access by role", alt, b))

    # 41 · RAG
    b, y = title("A tracker rolls up into a dashboard and one RAG status")
    tb, y2 = table(24, y, ["Task", "Owner", "Status", "Days late"],
                   [["Book hall", "Tunde", "Done", "0"], ["Print flyers", "Ada", "In progress", "2"], ["Buy drinks", "Ife", "Blocked", "4"], ["Invite guests", "Ada", "Not started", "0"]],
                   [180, 110, 170, 132], fills={(0, 2): GREEN_T, (2, 2): CORAL_T, (1, 3): GOLD_T, (2, 3): GOLD_T}, align=["start", "start", "start", "end"])
    b += tb
    y = y2 + 20
    for i, (h, v) in enumerate([("Done", "25%"), ("Overdue", "2")]):
        b += box(24 + i * 150, y, 136, 76, SOFT) + t(38 + i * 150, y + 26, h, 16, 700, INK, bg=SOFT) + t(38 + i * 150, y + 62, v, 28, 800, INK, bg=SOFT)
    b += box(324, y, 292, 76, GOLD_T, INK) + t(338, y + 30, "Project status: AMBER", 18, 800, INK, bg=GOLD_T) + t(338, y + 58, "at risk; no milestone missed yet", 16, 500, INK2, bg=GOLD_T)
    n, y = notes(y + 106, "Agree the RAG rule in advance: Red if a milestone will be missed, Amber if at risk, Green on track. Update at a fixed time each week.")
    b += n
    alt = "A task tracker with status and days late feeds a dashboard: 25% done, 2 overdue, and an overall Amber status by an agreed rule."
    add(41, "project tracker", "tracker-rag", "**A simple RAG status**", alt, svg(y, "Project tracker and RAG", alt, b))

    # 42 · Swimlane process map
    b, y = title("A process map in swimlanes: hand-offs are where delays hide")
    lanes = ["Customer", "Sales", "Store"]
    lh_ = 104
    for i, s in enumerate(lanes):
        b += rect(24, y + i * lh_, W - 48, lh_, SOFT if i % 2 == 0 else WHITE, LINE, 1)
        b += t(34, y + i * lh_ + 24, s, 16, 800, INK, bg=SOFT if i % 2 == 0 else WHITE)
    cy = [y + 52 + i * lh_ for i in range(3)]
    b += f'<ellipse cx="190" cy="{cy[0] + 6}" rx="72" ry="22" fill="{GOLD_T}" stroke="{INK}"/>' + t(190, cy[0] + 12, "Sends order", 16, 700, INK, "middle", GOLD_T)
    b += box(130, cy[1] - 14, 130, 40, WHITE, INK, 4, False) + t(195, cy[1] + 12, "Log order", 16, 600, INK, "middle")
    b += f'<polygon points="350,{cy[2] - 22} 412,{cy[2] + 6} 350,{cy[2] + 34} 288,{cy[2] + 6}" fill="{WHITE}" stroke="{INK}"/>' + t(350, cy[2] + 12, "In stock?", 16, 700, INK, "middle")
    b += box(456, cy[2] - 14, 128, 40, WHITE, INK, 4, False) + t(520, cy[2] + 12, "Pack, send", 16, 600, INK, "middle")
    b += box(330, cy[1] - 14, 152, 40, WHITE, INK, 4, False) + t(406, cy[1] + 12, "Offer alternative", 16, 600, INK, "middle")
    b += arrow(190, cy[0] + 28, 192, cy[1] - 16) + arrow(222, cy[1] + 26, 300, cy[2] + 0) + arrow(412, cy[2] + 6, 454, cy[2] + 6)
    b += arrow(350, cy[2] - 22, 370, cy[1] + 28)
    b += t(433, cy[2] - 14, "yes", 16, 600, INK2, "middle") + t(326, cy[2] - 30, "no", 16, 600, INK2, "end")
    y += 3 * lh_
    for i, (sh, s) in enumerate([("oval", "start / end"), ("rect", "a step"), ("diamond", "a decision")]):
        x = 24 + i * 200
        if sh == "oval": b += f'<ellipse cx="{x + 20}" cy="{y + 30}" rx="18" ry="11" fill="{GOLD_T}" stroke="{INK}"/>'
        if sh == "rect": b += rect(x + 2, y + 20, 36, 22, WHITE, INK, 1)
        if sh == "diamond": b += f'<polygon points="{x + 20},{y + 16} {x + 38},{y + 30} {x + 20},{y + 44} {x + 2},{y + 30}" fill="{WHITE}" stroke="{INK}"/>'
        b += t(x + 48, y + 36, s, 16, 600)
    alt = ("A swimlane process map with lanes for Customer, Sales and Store: the customer sends an order (oval), Sales logs it (rectangle), the Store decides “In stock?” "
           "(diamond) — yes, pack and send; no, Sales offers an alternative.")
    add(42, "Map a business process", "swimlanes", "**Swimlanes**", alt, svg(y + 60, "Swimlane process map", alt, b))

    # 43 · SOP steps with decision
    b, y = steps_v("An SOP step list: one action per step, decisions spelled out", [
        ("Open the payment request form", "Check it is signed by the requester."),
        ("Check the amount", "If over ₦50,000, get the coordinator's approval before paying."),
        ("Pay the supplier", "From the business account only, never personal."),
        ("Record it", "Log entry with the receipt link, the same day.")])
    alt = "An SOP's procedure as numbered steps, each starting with a verb, with the decision written into the step: if the amount is over ₦50,000, get the coordinator's approval before paying."
    add(43, "standard operating procedure", "sop-steps", "**Procedure**", alt, svg(y, "SOP steps", alt, b))

    # 44 · Procurement with separation of duties
    b, y = title("Procurement in seven steps, by more than one person")
    st = [("Request", "Requester"), ("Approve", "Manager"), ("3 quotes", "Buyer"), ("Select, record why", "Buyer"), ("Pay, keep receipt", "Accounts"),
          ("Check delivery", "Not the buyer"), ("Record in register", "Store")]
    roles = {"Requester": TEAL_T, "Manager": GOLD_T, "Buyer": CORAL_T, "Accounts": PURPLE_T, "Not the buyer": GREEN_T, "Store": SOFT}
    for i, (s, r) in enumerate(st):
        yy = y + i * 46
        b += badge(40, yy + 18, i + 1)
        b += box(66, yy, 310, 36, SOFT, LINE, 6, False) + t(80, yy + 24, s, 16, 600, INK, bg=SOFT)
        b += box(390, yy, 226, 36, roles[r], LINE, 6, False) + t(402, yy + 24, r, 16, 700, INK, bg=roles[r])
    n, y = notes(y + 7 * 46 + 22, "Separation of duties: the person who requests, approves, pays and receives should not all be one person.")
    b += n
    alt = "Seven procurement steps — request, approve, three quotes, select and record why, pay and keep the receipt, check delivery, record in the register — each done by a different role."
    add(44, "procurement", "procurement-duties", "**Separation of duties**", alt, svg(y, "Procurement and separation of duties", alt, b))

    # 45 · Risk matrix
    b = risk_matrix("Risk score = likelihood × impact", [(4, 4, "Generator fails"), (2, 5, "Fire"), (3, 2, "Rain")],
                    "Sort the register by score. Respond: avoid, reduce, transfer or accept — each with an owner and a date.")
    alt = "A 5 × 5 risk matrix: likelihood times impact gives a score, 1–7 green, 8–14 amber, 15–25 red; a generator failure scores 4 × 4 = 16 and goes to the top of the register."
    add(45, "risk register", "risk-matrix", "**Score** = Likelihood × Impact", alt, svg(b[1], "Risk matrix", alt, b[0]))

    # 46 · Outputs vs outcomes
    b, y = chain_h("Evaluate the chain, not just the head-count", [("Process", "how well it was run"), ("Outputs", "what was delivered: 200 attended"),
                                                                 ("Outcomes", "what changed for people")],
                   note="Add cost: actual spend against budget, and cost per participant. “200 attended” is an output; “they can now do something new” is an outcome.")
    alt = "Evaluation follows a chain: the process (how well it ran) produces outputs (what was delivered, e.g. 200 attended) that should lead to outcomes (what changed for people), plus the cost."
    add(46, "evaluation and feedback", "outputs-outcomes", "**What to evaluate:**", alt, svg(y, "Outputs and outcomes", alt, b))

    # 48 · Roster
    b, y = title("A roster that flags its own gaps and double-bookings")
    rows = [["Lead", "Ada", "Ada"], ["Instructor", "Tunde", "Bisi"], ["Instructor", "Bisi", ""], ["Check-in desk", "Tunde", "Ife"]]
    tb, y2 = table(24, y, ["Role", "Sat 9–12", "Sat 12–3"], rows, [200, 196, 196], fills={(1, 1): CORAL_T, (3, 1): CORAL_T, (2, 2): CORAL})
    b += tb
    b += t(24, y2 + 30, "Tunde twice in one shift: double-booked.", 16, 700, CORAL_D)
    b += t(24, y2 + 56, "Empty cell: a gap nobody covers.", 16, 700, CORAL_D)
    n, y = notes(y2 + 90, "Dropdowns from a staff list keep names spelt the same. Count shifts per person with COUNTIF for fairness; never one adult alone with children.")
    b += n
    alt = "A duty roster grid of roles by shift where conditional formatting highlights Tunde booked twice in the 9–12 shift and an empty instructor slot at 12–3."
    add(48, "duty roster", "roster-flags", "**double-booking**", alt, svg(y, "Duty roster", alt, b))

    # 49 · RACI
    b, y = title("A RACI matrix: exactly one A per task")
    rows = [["Book the venue", "R", "A", "C", "I"], ["Design the flyer", "A", "", "R", "I"], ["Set the budget", "R", "A", "A", ""]]
    fl = {(2, 2): CORAL_T, (2, 3): CORAL_T}
    tb, y2 = table(24, y, ["Task", "Ada", "Tunde", "Bisi", "Ife"], rows, [216, 94, 94, 94, 94], fills=fl, align=["start"] + ["middle"] * 4)
    b += tb
    b += t(24, y2 + 28, "“Set the budget” has two A's: confusion and blame. Fix it.", 16, 700, CORAL_D)
    y = y2 + 46
    for i, (k, v) in enumerate([("R", "Responsible: does the work"), ("A", "Accountable: owns and signs off"), ("C", "Consulted: input before, two-way"), ("I", "Informed: told after, one-way")]):
        b += t(24, y + 26 + i * 26, f"{k} — {v}", 16, 600)
    alt = "A RACI matrix of tasks against people: R responsible, A accountable, C consulted, I informed. Each task needs exactly one A; “Set the budget” with two A's is flagged."
    add(49, "responsibility matrices", "raci", "**Checks when reviewing a RACI:**", alt, svg(y + 120, "RACI matrix", alt, b))

    # 50 · Rating scale
    b, y = title("Rate behaviour on one scale, with an example")
    b += box(24, y, W - 48, 60, SOFT) + t(40, y + 36, "“Submits the attendance report by Monday 10am”", 16, 700, INK, bg=SOFT)
    y += 82
    labels = [("1", "Rarely"), ("2", ""), ("3", "Usually"), ("4", ""), ("5", "Always")]
    for i, (n_, s) in enumerate(labels):
        x = 60 + i * 128
        b += circle(x, y + 20, 20, GOLD_T if i == 3 else WHITE, INK, 1.5) + t(x, y + 26, n_, 16, 800, INK, "middle", GOLD_T if i == 3 else WHITE)
        if s: b += t(x, y + 66, s, 16, 600, INK2, "middle")
    b += box(24, y + 90, W - 48, 50, GOLD_T) + t(40, y + 120, "Example: “Late twice this term, on both rainy Mondays.”", 16, 600, INK, bg=GOLD_T)
    n, y = notes(y + 172, "Not “Is a responsible person” — that is personality. The same anchored scale for every question; ratings without examples are opinions.")
    b += n
    alt = "A behaviour-based question — “Submits the attendance report by Monday 10am” — rated on one scale anchored 1 Rarely, 3 Usually, 5 Always, with a required example."
    add(50, "performance evaluation", "rating-scale", "**Behaviour-based**", alt, svg(y, "A rating scale", alt, b))

    # 51 · Heat map
    b, y = title("A heat map shows a team-wide weakness at a glance")
    ppl = ["Ada", "Tunde", "Bisi", "Ife"]
    ind = ["Reliable", "Quality", "Teamwork", "Reports"]
    sc = [[5, 4, 4, 2], [4, 4, 5, 2], [3, 5, 4, 1], [5, 3, 4, 2]]
    cmap = {1: CORAL, 2: CORAL_T, 3: GOLD_T, 4: GREEN_T, 5: "#bfe0c6"}
    fl = {(r, c + 1): cmap[sc[r][c]] for r in range(4) for c in range(4)}
    tb, y2 = table(24, y, [""] + ind, [[p] + [str(v) for v in sc[i]] for i, p in enumerate(ppl)], [112, 120, 120, 120, 120], fills=fl, align=["start"] + ["middle"] * 4)
    b += tb
    n, y = notes(y2 + 30, "Everyone is low on Reports: that is a training or process problem, not four individual failings. One rating is not a trend; check the examples.")
    b += n
    alt = "A heat map of four people against four indicators; the whole Reports column is low (1–2), which points to a team-wide training or process problem."
    add(51, "Analyse team performance", "heat-map", "**heat map**", alt, svg(y, "Team heat map", alt, b))

    # 52 · Double entry
    b, y = title("Double entry: one payment, two accounts, equal and opposite")
    for k, (h, l, r_) in enumerate((("Bank (asset)", "", "₦20,000 out"), ("Rent expense", "₦20,000 in", ""))):
        x = 40 + k * 300
        b += t(x + 120, y + 20, h, 18, 800, INK, "middle")
        b += line(x, y + 34, x + 240, y + 34, INK, 2.5) + line(x + 120, y + 34, x + 120, y + 150, INK, 2.5)
        b += t(x + 60, y + 58, "Debit", 16, 600, INK2, "middle") + t(x + 180, y + 58, "Credit", 16, 600, INK2, "middle")
        if l: b += t(x + 60, y + 96, l, 16, 800, TEAL_D, "middle")
        if r_: b += t(x + 180, y + 96, r_, 16, 800, CORAL_D, "middle")
    y += 170
    b += box(24, y, W - 48, 56, GOLD_T, INK) + t(W / 2, y + 35, "Assets = Liabilities + Equity", 20, 800, INK, "middle", GOLD_T)
    n, y = notes(y + 88, "Paying ₦20,000 rent reduces the bank and increases rent expense by the same amount — which is why the books always balance and errors show up.")
    b += n
    alt = "Paying ₦20,000 rent is recorded twice: a credit of ₦20,000 to the bank account and a debit of ₦20,000 to rent expense; the balance sheet always holds Assets = Liabilities + Equity."
    add(52, "Manager.io: Practise transaction", "double-entry", "**Double-entry bookkeeping**", alt, svg(y, "Double entry", alt, b))

    # 53 · Cash-flow forecast
    b, y = title("A cash-flow forecast shows the bad month before it arrives")
    tb, y2 = table(24, y, ["₦ thousands", "Jan", "Feb", "Mar", "Apr"],
                   [["Opening cash", "80", "70", "15", "-25"], ["+ Cash in", "120", "95", "100", "160"], ["− Cash out", "130", "150", "140", "110"],
                    ["= Closing cash", "70", "15", "-25", "25"]],
                   [176, 104, 104, 104, 104], fills={(3, 3): CORAL_T, (0, 4): CORAL_T}, bold_rows=(3,), align=["start"] + ["end"] * 4)
    b += tb
    n, y = notes(y2 + 30, "Closing cash becomes next month's opening: =B2+B3-B4. March goes negative, so act in January: chase debts, delay a purchase, arrange funds. Profit is not cash.")
    b += n
    alt = "A four-month cash forecast in which each closing balance becomes the next opening: 70, 15, then −₦25,000 in March, warning in advance that action is needed."
    add(53, "budget variance and cash-flow", "cash-forecast", "**Cash-flow report / forecast**", alt, svg(y, "Cash-flow forecast", alt, b))

    # 54 · Linked records
    b, y = title("Linked records: type a member once, link payments to them")
    b += box(24, y, 250, 170, TEAL_T, INK)
    b += t(38, y + 28, "Members", 18, 800, INK, bg=TEAL_T)
    for i, s in enumerate(["Ada Okafor · 0803…", "Rollup: total paid", "= ₦15,000"]):
        b += t(38, y + 64 + i * 30, s, 16, 700 if i == 2 else 500, INK, bg=TEAL_T)
    b += box(366, y, 250, 170, GOLD_T, INK)
    b += t(380, y + 28, "Payments", 18, 800, INK, bg=GOLD_T)
    for i, s in enumerate(["₦5,000 · Jan → Ada", "₦5,000 · Feb → Ada", "₦5,000 · Mar → Ada"]):
        b += t(380, y + 64 + i * 30, s, 16, 500, INK, bg=GOLD_T)
        b += arrow(362, y + 58 + i * 30, 280, y + 70, INK2, 1.6)
    b += t(320, y + 196, "one member — many payments", 16, 700, INK, "middle")
    n, y = notes(y + 232, "Change Ada's phone number once and it is right everywhere. Views (grid, Kanban, calendar, form) show the same records without copying them.")
    b += n
    alt = "Two Airtable tables: three Payment records each link to one Member record, and a rollup field on the member adds them up to ₦15,000 — one member, many payments."
    add(54, "Airtable", "linked-records", "**Linked records**", alt, svg(y, "Linked records", alt, b))

    # 55 · Make scenario
    b, y = chain_h("A Make scenario: a trigger, a filter, then actions", [("Trigger", "new form response"), ("Filter", "priority = High"),
                                                                        ("Email", "facilities lead, details mapped in"), ("Add row", "requests tracker")],
                   note="Draw it on paper first. Test with sample data, including missing fields and duplicates, and write down who owns it and how to switch it off.")
    alt = "An automation: a new Google Form response triggers the scenario, a filter lets only High-priority requests through, then it emails the facilities lead and adds a row to the tracker."
    add(55, "Make: Design", "make-scenario", "**A simple notification workflow:**", alt, svg(y, "Automation scenario", alt, b))

    # 56 · Form to tracker
    b, y = title("Tracking columns go to the RIGHT of the form's columns")
    tb, y2 = table(24, y, ["Timestamp", "Request", "Status", "Owner", "Due"],
                   [["12/03 09:14", "Fan broken", "Done", "Ife", "15/03"], ["13/03 11:02", "No chalk", "New", "", "16/03"]],
                   [140, 130, 110, 96, 116], fills={(0, 2): GREEN_T, (1, 2): GOLD_T, (0, 3): TEAL_T, (1, 3): TEAL_T, (0, 4): TEAL_T, (1, 4): TEAL_T})
    b += tb
    b += rect(24, y2 + 14, 22, 22, WHITE, INK, 1) + t(56, y2 + 31, "written by the form", 16, 600)
    b += rect(260, y2 + 14, 22, 22, TEAL_T, INK, 1) + t(292, y2 + 31, "added by you, never in between", 16, 600)
    y = y2 + 52
    b2, y = chain_h("", [("New", None), ("In progress", None), ("Waiting", None), ("Done", "tell the requester")], y=y + 4)
    b += b2
    alt = "Form columns (timestamp, request) on the left; your tracking columns (status, owner, due) added to their right; each request moves New → In progress → Waiting → Done, and the requester is told."
    add(56, "Connect form responses", "form-tracker", "**Add tracking columns**", alt, svg(y, "From form to tracker", alt, b))

    # 57 · Verify AI suggestions
    b, y = steps_v("An AI suggestion is a hypothesis until it is checked", [
        ("Check each assumption", "“Most parents have smartphones” — is that true of your members?"),
        ("Check feasibility", "Staff, cost, equipment, internet, safeguarding."),
        ("Look for invented facts", "Tools, features or statistics that do not exist."),
        ("Pilot on one Saturday", "Measure queue time before and after."),
        ("Ask the people who do the work", "Then accept or reject, and record why.")])
    alt = "Every AI-proposed change is checked: its assumptions, its feasibility, any invented facts, a one-Saturday pilot measured before and after, and the staff who do the work — then accepted or rejected with reasons."
    add(57, "ChatGPT: Improve an existing workflow", "verify-ai", "**Then verify", alt, svg(y, "Verifying AI suggestions", alt, b))

    # 58 · Operating rhythm
    b, y = cycle("An operating rhythm: who updates what, when", [("Daily", "owners move Trello cards"), ("Friday 3pm", "lead updates Sheets"),
                                                             ("Monday", "team reviews dashboard"), ("Monthly", "report to management")], "One source of truth for each fact")
    alt = "A routine linking the tools: owners move Trello cards daily, the lead updates the Sheets tracker on Friday, the team reviews the dashboard on Monday, and a monthly report goes to management."
    add(58, "Connect reporting", "operating-rhythm", "**Define the routine", alt, svg(y, "Operating rhythm", alt, b))

    # 59 · System overview
    b, y = title("A system overview: what each tool is for and how they connect")
    nodes = [(120, 60, "Google Form", "requests in"), (320, 60, "Sheets tracker", "status, owner"), (520, 60, "Dashboard", "KPIs"),
             (120, 210, "Airtable", "members, payments"), (320, 210, "Trello", "tasks"), (520, 210, "Manager.io", "money")]
    for x, yy, h, s in nodes:
        c, _ = card(x - 88, y + yy - 30, 176, h, s, SOFT, hs=16, a="middle", pad=8, minh=66)
        b += c
    for a_, c_ in ((0, 1), (1, 2), (4, 1), (3, 2), (5, 2)):
        x1, y1 = nodes[a_][0], nodes[a_][1]; x2, y2 = nodes[c_][0], nodes[c_][1]
        if y1 == y2: b += arrow(x1 + 90, y + y1 + 3, x2 - 92, y + y2 + 3)
        else: b += arrow(x1 + (40 if x2 > x1 else 0), y + y1 - 34, x2 - (40 if x2 > x1 else 0), y + y2 + 40)
    y += 270
    n, y = notes(y + 10, "Controls: access by role, validation on entry, approvals above a limit, reconciliation, backups — and an owner named for every tool.")
    b += n
    alt = "A one-page system overview: form responses feed the Sheets tracker, which feeds the dashboard; Trello tasks feed the tracker; Airtable and Manager.io feed the dashboard; each tool has an owner."
    add(59, "working management system", "system-overview", "how they connect (a diagram)", alt, svg(y, "System overview", alt, b))

    # 60 · SMART
    b, y = title("A SMART goal, taken apart")
    b += box(24, y, W - 48, 60, GOLD_T, INK)
    p, _ = para(40, y + 26, W - 80, "“Reduce average check-in time to under 15 minutes by the end of term.”", 16, 700, INK, bg=GOLD_T)
    b += p
    y += 78
    parts = [("S", "Specific", "check-in time, not “things”"), ("M", "Measurable", "minutes, against a 40-minute baseline"), ("A", "Achievable", "with the staff and money you have"),
             ("R", "Relevant", "it is the problem the sponsor approved"), ("T", "Time-bound", "by the end of term")]
    for i, (k, h, s) in enumerate(parts):
        yy = y + i * 50
        b += circle(44, yy + 20, 18, GOLD, INK) + t(44, yy + 27, k, 18, 800, INK, "middle", GOLD)
        b += t(74, yy + 26, h, 16, 800) + t(200, yy + 26, s, 16, 500, INK2)
    alt = "The goal “Reduce average check-in time to under 15 minutes by the end of term” checked as SMART: specific, measurable against a 40-minute baseline, achievable, relevant, and time-bound."
    add(60, "project brief", "smart-goal", "SMART", alt, svg(y + 5 * 50 + 6, "A SMART goal", alt, b))

    # 61 · Triangulation
    b, y = title("Triangulate: do different methods agree?")
    cx, cy = W / 2, y + 150
    meth = [("Survey", "“the queue is short”", -1, -1), ("Stopwatch", "38 min on 4 Saturdays", 1, -1), ("Interviews", "6 parents", -1, 1),
            ("Records", "late-arrival log", 1, 1)]
    b += box(cx - 76, cy - 34, 152, 68, GOLD_T, INK) + t(cx, cy - 6, "Finding", 18, 800, INK, "middle", GOLD_T) + t(cx, cy + 18, "with its strength", 16, 500, INK2, "middle", GOLD_T)
    for h, s, sx, sy in meth:
        x, yy = cx + sx * 205, cy + sy * 92
        c, hh = card(x - 90, yy - 32, 180, h, s, CORAL_T if h == "Survey" else SOFT, hs=16, a="middle", pad=8, minh=64)
        b += c
        b += arrow(x - sx * 90, yy, cx + sx * 80, cy + sy * 20)
    n, y = notes(cy + 150, "When the survey says “short” and the stopwatch says 38 minutes, trust the measurement and find out why people answered as they did.")
    b += n
    alt = "Four methods — survey, stopwatch observation, interviews and existing records — point at one finding; where the survey and the 38-minute stopwatch measurement disagree, trust the measurement and investigate."
    add(61, "Conduct research", "triangulation", "**Triangulate**", alt, svg(y, "Triangulation", alt, b))

    # 62 · Theory of change
    b, y = chain_h("A theory of change: if we do X, then Y, which leads to Z", [("If we do X", "text a check-in code the night before"),
                                                                              ("then Y happens", "check-in takes under 15 minutes"),
                                                                              ("which leads to Z", "children start the first session on time")],
                   note="Every arrow is a claim that needs evidence from your research. Beneficiaries and payers are often different people: map both.")
    alt = "A theory of change as three linked claims: if we text a check-in code the night before, then check-in takes under 15 minutes, which leads to children starting the first session on time."
    add(62, "Develop the business or service model", "theory-of-change", "**Theory of Change**", alt, svg(y, "Theory of change", alt, b))

    # 63 · Sustainability point
    b, y = title("The sustainability point: when income covers running costs")
    x0, x1, top, bot = 70, W - 30, y + 10, y + 240
    m = lambda k: x0 + k / 12 * (x1 - x0)
    v = lambda val: bot - val / 120 * (bot - top)
    inc = [0, 10, 20, 30, 40, 50, 58, 64, 70, 74, 78, 80, 82]
    b += line(x0, bot, x1, bot, INK2, 2) + line(x0, top, x0, bot, INK2, 2)
    b += rect(m(0), v(110), m(2) - m(0), v(0) - v(110), CORAL_T)
    b += t(m(1), v(110) + 22, "set-up", 16, 700, INK, "middle", CORAL_T)
    b += line(m(0), v(60), x1, v(60), CORAL_D, 3) + t(x1, v(60) + 22, "running costs ₦60k/month", 16, 700, CORAL_D, "end")
    b += path("M" + " L".join(f"{m(k):.1f} {v(val):.1f}" for k, val in enumerate(inc)), TEAL_D, sw=3)
    b += t(m(10.6), v(84) - 12, "income", 16, 700, TEAL_D, "middle")
    xc = next(k - 1 + (60 - inc[k - 1]) / (inc[k] - inc[k - 1]) for k in range(1, 13) if inc[k] >= 60)
    b += circle(m(xc), v(60), 7, GOLD, INK, 2) + t(m(xc), bot + 24, f"month {round(xc)}", 16, 800, INK, "middle")
    n, y = notes(bot + 60, "Every estimate lives on an assumptions tab that the formulas read. State the risk plainly: below 60 paying members, the service needs sponsorship.")
    b += n
    alt = "A forecast where one-off set-up costs come first, then monthly income rises to meet running costs of ₦60,000 around month 6 — the sustainability point."
    add(63, "project budget and financial forecast", "sustainability-point", "**Break-even** or **sustainability point**", alt, svg(y, "Sustainability point", alt, b))

    # 65 · Project folder
    b, y = title("The capstone folder: numbered, with raw data restricted")
    tb, y = tree(28, y + 14, [(0, "Capstone project", 1, ""), (1, "00 README", 0, "start here"), (1, "01 Brief and approvals", 1, ""), (1, "02 Research", 1, ""),
                              (2, "Raw data (restricted)", 1, "personal data"), (2, "Analysis", 1, ""), (1, "03 Model and finance", 1, ""),
                              (1, "05 Pilot", 1, "plans, SOPs, logs"), (1, "07 Meetings", 1, ""), (1, "99 Archive", 1, "")])
    b += tb
    n, y = notes(y + 34, "Name files 2026-04-02_budget_v3. Keep a decision log. Test the README: can an outsider find any document in under a minute?")
    b += n
    alt = "A project folder with a README first, numbered sections from brief to archive, and the research raw data in its own restricted subfolder."
    add(65, "documentation system", "capstone-folder", "**Structure the project folder", alt, svg(y, "Project documentation folder", alt, b))

    # 66 · Fidelity
    b, y = title("Prototype fidelity: start low, rise as the design settles")
    b += f'<defs><linearGradient id="fg" x1="0" x2="1"><stop offset="0" stop-color="{TEAL_T}"/><stop offset="1" stop-color="{GOLD_T}"/></linearGradient></defs>'
    b += rect(24, y, W - 48, 40, "url(#fg)", INK, 1, 20)
    b += t(40, y + 26, "Low fidelity", 16, 800, INK, bg=TEAL_T) + t(W - 40, y + 26, "High fidelity", 16, 800, INK, "end", GOLD_T)
    y += 60
    b2, y = compare("", ("Paper sketch, rough slide", ["Fast and cheap", "People feel free to criticise", "Tests the big idea"]),
                    ("Looks almost real", ["Slower to make", "People hold back criticism", "Tests the details"]), lf=TEAL_T, rf=GOLD_T, y=y)
    b += b2
    alt = "A scale from low fidelity (paper sketches: fast, cheap, invites criticism, tests the big idea) to high fidelity (looks real: slower, people hold back, tests details)."
    add(66, "prototype", "fidelity", "Start low; increase fidelity", alt, svg(y, "Prototype fidelity", alt, b))

    # 67 · Severity × frequency
    b, y = matrix2("Fix problems by severity and how many people hit them", "How many users hit it →", "How bad →",
                   [("Fix later", "blocks the task, but rare", GOLD_T), ("Fix first", "blocks the task, most users", CORAL_T),
                    ("Note it", "cosmetic, rare", GREEN_T), ("Fix soon", "cosmetic or slows, common", GOLD_T)],
                   note="About five users per round finds most usability problems; fix, then test again. Log each change with the evidence behind it.")
    alt = "Problems from user tests are prioritised by severity and frequency: blocking problems most users hit are fixed first; rare cosmetic ones are only noted."
    add(67, "structured feedback", "severity-frequency", "**Prioritise problems**", alt, svg(y, "Prioritising usability problems", alt, b))

    # 68 · Pilot with stop rule
    b, y = steps_v("A supervised pilot: small, measured, with a way back", [
        ("Scope and approval", "Two Saturdays, one centre, new members; sponsor agrees in writing."),
        ("Baseline and measures", "Check-in takes 38 minutes today."),
        ("Run, with the old process ready", "Record times, errors and an issue log."),
        ("Stop rule decided in advance", "Safety concern, data error or unacceptable delay → switch back.")], hl=[3])
    alt = "A pilot plan: a narrow scope with written approval, a baseline of 38 minutes, the new process run with the old one ready as a fallback, and stop rules decided in advance."
    add(68, "pilot", "pilot-plan", "**Plan the pilot:**", alt, svg(y, "Pilot plan", alt, b))

    # 69 · Baseline vs result
    b, y = title("Check-in time: baseline, target and pilot result")
    rows = [("Baseline", 38, SOFT), ("Pilot result", 17, TEAL), ("Target", 15, GOLD)]
    for i, (s, vv, c) in enumerate(rows):
        yy = y + 10 + i * 60
        b += t(24, yy + 28, s, 16, 700)
        b += rect(150, yy + 6, vv * 11, 34, c, INK, 1)
        b += t(150 + vv * 11 + 10, yy + 30, f"{vv} min", 16, 800, INK)
    n, y = notes(y + 210, "Change = 17 − 38 = −21 minutes (−55%). Nearly met. Two Saturdays is indicative, not conclusive: was attendance unusually low?")
    b += n
    alt = "Average check-in time fell from a 38-minute baseline to 17 minutes in the pilot (−55%), just short of the 15-minute target."
    add(69, "Evaluate results", "baseline-result", "**Compare against the baseline:**", alt, svg(y, "Baseline, target and result", alt, b))


def bmc_body(ttl, names):
    b, y = title(ttl)
    x0, w = 16, W - 32
    cw = w / 5
    hh = 300
    # columns: partners | activities/resources | value | relationships/channels | segments
    cells = [(0, 0, 1, 2, names[0]), (1, 0, 1, 1, names[1]), (1, 1, 1, 1, names[2]), (2, 0, 1, 2, names[3]), (3, 0, 1, 1, names[4]), (3, 1, 1, 1, names[5]),
             (4, 0, 1, 2, names[6])]
    for c, r, sw_, sh, s in cells:
        f = GOLD_T if s.startswith("Value") else (TEAL_T if s.startswith("Customer s") else SOFT)
        b += rect(x0 + c * cw, y + r * hh / 2, cw * sw_, hh / 2 * sh, f, INK, 1.2)
        p, _ = para(x0 + c * cw + 6, y + r * hh / 2 + 24, cw - 12, s, 16, 600, INK, bg=f)
        b += p
    b += rect(x0, y + hh, w / 2, 80, CORAL_T, INK, 1.2) + rect(x0 + w / 2, y + hh, w / 2, 80, GREEN_T, INK, 1.2)
    b += t(x0 + 10, y + hh + 28, names[7], 16, 700, INK, bg=CORAL_T) + t(x0 + w / 2 + 10, y + hh + 28, names[8], 16, 700, INK, bg=GREEN_T)
    b += t(x0 + 10, y + hh + 56, "fixed and variable", 16, 500, INK2, bg=CORAL_T) + t(x0 + w / 2 + 10, y + hh + 56, "how money comes in", 16, 500, INK2, bg=GREEN_T)
    y += hh + 80
    n, y = notes(y + 30, "Start with customer segments and value propositions; everything else depends on them. Mark untested assumptions differently from facts.")
    return b + n, y


def kanban(ttl, cols, note):
    b, y = title(ttl)
    cw = (W - 48 - 32) / 3
    for i, (h, cards) in enumerate(cols):
        x = 24 + i * (cw + 16)
        b += box(x, y, cw, 230, SOFT)
        b += t(x + 12, y + 28, f"{h} ({len(cards)})", 18, 800, INK, bg=SOFT)
        for k, s in enumerate(cards):
            c, hh = card(x + 10, y + 46 + k * 74, cw - 20, None, s, WHITE, hs=16, pad=10, bfill=INK, minh=62)
            b += c
    y += 230
    b += arrow(60, y + 20, W - 60, y + 20)
    n, y = notes(y + 56, note)
    return b + n, y


def risk_matrix(ttl, pts, note):
    b, y = title(ttl)
    x0, cs, ch = 76, 62, 46
    for li in range(5):
        for im in range(5):
            s = (5 - li) * (im + 1)
            f = CORAL_T if s >= 15 else (GOLD_T if s >= 8 else GREEN_T)
            b += rect(x0 + im * cs, y + li * ch, cs, ch, f, WHITE, 2)
            b += t(x0 + im * cs + 18, y + li * ch + ch / 2 + 6, str(s), 16, 600, INK2, "middle", f)
    for k, (l, i_, s) in enumerate(pts):
        cx, cy = x0 + (i_ - 1) * cs + 44, y + (5 - l) * ch + ch / 2
        b += circle(cx, cy, 12, INK) + t(cx, cy + 6, "ABC"[k], 16, 800, WHITE, "middle", INK)
    gy = y + 5 * ch
    for k in range(5):
        b += t(x0 + k * cs + cs / 2, gy + 22, str(k + 1), 16, 600, INK2, "middle")
        b += t(x0 - 10, y + k * ch + ch / 2 + 6, str(5 - k), 16, 600, INK2, "end")
    b += t(x0 + 2.5 * cs, gy + 48, "Impact →", 16, 700, INK, "middle")
    b += f'<text transform="translate({x0 - 40} {y + 2.5 * ch}) rotate(-90)" font-size="16" font-weight="700" fill="{INK}" text-anchor="middle">Likelihood →</text>'
    lx = x0 + 5 * cs + 22
    for k, (l, i_, s) in enumerate(pts):
        yy = y + 22 + k * 64
        b += circle(lx + 12, yy - 6, 12, INK) + t(lx + 12, yy, "ABC"[k], 16, 800, WHITE, "middle", INK)
        b += t(lx + 32, yy, s, 16, 700) + t(lx + 32, yy + 24, f"{l} × {i_} = {l * i_}", 16, 500, INK2)
    n, y2 = notes(gy + 84, "1–7 green, 8–14 amber, 15–25 red. " + note)
    return b + n, y2
