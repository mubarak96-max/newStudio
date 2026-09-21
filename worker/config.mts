import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const env = process.env;
const projectId =
  env.FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!projectId) throw new Error("Missing FIREBASE_PROJECT_ID.");
if (!storageBucket)
  throw new Error("Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.");
if (!env.OPENROUTER_API_KEY) throw new Error("Missing OPENROUTER_API_KEY.");

const credentialPath = env.GOOGLE_APPLICATION_CREDENTIALS
  ? isAbsolute(env.GOOGLE_APPLICATION_CREDENTIALS)
    ? env.GOOGLE_APPLICATION_CREDENTIALS
    : resolve(process.cwd(), env.GOOGLE_APPLICATION_CREDENTIALS)
  : null;
const inlinePrivateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
  /\\n/g,
  "\n",
);
const serviceAccountEmail =
  env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL ??
  env.FIREBASE_CLIENT_EMAIL ??
  `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com`;
const credential =
  credentialPath && existsSync(credentialPath)
    ? applicationDefault()
    : inlinePrivateKey
      ? cert({
          projectId,
          clientEmail: serviceAccountEmail,
          privateKey: inlinePrivateKey,
        })
      : null;
if (!credential) {
  throw new Error(
    "Firebase Admin credentials unavailable. Provide an existing GOOGLE_APPLICATION_CREDENTIALS file or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
  );
}

const app = initializeApp(
  { credential, projectId, storageBucket },
  "book-pipeline-worker",
);
export const db = getFirestore(app);
export const bucket = getStorage(app).bucket(storageBucket);

function envNumber(
  name: string,
  fallback: number,
  min: number,
  max = Infinity,
): number {
  const value = Number(env[name] ?? fallback);
  return Math.max(
    min,
    Math.min(max, Number.isFinite(value) ? value : fallback),
  );
}

function modelList(primary: string, fallbacks: string | undefined): string[] {
  return Array.from(
    new Set([
      primary,
      ...(fallbacks ?? "")
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
    ]),
  );
}

const defaultFallbacks = "deepseek/deepseek-chat,deepseek/deepseek-v4-flash";

export const openRouterApiKey = env.OPENROUTER_API_KEY;
export const pollIntervalMs = envNumber("POLL_INTERVAL_MS", 10_000, 2_000);
export const openRouterModel = env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini";
export const openRouterModels = modelList(
  openRouterModel,
  env.OPENROUTER_FALLBACK_MODELS ?? defaultFallbacks,
);
/** Consolidation reasons over the whole ledger at once; it may use a stronger model. */
export const consolidationModels = modelList(
  env.OPENROUTER_CONSOLIDATION_MODEL ?? openRouterModel,
  env.OPENROUTER_FALLBACK_MODELS ?? defaultFallbacks,
);
export const openRouterMaxTokens = envNumber(
  "OPENROUTER_MAX_TOKENS",
  16_000,
  4_000,
  32_000,
);

/**
 * Windows are small on purpose. Recall is the whole game: a model asked for
 * every entity, fact, event and one annotation per paragraph under-reports
 * badly when it is handed sixty paragraphs at once. About fifteen paragraphs
 * with a few paragraphs of context either side keeps a scene visible while
 * keeping the requested output small enough that nothing is summarised away.
 */
const charsPerToken = 4;
export const windowMaxTokens = envNumber("WINDOW_MAX_TOKENS", 3_000, 500);
export const windowMaxParagraphs = envNumber("WINDOW_MAX_PARAGRAPHS", 16, 1);
export const windowMaxCharacters = envNumber(
  "WINDOW_MAX_CHARACTERS",
  windowMaxTokens * charsPerToken,
  1_000,
);
export const windowOverlapParagraphs = envNumber(
  "WINDOW_OVERLAP_PARAGRAPHS",
  4,
  0,
);
/** Ceiling for one processing unit: a single paragraph longer than this is fragmented. */
export const unitMaxCharacters = envNumber("UNIT_MAX_CHARACTERS", 6_000, 2_000);
export const maxWindowSplitDepth = 7;
/** Rounds of targeted re-extraction for story paragraphs that came back without an annotation. */
export const repairRounds = envNumber("REPAIR_ROUNDS", 2, 0, 5);
/** Ledger entities sent as context per window when the book has more than this many. */
export const maxContextEntities = envNumber("MAX_CONTEXT_ENTITIES", 160, 20);
export const profileBatchSize = envNumber("PROFILE_BATCH_SIZE", 8, 1, 30);

/**
 * Episode size follows new.md: about one chapter or 10-20 minutes of reading.
 * A Moment is one scene unit, long enough for a handful of Reading Beats.
 */
export const episodeTargetWords = envNumber("EPISODE_TARGET_WORDS", 3_500, 500);
export const episodeMinWords = envNumber("EPISODE_MIN_WORDS", 1_500, 100);
export const episodeMaxWords = envNumber("EPISODE_MAX_WORDS", 6_000, 1_000);
export const momentTargetWords = envNumber("MOMENT_TARGET_WORDS", 450, 100);
export const momentMinWords = envNumber("MOMENT_MIN_WORDS", 120, 20);
export const momentMaxWords = envNumber("MOMENT_MAX_WORDS", 1_100, 300);
/** Moment calls are independent of each other, so several run at once. */
export const storyConcurrency = envNumber("STORY_CONCURRENCY", 4, 1, 12);
export const imageModel = env.IMAGE_MODEL ?? "google/gemini-3.1-flash-lite-image";
/** Same model on the Gemini API directly, used for asynchronous half-price batches. */
export const geminiImageModel = env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-lite-image";
/** Images per Gemini batch; results are held in memory while they are saved. */
export const geminiBatchSize = envNumber("GEMINI_BATCH_SIZE", 50, 1, 200);
/**
 * Gemini batch results report tokens, not money: cost is estimated from list
 * prices (per token) at the 50% batch discount and flagged as an estimate.
 */
export const geminiInputUsdPerToken = envNumber("GEMINI_INPUT_USD_PER_TOKEN", 0.00000025, 0);
export const geminiOutputUsdPerToken = envNumber("GEMINI_IMAGE_OUTPUT_USD_PER_TOKEN", 0.00003, 0);
export const batchPollIntervalMs = envNumber("BATCH_POLL_INTERVAL_MS", 60_000, 15_000);
/** Forecast only: what one generated image is expected to cost with the configured image model. */
export const imageCostUsd = envNumber("IMAGE_COST_USD", 0.04, 0);

export const workerVersion = "understand-v10";
export const workerId = crypto.randomUUID();
export const staleLeaseMs = 2 * 60 * 1000;
