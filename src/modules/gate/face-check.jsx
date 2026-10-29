/* ── The face check at the check-in desk ────────────────────────────────────
 *
 * After a card is scanned, the person on duty can compare the face in front of
 * them with the photo on that card's record. Everything happens in this
 * browser (vendor/human, @vladmandic/human 3.3.6): the record photo and the
 * camera are read here, compared here, and thrown away. The server receives
 * only the verdict and its scores (gate.face.log), for the audit trail.
 *
 * Two checks, both needed for a match:
 *   - SAME PERSON — similarity of the two face descriptors (0–1);
 *   - A REAL FACE — the anti-spoof and liveness models, so a photo or a phone
 *     screen held up to the camera does not pass.
 * It advises. The desk decides, and records what it decided.
 */
const FACE_DEFAULT_THRESHOLDS = { match: 0.60, unsure: 0.45, live: 0.50, real: 0.50 };
const FACE_SCAN_MS = 7000, FACE_SCAN_MAX_MS = 30000;
const FACE_MIN_FRAMES = 4;
let _faceHuman = null;

/** One Human instance for the page, configured for faces only. */
async function faceCheckEngine(onStage) {
  if (_faceHuman) return _faceHuman;
  onStage && onStage("Loading the face check (first time only)…");
  const lib = await loadVendor("human");
  const H = lib.Human || lib.default || lib;
  /* Every per-frame cache off (skipFrames/skipTime 0): with Human's defaults a
     descriptor computed for the record photo could be reused for the next
     camera frames, which would "match" anyone. No face mesh: the descriptor,
     anti-spoof and liveness models work from the detector's box, and dropping
     it saves 1.5 MB. The models are cached in the browser after the first use. */
  const fresh = { skipFrames: 0, skipTime: 0 };
  const make = (backend) => new H({
    modelBasePath: "/vendor/human/models/", backend, debug: false, async: true, warmup: "none", cacheSensitivity: 0, cacheModels: true,
    filter: { enabled: true, equalization: false },
    face: { enabled: true, detector: Object.assign({ rotation: false, maxDetected: 1, minConfidence: 0.5, return: false }, fresh),
      mesh: { enabled: false }, iris: { enabled: false }, attention: { enabled: false }, emotion: { enabled: false },
      description: Object.assign({ enabled: true }, fresh), antispoof: Object.assign({ enabled: true }, fresh), liveness: Object.assign({ enabled: true }, fresh) },
    body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false },
  });
  let h = make("webgl");
  try { await h.load(); }
  catch (_) { h = make("cpu"); await h.load(); }   // no WebGL on this device: slower, still correct
  _faceHuman = h;
  return h;
}

function faceLoadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!/^data:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("photo_unreadable"));
    img.src = src;
  });
}

/** The verdict from the scores — the same rule the server documents (FACE_CHECK_THRESHOLDS). */
function faceVerdict(s, t) {
  if (!s.frames) return "no_face";
  if (s.real < t.real || s.live < t.live) return "not_live";
  /* A face that was seen, but in too few frames to be sure (a slow phone that
     ran out of time), is never a match — and never "no face" either, which
     would send the desk to fix lighting that was fine. */
  if (s.similarity >= t.match) return s.frames >= FACE_MIN_FRAMES ? "match" : "unsure";
  if (s.similarity >= t.unsure) return "unsure";
  return "no_match";
}
const FACE_WORDS = {
  match: ["Looks like the same person", "The face matches the photo on the card's record."],
  unsure: ["Not sure", "The face is a weak match. Ask a question only they would know, or check another ID."],
  no_match: ["Does not look like the card's owner", "The face does not match the photo on the record. Check their identity another way before admitting."],
  not_live: ["Hold on — that may not be a live face", "It looked like a photo or a screen. Ask them to look straight at the camera, then try again."],
  no_face: ["No clear face seen", "Ask them to face the camera in good light, without a cap or mask, and try again."],
  no_photo: ["There is no usable photo on the record", "Nothing to compare with. Check their identity another way — and ask for a photo to be added."],
};

function FaceCheck({ gate, token, name, photo, thresholds, onClose }) {
  const t = Object.assign({}, FACE_DEFAULT_THRESHOLDS, thresholds || {});
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const boxRef = React.useRef(null);
  const from = React.useRef(document.activeElement);
  const [stage, setStage] = React.useState("Starting…");
  const [phase, setPhase] = React.useState("loading");      // loading | scanning | done | error
  const [res, setRes] = React.useState(null);               // {verdict, similarity, live, real, frames}
  const [err, setErr] = React.useState("");
  const [logged, setLogged] = React.useState(false);
  const stop = () => { const s = streamRef.current; if (s) s.getTracks().forEach(x => x.stop()); streamRef.current = null; };
  const close = (decision) => {
    stop();
    if (!logged && res) NGGApi.public.gate.faceLog(gate, token, { verdict: res.verdict, similarity: res.similarity, live: res.live, real: res.real, decision: decision || "" }).catch(() => {});
    else if (!logged && !res && phase !== "error") NGGApi.public.gate.faceLog(gate, token, { verdict: "skipped", decision: decision || "" }).catch(() => {});
    setLogged(true);
    onClose(res, decision);
    try { from.current && from.current.focus(); } catch (_) {}
  };
  const run = React.useCallback(async () => {
    setPhase("loading"); setErr(""); setRes(null);
    try {
      const h = await faceCheckEngine(setStage);
      if (!photo) { setRes({ verdict: "no_photo", frames: 0 }); setPhase("done"); return; }
      setStage("Reading the photo on the record…");
      let ref = null;
      try { const img = await faceLoadImage(photo); const r = await h.detect(img); ref = r && r.face && r.face[0] && r.face[0].embedding; } catch (_) { ref = null; }
      if (!ref || !ref.length) { setRes({ verdict: "no_photo", frames: 0 }); setPhase("done"); return; }
      setStage("Starting the camera…");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current; v.srcObject = stream; await v.play();
      setPhase("scanning"); setStage("Look at the camera…");
      const sims = []; let live = 0, real = 0, frames = 0;
      /* The window is FACE_SCAN_MS — but a slow device can take seconds per
         frame, so once a face is in view the scan keeps going until it has
         FACE_MIN_FRAMES of them, up to FACE_SCAN_MAX_MS. Ending on the clock
         alone told a slow desk "no face" while it was looking at one. */
      const t0 = Date.now();
      while (streamRef.current && (Date.now() - t0 < FACE_SCAN_MS || (frames > 0 && frames < FACE_MIN_FRAMES && Date.now() - t0 < FACE_SCAN_MAX_MS))) {
        const r = await h.detect(v);
        const f = r && r.face && r.face[0];
        if (f && f.embedding && f.embedding.length) {
          frames++;
          sims.push(h.match.similarity(ref, f.embedding));
          live = Math.max(live, f.live || 0); real = Math.max(real, f.real || 0);
          setStage(frames < FACE_MIN_FRAMES ? "Hold still…" : "Checking…");
          // A clear answer early ends the wait: three strong frames and a real, live face.
          if (frames >= FACE_MIN_FRAMES && sims.slice().sort((a, b) => b - a)[2] >= t.match && live >= t.live && real >= t.real) break;
        }
        await new Promise(r2 => setTimeout(r2, 120));
      }
      stop();
      const top = sims.slice().sort((a, b) => b - a).slice(0, 3);
      const similarity = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
      const out = { similarity: Math.round(similarity * 1000) / 1000, live: Math.round(live * 1000) / 1000, real: Math.round(real * 1000) / 1000, frames };
      out.verdict = faceVerdict(out, t);
      setRes(out); setPhase("done");
    } catch (e) {
      stop();
      const m = (e && (e.name || e.message)) || "";
      setErr(/NotAllowed|Permission/i.test(m) ? "The camera was not allowed. Allow it for this site in the browser, then try again."
        : /NotFound|Overconstrained/i.test(m) ? "No front camera found on this device."
        : /vendor|load|human/i.test(m) ? "The face check could not load. Check the connection and try again." : "The face check stopped: " + m);
      setPhase("error");
    }
  }, [photo]);
  React.useEffect(() => { run(); return stop; }, [run]);
  React.useEffect(() => {
    if (boxRef.current) boxRef.current.focus();
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(""); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [res, phase]);
  const w = res ? FACE_WORDS[res.verdict] : null;
  return (
    <div className="fc-veil">
      <div className="fc" role="dialog" aria-modal="true" aria-labelledby="fc-h" tabIndex={-1} ref={boxRef}>
        <header className="fc-head"><h2 id="fc-h">Face check · {name}</h2>
          <button type="button" className="fc-x" aria-label="Close the face check" onClick={() => close("")}><i className="ph ph-x" aria-hidden="true"/></button></header>
        <div className="fc-body">
          <div className="fc-pair">
            <figure className="fc-fig">{photo ? <img src={photo} alt={"Photo on " + name + "'s record"}/> : <span className="fc-none">No photo</span>}<figcaption>On the record</figcaption></figure>
            <figure className="fc-fig"><video ref={videoRef} muted playsInline aria-label="Camera" className={phase === "scanning" ? "is-live" : ""}/><figcaption>Camera</figcaption></figure>
          </div>
          {phase === "loading" || phase === "scanning" ? <p className="fc-stage" role="status" aria-live="polite"><span className="fc-spin" aria-hidden="true"/>{stage}</p> : null}
          {phase === "error" ? <div className="fc-out is-bad" role="alert"><b>{err}</b><button type="button" className="fc-btn" onClick={run}>Try again</button></div> : null}
          {phase === "done" && w ? <div className={"fc-out is-" + res.verdict} role="status" aria-live="assertive">
            <b>{w[0]}</b><p>{w[1]}</p>
            {res.frames ? <p className="fc-scores">Match {Math.round(res.similarity * 100)}% · real face {Math.round(res.real * 100)}% · live {Math.round(res.live * 100)}%</p> : null}
          </div> : null}
          <p className="fc-note">Runs on this device. No picture or face data is sent or kept — only the result. The face check advises; you decide.</p>
        </div>
        {phase === "done" || phase === "error" ? <footer className="fc-foot">
          {phase === "done" && res.verdict !== "match" && res.verdict !== "no_photo" ? <button type="button" className="fc-btn" onClick={run}>Check again</button> : null}
          <button type="button" className="fc-btn" onClick={() => close("held")}>Hold — check another way</button>
          <button type="button" className="fc-btn is-go" onClick={() => close("admitted")}>Admit</button>
        </footer> : null}
      </div>
    </div>
  );
}
