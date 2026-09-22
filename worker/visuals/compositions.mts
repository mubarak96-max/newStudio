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

export function styleLine(profile: VisualProfile): string {
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

/** How tall a figure is in the frame, and where its lowest visible point falls, for each framing. */
const framingSize: Record<string, { height: number; baseline: number }> = {
  wide: { height: 0.4, baseline: 0.88 },
  medium: { height: 0.7, baseline: 1 },
  close: { height: 0.9, baseline: 1 },
  "over-shoulder": { height: 0.8, baseline: 1 },
  insert: { height: 0.35, baseline: 0.85 },
};

/**
 * Spreads figures across the frame from left to right in stacking order; the
 * nearest (last) is drawn a little larger so the depth order reads in the
 * picture as well as in the parallax.
 */
export function placeFigure(index: number, count: number, framing: string): NonNullable<LayerPlan["placement"]> {
  const size = framingSize[framing] ?? framingSize.medium!;
  const nearness = count > 1 ? index / (count - 1) : 1;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    centerX: round(count === 1 ? 0.5 : (index + 1) / (count + 1)),
    heightFraction: round(Math.min(0.95, size.height * (0.85 + 0.15 * nearness))),
    baseline: size.baseline,
  };
}

/**
 * The cut-out layers for a shot's figures. One figure gets its own layer.
 * Several figures share one cast layer drawn in a single image: the image
 * model composes a group coherently, but figures generated one by one came
 * back duplicated and stacked in the same spot whatever position was asked.
 */
export function figureLayers(
  figures: MomentEntityState[],
  shot: { description: string; framing: string },
  profile: VisualProfile,
  plans: Map<string, EntityVisualPlan>,
  entityOf: EntityLookup,
): Omit<LayerPlan, "depthRange" | "renderMode" | "mesh">[] {
  if (figures.length === 0) return [];
  const nameOf = (state: MomentEntityState) => entityOf(state.entityId)?.name ?? state.entityId;
  const lookLine = (state: MomentEntityState) => `${nameOf(state)}: ${lookOf(plans.get(state.entityId), state.stateId)}`;
  const placement = placeFigure(0, 1, shot.framing);
  const size =
    `about ${Math.round(placement.heightFraction * 100)}% of the frame height tall, with the lowest visible point ` +
    `${Math.round(placement.baseline * 100)}% of the way down the frame.`;
  if (figures.length === 1) {
    const state = figures[0]!;
    return [
      {
        layerId: `fg_${state.entityId}`,
        role: "foreground",
        entityId: state.entityId,
        entityIds: [state.entityId],
        prompt:
          `${styleLine(profile)}. ${lookLine(state)} Pose and action as in: ${shot.description} ` +
          `Draw only ${nameOf(state)}, no other people or objects, ${size} Isolated on a transparent background, lit to match the scene.`,
        transparent: true,
        zOrder: 1,
        placement,
      },
    ];
  }
  const names = figures.map(nameOf);
  return [
    {
      layerId: "fg_cast",
      role: "foreground",
      entityId: null,
      entityIds: figures.map((state) => state.entityId),
      prompt:
        `${styleLine(profile)}. Draw exactly these ${figures.length} people together in one image, each exactly once, and no one else: ${figures.map(lookLine).join(" ")} ` +
        `Arrange and pose them as in: ${shot.description} Keep ${names.join(" and ")} clearly separate, the group ${size} ` +
        `Isolated on a transparent background, lit to match the scene.`,
      transparent: true,
      zOrder: 1,
      placement,
    },
  ];
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
      // Only figures move independently of the scene. Objects (furniture,
      // walls, wallpaper, props) are painted into the background: as separate
      // cut-outs they came back filling the frame and hid the characters.
      const figures = cast.filter((state) => {
        const type = entityOf(state.entityId)?.type;
        return type === "character" || type === "group";
      });
      const locationPlan = moment.locationId ? plans.get(moment.locationId) : undefined;
      const place = moment.locationId
        ? `${entityOf(moment.locationId)?.name ?? ""}: ${lookOf(locationPlan, moment.locationStateId)}${locationPlan?.layout ? ` Layout: ${locationPlan.layout}` : ""}`
        : "";
      const castLines = cast
        .map((state) => `${entityOf(state.entityId)?.name ?? state.entityId}: ${lookOf(plans.get(state.entityId), state.stateId)}`)
        .filter((line) => !line.endsWith(": "));
      const scene = `${shot.framing} shot, ${shot.timeOfDay}, mood ${shot.mood}. ${shot.description}`;
      const propLines = cast
        .filter((state) => !figures.includes(state))
        .map((state) => `${entityOf(state.entityId)?.name ?? state.entityId}: ${lookOf(plans.get(state.entityId), state.stateId)}`)
        .filter((line) => !line.endsWith(": "));
      // Depth, render mode and the background's overscan are set once every Beat using the composition is known.
      const unplaced = { depthRange: [0, 1] as [number, number], renderMode: "plane" as const, mesh: null };
      const layers: LayerPlan[] = [
        {
          layerId: "background",
          role: "background",
          entityId: moment.locationId,
          prompt: `${styleLine(profile)}. ${place} ${scene}${propLines.length > 0 ? ` Include, as part of the scene: ${propLines.join(" ")}` : ""} Empty of people and characters, with the ground and walls behind where they stand fully painted.`,
          transparent: false,
          zOrder: 0,
          ...unplaced,
        },
        ...figureLayers(figures.slice(0, 6), shot, profile, plans, entityOf).map((layer) => ({ ...layer, ...unplaced })),
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
        responsive: { focalPoint: [0.5, 0.45], aspect: "9:16" },
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
