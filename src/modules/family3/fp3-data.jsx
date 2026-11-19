/* ============================================================================
   Family Portal v3 — the data adapter.

   The design's controller (fp3-app.jsx) was written against a sample object
   (FAM_DATA). This file builds that object from the family's real reads —
   family.me, family.ward per child, family.inbox, family.events — so the
   ported logic stays the design's logic and every figure is the server's.
   Nothing here adds money up: the Fees page's totals, lines and training-place
   figures arrive worked out (domain/family-portal.php family_fees_view).
   ========================================================================== */

/* Soft avatar tones, one per child by their id, so a child keeps their colour. */
const FP3_TONES = ["#f4e1c1", "#d4e6ea", "#e3dcf1", "#dcebd9", "#f3d9d6", "#e6e0d2"];
function fp3Tone(id) { let h = 0; String(id || "").split("").forEach(c => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return FP3_TONES[h % FP3_TONES.length]; }
/** What to call somebody: their first name — or, when the name on file starts with a title, the title and surname
    ("Mrs Chukwujeme", never "Good evening, Mrs"). */
function fp3First(n) {
  const w = String(n || "").trim().split(/\s+/).filter(Boolean);
  if (w.length > 1 && /^(mr|mrs|ms|miss|mx|dr|prof|chief|pastor|rev|engr|barr|alhaji|alhaja|sir|lady|hon|deaconess|deacon|elder)\.?$/i.test(w[0])) return w[0] + " " + w[w.length - 1];
  return w[0] || "";
}
const FP3_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FP3_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sat 31 Oct" from an ISO date or datetime; '' when there is none. Dates are calendar dates, read without a timezone shift. */
function fp3Date(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return FP3_DAY[d.getUTCDay()] + " " + d.getUTCDate() + " " + FP3_MON[d.getUTCMonth()];
}
function fp3Time(iso) { const m = /T(\d{2}:\d{2})/.exec(String(iso || "")); return m ? m[1] : ""; }
/** "12 Jan 2025" — for "given on" and "since" dates, where the weekday is noise. */
function fp3Long(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? (+m[3]) + " " + FP3_MON[+m[2] - 1] + " " + m[1] : ""; }
/** When a message arrived: a time today, a weekday this week, else a date. */
function fp3Ago(iso) {
  const t = Date.parse(iso || ""); if (!t) return "";
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (now - d < 6 * 86400000) return FP3_DAY[d.getDay()];
  return d.getDate() + " " + FP3_MON[d.getMonth()];
}
/** Today in Lagos as YYYY-MM-DD and its weekday — the programme's clock, not the device's. */
function fp3Lagos() {
  try {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false })
      .formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
    return { date: p.year + "-" + p.month + "-" + p.day, wd: FP3_DAY.indexOf(p.weekday), hm: p.hour + ":" + p.minute, mins: +p.hour * 60 + +p.minute };
  } catch (_) { const d = new Date(); return { date: d.toISOString().slice(0, 10), wd: d.getDay(), hm: d.toTimeString().slice(0, 5), mins: d.getHours() * 60 + d.getMinutes() }; }
}

/* The ten skills' "at home this week" tips, keyed by the skill the scorecard
   finds lowest. One sentence each, something a parent can actually do. */
const FP3_HOME_TIPS = {
  "Communication": "Ask one open question at dinner and let them finish before anyone answers.",
  "Confidence": "Let them make one small decision for the family this week, and stand by it.",
  "Critical Thinking": "When they state something, ask “how do you know?” — curious, not cross.",
  "Initiative": "Notice when they start something unasked, and say that you noticed.",
  "Team Building": "Give them a job that needs a sibling or a friend to finish.",
  "Execution": "Pick one unfinished thing together and agree the day it will be done.",
  "Problem Solving": "When they are stuck, ask what they have tried before offering help.",
  "Accountability": "If they miss something they promised, ask what they will do next time — and leave it there.",
  "Service": "Ask them to do one thing this week that helps someone outside the family.",
  "Multiplication": "Ask them to teach you something they learned on Saturday.",
};
/* WAEC bands, as the handoff gives them (API_DATA §1). */
const FP3_GRADES = [[75, "A1"], [70, "B2"], [65, "B3"], [60, "C4"], [55, "C5"], [50, "C6"], [45, "D7"], [40, "E8"], [0, "F9"]];
const FP3_ICON = { "file-text": "ph ph-file-text", "warning-circle": "ph ph-warning-circle", megaphone: "ph ph-megaphone", wallet: "ph ph-wallet" };

/* The grouping of open charges into lines ("Commitment fee × 15 months") is the
   server's now — fees_owed_made — so this app and the member's screen agree. */
/** A ledger note as a parent reads it: dates in words, "Monthly dues 2026-10" as the month. */
function fp3Note(t) {
  return String(t || "").replace(/Monthly dues (\d{4})-(\d{2})\b/g, (_, y, m) => "Commitment fee · " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+m - 1] + " " + y)
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, d => fp3Long(d)).replace(/^Policy fine — /, "Fine: ")
    /* The amount is printed beside the line; a fine's note that repeats it ("— ₦1,000 absence fine.") says it twice. */
    .replace(/\s+—\s+₦[\d,]+(?: [a-z]+)? fine\.?$/, "");
}

/** "2027-01" → "January 2027". */
function fp3Month(mk) { const d = new Date(String(mk) + "-01T12:00:00Z"); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }); }

/** How the family will be told about money, from the centre's own settings — never a channel that is off. */
function fp3TellTerms(TM) {
  const CH = { app: "here in the family app", email: "by email", telegram: "on Telegram", sms: "by text" };
  const ch = (TM.channels || []).map(c => CH[c]).filter(Boolean);
  const how = ch.length > 1 ? ch.slice(0, -1).join(", ") + " and " + ch[ch.length - 1] : ch[0] || "";
  if (!how) return "";
  return (TM.noticeDays ? " You’ll hear " + how + " " + TM.noticeDays + (TM.noticeDays === 1 ? " day" : " days") + " before each charge falls due." : "")
    + (TM.remindEvery ? " While something is owed, a reminder comes every " + TM.remindEvery + " days." : "");
}

/** What the amount owed is made of, in one line a parent reads at a glance: "Commitment fees for 22 months, membership and a fine". */
function fp3Owed(lines) {
  const n = { dues: 0, membership: 0, fine: 0, training_owed: 0, other: 0 };
  (lines || []).forEach(l => { const k = n[l.kind] !== undefined ? l.kind : "other"; n[k] += l.kind === "dues" ? (l.n || 1) : 1; });
  const parts = [];
  /* "This month’s" only when the one fee owed IS this month’s: October’s, owed in November, is named. */
  const due1 = (lines || []).find(l => l.kind === "dues"), now = new Date(), thisMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const p1 = due1 && due1.periods && due1.periods.length === 1 ? due1.periods[0] : "";
  if (n.dues) parts.push(n.dues > 1 ? "commitment fees for " + n.dues + " months" : !p1 || p1 === thisMonth ? "this month’s commitment fee" : "the commitment fee for " + fp3Month(p1));
  if (n.membership) parts.push(n.membership === 1 ? "membership" : "membership for " + n.membership + " years");
  if (n.fine) parts.push(n.fine === 1 ? "a fine" : n.fine + " fines");
  if (n.training_owed) parts.push("the training place, after leaving before the MOU was complete");
  if (n.other) parts.push(n.other === 1 ? "one other charge" : n.other + " other charges");
  const s = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : (parts[0] || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) + "." : "";
}

/** One child, in the shape the design draws. `d` is family.ward; null while it loads or for a pending link. */
function fp3Ward(link, d, today) {
  const first = fp3First(link.fullName);
  const base = { linkId: link.linkId, status: link.status, relationship: link.relationship, via: link.via,
    since: fp3Long(link.decidedAt || link.createdAt), asked: fp3Date(link.createdAt),
    member: { fullName: link.fullName, first, displayId: link.displayId, centre: link.centre, tone: fp3Tone(link.memberId), mentor: "their mentor" } };
  if (link.status !== "active" || !d) return Object.assign(base, { loaded: !!d });
  const m = d.member || {};
  const joining = m.joinDate && m.joinDate > today.date;
  const tt = (d.timetable && d.timetable.slots || []).filter(s => (+s.weekday % 7) === today.wd)   // ISO 1–7 on the server, 0–6 here
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
    .map(s => [s.startTime, s.endTime, s.course || s.title || "Class", s.room || "", s.instructor || ""]);
  /* Not every day is a Saturday. With no sign-in today and no class on today's
     timetable, the honest status is "no class today", not "not in yet". */
  const t = d.today || {};
  const meets = tt.length > 0 || today.wd === 6;
  const status = joining ? "starting" : t.status === "late" || t.status === "tardy" ? "late" : t.status ? "present" : meets ? "absent" : "off";
  const a = d.attendance || {};
  const seen = {}; (a.recent || []).forEach(r => { seen[r.date] = r; });
  const lateOn = {}; (a.late || []).forEach(r => { lateOn[r.date] = 1; });
  const strip = []; // the last 14 Saturdays, oldest first; a day with no record is a miss only once the calendar is known
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(Date.UTC(+today.date.slice(0, 4), +today.date.slice(5, 7) - 1, +today.date.slice(8, 10), 12) - ((today.wd + 1) % 7 + 7 * i) * 86400000);
    const iso = dt.toISOString().slice(0, 10);
    if (m.joinDate && iso < m.joinDate) continue;
    strip.push(seen[iso] ? (lateOn[iso] ? "l" : "p") : a.rateKnown ? "a" : "x");
  }
  const fees3 = d.fees3 || null;
  const fines = ((d.conduct || {}).fines || []).filter(f => f.status !== "paid" && f.status !== "void").map((f, i) => ({ id: "fine-" + i + "-" + (f.issuedAt || ""), amount: f.amount, when: fp3Date(f.issuedAt), reason: fp3Note(f.reason) }));
  const rq = (d.requests || []).map(r => ({ id: r.requestId, kind: r.kind, kindLabel: r.kindLabel, status: r.status, at: fp3Date(r.createdAt), subject: r.subject,
    from: r.fromDate ? fp3Date(r.fromDate) : "", to: r.toDate ? fp3Date(r.toDate) : "", reply: [].concat((r.comments || []).map(m => m.byName + " · " + fp3Date(String(m.at).slice(0, 10)) + ": " + m.text), r.decision ? [r.decision] : []).join("\n\n") }));
  const results = (d.results || []).map(r => ({ id: r.id, name: r.name, school: r.school, baseline: !!r.baseline, status: r.status, due: fp3Date(r.due),
    reminded: r.reminded ? fp3Date(r.reminded) : "", uploaded: fp3Date(r.uploaded), uploadedBy: r.uploadedBy, avg: r.avg, prevAvg: r.prevAvg, fileUrl: r.fileUrl,
    subjects: (r.subjects || []).filter(s => s.score !== null).map(s => [s.name, s.score, s.prev]),   // prev null: first time this subject is on a report
    plan: r.plan ? { drafted: fp3Date(r.plan.drafted), byAi: r.plan.draftedByAi, reviewedBy: r.plan.reviewedBy, reviewed: fp3Date(r.plan.reviewedAt), summary: r.plan.summary,
      focus: r.plan.focus, actions: r.plan.actions.map(x => [x.who === "member" ? first : x.who === "mentor" ? (d.mentor ? d.mentor.first : "Mentor") : "You", x.text]), ack: r.plan.signedAt ? fp3Date(r.plan.signedAt) : "" } : null }));
  const slots = (d.mentorSlots || []).map(s => ({ id: s.id, label: fp3Date(s.start) + " · " + fp3Time(s.start) + (s.mode === "phone" ? " by phone" : " at the centre"), start: s.start, mode: s.mode }));
  const L = d.learning || {};
  const comp = d.companion;
  return Object.assign(base, {
    loaded: true, raw: d,
    member: Object.assign(base.member, { displayId: m.displayId || link.displayId, centre: m.centre || link.centre, track: m.track, level: m.level, mentor: d.mentor ? d.mentor.name : "their mentor", mentorFirst: d.mentor ? d.mentor.first : "the mentor", hasMentor: !!d.mentor, joinDate: m.joinDate }),
    starting: joining ? fp3Date(m.joinDate) : "",
    today: { status, in: t.in || "", out: t.out || "", lateMinutes: t.lateMinutes || 0 },
    timetable: tt,
    attendance: { rate: a.rateKnown ? a.rate : null, rateKnown: !!a.rateKnown, present: a.present || 0, daysRan: a.daysRan || 0, recent: strip,
      late: (a.late || []).map(r => ({ date: fp3Date(r.date), minutes: r.minutes })) },
    conduct: { state: fines.length || ((d.conduct || {}).state && !["good", "clear", ""].includes(d.conduct.state)) ? "warn" : "good", reason: (d.conduct || {}).reason || "", fines, decisions: (d.conduct || {}).decisions || [] },
    achievements: d.achievements || { items: [], next: [] },
    charges: (d.charges || []).map(c => ({ id: c.entryId, label: fp3Note(c.note) + " · " + "₦" + Number(c.amount).toLocaleString("en"), when: fp3Date(c.createdAt) })),
    fees: fees3 ? {
      enabled: true, payable: fees3.payable, outstanding: fees3.outstanding, payOnline: fees3.payOnline, payFee: fees3.payFee || 0, partMin: fees3.partMin || 0, offlinePending: fees3.offlinePending,
      lines: (fees3.lines || []).map(l => ({ label: l.label, detail: l.detail || "", amount: l.amount, kind: l.kind, n: l.n || 1, periods: l.periods || [] })), next: fees3.next.map(x => ({ label: x.label, when: fp3Date(x.date), amount: x.amount })),
      joining: fees3.joining ? { invoiceId: fees3.joining.invoiceId, start: fp3Date(fees3.joining.start), items: fees3.joining.items, total: fees3.joining.total || 0 } : null,
      entries: fees3.entries.map((e, i) => ({ id: e.id || "E" + i, when: fp3Date(e.date), month: e.month, kind: e.kind, note: fp3Note(e.note), amount: e.amount, dir: e.dir, void: e.void, balance: e.balance })),
      programme: Object.assign({}, fees3.programme, { serviceStarts: fp3Long(fees3.programme.serviceStarts), completes: fp3Long(fees3.programme.completes) }),
      terms: fees3.terms, bank: fees3.bank,
      ahead: fees3.ahead ? Object.assign({}, fees3.ahead, { paidThroughL: fees3.ahead.paidThrough ? fp3Month(fees3.ahead.paidThrough) : "" }) : null,
      asked: fees3.asked || null, claim: fees3.claim ? Object.assign({}, fees3.claim, { when: fp3Date(fees3.claim.at) }) : null,
    } : { enabled: false, payable: 0, outstanding: 0, lines: [], next: [], entries: [], joining: null, programme: { phase: "starting" }, terms: {}, bank: null, ahead: null, asked: null, claim: null },
    learning: { completed: L.completed || 0, total: L.total || 0, pct: L.pct || 0, overdue: L.overdue || 0,
      next: (L.next || []).slice(0, 4).map(u => ({ title: u.title, course: u.course || (m.track || "Lessons"), week: u.week, due: u.dueDate ? "due " + fp3Date(u.dueDate) : "no due date", overdue: u.overdueDays > 0, status: u.status })) },
    companion: comp ? { rating: comp.rating || "none", summary: comp.summary || "", by: "NGG companion", period: comp.period || "" } : { rating: "none", summary: "", by: "", period: "" },
    requests: rq,
    excuses: d.excuses || null,   // {used, max, left, label}: two a session (POLICY §1.1)
    score: d.score ? { session: d.score.session, taken: fp3Date(d.score.taken), by: d.score.by, now: d.score.now, prev: d.score.prev || d.score.now, hasPrev: !!d.score.prev, note: d.score.note, skills: d.score.skills } : null,
    results,
    mentorSlots: slots,
    meeting: d.meeting ? { slotId: d.meeting.slotId, label: fp3Date(d.meeting.start) + " · " + fp3Time(d.meeting.start) + (d.meeting.mode === "phone" ? " by phone" : " at the centre"),
      date: d.meeting.start.slice(0, 10), time: fp3Time(d.meeting.start), mode: d.meeting.mode } : null,
    collectors: (d.collectors || []).map(c => [c.name, c.relation || "—", c.phone]),
    consents: d.consents || [],
  });
}

/** Events, in the design's shape: the date block's day and month, and whether families are expected. */
function fp3Events(rows) {
  return (rows || []).map(e => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.date) || [];
    return { id: e.id, dd: String(+m[3] || ""), mm: FP3_MON[+m[2] - 1] || "", date: fp3Date(e.date), time: e.time + (e.end ? "–" + e.end : ""), title: e.title, where: e.where, expected: !!e.expected, info: !!e.closed };
  });
}
/** Inbox rows, in the design's shape. `ward` is the child's link, or 'all' for a household notice. */
function fp3Inbox(rows) {
  return (rows || []).map(r => ({ id: r.id, cat: r.cat, ward: r.wardLinkId || "all", icon: FP3_ICON[r.icon] || "ph ph-envelope-simple", h: r.title, b: r.body,
    t: fp3Ago(r.at), from: r.from, unread: !!r.unread, sign: !!r.sign, signed: r.signedAt ? fp3Date(r.signedAt) : "", href: r.href || "", act: r.act || "" }));
}
