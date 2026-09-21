import { openRouterApiKey } from "../config.mts";
import { asNumber, asString, records } from "../coerce.mts";

export type ImageReference = { contentType: string; bytes: Buffer };

export type GeneratedImage = {
  bytes: Buffer;
  contentType: string;
  costUsd: number;
  model: string;
};

export type ImageRequest = {
  model: string;
  prompt: string;
  aspectRatio: string;
  references: ImageReference[];
  label: string;
};

/**
 * One image through OpenRouter's Image API. Reference images travel as data
 * URLs, so pinned references never need to be publicly reachable.
 */
export async function generateImage(request: ImageRequest): Promise<GeneratedImage> {
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${openRouterApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      n: 1,
      resolution: "1K",
      aspect_ratio: request.aspectRatio,
      ...(request.references.length > 0
        ? {
            input_references: request.references.map((reference) => ({
              type: "image_url",
              image_url: { url: `data:${reference.contentType};base64,${reference.bytes.toString("base64")}` },
            })),
          }
        : {}),
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Image API HTTP ${response.status} (${request.label}): ${text.slice(0, 500)}`);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Image API returned invalid JSON (${request.label}): ${text.slice(0, 200)}`);
  }
  const image = records(payload.data)[0];
  const base64 = asString(image?.b64_json);
  if (!base64) throw new Error(`Image API returned no image (${request.label}): ${text.slice(0, 300)}`);
  const usage = payload.usage && typeof payload.usage === "object" ? (payload.usage as Record<string, unknown>) : {};
  return {
    bytes: Buffer.from(base64, "base64"),
    contentType: asString(image?.media_type) || "image/png",
    costUsd: asNumber(usage.cost),
    model: request.model,
  };
}
