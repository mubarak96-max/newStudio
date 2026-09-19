# STU-03 — Upload and approve a text-PDF extraction

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-02 (shared extraction editor and source revision approval)
- **Blocks:** STU-04
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

A text PDF reaches the same extraction-review experience as an EPUB.

## Scope

### In scope

- Positioned-text extraction.
- Reading-order reconstruction.
- Repeated header and footer removal.
- Page references retained on paragraphs.
- Ambiguous-layout flags surfaced in the extraction editor.

### Out of scope

- OCR and scanned pages (STU-04).
- AI resolution of the ambiguities flagged here (STU-04 adds the AI assistance path).
- Any change to downstream behaviour: an approved PDF source revision must be indistinguishable from an approved EPUB one.

## Spec context

Text-PDF extraction rules:

- Extract positioned text.
- Reconstruct reading order, paragraphs, repeated headers, footers, and page numbers using deterministic rules.
- Flag ambiguous layouts for AI assistance.

The shared review and approval rules from STU-02 apply unchanged: temporary IDs first, editor corrections, then approval freezing permanent paragraph IDs into an immutable source revision.

Deterministic rules come first. AI is not the default extraction mechanism for any format; it only resolves flagged uncertainty.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| SourceRevision | Gains page-reference and ambiguity-flag information |
| Paragraph | Retains source page references |
| Job | The ingest job that extracts positioned text |

## Acceptance

- [ ] Repeated headers, footers, and page numbers are excluded from narrative text.
- [ ] Paragraphs retain source page references.
- [ ] Ambiguous reading order is visibly flagged.
- [ ] The common extraction editor and approval flow work without PDF-specific downstream behavior.

## Verification notes

- Test with a PDF that has running headers, page numbers, and at least one multi-column or footnote-bearing page, so both the removal rules and the ambiguity flags fire.
- The last acceptance item is the important one: after approval, no downstream code should be able to tell the source was a PDF.
