import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { understandingResponseFormat } from './understanding-schema.mts';

type Paragraph = {
  id: string;
  seq: number;
  page: number;
  chapterId: string;
  text: string;
  hash: string;
  kind: string;
  isStory: boolean;
};

type Evidence = { paragraphIds: string[] };

type Entity = {
  entityId: string;
  type: 'character' | 'location' | 'object' | 'group';
  canonicalName: string;
  aliases: ({ name: string; firstSeq: number } & Evidence)[];
  importance: 'major' | 'supporting' | 'minor';
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
  processedThroughSeq: number;
  coveredParagraphIds: string[];
  rollingSynopsis: string;
  entities: Entity[];
  events: Event[];
  aliasConflicts: { alias: string; entityIds: string[]; paragraphIds: string[] }[];
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
    type: Entity['type'];
    canonicalName: string;
    aliases: ({ name: string; firstSeq: number } & Evidence)[];
    importance: Entity['importance'];
    firstSeq: number;
    lastSeq: number;
  } & Evidence)[];
  facts: ({ entityId: string; key: string; value: string; quote: string } & Evidence)[];
  events: (Omit<Event, 'order' | 'storyTime'> & {
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
  reveals: ({ entityId: string; what: string; seq: number; evidenceQuotes: string[] } & Evidence)[];
  relationshipChanges: ({
    entityId: string;
    toEntityId: string;
    type: string;
    validFromSeq: number;
    evidenceQuotes: string[];
  } & Evidence)[];
  aliasConflicts: { alias: string; entityIds: string[]; paragraphIds: string[] }[];
  updatedSynopsis: string;
};

const env = process.env;
const projectId = env.FIREBASE_PROJECT_ID ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!projectId) throw new Error('Missing FIREBASE_PROJECT_ID.');
if (!storageBucket) throw new Error('Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.');
if (!env.OPENROUTER_API_KEY) throw new Error('Missing OPENROUTER_API_KEY.');

const credentialPath = env.GOOGLE_APPLICATION_CREDENTIALS
  ? isAbsolute(env.GOOGLE_APPLICATION_CREDENTIALS)
    ? env.GOOGLE_APPLICATION_CREDENTIALS
    : resolve(process.cwd(), env.GOOGLE_APPLICATION_CREDENTIALS)
  : null;
const inlinePrivateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
const serviceAccountEmail =
  env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL ??
  env.FIREBASE_CLIENT_EMAIL ??
  `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com`;
const credential =
  credentialPath && existsSync(credentialPath)
    ? applicationDefault()
    : inlinePrivateKey
      ? cert({ projectId, clientEmail: serviceAccountEmail, privateKey: inlinePrivateKey })
      : null;
if (!credential) {
  throw new Error(
    'Firebase Admin credentials unavailable. Provide an existing GOOGLE_APPLICATION_CREDENTIALS file or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.'
  );
}

const app = initializeApp(
  {
    credential,
    projectId,
    storageBucket,
  },
  'book-pipeline-worker'
);
const db = getFirestore(app);
const bucket = getStorage(app).bucket(storageBucket);
const pollIntervalMs = Math.max(2_000, Number(env.POLL_INTERVAL_MS ?? 10_000));
const openRouterModel = env.OPENROUTER_MODEL ?? 'openai/gpt-4.1-mini';
const workerId = crypto.randomUUID();
const staleLeaseMs = 2 * 60 * 1000;
let stopping = false;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string');
}

function entityType(value: unknown): Entity['type'] {
  return value === 'location' || value === 'object' || value === 'group' ? value : 'character';
}

function importance(value: unknown): Entity['importance'] {
  return value === 'major' || value === 'minor' ? value : 'supporting';
}

function safeId(value: unknown, fallbackPrefix: string): string {
  const normalized = asString(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return normalized || `${fallbackPrefix}_${crypto.randomUUID().slice(0, 12)}`;
}

function stringRecord(value: unknown): Record<string, string> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const row = item as Record<string, unknown>;
        return typeof row.key === 'string' && typeof row.value === 'string'
          ? [[row.key, row.value]]
          : [];
      })
    );
  }
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
      typeof entry === 'string' ? [[key, entry]] : []
    )
  );
}

function normalizeDelta(value: unknown): Delta {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    newEntities: asArray(data.newEntities).map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        entityId: safeId(row.entityId, 'entity'),
        type: entityType(row.type),
        canonicalName: asString(row.canonicalName),
        aliases: asArray(row.aliases).map((alias) => {
          const entry = alias && typeof alias === 'object' ? (alias as Record<string, unknown>) : {};
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
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        entityId: safeId(row.entityId, 'entity'),
        key: asString(row.key),
        value: asString(row.value),
        quote: asString(row.quote),
        paragraphIds: strings(row.paragraphIds),
      };
    }),
    events: asArray(data.events).map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        eventId: safeId(row.eventId, 'event'),
        summary: asString(row.summary),
        seqStart: asNumber(row.seqStart),
        seqEnd: asNumber(row.seqEnd),
        storyTimeHint: asNumber(row.storyTimeHint),
        participants: strings(row.participants),
        locationId: typeof row.locationId === 'string' ? row.locationId : null,
        objectIds: strings(row.objectIds),
        kind: asString(row.kind, 'event'),
        paragraphIds: strings(row.paragraphIds),
        evidenceQuotes: strings(row.evidenceQuotes),
      };
    }),
    stateChanges: asArray(data.stateChanges).map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        entityId: safeId(row.entityId, 'entity'),
        stateId: safeId(row.stateId, 'state'),
        label: asString(row.label),
        validFromStoryTime: asNumber(row.validFromStoryTime),
        validFromSeq: asNumber(row.validFromSeq),
        changes: stringRecord(row.changes),
        paragraphIds: strings(row.paragraphIds),
        evidenceQuotes: strings(row.evidenceQuotes),
      };
    }),
    reveals: asArray(data.reveals).map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        entityId: safeId(row.entityId, 'entity'),
        what: asString(row.what),
        seq: asNumber(row.seq),
        paragraphIds: strings(row.paragraphIds),
        evidenceQuotes: strings(row.evidenceQuotes),
      };
    }),
    relationshipChanges: asArray(data.relationshipChanges).map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        entityId: safeId(row.entityId, 'entity'),
        toEntityId: safeId(row.toEntityId, 'entity'),
        type: asString(row.type),
        validFromSeq: asNumber(row.validFromSeq),
        paragraphIds: strings(row.paragraphIds),
        evidenceQuotes: strings(row.evidenceQuotes),
      };
    }),
    aliasConflicts: asArray(data.aliasConflicts).map((item) => {
      const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
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
  maxParagraphs = 32,
  maxCharacters = 12_000,
  overlap = 5
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

function selectLedgerContext(ledger: Ledger, window: Window) {
  const source = window.owned.map((paragraph) => paragraph.text.toLowerCase()).join('\n');
  const earliestSeq = window.contextBefore[0]?.seq ?? window.owned[0]?.seq ?? 0;
  const entities = ledger.entities.filter(
    (entity) =>
      entity.lastSeq >= earliestSeq - 180 ||
      source.includes(entity.canonicalName.toLowerCase()) ||
      entity.aliases.some((alias) => source.includes(alias.name.toLowerCase()))
  );
  return {
    aliases: ledger.entities.flatMap((entity) => [
      { name: entity.canonicalName, entityId: entity.entityId },
      ...entity.aliases.map((alias) => ({ name: alias.name, entityId: entity.entityId })),
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

function paragraphText(paragraph: Paragraph, role: 'context' | 'owned'): string {
  return `[${paragraph.id} seq=${paragraph.seq} page=${paragraph.page} ${role}] ${paragraph.text}`;
}

async function callUnderstandingModel(ledger: Ledger, window: Window): Promise<{ delta: Delta; cost: number }> {
  const system = `You extract a faithful Book Model from supplied source paragraphs.
Return JSON only. Use only claims supported by supplied paragraphs. Never use outside knowledge.
Every new entity, fact, event, state change, reveal, relationship, and alias needs paragraphIds.
Every fact needs quote. Every event, state change, reveal, and relationship needs evidenceQuotes.
All evidence quotes must be short exact substrings copied from cited paragraphs.
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
    contextBefore: window.contextBefore.map((paragraph) => paragraphText(paragraph, 'context')),
    ownedParagraphs: window.owned.map((paragraph) => paragraphText(paragraph, 'owned')),
    contextAfter: window.contextAfter.map((paragraph) => paragraphText(paragraph, 'context')),
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: openRouterModel,
          temperature: 0,
          max_tokens: 8_000,
          response_format: understandingResponseFormat,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}: ${await response.text()}`);
      const payload = (await response.json()) as {
        choices?: { finish_reason?: string; message?: { content?: string } }[];
        usage?: { cost?: number };
      };
      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      if (!content) throw new Error('OpenRouter returned no message content.');
      if (choice?.finish_reason && choice.finish_reason !== 'stop') {
        throw new Error(`OpenRouter response incomplete: ${choice.finish_reason}.`);
      }
      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON.';
        throw new Error(`Invalid structured AI response: ${message}`);
      }
      return {
        delta: normalizeDelta(parsed),
        cost: asNumber(payload.usage?.cost),
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI request failed.');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function validEvidence(ids: string[], paragraphById: Map<string, Paragraph>): string[] {
  return unique(ids.filter((id) => paragraphById.has(id)));
}

function quoteMatches(quote: string, ids: string[], paragraphById: Map<string, Paragraph>): boolean {
  const needle = quote.trim();
  return Boolean(needle) && ids.some((id) => paragraphById.get(id)?.text.includes(needle));
}

function evidenceQuotesMatch(
  quotes: string[],
  ids: string[],
  paragraphById: Map<string, Paragraph>
): boolean {
  return quotes.length > 0 && quotes.every((quote) => quoteMatches(quote, ids, paragraphById));
}

function mergeDelta(ledger: Ledger, delta: Delta, window: Window, paragraphById: Map<string, Paragraph>): void {
  for (const incoming of delta.newEntities) {
    if (!incoming.entityId || !incoming.canonicalName) continue;
    const evidenceIds = validEvidence(incoming.paragraphIds, paragraphById);
    const nameCandidates = [incoming.canonicalName, ...incoming.aliases.map((alias) => alias.name)]
      .filter(Boolean)
      .map((name) => name.toLowerCase());
    const nameAppears = evidenceIds.some((id) => {
      const text = paragraphById.get(id)?.text.toLowerCase() ?? '';
      return nameCandidates.some((name) => text.includes(name));
    });
    if (evidenceIds.length === 0 || !nameAppears) continue;
    const evidenceSeqs = evidenceIds.map((id) => paragraphById.get(id)!.seq);
    const firstEvidenceSeq = Math.min(...evidenceSeqs);
    const lastEvidenceSeq = Math.max(...evidenceSeqs);
    let entity = ledger.entities.find((candidate) => candidate.entityId === incoming.entityId);
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
      if (!entity.aliases.some((candidate) => candidate.name.toLowerCase() === alias.name.toLowerCase())) {
        entity.aliases.push({ ...alias, paragraphIds });
      }
    }
  }

  for (const fact of delta.facts) {
    const entity = ledger.entities.find((candidate) => candidate.entityId === fact.entityId);
    const paragraphIds = validEvidence(fact.paragraphIds, paragraphById);
    if (!entity || !fact.key || !fact.value || !quoteMatches(fact.quote, paragraphIds, paragraphById)) continue;
    if (!entity.facts.some((candidate) => candidate.key === fact.key && candidate.value === fact.value)) {
      entity.facts.push({
        key: fact.key,
        value: fact.value,
        quote: fact.quote,
        paragraphIds,
      });
    }
  }

  for (const change of delta.stateChanges) {
    const entity = ledger.entities.find((candidate) => candidate.entityId === change.entityId);
    const paragraphIds = validEvidence(change.paragraphIds, paragraphById);
    if (
      !entity ||
      !change.stateId ||
      paragraphIds.length === 0 ||
      !evidenceQuotesMatch(change.evidenceQuotes, paragraphIds, paragraphById)
    ) continue;
    if (!entity.states.some((state) => state.stateId === change.stateId)) {
      const evidenceSeq = Math.min(...paragraphIds.map((id) => paragraphById.get(id)!.seq));
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
    const entity = ledger.entities.find((candidate) => candidate.entityId === reveal.entityId);
    const paragraphIds = validEvidence(reveal.paragraphIds, paragraphById);
    if (
      !entity ||
      !reveal.what ||
      paragraphIds.length === 0 ||
      !evidenceQuotesMatch(reveal.evidenceQuotes, paragraphIds, paragraphById)
    ) continue;
    if (!entity.reveals.some((candidate) => candidate.what === reveal.what)) {
      const evidenceSeq = Math.min(...paragraphIds.map((id) => paragraphById.get(id)!.seq));
      entity.reveals.push({ what: reveal.what, seq: evidenceSeq, paragraphIds });
    }
  }

  for (const relationship of delta.relationshipChanges) {
    const entity = ledger.entities.find((candidate) => candidate.entityId === relationship.entityId);
    const target = ledger.entities.find((candidate) => candidate.entityId === relationship.toEntityId);
    const paragraphIds = validEvidence(relationship.paragraphIds, paragraphById);
    if (
      !entity ||
      !target ||
      !relationship.type ||
      paragraphIds.length === 0 ||
      !evidenceQuotesMatch(relationship.evidenceQuotes, paragraphIds, paragraphById)
    ) continue;
    if (
      !entity.relationships.some(
        (candidate) =>
          candidate.toEntityId === relationship.toEntityId && candidate.type === relationship.type
      )
    ) {
      const evidenceSeq = Math.min(...paragraphIds.map((id) => paragraphById.get(id)!.seq));
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
    ) continue;
    const eventId = incoming.eventId || `ev_${String(ledger.events.length + 1).padStart(6, '0')}`;
    if (ledger.events.some((event) => event.eventId === eventId)) continue;
    const evidenceSeqs = paragraphIds.map((id) => paragraphById.get(id)!.seq);
    const knownEntityIds = new Set(ledger.entities.map((entity) => entity.entityId));
    const location = incoming.locationId
      ? ledger.entities.find(
          (entity) => entity.entityId === incoming.locationId && entity.type === 'location'
        )
      : null;
    ledger.events.push({
      eventId,
      order: ledger.events.length + 1,
      summary: incoming.summary,
      seqStart: Math.min(...evidenceSeqs),
      seqEnd: Math.max(...evidenceSeqs),
      storyTime: incoming.storyTimeHint ?? ledger.events.length + 1,
      participants: unique(incoming.participants.filter((id) => knownEntityIds.has(id))),
      locationId: location?.entityId ?? null,
      objectIds: unique(
        incoming.objectIds.filter((id) =>
          ledger.entities.some((entity) => entity.entityId === id && entity.type === 'object')
        )
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
  ledger.processedThroughSeq = window.owned.at(-1)?.seq ?? ledger.processedThroughSeq;
  ledger.coveredParagraphIds = unique([
    ...ledger.coveredParagraphIds,
    ...window.owned.map((paragraph) => paragraph.id),
  ]);
}

async function loadParagraphs(bookId: string, sourceId: string, canonicalHash: string): Promise<Paragraph[]> {
  const snapshot = await db
    .collection('books')
    .doc(bookId)
    .collection('textChunks')
    .orderBy('info.index')
    .get();
  const chunks = snapshot.docs
    .map((item) => item.data())
    .filter((data) => data.sourceId === sourceId && data.canonicalHash === canonicalHash);
  const paragraphs = chunks.flatMap((data) => (Array.isArray(data.paragraphs) ? data.paragraphs : [])) as Paragraph[];
  paragraphs.sort((left, right) => left.seq - right.seq);
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.seq !== index || paragraph.id !== `p${String(index).padStart(6, '0')}`) {
      throw new Error(`Canonical paragraph sequence breaks at index ${index}.`);
    }
  });
  if (paragraphs.length === 0) throw new Error('No canonical paragraphs found for job source.');
  return paragraphs;
}

async function saveCheckpoint(bookId: string, jobId: string, ledger: Ledger): Promise<string> {
  const storagePath = `books/${bookId}/sources/${ledger.sourceId}/ledger/${jobId}/window-${String(
    ledger.processedWindow + 1
  ).padStart(5, '0')}.json`;
  await bucket.file(storagePath).save(JSON.stringify(ledger), {
    contentType: 'application/json; charset=utf-8',
    metadata: { cacheControl: 'private, max-age=31536000, immutable' },
    resumable: false,
  });
  return storagePath;
}

async function persistBookModel(bookId: string, ledger: Ledger): Promise<void> {
  const records = [
    ...ledger.entities.map((entity) => ({
      path: ['books', bookId, 'entities', entity.entityId],
      value: {
        ...entity,
        sourceId: ledger.sourceId,
        canonicalHash: ledger.canonicalHash,
        visual: {
          spec: '',
          referenceSheet: { approved: false },
          stateVariants: {},
        },
        status: 'draft',
      },
    })),
    ...ledger.events.map((event) => ({
      path: ['books', bookId, 'events', event.eventId],
      value: { ...event, sourceId: ledger.sourceId, canonicalHash: ledger.canonicalHash },
    })),
  ];

  for (let offset = 0; offset < records.length; offset += 300) {
    const batch = db.batch();
    for (const record of records.slice(offset, offset + 300)) {
      batch.set(db.doc(record.path.join('/')), record.value);
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
    rollingSynopsis: ledger.rollingSynopsis,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function processUnderstandingJob(bookId: string, jobId: string): Promise<void> {
  const jobRef = db.doc(`books/${bookId}/jobs/${jobId}`);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const data = snapshot.data();
    if (!snapshot.exists || !data || !isClaimable(data)) return false;
    transaction.update(jobRef, {
      status: 'running',
      attempts: Number(data.attempts ?? 0) + 1,
      startedAt: FieldValue.serverTimestamp(),
      heartbeatAt: FieldValue.serverTimestamp(),
      leaseOwner: workerId,
      error: null,
    });
    return true;
  });
  if (!claimed) return;

  try {
    const jobSnapshot = await jobRef.get();
    const job = jobSnapshot.data();
    if (!job) throw new Error('Claimed job disappeared.');
    const sourceId = asString(job.sourceId);
    const canonicalHash = asString(job.canonicalHash);
    const bookRef = db.doc(`books/${bookId}`);
    const bookSnapshot = await bookRef.get();
    const bookData = bookSnapshot.data();
    if (
      bookData?.activeSourceId !== sourceId ||
      bookData?.canonical?.hash !== canonicalHash
    ) {
      throw new Error('Job source is no longer the active canonical source.');
    }
    const paragraphs = await loadParagraphs(bookId, sourceId, canonicalHash);
    const paragraphById = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph]));
    const windows = buildWindows(paragraphs);
    const checkpointPath = asString(
      job.checkpoint && typeof job.checkpoint === 'object'
        ? (job.checkpoint as Record<string, unknown>).storagePath
        : ''
    );
    const ledger: Ledger = checkpointPath
      ? JSON.parse(
          (await bucket.file(checkpointPath).download())[0].toString('utf8')
        ) as Ledger
      : {
          sourceId,
          canonicalHash,
          processedWindow: -1,
          processedThroughSeq: -1,
          coveredParagraphIds: [],
          rollingSynopsis: '',
          entities: [],
          events: [],
          aliasConflicts: [],
        };
    if (ledger.sourceId !== sourceId || ledger.canonicalHash !== canonicalHash) {
      throw new Error('Checkpoint source does not match queued job source.');
    }
    let costUsd = asNumber(job.costUsd);

    const remainingWindows = windows.filter(
      (window) => (window.owned.at(-1)?.seq ?? -1) > ledger.processedThroughSeq
    );
    for (const candidate of remainingWindows) {
      const window = {
        ...candidate,
        owned: candidate.owned.filter((paragraph) => paragraph.seq > ledger.processedThroughSeq),
      };
      if (window.owned.length === 0) continue;
      const freshJob = await jobRef.get();
      if (freshJob.data()?.status === 'cancelled') return;
      const { delta, cost } = await callUnderstandingModel(ledger, window);
      mergeDelta(ledger, delta, window, paragraphById);
      costUsd += cost;
      const checkpointPath = await saveCheckpoint(bookId, jobId, ledger);
      await jobRef.update({
        progress: { done: ledger.coveredParagraphIds.length, total: paragraphs.length },
        checkpoint: { storagePath: checkpointPath, windowIndex: window.index },
        costUsd,
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
        rollingSynopsis: ledger.rollingSynopsis,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (ledger.coveredParagraphIds.length !== paragraphs.length) {
      throw new Error(
        `Coverage check failed: processed ${ledger.coveredParagraphIds.length} of ${paragraphs.length} paragraphs.`
      );
    }
    const currentBook = (await bookRef.get()).data();
    if (
      currentBook?.activeSourceId !== sourceId ||
      currentBook?.canonical?.hash !== canonicalHash
    ) {
      throw new Error('Canonical source changed before Book Model promotion.');
    }
    await persistBookModel(bookId, ledger);
    await jobRef.update({
      status: 'completed',
      progress: { done: paragraphs.length, total: paragraphs.length },
      costUsd,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await bookRef.update({
      pipeline: {
        stage: 'book_model',
        stageStatus: 'review',
        lastJobId: jobId,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker failure.';
    await jobRef.update({
      status: 'failed',
      error: message.slice(0, 4_000),
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.doc(`books/${bookId}`).update({
      pipeline: {
        stage: 'book_model',
        stageStatus: 'failed',
        lastJobId: jobId,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function findAndProcessJob(): Promise<boolean> {
  const books = await db.collection('books').get();
  for (const book of books.docs) {
    const jobs = await book.ref.collection('jobs').get();
    const queued = jobs.docs.find((item) => isClaimable(item.data()));
    if (!queued) continue;
    await processUnderstandingJob(book.id, queued.id);
    return true;
  }
  return false;
}

function isClaimable(data: Record<string, unknown>): boolean {
  if (data.status === 'queued') return true;
  if (data.status !== 'running') return false;
  const heartbeat = data.heartbeatAt as { toMillis?: () => number } | undefined;
  const heartbeatMs = heartbeat?.toMillis?.() ?? 0;
  return Date.now() - heartbeatMs > staleLeaseMs;
}

async function main(): Promise<void> {
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });

  while (!stopping) {
    const processed = await findAndProcessJob();
    if (!processed) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

await main();
