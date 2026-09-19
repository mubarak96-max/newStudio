# STU-04 — Upload and approve a scanned-PDF extraction with AI uncertainty help

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-02 (shared extraction editor), STU-03 (page references and ambiguity flags)
- **Blocks:** nothing directly; completes source-format coverage
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

A scanned PDF is OCRed, uncertain content receives AI proposals, and the editor approves the corrected extraction.

## Scope

### In scope

- Page rendering.
- OCR text with confidence information.
- An uncertainty queue.
- Selective OpenRouter assistance for flagged uncertainty only.
- Accept, reject, and manual-replace controls for each proposal.

### Out of scope

- Using AI as the default extraction mechanism for any format.
- Whole-book AI reprocessing by default.
- The per-task model settings UI and cost ledger (STU-14); this ticket may hardcode or minimally configure the OCR-assist model.

## Spec context

Scanned-PDF extraction rules:

- Render and OCR pages locally or through the selected OCR provider.
- Preserve page references and confidence information.
- Send only uncertain regions or structural ambiguities to AI.

Review and approval rules:

- AI may propose corrections to flagged uncertainty; the editor accepts or rejects them.
- Approval freezes permanent paragraph IDs and creates an immutable source revision.

This is the first ticket that calls an OpenRouter task model, so it establishes the request path the worker reuses for all later AI work. The principle that AI proposes and the editor approves starts being enforced in the UI here.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| SourceRevision | Gains OCR confidence data and an uncertainty queue |
| Paragraph | Ordered OCR output with page references |
| Job | OCR job, plus selective AI-assist jobs |

## Acceptance

- [ ] Scanned pages produce ordered OCR paragraphs with page references.
- [ ] Low-confidence words and structural ambiguities are highlighted.
- [ ] AI can propose corrections for selected uncertainties without processing the entire book by default.
- [ ] The editor can accept, reject, or manually replace each proposal.
- [ ] Serious unresolved uncertainties block extraction approval.

## Verification notes

- Confirm the "without processing the entire book by default" criterion by counting model calls for a selective assist run, not by inspecting the UI alone.
- The blocking criterion needs a definition of "serious" that is objective and checkable, in keeping with the rule that only objective failures block.
