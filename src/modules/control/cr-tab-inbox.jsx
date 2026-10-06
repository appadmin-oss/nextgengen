/* ============================================================================
   Control Room v2 — Inbox (CONTROL_ROOM.md §3 queue). Every queue that waits
   on staff, one source per tab and all of them together in "All". An item is
   { id, kind, icon, who, at, when, unread, urgent, title, fields, body,
   photoUrl, actions:[{ l, run(it, values) → undo?, form?(it), confirm?(it) }] }.
   A resolving action returns an undo where the server can genuinely reverse
   it; where it cannot (a member created, a comment deleted, an approval run)
   there is no Undo, and the irreversible ones ask first.
   ========================================================================== */

function crQItem(o) { return Object.assign({ unread: false, urgent: false, fields: [], body: "", actions: [] }, o, { when: crAgo(o.at) || "now" }); }
function crMask(phone) { const s = String(phone || "").replace(/\s+/g, ""); return s.length > 6 ? s.slice(0, 4) + " ••• " + s.slice(-3) : s; }
const CR_REASON = (title, l, help) => () => ({ title, submit: l, fields: [{ id: "why", l: "Reason", type: "textarea", req: true, max: 400, help: help || "They read this." }] });

/* ── Sources ── */
const CR_INBOX_SOURCES = {
  applications: {
    cap: "people",
    async load() {
      const r = await NGGApi.admin.applications.list({ status: "new" });
      const rv = await NGGApi.admin.applications.list({ status: "reviewing" }).catch(() => ({ applications: [] }));
      return (r.applications || []).concat(rv.applications || []).filter(a => a.kind !== "volunteer").map(a => {
        const prog = a.program === "summer" ? "Summer School" : "NGG membership";
        const status = (to, prev) => async () => { await NGGApi.admin.applications.status(a.id, to); return { text: (to === "waitlist" ? "Waitlisted" : "Rejected") + " · " + a.name, undo: () => NGGApi.admin.applications.status(a.id, prev || "new") }; };
        const actions = a.kind === "teen" ? [
          { l: "Accept & create member", confirm: () => ({ title: "Create a member for " + a.name + "?", body: "They get an NGG record and a member ID. This can’t be undone from here.", cta: "Accept & create member" }),
            run: async () => { const x = await NGGApi.admin.applications.convert(a.id); return { text: x.existed ? a.name + " already had a record · " + x.memberId : "Member created · " + x.memberId }; } },
          { l: "Waitlist", run: status("waitlist", a.status) },
          { l: "Reject", run: status("rejected", a.status) },
        ] : [
          { l: "Accept", run: async () => { await NGGApi.admin.applications.status(a.id, "accepted"); return { text: "Accepted · " + a.name, undo: () => NGGApi.admin.applications.status(a.id, a.status || "new") }; } },
          { l: "Waitlist", run: status("waitlist", a.status) },
          { l: "Reject", run: status("rejected", a.status) },
        ];
        return crQItem({ id: "app:" + a.id, kind: "Application", icon: "envelope-simple", who: a.name || a.email || "Applicant", at: a.createdAt, unread: a.status === "new",
          title: [prog, a.track || a.role].filter(Boolean).join(" · "), photoUrl: a.photoUrl || "",
          fields: [["Age", a.age || a.dobAge || "—"], ["Centre", a.centre || "—"], ["Division", a.track || "—"], ["Role", a.role || ""], ["Email", a.email || "—"], ["Phone", crMask(a.phone)], ["Photo", a.photoUrl ? "Uploaded" : "Missing"], ["Reference", a.ref || ""]].filter(f => f[1] !== ""),
          body: a.why ? "“" + a.why + "”" : "", actions });
      });
    },
  },
  approvals: {
    cap: "people",
    async load() {
      const [ap, fam] = await Promise.all([NGGApi.admin.approvals.list("pending"), NGGApi.admin.families.list({ status: "pending" }).catch(() => ({ rows: [] }))]);
      const items = (ap.approvals || []).map(x => crQItem({
        id: "apr:" + x.approvalId, kind: "Approval", icon: "seal-check", who: x.requesterName || x.requesterId, at: x.createdAt, unread: true,
        title: x.summary, fields: [["Request", x.approvalId], ["Asked by", x.requesterName || x.requesterId], ["Runs as", "The person who asked, the moment you approve"]],
        actions: ap.canDecide ? [
          { l: "Approve", confirm: () => ({ title: "Approve and run it now?", body: x.summary + "\n\nIt runs as " + (x.requesterName || "them") + " and can’t be undone from here.", cta: "Approve" }),
            run: async () => { const r = await NGGApi.admin.approvals.decide(x.approvalId, "approve", ""); if (r.status === "failed") throw Object.assign(new Error("failed"), { data: { message: "Approved, but the action itself was refused: " + ((r.result && (r.result.message || r.result.error)) || "no reason given") } }); return { text: "Approved and done · " + x.summary }; } },
          { l: "Reject", form: CR_REASON("Reject this request", "Reject", "The person who asked reads this."), run: async (it, v) => { await NGGApi.admin.approvals.decide(x.approvalId, "reject", v.why); return { text: "Rejected · " + x.summary }; } },
        ] : [
          { l: "Withdraw", run: async () => { await NGGApi.admin.approvals.withdraw(x.approvalId); return { text: "Withdrawn — nothing was changed" }; } },
        ],
      }));
      (fam.rows || []).forEach(f => items.push(crQItem({
        id: "fam:" + f.linkId, kind: "Family link", icon: "house-line", who: f.guardianName || f.guardianEmail, at: f.createdAt, unread: true,
        title: "Wants to connect to " + f.fullName, fields: [["Relationship", f.relationshipLabel || "—"], ["Child", f.fullName + (f.displayId ? " · " + f.displayId : "")], ["Centre", f.centre || "—"],
          ["Guardian on record", (f.recordParentName || "—") + (f.recordParentEmail ? " · " + f.recordParentEmail : "")], ["Method", f.via === "code" ? "Child’s code" : "Record email"], ["Email", f.guardianEmail || "—"]],
        body: f.note || "",
        actions: [
          { l: "Approve link", run: async () => { const r = await NGGApi.admin.families.decide("approve", [f.linkId]); const bad = (r.results || []).find(x => !x.ok); if (bad) throw Object.assign(new Error(bad.error), { code: bad.error }); return { text: "Connected · the parent has been emailed" }; } },
          { l: "Decline", form: CR_REASON("Decline this connection", "Decline", "The parent reads this."), run: async (it, v) => { const r = await NGGApi.admin.families.decide("refuse", [f.linkId], v.why); const bad = (r.results || []).find(x => !x.ok); if (bad) throw Object.assign(new Error(bad.error), { code: bad.error }); return { text: "Declined · the parent has been emailed" }; } },
        ],
      })));
      return items;
    },
  },
  requests: {
    cap: "people",
    async load(ctx) {
      const r = await NGGApi.admin.requests.list({ status: "open" });
      const canMoney = ctx.can("fees");
      return (r.requests || []).map(x => {
        const pay = x.kind === "payment";
        const f = [["Member", (x.fullName || "") + (x.displayId ? " · " + x.displayId : "")], ["Centre", x.centre || "—"]];
        if (pay) f.push(["Claims", fmtMoney(x.amount)], ["Reference", x.reference || "—"], ["Paid on", x.paidAt ? crDate(x.paidAt) : "—"]);
        if (x.kind === "leave") f.push(["From", x.fromDate ? crDate(x.fromDate) : "—"], ["To", x.toDate ? crDate(x.toDate) : "Open-ended"]);
        if (x.byFamily) f.push(["Raised by", (x.raisedByName || "Their family") + " · the parent is emailed your reply"]);
        const approve = pay ? (canMoney ? {
          l: "Approve", form: () => ({ title: "Approve this payment", submit: "Approve and post", intro: "The amount you post is what arrived, not necessarily what was claimed.",
            values: { amount: String(x.amount || ""), why: "" },
            fields: [{ id: "amount", l: "Amount to post (₦)", req: true, num: true, money: true, im: "decimal" }, { id: "why", l: "Your reply", type: "textarea", max: 2000, help: "The member reads this." }] }),
          run: async (it, v) => { await NGGApi.admin.requests.decide(x.requestId, true, v.why || "", Number(String(v.amount).replace(/[^\d.]/g, ""))); return { text: "Payment posted · " + x.fullName }; },
        } : null) : {
          l: "Approve", form: () => ({ title: "Approve this request", submit: "Approve", fields: [{ id: "why", l: "Your reply", type: "textarea", max: 2000, help: "The member reads this." }] }),
          run: async (it, v) => { await NGGApi.admin.requests.decide(x.requestId, true, v.why || ""); return { text: "Approved · " + x.fullName }; },
        };
        return crQItem({ id: "req:" + x.requestId, kind: x.kindLabel || "Member request", icon: pay ? "currency-ngn" : "hand", who: x.fullName || x.displayId, at: x.createdAt, unread: true,
          title: x.subject || x.kindLabel, fields: f, body: x.body || "",
          actions: [approve, { l: "Decline", form: CR_REASON("Decline this request", "Decline", "Say why — the member reads this."), run: async (it, v) => { await NGGApi.admin.requests.decide(x.requestId, false, v.why); return { text: "Declined, with your reason" }; } }].filter(Boolean)
            .concat(pay && !canMoney ? [] : []),
          note: pay && !canMoney ? "Approving a payment needs the Fees permission." : "" });
      });
    },
  },
  messages: {
    cap: "inbox",
    async load() {
      const r = await NGGApi.admin.contact.list({});
      return (r.messages || []).filter(m => m.status === "new" || m.status === "read").map(m => {
        const set = (to, label) => async () => { await NGGApi.admin.contact.status(m.id, to); return { text: label + " · " + m.name, undo: () => NGGApi.admin.contact.status(m.id, m.status) }; };
        return crQItem({ id: "msg:" + m.id, kind: "Message", icon: "envelope-open", who: m.name, at: m.createdAt, unread: m.status === "new", urgent: m.purpose === "support",
          title: m.subject || (m.message || "").slice(0, 80), body: m.message,
          fields: [["Email", m.email || "—"], ["Phone", crMask(m.phone)], ["Topic", ({ general: "General", apply: "Admissions", mentor: "Mentoring", partner: "Partnership", media: "Media", support: "Support" })[m.purpose] || m.purpose || "—"], ["Reference", m.ref || ""]].filter(f => f[1] !== ""),
          actions: [
            { l: "Reply", run: async () => {
              const href = "mailto:" + encodeURIComponent(m.email || "") + "?subject=" + encodeURIComponent("Re: " + (m.subject || "Your message") + (m.ref ? " (" + m.ref + ")" : ""));
              window.location.href = href;
              await NGGApi.admin.contact.status(m.id, "replied");
              return { text: "Marked replied · " + m.name, undo: () => NGGApi.admin.contact.status(m.id, m.status) };
            } },
            { l: "Mark done", run: set("archived", "Done") },
          ] });
      });
    },
  },
  comments: {
    cap: "content",
    async load() {
      const r = await NGGApi.admin.comments("pending");
      return (r.comments || []).map(c => {
        const link = /https?:\/\/|www\./i.test(c.body || "");
        return crQItem({ id: "cmt:" + c.commentId, kind: "Comment", icon: "chat-circle", who: c.memberName || "Member", at: c.createdAt, unread: true,
          title: "On “" + (c.postTitle || c.postSlug || c.postId) + "”", body: c.body,
          fields: [["Post", c.postTitle || c.postSlug || c.postId], ["Flags", link ? "Link · check before approving" : "None"]],
          actions: [
            { l: "Approve", run: async () => { await NGGApi.admin.commentModerate(c.commentId, "approve"); return { text: "Approved · it’s on the post now", undo: () => NGGApi.admin.commentModerate(c.commentId, "reject") }; } },
            { l: "Reject", run: async () => { await NGGApi.admin.commentModerate(c.commentId, "reject"); return { text: "Rejected · it stays hidden", undo: () => NGGApi.admin.commentModerate(c.commentId, "approve") }; } },
            { l: "Delete", confirm: () => ({ title: "Delete this comment?", body: "It is removed for good. This can’t be undone.", cta: "Delete", danger: true }), run: async () => { await NGGApi.admin.commentModerate(c.commentId, "delete"); return { text: "Deleted" }; } },
          ] });
      });
    },
  },
  photos: {
    cap: "content",
    async load(ctx) {
      const r = await NGGApi.admin.photos.queue();
      return (r.queue || []).map(p => {
        const f = p.aiFindings || {};
        const flags = (f.flags || []).map(x => String(x).replace(/_/g, " "));
        const who = p.subjectName || (p.subjectType + " " + p.subjectId);
        const actions = [
          { l: "Approve", run: async () => { await NGGApi.admin.photos.approve(p.assetId, p.editedUrl || "", ""); return { text: "Photo approved · " + who }; } },
          { l: "Ask for reshoot", form: () => ({ title: "Ask for a reshoot", submit: "Send", fields: [{ id: "why", l: "What to fix", req: true, max: 300, ph: "Please retake against a plain wall.", help: p.subjectType === "student" ? "The guardian is emailed a reshoot link with this." : "They are told this." }] }),
            run: async (it, v) => { await NGGApi.admin.photos.retake(p.assetId, v.why); return { text: "Reshoot requested · " + who }; } },
        ];
        if (ctx.can("people")) actions.push({ l: "Reject", form: CR_REASON("Reject this photo", "Reject", "Kept on the photo’s record."), run: async (it, v) => { await NGGApi.admin.photos.reject(p.assetId, v.why); return { text: "Photo rejected · " + who }; } });
        return crQItem({ id: "pho:" + p.assetId, kind: "Headshot", icon: "image", who, at: p.createdAt, unread: p.status === "pending_review",
          title: "New headshot for ID card", photoUrl: p.editedUrl || p.sourceUrl,
          fields: [["Subject", (p.subjectType === "student" ? "Participant" : p.subjectType === "volunteer" ? "Volunteer" : "Member") + " · " + p.subjectId + (p.subjectCentre ? " · " + p.subjectCentre : "")],
            ["Check", p.aiScore == null ? "Not analysed — look carefully" : "Score " + p.aiScore + (flags.length ? " · " + flags.join(", ") : "")]]
            .concat((f.issues || []).length ? [["Issues", f.issues.join("; ")]] : []).concat(p.status === "in_review" ? [["Status", "Claimed by another reviewer"]] : []),
          actions });
      });
    },
  },
};

/* The tabs. Each is one queue block; Photos adds the children with no photo at all. */
function crInboxTab(key, extra) {
  return Object.assign({
    skeleton: ["queue"],
    count: async ctx => { const ov = await crOverview(); const w = ov.waiting || {}; return key === "approvals" ? (w.approvals ? w.approvals.n : 0) : (w[key] ? w[key].n : 0); },
    load: async ctx => ({ items: await CR_INBOX_SOURCES[key].load(ctx) }),
    blocks: (d, ctx) => [{ type: "queue", span: 6, items: d.items, emptyText: "Nothing is waiting here.", onResolved: () => ctx.refreshCounts() }],
  }, extra || {});
}

Object.assign(CR_TAB_DEFS, {
  applications: crInboxTab("applications", {
    actions: (d, ctx) => [{ l: "Export CSV", icon: "download-simple", run: async () => {
      const r = await NGGApi.admin.applications.list({});
      crDownloadCsv("applications", ["Kind", "Programme", "Name", "Email", "Age", "Centre", "Division", "Role", "Status", "Submitted"],
        (r.applications || []).map(a => [a.kind, a.program, a.name, a.email, a.age, a.centre, a.track, a.role, a.status, a.createdAt]));
    } }],
  }),
  approvals: crInboxTab("approvals"),
  requests: crInboxTab("requests"),
  messages: crInboxTab("messages", { count: async () => { const ov = await crOverview(); return (ov.messages || {}).unread || 0; } }),
  comments: crInboxTab("comments"),
  photos: crInboxTab("photos", {
    load: async ctx => {
      const [items, missing] = await Promise.all([CR_INBOX_SOURCES.photos.load(ctx), ctx.can("summer") ? NGGApi.admin.photos.missing(200).catch(() => null) : null]);
      return { items, missing };
    },
    blocks: (d, ctx) => {
      const out = [];
      const m = d.missing;
      if (m && m.total > 0) {
        const due = (m.students || []).filter(s => s.reachable && !s.askedAt).length;
        out.push({ type: "note", span: 6, icon: "camera-slash", tone: "warn",
          text: crPlural(m.total, "child", "children") + " in Summer School have no photo on file, so their ID cards can’t print.",
          sub: (m.students || []).filter(s => !s.reachable).length + " have no guardian email. Families asked in the last 3 days are skipped.",
          act: due ? { l: "Ask " + Math.min(50, due) + " families for a photo", run: async () => {
            const ok = await ctx.confirm({ title: "Send photo requests?", body: "Each family gets a link to upload a photo. Up to 50 go now; run it again for the rest.", cta: "Send" });
            if (!ok) return;
            try { const r = await NGGApi.admin.photos.requestMissing(50, 3); ctx.toast(r.asked ? "Asked " + crPlural(r.asked, "family", "families") + (r.remaining ? " · " + r.remaining + " still due" : " · that’s everyone") : (r.message || "Nobody is due right now.")); ctx.reload(); }
            catch (e) { ctx.toast(crErr(e), null, true); }
          } } : null });
      }
      out.push({ type: "queue", span: 6, items: d.items, emptyText: "Clean photos approve themselves; only flagged ones land here.", onResolved: () => ctx.refreshCounts() });
      return out;
    },
  }),
  all: {
    skeleton: ["queue"],
    count: async () => 0,
    load: async ctx => {
      const keys = ["messages", "applications", "approvals", "requests", "photos", "comments"].filter(k => ctx.can(CR_INBOX_SOURCES[k].cap));
      const lists = await Promise.all(keys.map(k => CR_INBOX_SOURCES[k].load(ctx).catch(() => [])));
      const items = [].concat(...lists).sort((a, b) => (b.urgent - a.urgent) || (Date.parse(a.at || 0) - Date.parse(b.at || 0)));
      return { items };
    },
    blocks: (d, ctx) => [{ type: "queue", span: 6, items: d.items, emptyText: "Nothing is waiting on staff. New items appear here as they arrive.", onResolved: () => ctx.refreshCounts() }],
  },
});
