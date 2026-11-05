/* Control Room — Members › Sign-in security (api/_lib/domain/mfa.php).

   Who has a second sign-in step, and the desk's levers over it:
   - the policy per kind of person (off · optional · required) — settings;
   - per person: let them in without it for ten minutes (the child at the desk
     who forgot their answer), reset it, require it of them, remind them —
     people. One declaration per action feeds the row menu and the bulk bar;
     the ten-minute let-in is one person at a time and never a bulk action.
   Staff are not listed: the console's own authenticator is theirs, reset in
   Access & roles. */

const MFA_DESK_KINDS = [
  ["member", "Members", "A private question"],
  ["team", "Instructors, volunteers & mentors", "An authenticator app or an emailed code"],
  ["guardian", "Guardians", "A family PIN"],
];
const MFA_DESK_TYPE = { question: "Private question", app: "Authenticator app", email: "Emailed code", pin: "PIN" };
const MFA_DESK_POLICY = [["off", "Off"], ["optional", "Optional — remind them"], ["required", "Required at sign-in"]];
const MFA_DESK_PAGE = 50;

function mfaDeskTime(unix) { return fmtTime(new Date(unix * 1000)); }

function AdminSignInSecurity() {
  const auth = (typeof useAuth === "function") ? useAuth() : { hasCap: () => false };
  const hasCap = auth.hasCap;
  const [kind, setKind] = React.useState("member");
  const [state, setState] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  // A one-time code just made at the desk: shown here once, never again.
  const [issued, setIssued] = React.useState(null);   // null | { name, code, expires }
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [policy, setPolicy] = React.useState(null);
  // { kind: [method ids allowed] } — what each kind of person may choose.
  const [methods, setMethods] = React.useState(null);
  const [savingPolicy, setSavingPolicy] = React.useState(false);

  const load = React.useCallback(() => {
    setErr(""); setLoading(true);
    return NGGApi.admin.mfa.overview({ kind, state, q: query, limit: MFA_DESK_PAGE, offset })
      .then(r => { setD(r); setPolicy(p => p || r.policy);
        setMethods(m => m || Object.fromEntries(Object.entries(r.methods || {}).map(([k, list]) => [k, list.filter(x => x.on).map(x => x.id)]))); })
      .catch(e => setErr(e.code || e.message || "load_failed"))
      .finally(() => setLoading(false));
  }, [kind, state, query, offset]);
  React.useEffect(() => { load(); }, [load]);

  const rows = (d && d.rows) || [];
  const keyOf = r => r.who + ":" + r.id;
  const sel = useAdminSelection(rows, keyOf);
  const byKey = {};
  rows.forEach(r => { byKey[keyOf(r)] = r; });
  const people = keys => keys.map(k => { const i = k.indexOf(":"); return { who: k.slice(0, i), id: k.slice(i + 1) }; });
  const nameOf = keys => keys.length === 1 && byKey[keys[0]] ? byKey[keys[0]].name : keys.length + " people";

  const ACTIONS = [
    /* Google Workspace's two answers to a lost second step (Admin console >
       Users > Security): "Turn off for 10 minutes" and "Get backup
       verification codes". Both are for one person, both are audited, and
       the person is told either way. */
    { id: "bypass", label: "Let in for 10 minutes", rowLabel: "Turn off their second step for 10 minutes", cap: "people", bulkHidden: true,
      pastTense: "let in for 10 minutes",
      confirm: ({ ids }) => ({ title: "Turn off " + nameOf(ids) + "’s second step for 10 minutes?",
        body: "Their next sign-in in the next 10 minutes skips it, once. If their step screen is open now, it opens by itself. They are then asked to set a new step, without the old one. The account is less safe for those minutes, so only do this with the person in front of you. They are emailed, and it is recorded in the audit log.",
        cta: "Turn it off for 10 minutes" }),
      run: ids => NGGApi.admin.mfa.act("bypass", people(ids)) },
    { id: "code", label: "Give a one-time code", rowLabel: "Give them a one-time code (10 minutes)", cap: "people", bulkHidden: true,
      pastTense: "given a one-time code",
      confirm: ({ ids }) => ({ title: "Make a one-time code for " + nameOf(ids) + "?",
        body: "For someone who is not at the desk: you read the code to them, and they type it on their step screen. It works once, for 10 minutes, and is shown to you only now. They are emailed that a code was made.",
        cta: "Make the code" }),
      run: async ids => {
        const r = await NGGApi.admin.mfa.act("code", people(ids));
        const x = ((r && r.results) || [])[0];
        if (x && x.code) setIssued({ name: nameOf(ids), code: x.code, expires: x.expires });
        return r;
      } },
    { id: "reset", label: "Reset", rowLabel: "Reset — they choose a new one", cap: "people", danger: true, pastTense: "reset",
      confirm: ({ count }) => ({ title: "Reset the second step for " + count + (count === 1 ? " person" : " people") + "?",
        body: "What they set is cleared. Where it is required they choose a new one at their next sign-in; otherwise they are reminded.", cta: "Reset" }),
      run: ids => NGGApi.admin.mfa.act("reset", people(ids)) },
    { id: "require", label: "Require it", rowLabel: "Require it of this person", cap: "people", pastTense: "now required",
      confirm: ({ count }) => ({ title: "Require a second step of " + count + (count === 1 ? " person" : " people") + "?", body: "Whatever the policy says, they will set one up at their next sign-in.", cta: "Require it" }),
      run: ids => NGGApi.admin.mfa.act("require", people(ids)) },
    { id: "unrequire", label: "Back to the policy", rowLabel: "Stop requiring it (use the policy)", cap: "people", pastTense: "back to the policy",
      confirm: false, run: ids => NGGApi.admin.mfa.act("unrequire", people(ids)) },
    { id: "remind", label: "Email a reminder", rowLabel: "Email them a reminder to set it up", cap: "people", pastTense: "reminded",
      confirm: ({ count }) => ({ title: "Email " + count + (count === 1 ? " person" : " people") + " a reminder?", body: "Only people with no second step and an email on file are sent one, at most once every 3 days.", cta: "Send" }),
      run: ids => NGGApi.admin.mfa.act("remind", people(ids)) },
  ].map(a => Object.assign(a, { reload: load }));

  const savePolicy = async () => {
    setSavingPolicy(true);
    try { const r = await NGGApi.admin.mfa.policy(policy, methods); setPolicy(r.policy); if (r.methods) setMethods(r.methods); toast.success(r.unchanged ? "Nothing changed." : "The new policy applies from each person's next sign-in.", "Sign-in policy"); load(); }
    catch (e) { toast.error(humanizeError(e.message, e.code), "Policy not saved"); }
    finally { setSavingPolicy(false); }
  };

  const counts = (d && d.counts) || {};
  const total = (d && d.total) || 0;
  const kindLabel = (MFA_DESK_KINDS.find(k => k[0] === kind) || [])[1] || "";

  return (
    <div className="admin-section mfa-desk">
      <div className="admin-section-head">
        <h2 className="admin-h2">Sign-in security</h2>
        <div className="admin-section-actions"><button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>Refresh</button></div>
      </div>
      <p className="admin-hint mfa-desk-lede">
        A second sign-in step, different for each kind of person. Somebody who has lost theirs (a forgotten answer, a new phone) can be let in for ten minutes
        from a row’s menu, with them in front of you, or given a one-time code to type. Either way they then set a new step. Staff use the Control Room’s own authenticator, managed in Access &amp; roles.
      </p>

      <div className="mfa-desk-kinds" role="group" aria-label="Who to show">
        {MFA_DESK_KINDS.map(([k, label, how]) => {
          const c = counts[k] || { total: 0, enrolled: 0 };
          const pct = c.total ? Math.round(c.enrolled / c.total * 100) : 0;
          return (
            <button key={k} type="button" className={"mfa-desk-kind" + (kind === k ? " is-on" : "")} aria-pressed={kind === k}
              onClick={() => { setKind(k); setOffset(0); sel.clear(); }}>
              <span className="mfa-desk-kind-l">{label}</span>
              <span className="mono mfa-desk-kind-n">{fmtNum(c.enrolled)} / {fmtNum(c.total)} <span>· {pct}%</span></span>
              <span className="mfa-desk-kind-how">{how}</span>
              {policy && <span className={"chip mfa-desk-pol is-" + policy[k]}>{policy[k]}</span>}
            </button>
          );
        })}
      </div>

      {d && d.canPolicy && policy && (
        <details className="admin-panel mfa-desk-policy">
          <summary>Policy per kind of person</summary>
          <div className="mfa-desk-policy-grid">
            {MFA_DESK_KINDS.map(([k, label]) => (
              <div key={k} className="mfa-desk-policy-kind">
                <label className="mfa-desk-policy-row">
                  <span>{label}</span>
                  <select className="admin-select" value={policy[k]} onChange={e => setPolicy(Object.assign({}, policy, { [k]: e.target.value }))}>
                    {MFA_DESK_POLICY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                {methods && d.methods && d.methods[k] && (
                  <fieldset className="mfa-desk-methods">
                    <legend>Ways they may choose</legend>
                    {d.methods[k].map(m => {
                      const on = (methods[k] || []).indexOf(m.id) !== -1;
                      const last = on && (methods[k] || []).length === 1;
                      return (
                        <label key={m.id} className="mfa-desk-method">
                          <input type="checkbox" checked={on} disabled={last} title={last ? "Leave at least one way" : undefined}
                            onChange={e => setMethods(Object.assign({}, methods, { [k]: e.target.checked ? (methods[k] || []).concat(m.id) : (methods[k] || []).filter(x => x !== m.id) }))}/>
                          <span>{MFA_DESK_TYPE[m.id] || m.label}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}
              </div>
            ))}
          </div>
          <p className="admin-hint">Required: anyone without one sets it up before their portal opens. Optional: they are shown an alert until they do.
            Taking a way away stops new set-ups with it; people already using it keep it until they change. Everyone also gets eight one-time backup codes.</p>
          <button type="button" className="cr-btn is-sm is-primary" disabled={savingPolicy} onClick={savePolicy}>{savingPolicy ? "Saving…" : "Save the policy"}</button>
        </details>
      )}

      <form className="admin-filters mfa-desk-filters" role="search" onSubmit={e => { e.preventDefault(); setOffset(0); setQuery(q.trim()); }}>
        <input className="admin-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or ID" aria-label={"Search " + kindLabel}/>
        <select className="admin-select" value={state} onChange={e => { setState(e.target.value); setOffset(0); }} aria-label="Show">
          <option value="all">Everyone</option>
          <option value="none">No second step yet</option>
          <option value="enrolled">Has one</option>
        </select>
        <button type="submit" className="btn btn-ghost btn-sm">Search</button>
        <span className="mono admin-count" role="status" aria-live="polite">{d ? fmtNum(total) + " " + (total === 1 ? "person" : "people") : ""}</span>
      </form>

      {issued && (
        <section className="admin-panel mfa-desk-code" role="status" aria-live="polite" aria-label="One-time code">
          <div className="mfa-desk-code-txt">
            <b>One-time code for {issued.name}</b>
            <span>Read it to them. It works once, until {mfaDeskTime(issued.expires)}, and is not shown again.</span>
          </div>
          <span className="mono mfa-desk-code-v">{issued.code}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIssued(null)}>Done</button>
        </section>
      )}
      <AdminBulkBar selection={sel} noun="person" hasCap={hasCap} actions={ACTIONS.filter(a => !a.bulkHidden)}/>

      {err ? <ErrorState code={err} onRetry={load}/>
        : !d ? <div className="dash-spinner" role="status" aria-label="Loading"/>
        : rows.length === 0 ? <EmptyState title={query ? "Nobody matches that search" : "Nobody here yet"} message={state === "none" ? "Everybody in this list has a second step." : "Try another filter."}/>
        : (
          <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr>
              <th scope="col" className="admin-cell-check"><AdminSelectAll selection={sel} label={"Select all " + kindLabel.toLowerCase() + " on this page"}/></th>
              <th scope="col">Name</th><th scope="col">Centre</th><th scope="col">Second step</th><th scope="col">Status</th><th scope="col"><span className="cr-sr">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const k = keyOf(r);
                return (
                  <tr key={k}>
                    <td className="admin-cell-check"><AdminRowCheck selection={sel} id={k} label={"Select " + (r.name || r.id)}/></td>
                    <td className="admin-cell-name">{r.name || "—"}<span className="mono acct-row-meta">{r.id}{r.email ? " · " + r.email : ""}</span></td>
                    <td>{r.centre || "—"}</td>
                    <td>{r.type ? <>{MFA_DESK_TYPE[r.type] || r.type}{r.since ? <span className="mono acct-row-meta">since {String(r.since).slice(0, 10)}</span> : null}</> : <span className="mfa-desk-none">None</span>}</td>
                    <td className="mfa-desk-flags">
                      {r.required && <span className="chip">Required</span>}
                      {r.bypassUntil > 0 && <span className="chip chip-lime">Second step off until {mfaDeskTime(r.bypassUntil)}</span>}
                      {!r.required && !r.bypassUntil && <span className="mfa-desk-dash" aria-hidden="true">—</span>}
                    </td>
                    <td><AdminRowActions id={k} actions={ACTIONS} hasCap={hasCap} noun="person" reload={load} label="Actions"/></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      {d && total > MFA_DESK_PAGE && (
        <div className="admin-pager">
          <button type="button" className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - MFA_DESK_PAGE))}>Previous</button>
          <span className="mono">{offset + 1}–{Math.min(total, offset + MFA_DESK_PAGE)} of {fmtNum(total)}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={offset + MFA_DESK_PAGE >= total} onClick={() => setOffset(offset + MFA_DESK_PAGE)}>Next</button>
        </div>
      )}
    </div>
  );
}

Object.assign(CR_TAB_DEFS, {
  security: crPanel(() => <AdminSignInSecurity/>),
});
