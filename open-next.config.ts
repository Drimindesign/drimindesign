import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/*
 * OpenNext for Cloudflare. Every route is prerendered at build time, so the cache is the
 * read-only static-assets cache: pages are served exactly as built, and a new deploy
 * refreshes them. No R2 bucket or KV namespace needed.
 *
 * When dynamic content arrives (appointment availability, revalidated data), switch to the
 * R2 incremental cache (docs/deploy-cloudflare.md, "Later: R2 cache").
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
