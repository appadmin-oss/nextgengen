/* ============================================================================
   Control Room v2 — Money › Conduct & fines. Filled into CR_TAB_DEFS.

   ONE home for fines. They used to be in three places that did not know about
   each other: the rules (amount, cap, on/off) only in the Club portal, the
   upload under Dues & arrears, and the calendars, thresholds and compliance
   board in the v1 `SummerPolicy` screen mounted whole into this tab. So an
   operator reading "capped" on an upload could not see or change the cap from
   the screen that said it, and the tab looked like a different product.

   Views, by the URL tail (ctx.sub), each offered only to whoever holds what
   its server ops gate on:
     ""            Fines        fees            the rules, the upload, the one-time clearance
     compliance    Compliance   people|summer   the board, and one person's record
     policy        Policy       summer          the enforcement thresholds
     calendar      Calendars    summer          the Summer and member programme days

   /control/money/fees/fines (the upload's old address) forwards here — see
   CR_SUB_ALIASES in cr-pages.jsx. Every rule this screen states is the
   server's; nothing here is enforced only in the browser.
   ========================================================================== */
/** The most fines one register cell may stand for. Mirrors FEES_FINE_COUNT_MAX (fees.php), which refuses past it. */
const CR_CF_COUNT_MAX = 20;
const CR_CF_VIEWS = [["", "Fines", ["fees"]], ["compliance", "Compliance", ["people", "summer"]], ["policy", "Policy", ["summer"]], ["calendar", "Calendars", ["summer"]]];
const CR_CF_DOW = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]];

/* ── Reading a fines sheet the way a person would ──────────────────────────
   Registers arrive as they were kept: a title line or two above the headings,
   "S/N" and "Names" for columns, one column per kind of fine ("Late",
   "Absent", "Total"), a TOTAL line at the bottom, a sheet per centre. The old
   reader took row one as the headings and looked for exact words, so a
   register with a title above it read as "no column for who is being fined".
   This finds the heading row, recognises a heading by what it means, splits a
   row with a column per kind into one fine per kind, and skips totals — and
   then SAYS how it read the file, so nobody has to trust it blind. Every
   matching decision is still the server's (fees.php, admin_fees_fine_import). */
/* Money a register carries that is NOT a fine. A "Dues" column used to fall
   through to the amount pattern below (it matches "due"), so arrears were
   posted as fines — and with a Fines column beside it, one of the two was
   dropped without a word. Each is its own kind of charge now. */
const CR_CF_FINE_KIND_COLS = [["dues", /\bdues\b|\bmonthly (fee|fees|dues|levy)\b|\bsubscriptions?\b|\blev(y|ies)\b|\barrears?\b/], ["membership", /\bmembership\b|\bregistration fees?\b/]];
const CR_CF_KIND_WORD = { fine: "Fine", dues: "Dues", membership: "Membership" };
const CR_CF_FINE_REASON_COLS = [["late", /\blate|lateness|tard/], ["absent", /absen|missed|truan/], ["equipment", /equip|damage|lost|broke/], ["conduct", /conduct|behaviou?r|indisciplin|misconduct/]];
function crCfFineHeadKey(h) { return String(h || "").toLowerCase().replace(/[₦#]/g, " naira ").replace(/\((n|ngn|naira)\)|\[(n|ngn)\]/g, " naira ").replace(/[^a-z0-9@/ ]+/g, " ").replace(/\s+/g, " ").trim(); }
/** What a heading means: a field, ["byReason", code], or null. */
function crCfFineField(h) {
  const k = crCfFineHeadKey(h);
  if (!k) return null;
  if (/^(s ?\/? ?n|sn|no|serial|s no|sno|#)$/.test(k)) return "serial";
  if (/e ?mail/.test(k)) return "email";
  if (/^(id|member|card|member no|member number|member id|memberid|display id|displayid|reg no|registration no|registration number|ngg id|ngg no|card no|card number|id no|id number)$/.test(k) || /\b(member|reg|registration|card|ngg) ?(id|no|number)\b/.test(k)) return "member";
  if (/centre|center|branch|location|venue/.test(k)) return "centre";
  if (/\b(date|day|when)\b/.test(k) || k === "on") return "date";
  if (/reason|offen[cs]e|violation|category|why|^type$|^kind$/.test(k)) return "reason";
  if (/note|comment|remark|detail|description/.test(k)) return "note";
  if (/name|pupil|student|child|learner|member name/.test(k)) return "name";
  if (/total|grand|^sum$/.test(k)) return "total";
  const byK = CR_CF_FINE_KIND_COLS.find(x => x[1].test(k));
  if (byK) return ["byKind", byK[0]];
  const byR = CR_CF_FINE_REASON_COLS.find(x => x[1].test(k));
  if (byR) return ["byReason", byR[0]];
  if (/amount|fine|naira|ngn|owed|owing|balance|outstanding|charge|due|^n$/.test(k)) return "amount";
  return null;
}
const CR_CF_FINE_WHO = ["member", "name", "email"];
/** One sheet (a grid of strings) → fines rows, and a plain account of how it was read. */
function crCfFineSheet(grid, sheetName) {
  let best = null;
  for (let i = 0; i < Math.min(20, grid.length); i++) {
    const map = (grid[i] || []).map(crCfFineField);
    const fields = new Set(map.filter(Boolean).map(f => Array.isArray(f) ? f[0] : f));
    const who = CR_CF_FINE_WHO.some(f => fields.has(f)), money = ["amount", "total", "byReason", "byKind"].some(f => fields.has(f));
    const score = fields.size + (who ? 3 : 0) + (money ? 3 : 0);
    if (!best || score > best.score) best = { i, map, score, who, money };
  }
  if (!best || !best.who || !best.money) return { rows: [], how: { sheet: sheetName, unreadable: true, who: !!(best && best.who), money: !!(best && best.money) } };
  const head = grid[best.i], map = best.map;
  const col = f => map.findIndex(x => x === f);
  const reasonCols = map.map((x, k) => Array.isArray(x) && x[0] === "byReason" ? [k, x[1]] : null).filter(Boolean);
  const kindCols = map.map((x, k) => Array.isArray(x) && x[0] === "byKind" ? [k, x[1]] : null).filter(Boolean);
  const amountCol = col("amount") >= 0 ? col("amount") : col("total");
  const headKey = head.map(crCfFineHeadKey).join("|");
  const rows = []; let totals = 0, repeats = 0, countedCells = 0;
  const cell = (r, f) => { const k = col(f); return k >= 0 ? String(r[k] == null ? "" : r[k]).trim() : ""; };
  for (let i = best.i + 1; i < grid.length; i++) {
    const r = grid[i] || [];
    if (!r.some(c => String(c || "").trim() !== "")) continue;
    if (r.map(crCfFineHeadKey).join("|") === headKey) { repeats++; continue; }   // the heading repeated at a page break
    if (r.slice(0, 4).some(c => /^(grand\s*)?(sub-?)?total\b|^sum\b/i.test(String(c || "").trim()))) { totals++; continue; }
    const base = { member: cell(r, "member"), name: cell(r, "name"), email: cell(r, "email"), reason: cell(r, "reason"), date: cell(r, "date"), note: cell(r, "note"),
      centre: cell(r, "centre") || (col("centre") < 0 && sheetName && !/^sheet\s*\d+$/i.test(sheetName) ? sheetName : ""), src: (sheetName ? sheetName + " · " : "") + "row " + (i + 1) };
    if (/^\d{5}(\.\d+)?$/.test(base.date)) base.date = new Date(Date.UTC(1899, 11, 30) + Math.floor(+base.date) * 86400000).toISOString().slice(0, 10);
    // One column per kind of fine: one fine per filled column, its kind the reason. The total is then only a sum, and ignored.
    const split = reasonCols.map(([k, code]) => [String(r[k] == null ? "" : r[k]).trim(), code, k]).filter(([v]) => v !== "" && !/^(0+(\.0+)?|-|—|nil|null|none|n\/a)$/i.test(v));
    /* Under a kind with no money in its heading, a tick is one fine and a small
       whole number is how many ("Late: 3"), each at the rule's standard amount —
       a register counts lates, it rarely prices them. "Late (₦)" is money. */
    const counts = k => !/\b(naira|amount|fine|fines|ngn|n)\b/.test(crCfFineHeadKey(head[k]));
    if (split.length) split.forEach(([v, code, k]) => {
      const tick = /^(✓|✔|√|x|yes|y|true)$/i.test(v), n = /^\d{1,2}$/.test(v) ? +v : 0;
      const each = tick ? { amount: "", count: 1 } : counts(k) && n >= 1 && n <= CR_CF_COUNT_MAX ? { amount: "", count: n } : { amount: v };
      if (each.count) countedCells++;
      rows.push(Object.assign({}, base, each, { reason: base.reason || code, src: base.src + " · " + code }));
    });
    else if (amountCol >= 0 || !kindCols.length) rows.push(Object.assign({}, base, { amount: amountCol >= 0 ? String(r[amountCol] == null ? "" : r[amountCol]).trim() : "" }));
    /* Dues and membership on the same line are charges of their own kind, beside the fines — never instead of them. */
    kindCols.forEach(([k, code]) => {
      const v = String(r[k] == null ? "" : r[k]).trim();
      if (v === "" || /^(0+(\.0+)?|-|—|nil|null|none|n\/a)$/i.test(v)) return;
      rows.push(Object.assign({}, base, { kind: code, amount: v, reason: "", src: base.src + " · " + code }));
    });
  }
  const used = map.map((f, k) => f && f !== "serial" ? [head[k], Array.isArray(f) ? (f[0] === "byKind" ? f[1] + " (not a fine)" : f[1] + " fines") : f] : null).filter(Boolean);
  const ignored = head.filter((h, k) => String(h || "").trim() && (!map[k] || map[k] === "serial" || (map[k] === "total" && reasonCols.length)));
  return { rows, how: { sheet: sheetName, headerRow: best.i + 1, used, ignored, totals, repeats, split: reasonCols.length > 0, counted: countedCells } };
}
const CR_CF_FINE_TEMPLATE = "member,name,email,amount,reason,date,note\n026-014,,,2000,late,2026-10-04,\n,Ada Okafor,okafor.family@example.com,5000,conduct,04/10/2026,Fighting during break\n";
const CR_CF_FINE_ERR = {
  ambiguous: "more than one member matches", no_match: "no member matches", member_required: "no member given",
  not_ngg_member: "not an NGG member", out_of_scope: "outside your centres", bad_amount: "amount unreadable",
  reason_required: "no reason", note_required: "say why", bad_date: "date unreadable", duplicate_in_file: "repeated in this file",
  post_failed: "could not be posted", no_amount: "no fine on this row", date_in_future: "dated in the future — day and month swapped?",
  rule_off: "that rule is switched off", cap_reached: "that rule’s cap for this term is already reached",
  no_standard_amount: "no amount, and that rule has no standard amount — write the figure", bad_count: "more than " + 20 + " in one cell",
};
const CR_CF_MATCHED = { id: "ID", email: "email", "email+centre": "email + centre", "email+name": "email + name", name: "name only", "name+centre": "name + centre",
  name_any: "name, words reordered", "name_any+centre": "name reordered + centre", name_part: "name, part of it", "name_part+centre": "part of the name + centre" };

/* The sheet readers are the curriculum import's (cr-tab-learning.jsx): one CSV
   and one .xlsx reader in the Control Room, not two. Every sheet of a
   workbook is read; a sheet with nothing like a register on it is reported,
   not guessed at. */
async function crCfReadFines(file) {
  if (/\.(xls|numbers|pdf|docx?)$/i.test(file.name)) throw Object.assign(new Error("bad_file"), { data: { message: "That file type can’t be read here. Save it as .xlsx or CSV." } });
  const sheets = /\.xlsx$/i.test(file.name) ? await crCurXlsxGrids(await file.arrayBuffer()) : [{ name: "", grid: crCurParseCsv(await file.text(), true) }];
  const read = sheets.map(sh => crCfFineSheet(sh.grid, sheets.length > 1 ? sh.name : ""));
  return { rows: [].concat(...read.map(x => x.rows)), how: read.map(x => x.how) };
}
/** How the file was read, in a sentence a coordinator can check against the sheet. */
function crCfFineHow(how) {
  return (how || []).map(h => {
    const where = h.sheet ? "Sheet “" + h.sheet + "”: " : "";
    if (h.unreadable) return where + "not read — no " + (!h.who ? "column for who" : "column for the amount") + " was found.";
    return where + "headings on row " + h.headerRow + " — " + h.used.map(u => "“" + u[0] + "” as " + u[1]).join(", ")
      + (h.ignored.length ? "; ignored " + h.ignored.map(x => "“" + x + "”").join(", ") : "")
      + (h.split ? "; a column per kind of fine, so each filled one is its own fine" : "")
      + (h.counted ? "; " + crPlural(h.counted, "cell") + " ticked or counted rather than priced, so the rule’s standard amount is used" : "")
      + (h.totals ? "; " + crPlural(h.totals, "total line") + " skipped" : "") + (h.repeats ? "; " + crPlural(h.repeats, "repeated heading") + " skipped" : "") + ".";
  }).join(" ");
}

function crCfDownload(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}


/** A short date for a range ("1 Sep"), the year only when it is not this one. */
function crCfDay(iso) { return iso ? crDate(String(iso).slice(0, 10) + "T12:00:00").replace(/^[A-Za-z]{3} /, "") : "—"; }
/** One member's money account lives in Dues & arrears; a fines row opens it there. */
function crCfAccount(ctx, memberId) { ctx.go("money", "fees", "account/" + encodeURIComponent(memberId)); }
/** After a write: the rules, the clearance status and the board, refetched quietly. */
async function crCfRefresh(ctx) {
  const [rules, once, board, integ, corr] = await Promise.all([
    ctx.can("fees") ? NGGApi.admin.fees.fineRules().catch(() => null) : null,
    ctx.can("fees") ? NGGApi.admin.fees.finesClearOnce("status").catch(() => null) : null,
    ctx.can(["people", "summer"]) ? NGGApi.admin.policy.board().catch(() => null) : null,
    ctx.can(["people", "summer"]) ? NGGApi.admin.policy.integrity().catch(() => null) : null,
    ctx.can("people") ? NGGApi.admin.policy.correctives().catch(() => null) : null,
  ]);
  ctx.setData(x => Object.assign({}, x, rules ? { rules } : null, once ? { once } : null, board ? { board } : null, integ ? { integ, integErr: null } : null, corr ? { correctives: corr } : null));
}

/* ══ Fines: the upload ═══════════════════════════════════════════════════════ */
/** Read a file, check it on the server, keep the check. Shared by the form and a dropped file. */
async function crCfCheckFile(ctx, file, defaultReason) {
  const read = await crCfReadFines(file);
  const rows = read.rows, how = read.how;
  if (!rows.length) {
    const why = how.find(h => h.unreadable);
    return { fieldErrors: { file: why ? (why.who ? "That sheet has no column for the amount. Name a column “Fine” or “Amount” (or one per kind: “Late”, “Absent”…)." : "That sheet has no column for who is being fined. Name a column “Name”, “Member ID” or “Email”.") : "No fines found in that file." } };
  }
  const rs = String(defaultReason || "").trim();
  const sent = rows.map(r => r.reason || !rs ? r : Object.assign({}, r, { reason: rs }));
  let res;
  try { res = await NGGApi.admin.fees.fineImport(crCfStrip(sent), { dryRun: true }); }
  catch (e) { if (e && (e.code === "too_many" || (e.data && e.data.error === "too_many"))) return { fieldErrors: { file: "That is more than " + crNum((e.data && e.data.max) || 500) + " fines in one file. Split it." } }; throw e; }
  ctx.setData(x => Object.assign({}, x, { finePlan: { rows: sent, res, name: file.name, how } }));
  return res;
}
/** `src` is where a row sits in the sheet — for the operator, never for the server. */
function crCfStrip(rows) { return rows.map(r => { const o = Object.assign({}, r); delete o.src; return o; }); }
function crCfFineCheck(ctx) {
  ctx.form({
    title: "Upload fines", submit: "Check the file", busyLabel: "Checking…",
    intro: "Excel (.xlsx) or CSV, as the register was kept — every sheet is read. Members are found by ID, then email, then name; a name two members share is settled by the centre, never guessed. Nothing is charged until you have checked each row and pressed Post.",
    fields: [
      { id: "file", l: "File", type: "file", req: true, accept: ".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      { id: "reason", l: "Reason for rows that give none", max: 120, ph: "late, absent, conduct — or “Outstanding fine, term 1”", help: "Only used where a row has no reason and no note that names one." },
    ],
    onSubmit: v => crCfCheckFile(ctx, v.file, v.reason),
    done: (v, r) => "Checked · " + crCfFineTally(r.tally, true),
  });
}
function crCfFineTally(t, dry) {
  t = t || {};
  return crNum(t.fine) + (dry ? " to post (" : " posted (") + fmtMoney(t.total || 0) + ") · " + crNum(t.already) + " already posted · " + crNum(t.skipped || 0) + " with no fine · " + crNum(t.failed) + " refused";
}
async function crCfFinePost(ctx) {
  const p = ctx.data.finePlan; if (!p) return;
  const t = p.res.tally;   // read before the confirm: what is agreed is what runs
  const ok = await ctx.confirm({ title: "Post " + crPlural(t.fine, "fine") + " — " + fmtMoney(t.total) + "?", cta: "Post fines",
    body: crCfFineTally(t, true) + " (refused rows are not posted). Each fine lands on the member’s account and in their next reminder." });
  if (!ok) return;
  try {
    const r = await NGGApi.admin.fees.fineImport(crCfStrip(p.rows), { digest: p.res.digest });
    ctx.setData(x => Object.assign({}, x, { finePlan: { rows: p.rows, res: r, name: p.name, how: p.how } }));
    ctx.toast(crNum(r.tally.fine) + " posted · " + fmtMoney(r.tally.total) + (r.tally.failed ? " · " + crNum(r.tally.failed) + " refused" : ""), null, !!r.tally.failed);
    crCfRefresh(ctx);
  } catch (e) {
    ctx.toast(e && (e.code === "import_changed" || (e.data && e.data.error === "import_changed")) ? "The file changed since it was checked. Check it again." : crErr(e, "Couldn’t post the fines. Nothing was written."), null, true);
  }
}

/* The empty state of the upload: what it takes, what happens, and the one
   action. A file may also be dropped on it — a convenience, never the only
   way in: "Choose a file" does everything a drop does. */
function CrCfDrop({ ctx }) {
  const [over, setOver] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const drop = async e => {
    e.preventDefault(); setOver(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || busy) return;
    setBusy(true);
    try {
      const r = await crCfCheckFile(ctx, f, "");
      if (r && r.fieldErrors) ctx.toast(r.fieldErrors.file, null, true);
      else ctx.toast("Checked · " + crCfFineTally(r.tally, true));
    } catch (x) { ctx.toast(crErr(x, "Couldn’t read that file."), null, true); }
    finally { setBusy(false); }
  };
  return (
    <div className={"cr-cf-drop" + (over ? " is-over" : "")} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <span className="cr-cf-drop-ico" aria-hidden="true"><CrIcon n="file-arrow-up"/></span>
      <div className="cr-cf-drop-t">
        <b>Upload a fines register</b>
        <span>Excel or CSV, exactly as it was kept. A title above the headings, a column per kind of fine, ticks or counts, and TOTAL lines are all fine.</span>
      </div>
      <ol className="cr-cf-steps" aria-label="What happens">
        <li><span>1</span>Read and matched to members</li>
        <li><span>2</span>You check every row</li>
        <li><span>3</span>Post — once</li>
      </ol>
      <div className="cr-cf-drop-acts">
        <button type="button" className="cr-btn is-primary" onClick={() => crCfFineCheck(ctx)} disabled={busy} aria-busy={busy || undefined}><CrIcon n="upload-simple"/>{busy ? "Checking…" : "Choose a file"}</button>
        <button type="button" className="cr-btn" onClick={() => crCfDownload("ngg-fines-template.csv", CR_CF_FINE_TEMPLATE)}><CrIcon n="download-simple"/>Template</button>
      </div>
    </div>
  );
}

/* The check, summarised: the file, what will happen to its rows, and the
   decision. One bar, not a stack of tinted notes. */
function CrCfCheckBar({ ctx, p }) {
  const t = p.res.tally || {}, dry = !!p.res.dryRun;
  const [how, setHow] = React.useState(false);
  const parts = [
    [dry ? "To post" : "Posted", crNum(t.fine), fmtMoney(t.total || 0), t.fine ? "ok" : ""],
    ["Already posted", crNum(t.already || 0), "", ""],
    ["No fine", crNum(t.skipped || 0), "", ""],
    ["Refused", crNum(t.failed || 0), t.failed ? "fix in the file" : "", t.failed ? "bad" : ""],
  ];
  return (
    <div className="cr-cf-check">
      <div className="cr-cf-check-top">
        <span className="cr-cf-check-ico" aria-hidden="true"><CrIcon n={dry ? "file-magnifying-glass" : "check-circle"}/></span>
        <div className="cr-cf-check-t">
          <b>{p.name}</b>
          <span>{dry ? (t.fine ? "Checked — nothing is charged until you post." : "Checked — there is nothing to post.") : "Posted. Each fine is on the member’s account and in their next reminder."}</span>
        </div>
        <div className="cr-cf-check-acts">
          {dry && t.fine > 0 && <button type="button" className="cr-btn is-primary" onClick={() => crCfFinePost(ctx)}>Post {crPlural(t.fine, "fine")}</button>}
          <button type="button" className="cr-btn" onClick={() => crCfFineCheck(ctx)}>{dry ? "Check another file" : "Upload another"}</button>
          <button type="button" className="cr-iconbtn" aria-label="Close the check" onClick={() => ctx.setData(x => Object.assign({}, x, { finePlan: null }))}><CrIcon n="x"/></button>
        </div>
      </div>
      <dl className="cr-cf-tally" aria-live="polite">
        {parts.map(x => <div key={x[0]} className={x[3] ? "cr-t-" + x[3] : undefined}><dt>{x[0]}</dt><dd><b>{x[1]}</b>{x[2] && <span>{x[2]}</span>}</dd></div>)}
      </dl>
      {p.how && p.how.length > 0 && (
        <div className="cr-cf-how">
          <button type="button" className="cr-linkbtn" aria-expanded={how} onClick={() => setHow(!how)}>
            <CrIcon n={how ? "caret-down" : "caret-right"}/>How the file was read
          </button>
          {how && <p>{crCfFineHow(p.how)}</p>}
        </div>
      )}
    </div>
  );
}

function crCfUploadBlocks(d, ctx) {
  const p = d.finePlan;
  if (!p) return [{ type: "custom", span: 6, title: "Upload fines", render: () => <CrCfDrop ctx={ctx}/> }];
  const dry = !!p.res.dryRun, out = [{ type: "custom", span: 6, title: dry ? "Check before posting" : "Posted", render: () => <CrCfCheckBar ctx={ctx} p={p}/> }];
  const capped = (p.res.rows || []).filter(r => r.capped && r.verdict === "fine");
  if (capped.length) out.push({ type: "note", span: 6, icon: "scales", tone: "warn", text: crPlural(capped.length, "fine") + " will post less than the sheet says, because a rule below caps that kind per term.",
    sub: "The amount in the list is what will really post; the sheet’s figure is under it." });
  const bk = (p.res.tally || {}).byKind || {}, other = ["dues", "membership"].filter(k => bk[k] && bk[k].n);
  if (other.length) out.push({ type: "note", span: 6, icon: "info",
    text: other.map(k => fmtMoney(bk[k].total) + " of " + CR_CF_KIND_WORD[k].toLowerCase() + " (" + crPlural(bk[k].n, "row") + ")").join(" and ") + (dry ? " will be" : " was") + " posted as " + other.map(k => CR_CF_KIND_WORD[k].toLowerCase()).join(" and ") + ", not as fines.",
    sub: "They are kept apart from fines on the account and on every statement, and they are marked as brought over, so nothing that clears or repairs fines touches them." });
  const src = r => ((p.rows || [])[r.row - 1] || {}).src || "Row " + r.row;
  const verdict = r => r.verdict === "skipped" ? ["No fine", "neutral"] : r.verdict === "failed" ? ["Refused", "bad"]
    : r.verdict === "fine" ? [(dry ? "To post" : "Posted") + (r.capped ? " · capped" : ""), r.capped ? "warn" : "ok"] : ["Already posted", "neutral"];
  out.push({ type: "table", span: 6, title: "Row by row", nosel: true,
    sub: "Weak matches (by name only) say so — check those against the sheet.",
    cols: [{ l: "In the sheet", wrap: true }, { l: "Member", wrap: true }, "Matched by", "Kind", { l: "Amount", num: true }, { l: "Reason", wrap: true }, "Result"],
    rows: (p.res.rows || []).map(r => ({ key: "r" + r.row, open: r.memberId ? () => crCfAccount(ctx, r.memberId) : undefined, cells: [
      { k: "text", t: src(r), v: r.row },
      { k: "text", t: r.fullName || "—", s: (r.displayId || r.memberId || "") + (r.candidates && r.candidates.length ? (r.displayId || r.memberId ? " · " : "") + "Could be: " + r.candidates.slice(0, 3).map(c => c.fullName + " (" + (c.displayId || c.memberId) + ")").join(", ") + (r.candidates.length > 3 ? " and " + crNum(r.candidates.length - 3) + " more" : "") : "") },
      { k: "text", t: r.matchedBy ? (CR_CF_MATCHED[r.matchedBy] || r.matchedBy) : "", s: /^name/.test(r.matchedBy || "") ? "Weak — check it" : "" },
      { k: "text", t: CR_CF_KIND_WORD[r.kind || "fine"] || "Fine" },
      { k: "num", t: r.amount ? fmtMoney(r.amount) : "", v: r.amount || 0, s: r.standard ? crNum(r.standard) + " × " + fmtMoney(r.each) + " standard" : r.capped ? "sheet: " + fmtMoney(r.asked) : "" },
      { k: "text", t: r.reasonLabel ? r.reasonLabel + (r.date ? " · " + r.date : "") : r.error ? (CR_CF_FINE_ERR[r.error] || String(r.error).replace(/_/g, " ")) : "", s: r.reasonLabel ? (r.note || "") : "" },
      { k: "status", t: verdict(r)[0], tone: verdict(r)[1] },
    ] })),
    filters: ["Result", "Kind"], search: "Search the rows" });
  return out;
}

/* ══ Fines: what was brought over by upload ═════════════════════════════════
   Every charge an upload put on an account (admin.fees.imported), and the one
   correction it may need: arrears read as fines before the upload knew a Dues
   column. Fines whose own words say dues are offered first; the desk decides.
   A correction voids the row with the reason and posts the same amount, same
   day, as what it really was — the account's total does not move. */
function crCfReclass(ctx, keys, to) {
  const n = keys.length, word = CR_CF_KIND_WORD[to].toLowerCase();
  ctx.form({
    title: "Record " + crPlural(n, "charge") + " as " + word, submit: "Record as " + word, busyLabel: "Correcting…",
    intro: "Each one is voided with your reason and posted again, the same amount on the same day, as " + word + ". What the family owes does not change; what it is called does — on the account, on statements and in reminders. Both rows stay on the record.",
    values: { reason: "" },
    fields: [{ id: "reason", l: "Why", type: "textarea", rows: 2, req: true, max: 200, ph: "The October register’s Dues column was read as fines",
      check: v => v.trim().length >= 5 ? "" : "Say why, in a sentence." }],
    onSubmit: v => NGGApi.admin.fees.importReclass(keys, to, v.reason.trim()),
    done: (v, r) => { setTimeout(() => crCfImportedLoad(ctx), 0); return crPlural(r.reclassified, "charge") + " now " + word + (r.refused ? " · " + crNum(r.refused) + " refused" : "") + "."; },
  });
  return false;
}
async function crCfImportedLoad(ctx) {
  ctx.setData(x => Object.assign({}, x, { imported: Object.assign({}, x.imported, { loading: true, err: null }) }));
  try { const r = await NGGApi.admin.fees.imported(); ctx.setData(x => Object.assign({}, x, { imported: { open: true, data: r } })); }
  catch (e) { ctx.setData(x => Object.assign({}, x, { imported: { open: true, err: e } })); }
}
function crCfImportedBlocks(d, ctx) {
  const I = d.imported;
  if (!I || !I.open) return [{ type: "list", span: 6, title: "Brought over by upload", rows: [{ icon: "tray-arrow-down", onClick: () => crCfImportedLoad(ctx),
    t: "See every fine, due and membership charge an upload put on an account",
    s: "And correct one that was recorded as the wrong kind — a register’s dues read as fines before the upload knew a Dues column.", m: "Show charges" }] }];
  if (I.loading && !I.data) return [{ type: "note", span: 6, icon: "hourglass", text: "Loading what was brought over…" }];
  if (I.err) return [{ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load what was brought over.", sub: crErr(I.err, ""), act: { l: "Try again", run: () => crCfImportedLoad(ctx) } }];
  const D = I.data, T = D.totals || {}, live = (D.rows || []).filter(r => r.live);
  const out = [{ type: "kpis", span: 6, items: [
    { l: "Fines brought over", v: fmtMoney((T.fine || {}).total || 0), dn: crPlural((T.fine || {}).n || 0, "charge") },
    { l: "Dues brought over", v: fmtMoney((T.dues || {}).total || 0), dn: crPlural((T.dues || {}).n || 0, "charge") },
    { l: "Membership brought over", v: fmtMoney((T.membership || {}).total || 0), dn: crPlural((T.membership || {}).n || 0, "charge") },
    { l: "Fines that read like dues", v: crNum(D.looksLikeDues || 0), dn: D.looksLikeDues ? "Check them below" : "None found" },
  ] }];
  if (D.looksLikeDues) out.push({ type: "note", span: 6, icon: "lightbulb", tone: "warn",
    text: crPlural(D.looksLikeDues, "fine says", "fines say") + " dues, monthly, subscription or arrears in its own words.",
    sub: "Filter “Reads like” to see them. Nothing is changed until you select rows and choose “These are dues”." });
  out.push({ type: "table", span: 6, title: "Every charge brought over", search: "Search by name, ID or note",
    cols: ["Member", "Kind", { l: "Amount", num: true }, { l: "As written", wrap: true }, "Reads like", "Brought over"],
    rows: live.map(r => ({ key: r.entryId, open: () => crCfAccount(ctx, r.memberId), cells: [
      { k: "person", t: r.fullName, s: (r.displayId || r.memberId) + (r.centre ? " · " + r.centre : "") },
      { k: "text", t: CR_CF_KIND_WORD[r.kind] || r.kind, s: r.reclassified ? "corrected" : "" },
      { k: "num", t: fmtMoney(r.amount), v: r.amount },
      { k: "text", t: r.note || "—" },
      { k: "status", t: r.looksLikeDues ? "Dues" : "As recorded", tone: r.looksLikeDues ? "warn" : "neutral" },
      { k: "text", t: crCfDay(r.createdAt) },
    ] })),
    filters: ["Kind", "Reads like"],
    bulk: [
      { l: "These are dues", max: D.max, run: keys => crCfReclass(ctx, keys, "dues") },
      { l: "These are membership", max: D.max, run: keys => crCfReclass(ctx, keys, "membership") },
      { l: "These are fines", max: D.max, run: keys => crCfReclass(ctx, keys, "fine") },
    ],
    emptyText: "No upload has put anything on an account yet." });
  if (D.outOfScope) out.push({ type: "note", span: 6, icon: "info", text: crNum(D.outOfScope) + " more are at centres outside yours." });
  return out;
}

/* ══ Fines: the rules ════════════════════════════════════════════════════════ */
const CR_CF_RULE_ERR = { kind_taken: "Another rule already covers that kind of fine — edit that one.", cap_below_fine: "The cap must be at least the standard amount.",
  bad_name: "Give the rule a name of at least three letters.", bad_amount: "Enter a whole number of naira.", bad_cap: "Enter a whole number of naira.", not_found: "That rule no longer exists." };
function crCfRuleEdit(ctx, R, rule) {
  const kinds = (R.kinds || []).filter(k => !k[2] || (rule && rule.reason === k[0])).map(k => [k[0], k[1]]);
  const whole = v => v === "" || /^\d+$/.test(String(v).trim()) ? "" : "A whole number of naira, or leave it empty.";
  ctx.form({
    title: rule ? rule.name : "Add a rule", submit: rule ? "Save the rule" : "Add the rule", busyLabel: "Saving…",
    intro: "A rule says what a kind of fine normally costs and the most it may add up to in a term. Changes apply to fines posted from now on; fines already on accounts keep their amounts.",
    values: rule ? { name: rule.name, reason: rule.reason, whenText: rule.whenText, amount: rule.amount ? String(rule.amount) : "", capTerm: rule.capTerm ? String(rule.capTerm) : "", active: !!rule.active }
      : { name: "", reason: "", whenText: "", amount: "", capTerm: "", active: true },
    fields: [
      { id: "name", l: "Rule", req: true, max: 160, ph: "Late attendance" },
      { id: "reason", l: "Applies to", type: "select", ph: "No particular kind — a written rule, fined per case", opts: kinds,
        help: "Fines of this kind — from the desk, the policy or an upload — follow this rule's cap and switch." },
      { id: "whenText", l: "When it applies", max: 200, ph: "Arriving after the lateness threshold" },
      { id: "amount", l: "Standard amount (₦)", im: "numeric", max: 9, check: whole, help: "Used when a register ticks or counts a fine instead of pricing it. Empty: set per case." },
      { id: "capTerm", l: "Most per member per term (₦)", im: "numeric", max: 9, check: whole, help: "Fines past it post only what is left. Empty: no cap." },
      { id: "active", l: "Switched on", type: "switch", help: "Off: fines of this kind are refused, not posted at ₦0 by surprise." },
    ],
    onSubmit: async v => {
      try {
        return await NGGApi.admin.fees.fineRuleSave({ ruleId: rule ? rule.ruleId : "", name: v.name.trim(), reason: v.reason || "", whenText: (v.whenText || "").trim(),
          amount: v.amount === "" ? 0 : parseInt(v.amount, 10), capTerm: v.capTerm === "" ? 0 : parseInt(v.capTerm, 10), active: !!v.active });
      } catch (e) {
        const c = e && ((e.data && e.data.error) || e.code), m = CR_CF_RULE_ERR[c];
        const at = { kind_taken: "reason", cap_below_fine: "capTerm", bad_name: "name", bad_amount: "amount", bad_cap: "capTerm" }[c];
        if (at) return { fieldErrors: { [at]: m } };
        throw e;
      }
    },
    done: (v, r) => { crCfRefresh(ctx); return r.unchanged ? "Nothing changed." : r.created ? "Rule added." : "Saved. Fines posted from now on follow it."; },
  });
}
/* A table, not cards: the rules grow with the programme (a rule per kind of
   fine, plus written rules fined per case), and a card per rule stopped
   being scannable at four. Search, filter by state, sort by any column. */
function crCfRuleTable(d, ctx) {
  const R = d.rules;
  return {
    type: "table", span: 6, title: "Fine rules", nosel: true,
    sub: "What each kind of fine normally costs, and the most it may add up to in a term. Open a rule to change it.",
    action: "Add a rule", onAction: () => crCfRuleEdit(ctx, R, null),
    cols: [{ l: "Rule", wrap: true }, "Applies to", { l: "Standard", num: true }, { l: "Cap a term", num: true }, { l: "This term", num: true }, "State"],
    rows: (R.rules || []).map(r => ({ key: r.ruleId, open: () => crCfRuleEdit(ctx, R, r), cells: [
      { k: "strong", t: r.name, s: r.whenText || "" },
      { k: "text", t: r.reasonLabel || "Written rule — per case" },
      { k: "num", t: r.amount ? fmtMoney(r.amount) : "Per case", v: r.amount || 0 },
      { k: "num", t: r.capTerm ? fmtMoney(r.capTerm) : "None", v: r.capTerm || 0 },
      { k: "num", t: r.reason ? crNum(r.thisTerm.n) : "—", v: r.reason ? r.thisTerm.n : -1, s: r.reason && r.thisTerm.n ? fmtMoney(r.thisTerm.total) : "" },
      { k: "status", t: r.active ? "On" : "Off", tone: r.active ? "ok" : "neutral" },
    ] })),
    search: "Search the rules", filters: ["State", "Applies to"],
    emptyText: "No rules yet. Add one.",
  };
}

/* ══ Fines: the one-time clearance ══════════════════════════════════════════
   Every active member's unpaid fines, cleared ONCE (fees.php,
   admin_fees_fines_clear_once): super admin, a current authenticator code,
   the typed phrase and a reason, applied exactly as previewed; afterwards the
   server refuses it for ever and this screen shows the record of the run. */
const CR_CF_CLEAR_ERR = { already_used: "Accounts have already been cleared once. It cannot be done again.", bad_code: "That is not the current code from your authenticator app.",
  totp_required: "Set up an authenticator app on your own account first (Account → Security).", phrase_mismatch: "Type the phrase exactly as shown.",
  reason_required: "Say why, in a sentence.", too_many_attempts: "Too many wrong codes. Wait fifteen minutes, then try again.", import_changed: "The fines changed since the preview. Preview again.", forbidden: "Only a super admin can do this." };
function crCfClearErr(e, fb) { const c = e && ((e.data && e.data.error) || e.code); return CR_CF_CLEAR_ERR[c] || crErr(e, fb); }
async function crCfClearPreview(ctx) {
  try { const r = await NGGApi.admin.fees.finesClearOnce("preview"); ctx.setData(x => Object.assign({}, x, { clearPlan: r })); }
  catch (e) { ctx.toast(crCfClearErr(e, "Couldn’t work out whose fines would be cleared."), null, true); }
}
function crCfClearRun(ctx) {
  const plan = ctx.data.clearPlan; if (!plan) return;
  const phrase = plan.phrase || "CLEAR ALL ACCOUNTS";
  ctx.form({
    title: "Clear " + crPlural(plan.members, "active member’s account", "active members’ accounts") + " — " + fmtMoney(plan.total), submit: "Clear them, once", busyLabel: "Clearing…",
    intro: "This waives the unpaid fines, dues and membership on the accounts listed, records why, and then locks itself for good: nobody, you included, can run it again. Anything that arrived by import stays owed in full"
      + (plan.importedLeft ? " (" + fmtMoney(plan.importedLeft) + " across these accounts)" : "") + ", and the training fee is not touched. Charges made after today are owed as normal.",
    values: { reason: "", phrase: "", code: "" },
    fields: [
      { id: "reason", l: "Why", type: "textarea", rows: 2, req: true, max: 240, ph: "Balances carried over from before this system, cleared by decision of the board" },
      { id: "phrase", l: "Type " + phrase + " to confirm", req: true, max: 40, ph: phrase, check: v => v.trim() === phrase ? "" : "Type " + phrase + " exactly." },
      { id: "code", l: "Code from your authenticator app", req: true, im: "numeric", max: 6, ph: "6 digits", check: v => /^\d{6}$/.test(v.trim()) ? "" : "Six digits." },
    ],
    onSubmit: async v => {
      try { return await NGGApi.admin.fees.finesClearOnce("run", { digest: plan.digest, reason: v.reason.trim(), phrase: v.phrase.trim(), code: v.code.trim() }); }
      catch (e) {
        const c = e && ((e.data && e.data.error) || e.code);
        if (c === "bad_code") return { fieldErrors: { code: CR_CF_CLEAR_ERR.bad_code } };
        if (c === "phrase_mismatch") return { fieldErrors: { phrase: CR_CF_CLEAR_ERR.phrase_mismatch } };
        if (c === "reason_required") return { fieldErrors: { reason: CR_CF_CLEAR_ERR.reason_required } };
        throw Object.assign(new Error(c || "failed"), { data: { message: crCfClearErr(e, "Couldn’t clear the fines. Nothing was written.") } });
      }
    },
    done: (v, r) => { ctx.setData(x => Object.assign({}, x, { once: { used: true, lock: r.lock, canRun: false }, clearPlan: null })); crCfRefresh(ctx); return fmtMoney(r.total) + " cleared across " + crPlural(r.members, "account") + ". Imported charges are still owed. This is now locked."; },
  });
}
function crCfClearBlocks(d, ctx) {
  const o = d.once; if (!o) return [];
  if (o.used && o.lock) {
    const l = o.lock;
    return [{ type: "list", span: 6, title: "One-time clearance", rows: [{ icon: "lock-simple",
      t: "Used " + crDate(l.usedAt) + " by " + (l.usedByName || l.usedBy) + " — " + crPlural(l.members, "account") + ", " + fmtMoney(l.total),
      s: "Why: " + (l.reason || "—") + ". It can never be run again; every cleared charge stays on its account with the waiver beside it, and imported charges were left owed." }] }];
  }
  if (!o.canRun) return [];
  const p = d.clearPlan;
  if (!p) return [{ type: "list", span: 6, title: "One-time clearance", rows: [{ icon: "broom", onClick: () => crCfClearPreview(ctx),
    t: "Clear every active member’s account — once",
    s: "Unpaid fines, dues and membership charged by this system. Anything imported stays owed, and the training fee is not touched. You see every account first; it needs a reason, a typed phrase and your authenticator code, then locks for good.",
    m: "Preview" }] }];
  return [
    { type: "note", span: 6, icon: p.members ? "warning" : "check-circle", tone: p.members ? "warn" : "ok",
      text: p.members ? crPlural(p.members, "account") + " to clear — " + fmtMoney(p.total) + " in all: fines " + fmtMoney((p.byKind || {}).fine || 0) + ", dues " + fmtMoney((p.byKind || {}).dues || 0) + ", membership " + fmtMoney((p.byKind || {}).membership || 0) + "."
        : "No active member owes anything this system charged. There is nothing to clear.",
      sub: p.members ? "What is already paid stays paid. " + (p.importedLeft ? fmtMoney(p.importedLeft) + " of imported charges stays owed. " : "Nothing imported is owed on these accounts. ") + "The run applies exactly this list." : "Nothing is locked: it stays available until it is used.",
      act: p.members ? { l: "Clear these accounts, once…", run: () => crCfClearRun(ctx) } : { l: "Close", run: () => ctx.setData(x => Object.assign({}, x, { clearPlan: null })) } },
    p.members ? { type: "table", span: 6, title: "What would be cleared", nosel: true, search: "Search the list",
      cols: ["Member", "Centre", { l: "Fines", num: true }, { l: "Dues", num: true }, { l: "Membership", num: true }, { l: "Cleared", num: true }, { l: "Imported — stays owed", num: true }],
      rows: (p.rows || []).map(r => ({ key: r.memberId, open: () => crCfAccount(ctx, r.memberId), cells: [
        { k: "person", t: r.fullName, s: r.displayId || r.memberId }, { k: "text", t: r.centre || "—" },
        { k: "num", t: r.fines ? fmtMoney(r.fines) : "—", v: r.fines || 0 }, { k: "num", t: r.dues ? fmtMoney(r.dues) : "—", v: r.dues || 0 },
        { k: "num", t: r.membership ? fmtMoney(r.membership) : "—", v: r.membership || 0 }, { k: "strong", t: fmtMoney(r.amount) },
        { k: "num", t: r.importedLeft ? fmtMoney(r.importedLeft) : "—", v: r.importedLeft || 0 }] })) } : null,
  ].filter(Boolean);
}

function crCfFinesBlocks(d, ctx) {
  if (d.rulesErr || !d.rules) return [{ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load the fine rules.", sub: crErr(d.rulesErr, ""), act: { l: "Try again", run: () => ctx.reload() } }];
  const R = d.rules, on = (R.rules || []).filter(r => r.active), capped = on.filter(r => r.capTerm > 0), o = d.once || {};
  const out = [{ type: "kpis", span: 6, items: [
    { l: "Fines this term", v: crNum(R.thisTerm.n), dn: fmtMoney(R.thisTerm.total) },
    { l: "Rules on", v: crNum(on.length) + " of " + crNum((R.rules || []).length), dn: capped.length ? crPlural(capped.length, "capped kind") : "None capped" },
    { l: "This term", v: crCfDay(R.term.from), dn: "to " + crCfDay(R.term.to) },
    { l: "One-time clearance", v: o.used ? "Used" : o.canRun ? "Available" : "Locked", dn: o.used && o.lock ? crCfDay(o.lock.usedAt) : o.canRun ? "Super admin only" : "Super admin only" },
  ] }];
  return out.concat(crCfUploadBlocks(d, ctx), [crCfRuleTable(d, ctx)], crCfImportedBlocks(d, ctx), crCfClearBlocks(d, ctx));
}

/* ══ Compliance: the board and one person's record ═════════════════════════ */
const CR_CF_STATE = { clear: ["In good standing", "ok"], good: ["In good standing", "ok"], warned: ["Warned", "warn"], dormant: ["Dormant", "warn"],
  suspended: ["Suspended", "bad"], evicted: ["Evicted", "bad"], pending_eviction: ["Eviction proposed", "bad"] };
const CR_CF_TYPE = { student: "Participant", volunteer: "Volunteer", member: "NGG member" };
const CR_CF_INFRACTION = { absence: "Absent", absent: "Absent", late: "Late", tardy: "Tardy", half_day: "Half-day — missed the Musing Period", checkout_missing: "No sign-out",
  idcard_missing: "No ID card", idcard_lost: "Lost ID card", review_missed: "Missed Review Time", misconduct: "Misconduct" };
function crCfWord(k, map) { return (map && map[k]) || String(k || "").replace(/_/g, " ").replace(/^./, c => c.toUpperCase()); }
function crCfState(s) { return CR_CF_STATE[s] || [s ? String(s).replace(/_/g, " ").replace(/^./, c => c.toUpperCase()) : "In good standing", "neutral"]; }
async function crCfPerson(ctx, row) {
  let p;
  try { p = await NGGApi.admin.policy.person(row.personId, row.personType); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t open that record."), null, true); return; }
  const st = p.state || {}, again = () => { crCfPerson(ctx, row); crCfRefresh(ctx); };
  const sState = crCfState(st.state);
  const close = (s, status, l) => ({ l, run: async () => {
    try { await NGGApi.admin.policy.update(s.id, status); ctx.toast(l + " · done"); again(); } catch (e) { ctx.toast(crErr(e, "Couldn’t update that."), null, true); }
  } });
  const sanctionAct = s => s.status === "pending" && s.kind === "fine" ? close(s, "paid", "Mark paid")
    : s.status === "pending" && s.kind === "corrective" ? close(s, "done", "Mark done")
    : s.status === "proposed" && s.kind === "review" ? close(s, "cleared", "Reviewed")
    : s.status === "active" && s.kind === "suspension" ? close(s, "served", "Mark served")
    : s.status === "active" && s.kind === "dormant" ? close(s, "cleared", "Clear") : null;
  const log = (kind, label) => async () => {
    const ok = await ctx.confirm({ title: label + "?", body: "Logged against " + row.fullName + " for today, and the thresholds re-checked.", cta: "Log it" });
    if (!ok) return;
    try {
      const r = await NGGApi.admin.policy.infraction(row.personId, row.personType, kind, "", "");
      ctx.toast(r.alreadyLogged ? "Already logged for today." : r.temporaryCard ? "Logged — issue a temporary Volunteer Emergency Card for today only." : "Logged.");
      again();
    } catch (e) { ctx.toast(crErr(e, "Couldn’t log that."), null, true); }
  };
  const voidOne = i => () => ctx.form({
    title: "Void this entry", submit: "Void it", busyLabel: "Voiding…",
    intro: "Voiding says it should never have been logged. It stays on the record, struck through, with your reason — and any sanction it caused is lifted at once.",
    fields: [{ id: "reason", l: "Why", req: true, max: 240, ph: "Scanner was down that morning" }],
    onSubmit: v => NGGApi.admin.policy.void(i.id, v.reason.trim()),
    done: () => { setTimeout(again, 0); return "Voided. Anything it caused has been lifted."; },
  });
  const reinstate = async () => {
    try { const r = await NGGApi.admin.policy.reinstate(row.personId, row.personType, {}); ctx.toast(r.reinstated ? "Reinstated." : "Done."); again(); }
    catch (e) {
      const unmet = (e && e.data && e.data.unmet) || [];
      if (!unmet.length) { ctx.toast(crErr(e, "Couldn’t reinstate."), null, true); return; }
      ctx.form({
        title: "Reinstatement conditions are not met", submit: "Override by council resolution", busyLabel: "Reinstating…",
        intro: unmet.map(u => u.detail).join(" · ") + ". Only the Governing Council may override this, and the resolution is recorded.",
        fields: [{ id: "why", l: "Council resolution or reason", type: "textarea", rows: 2, req: true, max: 400 }],
        onSubmit: v => NGGApi.admin.policy.reinstate(row.personId, row.personType, { councilOverride: true, overrideReason: v.why.trim() }),
        done: () => { setTimeout(again, 0); return "Reinstated by council override."; },
      });
    }
  };
  ctx.drawer({
    title: row.fullName, name: row.fullName, sub: (CR_CF_TYPE[row.personType] || row.personType) + " · " + row.personId + " · " + sState[0],
    stats: [["Fines owed", st.finesOwed ? fmtMoney(st.finesOwed) : "None"], ["Absences", String(st.absences || 0)], ["Lates", String(st.lates || 0)],
      [crCfCap(st.jumpWord || "frog jumps") + " to do", crNum(st.jumpsOwed || 0)]].concat(st.reentryOwed ? [["Re-entry fee", fmtMoney(st.reentryOwed)]] : []),
    sections: [
      st.reason ? { h: "Why", text: st.reason + (st.awardsEligible === false ? " Awards are frozen until this is resolved." : "") } : null,
      { h: "Consequences", empty: "None.", list: (p.sanctions || []).map(s => ({ icon: s.kind === "fine" ? "coins" : s.kind === "suspension" ? "pause-circle" : s.kind === "evicted" || s.kind === "eviction" ? "door-open" : s.kind === "corrective" ? "person-simple-run" : s.kind === "review" ? "gavel" : "flag",
        t: s.kind === "corrective" ? crNum(s.amount) + " " + (st.jumpWord || "frog jumps") : s.kind === "review" ? "Management review" : crCfWord(s.kind) + (Number(s.amount) > 0 ? " · " + fmtMoney(s.amount) : ""),
        s: [s.reason, crCfDay(s.issuedAt) + (s.endsAt ? " → " + crCfDay(s.endsAt) : "")].filter(Boolean).join(" · "), m: crCfWord(s.status), act: sanctionAct(s) })) },
      { h: "What they are based on", empty: "Nothing logged.", tip: "Void a wrong entry and everything it caused is lifted immediately.",
        list: (p.infractions || []).map(i => ({ icon: i.voidedAt ? "prohibit" : "dot-outline", t: crCfWord(i.kind, CR_CF_INFRACTION),
          s: i.voidedAt ? "Voided — " + (i.voidReason || "") : i.note || "", m: crCfDay(i.date), act: i.voidedAt ? null : { l: "Void", run: voidOne(i) } })) },
    ],
    actions: [
      { l: "No ID card today", run: log("idcard_missing", "Log: arrived without their ID card") },
      { l: "Lost ID card", run: log("idcard_lost", "Log: lost ID card") },
      row.personType === "volunteer" ? { l: "Missed Review Time", run: log("review_missed", "Log: missed Review Time") } : null,
      st.state === "evicted" ? { l: "Reinstate…", run: reinstate } : null,
    ],
  });
}
function crCfComplianceBlocks(d, ctx) {
  if (d.boardErr || !d.board) return [{ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load the compliance board.", sub: crErr(d.boardErr, ""), act: { l: "Try again", run: () => ctx.reload() } }];
  const b = d.board, t = b.tally || {}, out = crCfIntegrityBlocks(d, ctx);
  if (!b.policyEnabled) out.push({ type: "note", span: 6, icon: "pause-circle", text: "Enforcement is off, so nothing new is logged or issued. What is below was recorded while it was on.",
    act: ctx.can("summer") ? { l: "Open Policy", run: () => ctx.setSub("policy") } : null });
  const word = b.jumpWord || "frog jumps", session = b.rulebook !== "ladder";
  out.push({ type: "kpis", span: 6, items: (session ? [
    { l: "Suspended", v: crNum(t.suspended || 0) }, { l: "Awaiting management review", v: crNum(t.awaitingReview || 0) },
    { l: crCfCap(word) + " to do", v: crNum(t.jumpsOwed || 0) }, { l: "Policy fines owed", v: fmtMoney(t.finesOwed || 0) },
  ] : [
    { l: "Warned", v: crNum(t.warned || 0) }, { l: "Dormant", v: crNum(t.dormant || 0) }, { l: "Suspended", v: crNum(t.suspended || 0) },
    { l: "Evicted", v: crNum(t.evicted || 0) }, { l: "Policy fines owed", v: fmtMoney(t.finesOwed || 0) },
  ]) });
  if (b.freshStart && b.freshStart.asOf) out.push({ type: "note", span: 6, icon: "sparkle",
    text: "Fresh start from " + crCfDay(b.freshStart.asOf) + ": everything recorded before it was revoked for " + crPlural(b.freshStart.people || 0, "member") + ".",
    sub: (b.freshStart.reason || "") + (b.freshStart.at ? " · " + crDate(b.freshStart.at) : "") });
  out.push.apply(out, crCfCorrectiveBlocks(d, ctx, word));
  out.push({ type: "table", span: 6, title: "Everyone with something on record", nosel: true, sub: "Open a row for the record behind it — and to void a wrong entry.",
    cols: ["Person", "Standing", { l: "Absences", num: true }, { l: "Lates", num: true }, { l: "Fines owed", num: true }, { l: crCfCap(word), num: true }, "Awards"],
    rows: (b.board || []).map(r => { const s = crCfState(r.state); return { key: r.personType + ":" + r.personId, open: () => crCfPerson(ctx, r), cells: [
      { k: "person", t: r.fullName, s: (CR_CF_TYPE[r.personType] || r.personType) + " · " + r.personId },
      { k: "status", t: s[0], tone: s[1], s: r.until ? "until " + crCfDay(r.until) : "" },
      { k: "num", t: session && r.personType === "member" ? String(r.absences) : r.absences + " / " + r.absenceLimit, v: +r.absences || 0 },
      { k: "num", t: session && r.personType === "member" ? String(r.lates) : r.lates + " / " + r.latenessCap, v: +r.lates || 0 },
      { k: "num", t: r.finesOwed ? fmtMoney(r.finesOwed) : "—", v: +r.finesOwed || 0, s: r.reentryOwed ? "re-entry " + fmtMoney(r.reentryOwed) : "" },
      { k: "num", t: r.jumpsOwed ? crNum(r.jumpsOwed) : "—", v: +r.jumpsOwed || 0 },
      { k: "status", t: r.awardsEligible ? "Eligible" : "Frozen", tone: r.awardsEligible ? "ok" : "neutral" },
    ] }; }),
    search: "Search by name or ID", filters: ["Standing", "Awards"],
    emptyText: "Nobody has anything on record." + (b.policyEnabled ? "" : " Enforcement is off.") });
  return out;
}

/** What a set of corrective exercise was for, as the desk's list says it. */
const CR_CF_FOR = { late: "Late", absence: "Absent" };
/** "frog jumps" → "Frog jumps". */
function crCfCap(w) { w = String(w || ""); return w.charAt(0).toUpperCase() + w.slice(1); }

/* ══ Compliance: corrective exercise to do ══════════════════════════════════
   The rulebook's frog jumps are owed at the centre, not paid: who owes how
   many, and why, for the person on duty to see done and tick off — many at
   once (admin.policy.correctives.done answers each). Nothing is blocked by an
   unserved set; it is a record of what was done, not a gate. */
function crCfCorrectiveBlocks(d, ctx, word) {
  const C = d.correctives;
  if (!C || !(C.rows || []).length) return [];
  return [{ type: "table", span: 6, title: crCfCap(word) + " to do (" + crNum(C.total) + ")", search: "Search by name or centre",
    sub: "Exercise owed at the centre — not money; fines are under Policy fines owed. Tick each set off as it is done.",
    /* The count column is named for what it counts. It said "How many" beside a
       reason that also named the absence fine, so 7 read as if it were money. */
    cols: ["Member", "Centre", "For", { l: crCfCap(word), num: true }, { l: "Why", wrap: true }],
    rows: C.rows.map(r => ({ key: String(r.id), cells: [
      { k: "person", t: r.fullName, s: r.displayId || r.memberId }, { k: "text", t: r.centre || "—" },
      { k: "text", t: CR_CF_FOR[r.for] || "Other", s: r.date ? crCfDay(r.date) : "", v: r.date || "" },
      { k: "num", t: crNum(r.count), v: r.count }, { k: "text", t: r.reason } ] })),
    filters: ["Centre", "For"],
    bulk: [{ l: "Mark done", max: C.max || 500, run: async keys => {
      try { const r = await NGGApi.admin.policy.correctivesDone(keys.map(Number)); ctx.toast(crPlural(r.done, "set") + " of " + word + " done."); crCfRefresh(ctx); }
      catch (e) { ctx.toast(crErr(e, "Couldn’t mark those done."), null, true); return false; }
    } }] }];
}

/* ══ Compliance: a fresh start ════════════════════════════════════════════════
   "All offences and pending disciplinary penalties recorded before this
   announcement are hereby revoked." Previewed exactly (the server runs it and
   rolls back), then applied with a reason. A paid fine stays paid; an
   eviction is named, not undone; imported fines are left unless the fees desk
   chooses to waive them too. */
function crCfFreshStart(ctx) {
  const fees = ctx.can("fees");
  ctx.form({
    title: "Fresh start", submit: "Preview", busyLabel: "Working it out…",
    intro: "Revokes every offence recorded before the day you choose, and every penalty still pending from them — warnings, suspensions, reviews, " + "corrective exercise and unpaid policy fines. Nothing is changed until you have seen the preview.",
    values: { asOf: new Date().toISOString().slice(0, 10), imported: false },
    fields: [
      { id: "asOf", l: "Revoke what was recorded before", type: "date", req: true, help: "The day of the announcement. Offences on or after it stand." },
      fees ? { id: "imported", l: "Also waive fines brought over by upload", type: "switch", help: "Off: fines from the old registers stay owed. Dues are never touched." } : null,
    ].filter(Boolean),
    onSubmit: async v => {
      const r = await NGGApi.admin.policy.freshStart({ asOf: v.asOf, includeImported: !!v.imported });
      ctx.setData(x => Object.assign({}, x, { freshPlan: Object.assign({}, r, { asOf: v.asOf, includeImported: !!v.imported }) }));
      return r;
    },
    done: (v, r) => r.people ? crPlural(r.people, "member") + " would start afresh." : "Nothing recorded before that day is still standing.",
  });
}
function crCfFreshRun(ctx) {
  const P = ctx.data.freshPlan; if (!P) return;
  const n = P.people;   // read before the form: what is agreed is what runs
  ctx.form({
    title: "Give " + crPlural(n, "member") + " a fresh start", submit: "Revoke and start afresh", busyLabel: "Revoking…",
    intro: "Every offence before " + crCfDay(P.asOf) + " is voided with your reason, and what it caused is lifted. This is recorded in the audit log. It cannot be undone in one press — each entry would have to be put back by hand.",
    values: { reason: "" },
    fields: [{ id: "reason", l: "Why", type: "textarea", rows: 2, req: true, max: 240, ph: "Revised Saturday policy — every child starts afresh", check: v => v.trim().length >= 5 ? "" : "Say why, in a sentence." }],
    onSubmit: v => NGGApi.admin.policy.freshStart({ asOf: P.asOf, includeImported: P.includeImported, apply: true, reason: v.reason.trim() }),
    done: (v, r) => { ctx.setData(x => Object.assign({}, x, { freshPlan: null })); crCfRefresh(ctx); return crPlural(r.people, "member") + " start afresh · " + crPlural(r.infractions, "offence") + " revoked."; },
  });
}
function crCfFreshBlocks(d, ctx) {
  const P = d.freshPlan; if (!P) return [];
  const S = P.sanctions || {}, kinds = Object.keys(S).map(k => crNum(S[k]) + " " + (k === "corrective" ? (d.board && d.board.jumpWord) || "corrective" : k === "review" ? "review" : crCfWord(k).toLowerCase()) + (S[k] === 1 ? "" : k === "corrective" ? "" : "s"));
  const out = [{ type: "note", span: 6, icon: P.people ? "sparkle" : "info", tone: P.people ? "warn" : null,
    text: P.people ? crPlural(P.people, "member") + " start afresh: " + crPlural(P.infractions, "offence") + " recorded before " + crCfDay(P.asOf) + " revoked." : "Nothing recorded before " + crCfDay(P.asOf) + " is still standing.",
    sub: P.people ? [kinds.length ? "Lifted: " + kinds.join(", ") : "",
      P.fineTotal ? fmtMoney(P.fineTotal) + " of unpaid policy fines taken off accounts" : "",
      P.paidKept ? crPlural(P.paidKept, "fine already paid stays", "fines already paid stay") + " paid" : "",
      P.includeImported ? (P.imported ? fmtMoney(P.importedTotal) + " of imported fines waived" : "no imported fines to waive") : "imported fines stay owed",
      P.outOfScope ? crNum(P.outOfScope) + " members at centres outside yours are left alone" : ""].filter(Boolean).join(" · ") + "." : "",
    act: P.people ? { l: "Revoke and start afresh…", run: () => crCfFreshRun(ctx) } : { l: "Close", run: () => ctx.setData(x => Object.assign({}, x, { freshPlan: null })) } }];
  if ((P.evicted || []).length) out.push({ type: "list", span: 6, title: "Evicted — not undone by a fresh start", rows: P.evicted.map(e => ({ icon: "door-open", t: e.fullName, s: e.memberId + " · reinstate from their record if the notice covers them" })) });
  if (P.people) out.push({ type: "list", span: 6, rows: [{ icon: "x", onClick: () => ctx.setData(x => Object.assign({}, x, { freshPlan: null })), t: "Close the preview", s: "Nothing has changed." }] });
  return out;
}

/* ══ Compliance: when check-ins do not arrive ═══════════════════════════════
   The nightly check calls a person absent when no check-in reached NGG for a
   programme day. When the check-in desk's feed fails (CACENTRE naming people
   in a way NGG did not read), that is everybody — and the absences turn into
   warnings, the Dormant Track and absence fines. Three tools, all on the
   server's own rules (policy.php, "Attendance integrity"):
     held days      the check now HOLDS a centre where nobody checked in rather
                    than marking it absent; a person says what the day was
     unmatched      a check-in that named nobody is kept, not dropped; match it
                    to a person and their absence that day is undone
     repair         void the check's absences over a period and everything they
                    caused — never a person's entry, never imported money */
const CR_CF_PTYPE = { member: "NGG members", student: "Participants", volunteer: "Volunteers" };
function crCfIntegErr(e, fb) {
  const c = e && ((e.data && e.data.error) || e.code);
  return ({ already_decided: "Somebody already dealt with this.", out_of_scope: "That centre is outside your scope.", forbidden: "You can’t act on that kind of person.",
    not_found: "Nobody with that ID.", reason_required: "Say why, in a sentence.", nothing_to_do: "No absences the check logged match this. Preview again.",
    bad_dates: "Choose a start and an end date, the start first.", too_many: "That is more than one run may change. Choose a shorter period." })[c] || crErr(e, fb);
}
function crCfHeld(ctx, h) {
  const decide = (decision, title, body, cta) => async () => {
    const ok = await ctx.confirm({ title, body, cta }); if (!ok) return;
    try {
      const r = await NGGApi.admin.policy.heldDecide(h.id, decision);
      ctx.closeDrawer();
      ctx.toast(decision === "count" ? crPlural(r.logged, "absence") + " logged for " + crCfDay(h.date) + "." : crCfDay(h.date) + " at " + (h.centre || "every centre") + " — nobody marked absent.");
      crCfRefresh(ctx);
    } catch (e) { ctx.toast(crCfIntegErr(e, "Couldn’t decide that day."), null, true); }
  };
  const open = h.status === "held", out = h.cause === "checkout", where = h.centre || "this centre";
  ctx.drawer({
    title: crCfDay(h.date) + " · " + (h.centre || "No centre"), name: h.centre || "Held day",
    sub: (CR_CF_PTYPE[h.personType] || h.personType) + " · " + (open ? (out ? "Sign-outs held — nobody marked absent" : "Held — nobody marked absent") : h.status === "counted" ? "Counted" : "Closed"),
    stats: out ? [["Signed in", crNum(h.expected)], ["Signed out", crNum(h.present)], ["Logged", open ? "—" : crNum(h.logged)]]
      : [["Expected", crNum(h.expected)], ["Checked in", crNum(h.present)], ["Logged", open ? "—" : crNum(h.logged)]],
    sections: [
      { h: "Why it was held", text: h.why || (out ? "No sign-outs arrived from this centre." : "No check-ins arrived from this centre.") },
      { h: "What to decide", text: !open ? "Decided " + crCfDay(h.decidedAt) + "."
        : out ? "People came, and not one sign-out reached NGG — almost always the sign-outs not being sent, not a whole centre walking out. If they left properly, say so and nobody is marked absent. If they really left without signing out, count it: each is logged an incomplete day, under your name, and the usual consequences follow. A sign-out that arrives later still clears it."
        : "If the centre did not meet, or the check-ins were lost on the way, say so and nobody is marked absent. If it met and these people really were not there, count it: the absences are logged now, under your name, and the usual consequences follow." },
    ],
    actions: !open ? [] : out ? [
      { l: "Nobody is absent — the sign-outs were lost", run: decide("closed", "Mark nobody absent for " + crCfDay(h.date) + "?", "Nobody at " + where + " is counted for a missing sign-out that day. It is never counted later.", "Nobody is absent") },
      { l: "They left without signing out — count it", run: decide("count", "Count the missing sign-outs at " + where + "?", "Everyone who signed in that day and has no sign-out is logged an incomplete day, under your name, and the thresholds re-checked — warnings, the Dormant Track and absence fines follow.", "Count them") },
    ] : [
      { l: "Nobody is absent — it didn’t meet, or the check-ins were lost", run: decide("closed", "Mark nobody absent for " + crCfDay(h.date) + "?", "The day is closed for " + where + ". It is never counted later.", "Nobody is absent") },
      { l: "It met — count the absences", run: decide("count", "Count " + crCfDay(h.date) + " at " + where + "?", "Everyone expected who has no check-in for that day is logged absent, under your name, and the thresholds re-checked — warnings, the Dormant Track and absence fines follow.", "Count the absences") },
    ],
  });
}
function crCfUnmatched(ctx, u) {
  const after = () => { ctx.closeDrawer(); crCfRefresh(ctx); };
  const types = ((ctx.data.integ || {}).types || ["member"]).map(t => [t, CR_CF_TYPE[t] || t]);
  const match = () => ctx.form({
    title: "Whose check-in was this?", submit: "Record it", busyLabel: "Recording…",
    intro: "The check-in desk sent “" + (u.ref || u.token || u.value || "?") + "”" + (u.name ? " (" + u.name + ")" : "") + " for " + crCfDay(u.date) + ". Give the person’s ID: the check-in is recorded for that day, and if they were marked absent for it, that absence — and anything it caused — is undone.",
    values: { personType: types[0] ? types[0][0] : "member" },
    fields: [
      { id: "personType", l: "Who", type: "chips", req: true, opts: types },
      { id: "personId", l: "Their ID", req: true, max: 60, ph: "NGG-2024-0012, or a participant or volunteer ID" },
    ],
    onSubmit: async v => {
      try { return await NGGApi.admin.policy.unmatched(u.id, v.personId.trim(), v.personType, false); }
      catch (e) { const c = e && ((e.data && e.data.error) || e.code); if (c === "not_found") return { fieldErrors: { personId: "Nobody with that ID." } }; throw Object.assign(new Error(c || "failed"), { data: { message: crCfIntegErr(e, "Couldn’t record that.") } }); }
    },
    done: (v, r) => { setTimeout(after, 0); return "Recorded for " + r.fullName + (r.absenceUndone ? " · their absence that day is undone" : "") + "."; },
  });
  const dismiss = async () => {
    const ok = await ctx.confirm({ title: "Set this check-in aside?", body: "It stays in the record as set aside and nobody is credited with it.", cta: "Set aside" }); if (!ok) return;
    try { await NGGApi.admin.policy.unmatched(u.id, "", "", true); ctx.toast("Set aside."); after(); }
    catch (e) { ctx.toast(crCfIntegErr(e, "Couldn’t set that aside."), null, true); }
  };
  ctx.drawer({
    title: u.name || u.ref || "Unknown check-in", name: u.name || u.ref || "?", sub: "Check-" + (u.action === "out" ? "out" : "in") + " · " + crCfDay(u.date) + (u.centre ? " · " + u.centre : ""),
    stats: [["Sent as", u.ref || u.value || (u.token ? "Card code" : "—")], ["From", u.source || "—"], ["At", u.scannedAt ? crDate(u.scannedAt) : crCfDay(u.date)]],
    sections: [{ h: "Why it is here", text: "The check-in desk named somebody NGG could not find — by ID, card code or printed number. It was kept rather than dropped, so nobody is marked absent for a check-in that did happen." }],
    actions: [{ l: "Match to a person…", run: match }, { l: "Set aside", run: dismiss }],
  });
}
function crCfIntegrityBlocks(d, ctx) {
  if (d.integErr) return [{ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load the attendance checks.", sub: crErr(d.integErr, ""), act: { l: "Try again", run: () => ctx.reload() } }];
  const I = d.integ; if (!I) return [];
  const out = [], held = (I.held || []).filter(h => h.status === "held"), unm = I.unmatched || [];
  out.push.apply(out, crCfFreshBlocks(d, ctx));
  out.push.apply(out, crCfRepairBlocks(d, ctx));
  if (held.length) out.push({ type: "note", span: 6, icon: "hand-palm", tone: "warn",
    text: crPlural(held.length, "day") + " held — nobody was marked absent",
    sub: "No check-ins, or no sign-outs, arrived from these centres, so the nightly check did not call everybody absent. Open each and say what the day was." });
  if (held.length) out.push({ type: "list", span: 6, title: "Held days", rows: held.map(h => ({ icon: "hand-palm", onClick: () => crCfHeld(ctx, h),
    t: crCfDay(h.date) + " · " + (h.centre || "No centre"), s: (CR_CF_PTYPE[h.personType] || h.personType) + " · " + (h.cause === "checkout" ? crNum(h.present) + " of " + crNum(h.expected) + " who came signed out" : crNum(h.present) + " of " + crNum(h.expected) + " checked in"), m: "Decide" })) });
  if (unm.length) out.push({ type: "list", span: 6, title: "Check-ins that named nobody (" + crNum(unm.length) + ")",
    rows: unm.slice(0, 60).map(u => ({ icon: "question", onClick: () => crCfUnmatched(ctx, u),
      t: (u.name || u.ref || u.value || "Card code") + " · " + crCfDay(u.date), s: ["Sent as " + (u.ref || u.value || "a card code"), u.centre, u.source].filter(Boolean).join(" · "), m: "Match" })),
    empty: "Every check-in found its person." });
  return out;
}

/* The repair: a period, a preview of every centre-day it would touch, then a
   reason and the run. Mirrors the one-time clearance: what is previewed is
   what runs (the same inputs, re-read on the server), and it says out loud
   what it leaves alone — imported fines and dues, and anything a person logged. */
function crCfIsoDay(off) { const t = new Date(Date.now() + off * 864e5); return t.toISOString().slice(0, 10); }
function crCfRepairForm(ctx) {
  const types = ((ctx.data.integ || {}).types || []).map(t => [t, CR_CF_PTYPE[t] || t]);
  if (!types.length) { ctx.toast("You can’t repair absences for anybody.", null, true); return; }
  const P = ctx.data.repairPlan;
  const iso = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? "" : "Choose a date.";
  ctx.form({
    title: "Repair absences", submit: "Preview", busyLabel: "Working it out…",
    intro: "For a period when check-ins or sign-outs were not reaching NGG. Only absences the nightly check logged are touched — never one a person logged — and with them the warnings, Dormant Track, proposed evictions and absence fines they caused. Imported fines and dues are not touched. You see everything first.",
    values: { from: P ? P.from : crCfIsoDay(-30), to: P ? P.to : crCfIsoDay(-1), mode: P ? P.mode : "outage", types: P ? P.types : types.map(t => t[0]), centre: P ? P.centre : "" },
    fields: [
      { id: "from", l: "From", type: "date", req: true, check: iso },
      { id: "to", l: "To", type: "date", req: true, check: (v, vals) => iso(v) || (vals && vals.from && v < vals.from ? "The end comes after the start." : "") },
      { id: "mode", l: "Which days", type: "chips", req: true, opts: [["outage", "Only centre-days where check-ins or sign-outs clearly didn’t arrive"], ["all", "Every absence the check logged"]],
        help: "“Clearly didn’t arrive”: fewer than one in five of the people expected checked in — or, for a missing sign-out, fewer than one in five of those who came have a sign-out." },
      { id: "types", l: "Who", type: "multi", req: true, opts: types, check: v => (v || []).length ? "" : "Choose at least one." },
      { id: "centre", l: "One centre only", max: 80, ph: "Leave empty for every centre you look after" },
    ],
    onSubmit: async v => {
      const opts = { from: v.from, to: v.to, mode: v.mode, types: v.types, centre: v.centre.trim() };
      try { const r = await NGGApi.admin.policy.repair(opts); ctx.setData(x => Object.assign({}, x, { repairPlan: Object.assign({}, r, opts) })); return r; }
      catch (e) { const c = e && ((e.data && e.data.error) || e.code); if (c === "bad_dates") return { fieldErrors: { to: crCfIntegErr(e) } }; throw Object.assign(new Error(c || "failed"), { data: { message: crCfIntegErr(e, "Couldn’t work that out.") } }); }
    },
    done: (v, r) => r.infractions ? crPlural(r.absences, "absence") + " across " + crPlural(r.people, "person", "people") + " would be undone." : "Nothing the check logged matches that.",
  });
}
function crCfRepairRun(ctx) {
  const P = ctx.data.repairPlan; if (!P || !P.infractions) return;
  const n = P.absences, ppl = P.people;   // read before the form: what is agreed is what runs
  ctx.form({
    title: "Undo " + crPlural(n, "absence") + " for " + crPlural(ppl, "person", "people"), submit: "Undo them", busyLabel: "Repairing…",
    intro: "Each absence is voided with your reason, and each person’s standing is worked out again: what no longer holds is lifted, and its absence fine taken off their account (a paid one becomes credit). Imported fines and dues stay exactly as they are. This is recorded in the audit log.",
    values: { reason: "" },
    fields: [{ id: "reason", l: "Why", type: "textarea", rows: 2, req: true, max: 240, ph: "CACENTRE check-ins were not recognised, so the nightly check marked these days absent",
      check: v => v.trim().length >= 5 ? "" : "Say why, in a sentence." }],
    onSubmit: async v => {
      try { return await NGGApi.admin.policy.repair({ from: P.from, to: P.to, mode: P.mode, types: P.types, centre: P.centre, apply: true, reason: v.reason.trim() }); }
      catch (e) { const c = e && ((e.data && e.data.error) || e.code); if (c === "reason_required") return { fieldErrors: { reason: crCfIntegErr(e) } }; throw Object.assign(new Error(c || "failed"), { data: { message: crCfIntegErr(e, "Couldn’t repair. Nothing was changed.") } }); }
    },
    done: (v, r) => {
      ctx.setData(x => Object.assign({}, x, { repairPlan: null, repairDone: r })); crCfRefresh(ctx);
      return crPlural(r.absences, "absence") + " undone · " + crPlural(r.lifted, "consequence") + " lifted" + (r.stillDormant ? " · " + crNum(r.stillDormant) + " still Dormant on other entries" : "") + ".";
    },
  });
}
function crCfRepairBlocks(d, ctx) {
  const P = d.repairPlan, done = d.repairDone, out = [];
  if (done && !P) out.push({ type: "note", span: 6, icon: "check-circle", tone: "ok",
    text: crPlural(done.absences, "absence") + " undone for " + crPlural(done.people, "person", "people") + " · " + crPlural(done.lifted, "consequence") + " lifted.",
    sub: (done.stillDormant ? crNum(done.stillDormant) + " are still on the Dormant Track because of other entries — open them below. " : "Nobody is left Dormant by those days. ")
      + (done.importedUntouched ? crPlural(done.importedUntouched, "imported fine or due", "imported fines and dues") + " were left exactly as they were." : "No imported fines or dues were involved."),
    act: { l: "Done", run: () => ctx.setData(x => Object.assign({}, x, { repairDone: null })) } });
  if (!P) return out;
  const chosen = (P.groups || []).filter(g => P.mode === "all" || g.outage);
  out.push({ type: "note", span: 6, icon: P.infractions ? "first-aid-kit" : "info", tone: P.infractions ? "warn" : null,
    text: P.infractions ? crPlural(P.absences, "absence") + (P.noSignOut ? " and " + crPlural(P.noSignOut, "missing sign-out") : "") + " the check logged, across " + crPlural(P.people, "person", "people") + " — " + crPlural(P.chosenGroups, "centre-day") + ", " + crCfDay(P.from) + " to " + crCfDay(P.to) + "."
      : "No absences the check logged match this period" + (P.mode === "outage" ? " where check-ins clearly didn’t arrive" : "") + ".",
    sub: P.infractions ? [crPlural(P.sanctionedNow, "person is", "people are") + " warned, Dormant or proposed for eviction now",
      P.absenceFines ? crPlural(P.absenceFines, "absence fine") + " (" + fmtMoney(P.absenceFineTotal) + (P.absenceFinesPaid ? ", " + crNum(P.absenceFinesPaid) + " already paid — those become credit" : "") + ") lifted with them" : "no absence fines on those days",
      P.importedUntouched ? crPlural(P.importedUntouched, "imported fine or due", "imported fines and dues") + " on their accounts stay exactly as they are" : "no imported fines or dues on their accounts",
      P.outOfScope ? crNum(P.outOfScope) + " outside your centres are left for whoever looks after them" : ""].filter(Boolean).join(" · ") + "."
      : P.mode === "outage" && P.groupCount ? crPlural(P.groupCount, "centre-day") + " had absences, but enough check-ins and sign-outs arrived that it looks real. Choose “Every absence the check logged” to include them." : "Nothing to repair.",
    act: P.infractions ? { l: "Undo these absences…", run: () => crCfRepairRun(ctx) } : { l: "Change the period", run: () => crCfRepairForm(ctx) } });
  if ((P.groups || []).length) out.push({ type: "table", span: 6, title: "Centre-days in the period", nosel: true, search: "Search by centre",
    sub: P.mode === "outage" ? "Only the rows marked “Feed failed” are undone." : "Every row is undone.",
    cols: ["Day", "Centre", "Who", "Missing", { l: "Checked in", num: true }, { l: "Signed out", num: true }, { l: "Marked absent", num: true }, "Reading"],
    rows: P.groups.map(g => ({ key: g.date + g.centre + g.personType + g.cause, cells: [
      { k: "text", t: crCfDay(g.date) }, { k: "text", t: g.centre || "—" }, { k: "text", t: CR_CF_PTYPE[g.personType] || g.personType },
      { k: "text", t: g.cause === "checkout" ? "Sign-out" : "Check-in" },
      { k: "num", t: crNum(g.checkins), v: g.checkins }, { k: "num", t: crNum(g.checkouts || 0), v: g.checkouts || 0 }, { k: "num", t: crNum(g.people), v: g.people },
      { k: "status", t: g.outage ? "Feed failed" : "Looks real", tone: g.outage ? "warn" : "neutral", s: P.mode === "all" || g.outage ? "undone" : "kept" }] })),
    filters: ["Reading", "Missing", "Who"] });
  out.push({ type: "list", span: 6, rows: [{ icon: "x", onClick: () => ctx.setData(x => Object.assign({}, x, { repairPlan: null })), t: "Close the preview", s: "Nothing has changed." }] });
  return out;
}

/* ══ Policy: the thresholds ══════════════════════════════════════════════════
   One form, one save. Row ids are paths into the policy object
   ("student.absenceLimit"), so the save rebuilds the object from them and the
   server — which clamps every value (policy_settings_save) — gets one shape. */
function crCfNest(groups, vals) {
  const out = {};
  groups.forEach(g => g.rows.forEach(r => {
    const v = vals[r.id], path = r.id.split(".");
    const val = r.c === "toggle" ? !!v : r.type === "number" ? (v === "" ? null : parseInt(v, 10)) : v;
    if (val === null) return;
    let o = out; path.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; }); o[path[path.length - 1]] = val;
  }));
  return out;
}
function crCfPolicyForm(pol, ctx) {
  const P = pol || {}, g = (o, k, dflt) => o && o[k] != null ? o[k] : dflt;
  const int = (min, max) => v => { const n = Number(v); return v === "" || !Number.isInteger(n) ? "Enter a whole number." : n < min ? "At least " + min + "." : n > max ? "At most " + crNum(max) + "." : ""; };
  const money = int(0, 10000000);
  const ladder = (k, o) => [
    { id: k + ".lateRedline", l: "Late after", c: "input", type: "time", value: g(o, "lateRedline", ""), help: "Arriving after this is late." },
    { id: k + ".absenceLimit", l: "Absences allowed", c: "input", type: "number", im: "numeric", value: String(g(o, "absenceLimit", "")), check: int(1, 60) },
    { id: k + ".latenessCap", l: "Lates before a suspension", c: "input", type: "number", im: "numeric", value: String(g(o, "latenessCap", "")), check: int(1, 60) },
    { id: k + ".suspensionDays", l: "Suspension length (days)", c: "input", type: "number", im: "numeric", value: String(g(o, "suspensionDays", "")), check: int(1, 365) },
    { id: k + ".postSuspensionLateness", l: "Lates after a suspension before a fine", c: "input", type: "number", im: "numeric", value: String(g(o, "postSuspensionLateness", "")), check: int(1, 60) },
    { id: k + ".fine", l: "That fine (₦)", c: "input", type: "number", im: "numeric", value: String(g(o, "fine", 0)), check: money },
  ];
  const groups = [
    { h: "Enforcement", help: "The Institutional Policy & Operational Blueprint, applied automatically: absences logged for closed programme days, lateness measured against the time below, and warnings, dormancy, suspension, fines and eviction issued by the thresholds. A suspended or evicted person is refused at the scanner.", rows: [
      { id: "enabled", l: "Enforce for Summer School", c: "toggle", value: !!P.enabled, help: "Participants, volunteers, mentors and instructors." },
      { id: "member.enabled", l: "Enforce for NGG members", c: "toggle", value: !!g(P.member, "enabled", false), help: "A separate switch, on the member calendar." },
      { id: "outageBrake", l: "Hold a day when check-ins or sign-outs did not arrive", c: "toggle", value: P.outageBrake !== false,
        help: "A centre where nobody checked in (three or more expected) — or where people signed in and not one sign-out arrived — or a day when almost nobody did either anywhere, is held for a person to decide instead of marking everybody absent. Leave it on." },
      { id: "checkoutRequired", l: "Summer: a day with no scan out is an absence", c: "toggle", value: !!P.checkoutRequired },
      { id: "musing.enabled", l: "Missing the Musing Period makes it a half-day", c: "toggle", value: !!g(P.musing, "enabled", false) },
      { id: "musing.endsAt", l: "Musing Period ends", c: "input", type: "time", value: g(P.musing, "endsAt", "") },
    ] },
    crCfRulebookGroup(P, g, int, money),
    { h: "Summer School participants", rows: ladder("student", P.student) },
    { h: "Volunteers, mentors and instructors", rows: ladder("volunteer", P.volunteer) },
    { h: "NGG members — the older ladder", help: "Used only when the rulebook above is set to the older ladder: warnings, then the Dormant Track, then eviction; a late redline, and a fine for every late.", rows: ladder("member", P.member).concat([
      { id: "member.lateFine", l: "Fine for every late (₦)", c: "input", type: "number", im: "numeric", value: String(g(P.member, "lateFine", 500)), check: money, help: "0 switches it off. The Late rule under Fines can cap it per term." },
      { id: "member.tardyIsLate", l: "No grace band — after resumption is late", c: "toggle", value: g(P.member, "tardyIsLate", true) !== false },
      { id: "member.checkoutRequired", l: "A day with no sign-out is an absence", c: "toggle", value: g(P.member, "checkoutRequired", true) !== false },
      { id: "confirmEviction", l: "An admin confirms a member’s eviction", c: "toggle", value: P.confirmEviction !== false, help: "The last absence proposes eviction for review instead of expelling automatically." },
    ]) },
    { h: "ID cards and reinstatement", rows: [
      { id: "idCard.secondOffenceFine", l: "ID card not worn, second time (₦)", c: "input", type: "number", im: "numeric", value: String(g(P.idCard, "secondOffenceFine", 0)), check: money },
      { id: "idCard.lostFine", l: "Lost ID card (₦)", c: "input", type: "number", im: "numeric", value: String(g(P.idCard, "lostFine", 0)), check: money },
      { id: "reinstatement.coolOffDays", l: "After an eviction, wait (days)", c: "input", type: "number", im: "numeric", value: String(g(P.reinstatement, "coolOffDays", 0)), check: int(0, 3650) },
      { id: "reinstatement.fine", l: "Reinstatement fine (₦)", c: "input", type: "number", im: "numeric", value: String(g(P.reinstatement, "fine", 0)), check: money },
      { id: "reinstatement.training", l: "Reinstatement training", c: "input", value: g(P.reinstatement, "training", ""), max: 200 },
    ] },
  ];
  return { type: "form", span: 6, key: "conduct-policy", groups,
    save: async (patch, vals) => { await NGGApi.admin.policy.save(null, crCfRulebookPack(crCfNest(groups, vals), vals), null); ctx.reload(); } };
}

/* The member rulebook, as the Management notice states it: a resumption time,
   lateness in bands by arrival time (each a fine and/or corrective exercise),
   a time from which lateness is management's to review, the cost of an
   absence without permission, the suspension a session's absences lead to
   and its re-entry fee, the cap on absences with permission, and the
   assignment-evidence fine. Three band rows; a band with no start time is
   not used. */
const CR_CF_BANDS = 3;
function crCfRulebookGroup(P, g, int, money) {
  const M = P.member || {}, bands = M.lateBands || [], word = g(M, "jumpWord", "frog jumps");
  const band = i => {
    const b = bands[i] || {}, n = i + 1;
    return [
      { id: "member.band" + n + "From", l: "Late band " + n + " — from", c: "input", type: "time", value: b.from || "", help: i === 0 ? "Arriving at or after this is late." : "Leave empty to use fewer bands." },
      { id: "member.band" + n + "Fine", l: "Band " + n + " fine (₦)", c: "input", type: "number", im: "numeric", value: String(b.fine != null ? b.fine : 0), check: money },
      { id: "member.band" + n + "Jumps", l: "Band " + n + " " + word, c: "input", type: "number", im: "numeric", value: String(b.jumps != null ? b.jumps : 0), check: int(0, 200) },
    ];
  };
  let rows = [
    { id: "member.rulebook", l: "Which rulebook", c: "select", value: g(M, "rulebook", "session"),
      opts: [["session", "The revised rules — lateness bands, " + word + ", suspension per session"], ["ladder", "The older ladder — warnings, Dormant Track, eviction"]] },
    { id: "member.resumption", l: "Resumption", c: "input", type: "time", value: g(M, "resumption", "09:00"), help: "Arriving after this and before the first band is seen, not penalised." },
  ];
  for (let i = 0; i < CR_CF_BANDS; i++) rows = rows.concat(band(i));
  rows = rows.concat([
    { id: "member.reviewFrom", l: "Management review from", c: "input", type: "time", value: g(M, "reviewFrom", ""), help: "Arriving at or after this goes to management for review, with no automatic penalty. Empty: the last band runs on." },
    { id: "member.absenceFine", l: "Absence without permission — fine (₦)", c: "input", type: "number", im: "numeric", value: String(g(M, "absenceFine", 1000)), check: money, help: "Also the ladder’s absence fine. A request still waiting is not charged until the desk decides." },
    { id: "member.absenceJumps", l: "Absence without permission — " + word, c: "input", type: "number", im: "numeric", value: String(g(M, "absenceJumps", 7)), check: int(0, 200) },
    { id: "member.suspendAfterAbsences", l: "Absences without permission in a session before suspension", c: "input", type: "number", im: "numeric", value: String(g(M, "suspendAfterAbsences", 3)), check: int(1, 60) },
    { id: "member.suspendDays", l: "Suspension length (days)", c: "input", type: "number", im: "numeric", value: String(g(M, "suspendDays", 7)), check: int(1, 365) },
    { id: "member.reentryFee", l: "Re-entry fee after a suspension (₦)", c: "input", type: "number", im: "numeric", value: String(g(M, "reentryFee", 5000)), check: money, help: "Paid (or waived) before the child can check in again." },
    { id: "member.permittedAbsences", l: "Absences with permission accepted in a session", c: "input", type: "number", im: "numeric", value: String(g(M, "permittedAbsences", 5)), check: int(0, 60) },
    { id: "member.formalAfterDays", l: "Longer than this needs a formal written application (days)", c: "input", type: "number", im: "numeric", value: String(g(M, "formalAfterDays", 21)), check: int(1, 365) },
    { id: "member.evidenceFine", l: "No assignment evidence by the due day — fine (₦)", c: "input", type: "number", im: "numeric", value: String(g(M, "evidenceFine", 1000)), check: money, help: "Only assignments due after the rule first ran. 0 switches it off." },
    { id: "member.jumpWord", l: "What the corrective exercise is called", c: "input", value: word, max: 40 },
  ]);
  return { h: "NGG members — the rulebook", help: "As the Management notice sets it out. Every penalty is worked out from the record, so changing a figure here applies to what is recorded from now on; it does not re-charge the past.", rows };
}
/** The flat band fields back into the list the server keeps. */
function crCfRulebookPack(out, vals) {
  const m = out.member = out.member || {}, bands = [];
  for (let i = 1; i <= CR_CF_BANDS; i++) {
    const from = String(vals["member.band" + i + "From"] || "").trim();
    delete m["band" + i + "From"]; delete m["band" + i + "Fine"]; delete m["band" + i + "Jumps"];
    if (from) bands.push({ from, fine: parseInt(vals["member.band" + i + "Fine"], 10) || 0, jumps: parseInt(vals["member.band" + i + "Jumps"], 10) || 0 });
  }
  if (bands.length) m.lateBands = bands;
  m.reviewFrom = String(vals["member.reviewFrom"] || "").trim();
  return out;
}
function crCfPolicyBlocks(d, ctx) {
  if (d.polErr || !d.pol) return [{ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load the policy.", sub: crErr(d.polErr, ""), act: { l: "Try again", run: () => ctx.reload() } }];
  const out = [], pr = d.pol.programme || {};
  if (!pr.enabled && (d.pol.policy || {}).enabled) out.push({ type: "note", span: 6, icon: "warning", tone: "warn",
    text: "Enforcement is on but there is no Summer calendar, so every date counts as a session — weekends included.", act: { l: "Set the calendar", run: () => ctx.setSub("calendar") } });
  out.push(crCfPolicyForm(d.pol.policy, ctx));
  return out;
}

/* ══ Calendars: which days count ═════════════════════════════════════════════ */
function crCfCalNote(cal, prog, who) {
  if (!prog.enabled) return { type: "note", span: 6, icon: "warning", tone: "warn", text: "No " + who + " calendar.",
    sub: "Every date counts — Sundays, holidays, long after the term ends — and the absence sweep does nothing. Switch it on below." };
  const next = (cal.upcoming || []).slice(0, 6).map(crCfDay).join(" · ");
  return { type: "note", span: 6, icon: cal.isProgrammeDay ? "calendar-check" : "calendar-blank",
    text: cal.isProgrammeDay ? "Today is a " + who + " day — " + crNum(cal.elapsed) + " of " + crNum(cal.total) + " have run." : "Today is not a " + who + " day." + (cal.nextDay ? " Next: " + crCfDay(cal.nextDay) + "." : " The window has ended."),
    sub: [prog.derivedFromSession ? (who === "Summer" ? "No dates are typed in, so it runs for the edition’s own season and moves with the next one by itself." : "No dates are typed in, so a member day is any weekday below inside a term in Sessions.") : "",
      next ? "Coming up: " + next : "", "Swept through " + (cal.sweptThrough ? crCfDay(cal.sweptThrough) : "—") + "."].filter(Boolean).join(" ") };
}
function crCfCalForm(key, title, prog, which, ctx) {
  const P = prog || {};
  return { type: "form", span: 6, key, groups: [{ h: title, help: which === "summer" ? "Which days participants are expected. Absence, attendance rates and guardian alerts all read this." : "Year-round NGG members. Separate from Summer School.", rows: [
    { id: "enabled", l: "Use this calendar", c: "toggle", value: !!P.enabled },
    { id: "startDate", l: "Starts", c: "input", type: "date", value: P.startDate || "", help: P.derivedFromSession ? "From the season — type a date only to override it." : "" },
    { id: "endDate", l: "Ends", c: "input", type: "date", value: P.endDate || "" },
    { id: "weekdays", l: "Meets on", c: "multi", opts: CR_CF_DOW, value: (P.weekdays || []).map(Number) },
    { id: "holidays", l: "Cancelled days", c: "dates", value: P.holidays || [], help: "A day that would run, but doesn’t." },
    { id: "extraDays", l: "Extra days", c: "dates", value: P.extraDays || [], help: "A day that wouldn’t run, but does." },
  ] }],
    /* Only what changed is sent: dates the season supplied are not stored as
       an admin's choice, which would freeze the calendar to this edition. */
    /* The server reads a missing `enabled` as OFF (programme_settings_save), so
       the switch always travels with the patch — saving one weekday turned the
       whole calendar off until it did. */
    save: async (patch, vals) => { const send = Object.assign({ enabled: !!vals.enabled }, patch);
      await NGGApi.admin.policy.save(which === "summer" ? send : null, null, which === "member" ? send : null); ctx.reload(); } };
}
function crCfCalendarBlocks(d, ctx) {
  if (d.polErr || !d.pol) return [{ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load the calendars.", sub: crErr(d.polErr, ""), act: { l: "Try again", run: () => ctx.reload() } }];
  const p = d.pol;
  return [crCfCalNote(p.calendar || {}, p.programme || {}, "Summer"), crCfCalForm("conduct-cal-summer", "Summer School days", p.programme, "summer", ctx),
    crCfCalNote(p.memberCalendar || {}, p.memberProgramme || {}, "member"), crCfCalForm("conduct-cal-member", "NGG member days", p.memberProgramme, "member", ctx)];
}

async function crCfSweep(ctx) {
  try {
    const r = await NGGApi.admin.policy.sweep();
    ctx.toast(r.skipped ? "Nothing to sweep — " + (r.skipped === "policy_disabled" ? "enforcement is off." : "there is no programme calendar.") : crPlural(r.days, "day") + " swept · " + crPlural(r.absences, "absence") + " logged");
    crCfRefresh(ctx);
  } catch (e) { ctx.toast(crErr(e, "Couldn’t run the sweep."), null, true); }
}

/* ══ The rules, as a document ═══════════════════════════════════════════════
   One formal document of every rule this screen holds — the fine rules, the
   attendance and lateness ladders, the members' stricter rules, ID cards and
   reinstatement, the programme days, and how a fine is appealed — drawn in
   the browser (jsPDF; the host has no renderer) from the SAME data the screen
   shows, so the document cannot say something the system does not do. The
   standard PDF fonts have no naira sign, so money is written NGN 5,000. */
function crCfMoney(n) { return n ? "NGN " + Number(n).toLocaleString("en-GB") : "None"; }
async function crCfRulesPdf(ctx, d) {
  const [rules, pol] = await Promise.all([d.rules ? Promise.resolve(d.rules) : NGGApi.admin.fees.fineRules().catch(() => null),
    d.pol ? Promise.resolve(d.pol) : NGGApi.admin.policy.settings().catch(() => null)]);
  if (!rules && !pol) { ctx.toast("Couldn’t load the rules to export.", null, true); return; }
  const { jsPDF } = await loadVendor("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 20, CW = W - 2 * M, INK = [11, 11, 12], MUTE = [93, 93, 99], LINE = [226, 226, 223], BAND = [12, 20, 50], GOLD = [245, 176, 38];
  const today = new Date(), issued = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const ref = "NGG/CF/" + today.toISOString().slice(0, 10);
  let y = 0, sec = 0;
  const text = (t, x, yy, o) => { doc.setFont("helvetica", (o && o.bold) ? "bold" : "normal"); doc.setFontSize((o && o.size) || 10); doc.setTextColor.apply(doc, (o && o.color) || INK); doc.text(t, x, yy, o && o.align ? { align: o.align } : undefined); };
  const room = h => { if (y + h > H - 22) { doc.addPage(); y = 24; } };
  // Measured at the size it is drawn at — splitting first measured at the last heading's size and wrapped at half the page.
  const para = (t, o) => { doc.setFont("helvetica", "normal"); doc.setFontSize(10); const lines = doc.splitTextToSize(t, CW); lines.forEach(l => { room(5.2); text(l, M, y, Object.assign({ color: (o && o.color) || [43, 43, 48] }, o)); y += 5.2; }); y += 1.5; };
  const heading = t => { room(18); y += 4; sec++; text(sec + ".", M, y, { bold: true, size: 12.5 }); text(t, M + 9, y, { bold: true, size: 12.5 }); y += 2.5;
    doc.setDrawColor.apply(doc, GOLD); doc.setLineWidth(0.6); doc.line(M, y, M + 18, y); y += 6; };
  /* A ruled table: header on a quiet band, hairlines between rows, cells wrapped to their column. */
  const table = (cols, rows) => {
    const widths = cols.map(c => c.w * CW), pad = 2.2, lh = 4.6;
    /* Headings wrap in their column like the cells do: a long heading over a narrow column overprinted its neighbour. */
    const head = () => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.6);
      const hl = cols.map((c, i) => doc.splitTextToSize(c.l, widths[i] - 2 * pad)), hh = Math.max.apply(null, hl.map(l => l.length)) * 3.8 + 4.4;
      room(hh + 6); doc.setFillColor(244, 244, 243); doc.rect(M, y, CW, hh, "F"); let x = M;
      hl.forEach((lines, i) => { lines.forEach((l, k) => text(l, cols[i].num ? x + widths[i] - pad : x + pad, y + 5.2 + k * 3.8, { bold: true, size: 8.6, color: MUTE, align: cols[i].num ? "right" : undefined })); x += widths[i]; });
      y += hh; };
    head();
    rows.forEach(r => {
      doc.setFontSize(9.4);
      const cells = r.map((v, i) => doc.splitTextToSize(String(v == null ? "" : v), widths[i] - 2 * pad));
      const h = Math.max.apply(null, cells.map(c => c.length)) * lh + 3.4;
      if (y + h > H - 22) { doc.addPage(); y = 24; head(); }
      let x = M;
      cells.forEach((lines, i) => { lines.forEach((l, k) => text(l, cols[i].num ? x + widths[i] - pad : x + pad, y + 4.9 + k * lh, { size: 9.4, bold: i === 0, align: cols[i].num ? "right" : undefined })); x += widths[i]; });
      y += h; doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
    });
    y += 5;
  };

  // ── The cover band ──
  doc.setFillColor.apply(doc, BAND); doc.rect(0, 0, W, 58, "F");
  doc.setFillColor.apply(doc, GOLD); doc.rect(M, 16, 10, 1.4, "F");
  text("NEXT GENERATION GENIUS", M, 25, { bold: true, size: 9, color: [200, 206, 226] });
  text("Conduct & Fines", M, 38, { bold: true, size: 24, color: [255, 255, 255] });
  text("The rules of the programme", M, 47, { size: 12, color: [214, 218, 232] });
  text("Issued " + issued, W - M, 38, { size: 9, color: [200, 206, 226], align: "right" });
  text("Ref. " + ref, W - M, 44, { size: 9, color: [200, 206, 226], align: "right" });
  y = 72;
  para("This document sets out the rules on conduct, attendance and fines that apply to Next Generation Genius (NGG) members and to Summer School participants, volunteers, mentors and instructors. It is generated from the Control Room, where these rules are kept and applied, so it states exactly what the system does on the day it was issued.");

  heading("Fines and their limits");
  if (rules && (rules.rules || []).length) {
    para("Each kind of fine has a standard amount and the most it may add up to for one member in a term. A fine of a kind whose rule is switched off is not charged. A fine that would go past the term’s limit is reduced to what is left of it, and once the limit is reached nothing more of that kind is charged until the next term.");
    table([{ l: "Rule", w: 0.30 }, { l: "Applies to", w: 0.22 }, { l: "Standard amount", w: 0.17, num: true }, { l: "Limit per term", w: 0.17, num: true }, { l: "In force", w: 0.14 }],
      rules.rules.map(r => [r.name + (r.whenText ? " — " + r.whenText : ""), r.reasonLabel || "Fined per case", r.amount ? crCfMoney(r.amount) : "Per case", r.capTerm ? crCfMoney(r.capTerm) : "No limit", r.active ? "Yes" : "Switched off"]));
    if (rules.term) para("The current term runs from " + crCfDay(rules.term.from) + " to " + crCfDay(rules.term.to) + ".", { color: MUTE });
  } else para("The fine rules could not be included: they need the Fees permission to read.", { color: MUTE });

  const P = pol && pol.policy;
  if (P) {
    const ladder = (k, o) => [k, (o || {}).lateRedline || "—", String((o || {}).absenceLimit ?? "—"), String((o || {}).latenessCap ?? "—"), String((o || {}).suspensionDays ?? "—"), String((o || {}).postSuspensionLateness ?? "—"), crCfMoney((o || {}).fine)];
    heading("Attendance and lateness");
    para("Arriving after the time below counts as late. Absences are counted on programme days only (section " + (sec + 4) + "). When the limits below are reached the policy applies, in order: a warning, dormancy, a suspension of the stated length, and eviction. After a suspension, further lateness leads to the fine shown. A suspended or evicted person is not admitted at the door."
      + (P.enabled ? "" : " Enforcement for Summer School is currently switched off.") + ((P.member || {}).enabled ? "" : " Enforcement for NGG members is currently switched off."));
    table([{ l: "Who", w: 0.21 }, { l: "Late after", w: 0.10 }, { l: "Absences allowed", w: 0.12, num: true }, { l: "Lates before a suspension", w: 0.15, num: true }, { l: "Suspension (days)", w: 0.14, num: true }, { l: "Lates after, before a fine", w: 0.14, num: true }, { l: "That fine", w: 0.14, num: true }],
      [ladder("Summer School participants", P.student), ladder("Volunteers, mentors and instructors", P.volunteer)].concat((P.member || {}).rulebook === "ladder" ? [ladder("NGG members", P.member)] : []));
    const Mb = P.member || {};
    if (Mb.rulebook !== "ladder") {
      /* The rulebook as the Management notice states it — what the engine
         applies (policy_apply_session), so the document cannot promise
         something the system does not do. */
      const W = Mb.jumpWord || "frog jumps", bands = Mb.lateBands || [];
      const pen = (f, j) => [f ? crCfMoney(f) + " fine" : "", j ? j + " " + W : ""].filter(Boolean).join(" and ") || "Recorded only";
      heading("NGG members — resumption, lateness and attendance");
      para("Activities begin at " + (Mb.resumption || "09:00") + ". Arrival at or after " + ((bands[0] || {}).from || "—") + " is recorded as lateness, and the penalty depends on the time of arrival."
        + (Mb.enabled ? "" : " Enforcement for NGG members is currently switched off."));
      table([{ l: "Arrival", w: 0.45 }, { l: "Penalty", w: 0.55 }], bands.map((b, i) => [b.from + " to before " + ((bands[i + 1] || {}).from || Mb.reviewFrom || "the end of the day"), pen(b.fine, b.jumps)])
        .concat(Mb.reviewFrom ? [["At or after " + Mb.reviewFrom, "Management review and appropriate disciplinary action"]] : []));
      table([{ l: "Rule", w: 0.62 }, { l: "Applies", w: 0.38 }], [
        ["Absence without prior notice or approved permission", pen(Mb.absenceFine, Mb.absenceJumps)],
        ["Absences without permission within one session before suspension", String(Mb.suspendAfterAbsences ?? 3)],
        ["Length of the suspension", (Mb.suspendDays ?? 7) + " days"],
        ["Re-entry fee, paid before resuming", crCfMoney(Mb.reentryFee)],
        ["Absences with permission accepted within one session", String(Mb.permittedAbsences ?? 5)],
        ["An absence longer than this needs a formal written application", (Mb.formalAfterDays ?? 21) + " days"],
        ["No evidence of an assignment uploaded by its due day", Mb.evidenceFine ? crCfMoney(Mb.evidenceFine) + " fine" : "Not applied"],
        ["A day with no sign-out counts as an absence", Mb.checkoutRequired !== false ? "Yes" : "No"],
      ]);
      para("Permission is requested through the NGG Members Dashboard only. Submitting a request is not approval: an absence is excused once the request is approved. A request still waiting is not penalised until it is decided.", { color: MUTE });
    } else {
    heading("Additional rules for NGG members");
    table([{ l: "Rule", w: 0.62 }, { l: "Applies", w: 0.38 }], [
      ["A fine for every late arrival", Mb.lateFine ? crCfMoney(Mb.lateFine) + " each" : "Not applied"],
      ["A fine for an absence nobody asked about", Mb.absenceFine ? crCfMoney(Mb.absenceFine) + " each" : "Not applied"],
      ["Arriving after resumption time is late, with no grace period", Mb.tardyIsLate !== false ? "Yes" : "No — a grace period applies"],
      ["A day with no sign-out counts as an absence", Mb.checkoutRequired !== false ? "Yes" : "No"],
      ["Eviction is confirmed by an administrator before it takes effect", P.confirmEviction !== false ? "Yes" : "No — it takes effect automatically"],
    ]);
    para("An absence with a request still waiting is not fined until it is decided. Approved leave is excused; approved academic leave is not an absence at all.", { color: MUTE });
    }
    heading("Identity cards and reinstatement");
    table([{ l: "Rule", w: 0.62 }, { l: "Applies", w: 0.38 }], [
      ["Identity card not worn — first time", "A temporary card for the day; no fine"],
      ["Identity card not worn — second time", crCfMoney((P.idCard || {}).secondOffenceFine)],
      ["Identity card lost", crCfMoney((P.idCard || {}).lostFine)],
      ["Waiting period after an eviction before reinstatement", ((P.reinstatement || {}).coolOffDays || 0) + " days"],
      ["Reinstatement fine", crCfMoney((P.reinstatement || {}).fine)],
      ["Reinstatement training", (P.reinstatement || {}).training || "None"],
      ["Missing the Musing Period", (P.musing || {}).enabled ? "The day counts as a half-day (Musing Period ends " + ((P.musing || {}).endsAt || "—") + ")" : "No effect"],
    ]);
    const cal = (c, who) => {
      if (!c || !c.enabled) return [who, "No calendar set — every date counts", "", ""];
      const days = (c.weekdays || []).map(n => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][n]).join(", ");
      return [who, c.startDate && c.endDate ? crCfDay(c.startDate) + " to " + crCfDay(c.endDate) : c.derivedFromSession ? "Follows the season / terms" : "Open", days || "—",
        ((c.holidays || []).length ? (c.holidays || []).length + " cancelled" : "None cancelled") + ((c.extraDays || []).length ? ", " + (c.extraDays || []).length + " added" : "")];
    };
    heading("Programme days");
    para("Absences, lateness and the fines that follow are counted only on programme days: the days of the week below, within the dates shown, less the days cancelled and plus the days added.");
    table([{ l: "Calendar", w: 0.24 }, { l: "Dates", w: 0.30 }, { l: "Meets on", w: 0.22 }, { l: "Exceptions", w: 0.24 }], [cal(pol.programme, "Summer School"), cal(pol.memberProgramme, "NGG members")]);
  } else {
    heading("Attendance, lateness and programme days");
    para("These sections need the Summer School permission to read and are not included in this copy.", { color: MUTE });
  }

  heading("Fairness, records and appeals");
  [
    "Every fine is recorded on the member’s account with its reason and date, and guardians can see every line.",
    "A fine recorded in error is voided with a written reason; it stays on the record, struck through, and anything it caused is lifted at once.",
    "A member or guardian may appeal any charge from their account (Requests → Appeal a charge). The appeal is answered in writing.",
    "No fine is charged beyond the limit for its kind in a term, and no rule is applied while it is switched off.",
  ].forEach((t, i) => para((i + 1) + ".  " + t));

  // Footers: page numbers and the document's own reference, on every page.
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.line(M, H - 15, W - M, H - 15);
    text("Next Generation Genius · Conduct & Fines · " + ref, M, H - 10, { size: 8, color: MUTE });
    text("Page " + i + " of " + n, W - M, H - 10, { size: 8, color: MUTE, align: "right" });
  }
  doc.setProperties({ title: "Conduct & Fines — the rules of the programme", subject: "NGG conduct and fines", author: "Next Generation Genius", creator: "NGG Control Room" });
  doc.save("NGG-Conduct-and-Fines-" + today.toISOString().slice(0, 10) + ".pdf");
  ctx.toast("The rules document is downloading.");
}

Object.assign(CR_TAB_DEFS, {
  conduct: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const safe = p => p.then(ok => ({ ok }), err => ({ err }));
      const fees = ctx.can("fees"), summer = ctx.can("summer"), board = ctx.can(["people", "summer"]);
      const [rules, once, pol, brd, integ, corr] = await Promise.all([
        fees ? safe(NGGApi.admin.fees.fineRules()) : null,
        fees ? safe(NGGApi.admin.fees.finesClearOnce("status")) : null,
        summer ? safe(NGGApi.admin.policy.settings()) : null,
        board ? safe(NGGApi.admin.policy.board()) : null,
        board ? safe(NGGApi.admin.policy.integrity()) : null,
        ctx.can("people") ? safe(NGGApi.admin.policy.correctives()) : null,
      ]);
      const prev = ctx.data || {};
      return { rules: rules && rules.ok, rulesErr: rules && rules.err, once: once && once.ok, pol: pol && pol.ok, polErr: pol && pol.err,
        board: brd && brd.ok, boardErr: brd && brd.err, integ: integ && integ.ok, integErr: integ && integ.err, correctives: corr && corr.ok,
        freshPlan: prev.freshPlan || null,
        finePlan: prev.finePlan || null, clearPlan: prev.clearPlan || null, repairPlan: prev.repairPlan || null, imported: prev.imported || null };
    },
    actions: (d, ctx) => {
      const v = crCfView(ctx), out = [];
      if (v === "") {
        out.push({ l: "Upload fines", icon: "upload-simple", primary: true, run: () => crCfFineCheck(ctx) });
        if (d.rules) out.push({ l: "Add a rule", icon: "plus", run: () => crCfRuleEdit(ctx, d.rules, null) });
      }
      /* The whole rule book as one formal PDF, from every view that shows rules. */
      if (v !== "compliance") out.push({ l: "Export the rules (PDF)", icon: "file-pdf", run: () => crCfRulesPdf(ctx, d).catch(e => ctx.toast(crErr(e, "Couldn’t make the document."), null, true)) });
      if ((v === "policy" || v === "calendar") && ctx.can("summer")) out.push({ l: "Run the absence sweep now", icon: "broom", run: () => crCfSweep(ctx) });
      if (v === "compliance") {
        if (ctx.can("people")) out.push({ l: "Fresh start…", icon: "sparkle", run: () => crCfFreshStart(ctx) });
        out.push({ l: "Repair absences", icon: "first-aid-kit", run: () => crCfRepairForm(ctx) });
        /* The no-sign-out rule (a half-day, not an absence) applied to past days now,
           with what changed — rather than waiting for the hourly maintenance. */
        if (ctx.can("people")) out.push({ l: "Apply half-days to past days", icon: "circle-half", run: async () => {
          try { const r = await NGGApi.admin.policy.halfday();
            ctx.toast(r.converted || r.reworked ? crPlural(r.converted, "day") + " made a half-day for " + crPlural(r.people, "person", "people") + (r.reworked ? " · " + crPlural(r.reworked, "person", "people") + "’s fines corrected" : "") + (r.more ? " · more left, press again" : "") + "." : "Nothing to change: every day with no sign-out is already a half-day.");
            crCfRefresh(ctx); } catch (e) { ctx.toast(crErr(e, "Couldn’t apply it."), null, true); } } });
        /* Lates recorded for arrivals before lateness begins (the older definition)
           undone now, with their fines refunded — the nightly check does it too. */
        if (ctx.can("people")) out.push({ l: "Correct lates before the first band", icon: "clock-counter-clockwise", run: async () => {
          try { const r = await NGGApi.admin.policy.prelate();
            ctx.toast(r.voided || r.reworded ? [r.voided ? crPlural(r.voided, "late") + " undone for " + crPlural(r.people, "person", "people") : "",
              r.refunded ? crPlural(r.refunded, "paid fine") + " refunded as credit" : "", r.reworded ? crPlural(r.reworded, "entry", "entries") + " reworded" : "",
              r.more ? "more left, press again" : ""].filter(Boolean).join(" · ") + "." : "Nothing to correct: every late on record arrived at or after the first band.");
            crCfRefresh(ctx); } catch (e) { ctx.toast(crErr(e, "Couldn’t correct them."), null, true); } } });
        out.push({ l: "Refresh", icon: "arrows-clockwise", run: () => crCfRefresh(ctx) });
      }
      return out;
    },
    blocks: (d, ctx) => {
      const views = CR_CF_VIEWS.filter(x => ctx.can(x[2]));
      const v = crCfView(ctx);
      /* custom: a view switcher bound to the URL tail, the same control as Dues & arrears'. */
      const pick = x => { ctx.closeDrawer(); ctx.setSub(x); };
      const opts = views.map(x => [x[0], x[1]]);
      const out = views.length > 1 ? [{ type: "custom", span: 6, render: (c, phone) => <CrSeg label="Conduct view" value={v} options={opts} onChange={pick} full={phone}/> }] : [];
      const body = v === "compliance" ? crCfComplianceBlocks(d, ctx) : v === "policy" ? crCfPolicyBlocks(d, ctx) : v === "calendar" ? crCfCalendarBlocks(d, ctx) : crCfFinesBlocks(d, ctx);
      return out.concat(body);
    },
    facts: d => [d.rules ? (d.rules.thisTerm.n + " fines this term, " + fmtMoney(d.rules.thisTerm.total) + "; " + (d.rules.rules || []).filter(r => r.active).length + " rules on.") : "",
      d.board ? (d.board.board || []).length + " people with something on record; enforcement " + (d.board.policyEnabled ? "on" : "off") + "." : ""].filter(Boolean).join(" "),
  },
});
/** The open view: the URL tail if this person may see it, else the first they may. */
function crCfView(ctx) {
  const views = CR_CF_VIEWS.filter(x => ctx.can(x[2]));
  const want = views.find(x => x[0] === (ctx.sub || ""));
  return want ? want[0] : views.length ? views[0][0] : "";
}
