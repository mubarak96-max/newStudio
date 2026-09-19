# Editorial Studio tickets

One file per ticket. Each file is self-contained: outcome, scope, the spec rules it must satisfy, the domain objects it touches, and its acceptance criteria. You should not need to open another document to implement a ticket.

Related documents:

- [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md) — the product and technical specification of record.
- [VERTICAL_TICKETS.md](../VERTICAL_TICKETS.md) — the original condensed ticket list.
- [FEATURE_TRACKER.md](../FEATURE_TRACKER.md) — status, owner, notes, and the decision and blocker log.

Ticket files carry no status. Status lives in the tracker so there is one place to update it.

## Tickets

| Ticket | Title | Depends on |
| --- | --- | --- |
| [STU-01](./STU-01-editor-shell-job-roundtrip.md) | Secure editor shell and durable job round trip | — |
| [STU-02](./STU-02-epub-extraction.md) | Upload and approve an EPUB extraction | STU-01 |
| [STU-03](./STU-03-text-pdf-extraction.md) | Upload and approve a text-PDF extraction | STU-02 |
| [STU-04](./STU-04-scanned-pdf-extraction.md) | Upload and approve a scanned-PDF extraction with AI uncertainty help | STU-02, STU-03 |
| [STU-05](./STU-05-book-bible.md) | Generate and approve a source-linked Book Bible | STU-02 |
| [STU-06](./STU-06-episode-map.md) | Plan and approve the complete episode map | STU-05 |
| [STU-07](./STU-07-story-moment-planning.md) | Plan and approve one complete episode's Story Moments | STU-06 |
| [STU-08](./STU-08-story-moment-text.md) | Produce and verify Story Moment text | STU-07 |
| [STU-09](./STU-09-style-canon-references.md) | Approve the style canon and reusable visual references | STU-05 |
| [STU-10](./STU-10-single-image-generation.md) | Generate, regenerate, and select one image | STU-07, STU-09 |
| [STU-11](./STU-11-batch-image-generation.md) | Generate a selected batch of Story Moment images | STU-10 |
| [STU-12](./STU-12-story-moment-review-posting.md) | Review and post a complete Story Moment | STU-08, STU-10 |
| [STU-13](./STU-13-episode-completion-republication.md) | Complete an episode and republish a Story Moment safely | STU-12 |
| [STU-14](./STU-14-jobs-models-budgets.md) | Operate jobs, models, retries, and budgets | STU-01 |

## Dependency graph

```text
STU-01 ─┬─ STU-02 ─┬─ STU-03 ── STU-04
        │          │
        │          └─ STU-05 ─┬─ STU-06 ── STU-07 ─┬─ STU-08 ─┐
        │                     │                    │          ├─ STU-12 ── STU-13
        │                     └─ STU-09 ───────────┴─ STU-10 ─┘
        │                                             │
        │                                             └─ STU-11
        └─ STU-14
```

STU-03, STU-04, STU-09, STU-11, and STU-14 are the branches that can run alongside the main chain once their own dependency is met.

## Ticket file structure

Each file uses the same sections:

- Header — status pointer, dependencies, what it blocks, link to the spec.
- **Outcome** — the single usable capability the ticket delivers, taken verbatim from the original ticket list.
- **Scope** — in scope and out of scope, so the boundary with neighbouring tickets is explicit.
- **Spec context** — the rules from the specification that this ticket must satisfy, inlined.
- **Domain objects touched** — which of the primary domain objects the ticket creates or changes.
- **Acceptance** — the acceptance checkboxes, verbatim from the original ticket list. These are the contract; a ticket is `Done` only when all of them are verified.
- **Verification notes** — how to actually check the criteria, including the cases that fail silently if only the happy path is tested.

Acceptance criteria are copied verbatim and should stay that way. If a criterion needs to change, change it in [VERTICAL_TICKETS.md](../VERTICAL_TICKETS.md) and here together, and record the decision in the tracker.
