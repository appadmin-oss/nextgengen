#!/usr/bin/env python3
"""Cut a Phosphor icon font down to the icons the site uses (docs/PERFORMANCE.md).

    python3 tools/phosphor-subset.py IN.woff2 OUT.woff2 CODEPOINTS

CODEPOINTS is a file of hex codepoints, one per line (build.js writes it from the trimmed phosphor CSS, so the
font and the stylesheet name exactly the same icons). Needs fontTools and brotli (pip install fonttools brotli);
build.js runs this when they are available and otherwise ships the full font, so a build never breaks for want
of Python. The output is committed under vendor/phosphor/subset/, named by a hash of the icon set, so builds
without Python reuse it.
"""
import sys

from fontTools import subset
from fontTools.ttLib import TTFont


def main(src: str, dst: str, cps_file: str) -> None:
    with open(cps_file, encoding="utf-8") as fh:
        cps = sorted({int(line.strip(), 16) for line in fh if line.strip()})
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]      # Phosphor's ligatures stay usable
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.drop_tables += ["DSIG"]
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=cps)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(dst)
    have = set(TTFont(dst).getBestCmap().keys())
    missing = [hex(c) for c in cps if c not in have and c in set(TTFont(src).getBestCmap().keys())]
    if missing:
        sys.exit("subset lost icons: " + ", ".join(missing[:10]))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
