# Task 003 — Book Workspace and Stage State

Status: Completed

Depends on: Task 002

## Outcome

Each Book has one workspace page with a summary header and seven component-based processing tabs.

## Scope

- Build one Book Workspace route.
- Display a persistent Book summary with title, author, genres, source format, source reference, and current status above the tabs.
- Add exactly these top-level tabs: Extraction, Text correction, Book modeling, Episodes planning, Visuals planning, Visuals generation, and Whole book preview.
- Keep tabs as components on `/books/{bookId}` rather than separate process pages.
- Group PDF/EPUB extraction, background-job progress, raw results, and extraction preview inside Extraction.
- Group AI verification, correction progress, `verifiedParagraphs`, and source-integrity results inside Text correction.
- Group the Book Model, Book World, chronology, timelines, Story Map, and storylines inside Book modeling.
- Group Episodes, Story Moments, Reading Beats generation, coverage, and text review inside Episodes planning.
- Group Visual Continuity and Visual Composition planning inside Visuals planning.
- Group canonical reference generation, image generation, manual visual checks, regeneration, and 2.5D composition inside Visuals generation.
- Group reader-accurate Episode and whole-Book preview, completion status, publishing, version history, and rollback inside Whole book preview.
- Do not expose AI model settings; text and image model identifiers are fixed in server configuration and called through one server-side OpenRouter API key.
- Represent pipeline stages and their `pending`, `running`, `complete`, `failed`, and `blocked` states.
- Add the shared background-job contract at `books/{bookId}/jobs/{jobId}` for every long-running process.
- Persist job type, scope, parent/dependency IDs, input version, idempotency key, status, progress, attempts, heartbeat, timestamps, current step, actual error, provider request ID, and output references.
- Make process actions enqueue work and return a job ID instead of executing processors in the page request.
- Enforce upstream stage dependencies in the UI and server boundary.
- Show each grouped process's status, outputs, actions, and errors inside the selected tab.
- Persist stage attempts and timestamps in Firestore.

## Acceptance criteria

- [x] Refreshing the page restores every persisted stage state.
- [x] Refreshing or closing the workspace does not interrupt background work or lose its progress.
- [x] The workspace derives running, failed, retry, and completed UI states from persisted job records.
- [x] Selecting a process changes the active tab without navigating to a separate process page.
- [x] Refreshing or sharing the workspace can restore the selected tab without creating a separate process route.
- [x] All workspace tabs remain visible, including locked and completed tabs.
- [x] Processes inside a shared tab retain independent statuses and actions.
- [x] A locked tab or process section explains which upstream output is required.
- [x] Story Moments and Reading Beats do not appear as separate top-level tabs.
- [x] The Book summary remains visible while moving between tabs.
- [x] Episodes planning keeps each Reading Beat visibly associated with its parent Story Moment and Episode.
- [x] Expanding a Reading Beat does not collapse or navigate away from its parent Story Moment.
- [x] Only the next valid stage can be started.
- [x] Running stages cannot be started twice.
- [x] Repeating a start request with the same idempotency key does not create duplicate jobs.
- [x] Failed stages expose a retry action and the actual error.
- [x] Completed outputs can be opened for inspection.
- [x] Lint and relevant tests pass.

## Not included

- Implementing the individual processors
- Editing generated output
