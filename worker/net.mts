/**
 * fetch with retries for transient failures: a dropped connection or DNS
 * hiccup (fetch throws), rate limiting (429) or a server error (5xx). Anything
 * else, including 4xx, is returned to the caller to handle.
 */
export async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
        await response.arrayBuffer().catch(() => undefined);
      } else {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** (attempt - 1)));
  }
  const cause = (lastError as { cause?: { message?: string; code?: string } } | undefined)?.cause;
  const detail = cause ? ` (${cause.code ?? ""} ${cause.message ?? ""})`.replace("( ", "(") : "";
  throw new Error(`Network request to ${new URL(url).host} failed after ${attempts} attempts${detail}.`);
}
