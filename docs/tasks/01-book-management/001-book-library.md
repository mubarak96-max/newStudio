# Task 001 — Book Library

Status: Completed

## Outcome

The home page reads the compact `AllBooks/books` index and shows the persisted Book Library or an empty state.

## Scope

- Configure the application to read the `books` map from the Firestore document `AllBooks/books`.
- Replace the default Next.js page with the Book Library.
- Treat each map key as a Book ID and validate it against the entry's `bookId`.
- Show title, author, genres, and cover photo or placeholder.
- Add a visible `Add book` button that opens the create-book modal.
- Add loading, empty, and failed-to-load states.
- Keep the initial interface usable on desktop and mobile.

## Acceptance criteria

- [x] Every valid entry in `AllBooks/books.books` appears without hard-coded fixtures.
- [x] Each library entry contains only `bookId`, `title`, `author`, `genres`, and optional `coverPhotoUrl`.
- [x] Selecting a book navigates to `/books/{bookId}` using the Book ID from the index.
- [x] Selecting `Add book` opens the create-book modal without navigating away from the library.
- [x] An empty database produces a useful empty state.
- [x] Loading and Firestore errors are visible and recoverable.
- [x] The page is keyboard accessible and responsive.
- [x] The implementation reports the encoded catalog size so migration can occur before Firestore's document limit.
- [x] Lint and relevant tests pass.

## Not included

- File upload
- Book processing
- Authentication and multi-user permissions
