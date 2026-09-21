import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { db, openRouterModel, workerId, workerVersion } from "./config.mts";

export function isClaimable(data: Record<string, unknown>, staleLeaseMs: number): boolean {
  if (data.status === "queued_v3") return true;
  if (data.status !== "running_v3") return false;
  const heartbeat = data.heartbeatAt as { toMillis?: () => number } | undefined;
  const heartbeatMs = heartbeat?.toMillis?.() ?? 0;
  return Date.now() - heartbeatMs > staleLeaseMs;
}

/** Transactional claim so two workers never run the same job; a stale lease is taken over. */
export async function claimJob(
  jobRef: DocumentReference,
  staleLeaseMs: number,
  version: string = workerVersion,
): Promise<boolean> {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const data = snapshot.data();
    if (!snapshot.exists || !data || !isClaimable(data, staleLeaseMs)) return false;
    transaction.update(jobRef, {
      status: "running_v3",
      attempts: Number(data.attempts ?? 0) + 1,
      startedAt: FieldValue.serverTimestamp(),
      heartbeatAt: FieldValue.serverTimestamp(),
      leaseOwner: workerId,
      workerVersion: version,
      model: openRouterModel,
      error: null,
    });
    return true;
  });
}
