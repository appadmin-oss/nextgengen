/* The Anchor Journal app. Opened in the same tab, always. */
const MP9_JOURNAL_URL = "/journal/";
/* The apps beside the portal, in the desktop sidebar: [label, icon, address]. */
/* The places a member goes OUTSIDE the portal shell. Learn joined them when
   the curriculum stopped being a sheet over this tab and became its own app
   at /learn — a lesson has an address now, and the portal links into it
   rather than drawing a second copy of it. */
const MP9_APPS = [["Learn", "ph ph-book-open-text", "/learn"], ["Anchor Journal", "ph ph-notebook", MP9_JOURNAL_URL], ["Community", "ph ph-users-three", "/community"]];
/* The idea sheet's chips, and the topic the server keeps for each (MEMBER_FEEDBACK_TOPICS). */
const MP9_IDEA_TOPICS = { "How NGG is going for me": "experience", "An activity idea": "idea", "Something NGG should change": "change", "Something I love": "love", "Something in the portal isn’t working": "app" };
/* The experience scale, 1 to 5, as MEMBER_FEEDBACK_RATINGS words it. Faces as well as words: the youngest members read the face first. */
const MP9_RATINGS = [[1, "Not good", "ph ph-smiley-sad"], [2, "Not great", "ph ph-smiley-meh"], [3, "Okay", "ph ph-smiley-blank"], [4, "Good", "ph ph-smiley"], [5, "Great", "ph ph-smiley-wink"]];

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
    ["Help", "ph ph-lifebuoy", [["help", "Get help"], ["support", "Ask the NGG team"], ["me", "My profile"], ["records", "My requests"]].concat(older ? [["money", "Money"]] : [])]];
}
const MP9_SIMPLE_SUBS = { mentor: "Send a message or a voice note", companion: "Tell us about your week", community: "See what your club is sharing", learn: "Your lessons and homework", sat: "What happens this Saturday",
  timetable: "When to come to the centre", tools: "Flashcards, quizzes and a focus timer", growth: "What you’re working towards", passport: "Badges you’ve earned", journal: "Write about your day",
  results: "Add your school report", help: "Ask a grown-up at NGG for help", support: "When something isn’t working", me: "Your name, photo and settings", records: "Things you’ve asked us for", opps: "Things you can apply for" };
/* Today's big buttons in the simple view: the four things a child comes to do,
   one press each, before the full Today screen below. */
const MP9_SIMPLE_TILES = [["mentor", "Talk to my mentor", "ph ph-chat-circle-text"], ["learn", "My lessons", "ph ph-book-open-text"], ["sat", "This Saturday", "ph ph-calendar-star"], ["growth", "My goals", "ph ph-target"], ["journal", "My journal", "ph ph-notebook"]];

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
    /* Courses and division as the server resolves them (member_timetable):
       the courses chosen for the member, never a guess from the track's words. */
    const tt = this.dd("tt") || {};
    const myCourses = (tt.courses || []).filter(Boolean), myL = myCourses.map(c => c.toLowerCase());
    const division = { name: tt.division || "Your division", course: myCourses.length ? myCourses.join(", ") + (tt.coursesConfirmed === false ? " · not confirmed yet" : "") : "No course chosen yet: ask your centre", instructor: "Your instructor", room: me.centre + " centre",
      chess: "Chess is part of every division · Saturdays, and online in the Arcade" };
    /* The week, as a child reads it (owner, 2026-10-28: "I am having trouble
       doing my timetable"): THEIR class first — day, time, room, who — then
       the centre's classes by day with theirs marked in words, then the rest
       of Saturday (the Formation day) on its own, never mixed into the
       classes. `mine` is the server's (member_timetable), not a name guess. */
    const slots = (tt.slots || []).slice().sort((x, y) => ((x.weekday + 1) % 7) - ((y.weekday + 1) % 7) || String(x.startTime).localeCompare(String(y.startTime)));
    const DN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const hm = x => [x.startTime, x.endTime].filter(Boolean).join("–");
    const mineSlots = slots.filter(x => x.mine);
    const mySlot = mineSlots.find(x => x.instructor) || mineSlots[0];
    if (mySlot && mySlot.instructor) division.instructor = mySlot.instructor;
    if (mySlot && mySlot.room) division.room = mySlot.room;
    if (myCourses.length > 3) division.course = "Your centre confirms your course";
    const DIV_ICON = [[/tech|cod|comput/i, "ph ph-code"], [/art|music|perform|media|creative/i, "ph ph-music-notes"], [/sport|athlet/i, "ph ph-soccer-ball"], [/business|enterpr/i, "ph ph-briefcase"], [/science|stem/i, "ph ph-flask"]];
    division.icon = (DIV_ICON.find(([re]) => re.test(division.name)) || [0, "ph ph-graduation-cap"])[1];
    const ttMine = mineSlots.map(x => ({ day: DN[x.weekday] || x.day || "Saturday", time: hm(x), course: x.course + (x.level ? " · " + x.level : ""), where: [x.room, x.instructor].filter(Boolean).join(" · ") || me.centre + " centre" }));
    const byDay = {};
    slots.forEach(x => { const day = DN[x.weekday] || x.day || "Saturday"; (byDay[day] = byDay[day] || []).push(x); });
    const ttDays = Object.keys(byDay).map(d => ({ d, rows: byDay[d].map(x => ({ t: hm(x), a: x.course + (x.level ? " · " + x.level : ""), w: x.room || "", mine: !!x.mine, bg: x.mine ? "#fdf6e3" : "#fff", fw: x.mine ? "700" : "400" })) }));
    const form = this.dd("form") || {};
    const ttSat = (form.blocks || []).map(b => ({ t: b.start, a: b.title, w: (b.for && b.for.member && b.for.member[0]) || b.flow || "" }));
    const curWeeks = units.map(u => { const pr = u.progress, st = pr && pr.status === "completed" ? "Done" : pr ? "In progress" : u.year > ((cur.placement || {}).year || 1) ? "Open early" : u.week > wk && u.stage !== "catchup" ? "Opens week " + u.week : wk && u.week < wk ? "To catch up" : "Not started";
      /* The padlock is for a lesson that is not open yet, and only that: a
         past week the child has not started is open, and drawing it locked
         told them they could not do it. */
      return { w: u.path ? u.path.week : u.week, t: u.title, div: mp9CourseLine(u), s: st, score: pr && pr.bestPct ? pr.bestPct + "%" : "", fg: st === "Done" ? "#1d6b30" : st === "In progress" || st === "To catch up" ? "#7a5600" : "#6b6b72",
        icon: st === "Done" ? "ph-fill ph-check-circle" : st === "In progress" ? "ph-fill ph-circle-half" : /^Opens/.test(st) ? "ph ph-lock-simple" : st === "To catch up" ? "ph ph-arrow-counter-clockwise" : "ph ph-circle" }; });
    const oppsTop = this.older() ? this.oppItems().slice(0, 3).map(o => ({ t: o.t, why: o.why || o.org, close: o.close })) : [];
    return { lessons, assignments: asg, events: ev, division, ttDays, ttMine, hasMine: ttMine.length > 0, noMine: !ttMine.length, ttSat, hasSat: ttSat.length > 0, noSlots: !slots.length, curWeeks: curWeeks.length ? curWeeks : [{ w: "–", t: "No lessons published yet", div: "", s: "", score: "", fg: "#6b6b72", icon: "ph ph-hourglass" }],
      oppsTop: oppsTop.length ? oppsTop : [{ t: "Nothing picked for you yet", why: "Staff add bootcamps and competitions here", close: "check back soon" }],
      dlPdf: () => this.printCurriculum(), dlDoc: () => this.printCurriculum(true),
      // The maker opens with this centre's classes already in, theirs marked (?centre=, tt-app.jsx).
      openTimetableMaker: () => { location.href = "/timetable/me" + (tt.slug ? "?centre=" + encodeURIComponent(tt.slug) : ""); }, printPdf: () => window.print(),
      lt: this.subTabs("ltab", [["week", "This week", "ph ph-book-open-text"], ["course", "My course", "ph ph-books"]].concat(this.older() ? [["forYou", "For you", "ph ph-sparkle"]] : [])) };
  },
  printCurriculum(word) {
    NGGApi.member.curriculumDocument ? NGGApi.member.curriculumDocument().catch(() => null) : null;
    window.open("/api/member/curriculum-doc.php" + (word ? "?format=doc" : ""), "_blank", "noopener");
  },
  /* A lesson is a PLACE now (page-learn.jsx), so this hands it over rather
     than drawing it in a sheet. Two renderers for one lesson is the forked
     renderer CLAUDE.md §11 names; there is one, and it is the Learn app's. */
  openLesson(unitId) {
    try { location.assign("/learn/lesson/" + encodeURIComponent(unitId)); } catch (_) {}
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
        shareA: R.share ? "true" : "false", track: R.share ? "#0b0b0c" : "#d6d4cc", knob: R.share ? "21px" : "3px", shareT: R.share ? "Send it to " + mf + " to talk about" : "Just save it (" + mf + " can still read it)", toggleShare: () => upd({ share: !R.share }),
        canBack: step > 0, back: () => upd({ step: step - 1 }),
        nextL: step === 2 ? "Save my week" : "Next",
        next: () => {
          if (step < 2) return upd({ step: step + 1 });
          if (!(R.plan || "").trim()) { upd({ tried: true }); return this.toast("Write your if-then plan first."); }
          const fin = { ...R, period, done: true, tried: false, at: new Date().toISOString() };
          this.saveSt("mp9.review", fin); set({ cr: null, cpTab: "week" });
          /* Every review goes into the journal in full — obstacles too — because
             the mentor reads the journal; sharing only sends it to them. */
          this.journalSave({ title: "My week", visibility: R.share ? "mentor" : "private", tags: "review", body: (R.wins.length ? "Wins: " + R.wins.join(", ") + ". " : "") + (R.proud ? "Proud of: " + R.proud + ". " : "") + (R.blocks.length ? "Got in the way: " + R.blocks.join(", ") + ". " : "") + "Next week: " + (wish || "") + (R.outcome ? " (" + R.outcome + ")" : "") + (obstacle ? ". Obstacle: " + obstacle : "") + ". Plan: " + R.plan })
            .then(x => x && this.toast(R.share ? "Saved and sent to " + mf : "Saved. Only you and " + mf + " can see it."));
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
      /* A member does not record payments: their parent does, from the family
         account. "Ask my parent" opens the panel below the money screen. */
      openAsk: () => this.state.scr === "money" ? mp9FocusAsk() : this.go("money", { askFocus: true }),
    };
  },
  recordsVals() {
    const s = this.state, r = this.dd("rec") || {}, att = r.attendance || {}, q = this.dd("reqs") || {};
    const days = (att.days || []).map(x => ({ d: mp9Date(x.date, { weekday: "short", day: "numeric", month: "short" }), st: x.status ? x.status[0].toUpperCase() + x.status.slice(1) : x.in ? "Present" : "Absent", i: x.in || "—", o: x.out || "—" }))
      .map(x => ({ ...x, fg: x.st === "Present" ? "#1d6b30" : x.st === "Late" ? "#7a5600" : "#b0361c" }));
    const ex = q.excuses;   // two excused absences a session (POLICY §1.1); the server refuses a third
    const away = "I'll be away" + (ex ? " · " + ex.left + " of " + ex.max + " absences left" : "");
    const KINDS = [["I'll be away", "leave", ["From (YYYY-MM-DD)", "Until (YYYY-MM-DD, blank if you do not know)", "Why"], away],
      ["Academic leave (exams or a school programme)", "academic", ["From (YYYY-MM-DD)", "Until (YYYY-MM-DD)", "What it’s for, and the school"]],
      ["Ask for a replacement ID", "idcard", ["Say why"]], ["Correct my details", "details", ["What needs changing"]], ["Appeal a charge", "appeal", ["Which charge, and why"]], ["Something else", "help", ["Anything else the desk should know"]]];
    const K = KINDS.find(k => k[0] === s.rKind);
    const f = s.rF || {};
    const rOk = !!K && (K[1] === "leave" ? /^\d{4}-\d{2}-\d{2}$/.test(f[K[2][0]] || "") && !!(f[K[2][2]] || "").trim() : K[1] === "academic" ? /^\d{4}-\d{2}-\d{2}$/.test(f[K[2][0]] || "") && /^\d{4}-\d{2}-\d{2}$/.test(f[K[2][1]] || "") && (f[K[2][2]] || "").trim().length >= 10 : !!(f[K[2][0]] || "").trim());
    const ST = { open: ["Waiting for a reply", "#7a5600"], approved: ["Approved", "#1d6b30"], declined: ["Declined", "#b0361c"], withdrawn: ["Withdrawn", "#6b6b72"] };
    const list = (q.requests || []).map(x => { const st = x.kind === "feedback" && x.status === "approved" ? ["Thanked", "#1d6b30"] : ST[x.status] || [x.status, "#4a4a50"];
      return { t: x.subject || x.kindLabel, key: x.requestId, gone: x.status === "withdrawn", hasReply: !!x.decision, reply: x.decision || "", canWithdraw: x.status === "open", sFg: st[1], sText: st[0], when: mp9Date(x.createdAt),
        withdraw: () => NGGApi.member.withdrawRequest(x.requestId).then(() => { this.refresh(["reqs"]); this.toast("Request withdrawn"); }).catch(e => this.toast(mp9Err(e))) }; });
    return {
      rec: { attended: att.present || 0, ran: att.daysRan || 0, pct: att.rateKnown ? att.rate + "%" : "no term calendar set" },
      certs: (r.certificates || []).map(c => ({ t: c.certId + (c.revoked ? " · revoked" : ""), d: String(c.issuedAt || "").slice(0, 10), url: "/cert/" + c.certId })),
      days: days.length ? (s.daysAll ? days : days.slice(0, 6)) : [{ d: "No days recorded yet", st: "", i: "—", o: "—", fg: "#6b6b72" }], daysMore: !s.daysAll && days.length > 6, showDays: () => this.setState({ daysAll: true }),
      reqKinds: KINDS.map(k => ({ k: k[3] || k[0], on: s.rKind === k[0] ? "true" : "false", ring: s.rKind === k[0] ? "#0b0b0c" : "#d6d4cc", bw: s.rKind === k[0] ? "2px" : "1px", pick: () => this.setState({ rKind: k[0], rF: {} }) })),
      rHas: !!K, rFields: K ? K[2].map(fl => ({ f: fl, v: f[fl] || "", on: e => this.setState({ rF: { ...this.state.rF, [fl]: e.target.value } }) })) : [],
      rCant: !rOk, rOp: rOk ? 1 : 0.4, rCancel: () => this.setState({ rKind: null, rF: {} }),
      rSend: () => { if (!rOk) return; const v = i => (f[K[2][i]] || "").trim();
        const body = (K[1] === "leave" || K[1] === "academic") ? { kind: K[1], fromDate: v(0), toDate: v(1), body: v(2) }
          : { kind: K[1], subject: f.subject || "", body: v(0) };
        NGGApi.member.raiseRequest(body).then(() => { this.setState({ rKind: null, rF: {} }); this.refresh(["reqs"]); this.toast("Sent. You’ll see the reply here."); }).catch(e => this.toast(mp9Err(e))); },
      reqList: list.length ? list : [{ t: "You haven’t asked the desk anything yet", key: "none", gone: false, hasReply: false, reply: "", canWithdraw: false, sFg: "#6b6b72", sText: "", when: "–", withdraw: () => {} }],
    };
  },
  meVals() {
    const s = this.state, d = this.dd("dash") || {}, m = d.member || {}, t = this.dd("today") || {}, p = t.profile || {}, cir = this.dd("circle") || {}, sec = this.dd("sec") || {};
    // Parents, teachers and mentors (member.circle): a mentor is connected by being assigned.
    const linked = (cir.connected || cir.family || []).map(x => (x.name || x.fullName || "A guardian") + (x.relation ? " · " + x.relation : ""));
    const devices = (sec.sessions || []).map(x => ({ t: (x.device || x.ua || "A device") + (x.ip ? " · " + x.ip : ""), when: x.current ? "Now" : mp9When(x.lastSeenAt || x.createdAt), cur: !!x.current, notCur: !x.current,
      signOut: () => NGGApi.member.securityRevoke(x.sid || x.sessionId).then(() => { this.refresh(["sec"]); this.toast("Signed out of that device"); }).catch(e => this.toast(mp9Err(e))) }));
    const ngv = d.ngv || null;
    return {
      profile: { phone: p.guardianPhone || "Not on record", school: p.school || "Not on record", cls: p.level || m.level || "–", pronoun: "" },
      /* The whole record, as the desk holds it. What a member may change
         themselves (photo, bio) is under Edit profile; the rest is asked for. */
      profileRows: [["Full name", p.fullName || m.fullName], ["NGG ID", p.displayId || m.displayId || "Not printed yet"], ["Date of birth", p.dob ? mp9Date(p.dob, { day: "numeric", month: "long", year: "numeric" }) + ((this.dd("today") || {}).age ? " · " + this.dd("today").age + " years old" : "") : ""],
        ["Centre", p.centre], [(p.courses || []).length > 1 ? "Courses" : "Course", (p.courses || []).join(", ") || p.track], ["Class", p.level || m.level], ["School", p.school], ["Joined NGG", p.joinDate ? mp9Date(p.joinDate, { month: "long", year: "numeric" }) : (p.intakeYear ? String(p.intakeYear) : "")],
        ["Email", p.email], ["Your phone", p.phone], ["Guardian", p.guardianName], ["Guardian phone", p.guardianPhone]]
        .map(([l, v]) => ({ l, v: v ? String(v) : "Not on record", none: !v })),
      bioShown: p.bio || m.bio || "", hasBio: !!(p.bio || m.bio),
      openProfile: () => this.openSheet({ k: "profile" }),
      ngv: { on: !!ngv, note: ngv ? (ngv.note || ngv.status || "You’re on the NGV volunteer track.") : "You can apply to join NGV, the volunteer track, once your centre opens it." }, ngvOff: !ngv,
      circle: { code: cir.code || "", linked: linked.length ? linked : ["Nobody yet"] },
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
      return { id, by: (p.author && p.author.name) || p.authorName || p.channelName || "NGG", when: mp9When(p.createdAt), t: p.body || p.title || "",
        likesN: (base["❤️"] || 0) - ((p.myReactions || []).includes("❤️") ? 1 : 0) + (lk ? 1 : 0), cheersN: (base["👏"] || 0) - ((p.myReactions || []).includes("👏") ? 1 : 0) + (ch ? 1 : 0),
        lkIcon: lk ? "ph-fill ph-heart" : "ph ph-heart", lkFg: lk ? "#b0361c" : "#4a4a50", chIcon: ch ? "ph-fill ph-hands-clapping" : "ph ph-hands-clapping", chFg: ch ? "#a07400" : "#4a4a50",
        like: react("❤️", "liked", lk), cheer: react("👏", "cheered", ch),
        cmts: loaded.map(c => ({ w: c.name || c.authorName || "Member", t: c.body, pending: false })).concat(mine.map(t2 => ({ w: "You", t: t2, pending: true }))), cN: (p.commentCount || p.comments || 0) + mine.length, open: !!s.cOpen[id],
        toggle: () => { const o = !s.cOpen[id]; this.setState({ cOpen: { ...this.state.cOpen, [id]: o } }); if (o) NGGApi.member.community.comments(id).then(r => this.setState({ cmtsLoaded: { ...(this.state.cmtsLoaded || {}), [id]: (r && r.comments) || [] } })).catch(() => {}); },
        draft: s.cDraft[id] || "", onDraft: e => this.setState({ cDraft: { ...this.state.cDraft, [id]: e.target.value } }),
        send: e => { e.preventDefault(); const t2 = (this.state.cDraft[id] || "").trim(); if (!t2) return;
          NGGApi.member.community.comment(id, t2).then(r => { this.setState({ cmts: { ...this.state.cmts, [id]: (this.state.cmts[id] || []).concat(r && r.held === false ? [] : [t2]) }, cDraft: { ...this.state.cDraft, [id]: "" } }); this.toast("Comment sent. It shows once a moderator checks it."); }).catch(er => this.toast(mp9Err(er))); } };
    }).concat(posts.length ? [] : [{ id: "none", by: "NGG", when: "", t: f.error ? "The feed couldn’t load." : "Nothing in the community feed yet.", likesN: 0, cheersN: 0, lkIcon: "ph ph-heart", lkFg: "#4a4a50", chIcon: "ph ph-hands-clapping", chFg: "#4a4a50", like: () => {}, cheer: () => {}, cmts: [], cN: 0, open: false, toggle: () => {}, draft: "", onDraft: () => {}, send: e => e.preventDefault() }]) };
  },
  /* Projects a mentor or lead put me on (member.projects): the countdown, my group (first names), and my part. */
  assignedVals() {
    const s = this.state, D = this.dd("prj"), err = !D && !!(s.er || {}).prj;
    const TONE = { ok: "#1d6b30", soon: "#7a5600", due: "#7a5600", over: "#b0361c", neutral: "#4a4a50", done: "#4a4a50" };
    const notes = s.pjNote || {};
    const send = (p, status) => {
      const note = status === "done" ? String(notes[p.projectId] || "").trim() : "";
      return this.act(NGGApi.member.projectMark(p.projectId, status, note), status === "done" ? "Marked done · " + p.title : "Marked not done yet", ["prj", "today"])
        .then(r => { if (r && status === "done") this.setState({ pjNote: { ...(this.state.pjNote || {}), [p.projectId]: "" } }); });
    };
    const list = ((D && D.projects) || []).map(p => {
      const c = p.countdown || {}, me = p.me || {}, open = p.status === "open";
      const mates = (p.mates || []).map(m => ({ name: m.name, icon: m.done ? "ph-fill ph-check-circle" : "ph ph-circle", fg: m.done ? "#1d6b30" : "#6b6b72" }))
        .concat((p.staff || []).map(n => ({ name: n, icon: "ph ph-chalkboard-teacher", fg: "#4a4a50" })));
      const gt = p.groupTally || { done: 0, of: 0 };
      return { key: p.projectId, t: p.title, d: p.detail || "", hasD: !!p.detail,
        eyebrow: (p.group ? p.group + " · " : "") + "Set by " + (p.by || "NGG"),
        cdLabel: c.label || "", cdFg: TONE[c.tone] || "#4a4a50", pct: (c.elapsedPct || 0) + "%", pctN: String(c.elapsedPct || 0),
        barL: "How much of the time has gone: " + (c.elapsedPct || 0) + "%",
        dueL: p.dueOn ? (open ? "Finishes " : "Finished ") + mp9Date(p.dueOn, { weekday: "long", day: "numeric", month: "long" }) : "",
        hasMates: mates.length > 0, mates, groupL: (p.group || "Everyone on it") + " · " + gt.done + " of " + gt.of + " done",
        canMark: open && me.status === "assigned", isDone: me.status === "done", canUndo: open && me.status === "done", isExcused: me.status === "excused",
        doneL: "Your part is done" + (me.doneAt ? " · " + mp9Date(me.doneAt) : "") + (me.note ? " · “" + me.note + "”" : ""),
        excusedL: "You’re excused from this one" + (me.note ? ": " + me.note : "."),
        note: notes[p.projectId] || "", onNote: e => this.setState({ pjNote: { ...(this.state.pjNote || {}), [p.projectId]: e.target.value } }),
        mark: () => send(p, "done"), undo: () => send(p, "assigned") };
    });
    return { assigned: list, hasAssigned: list.length > 0, prjErr: err, prjRetry: () => this.refresh(["prj"]) };
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
      sat: { date: satIso ? mp9Date(satIso, { weekday: "long", day: "numeric", month: "long" }) : "Saturday", time: f.off ? "No NGG this Saturday" : f.hours || "8:00am – 2:00pm", theme: f.theme || "Think. Create. Lead. Serve.", room: me.centre + " centre" },
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
        return { s: x.subject, now: (x.current === null || x.current === undefined ? "–" : x.current) + " · mid-term " + Math.ceil((x.current || 0) + (x.target - (x.current || 0)) / 2), target: x.target, act: x.what || "", onAct: e => updP(i, { what: e.target.value }),
          ...mp9PlanWhen(x, ww => updP(i, ww), s.rsWhenTried),
          method: methodLabel(x.method), onMethod: e => updP(i, { method: methodKey(e.target.value) }), methodWhy: why,
          sessT: x.sessionsPerWeek + (x.sessionsPerWeek === 1 ? " session" : " sessions"), help: helperLabel(x.helper), onHelp: e => updP(i, { helper: helperKey(e.target.value) }),
          tUp: () => updP(i, { target: Math.min(100, x.target + 1) }), tDn: () => updP(i, { target: Math.max(85, x.current || 0, x.target - 1) }),
          hUp: () => updP(i, { sessionsPerWeek: Math.min(7, x.sessionsPerWeek + 1) }), hDn: () => updP(i, { sessionsPerWeek: Math.max(1, x.sessionsPerWeek - 1) }) }; }),
      methods: methods.map(m => m.label), helpers: helpers.map(h => h.label),
      habit: s.rsHabit !== undefined ? s.rsHabit : pp.habit || "", onHabit: e => set({ rsHabit: e.target.value }),
      to: [["mentor", mf + " · mentor", "Reads it and approves it with you", true], ["instr", "Your instructor", "Sees subjects linked to their class", true], ["admin", "NGG team", "Keeps it on your record", true], ["family", "Your family", "A copy once it’s approved", false]]
        .map(([kk, l, ss, lock]) => { const on = lock || fam; return { l, s: ss, lock, lockA: lock ? "true" : "false", on: on ? "true" : "false", icon: on ? "ph-fill ph-check-square" : "ph ph-square", ic: on ? "#0b0b0c" : "#9a9aa0", cur: lock ? "default" : "pointer", go: () => { if (!lock) set({ rsFam: !fam }); } }; }),
      commitA: commit ? "true" : "false", track: commit ? "#0b0b0c" : "#d6d4cc", knob: commit ? "24px" : "4px", commitBd: commit ? "#0b0b0c" : "#e8e5dd", commitBg: commit ? "#fafaf8" : "#fff", toggleCommit: () => set({ rsCommit: !commit }),
      sendOp: commit && items.length ? 1 : 0.4, sendHint: !!s.rsSendTried && !commit,
      send: () => {
        if (!P) return;
        const noWhen = items.filter(x => !mp9WhenOk(x.whenWhere)), noWhat = items.filter(x => !String(x.what || "").trim());
        if (noWhen.length) { set({ rsSendTried: true, rsWhenTried: true }); return this.toast("Pick the days and a time for " + noWhen.map(x => x.subject).join(" and ") + "."); }
        if (noWhat.length) return this.toast("Say what you’ll do for " + noWhat.map(x => x.subject).join(" and ") + ".");
        if (!commit) return set({ rsSendTried: true });
        NGGApi.member.resultsSend(body()).then(r => { set({ rsSendTried: false, rsWhenTried: false, rsItems: null, rsHabit: undefined, rsCommit: undefined, rsFam: undefined }); reload();
          const m = this.rootRef.current && this.rootRef.current.querySelector("main"); if (m) m.scrollTop = 0;
          this.toast(r && r.mentor ? "Sent to " + r.mentor + " for approval." : "Sent. Your mentor will see it when one is assigned."); }).catch(e => this.toast(mp9Err(e)));
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
        /* Written for the mentor reading it cold: which week, what each promise
           was, whether it was kept, and why not, in the child's words. "FRENCH:
           kept it" told a mentor nothing they could reply to. */
        const R = s.acR || {}, kept = its.filter(it => R[it.itemId] === "done").length;
        const lines = its.map(it => { const r = R[it.itemId], why = ((s.acW || {})[it.itemId] || "").trim();
          const promise = [it.sessionsPerWeek + (it.sessionsPerWeek === 1 ? " session" : " sessions") + " a week", it.methodLabel || methodLabel(it.method), it.whenWhere].filter(Boolean).join(", ");
          return ({ done: "✓ ", partly: "◐ ", missed: "✗ " })[r] + mp9Subject(it.subject) + ": " + ({ done: "kept it", partly: "partly kept", missed: "missed" })[r] + "\n   The promise: " + promise + (why ? "\n   " + (r === "missed" ? "What got in the way: " : "How it went: ") + why : ""); });
        const head = "My study plan for " + mp9Date(pp.weekStart, { day: "numeric", month: "long" }) + " week. I kept " + kept + " of " + its.length + (its.length === 1 ? " promise." : " promises.");
        this.journalSave({ title: "Study plan check-in · kept " + kept + " of " + its.length, body: head + "\n\n" + lines.join("\n\n"), visibility: "mentor", tags: "plan checkin" }).then(r => { if (!r) return; set({ acSent: true }); const missed = its.filter(it => (s.acR || {})[it.itemId] === "missed").length;
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
      ask: () => { this.sendToMentor("Can we talk about “" + o.t + "” (" + o.org + ")? It " + o.close.toLowerCase() + ".").then(r => { if (r) this.toast("Sent to " + mf + ". See it in My mentor."); }); },
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
    const P = this.st("mp9.project", null);
    const titles = { assign: A ? A.title : "Assignment", idea: "Tell us what you think", request: "New request to the desk", change: "Ask for a change", gate: "Gate pass",
      team: P ? "Update for your team" : "Start a team project", portfolio: "Add to my portfolio", profile: "Edit profile", proof: "Add proof", password: s.pwCode ? "Set a new password" : (this.dd("sec") || {}).hasPassword ? "Change your password" : "Set a password" };
    const proofText = s.sPick === "text", proofLink = s.sPick === "link";
    const sendable = !s.sBusy && { proof: !!s.sPick && (proofText ? txt.length > 5 : proofLink ? /^https?:\/\//i.test(txt) : !!s.sFile), idea: !!s.sPick && (MP9_IDEA_TOPICS[s.sPick] === "experience" ? !!s.sRate : txt.trim().length >= 6), request: !!s.sPick, change: !!s.sPick,
      team: txt.length > 3, portfolio: !!s.sPick && txt.length > 1, assign: A && A.proof === "file" ? !!s.sFile : A && A.proof === "text" ? txt.length > 10 : txt.length > 10 || !!s.sFile }[sh.k];
    const busy = p => { set({ sBusy: true }); return p.then(r => { set({ sBusy: false }); return r; }, e => { set({ sBusy: false }); this.toast(mp9Err(e)); return null; }); };
    const send = () => {
      if (!sendable) return;
      if (sh.k === "proof") busy(NGGApi.member.submitMission({ missionId: sh.id, proofUrl: proofLink ? txt : s.sFile ? s.sFile.url : "", note: proofText ? txt : (txt + (Object.keys(s.pTags || {}).filter(k => s.pTags[k]).length ? " · " + Object.keys(s.pTags).filter(k => s.pTags[k]).join(", ") : "")).trim() }))
        .then(r => { if (!r) return; set({ sheet: null, mState: { ...(this.state.mState || {}), [sh.id]: "submitted" } }); this.refresh(["dash"]); this.toast("Sent to " + mf + " for review"); });
      if (sh.k === "idea") {
        /* Its own kind (member_feedback_create), so ideas never fill the cap that "I need help" shares. */
        busy(NGGApi.member.feedback(MP9_IDEA_TOPICS[s.sPick] || "idea", txt, !!s.sAnon, MP9_IDEA_TOPICS[s.sPick] === "experience" ? s.sRate || 0 : 0))
          .then(r => { if (!r) return; this.closeSheet(); this.toast(s.sAnon ? "Sent without your name. Thank you." : "Sent to the NGG team. They’ll reply here."); if (!s.sAnon) this.refresh(["reqs"]); });
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
    const acct = d.member || {}, hasPw = !!(this.dd("sec") || {}).hasPassword, pwId = acct.memberId || this.me().id;
    const qr = sh.k === "gate" ? this.gateQr() : "";
    return {
      sheetOn: !!s.sheet, closeSheet: () => this.closeSheet(), sheetTitle: titles[sh.k] || "", sendSheet: send, cantSend: !sendable, sendOp: sendable ? 1 : 0.4,
      shAssign: sh.k === "assign", shIdea: sh.k === "idea", shRequest: sh.k === "request", shChange: sh.k === "change", shGate: sh.k === "gate", shTeam: sh.k === "team", shPortfolio: sh.k === "portfolio", shProfile: sh.k === "profile", shPassword: sh.k === "password", shProof: sh.k === "proof",
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
      pfCur: e => set({ pf: { ...this.state.pf, cur: e.target.value }, pfErr: "" }), pfCode: e => set({ pf: { ...this.state.pf, code: e.target.value.replace(/\D/g, "").slice(0, 6) }, pfErr: "" }),
      /* Changing it needs the current password; forgetting it is answered by a code to the email on the record (auth.resetRequest / resetConfirm), not by a dead end. */
      signin: { email: acct.email || ((this.dd("today") || {}).profile || {}).email || "No email on your record. Ask the desk to add one.",
        pwState: !this.dd("sec") ? "Checking…" : hasPw ? "You have a password. You can change it here." : "No password yet: you sign in with a code sent by email." },
      askCur: hasPw && !s.pwCode, openPassword: () => this.openSheet({ k: "password" }),
      pwIntro: s.pwCode ? "Type the code from the email, then your new password." : hasPw ? "Type the password you use now, then the new one. You stay signed in." : "You sign in with a code sent by email. Set a password if you’d like to sign in with one instead.", pwCodeSent: !!s.pwCode, pwCodeTo: (s.pwCode && s.pwCode.masked) || "the email on your record",
      pwBtnL: s.pwCode ? "Set my new password" : hasPw ? "Change password" : "Set a password",
      sendPwCode: () => NGGApi.auth.resetRequest(pwId).then(r => { set({ pwCode: { masked: (r && r.masked) || "" }, pfErr: "" }); this.toast("Code sent. Check your email (or your guardian’s)."); }).catch(e => set({ pfErr: mp9Err(e) })),
      savePw: () => { const a = s.pf.pw1 || "", b = s.pf.pw2 || ""; if (a.length < 8) return set({ pfErr: "Your new password needs 8 or more characters." }); if (a !== b) return set({ pfErr: "The two new passwords don’t match." });
        const done = () => { set({ pf: { ...this.state.pf, pw1: "", pw2: "", cur: "", code: "" }, pwCode: null, pfErr: "" }); this.refresh(["sec"]); if (sh.k === "password") this.closeSheet(); this.toast(hasPw || s.pwCode ? "Password changed. You’re still signed in." : "Password set. You can sign in with it next time."); };
        if (s.pwCode) { if ((s.pf.code || "").length !== 6) return set({ pfErr: "Type the 6-digit code from the email." });
          /* "invalid" and "expired" mean the code here, and only here, so they are read here rather than in mp9Err. */
          const CODE = { invalid: "That code isn’t right. Check the email and try again.", expired: "That code has run out. Send a new one.", already_used: "That code was used already. Send a new one." };
          return NGGApi.auth.resetConfirm({ memberId: pwId, otp: s.pf.code, password: a }).then(done).catch(e => set({ pfErr: CODE[e && (e.code || e.message)] || mp9Err(e) })); }
        if (hasPw && !(s.pf.cur || "")) return set({ pfErr: "Type your current password first." });
        NGGApi.auth.setPassword(a, s.pf.cur || "").then(done).catch(e => set({ pfErr: mp9Err(e) })); },
      changeEmail: () => { const v = window.prompt ? window.prompt("Your new email address") : ""; if (!v) return; NGGApi.member.changeEmail(v.trim()).then(() => this.toast("Check " + v.trim() + " for a link to confirm it.")).catch(e => this.toast(mp9Err(e))); },
      exportData: () => NGGApi.member.exportData().then(r => { const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-ngg-data.json"; a.click(); this.toast("Your data is downloading."); }).catch(e => this.toast(mp9Err(e))),
      delAsk: s.delStep === 0, delConfirm: s.delStep === 1, startDel: () => set({ delStep: 1 }), cancelDel: () => set({ delStep: 0 }),
      doDel: () => NGGApi.member.deleteAccount().then(() => { set({ delStep: 0, sheet: null }); this.toast("Request sent. Your centre lead will call your guardian before anything is deleted."); }).catch(e => this.toast(mp9Err(e))),
      onBio: e => set({ pf: { ...this.state.pf, bio: e.target.value } }), bioV: s.pf.bio !== undefined ? s.pf.bio : acct.bio || "",
      saveProfile: () => NGGApi.member.updateProfile({ bio: s.pf.bio !== undefined ? s.pf.bio : acct.bio || "" }).then(() => { this.closeSheet(); this.refresh(["dash", "today"]); this.toast("Profile saved"); }).catch(e => this.toast(mp9Err(e))),
      /* The photo is the face on a printed ID, so it is changed by asking: the
         member chooses the photo they want, it goes to the desk with a reason,
         and the desk approves or declines it (photo_change_requests). */
      ph: mp9PhotoAsk(this, me, s, set),
      shForm: ["proof", "assign", "idea", "request", "change", "team", "portfolio"].includes(sh.k) && !(sh.k === "assign" && aDone),
      sText: s.sText, onSText: e => set({ sText: e.target.value }), sAnon: s.sAnon ? "true" : "false", toggleAnon: () => set({ sAnon: !s.sAnon }), anonIcon: s.sAnon ? "ph-fill ph-check-square" : "ph ph-square",
      sAssign: A ? { div: (A.track || me.track || "Club") + (A.points ? " · " + A.points + " points" : ""), due: A.dueAt ? mp9Date(A.dueAt, { weekday: "short", day: "numeric", month: "short" }) : "no date", s: mp9AsgState(A),
        brief: A.instructions || A.brief || "", tips: mp9AsgTips(A), hasTips: mp9AsgTips(A).length > 0, done: aDone, open: !aDone } : {},
      ideaChips: chips(Object.keys(MP9_IDEA_TOPICS)),
      ideaRate: MP9_IDEA_TOPICS[s.sPick] === "experience",
      ideaPh: MP9_IDEA_TOPICS[s.sPick] === "experience" ? "What makes it that way? (you can leave this empty)" : MP9_IDEA_TOPICS[s.sPick] === "app" ? "What were you trying to do, and what happened?" : "Tell us about it",
      rates: MP9_RATINGS.map(([n, l, icon]) => { const on = s.sRate === n; return { l, icon: on ? icon.replace("ph ", "ph-fill ") : icon, on: on ? "true" : "false", ring: on ? "#0b0b0c" : "#d6d4cc", bw: on ? "2px" : "1px", pick: () => set({ sRate: n }) }; }),
      /* Feeling unsafe is not an idea: that goes to the people who keep young people safe, not the ideas box. */
      ideaToHelp: () => { this.closeSheet(); this.go("help"); },
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
      ["Grow", "ph ph-plant", [["growth", "Scorecard & goals"], ["results", "School results"], ["passport", "Passport"], ["journal", "Journal"]]],
      ["Learn", "ph ph-book-open-text", [["learn", "Lessons"], ["sat", "Saturday"], ["timetable", "Timetable"], ["tools", "Study tools"]].concat(older ? [["opps", "Opportunities"]] : [])],
      ["Account", "ph ph-user-circle", [["me", "Profile"], ["money", "Money"], ["records", "Records"], ["support", "Support"], ["help", "Help"]]]])
      .map(([label, icon, kids]) => { const bb = kids.map(([id]) => bdg(id)).filter(Boolean); return { label, icon, kids, ids: kids.map(k => k[0]), badge: bb.length === 1 ? bb[0] : bb.length ? String(bb.length) : "" }; });
    const area = areas.find(a => a.ids.includes(cur)) || areas[0];
    const acc = a => MP9_ACCENT[MP9_AREA_OF[a.ids[0]] || "today"] || "#0b0b0c", accOn = acc(area);
    const navGroups = [{ h: "", hasH: false, items: areas.map(a => { const on = a === area; return { label: a.label, icon: on ? a.icon.replace("ph ", "ph-fill ") : a.icon, cur: on ? "page" : undefined, bg: on ? "#fff" : "transparent", sh: on ? "0 0 0 1px #e8e5dd, 0 1px 2px rgba(11,11,12,.06)" : "none", fw: on ? 600 : 500, badge: a.badge, hasBadge: !!a.badge, go: () => this.go(a.ids[0]) }; }) }, {
      /* The two places a member goes outside the portal, always one click away on
         a wide screen: the Anchor Journal and the NGG Community. Same tab. */
      h: "Your apps", hasH: true, items: MP9_APPS.map(([label, icon, url]) => ({ label, icon, cur: undefined, bg: "transparent", sh: "none", fw: 500, badge: "", hasBadge: false,
        go: () => { try { location.assign(url); } catch (_) {} } })) }];
    const areaTabs = area.kids.map(([id, l]) => { const on = cur === id; const bb = bdg(id); return { l, on: on ? "true" : "false", fg: on ? accOn : "#5a5a60", fw: on ? 600 : 500, bar: on ? accOn : "transparent", badge: bb, hasBadge: !!bb, go: () => this.go(id) }; });
    const tabbar = areas.map(a => { const on = a === area; return { label: a.label, icon: on ? a.icon.replace("ph ", "ph-fill ") : a.icon, cur: on ? "page" : undefined, fw: on ? 600 : 500, fg: on ? acc(a) : "#626a6e", go: () => this.go(a.ids[0]), hasBadge: !!a.badge }; });
    const subs = { support: "Cases you’ve opened with the NGG team", sat: "This week's plan and mission", journal: "Opens in its own app", tools: "Flashcards, focus timer, typing, maths · its own app", growth: "Courage, scores and goals", results: "Upload every term · plan · promises", passport: "Achievements and portfolio", learn: "Lessons and assignments", timetable: "Your week at the centre", companion: "How your week went", opps: "Matched to you", community: "Feed and team projects", me: "Card, profile and devices", money: "Dues, fines and payments", records: "Attendance and requests", help: "You can always talk to us" };
    if (simple) Object.assign(subs, MP9_SIMPLE_SUBS);
    const flat = [].concat(...areas.map(a => a.kids.map(([id, l]) => ({ id, label: l, icon: a.icon }))));
    const moreGroups = areas.slice(1).map(a => ({ h: a.label, items: a.kids.map(([id, label]) => ({ label, icon: a.icon, badge: bdg(id), hasBadge: !!bdg(id), d: subs[id] || "", go: () => this.go(id) })) }));
    const actions = [["Write in my journal", "ph ph-pencil-simple-line", () => { location.href = "/journal/"; }], ["Upload my school results", "ph ph-exam", () => this.go("results")], ["Add proof for a mission", "ph ph-camera", () => this.go("sat")],
      ["Message my mentor", "ph ph-chat-circle-text", () => this.go("mentor")], ["Show my gate pass", "ph ph-qr-code", () => this.openSheet({ k: "gate" })], ["Ask my parent to pay", "ph ph-hand-waving", () => this.go("money", { askFocus: true })],
      ["Ask for a change of mentor", "ph ph-arrows-left-right", () => this.openSheet({ k: "change" })], ["Share an idea or tell us what to improve", "ph ph-lightbulb", () => this.openSheet({ k: "idea" })], ["Change my password", "ph ph-key", () => this.openSheet({ k: "password" })], ["Sign out", "ph ph-sign-out", () => nggPortalSignOut(this.props.onSignOut)], ["Edit my profile", "ph ph-user", () => this.openSheet({ k: "profile" })], ["Take the tour again", "ph ph-compass", () => window.nggGuide("member")], ["Two-step sign-in", "ph ph-shield-check", () => window.nggMfa && window.nggMfa("manage")], ["Tell us about something", "ph ph-lifebuoy", () => this.go("help")],
      simple ? ["Switch to the full view", "ph ph-squares-four", () => this.setView("full")] : ["Switch to the simple view", "ph ph-hand-pointing", () => this.setView("simple")]]
      .filter(a => !(simple && /parent to pay/.test(a[0])));
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
    const unread = n.filter(x => !mp9NotifRead(x, s)).length;
    return {
      notifOpen: !!s.notif, notifLegacy: false,
      toggleNotif: e => { if (!s.notif) this._notifFrom = e && e.currentTarget; this.setState({ notif: !s.notif }); if (!s.notif) this.load("notifs"); },
      closeNotif: () => this.setState({ notif: false }),
      unread, hasUnread: unread > 0,
    };
  },

  /* The notification panel (Mp9Notifications). Read, unread and dismissed are
     the member's own marks on the server (notification_state); the panel
     shows them at once and saves behind, and puts the item back if the save
     fails rather than pretending. */
  notifPanel() {
    const s = this.state;
    if (!s.notif) return null;
    const PAGE = { mentor: "mentor", journal: "journal", community: "community", results: "results", dashboard: "today", learn: "learn", curriculum: "learn", money: "money", account: "money", records: "records", events: "learn", timetable: "timetable", support: "support" };
    const close = () => { this.setState({ notif: false }); const t = this._notifFrom; if (t && t.focus) setTimeout(() => t.focus(), 0); };
    const mark = (x, read) => {
      this.setState(st => ({ readIds: { ...(st.readIds || {}), [x.notifId]: read ? 1 : -1 } }));
      return NGGApi.member.markRead(x.notifId, !read).catch(() => this.setState(st => ({ readIds: { ...(st.readIds || {}), [x.notifId]: read ? -1 : 1 } })));
    };
    return <Mp9Notifications
      items={((this.dd("notifs") || {}).notifications || []).filter(x => !(s.goneIds || {})[x.notifId])}
      loading={!!(s.ld || {}).notifs && !this.dd("notifs")} error={(s.er || {}).notifs && !this.dd("notifs")}
      retry={() => this.load("notifs")} isRead={x => mp9NotifRead(x, s)} unreadOnly={!!s.nUnread} setUnreadOnly={v => this.setState({ nUnread: v })}
      narrow={this.state.w < 760} onClose={close}
      onAct={x => { if (!mp9NotifRead(x, s)) mark(x, true); this.setState({ notif: false }); const a = x.action || {}, to = PAGE[a.page];
        if (to === "support" && a.ref) { try { history.pushState({ page: "dashboard" }, "", "/dashboard/support?case=" + encodeURIComponent(a.ref)); } catch (_) {} this.setState({ scr: "support" }); return; }
        if (to) this.go(to); }}
      onToggleRead={x => mark(x, !mp9NotifRead(x, s))}
      onAllRead={() => {
        const left = ((this.dd("notifs") || {}).notifications || []).filter(x => !mp9NotifRead(x, s));
        const ids = {}; left.forEach(x => { ids[x.notifId] = 1; });
        this.setState(st => ({ readIds: { ...(st.readIds || {}), ...ids } }));
        NGGApi.member.markAllRead().catch(() => this.load("notifs"));
      }}
      onDismiss={x => {
        this.setState(st => ({ goneIds: { ...(st.goneIds || {}), [x.notifId]: 1 }, notifGone: x }));
        NGGApi.member.dismissNotif(x.notifId).catch(() => this.setState(st => ({ goneIds: { ...(st.goneIds || {}), [x.notifId]: 0 }, notifGone: null })));
      }}
      gone={s.notifGone}
      onUndoDismiss={x => { this.setState(st => ({ goneIds: { ...(st.goneIds || {}), [x.notifId]: 0 }, notifGone: null })); NGGApi.member.dismissNotif(x.notifId, true).catch(() => {}); }}/>;
  },

  /* Today, under the greeting: the record drive when it is asking, then the
     banner (level, XP, streak and the ONE next thing to do), then the simple
     view's big buttons. In the design's column, so it lines up with the cards. */
  todaySlot() {
    const s = this.state, rec = this.props.rec;
    if (s.scr !== "today" || !this.dd("today")) return null;
    return <>
      {rec && rec.asked && typeof RecordDrive === "function" ? <div className="m9x-rec"><RecordDrive status={rec} onSaved={this.props.onRecSaved}/></div> : null}
      {this.startCard()}
      {this.hero()}
      {this.simple() ? this.simpleTiles() : null}
    </>;
  },
  /* Getting started: the first things a new member does, each read from the
     record (never a ticked box), each with one button. It is gone once every
     step is done, so it never nags someone who has settled in. */
  startSteps() {
    const me = this.me(), c = this.dd("chat") || {}, jm = this.dd("jm") || {}, cir = this.dd("circle"), t = this.dd("today") || {}, M = this.mentorInfo();
    const wrote = ((jm.stats || {}).entries || 0) > 0 || (jm.entries || []).some(e => (e.body || "").trim());
    const linked = cir ? (cir.family || cir.links || []).length > 0 : null;
    return [
      { k: "photo", t: "Add your photo", s: "It goes on your NGG card and your profile, once the desk has checked it.", done: !!me.hasPhoto || (((this.dd("phc") || {}).request || {}).status === "pending"), cta: "Add a photo", go: () => this.openSheet({ k: "profile" }) },
      { k: "hello", t: M.has ? "Say hello to " + M.first : "Meet your mentor", s: M.has ? "Send your first message. They usually reply within a day." : "Your centre matches you with a mentor. We’ll tell you when.",
        done: (c.messages || []).some(m => m.mine), wait: !M.has, cta: "Write a message", go: () => this.go("mentor") },
      { k: "journal", t: "Write your first reflection", s: "One line is enough. It starts your streak.", done: wrote, cta: "Write it", href: MP9_JOURNAL_URL + "?write=1" },
      { k: "checkin", t: "Answer this week’s check-in", s: "How you’re doing, in one tap, on this page.", done: !!(t.checkin && t.checkin.done), cta: "Answer it", go: () => {
        const el = document.querySelector('.m9-app main [role="radiogroup"][aria-label="How are you doing"]'); if (el) { el.scrollIntoView({ block: "center" }); const b = el.querySelector("button"); if (b) b.focus(); } } },
      { k: "family", t: "Link a parent or guardian", s: "Give them your Anchor Circle code so they can follow your progress.", done: linked === true, unknown: linked === null, cta: "Get my code", go: () => this.go("me") },
    ].filter(x => !x.unknown || !x.done);
  },
  startCard() {
    if (this.st("mp9.startHidden", false)) return null;
    const steps = this.startSteps(), done = steps.filter(x => x.done).length;
    if (!steps.length || done === steps.length) return null;
    return <section className="m9x-start" aria-labelledby="m9x-start-h">
      <div className="m9x-start-top">
        <h2 id="m9x-start-h" className="m9x-start-h">Getting started</h2>
        <span className="m9x-start-n" aria-live="polite">{done} of {steps.length} done</span>
      </div>
      <div className="m9x-start-bar" role="progressbar" aria-label="Getting started" aria-valuemin="0" aria-valuemax={steps.length} aria-valuenow={done}><span style={{ width: Math.round(done / steps.length * 100) + "%" }}/></div>
      <ol className="m9x-start-list">{steps.map(x => <li key={x.k} className={"m9x-start-i" + (x.done ? " is-done" : "")}>
        <i className={x.done ? "ph-fill ph-check-circle" : x.wait ? "ph ph-hourglass-medium" : "ph ph-circle"} aria-hidden="true"/>
        <span className="m9x-start-tx"><b>{x.t}</b><span>{x.done ? "Done" : x.s}</span></span>
        {x.done || x.wait ? null : x.href ? <a className="m9x-start-go" href={x.href}>{x.cta}</a> : <button type="button" className="m9x-start-go" onClick={x.go}>{x.cta}</button>}
      </li>)}</ol>
      <button type="button" className="m9x-start-hide" onClick={() => this.saveSt("mp9.startHidden", true)}>Hide this list</button>
    </section>;
  },
  hero() {
    const t = this.dd("today") || {}, mom = (this.dd("mom") || {}).momentum || null, stats = (this.dd("dash") || {}).stats || {};
    const LEVELS = ["Seedling", "Sprout", "Sapling", "Rooted", "Vanguard"];
    const level = (mom && mom.level) || stats.level || 1, name = (mom && mom.levelName) || LEVELS[Math.min(4, level - 1)];
    const xp = mom ? mom.xp : 0, toNext = mom ? mom.xpToNext : 250, span = xp + toNext || 250, pct = level >= 5 ? 100 : Math.round(xp / span * 100);
    const streak = (mom && mom.streak) || stats.streak || 0;
    const first = (t.todo || [])[0] || null;
    const scrOf = x => MP9_ROUTE[x.route] || (/results/.test(x.route) ? "results" : /money|account/.test(x.route) ? "money" : /learn/.test(x.route) ? "learn" : /mentor/.test(x.route) ? "mentor" : "today");
    const nudge = mom && mom.nudges && mom.nudges[0] ? mom.nudges[0].text : "";
    const left = (t.todo || []).length;
    const jm = this.dd("jm") || {}, wrote = !!(jm.todayEntry && ((jm.todayEntry.body || "").trim() || (jm.todayEntry.title || "").trim()));
    return <section className="m9x-hero" aria-labelledby="m9x-hero-h">
      <div className="m9x-hero-top">
        <span className="m9x-hero-lvl"><i className="ph-fill ph-plant" aria-hidden="true"/>Level {level} · {name}</span>
        <span className={"m9x-hero-streak" + (streak ? " is-on" : "")}><i className="ph-fill ph-fire" aria-hidden="true"/>{streak ? streak + "-day streak" : "Start a streak today"}</span>
      </div>
      <div className="m9x-hero-xp">
        <div className="m9x-hero-bar" role="progressbar" aria-label="Progress to the next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><span style={{ width: pct + "%" }}/></div>
        <span className="m9x-hero-xpt">{level >= 5 ? "Top level. You’re a Vanguard." : toNext + " XP to " + LEVELS[Math.min(4, level)]}</span>
      </div>
      {first ? <div className="m9x-hero-next">
        <span className="m9x-hero-eyebrow" id="m9x-hero-h">Your next step{left > 1 ? " · " + left + " things to do" : ""}</span>
        <b className="m9x-hero-t">{first.title}</b>
        {first.subtitle ? <span className="m9x-hero-s">{first.subtitle}</span> : null}
        <button type="button" className="m9x-hero-go" onClick={() => this.go(scrOf(first))}>{first.cta || "Start"}<i className="ph ph-arrow-right" aria-hidden="true"/></button>
      </div> : <div className="m9x-hero-next is-done">
        <span className="m9x-hero-eyebrow" id="m9x-hero-h">All caught up</span>
        <b className="m9x-hero-t">Nothing waiting for you. Nice work.</b>
        {nudge ? <span className="m9x-hero-s">{nudge}</span> : null}
        {(() => { const nx = this.startSteps().find(x => !x.done && !x.wait);
          return nx ? (nx.href ? <a className="m9x-hero-go" href={nx.href}>{nx.t}<i className="ph ph-arrow-right" aria-hidden="true"/></a> : <button type="button" className="m9x-hero-go" onClick={nx.go}>{nx.t}<i className="ph ph-arrow-right" aria-hidden="true"/></button>)
            : <button type="button" className="m9x-hero-go" onClick={() => this.go("tools")}>Practise something<i className="ph ph-arrow-right" aria-hidden="true"/></button>; })()}
      </div>}
      {/* The journal, one tap from Today, in the same tab (a new tab on Android loses the portal). */}
      {wrote ? <a className="m9x-hero-j is-done" href={MP9_JOURNAL_URL}><i className="ph-fill ph-check-circle" aria-hidden="true"/>You wrote in your journal today · open it</a>
        : <a className="m9x-hero-j" href={MP9_JOURNAL_URL + "?write=1"}><i className="ph-fill ph-notebook" aria-hidden="true"/>Write today’s reflection<i className="ph ph-arrow-right" aria-hidden="true"/></a>}
    </section>;
  },
  /* The Journal screen: today's prompt, a same-tab way in, and the member's
     own recent entries — private or shared — with the mentor's replies under
     the shared ones. One timeline: the portal and the app write one table. */
  journalVals() {
    const jm = this.dd("jm") || {}, c = this.dd("chat") || {}, M = this.mentorInfo();
    const rep = {};
    (c.messages || []).forEach(m => { if (!m.mine && m.entryId) (rep[m.entryId] = rep[m.entryId] || []).push({ from: m.from, t: m.body, when: mp9When(m.at) }); });
    const ent = (jm.entries || []).filter(e => (e.body || "").trim() || (e.title || "").trim()).slice(0, 6).map(e => {
      const shared = e.visibility === "mentor", rs = rep[e.entryId] || [];
      return { t: e.title || e.excerpt || "", when: mp9Date(e.occurredOn || e.createdAt, { weekday: "short", day: "numeric", month: "short" }),
        visIcon: shared ? "ph-fill ph-users" : "ph-fill ph-lock-simple", visL: shared ? "Shared with " + M.first + (rs.length ? "" : " · waiting for a reply") : "You and " + M.first,
        replies: rs, hasReplies: rs.length > 0 };
    });
    const jp = jm.prompt || "What did you try today that you couldn’t do last month?";
    return { jRead: () => this.speak(jp, "jprompt"), jReadL: this.state.speaking === "jprompt" ? "Stop reading" : "Read aloud", canReadJ: this.canSpeak(),
      jPrompt: jp, jWrite: MP9_JOURNAL_URL + "?write=1", jEntries: ent, hasJEntries: ent.length > 0, noJEntries: !ent.length,
      jStreak: (jm.stats || {}).streak ? jm.stats.streak + "-day streak" : "", hasJStreak: !!(jm.stats || {}).streak };
  },
  simpleTiles() {
    const first = this.me().first;
    return <nav className="m9x-kid" aria-label="Where do you want to go?">
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
    const view = s.scr === "me" ? <>{typeof RclProgress === "function" ? <RclProgress who="member"/> : null}{typeof Mp9Wifi === "function" ? <Mp9Wifi toast={t => this.toast(t)}/> : null}{typeof Mp9VolWallet === "function" ? <Mp9VolWallet/> : null}{this.viewSwitch()}</> : null;
    return handEl || view ? <>{view}{rest}{handEl}</> : rest;
  },
  slotEndInner() {
    const s = this.state;
    /* Support cases (support-desk.jsx): the open case lives in the URL
       (/dashboard/support?case=N), which is where a reply's email points. */
    if (s.scr === "support" && typeof NggSupportDesk === "function") {
      const q = new URLSearchParams(location.search), no = Number(q.get("case")) || 0;
      return <div className="m9x-slot"><NggSupportDesk api={NGGApi.member.support} initialCase={no} source="portal"
        safeguard={{ text: "Tell " + this.sgInfo().name + " instead", onClick: () => this.go("help") }}
        onCase={n => { try { history.replaceState(history.state, "", "/dashboard/support" + (n ? "?case=" + n : "")); } catch (_) {} }}/></div>;
    }
    if (s.scr === "money") return <div className="m9x-slot"><Mp9AskParent toast={t => this.toast(t)} focus={!!s.askFocus} onFocused={() => this.setState({ askFocus: false })}/></div>;
    if (s.scr === "learn" && typeof CurStudyHelper === "function" && ((this.dd("cur") || {}).units || []).length)
      return <div className="m9x-slot"><CurStudyHelper units={(this.dd("cur") || {}).units}/></div>;
    const evals = (s.scr === "growth" || s.scr === "sat")
      ? <Mp9Evals data={this.dd("evals")} err={s.er.evals} busy={!!s.ld.evals} retry={() => this.load("evals")} latestOnly={s.scr === "sat"} mentor={this.mentorInfo().first}/> : null;
    // The formation day is the staff-edited schedule with the member's own part (tests/mentor-v15); it sits in the column.
    if (s.scr === "sat" && typeof FormationDay === "function") return <div className="m9x-slot"><FormationDay audience="member" centre={this.me().centre || ""} compact={true}/>{evals}</div>;
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
    /* What follows the design's column (study helper, evaluations, the view
       switch) is laid out IN that column: same width, same side padding. It
       used to sit outside it, full-bleed against the screen edge, and read as
       something left on the page by mistake. */
    const endEl = this.slotEnd();
    const end = endEl ? <div className={"m9x-end" + (narrow ? " is-narrow" : "")}>{endEl}</div> : null;
    const vals = Object.assign({
      // The Mentor chat is a messaging screen: wider, with its side panel. Everything else keeps the reading column.
      colW: cur === "mentor" && (s.mvTab || "chat") === "chat" && wide ? "1180px" : "880px",
      rootRef: this.rootRef, narrow, wide, outerPad: "0", frameW: "100%", frameH: "100%", frameR: "0", frameSh: "none",
      mainPad: narrow ? (end ? "16px 16px 0" : "16px 16px 28px") : (end ? "32px 40px 0" : "32px 40px 56px"), toastBottom: narrow ? "92px" : "24px",
      greeting: "Good " + mp9Greeting() + ", " + me.first,
      me: { ...me, name: me.name || "…" }, mentor: { name: M.name, first: M.first, initials: M.initials, role: M.role, months: mine.mentor && mine.mentor.since ? Math.max(1, Math.round((Date.now() - new Date(mine.mentor.since + "T12:00:00Z")) / (30.4 * 864e5))) : 1, since: mine.mentor && mine.mentor.since ? mp9Date(mine.mentor.since, { month: "long", year: "numeric" }) : "this session", next: this.satDate() ? mp9Date(this.satDate(), { weekday: "short", day: "numeric", month: "short" }) + " · 8:30 at the centre" : "Saturday at the centre" },
      sessEnds: me.sessEnds,
      lastMsg: last ? "“" + last.body.slice(0, 140) + "”" : M.has ? "No message yet. Say hello." : "A mentor is matched to you by your centre.",
      kpis: [["Session", sess ? sess.name + " · week " + sess.weekOf + " of " + sess.totalWeeks : "Between sessions"], ["Level", "Level " + (stats.level || 1) + (((this.dd("mom") || {}).momentum || {}).levelName ? " · " + this.dd("mom").momentum.levelName : "")], ["Streak", (stats.streak || 0) + (stats.streak === 1 ? " day" : " days")]].map(([k, v]) => ({ k, v, fg: "#0b0b0c" })),
      takeTour: () => { if (typeof window.nggGuide === "function") window.nggGuide("member"); else this.toast("The tour isn’t available right now."); },
      showStart: () => { this.saveSt("mp9.startHidden", false); this.go("today"); },
      signOutMe: () => nggPortalSignOut(this.props.onSignOut), goMore: go("more"), onMoreCur: cur === "more" ? "page" : undefined,
      goHelp: go("help"), goSat: go("sat"), goMentor: go("mentor"), goGrowth: go("growth"), goOpps: go(this.older() ? "opps" : "sat"), goJournal: go("journal"), goMe: go("me"), goLearn: go("learn"),
      goMoney: go("money"), goRecords: go("records"), goTimetable: go("timetable"), goCompanion: go("companion"), goResults: go("results"), goLearnT: go("learn"),
      onToday: cur === "today", onMentor: cur === "mentor", onGrowth: cur === "growth", onResults: cur === "results", onSat: cur === "sat", onJournal: cur === "journal", onOpps: cur === "opps", onCommunity: cur === "community", onPassport: cur === "passport", onHelp: cur === "help", onMore: cur === "more",
      onLearn: cur === "learn", onMe: cur === "me", onTimetable: cur === "timetable", onCompanion: cur === "companion", onMoney: cur === "money", onRecords: cur === "records",
      ntRight: narrow ? "8px" : "24px", ntLeft: narrow ? "8px" : "auto", ntTop: narrow ? "60px" : "84px", ntW: narrow ? "auto" : "380px",
      moreList: [], jUrl: "/journal/",
      jRules: [["ph ph-lock-simple", "Private entries", "stay yours. Nobody at NGG can read them."], ["ph ph-handshake", "Shared entries", "go to " + M.first + ", who replies within a week."], ["ph ph-shield-check", "If you write about harm or danger,", "the safeguarding officer is told so you get help quickly."]].map(([icon, k, tt]) => ({ icon, k, t: tt })),
      shares: [], entries: [], ...this.journalVals(),
      stLoading: coreLoading, stError: coreErr, stOut: false, stOverlay: coreLoading || coreErr, perks: [],
      retry: () => { this.setState({ er: {} }); MP9_CORE.forEach(k => this.load(k)); }, signIn: () => {},
      toastOn: !!s.toast, toastText: s.toast ? s.toast.text : "", toastUndo: !!(s.toast && s.toast.undo), toastUndoFn: () => { s.toast && s.toast.undo && s.toast.undo(); this.setState({ toast: null }); },
      sys: this.sysVals(), st: this.standingVals(go), gt: this.subTabs("gtab", [["score", "Scorecard", "ph ph-chart-line-up"], ["week", "This week", "ph ph-list-checks"], ["well", "Wellness", "ph ph-heartbeat"], ["journey", "Journey", "ph ph-path"]]),
      mainSlot: this.slot(), mainSlotEnd: end, todaySlot: this.todaySlot(),
    },
      this.accVals(), this.todayVals(go), this.liVals(go), this.growVals(go), this.wellVals(), this.qlineVals(), this.journeyVals(), this.momentumVals(),
      { mv: this.mentorVals(go) }, this.chatVals(),
      this.learnVals(go), this.compVals(go), this.moneyVals(go), this.recordsVals(), this.meVals(), this.feedVals(), this.assignedVals(), this.projectVals(), this.passportVals(),
      this.satVals(go), this.rsVals(go), this.oppsVals(), this.helpVals(), this.sheetVals(go), this.navVals(), this.notifVals());
    vals.li = Object.assign({}, vals.li, { tot: tot === null ? "–" : tot, delta: tot === null ? vals.li.delta : prevT === null ? "First month scored" : (tot - prevT > 0 ? "+" : "") + (tot - prevT) + " since last month" });
    return vals;
  },
  render() {
    const dutyGo = d => { const scr = MP9_ROUTE[d.route] || (/results/.test(d.route) ? "results" : /money|account/.test(d.route) ? "money" : /learn/.test(d.route) ? "learn" : /mentor/.test(d.route) ? "mentor" : "today"); this.go(scr); return true; };
    const pv = this.state.pdfView;
    return <>{Mp9View(this.renderVals())}{this.notifPanel()}<GuideTour portal="member" name={this.me().first}/><DutyPopup role="member" onGo={dutyGo}/>
      {pv ? <NggPdf open src={pv.src} name={pv.name} onClose={() => this.setState({ pdfView: null })}/> : null}</>;
  },
});

/** A lesson file, from this site (api/member/lesson-file.php). */

function mp9Greeting() { const h = new Date().getHours(); return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; }

/* The member's own Saturday evaluations (member.saturday.evals): each
   criterion on the growth scale, the strength their mentor saw and one next
   step. The ratings and the mentor's staff note never reach this screen. */
const MP9_EVAL_TONE = { "Not yet": "is-0", "Emerging": "is-1", "Demonstrated": "is-2", "Strong": "is-3" };
/* Me → Wi-Fi (domain/wifi.php): the member's sign-in name, and a Wi-Fi
   password they choose here and type twice. It is never shown back, so this
   screen holds nothing a person behind them could read. The routers let this
   app open before a phone has signed in to the Wi-Fi, so a first-timer sets
   their password on the spot. Three changes a day; loading, an honest error
   with a retry, and the state where the centre has no Wi-Fi yet are all said. */
function mp9WifiProblem(a, b, username) {
  if (a.length < 8) return "Use at least 8 characters.";
  if (a.length > 64) return "Use at most 64 characters.";
  if (/\s/.test(a)) return "Leave out spaces.";
  if (a.indexOf(";") !== -1) return "A semicolon (;) can’t be used in a Wi-Fi password.";
  if (username && a.toLowerCase() === String(username).toLowerCase()) return "Your password can’t be your sign-in name.";
  if (a !== b) return "The two passwords are not the same.";
  return "";
}
function Mp9Wifi({ toast }) {
  const [d, setD] = React.useState(null), [err, setErr] = React.useState(""), [busy, setBusy] = React.useState(false);
  const [pw, setPw] = React.useState(""), [pw2, setPw2] = React.useState(""), [show, setShow] = React.useState(false), [bad, setBad] = React.useState("");
  const load = () => { setErr(""); NGGApi.member.wifi().then(r => setD(r.wifi || null)).catch(e => setErr((e && (e.code || e.message)) || "error")); };
  React.useEffect(load, []);
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const why = mp9WifiProblem(pw, pw2, d && d.username);
    if (why) { setBad(why); return; }
    setBad(""); setBusy(true);
    try { const r = await NGGApi.member.wifiPassword(pw); setD(r.wifi); setPw(""); setPw2(""); setShow(false); toast("Saved. Your password works on the centre’s Wi-Fi within a few minutes."); }
    catch (e2) { setBad((e2 && e2.data && e2.data.message) || "Your password wasn’t saved. Try again."); }
    finally { setBusy(false); }
  };
  const copy = t => { try { navigator.clipboard.writeText(t); toast("Copied"); } catch (_) { toast("Couldn’t copy. Write it down instead."); } };
  const on = d && d.access !== "off";
  const lim = d && d.limits;
  /* What they have used, against their allowance (domain/wifi-usage.php). Only
     they and the staff see it. Over an allowance, say what happens and until when. */
  const u = d && d.usage, gb = b => { b = +b || 0; return b >= 1073741824 ? (Math.round(b / 107374182.4) / 10) + " GB" : b >= 1048576 ? Math.round(b / 1048576) + " MB" : b > 0 ? Math.max(1, Math.round(b / 1024)) + " KB" : "nothing yet"; };
  const overWhen = u && u.over === "day" ? "until tomorrow" : "until the 1st of next month";
  const meter = (used, mb, label) => { const cap = mb * 1048576, pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 0;
    return <div className="m9x-wifi-use"><span className="m9x-wifi-use-l"><b>{label}</b>{gb(used)}{mb ? " of " + gb(cap) : ""}</span>
      {mb ? <span className="m9x-wifi-meter" role="meter" aria-label={label + " used"} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct} aria-valuetext={pct + "%"}><i className={pct >= 100 ? "is-full" : pct >= 80 ? "is-near" : ""} style={{ width: pct + "%" }}/></span> : null}</div>; };
  const usage = u ? <div className="m9x-wifi-usage" aria-labelledby="m9x-wifi-u-h">
    <h3 id="m9x-wifi-u-h" className="m9x-wifi-u-h">Data you’ve used</h3>
    {meter(u.today, u.dayMb, "Today")}
    {meter(u.month, u.monthMb, "This month")}
    <p className="m9x-wifi-note">{u.over ? "You’ve used " + (u.over === "day" ? "today’s" : "this month’s") + " allowance" + (d.case !== "overLimit" ? "." : ", so " + (d.access === "off" ? "the Wi-Fi is off for you " : "your Wi-Fi is slower ") + overWhen + ".")
      : u.dayMb || u.monthMb ? "When you reach an allowance your Wi-Fi slows down until it resets. Only you and the NGG team see these figures."
      : "Only you and the NGG team see these figures. They count what you download and upload, never which sites."}</p>
  </div> : null;
  const set = d && d.hasPassword;
  /* The starting password CACENTRE made: shown until they choose their own,
     which they may, or never need to. */
  const start = d && d.startCode;
  return <section className="m9x-slot m9x-view m9x-wifi" aria-labelledby="m9x-wifi-h">
    <h2 id="m9x-wifi-h" className="m9x-view-h"><i className="ph ph-wifi-high" aria-hidden="true"/> Wi-Fi at the centre</h2>
    {err ? <div className="m9x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>{err === "cacentre_unreachable" ? "CACENTRE, which runs the Wi-Fi, couldn’t be reached just now." : "Your Wi-Fi details couldn’t load (" + err + ")."}</span><button type="button" onClick={load}>Try again</button></div>
      : !d ? <div className="m9x-load" role="status" aria-live="polite"><span className="m9x-bar"/><span className="m9x-sr">Loading</span></div>
      : !on ? <>{d.case === "overLimit" ? <p className="m9x-view-p">You’ve used your Wi-Fi data allowance, so the Wi-Fi is off for you {overWhen}.</p>
        : <p className="m9x-view-p">{d.case === "no_id" ? "You get Wi-Fi once your NGG ID number is printed." : d.case === "not_listed" ? "You aren’t on the Wi-Fi list yet." : "You don’t have Wi-Fi access right now" + (d.why ? ": " + d.why.toLowerCase() + "." : ".")} Ask the team at your centre if you think this is wrong.</p>}{usage}</>
      : <>
        {start ? <p className="m9x-view-p m9x-wifi-first">Join the centre’s Wi-Fi and, when the sign-in page opens, use your username and the starting password below. You can keep it, or choose your own.</p>
          : !set ? <p className="m9x-view-p m9x-wifi-first">Choose a Wi-Fi password below. Then join the centre’s Wi-Fi and, when the sign-in page opens, use your username and this password.</p>
          : !d.centreHasWifi ? <p className="m9x-view-p">Wi-Fi isn’t set up at your centre yet. Your details will work as soon as it is.</p>
          : <p className="m9x-view-p">Join the centre’s Wi-Fi, and when the sign-in page opens, use your username and the password you set.{d.access === "limited" ? " Your access is limited for now" + (d.why ? " (" + d.why.toLowerCase() + ")" : "") + "." : ""}</p>}
        <dl className="m9x-wifi-dl">
          <div><dt>Username</dt><dd className="m9x-wifi-v">{d.username}<button type="button" className="m9x-wifi-b" onClick={() => copy(d.username)} aria-label="Copy your Wi-Fi username"><i className="ph ph-copy" aria-hidden="true"/></button></dd></div>
          {start ? <div><dt>Starting password</dt><dd className="m9x-wifi-v">{d.startCode}<button type="button" className="m9x-wifi-b" onClick={() => copy(d.startCode)} aria-label="Copy your starting password"><i className="ph ph-copy" aria-hidden="true"/></button></dd></div>
            : <div><dt>Password</dt><dd>{set ? "Your own, set" + (d.pinSetAt ? " on " + mp9Date(d.pinSetAt) : "") : "Not set yet"}</dd></div>}
          {lim ? <div><dt>Speed</dt><dd>Up to {lim.down} Mbit/s · {lim.devices === 1 ? "one device" : lim.devices + " devices"} at a time{lim.hours ? " · " + lim.hours.replace("-", "–") : ""}</dd></div> : null}
        </dl>
        {usage}
        <form className="m9x-wifi-form" onSubmit={save} noValidate>
          <h3 className="m9x-wifi-u-h">{start ? "Choose your own password" : set ? "Change your Wi-Fi password" : "Set your Wi-Fi password"}</h3>
          <label className="m9x-wifi-lbl" htmlFor="m9x-wifi-pw">Password
            <span className="m9x-wifi-field"><input id="m9x-wifi-pw" className="m9x-wifi-inp" type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)} minLength={8} maxLength={64} autoComplete="new-password" required aria-describedby="m9x-wifi-rules"/>
              <button type="button" className="m9x-wifi-b" onClick={() => setShow(x => !x)} aria-pressed={show ? "true" : "false"} aria-label={show ? "Hide what you typed" : "Show what you typed"}><i className={"ph " + (show ? "ph-eye-slash" : "ph-eye")} aria-hidden="true"/></button></span></label>
          <label className="m9x-wifi-lbl" htmlFor="m9x-wifi-pw2">Type it again
            <input id="m9x-wifi-pw2" className="m9x-wifi-inp" type={show ? "text" : "password"} value={pw2} onChange={e => setPw2(e.target.value)} minLength={8} maxLength={64} autoComplete="new-password" required/></label>
          <p id="m9x-wifi-rules" className="m9x-wifi-note">At least 8 characters, no spaces or semicolons, and not your username. Use it only for the Wi-Fi and never tell anyone: anything done on the Wi-Fi with it counts as you.</p>
          {bad ? <p className="m9x-wifi-bad" role="alert">{bad}</p> : null}
          <div className="m9x-wifi-acts">
            <button type="submit" className="m9x-wifi-new" disabled={busy || d.resetsLeft < 1} aria-describedby="m9x-wifi-left">{busy ? "Saving…" : set && !start ? "Change password" : "Set password"}</button>
            <span id="m9x-wifi-left" className="m9x-wifi-left">{d.resetsLeft < 1 ? "You’ve changed it three times today. Try again tomorrow." : d.resetsLeft + (d.resetsLeft === 1 ? " change" : " changes") + " left today"}</span>
          </div>
        </form>
      </>}
  </section>;
}

/* ── Volunteer pay ─────────────────────────────────────────────────────────
   A member who volunteers with NGG sees what they have earned for each day
   they were present and active, each day they were not paid for and why, what
   has been paid and what fines each payment took off, and where they are paid
   (domain/volunteer-pay.php). Nothing is drawn for anybody who does not
   volunteer. */
function Mp9VolWallet() {
  const [w, setW] = React.useState(undefined), [err, setErr] = React.useState(false);
  const load = () => { setErr(false); NGGApi.member.volunteerPay().then(r => setW(r.wallet || null)).catch(() => setErr(true)); };
  React.useEffect(load, []);
  if (w === null) return null;
  const naira = n => "₦" + (+n || 0).toLocaleString("en-NG");
  const live = (w && w.payouts || []).filter(p => !p.void);
  return <section className="m9x-slot m9x-view m9x-vp" aria-labelledby="m9x-vp-h">
    <h2 id="m9x-vp-h" className="m9x-view-h"><i className="ph ph-wallet" aria-hidden="true"/> Volunteer pay</h2>
    {err ? <div className="m9x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>Your volunteer pay couldn’t load.</span><button type="button" onClick={load}>Try again</button></div>
      : w === undefined ? <div className="m9x-load" role="status" aria-live="polite"><span className="m9x-bar"/><span className="m9x-sr">Loading</span></div>
      : <>
        <p className="m9x-view-p">{w.on ? "You earn " + naira(w.rate) + " for each programme day you are present and active. It is paid " + w.frequencyText.toLowerCase() + ", after each period ends." : "Volunteer pay is paused. What you have already earned is kept."}
          {w.finesDeducted ? " Any fines you owe, NGG’s or Afrovanguard’s, come off a payment first." : ""}</p>
        <dl className="m9x-wifi-dl">
          <div><dt>Owed to you</dt><dd className="m9x-wifi-v">{naira(w.owed)}</dd></div>
          <div><dt>Earned in all</dt><dd>{naira(w.earned)} · {w.daysEarned === 1 ? "1 day" : w.daysEarned + " days"}</dd></div>
          <div><dt>Paid to you</dt><dd>{naira(w.paid)}</dd></div>
          {w.finesTaken > 0 ? <div><dt>Fines taken off</dt><dd>{naira(w.finesTaken)}</dd></div> : null}
          {w.finesDeducted && w.finesOwedNgg > 0 ? <div><dt>NGG fines owed</dt><dd>{naira(w.finesOwedNgg)}, taken off your next payment</dd></div> : null}
        </dl>
        <Mp9VolBank bank={w.bank} onSaved={load}/>
        {live.length ? <>
          <h3 className="m9x-wifi-u-h">Payments</h3>
          <ul className="m9x-vp-list" aria-label="Your payments">
            {live.slice(0, 12).map(p => <li key={p.payoutId} className="m9x-vp-day">
              <span className="m9x-vp-when">{p.period}</span>
              <span className="m9x-vp-what">{naira(p.amount)} paid{p.fineNgg + p.fineAv > 0 ? " · " + naira(p.gross) + " earned, " + naira(p.fineNgg + p.fineAv) + " for fines" : ""}{p.bankLine ? " · to " + p.bankLine : p.methodText ? " · " + p.methodText.toLowerCase() : ""}</span>
            </li>)}
          </ul>
        </> : null}
        <h3 className="m9x-wifi-u-h">Days</h3>
        {w.days.length ? <ul className="m9x-vp-list" aria-label="Your days">
          {w.days.slice(0, 30).map(x => <li key={x.day} className={"m9x-vp-day" + (x.status === "earned" ? "" : " is-out")}>
            <span className="m9x-vp-when">{mp9Date(x.day)}</span>
            <span className="m9x-vp-what">{x.status === "earned" ? naira(x.amount) + (x.paid ? " · paid" : "") : "Not paid: " + (x.override ? x.override.reason : x.reasonText.toLowerCase())}</span>
          </li>)}
        </ul> : <p className="m9x-wifi-note">No days yet. A day is counted once it is over.</p>}
      </>}
  </section>;
}

/* Where NGG pays them. Shown as the bank and the last four digits; the full
   number is typed, never shown back. Every change is told to them by email. */
function Mp9VolBank({ bank, onSaved }) {
  const b = bank || {};
  const [open, setOpen] = React.useState(false), [busy, setBusy] = React.useState(false), [bad, setBad] = React.useState(""), [done, setDone] = React.useState("");
  const [f, setF] = React.useState({ bankName: "", accountNumber: "", accountName: "" });
  const set = k => e => setF(x => Object.assign({}, x, { [k]: e.target.value }));
  const save = e => {
    e.preventDefault(); setBad(""); setDone("");
    if (!/^\d{10}$/.test(f.accountNumber.replace(/[\s-]/g, ""))) { setBad("An account number is 10 digits."); return; }
    setBusy(true);
    NGGApi.member.volunteerBank(f)
      .then(() => { setDone("Saved. We’ve emailed you to confirm the change."); setOpen(false); setF({ bankName: "", accountNumber: "", accountName: "" }); onSaved(); })
      .catch(er => setBad((er && er.data && er.data.message) || "That couldn’t be saved. Try again."))
      .finally(() => setBusy(false));
  };
  return <div className="m9x-vp-bank">
    <h3 className="m9x-wifi-u-h">Where we pay you</h3>
    <p className="m9x-wifi-note">{b.set ? b.bankName + " ••••" + b.last4 + " · " + b.accountName : "No bank details yet. Add them so NGG can pay you by transfer."}</p>
    {done ? <p className="m9x-wifi-note" role="status">{done}</p> : null}
    {!open ? <button type="button" className="m9x-wifi-new" onClick={() => setOpen(true)} aria-expanded="false">{b.set ? "Change bank details" : "Add bank details"}</button>
      : <form className="m9x-wifi-form" onSubmit={save} noValidate>
        <label className="m9x-wifi-lbl" htmlFor="m9x-vp-bank">Bank
          <input id="m9x-vp-bank" className="m9x-wifi-inp" value={f.bankName} onChange={set("bankName")} maxLength={80} autoComplete="off" required/></label>
        <label className="m9x-wifi-lbl" htmlFor="m9x-vp-acct">Account number
          <input id="m9x-vp-acct" className="m9x-wifi-inp" value={f.accountNumber} onChange={set("accountNumber")} inputMode="numeric" maxLength={13} autoComplete="off" required/></label>
        <label className="m9x-wifi-lbl" htmlFor="m9x-vp-name">Name on the account
          <input id="m9x-vp-name" className="m9x-wifi-inp" value={f.accountName} onChange={set("accountName")} maxLength={120} autoComplete="name" required/></label>
        {bad ? <p className="m9x-wifi-bad" role="alert">{bad}</p> : null}
        <div className="m9x-wifi-acts">
          <button type="submit" className="m9x-wifi-new" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="m9x-wifi-new" onClick={() => { setOpen(false); setBad(""); }}>Cancel</button>
        </div>
      </form>}
  </div>;
}

/* ── Ask my parent ─────────────────────────────────────────────────────────
   A member asks; the parent acts in the family account (member_family_nudge).
   Once a kind a day, to every connected parent. A child with no connected
   parent is told how to connect them, not shown a button that cannot act. */
function mp9FocusAsk() { const el = document.getElementById("m9x-ask-h"); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } }
function Mp9AskParent({ toast, focus, onFocused }) {
  const [d, setD] = React.useState(null), [err, setErr] = React.useState(""), [busy, setBusy] = React.useState(false);
  const load = () => { setErr(""); NGGApi.member.familyAsks().then(setD).catch(e => setErr(mp9Err(e))); };
  React.useEffect(load, []);
  React.useEffect(() => { if (focus && d) { mp9FocusAsk(); onFocused(); } }, [focus, d]);
  const ask = () => {
    if (busy) return;
    setBusy(true);
    NGGApi.member.askParent()
      .then(r => { toast(r.parents === 1 ? "Sent to your parent." : "Sent to your " + r.parents + " parents."); load(); })
      .catch(e => toast((e && e.detail) || mp9Err(e)))
      .finally(() => setBusy(false));
  };
  const a = d && d.asked;
  return <section className="m9x-view m9x-ask" aria-labelledby="m9x-ask-h">
    <h2 id="m9x-ask-h" className="m9x-view-h" tabIndex={-1}><i className="ph ph-hand-waving" aria-hidden="true"/> Ask my parent</h2>
    {err ? <div className="m9x-err" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>{err}</span><button type="button" onClick={load}>Try again</button></div>
      : !d ? <div className="m9x-load" role="status" aria-live="polite"><span className="m9x-bar"/><span className="m9x-sr">Loading</span></div>
      : !d.parents ? <p className="m9x-view-p">No parent is connected to your account yet. Give them the family code on your Me page, so they can connect at <b>/family</b> and pay from there.</p>
      : <>
        <p className="m9x-view-p">Your parent pays from their family account, or confirms a payment they already made. Ask them here, and they get a message and an email.</p>
        <button type="button" className="m9x-ask-b" onClick={ask} disabled={busy}>{busy ? "Sending…" : "Ask my parent"}</button>
        {a ? <span className="m9x-ask-when" role="status">{a.seen ? "They’ve seen it." : "Asked " + mp9Date(a.at, { day: "numeric", month: "short" }) + "."}</span> : null}
      </>}
  </section>;
}

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

/** The "Your photo" block on the profile sheet: the photo now, a chosen photo
 *  to send, or the ask waiting with the desk (and the last answer, if declined). */
function mp9PhotoAsk(app, me, s, set) {
  const r = (app.dd("phc") || {}).request || null, pending = !!r && r.status === "pending";
  const declined = !!r && r.status === "declined", draft = s.phDraft;
  const when = r ? mp9Date(String(r.requestedAt || "").slice(0, 10), { day: "numeric", month: "short" }) : "";
  return {
    cur: me.photo ? imgUrl(nggPhotoSrc(me.photo), "thumb") : "", hasCur: !!me.photo, noCur: !me.photo,
    line: pending ? "You asked for a new photo on " + when + ". The desk checks it, then it goes on your profile and your next ID card."
      : declined ? "The desk kept your photo" + (r.note ? ": " + r.note : ".") + " You can ask again with another photo."
      : r && r.status === "approved" ? "Your new photo was approved." : "To change it, choose the photo you want. The desk checks it first.",
    canPick: !pending && !draft, pickL: me.photo ? "Ask to change my photo" : "Send my photo",
    onPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; set({ phDraft: { busy: true, url: "", local: URL.createObjectURL(f) } });
      NGGApi.uploadOrInline(f, "headshot").then(u => set({ phDraft: { busy: false, url: u.url, local: (app.state.phDraft || {}).local || "" } }))
        .catch(er => { set({ phDraft: null }); app.toast(mp9Err(er)); }); },
    hasDraft: !!draft, draft: draft ? (draft.local || nggPhotoSrc(draft.url)) : "",
    reason: s.phReason || "", onReason: e => set({ phReason: e.target.value.slice(0, 300) }),
    busy: !draft || !!draft.busy || !draft.url, sendL: draft && draft.busy ? "Getting it ready…" : "Send to the desk", sendOp: !draft || draft.busy ? 0.5 : 1,
    send: () => { if (!draft || !draft.url) return; set({ phDraft: { ...draft, busy: true } });
      NGGApi.member.photoChange.ask(draft.url, s.phReason || "").then(() => { set({ phDraft: null, phReason: "" }); app.load("phc"); app.toast("Sent. The desk will check your photo."); })
        .catch(er => { set({ phDraft: { ...draft, busy: false } }); app.toast(er && (er.code || er.message) === "same_photo" ? "That’s the photo you have now." : mp9Err(er)); }); },
    cancel: () => set({ phDraft: null, phReason: "" }),
    isPending: pending, pendSrc: pending ? nggPhotoSrc(r.photoUrl) : "",
    withdraw: () => NGGApi.member.photoChange.withdraw().then(() => { app.load("phc"); app.toast("Withdrawn. Your photo stays as it is."); }).catch(er => app.toast(mp9Err(er))),
  };
}

/** A school subject as a person writes it: report cards print "BASIC TECHNOLOGY". */
function mp9Subject(x) {
  const t = String(x || "").trim();
  if (t !== t.toUpperCase() || !/[A-Z]{3}/.test(t)) return t;
  return t.toLowerCase().replace(/\b([a-z])([a-z]*)/g, (m, a, b) => (["and", "of", "the", "in"].includes(a + b) ? a + b : a.toUpperCase() + b)).replace(/^./, c => c.toUpperCase());
}

/* When a plan's study happens, picked rather than typed: days, a time, a
   place. Typed, it came out as "When I am at school and in school when I have
   free period", which nobody could plan around. Stored as one readable line
   ("Mon, Wed, Fri · after school · at home") that reads back into the picks;
   the number of days is the sessions a week. */
const MP9_PLAN_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MP9_PLAN_TIMES = ["before school", "in a free period at school", "after school", "in the evening", "at the weekend"];
const MP9_PLAN_PLACES = ["at home", "at school", "in a library", "at the NGG centre"];
function mp9WhenParse(ww) {
  const t = String(ww || "");
  return { days: MP9_PLAN_DAYS.filter(d => new RegExp("\\b" + d + "\\b").test(t)), time: MP9_PLAN_TIMES.find(x => t.includes(x)) || "", place: MP9_PLAN_PLACES.find(x => t.includes(x)) || "" };
}
function mp9WhenLine(w) { return [w.days.join(", "), w.time, w.place].filter(Boolean).join(" · "); }
function mp9WhenOk(ww) { const w = mp9WhenParse(ww); return w.days.length > 0 && !!w.time; }
function mp9PlanWhen(x, upd, tried) {
  const w = mp9WhenParse(x.whenWhere), bad = tried && !mp9WhenOk(x.whenWhere);
  const put = nw => upd(Object.assign({ whenWhere: mp9WhenLine(nw) }, nw.days.length ? { sessionsPerWeek: nw.days.length } : {}));
  return {
    whenBd: bad ? "#b0361c" : "#d6d4cc",
    days: MP9_PLAN_DAYS.map(d => { const on = w.days.includes(d); return { l: d, on: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c",
      go: () => put({ ...w, days: on ? w.days.filter(z => z !== d) : MP9_PLAN_DAYS.filter(z => z === d || w.days.includes(z)) }) }; }),
    time: w.time, onTime: e => put({ ...w, time: e.target.value }), times: [{ v: "", l: "What time?" }].concat(MP9_PLAN_TIMES.map(v => ({ v, l: v.charAt(0).toUpperCase() + v.slice(1) }))),
    place: w.place, onPlace: e => put({ ...w, place: e.target.value }), places: [{ v: "", l: "Where?" }].concat(MP9_PLAN_PLACES.map(v => ({ v, l: v.charAt(0).toUpperCase() + v.slice(1) }))),
    whenSay: mp9WhenOk(x.whenWhere) ? "Your plan: " + mp9WhenLine(w) + ". A set time and place makes you far more likely to do it."
      : String(x.whenWhere || "").trim() && !w.days.length ? "You wrote: “" + x.whenWhere + "”. Pick the days and a time instead." : "Pick the days and a time. A set time and place makes you far more likely to do it.",
  };
}

/** Read, by the member's mark on this screen first, then the server's. */
function mp9NotifRead(x, s) { const m = ((s || {}).readIds || {})[x.notifId]; return m === 1 ? true : m === -1 ? false : !!x.readAt; }

function mp9NotifIcon(kind) {
  return /mentor|chat/.test(kind) ? "chat-circle-text" : /badge|award|mission/.test(kind) ? "medal" : /event/.test(kind) ? "calendar-check"
    : /formation|timetable/.test(kind) ? "clock" : /duty/.test(kind) ? "list-checks" : /curriculum|assign/.test(kind) ? "book-open-text"
    : /safeguard/.test(kind) ? "shield-check" : /fee|money/.test(kind) ? "wallet" : "bell";
}
/** Today · Yesterday · This week · Earlier, by the device's own calendar. */
function mp9NotifGroup(iso) {
  const d = new Date(iso); if (isNaN(d)) return "Earlier";
  const day = x => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y.getTime(); };
  const diff = Math.round((day(Date.now()) - day(d)) / 864e5);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "This week" : "Earlier";
}

/**
 * The member's notifications: what happened, and the one thing to do about
 * it. Every item that goes somewhere has a named action; each can be marked
 * read or unread and dismissed (with undo). A dialog: Escape closes and focus
 * goes back to the bell; Tab stays inside.
 */
function Mp9Notifications({ items, loading, error, retry, isRead, unreadOnly, setUnreadOnly, narrow, onClose, onAct, onToggleRead, onAllRead, onDismiss, gone, onUndoDismiss }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current; if (el) { const f = el.querySelector("[data-autofocus]") || el; f.focus(); }
    const key = e => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const f = Array.from(ref.current.querySelectorAll("button:not([disabled])")); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const unread = items.filter(x => !isRead(x)).length;
  const shown = unreadOnly ? items.filter(x => !isRead(x)) : items;
  const groups = [];
  shown.slice(0, 50).forEach(x => { const g = mp9NotifGroup(x.createdAt); let last = groups[groups.length - 1]; if (!last || last.g !== g) { last = { g, items: [] }; groups.push(last); } last.items.push(x); });
  return <>
    <div className="m9n-scrim" onClick={onClose} aria-hidden="true"/>
    <div ref={ref} className={"m9n-panel" + (narrow ? " is-narrow" : "")} role="dialog" aria-modal="true" aria-labelledby="m9n-h" tabIndex={-1}>
      <div className="m9n-head">
        <h2 id="m9n-h" className="m9n-title">Notifications</h2>
        <span className="m9n-count" role="status" aria-live="polite">{unread ? unread + " unread" : "All read"}</span>
        <button type="button" className="m9n-icon" onClick={onClose} aria-label="Close notifications" data-autofocus><i className="ph ph-x" aria-hidden="true"/></button>
      </div>
      <div className="m9n-tools">
        <div className="m9n-seg" role="radiogroup" aria-label="Show">
          {[["Everything", false], ["Unread", true]].map(([l, v]) =>
            <button key={l} type="button" role="radio" aria-checked={unreadOnly === v ? "true" : "false"} className={"m9n-seg-b" + (unreadOnly === v ? " is-on" : "")} onClick={() => setUnreadOnly(v)}>{l}</button>)}
        </div>
        <button type="button" className="m9n-link" onClick={onAllRead} disabled={!unread}>Mark all read</button>
      </div>
      {gone ? <div className="m9n-undo" role="status"><span>Removed “{String(gone.title || "").slice(0, 40)}”.</span><button type="button" className="m9n-link" onClick={() => onUndoDismiss(gone)}>Undo</button></div> : null}
      <div className="m9n-list">
        {loading ? <p className="m9n-state">Loading your notifications…</p>
        : error ? <div className="m9n-state"><p>We could not load your notifications.</p><button type="button" className="m9n-btn" onClick={retry}>Try again</button></div>
        : !shown.length ? <p className="m9n-state">{unreadOnly && items.length ? "Nothing unread. You are up to date." : "You’re all caught up."}</p>
        : groups.map(gr => <section key={gr.g} className="m9n-group" aria-label={gr.g}>
            <h3 className="m9n-gh">{gr.g}</h3>
            <ul className="m9n-ul">{gr.items.map(x => { const read = isRead(x); return <li key={x.notifId} className={"m9n-item" + (read ? "" : " is-unread")}>
              <span className={"m9n-ic m9n-ic-" + (x.kind || "bell")} aria-hidden="true"><i className={"ph ph-" + mp9NotifIcon(x.kind || "")}/></span>
              <div className="m9n-body">
                <p className="m9n-t">{read ? null : <span className="m9n-sr">Unread: </span>}{x.title}</p>
                {x.body ? <p className="m9n-b">{x.body}</p> : null}
                <div className="m9n-row">
                  <time className="m9n-when" dateTime={x.createdAt}>{mp9When(x.createdAt)}</time>
                  {x.action ? <button type="button" className="m9n-act" onClick={() => onAct(x)}>{x.action.label}<i className="ph ph-arrow-right" aria-hidden="true"/></button> : null}
                </div>
              </div>
              <div className="m9n-side">
                <button type="button" className="m9n-icon" onClick={() => onToggleRead(x)} aria-label={read ? "Mark as unread: " + x.title : "Mark as read: " + x.title} title={read ? "Mark as unread" : "Mark as read"}>
                  <i className={read ? "ph ph-envelope-simple" : "ph ph-envelope-simple-open"} aria-hidden="true"/></button>
                <button type="button" className="m9n-icon" onClick={() => onDismiss(x)} aria-label={"Dismiss: " + x.title} title="Dismiss"><i className="ph ph-trash" aria-hidden="true"/></button>
              </div>
            </li>; })}</ul>
          </section>)}
      </div>
    </div>
  </>;
}
