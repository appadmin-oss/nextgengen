/* ============================================================================
   Control Room v2 — the mentors and volunteers tabs (Mentors & volunteers page). Filled into CR_TAB_DEFS (see cr-pages.jsx).
   ========================================================================== */
/* Each tab mounts the panel that served it in v1 (page-admin.jsx) through
   crPanel, until it is rebuilt as blocks — so nothing v1 did is lost. */
Object.assign(CR_TAB_DEFS, {
  mentors: crPanel(() => <AdminMentors/>),
  mentorship: crPanel(() => <AdminMentorship/>),
  volunteers: crPanel(() => <AdminVolunteers/>),
  companion: crPanel(() => <AdminCompanion/>),
});
