/* ================================================================
   NGG — Blog / Journal
   ================================================================ */

// Map an admin-authored API post (posts table) into the blog card shape the
// page renders. Static photos.js posts remain the fallback bed underneath.
function mapApiPost(p) {
  const words = ((p.excerpt || "") + " " + (p.body || "")).split(/\s+/).length;
  return {
    id: p.slug || p.postId, slug: p.slug || p.postId,
    cover: p.coverUrl || 0,
    category: p.category || "Journal",
    title: p.title, excerpt: p.excerpt || "",
    author: { name: p.authorId || "NGG Editorial", role: "NGG", portrait: p.slug || "ngg" },
    date: fmtDate(p.publishAt),
    read: Math.max(2, Math.round(words / 200)) + " min",
    body: p.body || "", api: true,
  };
}

function BlogPage({ setPage }) {
  const [reading, setReadingRaw] = useState(null);
  const [filter, setFilter] = useState("All");
  const [apiPosts, setApiPosts] = useState([]);
  useEffect(() => {
    NGGApi.public.posts()
      .then(r => setApiPosts(((r && r.posts) || []).filter(x => x.kind !== "promo").map(mapApiPost)))
      .catch(() => {});
  }, []);
  const ALL = [...apiPosts, ...BLOG_POSTS];
  // Deep links: /blog?post=<id|slug> opens that article directly, and every
  // open/close keeps the URL shareable (also feeds the dynamic sitemap).
  const setReading = (p) => {
    setReadingRaw(p);
    if (p && p.api && !p.body && p.slug) {
      NGGApi.public.post(p.slug).then(r => {
        if (r && r.post) setReadingRaw(prev => (prev && prev.id === p.id) ? { ...prev, body: r.post.body || "" } : prev);
      }).catch(() => {});
    }
    try {
      const u = new URL(window.location.href);
      if (p) u.searchParams.set("post", String(p.slug || p.id)); else u.searchParams.delete("post");
      history.replaceState(history.state, "", u.pathname + (u.search || ""));
    } catch (_) {}
  };
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("post");
    if (!want) return;
    const hit = ALL.find(p => String(p.slug || p.id) === want);
    if (hit) setReading(hit);
  }, [apiPosts.length]);
  const categories = ["All", ...Array.from(new Set(ALL.map(p => p.category)))];
  const filtered = filter === "All" ? ALL : ALL.filter(p => p.category === filter);

  if (reading) return <BlogArticle post={reading} setPage={setPage} onBack={() => setReading(null)} onOpen={(p) => setReading(p)}/>;

  const [feat, ...rest] = ALL;

  return (
    <div className="page" data-screen-label="Blog">
      {/* Header */}
      <section className="page-hero page-hero-light" style={{background:"var(--paper)", padding:"var(--rs-p-97, 64px 0px 0px)"}}>
        <div className="container">
          <div style={{display:"grid", gridTemplateColumns:"var(--rs-gcolumns-60, 1.2fr 1fr)", gap:"var(--rs-gap-21, 48px)", alignItems:"end"}}>
            <div>
              <span className="chip chip-cream">THE JOURNAL · LONG-FORM</span>
              <h1 className="display" style={{fontSize:"var(--rs-fsize-98, clamp(64px, 8vw, 124px))", margin:"18px 0 14px", lineHeight:"var(--rs-lheight-52, 0.9)"}}>
                Notes from<br/>
                <em style={{fontStyle:"normal", color:"var(--coral)"}}>the field.</em>
              </h1>
              <p style={{fontSize:18, color:"var(--ink-700)", maxWidth:520, lineHeight:1.55, margin:0}}>
                Mentors, members and the editorial team write here. The thinking behind the program, the stories from the cohort, the receipts.
              </p>
            </div>
            <div style={{display:"flex", flexWrap:"wrap", gap:6, justifyContent:"flex-end"}}>
              {categories.map(c => (
                <button key={c} onClick={() => setFilter(c)}
                  className={"chip " + (filter === c ? "chip-navy" : "")}
                  style={{cursor:"pointer", fontSize:13, padding:"8px 14px"}}>{c}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section style={{padding:"56px 0"}}>
        <div className="container">
          <article style={{cursor:"pointer"}} onClick={() => setReading(feat)}>
            <div style={{display:"grid", gridTemplateColumns:"var(--rs-gcolumns-82, 1.5fr 1fr)", gap:32, alignItems:"center"}}>
              <Photo src={blogCover(feat.cover, 1600, 1000)} ratio="16/10" style={{height:"var(--rs-height-99, 520px)"}}/>
              <div>
                <span className="chip chip-gold">{feat.category}</span>
                <h2 style={{fontFamily:"var(--rs-ffamily-11, var(--font-display))", fontSize:"var(--rs-fsize-100, 56px)", lineHeight:1, letterSpacing:"-0.03em", margin:"18px 0 18px", fontWeight:700}}>{feat.title}</h2>
                <p style={{fontSize:18, lineHeight:1.55, color:"var(--ink-700)", margin:0}}>{feat.excerpt}</p>
                <div style={{display:"flex", alignItems:"center", gap:12, marginTop:28, paddingTop:24, borderTop:"1px solid rgba(12,20,50,0.1)"}}>
                  <Avatar seed={feat.author.portrait} size={48} ring/>
                  <div>
                    <div style={{fontWeight:700, fontSize:15}}>{feat.author.name}</div>
                    <div style={{fontSize:12, color:"var(--ink-500)"}}>{feat.author.role}</div>
                  </div>
                  <div style={{marginLeft:"auto", textAlign:"right"}}>
                    <div className="mono" style={{fontSize:11, color:"var(--ink-500)", letterSpacing:"0.12em", textTransform:"uppercase"}}>{feat.date}</div>
                    <div className="mono" style={{fontSize:11, color:"var(--coral)", letterSpacing:"0.12em", marginTop:2}}>{feat.read} read</div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* Article grid */}
      <section style={{padding:"32px 0 96px"}}>
        <div className="container">
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28}}>
            <span className="eyebrow" style={{color:"var(--ink-500)"}}>ALL ARTICLES · {filtered.length}</span>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"var(--rs-gcolumns-302, repeat(3, 1fr))", gap:28}}>
            {(filter === "All" ? rest : filtered).map(p => (
              <article key={p.id} style={{display:"flex", flexDirection:"column", gap:16, cursor:"pointer"}} onClick={() => setReading(p)}>
                <Photo src={blogCover(p.cover, 900, 600)} ratio="3/2"/>
                <div>
                  <div style={{display:"flex", alignItems:"center", gap:10}}>
                    <span className="chip" style={{fontSize:11, padding:"3px 10px"}}>{p.category}</span>
                    <span className="mono" style={{fontSize:11, color:"var(--ink-500)"}}>{p.read}</span>
                  </div>
                  <h3 style={{fontFamily:"var(--rs-ffamily-11, var(--font-display))", fontSize:24, lineHeight:1.1, letterSpacing:"-0.02em", margin:"12px 0 10px", fontWeight:700}}>{p.title}</h3>
                  <p style={{fontSize:14, color:"var(--ink-700)", lineHeight:1.5, margin:0, display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical", overflow:"hidden"}}>{p.excerpt}</p>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:10, marginTop:"auto", paddingTop:14, borderTop:"1px solid rgba(12,20,50,0.07)"}}>
                  <Avatar seed={p.author.portrait} size={30}/>
                  <div style={{fontSize:12}}>
                    <b>{p.author.name}</b>
                    <span style={{color:"var(--ink-500)"}}> · {p.date}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter strip */}
      <section className="dark-surface" style={{background:"var(--navy-900)", color:"white", padding:"72px 0"}}>
        <div className="container">
          <div style={{display:"grid", gridTemplateColumns:"var(--rs-gcolumns-16, 1fr 1fr)", gap:"var(--rs-gap-21, 48px)", alignItems:"center"}}>
            <div>
              <span className="eyebrow" style={{color:"var(--gold-400)"}}>SUNDAY DISPATCH</span>
              <h2 className="display" style={{fontSize:"var(--rs-fsize-101, clamp(36px, 4vw, 56px))", margin:"8px 0 14px", lineHeight:0.95}}>One letter, every Sunday.</h2>
              <p style={{color:"rgba(255,255,255,0.7)", fontSize:16, lineHeight:1.5, maxWidth:480}}>
                A single dispatch — the week's mission, the genius of the week, the article we wrote. No marketing, no ads. Ten minutes to read, with your tea.
              </p>
            </div>
            <NewsletterForm source="blog"/>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =================== Single article view =================== */
function BlogArticle({ post, setPage, onBack, onOpen }) {
  useEffect(() => { window.scrollTo({top:0, behavior:"instant"}); }, [post]);
  // Build a related list
  const related = BLOG_POSTS.filter(p => p.id !== post.id).slice(0, 3);

  return (
    <div className="page" data-screen-label="Blog Article">
      {/* Hero cover */}
      <section className="dark-surface" style={{position:"relative", height:"var(--rs-height-102, 560px)", overflow:"hidden", background:"var(--navy-900)"}}>
        <img src={blogCover(post.cover, 2000, 1200)} alt="" style={{position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity:0.65}}/>
        <div style={{position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(12,20,50,0.5) 0%, rgba(12,20,50,0.85) 100%)"}}/>
        <div className="container" style={{position:"relative", height:"100%", display:"flex", flexDirection:"column", justifyContent:"end", paddingBottom:48, color:"white"}}>
          <button onClick={onBack} style={{background:"none", border:"none", color:"rgba(255,255,255,0.7)", fontSize:13, cursor:"pointer", marginBottom:18, textAlign:"left", padding:0, fontFamily:"inherit"}}>← The Journal</button>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <span className="chip chip-gold">{post.category}</span>
            <span className="mono" style={{fontSize:11, color:"rgba(255,255,255,0.7)", letterSpacing:"0.12em", textTransform:"uppercase"}}>{post.date} · {post.read} read</span>
          </div>
          <h1 className="display" style={{fontSize:"var(--rs-fsize-103, clamp(40px, 6vw, 88px))", margin:"18px 0 0", maxWidth:980, lineHeight:0.95, color:"white"}}>
            {post.title}
          </h1>
          <div style={{display:"flex", alignItems:"center", gap:12, marginTop:28}}>
            <Avatar seed={post.author.portrait} size={48} ring/>
            <div>
              <div style={{fontWeight:600, fontSize:15}}>{post.author.name}</div>
              <div style={{fontSize:12, color:"rgba(255,255,255,0.6)"}}>{post.author.role}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <section style={{padding:"72px 0"}}>
        <div className="container" style={{maxWidth:760}}>
          <p style={{fontSize:"var(--rs-fsize-1, 22px)", lineHeight:1.5, color:"var(--ink-700)", fontFamily:"var(--font-display)", fontWeight:500, letterSpacing:"-0.015em", margin:"0 0 36px"}}>
            {post.excerpt}
          </p>
          <ArticleBody post={post}/>

          {/* Pull quote — editorial garnish for the seed posts only */}
          {!post.api && <blockquote style={{
            borderLeft:"4px solid var(--gold-500)",
            padding:"18px 0 18px 28px",
            margin:"48px 0",
            fontFamily:"var(--font-display)",
            fontSize:28,
            fontWeight:600,
            lineHeight:1.25,
            letterSpacing:"-0.015em",
          }}>
            "We do not chase prodigies. We build habit, attention and follow-through — talent is downstream of these."
          </blockquote>}

          <p style={{fontSize:17, lineHeight:1.7, color:"var(--ink-700)"}}>
            The shape of the work is mundane on most days. A teenager opens the dashboard, sees the week's missions, opens the camera, films a reflection. A mentor reads it, writes back. Another teenager messages in the cohort feed asking for help with a chord change or a paragraph. Saturday comes. Everyone shows up.
          </p>
          <p style={{fontSize:17, lineHeight:1.7, color:"var(--ink-700)"}}>
            Most weeks, nothing dramatic happens. Then a week comes when it does — a graduation, a first public project, a teenager standing in front of a hundred peers and not flinching — and you realise the mundane weeks were doing the work all along.
          </p>

          {/* Inline figure */}
          <figure style={{margin:"48px -80px"}}>
            <Photo src={scene("showcase", 1600, 900)} ratio="16/9"/>
            <figcaption className="mono" style={{fontSize:11, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--ink-500)", textAlign:"center", marginTop:12}}>
              Lagos Showcase · December 2025 · Photo by the cohort
            </figcaption>
          </figure>

          <h2 style={{fontFamily:"var(--rs-ffamily-11, var(--font-display))", fontSize:"var(--rs-fsize-45, 36px)", letterSpacing:"-0.025em", margin:"32px 0 18px", lineHeight:1.05}}>The trick is the system, not the speech.</h2>
          <p style={{fontSize:17, lineHeight:1.7, color:"var(--ink-700)"}}>
            We do not motivate. We do not give pep-talks at the door. We build the calendar, the cohort, the consequences and the celebrations — and we let the teenager rise inside the structure. The character is the thing that has to keep showing up after the inspiration wears off, which is by Wednesday.
          </p>
          <p style={{fontSize:17, lineHeight:1.7, color:"var(--ink-700)"}}>
            If you want the long answer, come to a Saturday session. Bring a notebook. Watch. We will not explain anything. The room will.
          </p>

          {/* Author block */}
          <div style={{display:"flex", gap:20, alignItems:"center", padding:"28px", background:"var(--cream-50)", borderRadius:18, marginTop:48}}>
            <Avatar seed={post.author.portrait} size={72}/>
            <div style={{flex:1}}>
              <div className="mono" style={{fontSize:10, letterSpacing:"0.15em", color:"var(--ink-500)"}}>WRITTEN BY</div>
              <div style={{fontFamily:"var(--font-display)", fontSize:"var(--rs-fsize-1, 22px)", fontWeight:700, marginTop:4}}>{post.author.name}</div>
              <div style={{fontSize:13, color:"var(--ink-500)", marginTop:4}}>{post.author.role} · Writing about youth movements, African excellence, and the small daily work of becoming.</div>
            </div>
          </div>

          <PostEngagement post={post}/>
        </div>
      </section>

      {/* Related */}
      <section style={{padding:"64px 0", background:"var(--cream-50)"}}>
        <div className="container">
          <SectionHead eyebrow="KEEP READING" title="More from the journal."/>
          <div style={{display:"grid", gridTemplateColumns:"var(--rs-gcolumns-302, repeat(3, 1fr))", gap:24}}>
            {related.map(p => (
              <article key={p.id} style={{display:"flex", flexDirection:"column", gap:14, cursor:"pointer"}} onClick={() => onOpen && onOpen(p)}>
                <Photo src={blogCover(p.cover, 800, 500)} ratio="3/2"/>
                <div>
                  <span className="chip" style={{fontSize:11, padding:"3px 10px"}}>{p.category}</span>
                  <h3 style={{fontFamily:"var(--rs-ffamily-11, var(--font-display))", fontSize:"var(--rs-fsize-1, 22px)", lineHeight:1.1, letterSpacing:"-0.02em", margin:"10px 0 8px", fontWeight:700}}>{p.title}</h3>
                  <p style={{fontSize:13, color:"var(--ink-700)", lineHeight:1.45, margin:0}}>{p.excerpt.slice(0, 110)}…</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ArticleBody({ post }) {
  if (post.body) {
    return (
      <div style={{fontSize:17, lineHeight:1.7, color:"var(--ink-700)"}}>
        {post.body.split(/\n{2,}|\r\n{2,}/).map((para, i) => <p key={i} style={{whiteSpace:"pre-wrap"}}>{para}</p>)}
      </div>
    );
  }
  if (post.api) return <div style={{fontSize:15, color:"var(--ink-500)"}}>Loading the full story…</div>;
  return (
    <div style={{fontSize:17, lineHeight:1.7, color:"var(--ink-700)"}}>
      <p>
        Every September we get the same question from parents. <em>What does my child actually do here?</em>
        The honest answer takes longer than they expect. We are not a school — there is no fixed curriculum we are testing them against. We are not a camp — we do not run for a fortnight and then disappear. We are not a tutoring outfit, a coding bootcamp or a leadership weekend.
      </p>
      <p>
        We run a twelve-week structured runway. The teenager picks a craft. We build them a weekly cadence of missions, mentor check-ins, public attempts and reflective writing. They live the cadence. We watch what happens to their voice, their follow-through and their relationship with their own time. We promise nothing about outcomes — we promise the shape of the work.
      </p>
    </div>
  );
}

// Reactions + moderated comments on an article. Reading is public; reacting or
// commenting needs a signed-in member. New comments are held for moderation.
function PostEngagement({ post }) {
  const auth = (typeof useAuth === "function") ? useAuth() : { member: null, openSignIn: () => {} };
  const signedIn = !!(auth && auth.member);
  const key = post.slug || post.id;
  const [eng, setEng] = React.useState(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [posted, setPosted] = React.useState(false);
  const load = () => NGGApi.public.postEngagement(key).then(setEng).catch(() => setEng({ reactions: {}, comments: [], options: ["👏","❤️","🔥","💡","🎉"], myReaction: "" }));
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [key]);
  const react = async (emoji) => {
    if (!signedIn) { auth.openSignIn && auth.openSignIn(); return; }
    try { const r = await NGGApi.member.react(key, emoji); setEng(r); } catch (e) { if (window.toast) toast.error(e.code || e.message); }
  };
  const comment = async () => {
    if (!signedIn) { auth.openSignIn && auth.openSignIn(); return; }
    if (text.trim().length < 2) return;
    setBusy(true);
    try { await NGGApi.member.comment(key, text.trim()); setText(""); setPosted(true); if (window.toast) toast.success("Thanks — your comment will appear once a moderator approves it.", "Submitted"); }
    catch (e) { if (window.toast) toast.error(e.code || e.message); } finally { setBusy(false); }
  };
  if (!eng) return null;
  const opts = eng.options || ["👏","❤️","🔥","💡","🎉"];
  return (
    <div style={{ marginTop: 48, borderTop: "1px solid rgba(12,20,50,0.1)", paddingTop: 28 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
        {opts.map(e => {
          const n = (eng.reactions && eng.reactions[e]) || 0;
          const mine = eng.myReaction === e;
          return <button key={e} onClick={() => react(e)} style={{ border: "1px solid " + (mine ? "var(--gold-500)" : "rgba(12,20,50,0.15)"), background: mine ? "rgba(245,176,38,0.12)" : "#fff", borderRadius: 999, padding: "6px 14px", cursor: "pointer", fontSize: 15 }}>{e} {n > 0 ? <b style={{ fontSize: 13 }}>{n}</b> : null}</button>;
        })}
      </div>
      <h3 style={{ fontFamily: "var(--rs-ffamily-11, var(--font-display))", fontSize: 24, margin: "0 0 16px" }}>Comments</h3>
      {signedIn ? (
        <div style={{ marginBottom: 24 }}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Share a thoughtful comment…" style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid rgba(12,20,50,0.15)", fontFamily: "inherit", fontSize: 15 }}/>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-primary btn-sm" disabled={busy || text.trim().length < 2} onClick={comment}>{busy ? "Posting…" : "Post comment"}</button>
            <span style={{ fontSize: 12, color: "var(--ink-500)" }}>{posted ? "Awaiting moderation." : "Comments are reviewed before they appear."}</span>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: "var(--ink-700)", marginBottom: 24 }}><a href="#" onClick={e => { e.preventDefault(); auth.openSignIn && auth.openSignIn(); }} style={{ color: "var(--navy-900)", fontWeight: 600 }}>Sign in</a> to react and comment.</p>
      )}
      {(eng.comments || []).length === 0 ? <p style={{ fontSize: 14, color: "var(--ink-700)" }}>No comments yet — be the first.</p> :
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {eng.comments.map(c => (
            <div key={c.commentId} style={{ padding: "12px 16px", background: "var(--cream-50)", borderRadius: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.memberName}</div>
              <div style={{ fontSize: 15, marginTop: 4, whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))}
        </div>}
    </div>
  );
}

Object.assign(window, { BlogPage, BlogArticle, ArticleBody });
