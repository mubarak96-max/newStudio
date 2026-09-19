# QA — 25d-schema-foundation

Run started 2026-09-19 11:12 · ended 2026-09-19 11:53 · agent codex · result **INCOMPLETE**
Tick boxes here or in the loop-pilot dashboard. Sections 1–3 need you; section 4 is done and gate-verified.

## 1. Verify these (complete — awaiting your eyes)
- [ ] **P4** — Code complete unattended (commits 972b1ff, 97bc450; zero source edits this attempt): one-document-per-job engine, provider boundaries, approval pipeline, lease recovery, idempotent costs; owner must verify lease recovery, approval idempotency and cost evidence in fixture runs plus confirm no visual auto-start (steps in Progress log); live kill/restart belongs to P13. Patch .patches/P4-studio.patch + new-file copies.
  - [ ] QA: Approve twice, interrupt a fake multi-step job and resume it; verify one successor job, retained checkpoints and no duplicate completed-call charges. Confirm no visual generation starts without your selection.
  - [ ] OWNER: Before: prepare deterministic job/provider fixtures, no live worker. During: stop before touching a live queue, paid providers or changing budget authority. After: inspect lease recovery, approval idempotency and cost accounting evidence; live kill/restart verification belongs to P13.
- [ ] **P5** — Code complete unattended: rolling ledger + Book Model review; owner must inspect deterministic replay, evidence validity and retained approvals in fixture runs plus approve/reject/regenerate without entering data (steps in Progress log); real-book model quality belongs to P13. Patch .patches/P5-studio.patch + new-file copies.
  - [ ] QA: Review a fixture with an alias change and flashback; verify correct state and spoiler-safe identity, reject a proposal and inspect the AI revision, then approve without entering data.
  - [ ] OWNER: Before: prepare the alias/flashback fixtures. During: stop before paid understanding calls or changing the no-fabricated-facts rule. After: inspect deterministic replay, evidence validity and retained approvals; real-book model quality remains an owner check in P13.
- [ ] **P9** — Code complete unattended: assembly, safeCamera, Episode preview with blockers and approve-and-continue; owner must play all scopes, test extremes/crops/motion/fallback, follow a rejected layer to regeneration, and visually certify art quality (steps in Progress log); paid regeneration never exercised. Patch .patches/P9-studio.patch + new-file copies.
  - [ ] QA: Play Beat, Moment and Episode scopes; test camera extremes, portrait/landscape, reduced motion and forced CSS fallback. Follow a rejected-layer blocker to regeneration and back to preview with no manual scene authoring.
  - [ ] OWNER: Before: use the deterministic asset fixture, then owner-supplied generated assets when available. During: stop before paid regeneration or weakening camera/coverage validation. After: visually inspect silhouettes, holes, layer order, subtitle legibility, motion comfort and fallback; browser automation cannot certify artistic quality.
- [ ] **P12** — P3–P9 canonical fixture 10/10 through approvals, single+batch visuals, composition and all preview scopes; six uncalled temporary adapters contracted. Gaps: P10 publish/replace + bundle scripts absent; P11 rules absent; active primary flow still requires legacy allJobs/BibleEntry/EpisodePlan/StoryMomentPlan paths, so no claim that published v1 survives regeneration or that every retired path is gone. Patch `.patches/P12-studio.patch` + `.patches/P12-new-files/`.
  - [ ] QA: Produce the full fixture using only approvals and visual generation selections; verify every story paragraph is represented, all three preview scopes work, and published version 1 survives draft regeneration.

## 2. Defects the loop could not clear
- [ ] **P10** (blocked) — Not started. · logs: logs/P10-*
- [ ] **P11** (blocked) — Not started. · logs: logs/P11-*

## 3. Only you can do these
- [ ] **P13** — HUMAN-ONLY: Real paid generation, live publication, deployment, rules deployment and any remote deletion are reserved to the owner. D-1 needs real sample evidence. (state: blocked, deps: P12)
  - [ ] OWNER: Before: choose/configure the existing image provider model, review its spend limit, configure development Firebase and S3/CloudFront, and review QA.md/audit findings. Model/credential setup can be front-loaded; real asset quality cannot be proven with fakes. During: owner alone authorizes paid generation, live publication, deployment and any deletion; no deletion is required by this plan. After: verify model capability, real asset alignment, CDN delivery, rule privacy and episode replacement/rollback. Record D-1's outcome without rewriting plan.md.
  - [ ] QA: Generate an owner-approved real sample, check identity continuity/alpha/depth and subtitles on desktop and mobile, publish Episode 1, regenerate into a draft, verify readers retain version 1, then approve replacement and test rollback.

## 4. Done and gate-verified
- [x] **P0** — gates: lint pass; build pass; smoke:workflow 9/9; smoke:ui 6/6; smoke:operations 13/13
  - [ ] QA: Open the current Studio workflow; verify tabs, image selection and job progress behave as before.
- [x] **P1** — gates: lint pass; build pass (20 routes); smoke:auth 32/32; smoke:workflow 9/9; smoke:ui 6/6
  - [ ] QA: Open a fresh local browser and verify live-data readiness without login; test production mode with the bypass flag set and confirm it still rejects anonymous access.
- [x] **P2** — gates: lint pass; build pass (22 routes); smoke:schemas 14/14; test:preview 23/23; Playwright prior art 8/8 (attempt-1 run, same tree)
  - [ ] QA: Open /studio/preview?fixture=room-entry; play every Beat, switch Moment/Episode scopes, resize portrait/landscape and force CSS fallback. Confirm text remains readable and no manual camera input is required.
- [x] **P3** — gates: lint pass; build pass (24 routes); smoke:schemas 14/14; smoke:canonical 17/17; smoke:pdf 2/2; smoke:uncertainties 5/5; smoke:workflow 10/10
  - [ ] QA: Approve a fixture source containing story and non-story paragraphs; inspect p000000, chunk sizes and immutable source pointer. Approve a correction and confirm old published bundles remain unchanged.
- [x] **P6** — gates: lint pass; build pass (26 routes); smoke:story-planning 31/31; smoke:episodes 18/18; smoke:moments 21/21
  - [ ] QA: Inspect an AI map and moment timeline, inject a coverage gap and overlap, verify repair/blocking, and approve the valid proposal without changing boundaries manually.
- [x] **P7** — gates: lint pass; build pass (26 routes); smoke:beats 42/42; smoke:text 10/10; smoke:posting pass; test:preview 23/23
  - [ ] QA: Inspect a long passage and an internal thought: confirm all meaning survives across subtitles/visuals, quotes match source offsets, future identities stay hidden, and malformed coverage blocks approval.
- [x] **P8** — gates: lint pass; build pass (27 routes); smoke:visual-generation 50/50; smoke:images 6/6; smoke:batch 4/4; smoke:visual 10/10
  - [ ] QA: Select one target and a batch, inspect their reference provenance, reject a foreground/depth asset and regenerate only the affected target. Verify reference approval blocks premature scene generation.
