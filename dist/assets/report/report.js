/* NGG printed documents (progress reports, dues statements and registers): the "Print or save as PDF" button.
   An external file rather than an inline onclick, because the production policy allows no inline handlers.
   The button waits for the self-hosted fonts (SPEC: "await document.fonts.ready before enabling"), so a PDF is
   never saved in the fallback face. */
(function () {
  var b = document.querySelector('[data-print]');
  if (!b) return;
  b.disabled = true;
  var ready = function () { b.disabled = false; };
  try { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(ready, ready); } catch (e) { ready(); }
  setTimeout(ready, 4000);   // never leave the button dead if a font never arrives
  b.addEventListener('click', function () { window.print(); });
})();
