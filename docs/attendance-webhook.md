# Inbound Attendance Webhook — Integration Spec v1

For the external app that reports attendance into NGG. We publish this
spec; the sender implements it. Contact: news@afrovanguard.org.ng.

## Endpoint

```
POST https://<ngg-host>/api/hooks/attendance.php
Content-Type: application/json
```

## Authentication (signed requests)

You'll be given a shared secret. Sign EVERY request:

```
X-NGG-Timestamp: 1751980000                     ← unix seconds, now
X-NGG-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>
```

Rules we enforce: timestamp within ±300s (use NTP), signature computed
over the exact raw body bytes, constant-time compare. 401 on any mismatch.

## Payload (batch-friendly)

```json
{
  "source": "your-app-name",
  "events": [
    { "ref": "SUM-2026-0014", "date": "2026-07-09" },
    { "ref": "NGG-2025-0042" },
    { "token": "SUMQR-9F2A" }
  ]
}
```

- `ref` — a summer student ID (`SUM-…`), an NGG member ID (`NGG-…`), or a
  student handle. OR `token` — the QR token from an ID card.
- `date` — optional `YYYY-MM-DD` (UTC); defaults to today.
- `scannedAt` — optional ISO time of the scan; lateness is judged at it.
- `action` — optional, `"out"` for a departure. It stamps `checkOutAt` on the
  day's row and never creates one; without an arrival it answers
  `not_checked_in`, which a sender should retry (the arrival may still be on
  its way). A sender that predates this field only ever sends arrivals.
- Max 200 events per request; send multiple requests for more.

## Response

```json
{
  "ok": true, "marked": 2, "already": 1, "unknown": 0,
  "results": [
    { "ref": "SUM-2026-0014", "date": "2026-07-09", "status": "marked" },
    { "ref": "NGG-2025-0042", "date": "2026-07-09", "status": "already" }
  ]
}
```

Statuses per item: `marked` · `already` (idempotent duplicate — success,
not an error) · `unknown` (we don't recognise the ref — fix your mapping)
· `bad_date` / `bad_event` · `not_checked_in` (a departure with no arrival
yet — retry).

## Retry policy (yours)

Retries are safe: a re-sent batch marks nothing twice (`already`). On
non-2xx, retry with exponential backoff. Never mutate a batch between
retries — sign the exact same body again or re-sign the new one.

## What happens on our side

Each mark lands in the attendance stream with `source: webhook:<your-app>`
provenance, appears in admin dashboards immediately, and fans out through
the integration bus (Google Chat, Sheets mirror, partner webhooks) exactly
like a QR-gate or manual mark.
