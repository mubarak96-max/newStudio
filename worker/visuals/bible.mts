import type { EntityVisualPlan, VisualProfile } from "../../lib/story-types.ts";
import { asString, nullableString, records, strings } from "../coerce.mts";
import type { JobContext } from "../job-runner.mts";
import type { Entity } from "../types.mts";
import type { StoryInputs } from "../story/inputs.mts";
import { entityVisualSystemPrompt, visualProfileSystemPrompt } from "./prompts.mts";

const alwaysNegative = ["text", "letters", "captions", "watermarks", "signatures", "painting", "brushwork", "cartoon", "illustration", "plastic CGI skin"];

export async function planVisualProfile(
  context: JobContext,
  inputs: StoryInputs,
  genres: string[],
  previousVersion: number,
): Promise<VisualProfile> {
  const data = await context.callModel("visual profile", visualProfileSystemPrompt, {
    genres,
    world: inputs.world,
    synopsis: inputs.synopsis,
    chapterSummaries: inputs.chapterSummaries.slice(0, 40).map((chapter) => `${chapter.title}: ${chapter.summary}`),
  });
  const negativeRules = Array.from(new Set([...strings(data?.negativeRules).map((rule) => rule.trim()), ...alwaysNegative]));
  return {
    version: previousVersion + 1,
    artStyle: "Photorealistic cinematic imagery, consistent identity and physically plausible materials",
    medium: "live-action photographic realism",
    palette: strings(data?.palette).slice(0, 8),
    lens: asString(data?.lens).trim() || "Natural 35-50mm framing, eye-level unless the scene calls otherwise",
    lighting: asString(data?.lighting).trim() || "Motivated natural light matching time of day",
    texture: "Natural skin, fabric, wood and stone detail; realistic surface response, no painted brushwork",
    eraDetails: asString(data?.eraDetails).trim() || inputs.world?.era || "",
    negativeRules,
  };
}

function entityPayload(entity: Entity) {
  return {
    entityId: entity.entityId,
    type: entity.type,
    name: entity.canonicalName,
    aliases: entity.aliases.map((alias) => alias.name),
    importance: entity.importance,
    facts: entity.facts.map((fact, index) => ({ id: `f${index + 1}`, key: fact.key, value: fact.value, quote: fact.quote })),
    states: entity.states.map((state) => ({ stateId: state.stateId, label: state.label, changes: state.changes, fromSeq: state.validFromSeq })),
    reveals: entity.reveals.map((reveal) => ({ what: reveal.what, seq: reveal.seq })),
    profile: entity.profile ? { role: entity.profile.role, appearance: entity.profile.appearance } : { role: "", appearance: entity.description },
  };
}

function referencePrompt(entity: Entity, views: string[], spec: string, profile: VisualProfile): string {
  return `Reference sheet of ${entity.canonicalName}: ${views.join(", ")} views on a neutral background. ${spec} Style: ${profile.artStyle}, ${profile.medium}.`;
}

export async function planEntityVisuals(context: JobContext, entities: Entity[], profile: VisualProfile, label: string): Promise<EntityVisualPlan[]> {
  const data = await context.callModel(label, entityVisualSystemPrompt, {
    visualProfile: { artStyle: profile.artStyle, eraDetails: profile.eraDetails },
    entities: entities.map(entityPayload),
  });
  const rows = new Map(records(data?.entities).map((row) => [asString(row.entityId), row]));
  return entities.map((entity) => {
    const row = rows.get(entity.entityId);
    const spec = asString(row?.spec).trim();
    if (!row || !spec) throw new Error(`Visual bible is incomplete for ${entity.entityId}.`);
    if (entity.type === "location" && !asString(row.layout).trim()) throw new Error(`Location ${entity.entityId} needs a stable layout before scene generation.`);
    const facts = strings(row.sourceFactIds)
      .map((id) => entity.facts[Number(id.replace(/\D/g, "")) - 1])
      .filter((fact) => fact !== undefined);
    const views = strings(row.referenceViews);
    const stateById = new Map(entity.states.map((state) => [state.stateId, state]));
    const stateVariants: EntityVisualPlan["stateVariants"] = {};
    for (const variant of records(row.stateVariants)) {
      const state = stateById.get(asString(variant.stateId));
      const variantSpec = asString(variant.spec).trim();
      if (state && variantSpec) {
        stateVariants[state.stateId] = { label: state.label, spec: variantSpec, validFromSeq: state.validFromSeq, approved: false };
      }
    }
    return {
      entityId: entity.entityId,
      spec,
      sourceFacts: facts.map((fact) => ({ key: fact.key, value: fact.value, paragraphIds: fact.paragraphIds })),
      fills: records(row.fills)
        .map((fill) => ({ key: asString(fill.key).trim(), value: asString(fill.value).trim(), reason: asString(fill.reason).trim() }))
        .filter((fill) => fill.key && fill.value),
      referenceSheet: {
        views,
        prompt: referencePrompt(entity, views, spec, profile) + (entity.type === "location" ? ` Fixed layout: ${asString(row.layout)}.` : ""),
        approved: false,
      },
      stateVariants,
      preRevealSpec: nullableString(row.preRevealSpec),
      hiddenUntilSeq: nullableString(row.preRevealSpec) && entity.reveals.length ? Math.min(...entity.reveals.map((reveal) => reveal.seq)) : null,
      layout: entity.type === "location" ? nullableString(row.layout) : null,
    };
  });
}
