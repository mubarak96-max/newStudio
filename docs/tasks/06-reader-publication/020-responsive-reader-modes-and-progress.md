# Task 020 — Complete Reader Modes, Responsiveness, and Progress

Status: Pending

Depends on: Task 019

## Outcome

The Episode reader supports long sessions on desktop and mobile with inspection, text focus, accessibility, and resumable progress.

## Scope

- Implement Read, Inspect, and Text Focus modes.
- Make Inspect spoiler-aware and non-branching.
- Add desktop, tablet, mobile portrait, and mobile landscape layouts using the same layer assets.
- Persist and restore reading progress.
- Add keyboard, touch, reduced-motion, contrast, text-scaling, and semantic HTML support.
- Handle rapid navigation, refresh, rotation, and tab backgrounding.
- Keep production preview controls inside the Whole book preview tab.

## Acceptance criteria

- [ ] Inspection never reveals information beyond the current reveal boundary.
- [ ] Text Focus works without loading 2.5D assets.
- [ ] Rotation and resize preserve the current Beat.
- [ ] Refresh resumes at the saved Beat.
- [ ] Reduced motion removes non-essential transitions.
- [ ] Lint, build, accessibility, responsive, and progress tests pass.

## Not included

- Episode completion
- Book publication
