export interface Bindings {
  DB: D1Database;
  /** Image storage: R2 when bound, otherwise Workers KV (no payment method needed). */
  MEDIA?: R2Bucket;
  MEDIA_KV?: KVNamespace;
  TMDB_API_KEY?: string;
  /** Cloudflare Workers AI, for filling translation gaps (free daily allowance). */
  AI?: Ai;
  /** The deployed version, so the catalog's ETag changes with every deploy. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  ADMIN_PASSWORD?: string;
  DEV_AUTH_BYPASS?: string;
}

export type AppEnv = { Bindings: Bindings; Variables: { adminEmail: string } };
