// Distinguishes an account-level batch restriction from a model- or request-specific one.
const key = process.env.GEMINI_API_KEY!;
async function probe(model: string, request: unknown) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchGenerateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        batch: {
          display_name: `probe-${Date.now()}`,
          input_config: {
            requests: { requests: [{ request, metadata: { key: "probe-1" } }] },
          },
        },
      }),
    },
  );
  const text = await response.text();
  console.log(model, response.status, text.slice(0, 400).replace(/\s+/g, " "));
  const name = (JSON.parse(text) as { name?: string }).name;
  // Cancel straight away: the probe only needs to know whether creation is allowed.
  if (name) {
    const cancel = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}:cancel`,
      { method: "POST", headers: { "x-goog-api-key": key } },
    );
    console.log("cancelled", name, cancel.status);
  }
}
await probe("gemini-3.6-flash", {
  contents: [{ parts: [{ text: "Say ok." }] }],
});
await probe(process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image", {
  contents: [{ parts: [{ text: "A small red apple on a white table." }] }],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: { aspectRatio: "1:1" },
  },
});
