/* ============================================================================
   Control Room v2 — the publishing tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).
   ========================================================================== */
/* Each tab mounts the panel that served it in v1 (page-admin.jsx) through
   crPanel, until it is rebuilt as blocks — so nothing v1 did is lost. */
Object.assign(CR_TAB_DEFS, {
  site: crPanel(() => <AdminSite/>),
  "status-pages": crPanel(() => <AdminStatusPages/>),
  forms: crPanel(() => <AdminForms/>),
  promos: crPanel(() => <AdminPromos/>),
  wisdom: crPanel(() => <AdminWisdom/>),
});

/* ── Posts, native ───────────────────────────────────────────────────────────
   Was AdminPosts: a list that opened a wide drawer editor. Same ops (admin.posts
   list / get / upsert). The list is every post, drafts and archived included —
   the public feed returns only published, which once hid every draft. A post is
   opened from the server (`get`) before editing, so the body is the stored one,
   not a list row's excerpt. */
const CR_POST_KINDS = [["blog", "Blog"], ["news", "News"], ["update", "Update"], ["promo", "Promotion"]];
const CR_POST_STATUS = [["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]];
function crPostEdit(ctx, p) {
  const isNew = !p.postId;
  ctx.form({
    title: isNew ? "New post" : "Edit post", submit: isNew ? "Create post" : "Save post", busyLabel: "Saving…",
    values: { kind: p.kind || "blog", status: p.status || "draft", featured: !!p.featured, title: p.title || "", slug: p.slug || "",
              category: p.category || "", tags: p.tags || "", coverUrl: p.coverUrl || "", excerpt: p.excerpt || "", body: p.body || "",
              promoCta: p.promoCta || "", promoUrl: p.promoUrl || "", promoExpires: p.promoExpires || "", publishAt: p.publishAt || "" },
    fields: [
      { id: "title", l: "Title", req: true, max: 160 },
      { id: "kind", l: "Kind", type: "chips", req: true, opts: CR_POST_KINDS },
      { id: "status", l: "Status", type: "chips", req: true, opts: CR_POST_STATUS },
      { id: "featured", l: "Featured", type: "switch" },
      { id: "excerpt", l: "Excerpt", type: "textarea", rows: 2, max: 400 },
      { id: "body", l: "Body (Markdown)", type: "textarea", rows: 12 },
      { id: "coverUrl", l: "Cover image link", max: 400, ph: "https://" },
      { id: "coverFile", l: "…or upload the cover", type: "file", accept: "image/*" },
      { id: "category", l: "Category", max: 60 },
      { id: "tags", l: "Tags (comma separated)", max: 200 },
      { id: "slug", l: "Address (slug)", ph: "made from the title if left empty", max: 120 },
      { id: "promoCta", l: "Button label", when: v => v.kind === "promo", max: 40 },
      { id: "promoUrl", l: "Button link", when: v => v.kind === "promo", max: 400 },
      { id: "promoExpires", l: "Promotion ends", type: "datetime-local", when: v => v.kind === "promo" },
      { id: "publishAt", l: "Publish at", type: "datetime-local", help: "Leave empty to publish now." },
    ],
    onSubmit: async v => {
      let cover = String(v.coverUrl || "").trim();
      if (v.coverFile && typeof v.coverFile !== "string") { const u = await NGGApi.uploadOrInline(v.coverFile, "cover"); if (u && u.url) cover = u.url; }
      const out = Object.assign({}, p, v, { coverUrl: cover }); delete out.coverFile;
      const r = await NGGApi.admin.posts.upsert(out); ctx.reload(); return r;
    },
    done: v => (isNew ? "Created: " : "Saved: ") + v.title + ".",
  });
}
async function crPostOpen(ctx, id) {
  try { const r = await NGGApi.admin.posts.get(id); crPostEdit(ctx, r.post || {}); }
  catch (e) { ctx.toast(crErr(e, "Couldn’t open that post."), null, true); }
}
Object.assign(CR_TAB_DEFS, {
  posts: {
    skeleton: ["table"],
    load: async () => { const r = await NGGApi.admin.posts.list(); return { posts: r.posts || [] }; },
    actions: (d, ctx) => [{ l: "New post", icon: "plus", primary: true, run: () => crPostEdit(ctx, {}) }],
    blocks: (d, ctx) => [{
      type: "table", span: 6, nosel: true, search: "Title or category",
      cols: ["Post", "Kind", "Category", "Publishes", "Status"], filters: ["Kind", "Status"],
      emptyText: "No posts yet. New post writes one; it stays a draft until you publish it.",
      rows: d.posts.map(p => ({ key: p.postId, open: () => crPostOpen(ctx, p.postId), cells: [
        { k: "strong", t: p.title || "(untitled)", s: p.featured ? "Featured" : "" },
        { k: "text", t: (CR_POST_KINDS.find(k => k[0] === p.kind) || [0, p.kind || "—"])[1] },
        { k: "text", t: p.category || "—" },
        { k: "text", t: p.publishAt ? crDate(p.publishAt) : "—" },
        { k: "status", t: (CR_POST_STATUS.find(k => k[0] === (p.status || "draft")) || [0, p.status])[1], tone: p.status === "published" ? "ok" : p.status === "archived" ? "neutral" : "warn" },
      ] })),
    }],
  },
});
