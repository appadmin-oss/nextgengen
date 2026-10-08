/* ============================================================================
   Control Room v2 — the community and announcement tabs (Community, Announcements pages). Filled into CR_TAB_DEFS (see cr-pages.jsx).
   ========================================================================== */
/* Each tab mounts the panel that served it in v1 (page-admin.jsx) through
   crPanel, until it is rebuilt as blocks — so nothing v1 did is lost. */
Object.assign(CR_TAB_DEFS, {
  community: crPanel(() => <AdminCommunity/>),
  broadcast: crPanel(() => <AdminBroadcast/>),
  newsletter: crPanel(() => <AdminNewsletter/>),
});
