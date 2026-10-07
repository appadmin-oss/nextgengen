/* ============================================================================
   Control Room v2 — the programme tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).

   PROGRESS (a resumed run picks up here):
     checkin     Desks        — done, verified in the lab (open/schedule/validity/rotate/revoke/delete)
     attendance  Duty rota    — not started
     summer      Edition      — not started
     assessment  Assessments  — not started
     events      Events       — not started
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
