import { Redis } from "@upstash/redis";

// Vercel's native "KV" product has been retired in favor of Marketplace
// integrations (Upstash, primarily). Depending on how the integration was
// connected, the env vars may show up under either naming scheme, so both
// are checked here.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error(
    "Missing Upstash Redis environment variables. Connect an Upstash database to this " +
      "project in the Vercel dashboard (Storage tab -> Marketplace Database Providers -> Upstash)."
  );
}

export const kv = new Redis({ url, token });
