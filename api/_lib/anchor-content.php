<?php
declare(strict_types=1);

/**
 * Default Anchor Journal content (weeks, quotes, daily systems). Admins edit
 * this via Admin → Anchor; the edited copy is stored in settings under
 * `anchor_content` and served to the Journal PWA. These defaults are the
 * starting point and the fallback if nothing has been saved yet.
 */
function anchor_default_content(): array {
    return [
        'weeks' => [
            ['title' => 'Identity · Awareness & Reset', 'system' => 'Self-awareness & reset', 'focus' => 'Name who you are becoming.', 'home' => 'Make your bed; greet your family each morning.', 'school' => 'Arrive settled, not rushed.', 'peer' => 'Notice who you follow — and why.', 'journal' => 'Who am I when no one is watching?'],
            ['title' => 'Study Time System', 'system' => 'A fixed study time', 'focus' => 'Same time, same place, every day.', 'home' => 'Study before screens.', 'school' => 'Review each day\'s notes within 24 hours.', 'peer' => 'Invite a friend to study with you.', 'journal' => 'When do I focus best — and why?'],
            ['title' => 'Personal Hygiene', 'system' => 'Daily hygiene', 'focus' => 'Clean body, clear mind.', 'home' => 'Bath, brush, tidy your space.', 'school' => 'Neat uniform and materials.', 'peer' => 'Model care, not vanity.', 'journal' => 'What does self-respect look like today?'],
            ['title' => 'Device Control', 'system' => 'Device boundaries', 'focus' => 'Own the phone — don\'t be owned.', 'home' => 'Phone in a drawer while studying.', 'school' => 'No phone in class.', 'peer' => 'Lead a screen-free hangout.', 'journal' => 'What did my phone cost me today?'],
            ['title' => 'Note-Taking', 'system' => 'A note-taking system', 'focus' => 'Capture — don\'t just consume.', 'home' => 'Summarize your day in three lines.', 'school' => 'One-page notes per subject.', 'peer' => 'Share a useful note with a friend.', 'journal' => 'What idea deserved a note today?'],
            ['title' => 'Respect System', 'system' => 'Respect for authority', 'focus' => 'Honor those who lead you.', 'home' => 'Speak kindly to your family.', 'school' => 'Respect teachers, even when it\'s hard.', 'peer' => 'Defend someone being mocked.', 'journal' => 'Where was my respect tested today?'],
            ['title' => 'Time Consciousness', 'system' => 'Time consciousness', 'focus' => 'On time is early.', 'home' => 'Sleep and wake on schedule.', 'school' => 'Beat the bell.', 'peer' => 'Keep a promise on time.', 'journal' => 'Where did I waste time today?'],
            ['title' => 'Self-Control', 'system' => 'Self-control', 'focus' => 'Master the impulse.', 'home' => 'Pause before reacting at home.', 'school' => 'No cheating, no shortcuts.', 'peer' => 'Walk away from trouble.', 'journal' => 'What did I resist today?'],
            ['title' => 'Integrity', 'system' => 'Integrity', 'focus' => 'Do right when unseen.', 'home' => 'Return what isn\'t yours.', 'school' => 'Honest marks only.', 'peer' => 'Tell a hard truth, kindly.', 'journal' => 'Where was I fully honest today?'],
            ['title' => 'Responsibility', 'system' => 'Responsibility', 'focus' => 'Own the outcome.', 'home' => 'Take a chore without being asked.', 'school' => 'Own a mistake at school.', 'peer' => 'Carry a friend\'s load.', 'journal' => 'What did I take responsibility for?'],
            ['title' => 'Independent Integrity', 'system' => 'Independent integrity', 'focus' => 'Discipline without supervision.', 'home' => 'Do right with no one home.', 'school' => 'Study without being told.', 'peer' => 'Set the standard for your peers.', 'journal' => 'Who am I without an audience?'],
            ['title' => 'Review & Leadership', 'system' => 'Review & leadership', 'focus' => 'Lead by example.', 'home' => 'Serve your household.', 'school' => 'Help a struggling classmate.', 'peer' => 'Bring two friends to NGG.', 'journal' => 'Who have I become in twelve weeks?'],
        ],
        'quotes' => [
            'The purpose of life is not to be happy — it is to be useful, honorable and compassionate.',
            'To live is the rarest thing in the world. Most people exist, that is all.',
            'Our most authentic capacity is to overcome, endure, transform and love.',
            'No matter how strong you are, if your steps are not arranged you will stumble before your destiny.',
            'The plans of the diligent lead surely to abundance.',
            'Lack of order destroys strength.',
            'Live out of your imagination, not your history.',
            'I can be changed by what happens to me, but I refuse to be reduced by it.',
            'The value of life is measured by how much of it was given away.',
            'I have more understanding than all my teachers, for Your testimonies are my meditation.',
            'Stand firm and disciplined in ranks, as a solid structure.',
            'Persevere, endure and remain stationed — that you may succeed.',
        ],
        'systems' => [
            ['key' => 'woke', 'label' => 'Woke up on time', 'icon' => 'ph-sun-horizon'],
            ['key' => 'study', 'label' => 'Studied at my fixed time', 'icon' => 'ph-book-open-text'],
            ['key' => 'clean', 'label' => 'Kept myself clean', 'icon' => 'ph-drop'],
            ['key' => 'phone', 'label' => 'Controlled my phone', 'icon' => 'ph-device-mobile'],
            ['key' => 'respect', 'label' => 'Respected authority', 'icon' => 'ph-handshake'],
            ['key' => 'time', 'label' => 'Was time-conscious', 'icon' => 'ph-clock'],
        ],
        'tilt' => true,   // 3D tilt effect toggle
    ];
}

/** Stored content merged over defaults (so partial saves stay complete). */
function anchor_content(): array {
    $stored = setting_get('anchor_content');
    $def = anchor_default_content();
    if (!is_array($stored)) return $def;
    return array_merge($def, $stored);
}
