/* ============================================================================
   Control Room v2 — the programme tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).

   PROGRESS (a resumed run picks up here):
     checkin     Desks        — done, verified in the lab (open/schedule/validity/rotate/revoke/delete)
     attendance  Duty rota    — done, verified in the lab (override, close roll, day in URL)
     summer      Edition      — done, verified (AdminSummer mounted; /control/summer/summer/roster opens the roster panel)
     assessment  Assessments  — done, verified (adopt, new instrument, sittings, register, results, edit locked, new version, close sitting)
     events      Events       — in progress
     tournaments Tournaments  — not started

   Desks: the check-in DESK links only (kind `desk`, cap `checkin`). Summer
   School's sign-up, review and registration-desk links live in its own portal
   (Sign-up links), because who owns a link follows what it is for
   (GATE_KINDS in domain/registration.php). A generated password exists in the
   clear exactly once — in the create/rotate response — so it is shown in a
   drawer until dismissed and never again.
   ========================================================================== */

/* ── Shared ─────────────────────────────────────────────────────────────── */
function crPgCopy(ctx, text, what) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => ctx.toast(what + " copied."), () => ctx.toast("Couldn’t copy. Select it and copy by hand: " + text, null, true)); return; }
  } catch (_) { /* fall through */ }
  ctx.toast("Couldn’t copy. Select it and copy by hand: " + text, null, true);
}
const crPgDay = () => new Date().toISOString().slice(0, 10);

/* ── Desks ──────────────────────────────────────────────────────────────── */
const CR_PG_VALID = [["0", "No expiry"], ["1", "Today only"], ["7", "1 week"], ["30", "30 days"], ["90", "90 days"]];
const CR_PG_ROTATE = [["0", "Never"], ["7", "Every week"], ["30", "Every 30 days"], ["90", "Every 90 days"]];
const CR_PG_PWEXP = [["0", "Never"], ["7", "After 7 days"], ["30", "After 30 days"], ["90", "After 90 days"]];
const CR_PG_DESK_ERR = {
  weak_password: "Use at least 4 characters for the desk password.",
  bad_email: "That email address isn’t valid.",
  bad_expiry: "Couldn’t read that as a number of days or a date.",
  not_revoked: "Revoke the desk before deleting it.",
  not_active: "This desk is no longer active.",
  out_of_scope: "Choose one of your centres for this desk.",
};
function crPgDeskErr(e, fb) { const c = e && ((e.data && e.data.error) || e.code); return CR_PG_DESK_ERR[c] || crErr(e, fb); }
/* A choice list that always contains the stored value, so opening a form cannot silently change it. */
function crPgWith(opts, v, label) { return opts.some(o => o[0] === String(v)) ? opts : opts.concat([[String(v), label(v)]]); }

const crPgDeskLink = g => location.origin + (g.path || "/gate?g=") + g.gateId;
function crPgDeskValid(g) {
  if (!g.expiresAt) return ["No expiry", "neutral"];
  if (g.expired) return ["Expired", "bad"];
  return [g.expiresInDays <= 1 ? "Ends today" : "Ends in " + crPlural(g.expiresInDays, "day"), g.expiresInDays <= 3 ? "warn" : "neutral"];
}
function crPgDeskPw(g) {
  if (!g.hasPassword) return ["Admin sign-in only", "neutral"];
  if (g.passExpired) return ["Password expired — desk locked", "bad"];
  if (g.expiryDays) return ["Password ends in " + crPlural(g.passExpiresInDays, "day"), g.passExpiresInDays <= 3 ? "warn" : "ok"];
  return ["Has a password", "ok"];
}
function crPgDeskRot(g) {
  if (!g.hasPassword) return "—";
  if (!g.rotateDays) return "By hand";
  if (g.rotationDue) return g.notifyEmail ? "Due — rolls tonight" : "Due — rotate it by hand";
  return "Every " + crPlural(g.rotateDays, "day") + " · next in " + crPlural(g.rotatesInDays, "day");
}
function crPgDeskStatus(g) {
  if (g.status !== "active") return [g.status === "revoked" ? "Revoked" : g.status, "neutral"];
  if (g.expired) return ["Expired", "bad"];
  if (g.passExpired) return ["Locked", "bad"];
  if (g.rotationDue && !g.notifyEmail) return ["Rotation due", "warn"];
  return ["Active", "ok"];
}
function crPgCentreName(d, id) { if (!id) return "Every centre"; const c = (d.centres || []).find(x => x.centreId === id); return c ? c.name : id; }

/** The one time a password is visible. */
function crPgReveal(ctx, name, password, url) {
  ctx.drawer({
    title: "Desk password for " + name, name,
    sub: "Copy it now. Only its hash is stored, so this is the only time it can be shown.",
    fields: [["Password", password], url ? ["Desk link", url] : null].filter(Boolean),
    actions: [
      { l: "Copy password", primary: true, run: () => crPgCopy(ctx, password, "Password") },
      url ? { l: "Copy link", run: () => crPgCopy(ctx, url, "Link") } : null,
      { l: "Done", run: () => ctx.closeDrawer() },
    ],
  });
}

function crPgDeskOpenForm(ctx) {
  const d = ctx.data || {};
  const centres = (d.centres || []).filter(c => c.status !== "retired");
  const scoped = !!(ctx.me && ctx.me.scoped);
  ctx.form({
    title: "Open a check-in desk", submit: "Open the desk", busyLabel: "Opening…",
    intro: "The door. Volunteers scan cards to check in participants, volunteers and NGG members. A desk password lets them run it without an admin sign-in. It takes no sign-ups — Summer School’s registration desk and public sign-up links do that.",
    values: { name: "", centreId: centres.length === 1 || scoped ? (centres[0] || {}).centreId || "" : "", pwMode: "generate", password: "", validDays: "0", expiryDays: "0", rotateDays: "30", notifyEmail: "" },
    fields: [
      { id: "name", l: "Label", ph: "Egbeda desk · Saturday", max: 160, help: "Blank: “Check-in desk”." },
      { id: "centreId", l: "Centre", type: "select", req: scoped, ph: "Every centre", opts: centres.map(c => [c.centreId, c.name]), help: scoped ? "You can open desks for your own centres." : "A desk for every centre opens doors at all of them." },
      { id: "pwMode", l: "Desk password", type: "chips", req: true, opts: [["generate", "Generate one"], ["type", "Type one"], ["none", "None — admin sign-in only"]] },
      { id: "password", l: "Password", req: true, ac: "off", when: v => v.pwMode === "type", check: v => String(v).trim().length < 4 ? "Use at least 4 characters." : "" },
      { id: "validDays", l: "Link works for", type: "select", req: true, opts: CR_PG_VALID, help: "Enforced on the desk itself, not just hidden here." },
      { id: "expiryDays", l: "Password stops working", type: "select", req: true, opts: CR_PG_PWEXP, when: v => v.pwMode !== "none", help: "Fails closed: past its date the desk will not open until someone issues a new password." },
      { id: "rotateDays", l: "Rotate the password", type: "select", req: true, opts: CR_PG_ROTATE, when: v => v.pwMode !== "none", help: "The new password is emailed on the day it rolls." },
      { id: "notifyEmail", l: "Email for the new password", type: "email", email: true, when: v => v.pwMode !== "none" && v.rotateDays !== "0", help: "Without an address the desk is flagged due instead of rotating, so nobody is locked out mid-session." },
    ],
    onSubmit: async v => {
      const label = String(v.name || "").trim() || "Check-in desk";
      const withPw = v.pwMode !== "none";
      const r = await NGGApi.admin.registration.gateCreate(label, "", v.pwMode === "type" ? String(v.password).trim() : "", v.centreId || "", {
        kind: "desk", generate: v.pwMode === "generate", validDays: Number(v.validDays) || 0,
        rotateDays: withPw ? Number(v.rotateDays) || 0 : 0, expiryDays: withPw ? Number(v.expiryDays) || 0 : 0,
        notifyEmail: withPw && v.rotateDays !== "0" ? String(v.notifyEmail || "").trim() : "",
      }).catch(e => { throw Object.assign(e, { data: Object.assign({}, e.data || {}, { message: crPgDeskErr(e, "Couldn’t open the desk.") }) }); });
      ctx.reload();
      return Object.assign({ label }, r);
    },
    done: (v, r) => {
      if (r && r.password) { setTimeout(() => crPgReveal(ctx, r.label, r.password, r.url || (location.origin + "/gate?g=" + r.gateId)), 0); return "Desk opened · " + r.label; }
      return "Desk opened · " + (r && r.label) + ". Copy its link from the list.";
    },
  });
}

async function crPgDeskAct(ctx, fn, ok, fb) {
  try { const r = await fn(); if (ok) ctx.toast(typeof ok === "function" ? ok(r) : ok); ctx.reload(); return r; }
  catch (e) { ctx.toast(crPgDeskErr(e, fb), null, true); return null; }
}

function crPgDeskPassword(ctx, g) {
  ctx.form({
    title: (g.hasPassword ? "Change the password · " : "Set a password · ") + g.name, submit: "Save", busyLabel: "Saving…",
    intro: "Field staff open this desk with the password — no admin sign-in needed. The current password stops working as soon as you save.",
    values: { mode: "generate", password: "" },
    fields: [
      { id: "mode", l: "Password", type: "chips", req: true, opts: [["generate", "Generate one"], ["type", "Type one"]].concat(g.hasPassword ? [["remove", "Remove it"]] : []) },
      { id: "password", l: "New password", req: true, ac: "off", when: v => v.mode === "type", check: v => String(v).trim().length < 4 ? "Use at least 4 characters." : "" },
    ],
    onSubmit: async v => {
      try { return await NGGApi.admin.registration.gateSetpass(g.gateId, v.mode === "type" ? String(v.password).trim() : "", v.mode === "generate"); }
      catch (e) { throw Object.assign(e, { data: Object.assign({}, e.data || {}, { message: crPgDeskErr(e, "Couldn’t save the password.") }) }); }
      finally { ctx.reload(); }
    },
    done: (v, r) => {
      if (r && r.password) { setTimeout(() => crPgReveal(ctx, g.name, r.password, crPgDeskLink(g)), 0); return "New password made."; }
      return r && r.hasPassword ? "Desk password set." : "Desk password removed. Only a signed-in admin can open it now.";
    },
  });
}

async function crPgDeskRotate(ctx, g) {
  const ok = await ctx.confirm({ title: "Roll this desk password?", cta: "Rotate",
    body: "A new password is made now and the current one stops working immediately. Anyone at the desk will need the new one." });
  if (!ok) return;
  const r = await crPgDeskAct(ctx, () => NGGApi.admin.registration.gateRotate(g.gateId), null, "Couldn’t rotate the password.");
  if (r && r.password) crPgReveal(ctx, g.name, r.password, crPgDeskLink(g));
}

function crPgDeskValidity(ctx, g) {
  const cur = g.expiresAt ? String(g.expiresAt).slice(0, 10) : "";
  ctx.form({
    title: "How long should this desk work?", submit: "Save", busyLabel: "Saving…",
    intro: "Expiry is enforced on the desk itself. Past it, the desk does not open.",
    values: { mode: cur ? "date" : "0", date: cur },
    fields: [
      { id: "mode", l: "Works for", type: "select", req: true, opts: CR_PG_VALID.concat([["date", "Until a date"]]), help: "Days count from now." },
      { id: "date", l: "Last day", type: "date", req: true, when: v => v.mode === "date", help: "It stops at the end of this day." },
    ],
    onSubmit: async v => {
      try { return await NGGApi.admin.registration.gateValidity(g.gateId, v.mode === "date" ? { expiresAt: v.date } : { validDays: Number(v.mode) || 0 }); }
      catch (e) { if ((e.data && e.data.error) === "bad_expiry" || e.code === "bad_expiry") return { fieldErrors: { date: CR_PG_DESK_ERR.bad_expiry } }; throw e; }
      finally { ctx.reload(); }
    },
    done: (v, r) => r && r.expiresAt ? "Works until " + crDate(r.expiresAt) + "." : "Expiry removed.",
  });
}

function crPgDeskSchedule(ctx, g) {
  ctx.form({
    title: "Password policy · " + g.name, submit: "Save", busyLabel: "Saving…",
    intro: "Rotation rolls the password on a schedule and emails the new one. Expiry is the opposite policy and fails closed: past its date the desk stays locked until an admin issues a new password. Set both and expiry is the backstop for a rotation that silently did not run. Setting expiry counts from when the password was last set.",
    values: { rotateDays: String(g.rotateDays || 0), notifyEmail: g.notifyEmail || "", expiryDays: String(g.expiryDays || 0) },
    fields: [
      { id: "rotateDays", l: "Rotate", type: "select", req: true, opts: crPgWith(CR_PG_ROTATE, g.rotateDays || 0, n => "Every " + n + " days") },
      { id: "notifyEmail", l: "Email for the new password", type: "email", email: true, when: v => v.rotateDays !== "0", help: "Without an address the desk is flagged due instead of rotating, so it is never rolled behind your back." },
      { id: "expiryDays", l: "Password stops working", type: "select", req: true, opts: crPgWith(CR_PG_PWEXP, g.expiryDays || 0, n => "After " + n + " days") },
    ],
    onSubmit: async v => {
      try { return await NGGApi.admin.registration.gateRotation(g.gateId, Number(v.rotateDays) || 0, v.rotateDays !== "0" ? String(v.notifyEmail || "").trim() : "", Number(v.expiryDays) || 0); }
      catch (e) { if ((e.data && e.data.error) === "bad_email" || e.code === "bad_email") return { fieldErrors: { notifyEmail: CR_PG_DESK_ERR.bad_email } }; throw e; }
      finally { ctx.reload(); }
    },
    done: "Password policy saved.",
  });
}

async function crPgDeskRevoke(ctx, g) {
  const ok = await ctx.confirm({ title: "Revoke " + g.name + "?", danger: true, cta: "Revoke",
    body: "The desk stops opening straight away and its password stops working. A revoked desk can’t be brought back — open a new one instead." });
  if (!ok) return;
  ctx.closeDrawer();
  crPgDeskAct(ctx, () => NGGApi.admin.registration.gateRevoke(g.gateId), "Revoked · " + g.name, "Couldn’t revoke the desk.");
}
async function crPgDeskDelete(ctx, g) {
  const ok = await ctx.confirm({ title: "Delete " + g.name + "?", danger: true, cta: "Delete",
    body: "The revoked desk and its row here are removed for good. The audit log keeps the record that it existed. This can’t be undone." });
  if (!ok) return;
  ctx.closeDrawer();
  crPgDeskAct(ctx, () => NGGApi.admin.registration.gateDelete(g.gateId), "Deleted · " + g.name, "Couldn’t delete the desk.");
}

function crPgDeskOpen(ctx, g) {
  const d = ctx.data || {};
  const live = g.status === "active";
  const link = crPgDeskLink(g);
  const st = crPgDeskStatus(g), pw = crPgDeskPw(g), va = crPgDeskValid(g);
  ctx.drawer({
    title: g.name, name: g.name, sub: [crPgCentreName(d, g.centreId), st[0]].join(" · "),
    stats: [["Used", crNum(g.usedCount)], ["Link", va[0]], ["Password", g.hasPassword ? (g.passExpired ? "Expired" : "Yes") : "No"]],
    fields: [["Desk link", (g.path || "/gate?g=") + g.gateId], ["Centre", crPgCentreName(d, g.centreId)], ["Opened", crDate(g.createdAt, true)],
      ["Link works", va[0]], ["Password", pw[0]], ["Rotation", crPgDeskRot(g)], g.rotateDays ? ["New passwords go to", g.notifyEmail || "Nobody — rotation is flagged, not run"] : null].filter(Boolean),
    sections: [
      g.rotationDue && !g.notifyEmail && live ? { h: "Rotation is due", text: "This desk has no email for its new password, so it is not rolled automatically. Rotate it by hand, or add an email under Schedule." } : null,
      g.passExpired && live ? { h: "The desk is locked", text: "Its password has expired. Set or generate a new one to open it again." } : null,
    ],
    actions: live ? [
      { l: "Copy link", primary: true, run: () => crPgCopy(ctx, link, "Link") },
      { l: "Open the desk", run: () => window.open(link, "_blank", "noopener") },
      { l: g.hasPassword ? "Change password" : "Set a password", run: () => crPgDeskPassword(ctx, g) },
      g.hasPassword ? { l: "Rotate now", run: () => crPgDeskRotate(ctx, g) } : null,
      { l: "Validity", run: () => crPgDeskValidity(ctx, g) },
      g.hasPassword ? { l: "Schedule", run: () => crPgDeskSchedule(ctx, g) } : null,
      { l: "Revoke", run: () => crPgDeskRevoke(ctx, g) },
    ] : g.status === "revoked" ? [{ l: "Delete", run: () => crPgDeskDelete(ctx, g) }] : [],
  });
}

Object.assign(CR_TAB_DEFS, {
  checkin: {
    skeleton: ["kpis", "table"],
    load: async () => {
      const [gs, cs] = await Promise.all([
        NGGApi.admin.registration.gates("checkin"),
        NGGApi.admin.registration.centres().catch(() => ({ centres: [] })),
      ]);
      return { gates: (gs.gates || []).filter(g => (g.kind || "desk") === "desk"), centres: cs.centres || [] };
    },
    actions: (d, ctx) => ctx.can("checkin") ? [{ l: "Open a desk", icon: "qr-code", primary: true, run: () => crPgDeskOpenForm(ctx) }] : [],
    facts: d => {
      const live = d.gates.filter(g => g.status === "active" && !g.expired);
      return crPlural(live.length, "live check-in desk") + "; " + crNum(d.gates.filter(g => g.status === "active" && (g.passExpired || g.expired)).length) + " locked or expired; " + crNum(d.gates.filter(g => g.rotationDue && !g.notifyEmail && g.status === "active").length) + " due a manual password rotation.";
    },
    blocks: (d, ctx) => {
      const active = d.gates.filter(g => g.status === "active");
      const live = active.filter(g => !g.expired && !g.passExpired);
      const locked = active.filter(g => g.expired || g.passExpired);
      const due = active.filter(g => g.rotationDue && !g.notifyEmail);
      const out = [
        { type: "kpis", span: 6, items: [
          { l: "Live desks", v: crNum(live.length), tone: "flat" },
          { l: "With a desk password", v: crNum(live.filter(g => g.hasPassword).length), tone: "flat" },
          { l: "Locked or expired", v: crNum(locked.length), tone: locked.length ? "down" : "flat" },
          { l: "Scans through all desks", v: crNum(d.gates.reduce((n, g) => n + (Number(g.usedCount) || 0), 0)), tone: "flat" },
        ] },
      ];
      if (due.length || locked.length) out.push({ type: "attention", span: 6, title: "Needs you", rows: [
        { n: due.length, l: "Desk passwords due to rotate by hand", s: "No email is set, so they are flagged instead of rolled", tone: "warn", age: 2, onClick: () => crPgDeskOpen(ctx, due[0]) },
        { n: locked.length, l: "Desks locked or expired", s: "They will not open until fixed", tone: "bad", age: 1, onClick: () => crPgDeskOpen(ctx, locked[0]) },
      ] });
      out.push({
        type: "table", span: 6, title: "Check-in desks", sub: "The newest 50. Summer School sign-up and review links are in the Summer School portal.",
        action: ctx.can("summer") ? "Sign-up links" : null, onAction: () => ctx.portal("summer-admin", "gates"),
        cols: ["Desk", "Centre", "Password", "Link works", "Rotation", { l: "Used", num: true }, "Status"],
        rows: d.gates.map(g => {
          const st = crPgDeskStatus(g), pw = crPgDeskPw(g), va = crPgDeskValid(g);
          return { key: g.gateId, open: () => crPgDeskOpen(ctx, g), cells: [
            { k: "strong", t: g.name, s: (g.path || "/gate?g=") + g.gateId },
            { k: "text", t: crPgCentreName(d, g.centreId) },
            { k: "status", t: pw[0], tone: pw[1] },
            { k: "text", t: va[0] },
            { k: "text", t: crPgDeskRot(g), s: g.notifyEmail ? "→ " + g.notifyEmail : "" },
            { k: "num", t: crNum(g.usedCount), v: Number(g.usedCount) || 0 },
            { k: "status", t: st[0], tone: st[1] },
          ] };
        }),
        search: "Search desks", filters: ["Centre", "Status"], nosel: true,
        emptyText: "No check-in desks yet. Open one and hand its link and password to the volunteers on the door.",
      });
      return out;
    },
  },
});

/* ── Duty rota ──────────────────────────────────────────────────────────────
   One safeguarding-cleared volunteer per centre takes the roll each day,
   auto-rotated across the pool; any pick can be overridden. Closing the roll
   finalises the day for that centre and awards the duty volunteer their service
   points — it cannot be reopened here, so it asks first. The day is in the URL
   (/control/checkin/attendance/<YYYY-MM-DD>), so a link to a day survives a
   refresh. The loader is created once per tab mount (its ctx is stale after),
   so the day is read from the address itself, which setSub keeps current. */
function crPgDutyDate() { const s = crUrlParts()[2] || ""; return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : crPgDay(); }
const CR_PG_DUTY_SRC = { auto: ["Rotation", "neutral"], admin: ["Picked by staff", "gold"] };
const CR_PG_DUTY_ERR = { not_cleared: "That volunteer hasn’t passed safeguarding screening, so they can’t run a roll.", not_active_volunteer: "That volunteer isn’t active.", already_completed: "This roll is already closed." };
function crPgDutyErr(e, fb) { const c = e && ((e.data && e.data.error) || e.code); return CR_PG_DUTY_ERR[c] || crErr(e, fb); }
function crPgDutyGo(ctx, date) {
  ctx.setSub(date === crPgDay() ? "" : date);
  ctx.reload();
}
function crPgShiftDay(date, n) { const t = new Date(date + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

function crPgDutyPick(ctx, d) {
  const data = ctx.data || {};
  const vols = data.volunteers || [];
  ctx.form({
    title: "Who takes the roll at " + d.centre + "?", submit: "Put them on duty", busyLabel: "Saving…",
    intro: "For " + crDate(data.date) + ". Only active volunteers who have passed safeguarding screening can run a roll around children.",
    values: { volunteerId: d.volunteerId || "" },
    fields: [{ id: "volunteerId", l: "Volunteer", type: "select", req: true, opts: vols.map(v => [v.volunteerId, v.fullName + " · " + (v.role || "volunteer")]) }],
    onSubmit: async v => {
      if (v.volunteerId === d.volunteerId) return { same: true };
      try { const r = await NGGApi.admin.attendance.set(data.date, d.centre, v.volunteerId); ctx.setData(x => Object.assign({}, x, { duties: r.duties || x.duties })); return r; }
      catch (e) { throw Object.assign(e, { data: Object.assign({}, e.data || {}, { message: crPgDutyErr(e, "Couldn’t change the duty.") }) }); }
    },
    done: (v, r) => r && r.same ? "Nothing changed." : "On duty at " + d.centre + " · " + ((vols.find(x => x.volunteerId === v.volunteerId) || {}).fullName || ""),
  });
}

async function crPgDutyClose(ctx, d) {
  const data = ctx.data || {};
  const who = d.volunteer ? d.volunteer.fullName : "the duty volunteer";
  const ok = await ctx.confirm({ title: "Close the roll for " + d.centre + "?", cta: "Close roll",
    body: "This finalises " + crDate(data.date) + "’s attendance for " + d.centre + " and awards " + who + " their service points. It can’t be reopened here." });
  if (!ok) return;
  ctx.closeDrawer();
  try { const r = await NGGApi.admin.attendance.complete(data.date, d.centre, d.volunteerId); ctx.toast(r.message || "Roll closed · " + d.centre); ctx.reload(); }
  catch (e) { ctx.toast(crPgDutyErr(e, "Couldn’t close the roll."), null, true); }
}

function crPgDutyOpen(ctx, d) {
  const data = ctx.data || {};
  const src = CR_PG_DUTY_SRC[d.source] || [d.source || "—", "neutral"];
  const closed = !!d.completedAt;
  ctx.drawer({
    title: d.centre, name: d.centre, sub: crDate(data.date) + " · " + (closed ? "Roll closed" : "Roll open"),
    stats: [["On duty", d.volunteer ? d.volunteer.fullName : "Nobody"], ["Picked by", src[0]], ["Present", closed ? crNum(d.takenCount) : "—"]],
    fields: [["Volunteer", d.volunteer ? d.volunteer.fullName : "—"], ["Role", d.volunteer ? d.volunteer.role : ""], ["Roll", closed ? "Closed " + crDate(d.completedAt, true) : "Open"]],
    actions: closed ? [] : [
      { l: "Close roll", primary: true, run: () => crPgDutyClose(ctx, d), disabled: !d.volunteerId, why: d.volunteerId ? undefined : "Put somebody on duty first." },
      { l: "Change who is on duty", run: () => crPgDutyPick(ctx, d), disabled: !(data.volunteers || []).length, why: (data.volunteers || []).length ? undefined : "No volunteer has passed safeguarding screening yet." },
    ],
  });
}

Object.assign(CR_TAB_DEFS, {
  attendance: {
    skeleton: ["table", "table"],
    load: async () => {
      const date = crPgDutyDate();
      const [a, b] = await Promise.all([
        NGGApi.admin.attendance.admin(date),
        NGGApi.admin.attendance.leaderboard().then(r => ({ rows: r.leaderboard || [] }), e => ({ rows: [], error: e })),
      ]);
      return { date: a.date || date, duties: a.duties || [], volunteers: a.volunteers || [], pool: a.pool || 0, board: b.rows, boardError: b.error || null };
    },
    actions: (d, ctx) => [
      { l: "Pick a day", icon: "calendar-blank", primary: true, run: () => ctx.form({
        title: "Which day’s rota?", submit: "Show the rota", values: { date: d.date },
        fields: [{ id: "date", l: "Day", type: "date", req: true }],
        onSubmit: async v => { crPgDutyGo(ctx, v.date); }, done: null,
      }) },
      { l: "Previous day", icon: "caret-left", run: () => crPgDutyGo(ctx, crPgShiftDay(d.date, -1)) },
      { l: "Next day", icon: "caret-right", run: () => crPgDutyGo(ctx, crPgShiftDay(d.date, 1)) },
      d.date !== crPgDay() ? { l: "Today", icon: "calendar-check", run: () => crPgDutyGo(ctx, crPgDay()) } : null,
    ],
    facts: d => "Duty rota for " + d.date + ": " + d.duties.map(x => x.centre + " — " + (x.volunteer ? x.volunteer.fullName : "nobody") + (x.completedAt ? " (closed, " + x.takenCount + " present)" : " (open)")).join("; ") + ". " + d.pool + " volunteers in rotation.",
    blocks: (d, ctx) => {
      const closed = d.duties.filter(x => x.completedAt).length;
      const out = [
        { type: "note", span: 6, icon: "calendar-blank", tone: d.pool ? undefined : "warn",
          text: (d.date === crPgDay() ? "Today, " : "") + crDate(d.date) + " · " + crPlural(d.pool, "volunteer") + " in rotation · " + crNum(closed) + " of " + crPlural(d.duties.length, "roll") + " closed",
          sub: "One volunteer per centre takes the roll each day, rotated across active, safeguarding-cleared volunteers. Override any pick. Closing the roll awards points towards levels and awards, emailed and shown on the volunteer’s digital ID." },
        { type: "table", span: 6, title: "Who takes the roll", nosel: true,
          cols: ["Centre", "On duty", "Picked by", "Roll"],
          rows: d.duties.map(x => {
            const src = CR_PG_DUTY_SRC[x.source] || [x.source || "—", "neutral"];
            return { key: x.centre, open: () => crPgDutyOpen(ctx, x), cells: [
              { k: "strong", t: x.centre },
              x.volunteer ? { k: "person", t: x.volunteer.fullName, s: x.volunteer.role || "", photo: /^https?:\/\//.test(x.volunteer.photoUrl || "") ? x.volunteer.photoUrl : "" } : { k: "text", t: "Nobody" },
              { k: "status", t: src[0], tone: src[1] },
              x.completedAt ? { k: "status", t: "Closed · " + crNum(x.takenCount) + " present", tone: "ok" } : { k: "status", t: "Open", tone: "neutral" },
            ] };
          }),
          emptyText: d.pool ? "No centres in rotation yet. Enrol Summer School participants at a centre to start the daily rotation." : "Nobody is in rotation yet. Register volunteers and clear their safeguarding screening to start the daily rotation." },
      ];
      out.push(d.boardError ? { type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "The service leaderboard didn’t load.", sub: crErr(d.boardError), act: { l: "Try again", run: () => ctx.reload() } } : {
        type: "table", span: 6, title: "Service leaderboard", sub: "Volunteers ranked by duty service points — recognise your most reliable stewards.", nosel: true,
        cols: [{ l: "#", num: true }, "Volunteer", "Level", { l: "Streak", num: true }, { l: "Points", num: true }],
        rows: d.board.map(v => ({ key: v.volunteerId, cells: [
          { k: "num", t: crNum(v.rank), v: v.rank },
          { k: "strong", t: v.fullName, s: v.role || "" },
          { k: "text", t: "Level " + v.level + " · " + (v.levelName || "") },
          { k: "num", t: crPlural(v.streak || 0, "day"), v: v.streak || 0 },
          { k: "num", t: crNum(v.points), v: v.points || 0 },
        ] })),
        sortInit: null, emptyText: "No points logged yet. They arrive when a duty volunteer is assigned and closes a roll.",
      });
      return out;
    },
  },
});

/* ── Edition ────────────────────────────────────────────────────────────────
   v1 mounted AdminSummer (page-portals.jsx) whole; it still exists and still
   serves the Summer School portal, so it is mounted here, not rebuilt — one
   workspace, never two (CLAUDE.md §7, §11). That is why this is a `custom`
   block: fifteen panels (editions, groups, intake, roster, kiosk, cards…) are a
   workspace of their own, not a block.
   A deep link names a PANEL: /control/summer/summer/roster, or
   window.__adminSection("summer", "roster"), which resolves to that sub. The
   panel travels through the existing pending-tab store that AdminSummer's
   useAdminTab reads (page-portals.jsx) — set before it mounts, and published
   to its subscribers when it is already on screen. */
function crPgSummerPanel(id) {
  if (!id || typeof _pendingTabSubs === "undefined") return;
  _pendingAdminTab = id;
  _pendingTabSubs.forEach(fn => { try { fn(); } catch (_) { /* a stale subscriber */ } });
}
function CrPgSummerMount({ sub }) {
  const seen = React.useRef(null);
  if (seen.current === null) { seen.current = sub || ""; crPgSummerPanel(sub); }
  React.useEffect(() => { if ((sub || "") !== seen.current) { seen.current = sub || ""; crPgSummerPanel(sub); } }, [sub]);
  if (typeof AdminSummer !== "function") return <div className="cr-locked"><CrIcon n="hammer"/><span>The Summer School workspace didn’t load. Open the Summer School portal instead.</span></div>;
  return <AdminSummer/>;
}

Object.assign(CR_TAB_DEFS, {
  summer: {
    skeleton: ["kpis", "table"],
    load: async () => ({}),
    actions: (d, ctx) => [{ l: "Open the Summer School portal", icon: "sun", primary: true, run: () => ctx.portal("summer-admin") }],
    facts: () => "The Summer School workspace: the live edition, its groups, intake, roster, check-in kiosk, attendance and records.",
    blocks: (d, ctx) => [{ type: "custom", span: 6, render: c => <CrPgSummerMount sub={ctx.sub}/> }],
  },
});

/* ── Assessments ────────────────────────────────────────────────────────────
   Baseline and endline: the same test, twice, to the same children. The
   headline is the PAIRED difference, and the two whole-edition means sit
   beside it deliberately — quoting the endline mean against the baseline mean
   is the mistake this exists to prevent. Caveats come BEFORE the breakdowns.
   An instrument with results is locked: what it measures and what it is out of
   cannot change (that would make every pair incomparable), so a new version is
   offered instead. Absent is not a zero. All of it is `summer` (assess_gate). */
const CR_PG_DOMAINS = [["literacy", "Literacy"], ["numeracy", "Numeracy"], ["sel", "Social & emotional"], ["gender_attitudes", "Gender attitudes"], ["other", "Other"]];
const CR_PG_SCALES = [["points", "Points out of a total"], ["rate", "A rate (e.g. words per minute)"], ["level", "A level on a ladder"]];
const CR_PG_GRADES = [["1", "Primary 1"], ["2", "Primary 2"], ["3", "Primary 3"], ["4", "Primary 4"], ["5", "Primary 5"], ["6", "Primary 6"], ["7", "JSS 1"], ["8", "JSS 2"], ["9", "JSS 3"], ["10", "SSS 1"], ["11", "SSS 2"], ["12", "SSS 3"]];
const CR_PG_ASSESS_ERR = {
  bad_max: "The maximum score must be between 1 and 1000.",
  bad_grade_range: "The last class can’t come before the first.",
  name_required: "Give the instrument a name.",
  window_closed: "This sitting is closed. Reopen it to change scores.",
  bad_dates: "The sitting can’t close before it opens.",
};
function crPgAssessErr(e, fb) {
  const c = e && ((e.data && e.data.error) || e.code);
  if (c === "locked") return (e.data && e.data.note) || "This instrument is locked because it has results. Make a new version instead.";
  if (c === "phase_exists") return "There is already a sitting for that phase. One per phase — two would leave it unclear which score pairs with the endline.";
  return CR_PG_ASSESS_ERR[c] || crErr(e, fb);
}
function crPgGrade(n) { const g = CR_PG_GRADES.find(x => x[0] === String(n)); return g ? g[1] : ""; }
/* A rate has no maximum to be a percentage of, and a ladder's rungs are not equally spaced. */
function crPgOutOf(i) { if (!i || (!i.scale && !i.maxScore)) return ""; return i.scale === "rate" ? (i.unit || "per minute") : i.scale === "level" ? (i.unit || "levels") : "out of " + i.maxScore; }
const crPgSigned = n => n === null || n === undefined ? "—" : (n > 0 ? "+" : "") + n;
const crPgPhase = p => p === "baseline" ? "Baseline" : p === "endline" ? "Endline" : (p || "—");

function crPgInstrumentForm(ctx, i) {
  const editing = !!(i && i.instrumentId);
  const locked = !!(i && i.locked);
  const v0 = i ? { name: i.name || "", domain: i.domain || "literacy", maxScore: String(i.maxScore || ""), items: i.items ? String(i.items) : "", scale: i.scale || "points", unit: i.unit || "",
      higherIsBetter: i.higherIsBetter !== false, gradeFrom: i.gradeFrom ? String(i.gradeFrom) : "", gradeTo: i.gradeTo ? String(i.gradeTo) : "", notes: i.notes || "",
      source: i.source || "", sourceUrl: i.sourceUrl || "", licence: i.licence || "", citation: i.citation || "", adaptNote: i.adaptNote || "" }
    : { name: "", domain: "literacy", maxScore: "50", items: "", scale: "points", unit: "", higherIsBetter: true, gradeFrom: "", gradeTo: "", notes: "", source: "", sourceUrl: "", licence: "", citation: "", adaptNote: "" };
  const fixed = locked ? { help: "Fixed: this instrument has results." } : {};
  const lockF = f => locked ? Object.assign({}, f, fixed, { type: "select", opts: (f.opts || [[v0[f.id], v0[f.id]]]).filter(o => String(o[0]) === String(v0[f.id])), req: true }) : f;
  ctx.form({
    title: editing ? "Edit " + i.name : "New instrument", submit: editing ? "Save" : "Add instrument", busyLabel: "Saving…",
    intro: locked ? "This instrument has results against it. Its name, notes and provenance can still be corrected, but what it measures and what it is out of are fixed — changing those would make every baseline and endline pair incomparable with nothing in the numbers to show it. Use New version instead."
      : "Provenance can be filled in for a home-grown test too: “measured with what?” gets asked about those as well.",
    values: v0,
    fields: [
      { id: "name", l: "Name", req: true, max: 160 },
      lockF({ id: "domain", l: "Domain", type: "select", req: true, opts: CR_PG_DOMAINS }),
      locked ? { id: "maxScore", l: "Maximum score", type: "select", req: true, opts: [[v0.maxScore, v0.maxScore]], help: fixed.help }
        : { id: "maxScore", l: "Maximum score", type: "number", req: true, num: true, im: "numeric", check: v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 1000 ? "" : CR_PG_ASSESS_ERR.bad_max; } },
      locked ? null : { id: "items", l: "Number of items", type: "number", num: true, im: "numeric", check: v => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0) ? "" : "Use a whole number." },
      lockF({ id: "scale", l: "Kind of score", type: "select", req: true, opts: CR_PG_SCALES, help: "Decides whether a percentage may be printed at all." }),
      { id: "unit", l: "Unit", max: 64, ph: "correct words per minute", help: "How the score is written." },
      locked ? null : { id: "higherIsBetter", l: "A higher score is the better result", type: "switch", help: "Off for a difficulties score, where the fall is the win." },
      locked ? null : { id: "gradeFrom", l: "From class", type: "select", ph: "Any class", opts: CR_PG_GRADES },
      locked ? null : { id: "gradeTo", l: "To class", type: "select", ph: "Any class", opts: CR_PG_GRADES, check: (v, all) => v && all.gradeFrom && Number(v) < Number(all.gradeFrom) ? CR_PG_ASSESS_ERR.bad_grade_range : "" },
      { id: "notes", l: "How it is administered", type: "textarea", rows: 3, max: 2000 },
      { id: "source", l: "Source — who published it", max: 255 },
      { id: "sourceUrl", l: "Source link", max: 255, type: "url" },
      { id: "licence", l: "Licence", max: 255 },
      { id: "citation", l: "Citation", type: "textarea", rows: 2, max: 1000 },
      { id: "adaptNote", l: "Local adaptation needed before use", type: "textarea", rows: 2, max: 1000 },
    ].filter(Boolean),
    onSubmit: async v => {
      /* The whole row: the server replaces the core fields, so a locked
         instrument resends its fixed values unchanged. */
      const data = { name: String(v.name).trim(), domain: v.domain, maxScore: Number(locked ? i.maxScore : v.maxScore) || 0,
        items: locked ? i.items : (Number(v.items) || 0), scale: v.scale, unit: v.unit, higherIsBetter: locked ? i.higherIsBetter !== false : !!v.higherIsBetter,
        gradeFrom: locked ? (i.gradeFrom || "") : v.gradeFrom, gradeTo: locked ? (i.gradeTo || "") : v.gradeTo, notes: v.notes,
        source: v.source, sourceUrl: v.sourceUrl, licence: v.licence, citation: v.citation, adaptNote: v.adaptNote, status: (i && i.status) || "active" };
      try { const r = await NGGApi.admin.assessInstrumentSave(editing ? i.instrumentId : "", data); ctx.reload(); return r; }
      catch (e) { throw Object.assign(e, { data: Object.assign({}, e.data || {}, { message: crPgAssessErr(e, "Couldn’t save the instrument.") }) }); }
    },
    done: v => (editing ? "Saved · " : "Added · ") + v.name + (editing ? "" : ". Open a baseline sitting when you are ready."),
  });
}

async function crPgSittingNew(ctx, inst, phase) {
  try {
    await NGGApi.admin.assessWindowSave("", { instrumentId: inst.instrumentId, phase, label: crPgPhase(phase) });
    ctx.toast(crPgPhase(phase) + " sitting opened · " + inst.name); ctx.closeDrawer(); ctx.reload();
  } catch (e) { ctx.toast(crPgAssessErr(e, "Couldn’t open the sitting."), null, true); }
}
async function crPgRevise(ctx, inst) {
  try { const r = await NGGApi.admin.assessInstrumentRevise(inst.instrumentId); ctx.toast("Version " + r.version + " of " + inst.name + " made, as a draft. Its old results stay with version " + inst.version + "."); ctx.closeDrawer(); ctx.reload(); }
  catch (e) { ctx.toast(crPgAssessErr(e, "Couldn’t make a new version."), null, true); }
}

function crPgInstrumentOpen(ctx, i) {
  const d = ctx.data || {};
  const has = ph => (d.windows || []).some(w => w.instrumentId === i.instrumentId && w.phase === ph);
  ctx.drawer({
    title: i.name, name: i.name, sub: [i.domainLabel, crPgOutOf(i), "Version " + i.version].join(" · "),
    stats: [["Results", crNum(i.results)], ["Sittings", crNum(i.windows)], ["Locked", i.locked ? "Yes" : "No"]],
    fields: [["Kind of score", i.scaleLabel || i.scale], ["Unit", i.unit], ["Better result", i.higherIsBetter === false ? "Lower" : "Higher"],
      ["Classes", i.gradeFrom || i.gradeTo ? (crPgGrade(i.gradeFrom) || "Any") + " – " + (crPgGrade(i.gradeTo) || "Any") : "Any class"], ["Items", i.items ? crNum(i.items) : ""],
      ["Status", i.status], ["Locked since", i.lockedAt ? crDate(i.lockedAt) : ""]],
    sections: [
      i.notes ? { h: "How it is administered", text: i.notes } : null,
      { h: "Provenance", rows: [["Source", i.source], ["Link", i.sourceUrl], ["Licence", i.licence], ["Citation", i.citation]] },
      i.adaptNote ? { h: "Before you use it", text: i.adaptNote } : null,
    ],
    actions: [
      { l: "Edit", primary: true, run: () => crPgInstrumentForm(ctx, i) },
      has("baseline") ? null : { l: "Open baseline sitting", run: () => crPgSittingNew(ctx, i, "baseline") },
      has("endline") ? null : { l: "Open endline sitting", run: () => crPgSittingNew(ctx, i, "endline") },
      i.locked ? { l: "New version", run: () => crPgRevise(ctx, i) } : null,
    ],
  });
}

function crPgSittingEdit(ctx, w) {
  const inst = ((ctx.data || {}).instruments || []).find(x => x.instrumentId === w.instrumentId) || {};
  ctx.form({
    title: "Sitting · " + (inst.name || w.instrumentId) + " · " + crPgPhase(w.phase), submit: "Save", busyLabel: "Saving…",
    intro: "A closed sitting keeps its scores and refuses changes until it is reopened.",
    values: { label: w.label || crPgPhase(w.phase), opensAt: w.opensAt || "", closesAt: w.closesAt || "", status: w.status || "open" },
    fields: [
      { id: "label", l: "Label", req: true, max: 120 },
      { id: "opensAt", l: "Opens", type: "date" },
      { id: "closesAt", l: "Closes", type: "date", check: (v, all) => v && all.opensAt && v < all.opensAt ? CR_PG_ASSESS_ERR.bad_dates : "" },
      { id: "status", l: "Scores", type: "chips", req: true, opts: [["open", "Open for scores"], ["closed", "Closed"]] },
    ],
    onSubmit: async v => {
      try { const r = await NGGApi.admin.assessWindowSave(w.windowId, { instrumentId: w.instrumentId, phase: w.phase, label: v.label, opensAt: v.opensAt, closesAt: v.closesAt, status: v.status }); ctx.reload(); return r; }
      catch (e) { throw Object.assign(e, { data: Object.assign({}, e.data || {}, { message: crPgAssessErr(e, "Couldn’t save the sitting.") }) }); }
    },
    done: v => v.status === "closed" ? "Sitting saved and closed." : "Sitting saved.",
  });
}

/* The register: every eligible child, a score each, and an Absent list. Absent
   hides that child's score — absent is not a zero. Blank means not marked yet. */
async function crPgRegister(ctx, w, centre) {
  let sheet;
  try { sheet = await NGGApi.admin.assessSheet(w.windowId, centre || ""); }
  catch (e) { ctx.toast(crPgAssessErr(e, "Couldn’t open the register."), null, true); return; }
  const st = sheet.students || [], inst = sheet.instrument || {};
  const centres = Array.from(new Set(st.map(s => s.centre).filter(Boolean))).sort();
  if (!centre && st.length > 60 && centres.length > 1) {
    ctx.form({ title: "Which register?", submit: "Open the register", intro: crPlural(st.length, "participant") + " sit this paper. Mark one centre at a time.",
      values: { centre: centres[0] }, fields: [{ id: "centre", l: "Centre", type: "select", req: true, opts: centres.map(c => [c, c]) }],
      onSubmit: async v => { setTimeout(() => crPgRegister(ctx, w, v.centre), 0); }, done: null });
    return;
  }
  if (!st.length) { ctx.toast("Nobody in the live edition is eligible to sit this paper yet.", null, true); return; }
  const max = Number(inst.maxScore) || 0;
  const values = { absent: st.filter(s => s.result && s.result.absent).map(s => s.studentId) };
  st.forEach(s => { values["s_" + s.studentId] = s.result && !s.result.absent ? String(s.result.score) : ""; });
  const closed = sheet.window && sheet.window.status === "closed";
  if (closed) { ctx.toast(CR_PG_ASSESS_ERR.window_closed, null, true); return; }
  ctx.form({
    title: inst.name + " · " + crPgPhase(w.phase) + (centre ? " · " + centre : ""), submit: "Save the register", busyLabel: "Saving…",
    intro: (inst.unit ? "Scored in " + inst.unit + ", 0–" + max + "." : "Out of " + max + ".") + " Leave a score blank for a child not marked yet. Tick Absent for one who did not sit — that is not a zero, and recording it as one would turn an attendance problem into a learning finding.",
    values,
    fields: [{ id: "absent", l: "Absent", type: "multi", opts: st.map(s => [s.studentId, s.name]) }].concat(st.map(s => ({
      id: "s_" + s.studentId, l: s.name + " · " + [s.centre, s.grade || "no class on file"].filter(Boolean).join(" · "), type: "number", num: true, im: "numeric",
      help: s.outOfRange ? "Outside this instrument’s classes." : undefined,
      when: v => !(v.absent || []).includes(s.studentId),
      check: v => v === "" || (Number(v) >= 0 && Number(v) <= max) ? "" : "Use a score from 0 to " + max + ".",
    }))),
    onSubmit: async v => {
      const results = st.map(s => { const ab = (v.absent || []).includes(s.studentId); return { studentId: s.studentId, absent: ab, score: ab ? "" : String(v["s_" + s.studentId] == null ? "" : v["s_" + s.studentId]).trim() }; });
      try { const r = await NGGApi.admin.assessRecord(w.windowId, results); ctx.reload(); return r; }
      catch (e) { throw Object.assign(e, { data: Object.assign({}, e.data || {}, { message: crPgAssessErr(e, "Couldn’t save the register. The scores you typed are still here.") }) }); }
    },
    /* Rejections are named, not counted: a coordinator must find them against a paper register. */
    done: (v, r) => (r.rejected || []).length
      ? crPlural(r.rejected.length, "score") + " outside 0–" + max + " NOT saved: " + r.rejected.slice(0, 6).join(", ") + (r.rejected.length > 6 ? "…" : "") + ". " + crNum(r.saved) + " recorded."
      : crNum(r.saved) + " recorded" + (r.cleared ? ", " + crNum(r.cleared) + " cleared" : "") + ".",
  });
}

function crPgSittingOpen(ctx, w) {
  const inst = ((ctx.data || {}).instruments || []).find(x => x.instrumentId === w.instrumentId) || {};
  ctx.drawer({
    title: (inst.name || w.instrumentId) + " · " + crPgPhase(w.phase), name: inst.name || "Sitting", sub: w.label || "",
    stats: [["Sat", crNum(w.sat)], ["Absent", crNum(w.absent)], ["Scores", w.status === "closed" ? "Closed" : "Open"]],
    fields: [["Opens", w.opensAt ? crDate(w.opensAt) : "Not set"], ["Closes", w.closesAt ? crDate(w.closesAt) : "Not set"], ["Scored", crPgOutOf(inst)]],
    actions: [
      { l: "Record scores", primary: true, run: () => { ctx.closeDrawer(); crPgRegister(ctx, w); }, disabled: w.status === "closed", why: w.status === "closed" ? "This sitting is closed. Reopen it under Edit sitting to change scores." : undefined },
      { l: "Edit sitting", run: () => crPgSittingEdit(ctx, w) },
    ],
  });
}

async function crPgAdopt(ctx, keys) {
  try {
    const r = await NGGApi.admin.assessAdopt(keys);
    const made = (r.created || []).length, had = (r.existing || []).length;
    ctx.toast(crPlural(made, "instrument") + " adopted" + (had ? ", " + crNum(had) + " already in use" : "") + ". Open a baseline sitting when you are ready.", null, made === 0 && !had);
    ctx.closeDrawer(); ctx.reload();
  } catch (e) { ctx.toast(crPgAssessErr(e, "Couldn’t adopt."), null, true); return false; }
}
function crPgCatOpen(ctx, c) {
  ctx.drawer({
    title: c.name, name: c.name, sub: [c.family, c.domainLabel, crPgOutOf(c)].filter(Boolean).join(" · "),
    fields: [["Classes", (c.gradeFromLabel || "Any") + " – " + (c.gradeToLabel || "Any")], ["Better result", c.higherIsBetter === false ? "Lower" : "Higher"], ["Adopted", c.adopted ? "Yes" : "No"]],
    sections: [
      c.notes ? { h: "What it is", text: c.notes } : null,
      /* Not fine print: importing another country's word list measures the wrong thing while looking rigorous. */
      c.adapt ? { h: "Before you use it", text: c.adapt } : null,
      { h: "Provenance", rows: [["Source", c.source], ["Licence", c.licence], ["Citation", c.citation], ["Link", c.sourceUrl]] },
    ],
    actions: c.adopted ? [] : [{ l: "Adopt", primary: true, run: () => crPgAdopt(ctx, [c.key]) }],
  });
}

function crPgGainBlocks(g, ctx) {
  const i = g.instrument || {};
  const pct = !!g.pctMeaningful;
  const base = pct ? (g.pairedBaselinePct == null ? "—" : g.pairedBaselinePct + "%") : (g.pairedBaselineMean == null ? "—" : String(g.pairedBaselineMean));
  const whole = pct ? (g.baselineMeanPct == null ? "—" : g.baselineMeanPct + "%") : (g.baselineMean == null ? "—" : String(g.baselineMean));
  const att = g.attrition || {}, bias = att.bias;
  const out = [{
    type: "kpis", span: 6, title: i.name, sub: [i.domainLabel, crPgOutOf(i), "v" + i.version, i.source ? i.source + (i.citation ? " · " + i.citation : "") : ""].filter(Boolean).join(" · "),
    items: [
      { l: "Mean change, per child" + (g.unit ? " (" + g.unit + ")" : ""), v: crPgSigned(g.gain && g.gain.mean), tone: g.improved === true ? "up" : g.improved === false ? "down" : "flat",
        d: g.improved === true ? "Improvement" : g.improved === false ? "Decline" : "", dn: g.gain && g.gain.lo != null ? " 95% CI " + g.gain.lo + " to " + g.gain.hi + (g.gain.d != null ? " · d = " + g.gain.d : "") : "" },
      { l: "Sat both papers", v: crNum(g.paired), dn: crNum(g.satBaseline) + " baseline · " + crNum(g.satEndline) + " endline" },
      { l: "Their baseline", v: base, dn: "Whole edition " + whole },
      { l: "Did not return", v: crNum(att.baselineOnly), tone: att.baselineOnly ? "down" : "flat", dn: bias ? "They scored " + (pct ? bias.leftMean + "%" : bias.leftMeanRaw) + " vs " + (pct ? bias.stayedMean + "%" : bias.stayedMeanRaw) : "" },
    ],
  }];
  (g.caveats || []).forEach(c => out.push({ type: "note", span: 6, icon: c.level === "error" ? "warning-octagon" : c.level === "warn" ? "warning-circle" : "info", tone: c.level === "error" ? "bad" : c.level === "warn" ? "warn" : undefined, text: c.text }));
  [["bySex", "By sex", "Sex"], ["byBand", "By class band", "Class band"], ["byCentre", "By centre", "Centre"]].forEach(([k, label, col]) => {
    if (!(g[k] || []).length) return;
    out.push({ type: "table", span: k === "byCentre" ? 6 : 3, title: i.name + " · " + label.toLowerCase(), nosel: true, sortInit: null,
      cols: [col, { l: "Pairs", num: true }, { l: "Mean gain", num: true }, "95% CI", "Reading"],
      rows: g[k].map(r => ({ key: k + r.group, cells: [
        { k: "strong", t: r.group },
        { k: "num", t: crNum(r.n), v: r.n },
        { k: "num", t: crPgSigned(r.meanGain), v: r.meanGain == null ? -1e9 : r.meanGain },
        { k: "text", t: r.lo == null ? "—" : r.lo + " to " + r.hi },
        r.tooThin ? { k: "status", t: "Too few to say", tone: "warn" } : r.significant ? { k: "status", t: "Clear of zero", tone: "ok" } : { k: "status", t: "Within noise", tone: "neutral" },
      ] })) });
  });
  return out;
}

Object.assign(CR_TAB_DEFS, {
  assessment: {
    skeleton: ["kpis", "table", "table"],
    load: async () => {
      const [ins, win, gains, cat] = await Promise.all([
        NGGApi.admin.assessInstruments(), NGGApi.admin.assessWindows(),
        NGGApi.admin.assessGains().catch(e => ({ error: e })), NGGApi.admin.assessCatalogue().catch(e => ({ error: e })),
      ]);
      return { instruments: ins.instruments || [], windows: win.windows || [], gains: gains.gains || [], gainsError: gains.error || null,
        catalogue: cat.catalogue || [], catNote: cat.note || "", catError: cat.error || null };
    },
    actions: (d, ctx) => [{ l: "New instrument", icon: "plus", primary: true, run: () => crPgInstrumentForm(ctx, null) }],
    facts: d => d.gains.length
      ? d.gains.map(g => (g.instrument || {}).name + ": mean change per child " + crPgSigned(g.gain && g.gain.mean) + " across " + g.paired + " paired participants" + (g.attrition && g.attrition.baselineOnly ? ", " + g.attrition.baselineOnly + " did not return" : "")).join("; ")
      : "No instrument has both a baseline and an endline with scores yet. " + d.instruments.length + " instruments, " + d.windows.length + " sittings.",
    blocks: (d, ctx) => {
      const out = [{ type: "note", span: 6, icon: "scales",
        text: "The same test, twice, to the same children — which is what a funder means by measuring learning.",
        sub: "Coursework grades are different tasks marked by different people, so a trend across them is not a learning gain and can’t be defended as one." }];
      /* Results */
      if (d.gainsError) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "The results didn’t load.", sub: crErr(d.gainsError), act: { l: "Try again", run: () => ctx.reload() } });
      else if (!d.gains.length) out.push({ type: "note", span: 6, icon: "chart-line-up", text: "No results yet.", sub: "No instrument has both a baseline and an endline with scores in them. Define or adopt an instrument, open a baseline sitting at the start of the edition and an endline at the end, and the paired result appears here." });
      else d.gains.forEach(g => crPgGainBlocks(g, ctx).forEach(b => out.push(b)));
      /* Instruments */
      const instById = {}; d.instruments.forEach(i => { instById[i.instrumentId] = i; });
      out.push({ type: "table", span: 6, title: "Instruments", sub: "Locked once a child has a result. A row opens it.", nosel: true,
        cols: ["Instrument", "Domain", "Scored", "Classes", { l: "Results", num: true }, { l: "Sittings", num: true }, "Status"],
        rows: d.instruments.map(i => ({ key: i.instrumentId, open: () => crPgInstrumentOpen(ctx, i), cells: [
          { k: "strong", t: i.name + (i.version > 1 ? " · v" + i.version : ""), s: i.source || "" },
          { k: "text", t: i.domainLabel },
          { k: "text", t: crPgOutOf(i) + (i.higherIsBetter === false ? " · lower is better" : "") },
          { k: "text", t: i.gradeFrom || i.gradeTo ? (crPgGrade(i.gradeFrom) || "Any") + " – " + (crPgGrade(i.gradeTo) || "Any") : "Any" },
          { k: "num", t: crNum(i.results), v: i.results },
          { k: "num", t: crNum(i.windows), v: i.windows },
          i.locked ? { k: "status", t: "Locked — has results", tone: "gold" } : { k: "status", t: i.status === "draft" ? "Draft" : "Open to change", tone: "neutral" },
        ] })),
        filters: ["Domain"], emptyText: "No instrument yet. Adopt a published one from the catalogue below, or add your own." });
      /* Sittings */
      out.push({ type: "table", span: 6, title: "Sittings", sub: "One baseline and one endline per instrument in the live edition. A row opens the register.", nosel: true,
        cols: ["Instrument", "Phase", "Dates", { l: "Sat", num: true }, { l: "Absent", num: true }, "Scores"],
        rows: d.windows.map(w => ({ key: w.windowId, open: () => crPgSittingOpen(ctx, w), cells: [
          { k: "strong", t: (instById[w.instrumentId] || {}).name || w.instrumentId, s: w.label || "" },
          { k: "text", t: crPgPhase(w.phase) },
          { k: "text", t: (w.opensAt ? crDate(w.opensAt) : "—") + " → " + (w.closesAt ? crDate(w.closesAt) : "—") },
          { k: "num", t: crNum(w.sat), v: w.sat },
          { k: "num", t: crNum(w.absent), v: w.absent },
          w.status === "closed" ? { k: "status", t: "Closed", tone: "neutral" } : { k: "status", t: "Open", tone: "ok" },
        ] })),
        filters: ["Phase"], emptyText: "No sitting opened yet. Open an instrument and choose Open baseline sitting." });
      /* Catalogue */
      if (d.catError) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "warn", text: "The catalogue didn’t load.", sub: crErr(d.catError), act: { l: "Try again", run: () => ctx.reload() } });
      else out.push({ type: "table", span: 6, title: "Catalogue of published instruments", sub: d.catNote,
        cols: ["Instrument", "Family", "Domain", "Scored", "Classes", "Status"],
        rows: d.catalogue.map(c => ({ key: c.key, open: () => crPgCatOpen(ctx, c), cells: [
          { k: "strong", t: c.name, s: c.source || "" },
          { k: "text", t: c.family || "—" },
          { k: "text", t: c.domainLabel },
          { k: "text", t: crPgOutOf(c) + (c.higherIsBetter === false ? " · lower is better" : "") },
          { k: "text", t: (c.gradeFromLabel || "Any") + " – " + (c.gradeToLabel || "Any") },
          c.adopted ? { k: "status", t: "Adopted", tone: "ok" } : { k: "status", t: "Not adopted", tone: "neutral" },
        ] })),
        search: "Search the catalogue", filters: ["Family", "Domain", "Status"],
        bulk: [{ l: "Adopt", max: 50, run: async keys => {
          const fresh = keys.filter(k => !(d.catalogue.find(c => c.key === k) || {}).adopted);
          if (!fresh.length) { ctx.toast("Those are already adopted."); return false; }
          return crPgAdopt(ctx, fresh);
        } }],
        emptyText: "The catalogue is empty." });
      return out;
    },
  },
});

/* ── Events ─────────────────────────────────────────────────────────────────
   Every event — drafts, internal ones and past ones — not the public feed.
   Writes need `content` (admin_events_upsert); the list is any staff. The
   server takes the whole row, so the edit form posts every field it shows. */
const CR_PG_EV_KINDS = [["session", "Session"], ["showcase", "Showcase"], ["parent-meet", "Parent meeting"], ["community", "Community"], ["online", "Online"]];
const CR_PG_EV_STATUS = [["draft", "Draft"], ["published", "Published"], ["cancelled", "Cancelled"]];
const CR_PG_EV_TONE = { draft: "neutral", published: "ok", cancelled: "bad" };
const crPgLabel = (opts, v) => { const f = opts.find(o => o[0] === v); return f ? f[1] : (v || "—"); };
const crPgEvCentre = v => v === "Both" ? "All centres" : (v || "—");
/* datetime-local wants "YYYY-MM-DDTHH:MM"; a stored ISO with seconds or a zone is trimmed to that. */
const crPgLocal = v => { const s = String(v || ""); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T09:00" : ""; };

async function crPgUploadCover(file) {
  try { return (await NGGApi.uploadFile(file, "cover")).url; }
  catch (_) { return (await NGGApi.uploadPublic(file)).url; }
}

function crPgEventForm(ctx, ev) {
  const d = ctx.data || {};
  const editing = !!(ev && ev.eventId);
  const centres = (d.centres || []).map(c => [c, c]).concat([["Both", "All centres"], ["Online", "Online"]]);
  if (ev && ev.centre && !centres.some(c => c[0] === ev.centre)) centres.push([ev.centre, ev.centre]);
  const v0 = ev ? { title: ev.title || "", kind: ev.kind || "session", centre: ev.centre || "", startAt: crPgLocal(ev.startAt), endAt: crPgLocal(ev.endAt), location: ev.location || "",
      coverUrl: ev.coverUrl || "", cover: "", body: ev.body || "", capacity: String(ev.capacity || 0), status: ev.status || "draft", isPublic: !!ev.isPublic }
    : { title: "", kind: "session", centre: (d.centres || []).length === 1 ? d.centres[0] : "", startAt: "", endAt: "", location: "", coverUrl: "", cover: "", body: "", capacity: "0", status: "draft", isPublic: false };
  ctx.form({
    title: editing ? "Edit event" : "New event", submit: editing ? "Save" : "Add event", busyLabel: "Saving…",
    intro: editing ? "" : "It is saved as a draft unless you choose Published. Only a published, public event shows on the public events page.",
    values: v0,
    fields: [
      { id: "title", l: "Title", req: true, max: 200 },
      { id: "kind", l: "Kind", type: "select", req: true, opts: CR_PG_EV_KINDS },
      { id: "centre", l: "Centre", type: "select", req: true, opts: centres },
      { id: "startAt", l: "Starts", type: "datetime-local" },
      { id: "endAt", l: "Ends", type: "datetime-local", check: (v, all) => v && all.startAt && v < all.startAt ? "The event can’t end before it starts." : "" },
      { id: "location", l: "Location", ph: "Room 3, Egbeda Annex", max: 200 },
      { id: "coverUrl", l: "Cover image link", type: "url", ph: "https://…", help: "Paste a direct https:// image link, or upload one below." },
      { id: "cover", l: "Upload a cover image", type: "file", accept: "image/*" },
      { id: "body", l: "Description", type: "textarea", rows: 6, help: "Markdown works." },
      { id: "capacity", l: "Capacity", type: "number", num: true, im: "numeric", help: "0 means open — no limit on RSVPs.", check: v => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0) ? "" : "Use a whole number, 0 or more." },
      { id: "status", l: "Status", type: "chips", req: true, opts: CR_PG_EV_STATUS },
      { id: "isPublic", l: "Show on the public events page", type: "switch", help: "Off: members and staff see it; the public site does not." },
    ],
    onSubmit: async v => {
      let coverUrl = String(v.coverUrl || "").trim();
      if (v.cover) {
        try { coverUrl = await crPgUploadCover(v.cover); }
        catch (e) { return { fieldErrors: { cover: "The upload didn’t work (" + crErr(e, "uploads may not be set up on this server").replace(/\.$/, "") + "). Paste an image link instead." } }; }
      }
      const data = { title: String(v.title).trim(), kind: v.kind, centre: v.centre, startAt: v.startAt, endAt: v.endAt, location: v.location, coverUrl,
        body: v.body, capacity: Number(v.capacity) || 0, status: v.status, isPublic: !!v.isPublic };
      if (editing) data.eventId = ev.eventId;
      const r = await NGGApi.admin.events.upsert(data);
      ctx.reload();
      return r;
    },
    done: v => (editing ? "Saved · " : "Added · ") + v.title + (v.status === "published" ? (v.isPublic ? " · on the public events page" : " · internal") : " · " + crPgLabel(CR_PG_EV_STATUS, v.status).toLowerCase()),
  });
}

function crPgEventOpen(ctx, ev) {
  ctx.drawer({
    title: ev.title || "(untitled)", name: ev.title, photo: /^https?:\/\//.test(ev.coverUrl || "") ? ev.coverUrl : "",
    sub: [crPgLabel(CR_PG_EV_KINDS, ev.kind), crPgEvCentre(ev.centre), crPgLabel(CR_PG_EV_STATUS, ev.status)].join(" · "),
    stats: [["Starts", ev.startAt ? crDate(ev.startAt, true) : "Not set"], ["Capacity", ev.capacity ? crNum(ev.capacity) : "Open"], ["Seen by", ev.isPublic ? "Public" : "Internal"]],
    fields: [["Ends", ev.endAt ? crDate(ev.endAt, true) : ""], ["Centre", crPgEvCentre(ev.centre)], ["Location", ev.location], ["Event ID", ev.eventId], ["Cover", ev.coverUrl]],
    sections: [ev.body ? { h: "Description", text: ev.body } : null],
    actions: [ctx.can("content") ? { l: "Edit", primary: true, run: () => crPgEventForm(ctx, ev) } : null],
  });
}

Object.assign(CR_TAB_DEFS, {
  events: {
    skeleton: ["kpis", "table"],
    load: async () => {
      const [r, cs] = await Promise.all([NGGApi.admin.events.list(), NGGApi.admin.registration.centres().catch(() => ({ centres: [] }))]);
      return { events: r.events || [], centres: (cs.centres || []).filter(c => c.status !== "retired").map(c => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b)) };
    },
    actions: (d, ctx) => [{ l: "New event", icon: "calendar-plus", primary: true, run: () => crPgEventForm(ctx, null), disabled: !ctx.can("content"), why: ctx.can("content") ? undefined : "Adding events needs the content permission." }],
    facts: d => {
      const now = Date.now(), up = d.events.filter(e => Date.parse(e.startAt || "") >= now && e.status !== "cancelled");
      return crPlural(d.events.length, "event") + " in all; " + up.length + " upcoming: " + up.slice(0, 8).map(e => e.title + " (" + e.startAt + ", " + e.status + ")").join("; ");
    },
    blocks: (d, ctx) => {
      const now = Date.now();
      const t = e => Date.parse(e.startAt || "") || 0;
      const up = d.events.filter(e => t(e) >= now && e.status !== "cancelled");
      return [
        { type: "kpis", span: 6, items: [
          { l: "Upcoming", v: crNum(up.length), tone: "flat" },
          { l: "Upcoming and published", v: crNum(up.filter(e => e.status === "published").length), tone: "flat" },
          { l: "Drafts", v: crNum(d.events.filter(e => e.status === "draft").length), tone: "flat" },
          { l: "Not dated", v: crNum(d.events.filter(e => !t(e)).length), tone: "flat" },
        ] },
        { type: "table", span: 6, title: "All events", sub: "Drafts, internal and past events included — newest first.", nosel: true, sortInit: null,
          cols: ["Event", { l: "Starts", num: true }, "Centre", "Kind", "Seen by", "Status"],
          rows: d.events.map(e => ({ key: e.eventId, open: () => crPgEventOpen(ctx, e), cells: [
            { k: "strong", t: e.title || "(untitled)", s: e.location || "" },
            { k: "num", t: e.startAt ? crDate(e.startAt, true) : "Not set", v: t(e) },
            { k: "text", t: crPgEvCentre(e.centre) },
            { k: "text", t: crPgLabel(CR_PG_EV_KINDS, e.kind) },
            { k: "text", t: e.isPublic ? "Public" : "Internal" },
            { k: "status", t: crPgLabel(CR_PG_EV_STATUS, e.status) + (t(e) && t(e) < now && e.status === "published" ? " · past" : ""), tone: CR_PG_EV_TONE[e.status] || "neutral" },
          ] })),
          search: "Search events", filters: ["Status", "Centre", "Kind", "Seen by"],
          emptyText: "No events yet. Add one and publish it when it is ready for members to RSVP." },
      ];
    },
  },
});
