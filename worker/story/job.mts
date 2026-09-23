import type { Episode, Moment, StoryMap } from "../../lib/story-types.ts";
import { ruleVersions } from "../../lib/rules.ts";
import { db, storyConcurrency } from "../config.mts";
import { pool, type JobDefinition } from "../job-runner.mts";
import { storyWorkerVersion, type StoryContext } from "./context.mts";
import { planEpisode } from "./episodes.mts";
import { loadStoryInputs } from "./inputs.mts";
import { planStoryMap, type PlannedEpisodeSpan } from "./map.mts";
import { buildMoment } from "./moments.mts";
import { pruneEpisodes, writeEpisode, writeMoments, writeStoryMap } from "./persist.mts";
import { validateTiling } from "./ranges.mts";

type StoryState = {
  phase: "map" | "episodes" | "moments" | "done";
  storyMap: StoryMap | null;
  spans: PlannedEpisodeSpan[];
  episodes: Episode[];
  momentsDoneFor: string[];
};

export const storyJob: JobDefinition<StoryState> = {
  type: "story",
  version: storyWorkerVersion,
  next: "beats",
  initialState: () => ({ phase: "map", storyMap: null, spans: [], episodes: [], momentsDoneFor: [] }),
  run: async (jobContext, state, checkpoint) => {
    const { bookId } = jobContext;
    const inputs = await loadStoryInputs(bookId, jobContext.sourceId, jobContext.canonicalHash);
    const context: StoryContext = { ...jobContext, inputs };
    const lastSeq = inputs.paragraphs.length - 1;

    if (state.phase === "map") {
      await context.onActivity({ label: "Building the Story Map", detail: "Acts, arcs and episode boundaries", done: 0, total: 1, unit: "steps" });
      const { storyMap, spans } = await planStoryMap(context);
      const tiling = validateTiling(spans, 0, lastSeq);
      if (!tiling.ok) {
        throw new Error(`Episode ranges do not tile the book: ${tiling.missing.length} missing, ${tiling.duplicated.length} duplicated.`);
      }
      await writeStoryMap(bookId, storyMap);
      state.storyMap = storyMap;
      state.spans = spans;
      state.phase = "episodes";
      await checkpoint("map");
    }

    if (state.phase === "episodes") {
      for (let index = state.episodes.length; index < state.spans.length; index += 1) {
        if (await context.cancelled()) return null;
        const span = state.spans[index]!;
        await context.onActivity({
          label: `Planning episode ${index + 1} of ${state.spans.length}`,
          detail: span.title,
          done: index,
          total: state.spans.length,
          unit: "episodes",
        });
        const previous = state.episodes.at(-1)?.storyPlan?.endingState ?? "";
        const episode = await planEpisode(context, span, index + 1, state.spans.length, previous);
        await writeEpisode(bookId, episode);
        state.episodes.push(episode);
        await checkpoint(`episode-${episode.episodeId}`);
      }
      const pruned = await pruneEpisodes(bookId, new Set(state.episodes.map((episode) => episode.episodeId)), inputs);
      if (pruned > 0) context.log(`removed ${pruned} episode(s) left by an earlier plan.`);
      state.phase = "moments";
      await checkpoint("episodes");
    }

    if (state.phase === "moments") {
      const totalMoments = state.episodes.reduce((sum, episode) => sum + episode.momentCount, 0);
      let doneMoments = state.episodes
        .filter((episode) => state.momentsDoneFor.includes(episode.episodeId))
        .reduce((sum, episode) => sum + episode.momentCount, 0);
      for (const episode of state.episodes) {
        if (state.momentsDoneFor.includes(episode.episodeId)) continue;
        if (await context.cancelled()) return null;
        const outline = episode.storyPlan?.momentOutline ?? [];
        const moments: Moment[] = await pool(outline, storyConcurrency, async (item, index) => {
          const moment = await buildMoment(context, episode, item, index + 1);
          doneMoments += 1;
          await context.onActivity({
            label: `Building moments: ${episode.title}`,
            detail: `Episode ${episode.order} of ${state.episodes.length}`,
            done: doneMoments,
            total: totalMoments,
            unit: "moments",
          });
          return moment;
        });
        await writeMoments(bookId, episode.episodeId, moments);
        outline.forEach((item, index) => {
          item.title = moments[index]!.title;
        });
        episode.stageStatus = { ...episode.stageStatus, moments: "done" };
        episode.warnings = [
          ...episode.warnings,
          ...moments.filter((moment) => moment.status === "fallback").map((moment) => `${moment.momentId} was built without a model answer.`),
        ];
        await writeEpisode(bookId, episode);
        state.momentsDoneFor.push(episode.episodeId);
        await checkpoint(`moments-${episode.episodeId}`);
      }
      state.phase = "done";
      await checkpoint("done");
    }

    const momentCount = state.episodes.reduce((sum, episode) => sum + episode.momentCount, 0);
    await db.doc(`books/${bookId}`).update({ "ruleVersions.story": ruleVersions.story });
    return `${state.episodes.length} episodes, ${momentCount} moments`;
  },
};
