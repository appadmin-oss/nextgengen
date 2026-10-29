/**
 * The lesson editor — blocks, not markup.
 *
 * WHY THIS EXISTS. The lesson body is stored as Markdown and always will be:
 * 336 bundled lessons are written in it, the seed files carry it, the server
 * validates it and `CurriculumText` draws it on the member's screen. None of
 * that is worth changing.
 *
 * What was wrong is that an instructor had to TYPE it. A music teacher filing
 * a Saturday session was looking at `## Warm-up`, `**bold**` and
 * ```` ```keys C E G ```` in a grey textarea, and had to know that the last
 * one draws a piano. That is a markup language wearing an editor's clothes.
 *
 * So Markdown stays the file format and stops being the interface. This file
 * is the two-way door:
 *
 *      markdown  --leParse-->  [block, block, …]  --leSerialise-->  markdown
 *
 * and every block draws itself as the member will see it while it is edited.
 * A heading looks like a heading. A piano diagram IS the piano diagram, with
 * its notes as chips underneath. Nothing on the screen is syntax.
 *
 * Round-tripping is the rule that keeps it honest: parse→serialise must
 * return the same document, because an instructor opening somebody else's
 * lesson and saving it without typing a word must not rewrite it.
 * `tests/lesson-editor.test.js` holds that to the character for every shape
 * the renderer supports.
 *
 * Contains no React component that a member sees — the member's screen is
 * still `CurriculumText`, the one renderer, exactly as before.
 */

/* ---------- inline: markdown text <-> editable html ---------- */

/* The grammar is `curInline`'s in components.jsx and nothing more: bold,
   italic, code, link. Anything the member's renderer cannot draw must not be
   producible here, or the editor would show formatting that the lesson loses
   the moment it is saved. */

function leEscHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** Markdown inline → the HTML shown inside a contentEditable block. */
function leInlineToHtml(md) {
  const s = String(md || "");
  let out = "", last = 0, m;
  const re = /(\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  while ((m = re.exec(s))) {
    out += leEscHtml(s.slice(last, m.index));
    if (m[2]) out += "<strong>" + leEscHtml(m[2]) + "</strong>";
    else if (m[3]) out += "<em>" + leEscHtml(m[3]) + "</em>";
    else if (m[4]) out += "<code>" + leEscHtml(m[4]) + "</code>";
    else out += '<a href="' + leEscHtml(m[6]) + '">' + leEscHtml(m[5]) + "</a>";
    last = re.lastIndex;
  }
  out += leEscHtml(s.slice(last));
  return out.replace(/\n/g, "<br>");
}

/* Only the four marks survive. A browser's own bold is <b> on one engine and
   <strong> on another, a paste brings <span style>, and execCommand still
   emits <font> on some builds — all of it is read for its MEANING and
   discarded. That is also the paste sanitiser: anything pasted in becomes
   plain text plus the marks the lesson can actually render. */
function leNodesToMd(nodes) {
  let out = "";
  for (const n of nodes) {
    if (n.nodeType === 3) { out += String(n.nodeValue).replace(/ /g, " "); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.nodeName.toLowerCase();
    if (tag === "br") { out += "\n"; continue; }
    const inner = leNodesToMd(n.childNodes);
    if (tag === "strong" || tag === "b") out += inner.trim() ? "**" + inner + "**" : inner;
    else if (tag === "em" || tag === "i") out += inner.trim() ? "*" + inner + "*" : inner;
    else if (tag === "code") out += inner.trim() ? "`" + inner + "`" : inner;
    else if (tag === "a") { const h = n.getAttribute("href") || ""; out += /^https?:\/\//i.test(h) ? "[" + (inner || h) + "](" + h + ")" : inner; }
    else if (tag === "div" || tag === "p") out += (out && !out.endsWith("\n") ? "\n" : "") + inner;
    else out += inner;
  }
  return out;
}
function leHtmlToInline(el) {
  return leNodesToMd(el.childNodes).replace(/​/g, "").replace(/[ \t]+$/g, "");
}

/* ---------- the block model ---------- */

/* Text blocks carry inline markdown. Diagram blocks carry their own fields and
   never a fence string, so there is no syntax for an instructor to get wrong —
   `leSerialise` is the only thing that ever writes one. */
const LE_TEXT_TYPES = ["p", "h2", "h3", "ul", "ol", "quote"];
const LE_LIST_TYPES = ["ul", "ol", "quote"];
const LE_DIAGRAMS = ["keys", "chord", "staff", "swatch", "steps"];

/* THE TWO ROUTES. Every one of the 588 bundled lessons carries these two
   bullets under "Make it fit you", word for word, because the programme puts
   ten- and seventeen-year-olds in the same room and a worked example that
   helps one of them slows the other. The shape check looks for that exact
   wording, which means an instructor who writes "if you're new" instead has
   written a lesson that quietly fails a rule nobody showed them.
   So it is a block with two fields and the wording belongs to the editor. */
const LE_ROUTE_NEW = "- **If this is new to you:** ";
const LE_ROUTE_ALREADY = "- **If you already can:** ";

/* Two bullets and a routes block are the same kind of thing to a renderer —
   items of one list — so a blank line must not fall between them. */
const LE_LIST_FAMILY = { ul: "ul", routes: "ul", ol: "ol", quote: "quote" };

let leSeq = 0;
function leId() { return "b" + (++leSeq) + "-" + Math.random().toString(36).slice(2, 7); }
function leBlock(type, extra) { return Object.assign({ id: leId(), type: type, text: "" }, extra || {}); }

/**
 * What the "+" menu offers — and the reason this is not a general-purpose
 * editor's menu.
 *
 * A Saturday at NGG has a shape: it opens with a review of last week, warms
 * up, teaches, plays, sends something home, and gives both a child who has
 * never done this and a child who already can something to do. That shape is
 * in `api/tests/curriculum-shape.php`, it is in all 588 bundled lessons, and
 * before this menu existed it was in neither place an instructor could see.
 * They were offered "Heading" and left to remember the rest.
 *
 * So the first group is the session itself. Picking "Warm-up" lays out a
 * warm-up with its minutes; picking "Make it fit you" lays out the heading
 * AND the two routes, worded the way the standard requires. The generic
 * blocks are still there, underneath, for everything else.
 */
const LE_PARTS = [
  { type: "part", id: "warm",  label: "Warm-up", hint: "10 minutes to get hands and ears going", icon: "h2",
    blocks: () => [leBlock("h2", { text: "Warm-up (10 minutes)" }), leBlock("ul", { text: "" })] },
  { type: "part", id: "learn", label: "Learn", hint: "30 minutes of the new thing", icon: "h2",
    blocks: () => [leBlock("h2", { text: "Learn (30 minutes)" }), leBlock("p")] },
  { type: "part", id: "play",  label: "Play / do", hint: "40 minutes of doing it — these are practical subjects", icon: "h2",
    blocks: () => [leBlock("h2", { text: "Play (40 minutes)" }), leBlock("ul", { text: "" })] },
  { type: "part", id: "home",  label: "Practise at home", hint: "What they take away for the week", icon: "ol",
    blocks: () => [leBlock("h2", { text: "Practise at home" }), leBlock("ol", { text: "" })] },
  { type: "part", id: "fit",   label: "Make it fit you", hint: "The two routes — required in every lesson", icon: "ul",
    blocks: () => [leBlock("h2", { text: "Make it fit you" }), leNewBlock("routes")] },
  { type: "part", id: "back",  label: "Looking back", hint: "Pick something up from an earlier week and use it", icon: "quote",
    blocks: () => [leBlock("h2", { text: "Looking back" }), leBlock("p", { text: "Go back to week " })] },
  { type: "part", id: "whole", label: "A whole session", hint: "Every part, in order, with the minutes drawn", icon: "steps",
    blocks: () => [
      leBlock("h2", { text: "Warm-up (10 minutes)" }), leBlock("ul", { text: "" }),
      leBlock("h2", { text: "Learn (30 minutes)" }), leBlock("p"),
      leBlock("h2", { text: "Play (40 minutes)" }), leBlock("ul", { text: "" }),
      leBlock("h2", { text: "Practise at home" }), leBlock("ol", { text: "" }),
      leBlock("h2", { text: "Make it fit you" }), leNewBlock("routes"),
      leBlock("steps", { pairs: [{ a: "10", b: "Warm up" }, { a: "30", b: "Learn" }, { a: "40", b: "Play" }] }),
    ] },
];

const LE_INSERTS = [
  { type: "routes", label: "The two routes", hint: "For a child new to this, and one who already can", icon: "ul" },
  { type: "h2", label: "Heading", hint: "A part of the session", icon: "h2" },
  { type: "h3", label: "Subheading", hint: "A step inside a part", icon: "h3" },
  { type: "ul", label: "Bulleted list", hint: "Points in no order", icon: "ul" },
  { type: "ol", label: "Numbered list", hint: "Steps in order", icon: "ol" },
  { type: "quote", label: "Callout", hint: "Something to notice", icon: "quote" },
  { type: "image", label: "Picture", hint: "Upload or link an image", icon: "image" },
  { type: "video", label: "Video", hint: "YouTube or Vimeo, played in the lesson", icon: "video" },
  { type: "steps", label: "Session plan", hint: "The minutes, drawn to scale", icon: "steps" },
  { type: "keys", label: "Piano keyboard", hint: "Notes shown held down", icon: "keys" },
  { type: "chord", label: "Guitar chords", hint: "Chord boxes with fingering", icon: "chord" },
  { type: "staff", label: "Notes on a staff", hint: "Written music", icon: "staff" },
  { type: "swatch", label: "Colours", hint: "Swatches with measured contrast", icon: "swatch" },
  { type: "rule", label: "Divider", hint: "A line between parts", icon: "rule" },
];

const LE_MENU_GROUPS = [
  { id: "parts", label: "Parts of a session", items: LE_PARTS },
  { id: "blocks", label: "Anything else", items: LE_INSERTS },
];

/* A new diagram arrives filled in. An empty one draws nothing, and a block
   that draws nothing reads as broken rather than as new. */
const LE_DIAGRAM_SEEDS = {
  keys: { tokens: ["C", "E", "G"] },
  chord: { tokens: ["Am", "Em", "C"] },
  staff: { tokens: ["C", "D", "E", "F", "G"] },
  swatch: { pairs: [{ a: "#1b3a6b", b: "Navy" }, { a: "#ffd400", b: "Gold" }] },
  steps: { pairs: [{ a: "10", b: "Warm up" }, { a: "30", b: "Learn" }, { a: "40", b: "Play" }] },
};
/** A menu entry becomes one block, or the several a session part is made of. */
function leMake(item) {
  if (item && typeof item.blocks === "function") return item.blocks();
  return [leNewBlock(typeof item === "string" ? item : item.type)];
}

function leNewBlock(type) {
  if (type === "image") return leBlock("image", { url: "", alt: "" });
  if (type === "video") return leBlock("video", { url: "" });
  if (type === "rule") return leBlock("rule");
  if (type === "routes") return leBlock("routes", { newly: "", already: "" });
  const seed = LE_DIAGRAM_SEEDS[type];
  if (seed) return leBlock(type, JSON.parse(JSON.stringify(seed)));
  return leBlock(type);
}

/* A diagram's fields and its fence argument string are the same information in
   two forms. `keys C E G` is tokens; `swatch #hex Name | #hex Name` is pairs.
   One place converts each way so a round trip cannot drift. */
function leArgsToFields(type, args) {
  const s = String(args || "").trim();
  if (type === "swatch" || type === "steps") {
    const pairs = s.split("|").map(p => {
      const t = p.trim(); if (!t) return null;
      const sp = t.indexOf(" ");
      return sp === -1 ? { a: t, b: "" } : { a: t.slice(0, sp), b: t.slice(sp + 1).trim() };
    }).filter(Boolean);
    return { pairs: pairs.length ? pairs : [{ a: "", b: "" }] };
  }
  const tokens = s.split(/[\s,]+/).filter(Boolean);
  return { tokens: tokens.length ? tokens : [] };
}
function leFieldsToArgs(b) {
  if (b.type === "swatch" || b.type === "steps") {
    return (b.pairs || []).map(p => [String(p.a || "").trim(), String(p.b || "").trim()].filter(Boolean).join(" "))
      .filter(Boolean).join(" | ");
  }
  return (b.tokens || []).map(t => String(t).trim()).filter(Boolean).join(" ");
}

/* ---------- markdown -> blocks ---------- */

/**
 * The scanner is deliberately the same shape as `CurriculumText`'s: fences
 * first so nothing inside one is read as formatting, then paragraphs split on
 * blank lines, then a line-level verdict. Where the two ever disagree the
 * editor shows something the member will not get, which is the one failure
 * this whole file exists to avoid.
 */
function leParse(md) {
  const src = String(md || "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const out = [];
  let buf = [];

  const flushPara = () => {
    buf.join("\n").split(/\n{2,}/).forEach(chunk => {
      const para = chunk.replace(/^\n+|\n+$/g, "");
      if (!para.trim()) return;
      const ls = para.split("\n");
      if (ls.every(l => /^\s*[-*•]\s+/.test(l))) {
        for (let k = 0; k < ls.length; k++) {
          if (ls[k].startsWith(LE_ROUTE_NEW) && k + 1 < ls.length && ls[k + 1].startsWith(LE_ROUTE_ALREADY)) {
            out.push(leBlock("routes", { newly: ls[k].slice(LE_ROUTE_NEW.length), already: ls[k + 1].slice(LE_ROUTE_ALREADY.length) }));
            k++;
            continue;
          }
          out.push(leBlock("ul", { text: ls[k].replace(/^\s*[-*•]\s+/, "") }));
        }
        return;
      }
      if (ls.every(l => /^\s*\d+[.)]\s+/.test(l))) {
        ls.forEach(l => {
          const m = l.match(/^\s*(\d+)([.)])\s+/);
          out.push(leBlock("ol", { text: l.slice(m[0].length), num: m[1], dot: m[2] }));
        });
        return;
      }
      if (ls.every(l => /^\s*>\s?/.test(l))) { ls.forEach(l => out.push(leBlock("quote", { text: l.replace(/^\s*>\s?/, "") }))); return; }
      if (ls.length === 1) {
        const one = para.trim();
        if (/^-{3,}$/.test(one)) { out.push(leBlock("rule")); return; }
        if (/^###\s+/.test(one)) { out.push(leBlock("h3", { text: one.replace(/^###\s+/, "") })); return; }
        if (/^#{1,2}\s+/.test(one)) { out.push(leBlock("h2", { text: one.replace(/^#{1,2}\s+/, "") })); return; }
        const img = one.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        if (img) { out.push(leBlock("image", { url: img[2], alt: img[1] })); return; }
        if (typeof curVideoEmbed === "function" && curVideoEmbed(one)) { out.push(leBlock("video", { url: one })); return; }
      }
      out.push(leBlock("p", { text: para }));
    });
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const fm = lines[i].match(/^```\s*([a-z0-9+#-]*)\s*(.*)$/i);
    if (!fm) { buf.push(lines[i]); continue; }
    flushPara();
    const code = [];
    i++;
    while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
    const lang = (fm[1] || "").toLowerCase();
    const args = fm[2] || "";
    if (LE_DIAGRAMS.indexOf(lang) !== -1) out.push(leBlock(lang, leArgsToFields(lang, args.trim() || code.join(" ").trim())));
    else out.push(leBlock("code", { lang: lang, text: code.join("\n"), args: args }));
  }
  flushPara();
  if (!out.length) out.push(leBlock("p"));
  return out;
}

/**
 * Tidy a pasted document — and ONLY a pasted one.
 *
 * `leParse` must agree with `CurriculumText` exactly, so it cannot be
 * forgiving: a "## Learn" with no blank line above it really is part of the
 * paragraph above, on the member's screen as much as here, and an editor
 * that quietly promoted it would be showing the instructor something the
 * child will not get.
 *
 * A paste is the one moment where changing the document is the right thing
 * to do, because the instructor is importing, not editing — and a heading
 * jammed against the line above is what Word, Google Docs and every chat
 * window produce. It is repaired once, visibly, in front of them.
 */
function leTidyPaste(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      if (!fence && out.length && out[out.length - 1].trim() !== "") out.push("");
      out.push(l);
      fence = !fence;
      if (!fence && i + 1 < lines.length && lines[i + 1].trim() !== "") out.push("");
      continue;
    }
    if (fence) { out.push(l); continue; }
    const head = (x) => /^#{1,3}\s+\S/.test(x);
    const item = (x) => /^\s*([-*•]|\d+[.)])\s+\S/.test(x);
    const prev = out.length ? out[out.length - 1] : "";
    /* A blank line is the only thing that separates one block from the next,
       and it is exactly what a copy out of a document loses. Four places
       need one back: above a heading, below a heading, where a list starts,
       and where prose picks up after a list. */
    if (l.trim() !== "" && prev.trim() !== ""
        && (head(l) || head(prev) || (item(l) && !item(prev)) || (!item(l) && item(prev)))) out.push("");
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/* ---------- blocks -> markdown ---------- */

function leLineOf(b) {
  const t = String(b.text || "");
  if (b.type === "h2") return "## " + t;
  if (b.type === "h3") return "### " + t;
  if (b.type === "ul") return "- " + t;
  if (b.type === "ol") return (b.num || "1") + (b.dot || ".") + " " + t;
  if (b.type === "quote") return "> " + t.replace(/\n/g, "\n> ");
  return t;
}

function leSerialise(blocks) {
  const parts = [];
  (blocks || []).forEach(b => {
    if (b.type === "rule") { parts.push({ b: b, s: "---" }); return; }
    if (b.type === "routes") {
      const a = String(b.newly || "").trim(), c = String(b.already || "").trim();
      parts.push({ b: b, s: a || c ? LE_ROUTE_NEW + a + "\n" + LE_ROUTE_ALREADY + c : "" });
      return;
    }
    if (b.type === "image") { const u = String(b.url || "").trim(); parts.push({ b: b, s: u ? "![" + String(b.alt || "") + "](" + u + ")" : "" }); return; }
    if (b.type === "video") { parts.push({ b: b, s: String(b.url || "").trim() }); return; }
    if (b.type === "code") { parts.push({ b: b, s: "```" + (b.lang || "") + (b.args ? " " + b.args : "") + "\n" + String(b.text || "") + "\n```" }); return; }
    if (LE_DIAGRAMS.indexOf(b.type) !== -1) {
      const a = leFieldsToArgs(b);
      parts.push({ b: b, s: a ? "```" + b.type + " " + a + "\n```" : "" });
      return;
    }
    // An empty heading, bullet or paragraph writes nothing at all. A bullet
    // with no words would otherwise go into the lesson as a lone "- ", and
    // the member's screen would draw an empty dot.
    parts.push({ b: b, s: String(b.text || "").trim() ? leLineOf(b) : "" });
  });

  /* A numbered list is NOT renumbered on the way out. The renderer draws an
     <ol>, so the marker in the source changes nothing a member sees — but
     the 336 bundled lessons write "1." for every item, and an editor that
     tidied them to 1, 2, 3 would rewrite 371 files the first time anybody
     opened one to read it. The screen counts; the file is left alone. */

  let out = "";
  parts.forEach((p, i) => {
    if (p.s === "") return;
    if (out === "") { out = p.s; return; }
    // Consecutive items of ONE list are one blank-line-free run, because a
    // blank line between them is what makes the renderer draw two lists.
    const prev = parts[i - 1];
    const fam = LE_LIST_FAMILY[p.b.type];
    const joined = prev && prev.s !== "" && !!fam && LE_LIST_FAMILY[prev.b.type] === fam;
    out += (joined ? "\n" : "\n\n") + p.s;
  });
  return out;
}

/* ---------- caret helpers ---------- */

/* Splitting on Enter is done through the DOM rather than a character offset
   into the markdown, so the half after the caret keeps its bold and its
   links. An offset into the source would have to map through the inline
   grammar, and that mapping is exactly where this kind of editor goes wrong. */
function leSplitAtCaret(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  const before = document.createRange();
  before.setStart(el, 0); before.setEnd(r.startContainer, r.startOffset);
  const after = document.createRange();
  after.setStart(r.endContainer, r.endOffset); after.setEnd(el, el.childNodes.length);
  const wrap = (frag) => { const d = document.createElement("div"); d.appendChild(frag); return leHtmlToInline(d); };
  return { before: wrap(before.cloneContents()), after: wrap(after.cloneContents()) };
}
function leCaretAtStart(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return false;
  const r = sel.getRangeAt(0);
  if (!r.collapsed) return false;
  const probe = document.createRange();
  probe.setStart(el, 0); probe.setEnd(r.startContainer, r.startOffset);
  return probe.toString().length === 0;
}
/**
 * Put the caret in a block, NOW.
 *
 * This ran on a requestAnimationFrame once, which is wrong by about one
 * frame: press Enter and type, and the first few characters land in the
 * block you just left before the focus catches up. It is not only a test
 * artefact — it is anyone typing at speed, and what it produces is a
 * sentence cut in half across two paragraphs.
 *
 * So the move is driven from a layout effect instead (see `pending` in
 * LessonBlockEditor), which React runs synchronously after it commits the
 * new block and before the browser paints — leaving no gap for a keystroke
 * to fall into.
 */
function leFocusBlock(id, where) {
  const el = document.querySelector('[data-le-id="' + id + '"] [contenteditable]')
          || document.querySelector('[data-le-id="' + id + '"] input, [data-le-id="' + id + '"] textarea');
  if (!el) return;
  el.focus();
  if (el.isContentEditable) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(where !== "end");
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  } else if (el.setSelectionRange) {
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {}
  }
}

/* A session part usually says how long it is — "Learn (30 minutes)". That
   is the most useful number on the screen for someone laying out a Saturday,
   and it was buried in the middle of a heading. It is lifted into the margin
   as a badge, read out of the heading rather than stored anywhere: there is
   no second place for it to disagree with the words. */
function leMinutesOf(text) {
  const m = String(text || "").match(/\((\d{1,3})\s*(?:min|mins|minutes)\)/i);
  return m ? m[1] : "";
}

/* ---------- one editable text block ---------- */

/* React must not own the children of a contentEditable: re-rendering them
   under a live caret moves it to the start of the line, which reads as the
   editor eating what you typed. So the HTML is written imperatively, and
   only ever rewritten when the text changed somewhere ELSE (a paste, an undo,
   a format button) while this block was not focused. */
const LeText = React.memo(function LeText({ block, placeholder, onChange, onEnter, onMergeBack, onType, onSlash, onPasteDoc, readOnly }) {
  const ref = React.useRef(null);
  const mine = React.useRef("");

  /* A LAYOUT effect, deliberately. Layout effects run child-first and before
     paint, so a rewrite here lands before the editor's own focus effect puts
     the caret somewhere — which is the order that makes typing "## " and
     carrying straight on work. As a passive effect it ran after that focus
     and took the caret back out, and what the instructor got was their next
     few letters in the wrong order. */
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const t = String(block.text || "");
    if (t === mine.current && el.innerHTML !== "") return;
    if (document.activeElement === el && t === mine.current) return;
    const focused = document.activeElement === el;
    mine.current = t;
    el.innerHTML = leInlineToHtml(t);
    // Writing innerHTML throws the caret away. If this block had it, it is
    // still this block's, at the end of whatever is now there.
    if (focused) {
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
  }, [block.text]);

  const read = () => { const el = ref.current; if (!el) return ""; const t = leHtmlToInline(el); mine.current = t; return t; };

  const onInput = () => {
    const t = read();
    // "/" on an empty line opens the add menu, the way every editor people
    // already use does. It is a shortcut on top of the visible "+" button,
    // never the only way in — a phone keyboard makes "/" a two-tap journey.
    if (t === "/" && onSlash) {
      // Cleared here as well as in state: the block was already empty, so
      // setting its text to "" changes nothing React would re-render, and
      // the "/" would sit there until the next blur wrote it into the lesson.
      const el = ref.current; if (el) el.innerHTML = "";
      mine.current = "";
      onSlash();
      return;
    }
    // Markdown as a shortcut, never as a requirement: anyone who types "## "
    // gets a heading, and anyone who does not never sees the characters.
    const m = t.match(/^(#{2,3}|[-*]|1[.)]|>)\s+/);
    if (m && onType) {
      const kind = m[1] === "###" ? "h3" : m[1] === "##" ? "h2" : m[1] === ">" ? "quote" : /^1/.test(m[1]) ? "ol" : "ul";
      if (kind !== block.type) { onType(kind, t.slice(m[0].length)); return; }
    }
    onChange(t);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const parts = leSplitAtCaret(ref.current);
      if (parts) { mine.current = parts.before; onEnter(parts.before, parts.after); }
      return;
    }
    if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); document.execCommand("insertLineBreak"); onInput(); return; }
    if (e.key === "Backspace" && leCaretAtStart(ref.current)) { e.preventDefault(); onMergeBack(read()); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b" || k === "i") { e.preventDefault(); document.execCommand(k === "b" ? "bold" : "italic"); onInput(); }
    }
  };

  // Paste arrives as plain text and is re-read through the lesson's own
  // grammar, so a paste out of Word cannot bring styling the member's screen
  // has no way to draw.
  /* A paste of SEVERAL lines is a document, not a sentence, and almost
     always a lesson somebody wrote in Word or in a chat window. It is laid
     out as blocks — headings become headings, bullets become bullets — which
     is the one moment an instructor most wants the editor to do the work.
     A one-line paste is just words, and goes in where the caret is. */
  const onPaste = (e) => {
    const raw = (e.clipboardData || window.clipboardData).getData("text/plain");
    if (raw == null) return;
    e.preventDefault();
    const t = String(raw).replace(/\r\n?/g, "\n");
    if (t.includes("\n") && onPasteDoc) { onPasteDoc(t); return; }
    document.execCommand("insertText", false, t);
    onInput();
  };

  const Tag = block.type === "h2" ? "h3" : block.type === "h3" ? "h4" : "div";
  return (
    <Tag ref={ref} className={"le-ed le-ed-" + block.type} contentEditable={!readOnly} suppressContentEditableWarning
         role="textbox" aria-multiline="false" aria-label={placeholder} data-le-placeholder={placeholder}
         spellCheck="true" onInput={onInput} onKeyDown={onKeyDown} onPaste={onPaste} onBlur={() => onChange(read())}/>
  );
});

/* ---------- diagram blocks, edited as fields ---------- */

/* Notes and chord names as chips. The alternative — one text input holding
   "C E G" — is a syntax again, just a shorter one: it has a separator to get
   right and no way to see that a name was not understood. */
function LeTokens({ block, label, example, onChange, readOnly }) {
  const [draft, setDraft] = React.useState("");
  const toks = block.tokens || [];
  const commit = (v) => {
    const parts = String(v).split(/[\s,]+/).filter(Boolean);
    if (parts.length) onChange({ tokens: toks.concat(parts) });
    setDraft("");
  };
  return (
    <div className="le-fields">
      <span className="le-flabel" id={"lf-" + block.id}>{label}</span>
      <ul className="le-chips" aria-labelledby={"lf-" + block.id}>
        {toks.map((t, i) => (
          <li key={i} className="le-chip">
            <span>{t}</span>
            {!readOnly && <button type="button" aria-label={"Remove " + t}
              onClick={() => onChange({ tokens: toks.filter((_, j) => j !== i) })}>&times;</button>}
          </li>
        ))}
        {!readOnly && <li className="le-chip-new">
          <input value={draft} placeholder={toks.length ? "Add" : example} aria-label={label + " — add one"}
                 onChange={e => { const v = e.target.value; if (/[\s,]$/.test(v)) commit(v); else setDraft(v); }}
                 onBlur={() => draft.trim() && commit(draft)}
                 onKeyDown={e => {
                   if (e.key === "Enter") { e.preventDefault(); commit(draft); }
                   else if (e.key === "Backspace" && !draft && toks.length) onChange({ tokens: toks.slice(0, -1) });
                 }}/>
        </li>}
      </ul>
    </div>
  );
}

/* Minutes + name, or colour + name. A real <input type="color"> rather than a
   hex field: the instructor picking the centre's blue should not have to know
   what #1b3a6b is, and the contrast figure under the swatch is the check. */
function LePairs({ block, kind, onChange, readOnly }) {
  const pairs = block.pairs && block.pairs.length ? block.pairs : [{ a: "", b: "" }];
  const isColour = kind === "swatch";
  const set = (i, k, v) => onChange({ pairs: pairs.map((p, j) => j === i ? Object.assign({}, p, { [k]: v }) : p) });
  return (
    <div className="le-fields">
      {/* The diagram above already prints the total; saying it twice on one
          screen is the kind of thing that makes a panel read as unfinished. */}
      <span className="le-flabel">{isColour ? "Colours" : "Stages"}</span>
      <ul className="le-pairs">
        {pairs.map((p, i) => (
          <li key={i}>
            {isColour
              ? <input type="color" className="le-colour" value={/^#[0-9a-f]{6}$/i.test(p.a) ? p.a : "#1b3a6b"}
                       aria-label={"Colour " + (i + 1)} disabled={readOnly} onChange={e => set(i, "a", e.target.value)}/>
              : <input type="number" className="le-mins" min={1} max={240} value={p.a} placeholder="10"
                       aria-label={"Minutes for stage " + (i + 1)} disabled={readOnly} onChange={e => set(i, "a", e.target.value)}/>}
            <input className="le-pname" value={p.b} placeholder={isColour ? "What it is called" : "What happens"}
                   aria-label={(isColour ? "Name of colour " : "Name of stage ") + (i + 1)} disabled={readOnly}
                   onChange={e => set(i, "b", e.target.value)}/>
            {!readOnly && pairs.length > 1 && <button type="button" className="le-x" aria-label={"Remove row " + (i + 1)}
              onClick={() => onChange({ pairs: pairs.filter((_, j) => j !== i) })}>&times;</button>}
          </li>
        ))}
      </ul>
      {!readOnly && <button type="button" className="le-addrow" onClick={() => onChange({ pairs: pairs.concat([{ a: "", b: "" }]) })}>
        Add {isColour ? "a colour" : "a stage"}</button>}
    </div>
  );
}

const LE_DIAGRAM_META = {
  keys:   { label: "Piano keyboard", field: "Notes held down", example: "C" },
  chord:  { label: "Guitar chords", field: "Chords", example: "Am" },
  staff:  { label: "Notes on a staff", field: "Notes, in order", example: "C" },
  swatch: { label: "Colours", field: "Colours" },
  steps:  { label: "Session plan", field: "Stages" },
};

function LeDiagram({ block, onChange, readOnly }) {
  const meta = LE_DIAGRAM_META[block.type] || { label: block.type, field: "Values" };
  const args = leFieldsToArgs(block);
  const d = typeof lessonBlockFor === "function" ? lessonBlockFor(block.type, args) : null;
  const D = d && d.Component;
  return (
    <div className="le-diagram">
      <div className="le-diagram-top"><LeIcon name={block.type === "chord" ? "chord" : block.type}/> {meta.label}</div>
      <div className="le-diagram-draw">
        {D && args ? <D args={args}/> : <p className="le-empty">Nothing to draw yet — fill in the {meta.field.toLowerCase()}.</p>}
      </div>
      {block.type === "swatch" || block.type === "steps"
        ? <LePairs block={block} kind={block.type} onChange={onChange} readOnly={readOnly}/>
        : <LeTokens block={block} label={meta.field} example={meta.example} onChange={onChange} readOnly={readOnly}/>}
    </div>
  );
}

/* ---------- picture and video blocks ---------- */

function LeImage({ block, onChange, onUpload, readOnly }) {
  const [busy, setBusy] = React.useState(false);
  const pick = async (file) => {
    if (!file || !onUpload) return;
    setBusy(true);
    try { const url = await onUpload(file); if (url) onChange({ url: url, alt: block.alt || String(file.name || "").replace(/\.[^.]+$/, "") }); }
    finally { setBusy(false); }
  };
  return (
    <div className="le-media">
      {block.url
        ? <img className="le-media-img" src={block.url} alt={block.alt || ""}/>
        : <div className="le-media-drop">
            {readOnly ? <p className="le-empty">No picture.</p> : <React.Fragment>
              <label className="le-btn">{busy ? "Uploading…" : "Choose a picture"}
                <input type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp,.gif" disabled={busy}
                       onChange={e => { pick(e.target.files && e.target.files[0]); e.target.value = ""; }}/></label>
              <span className="le-empty">PNG, JPEG, WebP or GIF — up to 25 MB</span>
            </React.Fragment>}
          </div>}
      {!readOnly && <label className="le-cap"><span className="le-flabel">What it shows</span>
        <input value={block.alt || ""} placeholder="Said aloud to anyone who cannot see it, and printed under the picture"
               onChange={e => onChange({ alt: e.target.value })}/></label>}
    </div>
  );
}

function LeVideo({ block, onChange, readOnly }) {
  const v = typeof curVideoEmbed === "function" ? curVideoEmbed(String(block.url || "")) : null;
  const bad = !!String(block.url || "").trim() && !v;
  return (
    <div className="le-media">
      {v ? <div className="le-media-frame"><iframe src={v.src} title={v.title} loading="lazy"
             allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
             referrerPolicy="strict-origin-when-cross-origin"/></div>
         : <div className="le-media-drop"><p className="le-empty">Paste a YouTube or Vimeo link and it plays here, inside the lesson.</p></div>}
      {!readOnly && <label className="le-cap"><span className="le-flabel">Link</span>
        <input value={block.url || ""} placeholder="https://www.youtube.com/watch?v=…" inputMode="url"
               aria-invalid={bad ? "true" : undefined} onChange={e => onChange({ url: e.target.value.trim() })}/>
        {bad && <span className="le-bad" role="alert">That is not a YouTube or Vimeo link. Other links belong under Materials.</span>}</label>}
    </div>
  );
}

/* ---------- the two routes ---------- */

/**
 * Not a heading and two bullets an instructor has to word exactly right —
 * two labelled boxes, with the wording owned by the editor. The rule it
 * serves is in CLAUDE.md and in the shape check: a lesson must give a child
 * meeting this for the first time and a child who already can it something
 * different to do, because they are sitting in the same room.
 */
function LeRoutes({ block, onChange, readOnly }) {
  const half = (key, who, hint) => (
    <div className="le-route" key={key}>
      <span className="le-route-who">{who}</span>
      <LeText block={{ id: block.id + "-" + key, type: "p", text: block[key] || "" }}
              readOnly={readOnly} placeholder={hint}
              onChange={t => onChange({ [key]: t })}
              /* A route is one instruction, not a document: Enter must not
                 split it in two, and taking only the half before the caret
                 would delete whatever was typed after it. The text is put
                 back together and the caret goes to the end. */
              onEnter={(before, after) => onChange({ [key]: before + after })}
              onMergeBack={t => onChange({ [key]: t })}/>
    </div>
  );
  return (
    <div className="le-routes" role="group" aria-label="The two routes through this lesson">
      {half("newly", "If this is new to you", "…halve the tempo and play the first two bars only")}
      {half("already", "If you already can", "…play it with the left hand as well")}
    </div>
  );
}

/* ---------- the insert menu ---------- */

function LeInsertMenu({ onPick, onClose, labelledBy }) {
  const ref = React.useRef(null);
  const [q, setQ] = React.useState("");
  const match = (x) => !q || (x.label + " " + x.hint).toLowerCase().includes(q.toLowerCase());
  const groups = LE_MENU_GROUPS.map(g => ({ g: g, items: g.items.filter(match) })).filter(x => x.items.length);
  const none = !groups.length;
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const inp = el.querySelector("input"); if (inp) inp.focus();
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const away = (e) => { if (!el.contains(e.target)) onClose(); };
    el.addEventListener("keydown", key);
    document.addEventListener("mousedown", away);
    return () => { el.removeEventListener("keydown", key); document.removeEventListener("mousedown", away); };
  }, [onClose]);
  /* On a phone this is a sheet off the bottom edge, where a thumb is; on a
     desk it is a popover at the button. Same markup, same focus trap, one
     breakpoint in CSS — a second component would be a second place for the
     Escape handling and the focus restore to be forgotten. */
  return (
    <div className="le-menu" ref={ref} role="dialog" aria-modal="true" aria-label="Add to the lesson" aria-labelledby={labelledBy}>
      <div className="le-menu-head">
        <span className="le-menu-title">Add to the lesson</span>
        <button type="button" className="le-menu-close" aria-label="Close" onClick={onClose}>&times;</button>
      </div>
      <input className="le-menu-q" value={q} onChange={e => setQ(e.target.value)} placeholder="What do you want to add?" aria-label="Search what to add"/>
      <div className="le-menu-list">
        {groups.map(({ g, items }) => (
          <section key={g.id} className={"le-menu-grp is-" + g.id} aria-label={g.label}>
            <h4 className="le-menu-grph">{g.label}</h4>
            <ul>
              {items.map(x => (
                <li key={x.id || x.type}>
                  <button type="button" onClick={() => onPick(x)}>
                    <LeIcon name={x.icon}/>
                    <span className="le-menu-l">{x.label}</span>
                    <span className="le-menu-h">{x.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {none && <p className="le-menu-none">Nothing matches “{q}”.</p>}
      </div>
    </div>
  );
}

/* Line icons on currentColor — an emoji is drawn by the operating system, so
   the same toolbar is flat on one centre's machine and a glossy 3-D sticker
   on the next one's. */
const LE_ICONS = {
  h2: "M2.5 3v10 M8 3v10 M2.5 8H8 M11 13V6.5l2.5-1.3",
  h3: "M2.5 3v10 M8 3v10 M2.5 8H8 M10.6 6.2h3l-1.8 2.3a1.6 1.6 0 1 1-1.3 2.6",
  ul: "M5.5 4.5h8 M5.5 8h8 M5.5 11.5h8 M2.6 4.5v.01 M2.6 8v.01 M2.6 11.5v.01",
  ol: "M6 4.5h7.5 M6 8h7.5 M6 11.5h7.5 M2.2 3.4l.9-.5v3 M2.1 7.4h1.6L2.1 9.9h1.7 M2.1 11.1h1.5l-.8.9.8.9H2.1",
  quote: "M3 4h10 M3 7.2h7 M3 10.4h9 M1.2 3.4v9.2",
  image: "M2 3.5h12v9H2z M2 10.2l3.3-3 3 2.6 2.4-2 3.3 2.9 M5.6 6.4v.01",
  video: "M2 3.8h12v8.4H2z M6.6 6.2l3.6 2.1-3.6 2.1z",
  steps: "M2 4.5h4 M2 8h8 M2 11.5h11",
  keys: "M2 3h12v10H2z M5.2 3v6.2 M8 3v6.2 M10.8 3v6.2",
  chord: "M3 3v10 M6 3v10 M9 3v10 M12 3v10 M3 5.4h9 M3 8.2h9 M3 11h9",
  staff: "M2 4h12 M2 6.5h12 M2 9h12 M2 11.5h12 M11.4 8.6a1.5 1.2 0 1 0 0-2.4 1.5 1.2 0 0 0 0 2.4Z",
  swatch: "M3 3h4.4v10H3z M8.6 3H13v10H8.6z M3 7.6h4.4 M8.6 10.1H13",
  rule: "M2 8h12",
  plus: "M8 3v10 M3 8h10",
  up: "M8 12.5V4 M4.2 7.4 8 3.6l3.8 3.8",
  down: "M8 3.5V12 M4.2 8.6 8 12.4l3.8-3.8",
  trash: "M3 4.5h10 M6.4 4.5V3h3.2v1.5 M4.4 4.5l.7 8.5h5.8l.7-8.5",
  copy: "M5.5 5.5h7.5v7.5H5.5z M3 10.5V3h7.5",
  bold: "M4.5 3h4a2.5 2.5 0 0 1 0 5h-4z M4.5 8h4.6a2.5 2.5 0 0 1 0 5H4.5z",
  italic: "M6.5 3h5 M4.5 13h5 M9.4 3 7 13",
  undo: "M3.2 7.8h7a3.4 3.4 0 0 1 0 6.8H7 M6 4.8 3 7.8l3 3",
  redo: "M12.8 7.8h-7a3.4 3.4 0 0 0 0 6.8H9 M10 4.8l3 3-3 3",
  link: "M6.6 9.4 9.4 6.6 M7 4.6 8.4 3.2a2.6 2.6 0 0 1 3.7 3.7l-1.4 1.4 M9 11.4l-1.4 1.4a2.6 2.6 0 0 1-3.7-3.7l1.4-1.4",
};
function LeIcon({ name }) {
  const d = LE_ICONS[name];
  if (!d) return null;
  return (
    <svg className="le-i" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"
         fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg, i) => <path key={i} d={(i ? "M" : "") + seg}/>)}
    </svg>
  );
}

/* ---------- one block row ---------- */

const LE_PLACEHOLDER = {
  p: "Write, or press / to add a picture, a video or a diagram",
  h2: "A part of the session — Warm-up, Learn, Play…",
  h3: "A step inside this part",
  ul: "A point",
  ol: "A step",
  quote: "Something to notice",
};

function LeRow({ block, i, count, active, readOnly, on }) {
  const [menu, setMenu] = React.useState(false);
  const [acts, setActs] = React.useState(false);
  const isText = LE_TEXT_TYPES.indexOf(block.type) !== -1;
  const name = (LE_INSERTS.find(x => x.type === block.type) || { label: block.type === "p" ? "Text" : block.type }).label;
  const isRoutes = block.type === "routes";

  const onType = (kind, rest) => on.retype(block.id, kind, rest);
  const body = isText ? (
    <LeText block={block} readOnly={readOnly} placeholder={LE_PLACEHOLDER[block.type] || "Write"}
            onChange={t => on.text(block.id, t)}
            onType={onType}
            onSlash={() => { on.text(block.id, ""); setMenu(true); }}
            onPasteDoc={md => on.pasteDoc(block.id, md)}
            onEnter={(before, after) => on.split(block.id, before, after)}
            onMergeBack={t => on.mergeBack(block.id, t)}/>
  ) : block.type === "image" ? <LeImage block={block} readOnly={readOnly} onChange={p => on.patch(block.id, p)} onUpload={on.upload}/>
    : block.type === "video" ? <LeVideo block={block} readOnly={readOnly} onChange={p => on.patch(block.id, p)}/>
    : block.type === "rule" ? <hr className="le-rule"/>
    : block.type === "code" ? <pre className="le-code"><code>{block.text}</code></pre>
    : block.type === "routes" ? <LeRoutes block={block} readOnly={readOnly} onChange={p => on.patch(block.id, p)}/>
    : <LeDiagram block={block} readOnly={readOnly} onChange={p => on.patch(block.id, p)}/>;

  const mins = block.type === "h2" ? leMinutesOf(block.text) : "";
  return (
    <li className={"le-row le-row-" + block.type + (active ? " is-active" : "")} data-le-id={block.id}
        onFocusCapture={() => on.focus(block.id)}>
      {!!mins && <span className="le-mins-badge" aria-hidden="true">{mins} min</span>}
      {!readOnly && <div className="le-handle">
        <button type="button" className="le-hbtn" aria-label={"Add something below " + name} aria-expanded={menu}
                onClick={() => { setMenu(m => !m); setActs(false); }}><LeIcon name="plus"/></button>
        <button type="button" className="le-hbtn" aria-label={name + " " + (i + 1) + " of " + count + " — move or delete"} aria-expanded={acts}
                onClick={() => { setActs(a => !a); setMenu(false); }}><span aria-hidden="true" className="le-dots">⋮</span></button>
        {menu && <React.Fragment>
          <div className="le-scrim" onClick={() => setMenu(false)} aria-hidden="true"/>
          <LeInsertMenu onPick={x => { setMenu(false); on.insertAfter(block.id, x); }} onClose={() => setMenu(false)}/>
        </React.Fragment>}
        {acts && <div className="le-acts" role="menu" aria-label={name + " actions"}>
          <button type="button" role="menuitem" disabled={i === 0} onClick={() => { setActs(false); on.move(block.id, -1); }}><LeIcon name="up"/> Move up</button>
          <button type="button" role="menuitem" disabled={i === count - 1} onClick={() => { setActs(false); on.move(block.id, 1); }}><LeIcon name="down"/> Move down</button>
          <button type="button" role="menuitem" onClick={() => { setActs(false); on.duplicate(block.id); }}><LeIcon name="copy"/> Duplicate</button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setActs(false); on.remove(block.id); }}><LeIcon name="trash"/> Delete</button>
        </div>}
      </div>}
      <div className="le-body">{body}</div>
    </li>
  );
}

/**
 * What an instructor sees before they have written anything.
 *
 * It was one grey line of placeholder text. A blank page is the hardest
 * screen in any editor, and this one has an answer nobody could guess: the
 * programme already knows the shape of a Saturday, so it can lay the whole
 * thing out and leave them filling in the parts.
 */
function LeStart({ onLay, onBlank }) {
  return (
    <div className="le-start">
      <h3 className="le-start-h">Start the lesson</h3>
      <p className="le-start-p">A session has a shape — warm-up, learn, play, something to take home, and a route for a child who has never done this and one who already can. Lay it out and fill it in, or write it your own way.</p>
      <div className="le-start-acts">
        <button type="button" className="le-start-go" onClick={() => onLay("whole")}>
          <LeIcon name="steps"/> Lay out a whole session
        </button>
        <button type="button" className="le-start-alt" onClick={() => onLay("warm")}>Just a warm-up</button>
        <button type="button" className="le-start-alt" onClick={onBlank}>Start from nothing</button>
      </div>
      <p className="le-start-tip">You can also paste a lesson you already have — headings and lists are laid out for you.</p>
    </div>
  );
}

/* ---------- the editor ---------- */

/**
 * `value` and `onChange` speak markdown, so every caller — the Control Room,
 * an instructor's own screen, a test — keeps the contract the textarea had.
 * The blocks live only inside this component.
 */
function LessonBlockEditor({ value, onChange, readOnly, onUpload, labelledBy }) {
  const [blocks, setBlocks] = React.useState(() => leParse(value));
  const [active, setActive] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [started, setStarted] = React.useState(() => String(value || "").trim() !== "");
  const mine = React.useRef(String(value || ""));
  const pending = React.useRef(null);

  // Runs after the commit that put the new block in the document, before
  // paint. A rAF here is one frame too late; see leFocusBlock.
  React.useLayoutEffect(() => {
    const want = pending.current;
    if (!want) return;
    pending.current = null;
    leFocusBlock(want.id, want.where);
  });

  // An edit from outside (the AI drafter filling an empty lesson, a reset)
  // re-reads the document. Our own serialisation is recognised and ignored,
  // or every keystroke would rebuild every block and take the caret with it.
  React.useEffect(() => {
    const v = String(value || "");
    if (v === mine.current) return;
    mine.current = v;
    setBlocks(leParse(v));
    if (v.trim() !== "") setStarted(true);
  }, [value]);

  /* UNDO.
   *
   * A block editor without one is not finished, and the browser's own undo
   * is worse than none here: Ctrl+Z inside a contentEditable puts characters
   * back into the DOM that React's state knows nothing about, so the lesson
   * on the screen and the lesson that saves quietly stop being the same
   * document. So the native one is taken out of the loop and the editor
   * keeps the history itself, in the format it saves in.
   *
   * Typing coalesces: a sentence is one undo, not forty. A structural change
   * — a new block, a delete, a move, a paste — always opens its own step,
   * because those are the ones somebody reaches for Ctrl+Z after.
   */
  const hist = React.useRef({ past: [], future: [], at: 0, run: false });
  const HIST_MAX = 120;

  const push = React.useCallback((next, opt) => {
    const now = Date.now();
    const h = hist.current;
    const coalesce = opt && opt.typing && h.run && now - h.at < 700;
    if (!coalesce) {
      h.past.push(mine.current);
      if (h.past.length > HIST_MAX) h.past.shift();
      h.future = [];
    }
    h.at = now;
    h.run = !!(opt && opt.typing);
    setBlocks(next);
    const md = leSerialise(next);
    mine.current = md;
    onChange(md);
  }, [onChange]);

  const step = React.useCallback((back) => {
    const h = hist.current;
    const from = back ? h.past : h.future, to = back ? h.future : h.past;
    if (!from.length) return;
    const md = from.pop();
    to.push(mine.current);
    h.run = false;
    mine.current = md;
    setBlocks(leParse(md));
    onChange(md);
  }, [onChange]);

  const idx = (id) => blocks.findIndex(b => b.id === id);

  const on = React.useMemo(() => ({
    focus: (id) => setActive(id),
    text: (id, t) => push(blocks.map(b => b.id === id ? Object.assign({}, b, { text: t }) : b), { typing: true }),
    patch: (id, p) => push(blocks.map(b => b.id === id ? Object.assign({}, b, p) : b), { typing: true }),
    retype: (id, type, rest) => {
      push(blocks.map(b => b.id === id ? Object.assign({}, b, { type: type, text: rest }) : b));
      // A heading is an <h3> and a paragraph a <div>, so changing the type
      // replaces the element and the caret goes with it. Typing "## " and
      // carrying straight on has to work, because that is how people type.
      pending.current = { id: id, where: "end" };
    },
    split: (id, before, after) => {
      const i = idx(id); if (i === -1) return;
      const b = blocks[i];
      // Enter at the end of a heading starts a paragraph; inside a list it
      // starts the next item, which is what every editor does and what an
      // instructor typing a list of five points expects.
      const nextType = LE_LIST_TYPES.indexOf(b.type) !== -1 ? b.type : "p";
      const nb = leBlock(nextType, { text: after });
      push(blocks.slice(0, i).concat([Object.assign({}, b, { text: before }), nb], blocks.slice(i + 1)));
      pending.current = { id: nb.id, where: "start" };
    },
    mergeBack: (id, t) => {
      const i = idx(id); if (i === -1) return;
      // A styled block demotes to plain text first; only a plain paragraph at
      // the very start merges away. Backspace must not silently delete a
      // whole diagram someone spent a minute filling in.
      if (blocks[i].type !== "p") { push(blocks.map((b, j) => j === i ? Object.assign({}, b, { type: "p", text: t }) : b)); return; }
      if (i === 0) return;
      const prev = blocks[i - 1];
      if (LE_TEXT_TYPES.indexOf(prev.type) === -1) { if (!t) push(blocks.filter((_, j) => j !== i)); return; }
      const merged = Object.assign({}, prev, { text: String(prev.text || "") + t });
      push(blocks.slice(0, i - 1).concat([merged], blocks.slice(i + 1)));
      pending.current = { id: prev.id, where: "end" };
    },
    pasteDoc: (id, md) => {
      const i = idx(id); if (i === -1) return;
      const here = blocks[i], lead = String(here.text || "");
      const made = leParse(leTidyPaste(lead ? lead + "\n\n" + md : md));
      push(blocks.slice(0, i).concat(made, blocks.slice(i + 1)));
      pending.current = { id: made[made.length - 1].id, where: "end" };
    },
    insertAfter: (id, item) => {
      const i = idx(id);
      const made = leMake(item);
      push(blocks.slice(0, i + 1).concat(made, blocks.slice(i + 1)));
      pending.current = { id: made[made.length - 1].id, where: "end" };
    },
    move: (id, d) => {
      const i = idx(id), j = i + d;
      if (i === -1 || j < 0 || j >= blocks.length) return;
      const next = blocks.slice();
      next.splice(j, 0, next.splice(i, 1)[0]);
      push(next);
    },
    duplicate: (id) => {
      const i = idx(id);
      const copy = Object.assign(JSON.parse(JSON.stringify(blocks[i])), { id: leId() });
      push(blocks.slice(0, i + 1).concat([copy], blocks.slice(i + 1)));
    },
    remove: (id) => {
      const i = idx(id);
      const next = blocks.filter(b => b.id !== id);
      push(next.length ? next : [leBlock("p")]);
      const to = next[Math.max(0, i - 1)];
      if (to) pending.current = { id: to.id, where: "end" };
    },
    upload: onUpload,
  }), [blocks, push, onUpload]);

  /* Format buttons act on the live selection, which is why they are not
     disabled when nothing is focused: the browser keeps the selection while
     a toolbar button takes focus for the length of a click, and taking it
     away would break the one thing they do. */
  const mark = (cmd) => { document.execCommand(cmd); const el = document.activeElement; if (el && el.isContentEditable) el.dispatchEvent(new Event("input", { bubbles: true })); };
  const addLink = async () => {
    const sel = window.getSelection();
    const picked = sel && String(sel).trim();
    const url = typeof dialog !== "undefined" && dialog.prompt
      ? await dialog.prompt({ title: "Add a link", label: "Web address", placeholder: "https://", cta: "Add link" })
      : window.prompt("Web address");
    if (!url || !/^https:\/\//i.test(String(url).trim())) { if (url && typeof toast !== "undefined") toast.error("Links must start with https://"); return; }
    document.execCommand("createLink", false, String(url).trim());
    if (!picked && typeof toast !== "undefined") toast.info && toast.info("Type the words you want the link to show.");
    const el = document.activeElement; if (el && el.isContentEditable) el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const turn = (type) => {
    if (!active) return;
    const b = blocks.find(x => x.id === active);
    if (!b || LE_TEXT_TYPES.indexOf(b.type) === -1) return;
    on.retype(active, type, b.text);
  };
  const activeBlock = blocks.find(b => b.id === active);
  const activeIsText = activeBlock && LE_TEXT_TYPES.indexOf(activeBlock.type) !== -1;

  const words = React.useMemo(() => leSerialise(blocks).replace(/```[\s\S]*?```/g, " ").replace(/[#>*`\[\]()]/g, " ")
    .split(/\s+/).filter(Boolean).length, [blocks]);

  /* Caught on the way down at the editor, so it fires wherever the caret is
     — in a block, in a note chip, in a stage name. */
  const onKeyDown = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "z") { e.preventDefault(); step(!e.shiftKey); return; }
    if (k === "y") { e.preventDefault(); step(false); }
  };

  return (
    <div className="le" aria-labelledby={labelledBy || undefined} onKeyDown={onKeyDown}>
      {/* Nothing is written yet, so Bold, Italic and Link have nothing to
          act on. A control that cannot act is not left on the screen. */}
      {!readOnly && started && <div className="le-bar" role="toolbar" aria-label="Format the lesson">
        <label className="le-turn">
          <span className="sr-only">Turn this block into</span>
          <select value={activeIsText ? activeBlock.type : ""} disabled={!activeIsText} onChange={e => turn(e.target.value)}>
            {!activeIsText && <option value="">—</option>}
            <option value="p">Text</option>
            <option value="h2">Heading</option>
            <option value="h3">Subheading</option>
            <option value="ul">Bulleted list</option>
            <option value="ol">Numbered list</option>
            <option value="quote">Callout</option>
          </select>
        </label>
        <span className="le-bar-sep" aria-hidden="true"/>
        <button type="button" className="le-bbtn" aria-label="Undo (Ctrl+Z)" title="Undo"
                disabled={!hist.current.past.length} onMouseDown={e => e.preventDefault()} onClick={() => step(true)}><LeIcon name="undo"/></button>
        <button type="button" className="le-bbtn" aria-label="Redo (Ctrl+Shift+Z)" title="Redo"
                disabled={!hist.current.future.length} onMouseDown={e => e.preventDefault()} onClick={() => step(false)}><LeIcon name="redo"/></button>
        <span className="le-bar-sep" aria-hidden="true"/>
        <button type="button" className="le-bbtn" aria-label="Bold (Ctrl+B)" title="Bold" onMouseDown={e => e.preventDefault()} onClick={() => mark("bold")}><LeIcon name="bold"/></button>
        <button type="button" className="le-bbtn" aria-label="Italic (Ctrl+I)" title="Italic" onMouseDown={e => e.preventDefault()} onClick={() => mark("italic")}><LeIcon name="italic"/></button>
        <button type="button" className="le-bbtn" aria-label="Add a link" title="Link" onMouseDown={e => e.preventDefault()} onClick={addLink}><LeIcon name="link"/></button>
        <span className="le-bar-sep" aria-hidden="true"/>
        <div className="le-bar-add">
          <button type="button" className="le-bbtn is-add" aria-expanded={addOpen} onClick={() => setAddOpen(o => !o)}>
            <LeIcon name="plus"/> Add
          </button>
          {addOpen && <div className="le-scrim" onClick={() => setAddOpen(false)} aria-hidden="true"/>}
          {addOpen && <LeInsertMenu onClose={() => setAddOpen(false)} onPick={x => {
            setAddOpen(false);
            const made = leMake(x);
            const i = active ? idx(active) : blocks.length - 1;
            push(blocks.slice(0, i + 1).concat(made, blocks.slice(i + 1)));
            pending.current = { id: made[made.length - 1].id, where: "end" };
          }}/>}
        </div>
        <span className="le-bar-grow"/>
        <span className="le-wc" aria-live="off">{words} words · about {Math.max(1, Math.round(words / 160))} min to read</span>
      </div>}

      {!readOnly && blocks.length === 1 && blocks[0].type === "p" && !String(blocks[0].text || "").trim() && !started
        ? <LeStart
            onBlank={() => { setStarted(true); pending.current = { id: blocks[0].id, where: "start" }; setBlocks(blocks.slice()); }}
            onLay={(id) => {
              const made = leMake(LE_PARTS.find(x => x.id === id));
              setStarted(true);
              push(made);
              pending.current = { id: made[1] ? made[1].id : made[0].id, where: "end" };
            }}/>
        : <ul className="le-doc">
            {blocks.map((b, i) => (
              <LeRow key={b.id} block={b} i={i} count={blocks.length} active={b.id === active} readOnly={readOnly} on={on}/>
            ))}
          </ul>}

      {!readOnly && started && <button type="button" className="le-tail" onClick={() => {
        const last = blocks[blocks.length - 1];
        if (last && last.type === "p" && !String(last.text || "").trim()) { leFocusBlock(last.id, "end"); return; }
        const nb = leBlock("p");
        push(blocks.concat([nb]));
        pending.current = { id: nb.id, where: "start" };
      }}>Click here to keep writing</button>}
    </div>
  );
}
