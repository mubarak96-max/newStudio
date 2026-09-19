# STU-05 — Generate and approve a source-linked Book Bible

- **Status:** tracked in [FEATURE_TRACKER.md](../FEATURE_TRACKER.md)
- **Depends on:** STU-02 (an approved source revision with permanent paragraph IDs)
- **Blocks:** STU-06, STU-09
- **Spec of record:** [EDITORIAL_DASHBOARD.md](../EDITORIAL_DASHBOARD.md)

## Outcome

AI analyses an approved source hierarchically and produces an editable Book Bible whose facts are traceable and whose editor corrections survive regeneration.

## Scope

### In scope

- Chunk or chapter-level analysis followed by whole-book synthesis.
- Fact evidence links to permanent paragraph IDs.
- Book Bible sections.
- Field locks on editor-modified fields.
- Selective regeneration.
- The approval gate before episode-map generation.

### Out of scope

- Episode boundaries and planning (STU-06).
- Visual references derived from Book Bible facts (STU-09).
- Non-fiction editorial workflows.

## Spec context

Analysis processes chapters or safe-sized source sections before synthesizing whole-book knowledge. The resulting Book Bible includes:

- Characters, aliases, relationships, appearance states, goals, and changes.
- Locations and their visual or narrative properties.
- Recurring objects, creatures, symbols, costumes, and terminology.
- Chronology, major events, reveals, and causality.
- Chapter summaries and whole-book narrative structure.
- Facts that become visible only at their exact revealing point.

Every factual entry must reference the permanent paragraph IDs that support it. Entries are editable. An editor-modified field becomes a locked override; regeneration updates only unlocked AI fields.

Book Bible approval is required before episode-map generation.

Two core principles are enforced here for the first time: locking editor corrections so regeneration cannot silently overwrite them, and preserving a traceable relationship between the source and every generated fact.

## Domain objects touched

| Object | Role in this ticket |
| --- | --- |
| SourceRevision | Input; analysis cannot start before its approval |
| Paragraph | Supplies the evidence IDs every fact must cite |
| BookBibleEntry | Source-supported narrative fact with locked-field metadata |
| Job | Chunk analysis jobs and the synthesis job |
| CostRecord | Analysis is the first expensive multi-call operation |

## Acceptance

- [x] Analysis cannot start before extraction approval.
- [x] Every factual entry links to at least one supporting paragraph ID.
- [ ] Clicking evidence opens the relevant source paragraph.
- [x] Editing a field locks it against regeneration.
- [ ] The editor can unlock a field intentionally.
- [ ] Episode planning remains unavailable until Book Bible approval.

The three unticked checks are implemented but unverified: they need one live analysis
run and a browser pass. `npm run smoke:bible` covers the ticked ones.

## Verification notes

- Test the lock by editing a field, regenerating, and confirming the edited value survives while a neighbouring unlocked field changes.
- The "at least one supporting paragraph ID" rule should be validated on write, not only displayed, so an unsupported fact cannot be stored.
- Facts that become visible only at their exact revealing point need a recorded reveal position, because STU-07 and STU-12 check reveal timing against it.
