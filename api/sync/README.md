# Completed Interviews Sync API

REST endpoint for the Academy application to pull completed interview
results out of Interview Coordinator — used for both its scheduled daily
sync and its manual "Sync Completed Interviews" button. Same endpoint for
both; the difference is just which query params the caller passes.

## Endpoint

```
GET https://interview-coordinator.vercel.app/api/sync/completed-interviews
```

## Auth

```
Authorization: Bearer <ACADEMY_SYNC_API_TOKEN>
```

Missing or wrong token → `401`.

## Query parameters

| Param          | Required | Description                                                                 |
|----------------|----------|-------------------------------------------------------------------------------|
| `programId`    | No       | Only return interviews scheduled from a template under this program.        |
| `lastSyncTime` | No       | ISO-8601 datetime. Only returns interviews **updated** after this instant — use this for incremental sync (preferred). |
| `fromDate`     | No       | `YYYY-MM-DD`. Only returns interviews **scheduled on/after** this date. Ignored if `lastSyncTime` is also given. |
| `pageSize`     | No       | 1–200, default 50.                                                          |
| `cursor`       | No       | Opaque token from a previous response's `pagination.nextCursor`, to fetch the next page. |

Only interviews with `status == "completed"` are ever returned — this isn't a filter you can turn off.

## Response — `200`

```json
{
  "success": true,
  "data": [
    {
      "interviewId": "abc123",
      "status": "completed",
      "round": "Round 1",
      "candidate": { "id": "...", "name": "Jane Doe", "email": "jane@example.com" },
      "interviewer": { "id": "...", "name": "Rahul Sharma", "email": "rahul@nxtwave.tech" },
      "template": { "id": "...", "name": "AI SYSTEMS MASTERY" },
      "program": { "id": "..." },
      "schedule": { "date": "2026-06-15", "time": "10:00 AM" },
      "feedback": {
        "overallRecommendation": "Proceed",
        "finalVerdict": 4.3,
        "comments": "...",
        "domains": {
          "coding": {
            "cards": [{ "question": "...", "ps_rating": "4", "ci_rating": "5" }],
            "domain_rating": 4.5,
            "descriptors": {
              "cards": [{ "ps_rating": "Solved with 1 minor nudge, reached optimal approach with good reasoning", "ci_rating": "Clean, optimal, well-structured implementation with clear explanation" }]
            }
          },
          "...": "..."
        },
        "submittedAt": "2026-06-15T11:05:00.000Z"
      },
      "aiReport": { "decision": "move_forward", "summary": "...", "...": "..." },
      "links": { "meetLink": "...", "recordingUrl": "...", "transcriptUrl": "..." },
      "completedAt": "2026-06-15T11:05:00.000Z",
      "createdAt": "2026-06-10T09:00:00.000Z",
      "updatedAt": "2026-06-15T11:05:00.000Z"
    }
  ],
  "pagination": { "pageSize": 50, "nextCursor": "eyJ2Ijoi...", "hasMore": true },
  "meta": { "syncedAt": "2026-07-27T04:00:00.000Z" }
}
```

`aiReport` and `links.recordingUrl`/`transcriptUrl` are `null` when not yet generated/uploaded for that interview — don't assume they're always populated.

Each domain's raw scored fields (in `cards[i]` and at the domain level, e.g. `ps_rating: "4"`) are always just the number the interviewer picked. A sibling `descriptors` object, same shape (`descriptors.cards[i].<fieldId>` / `descriptors.<fieldId>`), carries the matching option's label text (e.g. `"4"` → `"Clean code with minor issues, good structure and readability"`) looked up from the template at read time. A field is omitted from `descriptors` if it wasn't answered or isn't a scored field — don't assume every scored key has a matching descriptor key.

## Paging through everything

```
while (hasMore) {
  GET .../completed-interviews?cursor=<nextCursor>&...same other params
}
```
Keep passing the *same* `programId`/`lastSyncTime`/`fromDate` on every page — only `cursor` changes.

## Recommended sync patterns

- **Daily scheduled sync**: store the `meta.syncedAt` from your last successful run, pass it back as `lastSyncTime` next time. First run ever: omit `lastSyncTime` to pull everything.
- **Manual "Sync Completed Interviews" button**: same call — either resend the last stored `lastSyncTime` (delta since last sync) or omit it for a full resync, whichever the button is meant to do.

## Errors

| Status | `error`               | Meaning                                      |
|--------|-----------------------|-----------------------------------------------|
| 400    | `invalid_parameter`   | Bad `fromDate`/`lastSyncTime`/`pageSize`/`cursor` |
| 401    | `unauthorized`        | Missing/invalid bearer token                  |
| 405    | `method_not_allowed`  | Non-GET request                               |
| 500    | `internal_error` / `server_misconfigured` | Unexpected failure — retry with backoff |

Every error response is `{ "success": false, "error": "...", "message": "..." }`.

## Setup (source-system side, one-time)

1. Firebase Console → Project Settings → Service Accounts → Generate new private key. Set the whole JSON file's contents as the Vercel env var `FIREBASE_SERVICE_ACCOUNT_KEY` (Project → Settings → Environment Variables — **not** a `VITE_`-prefixed var, and not committed to the repo).
2. Generate a token (`openssl rand -hex 32`) and set it as `ACADEMY_SYNC_API_TOKEN` in Vercel. Give the Academy team the token out-of-band (not over email/Slack in plaintext if avoidable).
3. Deploy the new Firestore composite indexes this endpoint needs: `firebase deploy --only firestore:indexes`.
4. Redeploy the app on Vercel so the new `/api` function and env vars take effect.
