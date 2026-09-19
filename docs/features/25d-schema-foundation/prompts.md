# 2.5D Book Experience — Session Prompts

Each fenced phase block is a self-contained prompt for one fresh agent session.
The confirmed reference is [plan.md](plan.md), vocabulary/ADRs are in [CONTEXT.md](../../CONTEXT.md), and progress belongs in [status.md](status.md).
No code has been implemented at scaffold time; in particular the development auth change is deferred to P1.

## Repos

| Short name | Path |
|---|---|
| studio | `C:/Users/800sa/studio` |

Only this repository is in scope; no external Reader repository or extra workspace is needed.

## Order and parallelism

| Wave | Run together |
|---|---|
| 1 | P0 |
| 2 | P1 |
| 3 | P2 |
| 4 | P3 |
| 5 | P4 |
| 6 | P5 |
| 7 | P6 |
| 8 | P7 |
| 9 | P8 |
| 10 | P9 |
| 11 | P10 |
| 12 | P11 |
| 13 | P12 |
| 14 | P13 |

Sequential spine: P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9 → P10 → P11 → P12 → P13.
All phases are solo: shared contracts/worker/storage/lockfile edits and security boundaries make parallel execution inappropriate.
P1/P4/P5/P9/P11 are supervised local implementation phases; P13 is HUMAN-ONLY.
The build proceeds with local fixtures if D-1 real-model quality remains open. Never promote fixture success into real generation acceptance.

## Gates by repo

| Repo | Commands |
|---|---|
| studio | `npm.cmd run lint`, `npm.cmd run build`, all existing package-declared smoke scripts and the new phase-owned scripts listed under each GATE line. |

Existing smoke scripts: workflow, ui, episodes, bible, moments, text, visual, images, batch, posting, completion, operations, pdf, uncertainties.
Planned scripts are not currently installed: smoke:auth (P1); smoke:schemas/test:preview (P2); smoke:canonical (P3); smoke:job-engine (P4); smoke:book-model (P5); smoke:story-planning (P6); smoke:beats (P7); smoke:visual-generation (P8); smoke:compose (P9); smoke:bundles/smoke:publishing (P10).
Each owning phase adds its declared script and meaningful tests before running its gate.
Source-string tests are supplementary. Browser rendering and emulator policy proof require real runtime checks.
Never run the current live-writing smoke-e2e.mts or smoke-formats.mts against .env during unattended work.

## Status update contract

Every phase edits only its own row and appends evidence to Progress log/Deferred.
States: todo, in-progress, done, qa-pending, blocked. done requires implemented/demoable outcome and every applicable gate green.
qa-pending means implemented but with an exact owner check or missing verification named; never call partial required work done.
Always write the date, each gate result (including skipped reason), outcome evidence, deferred items and patch snapshot.
plan.md, prompts.md and docs/CONTEXT.md are read-only to phase sessions. Source code and phase tests are changed only as the phase requires.
No commits, pushes, deployments, paid calls, live publication, live identity changes or cloud-data deletion.
A session without status evidence and recoverable patch snapshots is unfinished.

---

## P0 — Behavior-neutral preparation

> LANE: solo
> QA: Open the current Studio workflow; verify tabs, image selection and job progress behave as before.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:workflow && npm.cmd run smoke:ui && npm.cmd run smoke:operations

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 2, 10, 11 and phase P0, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P0 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: none.

Scope: Record the existing lint/build/smoke baseline; split the 916-line image-studio component into focused components and extract worker queue/dispatch helpers without behavior changes. Preserve the current routes, approval gates, costs and recovery. Adapt source-string tests to follow extracted modules without weakening their behavioral claims.
Expected files: src/features/images/components/, worker/jobs/, worker/index.mts, tests/smoke/.
Demoable outcome: The existing editorial workflow remains usable with no behavior change and its baseline checks still pass.
Test seam: Existing pure validators and queue helpers; compare pre/post behavior.
Prior art to imitate: tests/smoke/smoke-operations.mts; tests/smoke/smoke-editorial-ui.mjs.
QA to record: Open the current Studio workflow; verify tabs, image selection and job progress behave as before.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:workflow && npm.cmd run smoke:ui && npm.cmd run smoke:operations.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 2, 10, 11 and phase P0; verify every claim against code. Demonstrate "The existing editorial workflow remains usable with no behavior change and its baseline checks still pass." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P0-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P1 — Development access without sign-in

> LANE: solo
> OWNER: Before: use local fixtures/fakes; any real development Firebase identity or credentials are configured by the owner. During: stop before live auth changes or permissive rule deployment. After: verify anonymous development access and authenticated production isolation; unattended completion remains qa-pending.
> QA: Open a fresh local browser and verify live-data readiness without login; test production mode with the bypass flag set and confirm it still rejects anonymous access.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:auth && npm.cmd run smoke:workflow && npm.cmd run smoke:ui

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 9, 10, 11 and phase P1, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P1 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P0.
This is a supervised phase and must run alone. Do not assume an owner is present. In an attended session stop before the risky external action; in an unattended session implement only local code/tests and finish qa-pending with the owner's exact checks.
Owner checklist: Before: use local fixtures/fakes; any real development Firebase identity or credentials are configured by the owner. During: stop before live auth changes or permissive rule deployment. After: verify anonymous development access and authenticated production isolation; unattended completion remains qa-pending.

Scope: Make next dev usable without an interactive login, including browser Firestore readiness and dashboard subscriptions. Unify the development mode from a trusted server decision, hide sign-out when bypassed, show actionable connection failures, and force production authentication on even if a bypass flag is set. Use the narrowest development-only data bridge or automatic identity compatible with current Firebase access; no public permissive rules, shipped credentials or production bypass. Reject any development identity at production session boundaries. Do not exercise live identity issuance during unattended testing. Add smoke:auth with development/production and request-boundary regression cases.
Expected files: src/features/auth/, src/services/firebase/, src/app/studio/layout.tsx, src/app/api/auth/, src/proxy.ts, src/features/library/components/studio-dashboard.tsx.
Demoable outcome: A fresh local browser opens Studio without signing in; a production-mode request without a valid editor session is rejected.
Test seam: Auth mode/session policy and local request boundary with fake Firebase auth; browser readiness transitions.
Prior art to imitate: tests/smoke/smoke-workflow-contract.mjs; tests/smoke/smoke-operations.mts.
QA to record: Open a fresh local browser and verify live-data readiness without login; test production mode with the bypass flag set and confirm it still rejects anonymous access.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:auth && npm.cmd run smoke:workflow && npm.cmd run smoke:ui.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 9, 10, 11 and phase P1; verify every claim against code. Demonstrate "A fresh local browser opens Studio without signing in; a production-mode request without a valid editor session is rejected." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P1-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P2 — One complete 2.5D scene proof

> LANE: solo
> QA: Open /studio/preview?fixture=room-entry; play every Beat, switch Moment/Episode scopes, resize portrait/landscape and force CSS fallback. Confirm text remains readable and no manual camera input is required.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:schemas && npm.cmd run test:preview

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 3, 5, 7, 8 and phase P2, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P2 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P1.

Scope: Add approved Zod/Three.js/React Three Fiber/Playwright dependencies (and Three.js type declarations if required). Build a deterministic local fixture with source paragraphs, one Moment and several Beats. Parse the fixture through canonical schemas, serve its assembled draft bundle through a local preview endpoint, and render that exact bundle with HTML subtitles, layer parallax, one depthMesh and forced CSS fallback. Add /studio/preview?fixture=room-entry without cloud writes. Controls are Beat/Moment/Episode selection, play, pause, scrub and next/previous only; no camera authoring. Add smoke:schemas and test:preview scripts and the first browser-test prior art. Clearly label fixture provenance; no paid generation or claims about model quality.
Expected files: src/features/book-experience/schemas/, src/features/book-experience/preview/, src/features/book-experience/functions/, src/app/studio/preview/page.tsx, src/app/api/studio/preview/, fixtures/book-experience/, tests/book-experience/.
Demoable outcome: An editor opens one bundled scene, reads its HTML subtitles and previews the same Beats with WebGL depth meshes or CSS layers.
Test seam: EpisodeBundle parse/compile round-trip and pure resolveFrame; browser interaction against a local deterministic bundle.
Prior art to imitate: tests/smoke/smoke-posting.mts; tests/smoke/smoke-image-prompt.mts; new tests/book-experience/preview.spec.ts establishes the missing browser pattern.
QA to record: Open /studio/preview?fixture=room-entry; play every Beat, switch Moment/Episode scopes, resize portrait/landscape and force CSS fallback. Confirm text remains readable and no manual camera input is required.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:schemas && npm.cmd run test:preview.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 3, 5, 7, 8 and phase P2; verify every claim against code. Demonstrate "An editor opens one bundled scene, reads its HTML subtitles and previews the same Beats with WebGL depth meshes or CSS layers." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P2-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P3 — Canonical source and complete schema foundation

> LANE: solo
> QA: Approve a fixture source containing story and non-story paragraphs; inspect p000000, chunk sizes and immutable source pointer. Approve a correction and confirm old published bundles remain unchanged.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:schemas && npm.cmd run smoke:canonical && npm.cmd run smoke:pdf && npm.cmd run smoke:uncertainties

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 3, 4, 9 and phase P3, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P3 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P2.

Scope: Complete every schema in plan section 3 and Firestore codecs; keep one shared source of truth. Promote approved SourceRevision to versioned canonical.json plus 20-paragraph chunk projections with sourceId, hash, kind and isStory. Adopt p000000-based seq scoped to a sourceId; retain source correction history and explicit downstream invalidation. Preserve current PDF/text/OCR/EPUB capabilities. Replace deleting non-story paragraphs with classification in the canonical flow. Stage generation outputs and promote active pointers only after validation; do not migrate or delete existing remote records. Build the source review/approval slice against local repositories/fakes, with invalid-source and promotion-interruption tests. Add smoke:canonical.
Expected files: src/features/book-experience/schemas/, src/features/book-experience/storage/, src/features/sources/, worker/extraction.mts, worker/ingest.mts, src/app/api/books/.
Demoable outcome: A fixture source is approved into immutable canonical text, every paragraph remains traceable, and a correction revision marks dependent drafts outdated.
Test seam: canonicalizeSource/promoteSource and storage codecs against fake repositories, with hash/ID/coverage validation.
Prior art to imitate: tests/smoke/smoke-pdf-cleaning.mts; tests/smoke/smoke-workflow-contract.mjs.
QA to record: Approve a fixture source containing story and non-story paragraphs; inspect p000000, chunk sizes and immutable source pointer. Approve a correction and confirm old published bundles remain unchanged.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:schemas && npm.cmd run smoke:canonical && npm.cmd run smoke:pdf && npm.cmd run smoke:uncertainties.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 3, 4, 9 and phase P3; verify every claim against code. Demonstrate "A fixture source is approved into immutable canonical text, every paragraph remains traceable, and a correction revision marks dependent drafts outdated." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P3-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P4 — Durable jobs and automatic planning orchestration

> LANE: solo
> OWNER: Before: prepare deterministic job/provider fixtures, no live worker. During: stop before touching a live queue, paid providers or changing budget authority. After: inspect lease recovery, approval idempotency and cost accounting evidence; live kill/restart verification belongs to P13.
> QA: Approve twice, interrupt a fake multi-step job and resume it; verify one successor job, retained checkpoints and no duplicate completed-call charges. Confirm no visual generation starts without your selection.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:job-engine && npm.cmd run smoke:operations && npm.cmd run smoke:batch && npm.cmd run smoke:workflow

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 4, 6, 9 and phase P4, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P4 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P3.
This is a supervised phase and must run alone. Do not assume an owner is present. In an attended session stop before the risky external action; in an unattended session implement only local code/tests and finish qa-pending with the owner's exact checks.
Owner checklist: Before: prepare deterministic job/provider fixtures, no live worker. During: stop before touching a live queue, paid providers or changing budget authority. After: inspect lease recovery, approval idempotency and cost accounting evidence; live kill/restart verification belongs to P13.

Scope: Introduce one job document per job, transactional leases, heartbeats, retries, checkpoints, cancellation, idempotency and bounded concurrency. Wrap existing LLM/image transport behind LlmProvider/ImageProvider; do not add dedicated depth/segment/inpaint vendors. Automatically enqueue only the next eligible AI planning step after approval; expensive visual generation requires an explicit single/batch selection. Keep existing model configuration, budget confirmation and idempotent costs. Approval actions and plan repairs must be safe against duplicate clicks, stale versions and failed prerequisites. Add smoke:job-engine using fake clocks and providers; migrate callers incrementally while temporary code adapters remain until P12.
Expected files: src/features/book-experience/jobs/, src/features/jobs/, worker/jobs/, worker/providers/, worker/index.mts, src/app/api/books/[bookId]/jobs/.
Demoable outcome: Approving a fixture checkpoint advances the next planning job automatically; a killed/retried job resumes without repeating completed calls or costs.
Test seam: claimJob/advancePipeline/resumeJob through fake clock, provider and repository boundaries.
Prior art to imitate: tests/smoke/smoke-operations.mts; tests/smoke/smoke-image-batch.mts.
QA to record: Approve twice, interrupt a fake multi-step job and resume it; verify one successor job, retained checkpoints and no duplicate completed-call charges. Confirm no visual generation starts without your selection.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:job-engine && npm.cmd run smoke:operations && npm.cmd run smoke:batch && npm.cmd run smoke:workflow.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 4, 6, 9 and phase P4; verify every claim against code. Demonstrate "Approving a fixture checkpoint advances the next planning job automatically; a killed/retried job resumes without repeating completed calls or costs." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P4-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P5 — Rolling ledger and redesigned Book Model

> LANE: solo
> OWNER: Before: prepare the alias/flashback fixtures. During: stop before paid understanding calls or changing the no-fabricated-facts rule. After: inspect deterministic replay, evidence validity and retained approvals; real-book model quality remains an owner check in P13.
> QA: Review a fixture with an alias change and flashback; verify correct state and spoiler-safe identity, reject a proposal and inspect the AI revision, then approve without entering data.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:book-model && npm.cmd run smoke:schemas && npm.cmd run smoke:bible

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 3, 6, 7 and phase P5, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P5 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P4.
This is a supervised phase and must run alone. Do not assume an owner is present. In an attended session stop before the risky external action; in an unattended session implement only local code/tests and finish qa-pending with the owner's exact checks.
Owner checklist: Before: prepare the alias/flashback fixtures. During: stop before paid understanding calls or changing the no-fabricated-facts rule. After: inspect deterministic replay, evidence validity and retained approvals; real-book model quality remains an owner check in P13.

Scope: Implement chapter-bounded understanding windows, overlap deduplication, compact entity/alias context, rolling synopsis, deterministic ledger deltas and per-window immutable checkpoints. Consolidate Entity/Event/state/reveal/relationship models with provenance. AI resolves alias conflicts and proposes merges/splits for approval; the owner never types entity data. Preserve approved editorial decisions on regeneration. Build searchable Entity table/detail and Event chronology review with source links, facts versus invented fills, pre-reveal identity and state-specific references. Keep existing supported terminology/chapter summaries as derived context rather than silently discarding them. Add smoke:book-model.
Expected files: worker/book-model/, src/features/book-experience/book-model/, src/features/bible/, src/app/api/books/[bookId]/model/.
Demoable outcome: An editor reviews an AI-proposed book model with evidence, separate storyTime and reveal seq, and approves it without entering fields.
Test seam: applyLedgerDelta/consolidateModel/resolveEntityState and reveal visibility using schema-parsed fixtures and fake LLM responses.
Prior art to imitate: tests/smoke/smoke-bible.mts; tests/smoke/smoke-posting.mts.
QA to record: Review a fixture with an alias change and flashback; verify correct state and spoiler-safe identity, reject a proposal and inspect the AI revision, then approve without entering data.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:book-model && npm.cmd run smoke:schemas && npm.cmd run smoke:bible.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 3, 6, 7 and phase P5; verify every claim against code. Demonstrate "An editor reviews an AI-proposed book model with evidence, separate storyTime and reveal seq, and approves it without entering fields." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P5-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P6 — Story Map, Episodes and Moments

> LANE: solo
> QA: Inspect an AI map and moment timeline, inject a coverage gap and overlap, verify repair/blocking, and approve the valid proposal without changing boundaries manually.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:story-planning && npm.cmd run smoke:episodes && npm.cmd run smoke:moments

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 3, 6, 7 and phase P6, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P6 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P5.

Scope: AI creates StoryMap acts/arcs/chronology and strict Episode ranges, then per-episode plans and contiguous Moment ranges in book order. Retain existing boundary validation internals but remove required manual boundary/field editing from the primary UI. Build timeline review, source highlights, stage chips and approval-driven progression; invalid gaps/overlaps trigger bounded AI repair, not a blank form. New Moments are scene containers rather than the old primary-text/one-image StoryMomentPlan. Permit continuing later-episode production after an earlier episode is published. Add smoke:story-planning.
Expected files: src/features/book-experience/story-map/, src/features/episodes/, src/features/moments/, worker/story-planning/, src/app/api/books/[bookId]/episodes/.
Demoable outcome: An editor approves AI-proposed Episode and Moment ranges, sees complete story coverage, and proceeds through clear next-action buttons.
Test seam: validateStoryCoverage/planEpisode/planMoments through fake AI output and deterministic range validators.
Prior art to imitate: tests/smoke/smoke-episode-map.mts; tests/smoke/smoke-moments.mts.
QA to record: Inspect an AI map and moment timeline, inject a coverage gap and overlap, verify repair/blocking, and approve the valid proposal without changing boundaries manually.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:story-planning && npm.cmd run smoke:episodes && npm.cmd run smoke:moments.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 3, 6, 7 and phase P6; verify every claim against code. Demonstrate "An editor approves AI-proposed Episode and Moment ranges, sees complete story coverage, and proceeds through clear next-action buttons." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P6-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P7 — AI Beat planning and complete-book representation

> LANE: solo
> QA: Inspect a long passage and an internal thought: confirm all meaning survives across subtitles/visuals, quotes match source offsets, future identities stay hidden, and malformed coverage blocks approval.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:beats && npm.cmd run smoke:text && npm.cmd run smoke:posting && npm.cmd run test:preview

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 3, 5, 6, 7 and phase P7, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P7 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P6.

Scope: Generate structured quotes/dialogue/commentary, sentence-level grounding, source offsets, representations and semantic camera/transition plans. Every story paragraph needs a meaningful representation; arbitrary ID tagging is insufficient and explicit/internal meaning that visuals cannot preserve must remain in HTML subtitles. Preserve source order, split long text without dropping content, and gate entities by each Beat's seq. AI supplies every camera target, pose, timing and transition; the owner reviews/approves only. Reuse the fixture preview with clear pending-visual placeholders. Add smoke:beats and coverage-negative cases.
Expected files: src/features/book-experience/beats/, src/features/book-experience/coverage/, src/features/moment-text/, worker/beats/, worker/commentary.mts.
Demoable outcome: An editor previews AI-planned Beats with readable subtitles and a complete paragraph-to-Beat coverage review, with no camera or text entry.
Test seam: buildBeats/validateRepresentations/validateVerbatim/verifyCommentary/resolveRevealView with fake LLM and canonical source.
Prior art to imitate: tests/smoke/smoke-moment-text.mts; tests/smoke/smoke-posting.mts; tests/book-experience/preview.spec.ts from P2.
QA to record: Inspect a long passage and an internal thought: confirm all meaning survives across subtitles/visuals, quotes match source offsets, future identities stay hidden, and malformed coverage blocks approval.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:beats && npm.cmd run smoke:text && npm.cmd run smoke:posting && npm.cmd run test:preview.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 3, 5, 6, 7 and phase P7; verify every claim against code. Demonstrate "An editor previews AI-planned Beats with readable subtitles and a complete paragraph-to-Beat coverage review, with no camera or text entry." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P7-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P8 — Immutable visual references and single/batch generation

> LANE: solo
> QA: Select one target and a batch, inspect their reference provenance, reject a foreground/depth asset and regenerate only the affected target. Verify reference approval blocks premature scene generation.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:visual-generation && npm.cmd run smoke:images && npm.cmd run smoke:batch && npm.cmd run smoke:visual

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 3, 4, 6, 7 and phase P8, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P8 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P7.

Scope: AI proposes book visualProfile and entity/state reference sets; generation is owner-triggered for one or multiple selected targets. Approve and version references before generating dependent scenes. Generate aligned clean background, RGBA foreground layers and optional depth assets directly through the configured ImageProvider using the same coordinate frame/reference versions. Use generated backgrounds with complete hidden coverage; do not introduce segmentation/depth/inpaint services or manual upload/edit tools. Validate outputs and expose targeted regenerate actions. Record immutable S3 keys, source/reference versions, actual bit depth, prompts, model, costs and continuity results. Add smoke:visual-generation; tests use deterministic images/fake uploads.
Expected files: src/features/book-experience/visuals/, src/features/visual/, src/features/images/, worker/visuals/, worker/image-api.mts, worker/image-batch.mts.
Demoable outcome: An editor approves consistent references, selects one or several visual targets to generate, and regenerates a failed asset while approved assets remain unchanged.
Test seam: assembleVisualRequest/validateAsset/planRegeneration through fake ImageProvider and S3 boundary; existing bounded batch pool.
Prior art to imitate: tests/smoke/smoke-image-prompt.mts; tests/smoke/smoke-image-batch.mts; tests/smoke/smoke-visual-system.mts.
QA to record: Select one target and a batch, inspect their reference provenance, reject a foreground/depth asset and regenerate only the affected target. Verify reference approval blocks premature scene generation.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:visual-generation && npm.cmd run smoke:images && npm.cmd run smoke:batch && npm.cmd run smoke:visual.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 3, 4, 6, 7 and phase P8; verify every claim against code. Demonstrate "An editor approves consistent references, selects one or several visual targets to generate, and regenerates a failed asset while approved assets remain unchanged." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P8-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P9 — Automatic 2.5D assembly and actionable previews

> LANE: solo
> OWNER: Before: use the deterministic asset fixture, then owner-supplied generated assets when available. During: stop before paid regeneration or weakening camera/coverage validation. After: visually inspect silhouettes, holes, layer order, subtitle legibility, motion comfort and fallback; browser automation cannot certify artistic quality.
> QA: Play Beat, Moment and Episode scopes; test camera extremes, portrait/landscape, reduced motion and forced CSS fallback. Follow a rejected-layer blocker to regeneration and back to preview with no manual scene authoring.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:compose && npm.cmd run smoke:beats && npm.cmd run test:preview

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 3, 5, 7, 8 and phase P9, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P9 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P8.
This is a supervised phase and must run alone. Do not assume an owner is present. In an attended session stop before the risky external action; in an unattended session implement only local code/tests and finish qa-pending with the owner's exact checks.
Owner checklist: Before: use the deterministic asset fixture, then owner-supplied generated assets when available. During: stop before paid regeneration or weakening camera/coverage validation. After: visually inspect silhouettes, holes, layer order, subtitle legibility, motion comfort and fallback; browser automation cannot certify artistic quality.

Scope: Assemble generated layers into canonical compositions; resolve semantic AI targets to layer IDs, compute safeCamera from actual layer/background coverage and depth displacement, clamp/replan cameras and block unsafe compositions. Finish WebGL plane/depthMesh rendering, responsive crops, transition execution, DOM subtitles and CSS fallback with deterministic reduced capability. Provide direct Beat/Moment/Episode preview with layer/depth inspection, actionable blockers, approve-and-continue, generate selected and regenerate; no required camera/layer/text inputs. Empty/loading/error/outdated/partial states must be explicit. Add smoke:compose and extend test:preview with real rendering fixtures, context loss, forced fallback and source-to-episode progression.
Expected files: src/features/book-experience/compositions/, src/features/book-experience/preview/, worker/compositions/, src/app/studio/books/[bookId]/.
Demoable outcome: An editor previews a complete assembled Episode, clicks the exact action that resolves each blocker, and approves without setting camera directions or editing scene data.
Test seam: assembleComposition/computeSafeCamera/resolveFrame/getNextAction plus P2 browser fixture seams.
Prior art to imitate: tests/smoke/smoke-image-prompt.mts; tests/book-experience/preview.spec.ts from P2.
QA to record: Play Beat, Moment and Episode scopes; test camera extremes, portrait/landscape, reduced motion and forced CSS fallback. Follow a rejected-layer blocker to regeneration and back to preview with no manual scene authoring.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:compose && npm.cmd run smoke:beats && npm.cmd run test:preview.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 3, 5, 7, 8 and phase P9; verify every claim against code. Demonstrate "An editor previews a complete assembled Episode, clicks the exact action that resolves each blocker, and approves without setting camera directions or editing scene data." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P9-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P10 — Independent episode publishing and safe regeneration

> LANE: solo
> QA: Publish Episode 1 while Episode 2 is incomplete; regenerate a shared visual into a draft, compare, approve replacement, and roll the pointer back in fixtures. Confirm old bundles/assets and other episodes do not change.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:bundles && npm.cmd run smoke:publishing && npm.cmd run smoke:posting && npm.cmd run smoke:completion && npm.cmd run test:preview

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 3, 4, 8 and phase P10, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P10 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P9.

Scope: Compile canonical EpisodeBundle/manifest with checksummed immutable AWS assets, source/reference lineage and per-Beat spoiler-safe entity views. Publish each completed Episode independently; upload/verify everything before atomically promoting its Firestore pointer and versioned book catalog reference. Build Published/Working revision/Compare preview modes, localized regeneration invalidation, explicit replacement approval, rollback and withdrawal. Never mutate a shared published composition. Preserve stable IDs and explicit old-to-new progress anchors where Beats change; define external Reader session pinning/catalog discovery without building that app. Add smoke:bundles and smoke:publishing with fake storage and publish-race/failure tests.
Expected files: src/features/book-experience/publishing/, src/features/posting/, src/features/completion/, src/app/api/books/[bookId]/published/, worker/publishing/.
Demoable outcome: Episode 1 becomes independently available in a fixture catalog; regenerating its visual leaves version 1 unchanged until approved version 2 is atomically promoted.
Test seam: compileEpisodeBundle/publishEpisode/promoteRevision/resolveProgressAnchor through fake storage and compare-and-swap repository.
Prior art to imitate: tests/smoke/smoke-posting.mts; tests/smoke/smoke-completion.mts; tests/book-experience/preview.spec.ts from P2.
QA to record: Publish Episode 1 while Episode 2 is incomplete; regenerate a shared visual into a draft, compare, approve replacement, and roll the pointer back in fixtures. Confirm old bundles/assets and other episodes do not change.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:bundles && npm.cmd run smoke:publishing && npm.cmd run smoke:posting && npm.cmd run smoke:completion && npm.cmd run test:preview.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 3, 4, 8 and phase P10; verify every claim against code. Demonstrate "Episode 1 becomes independently available in a fixture catalog; regenerating its visual leaves version 1 unchanged until approved version 2 is atomically promoted." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P10-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P11 — Canonical data access rules

> LANE: solo
> OWNER: Before: owner may prepare a local emulator and its runtime; no production console is needed for implementation. During: stop before rules deployment, IAM/CDN policy changes or live data access. After: review emulator evidence and production-mode auth negatives; deploy only in P13.
> QA: With local rules applied, verify anonymous users cannot read source/model/draft/job data, published pointers expose only sanitized fields, and direct client writes fail. Verify production never accepts development bypass.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:auth && npm.cmd run smoke:posting && npm.cmd run smoke:publishing

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 4, 9, 10 and phase P11, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P11 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P10.
This is a supervised phase and must run alone. Do not assume an owner is present. In an attended session stop before the risky external action; in an unattended session implement only local code/tests and finish qa-pending with the owner's exact checks.
Owner checklist: Before: owner may prepare a local emulator and its runtime; no production console is needed for implementation. During: stop before rules deployment, IAM/CDN policy changes or live data access. After: review emulator evidence and production-mode auth negatives; deploy only in P13.

Scope: Isolate the security transition from the old public episodes/storyMoments paths to private editorial collections plus sanitized published pointers/catalog. Retain trusted server writes and editor-only working records; never make all books or descendants public. Add required indexes for per-job queries. Preserve production authentication and development-only access separation from P1. Test actual access with an available local Firestore emulator and existing SDK REST facilities where possible; do not add unapproved test dependencies. If emulator unavailable, run static tests but explicitly mark behavioral rules validation qa-pending. Do not deploy rules or create Reader progress/account write policies.
Expected files: firestore.rules, firestore.indexes.json, src/features/book-experience/storage/, tests/smoke/smoke-firestore-rules.mjs, tests/book-experience/.
Demoable outcome: Local rule tests distinguish editor drafts from published pointers and reject anonymous draft reads/client writes; deployment remains owner-controlled.
Test seam: Firestore access-policy boundary through emulator requests for anonymous/editor identities; static checks are supplementary only.
Prior art to imitate: tests/smoke/smoke-firestore-rules.mjs; no existing emulator prior art, establish tests/book-experience/rules.mts without claiming static checks prove security.
QA to record: With local rules applied, verify anonymous users cannot read source/model/draft/job data, published pointers expose only sanitized fields, and direct client writes fail. Verify production never accepts development bypass.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:auth && npm.cmd run smoke:posting && npm.cmd run smoke:publishing.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 4, 9, 10 and phase P11; verify every claim against code. Demonstrate "Local rule tests distinguish editor drafts from published pointers and reject anonymous draft reads/client writes; deployment remains owner-controlled." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P11-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P12 — Contract cleanup and complete workflow verification

> LANE: solo
> QA: Produce the full fixture using only approvals and visual generation selections; verify every story paragraph is represented, all three preview scopes work, and published version 1 survives draft regeneration.
> GATE: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:workflow && npm.cmd run smoke:ui && npm.cmd run smoke:auth && npm.cmd run smoke:schemas && npm.cmd run smoke:canonical && npm.cmd run smoke:job-engine && npm.cmd run smoke:book-model && npm.cmd run smoke:story-planning && npm.cmd run smoke:beats && npm.cmd run smoke:visual-generation && npm.cmd run smoke:compose && npm.cmd run smoke:bundles && npm.cmd run smoke:publishing && npm.cmd run smoke:episodes && npm.cmd run smoke:bible && npm.cmd run smoke:moments && npm.cmd run smoke:text && npm.cmd run smoke:visual && npm.cmd run smoke:images && npm.cmd run smoke:batch && npm.cmd run smoke:posting && npm.cmd run smoke:completion && npm.cmd run smoke:operations && npm.cmd run smoke:pdf && npm.cmd run smoke:uncertainties && npm.cmd run test:preview

```
Start in C:/Users/800sa/studio. Read docs/features/25d-schema-foundation/plan.md sections 1, 10, 11 and phase P12, plus docs/CONTEXT.md and docs/features/25d-schema-foundation/status.md.
Set only the P12 row to in-progress; record a baseline of current tracked/untracked changes before editing. Dependencies: P11.

Scope: Contract the temporary code adapters only after all new callers and tests use canonical schemas; remove superseded code paths, not cloud data or the owner's new.md. Verify one complete local fixture from approved source through AI plans, selected visual generation, preview, independent publication and replacement. Preserve existing supported extraction/model-settings/cost features; remove required editorial form inputs from the primary flow. Run all package-defined smoke scripts, preview tests, lint and build; record baseline defects without silently fixing unrelated work. Do not create a Reader, distribution/payment features or extra documentation.
Expected files: src/features/book-experience/, src/features/bible/, src/features/episodes/, src/features/moments/, src/features/posting/, worker/, tests/.
Demoable outcome: A complete book fixture can be produced using approvals, single/batch visual generation and preview alone, and no retired storage/schema path remains a required consumer.
Test seam: Local workflow fixtures through canonical schemas, fake provider/repository boundaries and the established preview browser tests.
Prior art to imitate: tests/smoke/smoke-workflow-contract.mjs; tests/book-experience/preview.spec.ts from P2.
QA to record: Produce the full fixture using only approvals and visual generation selections; verify every story paragraph is represented, all three preview scopes work, and published version 1 survives draft regeneration.
Gates: npm.cmd run lint && npm.cmd run build && npm.cmd run smoke:workflow && npm.cmd run smoke:ui && npm.cmd run smoke:auth && npm.cmd run smoke:schemas && npm.cmd run smoke:canonical && npm.cmd run smoke:job-engine && npm.cmd run smoke:book-model && npm.cmd run smoke:story-planning && npm.cmd run smoke:beats && npm.cmd run smoke:visual-generation && npm.cmd run smoke:compose && npm.cmd run smoke:bundles && npm.cmd run smoke:publishing && npm.cmd run smoke:episodes && npm.cmd run smoke:bible && npm.cmd run smoke:moments && npm.cmd run smoke:text && npm.cmd run smoke:visual && npm.cmd run smoke:images && npm.cmd run smoke:batch && npm.cmd run smoke:posting && npm.cmd run smoke:completion && npm.cmd run smoke:operations && npm.cmd run smoke:pdf && npm.cmd run smoke:uncertainties && npm.cmd run test:preview.

Use docs/CONTEXT.md and the plan's exact vocabulary/ADRs for identifiers, labels and data contracts. Do not rename concepts or add a competing type system.
Read AGENTS.md and the relevant bundled node_modules/next/dist/docs guide before changing Next code. Read each file before editing; use apply_patch; preserve user changes and untracked new.md. No unrelated cleanup.
New source belongs in the scoped feature/worker folders above; thin app routes and Firebase adapters are explicit exceptions. Keep EVERY file below 1000 lines and split before growing it. Do not create unrelated README/docs files.
Approved dependencies only: zod, three, @react-three/fiber, @playwright/test and necessary Three.js type declarations. No additional direct dependency without owner approval; in an unattended run record the missing dependency and continue only independent work.
The owner never supplies camera direction, prompts, layer coordinates or text/structured-data corrections. AI plans; the owner approves and selects visuals to generate/regenerate. No separate Reader app or third-party depth/segment/inpaint provider.
All generated visual assets and published bundles use immutable S3 keys/CloudFront; sources/canonical text stay Firebase Storage. Preserve approved source/reference/published versions; no rewriting live assets during draft regeneration.
Test through this phase's named seam using the stated prior art. Use local fakes/fixtures and no paid or live writes. Never execute existing live-writing E2E scripts against .env, expose credentials, deploy rules, publish live content or delete cloud data.
Before starting, check status.md dependencies: done or qa-pending permits progress. If a dependency is todo/blocked, build only independent in-scope work, use the smallest explicitly labelled placeholder, name the gaps and end qa-pending if code landed; never recreate another phase wholesale or claim a placeholder is real.
Never edit plan.md, prompts.md or CONTEXT.md. If the plan is wrong, append the contradiction to status.md Deferred and stop this phase; a new architectural decision belongs to the owner. Out-of-scope findings are logged, not fixed.
Before completion: re-read plan sections 1, 10, 11 and phase P12; verify every claim against code. Demonstrate "A complete book fixture can be produced using approvals, single/batch visual generation and preview alone, and no retired storage/schema path remains a required consumer." and log one line of actual evidence. No demonstrable outcome means qa-pending, not done.
Run exactly the listed gates plus any phase-relevant test justified by a new failure. Report actual failures/skips; no done with a failed or unrun gate. Inspect this phase's diff for source placement, file sizes, preserved auth/approvals, no secrets, no scope creep.
Update docs/features/25d-schema-foundation/status.md: own row state/date/all gate results, precise actionable Notes, dated Progress log and appended Deferred. Use done only if code/outcome/gates all pass; use qa-pending for complete code with explicit unverified owner steps; blocked only when required work did not land.
Save a tracked binary patch using git diff --binary --output=.patches/P12-studio.patch (create .patches safely first). Also snapshot this phase's new non-secret files using individual no-index patches or explicit copies, because git diff omits untracked files. Record baseline and changed-file list; do not stage or overwrite owner changes.
NEVER git commit, git push, deploy, reset --hard, checkout -- ., or perform a broad destructive restore. Suggest a commit message for studio but do not commit.
Execute only this phase and stop. Do not launch loop.sh, a nested runner or another orchestration. No sub-agent delegation is required by this phase.
```

---

## P13 — Owner-only real generation and release acceptance

> LANE: solo
> HUMAN-ONLY: Real paid generation, live publication, deployment, rules deployment and any remote deletion are reserved to the owner. D-1 needs real sample evidence.
> OWNER: Before: choose/configure the existing image provider model, review its spend limit, configure development Firebase and S3/CloudFront, and review QA.md/audit findings. Model/credential setup can be front-loaded; real asset quality cannot be proven with fakes. During: owner alone authorizes paid generation, live publication, deployment and any deletion; no deletion is required by this plan. After: verify model capability, real asset alignment, CDN delivery, rule privacy and episode replacement/rollback. Record D-1's outcome without rewriting plan.md.
> QA: Generate an owner-approved real sample, check identity continuity/alpha/depth and subtitles on desktop and mobile, publish Episode 1, regenerate into a draft, verify readers retain version 1, then approve replacement and test rollback.

```
OWNER-ONLY CHECKLIST. This is not an autonomous coding phase. An unattended agent must not execute these steps.
Read docs/features/25d-schema-foundation/plan.md sections 8, 9, 11, phase P13, docs/CONTEXT.md, status.md, QA.md and the latest audit.
Scope: Owner configures the selected image model and development services, runs a limited paid source/reference/layer/depth sample, evaluates continuity and complete-book representation, and resolves D-1. Owner validates on intended phones, deploys reviewed rules/application changes and explicitly publishes a sample Episode if desired. Agents must never run this phase unattended, issue paid model calls, deploy, delete existing remote data or publish live content. Do not treat completion of local code as completion of this phase.
Owner preparation and checks: Before: choose/configure the existing image provider model, review its spend limit, configure development Firebase and S3/CloudFront, and review QA.md/audit findings. Model/credential setup can be front-loaded; real asset quality cannot be proven with fakes. During: owner alone authorizes paid generation, live publication, deployment and any deletion; no deletion is required by this plan. After: verify model capability, real asset alignment, CDN delivery, rule privacy and episode replacement/rollback. Record D-1's outcome without rewriting plan.md.
Acceptance: Generate an owner-approved real sample, check identity continuity/alpha/depth and subtitles on desktop and mobile, publish Episode 1, regenerate into a draft, verify readers retain version 1, then approve replacement and test rollback.
Dependencies: P12 and real D-1 evidence. Local gates cannot prove visual-model capability or deployed authorization.
Only after the owner performs and verifies the work, record its actual outcome and D-1 evidence in status.md without changing the locked plan. Missing release/real-generation checks keep this phase blocked or qa-pending as appropriate, never done by inference.
No agent may commit, push, deploy, spend money, publish live content or delete remote data on behalf of this checklist.
```

---

## AUDIT — did the confirmed product actually get built?

```
Audit the 25d-schema-foundation work in C:/Users/800sa/studio. This is READ-ONLY verification: never fix source, never edit plan/prompts/status/CONTEXT, never commit, push, deploy, seed real data, issue paid model calls or publish live content. You may run safe local build/lint/tests and write only the audit report named below.
Read docs/features/25d-schema-foundation/plan.md, prompts.md, status.md and docs/CONTEXT.md in full. Treat every done/qa-pending claim as a claim to prove, not truth. Read the current diff against the phase baselines and do not blame owner changes on this feature.

1. Plan fidelity: for every completed phase, trace its exact scope and demoable outcome into code and runtime evidence. A scaffold or placeholder is not a completed feature. Mark unbuilt future phases "not yet due" rather than inventing defects.
2. Contract integrity: confirm schemas are shared by Next, worker, codecs, provider validation, fixtures, preview and bundle compiler. Verify actual round-trips, sourceId/hash pins, UTF-16 quote offsets, strict coverage, semantic Representation review and per-Beat spoiler views. No prototype string-text/gradient shape may silently replace the canonical contract.
3. Owner workflow: run the fixture journey using approval, visual selection/generation and preview only. No manual prompt/camera/layer/text/data entry may be required. Verify next-action blockers are real links/actions, draft placeholders are explicit and approval cannot bypass validation.
4. Visual/runtime fidelity: inspect reference version pins and continuity gates, transparent output validation, truthful depth metadata, plane/depthMesh behavior, safeCamera computation, DOM subtitles, responsive crops, reduced motion and CSS fallback. Distinguish machine tests from unverified artistic/mobile quality.
5. Publication: verify each Episode publishes independently to fixture storage; bundles/assets remain immutable; catalog/pointer promotion is atomic and race-safe; regenerate changes only a draft; shared published assets, older active sessions and progress anchors remain valid; rollback/withdrawal do not delete historical output.
6. Security: prove production cannot enable development bypass; verify browser readiness without interactive dev login; report actual emulator evidence versus static rules checks. Ensure editorial source/model/job data remains private and no Reader account/progress implementation or auth widening was added. Never issue live tokens or deploy policies.
7. Gates: run npm.cmd run lint, npm.cmd run build, every current safe package script named smoke:* and npm.cmd run test:preview. Inspect scripts before executing so no live-writing/new unsafe command gets swept in. Existing smoke-e2e.mts and smoke-formats.mts are not safe autonomous gates. Report each failure/skip and whether pre-existing. Planned scripts missing after their owner phase are findings.
8. Universal invariants: files below 1000 lines, new code in declared feature/worker folders with allowed app/service adapters, approved dependencies only, vocabulary/ADRs honored, no commits/push/deploy, no secret exposure, no modified plan, and tracked plus untracked patch snapshots for completed phases.
9. Incomplete work: list non-done phases, Deferred, new TODO/FIXME, stale adapters and unsupported claims. Especially D-1/P13 cannot pass because a fixture looks good. The real provider sample, paid calls, live release and real device quality remain owner-only.
10. Owner actions: rank NOW-BLOCKING, BEFORE-DEPLOY, COMMITS (suggestions only) and LATER. State exact manual checks and actual executable commands when present; do not invent scripts. Distinguish incomplete code from complete-but-unverified code.

Write docs/features/25d-schema-foundation/audit-<current-YYYY-MM-DD>.md with severity, file/line evidence, failing command output and explicit unverified limits. This date token is computed at execution time, not a scaffold placeholder. Do not fix anything while auditing. Give a short prioritized summary in chat.
```

## Unattended run and handoff

The supplied loop.sh is the installed grillscaffold/loop-pilot template v5 (bundle 8.2.0), with only repository/phase/platform configuration filled in.
Use Git Bash on this Windows machine. Python's WindowsApps alias is not executable here; the runner prepends the verified real Python directory on Windows.
Preflight is read-only and prints phases, gates, owner checks and agent CLI status. It does not start implementation or paid requests.

```bash
cd /c/Users/800sa/studio
AGENT=codex bash docs/features/25d-schema-foundation/loop.sh --preflight
AGENT=codex bash docs/features/25d-schema-foundation/loop.sh
```

The owner must choose when to start. This scaffold creation does not run the loop.
Alternatively copy one phase block into an attended agent session, in order. AGENT can be claude, codex or kimi; the Kimi adapter is supplied by the template but unverified.
Check the installed agent's headless permission settings first. Do not weaken workspace or production restrictions to clear a failed preflight. The runner supplies fresh processes, write-scoped sandbox configuration and noninteractive behavior; these flags do not grant authority for external actions.
Every phase runs alone from the declared waves/solo lanes. The runner supports parallel waves generally, but this feature deliberately has none.
The loop attempts local parts of supervised phases and records qa-pending with owner checks. P13's HUMAN-ONLY marker is the hard brake; it is never attempted.
qa-pending satisfies dependencies; incomplete dependencies can be swept forward once with honest placeholders. A failed gate is evidence to retry once, then a defect, never permission to fabricate completion.
At the end the loop attempts the read-only AUDIT and writes QA.md plus .runinfo. Read QA.md first, then the audit and status.md Deferred. Audit absence/failure is itself an unverified outcome.
A local build finishing does not resolve P13; the template may report INCOMPLETE while intentionally reserved human-only work remains.
All source stays uncommitted. Review code and patch snapshots before owner-controlled commit/deployment.

### Optional Claude Code interactive alternative

The supported unattended path is loop.sh. This interactive /loop variant requires an owner to invoke it; do not start it during scaffolding:

```text
/loop Read docs/features/25d-schema-foundation/plan.md, prompts.md and status.md. Execute the numbered phases in their declared sequential waves using one fresh agent context per phase. Never run HUMAN-ONLY P13. For supervised phases implement only safe local work and record qa-pending with owner checks. Never commit, push, deploy, use paid providers, mutate live data or publish live episodes. Check dependency states; log missing work and honest placeholders without pretending it landed. Run the declared safe gates, retry one failure with evidence, then record the defect and continue independent work. Require every phase's status update and tracked/untracked patch snapshots. Finish with the read-only AUDIT and a QA.md owner checklist in four sections: verify these, unresolved defects, owner-only steps, and done/gate-verified; include start/end times. Stop after the audit/checklist and report unfinished work honestly.
```

The interactive alternative lacks the shell runner's independent gate/watchdog checks; it is not evidence of unattended runner verification.
