/* ============================================================================
   Community v3 — the controller for the compiled design (cm3-view.jsx).

   The view is the handoff's Community.dc.html, compiled (tools/dc-compile.js);
   this file builds its values object from the server (domain/community.php and
   domain/community-v3.php) and turns every handler into an op. The logic
   follows the design's own renderVals() line for line where it can, so a
   reviewer can hold the two side by side; where the prototype faked something
   (a ticking video, painted PDF pages, a fixed list of people) this runs the
   real thing: a <video>, pdf.js pages, the people who actually posted.

   Data shapes, from the server to the design:
     post   community_post_shape + cm3_shape_extras  → { id, ch, author, kind, … }
     people keyed by authorKey (an HMAC, never a member id)
     media  community.media per post: chapters, captions, points, code, pos
   ========================================================================== */

const CM3_REACT_NAMES = { "👏": "Clap", "❤️": "Love", "🔥": "Fire", "💡": "Great idea", "🎉": "Celebrate", "🙌": "Hooray" };
const CM3_REACT_LIST = Object.keys(CM3_REACT_NAMES);
const CM3_TONES = ["#f2c98a", "#b9d5c0", "#c8d1f2", "#f2c4d3", "#d9c9f2", "#f2d8b5", "#bfe0e6", "#e6d7c3"];
const CM3_KIND = { question: ["Question", "ph ph-question", "#fdf1d6", "#6b4b00"], work: ["Show my work", "ph ph-paint-brush-broad", "#e5efe7", "#1d4f2a"], poll: ["Poll", "ph ph-chart-bar", "#eceefb", "#2a3f9e"], announce: ["Announcement", "ph ph-megaphone", "#0b0b0c", "#ffffff"], homework: ["Homework", "ph ph-backpack", "#fbe7ee", "#7d2347"] };
const CM3_FEED_FILTER = { all: "all", unread: "unread", mentions: "mentions", questions: "questions", saved: "bookmarks", mine: "mine" };
const CM3_VIDEO_EXT = /\.(mp4|mov|webm|m4v)$/i;

function cm3Tone(key) { let h = 0; for (const c of String(key || "")) h = (h * 31 + c.codePointAt(0)) >>> 0; return CM3_TONES[h % CM3_TONES.length]; }
function cm3Ini(name) { return String(name || "?").split(/\s+/).filter(Boolean).map(x => x[0]).slice(0, 2).join("").toUpperCase() || "?"; }
/* Only http(s) links leave the page — a post body is member-written. */
function cm3SafeUrl(u) { const t = String(u || "").trim(); return /^https?:\/\//i.test(t) ? t : ""; }
function cm3Fmt(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
function cm3Ago(iso) { const a = typeof cmAgo === "function" ? cmAgo(iso) : ""; return !a ? "" : a === "just now" ? "Just now" : /^\d+[mh]$/.test(a) ? a + " ago" : a; }
function cm3Err(e, fallback) { return (e && (e.detail || (typeof humanizeError === "function" ? humanizeError(e.code || e.message, "") : ""))) || fallback || "Something went wrong. Try again."; }
/* A day line in a thread: Today, Yesterday, a weekday this week, else the date. */
function cm3Day(iso) {
  const t = Date.parse(iso || ""); if (!t) return "";
  const d = new Date(t), n = new Date(), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 864e5);
  if (diff <= 0) return "Today"; if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: d.getFullYear() === n.getFullYear() ? undefined : "numeric" });
}
function cm3Clock(iso) { const t = Date.parse(iso || ""); return t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""; }
function cm3Reduced() { try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
/* The six reactions are self-hosted (assets/emoji, downscaled Noto Animated
   Emoji, CC BY 4.0). Any other emoji in a post stays text. */
function cm3EmojiSrc(e) { const k = [...e].map(c => c.codePointAt(0).toString(16)).join("_"); return CM3_REACT_NAMES[e] ? "/assets/emoji/" + k + ".gif" : ""; }

/* A document post's file, from this origin (api/member/community-doc.php):
   the stored URL is not readable from the browser. */
function cm3DocUrl(postId, dl) { return "/api/member/community-doc.php?postId=" + encodeURIComponent(postId || "") + (dl ? "&dl=1" : ""); }

/** The real PDF page for the doc viewer: pdf.js through the shared NggPdfPage. */
function Cm3PdfPage({ url, dl, page, zoom, onPages }) {
  const [doc, setDoc] = React.useState(null);
  const [err, setErr] = React.useState("");
  React.useEffect(() => {
    let live = true, task = null;
    setDoc(null); setErr("");
    loadVendor("pdfjs").then(lib => { nggPdfConfigure(lib); task = lib.getDocument(Object.assign({ url }, NGG_PDF_OPTS)); return task.promise; })
      .then(d => { if (!live) return; setDoc(d); onPages && onPages(d.numPages); })
      .catch(() => { if (live) setErr("This document can’t be shown here."); });
    return () => { live = false; try { task && task.destroy(); } catch (e) {} };
  }, [url]);
  if (err) return <div className="cm3x-pdf-msg"><p>{err}</p>{dl ? <a className="cm3x-pdf-dl" href={dl} download><i className="ph ph-download-simple" aria-hidden="true"></i>Download it to read it</a> : null}</div>;
  if (!doc) return <p className="cm3x-pdf-msg">Opening the document…</p>;
  return <div className="cm3x-pdf-page"><NggPdfPage doc={doc} page={page + 1} scale={(zoom || 100) / 100 * 1.4}/></div>;
}

class Cm3App extends React.Component {
  state = {
    boot: null, bootErr: "", view: "home", filter: "all", ch: "", chTab: "posts", q: "", posts: [], hasMore: false, feedPage: 0, opened: null, feedKey: "", feedErr: "", loading: false,
    comments: {}, hw: null, files: null, slides: [], queue: null, qComments: [], cases: null, stats: null, health: null, modLocked: false, modErr: "",
    thread: null, comp: null, report: null, toast: "", toastUndo: null, digest: false, digestText: "", modTab: "queue", modFilter: "all", modeAsk: null,
    sheet: false, w: 1280, stars: 0, picker: null, hwSel: null, hwFilter: "all", reply: "", fileKind: "all", hidden: {}, read: {}, hwNotes: {}, hwLinks: {},
    nudged: {}, card: null, burst: null, car: 0, carPaused: false, viewer: null, media: {}, vt: 0, vPlay: false, crisis: "", busy: false, typing: "", edit: null,
    quote: null, rxOpen: null, hl: null, thNew: 0, thAway: false, thSeenAt: undefined
  };
  rootRef = React.createRef();
  thRef = React.createRef();
  replyRef = React.createRef();
  vStageRef = React.createRef();
  vRef = React.createRef();
  promptRef = React.createRef();

  /* The post box lives at the top of the feed. Once it has scrolled out of
     view, a slim copy slides in at the bottom, like a chat input, and opens
     the same full composer. A capture-phase scroll listener hears whichever
     element scrolls (the window here, the portal's main in My NGG), and a
     jump straight past the box counts as much as a slow scroll. */
  watchPrompt() {
    if (this.onDockScr) return;
    const check = () => {
      this.dockRaf = 0;
      const el = this.promptRef.current;
      const on = !!el && el.getBoundingClientRect().bottom < this.dockTop;
      if (on !== !!this.state.dockOn) this.setState({ dockOn: on });
    };
    /* The scroller's own top edge, not the window's: on a phone the feed scrolls under a header. */
    this.dockTop = 0;
    this.onDockScr = e => {
      const t = e && e.target && e.target.getBoundingClientRect ? e.target.getBoundingClientRect().top : 0;
      if (this.promptRef.current && e && e.target && e.target.contains && !e.target.contains(this.promptRef.current)) return;
      this.dockTop = t + 4;
      if (!this.dockRaf) this.dockRaf = requestAnimationFrame(check);
    };
    document.addEventListener("scroll", this.onDockScr, true);
  }


  /* ── lifecycle ───────────────────────────────────────────────────────── */
  componentDidMount() {
    this.onWin = () => { const w = window.innerWidth || 1280; if (w !== this.state.w) this.setState({ w }); };
    window.addEventListener("resize", this.onWin); this.onWin();
    this.carT = setInterval(() => { if (!this.state.carPaused && !this.carHover && !this.state.comp && !this.state.viewer && !cm3Reduced()) this.setState(st => ({ car: (st.car || 0) + 1 })); }, 6500);
    this.onKey = e => { if (e.key === "Escape") { const s = this.state; if (s.viewer) { if (s.viewer.type !== "video") this.closeViewer(); return; } if (s.report) return this.setState({ report: null }); if (s.comp) return this.setState({ comp: null }); if (s.card) return this.setState({ card: null }); if (s.rxOpen) return this.setState({ rxOpen: null }); if (s.thread && s.quote) return this.setState({ quote: null }); if (s.thread) { this.thLanded = null; return this.setState({ thread: null }); } if (s.sheet) return this.setState({ sheet: false }); } };
    document.addEventListener("keydown", this.onKey);
    /* Paste a picture straight into an open composer and it uploads as the post's photo. */
    this.onPaste = e => { if (!this.state.comp || this.state.comp.media) return; const it = Array.from((e.clipboardData || {}).items || []).find(x => x.kind === "file" && /^image\//.test(x.type)); if (it) { e.preventDefault(); this.upload("photo", it.getAsFile()); } };
    document.addEventListener("paste", this.onPaste);
    this.onNet = () => { const was = this.state.offline, off = navigator.onLine === false; this.setState({ offline: off }, () => { if (was && !off) this.refresh(); }); };
    window.addEventListener("online", this.onNet); window.addEventListener("offline", this.onNet); this.onNet();
    this.boot();
    this.watchPrompt();
    /* Who is typing — polled only while a channel is open and the tab is
       visible; shared hosting has no push (domain/community.php §typing). */
    this.typT = setInterval(() => { const s = this.state; if (s.view !== "channel" || document.visibilityState !== "visible" || !s.boot) return; const ch = s.ch; this.api().typingWho(ch).then(r => { if (this.state.ch === ch && this.state.view === "channel" && (r.says || "") !== this.state.typing) this.setState({ typing: r.says || "" }); }).catch(() => {}); }, 6000);
    this.refT = setInterval(() => this.refresh(), 60000);
    /* An open thread is a conversation: new replies arrive while it is open
       (polled, visible tab only — shared hosting has no push). */
    this.thT = setInterval(() => { const s = this.state; if (!s.thread || document.visibilityState !== "visible" || !s.boot) return; this.loadComments(s.thread, true); }, 8000);
    // Deep link: /community?post=CP-… opens that post's thread.
    // A "Copy link at 0:42" link carries #t=42: the video opens at that moment.
    try { const pid = new URLSearchParams(location.search).get("post"); if (pid) this.openPost(pid, parseInt((String(location.hash).match(/t=(\d+)/) || [])[1] || "0", 10)); } catch (e) {}
  }
  componentWillUnmount() {
    window.removeEventListener("resize", this.onWin); document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("paste", this.onPaste);
    document.removeEventListener("scroll", this.onDockScr, true); cancelAnimationFrame(this.dockRaf);
    window.removeEventListener("online", this.onNet); window.removeEventListener("offline", this.onNet);
    clearInterval(this.carT); clearTimeout(this.tt); clearTimeout(this.tb); clearInterval(this.typT); clearInterval(this.refT); clearInterval(this.thT); this.vOff(); this.flushUndo();
  }
  api() { return NGGApi.member.community; }
  /* Whether a new post belongs in the list on screen: a post is not "saved",
     a "mention" or a search hit just because you wrote it. */
  feedTakes(st, p, ch) {
    if (st.view === "channel") return st.ch === ch && !st.q.trim();
    if (st.view !== "home" || st.q.trim() || st.byAuthor) return false;
    return st.filter === "all" || st.filter === "mine" || (st.filter === "questions" && p.kind === "question");
  }
  /* Shared hosting has no push: once a minute, while the tab is visible, the
     counts are re-read and new posts at the top of an unscrolled feed are
     added. Nothing is replaced, so a post being read never jumps. */
  refresh() {
    const s0 = this.state;
    if (!s0.boot || document.visibilityState !== "visible" || s0.offline) return;
    this.api().v3boot().then(b => this.setState(st => {
      const read = st.view === "channel" ? { [st.ch]: true } : {};
      return { boot: Object.assign({}, st.boot, { channels: b.channels || st.boot.channels, counts: b.counts || st.boot.counts }), read };
    }, () => { if (this.state.view === "channel") this.api().markRead(this.state.ch).catch(() => {}); })).catch(() => {});
    const s = this.state;
    if (s.feedPage !== 0 || s.loading || s.q.trim() || s.byAuthor || !(s.view === "home" || (s.view === "channel" && s.chTab === "posts"))) return;
    const key = this.feedChannel();
    this.api().v3feed(key, 0).then(r => this.setState(st => {
      if (st.feedKey !== key || st.feedPage !== 0) return null;
      const fresh = (r.posts || []).map(p => this.adapt(p)).filter(p => !st.posts.some(x => x.id === p.id));
      return fresh.length ? { posts: fresh.concat(st.posts) } : null;
    })).catch(() => {});
  }
  boot() {
    this.setState({ bootErr: "" });
    this.api().v3boot().then(b => {
      const first = (b.channels || []).find(c => c.mine && c.slug !== "commons") || (b.channels || [])[0] || {};
      this.setState({ boot: b, stars: b.me.starsLeft || 0, ch: this.state.ch || first.slug || "commons" }, () => { this.loadFeed(true); this.loadHome(); this.loadHw(); });
    }).catch(e => this.setState({ bootErr: cm3Err(e, "Couldn’t open the Community.") }));
  }
  loadHome() { this.api().home().then(r => this.setState({ slides: r.slides || [] })).catch(() => {}); }
  /* A failed board is an error with a retry, never an empty board: "All handed
     in" on an outage tells a child they have nothing to do. */
  loadHw() { this.setState({ hwErr: "" }); this.api().hwBoard().then(r => this.setState({ hw: r.homework || [], hwErr: "" })).catch(e => this.setState(st => ({ hwErr: cm3Err(e, "Couldn’t load the homework."), hw: st.hw }))); }
  loadFiles() { const s = this.state; this.api().v3files(s.view === "channel" ? s.ch : "").then(r => this.setState({ files: r.files || [] })).catch(e => { this.setState({ files: [] }); this.flash(cm3Err(e, "Couldn’t load the files.")); }); }
  feedChannel() { const s = this.state; return s.view === "channel" ? s.ch : (CM3_FEED_FILTER[s.filter] || "all"); }
  loadFeed(reset) {
    /* The feed keeps its own page (the PDF viewer's page used to share `page`,
       so "Show older" re-asked for page 1 after any viewer), and every load
       carries a number: only the newest answer is applied, so a slow reply
       from the channel you just left can never replace the one you are in. */
    const key = this.feedChannel(), page = reset ? 0 : this.state.feedPage + 1, seq = (this.feedSeq = (this.feedSeq || 0) + 1);
    if (reset) this.setState({ loading: true, feedErr: "", feedKey: key });
    /* Search asks the server — in a channel too. Filtering the page already on
       screen only ever searched the newest twenty posts. */
    const st0 = this.state, qq = st0.q.trim(), by = st0.view === "home" && st0.byAuthor ? st0.byAuthor.key : "";
    const load = (qq.length >= 2 && (st0.view === "home" || st0.view === "channel")) || by
      ? this.api().search(qq.length >= 2 ? qq : "", st0.view === "channel" ? st0.ch : "all", by).then(r => ({ posts: r.posts || [], hasMore: false }))
      : this.api().v3feed(key, page);
    load.then(r => this.setState(st => {
      if (seq !== this.feedSeq || st.feedKey !== key) return null;
      const posts = (r.posts || []).map(p => this.adapt(p));
      return { posts: reset ? posts : st.posts.concat(posts.filter(p => !st.posts.some(x => x.id === p.id))), hasMore: !!r.hasMore, feedPage: page, loading: false };
    })).catch(e => { if (seq === this.feedSeq) this.setState({ loading: false, feedErr: cm3Err(e, "Couldn’t load the posts.") }); });
    if (reset && this.state.view === "channel") this.api().markRead(key).then(() => this.setState(st => ({ read: Object.assign({}, st.read, { [key]: true }) }))).catch(() => {});
  }
  loadMod() {
    const A = NGGApi.admin.community, me = this.state.boot.me;
    const lock = e => { if ((e && (e.code || e.message || "")).indexOf("admin_2fa_required") >= 0) { this.setState({ modLocked: true }); return true; } return false; };
    A.queue("queue").then(r => this.setState({ queue: (r.posts || []), qComments: r.comments || [], modLocked: false })).catch(e => { if (!lock(e)) this.setState({ queue: [], modErr: cm3Err(e, "Couldn’t load the queue.") }); });
    A.stats().then(r => this.setState({ stats: r })).catch(lock);
    if (me.canSafeguard) A.safeguarding("open").then(r => this.setState({ cases: r.cases || [] })).catch(e => { if (!lock(e)) this.setState({ cases: [] }); });
    A.health().then(r => this.setState({ health: r })).catch(lock);
    A.overview().then(r => this.setState({ chanAdmin: r.channels || [] })).catch(lock);
  }

  /* ── adapters ────────────────────────────────────────────────────────── */
  adapt(p) {
    const media = p.mediaType === "image" ? { type: "photo", url: p.mediaUrl, alt: p.altText, name: p.altText || "Photo" }
      : p.mediaType === "video" ? { type: "video", name: p.postId, url: p.mediaUrl, poster: p.mediaPoster || (typeof cmPoster === "function" ? cmPoster(p.mediaUrl) : ""), dur: p.mediaDuration || 0, title: (p.video && p.video.title) || "", chapters: (p.video && p.video.chapters) || 0, captions: !!(p.video && p.video.captions) }
      : p.mediaType === "doc" ? { type: "doc", name: p.altText || "Document", url: p.mediaUrl, pages: p.mediaPages || 0, format: p.mediaFormat || "", meta: (p.mediaFormat || "PDF").toUpperCase() + (p.mediaPages ? " · " + p.mediaPages + (p.mediaPages === 1 ? " page" : " pages") : "") }
      : p.mediaType === "code" ? { type: "code", key: p.postId, title: (p.code && p.code.title) || "index.html", peek: (p.code && p.code.peek) || "" }
      : p.linkPreview ? { type: "link", url: p.linkPreview.url, host: p.linkPreview.site || (String(p.linkPreview.url || "").split("/")[2] || ""), title: p.linkPreview.title || p.linkPreview.url, image: p.linkPreview.image || "" } : null;
    const a = p.author || {};
    this.person(p.authorKey, { name: a.isMe ? this.state.boot && this.state.boot.me.name || a.name : a.name, centre: a.centre, staff: !!a.staff, role: p.authorRole || (a.staff ? "Staff" : "Student"), photo: a.photo });
    return { id: p.postId, ch: (p.channel || {}).slug, author: p.authorKey, isMine: !!a.isMe, ago: cm3Ago(p.createdAt), createdAt: p.createdAt, kind: p.kind === "post" ? "" : p.kind, body: p.body || "",
      media, reacts: p.reactions && !Array.isArray(p.reactions) ? Object.assign({}, p.reactions) : {}, mine: p.myReaction || "", saved: !!p.bookmarked, pinned: !!p.pinned,
      stars: p.stars || 0, myStar: !!p.starred, n: p.commentCount || 0, poll: p.poll ? { opts: p.poll.options.map(o => [o.text, o.votes]), voted: p.poll.myVote } : null,
      hw: p.homeworkId || "", answerId: p.answerId || "", answered: !!p.answered, status: p.status, note: p.moderationNote || "", mentionsMe: !!p.mentionsMe, featured: !!p.featured };
  }
  /* People are known only by what the server has shown: authors, repliers, the
     viewer. Keyed by an opaque key; never a member id. */
  person(key, o) {
    if (!key) return;
    this.people = this.people || {};
    const was = this.people[key] || {};
    this.people[key] = Object.assign({}, was, o, { ini: cm3Ini(o.name || was.name), tone: cm3Tone(key) });
  }
  who(key) { return (this.people || {})[key] || { name: "Member", ini: "?", tone: "#eee", role: "Student", centre: "" }; }
  /* The server's handle, made the same way (community_member_handle): first
     name, a hyphen, the surname's initial — "Ada N." and "Ada Njoku" are both
     @ada-n. It used to be "ada.n.", which matched nobody, so a mention made
     from a profile card notified no one. */
  handle(name) {
    const parts = String(name || "").trim().split(/\s+/), first = parts[0] || "", li = parts[1] ? parts[1].charAt(0) : "";
    return (first + (li ? "-" + li : "")).toLowerCase().replace(/[^a-z0-9._-]+/g, "").replace(/^[-._]+|[-._]+$/g, "");
  }

  /* ── small helpers ───────────────────────────────────────────────────── */
  flash(t, undo) { clearTimeout(this.tt); this.setState({ toast: t, toastUndo: undo || null }); this.tt = setTimeout(() => this.setState({ toast: "", toastUndo: null }), undo ? 6000 : 3600); }
  /* Irreversible acts (deleting your own post) wait out a short Undo window. */
  later(fn, label) { this.flushUndo(); this.pending = { fn, t: setTimeout(() => { this.pending = null; fn(); }, 6000) }; this.flash(label, () => { clearTimeout(this.pending.t); const p = this.pending; this.pending = null; p && p.undo && p.undo(); }); return this.pending; }
  flushUndo() { if (this.pending) { clearTimeout(this.pending.t); const f = this.pending.fn; this.pending = null; f(); } }
  updPost(id, fn) { this.setState(s => ({ posts: s.posts.map(p => p.id === id ? fn(Object.assign({}, p)) : p), opened: s.opened && s.opened.id === id ? fn(Object.assign({}, s.opened)) : s.opened })); }
  segs(text) {
    const meKey = this.state.boot.me.key, P = this.people || {};
    return String(text || "").split(/(@[a-z0-9_.-]*[a-z0-9_]|\p{Extended_Pictographic}️?)/iu).filter(x => x).map(t => {
      if (t[0] === "@") {
        const hd = t.slice(1).toLowerCase();
        if (["all", "everyone", "channel", "here"].includes(hd)) return { isMention: true, label: "@" + hd, ini: "@", tone: "#f5b026", bg: "#fdf1d6", fg: "#6b4b00", ring: "#f1d58f", title: "Everyone in this channel", go: () => {} };
        const me = hd === String(this.state.boot.me.handle || "").toLowerCase();
        const k = Object.keys(P).find(x => this.handle(P[x].name) === hd || String(P[x].name || "").toLowerCase().split(" ")[0] === hd.split(/[-.]/)[0]);
        if (me || k) { const pp = me ? { name: this.state.boot.me.name, ini: cm3Ini(this.state.boot.me.name), tone: cm3Tone(meKey), role: this.state.boot.me.roleLabel } : P[k];
          return { isMention: true, label: me ? "You" : pp.name.split(" ")[0], ini: pp.ini, tone: pp.tone, bg: me ? "#fdf1d6" : "#eef1fb", fg: me ? "#6b4b00" : "#2a3f9e", ring: me ? "#f1d58f" : "#d6dcf5", title: pp.name + " · " + (pp.role || ""), go: () => this.setState({ card: me ? meKey : k }) }; }
        return { isText: true, t };
      }
      const src = cm3EmojiSrc(t);
      if (src) return { isEmoji: true, t, src };
      return { isText: true, t };
    });
  }
  /** The safety check, built from the server's own rules (cm3_safety_rules). */
  check(text, media) {
    const R = this.state.boot.rules, t = (text || "").trim();
    if (!t && !media) return null;
    if (new RegExp(R.phone, "u").test(t) || new RegExp("\\d{" + R.digitsRun + ",}").test(t.replace(/[\s-]/g, ""))) return { v: "review", icon: "ph ph-lock-key", msg: R.msg.phone };
    const hit = R.unkind.find(([w]) => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "iu").test(t));
    if (hit) return { v: "review", icon: "ph ph-hand-heart", msg: R.msg.unkind.replace("{w}", hit[0]), fix: t.replace(new RegExp("\\b" + hit[0] + "\\b", "igu"), hit[1]), fixLabel: "Use a kinder version" };
    if (new RegExp(R.social, "iu").test(t)) return { v: "review", icon: "ph ph-link-break", msg: R.msg.social };
    if (t.length > R.capsMin && t === t.toUpperCase() && /[A-Z]{4}/.test(t)) return { v: "nudge", icon: "ph ph-speaker-high", msg: R.msg.caps, fix: t.charAt(0) + t.slice(1).toLowerCase(), fixLabel: "Make it lowercase" };
    if (media === "video") return { v: "video", icon: "ph ph-video-camera", msg: R.msg.video };
    if (t.length < 2) return null;
    return { v: "ok", icon: "ph ph-check-circle", msg: R.msg.ok };
  }
  hwStats(h) { const c = h.cohort || []; const r = c.filter(x => x.state === "reviewed").length, w = c.filter(x => x.state === "waiting").length; return { total: c.length, r, w, m: c.length - r - w, handed: r + w }; }
  goCh(slug) { return () => this.setState(st => ({ view: "channel", ch: slug, chTab: "posts", thread: null, picker: null, digest: false, sheet: false, q: "", byAuthor: null, typing: "" }), () => { this.loadFeed(true); }); }
  /* A task counts as seen the first time its card is on screen, which is what
     the instructor's "Not seen since…" line reads. Sent once per task. */
  componentDidUpdate() {
    const s = this.state;
    const onHw = s.view === "homework" || (s.view === "channel" && s.chTab === "homework");
    /* The People tab is everyone who has posted in the channel (the server's
       list), not only the authors of the twenty posts on screen. */
    if (s.view === "channel" && s.chTab === "people" && s.ch && !(s.chMembers || {})[s.ch] && !(this.memAsked || {})[s.ch]) {
      this.memAsked = Object.assign({}, this.memAsked, { [s.ch]: true });
      const slug = s.ch;
      this.api().members(slug).then(r => this.setState(st => ({ chMembers: Object.assign({}, st.chMembers, { [slug]: r.members || [] }) })))
        .catch(() => { this.memAsked[slug] = false; this.setState(st => ({ chMembers: Object.assign({}, st.chMembers, { [slug]: null }) })); });
    }
    if (!onHw || !s.hw || !this.api()) return;
    this.hwSeenSent = this.hwSeenSent || {};
    for (const h of s.hw) {
      if (h.seen !== false || this.hwSeenSent[h.id] || (s.view === "channel" && h.ch !== s.ch)) continue;
      this.hwSeenSent[h.id] = true;
      this.api().homeworkSeen(h.id).catch(() => {});   // best-effort; not retried in a loop
    }
  }
  goView(view, extra) { return () => this.setState(Object.assign({ view, thread: null, picker: null, digest: false, sheet: false, byAuthor: null }, extra || {}), () => {
    if (view === "home") this.loadFeed(true);
    if (view === "files") this.loadFiles();
    if (view === "homework") this.loadHw();
    if (view === "mod") this.loadMod();
  }); }
  /* A post opened by itself (a link, a notification, Catch me up) is kept
     beside the feed, not in it: the feed reloading when the Community boots
     used to replace the list and close the thread a link had just opened. */
  openPost(pid, at) {
    this.api().post_get(pid).then(r => {
      const p = this.adapt(r.post);
      this.setState({ opened: p, thread: p.id }, () => { if (at > 0 && p.media && p.media.type === "video") this.openViewer("video", p.id, p.id, at); });
      this.loadComments(p.id);
    }).catch(() => this.flash("That post isn’t available any more."));
  }
  /* `quiet` is the open thread's own refresh: an error then is not news, and
     replies that arrive while the reader is scrolled up are counted for the
     "new replies" button instead of moving the page under them. */
  loadComments(pid, quiet) {
    this.api().comments(pid).then(r => {
      (r.comments || []).forEach(c => this.person(c.authorKey, { name: c.name, staff: !!c.staff, role: c.role || (c.staff ? "Staff" : "Student"), photo: c.photo }));
      const had = this.state.comments[pid], list = r.comments || [];
      if (quiet && had && had.length === list.length && list.every((c, i) => had[i] && had[i].commentId === c.commentId && JSON.stringify(had[i].reactions || {}) === JSON.stringify(c.reactions || {}))) return;
      const added = had ? list.filter(c => !had.some(h => h.commentId === c.commentId) && !c.isMe).length : 0;
      const away = this.state.thAway && this.state.thread === pid;
      const landing = this.state.thread === pid && this.thLanded !== pid;
      const patch = { comments: Object.assign({}, this.state.comments, { [pid]: list }), thNew: away ? this.state.thNew + added : 0 };
      if (landing) { this.thLanded = pid; patch.thSeenAt = this.thSeen(pid); }
      this.setState(patch, () => {
        if (this.state.thread !== pid) return;
        this.thSeen(pid, list.length);
        if (landing) this.thOpened(pid); else if (!away && added) this.thBottom(true);
      });
    }).catch(() => { if (!quiet) this.setState(st => ({ commentsErr: Object.assign({}, st.commentsErr, { [pid]: true }) })); });
  }
  /* Where a reader left a thread: how many replies they had seen (this
     browser only). Opening it again lands on the first new one, under a
     "new replies" line, as a chat does. */
  thSeen(pid, n) {
    let m = {}; try { m = JSON.parse(localStorage.getItem("cm3.seen") || "{}") || {}; } catch (e) {}
    if (n === undefined) return m[pid];
    m[pid] = n; const keys = Object.keys(m); if (keys.length > 300) delete m[keys[0]];
    try { localStorage.setItem("cm3.seen", JSON.stringify(m)); } catch (e) {}
  }
  thOpened(pid) {
    const el = this.thRef.current; if (!el) return;
    const first = el.querySelector("[data-newline]");
    if (first) first.scrollIntoView({ block: "center" }); else el.scrollTop = el.scrollHeight;
  }
  thBottom(smooth) { const el = this.thRef.current; if (!el) return; el.scrollTo({ top: el.scrollHeight, behavior: smooth && !cm3Reduced() ? "smooth" : "auto" }); this.setState({ thNew: 0, thAway: false }); }
  thScroll(e) {
    const el = e.currentTarget, away = el.scrollHeight - el.scrollTop - el.clientHeight > 120;
    if (away !== this.state.thAway) this.setState(away ? { thAway: true } : { thAway: false, thNew: 0 });
  }
  /* Jump to the reply a quote points at, and light it for a moment. */
  thJump(cid) {
    const el = this.thRef.current && this.thRef.current.querySelector('[data-cid="' + cid + '"]');
    if (!el) return this.flash("That reply isn’t here any more.");
    el.scrollIntoView({ block: "center", behavior: cm3Reduced() ? "auto" : "smooth" });
    clearTimeout(this.hlT); this.setState({ hl: cid }); this.hlT = setTimeout(() => this.setState({ hl: null }), 1600);
  }
  quoteReply(c) {
    this.setState({ quote: { commentId: c.commentId, name: c.name || "Member", body: String(c.body || "").slice(0, 140) }, rxOpen: null });
    setTimeout(() => this.replyRef.current && this.replyRef.current.focus(), 0);
  }
  reactReply(pid, c, e) {
    const keep = c;
    const upd = f => this.setState(st => ({ comments: Object.assign({}, st.comments, { [pid]: (st.comments[pid] || []).map(x => x.commentId === c.commentId ? f(Object.assign({}, x)) : x) }) }));
    upd(x => { const r = Object.assign({}, x.reactions || {}); if (x.myReaction) r[x.myReaction] = Math.max(0, (r[x.myReaction] || 0) - 1); if (x.myReaction === e) x.myReaction = ""; else { r[e] = (r[e] || 0) + 1; x.myReaction = e; } x.reactions = r; return x; });
    this.setState({ rxOpen: null });
    this.api().commentReact(c.commentId, e).then(r => upd(x => Object.assign(x, { reactions: r.reactions || {}, myReaction: r.myReaction || "" })))
      .catch(err => { upd(x => Object.assign(x, { reactions: keep.reactions, myReaction: keep.myReaction })); this.flash(cm3Err(err, "Couldn’t react.")); });
  }
  /* Touch: swipe a reply to the right to answer it; hold it for reactions.
     Both have a button too — nothing here needs a gesture. */
  thPointer(e) {
    const t = e.target.closest && e.target.closest("[data-cid]"); if (!t || e.pointerType === "mouse" || e.target.closest("button,a")) return;
    const cid = t.getAttribute("data-cid"), x0 = e.clientX, y0 = e.clientY; let dx = 0, moved = false;
    const hold = setTimeout(() => { if (!moved) this.setState({ rxOpen: cid }); }, 520);
    const move = ev => { const mx = ev.clientX - x0, my = ev.clientY - y0; if (Math.abs(mx) > 8 || Math.abs(my) > 8) moved = true; if (Math.abs(my) > Math.abs(mx)) return; dx = Math.max(0, Math.min(72, mx)); t.style.transform = dx ? "translateX(" + dx + "px)" : ""; };
    const up = () => { clearTimeout(hold); t.style.transform = ""; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      if (dx >= 56) { const pid = this.state.thread, c = (this.state.comments[pid] || []).find(x => x.commentId === cid); if (c) this.quoteReply(c); } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  }

  /* ── actions ─────────────────────────────────────────────────────────── */
  react(id, e) {
    const p0 = this.postById(id); if (!p0) return;
    if (p0.mine !== e && !cm3Reduced()) { clearTimeout(this.tb); this.setState({ burst: { id, e, k: Date.now() } }); this.tb = setTimeout(() => this.setState({ burst: null }), 1200); }
    this.updPost(id, p => { const r = Object.assign({}, p.reacts); if (p.mine) r[p.mine] = Math.max(0, (r[p.mine] || 0) - 1); if (p.mine === e) p.mine = ""; else { r[e] = (r[e] || 0) + 1; p.mine = e; } p.reacts = r; return p; });
    this.api().react(id, e).then(r => this.updPost(id, p => Object.assign(p, { reacts: Array.isArray(r.reactions) ? {} : r.reactions || {}, mine: r.myReaction || "" })))
      .catch(err => { this.updPost(id, p => Object.assign(p, { reacts: p0.reacts, mine: p0.mine })); this.flash(cm3Err(err, "Couldn’t react.")); });
  }
  vote(id, i) {
    const p0 = this.postById(id);
    this.updPost(id, x => { const op = x.poll.opts.map(z => z.slice()); if (x.poll.voted >= 0) op[x.poll.voted][1]--; op[i][1]++; x.poll = { opts: op, voted: i }; return x; });
    this.api().vote(id, i).then(r => r.poll && this.updPost(id, x => Object.assign(x, { poll: { opts: r.poll.options.map(o => [o.text, o.votes]), voted: r.poll.myVote } })))
      .catch(e => { this.updPost(id, x => Object.assign(x, { poll: p0.poll })); this.flash(cm3Err(e, "Couldn’t vote.")); });
  }
  save(id) {
    this.updPost(id, x => Object.assign(x, { saved: !x.saved }));
    this.api().bookmark(id).then(r => { this.updPost(id, x => Object.assign(x, { saved: !!r.bookmarked }));
      // Unsaved while looking at Saved: it leaves the list, as Saved now says.
      if (!r.bookmarked && this.state.view === "home" && this.state.filter === "saved") this.setState(st => ({ posts: st.posts.filter(x => x.id !== id) })); this.flash(r.bookmarked ? "Saved. Find it under Saved." : "Removed from Saved."); })
      .catch(e => { this.updPost(id, x => Object.assign(x, { saved: !x.saved })); this.flash(cm3Err(e)); });
  }
  star(p, first) {
    if (p.myStar || this.state.stars < 1) return;
    this.updPost(p.id, x => Object.assign(x, { stars: x.stars + 1, myStar: true }));
    this.setState(s => ({ stars: s.stars - 1 }));
    this.api().star(p.id).then(r => { this.setState({ stars: r.starsLeft }); this.updPost(p.id, x => Object.assign(x, { stars: r.stars, myStar: !!r.starred })); this.flash("Genius Star sent. " + first + " gets a notification."); })
      .catch(e => { this.updPost(p.id, x => Object.assign(x, { stars: Math.max(0, x.stars - 1), myStar: false })); this.setState(s => ({ stars: s.stars + 1 })); this.flash(cm3Err(e)); });
  }
  removeMine(p) {
    const keep = this.state.posts;
    this.setState(s => ({ posts: s.posts.filter(x => x.id !== p.id), thread: s.thread === p.id ? null : s.thread }));
    const pend = this.later(() => this.api().remove("post", p.id).catch(e => { this.setState({ posts: keep }); this.flash(cm3Err(e, "Couldn’t delete it.")); }), "Your post was deleted.");
    pend.undo = () => this.setState({ posts: keep });
  }
  removeReply(pid, c) {
    const keep = this.state.comments[pid] || [];
    this.setState(st => ({ comments: Object.assign({}, st.comments, { [pid]: keep.filter(x => x.commentId !== c.commentId) }) }));
    if (c.status === "published") this.updPost(pid, p => Object.assign(p, { n: Math.max(0, p.n - 1) }));
    const pend = this.later(() => this.api().remove("comment", c.commentId).catch(e => {
      this.setState(st => ({ comments: Object.assign({}, st.comments, { [pid]: keep }) }));
      if (c.status === "published") this.updPost(pid, p => Object.assign(p, { n: p.n + 1 }));
      this.flash(cm3Err(e, "Couldn’t delete your reply."));
    }), "Your reply was deleted.");
    pend.undo = () => { this.setState(st => ({ comments: Object.assign({}, st.comments, { [pid]: keep }) })); if (c.status === "published") this.updPost(pid, p => Object.assign(p, { n: p.n + 1 })); };
  }
  caseUpdate(c, change, done) {
    NGGApi.admin.community.safeguardingUpdate(c.caseId, change)
      .then(() => { this.flash(done); return NGGApi.admin.community.safeguarding("open").then(r => this.setState({ cases: r.cases || [] })); })
      .catch(e => this.flash(cm3Err(e, "Couldn’t update the case.")));
  }
  sendReport() {
    const s = this.state, rp = s.report; if (!rp || !rp.reason) return;
    // A reported reply leaves the thread; a reported post leaves the feed (and closes its thread).
    this.setState({ report: null, hidden: Object.assign({}, s.hidden, { [rp.id]: true }), thread: rp.type !== "comment" && s.thread === rp.id ? null : s.thread });
    this.api().report(rp.type || "post", rp.id, rp.reason)
      .then(() => this.flash(rp.reason === "safety" ? "Sent to a trained safeguarding lead. Thank you for telling us." : "Reported. A mentor will look at it. Nobody will know it was you."))
      .catch(e => this.flash(cm3Err(e, "Couldn’t send the report.")));
  }
  sendReply() {
    const s = this.state, t = s.reply.trim(), pid = s.thread; if (!t || !pid || s.busy) return;
    this.setState({ busy: true });
    const q = s.quote;
    this.api().comment(pid, t, q ? q.commentId : "").then(r => {
      const c = Object.assign({ authorKey: s.boot.me.key, role: s.boot.me.staff ? s.boot.me.roleLabel : "" }, r.comment);
      this.person(s.boot.me.key, { name: s.boot.me.name, staff: s.boot.me.staff, role: s.boot.me.roleLabel });
      this.setState(st => ({ reply: "", busy: false, quote: null, comments: Object.assign({}, st.comments, { [pid]: (st.comments[pid] || []).concat([c]) }) }), () => this.thBottom(true));
      this.updPost(pid, p => Object.assign(p, { n: p.n + (r.queued ? 0 : 1) }));
      if (r.queued) this.flash("Your reply is waiting for a quick check before others see it.");
    }).catch(e => { this.setState({ busy: false }); if (e.code === "crisis") this.setState({ crisis: e.detail || "" }); else this.flash(cm3Err(e, "Couldn’t send your reply.")); });
  }
  markAnswer(pid, cid) {
    this.api().answer(pid, cid).then(r => {
      this.updPost(pid, p => Object.assign(p, { answerId: r.answerId, answered: !!r.answerId }));
      this.setState(st => ({ comments: Object.assign({}, st.comments, { [pid]: (st.comments[pid] || []).map(c => Object.assign({}, c, { isAnswer: c.commentId === r.answerId })) }) }));
      this.flash(r.answerId ? "Marked as the answer." : "No longer marked as the answer.");
    }).catch(e => this.flash(cm3Err(e)));
  }
  openComp(type) {
    const s = this.state, b = s.boot, mine = b.channels.filter(c => c.mine);
    const course = (mine.find(c => c.slug !== "commons") || {}).slug || "commons";
    const def = type === "homework" && (s.view !== "channel" || s.ch === "commons") ? course : s.view === "channel" ? s.ch : (type === "question" || type === "work") ? ((mine.find(c => c.slug !== "commons") || {}).slug || "commons") : (b.me.staff ? ((mine.find(c => c.slug !== "commons") || {}).slug || "commons") : "commons");
    const due = new Date(Date.now() + 4 * 86400000); due.setHours(18, 0, 0, 0);
    const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    this.setState({ comp: { type: type || "post", ch: def, text: this.draft(def) || "", opts: ["", ""], media: null, up: 0, hwTitle: "", hwDue: iso(due) + " 18:00", captions: "" }, picker: null, sheet: false });
  }
  draft(ch, text) { const k = "cm3-draft:" + ch; try { if (text === undefined) return localStorage.getItem(k) || ""; if (text) localStorage.setItem(k, text); else localStorage.removeItem(k); } catch (e) {} return ""; }
  /* Attach: a real file for photo, video, file and code; a link goes in the
     text, where the server unfurls it. */
  attach(kind) {
    const c = this.state.comp; if (!c) return;
    if (c.media && c.media.kind === kind) return this.setState({ comp: Object.assign({}, c, { media: null }) });
    if (kind === "link") { const t = c.text.replace(/\s*$/, ""); return this.setState({ comp: Object.assign({}, c, { text: (t ? t + "\n" : "") + "https://" }) }); }
    const inp = document.createElement("input"); inp.type = "file";
    inp.accept = kind === "photo" ? "image/*" : kind === "video" ? "video/*" : kind === "code" ? ".html,.htm,.css,.js,.txt" : kind === "captions" ? ".vtt,.srt" : ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip";
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) this.upload(kind, f); };
    inp.click();
  }
  async upload(kind, f) {
    const set = o => this.setState(s => ({ comp: s.comp ? Object.assign({}, s.comp, o) : s.comp }));
    const mb = f.size / 1048576;
    if (kind === "code" || kind === "captions") {
      if (f.size > (kind === "code" ? 20000 : 200000)) return this.flash(kind === "code" ? "Keep shared code under 20,000 characters." : "That captions file is too large.");
      const text = await f.text();
      if (kind === "captions") return set({ captions: text, capName: f.name });
      return set({ media: { kind: "code", code: text, title: f.name } });
    }
    if (kind === "video" && mb > CM_VIDEO_MAX_MB) return this.flash("That video is " + mb.toFixed(0) + "MB — keep clips under " + CM_VIDEO_MAX_MB + "MB.");
    if (kind === "photo" && mb > CM_IMAGE_MAX_MB) return this.flash("That image is too large — keep it under " + CM_IMAGE_MAX_MB + "MB.");
    if (kind === "doc" && mb > CM_DOC_MAX_MB) return this.flash("That file is too large — keep documents under " + CM_DOC_MAX_MB + "MB.");
    let duration = 0;
    if (kind === "video") { const m = await cmVideoMeta(f); duration = Math.round(m.duration || 0); if (duration > CM_VIDEO_MAX_SECS) return this.flash("Keep clips under 3 minutes."); }
    set({ up: 1 });
    try {
      const r = await NGGApi.uploadFile(f, "post", pct => set({ up: Math.max(1, pct) }));
      const format = (r.format || "").toLowerCase() || cmDocFormat(f.name || "");
      set({ up: 0, media: { kind, type: kind === "photo" ? "image" : kind, url: r.url, poster: kind === "video" ? cmPoster(r.url) : "", bytes: f.size, duration, name: f.name, format, pages: r.pages || 0 } });
    } catch (e) {
      set({ up: 0 });
      this.flash(/uploads_disabled|503/.test(String(e && e.message)) ? "Sharing files needs storage set up — ask an admin (Settings → Media storage)." : "Upload failed — try again.");
    }
  }
  submit() {
    const s = this.state, c = s.comp; if (!c || s.busy) return;
    const m = c.media, body = c.text.trim();
    const data = { channel: c.ch, body, kind: c.type === "post" ? "post" : c.type };
    if (c.type === "poll") data.pollOptions = c.opts.map(o => o.trim()).filter(Boolean);
    if (c.type === "homework") { data.hwTitle = c.hwTitle.trim(); data.hwDue = c.hwDue; }
    if (m && m.kind === "code") Object.assign(data, { mediaType: "code", code: m.code, codeTitle: m.title });
    else if (m) Object.assign(data, { mediaType: m.type, mediaUrl: m.url, mediaPoster: m.poster || "", mediaName: m.kind === "doc" ? m.name : "", mediaFormat: m.format || "", mediaPages: m.pages || 0, mediaBytes: m.bytes || 0, mediaDuration: m.duration || 0 });
    if (m && m.kind === "video") Object.assign(data, { chapters: body, captions: c.captions || "", videoTitle: "" });
    this.setState({ busy: true });
    this.api().typingStop(c.ch).catch(() => {});
    this.api().post(data).then(r => {
      this.draft(c.ch, "");
      const p = r.post ? this.adapt(r.post) : null;
      this.setState(st => ({ comp: null, busy: false, posts: p && this.feedTakes(st, p, c.ch) ? [p].concat(st.posts) : st.posts }));
      const chName = (s.boot.channels.find(x => x.slug === c.ch) || {}).name || "the channel";
      this.flash(r.queued ? "Sent for a quick check. Only you can see it until a mentor approves it." : c.type === "homework" ? "Homework set. Each student gets one private notification." : "Posted to " + chName + ".");
      if (c.type === "homework") this.loadHw();
    }).catch(e => { this.setState({ busy: false }); if (e.code === "crisis") this.setState({ crisis: e.detail || "" }); else this.flash(cm3Err(e, "Couldn’t post — try again.")); });
  }
  /* Pings the channel being WRITTEN in — the composer's or the open thread's —
     not whichever channel happens to be on screen. */
  typingPing(ch) { if (!ch) return; const now = Date.now(); if (ch === this.lastPingCh && now - (this.lastPing || 0) < 3000) return; this.lastPing = now; this.lastPingCh = ch; this.api().typingPing(ch).catch(() => {}); }

  /* ── moderation ──────────────────────────────────────────────────────── */
  moderate(it, act, extra, msg) {
    const A = NGGApi.admin.community;
    this.setState(s => ({ queue: (s.queue || []).filter(x => x.postId !== it.postId || it.commentId), qComments: s.qComments.filter(x => x.commentId !== it.commentId || !it.commentId) }));
    A.moderate(it.commentId ? "comment" : "post", it.commentId || it.postId, act, extra).then(r => { this.flash(msg + (r && r.caseId ? " Case " + r.caseId + "." : "")); A.stats().then(st => this.setState({ stats: st })).catch(() => {}); if (act === "escalate" && this.state.boot.me.canSafeguard) A.safeguarding("open").then(x => this.setState({ cases: x.cases || [] })).catch(() => {}); })
      .catch(e => { this.flash(cm3Err(e, "Couldn’t do that.")); this.loadMod(); });
  }

  /* ── video ───────────────────────────────────────────────────────────── */
  /* Read fresh each time it opens: what is unread changes as posts are read. A failure says so and can be retried. */
  loadDigest() {
    this.setState({ digestRes: null, digestErr: "" });
    this.api().digest("all").then(r => this.setState({ digestRes: r })).catch(() => this.setState({ digestErr: "Couldn’t read your unread posts just now. Tap to try again." }));
  }
  /* A post by id: in the feed, or the one a link opened beside it. */
  postById(id) { const s = this.state; return s.posts.find(p => p.id === id) || (s.opened && s.opened.id === id ? s.opened : null); }
  openViewer(type, key, post, at) {
    this.flushUndo();
    const m = (this.postById(post || key) || {}).media || {};
    this.setState({ viewer: { type, key, post: post || key, url: m.url, poster: m.poster, name: m.name, title: m.title, pages: m.pages || 0 }, vt: 0, vPlay: false, vDur: m.dur || 0, vMenu: null, vTab: null, vQ: "", page: 0, zoom: 100, codeSrc: null, codeRan: null, codeRunN: 0, codeHintOn: false, vNextIn: null, vResumed: null, pdfPages: 0 });
    if (type === "video" || type === "code") this.api().media(post || key).then(r => {
      // A link's moment (#t=) wins over where they stopped last time.
      const pos = at > 0 ? at : r.pos;
      this.setState(st => ({ media: Object.assign({}, st.media, { [r.postId]: r }), vResumed: type === "video" && pos > 3 && !(at > 0) ? pos : null }));
      if (type === "video" && pos > 3) { const v = this.vRef.current; if (v) v.currentTime = pos; this.setState({ vt: pos }); clearTimeout(this.vRT); this.vRT = setTimeout(() => this.setState({ vResumed: null }), 6000); }
    }).catch(() => {
      // Never "Loading…" for ever: the viewer says it could not load, and closing it is always there.
      const pid = post || key;
      this.setState(st => ({ media: Object.assign({}, st.media, { [pid]: Object.assign({}, st.media[pid] || {}, { failed: true, code: type === "code" ? "<!-- This code couldn't be loaded. Close it and try again. -->" : (st.media[pid] || {}).code }) }) }));
      this.flash(type === "video" ? "Couldn’t load the video’s chapters. It still plays." : "Couldn’t load the code. Close it and try again.");
    });
    if (type === "video") { window.addEventListener("keydown", this.vKey); document.addEventListener("fullscreenchange", this.vFsCh); this.vPoke(); }
  }
  closeViewer() { const st = this.state; if (st.viewer && st.viewer.type === "video") this.vSave(st.viewer.post, st.vt >= (st.vDur || 1) - 1 ? 0 : st.vt); this.vOff(); this.setState({ viewer: null, vPlay: false }); }
  vSave(pid, t) { const now = Date.now(); this.vSaved = now; this.api().videoPos(pid, t, this.state.vDur).then(() => this.setState(st => ({ media: Object.assign({}, st.media, { [pid]: Object.assign({}, st.media[pid] || {}, { pos: Math.floor(t) }) }) }))).catch(() => {}); }
  vOff() { window.removeEventListener("keydown", this.vKey); document.removeEventListener("fullscreenchange", this.vFsCh); clearTimeout(this.vIT); clearTimeout(this.vZT); clearTimeout(this.vFT); clearTimeout(this.vRT); clearInterval(this.vNT); }
  vEl() { return this.vRef.current; }
  vToggle() { const v = this.vEl(), st = this.state; if (!v) return; if (v.ended) { v.currentTime = 0; v.play().catch(() => {}); this.setState({ vNextIn: null }); return; } if (v.paused) v.play().catch(() => this.vFlashOn("ph ph-warning", "Tap play to start", "c")); else v.pause(); this.vFlashOn(v.paused ? "ph-fill ph-play" : "ph-fill ph-pause", "", "c"); this.setState({ vMenu: null, vResumed: null }); this.vPoke(); }
  vSeek(t) { const v = this.vEl(); if (!v) return; v.currentTime = Math.max(0, Math.min(v.duration || this.state.vDur || 0, t)); this.setState({ vt: v.currentTime, vNextIn: null, vResumed: null }); }
  vSeekBy(d) { this.vSeek(this.state.vt + d); this.vFlashOn(d < 0 ? "ph ph-arrow-counter-clockwise" : "ph ph-arrow-clockwise", Math.abs(d) + " seconds", d < 0 ? "l" : "r"); }
  vVolBy(d) { const st = this.state, base = st.vMuted ? 0 : (st.vVol ?? 1), v = Math.max(0, Math.min(1, Math.round((base + d) * 10) / 10)); this.setState({ vVol: v, vMuted: v === 0 }); this.vFlashOn(v === 0 ? "ph-fill ph-speaker-x" : v < 0.5 ? "ph-fill ph-speaker-low" : "ph-fill ph-speaker-high", Math.round(v * 100) + "%", "c"); }
  vMute() { const st = this.state, vv = st.vVol ?? 1, muted = st.vMuted || vv === 0; this.setState(muted ? { vMuted: false, vVol: vv > 0 ? vv : 0.6 } : { vMuted: true }); this.vFlashOn(muted ? "ph-fill ph-speaker-high" : "ph-fill ph-speaker-x", muted ? "Sound on" : "Muted", "c"); }
  vPoke() { if (this.state.vIdle) this.setState({ vIdle: false }); clearTimeout(this.vIT); this.vIT = setTimeout(() => { if (this.state.viewer) this.setState({ vIdle: true, vHov: null }); }, 2600); }
  vFlashOn(icon, label, side) { if (cm3Reduced()) return; clearTimeout(this.vFT); this.setState({ vFlash: { icon, label, side: side || "c", k: Date.now() } }); this.vFT = setTimeout(() => this.setState({ vFlash: null }), 760); }
  vFlashEl() {
    const f = this.state.vFlash; if (!f) return null;
    const h = React.createElement;
    return h("span", { key: f.k, "aria-hidden": true, className: "cm3x-vflash cm3x-vflash-" + f.side },
      h("span", { className: "cm3x-vflash-dot" }, h("i", { className: f.icon })), f.label ? h("span", { className: "cm3x-vflash-label" }, f.label) : null);
  }
  vZone(side) {
    if (this.state.vMenu) { this.setState({ vMenu: null }); return; }
    const now = Date.now(), L = this.vLastZ;
    if (L && L.side === side && now - L.t < 300) { clearTimeout(this.vZT); this.vLastZ = null; if (side === "c") this.vFull(); else this.vSeekBy(side === "l" ? -10 : 10); return; }
    this.vLastZ = { side, t: now }; clearTimeout(this.vZT); this.vZT = setTimeout(() => this.vToggle(), 240);
  }
  vFull() { const el = this.vStageRef.current; try { if (document.fullscreenElement) document.exitFullscreen(); else if (el && el.requestFullscreen) el.requestFullscreen().catch(() => this.vFlashOn("ph ph-corners-out", "Full screen isn’t available here", "c")); } catch (e) {} }
  vFsCh = () => this.setState({ vFs: !!document.fullscreenElement });
  vKey = e => {
    const st = this.state; if (!st.viewer || st.viewer.type !== "video") return;
    const tg = e.target || {}, tag = tg.tagName, k = e.key;
    if (e.metaKey || e.ctrlKey || e.altKey || tag === "TEXTAREA" || (tag === "INPUT" && tg.type !== "range")) return;
    if (tag === "BUTTON" && (k === " " || k === "Enter")) return;
    if (tag === "INPUT" && /^Arrow/.test(k)) return;
    const dur = st.vDur || 0, set = o => this.setState(o), sp = [0.5, 0.75, 1, 1.25, 1.5, 2], si = Math.max(0, sp.indexOf(st.vSpeed || 1));
    const speed = x => { set({ vSpeed: x }); this.vFlashOn("ph ph-gauge", x === 1 ? "Normal speed" : x + "×", "c"); };
    const map = { " ": () => this.vToggle(), k: () => this.vToggle(), j: () => this.vSeekBy(-10), l: () => this.vSeekBy(10), ArrowLeft: () => this.vSeekBy(-5), ArrowRight: () => this.vSeekBy(5), ArrowUp: () => this.vVolBy(0.1), ArrowDown: () => this.vVolBy(-0.1), m: () => this.vMute(),
      c: () => { set({ vCap: st.vCap === false }); this.vFlashOn("ph ph-closed-captioning", st.vCap === false ? "Captions on" : "Captions off", "c"); },
      f: () => this.vFull(), t: () => { if ((st.w || 1280) >= 1100) set({ vTheater: !st.vTheater }); },
      "<": () => speed(sp[Math.max(0, si - 1)]), ">": () => speed(sp[Math.min(sp.length - 1, si + 1)]),
      "?": () => set({ vMenu: st.vMenu === "keys" ? null : "keys" }),
      Escape: () => { if (st.vMenu) set({ vMenu: null }); else if (!document.fullscreenElement) this.closeViewer(); } };
    let fn = map[k && k.length === 1 ? k.toLowerCase() : k];
    if (!fn && /^[0-9]$/.test(k)) fn = () => this.vSeek(dur * +k / 10);
    if (fn) { e.preventDefault(); fn(); this.vPoke(); }
  };
  videoPosts() { return this.state.posts.filter(p => p.media && p.media.type === "video" && p.status === "published"); }
  vNextPost(pid) { const all = this.videoPosts(); if (all.length < 2) return null; const i = all.findIndex(p => p.id === pid); return all[(i + 1) % all.length]; }

  /* ── values ──────────────────────────────────────────────────────────── */
  render() {
    const s = this.state;
    if (s.bootErr) return <div className="cm3x-msg" role="alert"><p>{s.bootErr}</p><button className="cm3x-btn" onClick={() => this.boot()}>Try again</button></div>;
    if (!s.boot) return <div className="cm3x-msg" role="status"><p>Opening the Community…</p></div>;
    const v = this.values();
    return <React.Fragment>
      {CommunityV3View(v)}
      {s.crisis ? <CmCrisisDialog message={s.crisis} onClose={() => this.setState({ crisis: "" })}/> : null}
      {s.writing && typeof CmJournalWriter === "function" ? <CmJournalWriter seed={s.writing} auth={this.props.auth} onClose={() => this.setState({ writing: null })} onSaved={() => {}}/> : null}
    </React.Fragment>;
  }

  values() {
    const s = this.state, set = o => this.setState(o), B = s.boot, me0 = B.me;
    const phone = this.props.device === "phone";
    const base = { rootRef: this.rootRef, frameW: phone ? "390px" : "100%", frameH: phone ? "844px" : "100%", frameR: phone ? "40px" : "0", frameSh: phone ? "0 30px 80px rgba(0,0,0,.18), 0 0 0 10px #0b0b0c" : "none", outerPad: phone ? "24px" : "0" };
    const role = me0.role, staff = role !== "student", admin = role === "admin";
    const meKey = me0.key; this.person(meKey, { name: me0.name, centre: me0.centre, staff, role: me0.roleLabel, photo: me0.photo });
    const me = this.who(meKey), P = this.people;
    const W = phone ? 390 : (s.w || 1280), narrow = W < 760, rail = W >= 1240;
    const chans = B.channels.map(c => ({ slug: c.slug, name: c.name, kind: c.kind, faculty: c.faculty || "", color: c.color || "#3b5bdb", icon: c.icon && /^ph /.test(c.icon) ? c.icon : "ph ph-hash", members: c.people || 0, posts: c.posts || 0, unread: c.unread || 0, desc: c.description || "", lead: "", mine: !!c.mine, status: "live" }));
    const chBy = {}; chans.forEach(c => { chBy[c.slug] = c; });
    const myChans = chans.filter(c => c.mine);
    const mode = B.mode;
    const goView = (view, extra) => this.goView(view, extra);
    const person = k => this.who(k);
    const posts = s.posts;
    const visible = posts.filter(p => !s.hidden[p.id]);
    // The post a link opened, when the feed on screen does not hold it.
    const opened = s.opened && !s.hidden[s.opened.id] && !visible.some(p => p.id === s.opened.id) ? s.opened : null;
    const unreadN = s.read.__all ? 0 : B.counts.unread, mentionN = B.counts.mentions;
    const hw = s.hw || [];
    const hwBy = {}; hw.forEach(h => { hwBy[h.id] = h; if (h.by) this.person(h.by, { name: h.byName, staff: true, role: "Instructor" }); });
    const myHw = hw.filter(h => h.me);
    const todoN = myHw.filter(h => h.me === "todo" || h.me === "late").length;
    const staffHw = hw.filter(h => (h.cohort || []).length);
    const reviewN = staffHw.reduce((t, h) => t + this.hwStats(h).w, 0);
    const queue = (s.queue || []).concat((s.qComments || []).map(c => Object.assign({ isComment: true }, c)));
    const cases = s.cases || [];
    const openCases = me0.canSafeguard ? cases.length : 0;

    const F = s.view === "home" ? s.filter : "all";
    const q = s.q.trim().toLowerCase();
    let list = visible;
    if (s.view === "channel") list = visible.filter(p => p.ch === s.ch);

    const R = B.reactions;
    const pv = p => {
      const a = person(p.author), c = chBy[p.ch] || chans[0] || { name: "", color: "#ccc", slug: "" }, k = CM3_KIND[p.kind];
      const isQ = p.kind === "question", answered = isQ && p.answered, mine = p.isMine;
      const m = p.media || {};
      const tot = p.poll ? p.poll.opts.reduce((t, o) => t + o[1], 0) : 0, voted = p.poll ? p.poll.voted : -1;
      const h = p.hw ? hwBy[p.hw] : null, hs = h ? this.hwStats(h) : null;
      const canStar = staff && !mine && !a.staff;
      const md = s.media[p.id] || {}, pos = md.pos || 0;
      const n = p.n + ((s.comments[p.id] || []).filter(x => x.status !== "published").length);
      const comments = s.comments[p.id] || [];
      const last = comments.filter(x => x.status === "published" || x.isMe)[comments.length - 1] || comments[comments.length - 1];
      const img = (url, w, cls, alt) => url ? React.createElement("img", { src: cmOpt(url, w), alt: alt || "", loading: "lazy", decoding: "async", className: cls }) : null;
      return {
        id: p.id, name: a.name, ini: a.ini, tone: a.tone, roleLabel: a.staff ? a.role : "", hasRole: !!a.staff, aria: "Post by " + a.name,
        meta: [a.centre, p.ago].filter(Boolean).join(" · "), chName: c.name, chColor: c.color, showCh: s.view !== "channel", goCh: this.goCh(c.slug),
        hasKind: !!k, kindLabel: k ? k[0] : "", kindIcon: k ? k[1] : "", kindBg: k ? k[2] : "", kindFg: k ? k[3] : "",
        pinned: !!p.pinned && F === "all", body: p.body, cardBd: p.status === "pending" ? "#d2d2ce" : p.stars > 0 ? "#f1d58f" : "#e8e5dd", cardBg: p.stars > 0 ? "#fffbf0" : "#fff", cardSh: p.stars > 0 ? "0 6px 20px rgba(245,176,38,.18)" : "0 1px 2px rgba(11,11,12,.04)",
        isCode: m.type === "code", codePeek: m.type === "code" ? String(m.peek || "").split("\n").slice(0, 9).map((l, i) => String(i + 1).padStart(2, " ") + "  " + l).join("\n") : "",
        vTitle: m.type === "video" ? (m.title || p.body.split("\n")[0].slice(0, 80) || "Video") : "",
        vSub: m.type === "video" ? (pos > 0 ? "Resume at " + cm3Fmt(pos) : [m.chapters ? m.chapters + " chapters" : "", m.captions ? "captions on" : "", m.dur ? cm3Fmt(m.dur) : ""].filter(Boolean).join(" · ")) : "",
        vProgOn: pos > 0, vProg: (m.dur ? Math.min(100, pos / m.dur * 100) : 0).toFixed(1) + "%", playLabel: "Play video: " + (m.title || "video"),
        docH: m.type === "doc" ? m.name : "",
        openMedia: () => m.type === "link" ? window.open(cm3SafeUrl(m.url), "_blank", "noopener") : m.type === "photo" ? window.open(m.url, "_blank", "noopener") : this.openViewer(m.type, p.id, p.id),
        isPhoto: m.type === "photo", isVideo: m.type === "video", isDoc: m.type === "doc", isLink: m.type === "link", mUrl: m.type === "link" ? cm3SafeUrl(m.url) : "", linkLabel: m.type === "link" ? (m.title || m.host || "Link") + " (opens in a new tab)" : "", mName: m.name || "", mMeta: m.type === "doc" ? m.meta : m.type === "link" ? "Opens in a new tab" : "", mHost: m.host || "", mTitle: m.title || "",
        photoEl: m.type === "photo" ? img(m.url, 900, "cm3x-fill", m.alt || "Photo shared by " + a.name) : null,
        thumbEl: m.type === "video" ? (m.poster ? img(m.poster, 900, "cm3x-fill", "") : null) : null,
        isPoll: !!p.poll, pollMeta: tot + " votes · " + (voted >= 0 ? "You voted. Tap again to change." : "Tap a choice to vote"),
        pollOpts: p.poll ? p.poll.opts.map((o, i) => { const pct = tot ? Math.round(o[1] / tot * 100) : 0, on = voted === i, show = voted >= 0; return { label: o[0], on, pressed: on ? "true" : "false", showRes: show, pct: pct + "%", w: show ? pct + "%" : "0%", fill: on ? "#fbe3a6" : "#f1f0eb", bd: on ? "#f5b026" : "#e8e5dd", fw: on ? 600 : 500, vote: () => this.vote(p.id, i) }; }) : [],
        isHw: !!p.hw, hwTitle: h ? h.title : "Homework", hwMeta: h ? (h.due + (staff && hs.total ? " · " + hs.handed + " of " + hs.total + " handed in" : "")) : "", hwCta: staff ? "Tracker" : h && (h.me === "todo" || h.me === "late") ? "Hand in" : "View", openHw: goView("homework", { hwSel: p.hw }),
        /* Anything not live says so to whoever can still see it: a hidden post used to look live to its author. */
        pending: p.status !== "published", statusNote: admin && !mine ? (p.status === "pending" ? "Held for review — see the Moderation queue." : "Not visible to members (" + p.status + ").")
          : p.status === "pending" ? (p.note || "Waiting for a quick check — only you can see it. A mentor usually approves within a few hours.")
          : p.status === "hidden" ? "A mentor hid this. Only you can see it. " + (p.note && !/^Hidden by a mentor\.?$/.test(p.note) ? p.note : "You can delete it and post again, or ask your mentor about it.")
          : "This was taken down and only you can see it." + (p.note ? " " + p.note : ""),
        hasStar: p.stars > 0, starLine: p.stars > 0 ? (p.myStar ? "Genius Star from you" : p.stars === 1 ? "A Genius Star from a mentor" : p.stars + " Genius Stars from mentors") : "",
        isQ, qLabel: answered ? "Answered" : "Waiting for an answer", qIcon: answered ? "ph-fill ph-check-circle" : "ph ph-clock", qFg: answered ? "#1d4f2a" : "#6b4b00",
        reacts: R.filter(e => (p.reacts[e] || 0) > 0 || p.mine === e).map(e => { const on = p.mine === e, cnt = p.reacts[e] || 0; return { e, n: cnt, pressed: on ? "true" : "false", aria: e + " " + cnt + (on ? ", your reaction" : ""), bg: on ? "#fdf1d6" : "#fff", bd: on ? "#f5b026" : "#e8e5dd", src: cm3EmojiSrc(e), anim: s.burst && s.burst.id === p.id && s.burst.e === e ? "cmPop .35s ease-out" : "none", toggle: () => this.react(p.id, e) }; }),
        showPicker: s.picker === p.id, pickerExp: s.picker === p.id ? "true" : "false", openPicker: () => set({ picker: s.picker === p.id ? null : p.id }),
        picker: R.map(e => ({ e, src: cm3EmojiSrc(e), name: CM3_REACT_NAMES[e] || e, aria: "React with " + e, pick: () => { this.react(p.id, e); set({ picker: null }); } })),
        replies: n ? n + (n === 1 ? " reply" : " replies") : "Reply", openThread: () => { set({ thread: p.id, picker: null, reply: "", quote: null, rxOpen: null, thNew: 0, thAway: false }); this.loadComments(p.id); },
        canStar, starOff: !!p.myStar || s.stars < 1, starBg: p.myStar ? "#fdf1d6" : "#fffaf0", starIcon: p.myStar ? "ph-fill ph-star" : "ph ph-star", starLabel: p.myStar ? "Star given" : "Genius Star", starTitle: s.stars + " Genius Stars left today",
        giveStar: () => this.star(p, a.name.split(" ")[0]),
        savedP: p.saved ? "true" : "false", saveIcon: p.saved ? "ph-fill ph-bookmark-simple" : "ph ph-bookmark-simple", saveLabel: p.saved ? "Saved" : "Save", toggleSave: () => this.save(p.id),
        flagIcon: mine ? "ph ph-trash" : "ph ph-flag", flagLabel: mine ? "Delete my post" : "Report this post",
        flagAct: mine ? () => this.removeMine(p) : () => set({ report: { id: p.id, type: "post", reason: null }, picker: null }),
        answered, segs: this.segs(p.body), openCard: () => set({ card: p.author }),
        mentionsMe: p.mentionsMe && !mine, mentionLine: a.name.split(" ")[0] + " mentioned you",
        burstEl: s.burst && s.burst.id === p.id ? React.createElement("span", { key: s.burst.k, "aria-hidden": true, className: "cm3x-burst", style: { backgroundImage: "url(" + cm3EmojiSrc(s.burst.e) + ")" } }) : null,
        ...(!last || s.thread === p.id ? { hasLast: false } : (() => { const la = person(last.authorKey); return { hasLast: true, lastName: (last.name || la.name).split(" ")[0], lastIni: cm3Ini(last.name || la.name), lastTone: cm3Tone(last.authorKey), lastBody: last.body, lastMore: comments.length > 1 ? "View all " + comments.length : "Reply" }; })())
      };
    };
    const feed = list.map(pv);

    const hour = new Date().getHours(), greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const cur = chBy[s.ch] || chans[0] || { name: "", desc: "", icon: "ph ph-hash", color: "#ccc", slug: "", members: 0, posts: 0 };
    const VIEWT = { all: ["Home", greet + ", " + me0.first + " · " + unreadN + " new " + (unreadN === 1 ? "post" : "posts") + " in your channels"], unread: ["Unread", "Posts since you last opened each channel"], mentions: ["Mentions", "Posts that tag @" + (me0.handle || this.handle(me0.name))], questions: ["Questions", "Help someone, or find an answer that already exists"], saved: ["Saved", "Only you can see what you’ve saved"], mine: ["My posts", "Everything you’ve shared, including posts waiting for a check"] };
    let title = "", sub = "", hasHeadTile = false;
    if (s.view === "home") { [title, sub] = VIEWT[s.filter] || VIEWT.all; if (s.byAuthor) { title = "Posts by " + s.byAuthor.name; sub = "Newest first, in your channels · tap Home to see everything"; } if (q) sub = "Showing posts matching “" + s.q.trim() + "”" + (s.byAuthor ? " by " + s.byAuthor.name : ""); }
    if (s.view === "channel") { title = cur.name; sub = cur.desc; hasHeadTile = true; }
    if (s.view === "homework") { title = "Homework"; sub = staff ? "Who has handed in, who needs a nudge" : s.hw === null ? (s.hwErr ? "Couldn’t load your homework" : "Loading your homework…") : todoN ? todoN + " to hand in · everything your instructors set, in one place" : "All handed in. Nice work."; }
    if (s.view === "files") { title = "Files"; sub = "Every photo, video, document and link shared in your channels"; }
    if (s.view === "journal") { title = "Journal"; sub = typeof cmTodayWords === "function" ? cmTodayWords() : "Your own record, and the programme’s"; }
    if (s.view === "arcade") { title = "Arcade"; sub = "Quick games between sessions. Scores are checked by NGG, so they’re fair."; }
    if (s.view === "support") { title = "Support"; sub = "Ask the NGG team when something isn’t working. Your cases are the same ones as in My NGG."; }
    if (s.view === "mod") { title = s.modTab === "sg" ? "Safeguarding" : "Moderation"; sub = "Children’s posts are checked by people. Safeguarding is its own queue."; }

    const chHw = hw.filter(h => h.ch === s.ch), chFiles = (s.files || []).filter(f => f.ch === s.ch);
    const pplMap = {};
    const addP = (k, nm) => { const key = k || nm; if (!pplMap[key]) { const pp = k ? person(k) : null; pplMap[key] = { name: nm, ini: cm3Ini(nm), tone: k ? cm3Tone(k) : "#f1f0eb", staff: !!(pp && pp.staff), role: pp ? pp.role : "Student", centre: pp ? pp.centre || "" : "", n: 0 }; } return pplMap[key]; };
    ((s.chMembers || {})[s.ch] || []).forEach(m => { const e = addP(m.key || null, m.name); e.staff = e.staff || !!m.staff; if (!e.centre) e.centre = m.centre || ""; if (m.staff && e.role === "Student") e.role = "Staff"; e.srv = m.posts || 0; });
    visible.filter(p => p.ch === s.ch).forEach(p => { addP(p.author, person(p.author).name).n++; (s.comments[p.id] || []).forEach(c => addP(c.authorKey, c.name)); });
    chHw.forEach(h => (h.cohort || []).forEach(r => addP(null, r.name)));
    Object.values(pplMap).forEach(m => { if (m.srv != null) m.n = Math.max(m.n, m.srv); });
    const people = Object.values(pplMap).sort((a, b) => (b.staff - a.staff) || (b.n - a.n)).map(m => ({ ...m, sub: [m.staff ? "" : "Student", m.centre, m.n ? m.n + (m.n === 1 ? " post" : " posts") : ""].filter(Boolean).join(" · ") }));

    let tabs = [], hasTabs = false, tabsLabel = "";
    const mk = (id, label, icon, badge, red, curId, go) => { const sel = curId === id; return { label, icon, sel: sel ? "true" : "false", badge: String(badge || ""), hasBadge: !!badge, badgeBg: red ? "#b42318" : sel ? "#0b0b0c" : "#e6e5e0", badgeFg: red || sel ? "#fff" : "#0b0b0c", bd: sel ? "#0b0b0c" : "transparent", fg: sel ? "#0b0b0c" : "#5c5c63", fw: sel ? 600 : 500, go }; };
    if (s.view === "channel") { hasTabs = true; tabsLabel = "Channel sections"; tabs = [["posts", "Posts", "ph ph-chats-circle"], ["homework", "Homework", "ph ph-backpack", chHw.length], ["files", "Files", "ph ph-folder-simple", s.files ? chFiles.length : 0], ["people", "People", "ph ph-users", people.length]].map(t => mk(t[0], t[1], t[2], t[3], false, s.chTab, () => { set({ chTab: t[0], thread: null }); if (t[0] === "files") this.loadFiles(); })); }
    if (s.view === "mod") { hasTabs = true; tabsLabel = "Moderation sections"; tabs = [["queue", "Queue", "ph ph-tray", queue.length]].concat(me0.canSafeguard ? [["sg", "Safeguarding", "ph ph-lifebuoy", openCases, true]] : []).concat([["channels", "Channels", "ph ph-hash"], ["health", "Health", "ph ph-pulse"], ["settings", "Settings", "ph ph-sliders-horizontal"]]).map(t => mk(t[0], t[1], t[2], t[3], t[4], s.modTab, () => set({ modTab: t[0], modeAsk: null }))); }

    const onFeed = s.view === "home" || (s.view === "channel" && s.chTab === "posts");
    const onHw = s.view === "homework" || (s.view === "channel" && s.chTab === "homework");
    const hwScope = s.view === "channel" ? s.ch : null;
    const onFiles = s.view === "files" || (s.view === "channel" && s.chTab === "files");
    const onMod = s.view === "mod" && admin && !s.modLocked;

    const navItem = (label, icon, cur, badge, red, go) => ({ label, icon, cur: cur ? "page" : undefined, bg: cur ? "#efeee9" : "transparent", fw: cur ? 600 : 500, badge: String(badge || ""), hasBadge: !!badge, badgeBg: red ? "#b42318" : "#0b0b0c", go });
    const navViews = [["all", "Home", "ph ph-house"], ["unread", "Unread", "ph ph-tray", unreadN], ["mentions", "Mentions", "ph ph-at", mentionN], ["questions", "Questions", "ph ph-question"], ["saved", "Saved", "ph ph-bookmark-simple"], ["mine", "My posts", "ph ph-user"]].map(x => navItem(x[1], x[2], s.view === "home" && s.filter === x[0], x[3], false, goView("home", { filter: x[0], q: "" })));
    const navChans = myChans.map(c => { const curC = s.view === "channel" && s.ch === c.slug, un = s.read[c.slug] ? 0 : c.unread; return { name: c.name, icon: c.icon, color: c.color, unread: String(un), hasUnread: un > 0, cur: curC ? "page" : undefined, bg: curC ? "#efeee9" : "transparent", fw: curC ? 600 : un ? 600 : 500, go: this.goCh(c.slug) }; });
    const navTools = [navItem("Homework", "ph ph-backpack", s.view === "homework", staff ? reviewN : todoN, false, goView("homework")), navItem("Files", "ph ph-folder-simple", s.view === "files", 0, false, goView("files")), navItem("Arcade", "ph ph-game-controller", s.view === "arcade", 0, false, goView("arcade")), navItem("Journal", "ph ph-notebook", s.view === "journal", 0, false, goView("journal")), navItem("Support", "ph ph-lifebuoy", s.view === "support", 0, false, goView("support"))];
    if (admin) { navTools.push(navItem("Moderation", "ph ph-shield-check", s.view === "mod" && s.modTab !== "sg", (s.stats ? s.stats.counts.held + s.stats.counts.video + s.stats.counts.reported : queue.length), false, goView("mod", { modTab: "queue" }))); if (me0.canSafeguard) navTools.push(navItem("Safeguarding", "ph ph-lifebuoy", s.view === "mod" && s.modTab === "sg", openCases, true, goView("mod", { modTab: "sg" }))); }
    // "Preview as" is the prototype's role switcher; the real viewer is the signed-in person, so it is not shown.
    const roles = [];

    const chips = [["all", "All"], ["unread", "Unread", unreadN], ["mentions", "Mentions", mentionN], ["questions", "Questions"], ["saved", "Saved"], ["mine", "Mine"]].map(([id, label, n]) => { const sel = s.filter === id; return { label, n: String(n || ""), hasN: !!n, sel: sel ? "true" : "false", bg: sel ? "#0b0b0c" : "#fff", fg: sel ? "#fff" : "#0b0b0c", bd: sel ? "#0b0b0c" : "#e8e5dd", go: () => this.setState({ filter: id, byAuthor: null }, () => this.loadFeed(true)) }; });

    /* "Catch me up": one line per unread post, each opening its post (community.digest). */
    const D0 = s.digestRes;
    const dg = D0 ? (D0.items || []).map((x, i) => ({ n: String(i + 1).padStart(2, "0"), t: x.line, icon: "ph ph-arrow-right", open: () => { set({ digest: false }); this.openPost(x.postId); } }))
      : [{ n: "··", t: s.digestErr || "Reading your unread posts…", icon: "", open: () => { if (s.digestErr) this.loadDigest(); } }];

    const waitingPosts = role === "instructor" ? visible.filter(p => !person(p.author).staff && (p.kind === "question" || p.kind === "work") && !p.answered && p.n === 0) : [];
    const waiting = waitingPosts.slice(0, 5).map(p => { const a = person(p.author); return { name: a.name, ini: a.ini, tone: a.tone, label: (p.kind === "question" ? "Question" : "Shared work") + " · " + p.ago, body: p.body.length > 140 ? p.body.slice(0, 140) + "…" : p.body, reply: () => { set({ thread: p.id, reply: "" }); this.loadComments(p.id); } }; });

    const nextTodo = myHw.find(h => h.me === "todo" || h.me === "late");
    const hwStrip = nextTodo ? { title: nextTodo.title, due: nextTodo.dueShort, ch: (chBy[nextTodo.ch] || {}).name || "", go: goView("homework", { hwSel: nextTodo.id }) } : {};

    const quickTypes = [["question", "Ask", "ph ph-question", "#b26a00"], ["work", "Show my work", "ph ph-paint-brush-broad", "#1d6b30"], ["poll", "Poll", "ph ph-chart-bar", "#3b5bdb"]].concat(staff ? [["homework", "Homework", "ph ph-backpack", "#a3365f"]] : []).map(t => ({ label: t[1], icon: t[2], ic: t[3], go: () => this.openComp(t[0]) }));

    const ST = { todo: ["To do", "#fdf1d6", "#6b4b00", "ph ph-circle-dashed"], late: ["Late — still fine", "#fdf1ef", "#7a1a10", "ph ph-clock-countdown"], waiting: ["Handed in", "#eceefb", "#2a3f9e", "ph ph-hourglass-medium"], reviewed: ["Reviewed", "#e5efe7", "#1d4f2a", "ph ph-check-circle"] };
    const hwRank = h => (h.id === s.hwSel ? -1 : ["late", "todo", "waiting", "reviewed"].indexOf(h.me));   // the task a link or "Hand in" opened comes first
    const hwList = myHw.filter(h => !hwScope || h.ch === hwScope).sort((a, b) => hwRank(a) - hwRank(b)).map(h => { const c = chBy[h.ch] || {}, st = ST[h.me] || ST.todo; return { title: h.title, chName: c.name, chColor: c.color, chIcon: c.icon, byName: h.byName, set: h.set, due: h.due, detail: h.detail, stLabel: st[0], stBg: st[1], stFg: st[2], stIcon: st[3], isTodo: h.me === "todo" || h.me === "late", isWaiting: h.me === "waiting", hasFeedback: h.me === "reviewed", feedback: "Reviewed by " + h.byName + ". Well done.", myNote: h.myNote ? "You wrote: " + h.myNote : "Handed in. Waiting for review.",
      note: s.hwNotes[h.id] || "", onNote: e => { const v = e.target.value; this.setState(st2 => ({ hwNotes: Object.assign({}, st2.hwNotes, { [h.id]: v }) })); },
      attachPressed: s.hwLinks[h.id] ? "true" : "false", attachBd: s.hwLinks[h.id] ? "#f5b026" : "#e8e5dd", attachBg: s.hwLinks[h.id] ? "#fdf6e3" : "#fff", attachIcon: s.hwLinks[h.id] ? "ph-fill ph-check-circle" : "ph ph-link", attachLabel: s.hwLinks[h.id] ? "Link added — tap to remove" : "Add a link to your work",
      toggleAttach: async () => {
        if (s.hwLinks[h.id]) return this.setState(st2 => ({ hwLinks: Object.assign({}, st2.hwLinks, { [h.id]: "" }) }));
        const u = await dialog.prompt({ title: "Add a link to your work", body: "A Scratch project, a shared doc, a video — anything " + h.byName + " can open. A screenshot can be posted in the channel instead.", label: "Link", placeholder: "https://", cta: "Add link" });
        if (u == null) return;
        const t = String(u).trim();
        if (!/^https?:\/\/\S+\.\S+/.test(t)) return this.flash("That doesn’t look like a link. It should start with https://");
        this.setState(st2 => ({ hwLinks: Object.assign({}, st2.hwLinks, { [h.id]: t }) }));
      },
      handIn: () => { if (this.hwBusy === h.id) return; const n0 = (s.hwNotes[h.id] || "").trim(), ln = s.hwLinks[h.id] || ""; const note = n0 + (ln ? (n0 ? " · " : "") + ln : ""); this.hwBusy = h.id;
        this.api().homeworkSubmit(h.id, note).then(() => { this.hwBusy = null; this.setState(st2 => ({ hw: (st2.hw || []).map(x => x.id === h.id ? Object.assign({}, x, { me: "waiting", myNote: note }) : x), hwNotes: Object.assign({}, st2.hwNotes, { [h.id]: "" }), hwLinks: Object.assign({}, st2.hwLinks, { [h.id]: "" }) })); this.flash("Handed in! " + h.byName + " will review it."); }).catch(e => { this.hwBusy = null; this.flash(cm3Err(e, "Couldn’t hand it in. Your note is still here — try again.")); }); } }; });

    const sTasks = staffHw.filter(h => !hwScope || h.ch === hwScope);
    const sel = sTasks.find(h => h.id === s.hwSel) || sTasks[0];
    const staffTasks = sTasks.map(h => { const on = sel && h.id === sel.id; return { label: h.title, sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#e8e5dd", go: () => set({ hwSel: h.id, hwFilter: "all" }) }; });
    let tr = {}, trRows = [], trFilters = [];
    if (sel) {
      const st = this.hwStats(sel), pc = n => (st.total ? n / st.total * 100 : 0) + "%";
      const missing = sel.cohort.filter(r => r.state === "missing"), unNudged = missing.filter(r => !r.nudged && !s.nudged[sel.id + r.id]);
      const reload = () => this.loadHw();
      tr = { title: sel.title, chName: (chBy[sel.ch] || {}).name || "", set: sel.set, due: sel.due, total: String(st.total), handed: String(st.handed), r: String(st.r), wt: String(st.w), m: String(st.m), wR: pc(st.r), wW: pc(st.w), aria: st.r + " reviewed, " + st.w + " waiting, " + st.m + " not handed in",
        nudgeAllOff: !unNudged.length, nudgeAllBg: unNudged.length ? "#0b0b0c" : "#b9b9b4", nudgeAllLabel: unNudged.length ? "Nudge the " + unNudged.length + " who haven’t" : "Everyone nudged today",
        nudgeAll: () => { if (!unNudged.length) return; this.api().homeworkNudge(sel.id, "", true).then(r => { const nd = Object.assign({}, s.nudged); unNudged.forEach(x => { nd[sel.id + x.id] = true; }); set({ nudged: nd }); this.flash((r.sent || 0) + " private nudges sent. They won’t get another today."); reload(); }).catch(e => this.flash(cm3Err(e))); } };
      const RS = { reviewed: ["Reviewed", "#e5efe7", "#1d4f2a"], waiting: ["Waiting for you", "#fdf1d6", "#6b4b00"], missing: ["Not yet", "#f1f0eb", "#3a3a40"] };
      trFilters = [["all", "Everyone", st.total], ["waiting", "Waiting for you", st.w], ["missing", "Not yet", st.m], ["reviewed", "Reviewed", st.r]].map(([id, l, n]) => { const on = s.hwFilter === id; return { label: l + " · " + n, sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#e8e5dd", go: () => set({ hwFilter: id }) }; });
      const order = { waiting: 0, missing: 1, reviewed: 2 };
      trRows = sel.cohort.filter(r => s.hwFilter === "all" || r.state === s.hwFilter).slice().sort((a, b) => order[a.state] - order[b.state]).map(r => { const nd = r.nudged || !!s.nudged[sel.id + r.id], rs = RS[r.state]; return { name: r.name, ini: cm3Ini(r.name), stLabel: rs[0], stBg: rs[1], stFg: rs[2], note: r.state === "missing" ? (r.what === "seen" ? "Opened the task · nothing handed in yet" : "Hasn’t opened the task yet") : r.what, isWaiting: r.state === "waiting", isMissing: r.state === "missing", nudged: nd, nudgeLabel: nd ? "Nudged today" : "Nudge", nIcon: nd ? "ph ph-check" : "ph ph-bell-simple", nBg: nd ? "#f4f4f2" : "#fff", nFg: nd ? "#6b6b72" : "#0b0b0c",
        review: () => this.api().homeworkReview(sel.id, r.id).then(() => { this.flash(r.name.split(" ")[0] + "’s work marked as reviewed."); reload(); }).catch(e => this.flash(cm3Err(e))),
        nudge: () => { if (nd) return; this.api().homeworkNudge(sel.id, r.id, false).then(() => { set({ nudged: Object.assign({}, s.nudged, { [sel.id + r.id]: true }) }); this.flash("Private nudge sent to " + r.name.split(" ")[0] + "."); }).catch(e => this.flash(cm3Err(e))); } }; });
    }

    const fScope = (s.files || []).filter(f => !hwScope || f.ch === hwScope);
    const FK = { all: ["All", "ph ph-squares-four"], photos: ["Photos", "ph ph-image"], videos: ["Videos", "ph ph-video"], docs: ["Docs", "ph ph-file-text"], code: ["Code", "ph ph-code"], links: ["Links", "ph ph-link"] };
    const fileChips = Object.keys(FK).map(k => { const on = s.fileKind === k; return { label: FK[k][0], icon: FK[k][1], n: String(k === "all" ? fScope.length : fScope.filter(f => f.kind === k).length), sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#e8e5dd", go: () => set({ fileKind: k }) }; });
    const TH = { photos: ["repeating-linear-gradient(135deg,#efeee9 0 12px,#f6f5f1 12px 24px)", "#6b6b72", "ph ph-image"], videos: ["#1b1b1e", "#ffffff", "ph-fill ph-play-circle"], docs: ["#fbf3f2", "#b42318", "ph ph-file-text"], links: ["#eef1fb", "#2a3f9e", "ph ph-link"], code: ["#141416", "#f5b026", "ph ph-file-html"] };
    const files = fScope.filter(f => s.fileKind === "all" || f.kind === s.fileKind).map(f => { const c = chBy[f.ch] || {}, t = TH[f.kind]; this.person(f.by, { name: f.byName }); return { name: f.name, meta: "Shared by " + String(f.byName || "").split(" ")[0] + " · " + cm3Ago(f.createdAt), chName: c.name, chColor: c.color, size: f.size, thumbBg: f.poster && f.kind !== "code" ? "#1b1b1e url(" + cmOpt(f.poster, 400) + ") center/cover" : t[0], thumbFg: t[1], icon: t[2], isDocT: f.kind === "docs", isCodeT: f.kind === "code", isVidT: f.kind === "videos", isPlainT: f.kind === "photos" || f.kind === "links", docH: f.name, codePeek: f.peek,
      open: () => { if (f.kind === "links" || f.kind === "photos") { window.open(f.url, "_blank", "noopener"); return; } if (!s.posts.some(p => p.id === f.postId)) this.api().post_get(f.postId).then(r => { const p = this.adapt(r.post); this.setState(st => ({ posts: st.posts.concat([p]) }), () => this.openViewer(p.media.type, p.id, p.id)); }).catch(() => this.flash("That file isn’t available any more.")); else this.openViewer({ videos: "video", docs: "doc", code: "code" }[f.kind], f.postId, f.postId); } }; });

    // moderation
    const qKinds = { held: ["Held by the screen", "#fdf1d6", "#6b4b00", "ph ph-shield-warning"], video: ["Video · needs a person", "#eceefb", "#2a3f9e", "ph ph-video-camera"], reported: ["Reported", "#fdf1ef", "#7a1a10", "ph ph-flag"] };
    const qCounts = { all: queue.length, held: queue.filter(x => x.kind === "held").length, video: queue.filter(x => x.kind === "video").length, reported: queue.filter(x => x.kind === "reported").length };
    const qChips = [["all", "Everything"], ["held", "Held by screen"], ["video", "Videos"], ["reported", "Reported"]].map(([id, l]) => { const on = s.modFilter === id; return { label: l, n: String(qCounts[id]), sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#e8e5dd", go: () => set({ modFilter: id }) }; });
    const qItems = queue.filter(x => s.modFilter === "all" || x.kind === s.modFilter).map(it => { const nm = it.author || it.name || "Member", k = qKinds[it.kind] || qKinds.held, first = nm.split(" ")[0];
      return { name: nm, ini: cm3Ini(nm), tone: cm3Tone(it.authorKey), centre: it.centre || "", ago: cm3Ago(it.createdAt), type: it.isComment ? "Reply" : "Post", chName: it.channel || "", body: it.body, why: it.why, tag: it.kind === "reported" ? "Reported ×" + it.reportCount : k[0], tagBg: k[1], tagFg: k[2], tagIcon: k[3], isVideo: !it.isComment && it.mediaType === "video" && !!it.mediaUrl,
        /* What is being approved, shown: a moderator used to approve a held photo or clip from its caption alone. */
        videoEl: !it.isComment && it.mediaType === "video" && it.mediaUrl ? React.createElement("video", { src: it.mediaUrl, poster: it.mediaPoster || undefined, controls: true, preload: "metadata", playsInline: true, className: "cm3x-qvideo" }) : null,
        isPhoto: !it.isComment && it.mediaType === "image" && !!it.mediaUrl, photoEl: !it.isComment && it.mediaType === "image" && it.mediaUrl ? React.createElement("img", { src: it.mediaUrl, alt: it.altText || "The photo in this post", className: "cm3x-qphoto", loading: "lazy" }) : null,
        isDoc: !it.isComment && it.mediaType === "doc", docUrl: !it.isComment && it.mediaType === "doc" ? cm3DocUrl(it.postId) : "",
        hasReports: (it.reports || []).length > 0, reports: (it.reports || []).slice(0, 6).map(r => ({ by: r.by, reason: r.reason || "No reason given" })),
        // Editing and messaging work on a post; a reply is approved, hidden or removed.
        canEdit: !it.isComment, canMessage: !it.isComment,
        approve: () => this.moderate(it, "approve", null, "Approved and published. " + first + " gets a notification."),
        hide: () => this.moderate(it, "hide", null, "Hidden. " + first + " sees a kind note explaining why."),
        remove: () => this.moderate(it, "remove", null, "Removed and logged in the audit trail."),
        escalate: () => it.isComment ? this.flash("Escalate the post this reply is on.") : this.moderate(it, "escalate", { severity: "high" }, "Moved to safeguarding. A trained lead has been alerted."),
        edit: () => set({ edit: { it, text: it.body } }), message: () => set({ edit: { it, text: "", msg: true } }) }; });
    const st0 = s.stats || { counts: { held: 0, video: 0, reported: 0 }, medianMinutes: null };
    const med = st0.medianMinutes == null ? "—" : st0.medianMinutes < 60 ? st0.medianMinutes + " min" : (st0.medianMinutes / 60).toFixed(1) + " h";
    const modStats = [["Waiting for review", String(queue.length), qCounts.video + " videos · " + qCounts.held + " held · " + qCounts.reported + " reported", "#fff", "#e8e5dd", "#0b0b0c"]]
      .concat(me0.canSafeguard ? [["Safeguarding · open", String(openCases), "Separate queue, trained leads only", "#fdf1ef", "#f3c7c2", "#7a1a10"]] : [])
      .concat([["Mode", mode[0].toUpperCase() + mode.slice(1), mode === "strict" ? "Unsure posts wait for a person" : mode === "flag" ? "Unsure posts go live, flagged" : "Only reports reach the queue", "#fff", "#e8e5dd", "#0b0b0c"],
               ["Median time to review", med, st0.decisions ? "this week · " + st0.decisions + " decisions" : "no decisions this week yet", "#fff", "#e8e5dd", "#0b0b0c"]])
      .map(x => ({ k: x[0], v: x[1], d: x[2], bg: x[3], bd: x[4], fg: x[5] }));
    const caseItems = cases.map(c => { const open = c.status !== "closed" && c.status !== "acknowledged", sev = c.severity || "high";
      return { id: c.caseId, ago: cm3Ago(c.createdAt), surface: (c.source === "report" ? "Report" : c.source === "escalated" ? "Escalated" : "Screen") + " · " + (c.surface === "comment" ? "reply" : "post") + (c.channel ? " · " + ((chBy[c.channel] || {}).name || c.channel) : ""),
        summary: c.note ? c.note + " — “" + String(c.body || "").slice(0, 90) + "”" : "“" + String(c.body || "").slice(0, 140) + "”", lead: c.leadName || "Unassigned", status: c.status === "in_progress" ? "Open · " + (c.mine ? "you" : c.leadName) : c.status === "open" ? "Open · new" : c.status,
        open, sevLabel: sev === "high" ? "High concern" : sev === "medium" ? "Medium concern" : "Low concern", sevBg: sev === "high" ? "#fdf1ef" : "#f1f0eb", sevFg: sev === "high" ? "#7a1a10" : "#3a3a40", bd: open && sev === "high" ? "#f3c7c2" : "#e8e5dd",
        /* Separate acts, each saying what it does: taking a case, changing its
           severity, closing it with a note. One "Open case file" button used to
           flip the severity on every press and never open anything. */
        canTake: !c.leadId, isMine: !!c.leadId && !!c.mine,
        take: () => this.caseUpdate(c, { take: 1 }, "You’ve taken " + c.caseId + ". Access is logged."),
        sevAct: sev === "high" ? "Lower to medium" : "Raise to high",
        sev: () => this.caseUpdate(c, { severity: sev === "high" ? "medium" : "high" }, "Severity set to " + (sev === "high" ? "medium" : "high") + ". Logged."),
        close: async () => {
          const note = await dialog.prompt({ title: "Close " + c.caseId + "?", body: "Say what was done. The note stays on the case and in the audit log.", label: "What was done", multiline: true, cta: "Close the case" });
          if (note) this.caseUpdate(c, { status: "closed", note }, c.caseId + " is closed. Logged.");
        } }; });
    const chRows = (s.chanAdmin || []).map(c => { const arch = c.status === "archived"; return { name: c.name, icon: c.icon && /^ph /.test(c.icon) ? c.icon : "ph ph-hash", color: arch ? "#b9b9b4" : c.color, faculty: c.faculty || c.kind, members: String((chBy[c.slug] || {}).members || 0), posts: c.total || c.posts || 0, lead: "", st: arch ? "Archived" : "Active", stBg: arch ? "#f1f0eb" : "#e5efe7", stFg: arch ? "#3a3a40" : "#1d4f2a", nameFg: arch ? "#6b6b72" : "#0b0b0c", toggleLabel: arch ? "Restore" : "Archive",
      toggle: () => NGGApi.admin.community.channelUpsert({ channelId: c.channelId, name: c.name, slug: c.slug, color: c.color, kind: c.kind, faculty: c.faculty, icon: c.icon, description: c.description, rules: c.rules, sortOrder: c.sortOrder, pinned: c.pinned, status: arch ? "active" : "archived" }).then(() => { this.flash((arch ? "Restored " : "Archived ") + c.name + "."); this.loadMod(); }).catch(e => this.flash(cm3Err(e))) }; });
    const H = s.health || { stats: [], days: [], centres: [], top: [], quiet: [] }, maxDay = Math.max(1, ...H.days.map(d => d[1]));
    const hStats = H.stats.map(x => ({ k: x[0], v: x[1], d: x[2], delta: x[3], hasDelta: !!x[3] && x[3] !== "steady" }));
    const hDays = H.days.map((d, i) => ({ d: d[0], n: String(d[1]), h: Math.round(d[1] / maxDay * 96) + "px", bg: i === H.days.length - 1 ? "#f5b026" : "#0b0b0c" }));
    const hCentres = H.centres.map(c => ({ name: c[0], v: c[1] + "%", w: c[1] + "%" }));
    const hTop = H.top.map(t => ({ name: t[0], n: String(t[1]), note: t[2] }));
    const hQuiet = H.quiet.map(t => ({ name: t[0], note: t[1], go: () => this.flash("Open the channel and post a question to get it going.") }));
    const MODES = [["strict", "Strict", "Anything the screen is unsure about waits for a person. Videos always wait. Recommended while most members are under 16.", "ph ph-shield-check"], ["flag", "Flag", "Posts go live straight away; unsure ones are flagged for review afterwards. Videos still wait.", "ph ph-flag"], ["off", "Off", "Everything publishes. Only reports reach the queue. Not recommended for children.", "ph ph-shield-slash"]];
    const modes = MODES.map(m => { const on = mode === m[0]; return { label: m[1] + (on ? " · current" : ""), d: m[2], icon: m[3], sel: on ? "true" : "false", bd: on ? "#0b0b0c" : "#e8e5dd", bg: on ? "#faf9f6" : "#fff", go: () => { if (on) return; if (!me0.canSetMode) return this.flash("Only a super admin can change how hard the feed is checked."); set({ modeAsk: m[0] }); } }; });
    const heldText = qCounts.held, heldVid = qCounts.video;
    const modeAskText = s.modeAsk ? (s.modeAsk === "strict" ? "Switch to Strict? New unsure posts will wait for a person. Nothing already live changes." : "Switching to " + (s.modeAsk === "flag" ? "Flag" : "Off") + " publishes the " + heldText + " held text " + (heldText === 1 ? "item" : "items") + " now. " + (s.modeAsk === "flag" ? "The " + heldVid + " held videos stay in the queue until someone watches them." : "Videos will publish without review from now on.")) : "";

    const about = { desc: cur.desc, members: (cur.members || 0).toLocaleString("en"), posts: String(cur.posts || 0), lead: "The community team", leadIni: "NG", leadTone: "#f5b026", who: cur.kind === "commons" ? "Everyone in NGG can read this — " + (B.everyone || 0).toLocaleString("en") + " people across " + B.centres + " centres." : "Members of this course and their mentors. The community team can read every channel." };
    const railTask = staff ? staffHw.find(h => !hwScope || h.ch === hwScope) : myHw.find(h => (!hwScope || h.ch === hwScope) && (h.me === "todo" || h.me === "late")) || myHw.find(h => !hwScope || h.ch === hwScope);
    let rh = {};
    if (railTask) { const st = this.hwStats(railTask); rh = { title: railTask.title, due: railTask.dueShort, staff, student: !staff, wR: (st.total ? st.r / st.total * 100 : 0) + "%", wW: (st.total ? st.w / st.total * 100 : 0) + "%", line: staff ? st.handed + " of " + st.total + " handed in · " + st.w + " waiting for you" : (ST[railTask.me] || ST.todo)[0] + " · " + ((chBy[railTask.ch] || {}).name || ""), cta: staff ? "Open tracker" : railTask.me === "todo" || railTask.me === "late" ? "Hand it in" : "View", go: goView("homework", { hwSel: railTask.id }) }; }
    const promise = [{ icon: "ph ph-hand-heart", t: "Be kind.", d: "Say what you liked, then one thing to try." }, { icon: "ph ph-lock-key", t: "Keep private things private.", d: "No phone numbers, addresses or other apps." }, { icon: "ph ph-flag", t: "Tell someone.", d: "If anything feels wrong, report it or tell your mentor. You won’t be in trouble." }];

    const tPost = s.thread ? (visible.find(p => p.id === s.thread) || (opened && opened.id === s.thread ? opened : null)) : null;
    const tp = tPost ? pv(tPost) : {};
    /* The thread reads as a chat: your replies on the right, a run of replies
       from one person under one name, a line for each new day, a line where
       the replies you have not seen begin, and a quote on a reply that
       answers another. */
    const tList = tPost ? (s.comments[tPost.id] || []).filter(c => !s.hidden[c.commentId]) : [];
    const newAt = tPost && typeof s.thSeenAt === "number" && s.thSeenAt < tList.length ? tList.findIndex((c, i) => i >= s.thSeenAt && !c.isMe) : -1;
    const tComments = tPost ? tList.map((c, i) => { const nm = c.name || "Member", prev = tList[i - 1], day = cm3Day(c.createdAt);
      const run = !!prev && prev.authorKey === c.authorKey && cm3Day(prev.createdAt) === day && i !== newAt && (Date.parse(c.createdAt) - Date.parse(prev.createdAt)) < 10 * 60000;
      const rx = Object.keys(c.reactions || {}).filter(e => c.reactions[e] > 0).map(e => ({ e, n: String(c.reactions[e]), src: cm3EmojiSrc(e), on: c.myReaction === e ? "true" : "false", bd: c.myReaction === e ? "#0b0b0c" : "#e8e5dd", label: e + " " + c.reactions[e] + (c.myReaction === e ? ", yours. Tap to take it back" : ""), go: () => this.reactReply(tPost.id, c, e) }));
      const q = c.quote || null, mine = !!c.isMe, live = c.status === "published" && !!c.commentId;
      return { id: c.commentId || "", name: nm, ini: cm3Ini(nm), tone: cm3Tone(c.authorKey), hasRole: !!c.staff, role: c.role || "Staff", ago: cm3Ago(c.createdAt), time: cm3Clock(c.createdAt), body: c.body, segs: this.segs(c.body), answer: !!c.isAnswer, pending: c.status !== "published",
      bg: c.isAnswer ? "#eef6f0" : s.hl && s.hl === c.commentId ? "#fbe3a4" : mine ? "#fdf1d6" : "#f6f5f1", bd: c.isAnswer ? "#cfe3d3" : "transparent",
      dir: mine ? "row-reverse" : "row", mine, showHead: !run, showName: !run && !mine, showAv: !run && !mine, avGap: run && !mine, rad: mine ? (run ? "14px 4px 14px 14px" : "14px 4px 14px 14px") : (run ? "4px 14px 14px 14px" : "4px 14px 14px 14px"), gapTop: run ? "-8px" : "0px",
      hasDay: !prev || cm3Day(prev.createdAt) !== day, day, isNew: i === newAt, newLabel: (tList.length - i) + " new " + (tList.length - i === 1 ? "reply" : "replies"),
      hasQuote: !!q, qName: q ? (q.gone ? "" : q.name) : "", qBody: q ? (q.gone ? "This reply was removed." : q.body) : "", qGo: () => q && !q.gone && this.thJump(q.commentId), qLabel: q ? "Go to the reply from " + (q.name || "someone") : "",
      rx, hasRx: rx.length > 0, canReact: live, rxOpen: s.rxOpen === c.commentId, rxToggle: () => set({ rxOpen: s.rxOpen === c.commentId ? null : c.commentId }), rxLabel: "React to " + nm.split(" ")[0] + "’s reply",
      rxSet: (s.boot && s.boot.reactions || CM3_REACT_LIST).map(e => ({ e, src: cm3EmojiSrc(e), name: CM3_REACT_NAMES[e] || e, on: c.myReaction === e ? "true" : "false", bg: c.myReaction === e ? "#fdf1d6" : "transparent", go: () => this.reactReply(tPost.id, c, e) })),
      canQuote: live, doQuote: () => this.quoteReply(c), quoteLabel: "Reply to " + nm.split(" ")[0],
      copy: () => { try { navigator.clipboard.writeText(c.body || "").then(() => this.flash("Copied.")); } catch (e) { this.flash("Couldn’t copy."); } },
      canMark: tPost.kind === "question" && c.status === "published" && (staff || tPost.isMine) && !c.isMe, mark: () => this.markAnswer(tPost.id, c.commentId),
      /* A reply can be reported like a post (that is where unkindness happens), and its author can take it back. */
      canReport: !c.isMe && !!c.commentId, reportLabel: "Report " + nm.split(" ")[0] + "’s reply", report: () => set({ report: { id: c.commentId, type: "comment", reason: null } }),
      canDelete: !!c.isMe && !!c.commentId, del: () => this.removeReply(tPost.id, c), hasActs: !!c.commentId }; }) : [];
    const tq = s.quote ? { name: s.quote.name, body: s.quote.body, clear: () => set({ quote: null }) } : null;
    const tErr = tPost ? !!(s.commentsErr || {})[tPost.id] && !(s.comments[tPost.id] || []).length : false;
    const rchkRaw = s.reply.trim().length > 3 ? this.check(s.reply) : null;
    const rchk = rchkRaw && rchkRaw.v !== "ok" ? { ...rchkRaw, bg: "#fdf1d6", fg: "#6b4b00" } : {};

    // composer
    const c = s.comp;
    const compTypesBase = [["post", "Post", "ph ph-chat-text"], ["question", "Ask a question", "ph ph-question"], ["work", "Show my work", "ph ph-paint-brush-broad"], ["poll", "Poll", "ph ph-chart-bar"]].concat(staff ? [["announce", "Announcement", "ph ph-megaphone"], ["homework", "Homework", "ph ph-backpack"]] : []);
    let compV = { compOpen: false };
    if (c) {
      const cc = chBy[c.ch] || chans[0];
      const mk2 = c.media ? c.media.kind : null;
      const chk = this.check(c.text, mk2);
      const CK = { ok: ["#eef6f0", "#1d4f2a"], review: ["#fdf1d6", "#6b4b00"], nudge: ["#fdf1d6", "#6b4b00"], video: ["#eceefb", "#2a3f9e"] };
      const willHold = !staff && ((mk2 === "video" && mode !== "off") || (chk && chk.v === "review" && mode === "strict"));
      const PH = { post: "Share something with " + cc.name + "…", question: "What do you want to know? Say what you tried and what happened.", work: "What did you make? What was hard? What would you like feedback on?", poll: "What’s the question?", announce: "What does everyone need to know?", homework: "What should students do, and what should they post to show it’s done?" };
      const LB = { post: "Your post", question: "Your question", work: "About your work", poll: "Question", announce: "Announcement", homework: "Instructions" };
      const HELP = { question: "What I tried: \nWhat happened: \nWhat I expected: ", work: "I made: \nThe hardest part was: \nI’d like feedback on: ", homework: "1. \n2. \n3. \nPost a screenshot or link here when you’re done. A phone is fine." };
      const tok = (c.text.match(/@([\w.-]*)$/) || [])[1];
      const ms = s.mentionSug && s.mentionSug.q === tok ? s.mentionSug.people : [];
      if (tok !== undefined && tok.length >= 1 && (!s.mentionSug || s.mentionSug.q !== tok) && this.mq !== tok) { this.mq = tok; this.api().mentions(tok).then(r => this.setState({ mentionSug: { q: tok, people: r.people || [] } })).catch(() => {}); }
      const mentionSug = tok === undefined ? [] : ms.filter(x => staff || x.kind !== "all").slice(0, 6).map(x => ({ name: x.kind === "all" ? "Everyone in " + cc.name : x.name, sub: "@" + x.handle + (x.centre ? " · " + x.centre : "") + (x.kind === "mentor" ? " · Mentor" : ""), inCh: false, ini: x.kind === "all" ? "@" : cm3Ini(x.name), tone: x.kind === "all" ? "#f5b026" : cm3Tone(x.handle), pick: () => set({ comp: { ...c, text: c.text.replace(/@[\w.-]*$/, "@" + x.handle + " ") }, mentionSug: null }) }));
      const tagKeys = [...new Set((c.text.match(/@[a-z0-9_.-]*[a-z0-9_]/gi) || []).map(m => m.slice(1).toLowerCase()))];
      const tagged = tagKeys.map(hd => { const rm = () => set({ comp: { ...c, text: c.text.replace(new RegExp("@" + hd.replace(/[.-]/g, "\\$&") + "\\b\\s?", "gi"), "") } }); if (["all", "channel", "everyone", "here"].includes(hd)) return staff ? { name: "Everyone in " + cc.name, ini: "@", tone: "#f5b026", bg: "#fdf1d6", fg: "#6b4b00", remove: rm, removeLabel: "Remove @" + hd } : null; return { name: "@" + hd, ini: cm3Ini(hd.replace(/[.-]/g, " ")), tone: cm3Tone(hd), bg: "#eef1fb", fg: "#2a3f9e", remove: rm, removeLabel: "Remove @" + hd }; }).filter(Boolean);
      const tagAll = tagKeys.some(h => ["all", "channel", "everyone", "here"].includes(h)) && staff, nPeople = tagged.length - (tagAll ? 1 : 0);
      const taggedLine = tagAll ? "Everyone in " + cc.name + " will get one notification — save @all for things everyone needs." : nPeople === 1 ? "1 person will get a notification" : nPeople + " people will get a notification";
      const optsOk = c.type !== "poll" || c.opts.filter(o => o.trim()).length >= 2;
      const ok = (c.type === "homework" ? c.hwTitle.trim().length > 2 : (c.text.trim().length >= 2 || !!c.media)) && optsOk && !c.up;
      const AT = [["photo", "Photo", "ph ph-image"], ["video", "Video", "ph ph-video-camera"], ["doc", "File", "ph ph-paperclip"], ["code", "Code", "ph ph-code"], ["link", "Link", "ph ph-link"]].concat(mk2 === "video" ? [["captions", c.captions ? "Captions added" : "Captions (.vtt)", "ph ph-closed-captioning"]] : []);
      const due = new Date(String(c.hwDue).replace(" ", "T"));
      const dueOpts = [2, 4, 7].map(d => { const x = new Date(Date.now() + d * 86400000); x.setHours(18, 0, 0, 0); return x; }).map(x => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0") + " 18:00");
      compV = {
        compOpen: true, compTitle: { post: "New post", question: "Ask a question", work: "Show your work", poll: "New poll", announce: "New announcement", homework: "Set homework" }[c.type],
        compTypes: compTypesBase.map(t => { const on = c.type === t[0]; return { label: t[1], icon: t[2], sel: on ? "true" : "false", bg: on ? "#0b0b0c" : "#fff", fg: on ? "#fff" : "#0b0b0c", bd: on ? "#0b0b0c" : "#e8e5dd", go: () => set({ comp: { ...c, type: t[0], ch: t[0] === "homework" && c.ch === "commons" ? ((myChans.find(x => x.slug !== "commons") || {}).slug || c.ch) : c.ch } }) }; }),
        compCh: c.ch, compChans: myChans.filter(x => !(c.type === "homework" && x.slug === "commons")), onCompCh: e => set({ comp: { ...c, ch: e.target.value } }),
        compAudience: cc.kind === "commons" ? "Everyone in NGG · " + (B.everyone || 0).toLocaleString("en") + " people across " + B.centres + " centres" : (cc.members ? cc.members + " people in " + cc.name : "Everyone in " + cc.name) + " · their mentors can read",
        compIsHw: c.type === "homework", hwTitle: c.hwTitle, onHwTitle: e => set({ comp: { ...c, hwTitle: e.target.value } }), hwDue: c.hwDue, onHwDue: e => set({ comp: { ...c, hwDue: e.target.value } }),
        dueOpts: dueOpts.map(x => ({ v: x, l: new Date(x.replace(" ", "T")).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " · 6:00 pm" })),
        compLabel: LB[c.type], compPh: PH[c.type] + (mk2 === "video" ? " Add chapters as lines like “0:00 Intro”." : ""), compText: c.text, onCompText: e => { let t = e.target.value; const extra = {};
          /* The slash shortcuts the previous composer had: /poll turns the post into a poll, /shrug types one. */
          if (/^\/poll\s$/.test(t)) { t = ""; extra.type = "poll"; } else if (/\/shrug\s$/.test(t)) t = t.replace(/\/shrug\s$/, "¯\\_(ツ)_/¯ ");
          set({ comp: { ...c, text: t, ...extra } }); this.draft(c.ch, t); this.typingPing(c.ch); },
        compHasHelp: !!HELP[c.type] && !c.text.trim(), compHelp: () => set({ comp: { ...c, text: HELP[c.type] } }),
        compTagNote: c.up ? "Uploading… " + c.up + "%" : staff ? "Type @ to mention someone, or @all to notify the whole channel." : "Type @ to mention someone.",
        hasMentionSug: mentionSug.length > 0, mentionSug, hasTagged: tagged.length > 0, tagged, taggedLine,
        compIsPoll: c.type === "poll", pollInputs: c.opts.map((v, i) => ({ v, ph: "Choice " + (i + 1), on: e => { const o = c.opts.slice(); o[i] = e.target.value; set({ comp: { ...c, opts: o } }); } })), canAddOpt: c.opts.length < 4, addOpt: () => set({ comp: { ...c, opts: c.opts.concat([""]) } }),
        attachOpts: AT.map(a => { const on = a[0] === "captions" ? !!c.captions : mk2 === a[0]; return { label: on && a[0] !== "captions" ? a[1] + " added" : a[1], icon: on ? "ph-fill ph-check-circle" : a[2], pressed: on ? "true" : "false", bg: on ? "#fdf6e3" : "#fff", bd: on ? "#f5b026" : "#e8e5dd", go: () => this.attach(a[0]) }; }),
        hasCheck: !!chk, chk: chk ? { msg: chk.msg, icon: chk.icon, bg: CK[chk.v][0], fg: CK[chk.v][1], hasFix: !!chk.fix, fixLabel: chk.fixLabel || "", fix: () => set({ comp: { ...c, text: chk.fix } }) } : {},
        compFoot: willHold ? "A mentor checks this before it appears. You’ll get a notification when it’s live." : "Mentors can read every post. Be kind, keep private things private.",
        compBtn: s.busy ? "Posting…" : willHold ? "Send for a check" : c.type === "homework" ? "Set homework" : "Post", compOff: !ok || s.busy, compBtnBg: ok && !s.busy ? "#0b0b0c" : "#b9b9b4"
      };
    }

    const RSN = [["unkind", "It’s unkind or bullying", "ph ph-hand-palm"], ["uncomfortable", "It makes me feel uncomfortable", "ph ph-smiley-sad"], ["private", "It shares someone’s private details", "ph ph-lock-key"], ["spam", "It’s spam or an advert", "ph ph-megaphone-simple"], ["safety", "I’m worried someone is not safe", "ph ph-lifebuoy"]];
    const rp = s.report;
    const reasons = RSN.map(r => { const on = rp && rp.reason === r[0], sf = r[0] === "safety"; return { label: r[1], icon: on ? "ph-fill ph-check-circle" : r[2], sel: on ? "true" : "false", bd: on ? (sf ? "#b42318" : "#0b0b0c") : sf ? "#f3c7c2" : "#e8e5dd", bg: on ? (sf ? "#fdf1ef" : "#faf9f6") : sf ? "#fffafa" : "#fff", fg: sf ? "#7a1a10" : "#0b0b0c", go: () => set({ report: { ...rp, reason: r[0] } }) }; });

    const tabbar = [["home", "Home", "ph ph-house", s.view === "home", unreadN, goView("home", { filter: "all" })], ["chan", "Channels", "ph ph-hash", s.view === "channel", 0, () => set({ sheet: true })], ["homework", "Homework", "ph ph-backpack", s.view === "homework", staff ? reviewN : todoN, goView("homework")], admin ? ["mod", "Moderate", "ph ph-shield-check", s.view === "mod", queue.length + openCases, goView("mod")] : ["arcade", "Arcade", "ph ph-game-controller", s.view === "arcade", 0, goView("arcade")]]
      .map(t => ({ label: t[1], icon: t[3] ? t[2].replace("ph ", "ph-fill ") : t[2], cur: t[3] ? "page" : undefined, fg: t[3] ? "#0b0b0c" : "#6b6b72", fw: t[3] ? 600 : 500, badge: String(t[4] > 99 ? "99+" : t[4] || ""), hasBadge: !!t[4], badgeBg: t[0] === "mod" || t[0] === "home" ? "#b42318" : "#0b0b0c", go: t[5] }));

    const VW = this.viewerValues(narrow, W, person, meKey);

    let pc = {};
    if (s.card) {
      const k = s.card, pp = person(k), mineP = visible.filter(p => p.author === k && p.status !== "pending");
      const sh = myChans.filter(ch => visible.some(p => p.ch === ch.slug && p.author === k));
      const stars = mineP.reduce((t, p) => t + (p.stars || 0), 0);
      pc = { name: pp.name, ini: pp.ini, tone: pp.tone, band: pp.tone, role: pp.role, staff: !!pp.staff, handle: k === meKey ? me0.handle : this.handle(pp.name), centre: pp.centre || "",
        stats: [{ v: String(mineP.length), l: "posts here" }, { v: String(mineP.reduce((t, p) => t + p.n, 0)), l: "replies to them" }, { v: String(stars), l: "Genius Stars" }],
        chans: sh.map(ch => ({ name: ch.name, icon: ch.icon, color: ch.color, go: () => { set({ card: null }); this.goCh(ch.slug)(); } })),
        mention: () => { set({ card: null }); this.openComp("post"); setTimeout(() => this.setState(st => ({ comp: st.comp ? { ...st.comp, text: "@" + this.handle(pp.name) + " " } : st.comp })), 0); },
        posts: () => this.setState({ card: null, view: "home", filter: "all", q: "", byAuthor: { key: k, name: pp.name }, thread: null }, () => this.loadFeed(true)),
        note: pp.staff ? "Ask " + pp.name.split(" ")[0] + " in your channel so everyone can learn from the answer." : "There are no private messages in Community. To talk 1-to-1, use your mentor in My NGG." };
    }
    const slides = s.slides.length ? s.slides : [{ kind: "news", tag: "This week at NGG", icon: "ph ph-sparkle", title: "Welcome to the Community", d: "Share what you made, ask when you’re stuck, and cheer each other on.", cta: "" }];
    const nS = slides.length, ci = ((s.car || 0) % nS + nS) % nS, cs = slides[ci] || {};
    const sl = { ...cs, isQuote: cs.kind === "quote", isNews: cs.kind === "news", icon: cs.kind === "quote" ? "ph-fill ph-quotes" : cs.icon,
      go: cs.post ? () => this.openPost(cs.post) : cs.hw ? goView("homework", { hwSel: cs.hw }) : () => {} };
    const carDots = slides.map((x, i) => ({ sel: i === ci ? "true" : "false", label: "Slide " + (i + 1) + ": " + (x.title || x.tag), w: i === ci ? "24px" : "8px", bg: i === ci ? "#0b0b0c" : "#d9d8d2", go: () => set({ car: i }) }));
    const tiles = myChans.map(c2 => { const un = s.read[c2.slug] ? 0 : c2.unread; return { name: c2.name, icon: c2.icon, color: c2.color, n: String(un), hasNew: un > 0, sub: un ? un + " new" : c2.posts.toLocaleString("en") + (c2.posts === 1 ? " post" : " posts"), go: this.goCh(c2.slug) }; }).sort((x, y) => (y.hasNew ? 1 : 0) - (x.hasNew ? 1 : 0));
    const threadOpen = !!tPost;
    const emptyLoading = s.loading && !posts.length;
    const ed = s.edit;
    const editEl = ed ? React.createElement(Cm3EditDialog, { ed, onClose: () => set({ edit: null }), onSave: text => { set({ edit: null }); if (ed.msg) NGGApi.admin.community.moderate("post", ed.it.postId, "message", { note: text }).then(() => this.flash("Sent privately to " + String(ed.it.author || "them").split(" ")[0] + ".")).catch(e => this.flash(cm3Err(e))); else this.moderate(ed.it, "edit", { body: text }, "Edited and published. " + String(ed.it.author || "They").split(" ")[0] + " is told it was changed."); } }) : null;

    return {
      ...base, ready: true, narrow, isStudent: !staff,
      showAside: !narrow || s.sheet, asidePos: narrow ? "absolute" : "relative", asideW: narrow ? "min(320px, 86%)" : "256px", asideSh: narrow ? "0 0 40px rgba(0,0,0,.2)" : "none", sheetScrim: narrow && s.sheet, openSheet: () => set({ sheet: true }), closeSheet: () => set({ sheet: false }),
      meCentre: role === "admin" ? "Community team · all centres" : (me0.centre ? me0.centre + " centre" : "NGG"), meName: me0.name, meIni: cm3Ini(me0.name), meTone: cm3Tone(meKey), meRole: me0.roleLabel, roles, showRoles: false,
      q: s.q, onQ: e => { const v = e.target.value; this.setState({ q: v, view: s.view === "channel" ? "channel" : "home", chTab: "posts" }); clearTimeout(this.qT); this.qT = setTimeout(() => { if (this.state.view === "home" || this.state.view === "channel") this.loadFeed(true); }, 350); },
      newPost: () => this.openComp("post"), setHw: () => this.openComp("homework"),
      navViews, navChans, navTools, myChanN: String(myChans.length),
      headPad: narrow ? "8px 16px 12px" : "18px 28px 14px", bodyPad: narrow ? "14px 16px 100px" : "20px 28px 48px", maxW: onMod ? "1040px" : onFiles || s.view === "arcade" || s.view === "support" ? "900px" : "720px", h1Size: narrow ? "19px" : "23px",
      title, sub, hasHeadTile, headIcon: cur.icon, headColor: cur.color,
      showDigestBtn: s.view === "home" && s.filter === "all", digestExp: s.digest ? "true" : "false", digestBtnLabel: narrow ? "Catch up" : "Catch me up",
      toggleDigest: () => { set({ digest: !s.digest }); if (!s.digest) this.loadDigest(); },
      hasTabs, tabs, tabsLabel,
      onFeed, showChips: narrow && s.view === "home", showHero: s.view === "home" && s.filter === "all" && !s.q.trim(), sl, carDots, carPos: (ci + 1) + " / " + nS, carMinH: narrow ? "190px" : "176px", quoteSize: narrow ? "24px" : "30px", newsSize: narrow ? "21px" : "25px",
      carPrev: () => set({ car: ci - 1 }), carNext: () => set({ car: ci + 1 }), carToggle: () => set({ carPaused: !s.carPaused }), carToggleLabel: s.carPaused ? "Play slideshow" : "Pause slideshow", carToggleIcon: s.carPaused ? "ph-fill ph-play" : "ph-fill ph-pause",
      pauseCar: () => { this.carHover = true; }, resumeCar: () => { this.carHover = false; },
      shareQuote: () => { const t = (cs.quote || cs.title || "") + (cs.by ? " — " + cs.by : ""); try { if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { navigator.clipboard.writeText(t); this.flash("Quote copied. Paste it anywhere."); } } catch (e) { this.flash(t); } },
      tiles, showTiles: !admin && s.view === "home" && s.filter === "all" && !s.q.trim(),
      chips, digestOpen: s.digest && s.view === "home", digest: dg, digestMeta: D0 ? D0.digest : "From your unread posts · " + me0.first,
      digestFoot: D0 && D0.more ? "And " + D0.more + " more under Unread. Open a post to read it in full." : D0 && D0.ai ? "The first line is written by the NGG assistant and can miss things: open a post to read it in full." : "Open a post to read it in full; it then counts as read.",
      showAdminStrip: admin && s.view === "home" && s.filter === "all", queueN: String(s.stats ? s.stats.counts.held + s.stats.counts.video + s.stats.counts.reported : "…"), casesN: String(openCases), goQueue: goView("mod", { modTab: "queue" }), goSg: goView("mod", { modTab: me0.canSafeguard ? "sg" : "queue" }),
      showWaiting: role === "instructor" && s.view === "home" && s.filter === "all", waiting, waitEmpty: !waiting.length, waitMeta: waiting.length ? waiting.length + " waiting" : "",
      showHwStrip: !staff && !!nextTodo && s.view === "home" && s.filter === "all" && !rail, hwStrip,
      promptPh: s.view === "channel" ? "Share something with " + cur.name + "…" : "Share something, ask a question, or show your work…", quickTypes, outLinks: [["My NGG", "ph ph-house", "/dashboard"], ["NGG website", "ph ph-globe-simple", "/"]].map(([l, icon, to]) => ({ l, icon, go: () => { try { history.pushState({}, "", to); dispatchEvent(new PopStateEvent("popstate")); } catch (e) { location.assign(to); } } })), promptRef: this.promptRef, dockCls: (s.dockOn ? "is-on" : "") + (narrow ? " is-tabbed" : ""), dockHidden: s.dockOn ? "false" : "true", dockTab: s.dockOn ? "0" : "-1",
      typing: s.view === "channel" && !!s.typing, typingText: s.typing,
      feed, feedEmpty: !feed.length,
      emptyT: emptyLoading ? "Loading posts…" : s.feedErr ? "Couldn’t load the posts" : s.byAuthor && !q && s.view === "home" ? s.byAuthor.name.split(" ")[0] + " hasn’t posted in your channels yet" : q ? "Nothing matches “" + s.q.trim() + "”" : F === "unread" ? "You’re all caught up" : F === "saved" ? "Nothing saved yet" : F === "mentions" ? "No mentions yet" : F === "questions" ? "No questions yet" : s.view === "channel" ? "Nothing here yet. Be the first to post in " + cur.name + "." : "Nothing here yet",
      emptyD: emptyLoading ? "" : s.feedErr ? s.feedErr + " Pull down or tap Home to try again." : q ? "Try a name, a channel, or fewer words." : F === "saved" ? "Tap the bookmark on any post to keep it here." : F === "unread" ? "New posts in your channels will show up here." : F === "questions" ? "Ask one — someone has probably wondered the same thing." : "Be the first to post.",
      onHwStudent: onHw && !staff, hwList, hwEmpty: !hwList.length && s.hw !== null, hwErrOn: !!s.hwErr, hwErr: s.hwErr || "", hwRetry: () => this.loadHw(), hwLoading: s.hw === null && !s.hwErr,       onHwStaff: onHw && staff, staffTasks, hasTracker: !!sel, noTracker: !sel && s.hw !== null, tr, trRows, trFilters,
      onFiles, fileChips, files, filesEmpty: !files.length,
      onPeople: s.view === "channel" && s.chTab === "people", people,
      onJournal: s.view === "journal", journalEl: s.view === "journal" && typeof CmJournalMine === "function" ? React.createElement(Cm3Journal, { auth: this.props.auth, onWrite: seed => this.setState({ writing: seed }) }) : null,
      offlineEl: s.offline ? React.createElement("p", { className: "cm3x-offline", role: "status" }, "You’re offline. What you’re writing is kept as a draft on this device — press Post again once you’re back online.") : null,
      /* The design's one full-width panel slot: the Arcade, and the support
         desk (support-desk.jsx) — the same cases as My NGG, opened from here. */
      onArcade: s.view === "arcade" || s.view === "support",
      arcadeEl: s.view === "arcade" && typeof CmArcade === "function" ? React.createElement(CmArcade, { auth: this.props.auth })
        : s.view === "support" && typeof NggSupportDesk === "function" ? React.createElement(NggSupportDesk, { api: NGGApi.member.support, source: "community",
            safeguard: { text: "Read how to tell somebody", onClick: () => { location.href = "/dashboard/help"; } } }) : null,
      modLocked: s.view === "mod" && s.modLocked, modGateEl: s.view === "mod" && s.modLocked && typeof AdminTotpGate === "function" ? React.createElement("div", { className: "cm3x-gate" }, React.createElement("p", null, "Moderation needs your two-step code, the same as the Control Room."), React.createElement(AdminTotpGate, { member: this.props.auth && this.props.auth.member, onPass: () => { this.setState({ modLocked: false }); this.loadMod(); } })) : null,
      onMod, modStats, modQueue: onMod && s.modTab === "queue", qChips, qItems, qEmpty: !qItems.length, modSg: onMod && s.modTab === "sg" && me0.canSafeguard, caseItems, modChannels: onMod && s.modTab === "channels", chRows,
      newChannel: () => this.flash("Course channels are created from timetable slots. Add a slot in the Club portal’s Timetable."), modHealth: onMod && s.modTab === "health", health: { ai: "" }, hStats, hDays, hCentres, hTop, hQuiet,
      modSettings: onMod && s.modTab === "settings", modes, modeAskOpen: !!s.modeAsk, modeAskText, modeNow: mode[0].toUpperCase() + mode.slice(1), cancelMode: () => set({ modeAsk: null }),
      confirmMode: () => { const m = s.modeAsk; NGGApi.admin.community.moderation(m).then(r => { set({ modeAsk: null, boot: Object.assign({}, B, { mode: m }) }); this.flash("Mode set to " + m + ". " + (r.released ? r.released + " held items released. " : "") + "Change logged."); this.loadMod(); }).catch(e => { set({ modeAsk: null }); this.flash(cm3Err(e)); }); },
      showRail: rail && !threadOpen && (s.view === "home" || s.view === "channel"), railAbout: s.view === "channel", about, railHw: !!railTask && !admin, rh, railStars: staff && !admin, starsLeftLabel: s.stars + " Genius Stars left today", promise,
      threadOpen, threadOverlay: threadOpen && !rail, thPos: rail ? "relative" : "absolute", thW: narrow ? "100%" : "420px", tp, tComments, tEmpty: !tComments.length && !tErr, tErr, tRetry: () => { this.setState(st => ({ commentsErr: Object.assign({}, st.commentsErr, { [tPost.id]: false }) })); this.loadComments(tPost.id); }, closeThread: () => { this.thLanded = null; set({ thread: null, reply: "", quote: null, rxOpen: null }); },
      reply: s.reply, onReply: e => { set({ reply: e.target.value }); if (tPost) this.typingPing(tPost.ch); }, sendReply: () => this.sendReply(),
      /* Enter sends and Shift+Enter is a new line, with a keyboard that has
         both; on a phone Enter is a new line and the button sends. */
      replyKey: e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !narrow) { e.preventDefault(); this.sendReply(); } },
      replyRef: this.replyRef, thRef: this.thRef, thScroll: e => this.thScroll(e), thPointer: e => this.thPointer(e),
      hasQuote: !!tq, tq: tq || {}, thTyping: s.typing || "", hasThTyping: !!s.typing && !!tPost && tPost.ch === s.ch,
      showJump: s.thAway, jumpLabel: s.thNew ? s.thNew + " new" : "", hasJumpN: s.thNew > 0, jump: () => this.thBottom(true), jumpAria: s.thNew ? "Go to the " + s.thNew + " new " + (s.thNew === 1 ? "reply" : "replies") : "Go to the latest reply", replyOff: !s.reply.trim() || s.busy, sendBg: s.reply.trim() ? "#0b0b0c" : "#b9b9b4", replyPh: tPost && tPost.kind === "question" && staff ? "Answer the question…" : "Say something kind and specific…", hasReplyChk: !!rchk.msg, rchk,
      ...compV, closeComp: () => set({ comp: null }), submit: () => this.submit(),
      modalAlign: narrow ? "flex-end" : "center", modalPad: narrow ? "0" : "24px", modalR: narrow ? "20px 20px 0 0" : "16px",
      reportOpen: !!rp, reasons, reportSafety: !!rp && rp.reason === "safety", reportOff: !(rp && rp.reason), reportBtnBg: rp && rp.reason ? (rp.reason === "safety" ? "#b42318" : "#0b0b0c") : "#b9b9b4", closeReport: () => set({ report: null }), sendReport: () => this.sendReport(),
      ...VW, tabbar, showFab: onFeed && !s.dockOn, cardOpen: !!pc.name, pc, closeCard: () => set({ card: null }), stop: e => e.stopPropagation(),
      hasToast: !!s.toast, toast: s.toast, toastBottom: narrow ? "86px" : "24px",
      editEl, moreEl: onFeed && s.hasMore ? React.createElement("button", { className: "cm3x-more", onClick: () => this.loadFeed(false), disabled: s.loading }, s.loading ? "Loading…" : "Show older posts") : null,
      undoEl: s.toastUndo ? React.createElement("button", { className: "cm3x-undo", onClick: () => { s.toastUndo(); this.setState({ toast: "", toastUndo: null }); } }, "Undo") : null
    };
  }

  /* ── viewer values (video · pdf · code) ──────────────────────────────── */
  viewerValues(narrow, W, person, meKey) {
    const s = this.state, set = o => this.setState(o), vwS = s.viewer;
    if (!vwS) return { viewerOpen: false };
    const vp = this.postById(vwS.post), md = s.media[vwS.post] || {}, author = vp ? person(vp.author) : { name: "" };
    const nRep = vp ? vp.n : 0;
    const vw = { post: vwS.post, hasPost: !!vp, replies: nRep ? nRep + (nRep === 1 ? " reply" : " replies") : "Reply", openPost: () => { this.closeViewer(); set({ thread: vwS.post }); this.loadComments(vwS.post); }, icon: { video: "ph-fill ph-play-circle", doc: "ph ph-file-pdf", code: "ph ph-code" }[vwS.type] || "ph ph-file", title: vwS.name || "", sub: "" };
    const VW = { viewerOpen: true, vw, vIsVideo: vwS.type === "video", vIsPdf: vwS.type === "doc", vIsCode: vwS.type === "code", closeViewer: () => this.closeViewer() };
    if (vwS.type === "video") {
      const t = s.vt || 0, dur = s.vDur || md.duration || 1;
      const chs = (md.chapters && md.chapters.length ? md.chapters : [[0, "Full video"]]), caps = md.captions || [];
      const chEnd = i => i + 1 < chs.length ? chs[i + 1][0] : dur, chAt = x => { let k = 0; chs.forEach((c, i) => { if (x >= c[0]) k = i; }); return k; };
      let cur = -1; caps.forEach((c, i) => { if (t >= c[0]) cur = i; });
      const ci = chAt(t), ended = !!s.vEnded, side = W >= 1100 && !s.vTheater, ctrlOn = !s.vPlay || !s.vIdle || !!s.vMenu || ended;
      const sp = s.vSpeed || 1, vol = s.vMuted ? 0 : (s.vVol ?? 1), tm = cm3Fmt(t), q = (s.vQ || "").trim().toLowerCase(), tab = s.vTab || (chs.length > 1 ? "chapters" : caps.length ? "transcript" : "next");
      vw.title = md.title || (vp ? vp.body.split("\n")[0].slice(0, 80) : "") || "Video"; vw.sub = author.name + " · " + cm3Fmt(dur) + (chs.length > 1 ? " · " + chs.length + " chapters" : "");
      const go = x => { this.vSeek(x); const v = this.vEl(); if (v && v.paused) v.play().catch(() => {}); };
      const nextP = this.vNextPost(vwS.post), openK = p => this.openViewer("video", p.id, p.id);
      const hov = s.vHov, hovT = hov != null ? hov * dur : 0;
      const lines = caps.map((c, i) => ({ c, i })).filter(({ c }) => !q || c[1].toLowerCase().includes(q)).map(({ c, i }) => { const on = i === cur, ix = q ? c[1].toLowerCase().indexOf(q) : -1; return { ts: cm3Fmt(c[0]), pre: ix >= 0 ? c[1].slice(0, ix) : c[1], hit: ix >= 0 ? c[1].slice(ix, ix + q.length) : "", post: ix >= 0 ? c[1].slice(ix + q.length) : "", hasHit: ix >= 0, cur: on ? "true" : "false", bg: on ? "#1f1f22" : "transparent", fg: on ? "#fff" : "#c9c7bf", tsFg: on ? "#f5b026" : "#8a8a90", go: () => go(c[0]) }; });
      if (tab === "points" && !md.points?.length && !md.pointsAsked && md.captions?.length) { this.setState(st => ({ media: Object.assign({}, st.media, { [vwS.post]: Object.assign({}, md, { pointsAsked: true }) }) })); this.api().videoPoints(vwS.post).then(r => this.setState(st => ({ media: Object.assign({}, st.media, { [vwS.post]: Object.assign({}, st.media[vwS.post], { points: r.points || [] }) }) }))).catch(() => {}); }
      const pts = (md.points || []).map(p => ({ ts: cm3Fmt(p[0]), t: p[1], go: () => go(p[0]) }));
      const pill = on => ({ bg: on ? "#f5b026" : "#26262a", fg: on ? "#0b0b0c" : "#fff", sel: on ? "true" : "false" });
      const h = React.createElement;
      const nextPoster = nextP && nextP.media.poster ? h("img", { src: cmOpt(nextP.media.poster, 480), alt: "", loading: "lazy", className: "cm3x-fill" }) : null;
      Object.assign(VW, {
        vStageRef: this.vStageRef,
        vMediaEl: h("video", { ref: this.vRef, key: vwS.post, className: "cm3x-video", src: cmOpt(vwS.url) || vwS.url, poster: vwS.poster ? cmOpt(vwS.poster, 1280) : undefined, preload: "metadata", playsInline: true, muted: !!s.vMuted,
          onLoadedMetadata: e => { const d = e.target.duration; if (isFinite(d)) this.setState({ vDur: Math.round(d) }); e.target.volume = vol; e.target.playbackRate = sp; if (md.pos > 3 && !this.vResumedSet) { e.target.currentTime = md.pos; } },
          onTimeUpdate: e => { const ct = e.target.currentTime; e.target.playbackRate = this.state.vSpeed || 1; e.target.volume = this.state.vMuted ? 0 : (this.state.vVol ?? 1); this.setState({ vt: ct, vEnded: false }); if (Date.now() - (this.vSaved || 0) > 10000) this.vSave(vwS.post, ct); },
          onPlay: () => this.setState({ vPlay: true, vEnded: false }), onPause: () => this.setState({ vPlay: false }),
          onEnded: () => { this.vSave(vwS.post, 0); this.setState({ vPlay: false, vEnded: true, vIdle: false }); if (this.state.vAuto !== false && nextP) { this.setState({ vNextIn: 6 }); clearInterval(this.vNT); this.vNT = setInterval(() => { const n = (this.state.vNextIn || 0) - 0.25; if (this.state.vNextIn == null) { clearInterval(this.vNT); return; } if (n <= 0) { clearInterval(this.vNT); openK(nextP); } else this.setState({ vNextIn: n }); }, 250); } },
          onError: () => this.vFlashOn("ph ph-warning", "This video can’t play here", "c") },
          caps.length ? h("track", { kind: "captions", srcLang: "en", label: "English", default: false }) : null),
        vDir: side ? "row" : "column", vOuterOv: side ? "hidden" : "auto", vColFlex: side ? "1 1 0px" : "0 0 auto", vColOv: side ? "auto" : "visible",
        vPad: side ? "16px 16px 16px 24px" : (narrow ? "0" : "16px 24px 8px"), vMaxW: side ? "100%" : (narrow ? "100%" : "1028px"), vStageR: narrow ? "0" : "12px", vCursor: s.vPlay && s.vIdle && !s.vMenu ? "none" : "default",
        vPoke: () => this.vPoke(), vZoneL: () => this.vZone("l"), vZoneC: () => this.vZone("c"), vZoneR: () => this.vZone("r"),
        vBigPlay: !s.vPlay && !ended && !s.vMenu, vFlashEl: this.vFlashEl(),
        vCapOn: s.vCap !== false && cur >= 0 && !!(caps[cur] || [])[1], vCapText: (caps[cur] || [])[1] || "", vCapSize: s.vCapBig ? (narrow ? "18px" : "24px") : (narrow ? "15px" : "19px"), vCapBottom: ctrlOn ? (narrow ? "68px" : "84px") : "22px",
        vResumedOn: s.vResumed != null, vResumedAt: s.vResumed != null ? "Resumed at " + cm3Fmt(s.vResumed) : "", vStartOver: () => { go(0); set({ vResumed: null }); },
        vEnded: ended, vReplay: () => { go(0); set({ vNextIn: null, vEnded: false }); },
        vHasNext: !!nextP, vNextTitle: nextP ? (nextP.media.title || nextP.body.split("\n")[0].slice(0, 60) || "Next video") : "", vNextBy: nextP ? person(nextP.author).name + " · " + cm3Fmt(nextP.media.dur) : "", vNextThumbEl: nextPoster, vNextThumbOn: !!nextP, vNextGo: () => nextP && openK(nextP),
        vCtrlOp: ctrlOn ? "1" : "0", vCtrlPe: ctrlOn ? "auto" : "none",
        vCounting: s.vNextIn != null, vNextLabel: s.vNextIn != null ? "Up next in " + Math.ceil(s.vNextIn) : "Up next", vNextBar: s.vNextIn != null ? ((6 - s.vNextIn) / 6 * 100).toFixed(1) + "%" : "0%", vCancelNext: () => { clearInterval(this.vNT); set({ vNextIn: null }); },
        vMenuSettings: s.vMenu === "settings", vMenuKeys: s.vMenu === "keys", vSettings: () => set({ vMenu: s.vMenu === "settings" ? null : "settings" }), vSetExp: s.vMenu === "settings" ? "true" : "false", vCloseMenu: () => set({ vMenu: null }), vOpenKeys: () => set({ vMenu: "keys" }),
        vSpeeds: [0.5, 0.75, 1, 1.25, 1.5, 2].map(x => ({ label: x === 1 ? "Normal" : x + "×", ...pill(x === sp), go: () => set({ vSpeed: x }) })),
        vCapSizes: [[false, "Standard"], [true, "Large"]].map(([b, l]) => ({ label: l, ...pill(!!s.vCapBig === b), go: () => set({ vCapBig: b, vCap: true }) })),
        vAutoPressed: s.vAuto !== false ? "true" : "false", vAutoBg: s.vAuto !== false ? "#f5b026" : "#3a3a40", vAutoX: s.vAuto !== false ? "18px" : "2px", vAutoToggle: () => set({ vAuto: s.vAuto === false }),
        vSpeedOn: sp !== 1, vSpeedBadge: sp + "×",
        vSegs: chs.map((c, i) => { const a = c[0], b = chEnd(i); return { flex: String(Math.max(1, b - a)), fill: (t >= b ? 100 : t <= a ? 0 : (t - a) / (b - a) * 100).toFixed(2) + "%", bg: hov != null && chAt(hovT) === i ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.28)" }; }),
        vPct: (dur ? t / dur * 100 : 0).toFixed(2) + "%", vDur: String(dur), vt: String(Math.floor(t)), vValText: tm + " of " + cm3Fmt(dur),
        vSeek: e => this.vSeek(+e.target.value),
        vHovMove: e => { const r = e.currentTarget.getBoundingClientRect(), x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); if (this.state.vHov == null || Math.abs(x - this.state.vHov) > 0.004) set({ vHov: x }); this.vPoke(); },
        vHovOut: () => set({ vHov: null }), vHovOn: hov != null, vHovLeft: Math.max(8, Math.min(92, (hov || 0) * 100)).toFixed(1) + "%", vHovTime: cm3Fmt(hovT), vHovHasChap: chs.length > 1, vHovChap: chs[chAt(hovT)][1],
        vToggle: () => this.vToggle(), vPlayIcon: s.vPlay ? "ph-fill ph-pause" : ended ? "ph ph-arrow-counter-clockwise" : "ph-fill ph-play", vPlayLabel: s.vPlay ? "Pause (K)" : ended ? "Replay" : "Play (K)",
        vBack: () => this.vSeekBy(-10), vFwd: () => this.vSeekBy(10), vWideCtl: !narrow,
        vMute: () => this.vMute(), vVolIcon: vol === 0 ? "ph-fill ph-speaker-x" : vol < 0.5 ? "ph-fill ph-speaker-low" : "ph-fill ph-speaker-high", vMuteLabel: vol === 0 ? "Unmute (M)" : "Mute (M)", vVol: String(vol), vOnVol: e => set({ vVol: +e.target.value, vMuted: +e.target.value === 0 }),
        vTime: tm + " / " + cm3Fmt(dur), vChapBtn: () => set({ vTab: "chapters", vTheater: false }), vHasChaps: chs.length > 1 && W >= 760,
        vCapToggle: () => set({ vCap: s.vCap === false }), vCapPressed: s.vCap !== false ? "true" : "false", vCapBd: s.vCap !== false ? "#f5b026" : "#6b6b72",
        vCanTheater: W >= 1100, vTheaterToggle: () => set({ vTheater: !s.vTheater }), vTheaterLabel: s.vTheater ? "Show side panel (T)" : "Theatre mode (T)", vTheaterIcon: s.vTheater ? "ph ph-sidebar-simple" : "ph ph-rectangle",
        vFull: () => this.vFull(), vFullIcon: s.vFs ? "ph ph-corners-in" : "ph ph-corners-out", vFullLabel: s.vFs ? "Exit full screen (F)" : "Full screen (F)",
        vNowLabel: (chs.length > 1 ? "Chapter " + (ci + 1) + " of " + chs.length + " · " : "") + Math.round(dur ? t / dur * 100 : 0) + "% watched",
        vChapName: chs[ci][1], vChapPos: chs.length > 1 ? (ci + 1) + "/" + chs.length : "",
        vCanReply: !!vp, vReplyLabel: "Reply at " + tm, vReplyAt: () => { this.closeViewer(); set({ thread: vwS.post, reply: "At " + tm + " — " }); this.loadComments(vwS.post); },
        vCopyLabel: "Copy link at " + tm, vCopy: () => { const u = location.origin + "/community?post=" + encodeURIComponent(vwS.post) + "#t=" + Math.floor(t); try { navigator.clipboard && navigator.clipboard.writeText(u).catch(() => {}); } catch (e) {} this.vFlashOn("ph ph-link", "Link copied · opens at " + tm, "c"); },
        vPanelW: side ? "380px" : "100%", vPanelMax: side ? "380px" : (narrow ? "100%" : "1028px"), vPanelAlign: side ? "stretch" : "center", vPanelBl: side ? "1px solid #232327" : "0", vPanelPad: side ? "16px" : (narrow ? "0 12px 20px" : "0 24px 28px"),
        vTabs: [["chapters", "Chapters"], ["transcript", "Transcript"], ["points", "Summary"], ["next", "Up next"]].map(([id, l]) => { const on = tab === id; return { label: l, sel: on ? "true" : "false", bg: on ? "#fff" : "transparent", fg: on ? "#0b0b0c" : "#c9c7bf", go: () => set({ vTab: id }) }; }),
        vTabCh: tab === "chapters", vTabTr: tab === "transcript", vTabPt: tab === "points", vTabNx: tab === "next",
        vChaps: chs.map((c, i) => { const e = chEnd(i), on = i === ci && !ended, done = t >= e; return { n: String(i + 1), title: c[1], ts: cm3Fmt(c[0]), len: cm3Fmt(e - c[0]), bg: on ? "#1f1f22" : "transparent", fg: on ? "#fff" : "#c9c7bf", numBg: on ? "#f5b026" : done ? "#20352a" : "#26262a", numFg: on ? "#0b0b0c" : done ? "#9fd3a9" : "#c9c7bf", done: done && !on, showN: !(done && !on), cur: on ? "true" : "false", prog: (done ? 100 : on ? (t - c[0]) / Math.max(1, e - c[0]) * 100 : 0).toFixed(1) + "%", go: () => go(c[0]) }; }),
        vQ: s.vQ || "", vOnQ: e => set({ vQ: e.target.value }), vClearQ: () => set({ vQ: "" }), vHasQ: !!q, vQCount: lines.length + (lines.length === 1 ? " match" : " matches"), vLines: lines, vNoLines: !lines.length,
        vPoints: pts, vNoPoints: !pts.length,
        vMore: this.videoPosts().filter(p => p.id !== vwS.post).slice(0, 8).map(p => { const p0 = (s.media[p.id] || {}).pos || 0, d = p.media.dur || 1; return { title: p.media.title || p.body.split("\n")[0].slice(0, 60) || "Video", meta: person(p.author).name + " · " + cm3Fmt(p.media.dur), dur: cm3Fmt(p.media.dur), thumbEl: p.media.poster ? h("img", { src: cmOpt(p.media.poster, 320), alt: "", loading: "lazy", className: "cm3x-fill" }) : null, hasProg: p0 > 0, prog: (p0 / d * 100).toFixed(1) + "%", isNext: nextP && p.id === nextP.id, go: () => openK(p) }; })
      });
    }
    if (vwS.type === "doc") {
      const n = s.pdfPages || vwS.pages || 1, pi = Math.min(s.page || 0, n - 1), zm = s.zoom || 100;
      vw.title = vwS.name || "Document"; vw.sub = "Shared by " + author.name.split(" ")[0] + " · " + n + (n === 1 ? " page" : " pages");
      Object.assign(VW, { pdfRail: !narrow && n > 1, pdfThumbs: Array.from({ length: Math.min(n, 60) }, (_, i) => ({ h: "Page " + (i + 1), n: String(i + 1), label: "Page " + (i + 1), cur: i === pi ? "page" : undefined, ring: i === pi ? "#f5b026" : "transparent", go: () => set({ page: i }) })),
        pdfPageEl: /pdf$/i.test((this.postById(vwS.post) || { media: {} }).media.format || "pdf") ? React.createElement(Cm3PdfPage, { url: cm3DocUrl(vwS.post), dl: cm3DocUrl(vwS.post, true), page: pi, zoom: zm, onPages: k => this.setState({ pdfPages: k }) }) : React.createElement("div", { className: "cm3x-pdf-msg" }, React.createElement("p", null, "This kind of file can’t be previewed here."), React.createElement("a", { className: "cm3x-pdf-dl", href: cm3DocUrl(vwS.post, true), download: vwS.name || "" }, React.createElement("i", { className: "ph ph-download-simple", "aria-hidden": "true" }), "Download it to open it")),
        pgLabel: "Page " + (pi + 1) + " of " + n, pgPrev: () => set({ page: Math.max(0, pi - 1) }), pgNext: () => set({ page: Math.min(n - 1, pi + 1) }), pgPrevOff: pi === 0, pgNextOff: pi >= n - 1,
        zoomLabel: zm + "%", zoomIn: () => set({ zoom: Math.min(200, zm + 25) }), zoomOut: () => set({ zoom: Math.max(50, zm - 25) }), pdfDownload: () => { const a = document.createElement("a"); a.href = cm3DocUrl(vwS.post, true); a.download = vwS.name || ""; document.body.appendChild(a); a.click(); a.remove(); } });
    }
    if (vwS.type === "code") {
      const orig = md.code || "", src = s.codeSrc == null ? orig : s.codeSrc, ran = s.codeRan == null ? orig : s.codeRan, lines = src.split("\n").length;
      const vc = (this.postById(vwS.post) || { media: {} }).media;
      vw.title = vc.title || "index.html"; vw.sub = "Shared by " + author.name.split(" ")[0] + " · your edits stay on your device";
      Object.assign(VW, { codeSrc: md.code == null ? "Loading…" : src, onCode: e => set({ codeSrc: e.target.value }), codeKey: e => { if (e.key === "Tab") { e.preventDefault(); const el = e.target, a0 = el.selectionStart, b0 = el.selectionEnd, v = el.value.slice(0, a0) + "  " + el.value.slice(b0); set({ codeSrc: v }); setTimeout(() => { el.selectionStart = el.selectionEnd = a0 + 2; }, 0); } if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); set({ codeRan: src, codeRunN: (s.codeRunN || 0) + 1 }); } },
        codeNums: Array.from({ length: lines }, (_, i) => i + 1).join("\n"), codeLineN: String(lines + 1), codeDirty: src !== orig,
        codeRun: () => set({ codeRan: src, codeRunN: (s.codeRunN || 0) + 1 }), codeReset: () => set({ codeSrc: null, codeRan: null, codeHintOn: false }), codeDoc: ran + "<!-- run " + (s.codeRunN || 0) + " -->", codeRunLabel: (s.codeRunN ? "ran " + s.codeRunN + "×" : "live") + " · ⌘↵ to run",
        codeHint: () => set({ codeHintOn: !s.codeHintOn }), codeHintOn: !!s.codeHintOn, codeHintText: md.hint || "Change one thing at a time, then press Run.",
        codeCols: narrow ? "1fr" : "minmax(0,1fr) minmax(0,1fr)", codeRowsTpl: narrow ? "minmax(0,1fr) minmax(0,1fr)" : "1fr" });
    }
    return VW;
  }
}

/** The Journal, carried over from the previous Community: "Mine" (the
 *  member's own, daily) and "Programme" (the shared record), both kept mounted
 *  once opened so switching back keeps the reader's place. */
function Cm3Journal({ auth, onWrite }) {
  const [tab, setTab] = React.useState("mine");
  const [seen, setSeen] = React.useState({ mine: true });
  const go = t => { setTab(t); setSeen(x => Object.assign({}, x, { [t]: true })); };
  return <div className="cm3x-journal">
    <CmSeg label="Which journal" value={tab} onChange={go} className="cm-j-seg" options={[["mine", "Mine"], ["programme", "Programme"]]}/>
    <div hidden={tab !== "mine"}><CmJournalMine auth={auth} onWrite={onWrite}/></div>
    {seen.programme && <div hidden={tab !== "programme"}><CmProgramJournal auth={auth}/></div>}
  </div>;
}

/** Edit & approve, or a private note to the author — the queue's two acts that need words. */
function Cm3EditDialog({ ed, onClose, onSave }) {
  const [t, setT] = React.useState(ed.text || "");
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  return <div className="cm3x-scrim" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={ed.msg ? "Message the author" : "Edit and approve"} className="cm3x-dialog" onClick={e => e.stopPropagation()}>
      <h2 className="cm3x-dialog-h">{ed.msg ? "Message " + String(ed.it.author || "the author").split(" ")[0] : "Edit, then approve"}</h2>
      <p className="cm3x-dialog-p">{ed.msg ? "A private notification about this post. Kind, short, and say what to do next." : "Your changes go live and the author is told it was edited. The original is kept in the audit trail."}</p>
      <textarea ref={ref} className="cm3x-dialog-t" rows={ed.msg ? 4 : 6} value={t} maxLength={ed.msg ? 500 : 2000} onChange={e => setT(e.target.value)} aria-label={ed.msg ? "Your message" : "Post text"}/>
      <div className="cm3x-dialog-row"><button className="cm3x-btn-ghost" onClick={onClose}>Cancel</button><button className="cm3x-btn" disabled={!t.trim()} onClick={() => onSave(t.trim())}>{ed.msg ? "Send" : "Approve with changes"}</button></div>
    </div>
  </div>;
}

Object.assign(window, { Cm3App });
