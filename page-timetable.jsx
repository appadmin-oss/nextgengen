/* ============================================================================
   NGG — Timetable maker (/timetable)

   A public tool: anybody — a member, a parent, a child who has never heard of
   NGG — designs their own weekly timetable on a professionally set template,
   and takes it away as a picture, a print-ready PDF, or a calendar file their
   phone understands. A centre's official timetable is one way to START (it is
   imported as classes they can then change); it is not the page.

   Three rules this file keeps:

   · NOTHING NEEDS A DRAG. Every class is added and changed through a form;
     the poster is a picture of the data, never the way in. Its accessible
     equivalent is the class list beside it, which is the editor itself.
   · ONE POSTER, NEVER TWO. `TmPoster` draws the preview, the PNG, the PDF and
     the print. The preview is the same element scaled down, and the export
     renders the same component at full size off screen — what you see is
     what downloads.
   · A TEMPLATE IS DATA. Colours live in the template table and reach the
     poster as CSS custom properties, because they ARE data (the one exception
     CLAUDE.md §8 allows). Layout and type are classes in styles.css.

   Rendering is in the browser (html2canvas + jsPDF via loadVendor), because the
   host has no headless renderer. html2canvas does not understand color-mix()
   or repeating gradients, so shades are worked out here and hour lines are
   real elements.

   State is the visitor's own: saved in this browser (a convenience, guarded),
   and shareable as a link whose fragment carries the whole timetable — the
   server never sees it.
   ========================================================================== */

const TM_DAYS = [[1, "Monday", "Mon"], [2, "Tuesday", "Tue"], [3, "Wednesday", "Wed"], [4, "Thursday", "Thu"], [5, "Friday", "Fri"], [6, "Saturday", "Sat"], [7, "Sunday", "Sun"]];
const TM_STORE = "ngg.timetable.maker.v1";
/* Eight hue families, the same in every template, so a class keeps its NAMED
   colour when the template changes and the colour picker can say what it is. */
const TM_COLOUR_NAMES = ["Blue", "Green", "Amber", "Rose", "Violet", "Orange", "Teal", "Slate"];

const TM_TEMPLATES = [
  { id: "studio", name: "Studio", blurb: "Clean white paper, quiet colour.",
    v: { bg: "#ffffff", ink: "#111827", ink2: "#4b5563", line: "#e7e9ee", band: "#111827", bandInk: "#ffffff", accent: "#2563eb", dayBg: "#f6f7f9" },
    palette: ["#cfe0ff", "#cdeed8", "#fde7b0", "#fbd3e0", "#e2d8fb", "#ffd9bd", "#c4ecef", "#dfe3ea"] },
  { id: "midnight", name: "Midnight", blurb: "Deep navy, bright blocks, gold title.",
    v: { bg: "#0b1026", bg2: "#1d2a5c", ink: "#f4f6ff", ink2: "#b9c2e6", line: "rgba(255,255,255,0.10)", band: "#f5b026", bandInk: "#0b1026", accent: "#f5b026", dayBg: "rgba(255,255,255,0.06)" },
    palette: ["#5b8cff", "#3ecf8e", "#ffc94d", "#ff7aa2", "#a78bfa", "#ff9a4d", "#38d1d9", "#94a3b8"] },
  { id: "sunrise", name: "Sunrise", blurb: "Warm cream with a glowing header.",
    v: { bg: "#fff8ef", ink: "#2b1d12", ink2: "#6b5444", line: "#f1e4d3", band: "#ff6b4a", band2: "#ffb547", bandInk: "#2b1d12", accent: "#b8371e", dayBg: "#fdeedd" },
    palette: ["#bcd7ff", "#c3ecc9", "#ffe08a", "#ffc2c7", "#dcc8ff", "#ffc49b", "#b5ebe4", "#e6dccf"] },
  { id: "blueprint", name: "Blueprint", blurb: "Drafting-table blue, white linework.",
    v: { bg: "#123e8c", ink: "#ffffff", ink2: "#cfe0ff", line: "rgba(255,255,255,0.16)", band: "#ffffff", bandInk: "#123e8c", accent: "#ffe066", dayBg: "rgba(255,255,255,0.08)" },
    palette: ["#9cc2ff", "#8ee3b5", "#ffe066", "#ffb3c7", "#c9b6ff", "#ffbf80", "#7fe3e8", "#d5dbe6"] },
  { id: "bold", name: "Bold", blurb: "Big type, solid blocks, hard shadows.",
    v: { bg: "#f4f1ea", ink: "#0a0a0a", ink2: "#3a3a3a", line: "rgba(10,10,10,0.16)", band: "#0a0a0a", bandInk: "#d9ff3f", accent: "#0a0a0a", dayBg: "#0a0a0a" },
    palette: ["#3d7bff", "#1fbf6e", "#ffc400", "#ff4f8b", "#8b5cf6", "#ff7a1a", "#00b8c4", "#8a8f99"] },
  { id: "kente", name: "Kente", blurb: "Woven gold, green and red, on ivory.",
    v: { bg: "#fffaf0", ink: "#1f2a1a", ink2: "#56604c", line: "#efe3c8", band: "#14532d", bandInk: "#fff7df", accent: "#8a5a00", dayBg: "#f8efda",
         stripes: ["#d4a017", "#14532d", "#b91c1c", "#111111", "#d4a017", "#14532d"] },
    palette: ["#b7d0f5", "#b9e2b0", "#f7d774", "#f4b6a6", "#d6c3ec", "#f5bf85", "#a9dfd6", "#ddd4c0"] },
];
const tmTemplate = (id) => TM_TEMPLATES.find(t => t.id === id) || TM_TEMPLATES[0];

/* Paper: the poster is drawn at a fixed pixel size whose shape IS the paper's,
   so the PDF is the picture at full bleed with nothing stretched. */
const TM_PAPER = { a4: { name: "A4", mm: [297, 210], ratio: 297 / 210 }, letter: { name: "US Letter", mm: [279.4, 215.9], ratio: 279.4 / 215.9 } };
const TM_BASE_W = 1600;
function tmPosterSize(s) {
  const r = (TM_PAPER[s.paper] || TM_PAPER.a4).ratio;
  return s.orient === "portrait" ? { w: Math.round(TM_BASE_W / r), h: TM_BASE_W } : { w: TM_BASE_W, h: Math.round(TM_BASE_W / r) };
}

/* ── Small pure helpers ─────────────────────────────────────────────────── */
function tmMin(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "")); if (!m) return null; const h = +m[1], mi = +m[2]; return h > 23 || mi > 59 ? null : h * 60 + mi; }
function tmFmt(mins, clock) {
  const h = Math.floor(mins / 60) % 24, m = mins % 60, mm = String(m).padStart(2, "0");
  if (clock === "12") return ((h % 12) || 12) + (m ? ":" + mm : "") + (h < 12 ? " am" : " pm");
  return String(h).padStart(2, "0") + ":" + mm;
}
function tmShade(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return hex;
  const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(x => Math.max(0, Math.min(255, Math.round(f < 0 ? x * (1 + f) : x + (255 - x) * f))));
  return "#" + c.map(x => x.toString(16).padStart(2, "0")).join("");
}
function tmId() { return "c" + Math.random().toString(36).slice(2, 9); }
function tmSlug(s) { return String(s || "timetable").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "timetable"; }

const TM_DEFAULT_SETTINGS = { title: "My week", subtitle: "", template: "studio", days: [1, 2, 3, 4, 5], from: 8, to: 17, clock: "24",
  orient: "landscape", paper: "a4", showPlace: true, note: "", startsOn: "", until: "" };
function tmSample() {
  const e = (title, days, start, end, place, color) => ({ id: tmId(), title, days, start, end, place, note: "", color });
  return {
    settings: { ...TM_DEFAULT_SETTINGS, title: "My school week", subtitle: "Term 1 · 2026", days: [1, 2, 3, 4, 5, 6], from: 8, to: 16 },
    entries: [
      e("Mathematics", [1, 3, 5], "08:30", "09:30", "Room 4", 0), e("English", [1, 2, 4], "09:45", "10:45", "Room 2", 3),
      e("Basic Science", [2, 4], "08:30", "09:45", "Lab", 1), e("Break", [1, 2, 3, 4, 5], "11:00", "11:30", "", 7),
      e("Social Studies", [3], "09:45", "10:45", "Room 2", 5), e("Computer Studies", [5], "09:45", "11:00", "ICT room", 6),
      e("Homework club", [1, 3], "14:00", "15:00", "Library", 4), e("Football", [2, 4], "14:00", "15:30", "Field", 2),
      e("NGG Club", [6], "09:00", "13:00", "My NGG centre", 0),
    ],
  };
}
/* Validate anything that came from storage or a shared link: it is the
   visitor's own data, but a hand-edited link must not break the page. */
function tmClean(raw) {
  const s = Object.assign({}, TM_DEFAULT_SETTINGS, (raw && raw.settings) || {});
  s.title = String(s.title || "").slice(0, 60); s.subtitle = String(s.subtitle || "").slice(0, 80); s.note = String(s.note || "").slice(0, 120);
  s.template = tmTemplate(s.template).id;
  s.days = (Array.isArray(s.days) ? s.days : []).map(Number).filter(d => d >= 1 && d <= 7);
  if (!s.days.length) s.days = [1, 2, 3, 4, 5];
  s.from = Math.max(0, Math.min(23, parseInt(s.from, 10) || 0)); s.to = Math.max(s.from + 1, Math.min(24, parseInt(s.to, 10) || 17));
  s.clock = s.clock === "12" ? "12" : "24"; s.orient = s.orient === "portrait" ? "portrait" : "landscape"; s.paper = TM_PAPER[s.paper] ? s.paper : "a4";
  s.showPlace = s.showPlace !== false;
  s.startsOn = /^\d{4}-\d{2}-\d{2}$/.test(s.startsOn || "") ? s.startsOn : ""; s.until = /^\d{4}-\d{2}-\d{2}$/.test(s.until || "") ? s.until : "";
  const entries = (Array.isArray(raw && raw.entries) ? raw.entries : []).slice(0, 120).map(x => ({
    id: String((x && x.id) || tmId()).slice(0, 12), title: String((x && x.title) || "").slice(0, 60),
    days: (Array.isArray(x && x.days) ? x.days : []).map(Number).filter(d => d >= 1 && d <= 7),
    start: String((x && x.start) || ""), end: String((x && x.end) || ""), place: String((x && x.place) || "").slice(0, 60),
    note: String((x && x.note) || "").slice(0, 80), color: Math.max(0, Math.min(7, parseInt(x && x.color, 10) || 0)),
  })).filter(x => x.title && x.days.length && tmMin(x.start) !== null && tmMin(x.end) !== null && tmMin(x.end) > tmMin(x.start));
  return { settings: s, entries };
}
function tmEncode(state) {
  const json = JSON.stringify({ settings: state.settings, entries: state.entries.map(({ id, ...r }) => r) });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function tmDecode(str) {
  try { return tmClean(JSON.parse(decodeURIComponent(escape(atob(String(str).replace(/-/g, "+").replace(/_/g, "/")))))); } catch (_) { return null; }
}

/* The hours and days the poster must show: what the visitor chose, widened to
   fit every class — a class is never cut off because a setting was narrow. */
function tmFrame(settings, entries) {
  let from = settings.from * 60, to = settings.to * 60;
  const days = new Set(settings.days);
  entries.forEach(e => { from = Math.min(from, Math.floor(tmMin(e.start) / 60) * 60); to = Math.max(to, Math.ceil(tmMin(e.end) / 60) * 60); e.days.forEach(d => days.add(d)); });
  return { from, to: Math.min(to, 24 * 60), days: TM_DAYS.filter(d => days.has(d[0])) };
}
/* Side-by-side lanes for classes that overlap on a day, and which overlap. */
function tmLayoutDay(items) {
  const sorted = items.slice().sort((a, b) => a.s - b.s || a.e - b.e);
  const out = []; let cluster = [], clusterEnd = -1, lanesEnd = [];
  const flush = () => { const n = lanesEnd.length || 1; cluster.forEach(x => { x.lanes = n; out.push(x); }); cluster = []; lanesEnd = []; };
  sorted.forEach(it => {
    if (it.s >= clusterEnd && cluster.length) flush();
    let lane = lanesEnd.findIndex(end => end <= it.s);
    if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(it.e); } else lanesEnd[lane] = it.e;
    it.lane = lane; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e);
  });
  flush();
  return out;
}
function tmOverlaps(entries) {
  const out = {};
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i], b = entries[j];
    const shared = a.days.filter(d => b.days.indexOf(d) !== -1);
    if (shared.length && tmMin(a.start) < tmMin(b.end) && tmMin(b.start) < tmMin(a.end)) {
      (out[a.id] = out[a.id] || []).push(b.title); (out[b.id] = out[b.id] || []).push(a.title);
    }
  }
  return out;
}

/* ── The poster: preview, PNG, PDF and print are all this ──────────────── */
function TmPoster({ settings, entries, size, posterRef, id }) {
  const tpl = tmTemplate(settings.template);
  const frame = tmFrame(settings, entries);
  const span = Math.max(60, frame.to - frame.from);
  const hours = []; for (let m = frame.from; m <= frame.to; m += 60) hours.push(m);
  const v = tpl.v;
  const vars = { "--tm-bg": v.bg, "--tm-bg2": v.bg2 || v.bg, "--tm-ink": v.ink, "--tm-ink2": v.ink2, "--tm-line": v.line, "--tm-band": v.band,
    "--tm-band2": v.band2 || v.band, "--tm-band-ink": v.bandInk, "--tm-accent": v.accent, "--tm-day": v.dayBg, width: size.w + "px", height: size.h + "px" };
  const byDay = {};
  frame.days.forEach(([d]) => {
    byDay[d] = tmLayoutDay(entries.filter(e => e.days.indexOf(d) !== -1).map(e => ({ e2: e, s: tmMin(e.start), e: tmMin(e.end) })));
  });
  const total = entries.reduce((n, e) => n + e.days.length, 0);
  return (
    <div ref={posterRef} id={id} className={"tmp tmp--" + tpl.id + (settings.orient === "portrait" ? " is-portrait" : "") + (frame.days.length > 5 ? " is-wide" : "")} style={vars}
      role="img" aria-label={(settings.title || "Timetable") + ": " + total + " class" + (total === 1 ? "" : "es") + " across " + frame.days.length + " day" + (frame.days.length === 1 ? "" : "s") + ". The list of classes on this page says the same in words."}>
      {tpl.id === "kente" && <div className="tmp-weave" aria-hidden="true">{(v.stripes || []).concat(v.stripes || []).concat(v.stripes || []).map((c, i) => <span key={i} style={{ background: c }}/>)}</div>}
      <header className="tmp-head">
        <div className="tmp-head-text">
          <div className="tmp-kicker">Weekly timetable</div>
          <div className="tmp-title">{settings.title || "My week"}</div>
          {settings.subtitle && <div className="tmp-sub">{settings.subtitle}</div>}
        </div>
        <div className="tmp-range">{tmFmt(frame.from, settings.clock)} – {tmFmt(frame.to, settings.clock)}</div>
      </header>
      <div className="tmp-body" style={{ gridTemplateColumns: "var(--tm-timecol) repeat(" + frame.days.length + ", 1fr)" }}>
        <div className="tmp-corner"/>
        {frame.days.map(([d, name, short]) => <div key={d} className="tmp-dayhead"><span className="tmp-dayname">{frame.days.length > 5 ? short : name}</span></div>)}
        <div className="tmp-times">
          {hours.map(m => <div key={m} className="tmp-hour" style={{ top: ((m - frame.from) / span * 100) + "%" }}><span>{tmFmt(m, settings.clock)}</span></div>)}
        </div>
        {frame.days.map(([d]) => (
          <div key={d} className="tmp-col">
            {hours.map(m => <div key={m} className="tmp-line" style={{ top: ((m - frame.from) / span * 100) + "%" }}/>)}
            {byDay[d].map(x => {
              const e = x.e2, col = tpl.palette[e.color] || tpl.palette[0], ink = inkOn(col).ink, dur = x.e - x.s;
              const st = { top: ((x.s - frame.from) / span * 100) + "%", height: (dur / span * 100) + "%",
                left: "calc(" + (x.lane / x.lanes * 100) + "% + 3px)", width: "calc(" + (100 / x.lanes) + "% - 6px)",
                "--tmb": col, "--tmb-ink": ink, "--tmb-edge": tmShade(col, -0.38) };
              return (
                <div key={e.id + ":" + d} className={"tmb" + (dur <= 40 ? " is-short" : "") + (dur <= 25 ? " is-tiny" : "") + (x.lanes > 1 ? " is-split" : "")} style={st}>
                  <div className="tmb-title">{e.title}</div>
                  <div className="tmb-time">{tmFmt(x.s, settings.clock)}–{tmFmt(x.e, settings.clock)}</div>
                  {settings.showPlace && e.place && <div className="tmb-place">{e.place}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <footer className="tmp-foot">
        <span>{settings.note}</span>
        <span className="tmp-made">Made with the NGG Timetable maker</span>
      </footer>
    </div>
  );
}

/* Scales the full-size poster to whatever width the preview has — measured by
   the stage itself, not the window, so it is right in any layout. */
function TmStage({ settings, entries, size, posterRef }) {
  const stageRef = React.useRef(null);
  const [scale, setScale] = React.useState(0.5);
  React.useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / size.w));
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el); else window.addEventListener("resize", fit);
    return () => { if (ro) ro.disconnect(); else window.removeEventListener("resize", fit); };
  }, [size.w]);
  return (
    <div ref={stageRef} className="tm-stage">
      <div className="tm-scale" style={{ width: size.w * scale, height: size.h * scale }}>
        <div className="tm-scale-in" style={{ transform: "scale(" + scale + ")" }}>
          <TmPoster settings={settings} entries={entries} size={size} posterRef={posterRef}/>
        </div>
      </div>
    </div>
  );
}

/* ── The calendar file ──────────────────────────────────────────────────── */
function tmIcs(settings, entries) {
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); };
  const ymd = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  const hm = (mins) => String(Math.floor(mins / 60)).padStart(2, "0") + String(mins % 60).padStart(2, "0") + "00";
  const start = settings.startsOn ? new Date(settings.startsOn + "T12:00:00") : new Date();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Next Generation Genius//Timetable maker//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:" + esc(settings.title || "My timetable"), "X-WR-TIMEZONE:Africa/Lagos",
    "BEGIN:VTIMEZONE", "TZID:Africa/Lagos", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0100", "TZNAME:WAT", "END:STANDARD", "END:VTIMEZONE"];
  entries.forEach(e => e.days.forEach(d => {
    // The first date on or after the start date that falls on this weekday.
    const first = new Date(start); const jsDay = d % 7; // Monday=1 … Sunday=0
    first.setDate(first.getDate() + ((jsDay - first.getDay() + 7) % 7));
    lines.push("BEGIN:VEVENT", "UID:" + e.id + "-" + d + "-" + ymd(first) + "@timetable.nextgengenius",
      "DTSTAMP:" + stamp, "DTSTART;TZID=Africa/Lagos:" + ymd(first) + "T" + hm(tmMin(e.start)), "DTEND;TZID=Africa/Lagos:" + ymd(first) + "T" + hm(tmMin(e.end)),
      "RRULE:FREQ=WEEKLY" + (settings.until ? ";UNTIL=" + settings.until.replace(/-/g, "") + "T225959Z" : ""),
      "SUMMARY:" + esc(e.title));
    if (e.place) lines.push("LOCATION:" + esc(e.place));
    if (e.note) lines.push("DESCRIPTION:" + esc(e.note));
    lines.push("END:VEVENT");
  }));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
function tmSave(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ── One class: add or change ───────────────────────────────────────────── */
function TmEntryForm({ initial, tpl, onSave, onCancel, clock }) {
  const [f, setF] = React.useState(() => initial || { id: "", title: "", days: [1], start: "09:00", end: "10:00", place: "", note: "", color: 0 });
  const [err, setErr] = React.useState("");
  const titleRef = React.useRef(null);
  React.useEffect(() => { titleRef.current && titleRef.current.focus(); }, []);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const toggleDay = (d) => set("days", f.days.indexOf(d) !== -1 ? f.days.filter(x => x !== d) : f.days.concat([d]).sort());
  const submit = (ev) => {
    ev.preventDefault();
    const a = tmMin(f.start), b = tmMin(f.end);
    if (!f.title.trim()) return setErr("Give the class a name.");
    if (!f.days.length) return setErr("Pick at least one day.");
    if (a === null || b === null) return setErr("Times are like 09:00 or 14:30.");
    if (b <= a) return setErr("It has to end after it starts.");
    setErr(""); onSave({ ...f, title: f.title.trim(), place: f.place.trim(), note: f.note.trim(), id: f.id || tmId() });
  };
  return (
    <form className="tm-form" onSubmit={submit} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }} aria-labelledby="tm-form-h">
      <h3 id="tm-form-h" className="tm-form-h">{initial && initial.id ? "Change “" + initial.title + "”" : "Add a class"}</h3>
      <label className="tm-field"><span>Name</span>
        <input ref={titleRef} value={f.title} maxLength={60} onChange={e => set("title", e.target.value)} placeholder="e.g. Mathematics, Piano, Football"/></label>
      <fieldset className="tm-fieldset"><legend>Days</legend>
        <div className="tm-days">{TM_DAYS.map(([d, name, short]) => (
          <button key={d} type="button" className={"tm-day" + (f.days.indexOf(d) !== -1 ? " is-on" : "")} aria-pressed={f.days.indexOf(d) !== -1} aria-label={name} onClick={() => toggleDay(d)}>{short}</button>
        ))}</div>
      </fieldset>
      <div className="tm-row2">
        <label className="tm-field"><span>Starts</span><input type="time" step="300" value={f.start} onChange={e => set("start", e.target.value)}/></label>
        <label className="tm-field"><span>Ends</span><input type="time" step="300" value={f.end} onChange={e => set("end", e.target.value)}/></label>
      </div>
      <label className="tm-field"><span>Where <em>· optional</em></span><input value={f.place} maxLength={60} onChange={e => set("place", e.target.value)} placeholder="Room, centre, field…"/></label>
      <label className="tm-field"><span>Note for the calendar <em>· optional</em></span><input value={f.note} maxLength={80} onChange={e => set("note", e.target.value)} placeholder="Bring your recorder"/></label>
      <fieldset className="tm-fieldset"><legend>Colour</legend>
        <div className="tm-swatches" role="radiogroup" aria-label="Colour">
          {tpl.palette.map((c, i) => (
            <label key={i} className={"tm-swatch" + (f.color === i ? " is-on" : "")} style={{ "--sw": c, "--sw-ink": inkOn(c).ink }}>
              <input type="radio" name="tm-colour" className="sr-only" checked={f.color === i} onChange={() => set("color", i)}/>
              <span aria-hidden="true">{f.color === i ? "✓" : ""}</span><span className="sr-only">{TM_COLOUR_NAMES[i]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {err && <p className="tm-err" role="alert">{err}</p>}
      <div className="tm-form-actions">
        <button type="submit" className="btn btn-primary">{initial && initial.id ? "Save changes" : "Add to my timetable"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */
function TimetablePage({ setPage }) {
  const initial = React.useMemo(() => {
    try { const h = /(?:^#|&)t=([^&]+)/.exec(window.location.hash || ""); if (h) { const d = tmDecode(h[1]); if (d) return { ...d, from: "link" }; } } catch (_) {}
    try { const raw = localStorage.getItem(TM_STORE); if (raw) return { ...tmClean(JSON.parse(raw)), from: "saved" }; } catch (_) {}
    return { ...tmSample(), from: "sample" };
  }, []);
  const [settings, setSettings] = React.useState(initial.settings);
  const [entries, setEntries] = React.useState(initial.entries);
  const [editing, setEditing] = React.useState(null);     // null | {} (new) | entry
  // A shared centre link (?centre=) opens on that centre's week.
  const [tab, setTab] = React.useState(() => { try { return new URL(window.location.href).searchParams.get("centre") ? "start" : "classes"; } catch (_) { return "classes"; } });
  const [busy, setBusy] = React.useState("");
  const [say, setSay] = React.useState(initial.from === "link" ? "Opened the timetable from your link." : initial.from === "saved" ? "Your timetable is back where you left it." : "");
  const posterRef = React.useRef(null);
  const exportRef = React.useRef(null);
  const addBtnRef = React.useRef(null);
  const [exporting, setExporting] = React.useState(false);
  const tpl = tmTemplate(settings.template);
  const size = tmPosterSize(settings);
  const overlaps = React.useMemo(() => tmOverlaps(entries), [entries]);
  const setS = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  // Saved in this browser as they go — a convenience; the link is the way to keep it.
  React.useEffect(() => { try { localStorage.setItem(TM_STORE, JSON.stringify({ settings, entries })); } catch (_) {} }, [settings, entries]);
  // The link in the address bar is dropped once it is read, so editing does not leave a stale share in it.
  React.useEffect(() => { if (initial.from === "link") { try { history.replaceState(history.state, "", window.location.pathname + window.location.search); } catch (_) {} } }, []);

  /* A centre's official timetable, as a place to start. The centre is in the
     address (?centre=) so the link a centre shares opens on its week. */
  const readCentre = () => { try { return new URL(window.location.href).searchParams.get("centre") || ""; } catch (_) { return ""; } };
  const [slug, setSlug] = React.useState(readCentre);
  const [centres, setCentres] = React.useState(null);
  const [official, setOfficial] = React.useState(null);
  const [centreErr, setCentreErr] = React.useState(null);
  const loadCentres = React.useCallback(() => { setCentreErr(null); return NGGApi.public.timetable("").then(d => setCentres(d.centres || [])).catch(e => setCentreErr(e)); }, []);
  React.useEffect(() => { loadCentres(); }, [loadCentres]);
  React.useEffect(() => {
    if (!slug) { setOfficial(null); return; }
    setOfficial(null);
    NGGApi.public.timetable(slug).then(setOfficial).catch(e => { setOfficial(null); if (e.code !== "not_found") setCentreErr(e); });
  }, [slug]);
  const chooseCentre = (v) => {
    try { const u = new URL(window.location.href); if (v) u.searchParams.set("centre", v); else u.searchParams.delete("centre"); history.pushState({ page: "timetable" }, "", u.pathname + u.search); } catch (_) {}
    setSlug(v);
  };
  React.useEffect(() => { const onPop = () => setSlug(readCentre()); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  const importOfficial = (replace) => {
    if (!official || !official.slots) return;
    const pal = {}; let next = 0;
    const add = official.slots.map(sl => {
      const key = sl.course; if (pal[key] === undefined) pal[key] = (next++) % 8;
      return { id: tmId(), title: sl.course + (sl.level ? " · " + sl.level : ""), days: [sl.weekday], start: sl.startTime, end: sl.endTime, place: sl.room || official.centre || "", note: sl.note || "", color: pal[key] };
    });
    setEntries(es => replace ? add : es.concat(add));
    /* Starting from a centre fits the poster to it: its days, and its hours
       rounded out to the hour — not the sample week's Monday-to-Friday. */
    if (replace && add.length) {
      const days = Array.from(new Set(add.flatMap(a => a.days))).sort();
      const from = Math.floor(Math.min(...add.map(a => tmMin(a.start))) / 60), to = Math.ceil(Math.max(...add.map(a => tmMin(a.end))) / 60);
      setSettings(s => ({ ...s, title: official.centre + " timetable", subtitle: (official.meetDays || "") + (official.meetTime ? ", " + official.meetTime : ""), days, from, to: Math.max(to, from + 1) }));
    }
    setSay((replace ? "Started from " : "Added ") + add.length + " class" + (add.length === 1 ? "" : "es") + " from " + official.centre + ".");
    setTab("classes");
  };

  const saveEntry = (e) => {
    setEntries(es => es.some(x => x.id === e.id) ? es.map(x => x.id === e.id ? e : x) : es.concat([e]));
    setSay((editing && editing.id ? "Saved " : "Added ") + e.title + ", " + e.days.map(d => TM_DAYS[d - 1][1]).join(", ") + " " + tmFmt(tmMin(e.start), settings.clock) + ".");
    setEditing(null);
    setTimeout(() => addBtnRef.current && addBtnRef.current.focus(), 0);
  };
  const removeEntry = (e) => { setEntries(es => es.filter(x => x.id !== e.id)); setSay("Removed " + e.title + "."); setTimeout(() => addBtnRef.current && addBtnRef.current.focus(), 0); };
  const duplicate = (e) => { const c = { ...e, id: tmId(), title: e.title }; setEntries(es => es.concat([c])); setEditing(c); };

  /* Export: the same poster, rendered at full size off screen, then drawn. */
  const render = async () => {
    setExporting(true);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
    const h2c = await loadVendor("html2canvas");
    const el = exportRef.current;
    if (!el) throw new Error("The timetable could not be drawn.");
    return h2c(el, { scale: 2, backgroundColor: null, useCORS: true, logging: false, width: size.w, height: size.h, windowWidth: size.w + 40 });
  };
  const run = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); }
    catch (e) { toast.error((e && e.message) || "That did not work — try again.", "Download failed"); }
    finally { setBusy(""); setExporting(false); }
  };
  const name = tmSlug(settings.title);
  const downloadPng = () => run("png", async () => {
    const c = await render();
    await new Promise((res, rej) => c.toBlob(b => { if (!b) return rej(new Error("The picture could not be made.")); tmSave(b, name + ".png"); res(); }, "image/png"));
    setSay("Downloaded " + name + ".png.");
  });
  const downloadPdf = () => run("pdf", async () => {
    const c = await render();
    const lib = await loadVendor("jspdf"); const JsPDF = lib.jsPDF;
    const p = TM_PAPER[settings.paper] || TM_PAPER.a4;
    const [W, H] = settings.orient === "portrait" ? [p.mm[1], p.mm[0]] : [p.mm[0], p.mm[1]];
    const doc = new JsPDF({ unit: "mm", format: settings.paper === "letter" ? "letter" : "a4", orientation: settings.orient });
    doc.setProperties({ title: settings.title || "Timetable", creator: "NGG Timetable maker" });
    doc.addImage(c.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, W, H);
    doc.save(name + ".pdf");
    setSay("Downloaded " + name + ".pdf — " + p.name + ", " + settings.orient + ".");
  });
  const downloadIcs = () => run("ics", async () => {
    if (!entries.length) throw new Error("Add a class first.");
    tmSave(new Blob([tmIcs(settings, entries)], { type: "text/calendar;charset=utf-8" }), name + ".ics");
    setSay("Downloaded " + name + ".ics — open it to add every class to your phone's calendar.");
  });
  const print = () => run("print", async () => {
    const c = await render();
    const p = TM_PAPER[settings.paper] || TM_PAPER.a4;
    const w = window.open("", "_blank");
    if (!w) throw new Error("Your browser blocked the print window. Download the PDF and print that instead.");
    w.document.write("<!doctype html><title>" + (settings.title || "Timetable").replace(/</g, "&lt;") + "</title><style>@page{size:" + (settings.paper === "letter" ? "letter" : "A4") + " " + settings.orient + ";margin:0}html,body{margin:0}img{display:block;width:100vw;height:100vh;object-fit:contain}</style><img alt='' src='" + c.toDataURL("image/png") + "' onload='setTimeout(function(){print()},150)'>");
    w.document.close();
    setSay("Opened the print view for " + p.name + ".");
  });
  const share = () => run("share", async () => {
    const url = window.location.origin + "/timetable#t=" + tmEncode({ settings, entries });
    try { await navigator.clipboard.writeText(url); setSay("Link copied. Anyone who opens it gets their own copy of this timetable to change."); toast.success("Link copied"); }
    catch (_) { window.prompt("Copy this link:", url); }
  });
  const reset = async (which) => {
    if (which === "blank" && entries.length && !(await dialog.confirm({ title: "Start a blank timetable?", body: "Your " + entries.length + " class" + (entries.length === 1 ? "" : "es") + " will be cleared from this browser. Copy the link first if you want to keep them.", cta: "Start blank", danger: true }))) return;
    if (which === "sample" && entries.length && !(await dialog.confirm({ title: "Replace with the sample week?", body: "Your classes will be replaced by an example school week.", cta: "Use the sample" }))) return;
    const st = which === "sample" ? tmSample() : { settings: { ...TM_DEFAULT_SETTINGS, template: settings.template }, entries: [] };
    setSettings(st.settings); setEntries(st.entries); setEditing(null);
    setSay(which === "sample" ? "Loaded the sample week." : "Started a blank timetable.");
  };

  const sorted = entries.slice().sort((a, b) => (Math.min(...a.days) - Math.min(...b.days)) || tmMin(a.start) - tmMin(b.start));
  return (
    <div className="page tm-page">
      <section className="tm-hero"><div className="container">
        <span className="chip chip-navy">TIMETABLE MAKER</span>
        <h1 className="tm-h1">Make your timetable. <em>Make it yours.</em></h1>
        <p className="tm-lede">Pick a design, add your classes, and download it as a picture, a print-ready PDF, or a calendar file for your phone. It is free, it needs no account, and it stays in your browser.</p>
      </div></section>

      <section className="tm-work"><div className="container tm-cols">
        <div className="tm-panel tm-noprint">
          <div className="tm-tabs" role="tablist" aria-label="Timetable maker">
            {[["classes", "Classes"], ["design", "Design"], ["layout", "Layout"], ["start", "Start from"]].map(([k, l]) => (
              <button key={k} id={"tm-tab-" + k} role="tab" aria-selected={tab === k} aria-controls={"tm-pane-" + k} className={"tm-tab" + (tab === k ? " is-on" : "")} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === "classes" && <div id="tm-pane-classes" role="tabpanel" aria-labelledby="tm-tab-classes" className="tm-pane">
            <div className="tm-field-row">
              <label className="tm-field"><span>Title</span><input value={settings.title} maxLength={60} onChange={e => setS("title", e.target.value)}/></label>
              <label className="tm-field"><span>Subtitle <em>· optional</em></span><input value={settings.subtitle} maxLength={80} placeholder="Your name, class or term" onChange={e => setS("subtitle", e.target.value)}/></label>
            </div>
            {editing ? <TmEntryForm key={editing.id || "new"} initial={editing.id ? editing : null} tpl={tpl} clock={settings.clock} onSave={saveEntry} onCancel={() => { setEditing(null); setTimeout(() => addBtnRef.current && addBtnRef.current.focus(), 0); }}/>
              : <button ref={addBtnRef} type="button" className="btn btn-primary tm-add" onClick={() => setEditing({})}>+ Add a class</button>}
            <h2 className="tm-h2" id="tm-list-h">Your classes <span className="tm-count">{entries.length}</span></h2>
            {!entries.length ? <p className="tm-empty">No classes yet. Add your first one, or start from your centre's timetable or the sample week.</p> :
              <ul className="tm-list" aria-labelledby="tm-list-h">
                {sorted.map(e => (
                  <li key={e.id} className="tm-item">
                    <span className="tm-item-dot" style={{ background: tpl.palette[e.color] }} aria-hidden="true"/>
                    <div className="tm-item-main">
                      <b>{e.title}</b>
                      <span className="tm-item-sub">{e.days.map(d => TM_DAYS[d - 1][2]).join(", ")} · {tmFmt(tmMin(e.start), settings.clock)}–{tmFmt(tmMin(e.end), settings.clock)}{e.place ? " · " + e.place : ""} · <span className="sr-only">colour </span>{TM_COLOUR_NAMES[e.color]}</span>
                      {overlaps[e.id] && <span className="tm-item-warn">Overlaps {Array.from(new Set(overlaps[e.id])).join(", ")} — they sit side by side.</span>}
                    </div>
                    <div className="tm-item-actions">
                      <button type="button" className="tm-iconbtn" onClick={() => setEditing(e)} aria-label={"Change " + e.title}>Edit</button>
                      <button type="button" className="tm-iconbtn" onClick={() => duplicate(e)} aria-label={"Copy " + e.title}>Copy</button>
                      <button type="button" className="tm-iconbtn" onClick={() => removeEntry(e)} aria-label={"Remove " + e.title}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>}
          </div>}

          {tab === "design" && <div id="tm-pane-design" role="tabpanel" aria-labelledby="tm-tab-design" className="tm-pane">
            <fieldset className="tm-fieldset"><legend>Template</legend>
              <div className="tm-templates" role="radiogroup" aria-label="Template">
                {TM_TEMPLATES.map(t => (
                  <label key={t.id} className={"tm-tpl" + (settings.template === t.id ? " is-on" : "")}>
                    <input type="radio" name="tm-template" className="sr-only" checked={settings.template === t.id} onChange={() => setS("template", t.id)}/>
                    <span className={"tm-tpl-thumb tm-tpl-thumb--" + t.id} style={{ "--a": t.v.bg, "--b": t.v.band, "--c": t.palette[0], "--d": t.palette[2], "--e": t.palette[3] }} aria-hidden="true"><i/><i/><i/><i/></span>
                    <span className="tm-tpl-name">{t.name}</span><span className="tm-tpl-blurb">{t.blurb}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="tm-field"><span>Footer note <em>· optional</em></span><input value={settings.note} maxLength={120} placeholder="e.g. Bring PE kit on Tuesdays" onChange={e => setS("note", e.target.value)}/></label>
            <label className="tm-check"><input type="checkbox" checked={settings.showPlace} onChange={e => setS("showPlace", e.target.checked)}/> Show where each class is</label>
          </div>}

          {tab === "layout" && <div id="tm-pane-layout" role="tabpanel" aria-labelledby="tm-tab-layout" className="tm-pane">
            <fieldset className="tm-fieldset"><legend>Days to show</legend>
              <div className="tm-days">{TM_DAYS.map(([d, nm, short]) => (
                <button key={d} type="button" className={"tm-day" + (settings.days.indexOf(d) !== -1 ? " is-on" : "")} aria-pressed={settings.days.indexOf(d) !== -1} aria-label={nm}
                  onClick={() => setS("days", settings.days.indexOf(d) !== -1 ? settings.days.filter(x => x !== d) : settings.days.concat([d]).sort())}>{short}</button>
              ))}</div>
              <p className="tm-hint">A day with a class on it is always shown.</p>
            </fieldset>
            <div className="tm-row2">
              <label className="tm-field"><span>From</span><select value={settings.from} onChange={e => setS("from", Math.min(+e.target.value, settings.to - 1))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{tmFmt(h * 60, settings.clock)}</option>)}</select></label>
              <label className="tm-field"><span>To</span><select value={settings.to} onChange={e => setS("to", Math.max(+e.target.value, settings.from + 1))}>
                {Array.from({ length: 24 }, (_, h) => h + 1).map(h => <option key={h} value={h}>{tmFmt(h * 60 % 1440, settings.clock) + (h === 24 ? " (midnight)" : "")}</option>)}</select></label>
            </div>
            <p className="tm-hint">The hours widen by themselves to fit an early or late class.</p>
            <fieldset className="tm-fieldset"><legend>Clock</legend><div className="tm-seg">
              {[["24", "24-hour"], ["12", "12-hour"]].map(([k, l]) => <button key={k} type="button" className={"tm-segbtn" + (settings.clock === k ? " is-on" : "")} aria-pressed={settings.clock === k} onClick={() => setS("clock", k)}>{l}</button>)}
            </div></fieldset>
            <div className="tm-row2">
              <fieldset className="tm-fieldset"><legend>Paper</legend><div className="tm-seg">
                {Object.entries(TM_PAPER).map(([k, p]) => <button key={k} type="button" className={"tm-segbtn" + (settings.paper === k ? " is-on" : "")} aria-pressed={settings.paper === k} onClick={() => setS("paper", k)}>{p.name}</button>)}
              </div></fieldset>
              <fieldset className="tm-fieldset"><legend>Orientation</legend><div className="tm-seg">
                {[["landscape", "Landscape"], ["portrait", "Portrait"]].map(([k, l]) => <button key={k} type="button" className={"tm-segbtn" + (settings.orient === k ? " is-on" : "")} aria-pressed={settings.orient === k} onClick={() => setS("orient", k)}>{l}</button>)}
              </div></fieldset>
            </div>
            <fieldset className="tm-fieldset"><legend>For the calendar file</legend>
              <div className="tm-row2">
                <label className="tm-field"><span>Starts on</span><input type="date" value={settings.startsOn} onChange={e => setS("startsOn", e.target.value)}/></label>
                <label className="tm-field"><span>Repeats until <em>· optional</em></span><input type="date" value={settings.until} min={settings.startsOn || undefined} onChange={e => setS("until", e.target.value)}/></label>
              </div>
              <p className="tm-hint">Each class repeats every week from the first matching day, in Lagos time. Leave “until” empty to repeat with no end date.</p>
            </fieldset>
          </div>}

          {tab === "start" && <div id="tm-pane-start" role="tabpanel" aria-labelledby="tm-tab-start" className="tm-pane">
            <h2 className="tm-h2">Your NGG centre's timetable</h2>
            <p className="tm-hint">Bring in the classes your centre runs, then add your own around them.</p>
            {centreErr ? <ErrorState title="Couldn't load the centres" message={centreErr.message} code={centreErr.code} onRetry={loadCentres}/>
              : !centres ? <div className="dash-spinner" role="status" aria-label="Loading the centres"/>
              : !centres.length ? <p className="tm-empty">No centre has published a timetable yet.</p>
              : <label className="tm-field tt-pick"><span>Centre</span>
                  <select value={slug} onChange={e => chooseCentre(e.target.value)}>
                    <option value="">Choose a centre…</option>
                    {centres.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select></label>}
            {slug && official && <div className="tm-official" aria-live="polite">
              <div className="tm-official-actions">
                <button type="button" className="btn btn-primary btn-sm" disabled={!official.slots || !official.slots.length} onClick={() => importOfficial(true)}>Start from these {official.slots ? official.slots.length : 0} classes</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!official.slots || !official.slots.length} onClick={() => importOfficial(false)}>Add them to mine</button>
              </div>
              <details className="tm-details" open><summary>{official.centre}'s official week</summary>
                {(official.meetDays || official.meetTime) && <p className="tt-sub">Meets {official.meetDays}{official.meetTime ? ", " + official.meetTime : ""}</p>}
                <TimetableView slots={official.slots} title={official.centre} emptyText="This centre has not published its timetable yet."/>
              </details>
            </div>}
            <h2 className="tm-h2">Or</h2>
            <div className="tm-official-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset("sample")}>Use the sample week</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => reset("blank")}>Start blank</button>
            </div>
          </div>}
        </div>

        <div className="tm-preview">
          <div className="tm-actions tm-noprint" role="group" aria-label="Download your timetable">
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={downloadPdf}>{busy === "pdf" ? "Making the PDF…" : "Download PDF"}</button>
            <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={downloadPng}>{busy === "png" ? "Drawing…" : "Picture (PNG)"}</button>
            <button type="button" className="btn btn-ghost" disabled={!!busy || !entries.length} onClick={downloadIcs} title={entries.length ? "" : "Add a class first"}>Add to calendar (.ics)</button>
            <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={print}>Print</button>
            <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={share}>Copy link</button>
          </div>
          <p className="tm-say" role="status" aria-live="polite">{say}</p>
          <TmStage settings={settings} entries={entries} size={size} posterRef={posterRef}/>
          <p className="tm-hint tm-noprint">{(TM_PAPER[settings.paper] || TM_PAPER.a4).name} · {settings.orient} · {tpl.name}. The PDF fills the page; the picture is {size.w * 2} × {size.h * 2} pixels.</p>
        </div>
      </div></section>

      {exporting && <div className="tm-export-host" aria-hidden="true"><TmPoster settings={settings} entries={entries} size={size} posterRef={exportRef} id="tm-export"/></div>}
    </div>
  );
}
