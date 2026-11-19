"""
Diagrams for Practical Coding — Full Stack Web Developer (api/_lib/seeds/curriculum-practical-coding-2026.json).

Each entry names the lesson (course, week, position), the file, the alt text — which the lesson viewer also shows
as the figure's caption, so it states the information rather than the look — and an ANCHOR: a phrase from the
paragraph the picture explains. The picture goes directly after that paragraph (spatial contiguity).
Every piece of code drawn here is the lesson's own code or a correct fragment of it.
"""
from tech_draw import (W, INK, INK2, LINE, SOFT, WHITE, GOLD, TEAL, CORAL, GREEN, GOLD_T, TEAL_T, CORAL_T, GREEN_T,
                       TEAL_D, CORAL_D, t, rect, fit, tb, arr, path, line, circle, badge, diamond, code, svg, heading)

FIGS = []


def fig(week, pos, name, alt, anchor, title=None):
    def deco(fn):
        FIGS.append(dict(course="Coding", week=week, pos=pos, name=name, alt=alt, anchor=anchor, title=title or alt, fn=fn))
        return fn
    return deco


M = 10.8   # advance of one monospace character at 18px (0.6em)


@fig(1, 1, "web-journey.svg", "Loading a page: the browser asks a DNS server where the name is and gets an IP address, sends that server an HTTP request, gets back a status code and the HTML, then draws the page.",
     "When you type an address")
def _():
    b = heading("What happens when you open a page")
    b += tb(20, 56, 150, 250, [("Browser", 18, 800), ("on your phone", 16, 500, INK2), "", ("5. reads the", 16, 500), ("HTML and", 16, 500), ("draws the page", 16, 500)], fill=GOLD_T, stroke=INK2)
    b += tb(470, 56, 150, 92, [("DNS server", 18, 800), ("names → numbers", 16, 500, INK2)])
    b += tb(470, 176, 150, 130, [("Web server", 18, 800), ("holds the site", 16, 500, INK2)])
    for y, lab, right in [(96, "1. Where is nextgengenius.ng?", True), (134, "2. At 203.0.113.7", False),
                          (222, "3. HTTP request: GET /", True), (268, "4. 200 OK + the HTML", False)]:
        b += arr(174, y, 464, y) if right else arr(464, y, 174, y)
        b += t(319, y - 9, lab, 16, 600, INK, "middle")
    b += t(95, 338, "front end", 16, 700, TEAL_D, "middle") + t(545, 338, "back end", 16, 700, TEAL_D, "middle")
    b += t(320, 338, "what is drawn  ·  what is sent", 16, 500, INK2, "middle")
    return svg(356, "How a web page loads", "Browser, DNS server and web server exchange four messages; then the browser draws the page.", b)


@fig(1, 2, "element-anatomy.svg", "An HTML element: an opening tag (which can carry attributes written name=\"value\"), the content, and a closing tag with a slash.",
     "`<h1>` is the main heading")
def _():
    s = '<a href="https://freecodecamp.org">Practise</a>'
    x0, y = 66, 150
    b = heading("The parts of an element")
    b += rect(x0 - 14, y - 30, len(s) * M + 28, 46, SOFT, LINE, 8)
    b += fit(x0 - 14, y - 30, len(s) * M + 28, 46, t(x0, y, s, 18, 600, INK, mono=True, bg=SOFT))
    def br(i, j, up, label, col=INK):
        xa, xb = x0 + i * M + 1, x0 + (j + 1) * M - 1
        yy = y - 40 if up else y + 26
        tick = -8 if up else 8
        out = path(f"M{xa:g} {yy - tick:g} V{yy:g} H{xb:g} V{yy - tick:g}", INK2, sw=2, head=False)
        return out + t((xa + xb) / 2, yy - 10 if up else yy + 24, label, 16, 700, col, "middle")
    b += br(3, 6, True, "attribute") + br(8, 33, True, "its value") + br(43, 46, True, "closing tag")
    b += br(0, 34, False, "opening tag") + br(35, 42, False, "content", TEAL_D)
    b += t(20, 250, 'Attributes go inside the opening tag, as name="value".', 16, 500, INK2)
    b += t(20, 276, "The closing tag repeats the name with a slash: </a>.", 16, 500, INK2)
    return svg(296, "Anatomy of an HTML element", "A link element split into opening tag, attribute, value, content and closing tag.", b)


@fig(1, 3, "nesting.svg", "Nesting: elements close in the reverse order they opened, like boxes inside boxes. <p><a>…</a></p> is right; <p><a>…</p></a> crosses the boxes and is broken.",
     "**Nesting** means putting")
def _():
    b = heading("Close in the reverse order you opened")
    b += rect(20, 60, 290, 170, GREEN_T, GREEN, 10) + t(36, 86, "Right", 18, 800, GREEN, bg=GREEN_T)
    b += tb(40, 102, 250, 110, [], fill=WHITE, stroke=INK2, shadow=False)
    b += t(52, 126, "<p>", 16, 700, INK, mono=True) + t(278, 200, "</p>", 16, 700, INK, "end", mono=True)
    b += rect(76, 138, 178, 40, GOLD_T, INK2, 6, shadow=False) + fit(76, 138, 178, 40, t(165, 164, "<a>…</a>", 16, 700, INK, "middle", mono=True, bg=GOLD_T))
    b += rect(330, 60, 290, 170, CORAL_T, CORAL_D, 10) + t(346, 86, "Broken", 18, 800, CORAL_D, bg=CORAL_T)
    b += rect(350, 102, 180, 110, WHITE, INK2, 10, shadow=False) + rect(420, 136, 180, 60, GOLD_T, INK2, 6, shadow=False)
    b += t(362, 126, "<p>", 16, 700, INK, mono=True) + t(434, 162, "<a>…</p>", 16, 700, INK, mono=True, bg=GOLD_T)
    b += t(590, 188, "</a>", 16, 700, INK, "end", mono=True, bg=GOLD_T)
    b += t(20, 262, "The inner box must end before the outer one does.", 16, 500, INK2)
    return svg(282, "Nesting HTML elements", "Correctly nested boxes beside crossed, broken ones.", b)


@fig(2, 1, "page-skeleton.svg", "The skeleton of every page: <html> holds a <head> with information about the page that is not shown (charset, viewport, title, stylesheet link) and a <body> with everything the visitor sees.",
     "`<!DOCTYPE html>` tells the browser")
def _():
    b = heading("Every page: a head and a body")
    b += tb(220, 54, 200, 46, ["<html lang=\"en\">"], fill=GOLD_T, stroke=INK2)
    b += path("M300 102 V120 H130 V138", INK2) + path("M340 102 V120 H500 V138", INK2)
    rows = ["<meta charset>", "<meta viewport>", "<title>", "<link stylesheet>"]
    b += tb(20, 140, 220, 46, [("<head>", 18, 800)], fill=SOFT)
    for i, r in enumerate(rows):
        b += tb(40, 198 + i * 44, 200, 36, [(r, 16, 600)], fill=WHITE, shadow=False)
    b += tb(380, 140, 240, 46, [("<body>", 18, 800)], fill=SOFT)
    b += tb(400, 198, 220, 36, [("<h1>, <p>, <img>…", 16, 600)], fill=WHITE, shadow=False)
    b += t(130, 392, "about the page: not shown", 16, 700, CORAL_D, "middle")
    b += t(500, 262, "what the visitor sees", 16, 700, GREEN, "middle")
    return svg(410, "HTML page skeleton", "A tree: html contains head (meta, title, link) and body (the visible content).", b)


@fig(2, 2, "semantic-layout.svg", "A page built from semantic elements: header at the top, nav for the main links, main holding a section and an article, an aside for related notes, and a footer at the bottom.",
     "- `<footer>`")
def _():
    b = heading("A page described by what each part is")
    b += tb(20, 54, 600, 50, ["<header> logo and title"], fill=GOLD_T, stroke=INK2)
    b += tb(20, 112, 600, 44, ["<nav> the main links"])
    b += rect(20, 164, 410, 186, WHITE, INK2, 10) + t(36, 190, "<main> — one per page", 16, 800)
    b += tb(36, 204, 378, 60, ["<section> with its own heading"], fill=TEAL_T, shadow=False)
    b += tb(36, 274, 378, 60, ["<article> makes sense alone"], fill=TEAL_T, shadow=False)
    b += tb(442, 164, 178, 186, ["<aside>", ("related,", 16, 500, INK2), ("not central", 16, 500, INK2)])
    b += tb(20, 360, 600, 44, ["<footer> contact, copyright"])
    return svg(420, "Semantic page layout", "Header, nav, main with section and article, aside, footer.", b)


@fig(2, 3, "git-add-commit-push.svg", "The everyday Git loop: git add puts a change in the staging area, git commit saves a snapshot with a message in your history, git push sends your commits to GitHub.",
     "The everyday loop has three steps")
def _():
    b = heading("Three commands, three places")
    xs = [20, 230, 440]
    names = [("Your folder", "files you edit"), ("Staging area", "the next snapshot"), ("Your history", "saved commits")]
    for x, (h, s) in zip(xs, names):
        b += tb(x, 70, 180, 90, [(h, 18, 800), (s, 16, 500, INK2)])
    b += arr(202, 115, 226, 115) + arr(412, 115, 436, 115)
    b += t(214, 196, "git add", 16, 700, INK, "middle", mono=True) + t(426, 196, "git commit", 16, 700, INK, "middle", mono=True)
    b += path("M530 162 V230 H400", INK2)
    b += tb(200, 206, 196, 64, [("GitHub", 18, 800), ("online copy", 16, 500, INK2)], fill=GOLD_T, stroke=INK2)
    b += t(468, 254, "git push", 16, 700, INK, "middle", mono=True)
    b += t(20, 306, "Commit small and often; never commit passwords or keys.", 16, 500, INK2)
    return svg(324, "git add, commit, push", "Folder to staging to history to GitHub.", b)


@fig(3, 1, "label-for-id.svg", "A label is tied to its input when the label's for matches the input's id; the input's name is the key its value is sent under, for example email=ada@example.org.",
     "The `for` on the label matches")
def _():
    b = heading("for ↔ id ties the label to the field")
    c1, h1 = code(20, 56, 600, [[('<label ', INK), ('for="email"', TEAL_D, 800), ('>Email</label>', INK)],
                                  [('<input ', INK), ('id="email"', TEAL_D, 800), (' ', INK), ('name="email"', CORAL_D, 800), (' type="email">', INK)]])
    b += c1
    b += tb(20, 170, 290, 92, [("Same word, so:", 16, 800), ("the label is read aloud", 16, 500), ("and tapping it focuses", 16, 500)], fill=TEAL_T, a="start")
    b += tb(330, 170, 290, 92, [("name is the key sent:", 16, 800), ("email=ada@example.org", 16, 600, INK)], fill=CORAL_T, a="start")
    return svg(280, "Label for and input id", "Code with for and id matched, and name as the key sent.", b)


@fig(3, 2, "table-anatomy.svg", "Parts of a table: a caption names it, th cells with scope=\"col\" head the columns, th with scope=\"row\" head each row, and td cells hold the data — so a screen reader can say \"11:00, Class: Coding\".",
     "`<tr>` is a row")
def _():
    b = heading("A table that a screen reader can read")
    b += t(20, 72, "<caption> Saturday timetable", 16, 700, INK2)
    cols = ["Time", "Class", "Room"]
    data = [["10:00", "Chess", "Hall"], ["11:00", "Coding", "Lab 1"]]
    x0, y0, cw, rh = 20, 86, 150, 44
    for j, c in enumerate(cols):
        b += tb(x0 + j * cw, y0, cw, rh, [c], fill=GOLD_T, stroke=INK2, r=0, shadow=False)
    for i, r in enumerate(data):
        for j, c in enumerate(r):
            hd = j == 0
            b += tb(x0 + j * cw, y0 + (i + 1) * rh, cw, rh, [c], fill=TEAL_T if hd else WHITE, stroke=INK2 if hd else LINE, r=0, shadow=False, wt=700 if hd else 500)
    b += t(480, 112, "th scope=\"col\"", 16, 700, INK, mono=True)
    b += t(480, 156, "th scope=\"row\"", 16, 700, TEAL_D, mono=True)
    b += t(480, 200, "td: the data", 16, 700, INK2, mono=True)
    b += rect(20, 238, 600, 48, SOFT, LINE, 8) + fit(20, 238, 600, 48, t(320, 268, "Heard as: “11:00, Class: Coding”", 16, 700, INK, "middle", bg=SOFT))
    return svg(302, "Table anatomy", "Column headings, row headings and data cells.", b)


@fig(4, 1, "github-pages.svg", "GitHub Pages turns each file in the repository into an address: index.html at the top is the home page, and paths must match exactly, capitals included — Photo.JPG is not photo.jpg.",
     "Three things that commonly go wrong")
def _():
    b = heading("Each file in the repo becomes an address")
    files = [("index.html", "…github.io/my-first-site/"), ("styles.css", "…/my-first-site/styles.css"), ("images/me.jpg", "…/my-first-site/images/me.jpg")]
    for i, (f, u) in enumerate(files):
        y = 60 + i * 56
        b += tb(20, y, 180, 42, [f], fill=GOLD_T if i == 0 else SOFT, stroke=INK2 if i == 0 else LINE, wt=700)
        b += arr(204, y + 21, 236, y + 21) + t(244, y + 27, u, 16, 500, INK, mono=False)
    b += tb(20, 238, 600, 76, [("Online, capitals matter:", 16, 800, CORAL_D), ("Photo.JPG and photo.jpg are two different files.", 16, 500)], fill=CORAL_T, a="start")
    return svg(330, "GitHub Pages addresses", "Repository files mapped to web addresses.", b)


@fig(4, 2, "css-rule-anatomy.svg", "A CSS rule: a selector picks the elements, then declarations in braces, each a property and a value. h1 picks every h1, .card every element with class card, #site-title the one element with that id.",
     "The three selectors you will use most")
def _():
    b = heading("The parts of a CSS rule")
    s = ".card { padding: 16px; }"
    x0, y = 110, 110
    b += rect(x0 - 14, y - 30, len(s) * M + 28, 46, SOFT, LINE, 8) + fit(x0 - 14, y - 30, len(s) * M + 28, 46, t(x0, y, s, 18, 600, INK, mono=True, bg=SOFT))
    def br(i, j, label, col=INK, up=False):
        xa, xb = x0 + i * M + 1, x0 + (j + 1) * M - 1
        yy = y - 40 if up else y + 26
        tk = -8 if up else 8
        return path(f"M{xa:g} {yy - tk:g} V{yy:g} H{xb:g} V{yy - tk:g}", INK2, sw=2, head=False) + t((xa + xb) / 2, yy - 10 if up else yy + 24, label, 16, 700, col, "middle")
    b += br(0, 4, "selector", TEAL_D) + br(8, 14, "property") + br(17, 20, "value") + br(7, 21, "declaration", up=True)
    rows = [("h1", "every <h1>"), (".card", "every class=\"card\""), ("#site-title", "the one id=\"site-title\"")]
    for i, (sel, means) in enumerate(rows):
        y2 = 196 + i * 44
        b += tb(20, y2, 170, 36, [(sel, 16, 700)], fill=TEAL_T, shadow=False) + t(206, y2 + 24, "picks " + means, 16, 500)
    return svg(340, "CSS rule anatomy", "Selector, property and value, and the three kinds of selector.", b)


@fig(4, 3, "shorthand-clockwise.svg", "Four values go clockwise from the top: margin: 8px 16px 4px 0 means top 8px, right 16px, bottom 4px, left 0. Two values (8px 16px) mean top-and-bottom, then left-and-right.",
     "Shorthand saves typing")
def _():
    b = heading("Four values go clockwise from the top")
    b += t(320, 74, "margin: 8px 16px 4px 0;", 18, 700, INK, "middle", mono=True)
    b += tb(220, 130, 200, 100, [("the box", 16, 700)], fill=GOLD_T, stroke=INK2)
    b += t(320, 118, "1  top 8px", 16, 700, INK, "middle")
    b += t(432, 186, "2  right 16px", 16, 700)
    b += t(320, 258, "3  bottom 4px", 16, 700, INK, "middle")
    b += t(208, 186, "4  left 0", 16, 700, INK, "end")
    b += t(20, 300, "Two values: margin: 8px 16px → top and bottom 8px,", 16, 500, INK2)
    b += t(20, 324, "left and right 16px.", 16, 500, INK2)
    return svg(342, "CSS shorthand order", "Top, right, bottom, left around a box.", b)


@fig(5, 1, "specificity.svg", "Specificity is a score of ids, classes and elements: p is 0-0-1, .intro is 0-1-0, p.intro is 0-1-1, so p.intro wins. A tie goes to the rule written later.",
     "Some properties are **inherited**")
def _():
    b = heading("Who wins? Count ids, then classes, then elements")
    rows = [("p", "0-0-1", "black", False), (".intro", "0-1-0", "navy", False), ("p.intro", "0-1-1", "teal — wins", True)]
    b += t(240, 70, "ids-classes-elements", 16, 700, INK2, "middle")
    for i, (sel, sc, col, win) in enumerate(rows):
        y = 84 + i * 56
        f = GOLD_T if win else SOFT
        b += tb(20, y, 150, 44, [(sel, 16, 700)], fill=f, stroke=INK2 if win else LINE)
        b += tb(190, y, 100, 44, [(sc, 18, 800)], fill=f, stroke=INK2 if win else LINE)
        b += t(310, y + 28, "color: " + col, 16, 700 if win else 500, GREEN if win else INK2)
    b += tb(20, 262, 600, 64, [("A tie? The rule written LATER wins.", 16, 700), ("!important beats both — avoid it.", 16, 500, INK2)], a="start")
    return svg(342, "CSS specificity", "Three selectors and their specificity scores.", b)


@fig(5, 2, "box-model.svg", "The box model from the inside out: content, padding, border, margin. With the default sizing, width: 300px plus 20px padding each side and a 2px border each side takes 344px; box-sizing: border-box makes it 300px in total.",
     "Most developers put this at the top")
def _():
    b = heading("Content, padding, border, margin")
    b += rect(20, 56, 600, 250, WHITE, INK2, 6, sw=1.5, dash="6 5", shadow=False) + t(36, 80, "margin (always transparent)", 16, 600, INK2)
    b += rect(60, 96, 520, 176, INK2, INK2, 4, shadow=False)
    b += rect(66, 102, 508, 164, TEAL_T, TEAL_T, 2, shadow=False) + t(82, 128, "padding (takes the background)", 16, 600, INK, bg=TEAL_T)
    b += tb(140, 146, 360, 80, [("content", 18, 800), ("width: 300px", 16, 600, INK)], fill=GOLD_T, stroke=INK2, shadow=False)
    b += t(320, 292, "border", 16, 700, INK, "middle")
    b += t(20, 340, "Default: 2 + 20 + 300 + 20 + 2 = 344px wide.", 16, 700)
    b += t(20, 366, "box-sizing: border-box → the whole box is 300px.", 16, 500, INK2)
    return svg(384, "The CSS box model", "Nested rectangles: margin, border, padding, content, and the width sum.", b)


@fig(5, 3, "contrast-ratio.svg", "Contrast ratio runs from 1:1 (same colour) to 21:1 (black on white). Normal text needs at least 4.5:1, large text 3:1: dark navy on white passes easily, mid grey on white only just, light grey on white fails.",
     "Colour must also be **readable**")
def _():
    from tech_draw import contrast
    b = heading("Is the text colour readable on its background?")
    b += line(40, 120, 600, 120, INK2, 3)
    marks = [(1, "1:1"), (3, "3:1"), (4.5, "4.5:1"), (7, "7:1"), (21, "21:1")]
    import math
    X = lambda r: 40 + math.log(r) / math.log(21) * 560
    for r, lab in marks:
        b += line(X(r), 110, X(r), 130, INK2, 2) + t(X(r), 154, lab, 16, 700, INK, "middle")
    b += rect(X(4.5), 84, X(21) - X(4.5), 18, GREEN_T, GREEN, 4, shadow=False) + t(X(4.5) + 8, 78, "normal text: 4.5:1 or more", 16, 700, GREEN)
    sw = [("#16233f", "navy"), ("#767676", "mid grey"), ("#c9cedb", "light grey")]
    for i, (c, name) in enumerate(sw):
        x = 30 + i * 200
        r = contrast(c, "#ffffff")
        b += rect(x, 186, 180, 64, WHITE, LINE, 8) + f'<rect x="{x + 16}" y="202" width="148" height="12" rx="3" fill="{c}"/><rect x="{x + 16}" y="222" width="100" height="12" rx="3" fill="{c}"/>'
        b += t(x + 90, 276, f"{name} {r:.1f}:1", 16, 700, INK, "middle")
        b += t(x + 90, 300, "pass" if r >= 4.5 else "fail", 16, 800, GREEN if r >= 4.5 else CORAL_D, "middle")
    b += t(20, 330, "The bars stand for lines of text in each colour on white.", 16, 500, INK2)
    return svg(348, "Colour contrast ratio", "A contrast scale and three text colours on white.", b)


@fig(6, 1, "mobile-first.svg", "Mobile first: the base CSS is one column for phones; a media query at 640px wide adds two columns, and another at 1024px makes four.",
     "Why small first?")
def _():
    b = heading("Start with the phone, add columns as room grows")
    def dev(x, w, h, cols, lab, sub):
        o = rect(x, 60, w, h, WHITE, INK2, 10)
        cw = (w - 16 - (cols - 1) * 6) / cols
        for c in range(cols):
            for r in range(3 if cols < 4 else 2):
                o += f'<rect x="{x + 8 + c * (cw + 6):.1f}" y="{72 + r * 34}" width="{cw:.1f}" height="28" rx="4" fill="{TEAL_T}" stroke="{TEAL}"/>'
        return o + t(x + w / 2, 60 + h + 26, lab, 16, 800, INK, "middle") + t(x + w / 2, 60 + h + 48, sub, 16, 500, INK2, "middle")
    b += dev(20, 90, 150, 1, "phone", "base CSS")
    b += dev(150, 180, 120, 2, "≥ 640px", "2 columns")
    b += dev(370, 250, 90, 4, "≥ 1024px", "4 columns")
    b += arr(116, 140, 144, 140) + arr(336, 120, 364, 120)
    return svg(270, "Mobile-first media queries", "Three screens: one, two and four columns.", b)


@fig(6, 2, "flex-axes.svg", "Flexbox has a main axis, the direction items flow (left to right for a row), and a cross axis at right angles to it: justify-content places items along the main axis, align-items across it.",
     "Two words unlock everything")
def _():
    b = heading("display: flex — two axes")
    b += rect(80, 70, 480, 170, SOFT, INK2, 10)
    for i, h in enumerate([60, 100, 76]):
        x = 110 + i * 160
        b += tb(x, 155 - h / 2, 100, h, [f"item {i + 1}"], fill=GOLD_T, stroke=INK2, shadow=False)
    b += arr(84, 270, 556, 270, INK2, sw=3) + t(320, 298, "main axis → justify-content", 16, 700, INK, "middle")
    b += arr(50, 74, 50, 236, INK2, sw=3)
    b += f'<text x="34" y="155" font-size="16" font-weight="700" fill="{INK}" text-anchor="middle" transform="rotate(-90 34 155)">cross axis</text>'
    b += t(592, 160, "align-", 16, 700, INK, "middle") + t(592, 180, "items", 16, 700, INK, "middle")
    b += t(20, 330, "flex-direction: column swaps them: main runs down.", 16, 500, INK2)
    return svg(348, "Flexbox main and cross axis", "Three items in a row with the two axes marked.", b)


@fig(6, 3, "type-scale.svg", "Readable type: body text at 16px with a line height of about 1.5 and lines of 45–75 characters; headings step up a clear scale such as 20, 24, 32 and 40px (1.25 to 2.5rem).",
     "Typography is most of a page's design")
def _():
    b = heading("A clear scale, a comfortable line", size=20)
    sizes = [(40, "2.5rem"), (32, "2rem"), (24, "1.5rem"), (20, "1.25rem"), (16, "1rem — body")]
    y = 56
    for s, lab in sizes:
        y += s * 1.15
        b += t(20, y, "Aa", s, 800) + t(110, y, f"{lab}  ({s}px)", 16, 500, INK2)
        y += 8
    b += rect(330, 60, 290, 210, SOFT, LINE, 8)
    for i in range(6):
        b += f'<rect x="346" y="{80 + i * 24}" width="{258 if i < 5 else 150}" height="8" rx="4" fill="{INK2}"/>'
    b += path("M346 236 H604", INK2, sw=2) + t(475, 260, "45–75 characters a line", 16, 700, INK, "middle", bg=SOFT)
    b += t(330, 296, "line-height about 1.5", 16, 700)
    return svg(312, "Type scale and line length", "Five font sizes and a text column with its measure.", b)


@fig(7, 1, "form-field-anatomy.svg", "A well-styled field: the label sits above, the field is full width and at least 44px tall, focus shows a clear outline, and an error is written in words next to the field, not only shown as a red border.",
     "The principles behind those lines")
def _():
    b = heading("A field that works on a phone")
    b += t(40, 82, "Phone number", 16, 700)
    b += rect(40, 94, 380, 48, WHITE, "#b42318", 8, sw=2, shadow=False) + f'<rect x="34" y="88" width="392" height="60" rx="12" fill="none" stroke="{GOLD}" stroke-width="3"/>'
    b += t(56, 124, "0803 12", 16, 500)
    b += t(40, 176, "Enter 11 digits, like 0803 123 4567.", 16, 600, "#b42318")
    for y, s in [(82, "label above"), (110, "focus ring shows"), (134, "≥ 44px tall"), (176, "error in words")]:
        b += t(456, y, "← " + s, 16, 600, INK2)
    b += t(20, 222, "Never remove the focus outline without a better one.", 16, 500, INK2)
    return svg(240, "Accessible form field", "A label, a tall field with a focus outline and a written error.", b)


@fig(7, 2, "position-modes.svg", "Four positions: relative nudges an element from where it would be; absolute places it inside the nearest positioned ancestor, like a badge on a card; fixed pins it to the screen; sticky scrolls until it reaches its point, then sticks.",
     "`z-index` decides which overlapping")
def _():
    b = heading("Where does the element go?")
    cards = [("relative", "nudged from its", "own place"), ("absolute", "inside a", "positioned parent"), ("fixed", "pinned to", "the screen"), ("sticky", "scrolls, then", "sticks at top: 0")]
    for i, (n, s1, s2) in enumerate(cards):
        x = 20 + i * 152
        b += rect(x, 56, 140, 150, WHITE, INK2, 10)
        if n == "relative":
            b += rect(x + 20, 96, 70, 40, WHITE, INK2, 4, dash="4 3", shadow=False) + rect(x + 40, 112, 70, 40, GOLD_T, INK2, 4, shadow=False)
        elif n == "absolute":
            b += rect(x + 14, 80, 112, 90, SOFT, LINE, 6, shadow=False) + circle(x + 112, 94, 14, GOLD, INK)
        elif n == "fixed":
            b += rect(x + 14, 70, 112, 124, SOFT, LINE, 6, shadow=False) + circle(x + 108, 176, 12, GOLD, INK)
        else:
            b += rect(x + 14, 66, 112, 22, GOLD_T, INK2, 4, shadow=False)
            for k in range(4):
                b += f'<rect x="{x + 14}" y="{98 + k * 24}" width="112" height="14" rx="3" fill="{SOFT}"/>'
        b += t(x + 70, 234, n, 16, 800, INK, "middle", mono=True) + t(x + 70, 258, s1, 16, 500, INK2, "middle") + t(x + 70, 280, s2, 16, 500, INK2, "middle")
    return svg(298, "CSS position values", "Relative, absolute, fixed and sticky, side by side.", b)


@fig(8, 1, "css-variables.svg", "A custom property is defined once in :root and read with var() wherever it is used; change --brand once and every rule that reads it changes with it.",
     "`:root` is the top of the page")
def _():
    b = heading("Name a value once, use it everywhere")
    c1, h = code(20, 56, 250, [":root {", [("  --brand: ", INK), ("#16233f", TEAL_D, 800), (";", INK)], "}"])
    b += c1
    users = [".button", ".card h2", "a:hover"]
    for i, u in enumerate(users):
        y = 56 + i * 64
        b += tb(390, y, 230, 52, [(u, 16, 700), ("var(--brand)", 16, 600, INK2)], fill=SOFT, shadow=False)
        b += arr(272, 100, 386, y + 26)
    b += t(20, 268, "Change it in one place and all three follow,", 16, 500, INK2)
    b += t(20, 292, "even inside a media query or from JavaScript.", 16, 500, INK2)
    return svg(312, "CSS custom properties", "One variable in :root feeding three rules.", b)


@fig(8, 2, "grid-lines.svg", "Grid lines are numbered from 1 and -1 is the last line: with grid-template-columns: 200px 1fr there are lines 1, 2 and 3, so grid-column: 1 / -1 stretches the header across both columns.",
     "The `fr` unit means")
def _():
    b = heading("grid-template-columns: 200px 1fr")
    x1, x2, x3 = 60, 220, 600
    b += tb(x1, 80, x3 - x1, 50, ["header  —  grid-column: 1 / -1"], fill=GOLD_T, stroke=INK2, shadow=False)
    b += tb(x1, 142, x2 - x1 - 8, 120, ["sidebar", ("200px", 16, 500, INK2)], fill=TEAL_T, shadow=False)
    b += tb(x2 + 8, 142, x3 - x2 - 8, 120, ["main", ("1fr: the rest", 16, 500, INK2)], fill=TEAL_T, shadow=False)
    for x, lab in [(x1, "1"), (x2 + 4, "2"), (x3, "3 = -1")]:
        b += line(x, 66, x, 276, CORAL_D, 2, "5 4") + t(x, 300, "line " + lab, 16, 700, CORAL_D, "middle")
    return svg(318, "Numbered grid lines", "Two columns, three numbered lines, a header spanning them.", b)


@fig(8, 3, "grid-areas.svg", "Named areas draw the layout in words: grid-template-areas \"head head\" \"side main\" \"foot foot\" gives a header across the top, a sidebar beside the main content, and a footer across the bottom.",
     "**Named areas** draw the layout")
def _():
    b = heading("grid-template-areas: the layout in words")
    c1, h = code(20, 56, 250, ['"head head"', '"side main"', '"foot foot"'])
    b += c1 + arr(278, 104, 316, 104)
    b += tb(326, 56, 294, 38, ["head"], fill=GOLD_T, stroke=INK2, shadow=False, r=4)
    b += tb(326, 100, 100, 74, ["side"], fill=TEAL_T, shadow=False, r=4)
    b += tb(432, 100, 188, 74, ["main"], fill=TEAL_T, shadow=False, r=4)
    b += tb(326, 180, 294, 38, ["foot"], fill=SOFT, shadow=False, r=4)
    b += t(20, 256, "Each quoted string is a row; a name repeated spans cells.", 16, 500, INK2)
    return svg(276, "Grid template areas", "Three strings of area names beside the layout they make.", b)


@fig(8, 3, "grid-or-flex.svg", "Grid or Flexbox? Flexbox lays things out in one line and lets the content decide sizes (a nav bar, tags, buttons); Grid lines things up in rows and columns at once and lets the layout decide (a page, a gallery, a form).",
     "**Grid or Flexbox?**")
def _():
    b = heading("One direction, or two?")
    b += rect(20, 56, 290, 200, SOFT, LINE, 10) + t(36, 84, "Flexbox: a line", 18, 800, bg=SOFT)
    for i, w in enumerate([60, 96, 72]):
        x = 36 + sum([60, 96, 72][:i]) + i * 10
        b += tb(x, 104, w, 40, [f"{i + 1}"], fill=GOLD_T, stroke=INK2, shadow=False, r=6)
    b += t(36, 186, "content decides sizes:", 16, 500, INK2, bg=SOFT) + t(36, 210, "nav bars, tags, buttons", 16, 600, bg=SOFT)
    b += rect(330, 56, 290, 200, SOFT, LINE, 10) + t(346, 84, "Grid: rows and columns", 18, 800, bg=SOFT)
    for r in range(2):
        for c in range(3):
            b += f'<rect x="{346 + c * 86}" y="{100 + r * 38}" width="78" height="30" rx="4" fill="{TEAL_T}" stroke="{TEAL}"/>'
    b += t(346, 210, "layout decides: pages, galleries", 16, 600, bg=SOFT)
    b += t(20, 284, "Most real pages use both.", 16, 500, INK2)
    return svg(302, "Grid versus Flexbox", "Flexbox items in one row; grid cells in rows and columns.", b)


@fig(9, 2, "render-cost.svg", "Why to animate transform and opacity: changing width, height or top makes the browser redo layout, then paint, then composite on every frame; transform and opacity can skip straight to compositing, which stays smooth on cheaper phones.",
     "Animate `transform` and `opacity`")
def _():
    b = heading("What the browser redoes each frame")
    st = ["Layout", "Paint", "Composite"]
    for i, s in enumerate(st):
        b += tb(200 + i * 145, 60, 125, 50, [s], fill=SOFT)
        if i: b += arr(200 + i * 145 - 18, 85, 200 + i * 145 - 4, 85)
    b += t(20, 92, "the steps", 16, 700, INK2)
    b += t(20, 156, "width, top", 16, 700, CORAL_D) + path("M200 150 H585", CORAL_D, sw=4) + t(392, 180, "all three steps: can stutter", 16, 600, CORAL_D, "middle")
    b += t(20, 226, "transform", 16, 700, GREEN) + t(20, 248, "opacity", 16, 700, GREEN) + path("M490 232 H585", GREEN, sw=4)
    b += t(470, 238, "composite only", 16, 600, GREEN, "end")
    return svg(270, "Cheap and expensive animations", "Layout, paint and composite, and which properties trigger which.", b)


@fig(9, 3, "transform-order.svg", "Transform order matters. rotate(45deg) translateX(100px) moves the box along its rotated direction, ending up diagonally down and to the right; translateX(100px) rotate(45deg) moves it straight right and turns it in place.",
     "Transforms combine in one property")
def _():
    b = heading("Same two transforms, different order")
    def panel(x, title, end_x, end_y, oy):
        a1, _, a2 = title.partition(") ")
        o = rect(x, 56, 290, 230, SOFT, LINE, 10) + fit(x, 56, 290, 230, t(x + 145, 82, a1 + ")", 16, 700, INK, "middle", mono=True, bg=SOFT) + t(x + 145, 104, a2, 16, 700, INK, "middle", mono=True, bg=SOFT))
        ox = x + 50
        o += f'<rect x="{ox - 20}" y="{oy - 20}" width="40" height="40" fill="none" stroke="{INK2}" stroke-dasharray="4 3"/>'
        o += f'<rect x="{end_x - 20}" y="{end_y - 20}" width="40" height="40" fill="{GOLD}" stroke="{INK}" transform="rotate(45 {end_x} {end_y})"/>'
        o += arr(ox, oy, end_x - 18 * (end_x - ox) / max(1, ((end_x - ox) ** 2 + (end_y - oy) ** 2) ** .5), end_y - 18 * (end_y - oy) / max(1, ((end_x - ox) ** 2 + (end_y - oy) ** 2) ** .5), CORAL_D, "5 4", 2)
        return o
    b += panel(20, "rotate(45deg) translateX(100px)", 20 + 50 + 113, 140 + 113, 140)
    b += panel(330, "translateX(100px) rotate(45deg)", 330 + 50 + 160, 200, 200)
    b += t(165, 312, "moves along the turned axis", 16, 600, INK2, "middle") + t(475, 312, "moves right, turns in place", 16, 600, INK2, "middle")
    return svg(330, "Order of CSS transforms", "Two panels: the box ends up diagonal in one, straight right in the other.", b)


@fig(11, 1, "template-literal.svg", "A template literal is written in backticks; each ${…} slot is replaced by the value of what is inside it, so `Welcome, ${name}, to ${centre}!` becomes \"Welcome, Ada, to Egbeda!\".",
     "Text is a **string**")
def _():
    b = heading("Template literals fill the slots")
    s = "`Welcome, ${name}, to ${centre}!`"
    x0 = 320 - len(s) * M / 2
    b += rect(x0 - 14, 66, len(s) * M + 28, 46, SOFT, LINE, 8) + fit(x0 - 14, 66, len(s) * M + 28, 46, t(x0, 96, s, 18, 600, INK, mono=True, bg=SOFT))
    i1, i2 = s.index("${name}"), s.index("${centre}")
    b += tb(x0 + i1 * M - 20, 150, 7 * M + 40, 40, ['"Ada"'], fill=GOLD_T, stroke=INK2, shadow=False)
    b += tb(x0 + i2 * M - 10, 150, 9 * M + 20, 40, ['"Egbeda"'], fill=GOLD_T, stroke=INK2, shadow=False)
    b += arr(x0 + (i1 + 3.5) * M, 116, x0 + (i1 + 3.5) * M, 146) + arr(x0 + (i2 + 4.5) * M, 116, x0 + (i2 + 4.5) * M, 146)
    b += t(320, 238, '→  "Welcome, Ada, to Egbeda!"', 18, 700, GREEN, "middle", mono=True)
    return svg(262, "Template literals", "A backtick string with two slots filled from variables.", b)


@fig(11, 2, "if-else-flow.svg", "An if / else if / else chain is checked top to bottom and stops at the first test that is true: 70 or more is Distinction, otherwise 50 or more is Pass, otherwise Try again.",
     "**Conditions** make code choose")
def _():
    b = heading("Checked top to bottom; the first true one wins")
    b += diamond(160, 100, 220, 70, ["score >= 70?"])
    b += diamond(160, 210, 220, 70, ["score >= 50?"])
    b += tb(380, 76, 200, 48, ['"Distinction"'], fill=GREEN_T, stroke=GREEN)
    b += tb(380, 186, 200, 48, ['"Pass"'], fill=GREEN_T, stroke=GREEN)
    b += tb(60, 290, 200, 48, ['"Try again"'], fill=CORAL_T, stroke=CORAL_D)
    b += arr(272, 100, 376, 100) + t(322, 90, "yes", 16, 700, GREEN, "middle")
    b += arr(272, 210, 376, 210) + t(322, 200, "yes", 16, 700, GREEN, "middle")
    b += arr(160, 137, 160, 172) + t(172, 160, "no", 16, 700, CORAL_D)
    b += arr(160, 247, 160, 286) + t(172, 272, "no", 16, 700, CORAL_D)
    b += t(380, 300, "else: nothing above", 16, 500, INK2) + t(380, 322, "was true", 16, 500, INK2)
    return svg(356, "if, else if, else", "A flowchart of two tests and three outcomes.", b)


@fig(11, 3, "function-anatomy.svg", "A function call: the argument 82 is given to the parameter score, the steps run, and return sends \"Distinction\" back to where grade(82) was written.",
     "`score` is a **parameter**")
def _():
    b = heading("Argument in, return value out")
    b += tb(20, 90, 140, 56, [("grade(82)", 16, 700)], fill=GOLD_T, stroke=INK2)
    b += arr(164, 118, 210, 118) + t(187, 108, "82", 16, 700, INK, "middle")
    c1, h = code(216, 60, 404, [[("function grade(", INK), ("score", TEAL_D, 800), (") {", INK)],
                                  "  if (score >= 70)", [("    return ", CORAL_D, 700), ('"Distinction";', INK)], "  …", "}"])
    b += c1
    b += path(f"M418 {60 + h + 4} V{60 + h + 34} H90 V150", CORAL_D, sw=2.5)
    b += t(254, 60 + h + 26, 'returns "Distinction"', 16, 700, CORAL_D, "middle")
    b += t(20, 60 + h + 66, "82 is the argument; score is the parameter that receives it.", 16, 500, INK2)
    return svg(60 + h + 86, "Function anatomy", "A call passes 82 in; the function returns a grade.", b)


@fig(12, 1, "array-index.svg", "An array of three items has positions 0, 1 and 2: length is 3, the last item is at position length - 1, and asking for position 3 gives undefined — the classic off-by-one error.",
     "Off-by-one errors are the classic")
def _():
    b = heading("Counting starts at 0")
    items = ['"Coding"', '"Media Lab"', '"Chess"']
    for i, s in enumerate(items):
        b += tb(40 + i * 150, 80, 140, 56, [s], fill=GOLD_T, stroke=INK2) + t(110 + i * 150, 164, f"[{i}]", 18, 800, INK, "middle", mono=True)
    b += rect(490, 80, 120, 56, WHITE, CORAL_D, 10, dash="6 4", shadow=False) + fit(490, 80, 120, 56, t(550, 114, "undefined", 16, 700, CORAL_D, "middle"))
    b += t(550, 164, "[3]", 18, 800, CORAL_D, "middle", mono=True)
    b += t(40, 210, "courses.length is 3; the last is courses[courses.length - 1].", 16, 500, INK2)
    return svg(232, "Array indexes", "Three array items at positions 0, 1, 2 and an empty position 3.", b)


@fig(12, 2, "object-shape.svg", "An object holds named properties about one thing; values can be arrays, so learner.courses at index 0 is read left to right: the learner, its courses, the first one — \"Coding\".",
     "Most real data is an **array of objects**")
def _():
    b = heading("One thing, many named facts")
    b += rect(20, 56, 340, 252, SOFT, INK2, 10) + t(36, 84, "learner", 18, 800, bg=SOFT)
    rows = [("name", '"Tobi"'), ("age", "13"), ("centre", '"Egbeda"'), ("courses", "")]
    for i, (k, v) in enumerate(rows):
        y = 98 + i * 44
        b += tb(36, y, 110, 36, [k], fill=TEAL_T, shadow=False, r=6) + (t(160, y + 24, v, 16, 600, INK, mono=True, bg=SOFT) if v else "")
    b += tb(160, 230, 90, 36, ['"Coding"'], fill=GOLD_T, stroke=INK2, shadow=False, r=4) + tb(256, 230, 90, 36, ['"Chess"'], fill=WHITE, shadow=False, r=4)
    b += t(205, 292, "[0]", 16, 700, INK, "middle", mono=True, bg=SOFT) + t(301, 292, "[1]", 16, 700, INK, "middle", mono=True, bg=SOFT)
    b += t(380, 120, "learner.courses[0]", 16, 700, INK, mono=True)
    b += t(380, 150, "read left to right:", 16, 500, INK2) + t(380, 174, "the learner → its", 16, 500, INK2) + t(380, 198, "courses → the first", 16, 500, INK2)
    b += t(380, 236, '= "Coding"', 16, 700, GREEN, mono=True)
    return svg(326, "A JavaScript object", "Key-value pairs, one holding an array.", b)


@fig(12, 3, "for-loop.svg", "A for loop: start once (let i = 1), check the condition (i <= 5); if true run the body, take the step (i++) and check again; when the check is false, carry on after the loop.",
     "The `for` loop has three parts")
def _():
    b = heading("for (let i = 1; i <= 5; i++)")
    b += tb(220, 56, 200, 44, ["start: let i = 1"], fill=SOFT)
    b += arr(320, 102, 320, 126)
    b += diamond(320, 166, 200, 76, ["i <= 5 ?"])
    b += tb(220, 236, 200, 44, ["run the body"], fill=GOLD_T, stroke=INK2)
    b += arr(320, 206, 320, 232) + t(332, 224, "true", 16, 700, GREEN)
    b += tb(20, 236, 150, 44, ["step: i++"], fill=SOFT)
    b += arr(216, 258, 174, 258) + path("M95 234 V166 H216", INK2)
    b += arr(422, 166, 486, 166) + t(452, 156, "false", 16, 700, CORAL_D, "middle")
    b += tb(490, 140, 130, 52, ["carry on"], fill=WHITE)
    return svg(298, "How a for loop runs", "Start, check, body, step, check again; exit when false.", b)


@fig(13, 1, "map-filter-reduce.svg", "Three higher-order functions on the scores 45, 82, 67, 90, 38: map(s => s + 5) changes every item, giving 50, 87, 72, 95, 43; filter(s => s >= 50) keeps 82, 67 and 90; reduce adds them all into one value, 322.",
     "- **reduce** walks the array")
def _():
    b = heading("map, filter, reduce")
    src = [45, 82, 67, 90, 38]
    def row(y, vals, hl=None):
        o = ""
        for i, v in enumerate(vals):
            o += tb(330 + i * 58, y, 50, 40, [str(v)], fill=GOLD_T if (hl and hl(v)) else WHITE, stroke=INK2 if (hl and hl(v)) else LINE, shadow=False, r=6)
        return o
    b += t(20, 86, "scores", 16, 700, mono=True) + row(60, src)
    rows = [("map(s => s + 5)", [s + 5 for s in src], "every item changed"),
            ("filter(s => s >= 50)", [s for s in src if s >= 50], "only some kept"),
            ("reduce((sum, s) => sum + s, 0)", [sum(src)], "one value")]
    for i, (f, vals, note) in enumerate(rows):
        y = 124 + i * 76
        f1, _, f2 = f.partition("=> s") if f.startswith("reduce") else (f, "", "")
        b += t(20, y + 16, f1 + ("=>" if f2 else ""), 16, 700, TEAL_D, mono=True)
        if f2: b += t(20, y + 38, "  s" + f2, 16, 700, TEAL_D, mono=True)
        b += row(y, vals) + t(330, y + 62, note, 16, 500, INK2)
    return svg(348, "map, filter and reduce", "One array and the result of each method.", b)


@fig(13, 2, "dom-tree.svg", "The browser turns HTML into the DOM, a tree with one object per element; document.querySelector(\"h1\") finds a node, and changing its textContent changes the page at once.",
     "When a browser reads your HTML")
def _():
    b = heading("The DOM: your page as a tree")
    b += tb(250, 56, 140, 40, ["document"], fill=SOFT)
    b += tb(250, 120, 140, 40, ["<body>"], fill=SOFT) + arr(320, 98, 320, 116)
    kids = [("<h1>", 70), ("<ul id=tasks>", 270), ("<p>", 470)]
    for k, x in kids:
        b += tb(x, 190, 140 if x != 270 else 160, 40, [k], fill=GOLD_T if k == "<h1>" else SOFT, stroke=INK2 if k == "<h1>" else LINE)
        b += path(f"M320 162 V176 H{x + 70 + (10 if x == 270 else 0)} V186", INK2)
    b += tb(290, 254, 120, 36, ["<li>"], fill=SOFT, shadow=False) + arr(350, 232, 350, 250)
    c1, h = code(20, 306, 600, [[('document.querySelector("h1")', TEAL_D, 700)], [('  .textContent = "Welcome back, Ada";', INK)]])
    b += c1 + path("M140 304 V236", TEAL_D, sw=2)
    return svg(306 + h + 16, "The DOM tree", "Document, body and three elements; code that changes the h1.", b)


@fig(13, 3, "event-listener.svg", "An event listener: the user clicks, the browser fires a click event on the button, the listener function you attached runs with an event object, and it updates the page.",
     "The listener receives an **event object**")
def _():
    b = heading("Something happens, your function runs")
    steps = [("1", "User clicks", "the button"), ("2", "Browser fires", '"click"'), ("3", "Your listener", "runs (event)"), ("4", "Page", "updates")]
    for i, (n, a, c) in enumerate(steps):
        x = 20 + i * 156
        b += tb(x, 70, 140, 76, [a, (c, 16, 500, INK2)], fill=GOLD_T if i == 2 else SOFT, stroke=INK2 if i == 2 else LINE)
        b += badge(x + 14, 70, n)
        if i < 3: b += arr(x + 142, 108, x + 154, 108)
    c1, h = code(20, 176, 600, ['button.addEventListener("click", () => {', "  presses++;", "  button.textContent = `Pressed ${presses} times`;", "});"])
    b += c1
    return svg(176 + h + 16, "Event listeners", "Click, event, listener, page update.", b)


@fig(14, 1, "error-anatomy.svg", "Reading an error: TypeError is the kind of error, \"Cannot read properties of undefined (reading 'name')\" says what went wrong — something was undefined — and app.js:14 is the file and line to look at.",
     "**Read the error message")
def _():
    b = heading("Read all of the error")
    c1, h = code(20, 56, 600, [[("TypeError", CORAL_D, 800), (": Cannot read properties", INK)], [("of undefined (reading 'name')", INK)], [("    at ", INK2), ("app.js:14", TEAL_D, 800)]], fill=WHITE, stroke=INK2)
    b += c1
    parts = [("the kind", "TypeError: a value", "used the wrong way", CORAL_T), ("what happened", "a value you expected", "was undefined", SOFT), ("where", "file app.js,", "line 14", TEAL_T)]
    for i, (h1, a, c, f) in enumerate(parts):
        b += tb(20 + i * 204, 56 + h + 20, 192, 104, [(h1, 16, 800), (a, 16, 500), (c, 16, 500)], fill=f, shadow=False)
    return svg(56 + h + 140, "Anatomy of an error message", "An error split into type, message and location.", b)


@fig(14, 2, "regex-breakdown.svg", "Reading the phone-number pattern piece by piece against 08031234567: ^ is the start of the text, then a 0, then one of 7, 8 or 9, then a 0 or 1, then \\d{8} for exactly eight digits, and $ for the end of the text — so it matches.",
     "Reading that pattern piece by piece")
def _():
    b = heading("A pattern, one piece at a time")
    parts = [("^", "start", ""), ("0", "a zero", "0"), ("[789]", "7, 8 or 9", "8"), ("[01]", "0 or 1", "0"), ("\\d{8}", "8 digits", "31234567"), ("$", "end", "")]
    widths = [56, 70, 104, 92, 174, 56]
    x = 22
    for (p, means, m), w in zip(parts, widths):
        b += tb(x, 60, w, 48, [(p, 18, 800)], fill=GOLD_T, stroke=INK2, shadow=False, r=6)
        b += fit(x, 112, w, 30, t(x + w / 2, 134, means, 16, 500, INK2, "middle"))
        if m: b += tb(x, 154, w, 42, [(m, 16, 700, GREEN)], fill=GREEN_T, stroke=GREEN, shadow=False, r=6)
        x += w + 4
    b += t(20, 230, 'ngPhone.test("08031234567") → true', 16, 700, GREEN, mono=True)
    b += t(20, 258, 'ngPhone.test("0803123") → false: too few digits', 16, 700, CORAL_D, mono=True)
    return svg(278, "Regular expression breakdown", "Six pieces of a phone-number pattern and the digits each matches.", b)


@fig(14, 3, "validate-on-submit.svg", "Validating on submit: when the form is sent, test the value; if it fails, stop the send with preventDefault, show a message next to the field saying how to fix it, mark it aria-invalid and move focus there; if it passes, the form is sent.",
     "Rules for good error messages")
def _():
    b = heading("What happens when the form is sent")
    b += tb(20, 60, 160, 50, ["submit event"], fill=SOFT)
    b += arr(182, 85, 216, 85)
    b += diamond(320, 85, 200, 76, ["valid?"])
    b += arr(422, 85, 476, 85) + t(448, 76, "yes", 16, 700, GREEN, "middle")
    b += tb(480, 60, 140, 50, ["form is sent"], fill=GREEN_T, stroke=GREEN)
    b += arr(320, 125, 320, 154) + t(332, 146, "no", 16, 700, CORAL_D)
    for i, s in enumerate(["e.preventDefault()  — stop the send", "say what to fix, with an example", "aria-invalid=\"true\" on the field", "focus the field; keep what they typed"]):
        b += tb(120, 158 + i * 46, 400, 40, [s], fill=CORAL_T, shadow=False, r=6, wt=500)
    return svg(354, "Validating a form on submit", "A decision: valid sends; invalid stops and explains.", b)


@fig(15, 1, "client-server-validation.svg", "Browser checks are a convenience for honest users: anyone can switch them off in DevTools or send data straight to the server. The server's check is the protection, so the server must always check again.",
     "the most important rule of all")
def _():
    b = heading("Check in the browser, and again on the server")
    b += tb(20, 60, 200, 110, [("Browser check", 18, 800), ("quick help for", 16, 500, INK2), ("honest users", 16, 500, INK2)], fill=GOLD_T, stroke=INK2)
    b += tb(420, 60, 200, 110, [("Server check", 18, 800), ("the real", 16, 500, INK2), ("protection", 16, 500, INK2)], fill=GREEN_T, stroke=GREEN)
    b += arr(224, 100, 414, 100) + t(319, 90, "normal use", 16, 600, INK, "middle")
    b += tb(20, 210, 200, 70, [("DevTools: delete", 16, 600), ("required", 16, 600)], fill=CORAL_T, stroke=CORAL_D)
    b += path("M224 245 H330 V146 H414", CORAL_D, dash="6 4")
    b += t(20, 304, "A request sent straight to the server skips the browser", 16, 600, CORAL_D)
    b += t(20, 328, "check entirely: only the server can stop it.", 16, 600, CORAL_D)
    return svg(346, "Client and server validation", "Browser and server checks; bypass paths reach the server.", b)


@fig(15, 2, "date-epoch.svg", "A JavaScript date is a number: the milliseconds since 1 January 1970 (UTC). Subtracting two dates gives a duration in milliseconds; divide by 86,400,000 for days. getMonth() counts from 0, so October is 9.",
     "Internally a date is a number")
def _():
    b = heading("A date is a count of milliseconds")
    b += line(30, 120, 610, 120, INK2, 3)
    for x, a, c in [(40, "1 Jan 1970", "0"), (360, "3 Oct 2026", "start"), (560, "now", "now")]:
        b += line(x, 108, x, 132, INK2, 3) + t(x, 98, a, 16, 700, INK, "middle")
    b += t(40, 156, "0 ms", 16, 600, INK2, "middle")
    b += path("M360 146 H556", CORAL_D, sw=3) + t(458, 170, "now - start = ms", 16, 700, CORAL_D, "middle")
    b += t(20, 214, "days = Math.floor(ms / 86400000)", 16, 700, mono=True)
    b += t(20, 240, "86400000 = 1000 × 60 × 60 × 24", 16, 500, INK2)
    b += tb(20, 262, 600, 50, [("getMonth(): January is 0, so October is 9.", 16, 700, CORAL_D)], fill=CORAL_T, a="start")
    return svg(328, "Dates as milliseconds", "A timeline from 1970, and a duration by subtraction.", b)


@fig(15, 3, "media-events.svg", "Media events along a video's life: play fires when it starts, timeupdate keeps firing as it plays (update the progress bar from currentTime / duration), pause when it stops, and ended at the end.",
     "Useful properties")
def _():
    b = heading("The events a video fires")
    b += rect(30, 110, 580, 16, SOFT, LINE, 8, shadow=False) + rect(30, 110, 340, 16, TEAL, TEAL, 8, shadow=False)
    ev = [(30, "play"), (370, "pause"), (430, "play"), (610, "ended")]
    for i, (x, e) in enumerate(ev):
        b += line(x, 92, x, 144, INK2, 2) + t(x, 166 + (i % 2) * 22, e, 16, 700, INK, "middle" if 30 < x < 610 else ("start" if x == 30 else "end"), mono=True)
    for x in range(80, 360, 50):
        b += line(x, 98, x, 106, TEAL_D, 2)
    b += t(200, 86, "timeupdate, timeupdate, …", 16, 600, TEAL_D, "middle", mono=True)
    b += t(20, 236, "progress.value = video.currentTime / video.duration", 16, 600, mono=True)
    b += t(20, 264, "Start playback from a click: browsers block sound by itself.", 16, 500, INK2)
    return svg(284, "Audio and video events", "A timeline of play, timeupdate, pause, play, ended.", b)


@fig(16, 1, "collections.svg", "Which collection? An array is an ordered list you go through; a Set holds each value once and answers \"is it in the group?\"; a Map looks values up by key; a plain object is a fixed record with known property names.",
     "When to use which")
def _():
    b = heading("Pick the structure for the question")
    cards = [("Array", "ordered list", ['"html"', '"css"', '"html"'], "go through in order"),
             ("Set", "each value once", ['"html"', '"css"'], "is it in the group?"),
             ("Map", "key → value", ['Tobi → 11', 'Kemi → 12'], "look up by key"),
             ("Object", "fixed record", ['name: "Tobi"', 'age: 13'], "known property names")]
    for i, (h, s, items, q) in enumerate(cards):
        x = 20 + (i % 2) * 310
        y = 56 + (i // 2) * 160
        b += rect(x, y, 290, 146, SOFT, LINE, 10) + fit(x, y, 290, 146, t(x + 14, y + 28, h, 18, 800, bg=SOFT) + t(x + 120, y + 28, s, 16, 500, INK2, bg=SOFT) + t(x + 14, y + 132, q, 16, 700, TEAL_D, bg=SOFT))
        for j, it in enumerate(items):
            b += tb(x + 14 + j * 90 if h in ("Array", "Set") else x + 14, y + 44 + (0 if h in ("Array", "Set") else j * 36), 84 if h in ("Array", "Set") else 200, 32,
                    [(it, 16, 600)], fill=WHITE, shadow=False, r=4)
    return svg(392, "Array, Set, Map, object", "Four collections with an example and the question each answers.", b)


@fig(16, 2, "crud-loop.svg", "One source of truth: every action (create, update, delete) changes the array, then saves it to localStorage as JSON, then redraws the list from the array; on start the app loads the array back with JSON.parse.",
     "After every change: save, then redraw")
def _():
    b = heading("Change the data, save it, draw from it")
    b += tb(20, 70, 170, 70, [("Action", 18, 800), ("add, tick, delete", 16, 500, INK2)], fill=SOFT)
    b += tb(235, 70, 170, 70, [("tasks array", 18, 800), ("the one truth", 16, 500, INK2)], fill=GOLD_T, stroke=INK2)
    b += tb(450, 70, 170, 70, [("render()", 18, 800), ("draw the list", 16, 500, INK2)], fill=SOFT)
    b += arr(192, 105, 231, 105) + arr(407, 105, 446, 105)
    b += tb(235, 210, 170, 70, [("localStorage", 18, 800), ("strings only", 16, 500, INK2)], fill=TEAL_T)
    b += arr(300, 142, 300, 206) + t(290, 182, "JSON.stringify", 16, 600, TEAL_D, "end", mono=True)
    b += arr(340, 208, 340, 144) + t(350, 182, "JSON.parse on start", 16, 600, TEAL_D, mono=True)
    return svg(300, "CRUD with localStorage", "Action, array, render; array saved to and loaded from localStorage.", b)


@fig(16, 3, "class-instances.svg", "A class is a blueprint: new Learner(\"Tobi\", \"Egbeda\") and new Learner(\"Kemi\", \"Ikeja\") make two objects with their own data and the shared award() method; class Mentor extends Learner adds mentees.",
     "`constructor` runs once")
def _():
    b = heading("One blueprint, many objects")
    b += tb(220, 56, 200, 90, [("class Learner", 16, 800), ("name, centre, badges", 16, 500, INK2), ("award()", 16, 600, TEAL_D)], fill=GOLD_T, stroke=INK2)
    for i, (n, c) in enumerate([("Tobi", "Egbeda"), ("Kemi", "Ikeja")]):
        x = 30 + i * 200
        b += tb(x, 196, 180, 70, [(f"name: \"{n}\"", 16, 600), (f"centre: \"{c}\"", 16, 500, INK2)], fill=SOFT)
        b += path(f"M320 148 V170 H{x + 90} V192", INK2)
    b += t(170, 300, "new Learner(…)", 16, 700, INK, "middle", mono=True)
    b += tb(440, 196, 180, 70, [("class Mentor", 16, 800), ("extends Learner", 16, 500, INK2)], fill=TEAL_T)
    b += path("M420 101 H530 V192", TEAL_D, dash="6 4")
    b += t(530, 300, "+ mentees", 16, 700, TEAL_D, "middle")
    return svg(318, "Classes and instances", "A class with two objects made from it and a subclass.", b)


@fig(17, 1, "pure-impure.svg", "A pure function only turns its input into its output — withTax(1000) is always 1075 — while an impure one changes something outside itself, like a running total, so calling it twice gives a different world.",
     "**Immutability** means")
def _():
    b = heading("Pure: input to output, nothing else")
    b += rect(20, 56, 290, 210, GREEN_T, GREEN, 10) + t(36, 84, "Pure", 18, 800, GREEN, bg=GREEN_T)
    b += tb(36, 104, 70, 44, ["1000"], fill=WHITE, shadow=False) + arr(110, 126, 126, 126)
    b += tb(130, 104, 100, 44, ["withTax"], fill=GOLD_T, stroke=INK2, shadow=False) + arr(234, 126, 250, 126)
    b += tb(252, 104, 54, 44, ["1075"], fill=WHITE, shadow=False)
    b += t(36, 196, "same input, same output,", 16, 500, bg=GREEN_T) + t(36, 220, "every time", 16, 500, bg=GREEN_T)
    b += rect(330, 56, 290, 210, CORAL_T, CORAL_D, 10) + t(346, 84, "Impure", 18, 800, CORAL_D, bg=CORAL_T)
    b += tb(346, 104, 130, 44, ["addToTotal"], fill=GOLD_T, stroke=INK2, shadow=False)
    b += tb(500, 104, 104, 44, ["total"], fill=WHITE, shadow=False)
    b += arr(478, 126, 496, 126, CORAL_D)
    b += t(346, 196, "changes something outside:", 16, 500, bg=CORAL_T) + t(346, 220, "twice is not the same", 16, 500, bg=CORAL_T)
    return svg(284, "Pure and impure functions", "A pure function beside one that changes an outside variable.", b)


@fig(17, 2, "recursion-sum.svg", "Recursion: the sum of the list 3, 5, 2 is 3 plus the sum of 5, 2, which is 5 plus the sum of 2, which is 2 plus the sum of the empty list; that base case returns 0, and the answers add up on the way back: 2, 7, 10.",
     "Every recursive function needs two parts")
def _():
    b = heading("Down to the base case, then back up")
    calls = ["sum([3, 5, 2])", "3 + sum([5, 2])", "5 + sum([2])", "2 + sum([])"]
    rets = ["= 10", "= 3 + 7 = 10", "= 5 + 2 = 7", "= 2 + 0 = 2"]
    for i, c in enumerate(calls):
        y = 56 + i * 60
        b += tb(40 + i * 40, y, 240, 46, [(c, 16, 700)], fill=SOFT, shadow=False)
        b += t(300 + i * 40, y + 29, rets[i], 16, 700, TEAL_D)
        if i < 3: b += arr(140 + i * 40, y + 48, 160 + i * 40, y + 58)
    b += tb(200, 296, 240, 46, [("[] → 0  (base case)", 16, 800, GREEN)], fill=GREEN_T, stroke=GREEN, shadow=False)
    b += arr(320, 294, 320, 280)
    b += arr(600, 330, 600, 70, INK2, "6 4") + t(588, 310, "answers", 16, 700, TEAL_D, "end") + t(588, 332, "come back up", 16, 700, TEAL_D, "end")
    return svg(370, "Recursion step by step", "Four nested calls down to an empty list, and their returns.", b)


@fig(17, 3, "fetch-timeline.svg", "Asynchronous fetch: the request starts and the page keeps working while it waits; when the response arrives, check res.ok, read the JSON and show it — or, if anything failed, show an error with a way to try again.",
     "`fetch` sends the request")
def _():
    b = heading("The page keeps working while it waits")
    b += t(20, 86, "request", 16, 700) + line(110, 80, 610, 80, LINE, 2)
    b += rect(110, 66, 330, 28, TEAL_T, TEAL, 6, shadow=False) + fit(110, 66, 330, 28, t(275, 86, "waiting… (show “Loading”)", 16, 600, INK, "middle", bg=TEAL_T))
    b += t(20, 136, "page", 16, 700) + rect(110, 116, 500, 28, GREEN_T, GREEN, 6, shadow=False) + fit(110, 116, 500, 28, t(360, 136, "still scrolls, still responds", 16, 600, INK, "middle", bg=GREEN_T))
    b += line(440, 60, 440, 160, INK2, 2, "5 4") + t(444, 180, "response arrives", 16, 700)
    b += diamond(200, 250, 180, 70, ["res.ok?"])
    b += arr(292, 250, 356, 250) + t(324, 240, "yes", 16, 700, GREEN, "middle")
    b += tb(360, 224, 260, 52, ["await res.json(), show it"], fill=GREEN_T, stroke=GREEN)
    b += arr(200, 287, 200, 312) + t(212, 306, "no, or network down", 16, 700, CORAL_D)
    b += tb(90, 316, 330, 48, ["error message + Try again"], fill=CORAL_T, stroke=CORAL_D)
    return svg(382, "Asynchronous fetch", "A timeline of waiting and the two endings.", b)


@fig(18, 3, "api-cache.svg", "Being polite to an API: before fetching, look for a saved answer in localStorage; if it is less than an hour old, use it; otherwise fetch, and save the new answer with the time you got it.",
     "Respect the API's rules")
def _():
    b = heading("Cache the answer with the time you got it")
    b += tb(20, 60, 180, 52, ["need the data"], fill=SOFT)
    b += arr(202, 86, 236, 86)
    b += diamond(350, 86, 220, 84, ["saved and", "< 1 hour old?"])
    b += arr(462, 86, 496, 86) + t(478, 76, "yes", 16, 700, GREEN, "middle")
    b += tb(500, 60, 120, 52, ["use it"], fill=GREEN_T, stroke=GREEN)
    b += arr(350, 130, 350, 162) + t(362, 154, "no", 16, 700, CORAL_D)
    b += tb(220, 166, 260, 52, ["fetch from the API"], fill=GOLD_T, stroke=INK2)
    b += arr(350, 220, 350, 246)
    b += tb(160, 250, 380, 52, ["save { data, time: Date.now() }"], fill=TEAL_T)
    return svg(320, "Caching an API answer", "A decision between a fresh saved answer and a new fetch.", b)


@fig(19, 1, "http-anatomy.svg", "An HTTP request carries a method, a path, headers and sometimes a body; the response carries a status code, headers and a body, usually JSON. The first digit of the status says whose problem it is: 2 success, 4 the client asked wrongly, 5 the server failed.",
     "The first digit tells you")
def _():
    b = heading("A request and its response")
    c1, h1 = code(20, 56, 290, [[("POST", CORAL_D, 800), (" /api/tasks", TEAL_D, 700)], "Content-Type:", "  application/json", "", '{"title": "Revise"}'], fill=WHITE, stroke=INK2)
    c2, h2 = code(330, 56, 290, [[("201", GREEN, 800), (" Created", INK)], "Content-Type:", "  application/json", "", '{"id": 12, …}'], fill=WHITE, stroke=INK2)
    b += c1 + c2 + arr(312, 120, 328, 120)
    b += t(20, 56 + h1 + 24, "method · path · headers · body", 16, 600, INK2) + t(330, 56 + h2 + 24, "status · headers · body", 16, 600, INK2)
    y = 56 + h1 + 44
    for i, (d, s, f, c) in enumerate([("2xx", "it worked", GREEN_T, GREEN), ("4xx", "you asked wrongly", GOLD_T, INK2), ("5xx", "the server broke", CORAL_T, CORAL_D)]):
        b += tb(20 + i * 204, y, 192, 56, [(d, 18, 800), (s, 16, 500)], fill=f, stroke=c, shadow=False)
    return svg(y + 72, "HTTP request and response", "A POST request, a 201 response, and the three status families.", b)


@fig(19, 2, "npm-install.svg", "package.json lists which packages a project needs; npm install downloads them into node_modules, which can be huge, so node_modules is never committed — anyone can rebuild it from package.json.",
     "`package.json` records")
def _():
    b = heading("package.json is the list; node_modules is the stuff")
    c1, h = code(20, 56, 250, ['"dependencies": {', '  "express": "^4"', "}"])
    b += c1 + t(20, 56 + h + 24, "package.json — commit it", 16, 700, GREEN)
    b += arr(274, 100, 374, 100) + t(324, 88, "npm install", 16, 700, INK, "middle", mono=True)
    b += rect(380, 56, 240, 150, SOFT, LINE, 10) + t(394, 84, "node_modules/", 16, 800, mono=True, bg=SOFT)
    for i in range(3):
        for j in range(4):
            b += f'<rect x="{396 + j * 54}" y="{98 + i * 32}" width="46" height="24" rx="3" fill="{WHITE}" stroke="{LINE}"/>'
    b += t(380, 230, "never commit it: .gitignore", 16, 700, CORAL_D)
    return svg(250, "npm and node_modules", "A package list turned into a large folder by npm install.", b)


@fig(19, 3, "express-route.svg", "How Express answers GET /hello/Kemi: the request is matched to app.get(\"/hello/:name\"), the handler runs with req.params.name set to \"Kemi\", and res.json sends the response back.",
     "Each `app.get(path, handler)` is a **route**")
def _():
    b = heading("A request finds its route")
    b += tb(20, 60, 200, 52, [("GET /hello/Kemi", 16, 700)], fill=GOLD_T, stroke=INK2)
    b += arr(222, 86, 256, 86)
    c1, h = code(262, 56, 358, ['app.get("/hello/:name",', "  (req, res) => {", "  const n = req.params.name;", "  res.json({ message:", "    `Hello, ${n}!` });", "});"])
    b += c1
    b += tb(20, 150, 200, 60, [("req.params.name", 16, 700), ('= "Kemi"', 16, 600, TEAL_D)], fill=TEAL_T, shadow=False)
    b += tb(20, 56 + h + 20, 600, 48, [('{ "message": "Hello, Kemi!" }', 16, 700, GREEN)], fill=GREEN_T, stroke=GREEN)
    b += path(f"M440 {56 + h + 2} V{56 + h + 16}", GREEN)
    return svg(56 + h + 84, "An Express route", "A request matched to a route and the JSON it returns.", b)


@fig(20, 1, "middleware-pipeline.svg", "Middleware runs in the order it was added: each one does its job and calls next() to pass the request on — express.json(), then a logger, then express.static — until a route sends the response. A middleware that neither calls next() nor responds leaves the request hanging.",
     "Order matters")
def _():
    b = heading("A request passes through, in order")
    st = [("express.json()", "fills req.body"), ("logger", "prints the URL"), ("static", "serves files"), ("your route", "sends a reply")]
    for i, (a, s) in enumerate(st):
        x = 20 + i * 156
        b += tb(x, 70, 140, 76, [(a, 16, 800), (s, 16, 500, INK2)], fill=GOLD_T if i == 3 else SOFT, stroke=INK2 if i == 3 else LINE)
        if i < 3: b += arr(x + 142, 108, x + 154, 108) + t(x + 148, 168, "next()", 16, 700, TEAL_D, "middle", mono=True)
    b += tb(20, 196, 600, 52, [("No next() and no response? The browser waits, then times out.", 16, 600, CORAL_D)], fill=CORAL_T)
    return svg(264, "Express middleware", "Four steps joined by next().", b)


@fig(20, 2, "rest-routes.svg", "A REST API for tasks: GET /api/tasks lists them (200), GET /api/tasks/:id reads one (200), POST /api/tasks creates one (201), PATCH /api/tasks/:id updates part of one (200), DELETE /api/tasks/:id deletes it (204).",
     "A **REST API** organises")
def _():
    b = heading("One resource, five routes")
    rows = [("GET", "/api/tasks", "list all", "200"), ("GET", "/api/tasks/:id", "read one", "200"), ("POST", "/api/tasks", "create", "201"),
            ("PATCH", "/api/tasks/:id", "update part", "200"), ("DELETE", "/api/tasks/:id", "delete", "204")]
    hd = ["method", "path", "does", "success"]
    xs = [20, 140, 340, 510]
    ws = [116, 196, 166, 110]
    for j, h in enumerate(hd):
        b += t(xs[j] + 8, 76, h, 16, 800, INK2)
    for i, r in enumerate(rows):
        y = 88 + i * 46
        for j, c in enumerate(r):
            f = GOLD_T if j == 0 else (WHITE if j != 3 else GREEN_T)
            b += rect(xs[j], y, ws[j], 40, f, LINE, 4, shadow=False) + fit(xs[j], y, ws[j], 40, t(xs[j] + 8, y + 26, c, 16, 700 if j < 2 else 500, INK if j != 3 else GREEN, mono=j < 2, bg=f))
    b += t(20, 344, "Paths are nouns; the method is the verb.", 16, 500, INK2)
    return svg(362, "REST routes", "A table of methods, paths, actions and status codes.", b)


@fig(20, 3, "api-error-paths.svg", "Every input gets the right answer: good data gets 200 or 201, invalid data gets 400 with a short reason, an unknown id gets 404, and anything unexpected is caught by the four-argument error middleware, which logs it and answers 500 with a safe message.",
     "Catch everything else")
def _():
    b = heading("Every request gets a clear answer")
    b += tb(20, 150, 140, 56, ["request"], fill=SOFT)
    outs = [("good data", "200 / 201", GREEN_T, GREEN), ("invalid data", '400 {"error": "title_required"}', GOLD_T, INK2),
            ("unknown id", "404 not_found", GOLD_T, INK2), ("a crash", "error middleware → 500", CORAL_T, CORAL_D)]
    for i, (a, r, f, c) in enumerate(outs):
        y = 56 + i * 64
        b += t(186, y + 30, a, 16, 600, INK2) + tb(300, y + 4, 320, 44, [(r, 16, 700)], fill=f, stroke=c, shadow=False)
        b += path(f"M162 178 C180 178 180 {y + 26} 180 {y + 26}", INK2, head=False) + arr(282, y + 26, 296, y + 26)
    b += t(20, 336, "Log the full error for yourself; send the user a short one.", 16, 500, INK2)
    return svg(356, "API error handling", "Four kinds of request and the status each gets.", b)


@fig(21, 1, "sql-vs-document.svg", "Two families of database: a relational database stores rows in a table with fixed columns, like a strict spreadsheet; a document database such as MongoDB stores JSON-like documents in a collection, each with its own _id.",
     "There are two big families")
def _():
    b = heading("Tables of rows, or collections of documents")
    b += t(20, 78, "Relational (SQL): a table", 16, 800)
    cols = ["id", "title", "done"]
    rows = [["1", "Revise CSS", "false"], ["2", "Capstone", "false"]]
    for j, c in enumerate(cols):
        b += tb(20 + j * 96, 90, 96, 36, [c], fill=GOLD_T, stroke=INK2, r=0, shadow=False)
        for i, r in enumerate(rows):
            b += tb(20 + j * 96, 126 + i * 36, 96, 36, [(r[j], 16, 500)], fill=WHITE, r=0, shadow=False)
    b += t(330, 78, "Document (MongoDB): a collection", 16, 800)
    c1, h = code(330, 90, 290, ['{ "_id": "6720f1…",', '  "title": "Capstone",', '  "done": false,', '  "tags": ["school"] }'], fill=WHITE, stroke=INK2)
    b += c1
    b += t(20, 236, "fixed columns, rows linked by id", 16, 500, INK2) + t(330, 90 + h + 24, "same shape as a JS object", 16, 500, INK2)
    return svg(90 + h + 40, "Relational and document databases", "A small table beside a JSON document.", b)


@fig(21, 2, "mongoose-schema.svg", "Mongoose sits between your code and MongoDB: Task.create() is checked against the schema first; a document that breaks it (no title) is refused with a ValidationError you can turn into a 400, and a valid one is saved.",
     "Every call is asynchronous")
def _():
    b = heading("The schema guards the door")
    b += tb(20, 100, 160, 64, [("Task.create()", 16, 700), ("your code", 16, 500, INK2)], fill=SOFT)
    b += arr(182, 132, 222, 132)
    b += tb(226, 90, 170, 84, [("schema check", 16, 800), ("title required,", 16, 500, INK2), ("max 200 chars", 16, 500, INK2)], fill=GOLD_T, stroke=INK2)
    b += arr(398, 112, 450, 78) + arr(398, 154, 450, 188)
    b += tb(454, 52, 166, 56, [("saved in", 16, 600), ("MongoDB", 16, 800)], fill=GREEN_T, stroke=GREEN)
    b += tb(454, 160, 166, 56, [("ValidationError", 16, 800), ("→ answer 400", 16, 600)], fill=CORAL_T, stroke=CORAL_D)
    b += t(424, 80, "valid", 16, 700, GREEN, "end") + t(424, 196, "not", 16, 700, CORAL_D, "end")
    return svg(240, "Mongoose schema validation", "Code, schema check, then save or ValidationError.", b)


@fig(21, 3, "memory-vs-db.svg", "Why a database: tasks kept in an array live in the server's memory and are gone after a restart; tasks saved in MongoDB are still there when the server starts again.",
     "The proof: add a task")
def _():
    b = heading("What survives a restart?")
    b += rect(20, 56, 290, 200, CORAL_T, CORAL_D, 10) + t(36, 84, "let tasks = []", 16, 800, mono=True, bg=CORAL_T)
    b += t(36, 116, "lives in memory", 16, 500, bg=CORAL_T) + t(36, 160, "restart →", 16, 700, bg=CORAL_T)
    b += tb(140, 140, 150, 40, [("[ ] empty", 16, 700, CORAL_D)], fill=WHITE, stroke=CORAL_D, shadow=False)
    b += t(36, 228, "every task lost", 16, 700, CORAL_D, bg=CORAL_T)
    b += rect(330, 56, 290, 200, GREEN_T, GREEN, 10) + t(346, 84, "MongoDB", 16, 800, bg=GREEN_T)
    b += t(346, 116, "kept on disk", 16, 500, bg=GREEN_T) + t(346, 160, "restart →", 16, 700, bg=GREEN_T)
    b += tb(450, 140, 150, 40, [("3 tasks", 16, 700, GREEN)], fill=WHITE, stroke=GREEN, shadow=False)
    b += t(346, 228, "still there", 16, 700, GREEN, bg=GREEN_T)
    return svg(274, "Memory versus a database", "An array emptied by a restart beside a database that keeps its data.", b)


@fig(22, 1, "password-hash.svg", "Storing passwords: the server keeps only a hash — a one-way scramble from a slow algorithm such as bcrypt. At login it hashes what was typed and compares the two hashes; if the database leaks, the passwords do not.",
     "**3. Never store passwords.**")
def _():
    b = heading("Store the hash, never the password")
    b += tb(20, 64, 170, 50, [('"orange-canoe"', 16, 700)], fill=SOFT)
    b += arr(192, 89, 236, 89) + tb(240, 64, 120, 50, ["bcrypt"], fill=GOLD_T, stroke=INK2) + arr(362, 89, 396, 89)
    b += tb(400, 64, 220, 50, [("$2b$12$Kx9…", 16, 700)], fill=TEAL_T)
    b += t(510, 140, "stored in the database", 16, 600, TEAL_D, "middle")
    b += t(300, 140, "one way only", 16, 700, CORAL_D, "middle")
    b += tb(20, 170, 600, 76, [("At login: hash what was typed, compare the hashes.", 16, 700), ("A leaked database shows hashes, not passwords.", 16, 500, INK2)], a="start")
    return svg(262, "Password hashing", "A password turned one way into a stored hash.", b)


@fig(22, 2, "deploy-steps.svg", "Deploying a Node server: push the code to GitHub without .env or node_modules, connect the repository to a host, set the build command (npm install) and start command (node server.js), add environment variables such as MONGODB_URI in the host's settings, and the host gives you a live address.",
     "Deploying means running your server")
def _():
    b = heading("From your repo to a live address")
    b += tb(20, 60, 170, 76, [("GitHub repo", 16, 800), ("no .env,", 16, 500, INK2), ("no node_modules", 16, 500, INK2)], fill=SOFT)
    b += arr(192, 98, 226, 98)
    b += rect(230, 56, 230, 186, GOLD_T, INK2, 10) + fit(230, 56, 230, 186, t(345, 84, "Host settings", 16, 800, INK, "middle", bg=GOLD_T)
                                                          + t(244, 116, "build: npm install", 16, 600, mono=False, bg=GOLD_T)
                                                          + t(244, 144, "start: node server.js", 16, 600, bg=GOLD_T)
                                                          + t(244, 180, "env: MONGODB_URI", 16, 600, TEAL_D, bg=GOLD_T)
                                                          + t(244, 208, "env: PORT (set by host)", 16, 600, TEAL_D, bg=GOLD_T))
    b += arr(462, 98, 496, 98) + tb(500, 60, 120, 76, [("live", 16, 800, GREEN), ("https://…", 16, 600)], fill=GREEN_T, stroke=GREEN)
    b += t(20, 276, "listen on process.env.PORT || 3000", 16, 700, mono=True)
    return svg(296, "Deploying a server", "Repository, host settings and the live address.", b)


@fig(22, 3, "route-order.svg", "Express checks routes from top to bottom and uses the first that matches, so /api/tasks/search must come before /api/tasks/:id — otherwise \"search\" is read as an id.",
     "Route order matters")
def _():
    b = heading("The first matching route wins")
    b += tb(20, 60, 230, 50, [("GET /api/tasks/search", 16, 700)], fill=GOLD_T, stroke=INK2)
    b += rect(280, 56, 340, 120, GREEN_T, GREEN, 10) + t(296, 82, "Right order", 16, 800, GREEN, bg=GREEN_T)
    b += t(296, 114, "1. /api/tasks/search  ✓ match", 16, 700, GREEN, mono=False, bg=GREEN_T) + t(296, 146, "2. /api/tasks/:id", 16, 500, INK2, bg=GREEN_T)
    b += rect(280, 190, 340, 120, CORAL_T, CORAL_D, 10) + t(296, 216, "Wrong order", 16, 800, CORAL_D, bg=CORAL_T)
    b += t(296, 248, "1. /api/tasks/:id  ← id = \"search\"", 16, 700, CORAL_D, bg=CORAL_T) + t(296, 280, "2. /api/tasks/search  never reached", 16, 500, INK2, bg=CORAL_T)
    b += arr(252, 86, 276, 86)
    return svg(328, "Express route order", "The same two routes in two orders.", b)


@fig(23, 3, "screen-states.svg", "Every screen that loads data has four designed states: loading while the request runs, empty with a first action, an error with a Retry button, and the list itself.",
     "Build screen by screen")
def _():
    b = heading("Design all four states, not one")
    st = [("Loading", ["Loading…"], SOFT), ("Empty", ["No books yet", "— add one"], SOFT), ("Error", ["Couldn't load.", "[ Retry ]"], CORAL_T), ("Loaded", ["Arrow of God", "Efuru"], GREEN_T)]
    for i, (h, lines, f) in enumerate(st):
        x = 20 + i * 154
        b += rect(x, 56, 140, 220, WHITE, INK2, 14) + t(x + 70, 300, h, 16, 800, INK, "middle")
        b += tb(x + 8, 96, 124, 120, [(l, 16, 600 if j == 0 else 500) for j, l in enumerate(lines)], fill=f, shadow=False, r=6)
    return svg(318, "The states of a data screen", "Four phone screens: loading, empty, error, loaded.", b)


@fig(24, 1, "full-stack-live.svg", "A deployed full-stack app has three parts: the front end on GitHub Pages calls the API on a Node host (where the environment variables live), which reads and writes MongoDB Atlas; the API allows only its own front end's address (CORS).",
     "**Deploy both halves**")
def _():
    b = heading("Three parts, all live")
    parts = [("Front end", "GitHub Pages", "HTML, CSS, JS"), ("API", "Node host", "env variables"), ("Database", "MongoDB Atlas", "allow the host")]
    for i, (a, s, n) in enumerate(parts):
        x = 20 + i * 212
        b += tb(x, 70, 176, 100, [(a, 18, 800), (s, 16, 600, TEAL_D), (n, 16, 500, INK2)], fill=GOLD_T if i == 1 else SOFT, stroke=INK2 if i == 1 else LINE)
        if i < 2: b += arr(x + 178, 108, x + 208, 108) + arr(x + 208, 132, x + 178, 132)
    b += t(216, 200, "fetch", 16, 700, INK, "middle", mono=True) + t(428, 200, "Mongoose", 16, 700, INK, "middle")
    b += t(20, 244, "CORS: the API accepts calls from its own front end only.", 16, 500, INK2)
    b += t(20, 270, "Test the live version, not localhost.", 16, 500, INK2)
    return svg(290, "A full-stack app, deployed", "Front end, API and database with arrows between them.", b)


@fig(24, 3, "demo-timeline.svg", "A three-minute showcase: 30 seconds on the problem, 90 seconds of live demo, 40 seconds on how you built it, 20 seconds on what is next.",
     "A simple structure")
def _():
    b = heading("Three minutes, mostly demo")
    parts = [("Problem", 30, SOFT), ("Demo", 90, GOLD_T), ("How", 40, SOFT), ("Next", 20, SOFT)]
    x = 20
    for h, s, f in parts:
        w = s / 180 * 600
        b += tb(x, 66, w, 70, [h, (f"{s} s", 16, 500, INK2)], fill=f, stroke=INK2 if f == GOLD_T else LINE, shadow=False, r=4)
        x += w
    b += t(20, 166, "0:00", 16, 600, INK2) + t(620, 166, "3:00", 16, 600, INK2, "end")
    b += t(20, 206, "Rehearse twice with a timer; keep screenshots as a backup.", 16, 500, INK2)
    return svg(226, "Showcase timing", "A bar split into problem, demo, how and next.", b)
