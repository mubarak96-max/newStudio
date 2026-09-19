# Task 015 — Plan Visuals, Composition Reuse, and Budget

Status: Pending

Depends on: Task 014

## Outcome

Every Story Moment receives a visual plan while the system minimizes new composition generation and forecasts cost.

## Scope

- Generate visual direction from Story Moments and the Visual Continuity Bible.
- Run visual planning as a background parent job fanned out by Episode or bounded Story Moment group, followed by reuse and budget aggregation.
- Use the configured fixed OpenRouter text model for visual and composition planning; expose no model settings.
- Decide which Beats share a composition.
- Reuse, reframe, or reposition existing compositions before proposing a new one.
- Record subjects, setting, state, reveal purpose, layer intent, and responsive framing constraints.
- Forecast new compositions, reuse rate, generation attempts, repairs, and estimated cost.
- Block generation when the configured budget is exceeded.
- Write planned image and 2.5D references into the owning Episode and Reading Beat visual maps.
- Present plans, reuse decisions, and the budget forecast inside the Visual Composition section of the Visuals planning tab.

## Acceptance criteria

- [ ] Every visual plan references its Story Moment and canonical visual entities.
- [ ] New-composition decisions include a reason reuse is insufficient.
- [ ] A composition may support multiple Moments or Beats.
- [ ] Desktop and mobile use one layer set by default.
- [ ] The workspace shows reuse rate and forecast cost before generation.
- [ ] Retrying one failed planning child preserves completed plans outside its scope.
- [ ] Generation remains blocked until reuse and budget aggregation completes.
- [ ] Lint, schema, reuse, and budget tests pass.

## Not included

- Image generation
- Segmentation or depth
