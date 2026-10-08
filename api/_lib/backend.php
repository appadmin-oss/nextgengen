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
            'auth.resetRequest'       => 'auth_reset_request',
            'auth.resetConfirm'       => 'auth_reset_confirm',
            'auth.setPassword'        => 'auth_set_password',
            'auth.verify'             => 'auth_verify',
            'auth.me'                 => 'auth_me',
            'auth.logout'             => 'auth_logout',
            'auth.lock'               => 'auth_admin_lock',
            'auth.totpSetup'          => 'auth_totp_setup',
            'auth.totpVerify'         => 'auth_totp_verify',
            // Members
            'member.dashboard'        => 'member_dashboard',
            'member.update'           => 'member_update',
            'photo.chunk'             => 'photo_chunk_put',
            'member.notifications'    => 'member_notifications',
            'member.notificationRead' => 'member_notification_read',
            'member.state.get'        => 'member_state_get',
            'member.state.set'        => 'member_state_set',
            // Anchor
            'anchor.weeks'            => 'anchor_weeks',
            'anchor.mission.submit'   => 'anchor_mission_submit',
            'anchor.mission.verify'   => 'anchor_mission_verify',
            'member.mentor.roster'    => 'mentor_roster',
            'member.mentor.child'     => 'mentor_child',
            'member.mentor.meeting.save'   => 'mentor_meeting_save',
            'member.mentor.meeting.delete' => 'mentor_meeting_delete',
            'member.mentor.goal.save'      => 'mentor_goal_save',
            'member.mentor.goal.status'    => 'mentor_goal_status',
            'member.mentor.attention'      => 'mentor_attention',
            'member.mentor.courage.mark'   => 'courage_mark_save',
            'member.mentor.review.save'    => 'mentor_review_save',
            'member.mentor.reviews.due'    => 'mentor_reviews_due',

            'behaviour.star.give'     => 'mentor_star_give',
            'behaviour.bulk.award'    => 'mentor_bulk_award',
            'admin.behaviour.presets' => 'admin_behaviour_presets_save',
            'member.mentor.v3.rate'   => 'mentor_v3_rate',
            // The teaching record — session log, remarks, skill marks.
            'instructor.session.get'  => 'instructor_session_get',
            'instructor.session.save' => 'instructor_session_save',
            'instructor.skills.board' => 'instructor_skills_board',
            'instructor.skills.mark'  => 'instructor_skills_mark',
            'member.remark.add'       => 'remark_add',
            'member.remark.list'      => 'remark_list',
            'admin.champions.board'   => 'admin_champions_board',
            'admin.champions.mint'    => 'admin_champions_mint',
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
            'admin.members.suggest'   => 'admin_members_suggest',
            /* Bulk over the member roster, plus the id list that makes
               "apply to all N matching the filter" possible. Each bulk action
               declares its own capability and every row comes back with its
               own verdict — see _lib/domain/members-bulk.php for the guards
               (self, staff tier, centre scope, bounds). */
            'admin.members.issueIds'    => 'admin_members_issue_ids',
            'admin.members.idDuplicates' => 'admin_members_id_duplicates',
            /* Member cards: secure MEMQR- cards, printed formats, backfill —
               see domain/member-cards.php. */
            'admin.members.cardFormats'    => 'admin_member_card_formats',
            'admin.members.cardFormatSave' => 'admin_member_card_format_save',
            'admin.members.idFormatDeclare' => 'admin_member_id_format_declare',
            'admin.members.cards'          => 'admin_member_cards',
            'admin.members.cardReissue'    => 'admin_member_card_reissue',
            'admin.members.cardsBackfill'  => 'admin_member_cards_backfill',
            // Send everybody already promoted to NGV to Afrovanguard (domain/ngv-portal.php).
            'admin.members.ngvPortalSync'  => 'admin_members_ngv_portal_sync',
            'admin.members.ids'       => 'admin_members_ids',
            'admin.members.upsert'    => 'admin_members_upsert',
            'admin.members.import'    => 'admin_members_import',
            'admin.requests.list'     => 'admin_requests_list',
            'admin.requests.decide'   => 'admin_request_decide',
            'admin.members.consent'   => 'admin_member_consent',
            'admin.members.duplicates' => 'admin_members_duplicates',
            'admin.members.overview'  => 'admin_members_overview',
            'admin.members.segments'  => 'admin_members_segments',
            'admin.members.bulk'      => 'admin_members_bulk',
            'admin.approvals.list'    => 'admin_approvals_list',
            'admin.approvals.decide'  => 'admin_approvals_decide',
            'admin.approvals.withdraw' => 'admin_approvals_withdraw',
            // The NGG Club curriculum (domain/curriculum.php).
            'admin.curriculum.list'    => 'admin_curriculum_list',
            'admin.curriculum.get'     => 'admin_curriculum_get',
            'admin.curriculum.upsert'  => 'admin_curriculum_upsert',
            'admin.curriculum.status'  => 'admin_curriculum_status',
            'admin.curriculum.import'  => 'admin_curriculum_import',
            'admin.curriculum.seed'     => 'admin_curriculum_seed',
            'admin.curriculum.ai'      => 'admin_curriculum_ai',
            'admin.curriculum.report'  => 'admin_curriculum_report',
            'admin.curriculum.schedule' => 'admin_curriculum_schedule',
            'admin.curriculum.submissions' => 'admin_curriculum_submissions',
            'admin.curriculum.review' => 'admin_curriculum_review',
            'admin.curriculum.file'    => 'admin_curriculum_file_put',
            'member.curriculum.list'   => 'member_curriculum_list',
            'member.curriculum.unit'   => 'member_curriculum_unit',
            'member.curriculum.submit' => 'member_curriculum_submit',
            'member.curriculum.document' => 'member_curriculum_document',
            'staff.curriculum'         => 'staff_curriculum',
            'staff.curriculum.member'  => 'staff_curriculum_member',
            'staff.curriculum.mark'    => 'staff_curriculum_mark',
            'staff.curriculum.material' => 'staff_curriculum_material',
            'staff.curriculum.file' => 'staff_curriculum_file_put',
            'member.companion'         => 'member_companion',
            'admin.companion.board'    => 'admin_companion_board',
            'admin.companion.assess'   => 'admin_companion_assess',
            /* Family accounts. Every family.* op takes guardianId from the
               family cookie (require_family), never from the body. */
            'family.request'           => 'family_request',
            'family.verify'            => 'family_verify',
            'family.signout_all'       => 'family_signout_all',
            'family.me'                => 'family_me',
            'family.profile'           => 'family_profile',
            'family.ward.add'          => 'family_ward_add',
            'family.ward.remove'       => 'family_ward_remove',
            'family.ward.notify'       => 'family_ward_notify',
            'family.ward'              => 'family_ward',
            'family.request.create'    => 'family_request_create',
            'family.request.withdraw'  => 'family_request_withdraw',
            'admin.families.list'      => 'admin_families_list',
            'admin.families.decide'    => 'admin_families_decide',
            'admin.timetable.list'     => 'admin_timetable_list',
            'admin.timetable.save'     => 'admin_timetable_save',
            'admin.timetable.remove'   => 'admin_timetable_remove',
            'member.timetable'         => 'member_timetable',
            'public.timetable'         => 'public_timetable',
            'member.myTimetable'       => 'member_my_timetable',
            'member.myTimetable.save'  => 'member_my_timetable_save',
            'public.timetableSave'     => 'public_timetable_save',
            'public.timetableLoad'     => 'public_timetable_load',
            'public.timetableTerm'     => 'public_timetable_term',
            'public.programme'         => 'public_programme',
            'admin.club.catalogue.get' => 'admin_club_catalogue_get',
            'admin.roles'              => 'admin_roles',
            'admin.status.board'       => 'admin_status_board',
            'admin.members.record'     => 'admin_member_record',
            'admin.club.catalogue.set' => 'admin_club_catalogue_set',
            'admin.members.merge'     => 'admin_members_merge',
            'admin.member.timeline'   => 'admin_member_timeline',
            'admin.members.promoteNgv' => 'admin_member_promote_ngv',
            'admin.members.readiness'  => 'admin_member_readiness',
            'admin.members.promotions' => 'admin_member_promotions',
            'admin.members.demoteNgv' => 'admin_member_demote_ngv',
            'admin.members.reset2fa'  => 'admin_member_reset_2fa',
            'admin.members.resetPassword' => 'admin_member_reset_password',
            'admin.mentors.list'      => 'admin_mentors_list',
            'admin.mentors.upsert'    => 'admin_mentors_upsert',
            'admin.mentorship.overview' => 'admin_mentorship_overview',
            'admin.mentorship.roster'   => 'admin_mentorship_roster',
            'admin.mentor.application.convert' => 'admin_mentor_application_convert',
            'admin.mentor.promote'    => 'admin_mentor_promote',
            'admin.mentor.demote'     => 'admin_mentor_demote',
            'admin.mentor.candidates' => 'admin_mentor_candidates',
            // Summer School (QR attendance + enrollment)
            'admin.summer.overview'       => 'admin_summer_overview',
            'admin.summer.cohort.upsert'  => 'admin_summer_cohort_upsert',
            /* Summer School structure. An EDITION is one season
               (`summer_cohorts`, whose id is the `cohortId` every summer table
               carries); a GROUP is a class within it (`summer_groups`). Both
               gate on `summer`. The centre DIRECTORY is deliberately not here:
               a centre is an NGG-wide place whose code is the printed ID prefix
               on every member card, so writing it gates on `people`. See
               _lib/domain/summer-editions.php. */
            'admin.summer.editions'       => 'admin_summer_editions',
            'admin.summer.edition.save'   => 'admin_summer_edition_save',
            'admin.summer.edition.status' => 'admin_summer_edition_status',
            'admin.summer.groups'         => 'admin_summer_groups',
            'admin.summer.group.save'     => 'admin_summer_group_save',
            'admin.summer.group.delete'   => 'admin_summer_group_delete',
            'admin.summer.group.assign'   => 'admin_summer_group_assign',
            'admin.summer.group.report'   => 'admin_summer_group_report',
            'admin.summer.qr.mint'        => 'admin_summer_qr_mint',
            'admin.summer.qr.list'        => 'admin_summer_qr_list',
            'admin.summer.qr.void'        => 'admin_summer_qr_void',
            'admin.summer.qr.reassign'    => 'admin_summer_qr_reassign',
            'admin.summer.enroll'         => 'admin_summer_enroll',
            'admin.summer.students.list'  => 'admin_summer_students_list',
            'admin.summer.student.status' => 'admin_summer_student_status',
            'admin.summer.student.update' => 'admin_summer_student_update',
            'admin.summer.student.delete' => 'admin_summer_student_delete',
            'admin.summer.checkin'        => 'summer_checkin',
            'admin.summer.attendance'     => 'admin_summer_attendance',
            'admin.volunteer.attendance'  => 'admin_volunteer_attendance',
            'admin.summer.attendance.day' => 'admin_summer_attendance_day',
            'admin.summer.certs.issue'    => 'admin_summer_certs_issue',
            'admin.cert.revoke'           => 'admin_cert_revoke',
            'admin.summer.checkout'       => 'summer_checkout',
            'admin.summer.absence.alert'  => 'admin_summer_absence_alert',
            'admin.summer.consent'        => 'admin_summer_consent',
            'admin.summer.consentDoc.save' => 'admin_consent_doc_save',
            'admin.ai.status'             => 'admin_ai_status',
            'admin.summer.import'         => 'admin_summer_import',
            'admin.summer.insights'       => 'admin_summer_insights',
            // Attendance-taker rotation + gamified attendance
            'attendance.duty.board'       => 'attendance_duty_board',
            'attendance.duty.leaderboard' => 'attendance_duty_leaderboard',
            'attendance.duty.complete'    => 'attendance_duty_complete',
            'admin.attendance.duty'       => 'admin_attendance_duty',
            'admin.attendance.duty.set'   => 'admin_attendance_duty_set',
            'admin.summer.cohort.archive' => 'admin_summer_cohort_archive',
            // Programme calendar + Institutional Policy enforcement
            'admin.policy.settings'       => 'admin_policy_settings',
            'admin.policy.save'           => 'admin_policy_save',
            /* Member obligations — membership fee, monthly dues, training fee.
             * All gated on `people`: a fees screen is a roster screen, not a
             * separate permission somebody could be granted by accident. */
            'admin.fees.settings.get'     => 'admin_fees_settings_get',
            'admin.fees.settings.set'     => 'admin_fees_settings_set',
            'admin.fees.member'           => 'admin_fees_member',
            'admin.fees.payment'          => 'admin_fees_payment',
            'admin.fees.void'             => 'admin_fees_void',
            'admin.fees.mou'              => 'admin_fees_mou',
            'admin.fees.remindOff'        => 'admin_fees_remind_off',
            'admin.fees.accrue'           => 'admin_fees_accrue',
            'admin.fees.remind.preview'   => 'admin_fees_remind_preview',
            'admin.fees.remind.run'       => 'admin_fees_remind_run',
            'admin.fees.uprate.preview'   => 'admin_fees_uprate_preview',
            'admin.fees.uprate.apply'     => 'admin_fees_uprate_apply',
            'admin.fees.arrears'          => 'admin_fees_arrears',
            'admin.fees.training'         => 'admin_fees_training',
            'admin.fees.charge'           => 'admin_fees_charge',
            'admin.fees.fineImport'       => 'admin_fees_fine_import',
            'admin.fees.waive'            => 'admin_fees_waive',
            'admin.fees.lookup'           => 'admin_fees_lookup',
            'admin.policy.day.toggle'     => 'admin_policy_day_toggle',
            'admin.policy.board'          => 'admin_policy_board',
            'admin.policy.person'         => 'admin_policy_person',
            'admin.policy.infraction'     => 'admin_policy_infraction',
            'admin.policy.void'           => 'admin_policy_void',
            'admin.policy.sanction.issue' => 'admin_policy_sanction_issue',
            'admin.policy.sanction.update' => 'admin_policy_sanction_update',
            'admin.policy.reinstate'      => 'admin_policy_reinstate',
            'admin.policy.sweep'          => 'admin_policy_sweep',
            // NGG Club coordinator (Summer → Club bridge)
            'admin.club.overview'         => 'admin_club_overview',
            'admin.club.promotable'       => 'admin_club_promotable',
            'admin.club.promote'          => 'admin_club_promote',
            'admin.club.members'          => 'admin_club_members',
            /* A club coordinator's own bulk actions. Deliberately narrower
               than the member desk's — see domain/club.php: `club` manages
               participation, and must not become a quiet superset of
               `people`. */
            'admin.club.promote.bulk'     => 'admin_club_promote_bulk',
            'admin.club.members.bulk'     => 'admin_club_members_bulk',
            // Anchor Circle — student side (member) + portal side (guardian)
            'auth.gateway'                => 'auth_gateway',
            'hooks.attendance'            => 'hooks_attendance',
            'hooks.gate.resolve'          => 'hooks_gate_resolve',
            'hooks.gate.search'           => 'hooks_gate_search',
            'admin.behaviour.log'         => 'admin_behaviour_log',
            'admin.behaviour.list'        => 'admin_behaviour_list',
            'admin.behaviour.review'      => 'admin_behaviour_review',
            'admin.remark.ack'            => 'remark_ack',
            'admin.course.skills'         => 'admin_course_skills_save',
            'admin.staff.performance'     => 'admin_staff_performance',
            'admin.engagement'            => 'admin_engagement',
            'admin.engagement.trends'     => 'admin_engagement_trends',
            'admin.community.engagement'  => 'admin_community_engagement',
            'admin.ops.status'            => 'admin_ops_status',
            'admin.ops.clear'             => 'admin_ops_clear',
            'admin.ops.run'               => 'admin_ops_run_cron',
            'admin.forms.list'            => 'admin_forms_list',
            'admin.forms.get'             => 'admin_forms_get',
            'admin.forms.publish'         => 'admin_forms_publish',
            'admin.gates.list'            => 'admin_gates_list',
            'admin.gates.create'          => 'admin_gates_create',
            'admin.gates.setpass'         => 'admin_gates_setpass',
            'admin.gates.validity'        => 'admin_gates_validity',
            'admin.gates.rotate'          => 'admin_gates_rotate',
            'admin.gates.rotation'        => 'admin_gates_rotation',
            'admin.gates.revoke'          => 'admin_gates_revoke',
            'admin.gates.delete'          => 'admin_gates_delete',
            'gate.unlock'                 => 'gate_unlock',
            'admin.registrations.list'    => 'admin_registrations_list',
            'admin.registrations.remind'  => 'admin_registrations_remind',
            /* Recording a consent a family gave off-line — on paper, in person or
             * by phone. Deliberately per-child and deliberately not a
             * "mark verified" switch; see the domain function. */
            'admin.registration.consent.record' => 'admin_registration_consent_record',
            'admin.registration.consent.bulk'   => 'admin_registration_consent_record_bulk',
            'admin.registration.consents'       => 'admin_registration_consents',
            /* Hosted QR images, handed over by whichever screen has just drawn
             * them. Without these an automatically-issued ID email can only
             * link — mail clients strip data: URIs and there is no encoder on
             * the server. */
            'admin.qr.warm'                     => 'admin_qr_cache_warm',
            /* Resending in bulk, and the read that tells you how many need it
             * before you press anything. */
            'admin.id.resend.bulk'              => 'admin_id_resend_bulk',
            'admin.id.qrgaps'                   => 'admin_id_qr_gaps',
            /* ID card designs. Gated on 'people', not 'summer': the staff who
               verify children and the staff who decide what a credential looks
               like are different jobs, and the second can invalidate every card
               at a gate. */
            'admin.card.templates'              => 'admin_card_templates',
            'admin.card.template.get'           => 'admin_card_template_get',
            'admin.card.template.save'          => 'admin_card_template_save',
            'admin.card.template.publish'       => 'admin_card_template_publish',
            'admin.card.template.check'         => 'admin_card_template_check',
            'admin.card.template.delete'        => 'admin_card_template_delete',
            /* ID card ISSUANCE. The template system froze a published version
               and promised print runs would record it; nothing did. These do —
               one row per batch and one per person, each carrying the frozen
               version, so "what is in this member's hand" and "reprint it
               exactly as it was in July" are answerable. Same `people` gate as
               the templates: deciding what a credential looks like and issuing
               one are the same trust boundary. See domain/card-runs.php. */
            'admin.card.run.record'             => 'admin_card_run_record',
            'admin.card.runs'                   => 'admin_card_runs',
            'admin.card.run.get'                => 'admin_card_run_get',
            'admin.card.history'                => 'admin_card_history',
            'admin.ids.state'                   => 'admin_ids_state',
            'admin.ids.reprint.request'         => 'admin_ids_reprint_request',
            'admin.ids.reprint.done'            => 'admin_ids_reprint_done',
            'admin.ids.run.failed'              => 'admin_ids_run_failed',
            'admin.ids.photo.ask'               => 'admin_ids_photo_ask',
            'admin.ids.design.set'              => 'admin_ids_design_set',
            'admin.ids.mint'                    => 'admin_ids_mint',
            /* The design asset library. Images placed in a design used to be
               data: URLs inside the design itself, which capped a poster at one
               small photograph — see api/_lib/domain/design-assets.php. */
            'admin.design.assets'               => 'admin_design_assets',
            'admin.design.asset.upload'         => 'admin_design_asset_upload',
            'admin.design.asset.rename'         => 'admin_design_asset_rename',
            'admin.design.asset.delete'         => 'admin_design_asset_delete',
            'admin.design.asset.usage'          => 'admin_design_asset_usage',
            /* Data merge: who a design run covers. Gated per audience inside
               the op — exporting 240 children's names and faces is a roster
               read, not a styling choice. See api/_lib/domain/merge.php. */
            'admin.merge.rows'                  => 'admin_merge_rows',
            /* Baseline/endline learning measurement. Gated on 'summer' inside
               the ops: recording a child's test score is roster work, and the
               analysis reads the same roster. See _lib/domain/assessment.php. */
            'admin.assessment.instruments'      => 'admin_assessment_instruments',
            'admin.assessment.instrument.save'  => 'admin_assessment_instrument_save',
            'admin.assessment.instrument.revise'=> 'admin_assessment_instrument_revise',
            'admin.assessment.windows'          => 'admin_assessment_windows',
            'admin.assessment.window.save'      => 'admin_assessment_window_save',
            'admin.assessment.sheet'            => 'admin_assessment_sheet',
            'admin.assessment.record'           => 'admin_assessment_record',
            'admin.assessment.gains'            => 'admin_assessment_gains',
            'admin.assessment.catalogue'        => 'admin_assessment_catalogue',
            'admin.assessment.adopt'            => 'admin_assessment_adopt',
            'admin.registrations.remindBulk' => 'admin_registrations_remind_bulk',
            'admin.centres.list'          => 'admin_centres_list',
            'admin.centres.upsert'        => 'admin_centres_upsert',
            'admin.centres.delete'        => 'admin_centres_delete',
            'admin.academy.catalogue.get' => 'admin_academy_catalogue_get',
            'admin.academy.catalogue.set' => 'admin_academy_catalogue_set',
            'admin.profile.extras.get'    => 'admin_profile_extras_get',
            'admin.profile.project.upsert' => 'admin_profile_project_upsert',
            'admin.profile.project.delete' => 'admin_profile_project_delete',
            'admin.profile.note.upsert'   => 'admin_profile_note_upsert',
            'admin.profile.note.delete'   => 'admin_profile_note_delete',
            'admin.cards.data'            => 'admin_cards_data',
            /* The public Summer School page: the live edition, the academies
               and the centres with what runs at each, in one cacheable read.
               See domain/summer-editions.php. */
            'public.summer'               => 'public_summer_page',
            'gate.context'                => 'gate_context',
            'gate.register'               => 'gate_register',
            'parent.verify.context'       => 'parent_verify_context',
            'parent.verify.submit'        => 'parent_verify_submit',
            'reshoot.context'             => 'reshoot_context',
            'reshoot.submit'              => 'reshoot_submit',
            'admin.integrations.list'     => 'admin_integrations_list',
            'admin.integrations.upsert'   => 'admin_integrations_upsert',
            'admin.integrations.delete'   => 'admin_integrations_delete',
            'admin.integrations.test'     => 'admin_integrations_test',
            'admin.integrations.dispatch' => 'admin_integrations_dispatch',
            'admin.integrations.retry'    => 'admin_integrations_retry',
            'admin.sheets.syncMembers'    => 'admin_sheets_sync_members',
            'member.email.changeRequest'  => 'member_request_email_change',
            'member.email.confirm'        => 'member_confirm_email_change',
            'member.export'               => 'member_export',
            'member.deleteAccount'        => 'member_delete_account',
            'admin.members.delete'        => 'admin_member_delete',
            'member.security'             => 'member_security',
            'member.sessions.revoke'      => 'member_sessions_revoke',
            'member.momentum'             => 'member_momentum',
            /* A member's own obligations, read-only. There is deliberately no
               member-side op that posts, pays or voids anything. */
            'member.fees'                 => 'member_fees_account',
            /* Self-service. Every one of these takes its memberId from the
               SESSION, never the body — see member-self.php. */
            'member.statement'            => 'member_statement',
            'member.records'              => 'member_records',
            'member.courage'              => 'member_courage',
            'admin.divisions.overview'    => 'admin_divisions_overview',
            'admin.mentors.duplicates'    => 'admin_mentors_duplicates',
            'member.requests'             => 'member_requests_list',
            'member.request.create'       => 'member_request_create',
            'member.request.withdraw'     => 'member_request_withdraw',
            'member.compliance'           => 'member_compliance',
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
            'admin.missions.submissions' => 'admin_mission_submissions',
            'admin.events.list'       => 'admin_events_list',
            'admin.events.upsert'     => 'admin_events_upsert',
            'admin.posts.list'        => 'admin_posts_list',
            'admin.posts.get'         => 'admin_posts_get',
            'admin.posts.upsert'      => 'admin_posts_upsert',
            'admin.promotions.set'    => 'admin_promotions_set',
            'admin.promotions.get'    => 'admin_promotions_get',
            'admin.audit.tail'        => 'admin_audit_tail',
            'admin.broadcast'         => 'admin_broadcast',
            'admin.broadcast.history' => 'admin_broadcast_history',
            'admin.anchor.get'        => 'admin_anchor_get',
            'admin.anchor.set'        => 'admin_anchor_set',
            'admin.anchor.defaults'   => 'admin_anchor_defaults',
            'admin.overview'          => 'admin_overview',
            'admin.dashboard.overview' => 'admin_dashboard_overview',
            'analytics.workspace'      => 'analytics_workspace',
            'analytics.drilldown'      => 'analytics_drilldown',
            // Level 5. Its own op rather than another key on the workspace:
            // it is per-student work over a multi-week window, so it must be
            // fetchable (and cacheable) without paying for it on every load.
            'analytics.growth'         => 'growth_workspace',
            // Comparison, segmentation, rigour and narrative. Its own op for the
            // same reason as growth: it must not be paid for on every load.
            'analytics.depth'          => 'analytics_depth',
            // Level 7 — the analyst panel. Several models, different lenses,
            // different providers, and only what more than one of them reached.
            'analytics.insight'        => 'insight_panel',
            /* Level 7b — the analyst chat. Ask the same panel a question it was
             * not designed for. Reads are cheap; `ask` spends money on every
             * call and is budgeted per admin inside the handler. */
            'analytics.insight.ask'     => 'insight_chat_ask',
            'analytics.insight.threads' => 'insight_chat_threads',
            'analytics.insight.thread'  => 'insight_chat_thread',
            'analytics.insight.archive' => 'insight_chat_archive',
            'analytics.insight.rename'  => 'insight_chat_rename',
            'analytics.insight.report'  => 'insight_chat_report',
            /* The Programme Journal. Writes need the `journal` capability (the
             * journalist role); reads are filtered by the viewer's visibility
             * level inside the handler, which is why the feed and the memories
             * rail are safe to expose without an admin gate. */
            'journal.feed'             => 'journal_feed',
            'journal.memories'         => 'journal_memories',
            'journal.person'           => 'journal_for_person',
            'journal.shared'           => 'journal_shared',
            'journal.save'             => 'journal_entry_save',
            'journal.visibility'       => 'journal_visibility_set',
            'journal.share'            => 'journal_share',
            'journal.delete'           => 'journal_delete',
            // §8c — the Programme record.
            'journal.follow'           => 'journal_follow',
            'journal.updates'          => 'journal_updates',
            'journal.update.add'       => 'journal_update_add',
            'journal.propose'          => 'journal_propose',
            'journal.publish'          => 'journal_publish',
            'analytics.activity.add'   => 'analytics_activity_add',
            'admin.member.detail'     => 'admin_member_detail',
            'admin.mentor.assign'     => 'admin_assign_mentor',
            'admin.applications.list' => 'admin_applications_list',
            'admin.applications.status' => 'admin_applications_set_status',
            'admin.volunteers.list'     => 'admin_volunteers_list',
            'admin.volunteers.approve'  => 'admin_volunteer_approve',
            'admin.volunteers.update'   => 'admin_volunteer_update',
            'admin.volunteers.delete'   => 'admin_volunteer_delete',
            'admin.volunteers.decline'  => 'admin_volunteer_decline',
            'admin.volunteers.safeguard' => 'admin_volunteer_safeguard',
            'admin.volunteers.caps'     => 'admin_volunteer_caps_set',
            'admin.volunteers.needs.list'   => 'admin_volunteer_needs_list',
            'admin.volunteers.needs.upsert' => 'admin_volunteer_need_upsert',
            'admin.volunteers.needs.delete' => 'admin_volunteer_need_delete',
            'admin.items.needs.upsert'      => 'admin_item_needs_upsert',
            'admin.items.needs.delete'      => 'admin_item_needs_delete',
            'admin.hierarchy.list'      => 'admin_hierarchy_list',
            'admin.hierarchy.upsert'    => 'admin_hierarchy_upsert',
            'admin.hierarchy.delete'    => 'admin_hierarchy_delete',
            'admin.vcards.data'         => 'admin_volunteer_cards_data',
            'admin.mcards.data'         => 'admin_mcards_data',
            'admin.id.resend'           => 'admin_id_resend',
            'admin.photo.queue'         => 'admin_photo_queue',
            'admin.photo.claim'         => 'photo_claim',
            'admin.photo.approve'       => 'photo_approve',
            'admin.photo.retake'        => 'photo_request_retake',
            // Children with no photograph on file, and the bulk ask that fixes
            // them. Registrations from before the image store lost their
            // headshot at submit time and cannot be recovered any other way.
            'admin.photos.missing'      => 'admin_photos_missing',
            'admin.photos.requestMissing' => 'admin_photos_request_missing',
            'admin.photo.reject'        => 'photo_reject',
            'admin.photo.edit'          => 'admin_photo_edit',
            'admin.photo.edit.bulk'     => 'admin_photo_edit_bulk',
            'admin.photo.replace'       => 'admin_photo_replace',
            'admin.application.convert' => 'admin_application_convert',
            'admin.application.update'  => 'admin_application_update',
            'admin.application.delete'  => 'admin_application_delete',
            'admin.newsletter.list'   => 'admin_newsletter_list',
            'admin.newsletter.send'   => 'admin_newsletter_send',
            'admin.contact.list'      => 'admin_contact_list',
            'admin.contact.status'    => 'admin_contact_status',
            'admin.contact.reply'     => 'admin_contact_reply',
            'admin.settings.get'      => 'admin_settings_get',
            'admin.settings.set'      => 'admin_settings_set',
            'admin.mail.test'         => 'admin_mail_test',
            'admin.assignments.list'        => 'admin_assignments_list',
            'admin.assignments.upsert'      => 'admin_assignments_upsert',
            'admin.assignments.submissions' => 'admin_assignment_submissions',
            'admin.assignment.grade'        => 'assignment_grade',
            'admin.assignment.return'       => 'assignment_return',
            'admin.event.attendance'        => 'admin_event_attendance',
            // Public (cached by PHP)
            'public.stats'            => 'public_stats',
            'public.status'           => 'public_status',
            'admin.status.pages.get'  => 'admin_status_pages_get',
            'admin.status.pages.set'  => 'admin_status_pages_set',
            'public.leaderboard'      => 'public_leaderboard',
            'public.events'           => 'public_events',
            'public.posts'            => 'public_posts',
            'public.session'          => 'op_public_session',
            'public.anchorContent'    => 'public_anchor_content',
            'public.mentors'          => 'public_mentors',
            'public.summerProfile'    => 'public_summer_profile',
            'public.centres'          => 'public_centres_list',
            'public.centre'           => 'public_centre_page',
            'community.channels'      => 'community_channels',
            'community.feed'          => 'community_feed',
            'community.post.get'      => 'community_post_get',
            'community.files'         => 'community_channel_files',
            'community.post'          => 'community_post_create',
            'community.react'         => 'community_react',
            'community.comments'      => 'community_comments',
            'community.comment'       => 'community_comment_create',
            'community.bookmark'      => 'community_bookmark',
            'community.digest'        => 'community_digest',
            'community.report'        => 'community_report',
            'community.delete'        => 'community_delete',
            'community.showcase'      => 'community_showcase',
            'community.pollVote'      => 'community_poll_vote',
            'community.mentionSearch' => 'community_mention_search',
            'community.markRead'      => 'community_mark_read',
            'community.today'         => 'community_today_counts',
            'community.search'        => 'community_search',
            'community.channelMembers'=> 'community_channel_members',
            'community.star'          => 'community_star',
            'community.login'         => 'community_id_login',
            /* Homework (handoff §11 widget, §12 screen). Nudging is mentor-only
               and rate-limited daily inside the domain, not here — a permission
               enforced in a router is a permission one new endpoint forgets. */
            'community.homework'      => 'community_homework_view',
            'community.homeworkList'  => 'community_homework_list',
            'community.homeworkSet'   => 'community_homework_set',
            'community.homeworkSeen'  => 'community_homework_seen',
            'community.homeworkSubmit'=> 'community_homework_submit',
            'community.homeworkReview'=> 'community_homework_review',
            'community.homeworkNudge' => 'community_homework_nudge',
            /* Typing. A poll, not a socket — shared hosting cannot hold a
               connection open; the cost control is in the domain. */
            'community.typingPing'    => 'community_typing_ping',
            'community.typingStop'    => 'community_typing_stop',
            'community.typingWho'     => 'community_typing_who',
            /* "Mine" — the personal journal (§8a/§8b). Every one of these
               reads and writes the CALLER's own rows only; there is no
               memberId parameter to forge. */
            'journal.mine'            => 'journal_mine',
            'journal.mine.save'       => 'journal_mine_save',
            'journal.mine.mood'       => 'journal_mine_mood',
            'journal.mine.delete'     => 'journal_mine_delete',

            // The Arcade — server-graded mini games. `start` mints a round and
            // ships questions only; the answer key never leaves the server.
            'arcade.home'             => 'arcade_home',
            'arcade.board'            => 'arcade_leaderboard',
            'arcade.start'            => 'arcade_round_start',
            'arcade.submit'           => 'arcade_round_submit',
            // Math Lab: a level ladder from JSS number work to Further Maths.
            'mathlab.board'           => 'mathlab_board',
            'mathlab.start'           => 'mathlab_start',
            'mathlab.submit'          => 'mathlab_submit',
            // Two-player, turn-based. No free-text op exists by design.
            'match.list'              => 'match_list',
            'match.get'               => 'match_get',
            'match.invite'            => 'match_invite',
            'match.respond'           => 'match_respond',
            'match.move'              => 'match_move',
            'match.resign'            => 'match_resign',
            'match.draw'              => 'match_draw',
            'match.react'             => 'match_react',
            'match.report'            => 'match_report',
            'match.staff.list'        => 'match_staff_list',
            'match.poll'              => 'match_poll',
            'match.watch'             => 'match_live_list',
            // After-game review. The analysis runs in the browser; these two
            // only keep the result. See _lib/domain/match-review.php.
            'match.review.get'        => 'match_review_get',
            'match.review.put'        => 'match_review_put',
            'match.review.history'    => 'match_review_history',

            /* Finding a game — design turn 6A. The match ops above PLAY chess;
             * these are the part that comes before a board exists. */
            'chess.players'           => 'chess_players',
            'chess.profile'           => 'chess_profile',
            'chess.challenges'        => 'chess_challenges_list',
            'chess.challenge'         => 'chess_challenge_create',
            'chess.respond'           => 'chess_challenge_respond',
            // Tournaments: centre rounds through to a final.
            'tournament.list'         => 'admin_tournaments_list',
            'tournament.bracket'      => 'tournament_bracket',
            'tournament.mine'         => 'tournament_mine',
            'tournament.create'       => 'admin_tournament_create',
            'tournament.inviteAll'    => 'admin_tournament_invite_all',
            'tournament.enter'        => 'admin_tournament_enter',
            'tournament.browse'       => 'tournament_browse',
            // What is actually happening right now — see tournament_ladder().
            'tournament.ladder'       => 'tournament_ladder',
            'tournament.join'         => 'tournament_join',
            'tournament.leave'        => 'tournament_leave',
            'tournament.standings'    => 'tournament_standings',
            'tournament.rounds'       => 'tournament_rounds',
            'tournament.draw'         => 'tournament_draw_round',
            'tournament.directory'    => 'directory_search',
            'tournament.withdraw'     => 'admin_tournament_withdraw',
            'tournament.advance'      => 'admin_tournament_advance',
            'tournament.replay'       => 'admin_tournament_replay',
            'tournament.cancel'       => 'admin_tournament_cancel',
            'chess.lobby'             => 'chess_lobby_poll',
            'promo.for'               => 'promo_for',
            'promo.track'             => 'promo_track',
            'admin.promos.list'       => 'admin_promos_list',
            'admin.promo.upsert'      => 'admin_promo_upsert',
            'admin.promo.delete'      => 'admin_promo_delete',
            // Quote of the week (domain/wisdom.php).
            'public.qotw.unsubscribe' => 'public_qotw_unsubscribe',
            'public.wisdom.week'      => 'public_wisdom_week',
            'admin.wisdom.list'       => 'admin_wisdom_list',
            'admin.wisdom.upsert'     => 'admin_wisdom_upsert',
            'admin.wisdom.delete'     => 'admin_wisdom_delete',
            'admin.wisdom.move'       => 'admin_wisdom_move',
            'admin.wisdom.voice.generate' => 'admin_wisdom_voice_generate',
            'admin.wisdom.voice.upload'   => 'admin_wisdom_voice_upload',
            'admin.wisdom.voice.clear'    => 'admin_wisdom_voice_clear',
            'admin.wisdom.voice.all'      => 'admin_wisdom_voice_all',
            'admin.wisdom.voice.defaults' => 'admin_wisdom_voice_defaults_set',
            'admin.wisdom.voice.clone'    => 'admin_wisdom_voice_clone',
            'admin.wisdom.voice.clone.delete' => 'admin_wisdom_voice_clone_delete',
            'student.communityLogin'  => 'community_id_login',   // legacy alias
            'admin.community.overview'      => 'admin_community_overview',
            'admin.community.channel.upsert'=> 'admin_community_channel_upsert',
            'admin.community.queue'         => 'admin_community_queue',
            'admin.community.moderation' => 'admin_community_moderation_set',
            'admin.community.moderate'      => 'admin_community_moderate',
            'admin.community.safeguarding'     => 'admin_community_safeguarding',
            'admin.community.safeguarding.ack' => 'admin_community_safeguarding_ack',
            'public.newsletter'       => 'public_newsletter',
            'public.newsletter.unsubscribe' => 'public_newsletter_unsubscribe',
            'public.application.status' => 'public_application_status',
            'public.post.engagement'  => 'public_post_engagement',
            'post.react'              => 'post_react',
            'post.comment'            => 'post_comment_create',
            'admin.comments.list'     => 'admin_comments_list',
            'admin.comments.moderate' => 'admin_comment_moderate',
            'public.donate.init'      => 'public_donate_init',
            'admin.donations.list'    => 'admin_donations_list',
            'admin.members.caps'      => 'admin_member_caps_set',
            'public.apply'            => 'public_apply',
            'public.volunteer.context' => 'public_volunteer_context',
            'public.volunteer.status'  => 'public_volunteer_status',
            'public.cert'             => 'public_cert',
            'public.siteContent'      => 'public_site_content',
            'public.instructorRoster' => 'public_instructor_roster',
            // Self-registration: the public link, and the desk that checks it.
            'selfreg.context'         => 'selfreg_context',
            'selfreg.submit'          => 'selfreg_submit',
            'selfreg.queue'           => 'selfreg_queue',
            // Open/close the public sign-up link. A different act from revoking
            // the gate: revoking kills the URL, closing keeps it working and
            // tells the family where to go instead.
            'admin.selfreg.state'     => 'admin_selfreg_state',
            'admin.selfreg.setOpen'   => 'admin_selfreg_set_open',
            'selfreg.approve'         => 'selfreg_approve',
            'selfreg.approveBulk'     => 'selfreg_approve_bulk',
            'selfreg.reject'          => 'selfreg_reject',
            'public.contact'          => 'public_contact',
        ];
    }

    if (!isset($map[$op])) {
        return ['ok' => false, 'error' => 'unknown_op', 'detail' => $op];
    }
    $fn = $map[$op];
    try {
        /* A club admin's sensitive actions are queued for a second admin
           instead of run (domain/approvals.php). Here, at the one seam every
           op passes through, so no screen can reach one around the queue. */
        if (function_exists('approval_intercept') && ($queued = approval_intercept($op, $args)) !== null) return $queued;
        /* Intake writes are idempotent when the client supplies a submissionId.
         *
         * Declared here, in one place, rather than wrapped inside each of the
         * five handlers: this is the single seam every op already passes
         * through, so an intake path cannot be given a retry-safe client and
         * quietly miss the server half. Anything not on this list behaves
         * exactly as before, and so does any request without a submissionId.
         *
         * Only ops that CREATE a person or a message belong here. A read is
         * already idempotent, and an admin action has a human watching it. */
        static $intakeOps = [
            'gate.register'  => 1,   // staff desk registration
            'selfreg.submit' => 1,   // the public sign-up link
            'public.apply'   => 1,   // teen + volunteer intake
            'public.contact' => 1,   // notifies admins on every send
            'reshoot.submit' => 1,   // guardian photo re-take
        ];
        if (isset($intakeOps[$op]) && function_exists('intake_once')) {
            $res = intake_once((string)($args['submissionId'] ?? ''), $op, fn() => $fn($args));
        } else {
            $res = $fn($args);
        }
        if (!is_array($res)) return ['ok' => false, 'error' => 'bad_handler'];
        if (!isset($res['ok'])) $res['ok'] = true;
        return $res;
    } catch (Throwable $e) {
        global $CONFIG;
        error_log('[backend_dispatch] op=' . $op . ' err=' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
        /* Also into the operations journal. The log file is correct and
         * unreadable — nobody running a youth programme is going to SSH in and
         * tail it, so the first report of a broken endpoint came from a centre
         * phoning to say the desk was down. */
        if (function_exists('ops_record')) {
            ops_record('error', $op, $e->getMessage(), basename($e->getFile()) . ':' . $e->getLine());
        }
        /* Staff ops say what broke. They are reached only through require_admin
           routes, and "internal" alone left a live failure undiagnosable from the
           console — the member editor's photo overflow was one. Public and member
           ops still say nothing beyond the code. */
        $staffOp = strncmp($op, 'admin.', 6) === 0;
        return ['ok' => false, 'error' => 'internal', 'detail' => (!empty($CONFIG['debug']) || $staffOp)
            ? 'The server could not finish this: ' . $e->getMessage() : null];
    }
}
