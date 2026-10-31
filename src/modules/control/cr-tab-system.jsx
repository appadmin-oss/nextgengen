/* ============================================================================
   Control Room v2 — the system tabs (page `settings`). Filled into CR_TAB_DEFS
   (see cr-pages.jsx). Every top-level name here starts `crSy`.

   PROGRESS (for a resumed run): audit, ops — built, verified in the lab. integrations — built, verified. settings (General) — built, verified. access — built, verified. All five tabs done.
   ========================================================================== */

/* ── Shared: the role registry, from the server (admin.roles). The screen keeps
   no copy of the roles (CLAUDE.md §11); loaded once per page, retried on fail. */
let crSyRolesP = null;

/* Every stored photo as one .zip (admin.photos.backup), to keep before an update. */
function crSyPhotoBackup(ctx) {
  const a = document.createElement("a");
  a.href = "/api/admin/photos.php?view=backup"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  ctx.toast("Preparing the download — a big store can take a minute.");
}
/* Image storage (media-storage.php): how full the Cloudinary plan is, what that
   is doing to uploads, and the two things an operator can do about it now. */
const CR_SY_MEDIA_LEVEL = {
  ok: ["ok", "Plenty of room"], warn: ["warn", "Filling up"], high: ["warn", "Nearly full — AI photo edits have stopped"],
  critical: ["bad", "Full — new uploads are paused"],
};
function crSyMediaBlocks(m, ctx) {
  const u = m.usage || {}, lv = CR_SY_MEDIA_LEVEL[u.level] || CR_SY_MEDIA_LEVEL.ok, parts = u.parts || {};
  const name = { credits: "Plan credits", storage: "Storage", bandwidth: "Bandwidth (people viewing images)", transformations: "Transformations" };
  const items = Object.keys(name).filter(k => parts[k]).map(k => {
    const p = parts[k].pct;
    return [name[k], p == null ? "Not reported" : Math.round(p) + "% used", p == null ? "neutral" : p >= 95 ? "bad" : p >= 70 ? "warn" : "ok"];
  });
  items.push(["Last checked", u.checkedAt ? crAgo(u.checkedAt) + " ago" : "Not yet", "neutral"]);
  const out = [{ type: "status", span: 3, title: "Image storage", sub: (u.plan ? u.plan + " plan · " : "") + (u.pct == null ? "" : Math.round(u.pct) + "% of the plan used"),
                 summary: lv[1], tone: lv[0], items }];
  const text = {
    ok: "New images are compressed before they are stored, so the plan fills more slowly. Usage is checked every six hours and you are emailed as it climbs.",
    warn: "Over 70% used. Free space below, and keep an eye on bandwidth — every time a page shows an image it counts.",
    high: "Over 85% used. AI photo edits have stopped to save credits. Free space now, or upgrade the Cloudinary plan, before uploads have to pause.",
    critical: "The plan is full. New uploads are paused: photos are kept on this site instead, and other uploads say why they can’t go. Free space or upgrade the plan, then press Check now.",
  }[u.level] || "";
  out.push({ type: "note", span: 3, icon: u.level === "ok" ? "info" : "warning", tone: u.level === "ok" ? undefined : lv[0], text: text + (u.error ? " " + u.error : ""),
             act: { l: "Check now", run: () => crSyMediaCheck(ctx) } });
  out.push({ type: "note", span: 6, icon: "broom", text: "Free space: delete the resized and reformatted copies Cloudinary made for each page. Every original is kept, and a copy is remade the next time a page needs it.",
             sub: "Safe to do at any time. It frees storage now and uses a little of the plan later as copies are remade.",
             act: { l: "Free space…", run: () => crSyMediaPurge(ctx) } });
  out.push({ type: "note", span: 6, icon: "images", text: "Store edited photos as plain images: a photo kept as an edit is edited again at every size a card or page needs. Stored once, it costs one transformation per size instead.",
             act: { l: "Store edited photos…", run: () => crSyPhotoMaterialise(ctx) } });
  out.push({ type: "note", span: 6, icon: "arrows-left-right", text: "Photos on a spent account move only when they are needed: printing a card in the ID Card Studio, or editing a photo, first copies that one photo to the account uploads go to now.",
             sub: "Nothing is copied in bulk, so the new account holds only photos somebody used. Each is copied once; the old file stays, so shared links keep working." });
  return out;
}
/* ══ Several Cloudinary accounts (media-storage.php) ═════════════════════════
   One free plan holds about fifty people's photos a month; more accounts mean
   more room. Uploads go to the first account, in this order, with room; a full
   one hands over by itself on the next usage reading, and takes uploads back
   when it resets. Images already uploaded stay where they are and keep
   showing. A secret is checked against Cloudinary before it is kept, sealed,
   and never shown again. */
const CR_SY_ACC_ERR = { bad_cloud_name: "cloudName", duplicate_cloud: "cloudName", bad_cloud: "cloudName", bad_api_key: "apiKey", bad_api_secret: "apiSecret", secret_required: "apiSecret", bad_credentials: "apiSecret", label_too_long: "label" };
function crSyAccountBlocks(A, ctx) {
  const accs = A.accounts || [], live = accs.filter(a => a.enabled);
  const where = A.uploadsTo ? (accs.find(a => a.id === A.uploadsTo) || {}).label : "";
  const out = [{ type: "table", span: 6, title: "Cloudinary accounts", nosel: true,
    sub: live.length > 1 ? "New uploads go to " + (where || "no account: every plan is full") + (A.pin ? ", as you chose: open an account to go back to automatic." : ". The first account in this order under 70% used takes them; a plan past that hands over by itself, and takes them back when it resets. Open an account to send uploads there now.")
      : "One account. Add another to get more room: when this plan fills, new uploads move to the next account by themselves.",
    cols: ["Account", "Cloud", { l: "Used", num: true }, "State"],
    rows: accs.map((a, i) => {
      const lv = CR_SY_MEDIA_LEVEL[a.level] || CR_SY_MEDIA_LEVEL.ok;
      const state = !a.enabled ? ["Paused", "neutral"] : a.active ? ["Uploads go here", "ok"] : a.level === "critical" ? ["Full", "bad"] : [lv[1], lv[0] || "neutral"];
      return { key: a.id, cells: [ { k: "strong", t: a.label, s: a.settings ? (a.primary ? "Main account" : "Backup") + " · Settings → API keys" : "Added " + (a.addedAt ? crAgo(a.addedAt) + " ago" : "") },
        { k: "mono", t: a.cloudName, s: "Key ends " + a.keyEnds }, { k: "num", t: a.pct == null ? "—" : Math.round(a.pct) + "%", v: a.pct == null ? -1 : a.pct },
        { k: "status", t: state[0], tone: state[1] }],
        open: () => crSyAccountDrawer(a, i, accs, ctx, A.pin || "") };
    }), emptyText: "No Cloudinary account yet." }];
  if (accs.filter(a => !a.settings).length < (A.max || 8)) out.push({ type: "note", span: 6, icon: "plus-circle",
    text: "Add a Cloudinary account: a free one from cloudinary.com, signed up with another email address, adds its own credits and storage.",
    sub: "You need its cloud name, API key and API secret, from the Cloudinary console → Settings → API Keys. The keys are checked before they are kept.",
    act: { l: "Add an account…", run: () => crSyAccountForm(null, ctx) } });
  return out;
}
function crSyAccountDrawer(a, i, accs, ctx, pin) {
  const extras = accs.filter(x => !x.settings), xi = extras.findIndex(x => x.id === a.id);
  const act = (l, fn, okMsg) => ({ l, run: async () => { try { await fn(); ctx.closeDrawer(); ctx.toast(okMsg); ctx.reload(); } catch (e) { ctx.toast(crErr(e, "That didn’t work."), null, true); } } });
  const parts = a.parts || {}, name = { credits: "Plan credits", storage: "Storage", bandwidth: "Bandwidth", transformations: "Transformations" };
  const actions = [];
  if (a.enabled) actions.push(Object.assign(act("Check usage now", () => NGGApi.admin.media.accountCheck(a.id), "Checked " + a.label + "."), { primary: true }));
  /* Choose where new uploads go, now: held until Back to automatic (a full account is still skipped). */
  if (a.enabled && pin !== a.id && !a.active) actions.push(act("Use for new uploads now", () => NGGApi.admin.media.account(a.id), "New photos and edits now go to " + a.label + "."));
  if (pin) actions.push(act("Back to automatic", () => NGGApi.admin.media.account("auto"), "Automatic again: the next account takes over from 70% used."));
  if (!a.settings) {
    if (xi > 0) actions.push(act("Move up", () => NGGApi.admin.media.accountMove(a.id, "up"), a.label + " moved up."));
    if (xi >= 0 && xi < extras.length - 1) actions.push(act("Move down", () => NGGApi.admin.media.accountMove(a.id, "down"), a.label + " moved down."));
    actions.push({ l: "Change name or keys…", run: () => { ctx.closeDrawer(); crSyAccountForm(a, ctx); } });
    actions.push(act(a.enabled ? "Pause uploads to it" : "Resume", () => NGGApi.admin.media.accountSave({ id: a.id, enabled: !a.enabled }), a.enabled ? a.label + " takes no new uploads." : a.label + " is back in the order."));
    actions.push({ l: "Remove…", danger: true, run: async () => {
      if (!(await ctx.confirm({ title: "Remove " + a.label + "?", body: "Photos already on it keep showing — an image link needs no key. This site just stops uploading to it, reading its usage and deleting from it. You can add it again later.", cta: "Remove it" }))) return;
      try { const r = await NGGApi.admin.media.accountRemove(a.id); ctx.closeDrawer(); ctx.toast(a.label + " removed" + (r.photosStillThere ? " · " + crPlural(r.photosStillThere, "photo") + " on record still show from it" : "") + "."); ctx.reload(); }
      catch (e) { ctx.toast(crErr(e, "Couldn’t remove it."), null, true); }
    } });
  } else actions.push({ l: "Change keys in Settings", run: () => { ctx.closeDrawer(); ctx.go("settings", "keys"); } });
  ctx.drawer({ title: a.label, sub: a.cloudName + (a.primary ? " · main account" : ""),
    stats: [["Used", a.pct == null ? "Not read yet" : Math.round(a.pct) + "%"], ["Plan", a.plan || "—"], ["Checked", a.checkedAt ? crAgo(a.checkedAt) + " ago" : "Not yet"]],
    fields: Object.keys(name).filter(k => parts[k]).map(k => [name[k], parts[k].pct == null ? "Not reported" : Math.round(parts[k].pct) + "% used"])
      .concat([["API key", "ends " + a.keyEnds], ["Uploads", !a.enabled ? "Paused" : a.active ? "New uploads go here" : a.level === "critical" ? "Full — skipped" : "Next in line"]]),
    sections: a.error ? [{ h: "Last reading", text: a.error }] : undefined,
    actions });
}
function crSyAccountForm(a, ctx) {
  ctx.form({
    title: a ? "Change " + a.label : "Add a Cloudinary account", submit: a ? "Save" : "Check and add",
    intro: a ? "Leave the secret empty to keep the one saved. New keys are checked with Cloudinary before they are kept." : "From the Cloudinary console → Settings → API Keys. The keys are checked with Cloudinary before they are kept, and the secret is never shown again.",
    fields: [
      { id: "label", l: "Name on this list", max: 60, ph: "e.g. Second free plan" },
      { id: "cloudName", l: "Cloud name", req: true, max: 64, ac: "off", ph: "e.g. ngg-photos-2" },
      { id: "apiKey", l: "API key", req: !a, max: 20, ac: "off", ph: a ? "Ends " + a.keyEnds + " · leave empty to keep" : "The number" },
      { id: "apiSecret", l: "API secret", req: !a, type: "password", ac: "new-password", max: 64, ph: a ? "Saved · leave empty to keep" : "" },
    ],
    values: { label: a ? a.label : "", cloudName: a ? a.cloudName : "", apiKey: "", apiSecret: "" },
    onSubmit: async v => {
      const body = { label: String(v.label || "").trim(), cloudName: String(v.cloudName || "").trim(), apiKey: String(v.apiKey || "").trim(), apiSecret: String(v.apiSecret || "").trim() };
      if (a) body.id = a.id;
      try { return await NGGApi.admin.media.accountSave(body); }
      catch (e) { const f = CR_SY_ACC_ERR[e.code]; if (f) return { fieldErrors: { [f]: crErr(e, "") } }; throw e; }
    },
    done: () => { ctx.reload(); return a ? a.label + " saved." : "Added. It takes uploads when the accounts before it are full."; },
  });
}

/* What the storage bucket holds, and what was saved without touching a pixel:
   identical files stored once, and unused files swept (media-objects.php). */
const crSyBytes = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const CR_SY_KIND_NAMES = { post: "Community posts", assignment: "Hand-ins", headshot: "Headshots", avatar: "Profile pictures", cover: "Covers", proof: "Proofs", results: "School reports" };
function crSyObjectBlocks(o, ctx) {
  const out = [{ type: "status", span: 3, title: "Files in the bucket", sub: crNum(o.total.files) + " files · " + crSyBytes(o.total.bytes),
    summary: o.deduped.bytes || o.swept.bytes ? "Saved " + crSyBytes(o.deduped.bytes + o.swept.bytes) : "Nothing to save yet", tone: "ok",
    items: [["Identical files stored once", crNum(o.deduped.uploads) + " uploads · " + crSyBytes(o.deduped.bytes) + " not stored", "ok"],
            ["Unused files deleted", crNum(o.swept.files) + " · " + crSyBytes(o.swept.bytes) + " freed", "ok"]]
      .concat((o.byKind || []).slice(0, 5).map(k => [CR_SY_KIND_NAMES[k.kind] || k.kind || "Other", crNum(k.files) + " · " + crSyBytes(k.bytes), "neutral"])) }];
  out.push({ type: "note", span: 3, icon: "broom", text: "A file nothing uses for " + o.graceDays + " days — a photo picked and abandoned, a post deleted, a hand-in replaced — is deleted from the bucket every night. A file still on any record is never touched.",
    act: { l: "Clean up now", run: () => crSyObjectSweep(ctx) } });
  if (o.largest && o.largest.length) out.push({ type: "table", span: 6, title: "Largest files", sub: "Open one to see it. “Reused ×3” means three uploads of the same file, stored once.", nosel: true,
    cols: ["File", "Where", "By", { l: "Size", num: true }, { l: "Reused", num: true }, "Uploaded"],
    rows: o.largest.map(f => ({ key: f.key, cells: [{ k: "mono", t: f.key.split("/").pop() }, { k: "text", t: CR_SY_KIND_NAMES[f.kind] || f.kind || "—" }, { k: "text", t: f.owner || "—" },
        { k: "num", t: crSyBytes(f.bytes), v: f.bytes }, { k: "num", t: f.reuses ? "×" + (f.reuses + 1) : "—", v: f.reuses }, { k: "text", t: f.createdAt ? crAgo(f.createdAt) + " ago" : "—" }],
      open: () => { try { window.open(f.url, "_blank", "noopener"); } catch (_) {} } })) });
  return out;
}
async function crSyObjectSweep(ctx) {
  try { const r = await NGGApi.admin.media.sweep(); const x = r.ran || {}; ctx.toast(x.deleted ? "Deleted " + crNum(x.deleted) + " unused " + (x.deleted === 1 ? "file" : "files") + " · " + crSyBytes(x.freed) + " freed." : "Nothing to clean up: every file older than a week is still in use."); ctx.reload(); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t clean up the bucket."), null, true); }
}
async function crSyMediaCheck(ctx) {
  try { const r = await NGGApi.admin.media.usage(true); const u = r.usage || {}; ctx.toast("Checked: " + (u.pct == null ? "usage not reported" : Math.round(u.pct) + "% of the plan used") + "."); ctx.reload(); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t reach Cloudinary."), null, true); }
}
function crSyMediaPurge(ctx) {
  ctx.form({
    title: "Free space on Cloudinary", submit: "Free space",
    intro: "This deletes the derived copies of every image and video. Originals are not touched. Type FREE SPACE to confirm.",
    fields: [{ id: "confirm", l: "Type FREE SPACE", req: true, max: 20 }],
    values: { confirm: "" },
    onSubmit: async v => {
      try {
        const r = await NGGApi.admin.media.purge(String(v.confirm || "").trim());
        const u = r.usage || {};
        ctx.toast("Deleted " + crNum(r.deleted) + " derived " + (r.deleted === 1 ? "copy" : "copies") + (r.more ? " — more remain, press again" : "") + ". Now " + (u.pct == null ? "?" : Math.round(u.pct)) + "% used.");
        ctx.reload();
      } catch (e) { ctx.toast(crErr(e, "Couldn’t free space."), null, true); }
    },
  });
}

/* Edited photos still kept as a Cloudinary edit chain cost again at every size
   and format a page asks for. This stores each one once as a plain image. */
async function crSyPhotoMaterialise(ctx) {
  try {
    const d = await NGGApi.admin.photos.materialise(true);
    if (!d.chained) return ctx.toast("Every edited photo is already stored as a plain image.");
    const ok = await ctx.confirm({ title: "Store " + crPlural(d.chained, "edited photo") + " as plain images?", cta: "Store them",
      body: "Each is saved once as it looks now, so cards and pages stop re-running the edit (a background removal costs Cloudinary 75 transformations every time). The edit is kept on record. Up to 50 go per press." });
    if (!ok) return;
    const r = await NGGApi.admin.photos.materialise(false);
    ctx.toast("Stored " + crPlural(r.converted, "photo") + (r.failed ? ", " + crNum(r.failed) + " couldn’t be stored" : "") + (r.remaining ? " — " + crNum(r.remaining) + " left, press again" : "") + ".", null, !!r.failed);
    ctx.reload();
  } catch (e) { ctx.toast(crErr(e, "Couldn’t store the photos."), null, true); }
}
async function crSyPhotoSecure(ctx) {
  try {
    const r = await NGGApi.admin.photos.secure();
    ctx.toast(r.copied ? "Copied " + crPlural(r.copied, "photo") + " to safe storage" + (r.remaining ? " — " + crNum(r.remaining) + " left, press again" : "") + "."
      : "Every photo is already in safe storage.");
    ctx.reload();
  } catch (e) { ctx.toast(crErr(e, "Couldn’t copy the photos."), null, true); }
}

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
  const [cloud, setCloud] = React.useState(null);   // the missing photos, with the Cloudinary photos held for the same people
  const fileRef = React.useRef(null);
  const findCloud = async () => {
    setSt({ busy: "cloud", note: "Looking for the same people’s photos in Cloudinary…" });
    try { const r = await NGGApi.admin.photoFrame.cloud(); setCloud(r.items || []);
      setSt({ busy: "", note: r.items.length ? crPlural(r.withCandidates, "missing photo") + " of " + crNum(r.items.length) + " have a Cloudinary photo for the same person. Pick one for each." : "No photos are missing." }); }
    catch (e) { setSt({ busy: "", note: crErr(e, "Couldn’t look.") }); }
  };
  const useCloud = async (x, url) => {
    setSt({ busy: "cloud", note: "Pointing " + (x.who || "the record") + " at that photo…" });
    try { await NGGApi.admin.photoFrame.useCloud(x.name, x.place, x.rowId, url);
      setCloud(c => (c || []).filter(y => !(y.name === x.name && y.rowId === x.rowId && y.place === x.place)));
      setSt({ busy: "", note: (x.who || "The record") + " now shows their Cloudinary photo." }); ctx.reload(); }
    catch (e) { setSt({ busy: "", note: crErr(e, "Couldn’t change it.") }); }
  };
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
        <button type="button" className="cr-btn is-sm" disabled={!!st.busy} onClick={findCloud}>{st.busy === "cloud" ? "Looking…" : "Use their Cloudinary photos"}</button>
        <button type="button" className="cr-btn is-sm" disabled={!!st.busy} onClick={copyNames}>Copy the missing file names</button>
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden aria-label="Photo files from a backup" onChange={e => { restore(e.target.files); e.target.value = ""; }}/>
      </div>
      {st.note && <p className="cr-hint" role="status" aria-live="polite">{st.note}</p>}
      {cloud && cloud.length > 0 && <ul className="cr-sy-cloud">
        {cloud.map(x => <li key={x.place + x.rowId + x.name} className="cr-sy-cloud-row">
          <span className="cr-sy-cloud-who"><b>{x.who || x.ids.join(", ") || "Unknown record"}</b> <span className="cr-hint">{x.place}</span></span>
          {x.candidates.length ? <span className="cr-sy-cloud-picks">{x.candidates.map(u => <button key={u} type="button" className="cr-sy-cloud-pick" disabled={!!st.busy}
            onClick={() => useCloud(x, u)} aria-label={"Use this photo for " + (x.who || "this record")}><img src={u.replace("/upload/", "/upload/c_fill,w_96,h_96/")} alt="" loading="lazy" width="48" height="48"/></button>)}</span>
            : <span className="cr-hint">No Cloudinary photo held for this person — restore from a backup, or ask for a new one.</span>}
        </li>)}
      </ul>}
    </div>
  );
}

function crSyLight(ok, label, detail) { return [label, ok ? "OK" : (detail || "Failing"), ok ? "ok" : "bad"]; }

Object.assign(CR_TAB_DEFS, {
  ops: {
    skeleton: ["kpis", "table"],
    load: async () => {
      const [st, media, objects, accounts] = await Promise.all([NGGApi.admin.ops.status(), NGGApi.admin.media.usage().catch(() => null), NGGApi.admin.media.objects().catch(() => null),
        NGGApi.admin.media.accounts().catch(() => null)]);
      return Object.assign({}, st, { media: media && media.usage ? media : null, objects: objects && objects.configured ? objects : null, accounts: accounts && accounts.accounts ? accounts : null });
    },
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
        /* Will an update wipe them? Said plainly, with what to do about it. */
        if (p.dir) out.push(!p.insideSite
          ? { type: "note", span: 6, icon: "shield-check", tone: "ok", text: "Photos are kept in " + p.dir + ", outside the website folder — an update does not touch them.",
              sub: "Photos stored before this are copied across every night. Keep a copy anyway before a big change.",
              act: { l: "Download all photos", run: () => crSyPhotoBackup(ctx) } }
          : { type: "note", span: 6, icon: "warning", tone: "warn",
              text: "Photos are kept inside the website’s own folder (" + p.dir + "), so a deploy that deletes or replaces that folder deletes every photo with it.",
              sub: "This host didn’t let the site make a folder beside the website. Add  'photo_dir' => '" + crSyPhotoDirHint(p.dir) + "'  to api/config.php, then press “Search this account” below to bring the photos across. When deploying, unpack the new version over the old one; never delete the folder first.",
              act: { l: "Download all photos", run: () => crSyPhotoBackup(ctx) } });
        if (p.dir && !p.insideSite) out.push({ type: "note", span: 6, icon: "copy", text: "Copy every photo still sitting in the website folder to safe storage now, rather than waiting for tonight.",
          act: { l: "Copy them now", run: () => crSyPhotoSecure(ctx) } });
        {
          const lost = c.photoLinks && !c.photoLinks.ok, w = (c.photoLinks && c.photoLinks.where) || {};
          out.push({ type: "custom", span: 6,
            title: lost ? crPlural(c.photoLinks.missing, "photo") + " on record with no file on disk" : "Finding and moving photos",
            sub: lost ? (Object.keys(w).length ? Object.keys(w).map(k => w[k] + " in " + k).join(", ") + "." : "")
              : "Nothing is missing. “Search this account” also copies every photo out of the website folder.",
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

      /* Where a new upload goes. A bucket, once set, takes every upload, and
         Cloudinary's plan stops deciding whether uploads may go at all. */
      if (d.media) out.push(d.media.store
        ? { type: "status", span: 3, title: "File storage", sub: d.media.store.bucket + " · " + d.media.store.endpointHost, summary: "New uploads go to the bucket", tone: "ok",
            items: [["Files served from", d.media.store.host, "neutral"], ["Cloudinary", d.media.usage && d.media.usage.configured ? "Keeps serving what it already holds" : "Not used", "neutral"]] }
        : { type: "note", span: 3, icon: "info", text: "New uploads go to " + (d.media.uploadsTo === "cloudinary" ? "Cloudinary." : "this server.") + " A storage bucket (Cloudflare R2, Backblaze B2, Amazon S3 or any S3-compatible service) takes them instead once it is set in Settings → API keys → File storage, which has a step-by-step guide for each.",
            act: { l: "Set up storage", run: () => ctx.go("settings", "keys") } });
      if (d.objects) out.push(...crSyObjectBlocks(d.objects, ctx));
      if (d.media && d.media.usage && d.media.usage.configured) out.push(...crSyMediaBlocks(d.media, ctx));
      if (d.accounts && (d.accounts.primaryConfigured || d.accounts.accounts.length)) out.push(...crSyAccountBlocks(d.accounts, ctx));

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
/* The email sender, for Settings → API keys → Google Apps Script. A trimmed
   copy of apps-script/Code.gs (sendMail + ping, HMAC-signed): paste into a new
   Apps Script project, set SHARED_SECRET in Script properties, deploy as a Web
   app (Execute as: Me · Who has access: Anyone). */
const CR_SY_SCRIPT_MAIL = `// NGG — email sender. Script properties: SHARED_SECRET (the secret in Control Room).
function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '{}';
    if (!verify_(raw, (e && e.parameter && e.parameter.sig) || '')) return out_({ ok: false, error: 'bad_signature' });
    var p = JSON.parse(raw);
    if (p.op === 'ping') return out_({ ok: true, quota: MailApp.getRemainingDailyQuota(), account: Session.getEffectiveUser().getEmail() });
    if (p.op !== 'sendMail') return out_({ ok: false, error: 'unknown_op' });
    if (!p.to) return out_({ ok: false, error: 'no_recipient' });
    if (MailApp.getRemainingDailyQuota() < 1) return out_({ ok: false, error: 'quota_exhausted' });
    var o = { to: String(p.to), subject: String(p.subject || ''), htmlBody: String(p.html || ''), name: String(p.fromName || 'Next Generation Genius') };
    if (p.text) o.body = String(p.text);
    if (p.replyTo) o.replyTo = String(p.replyTo);
    MailApp.sendEmail(o);
    return out_({ ok: true, sent: 1 });
  } catch (err) { return out_({ ok: false, error: 'internal', detail: String(err && err.message || err) }); }
}
function doGet() { return out_({ ok: true, service: 'ngg-mail' }); }
function verify_(raw, sig) {
  var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!secret) throw new Error('SHARED_SECRET not configured');
  var hex = Utilities.computeHmacSha256Signature(raw, secret, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  sig = String(sig).toLowerCase();
  if (!sig || hex.length !== sig.length) return false;
  var r = 0; for (var i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return r === 0;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// Run once from the editor to grant the Mail permission: authorise() .
function authorise() { MailApp.getRemainingDailyQuota(); }
`;
function crSyNewSecret() {
  const a = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, b => ("0" + b.toString(16)).slice(-2)).join("");
}
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
/* ══ Make.com ════════════════════════════════════════════════════════════════
   Set up entirely here (domain/make.php), as three numbered steps, each with
   its state and its one action on the same row. NGG makes both keys; a key
   is shown inline, once, and stays until the operator says it is copied —
   never in a toast or a drawer that a stray click dismisses. The scenario
   guide lives here too, because the person building them in Make does not
   have the repository open. */
const CR_SY_MAKE_SIGN = "X-NGG-Timestamp: {{formatDate(now; \"X\")}}\nX-NGG-Signature: sha256={{sha256(TIMESTAMP + \".\" + BODY; \"hex\"; KEY)}}";
const CR_SY_MAKE_SCENARIOS = [
  { id: "heartbeat", icon: "heartbeat", t: "Keep time", s: "Runs reminders and the nightly absence check when nobody is visiting the site. Build this first.", needs: ["cron"],
    steps: ["For each address step 3 gave you: a new scenario with a Schedule trigger at the interval shown, then HTTP → Make a request (GET) to the address.",
      "Watchdog: a scenario every hour that sends {\"action\":\"jobs\"} to NGG’s door (signed) and, when healthy is false, messages the person who looks after the site."],
    body: "{\"action\":\"jobs\"}" },
  { id: "consent", icon: "signature", t: "Consent reminders", s: "Chases a guardian on WhatsApp when a registration is waiting for consent. Consent itself is still given on NGG’s form.", needs: ["secret", "hook"],
    steps: ["Trigger: the custom webhook, filtered to event = private.registration.stalled.",
      "WhatsApp the guardian an approved template with data.verifyUrl, and save data.ref with the time in a data store.",
      "Hourly over the store: send {\"action\":\"registration.status\",\"ref\":…}. Verified → delete the row. Not after 24 hours → WhatsApp again. Not after 48 → a call task for the centre coordinator."],
    body: "{\"action\":\"registration.status\",\"ref\":\"SS-…\"}" },
  { id: "absence", icon: "chat-circle-dots", t: "Why were they away?", s: "Asks guardians the morning after an absence. Their answer appears beside the absence on the Conduct tab.", needs: ["secret", "hook"],
    steps: ["Trigger: the custom webhook, filtered to event = private.attendance.absences. Iterate over data.items.",
      "WhatsApp each guardian a template with four quick replies — Sick, Travelled, Family matter, Other — and put the item’s ref in each button’s payload.",
      "Second scenario on WhatsApp’s incoming messages: send {\"action\":\"absence.reason\",\"ref\":…,\"reason\":\"sick\",\"channel\":\"whatsapp\"}. The reason explains the absence; staff decide whether to void it."],
    body: "{\"action\":\"absence.reason\",\"ref\":\"AB-…\",\"reason\":\"sick\",\"channel\":\"whatsapp\"}" },
  { id: "safeguarding", icon: "shield-warning", t: "Safeguarding escalation", s: "Makes sure a flag is taken by somebody. The message carries a reference and a link, never the child’s name.", needs: ["secret", "hook"],
    steps: ["Trigger: the custom webhook, filtered to event = safeguarding.flag. Message the safeguarding lead with data.adminUrl and an “I’ve got this” button carrying data.ref.",
      "Their tap: {\"action\":\"safeguarding.ack\",\"ref\":…,\"by\":\"their name\"}.",
      "Every 15 minutes: {\"action\":\"safeguarding.status\",\"ref\":…}. Not acknowledged after 2 hours → the deputy; after 6 → the director. Marking it reviewed on the Behaviour monitor also stops it."],
    body: "{\"action\":\"safeguarding.ack\",\"ref\":\"BL-…\",\"by\":\"Safeguarding lead\"}" },
  { id: "season", icon: "sun", t: "Summer School season", s: "Acts on the edition’s own dates: re-enrolment six weeks out, rota two weeks out, feedback in the last week.", needs: ["secret", "hook"],
    steps: ["Trigger: the custom webhook, filtered to event = edition.milestone. Branch on data.milestone: starts_in_42, starts_in_14, started, ends_in_7, ended.",
      "Read dates and counts with {\"action\":\"editions\"} — never type the dates into Make."],
    body: "{\"action\":\"editions\"}" },
  { id: "impact", icon: "chart-line-up", t: "Monthly impact report", s: "Fills a Google Doc or Slides with last month’s figures — counts only, ready for funders.", needs: ["secret"],
    steps: ["Schedule: the 1st of each month. Send {\"action\":\"impact\"} (or add \"month\":\"2026-09\").",
      "Map data.totals and data.centres into a Google Docs or Slides template and share it with the director."],
    body: "{\"action\":\"impact\"}" },
];
const CR_SY_JOB_LABEL = { all: "Every background job that is due", deliver: "Sending events", reminders: "Reminders", maint: "Absence check and upkeep", editions: "Season dates", accrue: "Fees" };

function crSyMakeState(m) {
  const done = [m.secretSet, !!(m.destination && m.destination.status === "active"), m.cronSet];
  const n = done.filter(Boolean).length;
  if (!m.secretSet && m.destination && m.destination.status === "paused") return { done, n, t: "Turned off", tone: "neutral" };
  if (n === 0) return { done, n, t: "Not set up", tone: "neutral" };
  if (n < 3) return { done, n, t: "Step " + (done.indexOf(false) + 1) + " of 3", tone: "warn" };
  if (m.delivery && m.delivery.dead) return { done, n, t: "Events failing", tone: "bad" };
  if (m.jobs && !m.jobs.healthy) return { done, n, t: "Jobs behind", tone: "warn" };
  return { done, n, t: "On", tone: "ok" };
}

/** A key or address shown once, with its own copy button, until dismissed. */
function CrSyMakeReveal({ ctx, r, onDone }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  return (
    <section ref={ref} tabIndex={-1} className="cr-box cr-mk-reveal" aria-labelledby="cr-mk-reveal-h">
      <div className="cr-mk-reveal-head"><CrIcon n="key"/><b id="cr-mk-reveal-h">{r.title}</b></div>
      <p className="cr-mk-hint">{r.note}</p>
      {r.items.map((it, i) => (
        <div key={i} className="cr-mk-copy">
          <span className="cr-mk-copy-l">{it.l}</span>
          <code className="cr-mk-code">{it.v}</code>
          <button type="button" className="cr-btn is-sm" aria-label={"Copy " + it.l} onClick={() => crSyCopy(ctx, it.v, it.l)}><CrIcon n="copy"/>Copy</button>
        </div>
      ))}
      <div className="cr-mk-reveal-foot">
        <span className="cr-mk-hint">After this, only the last four characters are shown.</span>
        <button type="button" className="cr-btn is-primary" onClick={onDone}>I’ve copied it</button>
      </div>
    </section>
  );
}

function CrSyMakeStep({ n, done, title, what, children, action }) {
  return (
    <li className={"cr-mk-step" + (done ? " is-done" : "")}>
      <span className="cr-mk-num" aria-hidden="true">{done ? <CrIcon n="check"/> : n}</span>
      <div className="cr-mk-step-body">
        <b>{title}<span className="cr-sr">{done ? " — done" : " — to do"}</span></b>
        <span className="cr-mk-what">{what}</span>
        {children}
      </div>
      {action && <div className="cr-mk-step-acts">{action}</div>}
    </li>
  );
}

function CrSyMake({ ctx, make }) {
  const [m, setM] = React.useState(make);
  const [reveal, setReveal] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const [test, setTest] = React.useState(null);
  React.useEffect(() => { setM(make); }, [make]);
  const st = crSyMakeState(m);
  const d = m.destination, dl = m.delivery || {};
  const jobs = (m.jobs && m.jobs.jobs) || [];
  const late = jobs.filter(j => j.stale);
  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { ctx.toast(crErr(e, "That didn’t work. Try again."), null, true); } setBusy(""); };

  const makeSecret = () => run("secret", async () => {
    if (m.secretSet && !(await ctx.confirm({ title: "Replace Make’s signing key?", danger: true, cta: "Replace it",
      body: "Make’s calls stop working the moment you press this, until the new key is in every scenario that calls NGG." }))) return;
    const r = await NGGApi.admin.integrations.makeSecret();
    setM(r.make);
    setReveal({ title: "Copy Make’s signing key now", note: "In Make, keep it in a data store or a scenario variable. Sign every call to NGG’s door with it — the headers are in “How to call NGG” below.",
      items: [{ l: "Signing key", v: r.secret }, { l: "NGG’s door", v: m.door }] });
  });
  const makeCron = () => run("cron", async () => {
    if (m.cronSet && !(await ctx.confirm({ title: "Replace the scheduler key?", danger: true, cta: "Replace it",
      body: "Every scheduled call using the old addresses stops at once — Make’s, and any cPanel cron or uptime monitor." }))) return;
    const r = await NGGApi.admin.integrations.makeCron();
    setM(r.make);
    setReveal({ title: "Copy the scheduler address now", note: "Best: put it in the CACENTRE gate as the secret NGG_CRON_URL (Cloudflare → the gate worker → Settings → Variables and Secrets) — the gate calls it every minute. Or one Make scenario: a Schedule trigger every minute, then HTTP → Make a request (GET) to it.",
      items: (r.urls || []).map(u => ({ l: u.every + " — " + (CR_SY_JOB_LABEL[u.job] || u.job), v: u.url })) });
  });
  const connect = () => ctx.form({
    title: d ? "Move Make’s webhook" : "Connect Make’s webhook", submit: "Connect", busyLabel: "Connecting…",
    intro: "In Make: Create a scenario → add Webhooks → Custom webhook → Add → Save, then copy the address it shows.",
    values: { url: d ? d.url : "" },
    fields: [{ id: "url", l: "Make webhook address", req: true, type: "url", ph: "https://hook.eu1.make.com/…",
      help: "NGG sends it only the events the scenarios below use — never everything.",
      check: v => /^https:\/\/hook\.[a-z0-9]+\.make\.com\/[A-Za-z0-9_-]+$/.test(String(v).trim()) ? "" : "Paste a Make custom webhook address — it starts https://hook.eu1.make.com/" }],
    onSubmit: async v => { const r = await NGGApi.admin.integrations.makeConnect(String(v.url).trim()); setM(r.make); setTest(null); ctx.reload(); return r; },
    done: (v, r) => (r && r.moved ? "Moved" : "Connected") + " — press Send test to check Make receives it",
  });
  const sendTest = () => run("test", async () => {
    setTest(null);
    const r = await NGGApi.admin.integrations.test(d.integrationId);
    setTest(r.delivered ? { ok: true, t: "Make received the test. Open the scenario in Make to see it." } : { ok: false, t: "Make did not take it: " + (r.error || "no answer") + ". Is the scenario switched on, or listening with “Run once”?" });
    ctx.reload();
  });
  const turnOff = () => run("off", async () => {
    if (!(await ctx.confirm({ title: "Turn Make off?", danger: true, cta: "Turn it off",
      body: "Make’s calls to NGG are refused and its events pause. The scheduler keeps running. Make a new signing key to turn it back on." }))) return;
    const r = await NGGApi.admin.integrations.makeOff();
    setM(r.make); ctx.toast("Make.com turned off");
  });

  return (
    <div className="cr-mk">
      <div className="cr-box cr-mk-panel">
        <header className="cr-mk-head">
          <div><b>Make.com</b><span className="cr-mk-what">Reminders, guardians’ replies and escalations that wait on a person. Set up here — nothing to edit on the server, and every rule stays in NGG.</span></div>
          <CrPill tone={st.tone} t={st.t}/>
        </header>
        <p className="cr-sr" role="status" aria-live="polite">{"Make.com: " + st.t + ", " + st.n + " of 3 steps done."}</p>
        {!m.sealed && <p className="cr-key-res is-bad"><CrIcon n="warning-circle"/>This server cannot encrypt keys (PHP openssl is missing), so they cannot be made here.</p>}

        {reveal && <CrSyMakeReveal ctx={ctx} r={reveal} onDone={() => { setReveal(null); ctx.reload(); }}/>}

        <ol className="cr-mk-steps">
          <CrSyMakeStep n={1} done={st.done[0]} title="Signing key" what="Lets Make answer back — guardians’ replies, safeguarding acknowledgements."
            action={<button type="button" className={"cr-btn is-sm" + (st.done[0] ? "" : " is-primary")} disabled={!m.sealed || !!busy} onClick={makeSecret}>{busy === "secret" ? "Making…" : m.secretSet ? "Replace" : "Make key"}</button>}>
            <span className="cr-mk-state">{m.secretSet ? <>Ends <code>…{m.secretEnding}</code>{m.secretSource === "file" ? " · from config.php" : m.secretAt ? " · made " + crAgo(m.secretAt) + (m.secretBy ? " by " + m.secretBy : "") : ""}</> : "Not made yet — Make cannot call NGG."}</span>
          </CrSyMakeStep>

          <CrSyMakeStep n={2} done={st.done[1]} title="Make’s webhook" what="Where NGG sends absences, stalled consents, safeguarding flags and season dates."
            action={<>
              {d && d.status === "active" && <button type="button" className="cr-btn is-sm" disabled={!!busy} onClick={sendTest}>{busy === "test" ? "Sending…" : "Send test"}</button>}
              <button type="button" className={"cr-btn is-sm" + (st.done[0] && !st.done[1] ? " is-primary" : "")} disabled={!m.sealed || !!busy} onClick={connect}>{d ? "Change" : "Connect"}</button>
            </>}>
            {d ? <span className="cr-mk-state"><code className="cr-mk-url">{d.url}</code>{d.status === "paused" ? " · paused" : ""}</span> : <span className="cr-mk-state">Not connected.</span>}
            {d && <span className="cr-mk-state">{dl.ok ? crNum(dl.ok) + " delivered, last " + crAgo(dl.lastOkAt) : "Nothing delivered yet"}{dl.waiting ? " · " + crNum(dl.waiting) + " waiting" : ""}{dl.dead ? " · " + crNum(dl.dead) + " failed for good" : ""}</span>}
            {d && dl.dead > 0 && dl.lastError && <p className="cr-key-res is-bad" role="status"><CrIcon n="warning-circle"/>{dl.lastError}</p>}
            {test && <p className={"cr-key-res " + (test.ok ? "is-ok" : "is-bad")} role="status"><CrIcon n={test.ok ? "check-circle" : "warning-circle"}/>{test.t}</p>}
          </CrSyMakeStep>

          <CrSyMakeStep n={3} done={st.done[2]} title="Scheduler" what="Keeps the background jobs on time when nobody is visiting the site."
            action={<button type="button" className={"cr-btn is-sm" + (st.done[0] && st.done[1] && !st.done[2] ? " is-primary" : "")} disabled={!m.sealed || !!busy} onClick={makeCron}>{busy === "cron" ? "Making…" : m.cronSet ? "Replace" : "Make the address"}</button>}>
            <ul className="cr-mk-jobs" aria-label="Background jobs">
              {jobs.map(j => (
                <li key={j.job} className={j.stale ? "is-late" : "is-ok"}>
                  <span className="cr-mk-dot" aria-hidden="true"/>
                  <span>{CR_SY_JOB_LABEL[j.job] || j.job}</span>
                  <span className="cr-mk-when">{j.lastRunAt ? "ran " + crAgo(j.lastRunAt) : "not run yet"}{j.stale ? " · late" : ""}</span>
                </li>
              ))}
            </ul>
            {m.cronSet && late.length > 0 && <span className="cr-mk-state">Late jobs usually mean nothing is calling the scheduler address: the gate’s NGG_CRON_URL is missing or old, or a Make scenario is off.</span>}
          </CrSyMakeStep>
        </ol>

        <p className="cr-key-res"><CrIcon n="lock-simple"/><span>In Make, open each NGG scenario’s settings and turn on <b>Data is confidential</b>, so Make keeps no copy of children’s names or guardians’ numbers.</span></p>

        <footer className="cr-mk-foot">
          <span className="cr-mk-hint">{m.lastAnswerAt ? "Make last answered " + crAgo(m.lastAnswerAt) + "." : "No answer from Make yet."}</span>
          <span className="cr-grow"/>
          <button type="button" className="cr-btn is-sm" onClick={() => crSyCopy(ctx, m.door, "Door address")}><CrIcon n="copy"/>Copy door address</button>
          {(m.secretSource === "here" || (d && d.status === "active")) && <button type="button" className="cr-btn is-sm is-danger" disabled={!!busy} onClick={turnOff}>Turn off</button>}
        </footer>
      </div>

      <div className="cr-box cr-mk-panel">
        <header className="cr-mk-head"><div><b>Scenarios to build in Make</b><span className="cr-mk-what">Each one says what it needs from the steps above. Open one for its build steps.</span></div></header>
        <details className="cr-mk-sc">
          <summary><CrIcon n="code"/><span><b>How to call NGG</b><span className="cr-mk-what">The request every scenario below sends back.</span></span></summary>
          <div className="cr-mk-sc-body">
            <p>HTTP → Make a request: method POST, address <code>{m.door}</code>, body type Raw, content type application/json. Build the body once in a Set variable module and send that exact text — the signature covers it. Calls older than five minutes are refused.</p>
            <div className="cr-mk-copy"><span className="cr-mk-copy-l">Headers</span><code className="cr-mk-code">{CR_SY_MAKE_SIGN}</code><button type="button" className="cr-btn is-sm" aria-label="Copy the headers" onClick={() => crSyCopy(ctx, CR_SY_MAKE_SIGN, "Headers")}><CrIcon n="copy"/>Copy</button></div>
          </div>
        </details>
        {CR_SY_MAKE_SCENARIOS.map(sc => {
          const missing = sc.needs.filter(k => !(k === "secret" ? st.done[0] : k === "hook" ? st.done[1] : st.done[2]));
          return (
            <details key={sc.id} className="cr-mk-sc">
              <summary><CrIcon n={sc.icon}/><span><b>{sc.t}</b><span className="cr-mk-what">{sc.s}</span></span>
                <CrPill tone={missing.length ? "neutral" : "ok"} t={missing.length ? "Needs step " + missing.map(k => ({ secret: 1, hook: 2, cron: 3 })[k]).join(" and ") : "Ready to build"}/></summary>
              <div className="cr-mk-sc-body">
                <ol>{sc.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
                <div className="cr-mk-copy"><span className="cr-mk-copy-l">Example body</span><code className="cr-mk-code">{sc.body}</code><button type="button" className="cr-btn is-sm" aria-label={"Copy the example body for " + sc.t} onClick={() => crSyCopy(ctx, sc.body, "Body")}><CrIcon n="copy"/>Copy</button></div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
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
        d.make ? { type: "custom", span: 6, render: () => <CrSyMake ctx={ctx} make={d.make}/> } : null,
        { type: "cards", span: 6, title: "Destinations", empty: d.make && d.make.destination ? "No other destinations. Make.com is set up above." : "No integrations yet. Add one to send events to Google Chat, Sheets, Drive or your own endpoint.",
          cards: items.filter(i => !(d.make && d.make.destination && i.integrationId === d.make.destination.integrationId)).map(i => {
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
const CR_SY_TOGGLES = ["applications_open", "mentor_applications_open", "volunteer_applications_open", "intake_photo_required", "photo_gate_issuance", "geofence_enabled", "volunteer_sms_notify", "checkin_state_emails", "qotw_mail", "companion_enabled", "face_check_enabled"];
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
        tog("face_check_enabled", "Face check at the check-in desk", "After a card is scanned, the desk can compare the person’s face with the photo on their record, with a check that it is a live face, not a photo or a screen held up. It runs on the desk’s own device: no image or face data is sent or kept — only the result. It advises; the person on duty decides. Tell parents before turning it on."),
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
function crSyKeyEdit(ctx, s, prov) {
  const ids = s.fields.map((f, i) => "f" + i);
  const vals = {};
  s.fields.forEach((f, i) => { vals[ids[i]] = f.kind === "secret" ? "" : (f.source === "here" ? f.value : ""); });
  /* File storage: the provider picked in the guide fills its own label and
     shows that provider's shapes as placeholders, so the form says what to type. */
  const pv = prov && s.providers ? s.providers.find(x => x.id === prov) : null;
  const shape = pv ? { "storage.endpoint": pv.endpoint, "storage.region": pv.region, "storage.public_base": pv.public, "storage.provider": pv.label } : {};
  if (pv) s.fields.forEach((f, i) => { if (f.path === "storage.provider") vals[ids[i]] = pv.label; });
  ctx.form({
    title: (s.setHere || s.connected ? "Change " : "Connect ") + (pv ? pv.label : s.label),
    intro: s.what + (s.guarded ? " Once a secret key is in use, a change waits until a second person with Fees and Settings confirms it, and everyone with Fees is emailed." : ""),
    submit: s.guarded && s.connected ? "Propose the change" : "Save",
    values: vals,
    fields: s.fields.map((f, i) => ({
      id: ids[i], l: f.label, req: false, max: 400,
      type: f.kind === "secret" ? "password" : f.kind === "port" ? "text" : f.kind === "email" ? "email" : "text",
      ac: f.kind === "secret" ? "new-password" : "off", im: f.kind === "port" ? "numeric" : undefined,
      ph: f.kind === "secret" ? (f.set ? "Saved · ends " + f.ending + (f.source === "file" ? " (config.php)" : "") + " — leave blank to keep" : "Paste the key")
        : (f.source === "file" ? f.value + " (config.php)" : (shape[f.path] || "")),
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
/* API keys, as one structured list (§ Settings → API keys): a summary of
   what is connected, one section per group saying what is in use, and one row
   per service — icon, name, a one-line purpose, its state and the one thing to
   do next. The row opens in place for its fields, Test, Remove and the
   provider's link, so the page reads as a checklist rather than a wall of
   cards. Each row stays an article named for its service. */
const CR_SY_KEY_ICON = { gemini: "sparkle", groq: "lightning", anthropic: "brain", openai: "open-ai-logo", openrouter: "shuffle", cloudinary: "cloud", paystack: "credit-card",
  appsscript: "google-logo", brevo: "paper-plane-tilt", smtp: "envelope-simple", resend: "paper-plane-right", termii: "chat-text", twilio: "phone",
  googlemaps: "map-pin", spitch: "speaker-high" };
const CR_SY_MAIL_LABEL = { apps_script: "Google Apps Script", smtp: "SMTP", brevo: "Brevo", resend: "Resend", php_mail: "PHP mail() — usually dropped" };
function crSyKeyState(s) {
  if (s.connected) return { t: s.setHere ? "Connected" : "Connected · config.php", tone: "ok" };
  return s.fields.some(f => f.set) ? { t: "Incomplete", tone: "warn" } : { t: "Not set", tone: "neutral" };
}
function crSyFirstSentence(t) {
  const parts = String(t || "").match(/[^.!?]+[.!?]+(\s|$)/g) || [String(t || "")];
  let out = parts[0].trim();
  if (out.length < 30 && parts[1]) out += " " + parts[1].trim();   // "Paid." alone says too little
  return out;
}
/* File storage's connection guide: a picker of S3-compatible providers and
   that provider's numbered steps, its address shapes and the CORS rule the
   bucket needs (the browser uploads straight to it). The catalogue is the
   server's (STORAGE_PROVIDERS, service-keys.php) — one list. */
function crSyStorageProvider(s) {
  const f = s.fields.find(x => x.path === "storage.provider");
  const said = String(f && f.value || "").toLowerCase();
  const hit = said && s.providers.find(p => p.label.toLowerCase() === said || p.id === said);
  if (hit) return hit.id;
  const ep = String((s.fields.find(x => x.path === "storage.endpoint") || {}).value || "");
  const by = [["r2", /r2\.cloudflarestorage/], ["b2", /backblazeb2/], ["s3", /amazonaws/], ["wasabi", /wasabisys/], ["spaces", /digitaloceanspaces/], ["supabase", /supabase\.co/], ["idrive", /idrivee2/]];
  const m = ep && by.find(x => x[1].test(ep));
  return m ? m[0] : ep ? "other" : "r2";
}
function CrSyStorageGuide({ ctx, s, prov, setProv }) {
  const p = s.providers.find(x => x.id === prov) || s.providers[0];
  const gid = "cr-stg-" + p.id;
  return (
    <section className="cr-stg" aria-labelledby={gid + "-h"}>
      <div className="cr-stg-head">
        <label className="cr-stg-pick"><span>Provider</span>
          <select className="cr-select" value={p.id} onChange={e => setProv(e.target.value)}>
            {s.providers.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select></label>
        <p className="cr-hint">{p.note}</p>
      </div>
      <h4 id={gid + "-h"} className="cr-stg-h">Connect {p.label}, step by step</h4>
      <ol className="cr-stg-steps">{p.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
      <dl className="cr-stg-shape">
        <div><dt>Endpoint</dt><dd className="cr-mono">{p.endpoint}</dd></div>
        <div><dt>Region</dt><dd className="cr-mono">{p.region}</dd></div>
        <div><dt>Public address</dt><dd className="cr-mono">{p.public}</dd></div>
      </dl>
      {p.id !== "supabase" && s.cors && <details className="cr-stg-cors"><summary>{p.id === "b2" ? "The B2 command that sets the CORS rule" : "The CORS rule for this site"}</summary><pre className="cr-mono">{p.id === "b2" ? s.corsB2 : s.cors}</pre></details>}
      <div className="cr-key-acts">
        <button type="button" className="cr-btn is-sm is-primary" onClick={() => crSyKeyEdit(ctx, s, p.id)}>{s.connected || s.setHere ? "Change to " + p.label : "Connect " + p.label}</button>
        {p.id !== "supabase" && s.cors && (p.id === "b2"
          ? <button type="button" className="cr-btn is-sm" onClick={() => crSyCopy(ctx, s.corsB2, "The B2 command")}>Copy the B2 command</button>
          : <button type="button" className="cr-btn is-sm" onClick={() => crSyCopy(ctx, s.cors, "The CORS rule")}>Copy the CORS rule</button>)}
        <span className="cr-grow"/>
        <a className="cr-key-link" href={p.link} target="_blank" rel="noopener noreferrer">Open {p.label}<CrIcon n="arrow-up-right"/><span className="cr-sr"> (opens in a new tab)</span></a>
      </div>
    </section>
  );
}
function CrSyKeyCard({ ctx, s, open, onToggle }) {
  const [prov, setProv] = React.useState(() => s.providers ? crSyStorageProvider(s) : "");
  const [res, setRes] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const st = crSyKeyState(s);
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
  const pid = "cr-key-" + s.id;
  return (
    <article className={"cr-key" + (s.connected ? " is-on" : "") + (open ? " is-open" : "")} aria-label={s.label}>
      <div className="cr-key-row">
        <span className={"cr-key-ico cr-t-" + st.tone} aria-hidden="true"><CrIcon n={CR_SY_KEY_ICON[s.id] || "key"}/></span>
        <button type="button" className="cr-key-name" aria-expanded={open} aria-controls={pid} onClick={onToggle}>
          <b>{s.label}</b><span>{crSyFirstSentence(s.what)}</span>
        </button>
        {s.connected && (() => { const k = s.fields.find(f => f.kind === "secret" && f.set) || s.fields.find(f => f.set);
          return k ? <span className="cr-key-peek cr-mono">{k.kind === "secret" ? "•••• " + k.ending : k.value}</span> : null; })()}
        <CrPill tone={st.tone} t={st.t}/>
        {s.connected || s.setHere
          ? <button type="button" className="cr-btn is-sm" aria-expanded={open} aria-controls={pid} onClick={onToggle}>{open ? "Close" : "Manage key"}</button>
          : s.providers ? <button type="button" className="cr-btn is-sm" aria-expanded={open} aria-controls={pid} onClick={onToggle}>{open ? "Close" : "Set up"}</button>
          : <button type="button" className="cr-btn is-sm" onClick={() => crSyKeyEdit(ctx, s)}>Add key</button>}
      </div>
      <div className="cr-key-body" id={pid} hidden={!open}>
        <p className="cr-key-what">{s.what}</p>
        <dl className="cr-key-fields">
          {s.fields.map(f => (
            <div key={f.path}><dt>{f.label}{f.optional ? <em> · optional</em> : null}</dt>
              <dd>{!f.set ? <span className="cr-hint">{f.optional ? "—" : "Not set"}</span>
                : f.kind === "secret" ? <span className="cr-mono">•••• {f.ending}</span> : <span className="cr-mono">{f.value}</span>}
                {f.set && f.source === "file" && <span className="cr-key-src">config.php</span>}</dd></div>
          ))}
        </dl>
        {res && <p className={"cr-key-res" + (res.pass === true ? " is-ok" : res.pass === false ? " is-bad" : "")} role="status"><CrIcon n={res.pass === true ? "check-circle" : res.pass === false ? "warning-circle" : "info"}/>{res.detail}{res.ms ? " · " + crNum(res.ms) + " ms" : ""}</p>}
        <div className="cr-key-acts">
          {(s.connected || s.setHere) && !s.providers && <button type="button" className="cr-btn is-sm is-primary" onClick={() => crSyKeyEdit(ctx, s)}>Change</button>}
          {s.testable && <button type="button" className="cr-btn is-sm" disabled={busy || !s.connected} title={s.connected ? "" : "Add the key first."} onClick={test}>{busy ? "Testing…" : "Test"}</button>}
          {s.setHere && <button type="button" className="cr-btn is-sm" onClick={remove}>Remove</button>}
          {s.id === "appsscript" && <button type="button" className="cr-btn is-sm" onClick={() => crSyCopy(ctx, CR_SY_SCRIPT_MAIL, "The Apps Script")}>Copy the Apps Script</button>}
          {s.id === "appsscript" && <button type="button" className="cr-btn is-sm" onClick={() => crSyCopy(ctx, crSyNewSecret(), "A new secret")} title="Paste it into the script’s SHARED_SECRET and into Change here.">Copy a new secret</button>}
          <span className="cr-grow"/>
          {s.changedAt && <span className="cr-hint">Changed {crAgo(s.changedAt)}{s.changedBy ? " by " + s.changedBy : ""}</span>}
          {!s.providers && <a className="cr-key-link" href={s.link} target="_blank" rel="noopener noreferrer">{s.connected ? "Open " + s.label : "Get a key"}<CrIcon n="arrow-up-right"/><span className="cr-sr"> (opens in a new tab)</span></a>}
        </div>
        {s.providers && <CrSyStorageGuide ctx={ctx} s={s} prov={prov} setProv={setProv}/>}
      </div>
    </article>
  );
}
/** The whole API keys list: summary, group index, and the rows. */
function CrSyKeysList({ ctx, svc }) {
  const list = svc.services || [], groups = svc.groups || {};
  const [open, setOpen] = React.useState(null);
  const conn = list.filter(s => s.connected).length;
  const jump = g => { const el = document.getElementById("cr-keyg-" + g); if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); const b = el.querySelector("button"); if (b) b.focus({ preventScroll: true }); } };
  const groupNote = g => {
    const on = list.filter(s => s.group === g && s.connected);
    if (g === "email") return svc.mailMode === "php_mail" ? "Nothing is connected, so email falls back to PHP mail(), which most hosts drop. Set up Google Apps Script." 
      : svc.mailMode ? "Sending through " + (CR_SY_MAIL_LABEL[svc.mailMode] || svc.mailMode) + ". The order tried: Apps Script, SMTP, Brevo, Resend." : "";
    if (g === "ai") return on.length ? "Each AI feature uses the first connected provider; the table below shows which." : "Without a key every feature runs on its built-in rules.";
    return "";
  };
  return (
    <div className="cr-keys">
      <div className="cr-keys-sum">
        <div className="cr-keys-count"><b>{conn}</b><span>of {list.length} services connected</span></div>
        <nav className="cr-keys-idx" aria-label="Groups">
          {Object.keys(groups).map(g => { const m = list.filter(s => s.group === g); if (!m.length) return null; const c = m.filter(s => s.connected).length;
            return <button key={g} type="button" className={"cr-keys-chip" + (c ? " is-on" : "")} onClick={() => jump(g)}>{groups[g]}<span>{c}/{m.length}</span></button>; })}
        </nav>
        <p className="cr-keys-lock"><CrIcon n="lock-key"/>{svc.sealed === false ? "This server cannot encrypt (PHP openssl is missing), so keys can only be set in api/config.php."
          : "Keys are encrypted on the server and never shown again — only how each ends. A key here overrides api/config.php."}</p>
      </div>
      {Object.keys(groups).map(g => {
        const mine = list.filter(x => x.group === g);
        if (!mine.length) return null;
        const note = groupNote(g);
        return (
          <section key={g} className="cr-keys-group" id={"cr-keyg-" + g} aria-labelledby={"cr-keyh-" + g}>
            <header><h3 id={"cr-keyh-" + g}>{groups[g]}</h3>{note && <p>{note}</p>}</header>
            <div className="cr-keys-rows">{mine.map(x => <CrSyKeyCard key={x.id} ctx={ctx} s={x} open={open === x.id} onToggle={() => setOpen(open === x.id ? null : x.id)}/>)}</div>
          </section>
        );
      })}
    </div>
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
  /* Six slots: two for photos, then the backups every AI job uses (the tutor, the
     Companion, report cards, marking): three Gemini keys that share the load and
     cover for each other, and a Groq key as the last resort. */
  const SL = [["framing", "Key 1 — headshot framing", "Measures each photo so the card shows an accurate head-and-shoulders."],
    ["second", "Key 2 — photo checks, and backup for framing", ""],
    ["pool1", "Backup Gemini key A — every AI job", "The tutor, the Companion, report cards and marking use these three in turn, and switch when one runs out for the day."],
    ["pool2", "Backup Gemini key B — every AI job", ""], ["pool3", "Backup Gemini key C — every AI job", ""],
    ["groq", "Groq key — last resort", "From console.groq.com (starts gsk_). Used when every Gemini key is out. Not used to read photos or report cards."]];
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  const vals = { model: (k && k.model) || "" }; SL.forEach(([id]) => { vals[id + "Key"] = ""; vals["clear" + cap(id)] = false; });
  ctx.form({
    title: "AI keys",
    intro: "Gemini keys from Google AI Studio (aistudio.google.com → Get API key), each from a different Google account so each has its own free quota. Leave a field blank to keep the key already saved. Keys are encrypted on the server and never shown again.",
    submit: "Save keys",
    values: vals,
    fields: SL.map(([id, l, help]) => ({ id: id + "Key", l, type: "password", ac: "new-password", max: 200, ph: k && k[id] && k[id].set ? "Saved · ends " + k[id].ending : id === "groq" ? "gsk_…" : "AQ.… or AIza…", help: help || undefined }))
      .concat([{ id: "model", l: "Gemini model", max: 60, ph: "Automatic", help: "Leave blank: each key uses the newest Gemini Flash model Google lets it use, and moves on by itself when Google retires one." }])
      .concat(SL.filter(([id]) => k && k[id] && k[id].set).map(([id, l]) => ({ id: "clear" + cap(id), l: "Remove " + l.split(" — ")[0].toLowerCase(), type: "switch" }))),
    onSubmit: async v => {
      const body = { model: v.model.trim() }; SL.forEach(([id]) => { body[id + "Key"] = (v[id + "Key"] || "").trim(); body["clear" + cap(id)] = !!v["clear" + cap(id)]; });
      try { return await NGGApi.admin.summer.aiKeysSet(body); }
      catch (e) { if (e.code === "bad_key") return { fieldErrors: { [((e.data && e.data.field) || "framing") + "Key"]: crErr(e, "") } }; if (e.code === "bad_model") return { fieldErrors: { model: crErr(e, "") } }; throw e; }
    },
    done: () => { ctx.reload(); return "Saved. Use “Test” to check each key works."; },
  });
}
async function crSyKeysTest(ctx) {
  ctx.toast("Sending one small request with each key…");
  try {
    const r = await NGGApi.admin.summer.aiKeysTest();
    const names = { framing: "Key 1", second: "Key 2", pool1: "Backup A", pool2: "Backup B", pool3: "Backup C", groq: "Groq" };
    const say = (n, x) => n + ": " + (x.ok ? "works" + (x.model ? " (" + x.model + ")" : "") : x.error === "not_set" ? "not set" : "refused — " + (x.detail || x.error));
    const res = r.results || {};
    ctx.toast(Object.keys(names).filter(id => res[id]).map(id => say(names[id], res[id])).join(" · "), null, !Object.values(res).some(x => x.ok));
  } catch (e) { ctx.toast(crErr(e, "Couldn’t test the keys."), null, true); }
}
/* AI spending (api/_lib/ai.php ai_route): nobody chooses a provider. Everyday work runs on
   free models; hard thinking tries paid ones first, under this monthly limit. */
const CR_SY_JOB = { everyday: "Everyday · free models", brain: "Hard thinking · paid first" };
function crSyUsd(n) { const v = Number(n) || 0; return "$" + (v > 0 && v < 0.01 ? v.toFixed(4) : v.toFixed(2)); }
function crSyAiSpendForm(ctx, sp) {
  ctx.form({
    title: "AI spending",
    intro: "Free models (Groq, Gemini, OpenRouter’s free ones) do everyday work. Paid models (Claude, OpenAI) only do hard thinking — marking written answers and the Analyst — and only within this monthly limit. Once it is reached they wait until next month and the free models carry on.",
    submit: "Save",
    values: { limit: sp.limitUsd ? String(sp.limitUsd) : "", everyday: sp.paidEveryday ? "1" : "0", prices: (sp.prices || []).map(x => x.model + " " + x.in + " " + x.out).join("\n") },
    fields: [
      { id: "limit", l: "Monthly limit for paid models (US$)", im: "decimal", ph: "0 — paid models off", max: 10,
        help: "Estimated from each call’s tokens. Leave blank or 0 to keep paid models off.",
        check: v => (v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0)) ? "" : "Enter a number of dollars, such as 10 or 12.50." },
      { id: "everyday", l: "When no free model is set up", type: "chips", opts: [["0", "Everyday work uses each feature’s own rules"], ["1", "Paid models may do everyday work too, within the limit"]] },
      { id: "prices", l: "Your prices (optional)", type: "textarea", rows: 3, max: 2000, ph: "claude-opus-5-5 4 20",
        help: "One model a line: its name, then the US$ per million input and output tokens. Only needed if your price differs from the built-in table." },
    ],
    onSubmit: async v => {
      try { return await NGGApi.admin.summer.aiRouting({ monthlyLimitUsd: v.limit.trim() || "0", paidEveryday: v.everyday === "1", prices: v.prices }); }
      catch (e) { if (/limit/.test(e.code || "")) return { fieldErrors: { limit: crErr(e, "") } }; if (/price/.test(e.code || "")) return { fieldErrors: { prices: crErr(e, "") } }; throw e; }
    },
    done: (v) => { ctx.reload(); return Number(v.limit) > 0 ? "Saved. Paid models may spend up to " + crSyUsd(v.limit) + " a month." : "Saved. Paid models are off."; },
  });
}
function CrSyAiSpend({ ctx, sp }) {
  if (!sp) return null;
  const on = sp.limitUsd > 0, pct = on ? Math.min(100, Math.round(sp.spentUsd / sp.limitUsd * 100)) : 0;
  const mon = sp.month ? new Date(sp.month + "-01T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
  return (
    <div className="cr-box cr-sy-spend">
      <div className="cr-sy-spend-head">
        <span className="cr-sy-spend-big">{crSyUsd(sp.spentUsd)}<small>{on ? " of " + crSyUsd(sp.limitUsd) + " · " + mon : " spent · " + mon}</small></span>
        <CrPill tone={!on ? "neutral" : sp.paidOpen ? "ok" : "warn"} t={!on ? "Paid models off" : sp.paidOpen ? crSyUsd(sp.leftUsd) + " left" : "Limit reached"}/>
      </div>
      {on && <span className="cr-sy-spend-bar" role="progressbar" aria-label={"Spent this month: " + pct + "% of the limit"} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><span style={{ width: pct + "%" }}/></span>}
      <p className="cr-hint" role="status" aria-live="polite">
        {!on ? "Paid models are off, so hard thinking uses free models when it can. Set a limit to let Claude or OpenAI mark written answers and write the Analyst’s reports."
          : sp.paidOpen ? "Paid models do hard thinking until the month’s spend reaches the limit." : "This month’s limit is reached: paid models wait until next month, and the free models carry on."}
        {sp.held ? " " + crPlural(sp.held, "paid call") + " held back by the limit this month." : ""}
      </p>
      {sp.byModel && sp.byModel.length > 0 && (
        <div className="cr-tscroll"><table className="cr-tbl cr-sy-spend-t">
          <thead><tr><th scope="col">Model</th><th scope="col">Kind</th><th scope="col" className="is-num">Calls</th><th scope="col" className="is-num">Tokens in / out</th><th scope="col" className="is-num">Cost</th></tr></thead>
          <tbody>{sp.byModel.map(m => (
            <tr key={m.provider + m.model}>
              <td>{m.model || m.provider}</td>
              <td>{m.tier === "paid" ? "Paid" : "Free"}</td>
              <td className="is-num">{crNum(m.calls)}{m.held ? " (" + crNum(m.held) + " held)" : ""}</td>
              <td className="is-num">{crNum(m.inTokens)} / {crNum(m.outTokens)}</td>
              <td className="is-num">{m.tier === "paid" ? crSyUsd(m.costUsd) + (m.estimated ? " est." : "") : "Free"}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <div className="cr-sy-frame-acts">
        <button type="button" className="cr-btn is-sm is-primary" onClick={() => crSyAiSpendForm(ctx, sp)}>{on ? "Change the limit" : "Set a monthly limit"}</button>
      </div>
    </div>
  );
}

function CrSyFraming({ ctx, k }) {
  const [run, setRun] = React.useState(null);
  const stop = React.useRef(false);
  React.useEffect(() => () => { stop.current = true; }, []);
  if (!k) return null;
  const on = ["framing", "second", "pool1", "pool2", "pool3", "groq"].some(id => k[id] && k[id].set);
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
        {[["pool1", "Backup A"], ["pool2", "Backup B"], ["pool3", "Backup C"], ["groq", "Groq · last resort"]].map(([id, l]) => <span key={id}><b>{l} · every AI job</b> {k[id] && k[id].set ? "set · ends " + k[id].ending : "not set"}</span>)}
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
        { type: "custom", span: 6, render: () => <CrJumpIndex
            items={(d.formMain.groups || []).filter(g => g.h).map(g => g.h).concat(["Homepage banner", "Accessibility on this device"])}
            foot={<>Attendance times, card branding and the keys for outside services each have their own tab. Centres are records, not settings: <button type="button" className="cr-link" onClick={() => ctx.go("members", "centres")}>Members → Centres</button>.</>}/> },
        Object.assign(d.formMain, { title: "Programme" }),
        d.promoErr ? { type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load the homepage banner. " + crErr(d.promoErr, ""), act: { l: "Try again", run: () => ctx.reload() } }
          : Object.assign(d.formPromo, { title: "Homepage promo banner" }),
        d.promo && d.promo.text ? { type: "note", span: 6, icon: "megaphone", text: "The banner is live: “" + d.promo.text + "”" + (d.promo.expires ? " until " + crDate(d.promo.expires) : "") + ".", act: { l: "Clear the banner", run: () => crSyPromoClear(ctx, d.promo) } }
          : { type: "note", span: 6, icon: "megaphone", text: "No homepage banner is showing. Write one above and save to put it up." },
        /* Mounted, not rebuilt: A11ySettingsPanel (components.jsx) is the one
           implementation of these per-device preferences (CLAUDE.md §11). */
        { type: "custom", span: 6, title: "Accessibility on this device", sub: "Applies to the Control Room and the public site in this browser only. Nothing is saved to your account.",
          render: () => <div className="cr-box cr-sy-a11y cr-fgroup" id={crAnchor("Accessibility on this device")} style={{ padding: "8px 20px 16px" }}><A11ySettingsPanel/></div> },
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
      const out = [];
      if (svc.pending) out.push({ type: "custom", span: 6, render: () => <CrSyKeysPending ctx={ctx} svc={svc}/> });
      if (list.length) out.push({ type: "custom", span: 6, render: () => <CrSyKeysList ctx={ctx} svc={svc}/> });
      out.push(
        ai.aiErr ? { type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t read the AI status. " + crErr(ai.aiErr, ""), act: { l: "Try again", run: () => ctx.reload() } }
          : { type: "note", span: 6, icon: "sparkle", tone: ai.anyEnabled ? "ok" : "warn",
            text: ai.anyEnabled ? "AI is on. The table shows which provider answers each feature." : "AI is off — everything still works.",
            sub: ai.anyEnabled ? "Use “Test the AI keys” to send one real request per profile: a key that is set but rejected looks exactly like a working one until you do." : "No provider key is configured, so every feature below runs on its built-in rules. Nothing is broken; it just isn’t intelligent. Add a Gemini or Groq key above to switch it on (both have free tiers)." },
        ai.aiErr ? null : { type: "custom", span: 6, title: "AI spending", sub: "Nobody picks a provider: everyday work goes to free models, hard thinking to paid ones first, within a monthly limit.",
          render: () => <CrSyAiSpend ctx={ctx} sp={ai.spend}/> },
        d.keys ? { type: "custom", span: 6, title: "Photo framing (Gemini)", sub: "Two keys: one measures every headshot so cards frame it accurately at their own shape, the other checks photos and backs it up. Existing photos are measured with “Measure existing photos”; new ones when their cards are printed.",
          render: () => <CrSyFraming ctx={ctx} k={d.keys}/> } : null,
        ai.aiErr ? null : { type: "table", span: 6, title: "AI features", nosel: true,
          cols: [{ l: "Feature", wrap: true }, "Kind of work", { l: "Status", wrap: true }, "Provider", "Test"],
          rows: rows.map(r => ({ key: r.profile, cells: [
            { k: "strong", t: r.profile, s: r.what },
            { k: "text", t: CR_SY_JOB[r.job] || "Everyday · free models" },
            r.enabled ? { k: "status", t: r.tier === "paid" ? "On · paid" : "On", tone: "ok" } : { k: "text", t: "Rules only", s: r.routeNote || r.behaviourWhenOff },
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
    title: "Change role · " + (m.fullName || m.memberId), submit: "Change role",
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
    title: "Grant staff access", submit: "Find them", busyLabel: "Finding them…",
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
          sub: (noCentre.length === 1 ? "This role works" : "These roles work") + " only for named centres. Open " + (noCentre.length === 1 ? "them" : "each") + " and choose Capabilities and centres.",
          act: { l: "Choose centres for " + (noCentre[0].fullName || noCentre[0].memberId), run: () => crSyAccessForm(ctx, d, noCentre[0]) } } : null,
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

/* ══ Mentorship automations ══════════════════════════════════════════════════
   The Mentor Portal's background jobs (domain/mentor-automations.php). Mentors
   never see this: they see the result in This week › Due now. Here the NGG
   admin tunes the numbers each job uses, the hour each scheduled job runs,
   which jobs run at which centres, and reads what each run found.

   The server decides who may change what: thresholds, hours and on/off for
   everyone need an unscoped admin; a centre-scoped admin may only switch an
   unlocked job off for their own centres; a locked job cannot be switched off
   at all. The screen mirrors that so nobody presses a control that will be
   refused — and when the server refuses anyway, it says why. */
const CR_MPA_ERR = { needs_unscoped_admin: "Only an admin who covers every centre can change that.", job_locked: "This job is locked on: it protects a child or a record.", out_of_range: "That number is outside the allowed range.", event_job_has_no_time: "This job runs when something happens, so it has no time." };
function crMpaErr(e, fb) { const c = e && (e.code || e.message); return CR_MPA_ERR[c] || crErr(e, fb); }
const CR_MPA_HOURS = Array.from({ length: 24 }, (_, h) => [String(h), ((h % 12) || 12) + ":00" + (h < 12 ? "am" : "pm")]);

/** "{overdueDays}" in a sentence → the value, editable in place when allowed. */
function CrMpaSentence({ text, d, editable, onSet }) {
  const th = Object.fromEntries((d.thresholds || []).map(t => [t.key, t]));
  const parts = String(text || "").split(/(\{[a-zA-Z]+\})/);
  return <>{parts.map((p, i) => {
    const m = p.match(/^\{([a-zA-Z]+)\}$/);
    if (!m || !th[m[1]]) return <React.Fragment key={i}>{p}</React.Fragment>;
    const t = th[m[1]];
    return editable ? <CrMpaNum key={i} t={t} onSet={onSet}/> : <b key={i} className="cr-mpa-val">{t.value}</b>;
  })}</>;
}
function CrMpaNum({ t, onSet }) {
  const [v, setV] = React.useState(String(t.value));
  React.useEffect(() => setV(String(t.value)), [t.value]);
  const commit = () => { const n = Number(v); if (String(n) === String(t.value)) return; if (!/^\d+$/.test(v.trim()) || n < t.min || n > t.max) { setV(String(t.value)); onSet(null, "Between " + t.min + " and " + t.max); return; } onSet({ [t.key]: n }); };
  return <input className="cr-mpa-num" type="number" inputMode="numeric" min={t.min} max={t.max} value={v} aria-label={t.label}
    title={t.label + " · default " + t.default} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(String(t.value)); e.currentTarget.blur(); } }}/>;
}
const CR_MPA_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One automation, as a card: When → If → Then, its switch, its last run. */
function CrMpaCard({ ctx, d, j, busy, act, run, history }) {
  const [centresOpen, setCentresOpen] = React.useState(false);
  const lr = j.lastRun; const failedLast = lr && /^failed:/.test(lr.detail || "");
  const off = (j.centresOff || []).length;
  const edit = d.canEditAll;
  const setTh = (patch, msg) => {
    if (!patch) { ctx.toast(msg, null, true); return; }
    NGGApi.admin.mentorAutomations.thresholds(patch).then(r => { ctx.setData(x => Object.assign({}, x, r)); ctx.toast("Saved. It applies from the next run."); }, e => ctx.toast(crMpaErr(e, "Couldn’t save that."), null, true));
  };
  const state = j.pausedReason ? ["Paused · screen withdrawn", "neutral"] : !j.on ? ["Paused", "neutral"] : failedLast ? ["Last run failed", "bad"] : j.locked ? ["Always on", "ok"] : ["Active", "ok"];
  const prep = (j.uses || []).indexOf("prepDay") >= 0 ? (d.thresholds || []).find(t => t.key === "prepDay") : null;
  const extra = (j.uses || []).filter(k => !new RegExp("\\{" + k + "\\}").test(j.trigger + j.if + (j.then || []).join(" ")) && k !== "prepDay");
  return <article className={"cr-mpa-card" + (j.on ? "" : " is-off")} aria-labelledby={"mpa-" + j.key}>
    <header className="cr-mpa-head">
      <span className="cr-mpa-title"><b id={"mpa-" + j.key}>{j.label}</b><CrPill tone={state[1]} t={state[0]}/>{j.shows && <span className="cr-mpa-tag">Shows in Due now</span>}</span>
      {j.pausedReason ? <span className="cr-mpa-lock" title={j.pausedReason}><CrIcon n="pause-circle"/>Paused in code</span>
        : j.locked ? <span className="cr-mpa-lock" title="Protects a child or a record, so it cannot be switched off"><CrIcon n="lock-simple"/>Locked on</span>
        : <CrSwitch on={j.on} label={(j.on ? "Pause " : "Turn on ") + j.label} disabled={!edit || busy === j.key} onChange={v => act(j.key, { on: v }, j.label + (v ? " is on" : " is paused"))}/>}
    </header>
    {j.pausedReason && <p className="cr-muted cr-mpa-why">{j.pausedReason}</p>}
    <ol className="cr-mpa-flow">
      <li><span className="cr-mpa-k"><CrIcon n={j.cron ? "clock" : "lightning"}/>When</span>
        <span className="cr-mpa-v"><CrMpaSentence text={j.trigger} d={d} editable={edit} onSet={setTh}/>
          {j.cron && (edit ? <> at <select className="cr-mpa-sel" aria-label={"Time for " + j.label} value={String(j.hour)} disabled={busy === j.key}
            onChange={e => act(j.key, { hour: +e.target.value }, j.label + " now runs at " + CR_MPA_HOURS[+e.target.value][1])}>{CR_MPA_HOURS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></>
            : " at " + CR_MPA_HOURS[j.hour][1])}
          {prep && <> (<select className="cr-mpa-sel" aria-label={prep.label} value={String(prep.value)} disabled={!edit} onChange={e => setTh({ prepDay: +e.target.value })}>{CR_MPA_DAYS.map((x, i) => <option key={x} value={i}>{x}</option>)}</select>)</>}
          {j.cron ? <em> · Lagos time</em> : null}</span></li>
      {j.if && j.if !== "—" && <li><span className="cr-mpa-k"><CrIcon n="funnel-simple"/>If</span><span className="cr-mpa-v"><CrMpaSentence text={j.if} d={d} editable={edit} onSet={setTh}/>
        {extra.map(k => { const t = d.thresholds.find(x => x.key === k); return t ? <span key={k} className="cr-mpa-also">{t.label} <CrMpaNum t={t} onSet={setTh}/></span> : null; })}</span></li>}
      <li><span className="cr-mpa-k"><CrIcon n="arrow-bend-down-right"/>Then</span><span className="cr-mpa-v cr-mpa-then">{(j.then || []).map((t, i) => <span key={i}><CrMpaSentence text={t} d={d} editable={edit} onSet={setTh}/></span>)}</span></li>
    </ol>
    <footer className="cr-mpa-foot">
      <span className="cr-mpa-run">{lr ? <><CrIcon n={failedLast ? "warning-circle" : "check-circle"}/>{"Last ran " + crDate(lr.ranAt) + " · " + (failedLast ? lr.detail.replace(/^failed:\s*/, "") : lr.detail || crPlural(+lr.found || 0, "item"))}</>
        : j.cron ? "Hasn’t run yet. It starts at its next time." : "Runs the moment it happens."}
        {j.stats && j.stats.runs ? <span className="cr-mpa-30">{" · " + crPlural(j.stats.runs, "run") + ", " + crPlural(j.stats.found, "item") + " in 30 days" + (j.stats.failed ? ", " + j.stats.failed + " failed" : "")}</span> : null}
        {off ? <span className="cr-mpa-30">{" · paused at " + crPlural(off, "centre")}</span> : null}</span>
      <span className="cr-mpa-acts">
        {!j.locked && <button type="button" className="cr-btn is-sm" aria-expanded={centresOpen} onClick={() => setCentresOpen(!centresOpen)}><CrIcon n="map-pin"/>Centres</button>}
        {j.cron && <button type="button" className="cr-btn is-sm" onClick={() => history(j)}><CrIcon n="clock-counter-clockwise"/>History</button>}
        {j.cron && edit && <button type="button" className="cr-btn is-sm" disabled={busy === j.key || !j.on} title={!j.on ? "Turn it on first" : "Run once now, outside its schedule"} onClick={() => run(j)}><CrIcon n="play"/>{busy === j.key ? "Running…" : "Run now"}</button>}
      </span>
    </footer>
    {centresOpen && <div className="cr-mpa-centres" role="group" aria-label={"Centres where " + j.label + " runs"}>
      {(d.centres || []).map(c => { const isOff = (j.centresOff || []).indexOf(c) >= 0;
        return <label key={c} className="cr-mpa-centre"><input type="checkbox" checked={!isOff} disabled={busy === j.key}
          onChange={() => act(j.key, { centresOff: isOff ? j.centresOff.filter(x => x !== c) : (j.centresOff || []).concat(c) }, j.label + (isOff ? " runs at " : " is paused at ") + c)}/>{c}</label>; })}
      {!(d.centres || []).length && <span className="cr-muted">No centres in your scope.</span>}
    </div>}
  </article>;
}

/** The automation list: summary, search, filters, grouped cards. */
function CrMpaBoard({ ctx, d }) {
  const [busy, setBusy] = React.useState("");
  const [q, setQ] = React.useState("");
  const [f, setF] = React.useState("all");
  const jobs = d.jobs || [];
  const act = async (key, patch, ok) => {
    setBusy(key);
    try { const r = await NGGApi.admin.mentorAutomations.update(key, patch); ctx.setData(x => Object.assign({}, x, r)); ctx.toast(ok); }
    catch (e) { ctx.toast(crMpaErr(e, "Couldn’t save that."), null, true); }
    finally { setBusy(""); }
  };
  const run = async j => {
    setBusy(j.key);
    try { const r = await NGGApi.admin.mentorAutomations.run(j.key); ctx.toast(j.label + " ran · " + (r.detail || crPlural(r.found || 0, "item")) + (r.notified ? " · " + crPlural(r.notified, "person") + " told" : "")); ctx.reload(); }
    catch (e) { ctx.toast(crMpaErr(e, "Couldn’t run it."), null, true); }
    finally { setBusy(""); }
  };
  const history = async j => {
    let runs = [];
    try { runs = (await NGGApi.admin.mentorAutomations.log({ days: 90, job: j.key })).runs || []; } catch (e) { ctx.toast(crErr(e, "Couldn’t load the history."), null, true); return; }
    ctx.drawer({ title: j.label, sub: j.when + " · the last 90 days",
      stats: [["Runs", String(runs.length)], ["Found", String(runs.reduce((a, r) => a + (+r.found || 0), 0))], ["Failed", String(runs.filter(r => /^failed:/.test(r.detail || "")).length)]],
      sections: [{ h: "Runs, newest first", rows: runs.length ? runs.slice(0, 60).map(r => [crDate(r.ranAt), (/^failed:/.test(r.detail || "") ? "Failed · " : crPlural(+r.found || 0, "item") + " · ") + (r.detail || "")]) : [["", "No runs in the last 90 days."]] }] });
  };
  const failedLast = j => j.lastRun && /^failed:/.test(j.lastRun.detail || "");
  const filters = [["all", "All", jobs.length], ["on", "Active", jobs.filter(j => j.on).length], ["paused", "Paused", jobs.filter(j => !j.on || (j.centresOff || []).length).length],
    ["failed", "Needs attention", jobs.filter(failedLast).length], ["scheduled", "Scheduled", jobs.filter(j => j.cron).length], ["event", "Instant", jobs.filter(j => !j.cron).length]];
  const n = q.trim().toLowerCase();
  const shown = jobs.filter(j => (f === "all" || (f === "on" ? j.on : f === "paused" ? (!j.on || (j.centresOff || []).length) : f === "failed" ? failedLast(j) : f === "scheduled" ? !!j.cron : !j.cron))
    && (!n || [j.label, j.effect, j.trigger, j.if].concat(j.then || []).join(" ").toLowerCase().indexOf(n) >= 0));
  const runs30 = jobs.reduce((a, j) => a + ((j.stats && j.stats.runs) || 0), 0), found30 = jobs.reduce((a, j) => a + ((j.stats && j.stats.found) || 0), 0);
  return <div className="cr-mpa">
    <div className="cr-mpa-kpis">
      <div><b>{jobs.filter(j => j.on).length}<em>{" of " + jobs.length}</em></b><span>Automations on</span></div>
      <div><b>{crNum(runs30)}</b><span>Runs in 30 days</span></div>
      <div><b>{crNum(found30)}</b><span>Things surfaced for mentors</span></div>
      <div className={jobs.some(failedLast) ? "is-bad" : ""}><b>{jobs.filter(failedLast).length}</b><span>Need attention</span></div>
    </div>
    <div className="cr-mpa-bar">
      <label className="cr-mpa-search" role="search"><CrIcon n="magnifying-glass"/><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search automations" aria-label="Search automations"/></label>
      <div className="cr-mpa-chips" role="group" aria-label="Filter">{filters.map(([k, l, c]) => <button key={k} type="button" className="cr-mpa-chip" aria-pressed={f === k} onClick={() => setF(k)}>{l}<em>{c}</em></button>)}</div>
      <span className="cr-muted" role="status">{crPlural(shown.length, "automation")}</span>
    </div>
    {!shown.length ? <div className="cr-box cr-mpa-empty"><b>No automation matches.</b><button type="button" className="cr-btn is-sm" onClick={() => { setQ(""); setF("all"); }}>Show all</button></div>
      : (d.categories || []).map(c => { const list = shown.filter(j => j.cat === c.key); if (!list.length) return null;
        return <section key={c.key} className="cr-mpa-group" aria-labelledby={"mpa-cat-" + c.key}>
          <h3 id={"mpa-cat-" + c.key}><CrIcon n={c.icon}/>{c.label}<em>{list.length}</em></h3>
          <div className="cr-mpa-grid">{list.map(j => <CrMpaCard key={j.key} ctx={ctx} d={d} j={j} busy={busy} act={act} run={run} history={history}/>)}</div>
        </section>; })}
  </div>;
}

Object.assign(CR_TAB_DEFS, {
  "mentor-automations": {
    skeleton: ["kpis", "cards"],
    load: async () => {
      const [l, rt] = await Promise.all([NGGApi.admin.mentorAutomations.list(), NGGApi.admin.mentorAutomations.retreats().catch(() => ({ retreats: [] }))]);
      return Object.assign({}, l, { retreats: rt.retreats || [] });
    },
    actions: (d, ctx) => [
      { l: "Schedule a retreat", icon: "calendar-plus", run: () => crMpaRetreat(ctx, null) },
    ],
    blocks: (d, ctx) => [
      { type: "note", span: 6, icon: "robot", text: "Automations do the follow-up so mentors can do the mentoring. Mentors never see these settings; they see the results in This week › Due now.",
        sub: "Nothing reaches a family or a phone between " + d.quiet.from + " and " + d.quiet.to + " (" + d.quiet.tz + "). Change a number in a sentence and it applies from the next run."
          + (d.canEditAll ? "" : " You can pause unlocked automations at your own centres; numbers and times are set by an admin who covers every centre.") },
      { type: "custom", span: 6, render: () => <CrMpaBoard ctx={ctx} d={d}/> },
      { type: "list", span: 6, title: "Quarterly retreats", sub: "Mentors book their place from My role; those not booked 30 days out are reminded.", empty: "No retreat scheduled yet. Use “Schedule a retreat”.",
        rows: (d.retreats || []).map(r => ({ icon: "tent", t: (r.title || "Retreat") + " · " + crDate(r.onDate), s: [r.place, crPlural(+r.booked || 0, "mentor") + " booked"].filter(Boolean).join(" · "), onClick: () => crMpaRetreat(ctx, r) })) },
    ],
  },
});
function crMpaRetreat(ctx, r) {
  ctx.form({ title: r ? "Edit the retreat" : "Schedule a retreat", submit: r ? "Save" : "Schedule",
    values: { retreatId: r ? r.retreatId : "", title: r ? r.title : "Quarterly retreat", onDate: r ? r.onDate : "", place: r ? r.place : "" },
    fields: [{ id: "title", l: "Name", max: 120 }, { id: "onDate", l: "Date", type: "date", req: true }, { id: "place", l: "Where", max: 160 }],
    onSubmit: async v => { await NGGApi.admin.mentorAutomations.retreatSave(v); ctx.reload(); }, done: r ? "Retreat saved." : "Retreat scheduled." });
}

/* ── Member records: the record drive (domain/profile-drive.php) ──────────────
   Off → collecting (with a deadline; locked after it) → required. Staff see
   how complete the roster is, field by field, and who is still missing what,
   and can email the families a reminder. */
const CR_REC_PHASES = [["off", "Off", "Nothing asked, nothing locked."],
  ["collect", "Collecting", "Members are asked for what is missing. After the deadline the dashboard opens on the form until the record is complete."],
  ["required", "Required", "Every save of an active member needs these fields. Use it once the records are in."]];

function CrRecDrive({ ctx, d }) {
  const dr = d.drive || {}, st = d.stats || {}, labels = d.fieldsAll || {};
  const [cfg, setCfg] = React.useState({ phase: dr.phase || "off", deadline: dr.deadline || "", fields: dr.fields || d.defaults || [], types: dr.types || ["NGG"] });
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState({});
  const pct = st.total ? Math.round(st.complete * 100 / st.total) : 0;
  const dirty = JSON.stringify(cfg) !== JSON.stringify({ phase: dr.phase || "off", deadline: dr.deadline || "", fields: dr.fields || [], types: dr.types || ["NGG"] });
  const save = async () => {
    if (cfg.phase === "required" && st.total && st.complete < st.total) {
      const ok = await ctx.confirm({ title: "Make the fields required now?", body: (st.total - st.complete) + " active members are still incomplete. They stay locked out until they complete their record, and staff can’t save an active incomplete member until the fields are filled.", cta: "Make them required" });
      if (!ok) return;
    }
    setBusy(true);
    try { await NGGApi.admin.memberRecords.set(cfg); ctx.toast("Saved. " + (cfg.phase === "off" ? "The drive is off." : cfg.phase === "collect" ? "Members are being asked." : "The fields are required.")); ctx.reload(); }
    catch (e) { ctx.toast(e.data && e.data.detail || "Couldn’t save that.", null, true); }
    finally { setBusy(false); }
  };
  const list = (d.incomplete || []).filter(m => !q || (m.fullName + " " + m.displayId + " " + m.centre).toLowerCase().includes(q.toLowerCase()));
  const picked = Object.keys(sel).filter(k => sel[k]);
  const remind = async ids => {
    const ok = await ctx.confirm({ title: "Email " + ids.length + (ids.length === 1 ? " family" : " families") + "?", body: "Each gets the list of what is missing" + (dr.deadline ? " and the deadline" : "") + ", with a link to the dashboard.", cta: "Send " + ids.length });
    if (!ok) return;
    const r = await NGGApi.admin.memberRecords.remind(ids);
    const bad = (r.results || []).filter(x => !x.ok);
    ctx.toast("Sent " + r.sent + (bad.length ? " · " + bad.length + " not sent (" + [...new Set(bad.map(x => x.error.replace(/_/g, " ")))].join(", ") + ")" : ""));
    setSel({});
  };
  return (
    <div className="cr-rec">
      <div className="cr-rec-kpis">
        <div><b>{st.total || 0}</b><span>active members asked</span></div>
        <div><b>{st.complete || 0}</b><span>complete</span></div>
        <div><b>{pct}%</b><span>of the roster</span></div>
        <div><b>{dr.deadline ? crDate(dr.deadline) : "—"}</b><span>{dr.locked ? "deadline passed · locked" : "deadline"}</span></div>
      </div>
      <section className="cr-rec-card">
        <h3>The drive</h3>
        <div role="radiogroup" aria-label="Phase" className="cr-rec-phases">
          {CR_REC_PHASES.map(([k, l, s]) => (
            <button key={k} type="button" role="radio" aria-checked={cfg.phase === k} className={"cr-rec-phase" + (cfg.phase === k ? " is-on" : "")} onClick={() => setCfg(c => Object.assign({}, c, { phase: k }))}>
              <b>{l}</b><span>{s}</span>
            </button>
          ))}
        </div>
        <label className="cr-rec-row"><span>Deadline</span>
          <input type="date" value={cfg.deadline} onChange={e => setCfg(c => Object.assign({}, c, { deadline: e.target.value }))} aria-label="Deadline"/>
          <em>{cfg.phase === "collect" ? "Required while collecting." : "Kept for the record."}</em></label>
        <fieldset className="cr-rec-fields"><legend>Fields a complete record needs</legend>
          {Object.keys(labels).map(k => (
            <label key={k}><input type="checkbox" checked={cfg.fields.includes(k)} onChange={e => setCfg(c => Object.assign({}, c, { fields: e.target.checked ? c.fields.concat([k]) : c.fields.filter(x => x !== k) }))}/>
              {labels[k]}{st.byField && st.byField[k] != null ? <em>{st.byField[k]} missing</em> : null}</label>
          ))}
        </fieldset>
        <fieldset className="cr-rec-fields"><legend>Who is asked</legend>
          {["NGG", "Summer"].map(t => <label key={t}><input type="checkbox" checked={cfg.types.includes(t)} onChange={e => setCfg(c => Object.assign({}, c, { types: e.target.checked ? c.types.concat([t]) : c.types.filter(x => x !== t) }))}/>{t === "NGG" ? "NGG members" : "Summer School accounts"}</label>)}
          <p className="cr-rec-help">Only ACTIVE members are asked. Suspended, inactive and graduated members are never asked, locked or refused on save.</p>
        </fieldset>
        <div className="cr-rec-actions"><button type="button" className="cr-btn is-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save the drive"}</button></div>
      </section>
      <section className="cr-rec-card">
        <div className="cr-rec-listh">
          <h3>Still incomplete <span>{(d.incomplete || []).length}</span></h3>
          <div className="cr-searchbox" role="search"><i className="ph ph-magnifying-glass" aria-hidden="true"/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, ID or centre" aria-label="Find a member"/></div>
          <button type="button" className="cr-btn" disabled={!picked.length} onClick={() => remind(picked)}>Email {picked.length || ""} reminder{picked.length === 1 ? "" : "s"}</button>
          <button type="button" className="cr-btn" disabled={!list.length} onClick={() => crDownloadCsv("incomplete-records", ["memberId", "printedId", "name", "centre", "missing"], list.map(m => [m.memberId, m.displayId, m.fullName, m.centre, m.missing.map(k => labels[k] || k).join("; ")]))}>Export</button>
        </div>
        <span className="cr-sr" role="status" aria-live="polite">{list.length} shown, {picked.length} selected</span>
        {!list.length ? <p className="cr-rec-empty">{(d.incomplete || []).length ? "Nobody matches." : "Every active member’s record is complete."}</p> : (
          <table className="cr-rec-table">
            <thead><tr><th scope="col"><input type="checkbox" aria-label="Select all shown" checked={list.length > 0 && list.every(m => sel[m.memberId])} onChange={e => setSel(e.target.checked ? Object.fromEntries(list.map(m => [m.memberId, true])) : {})}/></th>
              <th scope="col">Member</th><th scope="col">Centre</th><th scope="col">Missing</th></tr></thead>
            <tbody>{list.slice(0, 300).map(m => (
              <tr key={m.memberId}>
                <td><input type="checkbox" aria-label={"Select " + m.fullName} checked={!!sel[m.memberId]} onChange={e => setSel(x => Object.assign({}, x, { [m.memberId]: e.target.checked }))}/></td>
                <td><b>{m.fullName || m.memberId}</b><em>{m.displayId || m.memberId}{m.contact ? "" : " · no email on file"}</em></td>
                <td>{m.centre || "—"}</td>
                <td>{m.missing.map(k => labels[k] || k).join(", ")}</td>
              </tr>))}</tbody>
          </table>)}
      </section>
    </div>
  );
}

Object.assign(CR_TAB_DEFS, {
  "member-records": {
    skeleton: ["kpis", "cards"],
    load: () => NGGApi.admin.memberRecords.get(),
    blocks: (d, ctx) => [
      { type: "note", span: 6, icon: "clipboard-text", text: "Make every member’s record complete in three steps: collect with a deadline, then make the fields required.",
        sub: "Collecting asks active members on their dashboard. After the deadline their dashboard opens on the form until it is done; nothing else breaks. Suspended or departed members are left as they are. The join date is not on the member’s form: staff correct it with a reason from the member’s record." },
      { type: "custom", span: 6, render: () => <CrRecDrive ctx={ctx} d={d}/> },
    ],
  },
});
