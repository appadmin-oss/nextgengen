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
  out_of_scope: "That gateway is at a centre you don’t look after.",
  count_changed: "The list changed while you were deciding. Look again and confirm.",
  too_many: "That is more than can be done in one go.",
  nothing_selected: "Choose at least one gateway.",
  bad_platform: "Choose what the gateway is.",
  bad_centre: "Choose a centre that is in use.",
  bad_profile: "Check the speeds, devices and hours.",
  case_locked: "Suspended, evicted and inactive records are always off.",
  too_many_resets: "That password has been changed three times today. Try again tomorrow.",
  weak_password: "That password won’t do: at least 8 characters, no spaces or semicolons, not the sign-in name.",
  own_password: "Members set their own Wi-Fi password in the app. You can clear it so they choose a new one.",
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
const crWfDays = { current: 30 };   // the Analytics period, kept while the Control Room is open

/* ── Gateways ─────────────────────────────────────────────────────────────── */

/* The guide for one gateway: steps and a script from the server. With `key`
   (just added or rotated) the script carries it; otherwise it says where. */
/* A setup file saved to the computer, for WinBox → Files and /import file-name=ngg-wifi.rsc. */
function crWfSaveFile(text, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function crWfGuide(ctx, g, key) {
  let s;
  try { s = await NGGApi.admin.wifi.setup(g.gatewayId); }
  catch (e) { ctx.toast(crWfErr(e, "Couldn’t open the setup guide."), null, true); return; }
  const fill = t => key ? String(t || "").split("PASTE-THE-KEY-HERE").join(key) : String(t || "");
  const script = fill(s.script);
  /* The guide reads top to bottom as the job is done (owner, 2026-10-28: "not
     very clear"): what this does and how long, what you need, numbered steps
     with each command — and the script — inside the step that uses it, what
     the gateway sends NGG, and each problem beside its fix. */
  const steps = [];
  (s.steps || []).forEach((st, i) => {
    steps.push({ h: "Step " + (i + 1) + " · " + st.h, text: fill(st.text) || null, code: st.script ? script : (fill(st.cmd) || null), codeLabel: st.script ? s.scriptName : "Commands for step " + (i + 1), tip: st.tip || null });
    if (st.script && st.cmd) steps.push({ text: "Then run:", code: fill(st.cmd), codeLabel: "Commands for step " + (i + 1) });
  });
  ctx.drawer({
    title: key ? "Set up " + crWfName(g) + " now" : "Setup guide · " + crWfName(g), icon: "book-open",
    sub: s.label + " · " + g.centre + (s.time ? " · " + s.time : ""),
    sections: [
      { h: "What this does", text: s.summary || s.needs },
      key ? { h: "This gateway’s key — shown once", text: key + "\n\nIt is already in the script. Afterwards only its last four characters are shown; if it is lost, rotate it and this guide opens again with the new one filled in." }
        : { h: "The key", text: "The script has PASTE-THE-KEY-HERE where the key goes. Keys are shown once: if this gateway’s is lost, rotate it and the guide opens again with the new one filled in." },
      s.pilot ? { h: "Pilot first", text: s.pilot } : null,
      (s.before || []).length ? { h: "You’ll need", list: s.before.map(t => ({ icon: "check", t })) } : null,
      ...steps,
      s.reports ? { h: "What it sends NGG", text: s.reports } : null,
      (s.trouble || []).length ? { h: "If something goes wrong", rows: s.trouble } : null,
    ].filter(Boolean),
    actions: [
      // MikroTik installs with ONE line (the router downloads its own file); the file is offered for a router that can't fetch.
      s.oneLiner ? { l: "Copy the install line", primary: true, run: () => crSyCopy(ctx, fill(s.oneLiner), "Install line") } : null,
      s.oneLiner && script ? { l: "Download the setup file", run: () => crWfSaveFile(script, "ngg-wifi.rsc") } : null,
      script && !s.oneLiner ? { l: "Copy the script", primary: true, run: () => crSyCopy(ctx, script, "Script") } : null,
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

/* Moving a router to CACENTRE, which runs the Wi-Fi (domain/wifi-cacentre.php).
   Shown only once NGG is connected: the steps, then one press here to say it
   is done. Marked moved, NGG stops watching it and its centre's members see
   the password they set, kept by CACENTRE; "Back to NGG" undoes it with a full list. */
function crWfCacMoveSteps(c, g) {
  if (!c || !c.configured || g.movedAt) return null;
  const code = (c.sites || {})[g.centre] || "";
  return { h: "Moving it to CACENTRE", rows: [
    ["1 · At CACENTRE", "Admin → Wi-Fi → Sites & routers. Add a site with the code " + (code ? "“" + code + "”" : "of this centre’s card code, in small letters") + " if it isn’t there, then Add a router for it."],
    ["2 · On this router", "Paste the one line CACENTRE shows. It removes NGG’s script and users and installs CACENTRE’s; nobody is cut off for more than a minute."],
    ["3 · Here", "Press “It now runs from CACENTRE”. NGG stops watching it, and members at " + g.centre + " use the password they set, now kept by CACENTRE."],
  ] };
}
function crWfCacMoveAct(ctx, c, g) {
  if (!c || !c.configured) return null;
  if (g.movedAt) return { l: "Back to NGG", run: async () => {
    const ok = await ctx.confirm({ title: "Put " + crWfName(g) + " back on NGG?", cta: "Back to NGG",
      body: "Only if NGG’s setup is on the router again. NGG sends it a full list at its next fetch, and members at " + g.centre + " sign in here again with the password they set." });
    if (!ok) return;
    try { await NGGApi.admin.wifi.gatewayMoved(g.gatewayId, true); ctx.toast(crWfName(g) + " is back on NGG."); ctx.closeDrawer(); ctx.reload(); }
    catch (e) { ctx.toast(crWfErr(e, "Couldn’t change it."), null, true); }
  } };
  return { l: "It now runs from CACENTRE", run: async () => {
    const ok = await ctx.confirm({ title: crWfName(g) + " runs from CACENTRE now?", cta: "It runs from CACENTRE",
      body: "Press this once CACENTRE’s one line has been pasted on the router. NGG stops watching it, and members at " + g.centre + " use the password they set, now kept by CACENTRE. If NGG’s script is in fact still on it, it keeps its people and logs that it has moved." });
    if (!ok) return;
    try { await NGGApi.admin.wifi.gatewayMoved(g.gatewayId, false); ctx.toast(crWfName(g) + " runs from CACENTRE now."); ctx.closeDrawer(); ctx.reload(); }
    catch (e) { ctx.toast(crWfErr(e, "Couldn’t change it."), null, true); }
  } };
}

async function crWfRotate(ctx, g) {
  const ok = await ctx.confirm({ title: "Rotate the key for " + crWfName(g) + "?", danger: true, cta: "Rotate the key",
    body: "The old key stops working at once. Until the setup is run again with the new key, the gateway keeps the people it already has but gets no changes — nobody new can sign in and nobody suspended is removed." });
  if (!ok) return;
  try { const r = await NGGApi.admin.wifi.gatewayRotate(g.gatewayId); ctx.closeDrawer(); ctx.reload(); crWfGuide(ctx, r.gateway, r.key); }
  catch (e) { ctx.toast(crWfErr(e, "Couldn’t rotate the key."), null, true); }
}

/* One bulk act over gateways (admin.wifi.gateways.bulk): `test` asks each for
   a line test at its next fetch; `rotate` gives each a new key, listed once.
   The count is read before the confirm and sent back as `expect`, so a list
   that changed underneath is refused rather than acted on. */
async function crWfBulk(ctx, verb, target, count, what) {
  if (!count) { ctx.toast("There are no gateways " + what + ".", null, true); return; }
  const rot = verb === "rotate";
  const ok = await ctx.confirm(rot
    ? { title: "New keys for " + crPlural(count, "gateway") + " " + what + "?", danger: true, cta: "Rotate " + crPlural(count, "key"),
        body: "Every old key stops working at once. Until each router’s setup is run again with its new key, it keeps the people it has but gets no changes. The new keys are shown once, next." }
    : { title: "Ask " + crPlural(count, "gateway") + " " + what + " for a line test?", cta: "Ask for " + crPlural(count, "test"),
        body: "Each measures its internet line at its next fetch, within five minutes, and the result appears under Speed & health." });
  if (!ok) return;
  let r;
  try { r = await NGGApi.admin.wifi.bulk(verb, target, count); }
  catch (e) { ctx.toast(crWfErr(e, "Couldn’t do that."), null, true); ctx.reload(); return; }
  const failed = (r.results || []).filter(x => !x.ok);
  const said = crNum(r.applied) + (rot ? " rotated" : " asked") + (r.unchanged ? " · " + crNum(r.unchanged) + " already asked" : "") + (r.refused ? " · " + crNum(r.refused) + " refused" : "");
  ctx.reload();
  if (!rot) { ctx.toast(said, null, !!r.refused); return; }
  const keyed = (r.results || []).filter(x => x.key);
  const csv = "gateway,label,centre,key\n" + keyed.map(x => [x.gatewayId, x.label, x.centre, x.key].map(v => '"' + String(v || "").replace(/"/g, '""') + '"').join(",")).join("\n");
  ctx.drawer({ title: "The new keys", sub: said + " · shown once", icon: "key",
    sections: [
      { h: "Paste each into its router’s setup", rows: keyed.map(x => [crWfName(x) + " · " + x.centre, x.key]), empty: "No key was changed." },
      failed.length ? { h: "Refused", rows: failed.map(x => [x.gatewayId, crWfErr({ code: x.error }, x.error)]) } : null,
      { h: "Keep them safe", text: "Anybody with a key can read that centre’s list. Copy them now: once this closes they can’t be shown again, only rotated." },
    ].filter(Boolean),
    actions: [{ l: "Copy all as CSV", primary: true, run: () => { try { navigator.clipboard.writeText(csv); ctx.toast("Copied " + crPlural(keyed.length, "key")); } catch (_) { ctx.toast("Couldn’t copy. Select and copy them instead.", null, true); } } },
      { l: "Done", run: () => ctx.closeDrawer() }] });
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
    title: "What " + crWfName(g) + " holds", sub: "Worked out now, from people’s records", icon: "list-checks",
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
    title: crWfName(g), sub: g.platformLabel + " · " + g.centre + (g.pilot ? " · pilot" : ""), icon: crWfIcon(g.platform),
    stats: [["Online now", g.stats && g.stats.active != null ? crNum(g.stats.active) : "—"], ["Line", g.speed ? crWfMbps(g.speed.downMbps) : "Not measured"], ["Last fetch", g.lastSeenAt ? crAgo(g.lastSeenAt) : "Never"]],
    sections: [
      { h: "How it is", rows: (g.diagnosis || []).map(x => [x.title, x.fix]), empty: "Nothing to report." },
      crWfCacMoveSteps(d.cacentre, g),
      g.fair ? { h: "At the busiest hour this week", rows: [["People online at once", crNum(g.fair.peak)], ["Each could get", crWfMbps(g.fair.each)], ["A fair member speed", crWfMbps(g.fair.suggestMember) + " with burst on"]] } : null,
      g.stats ? { h: "What it reported", rows: [["CPU", g.stats.cpu != null ? g.stats.cpu + "%" : "—"], ["Free memory", g.stats.memFree != null ? g.stats.memFree + " MB" : "—"], ["Up for", g.stats.uptime != null ? crWfDur(g.stats.uptime) : "—"], ["Reported", crAgo(g.stats.at)]] } : null,
    ].filter(Boolean),
    fields: [["Centre", g.centre], ["Platform", g.platformLabel], ["Reported version", g.osVersion || "Not reported"], ["Key", "…" + g.keyTail + " · set " + crDate(g.keySetAt)],
      ["Last full list", g.lastFullAt ? crDate(g.lastFullAt, true) : "Not yet"], ["Last change sent", g.lastChangeAt ? crDate(g.lastChangeAt, true) : "None yet"], ["Added", crDate(g.createdAt)]],
    actions: [
      { l: "Setup guide", primary: !g.lastSeenAt, run: () => crWfGuide(ctx, g) },
      { l: "What it holds", primary: !!g.lastSeenAt, run: () => crWfPreview(ctx, g) },
      g.platform === "mikrotik" ? { l: g.testAsked ? "Line test asked for" : "Test the line", disabled: !!g.testAsked, why: "It runs at the gateway’s next fetch, within a few minutes.", run: async () => {
        try { await NGGApi.admin.wifi.testAtNextFetch(g.gatewayId); ctx.toast("Asked. " + crWfName(g) + " tests its line at its next fetch, within a few minutes."); ctx.closeDrawer(); ctx.reload(); }
        catch (e) { ctx.toast(crWfErr(e, "Couldn’t ask for a test."), null, true); }
      } } : null,
      crWfCacMoveAct(ctx, d.cacentre, g),
      { l: "Edit", run: () => crWfEdit(ctx, d, g) },
      { l: "Rotate the key", run: () => crWfRotate(ctx, g) },
      { l: "Remove", run: () => crWfRemove(ctx, g) },
    ].filter(Boolean),
  });
}

const crWfUsePeriod = { current: "month" };   // the Data used period, kept while the Control Room is open
const crWfBytes = b => { b = +b || 0; return b >= 1073741824 ? (Math.round(b / 107374182.4) / 10) + " GB" : b >= 1048576 ? Math.round(b / 1048576) + " MB" : b > 0 ? Math.max(1, Math.round(b / 1024)) + " KB" : "0"; };
function crWfUseOpen(ctx, r, allowance) {
  ctx.drawer({ title: r.name, sub: (r.id ? r.id + " · " : "") + (r.centre || ""), icon: "chart-bar",
    stats: [["Today", crWfBytes(r.today)], ["This month", crWfBytes(r.month)], ["In this view", crWfBytes(r.bytes)]],
    sections: [
      { h: "Allowance", rows: [["Their allowance", allowance], ["Now", r.over ? "Over " + (r.over === "day" ? "today’s" : "this month’s") + " allowance" : "Within it"]] },
      { h: "In this view", rows: [["Downloaded", crWfBytes(r.down)], ["Uploaded", crWfBytes(r.up)]] },
      { text: "To let them carry on, look them up under “Why can’t somebody get on?” and set their Wi-Fi to On by hand, with a reason. It stays until you clear it." },
    ],
    actions: [{ l: "Why can’t somebody get on?", primary: true, run: () => { ctx.closeDrawer(); crWfLookup(ctx); } }] });
}
const crWfMbps = x => (x == null ? "—" : (Math.round(x * 10) / 10) + " Mbit/s");
const crWfDur = s => s < 3600 ? Math.max(1, Math.round(s / 60)) + " min" : s < 172800 ? Math.round(s / 3600) + " h" : Math.round(s / 86400) + " days";

/* ── Speed & health ───────────────────────────────────────────────────────── */

/* Measure the line from this device, at a centre, and keep the result. */
function crWfSpeedTest(ctx, d) {
  const centres = d.centres || [];
  ctx.form({
    title: "Test this connection", submit: "Start the test", busyLabel: "Testing… about 20 seconds",
    intro: "Run it on the centre’s Wi-Fi, from where people sit. It measures this device’s line to NGG — the delay, download and upload — and keeps the result for the centre. It uses about 20 MB.",
    values: { centre: centres[0] || "", note: "" },
    fields: [
      { id: "centre", l: "Which centre are you at?", type: "select", req: true, opts: centres.map(c => [c, c]) },
      { id: "note", l: "Where and when", max: 200, ph: "e.g. Main hall, Saturday 10am, about 30 people on" },
    ],
    onSubmit: async v => {
      let r;
      try { r = await NGGApi.admin.wifi.speedTest(); }
      catch (e) { throw new Error(e && e.code === "rate_limited" ? "Too many tests in a few minutes. Try again in ten." : "The test couldn’t finish — is this device online? (" + ((e && (e.code || e.message)) || "no answer") + ")"); }
      await NGGApi.admin.wifi.speedSave({ centre: v.centre, note: v.note, downMbps: r.downMbps, upMbps: r.upMbps, rttMs: r.rttMs });
      return r;
    },
    done: (v, r) => {
      ctx.reload();
      const slow = r.downMbps < (d.slowMbps || 5);
      setTimeout(() => ctx.drawer({
        title: (slow ? "Slow: " : "") + crWfMbps(r.downMbps) + " down", sub: v.centre + (v.note ? " · " + v.note : ""), icon: "gauge",
        stats: [["Download", crWfMbps(r.downMbps)], ["Upload", crWfMbps(r.upMbps)], ["Delay", r.rttMs + " ms"]],
        sections: [{ h: "What it means", text: (slow ? "Below " + (d.slowMbps || 5) + " Mbit/s, lessons and videos stall. " : "")
          + (r.rttMs > 300 ? "A delay over 300 ms makes pages feel slow even when the speed is fine — usually a busy or distant connection. " : "")
          + "One test is a snapshot: test again at a busy and a quiet time to tell the line from the crowd. Kept under Speed & health." }],
        actions: [{ l: "Test again", primary: true, run: () => { ctx.closeDrawer(); crWfSpeedTest(ctx, d); } }, { l: "Done", run: () => ctx.closeDrawer() }],
      }), 50);
      return "Saved · " + v.centre;
    },
  });
}

/* ── Who gets on ──────────────────────────────────────────────────────────── */

/* One person: what they have and why, and — for whoever owns their record —
   a hand-set override with a reason, clearing their Wi-Fi password so they
   choose a new one, or — for a Summer School participant, who may have no
   app — setting one with them. Members set their own in the app. */
function crWfPerson(ctx, x) {
  /* From the lookup, a record owner first reads the person whole: where
     CACENTRE runs the centre's Wi-Fi, that brings the starting password the
     desk hands over at registration. */
  if (x.canChange && x.cacentre === undefined && !x.read) {
    return NGGApi.admin.wifi.member(x.subjectType, x.subjectId)
      .then(r => crWfPerson(ctx, Object.assign({}, x, r.wifi, { pin: "", read: true })))
      .catch(() => crWfPerson(ctx, Object.assign({}, x, { read: true })));
  }
  const acc = CR_WF_ACCESS.find(a => a[0] === x.access) || [x.access, x.access];
  const ov = x.override;
  const act = async (op, extra, msg) => {
    try { const r = await NGGApi.admin.wifi.memberSet(x.subjectType, x.subjectId, op, extra); ctx.toast(typeof msg === "function" ? msg(r.wifi || {}) : msg); crWfPerson(ctx, Object.assign({}, x, r.wifi, { pin: "", read: true })); }
    catch (e) { ctx.toast(crWfErr(e, "Couldn’t change it."), null, true); }
  };
  const pwField = !x.cacentre ? ["Wi-Fi password", x.hasPassword ? "Set" + (x.pinSetAt ? " · " + crDate(x.pinSetAt, true) : "") : "Not set yet"]
    : x.cacentreError ? ["Wi-Fi password", x.cacentreError === "not_listed" ? "Not on CACENTRE’s Wi-Fi list yet" : "CACENTRE couldn’t be reached just now"]
    : x.startCode ? ["Starting password", x.startCode + " — give it to them in person"]
    : ["Wi-Fi password", x.ownPassword ? "Their own" + (x.pinSetAt ? " · set " + crDate(x.pinSetAt, true) : "") : "Not set yet"];
  ctx.drawer({
    title: x.name, sub: (x.subjectType === "summer" ? "Summer School participant" : "Member") + " · " + (x.centre || "no centre"),
    stats: [["Wi-Fi", acc[1]], ["Sign-in name", x.username || "—"], ["Centre has Wi-Fi", x.centreHasWifi ? "Yes" : "Not yet"]],
    fields: [["Why", x.why || "—"], x.limits ? ["Speed", x.limits.down + " Mbit/s down · " + x.limits.up + " up · " + crPlural(x.limits.devices, "device") + (x.limits.hours ? " · " + x.limits.hours : "")] : null,
      pwField, ov ? ["Set by hand", ov.access + " — “" + ov.why + "” · " + crDate(ov.at)] : null].filter(Boolean),
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
      x.cacentre && !x.cacentreError && x.access !== "off" ? { l: "New starting password", run: async () => {
        const ok = await ctx.confirm({ title: "Make a new starting password for " + x.name + "?", body: "The one they have now stops working within a few minutes.", cta: "Make a new one", danger: true });
        if (!ok) return;
        act("clearPassword", null, w => w.startCode ? "New starting password for " + x.name + ": " + w.startCode : "Done · " + x.name);
      } }
      : !x.cacentre && x.hasPassword ? { l: "Clear their password", run: () => act("clearPassword", null, "Password cleared. " + x.name + " chooses a new one" + (x.subjectType === "summer" ? " with you." : " in the app under Me → Wi-Fi.")) } : null,
      x.subjectType === "summer" && x.access !== "off" ? { l: x.hasPassword ? "Change their password…" : "Set their password…", run: () => {
        ctx.closeDrawer();
        ctx.form({ title: "Wi-Fi password for " + x.name, submit: "Save", busyLabel: "Saving…",
          intro: "Type it with them, so only they know it. At least 8 characters, no spaces or semicolons. It is never shown again.",
          values: { password: "" },
          fields: [{ id: "password", l: "Password", type: "password", req: true, max: 64, check: w => String(w || "").length < 8 ? "Use at least 8 characters." : /[\s;]/.test(String(w)) ? "Leave out spaces and semicolons." : "" }],
          onSubmit: async v => { try { return await NGGApi.admin.wifi.memberSet(x.subjectType, x.subjectId, "setPassword", { password: v.password }); } catch (e) { throw new Error(crWfErr(e, "Couldn’t save.")); } },
          done: (v, r) => { setTimeout(() => crWfPerson(ctx, Object.assign({}, x, r.wifi, { pin: "" })), 50); return "Password set · " + x.name; } });
      } } : null,
    ].filter(Boolean) : [],
  });
}

function crWfLookup(ctx) {
  ctx.form({
    title: "Why can’t somebody get on?", submit: "Look them up", busyLabel: "Looking…",
    intro: "Their printed ID, record id or name. You see whether they have Wi-Fi, and why — never their password.",
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
          sections: [{ h: "People", list: res.map(x => ({ icon: x.access === "off" ? "wifi-slash" : "wifi-high", t: x.name + " · " + (x.username || x.subjectId), s: (CR_WF_ACCESS.find(a => a[0] === x.access) || [0, x.access])[1] + " — " + (x.why || ""), act: { l: "Open their Wi-Fi", run: () => crWfPerson(ctx, x) } })),
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
    type: "form", span: 6, key: "wifi-speeds", title: "Speeds, devices, hours and data allowances",
    groups: Object.keys(profiles).map(k => ({ h: CR_WF_PROFILE_WORDS[k] || k, help: k === "ngg-limited" ? "Anybody whose access is “Limited”." : k === "ngg-guest" ? "For day passes, which come later." : "",
      rows: [
        { id: k + "|down", l: "Download (Mbit/s)", c: "input", type: "number", value: String(profiles[k].down), check: n(1, 1000) },
        { id: k + "|up", l: "Upload (Mbit/s)", c: "input", type: "number", value: String(profiles[k].up), check: n(1, 1000) },
        { id: k + "|devices", l: "Devices at once", c: "input", type: "number", value: String(profiles[k].devices), check: n(1, 5) },
        { id: k + "|hours", l: "Hours", help: "Blank for all day. Kept by NGG: outside them, people are signed out at the next fetch.", c: "input", value: profiles[k].hours || "", check: hours },
        { id: k + "|burst", l: "Fast page loads (burst)", help: "Twice the speed for the first few seconds, so pages open quickly; long downloads settle at the steady rate. MikroTik.", c: "toggle", value: !!profiles[k].burst },
        { id: k + "|priority", l: "When the line is busy", c: "select", value: String(profiles[k].priority || 5), opts: [["1", "1 · first"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5 · middle"], ["6", "6"], ["7", "7"], ["8", "8 · last"]], help: "Who is served first when everybody wants the line at once. MikroTik." },
      ].concat(k === "ngg-limited" ? [] : [
        { id: k + "|dayMb", l: "Data allowance a day (MB)", help: "0 for none. Over it, the “Used up their data allowance” setting in Who gets on applies (Limited, unless you change it). 1 GB is 1024 MB.", c: "input", type: "number", value: String(profiles[k].dayMb || 0), check: n(0, 10000000) },
        { id: k + "|monthMb", l: "Data allowance a month (MB)", help: "0 for none. Counted across every centre, from the 1st.", c: "input", type: "number", value: String(profiles[k].monthMb || 0), check: n(0, 10000000) },
      ]) })),
    save: async (patch, all) => {
      const out = { profiles: {} };
      Object.keys(patch).forEach(id => { const k = id.split("|")[0]; out.profiles[k] = { down: +all[k + "|down"], up: +all[k + "|up"], devices: +all[k + "|devices"], hours: String(all[k + "|hours"] || "").trim(), burst: !!all[k + "|burst"], priority: +all[k + "|priority"], dayMb: +(all[k + "|dayMb"] || 0), monthMb: +(all[k + "|monthMb"] || 0) }; });
      try { await NGGApi.admin.wifi.accessSet(out); } catch (e) { throw new Error(crWfErr(e, "Couldn’t save.")); }
    },
    onSaved: () => crWfCtx.current && crWfCtx.current.reload(),
  };
  return { access, speeds };
}

/* ── Regions ──────────────────────────────────────────────────────────────── */

function crWfRegionEdit(ctx, r) {
  ctx.form({ title: r ? "Rename " + r.name : "New region", submit: r ? "Save" : "Make the region", busyLabel: "Saving…",
    intro: "A Wi-Fi region groups centres for their Wi-Fi: who looks after them, their speeds, their health at a glance.",
    values: r ? { name: r.name, code: r.code, note: r.note } : {},
    fields: [{ id: "name", l: "Name", req: true, max: 120, ph: "e.g. Lagos West" }, { id: "code", l: "Short code", max: 8, ph: "e.g. LW" }, { id: "note", l: "Note", max: 255 }],
    onSubmit: async v => { try { return await NGGApi.admin.wifi.regionSave({ regionId: r ? r.regionId : undefined, name: v.name, code: v.code, note: v.note }); }
      catch (e) { if (e && e.data && e.data.error === "name_taken") return { fieldErrors: { name: "There is already a region with that name." } }; throw e; } },
    done: v => { ctx.reload(); return (r ? "Saved · " : "Made · ") + v.name; } });
}

function crWfRegionOpen(ctx, r, shape) {
  ctx.drawer({ title: r.name, sub: crPlural(r.centres, "centre") + " · " + crPlural(r.gateways, "gateway"), icon: "map-trifold",
    stats: [["Working", crNum(r.working)], ["Not working", crNum(r.bad)], ["Online now", crNum(r.online)]],
    fields: [["Short code", r.code || "—"], ["Leads", r.leads.map(l => l.name).join(", ") || "None yet"], ["Note", r.note || "—"]],
    actions: [
      { l: "Region speeds", primary: true, run: () => crWfSpeedsFor(ctx, { regionId: r.regionId }, r.name) },
      { l: "Line test, every gateway", run: () => { ctx.closeDrawer(); crWfBulk(ctx, "test", { regionId: r.regionId }, r.gateways, "in " + r.name); } },
      { l: "New keys, every gateway", run: () => { ctx.closeDrawer(); crWfBulk(ctx, "rotate", { regionId: r.regionId }, r.gateways, "in " + r.name); } },
      shape ? { l: "Leads", run: async () => {
        let o; try { o = await NGGApi.admin.wifi.leadOptions(); } catch (e) { ctx.toast(crWfErr(e, "Couldn’t load the staff."), null, true); return; }
        ctx.form({ title: "Who leads " + r.name, submit: "Save leads", intro: "A lead sees this region’s centres in Wi-Fi and sets its speeds. Only staff holding the network capability can lead.",
          values: { ids: r.leads.map(l => l.memberId) }, fields: [{ id: "ids", l: "Leads", type: "multi", opts: (o.staff || []).map(x => [x.memberId, x.name + " · " + x.role]) }],
          onSubmit: async v => NGGApi.admin.wifi.regionLeads(r.regionId, v.ids || []), done: () => { ctx.reload(); return "Leads saved · " + r.name; } });
      } } : null,
      shape ? { l: "Rename", run: () => { ctx.closeDrawer(); crWfRegionEdit(ctx, r); } } : null,
      shape ? { l: "Remove", run: async () => {
        if (!(await ctx.confirm({ title: "Remove " + r.name + "?", danger: true, cta: "Remove the region", body: "Its centres stay as they are, in no region; the region’s own speeds and leads go. Gateways keep working." }))) return;
        try { await NGGApi.admin.wifi.regionRemove(r.regionId); ctx.closeDrawer(); ctx.toast("Removed · " + r.name); ctx.reload(); } catch (e) { ctx.toast(crWfErr(e, "Couldn’t remove it."), null, true); }
      } } : null,
    ].filter(Boolean) });
}

async function crWfRegionAssign(ctx, regions) {
  let c;
  try { c = await NGGApi.admin.wifi.centres({ region: "_none", idsOnly: 1, pageSize: 1 }); } catch (e) { ctx.toast(crWfErr(e, "Couldn’t load the centres."), null, true); return; }
  const free = c.all || [];
  ctx.form({ title: "Put centres in a region", submit: "Put them there", busyLabel: "Moving…",
    intro: free.length ? crPlural(free.length, "centre is", "centres are") + " in no region. Choose some, and the region they go in." : "Every centre is in a region. To move one, choose it from every centre.",
    values: { region: regions[0].regionId, centres: [] },
    fields: [{ id: "region", l: "Region", type: "select", req: true, opts: regions.map(r => [r.regionId, r.name]) }, { id: "centres", l: "Centres", type: "multi", opts: free.map(x => [x, x]) }],
    onSubmit: async v => { if (!(v.centres || []).length) return { fieldErrors: { centres: "Choose at least one centre." } }; return NGGApi.admin.wifi.regionAssign(v.region, v.centres); },
    done: (v, r) => { ctx.reload(); return crNum(r.applied) + " moved" + (r.refused ? " · " + crNum(r.refused) + " refused" : ""); } });
}

/* A region's or a centre's own speeds: only what is set here is kept here. */
async function crWfSpeedsFor(ctx, where, name) {
  let d;
  try { d = await NGGApi.admin.wifi.profilesFor(where); } catch (e) { ctx.toast(crWfErr(e, "Couldn’t load the speeds."), null, true); return; }
  const eff = d.effective || {}, own = d.own || {}, values = {}, fields = [];
  const n = (lo, hi) => (x, v) => /^\d+$/.test(String(x).trim()) && +x >= lo && +x <= hi ? "" : "A whole number from " + lo + " to " + hi + ".";
  Object.keys(eff).forEach(k => {
    values[k + "|own"] = !!own[k]; values[k + "|down"] = String(eff[k].down); values[k + "|up"] = String(eff[k].up); values[k + "|devices"] = String(eff[k].devices);
    const on = v => !!v[k + "|own"];
    fields.push({ id: k + "|own", l: (CR_WF_PROFILE_WORDS[k] || k) + " — set here", type: "switch", help: own[k] ? "Set here." : "Follows " + ((d.from || {})[k] || "the network") + ": " + eff[k].down + "/" + eff[k].up + " Mbit/s, " + crPlural(eff[k].devices, "device") + "." });
    fields.push({ id: k + "|down", l: "Download (Mbit/s)", type: "number", when: on, check: (x, v) => on(v) ? n(1, 1000)(x) : "" });
    fields.push({ id: k + "|up", l: "Upload (Mbit/s)", type: "number", when: on, check: (x, v) => on(v) ? n(1, 1000)(x) : "" });
    fields.push({ id: k + "|devices", l: "Devices at once", type: "number", when: on, check: (x, v) => on(v) ? n(1, 5)(x) : "" });
  });
  ctx.closeDrawer();
  ctx.form({ title: "Speeds · " + name, submit: "Save speeds", busyLabel: "Saving…", intro: "Anything not set here follows " + (d.level === "centre" ? "the region, then the network" : "the network") + ".", values, fields,
    onSubmit: async v => { const out = {}; Object.keys(eff).forEach(k => { out[k] = v[k + "|own"] ? { down: +v[k + "|down"], up: +v[k + "|up"], devices: +v[k + "|devices"] } : null; }); return NGGApi.admin.wifi.profilesSet(where, out); },
    done: () => "Speeds saved · " + name });
}

/* What the feed costs this host (admin.wifi.load): measured per fetch, and
   projected at the planned size, before more than one pilot region goes live. */
const CR_WF_LOAD_WORDS = { unmeasured: ["Not measured yet", "warn"], fine: ["Within budget", "ok"], watch: ["Close to the budget", "warn"], too_much: ["Over budget", "bad"] };
function crWfLoadBlocks(L) {
  const m = L.measured, p = L.plan, w = CR_WF_LOAD_WORDS[p.verdict] || CR_WF_LOAD_WORDS.unmeasured;
  return [
    { type: "note", span: 6, icon: w[1] === "ok" ? "gauge" : "warning-circle", text: "Server load · " + w[0] + ". " + p.advice,
      sub: "What gateways’ fetches cost this host over the last 24 hours, and at " + crNum(p.gateways) + " gateways fetching every " + Math.round(p.poll / 60) + " minutes. "
        + crPlural(L.regionsLive, "region has", "regions have") + " gateways connected now." },
    { type: "kpis", span: 6, items: [
      { l: "Fetches, last 24 hours", v: crNum(m.fetches), dn: m.rps + " a second · " + crNum(m.failed) + " refused" },
      { l: "Time per fetch", v: m.fetches ? m.avgMs + " ms" : "—", dn: m.fetches ? "95% under " + m.p95Ms + " ms · slowest " + m.maxMs + " ms" : "nothing measured yet" },
      { l: "At the planned size", v: p.rps + " a second", dn: Math.round(p.busy * 100) + "% of one worker · budget " + Math.round(p.budget * 100) + "%", tone: p.verdict === "too_much" ? "down" : "flat" },
    ] },
  ];
}

/* ── Setup guides ─────────────────────────────────────────────────────────── */

const CR_WF_CAN = [["profiles", "Speeds"], ["devices", "Devices"], ["kick", "Signs out"], ["remember", "Remembers"], ["filter", "Filtering"], ["usage", "Data used"]];

const crWfLoad = async () => {
  const [d, cac] = await Promise.all([NGGApi.admin.wifi.overview(), NGGApi.admin.wifi.cacentre().catch(() => null)]);
  d.forms = crWfForms(d);
  d.cacentre = cac;
  return d;
};

/* CACENTRE runs the Wi-Fi for the estate; NGG sends its people and its say
   about each (domain/wifi-cacentre.php). Why a push failed, in words. */
const CR_WF_CAC_ERR = {
  unreachable: "CACENTRE couldn’t be reached. It is tried again at the next push.",
  bad_signature: "The gate doesn’t recognise NGG’s attendance secret. hooks.attendance_secret here must be the same value as NGG_SECRET on the gate.",
  not_configured: "Attendance isn’t connected here yet: hooks.attendance_secret (the gate secret) is empty.",
  replayed: "The gate saw that request already. It is sent again at the next push.",
  expired: "The two servers’ clocks disagree by more than five minutes.",
  bad_window: "The two servers’ clocks disagree by more than five minutes.",
  too_many: "The list was longer than one push may carry.",
};
/* Everybody still on a starting password, within the admin's centres: members
   with no email, or whose email never arrives, are handed theirs by a person.
   They are also shown at the gate's desk when the member checks in. */
async function crWfStarts(ctx) {
  let r;
  try { r = await NGGApi.admin.wifi.cacentreStarts(); } catch (e) { return ctx.toast(crWfErr(e, "Couldn’t fetch the starting passwords."), null, true); }
  if (!r || !r.ok) return ctx.toast(CR_WF_CAC_ERR[r && r.error] || "CACENTRE refused: " + (r && r.error), null, true);
  const ppl = r.people || [];
  const tsv = ["Centre\tName\tPrinted ID\tSign-in name\tStarting password"].concat(ppl.map(x => [x.centre, x.name, x.printedId, x.username, x.code].join("\t"))).join("\n");
  ctx.drawer({
    title: ppl.length ? crPlural(ppl.length, "person", "people") + " still on a starting password" : "Nobody is on a starting password",
    sub: "Within your centres. Hand each person theirs; once they choose their own, they leave this list.",
    sections: [{ h: "People", list: ppl.map(x => ({ icon: "key", t: x.name + (x.printedId ? " · " + x.printedId : ""), s: (x.centre ? x.centre + " — " : "") + "Sign-in name " + x.username + " · password " + x.code })),
      empty: "Everybody has chosen their own password." }],
    actions: ppl.length ? [{ l: "Copy all (for a spreadsheet)", primary: true, run: () => { navigator.clipboard && navigator.clipboard.writeText(tsv).then(() => ctx.toast("Copied " + crPlural(ppl.length, "row", "rows") + ".")); } }] : [],
  });
}
async function crWfCacPush(ctx) {
  try {
    const r = await NGGApi.admin.wifi.cacentrePush();
    ctx.toast(r.ok ? "Sent " + crNum(r.sent) + " people to CACENTRE" + (r.refused ? "; " + crNum(r.refused) + " refused." : ".") : (CR_WF_CAC_ERR[r.error] || "CACENTRE refused the list: " + r.error), null, !r.ok || r.refused > 0);
    ctx.reload();
  } catch (e) { ctx.toast(crWfErr(e, "Couldn’t send the list to CACENTRE."), null, true); }
}
function crWfCacBlock(ctx, c) {
  if (!c) return null;
  const act = c.canSend && c.configured ? { l: "Send now", run: () => crWfCacPush(ctx) } : undefined;
  if (!c.configured) return { type: "note", span: 6, icon: "buildings", text: "CACENTRE runs the Wi-Fi for the estate. NGG isn’t sending its people there yet.",
    sub: "It goes over the connection NGG already has with CACENTRE’s gate for attendance: hooks.attendance_secret in api/config.php, the same value as NGG_SECRET on the gate. Once attendance works, so does this. Until then the gateways and members’ Wi-Fi passwords stay NGG’s." };
  const L = c.last;
  if (!L) return { type: "note", span: 6, icon: "buildings", text: "CACENTRE runs the Wi-Fi. NGG’s people are sent there every " + Math.round(c.every / 60) + " minutes; nothing has been sent yet.", act };
  const unknown = Object.keys(L.unknownSites || {});
  if (!L.ok) return { type: "note", span: 6, icon: "warning", tone: "bad", text: "The last list didn’t reach CACENTRE (" + crAgo(L.at) + "). " + (CR_WF_CAC_ERR[L.error] || L.error), act };
  return { type: "note", span: 6, icon: "buildings", tone: L.refused || unknown.length ? "warn" : "ok",
    text: "CACENTRE runs the Wi-Fi. Sent " + crAgo(L.at) + ": " + crNum(L.sent) + " people with NGG’s say about each" + (L.gone ? ", " + crNum(L.gone) + " no longer on NGG’s list withdrawn" : "") + (L.refused ? "; " + crNum(L.refused) + " refused (" + (L.refusals || []).slice(0, 3).map(x => x.id + ": " + x.error).join(", ") + ")" : "") + ".",
    sub: (unknown.length ? "CACENTRE has no site for " + unknown.map(k => k.toUpperCase() + " (" + crNum(L.unknownSites[k]) + ")").join(", ") + ": add each there with the centre’s card code; until then those people sign in at the hubs only. " : "")
      + (L.full ? "" : "The list was sent in parts, so nobody was withdrawn. ") + "Suspensions, overrides and the access table here become NGG’s say; CACENTRE never gives more than NGG does. Members still set their password under Me → Wi-Fi, kept by CACENTRE once their centre’s router has moved. Anybody without email is shown their starting password at the gate when they check in, or use Starting passwords to hand them out.", act };
}

/* What a gateway's first problem asks of whoever reads it, and where that is
   done — keyed on the titles wifi_gateway_diagnose() writes. A gateway is
   on a centre's network NGG cannot reach, so "silent" and "out of memory"
   are fixed at the router: those open the gateway, whose drawer says what to
   check. Anything that has a step here runs it. */
function crWfFixFor(ctx, d, g, x) {
  const t = String(x.title || "");
  if (/^Not connected yet/.test(t)) return { act: "Run the setup", onClick: () => crWfGuide(ctx, g) };
  if (/wrong key/.test(t)) return { act: "Rotate the key", onClick: () => crWfRotate(ctx, g) };
  if (/^RouterOS/.test(t)) return { act: "Upgrade steps", onClick: () => crWfGuide(ctx, g) };
  if (/^More promised/.test(t)) return { act: "Change speeds", onClick: () => ctx.go("wifi", "wifi-access") };
  if (/^Slow line/.test(t) && g.platform === "mikrotik" && !g.testAsked) return { act: "Test the line", onClick: async () => {
    try { await NGGApi.admin.wifi.testAtNextFetch(g.gatewayId); ctx.toast("Asked. " + crWfName(g) + " tests its line at its next fetch, within a few minutes."); ctx.reload(); }
    catch (e) { ctx.toast(crWfErr(e, "Couldn’t ask for a test."), null, true); } } };
  if (/^Silent/.test(t)) return { act: "What to check", onClick: () => crWfOpen(ctx, g) };
  if (/reported a problem/.test(t)) return { act: "Read the error", onClick: () => crWfOpen(ctx, g) };
  return { act: "Open gateway", onClick: () => crWfOpen(ctx, g) };
}

Object.assign(CR_TAB_DEFS, {
  wifi: {
    skeleton: ["kpis", "cards", "cards"],
    load: crWfLoad,
    actions: (d, ctx) => [
      /* Once NGG is connected, CACENTRE runs the Wi-Fi: new routers are added
         there, so there is one place a router is set up, not two. */
      d.cacentre && d.cacentre.configured
        ? { l: "Add a router at CACENTRE", icon: "arrow-square-out", primary: true, run: () => window.open(d.cacentre.routersUrl, "_blank", "noopener") }
        : { l: "Add a gateway", icon: "plus", primary: true, disabled: !(d.centres || []).length, why: (d.centres || []).length ? "" : "Add a centre first (Members → Centres).", run: () => crWfEdit(ctx, d, null) },
      d.cacentre && d.cacentre.configured ? { l: "Starting passwords", icon: "key", run: () => crWfStarts(ctx) } : null,
      { l: "Test this connection", icon: "gauge", run: () => crWfSpeedTest(ctx, d) },
      { l: "Why can’t somebody get on?", icon: "magnifying-glass", run: () => crWfLookup(ctx) },
      { l: "Line test, every gateway", icon: "pulse", disabled: !(d.gateways || []).length, why: "No gateways yet.",
        run: () => { const ids = (d.gateways || []).map(g => g.gatewayId); crWfBulk(ctx, "test", { gatewayIds: ids }, ids.length, "you look after"); } },
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
        return { icon: crWfIcon(g.platform), title: crWfName(g), sub: g.platformLabel + (g.pilot ? " · pilot" : ""), tag: g.movedAt ? "Runs from CACENTRE" : g.lastSeenAt ? h[0] : "Not connected yet", tone: g.movedAt ? "neutral" : g.lastSeenAt ? h[1] : "warn",
          meta: [["People on it", crNum(g.users) + (g.stats && g.stats.active != null ? " · " + crNum(g.stats.active) + " online" : "")], ["Line", g.speed ? crWfMbps(g.speed.downMbps) + " · " + crAgo(g.speed.at) : "Not measured"], ["Last fetch", g.lastSeenAt ? crAgo(g.lastSeenAt) : "Never"], ["Reported version", g.osVersion || "—"]],
          onClick: () => crWfOpen(ctx, g) }; };
      return [
        { type: "kpis", span: 6, items: [
          { l: "Centres with Wi-Fi", v: crNum(Object.keys(byCentre).length) + " of " + crNum((d.centres || []).length), dn: bare.length ? crNum(bare.length) + " still to set up" : "every centre" },
          { l: "Gateways working", v: crNum(gws.length - bad.length - warn.length) + " of " + crNum(gws.length) },
          { l: "Need a look", v: crNum(bad.length + warn.length), dn: bad.length ? crNum(bad.length) + " not working" : "" },
          { l: "People on Wi-Fi", v: crNum(people), dn: "as the gateways last confirmed" },
        ] },
        bad.length + warn.length ? { type: "attention", span: 6, title: "Needs a look", sub: "Not working first", empty: "",
          rows: bad.concat(warn).map(g => { const x = (g.diagnosis || []).find(y => y.tone !== "ok") || {};
            return Object.assign({ n: 1, l: crWfName(g) + " · " + x.title, s: x.fix, tone: g.health === "bad" ? "bad" : "warn", age: g.health === "bad" ? 2 : 1 }, crWfFixFor(ctx, d, g, x)); }) } : null,
        { type: "cards", span: 6, title: "Centres", sub: "Each centre and its gateway", empty: "No centres yet. Add them under Members → Centres.",
          cards: (d.centres || []).map(c => byCentre[c] ? null : { icon: "wifi-slash", title: c, tag: "Not set up", tone: "neutral",
            sub: d.cacentre && d.cacentre.configured ? "No router yet. Routers are added at CACENTRE now, under the site code “" + ((d.cacentre.sites || {})[c] || "") + "”. Open to go there."
              : "No gateway yet. Members here see “Wi-Fi isn’t set up at your centre yet”. Open to add one.",
            onClick: () => (d.cacentre && d.cacentre.configured ? window.open(d.cacentre.routersUrl, "_blank", "noopener") : crWfEdit(ctx, d, null, c)) })
            .filter(Boolean).concat([].concat(...Object.keys(byCentre).sort().map(c => byCentre[c].map(card)))) },
        crWfCacBlock(ctx, d.cacentre),
        { type: "note", span: 6, icon: "info", text: "Each gateway fetches its centre’s list from NGG every one to five minutes, with its own key. Somebody suspended is signed out at the next fetch; a gateway that can’t reach NGG keeps the people it already has.",
          sub: "Open a gateway for its health, what it holds, its setup guide and its key.", act: { l: "Setup guides", run: () => ctx.go("wifi", "wifi-guides") } },
      ].filter(Boolean);
    },
  },

  "wifi-health": {
    skeleton: ["kpis", "table", "table"],
    load: crWfLoad,
    actions: (d, ctx) => [
      { l: "Test this connection", icon: "gauge", primary: true, disabled: !(d.centres || []).length, why: "Add a centre first.", run: () => crWfSpeedTest(ctx, d) },
    ],
    blocks: (d, ctx) => {
      crWfCtx.current = ctx;
      const gws = d.gateways || [], tests = d.speedTests || [];
      const latest = {};
      tests.forEach(t => { if (!latest[t.centre]) latest[t.centre] = t; });
      const lines = Object.keys(latest).map(c => latest[c]);
      const slowest = lines.slice().sort((a, b) => a.downMbps - b.downMbps)[0];
      const busiest = gws.slice().sort((a, b) => (b.peak7 || 0) - (a.peak7 || 0))[0];
      const peakOf = c => gws.filter(g => g.centre === c).reduce((n, g) => Math.max(n, g.peak7 || 0), 0);
      return [
        { type: "kpis", span: 6, items: [
          { l: "Slowest line", v: slowest ? crWfMbps(slowest.downMbps) : "—", dn: slowest ? slowest.centre : "No tests yet" },
          { l: "Busiest this week", v: busiest && busiest.peak7 ? crNum(busiest.peak7) + " at once" : "—", dn: busiest && busiest.peak7 ? busiest.centre : "Gateways report this" },
          { l: "Centres measured", v: crNum(lines.length) + " of " + crNum((d.centres || []).length), dn: "in the last 30 days" },
          { l: "Online now", v: crNum(gws.reduce((n, g) => n + (g.stats && g.stats.active ? g.stats.active : 0), 0)), dn: "as the gateways last reported" },
        ] },
        { type: "table", span: 6, title: "Each centre’s line", sub: "The newest test, and what each person gets at the busiest hour this week", nosel: true,
          cols: ["Centre", { l: "Down", num: true }, { l: "Up", num: true }, { l: "Delay", num: true }, { l: "Each, when busiest", num: true }, "Measured"],
          rows: (d.centres || []).map(c => { const t = latest[c], pk = peakOf(c);
            return { key: c, cells: [{ k: "strong", t: c, s: t ? (t.source === "gateway" ? "by its gateway" : "from a device" + (t.by ? ", " + t.by : "")) : "Not measured yet" },
              t ? { k: "status", t: crWfMbps(t.downMbps), tone: t.downMbps < (d.slowMbps || 5) ? "bad" : "ok" } : { k: "text", t: "—" },
              { k: "num", t: t ? crWfMbps(t.upMbps) : "—", v: t ? t.upMbps : 0 }, { k: "num", t: t && t.rttMs ? t.rttMs + " ms" : "—", v: t ? t.rttMs : 0 },
              { k: "num", t: t && pk ? crWfMbps(t.downMbps / pk) + " · " + crNum(pk) + " people" : "—", v: t && pk ? t.downMbps / pk : 0 },
              { k: "text", t: t ? crAgo(t.at) : "—", s: t && t.note ? t.note : "" }] }; }),
          emptyText: "No centres yet." },
        { type: "table", span: 6, title: "Every test", sub: "The latest 40", nosel: true,
          cols: ["When", "Centre", "From", { l: "Down", num: true }, { l: "Up", num: true }, { l: "Delay", num: true }, { l: "Note", wrap: true }],
          rows: tests.map((t, i) => ({ key: t.at + i, cells: [{ k: "text", t: crDate(t.at, true) }, { k: "text", t: t.centre }, { k: "text", t: t.source === "gateway" ? "Its gateway" : (t.by || "A device") },
            { k: "num", t: crWfMbps(t.downMbps), v: t.downMbps }, { k: "num", t: crWfMbps(t.upMbps), v: t.upMbps }, { k: "num", t: t.rttMs ? t.rttMs + " ms" : "—", v: t.rttMs }, { k: "text", t: t.note || "" }] })),
          filters: ["Centre", "From"], emptyText: "No tests yet. Run one from a device at a centre with Test this connection." },
        { type: "note", span: 6, icon: "eye-slash", text: "Gateways report how many people are online, their CPU, memory and uptime as hourly summaries, and how much data each signed-in person used (see Data used). Never what anybody visits.",
          sub: "A MikroTik gateway also tests its own line every night, or when asked from its card. Device tests measure the line to NGG from where people actually sit." },
      ];
    },
  },

  /* Analytics (admin.wifi.analytics): the same numbers as the Club portal's
     Wi-Fi overview, drawn with the Control Room's own blocks. Limited on the
     server to the person's Wi-Fi scope. */
  "wifi-analytics": {
    skeleton: ["kpis", "table", "table"],
    load: async () => {
      const days = crWfDays.current;
      // The server-load reading is network-wide (the Wi-Fi regions capability); anybody else simply has none.
      const [a, r, load] = await Promise.all([NGGApi.admin.wifi.analytics({ days }), NGGApi.admin.wifi.regions().catch(() => ({ regions: [] })), NGGApi.admin.wifi.load().catch(() => null)]);
      return { a, regions: r.regions || [], days, load };
    },
    actions: (d, ctx) => [7, 30, 90].map(n => ({ l: "Last " + n + " days", icon: n === d.days ? "check" : "calendar-blank", primary: n === d.days, run: () => { crWfDays.current = n; ctx.reload(); } })),
    blocks: (d, ctx) => {
      const a = d.a, s = a.summary;
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const hours = [];
      a.heatmap.forEach((row, di) => row.forEach((v, h) => { if (v > 0) hours.push([days[di] + " " + String(h).padStart(2, "0") + ":00", v]); }));
      hours.sort((x, y) => y[1] - x[1]);
      return [
        { type: "kpis", span: 6, items: [
          { l: "Gateways", v: crNum(a.gateways), dn: a.gatewaysNever ? crNum(a.gatewaysNever) + " not connected yet" : "" },
          { l: "Most online at once", v: crNum(s.peakOnline), dn: "in the last " + d.days + " days" },
          { l: "Gateways there", v: s.avgAvailability == null ? "—" : s.avgAvailability + "%", dn: "of the hours, on average", tone: s.avgAvailability != null && s.avgAvailability < 90 ? "down" : "flat" },
          { l: "Typical line", v: crWfMbps(s.medianLine), dn: s.slowCentres ? crPlural(s.slowCentres, "slow centre") : crPlural(s.tests, "test") },
        ] },
        { type: "columns", span: 6, title: "People online", sub: "The busiest moment each day, across the gateways in view", big: crNum(s.peakOnline), pct: false,
          bars: a.series.map(x => ({ l: x.date.slice(8), v: x.peakOnline, tip: x.date + " · average " + x.avgOnline })) },
        { type: "columns", span: 3, title: "Gateways there", sub: "Share of each day’s hours they fetched in", big: s.avgAvailability == null ? "—" : s.avgAvailability + "%", pct: true,
          bars: a.series.map(x => ({ l: x.date.slice(8), v: x.availability == null ? 0 : Math.round(x.availability) })) },
        { type: "bars", span: 3, title: "Busy hours", sub: "Most online, by weekday and hour (last 14 days)", rows: hours.slice(0, 8), empty: "The busy hours fill in as gateways report." },
        { type: "bars", span: 2, title: "Busiest centres", rows: a.busiest.map(x => [x.centre, x.peak]), empty: "Nothing reported yet." },
        { type: "table", span: 2, title: "Slowest lines", nosel: true, cols: ["Centre", { l: "Down", num: true }],
          rows: a.slowest.map(x => ({ key: x.centre, cells: [{ k: "text", t: x.centre, s: crAgo(x.at) }, { k: "num", t: crWfMbps(x.downMbps), v: x.downMbps }] })), emptyText: "No tests yet." },
        { type: "table", span: 2, title: "Least available", nosel: true, cols: ["Gateway", { l: "There", num: true }],
          rows: a.leastAvailable.map(x => ({ key: x.gatewayId, cells: [{ k: "text", t: x.label, s: x.centre }, { k: "num", t: x.availability + "%", v: x.availability }] })), emptyText: "No gateways yet." },
        a.regions.length ? { type: "table", span: 6, title: "Regions now", nosel: true,
          cols: ["Region", { l: "Centres", num: true }, { l: "With Wi-Fi", num: true }, { l: "Working", num: true }, { l: "Need a look", num: true }, { l: "Not working", num: true }, { l: "Online now", num: true }],
          rows: a.regions.map(r => ({ key: r.regionId || "_none", cells: [{ k: "strong", t: r.name }, { k: "num", t: crNum(r.centres), v: r.centres }, { k: "num", t: crNum(r.withWifi), v: r.withWifi }, { k: "num", t: crNum(r.working), v: r.working },
            { k: "num", t: crNum(r.warn), v: r.warn }, { k: "num", t: crNum(r.bad), v: r.bad }, { k: "num", t: crNum(r.online), v: r.online }] })) } : null,
        ...(d.load ? crWfLoadBlocks(d.load) : []),
        { type: "note", span: 6, icon: "eye-slash", text: "These are hourly and daily summaries: how many were online, how much of the day each gateway was there, and the line tests. Each person’s data used is under Data used. Never what anybody visited." },
      ].filter(Boolean);
    },
  },

  /* Regions (admin.wifi.regions …): a Wi-Fi grouping of centres. */
  "wifi-regions": {
    skeleton: ["table"],
    load: async () => NGGApi.admin.wifi.regions(),
    actions: (d, ctx) => d.canShape ? [
      { l: "New region", icon: "plus", primary: true, run: () => crWfRegionEdit(ctx, null) },
      { l: "Put centres in a region", icon: "squares-four", disabled: !d.regions.length, why: "Make a region first.", run: () => crWfRegionAssign(ctx, d.regions) },
    ] : [],
    blocks: (d, ctx) => [
      { type: "table", span: 6, title: "Regions", sub: d.canShape ? "Open one for its leads, speeds, name or removal" : "The regions you lead", nosel: true,
        cols: ["Region", { l: "Centres", num: true }, { l: "With Wi-Fi", num: true }, "Health", { l: "Online now", num: true }, "Leads"],
        rows: d.regions.map(r => ({ key: r.regionId, open: () => crWfRegionOpen(ctx, r, d.canShape), cells: [{ k: "strong", t: r.name, s: r.code }, { k: "num", t: crNum(r.centres), v: r.centres }, { k: "num", t: crNum(r.withWifi), v: r.withWifi },
          r.bad ? { k: "status", t: crNum(r.bad) + " not working", tone: "bad" } : r.warn ? { k: "status", t: crNum(r.warn) + " need a look", tone: "warn" } : r.gateways ? { k: "status", t: "Working", tone: "ok" } : { k: "status", t: "No gateways", tone: "neutral" },
          { k: "num", t: crNum(r.online), v: r.online }, { k: "text", t: r.leads.map(l => l.name).join(", ") || "None yet" }] })),
        emptyText: d.canShape ? "No regions yet. A region groups centres for their Wi-Fi, with its own leads and speeds." : "You don’t lead a Wi-Fi region." },
      d.canShape && d.unassigned.centres ? { type: "note", span: 6, icon: "info", text: crPlural(d.unassigned.centres, "centre is", "centres are") + " in no region.", act: d.regions.length ? { l: "Put them in one", run: () => crWfRegionAssign(ctx, d.regions) } : undefined } : null,
    ].filter(Boolean),
  },

  /* Data used (admin.wifi.usage): per person, against their allowance. Amounts
     only — the gateways never send which sites. Staff with `network` see the
     centres in their Wi-Fi scope; each person sees their own in their app. */
  "wifi-usage": {
    skeleton: ["kpis", "table"],
    load: async () => { const period = crWfUsePeriod.current; return { u: await NGGApi.admin.wifi.usage({ period, pageSize: 500 }), period }; },
    actions: (d, ctx) => [["day", "Today"], ["week", "Last 7 days"], ["month", "This month"]].map(([k, l]) => ({ l, icon: k === d.period ? "check" : "calendar-blank", primary: k === d.period, run: () => { crWfUsePeriod.current = k; ctx.reload(); } })),
    blocks: (d, ctx) => {
      const u = d.u, gw = u.gateways || { total: 0, counting: 0, canCount: 0 };
      const when = { day: "today", week: "in the last 7 days", month: "this month" }[d.period];
      const allow = r => [r.dayMb ? crWfBytes(r.dayMb * 1048576) + " a day" : "", r.monthMb ? crWfBytes(r.monthMb * 1048576) + " a month" : ""].filter(Boolean).join(" · ") || "No allowance";
      return [
        { type: "kpis", span: 6, items: [
          { l: "Data used " + when, v: crWfBytes(u.bytes), dn: crPlural(u.total, "person", "people") },
          { l: "Over their allowance", v: crNum(u.over), dn: u.over ? "now on the slow profile, or off" : "nobody", tone: u.over ? "down" : "flat" },
          { l: "Gateways reporting it", v: crNum(gw.counting) + " of " + crNum(gw.total), dn: gw.canCount < gw.total ? crNum(gw.total - gw.canCount) + " can’t report data used yet" : "in the last day" },
          { l: "Centres", v: crNum((u.centres || []).length), dn: "with data used " + when },
        ] },
        (u.centres || []).length ? { type: "bars", span: 2, title: "By centre", sub: "In MB", rows: u.centres.map(c => [c.centre, Math.round(c.bytes / 1048576)]), empty: "" } : null,
        { type: "table", span: (u.centres || []).length ? 4 : 6, title: "Each person", sub: "Heaviest first · " + when + (u.total > u.people.length ? " · the " + crNum(u.people.length) + " heaviest of " + crNum(u.total) : ""), nosel: true,
          cols: ["Person", "Centre", { l: "Used", num: true }, { l: "Today", num: true }, { l: "This month", num: true }, "Allowance"],
          rows: u.people.map(r => ({ key: r.subjectType + r.subjectId, open: () => crWfUseOpen(ctx, r, allow(r)), cells: [
            { k: "strong", t: r.name, s: [r.id, r.who === "staff" ? "Staff" : r.who === "summer" ? "Summer School" : "Member"].filter(Boolean).join(" · ") },
            { k: "text", t: r.centre || "—" },
            { k: "num", t: crWfBytes(r.bytes), v: r.bytes }, { k: "num", t: crWfBytes(r.today), v: r.today }, { k: "num", t: crWfBytes(r.month), v: r.month },
            r.over ? { k: "status", t: "Over " + (r.over === "day" ? "today’s" : "this month’s"), tone: "bad" } : { k: "text", t: allow(r) }] })),
          filters: ["Centre"], emptyText: gw.counting ? "Nobody has used any data " + when + "." : "No gateway is reporting data used yet. A MikroTik gateway reports it once its setup script is run again (Setup guides)." },
        { type: "note", span: 6, icon: "eye-slash", text: "Amounts only: how much each person downloaded and uploaded, per day. Never which sites, and never when in the day.",
          sub: "Members see their own figures in the app (Me → Wi-Fi). Families don’t see them. Set allowances under Who gets on → Speeds; somebody over theirs gets the “Used up their data allowance” setting at the gateway’s next fetch.",
          act: { l: "Set allowances", run: () => ctx.go("wifi", "wifi-access") } },
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
        { type: "note", span: 6, icon: "lock-key", text: "Members sign in with their printed ID and a Wi-Fi password they choose in the app under Me → Wi-Fi, which opens on the centre’s Wi-Fi before they sign in. They can change it three times a day; nobody else ever sees it.",
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
