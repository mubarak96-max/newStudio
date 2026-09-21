import type { JobContext } from "../job-runner.mts";
import type { StoryInputs } from "./inputs.mts";

export const storyWorkerVersion = "story-v2";

export type StoryContext = JobContext & { inputs: StoryInputs };
