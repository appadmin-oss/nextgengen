/* ================================================================
   NGG — The Anchor Book page.
   Promotes the book + lists chapters → cross-links to the
   Anchor 12 missions derived from each chapter.
   ================================================================ */

// Preorder → waitlist. There's no payment flow yet, so the honest version
// captures an email against the 'book-waitlist' source and confirms.
async function joinBookWaitlist() {
  const email = await dialog.prompt({
    title: "Join the preorder list",
    body: "The Anchor ships from Lagos later this year. Leave your email and you'll be first to know when preorders open — print and digital.",
    label: "Email",
    placeholder: "you@email.com",
    inputType: "email",
    cta: "Join the list",
  });
  if (!email) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast.error("That email doesn't look right.", "Preorder list");
    return;
  }
  try {
    await NGGApi.public.newsletter(email, "book-waitlist");
    toast.success("You're on the list. We'll email you when preorders open.", "The Anchor");
  } catch (e) {
    const code = e.code || e.message;
    toast.error(code === "rate_limited" ? "Too many tries — wait a few minutes." : "Couldn't save your email. Try again.", "Preorder list");
  }
}

function BookPage({ setPage }) {
  // Until the actual PDF + chapter outline is loaded, this renders a
  // structured placeholder admin can fill in via the Settings sheet
  // (key=book_chapters value=JSON array). Once filled, the page reflects
  // the real book.
  const [chapters, setChapters] = React.useState(null);

  React.useEffect(() => {
    // Future: pull from /api/public/book.php. For now we render the
    // 12-week themed placeholder so the page is functional.
    setChapters(DEFAULT_CHAPTERS);
  }, []);

  return (
    <div className="page" data-screen-label="07 The Anchor Book">
      <BookHero setPage={setPage}/>
      <BookFlex/>
      <BookChapters chapters={chapters} setPage={setPage}/>
      <BookProof/>
      <BookCta setPage={setPage}/>
    </div>
  );
}

function BookHero({ setPage }) {
  return (
    <section className="book-hero">
      <div className="container">
        <div className="book-hero-grid">
          <div className="book-hero-copy">
            <div className="eyebrow" style={{color:"var(--gold-500)"}}>THE ANCHOR · A BOOK BY NGG</div>
            <h1 className="display book-hero-h1">
              <span>Twelve</span><br/>
              <span style={{color:"var(--gold-500)"}}>weeks.</span><br/>
              <span>One anchor.</span>
            </h1>
            <p className="book-hero-p">
              The Anchor is the field manual every NGG teenager works through during
              Anchor 12 — a structured runway of identity, discipline, leadership and
              public work. Twelve chapters, dozens of missions, a single direction.
            </p>
            <div className="book-hero-cta">
              <button className="btn btn-primary btn-lg" onClick={joinBookWaitlist}>Preorder the book →</button>
              <button className="btn btn-ghost btn-lg" onClick={() => setPage("anchor")}>
                See the missions
              </button>
            </div>
            <div className="book-hero-meta">
              <div>
                <div className="mono">FORMAT</div>
                <div className="book-hero-meta-v">Print + digital</div>
              </div>
              <div>
                <div className="mono">PAGES</div>
                <div className="book-hero-meta-v">~240</div>
              </div>
              <div>
                <div className="mono">AGES</div>
                <div className="book-hero-meta-v">10 – 17</div>
              </div>
            </div>
          </div>
          <div className="book-hero-visual">
            <div className="book-cover" aria-hidden="true">
              <div className="book-cover-spine"/>
              <div className="book-cover-face">
                <div className="book-cover-eyebrow">NGG</div>
                <div className="book-cover-title">The<br/>Anchor</div>
                <div className="book-cover-foot">12 chapters · 1 generation</div>
              </div>
              <div className="book-cover-shadow"/>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BookFlex() {
  const flex = [
    { n: "12", l: "themed chapters" },
    { n: "84+", l: "missions" },
    { n: "1×", l: "across all of Anchor 12" },
    { n: "Lagos", l: "made and tested" },
  ];
  return (
    <section className="book-flex">
      <div className="container">
        <div className="book-flex-grid">
          {flex.map(f => (
            <div key={f.l} className="book-flex-cell">
              <div className="display book-flex-n">{f.n}</div>
              <div className="mono book-flex-l">{f.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BookChapters({ chapters, setPage }) {
  if (!chapters) return null;
  return (
    <section className="book-chapters-sec">
      <div className="container">
        <div className="book-chapters-head">
          <div className="eyebrow" style={{color:"var(--ink-500)"}}>CONTENTS · 12 CHAPTERS</div>
          <h2 className="display book-chapters-h">Where the work happens.</h2>
          <p className="book-chapters-p">
            Each chapter unlocks one week of Anchor 12. Read it. Do the missions.
            Reflect in your journal. Repeat.
          </p>
        </div>
        <ol className="book-chapter-list">
          {chapters.map((c, i) => (
            <li key={c.n} className="book-chapter">
              <div className="book-chapter-num">{String(c.n).padStart(2, "0")}</div>
              <div className="book-chapter-body">
                <div className="book-chapter-title">{c.title}</div>
                <div className="book-chapter-sub">{c.sub}</div>
                <div className="book-chapter-meta">
                  <span>~{c.missions} missions</span>
                  <span>·</span>
                  <span>{c.minutes} min read</span>
                </div>
              </div>
              <button className="book-chapter-cta" onClick={() => setPage("anchor")}>
                <span>Week {c.n}</span> →
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function BookProof() {
  return (
    <section className="book-proof">
      <div className="container">
        <div className="book-proof-grid">
          <div className="book-proof-q">
            <span className="display book-proof-mark">"</span>
            <p>
              I thought I was buying a book. I bought a map for the next two years
              of my son's life. He still reaches for it.
            </p>
            <div className="mono book-proof-by">— PARENT, AYOBO</div>
          </div>
          <div className="book-proof-q">
            <span className="display book-proof-mark">"</span>
            <p>
              The thing I love is that it doesn't talk down to teenagers. It treats
              them like the leaders they're about to become.
            </p>
            <div className="mono book-proof-by">— MENTOR, EGBEDA</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BookCta({ setPage }) {
  return (
    <section className="book-cta">
      <div className="container">
        <h2 className="display book-cta-h">Anchor yourself.</h2>
        <p className="book-cta-p">Read the chapters. Show up for the work. Become the room you wanted.</p>
        <div className="book-cta-row">
          <button className="btn btn-gold btn-lg" onClick={joinBookWaitlist}>Preorder the book →</button>
          <button className="btn btn-ghost btn-lg" onClick={() => setPage("anchor")}>Go to Anchor 12 →</button>
        </div>
        <div className="mono book-cta-note">PRINT SHIPS FROM LAGOS · DIGITAL UNLOCKS ON SIGN-IN</div>
      </div>
    </section>
  );
}

// Placeholder chapter outline — replaced once admin loads the real ToC
// from the Anchor book PDF. Kept here so the page is functional today.
const DEFAULT_CHAPTERS = [
  { n: 1,  title: "Identity",            sub: "Define who you are before others do.",          missions: 6, minutes: 12 },
  { n: 2,  title: "Discipline",          sub: "The promises you keep when nobody is watching.", missions: 7, minutes: 14 },
  { n: 3,  title: "Communication",       sub: "Be understood. Then be remembered.",             missions: 6, minutes: 11 },
  { n: 4,  title: "Leadership",          sub: "Lead the work you would not delegate.",          missions: 7, minutes: 13 },
  { n: 5,  title: "Creativity",          sub: "The original move beats the polished copy.",     missions: 6, minutes: 10 },
  { n: 6,  title: "Civic Intelligence",  sub: "Read your room, your street, your country.",     missions: 7, minutes: 15 },
  { n: 7,  title: "Money & Enterprise",  sub: "From idea to revenue without losing the soul.",  missions: 8, minutes: 16 },
  { n: 8,  title: "Service",             sub: "The leader who doesn't serve isn't leading.",    missions: 6, minutes: 12 },
  { n: 9,  title: "Resilience",          sub: "How to stay on the field after the fall.",       missions: 7, minutes: 13 },
  { n: 10, title: "Influence",           sub: "Build an audience worth being seen by.",         missions: 7, minutes: 14 },
  { n: 11, title: "Vision",              sub: "See further than your friends. Bring them.",     missions: 6, minutes: 11 },
  { n: 12, title: "Anchor",              sub: "Become the room you wanted.",                    missions: 7, minutes: 15 },
];

Object.assign(window, { BookPage });
