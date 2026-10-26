/* ============================================================================
   Timetable Maker v5 — the poster (§8).

   ttPosterModel(doc, opts) works out every box; <TimetablePoster model/> draws
   it. ONE renderer serves the preview, full screen, the download previews and
   the off-screen node every file is drawn from, so what is on screen is what
   is downloaded. The poster is always laid out at its fixed print size (1600px
   on the long side) and only ever scaled from outside with a transform.

   The poster's colours, sizes and positions are DATA — the visitor's theme,
   style and classes — so they reach the elements as values. Its structure is
   the .tt-pos-* rules in styles.css.
   ========================================================================== */

/* The poster styles' fonts (§8.9), loaded with the maker and never with the
   rest of the site. The app UI does not use them. */
/* Every family this poster can draw in is in /assets/fonts, loaded with the
   page. It used to fetch them from Google Fonts — and a poster is DRAWN to
   an image file, so a host that is slow or blocked does not degrade the
   page, it bakes the wrong typeface into something somebody prints and puts
   on a wall. Nothing left to fetch; ttFontsReady still waits for the decode.
   It is also the last third-party host in the app (docs/ZERO-RATING.md). */
function ttEnsureFonts() {}

/** Every family the chosen style uses, loaded before a file is drawn from it. */
async function ttFontsReady(look) {
  ttEnsureFonts();
  const lk = TT_LOOKS[look] || TT_LOOKS.classic;
  try {
    await Promise.all(lk.families.concat(["Sora", "JetBrains Mono"]).flatMap(f => ["400 20px", "700 20px"].map(w => document.fonts.load(w + " '" + f + "'"))));
    await document.fonts.ready;
  } catch (_) { /* a face that will not load still draws, in its fallback */ }
}

/**
 * Every box on the poster.
 * opts: { kind: 'poster'|'share'|'phone', orient, paper: 'a4'|'letter',
 *         today (highlight today; preview only), live (now line, breaks kept),
 *         wall: 'week'|'next', now }
 */
function ttPosterModel(doc, opts) {
  const s = doc.s, th = TT_THEMES[s.theme] || TT_THEMES.paper;
  const entries = s.hideBreaks && !opts.live ? doc.entries.filter(e => ttKindOf(e) !== "break") : doc.entries;
  const fr = ttFrame(entries, s.weekStart), n = fr.days.length;
  const kind = opts.kind || "poster";
  const orient = kind === "poster" ? ttOrientFor(opts.orient || s.orient, entries, s.weekStart) : "portrait";
  const ratio = opts.paper === "letter" ? 279.4 / 215.9 : 297 / 210;
  const [W, H] = kind === "phone" ? [1080, 2340] : kind === "share" ? [1080, 1350] : orient === "portrait" ? [Math.round(1600 / ratio), 1600] : [1600, Math.round(1600 / ratio)];
  const portrait = kind === "poster" && orient === "portrait", tl = s.layout === "timeline";
  const layout = kind === "phone" ? "wallpaper" : kind === "share" ? "cards" : portrait ? (tl ? "rows" : "cards") : (tl ? "grid" : "agenda");
  const now = opts.now ? new Date(opts.now) : new Date();
  const today = now.getDay() || 7, nowMins = now.getHours() * 60 + now.getMinutes();
  const L = s.large ? 1.2 : 1;
  const lkKey = TT_LOOKS[s.look] ? s.look : "classic", LK = TT_LOOKS[lkKey];
  const dark = s.theme === "navy" || s.theme === "chalk";
  const fmt = m => ttFmt(m, s.clock);

  const fm = ttFoldMap(entries, fr, s.fold !== false && kind === "poster" && tl);
  const pct = q => fm.pos(q) / fm.span * 100;
  const pLen = (a, b) => (fm.pos(b) - fm.pos(a)) / fm.span * 100;
  const colour = e => { const bg = th.pal[e.color] || th.pal[0]; return { bg, edge: ttShade(bg, -0.4) }; };

  /* A block's fill and edges by style (§8.9). Block ink is always the dark ink,
     Paper's, because every theme's block fills are pale, the dark themes' too. */
  const edges = (c, side) => {
    const none = "0 solid transparent", ink = TT_THEMES.paper.ink;
    if (lkKey === "bold") { const x = "3px solid " + th.ink; return { bg: c.bg, ink, bt: x, br: x, bb: x, bl: x }; }
    if (lkKey === "minimal") { const x = "2px solid " + (dark ? c.bg : c.edge); return { bg: "transparent", ink: th.ink, bt: x, br: x, bb: x, bl: x }; }
    if (lkKey === "notebook") return { bg: c.bg, ink, bt: none, br: none, bb: "3px solid " + c.edge, bl: none };
    if (lkKey === "editorial") return { bg: c.bg, ink, bt: "3px solid " + th.ink, br: none, bb: none, bl: none };
    return side === "top" ? { bg: c.bg, ink, bt: "5px solid " + c.edge, br: none, bb: none, bl: none }
                          : { bg: c.bg, ink, bt: none, br: none, bb: none, bl: "6px solid " + c.edge };
  };

  const legendOn = (layout === "grid" || layout === "rows") && s.legend;
  const colW = (W - 128 - 76) / Math.max(1, n), pxMinV = (H * (legendOn ? 0.6 : 0.68)) / fm.span;
  const trackW = W - 84 - 108, rowH = (H - 90 - 170 - (legendOn ? 100 : 0) - 50 - 36) / Math.max(1, n) - 10, pxMinH = trackW / fm.span;
  const hours = fm.hours.map(q => ({ t: fmt(q), at: pct(q) }));
  const folds = fm.runs.filter(x => x.folded).map(x => ({ at: pct(x.a), size: x.w / fm.span * 100, mid: (fm.pos(x.a) + x.w / 2) / fm.span * 100, label: ttDur(x.b - x.a) + " free" }));

  const days = fr.days.map(([d, name, short]) => {
    const isToday = !!opts.today && d === today;
    const items = entries.filter(e => e.days.includes(d)).map(e => ({ src: e, s: ttMin(e.start), e: ttMin(e.end) })).sort((a, b) => a.s - b.s);
    const laid = ttLanes(items.map(x => Object.assign({}, x)));
    const ring = e => e.mine ? "0 0 0 3px " + th.accent : "none";
    const blocks = layout !== "grid" ? [] : laid.map(x => {
      const c = colour(x.src), hpx = (x.e - x.s) * pxMinV, wpx = colW / x.n, tiny = hpx < 34, short = hpx < 62 || wpx < 110;
      return Object.assign(edges(c, "left"), {
        key: x.src.id + d, top: pct(x.s), height: pLen(x.s, x.e), lane: x.lane, n: x.n, ring: ring(x.src), edge: c.edge,
        title: x.src.title, time: fmt(x.s) + "–" + fmt(x.e), place: x.src.place,
        showTime: !tiny, showPlace: s.showPlace && !!x.src.place && !short, showMine: !!x.src.mine && hpx > 96 && wpx > 150,
        shape: tiny ? "tiny" : short ? "short" : "full", tSize: Math.round((tiny ? 13 : short ? 15 : (x.n > 1 ? 15 : 17)) * L), mSize: Math.round(13 * L),
      });
    });
    const hblocks = layout !== "rows" ? [] : laid.map(x => {
      const c = colour(x.src), wpx = (x.e - x.s) * pxMinH, hpx = rowH / x.n;
      return Object.assign(edges(c, "top"), {
        key: x.src.id + d, left: pct(x.s), width: pLen(x.s, x.e), lane: x.lane, n: x.n, ring: ring(x.src),
        title: x.src.title, time: fmt(x.s) + "–" + fmt(x.e), place: x.src.place,
        showTime: wpx >= 96 && hpx >= 58, showPlace: s.showPlace && !!x.src.place && wpx >= 120 && hpx >= 84,
        nowrap: wpx < 110, small: hpx < 44 || wpx < 80, tSize: Math.round((wpx < 90 || hpx < 44 ? 13 : 15) * L), mSize: Math.round(12.5 * L),
      });
    });
    const list = items.map(x => {
      const c = colour(x.src);
      return Object.assign(edges(c, "left"), { key: x.src.id + d, ring: ring(x.src), edge: c.edge, swatch: c.bg, time: fmt(x.s) + "–" + fmt(x.e), start: fmt(x.s), endT: fmt(x.e),
        title: x.src.title, place: x.src.place, showPlace: s.showPlace && !!x.src.place });
    });
    let headBg = isToday ? th.hiBg : th.dayBg, headInk = isToday ? th.hiInk : th.ink, headBd = "0 solid transparent";
    if (lkKey === "bold") { headBg = isToday ? th.accent : th.ink; headInk = isToday ? th.hiInk : th.bg; }
    else if (lkKey !== "classic") { headBg = "transparent"; headInk = isToday ? th.accent : th.ink; headBd = (lkKey === "editorial" ? "1px" : "2px") + " solid " + (isToday ? th.accent : th.ink); }
    const tinted = lkKey === "classic" || lkKey === "bold";
    const cardBd = lkKey === "bold" ? "3px solid " + (isToday ? th.accent : th.ink) : lkKey === "minimal" ? "1px solid " + (isToday ? th.accent : th.line)
      : lkKey === "notebook" ? "2px dashed " + (isToday ? th.accent : th.line) : lkKey === "editorial" ? "1px solid " + (isToday ? th.accent : th.ink) : "2px solid " + (isToday ? th.accent : th.line);
    return {
      d, name, short, label: n > 5 ? short : name, isToday, count: items.length + (items.length === 1 ? " class" : " classes"),
      headBg, headInk, headBd, colBg: isToday && tinted ? th.dayBg : "transparent", cardBd, labelC: isToday ? th.accent : th.ink,
      blocks, hblocks, items: list, none: !items.length,
      hasNow: !!opts.live && isToday && nowMins > fr.from && nowMins < fr.to, nowAt: pct(nowMins),
    };
  });

  /* The key: one line per title, with its days and (when shown) its room. */
  const seen = {}, legend = [];
  entries.slice().sort((a, b) => ttMin(a.start) - ttMin(b.start)).forEach(e => {
    if (seen[e.title]) return;
    seen[e.title] = 1;
    const ds = [...new Set(entries.filter(x => x.title === e.title).flatMap(x => x.days))].sort((a, b) => a - b);
    const c = colour(e);
    legend.push({ title: e.title, bg: c.bg, edge: c.edge, meta: ds.map(x => TT_DAYS[x - 1][2]).join(" ") + (e.place && s.showPlace ? " · " + e.place : "") });
  });

  /* The wallpaper's days: the week, or today and the next day with classes (§8.7). */
  let wallDays = days.filter(x => !x.none), kicker = kind === "share" ? "My week" : "Weekly timetable";
  if (kind === "phone") {
    kicker = "This week";
    if (opts.wall === "next") {
      const pick = [];
      for (let k = 0; k < 7 && pick.length < 2; k++) {
        const dd = ((today - 1 + k) % 7) + 1, f = days.find(x => x.d === dd && !x.none);
        if (f) pick.push(Object.assign({}, f, { short: k === 0 ? "Today" : k === 1 ? "Tmrw" : f.short, labelC: k === 0 ? th.accent : th.ink2 }));
      }
      wallDays = pick;
      kicker = "Coming up";
    } else wallDays = wallDays.map(x => Object.assign({}, x, { labelC: th.ink2 }));
  }
  const wallRows = wallDays.reduce((k, x) => k + x.items.length, 0);
  const pf = opts.wall === "next" ? 1.15 : wallRows > 26 ? 0.62 : wallRows > 20 ? 0.74 : wallRows > 14 ? 0.86 : 1;
  const maxItems = Math.max(1, ...days.map(x => x.items.length));
  const cs = kind === "share" ? (maxItems > 5 ? 0.86 : 1.05) : (maxItems > 6 ? 0.85 : 1);
  const total = entries.reduce((k, e) => k + e.days.length, 0);
  const ruled = "linear-gradient(to right, transparent 0, transparent 30px, rgba(214,69,69,.45) 30px, rgba(214,69,69,.45) 32px, transparent 32px), "
    + "repeating-linear-gradient(to bottom, transparent 0, transparent 35px, " + th.line + " 35px, " + th.line + " 36px), " + th.bg;

  return {
    kind, layout, w: W, h: H, orient, n, th, look: LK, lookKey: lkKey,
    ground: lkKey === "notebook" ? ruled : th.bg,
    rule: lkKey === "bold" ? "6px solid " + th.ink : lkKey === "editorial" ? "4px double " + th.ink : lkKey === "minimal" ? "1px solid " + th.line : "2px solid " + th.line,
    lineStyle: LK.dash ? "dashed" : "solid", barR: lkKey === "bold" || lkKey === "editorial" ? 0 : 6,
    stripes: th.stripes ? [].concat(th.stripes, th.stripes, th.stripes, th.stripes) : null,
    pad: kind === "phone" ? "0 90px 120px" : kind === "share" ? "64px 56px 40px" : portrait ? "60px 42px 34px" : "52px 64px 36px",
    gap: kind === "phone" ? 0 : 22,
    kicker, title: s.title || "My week", subtitle: s.subtitle,
    titleSize: ((kind === "share" ? 60 : portrait ? 58 : 64) - Math.max(0, (s.title || "").length - 22)) * LK.ts,
    range: n + " day" + (n === 1 ? "" : "s") + " · " + fmt(fr.from) + "–" + fmt(fr.to),
    countText: total + " class" + (total === 1 ? "" : "es") + " a week",
    days, cardDays: days.filter(x => !x.none), wallDays, hours, folds, legend,
    showLegend: legendOn && legend.length > 0 && legend.length <= 16,
    dayFont: Math.round((n > 5 && !portrait ? 17 : 20) * L) * LK.ts, hourFont: Math.round(14 * L),
    aTitle: Math.round(17 * L) * LK.ts, aMeta: Math.round(13 * L),
    cGap: kind === "share" ? 18 : 16, cPad: kind === "share" ? "20px 22px" : "18px 20px",
    cDay: Math.round((kind === "share" ? 30 : 24) * cs * L) * LK.ts, cTitle: Math.round((kind === "share" ? 22 : 18) * cs * L) * LK.ts,
    cMeta: Math.round((kind === "share" ? 18 : 15) * cs * L), cSmall: Math.round((kind === "share" ? 16 : 13.5) * cs * L),
    cTimeW: Math.round((s.clock === "12" ? 84 : 66) * (kind === "share" ? 1.2 : 1) * cs), cDotTop: Math.round(8 * cs),
    pGap: Math.round(34 * pf), pRowGap: Math.round(16 * pf), pMeta: Math.round(30 * pf), pTitle: Math.round(40 * pf) * LK.ts, pTimeW: Math.round((s.clock === "12" ? 150 : 120) * pf),
    note: s.note, footFont: kind === "phone" ? 24 : kind === "share" ? 18 : 15,
    isEmpty: !entries.length,
  };
}

function TtPosterDayHead({ m, d, className }) {
  const lk = m.look;
  return (
    <div className={className} style={{ borderRadius: lk.headR, background: d.headBg, color: d.headInk, borderBottom: d.headBd,
      fontFamily: lk.disp, fontSize: m.dayFont, fontWeight: m.lookKey === "classic" ? 700 : lk.tw, textTransform: lk.tt, fontStyle: lk.italicHead ? "italic" : "normal" }}>
      {d.label}{d.isToday && <span className="tt-pos-today">TODAY</span>}
    </div>
  );
}

/** The poster at its full print size. Scale it from outside with a transform; never resize it. */
function TimetablePoster({ model: m, nodeRef }) {
  const th = m.th, lk = m.look;
  const blockW = lk.tw === 800 ? 700 : lk.tw;
  const blockStyle = b => ({ background: b.bg, color: b.ink, borderTop: b.bt, borderRight: b.br, borderBottom: b.bb, borderLeft: b.bl, boxShadow: b.ring, borderRadius: lk.r });
  const titleStyle = (size, extra) => Object.assign({ fontFamily: lk.disp, fontWeight: lk.tw, fontSize: size, textTransform: lk.tt, letterSpacing: lk.tls }, extra || {});
  return (
    <div ref={nodeRef} className={"tt-pos tt-pos--" + m.layout} aria-hidden="true"
      style={{ width: m.w, height: m.h, background: m.ground, color: th.ink, fontFamily: lk.body, padding: m.pad, gap: m.gap }}>
      {m.stripes && <div className="tt-pos-kente">{m.stripes.map((c, i) => <span key={i} style={{ background: c }}/>)}</div>}

      {m.kind !== "phone" && (
        <header className="tt-pos-head" style={{ borderBottom: m.rule }}>
          <div className="tt-pos-head-l">
            <span className="tt-pos-kicker" style={{ color: th.accent }}>{m.kicker}</span>
            <span className="tt-pos-title" style={titleStyle(m.titleSize)}>{m.title}</span>
            {m.subtitle && <span className="tt-pos-sub" style={{ color: th.ink2 }}>{m.subtitle}</span>}
          </div>
          <div className="tt-pos-head-r" style={{ color: th.ink2 }}><span>{m.range}</span><span>{m.countText}</span></div>
        </header>
      )}

      {m.layout === "grid" && (
        <div className="tt-pos-grid" style={{ gridTemplateColumns: "76px repeat(" + m.n + ", minmax(0, 1fr))" }}>
          <span/>
          {m.days.map(d => <TtPosterDayHead key={"h" + d.d} m={m} d={d} className="tt-pos-dayhead"/>)}
          <div className="tt-pos-hours">
            {m.hours.map(h => <span key={"t" + h.at} className="tt-pos-hour" style={{ top: h.at + "%", fontSize: m.hourFont, color: th.ink2 }}>{h.t}</span>)}
            {m.folds.map(f => <span key={"f" + f.at} className="tt-pos-foldlabel" style={{ top: f.mid + "%", color: th.ink2 }}>{f.label}</span>)}
          </div>
          {m.days.map(d => (
            <div key={"c" + d.d} className="tt-pos-col" style={{ background: d.colBg }}>
              {m.folds.map(f => <div key={"f" + f.at} className="tt-pos-fold" style={{ top: f.at + "%", height: f.size + "%", background: th.dayBg, border: "1px dashed " + th.line }}/>)}
              {m.hours.map(h => <div key={"l" + h.at} className="tt-pos-hline" style={{ top: h.at + "%", borderTop: "1px " + m.lineStyle + " " + th.line }}/>)}
              {d.blocks.map(b => (
                <div key={b.key} className={"tt-pos-block is-" + b.shape}
                  style={Object.assign(blockStyle(b), { top: b.top + "%", height: "calc(" + b.height + "% - 3px)", left: "calc(" + (b.lane / b.n * 100) + "% + 3px)", width: "calc(" + (100 / b.n) + "% - 6px)" })}>
                  <span className="tt-pos-btitle" style={{ fontFamily: lk.disp, fontWeight: blockW, fontSize: b.tSize * lk.ts }}>{b.title}</span>
                  {b.showTime && <span className="tt-pos-btime" style={{ fontSize: b.mSize }}>{b.time}</span>}
                  {b.showPlace && <span className="tt-pos-bplace" style={{ fontSize: b.mSize }}>{b.place}</span>}
                  {b.showMine && <span className="tt-pos-mine" style={{ background: b.edge }}>YOUR COURSE</span>}
                </div>
              ))}
              {d.hasNow && <div className="tt-pos-now-h" style={{ top: d.nowAt + "%" }}><span/></div>}
            </div>
          ))}
        </div>
      )}

      {m.layout === "agenda" && (
        <div className="tt-pos-agenda" style={{ gridTemplateColumns: "repeat(" + m.n + ", minmax(0, 1fr))" }}>
          {m.days.map(d => (
            <div key={d.d} className="tt-pos-acol">
              <TtPosterDayHead m={m} d={d} className="tt-pos-dayhead tt-pos-ahead"/>
              {d.items.map(it => (
                <div key={it.key} className="tt-pos-acard" style={blockStyle(it)}>
                  <span className="tt-pos-btime" style={{ fontSize: m.aMeta }}>{it.time}</span>
                  <span className="tt-pos-atitle" style={{ fontFamily: lk.disp, fontWeight: blockW, fontSize: m.aTitle }}>{it.title}</span>
                  {it.showPlace && <span className="tt-pos-bplace" style={{ fontSize: m.aMeta }}>{it.place}</span>}
                </div>
              ))}
              {d.none && <span className="tt-pos-none" style={{ color: th.ink2 }}>No classes</span>}
            </div>
          ))}
        </div>
      )}

      {m.layout === "rows" && (
        <div className="tt-pos-rows">
          <span/>
          <div className="tt-pos-hrow">
            {m.hours.map(h => <span key={"t" + h.at} className="tt-pos-vhour" style={{ left: h.at + "%", fontSize: m.hourFont, color: th.ink2 }}>{h.t}</span>)}
            {m.folds.map(f => <span key={"f" + f.at} className="tt-pos-vfoldlabel" style={{ left: f.mid + "%", color: th.ink2 }}>{f.label}</span>)}
          </div>
          {m.days.map(d => (
            <React.Fragment key={d.d}>
              <div className="tt-pos-rowhead" style={{ borderRadius: lk.headR, background: d.headBg, color: d.headInk, borderBottom: d.headBd }}>
                <b style={{ fontFamily: lk.disp, fontSize: m.dayFont, fontWeight: m.lookKey === "classic" ? 700 : lk.tw, textTransform: lk.tt, fontStyle: lk.italicHead ? "italic" : "normal" }}>{d.short}</b>
                <span className="tt-pos-rowcount">{d.count}</span>
              </div>
              <div className="tt-pos-track" style={{ background: d.colBg }}>
                {m.folds.map(f => <div key={"f" + f.at} className="tt-pos-vfold" style={{ left: f.at + "%", width: f.size + "%", background: th.dayBg, border: "1px dashed " + th.line }}/>)}
                {m.hours.map(h => <div key={"l" + h.at} className="tt-pos-vline" style={{ left: h.at + "%", borderLeft: "1px " + m.lineStyle + " " + th.line }}/>)}
                {d.hblocks.map(b => (
                  <div key={b.key} className={"tt-pos-hblock" + (b.small ? " is-small" : "")}
                    style={Object.assign(blockStyle(b), { left: "calc(" + b.left + "% + 2px)", width: "calc(" + b.width + "% - 4px)", top: "calc(" + (b.lane / b.n * 100) + "% + 3px)", height: "calc(" + (100 / b.n) + "% - 6px)" })}>
                    <span className={"tt-pos-btitle" + (b.nowrap ? " is-nowrap" : "")} style={{ fontFamily: lk.disp, fontWeight: blockW, fontSize: b.tSize * lk.ts }}>{b.title}</span>
                    {b.showTime && <span className="tt-pos-btime" style={{ fontSize: b.mSize }}>{b.time}</span>}
                    {b.showPlace && <span className="tt-pos-bplace is-nowrap" style={{ fontSize: b.mSize }}>{b.place}</span>}
                  </div>
                ))}
                {d.hasNow && <div className="tt-pos-now-v" style={{ left: d.nowAt + "%" }}><span/></div>}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {m.layout === "cards" && (
        <div className="tt-pos-cards" style={{ gap: m.cGap }}>
          {m.cardDays.map(d => (
            <div key={d.d} className="tt-pos-card" style={{ padding: m.cPad, borderRadius: lk.cardR, border: d.cardBd, background: d.colBg }}>
              <div className="tt-pos-cardhead">
                <b style={titleStyle(m.cDay, { fontStyle: lk.italicHead ? "italic" : "normal", color: d.labelC })}>{d.name}</b>
                <span className="tt-pos-mono" style={{ fontSize: m.cSmall, color: th.ink2 }}>{d.count}</span>
              </div>
              {d.items.map(it => (
                <div key={it.key} className="tt-pos-citem" style={{ gridTemplateColumns: m.cTimeW + "px 10px minmax(0, 1fr)" }}>
                  <span className="tt-pos-mono tt-pos-ctime" style={{ fontSize: m.cMeta }}>{it.start}</span>
                  <span className="tt-pos-cdot" style={{ marginTop: m.cDotTop, background: it.swatch, boxShadow: "inset 0 0 0 1px " + it.edge }}/>
                  <span className="tt-pos-cbody">
                    <b style={{ fontFamily: lk.disp, fontSize: m.cTitle, fontWeight: blockW }}>{it.title}</b>
                    {it.showPlace && <span style={{ fontSize: m.cSmall, color: th.ink2 }}>{it.place} · until {it.endT}</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {m.layout === "wallpaper" && <>
        <div className="tt-pos-walltop"/>
        <div className="tt-pos-wallhead" style={{ borderBottom: m.rule }}>
          <span className="tt-pos-wallkicker" style={{ color: th.accent }}>{m.kicker}</span>
          <span className="tt-pos-title" style={titleStyle(96 * lk.ts, { letterSpacing: "-0.04em" })}>{m.title}</span>
        </div>
        <div className="tt-pos-walldays" style={{ gap: m.pGap }}>
          {m.wallDays.map(d => (
            <div key={d.d} className="tt-pos-wallday">
              <span className="tt-pos-wallday-l" style={{ fontSize: m.pMeta, color: d.labelC }}>{d.short}</span>
              <div className="tt-pos-wallitems" style={{ gap: m.pRowGap }}>
                {d.items.map(it => (
                  <div key={it.key} className="tt-pos-wallitem">
                    <span className="tt-pos-wallbar" style={{ borderRadius: m.barR, background: it.swatch }}/>
                    <span className="tt-pos-mono tt-pos-walltime" style={{ fontSize: m.pMeta, color: th.ink2, width: m.pTimeW }}>{it.start}</span>
                    <span className="tt-pos-walltitle" style={{ fontFamily: lk.disp, fontWeight: blockW, fontSize: m.pTitle }}>{it.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>}

      {m.isEmpty && (
        <div className="tt-pos-empty"><span style={{ background: th.bg, border: "2px dashed " + th.line, color: th.ink2 }}>Your classes will appear here</span></div>
      )}

      {m.showLegend && (
        <div className="tt-pos-key" style={{ borderTop: "2px solid " + th.line }}>
          {m.legend.map(l => (
            <span key={l.title} className="tt-pos-keyitem">
              <span className="tt-pos-keysw" style={{ background: l.bg, boxShadow: "inset 0 0 0 1px " + l.edge }}/>
              <b>{l.title}</b><span style={{ color: th.ink2 }}>{l.meta}</span>
            </span>
          ))}
        </div>
      )}

      <footer className="tt-pos-foot" style={{ fontSize: m.footFont, color: th.ink2 }}>
        <span className="tt-pos-note">{m.note}</span>
        <span className="tt-pos-site">nextgengenius.ng/timetable</span>
      </footer>
    </div>
  );
}

/** The poster scaled into a box at its true aspect. It measures nothing; the caller passes the space it has. */
function TtPosterStage({ model, width, maxHeight, className, onOpen, label }) {
  const sc = Math.max(0.05, Math.min(1, width / model.w, (maxHeight || Infinity) / model.h));
  const box = { width: Math.floor(model.w * sc), height: Math.floor(model.h * sc) };
  const inner = <div className="tt-stage-scale" style={{ transform: "scale(" + sc + ")" }}><TimetablePoster model={model}/></div>;
  return onOpen
    ? <button type="button" className={"tt-stage " + (className || "")} style={box} onClick={onOpen} aria-label={label}>{inner}</button>
    : <div className={"tt-stage " + (className || "")} style={box} role="img" aria-label={label}>{inner}</div>;
}
