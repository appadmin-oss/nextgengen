"""Media Lab — Digital Creative Learning. The six retired Club-wide lessons are left alone."""
import math
from ba_kit import *   # noqa: F401,F403

# A 12-hue painter's (RYB) wheel, as design classes teach it: complementary pairs sit opposite (blue ↔ orange).
WHEEL = [("Red", "#e53935"), ("Red-orange", "#f4511e"), ("Orange", "#fb8c00"), ("Yellow-orange", "#ffb300"), ("Yellow", "#fdd835"),
         ("Yellow-green", "#9ccc65"), ("Green", "#43a047"), ("Blue-green", "#00897b"), ("Blue", "#1e88e5"), ("Blue-violet", "#3949ab"),
         ("Violet", "#8e24aa"), ("Red-violet", "#d81b60")]


def figure(cx, top, s=1.0, fill=GOLD, eyes=False):
    """A plain framing figure (head and shoulders to feet) — a stand-in for the subject, not an illustration."""
    e = (circle(cx - 7 * s, top + 19 * s, 2.4 * s, INK) + circle(cx + 7 * s, top + 19 * s, 2.4 * s, INK)) if eyes else ""
    return (circle(cx, top + 22 * s, 20 * s, fill, INK, 1.5) + e + rect(cx - 34 * s, top + 46 * s, 68 * s, 80 * s, fill, INK, 1.5, 12 * s)
            + rect(cx - 26 * s, top + 128 * s, 20 * s, 70 * s, fill, INK, 1.5, 6) + rect(cx + 6 * s, top + 128 * s, 20 * s, 70 * s, fill, INK, 1.5, 6))


def figures(add):
    # 6 · Visual hierarchy
    b, y = title("Three levels of hierarchy on one poster")
    px, pw = 60, 250
    b += box(px, y, pw, 340, WHITE, INK)
    b += t(px + 18, y + 54, "Clean Gutters", 28, 800) + t(px + 18, y + 88, "Saturday", 28, 800)
    b += rect(px + 18, y + 108, pw - 36, 120, TEAL_T, LINE, 1, 4)
    b += t(px + 18, y + 256, "Sat 14 March · 8am", 18, 700) + t(px + 18, y + 280, "Ojuelegba Road", 18, 700)
    b += t(px + 18, y + 320, "Call 0803 000 0000", 16, 500, INK2)
    for i, (yy, s, sub) in enumerate([(y + 70, "Headline", "the one thing to remember"), (y + 262, "Supporting", "what, when, where"), (y + 326, "Details", "small print, contact")]):
        b += badge(px + pw + 40, yy - 6, i + 1) + t(px + pw + 64, yy, s, 16, 800) + t(px + pw + 64, yy + 22, sub, 16, 500, INK2)
    n, y = notes(y + 372, "Size, contrast, position, space and weight decide the order. If everything is big, nothing is.")
    b += n
    alt = "A poster with three levels: a large bold headline seen first, then supporting information (when and where), then small details and contact."
    add(6, "visual hierarchy", "poster-hierarchy", "If everything is big, nothing is", alt, svg(y, "Visual hierarchy", alt, b))

    # 7 · Poster set
    b, y = title("A set: change the image and headline, keep everything else")
    heads = ["Bags block gutters", "Floods reach homes", "Bring your own bag"]
    for i, h in enumerate(heads):
        x = 24 + i * 202
        b += box(x, y, 186, 260, WHITE, INK)
        b += rect(x + 12, y + 12, 162, 50, GOLD, r=3)
        p, _ = para(x + 20, y + 32, 146, h, 16, 800, INK, bg=GOLD)
        b += p
        b += rect(x + 12, y + 72, 162, 110, [TEAL_T, CORAL_T, GREEN_T][i], LINE, 1, 3)
        b += t(x + 93, y + 132, f"photo {i + 1}", 16, 600, INK2, "middle", [TEAL_T, CORAL_T, GREEN_T][i])
        b += rect(x + 12, y + 196, 120, 10, LINE, r=3) + rect(x + 12, y + 214, 90, 10, LINE, r=3)
        b += circle(x + 158, y + 228, 14, INK)
    y += 280
    b += t(24, y + 10, "Same: colours, fonts, grid, logo position.", 16, 700)
    b += t(24, y + 36, "Changes: the image and the headline.", 16, 700, CORAL_D)
    n, y = notes(y + 72, "Poster 1 states the problem, poster 2 the effect on people, poster 3 the action. Then the 3-second test.")
    b += n
    alt = "Three posters that belong together: the same headline bar, layout grid, colours and logo position, each with its own photo and headline — the problem, the effect, the action."
    add(7, "Month 1 challenge", "poster-set", "Make them a **set**", alt, svg(y, "A poster set", alt, b))

    # 8 · Colour wheel and 60-30-10
    b, y = title("The colour wheel: opposites contrast, neighbours calm")
    cx, cy, R, r0 = 190, y + 170, 140, 70
    for i, (name, hexv) in enumerate(WHEEL):
        a1 = math.radians(-90 - 15 + i * 30); a2 = a1 + math.radians(30)
        p = lambda a, rr: (cx + rr * math.cos(a), cy + rr * math.sin(a))
        (x1, y1), (x2, y2), (x3, y3), (x4, y4) = p(a1, R), p(a2, R), p(a2, r0), p(a1, r0)
        b += f'<path d="M{x1:.1f} {y1:.1f} A{R} {R} 0 0 1 {x2:.1f} {y2:.1f} L{x3:.1f} {y3:.1f} A{r0} {r0} 0 0 0 {x4:.1f} {y4:.1f} Z" fill="{hexv}" stroke="#fff" stroke-width="2"/>'
    ang = lambda i: math.radians(-90 + i * 30)
    pa, pb = (cx + 104 * math.cos(ang(8)), cy + 104 * math.sin(ang(8))), (cx + 104 * math.cos(ang(2)), cy + 104 * math.sin(ang(2)))
    b += line(pa[0], pa[1], pb[0], pb[1], INK, 3)
    for q in (pa, pb): b += circle(q[0], q[1], 7, WHITE, INK, 2.5)
    b += f'<path d="M{cx + (R + 12) * math.cos(ang(6) - 0.2):.1f} {cy + (R + 12) * math.sin(ang(6) - 0.2):.1f} A{R + 12} {R + 12} 0 0 1 {cx + (R + 12) * math.cos(ang(8) + 0.2):.1f} {cy + (R + 12) * math.sin(ang(8) + 0.2):.1f}" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'
    lx = 360
    b += t(lx, y + 40, "Complementary", 18, 800) + t(lx, y + 64, "opposite: blue and orange,", 16, 500, INK2) + t(lx, y + 86, "the straight line", 16, 500, INK2)
    b += t(lx, y + 130, "Analogous", 18, 800) + t(lx, y + 154, "neighbours: green, blue-green,", 16, 500, INK2) + t(lx, y + 176, "blue, the outer arc", 16, 500, INK2)
    b += t(lx, y + 220, "Monochrome", 18, 800) + t(lx, y + 244, "shades of one colour", 16, 500, INK2)
    y = cy + R + 34
    b += t(24, y, "60-30-10: main, secondary, accent", 18, 800)
    b += rect(24, y + 14, (W - 48) * .6, 40, "#dfe8f5", INK, 1) + rect(24 + (W - 48) * .6, y + 14, (W - 48) * .3, 40, "#1e3a8a", INK, 1) + rect(24 + (W - 48) * .9, y + 14, (W - 48) * .1, 40, "#fb8c00", INK, 1)
    b += t(36, y + 40, "60% background", 16, 700, INK, bg="#dfe8f5") + t(24 + (W - 48) * .6 + 12, y + 40, "30%", 16, 800, WHITE, bg="#1e3a8a")
    b += t(W - 24, y + 76, "10% accent: the headline or button", 16, 700, INK, "end")
    n, y = notes(y + 112, "Text must still read: aim for 4.5:1, and never rely on red against green alone — about 1 in 12 men cannot easily tell them apart.")
    b += n
    alt = ("A twelve-hue colour wheel: complementary colours sit opposite (blue and orange); analogous colours are neighbours (green, blue-green, blue). "
           "Below, a 60-30-10 bar: 60% main colour, 30% secondary, 10% accent for the most important thing.")
    add(8, "Colour", "colour-wheel", "**60-30-10** rule", alt, svg(y, "The colour wheel", alt, b))

    # 9 · Typography
    b, y = title("Serif, sans-serif, display — and the space between lines")
    for i, (fam, lab, sub) in enumerate((("Georgia,'Times New Roman',serif", "Serif", "small feet: traditional"), ("Arial,Helvetica,sans-serif", "Sans-serif", "clean: easy on screens"),
                                          ("'Comic Sans MS','Brush Script MT',cursive", "Display", "a few big words only"))):
        x = 24 + i * 202
        b += box(x, y, 186, 120, SOFT)
        b += f'<text x="{x + 93}" y="{y + 66}" font-size="44" font-weight="700" fill="{INK}" text-anchor="middle" style="font-family:{fam}">Ag</text>'
        b += t(x + 93, y + 92, lab, 16, 800, INK, "middle", SOFT) + t(x + 93, y + 112, sub, 16, 500, INK2, "middle", SOFT)
    y += 150
    b += t(24, y + 26, "Headline at least twice the body", 30, 800)
    by = y + 64
    for k in range(3):
        b += t(24, by + k * 24, ["Body text with leading of 1.3 to 1.5 times its", "size is comfortable to read, line after line,", "aligned left with a ragged right edge."][k], 16, 500)
    n, y = notes(by + 96, "16 px text on 24 px lines is a leading of 1.5. At most two typefaces; pair contrasting ones; keep body text plain. Avoid long runs of capitals.")
    b += n
    alt = "Serif type has small feet and feels traditional, sans-serif is clean and screen-friendly, display type is for a few large words; the headline is at least twice the body size, with body line spacing of 1.3–1.5."
    add(9, "Typography", "type-basics", "**leading**", alt, svg(y, "Typography basics", alt, b))

    # 10 · Layout grid
    b, y = title("Margins, a three-column grid, and grouped information")
    px, pw, ph = 140, 360, 440
    b += rect(px, y, pw, ph, WHITE, INK, 2)
    m_, g = 28, 14
    cw = (pw - 2 * m_ - 2 * g) / 3
    for k in range(3): b += rect(px + m_ + k * (cw + g), y + m_, cw, ph - 2 * m_, TEAL_T, op=0.8)
    b += rect(px + m_, y + m_, pw - 2 * m_, 60, GOLD, r=3) + t(px + m_ + 12, y + m_ + 38, "Headline", 20, 800, INK, bg=GOLD)
    b += rect(px + m_, y + m_ + 76, 2 * cw + g, 160, CORAL_T, r=3) + t(px + m_ + 12, y + m_ + 160, "Photo, 2 columns", 16, 700, INK, bg=CORAL_T)
    b += rect(px + m_, y + m_ + 252, 2 * cw + g, 80, SOFT, INK2, 1, 3)
    b += t(px + m_ + 10, y + m_ + 278, "Date · time · place", 16, 700, INK, bg=SOFT) + t(px + m_ + 10, y + m_ + 302, "grouped together", 16, 500, INK2, bg=SOFT)
    b += circle(px + pw - m_ - cw / 2, y + ph - m_ - 30, 22, INK)
    b += path(f"M{px - 6} {y} h-14 M{px - 13} {y} v{m_} M{px - 20} {y + m_} h14", INK2, sw=1.5)
    b += t(px - 26, y + 22, "margin", 16, 700, INK, "end")
    b += t(px + pw + 16, y + m_ + 36, "columns", 16, 700) + t(px + pw + 16, y + m_ + 58, "and gutters", 16, 700)
    b += t(px + pw + 16, y + ph - m_ - 24, "logo on its own", 16, 700)
    n, y = notes(y + ph + 30, "Everything lines up with a column edge; related things sit close; empty space lets the important things breathe.")
    b += n
    alt = "A page with an even margin and three columns with gutters: the headline spans all three, the photo two, the date-time-place block is grouped together, and the logo sits on its own."
    add(10, "Layout and the grid", "layout-grid", "A **grid** makes all of this easier", alt, svg(y, "Layout grid", alt, b))

    # 11 · Platform sizes to scale
    b, y = title("Start at the right size: the frames, to scale")
    specs = [("1080 × 1350", "Feed 4:5", 1080, 1350), ("1080 × 1080", "Square 1:1", 1080, 1080), ("1080 × 1920", "Stories 9:16", 1080, 1920), ("1200 × 675", "X, LinkedIn 16:9", 1200, 675)]
    sc = 0.11
    x = 24
    for i, (px_, lab, w_, h_) in enumerate(specs):
        ww, hh = w_ * sc, h_ * sc
        if i == 3: ww, hh = w_ * sc, h_ * sc
        b += rect(x, y + 240 - hh, ww, hh, TEAL_T, INK, 1.5, 4)
        if i == 2:
            b += rect(x, y + 240 - hh, ww, 26, CORAL_T, INK, 1, 4) + rect(x, y + 240 - 34, ww, 34, CORAL_T, INK, 1, 4)
        b += t(x, y + 264, lab, 16, 800) + t(x, y + 286, px_, 16, 500, INK2)
        x += ww + 16
    n, y = notes(y + 320, "Red bands on the Story frame: buttons and the profile name cover them, so keep text clear. One message, six words or fewer, large type.")
    b += n
    alt = "Common sizes drawn to the same scale: a 1080 × 1350 feed post (4:5), a 1080 × 1080 square, a 1080 × 1920 Story (9:16) whose top and bottom are covered by buttons, and a 1200 × 675 landscape image."
    add(11, "social media graphic", "platform-sizes", "Start with the **right size**", alt, svg(y, "Social media sizes", alt, b))

    # 12 · Logo types
    b, y = title("Three kinds of logo, and the clear space around them")
    kinds = [("Wordmark", "the name in a set font"), ("Symbol", "a picture or shape"), ("Combination", "symbol plus name")]
    for i, (h, s) in enumerate(kinds):
        x = 24 + i * 202
        b += box(x, y, 186, 170, SOFT)
        if i == 0: b += t(x + 93, y + 84, "kora", 34, 800, INK, "middle", SOFT)
        if i == 1: b += circle(x + 93, y + 70, 34, TEAL_D) + circle(x + 93, y + 70, 14, SOFT)
        if i == 2: b += circle(x + 50, y + 70, 22, TEAL_D) + circle(x + 50, y + 70, 9, SOFT) + t(x + 84, y + 82, "kora", 28, 800, INK, bg=SOFT)
        b += t(x + 93, y + 132, h, 16, 800, INK, "middle", SOFT) + t(x + 93, y + 156, s, 16, 500, INK2, "middle", SOFT)
    y += 196
    b += rect(200, y, 240, 120, WHITE, CORAL_D, 1.5).replace('stroke-width="1.5"', 'stroke-width="1.5" stroke-dasharray="6 5"')
    b += circle(280, y + 60, 22, TEAL_D) + circle(280, y + 60, 9, WHITE) + t(314, y + 72, "kora", 28, 800)
    b += t(320, y + 146, "clear space: nothing enters the dashed box", 16, 700, CORAL_D, "middle")
    n, y = notes(y + 182, "Test it small (a badge, a phone screen) and in one colour. If you cannot draw it from memory, it is too complicated.")
    b += n
    alt = "Three logo types — a wordmark (the name in a font), a symbol (a shape), and a combination of both — and the clear space a brand guide keeps empty around the logo."
    add(12, "Branding basics", "logo-types", "Logos come in a few types", alt, svg(y, "Logo types", alt, b))

    # 13 · Invitation and certificate
    b, y = title("An invitation and a certificate: what is biggest, and why")
    b += box(24, y, 280, 340, WHITE, INK)
    b += t(40, y + 46, "Media Lab Showcase", 22, 800)
    b += rect(40, y + 66, 248, 72, GOLD_T, r=4) + t(52, y + 94, "Sat 22 Nov · 11am", 16, 800, INK, bg=GOLD_T) + t(52, y + 120, "Egbeda Centre hall", 16, 700, INK, bg=GOLD_T)
    b += t(40, y + 170, "From the Media Lab team", 16, 500, INK2) + circle(270, y + 166, 14, INK)
    b += t(40, y + 220, "RSVP to 0803 000 0000", 16, 700) + t(40, y + 244, "by 20 November", 16, 700)
    b += t(40, y + 300, "1 name · 2 when and where", 16, 600, TEAL_D) + t(40, y + 322, "3 who · 4 what to do", 16, 600, TEAL_D)
    x = 324
    b += box(x, y, 292, 340, WHITE, INK) + rect(x + 12, y + 12, 268, 316, "none", GOLD, 3, 4)
    b += t(x + 146, y + 62, "Certificate", 18, 700, INK2, "middle")
    b += t(x + 146, y + 120, "Kemi Adeyemi", 28, 800, INK, "middle")
    for k, s in enumerate(["for completing the Media Lab", "Foundation Programme, 2026"]):
        b += t(x + 146, y + 160 + k * 22, s, 16, 500, INK2, "middle")
    b += line(x + 40, y + 268, x + 130, y + 268, INK2) + line(x + 162, y + 268, x + 252, y + 268, INK2)
    b += t(x + 85, y + 292, "signature", 16, 500, INK2, "middle") + t(x + 207, y + 292, "date", 16, 500, INK2, "middle")
    n, y = notes(y + 372, "Invitation: the event's name first, when-and-where grouped. Certificate: the person's name largest, centred, generous margins. Check every spelling twice.")
    b += n
    alt = "An invitation ordered name, then grouped date and place, then who is inviting, then the RSVP; a certificate centred with the person's name largest, the reason in precise words, and signature and date lines."
    add(13, "invitation and a certificate", "invite-certificate", "**A certificate**", alt, svg(y, "Invitation and certificate", alt, b))

    # 15 · Core outwards
    b, y = title("Build a brand package from the core outwards")
    cx, cy = W / 2, y + 170
    for r, f in ((165, SOFT), (110, TEAL_T), (55, GOLD)):
        b += circle(cx, cy, r, f, LINE, 1.5)
    b += t(cx, cy + 6, "Logo", 18, 800, INK, "middle", GOLD)
    b += t(cx, cy - 74, "Palette and type", 16, 800, INK, "middle", TEAL_T)
    b += t(cx, cy - 132, "Poster · post · invitation · badge", 16, 700, INK, "middle", SOFT)
    b += t(cx, cy + 142, "each adapted to its format", 16, 500, INK2, "middle", SOFT)
    n, y = notes(cy + 196, "Fix the exact colour codes and fonts in a shared folder first. Then lay every piece side by side: same colours in the same roles, logo in the same place, every fact the same.")
    b += n
    alt = "Three rings: the logo at the core, then the fixed palette and type, then the pieces — poster, social post, invitation, badge — each adapted to its format."
    add(15, "Month 2 challenge", "core-outwards", "Work **from the core outwards**", alt, svg(y, "From the core outwards", alt, b))

    # 16 · Camera angles
    b, y = title("Camera height changes how big the subject feels")
    gy = y + 250
    b += line(24, gy, W - 24, gy, INK2, 2)
    b += figure(W / 2 + 80, gy - 198, 1.0)
    cams = [(80, gy - 230, "High: smaller"), (80, gy - 130, "Eye level: equal"), (80, gy - 30, "Low: powerful")]
    for x, yy, s in cams:
        b += rect(x, yy - 12, 40, 24, INK, r=4)
        b += line(x + 40, yy, W / 2 + 46, gy - 120, INK2, 1.5, "5 4")
        b += t(x - 4, yy - 20, s, 16, 700, INK)
    n, y = notes(gy + 34, "Crouch to a child's eye level rather than pointing down at them. Wide, medium and close shots of the same moment tell different parts of it.")
    b += n
    alt = "Side view of a camera at three heights: from above the subject looks smaller, at eye level equal, from below powerful."
    add(16, "Photography 1", "camera-angles", "**Angles.**", alt, svg(y, "Camera angles", alt, b))

    # 17 · Light direction
    b, y = title("Where the light comes from, seen from above")
    sx, sy = W / 2, y + 190
    b += circle(sx, sy, 34, GOLD, INK, 2) + t(sx, sy + 6, "face", 16, 800, INK, "middle", GOLD)
    b += rect(sx - 20, sy + 116, 40, 26, INK, r=4) + t(sx, sy + 166, "camera", 16, 700, INK, "middle")
    import math as _m
    for ang, lab, sub, an in ((-90, "Back", "silhouette, glowing edges", "middle"), (180, "Side", "shape and texture", "end"), (45, "Front", "even, can look flat", "start")):
        a = _m.radians(ang)
        lx, ly = sx + 150 * _m.cos(a), sy + 150 * _m.sin(a)
        b += circle(lx, ly, 18, "#fff3c4", AMBER_D, 2)
        b += arrow(lx - 26 * _m.cos(a), ly - 26 * _m.sin(a), sx + 46 * _m.cos(a), sy + 46 * _m.sin(a))
        if an == "middle":
            b += t(lx + 30, ly - 4, lab, 16, 800) + t(lx + 30, ly + 18, sub, 16, 500, INK2)
        elif an == "end":
            b += t(lx, ly - 30, lab, 16, 800, INK, "middle") + t(lx - 4, ly + 44, sub, 16, 500, INK2, "start" if lx - 4 < 200 else "end")
        else:
            b += t(lx + 28, ly - 2, lab, 16, 800) + t(lx + 28, ly + 20, sub, 16, 500, INK2)
    n, y = notes(sy + 206, "Midday sun is hard: stand people in open shade facing the bright area. The hour after sunrise and before sunset is soft, warm and low.")
    b += n
    alt = "Top view of light around a face: from the side it shows shape and texture; from the front (behind the camera) it is even but can be flat; from behind it makes a silhouette with glowing edges."
    add(17, "Photography 2", "light-direction", "**Direction.**", alt, svg(y, "Light direction", alt, b))

    # 18 · Portrait consent
    b, y = steps_v("Before a portrait: permission first", [
        ("Explain", "Who you are, what the photo is for, where it will appear."),
        ("Ask, and accept “no” happily", "No consent: do not photograph, or make them unidentifiable."),
        ("Under 18?", "A parent or guardian's signed consent form as well."),
        ("Show them the shot", "Relaxed people make better portraits.")], fills=[SOFT, SOFT, GOLD_T, SOFT])
    alt = "Portrait permission in order: explain who you are and where it will appear, ask and accept no, get a guardian's signed form for anyone under 18, then show them the shot."
    add(18, "Portraits", "portrait-consent", "**Ask first, always.**", alt, svg(y, "Portrait permission", alt, b))

    # 19 · Edit order
    b, y = chain_h("Edit in this order: each step affects the next", [("1 Crop", "and level"), ("2 Exposure", "brightness"), ("3 Contrast", "lights and darks"),
                                                                     ("4 Colour", "white balance"), ("5 Sharpen", "a little, last")], bw=None,
                   note="Improving light and colour is editing. Adding or removing people or objects, or changing what happened, makes a photograph misleading.")
    alt = "Photo edits in order: crop and straighten, exposure, contrast with highlights and shadows, colour and white balance, then a little sharpening — never adding or removing content."
    add(19, "Editing photos", "edit-order", "**Sharpen**", alt, svg(y, "Photo editing order", alt, b))

    # 20 · Caption and inverted pyramid
    b, y = title("A caption says what the picture cannot")
    b += box(24, y, W - 48, 74, CORAL_T) + t(40, y + 30, "“Fun day!!”", 18, 800, INK, bg=CORAL_T) + t(40, y + 56, "says nothing a viewer did not already see", 16, 500, INK2, bg=CORAL_T)
    y += 90
    b += box(24, y, W - 48, 100, GREEN_T)
    p, yy = para(40, y + 30, W - 80, "“Kemi, 13, tests the water filter her team built at Egbeda centre on Saturday.”", 18, 700, INK, bg=GREEN_T)
    b += p + t(40, yy + 30, "who · what · where · when — and only with her permission", 16, 500, INK2, bg=GREEN_T)
    y += 124
    p, y = para(24, y + 10, W - 48, "Articles follow the inverted pyramid: the first sentence answers who, what, when, where and why; detail follows; the least important comes last.", 16, 600)
    b += p
    alt = "“Fun day!!” tells the viewer nothing; “Kemi, 13, tests the water filter her team built at Egbeda centre on Saturday” gives who, what, where and when — with permission."
    add(20, "Writing for media", "caption-example", "**Captions**", alt, svg(y + 12, "Writing a caption", alt, b))

    # 21 · Three acts
    b, y = title("Three acts: a person, a problem, a change")
    x0, x1, base = 40, W - 40, y + 220
    m = lambda f: x0 + f * (x1 - x0)
    b += rect(m(0), y, m(0.25) - m(0), base - y, GOLD_T) + rect(m(0.25), y, m(0.75) - m(0.25), base - y, CORAL_T) + rect(m(0.75), y, m(1) - m(0.75), base - y, GREEN_T)
    b += path(f"M{m(0):.1f} {base - 30} C{m(0.3):.1f} {base - 50} {m(0.55):.1f} {base - 120} {m(0.72):.1f} {base - 190} S{m(0.9):.1f} {base - 60} {m(1):.1f} {base - 50}", INK, sw=3)
    for f, h, s in ((0.125, "Beginning", "the person, their world"), (0.5, "Middle", "the problem, what they try"), (0.875, "End", "what changed")):
        b += t(m(f), base + 26, h, 16, 800, INK, "middle")
        p, _ = para(m(f), base + 48, 150 if f != 0.5 else 240, s, 16, 500, INK2, "middle")
        b += p
    b += t(m(0.5), y + 26, "tension keeps us watching", 16, 700, INK, "middle", CORAL_T)
    n, y = notes(base + 98, "Show, don't tell: “She walked to the borehole twice before school, every day, for a year.”")
    b += n
    alt = "Three acts with a tension curve: the beginning introduces the person and their world, tension rises through the middle as they face the problem, and the end shows what changed."
    add(21, "Storytelling", "three-acts", "The classic three acts", alt, svg(y, "Three-act structure", alt, b))

    # 22 · Shot list
    b, y = title("A photo-story shot list")
    shots = [("Establishing", "the place"), ("Portrait", "the main person"), ("Action", "what they do"), ("Detail", "hands, tools, faces"), ("Interaction", "people together"),
             ("Closing", "how it ends")]
    for i, (h, s) in enumerate(shots):
        x, yy = 24 + (i % 3) * 202, y + (i // 3) * 130
        f = GOLD_T if i in (0, 5) else SOFT
        b += box(x, yy, 186, 112, f) + rect(x + 12, yy + 12, 50, 36, WHITE, INK2, 1, 3)
        b += t(x + 37, yy + 36, str(i + 1), 16, 800, INK, "middle")
        b += t(x + 74, yy + 36, h, 16, 800, INK, bg=f) + t(x + 12, yy + 82, s, 16, 500, INK2, bg=f)
    n, y = notes(y + 276, "Get permission early from everyone who will appear, and from parents or guardians for children. Plan who gathers names and quotes for the captions.")
    b += n
    alt = "A six-shot list for a photo story: establishing (the place), portrait, action, detail, interaction, and a closing shot with the result or feeling."
    add(22, "Planning the photo story", "shot-list", "**Write a shot list.**", alt, svg(y, "Photo-story shot list", alt, b))

    # 23 · Select and sequence
    b, y = title("Choosing is where the story is made")
    stages = [("All your photos", "about 60", W - 48), ("Remove blurred, badly lit, no consent", "about 35", W - 148), ("The strongest, each adding something new", "5 to 8", W - 248)]
    for i, (h, n_, w_) in enumerate(stages):
        x = (W - w_) / 2
        f = [SOFT, TEAL_T, GOLD][i]
        b += rect(x, y + i * 62, w_, 52, f, INK, 1, 8) + t(W / 2, y + i * 62 + 22, h, 16, 700, INK, "middle", f) + t(W / 2, y + i * 62 + 44, n_, 16, 600, INK, "middle", f)
    y += 200
    seq = [("Wide", 70), ("Medium", 54), ("Close", 40), ("Wide", 70), ("Close", 40), ("Medium", 54)]
    x = 24
    for s, h in seq:
        b += rect(x, y + 70 - h, 88, h, TEAL_T, INK, 1, 3) + t(x + 44, y + 92, s, 16, 600, INK, "middle")
        x += 100
    n, y = notes(y + 128, "Vary wide, medium and close so the rhythm does not go flat; open strong, end with feeling; edit colour and brightness to match.")
    b += n
    alt = "About 60 photos narrow to about 35 after removing blurred, badly lit or unconsented shots, then to the strongest 5–8; the final sequence varies wide, medium and close shots."
    add(23, "Month 3 challenge", "select-sequence", "**Sequence.**", alt, svg(y, "Selecting and sequencing", alt, b))

    # 24a · Shot-size ladder
    b, y = title("Shot sizes: how much of the person is in the frame")
    sizes = [("Wide", "the whole place", 0.42, 0.0), ("Medium", "waist up", 0.95, 0.0), ("Close-up", "the face", 2.1, 0.0), ("Extreme close-up", "eyes, hands, a detail", 4.0, 0.0)]
    fw, fh = 136, 110
    for i, (h, s, sc, _) in enumerate(sizes):
        x = 24 + i * 152
        b += f'<clipPath id="c{i}"><rect x="{x}" y="{y}" width="{fw}" height="{fh}"/></clipPath>'
        b += rect(x, y, fw, fh, TEAL_T)
        cx_, top = x + fw / 2, y + {0: 14, 1: 30, 2: 9, 3: 55 - 19 * sc}[i]
        b += f'<g clip-path="url(#c{i})">' + figure(cx_, top, sc, eyes=i >= 2) + '</g>'
        b += rect(x, y, fw, fh, "none", INK, 2)
        b += t(x, y + fh + 26, h, 16, 800)
        p, _ = para(x, y + fh + 48, fw, s, 16, 500, INK2)
        b += p
    n, y = notes(y + fh + 110, "Change size between shots: wide to set the scene, medium for the action, close-up for emotion. Two same-size shots from the same angle look like a jump.")
    b += n
    alt = "Four shot sizes of the same person: wide shows the whole place, medium is waist up, close-up is the face, extreme close-up is a detail such as eyes or hands."
    add(24, "storyboarding", "shot-sizes", "**The shot size**", alt, svg(y, "Shot sizes", alt, b))

    # 24b · Storyboard frame
    b, y = title("A storyboard: one box per shot, with notes")
    frames = [("WIDE · eye level", "Market at dawn", "street sounds · 4 s"), ("MEDIUM · still", "Tailor threads machine", "machine starts · 3 s"), ("CLOSE-UP · low", "Her face, smiling", "“I started with one…” · 5 s")]
    for i, (sz, act, snd) in enumerate(frames):
        x = 24 + i * 202
        b += rect(x, y, 186, 110, WHITE, INK, 2, 4)
        b += t(x + 93, y + 62, f"shot {i + 1}", 16, 600, INK2, "middle")
        b += t(x, y + 136, sz, 16, 800, TEAL_D)
        p, yy = para(x, y + 160, 186, act, 16, 600)
        b += p
        p, _ = para(x, yy + 22, 186, snd, 16, 500, INK2)
        b += p
    n, y = notes(y + 250, "Each frame: shot size, angle, movement, what happens, what is heard, roughly how long. Stick figures are fine; someone else should be able to film it.")
    b += n
    alt = "A three-frame storyboard: shot 1 wide at eye level of the market at dawn, shot 2 medium of the tailor threading her machine, shot 3 a low close-up of her face — each with sound and length."
    add(24, "storyboarding", "storyboard", "Stick figures are fine", alt, svg(y, "A storyboard", alt, b))

    # 25 · Orientation
    b, y = title("Choose the orientation before you press record")
    b += rect(60, y, 140, 249, TEAL_T, INK, 2, 10) + t(130, y + 130, "9:16", 22, 800, INK, "middle", TEAL_T)
    b += t(130, y + 280, "Vertical", 16, 800, INK, "middle")
    for k, s in enumerate(["Stories, Reels,", "TikTok, Status"]): b += t(130, y + 302 + k * 22, s, 16, 500, INK2, "middle")
    b += rect(250, y + 60, 340, 191, TEAL_T, INK, 2, 10) + t(420, y + 162, "16:9", 22, 800, INK, "middle", TEAL_T)
    b += t(420, y + 280, "Horizontal", 16, 800, INK, "middle")
    for k, s in enumerate(["YouTube, presentations,", "screens"]): b += t(420, y + 302 + k * 22, s, 16, 500, INK2, "middle")
    n, y = notes(y + 372, "A vertical clip cannot become a good horizontal one. Both hands, elbows in, or rest the phone on something solid; face the subject towards the light.")
    b += n
    alt = "A 9:16 vertical frame for Stories, Reels, TikTok and Status beside a 16:9 horizontal frame for YouTube and screens — decided before recording."
    add(25, "shooting on a phone", "orientation", "**Orientation on purpose.**", alt, svg(y, "Orientation", alt, b))

    # 26 · J and L cuts
    b, y = title("Straight cut, J-cut and L-cut on the timeline")
    rows = [("Straight cut", 0), ("J-cut: next sound first", -60), ("L-cut: last sound carries on", 60)]
    for i, (h, off) in enumerate(rows):
        yy = y + i * 112
        b += t(24, yy + 18, h, 16, 800)
        cut = 320
        b += rect(24, yy + 30, cut - 24, 32, TEAL_T, INK, 1, 3) + rect(cut, yy + 30, W - 24 - cut, 32, GOLD_T, INK, 1, 3)
        b += t(36, yy + 52, "picture A", 16, 600, INK, bg=TEAL_T) + t(cut + 12, yy + 52, "picture B", 16, 600, INK, bg=GOLD_T)
        a_end = cut + off
        b += rect(24, yy + 66, a_end - 24, 26, TEAL_T, INK2, 1, 3) + rect(a_end, yy + 66, W - 24 - a_end, 26, GOLD_T, INK2, 1, 3)
        b += t(36, yy + 85, "sound A", 16, 500, INK, bg=TEAL_T) + t(W - 36, yy + 85, "sound B", 16, 500, INK, "end", GOLD_T)
        b += line(cut, yy + 24, cut, yy + 98, CORAL_D, 2, "4 3")
    n, y = notes(y + 350, "Most cuts are plain cuts. Cut on action to hide the join; let sound lead or trail the picture so edits flow.")
    b += n
    alt = "Three edits on a timeline: a straight cut changes picture and sound together; a J-cut starts the next clip's sound before its picture; an L-cut lets the last clip's sound carry on under the new picture."
    add(26, "editing basics", "j-l-cuts", "**J- and L-cuts**", alt, svg(y, "J-cuts and L-cuts", alt, b))

    # 27 · Soundtrack layers
    b, y = title("Three layers of sound, and music dipped under speech")
    x0, x1 = 150, W - 24
    lanes = [("Dialogue", TEAL), ("Music", GOLD), ("Atmosphere", GREEN_T)]
    for i, (h, c) in enumerate(lanes):
        yy = y + i * 80
        b += t(24, yy + 44, h, 16, 800)
        b += rect(x0, yy + 10, x1 - x0, 60, SOFT, LINE, 1, 4)
    sp = [(0.15, 0.4), (0.6, 0.85)]
    for a, c in sp:
        b += rect(x0 + a * (x1 - x0), y + 18, (c - a) * (x1 - x0), 44, TEAL, INK, 1, 3)
    pts = [(0, 30), (0.12, 30), (0.15, 56), (0.4, 56), (0.43, 30), (0.57, 30), (0.6, 56), (0.85, 56), (0.88, 30), (1, 30)]
    b += path("M" + " L".join(f"{x0 + f * (x1 - x0):.1f} {y + 80 + v:.1f}" for f, v in pts), AMBER_D, sw=3)
    b += path(f"M{x0} {y + 160 + 40} L{x1} {y + 160 + 40}", GREEN, sw=3)
    b += t(x0 + 0.275 * (x1 - x0), y + 132, "music dips", 16, 700, AMBER_D, "middle")
    n, y = notes(y + 262, "Use music licensed for your use and credit it; add subtitles, because most people watch social video with the sound off.")
    b += n
    alt = "Three sound layers on a timeline — dialogue, music and atmosphere — with the music level dipping down every time someone speaks."
    add(27, "sound, music and subtitles", "sound-layers", "Three layers make up a soundtrack", alt, svg(y, "Soundtrack layers", alt, b))

    # 28 · Interview setup
    b, y = title("An interview set-up, seen from above")
    cx, cy = 200, y + 160
    b += rect(cx - 20, cy + 70, 40, 26, INK, r=4) + t(cx, cy + 122, "camera", 16, 700, INK, "middle")
    b += circle(cx + 70, cy + 82, 18, TEAL_T, INK, 1.5) + t(cx + 98, cy + 88, "interviewer, beside the camera", 16, 700)
    b += circle(cx + 20, cy - 60, 40, GOLD, INK, 2) + t(cx + 20, cy - 54, "speaker", 16, 800, INK, "middle", GOLD)
    b += arrow(cx + 38, cy - 22, cx + 62, cy + 58, INK2, 2, "6 4")
    b += t(cx + 70, cy + 4, "looks at the interviewer, not the lens", 16, 600)
    b += circle(cx - 26, cy - 22, 6, CORAL_D) + t(cx - 40, cy - 16, "mic close", 16, 700, CORAL_D, "end")
    b += rect(cx - 170, cy - 120, 18, 120, "#fff3c4", AMBER_D, 2) + t(cx - 140, cy - 130, "window: soft light", 16, 700)
    n, y = notes(cy + 156, "Frame a medium close-up, slightly off-centre. Open questions, one at a time, then stay quiet — and no “mm-hm” while they speak.")
    b += n
    alt = "Top view of an interview: the interviewer sits beside the camera, the speaker looks at the interviewer rather than the lens, the microphone is close, and a window gives soft side light."
    add(28, "Interviews", "interview-setup", "**Setting up.**", alt, svg(y, "Interview set-up", alt, b))

    # 30 · Radio cut then B-roll
    b, y = title("Build the radio cut first, then cover it with B-roll")
    x0 = 24
    b += t(24, y + 18, "1  Radio cut: interview answers only, in story order", 16, 800)
    segs = [(0, 150), (156, 140), (302, 160), (468, 124)]
    for a, w_ in segs: b += rect(x0 + a, y + 30, w_, 34, TEAL_T, INK, 1, 3)
    b += t(24, y + 100, "2  B-roll laid over it, hiding the joins", 16, 800)
    for a, w_ in segs: b += rect(x0 + a, y + 150, w_, 34, TEAL_T, INK, 1, 3)
    for a, w_ in [(120, 80), (290, 70), (440, 90)]: b += rect(x0 + a, y + 112, w_, 34, GOLD, INK, 1, 3)
    b += t(x0 + 160, y + 210, "picture: B-roll", 16, 600, INK2, "middle") + t(W - 24, y + 210, "sound: the interview carries on", 16, 600, INK2, "end")
    n, y = notes(y + 248, "Log the footage first. When you shorten what someone said, the meaning must stay the same.")
    b += n
    alt = "First the radio cut: interview answers in story order make sense by sound alone. Then B-roll clips are laid over the joins while the interview audio continues underneath."
    add(30, "Editing the documentary", "radio-cut", "**Build a radio cut first.**", alt, svg(y, "Radio cut and B-roll", alt, b))

    # 33 · Content calendar
    b, y = title("A week's content calendar: pillars take turns")
    pill = {"Behind the scenes": TEAL_T, "Member story": GOLD_T, "Tips and skills": GREEN_T, "Event news": CORAL_T}
    rows = [["Mon", "Instagram", "Member story", "Carousel"], ["Tue", "WhatsApp", "Event news", "Status"], ["Wed", "TikTok", "Tips and skills", "Short video"],
            ["Thu", "Instagram", "Behind the scenes", "Photo"], ["Sat", "All", "Event news", "Story poll"]]
    fl = {(r, 2): pill[row[2]] for r, row in enumerate(rows)}
    tb, y2 = table(24, y, ["Day", "Platform", "Pillar", "Format"], rows, [70, 130, 210, 182], fills=fl)
    b += tb
    n, y = notes(y2 + 30, "One goal for the week (“30 families at the open day”), an owner and a status for each post, and room left for what happens on Saturday.")
    b += n
    alt = "A week's content calendar with day, platform, pillar and format, rotating between member stories, event news, tips and behind-the-scenes posts."
    add(33, "content calendar", "content-calendar", "A **content calendar**", alt, svg(y, "Content calendar", alt, b))

    # 34 · Funnel
    b, y = title("From seeing to doing: each step loses people")
    st = [("Reach", "2,000 people saw it"), ("Engagement", "140 liked, commented, shared, saved"), ("Clicks", "60 opened the link"), ("Conversions", "18 sent OPEN DAY")]
    for i, (h, s) in enumerate(st):
        w_ = W - 48 - i * 90
        x = (W - w_) / 2
        f = [SOFT, TEAL_T, GOLD_T, GOLD][i]
        b += rect(x, y + i * 60, w_, 52, f, INK, 1, 8) + t(W / 2, y + i * 60 + 22, h, 16, 800, INK, "middle", f) + t(W / 2, y + i * 60 + 44, s, 16, 500, INK, "middle", f)
    y += 250
    b += box(24, y, W - 48, 50, SOFT) + t(40, y + 32, "Engagement rate = 140 ÷ 2,000 × 100 = 7%", 18, 800, INK, bg=SOFT)
    n, y = notes(y + 82, "Conversions — people who did the action — matter most. Compare your posts with each other, not with celebrities.")
    b += n
    alt = "A funnel: 2,000 reached, 140 engaged (an engagement rate of 7%), 60 clicked, and 18 converted by doing the action asked."
    add(34, "Digital marketing", "marketing-funnel", "**Engagement rate**", alt, svg(y, "Marketing funnel", alt, b))

    # 36 · Promo timeline
    b, y = title("A 60-second promo, to the second")
    x0, x1 = 24, W - 24
    m = lambda s: x0 + s / 60 * (x1 - x0)
    parts = [(0, 3, "Hook", CORAL), (3, 50, "Message: show, don't tell", TEAL_T), (50, 60, "Call to action", GOLD)]
    for a, c, h, f in parts:
        b += rect(m(a), y, m(c) - m(a), 60, f, INK, 1)
    b += t(m(26), y + 36, "Message: show, don't tell", 16, 800, INK, "middle", TEAL_T)
    for s in (0, 50, 60): b += t(m(s), y + 84, f"{s} s", 16, 700, INK, "middle" if 0 < s < 60 else ("start" if s == 0 else "end"))
    b += t(m(0), y + 120, "Hook, 0–3 s: the most", 16, 800) + t(m(0), y + 142, "striking image, no logo", 16, 500, INK2)
    b += t(m(60), y + 120, "Call to action: what,", 16, 800, INK, "end") + t(m(60), y + 142, "when, where, long enough", 16, 500, INK2, "end")
    b += t(m(60), y + 164, "to read", 16, 500, INK2, "end")
    n, y = notes(y + 200, "Vertical 9:16, subtitles and on-screen words, licensed music, real members with consent. Test it on a phone with the sound off.")
    b += n
    alt = "A 60-second promo: a hook in the first 3 seconds, the message from 3 to about 50 seconds shown rather than told, and the call to action on screen for the last 5–10 seconds."
    add(36, "Promotional video", "promo-timeline", "**Call to action (last", alt, svg(y, "Promo video timeline", alt, b))

    # 37 · Campaign sequence
    b, y = title("A campaign week: curiosity, then reasons, then urgency")
    seq = ["Teaser", "Announcement", "Member story", "Behind the scenes", "Reminder", "Countdown", "Day-of"]
    for a, c, s, f in ((0, 2, "curiosity", PURPLE_T), (2, 4, "reasons to come", TEAL_T), (4, 7, "urgency", GOLD_T)):
        b += rect(24, y + a * 44, 190, (c - a) * 44 - 6, f, INK, 1, 6) + t(119, y + (a + c) * 22 + 3, s, 16, 800, INK, "middle", f)
    for i, s in enumerate(seq):
        b += rect(230, y + i * 44, 386, 38, SOFT, LINE, 1, 6) + t(244, y + i * 44 + 25, f"{i + 1}  {s}", 16, 700, INK, bg=SOFT)
    y += 7 * 44 - 40
    n, y = notes(y + 70, "One measurable goal (“40 registrations”), one key message repeated in different ways, and an assets list with an owner and deadline for each piece.")
    b += n
    alt = "A week of campaign posts in sequence — teaser, announcement, member story, behind the scenes, reminder, countdown, day-of — moving from curiosity to reasons to come to urgency."
    add(37, "Planning the social media campaign", "campaign-sequence", "**Content calendar**", alt, svg(y, "Campaign sequence", alt, b))

    # 40 · Kanban
    b, y = title("To do, Doing, Done: one card per task, one owner per card")
    cols = [("To do", ["Book the location · Ife", "Write captions · Tobi"]), ("Doing", ["Film B-roll at the market · Ada"]), ("Done", ["Write interview questions · Ada"])]
    cw = (W - 48 - 32) / 3
    for i, (h, cards) in enumerate(cols):
        x = 24 + i * (cw + 16)
        b += box(x, y, cw, 230, SOFT) + t(x + 12, y + 28, h, 18, 800, INK, bg=SOFT)
        yy = y + 44
        for s in cards:
            c, hh = card(x + 10, yy, cw - 20, None, s, WHITE, pad=10, bfill=INK, minh=58)
            b += c; yy += hh + 10
    n, y = notes(y + 262, "A five-minute stand-up each session: what I finished, what I am doing next, what is blocking me. Raise a slipping deadline early.")
    b += n
    alt = "A Kanban board with To do, Doing and Done columns, one card per small task and one owner on each card."
    add(40, "Project management", "kanban-lab", "**Kanban board**", alt, svg(y, "Kanban board", alt, b))

    # 41 · Feedback pattern
    b, y = chain_h("Feedback that helps: thing, effect, suggestion", [("The specific thing", "“The headline is pale yellow on white…”"), ("Its effect", "“…so it's hard to read from a distance…”"),
                                                                     ("A suggestion", "“…try navy.”")],
                   note="Not “it's bad” or “it's nice”. Praise specific things in public; raise problems in private.")
    alt = "Useful feedback in three parts: the specific thing (the headline is pale yellow on white), its effect (hard to read from a distance), and a suggestion (try navy)."
    add(41, "Leading a team", "feedback-pattern", "**Giving feedback**", alt, svg(y, "Giving feedback", alt, b))

    # 43 · One story, four pieces
    b, y = title("One community story, four pieces, one identity")
    cx, cy = W / 2, y + 150
    b += box(cx - 100, cy - 36, 200, 72, GOLD, INK) + t(cx, cy - 6, "One story", 18, 800, INK, "middle", GOLD) + t(cx, cy + 20, "one identity", 16, 600, INK, "middle", GOLD)
    pieces = [("Documentary", "2–3 minutes", -1, -1), ("Photo story", "5–8 images", 1, -1), ("Article", "about 300 words", -1, 1), ("Graphics", "poster and posts", 1, 1)]
    for h, s, sx, sy in pieces:
        x, yy = cx + sx * 200, cy + sy * 100
        c, _ = card(x - 95, yy - 32, 190, h, s, SOFT, hs=16, a="middle", pad=8, minh=64)
        b += c + line(x - sx * 95, yy, cx + sx * 100, cy + sy * 20, INK2, 2)
    n, y = notes(cy + 160, "Shared colours, fonts and title treatment; the same spelling of names and the same facts in every piece.")
    b += n
    alt = "One community story at the centre, told through four linked pieces — a 2–3 minute documentary, a 5–8 image photo story, a 300-word article and promotional graphics — sharing one visual identity."
    add(43, "community storytelling project", "one-story-four", "**Decide the pieces**", alt, svg(y, "One story, four pieces", alt, b))

    # 47 · Pathway
    b, y = title("The Lab's pathway: more skill, more responsibility")
    lv = [("Junior Creator", "uses the core tools; completes projects with support"), ("Creative Associate", "strong independent work; reliable in a team"),
          ("Team Lead", "plans and leads projects; mentors; owns quality")]
    for i, (h, s) in enumerate(lv):
        x = 24 + i * 200
        yy = y + (2 - i) * 70
        c, hh = card(x, yy, 192, h, s, [TEAL_T, GOLD_T, GOLD][i], minh=96)
        b += c
    n, y = notes(y + 280, "Set the next goal with a deadline: “Produce a three-minute documentary on my own by March.”")
    b += n
    alt = "Three steps up: Junior Creator uses the core tools with support, Creative Associate produces strong independent work, Team Lead plans and leads projects and mentors others."
    add(47, "Showcase and what comes next", "lab-pathway", "**Team Lead**", alt, svg(y, "The Lab pathway", alt, b))
