import { z } from "zod";

export const snapshotSourceSchema = z.enum(["automatic", "immediate", "manual"]);
export type SnapshotSource = z.infer<typeof snapshotSourceSchema>;

export const canonicalFieldVersion = "canonical-v1";

export const snapshotSummarySchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  source: snapshotSourceSchema,
  fieldVersion: z.string().min(1),
  contentHash: z.string().min(1),
  recordCount: z.number().int().nonnegative(),
  validCount: z.number().int().nonnegative(),
  issueCount: z.number().int().nonnegative(),
});

export type SnapshotSummary = z.infer<typeof snapshotSummarySchema>;
