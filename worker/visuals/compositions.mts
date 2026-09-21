import type {
  CompositionPlan,
  EntityVisualPlan,
  LayerPlan,
  Lineage,
  Moment,
  MomentEntityState,
  VisualForecast,
  VisualProfile,
} from "../../lib/story-types.ts";
import { assignDepth, emptyEnvelope, planStage25d, widenEnvelope } from "./stage25d.mts";

export type PlannedMoment = { episodeId: string; moment: Moment };

type EntityLookup = (entityId: string) => { name: string; type: string } | undefined;

function styleLine(profile: VisualProfile): string {
  return [
    `${profile.artStyle} (${profile.medium})`,
    profile.palette.length > 0 ? `palette: ${profile.palette.join(", ")}` : "",
    profile.lighting,
    profile.lens,
    profile.texture,
    profile.eraDetails,
  ]
    .filter(Boolean)
    .join(". ");
}

/** The look for an entity in a given state: the state variant when one exists, else the canonical spec. */
function lookOf(plan: EntityVisualPlan | undefined, stateId: string | null): string {
  if (!plan) return "";
  const variant = stateId ? plan.stateVariants[stateId] : undefined;
  return variant ? `${plan.spec} Now: ${variant.spec}` : plan.spec;
}

/**
 * One Composition per reuseKey (place, place state, cast in their states,
 * time of day, framing). Every Beat that shows the same arrangement shares it,
 * which is what keeps generation count far below the Beat count.
 */
export function buildCompositionPlans(
  planned: PlannedMoment[],
  plans: Map<string, EntityVisualPlan>,
  entityOf: EntityLookup,
  profile: VisualProfile,
  lineage: Lineage,
): CompositionPlan[] {
  const byId = new Map<string, CompositionPlan>();
  const envelopes = new Map<string, ReturnType<typeof emptyEnvelope>>();
  const negativePrompt = profile.negativeRules.join(", ");
  for (const { episodeId, moment } of planned) {
    const shots = new Map(moment.visualPlan.shots.map((shot) => [shot.shotId, shot]));
    for (const beat of moment.readingBeats) {
      if (!beat.compositionId || !beat.shotId) continue;
      const existing = byId.get(beat.compositionId);
      if (existing) {
        existing.usedIn.push({ episodeId, momentId: moment.momentId, beatId: beat.id });
        widenEnvelope(envelopes.get(beat.compositionId)!, beat.camera);
        continue;
      }
      const shot = shots.get(beat.shotId);
      if (!shot) continue;
      const cast: MomentEntityState[] = shot.entityStates.filter((state) => {
        const type = entityOf(state.entityId)?.type;
        return type !== "location" && type !== "concept";
      });
      const locationPlan = moment.locationId ? plans.get(moment.locationId) : undefined;
      const place = moment.locationId
        ? `${entityOf(moment.locationId)?.name ?? ""}: ${lookOf(locationPlan, moment.locationStateId)}${locationPlan?.layout ? ` Layout: ${locationPlan.layout}` : ""}`
        : "";
      const castLines = cast
        .map((state) => `${entityOf(state.entityId)?.name ?? state.entityId}: ${lookOf(plans.get(state.entityId), state.stateId)}`)
        .filter((line) => !line.endsWith(": "));
      const scene = `${shot.framing} shot, ${shot.timeOfDay}, mood ${shot.mood}. ${shot.description}`;
      // Depth, render mode and the background's overscan are set once every Beat using the composition is known.
      const unplaced = { depthRange: [0, 1] as [number, number], renderMode: "plane" as const, mesh: null };
      const layers: LayerPlan[] = [
        {
          layerId: "background",
          role: "background",
          entityId: moment.locationId,
          prompt: `${styleLine(profile)}. ${place} ${scene} Empty of the characters listed for this shot, with the ground and walls behind them fully painted.`,
          transparent: false,
          zOrder: 0,
          ...unplaced,
        },
        ...cast.slice(0, 4).map((state, index) => ({
          layerId: `fg_${state.entityId}`,
          role: "foreground" as const,
          entityId: state.entityId,
          prompt: `${styleLine(profile)}. ${entityOf(state.entityId)?.name ?? state.entityId}: ${lookOf(plans.get(state.entityId), state.stateId)} Pose and action as in: ${shot.description} Isolated on a transparent background, lit to match the scene.`,
          transparent: true,
          zOrder: index + 1,
          ...unplaced,
        })),
      ];
      const envelope = emptyEnvelope();
      widenEnvelope(envelope, beat.camera);
      envelopes.set(beat.compositionId, envelope);
      byId.set(beat.compositionId, {
        schemaVersion: 1,
        ...lineage,
        compositionId: beat.compositionId,
        reuseKey: shot.reuseKey,
        originEpisodeId: episodeId,
        usedIn: [{ episodeId, momentId: moment.momentId, beatId: beat.id }],
        shotSnapshot: shot,
        locationId: moment.locationId,
        entityStatesUsed: cast,
        referenceEntityIds: [...(moment.locationId ? [moment.locationId] : []), ...cast.map((state) => state.entityId)].filter((id) =>
          plans.has(id),
        ),
        visualProfileVersion: profile.version,
        prompt: [styleLine(profile), place, scene, ...castLines].filter(Boolean).join("\n"),
        negativePrompt,
        layers,
        stage25d: planStage25d(envelope, layers),
        responsive: { focalPoint: [0.5, 0.45], aspect: "portrait" },
        status: "planned",
      });
    }
  }
  return Array.from(byId.values()).map((composition) => {
    const layers = assignDepth(composition.layers, composition.shotSnapshot.framing);
    const stage25d = planStage25d(envelopes.get(composition.compositionId)!, layers);
    const { x, y } = stage25d.backgroundOverscan;
    return {
      ...composition,
      layers: layers.map((layer) =>
        layer.role === "background"
          ? {
              ...layer,
              prompt: `${layer.prompt} Paint the scene ${Math.round(x * 100)}% beyond the left and right edges and ${Math.round(y * 100)}% beyond the top and bottom so the camera can move without revealing an edge.`,
            }
          : layer,
      ),
      stage25d,
    };
  });
}

export function forecastOf(
  compositions: CompositionPlan[],
  plans: EntityVisualPlan[],
  costPerImageUsd: number,
): VisualForecast {
  const usages = compositions.reduce((sum, composition) => sum + composition.usedIn.length, 0);
  const stateVariants = plans.reduce((sum, plan) => sum + Object.keys(plan.stateVariants).length, 0);
  const layerImages = compositions.reduce((sum, composition) => sum + composition.layers.length, 0);
  const imagesToGenerate = plans.length + stateVariants + layerImages;
  return {
    compositions: compositions.length,
    shotsPlanned: usages,
    reuseRate: usages > 0 ? Math.round((1 - compositions.length / usages) * 1000) / 1000 : 0,
    referenceSheets: plans.length,
    stateVariants,
    imagesToGenerate,
    costPerImageUsd,
    estimatedCostUsd: Math.round(imagesToGenerate * costPerImageUsd * 100) / 100,
  };
}
