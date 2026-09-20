import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  loadLatestValidCheckpoint,
  saveJsonCheckpoint,
} from "./checkpoint-store.mts";

type Paragraph = {
  id: string;
  seq: number;
  page: number;
  chapterId: string;
  text: string;
  hash: string;
  kind: string;
  isStory: boolean;
  unitIndex?: number;
  fragmentIndex?: number;
  fragmentCount?: number;
};

type Evidence = { paragraphIds: string[] };

type Entity = {
  entityId: string;
  type: "character" | "location" | "object" | "group";
  canonicalName: string;
  aliases: ({ name: string; firstSeq: number } & Evidence)[];
  importance: "major" | "supporting" | "minor";
  firstSeq: number;
  lastSeq: number;
  facts: ({ key: string; value: string; quote: string } & Evidence)[];
  fills: { key: string; value: string; reason: string }[];
  states: ({
    stateId: string;
    label: string;
    validFromStoryTime: number;
    validToStoryTime: number | null;
    validFromSeq: number;
    changes: Record<string, string>;
  } & Evidence)[];
  reveals: ({ what: string; seq: number } & Evidence)[];
  relationships: ({
    toEntityId: string;
    type: string;
    validFromSeq: number;
    validToSeq: number | null;
  } & Evidence)[];
};

type Event = {
  eventId: string;
  order: number;
  summary: string;
  seqStart: number;
  seqEnd: number;
  storyTime: number;
  participants: string[];
  locationId: string | null;
  objectIds: string[];
  kind: string;
  paragraphIds: string[];
};

type Ledger = {
  sourceId: string;
  canonicalHash: string;
  processedWindow: number;
  processedUnitIndex?: number;
  processedThroughSeq: number;
  coveredParagraphIds: string[];
  filteredParagraphIds?: string[];
  filteredWindows?: number[];
  rollingSynopsis: string;
  entities: Entity[];
  events: Event[];
  aliasConflicts: {
    alias: string;
    entityIds: string[];
    paragraphIds: string[];
  }[];
};

type Window = {
  index: number;
  owned: Paragraph[];
  contextBefore: Paragraph[];
  contextAfter: Paragraph[];
};

type Delta = {
  newEntities: ({
    entityId: string;
    type: Entity["type"];
    canonicalName: string;
    aliases: ({ name: string; firstSeq: number } & Evidence)[];
    importance: Entity["importance"];
    firstSeq: number;
    lastSeq: number;
  } & Evidence)[];
  facts: ({
    entityId: string;
    key: string;
    value: string;
    quote: string;
  } & Evidence)[];
  events: (Omit<Event, "order" | "storyTime"> & {
    storyTimeHint?: number;
    evidenceQuotes: string[];
  })[];
  stateChanges: ({
    entityId: string;
    stateId: string;
    label: string;
    validFromStoryTime: number;
    validFromSeq: number;
    changes: Record<string, string>;
    evidenceQuotes: string[];
  } & Evidence)[];
  reveals: ({
    entityId: string;
    what: string;
    seq: number;
    evidenceQuotes: string[];
  } & Evidence)[];
  relationshipChanges: ({
    entityId: string;
    toEntityId: string;
    type: string;
    validFromSeq: number;
    evidenceQuotes: string[];
  } & Evidence)[];
  aliasConflicts: {
    alias: string;
    entityIds: string[];
    paragraphIds: string[];
  }[];
  updatedSynopsis: string;
};

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
  {
    credential,
    projectId,
    storageBucket,
  },
  "book-pipeline-worker",
);
const db = getFirestore(app);
const bucket = getStorage(app).bucket(storageBucket);
const pollIntervalMs = Math.max(2_000, Number(env.POLL_INTERVAL_MS ?? 10_000));
const openRouterModel = env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini";
const openRouterModels = Array.from(
  new Set([
    openRouterModel,
    ...(env.OPENROUTER_FALLBACK_MODELS ??
      "deepseek/deepseek-chat,deepseek/deepseek-v4-flash")
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
  ]),
);
const openRouterMaxTokens = Math.max(
  4_000,
  Math.min(32_000, Number(env.OPENROUTER_MAX_TOKENS ?? 16_000) || 16_000),
);
const windowMaxParagraphs = Math.max(
  1,
  Number(env.WINDOW_MAX_PARAGRAPHS ?? 10) || 10,
);
const windowMaxCharacters = Math.max(
  2_000,
  Number(env.WINDOW_MAX_CHARACTERS ?? 6_000) || 6_000,
);
const workerVersion = "understand-v6";
const workerId = crypto.randomUUID();
const staleLeaseMs = 2 * 60 * 1000;
let stopping = false;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
  return asArray(value).filter(
    (item): item is string => typeof item === "string",
  );
}

function entityType(value: unknown): Entity["type"] {
  return value === "location" || value === "object" || value === "group"
    ? value
    : "character";
}

function importance(value: unknown): Entity["importance"] {
  return value === "major" || value === "minor" ? value : "supporting";
}

function safeId(value: unknown, fallbackPrefix: string): string {
  const normalized = asString(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return normalized || `${fallbackPrefix}_${crypto.randomUUID().slice(0, 12)}`;
}

function stringRecord(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        return typeof row.key === "string" && typeof row.value === "string"
          ? [[row.key, row.value]]
          : [];
      }),
    );
  }
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key, entry]] : [],
    ),
  );
}

function normalizeDelta(value: unknown): Delta {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    newEntities: asArray(data.newEntities).map((item) => {
      const row =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        entityId: safeId(row.entityId, "entity"),
        type: entityType(row.type),
        canonicalName: asString(row.canonicalName),
        aliases: asArray(row.aliases).map((alias) => {
          const entry =
            alias && typeof alias === "object"
              ? (alias as Record<string, unknown>)
              : {};
          return {
            name: asString(entry.name),
            firstSeq: asNumber(entry.firstSeq),
            paragraphIds: strings(entry.paragraphIds),
          };
        }),
        importance: importance(row.importance),
        firstSeq: asNumber(row.firstSeq),
        lastSeq: asNumber(row.lastSeq),
        paragraphIds: strings(row.paragraphIds),
      };
    }),
    facts: asArray(data.facts).map((item) => {
      const row =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        entityId: safeId(row.entityId, "entity"),
        key: asString(row.key),
        value: asString(row.value),
        quote: asString(row.quote),
        paragraphIds: strings(row.paragraphIds),
      };
    }),
    events: asArray(data.events).map((item) => {
      const row =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        eventId: safeId(row.eventId, "event"),
        summary: asString(row.summary),
        seqStart: asNumber(row.seqStart),
        seqEnd: asNumber(row.seqEnd),
        storyTimeHint: asNumber(row.storyTimeHint),
        participants: strings(row.participants),
        locationId: typeof row.locationId === "string" ? row.locationId : null,
        objectIds: strings(row.objectIds),
        kind: asString(row.kind, "event"),
        paragraphIds: strings(row.paragraphIds),
        evidenceQuotes: strings(row.evidenceQuotes),
      };
    }),
    stateChanges: asArray(data.stateChanges).map((item) => {
      const row =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        entityId: safeId(row.entityId, "entity"),
        stateId: safeId(row.stateId, "state"),
        label: asString(row.label),
        validFromStoryTime: asNumber(row.validFromStoryTime),
        validFromSeq: asNumber(row.validFromSeq),
        changes: stringRecord(row.changes),
        paragraphIds: strings(row.paragraphIds),
        evidenceQuotes: strings(row.evidenceQuotes),
      };
    }),
    reveals: asArray(data.reveals).map((item) => {
      const row =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        entityId: safeId(row.entityId, "entity"),
        what: asString(row.what),
        seq: asNumber(row.seq),
        paragraphIds: strings(row.paragraphIds),
        evidenceQuotes: strings(row.evidenceQuotes),
      };
    }),
    relationshipChanges: asArray(data.relationshipChanges).map((item) => {
      const row =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        entityId: safeId(row.entityId, "entity"),
        toEntityId: safeId(row.toEntityId, "entity"),
        type: asString(row.type),
        validFromSeq: asNumber(row.validFromSeq),
        paragraphIds: strings(row.paragraphIds),
        evidenceQuotes: strings(row.evidenceQuotes),
      };
    }),
    aliasConflicts: asArray(data.aliasConflicts).map((item) => {
      const row =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
      return {
        alias: asString(row.alias),
        entityIds: strings(row.entityIds),
        paragraphIds: strings(row.paragraphIds),
      };
    }),
    updatedSynopsis: asString(data.updatedSynopsis),
  };
}

function buildWindows(
  paragraphs: Paragraph[],
  maxParagraphs = windowMaxParagraphs,
  maxCharacters = windowMaxCharacters,
  overlap = 5,
): Window[] {
  const windows: Window[] = [];
  const chapters = new Map<string, Paragraph[]>();
  for (const paragraph of paragraphs) {
    const chapter = chapters.get(paragraph.chapterId) ?? [];
    chapter.push(paragraph);
    chapters.set(paragraph.chapterId, chapter);
  }
  for (const chapter of chapters.values()) {
    for (let start = 0; start < chapter.length; ) {
      let end = start;
      let characters = 0;
      while (end < chapter.length && end - start < maxParagraphs) {
        const nextCharacters = chapter[end]!.text.length;
        if (end > start && characters + nextCharacters > maxCharacters) break;
        characters += nextCharacters;
        end += 1;
      }
      windows.push({
        index: windows.length,
        owned: chapter.slice(start, end),
        contextBefore: chapter.slice(Math.max(0, start - overlap), start),
        contextAfter: chapter.slice(end, end + overlap),
      });
      start = end;
    }
  }
  return windows;
}

function splitForProcessing(text: string, maxCharacters = 6_000): string[] {
  if (text.length <= maxCharacters) return [text];
  const fragments: string[] = [];
  let rest = text;
  while (rest.length > maxCharacters) {
    const candidate = rest.slice(0, maxCharacters);
    const boundary = Math.max(
      candidate.lastIndexOf("\n"),
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf(" "),
    );
    const end = boundary > maxCharacters * 0.6 ? boundary + 1 : maxCharacters;
    fragments.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) fragments.push(rest);
  return fragments;
}

function buildProcessingUnits(paragraphs: Paragraph[]): Paragraph[] {
  const units: Paragraph[] = [];
  for (const paragraph of paragraphs) {
    const fragments = splitForProcessing(paragraph.text);
    fragments.forEach((text, fragmentIndex) => {
      units.push({
        ...paragraph,
        text,
        unitIndex: units.length,
        fragmentIndex,
        fragmentCount: fragments.length,
      });
    });
  }
  return units;
}

function selectLedgerContext(ledger: Ledger, window: Window) {
  const source = window.owned
    .map((paragraph) => paragraph.text.toLowerCase())
    .join("\n");
  const earliestSeq = window.contextBefore[0]?.seq ?? window.owned[0]?.seq ?? 0;
  const entities = ledger.entities.filter(
    (entity) =>
      entity.lastSeq >= earliestSeq - 180 ||
      source.includes(entity.canonicalName.toLowerCase()) ||
      entity.aliases.some((alias) => source.includes(alias.name.toLowerCase())),
  );
  return {
    aliases: ledger.entities.flatMap((entity) => [
      { name: entity.canonicalName, entityId: entity.entityId },
      ...entity.aliases.map((alias) => ({
        name: alias.name,
        entityId: entity.entityId,
      })),
    ]),
    entities: entities.map((entity) => ({
      entityId: entity.entityId,
      type: entity.type,
      canonicalName: entity.canonicalName,
      aliases: entity.aliases,
      lastSeq: entity.lastSeq,
      recentStates: entity.states.slice(-3),
      relationships: entity.relationships,
    })),
    recentEvents: ledger.events.slice(-25),
  };
}

function paragraphText(
  paragraph: Paragraph,
  role: "context" | "owned",
): string {
  const fragment =
    (paragraph.fragmentCount ?? 1) > 1
      ? ` part=${(paragraph.fragmentIndex ?? 0) + 1}/${paragraph.fragmentCount}`
      : "";
  return `[${paragraph.id} seq=${paragraph.seq} page=${paragraph.page}${fragment} ${role}] ${paragraph.text}`;
}

async function callUnderstandingModel(
  ledger: Ledger,
  window: Window,
): Promise<{ delta: Delta; cost: number; model: string }> {
  const system = `You extract a faithful Book Model from supplied source paragraphs.
Return JSON only. Use only claims supported by supplied paragraphs. Never use outside knowledge.
Every new entity, fact, event, state change, reveal, relationship, and alias needs paragraphIds.
Every fact needs quote. Every event, state change, reveal, and relationship needs evidenceQuotes.
All evidence quotes must be exact substrings copied from cited paragraphs and no longer than 20 words.
Prefer the least explicit exact substring that still supports the claim.
This is structured analysis of user-supplied literary text. Never reproduce passages beyond those short evidence quotes.
This is a non-graphic literary-analysis task: if owned paragraphs contain sexual, violent, or otherwise sensitive material, do not refuse. Analyze clinically in neutral, high-level terms and keep summaries non-explicit.
If identity is uncertain, add aliasConflicts. Do not silently merge entities.
Return deltas only with keys: newEntities, facts, events, stateChanges, reveals, relationshipChanges, aliasConflicts, updatedSynopsis.
Use these item fields:
newEntities: entityId,type,canonicalName,aliases[{name,firstSeq,paragraphIds}],importance,firstSeq,lastSeq,paragraphIds.
facts: entityId,key,value,quote,paragraphIds.
events: eventId,summary,seqStart,seqEnd,storyTimeHint,participants,locationId,objectIds,kind,paragraphIds,evidenceQuotes.
stateChanges: entityId,stateId,label,validFromStoryTime,validFromSeq,changes[{key,value}],paragraphIds,evidenceQuotes.
reveals: entityId,what,seq,paragraphIds,evidenceQuotes.
relationshipChanges: entityId,toEntityId,type,validFromSeq,paragraphIds,evidenceQuotes.
aliasConflicts: alias,entityIds,paragraphIds.
Entity type must be character, location, object, or group. Entity IDs must stay stable when ledger provides one.
updatedSynopsis must be 150-300 words and describe story only through owned paragraphs.
Context paragraphs help interpretation but owned paragraphs are the processing target.`;
  const user = JSON.stringify({
    ledger: selectLedgerContext(ledger, window),
    rollingSynopsis: ledger.rollingSynopsis,
    contextBefore: window.contextBefore.map((paragraph) =>
      paragraphText(paragraph, "context"),
    ),
    ownedParagraphs: window.owned.map((paragraph) =>
      paragraphText(paragraph, "owned"),
    ),
    contextAfter: window.contextAfter.map((paragraph) =>
      paragraphText(paragraph, "context"),
    ),
  });

  let lastError: unknown;
  let cost = 0;
  let sawContentFilter = false;
  const contentFilterPatterns =
    /content[_-]?filter|moderation|safety|policy|refusal|refused|inappropriate/i;
  const markContentFilter = (window: Window, detail: string) => {
    sawContentFilter = true;
    const ownedChars = window.owned.reduce(
      (total, paragraph) => total + paragraph.text.length,
      0,
    );
    const error = new Error(
      `OpenRouter content filter: ${detail} (window ${window.index}, owned ${window.owned.length} paras/${ownedChars} chars).`,
    );
    (error as Error & { code?: string }).code = "CONTENT_FILTER";
    return error;
  };
  for (const model of openRouterModels) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              temperature: 0,
              max_tokens: openRouterMaxTokens,
              response_format: { type: "json_object" },
              provider: { allow_fallbacks: true },
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }),
          },
        );
        if (!response.ok) {
          const bodyText = await response.text();
          if (
            response.status === 400 ||
            response.status === 403 ||
            response.status === 422
          ) {
            if (contentFilterPatterns.test(bodyText)) {
              lastError = markContentFilter(window, model);
              break;
            }
          }
          throw new Error(`OpenRouter HTTP ${response.status}: ${bodyText}`);
        }
        const payload = (await response.json()) as {
          choices?: {
            finish_reason?: string;
            message?: { content?: string };
          }[];
          model?: string;
          usage?: { cost?: number };
        };
        cost += asNumber(payload.usage?.cost);
        const choice = payload.choices?.[0];
        if (choice?.finish_reason === "content_filter") {
          lastError = markContentFilter(window, model);
          break;
        }
        const content = choice?.message?.content;
        if (!content) {
          if (contentFilterPatterns.test(JSON.stringify(payload))) {
            lastError = markContentFilter(window, model);
            break;
          }
          throw new Error("OpenRouter returned no message content.");
        }
        if (
          contentFilterPatterns.test(content.slice(0, 500)) &&
          content.trim().length < 500 &&
          !content.trim().startsWith("{")
        ) {
          lastError = markContentFilter(window, model);
          break;
        }
        if (choice?.finish_reason && choice.finish_reason !== "stop") {
          const ownedChars = window.owned.reduce(
            (total, paragraph) => total + paragraph.text.length,
            0,
          );
          const error = new Error(
            `OpenRouter response incomplete: ${choice.finish_reason} (window ${window.index}, owned ${window.owned.length} paras/${ownedChars} chars, max_tokens ${openRouterMaxTokens}). Split the window and retry.`,
          );
          (error as Error & { code?: string }).code =
            choice.finish_reason === "length"
              ? "LENGTH_TRUNCATION"
              : "INCOMPLETE_RESPONSE";
          throw error;
        }
        const cleaned = content
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, "");
        let parsed: unknown;
        try {
          parsed = JSON.parse(cleaned);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid JSON.";
          throw new Error(`Invalid structured AI response: ${message}`);
        }
        return {
          delta: normalizeDelta(parsed),
          cost,
          model: payload.model ?? model,
        };
      } catch (error) {
        if (isContentFilterError(error)) break;
        lastError = error;
        if (attempt < 2)
          await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
  }
  if (sawContentFilter && !isContentFilterError(lastError)) {
    lastError = markContentFilter(
      window,
      openRouterModels.join(" -> ") || "all models",
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("AI request failed.");
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error
    ? (error as Error & { code?: string }).code
    : undefined;
}

function isContentFilterError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (errorCode(error) === "CONTENT_FILTER" ||
      error.message.startsWith("OpenRouter content filter:"))
  );
}

function isLengthTruncation(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as Error & { code?: string }).code === "LENGTH_TRUNCATION" ||
      error.message.includes("incomplete: length"))
  );
}

function splitWindow(window: Window): [Window, Window] {
  const mid = Math.max(1, Math.ceil(window.owned.length / 2));
  const firstOwned = window.owned.slice(0, mid);
  const secondOwned = window.owned.slice(mid);
  const crossOverlap = 2;
  return [
    {
      index: window.index,
      owned: firstOwned,
      contextBefore: window.contextBefore,
      contextAfter: secondOwned.slice(0, crossOverlap),
    },
    {
      index: window.index,
      owned: secondOwned,
      contextBefore: [...window.contextBefore, ...firstOwned].slice(
        -crossOverlap,
      ),
      contextAfter: window.contextAfter,
    },
  ];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function validEvidence(
  ids: string[],
  paragraphById: Map<string, Paragraph>,
): string[] {
  return unique(ids.filter((id) => paragraphById.has(id)));
}

function quoteMatches(
  quote: string,
  ids: string[],
  paragraphById: Map<string, Paragraph>,
): boolean {
  const needle = quote.trim();
  return (
    Boolean(needle) &&
    ids.some((id) => paragraphById.get(id)?.text.includes(needle))
  );
}

function evidenceQuotesMatch(
  quotes: string[],
  ids: string[],
  paragraphById: Map<string, Paragraph>,
): boolean {
  return (
    quotes.length > 0 &&
    quotes.every((quote) => quoteMatches(quote, ids, paragraphById))
  );
}

function mergeDelta(
  ledger: Ledger,
  delta: Delta,
  window: Window,
  paragraphById: Map<string, Paragraph>,
): void {
  for (const incoming of delta.newEntities) {
    if (!incoming.entityId || !incoming.canonicalName) continue;
    const evidenceIds = validEvidence(incoming.paragraphIds, paragraphById);
    const nameCandidates = [
      incoming.canonicalName,
      ...incoming.aliases.map((alias) => alias.name),
    ]
      .filter(Boolean)
      .map((name) => name.toLowerCase());
    const nameAppears = evidenceIds.some((id) => {
      const text = paragraphById.get(id)?.text.toLowerCase() ?? "";
      return nameCandidates.some((name) => text.includes(name));
    });
    if (evidenceIds.length === 0 || !nameAppears) continue;
    const evidenceSeqs = evidenceIds.map((id) => paragraphById.get(id)!.seq);
    const firstEvidenceSeq = Math.min(...evidenceSeqs);
    const lastEvidenceSeq = Math.max(...evidenceSeqs);
    let entity = ledger.entities.find(
      (candidate) => candidate.entityId === incoming.entityId,
    );
    if (!entity) {
      entity = {
        entityId: incoming.entityId,
        type: incoming.type,
        canonicalName: incoming.canonicalName,
        aliases: [],
        importance: incoming.importance,
        firstSeq: firstEvidenceSeq,
        lastSeq: lastEvidenceSeq,
        facts: [],
        fills: [],
        states: [],
        reveals: [],
        relationships: [],
      };
      ledger.entities.push(entity);
    }
    entity.firstSeq = Math.min(entity.firstSeq, firstEvidenceSeq);
    entity.lastSeq = Math.max(entity.lastSeq, lastEvidenceSeq);
    for (const alias of incoming.aliases) {
      const paragraphIds = validEvidence(alias.paragraphIds, paragraphById);
      if (!alias.name || paragraphIds.length === 0) continue;
      if (
        !entity.aliases.some(
          (candidate) =>
            candidate.name.toLowerCase() === alias.name.toLowerCase(),
        )
      ) {
        entity.aliases.push({ ...alias, paragraphIds });
      }
    }
  }

  for (const fact of delta.facts) {
    const entity = ledger.entities.find(
      (candidate) => candidate.entityId === fact.entityId,
    );
    const paragraphIds = validEvidence(fact.paragraphIds, paragraphById);
    if (
      !entity ||
      !fact.key ||
      !fact.value ||
      !quoteMatches(fact.quote, paragraphIds, paragraphById)
    )
      continue;
    if (
      !entity.facts.some(
        (candidate) =>
          candidate.key === fact.key && candidate.value === fact.value,
      )
    ) {
      entity.facts.push({
        key: fact.key,
        value: fact.value,
        quote: fact.quote,
        paragraphIds,
      });
    }
  }

  for (const change of delta.stateChanges) {
    const entity = ledger.entities.find(
      (candidate) => candidate.entityId === change.entityId,
    );
    const paragraphIds = validEvidence(change.paragraphIds, paragraphById);
    if (
      !entity ||
      !change.stateId ||
      paragraphIds.length === 0 ||
      !evidenceQuotesMatch(change.evidenceQuotes, paragraphIds, paragraphById)
    )
      continue;
    if (!entity.states.some((state) => state.stateId === change.stateId)) {
      const evidenceSeq = Math.min(
        ...paragraphIds.map((id) => paragraphById.get(id)!.seq),
      );
      entity.states.push({
        stateId: change.stateId,
        label: change.label,
        validFromStoryTime: change.validFromStoryTime,
        validToStoryTime: null,
        validFromSeq: evidenceSeq,
        changes: change.changes,
        paragraphIds,
      });
    }
  }

  for (const reveal of delta.reveals) {
    const entity = ledger.entities.find(
      (candidate) => candidate.entityId === reveal.entityId,
    );
    const paragraphIds = validEvidence(reveal.paragraphIds, paragraphById);
    if (
      !entity ||
      !reveal.what ||
      paragraphIds.length === 0 ||
      !evidenceQuotesMatch(reveal.evidenceQuotes, paragraphIds, paragraphById)
    )
      continue;
    if (!entity.reveals.some((candidate) => candidate.what === reveal.what)) {
      const evidenceSeq = Math.min(
        ...paragraphIds.map((id) => paragraphById.get(id)!.seq),
      );
      entity.reveals.push({
        what: reveal.what,
        seq: evidenceSeq,
        paragraphIds,
      });
    }
  }

  for (const relationship of delta.relationshipChanges) {
    const entity = ledger.entities.find(
      (candidate) => candidate.entityId === relationship.entityId,
    );
    const target = ledger.entities.find(
      (candidate) => candidate.entityId === relationship.toEntityId,
    );
    const paragraphIds = validEvidence(
      relationship.paragraphIds,
      paragraphById,
    );
    if (
      !entity ||
      !target ||
      !relationship.type ||
      paragraphIds.length === 0 ||
      !evidenceQuotesMatch(
        relationship.evidenceQuotes,
        paragraphIds,
        paragraphById,
      )
    )
      continue;
    if (
      !entity.relationships.some(
        (candidate) =>
          candidate.toEntityId === relationship.toEntityId &&
          candidate.type === relationship.type,
      )
    ) {
      const evidenceSeq = Math.min(
        ...paragraphIds.map((id) => paragraphById.get(id)!.seq),
      );
      entity.relationships.push({
        toEntityId: relationship.toEntityId,
        type: relationship.type,
        validFromSeq: evidenceSeq,
        validToSeq: null,
        paragraphIds,
      });
    }
  }

  for (const incoming of delta.events) {
    const paragraphIds = validEvidence(incoming.paragraphIds, paragraphById);
    if (
      !incoming.summary ||
      paragraphIds.length === 0 ||
      !evidenceQuotesMatch(incoming.evidenceQuotes, paragraphIds, paragraphById)
    )
      continue;
    const eventId =
      incoming.eventId ||
      `ev_${String(ledger.events.length + 1).padStart(6, "0")}`;
    if (ledger.events.some((event) => event.eventId === eventId)) continue;
    const evidenceSeqs = paragraphIds.map((id) => paragraphById.get(id)!.seq);
    const knownEntityIds = new Set(
      ledger.entities.map((entity) => entity.entityId),
    );
    const location = incoming.locationId
      ? ledger.entities.find(
          (entity) =>
            entity.entityId === incoming.locationId &&
            entity.type === "location",
        )
      : null;
    ledger.events.push({
      eventId,
      order: ledger.events.length + 1,
      summary: incoming.summary,
      seqStart: Math.min(...evidenceSeqs),
      seqEnd: Math.max(...evidenceSeqs),
      storyTime: incoming.storyTimeHint ?? ledger.events.length + 1,
      participants: unique(
        incoming.participants.filter((id) => knownEntityIds.has(id)),
      ),
      locationId: location?.entityId ?? null,
      objectIds: unique(
        incoming.objectIds.filter((id) =>
          ledger.entities.some(
            (entity) => entity.entityId === id && entity.type === "object",
          ),
        ),
      ),
      kind: incoming.kind,
      paragraphIds,
    });
  }

  for (const conflict of delta.aliasConflicts) {
    if (!conflict.alias) continue;
    ledger.aliasConflicts.push({
      alias: conflict.alias,
      entityIds: unique(conflict.entityIds),
      paragraphIds: validEvidence(conflict.paragraphIds, paragraphById),
    });
  }

  ledger.rollingSynopsis = delta.updatedSynopsis || ledger.rollingSynopsis;
  ledger.processedWindow = window.index;
  ledger.processedUnitIndex =
    window.owned.at(-1)?.unitIndex ?? ledger.processedUnitIndex;
  const completedParagraphs = window.owned.filter(
    (paragraph) =>
      (paragraph.fragmentIndex ?? 0) === (paragraph.fragmentCount ?? 1) - 1,
  );
  ledger.processedThroughSeq =
    completedParagraphs.at(-1)?.seq ?? ledger.processedThroughSeq;
  ledger.coveredParagraphIds = unique([
    ...ledger.coveredParagraphIds,
    ...completedParagraphs.map((paragraph) => paragraph.id),
  ]);
}

async function loadParagraphs(
  bookId: string,
  sourceId: string,
  canonicalHash: string,
): Promise<Paragraph[]> {
  const snapshot = await db
    .collection("books")
    .doc(bookId)
    .collection("textChunks")
    .orderBy("info.index")
    .get();
  const chunks = snapshot.docs
    .map((item) => item.data())
    .filter(
      (data) =>
        data.sourceId === sourceId && data.canonicalHash === canonicalHash,
    );
  const paragraphs = chunks.flatMap((data) =>
    Array.isArray(data.paragraphs) ? data.paragraphs : [],
  ) as Paragraph[];
  paragraphs.sort((left, right) => left.seq - right.seq);
  paragraphs.forEach((paragraph, index) => {
    if (
      paragraph.seq !== index ||
      paragraph.id !== `p${String(index).padStart(6, "0")}`
    ) {
      throw new Error(`Canonical paragraph sequence breaks at index ${index}.`);
    }
  });
  if (paragraphs.length === 0)
    throw new Error("No canonical paragraphs found for job source.");
  return paragraphs;
}

async function saveCheckpoint(
  bookId: string,
  jobId: string,
  ledger: Ledger,
): Promise<string> {
  const storagePath = `books/${bookId}/sources/${ledger.sourceId}/ledger/${jobId}/window-${String(
    ledger.processedWindow + 1,
  ).padStart(5, "0")}.json`;
  await saveJsonCheckpoint(bucket, storagePath, ledger);
  return storagePath;
}

async function persistBookModel(bookId: string, ledger: Ledger): Promise<void> {
  const records = [
    ...ledger.entities.map((entity) => ({
      path: ["books", bookId, "entities", entity.entityId],
      value: {
        ...entity,
        sourceId: ledger.sourceId,
        canonicalHash: ledger.canonicalHash,
        visual: {
          spec: "",
          referenceSheet: { approved: false },
          stateVariants: {},
        },
        status: "draft",
      },
    })),
    ...ledger.events.map((event) => ({
      path: ["books", bookId, "events", event.eventId],
      value: {
        ...event,
        sourceId: ledger.sourceId,
        canonicalHash: ledger.canonicalHash,
      },
    })),
  ];

  for (let offset = 0; offset < records.length; offset += 300) {
    const batch = db.batch();
    for (const record of records.slice(offset, offset + 300)) {
      batch.set(db.doc(record.path.join("/")), record.value);
    }
    await batch.commit();
  }
  await db.doc(`books/${bookId}/derived/ledger`).set({
    sourceId: ledger.sourceId,
    canonicalHash: ledger.canonicalHash,
    processedThroughSeq: ledger.processedThroughSeq,
    paragraphCount: ledger.coveredParagraphIds.length,
    entityCount: ledger.entities.length,
    eventCount: ledger.events.length,
    aliasConflicts: ledger.aliasConflicts,
    filteredParagraphCount: ledger.filteredParagraphIds?.length ?? 0,
    filteredParagraphIds: ledger.filteredParagraphIds ?? [],
    rollingSynopsis: ledger.rollingSynopsis,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function processUnderstandingJob(
  bookId: string,
  jobId: string,
): Promise<void> {
  const jobRef = db.doc(`books/${bookId}/jobs/${jobId}`);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const data = snapshot.data();
    if (!snapshot.exists || !data || !isClaimable(data)) return false;
    transaction.update(jobRef, {
      status: "running_v3",
      attempts: Number(data.attempts ?? 0) + 1,
      startedAt: FieldValue.serverTimestamp(),
      heartbeatAt: FieldValue.serverTimestamp(),
      leaseOwner: workerId,
      workerVersion,
      model: openRouterModel,
      error: null,
    });
    return true;
  });
  if (!claimed) return;
  console.log(`[${workerVersion}] claimed books/${bookId}/jobs/${jobId}`);

  try {
    const jobSnapshot = await jobRef.get();
    const job = jobSnapshot.data();
    if (!job) throw new Error("Claimed job disappeared.");
    const sourceId = asString(job.sourceId);
    const canonicalHash = asString(job.canonicalHash);
    const bookRef = db.doc(`books/${bookId}`);
    const bookSnapshot = await bookRef.get();
    const bookData = bookSnapshot.data();
    if (
      bookData?.activeSourceId !== sourceId ||
      bookData?.canonical?.hash !== canonicalHash
    ) {
      throw new Error("Job source is no longer the active canonical source.");
    }
    const paragraphs = await loadParagraphs(bookId, sourceId, canonicalHash);
    const processingUnits = buildProcessingUnits(paragraphs);
    const paragraphById = new Map(
      paragraphs.map((paragraph) => [paragraph.id, paragraph]),
    );
    const windows = buildWindows(processingUnits);
    const checkpointPath = asString(
      job.checkpoint && typeof job.checkpoint === "object"
        ? (job.checkpoint as Record<string, unknown>).storagePath
        : "",
    );
    const checkpointPrefix = `books/${bookId}/sources/${sourceId}/ledger/${jobId}/`;
    const savedCheckpoint = await loadLatestValidCheckpoint<Ledger>(
      bucket,
      checkpointPrefix,
      checkpointPath || undefined,
    );
    const ledger: Ledger = savedCheckpoint?.value ?? {
      sourceId,
      canonicalHash,
      processedWindow: -1,
      processedUnitIndex: -1,
      processedThroughSeq: -1,
      coveredParagraphIds: [],
      filteredParagraphIds: [],
      filteredWindows: [],
      rollingSynopsis: "",
      entities: [],
      events: [],
      aliasConflicts: [],
    };
    ledger.filteredParagraphIds ??= [];
    ledger.filteredWindows ??= [];
    if (
      ledger.sourceId !== sourceId ||
      ledger.canonicalHash !== canonicalHash
    ) {
      throw new Error("Checkpoint source does not match queued job source.");
    }
    const resumeUnitIndex =
      ledger.processedUnitIndex ??
      processingUnits.reduce(
        (last, unit) =>
          unit.seq <= ledger.processedThroughSeq
            ? (unit.unitIndex ?? last)
            : last,
        -1,
      );
    let costUsd = asNumber(job.costUsd);

    const remainingWindows = windows.filter(
      (window) => (window.owned.at(-1)?.unitIndex ?? -1) > resumeUnitIndex,
    );
    const saveProgress = async (windowIndex: number, model: string) => {
      const checkpointPath = await saveCheckpoint(bookId, jobId, ledger);
      await jobRef.update({
        progress: {
          done: ledger.coveredParagraphIds.length,
          total: paragraphs.length,
        },
        checkpoint: { storagePath: checkpointPath, windowIndex },
        costUsd,
        model,
        heartbeatAt: FieldValue.serverTimestamp(),
        leaseOwner: workerId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.doc(`books/${bookId}/derived/ledger`).set({
        sourceId,
        canonicalHash,
        checkpointPath,
        processedThroughSeq: ledger.processedThroughSeq,
        paragraphCount: ledger.coveredParagraphIds.length,
        entityCount: ledger.entities.length,
        eventCount: ledger.events.length,
        filteredParagraphCount: ledger.filteredParagraphIds?.length ?? 0,
        filteredParagraphIds: ledger.filteredParagraphIds ?? [],
        rollingSynopsis: ledger.rollingSynopsis,
        updatedAt: FieldValue.serverTimestamp(),
      });
    };
    const markWindowFiltered = async (window: Window, model: string) => {
      const completedParagraphs = window.owned.filter(
        (paragraph) =>
          (paragraph.fragmentIndex ?? 0) === (paragraph.fragmentCount ?? 1) - 1,
      );
      ledger.processedWindow = window.index;
      ledger.processedUnitIndex =
        window.owned.at(-1)?.unitIndex ?? ledger.processedUnitIndex;
      ledger.processedThroughSeq =
        completedParagraphs.at(-1)?.seq ?? ledger.processedThroughSeq;
      ledger.coveredParagraphIds = unique([
        ...ledger.coveredParagraphIds,
        ...completedParagraphs.map((paragraph) => paragraph.id),
      ]);
      ledger.filteredParagraphIds = unique([
        ...(ledger.filteredParagraphIds ?? []),
        ...window.owned.map((paragraph) => paragraph.id),
      ]);
      if (!ledger.filteredWindows?.includes(window.index)) {
        ledger.filteredWindows = [...(ledger.filteredWindows ?? []), window.index];
      }
      await saveProgress(window.index, model);
    };
    const processOneWindow = async (
      window: Window,
      depth = 0,
    ): Promise<string> => {
      try {
        const { delta, cost, model } = await callUnderstandingModel(
          ledger,
          window,
        );
        mergeDelta(ledger, delta, window, paragraphById);
        costUsd += cost;
        await saveProgress(window.index, model);
        return model;
      } catch (error) {
        if (isLengthTruncation(error) && window.owned.length > 1 && depth < 5) {
          const ownedChars = window.owned.reduce(
            (total, paragraph) => total + paragraph.text.length,
            0,
          );
          console.warn(
            `[${workerVersion}] length truncation on window ${window.index} ` +
              `(${window.owned.length} paras/${ownedChars} chars, depth ${depth}). ` +
              `Splitting in half and retrying.`,
          );
          const [first, second] = splitWindow(window);
          const firstModel = await processOneWindow(first, depth + 1);
          const freshJob = await jobRef.get();
          if (freshJob.data()?.status === "cancelled") return firstModel;
          return await processOneWindow(second, depth + 1);
        }
        if (isContentFilterError(error)) {
          if (window.owned.length > 1 && depth < 5) {
            console.warn(
              `[${workerVersion}] content filter on window ${window.index} ` +
                `(${window.owned.length} paras, depth ${depth}). ` +
                `Splitting to isolate the flagged passage.`,
            );
            const [first, second] = splitWindow(window);
            const firstModel = await processOneWindow(first, depth + 1);
            const freshJob = await jobRef.get();
            if (freshJob.data()?.status === "cancelled") return firstModel;
            return await processOneWindow(second, depth + 1);
          }
          const ids = window.owned.map((paragraph) => paragraph.id).join(", ");
          console.warn(
            `[${workerVersion}] content filter on window ${window.index} ` +
              `(singletons: ${ids}). Skipping with empty delta and continuing.`,
          );
          await markWindowFiltered(window, "content-filter-skipped");
          return "content-filter-skipped";
        }
        throw error;
      }
    };
    for (const candidate of remainingWindows) {
      const window = {
        ...candidate,
        owned: candidate.owned.filter(
          (paragraph) => (paragraph.unitIndex ?? -1) > resumeUnitIndex,
        ),
      };
      if (window.owned.length === 0) continue;
      const freshJob = await jobRef.get();
      if (freshJob.data()?.status === "cancelled") return;
      await processOneWindow(window);
    }

    if (ledger.coveredParagraphIds.length !== paragraphs.length) {
      throw new Error(
        `Coverage check failed: processed ${ledger.coveredParagraphIds.length} of ${paragraphs.length} paragraphs.`,
      );
    }
    const currentBook = (await bookRef.get()).data();
    if (
      currentBook?.activeSourceId !== sourceId ||
      currentBook?.canonical?.hash !== canonicalHash
    ) {
      throw new Error("Canonical source changed before Book Model promotion.");
    }
    await persistBookModel(bookId, ledger);
    const filteredCount = ledger.filteredParagraphIds?.length ?? 0;
    const warning =
      filteredCount > 0
        ? `Completed with ${filteredCount} of ${paragraphs.length} paragraphs skipped: provider content filter flagged them. Book Model covers the rest; skipped IDs: ${(ledger.filteredParagraphIds ?? []).slice(0, 20).join(", ")}${filteredCount > 20 ? "…" : ""}`
        : null;
    if (warning) console.warn(`[${workerVersion}] ${warning}`);
    await jobRef.update({
      status: "completed",
      progress: { done: paragraphs.length, total: paragraphs.length },
      costUsd,
      error: null,
      warning,
      filteredParagraphCount: filteredCount,
      filteredParagraphIds: ledger.filteredParagraphIds ?? [],
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await bookRef.update({
      pipeline: {
        stage: "book_model",
        stageStatus: "review",
        lastJobId: jobId,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown worker failure.";
    await jobRef.update({
      status: "failed",
      error: message.slice(0, 4_000),
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.doc(`books/${bookId}`).update({
      pipeline: {
        stage: "book_model",
        stageStatus: "failed",
        lastJobId: jobId,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function findAndProcessJob(): Promise<boolean> {
  const books = await db.collection("books").get();
  for (const book of books.docs) {
    const jobs = await book.ref.collection("jobs").get();
    const queued = jobs.docs.find((item) => isClaimable(item.data()));
    if (!queued) continue;
    await processUnderstandingJob(book.id, queued.id);
    return true;
  }
  return false;
}

function isClaimable(data: Record<string, unknown>): boolean {
  if (data.status === "queued_v3") return true;
  if (data.status !== "running_v3") return false;
  const heartbeat = data.heartbeatAt as { toMillis?: () => number } | undefined;
  const heartbeatMs = heartbeat?.toMillis?.() ?? 0;
  return Date.now() - heartbeatMs > staleLeaseMs;
}

async function main(): Promise<void> {
  console.log(
    `[${workerVersion}] models: ${openRouterModels.join(" -> ")} | max_tokens: ${openRouterMaxTokens} | windows: ${windowMaxParagraphs} paras/${windowMaxCharacters} chars`,
  );
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  while (!stopping) {
    const processed = await findAndProcessJob();
    if (!processed)
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

await main();
