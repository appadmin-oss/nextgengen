/* ============================================================================
   Control Room v2 — the system tabs (page `settings`). Filled into CR_TAB_DEFS
   (see cr-pages.jsx). Every top-level name here starts `crSy`.

   PROGRESS (for a resumed run): audit — built, verified.
   ========================================================================== */

/* ── Shared: the role registry, from the server (admin.roles). The screen keeps
   no copy of the roles (CLAUDE.md §11); loaded once per page, retried on fail. */
let crSyRolesP = null;
function crSyRoles() {
  if (!crSyRolesP) crSyRolesP = NGGApi.admin.roles().catch(e => { crSyRolesP = null; throw e; });
  return crSyRolesP;
}
function crSyRoleLabel(reg, id) {
  if (!id || id === "member") return "Member";
  const r = reg && (reg.roles || []).find(x => x.id === id);
  return r ? r.label : String(id).replace(/_/g, " ");
}

/* ══ Audit log ═══════════════════════════════════════════════════════════════
   v1 AdminAudit: server-paged trail, actor filter, event filter, staff-only,
   export of everything matching (not just the page), true total. */
const crSyAuditF = { current: { q: "", filters: {} } };
const CR_SY_ROLE_TONE = { super_admin: "gold", admin: "ok", club_admin: "ok", editor: "neutral" };
function crSyAuditQuery(q, f) {
  return { actor: (f && f.actor) || "", event: (q || "").trim(), staffOnly: f && f.staff === "1" ? 1 : "" };
}
function crSyAuditOpen(ctx, r, reg) {
  let meta = r.meta;
  try { meta = meta ? JSON.stringify(JSON.parse(meta), null, 2) : ""; } catch (_) { /* keep as written */ }
  ctx.drawer({
    title: r.event, name: r.actorName || r.actorId || "System",
    sub: crDate(r.at, true),
    fields: [["Who", r.actorName || r.actorId || "System"], ["Member ID", r.actorId || "—"], ["Role", r.actorRole ? crSyRoleLabel(reg, r.actorRole) : "—"],
      ["Event", r.event], ["Subject", r.subject || "—"], ["IP address", r.ip || "—"], ["When", crDate(r.at, true)]],
    sections: [meta ? { h: "Details recorded", text: meta } : null],
  });
}
function crSyAuditServer(d) {
  return {
    sortKeys: {},
    fetch: async ({ q, filters, page, pageSize }) => {
      crSyAuditF.current = { q, filters };
      const r = await NGGApi.admin.audit(Object.assign({ page: page + 1, pageSize }, crSyAuditQuery(q, filters)));
      return {
        total: r.total || 0,
        rows: (r.audit || []).map((x, i) => ({
          key: (x.at || "") + "-" + page + "-" + i,
          cells: [
            { k: "mono", t: crDate(x.at, true) },
            { k: "strong", t: x.actorName || x.actorId || "System", s: x.actorName && x.actorId ? x.actorId : "" },
            x.actorRole ? { k: "status", t: crSyRoleLabel(d.reg, x.actorRole), tone: CR_SY_ROLE_TONE[x.actorRole] || "neutral" } : { k: "text", t: "—" },
            { k: "mono", t: x.event },
            { k: "mono", t: x.subject || "—" },
            { k: "mono", t: x.ip || "—" },
          ],
          open: () => crSyAuditOpen(crSyAuditCtx.current, x, d.reg),
        })),
      };
    },
  };
}
const crSyAuditCtx = { current: null };
async function crSyAuditExport(ctx) {
  const f = crSyAuditF.current;
  try {
    const r = await NGGApi.admin.audit(Object.assign({ all: 1 }, crSyAuditQuery(f.q, f.filters)));
    const rows = r.audit || [];
    if (!rows.length) { ctx.toast("Nothing matches these filters, so there is nothing to export."); return; }
    crDownloadCsv("audit-trail", ["When", "Who", "Member ID", "Role", "Event", "Subject", "IP address"],
      rows.map(x => [x.at, x.actorName || "System", x.actorId || "", x.actorRole || "", x.event, x.subject || "", x.ip || ""]));
    ctx.toast("Exported " + crPlural(rows.length, "entry", "entries") + (r.total > rows.length ? " · the newest " + crNum(rows.length) + " of " + crNum(r.total) : ""));
  } catch (e) { ctx.toast(crErr(e, "Couldn’t export the audit log."), null, true); }
}

Object.assign(CR_TAB_DEFS, {
  audit: {
    skeleton: ["table"],
    load: async () => {
      const [first, reg] = await Promise.all([NGGApi.admin.audit({ page: 1, pageSize: 1 }), crSyRoles().catch(() => null)]);
      const d = { actors: first.actors || [], total: first.total || 0, reg };
      d.server = crSyAuditServer(d);
      return d;
    },
    actions: (d, ctx) => [{ l: "Export CSV", icon: "download-simple", primary: true, run: () => crSyAuditExport(ctx), disabled: !d.total, why: d.total ? undefined : "The log is empty." }],
    blocks: (d, ctx) => {
      crSyAuditCtx.current = ctx;
      return [
        { type: "note", span: 6, icon: "shield-check", text: "Every action taken by staff, newest first. Only super admins and the audit role can read this.",
          sub: crPlural(d.total, "entry", "entries") + " in all. Search matches the event name, for example “member” or “settings”." },
        { type: "table", span: 6, server: d.server, search: "Filter by event",
          cols: ["When", "Who", "Role", "Event", "Subject", "IP address"],
          filters: [
            { id: "actor", l: "Staff member", opts: d.actors.map(a => ({ v: a.actorId, l: (a.fullName || a.actorId) + " · " + crSyRoleLabel(d.reg, a.role) })) },
            { id: "staff", l: "Staff actions", opts: [{ v: "1", l: "Staff actions only" }] },
          ],
          emptyText: "Nothing has been recorded yet. Staff actions appear here as they happen." },
      ];
    },
  },
});

/* ══ Diagnostics ═════════════════════════════════════════════════════════════
   v1 AdminOps: four health lights, photo storage and the media cloud with the
   fix for each state, background jobs with Run now (one or all), open faults
   grouped with a hit count, "dealt with" per fault and for all, the server
   build and schema, and a quiet refresh every minute. */
function crSyAgoS(s) {
  if (s === null || s === undefined) return "Never run";
  return s < 90 ? s + " s ago" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago";
}
/* Refreshes the tab quietly every minute while it is open (v1 polled too). A
   component, so the interval is cleared when the tab is left. */
function CrSyTicker({ ctx, ms }) {
  const ref = React.useRef(ctx);
  ref.current = ctx;
  React.useEffect(() => { const t = setInterval(() => { if (!document.hidden) ref.current.reload(); }, ms); return () => clearInterval(t); }, [ms]);
  return null;
}
async function crSyOpsClear(ctx, id, n) {
  try {
    const r = await NGGApi.admin.ops.clear(id);
    ctx.toast(id ? "Marked as dealt with. If it happens again it comes straight back." : crPlural(r.cleared || n || 0, "fault") + " marked as dealt with");
    ctx.closeDrawer(); ctx.reload();
  } catch (e) { ctx.toast(crErr(e, "Couldn’t mark that as dealt with."), null, true); }
}
async function crSyOpsRun(ctx, job) {
  ctx.toast(job === "all" ? "Running every background job…" : "Running " + job + "…");
  try {
    const r = await NGGApi.admin.ops.run(job);
    const ran = r.ran || {};
    const failed = Object.keys(ran).filter(k => ran[k] === "error");
    const busy = Object.keys(ran).filter(k => ran[k] === "busy");
    if (failed.length) ctx.toast("Failed: " + failed.join(", ") + ". The fault is listed under Open faults.", null, true);
    else if (busy.length) ctx.toast("Already running: " + busy.join(", ") + ". Try again in a moment.");
    else ctx.toast(job === "all" ? "Every background job ran" : job + " ran");
    ctx.reload();
  } catch (e) { ctx.toast(crErr(e, "Couldn’t run that job."), null, true); }
}
function crSyLight(ok, label, detail) { return [label, ok ? "OK" : (detail || "Failing"), ok ? "ok" : "bad"]; }

Object.assign(CR_TAB_DEFS, {
  ops: {
    skeleton: ["kpis", "table"],
    load: async () => NGGApi.admin.ops.status(),
    actions: (d, ctx) => [
      { l: "Mark all dealt with", icon: "checks", primary: true, run: () => crSyOpsClear(ctx, 0, (d.events || []).length), disabled: !(d.events || []).length, why: (d.events || []).length ? undefined : "There are no open faults." },
      { l: "Run all jobs now", icon: "play", run: () => crSyOpsRun(ctx, "all") },
      { l: "Refresh", icon: "arrows-clockwise", run: () => { ctx.reload(); ctx.toast("Refreshed"); } },
    ],
    blocks: (d, ctx) => {
      const h = d.health || {}, c = h.checks || {}, out = [];
      const core = [
        crSyLight(!!(c.db && c.db.ok), "Database", "Read-only — the disk may be full"),
        crSyLight(!!(c.schema && c.schema.ok), "Schema", c.schema ? "At " + c.schema.at + ", the code wants " + d.schemaTarget : "Unreadable"),
        crSyLight(!!(c.cron && c.cron.ok), "Background jobs", c.cron && c.cron.stale ? "Stalled: " + c.cron.stale.join(", ") : ""),
        crSyLight((d.errors24h || 0) === 0, "Errors in the last 24 hours", crNum(d.errors24h) + " in the last day"),
      ];
      const bad = core.filter(x => x[2] !== "ok").length;
      out.push({ type: "status", span: 3, title: "Health", summary: crPlural(bad, "check"), tone: bad ? "bad" : "ok", items: core });

      if (c.photos) {
        const p = c.photos;
        const items = [crSyLight(!!p.ok, "Saving photos",
          p.where === "unwritable" ? "The image directory is not writable — no photo can be saved"
          : p.where === "cache_fallback" ? "Writing to the cache directory as a fallback"
          : p.error ? p.stage + ": " + p.error : "")];
        if (c.photosOnRecord) items.push(crSyLight(!!c.photosOnRecord.ok, "Recent sign-ups", crNum(c.photosOnRecord.missing) + " of the last " + crNum(c.photosOnRecord.checked) + " arrived with no photo"));
        if (c.photoLinks) items.push(crSyLight(!!c.photoLinks.ok, "Images on record", crNum(c.photoLinks.missing) + " of " + crNum(c.photoLinks.checked) + " point at a missing file"));
        const pb = items.filter(x => x[2] !== "ok").length;
        items.push(["Held", crPlural(p.files || 0, "image") + (p.bytes ? " · " + (p.bytes / 1048576).toFixed(1) + " MB" : ""), "neutral"]);
        out.push({ type: "status", span: 3, title: "Photo storage", sub: p.where === "storage" ? "Checked just now by writing and reading back a test image" : "", summary: crPlural(pb, "check"), tone: pb ? "bad" : "ok", items });
        if (p.dir) out.push({ type: "note", span: 6, icon: "folder", text: "Photos are kept in " + p.dir + "." });
        if (c.photoLinks && !c.photoLinks.ok) {
          const w = c.photoLinks.where || {};
          out.push({ type: "note", span: 6, icon: "image-broken", tone: "warn",
            text: crPlural(c.photoLinks.missing, "image") + " referenced by a record " + (c.photoLinks.missing === 1 ? "is" : "are") + " no longer on disk" + (Object.keys(w).length ? " — " + Object.keys(w).map(k => w[k] + " in " + k).join(", ") : "") + ".",
            sub: "The bytes can’t be recovered. Send those people a retake link from their record’s photo. Cards and rosters print without a headshot in the meantime." });
        }
        if (!p.ok) out.push({ type: "note", span: 6, icon: "warning", tone: "bad",
          text: "Make api/storage writable by the web user (chmod 775, or 755 if PHP runs as the owner), then refresh.",
          sub: "Photos already accepted are not lost by fixing this, but anything that arrived while it was broken has no image, and those families need a retake link." });
      }

      if (c.cloudinary) {
        const cl = c.cloudinary;
        const items = [crSyLight(!!cl.ok, "Cloudinary", cl.detail || "")];
        if (c.photoStorage) items.push(crSyLight(!!c.photoStorage.ok, "Where photos landed", c.photoStorage.note || (crNum(c.photoStorage.local) + " of the last " + crNum(c.photoStorage.checked) + " kept locally")));
        const cb = items.filter(x => x[2] !== "ok").length;
        out.push({ type: "status", span: 3, title: "Media cloud", summary: crPlural(cb, "check"), tone: cb ? "bad" : "ok", items });
        const fix = {
          bad_credentials: ["warn", "Cloudinary is refusing these keys. Check cloudinary in api/config.php against the cloud name, API key and secret on the Cloudinary dashboard — a rotated secret is the usual cause.", "Uploads are still being accepted and stored on this server, so nothing is lost; they just aren’t in the cloud."],
          exhausted: ["warn", "The Cloudinary plan is rate-limited or out of credit. Uploads land on this server until it resets.", ""],
          unreachable: ["warn", "This server couldn’t reach Cloudinary at all — usually outbound HTTPS being blocked, not the account.", ""],
          not_configured: [null, "Running without a media cloud is supported: every photograph is kept on this server instead.", ""],
        }[cl.state];
        if (fix) out.push({ type: "note", span: 3, icon: fix[0] ? "warning" : "info", tone: fix[0] || undefined, text: fix[1], sub: fix[2] || undefined });
      }

      const jobs = Object.keys(h.cron || {});
      out.push({ type: "table", span: 6, title: "Background jobs", sub: "Driven by ordinary traffic — a quiet site runs them less often, which is not a fault. Open one to run it now.", nosel: true,
        cols: ["Job", "Last ran", { l: "Every", num: true }, "State"],
        rows: jobs.map(job => {
          const j = h.cron[job];
          const stale = j.ageSeconds !== null && j.ageSeconds > j.interval * 10;
          const st = j.ageSeconds === null ? ["Not yet run", "neutral"] : stale ? ["Stalled", "bad"] : ["Running", "ok"];
          return { key: job, cells: [{ k: "mono", t: job }, { k: "text", t: crSyAgoS(j.ageSeconds) }, { k: "num", t: j.interval >= 3600 ? Math.round(j.interval / 3600) + " h" : Math.round(j.interval / 60) + " min", v: j.interval }, { k: "status", t: st[0], tone: st[1] }],
            open: () => ctx.drawer({ title: job, sub: "Background job", fields: [["Last ran", crSyAgoS(j.ageSeconds)], ["Runs every", Math.round(j.interval / 60) + " minutes"], ["State", st[0]]],
              actions: [{ l: "Run now", primary: true, run: () => { ctx.closeDrawer(); crSyOpsRun(ctx, job); } }] }) };
        }), emptyText: "No background jobs are registered on this server." });

      const ev = d.events || [];
      out.push({ type: "table", span: 6, title: "Open faults",
        sub: (d.clearedCount ? crNum(d.clearedCount) + " dealt with · " : "") + "One broken endpoint is one row with a count. Marking a fault dealt with doesn’t silence it — if it happens again it comes back." + (ev.length >= 60 ? " Showing the newest 60." : ""),
        cols: ["Where", { l: "What", wrap: true }, { l: "Seen", num: true }, "Last"],
        rows: ev.map(e => ({ key: String(e.id), cells: [
          { k: "strong", t: e.source, s: e.kind + (e.detail ? " · " + e.detail : "") },
          { k: "text", t: e.message || "—" },
          { k: "status", t: crNum(e.hits) + "×", tone: e.hits > 20 ? "bad" : e.hits > 1 ? "warn" : "neutral" },
          { k: "text", t: crAgo(e.lastAt), s: "First " + crDate(e.firstAt) },
        ], open: () => ctx.drawer({ title: e.source, sub: e.kind, stats: [["Seen", crNum(e.hits) + "×"], ["First", crDate(e.firstAt, true)], ["Last", crDate(e.lastAt, true)]],
          fields: [["Kind", e.kind], ["Detail", e.detail]], sections: [{ h: "Message", text: e.message || "No message recorded." }],
          actions: [{ l: "Mark dealt with", primary: true, run: () => crSyOpsClear(ctx, e.id) }] }) })),
        filters: ["Where"],
        bulk: [{ l: "Mark dealt with", max: 60, run: async keys => {
          const n = keys.length; let ok = 0; const bad = [];
          for (const id of keys) { try { await NGGApi.admin.ops.clear(Number(id)); ok++; } catch (e) { bad.push(crErr(e, "refused")); } }
          ctx.toast(crNum(ok) + " of " + crNum(n) + " marked as dealt with" + (bad.length ? " · " + crNum(bad.length) + " refused — " + bad[0] : ""), null, bad.length > 0);
          ctx.reload();
        } }],
        emptyText: "Nothing has failed. That is the expected state — an empty list here is the good news." });

      out.push({ type: "custom", span: 6, render: c2 => (
        <p className="cr-hint"><CrSyTicker ctx={c2} ms={60000}/>
          {"For an uptime monitor, watch /api/public/health.php: it answers 503 when the site can’t serve. "}
          {"Server build " + (d.build || "not stamped") + " · schema " + (h.schema != null ? h.schema : "?") + " of " + d.schemaTarget + ". This page refreshes itself every minute."}
        </p>
      ) });
      return out;
    },
  },
});
