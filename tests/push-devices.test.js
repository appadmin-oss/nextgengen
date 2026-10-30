/* Push notifications on every device: does each one get a working button or
 * the one sentence that would make it work?
 *
 * nggPushEnv() (components.jsx) decides, from what the browser actually
 * exposes, whether this device can be reached and — when it cannot — which
 * instruction to show. Each case below is a real device's user agent with the
 * capabilities that device really has (an iPhone Safari tab has no
 * PushManager until NGG is on the Home Screen; a WhatsApp page has none at
 * all). The helpers that paper over browser differences are held too:
 * permission asked by promise or by callback (older Safari), keys read off the
 * subscription where toJSON leaves them out, and a subscription whose key the
 * browser will not reveal treated as unchanged rather than re-made on every
 * visit.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0;
const chk = (label, cond, extra) => { if (cond) { pass++; console.log("  ok   " + label); } else { fail++; console.log("  FAIL " + label + (extra ? " — " + extra : "")); } };

const src = fs.readFileSync(path.join(__dirname, "..", "components.jsx"), "utf8");
const grab = (re) => { const m = src.match(re); if (!m) throw new Error("not found: " + re); return m[0]; };
const code = [
  grab(/function nggPushEnv\(\) \{[\s\S]*?\n\}\n/),
  grab(/const NGG_PUSH_WHY = \{[\s\S]*?\n\};\n/),
  grab(/function nggPushAsk\(\) \{[\s\S]*?\n\}\n/),
  grab(/function nggPushSubJson\(sub\) \{[\s\S]*?\n\}\n/),
  grab(/function nggPushSameKey\(sub, key\) \{[\s\S]*?\n\}\n/),
].join("\n") + "\nthis.out = { nggPushEnv, NGG_PUSH_WHY, nggPushAsk, nggPushSubJson, nggPushSameKey };";

function env(ua, o) {
  o = o || {};
  const win = { isSecureContext: o.secure !== false, matchMedia: q => ({ matches: !!o.standalone && /standalone/.test(q) }) };
  const nav = { userAgent: ua, platform: o.platform || "", maxTouchPoints: o.touch || 0 };
  if (o.push !== false) { nav.serviceWorker = {}; win.PushManager = function () {}; win.Notification = { permission: o.perm || "default" }; }
  const ctx = { window: win, navigator: nav, btoa: s => Buffer.from(s, "binary").toString("base64"), Promise };
  if (o.push !== false) ctx.Notification = win.Notification;
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return ctx.out;
}

const UA = {
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  tecno: "Mozilla/5.0 (Linux; Android 12; TECNO KG5p) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  operaMini: "Mozilla/5.0 (Linux; Android 11; Infinix X689) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 OPR/80.0.0.0",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  iphoneSafari17: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphone157: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
  iphone163: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  ipadDesktopUA: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  whatsappAndroid: "Mozilla/5.0 (Linux; Android 13; SM-A135F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 WhatsApp/2.24",
  instagramIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0",
  macSafari15: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15",
  macSafari17: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0",
  chromeLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

(async () => {
  console.log("push-devices");
  const can = [["Chrome on Android", UA.chromeAndroid], ["Samsung Internet", UA.samsung], ["Chrome on a Tecno phone", UA.tecno], ["Opera on an Infinix phone", UA.operaMini],
    ["Firefox on Android", UA.firefoxAndroid], ["Chrome on Windows", UA.chromeWin], ["Edge on Windows", UA.edgeWin], ["Firefox on a Mac", UA.firefoxMac],
    ["Safari 17 on a Mac", UA.macSafari17], ["Chrome on Linux", UA.chromeLinux]];
  for (const [name, ua] of can) { const r = env(ua).nggPushEnv(); chk(name + ": can be turned on", r.ok === true, JSON.stringify(r)); }
  let r = env(UA.iphoneSafari17, { push: true, standalone: true }).nggPushEnv();
  chk("iPhone, iOS 17, NGG on the Home Screen: can be turned on", r.ok === true && r.ios === true && r.standalone === true, JSON.stringify(r));
  r = env(UA.ipadDesktopUA, { push: true, standalone: true, platform: "MacIntel", touch: 5 }).nggPushEnv();
  chk("iPad (desktop-class Safari), on the Home Screen: can be turned on", r.ok === true && r.ios === true);

  const cannot = [
    ["iPhone, iOS 17, Safari tab", UA.iphoneSafari17, { push: false }, "ios_install", /Add to Home Screen/],
    ["iPad that says it is a Mac, Safari tab", UA.ipadDesktopUA, { push: false, platform: "MacIntel", touch: 5 }, "ios_install", /Home Screen/],
    ["iPhone, Chrome", UA.iphoneChrome, { push: false }, "ios_other_browser", /Open this page in Safari/],
    ["iPhone, iOS 15.7", UA.iphone157, { push: false, standalone: true }, "ios_old", /iOS 16\.4/],
    ["iPhone, iOS 16.3, even on the Home Screen", UA.iphone163, { push: false, standalone: true }, "ios_old", /Software Update/],
    ["WhatsApp's built-in browser on Android", UA.whatsappAndroid, { push: false }, "in_app", /Open in browser/],
    ["Instagram's built-in browser on iPhone", UA.instagramIphone, { push: false }, "in_app", /Chrome or Safari/],
    ["Safari 15 on a Mac", UA.macSafari15, { push: false }, "safari_old", /Safari 16/],
    ["A page served without HTTPS", UA.chromeAndroid, { secure: false }, "unsupported", /can’t receive/],
    ["Notifications blocked for the site", UA.chromeAndroid, { perm: "denied" }, "denied", /allow Notifications/],
  ];
  for (const [name, ua, o, why, re] of cannot) {
    const E = env(ua, o), x = E.nggPushEnv();
    chk(name + ": says why, and what to do (" + x.why + ")", x.ok === false && x.why === why && re.test(E.NGG_PUSH_WHY[x.why] || ""), JSON.stringify(x));
  }
  const E = env(UA.chromeAndroid);
  chk("every reason the card can give has words", ["ios_install", "ios_other_browser", "ios_old", "safari_old", "in_app", "brave", "service", "denied", "unsupported"].every(k => (E.NGG_PUSH_WHY[k] || "").length > 40));

  // Permission: promise-style browsers and callback-style older Safari.
  const ctxP = env(UA.chromeAndroid); ctxP.nggPushAsk; // compile
  {
    const E2 = env(UA.chromeAndroid);
    const fakeP = { requestPermission: () => Promise.resolve("granted"), permission: "default" };
    const c = vm.createContext({ Notification: fakeP, Promise }); vm.runInContext(grab(/function nggPushAsk\(\) \{[\s\S]*?\n\}\n/) + "this.f = nggPushAsk;", c);
    chk("permission asked by promise (Chrome, Firefox, Safari 16+)", (await c.f()) === "granted");
    const fakeC = { requestPermission: cb => { setTimeout(() => cb("granted"), 5); return undefined; }, permission: "default" };
    const c2 = vm.createContext({ Notification: fakeC, Promise, setTimeout }); vm.runInContext(grab(/function nggPushAsk\(\) \{[\s\S]*?\n\}\n/) + "this.f = nggPushAsk;", c2);
    chk("permission asked by callback (older Safari) is still heard", (await c2.f()) === "granted");
    void E2;
  }
  // Keys: from toJSON, or read off the subscription.
  const raw65 = Buffer.alloc(65, 7); raw65[0] = 4; const raw16 = Buffer.alloc(16, 9);
  const noJson = { endpoint: "https://web.push.apple.com/QX", toJSON: () => ({ endpoint: "https://web.push.apple.com/QX" }),
    getKey: n => (n === "p256dh" ? raw65 : raw16).buffer.slice(0) };
  const j = E.nggPushSubJson(noJson);
  chk("keys missing from toJSON are read off the subscription", Buffer.from(j.keys.p256dh.replace(/-/g, "+").replace(/_/g, "/"), "base64").length === 65 && j.keys.auth.length >= 21);
  chk("a browser that hides the subscription's key is not re-subscribed on every visit", E.nggPushSameKey({ options: {} }, new Uint8Array([1, 2])) === true);
  chk("…but a key that really changed is noticed", E.nggPushSameKey({ options: { applicationServerKey: new Uint8Array([1, 3]).buffer } }, new Uint8Array([1, 2])) === false);

  // What the worker shows.
  const sw = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");
  const badge = (sw.match(/badge: '([^']+)'/) || [])[1];
  chk("the Android badge is its own monochrome image, and it exists", badge === "/assets/icons/badge-96.png" && fs.existsSync(path.join(__dirname, "..", badge)));
  const png = fs.readFileSync(path.join(__dirname, "..", "assets/icons/badge-96.png"));
  chk("…a PNG with transparency (colour type 6), 96×96", png.readUInt32BE(16) === 96 && png.readUInt32BE(20) === 96 && png[25] === 6);
  chk("urgent alerts vibrate as well as staying on screen", /opts\.vibrate = \[/.test(sw) && /requireInteraction = true/.test(sw));
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.webmanifest"), "utf8"));
  chk("the app installs standalone (iOS only delivers push to a Home Screen app)", man.display === "standalone" && man.start_url && (man.icons || []).some(i => /192/.test(i.sizes)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
