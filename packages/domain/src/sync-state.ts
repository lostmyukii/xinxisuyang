import { z } from "zod";
import type { FreshnessSettings } from "./settings.js";
import { defaultFreshnessSettings } from "./settings.js";

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

export function getFreshness(
  lastSuccessAt: string | null,
  now = new Date(),
  settings: FreshnessSettings = defaultFreshnessSettings,
): Freshness {
  if (lastSuccessAt === null) return "empty";
  const age = now.getTime() - new Date(lastSuccessAt).getTime();
  if (!Number.isFinite(age) || age >= settings.criticalAfterSeconds * 1_000) return "critical";
  if (age >= settings.staleAfterSeconds * 1_000) return "stale";
  return "fresh";
}
