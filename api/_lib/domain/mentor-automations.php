<?php
declare(strict_types=1);
/**
 * Mentor Portal background jobs (design handoff: AUTOMATIONS.md).
 *
 * Mentors never see a job list. They see the result: a row in This week › Due
 * now, a prefilled Saturday, a family draft waiting, a reminder. The NGG admin
 * sees and tunes every job in Control Room › Settings › Mentorship automations.
 *
 * THERE IS NO CRON ON SHARED HOSTING. The web-cron tick calls mpa_tick(), which
 * asks each job one question: has the most recent time its schedule names
 * (Africa/Lagos) passed since its last logged run? If so it runs once. A
 * deployment nobody visits overnight catches up on the next visit, and a job
 * whose slot is more than a day stale is skipped rather than replayed, so a
 * week offline does not wake to a week of reminders.
 *
 * EVERY JOB RECONCILES. It computes the nudges that should be open now, opens
 * the new ones (idempotent per job, subject and window — the nudge key) and
 * closes its own open nudges whose condition no longer holds. Running a job
 * twice changes nothing; running it after the mentor acted clears the row.
 *
 * Pushes batch into ONE notification per mentor per run and never go in quiet
 * hours (8pm–8am Lagos); the nudge waits in Due now regardless.
 */

/**
 * The job table (code/mt-automations.js). cron fields are minute hour
 * day-of-month month day-of-week in Lagos time; `L-3` is three days before the
 * month's end. locked = an admin cannot switch it off; its thresholds and time
 * stay tunable. `due` = the nudges it writes appear in Due now (the rest are
 * covered there by a live rule, and the nudge serves the digest and the log).
 */
const MPA_JOBS = [
    'goalSchedule'     => ['on' => 'goal.activated',       'locked' => true,  'label' => 'Goal check-in schedule', 'effect' => 'Schedules a check-in every 14 days and reminders before the review date; cancelled when the goal leaves Active.', 'cat' => 'goals', 'trigger' => 'A goal is made active', 'if' => '—', 'then' => ['Schedule a check-in reminder every {goalCheckDays} days', 'Remind 7 days before and on the review date'], 'uses' => ['goalCheckDays']],
    'goalAchieved'     => ['on' => 'goal.check(5)',         'locked' => true,  'label' => 'Goal achieved',          'effect' => 'A check-in of 5 marks the goal Achieved and tells the member.', 'cat' => 'goals', 'trigger' => 'A goal check-in of 5 is added', 'if' => 'The goal is active', 'then' => ['Mark the goal Achieved', 'Tell the member', 'Add it to their growth passport'], 'uses' => []],
    'sessionFollowUp'  => ['on' => 'session.created(next)', 'locked' => false, 'label' => 'Session follow-up',      'effect' => 'A session with a next step becomes a follow-up for the next Saturday.', 'due' => true, 'cat' => 'contact', 'trigger' => 'A session is logged with a next step', 'if' => '—', 'then' => ['Add a follow-up to Due now for the next Saturday'], 'uses' => []],
    'relChildSide'     => ['on' => 'rel.saved',             'locked' => true,  'label' => 'Child’s side of the check','effect' => 'Asks the child their side in the member portal.', 'cat' => 'relationship', 'trigger' => 'A mentor saves their relationship check', 'if' => '—', 'then' => ['Ask the child their side in the member portal'], 'uses' => []],
    'registerSync'     => ['on' => 'register.closed',       'locked' => true,  'label' => 'Register sync',          'effect' => 'Copies Saturday attendance to the centre record.', 'cat' => 'saturday', 'trigger' => 'The Saturday register is closed', 'if' => '—', 'then' => ['Copy attendance to the centre record'], 'uses' => []],
    'concernRoute'     => ['on' => 'concern.created',       'locked' => true,  'label' => 'Concern routing',        'effect' => 'Tells the safeguarding officer at once and opens a case.', 'cat' => 'safety', 'trigger' => 'A concern is reported', 'if' => '—', 'then' => ['Tell the safeguarding officer by email and SMS', 'Open a case in the Control Room'], 'uses' => []],
    'wellbeingAlert'   => ['on' => 'checkin(!Okay)',        'locked' => true,  'label' => 'Wellbeing alert',        'effect' => 'Tells the mentor, and the safeguarding lead on “Need help”.', 'cat' => 'safety', 'trigger' => 'A member’s weekly check-in is not Okay', 'if' => '—', 'then' => ['Put it at the top of the mentor’s Due now', 'Push to the mentor', 'Email the safeguarding lead on “Need help”'], 'uses' => []],

    'pickOneToOnes'    => ['cron' => '0 18 * * 4',  'locked' => false, 'label' => 'Pick Saturday one-to-ones', 'effect' => 'Adds the three mentees with the longest gap to Saturday › Before.', 'cat' => 'saturday', 'trigger' => 'Every Thursday', 'if' => 'The mentor hasn’t chosen Saturday’s one-to-ones', 'then' => ['Pick the 3 mentees longest since a one-to-one'], 'uses' => []],
    'reviewReminder'   => ['cron' => '0 18 * * 0',  'locked' => false, 'label' => 'Review reminder',         'effect' => 'One reminder listing the weekly reviews still open.', 'cat' => 'saturday', 'trigger' => 'Every Sunday', 'if' => 'Weekly reviews from Saturday are still open', 'then' => ['Remind the mentor once, listing who'], 'uses' => []],
    'reviewOverdue'    => ['cron' => '0 9 * * 2',   'locked' => true,  'label' => 'Reviews overdue',         'effect' => 'Tells the lead which mentors have reviews open on Tuesday.', 'cat' => 'lead', 'trigger' => 'Every Tuesday', 'if' => 'Weekly reviews are still open', 'then' => ['Tell the lead mentor', 'Commitment 5 at risk'], 'uses' => []],
    'overdueOneToOne'  => ['cron' => '0 7 * * *',   'locked' => true,  'label' => 'One-to-one overdue',      'effect' => 'Flags mentees not seen one-to-one for longer than the threshold.', 'cat' => 'contact', 'trigger' => 'Every day', 'if' => 'No one-to-one for more than {overdueDays} days', 'then' => ['Add to Due now', 'Raise in Saturday’s picks'], 'uses' => ['overdueDays']],
    'goalCheckDue'     => ['cron' => '0 7 * * *',   'locked' => false, 'label' => 'Goal check-in due',       'effect' => 'Asks the member “How close are you now?” and reminds the mentor.', 'due' => true, 'cat' => 'goals', 'trigger' => 'Every day', 'if' => 'An active goal has had no check-in for {goalCheckDays} days', 'then' => ['Ask the member “How close are you now?”', 'Add to the mentor’s Due now'], 'uses' => ['goalCheckDays']],
    'goalStalled'      => ['cron' => '0 9 * * 1',   'locked' => false, 'label' => 'Goal stalled',            'effect' => 'Nudges the member on a stalled goal.', 'cat' => 'goals', 'trigger' => 'Every Monday', 'if' => 'A goal has no check-in for {stalledDays} days, or no movement', 'then' => ['Nudge the member'], 'uses' => ['stalledDays']],
    'goalReviewDate'   => ['cron' => '0 7 * * *',   'locked' => false, 'label' => 'Goal review date',        'effect' => 'Reminds the mentor 7 days before and on a goal’s review date.', 'due' => true, 'cat' => 'goals', 'trigger' => 'Every day', 'if' => 'A goal’s review date is 7 days away or today', 'then' => ['Remind the mentor'], 'uses' => []],
    'noGoalAfterWeek3' => ['cron' => '0 9 * * 1',   'locked' => false, 'label' => 'No goal after week 3',    'effect' => 'Reminds the mentor to set a goal with a mentee who has none.', 'due' => true, 'cat' => 'goals', 'trigger' => 'Every Monday', 'if' => 'A mentee is past week 3 with no active goal', 'then' => ['Remind the mentor: “Set a goal with …”'], 'uses' => []],
    'scorecardDue'     => ['cron' => '0 8 1 * *',   'locked' => false, 'label' => 'Scorecard due',           'effect' => 'Reminds the mentor to score last month’s Leadership Index.', 'due' => true, 'cat' => 'scorecard', 'trigger' => 'The 1st of each month', 'if' => 'A mentee has no Leadership Index for last month', 'then' => ['Remind the mentor', 'Add to Due now'], 'uses' => []],
    'scorecardLock'    => ['cron' => '0 0 8 * *',   'locked' => true,  'label' => 'Scorecard lock',          'effect' => 'Locks last month’s scorecards.', 'cat' => 'scorecard', 'trigger' => 'Monthly, on day {scorecardLockDay}', 'if' => '—', 'then' => ['Lock last month’s scorecards'], 'uses' => ['scorecardLockDay']],
    'relCheckDue'      => ['cron' => '0 7 * * *',   'locked' => true,  'label' => 'Relationship check due',  'effect' => 'Asks the child their side every 6 weeks and reminds the mentor.', 'cat' => 'relationship', 'trigger' => 'Every day', 'if' => '{relWeeks} weeks since the last relationship check', 'then' => ['Ask the child their side', 'Remind the mentor'], 'uses' => ['relWeeks', 'relGap', 'relLow']],
    'familyDraft'      => ['cron' => '0 7 1 * *',   'locked' => false, 'label' => 'Family update drafts',    'effect' => 'Drafts one update per family from observations and goals. Never sends.', 'due' => true, 'cat' => 'family', 'trigger' => 'The 1st of each month', 'if' => 'The mentor is not a peer mentor', 'then' => ['Draft one update per family from the month’s observations', 'Never sends'], 'uses' => []],
    'familyOverdue'    => ['cron' => '0 7 * * *',   'locked' => false, 'label' => 'Family update overdue',   'effect' => 'Flags families with no update for longer than the threshold.', 'cat' => 'family', 'trigger' => 'Every day', 'if' => 'No family update for more than {familyDays} days', 'then' => ['Add to Due now', 'Commitment 8 at risk'], 'uses' => ['familyDays']],
    'journalReply'     => ['cron' => '0 7 * * *',   'locked' => false, 'label' => 'Journal reply',           'effect' => 'Reminds the mentor of shared journal entries unanswered for 5 days.', 'due' => true, 'cat' => 'contact', 'trigger' => 'Every day', 'if' => 'A shared journal entry is unanswered for 5 days', 'then' => ['Remind the mentor', 'At 7 days, commitment 6 at risk'], 'uses' => []],
    'supervisionPrep'  => ['cron' => '0 8 * * 1',   'locked' => false, 'label' => 'Supervision prep',        'effect' => 'Sends the month’s numbers ahead of supervision this week.', 'due' => true, 'cat' => 'lead', 'trigger' => 'Every Monday', 'if' => 'Supervision is booked this week', 'then' => ['Send the mentor the month’s numbers'], 'uses' => []],
    'prepSession'      => ['cron' => '0 16 * * *',  'locked' => false, 'label' => 'Preparation Session',     'effect' => 'Reminds mentors of the Mentor Preparation Session, 7–8pm, on its day.', 'cat' => 'commitments', 'trigger' => 'Daily, on the session day', 'if' => 'Today is the Preparation Session day', 'then' => ['Remind mentors: 7:00–8:00pm'], 'uses' => ['prepDay']],
    'stsMeeting'       => ['cron' => '0 8 * * 2',   'locked' => false, 'label' => 'STS meeting',             'effect' => 'Reminds mentors of Tuesday’s STS meeting.', 'cat' => 'commitments', 'trigger' => 'Every Tuesday', 'if' => '—', 'then' => ['Remind mentors of the STS meeting'], 'uses' => []],
    'cimcTraining'     => ['cron' => '0 18 * * 5',  'locked' => false, 'label' => 'CIMC training',           'effect' => 'Reminds mentors who have not finished CIMC of Saturday 7:00am.', 'cat' => 'commitments', 'trigger' => 'Every Friday', 'if' => 'The mentor hasn’t finished CIMC', 'then' => ['Remind them of Saturday 7:00am'], 'uses' => []],
    'twiceMonthly'     => ['cron' => '0 9 15,L-3 * *', 'locked' => true, 'label' => 'Twice a month',         'effect' => 'Reminds a mentor who has mentored fewer than two Saturdays this month.', 'due' => true, 'cat' => 'commitments', 'trigger' => 'The 15th and 3 days before month end', 'if' => 'Fewer than {minSaturdays} Saturdays mentored this month', 'then' => ['Remind the mentor', 'Add to Due now'], 'uses' => ['minSaturdays']],
    'caseloadCheck'    => ['cron' => '0 6 1 * *',   'locked' => true,  'label' => 'Caseload check',          'effect' => 'Tells the lead about mentors below the minimum caseload.', 'cat' => 'lead', 'trigger' => 'The 1st of each month', 'if' => 'A mentor has fewer than {minCaseload} children (not peers)', 'then' => ['Tell the lead mentor'], 'uses' => ['minCaseload']],
    'retreatBooking'   => ['cron' => '0 9 * * *',   'locked' => false, 'label' => 'Retreat booking',         'effect' => 'Reminds mentors not booked for a retreat 30 days out.', 'due' => true, 'cat' => 'commitments', 'trigger' => 'Every day', 'if' => 'A retreat is within 30 days and the mentor hasn’t booked', 'then' => ['Remind the mentor', 'Add to Due now'], 'uses' => []],
    'academyRenewal'   => ['cron' => '0 7 * * *',   'locked' => true,  'label' => 'Academy renewal',         'effect' => 'Reminds mentors of a required module expiring within 30 days.', 'due' => true, 'cat' => 'commitments', 'trigger' => 'Every day', 'if' => 'A required module expires within 30 days', 'then' => ['Remind the mentor', 'Show on the Academy badge'], 'uses' => []],
    'commitmentsRecalc'=> ['cron' => '0 2 * * *',   'locked' => true,  'label' => 'Commitments',             'effect' => 'Recomputes the 12 commitments for every mentor.', 'cat' => 'commitments', 'trigger' => 'Every night', 'if' => '—', 'then' => ['Recompute the 12 commitments for every mentor'], 'uses' => []],
    // Beyond the handoff: the member's side, drift, outcomes, gaps, and safeguarding escalation.
    'memberCheckinPrompt' => ['cron' => '0 17 * * 0', 'locked' => false, 'label' => 'Weekly check-in prompt', 'effect' => 'Asks members with a mentor how their week was.', 'cat' => 'safety', 'trigger' => 'Every Sunday', 'if' => 'The member has a mentor and hasn’t checked in this week', 'then' => ['Ask them “How has your week been?” in the member portal'], 'uses' => []],
    'checkinSilence'   => ['cron' => '0 9 * * 1',   'locked' => false, 'label' => 'Silent mentee', 'effect' => 'Tells the mentor when a mentee has stopped checking in.', 'due' => true, 'cat' => 'safety', 'trigger' => 'Every Monday', 'if' => 'No weekly check-in for {checkinSilenceWeeks} weeks', 'then' => ['Add to the mentor’s Due now: “Ask how they are”'], 'uses' => ['checkinSilenceWeeks']],
    'missedSaturdays'  => ['cron' => '0 8 * * 1',   'locked' => true,  'label' => 'Missed Saturdays', 'effect' => 'Tells the mentor when a mentee has missed Saturdays the centre met.', 'due' => true, 'cat' => 'contact', 'trigger' => 'Every Monday', 'if' => 'Missed the last {absentSaturdays} Saturdays the centre met', 'then' => ['Add to the mentor’s Due now: “Call them this week”'], 'uses' => ['absentSaturdays']],
    'birthday'         => ['cron' => '0 7 * * *',   'locked' => false, 'label' => 'Birthdays', 'effect' => 'Reminds the mentor of a mentee’s birthday.', 'due' => true, 'cat' => 'contact', 'trigger' => 'Every day', 'if' => 'It is a mentee’s birthday', 'then' => ['Add to the mentor’s Due now'], 'uses' => []],
    'mentorQuiet'      => ['cron' => '0 9 * * 1',   'locked' => true,  'label' => 'Quiet mentor', 'effect' => 'Tells the lead when a mentor has logged nothing for a while.', 'cat' => 'lead', 'trigger' => 'Every Monday', 'if' => 'A mentor with mentees has logged no session for {mentorQuietDays} days', 'then' => ['Tell their lead mentor', 'Push the mentor once'], 'uses' => ['mentorQuietDays']],
    'supervisionGap'   => ['cron' => '0 9 * * 1',   'locked' => false, 'label' => 'Supervision gap', 'effect' => 'Tells the lead when a mentor has not been supervised for a while.', 'cat' => 'lead', 'trigger' => 'Every Monday', 'if' => 'No supervision for {supervisionDays} days', 'then' => ['Tell their lead mentor: “Book supervision”'], 'uses' => ['supervisionDays']],
    'scoreDrop'        => ['cron' => '0 8 2 * *',   'locked' => false, 'label' => 'Leadership Index drop', 'effect' => 'Flags a sharp fall in a mentee’s Leadership Index.', 'due' => true, 'cat' => 'scorecard', 'trigger' => 'The 2nd of each month', 'if' => 'A mentee’s total fell by {scoreDrop} or more since the month before', 'then' => ['Add to the mentor’s Due now', 'Tell their lead mentor'], 'uses' => ['scoreDrop']],
    'relLowTwice'      => ['cron' => '0 8 * * 1',   'locked' => true,  'label' => 'Relationship low twice', 'effect' => 'Raises a relationship rated low two checks running.', 'cat' => 'relationship', 'trigger' => 'Every Monday', 'if' => 'The child rated it low in two checks running', 'then' => ['Tell the lead mentor: “Talk about fit”'], 'uses' => []],
    'unmatched'        => ['cron' => '0 8 * * 1',   'locked' => true,  'label' => 'No mentor yet', 'effect' => 'Tells the centre’s lead about members waiting for a mentor.', 'cat' => 'lead', 'trigger' => 'Every Monday', 'if' => 'An NGG member has been without a mentor for {unmatchedDays} days', 'then' => ['Tell the centre’s lead mentor, one list per centre'], 'uses' => ['unmatchedDays']],
    'concernEscalate'  => ['cron' => '0 * * * *',   'locked' => true,  'label' => 'Unopened concern', 'effect' => 'Escalates a safeguarding concern nobody has opened.', 'cat' => 'safety', 'trigger' => 'Every hour', 'if' => 'A concern is still unopened after {concernHours} hours', 'then' => ['Email the officer again', 'Email every admin who holds safeguarding', 'Record it in Diagnostics'], 'uses' => ['concernHours']],
    'leadDigest'       => ['cron' => '0 17 * * 5',  'locked' => true,  'label' => 'Lead digest',             'effect' => 'Sends each lead the week: mentors below standard, reviews missing, concerns.', 'cat' => 'lead', 'trigger' => 'Every Friday', 'if' => 'The person is a lead mentor', 'then' => ['Email and push the week: below standard, reviews missing, open concerns'], 'uses' => []],
];
/** Thresholds the admin tunes, with the floor and ceiling each may take. */
/** How the panel groups the automations, in order. */
const MPA_CATEGORIES = ['safety' => ['Safety and wellbeing', 'shield-check'], 'contact' => ['Contact', 'chats-circle'], 'goals' => ['Goals', 'target'],
    'relationship' => ['Relationship', 'handshake'], 'saturday' => ['Saturday', 'calendar-check'], 'scorecard' => ['Leadership Index', 'chart-bar'],
    'family' => ['Family', 'house-line'], 'commitments' => ['Commitments', 'list-checks'], 'lead' => ['Lead mentors', 'chalkboard-teacher']];
const MPA_THRESHOLDS = [
    'overdueDays' => [7, 42, 'One-to-one overdue after (days)'], 'stalledDays' => [7, 60, 'Goal stalled after (days)'],
    'goalCheckDays' => [7, 42, 'Goal check-in every (days)'], 'familyDays' => [14, 90, 'Family update due after (days)'],
    'relWeeks' => [3, 12, 'Relationship check every (weeks)'], 'scorecardLockDay' => [3, 20, 'Scorecards lock on day'],
    'minCaseload' => [1, 12, 'Minimum caseload'], 'minSaturdays' => [1, 4, 'Saturdays mentored each month'],
    'relGap' => [1, 4, 'Relationship gap that flags'], 'relLow' => [1, 4, 'Relationship score that flags'],
    'prepDay' => [0, 6, 'Preparation Session day (0 = Sunday)'],
    'checkinSilenceWeeks' => [2, 8, 'Silent after (weeks)'], 'absentSaturdays' => [1, 6, 'Missed Saturdays that flag'],
    'mentorQuietDays' => [7, 60, 'Mentor quiet after (days)'], 'unmatchedDays' => [7, 120, 'Without a mentor after (days)'],
    'scoreDrop' => [3, 40, 'Index drop that flags (points)'], 'supervisionDays' => [14, 120, 'Supervision due after (days)'],
    'concernHours' => [2, 72, 'Escalate an unopened concern after (hours)'],
];

/**
 * Jobs whose only output is a screen that no longer exists.
 *
 * The v14 Mentor Portal was withdrawn on 2026-10-13 and the older MentorPortal
 * restored; it reads no nudges. These jobs wrote "Due now" rows nobody can see,
 * family drafts for a Family tab that is gone, nightly commitments nobody
 * reads — and pushed mentors (and, for goal check-ins, children) about work
 * with nowhere to do it. A push that leads nowhere teaches people to ignore the
 * next one. So they are paused in code, locked or not, until the portal that
 * shows them returns: `portalLive` in the automation settings turns them back
 * on in one place. Jobs whose result is still real stay on — the child's
 * relationship check (relCheckDue: the dashboard asks from its nudge), the
 * lead's queue in the Control Room, safeguarding, the reminders of meetings
 * that happen in a room, and the review reminder (the restored portal has the
 * weekly review).
 */
const MPA_NEEDS_PORTAL = ['pickOneToOnes', 'sessionFollowUp', 'goalCheckDue', 'goalStalled', 'noGoalAfterWeek3', 'scorecardDue',
    'scoreDrop', 'familyDraft', 'familyOverdue', 'journalReply', 'supervisionPrep', 'retreatBooking', 'academyRenewal',
    'twiceMonthly', 'commitmentsRecalc', 'checkinSilence', 'missedSaturdays', 'birthday'];
function mpa_portal_live(): bool { return !empty(mpa_settings()['portalLive']); }
function mpa_paused_reason(string $key): string {
    return in_array($key, MPA_NEEDS_PORTAL, true) && !mpa_portal_live()
        ? 'Paused: what it makes is shown only in the Mentor Portal v14 screens, which are withdrawn.' : '';
}

/* ── Settings ───────────────────────────────────────────────────────────── */

function mpa_settings(): array {
    $s = setting_get('mentor_automation');
    return is_array($s) ? $s + ['jobs' => [], 'thresholds' => [], 'centresOff' => []] : ['jobs' => [], 'thresholds' => [], 'centresOff' => []];
}
function mpa_job_on(string $key, string $centre = ''): bool {
    $j = MPA_JOBS[$key] ?? null;
    if (!$j) return false;
    if (mpa_paused_reason($key) !== '') return false;
    if (!empty($j['locked'])) return true;
    $s = mpa_settings();
    if (isset($s['jobs'][$key]['on']) && !$s['jobs'][$key]['on']) return false;
    return $centre === '' || !in_array($centre, (array)($s['centresOff'][$key] ?? []), true);
}
function mpa_job_cron(string $key): string {
    $cron = (string)(MPA_JOBS[$key]['cron'] ?? '');
    $h = mpa_settings()['jobs'][$key]['hour'] ?? null;
    if ($cron !== '' && is_numeric($h) && (int)$h >= 0 && (int)$h <= 23) { $f = explode(' ', $cron); $f[1] = (string)(int)$h; $cron = implode(' ', $f); }
    /* The lock runs on the day the setting names. The cron said day 8 whatever
     * the setting said, so raising scorecardLockDay to 15 had the screen say
     * "locks on the 15th" while the job locked on the 8th. */
    if ($key === 'scorecardLock' && $cron !== '') {
        $f = explode(' ', $cron);
        $f[2] = (string)max(1, min(28, (int)(mp_opts()['scorecardLockDay'] ?? 8)));
        $cron = implode(' ', $f);
    }
    return $cron;
}
function mpa_prep_day(): int { $t = mpa_settings()['thresholds']['prepDay'] ?? 3; return is_numeric($t) ? max(0, min(6, (int)$t)) : 3; }

/* ── The scheduler ──────────────────────────────────────────────────────── */

/** Does one cron field match a value? `*`, a number, a comma list, and `L-n` for day-of-month. */
function mpa_cron_field(string $f, int $v, int $monthDays = 31): bool {
    if ($f === '*') return true;
    foreach (explode(',', $f) as $part) {
        if (preg_match('/^L-(\d+)$/', $part, $m)) { if ($v === $monthDays - (int)$m[1]) return true; continue; }
        if (ctype_digit($part) && (int)$part === $v) return true;
    }
    return false;
}
/** The most recent hour (unix, on the hour, Lagos) the cron names, looking back at most $back hours. */
function mpa_last_fire(string $cron, int $now, int $back = 24 * 35): ?int {
    $f = preg_split('/\s+/', trim($cron));
    if (count($f) !== 5) return null;
    $lagos = $now + 3600;
    $t = $lagos - ($lagos % 3600);
    for ($i = 0; $i <= $back; $i++, $t -= 3600) {
        $d = (int)gmdate('j', $t); $md = (int)gmdate('t', $t);
        if (mpa_cron_field($f[1], (int)gmdate('G', $t)) && mpa_cron_field($f[2], $d, $md) && mpa_cron_field($f[3], (int)gmdate('n', $t)) && mpa_cron_field($f[4], (int)gmdate('w', $t))) {
            return $t - 3600 + (int)$f[0] * 60;   // back to UTC
        }
    }
    return null;
}
function mpa_last_run(string $key): string { return (string)(db_row('SELECT ranAt FROM mentor_job_log WHERE job = ? ORDER BY ranAt DESC LIMIT 1', [$key])['ranAt'] ?? ''); }

/**
 * The web-cron entry point. Runs every scheduled job whose slot has come and
 * not been served; a slot older than a day is let go. Bounded: at most $max
 * jobs per tick so a cold start does not hold one request for all of them.
 */
function mpa_tick(?int $now = null, int $max = 6): array {
    $now = $now ?? time();
    $ran = [];
    if (function_exists('mp_family_flush')) mp_family_flush();
    // The Saturday Formation Schedule's reminders and family messages (idempotent per day, block and person).
    if (function_exists('sf_tick')) { try { sf_tick($now); } catch (\Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'formation.tick', $e->getMessage(), ''); } }
    mpa_push_release($now);
    // Duty reminders: one email a day to anyone with something open (domain/duties.php), in batches.
    if (function_exists('duties_tick')) { try { duties_tick($now); } catch (\Throwable $e) { if (function_exists('ops_record')) ops_record('error', 'duties.tick', $e->getMessage(), ''); } }
    // Housekeeping the week view used to do inside a GET: close follow-ups whose Saturday has passed.
    if (defined('MP_FOLLOWUP_STALE_DAYS')) {
        db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ?, resolvedBy = 'expired' WHERE status = 'open' AND rule = 'J:sessionFollowUp' AND createdAt < ?",
                [gmdate('c', $now), gmdate('Y-m-d', $now - MP_FOLLOWUP_STALE_DAYS * 86400)]);
    }
    /* Safety first. The tick runs at most $max jobs, in table order, and the
     * hourly concern escalation sat near the end — so a Monday-morning backlog
     * could push it into a later tick. It goes first. */
    $order = array_merge(['concernEscalate' => MPA_JOBS['concernEscalate']], MPA_JOBS);
    foreach ($order as $key => $j) {
        if (count($ran) >= $max) break;
        if (empty($j['cron']) || !mpa_job_on($key)) continue;
        $fire = mpa_last_fire(mpa_job_cron($key), $now);
        if ($fire === null || $now - $fire > 86400) continue;
        $last = mpa_last_run($key);
        if ($last !== '' && strtotime($last) >= $fire) continue;
        $ran[$key] = mpa_run($key, $now);
    }
    return $ran;
}

/** Run one job now, log it, and send the batched pushes. */
function mpa_run(string $key, ?int $now = null): array {
    if (!isset(MPA_JOBS[$key]) || !function_exists('mpa_job_' . $key)) return ['ok' => false, 'error' => 'unknown_job'];
    $now = $now ?? time();
    $GLOBALS['__mpa_push'] = [];
    $GLOBALS['__mpa_orphans'] = [];
    $ctx = mpa_context($now);
    $res = ['found' => 0, 'detail' => ''];
    try { $res = array_merge($res, (array)call_user_func('mpa_job_' . $key, $ctx)); }
    catch (\Throwable $e) { $res = ['found' => 0, 'detail' => 'failed: ' . mb_substr($e->getMessage(), 0, 200)]; }
    $sent = mpa_push_flush($key, $now);
    /* A lead nudge with no lead to receive it was written with an empty
     * mentorId — seen by nobody, counted as found. It is reported instead. */
    $orphans = count(array_unique($GLOBALS['__mpa_orphans'] ?? []));
    if ($orphans) {
        $res['detail'] = (string)$res['detail'] . ' · ' . $orphans . ' with no lead mentor to tell';
        if (function_exists('ops_record')) ops_record('warn', 'mentor.nolead', 'A mentor job had no lead mentor to tell', $key . ': ' . $orphans);
    }
    $heldN = (int)($GLOBALS['__mpa_heldn'] ?? 0); $GLOBALS['__mpa_heldn'] = 0;
    if ($heldN) $res['detail'] = (string)$res['detail'] . ' · ' . $heldN . ' held for 8am (quiet hours)';
    db_insert('mentor_job_log', ['job' => $key, 'ranAt' => gmdate('Y-m-d\TH:i:s\Z', $now), 'found' => (int)$res['found'], 'detail' => mb_substr((string)$res['detail'] . ($sent ? ' · ' . $sent . ' notified' : ''), 0, 500)]);
    return ['ok' => true, 'found' => (int)$res['found'], 'detail' => (string)$res['detail'], 'notified' => $sent];
}

/**
 * What every job reads, in a fixed number of queries: the active NGG mentors,
 * each one's mentees (one grouped read) and those mentees' rows (mp_mentees,
 * itself grouped). Jobs filter this; none of them queries per mentor.
 */
function mpa_context(int $now): array {
    $today = gmdate('Y-m-d', $now + 3600);
    $o = mp_opts();
    $mentors = [];
    foreach (db_all("SELECT * FROM mentors WHERE status = 'active' AND programme IN ('ngg','both')") as $m) $mentors[(string)$m['mentorId']] = $m;
    $kids = [];
    if ($mentors) {
        $ph = implode(',', array_fill(0, count($mentors), '?'));
        foreach (db_all("SELECT mentorId, memberId FROM mentor_assignments WHERE status = 'active' AND mentorId IN ($ph)", array_keys($mentors)) as $r) $kids[(string)$r['mentorId']][] = (string)$r['memberId'];
    }
    $all = array_values(array_unique(array_merge([], ...array_values($kids ?: [[]]))));
    $rows = [];
    foreach (($all ? mp_mentees($all, 'pod', $today, $o) : []) as $r) $rows[$r['id']] = $r;
    $roles = [];
    foreach ($mentors as $id => $m) $roles[$id] = mp_role(['role' => 'mentor', 'rank' => (string)$m['rank']], $m);
    return ['now' => $now, 'today' => $today, 'o' => $o, 'mentors' => $mentors, 'kids' => $kids, 'rows' => $rows, 'roles' => $roles];
}
/** One mentor's mentee rows. */
function mpa_rows(array $ctx, string $mentorId): array {
    return array_values(array_filter(array_map(static fn($id) => $ctx['rows'][$id] ?? null, $ctx['kids'][$mentorId] ?? [])));
}
/** The lead a mentor reports to (named, or the centre's lead). */
function mpa_lead_of(array $ctx, array $m): ?array {
    if (trim((string)($m['leadId'] ?? '')) !== '' && isset($ctx['mentors'][$m['leadId']])) return $ctx['mentors'][$m['leadId']];
    foreach ($ctx['mentors'] as $x) if ((string)$x['rank'] === 'lead' && (string)$x['centre'] === (string)$m['centre'] && $x['mentorId'] !== $m['mentorId']) return $x;
    return null;
}

/**
 * Reconcile one job's nudges: open the wanted ones (key => fields), close the
 * job's own open nudges that are no longer wanted. Returns how many are open.
 */
function mpa_reconcile(string $job, array $want, string $closeScope = ''): int {
    $rule = 'J:' . $job;
    foreach ($want as $key => $f) ms_nudge($key, $rule, $f + ['audience' => 'mentor']);
    $open = db_all("SELECT id, nudgeKey FROM mentor_nudges WHERE status = 'open' AND rule = ?" . ($closeScope !== '' ? ' AND nudgeKey LIKE ?' : ''), $closeScope !== '' ? [$rule, $closeScope . '%'] : [$rule]);
    $stale = array_values(array_filter($open, static fn($n) => !isset($want[$n['nudgeKey']])));
    if ($stale) {
        $ph = implode(',', array_fill(0, count($stale), '?'));
        db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ?, resolvedBy = 'job' WHERE id IN ($ph)", array_merge([now_iso()], array_map(static fn($n) => (int)$n['id'], $stale)));
    }
    return count($want);
}
/** Queue a line for a person's one push this run. */
function mpa_push(string $memberId, string $line, string $link = 'mentor'): void {
    if ($memberId === '') return;
    $GLOBALS['__mpa_push'][$memberId]['lines'][] = $line;
    $GLOBALS['__mpa_push'][$memberId]['link'] = $link;
}
function mpa_push_flush(string $job, int $now): int {
    $q = $GLOBALS['__mpa_push'] ?? [];
    $GLOBALS['__mpa_push'] = [];
    if (!$q || !function_exists('push_notification')) return 0;
    $label = (string)(MPA_JOBS[$job]['label'] ?? 'Mentoring');
    /* Quiet hours defer; they do not discard. Ten daily jobs run at 07:00,
     * inside the 20:00–08:00 window, and this used to drop their queue and log
     * the run as done — so whether anyone was told depended on what time the
     * first visitor of the day arrived. The batch waits and goes at 08:00. */
    if (mp_in_quiet_hours($now)) {
        $held = setting_get('mentor_automation.held');
        $held = is_array($held) ? $held : [];
        foreach ($q as $to => $x) {
            $held[] = ['to' => (string)$to, 'label' => $label, 'lines' => array_values(array_unique($x['lines'])), 'link' => (string)$x['link'], 'after' => mp_next_send_time($now)];
        }
        setting_set('mentor_automation.held', array_slice($held, -500), 'system');
        $GLOBALS['__mpa_heldn'] = count($q);
        return 0;
    }
    foreach ($q as $to => $x) mpa_push_send((string)$to, $label, array_values(array_unique($x['lines'])), (string)$x['link']);
    return count($q);
}
function mpa_push_send(string $to, string $label, array $lines, string $link): void {
    push_notification($to, ['kind' => 'mentor', 'title' => count($lines) === 1 ? $lines[0] : $label . ' · ' . count($lines) . ' things',
        'body' => count($lines) === 1 ? '' : implode(' · ', array_slice($lines, 0, 4)), 'linkPage' => $link]);
}
/** Send what quiet hours held, once they are over. Returns how many went. */
function mpa_push_release(int $now): int {
    if (mp_in_quiet_hours($now) || !function_exists('push_notification')) return 0;
    $held = setting_get('mentor_automation.held');
    if (!is_array($held) || !$held) return 0;
    setting_set('mentor_automation.held', [], 'system');   // claim first: a racing tick sends nothing twice
    foreach ($held as $h) if (is_array($h) && ($h['to'] ?? '') !== '') mpa_push_send((string)$h['to'], (string)($h['label'] ?? 'Mentoring'), (array)($h['lines'] ?? []), (string)($h['link'] ?? 'mentor'));
    return count($held);
}
/** Is this nudge new? A push goes with the nudge's first appearance, not every run it stays open. */
function mpa_is_new(string $key): bool { return !db_row('SELECT 1 FROM mentor_nudges WHERE nudgeKey = ? LIMIT 1', [$key]); }
function mpa_week_key(string $today): string { return gmdate('o-\WW', strtotime($today . 'T12:00:00Z')); }
function mpa_centre_on(string $job, array $m): bool { return mpa_job_on($job, (string)($m['centre'] ?? '')); }

/* ── The jobs ───────────────────────────────────────────────────────────── */

function mpa_job_pickOneToOnes(array $ctx): array {
    $sat = mp_next_saturday($ctx['today']); $n = 0;
    foreach ($ctx['mentors'] as $mid => $m) {
        if (!mpa_centre_on('pickOneToOnes', $m)) continue;
        $rows = mpa_rows($ctx, $mid);
        if (!$rows) continue;
        $have = db_row('SELECT oneToOnesJson FROM mentor_saturdays WHERE mentorId = ? AND onDate = ?', [$mid, $sat]);
        if ($have && trim((string)$have['oneToOnesJson'], '[] ') !== '') continue;     // the mentor already chose
        usort($rows, static fn($a, $b) => ($b['flags']['contactDays'] ?? 9999) <=> ($a['flags']['contactDays'] ?? 9999));
        $pick = array_map(static fn($r) => $r['id'], array_slice($rows, 0, 3));
        db_upsert('mentor_saturdays', ['mentorId' => $mid, 'onDate' => $sat, 'agendaJson' => '', 'oneToOnesJson' => json_encode($pick), 'registerClosedAt' => '', 'sharedAt' => '', 'updatedAt' => now_iso()],
            ['mentorId', 'onDate'], ['oneToOnesJson' => json_encode($pick), 'updatedAt' => now_iso()]);
        $n++;
    }
    return ['found' => $n, 'detail' => $n . ' Saturday plan' . ($n === 1 ? '' : 's') . ' given one-to-ones'];
}

/** Reviews open from the last Saturday, per mentor: children here (register or gate) with no review. */
function mpa_open_reviews(array $ctx): array {
    $sat = mp_last_saturday($ctx['today']);
    $period = iso_week_period(strtotime($sat . 'T12:00:00Z'));
    $all = array_keys($ctx['rows']);
    if (!$all) return [];
    $ph = implode(',', array_fill(0, count($all), '?'));
    $here = array_flip(array_column(db_all("SELECT subjectId FROM mentor_register WHERE onDate = ? AND here = 1 AND subjectId IN ($ph)", array_merge([$sat], $all)), 'subjectId'));
    foreach (db_all("SELECT DISTINCT studentId FROM attendance WHERE date = ? AND studentId IN ($ph)", array_merge([$sat], $all)) as $r) $here[$r['studentId']] = true;
    $done = array_flip(array_column(db_all("SELECT subjectId FROM mentor_reviews WHERE period = ? AND subjectId IN ($ph)", array_merge([$period], $all)), 'subjectId'));
    $out = [];
    foreach ($ctx['kids'] as $mid => $ids) foreach ($ids as $id) if (isset($here[$id]) && !isset($done[$id])) $out[$mid][] = $id;
    return $out;
}
function mpa_job_reviewReminder(array $ctx): array {
    $open = mpa_open_reviews($ctx); $want = [];
    foreach ($open as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('reviewReminder', $m)) continue;
        $names = array_map(static fn($id) => $ctx['rows'][$id]['first'] ?? '', $ids);
        $want['J:reviewReminder:' . $mid . ':' . mpa_week_key($ctx['today'])] = ['mentorId' => $mid, 'centre' => (string)$m['centre'],
            'title' => count($ids) . ' weekly review' . (count($ids) === 1 ? '' : 's') . ' still open', 'body' => implode(', ', $names) . ' · due Monday'];
        mpa_push((string)$m['memberId'], count($ids) . ' weekly review' . (count($ids) === 1 ? '' : 's') . ' to finish by Monday');
    }
    return ['found' => mpa_reconcile('reviewReminder', $want), 'detail' => count($want) . ' mentors reminded'];
}
function mpa_job_reviewOverdue(array $ctx): array {
    $open = mpa_open_reviews($ctx); $want = []; $n = 0;
    foreach ($open as $mid => $ids) {
        $m = $ctx['mentors'][$mid]; $lead = mpa_lead_of($ctx, $m);
        if (!$lead) { $GLOBALS['__mpa_orphans'][] = $mid; continue; }   // nobody to tell: said in the log, not filed to nobody
        $want['J:reviewOverdue:' . $mid . ':' . mpa_week_key($ctx['today'])] = ['audience' => 'lead', 'mentorId' => (string)($lead['mentorId'] ?? ''), 'centre' => (string)$m['centre'],
            'title' => mp_first((string)$m['fullName']) . ' has ' . count($ids) . ' review' . (count($ids) === 1 ? '' : 's') . ' overdue', 'body' => 'From last Saturday. Commitment 5 is at risk.'];
        if ($lead) mpa_push((string)$lead['memberId'], mp_first((string)$m['fullName']) . ': ' . count($ids) . ' reviews overdue');
        $n += count($ids);
    }
    return ['found' => mpa_reconcile('reviewOverdue', $want), 'detail' => $n . ' reviews overdue'];
}
function mpa_job_overdueOneToOne(array $ctx): array {
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        foreach ($ids as $id) {
            $r = $ctx['rows'][$id] ?? null;
            if (!$r || !$r['flags']['contact']) continue;
            $want['J:overdueOneToOne:' . $id . ':' . mpa_week_key($ctx['today'])] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => 'One-to-one with ' . $r['first'] . ' is overdue', 'body' => $r['flags']['contactDays'] === null ? 'No one-to-one logged yet' : $r['flags']['contactDays'] . ' days since the last'];
        }
    }
    return ['found' => mpa_reconcile('overdueOneToOne', $want), 'detail' => count($want) . ' overdue'];
}
function mpa_job_goalCheckDue(array $ctx): array {
    $want = []; $days = $ctx['o']['goalCheckDays'];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('goalCheckDue', $m)) continue;
        foreach ($ids as $id) {
            $g = $ctx['rows'][$id]['activeGoal'] ?? null;
            if (!$g) continue;
            $since = $g['lastCheckAt'] ?? null;
            if ($since === null) $since = (string)(db_row('SELECT updatedAt FROM mentor_goals WHERE id = ?', [$g['id']])['updatedAt'] ?? '');
            if ($since === '' || mp_days(substr($since, 0, 10), $ctx['today']) < $days) continue;
            $k = 'J:goalCheckDue:' . $g['id'] . ':' . intdiv(mp_days(substr($since, 0, 10), $ctx['today']), $days);
            $want[$k] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'], 'title' => 'Check in on ' . $ctx['rows'][$id]['first'] . '’s goal', 'body' => '“' . mb_substr($g['title'], 0, 80) . '” · how close are they now?'];
            // Once per due period — not every morning it stays unanswered.
            if (mpa_is_new($k)) mpa_push($id, 'How close are you to your goal now?', 'dashboard');
        }
    }
    return ['found' => mpa_reconcile('goalCheckDue', $want), 'detail' => count($want) . ' goal check-ins due'];
}
function mpa_job_goalStalled(array $ctx): array {
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('goalStalled', $m)) continue;
        foreach ($ids as $id) {
            $g = $ctx['rows'][$id]['activeGoal'] ?? null;
            if (!$g || !$g['stalled']) continue;
            $want['J:goalStalled:' . $g['id'] . ':' . mpa_week_key($ctx['today'])] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'], 'title' => $ctx['rows'][$id]['first'] . '’s goal has stalled', 'body' => mb_substr($g['title'], 0, 100)];
            mpa_push($id, 'Your goal could use a next step. What is one small thing you can do this week?', 'dashboard');
        }
    }
    return ['found' => mpa_reconcile('goalStalled', $want), 'detail' => count($want) . ' stalled'];
}
function mpa_job_goalReviewDate(array $ctx): array {
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('goalReviewDate', $m)) continue;
        foreach ($ids as $id) {
            $g = $ctx['rows'][$id]['activeGoal'] ?? null;
            if (!$g || (string)$g['reviewBy'] === '') continue;
            $d = mp_days($ctx['today'], (string)$g['reviewBy']);
            if ($d !== 7 && $d !== 0 && !($d < 0 && $d > -8)) continue;
            /* Three keys, three titles. The day-of and overdue rows shared one key,
             * and a nudge keeps the title it was created with — so a goal a week
             * late still said "today". The overdue row names the date instead of
             * a count of days that would go stale by tomorrow. */
            $phase = $d === 7 ? 'w' : ($d === 0 ? 'd' : 'o');
            $when = $d === 7 ? 'in 7 days' : ($d === 0 ? 'today' : '— it was due ' . (string)$g['reviewBy']);
            $want['J:goalReviewDate:' . $g['id'] . ':' . $phase] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => 'Review ' . $ctx['rows'][$id]['first'] . '’s goal ' . $when, 'body' => mb_substr($g['title'], 0, 100)];
            if ($d === 0) mpa_push((string)$m['memberId'], 'Review ' . $ctx['rows'][$id]['first'] . '’s goal today');
        }
    }
    return ['found' => mpa_reconcile('goalReviewDate', $want), 'detail' => count($want) . ' review dates'];
}
function mpa_job_noGoalAfterWeek3(array $ctx): array {
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('noGoalAfterWeek3', $m)) continue;
        foreach ($ids as $id) {
            $r = $ctx['rows'][$id] ?? null;
            if (!$r || $r['activeGoal'] || ($r['phase'] === 'Connect' && $r['week'] < 3) || $r['week'] === 0) continue;
            // A month window: once resolved, a child who is goal-less again is raised again.
            $want['J:noGoalAfterWeek3:' . $id . ':' . substr($ctx['today'], 0, 7)] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'], 'title' => 'Set a goal with ' . $r['first'], 'body' => 'Week ' . $r['week'] . ' and no active goal yet'];
        }
    }
    return ['found' => mpa_reconcile('noGoalAfterWeek3', $want), 'detail' => count($want) . ' without a goal'];
}
function mpa_job_scorecardDue(array $ctx): array {
    $prev = mp_prev_month(substr($ctx['today'], 0, 7));
    $all = array_keys($ctx['rows']); $have = [];
    if ($all) $have = array_flip(array_column(db_all("SELECT subjectId FROM mentor_scorecards WHERE byKind = 'mentor' AND month = ? AND subjectId IN (" . implode(',', array_fill(0, count($all), '?')) . ')', array_merge([$prev], $all)), 'subjectId'));
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('scorecardDue', $m)) continue;
        foreach ($ids as $id) if (!isset($have[$id]) && isset($ctx['rows'][$id])) {
            $want['J:scorecardDue:' . $id . ':' . $prev] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => 'Score ' . $ctx['rows'][$id]['first'] . ' for ' . gmdate('F', strtotime($prev . '-01')), 'body' => 'Leadership Index · locks on the ' . $ctx['o']['scorecardLockDay'] . 'th'];
        }
        $n = count(array_filter($ids, static fn($id) => !isset($have[$id])));
        if ($n) mpa_push((string)$m['memberId'], $n . ' scorecard' . ($n === 1 ? '' : 's') . ' to do for ' . gmdate('F', strtotime($prev . '-01')));
    }
    return ['found' => mpa_reconcile('scorecardDue', $want, 'J:scorecardDue:'), 'detail' => count($want) . ' to score for ' . $prev];
}
function mpa_job_scorecardLock(array $ctx): array {
    $prev = mp_prev_month(substr($ctx['today'], 0, 7));
    $n = db_exec("UPDATE mentor_scorecards SET locked = 1 WHERE month <= ? AND locked = 0", [$prev]);
    db_exec("UPDATE mentor_nudges SET status = 'done', resolvedAt = ?, resolvedBy = 'locked' WHERE status = 'open' AND rule = 'J:scorecardDue' AND nudgeKey LIKE ?", [now_iso(), '%:' . $prev]);
    return ['found' => $n, 'detail' => $n . ' scorecards locked for ' . $prev];
}
function mpa_job_relCheckDue(array $ctx): array {
    $want = []; $asked = 0;
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        foreach ($ids as $id) {
            $r = $ctx['rows'][$id] ?? null;
            if (!$r || empty($r['rel']['due'])) continue;
            $cycle = mp_cycle($ctx['today'], $ctx['o']['relWeeks']);
            $k = 'J:relCheckDue:' . $id . ':' . $cycle;
            $want[$k] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'], 'title' => 'Relationship check with ' . $r['first'], 'body' => 'Four questions, about two minutes'];
            // The child is asked once per cycle; the dashboard keeps the question up until it is answered.
            if (mpa_is_new($k)) { mpa_push($id, 'How is mentoring going? Four quick questions.', 'dashboard'); $asked++; }
        }
    }
    return ['found' => mpa_reconcile('relCheckDue', $want), 'detail' => $asked . ' children asked their side'];
}
/** Draft one family update per mentee from the month's observations and goal. Never sends. */
function mpa_job_familyDraft(array $ctx): array {
    $n = 0; $month = substr($ctx['today'], 0, 7);
    $since = gmdate('Y-m-d', strtotime($ctx['today']) - 35 * 86400);
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (($ctx['roles'][$mid] ?? '') === 'peer' || !mpa_centre_on('familyDraft', $m) || !$ids) continue;
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $obs = [];
        foreach (db_all("SELECT subjectId, observed FROM mentor_register WHERE here = 1 AND onDate >= ? AND subjectId IN ($ph)", array_merge([$since], $ids)) as $r) {
            $obs[$r['subjectId']]['n'] = ($obs[$r['subjectId']]['n'] ?? 0) + 1;
            foreach (json_decode((string)$r['observed'], true) ?: [] as $v) $obs[$r['subjectId']]['v'][$v] = ($obs[$r['subjectId']]['v'][$v] ?? 0) + 1;
        }
        $have = array_flip(array_column(db_all("SELECT subjectId FROM mentor_messages WHERE kind = 'Family draft' AND threadId LIKE ? AND subjectId IN ($ph)", array_merge(['draft:' . $month . ':%'], $ids)), 'subjectId'));
        foreach ($ids as $id) {
            $r = $ctx['rows'][$id] ?? null;
            if (!$r || isset($have[$id])) continue;
            $o = $obs[$id] ?? ['n' => 0, 'v' => []];
            $v = $o['v'] ?? []; arsort($v);
            $top = array_keys($v)[0] ?? '';
            $lines = ['Hello' . ($r['guardianName'] !== '' ? ' ' . mp_first($r['guardianName']) : '') . ', a quick note about ' . $r['first'] . '.'];
            if ($o['n']) $lines[] = $r['first'] . ' came to ' . $o['n'] . ' Saturday session' . ($o['n'] === 1 ? '' : 's') . ' this month' . ($top !== '' ? ' and showed real ' . strtolower($top) . '.' : '.');
            if ($r['activeGoal']) $lines[] = 'They are working on: ' . $r['activeGoal']['title'] . '.';
            $lines[] = 'One way you can help at home: ask them what they did this Saturday.';
            mp_message_put('draft:' . $month . ':' . $id, 'Family draft', $id, (string)$m['memberId'], (string)$m['fullName'], 'guardian:' . $id, implode(' ', $lines), 'draft');
            $n++;
        }
    }
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        if (($ctx['roles'][$mid] ?? '') === 'peer' || !$ids) continue;
        $c = (int)(db_row("SELECT COUNT(*) c FROM mentor_messages WHERE kind = 'Family draft' AND status = 'draft' AND fromId = ? AND threadId LIKE ?", [(string)$ctx['mentors'][$mid]['memberId'], 'draft:' . $month . ':%'])['c'] ?? 0);
        if ($c) $want['J:familyDraft:' . $mid . ':' . $month] = ['mentorId' => $mid, 'centre' => (string)$ctx['mentors'][$mid]['centre'], 'title' => $c . ' family update' . ($c === 1 ? '' : 's') . ' drafted for you', 'body' => 'Read, change and send from each mentee’s Family tab. Nothing is sent until you send it.'];
    }
    mpa_reconcile('familyDraft', $want);
    return ['found' => $n, 'detail' => $n . ' drafts written'];
}
function mpa_job_familyOverdue(array $ctx): array {
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (($ctx['roles'][$mid] ?? '') === 'peer' || !mpa_centre_on('familyOverdue', $m)) continue;
        foreach ($ids as $id) if (!empty($ctx['rows'][$id]['flags']['family'])) {
            $want['J:familyOverdue:' . $id . ':' . mpa_week_key($ctx['today'])] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'], 'title' => $ctx['rows'][$id]['first'] . '’s family is due an update', 'body' => 'No update in over ' . $ctx['o']['familyDays'] . ' days'];
        }
    }
    return ['found' => mpa_reconcile('familyOverdue', $want), 'detail' => count($want) . ' families due'];
}
function mpa_job_journalReply(array $ctx): array {
    $all = array_keys($ctx['rows']); $want = [];
    if (!$all) return ['found' => mpa_reconcile('journalReply', []), 'detail' => '0'];
    $cut = gmdate('Y-m-d', strtotime($ctx['today']) - 5 * 86400);
    $rows = array_values(array_filter(mp_shared_entries($all, gmdate('Y-m-d', strtotime($ctx['today']) - 30 * 86400)),
                                      static fn($r) => !$r['replied'] && substr((string)$r['createdAt'], 0, 10) <= $cut));
    $by = [];
    foreach ($rows as $r) foreach ($ctx['kids'] as $mid => $ids) if (in_array($r['memberId'], $ids, true)) $by[$mid][] = $r;
    foreach ($by as $mid => $rs) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('journalReply', $m)) continue;
        $want['J:journalReply:' . $mid . ':' . $ctx['today']] = ['mentorId' => $mid, 'centre' => (string)$m['centre'], 'title' => count($rs) . ' journal entr' . (count($rs) === 1 ? 'y' : 'ies') . ' waiting 5 days for a reply', 'body' => 'Reply within a week · commitment 6'];
    }
    return ['found' => mpa_reconcile('journalReply', $want), 'detail' => count($rows) . ' entries unanswered'];
}
function mpa_job_supervisionPrep(array $ctx): array {
    $end = gmdate('Y-m-d', strtotime($ctx['today']) + 6 * 86400); $want = [];
    foreach (db_all('SELECT * FROM mentor_supervision WHERE onDate BETWEEN ? AND ?', [$ctx['today'], $end]) as $s) {
        $m = $ctx['mentors'][$s['mentorId']] ?? null;
        if (!$m || !mpa_centre_on('supervisionPrep', $m)) continue;
        $rows = mpa_rows($ctx, (string)$m['mentorId']);
        $seen = count(array_filter($rows, static fn($r) => ($r['flags']['contactDays'] ?? 999) <= 14));
        $stalled = count(array_filter($rows, static fn($r) => $r['activeGoal'] && $r['activeGoal']['stalled']));
        $want['J:supervisionPrep:' . $s['id']] = ['mentorId' => (string)$m['mentorId'], 'centre' => (string)$m['centre'], 'title' => 'Supervision on ' . gmdate('l j F', strtotime((string)$s['onDate'])),
            'body' => 'This month: ' . $seen . ' of ' . count($rows) . ' seen in two weeks · ' . $stalled . ' stalled goal' . ($stalled === 1 ? '' : 's') . '. Answer the three prep questions in My role.'];
    }
    return ['found' => mpa_reconcile('supervisionPrep', $want), 'detail' => count($want) . ' supervisions this week'];
}
function mpa_reminder_all(array $ctx, string $job, string $text, ?callable $who = null): array {
    $n = 0;
    foreach ($ctx['mentors'] as $mid => $m) {
        if (!mpa_centre_on($job, $m) || ($who && !$who($m))) continue;
        mpa_push((string)$m['memberId'], $text); $n++;
    }
    return ['found' => $n, 'detail' => $n . ' mentors reminded'];
}
function mpa_job_prepSession(array $ctx): array {
    if ((int)gmdate('w', strtotime($ctx['today'] . 'T12:00:00Z')) !== mpa_prep_day()) return ['found' => 0, 'detail' => 'not the session day'];
    return mpa_reminder_all($ctx, 'prepSession', 'Mentor Preparation Session tonight, 7:00–8:00pm. Come prepared.');
}
function mpa_job_stsMeeting(array $ctx): array { return mpa_reminder_all($ctx, 'stsMeeting', 'STS meeting today after school.'); }
function mpa_job_cimcTraining(array $ctx): array {
    return mpa_reminder_all($ctx, 'cimcTraining', 'CIMC training tomorrow, 7:00am.', static fn($m) => trim((string)($m['cimcAt'] ?? '')) === '');
}
function mpa_job_twiceMonthly(array $ctx): array {
    $first = substr($ctx['today'], 0, 7) . '-01'; $want = [];
    $min = $ctx['o']['minSaturdays'];
    $ids = array_keys($ctx['mentors']);
    if (!$ids) return ['found' => 0, 'detail' => ''];
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $done = [];
    foreach (db_all("SELECT mentorId, COUNT(DISTINCT onDate) c FROM mentor_obligations WHERE kind = 'saturday' AND status = 'present' AND onDate BETWEEN ? AND ? AND mentorId IN ($ph) GROUP BY mentorId", array_merge([$first, $ctx['today']], $ids)) as $r) $done[$r['mentorId']] = (int)$r['c'];
    foreach (db_all("SELECT mentorId, COUNT(DISTINCT onDate) c FROM mentor_saturdays WHERE registerClosedAt <> '' AND onDate BETWEEN ? AND ? AND mentorId IN ($ph) GROUP BY mentorId", array_merge([$first, $ctx['today']], $ids)) as $r) $done[$r['mentorId']] = max($done[$r['mentorId']] ?? 0, (int)$r['c']);
    foreach ($ctx['mentors'] as $mid => $m) {
        if (empty($ctx['kids'][$mid]) || ($done[$mid] ?? 0) >= $min) continue;
        $want['J:twiceMonthly:' . $mid . ':' . substr($ctx['today'], 0, 7) . ':' . ((int)substr($ctx['today'], 8, 2) <= 15 ? 'a' : 'b')] = ['mentorId' => $mid, 'centre' => (string)$m['centre'],
            'title' => 'Mentor on Saturday: ' . ($done[$mid] ?? 0) . ' of ' . $min . ' this month', 'body' => 'At least twice a month at 9:30am · commitment 3'];
        mpa_push((string)$m['memberId'], 'You have mentored ' . ($done[$mid] ?? 0) . ' of ' . $min . ' Saturdays this month.');
    }
    return ['found' => mpa_reconcile('twiceMonthly', $want), 'detail' => count($want) . ' below ' . $min];
}
function mpa_job_caseloadCheck(array $ctx): array {
    $want = []; $min = $ctx['o']['minCaseload'];
    foreach ($ctx['mentors'] as $mid => $m) {
        if (($ctx['roles'][$mid] ?? '') === 'peer') continue;
        $n = count($ctx['kids'][$mid] ?? []);
        if ($n >= $min) continue;
        $lead = mpa_lead_of($ctx, $m);
        if (!$lead) { $GLOBALS['__mpa_orphans'][] = $mid; continue; }
        $want['J:caseloadCheck:' . $mid . ':' . substr($ctx['today'], 0, 7)] = ['audience' => 'lead', 'mentorId' => (string)($lead['mentorId'] ?? ''), 'centre' => (string)$m['centre'],
            'title' => mp_first((string)$m['fullName']) . ' has ' . $n . ' mentee' . ($n === 1 ? '' : 's'), 'body' => 'Below the minimum of ' . $min . ' · commitment 4'];
    }
    return ['found' => mpa_reconcile('caseloadCheck', $want), 'detail' => count($want) . ' below ' . $min];
}
function mpa_job_retreatBooking(array $ctx): array {
    $r = db_row('SELECT * FROM mentor_retreats WHERE onDate BETWEEN ? AND ? ORDER BY onDate LIMIT 1', [$ctx['today'], gmdate('Y-m-d', strtotime($ctx['today']) + 30 * 86400)]);
    $want = [];
    if ($r) {
        $booked = array_flip(array_column(db_all('SELECT mentorId FROM mentor_retreat_bookings WHERE retreatId = ?', [(string)$r['retreatId']]), 'mentorId'));
        foreach ($ctx['mentors'] as $mid => $m) {
            if (isset($booked[$mid]) || !mpa_centre_on('retreatBooking', $m)) continue;
            $want['J:retreatBooking:' . $mid . ':' . $r['retreatId']] = ['mentorId' => $mid, 'centre' => (string)$m['centre'], 'title' => 'Book your place at the retreat', 'body' => gmdate('j F', strtotime((string)$r['onDate'])) . ($r['place'] !== '' ? ' · ' . $r['place'] : '')];
        }
    }
    return ['found' => mpa_reconcile('retreatBooking', $want), 'detail' => count($want) . ' not booked'];
}
function mpa_job_academyRenewal(array $ctx): array {
    $want = []; $mods = [];
    foreach ((function_exists('ms_academy') ? ms_academy()['modules'] : []) as $mod) if (!empty($mod['required']) && !empty($mod['renewDays'])) $mods[$mod['id']] = $mod;
    if ($mods && $ctx['mentors']) {
        $ph = implode(',', array_fill(0, count($ctx['mentors']), '?'));
        foreach (db_all("SELECT mentorId, moduleId, passedAt FROM mentor_academy WHERE passedAt <> '' AND mentorId IN ($ph)", array_keys($ctx['mentors'])) as $r) {
            $mod = $mods[$r['moduleId']] ?? null;
            if (!$mod) continue;
            $exp = gmdate('Y-m-d', strtotime((string)$r['passedAt']) + (int)$mod['renewDays'] * 86400);
            $left = mp_days($ctx['today'], $exp);
            if ($left > 30 || $left < -60) continue;
            $m = $ctx['mentors'][$r['mentorId']];
            $want['J:academyRenewal:' . $r['mentorId'] . ':' . $r['moduleId'] . ':' . $exp] = ['mentorId' => (string)$r['mentorId'], 'centre' => (string)$m['centre'],
                'title' => 'Renew “' . (string)($mod['title'] ?? $r['moduleId']) . '”', 'body' => $left >= 0 ? 'Expires ' . gmdate('j F', strtotime($exp)) : 'Expired ' . gmdate('j F', strtotime($exp))];
            if ((int)gmdate('w', strtotime($ctx['today'])) === 1) mpa_push((string)$m['memberId'], 'An Academy module needs renewing');
        }
    }
    return ['found' => mpa_reconcile('academyRenewal', $want), 'detail' => count($want) . ' renewals due'];
}
function mpa_job_commitmentsRecalc(array $ctx): array {
    $warn = 0; $bad = 0; $n = 0;
    foreach ($ctx['mentors'] as $mid => $m) {
        if (trim((string)$m['memberId']) === '') continue;
        $g = ['mentorId' => $mid, 'mentorRow' => $m, 'mpRole' => $ctx['roles'][$mid], 'lead' => mpa_lead_of($ctx, $m), 'me' => (string)$m['memberId'], 'wantCentre' => ''];
        $GLOBALS['__mp_case'] = [];
        foreach (mp_commitments($g, substr($ctx['today'], 0, 7), $ctx['today']) as $c) { if ($c['status'] === 'warn') $warn++; if ($c['status'] === 'bad') $bad++; }
        $n++;
    }
    return ['found' => $n, 'detail' => $n . ' mentors · ' . $warn . ' at risk · ' . $bad . ' missed'];
}
/** Friday: each lead gets one email and one push — mentors below standard, reviews missing, open concerns. */
function mpa_job_leadDigest(array $ctx): array {
    $open = mpa_open_reviews($ctx); $sent = 0;
    foreach ($ctx['mentors'] as $lid => $lead) {
        if ($ctx['roles'][$lid] !== 'lead') continue;
        $team = array_filter($ctx['mentors'], static fn($m) => $m['mentorId'] !== $lid && (((string)($m['leadId'] ?? '') === $lid) || ((string)($m['leadId'] ?? '') === '' && (string)$m['centre'] === (string)$lead['centre'] && (string)$m['rank'] !== 'lead')));
        if (!$team) continue;
        $below = []; $missing = 0;
        foreach ($team as $mid => $m) {
            $rows = mpa_rows($ctx, $mid);
            $seen = count(array_filter($rows, static fn($r) => ($r['flags']['contactDays'] ?? 999) <= 14));
            if ($rows && $seen * 100 < 80 * count($rows)) $below[] = mp_first((string)$m['fullName']) . ' (' . $seen . ' of ' . count($rows) . ' seen)';
            $missing += count($open[$mid] ?? []);
        }
        $concerns = (int)(db_row("SELECT COUNT(*) c FROM safeguarding_cases WHERE status <> 'resolved' AND centre = ?", [(string)$lead['centre']])['c'] ?? 0);
        $html = '<p><strong>Below standard:</strong> ' . ($below ? esc_html(implode(', ', $below)) : 'nobody') . '</p><p><strong>Weekly reviews missing:</strong> ' . $missing . '</p><p><strong>Open safeguarding concerns at ' . esc_html((string)$lead['centre']) . ':</strong> ' . $concerns . ' (details in the Control Room only)</p>';
        if (filter_var((string)$lead['email'], FILTER_VALIDATE_EMAIL)) { try { send_mail((string)$lead['email'], 'Your mentors this week', email_template(['title' => 'Your mentors this week', 'intro' => 'Mentor contact report for ' . (string)$lead['centre'] . '.', 'bodyHtml' => $html])); } catch (\Throwable $e) {} }
        mpa_push((string)$lead['memberId'], count($below) . ' below standard · ' . $missing . ' reviews missing', 'mentor');
        $sent++;
    }
    return ['found' => $sent, 'detail' => $sent . ' leads sent the digest'];
}


/* ── Beyond the handoff ─────────────────────────────────────────────────── */

function mpa_job_memberCheckinPrompt(array $ctx): array {
    $all = array_keys($ctx['rows']); $n = 0;
    if (!$all) return ['found' => 0, 'detail' => 'no mentees'];
    $week = iso_week_period($ctx['now'] + 3600);
    $done = [];
    foreach (array_chunk($all, 500) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT memberId FROM member_checkins WHERE week = ? AND memberId IN ($ph)", array_merge([$week], $chunk)) as $r) $done[$r['memberId']] = true;
    }
    foreach ($ctx['kids'] as $mid => $ids) {
        if (!mpa_centre_on('memberCheckinPrompt', $ctx['mentors'][$mid])) continue;
        foreach ($ids as $id) if (!isset($done[$id]) && isset($ctx['rows'][$id])) { mpa_push($id, 'How has your week been? Tell ' . mp_first((string)$ctx['mentors'][$mid]['fullName']) . ' in one tap.', 'dashboard'); $n++; }
    }
    return ['found' => $n, 'detail' => $n . ' members asked'];
}
function mpa_job_checkinSilence(array $ctx): array {
    $weeks = $ctx['o']['checkinSilenceWeeks']; $cut = gmdate('Y-m-d', strtotime($ctx['today']) - $weeks * 7 * 86400);
    $all = array_keys($ctx['rows']); $last = [];
    foreach (array_chunk($all, 500) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT memberId, MAX(createdAt) d FROM member_checkins WHERE memberId IN ($ph) GROUP BY memberId", $chunk) as $r) $last[$r['memberId']] = substr((string)$r['d'], 0, 10);
    }
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('checkinSilence', $m)) continue;
        foreach ($ids as $id) {
            // Silent only after they have checked in at least once — a member who never has is the prompt's job.
            if (!isset($last[$id]) || $last[$id] >= $cut || !isset($ctx['rows'][$id])) continue;
            $want['J:checkinSilence:' . $id . ':' . mpa_week_key($ctx['today'])] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => $ctx['rows'][$id]['first'] . ' hasn’t checked in for ' . $weeks . ' weeks', 'body' => 'Ask how they are, in person if you can'];
        }
    }
    return ['found' => mpa_reconcile('checkinSilence', $want), 'detail' => count($want) . ' silent'];
}
function mpa_job_missedSaturdays(array $ctx): array {
    $need = $ctx['o']['absentSaturdays']; $all = array_keys($ctx['rows']);
    if (!$all) return ['found' => mpa_reconcile('missedSaturdays', []), 'detail' => '0'];
    $since = gmdate('Y-m-d', strtotime($ctx['today']) - 10 * 7 * 86400);
    // Saturdays each centre actually met (anyone checked in), newest first.
    $met = [];
    foreach (db_all("SELECT DISTINCT a.date d, m.centre c FROM attendance a JOIN members m ON m.memberId = a.studentId WHERE a.date >= ? AND a.date <= ?", [$since, $ctx['today']]) as $r)
        if (gmdate('w', strtotime($r['d'] . 'T12:00:00Z')) === '6') $met[(string)$r['c']][] = (string)$r['d'];
    foreach ($met as &$l) { rsort($l); } unset($l);
    $here = [];
    foreach (array_chunk($all, 500) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT studentId, date FROM attendance WHERE date >= ? AND studentId IN ($ph)", array_merge([$since], $chunk)) as $r) $here[$r['studentId']][$r['date']] = true;
        foreach (db_all("SELECT subjectId, onDate FROM mentor_register WHERE here = 1 AND onDate >= ? AND subjectId IN ($ph)", array_merge([$since], $chunk)) as $r) $here[$r['subjectId']][$r['onDate']] = true;
    }
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        foreach ($ids as $id) {
            $r = $ctx['rows'][$id] ?? null; if (!$r) continue;
            $sats = array_slice($met[$r['centre']] ?? [], 0, $need);
            if (count($sats) < $need) continue;
            if (array_filter($sats, static fn($d) => isset($here[$id][$d]))) continue;
            $want['J:missedSaturdays:' . $id . ':' . $sats[0]] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => $r['first'] . ' has missed ' . $need . ' Saturdays', 'body' => 'Call them or their family this week'];
        }
    }
    return ['found' => mpa_reconcile('missedSaturdays', $want), 'detail' => count($want) . ' absent'];
}
/** Is a birthday (MM-DD) today? A 29 February birthday falls on the 28th in a common year, rather than never. */
function mpa_birthday_today(string $md, string $today): bool {
    $t = substr($today, 5, 5);
    if ($md === $t) return true;
    return $md === '02-29' && $t === '02-28' && !(bool)(int)gmdate('L', strtotime($today . 'T12:00:00Z'));
}
function mpa_job_birthday(array $ctx): array {
    $all = array_keys($ctx['rows']); $md = substr($ctx['today'], 5, 5); $want = [];
    $dob = [];
    foreach (array_chunk($all, 500) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT memberId, dob FROM members WHERE memberId IN ($ph) AND dob <> ''", $chunk) as $r) $dob[$r['memberId']] = (string)$r['dob'];
    }
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('birthday', $m)) continue;
        foreach ($ids as $id) if (isset($dob[$id]) && mpa_birthday_today(substr($dob[$id], 5, 5), $ctx['today']) && isset($ctx['rows'][$id])) {
            $age = mp_age($dob[$id], $ctx['today']);
            $want['J:birthday:' . $id . ':' . $ctx['today']] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => 'It’s ' . $ctx['rows'][$id]['first'] . '’s birthday' . ($age ? ' (' . $age . ')' : ''), 'body' => 'A message from you today means more than you think'];
        }
    }
    return ['found' => mpa_reconcile('birthday', $want), 'detail' => count($want) . ' birthdays'];
}
function mpa_job_mentorQuiet(array $ctx): array {
    $days = $ctx['o']['mentorQuietDays']; $since = gmdate('Y-m-d', strtotime($ctx['today']) - $days * 86400);
    $logged = [];
    foreach (db_all('SELECT mentorId, MAX(metOn) d FROM mentor_meetings WHERE concern = 0 GROUP BY mentorId') as $r) $logged[$r['mentorId']] = (string)$r['d'];
    $want = [];
    foreach ($ctx['mentors'] as $mid => $m) {
        if (empty($ctx['kids'][$mid]) || trim((string)$m['memberId']) === '') continue;
        $last = $logged[(string)$m['memberId']] ?? '';
        if ($last !== '' && $last >= $since) continue;
        $lead = mpa_lead_of($ctx, $m);
        mpa_push((string)$m['memberId'], 'Your mentees haven’t had a session logged for ' . $days . ' days.');
        if (!$lead) { $GLOBALS['__mpa_orphans'][] = $mid; continue; }
        $want['J:mentorQuiet:' . $mid . ':' . mpa_week_key($ctx['today'])] = ['audience' => 'lead', 'mentorId' => (string)($lead['mentorId'] ?? ''), 'centre' => (string)$m['centre'],
            'title' => mp_first((string)$m['fullName']) . ' has logged nothing for ' . ($last === '' ? 'a while' : mp_days($last, $ctx['today']) . ' days'), 'body' => mp_plural_mentees(count($ctx['kids'][$mid])) . ' · check in with them'];
    }
    return ['found' => mpa_reconcile('mentorQuiet', $want), 'detail' => count($want) . ' quiet mentors'];
}
function mp_plural_mentees(int $n): string { return $n . ' mentee' . ($n === 1 ? '' : 's'); }
function mpa_job_supervisionGap(array $ctx): array {
    $days = $ctx['o']['supervisionDays']; $since = gmdate('Y-m-d', strtotime($ctx['today']) - $days * 86400);
    $last = [];
    foreach (db_all('SELECT mentorId, MAX(onDate) d FROM mentor_supervision GROUP BY mentorId') as $r) $last[$r['mentorId']] = (string)$r['d'];
    $want = [];
    foreach ($ctx['mentors'] as $mid => $m) {
        if (($ctx['roles'][$mid] ?? '') === 'lead' || empty($ctx['kids'][$mid]) || !mpa_centre_on('supervisionGap', $m)) continue;
        if (($last[$mid] ?? '') >= $since) continue;
        $lead = mpa_lead_of($ctx, $m); if (!$lead) continue;
        $want['J:supervisionGap:' . $mid . ':' . substr($ctx['today'], 0, 7)] = ['audience' => 'lead', 'mentorId' => (string)$lead['mentorId'], 'centre' => (string)$m['centre'],
            'title' => 'Book supervision with ' . mp_first((string)$m['fullName']), 'body' => isset($last[$mid]) ? 'Last on ' . gmdate('j F', strtotime($last[$mid])) : 'Never supervised yet'];
    }
    return ['found' => mpa_reconcile('supervisionGap', $want), 'detail' => count($want) . ' due'];
}
function mpa_job_scoreDrop(array $ctx): array {
    $month = mp_prev_month(substr($ctx['today'], 0, 7)); $before = mp_prev_month($month); $drop = $ctx['o']['scoreDrop'];
    $all = array_keys($ctx['rows']); $t = [];
    foreach (array_chunk($all, 500) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT subjectId, month, total FROM mentor_scorecards WHERE byKind = 'mentor' AND month IN (?, ?) AND subjectId IN ($ph)", array_merge([$month, $before], $chunk)) as $r) $t[$r['subjectId']][$r['month']] = (int)$r['total'];
    }
    $want = [];
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid];
        if (!mpa_centre_on('scoreDrop', $m)) continue;
        foreach ($ids as $id) {
            if (!isset($t[$id][$month], $t[$id][$before]) || $t[$id][$before] - $t[$id][$month] < $drop) continue;
            $first = $ctx['rows'][$id]['first'] ?? '';
            $want['J:scoreDrop:' . $id . ':' . $month] = ['mentorId' => $mid, 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => $first . '’s Leadership Index fell ' . ($t[$id][$before] - $t[$id][$month]) . ' points', 'body' => $t[$id][$before] . ' → ' . $t[$id][$month] . ' in ' . gmdate('F', strtotime($month . '-01'))];
            $lead = mpa_lead_of($ctx, $m);
            if ($lead) $want['J:scoreDrop:lead:' . $id . ':' . $month] = ['audience' => 'lead', 'mentorId' => (string)$lead['mentorId'], 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => $first . '’s Leadership Index fell sharply', 'body' => 'Mentor: ' . mp_first((string)$m['fullName'])];
        }
    }
    return ['found' => mpa_reconcile('scoreDrop', $want), 'detail' => count(array_filter(array_keys($want), static fn($k) => !str_contains($k, ':lead:'))) . ' sharp drops'];
}
function mpa_job_relLowTwice(array $ctx): array {
    $low = $ctx['o']['relLow']; $want = [];
    $all = array_keys($ctx['rows']); $by = []; $cyc = [];
    foreach (array_chunk($all, 500) as $chunk) {
        $ph = implode(',', array_fill(0, count($chunk), '?'));
        foreach (db_all("SELECT subjectId, score, cycle FROM mentor_rel_checks WHERE side = 'child' AND subjectId IN ($ph) ORDER BY createdAt DESC", $chunk) as $r) { $by[$r['subjectId']][] = (int)$r['score']; $cyc[$r['subjectId']] ??= (string)$r['cycle']; }
    }
    foreach ($ctx['kids'] as $mid => $ids) {
        $m = $ctx['mentors'][$mid]; $lead = mpa_lead_of($ctx, $m);
        foreach ($ids as $id) {
            $s = $by[$id] ?? [];
            if (count($s) < 2 || $s[0] > $low || $s[1] > $low) continue;
            if (!$lead) { $GLOBALS['__mpa_orphans'][] = $id; continue; }
            // Keyed by the latest check: a new pair of low checks is a new conversation about fit.
            $want['J:relLowTwice:' . $id . ':' . ($cyc[$id] ?? '')] = ['audience' => 'lead', 'mentorId' => (string)($lead['mentorId'] ?? ''), 'memberId' => $id, 'centre' => (string)$m['centre'],
                'title' => 'Talk about fit: ' . ($ctx['rows'][$id]['first'] ?? '') . ' and ' . mp_first((string)$m['fullName']), 'body' => 'The child rated the relationship ' . $s[1] . ' then ' . $s[0] . ' out of 5'];
        }
    }
    return ['found' => mpa_reconcile('relLowTwice', $want), 'detail' => count($want) . ' pairs'];
}
function mpa_job_unmatched(array $ctx): array {
    $days = $ctx['o']['unmatchedDays']; $cut = gmdate('Y-m-d', strtotime($ctx['today']) - $days * 86400);
    $rows = db_all("SELECT m.memberId, m.fullName, m.centre FROM members m WHERE m.status = 'active' AND m.type = 'NGG' AND COALESCE(m.role,'member') IN ('', 'member')
                    AND COALESCE(NULLIF(m.joinDate,''), substr(m.createdAt, 1, 10)) <= ?
                    AND NOT EXISTS (SELECT 1 FROM mentor_assignments a WHERE a.memberId = m.memberId AND a.status = 'active')
                    AND NOT EXISTS (SELECT 1 FROM mentors t WHERE t.memberId = m.memberId AND t.status = 'active') LIMIT 2000", [$cut]);
    $byCentre = [];
    foreach ($rows as $r) $byCentre[(string)$r['centre']][] = mp_first((string)$r['fullName']);
    $want = [];
    foreach ($byCentre as $c => $names) {
        $lead = null; foreach ($ctx['mentors'] as $x) if ((string)$x['rank'] === 'lead' && (string)$x['centre'] === $c) { $lead = $x; break; }
        if (!$lead || !mpa_job_on('unmatched', $c)) continue;
        $want['J:unmatched:' . $c . ':' . mpa_week_key($ctx['today'])] = ['audience' => 'lead', 'mentorId' => (string)$lead['mentorId'], 'centre' => $c,
            'title' => count($names) . ' member' . (count($names) === 1 ? '' : 's') . ' at ' . $c . ' still without a mentor', 'body' => implode(', ', array_slice($names, 0, 8)) . (count($names) > 8 ? '…' : '') . ' · match them in the Control Room'];
    }
    return ['found' => mpa_reconcile('unmatched', $want), 'detail' => count($rows) . ' without a mentor'];
}
/** A concern nobody has opened: email the officer again and every safeguarding admin — once per case. */
function mpa_job_concernEscalate(array $ctx): array {
    $hours = $ctx['o']['concernHours']; $cut = gmdate('Y-m-d\TH:i:s\Z', $ctx['now'] - $hours * 3600);
    $cases = db_all("SELECT c.* FROM safeguarding_cases c WHERE c.status = 'received' AND c.createdAt <= ?
                     AND NOT EXISTS (SELECT 1 FROM safeguarding_notes n WHERE n.caseNo = c.caseNo) LIMIT 50", [$cut]);
    $n = 0;
    foreach ($cases as $c) {
        if (db_row("SELECT 1 FROM mentor_nudges WHERE nudgeKey = ?", ['J:concernEscalate:' . $c['caseNo']])) continue;
        ms_nudge('J:concernEscalate:' . $c['caseNo'], 'J:concernEscalate', ['audience' => 'lead', 'mentorId' => '', 'centre' => (string)$c['centre'],
            'title' => 'Unopened concern ' . $c['caseNo'], 'body' => 'Escalated after ' . $hours . ' hours']);
        $to = [];
        foreach (db_all("SELECT * FROM members WHERE status = 'active' AND COALESCE(role,'') NOT IN ('', 'member')") as $s) {
            if (!in_array('safeguarding', member_effective_caps($s), true)) continue;
            $sc = admin_centre_names_in_scope($s);
            if ($sc !== null && !in_array((string)$c['centre'], $sc, true)) continue;
            if (filter_var((string)$s['email'], FILTER_VALIDATE_EMAIL)) $to[] = (string)$s['email'];
        }
        foreach (array_unique($to) as $e) { try { send_mail($e, 'Unopened safeguarding concern ' . $c['caseNo'], '<p>A concern reported at ' . esc_html((string)$c['centre']) . ' (' . esc_html((string)$c['caseNo']) . ') has not been opened for ' . $hours . ' hours.</p><p>Open it today: Control Room → People → Mentorship → Safeguarding. The details are not sent by email.</p>'); } catch (\Throwable $e2) {} }
        if (function_exists('ops_record')) ops_record('error', 'safeguarding.unopened', 'A safeguarding concern has not been opened', $c['caseNo'] . ' at ' . $c['centre']);
        $n++;
    }
    return ['found' => $n, 'detail' => $n . ' escalated'];
}

/* ── Control Room › Settings › Mentorship automations ───────────────────── */

function admin_mentor_automations_list(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $s = mpa_settings(); $o = mp_opts(); $jobs = [];
    $last = [];
    foreach (db_all('SELECT job, MAX(ranAt) ranAt FROM mentor_job_log GROUP BY job') as $r) $last[$r['job']] = (string)$r['ranAt'];
    $lastRow = [];
    if ($last) foreach (db_all('SELECT job, ranAt, found, detail FROM mentor_job_log WHERE ranAt IN (' . implode(',', array_fill(0, count($last), '?')) . ')', array_values($last)) as $r) $lastRow[$r['job']] = $r;
    $stats = [];
    foreach (db_all("SELECT job, COUNT(*) runs, SUM(found) found, SUM(CASE WHEN detail LIKE 'failed:%' THEN 1 ELSE 0 END) failed FROM mentor_job_log WHERE ranAt >= ? GROUP BY job", [gmdate('Y-m-d', time() - 30 * 86400)]) as $r)
        $stats[$r['job']] = ['runs' => (int)$r['runs'], 'found' => (int)$r['found'], 'failed' => (int)$r['failed']];
    foreach (MPA_JOBS as $key => $j) {
        $cron = isset($j['cron']) ? mpa_job_cron($key) : '';
        $jobs[] = ['key' => $key, 'label' => $j['label'], 'effect' => $j['effect'], 'locked' => !empty($j['locked']), 'event' => $j['on'] ?? '',
                   'cat' => (string)($j['cat'] ?? 'commitments'), 'trigger' => (string)($j['trigger'] ?? ''), 'if' => (string)($j['if'] ?? ''), 'then' => (array)($j['then'] ?? []),
                   'uses' => (array)($j['uses'] ?? []), 'stats' => $stats[$key] ?? ['runs' => 0, 'found' => 0, 'failed' => 0],
                   'cron' => $cron, 'when' => $cron !== '' ? mpa_cron_words($cron) : 'When it happens', 'hour' => $cron !== '' && explode(' ', $cron)[1] !== '*' ? (int)explode(' ', $cron)[1] : null,
                   'on' => mpa_job_on($key), 'pausedReason' => mpa_paused_reason($key), 'centresOff' => array_values((array)($s['centresOff'][$key] ?? [])), 'shows' => !empty($j['due']) ? 'Due now' : '',
                   'lastRun' => $lastRow[$key] ?? null];
    }
    $th = [];
    foreach (MPA_THRESHOLDS as $k => [$lo, $hi, $label]) $th[] = ['key' => $k, 'label' => $label, 'value' => $k === 'prepDay' ? mpa_prep_day() : (int)($o[$k] ?? 0), 'min' => $lo, 'max' => $hi, 'default' => $k === 'prepDay' ? 3 : (int)(MP_DEFAULTS[$k] ?? 0)];
    $cats = [];
    foreach (MPA_CATEGORIES as $k => [$l, $ic]) $cats[] = ['key' => $k, 'label' => $l, 'icon' => $ic];
    return ['ok' => true, 'jobs' => $jobs, 'thresholds' => $th, 'categories' => $cats, 'quiet' => ['from' => '20:00', 'to' => '08:00', 'tz' => 'Africa/Lagos'],
            'canEditAll' => $g['centres'] === null, 'centres' => $g['centres'] ?? array_column(db_all("SELECT name FROM centres WHERE COALESCE(status,'active') <> 'retired' ORDER BY name"), 'name')];
}
function mpa_cron_words(string $cron): string {
    [$mi, $h, $dom, , $dow] = preg_split('/\s+/', $cron);
    if ($h === '*') return 'Every hour';
    $t = sprintf('%d:%02d%s', ((int)$h % 12) ?: 12, (int)$mi, (int)$h < 12 ? 'am' : 'pm');
    $days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if ($dow !== '*') return $days[(int)$dow] . 's at ' . $t;
    if ($dom === '*') return 'Daily at ' . $t;
    $parts = array_map(static fn($d) => preg_match('/^L-(\d+)$/', $d, $m) ? $m[1] . ' days before month end' : $d . (in_array($d, ['1', '21', '31']) ? 'st' : ($d === '2' || $d === '22' ? 'nd' : ($d === '3' || $d === '23' ? 'rd' : 'th'))), explode(',', $dom));
    return implode(' and ', $parts) . ' of the month at ' . $t;
}
/**
 * update — `job` + {on, hour, centresOff} or `thresholds` {key: value}.
 * Global changes (on/off for everyone, the hour, thresholds) need an unscoped
 * admin; a centre-scoped admin may only switch an unlocked job off or on for
 * their own centres. Locked jobs cannot be switched off by anyone.
 */
function admin_mentor_automations_update(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $s = mpa_settings(); $by = (string)($p['requesterId'] ?? '');
    $global = $g['centres'] === null;
    if (isset($p['thresholds'])) {
        if (!$global) return ['ok' => false, 'error' => 'needs_unscoped_admin'];
        foreach ((array)$p['thresholds'] as $k => $v) {
            if (!isset(MPA_THRESHOLDS[$k])) return ['ok' => false, 'error' => 'unknown_threshold', 'key' => $k];
            [$lo, $hi] = MPA_THRESHOLDS[$k];
            if (!is_numeric($v) || (int)$v < $lo || (int)$v > $hi) return ['ok' => false, 'error' => 'out_of_range', 'key' => $k, 'min' => $lo, 'max' => $hi];
            $s['thresholds'][$k] = (int)$v;
        }
    }
    $key = (string)($p['job'] ?? '');
    if ($key !== '') {
        $j = MPA_JOBS[$key] ?? null;
        if (!$j) return ['ok' => false, 'error' => 'unknown_job'];
        if (array_key_exists('on', $p)) {
            if (!empty($j['locked']) && !$p['on']) return ['ok' => false, 'error' => 'job_locked'];
            if (!$global) return ['ok' => false, 'error' => 'needs_unscoped_admin'];
            $s['jobs'][$key]['on'] = (bool)$p['on'];
        }
        if (array_key_exists('hour', $p)) {
            if (!$global) return ['ok' => false, 'error' => 'needs_unscoped_admin'];
            if (empty($j['cron'])) return ['ok' => false, 'error' => 'event_job_has_no_time'];
            $h = $p['hour'];
            if ($h === null || $h === '') unset($s['jobs'][$key]['hour']);
            elseif (!is_numeric($h) || (int)$h < 0 || (int)$h > 23) return ['ok' => false, 'error' => 'bad_hour'];
            else $s['jobs'][$key]['hour'] = (int)$h;
        }
        if (array_key_exists('centresOff', $p)) {
            if (!empty($j['locked'])) return ['ok' => false, 'error' => 'job_locked'];
            $want = array_values(array_unique(array_filter(array_map('strval', (array)$p['centresOff']))));
            $cur = (array)($s['centresOff'][$key] ?? []);
            if (!$global) {
                // A scoped admin changes their own centres and leaves the rest as they were.
                foreach ($want as $c) if (!in_array($c, $g['centres'], true)) return ['ok' => false, 'error' => 'out_of_scope', 'centre' => $c];
                $cur = array_values(array_filter($cur, static fn($c) => !in_array($c, $g['centres'], true)));
                $want = array_values(array_unique(array_merge($cur, $want)));
            }
            $s['centresOff'][$key] = $want;
        }
    }
    setting_set('mentor_automation', $s, $by);
    audit('mentor.automations.update', $by, $key !== '' ? $key : 'thresholds', ['job' => $key, 'thresholds' => $p['thresholds'] ?? null], (string)($p['ip'] ?? ''));
    return admin_mentor_automations_list($p);
}
function admin_mentor_automations_log(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $days = max(1, min(90, (int)($p['days'] ?? 30)));
    $args = [gmdate('Y-m-d', time() - $days * 86400)];
    $sql = 'SELECT job, ranAt, found, detail FROM mentor_job_log WHERE ranAt >= ?';
    if (trim((string)($p['job'] ?? '')) !== '') { $sql .= ' AND job = ?'; $args[] = (string)$p['job']; }
    $rows = db_all($sql . ' ORDER BY ranAt DESC LIMIT 500', $args);
    $by = [];
    foreach ($rows as $r) { $by[$r['job']]['runs'] = ($by[$r['job']]['runs'] ?? 0) + 1; $by[$r['job']]['found'] = ($by[$r['job']]['found'] ?? 0) + (int)$r['found']; }
    return ['ok' => true, 'days' => $days, 'runs' => $rows, 'byJob' => $by];
}
/** Run a job now (an unscoped admin; jobs span centres). */
function admin_mentor_automations_run(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    if ($g['centres'] !== null) return ['ok' => false, 'error' => 'needs_unscoped_admin'];
    $key = (string)($p['job'] ?? '');
    if (empty(MPA_JOBS[$key]['cron'])) return ['ok' => false, 'error' => 'unknown_job'];
    $r = mpa_run($key);
    audit('mentor.automations.run', (string)($p['requesterId'] ?? ''), $key, ['found' => $r['found'] ?? 0], (string)($p['ip'] ?? ''));
    return $r;
}
/** Retreats: an admin schedules them; mentors book from My role. */
function admin_mentor_retreat_save(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $d = trim((string)($p['onDate'] ?? ''));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return ['ok' => false, 'error' => 'bad_date'];
    $id = trim((string)($p['retreatId'] ?? ''));
    $row = ['title' => mb_substr(trim((string)($p['title'] ?? 'Quarterly retreat')), 0, 120), 'onDate' => $d, 'place' => mb_substr(trim((string)($p['place'] ?? '')), 0, 160)];
    if ($id !== '' && db_row('SELECT 1 FROM mentor_retreats WHERE retreatId = ?', [$id])) db_update('mentor_retreats', $row, ['retreatId' => $id]);
    else { $id = 'RT-' . strtoupper(bin2hex(random_bytes(3))); db_insert('mentor_retreats', $row + ['retreatId' => $id, 'createdAt' => now_iso()]); }
    audit('mentor.retreat.save', (string)($p['requesterId'] ?? ''), $id, $row, (string)($p['ip'] ?? ''));
    return ['ok' => true, 'retreatId' => $id];
}
function admin_mentor_retreats(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $rows = db_all('SELECT r.*, (SELECT COUNT(*) FROM mentor_retreat_bookings b WHERE b.retreatId = r.retreatId) booked FROM mentor_retreats r ORDER BY onDate DESC LIMIT 20');
    return ['ok' => true, 'retreats' => $rows];
}
/** Unlock a mentee's scorecard for a past month (the only way past the lock day). */
function admin_mentor_scorecard_unlock(array $p): array {
    $g = ms_staff_gate($p); if (!$g['ok']) return $g;
    $sid = (string)($p['subjectId'] ?? ''); $month = (string)($p['month'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) return ['ok' => false, 'error' => 'bad_month'];
    $m = db_row('SELECT centre FROM members WHERE memberId = ?', [$sid]);
    if (!$m) return ['ok' => false, 'error' => 'not_found'];
    if (!ms_in_scope($g, (string)$m['centre'])) return ['ok' => false, 'error' => 'out_of_scope'];
    $have = db_row("SELECT id FROM mentor_scorecards WHERE subjectId = ? AND month = ? AND byKind = 'mentor'", [$sid, $month]);
    if ($have) db_update('mentor_scorecards', ['locked' => 2], ['id' => (int)$have['id']]);
    else db_insert('mentor_scorecards', ['subjectId' => $sid, 'month' => $month, 'scores' => implode(',', array_fill(0, 10, 0)), 'total' => 0, 'byKind' => 'mentor', 'mentorId' => '', 'centre' => (string)$m['centre'], 'locked' => 2, 'createdAt' => now_iso(), 'updatedAt' => '']);
    audit('mentor.scorecard.unlock', (string)($p['requesterId'] ?? ''), $sid, ['month' => $month], (string)($p['ip'] ?? ''));
    return ['ok' => true];
}
