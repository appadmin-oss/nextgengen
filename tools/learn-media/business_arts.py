"""
Diagrams for four Learn seed files, and the lines that place them in the lesson bodies:

  api/_lib/seeds/curriculum-business-tool-first-2026.json   → assets/learn-media/business/*.svg
  api/_lib/seeds/curriculum-divisions-2026.json             → assets/learn-media/divisions/*.svg
  api/_lib/seeds/curriculum-media-lab-2026.json             → assets/learn-media/medialab/*.svg
  api/_lib/seeds/curriculum-studio-trades-2026.json         → assets/learn-media/arts/*.svg

Run:  python3 tools/learn-media/business_arts.py      (then: node tools/learn-media/ba_check.js)

Why only some lessons get a picture (Mayer's multimedia principles): a diagram goes in where it carries the idea —
a process, a framework, a layout, a scale — and nowhere for decoration (coherence). Each picture is placed directly
after the paragraph it explains (spatial contiguity), its words are the lesson's own words and numbers, and its alt
text — which the lesson page also shows as the caption — states the information, not the look.

Idempotent: every run first removes the image lines this script owns (media:business/, divisions/, medialab/, arts/
and the italic caption directly under one), then inserts them again. Nothing else in a body is touched, and each
JSON file is written back in its own formatting (indent 2, UTF-8, trailing newline), so a re-run with no drawing
change leaves the seeds byte-identical. Shipped seed revisions carry the new bodies to untouched seeded lessons.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import ba_business, ba_divisions, ba_medialab, ba_trades     # noqa: E402

SEEDS = {
    "business": ("curriculum-business-tool-first-2026.json", ba_business),
    "divisions": ("curriculum-divisions-2026.json", ba_divisions),
    "medialab": ("curriculum-media-lab-2026.json", ba_medialab),
    "arts": ("curriculum-studio-trades-2026.json", ba_trades),
}
OWNED = re.compile(r"\n\n!\[[^\]\n]*\]\(media:(?:business|divisions|medialab|arts)/[a-z0-9_-]+\.svg\)(?:\n\n\*[^\n*][^\n]*\*(?=\n\n|$))?")
NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")


def place(body, anchor, line):
    """Insert `line` as its own block straight after the block of the Understand section that holds `anchor`."""
    start = body.find("## Understand it")
    start = 0 if start < 0 else start
    nxt = body.find("\n## ", start + 5)
    end = len(body) if nxt < 0 else nxt
    i = body.find(anchor, start, end)
    if i < 0:
        i = body.find(anchor)
    assert i >= 0, f"anchor not found: {anchor!r}"
    j = body.find("\n\n", i)
    j = len(body) if j < 0 else j
    return body[:j] + "\n\n" + line + body[j:]


def main():
    total, per = 0, {}
    for folder, (fname, mod) in SEEDS.items():
        figs = []
        mod.figures(lambda *a, **k: figs.append((a, k)))
        p = os.path.join(ROOT, "api", "_lib", "seeds", fname)
        data = json.load(open(p, encoding="utf-8"))
        L = data["lessons"]
        out_dir = os.path.join(ROOT, "assets", "learn-media", folder)
        os.makedirs(out_dir, exist_ok=True)
        for les in L:
            les["body"] = OWNED.sub("", les["body"])
        seen, done, bad = set(), {}, []
        for (idx, title_has, name, anchor, alt, svg), k in figs:
            les = L[idx]
            assert title_has in les["title"], f"{folder} #{idx}: {les['title']!r} lacks {title_has!r}"
            assert les.get("status") != "retired", f"{folder} #{idx} is retired"
            assert NAME.match(name) and name not in seen, f"bad or duplicate name {name}"
            assert "]" not in alt and "\n" not in alt and len(alt) <= 400, f"alt for {name}"
            seen.add(name)
            with open(os.path.join(out_dir, name + ".svg"), "w", encoding="utf-8") as fh:
                fh.write(svg)
            line = f"![{alt}](media:{folder}/{name}.svg)"
            if k.get("caption"):
                line += f"\n\n*{k['caption']}*"
            try:
                les["body"] = place(les["body"], anchor, line)
            except AssertionError as e:
                bad.append(f"{folder} #{idx} {name}: {e}"); continue
            done[idx] = done.get(idx, 0) + 1
        assert not bad, "\n".join(bad)
        # Leave no orphan from an earlier run whose drawing has since been dropped.
        for f in os.listdir(out_dir):
            if f.endswith(".svg") and f[:-4] not in seen:
                os.remove(os.path.join(out_dir, f))
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        live = [i for i, l in enumerate(L) if l.get("status") != "retired"]
        per[folder] = (len(seen), len(done), len(live))
        total += len(seen)
    for f, (n, lessons, live) in per.items():
        print(f"{f:10s} {n:3d} diagrams in {lessons:2d} of {live} live lessons")
    print(f"total {total}")


if __name__ == "__main__":
    main()
