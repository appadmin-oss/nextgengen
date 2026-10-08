/* ============================================================================
   Control Room v2 — the publishing tabs. Filled into CR_TAB_DEFS (see cr-pages.jsx).
   ========================================================================== */
/* Each tab mounts the panel that served it in v1 (page-admin.jsx) through
   crPanel, until it is rebuilt as blocks — so nothing v1 did is lost. */
Object.assign(CR_TAB_DEFS, {
  posts: crPanel(() => <AdminPosts/>),
  site: crPanel(() => <AdminSite/>),
  "status-pages": crPanel(() => <AdminStatusPages/>),
  forms: crPanel(() => <AdminForms/>),
  promos: crPanel(() => <AdminPromos/>),
  wisdom: crPanel(() => <AdminWisdom/>),
});
