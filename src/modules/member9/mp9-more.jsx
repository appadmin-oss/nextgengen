/* ── Member Portal v9 — the rest of the screens, the sheets, navigation and
 * render (see mp9-app.jsx for the data layer and Today / mentor / growth). ── */

/* The simple view's areas: five places, each named for what a child goes
   there to do. Money is a guardian's business at this age and stays out of
   the nav (its screen still opens from a link); Records is "My requests". */
function mp9SimpleAreas(older) {
  return [["Today", "ph ph-sun-horizon", [["today", "Today"]]],
    ["My mentor", "ph ph-handshake", [["mentor", "Talk to my mentor"], ["companion", "How my week went"], ["community", "My club"]]],
    ["Learn", "ph ph-book-open-text", [["learn", "My lessons"], ["sat", "This Saturday"], ["timetable", "My week"], ["tools", "Study tools"]].concat(older ? [["opps", "Opportunities"]] : [])],
    ["Me", "ph ph-star", [["growth", "My goals"], ["passport", "My badges"], ["journal", "My journal"], ["results", "My school report"]]],
    ["Help", "ph ph-lifebuoy", [["help", "Get help"], ["me", "My profile"], ["records", "My requests"]].concat(older ? [["money", "Money"]] : [])]];
}
const MP9_SIMPLE_SUBS = { mentor: "Send a message or a voice note", companion: "Tell us about your week", community: "See what your club is sharing", learn: "Your lessons and homework", sat: "What happens this Saturday",
  timetable: "When to come to the centre", tools: "Flashcards, quizzes and a focus timer", growth: "What you’re working towards", passport: "Badges you’ve earned", journal: "Write about your day",
  results: "Add your school report", help: "Ask a grown-up at NGG for help", me: "Your name, photo and settings", records: "Things you’ve asked us for", opps: "Things you can apply for" };
/* Today's big buttons in the simple view: the four things a child comes to do,
   one press each, before the full Today screen below. */
const MP9_SIMPLE_TILES = [["mentor", "Talk to my mentor", "ph ph-chat-circle-text"], ["learn", "My lessons", "ph ph-book-open-text"], ["sat", "This Saturday", "ph ph-calendar-star"], ["growth", "My goals", "ph ph-target"]];

Object.assign(Mp9Portal.prototype, {
  /* ── Learn, timetable, companion, money, records, me, community ───────── */
  learnVals(go) {
    const s = this.state, cur = this.dd("cur") || {}, d = this.dd("dash") || {}, me = this.me();
    const units = (cur.units || []).slice().sort((a, b) => a.week - b.week || a.position - b.position);
    const wk = (d.session && d.session.weekOf) || 0;
    const open = units.filter(u => !u.progress || u.progress.status !== "completed");
    const week = units.filter(u => u.week === wk);
    const pick = (week.length ? week : open.length ? open : units).slice(0, 4);
    const lessons = pick.map(u => {
      const pr = u.progress, done = pr && pr.status === "completed";
      const p = done ? 100 : pr ? (pr.pending ? 80 : pr.attempts ? 60 : 30) : 0;
      return { div: mp9CourseLine(u) + (u.overdueDays > 0 ? " · " + u.overdueDays + (u.overdueDays === 1 ? " day" : " days") + " late" : ""), t: (u.path ? u.path.code : "Week " + u.week) + " · " + u.title, p, w: p + "%", c: done ? "#1d6b30" : "#0b0b0c",
        next: done ? "Done · " + pr.bestPct + "%" : pr && pr.pending ? "Waiting for your instructor to mark it" : pr ? "Carry on · " + (u.checks ? u.checks + (u.checks === 1 ? " question" : " questions") : "read it") : "Start · about " + (u.durationMins || 20) + " minutes",
        open: () => this.openLesson(u.unitId) };
    });
    // Loading, an honest error with a retry, and empty are three different things.
    const curErr = !!(s.er && s.er.cur) && !this.dd("cur");
    if (!lessons.length) lessons.push({ div: me.track || "Your course",
      t: curErr ? "Lessons couldn’t load" : !this.dd("cur") ? "Loading your lessons…" : "No lessons published yet",
      p: 0, w: "0%", c: "#0b0b0c",
      next: curErr ? "Tap to try again" : "Your instructor publishes the term’s lessons here",
      open: () => { if (curErr) this.load("cur"); else this.toast("Nothing to open yet."); } });
    const asg = (d.assignments || []).map(a => {
      const st = mp9AsgState(a);
      return { t: a.title, div: (a.track || me.track || "Club") + (a.proofLabel ? " · " + a.proofLabel : ""), due: a.dueAt ? mp9Date(a.dueAt, { weekday: "short", day: "numeric", month: "short" }) : "no date", s: st,
        fg: ["marked", "submitted"].includes(a.state) ? "#1d6b30" : a.state === "todo" ? "#7a5600" : "#b0361c", open: () => this.setState({ handIn: a.assignmentId }) };
    });
    if (!asg.length) asg.push({ t: "No assignments right now", div: "", due: "–", s: "All clear", fg: "#1d6b30", open: () => this.toast("Nothing is waiting for you.") });
    const ev = (d.events || []).map(e => { const r = (s.rsvp || {})[e.eventId] !== undefined ? s.rsvp[e.eventId] : e.myRsvp; const going = r === "going";
      return { t: e.title, when: mp9Date(e.startAt, { weekday: "short", day: "numeric", month: "short" }) + (e.startAt && e.startAt.length > 10 ? " · " + new Date(e.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""), r, going: going ? "true" : "false",
        gBg: going ? "#0b0b0c" : "#fff", gFg: going ? "#fff" : "#0b0b0c", label: going ? "Going" : "I’ll go",
        pick: () => { const next = going ? "not_going" : "going"; this.setState({ rsvp: { ...(this.state.rsvp || {}), [e.eventId]: next } });
          NGGApi.member.rsvp({ eventId: e.eventId, status: next }).then(() => this.toast(next === "going" ? "You’re going. We’ll remind you." : "Changed to not going.")).catch(er => { this.setState({ rsvp: { ...(this.state.rsvp || {}), [e.eventId]: r } }); this.toast(mp9Err(er)); }); } }; });
    if (!ev.length) ev.push({ t: "Nothing coming up yet", when: "Events at your centre show here", going: "false", gBg: "#fff", gFg: "#0b0b0c", label: "–", pick: () => {} });
    const division = { name: (d.member || {}).division || me.track || "Your division", course: me.track || "Your course", instructor: "Your instructor", room: me.centre + " centre",
      chess: "Chess is part of every division · Saturdays, and online in the Arcade" };
    const tt = this.dd("tt") || {};
    const slots = (tt.slots || []);
    const byDay = {};
    const DN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    slots.forEach(x => { const day = DN[x.weekday] || x.day || "Saturday"; (byDay[day] = byDay[day] || []).push([x.startTime || x.start || "", (x.course || x.title || "") + (x.level ? " · " + x.level : ""), x.room || x.where || ""]); });
    if (slots[0] && slots[0].instructorName) division.instructor = slots[0].instructorName;
    if (slots[0] && slots[0].room) division.room = slots[0].room;
    const form = this.dd("form") || {};
    const satRows = (form.blocks || []).map(b => [b.start, b.title, (b.for && b.for.member && b.for.member[0]) || b.flow || ""]);
    const ttDays = [{ d: "Saturday", rows: satRows.length ? satRows : (byDay.Saturday || []) }].concat(Object.keys(byDay).filter(k => k !== "Saturday").map(k => ({ d: k, rows: byDay[k] })))
      .map(x => ({ d: x.d, rows: x.rows.map(([t, a, w]) => ({ t, a, w, mine: me.track && new RegExp(me.track.split(/\s+/)[0], "i").test(a) })) }));
    const curWeeks = units.map(u => { const pr = u.progress, st = pr && pr.status === "completed" ? "Done" : pr ? "In progress" : u.year > ((cur.placement || {}).year || 1) ? "Open early" : u.week > wk && u.stage !== "catchup" ? "Opens week " + u.week : "Not started";
      return { w: u.path ? u.path.week : u.week, t: u.title, div: mp9CourseLine(u), s: st, score: pr && pr.bestPct ? pr.bestPct + "%" : "", fg: st === "Done" ? "#1d6b30" : st === "In progress" ? "#7a5600" : "#6b6b72", icon: st === "Done" ? "ph-fill ph-check-circle" : st === "In progress" ? "ph-fill ph-circle-half" : "ph ph-lock-simple" }; });
    const oppsTop = this.older() ? this.oppItems().slice(0, 3).map(o => ({ t: o.t, why: o.why || o.org, close: o.close })) : [];
    return { lessons, assignments: asg, events: ev, division, ttDays, curWeeks: curWeeks.length ? curWeeks : [{ w: "–", t: "No lessons published yet", div: "", s: "", score: "", fg: "#6b6b72", icon: "ph ph-hourglass" }],
      oppsTop: oppsTop.length ? oppsTop : [{ t: "Nothing picked for you yet", why: "Staff add bootcamps and competitions here", close: "check back soon" }],
      dlPdf: () => this.printCurriculum(), dlDoc: () => this.printCurriculum(true),
      openTimetableMaker: () => { location.href = "/timetable/me"; }, printPdf: () => window.print(),
      lt: this.subTabs("ltab", [["week", "This week", "ph ph-book-open-text"], ["course", "My course", "ph ph-books"]].concat(this.older() ? [["forYou", "For you", "ph ph-sparkle"]] : [])) };
  },
  printCurriculum(word) {
    NGGApi.member.curriculumDocument ? NGGApi.member.curriculumDocument().catch(() => null) : null;
    window.open("/api/member/curriculum-doc.php" + (word ? "?format=doc" : ""), "_blank", "noopener");
  },
  openLesson(unitId) {
    this.openSheet({ k: "lesson", id: unitId });
    this.setState({ lesson: null, lessonErr: null, lPart: 0 });
    NGGApi.member.curriculumUnit(unitId).then(r => this.setState({ lesson: r })).catch(e => this.setState({ lessonErr: mp9Err(e) }));
  },
  oppItems() {
    const o = this.dd("opps") || {}, s = this.state;
    return (o.items || []).map(x => { const saved = (s.oppSaved || {})[x.oppId] !== undefined ? s.oppSaved[x.oppId] : x.saved;
      return { id: x.oppId, t: x.title, org: x.org || "NGG", type: x.type, why: x.why, url: x.url, saved,
        close: x.closesOn ? "Closes " + mp9Date(x.closesOn, { day: "numeric", month: "short" }) : "Open" }; });
  },
  compVals(go) {
    const s = this.state, set = o => this.setState(o), c = this.dd("comp") || {}, cur = c.current || null, mf = this.mentorInfo().first;
    const RATE = { on_track: ["Going well", "#2f9e44"], needs_attention: ["Needs a push", "#e0a100"], at_risk: ["Needs help", "#e8590c"], getting_started: ["Getting started", "#c9c6bc"] };
    const r = cur ? RATE[cur.rating] || [cur.rating, "#c9c6bc"] : ["Not worked out yet", "#c9c6bc"];
    const mt = (cur && cur.metrics) || {}, att = mt.attendance || {}, cu = mt.curriculum || {}, co = mt.conduct || {};
    const period = cur ? cur.period : mp9Week();
    const R0 = this.st("mp9.review", {});
    const R = s.cr || (R0.period === period ? R0 : { period, step: 0, wins: [], blocks: [], share: true });
    const upd = p => set({ cr: { ...R, ...p } });
    const chip = (arr, key) => l => { const on = arr.includes(l); return { l, on: on ? "true" : "false", bw: on ? "2px" : "1px", ring: on ? "#0b0b0c" : "#d6d4cc", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", go: () => upd({ [key]: on ? arr.filter(x => x !== l) : arr.concat([l]) }) }; };
    const FIX = { "My phone": ["Distance beats willpower", "Put the phone in another room for the first 25 minutes. Even a phone face-down on the desk pulls attention."], "Too tired": ["Move it earlier", "Study straight after school while you’re fresh, and aim for 8 to 10 hours of sleep."], "Didn’t understand the work": ["Get unstuck fast", "Write the exact question down. Ask Companion for a hint now, or your instructor on Saturday."], "Chores at home": ["Agree a fixed time", "Ask your family for one protected 30-minute slot on study days. " + mf + " can help with that conversation."], "No quiet place": ["Find a spot", "Ask at your centre about a quiet place on Saturday afternoons. At home, headphones and the same seat each time help."], "I forgot": ["Let the reminder do it", "Your plan reminders come at the time you chose."] };
    const blocks = R.blocks.filter(b => b !== "Nothing got in the way");
    const step = R.step || 0, done = !!R.done;
    const plan0 = (this.dd("today") || {}).promises;
    const wish = R.wish != null ? R.wish : plan0 && plan0.items && plan0.items[0] ? "Keep all my " + plan0.items[0].subject + " sessions" : "";
    const obstacle = R.obstacle != null ? R.obstacle : (blocks[0] || "");
    const cpTab = s.cpTab || (done ? "week" : "review");
    const ccKey = "mp9.cc"; const CC = this.st(ccKey, {}); const sessKey = ((this.dd("dash") || {}).session || {}).sessionId || "session";
    const kept = ((CC.session === sessKey && CC.kept) || []).map(k => ({ icon: k.icon || "ph ph-notepad", fg: "#4a4a50", t: k.t, s: k.s, when: mp9When(k.at) }));
    const msgs = s.cc || [];
    const pulse = [
      [att.programmeDays ? (att.present >= att.programmeDays ? "ph-fill ph-check-circle" : "ph-fill ph-warning-circle") : "ph ph-circle", att.present + " of " + (att.programmeDays || 0) + " days", "Attendance", "records", att.programmeDays && att.present < att.programmeDays],
      [plan0 ? "ph-fill ph-check-circle" : "ph ph-circle", plan0 ? (plan0.adherence !== null && plan0.adherence !== undefined ? plan0.adherence + "% of sessions" : "Plan live") : "No plan yet", "Study plan", "results", plan0 && plan0.adherence !== null && plan0.adherence < 60],
      [cu.overdue ? "ph-fill ph-warning-circle" : "ph-fill ph-check-circle", cu.completed + " of " + (cu.lessons || 0) + " lessons" + (cu.overdue ? " · " + cu.overdue + " overdue" : ""), "Lessons", "learn", !!cu.overdue],
      [co.state && co.state !== "clear" ? "ph-fill ph-warning-circle" : "ph-fill ph-check-circle", co.state && co.state !== "clear" ? co.state : "No conduct issues", "Conduct", "records", co.state && co.state !== "clear"],
    ].map(([icon, v, k, to, warn]) => ({ icon, fg: warn ? "#8a5a00" : "#1d6b30", bg: warn ? "#fdf6e3" : "#f3faf4", v, k, go: go(to) }));
    return {
      comp: { week: cur ? mp9Date(mt.from) + " – " + mp9Date(mt.to) : "", verdict: r[0], why: cur ? cur.summary : "" },
      compEarlier: (c.history || []).slice(1, 6).map(h => { const x = RATE[h.rating] || [h.rating, "#c9c6bc"]; const m2 = h.metrics || {};
        return { w: mp9Date(m2.from) + " – " + mp9Date(m2.to), v: x[0], n: (h.focus || [])[0] || "", hasN: !!(h.focus || [])[0], fg: x[0] === "Going well" ? "#1d6b30" : x[0] === "Needs a push" ? "#7a5600" : "#4a4a50", dot: x[1] }; }),
      cp: {
        tabs: [["week", "This week", "ph ph-sun-horizon", false], ["review", "Review", "ph ph-arrows-clockwise", !done], ["ask", "Ask", "ph ph-sparkle", false]].map(([k, l, icon, dot]) => ({ l, icon, dot, on: cpTab === k ? "true" : "false", bg: cpTab === k ? "#fff" : "transparent", sh: cpTab === k ? "0 1px 2px rgba(11,11,12,.12)" : "none", fw: cpTab === k ? 700 : 500, go: () => set({ cpTab: k }) })),
        tWeek: cpTab === "week", tReview: cpTab === "review", tAsk: cpTab === "ask",
        kept: kept.length ? kept : [{ icon: "ph ph-sparkle", fg: "#4a4a50", t: "Nothing kept yet", s: "Save a summary of a Companion chat and it stays here for the session.", when: "" }],
        canEnd: msgs.length > 1,
        endChat: () => { const n = msgs.filter(m => m.role === "user").length; const first = (msgs.find(m => m.role === "user") || {}).text || "a chat";
          const k = { icon: "ph ph-notepad", t: "Chat summary", s: "You asked about “" + first.slice(0, 60) + "”. " + n + (n === 1 ? " question" : " questions") + " covered.", at: new Date().toISOString() };
          this.saveSt(ccKey, { session: sessKey, kept: [k].concat((CC.session === sessKey && CC.kept) || []).slice(0, 40) }); this.toast("Summary saved to This week."); },
        verdict: r[0], dot: r[1], week: cur ? "Week of " + mp9Date(period, { day: "numeric", month: "long" }) : "",
        pulse,
        revMeta: done ? "Done · the next one opens Sunday" : "3 minutes · every Sunday", revOpen: !done, revDone: done,
        steps: ["Look back", "What got in the way", "Next week"].map((l, i) => ({ l, bar: i < step ? "#1d6b30" : i === step ? "#0b0b0c" : "#e6e5e0", fw: i === step ? 700 : 500, fg: i <= step ? "#0b0b0c" : "#8a8a90" })),
        s1: step === 0, s2: step === 1, s3: step === 2,
        wins: ["Came every Saturday", "Kept my study sessions", "Finished a lesson", "Helped someone", "Tried something hard", "Slept well"].map(chip(R.wins, "wins")),
        proud: R.proud || "", onProud: e => upd({ proud: e.target.value }),
        blocks: Object.keys(FIX).concat(["Nothing got in the way"]).map(chip(R.blocks, "blocks")),
        fixes: blocks.map(b => ({ k: FIX[b][0], t: FIX[b][1] })),
        wish, onWish: e => upd({ wish: e.target.value }), outcome: R.outcome || "", onOutcome: e => upd({ outcome: e.target.value }),
        obstacle, onObstacle: e => upd({ obstacle: e.target.value }), plan: R.plan || "", onPlan: e => upd({ plan: e.target.value }),
        planPh: obstacle ? "If " + obstacle.toLowerCase() + ", then I will…" : "If I’m tempted to skip, then I will do just 10 minutes", planBd: R.tried && !(R.plan || "").trim() ? "#b0361c" : "#d6d4cc",
        shareA: R.share ? "true" : "false", track: R.share ? "#0b0b0c" : "#d6d4cc", knob: R.share ? "21px" : "3px", shareT: R.share ? "Share with " + mf + " (wins and plan, not the obstacles)" : "Keep this review to myself", toggleShare: () => upd({ share: !R.share }),
        canBack: step > 0, back: () => upd({ step: step - 1 }),
        nextL: step === 2 ? "Save my week" : "Next",
        next: () => {
          if (step < 2) return upd({ step: step + 1 });
          if (!(R.plan || "").trim()) { upd({ tried: true }); return this.toast("Write your if-then plan first."); }
          const fin = { ...R, period, done: true, tried: false, at: new Date().toISOString() };
          this.saveSt("mp9.review", fin); set({ cr: null, cpTab: "week" });
          if (R.share) this.journalSave({ title: "My week", visibility: "mentor", tags: "review", body: (R.wins.length ? "Wins: " + R.wins.join(", ") + ". " : "") + (R.proud ? "Proud of: " + R.proud + ". " : "") + "Next week: " + (wish || "") + (R.outcome ? " (" + R.outcome + ")" : "") + ". Plan: " + R.plan })
            .then(x => x && this.toast("Saved and shared with " + mf));
          else this.toast("Saved. Only you can see it.");
        },
        doneT: (R.wins.length ? "Wins: " + R.wins.join(", ").toLowerCase() + ". " : "") + "Plan: " + (R.plan || "") + (R.share ? " Shared with " + mf + "." : ""),
        redo: () => set({ cr: { ...R, done: false, step: 2 } }),
        starters: [["ph ph-question", "Quiz me on a subject", "Practice testing helps it stick", "Quiz me on one of my subjects, one question at a time."], ["ph ph-calendar-check", "Plan tomorrow’s study", "Turn it into an if-then plan", "Help me plan tomorrow’s study."], ["ph ph-lightbulb", "I’m stuck on homework", "Hints, never the answer", "I’m stuck on a homework question."], ["ph ph-heart", "I feel stressed about exams", "One small step for tonight", "I feel stressed about exams."]]
          .map(([icon, t, s2, prompt]) => ({ icon, t, s: s2, go: () => this.askComp(prompt) })),
        chatEmpty: !msgs.length, msgs: msgs.map(m => ({ text: m.text, al: m.role === "user" ? "flex-end" : "flex-start", bg: m.role === "user" ? "#0b0b0c" : "#f4f4f2", fg: m.role === "user" ? "#fff" : "#0b0b0c" })), busy: !!s.ccBusy,
        q: s.ccQ || "", onQ: e => set({ ccQ: e.target.value }), send: e => { e.preventDefault(); this.askComp(s.ccQ); },
      },
    };
  },
  askComp(text) {
    text = String(text || "").trim(); if (!text || this.state.ccBusy) return;
    const msgs = (this.state.cc || []).concat([{ role: "user", text }]);
    this.setState({ cc: msgs, ccQ: "", ccBusy: true });
    NGGApi.member.coach(msgs.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }))).then(r => {
      this.setState(s => ({ cc: (s.cc || []).concat([{ role: "ai", text: (r && r.reply) || "Tell me a bit more." }]), ccBusy: false }));
      if (r && r.safeguarding) this.toast("Your mentor and the safeguarding lead have been told so they can help.");
    }).catch(e => this.setState(s => ({ cc: (s.cc || []).concat([{ role: "ai", text: mp9Err(e) }]), ccBusy: false })));
  },
  moneyVals(go) {
    const s = this.state, st = this.dd("stmt") || {}, cp = this.dd("comp9") || {}, t = this.dd("today") || {}, a = t.account || {};
    const lines = (st.lines || []).filter(l => !l.void);
    const rows = lines.map(l => ({ d: mp9Date(l.date), w: (l.note || l.kind) + (l.real === false ? " · programme cost" : ""), c: l.charge ? mp9Naira(l.charge) : "", p: l.credit ? mp9Naira(l.credit) : "", bal: mp9Naira(l.runningPayable), isPay: !!l.credit }));
    const fines = (cp.fines || []);
    return {
      ledger: rows.length ? (s.ledgerAll ? rows : rows.slice(-8)) : [{ d: "–", w: st.enabled === false ? "Nothing is being charged on this account" : "Nothing charged yet", c: "", p: "", bal: mp9Naira(0), isPay: false }],
      ledgerMore: rows.length > 8 && !s.ledgerAll, ledgerN: rows.length, showLedger: () => this.setState({ ledgerAll: true }),
      mou: { done: true, cost: a.trainingFee ? mp9Naira(a.trainingFee) : "Covered", note: "Covered by NGG. This is not something you are asked to pay.", status: "Active" },
      finesList: fines.length ? fines.map(f => ({ d: mp9Date(f.issuedAt), t: f.reason, a: mp9Naira(f.amount), st: f.status === "pending" ? "Being reviewed" : "Owed", fg: "#b0361c", strike: "none" }))
        : [{ d: "", t: "No fines. Keep it that way.", a: "", st: "", fg: "#1d6b30", strike: "none" }],
      openPaid: () => this.go("records", { rKind: "I've made a payment", rF: {} }),
    };
  },
  recordsVals() {
    const s = this.state, r = this.dd("rec") || {}, att = r.attendance || {}, q = this.dd("reqs") || {};
    const days = (att.days || []).map(x => ({ d: mp9Date(x.date, { weekday: "short", day: "numeric", month: "short" }), st: x.status ? x.status[0].toUpperCase() + x.status.slice(1) : x.in ? "Present" : "Absent", i: x.in || "—", o: x.out || "—" }))
      .map(x => ({ ...x, fg: x.st === "Present" ? "#1d6b30" : x.st === "Late" ? "#7a5600" : "#b0361c" }));
    const KINDS = [["I've made a payment", "payment", ["How much", "Transfer reference, if you have one", "When you paid (YYYY-MM-DD)"]], ["I'll be away", "leave", ["From (YYYY-MM-DD)", "Until (YYYY-MM-DD, blank if you do not know)", "Why"]],
      ["Ask for a replacement ID", "idcard", ["Say why"]], ["Correct my details", "details", ["What needs changing"]], ["Appeal a charge", "appeal", ["Which charge, and why"]], ["Something else", "help", ["Anything else the desk should know"]]];
    const K = KINDS.find(k => k[0] === s.rKind);
    const f = s.rF || {};
    const rOk = !!K && (K[1] === "payment" ? Number(f[K[2][0]]) > 0 : K[1] === "leave" ? /^\d{4}-\d{2}-\d{2}$/.test(f[K[2][0]] || "") : !!(f[K[2][0]] || "").trim());
    const ST = { open: ["Waiting for a reply", "#7a5600"], approved: ["Approved", "#1d6b30"], declined: ["Declined", "#b0361c"], withdrawn: ["Withdrawn", "#6b6b72"] };
    const list = (q.requests || []).map(x => { const st = ST[x.status] || [x.status, "#4a4a50"];
      return { t: x.subject || x.kindLabel, key: x.requestId, gone: x.status === "withdrawn", hasReply: !!x.decision, reply: x.decision || "", canWithdraw: x.status === "open", sFg: st[1], sText: st[0], when: mp9Date(x.createdAt),
        withdraw: () => NGGApi.member.withdrawRequest(x.requestId).then(() => { this.refresh(["reqs"]); this.toast("Request withdrawn"); }).catch(e => this.toast(mp9Err(e))) }; });
    return {
      rec: { attended: att.present || 0, ran: att.daysRan || 0, pct: att.rateKnown ? att.rate + "%" : "no term calendar set" },
      certs: (r.certificates || []).map(c => ({ t: c.certId + (c.revoked ? " · revoked" : ""), d: String(c.issuedAt || "").slice(0, 10), url: "/cert/" + c.certId })),
      days: days.length ? (s.daysAll ? days : days.slice(0, 6)) : [{ d: "No days recorded yet", st: "", i: "—", o: "—", fg: "#6b6b72" }], daysMore: !s.daysAll && days.length > 6, showDays: () => this.setState({ daysAll: true }),
      reqKinds: KINDS.map(k => ({ k: k[0], on: s.rKind === k[0] ? "true" : "false", ring: s.rKind === k[0] ? "#0b0b0c" : "#d6d4cc", bw: s.rKind === k[0] ? "2px" : "1px", pick: () => this.setState({ rKind: k[0], rF: {} }) })),
      rHas: !!K, rFields: K ? K[2].map(fl => ({ f: fl, v: f[fl] || "", on: e => this.setState({ rF: { ...this.state.rF, [fl]: e.target.value } }) })) : [],
      rCant: !rOk, rOp: rOk ? 1 : 0.4, rCancel: () => this.setState({ rKind: null, rF: {} }),
      rSend: () => { if (!rOk) return; const v = i => (f[K[2][i]] || "").trim();
        const body = K[1] === "payment" ? { kind: "payment", amount: Number(v(0)), reference: v(1), paidAt: v(2), body: "" } : K[1] === "leave" ? { kind: "leave", fromDate: v(0), toDate: v(1), body: v(2) }
          : { kind: K[1], subject: f.subject || "", body: v(0) };
        NGGApi.member.raiseRequest(body).then(() => { this.setState({ rKind: null, rF: {} }); this.refresh(["reqs"]); this.toast("Sent. You’ll see the reply here."); }).catch(e => this.toast(mp9Err(e))); },
      reqList: list.length ? list : [{ t: "You haven’t asked the desk anything yet", key: "none", gone: false, hasReply: false, reply: "", canWithdraw: false, sFg: "#6b6b72", sText: "", when: "–", withdraw: () => {} }],
    };
  },
  meVals() {
    const s = this.state, d = this.dd("dash") || {}, m = d.member || {}, t = this.dd("today") || {}, p = t.profile || {}, cir = this.dd("circle") || {}, sec = this.dd("sec") || {};
    const linked = (cir.family || cir.links || []).map(x => (x.name || x.fullName || "A guardian") + (x.relation ? " · " + x.relation : ""));
    const devices = (sec.sessions || []).map(x => ({ t: (x.device || x.ua || "A device") + (x.ip ? " · " + x.ip : ""), when: x.current ? "Now" : mp9When(x.lastSeenAt || x.createdAt), cur: !!x.current, notCur: !x.current,
      signOut: () => NGGApi.member.securityRevoke(x.sid || x.sessionId).then(() => { this.refresh(["sec"]); this.toast("Signed out of that device"); }).catch(e => this.toast(mp9Err(e))) }));
    const ngv = d.ngv || null;
    return {
      profile: { phone: p.guardianPhone || "Not on record", school: p.school || "Not on record", cls: m.level || "–", pronoun: "" },
      ngv: { on: !!ngv, note: ngv ? (ngv.note || ngv.status || "You’re on the NGV volunteer track.") : "You can apply to join NGV, the volunteer track, once your centre opens it." }, ngvOff: !ngv,
      circle: { code: cir.code || "", linked: linked.length ? linked : ["Nobody linked yet"] },
      codeText: s.codeShown ? (cir.code || "–") : "••••••", codeLabel: s.codeShown ? "Hide" : "Show code", toggleCode: () => this.setState({ codeShown: !s.codeShown }),
      devices: devices.length ? devices : [{ t: "This device", when: "Now", cur: true, notCur: false }],
      signOutAll: () => NGGApi.member.securityRevokeOthers().then(() => { this.refresh(["sec"]); this.toast("Signed out of every other device"); }).catch(e => this.toast(mp9Err(e))),
      askProfileChange: () => this.go("records", { rKind: "Correct my details", rF: {} }),
    };
  },
  feedVals() {
    const s = this.state, f = this.dd("feed") || {};
    const posts = (f.posts || f.items || []);
    const R = p => (p.reactions || {});
    return { feed: posts.slice(0, 20).map(p => {
      const id = p.postId; const lk = !!(s.liked[id] !== undefined ? s.liked[id] : (p.myReactions || []).includes("❤️")), ch = !!(s.cheered[id] !== undefined ? s.cheered[id] : (p.myReactions || []).includes("👏"));
      const base = R(p); const mine = s.cmts[id] || [];
      const loaded = (s.cmtsLoaded || {})[id] || [];
      const react = (emoji, key, on) => () => { this.setState({ [key]: { ...this.state[key], [id]: !on } }); NGGApi.member.community.react(id, emoji).catch(e => { this.setState({ [key]: { ...this.state[key], [id]: on } }); this.toast(mp9Err(e)); }); };
      return { id, by: p.authorName || p.channelName || "NGG", when: mp9When(p.createdAt), t: p.body || p.title || "",
        likesN: (base["❤️"] || 0) - ((p.myReactions || []).includes("❤️") ? 1 : 0) + (lk ? 1 : 0), cheersN: (base["👏"] || 0) - ((p.myReactions || []).includes("👏") ? 1 : 0) + (ch ? 1 : 0),
        lkIcon: lk ? "ph-fill ph-heart" : "ph ph-heart", lkFg: lk ? "#b0361c" : "#4a4a50", chIcon: ch ? "ph-fill ph-hands-clapping" : "ph ph-hands-clapping", chFg: ch ? "#a07400" : "#4a4a50",
        like: react("❤️", "liked", lk), cheer: react("👏", "cheered", ch),
        cmts: loaded.map(c => ({ w: c.authorName || "Member", t: c.body, pending: false })).concat(mine.map(t2 => ({ w: "You", t: t2, pending: true }))), cN: (p.commentCount || p.comments || 0) + mine.length, open: !!s.cOpen[id],
        toggle: () => { const o = !s.cOpen[id]; this.setState({ cOpen: { ...this.state.cOpen, [id]: o } }); if (o) NGGApi.member.community.comments(id).then(r => this.setState({ cmtsLoaded: { ...(this.state.cmtsLoaded || {}), [id]: (r && r.comments) || [] } })).catch(() => {}); },
        draft: s.cDraft[id] || "", onDraft: e => this.setState({ cDraft: { ...this.state.cDraft, [id]: e.target.value } }),
        send: e => { e.preventDefault(); const t2 = (this.state.cDraft[id] || "").trim(); if (!t2) return;
          NGGApi.member.community.comment(id, t2).then(r => { this.setState({ cmts: { ...this.state.cmts, [id]: (this.state.cmts[id] || []).concat(r && r.held === false ? [] : [t2]) }, cDraft: { ...this.state.cDraft, [id]: "" } }); this.toast("Comment sent. It shows once a moderator checks it."); }).catch(er => this.toast(mp9Err(er))); } };
    }).concat(posts.length ? [] : [{ id: "none", by: "NGG", when: "", t: f.error ? "The feed couldn’t load." : "Nothing in the community feed yet.", likesN: 0, cheersN: 0, lkIcon: "ph ph-heart", lkFg: "#4a4a50", chIcon: "ph ph-hands-clapping", chFg: "#4a4a50", like: () => {}, cheer: () => {}, cmts: [], cN: 0, open: false, toggle: () => {}, draft: "", onDraft: () => {}, send: e => e.preventDefault() }]) };
  },
  projectVals() {
    const P = this.st("mp9.project", null);
    const STEPS = ["Find a problem", "Form a team", "Design a solution", "Do it", "Show what changed"];
    const at = P ? P.at || 0 : 0;
    return {
      project: P ? { t: P.t, team: P.team || "Your team" } : { t: "No team project yet", team: "Start one with your pod" },
      pSteps: STEPS.map((t, i) => ({ t, n: i + 1, bg: P && i < at ? "#1d6b30" : P && i === at ? "#f5b026" : "#e6e5e0", fg: P && i < at ? "#fff" : "#0b0b0c", lab: P && i < at ? "Done" : P && i === at ? "Now" : "" })),
      teamL: P ? "Add an update for the team" : "Start a team project", pCanNext: !!P && at < STEPS.length,
      pNextL: P && at < STEPS.length ? "Mark “" + STEPS[at] + "” done" : "", pNext: () => { if (!P) return; this.saveSt("mp9.project", { ...P, at: Math.min(STEPS.length, at + 1) }); this.toast(STEPS[at] + ": done."); },
      teamPosts: ((P && P.posts) || []).map(x => ({ t: x.t, when: mp9When(x.at) })), hasTeamPosts: !!(P && P.posts && P.posts.length),
    };
  },
  passportVals() {
    const d = this.dd("dash") || {}, stats = d.stats || {}, r = this.dd("rec") || {}, PF = this.st("mp9.portfolio", []);
    const badges = (stats.badges || []).map(b => ({ t: (stats.badgeLabels || {})[b] || b, d: "Earned on NGG", by: "Programme", icon: "ph ph-medal" }));
    const certs = (r.certificates || []).filter(c => !c.revoked).map(c => ({ t: "Certificate " + c.certId, d: c.daysPresent + " days · " + c.attendanceRate + "% · " + String(c.issuedAt).slice(0, 10), by: "NGG", icon: "ph ph-certificate" }));
    const ach = certs.concat(badges);
    return {
      achievements: ach.length ? ach : [{ t: "Nothing yet", d: "Missions, badges and certificates collect here", by: "", icon: "ph ph-medal" }],
      portfolio: PF.length ? PF.map(x => ({ t: x.t, k: x.k, ph: x.url ? "open " + (x.k || "file").toLowerCase() : (x.k || "work").toLowerCase(), url: x.url })) : [{ t: "Add your first piece of work", k: "", ph: "your work here" }],
      downloadPassport: () => this.downloadPassport(ach, PF),
    };
  },
  downloadPassport(ach, PF) {
    const me = this.me();
    (window.loadVendor ? window.loadVendor("jspdf") : Promise.reject(new Error("no_pdf"))).then(() => {
      const J = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF; const doc = new J({ unit: "mm", format: "a4" });
      let y = 22; doc.setFontSize(20); doc.text("Growth passport", 18, y); y += 9;
      doc.setFontSize(12); doc.text(me.name + " · " + me.id + " · " + me.centre + " centre", 18, y); y += 12;
      doc.setFontSize(14); doc.text("Achievements", 18, y); y += 7; doc.setFontSize(11);
      ach.forEach(a => { doc.text("• " + a.t + (a.d ? " — " + a.d : ""), 20, y); y += 6; if (y > 280) { doc.addPage(); y = 20; } });
      y += 6; doc.setFontSize(14); doc.text("Portfolio", 18, y); y += 7; doc.setFontSize(11);
      (PF.length ? PF : [{ t: "Nothing added yet" }]).forEach(x => { doc.text("• " + x.t + (x.k ? " (" + x.k + ")" : "") + (x.url ? " " + x.url : ""), 20, y); y += 6; if (y > 280) { doc.addPage(); y = 20; } });
      doc.save("growth-passport-" + (me.id || "ngg") + ".pdf");
    }).catch(() => { this.toast("Opening the print view instead · save it as a PDF"); setTimeout(() => window.print(), 300); });
  },

  /* ── Saturday ────────────────────────────────────────────────────────── */
  satVals(go) {
    const s = this.state, f = this.dd("form") || {}, d = this.dd("dash") || {}, mf = this.mentorInfo().first, satIso = this.satDate(), me = this.me();
    const missions = d.today || [];
    const M = missions[0] || null;
    const ST = { todo: ["Ready", "#7a5600", "#fdf6e3", "Add proof"], submitted: ["Waiting on " + mf, "#1e4fae", "#eef3fd", ""], pending: ["Waiting on " + mf, "#1e4fae", "#eef3fd", ""], verified: ["Done", "#1d6b30", "#e9f6ec", ""], approved: ["Done", "#1d6b30", "#e9f6ec", ""], rejected: ["Try again", "#b0361c", "#fdeeea", "Add proof"] };
    const ms = missions.map(m => { const st = (s.mState || {})[m.missionId] || m.status || "todo"; const x = ST[st] || ST.todo;
      return { t: m.title + (m.prompt ? ": " + m.prompt : ""), label: x[0], fg: x[1], bg: x[2], cta: x[3], hasCta: !!x[3], sub: st === "todo" || st === "rejected" ? "Proof: " + (m.proof === "text" ? "a few lines" : m.proof === "photo" ? "a photo" : "a photo or a note") + " · " + (m.xp || 0) + " XP" : st === "submitted" || st === "pending" ? "Sent · your mentor checks it" : "Verified",
        act: () => this.openSheet({ k: "proof", id: m.missionId, t: m.title }) }; });
    const ev = [["photo", "Photo", "ph ph-camera", "image/*"], ["video", "Video", "ph ph-video-camera", "video/*"], ["audio", "Voice note", "ph ph-microphone", "audio/*"], ["write", "Write it", "ph ph-pencil-simple-line", ""]];
    const evT = ev.find(x => x[0] === s.evType);
    const Mst = M ? ((s.mState || {})[M.missionId] || M.status || "todo") : "todo";
    const evSent = !!M && (Mst !== "todo" && Mst !== "rejected");
    return {
      sat: { date: satIso ? mp9Date(satIso, { weekday: "long", day: "numeric", month: "long" }) : "Saturday", time: f.hours || "8:00am – 2:00pm", theme: f.theme || "Think. Create. Lead. Serve.", room: me.centre + " centre" },
      plan: (f.blocks || []).map(b => ({ t: b.start, a: b.title + ((b.for && b.for.member && b.for.member[0]) ? " · " + b.for.member[0] : "") })).concat(f.blocks && f.blocks.length ? [] : [{ t: "", a: f.error ? "The plan couldn’t load." : "The Saturday plan isn’t published yet." }]),
      ch: M ? { t: M.title, cat: M.type || "Mission", due: "Before Saturday", d: M.prompt || "", builds: [] } : { t: "No mission this week", cat: "Mission", due: "", d: "When the week’s mission opens, it shows here.", builds: [] },
      builds: M ? [M.type || "Reflect", (M.xp || 0) + " XP", M.estimatedMin ? "About " + M.estimatedMin + " min" : ""].filter(Boolean) : [],
      evTypes: ev.map(([id, label, icon]) => ({ label, icon, on: s.evType === id ? "true" : "false", ring: s.evType === id ? "#0b0b0c" : "#d6d4cc", bw: s.evType === id ? "2px" : "1px", pick: () => this.setState({ evType: id, evFile: null }) })),
      hasEvType: !!s.evType && !evSent, evSent, evNotSent: !evSent && !!M,
      evNeedsFile: !!evT && !!evT[3], evAccept: evT ? evT[3] : "", evFileL: s.evBusy ? "Uploading…" : s.evFile ? s.evFile.name + " · ready" : evT && evT[3] ? "Tap to choose your " + evT[1].toLowerCase() : "Write what you did below",
      onEvFile: e => { const file = e.target.files && e.target.files[0]; if (!file) return; this.setState({ evBusy: true }); (s.evType === "photo" ? NGGApi.uploadOrInline(file, "proof") : NGGApi.uploadFile(file, "post"))
        .then(u => this.setState({ evBusy: false, evFile: { name: file.name, url: mp9Abs(u.url) } })).catch(er => { this.setState({ evBusy: false }); this.toast(mp9Err(er)); }); },
      evText: s.evText, onEvText: e => this.setState({ evText: e.target.value }),
      sendEv: () => { if (!M) return; if (evT && evT[3] && !s.evFile) return this.toast("Choose your " + evT[1].toLowerCase() + " first."); if (!s.evText.trim() && !s.evFile) return this.toast("Write what you learned first.");
        NGGApi.member.submitMission({ missionId: M.missionId, proofUrl: s.evFile ? s.evFile.url : "", note: s.evText.trim() }).then(() => {
          this.setState({ mState: { ...(this.state.mState || {}), [M.missionId]: "submitted" }, evText: "", evFile: null, evType: null }); this.refresh(["dash"]); this.toast("Sent to " + mf + " for review"); }).catch(e => this.toast(mp9Err(e))); },
      missions: ms.length ? ms : [{ t: "No missions this week", label: "", fg: "#6b6b72", bg: "#f4f4f2", cta: "", hasCta: false, sub: "", act: () => {} }],
      missionsMeta: ms.filter(m => m.label === "Done").length + " of " + ms.length + " done" + (d.session ? " · week " + d.session.weekOf : ""),
    };
  },

  /* ── School results ───────────────────────────────────────────────────── */
  rsVals(go) {
    const s = this.state, set = o => this.setState(o), D = this.dd("res"), mf = this.mentorInfo().first;
    if (!D) return { rs: { sent: false, notSent: true, steps: [], rows: [], plan: [], kpis: [], flags: [], to: [], reminders: [], audit: [], timeline: [], hist: [], terms: [], methods: [], helpers: [] }, ac: { items: [] } };
    const rec = D.record || {};
    const step = !rec.upload ? "upload" : rec.upload.status === "draft" ? "check" : !rec.plan || rec.plan.status === "draft" || rec.plan.status === "returned" ? "plan" : "sent";
    const sent = step === "sent";
    const si = sent ? 3 : ["upload", "check", "plan"].indexOf(step);
    const termObj = D.terms.find(t => t.key === D.term) || {};
    const due = D.due && D.due.term === D.term ? D.due : null;
    const reload = () => this.load("res").then(() => this.refresh(["today"]));
    // Check: the rows read off the report (fetched once per upload).
    const read = s.rsRead && s.rsRead.uploadId === (rec.upload || {}).uploadId ? s.rsRead : null;
    const rows = (s.rsRows || (read ? read.rows : []) || []).map((r, i) => ({ ...r, i }));
    const num = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
    const valid = rows.length > 0 && rows.every(r => r.s.trim() && num(r.score) !== null && num(r.score) >= 0 && num(r.score) <= 100);
    const baseRows = () => (this.state.rsRows || (read ? read.rows : []) || []);
    const upd = (i, p) => set({ rsRows: baseRows().map((r, j) => j === i ? { ...r, ...p } : r) });
    // Plan: the draft (server) or the member's edits on top of it.
    const P = rec.plan;
    const methods = D.methods || [], helpers = D.helpers || [];
    const items = s.rsItems || (P ? P.items : []);
    const updP = (i, p) => set({ rsItems: items.map((x, j) => j === i ? { ...x, ...p } : x) });
    const k = rec.kpis || {};
    const fam = s.rsFam !== undefined ? s.rsFam : !!(P && P.recipients && P.recipients.family);
    const commit = s.rsCommit !== undefined ? s.rsCommit : !!(P && P.committed);
    const body = () => ({ planId: P.planId, items: items.map(x => ({ subject: x.subject, target: x.target, method: x.method, what: x.what, whenWhere: x.whenWhere, sessionsPerWeek: x.sessionsPerWeek, helper: x.helper })),
      habit: s.rsHabit !== undefined ? s.rsHabit : P.habit || "", recipients: { family: fam }, committed: commit });
    const pick = (file, capture) => {
      if (!file) return;
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
      if (!isPdf && !/^image\//.test(file.type || "")) return this.toast("Use a photo (JPG or PNG) or a PDF.");
      if (file.size > D.maxBytes) return this.toast("That file is over 10 MB. Take a photo instead.");
      set({ rsFile: file.name, rsUp: true });
      (isPdf ? NGGApi.uploadFile(file, "results") : NGGApi.uploadOrInline(file, "results")).then(up => {
        if (up.inline) throw Object.assign(new Error("bad_file_url"), { code: "bad_file_url" });
        return NGGApi.member.resultsUpload(D.term, mp9Abs(up.url), isPdf ? "application/pdf" : (/png$/i.test(up.url) ? "image/png" : "image/jpeg"), Math.min(up.bytes || file.size || 1, D.maxBytes));
      }).then(r => { set({ rsUp: false, rsRows: null, rsRead: null }); return reload(); }).catch(e => { set({ rsUp: false }); this.toast(mp9Err(e)); });
    };
    const methodLabel = key => (methods.find(m => m.key === key) || {}).label || key;
    const methodKey = label => (methods.find(m => m.label === label) || {}).key || label;
    const helperLabel = key => (helpers.find(m => m.key === key) || {}).label || key;
    const helperKey = label => (helpers.find(m => m.label === label) || {}).key || label;
    const pp = P || {};
    const tick = this.dd("today") || {};
    return { rs: {
      dueBanner: !sent && !!due, dueT: step === "upload" ? "Upload your " + String(termObj.label || "").toLowerCase() + " results" : "Finish sending your results",
      dueS: due ? (due.overdue ? "Was due " : "Due ") + mp9Date(due.dueOn, { weekday: "long", day: "numeric", month: "long" }) : "",
      sent, notSent: !sent, term: termObj.label || "", termV: termObj.label || "", terms: D.terms.map(t => t.label), onTerm: e => { const t = D.terms.find(x => x.label === e.target.value); if (t) { set({ rsRows: null, rsItems: null, rsRead: null }); NGGApi.member.results(t.key).then(r => this.setState(st => ({ d: { ...st.d, res: r } }))); } },
      headT: sent ? (pp.status === "live" ? "Approved by " + (pp.approvedByName || mf) : "Sent to " + mf + ", your instructor and the NGG team") : step === "upload" ? "Upload your results" : step === "check" ? "Check what we read" : "Your results and plan",
      headS: sent ? (pp.status === "live" ? "Your plan is live. Tick off your promises each week." : mf + " reads it and approves it, or sends it back with a note.") : "Every term, as soon as you get your report card." + (due ? " Due " + mp9Date(due.dueOn, { day: "numeric", month: "long" }) + "." : ""),
      steps: ["Upload", "Check", "Plan", "Send"].map((l, i) => ({ l, bar: i < si || sent ? "#1d6b30" : i === si ? "#0b0b0c" : "#e6e5e0", fw: i === si ? 700 : 500, fg: i <= si ? "#0b0b0c" : "#8a8a90", icon: i < si || sent ? "ph-fill ph-check-circle" : "ph ph-circle" })),
      onUpload: step === "upload", onCheck: step === "check", onPlan: step === "plan",
      reading: !!s.rsUp || !!s.rsReading, file: s.rsFile || "your report", hasFile: !!(rec.upload && rec.upload.fileUrl),
      onFile: e => pick(e.target.files && e.target.files[0]),
      typeIn: () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment"); inp.onchange = () => pick(inp.files && inp.files[0]); inp.click(); },
      checkMeta: read && read.read ? "Read from your upload · fix anything that’s wrong" : rows.length + " subjects · type each score from your report",
      rows: rows.map(r => { const n = num(r.score); const dd = n !== null && r.last !== null && r.last !== undefined ? n - r.last : null;
        return { s: r.s, score: r.score, last: r.last !== null && r.last !== undefined ? r.last : "—", bd: r.low ? "#e0a100" : r.score !== "" && (n === null || n < 0 || n > 100) ? "#b0361c" : "#d6d4cc", d: dd === null ? "" : (dd > 0 ? "+" : "") + dd, dFg: dd > 0 ? "#1d6b30" : dd < 0 ? "#b0361c" : "#6b6b72",
          onS: e => upd(r.i, { s: e.target.value }), onScore: e => upd(r.i, { score: e.target.value.replace(/[^0-9]/g, "").slice(0, 3), low: false }), rm: () => set({ rsRows: baseRows().filter((_, j) => j !== r.i) }) }; }),
      addRow: () => set({ rsRows: baseRows().concat([{ s: "", score: "", last: null }]) }),
      ckOp: valid ? 1 : 0.4, ckHint: !!s.rsTried && !valid,
      toPlan: () => { if (!valid) return set({ rsTried: true });
        NGGApi.member.resultsConfirm(rec.upload.uploadId, rows.map(r => ({ name: r.s.trim(), score: num(r.score) }))).then(() => { set({ rsTried: false, rsRows: null, rsItems: null, rsDraftErr: null }); reload(); }).catch(e => this.toast(mp9Err(e))); },
      back: () => this.toast(step === "plan" ? "Your scores are confirmed. To change one, ask " + mf + " to send the plan back." : "Choose a different file to replace this one."),
      kpis: [["Average", k.avg === null || k.avg === undefined ? "–" : k.avg + "%", k.change === null || k.change === undefined ? "First term on record" : (k.change >= 0 ? "+" : "−") + Math.abs(k.change) + " since last term", k.change < 0 ? "#b0361c" : "#1d6b30"],
        ["Strongest", k.best ? k.best.name : "—", k.best ? k.best.score + "%" : "", "#0b0b0c"], ["Lowest", k.lowest ? k.lowest.name : "—", k.lowest ? k.lowest.score + "%" : "", "#7a5600"],
        ["In the plan", items.length + " of " + D.maxFocus, "subjects to focus on", "#0b0b0c"]].map(([kk, v, ss, fg]) => ({ k: kk, v, s: ss, fg })),
      aiBusy: !!s.rsDrafting, summary: s.rsDraftErr || pp.summary || "",
      flags: (pp.flags || []).map(f => ({ l: f, bg: "#fdf6e3", fg: "#7a5600" })).concat(pp.returnNote ? [{ l: mf + " sent it back: “" + pp.returnNote + "”", bg: "#fdeeea", fg: "#b0361c" }] : []),
      plan: items.map((x, i) => { const why = (methods.find(m => m.key === x.method) || {}).why || "";
        return { s: x.subject, now: x.current === null || x.current === undefined ? "–" : x.current, target: x.target, act: x.what || "", onAct: e => updP(i, { what: e.target.value }),
          when: x.whenWhere || "", onWhen: e => updP(i, { whenWhere: e.target.value }), whenBd: s.rsWhenTried && String(x.whenWhere || "").trim().length < 4 ? "#b0361c" : "#d6d4cc",
          method: methodLabel(x.method), onMethod: e => updP(i, { method: methodKey(e.target.value) }), methodWhy: why,
          sessT: x.sessionsPerWeek + (x.sessionsPerWeek === 1 ? " session" : " sessions"), help: helperLabel(x.helper), onHelp: e => updP(i, { helper: helperKey(e.target.value) }),
          tUp: () => updP(i, { target: Math.min(100, x.target + 1) }), tDn: () => updP(i, { target: Math.max(x.current || 0, x.target - 1) }),
          hUp: () => updP(i, { sessionsPerWeek: Math.min(7, x.sessionsPerWeek + 1) }), hDn: () => updP(i, { sessionsPerWeek: Math.max(1, x.sessionsPerWeek - 1) }) }; }),
      methods: methods.map(m => m.label), helpers: helpers.map(h => h.label),
      habit: s.rsHabit !== undefined ? s.rsHabit : pp.habit || "", onHabit: e => set({ rsHabit: e.target.value }),
      to: [["mentor", mf + " · mentor", "Reads it and approves it with you", true], ["instr", "Your instructor", "Sees subjects linked to their class", true], ["admin", "NGG team", "Keeps it on your record", true], ["family", "Your family", "A copy once it’s approved", false]]
        .map(([kk, l, ss, lock]) => { const on = lock || fam; return { l, s: ss, lock, lockA: lock ? "true" : "false", on: on ? "true" : "false", icon: on ? "ph-fill ph-check-square" : "ph ph-square", ic: on ? "#0b0b0c" : "#9a9aa0", cur: lock ? "default" : "pointer", go: () => { if (!lock) set({ rsFam: !fam }); } }; }),
      commitA: commit ? "true" : "false", track: commit ? "#0b0b0c" : "#d6d4cc", knob: commit ? "24px" : "4px", commitBd: commit ? "#0b0b0c" : "#e8e5dd", commitBg: commit ? "#fafaf8" : "#fff", toggleCommit: () => set({ rsCommit: !commit }),
      sendOp: commit && items.length ? 1 : 0.4, sendHint: !!s.rsSendTried && !commit,
      send: () => {
        if (!P) return;
        const noWhen = items.filter(x => String(x.whenWhere || "").trim().length < 4), noWhat = items.filter(x => !String(x.what || "").trim());
        if (noWhen.length) { set({ rsSendTried: true, rsWhenTried: true }); return this.toast("Add when and where for " + noWhen.map(x => x.subject).join(" and ") + "."); }
        if (noWhat.length) return this.toast("Say what you’ll do for " + noWhat.map(x => x.subject).join(" and ") + ".");
        if (!commit) return set({ rsSendTried: true });
        NGGApi.member.resultsSend(body()).then(r => { set({ rsSendTried: false, rsWhenTried: false, rsItems: null, rsHabit: undefined, rsCommit: undefined, rsFam: undefined }); reload();
          const m = this.rootRef.current && this.rootRef.current.querySelector("main"); if (m) m.scrollTop = 0;
          this.toast(r && r.mentor ? "Sent to " + mp9First(r.mentor) + " for approval." : "Sent. Your mentor will see it when one is assigned."); }).catch(e => this.toast(mp9Err(e)));
      },
      reminders: (pp.items || []).map(x => ({ icon: "ph ph-bell-ringing", t: x.subject + " · " + (x.methodLabel || methodLabel(x.method)), s: (x.whenWhere || "No time set yet") + " · " + x.sessionsPerWeek + (x.sessionsPerWeek === 1 ? " session" : " sessions") + " a week" }))
        .concat([{ icon: "ph ph-calendar-check", t: "Weekly check-in", s: "Sunday evening · tick what you did" }]).concat(fam ? [{ icon: "ph ph-users", t: "Family update", s: "With the weekly family mail, once approved" }] : []),
      audit: (D.history || []).slice(0, 12).map(h => ({ when: mp9Date(h.at) + " " + String(h.at).slice(11, 16), who: h.who, what: h.what })),
      timeline: [["ph-fill ph-check-circle", "#1d6b30", "Results and plan sent", pp.sentAt ? mp9Date(pp.sentAt, { weekday: "short", day: "numeric", month: "short" }) : ""],
        [pp.status === "live" ? "ph-fill ph-check-circle" : "ph ph-eye", pp.status === "live" ? "#1d6b30" : "#9a9aa0", pp.status === "live" ? "Approved by " + (pp.approvedByName || mf) : mf + " reads it", pp.status === "live" ? mp9Date(pp.approvedAt) : "Usually within 2 days. You’ll get a notification."],
        [pp.recipients && pp.recipients.family ? (pp.familySentAt ? "ph-fill ph-check-circle" : "ph ph-house-line") : "ph ph-minus-circle", pp.familySentAt ? "#1d6b30" : "#9a9aa0", "Family", !(pp.recipients && pp.recipients.family) ? "You chose not to share it" : pp.familySentAt ? "Shared " + mp9Date(pp.familySentAt) : "Shared once it’s approved"]]
        .map(([icon, fg, t, ss], i) => ({ icon, fg, t, s: ss, tfg: i === 0 ? "#0b0b0c" : "#4a4a50" })),
      hist: (D.past || []).filter(x => x.term !== D.term).map(x => ({ t: x.label, avg: x.avg === null ? "–" : x.avg + "%", s: x.planStatus === "live" ? "Plan live" : x.status === "sent" ? "Sent" : "Not finished" })),
    },
    ac: { items: (pp.items || []).map(it => { const r = (s.acR || {})[it.itemId];
      return { t: it.subject + ": " + it.sessionsPerWeek + (it.sessionsPerWeek === 1 ? " session" : " sessions"), prog: it.doneThisWeek + " of " + it.sessionsPerWeek + " done this week",
        days: [], res: [["done", "Kept it", "#1d6b30", "#e9f6ec"], ["partly", "Partly", "#7a5600", "#fdf6e3"], ["missed", "Missed", "#b0361c", "#fdeeea"]].map(([kk, l, fg, bg]) => ({ l, on: r === kk ? "true" : "false", ring: r === kk ? fg : "#d6d4cc", bg: r === kk ? bg : "#fff", fg: r === kk ? fg : "#0b0b0c", go: () => set({ acR: { ...(this.state.acR || {}), [it.itemId]: kk } }) })),
        askWhy: r === "missed" || r === "partly", why: (s.acW || {})[it.itemId] || "", onWhy: e => set({ acW: { ...(this.state.acW || {}), [it.itemId]: e.target.value } }) }; }),
      meta: "Week of " + mp9Date(pp.weekStart, { day: "numeric", month: "long" }), kept: pp.adherence !== null && pp.adherence !== undefined ? "Sessions kept over the last weeks: " + pp.adherence + "%" : "Your first week on the plan",
      op: (pp.items || []).every(it => (s.acR || {})[it.itemId]) ? 1 : 0.4, submitL: s.acSent ? "Checked in · see you next Friday" : "Send my check-in",
      submit: () => { const its = pp.items || []; if (!its.every(it => (s.acR || {})[it.itemId])) return this.toast("Answer each promise first."); if (s.acSent) return;
        const lines = its.map(it => it.subject + ": " + ({ done: "kept it", partly: "partly", missed: "missed" })[(s.acR || {})[it.itemId]] + (((s.acW || {})[it.itemId] || "").trim() ? " (" + s.acW[it.itemId].trim() + ")" : ""));
        this.journalSave({ title: "Friday check-in · my plan", body: lines.join("\n"), visibility: "mentor", tags: "plan checkin" }).then(r => { if (!r) return; set({ acSent: true }); const missed = its.filter(it => (s.acR || {})[it.itemId] === "missed").length;
          this.toast(missed ? "Checked in. " + mf + " sees what got in the way and will help you plan next week." : "Checked in. Well kept."); }); } },
    };
  },

  /** The results flow's reads that follow from where the member is: read the
      report once it is uploaded, draft the plan once the scores are confirmed.
      Run after a render, never during one. */
  rsEffects() {
    const s = this.state, D = this.dd("res"); if (s.scr !== "results" || !D) return;
    const rec = D.record || {}, up = rec.upload;
    if (up && up.status === "draft" && !(s.rsRead && s.rsRead.uploadId === up.uploadId) && !s.rsReading) {
      this.setState({ rsReading: true });
      NGGApi.member.resultsRead(up.uploadId).then(r => this.setState({ rsReading: false, rsRead: { uploadId: up.uploadId, read: !!r.read, rows: (r.subjects || []).map(x => ({ s: x.name, score: x.score === null ? "" : String(x.score), last: x.last, low: x.low })) } }))
        .catch(() => this.setState({ rsReading: false, rsRead: { uploadId: up.uploadId, read: false, rows: [] } }));
    }
    if (up && up.status !== "draft" && !rec.plan && !s.rsDrafting && !s.rsDraftErr) {
      this.setState({ rsDrafting: true });
      NGGApi.member.resultsDraft(up.uploadId).then(() => { this.setState({ rsDrafting: false }); this.load("res"); }).catch(e => this.setState({ rsDrafting: false, rsDraftErr: mp9Err(e) }));
    }
  },

  /* ── Opportunities, help ─────────────────────────────────────────────── */
  oppsVals() {
    const mf = this.mentorInfo().first;
    const items = this.oppItems();
    return { opps: items.length ? items.map(o => ({ ...o, on: o.saved ? "true" : "false", icon: o.saved ? "ph-fill ph-bookmark-simple" : "ph ph-bookmark-simple", label: o.saved ? "Saved" : "Save",
      ask: () => { if (!this.mentorInfo().has) return this.toast("You don’t have a mentor yet."); NGGApi.member.chatSend("Can we talk about “" + o.t + "” (" + o.org + ")? It " + o.close.toLowerCase() + ".").then(() => { this.refresh(["chat"]); this.toast("Sent to " + mf + ". See it in My mentor."); }).catch(e => this.toast(mp9Err(e))); },
      save: () => { this.setState({ oppSaved: { ...(this.state.oppSaved || {}), [o.id]: !o.saved } }); NGGApi.member.oppsSave(o.id).catch(e => { this.setState({ oppSaved: { ...(this.state.oppSaved || {}), [o.id]: o.saved } }); this.toast(mp9Err(e)); }); } }))
      : [{ t: "Nothing open right now", org: "NGG", type: "Opportunities", close: "check back soon", why: "Staff add bootcamps, competitions and volunteering here. They’re matched to your age.", on: "false", icon: "ph ph-bookmark-simple", label: "Save", ask: () => this.toast("Nothing to ask about yet."), save: () => this.toast("Nothing to save yet.") }] };
  },
  helpVals() {
    const s = this.state;
    const CATS = [["I feel unsafe", "Something a young person told me"], ["Someone is bullying me", "Bullying"], ["Something about my mentor", "Conduct of an adult"], ["Something at home", "Signs of harm or neglect"], ["I’m feeling low", "Emotional wellbeing"], ["Something online", "Online safety"], ["Something else", "Something else"]];
    return {
      sg: this.sgInfo(),
      cats: CATS.map(([c]) => ({ c, on: s.cat === c ? "true" : "false", ring: s.cat === c ? "#0b0b0c" : "#d6d4cc", bw: s.cat === c ? "2px" : "1px", pick: () => this.setState({ cat: c }) })),
      hasCat: !!s.cat && !s.concernSent, concernSent: s.concernSent, concernAsk: !s.concernSent, catText: s.cat || "", cText: s.cText, onCText: e => this.setState({ cText: e.target.value }), cRef: s.cRef,
      sendConcern: () => { const body = s.cText.trim(); if (body.length < 10) return this.toast("Say a little more first, even one sentence.");
        NGGApi.member.pod.act("concernSelf", { category: (CATS.find(c => c[0] === s.cat) || [0, "Something else"])[1], body: s.cat + ": " + body })
          .then(r => this.setState({ concernSent: true, cText: "", cRef: (r && (r.caseNo || r.ref)) || "sent" })).catch(e => this.toast(mp9Err(e))); },
      resetConcern: () => this.setState({ concernSent: false, cat: null, cRef: "" }),
    };
  },

  /* ── The sheets ──────────────────────────────────────────────────────── */
  sheetVals(go) {
    const s = this.state, set = o => this.setState(o), sh = s.sheet || {}, d = this.dd("dash") || {}, mf = this.mentorInfo().first, me = this.me();
    const txt = s.sText.trim();
    const chips = list => list.map(t => ({ t, on: s.sPick === t ? "true" : "false", ring: s.sPick === t ? "#0b0b0c" : "#d6d4cc", bw: s.sPick === t ? "2px" : "1px", pick: () => set({ sPick: t }) }));
    const A = sh.k === "assign" ? (d.assignments || []).find(a => a.assignmentId === sh.id) : null;
    // Done means it cannot be handed in (again): marked, closed. Returned work, and work not yet marked, can be.
    const aDone = !!(A && !A.canSubmit);
    const L = sh.k === "lesson" ? s.lesson : null, U = L && L.unit;
    const parts = U ? ["Read the lesson"].concat((U.materials || []).length ? ["Open the materials"] : []).concat((U.checks || []).length ? ["Check your understanding"] : []) : [];
    const prog = L && L.progress;
    const lDone = !!(prog && prog.status === "completed");
    const lPart = lDone ? parts.length : Math.min(s.lPart || 0, parts.length);
    const checkAt = parts.indexOf("Check your understanding");
    const P = this.st("mp9.project", null);
    const titles = { lesson: U ? U.title : s.lessonErr ? "Lesson" : "Loading the lesson…", assign: A ? A.title : "Assignment", idea: "Share an idea", request: "New request to the desk", change: "Ask for a change", gate: "Gate pass",
      team: P ? "Update for your team" : "Start a team project", portfolio: "Add to my portfolio", profile: "Edit profile", proof: "Add proof" };
    const proofText = s.sPick === "text", proofLink = s.sPick === "link";
    const sendable = !s.sBusy && { proof: !!s.sPick && (proofText ? txt.length > 5 : proofLink ? /^https?:\/\//i.test(txt) : !!s.sFile), idea: !!s.sPick && txt.length > 3, request: !!s.sPick, change: !!s.sPick,
      team: txt.length > 3, portfolio: !!s.sPick && txt.length > 1, assign: A && A.proof === "file" ? !!s.sFile : A && A.proof === "text" ? txt.length > 10 : txt.length > 10 || !!s.sFile }[sh.k];
    const busy = p => { set({ sBusy: true }); return p.then(r => { set({ sBusy: false }); return r; }, e => { set({ sBusy: false }); this.toast(mp9Err(e)); return null; }); };
    const send = () => {
      if (!sendable) return;
      if (sh.k === "proof") busy(NGGApi.member.submitMission({ missionId: sh.id, proofUrl: proofLink ? txt : s.sFile ? s.sFile.url : "", note: proofText ? txt : (txt + (Object.keys(s.pTags || {}).filter(k => s.pTags[k]).length ? " · " + Object.keys(s.pTags).filter(k => s.pTags[k]).join(", ") : "")).trim() }))
        .then(r => { if (!r) return; set({ sheet: null, mState: { ...(this.state.mState || {}), [sh.id]: "submitted" } }); this.refresh(["dash"]); this.toast("Sent to " + mf + " for review"); });
      if (sh.k === "idea") {
        const msg = "Idea (" + s.sPick + "): " + txt;
        busy(s.sAnon ? NGGApi.public.contact({ name: "A member (sent without a name)", email: "", topic: "Member idea", message: msg }) : NGGApi.member.raiseRequest({ kind: "help", subject: "An idea for NGG · " + s.sPick, body: txt }))
          .then(r => { if (!r) return; this.closeSheet(); this.toast(s.sAnon ? "Sent without your name. Thank you." : "Sent to the NGG team. Thank you."); if (!s.sAnon) this.refresh(["reqs"]); });
      }
      if (sh.k === "request") {
        const KIND = { "Change my ID card photo": "idcard", "Correct my details": "details", "Ask about a fine": "appeal", "Ask about dues": "help", "Something else": "help" };
        busy(NGGApi.member.raiseRequest({ kind: KIND[s.sPick] || "help", subject: s.sPick, body: txt })).then(r => { if (!r) return; this.closeSheet(); this.refresh(["reqs"]); this.toast("Request sent to the desk"); });
      }
      if (sh.k === "change") {
        const unsafe = s.sPick === "I feel uncomfortable with my mentor";
        busy(unsafe ? NGGApi.member.pod.act("concernSelf", { category: "Conduct of an adult", body: "About my mentor. " + (txt || "I feel uncomfortable with my mentor.") }) : NGGApi.member.raiseRequest({ kind: "mentor", subject: "Change of mentor · " + s.sPick, body: txt }))
          .then(r => { if (!r) return; this.closeSheet(); this.toast(unsafe ? "Sent privately to " + this.sgInfo().name + ". They’ll talk to you today." : "Sent to your coordinator. " + mf + " won’t see this."); });
      }
      if (sh.k === "team") {
        const now = new Date().toISOString();
        const next = P ? { ...P, posts: [{ t: txt + (s.sFile ? " (photo)" : ""), at: now, url: s.sFile ? s.sFile.url : "" }].concat(P.posts || []).slice(0, 30) } : { t: txt, team: me.centre + " pod", at: 0, posts: [] };
        busy(Promise.all([this.saveSt("mp9.project", next), P ? this.journalSave({ title: "Team project · " + P.t, body: txt, visibility: "mentor", tags: "project", media: s.sFile ? [{ type: "image", url: s.sFile.url, alt: "Team project photo" }] : [] }) : Promise.resolve({})]))
          .then(r => { if (!r) return; this.closeSheet(); this.toast(P ? "Posted. " + mf + " can see it." : "Project started. Mark each step as your team finishes it."); });
      }
      if (sh.k === "portfolio") {
        const PF = this.st("mp9.portfolio", []);
        busy(this.saveSt("mp9.portfolio", [{ t: txt, k: s.sPick, url: s.sFile ? s.sFile.url : "", at: new Date().toISOString() }].concat(PF).slice(0, 60))).then(() => { this.closeSheet(); this.toast("Added to your portfolio"); });
      }
      if (sh.k === "assign") busy(NGGApi.member.submitAssignment({ assignmentId: sh.id, text: txt, fileUrl: s.sFile ? s.sFile.url : "" }))
        .then(r => { if (!r) return; this.closeSheet(); this.refresh(["dash", "today"]); this.toast(r.late ? "Handed in — after the due date, so it is marked as late." : "Handed in. Your instructor will mark it this week."); });
    };
    const upload = (file, kind) => { set({ sBusy: true }); (/^image\//.test(file.type || "") ? NGGApi.uploadOrInline(file, kind) : NGGApi.uploadFile(file, kind))
      .then(u => set({ sBusy: false, sFile: { name: file.name, url: mp9Abs(u.url) } })).catch(e => { set({ sBusy: false }); this.toast(mp9Err(e)); }); };
    const acct = d.member || {};
    const lcQs = U ? (U.checks || []).map(q => { const res = s.lqRes && (s.lqRes.marks || {})[q.checkId];
      const opts = q.options || [];
      return { q: q.prompt, why: res ? (res.correct ? "Correct" : res.feedback || "Not quite.") : "", hasWhy: !!res, wFg: res && res.correct ? "#1d6b30" : "#b0361c",
        isText: !opts.length, text: (s.lqText || {})[q.checkId] || "", onText: e => set({ lqText: { ...(this.state.lqText || {}), [q.checkId]: e.target.value } }),
        opts: opts.map((o, oi) => { const on = s.lq[q.checkId] === oi; return { o, on: on ? "true" : "false", ring: on ? "#0b0b0c" : "#d6d4cc", bw: on ? "2px" : "1px", pick: () => { if (!s.lqRes) set({ lq: { ...this.state.lq, [q.checkId]: oi } }); } }; }) }; }) : [];
    const allAns = U && (U.checks || []).every(q => (q.options || []).length ? s.lq[q.checkId] !== undefined : ((s.lqText || {})[q.checkId] || "").trim().length > 0);
    const res = s.lqRes;
    const qr = sh.k === "gate" ? this.gateQr() : "";
    return {
      sheetOn: !!s.sheet, closeSheet: () => this.closeSheet(), sheetTitle: titles[sh.k] || "", sendSheet: send, cantSend: !sendable, sendOp: sendable ? 1 : 0.4,
      shLesson: sh.k === "lesson", shAssign: sh.k === "assign", shIdea: sh.k === "idea", shRequest: sh.k === "request", shChange: sh.k === "change", shGate: sh.k === "gate", shTeam: sh.k === "team", shPortfolio: sh.k === "portfolio", shProfile: sh.k === "profile", shProof: sh.k === "proof",
      openGate: () => this.openSheet({ k: "gate" }), openRequest: () => this.openSheet({ k: "request" }), openIdea: () => this.openSheet({ k: "idea" }), openTeam: () => this.openSheet({ k: "team" }), openPortfolio: () => this.openSheet({ k: "portfolio" }), openChange: () => this.openSheet({ k: "change" }),
      proofMission: sh.k === "proof" ? sh.t || "" : "",
      proofTypes: [["photo", "Upload a photo", "ph ph-camera"], ["audio", "Upload an audio clip", "ph ph-microphone"], ["video", "Upload a video", "ph ph-video-camera"], ["file", "Upload a file", "ph ph-file"], ["link", "Paste a link", "ph ph-link"], ["text", "Describe what you did", "ph ph-pencil-simple-line"]]
        .map(([id, t, icon]) => ({ t, icon, on: s.sPick === id ? "true" : "false", ring: s.sPick === id ? "#0b0b0c" : "#d6d4cc", bw: s.sPick === id ? "2px" : "1px", pick: () => set({ sPick: id, sFile: null, sText: "" }) })),
      proofIsText: proofText, proofIsLink: proofLink, proofIsFile: !!s.sPick && !proofText && !proofLink,
      proofAccept: { photo: "image/*", audio: "audio/*", video: "video/*", file: "image/*,.pdf,.doc,.docx" }[s.sPick] || "*/*",
      proofTags: ["Make", "Read", "Speak", "Move"].map(t => ({ t, on: (s.pTags || {})[t] ? "true" : "false", bg: (s.pTags || {})[t] ? "#0b0b0c" : "#fff", fg: (s.pTags || {})[t] ? "#fff" : "#0b0b0c", pick: () => set({ pTags: { ...(this.state.pTags || {}), [t]: !(this.state.pTags || {})[t] } }) })),
      sFileL: s.sBusy ? "Uploading…" : s.sFile ? s.sFile.name + " · attached" : sh.k === "team" ? "Add a photo" : sh.k === "assign" ? "Attach a file or photo" : sh.k === "proof" ? "Choose from your phone" : "Choose a file",
      onSFile: e => { const f = e.target.files && e.target.files[0]; if (f) upload(f, sh.k === "assign" ? "assignment" : sh.k === "proof" ? "proof" : "post"); },
      acct: { email: acct.email || "", hasPassword: acct.hasPassword, bio: acct.bio || "" }, pf: s.pf, pfErr: s.pfErr, hasPfErr: !!s.pfErr,
      pfPw1: e => set({ pf: { ...this.state.pf, pw1: e.target.value }, pfErr: "" }), pfPw2: e => set({ pf: { ...this.state.pf, pw2: e.target.value }, pfErr: "" }),
      savePw: () => { const a = s.pf.pw1 || "", b = s.pf.pw2 || ""; if (a.length < 8) return set({ pfErr: "Password must be at least 8 characters" }); if (a !== b) return set({ pfErr: "Passwords don't match" });
        NGGApi.auth.setPassword(a, "").then(() => { set({ pf: { ...this.state.pf, pw1: "", pw2: "" } }); this.toast("Password changed"); }).catch(e => set({ pfErr: mp9Err(e) })); },
      changeEmail: () => { const v = window.prompt ? window.prompt("Your new email address") : ""; if (!v) return; NGGApi.member.changeEmail(v.trim()).then(() => this.toast("Check " + v.trim() + " for a link to confirm it.")).catch(e => this.toast(mp9Err(e))); },
      exportData: () => NGGApi.member.exportData().then(r => { const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-ngg-data.json"; a.click(); this.toast("Your data is downloading."); }).catch(e => this.toast(mp9Err(e))),
      delAsk: s.delStep === 0, delConfirm: s.delStep === 1, startDel: () => set({ delStep: 1 }), cancelDel: () => set({ delStep: 0 }),
      doDel: () => NGGApi.member.deleteAccount().then(() => { set({ delStep: 0, sheet: null }); this.toast("Request sent. Your centre lead will call your guardian before anything is deleted."); }).catch(e => this.toast(mp9Err(e))),
      onBio: e => set({ pf: { ...this.state.pf, bio: e.target.value } }), bioV: s.pf.bio !== undefined ? s.pf.bio : acct.bio || "",
      saveProfile: () => NGGApi.member.updateProfile({ bio: s.pf.bio !== undefined ? s.pf.bio : acct.bio || "" }).then(() => { this.closeSheet(); this.refresh(["dash"]); this.toast("Profile saved"); }).catch(e => this.toast(mp9Err(e))),
      photoL: s.sBusy ? "Uploading…" : "Change photo",
      onPhoto: e => { const f = e.target.files && e.target.files[0]; if (!f) return; set({ sBusy: true }); NGGApi.uploadOrInline(f, "headshot").then(u => NGGApi.member.updateProfile({ photoUrl: u.url })).then(() => { set({ sBusy: false }); this.refresh(["dash"]); this.toast("Photo changed"); }).catch(er => { set({ sBusy: false }); this.toast(mp9Err(er)); }); },
      shForm: ["proof", "assign", "idea", "request", "change", "team", "portfolio"].includes(sh.k) && !(sh.k === "assign" && aDone),
      sText: s.sText, onSText: e => set({ sText: e.target.value }), sAnon: s.sAnon ? "true" : "false", toggleAnon: () => set({ sAnon: !s.sAnon }), anonIcon: s.sAnon ? "ph-fill ph-check-square" : "ph ph-square",
      sLesson: U ? { div: U.course + " · week " + U.week + (U.durationMins ? " · about " + U.durationMins + " min" : ""),
        parts: parts.map((p, pi) => ({ p, n: pi + 1, done: pi < lPart, now: pi === lPart, icon: pi < lPart ? "ph-fill ph-check-circle" : pi === lPart ? "ph-fill ph-circle-half" : "ph ph-circle", ic: pi < lPart ? "#1d6b30" : pi === lPart ? "#a07400" : "#c9c6bc", fw: pi === lPart ? 600 : 400 })),
        finished: lPart >= parts.length, notFinished: lPart < parts.length && lPart !== checkAt, nowPart: (parts[lPart] || "").toLowerCase(),
        body: String(U.body || U.summary || "This lesson has no written part. Open its materials.").replace(/[#*_>`]/g, "").slice(0, 1800),
        mats: (U.materials || []).map(m => ({ t: m.title || m.kind, url: m.url, icon: m.kind === "video" ? "ph ph-video" : m.kind === "pdf" ? "ph ph-file-pdf" : "ph ph-link" })) }
        : { div: s.lessonErr || "", parts: [], finished: false, notFinished: false, nowPart: "", body: s.lessonErr || "Loading…", mats: [] },
      lLearn: U ? (U.objectives || []).slice(0, 5) : [],
      lcShow: !!U && checkAt >= 0 && lPart >= checkAt && !lDone, lcDone: lDone, lcPass: U ? U.passMark || 0 : 0, lcScore: res ? (res.pct !== undefined ? res.pct : res.bestPct || 0) + "%" : "",
      lcPassed: !!res && !!res.passed, lcFailed: !!res && !res.passed && !res.pending, lcChecked: !!res, lcCanCheck: !res && !!allAns, lcQs,
      lcCheck: () => { const answers = {}; (U.checks || []).forEach(q => { answers[q.checkId] = (q.options || []).length ? s.lq[q.checkId] : ((s.lqText || {})[q.checkId] || ""); });
        set({ sBusy: true }); NGGApi.member.curriculumSubmit(U.unitId, answers).then(r => set({ sBusy: false, lqRes: { pct: r.pct !== undefined ? r.pct : r.progress && r.progress.bestPct, passed: !!(r.passed || (r.progress && r.progress.status === "completed")), pending: !!(r.pending || (r.progress && r.progress.pending)), marks: r.marks || (r.progress && r.progress.marks) || {} } }))
          .catch(e => { set({ sBusy: false }); this.toast(mp9Err(e)); }); },
      lcRetry: () => set({ lq: {}, lqText: {}, lqRes: null }),
      lcFinish: () => { this.refresh(["cur", "today"]); this.closeSheet(); this.toast("Lesson complete · " + (res ? res.pct : "") + "%"); },
      doPart: () => { const n = lPart + 1; set({ lPart: n }); if (n === checkAt) this.toast("Now check your understanding"); },
      sAssign: A ? { div: (A.track || me.track || "Club") + (A.points ? " · " + A.points + " points" : ""), due: A.dueAt ? mp9Date(A.dueAt, { weekday: "short", day: "numeric", month: "short" }) : "no date", s: mp9AsgState(A),
        brief: A.instructions || A.brief || "", tips: mp9AsgTips(A), hasTips: mp9AsgTips(A).length > 0, done: aDone, open: !aDone } : {},
      ideaChips: chips(["An activity idea", "Something NGG should change", "Something I love", "Something that makes me uncomfortable"]),
      reqChips: chips(["Change my ID card photo", "Correct my details", "Ask about a fine", "Ask about dues", "Something else"]),
      changeChips: chips(["We don't really get on", "I want help with different things", "Meeting times don't work for me", "I feel uncomfortable with my mentor", "Something else"]),
      pfChips: chips(["Project", "Design", "Video", "Writing", "Certificate"]),
      changeSafe: s.sPick === "I feel uncomfortable with my mentor",
      gateQr: qr || "", gateNoQr: !qr, gateQrL: me.memberId ? "Making your code…" : "No member number yet",
      ...((this.state.w || 1200) < 760 ? { shTop: "auto", shBot: "0", shTf: "translateX(-50%)", shR: "22px 22px 0 0", shW: "100%", shMax: "88%" } : { shTop: "50%", shBot: "auto", shTf: "translate(-50%,-50%)", shR: "20px", shW: "min(540px, calc(100% - 32px))", shMax: "86%" }),
    };
  },
  gateQr() {
    if (this._qr && this._qrFor === this.me().memberId) return this._qr;
    const m = (this.dd("dash") || {}).member; if (!m || !window._ngMemberQrPayload || !window._ngQrDataUrl || this._qrBusy) return "";
    this._qrBusy = true;
    window._ngQrDataUrl(window._ngMemberQrPayload(m)).then(u => { this._qr = u || ""; this._qrFor = m.memberId; this._qrBusy = false; this.forceUpdate(); }).catch(() => { this._qrBusy = false; });
    return "";
  },

  /* ── Navigation, palette, notifications ─────────────────────────────── */
  navVals() {
    const s = this.state, cur = s.scr, older = this.older(), t = this.dd("today") || {}, b = t.badges || {}, c = this.dd("chat") || {};
    const unreadChat = (c.messages || []).filter(m => !m.mine && !m.read).length || b["mentor/chat"] || 0;
    const resDue = b["grow/results"] ? "1" : "", owed = b["account/money"] ? mp9Naira(b["account/money"]) : "", learnN = b["learn/lessons"] ? String(b["learn/lessons"]) : "";
    const BADGE = { mentor: unreadChat ? String(unreadChat) : "", results: resDue, learn: learnN, money: owed };
    const bdg = id => BADGE[id] || "";
    const simple = this.simple();
    const areas = (simple ? mp9SimpleAreas(older) : [["Today", "ph ph-sun-horizon", [["today", "Today"]]], ["Mentor", "ph ph-handshake", [["mentor", "My mentor"], ["companion", "Companion"], ["community", "Community"]]],
      ["Grow", "ph ph-plant", [["growth", "Scorecard & goals"], ["results", "School results"], ["passport", "Passport"], ["journal", "Anchor Journal"]]],
      ["Learn", "ph ph-book-open-text", [["learn", "Lessons"], ["sat", "Saturday"], ["timetable", "Timetable"], ["tools", "Study tools"]].concat(older ? [["opps", "Opportunities"]] : [])],
      ["Account", "ph ph-user-circle", [["me", "Profile"], ["money", "Money"], ["records", "Records"], ["help", "Help"]]]])
      .map(([label, icon, kids]) => { const bb = kids.map(([id]) => bdg(id)).filter(Boolean); return { label, icon, kids, ids: kids.map(k => k[0]), badge: bb.length === 1 ? bb[0] : bb.length ? String(bb.length) : "" }; });
    const area = areas.find(a => a.ids.includes(cur)) || areas[0];
    const navGroups = [{ h: "", hasH: false, items: areas.map(a => { const on = a === area; return { label: a.label, icon: on ? a.icon.replace("ph ", "ph-fill ") : a.icon, cur: on ? "page" : undefined, bg: on ? "#fff" : "transparent", sh: on ? "0 0 0 1px #e8e5dd, 0 1px 2px rgba(11,11,12,.06)" : "none", fw: on ? 600 : 500, badge: a.badge, hasBadge: !!a.badge, go: () => this.go(a.ids[0]) }; }) }];
    const areaTabs = area.kids.map(([id, l]) => { const on = cur === id; const bb = bdg(id); return { l, on: on ? "true" : "false", fg: on ? "#0b0b0c" : "#5a5a60", fw: on ? 600 : 500, bar: on ? "#0b0b0c" : "transparent", badge: bb, hasBadge: !!bb, go: () => this.go(id) }; });
    const tabbar = areas.map(a => { const on = a === area; return { label: a.label, icon: on ? a.icon.replace("ph ", "ph-fill ") : a.icon, cur: on ? "page" : undefined, fw: on ? 600 : 500, fg: on ? "#0b0b0c" : "#626a6e", go: () => this.go(a.ids[0]), hasBadge: !!a.badge }; });
    const subs = { sat: "This week's plan and mission", journal: "Opens in its own app", tools: "Flashcards, focus timer, typing, maths · its own app", growth: "Courage, scores and goals", results: "Upload every term · plan · promises", passport: "Achievements and portfolio", learn: "Lessons and assignments", timetable: "Your week at the centre", companion: "How your week went", opps: "Matched to you", community: "Feed and team projects", me: "Card, profile and devices", money: "Dues, fines and payments", records: "Attendance and requests", help: "You can always talk to us" };
    if (simple) Object.assign(subs, MP9_SIMPLE_SUBS);
    const flat = [].concat(...areas.map(a => a.kids.map(([id, l]) => ({ id, label: l, icon: a.icon }))));
    const moreGroups = areas.slice(1).map(a => ({ h: a.label, items: a.kids.map(([id, label]) => ({ label, icon: a.icon, badge: bdg(id), hasBadge: !!bdg(id), d: subs[id] || "", go: () => this.go(id) })) }));
    const actions = [["Write in my journal", "ph ph-pencil-simple-line", () => { location.href = "/journal/"; }], ["Upload my school results", "ph ph-exam", () => this.go("results")], ["Add proof for a mission", "ph ph-camera", () => this.go("sat")],
      ["Message my mentor", "ph ph-chat-circle-text", () => this.go("mentor")], ["Show my gate pass", "ph ph-qr-code", () => this.openSheet({ k: "gate" })], ["I've made a payment", "ph ph-currency-ngn", () => this.go("records", { rKind: "I've made a payment", rF: {} })],
      ["Ask for a change of mentor", "ph ph-arrows-left-right", () => this.openSheet({ k: "change" })], ["Edit my profile", "ph ph-user", () => this.openSheet({ k: "profile" })], ["Take the tour again", "ph ph-compass", () => window.nggGuide("member")], ["Two-step sign-in", "ph ph-shield-check", () => window.nggMfa && window.nggMfa("manage")], ["Tell us about something", "ph ph-lifebuoy", () => this.go("help")],
      simple ? ["Switch to the full view", "ph ph-squares-four", () => this.setView("full")] : ["Switch to the simple view", "ph ph-hand-pointing", () => this.setView("simple")]]
      .filter(a => !(simple && /payment/.test(a[0])));
    const q = s.palQ.trim().toLowerCase();
    const items = flat.map(x => ({ t: x.label, k: "Go to", icon: x.icon, run: () => this.go(x.id) })).concat(actions.map(([t2, icon, run]) => ({ t: t2, k: "Do", icon, run }))).filter(x => !q || x.t.toLowerCase().includes(q));
    const pi = Math.min(s.palI, Math.max(0, items.length - 1));
    return {
      navGroups, tabbar, moreGroups, areaTabs, hasAreaTabs: area.kids.length > 1, areaLabel: area.label, title: cur === "today" ? (this.state.w >= 760 ? "Good " + mp9Greeting() + ", " + this.me().first : "Today") : area.label,
      subtitle: cur === "today" ? (this.me().week ? "Week " + this.me().week + " of " + this.me().weeks + " · " + this.me().stage : this.me().stage) : subs[cur] || "",
      showBack: this.state.w < 760 && cur !== "today" && s.hist.length > 0, goToday: () => this.goBack(),
      openPal: () => this.setState({ pal: true, palQ: "", palI: 0 }), closePal: () => this.setState({ pal: false }), palOn: s.pal, palQ: s.palQ, onPalQ: e => this.setState({ palQ: e.target.value, palI: 0 }),
      palItems: items.map((x, i) => ({ ...x, on: i === pi ? "true" : "false", bg: i === pi ? "#f4f4f2" : "#fff", run: () => { this.setState({ pal: false, palQ: "" }); x.run(); } })), palEmpty: items.length === 0,
      palKey: e => { if (e.key === "ArrowDown") { e.preventDefault(); this.setState({ palI: Math.min(pi + 1, items.length - 1) }); } if (e.key === "ArrowUp") { e.preventDefault(); this.setState({ palI: Math.max(pi - 1, 0) }); } if (e.key === "Enter" && items[pi]) { e.preventDefault(); this.setState({ pal: false, palQ: "" }); items[pi].run(); } },
      palRef: this.palRef,
    };
  },
  notifVals() {
    const s = this.state, n = (this.dd("notifs") || {}).notifications || [];
    const PAGE = { mentor: "mentor", journal: "journal", community: "community", results: "results", dashboard: "today", learn: "learn", curriculum: "learn", money: "money", account: "money", records: "records", events: "learn", timetable: "timetable" };
    const unreadL = n.filter(x => !x.readAt && !(s.readIds || {})[x.notifId]);
    const shown = s.nUnread ? unreadL : n;
    const markOne = id => { this.setState({ readIds: { ...(this.state.readIds || {}), [id]: true } }); NGGApi.member.markRead(id).catch(() => {}); };
    return {
      notifOpen: !!s.notif, toggleNotif: () => this.setState({ notif: !s.notif }), closeNotif: () => this.setState({ notif: false }),
      nFilters: [["Everything", false], ["Unread only", true]].map(([l, v]) => ({ l, on: s.nUnread === v ? "true" : "false", bg: s.nUnread === v ? "#fff" : "transparent", sh: s.nUnread === v ? "0 1px 2px rgba(11,11,12,.1)" : "none", pick: () => this.setState({ nUnread: v }) })),
      nEmpty: shown.length === 0, unread: unreadL.length, hasUnread: unreadL.length > 0,
      notifs: shown.slice(0, 30).map(x => ({ icon: "ph ph-" + (/mentor|chat/.test(x.kind) ? "chat-circle-text" : /badge|award|mission/.test(x.kind) ? "medal" : /event/.test(x.kind) ? "calendar-check" : "bell"), t: x.title + (x.body ? " · " + x.body : ""), when: mp9When(x.createdAt),
        dot: !x.readAt && !(s.readIds || {})[x.notifId] ? "#f5b026" : "transparent", open: () => { markOne(x.notifId); this.setState({ notif: false }); const to = PAGE[x.linkPage]; if (to) this.go(to); } })),
      markRead: () => { unreadL.forEach(x => markOne(x.notifId)); },
    };
  },

  simpleTiles() {
    const first = this.me().first;
    return <nav className="m9x-slot m9x-kid" aria-label="Where do you want to go?">
      <h2 className="m9x-kid-h">{first ? "Hi " + first + "! " : ""}Where do you want to go?</h2>
      <ul className="m9x-kid-grid">{MP9_SIMPLE_TILES.map(([id, label, icon]) =>
        <li key={id}><button type="button" className="m9x-kid-tile" onClick={() => this.go(id)}><i className={icon} aria-hidden="true"/><span>{label}</span></button></li>)}</ul>
      <p className="m9x-kid-help"><button type="button" className="m9x-kid-link" onClick={() => this.go("help")}>Stuck? Ask for help</button></p>
    </nav>;
  },
  viewSwitch() {
    const mode = this.viewMode();
    return <section className="m9x-slot m9x-view" aria-labelledby="m9x-view-h">
      <h2 id="m9x-view-h" className="m9x-view-h">How your portal looks</h2>
      <p className="m9x-view-p">The simple view shows fewer places, in plain words, with big buttons on Today. Pick whichever feels easier — you can change it any time.</p>
      <div className="m9x-view-opts" role="group" aria-label="Portal view">
        {[["simple", "Simple", "Fewer places, big buttons"], ["full", "Full", "Everything, all in one place"]].map(([v, l, d]) =>
          <button key={v} type="button" className={"m9x-view-opt" + (mode === v ? " is-on" : "")} aria-pressed={mode === v ? "true" : "false"} onClick={() => this.setView(v)}><b>{l}</b><span>{d}</span></button>)}
      </div>
    </section>;
  },

  /* ── The whole screen ────────────────────────────────────────────────── */
  slot() {
    const s = this.state;
    const need = MP9_NEED[s.scr] || [];
    const failed = need.filter(k => s.er[k]);
    if (failed.length) { const e = s.er[failed[0]]; const code = (e && (e.code || e.message)) || "";
      return <div className="m9x-slot"><div className="m9x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>{code === "network" ? "You’re offline. This part couldn’t load." : "This part couldn’t load (" + (code || "error") + ")."}</span>
        <button type="button" onClick={() => { this.setState({ er: {} }); failed.forEach(k => this.load(k)); }}>Try again</button></div></div>; }
    const loading = need.some(k => s.ld[k] && !s.d[k]);
    const rec = this.props.rec;
    return <>
      {loading ? <div className="m9x-slot"><div className="m9x-load" role="status" aria-live="polite"><span className="m9x-bar"/><span className="m9x-sr">Loading</span></div></div> : null}
      {s.scr === "today" && rec && rec.asked && typeof RecordDrive === "function" ? <div className="m9x-slot m9x-rec"><RecordDrive status={rec} onSaved={this.props.onRecSaved}/></div> : null}
      {s.scr === "today" && this.simple() ? this.simpleTiles() : null}
    </>;
  },
  slotEnd() {
    const s = this.state;
    /* The hand-in is its own panel (assign-desk.jsx AsdHandIn): every kind of
       work — writing, files, photos, recordings, links, checklists. */
    const hand = s.handIn ? ((this.dd("dash") || {}).assignments || []).find(a => a.assignmentId === s.handIn) : null;
    const handEl = hand && typeof AsdHandIn === "function" ? <AsdHandIn key={hand.assignmentId} a={hand} filesMax={(this.dd("dash") || {}).assignmentFilesMax || 5}
      onClose={() => this.setState({ handIn: null })}
      onDone={(msg) => { this.setState({ handIn: null }); this.refresh(["dash", "today"]); this.toast(msg); }}/> : null;
    const rest = this.slotEndInner();
    // The view switch goes after the profile, never above the area's tabs: on a phone it pushed them off the first screen.
    const view = s.scr === "me" ? this.viewSwitch() : null;
    return handEl || view ? <>{view}{rest}{handEl}</> : rest;
  },
  slotEndInner() {
    const s = this.state;
    if (s.scr === "learn" && typeof CurStudyHelper === "function" && ((this.dd("cur") || {}).units || []).length)
      return <div className="m9x-slot"><CurStudyHelper units={(this.dd("cur") || {}).units}/></div>;
    const evals = (s.scr === "growth" || s.scr === "sat")
      ? <Mp9Evals data={this.dd("evals")} err={s.er.evals} busy={!!s.ld.evals} retry={() => this.load("evals")} latestOnly={s.scr === "sat"} mentor={this.mentorInfo().first}/> : null;
    if (s.scr === "sat" && typeof FormationDay === "function") return <div className="m9x-slot"><FormationDay audience="member" compact={true}/>{evals}</div>;
    if (evals) return <div className="m9x-slot">{evals}</div>;
    return null;
  },
  renderVals() {
    const s = this.state, w = s.w || 1200, narrow = w < 760, wide = !narrow, cur = s.scr;
    const go = (scr, extra) => () => this.go(scr, extra);
    const me = this.me(), M = this.mentorInfo();
    const core = MP9_CORE.filter(k => k !== "state" && k !== "notifs");
    const coreErr = core.every(k => s.er[k]) && !core.some(k => s.d[k]);
    const coreLoading = !s.d.today && !s.d.dash && !coreErr;
    const c = this.dd("chat") || {};
    const last = (c.messages || []).filter(m => !m.mine).slice(-1)[0];
    const mine = this.dd("mine") || {}, sc = mine.mentorScores || [];
    const tot = sc[0] ? sc[0].total : null, prevT = sc[1] ? sc[1].total : null;
    const sess = (this.dd("dash") || {}).session || null, stats = (this.dd("dash") || {}).stats || {};
    const vals = Object.assign({
      rootRef: this.rootRef, narrow, wide, outerPad: "0", frameW: "100%", frameH: "100%", frameR: "0", frameSh: "none",
      mainPad: narrow ? "16px 16px 28px" : "32px 40px 56px", toastBottom: narrow ? "92px" : "24px",
      greeting: "Good " + mp9Greeting() + ", " + me.first,
      me: { ...me, name: me.name || "…" }, mentor: { name: M.name, first: M.first, initials: M.initials, role: M.role, months: mine.mentor && mine.mentor.since ? Math.max(1, Math.round((Date.now() - new Date(mine.mentor.since + "T12:00:00Z")) / (30.4 * 864e5))) : 1, since: mine.mentor && mine.mentor.since ? mp9Date(mine.mentor.since, { month: "long", year: "numeric" }) : "this session", next: this.satDate() ? mp9Date(this.satDate(), { weekday: "short", day: "numeric", month: "short" }) + " · 8:30 at the centre" : "Saturday at the centre" },
      sessEnds: me.sessEnds,
      lastMsg: last ? "“" + last.body.slice(0, 140) + "”" : M.has ? "No message yet. Say hello." : "A mentor is matched to you by your centre.",
      kpis: [["Session", sess ? sess.name + " · week " + sess.weekOf + " of " + sess.totalWeeks : "Between sessions"], ["Level", "Level " + (stats.level || 1) + (((this.dd("mom") || {}).momentum || {}).levelName ? " · " + this.dd("mom").momentum.levelName : "")], ["Streak", (stats.streak || 0) + (stats.streak === 1 ? " day" : " days")]].map(([k, v]) => ({ k, v, fg: "#0b0b0c" })),
      goHelp: go("help"), goSat: go("sat"), goMentor: go("mentor"), goGrowth: go("growth"), goOpps: go(this.older() ? "opps" : "sat"), goJournal: go("journal"), goMe: go("me"), goLearn: go("learn"),
      goMoney: go("money"), goRecords: go("records"), goTimetable: go("timetable"), goCompanion: go("companion"), goResults: go("results"), goLearnT: go("learn"),
      onToday: cur === "today", onMentor: cur === "mentor", onGrowth: cur === "growth", onResults: cur === "results", onSat: cur === "sat", onJournal: cur === "journal", onOpps: cur === "opps", onCommunity: cur === "community", onPassport: cur === "passport", onHelp: cur === "help", onMore: cur === "more",
      onLearn: cur === "learn", onMe: cur === "me", onTimetable: cur === "timetable", onCompanion: cur === "companion", onMoney: cur === "money", onRecords: cur === "records",
      ntRight: narrow ? "8px" : "24px", ntLeft: narrow ? "8px" : "auto", ntTop: narrow ? "60px" : "84px", ntW: narrow ? "auto" : "380px",
      moreList: [], jUrl: "/journal/",
      jRules: [["ph ph-lock-simple", "Private entries", "stay yours. Nobody at NGG can read them."], ["ph ph-handshake", "Shared entries", "go to " + M.first + ", who replies within a week."], ["ph ph-shield-check", "If you write about harm or danger,", "the safeguarding officer is told so you get help quickly."]].map(([icon, k, tt]) => ({ icon, k, t: tt })),
      shares: [], entries: [],
      stLoading: coreLoading, stError: coreErr, stOut: false, stOverlay: coreLoading || coreErr, perks: [],
      retry: () => { this.setState({ er: {} }); MP9_CORE.forEach(k => this.load(k)); }, signIn: () => {},
      toastOn: !!s.toast, toastText: s.toast ? s.toast.text : "", toastUndo: !!(s.toast && s.toast.undo), toastUndoFn: () => { s.toast && s.toast.undo && s.toast.undo(); this.setState({ toast: null }); },
      sys: this.sysVals(), st: this.standingVals(go), gt: this.subTabs("gtab", [["score", "Scorecard", "ph ph-chart-line-up"], ["week", "This week", "ph ph-list-checks"], ["well", "Wellness", "ph ph-heartbeat"], ["journey", "Journey", "ph ph-path"]]),
      mainSlot: this.slot(), mainSlotEnd: this.slotEnd(),
    },
      this.accVals(), this.todayVals(go), this.liVals(go), this.growVals(go), this.wellVals(), this.qlineVals(), this.journeyVals(), this.momentumVals(),
      { mv: this.mentorVals(go) }, this.chatVals(),
      this.learnVals(go), this.compVals(go), this.moneyVals(go), this.recordsVals(), this.meVals(), this.feedVals(), this.projectVals(), this.passportVals(),
      this.satVals(go), this.rsVals(go), this.oppsVals(), this.helpVals(), this.sheetVals(go), this.navVals(), this.notifVals());
    vals.li = Object.assign({}, vals.li, { tot: tot === null ? "–" : tot, delta: tot === null ? vals.li.delta : prevT === null ? "First month scored" : (tot - prevT > 0 ? "+" : "") + (tot - prevT) + " since last month" });
    return vals;
  },
  render() {
    const dutyGo = d => { const scr = MP9_ROUTE[d.route] || (/results/.test(d.route) ? "results" : /money|account/.test(d.route) ? "money" : /learn/.test(d.route) ? "learn" : /mentor/.test(d.route) ? "mentor" : "today"); this.go(scr); return true; };
    return <>{Mp9View(this.renderVals())}<GuideTour portal="member" name={this.me().first}/><DutyPopup role="member" onGo={dutyGo}/></>;
  },
});

function mp9Greeting() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }

/* The member's own Saturday evaluations (member.saturday.evals): each
   criterion on the growth scale, the strength their mentor saw and one next
   step. The ratings and the mentor's staff note never reach this screen. */
const MP9_EVAL_TONE = { "Not yet": "is-0", "Emerging": "is-1", "Demonstrated": "is-2", "Strong": "is-3" };
function Mp9Evals({ data, err, busy, retry, latestOnly, mentor }) {
  const list = (data && data.evals) || [];
  const [open, setOpen] = React.useState(0);
  const head = <h2 className="m9x-ev-h">{latestOnly ? "Last Saturday’s evaluation" : "Saturday evaluations"}</h2>;
  if (err && !data) return (
    <section className="m9x-ev" aria-label="Saturday evaluations">{head}
      <p className="m9x-ev-msg" role="alert">We couldn’t load your evaluations. <button type="button" className="m9x-ev-retry" onClick={retry}>Try again</button></p>
    </section>);
  if (!data) return <section className="m9x-ev" aria-label="Saturday evaluations" aria-busy="true">{head}<p className="m9x-ev-msg" role="status">{busy ? "Loading…" : ""}</p></section>;
  if (!list.length) return (
    <section className="m9x-ev" aria-label="Saturday evaluations">{head}
      <p className="m9x-ev-msg">{(mentor || "Your mentor") + " evaluates you after each Saturday. Your first one will show here."}</p>
    </section>);
  const shown = latestOnly ? list.slice(0, 1) : list;
  return (
    <section className="m9x-ev" aria-label="Saturday evaluations">
      {head}
      <ol className="m9x-ev-list">
        {shown.map((e, i) => {
          const on = latestOnly || open === i;
          return (
            <li key={e.date + i} className={"m9x-ev-item" + (on ? " is-open" : "")}>
              {latestOnly ? <div className="m9x-ev-sum"><b>{mp9Date(e.date, { weekday: "short", day: "numeric", month: "short" })}</b><span>{e.mentor ? "by " + e.mentor : ""}</span></div> : (
                <button type="button" className="m9x-ev-sum" aria-expanded={on} onClick={() => setOpen(on ? -1 : i)}>
                  <b>{mp9Date(e.date, { weekday: "short", day: "numeric", month: "short" })}</b>
                  <span>{e.mentor ? "by " + e.mentor : ""}</span>
                  <i className={"ph ph-caret-" + (on ? "up" : "down")} aria-hidden="true"/>
                </button>
              )}
              {on && (
                <div className="m9x-ev-body">
                  <ul className="m9x-ev-crit">
                    {(e.criteria || []).map(c => (
                      <li key={c.key}><span>{c.label}</span><span className={"m9x-ev-lvl " + (MP9_EVAL_TONE[c.level] || "")}>{c.level}</span></li>
                    ))}
                  </ul>
                  {e.strength && <p className="m9x-ev-note"><b>Strength {e.mentor || "your mentor"} saw</b>{e.strength}</p>}
                  {e.next && <p className="m9x-ev-note"><b>One next step</b>{e.next}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}


/* A lesson's course line: its programme year, and whether it is catch-up from a year moved past (domain/curriculum.php curriculum_adapt). */
function mp9CourseLine(u) {
  // The NGG Learning Path: Year → Term (with its name when the course gives one) → the course.
  const p = u.path || null;
  const where = p ? (p.year ? "Year " + p.year + " · " : "") + "Term " + p.term + (p.termName ? ": " + p.termName : "") : (u.year ? "Year " + u.year : "");
  return u.course + (where ? " · " + where : "") + (u.stage === "catchup" ? " · catch-up" : "");
}

/* An assignment's state in words (domain/assignments.php assignment_list_for_member). */
function mp9AsgState(a) {
  const sub = a.submission || {};
  switch (a.state) {
    case "marked": return "Marked · " + sub.grade + (a.points ? "/" + a.points : "");
    case "returned": return "Returned — change it and hand in again";
    case "submitted": return "Handed in" + (a.late ? " late" : "") + " · waiting to be marked";
    case "late": return "Late — hand it in now";
    case "closed": return "Closed";
    default: return a.dueInDays === 0 ? "Due today" : a.dueInDays === 1 ? "Due tomorrow" : a.dueInDays > 1 ? "Due in " + a.dueInDays + " days" : "To do";
  }
}
function mp9AsgTips(a) {
  const sub = a.submission || {}, out = [];
  if (sub.feedback) out.push("From your instructor: " + sub.feedback);
  if (a.proof === "file") out.push("Hand this in as a file or photo.");
  else if (a.proof === "text") out.push("Hand this in as writing.");
  if (a.attachmentUrl) out.push("Worksheet: " + a.attachmentUrl);
  if (a.state === "submitted" && a.canSubmit) out.push("You can still change it until it is marked.");
  return out;
}
