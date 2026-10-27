/* ══ Wi-Fi ════════════════════════════════════════════════════════════════════
   The centres' Wi-Fi (domain/wifi.php, domain/wifi-setup.php). Its own page
   under System, three tabs, each with one job:

     Gateways      — each centre's coverage and each gateway's health, worst
                     first, with what to do; add, edit, rotate, remove.
     Who gets on   — "why can't this person get on?", the access table and the
                     speeds, edited in place (the unsaved bar saves them).
     Setup guides  — what each platform can do, and how it all fits together.

   Gateways and the table are the `network` capability (systems people); the
   lookup is a read any desk that looks after people may use, and changing one
   person's Wi-Fi is that person's desk's (people / summer). The Club portal's
   Wi-Fi item is a door to this page, not a copy.

   A key is shown once — when the gateway is added or rotated — in the setup
   guide's drawer, with the script already filled in. */

const CR_WF_ACCESS = [["on", "On"], ["limited", "Limited"], ["off", "Off"]];
const CR_WF_ACCESS_TONE = { on: "ok", limited: "warn", off: "neutral" };
const CR_WF_PROFILE_WORDS = {
  "ngg-member": "Members", "ngg-staff": "Staff, mentors and instructors", "ngg-limited": "Limited access",
  "ngg-summer": "Summer School participants", "ngg-guest": "Visitors",
};
const CR_WF_HEALTH = { ok: ["Working", "ok"], warn: ["Needs a look", "warn"], bad: ["Not working", "bad"] };
const CR_WF_ERR = {
  bad_platform: "Choose what the gateway is.",
  bad_centre: "Choose a centre that is in use.",
  bad_profile: "Check the speeds, devices and hours.",
  case_locked: "Suspended, evicted and inactive records are always off.",
  too_many_resets: "That PIN has been changed three times today. Try again tomorrow.",
  reason_required: "Say why, so the next person to look knows.",
  own_account: "Somebody else changes your own Wi-Fi.",
  no_printed_id: "They need a printed ID number first.",
};
const crWfErr = (e, fallback) => {
  const d = (e && e.data) || {};
  return d.message || CR_WF_ERR[d.error || (e && e.code)] || crErr(e, fallback);
};
const crWfIcon = p => ({ mikrotik: "broadcast", openwrt: "share-network", radius: "shield-check", generic: "brackets-curly" })[p] || "wifi-high";
const crWfName = g => g.label || g.centre;
const crWfCtx = { current: null };

/* ── Gateways ─────────────────────────────────────────────────────────────── */

/* The guide for one gateway: steps and a script from the server. With `key`
   (just added or rotated) the script carries it; otherwise it says where. */
async function crWfGuide(ctx, g, key) {
  let s;
  try { s = await NGGApi.admin.wifi.setup(g.gatewayId); }
  catch (e) { ctx.toast(crWfErr(e, "Couldn’t open the setup guide."), null, true); return; }
  const fill = t => key ? String(t || "").split("PASTE-THE-KEY-HERE").join(key) : String(t || "");
  const script = fill(s.script);
  ctx.drawer({
    title: key ? "Set up " + crWfName(g) + " now" : "Setup guide · " + crWfName(g),
    sub: s.label + " · " + g.centre,
    sections: [
      key ? { h: "This gateway’s key — shown once", text: key + "\n\nIt is already in the script below. Afterwards only its last four characters are shown; if it is lost, rotate it and run the setup again." }
        : { h: "The key", text: "The script has PASTE-THE-KEY-HERE where the key goes. Keys are shown once; if this gateway’s is lost, rotate it and the guide opens again with the new one filled in." },
      s.pilot ? { h: "Pilot first", text: s.pilot } : null,
      { h: "Before you start", text: s.needs },
      ...(s.steps || []).map(st => ({ h: st.h, text: fill(st.text) })),
      script ? { h: s.scriptName || "Script", text: script } : null,
      s.check ? { h: "Check it worked", text: s.check } : null,
      s.trouble ? { h: "If it doesn’t work", text: s.trouble } : null,
    ].filter(Boolean),
    actions: [
      script ? { l: "Copy the script", primary: true, run: () => crSyCopy(ctx, script, "Script") } : null,
      key ? { l: "Copy the key", run: () => crSyCopy(ctx, key, "Key") } : null,
      { l: "Done", run: () => { ctx.closeDrawer(); ctx.reload(); } },
    ].filter(Boolean),
  });
}

function crWfEdit(ctx, d, g, centre) {
  const editing = !!g;
  ctx.closeDrawer();
  ctx.form({
    title: editing ? "Edit " + crWfName(g) : "Add a gateway", submit: editing ? "Save changes" : "Add the gateway", busyLabel: "Saving…",
    intro: editing ? "Moving it to another centre or platform sends it a full list at its next fetch." : "Its key and its setup guide open straight after this. The key is shown once.",
    values: editing ? { platform: g.platform, centre: g.centre, label: g.label } : { platform: "mikrotik", centre: centre || (d.centres || [])[0] || "" },
    fields: [
      { id: "platform", l: "What it is", type: "chips", req: true, opts: (d.platforms || []).map(p => [p.id, p.label]), help: "Not sure which? Setup guides compares them. Anything not listed can read the JSON feed." },
      { id: "centre", l: "Centre", type: "select", req: true, opts: (d.centres || []).map(c => [c, c]) },
      { id: "label", l: "Name", max: 120, ph: "e.g. Main hall router", help: "Leave blank to use the centre’s name." },
    ],
    onSubmit: async v => {
      try { return await NGGApi.admin.wifi.gatewaySave({ gatewayId: editing ? g.gatewayId : undefined, platform: v.platform, centre: v.centre, label: v.label }); }
      catch (e) {
        const code = (e && e.data && e.data.error) || (e && e.code);
        if (code === "bad_centre") return { fieldErrors: { centre: CR_WF_ERR.bad_centre } };
        if (code === "bad_platform") return { fieldErrors: { platform: CR_WF_ERR.bad_platform } };
        throw e;
      }
    },
    done: (v, r) => {
      ctx.reload();
      if (r && r.key && r.gateway) setTimeout(() => crWfGuide(ctx, r.gateway, r.key), 50);
      return (editing ? "Saved · " : "Added · ") + (v.label || v.centre);
    },
  });
}

async function crWfRotate(ctx, g) {
  const ok = await ctx.confirm({ title: "Rotate the key for " + crWfName(g) + "?", danger: true, cta: "Rotate the key",
    body: "The old key stops working at once. Until the setup is run again with the new key, the gateway keeps the people it already has but gets no changes — nobody new can sign in and nobody suspended is removed." });
  if (!ok) return;
  try { const r = await NGGApi.admin.wifi.gatewayRotate(g.gatewayId); ctx.closeDrawer(); ctx.reload(); crWfGuide(ctx, r.gateway, r.key); }
  catch (e) { ctx.toast(crWfErr(e, "Couldn’t rotate the key."), null, true); }
}

async function crWfRemove(ctx, g) {
  const ok = await ctx.confirm({ title: "Remove " + crWfName(g) + "?", danger: true, cta: "Remove",
    body: "Its key stops working at once. The gateway keeps the people it last had until the NGG setup is taken off it, so do that too. This can’t be undone; adding it again gives it a new key." });
  if (!ok) return;
  try { await NGGApi.admin.wifi.gatewayRemove(g.gatewayId); ctx.closeDrawer(); ctx.toast("Removed · " + crWfName(g)); ctx.reload(); }
  catch (e) { ctx.toast(crWfErr(e, "Couldn’t remove it."), null, true); }
}

async function crWfPreview(ctx, g) {
  let r;
  try { r = await NGGApi.admin.wifi.preview(g.gatewayId, ""); }
  catch (e) { ctx.toast(crWfErr(e, "Couldn’t read its list."), null, true); return; }
  ctx.drawer({
    title: "What " + crWfName(g) + " holds", sub: "Worked out now, from people’s records",
    stats: [["On the list", crNum(r.count)], ["Still to add", crNum(r.pendingAdds)], ["Still to remove", crNum(r.pendingRemoves)]],
    sections: [
      { h: "By profile", rows: Object.keys(r.byProfile || {}).map(k => [CR_WF_PROFILE_WORDS[k] || k, crNum(r.byProfile[k])]), empty: "Nobody has Wi-Fi at this centre right now." },
      { h: "Still to add or remove", text: r.pendingAdds || r.pendingRemoves ? "These reach the gateway at its next fetch." : "The gateway already holds exactly this list." },
    ],
    actions: [{ l: "Back", primary: true, run: () => crWfOpen(ctx, g) }],
  });
}

function crWfOpen(ctx, g) {
  const d = (crWfCtx.current && crWfCtx.current.data) || {};
  ctx.drawer({
    title: crWfName(g), sub: g.platformLabel + " · " + g.centre + (g.pilot ? " · pilot" : ""),
    stats: [["People on it", crNum(g.users)], ["Last fetch", g.lastSeenAt ? crAgo(g.lastSeenAt) : "Never"], ["List version", crNum(g.version)]],
    sections: [
      { h: "How it is", rows: (g.diagnosis || []).map(x => [x.title, x.fix]), empty: "Nothing to report." },
    ],
    fields: [["Centre", g.centre], ["Platform", g.platformLabel], ["Reported version", g.osVersion || "Not reported"], ["Key", "…" + g.keyTail + " · set " + crDate(g.keySetAt)],
      ["Last full list", g.lastFullAt ? crDate(g.lastFullAt, true) : "Not yet"], ["Last change sent", g.lastChangeAt ? crDate(g.lastChangeAt, true) : "None yet"], ["Added", crDate(g.createdAt)]],
    actions: [
      { l: "Setup guide", primary: !g.lastSeenAt, run: () => crWfGuide(ctx, g) },
      { l: "What it holds", primary: !!g.lastSeenAt, run: () => crWfPreview(ctx, g) },
      { l: "Edit", run: () => crWfEdit(ctx, d, g) },
      { l: "Rotate the key", run: () => crWfRotate(ctx, g) },
      { l: "Remove", run: () => crWfRemove(ctx, g) },
    ],
  });
}

/* ── Who gets on ──────────────────────────────────────────────────────────── */

/* One person: what they have and why, and — for whoever owns their record —
   a hand-set override with a reason, or a new PIN. */
function crWfPerson(ctx, x) {
  const acc = CR_WF_ACCESS.find(a => a[0] === x.access) || [x.access, x.access];
  const ov = x.override;
  const act = async (op, extra, msg) => {
    try { const r = await NGGApi.admin.wifi.memberSet(x.subjectType, x.subjectId, op, extra); ctx.toast(msg); crWfPerson(ctx, Object.assign({}, x, r.wifi, { pin: "" })); }
    catch (e) { ctx.toast(crWfErr(e, "Couldn’t change it."), null, true); }
  };
  ctx.drawer({
    title: x.name, sub: (x.subjectType === "summer" ? "Summer School participant" : "Member") + " · " + (x.centre || "no centre"),
    stats: [["Wi-Fi", acc[1]], ["Sign-in name", x.username || "—"], ["Centre has Wi-Fi", x.centreHasWifi ? "Yes" : "Not yet"]],
    fields: [["Why", x.why || "—"], x.limits ? ["Speed", x.limits.down + " Mbit/s down · " + x.limits.up + " up · " + crPlural(x.limits.devices, "device") + (x.limits.hours ? " · " + x.limits.hours : "")] : null,
      ["PIN last set", x.pinSetAt ? crDate(x.pinSetAt, true) : "—"], ov ? ["Set by hand", ov.access + " — “" + ov.why + "” · " + crDate(ov.at)] : null].filter(Boolean),
    sections: [
      { h: "Where this comes from", text: "Wi-Fi follows the record: status, conduct, role and — for Summer School — the edition’s dates. To change why somebody is off, change the record. A hand-set override is for the exceptions, and never undoes a suspension." },
      !x.canChange ? { h: "Changing it", text: "Changing somebody’s Wi-Fi is done by whoever looks after their record (" + (x.subjectType === "summer" ? "Summer School" : "People") + ")." } : null,
    ].filter(Boolean),
    actions: x.canChange ? [
      { l: "Set by hand…", primary: true, run: () => {
        ctx.closeDrawer();
        ctx.form({ title: "Set " + x.name + "’s Wi-Fi by hand", submit: "Save", busyLabel: "Saving…",
          intro: "Overrides the access table for this one person until it is cleared. It never undoes a suspension.",
          values: { access: ov ? ov.access : x.access, why: "" },
          fields: [{ id: "access", l: "Wi-Fi", type: "chips", req: true, opts: CR_WF_ACCESS }, { id: "why", l: "Why", req: true, max: 255, ph: "e.g. Alumni mentor on Saturdays" }],
          onSubmit: async v => { try { return await NGGApi.admin.wifi.memberSet(x.subjectType, x.subjectId, "override", { access: v.access, why: v.why }); } catch (e) { throw new Error(crWfErr(e, "Couldn’t save.")); } },
          done: (v, r) => { setTimeout(() => crWfPerson(ctx, Object.assign({}, x, r.wifi, { pin: "" })), 50); return "Saved · " + x.name; } });
      } },
      ov ? { l: "Clear the override", run: () => act("clear", null, "Override cleared · " + x.name) } : null,
      x.access !== "off" ? { l: "Give them a new PIN", run: () => act("resetPin", null, "New PIN made. " + x.name + " sees it in the app under Me → Wi-Fi.") } : null,
    ].filter(Boolean) : [],
  });
}

function crWfLookup(ctx) {
  ctx.form({
    title: "Why can’t somebody get on?", submit: "Look them up", busyLabel: "Looking…",
    intro: "Their printed ID, record id or name. You see whether they have Wi-Fi, and why — never their PIN.",
    values: { q: "" },
    fields: [{ id: "q", l: "Who", req: true, ph: "e.g. 026-014 or Ada", max: 60 }],
    onSubmit: async v => NGGApi.admin.wifi.lookup(String(v.q).trim()),
    done: (v, r) => {
      const res = (r && r.results) || [];
      setTimeout(() => {
        if (res.length === 1) return crWfPerson(ctx, res[0]);
        ctx.drawer({
          title: res.length ? crPlural(res.length, "person", "people") + " for “" + v.q + "”" : "Nobody found for “" + v.q + "”",
          sub: "Within your centres",
          sections: [{ h: "People", list: res.map(x => ({ icon: x.access === "off" ? "wifi-slash" : "wifi-high", t: x.name + " · " + (x.username || x.subjectId), s: (CR_WF_ACCESS.find(a => a[0] === x.access) || [0, x.access])[1] + " — " + (x.why || ""), act: { l: "Open", run: () => crWfPerson(ctx, x) } })),
            empty: "Try their printed ID (e.g. 026-014) or part of their name." }],
          actions: [{ l: "Look up somebody else", primary: true, run: () => { ctx.closeDrawer(); crWfLookup(ctx); } }],
        });
      }, 50);
      return "";
    },
  });
}

/* The access table and the speeds, as form blocks built once per load (a
   form block re-bases its edits whenever its object changes). Only what
   changed is sent; the server checks all of it before saving any. */
function crWfForms(d) {
  const cases = d.cases || [];
  const access = {
    type: "form", span: 6, key: "wifi-access", title: "Who gets on",
    groups: [
      { h: "From people’s records", help: "Nobody is added or removed by hand: a record that changes changes its Wi-Fi at the gateway’s next fetch. “Limited” is the slow, one-device profile.",
        rows: cases.map(c => c.locked
          ? { id: "c_" + c.case, l: c.words, help: "Always off — a suspension is not undone from here.", c: "segmented", opts: [["off", "Off"]], value: "off" }
          : { id: "c_" + c.case, l: c.words, help: c.access !== c.default ? "The default is " + c.default + "." : "", c: "segmented", opts: CR_WF_ACCESS, value: c.access }) },
      { h: "Fees", rows: [{ id: "feesRule", l: "Fees owing changes Wi-Fi", help: "Off: fees never touch Wi-Fi. On: somebody with a balance to pay gets the “Fees owing” setting above.", c: "toggle", value: !!d.feesRule }] },
    ],
    save: async patch => {
      const out = { cases: {} };
      Object.keys(patch).forEach(k => { if (k.indexOf("c_") === 0 && k !== "c_blocked") out.cases[k.slice(2)] = patch[k]; });
      if ("feesRule" in patch) out.feesRule = !!patch.feesRule;
      try { await NGGApi.admin.wifi.accessSet(out); } catch (e) { throw new Error(crWfErr(e, "Couldn’t save.")); }
    },
    onSaved: () => crWfCtx.current && crWfCtx.current.reload(),
  };
  const n = (lo, hi) => v => /^\d+$/.test(String(v).trim()) && +v >= lo && +v <= hi ? "" : "A whole number from " + lo + " to " + hi + ".";
  const hours = v => !String(v || "").trim() || /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(String(v).trim()) ? "" : "Blank for all day, or like 08:00-18:00.";
  const profiles = d.profiles || {};
  const speeds = {
    type: "form", span: 6, key: "wifi-speeds", title: "Speeds, devices and hours",
    groups: Object.keys(profiles).map(k => ({ h: CR_WF_PROFILE_WORDS[k] || k, help: k === "ngg-limited" ? "Anybody whose access is “Limited”." : k === "ngg-guest" ? "For day passes, which come later." : "",
      rows: [
        { id: k + "|down", l: "Download (Mbit/s)", c: "input", type: "number", value: String(profiles[k].down), check: n(1, 1000) },
        { id: k + "|up", l: "Upload (Mbit/s)", c: "input", type: "number", value: String(profiles[k].up), check: n(1, 1000) },
        { id: k + "|devices", l: "Devices at once", c: "input", type: "number", value: String(profiles[k].devices), check: n(1, 5) },
        { id: k + "|hours", l: "Hours", help: "Blank for all day. Kept by NGG: outside them, people are signed out at the next fetch.", c: "input", value: profiles[k].hours || "", check: hours },
      ] })),
    save: async (patch, all) => {
      const out = { profiles: {} };
      Object.keys(patch).forEach(id => { const k = id.split("|")[0]; out.profiles[k] = { down: +all[k + "|down"], up: +all[k + "|up"], devices: +all[k + "|devices"], hours: String(all[k + "|hours"] || "").trim() }; });
      try { await NGGApi.admin.wifi.accessSet(out); } catch (e) { throw new Error(crWfErr(e, "Couldn’t save.")); }
    },
    onSaved: () => crWfCtx.current && crWfCtx.current.reload(),
  };
  return { access, speeds };
}

/* ── Setup guides ─────────────────────────────────────────────────────────── */

const CR_WF_CAN = [["profiles", "Speeds"], ["devices", "Devices"], ["kick", "Signs out"], ["remember", "Remembers"], ["filter", "Filtering"]];

const crWfLoad = async () => {
  const d = await NGGApi.admin.wifi.overview();
  d.forms = crWfForms(d);
  return d;
};

Object.assign(CR_TAB_DEFS, {
  wifi: {
    skeleton: ["kpis", "cards", "cards"],
    load: crWfLoad,
    actions: (d, ctx) => [
      { l: "Add a gateway", icon: "plus", primary: true, disabled: !(d.centres || []).length, why: (d.centres || []).length ? "" : "Add a centre first (Members → Centres).", run: () => crWfEdit(ctx, d, null) },
      { l: "Why can’t somebody get on?", icon: "magnifying-glass", run: () => crWfLookup(ctx) },
    ],
    blocks: (d, ctx) => {
      crWfCtx.current = ctx;
      const gws = d.gateways || [];
      const bad = gws.filter(g => g.health === "bad"), warn = gws.filter(g => g.health === "warn");
      const people = gws.reduce((n, g) => n + (g.users || 0), 0);
      const byCentre = {};
      gws.forEach(g => { (byCentre[g.centre] = byCentre[g.centre] || []).push(g); });
      const bare = (d.centres || []).filter(c => !byCentre[c]);
      const card = g => { const h = CR_WF_HEALTH[g.health] || CR_WF_HEALTH.warn;
        return { icon: crWfIcon(g.platform), title: crWfName(g), sub: g.platformLabel + (g.pilot ? " · pilot" : ""), tag: g.lastSeenAt ? h[0] : "Not connected yet", tone: g.lastSeenAt ? h[1] : "warn",
          meta: [["People on it", crNum(g.users)], ["Last fetch", g.lastSeenAt ? crAgo(g.lastSeenAt) : "Never"], ["Reported version", g.osVersion || "—"]],
          onClick: () => crWfOpen(ctx, g) }; };
      return [
        { type: "kpis", span: 6, items: [
          { l: "Centres with Wi-Fi", v: crNum(Object.keys(byCentre).length) + " of " + crNum((d.centres || []).length), dn: bare.length ? crNum(bare.length) + " still to set up" : "every centre" },
          { l: "Gateways working", v: crNum(gws.length - bad.length - warn.length) + " of " + crNum(gws.length) },
          { l: "Need a look", v: crNum(bad.length + warn.length), dn: bad.length ? crNum(bad.length) + " not working" : "" },
          { l: "People on Wi-Fi", v: crNum(people), dn: "as the gateways last confirmed" },
        ] },
        bad.length + warn.length ? { type: "attention", span: 6, title: "Needs a look", empty: "",
          rows: bad.concat(warn).map(g => { const x = (g.diagnosis || []).find(y => y.tone !== "ok") || {}; return { n: 1, l: crWfName(g) + " · " + x.title, s: x.fix, tone: g.health === "bad" ? "bad" : "warn", onClick: () => crWfOpen(ctx, g) }; }) } : null,
        { type: "cards", span: 6, title: "Centres", sub: "Each centre and its gateway", empty: "No centres yet. Add them under Members → Centres.",
          cards: (d.centres || []).map(c => byCentre[c] ? null : { icon: "wifi-slash", title: c, sub: "No gateway yet. Members here see “Wi-Fi isn’t set up at your centre yet”. Open to add one.", tag: "Not set up", tone: "neutral",
            onClick: () => crWfEdit(ctx, d, null, c) })
            .filter(Boolean).concat([].concat(...Object.keys(byCentre).sort().map(c => byCentre[c].map(card)))) },
        { type: "note", span: 6, icon: "info", text: "Each gateway fetches its centre’s list from NGG every one to five minutes, with its own key. Somebody suspended is signed out at the next fetch; a gateway that can’t reach NGG keeps the people it already has.",
          sub: "Open a gateway for its health, what it holds, its setup guide and its key.", act: { l: "Setup guides", run: () => ctx.go("wifi", "wifi-guides") } },
      ].filter(Boolean);
    },
  },

  "wifi-access": {
    skeleton: ["table", "table"],
    load: crWfLoad,
    actions: (d, ctx) => [
      { l: "Why can’t somebody get on?", icon: "magnifying-glass", primary: true, run: () => crWfLookup(ctx) },
    ],
    blocks: (d, ctx) => {
      crWfCtx.current = ctx;
      return [
        { type: "note", span: 6, icon: "lock-key", text: "Members sign in with their printed ID and a 6-digit Wi-Fi PIN, which they see in the app under Me → Wi-Fi and can change three times a day. The PIN is only for the Wi-Fi.",
          sub: "Somebody can’t get on? Look them up: it says whether they are on the list and why." },
        d.forms.access,
        d.forms.speeds,
      ];
    },
  },

  "wifi-guides": {
    skeleton: ["table", "cards"],
    load: crWfLoad,
    actions: (d, ctx) => [
      { l: "Add a gateway", icon: "plus", primary: true, disabled: !(d.centres || []).length, why: (d.centres || []).length ? "" : "Add a centre first (Members → Centres).", run: () => crWfEdit(ctx, d, null) },
    ],
    blocks: (d, ctx) => {
      crWfCtx.current = ctx;
      const pl = d.platforms || [];
      return [
        { type: "note", span: 6, icon: "path", text: "How it fits together: NGG can’t reach a centre’s network, so each centre’s gateway fetches its list from NGG over HTTPS, with its own key that never appears in an address. Add a gateway to get the step-by-step guide and the script for its platform, with its key filled in.",
          sub: "Every script is safe to run again, and only touches what it added itself." },
        { type: "table", span: 6, title: "Which gateway", sub: "Speeds per person · devices at once · signs out somebody removed · remembers the device · filtering for under-18s", nosel: true,
          cols: ["Platform", "Status"].concat(CR_WF_CAN.map(c => c[1])),
          rows: pl.map(p => ({ key: p.id, cells: [{ k: "strong", t: p.label }, { k: "status", t: p.status === "pilot" ? "Pilot first" : "Ready", tone: p.status === "pilot" ? "warn" : "ok" }]
            .concat(CR_WF_CAN.map(c => ({ k: "status", t: p.can[c[0]] ? "Yes" : "No", tone: p.can[c[0]] ? "ok" : "neutral" }))) })),
          emptyText: "" },
        { type: "cards", span: 6, title: "What each needs", empty: "",
          cards: pl.map(p => ({ icon: crWfIcon(p.id), title: p.label, sub: p.needs, tag: p.status === "pilot" ? "Pilot first" : "Ready", tone: p.status === "pilot" ? "warn" : "ok" })) },
        { type: "list", span: 6, title: "Before rolling one out", sub: "Prove it at one centre first",
          rows: pl.filter(p => p.pilot).map(p => ({ icon: crWfIcon(p.id), t: p.label, s: p.pilot })), empty: "" },
        { type: "note", span: 6, icon: "shield-check", text: "Hours are kept by NGG for every platform: outside a profile’s hours, people are left off the list and signed out at the next fetch.",
          sub: "Filtering for under-18s (the MikroTik script): a family DNS service, SafeSearch, YouTube Restricted, DNS forced through the router and private DNS closed. Mobile data and phone hotspots go around any of it." },
        { type: "note", span: 6, icon: "eye-slash", text: "Gateways never send NGG which sites anybody visits, and NGG keeps no record of it.",
          sub: "Filtering needs no such record, and under the Nigeria Data Protection Act a record of where a child goes online would need their guardian’s consent and a privacy impact assessment first." },
      ];
    },
  },
});
