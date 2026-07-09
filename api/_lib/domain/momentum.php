<?php
declare(strict_types=1);

/**
 * Behavioral Momentum engine — an enterprise-grade analytics layer over a
 * member's OWN reflection + systems data that produces psychologically-grounded,
 * deterministic signals and nudges. No AI, no network: reliable and testable.
 *
 * The mechanics it encodes (all evidence-based habit/behaviour levers):
 *   - loss aversion         → protect a live streak before it breaks
 *   - goal-gradient effect  → "you're N from your best" / next level
 *   - fresh-start effect     → Monday / new-week reset framing
 *   - competence feedback    → rising momentum, consistency
 *   - implementation intent  → surface the member's best time-of-day
 * Reused by the member app, the coach, and the guardian portal (at-risk).
 */

/** Longest run of consecutive days in a set of 'Y-m-d' day keys. */
function momentum_longest_streak(array $daySet): int {
    if (!$daySet) return 0;
    $days = array_keys($daySet);
    sort($days);
    $best = 1; $run = 1;
    for ($i = 1; $i < count($days); $i++) {
        $prev = strtotime($days[$i - 1]); $cur = strtotime($days[$i]);
        if ($cur - $prev === 86400) { $run++; $best = max($best, $run); }
        else $run = 1;
    }
    return $best;
}

/** Distinct reflection days within [now-$span, now). */
function momentum_days_in_window(array $daySet, int $fromDaysAgo, int $toDaysAgo = 0): int {
    $n = 0;
    for ($i = $fromDaysAgo; $i > $toDaysAgo; $i--) {
        if (isset($daySet[gmdate('Y-m-d', time() - ($i - 1) * 86400)])) $n++;
    }
    return $n;
}

/** Core signal set for a member. */
function momentum_signals(string $memberId): array {
    $rows = db_all('SELECT createdAt FROM journal WHERE memberId = ? ORDER BY createdAt DESC LIMIT 500', [$memberId]);
    $daySet = []; $hours = [];
    foreach ($rows as $r) {
        $ts = (string)$r['createdAt'];
        $daySet[substr($ts, 0, 10)] = true;
        $h = (int)substr($ts, 11, 2);
        $hours[$h] = ($hours[$h] ?? 0) + 1;
    }
    $today = gmdate('Y-m-d');
    $reflectedToday = isset($daySet[$today]);

    // Current streak (allow a not-yet-done today if yesterday is present).
    $streak = 0; $t = time();
    if (!isset($daySet[gmdate('Y-m-d', $t)])) { $t -= 86400; if (!isset($daySet[gmdate('Y-m-d', $t)])) $t = 0; }
    if ($t) while (isset($daySet[gmdate('Y-m-d', $t)])) { $streak++; $t -= 86400; }
    $longest = momentum_longest_streak($daySet);

    $consistency30 = (int)round(momentum_days_in_window($daySet, 30) / 30 * 100);
    $week = momentum_days_in_window($daySet, 7);
    $prevWeek = momentum_days_in_window($daySet, 14, 7);
    $trend = $week > $prevWeek ? 'rising' : ($week < $prevWeek ? 'dipping' : 'steady');

    arsort($hours);
    $bestHour = null; $bestHourCount = 0;
    if ($hours) { $bestHour = (int)array_key_first($hours); $bestHourCount = (int)reset($hours); }

    // Canonical progression (aligns the app/design economy): 60 XP per reflection
    // day, 250 XP per level, 5 levels max.
    $totalDays = count($daySet);
    $totalXp = $totalDays * 60;
    $LEVELS = ['Seedling', 'Sprout', 'Sapling', 'Rooted', 'Vanguard'];
    $level = min(5, intdiv($totalXp, 250) + 1);
    $xpInLevel = $level >= 5 ? 250 : $totalXp % 250;
    $xpToNext = $level >= 5 ? 0 : 250 - $xpInLevel;

    return [
        'streak' => $streak, 'longestStreak' => $longest, 'reflectedToday' => $reflectedToday,
        'consistency' => $consistency30, 'weekCount' => $week, 'prevWeekCount' => $prevWeek,
        'trend' => $trend, 'bestHour' => $bestHour, 'bestHourReliable' => $bestHourCount >= 3,
        'totalReflections' => $totalDays, 'xp' => $xpInLevel, 'xpToNext' => $xpToNext,
        'level' => $level, 'levelName' => $LEVELS[$level - 1],
    ];
}

/** Format an hour (0-23) as a friendly window, e.g. 17 → "5–6 PM". */
function momentum_hour_label(int $h): string {
    $fmt = function ($x) { $x %= 24; $ap = $x < 12 ? 'AM' : 'PM'; $h12 = $x % 12; if ($h12 === 0) $h12 = 12; return $h12 . ' ' . $ap; };
    return $fmt($h) . '–' . $fmt($h + 1);
}

/**
 * Ordered, psychologically-framed nudges. Highest-priority first; the app shows
 * the top one or two. Each: {type, tone, text}.
 */
function momentum_nudges(array $s): array {
    $n = [];
    // 1) Loss aversion — a live streak that ends tonight if untouched.
    if ($s['streak'] >= 2 && !$s['reflectedToday']) {
        $n[] = ['type' => 'loss_aversion', 'tone' => 'urgent', 'text' => "Your {$s['streak']}-day streak ends at midnight — one reflection keeps the chain alive."];
    }
    // 2) Goal-gradient — closing on a personal best.
    if ($s['streak'] > 0 && $s['longestStreak'] > $s['streak'] && ($s['longestStreak'] - $s['streak']) <= 3) {
        $gap = $s['longestStreak'] - $s['streak'];
        $n[] = ['type' => 'goal_gradient', 'tone' => 'motivating', 'text' => "You're {$gap} day" . ($gap === 1 ? '' : 's') . " from your best-ever streak of {$s['longestStreak']}. Don't stop now."];
    }
    // 3) Goal-gradient — next level within reach.
    if ($s['level'] < 5 && $s['xpToNext'] <= 120 && $s['xpToNext'] > 0) {
        $left = (int)ceil($s['xpToNext'] / 60);
        $n[] = ['type' => 'goal_gradient', 'tone' => 'motivating', 'text' => "{$left} more reflection" . ($left === 1 ? '' : 's') . " to reach the next level."];
    }
    // 4) Competence — momentum rising.
    if ($s['trend'] === 'rising') {
        $n[] = ['type' => 'competence', 'tone' => 'affirming', 'text' => "You've reflected more this week than last — your momentum is building."];
    }
    // 5) Fresh start — new week (Monday).
    if ((int)gmdate('N') === 1) {
        $n[] = ['type' => 'fresh_start', 'tone' => 'inviting', 'text' => "A new week — a clean slate. Set the tone with today's reflection."];
    }
    // 6) Productivity — implementation intention around their best window.
    if ($s['bestHourReliable'] && $s['bestHour'] !== null && !$s['reflectedToday']) {
        $n[] = ['type' => 'productivity', 'tone' => 'practical', 'text' => "You reflect most around " . momentum_hour_label((int)$s['bestHour']) . ". Anchor a few minutes there today."];
    }
    // 7) Re-engagement — dipping / broken streak.
    if ($s['streak'] === 0 && $s['totalReflections'] > 0) {
        $n[] = ['type' => 're_engagement', 'tone' => 'gentle', 'text' => "Every streak restarts with one day. Begin again — today counts."];
    }
    // 8) Onboarding encouragement — brand new.
    if ($s['totalReflections'] === 0) {
        $n[] = ['type' => 'onboarding', 'tone' => 'inviting', 'text' => "Your first reflection starts the whole journey. Two minutes is enough."];
    }
    if (!$n && $s['reflectedToday']) {
        $n[] = ['type' => 'competence', 'tone' => 'affirming', 'text' => "Anchored for today. Consistency is the quiet superpower — see you tomorrow."];
    }
    return $n;
}

function member_momentum(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    if (!db_row('SELECT id FROM members WHERE memberId = ?', [$mid])) return ['ok' => false, 'error' => 'member_gone'];
    $s = momentum_signals($mid);
    $s['nudges'] = momentum_nudges($s);
    return ['ok' => true, 'momentum' => $s];
}

// ── AI Reflection Coach ──────────────────────────────────────────────────────
// Socratic, warm, and hard-refuses schoolwork. Runs on the ai.php layer when a
// key is configured; otherwise returns a rotating reflective prompt so the
// feature works (safely) with no AI at all. Stateless — the client sends the
// transcript; nothing is stored (coach chats are private).
const COACH_SYSTEM = "You are the Anchor Reflection Coach for a teenager aged 17 or under in a character-formation program. Your ONLY job is to help them reflect on their own feelings, discipline, habits and growth through short, warm, Socratic follow-up questions. STRICT RULES: (1) NEVER answer academic or homework questions, never solve problems, write essays, define terms for schoolwork, or do anything that could help them cheat or skip learning. If asked, gently refuse and redirect to reflection, e.g. \"I can't do your schoolwork — but I can help you think about how you're facing it. What's making it feel hard?\". (2) Ask ONE thoughtful question at a time. (3) Be encouraging, never judgmental, always age-appropriate and safe. (4) Keep every reply under 45 words.";

function coach_fallback(array $turns): string {
    $prompts = [
        "What made you feel that way today?",
        "That's honest. What would 'doing better' actually look like tomorrow?",
        "I can't help with schoolwork — but tell me, what part of it feels hardest right now?",
        "What's one small thing you controlled well today?",
        "When did you feel most like yourself today?",
        "What would the person you're becoming do next?",
    ];
    return $prompts[count($turns) % count($prompts)];
}

function member_coach(array $p): array {
    $mid = (string)($p['requesterId'] ?? '');
    if (!db_row('SELECT id FROM members WHERE memberId = ?', [$mid])) return ['ok' => false, 'error' => 'member_gone'];
    $turns = is_array($p['messages'] ?? null) ? $p['messages'] : [];
    $clean = [];
    foreach (array_slice($turns, -10) as $t) {
        $role = (($t['role'] ?? '') === 'coach') ? 'coach' : 'me';
        $text = trim((string)($t['text'] ?? ''));
        if ($text === '') continue;
        $clean[] = ['role' => $role, 'text' => substr($text, 0, 800)];
    }
    if (!$clean) return ['ok' => false, 'error' => 'empty'];

    if (ai_enabled('coach')) {
        $r = ai_chat(COACH_SYSTEM, $clean, 220, 'coach');
        if (!empty($r['ok'])) return ['ok' => true, 'reply' => $r['text'], 'source' => 'ai', 'provider' => $r['provider']];
    }
    return ['ok' => true, 'reply' => coach_fallback($clean), 'source' => 'fallback', 'aiConfigured' => ai_enabled('coach')];
}
