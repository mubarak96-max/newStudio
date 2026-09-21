// Read-only check that S3 request signing is accepted: GET a key that does not exist.
import { signRequest, s3Config } from "../worker/storage/s3.mts";
import { createHash } from "node:crypto";

const config = s3Config();
const { url, headers } = signRequest(config, "GET", `healthcheck/does-not-exist-${Date.now()}.txt`, createHash("sha256").update("").digest("hex"), {});
const response = await fetch(url, { headers });
const body = await response.text();
console.log(response.status, (/<Code>([^<]+)<\/Code>/.exec(body) ?? [])[1] ?? "");
console.log("cloudfront configured:", Boolean(config.publicBaseUrl));
