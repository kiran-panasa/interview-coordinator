# Edge Portal → Interview Coordinator Sync API

REST endpoint the Edge portal calls when its **Sync** button is pressed. It
sends students (with their Edge 2.0 interview templates), and Interview
Coordinator stores them as candidates — the automated equivalent of the
Candidates page's CSV import.

- New students are **created** under the Edge 2.0 program.
- Existing students get the fields you sent **updated**, and the templates
  you sent **added**. Templates are never removed or replaced.
- A student with any invalid data is **rejected as a whole** (nothing saved
  for them) and returned to you with the reason, so it can be fixed in the
  Edge portal and synced again.

## Endpoint

```
POST https://interview-coordinator.vercel.app/api/sync/edge-candidates
Content-Type: application/json
Authorization: Bearer <EDGE_SYNC_API_TOKEN>
```

Call it **from the Edge portal's server only**, never from the browser — the
token must not be visible to users. Missing or wrong token → `401`.

## Request body

```json
{
  "candidates": [
    {
      "uid": "STU-2024-001",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "phone": "+91 98765 43210",
      "program": "Edge 2.0",
      "templates": ["<exact template name>", "<another template name>"]
    }
  ]
}
```

| Field       | Required | Notes |
|-------------|----------|-------|
| `uid`       | uid or email | Student ID. Used (with email) to find an existing student. |
| `email`     | uid or email | Matched case-insensitively. |
| `name`      | Yes      | |
| `phone`     | No       | |
| `program`   | Yes      | Must be `"Edge 2.0"`. |
| `templates` | Yes      | List of template names. Each must exactly match (case-insensitive) an **active** template under Edge 2.0 in Interview Coordinator. |

- At most **500 candidates per request**. Send larger lists in chunks of 500.
- The same student may appear more than once in a request (same uid, or same
  email); their templates are combined.
- Re-sending a student that's already synced is harmless — nothing is
  duplicated, and if nothing changed it's counted as `unchanged`.

## Response — `200`

```json
{
  "success": true,
  "summary": { "received": 120, "created": 80, "updated": 30, "unchanged": 5, "rejected": 5 },
  "rejected": [
    {
      "uid": "STU-2024-017",
      "email": "a@example.com",
      "name": "A Student",
      "errors": [
        { "code": "template_not_found", "template": "Edge DSA Round1", "message": "No template named \"Edge DSA Round1\" under Edge 2.0" }
      ]
    }
  ],
  "meta": { "syncedAt": "2026-11-09T10:00:00.000Z" }
}
```

A `200` means the request was processed: every student **not** in
`rejected` was saved. Always check `rejected` and show it to the user.

### Rejection codes (per student)

| Code                 | Meaning | Fix in Edge portal |
|----------------------|---------|--------------------|
| `template_not_found` | A template name doesn't match any Edge 2.0 template | Correct the template name |
| `template_inactive`  | Template exists but is draft/archived (students can't see it) | Ask IC admin to activate it, or use another template |
| `no_templates`       | `templates` missing or empty | Add at least one template |
| `invalid_program`    | `program` isn't `"Edge 2.0"` | Send `"Edge 2.0"` |
| `program_conflict`   | Student already exists in IC under a different program | Check with IC admin — not auto-moved |
| `missing_field`      | `name` missing, or both `uid` and `email` missing | Fill in the field |

A student can have several errors at once; all are listed.

## Request-level errors

| Status | `error`                  | Meaning |
|--------|--------------------------|---------|
| 400    | `invalid_request`        | Body isn't `{ "candidates": [...] }`, or the list is empty |
| 400    | `too_many_candidates`    | More than 500 candidates — split into chunks |
| 401    | `unauthorized`           | Missing/invalid bearer token |
| 405    | `method_not_allowed`     | Not a POST |
| 500    | `server_misconfigured`   | Token not configured, or Edge 2.0 program missing in IC |
| 500    | `internal_error`         | Unexpected failure — nothing from that request was saved; safe to retry |

Every error response is `{ "success": false, "error": "...", "message": "..." }`.

## Example (Node, Edge portal backend)

```js
const r = await fetch(process.env.IC_SYNC_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.IC_SYNC_TOKEN}`,
  },
  body: JSON.stringify({ candidates: chunk }), // ≤ 500 per call
});
const body = await r.json();
// r.ok → show body.summary and body.rejected
```

Disable the Sync button while a sync is running — two syncs at the same
moment could create a duplicate record for a brand-new student.

## Setup (Interview Coordinator side, one-time)

1. Generate a token: `openssl rand -hex 32`.
2. Vercel → interview-coordinator → Settings → Environment Variables → add
   `EDGE_SYNC_API_TOKEN` (no `VITE_` prefix). Separate from
   `ACADEMY_SYNC_API_TOKEN`, which is unaffected.
3. Redeploy so the env var takes effect.
4. Share the token with the Edge team privately (not plaintext Slack/email).

`FIREBASE_SERVICE_ACCOUNT_KEY` is already configured for the existing Academy
sync and is reused as-is. No Firestore index or rules changes are needed.
