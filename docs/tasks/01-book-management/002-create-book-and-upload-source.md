# Task 002 — Create a Book and Upload Its Source

Status: Completed

Depends on: Task 001

## Outcome

A user can create a Book from a PDF or EPUB and arrive at its dedicated workspace.

## Scope

- Open the create-book form in a modal from the Book Library's `Add book` button.
- Accept `.pdf` and `.epub` only.
- Validate file type and required metadata before upload.
- Collect title, author, genres as an array, the source file, and an optional cover photo.
- Store the source PDF or EPUB in Firebase Storage and retain its storage path and download reference.
- Create the authoritative Firestore record at `books/{bookId}` with catalog metadata, source reference, format, and initial status.
- Add the compact `bookId`, `title`, `author`, `genres`, and optional `coverPhotoUrl` entry to the `books` map in `AllBooks/books`.
- Write the authoritative Book record and library-index entry atomically.
- Navigate to `/books/{bookId}` after successful creation.
- Show upload progress and actionable failure states.
- Keep the modal open with the entered metadata when an upload or write fails so the user can retry.

## Acceptance criteria

- [x] A valid PDF creates one persistent Book and source-file record.
- [x] A valid EPUB creates one persistent Book and source-file record.
- [x] Creating a Book produces matching `books/{bookId}` and `AllBooks/books.books.{bookId}` records.
- [x] A failed atomic write leaves neither a partial Book nor a stale library-index entry.
- [x] Unsupported files are rejected before upload.
- [x] Title, author, at least one genre, and a source file are required.
- [x] The Book record references the successfully uploaded Firebase Storage object.
- [x] Retrying a failed upload does not create duplicate Books.
- [x] Refreshing the Book Workspace retains the uploaded Book state.
- [x] Lint and relevant tests pass.

## Not included

- Text extraction
- Cover generation
- AI processing
