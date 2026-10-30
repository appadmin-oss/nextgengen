/* Push notifications: is what PHP sends readable by a browser?
 *
 * A Web Push message that is encrypted or signed slightly wrong is not an
 * error anybody sees — the push service accepts it and the browser silently
 * drops it, so "notifications are on" and nothing ever arrives. The only
 * evidence worth having is an INDEPENDENT reader: this file plays the browser
 * with Node's WebCrypto, written from RFC 8291 / RFC 8292 directly, and opens
 * what api/_lib/domain/push.php produced.
 *
 *   1. Node makes a browser's key pair and auth secret (as PushManager would).
 *   2. PHP encrypts a payload to them and signs a VAPID token.
 *   3. Node decrypts the payload and verifies the token's ES256 signature.
 *
 * push.php's crypto functions use nothing from any other domain, so the PHP
 * half loads that one file rather than the whole bootstrap (which needs a
 * config and a database for no reason here).
 */
const { execFileSync } = require("child_process");
const path = require("path");
const crypto = require("crypto");
const { subtle } = crypto.webcrypto;

let pass = 0, fail = 0;
const chk = (label, cond, extra) => { if (cond) { pass++; console.log("  ok   " + label); } else { fail++; console.log("  FAIL " + label + (extra ? " — " + extra : "")); } };
const b64u = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

async function hkdf(salt, ikm, info, len) {
  const k = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return Buffer.from(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}

/** The browser's side of RFC 8291 §3–4, from the RFC, not from push.php. */
async function decrypt(body, uaKeys, uaPubRaw, auth) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const peer = await subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = Buffer.from(await subtle.deriveBits({ name: "ECDH", public: peer }, uaKeys.privateKey, 256));
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPubRaw, asPub]);
  const ikm = await hkdf(auth, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const key = await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = Buffer.from(await subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, key, ct));
  // The last record ends with a 0x02 delimiter, then optional zero padding.
  let end = plain.length - 1; while (end >= 0 && plain[end] === 0) end--;
  return { rs, idlen, delim: plain[end], text: plain.subarray(0, end).toString("utf8") };
}

(async () => {
  console.log("push-crypto");
  const ua = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPubRaw = Buffer.from(await subtle.exportKey("raw", ua.publicKey));
  const auth = crypto.randomBytes(16);
  const payload = JSON.stringify({ title: "Your request was answered — ₦12,000 posted", body: "Ọmọ́ is checked in", url: "/dashboard/records" });

  const php = `
    require ${JSON.stringify(path.join(__dirname, "..", "api/_lib/domain/push.php"))};
    $GLOBALS['CONFIG'] = ['app_origin' => 'https://ngg.example', 'push' => ['contact' => 'mailto:ops@ngg.example']];
    $k = push_new_ec_key(); openssl_pkey_export($k, $pem); $pub = push_b64u(push_key_raw($k));
    $in = json_decode(stream_get_contents(STDIN), true);
    echo json_encode([
      'body' => base64_encode(push_encrypt($in['payload'], $in['p256dh'], $in['auth'])),
      'body2' => base64_encode(push_encrypt($in['payload'], $in['p256dh'], $in['auth'])),
      'bad' => push_encrypt($in['payload'], 'AAAA', $in['auth']),
      'jwt' => push_jwt('https://fcm.googleapis.com/fcm/send/abc:def', $pem),
      'pub' => $pub,
      'okHosts' => array_map('push_endpoint_ok', ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QG',
                                                   'https://wns2-bl2p.notify.windows.com/w/?token=x', 'https://jmt17.google.com/fcm/send/x']),
      'badHosts' => array_map('push_endpoint_ok', ['http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://evil.example/fcm.googleapis.com',
                                                    'https://fcm.googleapis.com.evil.example/x', 'https://localhost/x']),
    ]);`;
  const out = JSON.parse(execFileSync("php", ["-r", php], { input: JSON.stringify({ payload, p256dh: b64u(uaPubRaw), auth: b64u(auth) }) }).toString());

  // 1. The payload opens with the browser's keys and reads back exactly.
  const body = Buffer.from(out.body, "base64");
  let d = null;
  try { d = await decrypt(body, ua, uaPubRaw, auth); } catch (e) { chk("decrypts with the browser's private key", false, e.message); }
  if (d) {
    chk("decrypts with the browser's private key", true);
    chk("the words come back exactly, accents and ₦ included", d.text === payload, d.text);
    chk("record size 4096 and a 65-byte key id in the header", d.rs === 4096 && d.idlen === 65);
    chk("ends with the last-record delimiter 0x02", d.delim === 2);
  }
  chk("each message has a fresh key and salt (two sends never match)", out.body !== out.body2);
  chk("a malformed browser key is refused, not encrypted to", out.bad === "");

  // 2. Somebody else's keys cannot open it.
  const other = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  let opened = true;
  try { await decrypt(body, other, uaPubRaw, auth); } catch (_) { opened = false; }
  chk("a different browser cannot read it", !opened);

  // 3. The VAPID token verifies against the public key we publish.
  const [h, c, s] = out.jwt.split(".");
  const claims = JSON.parse(unb64u(c).toString());
  const header = JSON.parse(unb64u(h).toString());
  chk("token header says ES256", header.alg === "ES256" && header.typ === "JWT");
  chk("audience is the push service's origin, not its full URL", claims.aud === "https://fcm.googleapis.com");
  chk("expires within 24 hours, as push services require", claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 86400);
  chk("names a contact", claims.sub === "mailto:ops@ngg.example");
  const pubRaw = unb64u(out.pub);
  chk("published key is a 65-byte uncompressed P-256 point", pubRaw.length === 65 && pubRaw[0] === 4);
  const vkey = await subtle.importKey("raw", pubRaw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const sig = unb64u(s);
  chk("signature is 64 raw bytes (r‖s), not DER", sig.length === 64);
  const good = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vkey, sig, Buffer.from(h + "." + c));
  chk("signature verifies with the published key", good);
  const tampered = Buffer.from(h + "." + b64u(Buffer.from(JSON.stringify(Object.assign({}, claims, { aud: "https://evil.example" })))));
  chk("a changed token does not verify", !(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vkey, sig, tampered)));

  // 4. Only real push services are ever POSTed to.
  chk("Google, Mozilla, Apple and Microsoft push services are accepted", out.okHosts.every(Boolean), JSON.stringify(out.okHosts));
  chk("http, metadata IPs, look-alike hosts and localhost are refused", out.badHosts.every(x => !x), JSON.stringify(out.badHosts));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
