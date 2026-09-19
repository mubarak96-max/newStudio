# STU-02 — Upload and approve an EPUB extraction

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-01 (auth, book records, job queue, worker)
- **Blocks:** STU-03, STU-04, STU-05
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

The editor can begin by uploading an EPUB, then review reconstructed chapters and paragraphs, correct them, and approve permanent paragraph IDs.

## Scope

### In scope

- Firebase Storage upload.
- Initial book creation from the selected source file.
- EPUB spine and table-of-contents parsing.
- Temporary paragraph identifiers.
- The shared extraction editor, including chapter and paragraph operations.
- Source revision approval that freezes permanent paragraph IDs.

### Out of scope

- PDF and OCR ingestion (STU-03, STU-04).
- AI-assisted correction of uncertain text (STU-04 introduces it).
- Any analysis, planning, text, or image work downstream of approval.

## Spec context

EPUB extraction rules:

- Walk the EPUB table of contents and document spine.
- Extract readable text and structural chapter information.
- Remove markup without using AI as the default extraction mechanism.

Review and approval rules, which the shared extraction editor built here must satisfy for all three source formats:

- Extraction begins with temporary paragraph identifiers.
- The editor may correct text, reorder content, split or merge paragraphs, and correct chapter boundaries.
- Approval freezes permanent paragraph IDs and creates an immutable source revision.
- A later source correction creates a new revision, preserves unaffected IDs, and marks dependent work outdated.

Permanent paragraph IDs are the traceability backbone for every later ticket: Book Bible facts, episode ranges, Story Moment mappings, and exact-text validation all reference them. Stability after approval is the point of the approval gate.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| Book | Owns the uploaded source |
| SourceRevision | Original file, extracted text, structure, and approval state |
| Paragraph | Permanently identified source unit after approval |
| Job | The ingest job that parses the uploaded EPUB |

## Acceptance

- [ ] The initial dashboard action requires an EPUB or PDF instead of creating an empty placeholder book.
- [ ] Uploading an EPUB creates the book, durable source, and per-book ingest job together.
- [ ] Chapters and readable paragraphs appear in source order.
- [ ] The editor can edit, reorder, split, merge, and change chapter boundaries.
- [ ] Approval freezes permanent paragraph IDs.
- [ ] Reopening the book preserves the approved extraction and IDs.

## Verification notes

- Use a real multi-chapter fiction EPUB, not a single-document sample, so spine and TOC traversal are both exercised.
- Confirm ID stability by recording a paragraph ID before approval, then reloading the book after approval and checking the same paragraph.
- The extraction editor is shared infrastructure. Build it against the source revision model rather than against EPUB-specific structures, because STU-03 and STU-04 reuse it unchanged.
