# Task 004 — Extract a PDF into Ordered Source Blocks

Status: Completed

Depends on: Task 003

## Outcome

A PDF Book can be extracted in a resumable background job, inspected, and stored as ordered page-range paragraph documents.

## Scope

- Start PDF extraction from the Book Workspace.
- Run extraction as an idempotent background job and persist queued, running, completed, failed, and retry state.
- Fan the extraction parent job into bounded page-range child jobs followed by one final ordering and completeness job.
- Use `pdfjs-dist` for native PDF text and structure extraction.
- Use `sharp` to prepare page images and `tesseract.js` when a page requires OCR.
- Use `fuse.js` for fuzzy reconciliation where native text, OCR text, or repeated page artifacts need comparison.
- Extract every recoverable element, including pages, headings, paragraphs, quotations, captions, footnotes, tables, illustrations, page references, headers, footers, and uncertain blocks.
- Preserve raw extracted text and reading order.
- Preserve layout, page location, extraction confidence, and source evidence needed for later verification.
- Keep suspected artifacts and flawed text in the immutable raw extraction for AI review instead of silently deleting them.
- Assign stable IDs to source blocks.
- Save ordered paragraph-shaped blocks in documents at `books/{bookId}/paragraphs/{pageRangeId}`.
- Put at most 50 source pages in one range document and use an explicit range ID such as `1-50`, `51-100`, or the final partial range.
- Split a range earlier when necessary to stay within Firestore's document-size limit.
- Save extraction results, page indexes, stable block IDs, confidence, extraction method, and provenance.
- Show processed pages, total pages, current range, percent complete, failures, and retry state in the Extraction tab.
- Show an extraction summary and paginated raw-source preview in the Extraction tab.

## Acceptance criteria

- [x] Every extracted block has a stable ID and deterministic order.
- [x] Every saved range covers no more than 50 source pages and range IDs resolve in deterministic order.
- [x] The raw extraction is never overwritten by later corrections.
- [x] Every recoverable source element is stored or represented by an explicit extraction failure.
- [x] Suspected headers, duplicates, malformed text, and uncertain blocks remain traceable in the raw extraction.
- [x] Page-level failures are recorded instead of silently skipped.
- [x] Restarting extraction is idempotent for the same source version.
- [x] Job progress survives refresh and cannot start the same extraction twice.
- [x] Retrying one failed page range preserves successful range outputs.
- [x] The extraction parent completes only after every required range and the final completeness check pass.
- [x] The preview can trace a block back to its source page.
- [x] Lint and extraction tests pass against representative PDFs.

## Not included

- OCR correction by AI
- Verified Source Model
- EPUB extraction
