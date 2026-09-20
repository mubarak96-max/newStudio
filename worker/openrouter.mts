import { openRouterApiKey, openRouterMaxTokens } from "./config.mts";
import { asNumber } from "./coerce.mts";

export type ModelErrorCode =
  | "CONTENT_FILTER"
  | "LENGTH_TRUNCATION"
  | "INCOMPLETE_RESPONSE"
  | "INVALID_JSON"
  | "HTTP"
  | "EMPTY";

export class ModelCallError extends Error {
  code: ModelErrorCode;
  constructor(message: string, code: ModelErrorCode) {
    super(message);
    this.code = code;
  }
}

export function isContentFilterError(error: unknown): boolean {
  return error instanceof ModelCallError && error.code === "CONTENT_FILTER";
}

export function isLengthTruncation(error: unknown): boolean {
  return error instanceof ModelCallError && error.code === "LENGTH_TRUNCATION";
}

export type JsonCall = {
  system: string;
  user: string;
  models: string[];
  label: string;
  maxTokens?: number;
};

export type JsonCallResult = { parsed: unknown; cost: number; model: string };

const contentFilterPatterns =
  /content[_-]?filter|moderation|safety|policy|refusal|refused|inappropriate/i;

function filterError(model: string, label: string): ModelCallError {
  return new ModelCallError(
    `OpenRouter content filter: ${model} (${label}).`,
    "CONTENT_FILTER",
  );
}

async function callOnce(call: JsonCall, model: string): Promise<JsonCallResult> {
  const maxTokens = call.maxTokens ?? openRouterMaxTokens;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      provider: { allow_fallbacks: true },
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: call.user },
      ],
    }),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    if (
      [400, 403, 422].includes(response.status) &&
      contentFilterPatterns.test(bodyText)
    ) {
      throw filterError(model, call.label);
    }
    throw new ModelCallError(
      `OpenRouter HTTP ${response.status}: ${bodyText.slice(0, 500)}`,
      "HTTP",
    );
  }
  const payload = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[];
    model?: string;
    usage?: { cost?: number };
  };
  const cost = asNumber(payload.usage?.cost);
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    throw filterError(model, call.label);
  }
  const content = choice?.message?.content;
  if (!content) {
    if (contentFilterPatterns.test(JSON.stringify(payload))) {
      throw filterError(model, call.label);
    }
    throw new ModelCallError("OpenRouter returned no message content.", "EMPTY");
  }
  const trimmed = content.trim();
  if (
    !trimmed.startsWith("{") &&
    trimmed.length < 500 &&
    contentFilterPatterns.test(trimmed)
  ) {
    throw filterError(model, call.label);
  }
  if (choice?.finish_reason && choice.finish_reason !== "stop") {
    throw new ModelCallError(
      `OpenRouter response incomplete: ${choice.finish_reason} (${call.label}, max_tokens ${maxTokens}).`,
      choice.finish_reason === "length"
        ? "LENGTH_TRUNCATION"
        : "INCOMPLETE_RESPONSE",
    );
  }
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return { parsed: JSON.parse(cleaned), cost, model: payload.model ?? model };
  } catch (error) {
    throw new ModelCallError(
      `Invalid structured AI response: ${error instanceof Error ? error.message : "Invalid JSON."}`,
      "INVALID_JSON",
    );
  }
}

/**
 * Tries each model in turn, twice each. A content filter on one model moves
 * straight to the next; truncation is never retried here because the caller
 * fixes it by splitting the window.
 */
export async function callJsonModel(call: JsonCall): Promise<JsonCallResult> {
  let lastError: unknown;
  let sawContentFilter = false;
  for (const model of call.models) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await callOnce(call, model);
      } catch (error) {
        lastError = error;
        if (isContentFilterError(error)) {
          sawContentFilter = true;
          break;
        }
        if (isLengthTruncation(error)) throw error;
        if (attempt < 2)
          await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
  }
  if (sawContentFilter && !isContentFilterError(lastError)) {
    throw filterError(call.models.join(" -> "), call.label);
  }
  throw lastError instanceof Error ? lastError : new Error("AI request failed.");
}
