# Task 005 — Extract an EPUB into Ordered Source Blocks

Status: Completed

Depends on: Task 003

## Outcome

An EPUB Book can be extracted in a resumable background job and stored through the same ordered range-document contract as PDF Books.

## Scope

- Start EPUB extraction from the Book Workspace.
- Run extraction as an idempotent background job and expose the same persisted progress states as PDF extraction.
- Fan the extraction parent job into bounded spine/range child jobs followed by one final ordering and completeness job.
- Use `epub2` to read package metadata, spine order, documents, and content.
- Follow the EPUB spine and preserve document order.
- Extract every recoverable element, including headings, paragraphs, quotations, footnotes, captions, tables, illustrations, metadata, and uncertain blocks.
- Preserve the original document, element location, markup evidence, and extraction confidence needed for later verification.
- Keep suspected package artifacts, duplicates, and malformed content in the immutable raw extraction for AI review instead of silently deleting them.
- Assign the same source-unit contract used by PDF extraction.
- Normalize EPUB spine sections into ordered logical page indexes for batching.
- Save paragraphs in `books/{bookId}/paragraphs/{pageRangeId}` with at most 50 logical source pages per document.
- Split a range earlier when necessary to stay within Firestore's document-size limit.
- Save raw extraction results and provenance.
- Reuse the Extraction tab, progress display, and raw-source preview built for PDF Books.

## Acceptance criteria

- [x] EPUB spine order determines the canonical raw source order.
- [x] Every recoverable source element is stored or represented by an explicit extraction failure.
- [x] Suspected artifacts, duplicates, and malformed content remain traceable in the raw extraction.
- [x] Every extracted block has a stable ID.
- [x] Range documents use deterministic page-range IDs and never contain more than 50 logical source pages.
- [x] Navigation files and repeated package content do not enter the prose accidentally.
- [x] Restarting extraction is idempotent for the same source version.
- [x] Job progress survives refresh and cannot start the same extraction twice.
- [x] Retrying one failed spine/range child preserves successful outputs.
- [x] The extraction parent completes only after every required child and the final completeness check pass.
- [x] The preview can trace blocks to their EPUB document.
- [x] Lint and extraction tests pass against representative EPUBs.

## Not included

- AI correction
- EPUB fixed-layout rendering
- DRM-protected EPUB support
