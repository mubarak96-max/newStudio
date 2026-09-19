# STU-08 — Produce and verify Story Moment text

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-07 (approved Story Moment plan for the active episode)
- **Blocks:** STU-12
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

Each approved Story Moment can receive exact dialogue, an exact excerpt, or paraphrased commentary with appropriate validation.

## Scope

### In scope

- Source-range selector over the approved source revision.
- Character-for-character exact-text validator.
- Separate entries for non-contiguous dialogue.
- Commentary generation and editing.
- Evidence display for both exact text and commentary.

### Out of scope

- Image work (STU-09 to STU-11).
- Posting and the composed reader preview (STU-12).

## Spec context

Text rules:

- Dialogue and exact excerpts are selected from contiguous source spans.
- A validator compares exact text character-for-character with the approved source revision.
- The editor changes exact text by selecting a different source span, not by silently rewriting it.
- Non-contiguous dialogue remains separate entries.
- Commentary is AI-proposed, paraphrased, source-linked, and freely editable.
- Commentary length follows what the Story Moment needs; it is normally concise.
- Every Story Moment has one primary text type.

The related objective blockers this ticket must make impossible to reach at posting time are: exact dialogue or excerpt mismatch, and missing required primary text.

## Domain objects touched

| Object          | Role in this ticket                                     |
| --------------- | ------------------------------------------------------- |
| SourceRevision  | The authority the exact-text validator compares against |
| Paragraph       | Source spans are selected within and across paragraphs  |
| StoryMomentPlan | Holds the primary text type and the produced text       |
| Job             | Commentary generation jobs                              |

## Acceptance

- [x] Exact text is selected from an approved source revision.
- [x] A character mismatch blocks exact text from being approved.
- [x] Changing an exact excerpt requires selecting a new source range.
- [x] Commentary is editable and retains its evidence links.
- [x] A Story Moment cannot have multiple competing primary text types.

## Verification notes

- The validator must be exact, including whitespace and punctuation. Decide up front whether any normalisation is applied and record it, because a silent normalisation defeats the guarantee.
- A stored exact-text entry should keep its source span, not just the copied string, so revalidation after a new source revision is possible.
- The mismatch case is worth a regression test: it is the check that keeps quoted text trustworthy.

## Implementation

- Exact text stores source paragraph IDs and character offsets; end offsets are exclusive. No whitespace or punctuation inside a paragraph is normalised. A cross-paragraph selection uses the canonical `\n\n` separator used by the platform's flat-text representation.
- The server derives exact text from the approved source and derives it again at approval. The client never supplies the quoted text, so changing an excerpt means changing its stored source span.
- Dialogue may contain several separate exact entries. Excerpts are limited to exactly one contiguous entry.
- Commentary generation stores evidence paragraph IDs, and editor revisions retain and validate those links against the Story Moment's source mapping.
- `npm run smoke:text` covers punctuation, one-character mismatch, cross-paragraph joining, evidence, and competing primary types.
