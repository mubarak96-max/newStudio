const key = process.env.GEMINI_API_KEY!;
const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";
const r = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}`,
  { headers: { "x-goog-api-key": key } },
);
const body = (await r.json()) as Record<string, unknown>;
console.log(
  r.status,
  body.name ?? JSON.stringify(body).slice(0, 300),
  "methods:",
  JSON.stringify(body.supportedGenerationMethods ?? []),
);
