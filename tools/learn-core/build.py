"""
Build the core courses (Data Appreciation, Desktop Publishing) from lessons.py + media.py:

  assets/learn-media/core/*.svg               diagrams
  assets/learn-media/core/shots/*.html        worked-example pages (shots.js renders each to a .png beside it)
  assets/learn-media/core/decks/{da,dtp}-NN.html   one printable slide deck per lesson
  assets/learn-media/core/guides/{da,dtp}.html     the course's learning guide: twelve weeks on one page
  api/_lib/seeds/curriculum-core-digital-2026.json

Run:  python3 tools/learn-core/build.py && node tools/learn-core/shots.js
Everything is generated; edit lessons.py or media.py, never the outputs.
"""
import json, os, re, sys
from html import escape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from lessons import DTP, LEVEL               # noqa: E402
from lessons_da import DA                   # noqa: E402
import media, media_more                    # noqa: E402


def diagrams():
    return {**media.diagrams(), **media_more.diagrams()}


def shots():
    return {**media.shots(), **media_more.shots()}

OUT = os.path.join(ROOT, "assets", "learn-media", "core")
COURSES = [("da", "Data Appreciation", DA), ("dtp", "Desktop Publishing", DTP)]


def md_inline(s):
    """The little Markdown a slide needs: bold, code, links. Escaped first."""
    s = escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s


DECK_CSS = """
:root{--ink:#16233f;--ink2:#3d4560;--line:#c9cedb;--soft:#f3f5fa;--gold:#f5b026}
*{box-sizing:border-box}html,body{margin:0;background:#e9ecf3;color:var(--ink);font-family:'Inter','Segoe UI',Arial,sans-serif}
.deck{height:100vh;overflow-y:auto;scroll-snap-type:y mandatory}
.s{min-height:100vh;scroll-snap-align:start;display:flex;align-items:center;justify-content:center;padding:24px 16px}
.c{background:#fff;width:min(960px,100%);aspect-ratio:16/9;border-radius:14px;padding:clamp(18px,4vw,48px);display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 14px rgba(22,35,63,.12);overflow:auto}
.k{font-size:14px;font-weight:700;color:var(--ink2);letter-spacing:.02em}
h1{font-size:clamp(26px,4.4vw,44px);line-height:1.1;margin:0}h2{font-size:clamp(22px,3.4vw,34px);margin:0}
p,li{font-size:clamp(16px,2vw,21px);line-height:1.45;margin:0}ul,ol{margin:0;padding-left:1.2em;display:grid;gap:8px}
.bar{height:6px;width:72px;background:var(--gold);border-radius:3px}
.fig{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.fig img{max-width:100%;max-height:100%;object-fit:contain}
dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:0;font-size:clamp(15px,1.9vw,20px)}dt{font-weight:700}dd{margin:0}
code{background:var(--soft);padding:1px 6px;border-radius:5px}
.nav{position:fixed;right:12px;bottom:12px;display:flex;gap:8px}
.nav button{min-width:44px;min-height:44px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--ink);font-weight:700;font-size:18px;font-family:inherit;cursor:pointer}
.foot{margin-top:auto;font-size:14px;color:var(--ink2)}
@media print{html,body{background:#fff}.deck{height:auto;overflow:visible}.s{min-height:0;padding:0;page-break-after:always}.c{box-shadow:none;border:1px solid var(--line)}.nav{display:none}}
"""

DECK_JS = """
(function(){var d=document.querySelector('.deck'),ss=[].slice.call(document.querySelectorAll('.s'));
function at(){var t=d.scrollTop,b=0;ss.forEach(function(s,i){if(s.offsetTop-4<=t)b=i});return b}
function go(i){i=Math.max(0,Math.min(ss.length-1,i));d.scrollTo({top:ss[i].offsetTop,behavior:'smooth'})}
document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' '){e.preventDefault();go(at()+1)}
if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();go(at()-1)}});
document.getElementById('nx').onclick=function(){go(at()+1)};document.getElementById('pv').onclick=function(){go(at()-1)};})();
"""


def slide(inner, kicker):
    return f'<section class="s" aria-label="{escape(kicker)}"><div class="c"><span class="k">{escape(kicker)}</span>{inner}</div></section>'


def understand_slides(text):
    """Split the explanation into slide-sized pieces at blank lines, keeping a list with its lead-in."""
    out, cur = [], []
    for block in text.split("\n\n"):
        if block.startswith("!["):
            continue                                   # the worked-example picture gets its own slide
        cur.append(block)
        if sum(len(b) for b in cur) > 420:
            out.append(cur); cur = []
    if cur: out.append(cur)
    html = []
    for blocks in out:
        parts = []
        for b in blocks:
            lines = b.split("\n")
            if all(re.match(r"^(\- |\d+\. )", l) for l in lines):
                tag = "ol" if re.match(r"^\d+\. ", lines[0]) else "ul"
                parts.append(f"<{tag}>" + "".join(f"<li>{md_inline(re.sub(r'^(- |\d+\. )', '', l))}</li>" for l in lines) + f"</{tag}>")
            elif any(re.match(r"^(\- |\d+\. )", l) for l in lines[1:]):
                parts.append(f"<p>{md_inline(lines[0])}</p>")
                items = lines[1:]
                tag = "ol" if re.match(r"^\d+\. ", items[0]) else "ul"
                parts.append(f"<{tag}>" + "".join(f"<li>{md_inline(re.sub(r'^(- |\d+\. )', '', l))}</li>" for l in items) + f"</{tag}>")
            else:
                parts.append(f"<p>{md_inline(b)}</p>")
        html.append("".join(parts))
    return html


def deck(code, course, L):
    n = len(L)
    k = lambda s: f"{course} · Week {L['w']} · {s}"
    S = [slide(f'<div class="bar"></div><h1>{escape(L["title"])}</h1><p>{escape(L["summary"])}</p>'
               f'<p class="foot">Next Generation Genius · {escape(LEVEL)}</p>', k("Title"))]
    S.append(slide("<h2>By the end of today</h2><ul>" + "".join(f"<li>{escape(o)}</li>" for o in L["objectives"]) + "</ul>", k("Goals")))
    for i, h in enumerate(understand_slides(L["understand"])):
        S.append(slide(f"<h2>Understand it</h2>{h}", k(f"Idea {i + 1}")))
    for fig in [L.get("figure"), L.get("figure2")]:
        if fig:
            S.append(slide(f'<h2>{escape(fig[1])}</h2><div class="fig"><img src="../{fig[0]}" alt="{escape(fig[1])}"></div>', k("Picture")))
    for m in re.finditer(r"!\[(.+?)\]\(media:core/(.+?)\)", L["understand"]):
        S.append(slide(f'<h2>Worked example</h2><div class="fig"><img src="../{m.group(2)}" alt="{escape(m.group(1))}"></div><p>{escape(m.group(1))}</p>', k("Worked example")))
    S.append(slide("<h2>Key words</h2><dl>" + "".join(f"<dt>{escape(a)}</dt><dd>{escape(b)}</dd>" for a, b in L["words"]) + "</dl>", k("Key words")))
    S.append(slide("<h2>Now you do it</h2><ol>" + "".join(f"<li>{escape(d)}</li>" for d in L["do"]) + "</ol>"
                   f'<p><b>Need a hand?</b> {escape(L["support"])}</p><p><b>Done early?</b> {escape(L["stretch"])}</p>', k("Practice")))
    S.append(slide("<h2>How you will be assessed</h2><ul>" + "".join(f"<li>{escape(c['prompt'])}</li>" for c in L["checks"]) + "</ul>"
                   "<p>Your work is marked against the rubric, and you may be asked to explain your choices. Show your own thinking.</p>", k("Assessment")))
    S.append(slide("<h2>At home this week</h2><ul>" + "".join(f"<li>{escape(h)}</li>" for h in L["home"]) + "</ul>"
                   "<h2>Read and explore</h2><ul>" + "".join(f'<li>{escape(t)} — {escape(g)}</li>' for _, t, g in L["read"]) + "</ul>", k("Home")))
    return (f'<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(course)} · Week {L["w"]}: {escape(L["title"])}</title><style>{DECK_CSS}</style>'
            f'<main class="deck">{"".join(S)}</main><div class="nav"><button id="pv" aria-label="Previous slide">‹</button>'
            f'<button id="nx" aria-label="Next slide">›</button></div><script>{DECK_JS}</script></html>')


def guide(code, course, lessons, intro):
    rows = "".join(
        f'<tr><th scope="row">{L["w"]}</th><td><b>{escape(L["title"])}</b><br>{escape(L["summary"])}</td>'
        f'<td><ul>{"".join(f"<li>{escape(o)}</li>" for o in L["objectives"])}</ul></td>'
        f'<td><a href="../decks/{code}-{L["w"]:02d}.html">Slides</a></td></tr>' for L in lessons)
    return (f'<!doctype html><html lang="en-GB"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(course)} — learning guide</title><style>{DECK_CSS}'
            'body{padding:16px}.g{background:#fff;max-width:980px;margin:auto;padding:clamp(16px,4vw,40px);border-radius:14px}'
            'table{border-collapse:collapse;width:100%}th,td{border-top:1px solid var(--line);padding:10px 8px;vertical-align:top;text-align:left;font-size:15px}'
            'td ul{padding-left:1em;gap:2px}td li{font-size:14px}a{color:#1a4fb4}'
            '@media print{.g{padding:0}a{color:var(--ink)}}</style>'
            f'<div class="g"><span class="k">Next Generation Genius · {escape(LEVEL)} · every member</span><h1>{escape(course)}</h1>'
            f'<p>{escape(intro)}</p><h2 style="margin-top:20px">How each Saturday works</h2><ol>'
            '<li><b>Recall</b> — the session opens with last week\'s questions, before anything new.</li>'
            '<li><b>Understand</b> — one idea, a picture of it and a worked example.</li>'
            '<li><b>Do</b> — practise it on something real, with support and stretch.</li>'
            '<li><b>Show</b> — every week ends in work that is assessed: a practical, an outside exercise, a written answer.</li></ol>'
            '<h2 style="margin-top:20px">The twelve weeks</h2><table><thead><tr><th scope="col">Wk</th><th scope="col">Lesson</th>'
            f'<th scope="col">You will be able to</th><th scope="col">Deck</th></tr></thead><tbody>{rows}</tbody></table></div></html>')


INTRO = {
    "da": "What every computer user should know about data, from the very basics to confident everyday use: how a computer "
          "stores data and how big it is, files and folders, saving and backing up, typing and accurate data entry, "
          "spreadsheets and formulas, sorting and charts, checking what you find online, keeping accounts and personal data "
          "safe, and sharing and working together. Free tools only: your own file manager, Google Sheets or LibreOffice Calc.",
    "dtp": "Every flyer, programme, newsletter and certificate somebody reads was designed by somebody. In twelve Saturdays you "
           "learn page set-up, type and hierarchy, grids, colour, images and print preparation, and you finish with a "
           "four-page magazine printed for your centre. Free tools only: Canva, Google Docs, LibreOffice and Scribus.",
}


def body(L):
    figs = "".join(f"\n\n![{f[1]}](media:core/{f[0]})" for f in [L.get("figure"), L.get("figure2")] if f)
    parts = [
        "## What to do\n\n" + "\n".join(f"- {d}" for d in L["do"]),
        "## Understand it\n\n" + L["understand"] + figs,
        "## Key words\n\n" + "\n".join(f"- **{a}:** {b}" for a, b in L["words"]),
        "## Read and watch\n\n" + "\n".join(f"- [{t}]({u}) — {g}" for u, t, g in L["read"]),
        "## Practise at home\n\n" + "\n".join(f"- {h}" for h in L["home"]),
        "## Make it fit you\n\n" + f"- **If this is new to you:** {L['support']}\n- **If you already can:** {L['stretch']}",
        "## Assessed this week\n\n" + "\n".join(f"- {c['prompt']}" for c in L["checks"])
        + "\n\nYou may be asked to explain your work: the marks are for your own thinking.",
    ]
    return "\n\n".join(parts)


def check(c):
    out = {"kind": c["kind"], "prompt": c["prompt"], "points": c.get("points", 1)}
    if c["kind"] == "mcq":
        out.update(options=c["options"], answer=c["answer"])
        if c.get("whys"): out["whys"] = c["whys"]
    elif c["kind"] == "order":
        out["options"] = c["options"]
    else:
        out["answer"] = c.get("answer", "")
        if c.get("rubric"): out["rubric"] = c["rubric"]
        if c["kind"] == "evidence": out["url"] = c["url"]
    return out


def main():
    os.makedirs(os.path.join(OUT, "shots"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "decks"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "guides"), exist_ok=True)
    for name, s in diagrams().items():
        open(os.path.join(OUT, name if name.endswith(".svg") else name + ".svg"), "w").write(s)
    for name, s in shots().items():
        open(os.path.join(OUT, "shots", name + ".html"), "w").write(s)
    rows = []
    for code, course, lessons in COURSES:
        open(os.path.join(OUT, "guides", code + ".html"), "w").write(guide(code, course, lessons, INTRO[code]))
        for L in lessons:
            open(os.path.join(OUT, "decks", f"{code}-{L['w']:02d}.html"), "w").write(deck(code, course, L))
            for f in [L.get("figure"), L.get("figure2")]:
                if f: assert os.path.isfile(os.path.join(OUT, f[0])), f"missing diagram {f[0]}"
            mats = [{"url": f"media:core/decks/{code}-{L['w']:02d}.html", "title": f"Slides: {L['title']}", "kind": "slides",
                     "guide": "The lesson as a presentation — use it in class, or go through it again at home. Arrow keys move; it prints one slide a page."}]
            if L["w"] == 1:
                mats.append({"url": f"media:core/guides/{code}.html", "title": f"{course} — learning guide", "kind": "doc",
                             "guide": "The whole course on one page: twelve weeks, what you will be able to do, and how each Saturday works."})
            for f in [L.get("figure"), L.get("figure2")]:
                if f: mats.append({"url": f"media:core/{f[0]}", "title": f[1], "kind": "image", "guide": "Today's diagram — print it or keep it on your phone."})
            for m in re.finditer(r"!\[(.+?)\]\(media:core/(shots/.+?)\)", L["understand"]):
                mats.append({"url": f"media:core/{m.group(2)}", "title": m.group(1), "kind": "image", "guide": "The worked example, step by step."})
            for u, t, g in L["read"]:
                mats.append({"url": u, "title": t, "kind": "link", "guide": g})
            rows.append({"course": course, "level": LEVEL, "week": L["w"], "position": 1, "title": L["title"], "summary": L["summary"],
                         "objectives": L["objectives"], "body": body(L), "durationMins": 120, "passMark": 60,
                         "materials": mats, "checks": [check(c) for c in L["checks"]]})
    seed = {"key": "core-digital-2026", "title": "Data Appreciation and Desktop Publishing — every member (2026)", "allowNewCourse": False,
            "description": "Two courses every member takes, replacing the Media Lab's six Club-wide lessons: Data Appreciation (what every computer user "
                           "should know about data, basics to intermediate: storage, files, backup, data entry, spreadsheets and formulas, charts, "
                           "checking sources, safety and sharing) and Desktop Publishing (page set-up, type, grids, colour, "
                           "images and print-ready files). Twelve Saturdays each, with diagrams, worked-example screenshots, a slide deck per "
                           "lesson, a learning guide, and assessment that is not only multiple choice.",
            "source": "NGG curriculum team, from the investigation cycle (PPDAC) and data-education frameworks, and common DTP syllabi",
            "lessons": rows}
    with open(os.path.join(ROOT, "api", "_lib", "seeds", "curriculum-core-digital-2026.json"), "w") as fh:
        json.dump(seed, fh, ensure_ascii=False, indent=1)
    print(f"{len(rows)} lessons, {len(diagrams())} diagrams, {len(shots())} shots")


if __name__ == "__main__":
    main()
