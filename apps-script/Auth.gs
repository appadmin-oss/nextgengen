/**
 * Authentication — magic link + OTP, plus TOTP 2FA for admins.
 *
 * Two-step:
 *   1. `auth.request`  →  caller sends { memberId or email }, we issue a
 *      magic-link token + OTP, email both, return masked email.
 *   2. `auth.verify`   →  caller sends { token } OR { memberId, otp }, we
 *      consume the row, return a member object the PHP proxy turns into
 *      a signed session cookie.
 *
 * Admin extra:
 *   3. `auth.totpVerify` — once a member has `role=admin`, accessing /admin
 *      requires a fresh TOTP code (PHP enforces; we just verify).
 */

// ---------- Step 1 — request ----------

function Auth_request(p, e) {
  const ip = (p.ip || (e && e.parameter && e.parameter.ip) || '').toString();
  if (!rateLimit_('rl:auth:' + ip, CONFIG.rateLimitMax, CONFIG.rateLimitWindowSec)) {
    return { ok: false, error: 'rate_limited' };
  }

  const identifier = String(p.identifier || '').trim().toLowerCase();
  if (!identifier) return { ok: false, error: 'no_identifier' };

  const member = findRow_('Members', r =>
    String(r.memberId || '').toLowerCase() === identifier ||
    String(r.email || '').toLowerCase() === identifier
  );

  // Constant-time response: even on miss, return ok so attackers can't
  // enumerate which IDs exist. Real magic link only goes out on hit.
  const maskedEmail = member ? maskEmail_(member.email) : maskEmail_(identifier.includes('@') ? identifier : 'a@b.co');

  if (!member) {
    audit_('login.fail.unknown', null, identifier, { identifier }, ip);
    return { ok: true, masked: maskedEmail, _silent: true };
  }
  if (String(member.status) === 'suspended') {
    audit_('login.fail.suspended', member.memberId, member.memberId, {}, ip);
    return { ok: true, masked: maskedEmail, _silent: true };
  }

  const token = randHex_(32);
  const otp = newOtp_();
  const now = new Date();
  const expires = new Date(now.getTime() + CONFIG.authTtlSec * 1000);

  appendRow_('AuthSessions', {
    token: token,
    memberId: member.memberId,
    email: member.email,
    otp: otp,
    attempts: 0,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    verifiedAt: '',
    ip: ip,
    userAgent: String(p.userAgent || ''),
  });

  const link = (CONFIG.appOrigin || '') + '/?signin=' + encodeURIComponent(token);
  const html = renderMagicLinkEmail_(member, link, otp);
  try {
    sendMail_(member.email, 'Your sign-in to Next Generation Genius', html);
  } catch (err) {
    audit_('login.mail_fail', member.memberId, member.memberId, { err: String(err) }, ip);
    return { ok: false, error: 'mail_failed' };
  }

  audit_('login.request', member.memberId, member.memberId, {}, ip);
  return { ok: true, masked: maskedEmail };
}

// ---------- Step 2 — verify ----------

function Auth_verify(p, e) {
  const ip = String(p.ip || '');
  const t = String(p.token || '').trim();
  const memberId = String(p.memberId || '').trim();
  const otp = String(p.otp || '').trim();

  if (!rateLimit_('rl:verify:' + ip, 10, 60)) {
    return { ok: false, error: 'rate_limited' };
  }

  let challenge = null;
  if (t) {
    challenge = findRow_('AuthSessions', r => String(r.token) === t);
  } else if (memberId && otp) {
    challenge = findRow_('AuthSessions', r =>
      String(r.memberId) === memberId && String(r.otp) === otp && !r.verifiedAt);
  } else {
    return { ok: false, error: 'no_credentials' };
  }
  if (!challenge) {
    audit_('login.fail.bad_token', memberId || null, '', { ip }, ip);
    return { ok: false, error: 'invalid' };
  }

  const expiresAt = new Date(challenge.expiresAt);
  if (Date.now() > expiresAt.getTime()) {
    audit_('login.fail.expired', challenge.memberId, '', {}, ip);
    return { ok: false, error: 'expired' };
  }
  if (challenge.verifiedAt) {
    audit_('login.fail.replay', challenge.memberId, '', {}, ip);
    return { ok: false, error: 'already_used' };
  }
  if (Number(challenge.attempts || 0) >= 5) {
    return { ok: false, error: 'too_many_attempts' };
  }

  // Mark consumed.
  patchRow_('AuthSessions', challenge.__rowNumber, { verifiedAt: nowIso_() });

  const member = findRow_('Members', r => String(r.memberId) === String(challenge.memberId));
  if (!member) return { ok: false, error: 'member_gone' };

  audit_('login.success', member.memberId, member.memberId, {}, ip);
  return { ok: true, member: publicMember_(member) };
}

// ---------- auth.me — re-fetch live member object for an active session ----------

function Auth_me(p, e) {
  const memberId = String(p.memberId || '');
  const member = findRow_('Members', r => String(r.memberId) === memberId);
  if (!member) return { ok: false, error: 'not_found' };
  return { ok: true, member: publicMember_(member) };
}

function Auth_logout(p, e) {
  // Session lives in a signed cookie on the PHP side. Nothing server-side to
  // invalidate; we just audit.
  audit_('logout', String(p.memberId || null), String(p.memberId || ''), {}, String(p.ip || ''));
  return { ok: true };
}

// ---------- TOTP for admins ----------

function Auth_totpSetup(p, e) {
  const memberId = String(p.memberId || '');
  const member = findRow_('Members', r => String(r.memberId) === memberId);
  if (!member) return { ok: false, error: 'not_found' };
  if (!isAdminRole_(member.role)) return { ok: false, error: 'forbidden' };

  // Generate a 20-byte base32 secret.
  const secret = randBase32_(20);
  patchRow_('Members', member.__rowNumber, { totpSecret: secret, updatedAt: nowIso_() });
  audit_('admin.totp.setup', member.memberId, member.memberId, {}, String(p.ip || ''));
  const otpauth = 'otpauth://totp/NGG%20Admin:' + encodeURIComponent(member.email)
    + '?secret=' + secret + '&issuer=NGG%20Admin&algorithm=SHA1&digits=6&period=30';
  return { ok: true, secret: secret, otpauth: otpauth };
}

function Auth_totpVerify(p, e) {
  const memberId = String(p.memberId || '');
  const code = String(p.code || '').replace(/\s+/g, '');
  const member = findRow_('Members', r => String(r.memberId) === memberId);
  if (!member || !member.totpSecret) return { ok: false, error: 'no_totp' };
  if (!isAdminRole_(member.role)) return { ok: false, error: 'forbidden' };

  const now = Math.floor(Date.now() / 1000 / 30);
  // Accept current ± 1 step for clock skew.
  for (const drift of [-1, 0, 1]) {
    if (totpCode_(member.totpSecret, now + drift) === code) {
      audit_('admin.totp.ok', member.memberId, member.memberId, {}, String(p.ip || ''));
      return { ok: true };
    }
  }
  audit_('admin.totp.fail', member.memberId, member.memberId, {}, String(p.ip || ''));
  return { ok: false, error: 'invalid_code' };
}

// ---------- helpers ----------

function isAdminRole_(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

function publicMember_(m) {
  // Strip sensitive columns before returning to the client.
  return {
    memberId: m.memberId,
    fullName: m.fullName,
    email: m.email,
    type: m.type,
    status: m.status,
    role: m.role || 'member',
    centre: m.centre,
    photoUrl: normalizeImageUrl_(m.photoUrl),
    track: m.track,
    cohort: m.cohort,
    bio: m.bio,
    socials: safeJson_(m.socials),
    joinDate: m.joinDate ? String(m.joinDate) : '',
    parentEmail: m.parentEmail || '',
    needsTotp: isAdminRole_(m.role) && !m.totpSecret,
  };
}

function safeJson_(s) {
  if (!s) return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(String(s)); } catch (_) { return null; }
}

function maskEmail_(e) {
  const s = String(e || '');
  const at = s.indexOf('@');
  if (at < 1) return '***@***';
  const u = s.slice(0, at);
  const d = s.slice(at + 1);
  const um = u.length <= 2 ? u[0] + '*' : u[0] + '*'.repeat(Math.max(1, u.length - 2)) + u[u.length - 1];
  return um + '@' + d;
}

function renderMagicLinkEmail_(member, link, otp) {
  return [
    '<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fbf7ed;color:#0a1130;margin:0;padding:32px;">',
    '<div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;padding:32px;">',
    '<div style="font-family:Georgia,serif;font-size:28px;font-weight:800;letter-spacing:-0.02em;">Next Generation Genius</div>',
    '<div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin-top:4px;">Afrovanguard</div>',
    '<hr style="border:0;border-top:1px solid #eee;margin:24px 0;"/>',
    '<p style="font-size:17px;line-height:1.5;">Hi ', escapeHtml_(String(member.fullName || '').split(' ')[0]), ',</p>',
    '<p style="font-size:16px;line-height:1.55;">Sign in to your NGG dashboard:</p>',
    '<p style="margin:24px 0;"><a href="', link, '" style="background:#0c1432;color:white;display:inline-block;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700;">Sign in →</a></p>',
    '<p style="font-size:14px;color:#555;margin-top:24px;">Or enter this code in the app:</p>',
    '<div style="font-family:monospace;font-size:32px;font-weight:800;letter-spacing:6px;margin:8px 0 24px;color:#0c1432;">', otp, '</div>',
    '<p style="font-size:12px;color:#888;line-height:1.55;">This link and code expire in 15 minutes. If you didn\'t request this, ignore the email — no action is needed.</p>',
    '</div></body></html>',
  ].join('');
}

function escapeHtml_(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- Base32 + TOTP (RFC 6238, SHA1) ----------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randBase32_(byteLength) {
  let s = '';
  for (let i = 0; i < byteLength * 8; i += 5) {
    s += B32[Math.floor(Math.random() * 32)];
  }
  return s;
}

function base32Decode_(s) {
  s = String(s).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  const bytes = [];
  let buffer = 0, bitsLeft = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B32.indexOf(s[i]);
    if (v < 0) continue;
    buffer = (buffer << 5) | v;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xff);
    }
  }
  return bytes;
}

function totpCode_(secret, counter) {
  const key = base32Decode_(secret);
  const buf = new Array(8).fill(0);
  for (let i = 7; i >= 0; i--) { buf[i] = counter & 0xff; counter = Math.floor(counter / 256); }
  // Apps Script HMAC accepts byte arrays
  const hmac = Utilities.computeHmacSha256Signature(
    buf.map(b => b > 127 ? b - 256 : b),       // signed bytes
    key.map(b => b > 127 ? b - 256 : b)
  );
  // RFC 6238 spec actually uses HMAC-SHA1 — but Apps Script only ships
  // computeHmacSignature with algorithm enum. Use SHA1 algorithm:
  const sha1 = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    buf.map(b => b > 127 ? b - 256 : b),
    key.map(b => b > 127 ? b - 256 : b)
  );
  const offset = sha1[sha1.length - 1] & 0xf;
  const bin = ((sha1[offset] & 0x7f) << 24) |
              ((sha1[offset + 1] & 0xff) << 16) |
              ((sha1[offset + 2] & 0xff) << 8) |
              (sha1[offset + 3] & 0xff);
  const code = bin % 1000000;
  return String(code).padStart(6, '0');
}
