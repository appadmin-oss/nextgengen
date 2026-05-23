/* ================================================================
   NGG — Cinematic motion primitives.
   - Reveal on scroll (Intersection Observer)
   - Parallax (pointer + scroll)
   - Page transition (fade + slide on route change)
   - Magnetic CTAs (pointer-tracking)
   - Letter-by-letter kinetic type
   All respect `prefers-reduced-motion`.
   ================================================================ */

const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ----------------------------------------------------------------------------
// Reveal — fade + slide up on enter viewport. Re-armable on route change.
// ----------------------------------------------------------------------------

function useReveal(deps) {
  React.useEffect(() => {
    if (reducedMotion()) {
      document.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-visible"));
      return;
    }
    const els = document.querySelectorAll("[data-reveal]:not(.is-visible)");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, deps || []);
}

// Convenience wrapper: <Reveal as="section" delay={120}>...</Reveal>
function Reveal({ as: Tag = "div", delay = 0, kind = "up", className = "", children, ...rest }) {
  const style = Object.assign({}, rest.style || {});
  if (delay) style["--reveal-delay"] = delay + "ms";
  return (
    <Tag
      {...rest}
      data-reveal={kind}
      style={style}
      className={(className ? className + " " : "") + "reveal"}
    >
      {children}
    </Tag>
  );
}

// ----------------------------------------------------------------------------
// Kinetic type — splits a string into words/chars wrapped in spans for stagger.
// <Kinetic as="h1" text="Welcome home" delay={50}/>
// ----------------------------------------------------------------------------

function Kinetic({ as: Tag = "span", text, by = "word", className = "", style = {}, delay = 0 }) {
  const parts = by === "char" ? Array.from(text) : text.split(/(\s+)/);
  return (
    <Tag className={(className ? className + " " : "") + "kinetic kinetic-" + by} style={style}>
      {parts.map((p, i) => {
        if (/^\s+$/.test(p)) return <React.Fragment key={i}>{p}</React.Fragment>;
        return (
          <span key={i} className="kinetic-part" style={{ "--ki-i": i, "--ki-d": delay }}>
            {p}
          </span>
        );
      })}
    </Tag>
  );
}

// ----------------------------------------------------------------------------
// Magnetic CTA — slight pull toward cursor.
// ----------------------------------------------------------------------------

function Magnetic({ children, strength = 18 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (reducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    let rect = null;
    const onEnter = () => { rect = el.getBoundingClientRect(); };
    const onMove = (e) => {
      if (!rect) rect = el.getBoundingClientRect();
      const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      el.style.transform = `translate(${x * strength}px, ${y * strength * 0.5}px)`;
    };
    const onLeave = () => {
      el.style.transform = "";
      rect = null;
    };
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [strength]);
  return <span ref={ref} className="magnetic">{children}</span>;
}

// ----------------------------------------------------------------------------
// Scroll parallax — translates Y by a fraction of scroll position.
// ----------------------------------------------------------------------------

function useParallax(refs, factor = 0.15) {
  React.useEffect(() => {
    if (reducedMotion()) return;
    const list = Array.isArray(refs) ? refs : [refs];
    let raf = 0;
    const tick = () => {
      const sy = window.scrollY;
      list.forEach(r => { if (r && r.current) r.current.style.transform = `translate3d(0, ${(-sy * factor).toFixed(1)}px, 0)`; });
      raf = 0;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener("scroll", onScroll, { passive: true });
    tick();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [factor]);
}

// ----------------------------------------------------------------------------
// Page transition — fade+slide between routes. Wrap App.jsx pages.
// ----------------------------------------------------------------------------

function PageTransition({ pageKey, children }) {
  const [show, setShow] = React.useState(true);
  const [content, setContent] = React.useState(children);
  React.useEffect(() => {
    if (reducedMotion()) { setContent(children); return; }
    setShow(false);
    const t = setTimeout(() => {
      setContent(children);
      requestAnimationFrame(() => setShow(true));
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [pageKey]);
  return <div className={"page-transition" + (show ? " is-show" : "")}>{content}</div>;
}

// ----------------------------------------------------------------------------
// Counter — counts up to target when revealed.
// ----------------------------------------------------------------------------

function Counter({ to, duration = 1100, prefix = "", suffix = "", className = "" }) {
  const ref = React.useRef(null);
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (reducedMotion()) { setN(to); return; }
    const el = ref.current;
    if (!el) return;
    let started = false;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !started) {
        started = true;
        const start = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.round(to * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref} className={className}>{prefix}{n}{suffix}</span>;
}

window.useReveal = useReveal;
window.Reveal = Reveal;
window.Kinetic = Kinetic;
window.Magnetic = Magnetic;
window.useParallax = useParallax;
window.PageTransition = PageTransition;
window.Counter = Counter;
