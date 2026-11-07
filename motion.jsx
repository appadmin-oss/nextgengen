/* ================================================================
   NGG — Cinematic motion primitives.
   - Reveal on scroll (Intersection Observer)
   - Parallax (pointer + scroll)
   - Page transition (fade + slide on route change)
   - Magnetic CTAs (pointer-tracking)
   - Letter-by-letter kinetic type
   All respect `prefers-reduced-motion`.
   ================================================================ */

const reducedMotion = () => document.documentElement.getAttribute("data-lite") === "on" || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// ----------------------------------------------------------------------------
// Reveal — fade + slide up on enter viewport. Re-armable on route change.
// ----------------------------------------------------------------------------

function useReveal(deps) {
  React.useEffect(() => {
    if (reducedMotion()) {
      document.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    // PageTransition swaps the route's DOM in ~180ms after `page` changes,
    // so a single immediate query would only see the *previous* page's
    // elements — leaving the new page's reveal content invisible forever.
    // Re-arm a few times to catch late-mounted (and API-driven) nodes.
    const arm = () =>
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach(el => io.observe(el));
    arm();
    const t1 = setTimeout(arm, 260);
    const t2 = setTimeout(arm, 900);
    // Safety net: nothing is allowed to stay invisible. If the observer
    // never fired for an element (clipped, zero-size, browser quirk),
    // force it visible after 2.5s.
    const t3 = setTimeout(() => {
      document.querySelectorAll("[data-reveal]:not(.is-visible)").forEach(el => el.classList.add("is-visible"));
    }, 2500);

    return () => { io.disconnect(); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
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

// ----------------------------------------------------------------------------
// Tilt — pointer-tracked 3D rotation. Used on feature cards.
// Wrap the element with <Tilt strength={8}><div>…</div></Tilt>.
// ----------------------------------------------------------------------------

function Tilt({ children, strength = 8, glare = true }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (reducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    let rect = null;
    let raf = 0;
    const onMove = (e) => {
      if (!rect) rect = el.getBoundingClientRect();
      const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      if (!raf) raf = requestAnimationFrame(() => {
        el.style.transform =
          `perspective(900px) rotateX(${(-y * strength).toFixed(2)}deg) rotateY(${(x * strength).toFixed(2)}deg)`;
        if (glare) {
          el.style.setProperty('--tilt-gx', ((x + 1) * 50).toFixed(1) + '%');
          el.style.setProperty('--tilt-gy', ((y + 1) * 50).toFixed(1) + '%');
          el.style.setProperty('--tilt-glare', '0.18');
        }
        raf = 0;
      });
    };
    const onLeave = () => {
      rect = null;
      el.style.transform = '';
      if (glare) el.style.setProperty('--tilt-glare', '0');
    };
    el.addEventListener('mouseenter', () => { rect = el.getBoundingClientRect(); });
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strength, glare]);
  return <span ref={ref} className={"tilt" + (glare ? " has-glare" : "")}>{children}</span>;
}

// ----------------------------------------------------------------------------
// ScrollSection — pin a heading on the left while content scrolls past on the
// right. Great for editorial spreads.
// ----------------------------------------------------------------------------

function ScrollSection({ heading, children, className = "" }) {
  return (
    <section className={"scroll-section " + className}>
      <div className="container">
        <div className="scroll-section-grid">
          <div className="scroll-section-aside">{heading}</div>
          <div className="scroll-section-body">{children}</div>
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------
// BlurImage — fade-in + blur-up image loader. Uses native loading="lazy",
// transitions blur+opacity when the image actually decodes.
// ----------------------------------------------------------------------------

function BlurImage({ src, alt = "", ratio = "1/1", style = {}, className = "", eager = false }) {
  const [loaded, setLoaded] = React.useState(false);
  const onLoad = () => setLoaded(true);
  return (
    <div
      className={"blur-image " + (loaded ? "is-loaded " : "") + className}
      style={Object.assign({ aspectRatio: ratio }, style)}
    >
      {src && (
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={onLoad}
        />
      )}
    </div>
  );
}

window.Tilt = Tilt;
window.ScrollSection = ScrollSection;
window.BlurImage = BlurImage;
