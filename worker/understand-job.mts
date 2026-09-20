import { FieldValue } from "firebase-admin/firestore";
import { loadLatestValidCheckpoint } from "./checkpoint-store.mts";
import { asNumber, asString, normalizeDelta } from "./coerce.mts";
import {
  bucket,
  db,
  maxWindowSplitDepth,
  openRouterModel,
  openRouterModels,
  repairRounds,
  workerId,
  workerVersion,
} from "./config.mts";
import { runConsolidation } from "./consolidate.mts";
import { computeCoverage, stubMissingAnnotations } from "./coverage.mts";
import { unique } from "./evidence.mts";
import { advanceProgress, mergeDelta } from "./merge.mts";
import { callJsonModel, isContentFilterError, isLengthTruncation } from "./openrouter.mts";
import { ledgerSummary, loadParagraphs, persistBookModel, saveCheckpoint } from "./persist.mts";
import { extractionSystemPrompt, extractionUserPayload } from "./prompts.mts";
import { emptyLedger, upgradeLedger, type Chapter, type Ledger, type Paragraph, type Window } from "./types.mts";
import { buildProcessingUnits, buildRepairWindows, buildWindows, splitWindow } from "./windows.mts";

export function isClaimable(data: Record<string, unknown>, staleLeaseMs: number): boolean {
  if (data.status === "queued_v3") return true;
  if (data.status !== "running_v3") return false;
  const heartbeat = data.heartbeatAt as { toMillis?: () => number } | undefined;
  const heartbeatMs = heartbeat?.toMillis?.() ?? 0;
  return Date.now() - heartbeatMs > staleLeaseMs;
}

function log(message: string): void {
  console.log(`[${workerVersion}] ${message}`);
}

function warn(message: string): void {
  console.warn(`[${workerVersion}] ${message}`);
}

function ownedChars(window: Window): number {
  return window.owned.reduce((total, paragraph) => total + paragraph.text.length, 0);
}

function chaptersOf(paragraphs: Paragraph[], bookChapters: unknown): Chapter[] {
  const fromBook = Array.isArray(bookChapters)
    ? (bookChapters as Record<string, unknown>[]).map((chapter) => ({
        id: asString(chapter.id),
        title: asString(chapter.title),
        seqStart: asNumber(chapter.seqStart),
        seqEnd: asNumber(chapter.seqEnd),
      }))
    : [];
  if (fromBook.length > 0 && fromBook.every((chapter) => chapter.id)) return fromBook;
  const ids = unique(paragraphs.map((paragraph) => paragraph.chapterId));
  return ids.map((id) => {
    const owned = paragraphs.filter((paragraph) => paragraph.chapterId === id);
    const heading = owned.find((paragraph) => paragraph.kind === "heading");
    return {
      id,
      title: heading?.text ?? id,
      seqStart: owned[0]!.seq,
      seqEnd: owned.at(-1)!.seq,
    };
  });
}

export async function processUnderstandingJob(
  bookId: string,
  jobId: string,
  staleLeaseMs: number,
): Promise<void> {
  const jobRef = db.doc(`books/${bookId}/jobs/${jobId}`);
  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const data = snapshot.data();
    if (!snapshot.exists || !data || !isClaimable(data, staleLeaseMs)) return false;
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
  log(`claimed books/${bookId}/jobs/${jobId}`);

  try {
    const job = (await jobRef.get()).data();
    if (!job) throw new Error("Claimed job disappeared.");
    const sourceId = asString(job.sourceId);
    const canonicalHash = asString(job.canonicalHash);
    const bookRef = db.doc(`books/${bookId}`);
    const bookData = (await bookRef.get()).data();
    if (bookData?.activeSourceId !== sourceId || bookData?.canonical?.hash !== canonicalHash) {
      throw new Error("Job source is no longer the active canonical source.");
    }
    const paragraphs = await loadParagraphs(
      bookId,
      sourceId,
      canonicalHash,
      asString(bookData?.canonical?.storagePath),
      asString(bookData?.canonical?.textHash),
    );
    const chapters = chaptersOf(paragraphs, bookData?.structure?.chapters);
    const units = buildProcessingUnits(paragraphs);
    const paragraphById = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph]));
    const windows = buildWindows(units);

    const checkpointPath = asString(
      job.checkpoint && typeof job.checkpoint === "object"
        ? (job.checkpoint as Record<string, unknown>).storagePath
        : "",
    );
    const saved = await loadLatestValidCheckpoint<Partial<Ledger> & Pick<Ledger, "sourceId" | "canonicalHash">>(
      bucket,
      `books/${bookId}/sources/${sourceId}/ledger/${jobId}/`,
      checkpointPath || undefined,
    );
    const ledger: Ledger = saved ? upgradeLedger(saved.value) : emptyLedger(sourceId, canonicalHash);
    if (ledger.sourceId !== sourceId || ledger.canonicalHash !== canonicalHash) {
      throw new Error("Checkpoint source does not match queued job source.");
    }
    let checkpointCounter = asNumber(job.checkpointCounter);
    let costUsd = asNumber(job.costUsd);
    let lastModel = openRouterModel;

    const saveProgress = async (label: string) => {
      checkpointCounter += 1;
      const storagePath = await saveCheckpoint(bookId, jobId, ledger, label, checkpointCounter);
      const done =
        ledger.phase === "extract" ? ledger.coveredParagraphIds.length : paragraphs.length;
      await jobRef.update({
        progress: { done, total: paragraphs.length },
        phase: ledger.phase,
        checkpoint: { storagePath, windowIndex: ledger.processedWindow },
        checkpointCounter,
        costUsd,
        model: lastModel,
        heartbeatAt: FieldValue.serverTimestamp(),
        leaseOwner: workerId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.doc(`books/${bookId}/derived/ledger`).set(ledgerSummary(ledger, { checkpointPath: storagePath }));
    };
    const cancelled = async () => (await jobRef.get()).data()?.status === "cancelled";

    const extractWindow = async (window: Window, repair: boolean, depth = 0): Promise<void> => {
      const label = `${repair ? "repair" : "window"} ${window.index} (${window.owned.length} paras/${ownedChars(window)} chars)`;
      try {
        const result = await callJsonModel({
          system: extractionSystemPrompt,
          user: extractionUserPayload(ledger, window, repair),
          models: openRouterModels,
          label,
        });
        ledger.diagnostics.modelCalls += 1;
        costUsd += result.cost;
        lastModel = result.model;
        const stats = mergeDelta(ledger, normalizeDelta(result.parsed), window, paragraphById);
        if (stats.dropped > 0 || stats.unverified > 0) {
          log(`${label}: dropped ${stats.dropped}, unverified ${stats.unverified}, remapped ${stats.remapped}`);
        }
      } catch (error) {
        const splittable = window.owned.length > 1 && depth < maxWindowSplitDepth;
        if (isLengthTruncation(error) && splittable) {
          warn(`length truncation on ${label}, depth ${depth}. Splitting in half.`);
          const [first, second] = splitWindow(window);
          await extractWindow(first, repair, depth + 1);
          if (await cancelled()) return;
          await extractWindow(second, repair, depth + 1);
          return;
        }
        if (isContentFilterError(error)) {
          if (splittable) {
            warn(`content filter on ${label}, depth ${depth}. Splitting to isolate the flagged passage.`);
            const [first, second] = splitWindow(window);
            await extractWindow(first, repair, depth + 1);
            if (await cancelled()) return;
            await extractWindow(second, repair, depth + 1);
            return;
          }
          const ids = window.owned.map((paragraph) => paragraph.id);
          warn(`content filter on ${label} (singletons: ${ids.join(", ")}). Skipping.`);
          ledger.filteredParagraphIds = unique([...ledger.filteredParagraphIds, ...ids]);
          if (!ledger.filteredWindows.includes(window.index)) ledger.filteredWindows.push(window.index);
          lastModel = "content-filter-skipped";
          return;
        }
        throw error;
      }
    };

    if (ledger.phase === "extract") {
      const resumeUnitIndex = ledger.processedUnitIndex;
      for (const candidate of windows) {
        const window = {
          ...candidate,
          owned: candidate.owned.filter((paragraph) => (paragraph.unitIndex ?? -1) > resumeUnitIndex),
        };
        if (window.owned.length === 0) continue;
        if (await cancelled()) return;
        await extractWindow(window, false);
        advanceProgress(ledger, window);
        await saveProgress(`window-${String(window.index).padStart(5, "0")}`);
      }
      if (ledger.coveredParagraphIds.length !== paragraphs.length) {
        throw new Error(
          `Coverage check failed: processed ${ledger.coveredParagraphIds.length} of ${paragraphs.length} paragraphs.`,
        );
      }
      ledger.phase = "repair";
      await saveProgress("extract-complete");
    }

    if (ledger.phase === "repair") {
      for (let round = ledger.diagnostics.repairRoundsRun + 1; round <= repairRounds; round += 1) {
        const missing = computeCoverage(ledger, paragraphs).missingAnnotationIds;
        if (missing.length === 0) break;
        log(`repair round ${round}: ${missing.length} story paragraphs without annotation.`);
        const repairWindows = buildRepairWindows(units, new Set(missing), windows.length + round * 10_000);
        for (const window of repairWindows) {
          if (await cancelled()) return;
          await extractWindow(window, true);
        }
        ledger.diagnostics.repairRoundsRun = round;
        await saveProgress(`repair-${round}`);
      }
      const stubbed = stubMissingAnnotations(ledger, paragraphs);
      if (stubbed > 0) warn(`${stubbed} story paragraphs received placeholder annotations after repair.`);
      ledger.coverage = computeCoverage(ledger, paragraphs);
      ledger.phase = "consolidate";
      await saveProgress("repair-complete");
    }

    if (ledger.phase === "consolidate") {
      await runConsolidation({
        ledger,
        paragraphs,
        chapters,
        log,
        onStep: async (step, cost) => {
          costUsd += cost;
          await saveProgress(`consolidate-${step}`);
        },
      });
      ledger.phase = "done";
      await saveProgress("consolidate-complete");
    }

    const currentBook = (await bookRef.get()).data();
    if (currentBook?.activeSourceId !== sourceId || currentBook?.canonical?.hash !== canonicalHash) {
      throw new Error("Canonical source changed before Book Model promotion.");
    }
    ledger.coverage ??= computeCoverage(ledger, paragraphs);
    await persistBookModel(bookId, ledger, paragraphs);
    const coverage = ledger.coverage;
    const warnings: string[] = [];
    if (coverage.filtered > 0) {
      warnings.push(
        `${coverage.filtered} of ${coverage.storyParagraphs} story paragraphs were flagged by the provider content filter and carry placeholder annotations: ${ledger.filteredParagraphIds.slice(0, 20).join(", ")}${coverage.filtered > 20 ? "…" : ""}`,
      );
    }
    if (coverage.stubbed > coverage.filtered) {
      warnings.push(
        `${coverage.stubbed - coverage.filtered} story paragraphs still lacked a model annotation after ${ledger.diagnostics.repairRoundsRun} repair rounds and carry placeholder annotations.`,
      );
    }
    const warning = warnings.length > 0 ? warnings.join(" ") : null;
    if (warning) warn(warning);
    log(
      `completed: ${ledger.entities.length} entities, ${ledger.events.length} events, ${coverage.annotatedByModel}/${coverage.storyParagraphs} paragraphs annotated by model, ${ledger.sceneRanges.length} scenes, ${ledger.diagnostics.modelCalls} model calls, $${costUsd.toFixed(4)}.`,
    );
    await jobRef.update({
      status: "completed",
      phase: "done",
      progress: { done: paragraphs.length, total: paragraphs.length },
      costUsd,
      model: lastModel,
      error: null,
      warning,
      coverage,
      filteredParagraphCount: ledger.filteredParagraphIds.length,
      filteredParagraphIds: ledger.filteredParagraphIds,
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
    const message = error instanceof Error ? error.message : "Unknown worker failure.";
    warn(`job ${jobId} failed: ${message}`);
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
