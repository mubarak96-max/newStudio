# STU-01 — Secure editor shell and durable job round trip

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** nothing
- **Blocks:** every other ticket
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

The allowlisted editor can sign in, upload a book, and see its attached ingest job move through the local worker.

## Scope

### In scope

- Next.js Studio shell on Firebase App Hosting.
- Google sign-in and one-email allowlist.
- Firestore book records with a `jobs/allJobs` document containing the book's job map.
- Local Node.js polling worker with transactional claim, heartbeat, completion, failure, and retry.
- Periodic worker polling, heartbeat, and progress writes limited to once per minute.
- Visible worker-offline and job-status states.

### Out of scope

- Multiple editors, roles, comments, or assignments.
- Public editor registration.
- Cloud-hosted pipeline execution.
- The extraction algorithms themselves; STU-02 through STU-04 own format processing.
- The full job dashboard, model routing, and cost controls (STU-14).

## Spec context

Runtime architecture the shell must establish:

```text
Next.js Studio on Firebase App Hosting
  -> Firebase Authentication
  -> Firestore editorial data and job queue
  -> Firebase Storage source uploads

Local Node.js pipeline worker
  -> polls books/{bookId}/jobs/allJobs
  -> parses files and runs OCR
  -> calls OpenRouter task models
  -> calls the platform image model
  -> uploads generated images to private S3
  -> writes CloudFront delivery URLs and results to Firestore
```

The worker is started separately by the editor. Studio can enqueue, cancel, and retry work but cannot start a process on the editor's computer, so a stopped worker must be visible in the UI rather than silently stalling.

Job durability rules that this ticket introduces and STU-14 later extends:

- Each book stores queued, running, completed, failed, and cancelled jobs in the `jobs` map inside `books/{bookId}/jobs/allJobs`.
- The local worker polls for queued jobs and claims them transactionally.
- Periodic worker writes occur no more frequently than once per minute; terminal state changes remain immediate.
- Work is checkpointed at meaningful units so restarts resume safely.

Studio and Reader share one Firebase project and book data hierarchy, so the book record created here is the same root identity the Reader will later read from.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| Book | Root editorial and Reader identity; created from the initial source upload |
| Job | Durable unit of local-worker activity; created, claimed, completed |

## Acceptance

- [ ] A non-allowlisted Google account cannot enter Studio.
- [ ] Uploading a book creates its book record, source revision, and attached ingest job together.
- [ ] A running local worker claims the job only once.
- [ ] Studio updates from queued to running to completed without refresh.
- [ ] A stopped worker leaves the job queued and clearly indicates that processing is waiting.

## Verification notes

- Single-claim behaviour needs two worker processes racing for one queued job, not one worker checked twice.
- Allowlist rejection needs a second, non-allowlisted Google account in a browser session.
- Live status transitions must be observed without a page refresh.
- Firestore must contain `books/{bookId}/jobs/allJobs`, with the created job inside its `jobs` map and no new root-level job document.

## Recorded decisions

As of 2026-08-15, from the [decision log](../FEATURE_TRACKER.md#decision-and-blocker-log):

- `firebase` and `firebase-admin` are dependencies. Studio reads Firestore live through the client SDK and performs all writes through Admin SDK route handlers, so Firestore rules can deny every client write.
- The allowlist lives in the server-only `STUDIO_ALLOWED_EMAILS` variable and in `firestore.rules`. `NEXT_PUBLIC_STUDIO_EMAIL` and `NEXT_PUBLIC_STUDIO_PASSWORD` are unused by Studio and should be removed from `.env`.
- The worker runs as a standalone `worker/index.mts` process started with `npm run worker`. It scans per-book `jobs/allJobs` documents and writes periodic presence, progress, and running-job heartbeats at one-minute intervals.
- Open blocker: `firestore.rules` and `firestore.indexes.json` must be deployed with `firebase deploy --only firestore` before a second Google account can confirm that a non-allowlisted user is refused.
