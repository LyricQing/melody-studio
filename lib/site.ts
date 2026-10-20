export const SITE_NAME =
  process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Melody Studio";

export const API_VERSION = "v1";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Client polling cadence. Generation itself can take several minutes. */
export const POLL_INTERVAL_MS = 3000;

/** Stop polling after 15 minutes; the upstream task keeps its own lifecycle. */
export const GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

export const WORKFLOW_URL =
  "https://www.runninghub.cn/workflow/2110715799911616513";

/** Per-provider opt-in sessionStorage key. Nothing is stored unless the visitor ticks "remember". */
export function keyStorageName(providerId: string): string {
  return `melody.key.${providerId}`;
}