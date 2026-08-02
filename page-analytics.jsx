/* ================================================================
   NGG — Summer School Analytics workspace.

   A modern, four-level analytics experience (Executive · Operations ·
   Research · Evidence) in the spirit of Stripe/Linear/GitHub Insights:
   a sticky global filter bar, KPI cards with trend indicators, interactive
   drill-down charts that open side panels (never navigate away), saved
   filter views, and one-click PDF/CSV export for donor & research reporting.

   Backend: NGGApi.admin.analytics(filters) → { workspace: {executive, operations,
   research, evidence, rankings, timeline, filters} }. All numbers respect
   per-centre admin scoping.
   ================================================================ */

// ── design tokens (chart palette layered on the site's variables) ────────────
const AN_TONE = { good: "#16a34a", warn: "#f59e0b", bad: "#ef4444", info: "#4C6FFF" };
/* Categorical series colours, in a FIXED order and never cycled.
 *
 * The previous set was picked by eye and failed on measurement: its teal and its
 * pink sat 3.7 apart in OKLab under deuteranopia — one reader in twelve saw two
 * series as one colour — the amber fell outside the readable lightness band, the
 * slate read as grey rather than as a colour, and three of the eight were under
 * 3:1 against a white card. All five checks pass on this set (lightness band,
 * chroma floor, adjacent CVD separation ≥ 8, normal-vision separation ≥ 15,
 * contrast ≥ 3:1); the worst adjacent pair is now 10.2 for deutan.
 *
 * The ORDER is part of the fix, not decoration: the checks are on adjacent pairs,
 * so reordering these breaks them. A ninth series is never a generated hue — it
 * folds into "Other" or the chart becomes small multiples. */
const AN_SERIES = ["#3B5BDB", "#C2410C", "#0E9F6E", "#A21CAF", "#4D7C0F", "#0369A1", "#BE123C", "#6D28D9"];
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
/* A saved conversation: open it, rename it, put it away. Three targets in one
   chip rather than a chip plus a menu — there are only two verbs and a menu for
   two verbs is a click somebody has to discover. */
.an-thread{display:inline-flex;align-items:stretch;border:1px solid var(--an-line);border-radius:9px;overflow:hidden;background:#fff;max-width:280px;}
.an-thread[data-on="1"]{border-color:var(--navy-900,#0c1432);box-shadow:inset 0 0 0 1px var(--navy-900,#0c1432);}
.an-thread-hit{flex:1;min-width:0;display:flex;align-items:center;gap:7px;padding:7px 10px;border:0;background:transparent;cursor:pointer;font:600 12px inherit;color:var(--ink-700,#2a335c);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.an-thread-hit:hover{background:var(--cream-100,#f6f4ef);}
.an-thread-n{flex:none;font-style:normal;font-size:10px;font-weight:700;color:var(--ink-400,#7c86a6);}
.an-thread-ic{flex:none;width:26px;border:0;border-left:1px solid var(--an-line);background:transparent;cursor:pointer;font-size:11px;color:var(--ink-400,#7c86a6);}
.an-thread-ic:hover{background:var(--cream-100,#f6f4ef);color:var(--ink-700,#2a335c);}
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

/* ── charts (lightweight SVG) ─────────────────────────────────────────────────
 *
 * Shared conventions, because a screen where every chart makes its own choices
 * reads as several screens: 2px strokes, markers no smaller than 8px across with
 * a 2px surface ring so overlapping points stay countable, a recessive grid, and
 * a hover layer on everything that has marks. A static SVG chart in a browser is
 * a chart with its detail thrown away — the numbers behind a point were only ever
 * reachable by exporting the report.
 */
const AN_GRID = "#eef0f4";      // recessive: present, never competing with a mark
const AN_AXIS_INK = "#8088a6";
const AN_MARK_R = 4.5;          // 9px across — above the 8px floor
const AN_STROKE = 2;

/* One tooltip, shared. Positioned in the CARD's coordinates rather than the
   page's, so it cannot be clipped by the section's own overflow. */
function AnTip({ tip }) {
  if (!tip) return null;
  return (
    <div style={{ position: "absolute", left: tip.left, top: tip.top, transform: "translate(-50%,-100%)",
                  pointerEvents: "none", zIndex: 5, background: "var(--navy-900,#0c1432)", color: "#fff",
                  padding: "7px 10px", borderRadius: 8, fontSize: 12, lineHeight: 1.45, whiteSpace: "nowrap",
                  boxShadow: "0 6px 18px rgba(10,17,48,.28)" }}>
      {tip.lines.map((l, i) => (
        <div key={i} style={{ fontWeight: i === 0 ? 700 : 400, opacity: i === 0 ? 1 : .82 }}>{l}</div>
      ))}
    </div>
  );
}

function AnArea({ data, height }) {
  const h = height || 150, w = 640, pad = 6;
  if (!data || !data.length) return <div className="an-empty">No attendance in this range yet.</div>;
  const max = Math.max(1, ...data.map(d => d.present));
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const y = v => h - pad - (v / max) * (h - pad * 2 - 14);
  const pts = data.map((d, i) => [pad + i * step, y(d.present)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${pad + (data.length - 1) * step} ${h - pad} L${pad} ${h - pad} Z`;
  const tone = AN_SERIES[0];
  const [hi, setHi] = React.useState(-1);
  /* Nearest-point crosshair rather than per-mark hit targets: on a 90-day trend
     the marks are 6px apart and hitting one is luck, so the whole plot answers
     and the answer is whichever day is closest. */
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * w;
    setHi(step ? Math.max(0, Math.min(data.length - 1, Math.round((x - pad) / step))) : 0);
  };
  const p = hi >= 0 ? pts[hi] : null;
  return <div style={{ position: "relative" }}>
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none"
      role="img" aria-label="Attendance trend" style={{ display: "block", touchAction: "pan-y" }}
      onMouseMove={onMove} onMouseLeave={() => setHi(-1)} onTouchStart={onMove} onTouchMove={onMove}>
      <defs><linearGradient id="anfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={tone} stopOpacity="0.24"/><stop offset="1" stopColor={tone} stopOpacity="0"/>
      </linearGradient></defs>
      <path d={area} fill="url(#anfill)"/>
      <path d={line} fill="none" stroke={tone} strokeWidth={AN_STROKE} strokeLinejoin="round" strokeLinecap="round"/>
      {p && <line x1={p[0]} y1={pad} x2={p[0]} y2={h - pad} stroke={AN_AXIS_INK} strokeWidth="1" strokeDasharray="3 3"/>}
      {/* A marker on every point is noise past twenty; the hovered one always shows. */}
      {pts.map((q, i) => (i === hi || data.length <= 20)
        ? <circle key={i} cx={q[0]} cy={q[1]} r={i === hi ? AN_MARK_R + 1 : AN_MARK_R} fill={tone} stroke="#fff" strokeWidth="2"/>
        : null)}
    </svg>
    <AnTip tip={p ? { left: (p[0] / w * 100) + "%", top: p[1] - 10,
      lines: [anFmt(data[hi].present) + " present", data[hi].date || data[hi].label || "",
              data[hi].late ? anFmt(data[hi].late) + " late" : ""].filter(Boolean) } : null}/>
  </div>;
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
  const tone = color || AN_SERIES[2];
  const [hi, setHi] = React.useState(-1);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * w;
    setHi(step ? Math.max(0, Math.min(data.length - 1, Math.round((x - pad) / step))) : 0);
  };
  /* Every x label on a 30-week series overlaps into a grey smear. Thin to
     roughly eight, which is what a reader can actually use. */
  const every = Math.max(1, Math.ceil(data.length / 8));
  const p = hi >= 0 ? pts[hi] : null;
  return <div style={{ position: "relative" }}>
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label}
      style={{ display: "block", touchAction: "pan-y" }}
      onMouseMove={onMove} onMouseLeave={() => setHi(-1)} onTouchStart={onMove} onTouchMove={onMove}>
      {p && <line x1={p[0]} y1={pad} x2={p[0]} y2={h - pad - 12} stroke={AN_AXIS_INK} strokeWidth="1" strokeDasharray="3 3"/>}
      <path d={line} fill="none" stroke={tone} strokeWidth={AN_STROKE} strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((q, i) => <g key={i}>
        <circle cx={q[0]} cy={q[1]} r={i === hi ? AN_MARK_R + 1 : AN_MARK_R} fill={tone} stroke="#fff" strokeWidth="2"/>
        {(i % every === 0 || i === data.length - 1) &&
          <text x={q[0]} y={h - 1} fontSize="9" fill={AN_AXIS_INK} textAnchor="middle">{xKey ? data[i][xKey] : i + 1}</text>}
      </g>)}
    </svg>
    <AnTip tip={p ? { left: (p[0] / w * 100) + "%", top: p[1] - 10,
      lines: [String(data[hi][yKey]), xKey ? String(data[hi][xKey]) : "point " + (hi + 1)] } : null}/>
  </div>;
}

function AnDonut({ segments, unit }) {
  const [hi, setHi] = React.useState(-1);
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <div className="an-empty">No data recorded.</div>;
  let acc = 0; const R = 54, C = 2 * Math.PI * R;
  return <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
    <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="Distribution">
      <g transform="rotate(-90 65 65)">
        {segments.map((s, i) => {
          const frac = s.value / total, off = acc * C; acc += frac;
          /* A 2px gap of surface between fills. Without it two adjacent segments
             of similar weight read as one arc, which is the whole failure mode a
             donut already flirts with. Only taken from segments big enough to
             afford it — a 1% sliver minus 2px is nothing at all. */
          const raw = frac * C;
          const len = Math.max(1, raw - (raw > 6 ? 2 : 0));
          return <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={s.color || AN_SERIES[i % AN_SERIES.length]}
            strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off}
            opacity={hi < 0 || hi === i ? 1 : .35} style={{ transition: "opacity .12s" }}/>;
        })}
      </g>
      <text x="65" y="61" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0a1130">{anFmt(total)}</text>
      <text x="65" y="78" textAnchor="middle" fontSize="9" fill="#8088a6" style={{ letterSpacing: ".1em" }}>{(unit || "TOTAL").toUpperCase()}</text>
    </svg>
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {/* The legend IS the hit target. The arcs are 18px of stroke on a 130px
          circle and a small segment is a sliver nobody can hover; a row of text
          is a comfortable target and it carries the label, so identity never
          rests on colour alone. */}
      {segments.map((s, i) => (
        <div key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(-1)}
          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "default",
                   padding: "2px 6px", margin: "-2px -6px", borderRadius: 7,
                   background: hi === i ? "var(--cream-100,#f3ecdb)" : "transparent" }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, flex: "none", background: s.color || AN_SERIES[i % AN_SERIES.length] }}/>
          <b>{s.label}</b><span style={{ color: "var(--ink-500)" }}>{anFmt(s.value)} · {Math.round(s.value / total * 100)}%</span>
        </div>
      ))}
    </div>
  </div>;
}

function AnScatter({ points, corr, centres }) {
  const h = 260, w = 420, pad = 34;
  const [hi, setHi] = React.useState(-1);
  if (!points || !points.length) return <div className="an-empty">No graded students in this range yet.</div>;
  const cx = v => pad + (v / 100) * (w - pad * 2);
  const cy = v => h - pad - (v / 100) * (h - pad * 2);
  /* Colour follows the CENTRE, not the order its first point happens to appear
     in. The old `ci++` assigned slots as it walked the list, so filtering out one
     centre repainted every centre after it — the same site was blue on Monday and
     orange on Tuesday, which makes the legend worse than no legend. Keyed off the
     programme's full centre list where it is available, and off the sorted set of
     centres present otherwise, so the mapping is stable either way. */
  const order = (centres && centres.length ? centres.slice()
    : Array.from(new Set(points.map(p => p.centre))).sort());
  const colourOf = (name) => {
    const i = order.indexOf(name);
    return AN_SERIES[(i < 0 ? order.length : i) % AN_SERIES.length];
  };
  const present = order.filter(c => points.some(p => p.centre === c));
  const hp = hi >= 0 ? points[hi] : null;
  return <div style={{ position: "relative" }}>
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Attendance vs performance"
      style={{ display: "block" }} onMouseLeave={() => setHi(-1)}>
      {[0, 25, 50, 75, 100].map(g => <g key={g}>
        <line x1={pad} y1={cy(g)} x2={w - pad} y2={cy(g)} stroke={AN_GRID}/>
        <text x={pad - 6} y={cy(g) + 3} fontSize="9" fill="#b8bfd6" textAnchor="end">{g}</text>
        <text x={cx(g)} y={h - pad + 14} fontSize="9" fill="#b8bfd6" textAnchor="middle">{g}</text>
      </g>)}
      {points.map((p, i) => (
        /* A 2px surface ring, so two children on the same rate are two dots
           rather than one blob — which is exactly the region a scatter like this
           is crowded in. */
        <circle key={i} cx={cx(p.x)} cy={cy(p.y)} r={i === hi ? AN_MARK_R + 2 : AN_MARK_R}
          fill={colourOf(p.centre)} fillOpacity={hi < 0 || i === hi ? .85 : .35}
          stroke="#fff" strokeWidth="2" style={{ cursor: "default" }}
          onMouseEnter={() => setHi(i)}/>
      ))}
      <text x={w / 2} y={h - 4} fontSize="10" fill="#5a6488" textAnchor="middle">Attendance rate →</text>
      <text x={12} y={h / 2} fontSize="10" fill="#5a6488" textAnchor="middle" transform={`rotate(-90 12 ${h / 2})`}>Avg grade →</text>
    </svg>
    <AnTip tip={hp ? { left: (cx(hp.x) / w * 100) + "%", top: cy(hp.y) - 10,
      lines: [hp.centre || "Unassigned", hp.x + "% attendance · grade " + hp.y] } : null}/>
    {/* A legend, because two or more series must never be identified by colour
        alone — and this chart had none at all. */}
    {present.length > 1 && (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
        {present.map(c => (
          <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-600)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: colourOf(c) }}/>{c}
          </span>
        ))}
      </div>
    )}
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
    <div className="an-field"><label>Faculty</label>
      <select value={filters.department} onChange={e => set("department", e.target.value)}>
        <option value="">All faculties</option>{opts.departments.map(d => <option key={d} value={d}>{d}</option>)}
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

// ── activity + evidence capture drawer (Level 4 write path) ──────────────────
const AN_EV_TYPES = ["photo", "video", "lesson-plan", "worksheet", "student-output", "attendance-sheet", "teacher-notes"];
const AN_CATS = ["lesson", "assessment", "activity", "workshop", "excursion"];

function AnActivityDrawer({ opts, defaults, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: "", category: "lesson", centre: defaults.centre || "", department: defaults.department || "",
    date: new Date().toISOString().slice(0, 10), participants: "", notes: "",
  });
  const [evidence, setEvidence] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const addEv = (type) => setEvidence(e => [...e, { type, url: "", label: "", _uploading: false }]);
  const setEv = (i, patch) => setEvidence(e => e.map((x, j) => j === i ? { ...x, ...patch } : x));
  const rmEv = (i) => setEvidence(e => e.filter((_, j) => j !== i));

  const upload = async (i, file) => {
    if (!file) return;
    setEv(i, { _uploading: true }); setErr("");
    try { const r = await NGGApi.uploadFile(file, "evidence"); setEv(i, { url: r.url, label: file.name, _uploading: false }); }
    catch (e) { setErr("Upload failed: " + (e.message || e)); setEv(i, { _uploading: false }); }
  };

  const save = async () => {
    if (!form.title.trim()) { setErr("A title is required."); return; }
    setSaving(true); setErr("");
    try {
      await NGGApi.admin.activityAdd({
        title: form.title.trim(), category: form.category, centre: form.centre, department: form.department,
        date: form.date, participants: Number(form.participants) || 0, notes: form.notes,
        evidence: evidence.filter(e => e.url).map(e => ({ type: e.type, url: e.url, label: e.label })),
      });
      onSaved();
    } catch (e) { setErr(e.message || "Could not save."); setSaving(false); }
  };

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className="an-drill" onMouseDown={onClose}>
    <div className="scrim"/>
    <div className="an-drawer" onMouseDown={e => e.stopPropagation()}>
      <div className="head">
        <div><div className="an-eyebrow">Level 4 · Evidence</div><h3 style={{ margin: "4px 0 0", fontSize: 18 }}>Log an activity</h3></div>
        <button className="an-chip" onClick={onClose}>Close ✕</button>
      </div>
      <div style={{ padding: 20, display: "grid", gap: 14 }}>
        <div className="an-field" style={{ gap: 5 }}><label>Title</label>
          <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. STEM robotics lab" style={{ minWidth: 0 }}/></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="an-field" style={{ gap: 5 }}><label>Category</label>
            <select value={form.category} onChange={e => set("category", e.target.value)}>{AN_CATS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="an-field" style={{ gap: 5 }}><label>Date</label>
            <input type="date" value={form.date} onChange={e => set("date", e.target.value)}/></div>
          <div className="an-field" style={{ gap: 5 }}><label>Centre</label>
            <select value={form.centre} onChange={e => set("centre", e.target.value)}><option value="">— select —</option>{opts.centres.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="an-field" style={{ gap: 5 }}><label>Faculty</label>
            <select value={form.department} onChange={e => set("department", e.target.value)}><option value="">— none —</option>{opts.departments.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          <div className="an-field" style={{ gap: 5 }}><label>Participants</label>
            <input type="number" min="0" value={form.participants} onChange={e => set("participants", e.target.value)} placeholder="0"/></div>
        </div>
        <div className="an-field" style={{ gap: 5 }}><label>Notes</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} style={{ font: "inherit", padding: "8px 9px", border: "1px solid var(--an-line)", borderRadius: 9, resize: "vertical" }} placeholder="Teacher notes / summary…"/></div>

        <div>
          <label style={{ font: "600 9px/1 var(--font-mono)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-400)" }}>Evidence</label>
          <div className="an-ev" style={{ margin: "8px 0" }}>{AN_EV_TYPES.map(t => <button key={t} type="button" className="an-chip" style={{ fontSize: 11, padding: "5px 9px" }} onClick={() => addEv(t)}>＋ {t}</button>)}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {evidence.map((e, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", background: "#fff", border: "1px solid var(--an-line)", borderRadius: 10, padding: 8 }}>
              <span className="an-evtype" style={{ fontSize: 10 }}>{e.type}</span>
              {e.type === "photo"
                ? (e.url ? <span style={{ flex: 1, fontSize: 12, color: "var(--ink-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✓ {e.label || "uploaded"}</span>
                  : <label className="an-chip" style={{ flex: 1, justifyContent: "center", cursor: "pointer", fontSize: 12 }}>{e._uploading ? "Uploading…" : "Choose photo"}<input type="file" accept="image/*" hidden onChange={ev => upload(i, ev.target.files[0])}/></label>)
                : <>
                  <input value={e.url} onChange={ev => setEv(i, { url: ev.target.value })} placeholder="Link (URL)" style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid var(--an-line)", borderRadius: 8, minWidth: 0 }}/>
                  <input value={e.label} onChange={ev => setEv(i, { label: ev.target.value })} placeholder="Label" style={{ width: 90, fontSize: 12, padding: "6px 8px", border: "1px solid var(--an-line)", borderRadius: 8 }}/>
                </>}
              <button type="button" className="an-chip" style={{ padding: "5px 8px" }} onClick={() => rmEv(i)}>✕</button>
            </div>)}
            {!evidence.length && <p className="an-sub" style={{ margin: 0, fontSize: 12 }}>Attach photos, videos, lesson plans, worksheets, student outputs, attendance sheets or teacher notes.</p>}
          </div>
        </div>

        {err && <p style={{ color: AN_TONE.bad, fontSize: 13, margin: 0 }}>{err}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save activity"}</button>
          <button className="an-chip" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
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
  const [logOpen, setLogOpen] = useState(false);

  const load = React.useCallback((f) => {
    setLoading(true); setErr("");
    NGGApi.admin.analytics(f).then(r => { setWs(r.workspace); setLoading(false); })
      .catch(e => { setErr(e.message || "Failed to load analytics."); setLoading(false); });
  }, []);
  useEffect(() => { load(filters); }, [filters, load]);

  const saveViews = (next) => { setViews(next); try { localStorage.setItem("ngg.analytics.views", JSON.stringify(next)); } catch {} };
  const onSaveView = (name) => saveViews([...views.filter(v => v.name !== name), { name, filters }]);
  const onApplyView = (v) => setFilters({ ...AN_BLANK, ...v.filters });
  const onDeleteView = (name) => saveViews(views.filter(v => v.name !== name));

  const openDrill = (metric, title) => {
    setDrill({ open: true, title, rows: null, loading: true });
    NGGApi.admin.analyticsDrill(metric, filters).then(r => setDrill({ open: true, title, rows: r.rows, loading: false }))
      .catch(() => setDrill({ open: true, title, rows: [], loading: false }));
  };
  const showEvidence = (a) => setDrill({ open: true, title: a.title + " — evidence", loading: false,
    rows: (a.evidence || []).map(e => ({ type: e.type, label: e.label || "", link: e.url || "" })) });
  const [minting, setMinting] = useState(false);
  const mintChampions = () => {
    setMinting(true);
    NGGApi.admin.championsMint(ws && ws.rankings && ws.rankings.v3 ? ws.rankings.v3.period : "")
      .then(() => { toast.success("Champions minted."); load(filters); })
      .catch(e => toast.error(e.code || e.message || "Couldn't mint champions."))
      .finally(() => setMinting(false));
  };

  /* Tell the shell's Analyst pane what this screen is showing, so an answer
     scoped to one centre is visibly scoped and the pane's chips are the real
     request parameters rather than a caption. Published from the LOADED
     workspace, not from `filters`, because the range label is the server's — it
     is what "week 3" actually resolved to. */
  useEffect(() => {
    if (!ws) return;
    nggPublishScope({
      section: "Analytics",
      centre: filters.centre || "",
      week: filters.week || "",
      rangeLabel: (ws.filters && ws.filters.rangeLabel) || "",
      centres: ((ws.filters && ws.filters.options && ws.filters.options.centres) || []).slice(0, 20),
    });
    return () => nggPublishScope(null);
  }, [ws, filters.centre, filters.week]);

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
      <a href="#an-growth">⑤ Growth potential</a><a href="#an-depth">⑥ Depth</a>
      <a href="#an-insight">⑦ Analyst panel</a>
    </nav>

    {/* ── Level 1 · Executive ── */}
    <section className="an-sec" id="an-exec">
      <div className="an-eyebrow">Level 1 · Executive</div>
      <h2 className="an-h">The headline numbers.</h2>
      <p className="an-sub">For directors and sponsors — the programme at a glance. Cards with a trend badge move week-on-week; click a live tile to drill into the records behind it.</p>
      <div className="an-grid an-kpis">
        <AnKpi icon="🎓" value={anFmt(ex.totalStudents)} label="Total students" foot={`${anFmt(ex.presentToday)} present today`}/>
        <AnKpi icon="🏫" value={anFmt(ex.centres)} label="Centres running"/>
        <AnKpi icon="🧩" value={anFmt(ex.departments)} label="Faculties"/>
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
            : <table className="an-tbl"><thead><tr><th>Mentor</th><th>Faculty</th><th>Stars</th><th>Ratings</th><th>Activities</th></tr></thead>
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
          <AnScatter points={re.scatter} corr={re.correlation} centres={(ws.options && ws.options.centres) || []}/>
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

    {/* V3 Champions (Verbal · Vocal · Visual) */}
    {rk.v3 && <section className="an-sec">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="an-eyebrow">Recognition · {rk.v3.period}</div>
          <h2 className="an-h">V3 Champions.</h2>
        </div>
        {rk.v3.canMint && rk.v3.rated > 0 && <button className="btn btn-primary" disabled={minting} onClick={mintChampions}>{minting ? "Minting…" : (rk.v3.minted > 0 ? "Re-mint champions" : "Mint champions →")}</button>}
      </div>
      <p className="an-sub">Top Verbal·Vocal·Visual composite (out of 15) this week — the mentor's weekly read on each student. {rk.v3.minted > 0 ? rk.v3.minted + " award(s) minted." : "Mint to record non-monetary champion awards."}</p>
      {rk.v3.rated === 0 ? <div className="an-card"><div className="an-empty">No V3 ratings this week yet — mentors rate from the Mentor Portal.</div></div>
        : <div className="an-grid an-two">
          <div className="an-card">
            <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>🏆 Overall leaders</h3>
            {rk.v3.overall.map((s, i) => <div key={i} className="an-rank">
              <span className="n">{i + 1}</span>
              <div style={{ flex: 1 }}><b>{s.name}</b><div style={{ fontSize: 11, color: "var(--ink-400)" }}>{s.centre}</div></div>
              <span className="an-pill" style={{ background: "rgba(76,111,255,.12)", color: AN_TONE.info }}>{s.total}/15</span>
            </div>)}
          </div>
          <div className="an-card">
            <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>By centre</h3>
            {Object.keys(rk.v3.byCentre).length === 0 ? <div className="an-empty">—</div> : Object.keys(rk.v3.byCentre).map(cn => {
              const champ = rk.v3.byCentre[cn][0];
              return <div key={cn} className="an-rank">
                <span style={{ fontSize: 16 }}>🥇</span>
                <div style={{ flex: 1 }}><b>{champ.name}</b><div style={{ fontSize: 11, color: "var(--ink-400)" }}>{cn} · V {champ.verbal} · Vo {champ.vocal} · Vi {champ.visual}</div></div>
                <span className="an-pill" style={{ background: "var(--cream-100)", color: "var(--ink-700)" }}>{champ.total}/15</span>
              </div>;
            })}
          </div>
        </div>}
    </section>}

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="an-eyebrow">Level 4 · Evidence</div>
          <h2 className="an-h">The evidence base.</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setLogOpen(true)}>＋ Log activity</button>
      </div>
      <p className="an-sub">Every activity can carry supporting evidence — photos, videos, lesson plans, worksheets, student outputs, attendance sheets, teacher notes. This is what makes the platform auditable for donors and researchers.</p>
      {ev.byType.length > 0 && <div className="an-ev" style={{ marginBottom: 14 }}>
        {ev.byType.map(t => <span key={t.type} className="an-evtype">{t.type} · {t.count}</span>)}
        <span className="an-evtype" style={{ background: "var(--navy-900)", color: "#fff" }}>{ev.total} total artefacts</span>
      </div>}
      {ev.gallery.length === 0 ? <div className="an-card"><div className="an-empty">No evidence logged in this range. <a href="#" onClick={e => { e.preventDefault(); setLogOpen(true); }}>Log an activity</a> with attachments to build the evidence base.</div></div>
        : <div className="an-grid an-gal">{ev.gallery.slice(0, 12).map(a => {
          const photo = (a.evidence || []).find(e => e.type === "photo" && e.url);
          return <div key={a.activityId} className="an-card click" style={{ padding: 10 }} onClick={() => showEvidence(a)}>
            <div className="an-thumb">{photo ? <img src={photo.url} alt="" loading="lazy"/> : "🖼"}</div>
            <b style={{ display: "block", marginTop: 9, fontSize: 14 }}>{a.title}</b>
            <div style={{ color: "var(--ink-400)", fontSize: 12, margin: "2px 0 6px" }}>{a.category} · {a.centre || "All"} · {a.date}</div>
            <div className="an-ev">{(a.evidence || []).map((e, i) => <span key={i} className="an-evtype" style={{ fontSize: 10 }}>{e.type}</span>)}</div>
          </div>;
        })}</div>}
    </section>

    {/* ── Level 5 · Growth Potential ── */}
    <AnGrowth centre={filters.centre} onDrill={openDrill}/>

    {/* ── Level 6 · Depth — comparison, segmentation, rigour, narrative ── */}
    <AnDepth filters={filters}/>

    {/* ── Level 7 · what a panel of analysts makes of levels 1–6 ── */}
    <AnInsight filters={filters}/>

    {/* Level 7b — the same panel, asked something specific — used to sit here,
        at the bottom of seven sections. It is now docked in the shell as the
        Analyst pane (⌘J), because an assistant you have to scroll past the whole
        page to reach is one you consult after you have already decided. It
        follows this page's scope through nggPublishScope, above. */}

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
    {logOpen && <AnActivityDrawer opts={opts} defaults={filters} onClose={() => setLogOpen(false)}
      onSaved={() => { setLogOpen(false); load(filters); }}/>}
  </div>;
}

/* ── Level 5 · Growth Potential ─────────────────────────────────────────────
 *
 * The predictive level. Levels 1–4 describe what happened; this says which
 * children are about to fall out and which centre is about to stall — the two
 * questions a coordinator actually acts on each week, and neither of which an
 * average can answer.
 *
 * Loaded on demand, not with the workspace: it scores every active student over
 * a four-week window, and Levels 1–4 should not pay for work nobody asked to
 * see. The server memoises it against the attendance high-water mark.
 *
 * The framing is deliberate and is a safeguarding decision, not a style choice.
 * "At risk" is a label that can follow a child, so the at-risk list is titled by
 * what to DO about it, every row carries the reasons that put it there, and the
 * whole section is staff-only — it is never shown to a student or a guardian.
 */
const AN_BAND = (s) => (s === null || s === undefined ? { label: "No score", tone: "#64748b" }
  : s >= 70 ? { label: "Thriving", tone: AN_TONE.good }
  : s >= 55 ? { label: "Steady", tone: "#4C6FFF" }
  : s >= 40 ? { label: "Watch", tone: AN_TONE.warn }
  : { label: "Needs support", tone: AN_TONE.bad });

function AnSpark({ series, tone }) {
  const vals = (series || []).map(Number).filter(v => v === v);
  if (vals.length < 2) return <span style={{ color: "var(--ink-400)", fontSize: 11 }}>—</span>;
  const max = Math.max(100, ...vals), min = Math.min(0, ...vals);
  const w = 62, h = 18;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * h;
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: "block" }}>
    <polyline points={pts} fill="none" stroke={tone || "#4C6FFF"} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>;
}

function AnGrowthRow({ s, onDrill }) {
  const band = AN_BAND(s.score);
  const tone = s.attSlope > 0 ? AN_TONE.good : s.attSlope < 0 ? AN_TONE.bad : "#64748b";
  return <tr>
    <td>
      <b>{s.name}</b>
      <div style={{ color: "var(--ink-400)", fontSize: 11.5 }}>{s.centre} · age {s.age || "—"}</div>
    </td>
    <td style={{ whiteSpace: "nowrap" }}>
      {s.score === null
        ? <span className="an-pill" style={{ background: "#eef1f6", color: "#64748b" }}>not enough data</span>
        : <><b style={{ fontSize: 16, color: band.tone }}>{s.score}</b>
            <div style={{ fontSize: 11, color: band.tone, fontWeight: 700 }}>{band.label}</div></>}
    </td>
    <td><AnSpark series={s.series ? Object.values(s.series) : []} tone={tone}/>
      <div style={{ fontSize: 11, color: tone, fontWeight: 700 }}>
        {s.attSlope > 0 ? "▲" : s.attSlope < 0 ? "▼" : "▬"} {Math.abs(Math.round(s.attSlope))}%/wk
      </div>
    </td>
    <td style={{ fontSize: 12, color: "var(--ink-500)", maxWidth: 330 }}>
      {(s.reasons || []).map((r, i) => <div key={i}>· {r.text}</div>)}
    </td>
    <td style={{ whiteSpace: "nowrap", fontSize: 11.5 }}>
      {/* Confidence is reported next to the score, never folded into it —
          blending them makes a thin score look like a middling one. */}
      <span className="an-pill" style={{
        background: s.confidence === "high" ? "rgba(22,163,74,.12)" : s.confidence === "medium" ? "rgba(245,158,11,.14)" : "#eef1f6",
        color: s.confidence === "high" ? AN_TONE.good : s.confidence === "medium" ? "#8a6d00" : "#64748b",
      }}>{s.confidence} confidence</span>
      <div style={{ color: "var(--ink-400)", marginTop: 3 }}>{s.observations} observation{s.observations === 1 ? "" : "s"} · {s.weeks}w attendance</div>
      {/* Which comparison produced the score. "Ranked against 3 peers" and
          "against 300" are different claims; say which one this is. */}
      {s.peerBasis && <div style={{ color: "var(--ink-400)", marginTop: 2 }}>vs {s.peerCount} in same {s.peerBasis}</div>}
    </td>
  </tr>;
}

function AnGrowth({ centre, onDrill }) {
  const [g, setG] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [weeks, setWeeks] = React.useState(4);
  const [method, setMethod] = React.useState(false);
  const [tab, setTab] = React.useState("risk");   // risk | rising | centres

  const load = React.useCallback(() => {
    setLoading(true); setErr("");
    NGGApi.admin.analyticsGrowth(centre || "", weeks)
      .then(r => { setG(r.growth); setLoading(false); })
      .catch(e => { setErr(e.code || e.message || "Couldn't load growth potential."); setLoading(false); });
  }, [centre, weeks]);
  React.useEffect(() => { load(); }, [load]);

  const sum = (g && g.summary) || {};
  const rows = !g ? [] : tab === "risk" ? g.atRisk : tab === "rising" ? g.rising : [];

  return <section className="an-sec" id="an-growth">
    <div className="an-eyebrow">Level 5 · Growth potential</div>
    <h2 className="an-h">Who needs support, and where growth is blocked.</h2>
    <p className="an-sub">
      The only predictive level. Everything above describes what has happened; this reads the <b>direction of travel</b> —
      a child at 60% attendance and climbing is a different case from one at 60% and falling, and an average cannot tell
      them apart. Scores are relative to children at the same centre and in the same age band, carry the reasons that
      produced them, and are never shown to a student or guardian.
    </p>

    {err && <div className="an-card"><div className="an-empty" style={{ color: AN_TONE.bad }}>{err}</div></div>}
    {loading && !g && <div className="an-card"><div className="an-empty">Scoring the cohort…</div></div>}

    {g && <>
      <div className="an-grid an-kpis" style={{ marginBottom: 14 }}>
        <AnKpi icon="🫂" value={anFmt(sum.atRiskCount)} label="Need support now"
          foot="low index, or attendance falling fast"/>
        <AnKpi icon="🌱" value={anFmt(sum.risingCount)} label="Rising" foot="climbing week on week"/>
        <AnKpi icon="🎯" value={sum.meanScore === null || sum.meanScore === undefined ? "—" : sum.meanScore} label="Mean index"
          foot={sum.stats ? `median ${sum.stats.median} · sd ${sum.stats.sd}` : ""}/>
        <AnKpi icon="🔍" value={anFmt(sum.scored)} label="Children scored"
          foot={`${anFmt(sum.insufficient)} without enough data yet`}/>
      </div>

      <div className="an-card" style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div className="an-levelnav" style={{ margin: 0 }}>
          {[["risk", "Needs support (" + (sum.atRiskCount || 0) + ")"], ["rising", "Rising (" + (sum.risingCount || 0) + ")"], ["centres", "By centre"]].map(([id, l]) => (
            <a key={id} href="#an-growth" onClick={e => { e.preventDefault(); setTab(id); }}
              style={tab === id ? { background: "var(--navy-900)", color: "#fff" } : undefined}>{l}</a>
          ))}
        </div>
        <label style={{ marginLeft: "auto", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
          Window
          <select className="an-chip" value={weeks} onChange={e => setWeeks(Number(e.target.value))}>
            {[3, 4, 6, 8].map(w => <option key={w} value={w}>{w} weeks</option>)}
          </select>
        </label>
        <button className="an-chip" onClick={() => setMethod(m => !m)}>{method ? "Hide method" : "How this is calculated"}</button>
        {/* Exported with the reasons and the confidence, not just the number —
            a score handed to a colleague without them is unusable. */}
        <button className="an-chip" onClick={() => {
          const out = [["Child", "Centre", "Age", "Index", "Band", "Trajectory %/wk", "Attendance %", "Confidence", "Observations", "Why"]];
          (g.students || []).forEach(s => out.push([
            s.name, s.centre, s.age, s.score === null ? "" : s.score, AN_BAND(s.score).label,
            s.attSlope, s.attLevel, s.confidence, s.observations,
            (s.reasons || []).map(r => r.text).join(" "),
          ]));
          anDownload("ngg-growth-potential-" + g.windowWeeks + "w.csv",
            out.map(r => r.map(anCsv).join(",")).join("\n"), "text/csv");
        }}>⭳ CSV</button>
      </div>

      {/* The published method. An unexplained score is not defensible to a
          funder, and should not be trusted by staff either. */}
      {method && g.methodology && <div className="an-card" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Method</h3>
        <div className="an-ev" style={{ marginBottom: 10 }}>
          {Object.keys(g.methodology.weights || {}).map(k => (
            <span key={k} className="an-evtype">{k} · {Math.round(g.methodology.weights[k] * 100)}%</span>
          ))}
          <span className="an-evtype" style={{ background: "var(--navy-900)", color: "#fff" }}>
            {Math.round((g.methodology.trajectoryShare || 0) * 100)}% of each component is trajectory
          </span>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.65, color: "var(--ink-500)" }}>
          {(g.methodology.notes || []).map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </div>}

      {tab !== "centres" && <div className="an-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="admin-table" style={{ minWidth: 780 }}>
          <thead><tr><th>Child</th><th>Index</th><th>Trajectory</th><th>Why</th><th>Evidence</th></tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} className="an-empty">
                  {tab === "risk"
                    ? "Nobody is trending out of the programme in this window. That is the good news."
                    : "No child is climbing sharply enough to flag yet."}
                </td></tr>
              : rows.map(s => <AnGrowthRow key={s.studentId} s={s} onDrill={onDrill}/>)}
          </tbody>
        </table>
      </div>}

      {tab === "centres" && <div className="an-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="admin-table" style={{ minWidth: 820 }}>
          <thead><tr><th>Centre</th><th>Mean index</th><th>Weekly present</th><th>Sign-up → confirmed</th><th>Children per staff</th><th>What is blocking growth</th></tr></thead>
          <tbody>
            {(g.centres || []).length === 0
              ? <tr><td colSpan={6} className="an-empty">No centres in scope.</td></tr>
              : g.centres.map(c => {
                const band = AN_BAND(c.meanScore);
                const tone = c.attendanceTrend > 0 ? AN_TONE.good : c.attendanceTrend < 0 ? AN_TONE.bad : "#64748b";
                return <tr key={c.centreId || c.name}>
                  <td><b>{c.name}</b><div style={{ color: "var(--ink-400)", fontSize: 11.5 }}>{c.enrolled} enrolled · {c.atRisk} needing support</div></td>
                  <td><b style={{ color: band.tone, fontSize: 15 }}>{c.meanScore === null ? "—" : c.meanScore}</b></td>
                  <td><AnSpark series={c.weeklyPresent} tone={tone}/>
                    <div style={{ fontSize: 11, color: tone, fontWeight: 700 }}>
                      {c.attendanceTrend > 0 ? "▲" : c.attendanceTrend < 0 ? "▼" : "▬"} {Math.abs(c.attendanceTrend)}/wk
                    </div></td>
                  <td><b style={{ color: AN_RATE_TONE(c.conversion) }}>{c.conversion}%</b>
                    <div style={{ color: "var(--ink-400)", fontSize: 11 }}>
                      {c.funnel ? `${c.funnel.self_pending} waiting · ${c.funnel.verified} confirmed` : ""}
                    </div></td>
                  <td>{c.ratio === null ? <span style={{ color: AN_TONE.bad, fontWeight: 700 }}>no staff</span> : c.ratio}</td>
                  {/* One named constraint, not a list of three. A ranking that
                      does not imply an action is just a league table. */}
                  <td style={{ fontSize: 12, maxWidth: 300 }}>
                    <span className="an-pill" style={{
                      background: c.constraint === "none" ? "rgba(22,163,74,.12)" : "rgba(239,68,68,.12)",
                      color: c.constraint === "none" ? AN_TONE.good : AN_TONE.bad,
                    }}>{c.constraint}</span>
                    <div style={{ color: "var(--ink-500)", marginTop: 3 }}>{c.constraintText}</div>
                  </td>
                </tr>;
              })}
          </tbody>
        </table>
      </div>}

      <p className="an-sub" style={{ marginTop: 10 }}>
        {anFmt(sum.insufficient)} {sum.insufficient === 1 ? "child has" : "children have"} too little history to score
        and {sum.insufficient === 1 ? "is" : "are"} deliberately left blank rather than given a number nobody can trust.
        Window: {g.windowWeeks} weeks{centre ? ` · ${centre}` : ""}.
      </p>
    </>}
  </section>;
}

/* ── Level 6 · Depth ────────────────────────────────────────────────────────
 *
 * The levels above report bare figures. "65% attendance" with nothing beside it
 * is a reading, not an insight — the viewer cannot tell whether it is good,
 * whether it moved, or whether the gap they are looking at is real. This level
 * supplies the four things a bare number is missing: a benchmark, a segment, an
 * interval, and a sentence saying what it means.
 *
 * The confidence interval is drawn, not tabulated, because it is the part most
 * likely to be ignored. At this programme's size a rate of 100% from four
 * observations and a rate of 75% from four hundred look identical in a table and
 * are not remotely the same claim; the band makes that impossible to miss.
 */
const AN_SEV = {
  good: { bg: 'rgba(22,163,74,.10)', bar: AN_TONE.good, label: 'Good' },
  bad:  { bg: 'rgba(239,68,68,.10)', bar: AN_TONE.bad, label: 'Attention' },
  warn: { bg: 'rgba(245,158,11,.12)', bar: AN_TONE.warn, label: 'Watch' },
  info: { bg: 'rgba(76,111,255,.09)', bar: AN_TONE.info, label: 'Note' },
};

/* A rate with its 95% interval, drawn to scale on 0–100. The solid mark is the
   estimate; the pale band is the range the data actually supports. */
function AnCIBar({ ci, tone, compact }) {
  if (!ci || ci.rate === null || ci.rate === undefined) {
    return <span style={{ color: 'var(--ink-400)', fontSize: 12 }}>—</span>;
  }
  const c = tone || AN_RATE_TONE(ci.rate);
  const w = compact ? 96 : 150;
  return (
    <div style={{ minWidth: w }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <b style={{ fontSize: compact ? 13 : 15, color: c }}>{ci.rate}%</b>
        {ci.low !== null && <span style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>
          {ci.low}–{ci.high}
        </span>}
      </div>
      <div style={{ position: 'relative', height: 6, width: w, borderRadius: 999, background: '#eef1f6', marginTop: 3 }}>
        {ci.low !== null && (
          <div style={{ position: 'absolute', left: ci.low + '%', width: Math.max(1, ci.high - ci.low) + '%',
                        top: 0, bottom: 0, borderRadius: 999, background: c, opacity: 0.28 }}/>
        )}
        <div style={{ position: 'absolute', left: 'calc(' + ci.rate + '% - 1px)', width: 2, top: -2, bottom: -2,
                      borderRadius: 2, background: c }}/>
      </div>
      {/* Spelled out, because "n=20" reads as twenty children and it is twenty
          child-DAYS. Conflating the two is how a three-child centre gets treated
          as a sixty-observation sample. */}
      {ci.n !== undefined && <div style={{ fontSize: 10, color: 'var(--ink-400)', marginTop: 2, lineHeight: 1.35 }}>
        {ci.n} child-day{ci.n === 1 ? '' : 's'}
        {ci.students !== undefined ? ' · ' + ci.students + (ci.students === 1 ? ' child' : ' children') : ''}
        {ci.thin ? <><br/><span style={{ color: AN_TONE.warn, fontWeight: 700 }}>too thin to compare</span></> : null}
      </div>}
    </div>
  );
}

function AnHeatCell({ ci }) {
  if (!ci || ci.rate === null) {
    return <td style={{ background: '#f7f8fa', color: 'var(--ink-400)', textAlign: 'center', fontSize: 11 }}>—</td>;
  }
  // Single-hue ramp: lightness carries the value, so it stays readable in
  // greyscale and for the one man in twelve who cannot separate red from green.
  const t = Math.max(0, Math.min(1, ci.rate / 100));
  return (
    <td title={`${ci.rate}% (95% CI ${ci.low}–${ci.high}, n=${ci.n})`}
        style={{ background: `rgba(76,111,255,${(0.08 + t * 0.72).toFixed(3)})`,
                 color: t > 0.55 ? '#fff' : 'var(--ink-900)',
                 textAlign: 'center', fontWeight: 700, fontSize: 12.5, padding: '9px 6px' }}>
      {ci.rate}%
      <div style={{ fontWeight: 500, fontSize: 9.5, opacity: 0.8 }}>n={ci.n}</div>
    </td>
  );
}

/* ── Level 7 · the analyst panel ─────────────────────────────────────────────
 * Everything above is computed. This is the only part of the workspace a model
 * wrote, and the screen says so in those words — a generated paragraph that
 * looks like the computed ones above it would borrow their authority.
 *
 * Never fetched with the page. It is several model calls, so a coordinator asks
 * for it, and the result is cached against the numbers it was drawn from.
 */
function AnInsight({ filters }) {
  const [d, setD] = React.useState(null);
  const [state, setState] = React.useState("idle");   // idle|loading|ready|error
  const [err, setErr] = React.useState("");
  const [open, setOpen] = React.useState("");

  const run = async (force) => {
    setState("loading"); setErr("");
    try {
      const r = await NGGApi.admin.analyticsInsight({ centre: filters.centre || "", week: filters.week || "" }, force);
      setD(r.insight || null); setState("ready");
    } catch (e) {
      /* The privacy refusal is not a generic failure and must not read like
         one: it means the payload would have carried something identifying,
         which is a defect to fix, not a retry to press. */
      const reasons = (e.data && e.data.reasons) || [];
      setErr(e.code === "privacy_refused"
        ? "Refused to send: the payload would have contained " + reasons.join(", ") + ". Nothing was sent. This is a bug — report it."
        : (e.code || e.message));
      setState("error");
    }
  };

  const conf = (c) => ({ high: "an-chip-good", medium: "an-chip-warn", low: "an-chip-mut" }[c] || "an-chip-mut");

  return (
    <section className="an-sec" id="an-insight">
      <div className="an-eyebrow">Level 7 · Analyst panel</div>
      <h2 className="an-h">What a panel of analysts makes of this.</h2>
      <p className="an-sub">
        Everything above is <b>computed</b>. This is the only part written by a model — several of them,
        reading the same aggregate numbers through different lenses, on different providers. Only what
        two or more reached <i>independently</i> is shown as agreed; the rest is listed as contested,
        because a point one model made and the others did not is not a finding.
        {" "}No child's name, id or contact is sent — the panel sees counts and rates only.
      </p>

      {state === "idle" && (
        <div className="an-card" style={{ padding: 18 }}>
          <p style={{ margin: "0 0 12px" }}>Runs several model calls over the figures above. Takes up to a minute.</p>
          <button className="btn btn-primary btn-sm" onClick={() => run(false)}>Ask the panel</button>
        </div>
      )}
      {state === "loading" && <div className="an-card" style={{ padding: 18 }}><div className="dash-spinner"/>
        <p className="an-sub" style={{ marginTop: 10 }}>Four lenses and a synthesis pass — this is not a spinner over a database query.</p></div>}
      {state === "error" && <div className="an-card" style={{ padding: 18, borderColor: "rgba(179,0,27,.4)" }}>
        <p style={{ margin: 0, color: "#b3001b" }}>{err}</p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => run(false)}>Try again</button>
      </div>}

      {state === "ready" && d && (d.disabled || d.empty || d.failed) && (
        <div className="an-card" style={{ padding: 18 }}>
          <p style={{ margin: 0 }}>{d.note}</p>
        </div>
      )}

      {state === "ready" && d && !d.disabled && !d.empty && !d.failed && <>
        {d.headline && <div className="an-card" style={{ padding: 18, marginBottom: 14, borderLeft: "4px solid var(--navy-900)" }}>
          <b style={{ fontSize: 17 }}>{d.headline}</b>
        </div>}

        {/* How much independence there actually was. Four lenses on ONE provider
            is one opinion four times, and "two analysts agreed" would then mean
            nothing — so the count of distinct providers is stated, not implied. */}
        <p className="an-sub" style={{ marginTop: 0 }}>
          {d.lensesRan} of {d.lensesTotal} lenses answered
          {d.providers && d.providers.length
            ? <> across <b>{d.providers.length}</b> provider{d.providers.length === 1 ? "" : "s"} ({d.providers.join(", ")})
                {d.providers.length === 1 && <> — <b>agreement here is weak evidence</b>: give each lens its own
                provider in <code>ai.profiles</code> and they stop being the same opinion.</>}</>
            : null}
          {!d.synthesised && <> · the synthesis pass failed, so these are the raw lens claims.</>}
          {d.cached && <> · cached from {(d.generatedAt || "").replace("T", " ").slice(0, 16)}</>}
          {" "}<button className="btn btn-ghost btn-sm" onClick={() => run(true)}>Re-run</button>
        </p>

        {(d.agreed || []).length > 0 && <>
          <h3 className="an-h3">Agreed by more than one lens</h3>
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {d.agreed.map((c, i) => (
              <div key={i} className="an-card" style={{ padding: 15 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 15.5 }}>{c.headline}</b>
                  <span className={"an-chip " + conf(c.confidence)}>{c.confidence}</span>
                </div>
                <p className="an-sub" style={{ margin: "6px 0 0" }}>{c.why}</p>
                {c.action && <p style={{ margin: "8px 0 0", fontSize: 14 }}><b>Do:</b> {c.action}</p>}
                {(c.lenses || []).length > 0 && <p className="an-sub" style={{ margin: "6px 0 0", fontSize: 12 }}>
                  Reached independently by: {c.lenses.join(" · ")}</p>}
              </div>
            ))}
          </div>
        </>}

        {(d.contested || []).length > 0 && <>
          <h3 className="an-h3">Only one lens said this</h3>
          <p className="an-sub" style={{ marginTop: 0 }}>Not dismissed — but nothing else corroborated it, so treat it as a question rather than an answer.</p>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {d.contested.map((c, i) => (
              <div key={i} className="an-card" style={{ padding: 12 }}>
                <b style={{ fontSize: 14 }}>{c.headline}</b>
                <p className="an-sub" style={{ margin: "4px 0 0", fontSize: 13 }}>{c.note || c.reasoning}{c.lens ? " — " + c.lens : ""}</p>
              </div>
            ))}
          </div>
        </>}

        {/* Every raw claim, per lens, behind a disclosure. A synthesis nobody can
            audit is a summary you have to take on faith. */}
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13.5 }}>Show each lens in full ({(d.panel || []).length})</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {(d.panel || []).map(a => (
              <div key={a.key} className="an-card" style={{ padding: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <b>{a.label}</b>
                  <span className="an-sub" style={{ fontSize: 12 }}>{a.ok ? a.provider : "did not answer (" + a.error + ")"}</span>
                </div>
                {(a.claims || []).map((c, i) => (
                  <div key={i} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-cool-soft,#eef0f4)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{c.headline}</div>
                    <p className="an-sub" style={{ margin: "3px 0 0", fontSize: 13 }}>{c.reasoning}</p>
                    {c.evidence && <p className="mono an-sub" style={{ margin: "3px 0 0", fontSize: 11.5 }}>{c.evidence}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      </>}
    </section>
  );
}

/* ── The Analyst pane ────────────────────────────────────────────────────────
 *
 * Level 7 answers four standing questions. A coordinator's real question is
 * narrower and stranger than any of them, and this is where it goes.
 *
 * It is DOCKED IN THE SHELL, not parked at the bottom of the analytics page.
 * That is the substantive change and not a cosmetic one: an assistant you have
 * to scroll past seven sections to reach is one you consult after you have
 * already made up your mind. As a third grid track it sits beside whatever is
 * open, the page reflows rather than being covered, and it follows the section's
 * own scope — see nggPublishScope in components.jsx.
 *
 * Two rules the whole pane is built around:
 *
 *   1. An answer arrives WITH its method. The plan (which lenses were consulted
 *      and why), the grounding check (which figures were found in the evidence
 *      and which were not), the confidence and how it was arrived at, and the
 *      range it was drawn from are all on the turn — not in a log, not behind a
 *      support request. A generated paragraph that looks exactly like a computed
 *      one is the failure this exists to prevent.
 *
 *   2. It cannot act. No edit, no send, no record written. It says so at the
 *      point of use rather than in a settings page nobody opens.
 */

/** How sure this answer is, and — the part that matters — how we got there.
 *
 *  The model is NOT asked to score its own confidence: a number a model invents
 *  about itself is a number with no referent. This is computed from two things
 *  the pipeline actually knows — how confident each claim said it was, and
 *  whether every figure in the answer was found in the evidence. The derivation
 *  is shown next to the number, because an unexplained percentage is decoration.
 */
function anConfidence(t) {
  const claims = (t && t.claims) || [];
  const W = { high: 1, medium: 0.66, low: 0.33 };
  const parts = [];
  let pct;
  if (!claims.length) {
    pct = 50;
    parts.push("no separable claims to score");
  } else {
    const mean = claims.reduce((a, c) => a + (W[c.confidence] == null ? 0.5 : W[c.confidence]), 0) / claims.length;
    pct = Math.round(mean * 100);
    parts.push(claims.length + " claim" + (claims.length === 1 ? "" : "s") + " averaging " + pct + "%");
    const agreed = claims.filter(c => c.agreed && (c.lenses || []).length > 1).length;
    if (agreed) {
      // Two lenses reaching the same claim independently is the only corroboration
      // this pipeline can offer, so it is the only thing allowed to raise the number.
      pct = Math.min(97, pct + agreed * 4);
      parts.push(agreed + " corroborated by a second lens (+" + agreed * 4 + ")");
    }
  }
  if (t && t.status === "unanswerable") { pct = 0; parts.push("the evidence cannot address the question"); }
  else if (t && t.checks && t.checks.grounded === false) {
    // A figure that is not in the evidence is not a small deduction. Capped
    // rather than nudged, because the answer is a different KIND of thing.
    pct = Math.min(pct, 40);
    parts.push("capped at 40% — a figure is not in the evidence");
  }
  return { pct, why: parts.join(" · ") };
}

/** "Ran 4 steps" — counted from what the pipeline actually did, never a
 *  decorative number. */
function anSteps(t) {
  const plan = t.plan || {};
  const lenses = (plan.lensesRan || []).filter(l => l.ok);
  const steps = [];
  steps.push({ ok: true, text: "planned the question" + (plan.by === "fallback" ? " (by keyword — the planning call was unavailable)" : "") });
  lenses.forEach(l => steps.push({ ok: true, text: "asked the " + l.label.toLowerCase() + " lens" }));
  (plan.lensesRan || []).filter(l => !l.ok).forEach(l => steps.push({ ok: false, text: l.label.toLowerCase() + " lens returned nothing" }));
  steps.push({ ok: plan.composed !== false, text: plan.composed === false ? "composition failed — raw lens points shown" : "composed one reply" });
  steps.push({
    ok: !(t.checks && t.checks.grounded === false),
    text: t.checks && t.checks.grounded === false
      ? "checked the figures — some are not in the evidence"
      : "checked every figure against the evidence (" + ((t.checks && t.checks.evidenceNumbers) || 0) + " found)",
  });
  return steps;
}

/** The one-line summary on the closed trace strip. */
function anStepDetail(t) {
  const plan = t.plan || {};
  const names = (plan.lensesRan || []).map(l => l.label.toLowerCase());
  return (names.length ? names.join(" · ") : "no lens answered")
    + (t.ms ? " · " + (t.ms / 1000).toFixed(1) + "s" : "");
}

function AnalystPane({ onClose }) {
  /* What the open section says it is showing. Not props: the pane outlives any
     one screen, and a screen that announces nothing must produce a pane that
     says "not scoped" rather than one implying a filter it cannot see. */
  const scope = useNggScope();
  const [threads, setThreads] = React.useState([]);
  const [thread, setThread] = React.useState(null);   // { threadId, turns: [] }
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);         // { code, text, reasons }
  const [showPlan, setShowPlan] = React.useState({});
  const [showThreads, setShowThreads] = React.useState(true);
  const [allThreads, setAllThreads] = React.useState(false);
  const [copied, setCopied] = React.useState(-1);
  const [depth, setDepth] = React.useState("deep");   // "deep" | "quick"
  const [depthOpen, setDepthOpen] = React.useState(false);
  const [atOpen, setAtOpen] = React.useState(false);
  const [dropScope, setDropScope] = React.useState({});   // chips the asker removed
  const [pins, setPins] = React.useState([]);         // pinned turn keys, in order
  const [reportOpen, setReportOpen] = React.useState(false);
  const [wide, setWide] = React.useState(() => { try { return localStorage.getItem("ngg.analyst.wide") === "1"; } catch { return false; } });
  const endRef = React.useRef(null);
  const boxRef = React.useRef(null);
  const abortRef = React.useRef(null);

  const loadThreads = React.useCallback(() => {
    NGGApi.admin.insightChatThreads().then(r => setThreads(r.threads || [])).catch(() => {});
  }, []);
  React.useEffect(() => { loadThreads(); }, [loadThreads]);
  React.useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [thread && thread.turns && thread.turns.length, busy]);
  React.useEffect(() => { try { localStorage.setItem("ngg.analyst.wide", wide ? "1" : "0"); } catch (_) {} }, [wide]);
  React.useEffect(() => {
    // The pane is a grid track, so its width is the shell's business. It is told
    // here rather than set here, which keeps one element owning the layout.
    document.documentElement.style.setProperty("--analyst-w", wide ? "620px" : "420px");
  }, [wide]);

  const openThread = async (threadId) => {
    setErr(null);
    try { const r = await NGGApi.admin.insightChatThread(threadId); setThread(r.thread || null); setPins([]); }
    catch (e) { setErr({ code: e.code, text: e.code || e.message }); }
  };

  const archive = async (threadId) => {
    const go = await dialog.confirm({
      title: "Put this conversation away?",
      body: "It stops appearing in the list. The turns are kept — nothing is deleted.",
      cta: "Archive",
    });
    if (!go) return;
    try {
      await NGGApi.admin.insightChatArchive(threadId);
      if (thread && thread.threadId === threadId) setThread(null);
      loadThreads();
    } catch (e) { setErr({ code: e.code, text: e.code || e.message }); }
  };

  /* A title generated from the first question reads identically to the other
     four times somebody asked the same thing. A conversation you cannot name is
     one you re-ask instead of re-open, and each re-ask is a round of model
     calls that costs money. */
  const rename = async (t) => {
    const title = await dialog.prompt({
      title: "Name this conversation", defaultValue: t.title || "",
      label: "No names — the same rule as the questions themselves", cta: "Rename",
    });
    if (title == null) return;
    try { await NGGApi.admin.insightChatRename(t.threadId, title); loadThreads(); }
    catch (e) {
      setErr({ code: e.code, text: e.code === "question_identifies_someone"
        ? "That title names somebody. Titles live in the same store as the questions and follow the same rule."
        : (e.code || e.message) });
    }
  };

  /* ── Scope ────────────────────────────────────────────────────────────────
     What the question will actually be asked against, shown as removable chips
     above the composer. Removing one genuinely drops it from the request rather
     than hiding it — a chip that is decoration is worse than no chip, because
     it tells somebody their question was narrowed when it was not. */
  const chips = [];
  if (scope && scope.rangeLabel) chips.push({ key: "range", label: scope.rangeLabel });
  if (scope && scope.centre) chips.push({ key: "centre", label: scope.centre });
  const liveChips = chips.filter(c => !dropScope[c.key]);
  const askCentre = dropScope.centre ? "" : ((scope && scope.centre) || "");
  const askWeek = dropScope.range ? "" : ((scope && scope.week) || "");

  const turns = (thread && thread.turns) || [];
  const turnKey = (t, i) => (t.seq === -1 ? "pending" : String(t.seq)) + ":" + i;

  /* ── The report draft ─────────────────────────────────────────────────────
     Pin the answers that are going into something. This is the actual workflow
     — nobody asks six questions for fun, they ask six questions because a board
     paper is due on Friday — and until now the only way to get an answer out of
     this pane was to select the paragraph and hope the claims came too. */
  const pinned = pins.map(k => turns.find((t, i) => turnKey(t, i) === k)).filter(Boolean);
  const togglePin = (k) => setPins(p => p.indexOf(k) !== -1 ? p.filter(x => x !== k) : p.concat([k]));
  const movePin = (k, d) => setPins(p => {
    const i = p.indexOf(k), j = i + d;
    if (i < 0 || j < 0 || j >= p.length) return p;
    const n = p.slice(); n.splice(j, 0, n.splice(i, 1)[0]); return n;
  });

  const turnMd = (t) => {
    const c = anConfidence(t);
    const out = ["## " + t.question, ""];
    if (t.status === "unanswerable") out.push("> This evidence cannot answer that.", "");
    if (t.checks && t.checks.grounded === false) {
      out.push("> ⚠ Some figures in this answer were not found in the evidence"
        + ((t.checks.answerUnverified || []).length ? " (" + t.checks.answerUnverified.join(", ") + ")" : "") + ".", "");
    }
    out.push(t.answer || "", "");
    (t.claims || []).forEach(x => out.push("- " + x.claim + (x.evidence ? "  \n  `" + x.evidence + "`" : "")
      + "  \n  _" + (x.confidence || "?") + " confidence, " + ((x.lenses || []).length > 1 && x.agreed ? "two lenses agreed" : "one lens") + "_"));
    if ((t.claims || []).length) out.push("");
    out.push("_" + c.pct + "% confidence — " + c.why + ". Drawn from " + (t.rangeLabel || "—") + " · " + (t.evidenceFp || "—") + "._", "");
    return out;
  };

  const exportReport = (kind) => {
    const rows = pinned.length ? pinned : turns.filter(t => !t.pending);
    if (!rows.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "csv") {
      /* CSV because a finding usually ends up in a spreadsheet beside numbers
         from somewhere else, and the provenance has to travel with it or it
         becomes an unattributed assertion the moment it is pasted. */
      const out = [["Question", "Answer", "Confidence", "Grounded", "Drawn from", "Evidence"]
        .map(anCsv).join(",")];
      rows.forEach(t => {
        const c = anConfidence(t);
        out.push([t.question, t.answer, c.pct + "%",
          t.checks && t.checks.grounded === false ? "NO — a figure is not in the evidence" : "yes",
          t.rangeLabel || "", t.evidenceFp || ""].map(anCsv).join(","));
      });
      anDownload("ngg-analyst-" + stamp + ".csv", out.join("\n"), "text/csv");
      return;
    }
    const lines = ["# Analyst findings — " + stamp, "",
      "_" + rows.length + (pinned.length ? " pinned" : "") + " finding" + (rows.length === 1 ? "" : "s") +
      ". Figures as they stood when each answer was given._", ""];
    rows.forEach(t => lines.push.apply(lines, turnMd(t)));
    lines.push("---", "_Produced by the NGG Analyst. Advisory only — it holds no personal data and writes no records._");
    anDownload("ngg-analyst-" + stamp + ".md", lines.join("\n"), "text/markdown");
  };

  const copyAnswer = (t, i) => {
    const text = turnMd(t).join("\n");
    const done = () => { setCopied(i); setTimeout(() => setCopied(-1), 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => {});
    else {
      // Older Safari and any non-secure origin. Without this the button is dead
      // on exactly the machines a coordinator is most likely to be using.
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (_) {}
      document.body.removeChild(ta);
    }
  };

  /** A citation, for the report that quotes this. Deliberately not the answer:
   *  it is the provenance, which is the part a reader of the report needs and
   *  the part that is lost when somebody pastes a sentence. */
  const cite = (t, i) => {
    const c = anConfidence(t);
    const txt = "NGG Analyst, " + (t.rangeLabel || "range unknown")
      + (thread && thread.centre ? " · " + thread.centre : "")
      + " (" + c.pct + "% confidence; evidence " + (t.evidenceFp || "—") + "; "
      + ((t.plan && (t.plan.lensesRan || []).map(l => l.label).join(", ")) || "no lens") + ")";
    copyText(txt, () => { setCopied(1000 + i); setTimeout(() => setCopied(-1), 1800); });
  };
  const copyText = (txt, done) => {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => {});
    else done();
  };

  const stop = () => { if (abortRef.current) abortRef.current.abort(); };

  const ask = async (text) => {
    const question = (text != null ? text : q).trim();
    if (question.length < 6 || busy) return;
    setBusy(true); setErr(null); setAtOpen(false); setDepthOpen(false);
    /* The question goes on screen before the answer exists. Two model rounds is
       twenty seconds or more, and a composer that clears itself into an empty
       pane looks like it dropped the question. */
    const optimistic = { seq: -1, question, answer: "", pending: true };
    setThread(t => t ? { ...t, turns: [...(t.turns || []), optimistic] } : { threadId: "", turns: [optimistic] });
    setQ("");
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    abortRef.current = ctl;
    try {
      const r = await NGGApi.admin.insightChatAsk({
        question, threadId: (thread && thread.threadId) || "",
        centre: askCentre, week: askWeek, depth,
      }, ctl && ctl.signal);
      // Re-read rather than splice: the server owns the sequence, the thread
      // title and — on the first turn — the thread id itself.
      const full = await NGGApi.admin.insightChatThread(r.threadId);
      setThread(full.thread || null);
      loadThreads();
    } catch (e) {
      const reasons = (e.data && e.data.reasons) || [];
      /* Give the question BACK.
         The composer is cleared the moment the turn goes on screen, and a
         refusal, a rate limit or a timeout used to drop the optimistic turn and
         leave an empty box — so the one thing a person definitely wants to do
         next, try again, meant retyping a sentence they had just typed. Every
         failure here is recoverable and none of them is the writer's fault. */
      setQ(prev => (prev.trim() ? prev : question));
      setErr({
        code: e.code,
        reasons,
        text: e.code === "cancelled" ? "Stopped. The question is back in the box — nothing was saved."
          : e.code === "question_identifies_someone"
          /* Refused, not stripped. Somebody who typed a child's name needs to be
             told once, plainly, that this is not the place — quietly removing it
             teaches nothing and they will do it again on a surface that has no
             gate. */
          ? "That question names or identifies someone (" + reasons.join(", ") + "). Nothing was sent. Ask about a centre, an age band or a period instead — the analyst only ever sees counts and rates."
          : e.code === "rate_limited" ? ((e.data && e.data.note) || "Too many questions this hour.")
          : e.code === "ai_disabled" ? "No AI provider is configured, so there is no analyst to ask. The computed levels on the page are unaffected."
          : e.code === "no_evidence" ? "There is nothing to analyse in this range yet."
          : e.code === "privacy_refused"
          ? "Refused to send: the payload would have contained " + reasons.join(", ") + ". Nothing was sent. This is a bug — report it."
          : e.code === "timeout" ? "The analyst did not finish in time. Nothing was saved — try a narrower question, or Quick depth."
          : (e.code || e.message),
      });
      setThread(t => t ? { ...t, turns: (t.turns || []).filter(x => !x.pending) } : null);
      setTimeout(() => { if (boxRef.current) boxRef.current.focus(); }, 0);
    } finally { setBusy(false); abortRef.current = null; }
  };

  /* Starters, and they are not decoration. An empty box invites "how are we
     doing", which is the one question the evidence genuinely cannot answer;
     these are shaped like the questions that get useful answers. */
  const STARTERS = [
    "Which centre should get the next mentor, and what in this data says so?",
    "Why does attendance fall off in the second week of an intake?",
    "Is the gap between the age bands big enough to act on?",
  ];

  /* Has the filter moved under an open conversation? Read off the LAST ANSWER
     rather than off the thread, because the thread's own label is from its first
     turn and a thread can already span two ranges. Without this a coordinator
     reads five answers as one analysis when the third one changed centre. */
  const drift = (() => {
    const last = turns.filter(t => !t.pending).slice(-1)[0];
    if (!last) return null;
    const was = [last.rangeLabel || "", (thread && thread.centre) || ""].filter(Boolean).join(" · ");
    const now = liveChips.map(c => c.label).join(" · ");
    return was && now && was !== now ? { was, now } : null;
  })();

  const followText = liveChips.length
    ? liveChips.map(c => c.label).join(" · ")
    : (scope && scope.section ? "the whole of " + scope.section.toLowerCase() : "everything on file");

  return (
    <aside className="anp" aria-label="Analyst">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="anp-head">
        <b className="anp-title">Analyst</b>
        <span className="anp-level">Level 7</span>
        <span style={{ flex: 1 }}/>
        <button className="anp-new" onClick={() => { setThread(null); setErr(null); setPins([]); }}>＋ New</button>
        <button className={"anp-ic" + (showThreads ? " is-on" : "")} title="Earlier conversations"
          aria-pressed={showThreads} onClick={() => setShowThreads(s => !s)}>◷</button>
        <button className="anp-ic" title={wide ? "Narrow the pane" : "Widen the pane"}
          onClick={() => setWide(w => !w)}>{wide ? "⇥" : "⇤"}</button>
        <button className="anp-ic" title="Close (⌘J)" onClick={onClose}>✕</button>
      </header>

      {/* ── What it can see ────────────────────────────────────────────────
          Stated, so an answer scoped to one centre is visibly scoped. The chips
          below the composer are the control; this is the summary. */}
      <div className="anp-follow">
        <i className="anp-dot"/>
        <span className="anp-follow-t">Following this page · <b>{followText}</b></span>
      </div>

      {/* ── Earlier conversations ──────────────────────────────────────── */}
      {showThreads && threads.length > 0 && (
        <div className="anp-threads">
          <div className="anp-threads-h">
            <span>Recent threads</span>
            <span style={{ flex: 1 }}/>
            {threads.length > 4 && (
              <button className="anp-link" onClick={() => setAllThreads(a => !a)}>
                {allThreads ? "Fewer" : "All " + threads.length} ▸
              </button>
            )}
          </div>
          {(allThreads ? threads : threads.slice(0, 4)).map(t => {
            const on = thread && thread.threadId === t.threadId;
            return (
              <div key={t.threadId} className={"anp-thread" + (on ? " is-on" : "")}>
                <button className="anp-thread-hit" onClick={() => openThread(t.threadId)}
                  title={t.title + " · " + t.turns + " question" + (t.turns === 1 ? "" : "s") + " · " + t.rangeLabel}>
                  <i className="anp-thread-dot"/>
                  <span className="anp-thread-t">{t.title || "Untitled"}</span>
                  <span className="anp-thread-n">{t.turns}</span>
                </button>
                <button className="anp-thread-ic" title="Rename" aria-label={"Rename " + (t.title || "conversation")}
                  onClick={() => rename(t)}>✎</button>
                <button className="anp-thread-ic" title="Archive" aria-label={"Archive " + (t.title || "conversation")}
                  onClick={() => archive(t.threadId)}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── The conversation ───────────────────────────────────────────── */}
      <div className="anp-scroll">
        {turns.length === 0 && !busy && (
          <div className="anp-starters">
            <p className="anp-lead">
              The page answers standing questions. This answers yours, from the same figures, and shows
              its working. <b>No child's name, id or contact is ever sent</b> — not in the numbers, and not
              in your question.
            </p>
            {STARTERS.map((t, i) => (
              <button key={i} className="anp-starter" onClick={() => ask(t)} disabled={busy}>{t}</button>
            ))}
          </div>
        )}

        {turns.map((t, i) => {
          const k = turnKey(t, i);
          if (t.pending) {
            return (
              <div key={k} className="anp-turn">
                <div className="anp-you"><span className="anp-you-tag">You ▸</span>{t.question}</div>
              </div>
            );
          }
          const c = anConfidence(t);
          const steps = anSteps(t);
          const bad = t.checks && t.checks.grounded === false;
          return (
            <div key={k} className="anp-turn">
              {/* The question, as asked. A quiet mono line, not a bubble: the
                  analyst is the one doing the talking and should look like it. */}
              <div className="anp-you">
                <span className="anp-you-tag">You ▸</span>{t.question}
                <button className="anp-edit" title="Put this back in the box and change it"
                  onClick={() => { setQ(t.question); if (boxRef.current) boxRef.current.focus(); }}>✎</button>
              </div>

              <div className={"anp-ans" + (bad ? " is-bad" : t.status === "unanswerable" ? " is-warn" : "")}
                aria-live="polite">
                {/* The trace strip. Closed it is one line of what happened;
                    open it is every step, including the ones that failed. */}
                <button className="anp-trace" onClick={() => setShowPlan(p => ({ ...p, [k]: !p[k] }))}
                  aria-expanded={!!showPlan[k]}>
                  <span className={"anp-trace-ck" + (bad ? " is-bad" : "")}>{bad ? "!" : "✓"}</span>
                  <b>Ran {steps.length} step{steps.length === 1 ? "" : "s"}</b>
                  <span className="anp-trace-d">{anStepDetail(t)}</span>
                  <span className="anp-trace-ch">{showPlan[k] ? "▴" : "▾"}</span>
                </button>
                {showPlan[k] && (
                  <div className="anp-tracebody">
                    {t.plan && t.plan.restated && <div className="anp-trace-restated">Read as: {t.plan.restated}</div>}
                    {steps.map((s, j) => (
                      <div key={j} className={"anp-step" + (s.ok ? "" : " is-bad")}>
                        <span>{s.ok ? "✓" : "×"}</span>{s.text}
                      </div>
                    ))}
                    {t.plan && t.plan.why && <div className="anp-trace-why">{t.plan.why}</div>}
                    <div className="anp-trace-why">Confidence {c.pct}% — {c.why}.</div>
                    <div className="anp-trace-fp">{t.rangeLabel || "—"} · {t.evidenceFp || "—"}
                      {t.providers && t.providers.length ? " · " + t.providers.join(", ") : ""}</div>
                  </div>
                )}

                {/* Grounding first, because it changes how everything under it
                    should be read. An answer whose figures cannot be found in
                    the evidence is not a worse answer, it is a different KIND of
                    thing, and it must not look identical to one that checks out. */}
                {bad && (
                  <p className="anp-ungrounded">
                    Some figures here are not in the evidence
                    {(t.checks.answerUnverified || []).length ? <> ({t.checks.answerUnverified.join(", ")})</> : null}.
                    {" "}Treat those as the model's arithmetic, not as data.
                  </p>
                )}
                {t.status === "unanswerable" && <p className="anp-unans">This evidence cannot answer that</p>}

                {/* A brief, not a paragraph: the finding as a lead line, then the
                    reasoning under it. The same rhythm the analytics sections
                    use, so the pane reads as part of the page — and, more to the
                    point, so somebody scanning four answers reads four findings
                    rather than four opening sentences. Split on the first
                    sentence because that is where a well-composed answer already
                    puts its conclusion; if there is only one sentence, it is the
                    lead and there is no body. */}
                <div className="anp-eyebrow">{t.status === "unanswerable" ? "No answer" : "Answer"}</div>
                {(() => {
                  const full = String(t.answer || "");
                  const m = full.match(/^([\s\S]{20,240}?[.!?])(\s+)([\s\S]+)$/);
                  return <>
                    <p className="anp-lead-line">{m ? m[1] : full}</p>
                    {m && <div className="anp-body">{m[3]}</div>}
                  </>;
                })()}

                {/* The claims, as a quiet list rather than three bordered cards.
                    Boxing each one gave every claim the visual weight of a
                    finding; a rule down the left says "this belongs to the answer
                    above" without competing with it. */}
                {(t.claims || []).length > 0 && (
                  <div className="anp-claims">
                    {t.claims.map((cl, j) => {
                      const clBad = (t.checks && (t.checks.claims || []).some(x => x.claim === j));
                      return (
                        <div key={j} className={"anp-claim" + (clBad ? " is-bad" : "")}>
                          <div className="anp-claim-t">{cl.claim}</div>
                          <div className="anp-claim-m">
                            {cl.evidence && <span className="mono">{cl.evidence}</span>}
                            <span>{cl.agreed && (cl.lenses || []).length > 1 ? "two lenses agreed" : "one lens only"}</span>
                            <span>{cl.confidence} confidence</span>
                            {clBad && <b>figure not in the evidence</b>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Next steps as targets rather than suggestions buried in prose. */}
                {(((t.plan || {}).followups) || []).length > 0 && (
                  <div className="anp-actions">
                    {t.plan.followups.map((f, j) => (
                      <button key={j} className="anp-action" onClick={() => ask(f)} disabled={busy} title={f}>
                        <i>?</i><span>{f}</span><em>→</em>
                      </button>
                    ))}
                  </div>
                )}

                {/* Confidence, what it read, and why the number is what it is. */}
                <div className="anp-conf">
                  <span className="anp-meter" title={c.why}>
                    {[0, 1, 2, 3, 4].map(s => (
                      <i key={s} className={c.pct > s * 20 ? "on" : ""}/>
                    ))}
                    <b>{c.pct}%</b>
                  </span>
                  <span className="anp-sources">
                    {(t.checks && t.checks.evidenceNumbers) || 0} figures · {t.rangeLabel || "—"}
                  </span>
                  <button className="anp-link" onClick={() => setShowPlan(p => ({ ...p, [k]: !p[k] }))}>why?</button>
                </div>

                <div className="anp-tools">
                  <button className={"anp-tool" + (pins.indexOf(k) !== -1 ? " is-on" : "")}
                    onClick={() => togglePin(k)}>⚲ {pins.indexOf(k) !== -1 ? "Pinned" : "Pin"}</button>
                  <button className="anp-tool" onClick={() => cite(t, i)}>❝ {copied === 1000 + i ? "Copied" : "Cite"}</button>
                  <button className="anp-tool" onClick={() => copyAnswer(t, i)}>⧉ {copied === i ? "Copied" : "Copy"}</button>
                  <button className="anp-tool" onClick={() => ask(t.question)} disabled={busy}
                    title="Ask this again against the figures as they are now">↻ Again</button>
                </div>
              </div>
            </div>
          );
        })}

        {busy && (
          <div className="anp-working">
            <span>Planning, asking each lens, composing — model calls, not a query.</span>
            <span style={{ flex: 1 }}/>
            <button className="anp-stop" onClick={stop}>■ Stop</button>
            <span className="anp-dots"><i/><i/><i/></span>
          </div>
        )}

        {err && <div className={"anp-err" + (err.code === "question_identifies_someone" ? " is-bad" : "")}>{err.text}</div>}
        <div ref={endRef}/>
      </div>

      {/* ── The composer ───────────────────────────────────────────────── */}
      <div className="anp-foot">
        {/* The report draft. Nobody asks six questions for fun — they ask six
            questions because a board paper is due, and the answers have to leave
            this pane with their provenance attached. */}
        {(pins.length > 0 || turns.filter(t => !t.pending).length > 1) && (
          <>
            <button className="anp-report" onClick={() => setReportOpen(o => !o)} aria-expanded={reportOpen}>
              ⚲ <b>Report draft</b> <span className="anp-report-n">{pins.length}</span>
              <span style={{ flex: 1 }}/>{reportOpen ? "▴" : "▾"}
            </button>
            {reportOpen && (
              <div className="anp-reportbody">
                {pinned.length === 0
                  ? <p className="anp-report-empty">Nothing pinned. Pin the answers going into the document — or export the whole conversation.</p>
                  : pins.map((k, n) => {
                    const t = turns.find((x, i) => turnKey(x, i) === k);
                    if (!t) return null;
                    return (
                      <div key={k} className="anp-pin">
                        <span className="anp-pin-n">{n + 1}</span>
                        <span className="anp-pin-t">{t.question}</span>
                        <button className="anp-pin-ic" title="Up" disabled={n === 0} onClick={() => movePin(k, -1)}>↑</button>
                        <button className="anp-pin-ic" title="Down" disabled={n === pins.length - 1} onClick={() => movePin(k, 1)}>↓</button>
                        <button className="anp-pin-ic" title="Remove" onClick={() => togglePin(k)}>✕</button>
                      </div>
                    );
                  })}
                <div className="anp-report-out">
                  <button className="anp-tool is-solid" onClick={() => exportReport("md")}>⭳ Markdown</button>
                  <button className="anp-tool" onClick={() => exportReport("csv")}>CSV</button>
                  <span className="anp-report-note">
                    {pinned.length ? pinned.length + " pinned" : "the whole conversation"} · provenance travels with it
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {drift && (
          <p className="anp-drift">
            The answers above were drawn from <b>{drift.was}</b>; the page now shows <b>{drift.now}</b>.
            Start a new question if you want them comparable.
          </p>
        )}

        {depthOpen && (
          <div className="anp-menu">
            {[["deep", "Deep", "Up to three lenses, and a risk lens on any comparison. Slower, and the one to use for a decision."],
              ["quick", "Quick", "One lens. Faster and a third of the cost — right for a factual look-up."]].map(([id, lab, note]) => (
              <button key={id} className={"anp-menu-it" + (depth === id ? " is-on" : "")}
                onClick={() => { setDepth(id); setDepthOpen(false); }}>
                <b>{lab}</b><span>{note}</span>
              </button>
            ))}
          </div>
        )}

        {atOpen && (
          <div className="anp-menu">
            <div className="anp-menu-h">Reference a centre — it goes into the question, not into the filter</div>
            {((scope && scope.centres) || []).slice(0, 8).map(cn => (
              <button key={cn} className="anp-menu-it" onClick={() => {
                setQ(v => (v + (v && !/\s$/.test(v) ? " " : "") + cn + " ")); setAtOpen(false);
                if (boxRef.current) boxRef.current.focus();
              }}><b>{cn}</b></button>
            ))}
            {!((scope && scope.centres) || []).length &&
              <div className="anp-menu-h">This page has not said which centres it can see.</div>}
          </div>
        )}

        <div className="anp-composer">
          <div className="anp-scope">
            <span className="anp-scope-l">Asking against</span>
            {liveChips.map(c => (
              <span key={c.key} className="anp-chip">{c.label}
                <button title={"Stop scoping to " + c.label} aria-label={"Remove " + c.label}
                  onClick={() => setDropScope(d => ({ ...d, [c.key]: true }))}>✕</button>
              </span>
            ))}
            {chips.filter(c => dropScope[c.key]).map(c => (
              <button key={c.key} className="anp-chip is-off" title="Put this back"
                onClick={() => setDropScope(d => ({ ...d, [c.key]: false }))}>＋ {c.label}</button>
            ))}
            {!liveChips.length && <span className="anp-chip is-all">everything on file</span>}
          </div>
          <textarea ref={boxRef} value={q} onChange={e => setQ(e.target.value)} rows={2} maxLength={600}
            placeholder="Ask about the current view…"
            aria-label="Ask the analysts a question"
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
              if (e.key === "Escape") { if (err) setErr(null); setAtOpen(false); setDepthOpen(false); }
            }}/>
          <div className="anp-composer-bar">
            <button className={"anp-cbtn" + (atOpen ? " is-on" : "")} title="Reference a centre"
              onClick={() => { setAtOpen(o => !o); setDepthOpen(false); }}>@</button>
            <button className={"anp-cbtn is-wide" + (depthOpen ? " is-on" : "")} title="How many lenses to consult"
              onClick={() => { setDepthOpen(o => !o); setAtOpen(false); }}>
              ☰ {depth === "quick" ? "Quick" : "Deep"} ▾
            </button>
            <span style={{ flex: 1 }}/>
            {q.length > 450 && <span className="anp-count">{600 - q.length}</span>}
            <span className="anp-send-hint">⏎ send</span>
            <button className="anp-send" onClick={() => ask()} disabled={busy || q.trim().length < 6}
              aria-label="Ask">➤</button>
          </div>
        </div>

        {/* At the point of use, not in a settings page nobody opens. */}
        <p className="anp-oath">Advisory only — it never edits a record, sends a message, or sees a name.</p>
      </div>
    </aside>
  );
}

function AnDepth({ filters }) {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [rowDim, setRowDim] = React.useState('age');
  const [colDim, setColDim] = React.useState('gender');
  const [method, setMethod] = React.useState(false);

  const load = React.useCallback(() => {
    setErr('');
    NGGApi.admin.analyticsDepth({ centre: filters.centre || '', week: filters.week || '', rowDim, colDim })
      .then(r => setD(r.depth))
      .catch(e => setErr(e.code || e.message || 'Couldn’t load the depth analysis.'));
  }, [filters.centre, filters.week, rowDim, colDim]);
  React.useEffect(() => { load(); }, [load]);

  if (err) return <section className="an-sec" id="an-depth"><div className="an-card"><div className="an-empty" style={{ color: AN_TONE.bad }}>{err}</div></div></section>;
  if (!d) return <section className="an-sec" id="an-depth"><div className="an-card"><div className="an-empty">Computing comparisons…</div></div></section>;
  if (d.empty) return null;

  const h = d.headline || {};
  const ct = d.crosstab || { rows: [], cols: [] };
  const wd = d.weekday || { days: [], centres: [] };
  const sp = d.spread || null;
  const dose = d.dose || [];
  const pw = d.power || null;

  return (
    <section className="an-sec" id="an-depth">
      <div className="an-eyebrow">Level 6 · Depth</div>
      <h2 className="an-h">What it means, and whether it is real.</h2>
      <p className="an-sub">
        Every rate below is <b>present-days over opportunity-days</b> — one definition across every panel — carried with a
        95% confidence interval and, where the groups are big enough, a test. At this size most single cells are not yet
        evidence, and the ones that aren’t are marked so rather than left to be over-read.
      </p>

      {/* What the page thinks. Stated, with the figures behind it. */}
      <div className="an-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12, marginBottom: 16 }}>
        {(d.findings || []).map((f, i) => {
          const sv = AN_SEV[f.severity] || AN_SEV.info;
          return (
            <div key={i} className="an-card" style={{ background: sv.bg, borderLeft: '3px solid ' + sv.bar }}>
              <div className="an-pill" style={{ background: 'rgba(255,255,255,.7)', color: sv.bar, marginBottom: 6 }}>{sv.label}</div>
              <b style={{ display: 'block', fontSize: 14.5, lineHeight: 1.35, marginBottom: 4 }}>{f.title}</b>
              <span style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-600)' }}>{f.detail}</span>
            </div>
          );
        })}
      </div>

      {/* This period against the one before it — same number of days either side. */}
      <div className="an-card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>This period against the last</h3>
        <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-400)', fontWeight: 700, marginBottom: 4 }}>
              {d.range.label} · {d.range.days} days
            </div>
            <AnCIBar ci={h.attendance}/>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-400)', fontWeight: 700, marginBottom: 4 }}>
              Previous {d.previous.days} days
            </div>
            <AnCIBar ci={h.previous} tone="#94a3b8"/>
          </div>
          <div style={{ maxWidth: 340 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-400)', fontWeight: 700, marginBottom: 4 }}>Change</div>
            <b style={{ fontSize: 20, color: h.delta && h.delta.dir === 'up' ? AN_TONE.good : h.delta && h.delta.dir === 'down' ? AN_TONE.bad : 'var(--ink-500)' }}>
              {h.delta && h.delta.delta !== null ? (h.delta.delta > 0 ? '+' : '') + h.delta.delta + ' pts' : '—'}
            </b>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-500)', marginTop: 4 }}>
              {(h.test && h.test.text) || 'Not enough data to compare.'}
            </div>
          </div>
        </div>
      </div>

      {/* Per centre, tested against the rest of the programme rather than ranked. */}
      <div className="an-card" style={{ marginBottom: 16, padding: 0, overflowX: 'auto' }}>
        <table className="admin-table" style={{ minWidth: 720 }}>
          <thead><tr><th>Centre</th><th>Attendance (95% CI)</th><th>vs programme</th><th>Is the difference real?</th></tr></thead>
          <tbody>
            {(d.perCentre || []).length === 0
              ? <tr><td colSpan={4} className="an-empty">No centre has attendance in this range.</td></tr>
              : d.perCentre.map(c => (
                <tr key={c.centre}>
                  <td><b>{c.centre}</b><div style={{ color: 'var(--ink-400)', fontSize: 11.5 }}>{c.students} children</div></td>
                  <td><AnCIBar ci={c.ci}/></td>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 700,
                               color: c.vsProgramme.dir === 'up' ? AN_TONE.good : c.vsProgramme.dir === 'down' ? AN_TONE.bad : 'var(--ink-500)' }}>
                    {c.vsProgramme.delta === null ? '—' : (c.vsProgramme.delta > 0 ? '+' : '') + c.vsProgramme.delta + ' pts'}
                  </td>
                  {/* A ranking invites a comparison the reader has no way to
                      evaluate. This says whether it survives a test. */}
                  <td style={{ fontSize: 12, maxWidth: 300, color: 'var(--ink-600)' }}>
                    <span className="an-pill" style={{
                      background: c.test.verdict === 'significant' ? 'rgba(239,68,68,.12)' : '#eef1f6',
                      color: c.test.verdict === 'significant' ? AN_TONE.bad : 'var(--ink-500)', marginRight: 6,
                    }}>{c.test.verdict === 'significant' ? 'real'
                        : (c.test.verdict === 'too_small' || c.test.verdict === 'too_few_people' || c.test.verdict === 'no_data') ? 'unknown'
                        : 'noise'}</span>
                    {c.test.text}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Cross-tab: two dimensions at once, with margins. */}
      <div className="an-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Segments</h3>
          <label style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>Rows
            <select className="an-chip" value={rowDim} onChange={e => setRowDim(e.target.value)}>
              {Object.keys(d.dims).map(k => <option key={k} value={k}>{d.dims[k]}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>Columns
            <select className="an-chip" value={colDim} onChange={e => setColDim(e.target.value)}>
              {Object.keys(d.dims).map(k => <option key={k} value={k}>{d.dims[k]}</option>)}
            </select>
          </label>
          <span className="an-sub" style={{ margin: 0, fontSize: 12 }}>
            Gender and age used to sit in two separate tables, which cannot answer a question involving both.
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ minWidth: 640 }}>
            <thead><tr>
              <th>{d.dims[rowDim]}</th>
              {ct.cols.map(c => <th key={c}>{c}</th>)}
              <th style={{ borderLeft: '2px solid rgba(0,0,0,.1)' }}>All</th>
            </tr></thead>
            <tbody>
              {ct.rows.map(r => (
                <tr key={r.label}>
                  <td><b>{r.label}</b></td>
                  {r.cells.map((c, i) => <td key={i}><AnCIBar ci={c} compact/></td>)}
                  <td style={{ borderLeft: '2px solid rgba(0,0,0,.1)' }}><AnCIBar ci={r.total} compact/></td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid rgba(0,0,0,.1)' }}>
                <td><b>All</b></td>
                {(ct.colTotals || []).map((c, i) => <td key={i}><AnCIBar ci={c} compact/></td>)}
                <td style={{ borderLeft: '2px solid rgba(0,0,0,.1)' }}><AnCIBar ci={ct.grand} compact/></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekday × centre. The panel a coordinator actually acts on. */}
      {wd.centres.length > 0 && (
        <div className="an-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Attendance by weekday</h3>
          <p className="an-sub" style={{ marginTop: 0 }}>
            A centre that is full on Saturday and empty on Wednesday has a timetable or transport problem, not an
            engagement problem — and no single rate can tell those apart.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ minWidth: 520 }}>
              <thead><tr><th>Centre</th>{wd.days.map(x => <th key={x} style={{ textAlign: 'center' }}>{x}</th>)}</tr></thead>
              <tbody>
                {wd.centres.map(r => (
                  <tr key={r.centre}>
                    <td><b>{r.centre}</b></td>
                    {r.cells.map((c, i) => <AnHeatCell key={i} ci={c}/>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Retention by week since each child's own enrolment. */}
      {(d.retention.cohorts || []).length > 0 && (
        <div className="an-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Retention by intake</h3>
          <p className="an-sub" style={{ marginTop: 0 }}>
            Share of each intake still attending N weeks after they joined. A headcount trend cannot answer this —
            recruitment and retention move it in the same direction.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table" style={{ minWidth: 560 }}>
              <thead><tr><th>Intake</th><th>Size</th>
                {(() => {
                  // Columns span the real week offsets present, not 0..n — a
                  // cohort whose early weeks predate the register starts later.
                  const wks = [];
                  d.retention.cohorts.forEach(c => c.curve.forEach(p => { if (wks.indexOf(p.week) === -1) wks.push(p.week); }));
                  wks.sort((a, b) => a - b);
                  return wks.map(k => <th key={k} style={{ textAlign: 'center' }}>wk {k}</th>);
                })()}
              </tr></thead>
              <tbody>
                {d.retention.cohorts.map(c => {
                  const wks = [];
                  d.retention.cohorts.forEach(x => x.curve.forEach(p => { if (wks.indexOf(p.week) === -1) wks.push(p.week); }));
                  wks.sort((a, b) => a - b);
                  const at = {}; c.curve.forEach(p => { at[p.week] = p; });
                  return (
                    <tr key={c.cohort}>
                      <td><b>{c.cohort}</b>
                        {c.unobservedWeeks > 0 && <div style={{ fontSize: 10.5, color: 'var(--ink-400)' }}>
                          first {c.unobservedWeeks} week{c.unobservedWeeks === 1 ? '' : 's'} predate the register
                        </div>}
                      </td>
                      <td className="mono">{c.size}</td>
                      {wks.map(k => <AnHeatCell key={k} ci={at[k] || null}/>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* What the headline rate hides. One average describes two opposite
          programmes, and the average is the statistic guaranteed not to show it. */}
      {sp && (
        <div className="an-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Who the average is made of</h3>
          <p className="an-sub" style={{ marginTop: 0 }}>
            “70% attendance” is either everyone coming seven days in ten, or half the children coming almost every day
            while the other half barely come at all. Those are different programmes with the same number.
          </p>
          {!sp.ok
            ? <div className="an-empty">{sp.text}</div>
            : (
              <>
                <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-400)', fontWeight: 700 }}>Spread</div>
                    <b style={{ fontSize: 20, color: sp.shape === 'even' ? AN_TONE.good : sp.shape === 'uneven' ? AN_TONE.warn : AN_TONE.bad }}>
                      {sp.shape}
                    </b>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>Gini {sp.gini}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-400)', fontWeight: 700 }}>Median child</div>
                    <b style={{ fontSize: 20 }}>{sp.median}%</b>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>{sp.n} children</div>
                  </div>
                  {/* Thirds, against what an even spread would hold — the form a
                      coordinator can act on, unlike a bare coefficient. */}
                  <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-400)', fontWeight: 700, marginBottom: 6 }}>
                      Share of all attendance
                    </div>
                    {[['Best-attending third', sp.topThirdShare, AN_TONE.good],
                      ['Weakest third', sp.bottomThirdShare, AN_TONE.bad]].map(([label, val, tone]) => (
                      <div key={label} style={{ marginBottom: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: 'var(--ink-600)' }}>{label}</span>
                          <b className="mono">{val}%</b>
                        </div>
                        <div style={{ position: 'relative', height: 8, borderRadius: 4, background: '#eef1f6' }}>
                          <div style={{ position: 'absolute', inset: 0, width: Math.min(100, val) + '%', borderRadius: 4, background: tone }}/>
                          {/* Where an even spread would sit, so the bars are read against something. */}
                          <div title={'Even spread: ' + sp.evenShare + '%'}
                               style={{ position: 'absolute', top: -2, bottom: -2, left: Math.min(100, sp.evenShare) + '%', width: 2, background: 'var(--ink-500)' }}/>
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: 'var(--ink-400)' }}>Vertical mark = {sp.evenShare}%, where an even spread would put each third.</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-600)' }}>{sp.text}</div>
              </>
            )}
        </div>
      )}

      {/* Dose against outcome. The finding worth having is the absence of one. */}
      {dose.length > 0 && (
        <div className="an-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Does attending more actually help?</h3>
          <p className="an-sub" style={{ marginTop: 0 }}>
            Each child’s own attendance rate against their own outcome. If the children who come twice as often do no
            better, attendance is not the lever it is assumed to be — and that is worth knowing before another term is
            spent pushing it.
          </p>
          <div className="an-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
            {dose.map(x => {
              const tone = x.verdict === 'associated' ? AN_TONE.good
                : (x.verdict === 'not_significant' || x.verdict === 'trivial') ? AN_TONE.warn : 'var(--ink-400)';
              const pill = x.verdict === 'associated' ? 'association'
                : x.verdict === 'trivial' ? 'negligible'
                : x.verdict === 'not_significant' ? 'none found' : 'not measurable';
              return (
                <div key={x.key} style={{ border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <b style={{ fontSize: 14 }}>{x.outcome}</b>
                    <span className="an-pill" style={{ background: 'rgba(0,0,0,.05)', color: tone }}>{pill}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginBottom: 6 }}>Measured as {x.unit}</div>
                  {x.ok ? (
                    <div className="mono" style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 6 }}>
                      r = {x.r} · r² = {x.r2} · p = {x.p} · n = {x.n}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-600)' }}>{x.text}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 6 }}>
                    {x.covered} of {x.of} children have {x.has}. The rest are left out, not counted as zero.
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* What this cohort could even have found — the note "not significant" needs. */}
      {pw && pw.ok && (
        <div className="an-card" style={{ marginBottom: 16, borderLeft: '3px solid ' + (pw.blind ? AN_TONE.bad : AN_TONE.warn) }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Past ~50 points the figure is a verdict on the cohort, not a
                threshold, and printing it big reads as a broken calculation. */}
            <div style={{ minWidth: 190 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-400)', fontWeight: 700 }}>
                Smallest gap this data could see
              </div>
              {pw.blind
                ? <>
                    <b style={{ fontSize: 19, color: AN_TONE.bad, lineHeight: 1.2, display: 'block' }}>Nothing realistic</b>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>needs ~{Math.round(pw.mde)} pts</div>
                  </>
                : <b style={{ fontSize: 26 }}>{pw.mde} pts</b>}
              <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>{pw.power}% power · {pw.children} children per group</div>
            </div>
            <div style={{ flex: '1 1 300px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-600)' }}>{pw.text}</div>
          </div>
        </div>
      )}

      <div className="an-card">
        <button className="an-chip" onClick={() => setMethod(m => !m)}>
          {method ? 'Hide method' : 'How these are calculated'}
        </button>
        {method && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink-500)' }}>
            {Object.keys(d.method).map(k => <li key={k}>{d.method[k]}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
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
      ["Total students", ex.totalStudents], ["Centres", ex.centres], ["Faculties", ex.departments],
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

Object.assign(window, { AnalyticsWorkspace, AnalystPane, anConfidence, anSteps });
