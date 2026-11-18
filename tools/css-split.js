'use strict';
/* ============================================================================
   Split a stylesheet into what PUBLIC pages can use and what only the
   signed-in areas use (owner, 18 Nov 2026: "It is too heavy … must work
   perfectly on low-end devices").

   styles-app.css grew into one 1.3 MB sheet holding the Control Room, the
   studios and every portal as well as the public navigation, footer and pages.
   Every public visitor downloaded it, and — the real cost on a cheap phone —
   the style engine re-checked all ~11,700 rules on every change to the page.

   The split is by EVIDENCE, never by guess: a rule stays public when any class
   it names appears anywhere in the public bundle's sources (whole word), or
   starts with a prefix the public sources build class names from ("apf-" +
   x), or when it names no class at all (html, body, :root, tags). Only rules
   whose every class is used by signed-in code alone move to the second sheet,
   which the router loads together with the signed-in bundle (nggNeedMore).
   @keyframes, @font-face, @property and @page always stay public.
   ========================================================================== */

/** Top-level statements of MINIFIED css: [{ head, body }] (body null for `@import …;`). */
function cssStatements(css) {
  const out = []; let i = 0; const n = css.length;
  while (i < n) {
    let j = i, q = '', depth = 0, headEnd = -1;
    for (; j < n; j++) {
      const c = css[j];
      if (q) { if (c === '\\') { j++; continue; } if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '{') { if (depth === 0) headEnd = j; depth++; }
      else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
      else if (c === ';' && depth === 0) { j++; headEnd = -2; break; }
    }
    const chunk = css.slice(i, j).trim();
    if (chunk) {
      if (headEnd === -2 || headEnd < 0) out.push({ head: chunk, body: null });
      else out.push({ head: css.slice(i, headEnd).trim(), body: css.slice(headEnd + 1, j - 1) });
    }
    i = j;
  }
  return out;
}

function classesOf(selector) {
  return [...selector.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]);
}

/** The vocabulary of the public sources: every word, and every literal prefix ending in "-". */
function publicVocabulary(texts) {
  const words = new Set(), prefixes = new Set();
  for (const t of texts) {
    for (const m of t.matchAll(/[A-Za-z_][\w-]*/g)) words.add(m[0]);
    for (const m of t.matchAll(/["'`]([a-z][\w]*(?:-[\w]+)*-)["'`$]/g)) prefixes.add(m[1]);
  }
  return { words, prefixes: [...prefixes].filter(p => p.length >= 3) };
}

function isPublicSelector(sel, vocab) {
  const cls = classesOf(sel);
  if (!cls.length) return true;
  return cls.some(c => vocab.words.has(c) || vocab.prefixes.some(p => c.startsWith(p)));
}

const KEEP_PUBLIC_AT = /^@(keyframes|-webkit-keyframes|font-face|property|page|import|charset|counter-style|layer\b[^{]*$)/i;
const NESTING_AT = /^@(media|supports|container|layer|document)\b/i;

/** Split minified css → { pub, more } (both minified). */
function splitCss(css, vocab) {
  const pub = [], more = [];
  for (const st of cssStatements(css)) {
    if (st.body === null) { pub.push(st.head.endsWith(';') ? st.head : st.head + ';'); continue; }
    if (st.head.startsWith('@')) {
      if (NESTING_AT.test(st.head)) {
        const inner = splitCss(st.body, vocab);
        if (inner.pub) pub.push(st.head + '{' + inner.pub + '}');
        if (inner.more) more.push(st.head + '{' + inner.more + '}');
      } else pub.push(st.head + '{' + st.body + '}');   // keyframes, font-face, page, …
      continue;
    }
    (isPublicSelector(st.head, vocab) ? pub : more).push(st.head + '{' + st.body + '}');
  }
  return { pub: pub.join(''), more: more.join('') };
}

module.exports = { cssStatements, classesOf, publicVocabulary, isPublicSelector, splitCss };
