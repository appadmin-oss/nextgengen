"""
Diagrams for the Coding course and the seven Technology Foundations courses, and their place in the lessons.

  assets/learn-media/coding/*.svg   Practical Coding — Full Stack Web Developer
  assets/learn-media/tech/*.svg     AI, Cybersecurity, Software Development, Robotics, Automation,
                                    Tech Product Design, Product Management

Run:  python3 tools/learn-media/tech.py          (then: node tools/learn-media/tech_check.js)

Why these pictures and not more (Mayer's multimedia principles, which the owner asked for): a lesson gets a
picture only where the idea IS a picture — a flow, a structure, a comparison, a labelled anatomy — and it sits
directly after the paragraph it explains (spatial contiguity), with short labels only (coherence). The lesson
viewer shows the alt text as the figure's caption (CurFigure in components.jsx), so the alt states the
information in words and no separate caption line is written. Lessons with no entry here were skipped on
purpose: a checklist, a presentation plan or a recap is already clearest as the text it is.

Re-running is safe: every image line this script owns (media:coding/… and media:tech/…) is removed from a body
before the current set is inserted, so nothing duplicates, and a figure removed here disappears from the lesson.
Only the `body` of a lesson changes; the file keeps its own formatting (indent 2, UTF-8, trailing newline).
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import tech_coding, tech_courses   # noqa: E402

SEEDS = {"coding": os.path.join(ROOT, "api", "_lib", "seeds", "curriculum-practical-coding-2026.json"),
         "tech": os.path.join(ROOT, "api", "_lib", "seeds", "curriculum-tech-foundations-2026.json")}
OURS = re.compile(r"\n\n!\[[^\]\n]*\]\(media:(?:coding|tech)/[^)\s]+\)(?=\n\n|\n?$)")


def place(body, anchor, line):
    """Insert `line` as its own block after the block of the 'Understand it' section that contains `anchor`."""
    start = body.index("## Understand it")
    end = body.index("\n## ", start + 5)
    i = body.find(anchor, start, end)
    assert i >= 0, f"anchor not found in Understand it: {anchor!r}"
    # walk forward to the end of this block: the first blank line outside a code fence
    lines = body[i:end].split("\n")
    fence = body[start:i].count("```") % 2 == 1
    pos = i
    for ln in lines:
        if ln.startswith("```"):
            fence = not fence
        elif ln.strip() == "" and not fence:
            break
        pos += len(ln) + 1
    pos -= 1                                    # back onto the end of the last line of the block
    return body[:pos] + "\n\n" + line + body[pos:]


def main():
    out = {"coding": os.path.join(ROOT, "assets", "learn-media", "coding"), "tech": os.path.join(ROOT, "assets", "learn-media", "tech")}
    for d in out.values():
        os.makedirs(d, exist_ok=True)
    groups = {"coding": tech_coding.FIGS, "tech": tech_courses.FIGS}
    report = {}
    for key, figs in groups.items():
        names = [f["name"] for f in figs]
        assert len(names) == len(set(names)), "duplicate file name"
        raw = open(SEEDS[key], encoding="utf-8").read()
        seed = json.loads(raw)
        by = {(L["course"], L["week"], L["position"]): L for L in seed["lessons"]}
        for L in seed["lessons"]:
            L["body"] = OURS.sub("", L["body"])
        for f in figs:
            s = f["fn"]()
            open(os.path.join(out[key], f["name"]), "w", encoding="utf-8").write(s)
            L = by[(f["course"], f["week"], f["pos"])]
            assert "]" not in f["alt"] and "\n" not in f["alt"], f["name"]
            L["body"] = place(L["body"], f["anchor"], f"![{f['alt']}](media:{key}/{f['name']})")
            report.setdefault(f["course"], set()).add((f["week"], f["pos"]))
        text = json.dumps(seed, ensure_ascii=False, indent=2) + "\n"
        if text != raw:
            open(SEEDS[key], "w", encoding="utf-8").write(text)
        # every lesson's non-body keys are untouched: compare against the file as it was
        old = json.loads(raw)
        for a, b in zip(old["lessons"], seed["lessons"]):
            assert {k: v for k, v in a.items() if k != "body"} == {k: v for k, v in b.items() if k != "body"}
            assert OURS.sub("", a["body"]) == OURS.sub("", b["body"])
    n = sum(len(g) for g in groups.values())
    for c, s in report.items():
        print(f"{c}: {len(s)} lessons illustrated")
    print(f"{n} diagrams written")


if __name__ == "__main__":
    main()
