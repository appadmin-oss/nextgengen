/* ============================================================================
   Club portal · Systems → Wi-Fi (domain/wifi.php, wifi-regions.php, wifi-setup.php)

   The centres' Wi-Fi, drawn in the Club portal's own design — white cards on
   a soft line, a search row over each table, dot-and-word statuses, actions
   on the right — for the systems people who hold `network`. Six sections in
   the sidebar, one job each:

     Overview      what is happening across the centres you look after:
                   people online, how much of the day gateways are there,
                   line speeds, the busy hours, each region's health, and what
                   needs you.
     Gateways      every gateway in your scope, searched, filtered and paged
                   on the server; open one for its diagnosis and its tools.
     Regions       Wi-Fi regions: their centres, leads and speeds (shaped by
                   somebody who sees every centre; a lead sees theirs).
     Speed tests   test this connection, and every centre's line.
     Who gets on   why somebody can't get on; your centre's or region's speeds.
     Setup         which gateway a centre can use, and the guides.

   Everything is limited on the server to the person's Wi-Fi scope: a super
   admin sees every centre, a region lead their region, anybody else their
   own centre. The screen never filters what it was not given.
   ========================================================================== */

const CW_VIEWS = [
  ["wifi", "Overview", "wifi-high", 1], ["wifi-gateways", "Gateways", "broadcast", 1], ["wifi-regions", "Regions", "map-trifold", 1],
  ["wifi-speed", "Speed tests", "gauge", 1], ["wifi-usage", "Data used", "chart-bar", 1], ["wifi-access", "Who gets on", "user-check", 1], ["wifi-setup", "Setup", "book-open", 1],
];
const CW_META = {
  wifi: ["Wi-Fi", "How the Wi-Fi at your centres is doing: who is online, how often gateways are there, how fast the lines are, and what needs you."],
  "wifi-gateways": ["Wi-Fi gateways", "Each centre’s router or controller: whether it is working, and the tools to fix it when it isn’t."],
  "wifi-regions": ["Wi-Fi regions", "Centres grouped for their Wi-Fi: who looks after each region, its speeds, and how it is doing."],
  "wifi-speed": ["Wi-Fi speed tests", "How fast each centre’s line is. Test from where people sit."],
  "wifi-usage": ["Data used", "How much data each person used at your centres, against their allowance, and who is over it."],
  "wifi-access": ["Who gets on", "Wi-Fi follows people’s records. Why somebody can’t get on, and the speeds at your centres."],
  "wifi-setup": ["Wi-Fi setup", "Which gateway a centre can use, what each does, and the step-by-step guides."],
};
const CW_TONE = { ok: ["#e8f5ec", "#17663a", "#22a05a"], warn: ["#fdf2d8", "#7a5600", "#e0a100"], bad: ["#fdeaea", "#a12a2a", "#d94141"], neutral: ["#f0f0ef", "#48484e", "#9a9aa0"] };
const CW_STATE = { ok: ["Working", "ok"], warn: ["Needs a look", "warn"], bad: ["Not working", "bad"], never: ["Not connected yet", "neutral"] };
const CW_ACCESS = [["on", "On"], ["limited", "Limited"], ["off", "Off"]];
const CW_PROFILE = { "ngg-member": "Members", "ngg-staff": "Staff, mentors and instructors", "ngg-limited": "Limited access", "ngg-summer": "Summer School participants", "ngg-guest": "Visitors" };
const CW_FROM = { network: "Network default", region: "From the region", centre: "This centre’s own" };
const CW_ERR = {
  out_of_scope: "That centre isn’t one you look after.", network_wide_only: "Only somebody who looks after every centre can do that.",
  bad_centre: "Choose a centre that is in use.", bad_platform: "Choose what the gateway is.", bad_profile: "Check the speeds, devices and hours.",
  name_taken: "There is already a region with that name.", name_required: "Give the region a name.", not_network: "They need the network capability first (Access & roles).",
  too_many_resets: "That PIN has been changed three times today. Try again tomorrow.", reason_required: "Say why, so the next person to look knows.",
  own_account: "Somebody else changes your own Wi-Fi.", too_many: "That is more than one press can do. Choose fewer.", rate_limited: "Too many tests in a few minutes. Try again in ten.",
};
const CW_BULK_ERR = { out_of_scope: "At a centre you don’t look after", not_found: "Removed since" };
const cwErr = (e, fb) => { const d = (e && e.data) || {}; return d.message || CW_ERR[d.error || (e && e.code)] || fb; };
const cwN = n => (n == null ? "—" : Number(n).toLocaleString("en-GB"));
const cwMbps = x => (x == null ? "—" : (Math.round(x * 10) / 10) + " Mbit/s");
const cwPct = x => (x == null ? "—" : (Math.round(x * 10) / 10) + "%");
const cwAgo = iso => {
  if (!iso) return "Never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 172800 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago";
};
const cwDay = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const cwIcon = p => ({ mikrotik: "broadcast", openwrt: "share-network", radius: "shield-check", generic: "brackets-curly" })[p] || "wifi-high";

/* ── Small parts ──────────────────────────────────────────────────────────── */

function CwPill({ tone, t }) {
  const c = CW_TONE[tone] || CW_TONE.neutral;
  return <span className="cw-pill" style={{ "--cw-bg": c[0], "--cw-fg": c[1], "--cw-dot": c[2] }}><i aria-hidden="true"/>{t}</span>;
}
function CwStat({ l, v, s, tone }) {
  return <div className="cw-stat"><span className="cw-stat-l">{l}</span><b className={"cw-stat-v" + (tone ? " is-" + tone : "")}>{v}</b>{s ? <span className="cw-stat-s">{s}</span> : null}</div>;
}
function CwCard({ title, sub, right, children, flush }) {
  return <section className={"cw-card" + (flush ? " is-flush" : "")}>
    {title ? <header className="cw-card-h"><div><h2>{title}</h2>{sub ? <p>{sub}</p> : null}</div>{right || null}</header> : null}
    {children}
  </section>;
}
function CwEmpty({ children }) { return <div className="cw-empty">{children}</div>; }
function CwLoading() { return <div className="cw-loading" role="status" aria-live="polite"><span/><span/><span/><span className="cw-sr">Loading</span></div>; }
function CwError({ e, retry }) {
  return <div className="cw-error" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>{cwErr(e, "This couldn’t load (" + ((e && (e.code || e.message)) || "no answer") + ").")}</span>{retry ? <button type="button" onClick={retry}>Try again</button> : null}</div>;
}
function CwBtn({ primary, danger, icon, children, ...rest }) {
  return <button type="button" className={"cw-btn" + (primary ? " is-primary" : danger ? " is-danger" : "")} {...rest}>{icon ? <i className={"ph ph-" + icon} aria-hidden="true"/> : null}{children}</button>;
}
function CwSelect({ label, value, onChange, opts }) {
  return <label className="cw-select"><span className="cw-sr">{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>{opts.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></label>;
}
function CwSearch({ value, onChange, ph, label }) {
  return <label className="cw-search" role="search"><i className="ph ph-magnifying-glass" aria-hidden="true"/><span className="cw-sr">{label || ph}</span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={ph}/></label>;
}
function CwPager({ total, page, size, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const a = total ? (page - 1) * size + 1 : 0, b = Math.min(total, page * size);
  return <div className="cw-pager"><span aria-live="polite" role="status">{total ? a + "–" + b + " of " + cwN(total) : "None"}</span>
    <div><CwBtn icon="caret-left" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}/><CwBtn icon="caret-right" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}/></div></div>;
}

/* People online per day: bars for the peak, a line for the average. SVG in
   a fixed viewBox that scales whole; the numbers are also a table. */
function CwDaysChart({ series, label }) {
  const W = 720, H = 180, P = 28, n = series.length || 1;
  const max = Math.max(1, ...series.map(x => x.peakOnline));
  const bw = (W - P * 2) / n;
  const y = v => H - P - (v / max) * (H - P * 2);
  const line = series.map((x, i) => (i ? "L" : "M") + (P + bw * i + bw / 2).toFixed(1) + " " + y(x.avgOnline).toFixed(1)).join(" ");
  const every = Math.ceil(n / 8);
  return <figure className="cw-chart">
    <svg viewBox={"0 0 " + W + " " + H} role="img" aria-label={label + ": highest " + cwN(max) + " at once."}>
      {[0, 0.5, 1].map(f => <g key={f}><line x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} className="cw-grid"/><text x={P - 6} y={y(max * f) + 4} className="cw-axis" textAnchor="end">{Math.round(max * f)}</text></g>)}
      {series.map((x, i) => <rect key={x.date} x={P + bw * i + bw * 0.15} y={y(x.peakOnline)} width={bw * 0.7} height={Math.max(0, H - P - y(x.peakOnline))} rx="2" className="cw-bar"><title>{cwDay(x.date) + ": " + x.peakOnline + " at the busiest, " + x.avgOnline + " on average"}</title></rect>)}
      <path d={line} className="cw-line" fill="none"/>
      {series.map((x, i) => i % every === 0 ? <text key={x.date} x={P + bw * i + bw / 2} y={H - 8} textAnchor="middle" className="cw-axis">{cwDay(x.date)}</text> : null)}
    </svg>
    <figcaption><span className="cw-lg is-bar"/>At the busiest moment <span className="cw-lg is-line"/>On average</figcaption>
    <details className="cw-table-alt"><summary>As a table</summary><table><thead><tr><th scope="col">Day</th><th scope="col">Busiest</th><th scope="col">Average</th><th scope="col">Gateways there</th></tr></thead>
      <tbody>{series.map(x => <tr key={x.date}><td>{cwDay(x.date)}</td><td>{x.peakOnline}</td><td>{x.avgOnline}</td><td>{cwPct(x.availability)}</td></tr>)}</tbody></table></details>
  </figure>;
}

/* A 0–100 line (availability), or speeds with gaps where nothing was measured. */
function CwTrend({ points, max, fmt, label, unit }) {
  const W = 720, H = 140, P = 28, n = points.length || 1;
  const top = max || Math.max(1, ...points.map(p => p.v || 0));
  const x = i => P + (i * (W - P * 2)) / Math.max(1, n - 1);
  const y = v => H - P - (v / top) * (H - P * 2);
  let d = "", pen = false;
  points.forEach((p, i) => { if (p.v == null) { pen = false; return; } d += (pen ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1) + " "; pen = true; });
  const every = Math.ceil(n / 8);
  return <figure className="cw-chart">
    <svg viewBox={"0 0 " + W + " " + H} role="img" aria-label={label}>
      {[0, 0.5, 1].map(f => <g key={f}><line x1={P} x2={W - P} y1={y(top * f)} y2={y(top * f)} className="cw-grid"/><text x={P - 6} y={y(top * f) + 4} className="cw-axis" textAnchor="end">{Math.round(top * f)}</text></g>)}
      <path d={d} className="cw-line is-strong" fill="none"/>
      {points.map((p, i) => p.v == null ? null : <circle key={i} cx={x(i)} cy={y(p.v)} r="3" className="cw-dot"><title>{p.l + ": " + fmt(p.v)}</title></circle>)}
      {points.map((p, i) => i % every === 0 ? <text key={"t" + i} x={x(i)} y={H - 8} textAnchor="middle" className="cw-axis">{p.l}</text> : null)}
    </svg>
    {unit ? <figcaption>{unit}</figcaption> : null}
  </figure>;
}

/* The week's shape: people online by weekday and hour (centre time). */
function CwHeat({ grid }) {
  const max = Math.max(1, ...grid.flat());
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const busiest = grid.reduce((b, row, d) => row.reduce((bb, v, h) => v > bb.v ? { v, d, h } : bb, b), { v: -1, d: 0, h: 0 });
  return <figure className="cw-heat" aria-label={busiest.v > 0 ? "Busiest: " + days[busiest.d] + " around " + String(busiest.h).padStart(2, "0") + ":00, about " + busiest.v + " online." : "No one online recorded yet."}>
    <div className="cw-heat-grid" role="img" aria-label="People online by weekday and hour">
      <span/>{Array.from({ length: 24 }, (_, h) => <span key={h} className="cw-heat-h">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
      {grid.map((row, d) => <React.Fragment key={d}><span className="cw-heat-d">{days[d]}</span>
        {row.map((v, h) => <span key={h} className="cw-heat-c" style={{ "--cw-a": (v / max).toFixed(2) }} title={days[d] + " " + String(h).padStart(2, "0") + ":00 — about " + v + " online"}/>)}</React.Fragment>)}
    </div>
    <figcaption>{busiest.v > 0 ? "Busiest: " + days[busiest.d] + " around " + String(busiest.h).padStart(2, "0") + ":00, about " + busiest.v + " online. Last 14 days, centre time." : "The busy hours fill in as gateways report."}</figcaption>
  </figure>;
}

/* ── Layers: a side panel, a form, a confirm, a toast ─────────────────────── */

function CwLayers({ ui }) {
  const { panel, form, ask, toast } = ui.state;
  React.useEffect(() => {
    const onKey = e => { if (e.key !== "Escape") return; if (ask) ui.answer(false); else if (form) ui.closeForm(); else if (panel) ui.closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return <>
    {panel ? <div className="cw-scrim" onClick={ui.closePanel}><aside className="cw-panel" role="dialog" aria-modal="true" aria-label={panel.title} onClick={e => e.stopPropagation()}>
      <header className="cw-panel-h"><div>{panel.icon ? <span className="cw-panel-ico"><i className={"ph ph-" + panel.icon} aria-hidden="true"/></span> : null}<div><h2>{panel.title}</h2>{panel.sub ? <p>{panel.sub}</p> : null}</div></div>
        <button type="button" className="cw-x" aria-label="Close" onClick={ui.closePanel} autoFocus><i className="ph ph-x" aria-hidden="true"/></button></header>
      <div className="cw-panel-b">{panel.body}</div>
      {panel.actions && panel.actions.length ? <footer className="cw-panel-f">{panel.actions}</footer> : null}
    </aside></div> : null}
    {form ? <CwFormDialog f={form} ui={ui}/> : null}
    {ask ? <div className="cw-scrim is-top"><div className="cw-ask" role="alertdialog" aria-modal="true" aria-labelledby="cw-ask-h">
      <h2 id="cw-ask-h">{ask.title}</h2><p>{ask.body}</p>
      <div className="cw-ask-f"><CwBtn onClick={() => ui.answer(false)} autoFocus>{ask.cancel || "Cancel"}</CwBtn><CwBtn danger={ask.danger} primary={!ask.danger} onClick={() => ui.answer(true)}>{ask.cta}</CwBtn></div>
    </div></div> : null}
    {toast ? <div className={"cw-toast" + (toast.bad ? " is-bad" : "")} role="status" aria-live="polite"><i className={"ph " + (toast.bad ? "ph-warning-circle" : "ph-check-circle")} aria-hidden="true"/>{toast.t}</div> : null}
  </>;
}

function CwFormDialog({ f, ui }) {
  const [v, setV] = React.useState(f.values || {});
  const [err, setErr] = React.useState(""), [fe, setFe] = React.useState({}), [busy, setBusy] = React.useState(false);
  const set = (k, x) => setV(o => Object.assign({}, o, { [k]: x }));
  const submit = async e => {
    e.preventDefault();
    const miss = {};
    (f.fields || []).forEach(x => { if (x.req && !String(v[x.id] == null ? "" : v[x.id]).trim()) miss[x.id] = "Fill this in."; const m = x.check ? x.check(v[x.id], v) : ""; if (m) miss[x.id] = m; });
    setFe(miss); if (Object.keys(miss).length) return;
    setBusy(true); setErr("");
    try { const r = await f.onSubmit(v); if (r && r.fieldErrors) { setFe(r.fieldErrors); setBusy(false); return; } ui.closeForm(); if (f.done) f.done(v, r); }
    catch (e2) { setErr(e2 && e2.message ? e2.message : "Couldn’t save."); setBusy(false); }
  };
  return <div className="cw-scrim is-top"><form className="cw-form" role="dialog" aria-modal="true" aria-labelledby="cw-form-h" onSubmit={submit} noValidate>
    <h2 id="cw-form-h">{f.title}</h2>{f.intro ? <p className="cw-form-i">{f.intro}</p> : null}
    {(f.fields || []).filter(x => !x.when || x.when(v)).map(x => <div key={x.id} className="cw-field">
      <label htmlFor={"cwf-" + x.id}>{x.l}</label>
      {x.type === "select" ? <select id={"cwf-" + x.id} value={v[x.id] == null ? "" : v[x.id]} onChange={e => set(x.id, e.target.value)}>{x.opts.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
        : x.type === "chips" ? <div className="cw-chips" role="radiogroup" aria-label={x.l}>{x.opts.map(o => <button key={o[0]} type="button" role="radio" aria-checked={v[x.id] === o[0]} className={"cw-chip" + (v[x.id] === o[0] ? " is-on" : "")} onClick={() => set(x.id, o[0])}>{o[1]}</button>)}</div>
        : x.type === "checks" ? <div className="cw-checks">{x.opts.length ? x.opts.map(o => { const on = (v[x.id] || []).indexOf(o[0]) !== -1; return <label key={o[0]} className="cw-check"><input type="checkbox" checked={on} onChange={() => set(x.id, on ? v[x.id].filter(y => y !== o[0]) : (v[x.id] || []).concat([o[0]]))}/><span>{o[1]}</span></label>; }) : <span className="cw-help">{x.empty || "Nothing to choose from."}</span>}</div>
        : x.type === "switch" ? <button id={"cwf-" + x.id} type="button" role="switch" aria-checked={!!v[x.id]} className="cw-switch" onClick={() => set(x.id, !v[x.id])}><span/></button>
        : <input id={"cwf-" + x.id} value={v[x.id] == null ? "" : v[x.id]} placeholder={x.ph || ""} maxLength={x.max || undefined} inputMode={x.num ? "numeric" : undefined} onChange={e => set(x.id, e.target.value)}/>}
      {fe[x.id] ? <span className="cw-ferr" role="alert">{fe[x.id]}</span> : x.help ? <span className="cw-help">{x.help}</span> : null}
    </div>)}
    {err ? <div className="cw-error" role="alert"><i className="ph ph-warning-circle" aria-hidden="true"/><span>{err}</span></div> : null}
    <div className="cw-form-f"><CwBtn onClick={ui.closeForm}>Cancel</CwBtn><button type="submit" className="cw-btn is-primary" disabled={busy}>{busy ? (f.busy || "Saving…") : f.submit}</button></div>
  </form></div>;
}

function useCwUi() {
  const [state, setState] = React.useState({ panel: null, form: null, ask: null, toast: null });
  const timer = React.useRef(0);
  const opener = React.useRef(null);
  const set = p => setState(s => Object.assign({}, s, p));
  return {
    state,
    panel: p => { if (!state.panel) opener.current = document.activeElement; set({ panel: p }); },
    closePanel: () => { set({ panel: null }); try { opener.current && opener.current.focus(); } catch (_) {} },
    form: f => set({ form: f, panel: null }), closeForm: () => set({ form: null }),
    confirm: a => new Promise(res => set({ ask: Object.assign({}, a, { res }) })),
    answer: v => { const a = state.ask; set({ ask: null }); if (a) a.res(v); },
    toast: (t, bad) => { clearTimeout(timer.current); set({ toast: { t, bad: !!bad } }); timer.current = setTimeout(() => set({ toast: null }), 4500); },
  };
}

/* ── The section ──────────────────────────────────────────────────────────── */

function Cp3Wifi({ view, me, phone, go }) {
  const ui = useCwUi();
  const [base, setBase] = React.useState(null), [baseErr, setBaseErr] = React.useState(null), [bump, setBump] = React.useState(0);
  const loadBase = () => { setBaseErr(null); NGGApi.admin.wifi.overview().then(setBase, setBaseErr); };
  React.useEffect(loadBase, [bump]);
  const reload = () => setBump(b => b + 1);
  const ctx = { ui, base, reload, me, phone, go, bump };
  let body;
  if (baseErr) body = <CwError e={baseErr} retry={loadBase}/>;
  else if (!base) body = <CwLoading/>;
  else body = view === "wifi-gateways" ? <CwGateways ctx={ctx}/> : view === "wifi-regions" ? <CwRegions ctx={ctx}/> : view === "wifi-speed" ? <CwSpeed ctx={ctx}/>
    : view === "wifi-usage" ? <CwUsage ctx={ctx}/> : view === "wifi-access" ? <CwAccess ctx={ctx}/> : view === "wifi-setup" ? <CwSetup ctx={ctx}/> : <CwOverview ctx={ctx}/>;
  return <div className={"cw" + (phone ? " is-phone" : "")}>
    {base && !base.scope.all ? <p className="cw-scope"><i className="ph ph-map-pin" aria-hidden="true"/>Showing the {base.centres.length === 1 ? "centre" : cwN(base.centres.length) + " centres"} you look after{base.centres.length === 1 ? ": " + base.centres[0] : ""}.</p> : null}
    {body}
    <CwLayers ui={ui}/>
  </div>;
}

/* Overview: the analytics. */
function CwOverview({ ctx }) {
  const { base, ui, go } = ctx;
  const [days, setDays] = React.useState(30), [region, setRegion] = React.useState("");
  const [a, setA] = React.useState(null), [err, setErr] = React.useState(null), [regions, setRegions] = React.useState([]);
  const [attention, setAttention] = React.useState(null);
  const load = () => {
    setErr(null); setA(null);
    NGGApi.admin.wifi.analytics({ days, region }).then(setA, setErr);
    NGGApi.admin.wifi.gateways({ health: "bad", region, pageSize: 6 }).then(r => setAttention(r), () => setAttention(null));
  };
  React.useEffect(load, [days, region, ctx.bump]);
  React.useEffect(() => { if (base.scope.regions) NGGApi.admin.wifi.regions().then(r => setRegions(r.regions || []), () => {}); }, [ctx.bump]);
  // The feed's measured cost: network-wide, so only for the Wi-Fi regions capability.
  const [ld, setLd] = React.useState(null);
  React.useEffect(() => { if (base.scope.regions) NGGApi.admin.wifi.load().then(setLd, () => setLd(null)); }, [ctx.bump]);
  const s = a && a.summary;
  return <>
    <div className="cw-bar">
      <div className="cw-bar-l">
        <CwSelect label="Period" value={String(days)} onChange={v => setDays(+v)} opts={[["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]]}/>
        {regions.length ? <CwSelect label="Region" value={region} onChange={setRegion} opts={[["", "Every region"]].concat(regions.map(r => [r.regionId, r.name]))}/> : null}
      </div>
      <div className="cw-bar-r"><CwBtn icon="gauge" onClick={() => go("wifi-speed")}>Test this connection</CwBtn><CwBtn primary icon="plus" onClick={() => cwGatewayForm(ctx, null)}>Add a gateway</CwBtn></div>
    </div>
    {err ? <CwError e={err} retry={load}/> : !a ? <CwLoading/> : <>
      <div className="cw-stats">
        <CwStat l="Gateways" v={cwN(a.gateways)} s={cwN(base.centres.length) + (base.centres.length === 1 ? " centre" : " centres") + " in view"}/>
        <CwStat l="Most online at once" v={cwN(s.peakOnline)} s={"in the last " + days + " days"}/>
 <CwStat l="Gateways there" v={cwPct(s.avgAvailability)} s={"of the hours, on average" + (a.gatewaysNever ? " · " + cwN(a.gatewaysNever) + " not connected yet" : "")} tone={s.avgAvailability != null && s.avgAvailability < 90 ? "warn" : ""}/>
        <CwStat l="Typical line" v={cwMbps(s.medianLine)} s={s.slowCentres ? cwN(s.slowCentres) + " slow " + (s.slowCentres === 1 ? "centre" : "centres") + " — see Slowest lines" : cwN(s.tests) + " tests"} tone={s.medianLine != null && s.medianLine < base.slowMbps ? "bad" : ""}/>
      </div>
      {attention && attention.total ? <CwCard title={cwN(attention.total) + (attention.total === 1 ? " gateway isn’t working" : " gateways aren’t working")} sub="Worst first. Open one for what to do." right={<CwBtn onClick={() => go("wifi-gateways")}>See every gateway</CwBtn>} flush>
        <ul className="cw-rows">{attention.gateways.map(g => { const x = (g.diagnosis || []).find(y => y.tone === "bad") || {}; return <li key={g.gatewayId}><button type="button" className="cw-row" onClick={() => cwGatewayPanel(ctx, g)}>
          <CwPill tone="bad" t="Not working"/><span className="cw-row-t"><b>{g.label}</b><span>{g.centre} · {x.title}</span></span><i className="ph ph-caret-right" aria-hidden="true"/></button></li>; })}</ul>
      </CwCard> : null}
      <div className="cw-two">
        <CwCard title="People online" sub="Each day: the busiest moment and the average, across the gateways in view">{a.series.some(x => x.peakOnline) ? <CwDaysChart series={a.series} label="People online per day"/> : <CwEmpty>Nothing reported yet. Gateways report how many people are online with each fetch.</CwEmpty>}</CwCard>
        <CwCard title="Busy hours" sub="When people are online, by weekday and hour"><CwHeat grid={a.heatmap}/></CwCard>
      </div>
      <div className="cw-two">
        <CwCard title="Gateways there" sub="The share of each day’s hours they fetched in. Below 100% is time a gateway couldn’t reach NGG.">
          {a.gateways ? <CwTrend points={a.series.map(x => ({ l: cwDay(x.date), v: x.availability }))} max={100} fmt={cwPct} label="Availability per day"/> : <CwEmpty>No gateways in view.</CwEmpty>}
        </CwCard>
        <CwCard title="Line speed" sub="The middle of each day’s speed tests">
          {a.speedSeries.some(x => x.medianDown != null) ? <CwTrend points={a.speedSeries.map(x => ({ l: cwDay(x.date), v: x.medianDown }))} fmt={cwMbps} label="Line speed per day" unit="Mbit/s download"/> : <CwEmpty>No speed tests in this period. Run one under Speed tests.</CwEmpty>}
        </CwCard>
      </div>
      {a.regions.length ? <CwCard title="Regions now" sub="How each region’s gateways are doing" flush>
        <div className="cw-tablewrap"><table className="cw-table"><thead><tr><th scope="col">Region</th><th scope="col">Centres</th><th scope="col">With Wi-Fi</th><th scope="col">Working</th><th scope="col">Need a look</th><th scope="col">Not working</th><th scope="col">Online now</th></tr></thead>
          <tbody>{a.regions.map(r => <tr key={r.regionId || "_none"}><td><b>{r.name}</b></td><td>{cwN(r.centres)}</td><td>{cwN(r.withWifi)}</td><td>{cwN(r.working)}</td><td>{r.warn ? <CwPill tone="warn" t={cwN(r.warn)}/> : "0"}</td><td>{r.bad ? <CwPill tone="bad" t={cwN(r.bad)}/> : "0"}</td><td>{cwN(r.online)}</td></tr>)}</tbody></table></div>
      </CwCard> : null}
      <div className="cw-three">
        <CwCard title="Busiest centres" sub="Most online at once" flush>{a.busiest.length ? <ol className="cw-rank">{a.busiest.map(x => <li key={x.centre}><span>{x.centre}</span><b>{cwN(x.peak)}</b></li>)}</ol> : <CwEmpty>Nothing reported yet.</CwEmpty>}</CwCard>
        <CwCard title="Slowest lines" sub="Their latest test" flush>{a.slowest.length ? <ol className="cw-rank">{a.slowest.map(x => <li key={x.centre}><span>{x.centre}</span><b className={x.downMbps < base.slowMbps ? "is-bad" : ""}>{cwMbps(x.downMbps)}</b></li>)}</ol> : <CwEmpty>No tests yet.</CwEmpty>}</CwCard>
        <CwCard title="Least available" sub="Share of hours each gateway was there" flush>{a.leastAvailable.length ? <ol className="cw-rank">{a.leastAvailable.map(x => <li key={x.gatewayId}><span>{x.label} · {x.centre}</span><b className={x.availability < 90 ? "is-bad" : ""}>{cwPct(x.availability)}</b></li>)}</ol> : <CwEmpty>No gateways yet.</CwEmpty>}</CwCard>
      </div>
      {ld ? <CwLoad L={ld}/> : null}
      <p className="cw-foot"><i className="ph ph-eye-slash" aria-hidden="true"/>Gateways report how many are online and their load as hourly summaries, and how much data each signed-in person used (Data used). Never what anybody visits.</p>
    </>}
  </>;
}

/* What the feed costs this host (admin.wifi.load), measured per fetch and
   projected at the planned size, before more than one pilot region goes live. */
const CW_LOAD = { unmeasured: ["Not measured yet", "warn"], fine: ["Within budget", "ok"], watch: ["Close to the budget", "warn"], too_much: ["Over budget", "bad"] };
function CwLoad({ L }) {
  const m = L.measured, p = L.plan, w = CW_LOAD[p.verdict] || CW_LOAD.unmeasured;
  return <CwCard title="Server load" sub={"What gateways’ fetches cost this host, last 24 hours · at " + cwN(p.gateways) + " gateways fetching every " + Math.round(p.poll / 60) + " minutes"} right={<CwPill tone={w[1]} t={w[0]}/>}>
    <div className="cw-stats">
      <CwStat l="Fetches" v={cwN(m.fetches)} s={m.rps + " a second · " + cwN(m.failed) + " refused"}/>
      <CwStat l="Time per fetch" v={m.fetches ? m.avgMs + " ms" : "—"} s={m.fetches ? "95% under " + m.p95Ms + " ms · slowest " + m.maxMs + " ms" : "nothing measured yet"}/>
      <CwStat l="At the planned size" v={p.rps + "/s"} s={Math.round(p.busy * 100) + "% of one worker · budget " + Math.round(p.budget * 100) + "%"} tone={p.verdict === "too_much" ? "bad" : p.verdict === "watch" ? "warn" : ""}/>
    </div>
    <p className="cw-p">{p.advice} {cwN(L.regionsLive)} {L.regionsLive === 1 ? "region has" : "regions have"} gateways connected now.</p>
  </CwCard>;
}

/* Gateways: the paged list, and one gateway's panel. */
function CwGateways({ ctx }) {
  const [q, setQ] = React.useState(""), [region, setRegion] = React.useState(""), [platform, setPlatform] = React.useState(""), [health, setHealth] = React.useState("");
  const [page, setPage] = React.useState(1), [d, setD] = React.useState(null), [err, setErr] = React.useState(null), [regions, setRegions] = React.useState([]);
  const size = 25;
  const load = () => { setErr(null); NGGApi.admin.wifi.gateways({ q, region, platform, health, page, pageSize: size }).then(setD, setErr); };
  React.useEffect(() => { const t = setTimeout(load, 220); return () => clearTimeout(t); }, [q, region, platform, health, page, ctx.bump]);
  React.useEffect(() => { if (ctx.base.scope.regions) NGGApi.admin.wifi.regions().then(r => setRegions(r.regions || []), () => {}); }, [ctx.bump]);
  const f = (d && d.facets) || { region: {}, platform: {}, health: {} };
  const c = (o, k) => o[k] ? " (" + cwN(o[k]) + ")" : "";
  const reset = fn => v => { fn(v); setPage(1); };
  return <>
    <div className="cw-bar"><div className="cw-bar-l"/><div className="cw-bar-r">
      {d && d.total ? <CwBtn icon="pulse" onClick={async () => {
        // Every gateway matching the filters, read now — not only the page drawn.
        let ids; try { ids = await NGGApi.admin.wifi.gatewayIds({ q, region, platform, health }); } catch (e) { ctx.ui.toast(cwErr(e, "Couldn’t read the list."), true); return; }
        cwBulk(ctx, "test", { gatewayIds: ids.ids }, ids.total, q || region || platform || health ? "matching" : "you look after");
      }}>{"Line test · " + (q || region || platform || health ? "all " + cwN(d.total) + " matching" : "every gateway")}</CwBtn> : null}
      <CwBtn primary icon="plus" onClick={() => cwGatewayForm(ctx, null)}>Add a gateway</CwBtn></div></div>
    <CwCard flush>
      <div className="cw-tools">
        <CwSearch value={q} onChange={reset(setQ)} ph="Search gateways and centres"/>
        <CwSelect label="Status" value={health} onChange={reset(setHealth)} opts={[["", "Any status"], ["bad", "Not working" + c(f.health, "bad")], ["warn", "Needs a look" + c(f.health, "warn")], ["never", "Not connected yet" + c(f.health, "never")], ["ok", "Working" + c(f.health, "ok")]]}/>
        {regions.length ? <CwSelect label="Region" value={region} onChange={reset(setRegion)} opts={[["", "Every region"]].concat(regions.map(r => [r.regionId, r.name + c(f.region, r.regionId)]), [["_none", "Not in a region" + c(f.region, "_none")]])}/> : null}
        <CwSelect label="Platform" value={platform} onChange={reset(setPlatform)} opts={[["", "Any platform"]].concat((ctx.base.platforms || []).map(p => [p.id, p.label.replace(/ \(.*/, "") + c(f.platform, p.id)]))}/>
      </div>
      {err ? <CwError e={err} retry={load}/> : !d ? <CwLoading/> : !d.total ? <CwEmpty>{q || region || platform || health ? "No gateway matches. Clear a filter to see more." : "No gateways yet. Add one for each centre’s Wi-Fi; its setup guide comes with it."}</CwEmpty> :
        <div className="cw-tablewrap"><table className="cw-table is-rows">
          <thead><tr><th scope="col">Gateway</th><th scope="col">Centre</th><th scope="col">Status</th><th scope="col">People</th><th scope="col">Line</th><th scope="col">Last fetch</th><th scope="col"><span className="cw-sr">Open</span></th></tr></thead>
          <tbody>{d.gateways.map(g => { const st = CW_STATE[g.state] || CW_STATE.warn; return <tr key={g.gatewayId} onClick={() => cwGatewayPanel(ctx, g)}>
            <td><span className="cw-cell"><i className={"ph ph-" + cwIcon(g.platform)} aria-hidden="true"/><span><b>{g.label}</b><small>{g.platformLabel.replace(/ \(.*/, "")}{g.pilot ? " · pilot" : ""}</small></span></span></td>
            <td><b className="cw-w">{g.centre}</b>{ctx.base.scope.regions ? <small>{g.region || "No region"}</small> : null}</td>
            <td><CwPill tone={st[1]} t={st[0]}/></td>
            <td>{cwN(g.users)}{g.stats && g.stats.active != null ? <small>{cwN(g.stats.active)} online</small> : null}</td>
            <td>{g.speed ? <span className={g.speed.downMbps < ctx.base.slowMbps ? "cw-bad" : ""}>{cwMbps(g.speed.downMbps)}</span> : "—"}</td>
            <td>{cwAgo(g.lastSeenAt)}</td>
            <td><CwBtn onClick={e => { e.stopPropagation(); cwGatewayPanel(ctx, g); }}>Open</CwBtn></td>
          </tr>; })}</tbody></table></div>}
      {d && d.total ? <CwPager total={d.total} page={d.page} size={size} onPage={setPage}/> : null}
    </CwCard>
  </>;
}

function cwGatewayPanel(ctx, g) {
  const { ui } = ctx;
  const st = CW_STATE[g.state || (g.lastSeenAt ? g.health : "never")] || CW_STATE.warn;
  const run = async (fn, ok, fb) => { try { await fn(); ui.toast(ok); ctx.reload(); ui.closePanel(); } catch (e) { ui.toast(cwErr(e, fb), true); } };
  ui.panel({ title: g.label, sub: g.platformLabel + " · " + g.centre + (g.region && ctx.base.scope.regions ? " · " + g.region : ""), icon: cwIcon(g.platform),
    body: <>
      <div className="cw-stats is-3"><CwStat l="Status" v={<CwPill tone={st[1]} t={st[0]}/>}/><CwStat l="Online now" v={g.stats && g.stats.active != null ? cwN(g.stats.active) : "—"} s={cwN(g.users) + " on its list"}/><CwStat l="Line" v={g.speed ? cwMbps(g.speed.downMbps) : "—"} s={g.speed ? cwAgo(g.speed.at) : "Not measured"}/></div>
      <h3 className="cw-h3">How it is</h3>
      <ul className="cw-diag">{(g.diagnosis || []).map((x, i) => <li key={i} className={"is-" + x.tone}><i className={"ph " + (x.tone === "ok" ? "ph-check-circle" : x.tone === "bad" ? "ph-x-circle" : "ph-warning")} aria-hidden="true"/><div><b>{x.title}</b><p>{x.fix}</p></div></li>)}</ul>
      {g.fair ? <><h3 className="cw-h3">At the busiest hour this week</h3><dl className="cw-dl"><dt>People online at once</dt><dd>{cwN(g.fair.peak)}</dd><dt>Each could get</dt><dd>{cwMbps(g.fair.each)}</dd><dt>A fair member speed</dt><dd>{cwMbps(g.fair.suggestMember)} with burst on</dd></dl></> : null}
      {g.stats ? <><h3 className="cw-h3">What it reported</h3><dl className="cw-dl"><dt>CPU</dt><dd>{g.stats.cpu != null ? g.stats.cpu + "%" : "—"}</dd><dt>Free memory</dt><dd>{g.stats.memFree != null ? g.stats.memFree + " MB" : "—"}</dd><dt>Reported</dt><dd>{cwAgo(g.stats.at)}</dd></dl></> : null}
      <h3 className="cw-h3">Details</h3>
      <dl className="cw-dl"><dt>Reported version</dt><dd>{g.osVersion || "Not reported"}</dd><dt>Key</dt><dd>…{g.keyTail}</dd><dt>Last full list</dt><dd>{cwAgo(g.lastFullAt)}</dd><dt>Gateway id</dt><dd className="cw-mono">{g.gatewayId}</dd></dl>
    </>,
    actions: [
      <CwBtn key="g" primary={!g.lastSeenAt} icon="book-open" onClick={() => cwGuide(ctx, g)}>Setup guide</CwBtn>,
      g.platform === "mikrotik" ? <CwBtn key="t" icon="gauge" disabled={g.testAsked} onClick={() => run(() => NGGApi.admin.wifi.testAtNextFetch(g.gatewayId), "Asked. It tests its line at its next fetch.", "Couldn’t ask for a test.")}>{g.testAsked ? "Line test asked for" : "Test the line"}</CwBtn> : null,
      <CwBtn key="e" icon="pencil-simple" onClick={() => cwGatewayForm(ctx, g)}>Edit</CwBtn>,
      <CwBtn key="r" icon="key" onClick={async () => { if (!(await ui.confirm({ title: "Rotate the key for " + g.label + "?", danger: true, cta: "Rotate the key", body: "The old key stops working at once. Until the setup is run again with the new key, the gateway keeps its people but gets no changes." }))) return;
        try { const r = await NGGApi.admin.wifi.gatewayRotate(g.gatewayId); ctx.reload(); cwGuide(ctx, r.gateway, r.key); } catch (e) { ui.toast(cwErr(e, "Couldn’t rotate the key."), true); } }}>Rotate the key</CwBtn>,
      <CwBtn key="x" danger icon="trash" onClick={async () => { if (!(await ui.confirm({ title: "Remove " + g.label + "?", danger: true, cta: "Remove", body: "Its key stops working at once. Take the NGG setup off the gateway too. This can’t be undone." }))) return;
        run(() => NGGApi.admin.wifi.gatewayRemove(g.gatewayId), "Removed · " + g.label, "Couldn’t remove it."); }}>Remove</CwBtn>,
    ].filter(Boolean) });
}

function cwGatewayForm(ctx, g) {
  const { ui, base } = ctx;
  if (!(base.centres || []).length) { ui.toast("There is no centre in your view to add a gateway to.", true); return; }
  ui.form({ title: g ? "Edit " + g.label : "Add a gateway", submit: g ? "Save changes" : "Add the gateway",
    intro: g ? "Moving it to another centre or platform sends it a full list at its next fetch." : "Its key and its setup guide open straight after this. The key is shown once.",
    values: g ? { platform: g.platform, centre: g.centre, label: g.label } : { platform: "mikrotik", centre: base.centres[0] },
    fields: [
      { id: "platform", l: "What it is", type: "chips", req: true, opts: (base.platforms || []).map(p => [p.id, p.label]) },
      { id: "centre", l: "Centre", type: "select", req: true, opts: base.centres.map(c => [c, c]) },
      { id: "label", l: "Name", max: 120, ph: "e.g. Main hall router", help: "Leave blank to use the centre’s name." },
    ],
    onSubmit: async v => { try { return await NGGApi.admin.wifi.gatewaySave({ gatewayId: g ? g.gatewayId : undefined, platform: v.platform, centre: v.centre, label: v.label }); } catch (e) { throw new Error(cwErr(e, "Couldn’t save.")); } },
    done: (v, r) => { ctx.reload(); if (r && r.key) cwGuide(ctx, r.gateway, r.key); else ui.toast("Saved · " + (v.label || v.centre)); },
  });
}

async function cwGuide(ctx, g, key) {
  const { ui } = ctx;
  let s;
  try { s = await NGGApi.admin.wifi.setup(g.gatewayId); } catch (e) { ui.toast(cwErr(e, "Couldn’t open the guide."), true); return; }
  const fill = t => key ? String(t || "").split("PASTE-THE-KEY-HERE").join(key) : String(t || "");
  const script = fill(s.script);
  const copy = (t, w) => { try { navigator.clipboard.writeText(t); ui.toast(w + " copied"); } catch (_) { ui.toast("Couldn’t reach the clipboard. Select the text and copy it.", true); } };
  ui.panel({ title: key ? "Set up " + g.label + " now" : "Setup guide · " + g.label, sub: s.label + " · " + g.centre, icon: "book-open",
    body: <>
      {key ? <div className="cw-key"><b>This gateway’s key — shown once</b><code>{key}</code><p>It is already in the script below. Afterwards only its last four characters are shown.</p></div> : <p className="cw-note">The script has PASTE-THE-KEY-HERE where the key goes. Lost the key? Rotate it and this guide opens again with the new one filled in.</p>}
      {s.pilot ? <div className="cw-callout"><b>Pilot first</b><p>{s.pilot}</p></div> : null}
      <p className="cw-p"><b>What this does.</b> {s.summary || s.needs}{s.time ? " " + s.time + "." : ""}</p>
      {(s.before || []).length ? <><h3 className="cw-h3">You’ll need</h3><ul className="cw-need">{s.before.map((t, i) => <li key={i}><i className="ph ph-check" aria-hidden="true"/>{t}</li>)}</ul></> : null}
      <ol className="cw-steps">{(s.steps || []).map((st, i) => <li key={i}>
        <h3 className="cw-h3">{st.h}</h3>
        {st.text ? <p className="cw-p cw-pre">{fill(st.text)}</p> : null}
        {st.script ? <pre className="cw-code" tabIndex={0} aria-label={s.scriptName}>{script}</pre> : null}
        {st.cmd ? <>{st.script ? <p className="cw-p">Then run:</p> : null}<pre className="cw-code" tabIndex={0} aria-label={"Commands for step " + (i + 1)}>{fill(st.cmd)}</pre></> : null}
        {st.tip ? <p className="cw-tip"><i className="ph ph-lightbulb" aria-hidden="true"/>{st.tip}</p> : null}
      </li>)}</ol>
      {s.reports ? <><h3 className="cw-h3">What it sends NGG</h3><p className="cw-p">{s.reports}</p></> : null}
      {(s.trouble || []).length ? <><h3 className="cw-h3">If something goes wrong</h3><dl className="cw-fix">{s.trouble.map(([q, a], i) => <React.Fragment key={i}><dt>{q}</dt><dd>{a}</dd></React.Fragment>)}</dl></> : null}
    </>,
    actions: [s.oneLiner ? <CwBtn key="o" primary icon="copy" onClick={() => copy(fill(s.oneLiner), "Install line")}>Copy the install line</CwBtn> : null,
      s.oneLiner && script ? <CwBtn key="f" icon="download-simple" onClick={() => crWfSaveFile(script, "ngg-wifi.rsc")}>Download the setup file</CwBtn> : null,
      script && !s.oneLiner ? <CwBtn key="c" primary icon="copy" onClick={() => copy(script, "Script")}>Copy the script</CwBtn> : null, key ? <CwBtn key="k" icon="key" onClick={() => copy(key, "Key")}>Copy the key</CwBtn> : null,
      <CwBtn key="d" onClick={() => { ui.closePanel(); ctx.reload(); }}>Done</CwBtn>].filter(Boolean) });
}

/* Regions. */
function CwRegions({ ctx }) {
  const { ui } = ctx;
  const [d, setD] = React.useState(null), [err, setErr] = React.useState(null);
  const load = () => { setErr(null); NGGApi.admin.wifi.regions().then(setD, setErr); };
  React.useEffect(load, [ctx.bump]);
  const shape = d && d.canShape;
  const edit = r => ui.form({ title: r ? "Rename " + r.name : "New region", submit: r ? "Save" : "Make the region",
    intro: "A Wi-Fi region groups centres for their Wi-Fi: who looks after them, their speeds, their health at a glance.",
    values: r ? { name: r.name, code: r.code, note: r.note } : {},
    fields: [{ id: "name", l: "Name", req: true, max: 120, ph: "e.g. Lagos West" }, { id: "code", l: "Short code", max: 8, ph: "e.g. LW", help: "Letters and numbers, up to 8." }, { id: "note", l: "Note", max: 255 }],
    onSubmit: async v => { try { return await NGGApi.admin.wifi.regionSave({ regionId: r ? r.regionId : undefined, name: v.name, code: v.code, note: v.note }); } catch (e) { if (e && e.data && e.data.error === "name_taken") return { fieldErrors: { name: CW_ERR.name_taken } }; throw new Error(cwErr(e, "Couldn’t save.")); } },
    done: v => { ui.toast((r ? "Saved · " : "Made · ") + v.name); ctx.reload(); } });
  return <>
    <div className="cw-bar"><div className="cw-bar-l"/>{shape ? <div className="cw-bar-r"><CwBtn icon="squares-four" onClick={() => cwAssignPanel(ctx, d.regions)}>Put centres in regions</CwBtn><CwBtn primary icon="plus" onClick={() => edit(null)}>New region</CwBtn></div> : null}</div>
    {err ? <CwError e={err} retry={load}/> : !d ? <CwLoading/> : <>
      {!d.regions.length ? <CwCard><CwEmpty>{shape ? "No regions yet. Make one, then put centres in it — a region groups centres for their Wi-Fi, with its own leads and speeds." : "You don’t lead a Wi-Fi region."}</CwEmpty></CwCard> :
        <div className="cw-grid">{d.regions.map(r => <button key={r.regionId} type="button" className="cw-tile" onClick={() => cwRegionPanel(ctx, r, shape, edit)}>
          <span className="cw-tile-h"><b>{r.name}</b>{r.code ? <span className="cw-code-tag">{r.code}</span> : null}</span>
          <span className="cw-tile-s">{cwN(r.centres)} {r.centres === 1 ? "centre" : "centres"} · {cwN(r.withWifi)} with Wi-Fi</span>
          <span className="cw-tile-pills">{r.working ? <CwPill tone="ok" t={cwN(r.working) + " working"}/> : null}{r.warn ? <CwPill tone="warn" t={cwN(r.warn) + " need a look"}/> : null}{r.bad ? <CwPill tone="bad" t={cwN(r.bad) + " not working"}/> : null}{!r.gateways ? <CwPill tone="neutral" t="No gateways"/> : null}</span>
          <span className="cw-tile-m"><span>{cwN(r.online)} online now</span><span>{r.leads.length ? "Led by " + r.leads.map(l => l.name).join(", ") : "No lead yet"}</span></span>
        </button>)}</div>}
      {shape && d.unassigned.centres ? <p className="cw-foot"><i className="ph ph-info" aria-hidden="true"/>{cwN(d.unassigned.centres)} {d.unassigned.centres === 1 ? "centre is" : "centres are"} in no region. <button type="button" className="cw-link" onClick={() => cwAssignPanel(ctx, d.regions)}>Put them in one</button></p> : null}
    </>}
  </>;
}

/* One bulk act over gateways (admin.wifi.gateways.bulk): `test` asks each for
   a line test at its next fetch; `rotate` gives each a new key, listed once.
   The count is read before the confirm and sent back as `expect`. */
async function cwBulk(ctx, verb, target, count, what) {
  const { ui } = ctx, rot = verb === "rotate";
  if (!count) { ui.toast("There are no gateways " + what + ".", true); return; }
  const g = count === 1 ? "gateway" : "gateways";
  const ok = await ui.confirm(rot
    ? { title: "New keys for " + cwN(count) + " " + g + " " + what + "?", danger: true, cta: "Rotate " + cwN(count) + (count === 1 ? " key" : " keys"),
        body: "Every old key stops working at once. Until each router’s setup is run again with its new key, it keeps the people it has but gets no changes. The new keys are shown once, next." }
    : { title: "Ask " + cwN(count) + " " + g + " " + what + " for a line test?", cta: "Ask for " + cwN(count) + (count === 1 ? " test" : " tests"),
        body: "Each measures its internet line at its next fetch, within five minutes, and the result appears under Speed tests." });
  if (!ok) return;
  let r;
  try { r = await NGGApi.admin.wifi.bulk(verb, target, count); } catch (e) { ui.toast(cwErr(e, "Couldn’t do that."), true); ctx.reload(); return; }
  const said = cwN(r.applied) + (rot ? " rotated" : " asked") + (r.unchanged ? " · " + cwN(r.unchanged) + " already asked" : "") + (r.refused ? " · " + cwN(r.refused) + " refused" : "");
  ctx.reload();
  if (!rot) { ui.toast(said, !!r.refused); return; }
  const keyed = (r.results || []).filter(x => x.key), failed = (r.results || []).filter(x => !x.ok);
  const csv = "gateway,label,centre,key\n" + keyed.map(x => [x.gatewayId, x.label, x.centre, x.key].map(v => '"' + String(v || "").replace(/"/g, '""') + '"').join(",")).join("\n");
  const copy = () => { try { navigator.clipboard.writeText(csv); ui.toast("Copied " + cwN(keyed.length) + (keyed.length === 1 ? " key" : " keys")); } catch (_) { ui.toast("Couldn’t reach the clipboard. Select the keys and copy them.", true); } };
  ui.panel({ title: "The new keys", sub: said + " · shown once", icon: "key",
    body: <>
      <div className="cw-key"><b>Paste each into its router’s setup</b><p>Anybody with a key can read that centre’s list. Copy them now: once this closes they can’t be shown again, only rotated.</p></div>
      <div className="cw-tablewrap"><table className="cw-table"><thead><tr><th scope="col">Gateway</th><th scope="col">Centre</th><th scope="col">New key</th></tr></thead>
        <tbody>{keyed.map(x => <tr key={x.gatewayId}><td><b>{x.label || x.gatewayId}</b></td><td>{x.centre}</td><td><code>{x.key}</code></td></tr>)}</tbody></table></div>
      {failed.length ? <><h3 className="cw-h3">Refused</h3><ul className="cw-p">{failed.map(x => <li key={x.gatewayId}>{x.gatewayId} — {CW_BULK_ERR[x.error] || x.error}</li>)}</ul></> : null}
    </>,
    actions: [<CwBtn key="c" primary icon="copy" onClick={copy}>Copy all as CSV</CwBtn>, <CwBtn key="d" onClick={() => ui.closePanel()}>Done</CwBtn>] });
}

function cwRegionPanel(ctx, r, shape, edit) {
  const { ui } = ctx;
  ui.panel({ title: r.name, sub: cwN(r.centres) + " centres · " + cwN(r.gateways) + " gateways", icon: "map-trifold",
    body: <CwRegionBody ctx={ctx} r={r}/>,
    actions: [
      <CwBtn key="s" primary icon="sliders-horizontal" onClick={() => cwSpeedsForm(ctx, { regionId: r.regionId }, r.name)}>Region speeds</CwBtn>,
      <CwBtn key="t" icon="pulse" onClick={() => { ui.closePanel(); cwBulk(ctx, "test", { regionId: r.regionId }, r.gateways, "in " + r.name); }}>Line test, every gateway</CwBtn>,
      <CwBtn key="k" icon="key" onClick={() => { ui.closePanel(); cwBulk(ctx, "rotate", { regionId: r.regionId }, r.gateways, "in " + r.name); }}>New keys, every gateway</CwBtn>,
      shape ? <CwBtn key="l" icon="user-gear" onClick={() => cwLeadsForm(ctx, r)}>Leads</CwBtn> : null,
      shape ? <CwBtn key="e" icon="pencil-simple" onClick={() => edit(r)}>Rename</CwBtn> : null,
      shape ? <CwBtn key="x" danger icon="trash" onClick={async () => { if (!(await ui.confirm({ title: "Remove " + r.name + "?", danger: true, cta: "Remove the region", body: "Its " + r.centres + " centres stay as they are, in no region; the region’s own speeds and leads go. Gateways keep working." }))) return;
        try { await NGGApi.admin.wifi.regionRemove(r.regionId); ui.closePanel(); ui.toast("Removed · " + r.name); ctx.reload(); } catch (e) { ui.toast(cwErr(e, "Couldn’t remove it."), true); } }}>Remove</CwBtn> : null,
    ].filter(Boolean) });
}

function CwRegionBody({ ctx, r }) {
  const [q, setQ] = React.useState(""), [page, setPage] = React.useState(1), [d, setD] = React.useState(null), [err, setErr] = React.useState(null);
  React.useEffect(() => { const t = setTimeout(() => NGGApi.admin.wifi.centres({ region: r.regionId, q, page, pageSize: 12 }).then(setD, setErr), 200); return () => clearTimeout(t); }, [q, page]);
  return <>
    <div className="cw-stats is-3"><CwStat l="Working" v={cwN(r.working)} s={"of " + cwN(r.gateways) + " gateways"}/><CwStat l="Online now" v={cwN(r.online)}/><CwStat l="Leads" v={cwN(r.leads.length)} s={r.leads.map(l => l.name).join(", ") || "None yet"}/></div>
    <h3 className="cw-h3">Its centres</h3>
    <CwSearch value={q} onChange={v => { setQ(v); setPage(1); }} ph="Search its centres"/>
    {err ? <CwError e={err}/> : !d ? <CwLoading/> : !d.total ? <CwEmpty>No centres{q ? " match" : " yet"}.</CwEmpty> :
      <ul className="cw-list">{d.centres.map(c => <li key={c.centre}><span><b>{c.centre}</b><small>{c.gateways ? cwN(c.gateways) + (c.gateways === 1 ? " gateway" : " gateways") + " · " + cwN(c.online) + " online" : "No gateway"}</small></span>
        {c.bad ? <CwPill tone="bad" t="Not working"/> : c.warn || c.never ? <CwPill tone="warn" t="Needs a look"/> : c.gateways ? <CwPill tone="ok" t="Working"/> : <CwPill tone="neutral" t="Not set up"/>}</li>)}</ul>}
    {d && d.total > 12 ? <CwPager total={d.total} page={d.page} size={12} onPage={setPage}/> : null}
  </>;
}

function cwLeadsForm(ctx, r) {
  const { ui } = ctx;
  NGGApi.admin.wifi.leadOptions().then(o => ui.form({ title: "Who leads " + r.name, submit: "Save leads",
    intro: "A lead sees this region’s centres in Wi-Fi, and sets its speeds. Only staff holding the network capability can lead.",
    values: { ids: r.leads.map(l => l.memberId) },
    fields: [{ id: "ids", l: "Leads", type: "checks", opts: (o.staff || []).map(s => [s.memberId, s.name + " · " + s.role]), empty: "Nobody holds the network capability yet. Give it under Access & roles." }],
    onSubmit: async v => { try { return await NGGApi.admin.wifi.regionLeads(r.regionId, v.ids || []); } catch (e) { throw new Error(cwErr(e, "Couldn’t save.")); } },
    done: () => { ui.toast("Leads saved · " + r.name); ctx.reload(); } }), e => ui.toast(cwErr(e, "Couldn’t load the staff."), true));
}

/* Put centres into regions: the centre list with a selection that can be every match. */
function cwAssignPanel(ctx, regions) {
  ctx.ui.panel({ title: "Put centres in regions", sub: "Choose centres, then the region they go in", icon: "squares-four", body: <CwAssign ctx={ctx} regions={regions}/> });
}
function CwAssign({ ctx, regions }) {
  const { ui } = ctx;
  const [q, setQ] = React.useState(""), [filter, setFilter] = React.useState("_none"), [page, setPage] = React.useState(1);
  const [d, setD] = React.useState(null), [sel, setSel] = React.useState([]), [to, setTo] = React.useState(regions[0] ? regions[0].regionId : ""), [busy, setBusy] = React.useState(false);
  const load = () => NGGApi.admin.wifi.centres({ q, region: filter, page, pageSize: 15 }).then(setD, () => setD({ total: 0, centres: [] }));
  React.useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q, filter, page]);
  const toggle = c => setSel(s => s.indexOf(c) === -1 ? s.concat([c]) : s.filter(x => x !== c));
  const all = async () => { const r = await NGGApi.admin.wifi.centres({ q, region: filter, idsOnly: 1, pageSize: 1 }); setSel(r.all || []); };
  const apply = async () => {
    const n = sel.length, target = regions.find(r => r.regionId === to);
    if (!(await ui.confirm({ title: "Put " + n + (n === 1 ? " centre" : " centres") + " in " + (target ? target.name : "no region") + "?", cta: "Put them there", body: "Their gateways take the region’s speeds at their next fetch, unless a centre has its own." }))) return;
    setBusy(true);
    try { const r = await NGGApi.admin.wifi.regionAssign(to, sel); ui.toast(r.applied + " moved" + (r.unchanged ? " · " + r.unchanged + " already there" : "") + (r.refused ? " · " + r.refused + " refused" : ""), !!r.refused); setSel([]); load(); ctx.reload(); }
    catch (e) { ui.toast(cwErr(e, "Couldn’t move them."), true); } finally { setBusy(false); }
  };
  return <>
    <div className="cw-tools is-stack">
      <CwSearch value={q} onChange={v => { setQ(v); setPage(1); }} ph="Search centres"/>
      <CwSelect label="Show" value={filter} onChange={v => { setFilter(v); setPage(1); }} opts={[["_none", "In no region"], ["", "Every centre"]].concat(regions.map(r => [r.regionId, "In " + r.name]))}/>
    </div>
    {!d ? <CwLoading/> : !d.total ? <CwEmpty>No centres here.</CwEmpty> : <>
      <div className="cw-selbar" role="status" aria-live="polite"><span>{sel.length ? cwN(sel.length) + " chosen" : "None chosen"}</span>
        {d.total > d.centres.length ? <button type="button" className="cw-link" onClick={all}>Choose all {cwN(d.total)} matching</button> : null}{sel.length ? <button type="button" className="cw-link" onClick={() => setSel([])}>Clear</button> : null}</div>
      <ul className="cw-list">{d.centres.map(c => <li key={c.centre}><label className="cw-check"><input type="checkbox" checked={sel.indexOf(c.centre) !== -1} onChange={() => toggle(c.centre)}/><span><b>{c.centre}</b><small>{c.region || "No region"} · {c.gateways ? cwN(c.gateways) + " gateways" : "no gateway"}</small></span></label></li>)}</ul>
      {d.total > 15 ? <CwPager total={d.total} page={d.page} size={15} onPage={setPage}/> : null}
    </>}
    <div className="cw-assign-f">
      <CwSelect label="Region" value={to} onChange={setTo} opts={regions.map(r => [r.regionId, r.name]).concat([["", "No region"]])}/>
      <CwBtn primary disabled={!sel.length || busy} onClick={apply}>{busy ? "Moving…" : "Put " + (sel.length || "") + " there"}</CwBtn>
    </div>
  </>;
}

/* Speeds for a centre or a region: what it sets itself, and what it inherits. */
async function cwSpeedsForm(ctx, where, name) {
  const { ui } = ctx;
  let d;
  try { d = await NGGApi.admin.wifi.profilesFor(where); } catch (e) { ui.toast(cwErr(e, "Couldn’t load the speeds."), true); return; }
  const own = d.own || {}, eff = d.effective || {};
  const values = {}, fields = [];
  Object.keys(eff).forEach(k => {
    const mine = !!own[k];
    values[k + "|own"] = mine;
    values[k + "|down"] = String(eff[k].down); values[k + "|up"] = String(eff[k].up); values[k + "|devices"] = String(eff[k].devices); values[k + "|hours"] = eff[k].hours || "";
    fields.push({ id: k + "|own", l: (CW_PROFILE[k] || k) + " — set here", type: "switch", help: mine ? "Set here." : (CW_FROM[(d.from || {})[k]] || "Inherited") + ": " + eff[k].down + "/" + eff[k].up + " Mbit/s, " + eff[k].devices + (eff[k].devices === 1 ? " device" : " devices") + (eff[k].hours ? ", " + eff[k].hours : "") + ". Turn on to set this " + d.level + "’s own." });
    const on = v => !!v[k + "|own"];
    const n = (lo, hi) => x => /^\d+$/.test(String(x).trim()) && +x >= lo && +x <= hi ? "" : "A whole number from " + lo + " to " + hi + ".";
    fields.push({ id: k + "|down", l: "Download (Mbit/s)", num: true, when: on, check: (x, v) => on(v) ? n(1, 1000)(x) : "" });
    fields.push({ id: k + "|up", l: "Upload (Mbit/s)", num: true, when: on, check: (x, v) => on(v) ? n(1, 1000)(x) : "" });
    fields.push({ id: k + "|devices", l: "Devices at once", num: true, when: on, check: (x, v) => on(v) ? n(1, 5)(x) : "" });
    fields.push({ id: k + "|hours", l: "Hours", ph: "All day, or 08:00-18:00", when: on, check: (x, v) => !on(v) || !String(x || "").trim() || /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(String(x).trim()) ? "" : "Blank for all day, or like 08:00-18:00." });
  });
  ui.form({ title: "Speeds · " + name, submit: "Save speeds", intro: "Only what is set here is kept here; everything else follows " + (d.level === "centre" ? "the region, then the network" : "the network") + ", so a change there still reaches it. Gateways pick changes up at their next fetch.",
    values, fields,
    onSubmit: async v => {
      const out = {};
      Object.keys(eff).forEach(k => { out[k] = v[k + "|own"] ? { down: +v[k + "|down"], up: +v[k + "|up"], devices: +v[k + "|devices"], hours: String(v[k + "|hours"] || "").trim() } : null; });
      try { return await NGGApi.admin.wifi.profilesSet(where, out); } catch (e) { throw new Error(cwErr(e, "Couldn’t save.")); }
    },
    done: () => { ui.toast("Speeds saved · " + name); ctx.reload(); } });
}

/* Speed tests. */
function CwSpeed({ ctx }) {
  const { base, ui } = ctx;
  const [centre, setCentre] = React.useState(base.centres[0] || ""), [note, setNote] = React.useState("");
  const [step, setStep] = React.useState(""), [res, setRes] = React.useState(null), [err, setErr] = React.useState("");
  const run = async () => {
    setErr(""); setRes(null); setStep("Starting…");
    try {
      const r = await NGGApi.admin.wifi.speedTest(setStep);
      await NGGApi.admin.wifi.speedSave({ centre, note, downMbps: r.downMbps, upMbps: r.upMbps, rttMs: r.rttMs });
      setRes(r); ui.toast("Saved · " + centre); ctx.reload();
    } catch (e) { setErr(cwErr(e, "The test couldn’t finish — is this device online?")); }
    finally { setStep(""); }
  };
  const tests = base.speedTests || [];
  const latest = {};
  tests.forEach(t => { if (!latest[t.centre]) latest[t.centre] = t; });
  return <>
    <CwCard title="Test this connection" sub="Run it on the centre’s Wi-Fi, from where people sit. It measures this device’s line to NGG and keeps the result. About 20 MB.">
      <div className="cw-test">
        <label className="cw-field is-inline"><span>Centre</span><select value={centre} onChange={e => setCentre(e.target.value)}>{base.centres.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="cw-field is-inline is-grow"><span>Where and when</span><input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="e.g. Main hall, Saturday 10am, about 30 people on"/></label>
        <CwBtn primary icon="gauge" disabled={!!step || !centre} onClick={run}>{step ? "Testing…" : "Start the test"}</CwBtn>
      </div>
      {step ? <p className="cw-step" role="status" aria-live="polite">{step}</p> : null}
      {err ? <CwError e={{ message: err, data: { message: err } }}/> : null}
      {res ? <div className="cw-stats is-3 cw-result" role="status"><CwStat l="Download" v={cwMbps(res.downMbps)} tone={res.downMbps < base.slowMbps ? "bad" : ""} s={res.downMbps < base.slowMbps ? "Slow: lessons and videos stall" : ""}/><CwStat l="Upload" v={cwMbps(res.upMbps)}/><CwStat l="Delay" v={res.rttMs + " ms"} tone={res.rttMs > 300 ? "warn" : ""} s={res.rttMs > 300 ? "Pages will feel slow" : ""}/></div> : null}
    </CwCard>
    <CwCard title="Each centre’s line" sub="The newest test for each centre you look after" flush>
      <div className="cw-tablewrap"><table className="cw-table"><thead><tr><th scope="col">Centre</th><th scope="col">Down</th><th scope="col">Up</th><th scope="col">Delay</th><th scope="col">Measured</th></tr></thead>
        <tbody>{base.centres.map(c => { const t = latest[c]; return <tr key={c}><td><b className="cw-w">{c}</b><small>{t ? (t.source === "gateway" ? "by its gateway" : "from a device" + (t.by ? ", " + t.by : "")) : "Not measured yet"}</small></td>
          <td>{t ? <span className={t.downMbps < base.slowMbps ? "cw-bad" : ""}>{cwMbps(t.downMbps)}</span> : "—"}</td><td>{t ? cwMbps(t.upMbps) : "—"}</td><td>{t && t.rttMs ? t.rttMs + " ms" : "—"}</td><td>{t ? cwAgo(t.at) : "—"}{t && t.note ? <small>{t.note}</small> : null}</td></tr>; })}</tbody></table></div>
    </CwCard>
  </>;
}


/* Data used (admin.wifi.usage): per person, against their allowance. Amounts only. */
const cwBytes = b => { b = +b || 0; return b >= 1073741824 ? (Math.round(b / 107374182.4) / 10) + " GB" : b >= 1048576 ? Math.round(b / 1048576) + " MB" : b > 0 ? Math.max(1, Math.round(b / 1024)) + " KB" : "0"; };
function CwUsage({ ctx }) {
  const { base, go } = ctx;
  const [period, setPeriod] = React.useState("month"), [centre, setCentre] = React.useState(""), [q, setQ] = React.useState(""), [page, setPage] = React.useState(1);
  const [u, setU] = React.useState(null), [err, setErr] = React.useState(null);
  const load = () => { setErr(null); setU(null); NGGApi.admin.wifi.usage({ period, centre, q: q.trim(), page }).then(setU, setErr); };
  React.useEffect(load, [period, centre, page, ctx.bump]);
  const when = { day: "today", week: "in the last 7 days", month: "this month" }[period];
  const allow = r => [r.dayMb ? cwBytes(r.dayMb * 1048576) + " a day" : "", r.monthMb ? cwBytes(r.monthMb * 1048576) + " a month" : ""].filter(Boolean).join(" · ") || "No allowance";
  const pages = u ? Math.max(1, Math.ceil(u.total / u.pageSize)) : 1;
  const gw = (u && u.gateways) || { total: 0, counting: 0, canCount: 0 };
  return <>
    <div className="cw-bar">
      <div className="cw-bar-l">
        <CwSelect label="Period" value={period} onChange={v => { setPeriod(v); setPage(1); }} opts={[["day", "Today"], ["week", "Last 7 days"], ["month", "This month"]]}/>
        {base.centres.length > 1 ? <CwSelect label="Centre" value={centre} onChange={v => { setCentre(v); setPage(1); }} opts={[["", "Every centre"]].concat(base.centres.map(c => [c, c]))}/> : null}
      </div>
      <form className="cw-bar-r cw-lookup" role="search" onSubmit={e => { e.preventDefault(); setPage(1); load(); }}><CwSearch value={q} onChange={setQ} ph="Find a person"/><button type="submit" className="cw-btn">Find</button></form>
    </div>
    {err ? <CwError e={err} retry={load}/> : !u ? <CwLoading/> : <>
      <div className="cw-stats">
        <CwStat l={"Data used " + when} v={cwBytes(u.bytes)} s={cwN(u.total) + (u.total === 1 ? " person" : " people")}/>
        <CwStat l="Over their allowance" v={cwN(u.over)} s={u.over ? "on the slow profile, or off" : "nobody"} tone={u.over ? "bad" : ""}/>
        <CwStat l="Gateways reporting it" v={cwN(gw.counting) + " of " + cwN(gw.total)} s={gw.canCount < gw.total ? cwN(gw.total - gw.canCount) + " can’t report it yet" : "in the last day"}/>
        <CwStat l="Centres" v={cwN(u.centres.length)} s={"with data used " + when}/>
      </div>
      <CwCard title="Each person" sub={"Heaviest first · " + when} flush right={<CwBtn onClick={() => go("wifi-access")}>Set allowances</CwBtn>}>
        {!u.people.length ? <CwEmpty>{gw.counting ? "Nobody has used any data " + when + "." : "No gateway is reporting data used yet. A MikroTik gateway starts once its setup script is run again (Setup)."}</CwEmpty> :
        <div className="cw-tablewrap"><table className="cw-table"><caption className="cw-sr">Data used by each person {when}</caption><thead><tr><th scope="col">Person</th><th scope="col">Centre</th><th scope="col">Used</th><th scope="col">Today</th><th scope="col">This month</th><th scope="col">Allowance</th></tr></thead>
          <tbody>{u.people.map(r => <tr key={r.subjectType + r.subjectId}><td><b className="cw-w">{r.name}</b><small>{[r.id, r.who === "staff" ? "Staff" : r.who === "summer" ? "Summer School" : "Member"].filter(Boolean).join(" · ")}</small></td>
            <td>{r.centre || "—"}</td><td>{cwBytes(r.bytes)}</td><td>{cwBytes(r.today)}</td><td>{cwBytes(r.month)}</td>
            <td>{r.over ? <CwPill tone="bad" t={"Over " + (r.over === "day" ? "today’s" : "this month’s")}/> : allow(r)}</td></tr>)}</tbody></table></div>}
        {pages > 1 ? <div className="cw-pager"><button type="button" className="cw-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span role="status">Page {page} of {pages}</span><button type="button" className="cw-btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div> : null}
      </CwCard>
      <p className="cw-foot"><i className="ph ph-eye-slash" aria-hidden="true"/>Amounts only, per day: never which sites, never when in the day. Members see their own in the app (Me → Wi-Fi); families don’t see them.</p>
    </>}
  </>;
}

/* Who gets on: the lookup, and the speeds at your level. */
function CwAccess({ ctx }) {
  const { base, ui } = ctx;
  const [q, setQ] = React.useState(""), [res, setRes] = React.useState(null), [busy, setBusy] = React.useState(false);
  const look = async e => { e.preventDefault(); if (q.trim().length < 2) return; setBusy(true); try { setRes((await NGGApi.admin.wifi.lookup(q.trim())).results || []); } catch (er) { ui.toast(cwErr(er, "Couldn’t look them up."), true); } finally { setBusy(false); } };
  const all = base.scope.all;
  return <>
    <CwCard title="Why can’t somebody get on?" sub="Their printed ID, record id or name. You see whether they have Wi-Fi and why — never their PIN.">
      <form className="cw-lookup" role="search" onSubmit={look}><CwSearch value={q} onChange={setQ} ph="e.g. 026-014 or Ada"/><button type="submit" className="cw-btn is-primary" disabled={busy || q.trim().length < 2}>{busy ? "Looking…" : "Look them up"}</button></form>
      {res == null ? null : !res.length ? <CwEmpty>Nobody found at your centres. Try their printed ID.</CwEmpty> :
        <ul className="cw-list" aria-live="polite">{res.map(x => { const a = CW_ACCESS.find(y => y[0] === x.access) || [x.access, x.access];
          return <li key={x.subjectType + x.subjectId}><span><b>{x.name}</b><small>{(x.username || x.subjectId) + " · " + x.centre + " · " + (x.why || "")}</small></span>
            <span className="cw-li-r"><CwPill tone={x.access === "on" ? "ok" : x.access === "limited" ? "warn" : "neutral"} t={a[1]}/>{x.canChange ? <CwBtn onClick={() => cwPersonForm(ctx, x)}>Change</CwBtn> : null}</span></li>; })}</ul>}
    </CwCard>
    <CwCard title="Speeds" sub={all ? "The network’s defaults, and any centre’s own." : "Your centres’ own speeds. Anything not set follows the region, then the network."} flush>
      <ul className="cw-list">
        {all ? <li><span><b>Network defaults</b><small>Every centre that sets nothing of its own</small></span><CwBtn onClick={() => cwNetworkForm(ctx)}>Change</CwBtn></li> : null}
        {base.centres.slice(0, all ? 0 : 50).map(c => <li key={c}><span><b>{c}</b><small>This centre’s own speeds</small></span><CwBtn onClick={() => cwSpeedsForm(ctx, { centre: c }, c)}>Speeds</CwBtn></li>)}
        {all ? <li><span><b>A centre’s own</b><small>Choose the centre</small></span><CwBtn onClick={() => ui.form({ title: "Which centre?", submit: "Open its speeds", values: { c: base.centres[0] }, fields: [{ id: "c", l: "Centre", type: "select", opts: base.centres.map(c => [c, c]) }], onSubmit: async v => v, done: v => cwSpeedsForm(ctx, { centre: v.c }, v.c) })}>Choose</CwBtn></li> : null}
      </ul>
    </CwCard>
    <CwCard title="Who gets on" sub="From people’s records, for the whole programme" flush>
      <ul className="cw-list">{(base.cases || []).map(c => <li key={c.case}><span><b>{c.words}</b><small>{c.locked ? "Always off" : c.access !== c.default ? "Changed from " + c.default : "The default"}</small></span>
        <CwPill tone={c.access === "on" ? "ok" : c.access === "limited" ? "warn" : "neutral"} t={(CW_ACCESS.find(a => a[0] === c.access) || [0, c.access])[1]}/></li>)}</ul>
      {all ? <div className="cw-card-f"><CwBtn onClick={() => cwNetworkForm(ctx, true)}>Change who gets on</CwBtn></div> : <p className="cw-foot is-in">The table is the programme’s, set by somebody who looks after every centre.</p>}
    </CwCard>
  </>;
}

function cwPersonForm(ctx, x) {
  const { ui } = ctx;
  ui.form({ title: x.name + "’s Wi-Fi", submit: "Save", intro: "Wi-Fi follows the record. Set it by hand only for the exceptions; it never undoes a suspension. To give them a new PIN, choose that below.",
    values: { op: "override", access: x.override ? x.override.access : x.access, why: "" },
    fields: [
      { id: "op", l: "What to do", type: "chips", opts: [["override", "Set by hand"]].concat(x.override ? [["clear", "Clear the hand-set access"]] : [], x.access !== "off" ? [["resetPin", "Give a new PIN"]] : []) },
      { id: "access", l: "Wi-Fi", type: "chips", opts: CW_ACCESS, when: v => v.op === "override" },
      { id: "why", l: "Why", max: 255, ph: "e.g. Alumni mentor on Saturdays", when: v => v.op === "override", check: (w, v) => v.op === "override" && !String(w || "").trim() ? "Say why, so the next person to look knows." : "" },
    ],
    onSubmit: async v => { try { return await NGGApi.admin.wifi.memberSet(x.subjectType, x.subjectId, v.op, v.op === "override" ? { access: v.access, why: v.why } : null); } catch (e) { throw new Error(cwErr(e, "Couldn’t save.")); } },
    done: (v) => ui.toast(v.op === "resetPin" ? "New PIN made. They see it in the app under Me → Wi-Fi." : "Saved · " + x.name) });
}

/* The network's table and default speeds (somebody who sees every centre). */
function cwNetworkForm(ctx, cases) {
  const { base, ui } = ctx;
  if (cases) {
    const values = { feesRule: !!base.feesRule }, fields = [];
    (base.cases || []).filter(c => !c.locked).forEach(c => { values[c.case] = c.access; fields.push({ id: c.case, l: c.words, type: "chips", opts: CW_ACCESS, help: c.access !== c.default ? "The default is " + c.default + "." : "" }); });
    fields.push({ id: "feesRule", l: "Fees owing changes Wi-Fi", type: "switch", help: "Off: fees never touch Wi-Fi." });
    return ui.form({ title: "Who gets on", submit: "Save", intro: "For the whole programme. Suspended, evicted and inactive records are always off.", values, fields,
      onSubmit: async v => { const out = { cases: {} }; (base.cases || []).filter(c => !c.locked).forEach(c => { if (v[c.case] !== c.access) out.cases[c.case] = v[c.case]; }); if (!!v.feesRule !== !!base.feesRule) out.feesRule = !!v.feesRule;
        try { return await NGGApi.admin.wifi.accessSet(out); } catch (e) { throw new Error(cwErr(e, "Couldn’t save.")); } },
      done: () => { ui.toast("Saved. Gateways pick it up at their next fetch."); ctx.reload(); } });
  }
  const values = {}, fields = [];
  Object.keys(base.profiles || {}).forEach(k => {
    const p = base.profiles[k];
    values[k + "|down"] = String(p.down); values[k + "|up"] = String(p.up); values[k + "|devices"] = String(p.devices); values[k + "|hours"] = p.hours || ""; values[k + "|burst"] = !!p.burst; values[k + "|priority"] = String(p.priority || 5); values[k + "|dayMb"] = String(p.dayMb || 0); values[k + "|monthMb"] = String(p.monthMb || 0);
    const n = (lo, hi) => x => /^\d+$/.test(String(x).trim()) && +x >= lo && +x <= hi ? "" : "A whole number from " + lo + " to " + hi + ".";
    fields.push({ id: k + "|down", l: (CW_PROFILE[k] || k) + " · download (Mbit/s)", num: true, check: n(1, 1000) }, { id: k + "|up", l: "Upload (Mbit/s)", num: true, check: n(1, 1000) },
      { id: k + "|devices", l: "Devices at once", num: true, check: n(1, 5) }, { id: k + "|hours", l: "Hours", ph: "All day, or 08:00-18:00" },
      { id: k + "|burst", l: "Fast page loads (burst)", type: "switch", help: "Twice the speed for the first seconds. MikroTik." }, { id: k + "|priority", l: "When the line is busy", type: "select", opts: [["1", "1 · first"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5 · middle"], ["6", "6"], ["7", "7"], ["8", "8 · last"]] });
    if (k !== "ngg-limited") fields.push({ id: k + "|dayMb", l: "Data allowance a day (MB)", num: true, check: n(0, 10000000), help: "0 for none. 1 GB is 1024 MB." }, { id: k + "|monthMb", l: "Data allowance a month (MB)", num: true, check: n(0, 10000000), help: "0 for none. Counted across every centre, from the 1st." });
  });
  ui.form({ title: "Network default speeds", submit: "Save", intro: "Every centre and region that sets nothing of its own uses these.", values, fields,
    onSubmit: async v => { const out = { profiles: {} }; Object.keys(base.profiles || {}).forEach(k => { out.profiles[k] = { down: +v[k + "|down"], up: +v[k + "|up"], devices: +v[k + "|devices"], hours: String(v[k + "|hours"] || "").trim(), burst: !!v[k + "|burst"], priority: +v[k + "|priority"], dayMb: +(v[k + "|dayMb"] || 0), monthMb: +(v[k + "|monthMb"] || 0) }; });
      try { return await NGGApi.admin.wifi.accessSet(out); } catch (e) { throw new Error(cwErr(e, "Couldn’t save.")); } },
    done: () => { ui.toast("Saved. Gateways pick it up at their next fetch."); ctx.reload(); } });
}

/* Setup: the platforms, side by side. */
function CwSetup({ ctx }) {
  const pl = ctx.base.platforms || [];
  const can = [["profiles", "Speeds per person"], ["devices", "Devices at once"], ["kick", "Signs out somebody removed"], ["remember", "Remembers the device"], ["filter", "Filtering for under-18s"]];
  return <>
    <CwCard title="How it fits together"><p className="cw-p">NGG can’t reach a centre’s network, so each centre’s gateway fetches its list from NGG every one to five minutes, over HTTPS, with its own key. Somebody suspended is signed out at the next fetch; a gateway that can’t reach NGG keeps the people it already has. Add a gateway to get its step-by-step guide and script, with its key filled in.</p></CwCard>
    <CwCard title="Which gateway" sub="What each can do with NGG’s list" flush>
      <div className="cw-tablewrap"><table className="cw-table"><thead><tr><th scope="col">Platform</th><th scope="col">Status</th>{can.map(c => <th key={c[0]} scope="col">{c[1]}</th>)}</tr></thead>
        <tbody>{pl.map(p => <tr key={p.id}><td><span className="cw-cell"><i className={"ph ph-" + cwIcon(p.id)} aria-hidden="true"/><span><b>{p.label}</b></span></span></td><td><CwPill tone={p.status === "pilot" ? "warn" : "ok"} t={p.status === "pilot" ? "Pilot first" : "Ready"}/></td>
          {can.map(c => <td key={c[0]}>{p.can[c[0]] ? <i className="ph ph-check cw-yes" aria-label="Yes"/> : <span className="cw-no">No</span>}</td>)}</tr>)}</tbody></table></div>
    </CwCard>
    <div className="cw-grid">{pl.map(p => <div key={p.id} className="cw-tile is-static"><span className="cw-tile-h"><b>{p.label}</b><CwPill tone={p.status === "pilot" ? "warn" : "ok"} t={p.status === "pilot" ? "Pilot first" : "Ready"}/></span>
      <span className="cw-tile-s">{p.needs}</span>{p.pilot ? <span className="cw-tile-m"><span>{p.pilot}</span></span> : null}</div>)}</div>
    <p className="cw-foot"><i className="ph ph-shield-check" aria-hidden="true"/>Hours are kept by NGG for every platform. Mobile data and phone hotspots go around any filtering.</p>
  </>;
}

Object.assign(window, { Cp3Wifi, CW_VIEWS, CW_META });
