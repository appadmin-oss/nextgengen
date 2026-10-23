/* ============================================================================
   ID Card Studio — the assistant (v4): a chat pane beside the sheet.

   "New cards for Egbeda members, front and back" → the server reads it into a
   PLAN (admin.ids.plan: an AI provider when a key is set, the studio's rules
   always), and the studio applies the plan to what it already shows: the
   records it selects, the sheet settings it changes. Nothing is printed and
   nothing is written until the operator presses Print on the result, which
   names what was understood, the count and the sheet, so the count is read
   before the press (CLAUDE.md §6). Undo puts the sheet back as it was before
   the first plan.

   A plan on screen is a conversation, and the pane keeps the transcript: the
   next request ("fronts only", "only Ijaiye", "add 026-010", "not Ada") is sent
   with the plan and adjusts it; the earlier replies stay, marked superseded,
   and only the newest is live. Each thing the studio understood is a chip
   whose × takes it out on the spot. In Ask mode a reply suggests and waits for
   Apply; in Act mode it applies straight away. It can never print, and never
   mark anybody printed: Print stays a press, with the count on it.

   idsPlanSelect is pure: the plan and the studio's lists in, the selection
   and everything left out (no photo, not found, already carded, left out as
   asked) out.
   ========================================================================== */

const IDS_ASK_EXAMPLES = [
  "New cards for every member at Egbeda, front and back",
  "Reprint 026-003 and 026-014",
  "Summer School participants who registered this week, proof on A4",
  "Volunteers, fronts only, by name",
];
const IDS_ASK_REFINE_HINT = "Change it — “fronts only”, “only Ijaiye”, “add 026-010”, “not Ada”…";
const IDS_ASK_PICK_MAX = 600;
const IDS_ASK_TEXT_MAX = 400;   // IDS_PLAN_PROMPT_MAX on the server   // one run's ceiling (IDS_BATCH_MAX on the server)
const IDS_ASK_NAME_AMBIGUOUS = 3;
const IDS_ASK_RECENT_KEY = "ngg.ids.ask.recent";
const IDS_ASK_RECENT_MAX = 6;
const IDS_ASK_PROVIDER = { openai: "OpenAI", anthropic: "Claude", gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter" };

/* Recent requests, this browser only: a convenience, so a storage that is
   blocked or full simply means none are kept. */
function idsAskRecent() { try { const v = JSON.parse(localStorage.getItem(IDS_ASK_RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, IDS_ASK_RECENT_MAX) : []; } catch (_) { return []; } }
function idsAskRemember(text) {
  const list = [text].concat(idsAskRecent().filter(x => x.toLowerCase() !== text.toLowerCase())).slice(0, IDS_ASK_RECENT_MAX);
  try { localStorage.setItem(IDS_ASK_RECENT_KEY, JSON.stringify(list)); } catch (_) {}
  return list;
}

/** Edit distance, for a misspelt name. Short strings only. */
function idsLev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** Does a typed name mean this person? Every typed word starts one of theirs, or is a near spelling of it. */
function idsNameMatch(typed, name) {
  const toks = String(typed || "").toLowerCase().split(/\s+/).filter(Boolean);
  const words = String(name || "").toLowerCase().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every(t => words.some(w => w.startsWith(t) || (t.length >= 4 && idsLev(t, w) <= (t.length >= 7 ? 2 : 1))));
}

/** The records whose names come closest to a name nobody has: for "did you mean". */
function idsClosest(raw, all, max) {
  const toks = String(raw || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const score = r => {
    const words = String(r.name || "").toLowerCase().split(/\s+/).filter(Boolean);
    let hit = 0, dist = 0;
    toks.forEach(t => { const d = Math.min.apply(null, words.map(w => w.startsWith(t) ? 0 : idsLev(t, w)).concat([99])); if (d <= Math.max(1, Math.floor(t.length / 3))) hit++; dist += Math.min(d, 6); });
    return hit ? hit * 10 - dist : -1;
  };
  const seen = new Set();
  return all.map(r => [score(r), r]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0])
    .filter(x => !seen.has(x[1].name) && seen.add(x[1].name)).slice(0, max || 2).map(x => x[1]);
}
/** A kind's plural in a sentence: lower case, except the programme's own name (NGG). */
const idsKindWords = k => { const l = IDS_KIND_PLURAL[k] || k; return /^NGG\b/.test(l) ? l : l.toLowerCase(); };
const IDS_KIND_ONE = { member: "an NGG member", summer: "a Summer School participant", volunteer: "a volunteer", afrovanguard: "an Afrovanguard member" };

/** The plan applied to the studio's lists. Pure. */
function idsPlanSelect(plan, ctx) {
  const p = plan || {};
  const pool = ctx.pool || [], all = ctx.all || [], blockedOf = ctx.isBlocked || (() => false);
  const norm = x => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const notKinds = p.notKinds || [];
  const okKind = r => (!p.kind || r.kind === p.kind) && !notKinds.includes(r.kind);
  /* "Badmus should be NGG": a kind said of one named person decides which of
     their records is meant, and nothing else. */
  const kindOf = p.kindOf || {};
  const kindFor = raw => { const k = Object.keys(kindOf).find(n => idsNameMatch(n, raw) || idsNameMatch(raw, n)); return k ? kindOf[k] : null; };
  const centres = p.centres || [];
  const okCentre = r => centres.length ? centres.includes(r.centre) : !p.centre || (p.centre === "none" ? !r.centre : r.centre === p.centre);
  const centreWords = centres.length ? centres.slice(0, -1).join(", ") + " and " + centres[centres.length - 1] : p.centre === "none" ? "people with no centre" : p.centre;
  const okPhoto = r => p.hasPhoto == null || !!r.hasPhoto === p.hasPhoto;
  const okWhich = r => !p.which || p.which === "all" || r.reason === p.which;
  const okDate = r => (!p.dateFrom && !p.dateTo) || (!!r.day && (!p.dateFrom || r.day >= p.dateFrom) && (!p.dateTo || r.day <= p.dateTo));
  /* "026-001 to 026-040" keeps to 2026's numbers: the prefix is the printed ID's own. */
  const okNum = r => (p.numFrom == null && p.numTo == null) || (r.seq != null && (p.numFrom == null || r.seq >= p.numFrom) && (p.numTo == null || r.seq <= p.numTo)
    && (!p.numPrefix || String(r.displayId || "").toUpperCase().startsWith(p.numPrefix + "-")));
  const findId = (list, w) => list.filter(c => norm(c.displayId) === w || norm(c.id) === w || (/^\d+$/.test(w) && c.seq === parseInt(w, 10)));
  const hits = [], missing = [], carded = [], ambiguous = [], filtered = [], notWaiting = [], twoLists = [];
  let asked = 0;
  /* What each typed name or number turned out to be: the record's own name,
     when it means one person, so the chip reads "Ayomide Abubakar" rather
     than what was typed ("ayomide abubakar"). */
  const resolved = {};
  const resolve = (raw, recs) => { const n = Array.from(new Set((recs || []).map(r => r.name).filter(Boolean))); if (n.length === 1) resolved[raw] = n[0]; return recs; };
  /* Somebody named but kept off by the plan's own narrowing (only NGG, only
     Ijaiye): said as that, with who they are, never as "not found". */
  const whyOff = (r, narrow) => !okKind(r) ? "is " + (IDS_KIND_ONE[r.kind] || r.kind) + (p.kind ? ", and this is " + idsKindWords(p.kind) + " only" : ", and those are left out")
    : narrow && !okCentre(r) ? "is at " + (r.centre || "no centre") + ", and this is " + centreWords + " only" : "";
  /* Named people are wanted whatever the "new / reprint" filter says; the
     kind (and, for names, the centre) still narrows who a name can mean. */
  const named = (ids, names, narrow) => {
    (ids || []).forEach(raw => {
      asked++;
      const w = norm(raw);
      const inPool = resolve(raw, findId(pool.filter(okKind), w));
      if (inPool.length) return hits.push(...inPool);
      const had = resolve(raw, findId(all.filter(okKind), w).filter(r => r.printedBefore));
      if (had.length) return carded.push(...had);
      const any = resolve(raw, findId(all, w));
      if (any.length && whyOff(any[0], false)) return filtered.push({ name: raw, who: any[0].name, why: whyOff(any[0], false), rec: any[0] });
      if (any.length) return notWaiting.push({ name: raw, who: any[0].name });
      missing.push(raw);
    });
    (names || []).forEach(raw => {
      asked++;
      const want = kindFor(raw);
      const near = r => (want ? r.kind === want : okKind(r)) && (!narrow || okCentre(r)) && idsNameMatch(raw, r.name);
      let inPool = pool.filter(near);
      if (inPool.length > IDS_ASK_NAME_AMBIGUOUS) return ambiguous.push({ name: raw, n: inPool.length });
      /* One person on two lists (an NGG member who was also at Summer School)
         is one card, not two: say so, and which one to keep is theirs to say. */
      const kinds = Array.from(new Set(inPool.map(r => r.kind)));
      if (!want && kinds.length > 1 && new Set(inPool.map(r => r.name.toLowerCase())).size === 1) twoLists.push({ name: inPool[0].name, kinds });
      if (inPool.length) return hits.push(...resolve(raw, inPool));
      const had = all.filter(r => near(r) && r.printedBefore);
      if (had.length && had.length <= IDS_ASK_NAME_AMBIGUOUS) return carded.push(...resolve(raw, had));
      if (had.length) return ambiguous.push({ name: raw, n: had.length });
      const any = all.filter(r => idsNameMatch(raw, r.name));
      const off = any.find(r => whyOff(r, narrow) || (want && r.kind !== want));
      if (any.length && off) return filtered.push({ name: raw, who: off.name, why: want && off.kind !== want ? "is " + (IDS_KIND_ONE[off.kind] || off.kind) + ", not " + (IDS_KIND_ONE[want] || want) : whyOff(off, narrow), rec: off });
      if (any.length) return notWaiting.push({ name: raw, who: any[0].name });
      missing.push(raw);
    });
  };
  if ((p.ids || []).length || (p.names || []).length) named(p.ids, p.names, true);
  else pool.forEach(r => { if (okKind(r) && okCentre(r) && okWhich(r) && okDate(r) && okNum(r) && okPhoto(r)) hits.push(r); });
  if (p.also) named(p.also.ids, p.also.names, false);
  // Left out as asked: matched across everyone, so "not Ada" works however Ada got in.
  const out = new Set();
  const ex = p.exclude || {};
  (ex.ids || []).forEach(raw => resolve(raw, findId(all, norm(raw))).forEach(r => out.add(r.key)));
  (ex.names || []).forEach(raw => resolve(raw, all.filter(r => idsNameMatch(raw, r.name))).forEach(r => out.add(r.key)));
  const uniq = list => { const seen = new Set(); return list.filter(r => !seen.has(r.key) && seen.add(r.key)); };
  const found = uniq(hits);
  const excluded = found.filter(r => out.has(r.key));
  const kept = found.filter(r => !out.has(r.key));
  const blocked = kept.filter(blockedOf);
  let pick = kept.filter(r => !blockedOf(r));
  // "The last 20 who joined": the most recent first, so the limit keeps the newest.
  if (p.latest) pick = pick.slice().sort((a, b) => String(b.day || "").localeCompare(String(a.day || "")));
  const max = Math.min(p.limit || IDS_ASK_PICK_MAX, IDS_ASK_PICK_MAX);
  const cut = Math.max(0, pick.length - max);
  if (cut) pick = pick.slice(0, max);
  /* A name nobody has: the closest names on the lists, so a reversed or
     misspelt name ("Taiwo Ayomide" for "Ayomide Taiwo-Bello") is one tap away. */
  const suggest = missing.map(raw => ({ name: raw, near: idsClosest(raw, all, 2) })).filter(x => x.near.length);
  return { pick, blocked, missing, carded: uniq(carded).filter(r => !out.has(r.key)), ambiguous, cut, excluded, filtered, notWaiting, twoLists, suggest, asked, resolved };
}

/* When fewer cards go on than people were named, the count says why in the
   same line ("4 named: 1 has no photo yet"), so "3 cards" never reads as a
   name the assistant lost. */
function idsPlanGapNote(sel) {
  if (!sel.asked || sel.pick.length >= sel.asked) return "";
  const parts = [];
  if (sel.blocked.length) parts.push(sel.blocked.length + " no photo yet");
  if (sel.carded.length) parts.push(sel.carded.length + " already carded");
  if (sel.filtered.length) parts.push(sel.filtered.length + " kept off by the filter");
  if (sel.notWaiting.length) parts.push(sel.notWaiting.length + " not waiting for a card");
  if (sel.missing.length) parts.push(sel.missing.length + " not found");
  if (sel.ambiguous.length) parts.push(sel.ambiguous.length + " matching several people");
  if (sel.excluded.length) parts.push(sel.excluded.length + " left out as asked");
  return sel.asked + " named" + (parts.length ? ": " + parts.join(", ") : "");
}

/** "6–12 Oct", "since 6 Oct", "until 12 Oct". */
function idsAskDays(a, b) {
  const f = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return a && b ? (a === b ? f(a) : f(a) + "–" + f(b)) : a ? "since " + f(a) : "until " + f(b);
}

/* What the plan selects, in the operator's words — built here from the
   plan, never from the model's prose — each with how to take it out. */
const idsPlanWithout = (p, keys) => { const n = Object.assign({}, p); keys.forEach(k => { delete n[k]; }); return n; };
const idsPlanDropFrom = (p, field, sub, value) => {
  const n = Object.assign({}, p);
  if (sub) {
    const g = Object.assign({}, n[field] || {});
    g[sub] = (g[sub] || []).filter(x => x !== value);
    if (!g[sub].length) delete g[sub];
    if (Object.keys(g).length) n[field] = g; else delete n[field];
  } else {
    n[field] = (n[field] || []).filter(x => x !== value);
    if (!n[field].length) delete n[field];
  }
  return n;
};
function idsPlanWhat(p, sel) {
  const out = [];
  /* A matched name shows as the record has it; a number shows with whose it is. */
  const rn = (sel && sel.resolved) || {};
  const nm = v => rn[v] || v, idl = v => rn[v] ? v + " · " + rn[v] : v;
  const targeted = (p.ids || []).length || (p.names || []).length;
  out.push({ label: p.which === "reprint" ? "Reprints" : p.which === "all" ? "Every waiting card" : targeted ? "Named cards" : "New cards",
    drop: p.which && p.which !== "new" ? q => idsPlanWithout(q, ["which"]) : null });
  if (p.kind) out.push({ label: IDS_KIND_PLURAL[p.kind] || p.kind, drop: q => idsPlanWithout(q, ["kind"]) });
  (p.notKinds || []).forEach(k => out.push({ label: "no " + idsKindWords(k), tone: "out", drop: q => { const n = Object.assign({}, q); n.notKinds = (n.notKinds || []).filter(x => x !== k); if (!n.notKinds.length) delete n.notKinds; return n; } }));
  Object.keys(p.kindOf || {}).forEach(nm => out.push({ label: (rn[nm] || nm) + " as " + (IDS_KIND_ONE[p.kindOf[nm]] || p.kindOf[nm]).replace(/^an? /, ""), drop: q => { const n = Object.assign({}, q); n.kindOf = Object.assign({}, n.kindOf); delete n.kindOf[nm]; if (!Object.keys(n.kindOf).length) delete n.kindOf; return n; } }));
  if (p.centre) out.push({ label: p.centre === "none" ? "no centre on the record" : p.centre, drop: q => idsPlanWithout(q, ["centre"]) });
  (p.centres || []).forEach(c => out.push({ label: c, drop: q => { const n = idsPlanDropFrom(q, "centres", null, c); if ((n.centres || []).length === 1) { n.centre = n.centres[0]; delete n.centres; } return n; } }));
  if (p.hasPhoto != null) out.push({ label: p.hasPhoto ? "with a photo" : "no photo yet", drop: q => idsPlanWithout(q, ["hasPhoto"]) });
  if (p.dateFrom || p.dateTo) out.push({ label: (p.kind === "member" ? "joined " : "registered ") + idsAskDays(p.dateFrom, p.dateTo), drop: q => idsPlanWithout(q, ["dateFrom", "dateTo"]) });
  if (p.numFrom != null || p.numTo != null) {
    const pad = v => p.numPrefix ? p.numPrefix + "-" + String(v).padStart(3, "0") : v;
    out.push({ label: "numbers " + (p.numFrom != null ? pad(p.numFrom) : "…") + "–" + (p.numTo != null ? pad(p.numTo) : "…"), drop: q => idsPlanWithout(q, ["numFrom", "numTo", "numPrefix"]) });
  }
  (p.ids || []).forEach(v => out.push({ label: idl(v), drop: q => idsPlanDropFrom(q, "ids", null, v) }));
  (p.names || []).forEach(v => out.push({ label: nm(v), drop: q => idsPlanDropFrom(q, "names", null, v) }));
  ["ids", "names"].forEach(k => ((p.also || {})[k] || []).forEach(v => out.push({ label: "+ " + (k === "ids" ? idl(v) : nm(v)), tone: "add", drop: q => idsPlanDropFrom(q, "also", k, v) })));
  ["ids", "names"].forEach(k => ((p.exclude || {})[k] || []).forEach(v => out.push({ label: "not " + (k === "ids" ? idl(v) : nm(v)), tone: "out", drop: q => idsPlanDropFrom(q, "exclude", k, v) })));
  if (p.limit) out.push({ label: (p.latest ? "the " + p.limit + " most recent" : "at most " + p.limit), drop: q => idsPlanWithout(q, ["limit", "latest"]) });
  if (p.cause) out.push({ label: IDS_ASK_CAUSE[p.cause] || p.cause, drop: q => idsPlanWithout(q, ["cause"]) });
  return out;
}

/* Questions are answered here, from what the studio holds — the checks it
   runs, the queue, the records — never by a model, because the answer has to
   be true of THIS sheet and THESE people. Returns null when the text is not a
   question this can answer; the request then goes to the planner.
   `c` is the studio's state, built in ids-app.jsx (askCtx). */
const IDS_ASK_CAUSE = { lost: "lost: new QR", never_received: "never received: new QR", damaged: "damaged", name: "details changed" };
const IDS_ASK_SEL_KEYS = ["kind", "notKinds", "kindOf", "centre", "centres", "which", "ids", "names", "also", "exclude", "dateFrom", "dateTo", "numFrom", "numTo", "numPrefix", "limit", "latest", "hasPhoto"];
/** The acts a plan asks for, in order ("improve the photos, then ask the rest for one"). */
const idsPlanActs = p => (p && (p.acts || (p.do ? [].concat(p.do) : []))) || [];
const idsPlanHasSel = p => IDS_ASK_SEL_KEYS.some(k => p && p[k] !== undefined);
function idsAskIsQuestion(text) {
  const t = String(text || "").trim().toLowerCase();
  if (/^(can|could|would|will) you\b/.test(t) && !/\b(help|do|tell|explain|show)\b/.test(t)) return false;   // a request, politely put
  return /\?$/.test(t) || /^(why|what|what's|whats|how|who|who's|whos|which|where|when|is|are|do|does|did|has|have|can|any|tell me|show me|explain)\b/.test(t);
}
/* The studio's own vocabulary, explained in its own terms. Matched only on a
   question that asks what something is or means, so "make it a proof" is
   still a request and "what is a proof?" is answered. */
const IDS_ASK_FAQ = [
  [/\breprints?\b.*\b(new|first)\b|\b(new|first)\b.*\breprints?\b|\bwhat('s| is) a reprint\b/, "A **new** card is somebody’s first. A **reprint** replaces a card they already have: lost, damaged, never received, or details that changed. A reprint uses the current design; a lost or never-received card also gets a new QR, so the old card stops opening the gate."],
  [/\bblocked\b/, "**Blocked** means there is no approved photo yet, so the card can’t print. Ask for a photo from their row (or say “ask them for photos”), or add one yourself with the camera button. They print once a photo is approved."],
  [/\bproofs?\b/, "A **proof** is a test print: 150 dpi, “PROOF” across every card, and it doesn’t count as anyone having a card. Use it to check a design or a batch before the real run."],
  [/\bpacking list\b/, "The **packing list** is an extra first page listing every sheet and slot with the person on it, to tick off as you cut, so a card never goes to the wrong person."],
  [/\b(long|short)[- ]edge\b|\bduplex\b|\bdouble[- ]sided\b/, "**Long edge** is the usual double-sided setting: the sheet flips left to right, so the backs are mirrored across each row. **Short edge** flips top to bottom; the backs are drawn upside down to match. Use whichever your printer’s duplex setting says."],
  [/\b(cut|crop|trim) marks?\b/, "**Cut marks** are short lines just outside the grid at every card edge, to line the cutter up. Leave them on unless your print shop asks for a clean sheet."],
  [/\bdpi\b|\bimage quality\b|\bresolution\b/, "**DPI** is how finely each card is drawn in the PDF: 150 for proofs, 300 for normal printing, 600 for the sharpest text and QR codes (a bigger, slower file)."],
  [/\b(skip|used) slots?\b|\bpart[- ]used\b/, "**Skip used slots** is for a sheet of card stock you have already printed part of: the first sheet starts after that many slots, so nothing prints on cards already cut."],
  [/\bnew sheet for each\b|\bsplit by cent(re|er)\b|\bpiles?\b/, "**New sheet for each centre** starts a fresh sheet for every centre that has at least a sheet’s worth of cards, so each centre’s cards come out as their own pile. Smaller groups share a sheet, so no card stock is wasted."],
  [/\bdivision\b/, "A **blank division** means the member’s record has no track or division, so that line on the card prints empty. Fix it on their record in the Control Room, or print as it is."],
  [/\blost\b|\bqr\b|\bold card\b/, "When a card is **lost or never received**, its reprint gets a new QR code and the old card stops opening the gate. Other reprints keep the QR they had, so the old card works until it is handed back."],
  [/\bupload(ed|s)?\b|\bmade elsewhere\b/, "**Uploaded** cards are finished images made somewhere else (a printer’s proof, a partner’s badge). Name them “…-front” and “…-back” and they pair up; choose copies, and check the dpi and fit chips before printing."],
  [/\bid numbers?\b|\bmember ids?\b|\bprinted ids?\b/, "A member’s printed ID is year-prefixed (026-014) and is theirs for good; a member with no ID is given one when you print, and it is never reissued. Summer School participants’ IDs are centre-prefixed (EG-26-001) and last for the season."],
  [/\bdesigns?\b|\btemplates?\b/, "Each card type prints with the design assigned to it in **Settings → Designs**: a published design from the Design Studio, or the standard card. Drafts never print, and every run logs the design version it used."],
];
function idsAskFaq(t) {
  if (!/\b(what|what's|whats|explain|mean|means|meaning|difference|how does|why does|what does)\b/.test(t)) return null;
  const hit = IDS_ASK_FAQ.find(([re]) => re.test(t));
  return hit ? hit[1] : null;
}
const idsList = (names, max) => names.slice(0, max || 8).join(", ") + (names.length > (max || 8) ? " and " + (names.length - (max || 8)) + " more" : "");
/* Questions about printing that has happened: answered from the print log,
   which the studio reads from the server. */
function idsAskIsHistory(text) {
  const t = String(text || "").toLowerCase();
  return idsAskIsQuestion(text) && /\b(last (print|run|batch|time)|printed (today|yesterday|this week|last week)|print log|recent (runs?|prints?)|(failed|didn.t print|not printed)|history of (the )?print|what did (we|i) print|how many (did )?(we|i) print)\b/.test(t);
}
function idsAskHistory(text, runs) {
  const t = String(text || "").toLowerCase();
  if (!runs.length) return { text: "Nothing has been printed here yet: the print log is empty." };
  const day = d => String(d || "").slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const wk = (() => { const d = new Date(); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return d.toISOString().slice(0, 10); })();
  const typeW = { new: "new cards", reprint: "reprints", proof: "a proof", external: "uploaded cards", mixed: "new cards and reprints" };
  const line = r => "**" + r.runId + "**, " + r.at + (r.by ? " by " + r.by : "") + ": " + r.cards + " " + (r.cards === 1 ? "card" : "cards") + " (" + (typeW[r.type] || r.type) + ")" + (r.failed ? ", **" + r.failed + " not printed**" : "") + ".";
  if (/\b(failed|didn.t print|not printed)\b/.test(t)) {
    const bad = runs.filter(r => r.failed);
    if (!bad.length) return { text: "No card in the recent runs was marked as not printed." };
    return { text: bad.length + " recent " + (bad.length === 1 ? "run has" : "runs have") + " cards marked as not printed:\n\n" + bad.slice(0, 5).map(line).join("\n\n") + "\n\nOpen a run to reprint its failures.", runs: bad.slice(0, 3) };
  }
  const pick = /\btoday\b/.test(t) ? ["today", runs.filter(r => day(r.iso) === today)] : /\byesterday\b/.test(t) ? ["yesterday", runs.filter(r => day(r.iso) === yest)]
    : /\bthis week\b/.test(t) ? ["this week", runs.filter(r => day(r.iso) >= wk)] : null;
  if (pick) {
    const [when, list] = pick;
    if (!list.length) return { text: "Nothing was printed " + when + "." };
    const n = list.reduce((k, r) => k + (r.proof ? 0 : r.cards), 0);
    return { text: "**" + n + " " + (n === 1 ? "card" : "cards") + "** printed " + when + " in " + list.length + " " + (list.length === 1 ? "run" : "runs") + (list.some(r => r.proof) ? " (proofs not counted)" : "") + ":\n\n" + list.slice(0, 5).map(line).join("\n\n"), runs: list.slice(0, 3) };
  }
  const r = runs[0];
  return { text: "The last run was " + line(r) + (r.design ? " Design: " + r.design + (r.version ? " " + r.version : "") + "." : ""), runs: [r] };
}
/* ── Photo requests, after they have gone ────────────────────────────────
   "How is the photo request going?", "who has sent a photo?", "remind the
   rest", "download the list": answered from the server's campaigns
   (admin.ids.photo.campaigns), with the next useful press as a button. Reply
   buttons are data ({label, act, arg}), because the chat is kept as JSON. */
function idsAskIsPhotoReq(text) {
  const t = String(text || "").toLowerCase();
  return /\b(photo (requests?|asks?)|requests? for photos?|asked for (a |their )?photos?|(sent|send|sending) (in |us )?(a |their )?photos?|photos? (came|come|coming|arrived|back|in yet|so far)|who (has|have|hasn.?t|haven.?t) (sent|replied|answered)|replied|answered the (photo )?request)\b/.test(t)
    && (idsAskIsQuestion(text) || /\b(status|progress|update)\b/.test(t)) && !/\b(remind|chase|nudge)\b/.test(t)
    // "Who hasn't been asked?" is about the people waiting, answered from the studio's own list.
    && !/(n['’]t|\bnot|\bnever|\byet to) (been )?asked\b|\bunasked\b/.test(t);
}
function idsAskIsRemind(text) {
  const t = String(text || "").toLowerCase();
  return /\b(remind|chase|nudge|follow up( with)?)\b/.test(t) && /\b(photos?|them|those|people|ones|rest|everyone|parents?)\b/.test(t) && !/\b(what|how|when)\b.*\?$/.test(t);
}
function idsAskIsExport(text) {
  const t = String(text || "").toLowerCase();
  return /\b(download|export|csv|spreadsheet|excel|send me)\b/.test(t) && /\b(photos?|waiting|blocked|list|unreachable|no email|who)\b/.test(t);
}
const idsDay = iso => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
function idsPhotoReqAnswer(campaigns) {
  const mine = campaigns.filter(c => c.people > 0);
  if (!mine.length) return { text: "No photo request has been sent from here yet. Say “ask the ones with no photo for photos” and I’ll open one, with the count and the words, for you to send." };
  const c = mine[0];
  const sending = c.status !== "done";
  const unreach = c.counts.unreachable || 0;
  const head = "**Photo request of " + idsDay(c.createdAt) + "** to " + c.people + (c.people === 1 ? " person" : " people") + ": "
    + "**" + c.arrived + (c.arrived === 1 ? " photo" : " photos") + " in**, " + c.stillWaiting + " still waiting"
    + (unreach ? " (" + unreach + " of them have no email or guardian on file, so need asking in person)" : "") + "."
    + (sending ? " " + c.counts.queued + " messages are still going out." : "");
  const rem = c.remindedAt ? "A reminder went on " + idsDay(c.remindedAt) + "; a request gets one."
    : c.canRemind ? "You can send **one reminder** now to the " + (c.stillWaiting - unreach) + " who were reached and still haven’t sent one."
    : c.stillWaiting && !sending ? "One reminder can go from " + idsDay(c.remindFrom) + "." : "";
  const older = mine.slice(1, 4).map(o => idsDay(o.createdAt) + ": " + o.people + " asked, " + o.arrived + " in").join(" · ");
  const btns = [];
  if (c.canRemind) btns.push({ label: "Send the reminder", icon: "bell", act: "remind", arg: c.campaignId });
  if (c.stillWaiting) btns.push({ label: "Download who’s still waiting", icon: "download-simple", act: "csvCampaign", arg: c.campaignId });
  return { text: head + (rem ? "\n\n" + rem : "") + (older ? "\n\nEarlier: " + older + "." : ""), btns };
}
/** A CSV the operator downloads; every cell guarded against spreadsheet formulas (nggCsvCell). */
function idsCsv(name, header, rows) {
  const cell = typeof nggCsvCell === "function" ? nggCsvCell : (v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"');
  const csv = "﻿" + [header.map(cell).join(",")].concat(rows.map(r => r.map(cell).join(","))).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function idsAskAnswer(text, c) {
  if (!idsAskIsQuestion(text)) return null;
  const t = String(text || "").toLowerCase();
  const n = c.n, sheets = c.sheets, cardsW = k => k + " " + (k === 1 ? "card" : "cards"), sheetsW = k => k + " " + (k === 1 ? "sheet" : "sheets");
  // "Can you help position the image?" is a request about a photo, not a request for this list.
  if (/\b(what can you do|what do you do|help|how do (i|you) use|how does this work|what can i (say|ask))\b/.test(t) && !/\b(photos?|pictures?|images?|pics?|faces?|backgrounds?|bg|cards?|sheet|print\w*|position|crop|zoom|move)\b/.test(t)) {
    return "I set up the sheet from what you write, and answer questions about it from the studio’s own records.\n\n"
      + "**Choose who**: “new cards for Egbeda members”, “reprint 026-003 and 026-014”, “participants who registered this week”, “volunteers, by name”.\n\n"
      + "**Change it**: “fronts only”, “only Ijaiye”, “add 026-010”, “not Ada”, “make it A3”, “margin 5mm”, “skip the first 3 slots”, “make it a proof”.\n\n"
      + "**Act**: “fill the gaps”, “ask the ones with no photo for photos”, “improve the photos and remove their backgrounds”, “help position Ada’s photo”, “clear the sheet”.\n\n"
      + "**Photos**: press 📎 to add photos. Name each file after the person or their ID (“Ada Obi.jpg”, “026-014.png”) and I match them; anyone I can’t match, you pick.\n\n"
      + "**Ask**: “why can’t I print yet?”, “who’s blocked?”, “who’s on the sheet?”, “has Ada Obi got a card?”, “how much card stock?”.\n\n"
      + "**Photo requests**: “how is the photo request going?”, “remind the ones who haven’t sent one”, “download the list of who has no photo”. A request to hundreds is one press: you see who it reaches and the exact words first.\n\n"
      + "I can’t print and I can’t mark anyone as printed: Print stays your press, with the count on it.";
  }
  // A person, by printed ID or name (a near spelling counts). Each comes back with what can be done for them.
  const people = c.lookup(text);
  if (people.length) {
    return { people: people.slice(0, 5).map(p => p.key), text: (people.some(p => p.near) ? "Closest match" + (people.length > 1 ? "es" : "") + " for that name:\n\n" : "")
      + people.slice(0, 5).map(p => "**" + p.name + "**" + (p.displayId ? " (" + p.displayId + (p.centre ? ", " + p.centre : "") + ")" : p.centre ? " (" + p.centre + ")" : "") + " " + p.status + ".").join("\n\n")
      + (people.length > 5 ? "\n\n" + (people.length - 5) + " more match. Add a surname or the ID." : "") };
  }
  const faq = idsAskFaq(t);
  if (faq) return faq;
  if (/\b(blocked|no photo|without (a )?photo|missing photos?|need(s)? (a )?photos?|waiting (for|on) (a )?photos?|asked for (a )?photos?)\b/.test(t)) {
    if (!c.blockedList.length) return "Nobody is blocked. Everyone waiting has a photo.";
    if (/(n['’]t|\bnot|\bnever|\byet to)\b.*\basked\b|\bunasked\b/.test(t)) {
      const un = c.blockedList.filter(p => !p.asked);
      return un.length ? "**" + un.length + "** with no photo " + (un.length === 1 ? "hasn’t" : "haven’t") + " been asked in the last 3 days: " + idsList(un.map(p => p.name)) + ".\n\nSay “ask them for photos” and I’ll open the request for them."
        : "Everyone with no photo has been asked in the last 3 days. Asking again needs a press on their row.";
    }
    const asked = c.blockedList.filter(p => p.asked).length;
    return "**" + c.blockedList.length + "** " + (c.blockedList.length === 1 ? "person is" : "people are") + " waiting for a photo: " + idsList(c.blockedList.map(p => p.name)) + "."
      + (asked ? " " + asked + " " + (asked === 1 ? "has" : "have") + " been asked already." : "") + "\n\nSay “ask them for photos” and I’ll open the request, with the count, for you to send.";
  }
  if (/\b(on the sheet|who('s| is) (on|printing)|which cards|what('s| is) on)\b/.test(t)) {
    if (!n) return "The sheet is empty.";
    return "**" + cardsW(n) + "** on " + sheetsW(sheets) + ": " + idsList(c.onSheet) + ".";
  }
  if (/\b(print|ready|stop|stopping|can i)\b/.test(t) && !/\b(stock|paper)\b/.test(t)) {
    if (!n) return "Nothing is on the sheet yet, so there is nothing to print. Tell me who, for example “new cards for every member at Egbeda”.";
    if (c.block) return "Not yet. " + (c.bad.length ? c.bad.join(" ") : c.block + ".") + " Fix " + (c.bad.length > 1 ? "those" : "that") + ", then press **Print " + n + "**.";
    return "You **can** print. The sheet has **" + cardsW(n) + "** on " + sheetsW(sheets) + " and every check passes. Press **Print " + n + "** when you’re ready."
      + (c.blocked ? "\n\nNote: " + c.blocked + " " + (c.blocked === 1 ? "person is" : "people are") + " left out because they have no photo yet." : "")
      + (c.warn.length ? "\n\nWorth a look first: " + c.warn.join(" ") : "");
  }
  if (/\b(stock|paper|sheets?|how much)\b/.test(t)) {
    if (!n) return "No card stock yet: the sheet is empty.";
    return "**" + sheetsW(c.stock.sheets) + "** of card stock, " + c.stock.sides + " printed " + (c.stock.sides === 1 ? "side" : "sides") + ", " + c.stock.used + "% of the slots used."
      + (c.gap ? " The last sheet has " + c.gap + " empty " + (c.gap === 1 ? "slot" : "slots") + (c.fillable ? "; say “fill the gaps” to use them." : ".") : "");
  }
  if (/\b(centres?|centers?|where)\b/.test(t) && c.byCentre.length) {
    return "Waiting for a card, by centre: " + c.byCentre.map(x => x.centre + " " + x.n).join(", ") + ".";
  }
  if (/\b(how many|count|left|waiting|queue)\b/.test(t)) {
    return "**" + n + "** on the sheet (" + sheetsW(sheets) + "). " + c.ready + " more " + (c.ready === 1 ? "is" : "are") + " ready to add, " + c.reprints + " waiting for a reprint, and " + c.blocked + " waiting for a photo.";
  }
  return null;
}

/* What a command will do, and what it did, in the operator's words. */
const IDS_ASK_SET_KEYS = ["paper", "backs", "marks", "dpi", "order", "margin", "gap", "skip", "breakBy", "packing", "proof"];
function idsCmdLabel(k, v, st) {
  switch (k) {
    case "paper": return "paper " + ((IDS_PAPERS[v] || [v])[0]);
    case "backs": return ((IDS_BACKS.find(b => b[0] === v) || [v, v])[1]).toLowerCase();
    case "marks": return v ? "cut marks on" : "cut marks off";
    case "dpi": return v + " dpi";
    case "order": return "sorted by " + ((IDS_ORDERS.find(o => o[0] === v) || [v, v])[1]).toLowerCase();
    case "margin": return "margin " + v + " mm";
    case "gap": return "gap " + v + " mm";
    case "skip": return v ? "skip " + v + " used " + (v === 1 ? "slot" : "slots") + " on sheet 1" : "no slots skipped";
    case "breakBy": return v ? "a new sheet for each " + (st && st.order === "kind" ? "kind" : "centre") + " that fills one" : "groups share sheets";
    case "packing": return v ? "packing list on" : "no packing list";
    case "proof": return v ? "a proof: 150 dpi, watermarked" : "not a proof";
    default: return k;
  }
}
function idsCmdPreview(plan, st) {
  const out = IDS_ASK_SET_KEYS.filter(k => plan[k] !== undefined).map(k => "set " + idsCmdLabel(k, plan[k], st));
  const acts = idsPlanActs(plan), ph = plan.photo || {};
  if (acts.includes("clear")) out.push("take every card off the sheet");
  if (acts.includes("fill")) out.push("fill the empty slots on the last sheet");
  if (acts.includes("improvePhotos")) out.push("open Improve photos" + [ph.removeBg && "a plain grey background", ph.brighten && "brighter", ph.sharpen && "sharper", ph.zoom > 1 && "closer on the face"].filter(Boolean).map((x, i) => (i ? ", " : " with ") + x).join("") + " (you check it and press Improve)");
  if (acts.includes("adjustPhoto")) out.push("open the framing tool to position the photo");
  if (acts.includes("askPhotos")) out.push("open a photo request for the people with no photo" + ((plan.centres || []).length ? " at " + plan.centres.join(" and ") : plan.centre && plan.centre !== "none" ? " at " + plan.centre : "") + " (you confirm the count before it sends)");
  return out;
}

/** **bold** in a sentence. Nothing else is interpreted. */
function IdsAskMini({ text }) {
  return String(text).split("\n\n").map((para, i) => (
    <p key={i} className="ids-ai-p">{para.split(/(\*\*[^*]+\*\*)/).map((bit, j) => /^\*\*[^*]+\*\*$/.test(bit) ? <b key={j}>{bit.slice(2, -2)}</b> : bit)}</p>
  ));
}

const IDS_ASK_MODE_KEY = "ngg.ids.ask.mode";
function idsAskModeGet() { try { return localStorage.getItem(IDS_ASK_MODE_KEY) === "act" ? "act" : "ask"; } catch (_) { return "ask"; } }

/* Typing a name brings up the people it could be, without an @: the last one
   to three words before the caret are looked up, unless one of them is a word
   of a request ("reprint", "members", "front") rather than part of a name. */
const IDS_ASK_STOP = new Set(("a an and at all any are as back backs be by can card cards centre centres do every everyone fill for fix "
  + "from front fronts gap gaps give has have how i improve in is it joined last make me member members my new no not "
  + "of on one only or our photo photos please print printed proof put registered reprint reprints school send sheet sheets "
  + "show some summer the their them these this those to today up volunteer volunteers want was week what when where which who "
  + "why with yesterday you a4 participants participant ask add remove except without but also plus").split(" "));
function idsAskNameFrag(before) {
  const m = /([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’-]*(?:\s+[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’-]*){0,2})$/.exec(before || "");
  if (!m) return [];
  const words = m[1].split(/\s+/), out = [];
  for (let k = Math.min(3, words.length); k >= 1; k--) {
    const w = words.slice(words.length - k);
    if (w.some(x => IDS_ASK_STOP.has(x.toLowerCase()))) continue;
    const q = w.join(" ");
    if (q.length >= 3) out.push({ q, at: before.length - q.length });
  }
  return out;
}

/* A pasted list (numbered, bulleted, or rows copied from a spreadsheet) is
   read as one request: each line is a person, and a line naming exactly one
   record becomes that record's ID, which keeps a long list inside the
   request's length and means nobody is mistaken for a namesake. A first line
   that is an instruction ("Reprint these:") leads the request. */
const IDS_ASK_ID_RE = /^(?:\d{3}-\d{3}|[A-Z]{2,4}-\d{2}-\d{3}|SUM-[\w-]+|NGG-[\w-]+|VOL-[\w-]+)$/i;
function idsAskPasteList(text, exact) {
  const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const bullet = /^(?:\(?\d{1,3}[.)]|\d{1,3}\s*-|[-*•–·])\s*/;
  let head = "";
  if (/:$/.test(lines[0]) || (!bullet.test(lines[0]) && /\b(print|reprint|cards?|proof|fronts?|backs?)\b/i.test(lines[0]) && !/\t/.test(lines[0]))) head = lines.shift().replace(/:$/, "").trim();
  const items = lines.map(l => {
    const cells = l.split(/\t|\s{3,}|\s\|\s/).map(c => c.replace(bullet, "").replace(/[,;.]+$/, "").trim()).filter(c => c && !/^\d{1,3}$/.test(c));
    const id = cells.find(c => IDS_ASK_ID_RE.test(c));
    return id || cells.filter(c => /[A-Za-z]/.test(c)).sort((a, b) => b.length - a.length)[0] || "";
  }).filter(Boolean);
  if (items.length < 2) return null;
  let matched = 0;
  const shown = items.map(x => {
    if (IDS_ASK_ID_RE.test(x)) return x;
    const r = exact ? exact(x) : [];
    if (r.length === 1 && r[0].displayId) { matched++; return r[0].displayId; }
    return x;
  });
  const list = shown.length === 2 ? shown.join(" and ") : shown.slice(0, -1).join(", ") + " and " + shown[shown.length - 1];
  return { text: (head || "Cards for") + " " + list, n: items.length, matched };
}

/** The pane: transcript, composer, and the one live plan. */
function IdsAssistant({ A, onClose }) {
  const [text, setText] = React.useState("");
  const [recent, setRecent] = React.useState(idsAskRecent);
  const [hist, setHist] = React.useState(-1);
  const [pop, setPop] = React.useState(null);     // { kind: "people" | "keys", q, at }
  const [pick, setPick] = React.useState(0);
  const inputRef = React.useRef(null);
  const logRef = React.useRef(null);
  const fileRef = React.useRef(null);
  React.useEffect(() => { A.bindInput(inputRef); }, []); // eslint-disable-line
  React.useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [A.chat.length, A.busy, A.liveId]);
  const send = t => {
    const v = (t == null ? text : t).trim();
    if (!v || A.busy) return;
    setRecent(idsAskRemember(v)); setHist(-1); setPop(null);
    A.ask(v);
    setText("");
  };
  const people = pop && pop.kind === "people" ? A.people(pop.q) : [];
  const keysList = IDS_ASK_EXAMPLES.concat(recent.filter(x => !IDS_ASK_EXAMPLES.includes(x))).slice(0, 6);
  const choose = i => {
    if (pop.kind === "people") {
      const r = people[i];
      if (!r) return;
      /* Tagged with @: the ID, which is exact. Typed as a name: the name as
         the record has it, which still reads as the sentence it was. */
      const tag = pop.bare ? r.name : (r.displayId || r.name);
      const rest = x => x.slice(pop.at + (pop.bare ? 0 : 1) + pop.q.length);
      setText(x => { const after = rest(x); return x.slice(0, pop.at) + tag + (/^\s/.test(after) ? "" : " ") + after; });
    } else setText(keysList[i] || "");
    setPop(null);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  };
  const onChange = e => {
    const v = e.target.value, caret = e.target.selectionStart || v.length;
    setText(v); setHist(-1);
    const m = /(^|\s)@([^\s@]{0,24})$/.exec(v.slice(0, caret));
    if (m) { setPop({ kind: "people", q: m[2], at: caret - m[2].length - 1 }); setPick(0); return; }
    if (v === "?") { setPop({ kind: "keys" }); setPick(0); return; }
    // No @: the name being typed, longest reading first, if it is somebody's.
    const before = v.slice(0, caret);
    const frag = /[A-Za-z'’-]$/.test(before) ? idsAskNameFrag(before).find(f => { const hit = A.people(f.q); return hit.length && !hit.some(r => r.name.toLowerCase() === f.q.toLowerCase() && hit.length === 1); }) : null;
    if (frag) { setPop({ kind: "people", q: frag.q, at: frag.at, bare: true }); setPick(0); }
    else setPop(null);
  };
  const onKey = e => {
    const list = pop ? (pop.kind === "people" ? people : keysList) : null;
    if (list && list.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); return setPick(i => (i + 1) % list.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); return setPick(i => (i - 1 + list.length) % list.length); }
      // A suggestion for a typed name is taken with Tab; Enter still sends what was typed.
      if (e.key === "Tab" || (e.key === "Enter" && !pop.bare)) { e.preventDefault(); return choose(pick); }
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      if (pop) return setPop(null);
      if (text) return setText("");
      return onClose && onClose();
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); return send(); }
    // ↑ recalls the last request while the composer is empty, as a shell does.
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && recent.length && (!text || hist >= 0)) {
      e.preventDefault();
      const i = e.key === "ArrowUp" ? Math.min(recent.length - 1, hist + 1) : hist - 1;
      setHist(i); setText(i >= 0 ? recent[i] : "");
    }
  };
  const onPaste = e => {
    const raw = (e.clipboardData || window.clipboardData).getData("text");
    const L = idsAskPasteList(raw, A.exact);
    if (!L) return;
    e.preventDefault();
    const el = e.target, a = el.selectionStart || 0, b = el.selectionEnd || 0;
    const next = (text.slice(0, a) + L.text + text.slice(b)).slice(0, IDS_ASK_TEXT_MAX);
    setText(next); setPop(null);
    A.say(L.n + " people read from the list" + (L.matched ? ", " + L.matched + " matched to their ID" : "") + (next.length >= IDS_ASK_TEXT_MAX ? ". The list is longer than one request holds: send it in two." : "."));
  };
  // Starters come from the studio's real counts and centres; examples fill any gap.
  // With real starters, one example shows the other kind of request (by ID); without, the examples stand in.
  const base = A.starters && A.starters.length ? A.starters.concat(["Reprint 026-003 and 026-014"]) : IDS_ASK_EXAMPLES;
  // What is on screen comes first: a sheet with gaps, a block, cards with no photo.
  const onScreen = (A.next || []).filter(x => !recent.includes(x));
  const starters = recent.slice(0, 2).map(x => ({ x, recent: true })).concat(onScreen.map(x => ({ x, now: true })), base.filter(x => !recent.includes(x) && !onScreen.includes(x)).map(x => ({ x }))).slice(0, 6);
  /* Voice: the browser's own speech recognition, where it has one. Nothing is
     sent anywhere by the studio; the words land in the composer to be read
     and sent like typing. */
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef(null);
  const listen = () => {
    if (!SR) return;
    if (listening && recRef.current) { recRef.current.stop(); return; }
    const r = new SR();
    r.lang = "en-GB"; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => setText(Array.from(e.results).map(x => x[0].transcript).join(" "));
    r.onend = () => { setListening(false); inputRef.current && inputRef.current.focus(); };
    r.onerror = () => setListening(false);
    recRef.current = r; setListening(true);
    try { r.start(); } catch (_) { setListening(false); }
  };
  return (
    <section className="ids-ai" aria-label="Assistant">
      <div className="ids-ai-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
        {!A.chat.length && (
          <div className="ids-ai-hello">
            <p className="ids-ai-hello-h"><IdsIcon name="sparkle"/>Say what to print</p>
            <p className="ids-ai-p">I read a request into a plan and set up the sheet: who goes on it, and how it prints. I can’t print, and I can’t mark anyone as printed. That stays your press.</p>
            <ul className="ids-ai-starters" aria-label={recent.length ? "Recent and examples" : "Examples"}>
              {starters.map(({ x, recent: rc, now }) => (
                <li key={x}><button type="button" className={"ids-ai-starter" + (rc ? " is-recent" : "")} onClick={() => { setText(x); inputRef.current && inputRef.current.focus(); }}>
                  {rc ? <IdsIcon name="clock-counter-clockwise"/> : <IdsIcon name={now ? "lightning" : "arrow-up-right"}/>}<span>{x}</span>
                </button></li>
              ))}
              <li><button type="button" className="ids-ai-starter" onClick={() => { setText("What can you do?"); inputRef.current && inputRef.current.focus(); }}><IdsIcon name="question"/><span>What can you do?</span></button></li>
            </ul>
          </div>
        )}
        {A.chat.map(m => m.who === "me"
          ? <div key={m.id} className="ids-ai-me"><span>{m.text}</span></div>
          : <IdsAskReply key={m.id} m={m} A={A}/>)}
        {A.busy && <div className="ids-ai-reading" role="status"><span className="ids-ai-dots" aria-hidden="true"><i/><i/><i/></span>Reading…</div>}
        {!A.busy && A.chat.length > 0 && A.next.length > 0 && (
          <div className="ids-ai-next" role="group" aria-label="Suggested next steps">
            {A.next.map(x => <button key={x} type="button" className="ids-ai-nextbtn" onClick={() => send(x)}>{x}</button>)}
          </div>
        )}
      </div>
      <form className="ids-ai-compose" onSubmit={e => { e.preventDefault(); send(); }}>
        {pop && (pop.kind === "people" ? people.length > 0 : true) && (
          <ul id="ids-ai-pop" className="ids-ai-pop" role="listbox" aria-label={pop.kind === "people" ? "People" : "Shortcuts"}>
            {pop.kind === "people" ? <>
              {people.map((r, i) => (
                <li key={r.key} id={"ids-ai-opt-" + i} role="option" aria-selected={i === pick} className={i === pick ? "is-on" : ""} onMouseDown={e => { e.preventDefault(); choose(i); }}>
                  <b>{r.name}</b><span className="ids-mono">{r.displayId || "no ID yet"}</span><span>{r.centre || "No centre"}</span>
                </li>
              ))}
              {pop.bare && <li className="ids-ai-keys" aria-hidden="true"><kbd>Tab</kbd> use · <kbd>↓</kbd> next · <kbd>Esc</kbd> keep typing</li>}
            </> : <>
              {keysList.map((x, i) => <li key={x} role="option" aria-selected={i === pick} className={i === pick ? "is-on" : ""} onMouseDown={e => { e.preventDefault(); choose(i); }}>{x}</li>)}
              <li className="ids-ai-keys" aria-hidden="true"><kbd>/</kbd> focus · <kbd>↑</kbd> last request · <kbd>@</kbd> a person by ID · <kbd>Tab</kbd> use a suggestion · paste a list · <kbd>Esc</kbd> clear, then close</li>
            </>}
          </ul>
        )}
        <label htmlFor="ids-ai-in" className="ids-sr">Message the assistant</label>
        <textarea id="ids-ai-in" ref={inputRef} className="ids-ai-in" rows={2} value={text} maxLength={IDS_ASK_TEXT_MAX}
          placeholder={A.live ? IDS_ASK_REFINE_HINT : "Say what to print. Names come up as you type; Tab picks one. ? for shortcuts"}
          aria-autocomplete="list" aria-expanded={!!pop} aria-controls={pop ? "ids-ai-pop" : undefined}
          aria-activedescendant={pop && pop.kind === "people" && people[pick] ? "ids-ai-opt-" + pick : undefined}
          onChange={onChange} onKeyDown={onKey} onPaste={onPaste} onBlur={() => setTimeout(() => setPop(null), 120)}/>
        <div className="ids-ai-bar">
          <span className="ids-ai-mode" role="group" aria-label="Mode">
            <button type="button" aria-pressed={A.mode === "ask"} className={A.mode === "ask" ? "is-on" : ""} onClick={() => A.setMode("ask")} title="Suggests a plan; you press Apply"><IdsIcon name="chat-circle"/>Ask</button>
            <button type="button" aria-pressed={A.mode === "act"} className={A.mode === "act" ? "is-on" : ""} onClick={() => A.setMode("act")} title="Sets up the sheet straight away"><IdsIcon name="lightning"/>Act</button>
          </span>
          <span className="ids-grow"/>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => { A.upload(e.target.files); e.target.value = ""; }}/>
          <button type="button" className="ids-iconbtn" aria-label="Add photos" title="Add photos: name each file after the person or their ID" onClick={() => fileRef.current && fileRef.current.click()}><IdsIcon name="paperclip"/></button>
          {SR && <button type="button" className={"ids-iconbtn" + (listening ? " is-on" : "")} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak your request"} title={listening ? "Listening… press to stop" : "Speak your request"} onClick={listen}><IdsIcon name={listening ? "microphone-slash" : "microphone"}/></button>}
          {A.chat.length > 0 && <button type="button" className="ids-iconbtn" aria-label="New conversation" title="New conversation" onClick={A.reset}><IdsIcon name="note-pencil"/></button>}
          <button type="submit" className="ids-ai-send" aria-label="Send" disabled={!text.trim() || A.busy}><IdsIcon name="arrow-up"/></button>
        </div>
      </form>
      <p className="ids-ai-foot">Can’t print or mark anyone as printed · Enter to send</p>
    </section>
  );
}

function IdsAskReply({ m, A }) {
  // The AI is chosen automatically (api/_lib/ai.php ai_route), so the line says that it read it, not which one did.
  const by = m.by === "ai" ? "Read by the AI" : m.by === "rules" ? "Read by the studio’s rules" + (m.aiError ? " (the AI didn’t answer)" : "") : "";
  const live = m.id === A.liveId;
  if (m.kind === "error") return (
    <div className="ids-ai-card is-bad" role="alert">
      <p className="ids-ai-p"><IdsIcon name="warning-octagon"/> {m.text}</p>
      {m.retry && <div className="ids-ai-acts"><button type="button" className="ids-btn ids-btn--sm" onClick={A.retry}>Try again</button></div>}
    </div>
  );
  if (m.kind === "answer") return (
    <div className="ids-ai-card">
      <span className="ids-ai-who">Assistant</span>
      <IdsAskMini text={m.text}/>
      {(m.runs || []).length > 0 && (
        <div className="ids-ai-acts">{m.runs.map(r => <button key={r.runId} type="button" className="ids-btn ids-btn--sm" onClick={() => A.openRun(r)}><IdsIcon name="list-bullets"/>Open {r.runId}</button>)}</div>
      )}
      {(m.btns || []).length > 0 && (
        <div className="ids-ai-acts">{m.btns.map(b => <button key={b.act + b.label} type="button" className="ids-btn ids-btn--sm" disabled={A.busy} onClick={() => A.btn(b.act, b.arg)}>{b.icon && <IdsIcon name={b.icon}/>}{b.label}</button>)}</div>
      )}
      {(m.people || []).map(key => {
        const P = A.person(key);
        return P && P.acts.length > 0 && (
          <div key={key} className="ids-ai-person" role="group" aria-label={"For " + P.name}>
            <span className="ids-ai-person-n">{P.name}</span>
            {P.acts.map(a => <button key={a.label} type="button" className="ids-btn ids-btn--sm" onClick={a.run}>{a.label}</button>)}
          </div>
        );
      })}
    </div>
  );
  if (m.kind === "upload") return <IdsAskUpload m={m} A={A}/>;
  if (m.kind === "cmd") return (
    <div className={"ids-ai-card" + (m.pending ? "" : " is-done")}>
      <span className="ids-ai-who">Assistant{m.undone ? " · undone" : ""}</span>
      {m.pending ? <>
        <p className="ids-ai-p">I’ll {m.preview.join(", then ")}.</p>
        <div className="ids-ai-acts"><button type="button" className="ids-btn ids-btn--sm ids-btn--outline" onClick={() => A.apply(m)}>Apply</button></div>
      </> : <>
        {m.ran && m.ran.length > 0 && <ul className="ids-ai-ran" aria-label="What it did">{m.ran.map((x, i) => <li key={i}><IdsIcon name="check"/>{x}</li>)}</ul>}
        {(m.notes0 || []).concat(m.notes || []).map((x, i) => <p key={i} className="ids-ask-issue is-info"><IdsIcon name="info"/><span className="ids-grow">{x}</span></p>)}
        {(m.people || []).map(key => {
          const P = A.person(key);
          return P && P.acts.length > 0 && (
            <div key={key} className="ids-ai-person" role="group" aria-label={"For " + P.name}>
              <span className="ids-ai-person-n">{P.name}</span>
              {P.acts.map(a => <button key={a.label} type="button" className="ids-btn ids-btn--sm" onClick={a.run}>{a.label}</button>)}
            </div>
          );
        })}
        {m.undo && !m.undone && m.id === A.lastCmdId && <div className="ids-ai-acts"><button type="button" className="ids-btn ids-btn--sm" onClick={() => A.undoCmd(m)}>Undo</button></div>}
      </>}
      {by && <p className="ids-ai-by">{by}</p>}
    </div>
  );
  if (m.kind === "empty") return (
    <div className="ids-ai-card is-warn">
      <span className="ids-ai-who">Assistant</span>
      <p className="ids-ai-p">I couldn’t tell what to print or do from that. Name who (members, Summer School, volunteers), where, or the ID numbers; ask for something to be done (“improve the photos”, “fill the gaps”); or ask me a question about the sheet. “What can you do?” lists it all.</p>
      {(m.notes0 || []).map((x, i) => <p key={i} className="ids-ask-issue is-info"><IdsIcon name="info"/><span className="ids-grow">{x}</span></p>)}
      {by && <p className="ids-ai-by">{by}</p>}
    </div>
  );
  // A plan. The live one shows the sheet as it is now; an earlier one, what it said then.
  const r = live ? A.result : m.snap;
  if (!live) return (
    <div className={"ids-ai-card is-past"}>
      <span className="ids-ai-who">Assistant{m.undone ? " · undone" : m.pending ? "" : " · superseded"}</span>
      <p className="ids-ai-p"><b className="ids-mono">{r.n}</b> {r.n === 1 ? "card" : "cards"}{r.gapNote ? " (" + r.gapNote + ")" : ""}{r.what.length ? " · " + r.what.map(w => w.label).join(" · ") : ""}</p>
      {m.pending && !m.undone && (
        <div className="ids-ai-acts"><button type="button" className="ids-btn ids-btn--sm ids-btn--outline" onClick={() => A.apply(m)}>Apply</button></div>
      )}
      {by && <p className="ids-ai-by">{by}</p>}
    </div>
  );
  const L = A.live;
  return (
    <div className="ids-ai-card is-live">
      <span className="ids-ai-who">Assistant{r.refined ? " · updated" : ""}</span>
      {m.ran && m.ran.length > 0 && <ul className="ids-ai-ran" aria-label="What it did">{m.ran.map((x, i) => <li key={i}><IdsIcon name="check"/>{x}</li>)}</ul>}
      <p className="ids-ai-h">
        {r.n ? <><b className="ids-mono">{r.n}</b> {r.n === 1 ? "card" : "cards"} on the sheet</> : "Nothing to put on the sheet"}
        {r.n > 0 && L && <span className="ids-muted"> · {L.sheets} {L.sheets === 1 ? "sheet" : "sheets"}</span>}
        {r.gapNote && <span className="ids-muted"> · {r.gapNote}</span>}
      </p>
      <ul className="ids-ask-what" aria-label="What it understood">
        {r.what.map((w, i) => (
          <li key={i} className={w.tone ? "is-" + w.tone : ""}>
            {w.label}
            {w.drop && <button type="button" className="ids-ask-x" aria-label={"Take out " + w.label} onClick={() => A.drop(w.drop)}><IdsIcon name="x"/></button>}
          </li>
        ))}
      </ul>
      {r.n > 0 && L && <ul className="ids-ask-how" aria-label="Sheet settings">{L.settings.map((s, i) => <li key={i} className={s.changed ? "is-changed" : ""}>{s.changed ? "Changed: " : ""}{s.label}</li>)}</ul>}
      {r.issues.map((x, i) => (
        <p key={i} className={"ids-ask-issue is-" + x.tone}>
          <IdsIcon name={x.tone === "bad" ? "warning-octagon" : x.tone === "warn" ? "warning" : "info"}/>
          <span className="ids-grow">{x.text}</span>
          {x.action && <button type="button" className="ids-linkbtn" onClick={x.onAction}>{x.action}</button>}
          {(x.actions || []).map(a => <button key={a.label} type="button" className="ids-linkbtn" onClick={a.run}>{a.label}</button>)}
        </p>
      ))}
      {L && L.fill > 0 && (
        <p className="ids-ask-issue is-info">
          <IdsIcon name="squares-four"/>
          <span className="ids-grow">The last sheet has {L.gap} empty {L.gap === 1 ? "slot" : "slots"}.</span>
          <button type="button" className="ids-linkbtn" onClick={A.fill}>Fill {L.fill === 1 ? "it" : "them"} with {L.fill} more waiting {L.fill === 1 ? "card" : "cards"}</button>
        </p>
      )}
      <div className="ids-ai-acts">
        {r.n > 0 && (
          <button type="button" className="ids-btn ids-btn--sm ids-btn--outline" onClick={A.print} aria-disabled={!!(L && L.block) || undefined} title={L && L.block ? L.block : undefined}>
            <IdsIcon name="printer"/>Print {r.n} {r.n === 1 ? "card" : "cards"}
          </button>
        )}
        {A.canUndo && <button type="button" className="ids-btn ids-btn--sm" onClick={A.undo}>Undo</button>}
      </div>
      {L && L.block && <p className="ids-help">{L.block}</p>}
      {by && <p className="ids-ai-by">{by}</p>}
    </div>
  );
}

/* Photos added in the conversation: each file, who it is for (matched by its
   name, or picked here), then one Save for all of them with a verdict per
   photo. A reply restored after a refresh shows what happened, not the files. */
function IdsAskUpload({ m, A }) {
  const [find, setFind] = React.useState({});
  const rows = m.rows || [];
  const likely = m.likely || [];
  const ready = rows.filter(r => r.key).length;
  const nameOf = key => { const l = likely.find(x => x.key === key); if (l) return l.name; const p = A.person(key); return p ? p.name : key; };
  if (m.status === "done" || m.restored) {
    const res = m.results || [];
    const ok = res.filter(r => r.ok), bad = res.filter(r => !r.ok);
    return (
      <div className="ids-ai-card is-done">
        <span className="ids-ai-who">Assistant · photos</span>
        {!res.length && <p className="ids-ai-p">These photos weren’t saved before the page reloaded. Add them again with 📎.</p>}
        {ok.length > 0 && <ul className="ids-ai-ran" aria-label="Saved">{ok.map(r => <li key={r.key}><IdsIcon name="check"/>Saved {r.name}’s photo</li>)}</ul>}
        {bad.map(r => <p key={r.key} className="ids-ask-issue is-bad"><IdsIcon name="warning-octagon"/><span className="ids-grow">{r.name}: not saved — {r.why}.</span></p>)}
        {ok.length > 0 && !m.restored && <div className="ids-ai-acts"><button type="button" className="ids-btn ids-btn--sm" onClick={() => A.upToSheet(ok.map(r => r.key))}>Put {ok.length === 1 ? "them" : "them all"} on the sheet</button></div>}
      </div>
    );
  }
  return (
    <div className="ids-ai-card">
      <span className="ids-ai-who">Assistant · photos</span>
      <p className="ids-ai-p">{ready === rows.length ? "I matched every photo. Check them, then save." : ready ? ready + " of " + rows.length + " matched by file name. Choose who the others are for." : "Choose who each photo is for."}</p>
      <ul className="ids-ask-up" aria-label="Photos to save">
        {rows.map(r => {
          const q = find[r.uid] || "";
          const hits = q ? A.upPeople(q) : [];
          return (
            <li key={r.uid} className="ids-ask-up-row">
              <img src={r.thumb} alt={"Photo " + r.file} className="ids-ask-up-img"/>
              <div className="ids-ask-up-main">
                <span className="ids-ask-up-file ids-mono">{r.file}</span>
                <label className="ids-ask-up-who"><span className="ids-sr">Who is this photo for</span>
                  <select value={r.key} disabled={m.status === "saving"} onChange={e => A.upSet(m.id, r.uid, e.target.value)}>
                    <option value="">Choose who…</option>
                    {r.key && !likely.some(l => l.key === r.key) && <option value={r.key}>{nameOf(r.key)}</option>}
                    {["On the sheet", "Waiting for a photo"].map(g => likely.some(l => l.why === g) && (
                      <optgroup key={g} label={g}>{likely.filter(l => l.why === g).map(l => <option key={l.key} value={l.key}>{l.name}{l.displayId ? " · " + l.displayId : ""}</option>)}</optgroup>
                    ))}
                  </select>
                </label>
                {r.auto && r.key && <span className="ids-help">Matched from the file name</span>}
                <input className="ids-ask-up-find" type="search" placeholder="Or search a name or ID" aria-label={"Search who " + r.file + " is for"} value={q} disabled={m.status === "saving"}
                  onChange={e => setFind(f => Object.assign({}, f, { [r.uid]: e.target.value }))}/>
                {hits.length > 0 && <div className="ids-ask-up-hits" role="group" aria-label="Matches">
                  {hits.map(h => <button key={h.key} type="button" className="ids-btn ids-btn--sm" onClick={() => { A.upSet(m.id, r.uid, h.key); setFind(f => Object.assign({}, f, { [r.uid]: "" })); }}>{h.name}{h.displayId ? " · " + h.displayId : ""}</button>)}
                </div>}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="ids-ai-acts">
        <button type="button" className="ids-btn ids-btn--sm ids-btn--outline" disabled={!ready || m.status === "saving"} onClick={() => A.upSave(m)}>
          <IdsIcon name="upload-simple"/>{m.status === "saving" ? "Saving " + (m.done || 0) + " of " + ready + "…" : "Save " + ready + " " + (ready === 1 ? "photo" : "photos")}
        </button>
      </div>
      <p className="ids-help" role="status" aria-live="polite">{rows.length - ready ? (rows.length - ready) + " not matched yet: those aren’t saved." : "Each photo replaces the one on their record; it is checked like any headshot first."}</p>
    </div>
  );
}
