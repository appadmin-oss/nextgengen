/* ============================================================================
   Physics Lab — diagrams and explorers (owner, 6 Nov 2026: "We need real pro
   diagrams for physics, examples and visualizations interactive"; "make
   physics a breeze for everyone").

   Two things live here, and the Lab app (mlb-app.jsx) uses both:

   · PhyDiagram — the figure that goes with a QUESTION, drawn from the
     question's own numbers (the server sends `diagram: {type: "phy-…", …}`;
     MlbDiagram hands every `phy-` type here). Circuits, free-body diagrams,
     levers, v–t graphs, waves, mirrors, refraction, lenses, springs,
     pendulums, projectiles, decay and heating curves. One drawing per
     figure, never a picture of a picture: what is labelled is what is asked.

   · PHY_EXPLORERS — one small simulation per big idea, on the topic's
     "Explore it" step: move a slider, see the physics happen, read the
     numbers change. Every control is a real <input type="range"> or button
     (keyboard and touch; nothing needs a drag), every result is announced
     (role="status"), and motion stops for anyone who asked their device for
     reduced motion — the figure is still drawn, and "Play" steps it.

   Loaded BEFORE mlb-app.jsx (build.js ORDER): MLB_EXPLORE spreads
   PHY_EXPLORE in at module scope.
   ========================================================================== */

/* ── A clock for the animations: seconds since it started, paused when reduced motion is asked for ── */
function phyReduced() { try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } }
function usePhyClock(running, resetKey) {
  const [t, setT] = React.useState(0);
  React.useEffect(() => { setT(0); }, [resetKey]); // eslint-disable-line
  React.useEffect(() => {
    if (!running) return;
    let raf = 0, last = null;
    const tick = now => { if (last != null) setT(v => v + Math.min(0.05, (now - last) / 1000)); last = now; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return [t, setT];
}
/** Play / pause, with reduced motion respected: then it starts paused and says why. */
function usePhyPlay() {
  const reduced = React.useMemo(phyReduced, []);
  const [on, setOn] = React.useState(!reduced);
  return [on, setOn, reduced];
}
function PhyPlay({ on, setOn, reduced, label }) {
  return <button type="button" className="stt-btn phy-play" aria-pressed={on} onClick={() => setOn(v => !v)}>
    <i className={"ph-fill " + (on ? "ph-pause" : "ph-play")} aria-hidden="true"/>{on ? "Pause" : (label || "Play")}{reduced && !on ? <small> (motion is off on this device)</small> : null}</button>;
}
const phyR = (v, k) => { const p = Math.pow(10, k == null ? 2 : k); return String(Math.round(v * p) / p); };

/* ── Drawing pieces ── */
function PhyArrow({ x1, y1, x2, y2, cls, w }) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 9, s = 5;
  if (Math.hypot(x2 - x1, y2 - y1) < 2) return null;
  return <g className={"phy-arr " + (cls || "")}>
    <line x1={x1} y1={y1} x2={x2 - Math.cos(a) * h * 0.8} y2={y2 - Math.sin(a) * h * 0.8} strokeWidth={w || 3}/>
    <path d={"M" + x2 + " " + y2 + " L" + (x2 - h * Math.cos(a) + s * Math.sin(a)) + " " + (y2 - h * Math.sin(a) - s * Math.cos(a)) + " L" + (x2 - h * Math.cos(a) - s * Math.sin(a)) + " " + (y2 - h * Math.sin(a) + s * Math.cos(a)) + " Z"}/>
  </g>;
}
/** A resistor (IEC box) between two points on a horizontal or vertical wire, with its label. */
function PhyResistor({ x, y, vertical, label, w }) {
  const L = w || 44, T = 16;
  return <g>
    <rect x={vertical ? x - T / 2 : x - L / 2} y={vertical ? y - L / 2 : y - T / 2} width={vertical ? T : L} height={vertical ? L : T} className="phy-res"/>
    {label ? <text x={vertical ? x + 16 : x} y={vertical ? y + 4 : y - 14} textAnchor={vertical ? "start" : "middle"} className="phy-lbl">{label}</text> : null}
  </g>;
}
function PhyCell({ x, y, label }) {
  return <g><line x1={x - 5} y1={y - 16} x2={x - 5} y2={y + 16} className="phy-wire is-thick"/><line x1={x + 5} y1={y - 9} x2={x + 5} y2={y + 9} className="phy-wire is-thick"/>
    <rect x={x - 4} y={y - 18} width="8" height="36" className="phy-gap"/>
    <line x1={x - 5} y1={y - 16} x2={x - 5} y2={y + 16} className="phy-wire is-thick"/><line x1={x + 5} y1={y - 9} x2={x + 5} y2={y + 9} className="phy-wire is-thick"/>
    {label ? <text x={x} y={y - 24} textAnchor="middle" className="phy-lbl">{label}</text> : null}
    <text x={x - 14} y={y - 10} textAnchor="middle" className="phy-sm">+</text></g>;
}
function PhyMeter({ x, y, k }) { return <g><circle cx={x} cy={y} r="13" className="phy-meter"/><text x={x} y={y + 5} textAnchor="middle" className="phy-lbl is-b">{k}</text></g>; }

/* ── The figures that go with questions ──
   Owner, 6 Nov 2026: "Make sure diagrams are the standard and they understand how it works." So every
   figure is drawn in the conventions school Physics uses (a cell's long line is +, meters are lettered
   circles, a voltmeter goes ACROSS what it measures, rays carry arrows, the normal is dashed, a mirror is
   hatched on its back, a lens marks F and 2F, a graph's axes read "quantity / unit"), and every figure
   carries "How to read this diagram": its symbols drawn as a key, then one or two sentences on what it
   shows. A learner who has never seen a circuit diagram is not left to guess what the boxes are. */
function PhyDiagram({ d }) {
  const fig = PhyFigure({ d });
  if (!fig) return null;
  const read = PHY_READ[d.type];
  return <div className="phy-fig">{fig}
    {read ? <details className="phy-read"><summary><i className="ph ph-info" aria-hidden="true"/> How to read this diagram</summary>
      {read.keys && read.keys.length ? <ul className="phy-key">{read.keys.map(([k, txt]) => <li key={k}><svg viewBox="0 0 44 28" className="phy-key-i" aria-hidden="true">{PHY_SYM[k]}</svg><span>{txt}</span></li>)}</ul> : null}
      <p>{read.how}</p></details> : null}</div>;
}
/* The standard symbols, drawn small for the keys. */
const PHY_SYM = {
  cell: <g><line x1="8" y1="14" x2="18" y2="14" className="phy-wire"/><line x1="18" y1="4" x2="18" y2="24" className="phy-wire is-thick"/><line x1="25" y1="9" x2="25" y2="19" className="phy-wire is-thick"/><line x1="25" y1="14" x2="36" y2="14" className="phy-wire"/><text x="14" y="9" className="phy-sm">+</text></g>,
  res: <g><line x1="2" y1="14" x2="10" y2="14" className="phy-wire"/><rect x="10" y="8" width="24" height="12" className="phy-res"/><line x1="34" y1="14" x2="42" y2="14" className="phy-wire"/></g>,
  amm: <g><line x1="2" y1="14" x2="10" y2="14" className="phy-wire"/><circle cx="22" cy="14" r="11" className="phy-meter"/><text x="22" y="18.5" textAnchor="middle" className="phy-lbl is-b">A</text><line x1="33" y1="14" x2="42" y2="14" className="phy-wire"/></g>,
  volt: <g><line x1="2" y1="14" x2="10" y2="14" className="phy-wire"/><circle cx="22" cy="14" r="11" className="phy-meter"/><text x="22" y="18.5" textAnchor="middle" className="phy-lbl is-b">V</text><line x1="33" y1="14" x2="42" y2="14" className="phy-wire"/></g>,
  wire: <line x1="2" y1="14" x2="42" y2="14" className="phy-wire"/>,
  force: <PhyArrow x1={4} y1={14} x2={40} y2={14} cls="is-0"/>,
  ray: <g><line x1="2" y1="14" x2="42" y2="14" className="phy-ray"/><PhyArrow x1={10} y1={14} x2={28} y2={14} cls="is-ray"/></g>,
  normal: <line x1="22" y1="2" x2="22" y2="26" className="phy-normal"/>,
  mirror: <g><line x1="4" y1="10" x2="40" y2="10" className="phy-mirror"/>{[0, 1, 2, 3, 4].map(k => <line key={k} x1={8 + k * 8} y1="10" x2={3 + k * 8} y2="18" className="phy-hatch"/>)}</g>,
  lens: <g><path d="M22 2 Q28 14 22 26 Q16 14 22 2" className="phy-lens"/></g>,
  focus: <g><line x1="2" y1="14" x2="42" y2="14" className="phy-dim is-faint"/><circle cx="22" cy="14" r="3" className="phy-dot"/><text x="22" y="26" textAnchor="middle" className="phy-sm">F</text></g>,
  obj: <PhyArrow x1={22} y1={26} x2={22} y2={3} cls="is-obj" w={3}/>,
  img: <PhyArrow x1={22} y1={3} x2={22} y2={26} cls="is-img" w={3}/>,
  dim: <g><line x1="4" y1="14" x2="40" y2="14" className="phy-dim"/><line x1="4" y1="8" x2="4" y2="20" className="phy-dim"/><line x1="40" y1="8" x2="40" y2="20" className="phy-dim"/></g>,
  pivot: <path d="M22 6 l-10 18 h20 z" className="phy-pivot"/>,
  mass: <rect x="12" y="6" width="20" height="16" rx="2" className="phy-mass"/>,
  curve: <path d="M4 22 Q22 2 40 14" className="phy-curve"/>,
  area: <path d="M4 24 L40 8 L40 24 Z" className="phy-area"/>,
  level: <line x1="4" y1="14" x2="40" y2="14" className="phy-level is-on"/>,
  liquid: <rect x="6" y="6" width="32" height="18" className="phy-liquid"/>,
  node: <g><path d="M4 14 Q13 2 22 14 Q31 26 40 14" className="phy-curve"/><circle cx="22" cy="14" r="2.5" className="phy-dot"/></g>,
};
const PHY_READ = {
  "phy-circuit": { keys: [["cell", "A cell: the LONG line is the positive (+) terminal, the short line the negative."], ["res", "A resistor (marked with its resistance in ohms, Ω)."], ["amm", "An ammeter: measures the current. It sits IN the loop, in series."], ["volt", "A voltmeter: measures the voltage ACROSS a part, so it is joined in parallel with it."], ["wire", "A connecting wire: assume it has no resistance."]],
    how: "Follow the loop from the + terminal round to −: that is the way conventional current flows. In SERIES the same current passes through everything one after another; in PARALLEL the current splits between branches and each branch has the full voltage." },
  "phy-forces": { keys: [["force", "A force: the arrow points the way it pushes or pulls; a longer arrow is a bigger force."], ["mass", "The body the forces act on (a free-body diagram shows only the forces ON it)."]],
    how: "Add forces that point the same way and subtract those that point opposite ways. Whatever is left over is the RESULTANT force: zero means no change in motion; anything else accelerates the body in its direction (F = ma)." },
  "phy-lever": { keys: [["pivot", "The pivot (fulcrum): the point the beam turns about."], ["mass", "A load hanging from the beam; its weight pulls straight down."], ["dim", "A distance, measured from the PIVOT to the line of the force."]],
    how: "Each load tries to turn the beam: its moment is force × distance from the pivot. The beam balances when the turning effect one way (clockwise) equals the turning effect the other way (anticlockwise)." },
  "phy-graph": { keys: [["curve", "The line: each point is one moment — read time along the bottom, the quantity up the side."], ["area", "Shaded area under a velocity–time line = distance travelled."]],
    how: "Axes read “quantity / unit”. On a velocity–time graph the SLOPE is the acceleration and the AREA underneath is the distance. On a distance–time graph the slope is the speed. A flat line means that quantity is not changing." },
  "phy-wave": { keys: [["curve", "The wave: the shape of the disturbance at one instant."], ["dim", "One wavelength λ: from one crest to the next (or any point to the next identical point)."]],
    how: "The amplitude (a) is the height from the middle line to a crest. The wave moves along; each point only moves up and down. Speed = frequency × wavelength (v = fλ)." },
  "phy-mirror": { keys: [["mirror", "A plane mirror: the hatching marks the back (the non-reflecting side)."], ["normal", "The normal: an imaginary line at 90° to the mirror where the ray hits."], ["ray", "A ray of light; the arrow shows which way the light travels."]],
    how: "Angles are measured from the NORMAL, not from the mirror. The ray coming in (incident) and the ray going out (reflected) make equal angles with the normal: i = r." },
  "phy-refract": { keys: [["normal", "The normal: at 90° to the boundary where the ray crosses it."], ["ray", "A ray of light, with its direction of travel."]],
    how: "Going into a denser material (air → glass) light slows down and bends TOWARDS the normal, so the angle r is smaller than i. Coming out it bends away. Angles are always measured from the normal." },
  "phy-lens": { keys: [["lens", "A converging (convex) lens: thicker in the middle; it bends parallel rays to meet."], ["focus", "F, the principal focus: where parallel rays meet. 2F is twice as far."], ["obj", "The object (O), standing on the principal axis."], ["img", "The image (I): where the rays from the tip of the object meet again."], ["ray", "A ray, with its direction."]],
    how: "Two standard rays from the top of the object find the image: one runs PARALLEL to the axis and is bent through F on the far side; one goes straight through the CENTRE of the lens without bending. Where they cross is the top of the image. If they only meet when traced backwards (dashed), the image is virtual." },
  "phy-spring": { keys: [["mass", "The load hanging on the spring; its weight stretches it."], ["dim", "The extension: how much LONGER the spring is than its natural length."]],
    how: "Hooke’s law: up to the elastic limit, extension is proportional to the load (F = ke). The extension is the increase in length, not the new length." },
  "phy-pendulum": { keys: [["normal", "The vertical: where the bob hangs at rest."], ["dim", "L: the length from the point of support to the centre of the bob."]],
    how: "The bob swings either side of the vertical. One complete oscillation is there and back. Its period depends only on L and g: T = 2π√(L/g)." },
  "phy-projectile": { keys: [["force", "The launch velocity: horizontal, off the edge."], ["dim", "Heights and distances: the drop h and the range."], ["curve", "The path (trajectory): a curve called a parabola."]],
    how: "Treat the two directions separately. Sideways the speed never changes; downwards the ball falls exactly as if dropped. The time to fall the height h is the time it travels sideways." },
  "phy-decay": { keys: [["curve", "The amount left, falling over time."]],
    how: "Each time one half-life passes, what is left halves: ½, then ¼, then ⅛. Read across from ½ to the curve and down to the time axis to find the half-life." },
  "phy-heating": { keys: [["curve", "Temperature as heat is supplied."]],
    how: "Sloping parts: the temperature rises (Q = mcΔθ). Flat parts: the substance is changing state — melting or boiling — and the heat goes into that, not into temperature (Q = mL)." },
  "phy-hydraulic": { keys: [["liquid", "The liquid: it passes the pressure on equally everywhere."], ["force", "Forces on the two pistons."]],
    how: "Pressure = force ÷ area is the SAME on both pistons. So the large piston, with more area, gets a larger force: F₂ = F₁ × A₂/A₁." },
  "phy-cylinder": { keys: [["liquid", "The water; read the level at the bottom of the curved surface (the meniscus), at eye level."]],
    how: "The stone pushes aside its own volume of water, so the RISE in the level is the stone’s volume: after − before." },
  "phy-transformer": { keys: [["wire", "A coil: the more loops drawn, the more turns."]],
    how: "Alternating current in the primary coil (left) makes a changing magnetic field in the iron core, which induces a voltage in the secondary (right). Voltages are in the same ratio as the turns: Vs/Vp = Ns/Np." },
  "phy-pipe": { keys: [["node", "N, a node: where the air does not move. A, an antinode: where it moves most."], ["dim", "The length of the pipe."]],
    how: "A closed end is always a node; an open end is always an antinode. The fundamental is the simplest pattern that fits: a quarter-wavelength in a closed pipe, half a wavelength in an open one." },
  "phy-levels": { keys: [["level", "An energy level the electron is allowed to have (in electronvolts, eV)."], ["force", "A jump down from a higher level to a lower one."]],
    how: "Levels are negative because the electron is bound to the atom; 0 eV is free. Falling from a higher level to a lower one gives out a photon whose energy is exactly the difference between them." },
  "phy-box": { keys: [["node", "The standing wave; it must be zero at both walls."]],
    how: "Only waves that fit a whole number of half-wavelengths between the walls are allowed — each one is an energy level n. More half-waves means a shorter wavelength and more energy (Eₙ = n²E₁)." },
};
function PhyFigure({ d }) {
  const t = d.type;
  /* A circuit: a cell and resistors in series or two branches in parallel (labels from the question). */
  if (t === "phy-circuit") {
    const rs = d.r || [], par = d.layout === "parallel";
    if (par) return <svg className="mlb-dia phy-dia" viewBox="0 0 320 200" role="img" aria-label={"A cell" + (d.cell ? " of " + d.cell : "") + " connected to " + rs.join(" and ") + " in parallel"}>
      <path d="M40 40 H280 V160 H40 Z" className="phy-wire"/>
      <line x1="110" y1="40" x2="110" y2="160" className="phy-wire"/><line x1="210" y1="40" x2="210" y2="160" className="phy-wire"/>
      <rect x="40" y="38" width="70" height="4" className="phy-gap"/><rect x="38" y="40" width="4" height="120" className="phy-gap"/><rect x="40" y="158" width="70" height="4" className="phy-gap"/>
      <path d="M110 40 H280 V160 H110" className="phy-wire"/><line x1="110" y1="40" x2="110" y2="160" className="phy-wire"/>
      <path d="M110 40 H40 V82 M40 118 V160 H110" className="phy-wire"/><g transform="rotate(90 40 100)"><PhyCell x={40} y={100}/></g>
      <text x="16" y="104" textAnchor="middle" className="phy-lbl">{d.cell || ""}</text>
      <PhyResistor x={210} y={100} vertical label={rs[0]}/><PhyResistor x={280} y={100} vertical label={rs[1]}/>
      {d.ammeter ? <PhyMeter x={75} y={160} k="A"/> : null}
    </svg>;
    const n = Math.max(1, rs.length), gap = 200 / n;
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 170" role="img" aria-label={"A cell" + (d.cell ? " of " + d.cell : "") + " connected to " + rs.join(", ") + " in series"}>
      <path d="M40 50 H280 V140 H40 Z" className="phy-wire"/>
      <rect x="152" y="136" width="16" height="8" className="phy-gap"/><PhyCell x={160} y={140} label=""/>
      <text x="160" y="166" textAnchor="middle" className="phy-lbl">{d.cell || ""}</text>
      {rs.map((r, i) => <g key={i}><PhyResistor x={60 + gap * (i + 0.5)} y={50} label={d.voltmeter && !i ? "" : r}/>{d.voltmeter && !i ? <text x={60 + gap * 0.5} y="78" textAnchor="middle" className="phy-lbl">{r}</text> : null}</g>)}
      {d.ammeter ? <PhyMeter x={280} y={95} k="A"/> : null}
      {d.voltmeter ? <g><path d={"M" + (60 + gap * 0.5 - 30) + " 50 V20 H" + (60 + gap * 0.5 + 30) + " V50"} className="phy-wire is-thin"/><PhyMeter x={60 + gap * 0.5} y={20} k="V"/></g> : null}
    </svg>;
  }
  /* A free-body diagram: a block and the forces on it, each arrow as long as its size. */
  if (t === "phy-forces") {
    const fs = d.f || [], mx = Math.max(1, ...fs.map(f => Math.abs(f.n || 1))), L = n => 28 + 42 * Math.abs(n || mx) / mx;
    const dir = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 220" role="img" aria-label={"A block with forces: " + fs.map(f => f.label + " " + f.dir).join(", ")}>
      {d.ground ? <g><line x1="20" y1="140" x2="300" y2="140" className="phy-ground"/>{Array.from({ length: 14 }, (_, i) => <line key={i} x1={26 + i * 20} y1="140" x2={16 + i * 20} y2="150" className="phy-hatch"/>)}</g> : null}
      <rect x="125" y="80" width="70" height="60" rx="4" className="phy-body"/>
      {d.mass ? <text x="160" y="116" textAnchor="middle" className="phy-lbl is-b">{d.mass}</text> : null}
      {fs.map((f, i) => { const v = dir[f.dir] || [1, 0], o = f.off || 0, cx = 160 + v[0] * 35 + (v[0] ? 0 : o), cy = 110 + v[1] * 30 + (v[1] ? 0 : o), l = L(f.n);
        return <g key={i}><PhyArrow x1={cx} y1={cy} x2={cx + v[0] * l} y2={cy + v[1] * l} cls={"is-" + (f.tone || i % 4)}/>
          <text x={cx + v[0] * (l + 10)} y={cy + v[1] * (l + 14) + (v[1] ? 0 : -8)} textAnchor={v[0] > 0 ? "start" : v[0] < 0 ? "end" : "middle"} className="phy-lbl">{f.label}</text></g>; })}
    </svg>;
  }
  /* A lever or beam on a pivot, with loads hung along it. Positions are along the beam (0–100). */
  if (t === "phy-lever") {
    const X = p => 30 + p * 2.6, piv = d.pivot == null ? 50 : d.pivot;
    /* Loads may be given by distance from the pivot (`d`, signed: − left, + right): the larger is drawn
       near the end of the beam, and nothing closer than a block's width to the pivot. */
    const dmax = Math.max(1, ...(d.loads || []).filter(l => l.d != null).map(l => Math.abs(l.d)));
    const at = l => l.d == null ? l.at : piv + Math.sign(l.d) * Math.max(9, 44 * Math.abs(l.d) / dmax);
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 170" role="img" aria-label={"A beam on a pivot at " + piv + ", with loads " + (d.loads || []).map(l => l.label + " at " + l.at).join(", ")}>
      <rect x="30" y="70" width="260" height="10" rx="3" className="phy-beam"/>
      <path d={"M" + X(piv) + " 80 l-16 30 h32 z"} className="phy-pivot"/><line x1={X(piv) - 34} y1="110" x2={X(piv) + 34} y2="110" className="phy-ground"/>
      {(d.marks || []).map(m => <g key={m}><line x1={X(m)} y1="66" x2={X(m)} y2="84" className="phy-tick"/><text x={X(m)} y="60" textAnchor="middle" className="phy-sm">{m}</text></g>)}
      {(d.loads || []).map((l, i) => <g key={i}><line x1={X(at(l))} y1="80" x2={X(at(l))} y2="112" className="phy-string"/><rect x={X(at(l)) - 15} y="112" width="30" height="24" rx="3" className={"phy-mass" + (i ? " is-b" : "")}/>
          <text x={X(at(l))} y="155" textAnchor="middle" className="phy-lbl">{l.label}</text>
          {l.d != null ? <g><line x1={X(piv)} y1="44" x2={X(at(l))} y2="44" className="phy-dim"/><line x1={X(at(l))} y1="38" x2={X(at(l))} y2="50" className="phy-dim"/><line x1={X(piv)} y1="38" x2={X(piv)} y2="50" className="phy-dim"/>
            <text x={(X(piv) + X(at(l))) / 2} y="34" textAnchor="middle" className="phy-lbl">{Math.abs(l.d) + " cm"}</text></g> : null}</g>)}
    </svg>;
  }
  /* A velocity–time (or distance–time) graph through the given corner points, area shaded when asked. */
  if (t === "phy-graph") {
    const pts = d.pts || [[0, 0]], mxT = Math.max(...pts.map(p => p[0])) || 1, mxV = Math.max(...pts.map(p => p[1])) || 1;
    const X = v => 50 + v / mxT * 240, Y = v => 160 - v / mxV * 120;
    const path = pts.map((p, i) => (i ? "L" : "M") + X(p[0]) + " " + Y(p[1])).join(" ");
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 200" role="img" aria-label={(d.y || "velocity") + " against " + (d.x || "time") + " through " + pts.map(p => "(" + p[0] + ", " + p[1] + ")").join(", ")}>
      {d.shade ? <path d={path + " L" + X(pts[pts.length - 1][0]) + " 160 L" + X(pts[0][0]) + " 160 Z"} className="phy-area"/> : null}
      <line x1="50" y1="160" x2="300" y2="160" className="phy-axis"/><line x1="50" y1="160" x2="50" y2="25" className="phy-axis"/>
      <path d={path} className="phy-curve"/>
      {pts.map((p, i) => <g key={i}><line x1={X(p[0])} y1={Y(p[1])} x2={X(p[0])} y2="160" className="phy-dim is-faint"/><text x={X(p[0])} y="176" textAnchor="middle" className="phy-sm">{p[0]}</text>
        {p[1] ? <text x="44" y={Y(p[1]) + 4} textAnchor="end" className="phy-sm">{p[1]}</text> : null}</g>)}
      <text x="300" y="194" textAnchor="end" className="phy-lbl">{d.x || "time / s"}</text><text x="12" y="20" className="phy-lbl">{d.y || "velocity / m s⁻¹"}</text>
    </svg>;
  }
  /* A wave, with one wavelength and the amplitude marked. */
  if (t === "phy-wave") {
    const n = d.waves || 2.5, lam = 260 / n, A = 40, y0 = 90;
    let p = ""; for (let i = 0; i <= 260; i += 2) p += (i ? "L" : "M") + (30 + i) + " " + (y0 - A * Math.sin(2 * Math.PI * i / lam)).toFixed(1);
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={"A wave with one wavelength marked" + (d.lambda ? " as " + d.lambda : "")}>
      <line x1="30" y1={y0} x2="295" y2={y0} className="phy-dim is-faint"/><path d={p} className="phy-curve"/>
      <line x1={30 + lam / 4} y1="28" x2={30 + lam * 1.25} y2="28" className="phy-dim"/><line x1={30 + lam / 4} y1="22" x2={30 + lam / 4} y2="50" className="phy-dim"/><line x1={30 + lam * 1.25} y1="22" x2={30 + lam * 1.25} y2="50" className="phy-dim"/>
      <text x={30 + lam * 0.75} y="20" textAnchor="middle" className="phy-lbl">{d.lambda || "λ"}</text>
      <line x1={30 + lam * 0.25} y1={y0} x2={30 + lam * 0.25} y2={y0 - A} className="phy-dim"/><text x={22 + lam * 0.25} y={y0 - A / 2 + 4} textAnchor="end" className="phy-sm">{d.amp || "a"}</text>
    </svg>;
  }
  /* A ray meeting a plane mirror: the normal dashed, the angles marked from it. */
  if (t === "phy-mirror") {
    const i = (d.i == null ? 40 : d.i) * Math.PI / 180, cx = 160, cy = 150, L = 110;
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={"A ray reflected by a plane mirror" + (d.label ? ", " + d.label : "")}>
      <line x1="40" y1={cy} x2="280" y2={cy} className="phy-mirror"/>{Array.from({ length: 12 }, (_, k) => <line key={k} x1={46 + k * 20} y1={cy} x2={36 + k * 20} y2={cy + 10} className="phy-hatch"/>)}
      <line x1={cx} y1={cy} x2={cx} y2="25" className="phy-normal"/>
      <PhyArrow x1={cx - L * Math.sin(i)} y1={cy - L * Math.cos(i)} x2={cx - 0.5 * L * Math.sin(i)} y2={cy - 0.5 * L * Math.cos(i)} cls="is-ray"/>
      <line x1={cx - L * Math.sin(i)} y1={cy - L * Math.cos(i)} x2={cx} y2={cy} className="phy-ray"/>
      <line x1={cx} y1={cy} x2={cx + L * Math.sin(i)} y2={cy - L * Math.cos(i)} className="phy-ray"/>
      <PhyArrow x1={cx} y1={cy} x2={cx + 0.6 * L * Math.sin(i)} y2={cy - 0.6 * L * Math.cos(i)} cls="is-ray"/>
      <text x={cx - 22} y={cy - 46} textAnchor="end" className="phy-lbl is-ang">{d.iLabel || "i"}</text><text x={cx + 22} y={cy - 46} className="phy-lbl is-ang">{d.rLabel || "r"}</text>
      {d.label ? <text x="160" y="174" textAnchor="middle" className="phy-sm">{d.label}</text> : null}
    </svg>;
  }
  /* Refraction at a flat boundary: air above, a denser medium below. */
  if (t === "phy-refract") {
    const n = d.n || 1.5, i = (d.i == null ? 45 : d.i) * Math.PI / 180, sr = Math.sin(i) / n, r = Math.asin(Math.min(1, sr)), cx = 160, cy = 100, L = 85;
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 200" role="img" aria-label={"A ray passing from " + (d.top || "air") + " into " + (d.bottom || "glass") + ", bending towards the normal"}>
      <rect x="20" y={cy} width="280" height="90" className="phy-glass"/><line x1="20" y1={cy} x2="300" y2={cy} className="phy-bound"/>
      <line x1={cx} y1="12" x2={cx} y2="188" className="phy-normal"/>
      <line x1={cx - L * Math.sin(i)} y1={cy - L * Math.cos(i)} x2={cx} y2={cy} className="phy-ray"/><PhyArrow x1={cx - L * Math.sin(i)} y1={cy - L * Math.cos(i)} x2={cx - 0.45 * L * Math.sin(i)} y2={cy - 0.45 * L * Math.cos(i)} cls="is-ray"/>
      <line x1={cx} y1={cy} x2={cx + L * Math.sin(r)} y2={cy + L * Math.cos(r)} className="phy-ray"/><PhyArrow x1={cx} y1={cy} x2={cx + 0.6 * L * Math.sin(r)} y2={cy + 0.6 * L * Math.cos(r)} cls="is-ray"/>
      <text x={cx - 12} y={cy - 40} textAnchor="end" className="phy-lbl is-ang">{d.iLabel || "i"}</text><text x={cx + 10} y={cy + 52} className="phy-lbl is-ang">{d.rLabel || "r"}</text>
      <text x="28" y={cy - 8} className="phy-sm">{d.top || "air"}</text><text x="28" y={cy + 20} className="phy-sm">{d.bottom || "glass"}</text>
    </svg>;
  }
  /* A converging lens with the object, the image and the two principal rays. Distances in cm (sign: real positive). */
  if (t === "phy-lens") {
    /* Real-is-positive: 1/f = 1/u + 1/v. Two principal rays from the object's tip: parallel to the axis
       then through the far focus, and straight through the centre. A real image is where they cross;
       a virtual one is where their backward extensions (dashed) cross, on the object's side. */
    const u = d.u || 30, f = d.f || 20, v = Math.abs(u - f) < 1e-6 ? Infinity : u * f / (u - f);
    const span = isFinite(v) ? (v > 0 ? u + v : Math.max(u, -v) + 2 * f) : u + 3 * f;
    const sc = 250 / Math.max(span, 2 * f + u), cx = isFinite(v) && v < 0 ? 40 + Math.max(u, -v) * sc : 30 + u * sc, ax = 112;
    const X = p => cx + p * sc, mag = isFinite(v) ? Math.abs(v / u) : 4, h = Math.min(40, 72 / Math.max(1, mag)), hi = isFinite(v) ? h * v / u : 0;
    const tip = [X(-u), ax - h], img = isFinite(v) ? [X(v), ax + hi] : null;   // v > 0: image below the axis (inverted)
    const along = (p, q, x) => [x, p[1] + (q[1] - p[1]) * (x - p[0]) / ((q[0] - p[0]) || 1e-6)];
    const r1end = along([cx, ax - h], [X(f), ax], 312), r2end = along(tip, [cx, ax], 312);
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 210" role="img" aria-label={"An object " + u + " cm from a converging lens of focal length " + f + " cm" + (isFinite(v) ? (v > 0 ? ": a real, inverted image " + Math.round(v * 10) / 10 + " cm behind it" : ": a virtual, upright image on the same side") : ": no image")}>
      <line x1="6" y1={ax} x2="314" y2={ax} className="phy-dim is-faint"/>
      <path d={"M" + cx + " 34 Q" + (cx + 13) + " " + ax + " " + cx + " 190 Q" + (cx - 13) + " " + ax + " " + cx + " 34"} className="phy-lens"/>
      {[-f, f].map(p => <g key={p}><circle cx={X(p)} cy={ax} r="3" className="phy-dot"/><text x={X(p)} y={ax + 16} textAnchor="middle" className="phy-sm">F</text></g>)}
      {[-2 * f, 2 * f].filter(p => X(p) > 8 && X(p) < 312).map(p => <g key={"2" + p}><line x1={X(p)} y1={ax - 4} x2={X(p)} y2={ax + 4} className="phy-tick"/><text x={X(p)} y={ax + 16} textAnchor="middle" className="phy-sm">2F</text></g>)}
      <PhyArrow x1={tip[0]} y1={tip[1]} x2={(tip[0] + cx) / 2} y2={ax - h} cls="is-ray"/><PhyArrow x1={tip[0]} y1={tip[1]} x2={(tip[0] + cx) / 2} y2={(tip[1] + ax) / 2} cls="is-ray"/>
      <line x1={tip[0]} y1={tip[1]} x2={cx} y2={ax - h} className="phy-ray"/><line x1={cx} y1={ax - h} x2={r1end[0]} y2={r1end[1]} className="phy-ray"/>
      <line x1={tip[0]} y1={tip[1]} x2={r2end[0]} y2={r2end[1]} className="phy-ray"/>
      {img && v < 0 ? <g><line x1={cx} y1={ax - h} x2={img[0]} y2={img[1]} className="phy-ray is-faint"/><line x1={cx} y1={ax} x2={img[0]} y2={img[1]} className="phy-ray is-faint"/></g> : null}
      <PhyArrow x1={tip[0]} y1={ax} x2={tip[0]} y2={tip[1]} cls="is-obj" w={3}/><text x={tip[0]} y={ax + 16} textAnchor="middle" className="phy-sm">O</text>
      {img ? <g><PhyArrow x1={img[0]} y1={ax} x2={img[0]} y2={img[1]} cls="is-img" w={3}/><text x={img[0] + 8} y={v > 0 ? ax - 6 : ax + 16} className="phy-sm">I</text></g> : null}
      {d.labels ? <text x="160" y="18" textAnchor="middle" className="phy-sm">{d.labels}</text> : null}
    </svg>;
  }
  /* A spring hanging from a support, stretched by a load. */
  if (t === "phy-spring") {
    const e = Math.min(70, 20 + (d.ext || 0) * 4), top = 30, coils = 10, x = 160;
    let p = "M" + x + " " + top + " l0 10"; for (let k = 0; k < coils; k++) p += " l" + (k % 2 ? -14 : 14) + " " + ((60 + e) / coils / 2) + " l" + (k % 2 ? 14 : -14) + " " + ((60 + e) / coils / 2);
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 210" role="img" aria-label={"A spring stretched by a load" + (d.load ? " of " + d.load : "")}>
      <line x1="100" y1={top} x2="220" y2={top} className="phy-ground"/>{Array.from({ length: 6 }, (_, k) => <line key={k} x1={106 + k * 20} y1={top} x2={116 + k * 20} y2={top - 10} className="phy-hatch"/>)}
      <path d={p} className="phy-spring"/><rect x={x - 22} y={top + 80 + e} width="44" height="34" rx="4" className="phy-mass"/>
      <text x={x} y={top + 102 + e} textAnchor="middle" className="phy-lbl is-b is-inv">{d.load || ""}</text>
      {d.extLabel ? <g><line x1="230" y1={top + 80} x2="230" y2={top + 80 + e} className="phy-dim"/><text x="238" y={top + 84 + e / 2} className="phy-lbl">{d.extLabel}</text></g> : null}
    </svg>;
  }
  /* A simple pendulum: the string, the bob, the angle. */
  if (t === "phy-pendulum") {
    const a = 25 * Math.PI / 180, L = 130, x0 = 160, y0 = 25;
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label={"A simple pendulum" + (d.L ? " of length " + d.L : "")}>
      <line x1="100" y1={y0} x2="220" y2={y0} className="phy-ground"/><line x1={x0} y1={y0} x2={x0} y2={y0 + L + 15} className="phy-normal"/>
      <line x1={x0} y1={y0} x2={x0 + L * Math.sin(a)} y2={y0 + L * Math.cos(a)} className="phy-string"/><circle cx={x0 + L * Math.sin(a)} cy={y0 + L * Math.cos(a)} r="13" className="phy-bob"/>
      <path d={"M" + x0 + " " + (y0 + 40) + " A40 40 0 0 0 " + (x0 + 40 * Math.sin(a)) + " " + (y0 + 40 * Math.cos(a))} className="phy-angarc"/>
      <text x={x0 + L * Math.sin(a) / 2 + 12} y={y0 + L * Math.cos(a) / 2 + 4} className="phy-lbl">{d.L || "L"}</text>
    </svg>;
  }
  /* A ball launched horizontally off a ledge: its path, the height and the range. */
  if (t === "phy-projectile") {
    let p = ""; for (let k = 0; k <= 30; k++) { const s = k / 30; p += (k ? "L" : "M") + (70 + 210 * s) + " " + (50 + 120 * s * s); }
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 200" role="img" aria-label={"A ball rolling off a ledge" + (d.h ? " " + d.h + " high" : "") + " and landing some distance away"}>
      <rect x="34" y="50" width="36" height="120" className="phy-body"/><line x1="10" y1="170" x2="310" y2="170" className="phy-ground"/>
      <circle cx="66" cy="42" r="8" className="phy-bob"/><PhyArrow x1="74" y1="42" x2="120" y2="42" cls="is-1"/><text x="98" y="34" textAnchor="middle" className="phy-sm">{d.u || "u"}</text>
      <path d={p} className="phy-trace"/>
      <line x1="24" y1="50" x2="24" y2="170" className="phy-dim"/><text x="16" y="110" textAnchor="middle" transform="rotate(-90 16 110)" className="phy-lbl">{d.h || "h"}</text>
      <line x1="70" y1="188" x2="280" y2="188" className="phy-dim"/><text x="175" y="184" textAnchor="middle" className="phy-lbl">{d.range || "range"}</text>
    </svg>;
  }
  /* Radioactive decay: the halving curve with the half-lives marked. */
  if (t === "phy-decay") {
    const T = 60; let p = ""; for (let x = 0; x <= 240; x += 3) p += (x ? "L" : "M") + (50 + x) + " " + (160 - 130 * Math.pow(0.5, x / T)).toFixed(1);
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 200" role="img" aria-label="A decay curve: the amount halves every half-life">
      <line x1="50" y1="160" x2="300" y2="160" className="phy-axis"/><line x1="50" y1="160" x2="50" y2="20" className="phy-axis"/><path d={p} className="phy-curve"/>
      {[1, 2, 3].map(k => <g key={k}><line x1={50 + k * T} y1="160" x2={50 + k * T} y2={160 - 130 * Math.pow(0.5, k)} className="phy-dim is-faint"/>
        <line x1="50" y1={160 - 130 * Math.pow(0.5, k)} x2={50 + k * T} y2={160 - 130 * Math.pow(0.5, k)} className="phy-dim is-faint"/>
        <text x={50 + k * T} y="176" textAnchor="middle" className="phy-sm">{k}T½</text><text x="44" y={164 - 130 * Math.pow(0.5, k)} textAnchor="end" className="phy-sm">{["", "½", "¼", "⅛"][k]}</text></g>)}
      <text x="58" y="30" className="phy-sm">{d.n0 ? "N₀ = " + d.n0 : "N₀"}</text><text x="300" y="194" textAnchor="end" className="phy-lbl">time</text>
    </svg>;
  }
  /* Heating ice to steam: the flat parts are the changes of state. */
  if (t === "phy-heating") {
    const P = [[0, 150], [30, 120], [90, 120], [130, 60], [230, 60], [255, 30]];
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 200" role="img" aria-label="A heating curve: temperature rises, stays flat while melting, rises, stays flat while boiling">
      <line x1="40" y1="170" x2="305" y2="170" className="phy-axis"/><line x1="40" y1="170" x2="40" y2="15" className="phy-axis"/>
      <path d={P.map((p, i) => (i ? "L" : "M") + (40 + p[0]) + " " + p[1]).join(" ")} className="phy-curve"/>
      <text x="100" y="112" textAnchor="middle" className="phy-sm">melting (0 °C)</text><text x="220" y="52" textAnchor="middle" className="phy-sm">boiling (100 °C)</text>
      <text x="305" y="192" textAnchor="end" className="phy-lbl">heat supplied</text><text x="10" y="12" className="phy-lbl">temperature</text>
    </svg>;
  }
  /* A hydraulic press: a small piston and a large one on one liquid. */
  if (t === "phy-hydraulic") {
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label="A hydraulic press: a small piston pushed down lifts a large piston">
      <path d="M40 60 V150 H280 V40 M80 60 V120 H200 V40" className="phy-wire is-thick"/><rect x="42" y="74" width="36" height="74" className="phy-liquid"/><rect x="80" y="122" width="198" height="26" className="phy-liquid"/><rect x="202" y="54" width="76" height="70" className="phy-liquid"/>
      <rect x="42" y="64" width="36" height="10" className="phy-piston"/><rect x="202" y="44" width="76" height="10" className="phy-piston"/>
      <PhyArrow x1="60" y1="20" x2="60" y2="60" cls="is-1"/><text x="60" y="14" textAnchor="middle" className="phy-lbl">{d.f1 || "F₁"}</text>
      <PhyArrow x1="240" y1="40" x2="240" y2="8" cls="is-2"/><text x="268" y="20" className="phy-lbl">{d.f2 || "F₂"}</text>
      <text x="60" y="178" textAnchor="middle" className="phy-sm">{d.a1 || "A₁"}</text><text x="240" y="178" textAnchor="middle" className="phy-sm">{d.a2 || "A₂"}</text>
    </svg>;
  }
  /* A measuring cylinder before and after a stone goes in. */
  if (t === "phy-cylinder") {
    const a = d.before || 50, b = d.after || 70, mx = Math.max(b * 1.25, 100), Y = v => 175 - v / mx * 150;
    const cyl = (x, v, stone) => <g><path d={"M" + x + " 20 V175 H" + (x + 50) + " V20"} className="phy-wire is-thick"/><rect x={x + 2} y={Y(v)} width="46" height={175 - Y(v)} className="phy-liquid"/>
      {[0.2, 0.4, 0.6, 0.8].map(k => <line key={k} x1={x + 34} y1={Y(mx * k)} x2={x + 48} y2={Y(mx * k)} className="phy-tick"/>)}
      {stone ? <circle cx={x + 25} cy="160" r="11" className="phy-stone"/> : null}<text x={x + 58} y={Y(v) + 4} className="phy-lbl">{v} cm³</text></g>;
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label={"A measuring cylinder at " + a + " cm³, then at " + b + " cm³ with a stone in it"}>{cyl(40, a, false)}{cyl(190, b, true)}<PhyArrow x1="140" y1="100" x2="175" y2="100" cls="is-1"/></svg>;
  }
  /* A transformer: an iron core, the primary and secondary coils. */
  if (t === "phy-transformer") {
    const coil = (x, n) => Array.from({ length: n }, (_, k) => <ellipse key={k} cx={x} cy={55 + k * (90 / n)} rx="18" ry="5" className="phy-coil"/>);
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={"A transformer with " + (d.np || "Np") + " primary and " + (d.ns || "Ns") + " secondary turns"}>
      <path d="M100 40 H220 V150 H100 Z M120 60 H200 V130 H120 Z" className="phy-core" fillRule="evenodd"/>
      {coil(100, Math.min(12, d.npDraw || 8))}{coil(220, Math.min(12, d.nsDraw || 4))}
      <text x="44" y="100" textAnchor="middle" className="phy-lbl">{d.vp || "Vp"}</text><text x="44" y="118" textAnchor="middle" className="phy-sm">{d.np ? d.np + " turns" : "Np"}</text>
      <text x="282" y="100" textAnchor="middle" className="phy-lbl">{d.vs || "Vs"}</text><text x="282" y="118" textAnchor="middle" className="phy-sm">{d.ns ? d.ns + " turns" : "Ns"}</text>
    </svg>;
  }
  /* A pipe, closed at one end or open at both, with its fundamental's displacement envelope. */
  if (t === "phy-pipe") {
    const x0 = 40, x1 = 280, y = 90, A = 34; let up = "", dn = "";
    for (let k = 0; k <= 60; k++) { const s2 = k / 60, amp = d.closed ? Math.sin(Math.PI / 2 * s2) : Math.cos(Math.PI * s2); const x = x0 + (x1 - x0) * s2;
      up += (k ? "L" : "M") + x.toFixed(1) + " " + (y - A * Math.abs(amp)).toFixed(1); dn += (k ? "L" : "M") + x.toFixed(1) + " " + (y + A * Math.abs(amp)).toFixed(1); }
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 170" role="img" aria-label={"A pipe " + (d.closed ? "closed at one end" : "open at both ends") + (d.L ? ", " + d.L + " long" : "") + ", with its fundamental standing wave"}>
      <path d={"M" + x0 + " " + (y - 44) + " H" + x1 + " M" + x0 + " " + (y + 44) + " H" + x1} className="phy-wire is-thick"/>
      {d.closed ? <line x1={x0} y1={y - 46} x2={x0} y2={y + 46} className="phy-wire is-thick"/> : null}
      <path d={up} className="phy-curve"/><path d={dn} className="phy-curve"/>
      <text x={x0 + (d.closed ? 4 : 10)} y={y + 4} className="phy-sm">{d.closed ? "N" : "A"}</text><text x={x1 - 14} y={y + 4} className="phy-sm">A</text>
      {!d.closed ? <text x={(x0 + x1) / 2 - 4} y={y + 4} className="phy-sm">N</text> : null}
      <line x1={x0} y1="152" x2={x1} y2="152" className="phy-dim"/><text x={(x0 + x1) / 2} y="166" textAnchor="middle" className="phy-lbl">{d.L || "L"} = {d.closed ? "λ/4" : "λ/2"}</text>
    </svg>;
  }
  /* Hydrogen's energy levels, with the jump asked about. */
  if (t === "phy-levels") {
    const ns = [1, 2, 3, 4, 5], Y = n => 170 - (13.6 - 13.6 / (n * n)) / 13.6 * 145;
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 185" role="img" aria-label={"Energy levels of hydrogen, with a jump from level " + d.from + " to level " + d.to}>
      {ns.map(n => <g key={n}><line x1="70" y1={Y(n)} x2="250" y2={Y(n)} className={"phy-level" + (n === d.from || n === d.to ? " is-on" : "")}/><text x="64" y={Y(n) + 4} textAnchor="end" className="phy-sm">n = {n}</text>
        <text x="256" y={Y(n) + 4} className="phy-sm">{phyR(-13.6 / (n * n), 2)} eV</text></g>)}
      {d.from && d.to ? <PhyArrow x1={160} y1={Y(d.from)} x2={160} y2={Y(d.to)} cls="is-res"/> : null}
      {d.from && d.to ? <path d={"M168 " + ((Y(d.from) + Y(d.to)) / 2) + " q8 -8 16 0 t16 0 t16 0"} className="phy-ray"/> : null}
    </svg>;
  }
  /* A particle in a box: the walls, and the standing wave for level n. */
  if (t === "phy-box") {
    const n = d.n || 1, x0 = 60, x1 = 260; let w = "";
    for (let k = 0; k <= 80; k++) { const s2 = k / 80; w += (k ? "L" : "M") + (x0 + (x1 - x0) * s2).toFixed(1) + " " + (95 - 50 * Math.sin(n * Math.PI * s2)).toFixed(1); }
    return <svg className="mlb-dia phy-dia" viewBox="0 0 320 170" role="img" aria-label={"A particle in a box: the standing wave for level " + n + ", with " + (n - 1) + " nodes inside"}>
      <rect x={x0 - 14} y="20" width="14" height="130" className="phy-body"/><rect x={x1} y="20" width="14" height="130" className="phy-body"/>
      <line x1={x0} y1="95" x2={x1} y2="95" className="phy-dim is-faint"/><path d={w} className="phy-curve"/>
      <text x="160" y="164" textAnchor="middle" className="phy-lbl">n = {n}: {n} half-wavelength{n > 1 ? "s" : ""} fit in the box</text>
    </svg>;
  }
  return null;
}

/* ═══ Explorers ═══ */
function PhyOut({ children }) { return <div className="mlb-ex-out phy-out" role="status" aria-live="polite">{children}</div>; }
function PhySl({ label, value, min, max, step, onChange, fmt }) { return <MlbSlider label={label} value={value} min={min} max={max} step={step} onChange={onChange} fmt={fmt}/>; }
function PhyToggle({ options, value, onChange, label }) {
  return <div className="phy-seg" role="group" aria-label={label}>{options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} className={"phy-seg-b" + (value === v ? " is-on" : "")} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/* Particles: solid, liquid, gas — the same particles, more energy. */
function PhyExParticles() {
  const [T, setT] = React.useState(20); const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const state = T < 0 ? "solid" : T < 100 ? "liquid" : "gas";
  const pts = React.useMemo(() => Array.from({ length: 36 }, (_, i) => ({ gx: i % 6, gy: Math.floor(i / 6), a: (i * 2.399) % 6.28, s: 0.6 + ((i * 7) % 10) / 10 })), []);
  const pos = p => {
    if (state === "solid") return [100 + p.gx * 22 + 2 * Math.sin(t * 12 + p.a), 60 + p.gy * 22 + 2 * Math.cos(t * 11 + p.a)];
    if (state === "liquid") return [90 + ((p.gx * 22 + t * 18 * p.s + 30 * Math.sin(p.a)) % 140), 95 + p.gy * 12 + 4 * Math.sin(t * 3 + p.a)];
    const W = 280, H = 150, x = (p.gx * 47 + t * 90 * p.s * Math.cos(p.a)) % (2 * W), y = (p.gy * 31 + t * 90 * p.s * Math.sin(p.a)) % (2 * H);
    const fx = Math.abs(((x % (2 * W)) + 2 * W) % (2 * W)), fy = Math.abs(((y % (2 * H)) + 2 * H) % (2 * H));
    return [20 + (fx > W ? 2 * W - fx : fx), 15 + (fy > H ? 2 * H - fy : fy)];
  };
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={"Particles of water at " + T + " °C: a " + state}>
      <rect x="15" y="10" width="290" height="160" rx="8" className="phy-box"/>
      {state !== "gas" ? <rect x="80" y={state === "solid" ? 50 : 88} width="160" height={state === "solid" ? 140 : 80} className="phy-liquid is-faint"/> : null}
      {pts.map((p, i) => { const [x, y] = pos(p); return <circle key={i} cx={x} cy={Math.min(165, y)} r="7" className={"phy-part is-" + state}/>; })}
    </svg>
    <PhySl label="Temperature" value={T} min={-30} max={150} step={5} onChange={setT} fmt={v => v + " °C"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>At {T} °C — <b>{state === "solid" ? "Ice (solid)" : state === "liquid" ? "Water (liquid)" : "Steam (gas)"}</b>: {state === "solid" ? "particles locked in a pattern, only vibrating." : state === "liquid" ? "particles touching but sliding past each other." : "particles far apart, flying fast in every direction."} Heating gives them more energy; it never makes them bigger.</PhyOut>
  </div>;
}

/* Floating and sinking: density against the liquid's. */
function PhyExFloat() {
  const [rho, setRho] = React.useState(600), [liq, setLiq] = React.useState(1000);
  const frac = Math.min(1, rho / liq), sinks = rho > liq, H = 50, top = sinks ? 150 - H : 80 - H * (1 - frac) + 0;
  const water = 80;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={"A block of density " + rho + " in a liquid of density " + liq + ": it " + (sinks ? "sinks" : "floats with " + Math.round(frac * 100) + "% under")}>
      <rect x="40" y="20" width="240" height="150" rx="6" className="phy-box"/><rect x="42" y={water} width="236" height="88" className="phy-liquid"/>
      <rect x="130" y={sinks ? 168 - H : water - H * (1 - frac)} width="60" height={H} rx="4" className="phy-mass"/>
      {!sinks ? <PhyArrow x1="160" y1={water + H * frac + 34} x2="160" y2={water + H * frac + 4} cls="is-1"/> : null}
    </svg>
    <PhySl label="Density of the block" value={rho} min={100} max={3000} step={50} onChange={setRho} fmt={v => v + " kg/m³"}/>
    <PhySl label="Density of the liquid" value={liq} min={700} max={1400} step={50} onChange={setLiq} fmt={v => v + " kg/m³"}/>
    <PhyOut>{sinks ? <span>It <b>sinks</b>: the block is denser than the liquid ({rho} &gt; {liq}).</span> : <span>It <b>floats</b> with <b>{Math.round(frac * 100)}%</b> under the surface: {rho} ÷ {liq}. The upthrust equals its weight.</span>}</PhyOut>
  </div>;
}

/* Adding forces: two forces at an angle and their resultant. */
function PhyExVectors() {
  const [a, setA] = React.useState(30), [b, setB] = React.useState(40), [ang, setAng] = React.useState(90);
  const r = ang * Math.PI / 180, rx = a + b * Math.cos(r), ry = b * Math.sin(r), R = Math.hypot(rx, ry), sc = 1.6, ox = 70, oy = 150;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={"Forces of " + a + " N and " + b + " N at " + ang + "°, resultant " + phyR(R, 1) + " N"}>
      <PhyArrow x1={ox} y1={oy} x2={ox + a * sc} y2={oy} cls="is-0"/><PhyArrow x1={ox} y1={oy} x2={ox + b * sc * Math.cos(r)} y2={oy - b * sc * Math.sin(r)} cls="is-2"/>
      <line x1={ox + a * sc} y1={oy} x2={ox + rx * sc} y2={oy - ry * sc} className="phy-dim is-faint"/><line x1={ox + b * sc * Math.cos(r)} y1={oy - b * sc * Math.sin(r)} x2={ox + rx * sc} y2={oy - ry * sc} className="phy-dim is-faint"/>
      <PhyArrow x1={ox} y1={oy} x2={ox + rx * sc} y2={oy - ry * sc} cls="is-res" w={4}/>
      <text x={ox + a * sc / 2} y={oy + 18} textAnchor="middle" className="phy-lbl">{a} N</text>
    </svg>
    <PhySl label="First force" value={a} min={0} max={60} onChange={setA} fmt={v => v + " N"}/><PhySl label="Second force" value={b} min={0} max={60} onChange={setB} fmt={v => v + " N"}/>
    <PhySl label="Angle between them" value={ang} min={0} max={180} step={5} onChange={setAng} fmt={v => v + "°"}/>
    <PhyOut>Resultant: <b>{phyR(R, 1)} N</b>. {ang === 0 ? "Same direction: they simply add." : ang === 180 ? "Opposite: they subtract." : ang === 90 ? "At right angles: Pythagoras, √(a² + b²)." : "Between: the parallelogram decides it."}</PhyOut>
  </div>;
}

/* Newton's second law: push a cart, with or without friction. */
function PhyExForces() {
  const [F, setF] = React.useState(20), [m, setM] = React.useState(5), [mu, setMu] = React.useState(0.2), [run, setRun] = React.useState(false);
  const fr = Math.min(F, mu * m * 10), net = F - fr, a = net / m;
  const [t, setT] = usePhyClock(run, F + ":" + m + ":" + mu);
  const x = 0.5 * a * t * t, v = a * t; const px = 30 + ((x * 12) % 230);
  React.useEffect(() => { if (x > 60) setRun(false); }, [x]);
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 150" role="img" aria-label={"A " + m + " kg cart pushed with " + F + " N against " + phyR(fr, 1) + " N of friction"}>
      <line x1="10" y1="110" x2="310" y2="110" className="phy-ground"/>
      <g transform={"translate(" + px + ",0)"}><rect x="0" y="70" width="50" height="34" rx="4" className="phy-mass"/><circle cx="12" cy="106" r="6" className="phy-wheel"/><circle cx="38" cy="106" r="6" className="phy-wheel"/>
        {F > 0 ? <PhyArrow x1={-F * 1.6 - 4} y1={87} x2={-4} y2={87} cls="is-0"/> : null}{fr > 0 ? <PhyArrow x1={52} y1={100} x2={52 + fr * 1.6} y2={100} cls="is-3"/> : null}</g>
    </svg>
    <PhySl label="Push $F$" value={F} min={0} max={60} onChange={setF} fmt={v => v + " N"}/><PhySl label="Mass $m$" value={m} min={1} max={20} onChange={setM} fmt={v => v + " kg"}/>
    <PhySl label="Friction coefficient $\mu$" value={mu} min={0} max={0.8} step={0.05} onChange={setMu} fmt={v => phyR(v, 2)}/>
    <button type="button" className="stt-btn" onClick={() => { setT(0); setRun(true); }}><i className="ph-fill ph-play" aria-hidden="true"/>Let it go</button>
    <PhyOut>Friction {phyR(fr, 1)} N, so the resultant is <b>{phyR(net, 1)} N</b> and a = F/m = <b>{phyR(a, 2)} m/s²</b>. {net <= 0 ? "Not enough push to beat friction: it stays put." : "Speed now: " + phyR(v, 1) + " m/s."}</PhyOut>
  </div>;
}

/* Motion graphs: build a journey and read the distance off the area. */
function PhyExMotion() {
  const [u, setU] = React.useState(2), [a, setA] = React.useState(1.5), [T, setT2] = React.useState(6);
  const v = u + a * T, s = u * T + 0.5 * a * T * T, X = t => 40 + t / 12 * 260, Y = vv => 160 - vv / 30 * 140;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label={"A velocity–time graph from " + u + " to " + phyR(v, 1) + " m/s over " + T + " s; area " + phyR(s, 1) + " m"}>
      <path d={"M" + X(0) + " " + Y(u) + " L" + X(T) + " " + Y(v) + " L" + X(T) + " 160 L" + X(0) + " 160 Z"} className="phy-area"/>
      <line x1="40" y1="160" x2="305" y2="160" className="phy-axis"/><line x1="40" y1="160" x2="40" y2="15" className="phy-axis"/>
      <line x1={X(0)} y1={Y(u)} x2={X(T)} y2={Y(v)} className="phy-curve"/>
      <text x={X(T / 2)} y={Math.max(Y((u + v) / 2) + 40, 130)} textAnchor="middle" className="phy-lbl">area = {phyR(s, 1)} m</text>
      <text x="300" y="180" textAnchor="end" className="phy-sm">time / s</text><text x="46" y="14" className="phy-sm">v / m s⁻¹</text>
    </svg>
    <PhySl label="Start speed $u$" value={u} min={0} max={10} onChange={setU} fmt={v2 => v2 + " m/s"}/><PhySl label="Acceleration $a$" value={a} min={-2} max={3} step={0.5} onChange={setA} fmt={v2 => v2 + " m/s²"}/>
    <PhySl label="Time $t$" value={T} min={1} max={12} onChange={setT2} fmt={v2 => v2 + " s"}/>
    <PhyOut>Final speed v = u + at = <b>{phyR(v, 1)} m/s</b>. Distance = the shaded area = <b>{phyR(s, 1)} m</b>. The slope of the line is the acceleration.{v < 0 ? " (A negative v means it turned round.)" : ""}</PhyOut>
  </div>;
}

/* Projectiles: launch angle and speed. */
function PhyExProjectile() {
  const [U, setU] = React.useState(20), [ang, setAng] = React.useState(45); const [run, setRun] = React.useState(false);
  const r = ang * Math.PI / 180, ux = U * Math.cos(r), uy = U * Math.sin(r), T = 2 * uy / 10, R = ux * T, H = uy * uy / 20;
  const [t, setT] = usePhyClock(run, U + ":" + ang); React.useEffect(() => { if (t > T) setRun(false); }, [t, T]);
  /* One scale per launch SPEED, fitted to the longest throw that speed can make (U²/g, at 45°): the
     path fills the frame, yet 30° and 60° at one speed are drawn to the same scale, which is the
     comparison the prediction asks for. A fixed scale for the fastest throw drew most paths tiny. */
  const sc = 280 / Math.max(U * U / 10, 1), X = x => 20 + x * sc, Y = y => 165 - y * sc;
  const path = (ux2, uy2) => { const T2 = 2 * uy2 / 10; let q = ""; for (let k = 0; k <= 40; k++) { const t2 = T2 * k / 40; q += (k ? "L" : "M") + X(ux2 * t2).toFixed(1) + " " + Y(uy2 * t2 - 5 * t2 * t2).toFixed(1); } return q; };
  const p = path(ux, uy);
  // The throw before this one stays on the screen, faint, while the speed is unchanged.
  const prev = React.useRef(null), [ghost, setGhost] = React.useState(null);
  React.useEffect(() => { const pv = prev.current; if (pv && pv.U === U && pv.ang !== ang) setGhost(pv); else if (pv && pv.U !== U) setGhost(null); prev.current = { U, ang }; }, [U, ang]);
  const gr = ghost ? ghost.ang * Math.PI / 180 : 0;
  const step = [1, 2, 5, 10, 20, 50].find(v => v * sc >= 40) || 50, ticks = []; for (let m = step; X(m) <= 305; m += step) ticks.push(m);
  const tt = Math.min(t, T);
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 184" role="img" aria-label={"A ball launched at " + U + " m/s and " + ang + "°: range " + phyR(R, 1) + " m"}>
      <line x1="10" y1="165" x2="310" y2="165" className="phy-ground"/>
      {ticks.map(m => <g key={m}><line x1={X(m)} y1="165" x2={X(m)} y2="171" className="phy-ground"/><text x={X(m)} y="179" textAnchor="middle" className="mlb-dia-tick">{m} m</text></g>)}
      {ghost ? <g><path d={path(U * Math.cos(gr), U * Math.sin(gr))} className="phy-trace is-ghost"/><text x={X(U * U * Math.sin(2 * gr) / 10)} y="158" textAnchor="middle" className="mlb-dia-tick">last: {ghost.ang}°</text></g> : null}
      <path d={p} className="phy-trace"/>
      <circle cx={X(ux * tt)} cy={Y(Math.max(0, uy * tt - 5 * tt * tt))} r="7" className="phy-bob"/>
      <PhyArrow x1={X(0)} y1={Y(0)} x2={X(0) + 40 * Math.cos(r)} y2={Y(0) - 40 * Math.sin(r)} cls="is-1"/>
    </svg>
    <PhySl label="Launch speed" value={U} min={5} max={28} onChange={setU} fmt={v => v + " m/s"}/><PhySl label="Angle" value={ang} min={5} max={85} step={5} onChange={setAng} fmt={v => v + "°"}/>
    <button type="button" className="stt-btn" onClick={() => { setT(0); setRun(true); }}><i className="ph-fill ph-play" aria-hidden="true"/>Launch</button>
    <PhyOut>Time in the air <b>{phyR(T, 2)} s</b>, highest point <b>{phyR(H, 1)} m</b>, range <b>{phyR(R, 1)} m</b>. Sideways speed stays {phyR(ux, 1)} m/s all the way; only the up–down speed changes.</PhyOut>
  </div>;
}

/* The pendulum: length and gravity set the period; the mass does not. */
function PhyExPendulum() {
  const [L, setL] = React.useState(1), [g, setG] = React.useState(10), [m, setM] = React.useState(1); const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const T = 2 * Math.PI * Math.sqrt(L / g), th = 0.45 * Math.cos(2 * Math.PI * t / T), len = 40 + L * 55, x0 = 160, y0 = 15;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 200" role="img" aria-label={"A pendulum " + L + " m long, period " + phyR(T, 2) + " s"}>
      <line x1="110" y1={y0} x2="210" y2={y0} className="phy-ground"/><line x1={x0} y1={y0} x2={x0 + len * Math.sin(th)} y2={y0 + len * Math.cos(th)} className="phy-string"/>
      <circle cx={x0 + len * Math.sin(th)} cy={y0 + len * Math.cos(th)} r={8 + m * 2} className="phy-bob"/>
    </svg>
    <PhySl label="Length $L$" value={L} min={0.2} max={2.5} step={0.1} onChange={setL} fmt={v => phyR(v, 1) + " m"}/>
    <PhyToggle label="Where?" value={g} onChange={setG} options={[[10, "Earth (g = 10)"], [1.6, "Moon (1.6)"], [25, "Jupiter (25)"]]}/>
    <PhySl label="Mass of the bob" value={m} min={1} max={5} onChange={setM} fmt={v => v + " kg"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>Period T = 2π√(L/g) = <b>{phyR(T, 2)} s</b>. Change the mass: the period does not move. Make it 4 times longer: the period only doubles.</PhyOut>
  </div>;
}

/* Waves: frequency and wavelength make the speed. */
function PhyExWave() {
  const [f, setF] = React.useState(2), [lam, setLam] = React.useState(1.5), [kind, setKind] = React.useState("t"); const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const px = 80, k = 2 * Math.PI / (lam * px), w = 2 * Math.PI * f * 0.5;
  let p = ""; for (let x = 0; x <= 280; x += 3) p += (x ? "L" : "M") + (20 + x) + " " + (90 - 40 * Math.sin(k * x - w * t)).toFixed(1);
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={(kind === "t" ? "A transverse" : "A longitudinal") + " wave, " + f + " Hz, wavelength " + lam + " m"}>
      {kind === "t" ? <path d={p} className="phy-curve"/>
        : Array.from({ length: 46 }, (_, i) => { const x0 = 20 + i * 6.2, dx = 10 * Math.sin(k * x0 - w * t); return <line key={i} x1={x0 + dx} y1="50" x2={x0 + dx} y2="130" className="phy-coil-line"/>; })}
      <line x1="20" y1="160" x2={20 + lam * px} y2="160" className="phy-dim"/><text x={20 + lam * px / 2} y="176" textAnchor="middle" className="phy-sm">λ = {lam} m</text>
    </svg>
    <PhyToggle label="Kind of wave" value={kind} onChange={setKind} options={[["t", "Transverse (light, water)"], ["l", "Longitudinal (sound)"]]}/>
    <PhySl label="Frequency $f$" value={f} min={0.5} max={5} step={0.5} onChange={setF} fmt={v => v + " Hz"}/><PhySl label="Wavelength $\lambda$" value={lam} min={0.5} max={3} step={0.25} onChange={setLam} fmt={v => v + " m"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>Speed v = fλ = {f} × {lam} = <b>{phyR(f * lam, 2)} m/s</b>. {kind === "t" ? "The rope moves up and down; the wave moves along." : "The air squeezes and stretches along the direction the sound travels."}</PhyOut>
  </div>;
}

/* Circuits: series or parallel, and the current that flows. */
function PhyExCircuit() {
  const [E, setE] = React.useState(12), [r1, setR1] = React.useState(4), [r2, setR2] = React.useState(8), [lay, setLay] = React.useState("s"); const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const R = lay === "s" ? r1 + r2 : r1 * r2 / (r1 + r2), I = E / R, V1 = lay === "s" ? I * r1 : E, V2 = lay === "s" ? I * r2 : E;
  const per = [[40, 40], [280, 40], [280, 150], [40, 150]], L = 2 * (240 + 110);
  const at = s => { s = ((s % L) + L) % L; if (s < 240) return [40 + s, 40]; s -= 240; if (s < 110) return [280, 40 + s]; s -= 110; if (s < 240) return [280 - s, 150]; s -= 240; return [40, 150 - s]; };
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label={"A " + E + " V cell with " + r1 + " Ω and " + r2 + " Ω in " + (lay === "s" ? "series" : "parallel") + ": current " + phyR(I, 2) + " A"}>
      <path d={"M" + per.map(p => p.join(" ")).join(" L") + " Z"} className="phy-wire"/>
      <rect x="32" y="80" width="16" height="30" className="phy-gap"/><g transform="rotate(90 40 95)"><PhyCell x={40} y={95}/></g><text x="14" y="99" textAnchor="middle" className="phy-lbl">{E} V</text>
      {lay === "s" ? <g><PhyResistor x={130} y={40} label={r1 + " Ω"}/><PhyResistor x={210} y={40} label={r2 + " Ω"}/></g>
        : <g><line x1="160" y1="40" x2="160" y2="150" className="phy-wire"/><PhyResistor x={160} y={95} vertical label={r1 + " Ω"}/><PhyResistor x={280} y={95} vertical label={r2 + " Ω"}/></g>}
      {Array.from({ length: 14 }, (_, i) => { const [x, y] = at(i * L / 14 + t * 18 * I); return <circle key={i} cx={x} cy={y} r="3.5" className="phy-charge"/>; })}
    </svg>
    <PhyToggle label="How they are joined" value={lay} onChange={setLay} options={[["s", "Series"], ["p", "Parallel"]]}/>
    <PhySl label="Cell voltage" value={E} min={1.5} max={24} step={1.5} onChange={setE} fmt={v => v + " V"}/>
    <PhySl label="First resistor" value={r1} min={1} max={20} onChange={setR1} fmt={v => v + " Ω"}/><PhySl label="Second resistor" value={r2} min={1} max={20} onChange={setR2} fmt={v => v + " Ω"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>Total resistance <b>{phyR(R, 2)} Ω</b> ({lay === "s" ? "add them" : "product ÷ sum"}), so I = V/R = <b>{phyR(I, 2)} A</b> from the cell. Across each: {phyR(V1, 2)} V and {phyR(V2, 2)} V. The faster the dots, the bigger the current.</PhyOut>
  </div>;
}

/* Refraction: Snell's law, and the critical angle. */
function PhyExRefract() {
  const [i, setI] = React.useState(40), [n, setN] = React.useState(1.5), [from, setFrom] = React.useState("air");
  const n1 = from === "air" ? 1 : n, n2 = from === "air" ? n : 1, s = n1 * Math.sin(i * Math.PI / 180) / n2, tir = s > 1, r = tir ? 0 : Math.asin(s), C = Math.asin(1 / n) * 180 / Math.PI;
  const cx = 160, cy = 95, L = 80, ii = i * Math.PI / 180;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label={tir ? "Total internal reflection" : "Ray refracted at " + phyR(r * 180 / Math.PI, 1) + "°"}>
      <rect x="20" y={from === "air" ? cy : 5} width="280" height={from === "air" ? 90 : cy - 5} className="phy-glass"/><line x1="20" y1={cy} x2="300" y2={cy} className="phy-bound"/>
      <line x1={cx} y1="8" x2={cx} y2="185" className="phy-normal"/>
      <line x1={cx - L * Math.sin(ii)} y1={cy - L * Math.cos(ii)} x2={cx} y2={cy} className="phy-ray"/>
      {tir ? <line x1={cx} y1={cy} x2={cx + L * Math.sin(ii)} y2={cy - L * Math.cos(ii)} className="phy-ray"/> : <line x1={cx} y1={cy} x2={cx + L * Math.sin(r)} y2={cy + L * Math.cos(r)} className="phy-ray"/>}
      {!tir ? <line x1={cx} y1={cy} x2={cx + L * 0.6 * Math.sin(ii)} y2={cy - L * 0.6 * Math.cos(ii)} className="phy-ray is-faint"/> : null}
      <text x="28" y={cy - 8} className="phy-sm">{from === "air" ? "air" : "glass"}</text><text x="28" y={cy + 18} className="phy-sm">{from === "air" ? "glass" : "air"}</text>
    </svg>
    <PhyToggle label="Light goes from" value={from} onChange={setFrom} options={[["air", "Air into glass"], ["glass", "Glass into air"]]}/>
    <PhySl label="Angle of incidence $i$" value={i} min={0} max={85} onChange={setI} fmt={v => v + "°"}/><PhySl label="Refractive index $n$" value={n} min={1.1} max={2.4} step={0.05} onChange={setN} fmt={v => phyR(v, 2)}/>
    <PhyOut>{tir ? <span><b>Total internal reflection.</b> Past the critical angle ({phyR(C, 1)}°) no light gets out — this is how optical fibres carry the internet.</span>
      : <span>Refracted at <b>{phyR(r * 180 / Math.PI, 1)}°</b>. {from === "air" ? "Slowing down in glass, it bends towards the normal." : "Speeding up into air, it bends away from the normal. Critical angle: " + phyR(C, 1) + "°."}</span>}</PhyOut>
  </div>;
}

/* Lenses: move the object and watch the image. */
function PhyExLens() {
  const [u, setU] = React.useState(30), [f, setF] = React.useState(10);
  const v = u === f ? Infinity : u * f / (u - f), m = isFinite(v) ? v / u : Infinity, real = v > 0 && isFinite(v);
  return <div className="mlb-ex">
    <PhyDiagram d={{ type: "phy-lens", u, f }}/>
    <PhySl label="Object distance $u$" value={u} min={4} max={60} onChange={setU} fmt={v2 => v2 + " cm"}/><PhySl label="Focal length $f$" value={f} min={5} max={20} onChange={setF} fmt={v2 => v2 + " cm"}/>
    <PhyOut>{!isFinite(v) ? <span>At the focal point the rays come out parallel: <b>no image</b> (it is "at infinity").</span>
      : real ? <span>Real, upside-down image <b>{phyR(v, 1)} cm</b> behind the lens, magnification <b>{phyR(m, 2)}</b> — {m > 1 ? "bigger (a projector)" : m < 1 ? "smaller (a camera, your eye)" : "the same size (at 2f)"}.</span>
      : <span>Closer than f: a <b>virtual, upright, magnified</b> image on the same side ({phyR(-v, 1)} cm) — a magnifying glass. ×{phyR(-m, 2)}.</span>}</PhyOut>
  </div>;
}

/* Mirrors: angle in = angle out. */
function PhyExMirror() {
  const [i, setI] = React.useState(35);
  return <div className="mlb-ex"><PhyDiagram d={{ type: "phy-mirror", i, iLabel: i + "°", rLabel: i + "°" }}/>
    <PhySl label="Angle of incidence" value={i} min={0} max={80} onChange={setI} fmt={v => v + "°"}/>
    <PhyOut>Angle of reflection = <b>{i}°</b>, always equal, both measured from the dashed normal. At 0° the light comes straight back.</PhyOut></div>;
}

/* Moments: balance a see-saw. */
function PhyExMoments() {
  const [m1, setM1] = React.useState(30), [d1, setD1] = React.useState(40), [m2, setM2] = React.useState(20), [d2, setD2] = React.useState(50);
  const M1 = m1 * d1, M2 = m2 * d2, tilt = Math.max(-12, Math.min(12, (M2 - M1) / 80)), X = 160;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={"A see-saw: " + M1 + " N cm on the left, " + M2 + " N cm on the right"}>
      <path d={"M" + X + " 110 l-18 34 h36 z"} className="phy-pivot"/><line x1="40" y1="144" x2="280" y2="144" className="phy-ground"/>
      <g transform={"rotate(" + tilt + " " + X + " 108)"}><rect x="30" y="102" width="260" height="10" rx="3" className="phy-beam"/>
        <rect x={X - d1 * 2.4 - 14} y={102 - 12 - m1 / 3} width="28" height={12 + m1 / 3} rx="3" className="phy-mass"/><rect x={X + d2 * 2.4 - 14} y={102 - 12 - m2 / 3} width="28" height={12 + m2 / 3} rx="3" className="phy-mass is-b"/></g>
    </svg>
    <PhySl label="Left weight" value={m1} min={5} max={60} step={5} onChange={setM1} fmt={v => v + " N"}/><PhySl label="Left distance" value={d1} min={5} max={55} step={5} onChange={setD1} fmt={v => v + " cm"}/>
    <PhySl label="Right weight" value={m2} min={5} max={60} step={5} onChange={setM2} fmt={v => v + " N"}/><PhySl label="Right distance" value={d2} min={5} max={55} step={5} onChange={setD2} fmt={v => v + " cm"}/>
    <PhyOut>Anticlockwise {m1} × {d1} = <b>{M1}</b> N cm; clockwise {m2} × {d2} = <b>{M2}</b> N cm. {M1 === M2 ? "Balanced! Equal moments." : M1 > M2 ? "The left side wins: it tips left." : "The right side wins: it tips right."}</PhyOut>
  </div>;
}

/* Springs: Hooke's law, and past the elastic limit. */
function PhyExSpring() {
  const [F, setF] = React.useState(4), [k, setK] = React.useState(50);
  const lim = 0.4 * k, ext = F <= lim ? F / k : lim / k + (F - lim) / k * 3;
  return <div className="mlb-ex"><PhyDiagram d={{ type: "phy-spring", ext: ext * 100, load: F + " N", extLabel: phyR(ext * 100, 1) + " cm" }}/>
    <PhySl label="Load $F$" value={F} min={0} max={30} onChange={setF} fmt={v => v + " N"}/><PhySl label="Spring constant $k$" value={k} min={20} max={100} step={10} onChange={setK} fmt={v => v + " N/m"}/>
    <PhyOut>{F <= lim ? <span>Extension e = F/k = <b>{phyR(ext * 100, 1)} cm</b>. Double the load and the extension doubles.</span> : <span>Past the <b>elastic limit</b> ({phyR(lim, 0)} N): it stretches far more and will not go back to its old length.</span>}</PhyOut></div>;
}

/* Pressure in a liquid. */
function PhyExPressure() {
  const [h, setH] = React.useState(10), [rho, setRho] = React.useState(1000);
  const P = h * rho * 10;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label={"A diver " + h + " m down: pressure " + P + " Pa"}>
      <rect x="20" y="20" width="280" height="160" className="phy-liquid"/>{[0.25, 0.5, 0.75].map(z => <text key={z} x="290" y={20 + z * 160} textAnchor="end" className="phy-sm">{Math.round(z * 40)} m</text>)}
      <circle cx="160" cy={20 + h / 40 * 160} r="10" className="phy-bob"/>{[0, 1, 2, 3].map(q => { const a = q * Math.PI / 2, L = 10 + P / 30000; return <PhyArrow key={q} x1={160 + Math.cos(a) * (L + 14)} y1={20 + h / 40 * 160 + Math.sin(a) * (L + 14)} x2={160 + Math.cos(a) * 13} y2={20 + h / 40 * 160 + Math.sin(a) * 13} cls="is-3"/>; })}
    </svg>
    <PhySl label="Depth $h$" value={h} min={0} max={40} onChange={setH} fmt={v => v + " m"}/>
    <PhyToggle label="Liquid" value={rho} onChange={setRho} options={[[1000, "Fresh water"], [1030, "Sea water"], [800, "Kerosene"]]}/>
    <PhyOut>Pressure from the liquid P = hρg = <b>{P.toLocaleString("en-GB")} Pa</b>, pushing equally in every direction. Every 10 m of water adds about one atmosphere.</PhyOut>
  </div>;
}

/* Energy: a ball dropped — potential becomes kinetic. */
function PhyExEnergy() {
  const [m, setM] = React.useState(2), [h0, setH0] = React.useState(20), [run, setRun] = React.useState(false);
  const T = Math.sqrt(2 * h0 / 10), [t, setT] = usePhyClock(run, m + ":" + h0); React.useEffect(() => { if (t >= T) setRun(false); }, [t, T]);
  const tt = Math.min(t, T), h = h0 - 5 * tt * tt, v = 10 * tt, PE = m * 10 * h, KE = 0.5 * m * v * v, tot = m * 10 * h0;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label={"A " + m + " kg ball at " + phyR(h, 1) + " m: PE " + phyR(PE, 0) + " J, KE " + phyR(KE, 0) + " J"}>
      <line x1="20" y1="175" x2="180" y2="175" className="phy-ground"/><circle cx="80" cy={175 - 8 - h / h0 * 150} r="8" className="phy-bob"/>
      {[["PE", PE, "is-pe"], ["KE", KE, "is-ke"]].map(([l, e, c], k) => <g key={l}><rect x={210 + k * 45} y={175 - e / tot * 150} width="30" height={e / tot * 150} className={"phy-bar " + c}/><text x={225 + k * 45} y="188" textAnchor="middle" className="phy-sm">{l}</text></g>)}
    </svg>
    <PhySl label="Mass" value={m} min={1} max={10} onChange={setM} fmt={v2 => v2 + " kg"}/><PhySl label="Drop height" value={h0} min={5} max={45} step={5} onChange={setH0} fmt={v2 => v2 + " m"}/>
    <button type="button" className="stt-btn" onClick={() => { setT(0); setRun(true); }}><i className="ph-fill ph-play" aria-hidden="true"/>Drop it</button>
    <PhyOut>PE <b>{phyR(PE, 0)} J</b> + KE <b>{phyR(KE, 0)} J</b> = {phyR(tot, 0)} J all the way down: energy changes form, the total stays. It lands at {phyR(Math.sqrt(20 * h0), 1)} m/s, whatever the mass.</PhyOut>
  </div>;
}

/* Collisions: momentum before = momentum after. */
function PhyExCollide() {
  const [m1, setM1] = React.useState(2), [u1, setU1] = React.useState(6), [m2, setM2] = React.useState(1), [kind, setKind] = React.useState("stick"); const [run, setRun] = React.useState(false);
  const p = m1 * u1, vS = p / (m1 + m2), v1E = (m1 - m2) / (m1 + m2) * u1, v2E = 2 * m1 / (m1 + m2) * u1;
  const [t, setT] = usePhyClock(run, m1 + ":" + u1 + ":" + m2 + ":" + kind); React.useEffect(() => { if (t > 6) setRun(false); }, [t]);
  const hit = 100 / u1, x1 = t < hit ? 20 + u1 * t * 1.2 : 140 + (kind === "stick" ? vS : v1E) * (t - hit) * 1.2, x2 = t < hit ? 160 : 160 + (kind === "stick" ? vS : v2E) * (t - hit) * 1.2;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 120" role="img" aria-label={"A " + m1 + " kg cart at " + u1 + " m/s hits a " + m2 + " kg cart at rest"}>
      <line x1="10" y1="95" x2="310" y2="95" className="phy-ground"/>
      <rect x={Math.min(x1, 280)} y={85 - 16 - m1 * 3} width="20" height={16 + m1 * 3} rx="3" className="phy-mass"/><rect x={Math.min(x2, 290)} y={85 - 16 - m2 * 3} width="20" height={16 + m2 * 3} rx="3" className="phy-mass is-b"/>
    </svg>
    <PhyToggle label="Kind of collision" value={kind} onChange={setKind} options={[["stick", "They stick together"], ["bounce", "Perfectly bouncy"]]}/>
    <PhySl label="Mass of cart A" value={m1} min={1} max={6} onChange={setM1} fmt={v => v + " kg"}/><PhySl label="Speed of cart A" value={u1} min={1} max={10} onChange={setU1} fmt={v => v + " m/s"}/>
    <PhySl label="Mass of cart B (at rest)" value={m2} min={1} max={6} onChange={setM2} fmt={v => v + " kg"}/>
    <button type="button" className="stt-btn" onClick={() => { setT(0); setRun(true); }}><i className="ph-fill ph-play" aria-hidden="true"/>Crash</button>
    <PhyOut>Momentum before: {m1} × {u1} = <b>{p} kg m/s</b>. After: {kind === "stick" ? <span>both move at <b>{phyR(vS, 2)} m/s</b> ({m1 + m2} × {phyR(vS, 2)} = {p}).</span> : <span>A {phyR(v1E, 2)} m/s, B {phyR(v2E, 2)} m/s — total still {p}.</span>} {kind === "stick" ? "Kinetic energy is lost as heat and sound." : "Kinetic energy is kept too."}</PhyOut>
  </div>;
}

/* Circular motion: speed, radius and the pull to the centre. */
function PhyExCircle() {
  const [v, setV] = React.useState(4), [r, setR] = React.useState(2); const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const w = v / r, a = v * v / r, R = 30 + r * 22, th = w * t, x = 160 + R * Math.cos(th), y = 95 + R * Math.sin(th);
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 190" role="img" aria-label={"An object circling at " + v + " m/s, radius " + r + " m"}>
      <circle cx="160" cy="95" r={R} className="phy-dim is-faint"/><line x1="160" y1="95" x2={x} y2={y} className="phy-string"/><circle cx={x} cy={y} r="9" className="phy-bob"/>
      <PhyArrow x1={x} y1={y} x2={x - 30 * Math.sin(th)} y2={y + 30 * Math.cos(th)} cls="is-1"/><PhyArrow x1={x} y1={y} x2={x + (160 - x) * Math.min(0.8, 0.1 + a / 40)} y2={y + (95 - y) * Math.min(0.8, 0.1 + a / 40)} cls="is-3"/>
    </svg>
    <PhySl label="Speed $v$" value={v} min={1} max={10} onChange={setV} fmt={v2 => v2 + " m/s"}/><PhySl label="Radius $r$" value={r} min={1} max={3} step={0.5} onChange={setR} fmt={v2 => v2 + " m"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>Velocity along the circle (blue); the force and acceleration point to the centre (red): a = v²/r = <b>{phyR(a, 2)} m/s²</b>. Double the speed and the pull needed is four times as big.</PhyOut>
  </div>;
}

/* Heating: specific heat and latent heat on one curve. */
function PhyExHeating() {
  const [Q, setQ] = React.useState(200), m = 0.5;
  /* Ice at −20 °C → water → steam, in kJ: warm ice 21, melt 168, warm water 210, boil 1130. */
  const steps = [[21, "warming the ice", -20, 0], [168, "melting at 0 °C", 0, 0], [210, "warming the water", 0, 100], [1130, "boiling at 100 °C", 100, 100]];
  let left = Q, T = -20, phase = "warming the ice";
  for (const [q, name, a, b] of steps) { if (left <= q) { T = a + (b - a) * left / q; phase = name; left = -1; break; } left -= q; T = b; }
  if (left > 0) { T = 100 + left / (m * 2.01); phase = "warming the steam"; }
  return <div className="mlb-ex"><PhyDiagram d={{ type: "phy-heating" }}/>
    <PhySl label="Heat supplied to 0.5 kg of ice at −20 °C" value={Q} min={0} max={1700} step={10} onChange={setQ} fmt={v => v + " kJ"}/>
    <PhyOut>Now: <b>{phas(phase)}</b>, temperature <b>{phyR(T, 1)} °C</b>. On the flat parts the heat goes into changing the state (latent heat, Q = mL), not the temperature. Elsewhere Q = mcΔθ.</PhyOut></div>;
}
function phas(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* Gas laws: squeeze the gas. */
function PhyExGas() {
  const [V, setV] = React.useState(4), [T, setT2] = React.useState(300); const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const P = 100 * (300 / 4) * 4 / 300 * T / V * (4 / 4), W = 40 + V * 50;
  const pts = Array.from({ length: 18 }, (_, i) => { const s = Math.sqrt(T / 300) * 60, x = (i * 37 + t * s * (1 + (i % 3))) % (2 * (W - 12)), y = (i * 23 + t * s * (1 + (i % 4)) * 0.8) % 196; return [24 + (x > W - 12 ? 2 * (W - 12) - x : x), 22 + (y > 98 ? 196 - y : y)]; });
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 150" role="img" aria-label={"Gas in a cylinder: volume " + V + " L, " + T + " K, pressure " + phyR(P, 0) + " kPa"}>
      <path d={"M20 15 H300 M20 135 H300 M20 15 V135"} className="phy-wire is-thick"/><rect x={20 + W} y="17" width="12" height="116" className="phy-piston"/><rect x={32 + W} y="70" width={260 - W} height="10" className="phy-piston"/>
      {pts.map((p, i) => <circle key={i} cx={Math.min(p[0], 14 + W)} cy={p[1]} r="5" className="phy-part is-gas"/>)}
    </svg>
    <PhySl label="Volume" value={V} min={1} max={5} step={0.5} onChange={setV} fmt={v => v + " L"}/><PhySl label="Temperature" value={T} min={150} max={600} step={25} onChange={setT2} fmt={v => v + " K"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>Pressure <b>{phyR(P, 0)} kPa</b>. Halve the volume (same temperature) and the pressure doubles — Boyle’s law. Heat it (same volume) and the particles hit harder — the pressure law.</PhyOut>
  </div>;
}

/* Transformers: turns ratio. */
function PhyExTransformer() {
  const [Np, setNp] = React.useState(400), [Ns, setNs] = React.useState(20), [Vp, setVp] = React.useState(240);
  const Vs = Vp * Ns / Np;
  return <div className="mlb-ex"><PhyDiagram d={{ type: "phy-transformer", np: Np, ns: Ns, vp: Vp + " V", vs: phyR(Vs, 1) + " V", npDraw: Math.max(2, Math.round(Np / 100)), nsDraw: Math.max(2, Math.round(Ns / 100)) }}/>
    <PhySl label="Primary turns" value={Np} min={50} max={1200} step={50} onChange={setNp}/><PhySl label="Secondary turns" value={Ns} min={10} max={1200} step={10} onChange={setNs}/>
    <PhySl label="Primary voltage (a.c.)" value={Vp} min={12} max={240} step={12} onChange={setVp} fmt={v => v + " V"}/>
    <PhyOut>Vs = Vp × Ns/Np = <b>{phyR(Vs, 1)} V</b>: a <b>{Vs < Vp ? "step-down" : Vs > Vp ? "step-up" : "1 : 1"}</b> transformer. Your phone charger steps 240 V down; power stations step it up to send it far.</PhyOut></div>;
}

/* Half-life: watch atoms decay, at random, yet halving on time. */
function PhyExHalfLife() {
  const N0 = 200; const [T, setT2] = React.useState(4); const [on, setOn, reduced] = usePhyPlay(); const [t, setT] = usePhyClock(on, T);
  const life = React.useMemo(() => { let s = 7; return Array.from({ length: N0 }, () => { s = (s * 9301 + 49297) % 233280; return -Math.log(1 - s / 233280) / Math.LN2; }); }, []);
  const tt = t * 2, left = life.filter(l => l * T > tt).length;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 170" role="img" aria-label={left + " of " + N0 + " atoms left after " + phyR(tt, 1) + " days"}>
      {life.map((l, i) => <circle key={i} cx={18 + (i % 20) * 14.5} cy={16 + Math.floor(i / 20) * 14.5} r="5" className={"phy-atom" + (l * T > tt ? "" : " is-gone")}/>)}
    </svg>
    <PhySl label="Half-life" value={T} min={1} max={10} onChange={setT2} fmt={v => v + " days"}/>
    <div className="mlb-row"><PhyPlay on={on} setOn={setOn} reduced={reduced}/><button type="button" className="stt-btn" onClick={() => setT(0)}>Start again</button></div>
    <PhyOut>After <b>{phyR(tt, 1)} days</b> ({phyR(tt / T, 1)} half-lives): <b>{left}</b> of {N0} atoms left. Each atom decays at random, yet the whole sample halves every {T} days.</PhyOut>
  </div>;
}

/* Weight on other worlds. */
function PhyExWeight() {
  const [m, setM] = React.useState(40), [g, setG] = React.useState(10);
  return <div className="mlb-ex">
    <PhySl label="Your mass" value={m} min={10} max={100} onChange={setM} fmt={v => v + " kg"}/>
    <PhyToggle label="Where are you?" value={g} onChange={setG} options={[[10, "Earth"], [1.6, "Moon"], [3.7, "Mars"], [25, "Jupiter"]]}/>
    <PhyOut>Mass <b>{m} kg</b> everywhere — it is how much of you there is. Weight W = mg = <b>{phyR(m * g, 0)} N</b> here. On the Moon you could jump about six times higher.</PhyOut></div>;
}

/* Standing waves: a string's harmonics. */
function PhyExStanding() {
  const [n, setN] = React.useState(1), [L, setL] = React.useState(1), [v, setV] = React.useState(200), [kind, setKind] = React.useState("string"); const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const closed = kind === "closed", nn = closed ? 2 * n - 1 : n, lam = closed ? 4 * L / nn : 2 * L / nn, f = v / lam, x0 = 30, x1 = 290;
  let p = "", q = "";
  for (let k = 0; k <= 90; k++) { const s2 = k / 90, sp = closed ? Math.sin(nn * Math.PI / 2 * s2) : kind === "open" ? Math.cos(nn * Math.PI * s2) : Math.sin(nn * Math.PI * s2);
    const y = 45 * sp * Math.cos(2 * Math.PI * 1.2 * t); p += (k ? "L" : "M") + (x0 + (x1 - x0) * s2).toFixed(1) + " " + (90 - y).toFixed(1); q += (k ? "L" : "M") + (x0 + (x1 - x0) * s2).toFixed(1) + " " + (90 + y).toFixed(1); }
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 180" role="img" aria-label={kind + ", harmonic " + nn + ": frequency " + phyR(f, 1) + " Hz"}>
      {kind !== "string" ? <path d={"M" + x0 + " 38 H" + x1 + " M" + x0 + " 142 H" + x1} className="phy-wire is-thick"/> : <g><circle cx={x0} cy="90" r="4" className="phy-dot"/><circle cx={x1} cy="90" r="4" className="phy-dot"/></g>}
      {closed ? <line x1={x0} y1="36" x2={x0} y2="144" className="phy-wire is-thick"/> : null}
      <path d={p} className="phy-curve"/><path d={q} className="phy-curve is-faint"/>
      <text x="160" y="172" textAnchor="middle" className="phy-sm">λ = {phyR(lam, 2)} m</text>
    </svg>
    <PhyToggle label="What is vibrating?" value={kind} onChange={setKind} options={[["string", "String"], ["open", "Open pipe"], ["closed", "Closed pipe"]]}/>
    <PhySl label="Mode (1 = the lowest)" value={n} min={1} max={5} onChange={setN}/>
    <PhySl label="Length" value={L} min={0.25} max={2} step={0.25} onChange={setL} fmt={x => x + " m"}/><PhySl label="Wave speed" value={v} min={100} max={400} step={20} onChange={setV} fmt={x => x + " m/s"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>Harmonic <b>{nn}</b>: f = v/λ = <b>{phyR(f, 1)} Hz</b>. {closed ? "A closed pipe only makes the ODD harmonics: 1, 3, 5 …" : kind === "open" ? "An open pipe makes every harmonic: 1, 2, 3 …" : "A string fixed at both ends makes every harmonic."}</PhyOut>
  </div>;
}

/* The photoelectric effect: colour decides, brightness does not. */
function PhyExPhoto() {
  const [lam, setLam] = React.useState(400), [I, setI] = React.useState(3), [W, setW] = React.useState(2.3); const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const E = 1240 / lam, KE = E - W, out = KE > 0, hue = lam < 380 ? 270 : lam > 700 ? 0 : 270 - (lam - 380) / 320 * 270;
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 170" role="img" aria-label={"Light of " + lam + " nm on a metal with work function " + W + " eV: " + (out ? "electrons leave with up to " + phyR(KE, 2) + " eV" : "no electrons leave")}>
      <rect x="40" y="120" width="240" height="30" className="phy-core"/>
      {Array.from({ length: I * 2 }, (_, i) => { const x = 60 + i * 200 / (I * 2), y = ((t * 120 + i * 37) % 100); return <path key={i} d={"M" + (x - 20 + y * 0.2) + " " + (y + 10) + " q4 -6 8 0 t8 0"} style={{ stroke: "hsl(" + hue + ",85%,45%)" }} className="phy-photon"/>; })}
      {out ? Array.from({ length: I * 2 }, (_, i) => { const x = 70 + i * 190 / (I * 2), y = 118 - ((t * 40 * Math.sqrt(KE) + i * 23) % 100); return <circle key={"e" + i} cx={x} cy={y} r="4" className="phy-charge"/>; }) : null}
    </svg>
    <PhySl label="Wavelength (colour)" value={lam} min={200} max={700} step={10} onChange={setLam} fmt={x => x + " nm"}/>
    <PhySl label="Brightness" value={I} min={1} max={6} onChange={setI}/>
    <PhySl label="Work function of the metal" value={W} min={1.5} max={5} step={0.1} onChange={setW} fmt={x => phyR(x, 1) + " eV"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>Each photon carries E = 1240/λ = <b>{phyR(E, 2)} eV</b>. {out ? <span>Electrons leave with up to <b>{phyR(KE, 2)} eV</b>. Brighter light frees MORE of them, not faster ones.</span> : <span><b>No electrons</b>: each photon has less than the {phyR(W, 1)} eV needed — and making it brighter does not help.</span>}</PhyOut>
  </div>;
}

/* Orbits: further out, slower and longer. */
function PhyExOrbit() {
  const [r, setR] = React.useState(7), GM = 4e14; const [on, setOn, reduced] = usePhyPlay(); const [t] = usePhyClock(on);
  const v = Math.sqrt(GM / (r * 1e6)), T = 2 * Math.PI * r * 1e6 / v / 3600, R = 18 + r * 2.2, th = 2 * Math.PI * t / (T * 1.2);
  return <div className="mlb-ex">
    <svg className="mlb-dia phy-dia" viewBox="0 0 320 220" role="img" aria-label={"An orbit " + r + " × 10⁶ m from the Earth's centre: " + phyR(v / 1000, 2) + " km/s, period " + phyR(T, 1) + " hours"}>
      <circle cx="160" cy="110" r="14" className="phy-earth"/><circle cx="160" cy="110" r={R} className="phy-dim is-faint"/>
      <circle cx={160 + R * Math.cos(th)} cy={110 + R * Math.sin(th)} r="6" className="phy-bob"/>
    </svg>
    <PhySl label="Orbit radius" value={r} min={7} max={42} onChange={setR} fmt={x => x + " × 10⁶ m"}/>
    <PhyPlay on={on} setOn={setOn} reduced={reduced}/>
    <PhyOut>Speed v = √(GM/r) = <b>{phyR(v / 1000, 2)} km/s</b>; one orbit takes <b>{phyR(T, 1)} hours</b>. Further out is slower AND longer — at 42 × 10⁶ m it takes about a day: geostationary.</PhyOut>
  </div>;
}

/* A particle in a box: smaller box, bigger energy gaps. */
function PhyExBox() {
  const [L, setL] = React.useState(1), [n, setN] = React.useState(2);
  const E = k => 0.376 / (L * L) * k * k, dE = E(n) - E(1), lam = dE > 0 ? 1240 / dE : Infinity;
  return <div className="mlb-ex"><PhyDiagram d={{ type: "phy-box", n }}/>
    <PhySl label="Box width" value={L} min={0.3} max={3} step={0.1} onChange={setL} fmt={x => phyR(x, 1) + " nm"}/><PhySl label="Level n" value={n} min={1} max={5} onChange={setN}/>
    <PhyOut>Eₙ = n² × {phyR(E(1), 3)} eV, so E{n} = <b>{phyR(E(n), 3)} eV</b>. {n > 1 ? <span>Falling to n = 1 gives a photon of <b>{phyR(lam, 0)} nm</b>{lam >= 380 && lam <= 700 ? " — visible light" : lam < 380 ? " — ultraviolet" : " — infrared"}. Shrink the box and the light gets bluer.</span> : "Pick a higher level to see the photon it gives out when it falls."}</PhyOut></div>;
}

/* The registry: explorer → the Physics topics it serves. MLB_EXPLORE (mlb-app.jsx) merges it. */
const PHY_EXPLORE = {
  phyWeight: ["PH-004"], phyFloat: ["PH-005", "PH-039", "PH-040"], phyParticles: ["PH-007", "PH-008"], phyVectors: ["PH-009", "PH-011"],
  phyForces: ["PH-012", "PH-028", "PH-029"], phySpring: ["PH-013"], phyPressure: ["PH-014", "PH-015"], phyMoments: ["PH-016", "PH-017", "PH-018"],
  phyEnergy: ["PH-019", "PH-020", "PH-031", "PH-032", "PH-033", "PH-034"], phyMotion: ["PH-021", "PH-022", "PH-023", "PH-024", "PH-025"],
  phyProjectile: ["PH-026", "PH-027"], phyCollide: ["PH-030", "PH-035", "PH-036"], phyCircle: ["PH-037"], phyPendulum: ["PH-006", "PH-038"],
  phyHeating: ["PH-041", "PH-042", "PH-043", "PH-044"], phyGas: ["PH-045"], phyWave: ["PH-046", "PH-047"], phyMirror: ["PH-048"], phyRefract: ["PH-049"], phyLens: ["PH-050"],
  phyCircuit: ["PH-051", "PH-052", "PH-053", "PH-054", "PH-055", "PH-056"], phyTransformer: ["PH-057", "PH-058"], phyHalfLife: ["PH-059", "PH-060"],
  phyStanding: ["PH-063", "PH-064"], phyPhoto: ["PH-071", "PH-072"], phyOrbit: ["PH-067", "PH-083"], phyBox: ["PH-073", "PH-074", "PH-090"],
};
const PHY_EXPLORERS = {
  phyWeight: PhyExWeight, phyFloat: PhyExFloat, phyParticles: PhyExParticles, phyVectors: PhyExVectors, phyForces: PhyExForces, phySpring: PhyExSpring, phyPressure: PhyExPressure,
  phyMoments: PhyExMoments, phyEnergy: PhyExEnergy, phyMotion: PhyExMotion, phyProjectile: PhyExProjectile, phyCollide: PhyExCollide, phyCircle: PhyExCircle, phyPendulum: PhyExPendulum,
  phyHeating: PhyExHeating, phyGas: PhyExGas, phyWave: PhyExWave, phyMirror: PhyExMirror, phyRefract: PhyExRefract, phyLens: PhyExLens, phyCircuit: PhyExCircuit,
  phyTransformer: PhyExTransformer, phyHalfLife: PhyExHalfLife, phyStanding: PhyExStanding, phyPhoto: PhyExPhoto, phyOrbit: PhyExOrbit, phyBox: PhyExBox,
};
/* One thing to DO, and one thing to notice — words an eleven-year-old can follow. */
const PHY_TRY = {
  phyWeight: "Go to the Moon. Did your mass change? What about your weight?",
  phyFloat: "Make the block lighter than water, then heavier. Find the density where it is exactly half under.",
  phyParticles: "Cool it below 0 °C, then heat it past 100 °C. Watch how the particles move in each state.",
  phyVectors: "Set the angle to 0°, then 180°, then 90°. When is the resultant biggest? When is it smallest?",
  phyForces: "Turn friction up until the cart will not move. How hard do you have to push to start it again?",
  phySpring: "Double the load. Did the extension double too? Keep going past the elastic limit.",
  phyPressure: "Dive deeper. Does the pressure push only down, or every way?",
  phyMoments: "Put a heavy weight close to the pivot and a light one far away. Can you make them balance?",
  phyEnergy: "Drop it from twice as high. Is the landing speed twice as big?",
  phyMotion: "Make the acceleration 0. What shape is the graph? Now make it negative.",
  phyProjectile: "Try 30° and then 60° at the same speed. What do you notice about the range?",
  phyCollide: "Crash a heavy cart into a light one, then a light one into a heavy one. Watch who bounces back.",
  phyCircle: "Double the speed. How much bigger does the pull to the centre get?",
  phyPendulum: "Change the mass. Does the swing get faster? Now take it to the Moon.",
  phyHeating: "Find the two flat parts. What is happening to the water there?",
  phyGas: "Halve the volume. What happens to the pressure? Now heat it instead.",
  phyWave: "Double the frequency but keep the wavelength. What happens to the speed?",
  phyMirror: "Shine the light straight at the mirror (0°). Where does it go?",
  phyRefract: "Send light from glass into air and turn the angle up slowly. What happens past the critical angle?",
  phyLens: "Bring the object closer than the focal length. What kind of image do you get?",
  phyCircuit: "Switch from series to parallel. Does the current go up or down? Why?",
  phyTransformer: "Make the secondary coil have more turns than the primary. What kind of transformer is it now?",
  phyHalfLife: "Watch one row of atoms. Can you tell which will go next? Now count what is left after one half-life.",
  phyStanding: "Step the mode up from 1 to 3 on a string. Then switch to a closed pipe: which harmonics are missing?",
  phyPhoto: "Find the longest wavelength that still frees electrons. Now turn the brightness right up at a longer wavelength: does it help?",
  phyOrbit: "Move the satellite further out. Does it go faster or slower? Find the radius where one orbit takes a day.",
  phyBox: "Make the box smaller. What happens to the energy levels — and to the colour of the light?",
};

/* Predict, then see (owner, 6 Nov 2026: "Research!"). Physics-education research on
 * predict–observe–explain (POE) and PhET's interviews agree: a learner who commits to a guess FIRST
 * learns more from the simulation, because the surprise of a wrong guess is what gets explained.
 * So every Physics explorer opens with one question; the explorer then lets them see it happen, and
 * afterwards says whether the guess held and why. Every wrong option is a real misconception, in
 * the learner's own words. Nothing is marked or recorded — a prediction is never "failed". */
const PHY_PREDICT = {
  phyWeight: ["You fly to the Moon. What happens to your MASS?", ["It stays the same", "It gets about six times smaller", "It becomes zero"], 0, "Mass is how much matter you are made of; the Moon cannot remove any. Your WEIGHT (the pull of gravity) is what drops to about a sixth."],
  phyFloat: ["A huge log and a small iron nail are dropped into water. Which floats?", ["Only the log", "Only the nail, it is small", "Neither, the log is too heavy"], 0, "Size and weight do not decide it — density does. Wood is less dense than water; iron is much denser."],
  phyParticles: ["When ice melts into water, what happens to the particles?", ["They break free of their fixed places but still touch", "They get bigger", "They stop moving"], 0, "Heat gives the particles energy to slide past each other. They never grow; a liquid’s particles still touch."],
  phyVectors: ["Two people pull a box with 30 N each. Can the box feel LESS than 60 N?", ["Yes, if they pull at an angle to each other", "No, forces always add to 60 N", "Only if one lets go"], 0, "Forces add like arrows. At an angle part of each pull cancels; in opposite directions they cancel completely."],
  phyForces: ["A cart is pushed with a steady force on a smooth floor. What does it do?", ["Keeps speeding up", "Moves at a steady speed", "Slows down and stops"], 0, "A steady resultant force gives a steady ACCELERATION (F = ma), so the speed keeps rising. Constant speed needs zero resultant force."],
  phySpring: ["A 2 N load stretches a spring by 3 cm. How far will 4 N stretch it?", ["6 cm", "3 cm", "12 cm"], 0, "Up to its elastic limit a spring obeys Hooke’s law: double the force, double the extension."],
  phyPressure: ["A diver goes deeper. Which way does the water push on her?", ["Every way, more strongly the deeper she goes", "Only downwards, from the water above", "Only upwards"], 0, "Pressure in a liquid acts equally in all directions, and grows with depth: P = hρg."],
  phyMoments: ["Can a small child balance a heavy adult on a see-saw?", ["Yes, if the child sits much further from the pivot", "No, the heavier one always wins", "Only if they both sit at the ends"], 0, "Turning effect = force × distance. A light weight far from the pivot can match a heavy one close to it."],
  phyEnergy: ["A heavy ball and a light ball are dropped from the same height. Which lands faster?", ["They land at the same speed", "The heavy one", "The light one"], 0, "Each has PE = mgh turned into KE = ½mv²; the mass cancels, so v = √(2gh) for both (ignoring air)."],
  phyMotion: ["On a velocity–time graph, what does a flat, horizontal line mean?", ["Moving at a steady speed", "Standing still", "Speeding up"], 0, "Flat on a VELOCITY graph means the velocity is not changing. Standing still is a flat line on a DISTANCE graph — the two are easy to mix up."],
  phyProjectile: ["Same speed, two throws: one at 30°, one at 60°. Which goes further?", ["They land at the same distance", "60°, it goes higher", "30°, it is flatter"], 0, "Angles that add to 90° give the same range: one stays up longer, the other moves faster sideways."],
  phyCollide: ["A moving cart crashes into a still one and they stick. Afterwards they move…", ["More slowly than the first cart was", "Faster than the first cart was", "At the same speed as the first cart"], 0, "Momentum is shared: the same momentum now moves more mass, so the speed drops."],
  phyCircle: ["You whirl a stone on a string and let go. Which way does it fly?", ["Straight on, along the circle’s edge", "Straight outwards, away from the centre", "It keeps curving round"], 0, "With no string pulling, nothing turns it: it carries on in a straight line along the tangent (Newton’s first law)."],
  phyPendulum: ["You swap a pendulum’s bob for one twice as heavy. Its swing…", ["Takes the same time", "Gets faster", "Gets slower"], 0, "The period depends only on the length and g: T = 2π√(L/g). The mass is not in the formula."],
  phyHeating: ["A pot of water is boiling. You turn the heat up. Its temperature…", ["Stays at 100 °C", "Rises above 100 °C", "Drops"], 0, "While it boils, the extra heat goes into turning water to steam (latent heat), not into raising the temperature."],
  phyGas: ["You squeeze a sealed syringe of air to half its volume. The pressure…", ["Doubles", "Halves", "Stays the same"], 0, "Boyle’s law: at constant temperature pV stays the same, so half the volume means twice the pressure — the particles hit the walls twice as often."],
  phyWave: ["You shake a rope faster but the wave speed stays the same. The waves get…", ["Shorter", "Longer", "Taller"], 0, "v = fλ: with the speed fixed, more waves per second must each be shorter."],
  phyMirror: ["Light hits a mirror at 30° from the normal. It bounces off at…", ["30° on the other side of the normal", "60°", "90°, straight back"], 0, "The angle of reflection always equals the angle of incidence, both measured from the normal."],
  phyRefract: ["A ray of light goes at an angle from air into glass. It bends…", ["Towards the normal", "Away from the normal", "It does not bend"], 0, "Light slows down in glass, and slowing down bends it towards the normal."],
  phyLens: ["You move an object closer to a magnifying glass, inside its focal length. The image is…", ["Upright and bigger", "Upside down and smaller", "Not formed at all"], 0, "Inside f a converging lens makes a virtual, upright, magnified image — that is how a magnifying glass works."],
  phyCircuit: ["Two bulbs are moved from series to parallel on the same battery. The current from the battery…", ["Goes up", "Goes down", "Stays the same"], 0, "In parallel each bulb gets its own path, so the total resistance is smaller and more current flows."],
  phyTransformer: ["A transformer has 10 times more turns on its secondary coil. The output voltage is…", ["10 times bigger", "10 times smaller", "The same"], 0, "Vs/Vp = Ns/Np: more secondary turns, higher voltage — a step-up transformer."],
  phyStanding: ["A pipe closed at one end sounds its lowest note. What is the next note it can make?", ["Three times the frequency", "Twice the frequency", "Half the frequency"], 0, "A closed pipe can only fit odd numbers of quarter-wavelengths, so it makes 1×, 3×, 5× its lowest frequency — never 2×."],
  phyPhoto: ["Red light frees no electrons from a metal. You make the red light 100 times brighter. What happens?", ["Still no electrons", "Electrons start to come out", "Electrons come out very fast"], 0, "Each electron takes the energy of ONE photon, and a red photon is too small whatever the brightness. Only a higher frequency (bluer light) works."],
  phyOrbit: ["A satellite is moved to a higher orbit. Its speed…", ["Decreases", "Increases", "Stays the same"], 0, "Gravity is weaker further out, so less speed is needed to stay in orbit: v = √(GM/r)."],
  phyBox: ["A particle is trapped in a smaller box. Its lowest energy is…", ["Higher", "Lower", "The same"], 0, "A smaller box only fits shorter waves; shorter waves mean more momentum and more energy: E ∝ 1/L²."],
  phyHalfLife: ["A sample has a half-life of 2 days. After 4 days, how much is left?", ["A quarter", "None", "Half"], 0, "Each half-life halves what is left: ½ after 2 days, ¼ after 4. It never quite reaches zero."],
};
/** The predict card: one question before the explorer, the verdict after the learner has tried it. */
function PhyPredict({ k, tried, children }) {
  const p = PHY_PREDICT[k]; const [pick, setPick] = React.useState(null);
  if (!p) return children;
  const [q, opts, right, why] = p, ok = pick === right;
  /* Before a guess: the question and its options. After it: one line, "Your guess: …", so the
     figure comes up to where the eye already is instead of sitting under three spent buttons;
     once the learner has tried it, the line says whether the guess held and names the answer. */
  return <React.Fragment>
    {pick == null ? <div className="phy-predict" role="group" aria-labelledby={"phy-pq-" + k}>
      <p id={"phy-pq-" + k} className="phy-predict-q"><i className="ph-fill ph-question" aria-hidden="true"/> <b>Predict first:</b> {q}</p>
      <div className="phy-predict-opts">{opts.map((_, j) => (j + k.length) % opts.length).map(i => <button key={i} type="button" className="phy-predict-o" aria-pressed="false" onClick={() => setPick(i)}>{opts[i]}</button>)}</div>
      <p className="phy-predict-h">Pick your guess — then try it and see.</p>
    </div> : <div className={"phy-predict is-made" + (tried ? (ok ? " is-ok" : " is-no") : "")}>
      <p className="phy-predict-q"><i className={tried ? (ok ? "ph-fill ph-check-circle" : "ph-fill ph-x-circle") : "ph-fill ph-lightbulb"} aria-hidden="true"/> <span><b>Your guess:</b> {opts[pick]}{tried && !ok ? <React.Fragment> · <b>It is:</b> {opts[right]}</React.Fragment> : null}</span></p>
      <p className="phy-predict-qq">{q}</p>
    </div>}
    {pick != null ? children : null}
    {pick != null && tried ? <div className={"phy-predict-v" + (ok ? " is-ok" : "")} role="status" aria-live="polite">
      <b>{ok ? "Your prediction held." : "Surprised? Most people guess that too."}</b> {why}</div> : null}
  </React.Fragment>;
}
