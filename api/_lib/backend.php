<?php
declare(strict_types=1);

/**
 * NGG — local backend dispatcher.
 *
 * Replaces the old Google Apps Script hop. Every `gs_call($op, $args)` now
 * resolves to a PHP handler running against the local database in-process
 * (10–50ms instead of a 500–2000ms round-trip to Google). The op → handler
 * map below is the single registry; add a row here + a function in the
 * matching _lib/domain/*.php file to expose a new endpoint.
 *
 * A read-only mirror of key tables is exported to Google Sheets on a cron
 * (see api/tools/export-sheets.php) so admins keep a familiar spreadsheet
 * view — but the database here is the source of truth.
 */

function backend_dispatch(string $op, array $args = []): array {
    static $map = null;
    if ($map === null) {
        $map = [
            // Auth
            'auth.request'            => 'auth_request',
            'auth.login'              => 'auth_login',
            'auth.setPassword'        => 'auth_set_password',
            'auth.verify'             => 'auth_verify',
            'auth.me'                 => 'auth_me',
            'auth.logout'             => 'auth_logout',
            'auth.totpSetup'          => 'auth_totp_setup',
            'auth.totpVerify'         => 'auth_totp_verify',
            // Members
            'member.dashboard'        => 'member_dashboard',
            'member.update'           => 'member_update',
            'member.notifications'    => 'member_notifications',
            'member.notificationRead' => 'member_notification_read',
            'member.state.get'        => 'member_state_get',
            'member.state.set'        => 'member_state_set',
            // Anchor
            'anchor.weeks'            => 'anchor_weeks',
            'anchor.mission.submit'   => 'anchor_mission_submit',
            'anchor.mission.verify'   => 'anchor_mission_verify',
            'anchor.journal.create'   => 'anchor_journal_create',
            'anchor.journal.list'     => 'anchor_journal_list',
            // Assignments
            'assignment.list'         => 'assignment_list_for_member',
            'assignment.submit'       => 'assignment_submit',
            // Events / posts / sessions
            'event.list'              => 'event_list',
            'event.rsvp'              => 'event_rsvp',
            'post.list'               => 'post_list',
            'post.get'                => 'post_get',
            'session.current'         => 'op_session_current',
            'session.list'            => 'session_list',
            'session.ensureYear'      => 'session_ensure_year',
            // Admin
            'admin.members.list'      => 'admin_members_list',
            'admin.members.upsert'    => 'admin_members_upsert',
            'admin.mentors.list'      => 'admin_mentors_list',
            'admin.mentors.upsert'    => 'admin_mentors_upsert',
            'admin.mentorship.overview' => 'admin_mentorship_overview',
            'admin.mentorship.roster'   => 'admin_mentorship_roster',
            'admin.mentor.application.convert' => 'admin_mentor_application_convert',
            // Summer School (QR attendance + enrollment)
            'admin.summer.overview'       => 'admin_summer_overview',
            'admin.summer.cohort.upsert'  => 'admin_summer_cohort_upsert',
            'admin.summer.qr.mint'        => 'admin_summer_qr_mint',
            'admin.summer.qr.list'        => 'admin_summer_qr_list',
            'admin.summer.enroll'         => 'admin_summer_enroll',
            'admin.summer.students.list'  => 'admin_summer_students_list',
            'admin.summer.student.status' => 'admin_summer_student_status',
            'admin.summer.checkin'        => 'summer_checkin',
            'admin.summer.attendance'     => 'admin_summer_attendance',
            'admin.summer.insights'       => 'admin_summer_insights',
            'admin.summer.cohort.archive' => 'admin_summer_cohort_archive',
            // NGG Club coordinator (Summer → Club bridge)
            'admin.club.overview'         => 'admin_club_overview',
            'admin.club.promotable'       => 'admin_club_promotable',
            'admin.club.promote'          => 'admin_club_promote',
            'admin.club.members'          => 'admin_club_members',
            // Anchor Circle — student side (member) + portal side (guardian)
            'auth.gateway'                => 'auth_gateway',
            'hooks.attendance'            => 'hooks_attendance',
            'admin.behaviour.log'         => 'admin_behaviour_log',
            'admin.behaviour.list'        => 'admin_behaviour_list',
            'admin.behaviour.review'      => 'admin_behaviour_review',
            'admin.forms.get'             => 'admin_forms_get',
            'admin.forms.publish'         => 'admin_forms_publish',
            'admin.gates.list'            => 'admin_gates_list',
            'admin.gates.create'          => 'admin_gates_create',
            'admin.gates.revoke'          => 'admin_gates_revoke',
            'admin.registrations.list'    => 'admin_registrations_list',
            'admin.registrations.remind'  => 'admin_registrations_remind',
            'admin.centres.list'          => 'admin_centres_list',
            'admin.centres.upsert'        => 'admin_centres_upsert',
            'admin.centres.delete'        => 'admin_centres_delete',
            'admin.cards.data'            => 'admin_cards_data',
            'gate.context'                => 'gate_context',
            'gate.register'               => 'gate_register',
            'parent.verify.context'       => 'parent_verify_context',
            'parent.verify.submit'        => 'parent_verify_submit',
            'admin.integrations.list'     => 'admin_integrations_list',
            'admin.integrations.upsert'   => 'admin_integrations_upsert',
            'admin.integrations.delete'   => 'admin_integrations_delete',
            'admin.integrations.test'     => 'admin_integrations_test',
            'admin.integrations.dispatch' => 'admin_integrations_dispatch',
            'admin.sheets.syncMembers'    => 'admin_sheets_sync_members',
            'member.security'             => 'member_security',
            'member.sessions.revoke'      => 'member_sessions_revoke',
            'member.momentum'             => 'member_momentum',
            'member.coach'                => 'member_coach',
            'member.circle'               => 'member_circle',
            'member.circle.rotate'        => 'member_circle_rotate',
            'member.circle.revoke'        => 'member_circle_revoke',
            'circle.lookup'               => 'circle_lookup',
            'circle.connect'              => 'circle_connect',
            'circle.dashboard'            => 'circle_dashboard',
            'circle.confirm'              => 'circle_confirm',
            'circle.remark'               => 'circle_remark',
            'circle.report'               => 'circle_report',
            'circle.cohort'               => 'circle_cohort',
            'admin.sessions.upsert'   => 'admin_sessions_upsert',
            'admin.missions.list'     => 'admin_missions_list',
            'admin.missions.upsert'   => 'admin_missions_upsert',
            'admin.events.list'       => 'admin_events_list',
            'admin.events.upsert'     => 'admin_events_upsert',
            'admin.posts.list'        => 'admin_posts_list',
            'admin.posts.get'         => 'admin_posts_get',
            'admin.posts.upsert'      => 'admin_posts_upsert',
            'admin.promotions.set'    => 'admin_promotions_set',
            'admin.audit.tail'        => 'admin_audit_tail',
            'admin.broadcast'         => 'admin_broadcast',
            'admin.anchor.get'        => 'admin_anchor_get',
            'admin.anchor.set'        => 'admin_anchor_set',
            'admin.anchor.defaults'   => 'admin_anchor_defaults',
            'admin.overview'          => 'admin_overview',
            'admin.member.detail'     => 'admin_member_detail',
            'admin.mentor.assign'     => 'admin_assign_mentor',
            'admin.applications.list' => 'admin_applications_list',
            'admin.applications.status' => 'admin_applications_set_status',
            'admin.application.convert' => 'admin_application_convert',
            'admin.newsletter.list'   => 'admin_newsletter_list',
            'admin.contact.list'      => 'admin_contact_list',
            'admin.contact.status'    => 'admin_contact_status',
            'admin.settings.get'      => 'admin_settings_get',
            'admin.settings.set'      => 'admin_settings_set',
            'admin.assignments.list'        => 'admin_assignments_list',
            'admin.assignments.upsert'      => 'admin_assignments_upsert',
            'admin.assignments.submissions' => 'admin_assignment_submissions',
            'admin.assignment.grade'        => 'assignment_grade',
            // Public (cached by PHP)
            'public.stats'            => 'public_stats',
            'public.events'           => 'public_events',
            'public.posts'            => 'public_posts',
            'public.session'          => 'op_public_session',
            'public.anchorContent'    => 'public_anchor_content',
            'public.mentors'          => 'public_mentors',
            'public.summerProfile'    => 'public_summer_profile',
            'public.newsletter'       => 'public_newsletter',
            'public.apply'            => 'public_apply',
            'public.contact'          => 'public_contact',
        ];
    }

    if (!isset($map[$op])) {
        return ['ok' => false, 'error' => 'unknown_op', 'detail' => $op];
    }
    $fn = $map[$op];
    try {
        $res = $fn($args);
        if (!is_array($res)) return ['ok' => false, 'error' => 'bad_handler'];
        if (!isset($res['ok'])) $res['ok'] = true;
        return $res;
    } catch (Throwable $e) {
        global $CONFIG;
        error_log('[backend_dispatch] op=' . $op . ' err=' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
        return ['ok' => false, 'error' => 'internal', 'detail' => !empty($CONFIG['debug']) ? $e->getMessage() : null];
    }
}
