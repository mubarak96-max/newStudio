import type { Beat, BeatCoverage, CameraPose, Moment } from "../../lib/story-types.ts";
import { asString, records } from "../coerce.mts";
import { unique } from "../evidence.mts";
import { entitiesInRange, entityAsOf } from "../story/episodes.mts";
import { wordCount } from "../story/inputs.mts";
import type { StoryContext } from "../story/context.mts";
import { durationFor, isCameraMove, posesFor } from "./camera.mts";
import { beatsSystemPrompt } from "./prompts.mts";
import { placeCommentary, segmentParagraphs, shotInOrder } from "./segments.mts";

/** Words on screen at once: about fifteen seconds of reading. */
const maxSegmentWords = 60;
/** One short staging entry per segment; far more than this is a model looping. */
const tokensPerSegment = 80;
/**
 * How many Beats in a row may share one composition before the Moment's other
 * shots are used. Twenty-four Beats once ran on a single Old Major image: two
 * and a half minutes of the same picture.
 */
const maxBeatsPerComposition = 4;
/** Below this share of a Moment's words read verbatim, the Episode is an abridgement. */
const verbatimShareWarning = 0.5;

type Staging = {
  shotId: string | null;
  move: Beat["camera"]["move"];
  focusEntityId: string | null;
  rationale: string;
};

export function compositionIdFor(reuseKey: string): string {
  return `comp_${reuseKey}`;
}

export type MomentBeats = { beats: Beat[]; coverage: BeatCoverage };

export async function buildMomentBeats(
  context: StoryContext,
  moment: Moment,
  previousMoment: Moment | null,
): Promise<MomentBeats> {
  const { inputs } = context;
  const span = { seqStart: moment.seqStart, seqEnd: moment.seqEnd };
  const seqOf = (paragraphId: string) => inputs.paragraphById.get(paragraphId)?.seq ?? moment.seqStart;
  const shots = moment.visualPlan.shots;
  const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
  const warnings: string[] = [];

  const segments = segmentParagraphs(
    moment.sourceParagraphIds.flatMap((paragraphId) => {
      const paragraph = inputs.paragraphById.get(paragraphId);
      return paragraph ? [paragraph] : [];
    }),
    maxSegmentWords,
  );
  const segmentIds = segments.map((_, index) => `t${index + 1}`);
  const speakersIn = (segment: (typeof segments)[number]) =>
    unique(
      moment.dialogue
        .filter((line) => line.paragraphId === segment.paragraphId && line.start < segment.end && line.end > segment.start)
        .flatMap((line) => (line.speakerEntityId ? [line.speakerEntityId] : [])),
    );

  const data =
    segments.length === 0
      ? null
      : await context.callModel(
          `beats ${moment.momentId}`,
          beatsSystemPrompt,
          {
            moment: { momentId: moment.momentId, title: moment.title, summary: moment.summary },
            entities: entitiesInRange(inputs, span, 25).map((entity) => entityAsOf(entity, span.seqStart)),
            shots: shots.map((shot) => ({
              shotId: shot.shotId,
              description: shot.description,
              framing: shot.framing,
              entityIds: shot.entityStates.map((state) => state.entityId),
            })),
            segments: segments.map((segment, index) => ({
              id: segmentIds[index],
              paragraphId: segment.paragraphId,
              text: segment.text,
              speakerIds: speakersIn(segment),
            })),
          },
          { maxTokens: Math.max(2_000, segments.length * tokensPerSegment) },
        );
  if (segments.length > 0 && !data) warnings.push("The Beat call failed; shots follow the text in order.");

  const proposed = new Map(records(data?.beats).map((row) => [asString(row.segmentId), row]));
  const staging: Staging[] = segments.map((_, index) => {
    const row = proposed.get(segmentIds[index]!);
    const camera = row?.camera && typeof row.camera === "object" ? (row.camera as Record<string, unknown>) : {};
    const shotId = asString(row?.shotId);
    const focus = asString(camera.focusEntityId);
    return {
      shotId: shotById.has(shotId) ? shotId : (shotInOrder(index, segments.length, shots)?.shotId ?? null),
      move: isCameraMove(camera.move) ? camera.move : "drift",
      focusEntityId: inputs.entityById.has(focus) ? focus : null,
      rationale: asString(camera.rationale).trim() || (row ? "" : "Slow drift while the passage is read."),
    };
  });
  const unstaged = segmentIds.filter((id) => !proposed.has(id)).length;
  if (data && unstaged > 0) warnings.push(`${unstaged} segment(s) were not staged by the model; their shots follow the text in order.`);

  // Rotate through the Moment's own shots so no picture is held too long.
  if (shots.length > 1) {
    let runShotId: string | null = null;
    let run = 0;
    for (const item of staging) {
      if (item.shotId === runShotId) run += 1;
      else {
        runShotId = item.shotId;
        run = 1;
      }
      if (run <= maxBeatsPerComposition) continue;
      const current = shots.findIndex((shot) => shot.shotId === runShotId);
      const next = shots[(current + 1) % shots.length]!;
      item.shotId = next.shotId;
      runShotId = next.shotId;
      run = 1;
    }
  }

  // Only notes that passed every check reach the reader, beside the words they explain.
  const notes = placeCommentary(
    segments,
    moment.commentary.filter((note) => note.verified),
    seqOf,
  );
  const withheld = moment.commentary.length - notes.flat().length;
  if (withheld > 0) warnings.push(`${withheld} commentary note(s) were withheld from the reader.`);

  let previousPose: { compositionId: string | null; to: CameraPose } | null = null;
  let previousShotPlace: string | null = previousMoment?.locationId ?? null;
  const beats: Beat[] = segments.map((segment, index) => {
    const draft = staging[index]!;
    const commentary = notes[index]!;
    const shot = draft.shotId ? shotById.get(draft.shotId) : undefined;
    const compositionId = shot ? compositionIdFor(shot.reuseKey) : null;
    const sameComposition = previousPose !== null && previousPose.compositionId === compositionId;
    const proposedPose = posesFor(draft.move, sameComposition ? previousPose!.to : undefined);
    // Continuity: on the same picture the camera starts exactly where it
    // stopped. A pan that reset x or y made the frame jump between Beats.
    const poses = sameComposition ? { from: previousPose!.to, to: proposedPose.to } : proposedPose;
    previousPose = { compositionId, to: poses.to };
    const words = [segment.text, ...commentary.map((note) => note.text)].map(wordCount).reduce((sum, value) => sum + value, 0);
    // Transition grammar: nothing at all while the camera keeps moving on one
    // picture, a short dissolve when the place is the same, a cut when it is
    // not, and a fade at the seams of a Moment or an Episode.
    const shotPlace = shot?.locationId ?? moment.locationId;
    const previousPlace = previousShotPlace;
    previousShotPlace = shotPlace;
    const transitionIn: Beat["transitionIn"] =
      index > 0
        ? sameComposition
          ? { type: "cut", durationMs: 0 }
          : shotPlace && shotPlace === previousPlace
            ? { type: "fade", durationMs: 450 }
            : { type: "cut", durationMs: 250 }
        : previousMoment && previousMoment.locationId && previousMoment.locationId === moment.locationId
          ? { type: "fade", durationMs: 600 }
          : { type: "fade", durationMs: previousMoment ? 800 : 1200 };
    return {
      id: `${moment.momentId}_b${String(index + 1).padStart(2, "0")}`,
      order: index + 1,
      seq: seqOf(segment.paragraphId),
      type: commentary.length > 0 ? "mixed" : "quote",
      text: {
        quote: segment,
        ...(commentary.length > 0 ? { commentary } : {}),
      },
      shotId: draft.shotId,
      compositionId,
      camera: {
        move: draft.move,
        ...poses,
        durationMs: durationFor(words),
        easing: "easeInOut",
        focusEntityId: draft.focusEntityId,
        rationale: draft.rationale,
      },
      transitionIn,
      inspectables: [],
      autoAdvanceMs: null,
      representations: [{ paragraphId: segment.paragraphId, modality: "text", description: "Read in the book's own words." }],
      previousBeatId: null,
      nextBeatId: null,
    };
  });

  for (const item of moment.inspectableEntities) {
    const host =
      beats.find((beat) => shotById.get(beat.shotId ?? "")?.entityStates.some((state) => state.entityId === item.entityId)) ??
      beats.find((beat) => beat.camera.focusEntityId === item.entityId) ??
      beats[0];
    host?.inspectables.push({ entityId: item.entityId, hotspot: null });
  }

  const shownWords = segments.map((segment) => wordCount(segment.text)).reduce((sum, value) => sum + value, 0);
  const shownAsText = new Set(segments.map((segment) => segment.paragraphId));
  const visualOnly = moment.sourceParagraphIds.filter((paragraphId) => !shownAsText.has(paragraphId)).length;
  if (visualOnly > 0) {
    warnings.push(`${visualOnly} of ${moment.sourceParagraphIds.length} paragraph(s) are not read to the reader in the book's own words.`);
  }
  if (moment.wordCount > 0 && shownWords / moment.wordCount < verbatimShareWarning) {
    warnings.push(
      `Only ${Math.round((shownWords / moment.wordCount) * 100)}% of this Moment's words are read verbatim; the rest is abridged.`,
    );
  }
  return {
    beats,
    coverage: {
      storyParagraphs: moment.sourceParagraphIds.length,
      representedByModel: shownAsText.size,
      representedByFallback: [],
      words: moment.wordCount,
      wordsShownVerbatim: shownWords,
      shownAsText: shownAsText.size,
      visualOnly,
      warnings,
    },
  };
}
