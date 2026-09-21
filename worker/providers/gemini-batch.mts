import { asNumber, asString, records } from "../coerce.mts";
import type { ImageReference } from "./images.mts";

/**
 * Gemini Batch API for images: requests go up as one JSONL file, the batch
 * runs asynchronously (usually within hours, at most 24h) at half the normal
 * price, and results come back as a JSONL file of `{key, response|error}`.
 */

const base = "https://generativelanguage.googleapis.com";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set. Add it to .env and restart the worker to use Gemini batches.");
  return key;
}

async function checked(response: Response, label: string): Promise<string> {
  const text = await response.text();
  if (!response.ok) throw new Error(`Gemini ${label} HTTP ${response.status}: ${text.slice(0, 500)}`);
  return text;
}

export type BatchRequest = {
  key: string;
  prompt: string;
  aspectRatio: string;
  references: ImageReference[];
};

/** One JSONL line: a generateContent request with the references before the prompt. */
export function batchLine(request: BatchRequest): string {
  return JSON.stringify({
    key: request.key,
    request: {
      contents: [
        {
          role: "user",
          parts: [
            ...request.references.map((reference) => ({
              inlineData: { mimeType: reference.contentType, data: reference.bytes.toString("base64") },
            })),
            { text: request.prompt },
          ],
        },
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: request.aspectRatio } },
    },
  });
}

async function uploadJsonl(body: Buffer, displayName: string): Promise<string> {
  const start = await fetch(`${base}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(body.length),
      "X-Goog-Upload-Header-Content-Type": "application/jsonl",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  await checked(start, "upload start");
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini upload start returned no upload URL.");
  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Length": String(body.length) },
    body: new Uint8Array(body),
  });
  const file = JSON.parse(await checked(finish, "upload")) as { file?: { name?: string } };
  if (!file.file?.name) throw new Error("Gemini upload returned no file name.");
  return file.file.name;
}

export async function submitBatch(model: string, requests: BatchRequest[], displayName: string): Promise<string> {
  const fileName = await uploadJsonl(Buffer.from(requests.map(batchLine).join("\n") + "\n", "utf8"), displayName);
  const response = await fetch(`${base}/v1beta/models/${model}:batchGenerateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ batch: { display_name: displayName, input_config: { file_name: fileName } } }),
  });
  const created = JSON.parse(await checked(response, "batch create")) as Record<string, unknown>;
  const metadata = (created.metadata ?? {}) as Record<string, unknown>;
  const name = asString(created.name) || asString(metadata.name);
  if (!name.startsWith("batches/")) throw new Error(`Gemini batch create returned no batch name: ${JSON.stringify(created).slice(0, 300)}`);
  return name;
}

export type BatchStatus = {
  /** Provider state, e.g. JOB_STATE_RUNNING or BATCH_STATE_RUNNING. */
  state: string;
  phase: "running" | "succeeded" | "failed";
  responsesFile: string | null;
  inlined: Record<string, unknown>[];
  error: string | null;
};

export async function getBatch(name: string): Promise<BatchStatus> {
  const response = await fetch(`${base}/v1beta/${name}`, { headers: { "x-goog-api-key": apiKey() } });
  const body = JSON.parse(await checked(response, "batch status")) as Record<string, unknown>;
  const metadata = (body.metadata ?? {}) as Record<string, unknown>;
  const result = (body.response ?? (metadata.output as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  const state = asString(metadata.state) || asString(body.state);
  const inlinedRaw = result.inlinedResponses;
  const inlined = Array.isArray(inlinedRaw)
    ? records(inlinedRaw)
    : records((inlinedRaw as Record<string, unknown> | undefined)?.inlinedResponses);
  const phase = /SUCCEEDED$/.test(state) ? "succeeded" : /(FAILED|CANCELLED|EXPIRED)$/.test(state) ? "failed" : "running";
  const error = body.error ? JSON.stringify(body.error).slice(0, 500) : phase === "failed" ? `Batch ended in state ${state}.` : null;
  return { state, phase, responsesFile: asString(result.responsesFile) || null, inlined, error };
}

export async function downloadResults(fileName: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${base}/download/v1beta/${fileName}:download?alt=media`, {
    headers: { "x-goog-api-key": apiKey() },
  });
  return (await checked(response, "results download"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export type BatchImageResult =
  | { key: string; ok: true; bytes: Buffer; contentType: string; promptTokens: number; outputTokens: number }
  | { key: string; ok: false; error: string };

/** One result line (file) or inlined response, reduced to its image or its error. */
export function readBatchResult(line: Record<string, unknown>): BatchImageResult {
  const metadata = (line.metadata ?? {}) as Record<string, unknown>;
  const key = asString(line.key) || asString(metadata.key);
  if (line.error) return { key, ok: false, error: JSON.stringify(line.error).slice(0, 500) };
  const response = (line.response ?? {}) as Record<string, unknown>;
  const candidate = records(response.candidates)[0];
  const parts = records((candidate?.content as Record<string, unknown> | undefined)?.parts);
  const image = parts
    .map((part) => (part.inlineData ?? part.inline_data) as Record<string, unknown> | undefined)
    .find((data) => data && asString(data.mimeType ?? data.mime_type).startsWith("image/"));
  if (!image) {
    const reason = asString(candidate?.finishReason) || "no image in the response";
    const text = parts.map((part) => asString(part.text)).join(" ").slice(0, 200);
    return { key, ok: false, error: `Gemini returned no image (${reason})${text ? `: ${text}` : ""}` };
  }
  const usage = (response.usageMetadata ?? {}) as Record<string, unknown>;
  return {
    key,
    ok: true,
    bytes: Buffer.from(asString(image.data), "base64"),
    contentType: asString(image.mimeType ?? image.mime_type) || "image/png",
    promptTokens: asNumber(usage.promptTokenCount),
    outputTokens: asNumber(usage.candidatesTokenCount),
  };
}
