# Editorial Studio Vertical Tickets

Each ticket delivers a usable path through UI, Firestore, storage, and the local worker. Tickets are ordered by dependency, not by technical layer.

## STU-01 — Secure editor shell and durable job round trip

**Outcome:** The allowlisted editor can sign in, upload a book, and see its attached ingest job move through the local worker.

**Includes:**

- Next.js Studio shell on Firebase App Hosting.
- Google sign-in and one-email allowlist.
- Firestore book records with `jobs/allJobs` maps.
- Local Node.js polling worker with transactional claim, heartbeat, completion, failure, and retry.
- Periodic worker writes limited to once per minute.
- Visible worker-offline and job-status states.

**Acceptance:**

- [ ] A non-allowlisted Google account cannot enter Studio.
- [x] Uploading a book creates its book record, source revision, and attached ingest job together.
- [ ] A running local worker claims the job only once.
- [ ] Studio updates from queued to running to completed without refresh.
- [ ] A stopped worker leaves the job queued and clearly indicates that processing is waiting.

## STU-02 — Upload and approve an EPUB extraction

**Outcome:** The editor can upload an EPUB, review reconstructed chapters and paragraphs, correct them, and approve permanent paragraph IDs.

**Includes:** Firebase Storage upload, EPUB spine/TOC parsing, temporary IDs, extraction editor, chapter/paragraph operations, source revision approval.

**Acceptance:**

- [x] Uploading an EPUB creates a durable source and ingest job.
- [x] Chapters and readable paragraphs appear in source order.
- [x] The editor can edit, reorder, split, merge, and change chapter boundaries.
- [x] Approval freezes permanent paragraph IDs.
- [x] Reopening the book preserves the approved extraction and IDs.

## STU-03 — Upload and approve a text-PDF extraction

**Outcome:** A text PDF reaches the same extraction-review experience as an EPUB.

**Includes:** positioned-text extraction, reading-order reconstruction, repeated-header/footer removal, page references, ambiguous-layout flags.

**Acceptance:**

- [x] Repeated headers, footers, and page numbers are excluded from narrative text.
- [x] Paragraphs retain source page references.
- [ ] Ambiguous reading order is visibly flagged.
- [x] The common extraction editor and approval flow work without PDF-specific downstream behavior.

## STU-04 — Upload and approve a scanned-PDF extraction with AI uncertainty help

**Outcome:** A scanned PDF is OCRed, uncertain content receives AI proposals, and the editor approves the corrected extraction.

**Includes:** page rendering, OCR text/confidence, uncertainty queue, selective OpenRouter assistance, accept/reject correction controls.

**Acceptance:**

- [x] Scanned pages produce ordered OCR paragraphs with page references.
- [ ] Low-confidence words and structural ambiguities are highlighted.
- [ ] AI can propose corrections for selected uncertainties without processing the entire book by default.
- [ ] The editor can accept, reject, or manually replace each proposal.
- [x] Serious unresolved uncertainties block extraction approval.

## STU-05 — Generate and approve a source-linked Book Bible

**Outcome:** AI analyses an approved source hierarchically and produces an editable Book Bible whose facts are traceable and whose editor corrections survive regeneration.

**Includes:** chunk/chapter analysis, whole-book synthesis, fact evidence links, Book Bible sections, field locks, selective regeneration, approval gate.

**Acceptance:**

- [x] Analysis cannot start before extraction approval.
- [x] Every factual entry links to at least one supporting paragraph ID.
- [ ] Clicking evidence opens the relevant source paragraph.
- [x] Editing a field locks it against regeneration.
- [ ] The editor can unlock a field intentionally.
- [ ] Episode planning remains unavailable until Book Bible approval.

## STU-06 — Plan and approve the complete episode map

**Outcome:** AI proposes all episode boundaries and purposes, and the editor can produce a gap-free approved map.

**Includes:** episode-map generation, paragraph ranges, purpose/development summaries, boundary editing, adjacent-range adjustment, coverage validator.

**Acceptance:**

- [ ] Every episode shows start/end paragraph IDs and narrative purpose.
- [ ] Moving a boundary adjusts the neighbouring episode.
- [ ] Gaps and unintended overlaps block approval.
- [ ] Main-narrative exclusions require a reason.
- [ ] Story Moment generation stays unavailable until the entire map is approved.

## STU-07 — Plan and approve one complete episode's Story Moments

**Outcome:** The editor can generate a density-based Story Moment plan for the active episode and approve its complete source coverage.

**Includes:** dynamic Story Moment count, many-to-many paragraph mapping, primary text and visual types, reveal constraints, regeneration, editor locks, Story Moment reordering.

**Acceptance:**

- [ ] No fixed Story Moment count is imposed.
- [ ] Every in-scope paragraph is mapped or explicitly excluded.
- [ ] Each Story Moment has one primary text type and one visual intention.
- [ ] The editor can edit, add, delete, reorder, and regenerate Story Moments.
- [ ] Locked editor changes survive regeneration.
- [ ] Image generation is unavailable until the full Story Moment plan is approved.

## STU-08 — Produce and verify Story Moment text

**Outcome:** Each approved Story Moment can receive exact dialogue, an exact excerpt, or paraphrased commentary with appropriate validation.

**Includes:** source-range selector, exact-text validator, separate non-contiguous dialogue entries, commentary generation/editing, evidence display.

**Acceptance:**

- [ ] Exact text is selected from an approved source revision.
- [ ] A character mismatch blocks exact text from being approved.
- [ ] Changing an exact excerpt requires selecting a new source range.
- [ ] Commentary is editable and retains its evidence links.
- [ ] A Story Moment cannot have multiple competing primary text types.

## STU-09 — Approve the style canon and reusable visual references

**Outcome:** The editor can establish visual consistency before generating episode scenes.

**Includes:** book style canon, character reference sheets, timeline-aware appearance states, on-demand location/object references, approval and regeneration.

**Acceptance:**

- [ ] The style canon captures required and prohibited visual properties.
- [ ] Major recurring characters have approved references before Episode 1 scene generation.
- [ ] References retain prompt, model, source facts, and candidate history.
- [ ] Later appearance states cannot be used in earlier Story Moments without a warning.
- [ ] Recurring locations and objects can receive references when first needed.

## STU-10 — Generate, regenerate, and select one image

**Outcome:** The editor can generate one image for a Story Moment, review it, add prompt guidance, regenerate, and select the active candidate.

**Includes:** structured prompt assembly, one platform image model, private S3 upload, CloudFront URL, candidate history, active selection, focal point/safe area.

**Acceptance:**

- [ ] One generation request creates exactly one candidate.
- [ ] Canon, references, continuity, and Story Moment facts are included automatically.
- [ ] Optional editor prompt additions do not replace required constraints.
- [ ] Regeneration retains previous candidates.
- [ ] Only the selected candidate is active.
- [ ] The image is private in S3 and readable through its CloudFront URL.

## STU-11 — Generate a selected batch of Story Moment images

**Outcome:** The editor can select multiple ready Story Moments and generate one candidate for each while monitoring the batch.

**Includes:** eligibility checks, selection UI, batch parent job, independent child requests, concurrency limit, partial failure/retry, cost estimate.

**Acceptance:**

- [ ] Only approved, image-ready Story Moments can enter a batch.
- [ ] Each selected Story Moment receives one independent image request.
- [ ] No more than three requests run concurrently by default.
- [ ] A failed child does not discard successful candidates.
- [ ] Retrying a failed child does not regenerate completed children.
- [ ] The editor sees estimated and actual batch cost.

## STU-12 — Review and post a complete Story Moment

**Outcome:** The editor can inspect a Story Moment as readers will see it, pass objective checks, and post it live.

**Includes:** composed preview, source/evidence inspection, Story Moment checks, warnings, post action, canonical active version, Reader visibility.

**Acceptance:**

- [ ] Preview contains the selected image, primary text, title/context, and allowed hotspots.
- [ ] Objective Story Moment check failures block posting; subjective warnings do not.
- [ ] Posting writes/promotes a canonical posted Story Moment in Firestore.
- [ ] The Reader can access the Story Moment immediately.
- [ ] Internal jobs, plans, and unselected candidates remain inaccessible to the Reader.

## STU-13 — Complete an episode and republish a Story Moment safely

**Outcome:** An episode can pass whole-episode checks, and an existing Story Moment can be replaced without interrupting its current live version.

**Includes:** coverage/continuity/reveal checks, episode completion, replacement version, atomic promotion, deletion of old version.

**Acceptance:**

- [ ] Episode completion is blocked by unaccounted narrative paragraphs.
- [ ] Posted Story Moments can remain live while the episode is incomplete.
- [ ] A replacement does not affect the current Story Moment until promotion.
- [ ] Promotion switches readers atomically to the replacement.
- [ ] The old version is deleted only after successful promotion.

## STU-14 — Operate jobs, models, retries, and budgets

**Outcome:** The editor can understand and control pipeline activity and spending without using the terminal for routine recovery.

**Includes:** job dashboard, checkpoints, idempotency, cancel/retry, per-task OpenRouter model settings, cost ledger, budget confirmation, stale-work indicators.

**Acceptance:**

- [ ] Jobs expose stage, progress, heartbeat, cost, and actionable failure details.
- [ ] All jobs remain under their owning book in `jobs/allJobs`.
- [ ] Periodic worker writes are no more frequent than once per minute.
- [ ] Interrupted work resumes at the last safe checkpoint.
- [ ] Retrying does not charge again for saved completed units.
- [ ] Explicit regeneration is clearly identified as billable.
- [ ] Each editorial task can use a configured model.
- [ ] Exceeding the configured book budget requires editor confirmation.
- [ ] Upstream changes mark dependent work outdated without automatic deletion.
