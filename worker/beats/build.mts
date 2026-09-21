import type {
  Beat,
  BeatCoverage,
  CameraPose,
  Commentary,
  Dialogue,
  Moment,
  Representation,
  TextSelection,
} from "../../lib/story-types.ts";
import { asString, records, strings } from "../coerce.mts";
import { unique } from "../evidence.mts";
import { entitiesInRange, entityAsOf, paragraphLines } from "../story/episodes.mts";
import { wordCount } from "../story/inputs.mts";
import type { StoryContext } from "../story/context.mts";
import { locateQuote } from "../story/text.mts";
import { durationFor, isCameraMove, posesFor, splitSentences } from "./camera.mts";
import { beatsSystemPrompt, coverageRepairSystemPrompt } from "./prompts.mts";

const maxQuoteWords = 60;
/** Twelve Beats with their representations fit well inside this; a longer answer is a model looping. */
const beatMaxTokens = 8_000;
const maxDialogueLines = 4;
const modalities = new Set(["text", "visual", "camera", "transition"]);
const beatTypes = new Set(["quote", "dialogue", "commentary", "mixed", "title", "transition"]);

type Draft = {
  type: Beat["type"] | null;
  quote: TextSelection | null;
  dialogue: Dialogue[];
  commentary: Commentary[];
  shotId: string | null;
  move: Beat["camera"]["move"];
  focusEntityId: string | null;
  rationale: string;
  representations: Representation[];
  continuation: boolean;
};

export function compositionIdFor(reuseKey: string): string {
  return `comp_${reuseKey}`;
}

function typeOf(draft: Draft): Beat["type"] {
  const kinds = [draft.quote ? 1 : 0, draft.dialogue.length > 0 ? 1 : 0, draft.commentary.length > 0 ? 1 : 0];
  const count = kinds.reduce((sum, value) => sum + value, 0);
  if (draft.type === "title" && count <= 1) return "title";
  if (count === 0) return "transition";
  if (count > 1) return "mixed";
  return draft.quote ? "quote" : draft.dialogue.length > 0 ? "dialogue" : "commentary";
}

/** Long quotes become consecutive Beats on the same shot; long exchanges are split every four lines. */
function splitDraft(draft: Draft, text: string | undefined): Draft[] {
  const parts: Draft[] = [];
  if (draft.quote && text && wordCount(draft.quote.text) > maxQuoteWords) {
    const pieces = splitSentences(text.slice(draft.quote.start, draft.quote.end), maxQuoteWords);
    pieces.forEach((piece, index) => {
      const start = draft.quote!.start + piece.start;
      const end = draft.quote!.start + piece.end;
      parts.push({
        ...draft,
        quote: { paragraphId: draft.quote!.paragraphId, start, end, text: text.slice(start, end) },
        dialogue: index === 0 ? draft.dialogue : [],
        commentary: index === 0 ? draft.commentary : [],
        move: index === 0 ? draft.move : "drift",
        continuation: index > 0,
        representations:
          index === 0
            ? draft.representations
            : [{ paragraphId: draft.quote!.paragraphId, modality: "text", description: "Continues the quoted passage without dropping any of it." }],
      });
    });
  } else {
    parts.push(draft);
  }
  return parts.flatMap((part) => {
    if (part.dialogue.length <= maxDialogueLines) return [part];
    const groups: Draft[] = [];
    for (let offset = 0; offset < part.dialogue.length; offset += maxDialogueLines) {
      groups.push({
        ...part,
        dialogue: part.dialogue.slice(offset, offset + maxDialogueLines),
        quote: offset === 0 ? part.quote : null,
        commentary: offset === 0 ? part.commentary : [],
        move: offset === 0 ? part.move : "drift",
        continuation: offset > 0,
        representations:
          offset === 0
            ? part.representations
            : unique(part.dialogue.slice(offset, offset + maxDialogueLines).map((line) => line.paragraphId)).map((paragraphId) => ({
                paragraphId,
                modality: "text" as const,
                description: "Continues the exchange with the next spoken lines.",
              })),
      });
    }
    return groups;
  });
}

export type MomentBeats = { beats: Beat[]; coverage: BeatCoverage };

export async function buildMomentBeats(
  context: StoryContext,
  moment: Moment,
  previousMoment: Moment | null,
): Promise<MomentBeats> {
  const { inputs } = context;
  const span = { seqStart: moment.seqStart, seqEnd: moment.seqEnd };
  const storyIds = new Set(moment.sourceParagraphIds);
  const seqOf = (paragraphId: string) => inputs.paragraphById.get(paragraphId)?.seq ?? moment.seqStart;
  const shots = moment.visualPlan.shots;
  const shotById = new Map(shots.map((shot) => [shot.shotId, shot]));
  const dialogueIds = moment.dialogue.map((_, index) => `d${index + 1}`);
  const commentaryIds = moment.commentary.map((_, index) => `c${index + 1}`);
  const warnings: string[] = [];
  const nameOf = (entityId: string | null) => (entityId ? (inputs.entityById.get(entityId)?.canonicalName ?? null) : null);

  const data =
    storyIds.size === 0
      ? null
      : await context.callModel(`beats ${moment.momentId}`, beatsSystemPrompt, {
          moment: { momentId: moment.momentId, title: moment.title, summary: moment.summary },
          entities: entitiesInRange(inputs, span, 25).map((entity) => entityAsOf(entity, span.seqStart)),
          shots: shots.map((shot) => ({
            shotId: shot.shotId,
            description: shot.description,
            framing: shot.framing,
            entityIds: shot.entityStates.map((state) => state.entityId),
          })),
          dialogue: moment.dialogue.map((line, index) => ({
            id: dialogueIds[index],
            paragraphId: line.paragraphId,
            speaker: nameOf(line.speakerEntityId),
            text: line.text,
          })),
          commentary: moment.commentary.map((note, index) => ({ id: commentaryIds[index], kind: note.kind, text: note.text })),
          requiredParagraphIds: moment.sourceParagraphIds,
          paragraphs: paragraphLines(inputs, span),
        }, { maxTokens: beatMaxTokens });
  if (storyIds.size > 0 && !data) warnings.push("The Beat call failed; Beats were built from the moment plan.");

  let droppedQuotes = 0;
  const drafts: Draft[] = records(data?.beats).flatMap((row) => {
    const quoteRow = row.quote && typeof row.quote === "object" ? (row.quote as Record<string, unknown>) : null;
    let quote: TextSelection | null = null;
    let paragraphText: string | undefined;
    if (quoteRow) {
      const paragraphId = asString(quoteRow.paragraphId).trim();
      paragraphText = storyIds.has(paragraphId) ? inputs.paragraphById.get(paragraphId)?.text : undefined;
      const located = paragraphText ? locateQuote(paragraphText, asString(quoteRow.text)) : null;
      if (located && paragraphText) quote = { paragraphId, ...located, text: paragraphText.slice(located.start, located.end) };
      else droppedQuotes += 1;
    }
    const camera = row.camera && typeof row.camera === "object" ? (row.camera as Record<string, unknown>) : {};
    const focus = asString(camera.focusEntityId);
    const draft: Draft = {
      type: beatTypes.has(asString(row.type)) ? (asString(row.type) as Beat["type"]) : null,
      quote,
      dialogue: strings(row.dialogueIds)
        .map((id) => moment.dialogue[dialogueIds.indexOf(id)])
        .filter((line): line is Dialogue => Boolean(line)),
      commentary: strings(row.commentaryIds)
        .map((id) => moment.commentary[commentaryIds.indexOf(id)])
        .filter((note): note is Commentary => Boolean(note))
        .slice(0, 2),
      shotId: shotById.has(asString(row.shotId)) ? asString(row.shotId) : (shots[0]?.shotId ?? null),
      move: isCameraMove(camera.move) ? camera.move : "drift",
      focusEntityId: inputs.entityById.has(focus) ? focus : null,
      rationale: asString(camera.rationale).trim(),
      representations: records(row.representations)
        .map((rep) => ({
          paragraphId: asString(rep.paragraphId).trim(),
          modality: (modalities.has(asString(rep.modality)) ? asString(rep.modality) : "visual") as Representation["modality"],
          description: asString(rep.description).trim(),
        }))
        .filter((rep) => storyIds.has(rep.paragraphId) && rep.description.length >= 12),
      continuation: false,
    };
    return splitDraft(draft, paragraphText);
  });
  if (droppedQuotes > 0) warnings.push(`${droppedQuotes} quote(s) did not match the source and were left out.`);

  // Without a model answer the moment's own selections, dialogue and shots
  // still make a faithful sequence: one Beat per selection, then the exchange.
  if (drafts.length === 0 && storyIds.size > 0) {
    const fallbackShot = shots[0]?.shotId ?? null;
    for (const selection of moment.exactTextSelections) {
      drafts.push(
        ...splitDraft(
          {
            type: "quote",
            quote: selection,
            dialogue: [],
            commentary: [],
            shotId: fallbackShot,
            move: "drift",
            focusEntityId: null,
            rationale: "Slow drift while the passage is read.",
            representations: [],
            continuation: false,
          },
          inputs.paragraphById.get(selection.paragraphId)?.text,
        ),
      );
    }
    if (moment.dialogue.length > 0) {
      drafts.push(
        ...splitDraft(
          {
            type: "dialogue",
            quote: null,
            dialogue: moment.dialogue,
            commentary: [],
            shotId: fallbackShot,
            move: "hold",
            focusEntityId: null,
            rationale: "Holds on the speakers during the exchange.",
            representations: [],
            continuation: false,
          },
          undefined,
        ),
      );
    }
  }

  const draftSeq = (draft: Draft) =>
    Math.min(
      ...[
        ...draft.representations.map((rep) => seqOf(rep.paragraphId)),
        ...(draft.quote ? [seqOf(draft.quote.paragraphId)] : []),
        ...draft.dialogue.map((line) => seqOf(line.paragraphId)),
      ],
      Number.POSITIVE_INFINITY,
    );
  const ordered = drafts
    .map((draft, index) => ({ draft, index, seq: draftSeq(draft) }))
    .map((item, index, all) => ({ ...item, seq: Number.isFinite(item.seq) ? item.seq : (all[index - 1]?.seq ?? moment.seqStart) }))
    .sort((left, right) => left.seq - right.seq || left.index - right.index);

  // Coverage: a paragraph shown as text is represented even if the model forgot
  // to say so; the model then places what is still missing; anything left after
  // that is attached to the nearest Beat's illustration and listed.
  const represented = new Set(ordered.flatMap(({ draft }) => draft.representations.map((rep) => rep.paragraphId)));
  for (const { draft } of ordered) {
    for (const paragraphId of unique([...(draft.quote ? [draft.quote.paragraphId] : []), ...draft.dialogue.map((line) => line.paragraphId)])) {
      if (represented.has(paragraphId)) continue;
      draft.representations.push({ paragraphId, modality: "text", description: "Shown in this Beat's subtitles in the book's own words." });
      represented.add(paragraphId);
    }
  }
  const missing = moment.sourceParagraphIds.filter((paragraphId) => !represented.has(paragraphId));
  if (missing.length > 0 && ordered.length > 0) {
    const repair = await context.callModel(
      `beat coverage ${moment.momentId}`,
      coverageRepairSystemPrompt,
      {
        beats: ordered.map(({ draft }, index) => ({
          beatIndex: index,
          subtitles: [draft.quote?.text, ...draft.dialogue.map((line) => line.text), ...draft.commentary.map((note) => note.text)]
            .filter(Boolean)
            .join(" / ")
            .slice(0, 400),
          illustration: draft.shotId ? (shotById.get(draft.shotId)?.description ?? "") : "",
        })),
        missingParagraphs: missing.map((paragraphId) => `[${paragraphId}] ${inputs.paragraphById.get(paragraphId)?.text ?? ""}`),
      },
      { maxTokens: beatMaxTokens },
    );
    for (const row of records(repair?.representations)) {
      const paragraphId = asString(row.paragraphId).trim();
      const host = ordered[Number(row.beatIndex)];
      const description = asString(row.description).trim();
      if (!host || represented.has(paragraphId) || !missing.includes(paragraphId) || description.length < 12) continue;
      host.draft.representations.push({
        paragraphId,
        modality: (modalities.has(asString(row.modality)) ? asString(row.modality) : "visual") as Representation["modality"],
        description,
      });
      represented.add(paragraphId);
    }
  }
  const byModel = represented.size;
  const fallbackIds: string[] = [];
  if (ordered.length > 0) {
    for (const paragraphId of moment.sourceParagraphIds) {
      if (represented.has(paragraphId)) continue;
      const seq = seqOf(paragraphId);
      const host = [...ordered].reverse().find((item) => item.seq <= seq) ?? ordered[0]!;
      const annotation = inputs.annotations.get(paragraphId);
      host.draft.representations.push({
        paragraphId,
        modality: "visual",
        description: annotation?.visualCue || annotation?.summary || "Carried by the illustration of this Beat.",
      });
      fallbackIds.push(paragraphId);
    }
  }

  let previousPose: { compositionId: string | null; to: CameraPose } | null = null;
  const beats: Beat[] = ordered.map(({ draft, seq }, index) => {
    const shot = draft.shotId ? shotById.get(draft.shotId) : undefined;
    const compositionId = shot ? compositionIdFor(shot.reuseKey) : null;
    const sameComposition = previousPose !== null && previousPose.compositionId === compositionId;
    const poses = posesFor(draft.move, sameComposition ? previousPose!.to : undefined);
    previousPose = { compositionId, to: poses.to };
    const words = [draft.quote?.text ?? "", ...draft.dialogue.map((line) => line.text), ...draft.commentary.map((note) => note.text)]
      .map(wordCount)
      .reduce((sum, value) => sum + value, 0);
    const transitionIn: Beat["transitionIn"] =
      index > 0
        ? { type: "cut", durationMs: sameComposition ? 0 : 250 }
        : previousMoment && previousMoment.locationId && previousMoment.locationId === moment.locationId
          ? { type: "parallaxShift", durationMs: 900 }
          : { type: "fade", durationMs: previousMoment ? 800 : 1200 };
    return {
      id: `${moment.momentId}_b${String(index + 1).padStart(2, "0")}`,
      order: index + 1,
      seq,
      type: typeOf(draft),
      text: {
        ...(draft.quote ? { quote: draft.quote } : {}),
        ...(draft.dialogue.length > 0
          ? { dialogue: draft.dialogue.map((line) => ({ ...line, speakerDisplayName: nameOf(line.speakerEntityId) })) }
          : {}),
        ...(draft.commentary.length > 0 ? { commentary: draft.commentary } : {}),
      },
      shotId: draft.shotId,
      compositionId,
      camera: {
        move: draft.move,
        ...poses,
        durationMs: durationFor(words),
        easing: "easeInOut",
        focusEntityId: draft.focusEntityId,
        rationale: draft.rationale || (draft.continuation ? "Continues the camera movement across a split passage." : ""),
      },
      transitionIn,
      inspectables: [],
      autoAdvanceMs: null,
      representations: draft.representations,
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

  const shownWords = beats
    .flatMap((beat) => [beat.text.quote?.text ?? "", ...(beat.text.dialogue ?? []).map((line) => line.text)])
    .map(wordCount)
    .reduce((sum, value) => sum + value, 0);
  if (fallbackIds.length > 0) warnings.push(`${fallbackIds.length} paragraph(s) were attached to the nearest Beat's illustration.`);
  return {
    beats,
    coverage: {
      storyParagraphs: storyIds.size,
      representedByModel: Math.min(byModel, storyIds.size),
      representedByFallback: fallbackIds,
      words: moment.wordCount,
      wordsShownVerbatim: shownWords,
      warnings,
    },
  };
}
