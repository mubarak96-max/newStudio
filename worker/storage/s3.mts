import { createHash, createHmac } from "node:crypto";

/**
 * Minimal S3 client: signed PUT and GET of single objects with AWS Signature
 * Version 4. The worker needs only these two calls, so it signs them directly
 * rather than pulling in the AWS SDK.
 */

const env = process.env;

export type S3Config = {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
};

export function s3Config(): S3Config {
  const { AWS_REGION: region, AWS_S3_BUCKET: bucket, AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey } = env;
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 is not configured: set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
  }
  return { region, bucket, accessKeyId, secretAccessKey, publicBaseUrl: env.CLOUDFRONT_BASE_URL?.replace(/\/+$/, "") || null };
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

/** RFC 3986 encoding per path segment, as SigV4 requires; slashes are kept. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

export function signRequest(
  config: S3Config,
  method: "GET" | "PUT",
  key: string,
  payloadHash: string,
  extraHeaders: Record<string, string>,
  now = new Date(),
): { url: string; headers: Record<string, string> } {
  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
  const path = `/${encodeKey(key)}`;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([name, value]) => [name.toLowerCase(), value.trim()])),
  };
  const names = Object.keys(headers).sort();
  const canonicalRequest = [
    method,
    path,
    "",
    ...names.map((name) => `${name}:${headers[name]}`),
    "",
    names.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, date), config.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  const { host: _host, ...sent } = headers;
  void _host;
  return {
    url: `https://${host}${path}`,
    headers: {
      ...sent,
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`,
    },
  };
}

export async function putObject(config: S3Config, key: string, body: Buffer, contentType: string): Promise<void> {
  const { url, headers } = signRequest(config, "PUT", key, sha256(body), {
    "content-type": contentType,
    "cache-control": "public, max-age=31536000, immutable",
  });
  const response = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body) });
  if (!response.ok) throw new Error(`S3 PUT ${key} failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
}

export async function getObject(config: S3Config, key: string): Promise<Buffer | null> {
  const { url, headers } = signRequest(config, "GET", key, sha256(""), {});
  const response = await fetch(url, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`S3 GET ${key} failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Studio displays assets through CloudFront when configured; otherwise the bucket URL. */
export function publicUrl(config: S3Config, key: string): string {
  return config.publicBaseUrl
    ? `${config.publicBaseUrl}/${encodeKey(key)}`
    : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${encodeKey(key)}`;
}
