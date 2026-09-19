# Task 006 — Verify and Correct Extraction with AI

Status: Completed

Depends on: Task 004 or Task 005

## Outcome

AI uses context from the complete Book to correct malformed extraction page by page and produce ordered narrative-only `verifiedParagraphs` documents.

## Scope

- Build book-wide verification context from the complete raw extraction and uploaded source.
- Process the raw extraction in bounded source windows while retrieving relevant context from the rest of the Book.
- Run verification as a resumable background job and persist page/range progress.
- Fan verification into page-range child jobs and run a final whole-book consistency child after all ranges complete.
- Call a fixed text model through OpenRouter using the application's single server-side API key; do not expose model settings in the UI.
- Provide each correction pass with its chapter, neighboring content, document structure, recurring vocabulary, repeated layout patterns, and relevant evidence from elsewhere in the Book.
- Detect reading-order errors, broken paragraphs, repeated headers, duplicates, hyphenation, encoding defects, and misplaced notes.
- Exclude footnotes, headers, footers, page furniture, and other text classified as outside the Book narrative from the verified narrative output.
- Compare proposed corrections with the available uploaded-source evidence.
- Store each correction with before, after, reason, confidence, and source provenance.
- Preserve unresolved or low-confidence findings as blockers.
- Run a whole-book consistency pass after local corrections.
- Write ordered verified paragraph arrays to `books/{bookId}/verifiedParagraphs/{pageRangeId}`, mirroring the raw page-range IDs.
- Preserve excluded content and every correction decision in the immutable raw extraction and audit records.
- Show progress, corrections, exclusions, and unresolved findings in the Text correction tab.

## Acceptance criteria

- [x] The raw extraction remains immutable.
- [x] Verified text is assembled only from accepted, traceable corrections.
- [x] AI cannot paraphrase, summarize, modernize, or silently improve the prose.
- [x] Well-formed paragraphs pass through without textual changes.
- [x] Footnotes and non-narrative content are absent from `verifiedParagraphs` but remain traceable in raw extraction.
- [x] Every correction uses source evidence and relevant Book context rather than model memory.
- [x] Whole-book checks cover chapter order, paragraph continuity, repeated content, recurring names and terms, and missing content.
- [x] Every changed character is attributable to a correction record.
- [x] Interrupted verification resumes without duplicating work.
- [x] Retrying one failed range preserves completed verification ranges and accepted corrections.
- [x] Verification cannot complete until the whole-book consistency child passes.
- [x] The user is not shown a model picker, temperature, or other model settings.
- [x] Lint and relevant tests pass.

## Not included

- Book interpretation
- Manual prose editing
- Visual generation
