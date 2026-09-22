// Asks a vision model whether each approved background contains people: `check-backgrounds.mts <bookId>`.
import { db, openRouterApiKey } from "../worker/config.mts";

const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const compositions = (await db.collection(`books/${bookId}/compositions`).get()).docs
  .map((d) => d.data())
  .filter((c) => c.sourceId === book.activeSourceId && c.canonicalHash === book.canonical.hash && (!process.argv[4] || process.argv.slice(4).includes(c.compositionId)));
let cost = 0;
const flagged: string[] = [];
for (const c of compositions) {
  const asset = (await db.doc(`books/${bookId}/visualAssets/layer__${c.compositionId}__background`).get()).data();
  const version = process.argv[3] === "latest" ? asset?.versions?.at(-1) : asset?.versions?.find((v: { versionId: string }) => v.versionId === asset.approvedVersionId);
  if (!version) {
    console.log(c.compositionId, "no approved background");
    continue;
  }
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openRouterApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'This is meant to be an empty scene background. Does it show any person, figure, face, hands or other human body part, even small, partial, in shadow or in a mirror? Return JSON {"people": boolean, "what": "short description or empty"}.',
            },
            { type: "image_url", image_url: { url: version.url } },
          ],
        },
      ],
    }),
  });
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[]; usage?: { cost?: number } };
  cost += payload.usage?.cost ?? 0;
  const verdict = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as { people?: boolean; what?: string };
  if (verdict.people) flagged.push(c.compositionId);
  console.log(c.compositionId, verdict.people ? "PEOPLE" : "empty", verdict.what ?? "");
}
console.log(`flagged ${flagged.length}/${compositions.length}: ${flagged.join(" ")}`);
console.log(`check cost $${cost.toFixed(4)}`);
process.exit(0);
