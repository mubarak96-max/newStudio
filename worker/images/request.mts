import {
  assetTargetId,
  type AssetTarget,
  type CompositionPlan,
  type EntityVisualPlan,
  type VisualProfile,
} from "../../lib/story-types.ts";
import { unique } from "../evidence.mts";
import { styleLine } from "../visuals/compositions.mts";

export type EntityForImage = {
  entityId: string;
  name: string;
  type: string;
  visual: Omit<EntityVisualPlan, "entityId" | "fills">;
};

export type PlannedImage = {
  prompt: string;
  aspectRatio: string;
  /** Candidate reference targets in priority order; only approved ones are used. */
  referenceTargets: string[][];
  alpha: "none" | "chroma-green";
  role: string;
  episodeId: string | null;
};

/**
 * Mobile first for everything a reader sees: variants and scene layers share
 * one tall 9:16 phone canvas and stack without rescaling or recropping.
 */
export const mobileAspect = "9:16";
const mobileFraming =
  "Compose for a vertical 9:16 phone screen: tall portrait framing with the subject centred and readable at phone size.";
/** Cut-outs are placed by the prompt's position and size, never simply centred. */
const cutOutFraming = "The canvas is a vertical 9:16 phone frame; keep the figures at the stated size.";
export const sceneReference =
  "The first reference image is the scene the figures will stand in: match its perspective, scale, eye level and lighting, but do not draw any part of that scene. The other reference images show each figure, in the order named.";
/** A cut-out taken out of the approved master, so it cannot disagree with it. */
const figureFromMaster =
  "The first reference image is the finished scene this figure already stands in. Copy that figure exactly as it appears there — same size within the frame, same position, same pose, same clothing, same light and shadow — and draw nothing else from it. Later reference images show the same character for likeness only.";
/** The same scene with nobody in it, so the cut-outs can move across it. */
const plateFromMaster =
  "The first reference image is the finished scene. Redraw it exactly — same camera, same perspective, same light, same furniture in the same places — with every person removed and the floor, furniture and walls behind them painted in completely.";
const greenScreen =
  "Place the subject alone on a completely flat, uniform pure green (#00FF00) background with no shadows, floor, props or gradients, so the background can be keyed out.";

function avoid(profile: VisualProfile): string {
  return `Avoid: ${profile.negativeRules.join(", ")}.`;
}

function withNote(prompt: string, note: string | null): string {
  return note?.trim() ? `${prompt}\nCorrection requested by the editor: ${note.trim()}` : prompt;
}

/**
 * For each entity, prefer its approved state variant when a state is given,
 * otherwise its approved reference sheet. The first approved candidate wins.
 */
function entityReference(entityId: string, stateId: string | null): string[] {
  const reference = assetTargetId({ kind: "reference", entityId, stateId: null, compositionId: null, layerId: null });
  return stateId
    ? [assetTargetId({ kind: "variant", entityId, stateId, compositionId: null, layerId: null }), reference]
    : [reference];
}

export function planImage(
  target: AssetTarget,
  data: { profile: VisualProfile; entity: EntityForImage | null; composition: CompositionPlan | null; note: string | null },
): PlannedImage {
  const { profile, entity, composition, note } = data;
  if (target.kind === "reference") {
    if (!entity) throw new Error(`Entity ${target.entityId} has no visual bible entry. Run visual planning first.`);
    // Reference sheets are model inputs, never shown to readers, so they keep
    // the shape that suits the subject rather than the phone frame.
    return {
      prompt: withNote(`${entity.visual.referenceSheet.prompt} ${styleLine(profile)}. ${avoid(profile)}`, note),
      aspectRatio: entity.type === "object" ? "1:1" : "16:9",
      referenceTargets: [],
      alpha: "none",
      role: "reference",
      episodeId: null,
    };
  }
  if (target.kind === "variant") {
    if (!entity) throw new Error(`Entity ${target.entityId} has no visual bible entry. Run visual planning first.`);
    const variant = target.stateId ? entity.visual.stateVariants[target.stateId] : undefined;
    if (!variant) throw new Error(`Entity ${target.entityId} has no planned variant for state ${target.stateId}.`);
    const framing =
      entity.type === "location"
        ? "An establishing view of the same place as in the reference image."
        : `The same ${entity.type} as in the reference image, shown full length on a plain neutral background.`;
    return {
      prompt: withNote(
        `${styleLine(profile)}. ${entity.name}: ${entity.visual.spec} In this state (${variant.label}): ${variant.spec} ${framing} ${mobileFraming} ${avoid(profile)}`,
        note,
      ),
      aspectRatio: mobileAspect,
      referenceTargets: [entityReference(target.entityId!, null)],
      alpha: "none",
      role: `variant-${target.stateId}`,
      episodeId: null,
    };
  }
  if (!composition) throw new Error(`Composition ${target.compositionId} does not exist. Run visual planning first.`);
  const layer = composition.layers.find((candidate) => candidate.layerId === target.layerId);
  if (!layer) throw new Error(`Composition ${target.compositionId} has no layer ${target.layerId}.`);
  const foreground = layer.role !== "background";
  const stateOf = (entityId: string) => composition.entityStatesUsed.find((state) => state.entityId === entityId)?.stateId ?? null;
  // A background only needs the place. A cut-out needs its own subject and the
  // approved background it will stand in, so it matches that scene's scale,
  // perspective and light; no other character's look can bleed into it.
  const layerTarget = (layerId: string) =>
    assetTargetId({ kind: "layer", entityId: null, stateId: null, compositionId: composition.compositionId, layerId });
  // A cast layer is conditioned on every figure it draws, in the order the prompt names them.
  const drawn = layer.entityIds?.length ? layer.entityIds : layer.entityId ? [layer.entityId] : [];
  // Master first: the plate and the cut-outs are taken from the approved master
  // scene, so they inherit its scale, perspective and light instead of guessing.
  const entityRefs = [
    ...(composition.locationId ? [composition.locationId] : []),
    ...drawn,
    ...(layer.kind === "master" ? composition.entityStatesUsed.map((state) => state.entityId) : []),
  ];
  const referenceTargets = layer.derivedFrom
    ? [[layerTarget(layer.derivedFrom)], ...unique(drawn).map((entityId) => entityReference(entityId, stateOf(entityId)))]
    : foreground
      ? // A cut-out planned without a master still stands in the approved background.
        [[layerTarget("background")], ...unique(drawn).map((entityId) => entityReference(entityId, stateOf(entityId)))]
      : unique(entityRefs).map((entityId) =>
          entityReference(entityId, entityId === composition.locationId ? null : stateOf(entityId)),
        );
  // The authored prompt is art direction that already passed the prompt
  // contract; the mechanical one is the fallback when authoring was refused.
  const written = layer.authoredPrompt?.trim()
    ? `${styleLine(profile)}. ${layer.authoredPrompt.trim()}${foreground ? ` ${greenScreen}` : ""}`
    : layer.prompt;
  const derived = Boolean(layer.derivedFrom);
  const prompt = foreground
    ? `${written.replace(/Isolated on a transparent background[^.]*\./, greenScreen)} ${derived ? figureFromMaster : sceneReference} ${cutOutFraming}`
    : `${written} ${derived ? plateFromMaster : ""} ${mobileFraming}`;
  return {
    prompt: withNote(`${prompt} ${avoid(profile)}`, note),
    aspectRatio: mobileAspect,
    referenceTargets,
    alpha: foreground ? "chroma-green" : "none",
    role: layer.layerId,
    episodeId: composition.originEpisodeId,
  };
}
