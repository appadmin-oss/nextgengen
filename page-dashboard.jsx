/* ================================================================
   NGG — Active Member Dashboard.
   This is the page members land on after sign-in. Live data, actionable.
   ================================================================ */

/* ══ SELF-SERVICE ═══════════════════════════════════════════════════════════
 *
 * Three sections a member can reach on their own, and the shared plumbing under
 * them. What ties them together is that each answers a question a member would
 * otherwise have to ask a human, at a time when no human is there: what do I
 * owe and how did it get there, can I prove I attend, and how do I tell you
 * something.
 *
 * The one thing none of them does is move money. A payment a member reports is
 * a CLAIM — the desk goes and looks, and posts it if it is there. See
 * api/_lib/domain/member-self.php.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Async section state in one place: every one of these loads once, can fail,
 *  and must be retryable without a page refresh. */
function useSelfService(fetcher, deps) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [seq, setSeq] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    setErr("");
    fetcher().then((r) => { if (alive) setD(r); })
      .catch((e) => { if (alive) setErr(e.code || e.message || "load_failed"); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, (deps || []).concat([seq]));
  return [d, err, () => setSeq((n) => n + 1)];
}

function DashMoneyText({ n, currency }) {
  const sym = currency === "NGN" || !currency ? "\u20a6" : currency + " ";
  return <span className="mono">{sym}{Number(n || 0).toLocaleString("en-NG")}</span>;
}

function DashSectionShell({ title, sub, children, err, onRetry, loading }) {
  return (
    <section className="ngg-anchor ngg-anchor-narrow">
      <header style={{ marginBottom: 16 }}>
        <h2 className="ngg-head-name" style={{ fontSize: 26, margin: 0 }}>{title}</h2>
        {sub && <p className="ngg-head-sub" style={{ margin: "6px 0 0" }}>{sub}</p>}
      </header>
      {err ? <ErrorState code={err} onRetry={onRetry}/> : loading ? <div className="dash-spinner"/> : children}
    </section>
  );
}

/* ── School results ──────────────────────────────────────────────────────────
 * Upload the term's report, check the scores, plan at most three subjects with
 * a "when and where", and send it to the mentor, who approves it in the Mentor
 * Portal. The flow is MbrResults (src/modules/portal/member-results.jsx); this
 * is its place on the dashboard, in the dashboard's own palette (.dash-results). */
function DashResults() {
  return (
    <section className="ngg-anchor ngg-anchor-narrow dash-results">
      <header style={{ marginBottom: 16 }}>
        <h2 className="ngg-head-name" style={{ fontSize: 26, margin: 0 }}>School results</h2>
        <p className="ngg-head-sub" style={{ margin: "6px 0 0" }}>Upload your report card, check the scores, and plan next term with your mentor.</p>
      </header>
      <MbrResults/>
    </section>
  );
}

/* ── Money & account ─────────────────────────────────────────────────────────
 * The statement is the point: a list of charges with no running total cannot
 * answer "how did it get to this number", which is the first thing anybody
 * querying a balance actually wants.
 *
 * Two totals, deliberately. `payable` is real money — membership, dues, fines.
 * `total` is the whole account including the training fee, which is the cost of
 * a place the child has been given, not a bill. One number for both would tell
 * a family they owe ₦225,000 for something free. */
function DashAccount({ onRaise }) {
  const [d, err, retry] = useSelfService(() => NGGApi.member.statement());
  const [showAll, setShowAll] = React.useState(false);
  const cur = (d && d.currency) || "NGN";
  const lines = (d && d.lines) || [];
  const shown = showAll ? lines : lines.slice(-25);

  return (
    <DashSectionShell title="Money & account" err={err} onRetry={retry} loading={!d}
      sub="Every line on your account, oldest first, with the running total after each one.">
      {d && !d.enabled ? (
        <div className="dash-card"><div className="admin-empty">
          Nothing is being charged on this account.
        </div></div>
      ) : d && (
        <React.Fragment>
          <div className="dash-card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>To pay</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}><DashMoneyText n={d.closingPayable} currency={cur}/></div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>Membership, dues and any fines.</div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Whole account</div>
                <div style={{ fontSize: 26, fontWeight: 300 }}><DashMoneyText n={d.closingTotal} currency={cur}/></div>
                {/* Quiet, and stating the condition rather than promising the
                    outcome — a member who leaves before the MOU still owes it. */}
                <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>Includes the training fee, which service writes off.</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => onRaise("payment")}>I&rsquo;ve made a payment</button>
            </div>
          </div>

          {!lines.length ? (
            <div className="dash-card"><div className="admin-empty">Nothing has been charged yet.</div></div>
          ) : (
            <div className="dash-card">
              {lines.length > shown.length && (
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 10 }} onClick={() => setShowAll(true)}>
                  Show all {lines.length} lines
                </button>
              )}
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Date</th><th>What</th><th style={{ textAlign: "right" }}>Charge</th><th style={{ textAlign: "right" }}>Paid</th><th style={{ textAlign: "right" }}>To pay</th></tr></thead>
                  <tbody>
                    {shown.map((l, i) => (
                      <tr key={i} style={l.void ? { opacity: .5, textDecoration: "line-through" } : null}>
                        <td className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{l.date}</td>
                        <td>{l.note || l.kind}
                          {!l.real && <span className="mono" style={{ fontSize: 10, marginLeft: 6, color: "var(--ink-400)" }}>PROGRAMME COST</span>}
                          {l.void && l.voidReason && <div style={{ fontSize: 11, color: "var(--ink-500)", textDecoration: "none" }}>Cancelled — {l.voidReason}</div>}
                        </td>
                        <td style={{ textAlign: "right" }}>{l.charge ? <DashMoneyText n={l.charge} currency={cur}/> : ""}</td>
                        <td style={{ textAlign: "right" }}>{l.credit ? <DashMoneyText n={l.credit} currency={cur}/> : ""}</td>
                        <td style={{ textAlign: "right" }} className="mono"><DashMoneyText n={l.runningPayable} currency={cur}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* window.print() rather than a generated PDF: the browser's own
                  print-to-PDF is on every device a family has, needs no library
                  in the bundle, and produces something they can actually keep. */}
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm noprint" onClick={() => window.print()}>Print / save as PDF</button>
              </div>
            </div>
          )}
        </React.Fragment>
      )}
    </DashSectionShell>
  );
}

/* ── Records ─────────────────────────────────────────────────────────────────
 * What a member might be asked to evidence to somebody outside the programme.
 * The attendance rate is withheld rather than invented when the calendar has no
 * term dates — a percentage over an unknown denominator is a number somebody
 * will put in a school application. */
/* ── The Courage Index, as the member sees it ────────────────────────────────
 * NGGC 2040 brief §14. This is the one part of the mentoring record that is
 * the child's to read: meetings and goals are staff notes and the server never
 * serves them here, but a ladder somebody is being moved along without being
 * told where they are is assessment, not formation.
 *
 * Two things it deliberately does not do. It shows no other member — courage
 * is not a competition and the brief is explicit that the objective is not
 * reckless children. And it never renders an unscored member as a 1: a child
 * nobody has observed yet has no score, which is a different statement from
 * "avoids responsibility" and a much better one to read about yourself.
 *
 * Fetched separately from records() rather than folded into it, so a member
 * with no marks still gets their attendance if this call fails. */
function DashCourage() {
  const [d, err] = useSelfService(() => NGGApi.member.courage());
  const c = (d && d.courage) || null;
  const ladder = (d && d.ladder) || [];
  // A failed fetch hides the card rather than printing an error over somebody's
  // own conduct record — the rest of the page is still useful.
  if (err || !d || !c) return null;

  const dirWord = { rising: "going up", falling: "going down", steady: "holding steady" }[c.direction] || "";
  const here = c.rung ? c.rung.score : 0;

  return (
    <div className="dash-card" style={{ marginBottom: 16 }}>
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Courage</h3></div>
      {c.current === null ? (
        <div style={{ fontSize: 13.5, color: "var(--ink-500)", lineHeight: 1.55, maxWidth: "62ch" }}>
          Nothing recorded yet. Your mentor adds to this when they see you do something
          difficult, own a mistake, ask the question nobody else will, or stand up for
          someone. It is not a measure of how loud you are.
        </div>
      ) : (
        <React.Fragment>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
            <div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Where you are</div>
              <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {c.current}<span style={{ fontSize: 13, color: "var(--ink-500)", marginLeft: 6 }}>of 5</span>
              </div>
            </div>
            <div style={{ maxWidth: "34ch" }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>What that means</div>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{c.rung ? c.rung.label : "—"}</div>
            </div>
            {dirWord ? (
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Lately</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{dirWord}</div>
              </div>
            ) : null}
          </div>

          {/* The whole ladder, with the rung they are on marked — so the number
              means something without a mentor sitting beside them to explain it. */}
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {ladder.map(r => (
              <li key={r.score} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 10,
                background: r.score === here ? "var(--cream-100)" : "transparent",
                border: "1px solid " + (r.score === here ? "var(--cream-200)" : "transparent"),
              }}>
                <span aria-hidden="true" className="mono" style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center",
                  fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  background: r.score === here ? "var(--navy-900)" : "var(--cream-100)",
                  color: r.score === here ? "white" : "var(--ink-500)",
                }}>{r.score}</span>
                <span style={{ fontSize: 14, color: r.score === here ? "var(--ink-900)" : "var(--ink-500)",
                               fontWeight: r.score === here ? 600 : 400 }}>{r.label}</span>
                {r.score === here ? <span className="sr-only">— where you are now</span> : null}
              </li>
            ))}
          </ol>

          <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-500)", fontVariantNumeric: "tabular-nums" }}>
            From {c.inWindow} thing{c.inWindow === 1 ? "" : "s"} your mentor recorded in the last {c.windowDays} days.
            {c.inWindow < 4 ? " Too few yet to say which way it is moving." : ""}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function DashRecords({ onRaise }) {
  const [d, err, retry] = useSelfService(() => NGGApi.member.records());
  const att = (d && d.attendance) || {};
  const [showAll, setShowAll] = React.useState(false);
  const days = att.days || [];

  return (
    <DashSectionShell title="Records" err={err} onRetry={retry} loading={!d}
      sub="Your attendance and anything the programme has issued you.">
      {d && (
        <React.Fragment>
          <div className="dash-card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Days attended</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{att.present || 0}</div>
              </div>
              {att.rateKnown ? (
                <div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Of days the programme ran</div>
                  <div style={{ fontSize: 26, fontWeight: 300 }}>{att.rate}%<span style={{ fontSize: 13, color: "var(--ink-500)", marginLeft: 8 }}>of {att.daysRan}</span></div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--ink-500)", maxWidth: 320 }}>
                  A rate needs the days the programme ran, and no term calendar is set — so it is not shown rather than guessed.
                </div>
              )}
            </div>
          </div>

          <DashCourage/>

          <div className="dash-card" style={{ marginBottom: 16 }}>
            <div className="dash-card-head"><h3 className="dash-card-h-sm">Certificates</h3></div>
            {!(d.certificates || []).length ? (
              <div className="admin-empty">Nothing issued yet.</div>
            ) : (d.certificates.map((c) => (
              <div key={c.certId} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--ink-100,#e6e8ec)" }}>
                <div>
                  <div className="mono" style={{ fontSize: 13 }}>{c.certId}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    {c.daysPresent} days · {c.attendanceRate}% · issued {String(c.issuedAt).slice(0, 10)}
                  </div>
                </div>
                {c.revoked
                  ? <span className="mono" style={{ fontSize: 11, color: "#b03535" }}>REVOKED</span>
                  : <a className="btn btn-ghost btn-sm" href={"/cert/" + c.certId} aria-label={"Open certificate " + c.certId}>Open certificate</a>}
              </div>
            )))}
          </div>

          <div className="dash-card">
            <div className="dash-card-head"><h3 className="dash-card-h-sm">Attendance</h3></div>
            {!days.length ? <div className="admin-empty">No days recorded yet.</div> : (
              <React.Fragment>
                <div className="admin-table-wrap" style={{ maxHeight: showAll ? "none" : 320, overflowY: "auto" }}>
                  <table className="admin-table">
                    <thead><tr><th>Date</th><th>In</th><th>Out</th></tr></thead>
                    <tbody>{days.map((x, i) => (
                      <tr key={i}><td className="mono" style={{ fontSize: 12 }}>{x.date}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{x.in || "—"}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{x.out || "—"}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                {!showAll && days.length > 10 && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setShowAll(true)}>Show every day</button>
                )}
              </React.Fragment>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-sm noprint" onClick={() => window.print()}>Print / save as PDF</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onRaise("idcard")}>Ask for a replacement ID</button>
            </div>
          </div>
        </React.Fragment>
      )}
    </DashSectionShell>
  );
}

/* ── Requests ────────────────────────────────────────────────────────────────
 * The one place a member can say something to the desk and see what happened to
 * it. Four kinds, one shape.
 *
 * The status of an old request is as much the point as raising a new one: a
 * member who cannot see that their appeal was read will raise it again, which
 * is how a queue becomes unworkable for everybody. */
const DASH_REQUEST_STATUS = {
  open:      { label: "Waiting for a reply", tone: "var(--gold-700, #7d5a00)" },
  approved:  { label: "Approved",            tone: "var(--lime-ink, #4b7a00)" },
  declined:  { label: "Declined",            tone: "#b03535" },
  withdrawn: { label: "Withdrawn",           tone: "var(--ink-400, #9aa0ac)" },
};

function DashRequests({ openKind, onKindHandled, onCountChange }) {
  const [d, err, retry] = useSelfService(() => NGGApi.member.requests());
  const [draft, setDraft] = React.useState(null);   // { kind, ... } while composing
  const [busy, setBusy] = React.useState(false);
  const rows = (d && d.requests) || [];
  const kinds = (d && d.kinds) || {};

  /* Another section asked for a form — "I've made a payment" on the account
     page, "replacement ID" on records. Opening it here keeps one composer. */
  React.useEffect(() => {
    if (openKind) { setDraft({ kind: openKind, body: "", amount: "", reference: "", paidAt: "", fromDate: "", toDate: "" }); onKindHandled(); }
  }, [openKind]); // eslint-disable-line
  React.useEffect(() => { if (onCountChange) onCountChange(rows.filter((r) => r.status === "open").length); }, [rows]); // eslint-disable-line

  const send = async () => {
    setBusy(true);
    try {
      await NGGApi.member.raiseRequest(Object.assign({}, draft, { amount: draft.amount === "" ? null : Number(draft.amount) }));
      toast.success("Sent. You'll see the reply here.", "Request raised");
      setDraft(null); retry();
    } catch (e) { toast.error(e.detail || e.code || e.message); } finally { setBusy(false); }
  };
  const withdraw = async (r) => {
    if (!(await dialog.confirm({ title: "Withdraw this request?", body: "The desk will stop looking at it. You can raise another.", cta: "Withdraw" }))) return;
    try { await NGGApi.member.withdrawRequest(r.requestId); retry(); }
    catch (e) { toast.error(e.detail || e.code || e.message); }
  };

  const field = (k, label, attrs) => (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>{label}</span>
      <input className="admin-input" style={{ display: "block", marginTop: 5, maxWidth: 320 }}
        value={draft[k] || ""} onChange={(e) => setDraft((o) => Object.assign({}, o, { [k]: e.target.value }))} {...(attrs || {})}/>
    </label>
  );

  return (
    <DashSectionShell title="Requests" err={err} onRetry={retry} loading={!d}
      sub="Tell the desk something, and see what came back.">
      {d && (
        <React.Fragment>
          {!draft ? (
            <div className="dash-card" style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.keys(kinds).map((k) => (
                <button key={k} className="btn btn-ghost btn-sm"
                  onClick={() => setDraft({ kind: k, body: "", amount: "", reference: "", paidAt: "", fromDate: "", toDate: "" })}>
                  {kinds[k]}
                </button>
              ))}
            </div>
          ) : (
            <div className="dash-card" style={{ marginBottom: 16 }}>
              <div className="dash-card-head"><h3 className="dash-card-h-sm">{kinds[draft.kind] || draft.kind}</h3></div>
              {draft.kind === "payment" && (
                <React.Fragment>
                  {/* Said plainly, because the alternative is a member believing
                      the balance updates the moment they press send. */}
                  <p className="admin-hint" style={{ marginTop: 0 }}>
                    This tells the desk to look for your payment. Your balance changes when they find it, not when you send this.
                  </p>
                  {field("amount", "How much", { type: "number", min: 1, inputMode: "numeric" })}
                  {field("reference", "Transfer reference, if you have one")}
                  {field("paidAt", "When you paid", { type: "date" })}
                </React.Fragment>
              )}
              {draft.kind === "leave" && (
                <React.Fragment>
                  {field("fromDate", "From", { type: "date" })}
                  {field("toDate", "Until (leave blank if you do not know)", { type: "date" })}
                </React.Fragment>
              )}
              <label style={{ display: "block", marginBottom: 12 }}>
                <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>
                  {draft.kind === "payment" ? "Anything else the desk should know" : "Say why"}
                </span>
                <textarea className="admin-input" rows={4} style={{ display: "block", marginTop: 5 }}
                  value={draft.body} onChange={(e) => setDraft((o) => Object.assign({}, o, { body: e.target.value }))}/>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send"}</button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
              </div>
            </div>
          )}

          {!rows.length ? (
            <div className="dash-card"><div className="admin-empty">You have not raised anything yet.</div></div>
          ) : rows.map((r) => {
            const st = DASH_REQUEST_STATUS[r.status] || { label: r.status, tone: "var(--ink-500)" };
            return (
              <div key={r.requestId} className="dash-card" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{r.subject || r.kindLabel}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-400)" }}>
                      {r.kindLabel} · {String(r.createdAt).slice(0, 10)} · {r.requestId}
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: st.tone, whiteSpace: "nowrap" }}>{st.label.toUpperCase()}</span>
                </div>
                {r.body && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-600)" }}>{r.body}</p>}
                {r.decision && (
                  <div style={{ marginTop: 10, padding: "9px 11px", background: "var(--ink-050, #f5f6f8)", borderRadius: 6 }}>
                    <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--ink-400)" }}>THE DESK REPLIED</div>
                    <div style={{ fontSize: 13, marginTop: 3 }}>{r.decision}</div>
                  </div>
                )}
                {r.status === "open" && (
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => withdraw(r)}>Withdraw</button>
                )}
              </div>
            );
          })}
        </React.Fragment>
      )}
    </DashSectionShell>
  );
}

/* ── The dashboard's own URL subtree ──────────────────────────────────────────
 *
 * /dashboard, /dashboard/account, /dashboard/records, /dashboard/requests.
 *
 * The overview stays one scroll of cards, because that is what it is for and
 * splitting it would cost a member the glance that answers "what do I owe, what
 * is due today". What DID need addresses is the self-service work: a member
 * emailing the desk about a payment wants to send "here is my statement", and a
 * back button that leaves the page is not a back button.
 *
 * app.jsx knows not to rewrite this subtree (see `inDashSubtree`); everything
 * else about routing is here, next to the thing it routes.
 */
var DASH_SECTIONS = [
  { id: "overview", path: "", label: "Overview" },
  { id: "timetable", path: "timetable", label: "Timetable" },
  { id: "learning", path: "learning", label: "Curriculum" },
  { id: "results",  path: "results",  label: "School results" },
  { id: "companion", path: "companion", label: "Companion" },
  { id: "account",  path: "account",  label: "Money & account" },
  { id: "records",  path: "records",  label: "Records" },
  { id: "requests", path: "requests", label: "Requests" },
];

function dashSectionFromPath() {
  var seg = (window.location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
  if (seg[0] !== "dashboard") return "overview";
  var hit = DASH_SECTIONS.find(function (x) { return x.path && x.path === seg[1]; });
  return hit ? hit.id : "overview";
}

/** Section state that IS the URL: pushState on change, popstate to go back. */
function useDashSection() {
  const [section, setSection] = React.useState(dashSectionFromPath);
  React.useEffect(() => {
    const onPop = () => setSection(dashSectionFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = React.useCallback((id) => {
    const hit = DASH_SECTIONS.find((x) => x.id === id) || DASH_SECTIONS[0];
    const path = "/dashboard" + (hit.path ? "/" + hit.path : "");
    if (window.location.pathname !== path) history.pushState({ page: "dashboard", section: id }, "", path);
    setSection(hit.id);
    /* A section change is a page change: start it at the top, and tell a screen
       reader that something happened — neither is implied by a re-render. */
    try { window.scrollTo({ top: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, 0); }
  }, []);
  return [section, go];
}

function DashSectionTabs({ section, go, openRequests }) {
  return (
    <nav className="dash-tabs" aria-label="Dashboard sections"
      style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "0 0 18px", borderBottom: "1px solid var(--ink-100, #e6e8ec)" }}>
      {DASH_SECTIONS.map((sx) => {
        const on = sx.id === section;
        return (
          <button key={sx.id} type="button" onClick={() => go(sx.id)}
            aria-current={on ? "page" : undefined}
            /* minHeight 44 is the product's touch-target convention (see the
               same value throughout page-other.jsx). These tabs were added
               after tests/dashboard-shot.js started asserting it and were the
               only four controls on the phone render breaking it — inline-flex
               so the label still centres once the box is taller than its text. */
            style={{ appearance: "none", background: "none", cursor: "pointer",
              border: 0, borderBottom: "2px solid " + (on ? "var(--gold-600, #a07400)" : "transparent"),
              display: "inline-flex", alignItems: "center", minHeight: 44,
              padding: "9px 13px", marginBottom: -1, font: "inherit", fontSize: 14,
              fontWeight: on ? 650 : 450, color: on ? "var(--ink-900, #16223e)" : "var(--ink-500, #5b6478)" }}>
            {sx.label}
            {sx.id === "requests" && openRequests > 0 && (
              <span className="mono" style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 999,
                background: "var(--gold-100, #fdf3d8)", color: "var(--gold-700, #7d5a00)" }}>{openRequests}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function DashboardPage({ setPage }) {
  const { member, isSignedIn, loading, openSignIn, signOut } = useAuth();
  const [data, setData] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  const [mutateSeq, setMutateSeq] = React.useState(0);
  const [err, setErr] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);
  /* The record drive (domain/profile-drive.php): what is missing from this
     member's record, and whether the account is locked until it is done. */
  const [rec, setRec] = React.useState(null);
  const loadRec = React.useCallback(() => { NGGApi.member.record().then(setRec, () => {}); }, []);
  React.useEffect(() => { if (isSignedIn) loadRec(); }, [isSignedIn, loadRec]);
  React.useEffect(() => {
    const f = () => loadRec();
    window.addEventListener("ngg:record-incomplete", f);
    return () => window.removeEventListener("ngg:record-incomplete", f);
  }, [loadRec]);

  // A real user mutation (mission submit, journal, RSVP) bumps both the
  // dashboard reload and a mutation sequence the activity feed listens to —
  // separating it from the silent 60s poll so the feed isn't double-fetched.
  const onMutate = React.useCallback(() => {
    setReload(r => r + 1);
    setMutateSeq(s => s + 1);
  }, []);

  React.useEffect(() => {
    if (!isSignedIn) return;
    let alive = true;
    if (reload > 0) setRefreshing(true);
    NGGApi.member.dashboard()
      .then(d => { if (alive) { setData(d); setErr(""); } })
      // Only surface the full error screen on the FIRST load. A transient
      // poll failure must not wipe an already-loaded dashboard to "off-line"
      // — keep showing the last good data (stale-while-revalidate).
      .catch(e => { if (alive) setErr(prev => data ? prev : (e.code || e.message)); })
      .finally(() => { if (alive) setRefreshing(false); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [isSignedIn, reload]);

  // Poll every 60s to keep stats and notifications fresh — but only when
  // the tab is visible. Background tabs drained battery + burned API
  // calls (members reported the dashboard chewing data on phones left
  // in their pocket). We also refresh immediately on becoming-visible
  // so the dashboard is current the moment they look at it.
  /* NGG members get the Member Portal (v9, src/modules/member9), which reads
     its own data per screen; `?classic=1` keeps this dashboard reachable. */
  const v9 = !!(data && memberIsNgg(data.member)) && !/[?&]classic=1/.test(window.location.search || "") && typeof Mp9Portal === "function";
  React.useEffect(() => {
    if (!isSignedIn || v9) return;
    let id = null;
    const start = () => { if (!id) id = setInterval(() => setReload(r => r + 1), 60000); };
    const stop  = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => {
      if (document.hidden) stop();
      else { setReload(r => r + 1); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [isSignedIn, v9]);

  if (loading) {
    return <DashboardShell setPage={setPage}><DashboardSkeleton/></DashboardShell>;
  }
  if (!isSignedIn) {
    return <DashboardShell setPage={setPage}><DashboardSignedOut openSignIn={openSignIn} setPage={setPage}/></DashboardShell>;
  }
  // Full error screen only when we have nothing to show.
  // A volunteer signed in with their card: their own landing, not an error.
  if (data && data.volunteer) return <DashboardShell setPage={setPage}><VolunteerHome v={data.volunteer}/></DashboardShell>;
  if (err && !data) {
    if (rec && rec.locked) return <DashboardShell setPage={setPage}><RecordDrive status={rec} locked onSaved={setRec} onSignOut={signOut}/></DashboardShell>;
    return <DashboardShell setPage={setPage}><DashboardError code={err} onRetry={() => setReload(r => r + 1)}/></DashboardShell>;
  }
  if (!data) {
    return <DashboardShell setPage={setPage}><DashboardSkeleton/></DashboardShell>;
  }

  // The record drive: past its deadline, an incomplete record is the only screen.
  if (rec && rec.locked) {
    return <DashboardShell setPage={setPage}><RecordDrive status={rec} locked onSaved={setRec} onSignOut={signOut}/></DashboardShell>;
  }

  if (v9) return <Mp9Portal rec={rec} onRecSaved={setRec} onSignOut={signOut}/>;

  return (
    <DashboardShell setPage={setPage}>
      {rec && rec.asked && <RecordDrive status={rec} onSaved={setRec}/>}
      <DashboardLive
        data={data}
        setPage={setPage}
        refreshing={refreshing}
        mutateSeq={mutateSeq}
        onMutate={onMutate}
        onSignOut={signOut}
      />
    </DashboardShell>
  );
}

/* ── The record drive: complete your record ─────────────────────────────────
   Before the deadline, a card at the top of the dashboard with the days left;
   after it, the only screen until the record is complete. Each missing field
   is asked once, checked by the same rules the server uses, and saved in one
   go; a refusal names each field. */
function RecordDrive({ status, locked, onSaved, onSignOut }) {
  const [open, setOpen] = React.useState(!!locked);
  const [vals, setVals] = React.useState(() => Object.fromEntries((status.fields || []).map(f => [f.key, f.value || ""])));
  const [errs, setErrs] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const fields = (status.fields || []).filter(f => f.self);
  const staffOnly = (status.fields || []).filter(f => !f.self);
  const set = (k, v) => { setVals(x => Object.assign({}, x, { [k]: v })); setErrs(e => (e[k] ? Object.assign({}, e, { [k]: "" }) : e)); };
  const days = status.daysLeft;
  const when = status.deadline ? new Date(status.deadline + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await NGGApi.member.recordSave(Object.fromEntries(fields.map(f => [f.key, vals[f.key]])));
      setErrs({});
      onSaved && onSaved(r);
      if (!r.asked) setMsg("Thank you. Your record is complete.");
    } catch (e) {
      const ee = (e && e.data && e.data.errors) || null;
      if (ee) { setErrs(ee); setMsg("A few answers need another look."); }
      else setMsg("We couldn’t save that. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  const lgaList = vals.resState && typeof APF_LGAS !== "undefined" ? APF_LGAS[vals.resState] : null;
  const input = f => {
    const id = "rec-" + f.key, bad = !!errs[f.key];
    const common = { id, "aria-invalid": bad || undefined, "aria-describedby": bad ? id + "-e" : undefined };
    if (f.type === "photo") return <PhotoCapture value={vals[f.key]} onChange={u => set(f.key, u)} label="Passport photo"/>;
    if (f.type === "choice" || (f.key === "resState" && typeof APF_STATES !== "undefined") || (f.key === "resLga" && lgaList)) {
      const opts = f.key === "resState" ? APF_STATES : f.key === "resLga" ? lgaList : f.options;
      return <select {...common} className="rec-input" value={vals[f.key]} onChange={e => set(f.key, e.target.value)}>
        <option value="">Choose…</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}</select>;
    }
    if (f.type === "textarea") return <textarea {...common} className="rec-input" rows={3} value={vals[f.key]} onChange={e => set(f.key, e.target.value)}/>;
    return <input {...common} className="rec-input" type={f.type === "date" ? "date" : f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"}
      inputMode={f.type === "tel" ? "tel" : f.type === "email" ? "email" : undefined} value={vals[f.key]} onChange={e => set(f.key, e.target.value)}/>;
  };
  return (
    <section className={"rec" + (locked ? " is-locked" : "")} aria-labelledby="rec-h">
      <div className="rec-head">
        <i className={"ph " + (locked ? "ph-lock-simple" : "ph-clipboard-text")} aria-hidden="true"/>
        <div className="rec-head-t">
          <h2 id="rec-h">{locked ? "Complete your record to carry on" : "Complete your record"}</h2>
          <p>{locked
            ? "The deadline" + (when ? " (" + when + ")" : "") + " has passed. Fill in what is missing below and your dashboard opens again straight away."
            : (days != null && days >= 0 ? (days === 0 ? "Due today" : days + (days === 1 ? " day" : " days") + " left") + (when ? ", by " + when : "") + ". " : "")
              + "NGG is making every member’s record complete. After the deadline, the dashboard opens on this form until it is done."}</p>
        </div>
        {!locked && <button type="button" className="btn btn-primary btn-sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? "Later" : "Complete now"}</button>}
      </div>
      {open && <>
        <p className="rec-count" role="status">{fields.length === 1 ? "One thing is missing." : fields.length + " things are missing."} Ask a parent or guardian to help with their details.</p>
        <div className="rec-grid">
          {fields.map(f => (
            <div key={f.key} className={"rec-fld" + (f.type === "textarea" || f.type === "photo" ? " is-wide" : "")}>
              <label htmlFor={"rec-" + f.key}>{f.label}</label>
              {input(f)}
              {errs[f.key] && <span className="rec-err" id={"rec-" + f.key + "-e"}><i className="ph ph-warning-circle" aria-hidden="true"/>{errs[f.key]}</span>}
            </div>
          ))}
        </div>
        {staffOnly.length > 0 && <p className="rec-note">Your centre also needs to set: {staffOnly.map(f => f.label.toLowerCase()).join(", ")}. Ask at the desk on Saturday; you can’t change {staffOnly.length === 1 ? "it" : "them"} here.</p>}
        {msg && <p className={"rec-msg" + (Object.keys(errs).length ? " is-bad" : "")} role="status">{msg}</p>}
        <div className="rec-actions">
          {fields.length > 0 && <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save my record"}</button>}
          {locked && onSignOut && <button type="button" className="btn btn-ghost" onClick={onSignOut}>Sign out</button>}
        </div>
      </>}
    </section>
  );
}

/* The dashboard route draws its own chrome (the Member Portal is a whole app);
   this older dashboard puts the site's header and footer back around itself. */
function DashboardShell({ children, setPage }) {
  setPage = setPage || (() => {});
  return (
    <React.Fragment>
      {typeof TopNav === "function" && <TopNav page="dashboard" setPage={setPage}/>}
      <main id="main" style={{ flex: 1 }}>
        <div className="page dashboard" data-screen-label="05 Dashboard">
          {children}
        </div>
      </main>
      {typeof Footer === "function" && <Footer setPage={setPage} page="dashboard"/>}
    </React.Fragment>
  );
}

// ============================================================================
// Signed-out screen — a sales pitch for what's behind the wall.
// ============================================================================

function DashboardSignedOut({ openSignIn, setPage }) {
  return (
    <section className="signed-out-hero" style={{padding: "var(--rs-p-104, 112px 0px 96px)"}}>
      <div className="container">
        <div className="signed-out-grid">
          <div>
            <div className="eyebrow" style={{color:"var(--gold-500)"}}>MEMBERS · DASHBOARD</div>
            <h1 className="display signed-out-h1">Your room is waiting.</h1>
            <p className="signed-out-p">
              The Anchor 12 dashboard, your streak, today's missions, your mentor,
              your journal, the next session countdown — all of it lives inside.
              Sign in to step in.
            </p>
            <div className="signed-out-cta">
              <button className="btn btn-primary btn-lg" onClick={() => openSignIn()}>
                Sign in →
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => setPage("join")}>
                Apply for a session
              </button>
            </div>
            <ul className="signed-out-list">
              <li><span/>Daily missions tied to the Anchor book</li>
              <li><span/>Mentor reviews and XP tracking</li>
              <li><span/>Session events, RSVPs and reminders for Egbeda and Ayobo</li>
              <li><span/>Private reflection journal — only you and your mentor</li>
            </ul>
          </div>
          <div className="signed-out-preview" aria-hidden="true">
            <div className="signed-out-card">
              <div className="signed-out-card-bar"/>
              <div className="signed-out-card-bar w70"/>
              <div className="signed-out-card-bar w50"/>
              <div className="signed-out-card-grid">
                <div/><div/><div/><div/><div/><div/>
              </div>
            </div>
            <div className="signed-out-card-blur"/>
          </div>
        </div>
      </div>
    </section>
  );
}

// Skeleton that mirrors the real dashboard layout, so the page doesn't
// jump from a centered spinner to a full grid — it fills in place.
function DashboardSkeleton() {
  return (
    <React.Fragment>
      <section className="dash-hero" aria-hidden="true">
        <div className="container">
          <div className="dash-hero-row">
            <div className="dash-hero-id">
              <div className="dash-skel dash-skel-avatar"/>
              <div>
                <div className="dash-skel dash-skel-line" style={{width:120, height:11, marginBottom:10}}/>
                <div className="dash-skel dash-skel-line" style={{width:180, height:34, marginBottom:12}}/>
                <div style={{display:"flex", gap:6}}>
                  <div className="dash-skel dash-skel-chip"/>
                  <div className="dash-skel dash-skel-chip"/>
                </div>
              </div>
            </div>
            <div className="dash-skel dash-skel-line" style={{width:140, height:64}}/>
          </div>
        </div>
      </section>
      <section className="dash-section">
        <div className="container">
          <div className="dash-grid">
            <div className="dash-main">
              <div className="dash-card dash-skel-card"><div className="dash-skel dash-skel-line" style={{width:"40%", height:24}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:60, marginTop:16}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:60, marginTop:10}}/></div>
              <div className="dash-card dash-skel-card"><div className="dash-skel dash-skel-line" style={{width:"30%", height:20}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:48, marginTop:14}}/></div>
            </div>
            <div className="dash-rail">
              <div className="dash-card dash-skel-card"><div className="dash-skel dash-skel-line" style={{width:"50%", height:18}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:72, marginTop:14}}/></div>
              <div className="dash-card dash-skel-card"><div className="dash-skel dash-skel-line" style={{width:"60%", height:18}}/><div className="dash-skel dash-skel-line" style={{width:"100%", height:40, marginTop:14}}/></div>
            </div>
          </div>
        </div>
      </section>
      <span className="sr-only" role="status">Loading your dashboard…</span>
    </React.Fragment>
  );
}

/* A volunteer's landing (instructor, mentor, centre ops): who they are, and
   their portals. The full volunteer dashboard (time on the portal, analytics)
   is a later piece of work; this says so rather than pretending. */
function VolunteerHome({ v }) {
  const role = { instructor: "Instructor", mentor: "Mentor", admin: "Centre operations" }[v.role] || "Volunteer";
  const links = [];
  if (v.role === "instructor") links.push(["/instructor", "Instructor Portal", "Your class: roll, lessons, marking, skills and each child's progress."]);
  if (v.role === "mentor" || v.isMentor) links.push(["/mentor", "Mentor Portal", "Your mentees: sessions, goals, plans and messages."]);
  if (v.role === "admin") links.push(["/mentor", "Centre portal", "Your centre's children, attendance and staff."]);
  if (v.idPath) links.push([v.idPath, "My volunteer ID", "Your digital ID and check-in code, the same as your printed card."]);
  links.push(["/community", "Community", "The NGG community."]);
  return (
    <section className="vol-home">
      <div className="container">
        <p className="vol-home-eyebrow">{role}{v.centre ? " · " + v.centre : ""}</p>
        <h1 className="vol-home-h">Welcome, {String(v.fullName || "").split(/\s+/)[0] || "volunteer"}</h1>
        <p className="vol-home-sub">You signed in as a volunteer{v.courses && v.courses.length ? ", teaching " + v.courses.join(", ") : ""}. Your work happens in your portal below.{!v.cleared ? " Your safeguarding check is not recorded yet, so children's records stay closed until your centre admin clears it." : ""}</p>
        <ul className="vol-home-links">{links.map(([href, t, d]) => (
          <li key={href}><a href={href}><b>{t}</b><span>{d}</span></a></li>))}</ul>
        <p className="vol-home-note">A volunteer dashboard with your hours and activity is on the way.</p>
      </div>
    </section>
  );
}

function DashboardError({ code, onRetry }) {
  const offline = code === "network" || (typeof navigator !== "undefined" && navigator.onLine === false);
  return (
    <section style={{padding:"120px 0", textAlign:"center"}}>
      <div className="display" style={{fontSize:"var(--rs-fsize-26, 48px)", color:"var(--coral)"}}>{offline ? "off-line" : "Not loaded"}</div>
      <p style={{marginTop:18, color:"var(--ink-700)"}}>{offline ? "You're offline. Check your connection, then try again." : code === "upstream_unreachable" ? "We couldn't reach the data server. Try again in a moment." : "Your dashboard couldn't load (" + (code || "error") + "). Try again; if it keeps happening, tell the NGG desk."}</p>
      <button className="btn btn-primary" onClick={onRetry} style={{marginTop:24}}>Try again</button>
    </section>
  );
}

// ============================================================================
// LIVE dashboard
// ============================================================================

function DashboardLive({ data, setPage, refreshing, mutateSeq, onMutate, onSignOut }) {
  const m = data.member;
  const s = data.stats;
  const session = data.session;
  const today = data.today || [];
  const mentor = data.mentor;
  const ngv = data.ngv;   // set once promoted up the chain into the NGV/volunteer tier

  // Events + notifications are held locally so RSVP and mark-as-read feel
  // instant (optimistic), then reconcile with the next server payload.
  const [events, setEvents] = React.useState(data.events || []);
  const [notes, setNotes] = React.useState(data.notifications || []);
  React.useEffect(() => { setEvents(data.events || []); }, [data.events]);
  React.useEffect(() => { setNotes(data.notifications || []); }, [data.notifications]);

  // Canonical reflection-economy progression — fetched once here and shared by
  // the Stats and Momentum cards so the dashboard never shows two different
  // levels for the same member (and matches the Anchor Journal exactly).
  /* Which self-service section is showing — and it IS the URL, so a member can
     send somebody /dashboard/account and land them there. */
  const [section, goSection] = useDashSection();
  const [raiseKind, setRaiseKind] = React.useState("");
  const [openRequests, setOpenRequests] = React.useState(0);
  const askFor = React.useCallback((kind) => { setRaiseKind(kind); goSection("requests"); }, [goSection]);

  const [momentum, setMomentum] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.momentum().then(r => { if (alive) setMomentum(r.momentum); }).catch(() => {});
    return () => { alive = false; };
  }, [mutateSeq]);

  /* The member's own account. We charge members and email their guardian a figure
     every fortnight, and until now the member could see none of it — including the
     training fee being written off as they serve, which is the most encouraging
     number in the whole subsystem. Fetched separately and failing silently: an
     account that will not load must not take the dashboard with it. */
  const [account, setAccount] = React.useState(null);
  // Distinct states so the account panel is never a silent void. A member who
  // sees nothing should learn whether fees simply aren't switched on for them,
  // or a read failed and can be retried — not be left guessing it's broken.
  const [acctState, setAcctState] = React.useState("loading"); // loading|ok|disabled|hidden|error
  const [acctRetry, setAcctRetry] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.fees()
      .then(r => {
        if (!alive) return;
        if (r && r.enabled) { setAccount(r.account); setAcctState("ok"); }
        else { setAccount(null); setAcctState(r && r.reason === "disabled" ? "disabled" : "hidden"); }
      })
      .catch(() => { if (alive) { setAccount(null); setAcctState("error"); } });
    return () => { alive = false; };
  }, [mutateSeq, acctRetry]);

  // Policy fines + compliance standing — a SEPARATE ledger from dues/fees
  // (these are disciplinary sanctions), fetched independently and never gated
  // by the fees feature toggle.
  const [compliance, setCompliance] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.compliance()
      .then(r => { if (alive) setCompliance(r || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mutateSeq]);

  const prog = canonicalProgress(s, momentum);
  const showFines = !!(compliance && (compliance.finesOwed > 0 || (compliance.fines || []).length > 0
    || ["warned", "suspended", "evicted", "dormant"].includes(compliance.state) || compliance.awaitingReview));

  // Optimistic RSVP: flip local state now (authoritative once the request
  // succeeds), roll back + toast on failure. We deliberately do NOT trigger
  // a full dashboard refetch — RSVP doesn't change stats/missions, and a
  // refetch would clobber the optimistic flip with a momentarily-stale
  // payload. The 60s poll reconciles in the background.
  const onRsvp = (eventId, status) => {
    const prev = events;
    setEvents(evs => evs.map(e => e.eventId === eventId ? { ...e, myRsvp: status === "going" ? "going" : null } : e));
    NGGApi.member.rsvp({ eventId, status })
      .catch(e => { setEvents(prev); toast.error("Couldn't update RSVP: " + humanError(e)); });
  };

  // Mark-as-read is fire-and-forget and doesn't affect stats either.
  const onRead = (id) => {
    setNotes(ns => ns.map(n => n.notifId === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n));
    NGGApi.member.markRead(id).catch(() => {/* non-critical */});
  };

  const [editProfile, setEditProfile] = React.useState(false);

  // Portal-style chrome: a sticky sidebar rail + top-bar strip + KPI row wrap
  // the member's existing cards, so the NGG dashboard shares the Afrovanguard
  // member portal's LAYOUT system while keeping NGG's own navy/gold/cream skin
  // and typefaces. The cards themselves are unchanged — each is wrapped in a
  // <section id> so the rail can navigate to it.
  const first = String(m.fullName || "").split(" ")[0] || "Member";
  const greeting = hourGreeting();
  const unread = notes.filter(n => !n.readAt).length;
  const owed = account ? account.payable : 0;

  return (
    <React.Fragment>
      {editProfile && <DashboardProfileModal m={m} onClose={() => setEditProfile(false)} onSaved={() => { setEditProfile(false); onMutate(); }} onAsk={(k) => { setEditProfile(false); askFor(k); }}/>}
      <section className="dash-section ngg-dash" data-screen-label="05 Dashboard">
        <div className="container ngg-dash-wrap">

          <DashboardSidebar
            m={m} first={first} account={account} ngv={!!ngv}
            fines={showFines ? (compliance.finesOwed || 0) : null}
            counts={{ today: today.length, events: events.length, notes: unread }}
            mentorNamed={!!mentor}
            onSignOut={onSignOut} onEditProfile={() => setEditProfile(true)}/>

          <div className="ngg-main">
            <div className="ngg-top">
              <div className="ngg-crumb">
                <span>Next Generation Genius</span>
                <span className="ngg-crumb-sep">/</span>
                <span className="ngg-crumb-here">My dashboard</span>
                {refreshing && <span className="dash-refreshing" title="Refreshing…" aria-hidden="true"/>}
              </div>
              <div className="ngg-top-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setEditProfile(true)}>Edit profile</button>
                <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
              </div>
            </div>

            <div className="ngg-scroll">
              <header className="ngg-head">
                <div className="mono ngg-head-eyebrow">{greeting.toUpperCase()} · {m.memberId}</div>
                <h1 className="ngg-head-name">{greeting}, {first}.</h1>
                <p className="ngg-head-sub">Your Anchor 12 room — today's missions, your tally, your mentor and your account, all in one place.</p>
              </header>

              <DashSectionTabs section={section} go={goSection} openRequests={openRequests}/>

              {section === "learning" && <DashCurriculum/>}
              {section === "results"  && <DashResults/>}
              {section === "companion" && <DashCompanion/>}
              {section === "timetable" && <DashTimetable/>}
              {section === "account"  && <DashAccount onRaise={askFor}/>}
              {section === "records"  && <DashRecords onRaise={askFor}/>}
              {section === "requests" && <DashRequests openKind={raiseKind} onKindHandled={() => setRaiseKind("")} onCountChange={setOpenRequests}/>}

              {section === "overview" && <React.Fragment>
              <DashboardKpis session={session} prog={prog} stats={s} account={account} acctState={acctState}/>

              <div className="dash-grid">
                {/* LEFT MAIN COLUMN */}
                <div className="dash-main">
                  <section id="sec-today" className="ngg-anchor"><DashboardToday today={today} member={m} onMutate={onMutate} session={session}/></section>
                  <section id="sec-assignments" className="ngg-anchor"><DashboardAssignments assignments={data.assignments || []} onMutate={onMutate}/></section>
                  {/* The Saturday Formation Schedule, the member's part of each block (an NGG member's Saturday; Summer School keeps its own). */}
                  {(m.type || "NGG") === "NGG" && typeof FormationDay === "function" && <section id="sec-saturday" className="ngg-anchor"><FormationDay audience="member" centre={m.centre || ""} compact={true}/></section>}
                  {mentor && <section id="sec-checkin" className="ngg-anchor"><DashboardCheckin/></section>}
                  <section id="sec-activity" className="ngg-anchor"><DashboardActivityFeed memberId={m.memberId} session={session} reloadKey={mutateSeq}/></section>
                  <section id="sec-journal" className="ngg-anchor"><DashboardJournal onMutate={onMutate}/></section>
                  {/* The account and what is coming up are not rail furniture.
                      Ten of fourteen cards used to live in the rail, which made
                      a 280px column running 900px past the bottom of this one —
                      half the viewport empty on a 1440 screen and a page nearly
                      three thousand pixels tall. These two are the ones a member
                      acts on, so they get the width, and every card keeps a
                      readable column rather than being squeezed two-up. */}
                  {(account || acctState === "disabled" || acctState === "error") && (
                    <section id="sec-account" className="ngg-anchor">
                      {account
                        ? <DashboardObligations account={account}/>
                        : <div className="dash-card dash-account">
                            <div className="dash-card-head"><h3 className="dash-card-h-sm">Your account.</h3></div>
                            {acctState === "error"
                              ? <React.Fragment>
                                  <p className="dash-account-sub" style={{ margin: "8px 0 12px" }}>Couldn't load your account just now.</p>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setAcctRetry(n => n + 1)}>Try again</button>
                                </React.Fragment>
                              : <p className="dash-account-sub" style={{ margin: "8px 0 0" }}>Dues &amp; fees aren't switched on yet.</p>}
                          </div>}
                    </section>
                  )}
                  {showFines && (
                    <section id="sec-fines" className="ngg-anchor"><DashboardFines c={compliance}/></section>
                  )}
                  <section id="sec-events" className="ngg-anchor"><DashboardEvents events={events} onRsvp={onRsvp}/></section>
                </div>

                {/* RIGHT RAIL — who you are and how you are doing. Everything
                    here is read, not acted on, which is what a narrow column
                    is good for. */}
                <div className="dash-rail">
                  <section id="sec-division" className="ngg-anchor"><DashboardDivision m={m}/></section>
                  <section id="sec-id" className="ngg-anchor"><DashboardIdCard m={m}/></section>
                  {ngv && <section id="sec-ngv" className="ngg-anchor"><DashboardNgv ngv={ngv}/></section>}
                  <section id="sec-stats" className="ngg-anchor"><DashboardStats stats={s} prog={prog}/></section>
                  <section id="sec-momentum" className="ngg-anchor"><DashboardMomentum momentum={momentum}/></section>
                  {mentor && <section id="sec-mentor" className="ngg-anchor"><DashboardMentor mentor={mentor}/></section>}
                  <section id="sec-notifs" className="ngg-anchor"><DashboardNotifications notes={notes} onRead={onRead}/></section>
                  <section id="sec-shortcuts" className="ngg-anchor"><DashboardShortcuts setPage={setPage}/></section>
                </div>
              </div>
              </React.Fragment>}
            </div>
          </div>
        </div>
      </section>
    </React.Fragment>
  );
}

// The portal-style sidebar rail: member identity, in-page section nav (with a
// scrollspy + a mobile collapse), and the sign-out/edit actions.
function DashboardSidebar({ m, first, account, ngv, fines, counts, mentorNamed, onSignOut, onEditProfile }) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState("sec-today");
  const owed = account ? account.payable : 0;
  const hasPhoto = !!nggPhotoSrc(m.photoUrl);

  const groups = [
    /* Every label is the heading of the card it lands on. "Activity" used to
       jump to a card headed "Your trail." and "Notifications" to one headed
       "Activity." — and the rail is the navigation for a page two thousand
       pixels tall. */
    { g: "Today", items: [
      { id: "sec-today", label: "Today's missions", badge: counts.today || null },
      { id: "sec-assignments", label: "Set work" },
      ...(mentorNamed ? [{ id: "sec-checkin", label: "Weekly check-in" }] : []),
      { id: "sec-activity", label: "Your trail" },
      { id: "sec-journal", label: "Journal" },
      ...(account ? [{ id: "sec-account", label: "Your account", badge: owed > 0 ? naira(owed) : null }] : []),
      ...(fines != null ? [{ id: "sec-fines", label: "Policy fines", badge: fines > 0 ? naira(fines) : null }] : []),
      { id: "sec-events", label: "Coming up", badge: counts.events || null },
    ] },
    { g: "You", items: [
      { id: "sec-division", label: "Your division" },
      { id: "sec-id", label: "Member ID" },
      ...(ngv ? [{ id: "sec-ngv", label: "Your NGV role" }] : []),
      { id: "sec-stats", label: "Your tally" },
      { id: "sec-momentum", label: "Momentum" },
      ...(mentorNamed ? [{ id: "sec-mentor", label: "Your mentor" }] : []),
      { id: "sec-notifs", label: "Activity", badge: counts.notes || null },
    ] },
  ];

  /* A rail item whose section rendered nothing is a destination that is not
     there. The wrapping <section id> always exists — it is the CARD inside it
     that returns null on an empty feed — so presence is measured by content,
     not by getElementById. Re-measured whenever the counts move, which is what
     changes when data arrives. */
  const [empty, setEmpty] = React.useState({});
  React.useEffect(() => {
    const t = setTimeout(() => {
      const next = {};
      groups.forEach(grp => grp.items.forEach(i => {
        const el = document.getElementById(i.id);
        if (el && el.textContent.trim() === "") next[i.id] = true;
      }));
      setEmpty(next);
    }, 400);
    return () => clearTimeout(t);
  }, [counts.today, counts.events, counts.notes, !!account, fines]); // eslint-disable-line

  // Scrollspy — highlight the section currently in view. Runs once; observes
  // whatever section ids are present in the DOM.
  React.useEffect(() => {
    const ids = groups.reduce((a, grp) => a.concat(grp.items.map(i => i.id)), []);
    const els = ids.map(id => document.getElementById(id)).filter(Boolean);
    if (!("IntersectionObserver" in window) || !els.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: "-40% 0px -55% 0px" });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []); // eslint-disable-line

  const go = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };

  return (
    <aside className={"ngg-side" + (open ? " is-open" : "")}>
      <button className="ngg-side-toggle btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}>☰ Sections</button>
      <div className="ngg-side-inner">
        <button className="ngg-side-brand" onClick={onEditProfile} title="Edit your profile">
          {hasPhoto
            ? <img src={nggImg(m.photoUrl, "avatar")} alt="" className="ngg-side-avatar-img" onError={(e) => { e.target.style.display = "none"; }}/>
            : <Avatar seed={m.memberId.charCodeAt(m.memberId.length - 1) % 20 + 1} size={40} ring/>}
          <span className="ngg-side-brand-text"><b>{first}</b><span className="mono">{m.memberId}</span></span>
        </button>
        <nav className="ngg-nav">
          {groups.map(grp => (
            <div className="ngg-nav-group" key={grp.g}>
              <div className="ngg-nav-title">{grp.g}</div>
              {grp.items.filter(it => !empty[it.id]).map(it => (
                <a key={it.id} href={"#" + it.id} onClick={go(it.id)}
                   className={"ngg-nav-link" + (active === it.id ? " is-active" : "")}>
                  <span className="ngg-nav-dot"/>
                  <span className="ngg-nav-label">{it.label}</span>
                  {it.badge && <span className="ngg-nav-badge">{it.badge}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="ngg-side-user">
          <button className="btn btn-ghost btn-sm" onClick={onEditProfile}>Edit profile</button>
          <button className="btn btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}

// The KPI row — the four headline numbers, read from the same data the cards
// below use, so nothing can disagree.
function DashboardKpis({ session, prog, stats, account, acctState }) {
  const now = new Date();
  let sessN = "—", sessSub = "no active session";
  if (session) {
    const start = new Date(session.startDate), end = new Date(session.endDate);
    const wk = " · week " + session.weekOf + "/" + session.totalWeeks;
    if (now < start) { sessN = Math.ceil((start - now) / 86400000) + "d"; sessSub = "to start" + wk; }
    else { sessN = Math.max(0, Math.ceil((end - now) / 86400000)) + "d"; sessSub = "left" + wk; }
  }
  const owed = account ? account.payable : null;
  return (
    <div className="ngg-kpis">
      <div className="ngg-kpi">
        <div className="ngg-kpi-top"><span className="ngg-kpi-l">Session</span>{session && <span className="chip chip-gold">{session.code}</span>}</div>
        <div className="ngg-kpi-n">{sessN}</div>
        <div className="ngg-kpi-s">{sessSub}</div>
      </div>
      <div className="ngg-kpi">
        <div className="ngg-kpi-top"><span className="ngg-kpi-l">Level</span><span className="chip chip-gold">{prog.rank.name}</span></div>
        <div className="ngg-kpi-n">{String(prog.level).padStart(2, "0")}</div>
        <div className="ngg-kpi-s">{fmtNum(prog.total)} XP{prog.next ? " · next at " + fmtNum(prog.next.at) : " · top rank"}</div>
      </div>
      <div className="ngg-kpi">
        <div className="ngg-kpi-top"><span className="ngg-kpi-l">Streak</span></div>
        <div className="ngg-kpi-n">{stats.streak}<span className="ngg-kpi-u">d</span></div>
        <div className="ngg-kpi-s">{stats.badgeCount} badge{stats.badgeCount === 1 ? "" : "s"} earned</div>
      </div>
      <div className="ngg-kpi">
        <div className="ngg-kpi-top"><span className="ngg-kpi-l">Account</span>{owed != null && <span className={"chip " + (owed > 0 ? "chip-coral" : "chip-lime")}>{owed > 0 ? "Due" : "Clear"}</span>}</div>
        <div className={"ngg-kpi-n" + (owed === 0 ? " is-clear" : "")}>{account ? (owed > 0 ? naira(owed) : "Clear") : "—"}</div>
        <div className="ngg-kpi-s">{account ? (owed > 0 ? "outstanding · your parent or guardian pays it from the family account" : "nothing outstanding")
          : acctState === "disabled" ? "not enabled yet"
          : acctState === "error" ? "unavailable"
          : acctState === "hidden" ? "—"
          : "loading…"}</div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

// Compact member profile editor with a Cloudinary avatar upload.
function DashboardProfileModal({ m, onClose, onSaved, onAsk }) {
  const socials = (m.socials && typeof m.socials === "object") ? m.socials : {};
  const [d, setD] = React.useState({
    photoUrl: m.photoUrl || "",
    bio: m.bio || "",
    instagram: socials.instagram || "",
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setD(o => Object.assign({}, o, { [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await NGGApi.member.updateProfile({
        photoUrl: d.photoUrl, bio: d.bio,
        socials: { instagram: d.instagram },
      });
      // A different photo is an ask the desk approves, not a change (member_update).
      toast.success(r && r.photoRequested ? "Saved. Your new photo is with the desk to approve." : "Profile updated");
      onSaved();
    } catch (e) {
      toast.error("Couldn't save: " + humanError(e));
    } finally { setBusy(false); }
  };
  const hasPhoto = !!nggPhotoSrc(d.photoUrl);

  // Password — opt-in. Members sign in with a code; setting a password here
  // lets them use the standard email + password login next time.
  const hasPw = !!m.hasPassword;
  const [pw, setPw] = React.useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwDone, setPwDone] = React.useState(false);
  const setP = (k, v) => setPw(o => Object.assign({}, o, { [k]: v }));
  const savePassword = async () => {
    if (pw.next.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw.next !== pw.confirm) { toast.error("Passwords don't match"); return; }
    setPwBusy(true);
    try {
      await NGGApi.auth.setPassword(pw.next, pw.current);
      setPwDone(true);
      setPw({ current: "", next: "", confirm: "" });
      toast.success(hasPw ? "Password changed" : "Password set — you can use it to sign in");
    } catch (e) {
      toast.error("Couldn't save password: " + humanError(e));
    } finally { setPwBusy(false); }
  };
  return (
    <div className="admin-drawer" onClick={onClose}>
      <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>Edit profile</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="admin-fields">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {hasPhoto
              ? <img src={nggImg(d.photoUrl, "face")} alt="" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }}/>
              : <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--cream-100)", display: "grid", placeItems: "center", fontSize: 28 }}>🙂</div>}
            <div className="admin-upload-row">
              <input type="text" className="admin-input" value={d.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} placeholder="Upload → or paste a photo URL"/>
              <Uploader kind="avatar" accept="image/*" onUploaded={(url) => set("photoUrl", url)} compact/>
            </div>
          </div>
          <label className="admin-field"><span>Short bio</span><textarea className="admin-input" rows={3} value={d.bio} onChange={(e) => set("bio", e.target.value)} placeholder="One or two lines about you."/></label>
          {/* Name, phone, school and guardian contacts are the programme's record
              (member.update refuses them: managed_by_ngg). A correction is a
              "Correct my details" request, checked with the family. */}
          <div className="dash-managed">
            <p><span>School</span><b>{m.school || "—"}</b></p>
            <p><span>Phone</span><b>{m.phone || "—"}</b></p>
            <p className="dash-managed-note">Managed by NGG.{onAsk && <> <button type="button" className="dash-link" onClick={() => onAsk("details")}>Ask for a change</button></>}</p>
          </div>
          <label className="admin-field"><span>Instagram</span><input className="admin-input" value={d.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@handle or link"/></label>

          <div style={{ borderTop: "1px solid rgba(12,20,50,0.08)", margin: "6px 0 2px", paddingTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{hasPw ? "Change password" : "Set a password"}</div>
            <div style={{ fontSize: 13, color: "var(--ink-500)", margin: "4px 0 12px" }}>
              {hasPw ? "Update the password you use to sign in." : "Optional — set one to sign in with email + password instead of a code each time."}
            </div>
            {hasPw && (
              <label className="admin-field"><span>Current password</span><input className="admin-input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setP("current", e.target.value)}/></label>
            )}
            <div className="admin-fields-row">
              <label className="admin-field"><span>New password</span><input className="admin-input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setP("next", e.target.value)} placeholder="At least 8 characters"/></label>
              <label className="admin-field"><span>Confirm</span><input className="admin-input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setP("confirm", e.target.value)}/></label>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pwBusy || !pw.next} onClick={savePassword}>
              {pwBusy ? "Saving…" : pwDone ? "Saved ✓" : (hasPw ? "Change password" : "Set password")}
            </button>
          </div>

          <DashboardSecurity/>
          <DashboardAccount m={m}/>
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save profile"}</button>
        </div>
      </div>
    </div>
  );
}

// Active-device list with per-device + "sign out everywhere else" revoke.
function DashboardSecurity() {
  const [d, setD] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  const load = () => NGGApi.member.security().then(setD).catch(() => setD({ sessions: [] }));
  React.useEffect(() => { load(); }, []);
  const shortUA = (ua) => {
    if (!ua) return "Unknown device";
    const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Mac/i.test(ua) ? "macOS" : /Windows/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : "Device";
    const br = /Chrome/i.test(ua) ? "Chrome" : /Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "browser";
    return os + " · " + br;
  };
  const revoke = async (sid) => { setBusy(sid); try { await NGGApi.member.securityRevoke(sid); load(); } catch (e) { toast.error(humanError(e)); } finally { setBusy(""); } };
  const revokeOthers = async () => {
    if (!(await dialog.confirm({
      title: "Sign out of every other device?",
      body: "Any phone, tablet or computer signed in as you — apart from this one — is signed out. "
          + "You stay signed in here.",
      cta: "Sign the others out" }))) return;
    setBusy("others"); try { const r = await NGGApi.member.securityRevokeOthers(); toast.success("Signed out " + (r.revoked || 0) + " other device(s)."); load(); } catch (e) { toast.error(humanError(e)); } finally { setBusy(""); }
  };
  const sessions = d ? (d.sessions || []) : null;
  return (
    <div style={{ borderTop: "1px solid rgba(12,20,50,0.08)", margin: "6px 0 2px", paddingTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Devices &amp; security</div>
      <div style={{ fontSize: 13, color: "var(--ink-500)", margin: "4px 0 12px" }}>Where you're signed in. Revoke any you don't recognise.</div>
      {sessions === null ? <div className="dash-spinner"/> :
        sessions.length === 0 ? <div style={{ fontSize: 13, color: "var(--ink-500)" }}>No active devices.</div> :
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map(s => (
            <div key={s.sid} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13, padding: "8px 10px", border: "1px solid rgba(12,20,50,0.08)", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{shortUA(s.device)} {s.current ? <span className="chip chip-lime" style={{ fontSize: 10 }}>this device</span> : null}</div>
                <div className="mono" style={{ color: "var(--ink-500)", fontSize: 11 }}>{s.ip || "—"}{s.lastSeenAt ? " · last seen " + fmtDate(s.lastSeenAt) : ""}</div>
              </div>
              {!s.current && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === s.sid} onClick={() => revoke(s.sid)}>{busy === s.sid ? "…" : "Sign out"}</button>}
            </div>
          ))}
          {sessions.filter(s => !s.current).length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy === "others"} onClick={revokeOthers} style={{ alignSelf: "flex-start", marginTop: 4 }}>{busy === "others" ? "Signing out…" : "Sign out everywhere else"}</button>
          )}
        </div>}
    </div>
  );
}

// Account: verified email change, data export, and account deletion.
function DashboardAccount({ m }) {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const changeEmail = async () => {
    if (!email.trim()) return;
    setBusy("email");
    try { const r = await NGGApi.member.changeEmail(email.trim()); toast.success("Confirmation sent to " + (r.pending || email.trim()) + ". Click the link there to finish.", "Check your new inbox"); setEmail(""); }
    catch (e) { toast.error(humanError(e)); } finally { setBusy(""); }
  };
  const exportData = async () => {
    setBusy("export");
    try {
      const r = await NGGApi.member.exportData();
      const blob = new Blob([JSON.stringify(r.export || r, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ngg-my-data.json"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { toast.error(humanError(e)); } finally { setBusy(""); }
  };
  return (
    <div style={{ borderTop: "1px solid rgba(12,20,50,0.08)", margin: "6px 0 2px", paddingTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>Account</div>
      <div style={{ fontSize: 13, color: "var(--ink-500)", margin: "4px 0 12px" }}>Current email: <b>{m.email}</b></div>
      <label className="admin-field"><span>Change email (needs confirmation)</span>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="admin-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="new@email.com"/>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy === "email" || !email.trim()} onClick={changeEmail}>{busy === "email" ? "…" : "Send link"}</button>
        </div>
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy === "export"} onClick={exportData}>{busy === "export" ? "Preparing…" : "Download my data"}</button>
      </div>
      {/* There was a "Delete my account" button here.
          It called member_erase() directly, so a ten-to-seventeen-year-old
          could scrub their own profile, journal, missions and XP, revoke every
          session and blank their ledger's notes — in two confirmations, with
          nothing recoverable by anybody, including the people answerable for
          them. Whether a membership continues is not a setting: it is what the
          MoU between NGG and the family says, and it is settled between people.
          Taking a copy of everything, above, is untouched and still one press. */}
      <p className="dash-account-note">
        Your membership is governed by the agreement between NGG and your parent
        or guardian, so it is not something to switch off here. If something
        needs to change, speak to your centre lead or your mentor.
      </p>
    </div>
  );
}

function DashboardToday({ today, member, onMutate, session }) {
  const [busy, setBusy] = React.useState({});
  const [proofFor, setProofFor] = React.useState(null); // mission awaiting a proof modal
  const submit = async (m) => {
    // Quick-complete missions (proof=none) finish in one tap. Everything else
    // opens the proof modal — which offers a real media upload for
    // photo/audio/video/file proof, and a link/note field otherwise.
    if (m.proof === "none") {
      setBusy(b => Object.assign({}, b, { [m.missionId]: true }));
      try {
        await NGGApi.member.submitMission({ missionId: m.missionId });
        toast.success("+" + m.xp + " XP locked in", m.title);
        onMutate();
      } catch (e) {
        toast.error("Couldn't submit: " + humanError(e), "Try again");
      } finally {
        setBusy(b => Object.assign({}, b, { [m.missionId]: false }));
      }
      return;
    }
    setProofFor(m);
  };

  const sendProof = async (m, proofUrl) => {
    setBusy(b => Object.assign({}, b, { [m.missionId]: true }));
    try {
      await NGGApi.member.submitMission({ missionId: m.missionId, proofUrl });
      toast.success("Sent to mentor for review", m.title);
      setProofFor(null);
      onMutate();
    } catch (e) {
      toast.error("Couldn't submit: " + humanError(e), "Try again");
    } finally {
      setBusy(b => Object.assign({}, b, { [m.missionId]: false }));
    }
  };

  const ready = today.filter(t => t.status === "todo" || t.status === "rejected");
  const pending = today.filter(t => t.status === "submitted");
  const done = today.filter(t => t.status === "verified");

  return (
    <div className="dash-card dash-today">
      <div className="dash-card-head">
        <div>
          <div className="eyebrow" style={{color:"var(--gold-500)"}}>TODAY · WEEK {session ? session.weekOf : 1}</div>
          <h2 className="dash-card-h">Your missions.</h2>
        </div>
        <div className="dash-today-tally">
          <span className="dash-today-tally-n">{done.length}</span>
          <span className="dash-today-tally-d">/ {today.length} done</span>
        </div>
      </div>
      {today.length === 0 && (
        <div className="dash-empty">
          <div className="dash-empty-num">00</div>
          <div className="dash-empty-text">No missions yet for this week.<br/>Your mentor will publish them soon.</div>
        </div>
      )}
      {ready.length > 0 && (
        <div className="dash-mission-group">
          <div className="mono dash-mission-group-h">READY · {ready.length}</div>
          {ready.map(m => (
            <DashboardMissionRow key={m.missionId} m={m} busy={busy[m.missionId]} onSubmit={() => submit(m)}/>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="dash-mission-group">
          <div className="mono dash-mission-group-h" style={{color:"var(--gold-500)"}}>WAITING ON MENTOR · {pending.length}</div>
          {pending.map(m => (
            <DashboardMissionRow key={m.missionId} m={m} disabled/>
          ))}
        </div>
      )}
      {done.length > 0 && (
        <div className="dash-mission-group">
          <div className="mono dash-mission-group-h" style={{color:"var(--lime-ink)", opacity:0.7}}>DONE · {done.length}</div>
          {done.map(m => (
            <DashboardMissionRow key={m.missionId} m={m} done/>
          ))}
        </div>
      )}
      {proofFor && (
        <MissionProofModal
          m={proofFor}
          busy={!!busy[proofFor.missionId]}
          onClose={() => setProofFor(null)}
          onSubmit={(url) => sendProof(proofFor, url)}
        />
      )}
    </div>
  );
}

// Proof capture modal. For photo/audio/video/file proof it shows a real
// Cloudinary upload (with a URL/note fallback); for link/text it's a field.
function MissionProofModal({ m, busy, onClose, onSubmit }) {
  const isMedia = ["photo", "audio", "video", "file"].includes(m.proof);
  const accept = m.proof === "photo" ? "image/*" : m.proof === "audio" ? "audio/*" : m.proof === "video" ? "video/*" : "*/*";
  const [note, setNote] = React.useState("");
  const [fileUrl, setFileUrl] = React.useState("");
  const value = isMedia ? (fileUrl || note) : note;
  const canSubmit = !!String(value).trim() && !busy;
  const label = m.proof === "photo" ? "Upload a photo" : m.proof === "audio" ? "Upload an audio clip"
    : m.proof === "video" ? "Upload a video" : m.proof === "file" ? "Upload a file"
    : m.proof === "link" ? "Paste a link" : "Describe what you did";
  return (
    <div className="admin-drawer" onClick={onClose}>
      <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-drawer-head">
          <h3>{m.title}</h3>
          <button type="button" className="admin-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="admin-fields">
          <p style={{ color: "var(--ink-700)", margin: "0 0 4px", fontSize: 14 }}>{m.prompt}</p>
          {isMedia ? (
            <React.Fragment>
              <label className="admin-field">
                <span>{label}</span>
                <div className="admin-upload-row">
                  <input type="text" className="admin-input" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="Upload → or paste a link"/>
                  <Uploader kind="proof" accept={accept} onUploaded={(url) => setFileUrl(url)} compact/>
                </div>
              </label>
              {fileUrl && /^https?:\/\//.test(fileUrl) && (m.proof === "photo") && (
                <span className="admin-upload-preview"><img src={fileUrl} alt="" onError={(e) => { e.target.style.display = "none"; }}/></span>
              )}
              <label className="admin-field">
                <span>Add a note (optional)</span>
                <textarea className="admin-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything your mentor should know…"/>
              </label>
            </React.Fragment>
          ) : (
            <label className="admin-field">
              <span>{label}</span>
              {m.proof === "link"
                ? <input type="text" className="admin-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="https://… or a short note"/>
                : <textarea className="admin-input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="I shipped…"/>}
            </label>
          )}
        </div>
        <div className="admin-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => onSubmit(isMedia && fileUrl ? fileUrl + (note.trim() ? " — " + note.trim() : "") : value)}>
            {busy ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardMissionRow({ m, onSubmit, busy, done, disabled }) {
  return (
    <div className={"dash-mission" + (done ? " is-done" : "") + (disabled ? " is-disabled" : "")}>
      <div className="dash-mission-icon" aria-hidden="true">
        {done ? "✓" : disabled ? "⏳" : m.type === "Make" ? "✦" : m.type === "Read" ? "✺" : m.type === "Speak" ? "▶" : m.type === "Move" ? "→" : "◎"}
      </div>
      <div className="dash-mission-body">
        <div className="dash-mission-title">{m.title}</div>
        <div className="dash-mission-prompt">{m.prompt}</div>
        <div className="dash-mission-meta">
          <span>{m.type}</span>
          <span>·</span>
          <span>+{m.xp} XP</span>
          {m.estimatedMin > 0 && <><span>·</span><span>{m.estimatedMin} min</span></>}
          {m.bookPage > 0 && <><span>·</span><span>Anchor p.{m.bookPage}</span></>}
        </div>
      </div>
      {!done && !disabled && (
        <button className="btn btn-primary btn-sm dash-mission-cta" onClick={onSubmit} disabled={busy}>
          {busy ? "…" : (m.proof === "none" ? "Mark it done" : "Send my proof")}
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------

function DashboardAssignments({ assignments, onMutate }) {
  if (!assignments || assignments.length === 0) return null;
  const open = assignments.filter(a => !a.submission || a.submission.status === "submitted");
  /* Handed in over set, not graded over set. A member with one new, untouched
     task read "0 / 1 graded", which sounds like a mark, and the mark sounds
     bad. The missions card above counts done over total, which is the right
     shape for a tally somebody reads about themselves. */
  const handedIn = assignments.filter(a => a.submission);
  const graded = assignments.filter(a => a.submission && a.submission.status === "graded");
  return (
    <div className="dash-card dash-assign">
      <div className="dash-card-head">
        <div>
          <div className="eyebrow" style={{color:"var(--gold-500)"}}>ASSIGNMENTS</div>
          <h2 className="dash-card-h">Set work.</h2>
        </div>
        <div className="dash-today-tally"><span className="dash-today-tally-n">{handedIn.length}</span><span className="dash-today-tally-d">/ {assignments.length} handed in</span></div>
      </div>
      {open.map(a => <AssignmentCard key={a.assignmentId} a={a} onMutate={onMutate}/>)}
      {graded.length > 0 && (
        <div className="dash-mission-group">
          <div className="mono dash-mission-group-h" style={{color:"var(--lime-ink)", opacity:0.7}}>GRADED · {graded.length}</div>
          {graded.map(a => <AssignmentCard key={a.assignmentId} a={a} onMutate={onMutate}/>)}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ a, onMutate }) {
  const sub = a.submission;
  const graded = sub && sub.status === "graded";
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(sub ? sub.text : "");
  const [fileUrl, setFileUrl] = React.useState(sub ? sub.fileUrl : "");
  const [busy, setBusy] = React.useState(false);
  const overdue = a.dueAt && !graded && new Date(a.dueAt) < new Date();

  const submit = async () => {
    if (!text.trim() && !fileUrl) { toast.error("Add a response or upload a file first"); return; }
    setBusy(true);
    try {
      await NGGApi.member.submitAssignment({ assignmentId: a.assignmentId, text: text.trim(), fileUrl });
      toast.success(sub ? "Submission updated" : "Submitted", a.title);
      setOpen(false); onMutate && onMutate();
    } catch (e) { toast.error("Couldn't submit: " + humanError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className={"dash-assign-card" + (graded ? " is-graded" : "")}>
      <div className="dash-assign-top" onClick={() => !graded && setOpen(o => !o)}>
        <div>
          <div className="dash-assign-title">{a.title}</div>
          <div className="dash-assign-meta">
            {a.points} pts
            {a.dueAt && <> · <span className={overdue ? "is-overdue" : ""}>due {fmtShortDate(a.dueAt)}</span></>}
            {a.track && <> · {a.track}</>}
          </div>
        </div>
        {graded
          ? <div className="dash-assign-grade">{sub.grade}<span>/{a.points}</span></div>
          : <span className={"chip status-" + (sub ? "published" : "draft")}>{sub ? "submitted" : "to do"}</span>}
      </div>
      {a.instructions && <div className="dash-assign-instructions">{a.instructions}</div>}
      {graded && sub.feedback && <div className="dash-assign-feedback"><span className="mono">MENTOR FEEDBACK</span>{sub.feedback}</div>}
      {!graded && (open || sub) && (
        <div className="dash-assign-form">
          <textarea className="dash-assign-input" rows={3} placeholder="Your response…" value={text} onChange={e => setText(e.target.value)}/>
          <div className="dash-assign-actions">
            <Uploader kind="submission" accept="*/*" onUploaded={(url) => setFileUrl(url)} compact/>
            {fileUrl && <a className="dash-assign-filelink" href={fileUrl} target="_blank" rel="noopener noreferrer">✓ file attached</a>}
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>{busy ? "…" : (sub ? "Update my answer" : "Hand it in")}</button>
          </div>
        </div>
      )}
      {!graded && !open && !sub && (
        <button className="dash-assign-start btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Start →</button>
      )}
    </div>
  );
}

function fmtShortDate(d) { return fmtDayMonth(d); }

// ----------------------------------------------------------------------------

// Character ranks — the ONE canonical progression, identical to the Anchor
// Journal (journal/app.jsx RANKS) and the server momentum engine
// (momentum.php): 60 XP per distinct reflection day, a flat 250 XP per level,
// 5 levels. Thresholds are the cumulative floors of that flat model. Do not
// fork these numbers again — a member who is "Rooted" here must be "Rooted"
// in the journal at the same XP.
const DASH_XP_PER_LEVEL = 250;
// Mood taxonomy — the SAME keys the Anchor Journal stores (journal/app.jsx
// MOODS/MOOD_ICON) so an entry created here renders correctly there. The emoji
// is display-only; the stored value is the key.
const DASH_MOODS = [
  { key: "great", emoji: "🔥", label: "Great" },
  { key: "good",  emoji: "🙂", label: "Good" },
  { key: "okay",  emoji: "😐", label: "Okay" },
  { key: "low",   emoji: "😔", label: "Low" },
  { key: "rough", emoji: "😴", label: "Rough" },
];
const DASH_RANKS = [
  { name: "Seedling", at: 0 }, { name: "Sprout", at: 250 }, { name: "Sapling", at: 500 },
  { name: "Rooted", at: 750 }, { name: "Vanguard", at: 1000 },
];
function dashRank(xp) {
  let cur = DASH_RANKS[0], next = null;
  for (let i = 0; i < DASH_RANKS.length; i++) {
    if (xp >= DASH_RANKS[i].at) cur = DASH_RANKS[i];
    else { next = DASH_RANKS[i]; break; }
  }
  const pct = next ? Math.min(100, Math.round((xp - cur.at) / (next.at - cur.at) * 100)) : 100;
  return { cur, next, pct };
}
// Reconcile the dashboard headline progression onto the canonical reflection
// economy. The server momentum payload (when present) is authoritative and is
// what the journal shows; `member_stats.xpTotal` is a separate mission-driven
// tally and must NOT drive the rank/level (that was the cross-surface bug).
// Falls back to the flat model over the momentum total, then to stored stats.
function canonicalProgress(stats, momentum) {
  if (momentum && typeof momentum.level === "number") {
    const level = momentum.level;
    const xpInLevel = momentum.xp || 0;               // 0..250 within the level
    // Prefer the true cumulative from reflection days (matches the journal's
    // reflectionDays*60 exactly); the level-math reconstruction under-counts at
    // the capped max level, where xpInLevel is pinned to 250.
    const total = typeof momentum.totalReflections === "number"
      ? momentum.totalReflections * 60
      : (level - 1) * DASH_XP_PER_LEVEL + xpInLevel;
    const r = dashRank(total);
    return { total, level, rank: r.cur, next: r.next, pct: r.next ? r.pct : 100 };
  }
  const total = (stats && stats.xp) || 0;
  const r = dashRank(total);
  const level = (stats && stats.level) || (DASH_RANKS.indexOf(r.cur) + 1);
  return { total, level, rank: r.cur, next: r.next, pct: r.next ? r.pct : 100 };
}

function DashboardStats({ stats, prog }) {
  // `prog` is the canonical reflection-economy progression (see
  // canonicalProgress) — the same model the journal and server momentum use.
  return (
    <div className="dash-card dash-stats">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Your tally.</h3>
        <span className="chip chip-gold" title="Character rank">{prog.rank.name}</span>
      </div>
      <div className="dash-stats-grid">
        <div className="dash-stat">
          <div className="mono dash-stat-l">LEVEL</div>
          <div className="dash-stat-n">{String(prog.level).padStart(2, "0")}</div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">STREAK</div>
          <div className="dash-stat-n">{stats.streak}<span className="dash-stat-u">d</span></div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">XP</div>
          <div className="dash-stat-n">{prog.total}</div>
        </div>
        <div className="dash-stat">
          <div className="mono dash-stat-l">BADGES</div>
          <div className="dash-stat-n">{stats.badgeCount}</div>
        </div>
      </div>
      <div className="dash-xp-bar">
        <div className="dash-xp-fill" style={{width: prog.pct + "%"}}/>
      </div>
      <div className="dash-xp-meta">
        <span>{fmtNum(prog.total)} XP</span>
        <span>{prog.next ? "→ " + prog.next.name + " at " + fmtNum(prog.next.at) : "Top rank reached ★"}</span>
      </div>
      {/* The badges themselves, not just how many. The ids were already in the
          payload and only the COUNT was rendered — a member could see they had
          three and not which three. Labels come from the server, so there is no
          second copy of the catalogue here. */}
      {(stats.badges || []).length > 0 && (
        <div className="dash-badges">
          {stats.badges.map(b => {
            const id = typeof b === "string" ? b : (b && (b.id || b.name)) || "";
            const label = (stats.badgeLabels && stats.badgeLabels[id]) || id.replace(/-/g, " ");
            return <span key={id} className="chip chip-sm dash-badge" title={label}>{label}</span>;
          })}
        </div>
      )}
    </div>
  );
}

// Behavioral momentum — surfaces the psychological engine (member.momentum):
// the single most-relevant nudge + the signals behind it. Non-critical: hides
// itself on error so it never blocks the dashboard.
const MOMENTUM_TONE = {
  urgent: { bg: "rgba(208,102,60,0.12)", bd: "rgba(208,102,60,0.3)", fg: "#a23d1a" },
  motivating: { bg: "rgba(110,156,29,0.12)", bd: "rgba(110,156,29,0.3)", fg: "#3f5a0f" },
  affirming: { bg: "rgba(46,125,70,0.12)", bd: "rgba(46,125,70,0.3)", fg: "#1f6b3a" },
  inviting: { bg: "rgba(139,92,246,0.12)", bd: "rgba(139,92,246,0.3)", fg: "#5b3aa8" },
  practical: { bg: "rgba(47,111,208,0.12)", bd: "rgba(47,111,208,0.3)", fg: "#1f4f9c" },
  gentle: { bg: "rgba(12,20,50,0.06)", bd: "rgba(12,20,50,0.14)", fg: "var(--ink-600,#4a536b)" },
};
function DashboardMomentum({ momentum }) {
  // Momentum is fetched once by DashboardLive and shared, so this card and the
  // Stats card can never disagree about the member's level.
  const m = momentum;
  if (!m) return null;
  const nudge = (m.nudges || [])[0];
  const tone = (nudge && MOMENTUM_TONE[nudge.tone]) || MOMENTUM_TONE.gentle;
  return (
    <div className="dash-card dash-momentum">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Momentum.</h3>
        <span className="chip chip-gold" title="Character level">L{m.level} · {m.levelName}</span>
      </div>
      {nudge && (
        <div className="dash-nudge" style={{ background: tone.bg, border: "1px solid " + tone.bd, borderRadius: 14, padding: "12px 14px", fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, color: tone.fg }}>
          {nudge.text}
        </div>
      )}
      <div className="dash-momentum-row">
        <div className="dash-momentum-cell"><b>{m.streak}</b><small>day streak</small></div>
        <div className="dash-momentum-cell"><b>{m.consistency}%</b><small>30-day</small></div>
        <div className="dash-momentum-cell"><b>{m.longestStreak}</b><small>best ever</small></div>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 12 }} onClick={() => { window.location.href = "/journal/"; }}>Open the Anchor Journal →</button>
    </div>
  );
}

/**
 * Your account — what a member owes, and what their service has earned off.
 *
 * THE TONE IS THE DESIGN. This is a young person reading a debt on their own
 * screen, so it says the figure plainly, never in red, with no deadline and no
 * consequence — and it leads with the training fee being written off as they
 * serve, because that is the true story of the number and the part they earn.
 * A threatening panel produces a member who stops opening the dashboard, not a
 * payment; and the money conversation belongs with their guardian, who is the
 * one the reminders go to.
 *
 * Read-only, structurally: there is no member-side op that posts, pays or voids
 * anything, so there is nothing here to press.
 */
// The member's own NGG ID card — rendered on the rail, and only rendered.
/* The card is shown, not handed over.
 *
 * `downloadable` used to put a "save this" button under it, and a member ID is
 * the wrong thing to make a file of: the image is the credential the gate
 * scans, and a PNG of it travels to places a lanyard does not. Issuing and
 * reissuing is the desk's job — Records has a button to ask for one — and the
 * printed cards come out of the Control Room's own run. */
/* The member's division (NGGC 2040 brief §5).
 *
 * The brief puts Division under Identity on the member's own record, beside
 * their name and their mentor — it is one of the six things a member is
 * supposed to be able to say about themselves. So it reads as identity here,
 * not as a setting: the mandate in the division's own words, and the courses
 * that belong to it.
 *
 * Unplaced says so. A member nobody has assigned yet is a real and common
 * state, and hiding the card would leave them with no way to discover the
 * question exists — the empty state names their centre lead as the person who
 * answers it. */
/* The member's own centre's timetable, their course marked — the same drawing
   (TimetableView) the Control Room and the public page use. Printable. */
function DashTimetable() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const load = React.useCallback(() => { setErr(null); return NGGApi.member.timetable().then(setD).catch(setErr); }, []);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <ErrorState title="Couldn't load your timetable" message={err.message} code={err.code} onRetry={load}/>;
  if (!d) return <div className="dash-spinner" role="status" aria-label="Loading your timetable"/>;
  return (
    <div className="dash-card tt-print">
      <div className="tt-toolbar">
        <h2 className="dash-card-h-sm">{d.centre ? d.centre + " timetable" : "Your timetable"}</h2>
        <div className="tt-toolbar-actions tt-noprint">
          {d.slug && d.slots.length > 0 && <a className="btn btn-ghost btn-sm" href={"/timetable?centre=" + encodeURIComponent(d.slug)}>Design my own timetable</a>}
          {d.slots.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button>}
        </div>
      </div>
      {!d.centre ? <p className="tt-empty">You have not been placed at a centre yet. Ask your centre lead.</p>
        : <TimetableView slots={d.slots} showInstructor title={d.centre} mineLabel="Your course"
            emptyText={d.centre + " has not published its timetable yet. It meets " + (d.meetDays || "on days your centre lead will tell you") + (d.meetTime ? ", " + d.meetTime : "") + "."}/>}
      {d.course && d.slots.length > 0 && !d.slots.some(x => x.mine) && <p className="tt-sub">There is no {d.course} slot on this timetable yet — ask your centre lead when it meets.</p>}
    </div>
  );
}

function DashboardDivision({ m }) {
  const d = (typeof nggcDivision === "function") ? nggcDivision((m && m.division) || "") : null;
  if (!m) return null;
  return (
    <div className="dash-card dash-division">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Your division.</h3></div>
      {!d ? (
        <p className="dash-division-empty">
          You have not been placed in a division yet. There are four, and every member
          belongs to one — ask your centre lead which is yours.
        </p>
      ) : (
        <React.Fragment>
          {/* The bar carries the division's own colour: data, not chrome. */}
          <div className="dash-division-bar" style={{ background: d.accent }} aria-hidden="true"/>
          <div className="mono dash-division-code">DIVISION {d.code}</div>
          <div className="dash-division-name">{d.name}</div>
          <p className="dash-division-mandate">{d.mandate}</p>
          {d.audience && <p className="dash-division-audience">{d.audience}</p>}
          <ul className="dash-division-courses">
            {d.courses.map(c => (
              <li key={c} className={c === "Chess" ? "is-chess" : ""}>{c}</li>
            ))}
          </ul>
          <p className="dash-division-note">
            Chess is in every division's list, including yours. It is compulsory — the
            programme treats it as a leadership laboratory, not an extra class.
          </p>
        </React.Fragment>
      )}
    </div>
  );
}

function DashboardIdCard({ m }) {
  const Card = window.MemberIDCard;
  if (!Card || !m) return null;
  return (
    <div className="dash-card">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Your ID card.</h3></div>
      <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 4px" }}>
        <Card member={m}/>
      </div>
    </div>
  );
}

/* NGV standing — shown once a member has been promoted up the chain of command
   into the volunteer tier. It confirms the new role and surfaces the volunteer
   ID that now backs their check-in and volunteer surfaces. */
const NGV_ROLE_LABEL = { volunteer: "Volunteer", instructor: "Instructor", mentor: "Mentor" };
function ngvWhen(iso) {
  try {
    var d = new Date(iso);
    return fmtDate(d) + " · " + fmtTime(d);
  } catch (e) { return String(iso || "").slice(0, 16).replace("T", " "); }
}
function DashboardNgv({ ngv }) {
  const active = (ngv.status || "active") === "active";
  const upcoming = Array.isArray(ngv.upcoming) ? ngv.upcoming : [];
  const sessions = typeof ngv.sessions === "number" ? ngv.sessions : null;
  return (
    <div className="dash-card dash-account">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Your NGV role.</h3>
        <span className="chip chip-gold" style={active ? undefined : { opacity: 0.55 }}>{active ? "NGV" : "NGV · paused"}</span>
      </div>
      <div className="dash-account-figure is-clear" style={{ fontSize: "var(--rs-fsize-1, 22px)" }}>{NGV_ROLE_LABEL[ngv.role] || "Volunteer"}</div>
      <div className="dash-account-sub">
        Volunteer ID <b className="mono">{ngv.volunteerId}</b>
        {ngv.since ? " · since " + String(ngv.since).slice(0, 10) : ""}
        {sessions !== null ? " · " + sessions + " session" + (sessions === 1 ? "" : "s") + " served" : ""}
      </div>
      {ngv.profileUrl && (
        <a href={ngv.profileUrl} target="_blank" rel="noopener noreferrer"
          style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
            borderRadius: 10, background: "var(--gold, #e8961f)", color: "#1a1205", fontWeight: 700,
            fontSize: 13, textDecoration: "var(--rs-textdecoration-47, none)" }}>
          Open my volunteer ID &amp; check-in QR →
        </a>
      )}
      {upcoming.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="dash-card-h-sm" style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Sessions to shadow</div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {upcoming.map((e, i) => (
              <li key={e.eventId || i} style={{ display: "flex", justifyContent: "space-between", gap: 8,
                padding: "5px 0", borderTop: i ? "1px solid rgba(128,128,128,.18)" : "none", fontSize: 13 }}>
                <span>{e.title}</span>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>
                  {ngvWhen(e.startAt)}{e.spotsLeft != null ? " · " + e.spotsLeft + " left" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!active && (
        <div className="dash-account-earned" style={{ marginTop: 10 }}>
          Your NGV standing is currently paused — an admin can reinstate it.
        </div>
      )}
    </div>
  );
}

function DashboardObligations({ account }) {
  const [open, setOpen] = React.useState(false);
  const a = account;
  const t = a.tenure || {};
  const owed = a.payable;
  const entries = a.entries || [];
  return (
    <div className="dash-card dash-account">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Your account.</h3>
        {a.mouAt && <span className="chip chip-lime" title={"MOU accomplished " + String(a.mouAt).slice(0, 10)}>MOU DONE</span>}
      </div>

      {/* REAL money only — dues and fines. The training fee is the cost of a
          place given free, and putting the two in one figure is how a family
          comes to believe they owe six figures for something free. */}
      {owed > 0 ? (
        <React.Fragment>
          <div className="dash-account-figure">{naira(owed)}</div>
          <div className="dash-account-sub">to pay</div>
          {a.payOnline && <PayBalanceButton amountText={naira(owed + (a.payFee || 0))} pay={() => NGGApi.member.feesPay()}/>}
          {a.payOnline && a.payFee > 0 && <p className="pay-balance-note">Includes Paystack’s {naira(a.payFee)} charge for paying online. A bank transfer to NGG has no charge.</p>}
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div className="dash-account-figure is-clear">Nothing to pay</div>
          <div className="dash-account-sub">dues and fines are clear</div>
        </React.Fragment>
      )}

      {/* The cost of the place, stated as a fact about what the programme
          spends — not as a bill, and never added to the figure above. */}
      {a.programmeCost > 0 && (
        <div className="dash-cost">
          <div className="dash-cost-head">
            Cost of your training: <b>{naira(a.programmeCost)}</b>
          </div>
          <div className="dash-cost-note">
            Covered by NGG — this is not something you are asked to pay.
          </div>
          {(a.programmeCovered > 0 || a.mouAt) && (
            <div className="dash-cost-earned">
              {a.mouAt
                ? "Your MOU is complete, so the whole of it is settled."
                : <><b>{naira(a.programmeCovered)}</b> of it has been earned off by your service so far.</>}
            </div>
          )}
        </div>
      )}

      {/* The training-fee watch — the phase, any pause in the credit, and the
          schedule, drawn by the one component the Control Room uses too. */}
      {a.training && (a.training.rows.length > 0 || a.training.phase !== "unknown")
        ? <TrainingFeeWatch w={a.training} audience="member"/>
        : null}
      {a.training && a.training.phase === "training" && a.training.rows.length > 0 && (
        <p className="dash-sched-foot">
          The fee is added for your first {t.trainingMonths} months. After that the total
          starts coming down again over {t.serviceMonths} months as you serve — as long as you
          keep to the MOU.
        </p>
      )}

      <button className="btn btn-ghost btn-sm dash-account-toggle" onClick={() => setOpen(o => !o)}>
        {open ? "Hide the detail" : "See every entry"}
      </button>

      {open && (
        <div className="dash-account-list">
          {entries.length === 0 && <div className="dash-account-empty">Nothing on the account yet.</div>}
          {entries.map((e, i) => (
            <div key={i} className={"dash-account-row" + (e.void ? " is-void" : "")}>
              <div>
                <div className="dash-account-row-what">{ACCOUNT_KIND_LABEL[e.kind] || e.kind}</div>
                {e.note && <div className="dash-account-row-note">{e.note}</div>}
                <div className="mono dash-account-row-when">{String(e.createdAt).slice(0, 10)}{e.void && " · cancelled"}</div>
              </div>
              <div className={"mono dash-account-row-amt" + (e.direction === "charge" ? "" : " is-credit")}>
                {e.direction === "charge" ? "" : "−"}{naira(e.amount)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dash-account-foot">
        {/* Where to go with a question, because the screen cannot answer one and
            a family in difficulty needs a person, not a figure. */}
        Something look wrong, or is this a difficult month? Speak to your centre
        coordinator — they would rather hear from you.
      </div>
    </div>
  );
}

/* Policy FINES — a separate ledger from dues/fees. These are disciplinary
   sanctions under the institutional policy (lateness, absence, ID-card), shown
   with the reason and status so a member sees exactly what they owe and why,
   plus a compliance banner when they are warned/suspended/evicted. Rendered
   only when there is something to show (see `showFines`). */
const FINE_STATE_LABEL = { warned: "Warning on record", dormant: "Dormant", suspended: "Suspended", evicted: "Evicted" };
function DashboardFines({ c }) {
  const owed = c.finesOwed || 0;
  const fines = c.fines || [];
  const state = c.state || "clear";
  return (
    <div className="dash-card dash-account">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="dash-card-h-sm">Policy fines.</h3>
        {state !== "clear" && <span className="chip chip-coral">{FINE_STATE_LABEL[state] || state}</span>}
      </div>

      {owed > 0 ? (
        <React.Fragment>
          <div className="dash-account-figure">{naira(owed)}</div>
          <div className="dash-account-sub">in fines outstanding</div>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div className="dash-account-figure is-clear">All clear</div>
          <div className="dash-account-sub">no fines outstanding</div>
        </React.Fragment>
      )}

      {state !== "clear" && c.reason && (
        <div className="dash-account-earned">
          {c.reason}{c.until ? " Until " + String(c.until).slice(0, 10) + "." : ""}
        </div>
      )}

      {fines.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
          {fines.map((f, i) => (
            <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", padding: "8px 0", borderTop: "1px solid var(--hair, rgba(20,24,48,.08))" }}>
              <span style={{ fontSize: 13, color: "var(--ink-500, #5a6178)", lineHeight: 1.35 }}>
                {f.reason || "Fine"}
                {f.issuedAt ? <span style={{ opacity: 0.6 }}> · {String(f.issuedAt).slice(0, 10)}</span> : null}
              </span>
              <span style={{ whiteSpace: "nowrap", fontWeight: 700 }}>
                {naira(f.amount)} <span className={"chip " + (f.status === "pending" ? "chip-gold" : "chip-coral")}>{f.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="dash-account-foot">
        Fines are issued under the institutional policy. To query or clear one,
        speak to your centre coordinator.
      </div>
    </div>
  );
}

/* A member's words for the ledger kinds. Plainer than the admin labels: nobody
   outside an office calls a payment "payment received". */
/* The ledger's own words. `training` is labelled as COVERED here as well as in
   the panel above: a row reading "Training fee ₦75,000" in a list of things a
   family owes is read as a bill however carefully the rest of the card is
   worded. */
const ACCOUNT_KIND_LABEL = {
  membership: "Membership fee", dues: "Monthly dues", training: "Training place — covered by NGG",
  fine: "Fine", adjustment: "Adjustment",
  payment: "You paid", writeoff: "Written off", waiver: "Waived",
};

/* ── Your week, with your mentor ───────────────────────────────────────────
   The member's side of the Mentor Portal: how this week went (and, if they
   want, sleep, stress and energy), their side of the relationship check when
   their mentor asks for it, their own Leadership Index scores once a month,
   and the goal they agreed. A "Need help" reaches their mentor at once and the
   safeguarding lead too — so the card says so before they press it. Nothing
   here is shared with other members. */
const DCI_FEEL = [["Okay", "I’m okay", "smiley"], ["Struggling", "It’s been hard", "smiley-meh"], ["Need help", "I need help", "lifebuoy"]];
const DCI_EXTRA = [["sleep", "Sleep", ["Very poor", "Poor", "Okay", "Good", "Great"]], ["stress", "Stress", ["None", "A little", "Some", "A lot", "Too much"]], ["energy", "Energy", ["Empty", "Low", "Okay", "Good", "Full"]]];
function DashboardCheckin() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [edit, setEdit] = React.useState(false);
  const [v, setV] = React.useState({ wellbeing: "", sleep: 0, stress: 0, energy: 0, note: "" });
  const [more, setMore] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [rel, setRel] = React.useState([0, 0, 0, 0]);
  const [scoring, setScoring] = React.useState(false);
  const [sc, setSc] = React.useState(null);
  const load = () => NGGApi.member.pod.read("mine").then(r => { setD(r); setErr(null); if (r.checkin) setV({ wellbeing: r.checkin.wellbeing, sleep: +r.checkin.sleep, stress: +r.checkin.stress, energy: +r.checkin.energy, note: r.checkin.note || "" }); }, setErr);
  React.useEffect(() => { load(); }, []);
  if (err && !d) return <div className="dash-card"><div className="dash-card-head"><h3 className="dash-card-h-sm">Your week.</h3></div>
    <p className="dash-account-sub" style={{ margin: "8px 0 12px" }}>Couldn’t load your check-in just now.</p><button className="btn btn-ghost btn-sm" onClick={load}>Try again</button></div>;
  if (!d) return <div className="dash-card dci" aria-busy="true"><div className="dash-card-head"><h3 className="dash-card-h-sm">Your week.</h3></div><div className="dci-skel"/></div>;
  if (!d.mentor) return null;
  const done = !!d.checkin && !edit;
  const send = () => {
    if (!v.wellbeing) { toast.error("Choose how your week has been first."); return; }
    setBusy(true);
    NGGApi.member.pod.act("weekCheckin", v).then(() => {
      toast.success(v.wellbeing === "Okay" ? "Thanks. " + d.mentor.first + " can see it." : v.wellbeing === "Need help" ? d.mentor.first + " has been told and will reach you today." : "Thanks for telling us. " + d.mentor.first + " will check in with you.", "Check-in sent");
      setEdit(false); load();
    }, e => toast.error((e && e.message) || "Couldn’t send it. Try again.")).finally(() => setBusy(false));
  };
  const sendRel = () => {
    if (rel.some(x => !x)) { toast.error("Answer all four first."); return; }
    NGGApi.member.pod.act("relChild", { answers: rel }).then(() => { toast.success("Thank you. Only the coordinator sees your answers.", "Sent"); load(); }, e => toast.error((e && e.message) || "Couldn’t send it."));
  };
  const sendScores = () => NGGApi.member.pod.act("selfScore", { scores: sc }).then(() => { toast.success("Your mentor will see these next to theirs.", "Scores saved"); setScoring(false); load(); }, e => toast.error((e && e.message) || "Couldn’t save them."));
  const g = d.goal;
  return (
    <div className="dash-card dci">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Your week.</h3><span className="dci-with">{"With " + d.mentor.name}</span></div>
      {done ? (
        <div className="dci-done">
          <span className={"dci-done-chip is-" + (d.checkin.wellbeing === "Okay" ? "ok" : "warn")}>{(DCI_FEEL.find(f => f[0] === d.checkin.wellbeing) || DCI_FEEL[0])[1]}</span>
          <span className="dci-muted">{"Checked in this week" + (d.checkin.note ? " · “" + d.checkin.note + "”" : "")}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)}>Change my check-in</button>
        </div>
      ) : (
        <div className="dci-form">
          <p className="dci-q" id="dci-q">How has your week been?</p>
          <div className="dci-feel" role="radiogroup" aria-labelledby="dci-q">
            {DCI_FEEL.map(([k, l, ic]) => <button key={k} type="button" role="radio" aria-checked={v.wellbeing === k} className={"dci-feel-b is-" + k.replace(/\s/, "").toLowerCase()} onClick={() => setV(Object.assign({}, v, { wellbeing: k }))}>
              <i className={"ph ph-" + ic} aria-hidden="true"/><span>{l}</span></button>)}
          </div>
          {v.wellbeing === "Need help" && <p className="dci-help" role="note">{d.mentor.first + " is told straight away, and so is the person at your centre who keeps young people safe. If you are in danger right now, call 112."}</p>}
          {!more ? <button type="button" className="dci-link" onClick={() => setMore(true)}>Add sleep, stress and energy</button> : DCI_EXTRA.map(([k, l, words]) => (
            <div key={k} className="dci-extra"><span className="dci-extra-l" id={"dci-" + k}>{l}</span>
              <div className="dci-scale" role="radiogroup" aria-labelledby={"dci-" + k}>{words.map((w, i) => <button key={w} type="button" role="radio" aria-checked={v[k] === i + 1} onClick={() => setV(Object.assign({}, v, { [k]: i + 1 }))}>{w}</button>)}</div></div>))}
          <textarea className="dci-note" rows={2} maxLength={600} placeholder={"Anything you want " + d.mentor.first + " to know? (optional)"} aria-label="Note for your mentor" value={v.note} onChange={e => setV(Object.assign({}, v, { note: e.target.value }))}/>
          <div className="dci-actions"><button className="btn btn-primary btn-sm" disabled={busy || !v.wellbeing} onClick={send}>{busy ? "Sending…" : "Send to " + d.mentor.first}</button>
            {edit && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>Cancel</button>}</div>
        </div>
      )}
      {g && <div className="dci-goal"><span className="dci-label">Your goal</span><b>{g.goal}</b>
        <span className="dci-segs" aria-label={"How close: " + (g.progress || 0) + " of 5"}>{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= (g.progress || 0) ? "is-on" : ""}/>)}</span>
        {g.plan && <span className="dci-muted">{"Your plan: " + g.plan}</span>}</div>}
      {d.relAsked && !d.relDone && <div className="dci-rel"><span className="dci-label">{d.mentor.first + " asked how mentoring is going"}</span>
        <span className="dci-muted">Four quick questions. Only the coordinator sees your answers; your mentor sees one number.</span>
        {d.relQuestions.map((q, i) => <div key={q} className="dci-extra"><span className="dci-extra-l" id={"dci-rq" + i}>{q}</span>
          <div className="dci-scale" role="radiogroup" aria-labelledby={"dci-rq" + i}>{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={rel[i] === n} onClick={() => setRel(r => r.map((x, j) => j === i ? n : x))}>{n}</button>)}</div></div>)}
        <span className="dci-muted">1 = not at all · 5 = very much</span>
        <div className="dci-actions"><button className="btn btn-primary btn-sm" onClick={sendRel}>Send my answers</button></div></div>}
      {d.selfScoreDue && (!scoring ? <div className="dci-score"><span className="dci-label">Your Leadership Index</span>
          <span className="dci-muted">{"Score yourself for this month. " + d.mentor.first + " scores you too; the difference is a good conversation."}</span>
          <div className="dci-actions"><button className="btn btn-ghost btn-sm" onClick={() => { setSc((d.selfScore && d.selfScore.scores) || d.skills.map(() => 5)); setScoring(true); }}>Score myself</button></div></div>
        : <div className="dci-score"><span className="dci-label">Your Leadership Index · 0 to 10</span>
          {d.skills.map(([name, desc], i) => <div key={name} className="dci-sk"><span><b>{name}</b><em>{desc}</em></span>
            <span className="dci-step"><button type="button" aria-label={"Lower " + name} disabled={sc[i] <= 0} onClick={() => setSc(x => x.map((y, j) => j === i ? y - 1 : y))}>−</button>
              <output aria-live="polite">{sc[i]}</output>
              <button type="button" aria-label={"Raise " + name} disabled={sc[i] >= 10} onClick={() => setSc(x => x.map((y, j) => j === i ? y + 1 : y))}>+</button></span></div>)}
          <div className="dci-actions"><button className="btn btn-primary btn-sm" onClick={sendScores}>Save my scores</button><button className="btn btn-ghost btn-sm" onClick={() => setScoring(false)}>Cancel</button></div></div>)}
    </div>
  );
}

function DashboardMentor({ mentor }) {
  return (
    <div className="dash-card dash-mentor">
      <div className="eyebrow" style={{color:"var(--ink-500)"}}>YOUR MENTOR</div>
      <div className="dash-mentor-row">
        {mentor.photoUrl
          ? <img className="dash-mentor-avatar" src={nggImg(mentor.photoUrl, "face")} alt={mentor.fullName}/>
          : <div className="dash-mentor-avatar dash-mentor-avatar-fallback">{(mentor.fullName || "?").charAt(0)}</div>}
        <div>
          <div className="dash-mentor-name">{mentor.fullName}</div>
          <div className="dash-mentor-meta">
            {(mentor.tracks || []).join(" · ") || "Mentor"}{mentor.centre ? " · " + mentor.centre : ""}
          </div>
        </div>
      </div>
      {mentor.bio && <p className="dash-mentor-bio">{mentor.bio}</p>}
    </div>
  );
}

function DashboardEvents({ events, onRsvp }) {
  if (!events.length) return null;
  return (
    <div className="dash-card">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Coming up.</h3></div>
      <div className="dash-events">
        {events.slice(0, 3).map(e => (
          <DashboardEventRow key={e.eventId} e={e} onRsvp={onRsvp}/>
        ))}
      </div>
    </div>
  );
}

function DashboardEventRow({ e, onRsvp }) {
  const d = new Date(e.startAt);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = fmtDayMonth(d).replace(/^\d+\s*/, "");
  return (
    <div className="dash-event">
      <div className="dash-event-date">
        <div className="dash-event-dd">{dd}</div>
        <div className="mono dash-event-mm">{mm}</div>
      </div>
      <div className="dash-event-body">
        <div className="dash-event-title">{e.title}</div>
        <div className="dash-event-meta">CACENTRE {e.centre} · {fmtTime(d)}</div>
      </div>
      <button
        className={"btn btn-sm dash-event-rsvp " + (e.myRsvp === "going" ? "btn-gold" : "btn-ghost")}
        onClick={() => onRsvp(e.eventId, e.myRsvp === "going" ? "cancelled" : "going")}
      >
        {e.myRsvp === "going" ? "Going ✓" : "RSVP"}
      </button>
    </div>
  );
}

function DashboardNotifications({ notes, onRead }) {
  /* The dashboard payload carries UNREAD only, capped at eight, and there was no
     way to see anything already read — so a member who tapped a notice to clear
     it could never find it again. `member.notifications` has always returned the
     last fifty including read ones; nothing asked for them. */
  const [all, setAll] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const showing = all || notes;
  const loadAll = () => {
    setLoading(true);
    NGGApi.member.notifications()
      .then(r => setAll(r.notifications || []))
      .catch(() => toast.error("Couldn't load the earlier ones."))
      .finally(() => setLoading(false));
  };
  if (!notes.length && !all) return null;
  return (
    <div className="dash-card">
      <div className="dash-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 className="dash-card-h-sm">Activity.</h3>
        {all
          ? <button className="btn btn-ghost btn-sm" onClick={() => setAll(null)}>Unread only</button>
          : <button className="btn btn-ghost btn-sm" disabled={loading} onClick={loadAll}>{loading ? "…" : "Everything"}</button>}
      </div>
      <div className="dash-notes">
        {showing.slice(0, all ? 50 : 5).map(n => (
          <button key={n.notifId} className={"dash-note" + (n.readAt ? "" : " is-unread")} onClick={() => onRead(n.notifId)}>
            <div className="dash-note-kind" data-kind={n.kind}/>
            <div className="dash-note-body">
              <div className="dash-note-title">{n.title}</div>
              {n.body && <div className="dash-note-text">{n.body}</div>}
              <div className="mono dash-note-time">{timeAgo(n.createdAt)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DashboardShortcuts({ setPage }) {
  return (
    <div className="dash-card dash-shortcuts">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Jump to…</h3></div>
      <a className="dash-journal-cta" href="/journal/">
        <span className="dash-journal-cta-ico" aria-hidden="true">✦</span>
        <span className="dash-journal-cta-txt"><b>Open the Anchor Journal</b><small>Daily reflection · install it as an app</small></span>
        <span aria-hidden="true">→</span>
      </a>
      <div className="dash-shortcuts-grid">
        <button className="dash-shortcut" onClick={() => setPage("anchor")}><span>↗</span>Anchor 12</button>
        <button className="dash-shortcut" onClick={() => setPage("book")}><span>📖</span>The book</button>
        <button className="dash-shortcut" onClick={() => setPage("media")}><span>▶</span>Media</button>
        <button className="dash-shortcut" onClick={() => setPage("blog")}><span>✎</span>Blog</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Activity feed — recent mission verifications for this member.
// (Placeholder until we surface them via a dedicated endpoint; for now we
// derive from the dashboard's "today" history.)
// ----------------------------------------------------------------------------

function DashboardActivityFeed({ memberId, session, reloadKey }) {
  // Lightweight feed: shows last 6 verified/submitted missions from the
  // anchor endpoint. Refetches on mount and on real mutations (reloadKey),
  // but NOT on the 60s poll — that would double the anchor() traffic.
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    NGGApi.member.anchor().then(r => {
      if (!alive) return;
      const flat = [];
      (r.weeks || []).forEach(w => (w.missions || []).forEach(m => {
        if (m.status === "verified" || m.status === "submitted") {
          flat.push({ ...m, week: w.week, theme: w.theme });
        }
      }));
      setItems(flat.slice(-6).reverse());
    }).catch(() => setItems([]));
    return () => { alive = false; };
  }, [memberId, reloadKey]);

  if (!items || items.length === 0) return null;

  return (
    <div className="dash-card dash-feed">
      <div className="dash-card-head"><h3 className="dash-card-h-sm">Your trail.</h3></div>
      <ol className="dash-feed-list">
        {items.map((it, i) => (
          <li key={it.missionId + i} className={"dash-feed-item dash-feed-" + it.status}>
            <span className="dash-feed-dot"/>
            <div>
              <div className="dash-feed-title">{it.title}</div>
              <div className="dash-feed-meta">WK {String(it.week).padStart(2, "0")} · {it.theme} · {it.status === "verified" ? "+" + it.xp + " XP" : "awaiting review"}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Quick journal — single textarea + mood. Drops into Journal sheet.
// ----------------------------------------------------------------------------

function DashboardJournal({ onMutate }) {
  const [mood, setMood] = React.useState("");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await NGGApi.member.journalCreate({ mood, body: body.trim(), private: true });
      setBody(""); setMood(""); setSaved(true);
      setTimeout(() => setSaved(false), 2400);
      onMutate();
    } catch (e) {
      toast.error("Couldn't save: " + humanError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dash-card dash-journal">
      <div className="dash-card-head">
        <div>
          <div className="eyebrow" style={{color:"var(--ink-500)"}}>JOURNAL · PRIVATE TO YOU</div>
          <h2 className="dash-card-h">A line for the record.</h2>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className="dash-mood">
          {DASH_MOODS.map(mo => (
            <button key={mo.key} type="button" className={"dash-mood-btn" + (mood === mo.key ? " is-on" : "")} onClick={() => setMood(mo.key)} aria-label={"Mood: " + mo.label} aria-pressed={mood === mo.key}>{mo.emoji}</button>
          ))}
        </div>
        <textarea
          className="dash-journal-input"
          placeholder="What did you build, learn or notice today?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        <div className="dash-journal-foot">
          <span className="mono" style={{color:"var(--ink-500)"}}>{saved ? "SAVED ✓" : (busy ? "SAVING…" : "")}</span>
          <button className="btn btn-primary btn-sm dash-journal-save" disabled={busy || !body.trim()}>Save entry</button>
        </div>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function humanError(e) {
  if (!e) return "Unknown error.";
  const code = e.code || e.message || "";
  const map = {
    rate_limited: "Too many tries — wait a minute.",
    unauthorized: "Please sign in again.",
    upstream_unreachable: "Backend is offline.",
    upstream_empty: "Backend returned nothing.",
    upstream_bad_json: "Backend response was unreadable.",
  };
  return map[code] || code || "Something went wrong.";
}

function hourGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return "Late one";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Late one";
}

function timeAgo(iso) {
  if (!iso) return "";
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.floor((now - t) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s/60) + "m ago";
  if (s < 86400) return Math.floor(s/3600) + "h ago";
  return Math.floor(s/86400) + "d ago";
}

Object.assign(window, { DashboardPage });

/* ── The member's curriculum (domain/curriculum.php) ───────────────────────────
 * Their course's lessons and the Club-wide ones, week by week, with where they
 * stand on each. A lesson opens in place: what to learn, the materials, the
 * text, and the checks. A multiple-choice answer is marked on the spot; a
 * written one is marked by the AI where one is set up — and SAID to be the
 * AI's — or waits for their instructor, and the screen says which. */
/* ── The companion: this week's check-in, and the weeks before ─────────────
   The rating is the server's rules (domain/companion.php); the words are the
   AI's when one is set up. Shown with its reasons, so "needs support" is never
   a verdict without an explanation. */
const COMPANION_LABEL = { on_track: "On track", watch: "Keep an eye on", at_risk: "Needs support" };
function DashCompanion() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const load = React.useCallback(() => { setErr(""); NGGApi.member.companion().then(setD).catch(e => setErr(e.code || e.message)); }, []);
  React.useEffect(() => { load(); }, [load]);
  if (err) return err === "not_ngg_member"
    ? <div className="dash-card"><h2 className="dash-card-h">The companion is for NGG members.</h2></div>
    : <div className="dash-card" role="alert"><p>Couldn't load your companion ({err}).</p><button className="btn btn-ghost btn-sm" onClick={load}>Try again</button></div>;
  if (!d) return <div className="dash-spinner" role="status" aria-label="Loading"/>;
  const c = d.current, x = c.metrics || {}, a = x.attendance || {}, cu = x.curriculum || {};
  return (
    <div className="comp">
      <section className={"dash-card comp-now is-" + c.rating} aria-labelledby="comp-h">
        <div className="eyebrow">WEEK OF {fmtDate(c.period).toUpperCase()}</div>
        <h2 id="comp-h" className="dash-card-h"><span className={"comp-chip is-" + c.rating}>{COMPANION_LABEL[c.rating]}</span></h2>
        <p className="comp-summary">{c.summary}</p>
        {c.strengths.length > 0 && <><h3 className="comp-h3">Going well</h3><ul className="comp-list">{c.strengths.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
        <h3 className="comp-h3">This week</h3>
        <ul className="comp-list is-focus">{c.focus.map((t, i) => <li key={i}>{t}</li>)}</ul>
        {c.reasons.length > 0 && <p className="comp-why">Why: {c.reasons.join(" · ")}.</p>}
        <p className="comp-src">{c.source === "ai" ? "Written by the NGG companion (AI) from your record — attendance, curriculum and conduct over the last four weeks." : "From your record — attendance, curriculum and conduct over the last four weeks."}</p>
      </section>
      <section className="comp-tiles" aria-label="The last four weeks">
        {[["Sessions attended", a.programmeDays ? a.present + " of " + a.programmeDays : String(a.present || 0)],
          ["Late", String(a.late || 0)], ["No sign-out", String(a.noSignOut || 0)],
          ["Lessons done", (cu.completed || 0) + " of " + (cu.lessons || 0)], ["Overdue", String(cu.overdue || 0)],
          ["Average score", cu.avgScore != null ? cu.avgScore + "%" : "—"]].map(([l, v]) => (
          <div key={l} className="comp-tile"><span className="comp-tile-l">{l}</span><b className="comp-tile-v">{v}</b></div>
        ))}
      </section>
      {d.history.length > 1 && (
        <section className="dash-card" aria-labelledby="comp-hist-h">
          <h3 id="comp-hist-h" className="comp-h3">Earlier weeks</h3>
          <ul className="comp-hist">{d.history.slice(1).map(h => (
            <li key={h.period}><span className="comp-hist-w">{fmtDate(h.period)}</span><span className={"comp-chip is-" + h.rating}>{COMPANION_LABEL[h.rating]}</span><span className="comp-hist-s">{h.summary}</span></li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}

function DashCurriculum() {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [open, setOpen] = React.useState("");
  const [say, setSay] = React.useState(null);
  /* Its own request, and its own failure: the term question never being
     asked must not cost anybody their lessons. */
  const loadSay = React.useCallback(() => {
    NGGApi.member.testimonialMine().then(setSay).catch(() => setSay(null));
  }, []);
  React.useEffect(() => { loadSay(); }, [loadSay]);
  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.member.curriculum().then(setData).catch(e => setErr(e.code || e.message || "failed"));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  if (open) return <DashCurriculumLesson unitId={open} onBack={() => { setOpen(""); load(); }}/>;
  if (err) return err === "not_ngg_member"
    ? <div className="dash-card cur-empty"><h2 className="dash-card-h">The Club curriculum is for NGG members.</h2><p>Summer School has its own course log with your instructor.</p></div>
    : <ErrorState title="Couldn't load your curriculum" code={err} onRetry={load}/>;
  if (!data) return <div className="dash-spinner" role="status" aria-label="Loading"/>;
  if (!data.units.length) return (
    <div className="dash-card cur-empty">
      <div className="eyebrow cur-eyebrow">CURRICULUM</div>
      <h2 className="dash-card-h">No lessons yet{data.track ? " for " + data.track : ""}.</h2>
      <p>Your lessons appear here as your instructors publish them.</p>
    </div>
  );
  const weeks = [];
  data.units.forEach(u => { const w = weeks.find(x => x.week === u.week); w ? w.units.push(u) : weeks.push({ week: u.week, units: [u] }); });
  return (
    <div className="cur">
      {/* Once a session, in its last weeks — never a gate on anything. The
          server decides whether the question is open (testi_session_ask). */}
      {say && say.session && <DashTermSay ask={say.session} mine={say.mine} onSaved={loadSay}/>}
      <div className="dash-card cur-summary">
        <div>
          <div className="eyebrow cur-eyebrow">CURRICULUM{data.track ? " · " + data.track.toUpperCase() : ""}</div>
          <h2 className="dash-card-h">{data.completed} of {data.total} lessons done.</h2>
          {data.overdue > 0 && <p className="cur-overdue-note" role="status">{data.overdue} assessment{data.overdue === 1 ? " is" : "s are"} overdue. An assessment left undone more than {(data.units[0] || {}).fineAfterDays || 7} days after it is due is fined{(data.units[0] || {}).fineAmount ? " " + fmtMoney(data.units[0].fineAmount) : ""}.</p>}
        </div>
        <div className="cur-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.pct} aria-label="Curriculum completed">
          <span style={{ width: data.pct + "%" }}/>
        </div>
        <div className="cur-download">
          <a className="btn btn-ghost btn-sm" href="/api/member/curriculum-doc.php" target="_blank" rel="noopener">Open as a document (PDF)</a>
          <a className="btn btn-ghost btn-sm" href="/api/member/curriculum-doc.php?format=doc">Download for Word</a>
        </div>
      </div>
      {weeks.map(w => (
        <section key={w.week} className="cur-week" aria-label={"Week " + w.week}>
          <h3 className="cur-week-h">Week {w.week}</h3>
          <ul className="cur-list">
            {w.units.map(u => {
              const st = curriculumStatusLabel(u.progress);
              return (
                <li key={u.unitId}>
                  <button type="button" className="cur-item" onClick={() => setOpen(u.unitId)}>
                    <span className="cur-item-main">
                      <span className="cur-item-title">{u.title}</span>
                      <span className="cur-item-meta">{u.course || "Whole Club"}{u.durationMins ? " · " + u.durationMins + " min" : ""}{u.checks ? " · " + u.checks + " check" + (u.checks === 1 ? "" : "s") : ""}
                        {u.dueDate && !(u.progress && (u.progress.status === "completed" || u.progress.pending)) && <> · <span className={u.overdueDays > 0 ? "cur-due is-over" : "cur-due"}>{u.overdueDays > 0 ? u.overdueDays + " day" + (u.overdueDays === 1 ? "" : "s") + " overdue" : "due " + fmtDate(u.dueDate)}</span></>}</span>
                    </span>
                    <span className={"cur-chip " + st.tone}>{st.label}{u.progress && u.progress.attempts > 0 && !u.progress.pending ? " · " + u.progress.bestPct + "%" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* The kinds of question where the work itself is the answer. A practical
   subject assessed only in prose is a practical subject assessed badly —
   so these carry the thing made, done or played, attached in the exam
   itself rather than "bring it next Saturday". */

/**
 * Attach the work to the answer — a photo of it, a recording of it, a file.
 *
 * This is what makes the practical half of a review sittable HERE. Before
 * it, "play the scale and say where your thumb went" could only ever be
 * marked on the learner's own account of it, which in a music programme is
 * the one thing that is not evidence. The upload goes through the member's
 * own curriculum store (signed-in readers only) and its URL is appended to
 * the written answer, so nothing about marking, progress or the schema
 * changes — a marker opens the answer and the work is in it.
 */

/**
 * One question, wherever it is asked.
 *
 * It is asked in two places now — at the START of a session, as the review
 * of the one before it, and inside a lesson's own set — and they must be the
 * same question: the same options, the same marking, the same feedback, the
 * same model answer. A second copy of this markup for the review panel is
 * how the two drift until a child sees a different thing depending on which
 * screen asked them.
 */

/**
 * ONE LINE ABOUT TODAY, asked at the end of every session.
 *
 * The home page used to carry four testimonials attributed to named people.
 * Nobody said any of them. This is where the real ones come from — written
 * the day it happened, by the person it happened to, rather than
 * reconstructed for a funder's report eighteen months later.
 *
 * Four things this screen will not do:
 *   · It will not publish anything. What is written here is private, goes to
 *     staff, and reaches the public site only if somebody with `content`
 *     decides so AND the record carries the guardian's visibility consent.
 *     That is said here, in a sentence, before they type.
 *   · It will not ask for a name. They choose initials, their first name, or
 *     nothing — and the quietest option is the default.
 *   · It will not block anything. No lesson, no review, no progress depends
 *     on it. A testimonial given to unlock something is not a testimonial.
 *   · It will not hold on to it. Clearing the box takes it back, published
 *     or not, without asking anybody.
 */
/* ── HOW DID TODAY GO ───────────────────────────────────────────────────────
 *
 * Three taps, two seconds, after every lesson. Private to the people who
 * teach them (domain/lesson-feedback.php) — it is never published and there
 * is no op that could publish it.
 *
 * This replaced a text box asking for a testimonial after every lesson, which
 * was the wrong question at the wrong rhythm: a child asked to write
 * something quotable twenty-four times a term answers twice. The considered
 * sentence is asked once a SESSION and lives in DashTermSay below.
 *
 * The words are optional, asked SECOND, and only of the child who did not
 * follow — because that is the only one whose words change what somebody
 * does next Saturday.
 */
const CUR_FB = [
  { id: "got",    label: "I could do it",   icon: "\u2713" },
  { id: "mostly", label: "I could follow,\nbut I'd need help", icon: "\u2248" },
  { id: "lost",   label: "I could not follow", icon: "?" },
];

function DashLessonFeedback({ unitId, mine, onSaved }) {
  const [signal, setSignal] = React.useState((mine && mine.signal) || "");
  const [body, setBody] = React.useState((mine && mine.body) || "");
  const [busy, setBusy] = React.useState(false);
  const [saidAt, setSaidAt] = React.useState(0);
  const send = async (sig, text) => {
    setBusy(true);
    try {
      await NGGApi.member.lessonFeedback(unitId, sig, text);
      setSaidAt(Date.now());
      if (onSaved) onSaved();
    } catch (e) { toast.error(humanizeError(e.code, e.code)); }
    finally { setBusy(false); }
  };
  const tap = (id) => { const next = signal === id ? "" : id; setSignal(next); send(next, next ? body : ""); };
  return (
    <section className="dash-card cur-fb" aria-label="How today went">
      <h3 className="cur-sec-h">How did that go?</h3>
      <p className="cur-fb-note">Only your instructor sees this. It never goes anywhere else, and it is not marked.</p>
      <div className="cur-fb-taps" role="group" aria-label="How did that go?">
        {CUR_FB.map(o => (
          <button key={o.id} type="button" disabled={busy}
                  className={"cur-fb-tap is-" + o.id + (signal === o.id ? " is-on" : "")}
                  aria-pressed={signal === o.id} onClick={() => tap(o.id)}>
            <span className="cur-fb-ico" aria-hidden="true">{o.icon}</span>
            <span className="cur-fb-lab">{o.label}</span>
          </button>
        ))}
      </div>
      {/* Asked only of the child who struggled: a nice note on "got it" is
          pleasant and is not why an instructor opens this. */}
      {(signal === "lost" || signal === "mostly") && (
        <label className="cur-fb-more">
          <span>What was hard? (you can skip this)</span>
          <textarea rows={2} value={body} maxLength={400} disabled={busy}
                    placeholder="e.g. I did not understand where the variable goes"
                    onChange={e => setBody(e.target.value)}
                    onBlur={() => body !== ((mine && mine.body) || "") && send(signal, body)}/>
        </label>
      )}
      {saidAt > 0 && <p className="cur-fb-done" role="status">Thank you — your instructor will see this.</p>}
    </section>
  );
}

/* ── WHAT THIS TERM GAVE YOU ────────────────────────────────────────────────
 *
 * The testimonial, asked once a SESSION — the twelve-week block, four a year
 * — in the last three weeks of it and for two months after it ends. The
 * server decides whether the question is open at all (testi_session_ask);
 * this draws nothing when it is not.
 */
function DashTermSay({ ask, mine, onSaved }) {
  const [body, setBody] = React.useState((mine && mine.body) || "");
  const [showAs, setShowAs] = React.useState((mine && mine.showAs) || "initials");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const had = !!(mine && mine.body);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await NGGApi.member.testimonialGive({ sessionId: ask.sessionId, body: body.trim(), showAs });
      setDone(true);
      toast.success(r.status === "withdrawn" ? "Taken back. Nobody will see it."
        : had ? "Changed. Somebody at NGG reads it before it goes anywhere."
        : "Thank you \u2014 somebody at NGG will read it.");
      if (onSaved) onSaved();
    } catch (e2) {
      toast.error(e2.code === "too_short" ? "A few more words than that." : humanizeError(e2.code, e2.code));
    } finally { setBusy(false); }
  };
  const SHOW = [["initials", "My initials"], ["first", "My first name"], ["anon", "Don\u2019t say who"]];
  return (
    <form className="dash-card cur-say" onSubmit={save} aria-label={"What " + ask.name + " gave you"}>
      <div className="eyebrow cur-eyebrow">{ask.name.toUpperCase()} IS ENDING</div>
      <h3 className="cur-sec-h">What did this term give you?</h3>
      <p className="cur-say-q">One or two lines, in your own words. Not today — the whole term.</p>
      <label className="cur-say-f">
        <span className="sr-only">What this term gave you</span>
        <textarea rows={3} value={body} maxLength={600} disabled={busy}
                  onChange={e => { setBody(e.target.value); setDone(false); }}
                  placeholder="Something you can do now that you could not do in week one."/>
      </label>
      <fieldset className="cur-say-as">
        <legend>If this ever goes on the website, show me as</legend>
        {SHOW.map(([v, l]) => (
          <label key={v} className={"cur-say-opt" + (showAs === v ? " is-on" : "")}>
            <input type="radio" name="showas" checked={showAs === v} disabled={busy}
                   onChange={() => { setShowAs(v); setDone(false); }}/>
            <span>{l}</span>
          </label>
        ))}
      </fieldset>
      <p className="cur-say-note">
        Nobody sees this but NGG staff unless you and your parent or guardian have
        agreed it can go on the website \u2014 and even then, a person decides, not a computer.
        {had ? " Clearing the box takes it back." : ""}
      </p>
      <div className="cur-say-acts">
        <button type="submit" className="btn btn-primary" disabled={busy || (!body.trim() && !had)}>
          {busy ? "Saving\u2026" : had ? (body.trim() ? "Change it" : "Take it back") : "Send it"}
        </button>
        {done && <span className="cur-say-done" role="status">Saved.</span>}
      </div>
    </form>
  );
}

/**
 * THE OPENING REVIEW — last week's questions, before today's lesson.
 *
 * The questions belong to the PREVIOUS lesson and are submitted against it,
 * so the attempt lands on the lesson it is about and every report, deadline
 * and completion already knows where to look. Nothing new is stored.
 *
 * It is first on the page and today's teaching waits behind it — but "Skip
 * to today's lesson" is always there, in plain words, because a child who
 * joined late or was away must not be locked out of the lesson by a review
 * of a week they were not here for.
 */
function DashOpeningReview({ review, onDone, onSkip }) {
  const [answers, setAnswers] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [out, setOut] = React.useState(null);
  const checks = review.checks || [];
  const answered = checks.every(c => answers[c.checkId] !== undefined && answers[c.checkId] !== "");
  const verdicts = {}; ((out && out.review) || []).forEach(c => { verdicts[c.checkId] = c; });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await NGGApi.member.curriculumSubmit(review.unitId, answers);
      setOut(r);
      if (r.progress.pending) toast.info("Sent. Your instructor will mark the written answers.", review.title);
      else toast.success("Review done — " + Math.round(r.progress.score) + " of " + r.progress.maxScore + ".", review.title);
    } catch (e2) { toast.error(humanizeError(e2.code, e2.code)); }
    finally { setBusy(false); }
  };
  const p = out && out.progress;
  return (
    <form className="dash-card cur-review" onSubmit={submit} aria-label={"Review of week " + review.week}>
      <div className="eyebrow cur-review-eyebrow">BEFORE TODAY&rsquo;S LESSON</div>
      <h3 className="cur-review-h">What do you still remember?</h3>
      <p className="cur-review-sub">
        {checks.length} question{checks.length === 1 ? "" : "s"} from week {review.week}, <b>{review.title}</b>.
        {review.attempted ? " You have had a go at these before." : " Try them from memory — looking them up does not help you."}
      </p>
      {checks.map((c, i) => (
        <CurCheckField key={c.checkId} c={c} n={i + 1} value={answers[c.checkId]} disabled={!!p}
                       onChange={v => setAnswers(a => ({ ...a, [c.checkId]: v }))}
                       verdict={verdicts[c.checkId]} mark={p && p.marks && p.marks[c.checkId]}/>
      ))}
      {p
        ? <div className="cur-review-done" aria-live="polite">
            <p className="cur-result">
              {p.pending ? "Your written answers are with your instructor."
                : Math.round(p.score) + " of " + p.maxScore + ". " + (p.status === "completed" ? "That week is complete." : "Worth going back over before you carry on.")}
            </p>
            <button type="button" className="btn btn-primary" onClick={onDone}>Start today&rsquo;s lesson</button>
          </div>
        : <div className="cur-review-acts">
            <button type="submit" className="btn btn-primary" disabled={busy || !answered}>{busy ? "Marking…" : "Check my answers"}</button>
            <button type="button" className="btn btn-ghost" onClick={onSkip}>Skip to today&rsquo;s lesson</button>
            {!answered && <span className="cur-note">Answer every question to check them.</span>}
          </div>}
    </form>
  );
}

function DashCurriculumLesson({ unitId, onBack }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [answers, setAnswers] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [started, setStarted] = React.useState(false);
  const load = React.useCallback(() => {
    setErr("");
    return NGGApi.member.curriculumUnit(unitId).then(r => { setD(r); setResult(null); }).catch(e => setErr(e.code || e.message));
  }, [unitId]);
  React.useEffect(() => { load(); }, [load]);
  if (err) return <ErrorState title="Couldn't open this lesson" code={err} onRetry={load}/>;
  if (!d) return <div className="dash-spinner" role="status" aria-label="Loading"/>;
  const u = d.unit;
  const p = (result && result.progress) || d.progress;
  const review = result && result.review;
  const reviewById = {}; (review || []).forEach(c => { reviewById[c.checkId] = c; });
  const marks = (p && p.marks) || {};
  const answered = u.checks.every(c => answers[c.checkId] !== undefined && answers[c.checkId] !== "");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await NGGApi.member.curriculumSubmit(unitId, answers);
      setResult(r);
      if (r.progress.status === "completed") toast.success("Lesson complete — " + r.progress.bestPct + "%.", u.title);
      else if (r.progress.pending) toast.info("Sent. Your instructor will mark the written answers.", u.title);
      else toast.info("Not yet — " + Math.round(r.progress.score) + " of " + r.progress.maxScore + ". Have another go.", u.title);
    } catch (e2) { toast.error(humanizeError(e2.code, e2.code)); }
    finally { setBusy(false); }
  };
  const st = curriculumStatusLabel(p);
  /* The review comes FIRST and today's teaching waits behind it, because a
     review sat after the lesson it is meant to precede is just a quiz. The
     skip is always there: being away last week is not a reason to be shut
     out of this week. */
  const opened = started || !d.review;
  return (
    <article className="cur-lesson">
      <button type="button" className="btn btn-ghost btn-sm cur-back" onClick={onBack}>← All lessons</button>
      <header className="dash-card cur-lesson-head">
        <div className="eyebrow cur-eyebrow">WEEK {u.week} · {(u.course || "Whole Club").toUpperCase()}</div>
        <h2 className="cur-lesson-title">{u.title}</h2>
        {u.summary && <p className="cur-lesson-sum">{u.summary}</p>}
        <span className={"cur-chip " + st.tone}>{st.label}</span>
        {p && p.stale && <p className="cur-note">This lesson's checks have changed since you sat them — your earlier score was on the older questions.</p>}
      </header>
      {!opened && <DashOpeningReview review={d.review} onDone={() => setStarted(true)} onSkip={() => setStarted(true)}/>}
      {opened && u.objectives.length > 0 && (
        <section className="dash-card">
          <h3 className="cur-sec-h">What you'll learn</h3>
          <ul className="cur-objectives">{u.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </section>
      )}
      {opened && (u.body || u.materials.length > 0) && (
        <section className="dash-card">
          <h3 className="cur-sec-h">The lesson</h3>
          <CurriculumText text={u.body}/>
          <CurriculumMaterials materials={u.materials} fileUrl={curMemberFile}/>
        </section>
      )}
      {opened && u.checks.length > 0 && (
        /* These are the questions you will be asked at the START of the next
           session, a week from now. They stay reachable here on purpose: a
           member who wants to try them straight away should be able to, the
           last lesson of a course has no next session to be asked in, and
           completion has to remain possible either way. What changed is
           which moment the programme treats as the real one. */
        <form className="dash-card cur-checks" onSubmit={submit} aria-label="Next session's review">
          <h3 className="cur-sec-h">Next session&rsquo;s review</h3>
          <p className="cur-note">
            You&rsquo;ll be asked {u.checks.length === 1 ? "this" : "these"} at the start of your next session, from memory.
            Have a go now if you like — it is the remembering a week later that makes it stick.
            Pass mark {u.passMark}%.{p && p.attempts > 0 ? " Attempts so far: " + p.attempts + "." : ""}
          </p>
          {u.checks.map((c, i) => (
            <CurCheckField key={c.checkId} c={c} n={i + 1} value={answers[c.checkId]}
                           onChange={v => setAnswers(a => ({ ...a, [c.checkId]: v }))}
                           verdict={reviewById[c.checkId]} mark={marks[c.checkId]}/>
          ))}
          {p && p.attempts > 0 && (
            <p className="cur-result" aria-live="polite">
              {p.pending ? "Your written answers are with your instructor. Your score appears once they're marked."
                : "Score: " + Math.round(p.score) + " of " + p.maxScore + " (" + Math.round(p.maxScore ? p.score / p.maxScore * 100 : 0) + "%) · best " + p.bestPct + "%."}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy || !answered}>{busy ? "Marking…" : p && p.attempts > 0 ? "Submit again" : "Submit answers"}</button>
          {!answered && <span className="cur-note"> Answer every question to submit.</span>}
        </form>
      )}
      {/* Last on the page, after the work, because that is when somebody
          knows what the session gave them. Never a gate on any of it. */}
      {opened && <DashLessonFeedback unitId={unitId} mine={d.feedback} onSaved={load}/>}
    </article>
  );
}

