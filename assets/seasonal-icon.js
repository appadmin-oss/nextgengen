/* ============================================================================
   NGG — dynamic, season-aware app icon (Duolingo-style).
   Picks a seasonal/event theme from today's date, paints a favicon at runtime
   (logo on an accent-tinted badge + a seasonal glyph) and tints the browser
   theme-color. Exposes window.NGGSeason = { key, label, accent, glyph } so the
   apps can react. Pure vanilla, no deps; same-origin logo so the canvas is
   never tainted.

   NOTE: this changes the browser TAB icon + in-app mark. The INSTALLED
   home-screen icon is a native concern — the TWA/Capacitor wrapper switches
   alternate icons (iOS setAlternateIconName / Android activity-alias). Keep the
   SEASONS table here as the single source of truth and mirror it there.
   ============================================================================ */
(function () {
  // Each: [startMonth, startDay, endMonth, endDay] (1-based, inclusive), theme.
  // First match wins; ranges may cross year-end (e.g. festive). Default = anchor.
  var SEASONS = [
    { r: [1, 1, 1, 6],    key: "newyear",   label: "New Year",       accent: "#ffce54", glyph: "✨" },      // ✨
    { r: [3, 20, 5, 31],  key: "spring",    label: "Spring",         accent: "#6ab04c", glyph: "🌱" }, // 🌱
    { r: [7, 1, 8, 31],   key: "summer",    label: "Summer School",  accent: "#ff9f43", glyph: "☀️" }, // ☀️
    { r: [9, 25, 10, 3],  key: "independence", label: "Independence", accent: "#2e9e5b", glyph: "🌿" }, // 🌿 (Nigeria Oct 1)
    { r: [10, 25, 10, 31], key: "spooky",   label: "Halloween",      accent: "#8b5cf6", glyph: "🎃" }, // 🎃
    { r: [12, 15, 12, 31], key: "festive",  label: "Festive",        accent: "#d94b4b", glyph: "🎄" }, // 🎄
  ];
  var DEFAULT = { key: "anchor", label: "Anchor", accent: "#c9f24e", glyph: "⚓" }; // ⚓
  var BASE = "#0c1432"; // brand navy base so the mark stays recognizable

  function inRange(m, d, r) {
    var s = r[0] * 100 + r[1], e = r[2] * 100 + r[3], x = m * 100 + d;
    return s <= e ? (x >= s && x <= e) : (x >= s || x <= e); // wrap year-end
  }
  function pick(date) {
    var m = date.getMonth() + 1, d = date.getDate();
    for (var i = 0; i < SEASONS.length; i++) if (inRange(m, d, SEASONS[i].r)) return SEASONS[i];
    return DEFAULT;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function setFavicon(href) {
    var links = document.querySelectorAll('link[rel~="icon"]');
    if (!links.length) { var l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); links = [l]; }
    links.forEach(function (l) { l.type = "image/png"; l.href = href; });
  }

  function paint(theme) {
    var S = 128, img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement("canvas"); c.width = S; c.height = S;
        var x = c.getContext("2d");
        // accent-tinted rounded badge over the navy base
        roundRect(x, 0, 0, S, S, 28); x.fillStyle = BASE; x.fill();
        var g = x.createRadialGradient(S * 0.3, S * 0.22, 8, S * 0.5, S * 0.5, S * 0.75);
        g.addColorStop(0, theme.accent); g.addColorStop(1, "rgba(0,0,0,0)");
        roundRect(x, 0, 0, S, S, 28); x.save(); x.clip(); x.globalAlpha = 0.42; x.fillStyle = g; x.fillRect(0, 0, S, S); x.restore();
        // logo, centered
        var ls = Math.round(S * 0.62), off = Math.round((S - ls) / 2);
        x.drawImage(img, off, off - 6, ls, ls);
        // seasonal glyph in a light badge, bottom-right
        var bx = S - 34, by = S - 34;
        x.beginPath(); x.arc(bx + 13, by + 13, 17, 0, Math.PI * 2); x.fillStyle = "#fff"; x.fill();
        x.font = "20px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
        x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(theme.glyph, bx + 13, by + 15);
        setFavicon(c.toDataURL("image/png"));
      } catch (e) { /* leave the static favicon in place */ }
    };
    img.src = "/assets/logo.png";
  }

  var theme = pick(new Date());
  // Exposed so an app can *intentionally* pick up the season accent (we don't
  // auto-tint the status bar — a bright bar over the dark UI reads poorly).
  // Clean public shape only (the internal date range stays private).
  window.NGGSeason = { key: theme.key, label: theme.label, accent: theme.accent, glyph: theme.glyph };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { paint(theme); });
  else paint(theme);
})();
