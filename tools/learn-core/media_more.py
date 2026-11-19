"""
More pictures for the core courses (owner, 7 Nov 2026: Data Appreciation is "the very basics to intermediate of what
every computer user should [know]"; "Add diagrams, illustrations and screenshot").

Diagrams (SVG) for the computer-user basics — storage units, files and folders, backup, the spreadsheet, a formula,
passwords, sharing, file formats, checking a source — and worked-example pages that shots.js renders to PNG: a file
manager, a SUM with fill-down, sort and filter, a share dialog, and four desktop-publishing work screens.

The "screenshots" are drawn: generic windows with no product's logo or trade dress, so they can ship, print, and
never go stale when a vendor moves a button. Each says what it shows in its caption, in the lesson.
"""
from media import svg, text, box, arrow, DEFS, INK, INK2, LINE, SOFT, GOLD, TEAL, CORAL, GREEN


def diagrams():
    D = {}
    units = [("1 bit", "a single 0 or 1"), ("1 byte = 8 bits", "one letter: A"), ("1 KB ≈ 1,000 bytes", "a short text message"),
             ("1 MB ≈ 1,000 KB", "a phone photo is 2–5 MB"), ("1 GB ≈ 1,000 MB", "an hour of video"), ("1 TB ≈ 1,000 GB", "a big external drive")]
    b = text(30, 40, "How big is data? Each step is about 1,000 times the last", 20, 800) + DEFS
    for i, (u, e) in enumerate(units):
        x, w = 24 + i * 130, 116
        h = 40 + i * 30
        b += box(x, 300 - h, w, h, GOLD if i == 3 else SOFT, INK if i == 3 else LINE, 8)
        b += text(x + w / 2, 300 - h + 22, u.split(" =")[0].split(" ≈")[0], 15, 800, INK, "middle")
        b += text(x + w / 2, 322, u, 11.5, 700, INK2, "middle")
        e1, _, e2 = e.partition(" is ") if " is " in e else (e, "", "")
        b += text(x + w / 2, 340, e1 + (" is" if e2 else ""), 11.5, 500, INK2, "middle") + (text(x + w / 2, 356, e2, 11.5, 500, INK2, "middle") if e2 else "")
    b += text(24, 392, "Phones and laptops show sizes this way: check before you download, copy or send.", 14, 600, INK2)
    D["storage-units.svg"] = svg(810, 410, "Units of data storage", "Bit, byte, kilobyte, megabyte, gigabyte, terabyte: each about a thousand times the one before, with an everyday example of each.", b)

    b = text(30, 40, "Files live in folders; a file's name says what it is", 20, 800)
    tree = [(0, "Documents", 1), (1, "School", 1), (2, "2026-03-14_maths-homework_v2.docx", 0), (2, "Science project", 1),
            (1, "Club", 1), (2, "Data Appreciation", 1), (3, "lunch-survey.xlsx", 0), (3, "lunch-chart.png", 0), (1, "Photos", 1)]
    for i, (d, name, folder) in enumerate(tree):
        y = 74 + i * 30
        x = 40 + d * 28
        if d: b += f'<path d="M{x - 16} {y - 22} V{y - 6} H{x - 4}" fill="none" stroke="{LINE}" stroke-width="1.5"/>'
        b += (f'<rect x="{x}" y="{y - 15}" width="18" height="13" rx="2" fill="{GOLD}" stroke="{INK}"/>' if folder else
              f'<rect x="{x + 2}" y="{y - 17}" width="13" height="16" rx="1" fill="#fff" stroke="{INK}"/>')
        b += text(x + 26, y - 3, name, 14, 700 if folder else 500)
    b += box(420, 70, 280, 150) + text(436, 98, "Anatomy of a file name", 15, 800)
    b += text(436, 128, "2026-03-14_maths-homework_v2.docx", 12.5, 700)
    b += text(436, 154, "date first → sorts in order", 12.5, 500, INK2) + text(436, 174, "what it is, which version", 12.5, 500, INK2)
    b += text(436, 194, ".docx = the EXTENSION: the file type", 12.5, 700, CORAL) + text(436, 212, "and which app opens it", 12.5, 500, INK2)
    b += box(420, 236, 280, 96) + text(436, 262, "A path is the address:", 14, 700)
    b += text(436, 286, "Documents › Club ›", 12.5, 500, INK2) + text(436, 306, "Data Appreciation › lunch-survey.xlsx", 12.5, 500, INK2)
    D["file-tree.svg"] = svg(720, 360, "Files and folders", "A folder tree, the parts of a good file name (date, description, version, extension), and a file's path.", b)

    b = text(30, 40, "The 3-2-1 backup rule", 22, 800)
    cols = [("3", "copies of anything important", "the original + two backups"), ("2", "different kinds of storage", "e.g. laptop and a flash drive"),
            ("1", "copy somewhere else", "in the cloud, or away from home")]
    for i, (n, h, s) in enumerate(cols):
        x = 30 + i * 228
        b += box(x, 66, 210, 190, SOFT, LINE) + f'<circle cx="{x + 105}" cy="120" r="34" fill="{GOLD}" stroke="{INK}" stroke-width="1.5"/>'
        b += text(x + 105, 134, n, 36, 800, INK, "middle") + text(x + 105, 190, h, 14, 700, INK, "middle") + text(x + 105, 214, s, 12.5, 500, INK2, "middle")
    b += text(30, 290, "Phones get lost, stolen and dropped. Work that exists in one place is work you can lose.", 14, 600, INK2)
    D["backup-321.svg"] = svg(720, 310, "The 3-2-1 backup rule", "Three copies, on two different kinds of storage, with one kept somewhere else.", b)

    b = text(30, 36, "The parts of a spreadsheet", 20, 800) + DEFS
    b += box(30, 54, 490, 34, SOFT, LINE, 4) + text(42, 76, "fx   =SUM(B2:B5)", 14, 600, INK2)
    cols = ["", "A", "B", "C"]
    for c, name in enumerate(cols):
        x = 30 + (0 if c == 0 else 40 + (c - 1) * 150)
        w = 40 if c == 0 else 150
        b += f'<rect x="{x}" y="100" width="{w}" height="28" fill="#eef1f8" stroke="{LINE}"/>' + text(x + w / 2, 119, name, 13, 700, INK, "middle")
    data = [["Item", "₦", "Note"], ["Bread", "900", ""], ["Eggs", "1,500", ""], ["Rice", "2,400", ""], ["Oil", "1,800", ""], ["Total", "6,600", "←SUM"]]
    for r, row in enumerate(data):
        y = 128 + r * 28
        b += f'<rect x="30" y="{y}" width="40" height="28" fill="#eef1f8" stroke="{LINE}"/>' + text(50, y + 19, str(r + 1), 13, 700, INK, "middle")
        for c, v in enumerate(row):
            x = 70 + c * 150
            sel = (r == 5 and c == 1)
            b += f'<rect x="{x}" y="{y}" width="150" height="28" fill="{"#e8f0fe" if sel else "#fff"}" stroke="{"#1a56c5" if sel else LINE}" stroke-width="{2 if sel else 1}"/>'
            b += text(x + 8, y + 19, v, 13, 700 if r in (0, 5) else 500)
    notes = [(120, "Column = a letter, runs DOWN"), (160, "Row = a number, runs ACROSS"), (200, "Cell = where they meet: B6"), (240, "Formula bar = what the cell holds")]
    for i, (y, s) in enumerate(notes):
        b += f'<circle cx="552" cy="{y - 4}" r="10" fill="{GOLD}" stroke="{INK}"/>' + text(552, y + 1, str(i + 1), 11.5, 800, INK, "middle") + text(570, y, s, 13, 700, INK)
    D["spreadsheet-anatomy.svg"] = svg(860, 310, "The parts of a spreadsheet", "Columns are letters, rows are numbers, a cell is where they meet (B6), and the formula bar shows what a cell calculates.", b)

    b = text(30, 40, "Reading a formula", 22, 800) + DEFS
    parts = [("=", "starts every formula", GOLD), ("SUM", "the function: what to do", TEAL), ("(B2:B5)", "the range: B2 down to B5", "#f6c9bd")]
    x = 60
    for p, s, col in parts:
        w = 40 + len(p) * 26
        b += box(x, 70, w, 70, col, INK, 10) + text(x + w / 2, 117, p, 34, 800, INK, "middle")
        first, _, rest = s.partition(": ")
        b += text(x + w / 2, 166, first, 13, 700, INK, "middle") + (text(x + w / 2, 184, rest, 12.5, 500, INK2, "middle") if rest else "")
        x += w + 70
    b += text(30, 220, "Useful functions:  SUM  AVERAGE  MIN  MAX  COUNT  COUNTIF  ROUND", 15, 700)
    b += text(30, 250, "Copy a formula down and its cell references move with it: B6's =SUM(B2:B5) becomes C6's =SUM(C2:C5).", 13.5, 500, INK2)
    b += text(30, 274, "Put a $ in front to fix one: =B2*$E$1 always uses E1 (an ABSOLUTE reference).", 13.5, 500, INK2)
    D["formula.svg"] = svg(720, 300, "Reading a formula", "Every formula starts with =, then a function such as SUM, then the range of cells it works on in brackets.", b)

    b = text(30, 40, "Strong passwords, and a second lock", 21, 800)
    b += box(30, 62, 320, 150, "#fde3dc", CORAL) + text(46, 92, "Weak", 17, 800, "#8c2a14")
    for i, s in enumerate(["password123", "ada2010", "your name + birthday", "the same one everywhere"]):
        b += text(46, 120 + i * 22, "✗ " + s, 13.5, 600, "#8c2a14")
    b += box(370, 62, 320, 150, "#dff2e4", GREEN) + text(386, 92, "Strong", 17, 800, GREEN)
    for i, s in enumerate(["a passphrase: four random words", "plum-river-kettle-sunday", "a different one for every account", "kept in a password manager"]):
        b += text(386, 120 + i * 22, "✓ " + s, 13.5, 600, GREEN)
    b += box(30, 228, 660, 74) + text(46, 256, "Turn on 2-step verification (2FA):", 15, 800)
    b += text(46, 280, "a code from your phone as well as the password — a stolen password alone no longer opens the account.", 13, 500, INK2)
    D["passwords.svg"] = svg(720, 320, "Strong passwords and 2-step verification", "Weak passwords are short, personal or reused; strong ones are long passphrases, unique per account, with 2-step verification turned on.", b)

    b = text(30, 40, "Sharing a file: who, and how much", 21, 800)
    lv = [("Viewer", "can read it", SOFT), ("Commenter", "can read and suggest", SOFT), ("Editor", "can change and delete", GOLD)]
    for i, (h, s, c) in enumerate(lv):
        x = 30 + i * 228
        b += box(x, 62, 210, 80, c, INK if c == GOLD else LINE) + text(x + 105, 96, h, 17, 800, INK, "middle") + text(x + 105, 120, s, 13, 500, INK2, "middle")
    b += box(30, 160, 320, 120) + text(46, 188, "Specific people", 15, 800) + text(46, 212, "only the emails you add", 13, 500, INK2) + text(46, 236, "✓ the safe default", 13, 700, GREEN)
    b += box(370, 160, 320, 120) + text(386, 188, "Anyone with the link", 15, 800) + text(386, 212, "forwarded links travel far", 13, 500, INK2) + text(386, 236, "never for personal data", 13, 700, "#8c2a14")
    b += text(30, 306, "Give the least access that does the job — viewer unless they must edit.", 14, 600, INK2)
    D["sharing.svg"] = svg(720, 320, "Sharing permissions", "Viewer, commenter and editor access, and the difference between sharing with specific people and with anyone who has the link.", b)

    rows = [(".docx / .odt", "a document you will keep editing"), (".xlsx / .ods", "a spreadsheet, with its formulas"), (".csv", "plain table data — any app can open it"),
            (".pdf", "a finished page that looks the same everywhere"), (".jpg", "photos (small, slightly lossy)"), (".png", "screenshots, logos, sharp edges"), (".mp4", "video")]
    b = text(30, 40, "File types: pick the one for the job", 21, 800)
    for i, (e, s) in enumerate(rows):
        y = 60 + i * 38
        b += box(30, y, 150, 30, GOLD if e == ".pdf" else SOFT, INK if e == ".pdf" else LINE, 6) + text(105, y + 20, e, 14, 800, INK, "middle")
        b += text(196, y + 20, s, 14, 500)
    D["file-formats.svg"] = svg(720, 340, "Common file types", "Documents, spreadsheets, CSV, PDF, JPG, PNG and MP4, and what each one is for.", b)

    steps = [("Stop", "Do I know this site or person?"), ("Investigate", "Who made it? When? Why?"), ("Find better", "What do other trusted sources say?"), ("Trace", "Go back to the original data or quote")]
    b = text(30, 40, "Before you believe or share it: S·I·F·T", 21, 800) + DEFS
    for i, (h, s) in enumerate(steps):
        x = 30 + i * 172
        b += box(x, 64, 156, 110, GOLD if i == 0 else SOFT, INK if i == 0 else LINE) + text(x + 78, 100, h, 16, 800, INK, "middle")
        words, line, lines = s.split(), "", []
        for w in words:
            if len(line + " " + w) > 20: lines.append(line); line = w
            else: line = (line + " " + w).strip()
        lines.append(line)
        for j, l in enumerate(lines): b += text(x + 78, 128 + j * 18, l, 12.5, 500, INK2, "middle")
        if i < 3: b += arrow(x + 158, 119, x + 170, 119)
    b += text(30, 210, "A screenshot is not a source. A number with no source, date or link is a claim, not a fact.", 14, 600, INK2)
    D["sift.svg"] = svg(720, 230, "Checking a source: SIFT", "Stop, investigate the source, find better coverage, and trace claims back to the original.", b)
    keys = [("Ctrl+C", "copy"), ("Ctrl+X", "cut"), ("Ctrl+V", "paste"), ("Ctrl+Z", "undo"), ("Ctrl+Y", "redo"),
            ("Ctrl+S", "save"), ("Ctrl+F", "find"), ("Ctrl+A", "select all"), ("Ctrl+P", "print"), ("Alt+Tab", "switch window")]
    b = text(30, 40, "Ten shortcuts every computer user should know", 20, 800)
    for i, (k, s) in enumerate(keys):
        x, y = 30 + (i % 5) * 134, 66 + (i // 5) * 104
        b += box(x, y, 120, 54, GOLD if k in ("Ctrl+Z", "Ctrl+S") else SOFT, INK, 9) + text(x + 60, y + 34, k, 17, 800, INK, "middle")
        b += text(x + 60, y + 78, s, 13.5, 600, INK2, "middle")
    b += text(30, 290, "On a Mac use Cmd instead of Ctrl. Undo (Ctrl+Z) and Save (Ctrl+S) rescue the most work.", 13.5, 600, INK2)
    D["shortcuts.svg"] = svg(720, 310, "Ten everyday keyboard shortcuts", "Copy, cut, paste, undo, redo, save, find, select all, print and switch window, with their key combinations.", b)
    return D


WIN = """body{margin:0;background:#e9ecf3;font:14px/1.4 Inter,'Segoe UI',Arial,sans-serif;color:#16233f;padding:14px}
.w{background:#fff;border:1px solid #c9cedb;border-radius:10px;overflow:hidden;width:612px}
.t{display:flex;gap:6px;align-items:center;padding:8px 12px;background:#f3f5fa;border-bottom:1px solid #c9cedb;font-weight:700}
.d{width:10px;height:10px;border-radius:50%;background:#c9cedb}.k{color:#3d4560}
table{border-collapse:collapse}td,th{border:1px solid #c9cedb;padding:5px 9px;text-align:left}th{background:#eef1f8}
.sel{outline:2px solid #1a56c5;outline-offset:-2px;background:#e8f0fe}.btn{display:inline-block;padding:6px 12px;border-radius:7px;border:1px solid #c9cedb;font-weight:700}
.pri{background:#1a56c5;color:#fff;border-color:#1a56c5}.call{background:#f5b026;color:#16233f;font-weight:800;border-radius:6px;padding:2px 7px;font-size:12px}"""


def head(title):
    return f'<!doctype html><meta charset=utf-8><style>{WIN}</style><div class=w><div class=t><span class=d></span><span class=d></span><span class=d></span>&nbsp;{title}</div>'


def shots():
    S = {}
    rows = "".join(f'<tr><td>{"📁" if f else "📄"} {n}</td><td class=k>{t}</td><td class=k>{s}</td></tr>' for n, t, s, f in [
        ("Data Appreciation", "Folder", "", 1), ("2026-03-14_lunch-survey_v2.xlsx", "Spreadsheet", "18 KB", 0), ("2026-03-14_lunch-chart.png", "PNG image", "96 KB", 0),
        ("2026-03-21_survey-report.pdf", "PDF document", "240 KB", 0), ("photo_0412.jpg", "JPG image", "3.1 MB", 0)])
    S["file-manager"] = head("Files — Documents › Club") + f"""<div style="display:flex"><div style="width:150px;border-right:1px solid #c9cedb;padding:10px;background:#fafbfd">
<b>Places</b><br>🏠 Home<br><b style="background:#e8f0fe">📁 Documents</b><br>📁 Downloads<br>📁 Pictures<br>☁ Cloud drive<br>💾 USB drive</div>
<div style="padding:10px;flex:1"><div class=k style="margin-bottom:8px">Path: Documents › Club &nbsp; <span class=call>1</span></div>
<table style="width:100%"><tr><th>Name <span class=call>2</span></th><th>Type <span class=call>3</span></th><th>Size</th></tr>{rows}</table>
<p class=k style="margin:8px 0 0">1 the path · 2 names start with the date, so they sort · 3 the type comes from the extension</p></div></div></div>"""

    S["sheets-sum"] = head("Shopping budget — spreadsheet") + """<div style="padding:6px 12px;border-bottom:1px solid #c9cedb;font-family:monospace">fx &nbsp;=SUM(B2:B5)</div>
<table><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr>
<tr><th>1</th><td><b>Item</b></td><td><b>Mon ₦</b></td><td><b>Tue ₦</b></td><td><b>Wed ₦</b></td></tr>
<tr><th>2</th><td>Bread</td><td>900</td><td>900</td><td>1,000</td></tr><tr><th>3</th><td>Eggs</td><td>1,500</td><td>0</td><td>1,500</td></tr>
<tr><th>4</th><td>Rice</td><td>2,400</td><td>0</td><td>0</td></tr><tr><th>5</th><td>Transport</td><td>600</td><td>600</td><td>600</td></tr>
<tr><th>6</th><td><b>Total</b></td><td class=sel>5,400</td><td style="background:#fff4d6">1,500</td><td style="background:#fff4d6">3,100</td></tr></table>
<p class=k style="margin:8px 12px">B6 holds <b>=SUM(B2:B5)</b>. Dragging its corner handle right fills C6 and D6 with =SUM(C2:C5) and =SUM(D2:D5) — the references move with it.</p></div>"""

    S["sheets-sort-filter"] = head("Lunch survey — filter on") + """<table><tr><th></th><th>A</th><th>B ▾</th><th>C ▾ <span class=call>filter</span></th></tr>
<tr><th>1</th><td><b>Name</b></td><td><b>Age</b></td><td><b>Favourite</b></td></tr>
<tr><th>3</th><td>Tobi</td><td>12</td><td>Jollof</td></tr><tr><th>5</th><td>Ngozi</td><td>13</td><td>Jollof</td></tr><tr><th>8</th><td>Efe</td><td>15</td><td>Jollof</td></tr></table>
<div style="display:flex;gap:16px;padding:10px 12px"><div style="border:1px solid #c9cedb;border-radius:8px;padding:8px 10px;width:220px">
<b>Filter by values — Favourite</b><br>☑ Jollof<br>☐ Amala<br>☐ Fried rice<br>☐ Suya</div>
<p class=k style="margin:0">Row numbers jump (3, 5, 8): the other rows are <b>hidden, not deleted</b>. Turn the filter off and every row is back. Sorting uses <b>Data → Sort range</b> on the WHOLE table, so each row stays together.</p></div></div>"""

    S["share-dialog"] = head('Share "lunch-survey"') + """<div style="padding:14px">
<div style="border:1px solid #c9cedb;border-radius:8px;padding:8px 10px;margin-bottom:10px" class=k>Add people by email</div>
<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eef1f8"><span>You (owner)</span><span class=k>Owner</span></div>
<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eef1f8"><span>Instructor</span><span>Editor ▾ <span class=call>1</span></span></div>
<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eef1f8"><span>Team partner</span><span>Commenter ▾</span></div>
<p style="margin:12px 0 4px"><b>General access</b> <span class=call>2</span></p>
<div style="display:flex;justify-content:space-between"><span>🔒 Restricted — only people added above</span><span class=k>change</span></div>
<div style="margin-top:14px;text-align:right"><span class=btn>Copy link</span> <span class="btn pri">Done</span></div>
<p class=k style="margin:10px 0 0">1 each person gets only the access they need · 2 keep it Restricted for anything with names, phones or marks</p></div></div>"""

    S["dtp-editor"] = head("Design editor — A5 flyer, 148 × 210 mm") + """<div style="display:flex;height:330px">
<div style="width:120px;border-right:1px solid #c9cedb;padding:10px;background:#fafbfd;line-height:2"><b>Tools</b><br>T Text<br>▢ Shapes<br>🖼 Photos<br>⊞ Grid<br>🎨 Colours</div>
<div style="flex:1;background:#dfe3ec;display:flex;align-items:center;justify-content:center;position:relative">
<div style="width:158px;height:224px;background:#fff;position:relative;box-shadow:0 1px 4px #0003;padding:12px;box-sizing:border-box;outline:1px dashed #20b2c9;outline-offset:-8px">
<div style="font:800 17px Arial">Saturday Showcase</div><div style="font:600 9px Arial;color:#3d4560;margin:2px 0 8px">Music, code and art</div>
<div style="height:62px;background:#c9e9ef;margin-bottom:8px"></div><div style="background:#f5b026;font:800 9px Arial;padding:5px">Sat 14 March · 11am · Free</div></div>
<span class=call style="position:absolute;top:24px;left:12px">dashed = safe area</span></div>
<div style="width:150px;border-left:1px solid #c9cedb;padding:10px;font-size:12.5px"><b>Text</b><br>Font: Arial<br>Size: 24 pt<br>Weight: Bold<br>Colour: #16233f<br><br><b>Position</b><br>X 12 mm · Y 12 mm<br><span class=k>snaps to the grid</span></div></div></div>"""

    S["dtp-document-setup"] = head("Document setup — new document") + """<div style="padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px 22px">
<div><b>Page size</b><br>A4 — 210 × 297 mm</div><div><b>Orientation</b><br>◉ Portrait &nbsp; ○ Landscape</div>
<div><b>Margins</b><br>Top 15 · Bottom 15 · Inside 15 · Outside 15 mm</div><div><b>Columns</b><br>3, gutter 5 mm</div>
<div><b>Bleed</b> <span class=call>3 mm</span><br>Top 3 · Bottom 3 · Left 3 · Right 3 mm</div><div><b>Colour</b><br>CMYK for print</div>
<div><b>Facing pages</b><br>☑ for a newsletter or magazine</div><div><b>Units</b><br>millimetres</div>
<div style="grid-column:1/3;text-align:right"><span class=btn>Cancel</span> <span class="btn pri">Create</span></div></div></div>"""

    S["dtp-pdf-export"] = head("Export — PDF for print") + """<div style="padding:14px;line-height:1.9">
<b>Format</b>: PDF (print) — PDF/X recommended by most print shops<br>
☑ <b>Include bleed</b> (3 mm, from document setup) <span class=call>1</span><br>
☑ <b>Crop marks</b> — show the printer where to cut<br>
☑ <b>Embed all fonts</b> <span class=call>2</span><br>
<b>Images</b>: keep full resolution (300 ppi) <span class=call>3</span><br>
<b>Colour</b>: CMYK<br>
<b>File name</b>: 2026-03-14_showcase-flyer_A5_v3.pdf
<div style="text-align:right"><span class=btn>Cancel</span> <span class="btn pri">Export</span></div>
<p class=k style="margin:6px 0 0;line-height:1.4">1 no white edges after cutting · 2 your fonts print as you chose them · 3 sharp photos, not screen-quality</p></div></div>"""

    S["dtp-styles"] = head("Newsletter — paragraph styles") + """<div style="display:flex">
<div style="width:200px;border-right:1px solid #c9cedb;padding:10px;background:#fafbfd;line-height:1.9;font-size:13px"><b>Styles</b><br>
<span style="font:800 16px Arial">Headline</span> — 22 pt bold<br><span style="font:700 13px Arial">Subheading</span> — 14 pt<br>
<span style="background:#e8f0fe;padding:0 4px">Body</span> — 10.5 pt, 1.4 lines<br><span style="font:italic 11px Georgia">Caption</span> — 9 pt italic<br>
<span class=k>Edit a style → every paragraph using it changes</span></div>
<div style="padding:12px;flex:1;font-family:Georgia"><div style="font:800 20px Arial">Junior band takes the stage</div>
<div style="font:700 12px Arial;color:#3d4560;margin:4px 0 8px">Twelve members, eight weeks</div>
<div style="columns:2;column-gap:14px;font-size:12px;line-height:1.45">Eight Saturdays ago most of them had never held a drumstick. On the 14th the junior band opened the showcase with two songs. "We practised the hard bar until it was boring," said the drummer.</div>
<div style="font:italic 10px Georgia;color:#3d4560;margin-top:8px">Photo: the junior band, by a Club member (with consent)</div></div></div></div>"""
    return S
