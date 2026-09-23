import { FieldValue, type WriteBatch } from "firebase-admin/firestore";
import { ruleVersions } from "../../lib/rules.ts";
import type { EntityVisualPlan, VisualPlanSummary, VisualProfile } from "../../lib/story-types.ts";
import { db, imageCostUsd, storyConcurrency } from "../config.mts";
import { pool, type JobDefinition } from "../job-runner.mts";
import { loadStoryInputs } from "../story/inputs.mts";
import { loadEpisodes, loadMoments } from "../story/persist.mts";
import type { Entity } from "../types.mts";
import { authorCompositionPrompts, promptAuthoringVersion } from "./authoring.mts";
import { planEntityVisuals, planVisualProfile } from "./bible.mts";
import { buildCompositionPlans, forecastOf, type PlannedMoment } from "./compositions.mts";

type VisualsState = {
  phase: "profile" | "entities" | "compositions" | "done";
  profile: VisualProfile | null;
  plans: Record<string, EntityVisualPlan>;
  summary: string;
};

const entityBatchSize = 6;
const importanceRank = { major: 0, supporting: 1, minor: 2 } as const;

async function writeInBatches(writes: ((batch: WriteBatch) => void)[]): Promise<void> {
  for (let offset = 0; offset < writes.length; offset += 300) {
    const batch = db.batch();
    for (const write of writes.slice(offset, offset + 300)) write(batch);
    await batch.commit();
  }
}

export const visualsJob: JobDefinition<VisualsState> = {
  type: "visuals",
  version: "visuals-v1",
  initialState: () => ({ phase: "profile", profile: null, plans: {}, summary: "" }),
  run: async (context, state, checkpoint) => {
    const { bookId } = context;
    const inputs = await loadStoryInputs(bookId, context.sourceId, context.canonicalHash);
    const lineage = { sourceId: inputs.sourceId, canonicalHash: inputs.canonicalHash };
    const episodes = await loadEpisodes(bookId, lineage);
    const planned: PlannedMoment[] = [];
    for (const episode of episodes) {
      for (const moment of await loadMoments(bookId, episode.episodeId)) planned.push({ episodeId: episode.episodeId, moment });
    }
    if (!planned.some(({ moment }) => moment.readingBeats.length > 0)) {
      throw new Error("No Reading Beats exist for the active source. Run Beat building first.");
    }

    // A compositions-only run rebuilds layer plans from the existing profile
    // and bible, with no model calls, so approved images keep their targets.
    const job = (await db.doc(`books/${bookId}/jobs/${context.jobId}`).get()).data();
    if (job?.onlyCompositions && state.phase === "profile") {
      const book = (await db.doc(`books/${bookId}`).get()).data();
      if (!book?.visualProfile) throw new Error("No visual profile exists yet; run full visual planning first.");
      state.profile = book.visualProfile as VisualProfile;
      for (const entity of inputs.entities) {
        const stored = (await db.doc(`books/${bookId}/entities/${entity.entityId}`).get()).data();
        if (stored?.visual?.spec) state.plans[entity.entityId] = { entityId: entity.entityId, fills: stored.fills ?? [], ...stored.visual };
      }
      state.phase = "compositions";
    }

    if (state.phase === "profile") {
      await context.onActivity({ label: "Defining the book's visual profile", detail: "Style, palette, light and lens", done: 0, total: 1, unit: "steps" });
      const book = (await db.doc(`books/${bookId}`).get()).data();
      const genres = Array.isArray(book?.metaData?.genres) ? (book.metaData.genres as string[]) : [];
      state.profile = await planVisualProfile(context, inputs, genres, Number(book?.visualProfile?.version ?? 0));
      await db.doc(`books/${bookId}`).update({ visualProfile: state.profile, updatedAt: FieldValue.serverTimestamp() });
      state.phase = "entities";
      await checkpoint("profile");
    }
    const profile = state.profile!;

    if (state.phase === "entities") {
      // Only entities that actually appear on screen need a visual bible entry.
      const shown = new Set<string>();
      for (const { moment } of planned) {
        if (moment.locationId) shown.add(moment.locationId);
        for (const character of moment.characters) shown.add(character.entityId);
        for (const shot of moment.visualPlan.shots) for (const entityState of shot.entityStates) shown.add(entityState.entityId);
      }
      const pending = Array.from(shown)
        .map((id) => inputs.entityById.get(id))
        .filter((entity): entity is Entity => Boolean(entity) && entity!.type !== "concept" && !state.plans[entity!.entityId])
        .sort((left, right) => importanceRank[left.importance] - importanceRank[right.importance] || right.mentionCount - left.mentionCount);
      const batches: Entity[][] = [];
      for (let offset = 0; offset < pending.length; offset += entityBatchSize) batches.push(pending.slice(offset, offset + entityBatchSize));
      const total = Object.keys(state.plans).length + pending.length;
      for (let offset = 0; offset < batches.length; offset += storyConcurrency) {
        if (await context.cancelled()) return null;
        const results = await pool(batches.slice(offset, offset + storyConcurrency), storyConcurrency, (batch, index) =>
          planEntityVisuals(context, batch, profile, `entity visuals ${offset + index + 1}`),
        );
        for (const plan of results.flat()) state.plans[plan.entityId] = plan;
        await context.onActivity({
          label: "Writing the visual continuity bible",
          detail: `${Object.keys(state.plans).length} of ${total} entities`,
          done: Object.keys(state.plans).length,
          total,
          unit: "entities",
        });
        await checkpoint(`entities-${offset}`);
      }
      await writeInBatches(
        Object.values(state.plans).map((plan) => (batch) => {
          const { entityId, fills, ...visual } = plan;
          batch.update(db.doc(`books/${bookId}/entities/${entityId}`), { visual, fills });
        }),
      );
      state.phase = "compositions";
      await checkpoint("entities");
    }

    if (state.phase === "compositions") {
      await context.onActivity({ label: "Planning compositions and reuse", detail: `${planned.length} moments`, done: 0, total: 1, unit: "steps" });
      const plans = new Map(Object.entries(state.plans));
      const entityOf = (id: string) => {
        const entity = inputs.entityById.get(id);
        return entity ? { name: entity.canonicalName, type: entity.type } : undefined;
      };
      const compositions = buildCompositionPlans(planned, plans, entityOf, profile, lineage);

      // Every layer prompt is rewritten as art direction and checked before it
      // is used; a refused rewrite leaves the mechanical prompt in place.
      const authoring = { authored: 0, refused: 0 };
      for (let offset = 0; offset < compositions.length; offset += storyConcurrency) {
        if (await context.cancelled()) return null;
        const batch = compositions.slice(offset, offset + storyConcurrency);
        const results = await pool(batch, storyConcurrency, (composition) =>
          authorCompositionPrompts(context, composition, profile, (id) => inputs.entityById.get(id)?.canonicalName),
        );
        for (const result of results) {
          authoring.authored += result.authored;
          authoring.refused += result.refused;
          for (const reason of result.reasons.slice(0, 2)) context.log(`prompt refused — ${reason}`);
        }
        await context.onActivity({
          label: "Writing image prompts",
          detail: `${authoring.authored} written, ${authoring.refused} kept mechanical`,
          done: Math.min(offset + storyConcurrency, compositions.length),
          total: compositions.length,
          unit: "compositions",
        });
      }

      const forecast = forecastOf(compositions, Object.values(state.plans), imageCostUsd);
      const keep = new Set(compositions.map((composition) => composition.compositionId));
      const existing = await db.collection(`books/${bookId}/compositions`).get();
      const stale = existing.docs.filter(
        (doc) => !keep.has(doc.id) && doc.data().sourceId === lineage.sourceId && doc.data().canonicalHash === lineage.canonicalHash,
      );
      await writeInBatches([
        ...compositions.map((composition) => (batch: WriteBatch) =>
          batch.set(db.doc(`books/${bookId}/compositions/${composition.compositionId}`), {
            ...composition,
            updatedAt: FieldValue.serverTimestamp(),
          }),
        ),
        ...stale.map((doc) => (batch: WriteBatch) => batch.delete(doc.ref)),
      ]);
      const summary: VisualPlanSummary = {
        schemaVersion: 1,
        ...lineage,
        jobId: context.jobId,
        visualProfile: profile,
        forecast,
        notes: [
          `${forecast.compositions} compositions cover ${forecast.shotsPlanned} Beats (${Math.round(forecast.reuseRate * 100)}% reuse).`,
          `${forecast.referenceSheets} reference sheets and ${forecast.stateVariants} state variants precede scene generation.`,
          `${authoring.authored} layer prompts written as art direction (${promptAuthoringVersion}); ${authoring.refused} kept their mechanical prompt.`,
        ],
      };
      await db.doc(`books/${bookId}/derived/visualPlan`).set({ ...summary, updatedAt: FieldValue.serverTimestamp() });
      state.summary = `${forecast.referenceSheets} entity references, ${forecast.compositions} compositions for ${forecast.shotsPlanned} beats, ${forecast.imagesToGenerate} images forecast at ~$${forecast.estimatedCostUsd}`;
      state.phase = "done";
      await checkpoint("done");
    }
    await db.doc(`books/${bookId}`).update({ "ruleVersions.prompts": ruleVersions.prompts });
    return state.summary;
  },
};
