/* ============================================================================
   Control Room v2 — the system tabs (page `settings`). Filled into CR_TAB_DEFS
   (see cr-pages.jsx). Every top-level name here starts `crSy`.

   PROGRESS (for a resumed run): audit, ops — built, verified in the lab. integrations — built, verified. settings (General) — built, verified. access — built, verified. All five tabs done.
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
/* Where to keep photos instead: beside the website folder, not in it. */
function crSyPhotoDirHint(dir) {
  const m = String(dir || "").match(/^(.*)\/[^/]+\/api\/storage\/photos\/?$/);
  return m ? m[1] + "/ngg-data/photos" : "/home/<account>/ngg-data/photos";
}

/* Lost photo files back. A stored photo's file name is a fingerprint of its
   exact bytes, so a file found under that name IS that photo: searching the
   hosting account (an earlier deploy, a backup copy, the cache) and restoring
   from a backup are both safe — nothing can be attached to the wrong person,
   and no record changes. */
function CrSyPhotoRecover({ ctx }) {
  const [st, setSt] = React.useState({ busy: "", note: "" });
  const fileRef = React.useRef(null);
  const search = async () => {
    setSt({ busy: "search", note: "Searching this hosting account…" });
    try {
      const r = await NGGApi.admin.photoFrame.recover();
      const from = Object.keys(r.from || {});
      const said = r.found
        ? crPlural(r.found, "photo") + " found and put back" + (from.length ? " (from " + from.join(", ") + ")" : "") + ". " + (r.stillMissing ? crNum(r.stillMissing) + " still missing." : "None missing now.")
        : "None of the missing photos were found in the " + crNum(r.searched) + " folders searched on this account. Restore them from a backup, or send retake links.";
      setSt({ busy: "", note: said + (r.moved ? " " + crPlural(r.moved, "photo") + " copied out of the website folder into " + r.dir + "." : "") });
      ctx.reload();
    } catch (e) { setSt({ busy: "", note: crErr(e, "The search didn’t finish.") }); }
  };
  const copyNames = async () => {
    try {
      const r = await NGGApi.admin.photoFrame.lost();
      await navigator.clipboard.writeText(r.names.join("\n"));
      ctx.toast(crPlural(r.count, "file name") + " copied — search your backup for these.");
    } catch (e) { ctx.toast(crErr(e, "Couldn’t list them."), null, true); }
  };
  const restore = async files => {
    const list = Array.from(files || []).filter(f => /^[0-9a-f]{32}\.(jpg|png|webp)$/.test(f.name));
    if (!list.length) { setSt({ busy: "", note: "None of those files are stored photos — their names are 32 letters and digits, like 3f9a…c1.jpg, as in api/storage/photos." }); return; }
    let done = 0, skipped = 0;
    for (let i = 0; i < list.length; i++) {
      setSt({ busy: "restore", note: "Restoring " + (i + 1) + " of " + list.length + "…" });
      const data = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(""); fr.readAsDataURL(list[i]); });
      try { const r = await NGGApi.admin.photoFrame.restore(list[i].name, data); if (r.restored) done++; else skipped++; }
      catch (_) { skipped++; }
    }
    setSt({ busy: "", note: crPlural(done, "photo") + " restored" + (skipped ? "; " + skipped + " skipped (already there, not one of the missing, or not a readable image)" : "") + "." });
    ctx.reload();
  };
  return (
    <div className="cr-box cr-sy-frame">
      <p className="cr-hint">Each stored photo’s file name is a fingerprint of the photo itself, so a copy found under that name is exactly that photo — it can’t end up on the wrong person. First search this hosting account (an earlier copy of the site, a backup folder, the cache). If you have a backup (a cPanel backup’s <code>api/storage/photos</code> folder, say), select its files to restore them. Whatever can’t be found needs a retake link from that person’s record.</p>
      <div className="cr-sy-frame-acts">
        <button type="button" className="cr-btn is-sm is-primary" disabled={!!st.busy} onClick={search}>{st.busy === "search" ? "Searching…" : "Search this account"}</button>
        <button type="button" className="cr-btn is-sm" disabled={!!st.busy} onClick={() => fileRef.current && fileRef.current.click()}>Restore from a backup</button>
        <button type="button" className="cr-btn is-sm" disabled={!!st.busy} onClick={copyNames}>Copy the missing file names</button>
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden aria-label="Photo files from a backup" onChange={e => { restore(e.target.files); e.target.value = ""; }}/>
      </div>
      {st.note && <p className="cr-hint" role="status" aria-live="polite">{st.note}</p>}
    </div>
  );
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
        if (p.insideSite) out.push({ type: "note", span: 6, icon: "warning", tone: "warn",
          text: "Photos are kept inside the website’s own folder, so a deploy that deletes or replaces that folder deletes every photo with it.",
          sub: "Add  'photo_dir' => '" + crSyPhotoDirHint(p.dir) + "'  to api/config.php, then press “Search this account” below to bring the photos across. When deploying, unpack the new version over the old one; never delete the folder first." });
        {
          const lost = c.photoLinks && !c.photoLinks.ok, w = (c.photoLinks && c.photoLinks.where) || {};
          out.push({ type: "custom", span: 6,
            title: lost ? crPlural(c.photoLinks.missing, "photo") + " on record with no file on disk" : "Finding and moving photos",
            sub: lost ? (Object.keys(w).length ? Object.keys(w).map(k => w[k] + " in " + k).join(", ") + "." : "")
              : "Nothing is missing. After setting photo_dir, “Search this account” also copies every photo out of the website folder.",
            render: () => <CrSyPhotoRecover ctx={ctx}/> });
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

/* ══ Integrations ════════════════════════════════════════════════════════════
   v1 AdminIntegrations: destinations (Google Chat, signed webhook, Sheets
   mirror, Drive sink) with add/edit/pause, Send test, Retry stuck, Delete; the
   delivery health of each; the delivery queue run by hand; the full member
   sync to Sheets; the recent deliveries; and a setup guide per kind with the
   Apps Script to paste. The signing secret is shown once, on create. */
const CR_SY_INT_KINDS = [["gchat", "Google Chat"], ["webhook", "Signed webhook"], ["sheets", "Google Sheets mirror"], ["drive", "Drive (any provider)"]];
const CR_SY_INT_HINT = { gchat: "https://chat.googleapis.com/…", sheets: "https://script.google.com/macros/s/…/exec", webhook: "https://your-endpoint.example/…", drive: "https://script.google.com/macros/s/…/exec" };
const CR_SY_INT_URL_ERR = {
  bad_gchat_url: "A Google Chat webhook starts with https://chat.googleapis.com/.",
  bad_script_url: "A Sheets mirror is an Apps Script web app: it starts with https://script.google.com/.",
  bad_url: "The address must start with https://.",
};
const CR_SY_SCRIPT_SHEETS = `function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  // Optional shared-secret check (matches the signing secret you saved):
  // if (body.secret !== 'PASTE_SECRET') return ok('bad secret');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(body.event) || ss.insertSheet(body.event);
  var rows = [].concat(body.data.members || [body.data]);
  rows.forEach(function (r) { sheet.appendRow([new Date(), JSON.stringify(r)]); });
  return ok('ok');
}
function ok(msg){ return ContentService.createTextOutput(msg); }`;
const CR_SY_SCRIPT_DRIVE = `function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var d = body.data;                       // { name, url, channel, author }
  var file = UrlFetchApp.fetch(d.url).getBlob().setName(d.name || 'document');
  var folder = DriveApp.getFoldersByName('NGG Community Docs').hasNext()
    ? DriveApp.getFoldersByName('NGG Community Docs').next()
    : DriveApp.createFolder('NGG Community Docs');
  folder.createFile(file);
  return ContentService.createTextOutput('ok');
}`;
function crSyKindLabel(k) { const f = CR_SY_INT_KINDS.find(x => x[0] === k); return f ? f[1] : k; }
async function crSyCopy(ctx, text, what) {
  try { await navigator.clipboard.writeText(text); ctx.toast(what + " copied"); }
  catch (_) { ctx.toast("Couldn’t reach the clipboard. Select the text in the guide and copy it.", null, true); }
}
function crSyIntGuide(ctx, kind) {
  const script = [
    "1. Open a Google Sheet (any Google account with Drive for a Drive sink) → Extensions → Apps Script.",
    "2. Delete the sample, paste the Apps Script below, and save.",
    "3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. This is the step usually missed — without “Anyone”, Google shows a sign-in page and nothing is written.",
    "4. Copy the /exec web app address, paste it into the integration, save, then Send test.",
  ].join("\n");
  const sec = {
    gchat: [{ h: "Google Chat", text: "1. In the Google Chat space → Apps & integrations → Manage webhooks.\n2. Create a webhook and copy its address (it starts with https://chat.googleapis.com/).\n3. Add it here, choose the events, save, and use Send test to confirm." }],
    webhook: [{ h: "Signed webhook", text: "1. Point the address at your HTTPS endpoint.\n2. Every POST is signed: header X-NGG-Signature: sha256=HMAC(timestamp + \".\" + body, secret). Verify it with the signing secret shown once when you save.\n3. Answer 2xx within 15 seconds. Anything else is retried with backoff (8 tries, then dead)." }],
    sheets: [{ h: "Google Sheets mirror", text: script }, { h: "Apps Script — paste into the editor", text: CR_SY_SCRIPT_SHEETS }],
    drive: [{ h: "Drive (any provider)", text: script + "\n5. Set the events to community.document so shared documents are filed to Drive automatically.\nFor Dropbox, OneDrive or S3, point the address at a Zapier or Make webhook (or your own endpoint): it receives the same signed JSON." }, { h: "Apps Script — paste into the editor", text: CR_SY_SCRIPT_DRIVE }],
  };
  ctx.drawer({
    title: "Setup guide · " + crSyKindLabel(kind), sub: "Step by step",
    sections: sec[kind],
    actions: [
      kind === "sheets" || kind === "drive" ? { l: "Copy the Apps Script", primary: true, run: () => crSyCopy(ctx, kind === "drive" ? CR_SY_SCRIPT_DRIVE : CR_SY_SCRIPT_SHEETS, "Apps Script") } : null,
      ...CR_SY_INT_KINDS.filter(k => k[0] !== kind).map(k => ({ l: k[1], run: () => crSyIntGuide(ctx, k[0]) })),
    ].filter(Boolean),
  });
}
function crSyIntEdit(ctx, i) {
  const editing = !!i;
  ctx.closeDrawer();
  ctx.form({
    title: editing ? "Edit " + (i.name || "integration") : "Add integration", submit: editing ? "Save changes" : "Add integration", busyLabel: "Saving…",
    intro: "Events go out to this destination as they happen. Open the setup guide from the header for the steps for each kind.",
    values: editing ? { kind: i.kind, name: i.name, status: i.status, url: i.url, events: (i.events || ["*"]).join(", "), secret: "" } : { kind: "gchat", status: "active", events: "*" },
    fields: [
      { id: "kind", l: "Kind", type: "chips", req: true, opts: CR_SY_INT_KINDS },
      { id: "name", l: "Name", max: 160, ph: "Shown in this list", help: "Leave blank to use the kind." },
      { id: "url", l: "Destination address", req: true, type: "url", ph: CR_SY_INT_HINT.webhook, check: (v, all) => /^https:\/\//.test(String(v).trim()) ? "" : "The address must start with https://.", help: "Google Chat: https://chat.googleapis.com/… · Sheets: https://script.google.com/macros/s/…/exec" },
      { id: "events", l: "Events", req: true, ph: "* or attendance.*, registration.created", help: "Comma-separated. * is every event; attendance.* matches every attendance event. A Drive sink usually takes community.document." },
      { id: "secret", l: "Signing secret", max: 200, when: v => v.kind !== "gchat", help: editing ? "Leave blank to keep the current secret" + (i.secretHint ? " (" + i.secretHint + ")" : "") + "." : "Leave blank and one is made for you, shown once." },
      { id: "status", l: "Status", type: "chips", req: true, opts: [["active", "Active"], ["paused", "Paused"]] },
    ],
    onSubmit: async v => {
      const events = String(v.events || "").split(",").map(s => s.trim()).filter(Boolean);
      try {
        const r = await NGGApi.admin.integrations.upsert({ integrationId: editing ? i.integrationId : undefined, kind: v.kind, name: v.name, url: String(v.url).trim(),
          events: events.length ? events : ["*"], secret: v.kind !== "gchat" && v.secret ? v.secret : undefined, status: v.status });
        ctx.reload();
        return r;
      } catch (e) {
        const code = (e && e.data && e.data.error) || (e && (e.code || e.message));
        if (CR_SY_INT_URL_ERR[code]) return { fieldErrors: { url: CR_SY_INT_URL_ERR[code] } };
        throw e;
      }
    },
    done: (v, r) => {
      /* The secret is revealed once. A 4-second toast is not long enough to
         copy it, so it opens in a drawer that stays until it is closed. */
      if (r && r.secret) setTimeout(() => ctx.drawer({ title: "Copy the signing secret now", sub: "It is shown once. Afterwards only its last four characters are.",
        sections: [{ h: "Signing secret", text: r.secret }, { h: "What it is for", text: "The receiver checks X-NGG-Signature against it, so only this server can post to it." }],
        actions: [{ l: "Copy the secret", primary: true, run: () => crSyCopy(ctx, r.secret, "Secret") }, { l: "Done", run: () => ctx.closeDrawer() }] }), 50);
      return (editing ? "Saved · " : "Added · ") + (v.name || crSyKindLabel(v.kind));
    },
  });
}
async function crSyIntTest(ctx, id) {
  ctx.toast("Sending a test…");
  try {
    const r = await NGGApi.admin.integrations.test(id);
    ctx.toast(r.delivered ? "Test delivered" : "Test failed: " + (r.error || "no detail from the receiver"), null, !r.delivered);
    ctx.reload();
  } catch (e) { ctx.toast(crErr(e, "Couldn’t send the test."), null, true); }
}
async function crSyIntRetry(ctx, id) {
  try {
    const r = await NGGApi.admin.integrations.retry(id || "");
    const dsp = r.dispatch || {};
    ctx.toast("Requeued " + crNum(r.requeued) + " · " + crNum(dsp.delivered) + " delivered · " + crNum(dsp.failed) + " failed", null, (dsp.failed || 0) > 0);
    ctx.closeDrawer(); ctx.reload();
  } catch (e) { ctx.toast(crErr(e, "Couldn’t retry."), null, true); }
}
async function crSyIntDelete(ctx, i) {
  const ok = await ctx.confirm({ title: "Delete " + (i.name || "this integration") + "?", danger: true, cta: "Delete",
    body: "Anything relying on it stops receiving events straight away. Its delivery history goes with it. This can’t be undone." });
  if (!ok) return;
  try { await NGGApi.admin.integrations.remove(i.integrationId); ctx.closeDrawer(); ctx.toast("Deleted · " + (i.name || i.integrationId)); ctx.reload(); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t delete it."), null, true); }
}
function crSyIntOpen(ctx, i, h) {
  const stuck = (h.pending || 0) + (h.dead || 0);
  ctx.drawer({
    title: i.name || i.integrationId, sub: crSyKindLabel(i.kind) + (i.status === "paused" ? " · paused" : ""),
    stats: [["Delivered", crNum(h.ok)], ["Pending", crNum(h.pending)], ["Dead", crNum(h.dead)]],
    fields: [["Address", i.url], ["Events", (i.events || []).join(", ")], ["Signing secret", i.hasSecret ? i.secretHint : "None"], ["Status", i.status === "paused" ? "Paused" : "Active"],
      ["Last delivered", h.lastOkAt ? crDate(h.lastOkAt, true) : "Never"], ["Added", crDate(i.createdAt)]],
    sections: [h.lastError ? { h: "Last error", text: h.lastError } : null],
    actions: [
      { l: "Send test", primary: true, run: () => crSyIntTest(ctx, i.integrationId) },
      stuck ? { l: "Retry " + crNum(stuck) + " stuck", run: () => crSyIntRetry(ctx, i.integrationId) } : null,
      { l: "Edit", run: () => crSyIntEdit(ctx, i) },
      { l: "Setup guide", run: () => crSyIntGuide(ctx, i.kind) },
      { l: "Delete", run: () => crSyIntDelete(ctx, i) },
    ].filter(Boolean),
  });
}
const CR_SY_DLV = { ok: ["Delivered", "ok"], pending: ["Pending", "warn"], failed: ["Retrying", "warn"], dead: ["Dead", "bad"] };

Object.assign(CR_TAB_DEFS, {
  integrations: {
    skeleton: ["kpis", "cards", "table"],
    load: async () => NGGApi.admin.integrations.list(),
    actions: (d, ctx) => {
      const hasSheets = (d.integrations || []).some(i => i.kind === "sheets" && i.status === "active");
      return [
        { l: "Add integration", icon: "plus", primary: true, run: () => crSyIntEdit(ctx, null) },
        { l: "Run delivery queue now", icon: "paper-plane-tilt", run: async () => {
          try { const r = await NGGApi.admin.integrations.dispatch(); ctx.toast("Tried " + crNum(r.attempted) + " · " + crNum(r.delivered) + " delivered · " + crNum(r.failed) + " failed", null, (r.failed || 0) > 0); ctx.reload(); }
          catch (e) { ctx.toast(crErr(e, "Couldn’t run the queue."), null, true); }
        } },
        { l: "Sync members to Sheets", icon: "table", disabled: !hasSheets, why: hasSheets ? "Sends every member to the active Sheets mirror" : "Add an active Google Sheets mirror first.", run: async () => {
          ctx.toast("Syncing members to Sheets…");
          try { const r = await NGGApi.admin.integrations.syncMembers(); ctx.toast("Sent " + crPlural(r.total || 0, "member") + " in " + crPlural(r.chunksSent || 0, "batch", "batches")); }
          catch (e) { ctx.toast(crErr(e, "Couldn’t sync to Sheets."), null, true); }
        } },
        { l: "Setup guides", icon: "book-open", run: () => crSyIntGuide(ctx, "gchat") },
      ];
    },
    blocks: (d, ctx) => {
      const items = d.integrations || [], health = d.health || {}, log = d.log || [];
      const sum = k => items.reduce((n, i) => n + ((health[i.integrationId] || {})[k] || 0), 0);
      const queued = log.filter(x => x.status === "pending" || x.status === "failed").length;
      const dead = sum("dead");
      return [
        { type: "kpis", span: 6, items: [
          { l: "Destinations", v: crNum(items.length), dn: crNum(items.filter(i => i.status !== "paused").length) + " active" },
          { l: "Delivered", v: crNum(sum("ok")) },
          { l: "Waiting to send", v: crNum(sum("pending")), dn: queued ? crNum(queued) + " in the recent log" : "" },
          { l: "Dead", v: crNum(dead), dn: dead ? "Open the destination to retry" : "" },
        ] },
        { type: "note", span: 6, icon: "plugs-connected", text: "Events — registrations, attendance, awards, wellbeing flags, shared documents — go to Google Chat, a signed webhook, the Sheets mirror or a Drive sink.",
          sub: "Delivery runs by itself on web-cron. Use “Run delivery queue now” to send what is waiting straight away." },
        { type: "cards", span: 6, title: "Destinations", empty: "No integrations yet. Add one to send events to Google Chat, Sheets, Drive or your own endpoint.",
          cards: items.map(i => {
            const h = health[i.integrationId] || {};
            const stuck = (h.pending || 0) + (h.dead || 0);
            return { icon: { gchat: "chat-circle-text", webhook: "webhooks-logo", sheets: "table", drive: "folder-simple" }[i.kind] || "plug",
              title: i.name || i.integrationId, sub: i.url,
              tag: i.status === "paused" ? "Paused" : h.dead ? crNum(h.dead) + " dead" : stuck ? crNum(stuck) + " waiting" : "Active",
              tone: i.status === "paused" ? "neutral" : h.dead ? "bad" : stuck ? "warn" : "ok",
              meta: [["Kind", crSyKindLabel(i.kind)], ["Delivered", crNum(h.ok)], ["Last delivered", h.lastOkAt ? crAgo(h.lastOkAt) : "Never"], ["Events", (i.events || []).join(", ")]],
              onClick: () => crSyIntOpen(ctx, i, h) };
          }) },
        { type: "table", span: 6, title: "Recent deliveries", sub: "The latest 40", nosel: true,
          cols: ["Event", "Destination", "Status", { l: "Tries", num: true }, { l: "Last error", wrap: true }, "When"],
          rows: log.map((x, n) => {
            const s = CR_SY_DLV[x.status] || [x.status, "neutral"];
            const dest = items.find(i => i.integrationId === x.integrationId);
            return { key: x.eventId + "-" + x.integrationId + "-" + n, cells: [{ k: "mono", t: x.kind || x.eventId }, { k: "text", t: dest ? dest.name : x.integrationId }, { k: "status", t: s[0], tone: s[1] },
              { k: "num", t: crNum(x.attempts), v: Number(x.attempts) || 0 }, { k: "text", t: x.lastError || "" }, { k: "text", t: crDate(x.deliveredAt || x.nextAttemptAt, true) }] };
          }),
          filters: ["Status", "Destination"],
          emptyText: "Nothing has been sent yet. Deliveries appear here as events go out." },
      ];
    },
  },
});

/* ══ General ═════════════════════════════════════════════════════════════════
   v1 AdminSettings: sign-up switches, messages, volunteer hours, the featured
   session, geo-fencing, the photo rules, attendance and closing times, the
   staff idle sign-out, ID card branding, the homepage promo banner, the email
   delivery test, AI status with a live key test, and this device's
   accessibility settings.

   The form blocks are built ONCE per load and kept on the data: CrFormBlock
   re-bases its edits whenever its block object changes, and blocks() runs on
   every shell render — including the one the unsaved bar itself causes — so a
   block rebuilt per render would throw away the first keystroke. */
const crSyGenCtx = { current: null };
const CR_SY_ATT_TYPES = [["member", "NGG members"], ["student", "Summer School participants"], ["volunteer", "Volunteers"], ["default", "Everyone else"]];
const CR_SY_CLOSE_TYPES = [["member", "NGG members"], ["student", "Summer School participants"], ["volunteer", "Summer volunteers"]];
const CR_SY_IDLE = [["900", "15 minutes"], ["1800", "30 minutes (default)"], ["3600", "1 hour"], ["14400", "4 hours"], ["43200", "12 hours — a full working day"], ["0", "Never — only for a locked, private office"]];
const CR_SY_TOGGLES = ["applications_open", "mentor_applications_open", "volunteer_applications_open", "intake_photo_required", "photo_gate_issuance", "geofence_enabled", "volunteer_sms_notify", "checkin_state_emails", "qotw_mail", "companion_enabled"];
const CR_SY_ID_KEYS = ["program", "year", "motto", "validityDays", "website", "phone", "address", "logoLockup", "logoOkun"];
const crSyTime = v => !v || /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? "" : "Use a time like 09:00.";
const crSyInt = (lo, hi, what) => v => /^-?\d+$/.test(String(v).trim()) && +v >= lo && +v <= hi ? "" : "Enter " + what + " from " + lo + " to " + hi + ".";

/* One form per Settings tab, from one definition: `part` picks its groups. */
function crSyGenForm(d, part) {
  const s = d.settings || {}, a = s.attendance || {}, rbt = a.resumptionByType || {}, cbt = a.closeByType || {}, id = s.idcard || {}, idm = s.idcardMember || {};
  const tog = (k, l, help) => ({ id: k, l, help, c: "toggle", value: !!s[k] });
  const sessOpts = [["", "None"]].concat((d.sessions || []).map(x => [x.sessionId, (x.name || x.code || x.sessionId) + (x.startDate ? " · from " + crDate(x.startDate) : "")]));
  if (s.featured_session_id && !sessOpts.some(o => o[0] === s.featured_session_id)) sessOpts.push([s.featured_session_id, s.featured_session_id + " (not this year)"]);
  return {
    type: "form", span: 6, key: "settings-" + (part || "general"),
    groups: [
      { part: "general", h: "Sign-ups", help: "Whether the public forms take new applications.", rows: [
        tog("applications_open", "Teen applications open"),
        tog("mentor_applications_open", "Mentor applications open"),
        tog("volunteer_applications_open", "Volunteer registration open"),
        tog("intake_photo_required", "Require a headshot on the public forms", "Teen, volunteer and kiosk. Off: the photo is optional at sign-up and can be added later through Photo review or the ID Card Studio."),
        tog("photo_gate_issuance", "Hold the ID until the photo is approved", "The ID is bound only once parent consent is in and the headshot is approved in Photo review. A registration with no photo is never held."),
        tog("geofence_enabled", "Geo-fenced registration", "Picks the centre by location and refuses off-site sign-ups. Map each centre’s point under Members → Centres."),
      ] },
      { part: "general", h: "Messages", rows: [
        tog("volunteer_sms_notify", "Text volunteers their ID by SMS", "When a phone number is on file."),
        tog("checkin_state_emails", "Email a note on check-in", "Award-focused when somebody is doing well, a nudge otherwise."),
        tog("qotw_mail", "Email NGG members the quote of the week every Monday", "The same quote as their Anchor Journal."),
        tog("companion_enabled", "Companion check-ins", "Assess every NGG member weekly and email them, and their parent, the check-in."),
      ] },
      { part: "general", h: "Volunteers and the homepage", rows: [
        { id: "volunteer_session_hours", l: "Hours credited per volunteer session", c: "input", type: "number", value: String(s.volunteer_session_hours == null ? 4 : s.volunteer_session_hours), check: crSyInt(1, 12, "hours") },
        { id: "featured_session_id", l: "Featured session", help: "The homepage countdown counts down to it.", c: "select", opts: sessOpts, value: s.featured_session_id || "" },
      ] },
      { part: "attendance", h: "Attendance and punctuality", help: "Every card scan is stamped present or late against these times, and the check-in desk shows it live.", rows: [
        { id: "att_enabled", l: "Flag lateness at check-in", c: "toggle", value: a.enabled !== false },
      ].concat(CR_SY_ATT_TYPES.map(([t, l]) => ({ id: "att_res_" + t, l: "Due time · " + l, c: "input", type: "time", value: rbt[t] || "", help: t === "member" && !rbt[t] ? "Blank: uses the time for everyone else." : undefined, check: crSyTime })), [
        { id: "att_grace", l: "Grace period before ‘late’", help: "Minutes.", c: "input", type: "number", value: String(a.graceMinutes == null ? 10 : a.graceMinutes), check: crSyInt(0, 180, "minutes") },
        { id: "att_tz", l: "Time zone offset from UTC", help: "Minutes. West Africa Time is 60.", c: "input", type: "number", value: String(a.tzOffset == null ? 60 : a.tzOffset), check: crSyInt(-720, 840, "minutes") },
      ]) },
      { part: "attendance", h: "Closing time", help: "Nobody can sign out before closing time — the desk, the kiosk and the gate all refuse it, so a sign-out is proof somebody stayed. An admin can still let a person go early with a written reason, which is recorded. Leave a time blank for no closing time.",
        rows: CR_SY_CLOSE_TYPES.map(([t, l]) => ({ id: "att_close_" + t, l: "Closing time · " + l, c: "input", type: "time", value: cbt[t] || "", check: crSyTime })) },
      { part: "general", h: "Staff sign-in", help: "How long a Control Room session may sit untouched before it locks. A warning appears two minutes before; reading or clicking anywhere keeps it alive.", rows: [
        { id: "session_idle_admin", l: "Sign staff out after", c: "select", opts: CR_SY_IDLE.concat(CR_SY_IDLE.some(o => o[0] === String(s.session_idle_admin)) || s.session_idle_admin == null ? [] : [[String(s.session_idle_admin), Math.round(s.session_idle_admin / 60) + " minutes"]]), value: String(s.session_idle_admin == null ? 1800 : s.session_idle_admin) },
      ] },
      { part: "branding", h: "ID card branding", help: "Printed on the NGG member cards, the Summer School cards and the digital IDs. The card’s QR always opens the holder’s /q/ profile page.", rows: [
        { id: "id_program", l: "Programme name", c: "input", max: 512, value: id.program || "" },
        { id: "id_year", l: "Year", c: "input", max: 512, value: id.year == null ? "" : String(id.year) },
        { id: "id_motto", l: "Motto", c: "input", max: 512, value: id.motto || "" },
        { id: "id_validityDays", l: "A new card is valid for", help: "Days. 0 means it never expires. Cards already issued keep the expiry they were issued with.", c: "input", type: "number", value: String(id.validityDays == null ? 90 : id.validityDays), check: crSyInt(0, 3650, "days") },
        { id: "id_website", l: "Website printed on the card", c: "input", max: 512, value: id.website || "" },
        { id: "id_phone", l: "Phone printed on the card", c: "input", type: "tel", max: 512, value: id.phone || "" },
        { id: "id_address", l: "Organisation address", help: "Printed on the back of every card — where a found card goes back to.", c: "input", max: 512, value: id.address || "" },
        { id: "idm_email", l: "Email on the NGG member card’s back", c: "input", type: "email", max: 120, value: idm.email || "" },
        { id: "idm_socialHandle", l: "Social handle on the NGG member card’s back", help: "Without the @.", c: "input", max: 60, value: idm.socialHandle || "" },
        { id: "id_logoLockup", l: "Lockup logo address", c: "input", max: 512, value: id.logoLockup || "" },
        { id: "id_logoOkun", l: "Partner logo address (card back)", c: "input", max: 512, value: id.logoOkun || "" },
      ] },
    ].filter(g => g.part === (part || "general")),
    /* Only what changed goes back. Attendance is the exception: the server
       replaces that setting whole, so it is sent whole — every field of it is
       on this screen — built over what was loaded. */
    save: async (patch, all) => {
      const out = {};
      Object.keys(patch).forEach(k => {
        if (CR_SY_TOGGLES.includes(k)) out[k] = !!patch[k];
        else if (k === "volunteer_session_hours" || k === "session_idle_admin") out[k] = parseInt(patch[k], 10) || 0;
        else if (k === "featured_session_id") out[k] = patch[k];
      });
      const idk = Object.keys(patch).filter(k => k.indexOf("id_") === 0);
      if (idk.length) { out.idcard = {}; idk.forEach(k => { const f = k.slice(3); out.idcard[f] = f === "validityDays" ? parseInt(patch[k], 10) || 0 : String(patch[k]).trim(); }); }
      const idmk = Object.keys(patch).filter(k => k.indexOf("idm_") === 0);
      if (idmk.length) { out.idcardMember = {}; idmk.forEach(k => { out.idcardMember[k.slice(4)] = String(patch[k]).trim(); }); }
      if (Object.keys(patch).some(k => k.indexOf("att_") === 0)) {
        const res = Object.assign({}, rbt), close = {};
        CR_SY_ATT_TYPES.forEach(([t]) => { const v = String(all["att_res_" + t] || "").trim(); if (v) res[t] = v; else delete res[t]; });
        CR_SY_CLOSE_TYPES.forEach(([t]) => { const v = String(all["att_close_" + t] || "").trim(); if (v) close[t] = v; });
        Object.keys(cbt).forEach(t => { if (!CR_SY_CLOSE_TYPES.some(x => x[0] === t)) close[t] = cbt[t]; });
        out.attendance = { enabled: !!all.att_enabled, graceMinutes: parseInt(all.att_grace, 10) || 0, tzOffset: parseInt(all.att_tz, 10) || 0, resumptionByType: res, closeByType: close };
      }
      await NGGApi.admin.settings.set(out);
    },
    onSaved: () => crSyGenCtx.current && crSyGenCtx.current.reload(),
  };
}

function crSyPromoForm(d) {
  const p = d.promo || {};
  return {
    type: "form", span: 6, key: "settings-promo",
    groups: [{ h: "Homepage banner", help: "A banner across the top of the public homepage that visitors can dismiss. Give it an expiry and it retires itself.", rows: [
      { id: "text", l: "Banner text", c: "input", max: 200, ph: "Summer School registration closes Friday", value: p.text || "", check: v => String(v).trim() ? "" : "Enter the banner text, or clear the banner instead." },
      { id: "ctaLabel", l: "Button label", help: "Optional.", c: "input", max: 40, ph: "Register now", value: p.ctaLabel || "" },
      { id: "ctaUrl", l: "Button link", help: "Optional. A path on this site, like /join, or a full address.", c: "input", max: 300, ph: "/join", value: p.ctaUrl || "" },
      { id: "expires", l: "Expires", help: "Optional. The banner disappears at the end of this day.", c: "input", type: "date", value: (p.expires || "").slice(0, 10) },
    ] }],
    /* The banner is stored as one value, so the whole of it is sent. */
    save: async (patch, all) => {
      if (!String(all.text || "").trim()) throw Object.assign(new Error("bad"), { data: { message: "Enter the banner text, or clear the banner instead." } });
      await NGGApi.admin.promotions.set({ text: String(all.text).trim(), ctaLabel: String(all.ctaLabel || "").trim(), ctaUrl: String(all.ctaUrl || "").trim(), expires: all.expires ? all.expires + "T23:59:59Z" : "" });
    },
    onSaved: () => crSyGenCtx.current && crSyGenCtx.current.reload(),
  };
}

async function crSyPromoClear(ctx, old) {
  try {
    await NGGApi.admin.promotions.set(null);
    ctx.reload();
    ctx.toast("Homepage banner cleared", async () => { try { await NGGApi.admin.promotions.set(old); ctx.reload(); } catch (e) { ctx.toast(crErr(e, "Couldn’t put it back."), null, true); } });
  } catch (e) { ctx.toast(crErr(e, "Couldn’t clear the banner."), null, true); }
}

function crSyMailTest(ctx) {
  ctx.form({
    title: "Send a test email", submit: "Send test", busyLabel: "Sending…",
    intro: "Sends one real email and reports exactly what happened. Shared hosts often drop plain PHP mail(); if it fails in that mode, set mail.smtp in api/config.php.",
    values: { to: "" },
    fields: [{ id: "to", l: "Send to", type: "email", email: true, ph: (ctx.me && ctx.me.email) || "", help: "Leave blank to send it to yourself." }],
    onSubmit: async v => NGGApi.admin.settings.testMail(String(v.to || "").trim()),
    done: (v, r) => {
      setTimeout(() => ctx.drawer({
        title: r.delivered ? "Test email sent" : "Test email not delivered", sub: "Mode: " + (r.mode || "unknown"),
        fields: [["Result", r.delivered ? "Handed over for delivery. Check the inbox, and spam." : "Not delivered"], ["To", r.to], ["Mode", r.mode], ["From", r.from], ["Reply to", r.replyTo],
          ["SMTP server", r.smtp ? r.smtp.host + ":" + r.smtp.port + " (" + (r.smtp.secure || "plain") + ")" : ""], ["SMTP sign-in", r.smtp && r.smtp.authUser]],
        sections: [r.error ? { h: "Error", text: r.error } : null, (r.hints || []).length ? { h: "What to check", text: r.hints.join("\n\n") } : null],
      }), 50);
      return r.delivered ? "Sent to " + r.to : null;
    },
  });
}

async function crSyAiProbe(ctx) {
  ctx.toast("Sending one real request per profile…");
  try {
    const r = await NGGApi.admin.summer.aiStatus(true);
    ctx.setData(x => Object.assign({}, x, { ai: r }));
    const bad = (r.ai || []).filter(x => x.probe && !x.probe.ok).length;
    ctx.toast(bad ? crPlural(bad, "profile") + " failed the test" : "Keys tested", null, bad > 0);
  } catch (e) { ctx.toast(crErr(e, "Couldn’t test the keys."), null, true); }
}

/* ══ API keys: one card per outside service ═════════════════════════════════
   Status in words (connected here, from config.php, not set), what the service
   powers, where to get a key, and Add / Change / Test / Remove. A secret is
   never shown — only how it ends — and a blank field keeps what is saved. */
function crSyKeyEdit(ctx, s) {
  const ids = s.fields.map((f, i) => "f" + i);
  const vals = {};
  s.fields.forEach((f, i) => { vals[ids[i]] = f.kind === "secret" ? "" : (f.source === "here" ? f.value : ""); });
  ctx.form({
    title: (s.setHere || s.connected ? "Change " : "Connect ") + s.label,
    intro: s.what + (s.guarded ? " Once a secret key is in use, a change waits until a second person with Fees and Settings confirms it, and everyone with Fees is emailed." : ""),
    submit: s.guarded && s.connected ? "Propose the change" : "Save",
    values: vals,
    fields: s.fields.map((f, i) => ({
      id: ids[i], l: f.label, req: false, max: 400,
      type: f.kind === "secret" ? "password" : f.kind === "port" ? "text" : f.kind === "email" ? "email" : "text",
      ac: f.kind === "secret" ? "new-password" : "off", im: f.kind === "port" ? "numeric" : undefined,
      ph: f.kind === "secret" ? (f.set ? "Saved · ends " + f.ending + (f.source === "file" ? " (config.php)" : "") + " — leave blank to keep" : "Paste the key")
        : (f.source === "file" ? f.value + " (config.php)" : ""),
      help: [f.help, f.optional ? "" : ""].filter(Boolean).join(" ") || undefined,
    })),
    onSubmit: async v => {
      const values = {}, clear = [];
      s.fields.forEach((f, i) => {
        const x = String(v[ids[i]] == null ? "" : v[ids[i]]).trim();
        if (x !== "") values[f.path] = x;
        else if (f.kind !== "secret" && f.source === "here") clear.push(f.path);
      });
      try { return await NGGApi.admin.summer.keysSet(s.id, values, clear); }
      catch (e) {
        if (e.code === "bad_value" && e.data && e.data.field) { const i = s.fields.findIndex(f => f.path === e.data.field); if (i >= 0) return { fieldErrors: { [ids[i]]: crErr(e, "Check this value.") } }; }
        throw e;
      }
    },
    done: (v, r) => { ctx.reload(); return r && r.pending ? "Proposed. It applies when a second person with Fees confirms it." : r && r.unchanged ? "Nothing changed." : s.label + " saved. Press Test to check it works."; },
  });
}
function CrSyKeyCard({ ctx, s }) {
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const tone = s.connected ? "ok" : "neutral";
  const state = s.connected ? (s.setHere ? "Connected" : "Connected · config.php") : s.fields.some(f => f.set) ? "Incomplete" : "Not set";
  const test = async () => {
    setBusy(true); setRes(null);
    try { const r = await NGGApi.admin.summer.keysTest(s.id); setRes(r); }
    catch (e) { setRes({ pass: false, detail: crErr(e, "The test didn’t run.") }); }
    setBusy(false);
  };
  const remove = async () => {
    const here = s.fields.filter(f => f.source === "here").map(f => f.path);
    if (!(await ctx.confirm({ title: "Remove the " + s.label + " keys set here?", body: s.fields.some(f => f.source === "here" && f.set) ? "Anything set in api/config.php is used again; if nothing is, " + s.label + " stops working." : "", cta: "Remove", danger: true }))) return;
    try { const r = await NGGApi.admin.summer.keysSet(s.id, {}, here); ctx.toast(r.pending ? "Proposed — a second person confirms it." : "Removed."); ctx.reload(); }
    catch (e) { ctx.toast(crErr(e, "Couldn’t remove them."), null, true); }
  };
  return (
    <article className={"cr-box cr-key" + (s.connected ? " is-on" : "")} aria-label={s.label}>
      <div className="cr-key-head"><b>{s.label}</b><CrPill tone={tone} t={state}/></div>
      <p className="cr-key-what">{s.what}</p>
      <dl className="cr-key-fields">
        {s.fields.map(f => (
          <div key={f.path}><dt>{f.label}</dt>
            <dd>{!f.set ? <span className="cr-hint">{f.optional ? "—" : "Not set"}</span>
              : f.kind === "secret" ? <span className="cr-mono">•••• {f.ending}</span> : <span className="cr-mono">{f.value}</span>}
              {f.set && f.source === "file" && <span className="cr-key-src">config.php</span>}</dd></div>
        ))}
      </dl>
      {s.changedAt && <p className="cr-hint">Changed {crAgo(s.changedAt)}{s.changedBy ? " by " + s.changedBy : ""}</p>}
      {res && <p className={"cr-key-res" + (res.pass === true ? " is-ok" : res.pass === false ? " is-bad" : "")} role="status"><CrIcon n={res.pass === true ? "check-circle" : res.pass === false ? "warning-circle" : "info"}/>{res.detail}{res.ms ? " · " + crNum(res.ms) + " ms" : ""}</p>}
      <div className="cr-key-acts">
        <button type="button" className={"cr-btn is-sm" + (s.connected ? "" : " is-primary")} onClick={() => crSyKeyEdit(ctx, s)}>{s.connected || s.setHere ? "Change" : "Add key"}</button>
        {s.testable && <button type="button" className="cr-btn is-sm" disabled={busy || !s.connected} title={s.connected ? "" : "Add the key first."} onClick={test}>{busy ? "Testing…" : "Test"}</button>}
        {s.setHere && <button type="button" className="cr-btn is-sm" onClick={remove}>Remove</button>}
        <span className="cr-grow"/>
        <a className="cr-key-link" href={s.link} target="_blank" rel="noopener noreferrer">Get a key<CrIcon n="arrow-up-right"/><span className="cr-sr"> (opens {s.label} in a new tab)</span></a>
      </div>
    </article>
  );
}
function CrSyKeysPending({ ctx, svc }) {
  const p = svc.pending, s = (svc.services || []).find(x => x.id === p.service) || { label: p.service };
  const mine = p.by === svc.me;
  const confirm = () => ctx.form({
    title: "Confirm the new " + s.label + " keys", intro: p.byName + " proposed new " + s.label + " keys. Open the " + s.label + " dashboard yourself, copy the secret key from there, and paste it here. It must match what was proposed.",
    submit: "Confirm the change",
    fields: [{ id: "k", l: "Secret key, from the " + s.label + " dashboard", type: "password", ac: "off", req: true, max: 400 }],
    onSubmit: async v => { try { return await NGGApi.admin.summer.keysConfirm(v.k.trim()); } catch (e) { if (e.code === "mismatch") return { fieldErrors: { k: crErr(e, "") } }; throw e; } },
    done: () => { ctx.reload(); return "The new " + s.label + " keys are in use."; },
  });
  const cancel = async () => {
    if (!(await ctx.confirm({ title: "Cancel the proposed change?", body: "The keys in use stay as they are.", cta: "Cancel the change" }))) return;
    try { await NGGApi.admin.summer.keysCancel(); ctx.toast("Cancelled."); ctx.reload(); } catch (e) { ctx.toast(crErr(e, "Couldn’t cancel it."), null, true); }
  };
  return (
    <div className="cr-box cr-mp-note is-warn" role="status"><CrIcon n="warning-circle"/>
      <span><b>A change of {s.label} keys is waiting.</b> {p.byName} proposed it {crAgo(p.at)}. The keys in use stay until {mine ? "another person" : "you or another person"} with Fees and Settings confirms it.</span>
      {!mine && svc.canMoney && <button type="button" className="cr-btn is-sm is-primary" onClick={confirm}>Confirm</button>}
      <button type="button" className="cr-btn is-sm" onClick={cancel}>Cancel it</button>
    </div>
  );
}

/* ══ Photo framing: two Gemini keys, entered here ═══════════════════════════
   The first key measures every headshot (head, face, eyes, shoulders) so each
   card frames it as an accurate headshot at its own shape; the second checks
   photos and backs the first up. Keys are sealed on the server and never come
   back to the browser — this shows only that one is set and how it ends. */
function crSyKeysForm(ctx, k) {
  ctx.form({
    title: "Gemini keys for photos",
    intro: "From Google AI Studio (aistudio.google.com → Get API key). Leave a field blank to keep the key already saved. Keys are encrypted on the server and never shown again.",
    submit: "Save keys",
    values: { framingKey: "", secondKey: "", model: (k && k.model) || "", clearFraming: false, clearSecond: false },
    fields: [
      { id: "framingKey", l: "Key 1 — headshot framing", type: "password", ac: "new-password", max: 80, ph: k && k.framing.set ? "Saved · ends " + k.framing.ending : "AQ.… or AIza…",
        help: "Measures each photo so the card shows an accurate head-and-shoulders, whatever shape the photo was." },
      { id: "secondKey", l: "Key 2 — photo checks, and backup for framing", type: "password", ac: "new-password", max: 80, ph: k && k.second.set ? "Saved · ends " + k.second.ending : "AQ.… or AIza…" },
      { id: "model", l: "Model", max: 60, ph: "Automatic", help: "Leave blank: each key uses the newest Gemini Flash model Google lets it use (gemini-3.8-flash today), and moves on by itself when Google retires one. Type a model name only to pin one." },
      k && k.framing.set ? { id: "clearFraming", l: "Remove key 1", type: "switch" } : null,
      k && k.second.set ? { id: "clearSecond", l: "Remove key 2", type: "switch" } : null,
    ].filter(Boolean),
    onSubmit: async v => {
      try { return await NGGApi.admin.summer.aiKeysSet({ framingKey: v.framingKey.trim(), secondKey: v.secondKey.trim(), model: v.model.trim(), clearFraming: !!v.clearFraming, clearSecond: !!v.clearSecond }); }
      catch (e) { if (e.code === "bad_key") return { fieldErrors: { [((e.data && e.data.field) || "framing") + "Key"]: crErr(e, "") } }; if (e.code === "bad_model") return { fieldErrors: { model: crErr(e, "") } }; throw e; }
    },
    done: () => { ctx.reload(); return "Saved. Use “Test” to check Google accepts them."; },
  });
}
async function crSyKeysTest(ctx) {
  ctx.toast("Sending one small request with each key…");
  try {
    const r = await NGGApi.admin.summer.aiKeysTest();
    const say = (n, x) => n + ": " + (x.ok ? "works, using " + x.model + " (" + crNum(x.ms) + " ms)"
      : x.error === "not_set" ? "not set" : "refused — " + (x.detail || x.error) + (x.model ? " [" + x.model + "]" : ""));
    ctx.toast(say("Key 1", r.results.framing) + " · " + say("Key 2", r.results.second), null, !(r.results.framing.ok || r.results.second.ok));
  } catch (e) { ctx.toast(crErr(e, "Couldn’t test the keys."), null, true); }
}
function CrSyFraming({ ctx, k }) {
  const [run, setRun] = React.useState(null);
  const stop = React.useRef(false);
  React.useEffect(() => () => { stop.current = true; }, []);
  if (!k) return null;
  const on = k.framing.set || k.second.set;
  const frameAll = async () => {
    stop.current = false;
    let done = 0, failed = 0, left = k.backlog;
    setRun({ done, failed, left });
    try {
      while (!stop.current) {
        const r = await NGGApi.admin.photoFrame.backlog();
        done += r.done; failed += r.failed; left = r.remaining;
        setRun({ done, failed, left });
        if (!r.remaining || !r.done) break;
      }
      ctx.toast(crPlural(done, "photo") + " measured" + (failed ? ", " + failed + " couldn’t be read" : "") + ".", null, failed > 0);
    } catch (e) { ctx.toast(crErr(e, "Framing stopped."), null, true); }
    setRun(null); ctx.reload();
  };
  return (
    <div className="cr-box cr-sy-frame">
      <div className="cr-sy-frame-keys">
        <span><b>Key 1 · framing</b> {k.framing.set ? "set · ends " + k.framing.ending : "not set"}{k.framing.updatedBy ? " · " + k.framing.updatedBy : ""}</span>
        <span><b>Key 2 · checks &amp; backup</b> {k.second.set ? "set · ends " + k.second.ending : "not set"}</span>
        <span><b>Model</b> {k.model || "Automatic — the best each key can use"}</span>
      </div>
      <p className="cr-hint" role="status" aria-live="polite">
        {run ? "Measuring… " + crNum(run.done) + " done" + (run.failed ? ", " + run.failed + " couldn’t be read" : "") + ", " + crNum(run.left) + " to go."
          : crNum(k.framed) + " photos measured · " + crNum(k.backlog) + " on cards not measured yet." + (on ? "" : " Add a key to start.")}
      </p>
      <div className="cr-sy-frame-acts">
        <button type="button" className="cr-btn is-sm is-primary" onClick={() => crSyKeysForm(ctx, k)}>{on ? "Change keys" : "Enter keys"}</button>
        <button type="button" className="cr-btn is-sm" disabled={!on || !!run} onClick={() => crSyKeysTest(ctx)}>Test</button>
        {run ? <button type="button" className="cr-btn is-sm" onClick={() => { stop.current = true; }}>Stop</button>
          : <button type="button" className="cr-btn is-sm" disabled={!on || !k.backlog} title={!on ? "Add a key first." : !k.backlog ? "Every photo on a card is measured." : ""} onClick={frameAll}>Measure existing photos</button>}
      </div>
    </div>
  );
}

Object.assign(CR_TAB_DEFS, {
  settings: {
    skeleton: ["table", "table"],
    load: async () => {
      const [st, sess, promo] = await Promise.all([
        NGGApi.admin.settings.get(),
        NGGApi.admin.sessions.list(new Date().getFullYear()).catch(() => ({ sessions: [] })),
        NGGApi.admin.promotions.get().catch(e => ({ promoErr: e })),
      ]);
      const d = { settings: st.settings || {}, sessions: sess.sessions || [], promo: promo.promo || null, promoErr: promo.promoErr || null };
      d.formMain = crSyGenForm(d, "general");
      d.formPromo = crSyPromoForm(d);
      return d;
    },
    actions: (d, ctx) => [
      { l: "Send test email", icon: "envelope-simple", primary: true, run: () => crSyMailTest(ctx) },
    ],
    blocks: (d, ctx) => {
      crSyGenCtx.current = ctx;
      return [
        { type: "note", span: 6, icon: "compass", text: "Settings are grouped by what they change. Attendance times, what is printed on cards, and the keys that connect outside services each have their own tab above.",
          sub: "Looking for centres? They are records, not settings: Members → Centres, where “Add a centre” is at the top.",
          act: { l: "Open Centres", run: () => ctx.go("members", "centres") } },
        Object.assign(d.formMain, { title: "Programme" }),
        d.promoErr ? { type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load the homepage banner. " + crErr(d.promoErr, ""), act: { l: "Try again", run: () => ctx.reload() } }
          : Object.assign(d.formPromo, { title: "Homepage promo banner" }),
        d.promo && d.promo.text ? { type: "note", span: 6, icon: "megaphone", text: "The banner is live: “" + d.promo.text + "”" + (d.promo.expires ? " until " + crDate(d.promo.expires) : "") + ".", act: { l: "Clear the banner", run: () => crSyPromoClear(ctx, d.promo) } }
          : { type: "note", span: 6, icon: "megaphone", text: "No homepage banner is showing. Write one above and save to put it up." },
        /* Mounted, not rebuilt: A11ySettingsPanel (components.jsx) is the one
           implementation of these per-device preferences (CLAUDE.md §11). */
        { type: "custom", span: 6, title: "Accessibility on this device", sub: "Applies to the Control Room and the public site in this browser only. Nothing is saved to your account.",
          render: () => <div className="cr-box cr-sy-a11y" style={{ padding: "8px 20px 16px" }}><A11ySettingsPanel/></div> },
      ];
    },
  },
  /* Attendance and card branding: the same settings, each on its own tab so a
     person looking for a closing time does not scroll past forty switches. */
  "attendance-rules": {
    skeleton: ["table"],
    load: async () => { const st = await NGGApi.admin.settings.get(); const d = { settings: st.settings || {} }; d.form = crSyGenForm(d, "attendance"); return d; },
    blocks: (d, ctx) => { crSyGenCtx.current = ctx; return [Object.assign(d.form, { title: "Attendance and closing times" })]; },
  },
  "card-branding": {
    skeleton: ["table"],
    load: async () => { const st = await NGGApi.admin.settings.get(); const d = { settings: st.settings || {} }; d.form = crSyGenForm(d, "branding"); return d; },
    blocks: (d, ctx) => {
      crSyGenCtx.current = ctx;
      return [Object.assign(d.form, { title: "Card branding" }),
        { type: "note", span: 6, icon: "identification-card", text: "Card layouts, sheets and printing are in the ID Card Studio.", act: { l: "Open the ID Card Studio", run: () => { window.location.href = "/club/id-cards"; } } }];
    },
  },
  /* Every outside service's keys, the photo-framing keys, and which provider
     answers each AI feature — one page for "is this connected?". */
  keys: {
    skeleton: ["cards", "table"],
    load: async () => {
      const [k, ai, fk] = await Promise.all([
        NGGApi.admin.summer.keys(),
        NGGApi.admin.summer.aiStatus(false).catch(e => ({ aiErr: e })),
        NGGApi.admin.summer.aiKeys().catch(() => null),
      ]);
      return { svc: k, ai, keys: fk };
    },
    actions: (d, ctx) => [
      { l: "Test the AI keys", icon: "sparkle", run: () => crSyAiProbe(ctx), disabled: !(d.ai && d.ai.anyEnabled), why: d.ai && d.ai.anyEnabled ? "Sends one real request per AI feature" : "No AI key is set yet, so there is nothing to test." },
      { l: "Send test email", icon: "envelope-simple", run: () => crSyMailTest(ctx) },
    ],
    blocks: (d, ctx) => {
      const ai = d.ai || {}, rows = ai.ai || [], svc = d.svc || {};
      const list = svc.services || [];
      const out = [
        { type: "note", span: 6, icon: "lock-key", text: "Keys entered here are encrypted on the server and never shown again — only how each one ends. A key entered here is used instead of the one in api/config.php; remove it to go back to the file.",
          sub: svc.sealed === false ? "This server cannot encrypt (PHP openssl is missing), so keys can only be set in api/config.php." : "" },
      ];
      if (svc.pending) out.push({ type: "custom", span: 6, render: () => <CrSyKeysPending ctx={ctx} svc={svc}/> });
      Object.keys(svc.groups || {}).forEach(g => {
        const mine = list.filter(x => x.group === g);
        if (mine.length) out.push({ type: "custom", span: 6, title: svc.groups[g], render: () => <div className="cr-keys">{mine.map(x => <CrSyKeyCard key={x.id} ctx={ctx} s={x} svc={svc}/>)}</div> });
      });
      out.push(
        ai.aiErr ? { type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t read the AI status. " + crErr(ai.aiErr, ""), act: { l: "Try again", run: () => ctx.reload() } }
          : { type: "note", span: 6, icon: "sparkle", tone: ai.anyEnabled ? "ok" : "warn",
            text: ai.anyEnabled ? "AI is on. The table shows which provider answers each feature." : "AI is off — everything still works.",
            sub: ai.anyEnabled ? "Use “Test the AI keys” to send one real request per profile: a key that is set but rejected looks exactly like a working one until you do." : "No provider key is configured, so every feature below runs on its built-in rules. Nothing is broken; it just isn’t intelligent. Add a Gemini or Groq key above to switch it on (both have free tiers)." },
        d.keys ? { type: "custom", span: 6, title: "Photo framing (Gemini)", sub: "Two keys: one measures every headshot so cards frame it accurately at their own shape, the other checks photos and backs it up. Existing photos are measured with “Measure existing photos”; new ones when their cards are printed.",
          render: () => <CrSyFraming ctx={ctx} k={d.keys}/> } : null,
        ai.aiErr ? null : { type: "table", span: 6, title: "AI features", nosel: true,
          cols: [{ l: "Feature", wrap: true }, { l: "Status", wrap: true }, "Provider", "Test"],
          rows: rows.map(r => ({ key: r.profile, cells: [
            { k: "strong", t: r.profile, s: r.what },
            r.enabled ? { k: "status", t: "On", tone: "ok" } : { k: "text", t: "Rules only", s: r.behaviourWhenOff },
            { k: "text", t: r.enabled ? r.provider + (r.model ? " · " + r.model : "") : "—", s: r.fallbacks > 0 ? "+" + crPlural(r.fallbacks, "fallback") : "" },
            !r.probe ? { k: "text", t: "Not tested" } : r.probe.ok ? { k: "status", t: "OK · " + crNum(r.probe.ms) + " ms", tone: "ok" } : { k: "status", t: r.probe.error || "Failed", tone: "bad" },
          ] })),
          emptyText: "This server reports no AI features." },
      );
      return out;
    },
  },
});

/* ══ Access & roles ══════════════════════════════════════════════════════════
   v1 AdminAccess + AccessMatrix + the role and access parts of the member
   editor (MemberCapsEditor, account recovery). Roles come from the server
   (admin.roles) — never a list typed here. The guards are the server's and
   stay there: a role above the operator's own is dropped by admin_may_manage,
   the last active super admin cannot be demoted, a super admin cannot demote
   themselves, extra capabilities and centre scope are super-admin only. The
   screen adds the confirmations v1 had (granting an elevated role, lowering
   your own) and, after a role change, reads the record back so a change the
   server declined is reported as declined, never as done. */
const CR_SY_ROLE_ERR = {
  last_super_admin: "That’s the last active super admin. Make somebody else a super admin first.",
  cannot_demote_self: "You can’t lower your own role. Ask another super admin.",
  cannot_suspend_self: "You can’t suspend yourself.",
};
function crSyCapsOf(reg, m) {
  const r = (reg.roles || []).find(x => x.id === m.role);
  const base = r ? r.caps : [];
  return { base, extra: (m.capsExtra || []).filter(c => base.indexOf(c) < 0) };
}
function crSyElevated(reg, id) { const r = (reg.roles || []).find(x => x.id === id); return r ? r.tier >= 4 : id === "admin" || id === "super_admin"; }
/* The roles this operator may hand out, and the account's current one so it still reads. */
function crSyRoleOpts(reg, current) {
  return (reg.roles || []).filter(r => r.mayGrant || r.id === current).map(r => [r.id, r.label + (r.scoped ? " · own centres only" : "")]);
}
function crSyScopeText(d, m) {
  const r = (d.reg.roles || []).find(x => x.id === m.role);
  if ((m.centreScope || []).length) return m.centreScope.map(id => d.centreNames[id] || id).join(", ");
  return r && r.scoped ? "None — no access yet" : "All centres";
}

async function crSyRoleApply(ctx, d, m, role) {
  const me = ctx.me || {}, reg = d.reg;
  if (role === m.role) return;
  const self = m.memberId === me.id;
  if (self && crSyElevated(reg, m.role) && !crSyElevated(reg, role)) {
    const ok = await ctx.confirm({ title: "Lower your own access?", danger: true, cta: "Change my access", cancel: "Keep as is",
      body: "You’re lowering your own staff level and may lose parts of the Control Room straight away. The last active super admin can’t be demoted." });
    if (!ok) return;
  } else if (role !== "member" && crSyElevated(reg, role)) {
    const ok = await ctx.confirm({ title: "Grant " + crSyRoleLabel(reg, role) + "?", danger: role === "super_admin", cta: "Grant access",
      body: (m.fullName || m.memberId) + " will gain elevated access" + (role === "super_admin" ? ": everything, including roles, settings, money and the audit trail." : ".") });
    if (!ok) return;
  }
  const from = m.role || "member";
  try {
    const res = await NGGApi.admin.members.upsert({ memberId: m.memberId, role });
    if (crQueued(res)) { ctx.toast("Sent to a second admin to approve."); return; }
    /* The server drops a role the operator may not give rather than refusing
       the save, so read the record back before saying it happened. */
    const back = (await NGGApi.admin.memberDetail(m.memberId)).detail.member || {};
    if ((back.role || "member") !== role) {
      ctx.toast("Not changed: " + crSyRoleLabel(reg, role) + " reaches further than your own role, so you can’t grant it.", null, true);
      ctx.reload(); return;
    }
    const nr = (reg.roles || []).find(x => x.id === role);
    ctx.closeDrawer(); ctx.reload();
    if (nr && nr.scoped && !(m.centreScope || []).length) {
      ctx.toast(nr.label + " works only for named centres, so " + (m.fullName || "they") + " has no access until you give them one. Open them and choose Capabilities and centres.", null, true);
      return;
    }
    const undo = self ? null : async () => {
      try { await NGGApi.admin.members.upsert({ memberId: m.memberId, role: from }); ctx.reload(); ctx.toast("Put back · " + crSyRoleLabel(reg, from)); }
      catch (e) { ctx.toast(crErr(e, "Couldn’t put the role back."), null, true); }
    };
    ctx.toast(role === "member" ? "Staff access removed · " + (m.fullName || m.memberId) : (m.fullName || m.memberId) + " is now " + crSyRoleLabel(reg, role), undo);
  } catch (e) {
    const code = (e && e.data && e.data.error) || (e && (e.code || e.message));
    if (code === "approval_pending") { ctx.toast("Sent to a second admin to approve."); return; }
    ctx.toast(CR_SY_ROLE_ERR[code] || crErr(e, "Couldn’t change the role."), null, true);
  }
}

function crSyRoleForm(ctx, d, m) {
  const opts = crSyRoleOpts(d.reg, m.role);
  ctx.closeDrawer();
  ctx.form({
    title: "Change role · " + (m.fullName || m.memberId), submit: "Continue",
    intro: "A role is a fixed bundle of capabilities. You can only give roles that reach no further than your own.",
    values: { role: m.role },
    fields: [{ id: "role", l: "Role", type: "chips", req: true, opts: opts.concat([["member", "No staff access"]]),
      help: "Granting admin or super admin asks you to confirm. Choosing “No staff access” removes it." }],
    onSubmit: async v => ({ role: v.role }),
    done: v => { setTimeout(() => crSyRoleApply(ctx, d, m, v.role), 30); return null; },
  });
}

function crSyAccessForm(ctx, d, m) {
  const reg = d.reg, c = crSyCapsOf(reg, m);
  ctx.closeDrawer();
  ctx.form({
    title: "Capabilities and centres · " + (m.fullName || m.memberId), submit: "Save access", busyLabel: "Saving…",
    intro: "Extra capabilities are granted to this person on top of their " + crSyRoleLabel(reg, m.role) + " role. Money (fees), the institutional record (journal) and the system (settings, rbac) belong to named people, never to a role.",
    values: { caps: c.extra.slice(), scope: (m.centreScope || []).slice() },
    fields: [
      { id: "caps", l: "Extra capabilities", type: "multi", opts: (reg.caps || []).filter(x => c.base.indexOf(x.id) < 0).map(x => [x.id, x.id]),
        help: "Already in the role: " + (c.base.join(", ") || "nothing") + "." },
      { id: "scope", l: "Centre scope", type: "multi", opts: d.centres.map(x => [x.centreId, x.name + (x.status === "retired" ? " (retired)" : "")]),
        help: "Leave every centre unticked for access to all of them. Ticking centres limits this person’s members, roster, exports and dashboard to those centres." },
    ],
    onSubmit: async v => NGGApi.admin.members.setCaps(m.memberId, v.caps || [], v.scope || []),
    done: (v, r) => { ctx.reload(); return "Access saved · " + crPlural((r.capsExtra || []).length, "extra capability", "extra capabilities") + " · " + ((r.centreScope || []).length ? crPlural(r.centreScope.length, "centre") : "all centres"); },
  });
}

async function crSyRecovery(ctx, m, kind) {
  const two = kind === "2fa";
  const ok = await ctx.confirm(two
    ? { title: "Reset " + (m.fullName || "their") + "’s two-factor sign-in?", cta: "Reset 2FA", danger: true, body: "They set up an authenticator again the next time they open the Control Room. Until they do, they can’t get in." }
    : { title: "Clear " + (m.fullName || "their") + "’s password?", cta: "Clear password", danger: true, body: "Their current password stops working at once. They sign in with an emailed code and set a new one." });
  if (!ok) return;
  try {
    await (two ? NGGApi.admin.members.reset2fa(m.memberId) : NGGApi.admin.members.resetPassword(m.memberId));
    ctx.toast(two ? "2FA reset. They set it up again at their next sign-in." : "Password cleared. They can sign in with an emailed code.");
  } catch (e) {
    const det = e && e.data && e.data.detail;
    ctx.toast(det === "above_your_level" ? "Their role reaches further than yours, so you can’t reset their sign-in." : crErr(e, "Couldn’t do that."), null, true);
  }
}

function crSyStaffOpen(ctx, d, m) {
  const reg = d.reg, me = ctx.me || {}, c = crSyCapsOf(reg, m);
  const r = (reg.roles || []).find(x => x.id === m.role) || {};
  const isSuper = reg.me && reg.me.role === "super_admin";
  const canRole = crSyRoleOpts(reg, m.role).some(o => o[0] !== m.role) && (r.mayGrant || m.role === "member");
  const self = m.memberId === me.id;
  ctx.drawer({
    title: m.fullName || m.memberId, name: m.fullName, sub: [m.memberId, m.email].filter(Boolean).join(" · ") + (self ? " · you" : ""),
    stats: [["Role", crSyRoleLabel(reg, m.role)], ["Capabilities", crNum(c.base.length + c.extra.length)], ["Centres", (m.centreScope || []).length ? crNum(m.centreScope.length) : r.scoped ? "None" : "All"]],
    fields: [["Status", m.status], ["Centre scope", crSyScopeText(d, m)], ["Limited to own centres", r.scoped ? "Yes" : "No"], ["Sensitive acts", r.queued ? "Wait for a second admin to approve" : "Run at once"]],
    sections: [
      { h: "From the role", text: r.summary ? r.summary + "\n\n" + (c.base.join(", ") || "No capabilities") : (c.base.join(", ") || "No capabilities") },
      { h: "Granted to this person", list: c.extra.map(x => ({ icon: "plus-circle", t: x, s: ((reg.caps || []).find(y => y.id === x) || {}).label })), empty: "Nothing beyond the role." },
    ],
    actions: [
      { l: "Change role", primary: true, run: () => crSyRoleForm(ctx, d, m), disabled: !canRole, why: canRole ? undefined : "This role reaches further than yours." },
      { l: "Capabilities and centres", run: () => crSyAccessForm(ctx, d, m), disabled: !isSuper, why: isSuper ? undefined : "Only a super admin grants extra capabilities and centre scope." },
      { l: "Reset 2FA", run: () => crSyRecovery(ctx, m, "2fa"), disabled: !r.mayGrant && m.role !== "member", why: "Their role reaches further than yours." },
      { l: "Reset password", run: () => crSyRecovery(ctx, m, "pw"), disabled: !r.mayGrant && m.role !== "member", why: "Their role reaches further than yours." },
      self ? null : { l: "Remove staff access", run: () => crSyRoleApply(ctx, d, m, "member"), disabled: !r.mayGrant, why: r.mayGrant ? undefined : "Their role reaches further than yours." },
    ].filter(Boolean),
  });
}

function crSyGrant(ctx, d) {
  const opts = crSyRoleOpts(d.reg, null);
  ctx.form({
    title: "Grant staff access", submit: "Continue", busyLabel: "Finding them…",
    intro: "Give a member a staff role. They get an email inviting them to sign in, and set up two-factor sign-in the first time they open the Control Room.",
    values: { who: "", role: "" },
    fields: [
      { id: "who", l: "Member", req: true, ph: "Member ID or email", help: "The member must already have a record. Add them under Members first if not." },
      { id: "role", l: "Role", type: "chips", req: true, opts },
    ],
    onSubmit: async v => {
      const q = String(v.who).trim();
      const r = await NGGApi.admin.members.list({ q, pageSize: 10 });
      const list = r.members || [];
      const exact = list.filter(x => String(x.memberId).toLowerCase() === q.toLowerCase() || String(x.email || "").toLowerCase() === q.toLowerCase() || String(x.displayId || "").toLowerCase() === q.toLowerCase());
      const m = exact.length === 1 ? exact[0] : list.length === 1 ? list[0] : null;
      if (!m) return { fieldErrors: { who: list.length ? crNum(r.total || list.length) + " members match. Use their member ID or full email." : "No member matches that. Check the ID or email." } };
      if (m.role && m.role !== "member") return { fieldErrors: { who: (m.fullName || m.memberId) + " is already " + crSyRoleLabel(d.reg, m.role) + ". Change their role from the staff list." } };
      return { m };
    },
    done: (v, r) => { setTimeout(() => crSyRoleApply(ctx, d, Object.assign({}, r.m, { role: r.m.role || "member" }), v.role), 30); return null; },
  });
}

Object.assign(CR_TAB_DEFS, {
  access: {
    skeleton: ["table", "table"],
    load: async () => {
      const [reg, list, cs] = await Promise.all([
        NGGApi.admin.roles(),
        NGGApi.admin.members.list({ staff: 1, pageSize: 200 }),
        NGGApi.admin.registration.centres().catch(() => ({ centres: [] })),
      ]);
      crSyRolesP = Promise.resolve(reg);
      const centreNames = {};
      (cs.centres || []).forEach(c => { centreNames[c.centreId] = c.name; });
      return { reg, staff: list.members || [], total: list.total || 0, centres: (cs.centres || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))), centreNames };
    },
    actions: (d, ctx) => {
      const can = crSyRoleOpts(d.reg, null).length > 0;
      return [{ l: "Grant staff access", icon: "user-plus", primary: true, run: () => crSyGrant(ctx, d), disabled: !can, why: can ? undefined : "Your role can’t grant any staff role." }];
    },
    blocks: (d, ctx) => {
      const reg = d.reg, me = ctx.me || {};
      const noCentre = d.staff.filter(m => { const r = (reg.roles || []).find(x => x.id === m.role); return r && r.scoped && !(m.centreScope || []).length; });
      const capRows = (reg.caps || []).map(c => {
        const tabs = [];
        Object.keys(CR_PAGES).forEach(pid => CR_PAGES[pid].tabs.forEach(t => {
          if (t.cap === c.id || (Array.isArray(t.cap) && t.cap.indexOf(c.id) >= 0)) tabs.push(CR_PAGES[pid].label === t.label ? t.label : CR_PAGES[pid].label + " › " + t.label);
        }));
        return { icon: "key", t: c.id, s: c.label + (tabs.length ? " — opens " + tabs.join(", ") : ""), m: crPlural(reg.roles.filter(r => r.caps.indexOf(c.id) >= 0).length, "role") };
      });
      return [
        { type: "note", span: 6, icon: "lock-key", text: "Who has staff access and what each level can do. A role is a fixed bundle of capabilities; a super admin can add single capabilities to a person and limit them to named centres.",
          sub: "Nobody can grant a role that reaches further than their own, and the last active super admin can’t be demoted." },
        noCentre.length ? { type: "note", span: 6, icon: "warning", tone: "warn",
          text: crPlural(noCentre.length, "account") + " with no access yet: " + noCentre.map(m => m.fullName || m.memberId).join(", ") + ".",
          sub: (noCentre.length === 1 ? "This role works" : "These roles work") + " only for named centres. Open " + (noCentre.length === 1 ? "them" : "each") + " and choose Capabilities and centres." } : null,
        { type: "table", span: 6, title: "Staff", sub: crPlural(d.staff.length, "account") + (d.total > d.staff.length ? " · showing the first " + crNum(d.staff.length) + " of " + crNum(d.total) : ""), nosel: true,
          cols: ["Person", "Role", "Centres", "Can access"],
          rows: d.staff.map(m => {
            const c = crSyCapsOf(reg, m);
            return { key: m.memberId, cells: [
              { k: "person", t: (m.fullName || m.memberId) + (m.memberId === me.id ? " (you)" : ""), s: [m.memberId, m.email].filter(Boolean).join(" · ") },
              { k: "status", t: crSyRoleLabel(reg, m.role), tone: CR_SY_ROLE_TONE[m.role] || "neutral" },
              { k: "text", t: crSyScopeText(d, m) },
              { k: "text", t: c.base.length > 4 ? crPlural(c.base.length, "capability", "capabilities") + " from the role" : (c.base.join(", ") || "—"), s: c.extra.length ? "Plus " + c.extra.join(", ") : "" },
            ], open: () => crSyStaffOpen(ctx, d, m) };
          }),
          search: "Search staff", filters: ["Role", "Centres"],
          emptyText: "No staff yet. Grant a member a staff role from the header." },
        { type: "table", span: 6, title: "What each role can do", sub: "Read from the server’s role list, so it is what the server enforces. Open a role for what it is for.", nosel: true,
          cols: ["Role", "Limits"].concat((reg.caps || []).map(c => ({ l: c.id, sort: false }))),
          rows: (reg.roles || []).map(r => ({ key: r.id, open: () => ctx.drawer({ title: r.label, sub: r.scoped ? "Own centres only" : "Every centre",
              fields: [["Limited to own centres", r.scoped ? "Yes" : "No"], ["Sensitive acts", r.queued ? "Wait for a second admin to approve" : "Run at once"], ["You can grant it", r.mayGrant ? "Yes" : "No"],
                ["Held by", crPlural(d.staff.filter(m => m.role === r.id).length, "person", "people")]],
              sections: [{ h: "What it is for", text: r.summary || "—" }, { h: "Capabilities", list: r.caps.map(x => ({ icon: "key", t: x, s: ((reg.caps || []).find(y => y.id === x) || {}).label })), empty: "None." }] }), cells: [
            { k: "strong", t: r.label },
            { k: "text", t: [r.scoped ? "Own centres only" : "", r.queued ? "Second admin approves" : ""].filter(Boolean).join(" · ") || "—" },
          ].concat((reg.caps || []).map(c => r.caps.indexOf(c.id) >= 0 ? { k: "status", t: "Yes", tone: "ok" } : { k: "text", t: "—" })) })),
          sortInit: null },
        { type: "list", span: 6, title: "What each capability opens", rows: capRows, empty: "The server lists no capabilities." },
        { type: "note", span: 6, icon: "info", text: "Money (fees), the institutional record (journal) and the system (settings, rbac) are in no bundle but the super admin’s, on purpose.", sub: "Grant them to a named person through Capabilities and centres, never to a role." },
      ];
    },
  },
});
