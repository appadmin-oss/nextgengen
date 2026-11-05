/* Control Room — Members › Sign-in security (api/_lib/domain/mfa.php).

   Written as Control Room v2 data (CONTRACT.md): headline figures, the people
   in one server-paged table (kind and state are facets, searched and paged on
   the server), a drawer per person with the desk's levers, and the policy as
   a form block that holds its edits until Save.

   The levers, per person:
   - Let in for 10 minutes: Google Workspace's "Turn off for 10 minutes". The
     desk is shown a one-time code to read out; the person types their ID and
     the code on the sign-in screen with no password, or their open step screen
     opens by itself. One person, never a bulk action.
   - Reset, require it, back to the policy, email a reminder: one declaration
     each, used by the drawer and (except let-in) the bulk bar.
   Staff are not listed: the console's own authenticator is theirs, reset in
   Access & roles. */

const CR_SEC_KINDS = [
  ["member", "Members", "A private question"],
  ["team", "Instructors, volunteers & mentors", "An authenticator app or an emailed code"],
  ["guardian", "Guardians", "A family PIN"],
];
const CR_SEC_WHO = { member: "member", team: "volunteer", guardian: "guardian" };
const CR_SEC_TYPE = { question: "Private question", app: "Authenticator app", email: "Emailed code", pin: "PIN", sms: "Text message" };
const CR_SEC_POLICY = [["off", "Off"], ["optional", "Optional, with reminders"], ["required", "Required at sign-in"]];
const CR_SEC_STATE = [["enrolled", "Has a second step"], ["none", "No second step yet"]];

/* The live ctx, set on every render: the table's rows are built inside load's
   server object, whose ctx has no setData (the members tab does the same). */
const crSecCtx = { current: null };

function crSecTime(unix) { return fmtTime(new Date(unix * 1000)); }
function crSecKey(r) { return r.who + ":" + r.id; }
function crSecPeople(keys) { return keys.map(k => { const i = k.indexOf(":"); return { who: k.slice(0, i), id: k.slice(i + 1) }; }); }

/** A bulk/row verdict in words: applied, unchanged and refused are three things. */
function crSecVerdict(r, done) {
  const res = (r && r.results) || [];
  const bad = res.filter(x => !x.ok);
  const same = res.filter(x => x.ok && x.unchanged).length;
  const why = { own_account: "your own account", staff_account: "staff (Access & roles)", out_of_scope: "outside your centres", no_email_on_file: "no email on file",
    quiet_period: "reminded in the last 3 days", mail_failed: "the email did not go", not_found: "not found" };
  const reasons = {};
  bad.forEach(x => { const w = why[x.error] || String(x.error || "refused").replace(/_/g, " "); reasons[w] = (reasons[w] || 0) + 1; });
  const parts = [crPlural((r && r.applied) || 0, "person", "people") + " " + done];
  if (same) parts.push(crNum(same) + " already so");
  Object.keys(reasons).forEach(w => parts.push(crNum(reasons[w]) + " not: " + w));
  return { text: parts.join(" · "), bad: bad.length > 0 };
}

async function crSecAct(ctx, action, keys, done) {
  try {
    const r = await NGGApi.admin.mfa.act(action, crSecPeople(keys));
    const v = crSecVerdict(r, done);
    ctx.toast(v.text, null, v.bad);
    ctx.setData(x => Object.assign({}, x, { rev: (x.rev || 0) + 1 }));
    return r;
  } catch (e) { ctx.toast(crErr(e, "That didn’t go through."), null, true); return null; }
}

/** Let one person in for ten minutes, then show the desk the code, once. */
async function crSecLetIn(ctx, row) {
  const ok = await ctx.confirm({
    title: "Let " + (row.name || "them") + " in for 10 minutes?",
    body: "For the next 10 minutes, their next sign-in needs only their email or ID: no password, no code, no second step. Once. If their second-step screen is already open, it opens by itself. You also get a one-time code, for when they are not in front of you. Afterwards they set a new second step without the old one. They are emailed, and it is in the audit log.",
    cta: "Let them in",
  });
  if (!ok) return;
  let r;
  try { r = await NGGApi.admin.mfa.act("bypass", [{ who: row.who, id: row.id }]); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t let them in."), null, true); return; }
  const x = ((r && r.results) || [])[0] || {};
  if (!x.ok) { ctx.toast(crSecVerdict(r, "let in").text, null, true); return; }
  ctx.setData(d => Object.assign({}, d, { rev: (d.rev || 0) + 1 }));
  ctx.drawer({
    title: "Code for " + (row.name || row.id), icon: "key",
    sub: "Let in until " + crSecTime(x.expires) + ". Their email or ID alone signs them in, once.",
    stats: [["Code", x.code], ["Sign in as", x.signInAs || row.id], ["Until", crSecTime(x.expires)]],
    sections: [
      { h: "At the desk", list: [
        { icon: "user-circle-check", t: x.door === "family" ? "They open the NGG Family app and type their email" : "They type their email or " + (x.signInAs || "their ID") + " and press Continue", s: "That is all: they are in. One sign-in, until " + crSecTime(x.expires) + "." },
      ] },
      { h: "Not with you? Read them the code", list: [
        x.door === "family"
          ? { icon: "sign-in", t: "Open the NGG Family app (/family)", s: "Choose “I have a code from staff”." }
          : { icon: "sign-in", t: "Open the sign-in screen", s: "Choose “I have a code from staff”, on any sign-in screen: the first, the password or the emailed-code one." },
        { icon: "identification-card", t: "Type " + (x.signInAs || "their ID") + " and the code", s: x.code },
        { icon: "shield-check", t: "Set a new second step", s: "They are asked straight away. The old one is not needed." },
      ] },
      { h: "Told", text: (x.told || []).length ? "They were sent a security notice by " + x.told.join(" and ") + "." : "No email or device on file, so nobody was notified. It is in the audit log." },
    ],
    actions: [{ l: "Done", primary: true, run: () => ctx.closeDrawer() }],
  });
}

function crSecOpen(ctx, row) {
  const may = ctx.can("people");
  ctx.drawer({
    title: row.name || row.id, name: row.name,
    sub: [row.id, row.centre, (CR_SEC_KINDS.find(k => k[0] === row.kind) || [])[1]].filter(Boolean).join(" · "),
    stats: [["Second step", row.type ? (CR_SEC_TYPE[row.type] || row.type) : "None"], ["Since", row.since ? crDate(row.since) : "—"],
      ["Required", row.required ? "Of them" : "By policy"]],
    fields: [["Email", row.email], ["Let in until", row.bypassUntil ? crSecTime(row.bypassUntil) : ""]],
    actions: [
      { l: "Let in for 10 minutes", primary: true, disabled: !may, why: "Needs the People permission.", run: () => { ctx.closeDrawer(); crSecLetIn(ctx, row); } },
      row.type ? { l: "Reset their second step", disabled: !may, why: "Needs the People permission.", run: async () => {
        ctx.closeDrawer();
        if (await ctx.confirm({ title: "Reset " + (row.name || "their") + "’s second step?", body: "What they set is cleared. Where it is required they choose a new one at their next sign-in; otherwise they are reminded.", cta: "Reset", danger: true }))
          await crSecAct(ctx, "reset", [crSecKey(row)], "reset");
      } } : null,
      row.required
        ? { l: "Back to the policy", disabled: !may, run: () => { ctx.closeDrawer(); crSecAct(ctx, "unrequire", [crSecKey(row)], "back to the policy"); } }
        : { l: "Require it of them", disabled: !may, run: () => { ctx.closeDrawer(); crSecAct(ctx, "require", [crSecKey(row)], "now required"); } },
      !row.type ? { l: "Email a reminder", disabled: !may || !row.email, why: !row.email ? "No email on file." : "Needs the People permission.", run: () => { ctx.closeDrawer(); crSecAct(ctx, "remind", [crSecKey(row)], "reminded"); } } : null,
    ].filter(Boolean),
  });
}

function crSecServer(ctx) {
  return {
    sortKeys: {},
    fetch: async ({ q, filters, page, pageSize }) => {
      const kind = filters.kind || "member";
      const r = await NGGApi.admin.mfa.overview({ kind, state: filters.state || "all", q: q || "", limit: pageSize, offset: page * pageSize });
      return { total: r.total || 0, rows: (r.rows || []).map(x => ({
        key: crSecKey(x), open: () => crSecOpen(crSecCtx.current || ctx, x),
        cells: [
          { k: "person", t: x.name || x.id, s: [x.id, x.email].filter(Boolean).join(" · ") },
          { k: "text", t: x.centre || "—" },
          x.type ? { k: "text", t: CR_SEC_TYPE[x.type] || x.type, s: x.since ? "since " + crDate(x.since) : "" } : { k: "status", t: "None yet", tone: "neutral" },
          x.bypassUntil ? { k: "status", t: "Let in until " + crSecTime(x.bypassUntil), tone: "warn" }
            : x.required ? { k: "status", t: "Required of them", tone: "gold" } : { k: "text", t: "By policy" },
        ],
      })) };
    },
  };
}

/** The policy as a form block: per kind, off/optional/required and the ways they may choose. */
function crSecPolicyBlock(d, ctx) {
  const all = k => ((d.methods || {})[k] || []);
  const groups = CR_SEC_KINDS.map(([k, l, how]) => ({
    h: l, help: "Suggested: " + how.charAt(0).toLowerCase() + how.slice(1) + ".",
    rows: [
      { id: "pol_" + k, l: "Second step", c: "select", opts: CR_SEC_POLICY, value: d.policy[k] },
      { id: "m_" + k, l: "Ways they may choose", c: "multi", opts: all(k).map(m => [m.id, CR_SEC_TYPE[m.id] || m.label]), value: all(k).filter(m => m.on).map(m => m.id),
        help: "Only what each kind of person can be given. A text message is offered only while texts are switched on.",
        check: v => (v || []).length ? "" : "Leave at least one way." },
    ],
  }));
  return { type: "form", span: 6, key: "sec-policy", groups,
    save: async (patch, vals) => {
      const policy = {}, methods = {};
      CR_SEC_KINDS.forEach(([k]) => { policy[k] = vals["pol_" + k]; methods[k] = vals["m_" + k] || []; });
      await NGGApi.admin.mfa.policy(policy, methods);
    },
    onSaved: () => ctx.reload(),
  };
}

Object.assign(CR_TAB_DEFS, {
  security: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const r = await NGGApi.admin.mfa.overview({ kind: "member", state: "all", limit: 10, offset: 0 });
      return { counts: r.counts || {}, policy: r.policy || {}, methods: r.methods || {}, canPolicy: !!r.canPolicy, server: crSecServer(ctx), rev: 0 };
    },
    actions: () => [],
    facts: d => CR_SEC_KINDS.map(([k, l]) => { const c = d.counts[k] || {}; return l + ": " + crNum(c.enrolled) + " of " + crNum(c.total) + " have a second step (policy " + d.policy[k] + ")"; }).join(". "),
    blocks: (d, ctx) => {
      crSecCtx.current = ctx;
      const may = ctx.can("people");
      const out = [{ type: "kpis", span: 6, items: CR_SEC_KINDS.map(([k, l]) => {
        const c = d.counts[k] || { total: 0, enrolled: 0 };
        const pct = c.total ? Math.round(c.enrolled / c.total * 100) : 0;
        return { l: l + " with a second step", v: crNum(c.enrolled) + " / " + crNum(c.total), d: pct + "% · " + ((CR_SEC_POLICY.find(p => p[0] === d.policy[k]) || [])[1] || "").toLowerCase(),
          tone: d.policy[k] === "required" && c.enrolled < c.total ? "down" : "flat" };
      }) }];
      out.push({ type: "note", span: 6, icon: "key", text: "Somebody who has lost their second step (a forgotten answer, a new phone) can be let in for 10 minutes from their row.",
        sub: "For 10 minutes their email or ID alone signs them in, once, as Google Workspace does it. A one-time code is shown too, for when they are not in front of you. They then set a new step. They are emailed, and it is in the audit log." });
      const bulk = may ? [
        { l: "Reset", max: 200, run: async keys => {
          if (!(await ctx.confirm({ title: "Reset the second step for " + crPlural(keys.length, "person", "people") + "?", body: "What they set is cleared. Where it is required they choose a new one at their next sign-in; otherwise they are reminded.", cta: "Reset", danger: true }))) return false;
          return crSecAct(ctx, "reset", keys, "reset");
        } },
        { l: "Require it", max: 200, run: keys => crSecAct(ctx, "require", keys, "now required") },
        { l: "Back to the policy", max: 200, run: keys => crSecAct(ctx, "unrequire", keys, "back to the policy") },
        { l: "Email a reminder", max: 200, run: async keys => {
          if (!(await ctx.confirm({ title: "Email " + crPlural(keys.length, "person", "people") + " a reminder?", body: "Only people with no second step and an email on file are sent one, at most once every 3 days.", cta: "Send" }))) return false;
          return crSecAct(ctx, "remind", keys, "reminded");
        } },
      ] : [];
      out.push({ key: "sec-people", type: "table", span: 6, title: "People", reloadKey: d.rev, search: "Search by name, ID or email",
        cols: ["Person", "Centre", "Second step", "Status"],
        server: d.server,
        filtersInit: { kind: "member" },
        filters: [
          { id: "kind", l: "Who", opts: CR_SEC_KINDS.map(([v, l]) => ({ v, l, n: (d.counts[v] || {}).total })) },
          { id: "state", l: "Second step", opts: CR_SEC_STATE.map(([v, l]) => ({ v, l })) },
        ],
        bulk,
        emptyText: "Nobody matches. Clear the search or the filters.",
      });
      if (d.canPolicy) out.push(crSecPolicyBlock(d, ctx));
      else out.push({ type: "note", span: 6, icon: "lock", text: "The policy for each kind of person is set by somebody with the Settings permission." });
      return out;
    },
  },
});
