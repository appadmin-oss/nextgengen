<?php
/**
 * Markup for the curriculum document. Receives $doc (see
 * member_curriculum_document) and $format ('html' | 'doc'); every value is
 * escaped here, so a lesson's text can never become markup.
 */
$e = static fn($v) => htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$m = $doc['member'];
$date = substr((string)$doc['generatedAt'], 0, 10);
// A course export (admin.curriculum.document) is nobody's progress: 'staff' carries answers, 'member' is a clean copy.
$edition = (string)($doc['edition'] ?? '');
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $e($doc['title'] . ' — ' . $m['fullName']) ?></title>
<style><?= $css ?></style></head>
<body><main class="cd-page">
<?php if ($format === 'html'): ?>
  <div class="cd-toolbar"><a href="?<?= $e(http_build_query(array_merge($_GET, ['format' => 'doc']))) ?>">Download as Word</a><button type="button" onclick="window.print()">Save as PDF</button></div>
<?php endif; ?>
  <header class="cd-cover">
    <p class="cd-kicker">Next Generation Genius · NGG Club</p>
    <h1 class="cd-title"><?= $e($doc['title']) ?></h1>
    <dl class="cd-meta">
<?php if ($edition !== ''): ?>
      <div><dt>Edition</dt><dd><?= $e($m['fullName']) ?></dd></div>
      <div><dt>Lessons</dt><dd><?= (int)$doc['total'] ?></dd></div>
      <div><dt>Prepared</dt><dd><?= $e($date) ?></dd></div>
<?php else: ?>
      <div><dt>Member</dt><dd><?= $e($m['fullName']) ?></dd></div>
      <div><dt>Centre</dt><dd><?= $e($m['centre'] !== '' ? $m['centre'] : '—') ?></dd></div>
      <div><dt>Progress</dt><dd><?= (int)$doc['completed'] ?> of <?= (int)$doc['total'] ?> lessons · <?= (int)$doc['pct'] ?>%</dd></div>
<?php endif; ?>
    </dl>
  </header>
<?php if (!$doc['weeks']): ?>
  <p>No lessons have been published for this course yet.</p>
<?php endif; ?>
<?php foreach ($doc['weeks'] as $w): ?>
  <section class="cd-week">
    <h2 class="cd-week-h"><?= $e($w['label'] ?? ('Week ' . (int)$w['week'])) ?></h2>
<?php foreach ($w['lessons'] as $u): $pr = $u['progress']; $isDone = $pr && $pr['status'] === 'completed'; ?>
    <article class="cd-lesson">
<?php if ($edition === ''): ?>      <span class="cd-status<?= $isDone ? ' is-done' : '' ?>"><?= $isDone ? 'Done · ' . (int)$pr['bestPct'] . '%' : ($pr ? 'Started' : 'Not started') ?></span>
<?php endif; ?>
      <h3><?= $e($u['title']) ?></h3>
      <p class="cd-sub"><?= $e(trim(($u['course'] !== '' ? $u['course'] : 'Whole Club') . ($u['level'] !== '' ? ' · ' . $u['level'] : '') . ($u['durationMins'] ? ' · ' . $u['durationMins'] . ' min' : ''))) ?></p>
<?php if ($u['summary'] !== ''): ?>      <p><?= $e($u['summary']) ?></p>
<?php endif; ?>
<?php if ($u['objectives']): ?>      <p class="cd-label">What you'll learn</p><ul class="cd-objectives"><?php foreach ($u['objectives'] as $o): ?><li><?= $e($o) ?></li><?php endforeach; ?></ul>
<?php endif; ?>
<?php if (trim($u['body']) !== ''): ?>      <p class="cd-label">The lesson</p><div class="cd-body"><?= curriculum_text_html($u['body']) ?></div>
<?php endif; ?>
<?php if ($u['materials']): ?>      <p class="cd-label">Materials</p><ul class="cd-materials"><?php foreach ($u['materials'] as $mat): ?><li><?= $e($mat['title'] !== '' ? $mat['title'] : $mat['kind']) ?> — <a href="<?= $e(curriculum_absolute_url($mat['url'])) ?>"><?= $e(curriculum_absolute_url($mat['url'])) ?></a></li><?php endforeach; ?></ul>
<?php endif; ?>
<?php if ($u['checks']): ?>      <p class="cd-label">Check your understanding</p><ol class="cd-checks"><?php foreach ($u['checks'] as $c): ?><li><?= $e($c['prompt']) ?><?php if ($c['options']): ?> <em>(<?= $e(implode(' · ', $c['options'])) ?>)</em><?php endif; ?><?php if (($c['answerText'] ?? '') !== ''): ?><br><strong>Answer:</strong> <?= $e($c['answerText']) ?><?php endif; ?><?php if (($c['rubric'] ?? '') !== ''): ?><br><strong>Marking guide:</strong> <?= $e($c['rubric']) ?><?php endif; ?></li><?php endforeach; ?></ol>
<?php endif; ?>
    </article>
<?php endforeach; ?>
  </section>
<?php endforeach; ?>
<?php if ($edition === 'staff'): ?>
  <footer class="cd-foot">Instructor edition, prepared <?= $e($date) ?>. It carries the answers and marking guides: do not hand it to members. Weekly assignments are set and marked on the assignments desk.</footer>
<?php elseif ($edition === 'member'): ?>
  <footer class="cd-foot">Prepared <?= $e($date) ?>. Answer the checks in your member portal, where they are marked; your assignments are set there too.</footer>
<?php else: ?>
  <footer class="cd-foot">Prepared <?= $e($date) ?> for <?= $e($m['fullName']) ?> (<?= $e($m['memberId']) ?>). Answer the checks in your member portal, where they are marked.</footer>
<?php endif; ?>
</main></body></html>
