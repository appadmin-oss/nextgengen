/* ============================================================================
   Control Room v2 — the community and announcement tabs (Community, Announcements pages). Filled into CR_TAB_DEFS (see cr-pages.jsx).
   ========================================================================== */
/* Each tab mounts the panel that served it in v1 (page-admin.jsx) through
   crPanel, until it is rebuilt as blocks — so nothing v1 did is lost. */
Object.assign(CR_TAB_DEFS, {
  community: crPanel(() => <AdminCommunity/>),
});

/* ── Announcements, native ───────────────────────────────────────────────────
   Was AdminBroadcast mounted whole, with two centres typed into its audience list
   (and into the server: admin_broadcast_audience says what went wrong with that).
   The audiences now come from the server with the number of active members each
   reaches, so the confirm says how many people it is about to tell. An
   announcement always lands in the app; email is the optional second channel.
   There is no recall, so it is confirmed — with the count — before it goes. */
function crAnnSend(ctx) {
  const d = ctx.data || {}, aud = d.audiences || [];
  const label = id => { const a = aud.find(x => x.id === id); return a ? (a.id === "all" ? "everyone" : a.l) + " (" + crNum(a.n) + ")" : id; };
  ctx.form({
    title: "Quick message", submit: "Send", busyLabel: "Sending…",
    intro: "It appears in members’ notification feed, and — unless you turn it off — as a pinned announcement in Community. Email is optional and limited to 300 at a time.",
    values: { title: "", body: "", audience: "all", linkPage: "", email: false, community: true },
    fields: [
      { id: "title", l: "Title", req: true, max: 140 },
      { id: "body", l: "Message", type: "textarea", rows: 5, max: 2000 },
      { id: "audience", l: "Who gets it", type: "select", req: true, opts: aud.map(a => [a.id, (a.id === "all" ? "Everyone" : a.l) + " · " + crNum(a.n)]) },
      { id: "linkPage", l: "Open a page when tapped", ph: "anchor, dashboard, blog…", max: 60 },
      { id: "email", l: "Email it as well", type: "switch" },
      /* Community is every NGG centre's space: a message for one centre says so in its first line there. */
      { id: "community", l: "Show it in Community", type: "switch", help: "A pinned announcement in the commons, posted as you. Not for a Summer School-only message — Community is for NGG members." },
    ],
    onSubmit: async v => {
      const ok = await ctx.confirm({ title: "Send to " + label(v.audience) + "?", body: "“" + v.title + "” goes to their notification feed" + (v.email ? " and their inbox" : "") + (v.community ? ", and is pinned in Community" : "") + ". It can’t be recalled.", cta: "Send" });
      if (!ok) return { fieldErrors: {} };
      const r = await NGGApi.admin.broadcast({ title: v.title.trim(), body: v.body, audience: v.audience, linkPage: v.linkPage.trim(), email: !!v.email, community: !!v.community });
      ctx.reload();
      return r;
    },
    done: (v, r) => "Sent to " + label(v.audience) + (v.email ? " · emailed " + crNum((r && r.emailed) || 0) : "")
      + (r && r.community ? (r.community.posted ? " · pinned in Community" : " · not posted in Community" + (r.community.why ? ": " + r.community.why : "")) : "") + ".",
  });
}
function crNlSend(ctx) {
  const d = ctx.data || {};
  ctx.form({
    title: "Write the newsletter", submit: "Send newsletter", busyLabel: "Sending…",
    intro: "Plain text; links become clickable. Every email carries a one-click unsubscribe link.",
    values: { subject: "", body: "" },
    fields: [
      { id: "subject", l: "Subject", req: true, max: 140, check: v => String(v).trim().length >= 3 ? "" : "At least 3 characters." },
      { id: "body", l: "Message", type: "textarea", rows: 10, req: true, check: v => String(v).trim().length >= 10 ? "" : "At least 10 characters." },
    ],
    onSubmit: async v => {
      const ok = await ctx.confirm({ title: "Send to " + crPlural(d.active || 0, "subscriber") + "?", body: "This emails everyone subscribed. There is no undo.", cta: "Send newsletter", danger: true });
      if (!ok) return { fieldErrors: {} };
      return NGGApi.admin.newsletterSend(v.subject.trim(), v.body);
    },
    done: (v, r) => "Sent to " + crNum((r && r.sent) || 0) + ((r && r.skipped) ? " · " + crNum(r.skipped) + " skipped" : "") + ".",
  });
}
/* ── Official notices ────────────────────────────────────────────────────────
   What management sends members and their families (domain/notices.php): the
   letterhead, a subject, the body as it is written for WhatsApp, a sign-off.
   Paste the whole notice and it is split into its parts for the desk to check;
   the preview is the server's own formatting (NoticeDoc), so it is what a
   family reads. Publishing reaches each member's feed with a push, each family
   account's inbox once, and — when asked — an email to every address from a
   queue. Who has read it and acknowledged it is on the notice; a reminder goes
   only to the rest, once a day. A published notice is corrected (readers see
   that it was, and why) or withdrawn (readers see that instead), never
   deleted. */
const CR_NT_STATUS = { draft: ["Draft", "neutral"], published: ["Published", "ok"], withdrawn: ["Withdrawn", "bad"] };
const CR_NT_ERR = { subject_required: "Give the notice its subject.", body_required: "Write the notice.", too_long: "That is longer than a notice may be.",
  bad_audience: "Choose everyone, a programme, or one of the centres.", already_published: "This notice has already gone out.", nobody: "Nobody is in that audience.",
  note_required: "Say what was corrected — readers are shown it.", too_soon: "A reminder went out less than a day ago.", reason_required: "Say why — readers are shown it.",
  not_draft: "Only a draft is deleted. Withdraw a published notice instead.", withdrawn: "A withdrawn notice is not edited. Write a new one." };
function crNtErr(e, fb) { const c = e && ((e.data && e.data.error) || e.code); return (e && e.data && e.data.detail) || CR_NT_ERR[c] || crErr(e, fb); }
function crNtAud(d, id) { const a = (d.audiences || []).find(x => x.id === id); return id === "all" ? "Everyone" : a ? a.l : id; }
/* ── The editor ──────────────────────────────────────────────────────────────
   A notice is written ON THE PAGE, the way a document is: the subject is the
   title, the body is typed into the notice itself with a slim toolbar, and the
   letterhead and the sign-off are optional parts added from the page — so a
   one-line announcement is a title and a sentence, and a management notice is
   the same page with its letterhead on. Who it goes to sits beside the page.
   It saves itself while it is a draft; a published notice is corrected with a
   note instead. What is stored is still the WhatsApp text (ntSerialize below):
   one formatter on the server (notice_html) draws the page, the email and the
   copy for WhatsApp, so the editor is a way of WRITING that text, never a
   second format. The address carries it: /…/broadcast/new, /…/broadcast/<id>/edit. */
const NT_BLOCK = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|TR|SECTION|ARTICLE|HEADER|FOOTER)$/;
/** One run of text with its marks, in WhatsApp's: *bold*, _italic_, ~strike~, ```code```. */
function ntInline(node) {
  let s = "";
  node.childNodes.forEach(c => {
    if (c.nodeType === 3) { s += c.nodeValue.replace(/ /g, " ").replace(/[\r\n]+/g, " "); return; }
    if (c.nodeType !== 1) return;
    const t = c.tagName, st = c.style || {};
    if (t === "BR") { s += "\n"; return; }
    if (/^(SCRIPT|STYLE|META|TITLE)$/.test(t)) return;
    const inner = ntInline(c);
    const fw = String(st.fontWeight || ""), bold = ((t === "B" || t === "STRONG") && !/^(normal|[1-4]00)$/.test(fw)) || /^(bold|[6-9]00)$/.test(fw);
    const ital = t === "I" || t === "EM" || st.fontStyle === "italic";
    const strike = t === "S" || t === "STRIKE" || t === "DEL" || /line-through/.test(String(st.textDecoration || st.textDecorationLine || ""));
    let mark = t === "CODE" ? "```" : "";
    const wrap = (x, w) => { const m = x.match(/^(\s*)([\s\S]*?)(\s*)$/); return m[2] ? m[1] + w + m[2] + w + m[3] : x; };
    let x = inner;
    if (mark) x = wrap(x, mark);
    else { if (strike) x = wrap(x, "~"); if (ital) x = wrap(x, "_"); if (bold) x = wrap(x, "*"); }
    if (t === "A") { const h = c.getAttribute("href") || ""; if (/^https?:/i.test(h) && x.indexOf(h.replace(/^https?:\/\//i, "").replace(/\/$/, "")) < 0) x += " (" + h + ")"; }
    s += x;
  });
  return s;
}
/** The editor's page → the stored WhatsApp text: a blank line between blocks, a heading wholly bold, "- " for a bullet. */
function ntSerialize(root) {
  const out = [];
  let run = null;
  const flush = () => { if (run != null) { const t = run.replace(/[ \t]+\n/g, "\n").trim(); if (t) out.push(t); run = null; } };
  const walk = parent => parent.childNodes.forEach(c => {
    const el = c.nodeType === 1 ? c : null, t = el ? el.tagName : "";
    if (el && !NT_BLOCK.test(t) && el.querySelector && el.querySelector("p,div,h1,h2,h3,h4,ul,ol,li,pre,blockquote")) { flush(); walk(el); return; }   // a wrapper (Google Docs puts the whole paste in a <b>)
    if (!el || !NT_BLOCK.test(t)) { if (el && t === "BR") { flush(); return; } run = (run || "") + (el ? ntInline({ childNodes: [el] }) : c.nodeType === 3 ? c.nodeValue.replace(/ /g, " ") : ""); return; }
    flush();
    if (/^H[1-6]$/.test(t)) {
      const x = ntInline(el).replace(/[*_~]/g, "").replace(/\s+/g, " ").trim(); if (!x) return;
      const m = x.match(/^(\d{1,2})[.)]\s*(.+)$/);
      out.push(m ? m[1] + ". *" + m[2] + "*" : "*" + x + "*");
    } else if (t === "UL" || t === "OL") {
      const items = Array.from(el.children).filter(li => li.tagName === "LI").map((li, i) => (t === "OL" ? (i + 1) + ". " : "- ") + ntInline(li).replace(/\s*\n\s*/g, " ").trim()).filter(x => !/^(-|\d+\.)\s*$/.test(x));
      if (items.length) out.push(items.join("\n"));
    } else if (t === "PRE") { const x = el.textContent.trim(); if (x) out.push("```" + x + "```"); }
    else if (t === "LI" || t === "TR") { const x = ntInline(el).trim(); if (x) out.push("- " + x); }
    else if (/^(DIV|SECTION|ARTICLE|HEADER|FOOTER|BLOCKQUOTE|TABLE)$/.test(t) && el.querySelector("p,div,h1,h2,h3,h4,ul,ol,pre,tr")) walk(el);
    else { const x = ntInline(el).replace(/[ \t]+\n/g, "\n").trim(); if (x) out.push(x); }
  });
  walk(root);
  flush();
  return out.join("\n\n");
}
/** How many words are on the page. */
function ntWords(s) { const m = String(s || "").replace(/[*_~`]/g, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu); return m ? m.length : 0; }

/** Open the editor: a new notice, or this one. */
function crNtNew(ctx) { ctx.setSub("new"); }
function crNtEdit(ctx, n) { ctx.setSub(n.noticeId + "/edit"); }

const NT_TOOLS = [
  { id: "bold", icon: "text-b", l: "Bold", k: "Ctrl+B", cmd: "bold" },
  { id: "italic", icon: "text-italic", l: "Italic", k: "Ctrl+I", cmd: "italic" },
  { id: "strike", icon: "text-strikethrough", l: "Strikethrough", k: "Ctrl+Shift+X", cmd: "strikeThrough" },
  { sep: true },
  { id: "p", icon: "text-t", l: "Text", k: "Ctrl+Alt+0", block: "p", label: true },
  { id: "h", icon: "text-h", l: "Heading", k: "Ctrl+Alt+2", block: "h3", label: true },
  { sep: true },
  { id: "ul", icon: "list-bullets", l: "Bulleted list", k: "Ctrl+Shift+8", cmd: "insertUnorderedList" },
  { sep: true },
  { id: "undo", icon: "arrow-counter-clockwise", l: "Undo", k: "Ctrl+Z", cmd: "undo", plain: true },
  { id: "redo", icon: "arrow-clockwise", l: "Redo", k: "Ctrl+Y", cmd: "redo", plain: true },
];

const NT_BTNS = NT_TOOLS.filter(t => !t.sep);

function NoticeEditor({ d, ctx, id }) {
  const n0 = React.useMemo(() => id ? (d.notices || []).find(x => x.noticeId === id) || null : null, []);   // read once: the page is the editor's from here
  const R = d.reachLabels || {}, lh = d.lastLetterhead || {};
  const [nid, setNid] = React.useState(n0 ? n0.noticeId : "");
  const [status, setStatus] = React.useState(n0 ? n0.status : "draft");
  const pub = status === "published";
  const [f, setF] = React.useState(() => n0 ? { org: n0.org, kind: n0.kind, subject: n0.subject, signoff: n0.signoff, audience: n0.audience, reach: n0.reach, needsAck: !!n0.needsAck, emailOn: !!n0.emailOn, communityOn: !!n0.communityOn }
    : { org: "", kind: "", subject: "", signoff: "", audience: "all", reach: Object.keys(R)[0] || "both", needsAck: false, emailOn: false, communityOn: true });
  const [head, setHead] = React.useState(!!(n0 && (n0.org || n0.kind)));
  const [sign, setSign] = React.useState(!!(n0 && n0.signoff));
  const [body, setBody] = React.useState(n0 ? n0.body : "");
  const [note, setNote] = React.useState("");
  const [save, setSave] = React.useState({ s: n0 ? "saved" : "new" });   // new | dirty | saving | saved | error
  const [fmt, setFmt] = React.useState({});
  const [view, setView] = React.useState("edit");   // edit | preview
  const [prev, setPrev] = React.useState(null);
  const [sheet, setSheet] = React.useState(false);
  const [errs, setErrs] = React.useState({});
  const [conflict, setConflict] = React.useState(null);   // somebody else's newer version, when a save was refused as stale
  const [sched, setSched] = React.useState(n0 ? n0.scheduledAt || "" : "");
  const [when, setWhen] = React.useState(null);           // the schedule being chosen: { date, time, err, busy }
  const [ti, setTi] = React.useState(0);                  // the toolbar button that holds the tab stop (roving tabindex)
  const bodyRef = React.useRef(null), subjRef = React.useRef(null), rangeRef = React.useRef(null);
  const ver = React.useRef(0), chain = React.useRef(Promise.resolve()), last = React.useRef(n0), live = React.useRef({});
  live.current = { f, head, sign, body, nid, note, pub };

  /* The page is set once, from the server's own drawing of the stored text; after that it is the writer's. */
  React.useLayoutEffect(() => { if (bodyRef.current && n0) bodyRef.current.innerHTML = n0.html || ""; }, []);
  React.useEffect(() => { const t = n0 ? bodyRef.current : subjRef.current; if (t) t.focus({ preventScroll: true }); }, []);
  React.useLayoutEffect(() => { const t = subjRef.current; if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } }, [f.subject, view]);

  const payload = () => {
    const L = live.current, v = L.f;
    return { noticeId: L.nid || undefined, org: L.head ? v.org : "", kind: L.head ? v.kind : "", subject: v.subject, signoff: L.sign ? v.signoff : "", body: L.body,
      audience: v.audience, reach: v.reach, needsAck: !!v.needsAck, emailOn: !!v.emailOn, communityOn: !!v.communityOn, correctionNote: L.pub ? L.note : undefined,
      baseUpdatedAt: last.current ? last.current.updatedAt : undefined };
  };
  const valid = () => { const L = live.current; return L.f.subject.trim().length >= 3 && L.body.trim().length >= 2; };
  /* One save at a time, in order: the first save of a new notice creates it, and every later one must name it. */
  const doSave = force => {
    const mine = ++ver.current;
    chain.current = chain.current.catch(() => {}).then(async () => {
      if (mine !== ver.current) return last.current;   // a later change will save the newer text
      setSave({ s: "saving" });
      try {
        const r = await NGGApi.admin.notices.save(Object.assign(payload(), force ? { force: true } : {}));
        setConflict(null);
        const n = r.notice; last.current = n;
        if (!live.current.nid) { setNid(n.noticeId); live.current.nid = n.noticeId; ctx.setSub(n.noticeId + "/edit"); }
        ctx.setData(x => Object.assign({}, x, { notices: [n].concat((x.notices || []).filter(y => y.noticeId !== n.noticeId)) }));
        setErrs({});
        setSave(mine === ver.current ? { s: "saved", at: Date.now() } : { s: "dirty" });
        return n;
      } catch (e) {
        const D = (e && e.data) || {}, fld = D.field;
        if (D.error === "stale" && D.notice) { setConflict(D.notice); setSave({ s: "error", msg: "Changed by somebody else" }); throw e; }
        if (fld) setErrs({ [fld]: crNtErr(e) });
        /* A refusal about the words waits for the writer; anything else (the connection, the server) is tried again by itself. */
        setSave({ s: "error", msg: crNtErr(e, "Couldn’t save it."), retry: !fld && !D.error });
        throw e;
      }
    });
    return chain.current;
  };
  const changed = () => { ver.current++; setSave(s => s.s === "new" && !valid() ? s : { s: "dirty" }); };
  /* Drafts save themselves a moment after the writing stops — once there is a subject and something to say. */
  /* "new" counts too: a pasted notice fills its subject in the same event that
     reads the body, before the page has re-rendered, so changed() saw no subject
     and left a whole pasted notice unsaved until the writer typed again. */
  React.useEffect(() => {
    if (pub || (save.s !== "dirty" && save.s !== "new") || !valid()) return;
    const t = setTimeout(() => { doSave().catch(() => {}); }, 1200);
    return () => clearTimeout(t);
  }, [save, f, head, sign, body, pub]);
  /* Leaving with words unsaved asks first (the Control Room's own unsaved-changes guard). */
  React.useEffect(() => {
    const unsaved = save.s === "dirty" || save.s === "error" || (pub && save.s !== "saved");
    ctx.setDirty("notice-editor", unsaved ? { n: 1, save: () => pub ? Promise.resolve() : doSave(), discard: () => {} } : null);
  }, [save.s, pub]);
  React.useEffect(() => () => ctx.setDirty("notice-editor", null), []);
  /* A save that failed on the connection tries again by itself — in fifteen seconds, or the moment the browser is back online. */
  React.useEffect(() => {
    if (pub || save.s !== "error" || !save.retry || conflict) return;
    const again = () => { if (valid()) doSave().catch(() => {}); };
    const t = setTimeout(again, 15000);
    window.addEventListener("online", again);
    return () => { clearTimeout(t); window.removeEventListener("online", again); };
  }, [save, pub, conflict]);
  /* Closing the tab or reloading with words not yet saved asks the browser's own question. */
  React.useEffect(() => {
    const busy = save.s === "dirty" || save.s === "saving" || save.s === "error" || (save.s === "new" && (live.current.body.trim() || live.current.f.subject.trim()));
    if (!busy) return;
    const h = e => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [save.s, body, f.subject]);

  const set = (k, v) => { setF(x => Object.assign({}, x, { [k]: v })); setErrs(e => Object.assign({}, e, { [k]: "" })); changed(); };
  const readBody = () => { const el = bodyRef.current; if (!el) return; const t = ntSerialize(el); el.classList.toggle("is-empty", !el.textContent.trim() && !el.querySelector("li,br+br")); if (t !== live.current.body) { setBody(t); live.current.body = t; setErrs(e => Object.assign({}, e, { body: "" })); changed(); } };

  /* The toolbar reflects where the caret is; a press acts on the selection the page had. */
  React.useEffect(() => {
    const onSel = () => {
      const el = bodyRef.current, s = document.getSelection();
      if (!el || !s || !s.rangeCount || !el.contains(s.anchorNode)) return;
      rangeRef.current = s.getRangeAt(0).cloneRange();
      let blk = ""; try { blk = String(document.queryCommandValue("formatBlock") || "").toLowerCase(); } catch (_) {}
      const q = c => { try { return document.queryCommandState(c); } catch (_) { return false; } };
      const ul = q("insertUnorderedList"), h = /^h[1-6]$/.test(blk);
      setFmt({ bold: q("bold"), italic: q("italic"), strike: q("strikeThrough"), ul, h, p: !h && !ul });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);
  const focusBody = () => {
    const el = bodyRef.current; if (!el) return;
    if (document.activeElement !== el) { el.focus(); const r = rangeRef.current, s = document.getSelection(); if (r && s && el.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); } }
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (_) {}
  };
  const run = t => {
    focusBody();
    if (t.block) document.execCommand("formatBlock", false, "<" + t.block + ">");
    else document.execCommand(t.cmd, false, null);
    readBody();
  };
  const onKey = e => {
    const mod = e.ctrlKey || e.metaKey;
    const tool = k => NT_TOOLS.find(t => t.id === k);
    if (mod && e.shiftKey && (e.key === "x" || e.key === "X")) { e.preventDefault(); run(tool("strike")); return; }
    if (mod && e.altKey && e.code === "Digit2") { e.preventDefault(); run(tool("h")); return; }
    if (mod && e.altKey && e.code === "Digit0") { e.preventDefault(); run(tool("p")); return; }
    if (mod && e.shiftKey && (e.code === "Digit8")) { e.preventDefault(); run(tool("ul")); return; }
    /* "- " at the start of a line starts a list, as it does in a document. */
    if (e.key === " " && !mod) {
      const s = document.getSelection(); const node = s && s.anchorNode;
      if (node && node.nodeType === 3 && s.anchorOffset === node.nodeValue.length && /^[-*•]$/.test(node.nodeValue.trim()) && (!node.previousSibling)) {
        const blk = node.parentNode; if (blk && blk !== bodyRef.current && /^(P|DIV)$/.test(blk.tagName) || blk === bodyRef.current) {
          e.preventDefault(); node.nodeValue = ""; document.execCommand("insertUnorderedList", false, null); readBody(); return;
        }
      }
    }
  };
  /* Pasting: a whole notice onto an empty page fills every part; anything else keeps its formatting, through the same formatter. */
  const onPaste = async e => {
    const cd = e.clipboardData; if (!cd) return;
    const txt = cd.getData("text/plain") || "", html = cd.getData("text/html") || "";
    if (!txt && !html) return;
    e.preventDefault();
    focusBody();
    const empty = !live.current.body.trim();
    try {
      if (empty && /(^|\n)\s*[*_]*\s*SUBJECT\s*[*_]*\s*:/i.test(txt)) {
        const P = await NGGApi.admin.notices.parse(txt), p = P.parts || {};
        setF(x => Object.assign({}, x, { org: p.org || "", kind: p.kind || "", subject: p.subject || x.subject, signoff: p.signoff || "" }));
        setHead(!!(p.org || p.kind)); setSign(!!p.signoff);
        bodyRef.current.innerHTML = P.html || ""; readBody(); changed();
        ctx.toast("Pasted as a notice: its letterhead, subject" + (p.signoff ? ", body and sign-off" : " and body") + " are filled in. Check each part.");
        return;
      }
      let src = txt;
      if (html && !/^\s*$/.test(html)) { const doc = new DOMParser().parseFromString(html, "text/html"); const t = ntSerialize(doc.body); if (t.trim()) src = t; }
      if (!/\n/.test(src.trim()) && !/[*_~`]/.test(src)) { document.execCommand("insertText", false, src); readBody(); return; }
      const P = await NGGApi.admin.notices.preview(src);
      focusBody();
      document.execCommand("insertHTML", false, P.html || "");
      readBody();
    } catch (err) { document.execCommand("insertText", false, txt); readBody(); }
  };

  const showPreview = async () => {
    if (view === "preview") { setView("edit"); return; }
    setView("preview"); setPrev(null);
    try { const r = await NGGApi.admin.notices.preview(live.current.body); setPrev({ html: r.html }); }
    catch (e) { setPrev({ err: crNtErr(e, "Couldn’t draw the preview.") }); }
  };
  const need = () => {
    const L = live.current, e = {};
    if (L.f.subject.trim().length < 3) e.subject = "Give it a title.";
    if (L.body.trim().length < 2) e.body = "Write the notice.";
    if (L.pub && L.note.trim().length < 5) e.correctionNote = "Say what was corrected — readers are shown it.";
    setErrs(e);
    if (e.subject) { setView("edit"); setTimeout(() => subjRef.current && subjRef.current.focus(), 0); }
    else if (e.body) { setView("edit"); setTimeout(focusBody, 0); }
    else if (e.correctionNote) { setSheet(true); setTimeout(() => { const x = document.getElementById("nte-note"); if (x) x.focus(); }, 0); }
    return !Object.keys(e).length;
  };
  const publish = async () => {
    if (!need()) return;
    if (audN === 0) { setSheet(true); ctx.toast("Nobody is in that audience — choose another before publishing.", null, true); return; }
    let n;
    try { n = (save.s === "saved" && last.current) ? last.current : await doSave(); } catch (_) { return; }
    if (await crNtPublish(ctx, n)) ctx.setSub(n.noticeId);
  };
  const correct = async () => {
    if (!need()) return;
    try { await doSave(); ctx.toast("Corrected. Readers see the change and your note."); ctx.setDirty("notice-editor", null); ctx.setSub(live.current.nid); ctx.reload(); } catch (_) {}
  };
  const leave = async () => {
    if (!pub && (save.s === "dirty" || save.s === "error") && valid() && !conflict) { try { await doSave(); } catch (_) { return; } }
    const L = live.current, words = L.body.trim() || L.f.subject.trim();
    if (words && ((!valid() && !pub && save.s !== "saved") || conflict || (pub && save.s === "dirty"))) {
      const ok = await ctx.confirm({ title: "Leave without saving?", cta: "Leave", danger: true, cancel: "Keep writing",
        body: conflict ? "Your version was not saved: somebody else changed this notice." : pub ? "Your correction has not been saved." : "It cannot be saved yet: it needs a title of at least three letters and something to say." });
      if (!ok) return;
    }
    ctx.setDirty("notice-editor", null);
    ctx.setSub(live.current.nid || "");
  };

  /* Somebody else's newer version: take it, or keep yours (which then overwrites theirs, knowingly). */
  const takeTheirs = () => {
    const n = conflict; if (!n) return;
    last.current = n; ver.current++;
    setF(x => Object.assign({}, x, { org: n.org, kind: n.kind, subject: n.subject, signoff: n.signoff, audience: n.audience, reach: n.reach, needsAck: !!n.needsAck, emailOn: !!n.emailOn, communityOn: !!n.communityOn }));
    setHead(!!(n.org || n.kind)); setSign(!!n.signoff); setSched(n.scheduledAt || "");
    if (bodyRef.current) bodyRef.current.innerHTML = n.html || "";
    setBody(n.body); live.current.body = n.body;
    setConflict(null); setSave({ s: "saved" });
    ctx.setData(x => Object.assign({}, x, { notices: [n].concat((x.notices || []).filter(y => y.noticeId !== n.noticeId)) }));
  };
  const keepMine = () => { last.current = conflict; setConflict(null); doSave(true).catch(() => {}); };

  /* Publishing later. The time is Lagos time, as the desk reads a clock. */
  const openWhen = () => {
    const t = new Date(Date.now() + 86400000);
    const p2 = x => String(x).padStart(2, "0");
    setWhen({ date: t.getFullYear() + "-" + p2(t.getMonth() + 1) + "-" + p2(t.getDate()), time: "18:00", err: "" });
  };
  const doSchedule = async () => {
    if (!need()) return;
    if (!when.date || !when.time) { setWhen(w => Object.assign({}, w, { err: "Choose a date and a time." })); return; }
    setWhen(w => Object.assign({}, w, { busy: true, err: "" }));
    let n;
    try { n = (save.s === "saved" && last.current) ? last.current : await doSave(); } catch (_) { setWhen(w => Object.assign({}, w, { busy: false })); return; }
    try {
      const r = await NGGApi.admin.notices.schedule(n.noticeId, when.date + "T" + when.time);
      last.current = r.notice; setSched(r.notice.scheduledAt); setWhen(null);
      ctx.setData(x => Object.assign({}, x, { notices: [r.notice].concat((x.notices || []).filter(y => y.noticeId !== r.notice.noticeId)) }));
      ctx.toast("Scheduled for " + crDate(r.notice.scheduledAt, true) + ". It goes out by itself; edits until then go with it.");
    } catch (e) { setWhen(w => Object.assign({}, w, { busy: false, err: crNtErr(e, "Couldn’t schedule it.") })); }
  };
  const unschedule = async () => {
    try {
      const r = await NGGApi.admin.notices.schedule(live.current.nid, "");
      last.current = r.notice; setSched("");
      ctx.setData(x => Object.assign({}, x, { notices: [r.notice].concat((x.notices || []).filter(y => y.noticeId !== r.notice.noticeId)) }));
      ctx.toast("No longer scheduled. It stays a draft.");
    } catch (e) { ctx.toast(crNtErr(e, "Couldn’t change the schedule."), null, true); }
  };

  /* Ctrl+S saves now — the habit every writer has — wherever the caret is in the editor. */
  const onKeyAll = e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (pub) { correct(); return; }
      if (valid()) doSave().catch(() => {}); else need();
    }
  };
  /* The toolbar is one tab stop; the arrows move along it, Home and End to its ends (the WAI toolbar pattern). */
  const toolKey = e => {
    const k = e.key, n = NT_BTNS.length;
    const to = k === "ArrowRight" ? (ti + 1) % n : k === "ArrowLeft" ? (ti - 1 + n) % n : k === "Home" ? 0 : k === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault(); setTi(to);
    const b = e.currentTarget.querySelectorAll("button")[to]; if (b) b.focus();
  };
  const aud = d.audiences || [], audN = (aud.find(a => a.id === f.audience) || {}).n;
  const audName = crNtAud(d, f.audience);
  const reachLine = audN == null ? "" : "Reaches " + crPlural(audN, "member") + (f.reach === "both" ? " and their families" : f.reach === "guardians" ? "’ families only" : " only") + ".";
  /* Community carries members' notices only: guardians-only, or Summer School-only, cannot go there — said, and switched off. */
  const cmNo = f.reach === "guardians" ? "Guardians only — Community is the members’ space." : f.audience === "Summer" ? "Summer School only — Community is for NGG members." : "";
  const extras = [f.needsAck ? "Asks them to acknowledge it" : "", f.emailOn ? "Emailed as well" : "", f.communityOn && !cmNo ? "Pinned in Community" : ""].filter(Boolean).join(" · ");
  const words = ntWords(body);
  const saveText = { new: "Not saved yet", dirty: pub ? "Unsaved correction" : "Editing…", saving: "Saving…", saved: pub ? "Published · nothing changed yet" : "Saved", error: save.msg || "Couldn’t save it" }[save.s];
  const official = head && (f.org || f.kind);
  const settings = (
    <div className="nte-side-in">
      <div className="nte-sum" aria-live="polite">
        <CrIcon n={pub ? "megaphone" : "paper-plane-tilt"}/>
        <span><b>{pub ? "Sent to " + audName : "To " + audName}</b><em>{pub ? (R[f.reach] || "") : reachLine}{extras ? <><br/>{extras}</> : null}{sched && !pub ? <><br/>Goes out by itself {crDate(sched, true)}</> : null}</em></span>
      </div>
      {!pub && audN === 0 && <p className="nte-err nte-side-warn" role="alert">Nobody is in this audience yet — it could not be published.</p>}
      <section className="nte-sec" aria-labelledby="nte-who">
        <h2 id="nte-who" className="nte-sec-h">Who it is for</h2>
        {pub ? <p className="nte-fixed">{crNtAud(d, f.audience)} · {R[f.reach] || f.reach}<span>Fixed once it has gone out — re-addressing it would be a new notice.</span></p> : <>
          <label className="nte-lbl" htmlFor="nte-aud">Audience</label>
          <select id="nte-aud" className="cr-select nte-select" value={f.audience} onChange={e => set("audience", e.target.value)}>
            {aud.map(a => <option key={a.id} value={a.id}>{(a.id === "all" ? "Everyone" : a.l) + " · " + crNum(a.n)}</option>)}
          </select>
          {errs.audience && <p className="nte-err" role="alert">{errs.audience}</p>}
          <span className="nte-lbl" id="nte-reach-l">Send to</span>
          <div className="nte-chips" role="group" aria-labelledby="nte-reach-l">
            {Object.keys(R).map(k => <button key={k} type="button" className="cr-chip" aria-pressed={f.reach === k} onClick={() => set("reach", k)}>{R[k]}</button>)}
          </div>
        </>}
      </section>
      <section className="nte-sec" aria-labelledby="nte-how">
        <h2 id="nte-how" className="nte-sec-h">Delivery</h2>
        <div className="nte-row"><span><b>Ask them to acknowledge it</b><em>{pub ? "Fixed once it has gone out — nobody was asked to sign it then." : "Readers confirm they have read and understood it, and you see who has not."}</em></span><CrSwitch on={f.needsAck} disabled={pub} label="Ask readers to acknowledge it" onChange={v => set("needsAck", v)}/></div>
        <div className="nte-row"><span><b>Email it as well</b><em>{pub ? "Fixed once it has gone out." : "Every member and family address, once each."}</em></span><CrSwitch on={f.emailOn} disabled={pub} label="Email it as well" onChange={v => set("emailOn", v)}/></div>
        <div className="nte-row"><span><b>Show it in Community</b><em>{pub ? "Fixed once it has gone out; withdrawing the notice takes it down there too." : cmNo || "A pinned announcement in the commons that links to the notice. A notice for one centre names it."}</em></span><CrSwitch on={f.communityOn && !cmNo} disabled={pub || !!cmNo} label="Show it in Community" onChange={v => set("communityOn", v)}/></div>
      </section>
      {!pub && <section className="nte-sec" aria-labelledby="nte-when">
        <h2 id="nte-when" className="nte-sec-h">When</h2>
        {sched && !when ? <>
          <p className="nte-fixed">Goes out by itself <b>{crDate(sched, true)}</b><span>Edits you make until then go out with it.</span></p>
          <div className="nte-chips"><button type="button" className="cr-btn is-sm" onClick={openWhen}>Change the time</button><button type="button" className="cr-btn is-sm" onClick={unschedule}>Don’t schedule it</button></div>
        </> : when ? <div className="nte-when" role="group" aria-label="Publish later">
          <div className="nte-when-row">
            <label className="nte-lbl" htmlFor="nte-date">Date<input id="nte-date" type="date" className="cr-input nte-input" value={when.date} onChange={e => setWhen(w => Object.assign({}, w, { date: e.target.value, err: "" }))}/></label>
            <label className="nte-lbl" htmlFor="nte-time">Time<input id="nte-time" type="time" className="cr-input nte-input" value={when.time} onChange={e => setWhen(w => Object.assign({}, w, { time: e.target.value, err: "" }))}/></label>
          </div>
          <span className="nte-hint">Lagos time. Up to 60 days ahead.</span>
          {when.err && <p className="nte-err" role="alert">{when.err}</p>}
          <div className="nte-chips"><button type="button" className="cr-btn is-sm is-primary" disabled={when.busy} onClick={doSchedule}>{when.busy ? "Scheduling…" : "Schedule it"}</button><button type="button" className="cr-btn is-sm" onClick={() => setWhen(null)}>Cancel</button></div>
        </div> : <>
          <p className="nte-fixed">When you press Publish.<span>Or set a time and it goes out by itself.</span></p>
          <div className="nte-chips"><button type="button" className="cr-btn is-sm" onClick={openWhen}><CrIcon n="clock"/>Publish later…</button></div>
        </>}
      </section>}
      {pub && <section className="nte-sec" aria-labelledby="nte-cor">
        <h2 id="nte-cor" className="nte-sec-h">The correction</h2>
        <label className="nte-lbl" htmlFor="nte-note">What was corrected <i>(readers are shown it)</i></label>
        <input id="nte-note" className="cr-input nte-input" maxLength={240} value={note} placeholder="Section 3: the re-entry fee is ₦5,000" aria-invalid={!!errs.correctionNote}
          onChange={e => { setNote(e.target.value); setErrs(x => Object.assign({}, x, { correctionNote: "" })); setSave({ s: "dirty" }); }}/>
        {errs.correctionNote && <p className="nte-err" role="alert">{errs.correctionNote}</p>}
      </section>}
      <details className="nte-sec nte-help">
        <summary>Shortcuts and pasting</summary>
        <ul>
          <li>Paste a whole notice from WhatsApp onto an empty page and every part is filled in.</li>
          <li><kbd>Enter</kbd> starts a paragraph, <kbd>Shift</kbd>+<kbd>Enter</kbd> a new line in it.</li>
          <li>Type <kbd>-</kbd> and a space for a bullet; a section heading that starts “1.” keeps its number.</li>
          <li><kbd>Ctrl</kbd>+<kbd>B</kbd> bold · <kbd>Ctrl</kbd>+<kbd>I</kbd> italic · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>2</kbd> heading · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>0</kbd> text.</li>
          <li><kbd>Ctrl</kbd>+<kbd>S</kbd> saves now; a draft also saves itself as you write.</li>
        </ul>
      </details>
    </div>
  );
  return (
    <div className="nte" role="region" aria-label={pub ? "Correct the notice" : "Notice editor"} onKeyDown={onKeyAll}>
      <div className="nte-bar">
        <button type="button" className="cr-btn is-sm nte-back" onClick={leave}><CrIcon n="arrow-left"/>Notices</button>
        <span className={"nte-state is-" + save.s} role="status" aria-live="polite">{save.s === "saving" ? <CrIcon n="circle-notch"/> : save.s === "saved" ? <CrIcon n="check"/> : save.s === "error" ? <CrIcon n="warning-circle"/> : null}{saveText}</span>
        <span className="nte-grow"/>
        {sched && !pub && <span className="nte-sched" title={"Goes out by itself " + crDate(sched, true)}><CrIcon n="clock"/>{crDate(sched, true)}</span>}
        <span className={"nte-count" + (body.length > (d.max || 40000) * 0.9 ? " is-warn" : "")} aria-live="off">{body.length > (d.max || 40000) * 0.9 ? crNum((d.max || 40000) - body.length) + " characters left" : crPlural(words, "word")}</span>
        <button type="button" className="cr-btn is-sm" aria-pressed={view === "preview"} onClick={showPreview}><CrIcon n={view === "preview" ? "pencil-simple" : "eye"}/>{view === "preview" ? "Back to writing" : "Preview"}</button>
        <button type="button" className="cr-btn is-sm nte-sheet-btn" aria-expanded={sheet} aria-controls="nte-side" onClick={() => setSheet(s => !s)}><CrIcon n="paper-plane-tilt"/><span className="nte-sheet-l">To {audName}</span></button>
        {pub ? <button type="button" className="cr-btn is-primary is-sm" onClick={correct} disabled={save.s === "saving"}>Save the correction</button>
          : <button type="button" className="cr-btn is-primary is-sm" onClick={publish} disabled={save.s === "saving" || !!conflict}>{sched ? "Publish now…" : "Publish…"}</button>}
      </div>
      {conflict && <div className="nte-banner is-bad" role="alert"><CrIcon n="warning-circle"/><span className="nte-grow">Somebody else changed this notice while you were writing{conflict.updatedAt ? " (" + crDate(conflict.updatedAt, true) + ")" : ""}. Your words are still on the page, not saved.</span>
        <button type="button" className="cr-btn is-sm" onClick={takeTheirs}>Load their version</button><button type="button" className="cr-btn is-sm" onClick={keepMine}>Keep mine</button></div>}
      {!conflict && save.s === "error" && save.retry && <div className="nte-banner is-bad" role="alert"><CrIcon n="wifi-slash"/><span className="nte-grow">Not saved — the connection failed. It will try again by itself; your words stay on the page.</span><button type="button" className="cr-btn is-sm" onClick={() => doSave().catch(() => {})}>Try now</button></div>}
      {pub && <div className="nte-banner" role="note"><CrIcon n="info"/>It has gone out. Change what needs changing, say what you corrected, and save: readers see that it was corrected, when, and your note.</div>}
      {view === "edit" && <div className="nte-format"><div className="nte-tools" role="toolbar" aria-label="Formatting" aria-controls="nte-body" onKeyDown={toolKey}>
        {NT_TOOLS.map((t, i) => t.sep ? <span key={i} className="nte-sep" aria-hidden="true"/> :
          <button key={t.id} type="button" className={"nte-tool" + (t.label ? " is-label" : "")} title={t.l + " (" + t.k + ")"} aria-label={t.l} aria-pressed={t.plain ? undefined : !!fmt[t.id]}
            tabIndex={NT_BTNS.indexOf(t) === ti ? 0 : -1} onFocus={() => setTi(NT_BTNS.indexOf(t))}
            onMouseDown={e => e.preventDefault()} onClick={() => run(t)}><CrIcon n={t.icon}/>{t.label ? <span>{t.l}</span> : null}</button>)}
      </div></div>}
      <div className="nte-work">
        <main className="nte-desk">
          {view === "preview" ? (
            !prev ? <p className="nte-wait">Drawing it as members will see it…</p>
            : prev.err ? <p className="nte-err" role="alert">{prev.err} <button type="button" className="cr-linkbtn" onClick={() => { setView("edit"); showPreview(); }}>Try again</button></p>
            : <><p className="nte-wait">Exactly what members and families will read.</p><NoticeDoc n={{ org: head ? f.org : "", kind: head ? f.kind : "", subject: f.subject || "(no title yet)", html: prev.html, signoff: sign ? f.signoff : "", official: !!official, noticeId: "preview" }} level={2}/></>
          ) : (
          <article className="nt-paper nt-doc nte-paper">
            {head ? <header className="nt-head nte-head">
              <input className="nte-in nt-org" aria-label="Organisation (letterhead)" placeholder="Organisation" maxLength={160} value={f.org} onChange={e => set("org", e.target.value)}/>
              <input className="nte-in nt-kind" aria-label="Kind of notice" placeholder="Kind of notice, e.g. MANAGEMENT OFFICIAL NOTICE" maxLength={160} value={f.kind} onChange={e => set("kind", e.target.value)}/>
              <button type="button" className="nte-x" aria-label="Remove the letterhead" title="Remove the letterhead" onClick={() => { setHead(false); changed(); }}><CrIcon n="x"/></button>
            </header> : <button type="button" className="nte-add" onClick={() => { setHead(true); setF(x => x.org || x.kind ? x : Object.assign({}, x, { org: lh.org || "", kind: lh.kind || "" })); changed(); }}><CrIcon n="plus"/>Letterhead<em>for an official notice</em></button>}
            <div className={"nte-subj" + (official ? " is-official" : "")}>
              {official && <span className="nte-subj-k" aria-hidden="true">Subject:</span>}
              <textarea ref={subjRef} rows={1} className="nte-in nt-subject" aria-label={official ? "Subject" : "Title"} placeholder={official ? "Subject" : "Title"} maxLength={300} value={f.subject} aria-invalid={!!errs.subject}
                onChange={e => set("subject", e.target.value.replace(/\n/g, " "))} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); focusBody(); } }}/>
            </div>
            {errs.subject && <p className="nte-err" role="alert">{errs.subject}</p>}
            <div id="nte-body" ref={bodyRef} className={"nt-body nte-body" + (n0 && n0.html ? "" : " is-empty")} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="The notice" aria-invalid={!!errs.body}
              data-ph={official ? "Write the notice. Paste one from WhatsApp and it keeps its sections, bold and lists." : "Write your message. A sentence is enough — or paste a whole notice from WhatsApp."}
              onInput={readBody} onBlur={readBody} onKeyDown={onKey} onPaste={onPaste} onFocus={() => { try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (_) {} }}/>
            {errs.body && <p className="nte-err" role="alert">{errs.body}</p>}
            {sign ? <div className="nte-signrow">
              <input className="nte-in nt-sign" aria-label="Sign-off" placeholder="Sign-off, e.g. STS MANAGEMENT" maxLength={160} value={f.signoff} onChange={e => set("signoff", e.target.value)}/>
              <button type="button" className="nte-x" aria-label="Remove the sign-off" title="Remove the sign-off" onClick={() => { setSign(false); changed(); }}><CrIcon n="x"/></button>
            </div> : <button type="button" className="nte-add is-sign" onClick={() => { setSign(true); setF(x => x.signoff ? x : Object.assign({}, x, { signoff: lh.signoff || "" })); changed(); }}><CrIcon n="plus"/>Sign-off</button>}
          </article>)}
        </main>
        <aside id="nte-side" className={"nte-side" + (sheet ? " is-open" : "")} aria-label="Sending">
          <div className="nte-side-head"><b>Sending</b><button type="button" className="nte-x" aria-label="Close" onClick={() => setSheet(false)}><CrIcon n="x"/></button></div>
          {settings}
        </aside>
      </div>
    </div>
  );
}
async function crNtPublish(ctx, n) {
  const who = crNtAud(ctx.data, n.audience), N = n.reachMembers || 0;   // read before the confirm: what is agreed is what runs
  const reach = { both: crPlural(N, "member") + " and their families", members: crPlural(N, "member"), guardians: "the families of " + crPlural(N, "member") }[n.reach] || crPlural(N, "member");
  const ok = await ctx.confirm({ title: "Publish to " + who + "?", cta: "Publish",
    body: "“" + n.subject + "” goes to " + reach + (n.emailOn ? ", by email as well" : "") + ". It can be corrected or withdrawn afterwards, but not unsent." });
  if (!ok) return false;
  try {
    const r = await NGGApi.admin.notices.publish(n.noticeId);
    ctx.toast("Published · " + crPlural(r.stats.members, "member") + " · " + crPlural(r.stats.families, "family account") + (r.stats.emailsQueued ? " · " + crNum(r.stats.emailsQueued) + " emails on their way" : ""));
    ctx.setData(x => Object.assign({}, x, { readers: {} }));
    ctx.reload();
    return true;
  } catch (e) { ctx.toast(crNtErr(e, "Couldn’t publish it."), null, true); return false; }
}
function crNtWithdraw(ctx, n) {
  ctx.form({
    title: "Withdraw this notice", submit: "Withdraw it", busyLabel: "Withdrawing…",
    intro: "Readers will see that it was withdrawn, when, and why — instead of the notice disappearing. Emails not yet sent are cancelled.",
    values: { reason: "" }, fields: [{ id: "reason", l: "Why", type: "textarea", rows: 2, req: true, max: 240, check: v => v.trim().length >= 5 ? "" : "Say why, in a sentence." }],
    onSubmit: v => NGGApi.admin.notices.withdraw(n.noticeId, v.reason.trim()),
    done: () => { ctx.reload(); return "Withdrawn."; },
  });
}
async function crNtRemind(ctx, n, left) {
  const ok = await ctx.confirm({ title: "Remind " + crPlural(left, "member") + "?", cta: "Send the reminder",
    body: "A reminder goes " + (n.reach === "guardians" ? "to the parents of each member" : n.reach === "members" ? "to the feed of each member" : "to each member, and their parents,") + " who has not " + (n.needsAck ? "acknowledged" : "read") + " it yet — and nobody else. One a day at most." });
  if (!ok) return;
  try { const r = await NGGApi.admin.notices.remind(n.noticeId); ctx.toast("Reminded " + [r.reminded ? crPlural(r.reminded, "member") : "", r.families ? crPlural(r.families, "family", "families") : ""].filter(Boolean).join(" and ") + "." ); crNtReaders(ctx, n.noticeId); ctx.reload(); }
  catch (e) { ctx.toast(crNtErr(e, "Couldn’t send the reminder."), null, true); }
}
async function crNtReaders(ctx, id) {
  try { const r = await NGGApi.admin.notices.readers(id); ctx.setData(x => Object.assign({}, x, { readers: Object.assign({}, x.readers, { [id]: r }) })); }
  catch (e) { ctx.setData(x => Object.assign({}, x, { readers: Object.assign({}, x.readers, { [id]: { err: e } }) })); }
}
/* The open notice is the URL's (/control/comms/broadcast/<id>): it survives a
   reload and a shared link, and a reload cannot lose it to a race. */
function crNtOpen(ctx, id, reload) { ctx.setSub(id || ""); if (reload) ctx.reload(); }
/* Who has read the open notice, fetched once per notice when it is shown (the
   load fetches it too when the page opens on a notice's address). */
const CR_NT_FETCHING = {};
function crNtWantReaders(ctx, id) {
  if (CR_NT_FETCHING[id]) return;
  CR_NT_FETCHING[id] = true;
  crNtReaders(ctx, id).finally(() => { delete CR_NT_FETCHING[id]; });
}
async function crNtCopy(ctx, n) {
  try { await navigator.clipboard.writeText(n.whatsapp); ctx.toast("Copied for WhatsApp."); } catch (_) { ctx.toast("Couldn’t copy — select the text on the notice’s page instead.", null, true); }
}
/** A copy of a notice as a new draft — the same parts and audience, nothing of its history — opened in the editor. */
async function crNtDuplicate(ctx, n) {
  try {
    const r = await NGGApi.admin.notices.save({ org: n.org, kind: n.kind, subject: n.subject, body: n.body, signoff: n.signoff, audience: n.audience, reach: n.reach, needsAck: !!n.needsAck, emailOn: !!n.emailOn, communityOn: !!n.communityOn });
    ctx.setData(x => Object.assign({}, x, { notices: [r.notice].concat(x.notices || []) }));
    ctx.setSub(r.notice.noticeId + "/edit");
    ctx.toast("A copy, as a new draft. Nothing has been sent.");
  } catch (e) { ctx.toast(crNtErr(e, "Couldn’t copy it."), null, true); }
}
async function crNtTest(ctx, n) {
  try { const r = await NGGApi.admin.notices.test(n.noticeId); ctx.toast("Test email sent to " + r.to + "."); }
  catch (e) { ctx.toast(crNtErr(e, "Couldn’t send the test."), null, true); }
}
async function crNtUnschedule(ctx, n) {
  try { await NGGApi.admin.notices.schedule(n.noticeId, ""); ctx.toast("No longer scheduled. It stays a draft."); ctx.reload(); }
  catch (e) { ctx.toast(crNtErr(e, "Couldn’t change the schedule."), null, true); }
}
/** Who it is for, as a sheet to chase from: name, centre, read, acknowledged, and by whom. */
function crNtCsv(n, R) {
  downloadCsv("notice-" + n.noticeId + "-readers", (R.rows || []).map(r => Object.assign({ member: r.fullName, memberId: r.memberId, centre: r.centre || "", read: r.readAt || "" },
    R.needsAck ? { acknowledged: r.ackAt || "", acknowledgedBy: r.ackAt ? (r.ackBy === "parent" ? "parent" : "member") : "" } : {})));
}
/** The address's notice: /…/broadcast/<id> opens it, /…/broadcast/<id>/edit (or /new) writes it. */
function crNtRoute(sub) { const p = String(sub || "").split("/"); return { id: p[0] === "new" ? "" : p[0], edit: p[0] === "new" || p[1] === "edit" }; }
function crNtDetail(d, ctx) {
  const n = (d.notices || []).find(x => x.noticeId === crNtRoute(ctx.sub).id); if (!n) return [];
  const st = CR_NT_STATUS[n.status] || [n.status, "neutral"], R = (d.readers || {})[n.noticeId];
  if (!R && n.status !== "draft") crNtWantReaders(ctx, n.noticeId);
  const out = [];
  const acts = n.status === "draft" ? [
    { l: n.scheduledAt ? "Publish now…" : "Publish…", run: () => crNtPublish(ctx, n) }, { l: "Edit", run: () => crNtEdit(ctx, n) },
    { l: "Delete the draft", run: async () => { if (!(await ctx.confirm({ title: "Delete this draft?", cta: "Delete", danger: true, body: "It has not gone to anybody." }))) return; try { await NGGApi.admin.notices.del(n.noticeId); crNtOpen(ctx, null, true); } catch (e) { ctx.toast(crNtErr(e), null, true); } } },
  ] : n.status === "published" ? [
    { l: "Correct…", run: () => crNtEdit(ctx, n) }, { l: "Withdraw…", run: () => crNtWithdraw(ctx, n) },
  ] : [];
  out.push({ type: "note", span: 6, icon: n.status === "draft" ? "pencil-simple" : n.status === "published" ? "megaphone" : "prohibit", tone: st[1] === "bad" ? "bad" : null,
    text: st[0] + " · " + crNtAud(d, n.audience) + " · " + ((d.reachLabels || {})[n.reach] || "") + (n.needsAck ? " · asks for acknowledgement" : "") + (n.emailOn ? " · by email too" : "") + (n.communityOn ? " · pinned in Community" : ""),
    sub: n.status === "draft" ? (n.scheduledAt ? "Scheduled: it goes out by itself " + crDate(n.scheduledAt, true) + ", as it stands then. Nobody has it yet." : "Check it below, then publish. Nobody has it yet.")
      : n.status === "published" ? "Published " + crDate(n.publishedAt) + (n.stats ? " to " + crPlural(n.stats.members || 0, "member") + " and " + crPlural(n.stats.families || 0, "family account") + (n.stats.emailsQueued ? ", " + crNum(n.stats.emailsQueued) + " emails" : "") : "") + "." + (n.correctedAt ? " Corrected " + crDate(n.correctedAt) + "." : "")
      : "Withdrawn " + crDate(n.withdrawnAt) + ": " + n.withdrawReason,
    act: acts[0] ? { l: acts[0].l, run: acts[0].run } : null });
  out.push({ type: "list", span: 6, rows: acts.slice(1).map(a => ({ icon: /Delete|Withdraw/.test(a.l) ? "prohibit" : "pencil-simple", t: a.l, onClick: a.run }))
    .concat(n.status === "draft" && n.scheduledAt ? [{ icon: "clock-counter-clockwise", t: "Don’t schedule it", s: "It stays a draft until somebody publishes it.", onClick: () => crNtUnschedule(ctx, n) }] : [])
    .concat([{ icon: "whatsapp-logo", t: "Copy for WhatsApp", s: "The notice in WhatsApp’s own marks, ready to paste into a group.", onClick: () => crNtCopy(ctx, n) }])
    .concat([{ icon: "envelope-simple", t: "Send me a test email", s: "The notice as its email, to your own address only.", onClick: () => crNtTest(ctx, n) }])
    .concat([{ icon: "copy", t: "Duplicate as a new draft", s: "Same words and audience; for next week’s version.", onClick: () => crNtDuplicate(ctx, n) }])
    .concat(n.status !== "draft" ? [{ icon: "arrow-square-out", t: "Open it as members see it", s: "/notice/" + n.noticeId, onClick: () => window.open("/notice/" + encodeURIComponent(n.noticeId), "_blank", "noopener") }] : [])
    .concat([{ icon: "x", t: "Close", onClick: () => crNtOpen(ctx, null) }]) });
  out.push({ type: "custom", span: 6, title: n.status === "draft" ? "Preview — exactly what they will read" : "The notice", render: () => <NoticeDoc n={n} level={2}/> });
  if (n.status !== "draft") {
    if (!R) out.push({ type: "note", span: 6, icon: "hourglass", text: "Loading who has read it…" });
    else if (R.err) out.push({ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "Couldn’t load who has read it.", sub: crErr(R.err, ""), act: { l: "Try again", run: () => crNtReaders(ctx, n.noticeId) } });
    else {
      const T = R.totals || {}, left = R.needsAck ? T.members - T.acked : T.members - T.read;
      out.push({ type: "kpis", span: 6, items: [{ l: "For", v: crNum(T.members), dn: "members" }, { l: "Read", v: crNum(T.read), dn: T.members ? Math.round(T.read * 100 / T.members) + "%" : "—" }]
        .concat(R.needsAck ? [{ l: "Acknowledged", v: crNum(T.acked), dn: T.members ? Math.round(T.acked * 100 / T.members) + "%" : "—" }] : [])
        .concat([{ l: R.needsAck ? "Not yet acknowledged" : "Not yet read", v: crNum(left), dn: R.remindedAt ? "reminded " + crDate(R.remindedAt) : "" }]) });
      if (R.mail) out.push({ type: "kpis", span: 6, items: [{ l: "Emails sent", v: crNum(R.mail.sent) }, { l: "Still to send", v: crNum(R.mail.queued), dn: R.mail.queued ? "a batch a minute" : "" },
        { l: "Failed", v: crNum(R.mail.failed), dn: R.mail.failed ? "after three tries" : "" }].concat(R.mail.cancelled ? [{ l: "Cancelled", v: crNum(R.mail.cancelled), dn: "withdrawn" }] : []) });
      const who = R.reach === "guardians" ? "families of the " : "";
      if (n.status === "published" && left > 0) out.push({ type: "list", span: 6, rows: [{ icon: "bell-ringing", t: "Remind the " + who + crPlural(left, "member") + " who " + (R.needsAck ? "have not acknowledged it" : "have not read it"),
        s: R.reach === "guardians" ? "Their parents, in the family app — once a day at most." : R.reach === "members" ? "Only them, and once a day at most." : "Them and their parents, and nobody else — once a day at most.", onClick: () => crNtRemind(ctx, n, left) }] });
      if ((R.rows || []).length) out.push({ type: "list", span: 6, rows: [{ icon: "download-simple", t: "Export who has read it (CSV)", s: "To chase by phone, or for the record.", onClick: () => crNtCsv(n, R) }] });
      out.push({ type: "table", span: 6, title: "Who has read it", nosel: true, search: "Search by name or centre",
        cols: ["Member", "Centre", "Read", R.needsAck ? "Acknowledged" : "—"].filter(x => x !== "—"),
        rows: (R.rows || []).map(r => ({ key: r.memberId, cells: [
          { k: "person", t: r.fullName, s: r.memberId }, { k: "text", t: r.centre || "—" },
          { k: "status", t: r.readAt ? "Read" : "Not yet", tone: r.readAt ? "ok" : "neutral", s: r.readAt ? crDate(r.readAt) : "" },
        ].concat(R.needsAck ? [{ k: "status", t: r.ackAt ? (r.ackBy === "parent" ? "By a parent" : "Yes") : "Not yet", tone: r.ackAt ? "ok" : "warn", s: r.ackAt ? crDate(r.ackAt) : "" }] : []) })),
        filters: ["Centre", "Read"].concat(R.needsAck ? ["Acknowledged"] : []), emptyText: "Nobody is in this notice’s audience." });
    }
  }
  return out;
}
Object.assign(CR_TAB_DEFS, {
  broadcast: {
    skeleton: ["kpis", "table"],
    load: async ctx => {
      const rt = crNtRoute(ctx.sub), open = rt.edit ? "" : rt.id;
      const [N, B, R] = await Promise.all([NGGApi.admin.notices.list(), NGGApi.admin.broadcastHistory(), open ? NGGApi.admin.notices.readers(open).catch(e => ({ err: e })) : null]);
      return Object.assign({}, N, { announcements: B.announcements || [], readers: open && R ? { [open]: R } : {} });
    },
    actions: (d, ctx) => ctx.can("content") ? [
      { l: "New notice", icon: "scroll", primary: true, run: () => crNtNew(ctx) },
      { l: "Quick message", icon: "megaphone", run: () => crAnnSend(ctx) },
    ] : [],
    blocks: (d, ctx) => {
      const rt = crNtRoute(ctx.sub);
      if (rt.edit && ctx.can("content")) {
        const n = rt.id ? (d.notices || []).find(x => x.noticeId === rt.id) : null;
        if (rt.id && !n) return [{ type: "note", span: 6, icon: "warning-circle", tone: "bad", text: "That notice isn’t here.", sub: "It may have been deleted.", act: { l: "Back to notices", run: () => ctx.setSub("") } }];
        if (n && n.status === "withdrawn") return [{ type: "note", span: 6, icon: "prohibit", tone: "bad", text: "A withdrawn notice is not edited.", sub: "Write a new one instead.", act: { l: "Open it", run: () => ctx.setSub(n.noticeId) } }];
        // One key for the whole life of the page: saving a new notice moves the address from /new to /<id>/edit without remounting the writing.
        return [{ type: "custom", span: 6, render: () => <NoticeEditor key="nte" d={d} ctx={ctx} id={rt.id}/> }];
      }
      const name = id => crNtAud(d, id);
      const N = d.notices || [];
      const pub = N.filter(n => n.status === "published");
      const out = crNtDetail(d, ctx);
      out.push({ type: "kpis", span: 6, items: [
        { l: "Notices published", v: crNum(pub.length) }, { l: "Drafts", v: crNum(N.filter(n => n.status === "draft").length), dn: N.some(n => n.status === "draft" && n.scheduledAt) ? crNum(N.filter(n => n.status === "draft" && n.scheduledAt).length) + " scheduled" : "" },
        { l: "Waiting on acknowledgement", v: crNum(pub.filter(n => n.needsAck).reduce((a, n) => a + Math.max(0, (n.reachMembers || 0) - (n.acked || 0)), 0)), dn: "members, across notices" },
      ] });
      out.push({ type: "table", span: 6, title: "Notices", nosel: true, search: "Search notices",
        sub: "Open one to check it, publish it, see who has read it, remind the rest, correct or withdraw it.",
        cols: [{ l: "Subject", wrap: true }, "For", "Status", { l: "Read", num: true }, { l: "Acknowledged", num: true }, "When"],
        rows: N.map(n => { const st = n.status === "draft" && n.scheduledAt ? ["Scheduled", "warn"] : CR_NT_STATUS[n.status] || [n.status, "neutral"]; return { key: n.noticeId, open: () => crNtOpen(ctx, n.noticeId), cells: [
          { k: "strong", t: n.subject, s: [n.org, n.kind].filter(Boolean).join(" · ") }, { k: "text", t: name(n.audience) },
          { k: "status", t: st[0], tone: st[1] },
          { k: "num", t: n.status === "draft" ? "—" : crNum(n.readers || 0) + " / " + crNum(n.reachMembers || 0), v: n.readers || 0 },
          { k: "num", t: n.needsAck && n.status !== "draft" ? crNum(n.acked || 0) : "—", v: n.acked || 0 },
          { k: "text", t: n.status === "draft" && n.scheduledAt ? crDate(n.scheduledAt, true) : crDate(n.publishedAt || n.updatedAt) },
        ] }; }),
        filters: ["Status", "For"], emptyText: "No notices yet. “New notice” takes a whole management notice, pasted as it was written." });
      out.push({ type: "list", span: 6, title: "Quick messages", empty: "None sent. A quick message is one line in members’ notification feeds.",
        rows: (d.announcements || []).map(a => ({ icon: "megaphone", t: a.title || "(untitled)", s: [name(a.audience), a.body].filter(Boolean).join(" · "), m: crDate(a.createdAt) })) });
      return out;
    },
  },
  newsletter: {
    skeleton: ["kpis", "table"],
    load: async () => NGGApi.admin.newsletter(),
    actions: (d, ctx) => [
      ctx.can("content") ? { l: "Write the newsletter", icon: "envelope-simple", primary: true, run: () => crNlSend(ctx), disabled: !d || !d.active, why: "Nobody is subscribed yet." } : null,
      { l: "Export CSV", icon: "download-simple", run: () => downloadCsv("newsletter", (d && d.subscribers) || []), disabled: !d || !(d.subscribers || []).length, why: "No subscribers to export." },
    ].filter(Boolean),
    blocks: d => [
      { type: "kpis", span: 6, items: [{ l: "Subscribed", v: crNum(d.active) }, { l: "Ever signed up", v: crNum(d.total) }] },
      { type: "table", span: 6, nosel: true, search: "Email", cols: ["Email", "Source", "Status", "Joined"], filters: ["Source", "Status"],
        emptyText: "No subscribers yet. People join from the sign-up box on the public site.",
        rows: (d.subscribers || []).map((x, i) => ({ key: x.email || i, cells: [
          { k: "strong", t: x.email }, { k: "text", t: x.source || "—" },
          { k: "status", t: x.status === "subscribed" ? "Subscribed" : x.status === "unsubscribed" ? "Unsubscribed" : (x.status || "—"), tone: x.status === "subscribed" ? "ok" : "neutral" },
          { k: "text", t: crDate(x.createdAt) },
        ] })) },
    ],
  },
});
