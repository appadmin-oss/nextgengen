/* ================================================================
   NGG — Summer School Analytics workspace.

   A modern, four-level analytics experience (Executive · Operations ·
   Research · Evidence) in the spirit of Stripe/Linear/GitHub Insights:
   a sticky global filter bar, KPI cards with trend indicators, interactive
   drill-down charts that open side panels (never navigate away), saved
   filter views, and one-click PDF/CSV export for donor & research reporting.

   Backend: api.admin.analytics(filters) → { workspace: {executive, operations,
   research, evidence, rankings, timeline, filters} }. All numbers respect
   per-centre admin scoping.
   ================================================================ */

// ── design tokens (chart palette layered on the site's variables) ────────────
const AN_TONE = { good: "#16a34a", warn: "#f59e0b", bad: "#ef4444", info: "#4C6FFF" };
const AN_SERIES = ["#4C6FFF", "#16a34a", "#f5b026", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#64748b"];
const AN_RATE_TONE = (r) => (r >= 80 ? AN_TONE.good : r >= 55 ? AN_TONE.warn : AN_TONE.bad);
const AN_RATE_LABEL = (r) => (r >= 80 ? "On track" : r >= 55 ? "Watch" : "Needs attention");

function anFmt(n) { return (n === null || n === undefined || n !== n) ? "—" : Number(n).toLocaleString(); }
function anCsv(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function anDownload(name, text, mime) {
  const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// One-time scoped stylesheet.
function AnalyticsStyles() {
  useEffect(() => {
    if (document.getElementById("analytics-css")) return;
    const el = document.createElement("style"); el.id = "analytics-css";
    el.textContent = `
.an-wrap{--an-line:var(--line-cool,#e5e8ee);color:var(--ink-900,#0a1130);}
.an-hero{background:linear-gradient(135deg,#0c1432 0%,#1c2a5e 60%,#28224e 100%);color:#fff;border-radius:var(--r-lg,22px);padding:28px 30px;position:relative;overflow:hidden;}
.an-hero:after{content:"";position:absolute;right:-80px;top:-80px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(245,176,38,.28),transparent 70%);}
.an-live{display:inline-flex;align-items:center;gap:7px;font:600 11px/1 var(--font-mono,monospace);letter-spacing:.14em;text-transform:uppercase;color:#d0ff3a;background:rgba(208,255,58,.1);border:1px solid rgba(208,255,58,.3);padding:5px 10px;border-radius:999px;}
.an-live i{width:7px;height:7px;border-radius:50%;background:#d0ff3a;box-shadow:0 0 0 0 rgba(208,255,58,.6);animation:anpulse 2s infinite;}
@keyframes anpulse{0%{box-shadow:0 0 0 0 rgba(208,255,58,.55)}70%{box-shadow:0 0 0 9px rgba(208,255,58,0)}100%{box-shadow:0 0 0 0 rgba(208,255,58,0)}}
.an-herostats{display:flex;flex-wrap:wrap;gap:30px;margin-top:20px;}
.an-herostat .v{font:800 34px/1 var(--font-display,sans-serif);}
.an-herostat .l{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-top:6px;}
.an-bar{position:sticky;top:0;z-index:30;background:rgba(251,247,237,.92);backdrop-filter:blur(8px);border:1px solid var(--an-line);border-radius:var(--r-md,14px);padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:18px 0;box-shadow:var(--shadow-sm);}
.an-field{display:flex;flex-direction:column;gap:3px;}
.an-field label{font:600 9px/1 var(--font-mono,monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-400,#8088a6);padding-left:2px;}
.an-field select,.an-field input{font-size:13px;padding:7px 9px;border:1px solid var(--an-line);border-radius:9px;background:#fff;color:var(--ink-900);min-width:120px;}
.an-spacer{flex:1 1 auto;}
.an-chip{font-size:12px;font-weight:600;padding:7px 11px;border-radius:9px;border:1px solid var(--an-line);background:#fff;color:var(--ink-700,#2a335c);cursor:pointer;display:inline-flex;gap:6px;align-items:center;}
.an-chip:hover{border-color:var(--ink-300,#b8bfd6);}
.an-chip.on{background:var(--navy-900,#0c1432);color:#fff;border-color:var(--navy-900);}
.an-menu{position:relative;}
.an-pop{position:absolute;right:0;top:calc(100% + 6px);background:#fff;border:1px solid var(--an-line);border-radius:12px;box-shadow:var(--shadow-lg);padding:6px;min-width:210px;z-index:40;}
.an-pop button{display:flex;justify-content:space-between;gap:12px;width:100%;text-align:left;background:none;border:none;padding:8px 10px;border-radius:8px;font-size:13px;color:var(--ink-900);cursor:pointer;}
.an-pop button:hover{background:var(--cream-100,#f3ecdb);}
.an-pop .x{color:var(--ink-400);}
.an-levelnav{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 6px;}
.an-levelnav a{font:600 12px/1 var(--font-body);text-decoration:none;color:var(--ink-500);padding:7px 12px;border-radius:999px;border:1px solid transparent;}
.an-levelnav a:hover{background:#fff;border-color:var(--an-line);color:var(--ink-900);}
.an-sec{margin-top:34px;scroll-margin-top:80px;}
.an-eyebrow{font:700 11px/1 var(--font-mono,monospace);letter-spacing:.16em;text-transform:uppercase;color:var(--gold-700,#7a5600);}
.an-h{font:800 clamp(22px,3vw,30px)/1.05 var(--font-display,sans-serif);margin:8px 0 2px;letter-spacing:-.01em;}
.an-sub{color:var(--ink-500);font-size:14px;margin:0 0 16px;max-width:60ch;}
.an-grid{display:grid;gap:14px;}
.an-kpis{grid-template-columns:repeat(auto-fill,minmax(190px,1fr));}
.an-card{background:#fff;border:1px solid var(--an-line);border-radius:var(--r-md,14px);padding:16px;box-shadow:var(--shadow-sm);}
.an-card.click{cursor:pointer;transition:transform .12s,box-shadow .12s,border-color .12s;}
.an-card.click:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);border-color:var(--ink-300);}
.an-kpi .top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}
.an-kpi .ico{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:16px;background:var(--cream-100,#f3ecdb);}
.an-kpi .val{font:800 30px/1 var(--font-display,sans-serif);margin:12px 0 3px;letter-spacing:-.02em;}
.an-kpi .lab{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-400);}
.an-kpi .foot{font-size:12px;color:var(--ink-500);margin-top:9px;}
.an-trend{display:inline-flex;align-items:center;gap:3px;font:700 12px/1 var(--font-mono,monospace);padding:3px 7px;border-radius:999px;}
.an-two{grid-template-columns:1fr 1fr;}
.an-three{grid-template-columns:2fr 1fr;}
@media(max-width:900px){.an-two,.an-three{grid-template-columns:1fr;}}
.an-rank{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line-cool-soft,#eef0f4);}
.an-rank:last-child{border-bottom:none;}
.an-rank .n{font:800 14px/1 var(--font-mono);color:var(--ink-300);width:22px;}
.an-rank .track{flex:1;height:8px;border-radius:999px;background:var(--cream-100);overflow:hidden;}
.an-rank .track i{display:block;height:100%;border-radius:999px;}
.an-tbl{width:100%;border-collapse:collapse;font-size:13px;}
.an-tbl th{text-align:left;font:600 10px/1 var(--font-mono);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-400);padding:8px 10px;border-bottom:1px solid var(--an-line);}
.an-tbl td{padding:9px 10px;border-bottom:1px solid var(--line-cool-soft);}
.an-tbl tr:last-child td{border-bottom:none;}
.an-pill{font:600 11px/1 var(--font-mono);padding:4px 8px;border-radius:999px;display:inline-block;}
.an-drill{position:fixed;inset:0;z-index:120;display:flex;justify-content:flex-end;}
.an-drill .scrim{position:absolute;inset:0;background:rgba(10,17,48,.4);backdrop-filter:blur(2px);}
.an-drawer{position:relative;width:min(460px,92vw);background:var(--paper,#fbf7ed);height:100%;overflow-y:auto;box-shadow:var(--shadow-lg);border-left:1px solid var(--an-line);animation:anslide .22s ease;}
@keyframes anslide{from{transform:translateX(30px);opacity:.4}to{transform:translateX(0);opacity:1}}
.an-drawer .head{position:sticky;top:0;background:var(--paper);border-bottom:1px solid var(--an-line);padding:16px 20px;display:flex;justify-content:space-between;align-items:center;}
.an-ev{display:flex;gap:8px;flex-wrap:wrap;}
.an-evtype{font:600 11px/1 var(--font-mono);padding:5px 9px;border-radius:8px;background:var(--cream-100);color:var(--ink-700);text-transform:capitalize;}
.an-gal{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));}
.an-thumb{aspect-ratio:16/10;border-radius:10px;overflow:hidden;background:var(--cream-200);display:grid;place-items:center;color:var(--ink-400);font-size:26px;}
.an-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
.an-empty{color:var(--ink-400);font-size:13px;padding:22px;text-align:center;border:1px dashed var(--an-line);border-radius:12px;}
`;
    document.head.appendChild(el);
  }, []);
  return null;
}

// ── trend indicator ──────────────────────────────────────────────────────────
function AnTrend({ delta, suffix }) {
  if (delta === null || delta === undefined) return null;
  const up = delta > 0, flat = delta === 0;
  const tone = flat ? "#64748b" : up ? AN_TONE.good : AN_TONE.bad;
  const bg = flat ? "rgba(100,116,139,.1)" : up ? "rgba(22,163,74,.12)" : "rgba(239,68,68,.12)";
  return <span className="an-trend" style={{ color: tone, background: bg }}>
    {flat ? "→" : up ? "▲" : "▼"} {Math.abs(delta)}{suffix || "%"}
  </span>;
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function AnKpi({ icon, value, label, foot, trend, onClick }) {
  return <div className={"an-card an-kpi" + (onClick ? " click" : "")} onClick={onClick}
    role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}>
    <div className="top">
      <span className="ico">{icon}</span>
      {trend !== undefined && <AnTrend delta={trend}/>}
    </div>
    <div className="val">{value}</div>
    <div className="lab">{label}</div>
    {foot && <div className="foot">{foot}</div>}
  </div>;
}

// ── charts (lightweight SVG) ─────────────────────────────────────────────────
function AnArea({ data, height }) {
  const h = height || 150, w = 640, pad = 6;
  if (!data || !data.length) return <div className="an-empty">No attendance in this range yet.</div>;
  const max = Math.max(1, ...data.map(d => d.present));
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const y = v => h - pad - (v / max) * (h - pad * 2 - 14);
  const pts = data.map((d, i) => [pad + i * step, y(d.present)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${pad + (data.length - 1) * step} ${h - pad} L${pad} ${h - pad} Z`;
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="Attendance trend">
    <defs><linearGradient id="anfill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#4C6FFF" stopOpacity="0.28"/><stop offset="1" stopColor="#4C6FFF" stopOpacity="0"/>
    </linearGradient></defs>
    <path d={area} fill="url(#anfill)"/>
    <path d={line} fill="none" stroke="#4C6FFF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
    {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={data.length > 20 ? 0 : 3} fill="#fff" stroke="#4C6FFF" strokeWidth="2"/>)}
  </svg>;
}

function AnLine({ data, xKey, yKey, label, color }) {
  const h = 150, w = 560, pad = 10;
  if (!data || data.length < 2) return <div className="an-empty">Not enough data for a trend yet.</div>;
  const ys = data.map(d => d[yKey]);
  const max = Math.max(1, ...ys), min = Math.min(...ys, 0);
  const step = (w - pad * 2) / (data.length - 1);
  const y = v => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2 - 12);
  const pts = data.map((d, i) => [pad + i * step, y(d[yKey])]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label}>
    <path d={line} fill="none" stroke={color || "#16a34a"} strokeWidth="2.5" strokeLinejoin="round"/>
    {pts.map((p, i) => <g key={i}>
      <circle cx={p[0]} cy={p[1]} r="3.5" fill={color || "#16a34a"}/>
      <text x={p[0]} y={h - 1} fontSize="9" fill="#8088a6" textAnchor="middle">{xKey ? data[i][xKey] : i + 1}</text>
    </g>)}
  </svg>;
}

function AnDonut({ segments, unit }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <div className="an-empty">No data recorded.</div>;
  let acc = 0; const R = 54, C = 2 * Math.PI * R;
  return <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
    <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="Distribution">
      <g transform="rotate(-90 65 65)">
        {segments.map((s, i) => {
          const frac = s.value / total, len = frac * C, off = acc * C; acc += frac;
          return <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={s.color || AN_SERIES[i % AN_SERIES.length]}
            strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}/>;
        })}
      </g>
      <text x="65" y="61" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0a1130">{anFmt(total)}</text>
      <text x="65" y="78" textAnchor="middle" fontSize="9" fill="#8088a6" style={{ letterSpacing: ".1em" }}>{(unit || "TOTAL").toUpperCase()}</text>
    </svg>
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {segments.map((s, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: s.color || AN_SERIES[i % AN_SERIES.length] }}/>
        <b>{s.label}</b><span style={{ color: "var(--ink-500)" }}>{anFmt(s.value)} · {Math.round(s.value / total * 100)}%</span>
      </div>)}
    </div>
  </div>;
}

function AnScatter({ points, corr }) {
  const h = 260, w = 420, pad = 34;
  if (!points || !points.length) return <div className="an-empty">No graded students in this range yet.</div>;
  const cx = v => pad + (v / 100) * (w - pad * 2);
  const cy = v => h - pad - (v / 100) * (h - pad * 2);
  const centreColor = {}; let ci = 0;
  return <div>
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Attendance vs performance">
      {[0, 25, 50, 75, 100].map(g => <g key={g}>
        <line x1={pad} y1={cy(g)} x2={w - pad} y2={cy(g)} stroke="#eef0f4"/>
        <text x={pad - 6} y={cy(g) + 3} fontSize="9" fill="#b8bfd6" textAnchor="end">{g}</text>
        <text x={cx(g)} y={h - pad + 14} fontSize="9" fill="#b8bfd6" textAnchor="middle">{g}</text>
      </g>)}
      {points.map((p, i) => {
        if (!(p.centre in centreColor)) centreColor[p.centre] = AN_SERIES[ci++ % AN_SERIES.length];
        return <circle key={i} cx={cx(p.x)} cy={cy(p.y)} r="5" fill={centreColor[p.centre]} fillOpacity="0.75" stroke="#fff"/>;
      })}
      <text x={w / 2} y={h - 4} fontSize="10" fill="#5a6488" textAnchor="middle">Attendance rate →</text>
      <text x={12} y={h / 2} fontSize="10" fill="#5a6488" textAnchor="middle" transform={`rotate(-90 12 ${h / 2})`}>Avg grade →</text>
    </svg>
    {corr !== null && corr !== undefined && <p className="an-sub" style={{ marginTop: 8 }}>
      Pearson correlation <b style={{ color: corr >= 0.4 ? AN_TONE.good : corr <= -0.4 ? AN_TONE.bad : "var(--ink-700)" }}>r = {corr}</b>
      {" "}— {Math.abs(corr) >= 0.6 ? "strong" : Math.abs(corr) >= 0.3 ? "moderate" : "weak"} {corr >= 0 ? "positive" : "negative"} link between attendance and academic performance.
    </p>}
  </div>;
}

// ── drill-down side panel ────────────────────────────────────────────────────
function AnDrill({ open, title, rows, loading, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const cols = rows && rows.length ? Object.keys(rows[0]) : [];
  return <div className="an-drill" onMouseDown={onClose}>
    <div className="scrim"/>
    <div className="an-drawer" onMouseDown={e => e.stopPropagation()}>
      <div className="head">
        <div><div className="an-eyebrow">Drill-down</div><h3 style={{ margin: "4px 0 0", fontSize: 18 }}>{title}</h3></div>
        <button className="an-chip" onClick={onClose}>Close ✕</button>
      </div>
      <div style={{ padding: 20 }}>
        {loading ? <div className="an-empty">Loading records…</div>
          : !rows || !rows.length ? <div className="an-empty">No matching records.</div>
          : <><p className="an-sub">{rows.length} record{rows.length === 1 ? "" : "s"}</p>
            <table className="an-tbl"><thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(c => <td key={c}>{String(r[c] ?? "")}</td>)}</tr>)}</tbody>
            </table></>}
      </div>
    </div>
  </div>;
}

// ── filter bar ───────────────────────────────────────────────────────────────
function AnFilterBar({ filters, opts, onChange, views, onSaveView, onApplyView, onDeleteView, onExport, onReset }) {
  const [vOpen, setVOpen] = useState(false);
  const [xOpen, setXOpen] = useState(false);
  const set = (k, v) => onChange({ ...filters, [k]: v });
  return <div className="an-bar">
    <div className="an-field"><label>Week</label>
      <select value={filters.week} onChange={e => onChange({ ...filters, week: e.target.value, day: "" })}>
        <option value="">All weeks</option>{opts.weeks.map(w => <option key={w} value={w}>{w}</option>)}
      </select></div>
    <div className="an-field"><label>Day</label>
      <input type="date" value={filters.day} onChange={e => onChange({ ...filters, day: e.target.value, week: "" })}/></div>
    <div className="an-field"><label>Centre</label>
      <select value={filters.centre} onChange={e => set("centre", e.target.value)}>
        <option value="">All centres</option>{opts.centres.map(c => <option key={c} value={c}>{c}</option>)}
      </select></div>
    <div className="an-field"><label>Department</label>
      <select value={filters.department} onChange={e => set("department", e.target.value)}>
        <option value="">All departments</option>{opts.departments.map(d => <option key={d} value={d}>{d}</option>)}
      </select></div>
    <div className="an-field"><label>Category</label>
      <select value={filters.category} onChange={e => set("category", e.target.value)}>
        <option value="">All categories</option>{opts.categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select></div>
    <div className="an-spacer"/>
    <div className="an-menu">
      <button className="an-chip" onClick={() => { setVOpen(v => !v); setXOpen(false); }}>★ Saved views ▾</button>
      {vOpen && <div className="an-pop" onMouseLeave={() => setVOpen(false)}>
        <button onClick={() => { const n = prompt("Name this view (e.g. \"Week 3 – All Centres\")"); if (n) onSaveView(n); setVOpen(false); }}>＋ Save current view</button>
        {views.length > 0 && <div style={{ height: 1, background: "var(--an-line)", margin: "5px 0" }}/>}
        {views.map(v => <button key={v.name} onClick={() => { onApplyView(v); setVOpen(false); }}>
          {v.name}<span className="x" onClick={e => { e.stopPropagation(); onDeleteView(v.name); }}>✕</span>
        </button>)}
        {!views.length && <div style={{ padding: "6px 10px", fontSize: 12, color: "var(--ink-400)" }}>No saved views yet.</div>}
      </div>}
    </div>
    <div className="an-menu">
      <button className="an-chip" onClick={() => { setXOpen(v => !v); setVOpen(false); }}>⭳ Export ▾</button>
      {xOpen && <div className="an-pop" onMouseLeave={() => setXOpen(false)}>
        <button onClick={() => { onExport("pdf"); setXOpen(false); }}>PDF report<span className="x">.pdf</span></button>
        <button onClick={() => { onExport("csv"); setXOpen(false); }}>Centre data<span className="x">.csv</span></button>
        <button onClick={() => { onExport("research"); setXOpen(false); }}>Research tables<span className="x">.csv</span></button>
      </div>}
    </div>
    <button className="an-chip" onClick={onReset}>Reset</button>
  </div>;
}

// ── main workspace ───────────────────────────────────────────────────────────
const AN_BLANK = { week: "", day: "", centre: "", department: "", category: "" };

function AnalyticsWorkspace() {
  const [filters, setFilters] = useState(AN_BLANK);
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [views, setViews] = useState(() => { try { return JSON.parse(localStorage.getItem("ngg.analytics.views") || "[]"); } catch { return []; } });
  const [drill, setDrill] = useState({ open: false, title: "", rows: null, loading: false });

  const load = React.useCallback((f) => {
    setLoading(true); setErr("");
    api.admin.analytics(f).then(r => { setWs(r.workspace); setLoading(false); })
      .catch(e => { setErr(e.message || "Failed to load analytics."); setLoading(false); });
  }, []);
  useEffect(() => { load(filters); }, [filters, load]);

  const saveViews = (next) => { setViews(next); try { localStorage.setItem("ngg.analytics.views", JSON.stringify(next)); } catch {} };
  const onSaveView = (name) => saveViews([...views.filter(v => v.name !== name), { name, filters }]);
  const onApplyView = (v) => setFilters({ ...AN_BLANK, ...v.filters });
  const onDeleteView = (name) => saveViews(views.filter(v => v.name !== name));

  const openDrill = (metric, title) => {
    setDrill({ open: true, title, rows: null, loading: true });
    api.admin.analyticsDrill(metric, filters).then(r => setDrill({ open: true, title, rows: r.rows, loading: false }))
      .catch(() => setDrill({ open: true, title, rows: [], loading: false }));
  };

  const onExport = (kind) => {
    if (!ws) return;
    if (kind === "csv") {
      const rows = [["Centre", "Enrolled", "Present today", "Attendance %", "Avg grade", "Activities", "Stars"]];
      ws.research.centreComparison.forEach(c => rows.push([c.name, c.enrolled, c.presentToday, c.attendanceRate, c.avgGrade ?? "", c.activities, c.stars]));
      anDownload("ngg-centres-" + (ws.filters.rangeLabel || "all") + ".csv", rows.map(r => r.map(anCsv).join(",")).join("\n"), "text/csv");
    } else if (kind === "research") {
      const out = [];
      out.push("Gender analysis"); out.push(["Gender", "Count", "Attendance %", "Avg grade"].join(","));
      ws.research.gender.forEach(g => out.push([g.gender, g.count, g.attendanceRate, g.avgGrade ?? ""].map(anCsv).join(",")));
      out.push(""); out.push("Age analysis"); out.push(["Band", "Count", "Attendance %", "Avg grade"].join(","));
      ws.research.age.forEach(a => out.push([a.band, a.count, a.attendanceRate, a.avgGrade ?? ""].map(anCsv).join(",")));
      out.push(""); out.push("Statistical summary"); out.push(["Metric", "n", "Mean", "Median", "SD", "Min", "Max"].join(","));
      out.push(["Attendance %", ws.research.stats.attendance.n, ws.research.stats.attendance.mean, ws.research.stats.attendance.median, ws.research.stats.attendance.sd, ws.research.stats.attendance.min, ws.research.stats.attendance.max].join(","));
      out.push(["Grades", ws.research.stats.grades.n, ws.research.stats.grades.mean, ws.research.stats.grades.median, ws.research.stats.grades.sd, ws.research.stats.grades.min, ws.research.stats.grades.max].join(","));
      anDownload("ngg-research-" + (ws.filters.rangeLabel || "all") + ".csv", out.join("\n"), "text/csv");
    } else if (kind === "pdf") {
      exportPdf(ws);
    }
  };

  if (loading && !ws) return <div className="an-wrap"><AnalyticsStyles/><div className="an-empty" style={{ marginTop: 40 }}>Loading analytics…</div></div>;
  if (err) return <div className="an-wrap"><AnalyticsStyles/><div className="an-empty" style={{ marginTop: 40, color: AN_TONE.bad }}>{err}</div></div>;
  if (!ws) return null;

  const ex = ws.executive, op = ws.operations, re = ws.research, ev = ws.evidence, rk = ws.rankings;
  const opts = ws.filters.options;

  return <div className="an-wrap">
    <AnalyticsStyles/>
    {/* Hero */}
    <div className="an-hero">
      <span className="an-live"><i/>Live analytics</span>
      <h1 className="display" style={{ fontSize: "clamp(30px,4.5vw,46px)", margin: "14px 0 4px", lineHeight: 1.02 }}>Summer School Analytics</h1>
      <p style={{ color: "rgba(255,255,255,.7)", margin: 0, fontSize: 14 }}>
        {ws.filters.rangeLabel} · Week {ex.program ? ex.program.week : ""} · Updated {new Date(ws.generatedAt).toLocaleTimeString()} · Scoped to your centres
      </p>
      <div className="an-herostats">
        <div className="an-herostat"><div className="v">{anFmt(ex.totalStudents)}</div><div className="l">Students</div></div>
        <div className="an-herostat"><div className="v" style={{ color: AN_RATE_TONE(ex.attendanceRate) === AN_TONE.bad ? "#ff9b9b" : "#d0ff3a" }}>{ex.attendanceRate}%</div><div className="l">Attendance</div></div>
        <div className="an-herostat"><div className="v">{anFmt(ex.centres)}</div><div className="l">Centres</div></div>
        <div className="an-herostat"><div className="v">{anFmt(ex.activities)}</div><div className="l">Activities</div></div>
        <div className="an-herostat"><div className="v">{ex.bestCentre ? ex.bestCentre.name : "—"}</div><div className="l">Best centre {ex.bestCentre ? `· ${ex.bestCentre.rate}%` : ""}</div></div>
      </div>
    </div>

    {/* Sticky filters + level nav */}
    <AnFilterBar filters={filters} opts={opts} onChange={setFilters}
      views={views} onSaveView={onSaveView} onApplyView={onApplyView} onDeleteView={onDeleteView}
      onExport={onExport} onReset={() => setFilters(AN_BLANK)}/>
    <nav className="an-levelnav" aria-label="Analytics levels">
      <a href="#an-exec">① Executive</a><a href="#an-ops">② Operations</a>
      <a href="#an-research">③ Research</a><a href="#an-evidence">④ Evidence</a>
    </nav>

    {/* ── Level 1 · Executive ── */}
    <section className="an-sec" id="an-exec">
      <div className="an-eyebrow">Level 1 · Executive</div>
      <h2 className="an-h">The headline numbers.</h2>
      <p className="an-sub">For directors and sponsors — the programme at a glance. Cards with a trend badge move week-on-week; click a live tile to drill into the records behind it.</p>
      <div className="an-grid an-kpis">
        <AnKpi icon="🎓" value={anFmt(ex.totalStudents)} label="Total students" foot={`${anFmt(ex.presentToday)} present today`}/>
        <AnKpi icon="🏫" value={anFmt(ex.centres)} label="Centres running"/>
        <AnKpi icon="🧩" value={anFmt(ex.departments)} label="Departments"/>
        <AnKpi icon="📈" value={ex.attendanceRate + "%"} label="Attendance rate" trend={ex.weeklyGrowth}
          foot="vs last week" onClick={() => openDrill("present-today", "Present today")}/>
        <AnKpi icon="📝" value={anFmt(ex.assessments.total)} label="Assessments" foot={`${anFmt(ex.assessments.graded)} graded · ${anFmt(ex.assessments.pending)} pending`}
          onClick={() => openDrill("pending-grading", "Awaiting grading")}/>
        <AnKpi icon="🎨" value={anFmt(ex.activities)} label="Activities logged" onClick={() => openDrill("activities", "Activities in range")}/>
        <AnKpi icon="⚡" value={(ex.weeklyGrowth > 0 ? "+" : "") + ex.weeklyGrowth + "%"} label="Weekly growth" trend={ex.weeklyGrowth}/>
        <AnKpi icon="🏆" value={ex.bestCentre ? ex.bestCentre.name : "—"} label="Best centre" foot={ex.bestCentre ? `${ex.bestCentre.rate}% attendance` : ""}/>
        <AnKpi icon="⭐" value={ex.bestStudent ? ex.bestStudent.name : "—"} label="Top student" foot={ex.bestStudent ? `${ex.bestStudent.centre} · ${ex.bestStudent.attendanceRate}%` : ""}/>
      </div>
    </section>

    {/* Today's timeline */}
    <section className="an-sec">
      <div className="an-eyebrow">Today</div>
      <h2 className="an-h">Today's programme.</h2>
      <div className="an-card">
        {ws.timeline.length === 0 ? <div className="an-empty">Nothing logged for today yet.</div>
          : <div>{ws.timeline.map((t, i) => <div key={i} className="an-rank">
            <span className="an-pill" style={{ background: t.kind === "due" ? "rgba(245,176,38,.16)" : "rgba(76,111,255,.12)", color: t.kind === "due" ? "var(--gold-700)" : AN_TONE.info }}>{t.kind === "due" ? "DUE" : "ACTIVITY"}</span>
            <div style={{ flex: 1 }}><b>{t.title}</b>{t.meta && <span style={{ color: "var(--ink-500)", marginLeft: 8, fontSize: 13 }}>{t.meta}</span>}</div>
            {t.by && <span style={{ color: "var(--ink-400)", fontSize: 12 }}>{t.by}</span>}
          </div>)}</div>}
      </div>
    </section>

    {/* Centre rankings */}
    <section className="an-sec">
      <div className="an-eyebrow">Ranked</div>
      <h2 className="an-h">Centre rankings.</h2>
      <div className="an-grid an-two">
        <div className="an-card">
          <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>By attendance</h3>
          {rk.centres.map((c, i) => <div key={c.centreId} className="an-rank">
            <span className="n">{i + 1}</span>
            <div style={{ minWidth: 120 }}><b>{c.name}</b><div style={{ fontSize: 11, color: "var(--ink-400)" }}>{c.code} · {anFmt(c.enrolled)} students</div></div>
            <div className="track"><i style={{ width: c.attendanceRate + "%", background: AN_RATE_TONE(c.attendanceRate) }}/></div>
            <b style={{ width: 44, textAlign: "right", color: AN_RATE_TONE(c.attendanceRate) }}>{c.attendanceRate}%</b>
          </div>)}
        </div>
        <div className="an-card">
          <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Top 5 students</h3>
          {rk.topStudents.length === 0 ? <div className="an-empty">No students yet.</div> : rk.topStudents.map((s, i) => <div key={i} className="an-rank">
            <span className="n">{i + 1}</span>
            <div style={{ flex: 1 }}><b>{s.name}</b><div style={{ fontSize: 11, color: "var(--ink-400)" }}>{s.centre}</div></div>
            <span className="an-pill" style={{ background: "rgba(22,163,74,.12)", color: AN_TONE.good }}>{s.attendanceRate}%</span>
            {s.avgGrade !== null && <span className="an-pill" style={{ background: "var(--cream-100)", color: "var(--ink-700)" }}>{s.avgGrade} avg</span>}
          </div>)}
        </div>
      </div>
    </section>

    {/* ── Level 2 · Operations ── */}
    <section className="an-sec" id="an-ops">
      <div className="an-eyebrow">Level 2 · Operations</div>
      <h2 className="an-h">The working numbers.</h2>
      <p className="an-sub">For centre coordinators — the daily pulse of attendance, teaching activity and outstanding work.</p>
      <div className="an-grid an-three">
        <div className="an-card">
          <h3 style={{ margin: "0 0 2px", fontSize: 15 }}>Daily attendance</h3>
          <p className="an-sub" style={{ margin: "0 0 10px" }}>Distinct students present each day in range.</p>
          <AnArea data={op.daily}/>
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <AnKpi icon="🙋" value={anFmt(ex.presentToday)} label="Present today" onClick={() => openDrill("present-today", "Present today")}/>
          <AnKpi icon="✨" value={op.engagement.engagementPct + "%"} label="Student engagement" foot={`${anFmt(op.engagement.studentsStarred)} recognised · ${op.engagement.avgStarsPerStudent} avg stars`}/>
          <AnKpi icon="🤝" value={anFmt(op.volunteers.active)} label="Active volunteers" foot={`${anFmt(op.volunteers.cleared)} safeguarding-cleared`}/>
        </div>
      </div>
      <div className="an-grid an-two" style={{ marginTop: 14 }}>
        <div className="an-card">
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Teacher activity</h3>
          {op.teacherActivity.length === 0 ? <div className="an-empty">No mentor activity logged in range.</div>
            : <table className="an-tbl"><thead><tr><th>Mentor</th><th>Dept</th><th>Stars</th><th>Ratings</th><th>Activities</th></tr></thead>
              <tbody>{op.teacherActivity.map((t, i) => <tr key={i}><td><b>{t.name}</b></td><td>{t.department || "—"}</td><td>{t.starsGiven}</td><td>{t.ratings}</td><td>{t.activities}</td></tr>)}</tbody></table>}
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <div className="an-card">
            <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Lesson completion</h3>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <div><div className="an-kpi"><div className="val" style={{ fontSize: 26 }}>{anFmt(op.lessonCompletion.submitted)}</div><div className="lab">Submissions</div></div></div>
              <div><div className="an-kpi"><div className="val" style={{ fontSize: 26, color: AN_TONE.good }}>{anFmt(op.lessonCompletion.graded)}</div><div className="lab">Graded</div></div></div>
              <div><div className="an-kpi"><div className="val" style={{ fontSize: 26, color: op.lessonCompletion.pending ? AN_TONE.warn : "var(--ink-900)" }}>{anFmt(op.lessonCompletion.pending)}</div><div className="lab">Pending</div></div></div>
            </div>
          </div>
          <div className="an-card">
            <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Missing reports today {op.missingReports.length > 0 && <span className="an-pill" style={{ background: "rgba(239,68,68,.12)", color: AN_TONE.bad, marginLeft: 6 }}>{op.missingReports.length}</span>}</h3>
            {op.missingReports.length === 0 ? <p className="an-sub" style={{ margin: 0, color: AN_TONE.good }}>✓ Every centre has logged activity today.</p>
              : <p className="an-sub" style={{ margin: 0 }}>Awaiting today's activity from: <b>{op.missingReports.join(", ")}</b> — <a href="#" onClick={e => { e.preventDefault(); openDrill("missing-reports", "Centres missing today's report"); }}>view</a></p>}
          </div>
        </div>
      </div>
      {op.assessmentsDue.length > 0 && <div className="an-card" style={{ marginTop: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Assessments due</h3>
        <table className="an-tbl"><thead><tr><th>Assessment</th><th>Centre</th><th>Week</th><th>Due</th></tr></thead>
          <tbody>{op.assessmentsDue.map((a, i) => <tr key={i}><td><b>{a.title}</b></td><td>{a.centre || "All"}</td><td>{a.week || "—"}</td><td>{a.dueAt ? a.dueAt.slice(0, 10) : "—"}</td></tr>)}</tbody></table>
      </div>}
    </section>

    {/* ── Level 3 · Research ── */}
    <section className="an-sec" id="an-research">
      <div className="an-eyebrow">Level 3 · Research</div>
      <h2 className="an-h">Impact measurement.</h2>
      <p className="an-sub">For M&E and research — the statistical view that turns activity into evidence of impact. Suitable for donor reporting.</p>
      <div className="an-grid an-two">
        <div className="an-card">
          <h3 style={{ margin: "0 0 2px", fontSize: 15 }}>Attendance vs performance</h3>
          <p className="an-sub" style={{ margin: "0 0 6px" }}>Each dot is a student, coloured by centre.</p>
          <AnScatter points={re.scatter} corr={re.correlation}/>
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <div className="an-card"><h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Gender analysis</h3>
            <AnDonut segments={re.gender.map(g => ({ label: g.gender, value: g.count }))} unit="students"/></div>
          <div className="an-card"><h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Longitudinal growth</h3>
            <AnLine data={re.longitudinal} xKey="week" yKey="avgGrade" label="Average grade by week" color="#16a34a"/>
            {re.intervention && <p className="an-sub" style={{ margin: "8px 0 0" }}>
              Pre (wk {re.intervention.preWeek}) <b>{re.intervention.preGrade}</b> → Post (wk {re.intervention.postWeek}) <b>{re.intervention.postGrade}</b> ·
              <b style={{ color: re.intervention.delta >= 0 ? AN_TONE.good : AN_TONE.bad }}> {re.intervention.delta >= 0 ? "+" : ""}{re.intervention.delta} pts ({re.intervention.improvementPct >= 0 ? "+" : ""}{re.intervention.improvementPct}%)</b></p>}
          </div>
        </div>
      </div>
      <div className="an-grid an-two" style={{ marginTop: 14 }}>
        <div className="an-card">
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Age analysis</h3>
          <table className="an-tbl"><thead><tr><th>Age band</th><th>Students</th><th>Attendance</th><th>Avg grade</th></tr></thead>
            <tbody>{re.age.map((a, i) => <tr key={i}><td><b>{a.band}</b></td><td>{a.count}</td><td>{a.attendanceRate}%</td><td>{a.avgGrade ?? "—"}</td></tr>)}</tbody></table>
        </div>
        <div className="an-card">
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Statistical summary</h3>
          <table className="an-tbl"><thead><tr><th>Metric</th><th>n</th><th>Mean</th><th>Median</th><th>SD</th><th>Range</th></tr></thead>
            <tbody>
              <tr><td><b>Attendance %</b></td><td>{re.stats.attendance.n}</td><td>{re.stats.attendance.mean}</td><td>{re.stats.attendance.median}</td><td>{re.stats.attendance.sd}</td><td>{re.stats.attendance.min}–{re.stats.attendance.max}</td></tr>
              <tr><td><b>Grades</b></td><td>{re.stats.grades.n}</td><td>{re.stats.grades.mean}</td><td>{re.stats.grades.median}</td><td>{re.stats.grades.sd}</td><td>{re.stats.grades.min}–{re.stats.grades.max}</td></tr>
            </tbody></table>
        </div>
      </div>
      <div className="an-card" style={{ marginTop: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Centre comparison</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="an-tbl"><thead><tr><th>Centre</th><th>Students</th><th>Attendance</th><th>Avg grade</th><th>Activities</th><th>Stars</th></tr></thead>
            <tbody>{re.centreComparison.map(c => <tr key={c.centreId}>
              <td><b>{c.name}</b></td><td>{anFmt(c.enrolled)}</td>
              <td><span className="an-pill" style={{ background: "rgba(0,0,0,.03)", color: AN_RATE_TONE(c.attendanceRate) }}>{c.attendanceRate}%</span></td>
              <td>{c.avgGrade ?? "—"}</td><td>{anFmt(c.activities)}</td><td>{anFmt(c.stars)}</td></tr>)}</tbody></table>
        </div>
      </div>
    </section>

    {/* Weekly awards */}
    <section className="an-sec">
      <div className="an-eyebrow">Recognition</div>
      <h2 className="an-h">Weekly awards.</h2>
      {rk.awards.length === 0 ? <div className="an-card"><div className="an-empty">No awards minted yet.</div></div>
        : <div className="an-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))" }}>
          {rk.awards.map((a, i) => <div key={i} className="an-card">
            <div style={{ fontSize: 22 }}>{["🥇", "🥈", "🥉"][a.tier] || "🏅"}</div>
            <b style={{ display: "block", marginTop: 6 }}>{a.name}</b>
            <div style={{ color: "var(--ink-500)", fontSize: 13 }}>{a.subject}</div>
            <div style={{ color: "var(--ink-400)", fontSize: 12, marginTop: 4 }}>{a.centre} · {a.period}</div>
          </div>)}
        </div>}
    </section>

    {/* ── Level 4 · Evidence ── */}
    <section className="an-sec" id="an-evidence">
      <div className="an-eyebrow">Level 4 · Evidence</div>
      <h2 className="an-h">The evidence base.</h2>
      <p className="an-sub">Every activity can carry supporting evidence — photos, videos, lesson plans, worksheets, student outputs, attendance sheets, teacher notes. This is what makes the platform auditable for donors and researchers.</p>
      {ev.byType.length > 0 && <div className="an-ev" style={{ marginBottom: 14 }}>
        {ev.byType.map(t => <span key={t.type} className="an-evtype">{t.type} · {t.count}</span>)}
        <span className="an-evtype" style={{ background: "var(--navy-900)", color: "#fff" }}>{ev.total} total artefacts</span>
      </div>}
      {ev.gallery.length === 0 ? <div className="an-card"><div className="an-empty">No evidence logged in this range. Log an activity with attachments to build the evidence base.</div></div>
        : <div className="an-grid an-gal">{ev.gallery.slice(0, 12).map(a => {
          const photo = (a.evidence || []).find(e => e.type === "photo" && e.url);
          return <div key={a.activityId} className="an-card" style={{ padding: 10 }}>
            <div className="an-thumb">{photo ? <img src={photo.url} alt="" loading="lazy"/> : "🖼"}</div>
            <b style={{ display: "block", marginTop: 9, fontSize: 14 }}>{a.title}</b>
            <div style={{ color: "var(--ink-400)", fontSize: 12, margin: "2px 0 6px" }}>{a.category} · {a.centre || "All"} · {a.date}</div>
            <div className="an-ev">{(a.evidence || []).map((e, i) => <span key={i} className="an-evtype" style={{ fontSize: 10 }}>{e.type}</span>)}</div>
          </div>;
        })}</div>}
    </section>

    {/* Downloads & reports */}
    <section className="an-sec" style={{ marginBottom: 40 }}>
      <div className="an-eyebrow">Reporting</div>
      <h2 className="an-h">Downloads & reports.</h2>
      <div className="an-card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" onClick={() => onExport("pdf")}>⭳ PDF report</button>
        <button className="an-chip" onClick={() => onExport("csv")}>Centre data (CSV)</button>
        <button className="an-chip" onClick={() => onExport("research")}>Research tables (CSV)</button>
        <span className="an-sub" style={{ margin: 0 }}>Exports honour the current filter — <b>{ws.filters.rangeLabel}</b>{filters.centre ? ` · ${filters.centre}` : ""}.</span>
      </div>
    </section>

    <AnDrill open={drill.open} title={drill.title} rows={drill.rows} loading={drill.loading} onClose={() => setDrill({ open: false, title: "", rows: null, loading: false })}/>
  </div>;
}

// One-page PDF summary via the vendored jsPDF (lazy-loaded).
async function exportPdf(ws) {
  try {
    if (!(window.jspdf && window.jspdf.jsPDF)) {
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "/vendor/jspdf.umd.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const ex = ws.executive, re = ws.research; let y = 56;
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Summer School Analytics", 40, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
    y += 18; doc.text(`${ws.filters.rangeLabel} · generated ${new Date(ws.generatedAt).toLocaleString()}`, 40, y);
    doc.setTextColor(20); y += 26; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Executive summary", 40, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); y += 16;
    const kv = [
      ["Total students", ex.totalStudents], ["Centres", ex.centres], ["Departments", ex.departments],
      ["Attendance rate", ex.attendanceRate + "%"], ["Weekly growth", (ex.weeklyGrowth > 0 ? "+" : "") + ex.weeklyGrowth + "%"],
      ["Assessments", `${ex.assessments.total} (${ex.assessments.graded} graded)`], ["Activities", ex.activities],
      ["Best centre", ex.bestCentre ? `${ex.bestCentre.name} (${ex.bestCentre.rate}%)` : "—"],
    ];
    kv.forEach(([k, v]) => { doc.text(`${k}:`, 48, y); doc.setFont("helvetica", "bold"); doc.text(String(v), 200, y); doc.setFont("helvetica", "normal"); y += 15; });
    y += 12; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Centre comparison", 40, y); y += 8;
    doc.setFontSize(9);
    const cols = [["Centre", 48], ["Students", 200], ["Att%", 270], ["Grade", 320], ["Acts", 380], ["Stars", 430]];
    y += 12; doc.setFont("helvetica", "bold"); cols.forEach(([t, x]) => doc.text(t, x, y)); doc.setFont("helvetica", "normal"); y += 4;
    doc.setDrawColor(220); doc.line(40, y, 480, y); y += 12;
    re.centreComparison.forEach(c => {
      if (y > 780) { doc.addPage(); y = 56; }
      doc.text(String(c.name).slice(0, 22), 48, y); doc.text(String(c.enrolled), 200, y);
      doc.text(String(c.attendanceRate), 270, y); doc.text(String(c.avgGrade ?? "—"), 320, y);
      doc.text(String(c.activities), 380, y); doc.text(String(c.stars), 430, y); y += 14;
    });
    y += 16; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Statistical summary", 40, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); y += 16;
    doc.text(`Attendance — mean ${re.stats.attendance.mean}%, median ${re.stats.attendance.median}%, SD ${re.stats.attendance.sd} (n=${re.stats.attendance.n})`, 48, y); y += 14;
    doc.text(`Grades — mean ${re.stats.grades.mean}, median ${re.stats.grades.median}, SD ${re.stats.grades.sd} (n=${re.stats.grades.n})`, 48, y);
    doc.save("ngg-analytics-" + (ws.filters.rangeLabel || "all").replace(/\s+/g, "-") + ".pdf");
  } catch (e) { alert("PDF export unavailable: " + (e.message || e)); }
}

Object.assign(window, { AnalyticsWorkspace });
