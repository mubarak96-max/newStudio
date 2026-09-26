/**
 * Image prompt authoring.
 *
 * The mechanical prompt is a concatenation: style line, place, shot sentence,
 * cast lines. It tells a model what is in the picture and almost nothing about
 * how to take it, and it never says how big anything is — which is how a
 * seated man ended up larger than the bed behind him. This pass rewrites each
 * layer as art direction (staging, camera, light, materials, scale against
 * something known) and checks the result before it is allowed to replace it.
 */

import type { CompositionPlan, LayerPlan, VisualProfile } from "../../lib/story-types.ts";
import { asString, records } from "../coerce.mts";
import type { JobContext } from "../job-runner.mts";
import { styleLine } from "./compositions.mts";
import { promptAuthoringSystemPrompt } from "./prompts.mts";

export const promptAuthoringVersion = "prompt-author-v2";

export type PromptContract = {
  /** Names that must appear, because this layer draws them. */
  requiredNames: string[];
  /** Names of everyone else in the book: none of them belong in this picture. */
  forbiddenNames: string[];
  /** Something in frame of known size, so the model has a scale reference. */
  anchors: string[];
  minChars: number;
  maxChars: number;
};

const bannedWords = [
  "text",
  "caption",
  "captions",
  "lettering",
  "letters",
  "title",
  "subtitle",
  "watermark",
  "signature",
  "logo",
  "label",
  "labels",
  "speech bubble",
  "panel",
  "panels",
  "grid",
  "collage",
  "split screen",
  "reference sheet",
  "turnaround",
  "storyboard",
];

function contains(haystack: string, needle: string): boolean {
  const pattern = new RegExp(`(^|[^\\p{L}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
  return pattern.test(haystack);
}

export type PromptVerdict = { ok: true } | { ok: false; reason: string };

/**
 * A written prompt is kept only when it draws the same picture: the same
 * people, nobody else, no text in the image, and a usable length.
 */
export function judgeAuthoredPrompt(authored: string, contract: PromptContract): PromptVerdict {
  const text = authored.trim();
  if (text.length < contract.minChars) return { ok: false, reason: `too short (${text.length} chars)` };
  if (text.length > contract.maxChars) return { ok: false, reason: `too long (${text.length} chars)` };
  if (/^\s*[-*\d]+[.)]?\s/m.test(text)) return { ok: false, reason: "written as a list" };
  for (const word of bannedWords) {
    if (contains(text, word)) return { ok: false, reason: `asks for "${word}" in the image` };
  }
  for (const name of contract.requiredNames) {
    if (!contains(text, name)) return { ok: false, reason: `does not name ${name}` };
  }
  for (const name of contract.forbiddenNames) {
    if (contains(text, name)) return { ok: false, reason: `brings in ${name}, who is not in this shot` };
  }
  if (contract.anchors.length > 0 && !contract.anchors.some((anchor) => contains(text, anchor))) {
    return { ok: false, reason: "gives no scale reference" };
  }
  return { ok: true };
}

/** Things of known size in the frame, which a prompt can measure a figure against. */
export function anchorsFor(layer: LayerPlan, composition: CompositionPlan, nameOf: (entityId: string) => string | undefined): string[] {
  const names = composition.layers
    .filter((candidate) => candidate.layerId !== layer.layerId)
    .flatMap((candidate) => (candidate.entityId ? [nameOf(candidate.entityId)] : []))
    .filter((name): name is string => Boolean(name));
  const place = composition.locationId ? nameOf(composition.locationId) : undefined;
  return [...names, ...(place ? [place] : []), "doorway", "window", "bed", "chair", "table", "floor", "wall", "horizon", "eye level"];
}

export type AuthoringResult = { authored: number; refused: number; reasons: string[] };

/**
 * Writes one prompt per layer of a composition in a single call, then keeps
 * only the ones that pass the contract. A refusal is not an error: the
 * mechanical prompt still generates the image.
 */
export async function authorCompositionPrompts(
  context: JobContext,
  composition: CompositionPlan,
  profile: VisualProfile,
  nameOf: (entityId: string) => string | undefined,
): Promise<AuthoringResult> {
  const drawnIds = (layer: LayerPlan): string[] => layer.kind === "plate" ? [] : layer.entityIds ?? (layer.kind === "master" ? composition.layers.filter((candidate) => candidate.role !== "background").flatMap((candidate) => candidate.entityIds ?? (candidate.entityId ? [candidate.entityId] : [])) : layer.entityId ? [layer.entityId] : []);
  const castNames = new Set(
    composition.layers.flatMap((layer) => drawnIds(layer).map((entityId) => nameOf(entityId)).filter((name): name is string => Boolean(name))),
  );
  const reply = await context.callModel(`prompt authoring ${composition.compositionId}`, promptAuthoringSystemPrompt, {
    style: styleLine(profile),
    avoid: profile.negativeRules,
    shot: {
      description: composition.shotSnapshot.description,
      framing: composition.shotSnapshot.framing,
      timeOfDay: composition.shotSnapshot.timeOfDay,
      mood: composition.shotSnapshot.mood,
      place: composition.locationId ? nameOf(composition.locationId) : null,
    },
    layers: composition.layers.map((layer) => ({
      layerId: layer.layerId,
      role: layer.role,
      kind: layer.kind,
      direction: composition.shotSnapshot.direction,
      draws: drawnIds(layer).map((entityId) => nameOf(entityId) ?? entityId),
      mechanicalPrompt: layer.prompt,
    })),
  });

  const written = new Map(records(reply?.layers).map((row) => [asString(row.layerId), asString(row.prompt).trim()]));
  const result: AuthoringResult = { authored: 0, refused: 0, reasons: [] };
  for (const layer of composition.layers) {
    const authored = written.get(layer.layerId);
    layer.promptVersion = promptAuthoringVersion;
    if (!authored) {
      layer.authoredPrompt = null;
      result.refused += 1;
      result.reasons.push(`${layer.layerId}: nothing written`);
      continue;
    }
    const drawn = drawnIds(layer).map((entityId) => nameOf(entityId)).filter((name): name is string => Boolean(name));
    const verdict = judgeAuthoredPrompt(authored, {
      requiredNames: layer.kind === "plate" ? [] : drawn,
      forbiddenNames: [...castNames].filter((name) => !drawn.includes(name)),
      anchors: anchorsFor(layer, composition, nameOf),
      minChars: 120,
      maxChars: 1_200,
    });
    if (verdict.ok) {
      layer.authoredPrompt = authored;
      result.authored += 1;
    } else {
      layer.authoredPrompt = null;
      result.refused += 1;
      result.reasons.push(`${layer.layerId}: ${verdict.reason}`);
    }
  }
  return result;
}
