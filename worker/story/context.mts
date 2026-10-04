import type { JobContext } from "../job-runner.mts";
import type { StoryInputs } from "./inputs.mts";

export const storyWorkerVersion = "story-v3";

export type StoryContext = JobContext & { inputs: StoryInputs };

export async function repairDirection<T>(context: StoryContext, build: (context: StoryContext) => Promise<T>): Promise<T> {
  try { return await build(context); }
  catch (error) {
    if (await context.cancelled()) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    context.log(`Repairing invalid direction once: ${reason}`);
    return build({ ...context, callModel: (label, system, payload, options) => context.callModel(label, system, { source: payload, correction: reason }, options) });
  }
}
