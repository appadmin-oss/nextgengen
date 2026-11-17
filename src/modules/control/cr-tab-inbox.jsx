/* ============================================================================
   Control Room v2 — the Inbox, a workspace of its own.

   Everything waiting on staff, in one place, worked like a mail client rather
   than a stack of cards: a rail of views (from the ONE registry, CR_PAGES.inbox
   — never a second list), a triaged list, and a conversation pane. A contact
   message is answered here, in the app — the reply is emailed, kept on the
   record and shown in the thread — not handed to somebody's own mail program.
   A decision that needs a reason takes it in the pane, not in a pop-up.

   An item is
     { id, cat, kind, icon, who, at, unread, urgent, title, body, photoUrl,
       facts: [[k, v]], search, note,
       thread?: [{ who, at, body, mine }],            the conversation so far
       reply?: { to, vars, templates, send(body, close) → { text } },
       actions: [{ l, tone?, note?: { l, req, help, ph }, form?(it), confirm?(it),
                   run(it, values) → { text, undo? } }] }
   A resolving action returns an undo where the server can genuinely reverse
   it; where it cannot (a member created, a comment deleted, an approval run)
   there is no Undo, and the irreversible ones ask first.
   ========================================================================== */

const CR_PURPOSE = { general: "General", apply: "Admissions", mentor: "Mentoring", partner: "Partnership", media: "Media", support: "Support", whatsapp: "WhatsApp" };
const CR_REASON_NOTE = (l, help, req) => ({ l: l || "Reason", req: req !== false, help: help || "They read this.", ph: "" });

/* Saved replies, by topic. {first} {ref} {me} are filled in for the person. */
const CR_INBOX_REPLIES = [
  { l: "Thanks — we’re on it", for: null, t: "Hello {first},\n\nThank you for writing to Next Generation Genius. I’m looking into this now and will come back to you with an answer shortly.\n\n{me}" },
  { l: "How to apply", for: "apply", t: "Hello {first},\n\nThank you for your interest in NGG. Applications are made online at nextgenerationgenius.org/join — choose the programme, fill in the form, and we confirm by email within a week.\n\nIf anything on the form is unclear, reply to this email and I’ll help.\n\n{me}" },
  { l: "Mentoring next steps", for: "mentor", t: "Hello {first},\n\nThank you for offering to mentor with NGG. The next step is a short conversation so we can understand your experience and the time you can give. Please reply with two times that suit you this week.\n\n{me}" },
  { l: "Partnership", for: "partner", t: "Hello {first},\n\nThank you for reaching out about working together. I’ve shared your message with our programme lead, and we’ll be in touch within the week to arrange a call.\n\n{me}" },
  { l: "Session times", for: "general", t: "Hello {first},\n\nOur Saturday sessions run from 9am to 3pm at each centre. Please arrive ten minutes early for check-in.\n\n{me}" },
  { l: "Support: fixed", for: "support", t: "Hello {first},\n\nThank you for letting us know. This is now fixed — please try again, and reply to this email if it still doesn’t work.\n\n{me}" },
];

/* Drafts are a per-person convenience on this device, never the record. */
const CR_DRAFT_KEY = "ngg.cr.inbox.draft.";
const crDraftGet = id => { try { return localStorage.getItem(CR_DRAFT_KEY + id) || ""; } catch (_) { return ""; } };
const crDraftSet = (id, v) => { try { if (v) localStorage.setItem(CR_DRAFT_KEY + id, v); else localStorage.removeItem(CR_DRAFT_KEY + id); } catch (_) {} };

function crItem(o) { return Object.assign({ unread: false, urgent: false, facts: [], body: "", actions: [], search: "" }, o); }

/* ── Reading an item: is it urgent, does it share contact details, who is it ──
   Plain pattern reading, on the words as written, so the desk sees the thing
   that matters before it scrolls: a child who mentions being hurt, a comment
   that hands out a phone number on a children's site. A flag is a note to
   look, never an automatic decision. */
const CR_URGENT_RE = /\b(urgent(ly)?|emergency|safeguard\w*|abus\w*|hurt|injur\w*|missing|bull(y|ied|ying)|harass\w*|threat\w*|unsafe|police|hospital|scared|afraid)\b/i;
const CR_CONTACT_RE = /(\+?234|\b0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}|[^\s@]+@[^\s@]+\.[a-z]{2,}|\b(whats\s?app|snap(chat)?|instagram|insta|tiktok|telegram|facebook)\b|(^|\s)@[a-z0-9_.]{3,}/i;
const CR_LINK_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ng|io|me|ly)\b/i;
function crSignals(text) {
  const t = String(text || "");
  const u = t.match(CR_URGENT_RE);
  const letters = t.replace(/[^A-Za-z]/g, "");
  return { urgent: !!u, word: u ? u[0].toLowerCase() : "", contact: CR_CONTACT_RE.test(t), link: CR_LINK_RE.test(t),
           shouting: letters.length >= 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7 };
}
const CR_URGENT_NOTE = w => "Mentions “" + w + "”. Read this first — if a child may be at risk, follow the safeguarding steps today, not in the queue.";
/** "Parent of Tolu Ade (NGG · Egbeda)" — who an address already is to us (admin2.php · inbox_known_by_email). */
function crKnownLine(k) {
  if (!k) return "";
  const where = [k.programme, k.centre].filter(Boolean).join(" · ");
  return k.kind === "member" ? "Member: " + k.name + (where ? " (" + where + ")" : "")
    : k.kind === "parent" ? "Parent of " + k.name + (where ? " (" + where + ")" : "")
    : "Family account holder" + (k.name ? ": " + k.name : "");
}
function crOpenRecord(ctx, memberId, label) {
  return memberId ? { l: label || "Open their record", go: () => ctx.go("members", "members", memberId) } : null;
}

/* What a message is about, from its words, so the reply can start in the
   right place. Order matters: a parent asking about fees is about fees, not
   about applying. */
const CR_MSG_TOPICS = [
  ["money",   /\b(fee|fees|dues|pay(ment|ing)?|paid|invoice|receipt|refund|account number|bank|transfer)\b/i],
  ["login",   /\b(password|log ?in|sign ?in|can'?t (get|log|sign)|code|otp|portal|app (is|isn'?t|not))\b/i],
  ["card",    /\b(id card|card|lanyard|badge)\b/i],
  ["times",   /\b(what time|when (is|are|do)|saturday|session times?|schedule|timetable|resum\w*)\b/i],
  ["apply",   /\b(apply|application|join|register|enrol\w*|admission|sign my (son|daughter|child) up)\b/i],
  ["mentor",  /\b(mentor\w*|volunteer\w*)\b/i],
  ["partner", /\b(partner\w*|sponsor\w*|collaborat\w*|donat\w*|support (the|your) (programme|work))\b/i],
];
function crMsgTopic(m) {
  const t = (m.subject || "") + " " + (m.message || "");
  const hit = CR_MSG_TOPICS.find(x => x[1].test(t));
  return hit ? hit[0] : (m.purpose && m.purpose !== "general" ? m.purpose : "general");
}
/** A reply in full sentences, ready to edit. Never sent as it stands — it fills the box. */
function crMsgDraft(m, me) {
  const first = String(m.name || "").trim().split(/\s+/)[0] || "there";
  const k = m.known, topic = crMsgTopic(m);
  const sign = "\n\n" + (me && me.name ? me.name + "\n" : "") + "Next Generation Genius";
  const child = k && k.kind === "parent" ? String(k.name || "").split(/\s+/)[0] : "";
  const about = child ? " about " + child : "";
  const open = "Hello " + first + ",\n\nThank you for writing to us" + about + ". ";
  const body = {
    money: child ? "I’m checking " + child + "’s account now. The family account at nextgenerationgenius.org/family shows every charge and payment, and if you paid by transfer or cash you can send the receipt from there with “I’ve paid” — it reaches us straight away. I’ll come back to you once I’ve looked."
                 : "I’m looking into this now. If it is about a payment you made, please send the receipt (a screenshot is fine) by replying to this email, with the member’s name, and I’ll match it to their account.",
    login: "Sorry it isn’t letting you in. Please try “Sign in with a code” on the sign-in page — we email a six-digit code, so no password is needed. If the code doesn’t arrive within five minutes, check spam, then reply here with the email address you use and I’ll check it on our side.",
    card: child ? "I’m looking at " + child + "’s card now. If it is lost or damaged, you can ask for a replacement from the family account (Today → Replacement ID card), and if the details on it are wrong, tell me what should be printed and I’ll correct the record before it is reprinted."
                : "Could you tell me the member’s full name and their centre? I’ll look at the card record and come back to you.",
    times: "Our Saturday sessions run from 9am to 3pm at each centre. Please arrive ten minutes early for check-in. Each centre’s timetable is on the member and family accounts, and changes are announced there first.",
    apply: k ? (child ? child + " is already with us, so there’s nothing to apply for. " : "You’re already with us, so there’s nothing to apply for. ") + "If you meant a second child, the form is at nextgenerationgenius.org/join — choose the programme and fill it in, and we confirm by email within a week."
             : "Applications are made online at nextgenerationgenius.org/join — choose the programme, fill in the form, and we confirm by email within a week. If anything on the form is unclear, reply to this email and I’ll help.",
    mentor: "Thank you for offering your time. The next step is a short conversation so we can understand your experience and the time you can give. Please reply with two times that suit you this week.",
    partner: "I’ve shared your message with our programme lead, and we’ll be in touch within the week to arrange a call.",
    media: "I’ve passed this to the person who looks after media, and they’ll come back to you directly.",
    support: "I’m looking into this now and will come back to you shortly.",
    general: "I’m looking into this now and will come back to you with an answer shortly.",
  }[topic] || "I’m looking into this now and will come back to you shortly.";
  return open + body + sign;
}

/* What the desk says to an applicant: drafted, edited, then emailed. */
function crAppFirst(a) { return a.firstName || String(a.name || "").trim().split(/\s+/)[0] || "there"; }
function crAppDraft(a, what, me) {
  const first = crAppFirst(a), prog = a.program === "summer" ? "Summer School" : "Next Generation Genius";
  const sign = "\n\n" + (me && me.name ? me.name + "\n" : "") + "Next Generation Genius";
  if (what === "waitlist") return "Hello,\n\nThank you for " + first + "’s application to " + prog + (a.centre ? " at " + a.centre : "") + ". The places for this intake are full, so " + first + " is on our waiting list. We go through the list in order as places open, and we will email you the moment one does — there is nothing more you need to do." + sign;
  if (what === "rejected") return "Hello,\n\nThank you for " + first + "’s application to " + prog + ". We’re not able to offer a place this time" + ((a.dobAge || a.age) && (+(a.dobAge || a.age) < 10 || +(a.dobAge || a.age) > 17) && a.kind === "teen" ? ", because the programme is for young people aged 10 to 17" : "") + ". You’re welcome to apply again for a future intake, and if you have any questions, reply to this email." + sign;
  // ask: what is missing, in order of what blocks the most
  const need = [];
  if (!a.photoUrl) need.push("a clear, recent photo of " + first + " (face and shoulders, plain background) — it goes on their ID card");
  if (!a.dob) need.push(first + "’s date of birth");
  if (!a.centre && a.kind === "teen") need.push("which centre is nearest to you");
  if (!a.phone) need.push("a phone number we can reach you on");
  return "Hello,\n\nThank you for " + first + "’s application to " + prog + ". Before we can go on, we need " + (need.length ? (need.length === 1 ? need[0] : need.slice(0, -1).join(", ") + " and " + need[need.length - 1]) : "one more detail: [what you need]") + ". Please reply to this email with " + (need.length > 1 ? "them" : "it") + "." + sign;
}
/* Who wrote it, as a person: a family account's name can be its email
   address (nobody typed a name), and "olisko2003@gmail.com" heading a parent's
   message reads as spam. The relationship leads; the address follows. */
function crReqWho(x) {
  if (!x.byFamily) return { who: x.fullName || "Member" };
  const n = String(x.raisedByName || "").trim(), first = String(x.fullName || "").trim().split(/\s+/)[0];
  const role = first ? first + "’s family" : "Their family";
  if (!n) return { who: role };
  return /@/.test(n) ? { who: role, sub: n } : { who: n, sub: role };
}
function crMask(phone) { const s = String(phone || "").replace(/\s+/g, ""); return s.length > 6 ? s.slice(0, 4) + " ••• " + s.slice(-3) : s; }

/* ── Sources: one per view; each knows its permission and its server calls ── */
const CR_INBOX_SOURCES = {
  messages: {
    cap: "inbox",
    async load(ctx) {
      const r = await NGGApi.admin.contact.list({});
      return (r.messages || []).filter(m => m.status === "new" || m.status === "read").map(m => {
        const first = String(m.name || "").trim().split(/\s+/)[0] || "there";
        const thread = [{ who: m.name || m.email, at: m.createdAt, body: m.message || "", mine: false }]
          // A WhatsApp follow-up from them (domain/kapso.php) is theirs, not a staff reply.
          .concat((m.replies || []).map(x => x.channel === "whatsapp-in" ? { who: m.name || x.sentByName || "Them", at: x.sentAt, body: x.body, mine: false }
            : { who: (x.sentByName || "Staff") + (x.channel === "whatsapp" ? " · on WhatsApp" : ""), at: x.sentAt, body: x.body, mine: true }));
        const set = (to, text) => async () => { await NGGApi.admin.contact.status(m.id, to); return { text, undo: () => NGGApi.admin.contact.status(m.id, m.status) }; };
        const sig = crSignals((m.subject || "") + " " + (m.message || ""));
        const topic = crMsgTopic(m);
        const TOPIC_L = { money: "Money", login: "Signing in", card: "ID card", times: "Session times", apply: "Applying", mentor: "Mentoring", partner: "Partnership", media: "Media", support: "Support", general: "General" };
        return crItem({
          id: "msg:" + m.id, cat: "messages", kind: "Message", icon: "envelope-simple", who: m.name || m.email, at: m.createdAt,
          unread: m.status === "new", urgent: m.purpose === "support" || sig.urgent,
          title: m.subject || (m.message || "").slice(0, 90), body: m.message || "",
          search: [m.email, m.ref, CR_PURPOSE[m.purpose], m.known && m.known.name].join(" "),
          facts: [m.purpose === "whatsapp" ? ["WhatsApp", m.phone || "—"] : ["Email", m.email || "—"], ["Phone", crMask(m.phone) || "—"], ["About", TOPIC_L[topic] + (CR_PURPOSE[m.purpose] && CR_PURPOSE[m.purpose] !== TOPIC_L[topic] && m.purpose !== "general" ? " · they chose " + CR_PURPOSE[m.purpose] : "")],
            ["Already with us", m.known ? crKnownLine(m.known) : "Not that we can see"], ["Reference", m.ref || "—"]],
          note: [sig.urgent ? CR_URGENT_NOTE(sig.word) : "", m.earlier > 0 ? "This address has written " + crPlural(m.earlier, "other time", "other times") + "." : ""].filter(Boolean).join(" "),
          thread,
          markRead: m.status === "new" ? () => NGGApi.admin.contact.status(m.id, "read") : null,
          // A WhatsApp message is answered on WhatsApp (the server signs it and picks text or the template).
          reply: m.email || m.purpose === "whatsapp" ? {
            to: m.purpose === "whatsapp" ? "WhatsApp · " + (m.phone || "") : m.email, purpose: m.purpose, draft: crMsgDraft(m, ctx.me),
            vars: { first, name: m.name || "", ref: m.ref || "", me: ctx.me && ctx.me.name ? ctx.me.name + "\nNext Generation Genius" : "Next Generation Genius" },
            send: async (body, close) => {
              const x = await NGGApi.admin.contact.reply(m.id, body, close);
              return { text: (close ? "Replied and closed · " : "Reply sent · ") + (m.name || m.email), status: x.status, reply: x.reply };
            },
          } : null,
          actions: [{ l: "Mark done", run: set("archived", "Done · " + (m.name || m.email)) },
            crOpenRecord(ctx, m.known && m.known.memberId, m.known && m.known.kind === "parent" ? "Open " + String(m.known.name || "").split(" ")[0] + "’s record" : "Open their record")].filter(Boolean),
        });
      });
    },
  },
  applications: {
    cap: "people",
    async load(ctx) {
      /* New, under review and waitlisted: a waitlisted child stays on the desk
         someone can accept them from, instead of vanishing when "Waitlist" is pressed. */
      const r = await NGGApi.admin.applications.list({ status: "new,reviewing,waitlist", unfinished: 1 });
      return (r.applications || []).filter(a => a.kind !== "volunteer").map(a => {
        const prog = a.program === "summer" ? "Summer School" : "NGG membership";
        const wait = a.status === "waitlist";
        const toldBy = (x) => ((x && x.told) || []).length ? " · family told by " + x.told.join(" and ") : "";
        const status = (to, label) => async () => { const x = await NGGApi.admin.applications.status(a.id, to, "", { notify: false }); return { text: label + " · " + a.name }; };
        /* Waitlisting or refusing SAYS so: the family is emailed (and the main
           parent texted) the drafted message. Edit it first; empty it to change
           only the status. A told family is not undone quietly. */
        const tell = (to, l, label) => ({ l, note: { l: "Message to the family", req: false, dflt: crAppDraft(a, to, ctx.me),
            help: a.email ? "Emailed to " + a.email + ", texted to the parent, and kept on the application. Empty it to change the status without writing." : "There is no email on this application. The parent is texted if a phone is on it. Empty it to change only the status." },
          run: async (it, v) => { const why = (v && v.why) || ""; const x = await NGGApi.admin.applications.status(a.id, to, why, { notify: !!why });
            return { text: label + " · " + a.name + toldBy(x) }; } });
        const ask = a.email ? { l: "Ask for something", keep: true, note: { l: "What you need (emailed)", req: true, dflt: crAppDraft(a, "ask", ctx.me),
            help: "Sent to " + a.email + ". The application stays here, marked as in hand." },
          run: async (it, v) => { await NGGApi.admin.applications.message(a.id, v.why);
            return { text: "Asked · " + a.email, patch: { thread: (it.thread || []).concat([{ who: (ctx.me && ctx.me.name) || "You", at: new Date().toISOString(), body: v.why, mine: true }]) } }; } } : null;
        const centreField = a.centre ? [] : [{ id: "centre", l: "Centre", req: true, help: "The application names no centre. Type the centre they will attend, as it is spelt in Centres." }];
        const actions = a.kind === "teen" ? [
          a.program === "summer" ? { l: "Accept & create member", tone: "primary",
            form: () => ({ title: "Create a member for " + a.name + "?", submit: "Accept & create member", intro: "They get a Summer School record. This can’t be undone from here.", values: {}, fields: centreField }),
            run: async (it, v) => { const x = await NGGApi.admin.applications.convert(a.id, "", (v && v.centre) || ""); return { text: x.existed ? a.name + " already had a record · " + x.memberId : "Member created · " + x.memberId }; } }
          : { l: "Accept & create member", tone: "primary",
            /* An NGG place is paid for only once it is offered: accepting sends
               the family one invoice — the membership fee and the first
               month's commitment fee, charged only for the meeting days left
               from the start date set here. */
            form: () => ({ title: "Accept " + a.name + " into NGG", submit: "Accept and send the invoice",
              intro: "They get an NGG record, a member ID and a card number. Their family is emailed one invoice to pay: the membership fee and the commitment fee for the meeting days left in their first month.",
              values: { start: new Date().toISOString().slice(0, 10) },
              fields: [{ id: "start", l: "Start date", type: "date", req: true, help: "The first day they attend. Only the meeting days from this date are charged for the first month." }].concat(centreField) }),
            run: async (it, v) => {
              const x = await NGGApi.admin.applications.convert(a.id, v.start, v.centre || "");
              if (x.existed) return { text: a.name + " already had a record · " + x.memberId };
              const inv = x.invoice || {};
              const tail = inv.invoiceId ? (inv.sent ? " · invoice " + fmtMoney(inv.total) + " sent to " + inv.to : " · invoice made, but the email didn’t go — resend it from Money → Membership payments")
                : inv.error === "fees_off" ? " · no invoice: membership fees are off" : inv.error ? " · no invoice (" + inv.error.replace(/_/g, " ") + ")" : "";
              return { text: "Member created · " + x.memberId + tail };
            } },
          wait ? null : tell("waitlist", "Waitlist", "Waitlisted"),
          tell("rejected", "Reject", "Rejected"),
          ask,
        ].filter(Boolean) : a.kind === "mentor" ? [
          /* A mentor is accepted by MAKING the mentor: the record (pending safeguarding checks) and the
             welcome email. A bare "accepted" status left the applicant with no next step. */
          { l: a.status === "accepted" ? "Finish: create the mentor" : "Accept & create mentor", tone: "primary",
            run: async () => { const x = await NGGApi.admin.mentorship.convertApp(a.id);
              return { text: x.existed ? a.name + " is already a mentor · " + x.mentorId : "Mentor created · " + x.mentorId + (a.email ? " · welcome emailed to " + a.email : "") }; } },
          a.status === "accepted" || wait ? null : tell("waitlist", "Waitlist", "Waitlisted"),
          tell("rejected", "Reject", "Rejected"),
          ask,
        ].filter(Boolean) : [
          { l: "Accept", tone: "primary", run: status("accepted", "Accepted") },
          wait ? null : tell("waitlist", "Waitlist", "Waitlisted"),
          tell("rejected", "Reject", "Rejected"),
          ask,
        ].filter(Boolean);
        const rec = crOpenRecord(ctx, a.known && a.known.memberId, a.known && a.known.kind === "parent" ? "Open " + String(a.known.name || "").split(" ")[0] + "’s record" : "Open their record");
        if (rec) actions.push(rec);
        return crItem({
          id: "app:" + a.id, cat: "applications", kind: "Application", icon: "user-plus", who: a.name || a.email || "Applicant", at: a.createdAt,
          unread: a.status === "new", urgent: crSignals(a.why).urgent, title: [prog, a.track || a.role, wait ? "Waitlisted" : ""].filter(Boolean).join(" · "), body: a.why || "", photoUrl: a.photoUrl || "",
          search: [a.email, a.centre, a.track, a.ref].join(" "),
          facts: [["Already with us", a.known ? crKnownLine(a.known) : ""], ["Age", a.age || a.dobAge || "—"], ["Centre", a.centre || "—"], ["Division", a.program === "summer" ? "" : (a.faculty || "—")], ["Course", a.track || (a.details && a.details.courseOther ? "Something else: " + a.details.courseOther : "—")], ["Role", a.role || ""], ["Email", a.email || "—"], ["Phone", crMask(a.phone) || "—"], ["Photo", a.photoUrl ? "Uploaded" : "Missing"], ["Reference", a.ref || ""]]
            .concat(crAppDetailFacts(a)).filter(f => f[1] !== ""),
          note: [
            a.known ? (a.known.kind === "member" ? "Already a member: " + a.known.name + ". Accepting finds that record rather than making a second one." : crKnownLine(a.known) + " — a second child, or the same one again?") : "",
            a.earlierApps > 0 ? "This address has applied " + crPlural(a.earlierApps, "time", "times") + " before." : "",
            a.kind === "teen" && (a.dobAge || a.age) && (+(a.dobAge || a.age) < 10 || +(a.dobAge || a.age) > 17) ? "Age " + (a.dobAge || a.age) + " is outside 10–17." : "",
            a.photoUrl ? "" : "No photo yet — their ID card cannot print until one is uploaded. “Ask for something” drafts the request.",
          ].filter(Boolean).join(" "),
          thread: (a.messages || []).length ? [{ who: a.name || "Applicant", at: a.createdAt, body: a.why || "(No message with the application.)", mine: false }]
            .concat(a.messages.map(x => ({ who: x.byName || "Staff", at: x.at, body: x.text + (x.sent ? "" : "\n\n(Not emailed — no address, or the email failed.)"), mine: true }))) : null,
          actions: actions.filter(Boolean),
        });
      });
    },
  },
  approvals: {
    cap: "people",
    async load(ctx) {
      const [ap, fam] = await Promise.all([NGGApi.admin.approvals.list("pending"), NGGApi.admin.families.list({ status: "pending" }).catch(() => ({ rows: [] }))]);
      const items = (ap.approvals || []).map(x => crItem({
        id: "apr:" + x.approvalId, cat: "approvals", kind: "Approval", icon: "seal-check", who: x.requesterName || x.requesterId, at: x.createdAt, unread: true,
        title: x.summary, body: "", search: x.approvalId,
        facts: [["Request", x.approvalId], ["Asked by", x.requesterName || x.requesterId], ["Runs as", "The person who asked, the moment you approve"]],
        note: ap.canDecide ? "" : "You asked for this one. A second admin decides it.",
        actions: ap.canDecide ? [
          { l: "Approve", tone: "primary", confirm: () => ({ title: "Approve and run it now?", body: x.summary + "\n\nIt runs as " + (x.requesterName || "them") + " and can’t be undone from here.", cta: "Approve" }),
            run: async () => { const r = await NGGApi.admin.approvals.decide(x.approvalId, "approve", ""); if (r.status === "failed") throw Object.assign(new Error("failed"), { data: { message: "Approved, but the action itself was refused: " + ((r.result && (r.result.message || r.result.error)) || "no reason given") } }); return { text: "Approved and done · " + x.summary }; } },
          { l: "Reject", note: CR_REASON_NOTE("Why it is rejected", "The person who asked reads this."), run: async (it, v) => { await NGGApi.admin.approvals.decide(x.approvalId, "reject", v.why); return { text: "Rejected · " + x.summary }; } },
        ] : [
          { l: "Withdraw", run: async () => { await NGGApi.admin.approvals.withdraw(x.approvalId); return { text: "Withdrawn — nothing was changed" }; } },
        ],
      }));
      (fam.rows || []).forEach(f => items.push(crItem({
        id: "fam:" + f.linkId, cat: "approvals", kind: "Family link", icon: "house-line", who: f.guardianName || f.guardianEmail, at: f.createdAt, unread: true,
        title: "Wants to connect to " + f.fullName, body: f.note || "", search: [f.guardianEmail, f.fullName, f.displayId].join(" "),
        facts: [["Relationship", f.relationshipLabel || "—"], ["Child", f.fullName + (f.displayId ? " · " + f.displayId : "")], ["Centre", f.centre || "—"],
          ["Guardian on record", (f.recordParentName || "—") + (f.recordParentEmail ? " · " + f.recordParentEmail : "")], ["Method", f.via === "code" ? "Child’s code" : "Record email"], ["Email", f.guardianEmail || "—"]],
        note: f.recordParentEmail && f.guardianEmail && f.recordParentEmail.toLowerCase() !== f.guardianEmail.toLowerCase() ? "The email asking is not the guardian email on the child’s record. Check before approving." : "",
        actions: [
          { l: "Approve link", tone: "primary", run: async () => { const r = await NGGApi.admin.families.decide("approve", [f.linkId]); const bad = (r.results || []).find(x => !x.ok); if (bad) throw Object.assign(new Error(bad.error), { code: bad.error }); return { text: "Connected · the parent has been emailed" }; } },
          { l: "Decline", note: Object.assign(CR_REASON_NOTE("Why it is declined", "The parent reads this."), { dflt: "We couldn’t confirm that you are " + f.fullName + "’s " + String(f.relationshipLabel || "parent").toLowerCase() + " from our records. Please speak to the coordinator at " + (f.centre || "the centre") + " — bring ID, and they can connect your account in person." }),
            run: async (it, v) => { const r = await NGGApi.admin.families.decide("refuse", [f.linkId], v.why); const bad = (r.results || []).find(x => !x.ok); if (bad) throw Object.assign(new Error(bad.error), { code: bad.error }); return { text: "Declined · the parent has been emailed" }; } },
          crOpenRecord(ctx, f.memberId, "Open " + String(f.fullName || "").split(" ")[0] + "’s record"),
        ].filter(Boolean),
      })));
      return items;
    },
  },
  requests: {
    cap: "people",
    async load(ctx) {
      const r = await NGGApi.admin.requests.list({ status: "open" });
      const canMoney = ctx.can("fees");
      /* A family appealing a fine usually points at a leave request still
         waiting: the member's other open requests travel with each item. */
      const byMember = {};
      (r.requests || []).forEach(y => { if (y.memberId) (byMember[y.memberId] = byMember[y.memberId] || []).push(y); });
      return (r.requests || []).map(x => {
        /* Feedback is thanked or passed on, never approved: an "approved idea" means nothing to a child. */
        if (x.kind === "feedback") {
          const who = x.anonymous ? "A member (no name given)" : (x.fullName || x.displayId || "A member");
          return crItem({
            id: "req:" + x.requestId, cat: "requests", kind: "Idea or feedback · " + (x.topicLabel || "An idea"), icon: "lightbulb", who, at: x.createdAt, unread: true,
            title: x.subject || x.topicLabel, body: x.body || (x.rating ? "No words, just the rating." : ""), search: [x.requestId, x.displayId, x.memberId, x.centre, "feedback idea"].join(" "),
            facts: [["From", x.anonymous ? "Sent without their name" : who + (x.displayId ? " · " + x.displayId : "")], ["Centre", x.centre || "—"]]
              .concat(x.rating ? [["How it’s going", x.rating + " of 5 · " + x.ratingLabel]] : []).concat(x.passedAt ? [["Passed to the centre lead", crDate(x.passedAt)]] : []),
            thread: [{ who, at: x.createdAt, body: x.body || "", mine: false }],
            note: x.anonymous ? "Sent without a name, so a thank-you closes it but reaches nobody." : "",
            actions: [
              { l: "Thank and close", tone: "primary", note: CR_REASON_NOTE("Your reply", x.anonymous ? "Kept with the record." : "The member reads this. Leave it empty for a plain thank-you.", false),
                run: async (it, v) => { await NGGApi.admin.requests.answer(x.requestId, "thank", v.why || ""); return { text: x.anonymous ? "Closed" : "Thanked · " + who }; } },
              x.passedAt ? null : { l: "Pass to centre lead", note: CR_REASON_NOTE("A note for the lead", "Optional. The lead reads this with the feedback.", false),
                run: async (it, v) => { await NGGApi.admin.requests.answer(x.requestId, "pass", v.why || ""); return { text: "Passed to the " + (x.centre || "centre") + " lead" }; } },
            ].filter(Boolean),
          });
        }
        const pay = x.kind === "payment";
        const f = [["Member", (x.fullName || "") + (x.displayId ? " · " + x.displayId : "")], ["Centre", x.centre || "—"]];
        if (pay) {
          f.push(["Claims", fmtMoney(x.amount)]);
          if (x.parts && x.parts.length) x.parts.forEach((p, i) => f.push([x.parts.length > 1 ? "Paid, part " + (i + 1) : "Paid", crPayLabel(p)]));
          else f.push(["Reference", crPayIsNote(x.reference) ? (crPayRefs(x.reference).join(" · ") || "See what they wrote") : (x.reference || "—")]);
          f.push(["Paid on", x.paidAt ? crDate(x.paidAt) : "—"]);
        }
        const payNote = pay && !(x.parts && x.parts.length) && crPayIsNote(x.reference) ? x.reference : "";
        if (x.kind === "leave") f.push(["From", x.fromDate ? crDate(x.fromDate) : "—"], ["To", x.toDate ? crDate(x.toDate) : "Open-ended"]);
        // Sent less than 24 hours before the day it excuses (recorded when sent: member_leave_notice).
        if (x.kind === "leave" && x.shortNotice) f.push(["Notice", "Less than 24 hours — approve only for an emergency you can check"]);
        if (x.byFamily) { const w = crReqWho(x); f.push(["Raised by", w.who + (w.sub ? " · " + w.sub : "")]); }
        const det = x.kind === "details" || x.kind === "familydetails";
        const rd = det ? (x.reading || { changes: [], asked: [] }) : null;
        if (det) {
          rd.changes.forEach(c => f.push([c.label, (c.current || "nothing") + " → " + c.proposed + (c.warn ? " · " + c.warn : "")]));
          rd.asked.forEach(a => f.push([a.label, "Named, but no new value given — ask for it"]));
        }
        const acts = typeof crReqActs === "function" ? crReqActs(x) : ["Approve", "Decline", false];
        const fine = x.kind === "appeal" && /^fine\b/i.test(x.subject || "");
        const approve = det ? {
          l: rd.changes.length ? "Change it" : "Change details", tone: "primary", form: () => crReqDetailsForm(x),
          run: async (it, v) => { const r = await crReqDetailsSend(x, v); if (r.fieldErrors) throw Object.assign(new Error("bad_value"), { data: { message: Object.values(r.fieldErrors)[0] } }); return { text: "Changed and approved · " + x.fullName }; },
        } : pay ? (canMoney ? {
          /* One form with Requests' drawer (crPayApproveForm, cr-tab-members.jsx): a line per way it arrived, each its own ledger entry. */
          l: "Approve", tone: "primary", form: () => Object.assign({ title: "Approve this payment", submit: "Post the payment",
            intro: "Post what arrived, one line per way it came — each becomes its own ledger entry with its own reference." + (payNote ? " The lines are filled in from what they wrote; check each one." : "") },
            (f => Object.assign(f, { values: Object.assign(f.values, { why: crReqDraftApprove(x, crPayGuess(x).map(p => ({ method: p.method, amount: +p.amount || 0 })).filter(p => p.amount)) }) }))(crPayApproveForm(x))),
          run: async (it, v) => { const parts = crPayParts(v); if (!parts.length) throw Object.assign(new Error("no_amount"), { data: { message: "Enter the amount that arrived." } });
            await NGGApi.admin.requests.decide(x.requestId, true, v.why || "", crPayTotal(parts), parts); return { text: fmtMoney(crPayTotal(parts)) + " posted · " + x.fullName }; },
        } : null) : x.kind === "appeal" && x.refSanctionId ? {
          /* An appeal against a decision: upheld, the decision is overturned (its fine comes off the account).
             The person who made the decision can't decide its appeal; the server says so. */
          l: acts[0], tone: "primary", note: Object.assign(CR_REASON_NOTE("Why it is upheld", (fine ? "The fine comes off the account. " : "The decision is lifted, with anything it carried. ") + "The family reads this.", true), { dflt: crReqDraftApprove(x) }),
          run: async (it, v) => { await NGGApi.admin.requests.decide(x.requestId, true, v.why || ""); return { text: (fine ? "Fine lifted · " : "Appeal upheld · ") + x.fullName }; },
        } : {
          l: acts[0], tone: "primary", note: Object.assign(CR_REASON_NOTE(acts[2] ? "Your answer" : "Your reply", "They read this — a drafted reply; edit it or send it.", acts[2]), { dflt: crReqDraftApprove(x) }),
          run: async (it, v) => { await NGGApi.admin.requests.decide(x.requestId, true, v.why || ""); return { text: "Done · " + x.fullName }; },
        };
        const others = (byMember[x.memberId] || []).filter(y => y.requestId !== x.requestId);
        return crItem({
          id: "req:" + x.requestId, cat: "requests", kind: (x.kindLabel || "Member request") + (x.byFamily ? " · From their family account" : ""), icon: pay ? "currency-ngn" : "hand", who: x.fullName || x.displayId, at: x.createdAt, unread: true,
          title: x.subject || x.kindLabel, body: x.body || payNote, search: [x.requestId, x.displayId, x.memberId, x.centre, x.reference].join(" "),
          facts: f, thread: (x.body || payNote) ? [Object.assign(crReqWho(x), { at: x.createdAt, body: x.body || payNote, mine: false })] : null,
          note: pay && !canMoney ? "Approving a payment needs the Fees permission."
            : x.kind === "leave" && x.shortNotice ? "Sent with less than 24 hours’ notice. Leave asked for this late is not approved unless it is an emergency you can check: ask for the proof (a hospital note, for example) before approving." : "",
          related: others.map(y => ({ id: "req:" + y.requestId, icon: y.kind === "leave" || y.kind === "academic" ? "calendar-x" : "tray", t: y.subject || y.kindLabel || y.kind,
            s: (y.kindLabel || y.kind) + " · waiting since " + crDate(y.createdAt), y })),
          relatedTip: x.kind === "appeal" && others.some(y => y.kind === "leave") ? "Their leave request is still waiting. Excusing it does not lift " + (fine ? "this fine" : "this decision") + " on its own — decide both." : "",
          actions: [approve, { l: pay || det ? "Decline" : acts[1], note: Object.assign(CR_REASON_NOTE(x.kind === "appeal" ? "Why it stands" : "Why it is declined", "A drafted reason for this kind of request — edit it to fit."),
            { dflt: ((CR_REQ_DECLINE[x.kind] || CR_REQ_DECLINE_ANY)[0] || [0, 0, () => ""])[2](x) }), run: async (it, v) => { await NGGApi.admin.requests.decide(x.requestId, false, v.why); return { text: x.kind === "appeal" ? "Kept, with your reason" : "Declined, with your reason" }; } }].filter(Boolean),
        });
      });
    },
  },
  comments: {
    cap: "content",
    async load(ctx) {
      const r = await NGGApi.admin.comments("pending");
      return (r.comments || []).map(c => {
        const sig = crSignals(c.body);
        return crItem({
          id: "cmt:" + c.commentId, cat: "comments", kind: "Comment", icon: "chat-circle", who: c.memberName || "Member", at: c.createdAt, unread: true, urgent: sig.urgent,
          title: "On “" + (c.postTitle || c.postSlug || c.postId) + "”", body: c.body || "", search: c.postTitle || c.postSlug || "",
          facts: [["Post", c.postTitle || c.postSlug || c.postId]],
          thread: [{ who: c.memberName || "Member", at: c.createdAt, body: c.body || "", mine: false }],
          note: [sig.urgent ? CR_URGENT_NOTE(sig.word) : "",
            sig.contact ? "It shares contact details — a phone number, an email or a social handle. On a children’s site that stays hidden: reject it." : "",
            sig.link ? "It contains a link. Check where it goes before approving." : "",
            sig.shouting ? "Written in capitals." : ""].filter(Boolean).join(" "),
          actions: [
            { l: "Approve", tone: sig.contact ? undefined : "primary", run: async () => { await NGGApi.admin.commentModerate(c.commentId, "approve"); return { text: "Approved · it’s on the post now", undo: () => NGGApi.admin.commentModerate(c.commentId, "reject") }; } },
            { l: "Reject", run: async () => { await NGGApi.admin.commentModerate(c.commentId, "reject"); return { text: "Rejected · it stays hidden", undo: () => NGGApi.admin.commentModerate(c.commentId, "approve") }; } },
            { l: "Delete", confirm: () => ({ title: "Delete this comment?", body: "It is removed for good. This can’t be undone.", cta: "Delete", danger: true }), run: async () => { await NGGApi.admin.commentModerate(c.commentId, "delete"); return { text: "Deleted" }; } },
            crOpenRecord(ctx, c.memberId, "Open their record"),
          ].filter(Boolean),
        });
      });
    },
  },
  /* What members said about their sessions (domain/testimonials.php).
     A child wrote these about themselves, so two things are different from
     every other queue here: publishing needs the guardian's consent on the
     record — without it there is no Publish button to press, because a
     control that cannot act should not be drawn — and the words go out under
     the byline the MEMBER chose, never their full name. */
  testimonials: {
    cap: "content",
    async load(ctx) {
      const r = await NGGApi.admin.curriculum.testimonials("new");
      return (r.rows || []).map(t => {
        const ok = !!t.consent;
        const sig = crSignals(t.body);
        const back = () => NGGApi.admin.curriculum.testimonialDecide(t.tid, "new", "");
        const actions = [];
        if (ok && !sig.contact) actions.push({ l: "Publish", tone: "primary", run: async () => {
          await NGGApi.admin.curriculum.testimonialDecide(t.tid, "published", "");
          return { text: "Published · it is on the home page now", undo: back };
        } });
        actions.push({ l: "Not this one", note: { l: "Why (staff only)", req: false, ph: "e.g. names another child", help: "Kept on the record. The member is not told, and can still write another." },
          run: async (it, v) => { await NGGApi.admin.curriculum.testimonialDecide(t.tid, "declined", v.why || ""); return { text: "Left unpublished", undo: back }; } });
        return crItem({
          id: "tst:" + t.tid, cat: "testimonials", kind: "Testimonial", icon: "quotes",
          who: t.name || t.memberId, at: t.createdAt, unread: true,
          title: t.course ? "After a " + t.course + " session" : "After a session",
          body: t.body || "", search: [t.memberId, t.centre, t.course].join(" "),
          facts: [["Member", t.memberId + (t.centre ? " · " + t.centre : "")],
                  ["Goes out as", t.byline + " · " + (CR_TESTI_SHOW[t.showAs] || t.showAs)],
                  ["Consent", ok ? "Guardian granted “Feature on our website”" : "Not granted"]],
          note: [sig.contact ? "It contains contact details or a social handle — leave it unpublished." : "",
            sig.urgent ? CR_URGENT_NOTE(sig.word) : "",
            ok ? "Publishing puts these words on the public home page under that byline — never their full name. They can take it back at any time, and withdrawing the consent takes it down on its own."
               : "No Publish here: the guardian has not granted “Feature on our website”. Record that consent on the member first. The words are still worth reading."].filter(Boolean).join(" "),
          urgent: sig.urgent,
          actions: actions.concat([crOpenRecord(ctx, t.memberId, "Open their record")]).filter(Boolean),
        });
      });
    },
  },
  photos: {
    cap: "content",
    async load(ctx) {
      /* Two kinds of photo work: headshots the pipeline routed to review, and
         members asking to change their photo (they send the new one; nothing
         changes until it is approved here). */
      const [r, ch] = await Promise.all([NGGApi.admin.photos.queue(), NGGApi.admin.photos.changes()]);
      const asks = (ch.requests || []).map(q => {
        const who = q.subjectName || q.subjectId;
        return crItem({
          id: "pcr:" + q.requestId, cat: "photos", kind: "Photo change", icon: "image", who, at: q.requestedAt, unread: true,
          title: "Asks to change their photo", photoUrl: nggPhotoSrc(q.photoUrl), oldPhotoUrl: nggPhotoSrc(q.oldPhotoUrl), search: [q.subjectId, q.subjectCentre, q.reason].join(" "),
          facts: [["Member", q.subjectId + (q.subjectCentre ? " · " + q.subjectCentre : "")], ["Why", q.reason || "No reason given"]],
          note: "Approving puts it on their profile and on the next ID card printed. A card already printed is not reissued.",
          actions: [
            { l: "Approve", tone: "primary", run: async () => { await NGGApi.admin.photos.changeDecide(q.requestId, "approve", ""); return { text: "New photo approved · " + who }; } },
            { l: "Decline", note: { l: "Why (they see this)", req: true, dflt: "Please send a new photo with your face clear, looking at the camera, against a plain background — it goes on your ID card.", help: "Their photo stays as it is, and they are told why." },
              run: async (it, v) => { await NGGApi.admin.photos.changeDecide(q.requestId, "decline", v.why); return { text: "Declined · " + who + " was told why" }; } },
            q.subjectType === "member" || !q.subjectType ? crOpenRecord(ctx, q.subjectId, "Open their record") : null,
          ].filter(Boolean),
        });
      });
      return asks.concat((r.queue || []).map(p => {
        const fd = p.aiFindings || {};
        const flags = (fd.flags || []).map(x => String(x).replace(/_/g, " "));
        const who = p.subjectName || (p.subjectType + " " + p.subjectId);
        const actions = [
          { l: "Approve", tone: "primary", run: async () => { await NGGApi.admin.photos.approve(p.assetId, p.editedUrl || "", ""); return { text: "Photo approved · " + who }; } },
          { l: "Ask for reshoot", note: { l: "What to fix", req: true, ph: "Please retake against a plain wall.", help: p.subjectType === "student" ? "The guardian is emailed a reshoot link with this." : "They are told this." },
            run: async (it, v) => { await NGGApi.admin.photos.retake(p.assetId, v.why); return { text: "Reshoot requested · " + who }; } },
        ];
        if (ctx.can("people")) actions.push({ l: "Reject", note: CR_REASON_NOTE("Why it is rejected", "Kept on the photo’s record."), run: async (it, v) => { await NGGApi.admin.photos.reject(p.assetId, v.why); return { text: "Photo rejected · " + who }; } });
        // The reshoot note starts from what the check found, in words a family can act on.
        const fix = (fd.flags || []).map(f => ({ too_blurry: "it is blurry", low_resolution: "it is too small", too_dark: "it is too dark", no_face: "we can’t see a face", multiple_faces: "there is more than one person in it", not_a_child_headshot: "it isn’t a head-and-shoulders photo" })[f]).filter(Boolean);
        actions[1].note.dflt = "Please retake the photo" + (fix.length ? " — " + fix.join(", ") : "") + ". Stand against a plain wall in good light, face the camera, and keep head and shoulders in the frame.";
        if (p.subjectType === "member" && ctx.can("people")) actions.push(crOpenRecord(ctx, p.subjectId, "Open their record"));
        return crItem({
          id: "pho:" + p.assetId, cat: "photos", kind: "Headshot", icon: "image", who, at: p.createdAt, unread: p.status === "pending_review",
          title: "New headshot for an ID card", photoUrl: p.editedUrl || p.sourceUrl, search: [p.subjectId, p.subjectCentre].join(" "),
          facts: [["Subject", (p.subjectType === "student" ? "Participant" : p.subjectType === "volunteer" ? "Volunteer" : "Member") + " · " + p.subjectId + (p.subjectCentre ? " · " + p.subjectCentre : "")],
            ["Check", p.aiScore == null ? "Not analysed — look carefully" : "Score " + p.aiScore + (flags.length ? " · " + flags.join(", ") : "")]]
            .concat((fd.issues || []).length ? [["Issues", fd.issues.join("; ")]] : []),
          note: p.status === "in_review" ? "Another reviewer has this open." : "",
          actions,
        });
      }));
    },
  },
};
/* The Club application's answers (applications.details), as facts on the
   item. A parent's number is masked like the applicant's. */
function crAppDetailFacts(a) {
  const d = a.details; if (!d) return [];
  const ag = a.agreements || {}, req = ["participation", "medical", "data", "comms", "media", "site_visibility"];
  const agreed = req.every(t => ag[t] && ag[t].status === "granted");
  const ver = (ag.participation && ag.participation.version) || d.policyVersion || "";
  const parent = (n, r, ph) => n ? n + (r ? " (" + r + ")" : "") + (ph ? " · " + crMask(ph) : "") : "";
  return [
    ["Filled in by", d.filledBy === "child" ? "The applicant" : d.filledBy ? "Parent or guardian" : ""],
    ["School", [d.school, [d.class, d.classArm].filter(Boolean).join(" ")].filter(Boolean).join(" · ")],
    ["Lives in", [d.address, d.resLga, d.resState].filter(Boolean).join(", ")],
    ["Origin", [d.originLga, d.originState].filter(Boolean).join(", ")],
    ["Nationality", d.nationality || ""],
    ["Main contact", parent(d.parent1Name, d.parent1Rel, d.parent1Phone)],
    ["Second contact", d.parent2None ? "None" : parent(d.parent2Name, d.parent2Rel, d.parent2Phone)],
    ["Hobbies", (d.hobbies || []).join(", ")],
    ["Wants to lead in", (d.influenceAreas || []).join(", ")],
    ["Heard from", d.heardFrom || ""],
    ["Promo code", d.promoCode || ""],
    ["Agreements", agreed ? "All agreed" + (ver ? " (v" + ver + ")" : "") : "Incomplete"],
    ["Off-site trips", ag.trips ? (ag.trips.status === "granted" ? "Yes" : "No") : ""],
  ];
}
/* The applications export: every column the old Google Form had, then the new ones. */
const CR_APP_PARENT = (d, rel, k) => d.parent1Rel === rel ? d["parent1" + k] : d.parent2Rel === rel && !d.parent2None ? d["parent2" + k] : "";
const CR_APP_EXPORT = [
  ["Timestamp", a => a.createdAt], ["Reference", a => a.ref], ["Kind", a => a.kind], ["Programme", a => a.program], ["Status", a => a.status],
  ["First name", a => a.firstName], ["Middle name", a => a.otherName], ["Surname", a => a.lastName], ["Date of birth", a => a.dob], ["Age", a => a.dobAge != null ? a.dobAge : a.age],
  ["Email", a => a.email], ["Sex", a => a.sex], ["Name of school", (a, d) => d.school], ["Class", (a, d) => d.class], ["Class arm", (a, d) => d.classArm],
  ["Mobile number", a => a.phone], ["Address", (a, d) => d.address], ["Local government", (a, d) => d.resLga], ["State", (a, d) => d.resState], ["Country", (a, d) => d.nationality ? "Nigeria" : ""],
  ["Father's full name", (a, d) => CR_APP_PARENT(d, "Father", "Name")], ["Father's number", (a, d) => CR_APP_PARENT(d, "Father", "Phone")],
  ["Mother's full name", (a, d) => CR_APP_PARENT(d, "Mother", "Name")], ["Mother's number", (a, d) => CR_APP_PARENT(d, "Mother", "Phone")],
  ["Guardian's full name", (a, d) => CR_APP_PARENT(d, "Guardian", "Name")], ["Guardian's number", (a, d) => CR_APP_PARENT(d, "Guardian", "Phone")],
  ["Your vision", a => a.why], ["Hobbies", (a, d) => (d.hobbies || []).join(", ")], ["Courses", (a, d) => a.track || d.courseOther || ""], ["Division", a => a.faculty],
  ["Areas of influence", (a, d) => (d.influenceAreas || []).join(", ")], ["How did you hear", (a, d) => d.heardFrom], ["Promo code", (a, d) => d.promoCode], ["Centre", a => a.centre],
  ["Filled in by", (a, d) => d.filledBy], ["State of origin", (a, d) => d.originState], ["LGA of origin", (a, d) => d.originLga], ["Nationality", (a, d) => d.nationality],
  ["Main contact", (a, d) => d.parent1Rel], ["No second parent", (a, d) => d.parent2None ? "Yes" : ""],
  ["Agreements", a => { const g = a.agreements || {}; return Object.keys(g).length ? Object.keys(g).map(t => t + ":" + g[t].status).join(" ") : ""; }],
  ["Policy version", (a, d) => d.policyVersion], ["Photo", a => a.photoUrl ? "Yes" : "No"], ["Role", a => a.role],
];
/* How the member chose to be signed, in the words the member saw. */
const CR_TESTI_SHOW = { initials: "initials and age", first: "first name and age", anon: "not named at all" };

const CR_INBOX_ORDER = ["messages", "requests", "approvals", "applications", "photos", "comments", "testimonials"];

/** Load every queue this person may see, at once. A queue that fails is named, not hidden. */
async function crInboxLoad(ctx) {
  const keys = CR_INBOX_ORDER.filter(k => ctx.can(CR_INBOX_SOURCES[k].cap));
  const res = await Promise.all(keys.map(k => CR_INBOX_SOURCES[k].load(ctx).then(items => ({ k, items }), e => ({ k, items: [], error: e }))));
  const failed = res.filter(r => r.error).map(r => r.k);
  if (failed.length === keys.length && keys.length) throw res[0].error;
  return { items: [].concat(...res.map(r => r.items)), failed, at: Date.now() };
}

/* ── The workspace ─────────────────────────────────────────────────────── */

function CrInbox({ ctx, phone, data }) {
  const views = crTabsFor("inbox", ctx.can);
  const view = ctx.view && views.some(v => v.id === ctx.view) ? ctx.view : (views[0] ? views[0].id : "all");
  const [items, setItems] = React.useState(data.items);
  React.useEffect(() => { setItems(data.items); }, [data]);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const [q, setQ] = React.useState("");
  const [chip, setChip] = React.useState("all");
  const [sort, setSort] = React.useState(() => crLsGet("ngg.cr.inbox.sort", "triage"));
  const [selId, setSelId] = React.useState(null);
  const [picked, setPicked] = React.useState({});
  const [handled, setHandled] = React.useState(0);
  const [open, setOpen] = React.useState(false);           // phone: the conversation is open
  const searchRef = React.useRef(null);
  const paneRef = React.useRef(null);

  const counts = crInboxCounts(items);
  const shown = crInboxSort(crInboxFilter(items, { view, chip, q }, now), sort, now);
  const groups = crInboxGroups(shown, sort, now);
  const ids = shown.map(x => x.id);
  const sel = shown.find(x => x.id === selId) || (phone ? null : shown[0]) || null;
  const pickedItems = shown.filter(x => picked[x.id]);
  const overdueN = crInboxFilter(items, { view, chip: "overdue" }, now).length;

  /* Opening an item marks it read where the server keeps that state. */
  React.useEffect(() => {
    if (!sel || !sel.unread || !sel.markRead) return undefined;
    const t = setTimeout(() => {
      sel.markRead().then(() => setItems(xs => xs.map(x => x.id === sel.id ? Object.assign({}, x, { unread: false, markRead: null }) : x)), () => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [sel && sel.id]);

  const remove = id => setItems(xs => xs.filter(x => x.id !== id));
  const restore = it => setItems(xs => xs.some(x => x.id === it.id) ? xs : xs.concat([it]));
  const advance = id => { setSelId(crQueueAfterResolve(ids, id)); if (phone) setOpen(false); };

  /** Run one action on one item: optimistic, undoable where the server can undo. */
  const act = async (it, a, values) => {
    // Going somewhere is not handling the item: it stays in the list.
    if (a.go) { a.go(it); return false; }
    if (a.form && !values) {
      ctx.form(Object.assign({}, a.form(it), { onSubmit: async v => { await act(it, a, v); } }));
      return false;
    }
    if (a.confirm && !values) { const ok = await ctx.confirm(Object.assign({ cta: a.l, danger: crIsDanger(a.l) }, a.confirm(it))); if (!ok) return false; }
    /* `keep`: an action that moves the item on without settling it (asking an
       applicant for a photo) — it stays, and its thread shows what was said. */
    if (a.keep) {
      try {
        const r = await a.run(it, values || {});
        setItems(xs => xs.map(x => x.id === it.id ? Object.assign({}, x, { unread: false }, (r && r.patch) || {}) : x));
        ctx.toast((r && r.text) || (a.l + " · " + it.who));
        return true;
      } catch (e) { ctx.toast(crErr(e, "Couldn’t " + a.l.toLowerCase() + ". Nothing changed."), null, true); return false; }
    }
    advance(it.id); remove(it.id);
    try {
      const r = await a.run(it, values || {});
      setHandled(n => n + 1);
      const undo = r && r.undo;
      ctx.toast((r && r.text) || (a.l + " · " + it.who), undo ? async () => {
        try { await undo(); restore(it); setSelId(it.id); setHandled(n => Math.max(0, n - 1)); }
        catch (e) { ctx.toast(crErr(e, "Couldn’t undo that."), null, true); }
      } : null);
      ctx.refreshCounts();
      return true;
    } catch (e) {
      restore(it); setSelId(it.id);
      ctx.toast(crErr(e, "Couldn’t " + a.l.toLowerCase() + ". Nothing changed."), null, true);
      return false;
    }
  };

  /** Send a reply in the app. The item leaves the list when the reply closes it; otherwise the thread grows. */
  const send = async (it, body, close) => {
    try {
      const r = await it.reply.send(body, close);
      crDraftSet(it.id, "");
      setHandled(n => n + 1);
      if (close) { advance(it.id); remove(it.id); }
      else setItems(xs => xs.map(x => x.id === it.id ? Object.assign({}, x, { unread: false, thread: (x.thread || []).concat([{ who: (r.reply && r.reply.sentByName) || (ctx.me && ctx.me.name) || "You", at: (r.reply && r.reply.sentAt) || new Date().toISOString(), body, mine: true }]) }) : x));
      ctx.toast(r.text);
      ctx.refreshCounts();
      return true;
    } catch (e) {
      ctx.toast(crErr(e, "The reply wasn’t sent. Your words are kept — try again."), null, true);
      return false;
    }
  };

  /** Several at once: count read before the confirm, every verdict reported. */
  const bulk = async label => {
    const list = pickedItems.slice(0, 100);
    if (!list.length) return;
    const ok = await ctx.confirm({ title: label + " " + crPlural(list.length, "item", "items") + "?", body: pickedItems.length > 100 ? "The first 100 are done now; run it again for the rest." : "Each is done one by one; any that are refused are named.", cta: label + " " + list.length, danger: crIsDanger(label) });
    if (!ok) return;
    let done = 0; const bad = [];
    for (const it of list) {
      const a = it.actions.find(x => x.l === label);
      try { await a.run(it, {}); done++; remove(it.id); }
      catch (e) { bad.push(it.who + ": " + crErr(e, "refused")); }
    }
    setPicked({}); setHandled(n => n + done); ctx.refreshCounts();
    ctx.toast(bad.length ? label + " · " + done + " of " + list.length + " done. Not done — " + bad.slice(0, 3).join("; ") + (bad.length > 3 ? "…" : "") : label + " · " + crPlural(done, "item", "items"), null, bad.length > 0);
  };

  /* Keys, through the shell's handler so palette and forms keep priority. */
  React.useEffect(() => {
    ctx.setQueue({
      key: e => {
        const k = e.key;
        if (k === "j" || k === "k") { setSelId(crQueueMove(ids, sel && sel.id, k === "j" ? 1 : -1)); return true; }
        if (k === "s") { if (searchRef.current) searchRef.current.focus(); return true; }
        if (!sel) return false;
        if (k === "x") { setPicked(p => Object.assign({}, p, { [sel.id]: !p[sel.id] })); return true; }
        if (k === "r" && sel.reply) { const t = paneRef.current && paneRef.current.querySelector("textarea"); if (t) t.focus(); return true; }
        if (k === "e") { const a = sel.actions.find(x => x.l === "Mark done"); if (a) { act(sel, a); return true; } return false; }
        if (/^[1-9]$/.test(k)) { const a = sel.actions[Number(k) - 1]; if (a) { paneRef.current && paneRef.current.dispatchEvent(new CustomEvent("cr-ib-act", { detail: Number(k) - 1 })); return true; } }
        return false;
      },
    });
    return () => ctx.setQueue(null);
  });

  const setSortP = v => { setSort(v); crLsSet("ngg.cr.inbox.sort", v); };
  const goView = id => { setSelId(null); setPicked({}); setOpen(false); ctx.go("inbox", id); };
  const viewLabel = (views.find(v => v.id === view) || {}).label || "Inbox";

  const rail = (
    <nav className="cr-ib-rail" aria-label="Inbox views">
      {views.map(v => (
        <button key={v.id} type="button" className="cr-ib-view" aria-current={v.id === view ? "page" : undefined} onClick={() => goView(v.id)}
          aria-label={v.label + (counts[v.id] > 0 ? ", " + counts[v.id] + " waiting" : "")} title={v.label}>
          <CrIcon n={v.id === "all" ? "tray" : (CR_INBOX_ICON[v.id] || "circle")}/>
          <span className="cr-grow">{v.label}</span>
          {counts[v.id] > 0 && <span className="cr-ib-n">{counts[v.id]}</span>}
        </button>
      ))}
      <div className="cr-ib-rail-foot">
        {handled > 0 && <span><CrIcon n="check-circle"/>{crPlural(handled, "item", "items")} handled</span>}
        {data.failed && data.failed.length > 0 && <span className="cr-ib-warn"><CrIcon n="warning"/>{data.failed.map(k => (views.find(v => v.id === k) || {}).label || k).join(", ")} didn’t load</span>}
        <button type="button" className="cr-linkbtn" aria-label="Refresh" title="Refresh" onClick={() => ctx.reload()}><CrIcon n="arrow-clockwise"/>Refresh</button>
      </div>
    </nav>
  );

  const chips = [["all", "All"], ["unread", "Unread"], ["overdue", "Overdue" + (overdueN ? " · " + overdueN : "")], ["reply", "To reply"]]
    .filter(c => c[0] !== "reply" || items.some(x => x.reply));

  const list = (
    <section className="cr-ib-list" aria-label={viewLabel}>
      {/* Asked where it makes sense: the inbox, which is what it would tell them about. */}
      {typeof NggPushNudge === "function" ? <div className="cr-ib-push"><NggPushNudge surface="admin" text="New requests and messages, as they land. Quiet at night."/></div> : null}
      <div className="cr-ib-tools">
        <div className="cr-searchbox" role="search">
          <CrIcon n="magnifying-glass"/>
          <input ref={searchRef} placeholder={"Search " + viewLabel.toLowerCase()} aria-label={"Search " + viewLabel} value={q} onChange={e => setQ(e.target.value)}/>
          {q && <button type="button" className="cr-iconbtn is-xs" aria-label="Clear search" onClick={() => setQ("")}><CrIcon n="x"/></button>}
        </div>
        <div className="cr-ib-chiprow">
          <div className="cr-ib-chips" role="group" aria-label="Show">
            {chips.map(c => <button key={c[0]} type="button" className="cr-ib-chip" aria-pressed={chip === c[0]} onClick={() => setChip(c[0])}>{c[1]}</button>)}
          </div>
          <label className="cr-ib-sort"><span className="cr-sr">Order</span>
            <select value={sort} onChange={e => setSortP(e.target.value)}>
              <option value="triage">Needs you first</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option>
            </select>
          </label>
        </div>
        <p className="cr-sr" role="status" aria-live="polite">{crPlural(shown.length, "item", "items")}</p>
      </div>
      {pickedItems.length > 0 && (
        <div className="cr-ib-bulk" role="region" aria-label="Selected items">
          <b>{pickedItems.length} selected</b>
          {crInboxBulkActions(pickedItems).map(l => <button key={l} type="button" className={"cr-btn is-sm" + (crIsDanger(l) ? " is-danger" : "")} onClick={() => bulk(l)}>{l}</button>)}
          {!crInboxBulkActions(pickedItems).length && <span className="cr-ib-bulk-why">These need a decision one at a time.</span>}
          <button type="button" className="cr-linkbtn" onClick={() => setPicked({})}>Clear</button>
        </div>
      )}
      <div className="cr-ib-rows">
        {!items.length ? <CrInboxClear handled={handled} phone={phone}/> :
         !shown.length ? <div className="cr-ib-none"><b>Nothing here</b><span>{q ? "No item matches “" + q + "”." : chip !== "all" ? "Nothing " + chips.find(c => c[0] === chip)[1].split(" ·")[0].toLowerCase() + " in this view." : "This view is clear."}</span>{(q || chip !== "all") && <button type="button" className="cr-btn is-sm" onClick={() => { setQ(""); setChip("all"); }}>Show everything</button>}</div> :
         groups.map(g => (
          <div key={g.key} role="group" aria-label={g.label || viewLabel}>
            {g.label && <div className={"cr-ib-ghead" + (g.key === "overdue" ? " is-bad" : "")}>{g.label}<span>{g.items.length}</span></div>}
            {g.items.map(it => <CrInboxRow key={it.id} it={it} now={now} on={sel && sel.id === it.id} picked={!!picked[it.id]} showKind={view === "all"}
              onOpen={() => { setSelId(it.id); if (phone) setOpen(true); }} onPick={v => setPicked(p => Object.assign({}, p, { [it.id]: v }))}/>)}
          </div>
        ))}
      </div>
    </section>
  );

  const pane = sel ? <CrInboxPane key={sel.id} it={sel} now={now} ctx={ctx} phone={phone} paneRef={paneRef} act={act} send={send} onBack={() => setOpen(false)}
    onJump={r => { if (items.some(z => z.id === r.id)) { setSelId(r.id); return; } if (r.y && typeof crReqOpen === "function") crReqOpen(ctx, r.y); }}/> : (
    <section className="cr-ib-pane is-empty"><CrIcon n="tray"/><span>{items.length ? "Choose an item to read it." : "Nothing is waiting."}</span></section>
  );

  if (phone) return (
    <div className="cr-ib is-phone">
      <div className="cr-ib-pviews" role="tablist" aria-label="Inbox views">
        {views.map(v => <button key={v.id} type="button" role="tab" className="cr-ib-chip" aria-selected={v.id === view} aria-pressed={v.id === view} onClick={() => goView(v.id)}>{v.label}{counts[v.id] > 0 ? " · " + counts[v.id] : ""}</button>)}
      </div>
      {list}
      {open && sel && <div className="cr-ib-sheet" role="dialog" aria-modal="true" aria-label={sel.who}>{pane}</div>}
    </div>
  );
  return <div className="cr-ib">{rail}{list}{pane}</div>;
}
const CR_INBOX_ICON = { messages: "envelope-simple", applications: "user-plus", approvals: "seal-check", requests: "hand", comments: "chat-circle", photos: "image", testimonials: "quotes" };

function CrInboxClear({ handled }) {
  return (
    <div className="cr-ib-zero">
      <span className="cr-ib-zero-ico"><CrIcon n="check"/></span>
      <b>Inbox clear</b>
      <span>{handled ? "You handled " + crPlural(handled, "item", "items") + ". New ones appear here as they arrive." : "Nothing is waiting on staff. New items appear here as they arrive."}</span>
    </div>
  );
}

function CrInboxRow({ it, now, on, picked, showKind, onOpen, onPick }) {
  const sla = crInboxSla(it, now);
  const draft = it.reply && crDraftGet(it.id);
  return (
    <div className={"cr-ib-row" + (it.unread ? " is-unread" : "") + (on ? " is-on" : "")}>
      <label className="cr-ib-pick"><input type="checkbox" checked={picked} onChange={e => onPick(e.target.checked)} aria-label={"Select " + it.who}/></label>
      <button type="button" className="cr-ib-rowbtn" aria-current={on ? "true" : undefined} onClick={onOpen}>
        <CrAvatar className="cr-ib-av" name={it.who} photo={it.photoUrl}/>
        <span className="cr-ib-rowt">
          <span className="cr-ib-row1"><b>{it.who}</b><time className={"cr-ib-age is-" + sla.tone} dateTime={it.at} title={it.at ? crDate(it.at, true) : ""}>{crAgo(it.at, now) || "now"}</time></span>
          <span className="cr-ib-row2">{showKind && <span className="cr-ib-kind"><CrIcon n={it.icon}/>{it.kind}</span>}<span className="cr-ib-title">{it.title}</span></span>
          {it.body && <span className="cr-ib-row3">{it.body}</span>}
          <span className="cr-ib-tags">
            {it.urgent && <span className="cr-ib-tag is-bad">Urgent</span>}
            {sla.overdue && <span className="cr-ib-tag is-bad">Overdue</span>}
            {draft && <span className="cr-ib-tag">Draft</span>}
            {it.thread && it.thread.some(t => t.mine) && <span className="cr-ib-tag is-ok">Replied</span>}
          </span>
        </span>
      </button>
    </div>
  );
}

/** The conversation pane: who and what, the thread, and the one place to act. */
function CrInboxPane({ it, now, ctx, phone, paneRef, act, send, onBack, onJump }) {
  const sla = crInboxSla(it, now);
  const [mode, setMode] = React.useState(it.reply ? "reply" : null);     // "reply" | index of a note action
  /* The reply box starts from the reply this item suggests (it.reply.draft),
     unless the person already began one here — that is never thrown away. */
  const startText = () => (it.reply ? (crDraftGet(it.id) || it.reply.draft || "") : "");
  const [text, setText] = React.useState(startText);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [tpl, setTpl] = React.useState(false);
  const taRef = React.useRef(null);
  const endRef = React.useRef(null);
  /* Open at the TOP — the subject, the facts and the first message are what
     a decision is read from; jumping to the end of a long message hid them.
     Only a reply added while it is open scrolls down to show itself. */
  const firstLen = React.useRef(it.thread ? it.thread.length : 0);
  React.useEffect(() => { const n = it.thread ? it.thread.length : 0; if (n > firstLen.current && endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: "end" }); firstLen.current = n; }, [it.thread && it.thread.length]);
  React.useEffect(() => { if (mode === "reply") crDraftSet(it.id, text); }, [text]);

  const noteAction = typeof mode === "number" ? it.actions[mode] : null;
  const choose = (a, i) => {
    setErr("");
    // A note may start from a drafted message (`dflt`) — a reply in full sentences, edited rather than typed.
    if (a.note) { setMode(i); setText(a.note.dflt || ""); setTimeout(() => taRef.current && taRef.current.focus(), 0); return; }
    act(it, a);
  };
  React.useEffect(() => {
    const el = paneRef.current; if (!el) return undefined;
    const h = e => { const a = it.actions[e.detail]; if (a) choose(a, e.detail); };
    el.addEventListener("cr-ib-act", h);
    return () => el.removeEventListener("cr-ib-act", h);
  });

  const submit = async close => {
    setErr("");
    const body = text.trim();
    if (noteAction) {
      if (noteAction.note.req && !body) { setErr("Enter " + noteAction.note.l.toLowerCase() + "."); return; }
      setBusy(true); const ok = await act(it, noteAction, { why: body }); setBusy(false);
      if (!ok) return;
      // An action that keeps the item (an ask) returns the pane to its actions.
      if (noteAction.keep) { setMode(it.reply ? "reply" : null); setText(startText()); }
      return;
    }
    if (!body) { setErr("Write the reply first."); return; }
    setBusy(true); const ok = await send(it, body, close); setBusy(false);
    if (ok) setText("");
  };
  const onKey = e => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(e.shiftKey); }
    if (e.key === "Escape" && noteAction) { e.stopPropagation(); setMode(it.reply ? "reply" : null); setText(startText()); }
  };
  const templates = it.reply ? CR_INBOX_REPLIES.filter(t => !t.for || t.for === it.reply.purpose).concat(CR_INBOX_REPLIES.filter(t => t.for && t.for !== it.reply.purpose)) : [];
  const useTpl = t => { setText(crFillReply(t.t, it.reply.vars)); setTpl(false); setTimeout(() => taRef.current && taRef.current.focus(), 0); };
  const composing = mode === "reply" || noteAction;

  return (
    <section className="cr-ib-pane" ref={paneRef} aria-label={it.who}>
      <header className="cr-ib-phead">
        {phone && <button type="button" className="cr-p44" aria-label="Back to the list" onClick={onBack}><CrIcon n="caret-left"/></button>}
        <CrAvatar className="cr-ib-av" name={it.who} photo={it.photoUrl}/>
        <div className="cr-grow">
          <h2>{it.who}</h2>
          <p><span className="cr-ib-kind"><CrIcon n={it.icon}/>{it.kind}</span> · <span className={"cr-ib-age is-" + sla.tone}>{sla.overdue ? "Overdue · waiting " : "Waiting "}{crAgo(it.at, now) || "a moment"}</span></p>
        </div>
        {it.actions.filter(a => !a.note && a.tone !== "primary" && !a.form).length > 0 && (
          <div className="cr-ib-quick">
            {it.actions.map((a, i) => (!a.note && a.tone !== "primary" && !a.form) ? <button key={i} type="button" className={"cr-btn is-sm" + (crIsDanger(a.l) ? " is-danger" : "")} onClick={() => choose(a, i)} aria-keyshortcuts={String(i + 1)}>{a.l}</button> : null)}
          </div>
        )}
      </header>

      <div className="cr-ib-pbody">
        <h3 className="cr-ib-subject">{it.title}</h3>
        {it.note && <p className="cr-ib-callout"><CrIcon n="info"/>{it.note}</p>}
        {it.photoUrl && it.cat === "photos" && (it.kind === "Photo change" ? (
          <div className="cr-ib-photos">
            <figure><figcaption>Now</figcaption>{it.oldPhotoUrl ? <img className="cr-ib-photo" src={it.oldPhotoUrl} alt={"Current photo of " + it.who}/> : <span className="cr-ib-photo is-empty">No photo yet</span>}</figure>
            <CrIcon n="arrow-right"/>
            <figure><figcaption>Asked for</figcaption><img className="cr-ib-photo" src={it.photoUrl} alt={"Photo " + it.who + " asked for"}/></figure>
          </div>
        ) : <img className="cr-ib-photo" src={it.photoUrl} alt={"Headshot uploaded for " + it.who}/>)}
        {it.facts.length > 0 && <dl className="cr-ib-facts">{it.facts.map((f, i) => <div key={i}><dt>{f[0]}</dt><dd>{f[1] == null || f[1] === "" ? "—" : f[1]}</dd></div>)}</dl>}
        {it.thread ? (
          <ol className="cr-ib-thread" aria-label="Conversation">
            {it.thread.map((m, i) => (
              <li key={i} className={"cr-ib-msg" + (m.mine ? " is-mine" : "")}>
                <span className="cr-ib-msgmeta"><b>{m.who}</b>{m.sub ? <span className="cr-ib-msgsub"> · {m.sub}</span> : null}{m.at ? " · " + crDate(m.at, true) : ""}{m.mine ? " · emailed" : ""}</span>
                <p className="cr-ib-bubble">{m.body}</p>
              </li>
            ))}
            <li ref={endRef} aria-hidden="true"/>
          </ol>
        ) : it.body ? <blockquote className="cr-ib-quote">{it.body}</blockquote> : null}
        {it.related && it.related.length > 0 && (
          <section className="cr-ib-rel" aria-labelledby={"cr-ib-rel-" + it.id}>
            <h4 id={"cr-ib-rel-" + it.id} className="cr-ib-rel-h">Also waiting from {it.who}<span>{it.related.length}</span></h4>
            {it.relatedTip && <p className="cr-ib-callout"><CrIcon n="lightbulb"/>{it.relatedTip}</p>}
            <ul className="cr-ib-rel-list">
              {it.related.map(r => (
                <li key={r.id}><button type="button" className="cr-ib-rel-row" onClick={() => onJump && onJump(r)}>
                  <CrIcon n={r.icon}/><span className="cr-grow"><b>{r.t}</b><span>{r.s}</span></span><CrIcon n="caret-right"/>
                </button></li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="cr-ib-act">
        {composing ? (
          <div className="cr-ib-compose">
            <div className="cr-ib-compose-h">
              {noteAction ? <b>{noteAction.l}{noteAction.note.req ? "" : " · optional note"}</b> : <b>Reply to {it.reply.to}</b>}
              <span className="cr-grow"/>
              {mode === "reply" && <div className="cr-ib-tplwrap">
                <button type="button" className="cr-linkbtn" aria-haspopup="menu" aria-expanded={tpl} onClick={() => setTpl(v => !v)}><CrIcon n="lightning"/>Saved replies</button>
                {tpl && <div className="cr-menu cr-ib-tpls" role="menu" aria-label="Saved replies">{templates.map((t, i) => <button key={i} type="button" role="menuitem" className="cr-menuitem" onClick={() => useTpl(t)}><span className="cr-grow">{t.l}</span>{t.for && t.for === it.reply.purpose && <span className="cr-ib-tag is-ok">Suggested</span>}</button>)}</div>}
              </div>}
              {noteAction && <button type="button" className="cr-linkbtn" onClick={() => { setMode(it.reply ? "reply" : null); setText(startText()); setErr(""); }}>Cancel</button>}
            </div>
            <textarea ref={taRef} className="cr-ib-ta" rows={phone ? 4 : 7} value={text} maxLength={noteAction ? 2000 : 5000}
              placeholder={noteAction ? (noteAction.note.ph || noteAction.note.help) : "Write a reply. It is emailed to them and kept here."}
              aria-label={noteAction ? noteAction.note.l : "Reply"} aria-invalid={err ? "true" : undefined} aria-describedby={"cr-ib-help-" + it.id}
              onChange={e => { setText(e.target.value); if (err) setErr(""); }} onKeyDown={onKey}/>
            <div className="cr-ib-compose-f">
              <span id={"cr-ib-help-" + it.id} className={err ? "cr-ib-err" : "cr-ib-help"} role={err ? "alert" : undefined}>{err || (noteAction ? noteAction.note.help : (text ? "Draft kept on this device · " : "") + "⌘↵ send · ⇧⌘↵ send and close")}</span>
              {noteAction ? (
                <button type="button" className={"cr-btn" + (crIsDanger(noteAction.l) ? " is-danger" : " is-primary")} disabled={busy} onClick={() => submit(false)}>{busy ? "Working…" : noteAction.l}</button>
              ) : <>
                <button type="button" className="cr-btn" disabled={busy || !text.trim()} onClick={() => submit(true)}>Send and close</button>
                <button type="button" className="cr-btn is-primary" disabled={busy || !text.trim()} onClick={() => submit(false)}><CrIcon n="paper-plane-tilt"/>{busy ? "Sending…" : "Send"}</button>
              </>}
            </div>
          </div>
        ) : null}
        {!noteAction && (it.actions.some(a => a.note || a.tone === "primary" || a.form)) && (
          <div className="cr-ib-decide" role="group" aria-label="Decide">
            {it.actions.map((a, i) => (a.note || a.tone === "primary" || a.form) ? (
              <button key={i} type="button" className={"cr-btn" + (a.tone === "primary" ? " is-primary" : crIsDanger(a.l) ? " is-danger" : "")} aria-keyshortcuts={String(i + 1)} onClick={() => choose(a, i)}>{a.l}{!phone && <kbd className="cr-ib-kbd">{i + 1}</kbd>}</button>
            ) : null)}
            {!phone && <span className="cr-ib-keys">J/K move · X select{it.reply ? " · R reply" : ""}{it.actions.some(a => a.l === "Mark done") ? " · E done" : ""}</span>}
          </div>
        )}
      </footer>
    </section>
  );
}

/* ── The tabs: one workspace, opened on the view the URL names ── */
function crInboxTab(key) {
  return {
    workspace: true,
    skeleton: ["queue"],
    count: async () => {
      const ov = await crOverview(); const w = ov.waiting || {};
      if (key === "messages") return (ov.messages || {}).unread || 0;
      return w[key] ? w[key].n : 0;
    },
    load: crInboxLoad,
    facts: d => {
      const c = crInboxCounts(d.items); const od = d.items.filter(x => crInboxSla(x).overdue).length;
      return "Waiting on staff: " + Object.keys(c).filter(k => k !== "all").map(k => c[k] + " " + k).join(", ") + (od ? "; " + od + " overdue" : "");
    },
    blocks: () => [],
    actions: (d, ctx) => key === "applications" && ctx.can("people") ? [{ l: "Export applications", icon: "download-simple", run: async () => {
      const r = await NGGApi.admin.applications.list({});
      crDownloadCsv("applications", CR_APP_EXPORT.map(c => c[0]), (r.applications || []).map(a => CR_APP_EXPORT.map(c => c[1](a, a.details || {}))));
    } }] : key === "photos" && ctx.can("summer") ? [{ l: "Ask families for missing photos", icon: "camera", run: async () => {
      const m = await NGGApi.admin.photos.missing(200).catch(() => null);
      const due = m ? (m.students || []).filter(s => s.reachable && !s.askedAt).length : 0;
      if (!due) return ctx.toast(m && m.total ? "Every family that can be asked has been asked in the last 3 days." : "Every participant has a photo on file.");
      const ok = await ctx.confirm({ title: "Ask " + Math.min(50, due) + " families for a photo?", body: crPlural(m.total, "child", "children") + " in Summer School have no photo, so their ID cards can’t print. Each family gets an upload link. Up to 50 go now; run it again for the rest.", cta: "Send" });
      if (!ok) return;
      try { const r = await NGGApi.admin.photos.requestMissing(50, 3); ctx.toast(r.asked ? "Asked " + crPlural(r.asked, "family", "families") + (r.remaining ? " · " + r.remaining + " still due" : " · that’s everyone") : (r.message || "Nobody is due right now.")); }
      catch (e) { ctx.toast(crErr(e), null, true); }
    } }] : [],
    render: (d, ctx, phone) => <CrInbox data={d} ctx={ctx} phone={phone}/>,
  };
}
CR_PAGES.inbox.frame = "workspace";
Object.assign(CR_TAB_DEFS, {
  all: crInboxTab("all"),
  applications: crInboxTab("applications"),
  approvals: crInboxTab("approvals"),
  requests: crInboxTab("requests"),
  messages: crInboxTab("messages"),
  comments: crInboxTab("comments"),
  photos: crInboxTab("photos"),
  testimonials: crInboxTab("testimonials"),
});
