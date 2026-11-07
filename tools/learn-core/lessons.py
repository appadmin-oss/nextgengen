"""
Data Appreciation and Desktop Publishing — the lessons (owner, 7 Nov 2026: "Change it to Data Appreciation and
Desktop publishing. Fetch standard modern courses on them … with screenshots, diagrams and presentations and
appropriate learning guides and materials"). Courses every member takes (CURR_CORE_COURSES).

Shape, for both: twelve Saturdays, Year 1 · Foundation, each lesson one idea a 10–17 year old can USE the same
day, a picture of it, a worked example, practice, support and stretch, and an assessment that is not only
multiple choice (a practical or an outside exercise, a choice question whose wrong options name the slip,
an ordering or written answer).

Data Appreciation follows the investigation cycle (Problem → Plan → Data → Analysis → Conclusion) and the
themes data-education frameworks agree on: what data is, making and tidying it, summaries and charts, reading
them critically, bias, privacy and ethics, and telling the story. Free tools only: Google Sheets and CODAP.

Desktop Publishing follows what DTP courses commonly teach: page setup, typographic hierarchy, the grid and the
four layout principles, colour (RGB for screens, CMYK for print), images and resolution, multi-page documents,
and print-ready files with bleed. Free tools only — Canva, Google Docs/Slides, LibreOffice and Scribus —
because Microsoft Publisher's support ends in October 2026.
"""

LEVEL = "Year 1 · Foundation"

# Outside sources used across lessons: stable, reputable, free.
CODAP = ("https://codap.concord.org/", "CODAP — Common Online Data Analysis Platform", "A free data tool that runs in your browser: drag a column onto a graph and watch it draw.")
SHEETS_FN = ("https://support.google.com/docs/table/25273", "Google Sheets function list", "Look up any formula used today — AVERAGE, MEDIAN, MODE, COUNTIF.")
KHAN_STATS = ("https://www.khanacademy.org/math/statistics-probability", "Khan Academy — Statistics and probability", "Short videos and practice that check themselves; do the set named in the lesson.")
OWID = ("https://ourworldindata.org/", "Our World in Data", "Real charts about the whole world, each with its source — read them like a detective.")
GAPMINDER = ("https://www.gapminder.org/tools/", "Gapminder Tools", "Moving bubble charts of countries over time: press play and say what changes.")
NBS = ("https://nigerianstat.gov.ng/", "National Bureau of Statistics (Nigeria)", "Nigeria's official statistics: find one table about your state.")
FT_VOCAB = ("https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary", "FT Visual Vocabulary", "A newspaper's chart-choosing poster: which chart for which question.")
NDPC = ("https://ndpc.gov.ng/", "Nigeria Data Protection Commission", "Who protects personal data in Nigeria, and what the law (NDPA 2023) promises you.")
TEACHABLE = ("https://teachablemachine.withgoogle.com/", "Teachable Machine", "Train a tiny model in your browser — and see what happens when the training data leaves people out.")
FONTS_K = ("https://fonts.google.com/knowledge", "Google Fonts Knowledge", "Short, clear lessons on type: read the one named in the lesson.")
PRACT_TYPO = ("https://practicaltypography.com/", "Practical Typography", "The rules of good type for documents people actually read.")
CANVA_DS = ("https://edu.gcfglobal.org/en/beginning-graphic-design/", "GCFGlobal — Beginning Graphic Design", "Free, short, illustrated lessons on layout, type and colour; no account needed.")
SCRIBUS = ("https://www.scribus.net/", "Scribus", "Free, professional desktop publishing for Windows, Mac and Linux — what the print trade uses for free.")
LIBRE = ("https://help.libreoffice.org/", "LibreOffice Help", "Free office suite; Draw and Writer can lay out a flyer or newsletter.")
CONTRAST = ("https://webaim.org/resources/contrastchecker/", "WebAIM Contrast Checker", "Type two colours and see if text on them can be read (aim for 4.5:1).")
COLOR = ("https://color.adobe.com/create/color-wheel", "Adobe Color wheel", "Build a colour scheme from the colour wheel.")
CC = ("https://creativecommons.org/about/cclicenses/", "Creative Commons licences", "What you may and may not do with an image someone else made.")
UNSPLASH = ("https://unsplash.com/license", "Unsplash licence", "Free photos, and the rules for using them.")

# Data Appreciation lives in lessons_da.py (rebuilt 7 Nov 2026 as computer-user basics to intermediate).

DTP = [
 dict(w=1, title="What desktop publishing is — and the tools for it",
  summary="Desktop publishing is designing pages to be read — on paper or on screen. Free tools do it well.",
  objectives=["Say what desktop publishing is, with five examples", "Tell print design from screen design", "Choose a free tool for a job"],
  do=["Collect five printed things (a flyer, a programme, a receipt, a certificate, a menu)", "Say who each is for and what it must do", "Open Canva and one other free tool"],
  understand="**Desktop publishing (DTP)** is arranging text and pictures on a page so people can read and use it: flyers, posters, newsletters, certificates, brochures, programmes, menus.\n\nGood design is not decoration. A flyer must be read in three seconds from across the road; a programme must be found in the dark; a certificate must look official.\n\nThe tools (all free):\n\n- **Canva** — browser and phone, templates, easy sharing.\n- **Google Docs / Slides** — quick documents and single pages.\n- **LibreOffice Draw/Writer** — offline, on any computer.\n- **Scribus** — professional page layout for print, free.\n\n(Microsoft Publisher's support ends in October 2026, so it is not taught here.)",
  words=[("Desktop publishing", "designing pages of text and pictures"), ("Layout", "where things sit on the page"), ("Template", "a starting design you adapt")],
  read=[CANVA_DS, SCRIBUS, LIBRE], home=["Collect three printed things and rank them: easiest to read to hardest", "Say one thing that makes the best one work"],
  support="For each printed thing, answer: who is it for? what must they do after reading it?",
  stretch="Find one design that works badly and say exactly what you would change.",
  checks=[dict(kind="mcq", prompt="A shop wants 500 flyers printed and also a post for WhatsApp. What is the main difference to plan for?", options=["Print needs high resolution and print colours; the post needs a screen size", "There is no difference", "The post must have more text", "Print can use any image from the internet"], answer="Print needs high resolution and print colours; the post needs a screen size",
               whys=["", "Print and screen need different sizes, resolution and colour.", "Usually less: people scroll past.", "Copyright applies to both, and web images are often too low-resolution to print."]),
          dict(kind="task", prompt="Show your five collected printed things and explain, for one of them, who it is for and what it must make them do.", rubric="Up to 3: five real examples (1), audience named (1), purpose named (1).", points=3)]),
 dict(w=2, title="Setting up the page: size, orientation, margins",
  summary="Before any design, set up the page: the paper size, which way up, and the margins that keep things safe.",
  objectives=["Name common paper sizes (A4, A5, A3)", "Choose portrait or landscape", "Set margins and know why they matter"],
  do=["Fold an A4 sheet to make A5 and A6", "Set up an A5 portrait page in Canva or Docs", "Set 12 mm margins"],
  understand="**A-sizes** halve each time: A3 folded in half is A4; A4 folded is A5. A4 (210 × 297 mm) is the standard Nigerian document page; A5 is a handy flyer; A3 a small poster.\n\n**Orientation**: portrait (tall) or landscape (wide). Choose by the content — a list is tall, a timeline is wide.\n\n**Margins** are the empty border. They make a page look calm, stop text being cut off, and leave room for fingers. Keep at least 10–15 mm on a printed page. In Google Docs: **File → Page setup**; in Canva: choose a custom size in mm.\n\nDecide the size FIRST: changing it later moves everything.\n\n![A document-setup window: size, orientation, margins, columns and bleed chosen before anything is drawn](media:core/shots/dtp-document-setup.png)",
  words=[("A4", "210 × 297 mm, the standard document page"), ("Portrait / landscape", "tall / wide orientation"), ("Margin", "the empty border around the page")],
  read=[CANVA_DS, LIBRE], home=["Measure three printed things at home and name their sizes", "Find one where the text runs too close to the edge"],
  support="Fold paper to feel the sizes before choosing one on screen.",
  stretch="Work out how many A6 cards fit on one A3 sheet, and why printers use that.",
  checks=[dict(kind="mcq", prompt="If you fold an A4 sheet in half, what size is each half?", options=["A5", "A3", "A6", "Still A4"], answer="A5",
               whys=["", "A3 is twice A4, not half.", "A6 is half of A5 — fold again.", "Folding halves the size."]),
          dict(kind="task", prompt="Set up an A5 portrait page with 12 mm margins in Canva or Google Docs and show your instructor the settings.", rubric="Up to 3: A5 size (1), portrait (1), margins set (1).", points=3)]),
 dict(w=3, title="Type I: choosing and using fonts",
  summary="Most of a page is words. The right font, size and spacing make them easy to read.",
  objectives=["Tell serif from sans-serif fonts", "Set body text at a readable size and line length", "Use at most two fonts on a page"],
  do=["Compare three fonts on the same paragraph", "Find the size where your partner reads it easily at arm's length", "Set line spacing and line length"],
  understand="- **Serif** fonts have small strokes at the ends of letters (Georgia, Times); **sans-serif** fonts do not (Arial, Inter). Both are readable; pick one for body text and keep it.\n- **Size**: body text for print is usually 10–12 pt; for screens 16 px. Headings are bigger.\n- **Line length**: 45–75 characters per line is comfortable. Longer lines tire the eye.\n- **Line spacing**: about 1.2–1.5 times the font size.\n- **Two fonts at most**: one for headings, one for body. Never decorative fonts for body text.\n\nCAPITALS are hard to read in long stretches, and underline looks like a link. Use **bold** for emphasis.",
  words=[("Font", "a style of lettering"), ("Serif", "small strokes at the ends of letters"), ("Sans-serif", "without those strokes"), ("Leading", "the space between lines")],
  read=[FONTS_K, PRACT_TYPO], home=["Find a page with too many fonts and count them", "Rewrite one paragraph at a comfortable size and spacing"],
  support="Start with one sans-serif font only; change just size and weight.",
  stretch="Pair a serif heading font with a sans-serif body font and explain why they work together.",
  checks=[dict(kind="mcq", prompt="What is a comfortable line length for body text?", options=["About 45–75 characters", "As wide as the page allows", "10–20 characters", "Over 120 characters"], answer="About 45–75 characters",
               whys=["", "Very long lines make the eye lose its place.", "Too short: the eye jumps lines constantly.", "Far too long to read comfortably."]),
          dict(kind="evidence", prompt="Read one Google Fonts Knowledge lesson on choosing type, then set a paragraph two ways and say which reads better and why.", url="https://fonts.google.com/knowledge", rubric="Up to 3: the lesson named (1), two settings shown (1), a reason using today's terms (1).", points=3)]),
 dict(w=4, title="Type II: hierarchy — what to read first",
  summary="Size, weight and colour tell the reader what matters most. A clear hierarchy gets the message across in seconds.",
  objectives=["Build a five-level hierarchy", "Use size, weight and colour — not many fonts", "Test a design with the three-second glance"],
  do=["Rank the information on a flyer by importance", "Give each level its own size and weight", "Test it: what does a partner remember after three seconds?"],
  understand="**Hierarchy** is the order the eye reads in. Most pages need about five levels:\n\n1. **Headline** — biggest, boldest: what it is.\n2. **Subheading** — supports the headline.\n3. **Key facts** — when, where, how much (often in a coloured block).\n4. **Body** — the details, at a comfortable size.\n5. **Caption / small print** — smallest.\n\nMake each level clearly different: **size** (headline 3× body), **weight** (bold vs regular), **colour** (one accent), and **space** around it. If everything is big and bold, nothing stands out.\n\nThe test: show it to someone for three seconds. They should remember the headline and the key facts.",
  figure=("type-hierarchy.svg", "Five levels of text"),
  words=[("Hierarchy", "the order of importance shown by size, weight and colour"), ("Weight", "how thick the letters are: regular, bold"), ("Accent colour", "one colour used to point at what matters")],
  read=[FONTS_K, CANVA_DS], home=["Take a cluttered notice and redesign its hierarchy on paper", "Do the three-second test on a family member"],
  support="Write the five levels as a list first, then design.",
  stretch="Create the same hierarchy using only weight and space — no size changes.",
  checks=[dict(kind="order", prompt="Put a flyer's text levels in order, from what should be read first.", options=["Headline", "Subheading", "Key facts (date, place)", "Body text", "Caption"], points=3),
          dict(kind="mcq", prompt="A flyer has every line big, bold and in a different colour. What is the main problem?", options=["Nothing stands out, so there is no clear order to read", "It uses too little ink", "The font is too small", "It needs more colours"], answer="Nothing stands out, so there is no clear order to read",
               whys=["", "Ink is not the issue; hierarchy is.", "It is the opposite — everything is big.", "More colour makes it worse."]),
          dict(kind="task", prompt="Redesign a cluttered flyer your instructor gives you with a clear five-level hierarchy.", rubric="Up to 4: five clear levels (2), one accent colour (1), passes the three-second test (1).", points=4)]),
 dict(w=5, title="Layout: the grid and four principles",
  summary="Professional pages line up. A grid and four principles — contrast, repetition, alignment, proximity — make any page look designed.",
  objectives=["Use a column grid to place things", "Apply contrast, repetition, alignment and proximity", "Critique a layout with the four principles"],
  do=["Draw a 3-column grid on an A4 page", "Place a headline, photo and two stories on it", "Critique a classmate's page with the four principles"],
  understand="A **grid** divides the page into columns with gaps (**gutters**). Everything snaps to the columns, so the page looks orderly even with many parts. A headline might span three columns, a photo two, a sidebar one.\n\nFour principles to check every page:\n\n- **Contrast** — make different things look very different (headline vs body).\n- **Repetition** — repeat fonts, colours and shapes so the page feels like one thing.\n- **Alignment** — every item lines up with something; nothing is placed \"by eye\".\n- **Proximity** — put related things close together and unrelated things apart.\n\nWhite space is not wasted space: it gives the eye somewhere to rest.\n\n![A design editor: tools on the left, the page with its dashed safe area in the middle, exact sizes and positions on the right](media:core/shots/dtp-editor.png)",
  figure=("grid.svg", "A three-column grid"),
  words=[("Grid", "columns that guide where things go"), ("Gutter", "the gap between columns"), ("White space", "empty space that lets a design breathe")],
  read=[CANVA_DS, SCRIBUS], home=["Find a magazine or newspaper page and draw its grid on it", "Name one principle it uses well"],
  support="Turn on the grid or guides in your tool and snap every box to it.",
  stretch="Lay out the same content on a 2-column and a 4-column grid; say which works better and why.",
  checks=[dict(kind="mcq", prompt="Which principle groups a photo with its own caption, away from other stories?", options=["Proximity", "Repetition", "Contrast", "Alignment"], answer="Proximity",
               whys=["", "Repetition is about reusing styles, not grouping.", "Contrast makes things look different; it does not group them.", "Alignment lines things up; grouping is proximity."]),
          dict(kind="task", prompt="Lay out an A4 page on a 3-column grid with a headline, a photo and two short stories, and label where each principle is used.", rubric="Up to 4: a visible grid used (1), all four principles shown and labelled (3).", points=4)],
  figure2=("crap.svg", "Four principles")),
 dict(w=6, title="Colour: schemes, contrast, and screen vs print",
  summary="Use few colours, make text readable, and remember that screens and printers make colour differently.",
  objectives=["Build a colour scheme from the colour wheel", "Check text contrast (aim for 4.5:1)", "Explain RGB versus CMYK"],
  do=["Pick a scheme on the colour wheel", "Test your text colours in a contrast checker", "Compare a bright screen colour with its printed version"],
  understand="- **Schemes**: pick one main colour, one accent, and neutrals (black, grey, white). Complementary colours (opposite on the wheel) give energy; analogous colours (neighbours) feel calm.\n- **Contrast**: text must stand out from its background. The standard used on the web is at least **4.5:1** for body text. Light yellow text on white fails; dark navy on white passes easily. Check with a contrast checker.\n- **Screen vs print**: screens mix **light** in **RGB** (red, green, blue); printers mix **ink** in **CMYK** (cyan, magenta, yellow, black). Some bright screen colours cannot be printed — they come out duller. For print, design in CMYK or ask the printer for a proof.\n\nColour also carries meaning: never let colour be the ONLY way you show something (some people are colour-blind).",
  figure=("rgb-cmyk.svg", "Light versus ink"),
  words=[("RGB", "red, green, blue light — screens"), ("CMYK", "cyan, magenta, yellow, black ink — print"), ("Contrast ratio", "how much text stands out from its background")],
  read=[CONTRAST, COLOR], home=["Check the contrast of three signs or flyers you see", "Find one that fails and suggest a fix"],
  support="Start with navy text on white and one bright accent; check it, then vary.",
  stretch="Design the same flyer in a complementary and an analogous scheme and test both for contrast.",
  checks=[dict(kind="evidence", prompt="Test two text-and-background pairs from your design in the WebAIM contrast checker. Paste a screenshot or the ratios, and say which passes 4.5:1.", url="https://webaim.org/resources/contrastchecker/", rubric="Up to 3: two pairs tested (1), ratios given (1), pass/fail judged correctly against 4.5:1 (1).", points=3),
          dict(kind="mcq", prompt="Why might a bright green on your screen print dull?", options=["Screens mix light (RGB); printers mix ink (CMYK), which cannot make every screen colour", "The printer is low on ink", "Green cannot be printed", "The file was too small"], answer="Screens mix light (RGB); printers mix ink (CMYK), which cannot make every screen colour",
               whys=["", "It happens on a full printer too — it is the colour model.", "Green prints; only some very bright greens are out of range.", "File size affects sharpness, not colour."])]),
 dict(w=7, title="Images: resolution, cropping and rights",
  summary="A picture must be sharp enough to print, cropped with purpose, and yours to use.",
  objectives=["Explain 72 vs 300 ppi", "Crop an image to strengthen it", "Use images legally and credit them"],
  do=["Print the same photo at two resolutions", "Crop one photo three ways and pick the strongest", "Find a free-to-use image and write its credit"],
  understand="- **Resolution**: an image is made of pixels. Screens need about 72–150 pixels per inch; **print needs about 300**. A small image from a website looks fine on screen and blurry on paper. Never stretch an image bigger than it is.\n- **Cropping** removes what does not help: cut to the subject, keep eyes on the upper third, leave room in the direction a person is looking.\n- **Rights**: an image online is NOT free to use. Use your own photos, images with a licence that allows it (Creative Commons, Unsplash), and **credit** them. Ask permission before using a photo of a person — especially a child.\n- **Alt text**: on screen, describe the image for people who cannot see it.\n- **AI-made images**: if you generate a picture with an AI tool, check the tool's terms allow your use, say it was AI-made in the credit, look closely for errors (hands, text, signs), and never make a fake photo of a real person.",
  figure=("resolution.svg", "72 versus 300 ppi"),
  words=[("Resolution", "how many pixels per inch"), ("Crop", "cut away part of an image"), ("Licence", "the rules for using someone else's work"), ("Alt text", "a description of an image for people who cannot see it")],
  read=[CC, UNSPLASH], home=["Take three photos of one object and crop each differently", "Find an image with a Creative Commons licence and write its credit"],
  support="Use the crop tool's rule-of-thirds grid.",
  stretch="Work out the largest size, in cm, a 1200 × 900 pixel photo can be printed at 300 ppi.",
  checks=[dict(kind="mcq", prompt="A 600 × 400 pixel logo looks sharp on screen. Printed at A4 width, it looks blurry. Why?", options=["It has too few pixels for print (print needs about 300 per inch)", "The printer is broken", "Logos cannot be printed", "It was saved in colour"], answer="It has too few pixels for print (print needs about 300 per inch)",
               whys=["", "Every printer would blur it: the file has too few pixels.", "Logos print well from high-resolution or vector files.", "Colour is not the cause."]),
          dict(kind="short", prompt="You want to use a photo you found on Google Images in your newsletter. What should you check, and what must you add?", answer="Check its licence (whether you may use it, e.g. Creative Commons or ask the owner); if allowed, credit the creator. Get consent if it shows a person.", points=2),
          dict(kind="task", prompt="Show one photo cropped three ways and the version you chose, with a reason.", rubric="Up to 3: three crops (1), a chosen crop (1), a reason using today's ideas (1).", points=3)]),
 dict(w=8, title="Project: an event flyer from brief to print",
  summary="Put it together: a one-page flyer for a real Club event, designed from a brief and checked before printing.",
  objectives=["Work from a client brief", "Apply hierarchy, grid, colour and images together", "Check a design with a proof checklist"],
  do=["Read the brief and list what must be on the flyer", "Sketch three thumbnails, choose one", "Design, check, and get feedback"],
  understand="A **brief** says who it is for, what it must say, the size, and the deadline. Designers start with **thumbnails** — tiny quick sketches — before the computer. If you ask an AI tool for headline ideas, treat them as a first draft: check each one against the brief, change what does not fit, and note what you changed.\n\nYour flyer needs: a headline, the key facts (what, when, where, cost), a short body, one strong image, and a call to action (\"Register at …\").\n\nBefore printing, run the **proof checklist**:\n\n1. Spelling, dates and times checked by someone else.\n2. Hierarchy: the three-second test.\n3. Everything aligned to a grid.\n4. Text contrast at least 4.5:1.\n5. Images sharp at print size, and allowed.\n6. Nothing important within 3 mm of the edge.\n\n![Before and after: the same flyer redesigned](media:core/shots/flyer-before-after.png)",
  words=[("Brief", "what the client needs, written down"), ("Thumbnail", "a tiny quick sketch of a layout"), ("Proof", "a final check copy before printing"), ("Call to action", "what the reader should do next")],
  read=[CANVA_DS, CONTRAST], home=["Show your draft to someone who has not seen it; note what they read first", "Fix one thing they found"],
  support="Use one template as a starting point, then change it until it fits the brief.",
  stretch="Design a matching square version for WhatsApp from the same content.",
  checks=[dict(kind="project", prompt="Your event flyer: link or upload the final design and your three thumbnails, and say which proof checks you did.", answer="A flyer that meets the brief with clear hierarchy, grid alignment, readable contrast, legal sharp images and a call to action.",
               rubric="Up to 10: meets the brief (2), hierarchy (2), alignment and grid (2), colour and contrast (2), images and proof checks (2).", points=10),
          dict(kind="order", prompt="Put the flyer process in order.", options=["Read the brief", "Sketch thumbnails", "Design the chosen layout", "Run the proof checklist", "Print or share"], points=3)]),
 dict(w=9, title="Multi-page documents: the newsletter",
  summary="A newsletter repeats a structure on every page: masthead, columns, styles, page numbers.",
  objectives=["Use paragraph styles so every heading matches", "Set up columns and a masthead", "Keep a multi-page document consistent"],
  do=["Design a masthead for a Club newsletter", "Set up two-column pages with heading and body styles", "Add headers, footers and page numbers"],
  understand="When a document has many pages, consistency matters more than any one page.\n\n- **Styles**: define Heading, Subheading, Body and Caption once (Google Docs: **Format → Paragraph styles**; Scribus: **Edit → Styles**). Change the style and every heading updates.\n- **Master pages** (Scribus, LibreOffice) or templates hold what repeats: margins, columns, page numbers, the footer.\n- **Masthead**: the newsletter's name and issue date across the top of page one.\n- **Columns**: two or three narrow columns read faster than one wide one.\n- **Continue lines**: \"continued on page 3\" when a story jumps.\n\n![Paragraph styles: change Headline once and every headline in the newsletter changes](media:core/shots/dtp-styles.png)\n\n![A newsletter page: masthead, two columns, a photo with caption](media:core/shots/newsletter-page.png)",
  words=[("Paragraph style", "a saved set of type settings applied to text"), ("Master page", "a background page holding what repeats"), ("Masthead", "the title block of a newsletter")],
  read=[SCRIBUS, LIBRE], home=["Collect two newsletters or magazines and compare their mastheads", "Write one short story for your newsletter"],
  support="Use Google Docs with a two-column section and three styles only.",
  stretch="Set up a master page in Scribus with columns and automatic page numbers.",
  checks=[dict(kind="mcq", prompt="You need to change the font of every heading in a 12-page newsletter. What is the fastest reliable way?", options=["Change the Heading paragraph style once", "Select each heading and change it", "Retype the headings", "Change the body font"], answer="Change the Heading paragraph style once",
               whys=["", "Slow, and easy to miss one — then the document is inconsistent.", "Retyping risks new errors and does not change the font.", "That changes the body, not the headings."]),
          dict(kind="task", prompt="Show two pages of your newsletter with a masthead, two columns, consistent styles and page numbers.", rubric="Up to 4: masthead (1), columns (1), styles used consistently (1), page numbers (1).", points=4)]),
 dict(w=10, title="Folded work and print preparation: bleed, trim and safe area",
  summary="Printers cut paper, and the cut is never perfect. Bleed, trim and the safe area protect your design.",
  objectives=["Explain bleed, trim and safe area", "Set up a document with 3 mm bleed", "Plan the panel order of a tri-fold brochure"],
  do=["Mark bleed, trim and safe area on a printed page", "Set up a tri-fold with bleed in Canva or Scribus", "Fold a paper mock-up to check the panel order"],
  understand="A print shop prints on bigger paper and **cuts** it down — and the blade can move a millimetre or two.\n\n- **Trim**: where the paper is meant to be cut (the finished size).\n- **Bleed**: extend background colours and photos **3 mm beyond the trim**, so a slightly-off cut never leaves a white edge.\n- **Safe area**: keep text and logos at least **3–5 mm inside the trim**, so nothing important is cut off.\n\nIn Canva: **File → Show print bleed**; in Scribus: set bleed in **Document setup**.\n\nA **tri-fold brochure** is one sheet folded into six panels. The front cover is on the outside right; the inside panels read left to right. Always make a **paper mock-up** before printing.",
  figure=("page-anatomy.svg", "Bleed, trim and safe area"),
  words=[("Bleed", "colour extended 3 mm past the trim"), ("Trim", "the finished size where paper is cut"), ("Safe area", "the zone that keeps text away from the cut")],
  read=[SCRIBUS, CANVA_DS], home=["Fold an A4 sheet into a tri-fold and number the panels", "Find a printed item with a white edge where the cut went wrong"],
  support="Fold the mock-up first; number every panel before designing.",
  stretch="Find out what crop marks are and add them to your PDF in Scribus.",
  checks=[dict(kind="mcq", prompt="Why do designers extend background colour 3 mm past the trim line?", options=["So a slightly inaccurate cut never leaves a white edge", "To make the page bigger", "Because printers charge less", "So the text can go there"], answer="So a slightly inaccurate cut never leaves a white edge",
               whys=["", "The finished page is still the trim size — the bleed is cut off.", "Cost is not the reason.", "Text belongs in the safe area, away from the cut."]),
          dict(kind="order", prompt="Put a tri-fold brochure's panels in reading order for someone picking it up.", options=["Front cover", "Inside flap", "Left inside panel", "Middle inside panel", "Right inside panel", "Back cover"], points=3),
          dict(kind="task", prompt="Show your folded paper mock-up with every panel numbered, and your tri-fold document set up with 3 mm bleed and a safe area.", rubric="Up to 4: mock-up folded and numbered (1), panel order right (1), 3 mm bleed set (1), text inside the safe area (1).", points=4)],
  figure2=("trifold.svg", "Tri-fold panel order")),
 dict(w=11, title="Exporting a print-ready PDF and briefing a printer",
  summary="A design is only finished when a printer can print it right: a PDF with fonts, images and bleed — and a clear brief.",
  objectives=["Export a print-ready PDF with bleed", "Run a final pre-flight check", "Write a print brief for a print shop"],
  do=["Export your flyer as PDF (print) with bleed", "Pre-flight it: fonts, images, bleed, spelling", "Write a print brief: size, quantity, paper, deadline, contact"],
  understand="Send printers a **PDF**, never a Word or Canva link: a PDF keeps your fonts, layout and images exactly.\n\n- Canva: **Share → Download → PDF Print**, tick **Crop marks and bleed**.\n- Scribus/LibreOffice: **Export as PDF**, with bleed and high-quality images.\n\n**Pre-flight** before sending: fonts embedded, images 300 ppi at print size, bleed present, colours checked, and the text proofread by someone else. Name the file clearly: `2026-03-14_Showcase-Flyer_A5_v3.pdf`.\n\nA **print brief** tells the print shop: size and orientation, quantity, paper (weight in gsm, matte or gloss), single- or double-sided, finishing (folding, cutting), deadline, budget, and your phone number. Ask for a **proof** before the full run.\n\n![The export window for a print PDF: bleed, crop marks, embedded fonts, full-resolution images](media:core/shots/dtp-pdf-export.png)",
  words=[("PDF", "a file format that keeps a layout exactly"), ("Pre-flight", "the final technical check before printing"), ("GSM", "paper weight in grams per square metre")],
  read=[CANVA_DS, SCRIBUS], home=["Visit or call a print shop and ask the price of 100 A5 flyers on 130 gsm paper", "Note what they asked you"],
  support="Use the pre-flight list as a tick box on paper.",
  stretch="Compare the price of three paper weights and finishes, and recommend one for a budget.",
  checks=[dict(kind="short", prompt="Write a print brief for 200 A5 flyers for the Club showcase.", answer="Includes size and orientation, quantity, paper weight/finish, sides, any finishing, deadline, budget and contact, and asks for a proof.", points=4),
          dict(kind="mcq", prompt="Which file should you send a print shop?", options=["A PDF exported for print, with bleed", "The Canva share link", "A screenshot of the design", "A Word document"], answer="A PDF exported for print, with bleed",
               whys=["", "A link can change and cannot be sent to the printing machine.", "A screenshot is screen resolution and has no bleed.", "Word moves layouts and fonts between computers."]),
          dict(kind="task", prompt="Show your print-ready PDF (with bleed) and your completed pre-flight list.", rubric="Up to 4: PDF with bleed (2), pre-flight complete (1), clear file name (1).", points=4)]),
 dict(w=12, title="Project: a four-page Club magazine",
  summary="Design, produce and present a four-page magazine for your centre — everything from the term in one publication.",
  objectives=["Plan a multi-page publication as a team", "Produce consistent pages with styles, grid and images", "Deliver a print-ready file and present it"],
  do=["Plan the four pages as a flat plan", "Write, photograph and design your pages", "Pre-flight, export and present to the panel"],
  understand="Your magazine is the term's work in one publication. You need:\n\n- a **flat plan**: a small drawing of all four pages showing what goes where;\n- a **cover** with masthead, a strong image and two cover lines;\n- **three inside pages** on one grid, with consistent styles, at least one story, one photo story and one data graphic (link to Data Appreciation!);\n- **legal images**, credited, with consent for people;\n- a **print-ready PDF** with bleed;\n- a **three-minute presentation**: your choices and why.\n\nGo back to your earlier work before you start: the week 4 hierarchy, the week 5 grid and the week 10 bleed set-up are what this magazine is built from, so use them again.\n\nThe panel will ask about YOUR decisions — the grid, the hierarchy, the colours. That is how they know the work is yours.",
  figure=("grid.svg", "Plan every page on the grid"),
  words=[("Flat plan", "a map of every page of a publication"), ("Cover line", "a short teaser for a story inside")],
  read=[SCRIBUS, CANVA_DS, CONTRAST], home=["Rehearse your three-minute presentation", "Get one person to proofread every page"],
  support="Use a Canva magazine template as the starting grid; replace every element.",
  stretch="Produce a printed copy and a screen version with alt text for every image.",
  checks=[dict(kind="project", prompt="Your four-page magazine: upload the print-ready PDF and your flat plan, and describe your design decisions.", answer="A consistent, well-structured publication with a cover, grid, styles, legal credited images, a data graphic and a print-ready PDF.",
               rubric="Up to 10: flat plan (1), cover (2), consistency of grid and styles (2), images and credits (2), print-ready PDF (1), decisions explained (2).", points=10),
          dict(kind="short", prompt="Name one design decision you made and why it helps the reader.", answer="A specific decision (grid, hierarchy, colour, image) with how it helps reading.", points=2)]),
]
