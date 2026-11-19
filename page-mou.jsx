/* ============================================================================
   The Membership Agreement — the family's page (/mou/<token>), domain/mou.php.

   Four short steps on a phone, never a wall of text:
     1. Read      each clause as a card: the "In short" line first, the exact
                  words one tap away. Nothing is forced open; the check is
                  what proves the important parts landed.
     2. Check     five questions. A tap answers; a right answer says so, a
                  wrong one shows what the agreement says and lets them try
                  again — no score, no lock-out, no timer.
     3. Details   what the paper form asked, filled in from the application,
                  to confirm or correct; the off-site activities choice.
     4. Sign      typed full name + a signature (drawn, or made from the typed
                  name for anyone who cannot draw — nothing requires a drag);
                  a witness now on the same screen, or NGG witnesses at the
                  centre.
   Loaded with the signed-in bundle (build.js MORE), so a public visitor never
   downloads it. The server re-checks every answer and field.
   ========================================================================== */

const MOU_STEPS = [["read", "Read"], ["check", "Check"], ["details", "Details"], ["sign", "Sign"]];

/** The typed name drawn as a signature, for anyone who cannot draw one. */
function mouTypedSignature(name) {
  const c = document.createElement("canvas"); c.width = 640; c.height = 200;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 640, 200);
  g.fillStyle = "#11131a"; g.textBaseline = "middle";
  let size = 72; const face = px => "italic " + px + "px 'Caveat Brush', 'Caveat', 'Segoe Script', 'Brush Script MT', cursive";
  g.font = face(size); while (g.measureText(name).width > 590 && size > 28) { size -= 4; g.font = face(size); }
  g.fillText(name, 24, 100);
  g.strokeStyle = "#11131a"; g.lineWidth = 2; g.beginPath(); g.moveTo(24, 150); g.lineTo(Math.min(616, 40 + g.measureText(name).width), 150); g.stroke();
  return c.toDataURL("image/png");
}

function mouTokenFromPath() {
  const parts = (window.location.pathname || "").replace(/^\/+|\/+$/g, "").split("/");
  return parts[0] === "mou" ? (parts[1] || "") : "";
}

function MouPage({ setPage }) {
  const token = React.useMemo(mouTokenFromPath, []);
  const [d, setD] = React.useState(null);            // the agreement as the server has it
  const [err, setErr] = React.useState("");
  const [step, setStep] = React.useState(0);
  const [ans, setAns] = React.useState({});          // question id -> chosen option
  const [tries, setTries] = React.useState(0);
  const [fam, setFam] = React.useState({});
  const [mem, setMem] = React.useState({});
  const [trips, setTrips] = React.useState("");
  const [signer, setSigner] = React.useState({ name: "", rel: "", sig: "", agree: false });
  const [wit, setWit] = React.useState({ mode: "", name: "", phone: "", sig: "" });
  const [busy, setBusy] = React.useState(false);
  const [sendErr, setSendErr] = React.useState(null);  // {text, field}
  const [done, setDone] = React.useState(null);
  const topRef = React.useRef(null);

  const load = React.useCallback(() => {
    setErr(""); setD(null);
    NGGApi.public.mou(token).then(r => {
      setD(r);
      setFam(Object.assign({}, (r.prefill || {}).family || {}));
      setMem(Object.assign({}, (r.prefill || {}).member || {}));
    }).catch(e => setErr((e && e.data && e.data.message) || (e && e.status === 404 ? "This link is not valid any more. Ask NGG to send a new one: next@afrovanguard.org.ng." : "We couldn’t open the agreement. Check your connection and try again.")));
  }, [token]);
  React.useEffect(load, [load]);
  const go = i => { setStep(i); setSendErr(null); try { (topRef.current || document.body).scrollIntoView({ behavior: "smooth", block: "start" }); } catch (_) {} };

  if (err) return <MouShell><div className="mou-card mou-err" role="alert"><h1 className="mou-h1">We couldn’t open this</h1><p>{err}</p>
    <button type="button" className="mou-btn" onClick={load}>Try again</button></div></MouShell>;
  if (!d) return <MouShell><div className="mou-card" aria-busy="true"><div className="dash-spinner"/><p className="mou-quiet">Opening the agreement…</p></div></MouShell>;

  const first = (d.member || {}).first || "your child";
  if (done || d.status !== "awaiting_family") return <MouShell><MouDone d={d} done={done} first={first} token={token}/></MouShell>;

  const quiz = d.quiz || [];
  const right = quiz.filter(q => ans[q.id] === q.a).length;
  const allRight = right === quiz.length;
  const clauseOf = id => (d.sections || []).find(s => s.id === id) || {};
  const pick = (q, i) => { setAns(a => Object.assign({}, a, { [q.id]: i })); if (i !== q.a) setTries(t => t + 1); };

  const witnessReady = wit.mode === "ngg" || (wit.mode === "now" && wit.name.trim().split(/\s+/).length > 1 && wit.phone.trim() && wit.sig);
  const canSign = signer.name.trim().split(/\s+/).length > 1 && signer.rel && signer.sig && signer.agree && witnessReady && !busy;

  async function sign() {
    setBusy(true); setSendErr(null);
    try {
      const r = await NGGApi.public.mouSign({ token, answers: ans, attempts: tries + 1, family: fam, member: mem, trips,
        clientName: signer.name.trim(), clientRel: signer.rel, clientSignature: signer.sig, agree: signer.agree,
        witness: wit.mode === "now" ? { name: wit.name.trim(), phone: wit.phone.trim(), signature: wit.sig } : null });
      setDone(r);
    } catch (e) {
      const dd = (e && e.data) || {}, f = dd.field || "";
      const text = dd.message || "We couldn’t save your signature. Check your connection and try again — nothing was lost.";
      setSendErr({ text, field: f });
      if (f === "quiz") go(1); else if (["fatherName", "address", "phone", "email", "school", "trips"].includes(f)) go(2);
    } finally { setBusy(false); }
  }

  return (
    <MouShell>
      <div ref={topRef}/>
      <header className="mou-head">
        <span className="mou-eyebrow">Membership Agreement · {d.member.fullName}</span>
        <h1 className="mou-h1">{step === 0 ? "Read the agreement" : step === 1 ? "Five quick questions" : step === 2 ? "Check the details" : "Sign"}</h1>
        <p className="mou-lead">{step === 0 ? "Each part has a short summary first. Tap “Read the exact words” to see the full wording."
          : step === 1 ? "To make sure the important parts are clear. Tap an answer — you can try again as often as you like."
          : step === 2 ? "Filled in from the application. Correct anything that is wrong."
          : "Type your name and sign. A copy is emailed to you straight away."}</p>
        <ol className="mou-steps" aria-label="Steps">
          {MOU_STEPS.map(([k, l], i) => <li key={k} className={i === step ? "is-on" : i < step ? "is-done" : ""} aria-current={i === step ? "step" : undefined}>
            <span className="mou-step-n" aria-hidden="true">{i < step ? "✓" : i + 1}</span>{l}</li>)}
        </ol>
      </header>

      {step === 0 && <>
        <p className="mou-parties">Between <b>{d.org}</b> and you, the parent or guardian, for <b>{d.member.fullName}</b>{d.member.centre ? " (" + d.member.centre + ")" : ""}.</p>
        {d.scholarship && <section className="mou-award" aria-labelledby="mou-award-h">
          <span className="mou-eyebrow" id="mou-award-h">NGG Scholarship</span>
          <b className="mou-award-v">{d.scholarship.value}</b>
          <p>{d.member.first}’s place is a scholarship for three years of training and service, funded by NGG. Your contribution is {d.scholarship.family} (clause 6).</p>
        </section>}
        <div className="mou-clauses">{(d.sections || []).map((s, i) => <MouClause key={s.id} n={i + 1} s={s}/>)}</div>
        <div className="mou-actions"><button type="button" className="mou-btn" onClick={() => go(1)}>I’ve read it — check my understanding</button></div>
      </>}

      {step === 1 && <>
        <div className="mou-quiz">
          {quiz.map((q, qi) => {
            const chosen = ans[q.id], ok = chosen === q.a, wrong = chosen != null && !ok;
            return (
              <fieldset key={q.id} className={"mou-q" + (ok ? " is-right" : wrong ? " is-wrong" : "")}>
                <legend><span className="mou-q-n">{qi + 1}</span>{q.q}</legend>
                <div className="mou-opts" role="radiogroup" aria-label={q.q}>
                  {q.o.map((o, i) => <button key={i} type="button" role="radio" aria-checked={chosen === i} className={"mou-opt" + (chosen === i ? (i === q.a ? " is-right" : " is-wrong") : "")}
                    onClick={() => pick(q, i)} disabled={ok}>{o}</button>)}
                </div>
                <div className="mou-feedback" aria-live="polite">
                  {ok && <span className="mou-ok">Right.</span>}
                  {wrong && <span className="mou-why"><b>Not quite.</b> The agreement says: {clauseOf(q.clause).short} <em>Try again.</em></span>}
                </div>
              </fieldset>
            );
          })}
        </div>
        {sendErr && sendErr.field === "quiz" && <p className="mou-error" role="alert">{sendErr.text}</p>}
        <div className="mou-actions">
          <button type="button" className="mou-btn mou-btn--ghost" onClick={() => go(0)}>Back to the agreement</button>
          <button type="button" className="mou-btn" disabled={!allRight} onClick={() => go(2)}>{allRight ? "Continue" : right + " of " + quiz.length + " answered"}</button>
        </div>
      </>}

      {step === 2 && <>
        <section className="mou-card">
          <h2 className="mou-h2">The family</h2>
          <div className="mou-grid">
            <MouField label="Father’s name" v={fam.fatherName} on={x => setFam(Object.assign({}, fam, { fatherName: x }))} auto="name"/>
            <MouField label="Mother’s name" v={fam.motherName} on={x => setFam(Object.assign({}, fam, { motherName: x }))} auto="name"/>
            <MouField label="Guardian’s name (if not a parent)" v={fam.guardianName} on={x => setFam(Object.assign({}, fam, { guardianName: x }))} auto="name"/>
            <MouField label="Home address" v={fam.address} on={x => setFam(Object.assign({}, fam, { address: x }))} auto="street-address" wide bad={sendErr && sendErr.field === "address"}/>
            <MouField label="Phone" v={fam.phone} on={x => setFam(Object.assign({}, fam, { phone: x }))} type="tel" auto="tel" bad={sendErr && sendErr.field === "phone"}/>
            <MouField label="Email (your copy goes here)" v={fam.email} on={x => setFam(Object.assign({}, fam, { email: x }))} type="email" auto="email" bad={sendErr && sendErr.field === "email"}/>
          </div>
        </section>
        <section className="mou-card">
          <h2 className="mou-h2">{d.member.fullName}</h2>
          <div className="mou-grid">
            <MouField label="Address (if different)" v={mem.address} on={x => setMem(Object.assign({}, mem, { address: x }))} wide/>
            <MouField label="Phone (optional)" v={mem.phone} on={x => setMem(Object.assign({}, mem, { phone: x }))} type="tel"/>
            <MouField label="Age" v={mem.age} on={x => setMem(Object.assign({}, mem, { age: x.replace(/\D/g, "").slice(0, 2) }))} im="numeric"/>
            <MouField label="School" v={mem.school} on={x => setMem(Object.assign({}, mem, { school: x }))} bad={sendErr && sendErr.field === "school"}/>
            <MouField label="Class" v={mem.class} on={x => setMem(Object.assign({}, mem, { class: x }))}/>
            <MouField label="Department / course" v={mem.department} on={x => setMem(Object.assign({}, mem, { department: x }))}/>
          </div>
        </section>
        <section className="mou-card">
          <h2 className="mou-h2">Consents</h2>
          <p className="mou-quiet">By signing you give the consents in clause 8: taking part, emergency medical care, keeping records, updates to you, photos and videos (first names only), and the website. One is your choice:</p>
          <div className="mou-choice" role="radiogroup" aria-label="Off-site activities and trips">
            <span className="mou-choice-l">May {first} go on off-site activities and trips with NGG staff?</span>
            {[["granted", "Yes"], ["declined", "No"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={trips === k} className={"mou-pill" + (trips === k ? " is-on" : "")} onClick={() => setTrips(k)}>{l}</button>)}
          </div>
        </section>
        {sendErr && sendErr.field !== "quiz" && <p className="mou-error" role="alert">{sendErr.text}</p>}
        <div className="mou-actions">
          <button type="button" className="mou-btn mou-btn--ghost" onClick={() => go(1)}>Back</button>
          <button type="button" className="mou-btn" disabled={!trips || !(fam.fatherName || fam.motherName || fam.guardianName) || !fam.address || !fam.phone || !fam.email || !mem.school} onClick={() => go(3)}>Continue to sign</button>
        </div>
      </>}

      {step === 3 && <>
        <section className="mou-card">
          <h2 className="mou-h2">You, the parent or guardian</h2>
          <div className="mou-grid">
            <MouField label="Your full name" v={signer.name} on={x => setSigner(Object.assign({}, signer, { name: x }))} auto="name" bad={sendErr && sendErr.field === "clientName"}/>
            <label className="mou-field"><span>You are the child’s</span>
              <select value={signer.rel} onChange={e => setSigner(Object.assign({}, signer, { rel: e.target.value }))}><option value="">Choose…</option><option>Father</option><option>Mother</option><option>Guardian</option></select></label>
          </div>
          <MouSign value={signer.sig} onChange={sig => setSigner(Object.assign({}, signer, { sig }))} name={signer.name} label="Your signature"/>
          <label className="mou-agree"><input type="checkbox" checked={signer.agree} onChange={e => setSigner(Object.assign({}, signer, { agree: e.target.checked }))}/>
            <span>I have read the Membership Agreement for {d.member.fullName}, understand it, and agree to it.</span></label>
        </section>
        <section className="mou-card">
          <h2 className="mou-h2">A witness</h2>
          <div className="mou-choice" role="radiogroup" aria-label="Who witnesses your signature">
            {[["now", "Another adult is with me now"], ["ngg", "NGG will witness it at the centre"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={wit.mode === k} className={"mou-pill" + (wit.mode === k ? " is-on" : "")} onClick={() => setWit(Object.assign({}, wit, { mode: k }))}>{l}</button>)}
          </div>
          {wit.mode === "now" && <>
            <div className="mou-grid">
              <MouField label="Witness’s full name" v={wit.name} on={x => setWit(Object.assign({}, wit, { name: x }))} bad={sendErr && sendErr.field === "witnessName"}/>
              <MouField label="Witness’s phone" v={wit.phone} on={x => setWit(Object.assign({}, wit, { phone: x }))} type="tel" bad={sendErr && sendErr.field === "witnessPhone"}/>
            </div>
            <MouSign value={wit.sig} onChange={sig => setWit(Object.assign({}, wit, { sig }))} name={wit.name} label="Witness’s signature"/>
          </>}
          {wit.mode === "ngg" && <p className="mou-quiet">Fine — NGG’s representative witnesses your signature when they countersign.</p>}
        </section>
        {sendErr && <p className="mou-error" role="alert">{sendErr.text}</p>}
        <div className="mou-actions">
          <button type="button" className="mou-btn mou-btn--ghost" onClick={() => go(2)}>Back</button>
          <button type="button" className="mou-btn" disabled={!canSign} onClick={sign}>{busy ? "Signing…" : "Sign the agreement"}</button>
        </div>
      </>}
    </MouShell>
  );
}

function MouShell({ children }) {
  return <main className="mou" id="main"><div className="mou-wrap">
    <div className="mou-brand"><img src="/assets/logo.png" alt="" width="36" height="36"/><span><b>Next Generation Genius</b><small>Okun Alimosho · Afrovanguard</small></span></div>
    {children}
    <p className="mou-foot">Questions? <a href="mailto:next@afrovanguard.org.ng">next@afrovanguard.org.ng</a> · +234 903 777 6318</p>
  </div></main>;
}

function MouClause({ n, s }) {
  const [open, setOpen] = React.useState(false);
  const id = "mou-c-" + s.id;
  return (
    <article className="mou-clause">
      <h2 className="mou-clause-t"><span className="mou-clause-n">{String(n).padStart(2, "0")}</span>{s.title}</h2>
      <p className="mou-short">{s.short}</p>
      <button type="button" className="mou-link" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Hide the exact words" : "Read the exact words"}</button>
      {open && <div className="mou-body" id={id}>{s.body.map((b, i) => <p key={i}>{b}</p>)}</div>}
    </article>
  );
}

function MouField({ label, v, on, type, auto, im, wide, bad }) {
  return <label className={"mou-field" + (wide ? " is-wide" : "") + (bad ? " is-bad" : "")}><span>{label}</span>
    <input type={type || "text"} value={v || ""} onChange={e => on(e.target.value)} autoComplete={auto || "off"} inputMode={im} aria-invalid={bad ? "true" : undefined}/></label>;
}

/** Draw, or use the typed name — nobody needs to drag to sign. */
function MouSign({ value, onChange, name, label }) {
  const [typed, setTyped] = React.useState(false);
  const ok = String(name || "").trim().split(/\s+/).length > 1;
  return (
    <div className="mou-sign">
      {typed ? <div className="mou-sign-typed"><span className="mou-field-l">{label}</span>{value ? <img src={value} alt={"Signature: " + name}/> : null}</div>
             : <SignaturePad value={value} onChange={onChange} height={150} label={label}/>}
      <button type="button" className="mou-link" disabled={!typed && !ok} onClick={() => { if (typed) { setTyped(false); onChange(""); } else { setTyped(true); onChange(mouTypedSignature(String(name).trim())); } }}>
        {typed ? "Draw it instead" : ok ? "Can’t draw? Sign with the typed name" : "Type the full name above to sign with it instead"}
      </button>
    </div>
  );
}

function MouDone({ d, done, first, token }) {
  const st = done ? done.status : d.status, p = (done && done.parties) || d.parties || {};
  const paper = d.paper || null;
  const row = (l, x, sub) => <li className={x ? "is-done" : ""}><span className="mou-step-n" aria-hidden="true">{x ? "✓" : "·"}</span><span><b>{l}</b><small>{x ? (x.name + (sub ? " · " + sub : "")) : "Waiting"}</small></span></li>;
  const centre = (d.member && d.member.centre) || "the centre";
  return (
    <div className="mou-card mou-done">
      <span className="mou-eyebrow">Membership Agreement · {d.member.fullName}</span>
      <h1 className="mou-h1">{st === "signed" && paper ? "Signed by everyone" : done ? "Thank you — now print it and sign in ink" : paper ? "Received at the centre" : "Signed online — now the paper copy"}</h1>
      <p className="mou-lead">{done && done.copyTo && done.copyTo.length ? "Your copy is on its way to " + done.copyTo.join(", ") + ". " : ""}
        {paper ? "NGG has your signed paper copy. " + (st === "signed" ? "The agreement is complete." : "NGG’s representative countersigns next, and you’ll get the completed copy by email.")
          : "One more step: print the agreement, sign it in ink with a witness, and bring it to " + centre + ". NGG checks it there and keeps a photograph of the signed page."}</p>
      {!paper && <ol className="mou-next" aria-label="What to do next">
        <li><b>Print it.</b> No printer? Ask at {centre} and NGG prints it for you.</li>
        <li><b>Sign in ink</b> on the last page, with the date. Another adult signs as your witness and prints their name.</li>
        <li><b>Bring it to {centre}</b> on a meeting day. Every page must be there.</li>
      </ol>}
      {!paper && token && <a className="mou-btn" href={NGGApi.public.mouPrintUrl(token)} target="_blank" rel="noopener">Print the agreement to sign</a>}
      <ol className="mou-parties-list">
        {row("Parent or guardian", p.family, p.family && p.family.relation)}
        {row("Witness", p.witness)}
        <li className={paper ? "is-done" : ""}><span className="mou-step-n" aria-hidden="true">{paper ? "✓" : "·"}</span><span><b>Paper copy at the centre</b><small>{paper ? "Received " + String(paper.at || "").slice(0, 10) + (paper.centre ? " · " + paper.centre : "") : "Waiting"}</small></span></li>
        {row("For NGG", p.ngg, p.ngg && p.ngg.role)}
      </ol>
      {done && done.docUrl && <a className="mou-btn-quiet" href={done.docUrl} target="_blank" rel="noopener">Open my copy (PDF)</a>}
      <p className="mou-quiet">{first} starts lectures on the day every entry step is done. Welcome to Next Generation Genius.</p>
    </div>
  );
}

Object.assign(window, { MouPage });
