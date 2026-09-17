/* ============================================================================
   The measurement both responsive suites share.

   One implementation, because the two sweeps ask the same two questions of
   different surfaces — the public site in responsive.test.js, the staff
   consoles in responsive-staff.test.js — and two copies of a rule this fiddly
   would disagree within a release. Every exclusion below was earned by a false
   positive on a real page; the comments say which, so that nobody removes one
   to make a number go down.

   Exported as a FUNCTION, evaluated inside the page by both callers.
   ========================================================================== */
'use strict';

/** Everything measured on one page at one width, in a single evaluate. */
const PROBE = (opt) => {
  const rootSel = opt.sel;
  /* The floor is a parameter because the product has two, deliberately. The
     public site holds 44px. The Control Room holds 40px for the buttons inside
     its dense lists, with the reason written beside the rule in
     styles-app.css: at 44 every row of a forty-row roster grows, and 40 still
     clears a fingertip. Hard-coding 44 here would make this suite an argument
     against a decision somebody already made with reasons, which is not what a
     test is for — so each suite states the floor it means. */
  const floor = opt.floor || 44;
  const denseSel = opt.denseSel || null;
  const denseFloor = opt.denseFloor || floor;
  const vw = document.documentElement.clientWidth;

  /* Content pushed off the side.
   *
   * An element wider than the screen is only a DEFECT when nothing is clipping
   * it on purpose. A hero's decorative glow, a marquee track and a horizontal
   * card rail are all deliberately wider than their container and all sit
   * inside an ancestor that clips or scrolls them — the reader loses nothing.
   * So the rule is containment, not width: walk up, and if any ancestor
   * constrains the x axis, this element is somebody's intention rather than a
   * bug. Without that rule this suite reports four decorations per page and
   * gets ignored, which is the failure mode of every layout linter.
   *
   * aria-hidden subtrees are skipped for the same reason from the other
   * direction: they are not content, so they cannot be unreachable content. */
  const containedX = (el) => {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const ox = cs.overflowX;
      if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const strays = [];
  document.querySelectorAll(rootSel).forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (el.closest('[aria-hidden="true"]')) return;
    /* The visually-hidden pattern parks things at -9999px on purpose; that is
       a technique, not an overflow. */
    if (r.right < -2000 || r.left > vw + 2000) return;
    if (r.right > vw + 1 || r.left < -1) {
      if (containedX(el)) return;
      strays.push(Math.round(r.left) + '→' + Math.round(r.right) + ' ' +
        el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') +
        ' "' + (el.textContent || '').trim().slice(0, 28) + '"');
    }
  });

  /* Interactive controls below the touch floor. Hidden ones are skipped (a
     drawer closed at this width is not a target), and so is anything inside a
     `hidden` disclosure — it is not on screen to be hit. */
  const small = [];
  document.querySelectorAll('button, a[href], [role="tab"], input:not([type="hidden"]), select').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    /* Nor can a control be a target while it is invisible or click-through.
       The back-to-top button lives on every page at opacity 0 with
       pointer-events:none until you scroll, scaled to 0.85 — so it measures
       37px in a state where it cannot be hit at all, and reporting it would
       have sent somebody to "fix" a button that is already 44px when it
       matters. */
    if (cs.pointerEvents === 'none' || parseFloat(cs.opacity) === 0) return;
    if (el.closest('[hidden]')) return;
    /* Not a target by construction. /contact's spam honeypot is aria-hidden,
       tabindex=-1 and parked at -9999px — holding it to a touch floor would be
       asking a trap to be tappable. */
    if (el.closest('[aria-hidden="true"]') || el.getAttribute('tabindex') === '-1') return;
    /* A link inside a paragraph is text, not a target — holding body copy to
       44px would mean no inline links anywhere. Only standalone controls. */
    if (el.tagName === 'A' && el.closest('p, li.ab-disc-list-item')) {
      const inline = cs.display === 'inline' || cs.display === 'inline-block';
      if (inline && r.height < 30) return;
    }
    /* A checkbox or radio is hit through its LABEL, and the accessible
       pattern is a small box inside a large one — demanding a 44px checkbox
       would be asking for the wrong thing. So the label is what gets measured
       when there is one. */
    let box = r;
    if (el.type === 'checkbox' || el.type === 'radio') {
      const lab = el.closest('label')
        || (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null);
      if (lab) box = lab.getBoundingClientRect();
    }
    const lim = (denseSel && el.closest(denseSel)) ? denseFloor : floor;
    if (box.height < lim - 0.5) {
      small.push(Math.round(box.width) + '×' + Math.round(box.height) + ' (<' + lim + ') ' +
        el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') +
        ' "' + ((el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24)) + '"');
    }
  });

  return { vw, body: document.body.scrollWidth, strays, small };
};

/* The two widths that matter for a phone, plus the one where a two-column grid
   is about to be asked for more room than it has. 360 is the commonest Android
   width in Nigeria and the narrowest thing this product has to work at. */
const WIDTHS = [
  { w: 360, h: 800, label: '360px  (common Android)' },
  { w: 390, h: 844, label: '390px  (iPhone)' },
  { w: 768, h: 1024, label: '768px  (tablet)' },
];

/** Resolve the browser this image actually has, rather than the revision
 *  playwright-core happens to pin. */
function chromiumPath(fs) {
  return process.env.CHROMIUM_PATH
    || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
}

function loadChromium() {
  for (const m of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core'].filter(Boolean)) {
    try { return require(m).chromium; } catch (_) {}
  }
  return null;
}

module.exports = { PROBE, WIDTHS, chromiumPath, loadChromium };
