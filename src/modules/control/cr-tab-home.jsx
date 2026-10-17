/* ============================================================================
   Control Room v2 — Home (CONTROL_ROOM.md §3: attention "Needs you · Oldest
   first" span 4 + System health span 2 + KPIs span 6, then the trends).
   Every row is filtered by the capability that owns the queue it opens, so
   nobody is shown work they cannot do.
   ========================================================================== */

/* One overview read serves Home and every Inbox pill; cached for a few seconds. */
let _crOverview = null;
function crOverview(force) {
  if (!force && _crOverview && Date.now() - _crOverview.at < 20000) return _crOverview.p;
  const p = NGGApi.admin.overview().then(r => r.overview || {});
  _crOverview = { at: Date.now(), p };
  p.catch(() => { _crOverview = null; });
  return p;
}

const CR_ATTENTION = [
  // [waiting key, label, sub(n, oldest), tone, cap, go]
  ["applications", "Applications to review", "", "gold", "people", ["inbox", "applications"]],
  ["unscreened", "Volunteers not yet screened", "Safeguarding check before their first shift", "bad", "people", ["mentors", "volunteers"]],
  ["volunteers", "Volunteer applications", "", "neutral", "people", ["mentors", "volunteers"]],
  ["approvals", "Approvals waiting", "A second admin has to decide these", "warn", "people", ["inbox", "approvals"]],
  ["requests", "Member requests", "", "neutral", "people", ["inbox", "requests"]],
  ["toGrade", "Submissions to grade", "", "neutral", "content", ["learning", "assignments"]],
  ["missions", "Missions to verify", "", "neutral", "content", ["learning", "missions"]],
  ["messages", "Unread messages", "", "neutral", "inbox", ["inbox", "messages"]],
  ["photos", "Headshots waiting", "Blocking ID cards from printing", "neutral", "content", ["inbox", "photos"]],
  ["comments", "Comments to moderate", "", "neutral", "content", ["inbox", "comments"]],
];

function crAuditIcon(ev) {
  const e = String(ev || "");
  if (/member\.(create|import)|join/.test(e)) return "user-plus";
  if (/fees|payment|ledger/.test(e)) return "currency-ngn";
  if (/broadcast|newsletter|announce/.test(e)) return "megaphone";
  if (/mentor|volunteer|safeguard/.test(e)) return "shield-check";
  if (/impersonate/.test(e)) return "user-switch";
  if (/auth|login|totp|lock/.test(e)) return "key";
  if (/photo/.test(e)) return "image";
  if (/card|ids\./.test(e)) return "identification-card";
  if (/mission|progress/.test(e)) return "check-circle";
  return "clock-counter-clockwise";
}
/** "member.bulk.status" → "Member bulk status". */
function crEventLabel(ev) {
  const s = String(ev || "").replace(/[._]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "Activity";
}
function crTimeOrDay(iso) {
  const t = Date.parse(iso || "");
  if (!t) return "";
  const d = new Date(t), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return crDate(iso);
}

Object.assign(CR_TAB_DEFS, {
  home: {
    skeleton: ["queue", "kpis"],
    load: async ctx => {
      const [ov, health, fees] = await Promise.all([
        crOverview(true),
        ctx.can("settings") ? NGGApi.admin.ops.status().catch(() => null) : null,
        ctx.can("fees") ? NGGApi.admin.fees.arrears(1).catch(() => null) : null,
      ]);
      return { ov, health, fees };
    },
    actions: (d, ctx) => [{ l: "Create", icon: "plus", primary: true, run: () => ctx.palette("actions") }],
    blocks: (d, ctx) => {
      const ov = d.ov || {}, w = ov.waiting || {}, m = ov.members || {}, now = Date.now();
      const rows = CR_ATTENTION.filter(a => ctx.can(a[4]) && w[a[0]] && w[a[0]].n > 0).map(a => {
        const x = w[a[0]], age = x.oldest ? now - Date.parse(x.oldest) : 0;
        return { n: x.n, l: a[1], s: a[2] || (x.oldest ? "Oldest has waited " + crAgo(x.oldest).replace(/m$/, " min").replace(/h$/, " h").replace(/d$/, " days").replace(/w$/, " weeks") : ""), tone: a[3], go: a[5], age };
      });
      /* Image storage near or at its limit is work for whoever holds settings: it goes in Needs you, first. */
      const cl = d.health && d.health.health && d.health.health.checks && d.health.health.checks.cloudinary;
      if (cl && (cl.level === "high" || cl.level === "critical")) rows.unshift({ n: Math.round(cl.usedPercent || 0) + "%", l: cl.level === "critical" ? "Image storage is full — uploads are paused" : "Image storage is nearly full",
        s: "Free space or upgrade the Cloudinary plan", tone: cl.level === "critical" ? "bad" : "warn", go: ["settings", "ops"], age: Infinity });
      const hasHealth = !!d.health;
      const out = [{ type: "attention", span: hasHealth ? 4 : 6, title: "Needs you", sub: "Oldest first", rows, empty: "Nothing is waiting on you. New work appears here as it arrives." }];
      if (hasHealth) {
        const c = (d.health.health && d.health.health.checks) || {};
        const ph = c.photos || {}, items = [];
        items.push(["Photo storage", ph.ok ? "Operational" : ph.where === "cache_fallback" ? "Degraded" : ph.where ? "Failing" : "Unknown", ph.ok ? "ok" : ph.where === "cache_fallback" ? "warn" : "bad"]);
        if (c.db) items.push(["Database", c.db.ok ? "Operational" : "Read-only", c.db.ok ? "ok" : "bad"]);
        if (c.schema) items.push(["Database schema", c.schema.ok ? "Up to date" : "Behind", c.schema.ok ? "ok" : "bad"]);
        if (c.cron) items.push(["Scheduled jobs", c.cron.ok ? "Running" : "Stale", c.cron.ok ? "ok" : "warn"]);
        if (c.cloudinary && c.cloudinary.configured) items.push(["Image service", c.cloudinary.state === "ok" ? "Operational" : String(c.cloudinary.state || "").replace(/_/g, " "), c.cloudinary.state === "ok" ? "ok" : "warn"]);
        if (c.mail) items.push(["Email delivery", c.mail.ok ? "Operational" : "Failing", c.mail.ok ? "ok" : "bad"]);
        const bad = items.filter(i => i[2] !== "ok").length;
        out.push({ type: "status", span: 2, title: "System health", summary: bad + " issue" + (bad === 1 ? "" : "s"), tone: bad ? "warn" : "ok", items, cta: "Open diagnostics", go: ["settings", "ops"] });
      }
      const ck = ov.checkins || [];
      const thisWk = ck.length ? ck[ck.length - 1].n : 0, lastWk = ck.length > 1 ? ck[ck.length - 2].n : 0;
      const dWk = thisWk - lastWk;
      const kp = [
        { l: "Active members", v: crNum(m.active), d: m.new30 ? "+" + crNum(m.new30) : "", dn: m.new30 ? "joined in 30 days" : "", tone: "up" },
        { l: "Check-ins this week", v: crNum(thisWk), d: ck.length > 1 && dWk ? (dWk > 0 ? "+" : "−") + crNum(Math.abs(dWk)) : "", dn: ck.length > 1 ? (dWk ? "vs last week" : "same as last week") : "", tone: dWk > 0 ? "up" : dWk < 0 ? "down" : "flat" },
        { l: "Missions verified", v: crNum((ov.anchor || {}).verified), dn: crNum((ov.anchor || {}).submitted) + " waiting" },
      ];
      if (d.fees) kp.push({ l: "Dues outstanding", v: fmtMoney(d.fees.totalPayable || 0), d: d.fees.matched ? crNum(d.fees.matched) : "", dn: d.fees.matched ? "accounts in arrears" : "nobody is in arrears", tone: "down" });
      else kp.push({ l: "Upcoming events", v: crNum((ov.events || {}).upcoming), dn: "published" });
      out.push({ type: "kpis", span: 6, items: kp });
      out.push({ type: "columns", span: 4, title: "Check-ins", sub: "Last 12 weeks · all centres", big: crNum(thisWk),
        bars: ck.map(x => ({ l: new Date(x.from + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), tip: "Week of " + crDate(x.from + "T12:00:00Z"), v: x.n })) });
      const byCentre = (ov.byCentre || []).map(r => [r.centre, Number(r.c) || 0]).sort((a, b) => b[1] - a[1]);
      const byTrack = (ov.byTrack || []).map(r => [r.track, Number(r.c) || 0]).slice(0, 6);
      out.push({ type: "bars", span: 2, title: "Members by centre", rows: byCentre, empty: "No active members have a centre yet." });
      out.push({ type: "bars", span: 2, title: "Members by division", rows: byTrack, empty: "No active members have a division yet." });
      out.push({ type: "list", span: 4, title: "Recent activity", action: ctx.can("audit") ? "Audit log" : null, onAction: () => ctx.go("settings", "audit"),
        rows: (ov.recent || []).slice(0, 8).map(r => ({ icon: crAuditIcon(r.event), t: crEventLabel(r.event) + (r.subject ? " · " + r.subject : ""), s: r.actorName || (r.actorId === "system" ? "Automatic" : r.actorId || ""), m: crTimeOrDay(r.at) })),
        empty: "Nothing has happened yet." });
      return out;
    },
  },
});
