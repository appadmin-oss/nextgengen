/* ============================================================================
   ID Designer — draw a card, bind it to the roster, publish it.

   Three vendored libraries do the heavy lifting, all loaded on demand (see
   loadVendor in components.jsx) because together they are about 2MB and this is
   one admin screen:

     · Fabric 7.4      the design canvas — selection, transform, layers, text
     · Filerobot 5.0   the photo editor — crop, filters, finetune, annotate
     · TUI 3.15        the second photo engine — masks, icons, shape drawing

   Two photo editors is a deliberate choice rather than indecision: they are
   genuinely good at different things (Filerobot's finetune and crop presets;
   TUI's masking, icon overlays and free drawing) and a headshot that needs one
   rarely needs the other. Both hand back a PNG data URL through the same
   callback, so the rest of this file does not know which produced it.

   What this screen deliberately is NOT: a general drawing app. Every card it
   produces is a credential that a gate scanner and a coordinator across a hall
   both have to read, so the preflight in §Preflight is not advisory — publish
   refuses on an error, and it refuses again on the server.
   ============================================================================ */

const DSN_GOLD = "#F5B026";

/* A blank card, so "New design" is a card and not an empty rectangle: the frame,
   the panel and a QR that already passes preflight. Somebody who presses New and
   gets a white void has to know the schema to make progress. */
function dsnBlank(kind) {
  const vol = kind === "volunteer";
  return {
    id: "", name: vol ? "New volunteer card" : "New student card", kind: vol ? "volunteer" : "student",
    w: 590, h: 972, safe: 30, bleedMm: 3,
    background: vol ? "{{centre.color}}" : "#ffffff",
    elements: [
      { id: "panel", type: "rect", x: 30, y: 30, w: 530, h: 830, radius: 22, fill: "#ffffff" },
      { id: "photo", type: "image", x: 93, y: 120, w: 404, h: 318, radius: 22, fit: "cover", src: "{{photo}}", fill: "#eef0f4" },
      { id: "surname", type: "text", x: 83, y: 470, w: 424, h: 56, text: "{{surname}}", size: 50, weight: 800,
        color: "#1B2B6B", align: "center", letterSpacing: -1.2, transform: "upper", fit: true },
      { id: "role", type: "text", x: 83, y: 540, w: 424, h: 30, text: vol ? "{{roleFaculty}}" : "{{track}}",
        size: 18, weight: 700, color: "#5b6478", align: "center", letterSpacing: 2, transform: "upper", fit: true },
      { id: "qr", type: "qr", x: 246, y: 600, w: 98, h: 98, token: "{{token}}" },
      { id: "idvalue", type: "text", x: 83, y: 720, w: 424, text: "{{displayId}}", size: 18, weight: 500,
        color: "#5b6478", align: "center", font: "monospace" },
    ],
  };
}

/* A stand-in child, so the canvas shows a real card from the first frame rather
   than "{{surname}}" in a box. Replaced by an actual roster row the moment one
   is picked — a template proofed only against a sample name is a template that
   was never really proofed. */
const DSN_SAMPLE = {
  firstName: "Tunde", surname: "Bakare", fullName: "Tunde Bakare",
  displayId: "VOL-LED-26-001", handle: "tunde", track: "Piano", faculty: "Music",
  role: "Lead Mentor", token: "SAMPLE1", photoUrl: "",
  centre: { name: "Egbeda", code: "EG", color: "#D64545" },
  tier: { name: "Lead Mentor", code: "LED", color: "#8A1538" },
  expiresAt: "2026-10-29",
};

/** The QR for a token, as a data URL, using the encoder the cards already use.
 *  Cached per token: a designer drags an element twenty times a minute and each
 *  drag re-renders the canvas. */
const _dsnQr = {};
function dsnQrUrl(token) {
  const t = String(token || "").trim();
  if (!t) return "";
  if (_dsnQr[t]) return _dsnQr[t];
  try {
    const origin = (typeof window !== "undefined" && window.location) ? window.location.origin : "";
    const q = window.qrcode(0, "M");
    q.addData(origin + "/q/" + t);
    q.make();
    _dsnQr[t] = q.createDataURL(8, 0);
    return _dsnQr[t];
  } catch (_) { return ""; }
}

function DesignerPage() {
  /* Read through window, the way CardStudio does. `useAuth` is a top-level
     binding in the bundle, so a test fixture that stubs window.useAuth would be
     shadowed by the real one and this screen could never be driven signed-in. */
  const auth = (window.useAuth || (() => ({ isSignedIn: false })))();
  const isSignedIn = !!(auth && auth.isSignedIn);
  const [libs, setLibs] = React.useState(null);          // fabric, once loaded
  const [libErr, setLibErr] = React.useState("");
  const [list, setList] = React.useState(null);
  const [tpl, setTpl] = React.useState(null);
  const [selId, setSelId] = React.useState("");
  const [rows, setRows] = React.useState([]);            // real cards to preview against
  const [rowIdx, setRowIdx] = React.useState(-1);        // -1 = the sample
  const [problems, setProblems] = React.useState([]);
  const [busy, setBusy] = React.useState("");
  const [photoTool, setPhotoTool] = React.useState("");  // "" | "filerobot" | "tui"
  const hostRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const fabRef = React.useRef(null);

  const row = rowIdx >= 0 && rows[rowIdx] ? rows[rowIdx] : DSN_SAMPLE;

  /* Fabric is fetched when this screen opens and never before — it is 292KB for
     a page most admins never visit. */
  React.useEffect(() => {
    let dead = false;
    loadVendor("fabric").then(f => { if (!dead) setLibs({ fabric: f }); })
      .catch(e => { if (!dead) setLibErr(e.message || "could not load the design library"); });
    return () => { dead = true; };
  }, []);

  React.useEffect(() => {
    if (!isSignedIn) return;
    NGGApi.admin.registration.templates().then(r => setList(r.templates || [])).catch(() => setList([]));
    // Real children to proof against. Volunteers too — a volunteer template
    // proofed on a student row would never exercise the tier colour.
    Promise.all([
      NGGApi.admin.registration.cards().then(r => r.cards || []).catch(() => []),
      NGGApi.admin.registration.volunteerCards().then(r => r.cards || []).catch(() => []),
    ]).then(([a, b]) => setRows(a.concat(b)));
  }, [isSignedIn]);

  /* ── The canvas ───────────────────────────────────────────────────────────
     Rebuilt from the template on every change rather than mutated in place.
     Fabric can be driven incrementally, and doing so means the canvas and the
     template can disagree — which is the bug class this whole file exists to
     avoid. A card is 20 objects; redrawing is cheap and it cannot drift. */
  const redraw = React.useCallback(() => {
    if (!libs || !tpl || !hostRef.current) return;
    const fabric = libs.fabric;
    if (!canvasRef.current) {
      const el = document.createElement("canvas");
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(el);
      canvasRef.current = new fabric.Canvas(el, { preserveObjectStacking: true, selection: false });
      canvasRef.current.on("selection:created", e => setSelId((e.selected && e.selected[0] && e.selected[0].nggId) || ""));
      canvasRef.current.on("selection:updated", e => setSelId((e.selected && e.selected[0] && e.selected[0].nggId) || ""));
      canvasRef.current.on("selection:cleared", () => setSelId(""));
      /* Dragging writes back to the TEMPLATE, in design units, and the template
         redraws the canvas. The canvas is never the source of truth — that is
         what keeps the saved document and the picture identical. */
      canvasRef.current.on("object:modified", e => {
        const o = e.target; if (!o || !o.nggId) return;
        const s = canvasRef.current.__scale || 1;
        setTpl(prev => ({
          ...prev,
          elements: prev.elements.map(el2 => el2.id !== o.nggId ? el2 : {
            ...el2,
            x: Math.round(o.left / s), y: Math.round(o.top / s),
            w: Math.round((o.width * (o.scaleX || 1)) / s),
            h: Math.round((o.height * (o.scaleY || 1)) / s),
            rotation: Math.round(o.angle || 0),
          }),
        }));
      });
    }
    const c = canvasRef.current;
    const scale = 420 / (Number(tpl.w) || 590);
    c.__scale = scale;
    c.clear();
    window.tplToFabric(window.tplResolve(tpl, row), fabric, c, { scale, selectable: true, qrUrl: dsnQrUrl })
      .then(() => {
        if (!selId) return;
        const hit = c.getObjects().find(o => o.nggId === selId);
        if (hit) { c.setActiveObject(hit); c.renderAll(); }
      });
  }, [libs, tpl, row, selId]);

  React.useEffect(() => { redraw(); }, [redraw]);
  React.useEffect(() => () => { if (canvasRef.current) { canvasRef.current.dispose(); canvasRef.current = null; } }, []);

  // Preflight runs as you drag, not only at publish — a problem you learn about
  // when you press the last button is a problem you learn about too late.
  React.useEffect(() => {
    if (!tpl) return setProblems([]);
    setProblems(window.tplPreflight(tpl, rows.slice(0, 200), window.TPL_REQUIRED[tpl.kind] || []));
  }, [tpl, rows]);

  const sel = tpl && tpl.elements.find(e => e.id === selId);
  const patch = (id, changes) => setTpl(p => ({ ...p, elements: p.elements.map(e => e.id === id ? { ...e, ...changes } : e) }));

  const open = async (templateId) => {
    if (templateId === "__new_student") return setTpl(dsnBlank("student"));
    if (templateId === "__new_volunteer") return setTpl(dsnBlank("volunteer"));
    const sys = window.TPL_SYSTEM.find(t => t.id === templateId);
    if (sys) return setTpl(JSON.parse(JSON.stringify(sys)));
    try {
      const r = await NGGApi.admin.registration.template(templateId);
      setTpl(r.template && (r.template.schema || r.template.published));
    } catch (e) { toast.error(e.code || e.message); }
  };

  const save = async () => {
    if (!tpl) return;
    setBusy("save");
    try {
      const r = await NGGApi.admin.registration.templateSave(tpl.id || "", tpl);
      setTpl(p => ({ ...p, id: r.templateId }));
      toast.success(r.forked ? "Saved as a copy — the standard design is untouched" : "Saved");
      NGGApi.admin.registration.templates().then(x => setList(x.templates || []));
    } catch (e) { toast.error(e.code || e.message); } finally { setBusy(""); }
  };

  const publish = async () => {
    if (!tpl || !tpl.id) { toast.error("Save it first"); return; }
    setBusy("publish");
    try {
      const r = await NGGApi.admin.registration.templatePublish(tpl.id);
      toast.success("Published as version " + r.version);
      NGGApi.admin.registration.templates().then(x => setList(x.templates || []));
    } catch (e) {
      // The server ran the same preflight and refused. Show WHAT it refused on.
      if (e.data && e.data.problems) setProblems(e.data.problems);
      toast.error(e.code === "preflight" ? "Fix the errors below first" : (e.code || e.message));
    } finally { setBusy(""); }
  };

  /* ── The photo editors ────────────────────────────────────────────────────
     Both open on the selected image element and hand back a PNG data URL, which
     replaces that element's src. Editing the artwork, not the child's stored
     photograph: a template's background texture and a headshot are the same kind
     of object here, and nothing written by this screen touches photo_assets. */
  const openFilerobot = async () => {
    if (!sel || sel.type !== "image") return;
    setBusy("photo");
    try {
      const FIE = await loadVendor("filerobot");
      const host = document.getElementById("dsn-photo-host");
      const src = window.tplBindValue(sel.src, row) || "/assets/idcard/blank.png";
      const editor = new FIE(host, {
        source: src,
        onSave: (out) => { patch(sel.id, { src: out.imageBase64 || out.imageSrc }); setPhotoTool(""); editor.terminate(); },
        onClose: () => { setPhotoTool(""); editor.terminate(); },
        annotationsCommon: { fill: "#1B2B6B" },
        Text: { text: "" },
        tabsIds: [FIE.TABS.ADJUST, FIE.TABS.FINETUNE, FIE.TABS.FILTERS, FIE.TABS.ANNOTATE, FIE.TABS.RESIZE],
        defaultTabId: FIE.TABS.ADJUST,
        defaultToolId: FIE.TOOLS.CROP,
        savingPixelRatio: 2, previewPixelRatio: 2,
      });
      setPhotoTool("filerobot");
      editor.render();
    } catch (e) { toast.error(e.message || "could not open the photo editor"); } finally { setBusy(""); }
  };

  const openTui = async () => {
    if (!sel || sel.type !== "image") return;
    setBusy("photo");
    try {
      await loadVendor("tui");
      const host = document.getElementById("dsn-photo-host");
      host.innerHTML = "";
      const src = window.tplBindValue(sel.src, row) || "/assets/idcard/blank.png";
      const ed = new window.tui.ImageEditor(host, {
        includeUI: {
          loadImage: { path: src, name: "photo" },
          theme: {}, initMenu: "filter", menuBarPosition: "bottom",
          uiSize: { width: "100%", height: "560px" },
        },
        cssMaxWidth: 900, cssMaxHeight: 520,
        usageStatistics: false,      // no phone-home from an admin console
      });
      setPhotoTool("tui");
      window.__dsnTui = { ed, elId: sel.id };
    } catch (e) { toast.error(e.message || "could not open the photo editor"); } finally { setBusy(""); }
  };
  const applyTui = () => {
    const t = window.__dsnTui;
    if (!t) return;
    patch(t.elId, { src: t.ed.toDataURL() });
    t.ed.destroy(); window.__dsnTui = null; setPhotoTool("");
  };
  const closeTui = () => {
    const t = window.__dsnTui;
    if (t) { t.ed.destroy(); window.__dsnTui = null; }
    setPhotoTool("");
  };

  const addElement = (type) => {
    const id = type + "-" + Math.random().toString(36).slice(2, 7);
    const base = { id, type, x: 120, y: 120, rotation: 0 };
    const made = type === "text"
      ? { ...base, w: 300, h: 40, text: "New text", size: 28, weight: 700, color: "#101010", align: "center", fit: true }
      : type === "image" ? { ...base, w: 240, h: 240, fit: "cover", src: "", fill: "#eef0f4", radius: 8 }
      : type === "qr" ? { ...base, w: 98, h: 98, token: "{{token}}" }
      : type === "ellipse" ? { ...base, w: 160, h: 160, fill: DSN_GOLD }
      : { ...base, w: 200, h: 120, fill: DSN_GOLD, radius: 8 };
    setTpl(p => ({ ...p, elements: p.elements.concat([made]) }));
    setSelId(id);
  };
  const removeElement = (id) => { setTpl(p => ({ ...p, elements: p.elements.filter(e => e.id !== id) })); setSelId(""); };
  const move = (id, dir) => setTpl(p => {
    const i = p.elements.findIndex(e => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.elements.length) return p;
    const els = p.elements.slice();
    els.splice(j, 0, els.splice(i, 1)[0]);
    return { ...p, elements: els };
  });

  /* Export the card the designer is looking at, at print resolution — Fabric's
     own renderer at a multiplier, not a screenshot of the screen. Same function
     that drew the canvas, so the file cannot differ from the proof. */
  const exportPng = async (dpi) => {
    if (!tpl || !libs) return;
    setBusy("export");
    try {
      const fabric = libs.fabric;
      const el = document.createElement("canvas");
      const c = new fabric.StaticCanvas(el);
      // 590 units = 54mm. At `dpi`, that is 54/25.4*dpi pixels.
      const scale = (54 / 25.4 * dpi) / (Number(tpl.w) || 590);
      await window.tplToFabric(window.tplResolve(tpl, row), fabric, c, { scale, qrUrl: dsnQrUrl });
      const url = c.toDataURL({ format: "png", multiplier: 1 });
      const a = document.createElement("a");
      a.href = url;
      a.download = (tpl.name || "card").replace(/\W+/g, "-").toLowerCase() + "-" + dpi + "dpi.png";
      a.click();
      c.dispose();
    } catch (e) { toast.error(e.message || "export failed"); } finally { setBusy(""); }
  };

  /* The studio's own shell rather than a new one — the designer is the same
     surface as the card studio and a second chrome would read as a second app. */
  const shell = (ch) => (
    <div style={{ minHeight: "100vh", background: "#0b1327", color: "#eef2fb", fontFamily: "var(--font-body, system-ui, sans-serif)", padding: "26px 20px 80px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ font: "700 10px var(--font-mono, monospace)", letterSpacing: ".2em", color: DSN_GOLD }}>ID DESIGNER</div>
        <h1 style={{ fontSize: 24, margin: "4px 0 14px", fontWeight: 800 }}>Design an ID card</h1>
        {ch}
      </div>
    </div>
  );

  if (!isSignedIn) return shell(<div style={{ textAlign: "center", padding: "80px 0" }}><h1 style={{ fontSize: 20 }}>Staff sign-in required</h1></div>);

  const errs = problems.filter(p => p.level === "error");
  const warns = problems.filter(p => p.level === "warn");

  return shell(
    <>
      {libErr && <ErrorState title="The design library did not load" message={libErr} onRetry={() => location.reload()}/>}

      <div className="dsn-bar">
        <select className="admin-select" value={tpl && tpl.id ? tpl.id : ""} aria-label="Open a design"
          onChange={e => open(e.target.value)}>
          <option value="">Open a design…</option>
          <optgroup label="Start from">
            <option value="__new_student">New student card</option>
            <option value="__new_volunteer">New volunteer card</option>
          </optgroup>
          <optgroup label="Standard designs (duplicate to edit)">
            {window.TPL_SYSTEM.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
          {(list || []).length > 0 && <optgroup label="Your designs">
            {(list || []).map(t => <option key={t.templateId} value={t.templateId}>{t.name}{t.status === "published" ? " · v" + t.version : " · draft"}</option>)}
          </optgroup>}
        </select>
        {tpl && <>
          <input className="admin-input" value={tpl.name} aria-label="Design name" style={{ maxWidth: 240 }}
            onChange={e => setTpl(p => ({ ...p, name: e.target.value }))}/>
          {/* Proof against a REAL child, not only the sample. This is the control
              that turns "it looks right" into "it is right for this cohort". */}
          <select className="admin-select" value={rowIdx} aria-label="Preview with"
            onChange={e => setRowIdx(Number(e.target.value))} style={{ maxWidth: 240 }}>
            <option value={-1}>Sample data</option>
            {rows.slice(0, 300).map((r, i) => (
              <option key={i} value={i}>{[r.firstName, r.surname].filter(Boolean).join(" ") || r.displayId}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={save}>{busy === "save" ? "…" : "Save"}</button>
          <button className="btn btn-primary btn-sm" disabled={!!busy || errs.length > 0} onClick={publish}
            title={errs.length ? "Fix the errors first" : "Freeze this design for print runs"}>
            {busy === "publish" ? "…" : "Publish"}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => exportPng(300)}>PNG 300 DPI</button>
        </>}
      </div>

      {!tpl && <div className="admin-empty">Pick a design to open, or start a new one.</div>}

      {tpl && (
        <div className="dsn-grid">
          {/* ── Layers ─────────────────────────────────────────────────── */}
          <div className="dsn-rail">
            <div className="dsn-rail-head">Layers</div>
            {tpl.elements.slice().reverse().map(el => (
              <button key={el.id} className={"dsn-layer" + (el.id === selId ? " is-on" : "")}
                onClick={() => setSelId(el.id)}>
                <span className="dsn-layer-type">{el.type}</span>
                <span className="dsn-layer-name">{el.type === "text" ? String(el.text || "").slice(0, 22) : el.id}</span>
                {el.bind || /\{\{/.test(String(el.text || el.src || "")) ? <span className="dsn-bound">bound</span> : null}
              </button>
            ))}
            <div className="dsn-rail-head" style={{ marginTop: 14 }}>Add</div>
            <div className="dsn-adds">
              {["text", "rect", "ellipse", "image", "qr"].map(t => (
                <button key={t} className="btn btn-ghost btn-sm" onClick={() => addElement(t)}>{t}</button>
              ))}
            </div>
          </div>

          {/* ── Canvas ─────────────────────────────────────────────────── */}
          <div className="dsn-stage">
            <div ref={hostRef} className="dsn-canvas-host" aria-label="Card design canvas"/>
            <div className="dsn-stage-note">
              {tpl.w} × {tpl.h} design units · {tpl.safe}-unit safe area · {tpl.bleedMm}mm bleed
            </div>
          </div>

          {/* ── Properties + bind ──────────────────────────────────────── */}
          <div className="dsn-rail">
            <div className="dsn-rail-head">{sel ? sel.type + " · " + sel.id : "Nothing selected"}</div>
            {!sel && <p className="dsn-hint">Pick a layer or click the card.</p>}
            {sel && <>
              <div className="dsn-props">
                {["x", "y", "w", "h"].map(k => (
                  <label key={k} className="dsn-prop"><span>{k.toUpperCase()}</span>
                    <input type="number" value={sel[k] == null ? "" : sel[k]}
                      onChange={e => patch(sel.id, { [k]: Number(e.target.value) })}/></label>
                ))}
              </div>
              {sel.type === "text" && <>
                <label className="dsn-prop-wide"><span>Text</span>
                  <input value={sel.text || ""} onChange={e => patch(sel.id, { text: e.target.value })}/></label>
                {/* The bind picker — the thing that makes this an ID designer
                    rather than a drawing app. Choosing a field replaces the
                    text with its token, and the canvas immediately shows the
                    previewed child's real value. */}
                <label className="dsn-prop-wide"><span>Show which field</span>
                  <select value={(String(sel.text || "").match(/^\{\{\s*([\w.]+)\s*\}\}$/) || ["", ""])[1]}
                    onChange={e => patch(sel.id, { text: e.target.value ? "{{" + e.target.value + "}}" : "Text" })}>
                    <option value="">Fixed text</option>
                    {Object.keys(window.TPL_FIELDS).filter(k => !window.TPL_FIELDS[k].isColor && !window.TPL_FIELDS[k].isImage)
                      .map(k => <option key={k} value={k}>{window.TPL_FIELDS[k].label}</option>)}
                  </select></label>
                <div className="dsn-props">
                  <label className="dsn-prop"><span>Size</span>
                    <input type="number" value={sel.size || 24} onChange={e => patch(sel.id, { size: Number(e.target.value) })}/></label>
                  <label className="dsn-prop"><span>Weight</span>
                    <input type="number" step={100} value={sel.weight || 400} onChange={e => patch(sel.id, { weight: Number(e.target.value) })}/></label>
                  <label className="dsn-prop"><span>Track</span>
                    <input type="number" step={0.1} value={sel.letterSpacing || 0} onChange={e => patch(sel.id, { letterSpacing: Number(e.target.value) })}/></label>
                  <label className="dsn-prop"><span>Colour</span>
                    <input type="color" value={/^#/.test(sel.color || "") ? sel.color : "#101010"}
                      onChange={e => patch(sel.id, { color: e.target.value })}/></label>
                </div>
                <label className="dsn-check"><input type="checkbox" checked={!!sel.fit}
                  onChange={e => patch(sel.id, { fit: e.target.checked })}/> Shrink to fit the box</label>
                <label className="dsn-check"><input type="checkbox" checked={sel.transform === "upper"}
                  onChange={e => patch(sel.id, { transform: e.target.checked ? "upper" : "" })}/> Uppercase</label>
                {/* Ink that reads its own background, exposed as a choice
                    because the colour underneath is admin-picked AFTER the
                    design is drawn. */}
                <label className="dsn-prop-wide"><span>Or take ink from</span>
                  <select value={/^\{\{ink\./.test(sel.color || "") ? sel.color : ""}
                    onChange={e => patch(sel.id, { color: e.target.value || "#101010" })}>
                    <option value="">A fixed colour</option>
                    <option value="{{ink.centre}}">Whatever the centre colour is</option>
                    <option value="{{ink.tier}}">Whatever the tier colour is</option>
                  </select></label>
              </>}
              {(sel.type === "rect" || sel.type === "ellipse") && (
                <div className="dsn-props">
                  <label className="dsn-prop"><span>Fill</span>
                    <input type="color" value={/^#/.test(sel.fill || "") ? sel.fill : "#cccccc"}
                      onChange={e => patch(sel.id, { fill: e.target.value })}/></label>
                  <label className="dsn-prop"><span>Radius</span>
                    <input type="number" value={sel.radius || 0} onChange={e => patch(sel.id, { radius: Number(e.target.value) })}/></label>
                  <label className="dsn-prop-wide" style={{ gridColumn: "1 / -1" }}><span>Or the colour of</span>
                    <select value={/^\{\{/.test(sel.fill || "") ? sel.fill : ""}
                      onChange={e => patch(sel.id, { fill: e.target.value || "#cccccc" })}>
                      <option value="">A fixed colour</option>
                      <option value="{{centre.color}}">The centre</option>
                      <option value="{{tier.color}}">The tier</option>
                    </select></label>
                </div>
              )}
              {sel.type === "image" && <>
                <label className="dsn-prop-wide"><span>Picture</span>
                  <select value={sel.src === "{{photo}}" ? "{{photo}}" : ""}
                    onChange={e => patch(sel.id, { src: e.target.value })}>
                    <option value="">A fixed picture</option>
                    <option value="{{photo}}">This child's photograph</option>
                  </select></label>
                <div className="dsn-adds">
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={openFilerobot}>Edit photo (Filerobot)</button>
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={openTui}>Masks & icons (TUI)</button>
                </div>
              </>}
              <div className="dsn-adds" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => move(sel.id, 1)}>Bring forward</button>
                <button className="btn btn-ghost btn-sm" onClick={() => move(sel.id, -1)}>Send back</button>
                <button className="btn btn-ghost btn-sm" onClick={() => removeElement(sel.id)}>Delete</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* ── Preflight ──────────────────────────────────────────────────────
          Live, not a gate at the end. Errors block publish here AND on the
          server; warnings are said and allowed, because "this may be trimmed"
          is sometimes exactly what a designer meant. */}
      {tpl && (
        <div className={"dsn-flight" + (errs.length ? " is-bad" : warns.length ? " is-warn" : " is-ok")}>
          <b>{errs.length ? errs.length + " problem" + (errs.length === 1 ? "" : "s") + " to fix before this can print"
            : warns.length ? warns.length + " thing" + (warns.length === 1 ? "" : "s") + " to look at"
            : "Ready to print"}</b>
          <ul>
            {errs.concat(warns).slice(0, 10).map((p, i) => (
              <li key={i} className={p.level === "error" ? "is-bad" : ""}>
                {p.message}{p.elId ? " (" + p.elId + ")" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The photo editors mount here. Kept in the DOM at all times but hidden,
          because Filerobot's createRoot needs a real element with layout. */}
      <div className={"dsn-photo" + (photoTool ? " is-open" : "")}>
        <div className="dsn-photo-bar">
          <b>{photoTool === "tui" ? "Masks, icons & drawing" : "Photo editor"}</b>
          {photoTool === "tui" && <button className="btn btn-primary btn-sm" onClick={applyTui}>Use this image</button>}
          <button className="btn btn-ghost btn-sm" onClick={photoTool === "tui" ? closeTui : () => setPhotoTool("")}>Close</button>
        </div>
        <div id="dsn-photo-host" style={{ minHeight: photoTool ? 560 : 0 }}/>
      </div>
    </>
  );
}

Object.assign(window, { DesignerPage, dsnBlank, dsnQrUrl, DSN_SAMPLE });
