# Editorial Studio Feature Tracker

## Status key

- `Not started` — no implementation work has begun.
- `In progress` — actively being implemented.
- `Blocked` — cannot proceed; explain the blocker in Notes.
- `In review` — implemented and awaiting verification.
- `Done` — all ticket acceptance criteria have been verified.

Update `Status`, `Owner`, and `Notes` as work progresses. A ticket is `Done` only when every acceptance checkbox in [VERTICAL_TICKETS.md](./VERTICAL_TICKETS.md) is complete.

| Ticket | Feature | Status | Owner | Notes |
| --- | --- | --- | --- | --- |
| STU-01 | Secure editor shell and durable job round trip | In review | mubarak96-max | Upload-first Studio shell, per-book `jobs/allJobs` storage, and one-minute worker cadence are implemented. Browser verification and a second-account allowlist check remain. |
| STU-02 | EPUB extraction review and approval | In review | mubarak96-max | All five acceptance checks pass in `smoke-e2e.mts` and `smoke-formats.mts` against the live Studio and worker. Awaiting a browser pass on the extraction editor. |
| STU-03 | Text-PDF extraction review and approval | In review | mubarak96-max | Running heads, running feet, folios, page references, and the shared editor are verified. Two-column flagging is implemented but has never run against a real two-column PDF. |
| STU-04 | Scanned-PDF OCR and AI uncertainty resolution | In review | mubarak96-max | OCR ordering, page references, and the blocking-approval gate are verified. The OpenRouter proposal call has never been executed, so accepting a proposal is unverified. |
| STU-05 | Editable, source-linked Book Bible | In review | mubarak96-max | Chunk analysis, whole-book synthesis, field locks, selective regeneration, and the approval gate are implemented. `smoke-bible.mts` proves locks survive regeneration and unsupported facts are refused. The OpenRouter analysis has never been executed, so evidence click-through and the unlock button are unverified in the browser. |
| STU-06 | Complete episode-map planning and approval | In review | mubarak96-max | Whole-book planning, boundary moves with neighbour adjustment, exclusion reasons, and the coverage gate are implemented. `smoke-episode-map.mts` proves the validator against gapped, overlapping, and excluded maps. The OpenRouter planning call has never been executed, so the generated map and the panel are unverified in the browser. |
| STU-07 | One-episode Story Moment planning and approval | In review | mubarak96-max | Density-driven planning for the active episode, many-to-many paragraph mapping, per-episode coverage gate, hotspot restriction, reordering, and lock-preserving regeneration are implemented. `smoke-moments.mts` proves the validator, the merge, and the hotspot rule. The OpenRouter planning call has never been executed, so the generated plan and the panel are unverified in the browser. |
| STU-08 | Exact dialogue, excerpts, and commentary | In review | mubarak96-max | Exact source spans, character-for-character validation, evidence-linked commentary, editor locks, and the single-primary-text gate are implemented; `smoke:text` passes 6/6. A real OpenRouter commentary call and browser pass remain. |
| STU-09 | Style canon and reusable visual references | In review | mubarak96-max | Book canon, timeline-aware references, candidate history, and the per-episode character and location reference gate are implemented; `smoke:visual` passes 10/10. Real image generation remains. |
| STU-10 | Single image generation and candidate selection | In review | mubarak96-max | One-candidate requests, required prompt constraints, retained regeneration, active selection, S3 upload, and CloudFront delivery are implemented; `smoke:images` passes 6/6. The deployed privacy probe remains. |
| STU-11 | Batch image generation | In review | mubarak96-max | Parent/child fan-out, maximum-three concurrency, partial success, completed-child resume, child retry, and cost summaries are implemented; `smoke:batch` passes 4/4. A real partial image batch remains. |
| STU-12 | Story Moment review, objective checks, and live posting | In review | mubarak96-max | Reader preview, objective blockers, canonical posting, public-payload projection, and Reader-isolating rules are implemented; posting passes 11/11 and the rules contract 5/5. Rules deployment and an unauthenticated Reader probe remain. |
| STU-13 | Episode completion and versioned republication | In review | mubarak96-max | Episode revalidation, incomplete partial publishing, prepared replacements, atomic promotion, and post-commit deletion are implemented; `smoke:completion` passes 7/7. Reader-side polling during real promotion remains. |
| STU-14 | Job operations, model routing, and cost controls | In review | mubarak96-max | Job controls, safe-unit checkpoints, idempotent reuse, model routing, cost views, budget confirmation, and stale candidate marking are implemented; `smoke:operations` passes 12/12. Kill/restart and real spend-ledger tests remain. |

## Progress summary

| Metric | Count |
| --- | ---: |
| Total vertical tickets | 14 |
| Not started | 0 |
| In progress | 0 |
| Blocked | 0 |
| In review | 14 |
| Done | 0 |

## Current focus

- Current tickets: `STU-01` through `STU-14` are implemented and in verification.
- Next milestone: Deploy Firestore rules, run one complete browser flow with real OpenRouter and image infrastructure, then exercise kill/restart, over-budget confirmation, CloudFront privacy, and Reader-side promotion polling.
- Last updated: 2026-08-15

## Decision and blocker log

| Date | Ticket | Type | Note |
| --- | --- | --- | --- |
| 2026-08-15 | All | Decision | Initial V1 tracker created from the approved product plan. |
| 2026-08-15 | STU-01 | Decision | Added `firebase` and `firebase-admin` dependencies; Studio reads Firestore live through the client SDK and performs all writes through Admin SDK route handlers, so Firestore rules can deny every client write. |
| 2026-08-15 | STU-01 | Decision | The allowlist lives in the server-only `STUDIO_ALLOWED_EMAILS` variable and in `firestore.rules`. `NEXT_PUBLIC_STUDIO_EMAIL` and `NEXT_PUBLIC_STUDIO_PASSWORD` are unused by Studio and should be removed from `.env`. |
| 2026-08-15 | STU-01 | Decision | The worker runs as a standalone `worker/index.mts` process started with `npm run worker`; it restates its Firestore constants instead of importing from `src/lib` because it runs outside the Next.js module graph. |
| 2026-08-15 | STU-01 | Decision | The first Studio action uploads an EPUB or PDF; the server creates the book, first source revision, and ingest job together. Empty placeholder-book creation is no longer the user flow. |
| 2026-08-15 | STU-01 | Decision | Each book owns `books/{bookId}/jobs/allJobs`; its `jobs` map contains all jobs for that book. New root-level job documents are prohibited. |
| 2026-08-15 | STU-01 | Decision | Worker polling, presence heartbeats, running-job heartbeats, and progress writes are limited to one-minute intervals. Terminal state transitions remain immediate. |
| 2026-08-15 | STU-14 | Risk | The `allJobs` map shares Firestore's 1 MiB document limit, so later archival or pruning is required for long job histories. |
| 2026-08-15 | STU-02 | Decision | Added `jszip` and `cheerio` for EPUB parsing, and `pdfjs-dist`, `@napi-rs/canvas`, and `tesseract.js` for PDF text extraction, page rendering, and OCR. OCR runs locally so per-word confidence is available; OpenRouter is used only on uncertainties the editor selects. |
| 2026-08-15 | STU-02 | Decision | A chapter document holds its paragraphs as an array, so one editor operation is one atomic document write. All operations share a single `edit` route driven by a discriminated union rather than one route per operation. |
| 2026-08-15 | STU-03 | Decision | The worker chooses between text and OCR extraction by measuring characters per page in the PDF text layer, rather than trusting the producer metadata. |
| 2026-08-15 | STU-04 | Risk | Approval and editing transactions carry every chapter, so a source above 450 chapters is refused. Long books need batched approval before this limit is reached. |
| 2026-08-15 | STU-03 | Risk | Running heads and feet are only recognised across three or more pages; a one- or two-page source keeps its furniture. |
| 2026-08-15 | STU-01 | Blocker | `firestore.rules` and `firestore.indexes.json` must be deployed with `firebase deploy --only firestore` before a second Google account can be used to confirm that a non-allowlisted user is refused. |
| 2026-08-15 | STU-05 | Decision | The Book Bible belongs to the source revision it describes: entries live in `sources/{sourceId}/bible`, per-chunk analyses in `sources/{sourceId}/bibleChunks`, and the Bible's own status, entry count, and approval stamp are fields on the source document the editor already subscribes to. |
| 2026-08-15 | STU-05 | Decision | Analysis is two job types. `bible.analyze` sends chapter chunks of at most 12,000 characters and stamps each chunk with its job id, so a retry keeps the chunks it already paid for; it then queues `bible.synthesize`, which merges every chunk into entries in one pass. |
| 2026-08-15 | STU-05 | Decision | An editor write locks the field it touches and regeneration fills only unlocked fields. A fact whose evidence is missing or outside the approved revision is dropped by the merge and refused by the write path, so an unsupported fact cannot be stored. |
| 2026-08-15 | STU-05 | Decision | `POST /api/jobs` now queues only `test.echo`. Every other job type is queued by the route that owns its gate, so no request can start analysis by naming a job type. |
| 2026-08-15 | STU-05 | Decision | AI spend is recorded per job at `books/{bookId}/costs/{jobId}` with the model, call count, and token counts, ready for the budgets STU-14 adds. |
| 2026-08-15 | STU-06 | Decision | An intentional overlap is marked on the later episode by `overlapsPrevious` with a required `overlapReason`. The coverage validator refuses an overlap only when that flag is absent, which is what makes "unintended overlap" decidable. A flagged episode also keeps its own boundary during a boundary move, because pulling the neighbour would silently delete the overlap. |
| 2026-08-15 | STU-06 | Decision | The AI names only where each episode ends; starts are derived from the previous end. A generated map is therefore gap-free before review, and the editor's boundary move keeps the same invariant. |
| 2026-08-15 | STU-06 | Decision | Paragraphs outside the main narrative are recorded as `episodeExclusions` on the source document, each with a required reason, and count as covered. STU-13 reads these reasons for the episode-completion check. |
| 2026-08-15 | STU-06 | Risk | Planning replaces the whole map, so it is refused while any episode is locked; the editor must unlock or delete that episode first. Partial replanning around locked episodes is not implemented. |
| 2026-08-15 | STU-05 | Risk | Synthesis sends every chapter summary in one call, so a very long book can exceed the model's context. Splitting synthesis into passes is the fix when that happens. |
| 2026-08-15 | STU-07 | Decision | A Story Moment plan belongs to its episode: moments live in `episodes/{episodeId}/moments`, and the plan's status, count, exclusions, and approval stamp are fields on the episode document the editor already subscribes to. Exclusions are per-episode here, unlike STU-06's source-level `episodeExclusions`. |
| 2026-08-15 | STU-07 | Decision | The active episode is the earliest one without an approved Story Moment plan, derived rather than stored. Planning any other episode is refused, which is how "one episode at a time" is enforced without a second piece of state to keep in sync. |
| 2026-08-15 | STU-07 | Decision | Regeneration keeps every locked Story Moment and replaces the rest, unlike STU-06's episode map, which refuses to replan while anything is locked. A proposal whose paragraphs all sit inside a locked moment is dropped, and the survivors are ordered by their first source paragraph, so a locked moment keeps its place without pinning a position number. |
| 2026-08-15 | STU-07 | Decision | A hotspot plan on a scene or a reused image is refused on the editor's write path and again at approval. The same plan coming back from the model is dropped rather than failing the job, and is reported in the job result's `rejections`. |
| 2026-08-15 | STU-07 | Risk | Story Moment planning sends the episode's full prose in 12,000-character windows and each window is planned independently, so a beat that spans a window boundary can be split into two Story Moments. Reordering and deleting in the panel is the manual fix; overlapping windows are the real one. |
