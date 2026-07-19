import { z } from "zod";

export const syncStateSchema = z.enum([
  "manual-only",
  "connected",
  "syncing",
  "synced",
  "login-required",
  "page-closed",
  "schema-changed",
  "failed",
]);

export type SyncState = z.infer<typeof syncStateSchema>;

export const freshnessSchema = z.enum(["fresh", "stale", "critical", "empty"]);
export type Freshness = z.infer<typeof freshnessSchema>;

export function getFreshness(lastSuccessAt: string | null, now = new Date()): Freshness {
  if (lastSuccessAt === null) return "empty";
  const age = now.getTime() - new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(age) || age >= 5 * 60_000) return "critical";
  if (age >= 2 * 60_000) return "stale";
  return "fresh";
}
