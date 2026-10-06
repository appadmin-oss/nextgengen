/* ============================================================================
   Timetable Maker landing (/timetable/about), prerendered at build time.

   The page has to read in full with JavaScript off (LANDING.md §4), and this
   host has no server-side renderer, so build.js writes it as one static file,
   dist/timetable-about.html, which .htaccess serves at /timetable/about.
   It is a FILE and not a folder on purpose: the rewrite passes any existing
   directory straight through, so a dist/timetable/ folder would turn the
   maker's own /timetable into a directory request.

   Nothing on the page that the maker also says is typed here a second time:
   the modes, the styles, the download list and the parsed example chips are
   read from the maker's own tables and its real quick-add parser, by running
   tt-core.jsx and tt-layers.jsx in a sandbox. Change the maker and the page
   follows on the next build.

   The poster images are drawn by the real renderer too, but that needs a
   browser, which the build does not: tt-landing-posters.js makes them, and
   they are committed under assets/timetable/landing/.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OUT_FILE = 'timetable-about.html';
const IMG_BASE = '/assets/timetable/landing/';
const FONTS = 'https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap';

/** The maker's tables and parser, run outside a browser. React is never called: only top-level tables are evaluated. */
function ttLandingLoadMaker(root, esbuild) {
  const read = f => esbuild.transformSync(fs.readFileSync(path.join(root, 'src/modules/timetable', f), 'utf8'), { loader: 'jsx', sourcefile: f }).code;
  const ctx = vm.createContext({ React: {}, console, Intl, Date, Math, JSON });
  vm.runInContext(read('tt-core.jsx') + '\n;' + read('tt-layers.jsx')
    + '\n;globalThis.__tt = { TT_MODES, TT_MODE_IDS, TT_LOOKS, TT_LOOK_IDS, TT_KINDS, TT_DAYS, TT_FORMATS, ttQuick, ttMin, ttFmt, ttDateFor, ttDshort };', ctx);
  return ctx.__tt;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = name => `<i class="ph ph-${esc(name)}" aria-hidden="true"></i>`;

/**
 * What the parser understood from one typed line, as the chips the page shows
 * (LANDING.md §2.3): the title with its type's icon, the days (or the one date
 * for a one-off), the time and the place. `now` fixes which week "this week" is.
 */
function ttLandingParts(T, line, now) {
  const today = ((now.getDay() + 6) % 7) + 1;
  const q = T.ttQuick(line, { entries: [], mode: 'school', today, defDay: today });
  if (!q) throw new Error('The landing example "' + line + '" no longer parses');
  const e = q.e;
  const parts = [{ icon: T.TT_KINDS[e.kind][1], t: e.title }];
  if (e.once) parts.push({ icon: 'calendar-dots', t: 'Only ' + T.ttDshort(T.ttDateFor(e.days[0], 0, now)) });
  else parts.push({ icon: 'calendar-blank', t: e.days.map(d => T.TT_DAYS[d - 1][2]).join(' ') });
  parts.push({ icon: 'clock', t: T.ttFmt(T.ttMin(e.start), '24') + '–' + T.ttFmt(T.ttMin(e.end), '24') });
  if (e.place) parts.push({ icon: 'map-pin', t: e.place });
  return parts;
}

const TT_LANDING_EXAMPLES = ['Maths Mon Wed 8–9 room 4', 'Football Tue Thu 4–5:30pm at the field', 'Maths test Thu 10am this week'];
const TT_LANDING_LEAD = 'Type your classes the way you’d say them. See what’s on today and what’s next. Print a poster for the wall, put it on your lock screen, or add it to your calendar.';

/** The poster figure for one style: WebP with a PNG fallback, at its fixed ratio so nothing shifts. */
function ttLandingPicture(look, name, hero) {
  const alt = 'A school week printed in the ' + name + ' style';
  const load = hero ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
  return `<picture><source type="image/webp" srcset="${IMG_BASE}style-${look}.webp"${hero ? ' data-tt-lp-src' : ''}>`
    + `<img src="${IMG_BASE}style-${look}.png" alt="${esc(alt)}" width="872" height="616" ${load}${hero ? ' data-tt-lp-img' : ''}></picture>`;
}

/*
 * The one script on the page (LANDING.md §4): the hero's style switcher, a
 * radio group with a roving tab stop. Arrow keys move and select, Space and
 * Enter select. The group is rendered hidden and shown from here, so with
 * JavaScript off there is no control on screen that cannot act.
 */
const TT_LANDING_SCRIPT = `(function () {
  var g = document.querySelector('[data-tt-lp-pick]');
  if (!g) return;
  var btns = Array.prototype.slice.call(g.querySelectorAll('[role=radio]'));
  var img = document.querySelector('[data-tt-lp-img]'), src = document.querySelector('[data-tt-lp-src]');
  function pick(b, focus) {
    btns.forEach(function (x) { var on = x === b; x.setAttribute('aria-checked', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
    var k = b.getAttribute('data-look');
    src.srcset = '${IMG_BASE}style-' + k + '.webp';
    img.src = '${IMG_BASE}style-' + k + '.png';
    img.alt = 'A school week printed in the ' + b.textContent + ' style';
    if (focus) b.focus();
  }
  btns.forEach(function (b, i) {
    b.addEventListener('click', function () { pick(b, false); });
    b.addEventListener('keydown', function (e) {
      var n = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (n) { e.preventDefault(); pick(btns[(i + n + btns.length) % btns.length], true); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); pick(btns[e.key === 'Home' ? 0 : btns.length - 1], true); }
    });
  });
  g.hidden = false;
})();`;

/** The whole page. Pure, so the test can render it without a build. */
function renderTimetableLanding(T, { css, origin, now }) {
  const looks = T.TT_LOOK_IDS.map(k => ({ k, name: T.TT_LOOKS[k].name, sample: T.TT_LOOKS[k].sample }));
  const examples = TT_LANDING_EXAMPLES.map(line => ({ line, parts: ttLandingParts(T, line, now) }));
  const url = origin + '/timetable/about';
  const btnGo = `<a class="tt-lp-btn" href="/timetable">Make my timetable${icon('arrow-right')}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Timetable Maker · NextGen Genius</title>
<meta name="description" content="${esc(TT_LANDING_LEAD)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#fbf7ed">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="Timetable Maker · NextGen Genius">
<meta property="og:description" content="${esc(TT_LANDING_LEAD)}">
<meta property="og:image" content="${esc(origin + IMG_BASE)}style-classic.png">
<meta property="og:image:width" content="1744">
<meta property="og:image:height" content="1232">
<meta property="og:image:alt" content="A school week printed in the Classic style">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="${IMG_BASE}style-classic.webp" type="image/webp" fetchpriority="high">
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/vendor/phosphor/phosphor.css">
<style>
${css}
</style>
</head>
<body>
<a class="tt-lp-skip" href="#tt-lp-main">Skip to content</a>
<header class="tt-lp-head">
  <div class="tt-lp-wrap">
    <a class="tt-lp-brand" href="/"><img src="/assets/logo.png" alt="" width="32" height="32"><span>Timetable Maker</span></a>
    <nav class="tt-lp-anchors" aria-label="Page">
      <a href="#how">How it works</a><a href="#styles">Styles</a><a href="#downloads">Downloads</a><a href="#keep">Saving</a>
    </nav>
    <a class="tt-lp-signin" href="/timetable?signin=1">Member sign in</a>
    <a class="tt-lp-btn" href="/timetable">Make my timetable</a>
  </div>
</header>
<main id="tt-lp-main">
  <section class="tt-lp-wrap tt-lp-hero" aria-labelledby="hero-title">
    <div class="tt-lp-hero-copy">
      <span class="tt-lp-pill">${icon('sparkle')}Free · no account needed</span>
      <h1 class="tt-lp-h1" id="hero-title">Your whole week on one page.</h1>
      <p class="tt-lp-lead">${esc(TT_LANDING_LEAD)}</p>
      <div class="tt-lp-btns">
        ${btnGo}
        <a class="tt-lp-btn tt-lp-btn--ghost" href="/timetable?import=centre">${icon('map-pin')}Start from my NGG centre</a>
      </div>
      <span class="tt-lp-note">Works on phones and computers. Nothing to install.</span>
    </div>
    <figure class="tt-lp-hero-fig">
      <div class="tt-lp-poster">${ttLandingPicture('classic', 'Classic', true)}</div>
      <div class="tt-lp-pick" role="radiogroup" aria-label="Preview a style" data-tt-lp-pick hidden>
        ${looks.map((l, i) => `<button type="button" role="radio" aria-checked="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-look="${l.k}">${esc(l.name)}</button>`).join('')}
      </div>
    </figure>
  </section>

  <section id="how" class="tt-lp-band" aria-labelledby="how-title">
    <div class="tt-lp-wrap tt-lp-sec tt-lp-how">
      <div class="tt-lp-intro">
        <span class="tt-lp-kicker">How it works</span>
        <h2 class="tt-lp-h2" id="how-title">Type it the way you’d say it.</h2>
        <p class="tt-lp-text">One line adds a class to every day it repeats. Leave the time out and it goes in your next free slot. Add “this week” for a one-off.</p>
      </div>
      <ol class="tt-lp-examples">
        ${examples.map(x => `<li class="tt-lp-example">
          <span class="tt-lp-typed">${icon('keyboard')}${esc(x.line)}</span>
          <ul class="tt-lp-parts" aria-label="What it understood">${x.parts.map(p => `<li class="tt-lp-part">${icon(p.icon)}${esc(p.t)}</li>`).join('')}</ul>
        </li>`).join('\n        ')}
      </ol>
    </div>
  </section>

  <section id="styles" class="tt-lp-wrap tt-lp-sec tt-lp-stack" aria-labelledby="styles-title">
    <div class="tt-lp-intro">
      <span class="tt-lp-kicker">Styles</span>
      <h2 class="tt-lp-h2" id="styles-title">Pick a style, then the colours.</h2>
      <p class="tt-lp-text">Each style changes the type, the shape of each class and the lines. Every style works with Paper, Midnight, Kente and Chalkboard colours.</p>
    </div>
    <div class="tt-lp-styles">
      ${looks.map(l => `<figure class="tt-lp-style"><div class="tt-lp-style-img">${ttLandingPicture(l.k, l.name, false)}</div><figcaption><b>${esc(l.name)}</b><span>${esc(l.sample)}</span></figcaption></figure>`).join('\n      ')}
    </div>
  </section>

  <section id="downloads" class="tt-lp-navy" aria-labelledby="dl-title">
    <div class="tt-lp-wrap tt-lp-sec tt-lp-stack">
      <div class="tt-lp-intro">
        <span class="tt-lp-kicker">Downloads</span>
        <h2 class="tt-lp-h2" id="dl-title">One timetable, laid out for where you’ll use it.</h2>
      </div>
      <ul class="tt-lp-formats">
        ${T.TT_FORMATS.map(f => `<li class="tt-lp-format"><span class="tt-lp-tile">${icon(f.icon)}</span><b>${esc(f.name)}</b><span>${esc(f.desc)}</span></li>`).join('\n        ')}
      </ul>
    </div>
  </section>

  <section class="tt-lp-wrap tt-lp-sec tt-lp-stack" aria-labelledby="modes-title">
    <div class="tt-lp-intro">
      <span class="tt-lp-kicker">Start here</span>
      <h2 class="tt-lp-h2" id="modes-title">What’s your week like?</h2>
    </div>
    <div class="tt-lp-modes">
      ${T.TT_MODE_IDS.map(k => { const m = T.TT_MODES[k]; return `<a class="tt-lp-mode" href="/timetable?mode=${k}"><span class="tt-lp-tile">${icon(m.icon)}</span><b>${esc(m.label)}</b><span class="tt-lp-mode-sub">${esc(m.sub)}</span><span class="tt-lp-mode-ex">${esc(m.example)}</span></a>`; }).join('\n      ')}
    </div>
  </section>

  <section id="keep" class="tt-lp-band" aria-labelledby="keep-title">
    <div class="tt-lp-wrap tt-lp-sec tt-lp-stack">
      <div class="tt-lp-intro">
        <span class="tt-lp-kicker">Saving</span>
        <h2 class="tt-lp-h2" id="keep-title">Keep it, with or without an NGG account.</h2>
        <p class="tt-lp-text">Your timetable stays in this browser until you save it.</p>
      </div>
      <div class="tt-lp-keep">
        <div class="tt-lp-keepcard">
          <span class="tt-lp-keephead">${icon('identification-badge')}<b>I’m an NGG member</b></span>
          <ul class="tt-lp-points">
            <li>${icon('house-line')}It shows on your member dashboard.</li>
            <li>${icon('users-three')}Your parent or guardian sees it in the family app.</li>
            <li>${icon('arrows-clockwise')}If your centre changes a session, you’re asked before anything changes here.</li>
          </ul>
          <span class="tt-lp-note">Sign in with your member ID or email and a one-time code.</span>
        </div>
        <div class="tt-lp-keepcard">
          <span class="tt-lp-keephead">${icon('envelope-simple')}<b>I’m not a member</b></span>
          <ul class="tt-lp-points">
            <li>${icon('link-simple')}We email you a link to your timetable.</li>
            <li>${icon('devices')}Open it on any phone or computer to keep editing.</li>
            <li>${icon('shield-check')}No membership needed.</li>
          </ul>
          <a href="/join">Curious about NGG? See how to join</a>
        </div>
      </div>
    </div>
  </section>

  <section class="tt-lp-wrap tt-lp-cta" aria-labelledby="cta-title">
    <h2 class="tt-lp-h2" id="cta-title">Start with a blank week, or your centre’s sessions.</h2>
    <div class="tt-lp-btns">
      ${btnGo}
      <a class="tt-lp-btn tt-lp-btn--ghost" href="/timetable?import=paste">${icon('clipboard-text')}Paste one I already have</a>
    </div>
  </section>
</main>
<footer class="tt-lp-foot">
  <div class="tt-lp-wrap">
    <span class="tt-lp-foot-brand"><img src="/assets/logo.png" alt="" width="24" height="24">NextGen Genius · nextgengenius.ng</span>
    <nav aria-label="Footer"><a href="/privacy">Privacy</a><a href="/join">Join NGG</a><a href="/contact">Contact</a></nav>
  </div>
</footer>
<script>${TT_LANDING_SCRIPT}</script>
</body>
</html>
`;
}

/** The site's own address, from the shell's canonical link: one place says where the site lives. */
function ttLandingOrigin(root) {
  const m = /<link rel="canonical" href="(https?:\/\/[^/"]+)/.exec(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
  return m ? m[1] : '';
}

/** Called by build.js. Fails the build when a poster image is missing, rather than shipping a page with holes. */
function buildTimetableLanding({ root, dist, esbuild, log, now }) {
  const T = ttLandingLoadMaker(root, esbuild);
  const missing = T.TT_LOOK_IDS.flatMap(k => ['png', 'webp'].map(x => 'assets/timetable/landing/style-' + k + '.' + x)).filter(f => !fs.existsSync(path.join(root, f)));
  if (missing.length) throw new Error('timetable landing: missing ' + missing.join(', ') + ' (run npm run build:ttposters)');
  const css = fs.readFileSync(path.join(__dirname, 'tt-landing.css'), 'utf8');
  const html = renderTimetableLanding(T, { css, origin: ttLandingOrigin(root), now: now || new Date() });
  fs.writeFileSync(path.join(dist, OUT_FILE), html);
  if (log) log(`wrote ${OUT_FILE} (${(html.length / 1024).toFixed(1)} KB) for /timetable/about`);
  return html;
}

module.exports = { buildTimetableLanding, renderTimetableLanding, ttLandingLoadMaker, ttLandingParts, TT_LANDING_EXAMPLES, OUT_FILE };
