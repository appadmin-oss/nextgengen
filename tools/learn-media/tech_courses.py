"""
Diagrams for Technology Foundations (api/_lib/seeds/curriculum-tech-foundations-2026.json): Artificial
Intelligence, Cybersecurity, Software Development, Robotics, Automation, Tech Product Design, Product Management.

Same contract as tech_coding.py: (course, week, position), file, alt text that states the information, and the
phrase of the paragraph the picture belongs next to. Figures that cite research use the published numbers:
Gender Shades (Buolamwini & Gebru, 2018) error rates; Nielsen & Landauer's (1993) problem-discovery model,
1 − (1 − 0.31)^n. Fictional names stand in for real organisations in every scam example.
"""
import math
from tech_draw import (W, INK, INK2, LINE, SOFT, WHITE, GOLD, TEAL, CORAL, GREEN, GOLD_T, TEAL_T, CORAL_T, GREEN_T,
                       TEAL_D, CORAL_D, t, rect, fit, tb, arr, path, line, circle, badge, diamond, code, svg, heading)

FIGS = []
AI, CY, SD, RO, AU, PD, PM = ("Artificial Intelligence", "Cybersecurity", "Software Development", "Robotics", "Automation",
                              "Tech Product Design", "Product Management")


def fig(course, week, name, alt, anchor):
    def deco(fn):
        FIGS.append(dict(course=course, week=week, pos=1, name=name, alt=alt, anchor=anchor, fn=fn))
        return fn
    return deco


def flow(xs, y, w, h, items, fill=SOFT, hl=None, size=16):
    """A row of boxes joined by arrows. items: list of line-lists."""
    out = ""
    for i, (x, it) in enumerate(zip(xs, items)):
        f = GOLD_T if hl == i else fill
        out += tb(x, y, w, h, it, fill=f, stroke=INK2 if hl == i else LINE, size=size)
        if i < len(xs) - 1:
            out += arr(x + w + 2, y + h / 2, xs[i + 1] - 4, y + h / 2)
    return out


def bullets(x, y, items, col=INK, bg=WHITE, gap=26, mark="•"):
    return "".join(t(x, y + i * gap, f"{mark} {s}" if mark else s, 16, 500, col, bg=bg) for i, s in enumerate(items))


# ───────────────────────────── Artificial Intelligence ─────────────────────────────

@fig(AI, 1, "ai-next-word.svg", "How a chatbot writes: given \"The sun rises in the\", the model rates every possible next word — \"east\" very likely, others much less — adds the likeliest, and predicts again, word after word.",
     "A chatbot's core job")
def _():
    b = heading("Predict the next word, add it, repeat")
    b += tb(20, 60, 230, 50, [("The sun rises in the …", 16, 700)], fill=SOFT)
    b += arr(252, 85, 286, 85) + tb(290, 60, 110, 50, ["model"], fill=GOLD_T, stroke=INK2)
    words = [("east", 1.0), ("morning", .22), ("sky", .14), ("west", .05)]
    for i, (wd, p) in enumerate(words):
        y = 62 + i * 36
        b += t(424, y + 20, wd, 16, 700 if i == 0 else 500, INK if i == 0 else INK2)
        b += f'<rect x="510" y="{y + 6}" width="{max(4, p * 110):.0f}" height="18" rx="3" fill="{TEAL if i == 0 else LINE}"/>'
    b += arr(402, 85, 418, 76)
    b += t(424, 222, "likely → unlikely", 16, 500, INK2)
    b += path("M440 236 V262 H135 V114", INK2, dash="6 4")
    b += t(150, 254, "add “east”, then predict again", 16, 600, TEAL_D)
    b += tb(20, 282, 600, 48, [("Likely is not the same as true: nothing checks the facts.", 16, 700, CORAL_D)], fill=CORAL_T)
    return svg(346, "Next-word prediction", "A prompt, a model, likelihood bars for candidate words, and a loop back.", b)


@fig(AI, 2, "ai-bias-pipeline.svg", "How bias gets in: if most training examples come from one group, the model learns that group best, and it then makes more mistakes for the people who were missing — at scale, without anyone noticing unless they test each group.",
     "- **What is missing.**")
def _():
    b = heading("Skewed data in, skewed results out")
    b += rect(20, 60, 190, 170, SOFT, LINE, 10) + t(36, 86, "Training data", 16, 800, bg=SOFT)
    for i in range(20):
        c = TEAL if i < 17 else CORAL
        b += circle(44 + (i % 5) * 34, 110 + (i // 5) * 28, 10, c, INK, 1)
    b += arr(214, 145, 254, 145) + tb(258, 115, 120, 60, ["model"], fill=GOLD_T, stroke=INK2) + arr(380, 145, 420, 145)
    b += rect(424, 60, 196, 170, SOFT, LINE, 10) + t(440, 86, "Mistakes", 16, 800, bg=SOFT)
    b += t(440, 124, "group in the data", 16, 500, bg=SOFT) + f'<rect x="440" y="134" width="30" height="18" rx="3" fill="{TEAL}"/>' + t(480, 149, "few", 16, 600, bg=SOFT)
    b += t(440, 186, "group left out", 16, 500, bg=SOFT) + f'<rect x="440" y="196" width="120" height="18" rx="3" fill="{CORAL}"/>' + t(568, 211, "many", 16, 600, CORAL_D, bg=SOFT)
    b += t(20, 262, "Ask: who was in the data, who is missing, and how often", 16, 500, INK2)
    b += t(20, 286, "does it fail for each group?", 16, 500, INK2)
    return svg(304, "Where bias comes from", "Training data mostly from one group, a model, and more mistakes for the missing group.", b)


@fig(AI, 3, "ai-prompt-anatomy.svg", "A good prompt has four parts: the task (explain photosynthesis), the context (to a 13-year-old), the format (in five short steps, with one everyday example) and a constraint (end with a question I can test myself on).",
     'Compare "Tell me about photosynthesis"')
def _():
    b = heading("Four parts of a useful prompt")
    parts = [("Task", "Explain photosynthesis", GOLD_T), ("Context", "to a 13-year-old", TEAL_T), ("Format", "in five short steps, with one everyday example", SOFT),
             ("Constraint", "and end with a question I can test myself on.", GREEN_T)]
    for i, (h, s, f) in enumerate(parts):
        y = 60 + i * 58
        b += tb(20, y, 140, 46, [(h, 16, 800)], fill=f, shadow=False) + tb(170, y, 450, 46, [(s, 16, 500)], fill=WHITE, a="start", shadow=False)
    b += t(20, 312, "Then check it: facts, reasoning, fit — and that any sources exist.", 16, 600, INK2)
    return svg(332, "Anatomy of a prompt", "Task, context, format and constraint, each with its part of an example prompt.", b)


@fig(AI, 4, "ai-verify-claim.svg", "Checking a specific claim from an AI tool: search for it in a reliable source; if you find it, use it with that source; if you cannot find the book, link or fact anywhere, treat it as probably invented.",
     "- Use these tools for things you can judge yourself")
def _():
    b = heading("A specific claim? Find it somewhere else")
    b += tb(20, 64, 200, 64, [("A number, name,", 16, 600), ("quote or source", 16, 600)], fill=SOFT)
    b += arr(222, 96, 262, 96)
    b += diamond(380, 96, 230, 92, ["found in a", "reliable source?"])
    b += arr(497, 96, 520, 60) + tb(524, 30, 96, 52, [("use it,", 16, 700, GREEN), ("cite that", 16, 500)], fill=GREEN_T, stroke=GREEN)
    b += arr(497, 96, 520, 132) + tb(524, 112, 96, 52, [("probably", 16, 700, CORAL_D), ("invented", 16, 700, CORAL_D)], fill=CORAL_T, stroke=CORAL_D)
    b += t(510, 52, "yes", 16, 700, GREEN, "end") + t(510, 150, "no", 16, 700, CORAL_D, "end")
    b += t(20, 196, "Most likely to be wrong:", 16, 800)
    b += bullets(20, 222, ["rare, local or recent topics", "exact numbers, dates, names, quotes", "questions that assume something false"])
    return svg(298, "Checking an AI claim", "A decision on whether a claim can be found in a reliable source.", b)


@fig(AI, 5, "ai-classifier.svg", "A classifier on paper: ten known fruits plotted by weight and smoothness form a mango group and an orange group; a line between them is the model, a new fruit is labelled by the side it falls on, and one near the line is only a guess.",
     "You can do machine learning with a pencil.")
def _():
    b = heading("Plot, draw a line, classify")
    x0, y0, w, h = 70, 60, 380, 240
    b += line(x0, y0 + h, x0 + w, y0 + h, INK2, 2) + line(x0, y0, x0, y0 + h, INK2, 2)
    b += t(x0 + w / 2, y0 + h + 30, "weight →", 16, 600, INK2, "middle")
    b += f'<text x="40" y="{y0 + h / 2}" font-size="16" font-weight="600" fill="{INK2}" text-anchor="middle" transform="rotate(-90 40 {y0 + h / 2})">smoothness →</text>'
    mangoes = [(260, 90), (300, 110), (330, 80), (290, 140), (350, 120)]
    oranges = [(110, 230), (150, 250), (130, 200), (180, 220), (160, 270)]
    for x, y in mangoes: b += circle(x, y, 10, GOLD, INK, 1.5)
    for x, y in oranges: b += f'<rect x="{x - 9}" y="{y - 9}" width="18" height="18" fill="{TEAL}" stroke="{INK}" stroke-width="1.5"/>'
    b += line(120, 70, 400, 290, CORAL_D, 2.5, "8 5")
    b += circle(330, 230, 11, WHITE, INK, 2) + t(330, 236, "?", 16, 800, INK, "middle")
    b += circle(232, 172, 11, WHITE, INK, 2) + t(232, 178, "?", 16, 800, INK, "middle")
    b += circle(478, 90, 10, GOLD, INK, 1.5) + t(496, 96, "mango", 16, 600)
    b += f'<rect x="469" y="117" width="18" height="18" fill="{TEAL}" stroke="{INK}" stroke-width="1.5"/>' + t(496, 132, "orange", 16, 600)
    b += line(468, 164, 490, 164, CORAL_D, 2.5, "8 5") + t(496, 170, "the boundary", 16, 600)
    b += t(470, 214, "Far from the line:", 16, 700) + t(470, 236, "a confident call.", 16, 500, INK2)
    b += t(470, 268, "Near it: a guess", 16, 700) + t(470, 290, "said confidently.", 16, 500, INK2)
    return svg(340, "A classifier drawn by hand", "A scatter plot of mangoes and oranges with a dividing line and two new fruit.", b)


@fig(AI, 6, "ai-callback.svg", "A voice note or video asking for money or a secret: do not reply or pay; stop, and call the person back on a number you already have. Detection by eye or ear is getting harder; checking through a channel you trust still works.",
     "Because detection by eye is getting harder")
def _():
    b = heading("Urgent, secret, about money? Call back")
    b += tb(20, 64, 190, 84, [("“It's your uncle.", 16, 600), ("Send money now,", 16, 600), ("don't tell anyone.”", 16, 600)], fill=CORAL_T, stroke=CORAL_D)
    b += arr(212, 106, 246, 106) + tb(250, 76, 120, 60, [("Stop.", 18, 800)], fill=GOLD_T, stroke=INK2) + arr(372, 106, 406, 106)
    b += tb(410, 64, 210, 84, [("Call them back on", 16, 600), ("a number you", 16, 600), ("already have", 16, 600)], fill=GREEN_T, stroke=GREEN)
    b += t(20, 186, "Never use the number or link in the message itself.", 16, 600, INK2)
    b += t(20, 212, "A family code word helps too.", 16, 500, INK2)
    return svg(232, "Checking a suspicious voice note", "Message, stop, call back on a known number.", b)


@fig(AI, 7, "ai-accuracy-by-group.svg", "Gender Shades (MIT, 2018) tested commercial face-analysis systems: the worst error rate for lighter-skinned men was 0.8%, while for darker-skinned women it was up to 34.7%. One overall accuracy figure hides that gap; test each group separately.",
     "**Face analysis.**")
def _():
    b = heading("One overall score hides who it fails")
    b += t(20, 72, "Error rate, worst commercial system (Gender Shades, 2018)", 16, 600, INK2)
    rows = [("lighter-skinned men", 0.8, TEAL), ("darker-skinned women", 34.7, CORAL)]
    for i, (g, v, c) in enumerate(rows):
        y = 96 + i * 62
        b += t(20, y + 26, g, 16, 700) + f'<rect x="220" y="{y + 8}" width="{v / 40 * 360:.0f}" height="26" rx="4" fill="{c}"/>'
        b += t(228 + v / 40 * 360, y + 28, f"{v}%", 16, 800, INK)
    b += tb(20, 236, 600, 76, [("Check results for each group, not just the total —", 16, 700), ("and keep a human in charge of decisions about people.", 16, 500, INK2)], a="start")
    return svg(330, "Error rates by group", "Two bars: 0.8% and 34.7% error.", b)


@fig(AI, 8, "ai-where-prompts-go.svg", "What you type into an online AI tool leaves your phone for a company's computers, where it may be stored, read by staff checking quality, and used to train future models — so passwords, personal details and other people's private information never go in.",
     "When you type into an online AI tool")
def _():
    b = heading("Where your words go")
    b += tb(20, 90, 150, 70, [("You type", 16, 800), ("on your phone", 16, 500, INK2)], fill=SOFT)
    b += arr(172, 125, 216, 125) + tb(220, 80, 160, 90, [("the company's", 16, 600), ("computers", 16, 800)], fill=GOLD_T, stroke=INK2)
    outs = ["stored", "read by staff", "used to train models"]
    for i, s in enumerate(outs):
        y = 62 + i * 46
        b += arr(382, 125, 416, y + 18) + tb(420, y, 200, 36, [s], fill=CORAL_T, shadow=False)
    b += tb(20, 214, 600, 82, [("Never in the box:", 16, 800, CORAL_D), ("passwords, PINs, card details, your address or school,", 16, 500), ("other people's photos or secrets, confidential work", 16, 500)], fill=WHITE, stroke=CORAL_D, a="start")
    return svg(314, "Where prompts go", "Text travels to a company and may be stored, read or used for training.", b)


@fig(AI, 9, "ai-learning-test.svg", "The honesty test for schoolwork: could you do it again now, without the tool, and explain every part? If yes, the tool helped you learn; if no, it did the learning for you.",
     "A reliable test: **could you do it again")
def _():
    b = heading("Did the tool help you learn, or learn for you?")
    b += tb(150, 60, 340, 100, [("Could you do it again now,", 16, 700), ("without the tool, and", 16, 700), ("explain every part?", 16, 700)], fill=GOLD_T, stroke=INK2)
    b += arr(150, 120, 110, 190) + arr(490, 120, 530, 190)
    b += t(118, 150, "yes", 16, 700, GREEN, "end") + t(522, 150, "no", 16, 700, CORAL_D)
    b += tb(20, 194, 200, 60, [("It helped", 16, 800, GREEN), ("you learn", 16, 600)], fill=GREEN_T, stroke=GREEN)
    b += tb(420, 194, 200, 60, [("It did the", 16, 800, CORAL_D), ("learning for you", 16, 600)], fill=CORAL_T, stroke=CORAL_D)
    b += t(20, 292, "Unsure of the rules? Ask — and say when you used a tool.", 16, 500, INK2)
    return svg(312, "Learning or cheating", "A yes/no question with two outcomes.", b)


@fig(AI, 10, "ai-train-loop.svg", "Training your own classifier is a loop: choose classes (always including \"nothing\"), collect balanced examples, train, test on new conditions, find where it fails, improve the data and train again.",
     "4. **Test** — try it live.")
def _():
    b = heading("The data matters more than the algorithm")
    steps = [("1 Choose", "classes + “nothing”"), ("2 Collect", "100+ each, varied"), ("3 Train", ""), ("4 Test", "new light, new people"), ("5 Find failures", "why did it fail?"), ("6 Fix the data", "")]
    pos = [(20, 60), (230, 60), (440, 60), (440, 180), (230, 180), (20, 180)]
    for i, ((h, s), (x, y)) in enumerate(zip(steps, pos)):
        b += tb(x, y, 180, 74, [(h, 16, 800)] + ([(s, 16, 500, INK2)] if s else []), fill=GOLD_T if i == 4 else SOFT, stroke=INK2 if i == 4 else LINE)
    b += arr(202, 97, 226, 97) + arr(412, 97, 436, 97) + arr(530, 136, 530, 176) + arr(436, 217, 412, 217) + arr(226, 217, 202, 217)
    b += path("M110 178 V140", INK2) + t(124, 162, "again", 16, 700, TEAL_D)
    return svg(276, "Train and test loop", "Six steps in a loop from choosing classes to fixing the data.", b)


@fig(AI, 11, "ai-job-tasks.svg", "A job is a bundle of tasks. For a teacher, AI tools can help with drafting letters, making practice questions and summarising reports, but not with mentoring a pupil, calming a worried parent or deciding what a class needs next.",
     "AI tools change *tasks* more than whole *jobs*.")
def _():
    b = heading("A job is a bundle of tasks: a teacher")
    b += rect(20, 58, 290, 200, TEAL_T, TEAL, 10) + t(36, 86, "Tools can help", 16, 800, TEAL_D, bg=TEAL_T)
    b += bullets(36, 118, ["drafting letters home", "practice questions", "summarising a report"], bg=TEAL_T, gap=30)
    b += rect(330, 58, 290, 200, GOLD_T, INK2, 10) + t(346, 86, "Needs the person", 16, 800, bg=GOLD_T)
    b += bullets(346, 118, ["mentoring a pupil", "a worried parent", "judging what's next", "being accountable"], bg=GOLD_T, gap=30)
    b += t(20, 290, "Deep skill in real work + using the tools well = in demand.", 16, 600, INK2)
    return svg(310, "Tasks, not jobs", "A teacher's tasks sorted into those tools help with and those that need the person.", b)


# ───────────────────────────── Cybersecurity ─────────────────────────────

@fig(CY, 2, "cy-credential-stuffing.svg", "Credential stuffing: one website is breached and its list of emails and passwords is shared; criminals' tools try each pair on email, banks and social media. A reused password opens them all; a unique password for each account stops the attack at the first site.",
     "The biggest password danger")
def _():
    b = heading("One leak, tried everywhere")
    b += tb(20, 70, 160, 80, [("Site A", 16, 800), ("breached", 16, 600, CORAL_D)], fill=CORAL_T, stroke=CORAL_D)
    b += arr(182, 110, 216, 110) + tb(220, 70, 150, 80, [("email +", 16, 600), ("password list", 16, 600)], fill=SOFT)
    sites = ["Email", "Bank", "Instagram"]
    for i, s in enumerate(sites):
        y = 58 + i * 40
        b += arr(372, 110, 406, y + 16) + tb(410, y, 100, 32, [s], fill=WHITE, shadow=False, r=6)
        b += t(522, y + 22, "opened", 16, 700, CORAL_D)
    b += t(410, 196, "if you reused it", 16, 600, CORAL_D)
    b += tb(20, 222, 600, 52, [("A different password for each account: the leak opens nothing else.", 16, 700, GREEN)], fill=GREEN_T, stroke=GREEN)
    return svg(290, "Credential stuffing", "A breached site's passwords tried on three other services.", b)


@fig(CY, 3, "cy-2fa-ladder.svg", "Second steps from weakest to strongest: an SMS code (much better than nothing, but open to SIM-swap fraud), an authenticator app code that changes every 30 seconds, and a passkey or security key, which also refuses fake login pages.",
     "3. **Passkeys and security keys**")
def _():
    b = heading("Second steps, weakest to strongest")
    st = [("SMS code", "SIM swap can steal it", 80), ("Authenticator app", "new code every 30 s", 150), ("Passkey or key", "won't work on fake sites", 220)]
    for i, (h, s, hh) in enumerate(st):
        x = 20 + i * 205
        b += rect(x, 300 - hh, 190, hh, [SOFT, TEAL_T, GREEN_T][i], [LINE, TEAL, GREEN][i], 8)
        b += fit(x, 300 - hh, 190, hh, t(x + 95, 300 - hh + 30, h, 16, 800, INK, "middle", bg=[SOFT, TEAL_T, GREEN_T][i]))
        b += t(x + 95, 326, s, 16, 500, INK2, "middle")
    b += t(20, 362, "Any of them beats a password alone. Never share a code.", 16, 700)
    return svg(380, "Strength of two-step methods", "Three steps rising: SMS, authenticator app, passkey.", b)


@fig(CY, 4, "cy-phishing-tells.svg", "The tells in a phishing message: a sender address that is not the real organisation's, urgency and fear, a link whose real destination is a different site, and a request for a PIN or OTP, which a real bank never asks for.",
     "- Attachments you did not expect.")
def _():
    b = heading("Four tells in one message")
    b += rect(20, 56, 370, 270, WHITE, INK2, 10)
    b += t(36, 84, "From: YourBank Security", 16, 700) + t(36, 106, "alerts@yourbank-verify.com", 16, 500, CORAL_D)
    b += line(36, 120, 374, 120)
    b += t(36, 148, "Your account will be closed", 16, 700) + t(36, 170, "in 24 hours. Verify now:", 16, 700)
    b += rect(36, 186, 220, 34, TEAL_T, TEAL, 6, shadow=False) + t(48, 209, "yourbank.com/verify", 16, 600, TEAL_D, bg=TEAL_T)
    b += t(36, 252, "Enter your PIN and the", 16, 500) + t(36, 274, "OTP we just sent you.", 16, 500)
    for n, y in [(1, 100), (2, 160), (3, 203), (4, 263)]:
        b += badge(374 - 4, y, n)
    notes = [("1", "sender: not the", "real bank's domain"), ("2", "urgency, fear:", "act before you think"), ("3", "hold the link: it goes", "to yourbank-verify.com"), ("4", "a real bank never", "asks for PIN or OTP")]
    for i, (n, a, c) in enumerate(notes):
        y = 60 + i * 66
        b += badge(420, y + 16, n) + t(442, y + 22, a, 16, 600) + t(442, y + 44, c, 16, 500, INK2)
    b += t(20, 352, "Stop, then check through a channel you already trust.", 16, 700)
    return svg(370, "Anatomy of a phishing message", "A fake bank email with four numbered warning signs.", b)


@fig(CY, 5, "cy-fake-alert.svg", "Fake bank alerts: a buyer's SMS or screenshot of a credit alert proves nothing. Open your own banking app; release the goods only if the money is really there.",
     "- **Code requests.**")
def _():
    b = heading("A screenshot of an alert is not money")
    b += tb(20, 64, 180, 70, [("Buyer shows a", 16, 600), ("“credit alert”", 16, 700)], fill=SOFT)
    b += arr(202, 99, 236, 99) + tb(240, 64, 170, 70, [("Open your own", 16, 600), ("banking app", 16, 700)], fill=GOLD_T, stroke=INK2)
    b += arr(412, 99, 446, 70) + tb(450, 40, 170, 56, [("money there:", 16, 600), ("release goods", 16, 700, GREEN)], fill=GREEN_T, stroke=GREEN)
    b += arr(412, 99, 446, 130) + tb(450, 108, 170, 56, [("not there:", 16, 600), ("keep the goods", 16, 700, CORAL_D)], fill=CORAL_T, stroke=CORAL_D)
    b += t(20, 200, "Same rule for every scam: refuse, block, report.", 16, 600, INK2)
    return svg(220, "Checking a bank alert", "A buyer's alert checked in your own banking app before goods are released.", b)


@fig(CY, 7, "cy-lookalike-domains.svg", "Look-alike addresses: the real site is ngg-admin.org; ngg-adrnin.org swaps m for r and n, ngg-admin.org.verify-login.com is really verify-login.com, and ngg-admin-support.co adds a word. Read the name just before the first single slash, from the right.",
     "- **Look-alike addresses and domains**")
def _():
    b = heading("Which one is really ngg-admin.org?")
    rows = [("ngg-admin.org/login", "the real one", GREEN, GREEN_T), ("ngg-adrnin.org/login", "rn pretending to be m", CORAL_D, CORAL_T),
            ("ngg-admin.org.verify-login.com/", "really verify-login.com", CORAL_D, CORAL_T), ("ngg-admin-support.co/login", "an extra word", CORAL_D, CORAL_T)]
    for i, (u, s, c, f) in enumerate(rows):
        y = 60 + i * 58
        b += rect(20, y, 360, 46, f, c, 6, shadow=False) + fit(20, y, 360, 46, t(32, y + 29, u, 16, 700, INK, mono=True, bg=f))
        b += t(394, y + 29, s, 16, 700, c)
    b += t(20, 312, "The real address is the name just before the first single /,", 16, 600, INK2)
    b += t(20, 336, "read from the right. Type important addresses yourself.", 16, 600, INK2)
    return svg(356, "Look-alike web addresses", "One real address and three look-alikes with what gives each away.", b)


@fig(CY, 9, "cy-evil-twin.svg", "A fake hotspot: a criminal names a laptop's network \"Airport_Free_WiFi\", so everything you send passes through them before it reaches the internet. Mobile data goes straight to your network operator.",
     "- On a poorly secured network")
def _():
    b = heading("Whose network is it, really?")
    b += tb(20, 90, 120, 60, ["your phone"], fill=SOFT)
    b += arr(142, 108, 196, 80, CORAL_D) + tb(200, 50, 200, 60, [("Airport_Free_WiFi", 16, 700), ("a stranger's laptop", 16, 500, CORAL_D)], fill=CORAL_T, stroke=CORAL_D)
    b += arr(402, 80, 476, 108, CORAL_D) + tb(480, 90, 140, 60, ["internet"], fill=SOFT)
    b += t(300, 136, "they can see and change traffic", 16, 600, CORAL_D, "middle")
    b += path("M80 152 V210 H550 V154", GREEN) + t(315, 202, "mobile data: straight to your network operator", 16, 600, GREEN, "middle")
    b += t(20, 252, "Banking and logins: mobile data. Never ignore certificate warnings.", 16, 600, INK2)
    return svg(272, "A fake Wi-Fi hotspot", "Traffic through an attacker's hotspot versus straight over mobile data.", b)


@fig(CY, 10, "cy-incident-phases.svg", "If an account is taken over, work in three phases: within minutes, change the password, sign out other sessions, turn on two-step verification and call the bank; the same day, recover the account officially, remove what the attacker added and warn contacts; then find the cause and report it.",
     "If an account is taken over, speed matters.")
def _():
    b = heading("Taken over? Three phases, in order")
    cols = [("Minutes", ["new password", "sign out all", "turn on 2FA", "call the bank"], CORAL_T, CORAL_D),
            ("Same day", ["official recovery", "remove attacker's", "rules and devices", "warn contacts"], GOLD_T, INK2),
            ("After", ["how did it", "happen?", "fix that habit", "report it"], GREEN_T, GREEN)]
    for i, (h, items, f, c) in enumerate(cols):
        x = 20 + i * 207
        b += rect(x, 58, 186, 214, f, c, 10) + fit(x, 58, 186, 214, t(x + 14, 88, h, 18, 800, INK, bg=f) + "".join(t(x + 14, 124 + j * 32, s, 16, 500, INK, bg=f) for j, s in enumerate(items)))
        if i < 2: b += arr(x + 188, 165, x + 204, 165)
    b += t(20, 302, "Never pay a “recovery expert” who contacts you.", 16, 700, CORAL_D)
    return svg(320, "Responding to a hacked account", "Three columns of actions: minutes, same day, after.", b)


@fig(CY, 11, "cy-permission-line.svg", "The same skill falls either side of one line, permission: CTF competitions such as picoCTF, your own devices and published bug bounties are legal; logging into a friend's account, trying passwords or scanning the school network without permission are crimes.",
     "Things that are **illegal without permission**")
def _():
    b = heading("The difference is permission")
    b += rect(20, 58, 280, 200, GREEN_T, GREEN, 10) + t(36, 88, "With permission: legal", 16, 800, GREEN, bg=GREEN_T)
    b += bullets(36, 124, ["CTF puzzles, e.g. picoCTF", "your own devices", "a bug bounty's rules", "reporting a flaw you found"], bg=GREEN_T, gap=30)
    b += rect(340, 58, 280, 200, CORAL_T, CORAL_D, 10) + t(356, 88, "Without it: a crime", 16, 800, CORAL_D, bg=CORAL_T)
    b += bullets(356, 124, ["a friend's account", "trying passwords", "scanning the school", "reading their messages"], bg=CORAL_T, gap=30)
    b += line(320, 50, 320, 266, INK, 3)
    b += t(20, 290, "Nigeria: Cybercrimes Act 2015 — even if it was easy, even if no harm.", 16, 600, INK2)
    return svg(310, "Permission is the line", "Legal and illegal uses of the same skills either side of a line.", b)


@fig(CY, 12, "cy-email-hub.svg", "Why secure your email first: the \"forgot password\" link for your bank, social media, school portal and shopping accounts goes to your email, so whoever controls the email can reset them all.",
     "Today you apply the whole course")
def _():
    b = heading("Your email unlocks everything else")
    cx, cy = 320, 175
    b += tb(cx - 80, cy - 34, 160, 68, [("Your email", 18, 800)], fill=GOLD_T, stroke=INK2)
    spokes = [("Bank", 90, 80), ("Instagram", 550, 80), ("School portal", 100, 270), ("Shopping", 540, 270), ("TikTok", 90, 175), ("Cloud photos", 550, 175)]
    for s, x, y in spokes:
        b += tb(x - 70, y - 20, 140, 40, [s], fill=SOFT, shadow=False)
        dx, dy = x - cx, y - cy
        ex = cx + (82 if dx > 0 else -82)
        b += arr(ex, cy + dy * 0.3, x - 74 * (1 if dx > 0 else -1), y)
    b += t(320, 330, "“Forgot password?” links all arrive here.", 16, 700, INK, "middle")
    return svg(350, "Email controls password resets", "An email account at the centre with six accounts it can reset.", b)


# ───────────────────────────── Software Development ─────────────────────────────

@fig(SD, 1, "sd-change-cycle.svg", "How a typical change goes: understand the problem, read the existing code, decide an approach, write it — often only a few lines — test it, get it reviewed, then ship it and watch it in real use.",
     "7. **Ship it**")
def _():
    b = heading("Writing code is one step of seven")
    top = [["1 Understand"], ["2 Read code"], ["3 Decide"], ["4 Write", ("a few lines", 16, 500, INK2)]]
    bot = [["5 Test"], ["6 Review"], ["7 Ship, watch"]]
    b += flow([20, 177, 334, 491], 66, 130, 60, top, hl=3)
    b += path("M556 128 V152 H85 V174", INK2)
    b += flow([20, 177, 334], 178, 130, 52, bot)
    b += t(20, 270, "Most of the week is reading, testing, reviewing and talking.", 16, 600, INK2)
    return svg(290, "The steps of a software change", "Seven boxes from understanding to shipping, with writing highlighted.", b)


@fig(SD, 2, "sd-branch-merge.svg", "A branch is a separate line of work: commits on main continue while a fix-login branch gets its own commits, and when it is ready it is merged back into main.",
     "- A **branch** is a separate line")
def _():
    b = heading("Branch off, work safely, merge back")
    b += line(40, 110, 600, 110, INK2, 3) + t(40, 88, "main", 16, 800)
    for x in [80, 180, 400, 560]:
        b += circle(x, 110, 11, WHITE, INK, 2.5)
    b += path("M180 110 C210 110 220 190 260 190 H340 C380 190 390 110 470 110", TEAL_D, sw=3, head=False)
    for x in [260, 340]:
        b += circle(x, 190, 11, TEAL_T, TEAL_D, 2.5)
    b += circle(470, 110, 13, GOLD, INK, 2.5)
    b += t(300, 228, "fix-login branch", 16, 700, TEAL_D, "middle")
    b += t(470, 80, "merge", 16, 700, INK, "middle")
    b += t(20, 270, "git switch -c fix-login", 16, 600, mono=True) + t(20, 296, "main keeps working while you change things.", 16, 500, INK2)
    return svg(314, "Branching and merging", "A main line with commits, a branch of two commits, and a merge.", b)


@fig(SD, 3, "sd-trace-path.svg", "Follow one path through unfamiliar code: start from the Submit button in index.html, find its listener in form.js, which calls validate() and then save() in api.js, which sends POST /signup to the server.",
     "3. **Follow one path.**")
def _():
    b = heading("Trace one thing: “what happens on Submit?”")
    steps = [("index.html", "<button>Submit"), ("form.js", "submit listener"), ("form.js", "validate()"), ("api.js", "save()"), ("server", "POST /signup")]
    for i, (f, s) in enumerate(steps):
        y = 58 + i * 58
        b += tb(60 + i * 30, y, 260, 46, [(f + " · " + s, 16, 600)], fill=GOLD_T if i == 0 else SOFT, stroke=INK2 if i == 0 else LINE, shadow=False)
        if i < 4: b += arr(130 + i * 30, y + 48, 150 + i * 30, y + 56)
    b += t(440, 120, "Editor tools:", 16, 800) + t(440, 146, "Go to definition", 16, 500, INK2) + t(440, 170, "Find all references", 16, 500, INK2)
    b += t(440, 220, "Ignore the rest", 16, 800) + t(440, 246, "for now.", 16, 500, INK2)
    return svg(350, "Tracing a path through code", "Five files and functions, each calling the next.", b)


@fig(SD, 4, "sd-debug-method.svg", "The debugging method: reproduce the bug every time, isolate where it goes wrong by cutting the problem in half again and again, fix the cause rather than the symptom, then verify the original steps work and nothing else broke.",
     "1. **Reproduce.**")
def _():
    b = heading("Reproduce, isolate, fix, verify")
    b += flow([20, 177, 334, 491], 60, 130, 52, [["Reproduce"], ["Isolate"], ["Fix the cause"], ["Verify"]], hl=1)
    b += t(20, 160, "Isolate by halving: is the data wrong before or after this point?", 16, 600)
    segs = 8
    for r in range(3):
        y = 178 + r * 36
        lo, hi = [(0, 8), (4, 8), (4, 6)][r]
        for k in range(segs):
            inn = lo <= k < hi
            b += f'<rect x="{20 + k * 72}" y="{y}" width="66" height="26" rx="4" fill="{GOLD_T if inn else SOFT}" stroke="{INK2 if inn else LINE}"/>'
    b += circle(20 + 4 * 72 + 33, 178 + 2 * 36 + 13, 8, CORAL, INK, 1.5)
    b += t(20, 306, "Each check halves where the bug can be.", 16, 500, INK2)
    return svg(324, "The debugging method", "Four steps, and a search range halved three times.", b)


@fig(SD, 5, "sd-test-boundary.svg", "Test the edges: grade(score) returns \"Pass\" from 50 up and \"Try again\" below, so the most useful tests sit either side of the boundary — 49 and 50 — where a mistake like > instead of >= would show.",
     "Good tests are **small**")
def _():
    b = heading("Test where the answer changes")
    b += line(40, 120, 600, 120, INK2, 3)
    for v in [0, 25, 49, 50, 75, 100]:
        x = 40 + v * 5.6
        b += line(x, 110, x, 130, INK2, 2) + (t(x, 154, str(v), 16, 700 if v in (49, 50) else 500, INK, "middle") if v not in (49, 50) else "")
    b += t(40 + 49 * 5.6 - 6, 154, "49", 16, 800, CORAL_D, "end") + t(40 + 50 * 5.6 + 6, 154, "50", 16, 800, GREEN)
    b += rect(40, 76, 49 * 5.6, 24, CORAL_T, CORAL_D, 4, shadow=False) + fit(40, 76, 49 * 5.6, 24, t(40 + 24.5 * 5.6, 94, "Try again", 16, 700, CORAL_D, "middle", bg=CORAL_T))
    b += rect(40 + 50 * 5.6, 76, 50 * 5.6, 24, GREEN_T, GREEN, 4, shadow=False) + fit(40 + 50 * 5.6, 76, 50 * 5.6, 24, t(40 + 75 * 5.6, 94, "Pass", 16, 700, GREEN, "middle", bg=GREEN_T))
    c1, h = code(20, 178, 600, ['test("50 is a pass", () => {', '  expect(grade(50)).toBe("Pass");', "});"])
    b += c1 + t(20, 178 + h + 26, "Also: empty input, zero, very large values, wrong types.", 16, 500, INK2)
    return svg(178 + h + 46, "Boundary tests", "A number line split at 50 with tests at 49 and 50.", b)


@fig(SD, 6, "sd-pr-workflow.svg", "The team workflow: an issue describes the work, a branch keeps it apart from main, small commits build it, a pull request shows the change, teammates review it while tests run, and it is merged once approved.",
     "Teams get code into a shared project")
def _():
    b = heading("From issue to merge")
    b += flow([20, 230, 440], 60, 180, 56, [["1 Issue", ("what and why", 16, 500, INK2)], ["2 Branch", ("one issue each", 16, 500, INK2)], ["3 Commits", ("small, clear", 16, 500, INK2)]])
    b += path("M530 118 V146 H110 V170", INK2)
    b += flow([20, 230, 440], 174, 180, 56, [["4 Pull request", ("what changed", 16, 500, INK2)], ["5 Review", ("+ tests run", 16, 500, INK2)], ["6 Merge", ("into main", 16, 500, INK2)]], hl=2)
    b += t(20, 270, "Small PRs get real reviews; 2,000 lines get a shrug.", 16, 600, INK2)
    return svg(290, "Pull request workflow", "Six steps from issue to merge.", b)


@fig(SD, 7, "sd-regression-test.svg", "A regression test proves itself: run it on the old, buggy code and it must fail; restore the fix and it passes; then commit the test and the fix together so the bug cannot quietly return.",
     "2. **Prove the test works**")
def _():
    b = heading("A test must fail on the broken code")
    cols = [("Old code + test", "FAILS", "so it catches the bug", CORAL_T, CORAL_D), ("Fixed code + test", "PASSES", "the fix works", GREEN_T, GREEN), ("Commit both", "together", "no quiet return", GOLD_T, INK2)]
    for i, (h, r, s, f, c) in enumerate(cols):
        x = 20 + i * 207
        b += tb(x, 66, 186, 120, [(h, 16, 700), (r, 20, 800, c if c != INK2 else INK), (s, 16, 500, INK2)], fill=f, stroke=c)
        if i < 2: b += arr(x + 188, 126, x + 204, 126)
    b += t(20, 222, "A test that passes on broken code tests nothing.", 16, 700)
    return svg(242, "Regression tests", "Fail on old code, pass on fixed code, commit together.", b)


@fig(SD, 8, "sd-tables-keys.svg", "Related tables link through ids: every learner row has a unique primary key, and the attendance table stores learner_id rather than copying the name, so learner 1 is Kemi wherever it appears.",
     "- Related tables link through ids")
def _():
    b = heading("Tables link through ids, not copies")
    def table(x, y, cols, rows, ws, hl):
        o = ""
        cx = x
        for j, (c, w) in enumerate(zip(cols, ws)):
            o += tb(cx, y, w, 36, [c], fill=GOLD_T if j == hl else TEAL_T, stroke=INK2, r=0, shadow=False)
            for i, r in enumerate(rows):
                o += tb(cx, y + 36 + i * 36, w, 36, [(r[j], 16, 500)], fill=WHITE, r=0, shadow=False)
            cx += w
        return o
    b += t(20, 76, "learners", 16, 800) + table(20, 88, ["id", "name", "centre"], [["1", "Kemi", "Egbeda"], ["2", "Tobi", "Ikeja"]], [60, 100, 100], 0)
    b += t(360, 76, "attendance", 16, 800) + table(360, 88, ["learner_id", "date"], [["1", "2026-10-03"], ["1", "2026-10-10"], ["2", "2026-10-10"]], [110, 150], 0)
    b += path("M415 234 V254 H50 V200", CORAL_D, dash="6 4") + t(232, 276, "learner_id points at a learner's id", 16, 600, CORAL_D, "middle")
    b += t(20, 312, "id is the primary key: unique, so every row can be found exactly.", 16, 600, INK2)
    return svg(332, "Linked tables", "Two tables joined by learner id.", b)


@fig(SD, 9, "sd-api-call.svg", "Calling an API: your program sends an HTTP request to the documented URL, checks the status (2xx success, 4xx you asked wrongly, 5xx their server failed), reads the JSON and keeps only what it needs — and handles failure with a useful message instead of crashing.",
     "5. **Handle failure.**")
def _():
    b = heading("Ask, check, take what you need")
    b += tb(20, 64, 140, 60, ["your program"], fill=SOFT)
    b += arr(162, 82, 326, 82) + t(244, 72, "GET …/nigeria", 16, 600, INK, "middle")
    b += tb(330, 64, 120, 60, ["the API"], fill=GOLD_T, stroke=INK2)
    b += arr(326, 110, 162, 110) + t(244, 136, "status + JSON", 16, 600, INK, "middle")
    b += diamond(545, 94, 150, 76, ["2xx?"])
    b += arr(452, 94, 466, 94)
    b += tb(20, 176, 290, 70, [("yes: keep only what you need", 16, 700, GREEN), ("name, capital", 16, 500)], fill=GREEN_T, stroke=GREEN)
    b += tb(330, 176, 290, 70, [("no, or no answer:", 16, 700, CORAL_D), ("say so, and recover", 16, 500)], fill=CORAL_T, stroke=CORAL_D)
    b += path("M545 134 V160 H165 V172", INK2) + arr(545, 134, 545, 172)
    b += t(20, 280, "API keys are secrets: never in a public repo or front-end code.", 16, 600, INK2)
    return svg(300, "Calling an API", "A request and response, a status check, and two outcomes.", b)


@fig(SD, 10, "sd-continuous-deploy.svg", "Continuous deployment: every merge to main runs the tests automatically; if they pass the app deploys, and if any fail nothing is deployed and the team is told — so releases stay small, frequent and boring.",
     "Many teams set up **continuous deployment**")
def _():
    b = heading("Merge → tests → deploy, automatically")
    b += tb(20, 70, 150, 56, ["merge to main"], fill=SOFT) + arr(172, 98, 206, 98)
    b += tb(210, 70, 140, 56, ["run all tests"], fill=GOLD_T, stroke=INK2) + arr(352, 98, 366, 98)
    b += diamond(440, 98, 140, 80, ["pass?"])
    b += arr(510, 98, 530, 98) + tb(534, 72, 86, 52, [("deploy", 16, 700, GREEN)], fill=GREEN_T, stroke=GREEN)
    b += arr(440, 140, 440, 172) + tb(340, 176, 200, 52, [("stop, tell the team", 16, 700, CORAL_D)], fill=CORAL_T, stroke=CORAL_D)
    b += t(20, 270, "Then test the live version: ports, env variables, file-name case.", 16, 600, INK2)
    return svg(290, "Continuous deployment", "A pipeline from merge through tests to deploy or stop.", b)


@fig(SD, 11, "sd-commit-message.svg", "A good commit message: a summary line of about 50 characters in the imperative (\"Fix crash when the name is empty\"), a blank line, then a body explaining why the change was needed.",
     "- A blank line, then a **body**")
def _():
    b = heading("A commit message the future can read")
    c1, h = code(20, 58, 600, [[("Fix crash when the name is empty", INK, 800)], "", "Saving a learner with no name threw a TypeError", "because validate() assumed a string. Return", '"name_required" instead, and add a test.'], fill=WHITE, stroke=INK2)
    b += c1
    b += t(20, 58 + h + 30, "1  summary: ~50 characters, “This commit will…”", 16, 700)
    b += t(20, 58 + h + 56, "2  a blank line", 16, 700)
    b += t(20, 58 + h + 82, "3  the body: WHY it was needed", 16, 700)
    b += t(20, 58 + h + 118, "Not this: “fix”, “stuff”, “update”.", 16, 700, CORAL_D)
    return svg(58 + h + 138, "Commit message format", "A summary line, blank line and body, labelled.", b)


# ───────────────────────────── Robotics ─────────────────────────────

@fig(RO, 1, "ro-sense-think-act.svg", "Every robot runs a loop many times a second: sensors measure the world, a controller decides, actuators change the world, and it senses again. An automatic door: an infrared sensor sees a person, the controller decides to open, a motor opens the door.",
     "Then it senses again and adjusts.")
def _():
    b = heading("Sense, think, act — again and again")
    b += flow([20, 230, 440], 64, 180, 90, [[("Sense", 18, 800), ("sensors", 16, 500, INK2), ("infrared sees you", 16, 500, TEAL_D)],
                                           [("Think", 18, 800), ("controller", 16, 500, INK2), ("decides: open", 16, 500, TEAL_D)],
                                           [("Act", 18, 800), ("actuators", 16, 500, INK2), ("motor opens door", 16, 500, TEAL_D)]], hl=1)
    b += path("M530 156 V196 H110 V160", INK2)
    b += t(320, 220, "the world changes; sense again", 16, 600, INK2, "middle")
    b += t(20, 262, "No sensing, no reacting: not really a robot.", 16, 700)
    return svg(282, "Sense, think, act", "Three boxes in a loop with an automatic-door example.", b)


@fig(RO, 2, "ro-ohms-law.svg", "Ohm's law: voltage equals current times resistance, V = I × R. Cover the one you want: I = V ÷ R, so 5 V across 250 Ω lets 0.02 A (20 mA) flow.",
     "They are linked by **Ohm's law**")
def _():
    b = heading("V = I × R")
    b += f'<polygon points="160,60 280,270 40,270" fill="{GOLD_T}" stroke="{INK2}" stroke-width="2"/>'
    b += line(85, 190, 235, 190, INK2, 2) + line(160, 190, 160, 270, INK2, 2)
    b += t(160, 168, "V", 34, 800, INK, "middle", bg=GOLD_T) + t(120, 248, "I", 30, 800, INK, "middle", bg=GOLD_T) + t(200, 248, "R", 30, 800, INK, "middle", bg=GOLD_T)
    b += t(320, 90, "V  volts — the push", 16, 700) + t(320, 118, "I   amps — the flow", 16, 700) + t(320, 146, "R  ohms — the narrow pipe", 16, 700)
    b += tb(320, 170, 300, 100, [("Cover I:  I = V ÷ R", 16, 800), ("5 V ÷ 250 Ω = 0.02 A", 16, 600), ("= 20 mA", 16, 700, GREEN)], fill=GREEN_T, stroke=GREEN)
    return svg(290, "Ohm's law triangle", "A triangle with V over I and R, and a worked example.", b)


@fig(RO, 3, "ro-breadboard.svg", "Inside a breadboard: each short row of five holes is joined underneath, the two halves are separate across the middle gap, and the long rails along the edges carry power (+) and ground (−).",
     "**The breadboard** lets you build")
def _():
    b = heading("What is joined inside a breadboard")
    b += rect(20, 56, 600, 250, SOFT, LINE, 10)
    for k, (y, lab, c) in enumerate([(74, "+", CORAL_D), (98, "−", INK)]):
        b += line(70, y, 600, y, CORAL if lab == "+" else INK2, 3) + t(46, y + 6, lab, 18, 800, c, "middle", bg=SOFT)
    for col in range(12):
        x = 80 + col * 42
        for half, y0 in enumerate([124, 222]):
            hl = col == 3
            if hl: b += f'<rect x="{x - 9}" y="{y0 - 8}" width="18" height="{4 * 16 + 16}" rx="4" fill="{GOLD}" opacity=".55"/>'
            for r in range(5):
                b += f'<circle cx="{x}" cy="{y0 + r * 16}" r="3.5" fill="{INK2}"/>'
    b += line(70, 210, 600, 210, LINE, 6)
    b += t(320, 326, "Highlighted: one row of five, joined. The gap splits them.", 16, 600, INK2, "middle")
    return svg(346, "Breadboard connections", "Power rails along the top and joined columns of five on each side of a gap.", b)


@fig(RO, 3, "ro-led-circuit.svg", "The first circuit: from the 5 V supply through a 220 Ω resistor and the LED (long leg towards +) back to ground. The LED drops about 2 V, leaving 3 V across the resistor, so R = 3 V ÷ 0.015 A = 200 Ω; the next standard value up is 220 Ω.",
     "Working it out with Ohm's law")
def _():
    b = heading("5 V, a resistor and an LED in a loop")
    b += path("M80 100 H260", INK, sw=3, head=False) + path("M360 100 H520 V250 H80 V100", INK, sw=3, head=False)
    b += rect(260, 86, 100, 28, GOLD_T, INK, 4, shadow=False) + fit(260, 86, 100, 28, t(310, 106, "220 Ω", 16, 800, INK, "middle", bg=GOLD_T))
    b += f'<polygon points="505,160 535,160 520,186" fill="{CORAL}" stroke="{INK}" stroke-width="2"/>' + line(505, 188, 535, 188, INK, 3)
    b += rect(60, 160, 40, 30, WHITE, WHITE, 0, shadow=False) + line(58, 162, 102, 162, INK, 3) + line(70, 186, 90, 186, INK, 5)
    b += t(52, 180, "5 V", 16, 700, INK, "end")
    b += t(80, 92, "+", 18, 800, CORAL_D, "middle") + t(80, 274, "GND (0 V)", 16, 800, INK, "middle")
    b += t(310, 72, "3 V across it", 16, 600, INK2, "middle")
    b += t(546, 170, "LED", 16, 800) + t(546, 194, "about 2 V", 16, 600, INK2)
    b += t(546, 144, "long leg +", 16, 500, INK2)
    b += arr(420, 250, 340, 250, GREEN) + t(380, 274, "15 mA", 16, 700, GREEN, "middle")
    b += tb(120, 160, 330, 70, [("R = (5 − 2) V ÷ 0.015 A = 200 Ω", 16, 700), ("next value up: 220 Ω", 16, 600, GREEN)], fill=GREEN_T, stroke=GREEN, shadow=False)
    return svg(296, "LED and resistor circuit", "A loop from +5 V through 220 ohms and an LED to ground, with the calculation.", b)


@fig(RO, 4, "ro-setup-loop.svg", "An Arduino sketch: setup() runs once when the board powers on, then loop() runs again and again for ever. In Blink, loop() turns pin 13 HIGH for 500 ms and LOW for 500 ms, so the LED flashes once a second.",
     "This is **Blink**")
def _():
    b = heading("setup() once, then loop() for ever")
    b += tb(20, 64, 140, 50, ["power on"], fill=SOFT) + arr(162, 89, 196, 89)
    b += tb(200, 64, 160, 50, [("setup()", 16, 800), ("once", 16, 500, INK2)], fill=SOFT) + arr(362, 89, 396, 89)
    b += tb(400, 64, 160, 50, [("loop()", 16, 800), ("again and again", 16, 500, INK2)], fill=GOLD_T, stroke=INK2)
    b += path("M562 80 H590 V40 H480 V60", INK2)
    b += t(20, 160, "pin 13", 16, 700)
    pts = "M100 220 V170 H230 V220 H360 V170 H490 V220 H620"
    b += path(pts, TEAL_D, sw=3, head=False)
    b += t(165, 162, "HIGH 500 ms", 16, 600, TEAL_D, "middle") + t(295, 244, "LOW 500 ms", 16, 600, INK2, "middle")
    b += t(20, 284, "Change the delays and the blink changes.", 16, 500, INK2)
    return svg(302, "Arduino setup and loop", "A flowchart of setup then a repeating loop, and the blink timing.", b)


@fig(RO, 5, "ro-digital-analogue.svg", "Two kinds of input: a button is digital, reading only HIGH or LOW (with INPUT_PULLUP, pressed reads LOW); an analogue sensor such as a light sensor or knob gives a voltage from 0 to 5 V that analogRead turns into a number from 0 to 1023.",
     "**Many sensors are analogue**")
def _():
    b = heading("Digital: two values. Analogue: a range")
    b += rect(20, 58, 290, 230, SOFT, LINE, 10) + t(36, 86, "Button: digital", 16, 800, bg=SOFT)
    b += path("M40 130 H100 V200 H170 V130 H290", TEAL_D, sw=3, head=False)
    b += t(36, 124, "HIGH", 16, 700, bg=SOFT) + t(108, 222, "LOW = pressed", 16, 700, CORAL_D, bg=SOFT)
    b += t(36, 266, "pull-up: pressed reads LOW", 16, 500, INK2, bg=SOFT)
    b += rect(330, 58, 290, 230, SOFT, LINE, 10) + t(346, 86, "Light sensor: analogue", 16, 800, bg=SOFT)
    for i in range(11):
        b += f'<rect x="{350 + i * 24}" y="{200 - i * 9}" width="18" height="{20 + i * 9}" fill="{TEAL}" opacity="{0.25 + i * 0.07:.2f}"/>'
    b += t(346, 246, "0 V → 0", 16, 700, bg=SOFT) + t(604, 246, "5 V → 1023", 16, 700, INK, "end", bg=SOFT)
    b += t(346, 270, "analogRead(A0)", 16, 600, INK2, mono=True, bg=SOFT)
    return svg(306, "Digital and analogue inputs", "A two-level button signal beside a 0 to 1023 range.", b)


@fig(RO, 6, "ro-motor-driver.svg", "Wiring a motor: the Arduino sends only a control signal to the motor driver; a separate battery supplies the motor's power through the driver; and the Arduino, the driver and the battery share one common ground.",
     "- Power servos from a separate supply")
def _():
    b = heading("The Arduino signals; the battery powers")
    b += tb(20, 70, 150, 80, [("Arduino", 16, 800), ("~20 mA a pin", 16, 500, INK2)], fill=SOFT)
    b += tb(245, 70, 150, 80, [("motor driver", 16, 800), ("L298N / TB6612", 16, 500, INK2)], fill=GOLD_T, stroke=INK2)
    b += tb(470, 70, 150, 80, [("DC motor", 16, 800), ("100s of mA", 16, 500, INK2)], fill=SOFT)
    b += tb(245, 192, 150, 56, [("motor battery", 16, 800)], fill=CORAL_T, stroke=CORAL_D)
    b += arr(172, 100, 241, 100, TEAL_D) + t(206, 92, "signal", 16, 700, TEAL_D, "middle")
    b += arr(397, 100, 466, 100, CORAL_D) + t(432, 92, "power", 16, 700, CORAL_D, "middle")
    b += arr(320, 190, 320, 154, CORAL_D)
    b += path("M95 152 V280 H545 V152", INK, sw=3, head=False) + line(320, 250, 320, 280, INK, 3)
    b += t(320, 304, "one common ground for all three", 16, 800, INK, "middle")
    return svg(322, "Motor driver wiring", "Signal from Arduino, power from a battery, and a shared ground.", b)


@fig(RO, 7, "ro-meter-across-series.svg", "Using a multimeter: to measure voltage, touch the probes across a part with the circuit powered; to measure current, break the circuit and put the meter in series so the current flows through it; resistance is measured with the power off.",
     "- **Resistance** — set to Ω")
def _():
    b = heading("Voltage across, current through")
    def loop(x):
        return path(f"M{x + 20} 90 H{x + 270} V230 H{x + 20} V90", INK, sw=3, head=False)
    b += loop(20) + rect(110, 76, 80, 28, GOLD_T, INK, 4, shadow=False) + fit(110, 76, 80, 28, t(150, 96, "220 Ω", 16, 800, INK, "middle", bg=GOLD_T))
    b += path("M110 90 V150", TEAL_D, sw=2, head=False) + path("M190 90 V150", TEAL_D, sw=2, head=False)
    b += tb(105, 150, 90, 44, [("V", 18, 800)], fill=TEAL_T, stroke=TEAL_D, shadow=False)
    b += t(155, 262, "across the part (parallel)", 16, 700, TEAL_D, "middle")
    b += loop(340) + rect(460, 76, 80, 28, GOLD_T, INK, 4, shadow=False) + fit(460, 76, 80, 28, t(500, 96, "220 Ω", 16, 800, INK, "middle", bg=GOLD_T))
    b += rect(590, 140, 12, 50, WHITE, WHITE, 0, shadow=False)
    b += tb(564, 140, 64, 50, [("mA", 18, 800)], fill=TEAL_T, stroke=TEAL_D, shadow=False)
    b += t(480, 262, "in the loop (series)", 16, 700, TEAL_D, "middle")
    b += t(20, 304, "Never put the meter on current across a battery: a short circuit.", 16, 700, CORAL_D)
    return svg(322, "Measuring voltage and current", "A meter across a resistor, and a meter in the loop.", b)


@fig(RO, 8, "ro-hysteresis.svg", "Hysteresis: the buzzer turns on when the distance falls below 20 cm and only turns off again above 25 cm, so a reading wobbling around 20 cm does not make it flicker on and off.",
     "- **Hysteresis**")
def _():
    b = heading("Two thresholds stop the flicker")
    x0, y0, w, h = 70, 60, 520, 190
    b += line(x0, y0 + h, x0 + w, y0 + h, INK2, 2) + line(x0, y0, x0, y0 + h, INK2, 2)
    Y = lambda cm: y0 + h - (cm - 10) / 25 * h
    b += line(x0, Y(25), x0 + w, Y(25), GREEN, 2, "6 4") + t(x0 - 8, Y(25) + 6, "25", 16, 700, GREEN, "end")
    b += line(x0, Y(20), x0 + w, Y(20), CORAL_D, 2, "6 4") + t(x0 - 8, Y(20) + 6, "20", 16, 700, CORAL_D, "end")
    pts = [(0, 31), (60, 27), (110, 22), (150, 19.5), (180, 20.6), (210, 19.2), (240, 20.8), (280, 18), (330, 21), (370, 24), (400, 26.5), (450, 29), (520, 31)]
    d = "M" + " L".join(f"{x0 + x:.0f} {Y(c):.1f}" for x, c in pts)
    b += path(d, TEAL_D, sw=3, head=False)
    b += f'<rect x="{x0 + 143}" y="{y0 + h + 8}" width="{382 - 143}" height="16" rx="3" fill="{GOLD}"/>' + t(x0 + w, y0 + h + 24, "time →", 16, 600, INK2, "end")
    b += t(x0 + 262, y0 + h + 46, "buzzer on: from below 20 until above 25", 16, 700, INK, "middle")
    b += t(x0 + w, y0 - 6 + 18, "distance (cm)", 16, 600, INK2, "end")
    return svg(310, "Hysteresis", "A wobbling distance reading with on and off thresholds and the buzzer's on period.", b)


@fig(RO, 9, "ro-line-follower.svg", "Bang-bang line following with two sensors either side of a dark line: both see floor, go straight; the left sensor sees the line (the robot drifted right), turn left; the right sensor sees the line, turn right.",
     "- Right sensor sees the line")
def _():
    b = heading("Two sensors, three cases")
    cases = [("both see floor", "go straight", 0), ("left sees line", "turn left", 34), ("right sees line", "turn right", -34)]
    for i, (a, c, off) in enumerate(cases):
        x = 20 + i * 207
        b += rect(x, 56, 186, 170, WHITE, LINE, 10)
        lx = x + 93 - off
        b += f'<rect x="{lx - 9}" y="57" width="18" height="168" fill="{INK}"/>'
        for sx, on in [(x + 93 - 34, off == 34), (x + 93 + 34, off == -34)]:
            b += circle(sx, 150, 11, CORAL if on else TEAL, INK, 2)
        b += t(x + 93, 254, a, 16, 600, INK2, "middle") + t(x + 93, 280, c, 16, 800, INK, "middle")
    b += t(20, 316, "Better: steer in proportion to how far off the line you are.", 16, 600, INK2)
    return svg(334, "Line follower logic", "Three top-down views of two sensors and a line, with the action for each.", b)


@fig(RO, 10, "ro-chassis.svg", "A simple robot chassis seen from above: two drive wheels steer by changing speed (differential drive), a free caster holds the other end up, the batteries sit low and near the drive wheels, and line sensors are mounted firmly at the front.",
     "- **Two-wheel drive with a caster**")
def _():
    b = heading("Differential drive, from above")
    b += rect(170, 70, 300, 210, SOFT, INK2, 24)
    b += rect(140, 200, 30, 70, INK2, INK, 6, shadow=False) + rect(470, 200, 30, 70, INK2, INK, 6, shadow=False)
    b += circle(320, 92, 12, WHITE, INK, 2)
    b += tb(240, 196, 160, 60, [("batteries", 16, 700), ("low, near wheels", 16, 500, INK2)], fill=GOLD_T, stroke=INK2, shadow=False)
    b += tb(240, 120, 160, 50, [("controller", 16, 700)], fill=WHITE, shadow=False)
    b += t(320, 62, "front: caster + line sensors", 16, 700, INK, "middle")
    b += t(130, 300, "drive wheel", 16, 700, INK, "middle") + t(510, 300, "drive wheel", 16, 700, INK, "middle")
    b += t(20, 336, "Same speed both sides: it must go straight, before any code.", 16, 600, INK2)
    return svg(354, "Robot chassis layout", "A top view with two drive wheels, a caster, batteries and controller.", b)


@fig(RO, 11, "ro-debug-order.svg", "Debugging hardware, cheapest checks first: power (charged batteries, a common ground), then wiring against the diagram, then each part on its own with the simplest sketch, then the code's own view of what is happening, then the mechanics.",
     "5. **Mechanics.**")
def _():
    b = heading("Check in this order: cheapest first")
    st = [("1 Power", "charged? common ground?"), ("2 Wiring", "every wire vs the diagram"), ("3 Each part alone", "simplest example sketch"), ("4 Code", "print what it thinks"), ("5 Mechanics", "rubbing, loose, slipping")]
    for i, (h, s) in enumerate(st):
        y = 58 + i * 52
        b += tb(20 + i * 24, y, 220, 42, [(h, 16, 800)], fill=GOLD_T if i == 0 else SOFT, stroke=INK2 if i == 0 else LINE, shadow=False)
        b += t(260 + i * 24, y + 27, s, 16, 500, INK2)
    b += t(20, 344, "Change one thing at a time, and write it down.", 16, 700)
    return svg(362, "Hardware debugging order", "Five checks from power to mechanics.", b)


# ───────────────────────────── Automation ─────────────────────────────

@fig(AU, 1, "au-payback.svg", "When automation pays: a 10-minute weekly task costs 10 minutes a week for ever, while automating it costs about 3 hours up front; the two lines cross after 18 weeks, about four months, and after that the automation is saving time.",
     "A quick test is to estimate")
def _():
    b = heading("A 10-minute weekly task, 3 hours to automate")
    x0, y0, w, h = 80, 60, 520, 200
    b += line(x0, y0 + h, x0 + w, y0 + h, INK2, 2) + line(x0, y0, x0, y0 + h, INK2, 2)
    X = lambda wk: x0 + wk / 30 * w
    Y = lambda mins: y0 + h - mins / 300 * h
    b += path(f"M{X(0)} {Y(0)} L{X(30)} {Y(300)}", CORAL_D, sw=3, head=False) + t(X(24), 124, "by hand", 16, 700, CORAL_D)
    b += path(f"M{X(0)} {Y(180)} L{X(30)} {Y(180)}", GREEN, sw=3, head=False) + t(X(30) - 6, Y(180) + 24, "automated", 16, 700, GREEN, "end")
    b += circle(X(18), Y(180), 7, GOLD, INK) + line(X(18), Y(180), X(18), y0 + h, INK2, 1.5, "4 4")
    b += t(X(18), y0 + h + 24, "18 weeks", 16, 800, INK, "middle")
    for wk in (0, 10, 30):
        b += t(X(wk), y0 + h + 24, str(wk), 16, 500, INK2, "middle")
    b += t(x0 - 8, Y(180) + 6, "3 h", 16, 600, INK2, "end") + t(x0 - 8, Y(0) + 6, "0", 16, 600, INK2, "end")
    b += t(x0, y0 - 6 + 4, "total time spent", 16, 600, INK2)
    b += t(20, 316, "Pays for itself in about four months — if it is maintained.", 16, 600, INK2)
    return svg(334, "Automation payback", "Cumulative time by hand rising past a flat automation cost at 18 weeks.", b)


@fig(AU, 2, "au-process-flowchart.svg", "A process drawn as a flowchart: rectangles are steps, diamonds are decisions, arrows give the order. An application form arrives; if the centre is missing, ask the parent; if the child is under 10, flag for the centre lead; otherwise add them to the sheet and send a confirmation.",
     "Draw it as a **flowchart**")
def _():
    b = heading("Steps are boxes, decisions are diamonds")
    b += tb(20, 60, 170, 56, [("form submitted", 16, 700)], fill=GOLD_T, stroke=INK2) + arr(192, 88, 222, 88)
    b += diamond(310, 88, 170, 80, ["centre", "given?"])
    b += arr(310, 128, 310, 156) + t(322, 148, "yes", 16, 700, GREEN)
    b += arr(396, 88, 430, 88) + t(413, 78, "no", 16, 700, CORAL_D, "middle") + tb(434, 62, 186, 52, ["ask the parent"], fill=CORAL_T, stroke=CORAL_D)
    b += diamond(310, 200, 170, 80, ["under 10?"])
    b += arr(396, 200, 430, 200) + t(413, 190, "yes", 16, 700, GREEN, "middle") + tb(434, 174, 186, 52, ["flag: centre lead"], fill=SOFT)
    b += arr(310, 240, 310, 266) + t(322, 258, "no", 16, 700, CORAL_D)
    b += tb(200, 270, 220, 52, ["add to sheet + confirm"], fill=GREEN_T, stroke=GREEN)
    b += t(20, 356, "Then walk it through with awkward real examples.", 16, 600, INK2)
    return svg(374, "Process flowchart", "A form-handling process with two decisions.", b)


@fig(AU, 3, "au-absolute-ref.svg", "Copying a formula down: a relative reference moves with it, so =C2*F1 copied to the next row becomes =C3*F2 and points at an empty cell; an absolute reference, $F$1, stays fixed on the fee rate in every row.",
     "- Use **absolute references**")
def _():
    b = heading("Copy it down: what moves, what stays")
    b += tb(20, 60, 200, 40, [("F1: fee rate  ₦500", 16, 700)], fill=GOLD_T, stroke=INK2, shadow=False)
    b += rect(20, 116, 290, 160, CORAL_T, CORAL_D, 10) + t(36, 144, "Relative: F1 moves", 16, 800, CORAL_D, bg=CORAL_T)
    b += t(36, 182, "row 2:  =C2*F1", 16, 700, mono=True, bg=CORAL_T) + t(36, 214, "row 3:  =C3*F2", 16, 700, mono=True, bg=CORAL_T)
    b += t(36, 252, "F2 is empty → 0", 16, 700, CORAL_D, bg=CORAL_T)
    b += rect(330, 116, 290, 160, GREEN_T, GREEN, 10) + t(346, 144, "Absolute: $F$1 stays", 16, 800, GREEN, bg=GREEN_T)
    b += t(346, 182, "row 2:  =C2*$F$1", 16, 700, mono=True, bg=GREEN_T) + t(346, 214, "row 3:  =C3*$F$1", 16, 700, mono=True, bg=GREEN_T)
    b += t(346, 252, "always the fee rate", 16, 700, GREEN, bg=GREEN_T)
    b += t(20, 306, "Check a few rows by hand: a wrong copy is wrong on every row.", 16, 600, INK2)
    return svg(324, "Relative and absolute references", "The same formula copied down with and without dollar signs.", b)


@fig(AU, 4, "au-form-to-sheet.svg", "A form feeding a sheet: each submission lands as a new row with a timestamp on the responses tab, which nobody edits; a separate summary tab uses formulas such as COUNTIF to count per centre and list incomplete answers.",
     "Then let the sheet work")
def _():
    b = heading("Collect once, cleanly, then let formulas work")
    b += tb(20, 70, 140, 120, [("Form", 18, 800), ("drop-downs,", 16, 500, INK2), ("validation", 16, 500, INK2)], fill=SOFT)
    b += arr(162, 130, 196, 130)
    b += rect(200, 60, 200, 150, WHITE, INK2, 8) + t(214, 86, "Responses tab", 16, 800)
    for i in range(4):
        b += f'<rect x="214" y="{100 + i * 24}" width="172" height="18" rx="3" fill="{TEAL_T if i < 3 else GOLD_T}"/>'
    b += t(214, 234, "new row each time;", 16, 500, INK2) + t(214, 256, "never edit by hand", 16, 700, CORAL_D)
    b += arr(402, 130, 436, 130)
    b += tb(440, 70, 180, 120, [("Summary tab", 16, 800), ("=COUNTIF(…)", 16, 600, TEAL_D), ("per centre,", 16, 500, INK2), ("incomplete list", 16, 500, INK2)], fill=GREEN_T, stroke=GREEN)
    return svg(276, "Form into sheet", "A form, a responses tab and a summary tab of formulas.", b)


@fig(AU, 5, "au-trigger-filter-action.svg", "A no-code automation: a trigger (a new volunteer sign-up in the form), a filter (only if the centre is Egbeda), then actions (add a row to the Egbeda sheet and email the centre lead).",
     "Example: *When* a new volunteer")
def _():
    b = heading("When this happens, if this is true, do that")
    b += tb(20, 70, 170, 84, [("Trigger", 16, 800, TEAL_D), ("new volunteer", 16, 600), ("sign-up", 16, 600)], fill=TEAL_T)
    b += arr(192, 112, 226, 112)
    b += tb(230, 70, 170, 84, [("Filter", 16, 800), ("centre is", 16, 600), ("Egbeda?", 16, 600)], fill=GOLD_T, stroke=INK2)
    b += arr(402, 98, 436, 84) + arr(402, 126, 436, 140)
    b += tb(440, 58, 180, 50, [("add row: sheet", 16, 600)], fill=GREEN_T, stroke=GREEN) + t(530, 140, "Actions", 16, 800, GREEN, "middle")
    b += tb(440, 152, 180, 50, [("email centre lead", 16, 600)], fill=GREEN_T, stroke=GREEN)
    b += t(20, 244, "Start small: one trigger, one action. Test with sample data.", 16, 600, INK2)
    return svg(264, "Trigger, filter, action", "A trigger feeding a filter and two actions.", b)


@fig(AU, 6, "au-timezone.svg", "Time zones: a service running on UTC that sends \"at 6:00\" sends at 7:00 in Lagos, which is UTC+1 (West Africa Time). Set the job's time zone to Lagos explicitly, and keep messages out of quiet hours.",
     "- **Time zones.**")
def _():
    b = heading("Whose 6 o'clock?")
    hours = list(range(4, 11))
    for r, (lab, off) in enumerate([("Server (UTC)", 0), ("Lagos (UTC+1)", 1)]):
        y = 80 + r * 70
        b += t(20, y + 6, lab, 16, 700)
        for i, hr in enumerate(hours):
            x = 180 + i * 64
            b += line(x, y - 10, x, y + 10, INK2, 1.5) + t(x, y + 34, f"{hr + off:02d}:00", 16, 500, INK2, "middle")
        b += line(180, y, 180 + 6 * 64, y, INK2, 2)
    x6 = 180 + 2 * 64
    b += circle(x6, 80, 9, GOLD, INK) + circle(x6, 150, 9, GOLD, INK)
    b += line(x6, 89, x6, 141, CORAL_D, 2, "4 3")
    b += tb(20, 212, 600, 52, [("Set the job's time zone to Africa/Lagos, explicitly.", 16, 700)], fill=GOLD_T, stroke=INK2)
    return svg(282, "Time zones and schedules", "Two hour scales offset by one hour, with the same moment marked on both.", b)


@fig(AU, 7, "au-time-trigger.svg", "The week 3 sheet, triggered: every Monday morning a time-driven trigger runs sendWeeklySummary(), which reads the Summary tab and emails the centre lead — a job that used to need someone to open, update and send it by hand.",
     "Then add a **time-driven trigger**")
def _():
    b = heading("The sheet now sends itself")
    b += flow([20, 177, 334, 491], 70, 130, 84, [[("Monday", 16, 800), ("07:00 trigger", 16, 500, INK2)], [("script runs", 16, 800), ("Apps Script", 16, 500, INK2)],
                                                  [("reads", 16, 800), ("Summary tab", 16, 500, INK2)], [("emails", 16, 800), ("centre lead", 16, 500, INK2)]], hl=0)
    b += t(20, 196, "Before switching on:", 16, 800)
    b += bullets(20, 222, ["run it by hand and check", "send to yourself first", "note the trigger, owner and recipients"])
    return svg(312, "A time-driven trigger", "Four steps from a Monday trigger to an email.", b)


@fig(AU, 8, "au-message-anatomy.svg", "A useful automated message names the person, says what changed, where and when, and how to stop: \"Hi Mrs Adeyemi, Tobi's Saturday class moves to 11am this week at Egbeda (Lab 1). Reply STOP to opt out.\"",
     "- **Short, clear and actionable.**")
def _():
    b = heading("What makes a reminder worth reading")
    b += rect(20, 60, 340, 170, TEAL_T, TEAL, 16)
    lines = ["Hi Mrs Adeyemi, Tobi's", "Saturday class moves to", "11am this week at Egbeda", "(Lab 1). Reply STOP to", "opt out."]
    for i, s in enumerate(lines):
        b += t(38, 92 + i * 26, s, 16, 500, INK, bg=TEAL_T)
    for i, s in enumerate(["their name", "what changed", "where and when", "an easy way to stop"]):
        b += t(384, 92 + i * 40, "✓ " + s, 16, 600)
    b += t(20, 264, "Only to those it applies to. Never at 2am.", 16, 600, INK2)
    return svg(284, "Anatomy of an automated message", "An SMS with four numbered parts.", b)


@fig(AU, 9, "au-heartbeat.svg", "A heartbeat makes silent failure visible: the automation sends a short success note every week (\"Sent 42 reminders\"); when a week's note does not arrive, that missing heartbeat is the alarm.",
     "- **Heartbeats.**")
def _():
    b = heading("Silence should be an alarm")
    for i in range(6):
        x = 30 + i * 100
        ok = i < 4
        b += tb(x, 70, 84, 76, [(f"wk {i + 1}", 16, 700), ("✓ sent 42" if ok else "—", 16, 600, GREEN if ok else CORAL_D)], fill=GREEN_T if ok else CORAL_T, stroke=GREEN if ok else CORAL_D, shadow=False)
    b += t(470, 180, "no heartbeat:", 16, 800, CORAL_D, "middle") + t(470, 204, "find out why now", 16, 700, CORAL_D, "middle")
    b += t(20, 250, "Also: error emails on failure, and a log row for every run.", 16, 600, INK2)
    return svg(270, "Heartbeat monitoring", "Six weeks of success notes, the last two missing.", b)


@fig(AU, 11, "au-human-in-loop.svg", "A human in the loop for decisions about people: the automation gathers and flags, a person decides, and anyone affected can reach a human and appeal; routine steps with no judgement can run straight through.",
     "Good practice: involve the people affected")
def _():
    b = heading("Machines prepare; people decide about people")
    b += tb(20, 76, 170, 70, [("automation", 16, 800), ("gathers, flags", 16, 500, INK2)], fill=SOFT)
    b += arr(192, 111, 226, 111) + tb(230, 66, 180, 90, [("a person", 18, 800), ("decides", 16, 600)], fill=GOLD_T, stroke=INK2)
    b += arr(412, 111, 446, 111) + tb(450, 76, 170, 70, [("the outcome", 16, 800), ("for a family", 16, 500, INK2)], fill=SOFT)
    b += path("M535 148 V196 H320 V160", CORAL_D, dash="6 4") + t(430, 218, "reach a human, appeal", 16, 700, CORAL_D, "middle")
    b += t(20, 260, "Talk first to whoever does the task now: they know the exceptions.", 16, 600, INK2)
    return svg(280, "Human in the loop", "Automation, a person deciding, the outcome, and an appeal path back.", b)


# ───────────────────────────── Tech Product Design ─────────────────────────────

@fig(PD, 1, "pd-design-process.svg", "The design process this course follows: understand, define, sketch, structure, prototype, test, refine — and testing usually sends you back to an earlier step.",
     "Designers work closely with researchers")
def _():
    b = heading("Understand first; colours come last")
    top = [["Understand"], ["Define"], ["Sketch"], ["Structure"]]
    b += flow([20, 177, 334, 491], 64, 130, 50, top, hl=0)
    b += path("M556 116 V140 H500", INK2, head=False)
    bot = [["Refine"], ["Test"], ["Prototype"]]
    xs = [177, 334, 491]
    for x, it in zip(xs, bot):
        b += tb(x, 150, 130, 50, it, fill=GOLD_T if it == ["Test"] else SOFT, stroke=INK2 if it == ["Test"] else LINE)
    b += arr(556, 140, 556, 146) + arr(489, 175, 466, 175) + arr(332, 175, 309, 175)
    b += path("M399 202 V236 H85 V118", CORAL_D, dash="6 4") + t(240, 256, "testing often sends you back", 16, 700, CORAL_D, "middle")
    return svg(276, "The design process", "Seven steps with a loop back from testing.", b)


@fig(PD, 2, "pd-interview-questions.svg", "Questions that get the truth: \"Would you use an app to book classes?\" asks for a prediction and most people say yes; \"Tell me about the last time you booked a class — what happened first?\" asks about something that really happened.",
     "- Ask about **specific past events**")
def _():
    b = heading("Ask what they did, not what they would do")
    b += rect(20, 58, 290, 190, CORAL_T, CORAL_D, 10) + t(36, 86, "Prediction: unreliable", 16, 800, CORAL_D, bg=CORAL_T)
    b += t(36, 122, "“Would you use an app", 16, 600, bg=CORAL_T) + t(36, 146, "to book classes?”", 16, 600, bg=CORAL_T)
    b += t(36, 196, "Most say yes.", 16, 500, INK2, bg=CORAL_T) + t(36, 220, "Few ever would.", 16, 500, INK2, bg=CORAL_T)
    b += rect(330, 58, 290, 190, GREEN_T, GREEN, 10) + t(346, 86, "Past event: useful", 16, 800, GREEN, bg=GREEN_T)
    b += t(346, 122, "“Tell me about the last", 16, 600, bg=GREEN_T) + t(346, 146, "time you booked a class.", 16, 600, bg=GREEN_T) + t(346, 170, "What happened first?”", 16, 600, bg=GREEN_T)
    b += t(346, 220, "Then: why? what next?", 16, 500, INK2, bg=GREEN_T)
    b += t(20, 280, "Not “Was it frustrating?” (leading) but “How was that?”", 16, 600, INK2)
    return svg(300, "Interview questions", "A hypothetical question beside a past-event question.", b)


@fig(PD, 3, "pd-moscow.svg", "MoSCoW for a class-booking product: must have — see classes at my centre, book a place, get a confirmation; should have — a reminder the day before; could have — pay online; won't have this time — chat with other parents. The \"won't\" list is written down and shared.",
     "2. List every idea, then sort them")
def _():
    b = heading("Sort every idea into four buckets")
    q = [("Must", ["see classes at my centre", "book a place", "get a confirmation"], GOLD_T, INK2),
         ("Should", ["reminder the day before"], SOFT, LINE), ("Could", ["pay online"], SOFT, LINE),
         ("Won't — this time", ["chat with other parents"], CORAL_T, CORAL_D)]
    for i, (h, items, f, c) in enumerate(q):
        x = 20 + (i % 2) * 310
        y = 58 + (i // 2) * 150
        b += rect(x, y, 290, 136, f, c, 10) + fit(x, y, 290, 136, t(x + 14, y + 28, h, 18, 800, INK, bg=f) + "".join(t(x + 14, y + 58 + j * 24, "• " + s, 16, 500, INK, bg=f) for j, s in enumerate(items)))
    b += t(20, 380, "If it solves the problem without it, it is not a must.", 16, 600, INK2)
    return svg(400, "MoSCoW prioritisation", "Four boxes of features: must, should, could, won't.", b)


@fig(PD, 4, "pd-crazy-8s.svg", "Crazy 8s: fold a sheet into eight panels and sketch eight genuinely different ideas for the same problem in eight minutes — for a class finder, a list, a calendar, a map, a chat, one big button, a search, cards by day and a QR poster.",
     "A reliable technique is **Crazy 8s**")
def _():
    b = heading("Eight ideas, eight minutes")
    ideas = ["a list", "a calendar", "a map", "a chat", "one big button", "a search", "cards by day", "a QR poster"]
    for i, s in enumerate(ideas):
        x = 20 + (i % 4) * 152
        y = 58 + (i // 4) * 130
        b += rect(x, y, 140, 118, WHITE, INK2, 4, shadow=False)
        b += fit(x, y, 140, 118, t(x + 70, y + 106, s, 16, 600, INK, "middle"))
        b += f'<rect x="{x + 18}" y="{y + 16}" width="104" height="10" rx="3" fill="{LINE}"/><rect x="{x + 18}" y="{y + 34}" width="70" height="10" rx="3" fill="{LINE}"/><rect x="{x + 18}" y="{y + 52}" width="88" height="22" rx="4" fill="{TEAL_T}" stroke="{TEAL}"/>'
        b += t(x + 10, y + 16 + 4, "", 16) if False else ""
    b += t(20, 344, "One minute each. Quantity first; judge later.", 16, 600, INK2)
    return svg(362, "Crazy 8s", "A sheet folded into eight panels, each a different idea.", b)


@fig(PD, 5, "pd-wireframe.svg", "A phone wireframe in greyscale: the most important thing is biggest and first (the class name and time), related details are grouped, real words are used, and the main action is a clearly labelled button — \"Book this class\", not \"Submit\".",
     "- **States**")
def _():
    b = heading("Structure before colour")
    b += rect(40, 56, 220, 330, WHITE, INK2, 22)
    b += tb(58, 84, 184, 44, [("Coding, Saturday", 16, 800)], fill=SOFT, shadow=False, r=4)
    b += tb(58, 136, 184, 34, [("10:00 · Egbeda", 16, 500)], fill=WHITE, shadow=False, r=4)
    b += tb(58, 178, 184, 34, [("Lab 1 · 6 places left", 16, 500)], fill=WHITE, shadow=False, r=4)
    b += f'<rect x="58" y="226" width="184" height="80" rx="4" fill="{SOFT}" stroke="{LINE}"/><line x1="58" y1="226" x2="242" y2="306" stroke="{LINE}"/><line x1="242" y1="226" x2="58" y2="306" stroke="{LINE}"/>'
    b += tb(58, 322, 184, 46, [("Book this class", 16, 800)], fill=GOLD_T, stroke=INK2, shadow=False, r=8)
    notes = [(106, "1  most important: biggest, first"), (172, "2  related details grouped"), (266, "3  image: a crossed box will do"), (345, "4  the action says what it does")]
    for y, s in notes:
        b += line(262, y, 290, y, INK2, 1.5) + t(296, y + 6, s, 16, 600)
    return svg(400, "A phone wireframe", "A greyscale phone screen with four annotations.", b)


@fig(PD, 6, "pd-tokens-components.svg", "A design system builds in layers: tokens (named colours, type sizes, spacing steps) make components (a button, an input, a card), and components make every screen — so a change to a token reaches everything that uses it.",
     "Then **components** built from tokens")
def _():
    b = heading("Tokens → components → screens")
    b += rect(20, 58, 190, 230, SOFT, LINE, 10) + t(36, 86, "Tokens", 18, 800, bg=SOFT)
    toks = [("primary", GOLD), ("text", INK), ("error", CORAL_D)]
    for i, (n, c) in enumerate(toks):
        b += f'<rect x="36" y="{102 + i * 30}" width="20" height="20" rx="4" fill="{c}"/>' + t(66, 118 + i * 30, n, 16, 600, bg=SOFT)
    b += t(36, 220, "type: 16 · 20 · 24", 16, 600, bg=SOFT) + t(36, 250, "space: 8 · 16 · 24", 16, 600, bg=SOFT)
    b += arr(212, 170, 236, 170)
    b += rect(240, 58, 180, 230, SOFT, LINE, 10) + t(256, 86, "Components", 18, 800, bg=SOFT)
    b += tb(256, 104, 148, 40, [("Button", 16, 700)], fill=GOLD_T, stroke=INK2, shadow=False, r=8)
    b += tb(256, 156, 148, 40, [("Input", 16, 500)], fill=WHITE, shadow=False, r=8)
    b += tb(256, 208, 148, 60, [("Card", 16, 700)], fill=WHITE, shadow=False, r=8)
    b += arr(422, 170, 446, 170)
    b += rect(450, 58, 170, 230, SOFT, LINE, 10) + t(466, 86, "Screens", 18, 800, bg=SOFT)
    for i in range(2):
        b += f'<rect x="{470 + i * 72}" y="104" width="60" height="110" rx="8" fill="{WHITE}" stroke="{INK2}"/><rect x="{478 + i * 72}" y="186" width="44" height="16" rx="4" fill="{GOLD}"/>'
    b += t(20, 320, "Use only what is in the system; add to it deliberately.", 16, 600, INK2)
    return svg(340, "Design system layers", "Tokens feeding components feeding screens.", b)


@fig(PD, 8, "pd-fidelity.svg", "Match the prototype's fidelity to the question: paper screens answer \"do people understand the flow?\"; clickable greyscale wireframes test navigation; realistic high-fidelity prototypes test wording and visual hierarchy.",
     "Match the fidelity to the question")
def _():
    b = heading("How real does the prototype need to be?")
    st = [("Low", "paper screens", "do they get the flow?"), ("Medium", "clickable greyscale", "can they navigate?"), ("High", "realistic, in Figma", "do words and look work?")]
    for i, (h, s, q) in enumerate(st):
        x = 20 + i * 207
        b += tb(x, 66, 186, 110, [(h, 18, 800), (s, 16, 500, INK2)], fill=[SOFT, TEAL_T, GOLD_T][i], stroke=[LINE, TEAL, INK2][i])
        b += t(x + 93, 206, q, 16, 700, INK, "middle")
        if i < 2: b += arr(x + 188, 121, x + 204, 121)
    b += t(20, 246, "slower and more expensive →", 16, 600, INK2)
    b += t(20, 272, "A prototype is disposable: it exists to answer a question.", 16, 600, INK2)
    return svg(292, "Prototype fidelity", "Three levels of fidelity with the question each answers.", b)


@fig(PD, 9, "pd-five-users.svg", "Why five testers: in Nielsen and Landauer's model, each tester finds about 31% of the usability problems, so five find about 85%; after that you mostly see the same problems again. Test five, fix, then test five more.",
     "Research by Nielsen Norman Group")
def _():
    b = heading("Problems found as testers are added")
    x0, y0, w, h = 80, 64, 520, 200
    b += line(x0, y0 + h, x0 + w, y0 + h, INK2, 2) + line(x0, y0, x0, y0 + h, INK2, 2)
    X = lambda n: x0 + n / 15 * w
    Y = lambda p: y0 + h - p * h
    d = "M" + " L".join(f"{X(n):.1f} {Y(1 - (1 - .31) ** n):.1f}" for n in range(0, 16))
    b += path(d, TEAL_D, sw=3, head=False)
    p5 = 1 - .69 ** 5
    b += circle(X(5), Y(p5), 7, GOLD, INK) + line(X(5), Y(p5), X(5), y0 + h, INK2, 1.5, "4 4")
    b += t(X(5) + 12, Y(p5) + 30, f"5 testers ≈ {p5 * 100:.0f}%", 16, 800)
    for n in (0, 5, 10, 15):
        b += t(X(n), y0 + h + 24, str(n), 16, 500, INK2, "middle")
    for p in (0, 50, 100):
        b += t(x0 - 8, Y(p / 100) + 6, f"{p}%", 16, 500, INK2, "end")
    b += t(X(15), y0 + h + 48, "testers", 16, 600, INK2, "end")
    b += t(20, y0 + h + 76, "Model: 1 − (1 − 0.31)ⁿ (Nielsen & Landauer, 1993)", 16, 500, INK2)
    return svg(y0 + h + 96, "Five-user testing curve", "A rising curve flattening after five testers.", b)


@fig(PD, 10, "pd-a11y-basics.svg", "Three accessibility requirements you can see: tap targets about 44 × 44 px with space between them; errors that say \"Error\" in words with an icon, not only a red border; and body text at 4.5:1 contrast or more.",
     "- **Target size**")
def _():
    b = heading("Three things to build in from the start")
    b += rect(20, 58, 190, 220, SOFT, LINE, 10) + t(36, 86, "Target size", 16, 800, bg=SOFT)
    b += rect(70, 112, 88, 88, GOLD_T, INK2, 8, shadow=False) + t(114, 162, "44 px", 16, 700, INK, "middle", bg=GOLD_T)
    b += t(36, 248, "with space between", 16, 500, INK2, bg=SOFT)
    b += rect(225, 58, 190, 220, SOFT, LINE, 10) + t(241, 86, "Not colour alone", 16, 800, bg=SOFT)
    b += rect(241, 110, 158, 40, WHITE, "#b42318", 6, sw=2, shadow=False)
    b += circle(253, 178, 9, "#b42318", "#b42318") + t(253, 184, "!", 16, 800, WHITE, "middle", bg="#b42318")
    b += t(270, 184, "Error: add a", 16, 700, "#b42318", bg=SOFT) + t(241, 208, "phone number", 16, 700, "#b42318", bg=SOFT)
    b += rect(430, 58, 190, 220, SOFT, LINE, 10) + t(446, 86, "Contrast", 16, 800, bg=SOFT)
    b += t(446, 130, "body text", 16, 600, bg=SOFT) + t(446, 166, "4.5 : 1", 26, 800, bg=SOFT) + t(446, 196, "or more", 16, 600, bg=SOFT)
    b += t(446, 248, "large text 3 : 1", 16, 500, INK2, bg=SOFT)
    b += t(20, 306, "Plus: labels, keyboard access, reduced motion, plain words.", 16, 600, INK2)
    return svg(326, "Accessibility basics", "A 44 px target, an error with words and an icon, and a contrast ratio.", b)


@fig(PD, 11, "pd-handover.svg", "An annotated handover: the developer is told which component each part is (Primary button, medium), what happens on tap, the exact error text, the focus order, and what an empty state looks like — names and behaviour, not pixel measurements.",
     "- **Edge cases**")
def _():
    b = heading("Annotate behaviour, not just looks")
    b += rect(40, 56, 220, 330, WHITE, INK2, 22)
    b += tb(58, 86, 184, 40, [("Find a class", 16, 800)], fill=SOFT, shadow=False, r=4)
    b += tb(58, 140, 184, 44, [("Centre ▾", 16, 500)], fill=WHITE, shadow=False, r=6)
    b += tb(58, 196, 184, 70, [("No classes yet", 16, 600), ("at this centre", 16, 500, INK2)], fill=SOFT, shadow=False, r=6)
    b += tb(58, 316, 184, 46, [("Show classes", 16, 800)], fill=GOLD_T, stroke=INK2, shadow=False, r=8)
    notes = [(106, "focus order: 1 heading, 2 select"), (162, "select: Input/Select, required"), (231, "empty state: exact words"), (339, "Primary button, medium →"), (363, "tap: load list, show loading")]
    for y, s in notes:
        b += line(262, y - 5, 286, y - 5, INK2, 1.5) + t(292, y, s, 16, 600)
    return svg(400, "Annotated design handover", "A phone screen with notes on components, states and behaviour.", b)


# ───────────────────────────── Product Management ─────────────────────────────

@fig(PM, 1, "pm-venn.svg", "Where a product manager works: the overlap of what users need, what the organisation needs, and what is technically feasible. A product that ignores any one of the three fails.",
     "A useful way to think about it")
def _():
    b = heading("Where the PM's job sits")
    for cx, cy, c in [(250, 150, GOLD), (390, 150, TEAL), (320, 260, CORAL)]:
        b += f'<circle cx="{cx}" cy="{cy}" r="100" fill="{c}" fill-opacity=".22" stroke="{INK2}" stroke-width="1.5"/>'
    b += t(200, 120, "Users", 18, 800, INK, "middle") + t(200, 144, "need it", 16, 500, INK2, "middle")
    b += t(440, 120, "Organisation", 18, 800, INK, "middle") + t(440, 144, "needs it", 16, 500, INK2, "middle")
    b += t(320, 320, "Feasible", 18, 800, INK, "middle") + t(320, 344, "can be built", 16, 500, INK2, "middle")
    b += t(320, 202, "PM", 20, 800, INK, "middle")
    return svg(372, "Product manager Venn diagram", "Three overlapping circles with the PM at the centre.", b)


@fig(PM, 2, "pm-evidence.svg", "Label every claim by its evidence: \"we know\" (observed behaviour, several real stories, data, people committing), \"we believe\" (some signs), \"we assume\" (no evidence yet — opinions, \"would you…?\" answers, one loud request). Test the riskiest assumption cheaply before building.",
     "A good habit is to label claims")
def _():
    b = heading("How sure are we, and why?")
    st = [("We know", "seen behaviour, data, repeated stories", GREEN_T, GREEN), ("We believe", "some signs, not yet proven", GOLD_T, INK2), ("We assume", "opinions, “would you…?”, one loud voice", CORAL_T, CORAL_D)]
    for i, (h, s, f, c) in enumerate(st):
        y = 60 + i * 72
        b += tb(20, y, 160, 60, [(h, 18, 800)], fill=f, stroke=c) + t(196, y + 36, s, 16, 500)
    b += arr(600, 270, 600, 66, INK2) + t(590, 290, "stronger", 16, 700, INK2, "end")
    b += t(20, 300, "Test the riskiest assumption cheaply, before building.", 16, 700)
    return svg(320, "Strength of evidence", "Three levels from know to assume.", b)


@fig(PM, 3, "pm-problem-statement.svg", "A problem statement in four parts: who (parents of new NGG members) struggles to do what (find their child's class time and room) because of why (it is spread across several WhatsApp messages), which costs them what (calls to the centre and sometimes a missed first session).",
     'Example: *"Parents of new NGG members')
def _():
    b = heading("Who · what · why · what it costs")
    parts = [("Who", "Parents of new NGG members", GOLD_T), ("struggles to", "find their child's class time and room", SOFT), ("because", "it is spread across WhatsApp messages", TEAL_T), ("which costs", "calls, and sometimes a missed first session", CORAL_T)]
    for i, (h, s, f) in enumerate(parts):
        y = 60 + i * 58
        b += tb(20, y, 140, 46, [(h, 16, 800)], fill=f, shadow=False) + tb(170, y, 450, 46, [(s, 16, 500)], fill=WHITE, a="start", shadow=False)
    b += t(20, 312, "No solution in it: “parents need an app” is a solution in disguise.", 16, 600, INK2)
    return svg(330, "Problem statement anatomy", "Four labelled parts of an example statement.", b)


@fig(PM, 4, "pm-value-effort.svg", "Value against effort: high value and low effort — do first; high value and high effort — plan carefully; low value and low effort — maybe; low value and high effort — don't. RICE scores an idea as Reach × Impact × Confidence ÷ Effort.",
     "**Value vs effort.**")
def _():
    b = heading("Value against effort")
    x0, y0, s = 90, 60, 220
    q = [("Do first", "quick wins", 0, 0, GREEN_T, GREEN), ("Plan carefully", "big bets", 1, 0, GOLD_T, INK2), ("Maybe", "", 0, 1, SOFT, LINE), ("Don't", "", 1, 1, CORAL_T, CORAL_D)]
    for h, sub, cx, cy, f, c in q:
        b += tb(x0 + cx * s, y0 + cy * 120, s - 6, 114, [(h, 18, 800)] + ([(sub, 16, 500, INK2)] if sub else []), fill=f, stroke=c, shadow=False)
    b += t(x0 + s, y0 + 262, "effort →", 16, 700, INK2, "middle")
    b += f'<text x="62" y="{y0 + 120}" font-size="16" font-weight="700" fill="{INK2}" text-anchor="middle" transform="rotate(-90 62 {y0 + 120})">value →</text>'
    b += t(546, y0 + 50, "high", 16, 600, INK2, "middle") if False else ""
    b += t(20, 360, "RICE = Reach × Impact × Confidence ÷ Effort", 16, 700)
    b += t(20, 386, "The numbers are estimates; the conversation is the value.", 16, 500, INK2)
    return svg(404, "Value and effort grid", "A 2 by 2 grid of value against effort, and the RICE formula.", b)


@fig(PM, 5, "pm-now-next-later.svg", "A Now / Next / Later roadmap of outcomes rather than features: now — parents find their child's class without calling; next — new families reach their first session; later — volunteers can swap shifts themselves. Certainty falls from left to right, so only \"now\" carries dates.",
     "Each item is better described")
def _():
    b = heading("Now · Next · Later — outcomes, not features")
    cols = [("Now", ["Parents find their", "child's class", "without calling"], GOLD_T, INK2), ("Next", ["New families reach", "their first session"], SOFT, LINE), ("Later", ["Volunteers swap", "shifts themselves"], SOFT, LINE)]
    for i, (h, items, f, c) in enumerate(cols):
        x = 20 + i * 207
        b += rect(x, 58, 186, 180, f, c, 10) + fit(x, 58, 186, 180, t(x + 14, 88, h, 18, 800, bg=f) + "".join(t(x + 14, 124 + j * 24, s, 16, 500, bg=f) for j, s in enumerate(items)))
    b += arr(40, 266, 600, 266) + t(320, 292, "less certain →  no far-off dates", 16, 700, INK2, "middle")
    return svg(310, "Now, next, later roadmap", "Three columns of outcomes from certain to uncertain.", b)


@fig(PM, 6, "pm-bring-the-problem.svg", "Working with designers and developers: instead of handing over a finished solution (\"build this screen\"), bring the problem, the goal and the constraints, and let the team explore solutions together — developers often see a simpler one.",
     "Then let the team explore solutions.")
def _():
    b = heading("Bring the problem, not the answer")
    b += rect(20, 58, 270, 150, CORAL_T, CORAL_D, 10) + t(36, 86, "Order-taking", 16, 800, CORAL_D, bg=CORAL_T)
    b += t(36, 122, "PM: “Build this screen.”", 16, 600, bg=CORAL_T) + t(36, 160, "Team's expertise wasted,", 16, 500, INK2, bg=CORAL_T) + t(36, 184, "a worse product", 16, 500, INK2, bg=CORAL_T)
    b += rect(310, 58, 310, 150, GREEN_T, GREEN, 10) + t(326, 86, "Solving together", 16, 800, GREEN, bg=GREEN_T)
    b += bullets(326, 120, ["the problem + evidence", "the goal + measure", "the constraints"], bg=GREEN_T, gap=26)
    b += arr(465, 210, 465, 238, GREEN) + tb(330, 240, 270, 46, [("team explores solutions", 16, 700)], fill=WHITE, stroke=GREEN)
    return svg(304, "Bring the problem", "A PM dictating a solution beside a PM bringing problem, goal and constraints.", b)


@fig(PM, 7, "pm-statement-revised.svg", "A problem statement revised on evidence: \"Parents struggle to find class times\" became \"Parents of children in their first month struggle to find the right class because the timetable itself is often out of date, which causes about 1 in 5 missed first sessions\" — a narrower user, a different cause, a measurable cost.",
     "Common improvements:")
def _():
    b = heading("The same statement, after the evidence")
    b += tb(20, 58, 600, 52, [("Before: Parents struggle to find class times.", 16, 600)], fill=SOFT, a="start")
    b += arr(320, 112, 320, 136)
    b += rect(20, 140, 600, 154, GREEN_T, GREEN, 10)
    rows = [("Parents of children in their first month", "narrower user"), ("struggle to find the right class", ""), ("because the timetable is often out of date", "different cause"), ("— about 1 in 5 first sessions missed", "measurable cost")]
    for i, (s, n) in enumerate(rows):
        b += t(36, 170 + i * 34, s, 16, 600, bg=GREEN_T)
        if n: b += t(604, 170 + i * 34, n, 16, 700, GREEN, "end", bg=GREEN_T)
    b += t(20, 324, "Record what changed and why. Changing course early is cheap.", 16, 600, INK2)
    return svg(342, "A revised problem statement", "Before and after versions, with the changes labelled.", b)


@fig(PM, 8, "pm-metric-target.svg", "Knowing whether it worked: measure the baseline before launch (for example, calls a week asking for class times), set a target and a timeframe (say, half that within six weeks), and watch a guardrail metric, such as complaints, that must not get worse.",
     "- **Set a target and a timeframe**")
def _():
    b = heading("Baseline, target, timeframe")
    x0, y0, w, h = 80, 84, 480, 170
    b += line(x0, y0 + h, x0 + w, y0 + h, INK2, 2) + line(x0, y0, x0, y0 + h, INK2, 2)
    X = lambda wk: x0 + (wk + 2) / 8 * w
    Y = lambda v: y0 + h - v / 140 * h
    pts = [(-2, 122), (-1, 118), (0, 120), (1, 104), (2, 92), (3, 80), (4, 72), (5, 64), (6, 58)]
    b += path("M" + " L".join(f"{X(a):.1f} {Y(v):.1f}" for a, v in pts), TEAL_D, sw=3, head=False)
    b += line(x0, Y(120), x0 + w, Y(120), INK2, 1.5, "5 4") + t(x0 + w + 6, Y(120) + 6, "baseline", 16, 700, INK2)
    b += line(x0, Y(60), x0 + w, Y(60), GREEN, 2, "5 4") + t(x0 + w + 6, Y(60) + 6, "target", 16, 700, GREEN)
    b += line(X(0), y0, X(0), y0 + h, GOLD, 3) + t(X(0), y0 + h + 24, "launch", 16, 700, INK, "middle")
    b += t(X(6), y0 + h + 24, "6 weeks", 16, 700, INK, "middle")
    b += t(x0, y0 - 10 + 4, "calls a week asking for class times", 16, 600, INK2)
    b += t(20, y0 + h + 60, "Guardrail: complaints and staff time must not rise.", 16, 600, INK2)
    return svg(y0 + h + 80, "Metric with baseline and target", "A line falling from a baseline to a target after launch.", b)


@fig(PM, 9, "pm-staged-rollout.svg", "A careful launch: release to about 10% of users, check errors and the main metric, then 50%, then everyone — with a feature flag that can switch the feature off in minutes and a rollback plan decided before launch.",
     "- **A rollback plan**")
def _():
    b = heading("Widen the launch only after each check")
    st = [("10%", 60), ("50%", 140), ("100%", 220)]
    x = 20
    for i, (p, wd) in enumerate(st):
        b += tb(x, 120 - wd / 4, 150, wd / 2 + 30, [(p, 20, 800), ("of users", 16, 500, INK2)], fill=[SOFT, TEAL_T, GREEN_T][i], stroke=[LINE, TEAL, GREEN][i])
        if i < 2:
            b += arr(x + 152, 120, x + 210, 120) + t(x + 181, 112 - wd / 4 - 6, "check", 16, 700, INK, "middle")
        x += 215
    b += tb(20, 214, 600, 56, [("Feature flag: switch it off in minutes. Rollback plan: decided before launch.", 16, 700)], fill=CORAL_T, stroke=CORAL_D)
    return svg(288, "Staged rollout", "Three stages, 10%, 50% and 100%, with checks between.", b)


@fig(PM, 10, "pm-feedback-loop.svg", "Turning feedback into action: collect it in one place, group it into themes and count them, separate the problem from the suggested fix, prioritise the themes, and close the loop by telling people what changed — which keeps them giving feedback.",
     "5. **Close the loop**")
def _():
    b = heading("Listen, act, and say what you did")
    b += flow([20, 230, 440], 64, 180, 52, [["1 Collect"], ["2 Group + count"], ["3 Problem, not fix"]])
    b += path("M530 118 V176 H414", INK2)
    b += tb(230, 150, 180, 52, ["4 Prioritise"], fill=SOFT)
    b += arr(228, 176, 204, 176) + tb(20, 150, 180, 52, ["5 Close the loop"], fill=GOLD_T, stroke=INK2)
    b += path("M110 148 V122", INK2)
    b += t(20, 240, "“Add a button for X” usually means “I couldn't do Y”: solve Y.", 16, 600, INK2)
    b += t(20, 266, "Telling people what changed keeps them telling you.", 16, 600, INK2)
    return svg(286, "Feedback loop", "Five steps in order, ending by telling users what changed.", b)
