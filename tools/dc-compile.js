#!/usr/bin/env node
/* ============================================================================
   dc-compile — turn a design handoff's `.dc.html` template into a React view.

   The designs in the portals handoff are HTML templates driven by a values
   object: `{{ a.b }}` paths, `<sc-if value>` conditions, `<sc-for list as>`
   loops and `style-hover`. Every expression in them is a plain dotted path
   (checked below; anything else is a compile error), so the markup can be
   compiled exactly rather than retyped — which is how fidelity was lost the
   last time a design was "recreated".

   Output, per design:
     · a view file: `function <Name>(v)` returning React elements, where `v` is
       the values object the portal's controller builds from real data;
     · CSS: every STATIC style declaration becomes a generated class written
       into styles-app.css between `@generated dc-compile:<id>` markers
       (CLAUDE.md: chrome belongs in a stylesheet, not inline). Only the
       declarations whose value IS data (`background:{{ n.bg }}`) stay inline.
       A data value is set inline as a custom property (`--dc-background`) and
       read by the element's class (`background:var(--dc-background)`), so
       `style-hover`'s `:hover` rule wins by specificity. Never !important.

   Usage:
     node tools/dc-compile.js <design.dc.html> <ViewName> <class-prefix> <out.jsx>

   The generated files are committed; re-run this when a design changes.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [, , SRC, NAME, PREFIX, OUT, SUBS] = process.argv;
if (!SRC || !NAME || !PREFIX || !OUT) {
  console.error('usage: dc-compile <design.dc.html> <ViewName> <class-prefix> <out.jsx>');
  process.exit(2);
}
const ROOT = path.resolve(__dirname, '..');
const CSS_FILE = path.join(ROOT, 'styles-app.css');

const html = fs.readFileSync(SRC, 'utf8');
const start = html.indexOf('<x-dc>'), end = html.indexOf('</x-dc>');
if (start < 0 || end < 0) throw new Error('no <x-dc> template in ' + SRC);
let tpl = html.slice(start + 6, end);
/* SUBS (optional): a JSON map of the design's sample copy to the {{ path }}
   that carries the real value — a date, a person's name. The design file stays
   as the designer sent it; the map is the reviewable list of what became data.
   A key that no longer occurs is an error, so a redesign cannot silently put
   the sample text back on a live page. */
if (SUBS) {
  for (const [from, to] of Object.entries(JSON.parse(fs.readFileSync(SUBS, 'utf8')))) {
    if (from.startsWith('//')) continue;
    if (!tpl.includes(from)) { console.error('[dc-compile] substitution not found in the design: ' + from); process.exit(1); }
    tpl = tpl.split(from).join(to);
  }
}
/* The design's own base rules (its <helmet><style>): box-sizing, `button {
   color: inherit }`, the focus ring. They are part of how it looks, so they
   come across — scoped under the portal's root class so they cannot reach the
   rest of the site. html/body rules are dropped; the page owns those. */
const helmetCss = ((tpl.match(/<helmet>[\s\S]*?<\/helmet>/) || [''])[0].match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
tpl = tpl.replace(/<helmet>[\s\S]*?<\/helmet>/, '').replace(/<!--[\s\S]*?-->/g, '');
const ROOT_CLASS = PREFIX + '-app';
function scopeCss(css) {
  const out = [];
  const re = /(@media[^{]*)\{((?:[^{}]*\{[^{}]*\})*)\s*\}|([^{}@]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(css))) {
    if (m[1]) { const inner = scopeCss(m[2]); if (inner) out.push(m[1].trim() + '{' + inner + '}'); continue; }
    const sels = m[3].split(',').map(x => x.trim()).filter(x => x && !/^(html|body)$/.test(x));
    if (!sels.length) continue;
    /* :where() keeps each base rule at the specificity the design gave it
       (`button` loses to a class, as it did in the design), while still
       reaching nothing outside the portal. The design's helmet may say
       !important; this codebase never does. */
    out.push(sels.map(x => x === '*' ? ':where(.' + ROOT_CLASS + ') *' : ':where(.' + ROOT_CLASS + ') ' + x).join(',') + '{' + m[4].trim().replace(/\s*!important/g, '') + '}');
  }
  return out.join('\n');
}

/* ── Parse ─────────────────────────────────────────────────────────────── */
const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link']);
const SKIP = new Set(['script', 'style', 'meta', 'link']);
function parse(src) {
  const root = { tag: '#root', attrs: [], kids: [] };
  const stack = [root];
  const re = /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1]) {
      const tag = m[1];
      // Close up to the matching tag (tolerant of stray closers).
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
    } else if (m[2]) {
      const tag = m[2];
      const attrs = [];
      const ar = /\s+([^\s=>\/]+)(?:="([^"]*)")?/g; let a;
      while ((a = ar.exec(m[3] || ''))) attrs.push([a[1], a[2] === undefined ? true : decode(a[2])]);
      const node = { tag, attrs, kids: [] };
      top.kids.push(node);
      if (!VOID.has(tag) && !m[4]) stack.push(node);
    } else if (m[5]) {
      top.kids.push({ text: m[5] });
    }
  }
  return root;
}
function decode(s) { return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }

/* ── Expressions ───────────────────────────────────────────────────────── */
const PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
function exprOf(p, scope) {
  if (!PATH.test(p)) throw new Error('not a plain path: {{ ' + p + ' }} in ' + SRC);
  const [head, ...rest] = p.split('.');
  const base = scope.includes(head) ? head : 'v.' + head;
  // Optional chaining keeps a missing value from throwing, exactly as the
  // prototype runtime renders a missing value as nothing.
  return [base].concat(rest).join('?.');
}
const MUSTACHE = /\{\{\s*(.*?)\s*\}\}/g;
function interp(s, scope) {
  // "a {{ x }} b" → JS expression producing a string; a lone {{ x }} → the raw value.
  const whole = s.match(/^\s*\{\{\s*([^{}]*?)\s*\}\}\s*$/);
  if (whole) return { raw: true, js: exprOf(whole[1], scope) };
  const parts = []; let last = 0, m;
  MUSTACHE.lastIndex = 0;
  while ((m = MUSTACHE.exec(s))) {
    if (m.index > last) parts.push(JSON.stringify(s.slice(last, m.index)));
    parts.push('dcS(' + exprOf(m[1], scope) + ')');
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(JSON.stringify(s.slice(last)));
  if (!parts.length) return { raw: false, js: '""', static: true };
  return { raw: false, js: parts.join(' + '), static: !/\{\{/.test(s) };
}

/* ── Styles → classes ──────────────────────────────────────────────────── */
const classes = new Map();   // css text → class name
const hovers = new Map();    // class → hover css
function declsOf(style) {
  const out = []; let depth = 0, cur = '';
  for (const ch of style) {   // split on ; outside parentheses
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map(d => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; }).filter(d => d[0]);
}
function classFor(css) {
  if (!css) return '';
  if (!classes.has(css)) classes.set(css, PREFIX + '-' + crypto.createHash('sha1').update(css).digest('hex').slice(0, 7));
  return classes.get(css);
}

/* ── Emit ──────────────────────────────────────────────────────────────── */
const ATTR_MAP = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly', maxlength: 'maxLength', autofocus: 'autoFocus' };
const DROP = /^(hint-|style-hover$|as$|list$)/;
let mainSlotted = false;
function emitNode(n, scope, ind) {
  if (n.text !== undefined) {
    if (!n.text.trim()) return n.text.includes('\n') ? null : JSON.stringify(' ');
    const t = n.text.replace(/\s*\n\s*/g, ' ');
    const r = interp(t, scope);
    return r.raw ? 'dcT(' + r.js + ')' : r.js;
  }
  if (SKIP.has(n.tag)) return null;
  const kids = () => n.kids.map(k => emitNode(k, scope, ind + 1)).filter(Boolean);
  const A = Object.fromEntries(n.attrs);
  if (n.tag === 'sc-if') {
    const c = interp(String(A.value), scope);
    if (!c.raw) throw new Error('sc-if value must be a path');
    return '(' + c.js + ' ? h(F, null, ' + kids().join(', ') + ') : null)';
  }
  if (n.tag === 'sc-for') {
    const l = interp(String(A.list), scope);
    const as = String(A.as);
    const sc2 = scope.concat([as, as + '__i']);
    const body = n.kids.map(k => emitNode(k, sc2, ind + 1)).filter(Boolean);
    return 'dcL(' + l.js + ').map((' + as + ', ' + as + '__i) => h(F, { key: ' + as + '__i }, ' + body.join(', ') + '))';
  }
  if (n.tag === 'x-dc') return 'h(F, null, ' + kids().join(', ') + ')';
  const props = [];
  let cls = [], dynStyle = [], dynClass = [];
  for (const [k, val] of n.attrs) {
    if (DROP.test(k)) continue;
    if (k === 'style') {
      const st = [];
      for (const [p, v] of declsOf(String(val))) {
        /* A value that IS data is handed over as a custom property and read by
           the element's own class, so the declaration still lives in the
           stylesheet and a :hover rule on that class wins by specificity. */
        if (/\{\{/.test(v)) { const r = interp(v, scope); const varName = '--dc-' + p.replace(/^-+/, ''); dynStyle.push(JSON.stringify(varName) + ': ' + r.js); st.push(p + ':var(' + varName + ', unset)'); }
        else st.push(p + ':' + v);
      }
      const c = classFor(st.join(';'));
      if (c) cls.push(c);
      continue;
    }
    if (k === 'class') {
      const r = interp(String(val), scope);
      if (r.static) cls.push(String(val).trim()); else dynClass.push(r.raw ? 'dcS(' + r.js + ')' : r.js);
      continue;
    }
    const name = ATTR_MAP[k] || k;
    if (val === true) { props.push(JSON.stringify(name) + ': true'); continue; }
    const r = interp(String(val), scope);
    if (r.static) {
      let sv = String(val);
      if (name === 'src' && /^assets\//.test(sv)) sv = '/' + sv;
      props.push(JSON.stringify(name) + ': ' + JSON.stringify(sv));
    } else if (name === 'disabled' || name === 'readOnly' || name === 'autoFocus') {
      props.push(JSON.stringify(name) + ': dcB(' + r.js + ')');
    } else {
      props.push(JSON.stringify(name) + ': ' + r.js);
    }
  }
  // style-hover → a :hover rule on this element's own class.
  if (A['style-hover'] && typeof A['style-hover'] === 'string') {
    const hc = classFor('/*hover*/' + A['style-hover'] + '|' + cls.join(' '));
    cls.push(hc);
    hovers.set(hc, declsOf(A['style-hover']).map(([p, v]) => p + ':' + v).join(';'));
  }
  if (cls.length || dynClass.length) {
    const s = cls.length ? JSON.stringify(cls.join(' ')) : '""';
    props.push('"className": ' + (dynClass.length ? s + ' + " " + ' + dynClass.join(' + " " + ') : s));
  }
  if (dynStyle.length) props.push('"style": { ' + dynStyle.join(', ') + ' }');
  // A controlled field with no handler is read-only; React would warn otherwise.
  if (['input', 'textarea', 'select'].includes(n.tag) && A.value !== undefined && !A.onChange) props.push('"readOnly": true');
  const ks = VOID.has(n.tag) ? [] : kids();
  /* <main> carries one slot, v.mainSlot, ahead of the design's own content: the
     controller puts a screen's loading bar or its error-with-retry there, so
     every screen has its three states without the design being edited. */
  if (n.tag === 'main' && !mainSlotted) { mainSlotted = true; ks.unshift('dcT(v.mainSlot)'); }
  return 'h(' + JSON.stringify(n.tag) + ', ' + (props.length ? '{ ' + props.join(', ') + ' }' : 'null') + (ks.length ? ', ' + ks.join(', ') : '') + ')';
}

const tree = parse(tpl);
{ const first = tree.kids.find(k => k.tag && !SKIP.has(k.tag));
  if (first) { const c = first.attrs.find(a => a[0] === 'class'); if (c) c[1] = ROOT_CLASS + ' ' + c[1]; else first.attrs.push(['class', ROOT_CLASS]); } }
const body = tree.kids.map(k => emitNode(k, [], 1)).filter(Boolean);
const view = `/* GENERATED by tools/dc-compile.js from ${path.basename(SRC)} — do not edit by hand.
   Re-run: node tools/dc-compile.js "${path.relative(ROOT, SRC)}" ${NAME} ${PREFIX} ${path.relative(ROOT, OUT)}${SUBS ? " " + path.relative(ROOT, SUBS) : ""}
   The view is markup only. Every value comes from \`v\`, built by the portal's
   controller from real data; static styles are classes in styles-app.css. */
function ${NAME}(v) {
  const h = React.createElement, F = React.Fragment;
  return h(F, null, ${body.join(',\n    ')});
}
`;
fs.writeFileSync(OUT, view);

/* Shared helpers, defined once (guarded so a second generated view reuses them). */
/* One runtime for every compiled design (its helpers are globals; two copies would collide). */
const HELPERS = path.join(ROOT, 'src', 'modules', 'dc', 'dc-runtime.jsx');
fs.writeFileSync(HELPERS, `/* GENERATED by tools/dc-compile.js — helpers every compiled design view uses. */
function dcS(x) { return x === undefined || x === null || x === false ? "" : String(x); }
function dcT(x) { return x === undefined || x === null || x === false || x === true ? null : (typeof x === "object" ? x : String(x)); }
function dcL(x) { return Array.isArray(x) ? x : []; }
function dcB(x) { return x === true || x === "true"; }
`);

/* CSS into styles-app.css between markers. */
let cssOut = `/* @generated dc-compile:${PREFIX} begin — from ${path.basename(SRC)}; do not edit, re-run tools/dc-compile.js */\n`;
for (const [css, name] of classes) {
  if (css.startsWith('/*hover*/')) continue;
  cssOut += '.' + name + '{' + css + '}\n';
}
for (const [name, css] of hovers) cssOut += '.' + name + ':hover{' + css + '}\n';
if (helmetCss.trim()) cssOut += scopeCss(helmetCss) + '\n';
cssOut += `/* @generated dc-compile:${PREFIX} end */\n`;
let sheet = fs.readFileSync(CSS_FILE, 'utf8');
const re = new RegExp('/\\* @generated dc-compile:' + PREFIX + ' begin[\\s\\S]*?@generated dc-compile:' + PREFIX + ' end \\*/\\n?');
sheet = re.test(sheet) ? sheet.replace(re, cssOut) : sheet.replace(/\n*$/, '\n\n') + cssOut;
fs.writeFileSync(CSS_FILE, sheet);
console.log(`[dc-compile] ${path.basename(SRC)} → ${path.relative(ROOT, OUT)} · ${classes.size} classes · ${hovers.size} hover rules`);
