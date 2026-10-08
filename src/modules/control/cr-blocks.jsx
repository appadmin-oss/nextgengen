/* ============================================================================
   Control Room v2 — the blocks (CONTROL_ROOM.md §3). Each is built once, in a
   desktop and a phone variant; a page is a list of block configs, never a
   bespoke screen. `ctx` is the shell: toast, confirm, form, drawer, go, and
   the registries for queue keys and unsaved edits.
   ========================================================================== */

function CrBlock({ b, ctx, phone, span }) {
  const Body = CR_BLOCKS[b.type];
  if (!Body) return null;
  const head = b.title ? (
    phone ? (
      <div className="cr-bhead"><h2>{b.title}</h2>{b.action && <button type="button" className="cr-linkbtn" style={{ fontSize: 14, minHeight: 44 }} onClick={b.onAction}>{b.action}</button>}</div>
    ) : (
      <div className="cr-bhead">
        <div className="cr-bhead-l"><h2>{b.title}</h2>{b.sub && <span className="cr-bhead-sub">{b.sub}</span>}</div>
        {b.action && <button type="button" className="cr-linkbtn" onClick={b.onAction}>{b.action}<CrIcon n="caret-right"/></button>}
      </div>
    )
  ) : null;
  return (
    <section className={phone ? "cr-pblock" : "cr-block"} style={phone ? undefined : { gridColumn: "span " + span }} aria-label={b.title || undefined}>
      {head}
      <Body b={b} ctx={ctx} phone={phone}/>
    </section>
  );
}

/* ── kpis ── */
function CrKpis({ b, phone }) {
  const d = k => k.d ? (
    <span className={"cr-kpi-d" + (k.tone === "up" ? " is-up" : k.tone === "down" ? " is-down" : "")}>
      {!phone && <CrIcon n={k.tone === "up" ? "arrow-up-right" : k.tone === "down" ? "arrow-down-right" : "minus"}/>}{k.d}
    </span>
  ) : null;
  if (phone) return (
    <div className="cr-pkpis">
      {b.items.map((k, i) => <div key={i} className="cr-pkpi"><span>{k.l}</span><b>{k.v}</b>{k.d ? <span className={"cr-kpi-d" + (k.tone === "up" ? " is-up" : k.tone === "down" ? " is-down" : "")}>{k.d} <em>{k.dn}</em></span> : k.dn ? <span className="cr-hint">{k.dn}</span> : null}</div>)}
    </div>
  );
  return (
    <div className="cr-kpis">
      {b.items.map((k, i) => <div key={i} className="cr-kpi"><span className="cr-kpi-l">{k.l}</span><span className="cr-kpi-v">{k.v}</span><span className="cr-kpi-n">{d(k)}{k.dn}</span></div>)}
    </div>
  );
}

/* ── attention: oldest first, only rows with something in them ── */
function CrAttention({ b, ctx, phone }) {
  const rows = b.rows.filter(r => r.n > 0).slice().sort((a, z) => (z.age || 0) - (a.age || 0));
  const go = r => r.onClick ? r.onClick() : r.go && ctx.go(r.go[0], r.go[1]);
  if (!rows.length) return <div className={phone ? "cr-pbox" : "cr-box"}><div className="cr-tempty">{b.empty || "Nothing needs you right now."}</div></div>;
  if (phone) return (
    <div className="cr-pbox">
      {rows.map((r, i) => (
        <button key={i} type="button" className="cr-prow" onClick={() => go(r)}>
          <span className={"cr-att-n cr-t-" + crTone(r.tone)}>{crNum(r.n)}</span>
          <span className="cr-prow-t"><b style={{ whiteSpace: "normal" }}>{r.l}</b><span style={{ whiteSpace: "normal" }}>{r.s}</span></span>
          <CrIcon n="caret-right"/>
        </button>
      ))}
    </div>
  );
  return (
    <div className="cr-box cr-att">
      {rows.map((r, i) => (
        <button key={i} type="button" className="cr-att-row" onClick={() => go(r)}>
          <span className={"cr-att-n cr-t-" + crTone(r.tone)}>{crNum(r.n)}</span>
          <span className="cr-att-text"><b>{r.l}</b><span>{r.s}</span></span>
          <span className="cr-att-go">Review<CrIcon n="arrow-right"/></span>
        </button>
      ))}
    </div>
  );
}

/* ── status ── */
function CrStatus({ b, ctx, phone }) {
  const fine = b.tone === "ok";
  const sum = <div className={"cr-status-sum cr-t-" + crTone(b.tone) + (fine ? " is-fine" : "")}><CrIcon n={fine ? "check" : "warning"}/>{fine ? "Everything is working" : b.summary + " needs attention"}</div>;
  const rows = b.items.map((s, i) => <div key={i} className={"cr-status-row cr-t-" + crTone(s[2])}><span className="cr-status-dot"/><span className="cr-grow">{s[0]}</span><span className="cr-status-state">{s[1]}</span></div>);
  if (phone) return <div className="cr-pbox cr-pstatus">{sum}{rows}</div>;
  return (
    <div className="cr-box cr-status">
      {sum}
      <div className="cr-status-rows">{rows}</div>
      {b.cta && <button type="button" className="cr-btn" onClick={() => b.go ? ctx.go(b.go[0], b.go[1]) : b.onCta && b.onCta()}>{b.cta}</button>}
    </div>
  );
}

/* ── columns ── */
function CrColumns({ b, phone }) {
  const sc = crColumnsScale(b.bars.map(x => x.v), b.pct);
  const fmt = v => crNum(v) + (b.pct ? "%" : "");
  if (phone) return (
    <div className="cr-pbox cr-pcols">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="cr-big" style={{ fontSize: 22 }}>{b.big}</span><span className="cr-hint">{b.sub}</span></div>
      <div className="cr-pcols-plot" role="img" aria-label={(b.title || "Chart") + ": " + b.bars.map(x => (x.l || "") + " " + fmt(x.v)).join(", ")}>
        {b.bars.map((c, j) => <div key={j} className={"cr-cols-bar" + (j === b.bars.length - 1 ? " is-last" : "")} style={{ height: sc.h(c.v) + "%" }}/>)}
      </div>
    </div>
  );
  return (
    <div className="cr-box cr-cols">
      <span className="cr-big">{b.big}</span>
      <div className="cr-cols-grid">
        <div className="cr-cols-y" aria-hidden="true"><span>{sc.yTop}</span><span>{sc.yMid}</span><span>{sc.yZero}</span></div>
        <div className="cr-cols-plot" role="img" aria-label={(b.title || "Chart") + ": " + b.bars.map(x => (x.tip || x.l || "") + " " + fmt(x.v)).join(", ")}>
          <div className="cr-cols-guide" style={{ top: 0 }}/>
          <div className="cr-cols-guide" style={{ top: "50%" }}/>
          {b.bars.map((c, j) => <div key={j} title={(c.tip || c.l || "Day " + (j + 1)) + ": " + fmt(c.v)} className={"cr-cols-bar" + (j === b.bars.length - 1 ? " is-last" : "")} style={{ height: sc.h(c.v) + "%" }}/>)}
        </div>
        <span/>
        <div className="cr-cols-x" aria-hidden="true">{b.bars.map((c, j) => <span key={j}>{c.l}</span>)}</div>
      </div>
    </div>
  );
}

/* ── bars ── */
function CrBars({ b, phone }) {
  const mx = b.pct ? 100 : Math.max(1, ...b.rows.map(r => Number(r[1]) || 0));
  const rows = b.rows.map((r, j) => (
    <div key={j} className="cr-bar">
      <div className="cr-bar-top"><span>{r[0]}</span><b>{b.pct ? r[1] + "%" : crNum(r[1])}</b></div>
      <div className="cr-track"><div className={"cr-fill" + (j === 0 && !b.pct ? " is-first" : "")} style={{ width: Math.max(0, Math.min(100, (Number(r[1]) || 0) / mx * 100)) + "%" }}/></div>
    </div>
  ));
  if (!b.rows.length) return <div className={(phone ? "cr-pbox" : "cr-box") + " cr-tempty"}>{b.empty || "Nothing to show yet."}</div>;
  return <div className={phone ? "cr-pbox cr-pstatus" : "cr-box cr-bars"} style={phone ? { gap: 12 } : undefined}>{rows}</div>;
}

/* ── list ── */
function CrList({ b, phone }) {
  if (!b.rows.length) return <div className={(phone ? "cr-pbox" : "cr-box") + " cr-tempty"}>{b.empty || "Nothing here yet."}</div>;
  if (phone) return (
    <div className="cr-pbox">
      {b.rows.map((r, j) => {
        const Tag = r.onClick ? "button" : "div";
        return <Tag key={j} type={r.onClick ? "button" : undefined} className="cr-prow is-60" onClick={r.onClick}><span className="cr-list-ico"><CrIcon n={r.icon || "circle"}/></span><span className="cr-prow-t"><b>{r.t}</b><span>{[r.s, r.m].filter(Boolean).join(" · ")}</span></span></Tag>;
      })}
    </div>
  );
  return (
    <div className="cr-box cr-list">
      {b.rows.map((r, j) => {
        const Tag = r.onClick ? "button" : "div";
        return (
          <Tag key={j} type={r.onClick ? "button" : undefined} className="cr-list-row" onClick={r.onClick}>
            <span className="cr-list-ico"><CrIcon n={r.icon || "circle"}/></span>
            <span className="cr-list-text"><b>{r.t}</b>{r.s && <span>{r.s}</span>}</span>
            {r.m && <span className="cr-list-m">{r.m}</span>}
          </Tag>
        );
      })}
    </div>
  );
}

/* ── note ── */
function CrNote({ b, phone }) {
  const cls = "cr-note" + (b.tone ? " is-toned cr-t-" + crTone(b.tone) : "") + (b.quote ? " is-quote" : "");
  return (
    <div className={cls} style={phone ? { borderRadius: 16, padding: 14 } : undefined}>
      <CrIcon n={b.icon || "info"}/>
      <div className="cr-note-text">
        <span>{b.text}</span>
        {b.sub && <span className="cr-note-sub">{b.sub}</span>}
        {b.act && <button type="button" className="cr-btn is-sm cr-note-act" onClick={b.act.run}>{b.act.l}</button>}
      </div>
    </div>
  );
}

/* ── cards ── */
function CrCards({ b, phone }) {
  if (!b.cards.length) return <div className={(phone ? "cr-pbox" : "cr-box") + " cr-tempty"}>{b.empty || "Nothing here yet."}</div>;
  if (phone) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {b.cards.map((c, i) => {
        const Tag = c.onClick ? "button" : "div";
        return (
          <Tag key={i} type={c.onClick ? "button" : undefined} className="cr-pcard" onClick={c.onClick}>
            <span className="cr-card-ico"><CrIcon n={c.icon || "circle"}/></span>
            <div className="cr-grow" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><b style={{ fontSize: 15, fontWeight: 600 }}>{c.title}</b>{c.tag && <CrPill tone={c.tone} t={c.tag}/>}</div>
              <span className="cr-hint" style={{ fontSize: 13 }}>{c.sub}</span>
            </div>
          </Tag>
        );
      })}
    </div>
  );
  return (
    <div className="cr-cards">
      {b.cards.map((c, i) => {
        const Tag = c.onClick ? "button" : "div";
        return (
          <Tag key={i} type={c.onClick ? "button" : undefined} className="cr-card" onClick={c.onClick}>
            <div className="cr-card-top"><span className="cr-card-ico"><CrIcon n={c.icon || "circle"}/></span>{c.tag && <CrPill tone={c.tone} t={c.tag}/>}</div>
            <div className="cr-card-title"><b>{c.title}</b>{c.sub && <span>{c.sub}</span>}</div>
            {c.meta && c.meta.length > 0 && <div className="cr-card-meta">{c.meta.map((m, j) => <div key={j}><span>{m[0]}</span><b>{m[1]}</b></div>)}</div>}
          </Tag>
        );
      })}
    </div>
  );
}

/* ── form: edits are held here and reported up, so the unsaved bar is the shell's ── */
function CrFormBlock({ b, ctx, phone }) {
  /* Re-based on the stored VALUES, not on the block object: blocks() runs on
     every shell render — including the one the unsaved bar causes — so keying
     on `b` reset the form on the first keystroke. A reload that brings new
     values from the server still resets it. */
  const baseObj = {};
  b.groups.forEach(g => g.rows.forEach(r => { baseObj[r.id] = r.value; }));
  const baseSig = (b.key || "") + "\u0000" + JSON.stringify(baseObj);
  const base = React.useMemo(() => baseObj, [baseSig]);
  const [vals, setVals] = React.useState(base);
  const [errs, setErrs] = React.useState({});
  React.useEffect(() => { setVals(base); setErrs({}); }, [base]);
  const changed = Object.keys(base).filter(k => JSON.stringify(vals[k]) !== JSON.stringify(base[k]));
  const set = (id, v) => { setVals(s => Object.assign({}, s, { [id]: v })); setErrs(e => { const n = Object.assign({}, e); delete n[id]; return n; }); };
  const save = async () => {
    const fe = {};
    b.groups.forEach(g => g.rows.forEach(r => { if (r.check && changed.includes(r.id)) { const m = r.check(vals[r.id], vals); if (m) fe[r.id] = m; } }));
    if (Object.keys(fe).length) { setErrs(fe); ctx.toast("Fix the highlighted setting first", null, true); return false; }
    const patch = {};
    changed.forEach(k => { patch[k] = vals[k]; });
    try {
      await b.save(patch, vals);
      ctx.toast(changed.length + " change" + (changed.length === 1 ? "" : "s") + " saved");
      if (b.onSaved) b.onSaved();
      return true;
    } catch (e) { ctx.toast(crErr(e, "Couldn’t save. Your changes are still here."), null, true); return false; }
  };
  const key = b.key || "form";
  React.useEffect(() => {
    ctx.setDirty(key, changed.length ? { n: changed.length, save, discard: () => { setVals(base); setErrs({}); } } : null);
  });
  React.useEffect(() => () => ctx.setDirty(key, null), []);
  const control = r => {
    const v = vals[r.id];
    if (r.c === "toggle") return <CrSwitch on={!!v} onChange={x => set(r.id, x)} label={r.l} disabled={r.disabled}/>;
    if (r.c === "segmented") return <CrSeg label={r.l} value={v} options={r.opts} onChange={x => set(r.id, x)}/>;
    if (r.c === "select") return <select className="cr-select" aria-label={r.l} value={v == null ? "" : v} onChange={e => set(r.id, e.target.value)} disabled={r.disabled}>{r.opts.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>;
    if (r.c === "textarea") return <textarea className="cr-textarea" aria-label={r.l} rows={r.rows || 3} value={v == null ? "" : v} onChange={e => set(r.id, e.target.value)} maxLength={r.max} disabled={r.disabled}/>;
    return <input className="cr-input is-row" aria-label={r.l} type={r.type || "text"} inputMode={r.im} value={v == null ? "" : v} onChange={e => set(r.id, r.type === "number" ? e.target.value : e.target.value)} placeholder={r.ph} maxLength={r.max} disabled={r.disabled} aria-invalid={errs[r.id] ? true : undefined}/>;
  };
  const shown = v => {
    const r = v;
    const x = vals[r.id];
    if (r.c === "select" || r.c === "segmented") { const o = r.opts.find(o => o[0] === x); return o ? o[1] : ""; }
    return x == null || x === "" ? "Not set" : String(x);
  };
  /* On a phone, a field that is not a switch opens its own screen (§5). */
  const editPhone = r => ctx.form({
    title: r.l, submit: "Done",
    fields: [Object.assign({ id: "v", l: r.l, help: r.help }, r.c === "select" || r.c === "segmented" ? { type: "chips", opts: r.opts } : r.c === "textarea" ? { type: "textarea", max: r.max } : { type: r.type || "text", ph: r.ph, max: r.max })],
    values: { v: vals[r.id] },
    onSubmit: v => { set(r.id, v.v); },
  });
  if (phone) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {b.groups.map((g, gi) => (
        <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {g.h && <span className="cr-pfgroup-h">{g.h}</span>}
          <div className="cr-pbox">
            {g.rows.map(r => {
              const Tag = r.c === "toggle" ? "div" : "button";
              return (
                <Tag key={r.id} type={r.c === "toggle" ? undefined : "button"} className="cr-pfrow" style={r.c === "toggle" ? undefined : { width: "100%", border: 0, borderTop: "1px solid var(--cr-line-4)", background: "var(--cr-bg)", textAlign: "left" }} onClick={r.c === "toggle" ? undefined : () => editPhone(r)}>
                  <div className="cr-frow-l"><b>{r.l}</b>{(errs[r.id] || r.help) && <span className={errs[r.id] ? "cr-frow-err" : ""}>{errs[r.id] || r.help}</span>}</div>
                  {r.c === "toggle" ? control(r) : <><span className="cr-pfrow-v">{r.c === "select" || r.c === "input" ? shown(r) : ""}</span><CrIcon n="caret-right"/></>}
                </Tag>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div className="cr-form">
      {b.groups.map((g, gi) => (
        <div key={gi} className="cr-box cr-fgroup">
          {(g.h || g.help) && <div className="cr-fgroup-h">{g.h && <b>{g.h}</b>}{g.help && <span>{g.help}</span>}</div>}
          {g.rows.map(r => (
            <div key={r.id} className="cr-frow">
              <div className="cr-frow-l"><b>{r.l}</b>{r.help && <span>{r.help}</span>}{errs[r.id] && <span className="cr-frow-err"><CrIcon n="warning-circle"/>{errs[r.id]}</span>}</div>
              {control(r)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── compose ── */
function CrCompose({ b, ctx, phone }) {
  const [aud, setAud] = React.useState(() => new Set(b.defaultAud || [b.audiences[0] && b.audiences[0].id]));
  const [ch, setCh] = React.useState(() => new Set(b.defaultCh || b.channels.map(c => c.id)));
  const [subject, setSubject] = React.useState(b.subject || "");
  const [body, setBody] = React.useState(b.body || "");
  const [busy, setBusy] = React.useState(false);
  const flip = (set, setter, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };
  const count = b.count ? b.count([...aud]) : b.audiences.filter(a => aud.has(a.id)).reduce((n, a) => n + (a.n || 0), 0);
  const parts = crSmsParts(body);
  const sms = ch.has("sms");
  const cost = sms && b.smsCost != null ? fmtMoney(count * parts * b.smsCost) : "—";
  const send = async () => {
    if (!aud.size) return ctx.toast("Choose who gets it", null, true);
    if (!ch.size) return ctx.toast("Choose at least one way to send it", null, true);
    if (!body.trim()) return ctx.toast("Write the message first", null, true);
    const ok = await ctx.confirm({ title: "Send to " + crNum(count) + "?", body: "“" + (subject || body.slice(0, 60)) + "” goes out by " + b.channels.filter(c => ch.has(c.id)).map(c => c.l).join(" and ") + ". This can’t be recalled.", cta: "Send to " + crNum(count) });
    if (!ok) return;
    setBusy(true);
    try { const res = await b.send({ aud: [...aud], ch: [...ch], subject, body }); ctx.toast(res && res.text ? res.text : "Queued for " + crNum(count) + " people"); if (b.clearOnSend !== false) setBody(""); }
    catch (e) { ctx.toast(crErr(e, "Couldn’t send. The message is still here."), null, true); }
    finally { setBusy(false); }
  };
  const audChips = b.audiences.map(a => <button key={a.id} type="button" className="cr-chip" aria-pressed={aud.has(a.id)} onClick={() => flip(aud, setAud, a.id)}>{a.l}</button>);
  const chChips = b.channels.map(c => <button key={c.id} type="button" className="cr-chip" aria-pressed={ch.has(c.id)} onClick={() => flip(ch, setCh, c.id)}><CrIcon n={c.icon}/>{c.l}</button>);
  if (phone) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="cr-pchips" role="group" aria-label="Who gets it">{audChips}</div>
      <div className="cr-pchan" role="group" aria-label="How">{chChips}</div>
      {b.withSubject !== false && <label className="cr-field"><span className="cr-field-l" style={{ fontSize: 14 }}>Subject</span><input className="cr-input" style={{ height: 52, fontSize: 16, borderRadius: 14 }} value={subject} onChange={e => setSubject(e.target.value)}/></label>}
      <label className="cr-field"><span className="cr-field-l" style={{ fontSize: 14 }}>Message</span><textarea className="cr-ptext" rows={5} enterKeyHint="done" value={body} onChange={e => setBody(e.target.value)}/><span className="cr-hint" style={{ fontSize: 13 }}>{body.length} characters · {parts} SMS part{parts > 1 ? "s" : ""}</span></label>
      <button type="button" className="cr-pbig" disabled={busy} onClick={send}>Send to {crNum(count)}</button>
    </div>
  );
  return (
    <div className="cr-compose">
      <div className="cr-box cr-compose-l">
        <div className="cr-field"><span className="cr-field-l">Who gets it</span><div className="cr-wrap" role="group" aria-label="Who gets it">{audChips}</div></div>
        <div className="cr-field"><span className="cr-field-l">How</span><div className="cr-wrap" role="group" aria-label="How">{chChips}</div></div>
        {b.withSubject !== false && <label className="cr-field"><span className="cr-field-l">Subject</span><input className="cr-input" value={subject} onChange={e => setSubject(e.target.value)} maxLength={140}/></label>}
        <label className="cr-field"><span className="cr-field-l">Message</span><textarea className="cr-textarea" rows={5} value={body} onChange={e => setBody(e.target.value)} maxLength={b.max || 2000}/><span className="cr-hint">{body.length} characters · {parts} SMS part{parts > 1 ? "s" : ""}</span></label>
      </div>
      <div className="cr-compose-r">
        <div className="cr-preview"><span className="cr-hint">Preview · SMS</span><div className="cr-bubble"><b>NGG:</b> {body}</div></div>
        <div className="cr-box cr-sendbox">
          <div className="cr-kv"><span>Recipients</span><b>{crNum(count)}</b></div>
          <div className="cr-kv"><span>SMS cost</span><b>{cost}</b></div>
          <button type="button" className="cr-send" disabled={busy} onClick={send}><CrIcon n="paper-plane-tilt"/>Send to {crNum(count)}</button>
        </div>
      </div>
    </div>
  );
}

/* ── table ── */
const CR_PAGE_SIZE = 25;
function crCellNode(c, col) {
  if (c == null || c === "") return <span className="cr-c-text"><span>—</span></span>;
  if (typeof c !== "object") return <span className="cr-c-text"><span>{String(c)}</span></span>;
  if (c.k === "person") return <span className="cr-person"><CrAvatar name={c.t} photo={c.photo}/><span className="cr-person-t"><b>{c.t}</b>{c.s && <span>{c.s}</span>}</span></span>;
  if (c.k === "status") return <CrPill tone={c.tone} t={c.t}/>;
  if (c.k === "progress") { const p = Number(c.pct) || 0; return <span className="cr-prog"><span className="cr-prog-track"><span className={"cr-prog-fill" + (p < 60 ? " is-low" : p < 80 ? " is-mid" : "")} style={{ width: Math.max(0, Math.min(100, p)) + "%" }}/></span><span>{c.t != null ? c.t : p + "%"}</span></span>; }
  if (c.k === "mono") return <span className="cr-c-mono">{c.t}</span>;
  if (c.k === "num") return <span className="cr-c-num">{c.t}</span>;
  if (c.k === "strong") return <span className="cr-c-text"><span className="cr-c-strong">{c.t}</span>{c.s && <span>{c.s}</span>}</span>;
  return <span className="cr-c-text"><span>{c.t}</span>{c.s && <span>{c.s}</span>}</span>;
}

function CrTable({ b, ctx, phone }) {
  const server = b.server || null;
  const cols = b.cols.map(c => typeof c === "string" ? (c[0] === "#" ? { l: c.slice(1), num: true } : { l: c }) : c);
  const [q, setQ] = React.useState(b.q || "");
  const [qLive, setQLive] = React.useState(b.q || "");
  const [fv, setFv] = React.useState(b.filtersInit || {});
  const [fopen, setFopen] = React.useState(null);
  const [sort, setSort] = React.useState(b.sortInit || null);
  const [page, setPage] = React.useState(0);
  const [sel, setSel] = React.useState({});
  const [srv, setSrv] = React.useState({ state: server ? "loading" : "ready", rows: [], total: 0, error: null });
  const selectable = !b.nosel && !!(b.bulk && b.bulk.length);
  React.useEffect(() => { const t = setTimeout(() => setQ(qLive), server ? 300 : 0); return () => clearTimeout(t); }, [qLive]);
  React.useEffect(() => { setPage(0); }, [q, JSON.stringify(fv), JSON.stringify(sort)]);
  const seq = React.useRef(0);
  const loadServer = React.useCallback(() => {
    if (!server) return;
    const n = ++seq.current;
    setSrv(s => Object.assign({}, s, { state: s.rows.length ? "refresh" : "loading", error: null }));
    server.fetch({ q: q.trim(), filters: fv, sort, page, pageSize: CR_PAGE_SIZE })
      .then(r => { if (n === seq.current) setSrv({ state: "ready", rows: r.rows || [], total: r.total || 0, error: null }); },
            e => { if (n === seq.current) setSrv(s => Object.assign({}, s, { state: "error", error: e })); });
  }, [server, q, JSON.stringify(fv), JSON.stringify(sort), page]);
  React.useEffect(() => { loadServer(); }, [loadServer]);
  React.useEffect(() => { if (b.reloadKey != null && server) loadServer(); }, [b.reloadKey]);

  /* Filters: a server table declares its own; a client one derives them from a column. */
  const chips = (b.filters || []).map(f => {
    if (typeof f === "object") return f;
    const ci = cols.findIndex(c => c.l === f);
    return ci < 0 ? null : { id: String(ci), l: f, ci, opts: crFilterOptions(b.rows || [], ci).map(o => ({ v: o.l, l: o.l, n: o.n })) };
  }).filter(Boolean);
  let view, total;
  if (server) { view = srv.rows.map((r, i) => ({ r, ri: r.key || i })); total = srv.total; }
  else {
    const cf = {};
    chips.forEach(c => { if (fv[c.id] != null && fv[c.id] !== "") cf[c.ci] = fv[c.id]; });
    const all = crTableView(b.rows || [], { q, filters: cf, sort });
    total = all.length;
    view = all.slice(page * CR_PAGE_SIZE, page * CR_PAGE_SIZE + CR_PAGE_SIZE);
  }
  const keyOf = x => x.r.key != null ? x.r.key : x.ri;
  const visKeys = view.map(keyOf);
  const ss = crSelState(sel, visKeys);
  const selKeys = Object.keys(sel).filter(k => sel[k]);
  const applied = Object.keys(fv).some(k => fv[k] != null && fv[k] !== "") || !!q;
  const clearAll = () => { setFv({}); setQ(""); setQLive(""); setFopen(null); };
  const allRef = React.useRef(null);
  React.useEffect(() => { if (allRef.current) allRef.current.indeterminate = ss.some; });
  const runBulk = async a => {
    const keys = selKeys.slice();
    const rows = (server ? srv.rows : (b.rows || [])).filter((r, i) => keys.includes(String(r.key != null ? r.key : i)));
    if (a.max && keys.length > a.max) return ctx.toast("At most " + a.max + " at a time. You selected " + keys.length + ".", null, true);
    const res = await a.run(keys, rows);
    if (res !== false) setSel({});
  };
  const from = total ? page * CR_PAGE_SIZE + 1 : 0, to = Math.min(total, (page + 1) * CR_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / CR_PAGE_SIZE));
  const footText = b.footFn ? b.footFn(total) : total > CR_PAGE_SIZE || server ? "Showing " + crNum(from) + "–" + crNum(to) + " of " + crNum(total) : crPlural(total, "row");
  const emptyText = b.emptyText && !applied ? b.emptyText : q ? "No rows match “" + q + "”." : "No rows match these filters.";
  const open = x => { if (x.r.open) x.r.open(); };
  const filterOpts = fopen ? chips.find(c => c.id === fopen) : null;
  const setFilter = (c, v) => { setFv(s => Object.assign({}, s, { [c.id]: s[c.id] === v ? "" : v })); setFopen(null); };

  if (server && srv.state === "loading") return <CrSkeleton phone={phone}/>;
  if (server && srv.state === "error" && !srv.rows.length) return <CrError error={srv.error} onRetry={loadServer} what="this list"/>;

  if (phone) {
    const st = x => x.r.cells.find(c => c && c.k === "status");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {b.search && <div className="cr-psearch" role="search"><CrIcon n="magnifying-glass"/><input type="search" enterKeyHint="search" placeholder={b.search} aria-label={b.search} value={qLive} onChange={e => setQLive(e.target.value)}/></div>}
        {(chips.length > 0 || applied) && (
          <div className="cr-pchips">
            {chips.map(c => { const v = fv[c.id]; const o = c.opts.find(x => x.v === v); return <button key={c.id} type="button" className={"cr-fchip" + (v || fopen === c.id ? " is-on" : "")} aria-expanded={fopen === c.id} onClick={() => setFopen(fopen === c.id ? null : c.id)}><CrIcon n={v ? "check" : fopen === c.id ? "caret-up" : "plus"}/>{v ? c.l + ": " + (o ? o.l : v) : c.l}</button>; })}
            {applied && <button type="button" className="cr-clear" onClick={clearAll}>Clear all</button>}
          </div>
        )}
        {filterOpts && <div className="cr-pbox" role="group" aria-label={"Filter by " + filterOpts.l}>{filterOpts.opts.map(o => <button key={o.v} type="button" className="cr-popt" aria-pressed={fv[filterOpts.id] === o.v} onClick={() => setFilter(filterOpts, o.v)}><span>{o.l}</span>{o.n != null && <em>{crNum(o.n)}</em>}{fv[filterOpts.id] === o.v && <CrIcon n="check"/>}</button>)}</div>}
        <span className="cr-sr" role="status">{crPlural(total, "row")}</span>
        {!view.length ? (
          <div className="cr-tempty" style={{ padding: "24px 12px", fontSize: 14 }}>{emptyText}{applied && <button type="button" className="cr-pbig is-ghost" style={{ height: 44, width: "auto", padding: "0 16px", fontSize: 14 }} onClick={clearAll}>Clear filters</button>}</div>
        ) : (
          <div className="cr-pbox">
            {view.map(x => {
              const first = x.r.cells[0] || {}; const s = st(x);
              const sub = [first.s, x.r.cells[1] && crCellText(x.r.cells[1])].filter(Boolean).join(" · ");
              return (
                <button key={keyOf(x)} type="button" className="cr-prow" onClick={() => open(x)} disabled={!x.r.open && !undefined}>
                  {first.k === "person" && <CrAvatar name={first.t} photo={first.photo}/>}
                  <span className="cr-prow-t"><b>{crCellText(first)}</b><span>{sub}</span></span>
                  {s && <CrPill tone={s.tone} t={s.t}/>}
                  {x.r.open && <CrIcon n="caret-right"/>}
                </button>
              );
            })}
          </div>
        )}
        <span className="cr-pfoot">{footText}</span>
        {pages > 1 && <div className="cr-pager" style={{ justifyContent: "center" }}><button type="button" aria-label="Previous page" style={{ width: 44, height: 44 }} disabled={page <= 0} onClick={() => setPage(p => p - 1)}><CrIcon n="caret-left"/></button><button type="button" aria-label="Next page" style={{ width: 44, height: 44 }} disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}><CrIcon n="caret-right"/></button></div>}
      </div>
    );
  }

  const hasToolbar = !!b.search || chips.length > 0 || selectable;
  return (
    <div className="cr-box cr-table">
      {hasToolbar && (
        <div className="cr-tbar">
          {b.search && <form role="search" className="cr-searchbox" onSubmit={e => e.preventDefault()}><CrIcon n="magnifying-glass"/><input placeholder={b.search} aria-label={b.search} value={qLive} onChange={e => setQLive(e.target.value)}/></form>}
          {chips.map(c => { const v = fv[c.id]; const o = c.opts.find(x => x.v === v); return <button key={c.id} type="button" className={"cr-fchip" + (v || fopen === c.id ? " is-on" : "")} aria-expanded={fopen === c.id} onClick={() => setFopen(fopen === c.id ? null : c.id)}><CrIcon n={v ? "check" : fopen === c.id ? "caret-up" : "plus"}/>{v ? c.l + ": " + (o ? o.l : v) : c.l}</button>; })}
          {applied && <button type="button" className="cr-clear" onClick={clearAll}>Clear all</button>}
          <span className="cr-grow"/>
          <span className="cr-sr" role="status">{crPlural(total, "row")}{selKeys.length ? ", " + selKeys.length + " selected" : ""}</span>
          {selectable && selKeys.length > 0 && (
            <div className="cr-selbar">
              <span aria-live="polite">{crNum(selKeys.length)} selected</span>
              {b.bulk.map((a, i) => <button key={i} type="button" className={"cr-btn is-sm" + (crIsDanger(a.l) ? " is-danger" : "")} onClick={() => runBulk(a)}>{a.l}</button>)}
              {b.selectAllMatching && total > visKeys.length && <button type="button" className="cr-clear" onClick={async () => { const keys = await b.selectAllMatching({ q, filters: fv }); const n = {}; keys.forEach(k => { n[k] = true; }); setSel(n); }}>Select all {crNum(total)}</button>}
            </div>
          )}
        </div>
      )}
      {filterOpts && (
        <div className="cr-fopts" role="group" aria-label={"Filter by " + filterOpts.l}>
          <span>{filterOpts.l}</span>
          {filterOpts.opts.map(o => <button key={o.v} type="button" className="cr-fchip" aria-pressed={fv[filterOpts.id] === o.v} onClick={() => setFilter(filterOpts, o.v)}>{o.l}{o.n != null && <em>{crNum(o.n)}</em>}</button>)}
        </div>
      )}
      <div className="cr-tscroll">
        <table className="cr-tbl">
          <thead>
            <tr>
              {selectable && <th scope="col" className="cr-cbcol"><button type="button" ref={allRef} role="checkbox" className="cr-cb" aria-checked={ss.all ? "true" : ss.some ? "mixed" : "false"} aria-label="Select all" onClick={e => { e.stopPropagation(); setSel(crToggleAll(sel, visKeys.map(String))); }}>{(ss.all || ss.some) && <CrIcon n={ss.all ? "check" : "minus"}/>}</button></th>}
              {cols.map((c, ci) => {
                const on = sort && sort.ci === ci;
                const sortable = c.sort !== false && (!server || (server.sortKeys && server.sortKeys[ci]));
                return (
                  <th key={ci} scope="col" className={c.num ? "is-num" : ""} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : sortable ? "none" : undefined}>
                    {sortable ? <button type="button" className={"cr-th" + (c.num ? " is-num" : "") + (on ? " is-sorted" : "")} title={"Sort by " + c.l} onClick={() => setSort(crNextSort(sort, ci, !!c.num))}>{c.l}<CrIcon n={on ? (sort.dir === "asc" ? "caret-up" : "caret-down") : "caret-up-down"}/></button> : <span className="cr-th-plain">{c.l}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map(x => {
              const k = String(keyOf(x)); const on = !!sel[k];
              return (
                <tr key={k} className={(x.r.open ? "is-open" : "") + (on ? " is-sel" : "")} onClick={() => open(x)}>
                  {selectable && <td className="cr-cbcol"><button type="button" role="checkbox" className="cr-cb" aria-checked={on} aria-label={"Select " + crCellText(x.r.cells[0])} onClick={e => { e.stopPropagation(); setSel(s => Object.assign({}, s, { [k]: !on })); }}>{on && <CrIcon n="check"/>}</button></td>}
                  {x.r.cells.map((c, ci) => <td key={ci} className={(cols[ci] && cols[ci].num ? "is-num" : "") + (cols[ci] && cols[ci].wrap ? " cr-c-wrap" : "")}>{ci === 0 && x.r.open ? <button type="button" className="cr-linkbtn" style={{ color: "inherit", fontSize: "inherit", textAlign: "left" }} onClick={e => { e.stopPropagation(); open(x); }}>{crCellNode(c, cols[ci])}</button> : crCellNode(c, cols[ci])}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!view.length && <div className="cr-tempty">{emptyText}{applied && <button type="button" className="cr-btn" onClick={clearAll}>Clear filters</button>}</div>}
      <div className="cr-tfoot">
        <span>{footText}</span>
        {pages > 1 && <span className="cr-pager"><button type="button" aria-label="Previous page" disabled={page <= 0} onClick={() => setPage(p => p - 1)}><CrIcon n="caret-left"/></button><button type="button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}><CrIcon n="caret-right"/></button></span>}
      </div>
    </div>
  );
}

/* ── custom: a page-owned body for the few things a block cannot say ── */
function CrCustom({ b, ctx, phone }) { return b.render(ctx, phone); }

const CR_BLOCKS = {
  kpis: CrKpis, attention: CrAttention, status: CrStatus, columns: CrColumns, bars: CrBars, list: CrList,
  note: CrNote, cards: CrCards, form: CrFormBlock, compose: CrCompose, table: CrTable, custom: CrCustom,
};
