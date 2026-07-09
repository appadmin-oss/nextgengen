# NGG Integration Bus

One outbox, many destinations. Admin → Settings → Integrations configures
destinations; a cron delivers with retries; every attempt lands in a
readable log. The database is always the source of truth — every mirror is
a one-way projection.

```
* * * * * php /path/to/site/api/tools/dispatch-events.php
```

## Event kinds

| Kind | Fired when |
|---|---|
| `member.created` / `member.updated` | Admin creates/edits a member |
| `registration.created` / `registration.verified` | Summer desk registers / parent consents |
| `attendance.marked` | Any source: QR gate, manual admin, inbound webhook |
| `behaviour.flagged` | The behaviour monitor raises a wellbeing flag |
| `test.ping` | The admin "Send test" button |

Subscriptions accept exact kinds, prefixes (`attendance.*`) or `*`.

## 1 · Google Chat

Space → Apps & integrations → Webhooks → copy the URL (starts with
`https://chat.googleapis.com/`). Add it as a `gchat` integration, pick the
events, press **Send test**. Digest-style events arrive as cards; everything
else as a compact text line. Chat's rate limits (429) are absorbed by the
queue's backoff — messages arrive late, never lost (8 attempts, then the
delivery log shows `dead` with the reason).

## 2 · Signed outbound webhooks (any platform)

Add a `webhook` integration (any `https://` URL). A secret is generated on
create and revealed once. Each delivery:

```
POST <your url>
X-NGG-Event:     attendance.marked
X-NGG-Delivery:  EV-1A2B3C4D          ← idempotency key (retries reuse it)
X-NGG-Timestamp: 1751980000
X-NGG-Signature: sha256=hex(HMAC_SHA256(secret, timestamp + "." + body))

{"id":"EV-1A2B3C4D","event":"attendance.marked","createdAt":"…","data":{…}}
```

Verify (pseudo): reject if `|now - timestamp| > 300`; recompute the HMAC
over `timestamp + "." + rawBody`; constant-time compare. Respond 2xx fast;
do slow work async. Non-2xx → retried with exponential backoff.

## 3 · Google Sheets mirror (Apps Script bridge)

1. Create a Google Sheet → Extensions → Apps Script, paste the script
   below, set `SECRET` to any long random string.
2. Deploy → New deployment → **Web app** → execute as *Me*, access
   *Anyone*. Copy the `/exec` URL.
3. Add a `sheets` integration with that URL + the same secret, subscribed
   to `member.*`, `registration.*`, `attendance.*`.
4. Admin → Integrations → **Sync members now** pushes a full snapshot;
   after that, changes stream incrementally.

```javascript
const SECRET = 'PASTE_THE_SAME_SECRET_HERE';

function doPost(e) {
  const p = JSON.parse(e.postData.contents);
  if (p.secret !== SECRET) return out({ok: false, error: 'bad_secret'});
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (p.event === 'members.snapshot' || p.event === 'member.updated' || p.event === 'member.created') {
    const sh = sheet(ss, 'Members', ['memberId','fullName','email','phone','type','status','role','centre','track','cohort','joinDate','school','parentName','parentEmail','parentPhone','createdAt']);
    const rows = p.event === 'members.snapshot' ? p.data.members : [p.data];
    rows.forEach(m => upsert(sh, 1, m.memberId, [m.memberId,m.fullName,m.email,m.phone,m.type,m.status,m.role,m.centre,m.track,m.cohort,m.joinDate,m.school,m.parentName,m.parentEmail,m.parentPhone,m.createdAt]));
  } else if (p.event.indexOf('attendance.') === 0) {
    sheet(ss, 'Attendance', ['when','memberId','name','date','source','by'])
      .appendRow([p.createdAt, p.data.memberId||'', p.data.name||'', p.data.date||'', p.data.source||'', p.data.by||'']);
  } else if (p.event.indexOf('registration.') === 0) {
    sheet(ss, 'Registrations', ['when','event','ref','name','course','parent','status'])
      .appendRow([p.createdAt, p.event, p.data.ref||'', p.data.name||'', p.data.course||'', p.data.parentContact||'', p.data.status||'']);
  }
  return out({ok: true});
}
function sheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}
function upsert(sh, keyCol, key, row) {
  const vals = sh.getRange(2, keyCol, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < vals.length; i++) if (vals[i][0] === key) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); return; }
  sh.appendRow(row);
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
```

Sensitive form fields (🔒) never enter the mirror.

## 4 · SMS (Termii + Twilio)

```php
'sms' => [
  'default_country' => 'NG',
  'termii' => ['api_key' => '…', 'sender' => 'NGG'],
  'twilio' => ['sid' => '…', 'token' => '…', 'from' => '+1…'],
],
```

Routing: `+234…` numbers try Termii first, everything else Twilio first;
each falls through to the other on failure. Local formats normalise
automatically (`0803… → +234803…`). With no SMS configured, parent
verification falls back to email-only.

## 5 · Inbound attendance webhook

The other app POSTs to `/api/hooks/attendance.php` — full spec lives in
`docs/attendance-webhook.md` (same HMAC scheme as §2, ours to publish,
theirs to implement).
